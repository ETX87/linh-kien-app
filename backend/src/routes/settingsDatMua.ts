import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { requireQuanLyDanhMucLk } from "../middleware/requireQuanLyDanhMucLk";
import { uploadPublicImage } from "../lib/googleDrive";
import { encryptSecret } from "../lib/secretBox";
import { computeAndStoreHash, getOrComputeHash } from "../lib/contentHash";
import { nowVN } from "../lib/vnTime";
import { resyncKhuVucDerivedFieldsForAll } from "../lib/khuVucSync";

// Port rut gon tu backend/src/routes/settings.ts cua he DVBH goc - CHI giu 4 khoi thuc su can cho
// mien nghiep vu "Dat mua linh kien" (xem CLAUDE.md muc "Nguon goc tach he thong"): danh muc linh
// kien (bang linh_kien - o he nay KHONG con chung voi module "giai trinh", la ban sao doc lap), Google
// Drive OAuth (uy quyen 1 tai khoan that de upload anh minh hoa linh kien), Ly do cham, Loai de xuat.
// Danh sach KTV (ktv_lien_he) nam o file rieng settingsKtv.ts. BO so voi he goc: settings_audit_log
// (khong can audit trail cho 1 he nho), "/linh-kien/sync-sheet" (khong co Google Sheet nguon o he
// nay - danh muc quan ly thang qua form + upload anh).

const settingsDatMua = new Hono<{ Bindings: Env }>();
settingsDatMua.use("*", verifySessionMiddleware, loadUser);
const adminOnly = requireRole("Admin");
const linhKienWriteRoles = requireQuanLyDanhMucLk;

async function refreshHash(db: D1Database, tenBang: string, table: string, orderBy: string) {
  const { results } = await db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
  await computeAndStoreHash(db, tenBang, results);
}

// ---------- Linh kien (danh muc rieng cua he nay) ----------

settingsDatMua.get("/linh-kien", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM linh_kien ORDER BY ma_linh_kien").all();
  return c.json({ rows: results });
});

settingsDatMua.get("/linh-kien/version", async (c) => {
  const hash = await getOrComputeHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ hash });
});

settingsDatMua.post("/linh-kien", linhKienWriteRoles, async (c) => {
  const body = await c.req.json<{
    ma_linh_kien: string; ten_linh_kien: string; gia_ban?: number; gia_tham_chieu?: number;
    don_vi?: string; ghi_chu?: string; anh_demo?: string; dac_thu?: boolean; chi_sua_chua?: boolean;
    // "Phân loại đặc thù" (them 2026-08-25) - listdown tu do (dung y het "don_vi"), chi co y nghia khi
    // dac_thu=true, frontend tu an o nhap khi chua tick dac_thu.
    phan_loai_dac_thu?: string;
    // "Giá trị công nợ" (them 04/09/2026, xem migration 0017) - noi bo, dung tinh Cong no thuc te
    // KTV/cong no tam tinh don moi (lib/congNoKtv.ts), KHONG dong bo DVBH/suachua.
    gia_tri_cong_no?: number;
  }>();
  if (!body.ma_linh_kien?.trim() || !body.ten_linh_kien?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, gia_tham_chieu, don_vi, ghi_chu, anh_demo, dac_thu, chi_sua_chua, phan_loai_dac_thu, gia_tri_cong_no, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      body.ma_linh_kien.trim(), body.ten_linh_kien.trim(), body.gia_ban ?? null, body.gia_tham_chieu ?? null,
      body.don_vi?.trim() || null, body.ghi_chu?.trim() || null, body.anh_demo?.trim() || null,
      body.dac_thu ? 1 : 0, body.chi_sua_chua ? 1 : 0, body.dac_thu ? body.phan_loai_dac_thu?.trim() || null : null,
      body.gia_tri_cong_no ?? null,
      user.email, nowVN(),
    )
    .first();

  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json(row, 201);
});

settingsDatMua.patch("/linh-kien/:ma", linhKienWriteRoles, async (c) => {
  const ma = c.req.param("ma");
  if (!ma) return c.json({ error: "INVALID_PARAM" }, 400);
  const body = await c.req.json<{
    ten_linh_kien?: string; bat_tat?: boolean; gia_ban?: number; gia_tham_chieu?: number; don_vi?: string; ghi_chu?: string;
    anh_demo?: string; dac_thu?: boolean; chi_sua_chua?: boolean; phan_loai_dac_thu?: string;
  }>();
  const existing = await c.env.DB.prepare("SELECT * FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const user = c.get("user");
  const dacThuNext = body.dac_thu !== undefined ? (body.dac_thu ? 1 : 0) : existing.dac_thu;
  const next = {
    ten_linh_kien: body.ten_linh_kien !== undefined ? body.ten_linh_kien.trim() || existing.ten_linh_kien : existing.ten_linh_kien,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    gia_ban: body.gia_ban !== undefined ? body.gia_ban : existing.gia_ban,
    gia_tham_chieu: body.gia_tham_chieu !== undefined ? body.gia_tham_chieu : existing.gia_tham_chieu,
    don_vi: body.don_vi !== undefined ? body.don_vi?.trim() || null : existing.don_vi,
    ghi_chu: body.ghi_chu !== undefined ? body.ghi_chu?.trim() || null : existing.ghi_chu,
    anh_demo: body.anh_demo !== undefined ? body.anh_demo?.trim() || null : existing.anh_demo,
    dac_thu: dacThuNext,
    chi_sua_chua: body.chi_sua_chua !== undefined ? (body.chi_sua_chua ? 1 : 0) : existing.chi_sua_chua,
    // "Phân loại đặc thù" chi giu gia tri khi dac_thu (sau khi ap gia tri moi) van true - bo tick
    // "Linh kien dac thu" thi xoa luon phan loai di kem, tranh du lieu "mo côi" khong con y nghia.
    phan_loai_dac_thu: !dacThuNext ? null : body.phan_loai_dac_thu !== undefined ? body.phan_loai_dac_thu?.trim() || null : existing.phan_loai_dac_thu,
  };
  await c.env.DB.prepare(
    "UPDATE linh_kien SET ten_linh_kien = ?, bat_tat = ?, gia_ban = ?, gia_tham_chieu = ?, don_vi = ?, ghi_chu = ?, anh_demo = ?, dac_thu = ?, chi_sua_chua = ?, phan_loai_dac_thu = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?",
  )
    .bind(next.ten_linh_kien, next.bat_tat, next.gia_ban, next.gia_tham_chieu, next.don_vi, next.ghi_chu, next.anh_demo, next.dac_thu, next.chi_sua_chua, next.phan_loai_dac_thu, user.email, nowVN(), ma)
    .run();

  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ ok: true });
});

// PATCH /linh-kien/:ma/gia-tri-cong-no - { gia_tri_cong_no: number|null } - route RIENG (khong dung
// chung PATCH /linh-kien/:ma o tren) vi truong nay CO CHU DICH KHONG dong cham ngay_cap_nhat/
// nguoi_cap_nhat - theo yeu cau nguoi dung "cột này nội bộ app linh kiện, khi chỉnh sửa thay đổi
// không cần báo API cho các hệ thống liên kết" (dvbhSyncClient.ts coi ngay_cap_nhat > con tro la "co
// thay doi can day sang DVBH/suachua" - sua truong nay KHONG duoc lam dong linh_kien do bi coi la
// "thay doi" o lan dong bo ke tiep). VAN goi refreshHash() - do la content-hash CUC BO cua chinh app
// nay (xem lib/contentHash.ts, dung boi fetchWithHashCache o frontend de biet luc nao can tai lai
// danh muc) - KHAC HOAN TOAN voi ngay_cap_nhat/dvbh sync, bo qua se lam frontend ket qua cu vinh
// vien (IndexedDB cache khong bao gio thay doi vi hash server khong doi).
settingsDatMua.patch("/linh-kien/:ma/gia-tri-cong-no", linhKienWriteRoles, async (c) => {
  const ma = c.req.param("ma");
  if (!ma) return c.json({ error: "INVALID_PARAM" }, 400);
  const body = await c.req.json<{ gia_tri_cong_no: number | null }>();
  const result = await c.env.DB.prepare("UPDATE linh_kien SET gia_tri_cong_no = ? WHERE ma_linh_kien = ?")
    .bind(body.gia_tri_cong_no ?? null, ma)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND" }, 404);
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ ok: true });
});

settingsDatMua.post("/linh-kien/:ma/anh", linhKienWriteRoles, async (c) => {
  const ma = c.req.param("ma");
  const existing = await c.env.DB.prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const contentType = c.req.header("Content-Type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return c.json({ error: "INVALID_CONTENT_TYPE" }, 400);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);

  const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const filename = `linh-kien-${ma}-${Date.now()}.${ext}`;
  let uploaded: { id: string; thumbnailUrl: string };
  try {
    uploaded = await uploadPublicImage(c.env, c.env.DB, bytes, contentType, filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("GOOGLE_DRIVE_NOT_CONNECTED")) {
      return c.json({ error: "GOOGLE_DRIVE_NOT_CONNECTED", message: "Chưa kết nối tài khoản Google Drive - vào Cài đặt để kết nối." }, 400);
    }
    return c.json({ error: "UPLOAD_FAILED", message }, 502);
  }

  const user = c.get("user");
  await c.env.DB.prepare("UPDATE linh_kien SET anh_demo = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?")
    .bind(uploaded.thumbnailUrl, user.email, nowVN(), ma)
    .run();
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ ok: true, url: uploaded.thumbnailUrl });
});

// POST /api/settings/linh-kien/bulk-import-anh - { rows: [{ma_linh_kien, source_url}], offset } - 1
// chunk 10 dong/lan (client tu lap goi den done:true), dung khi nhap hang loat "anh demo" tu file
// Excel co san. Loi tung dong khong lam hong ca chunk.
settingsDatMua.post("/linh-kien/bulk-import-anh", linhKienWriteRoles, async (c) => {
  const body = await c.req.json<{ rows: { ma_linh_kien: string; source_url: string }[]; offset: number }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const CHUNK_SIZE = 10;
  const offset = Math.max(0, body.offset ?? 0);
  const chunk = body.rows.slice(offset, offset + CHUNK_SIZE);
  const user = c.get("user");
  const now = nowVN();

  let success = 0;
  let notFound = 0;
  let fetchFailed = 0;
  let errorCount = 0;
  const details: { ma_linh_kien: string; status: string }[] = [];

  for (const row of chunk) {
    const ma = row.ma_linh_kien?.trim();
    const sourceUrl = row.source_url?.trim();
    if (!ma || !sourceUrl) {
      errorCount++;
      details.push({ ma_linh_kien: ma || "(rỗng)", status: "loi" });
      continue;
    }
    const exists = await c.env.DB.prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
    if (!exists) {
      notFound++;
      details.push({ ma_linh_kien: ma, status: "khong_tim_thay" });
      continue;
    }
    try {
      const imgRes = await fetch(sourceUrl);
      if (!imgRes.ok) throw new Error(`fetch ${imgRes.status}`);
      const bytes = await imgRes.arrayBuffer();
      const contentType = imgRes.headers.get("Content-Type") || "image/jpeg";
      const uploaded = await uploadPublicImage(c.env, c.env.DB, bytes, contentType, `linh-kien-${ma}-${Date.now()}.jpg`);
      await c.env.DB.prepare("UPDATE linh_kien SET anh_demo = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?")
        .bind(uploaded.thumbnailUrl, user.email, now, ma)
        .run();
      success++;
      details.push({ ma_linh_kien: ma, status: "thanh_cong" });
    } catch {
      fetchFailed++;
      details.push({ ma_linh_kien: ma, status: "tai_anh_that_bai" });
    }
  }

  const nextOffset = offset + CHUNK_SIZE;
  const done = nextOffset >= body.rows.length;
  if (done) await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ done, nextOffset, success, notFound, fetchFailed, errorCount, details });
});

// POST /api/settings/linh-kien/bulk-import - { rows: [{ma_linh_kien, ten_linh_kien?, gia_ban?,
// gia_tham_chieu?, don_vi?, ghi_chu?, dac_thu?, chi_sua_chua?, anh_url?, phan_loai_dac_thu?,
// gia_tri_cong_no?}], isLast? } - nhap/cap nhat HANG LOAT ca dong danh muc - dung khi mang danh sach
// linh kien tu he khac sang (vd he bao hanh goc) qua file Excel/CSV. UPSERT theo ma_linh_kien (ON
// CONFLICT DO UPDATE) - chay lai nhieu lan an toan, KHONG dong vao bat_tat (giu trang thai an/hien
// da chinh tay truoc do). Frontend tu chia "rows" thanh tung lo (chunk) TRUOC khi goi - moi request
// CHI mang dung 1 lo, xu ly HET tất ca dong nhan duoc (khong tu chia nho them o day).
//
// FIX #1 (phan hoi 2026-09-04: "tốc độ import rất chậm") - TRUOC DAY frontend gui NGUYEN CA MANG
// "rows" (toan bo file) O MOI LAN goi, kem "offset" de backend tu cat 10 dong/lan roi lap lai - da doi
// sang frontend tu cat lo (xem handleBulkImportCatalog), moi request chi gui 1 lo.
//
// FIX #2 (phan hoi tiep theo: "test lại tốc độ còn chậm hơn ban đầu") - FIX #1 KHONG du, vi nguyen
// nhan CHINH khong phai o kich thuoc payload ma o SO LAN GOI D1: vong for cu await TUNG dong 1 (moi
// .prepare().bind().run() la 1 round-trip rieng toi D1, ~vai chuc ms/lan du ban than cau lenh rat
// don gian) - 1 lo 25 dong = 25 round-trip TUAN TU + 1 round-trip SELECT ton tai = 26 lan cho D1/lo,
// CHUA KE FIX #1 lam CHUNK tang tu 10 len 25 (van giu nguyen so dong/giay nhung it request HTTP hon -
// khong sai nhung khong cham vao nguyen nhan that). Doi sang dung D1Database.batch(): gom TOAN BO cau
// lenh INSERT cua ca lo thanh 1 mang, gui bang 1 LAN GOI DUY NHAT (D1 tu chay tuan tu trong 1
// transaction o phia server, khong qua lai network nhieu lan) - giam tu ~26 round-trip/lo xuong con 2
// (1 SELECT ton tai + 1 batch INSERT). Danh doi: batch() la all-or-nothing (1 dong loi se rollback CA
// LO) - da co fallback: neu batch() nem loi, chay lai lo do THEO TUNG DONG (cach cu) de van cach ly
// dung dong loi thay vi mat ca lo, chi cham hon o truong hop hiem gap loi thuc su (khong phai duong
// di thuong).
settingsDatMua.post("/linh-kien/bulk-import", linhKienWriteRoles, async (c) => {
  const body = await c.req.json<{
    rows: {
      ma_linh_kien: string; ten_linh_kien?: string; gia_ban?: number; gia_tham_chieu?: number;
      don_vi?: string; ghi_chu?: string; dac_thu?: boolean; chi_sua_chua?: boolean; anh_url?: string;
      phan_loai_dac_thu?: string; gia_tri_cong_no?: number;
    }[];
    isLast?: boolean;
  }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const chunk = body.rows;
  const user = c.get("user");
  const now = nowVN();

  let success = 0;
  let errorCount = 0;
  const details: { ma_linh_kien: string; status: string }[] = [];

  // Doc san 3 cot NOT NULL (ten_linh_kien, dac_thu, chi_sua_chua) cua cac ma DA CO trong chunk - CAN
  // THIET vi SQLite kiem tra rang buoc NOT NULL ngay tren "VALUES" cua INSERT du dang dung UPSERT (da
  // xac minh truc tiep: ON CONFLICT DO UPDATE SET x = COALESCE(excluded.x, table.x) VAN bao loi NOT
  // NULL neu excluded.x = NULL, COALESCE trong SET khong "cuu" duoc vi rang buoc bi kiem tra TRUOC khi
  // conflict resolution ap dung nhanh UPDATE) - khac hoan toan voi cong_no o ktv_lien_he/bulk-import
  // (cot đó nullable nen khong dinh loi nay). Vi vay 3 cot nay PHAI duoc "giu nguyen" bang cach tu doc
  // gia tri cu roi bind THANG gia tri that (khong con NULL) - khong the dua het cho COALESCE trong SQL.
  const masInChunk = [...new Set(chunk.map((r) => r.ma_linh_kien?.trim()).filter((m): m is string => !!m))];
  const existingMap = new Map<string, { ten_linh_kien: string; dac_thu: number; chi_sua_chua: number }>();
  if (masInChunk.length > 0) {
    const { results } = await c.env.DB.prepare(
      `SELECT ma_linh_kien, ten_linh_kien, dac_thu, chi_sua_chua FROM linh_kien WHERE ma_linh_kien IN (${masInChunk.map(() => "?").join(",")})`,
    )
      .bind(...masInChunk)
      .all<{ ma_linh_kien: string; ten_linh_kien: string; dac_thu: number; chi_sua_chua: number }>();
    for (const r of results) existingMap.set(r.ma_linh_kien, r);
  }

  const UPSERT_SQL = `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, gia_tham_chieu, don_vi, ghi_chu, anh_demo, dac_thu, chi_sua_chua, phan_loai_dac_thu, gia_tri_cong_no, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ma_linh_kien) DO UPDATE SET
       ten_linh_kien = excluded.ten_linh_kien,
       gia_ban = COALESCE(excluded.gia_ban, linh_kien.gia_ban),
       gia_tham_chieu = COALESCE(excluded.gia_tham_chieu, linh_kien.gia_tham_chieu),
       don_vi = COALESCE(excluded.don_vi, linh_kien.don_vi),
       ghi_chu = COALESCE(excluded.ghi_chu, linh_kien.ghi_chu),
       anh_demo = COALESCE(excluded.anh_demo, linh_kien.anh_demo),
       dac_thu = excluded.dac_thu,
       chi_sua_chua = excluded.chi_sua_chua,
       phan_loai_dac_thu = COALESCE(excluded.phan_loai_dac_thu, linh_kien.phan_loai_dac_thu),
       gia_tri_cong_no = COALESCE(excluded.gia_tri_cong_no, linh_kien.gia_tri_cong_no),
       nguoi_cap_nhat = excluded.nguoi_cap_nhat,
       ngay_cap_nhat = excluded.ngay_cap_nhat`;

  const statements: D1PreparedStatement[] = [];
  const rowMetas: { ma: string; anhLoi: boolean }[] = [];

  for (const row of chunk) {
    const ma = row.ma_linh_kien?.trim();
    if (!ma) {
      errorCount++;
      details.push({ ma_linh_kien: "(rỗng)", status: "thieu_ma" });
      continue;
    }
    const existingRow = existingMap.get(ma);
    const tenMoi = row.ten_linh_kien?.trim() || null;
    if (!tenMoi && !existingRow) {
      errorCount++;
      details.push({ ma_linh_kien: ma, status: "ma_moi_thieu_ten" });
      continue;
    }
    const ten = tenMoi ?? existingRow!.ten_linh_kien;

    let anhDemo: string | null = null;
    let anhLoi = false;
    const anhUrl = row.anh_url?.trim();
    if (anhUrl) {
      try {
        const imgRes = await fetch(anhUrl);
        if (!imgRes.ok) throw new Error(`fetch ${imgRes.status}`);
        const bytes = await imgRes.arrayBuffer();
        const contentType = imgRes.headers.get("Content-Type") || "image/jpeg";
        const uploaded = await uploadPublicImage(c.env, c.env.DB, bytes, contentType, `linh-kien-${ma}-${Date.now()}.jpg`);
        anhDemo = uploaded.thumbnailUrl;
      } catch {
        anhLoi = true;
      }
    }

    // dac_thu/chi_sua_chua la NOT NULL DEFAULT 0 - cung ly do nhu ten_linh_kien o tren, khong the bind
    // NULL roi cho COALESCE trong SET "cuu" - dong nao khong truyen thi lay lai gia tri cu (ma da co)
    // hoac mac dinh 0 (ma moi).
    const dacThuVal = row.dac_thu !== undefined ? (row.dac_thu ? 1 : 0) : (existingRow?.dac_thu ?? 0);
    const chiSuaChuaVal = row.chi_sua_chua !== undefined ? (row.chi_sua_chua ? 1 : 0) : (existingRow?.chi_sua_chua ?? 0);

    statements.push(
      c.env.DB.prepare(UPSERT_SQL).bind(
        ma, ten, row.gia_ban ?? null, row.gia_tham_chieu ?? null, row.don_vi?.trim() || null, row.ghi_chu?.trim() || null,
        anhDemo, dacThuVal, chiSuaChuaVal,
        row.phan_loai_dac_thu?.trim() || null, row.gia_tri_cong_no ?? null,
        user.email, now,
      ),
    );
    rowMetas.push({ ma, anhLoi });
  }

  if (statements.length > 0) {
    try {
      await c.env.DB.batch(statements);
      for (const meta of rowMetas) {
        success++;
        details.push({ ma_linh_kien: meta.ma, status: meta.anhLoi ? "thanh_cong_loi_anh" : "thanh_cong" });
      }
    } catch {
      // batch() la all-or-nothing - neu that bai, chay lai TUNG dong (cach cu) de cach ly dung dong
      // loi thay vi mat trang ca lo chi vi 1 dong.
      for (let i = 0; i < statements.length; i++) {
        try {
          await statements[i].run();
          success++;
          details.push({ ma_linh_kien: rowMetas[i].ma, status: rowMetas[i].anhLoi ? "thanh_cong_loi_anh" : "thanh_cong" });
        } catch {
          errorCount++;
          details.push({ ma_linh_kien: rowMetas[i].ma, status: "loi_ghi_db" });
        }
      }
    }
  }

  if (body.isLast) await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ success, errorCount, details });
});

// ---------- Google Drive OAuth (uy quyen 1 tai khoan Google THAT de upload anh linh kien) ----------
// Port nguyen ban tu he goc - Service Account (GOOGLE_DRIVE_SA_*, dung cho anh bien ban/bang chung
// chuyen tien cua module chinh) khong co storage quota rieng nen KHONG dung duoc cho tinh nang nay -
// xem lib/googleDrive.ts uploadPublicImage() + ghi chu chi tiet trong do.
const GOOGLE_DRIVE_STATE_COOKIE = "dat_mua_lk_drive_oauth_state";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";

settingsDatMua.get("/google-drive/status", adminOnly, async (c) => {
  const row = await c.env.DB.prepare("SELECT google_email, folder_id, authorized_by, authorized_at FROM google_drive_oauth WHERE id = 1").first<{
    google_email: string; folder_id: string; authorized_by: string; authorized_at: string;
  }>();
  if (!row) return c.json({ connected: false });
  return c.json({ connected: true, ...row });
});

settingsDatMua.get("/google-drive/authorize", adminOnly, async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, GOOGLE_DRIVE_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/" });

  const redirectUri = `${new URL(c.req.url).origin}/api/settings/google-drive/callback`;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPE,
    state,
    access_type: "offline",
    prompt: "consent select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

settingsDatMua.get("/google-drive/callback", adminOnly, async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(c, GOOGLE_DRIVE_STATE_COOKIE);
  deleteCookie(c, GOOGLE_DRIVE_STATE_COOKIE, { path: "/" });

  if (!code || !state || !savedState || state !== savedState) {
    return c.text("Xac thuc that bai: state khong hop le.", 400);
  }

  const redirectUri = `${url.origin}/api/settings/google-drive/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("Khong the doi ma xac thuc voi Google: " + (await tokenRes.text()), 502);
  const tokenJson = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
  if (!tokenJson.refresh_token) {
    return c.text(
      "Google khong tra ve refresh_token (co the tai khoan da tung uy quyen truoc do) - vao myaccount.google.com/permissions, go quyen truy cap cua app nay roi thu lai.",
      400,
    );
  }

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userInfoRes.ok) return c.text("Khong the lay thong tin nguoi dung tu Google.", 502);
  const userInfo = (await userInfoRes.json()) as { email: string };

  const folderRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Dat mua linh kien - Anh linh kien", mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!folderRes.ok) return c.text("Khong the tao folder Drive: " + (await folderRes.text()), 502);
  const { id: folderId } = (await folderRes.json()) as { id: string };

  const refreshTokenEnc = await encryptSecret(c.env, tokenJson.refresh_token);
  const user = c.get("user");
  await c.env.DB.prepare(
    `INSERT INTO google_drive_oauth (id, google_email, refresh_token_enc, folder_id, authorized_by, authorized_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc,
       folder_id = excluded.folder_id, authorized_by = excluded.authorized_by, authorized_at = excluded.authorized_at`,
  )
    .bind(userInfo.email, refreshTokenEnc, folderId, user.email, nowVN())
    .run();

  return c.redirect(c.env.FRONTEND_URL || "/");
});

// ---------- Ly do cham ----------

settingsDatMua.get("/ly-do-cham", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_ly_do_cham ORDER BY stt, id").all();
  return c.json({ rows: results });
});

settingsDatMua.post("/ly-do-cham", adminOnly, async (c) => {
  const body = await c.req.json<{ ten_ly_do: string; he_thong_su_dung: string; quan_ly_don_thieu_linh_kien?: boolean; bat_tat?: boolean; stt?: number }>();
  if (!body.ten_ly_do?.trim()) return c.json({ error: "MISSING_TEN_LY_DO" }, 400);
  if (!body.he_thong_su_dung?.trim()) return c.json({ error: "MISSING_HE_THONG_SU_DUNG" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO settings_ly_do_cham (ten_ly_do, he_thong_su_dung, quan_ly_don_thieu_linh_kien, bat_tat, stt, nguoi_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(body.ten_ly_do.trim(), body.he_thong_su_dung.trim(), body.quan_ly_don_thieu_linh_kien ? 1 : 0, body.bat_tat === false ? 0 : 1, body.stt ?? 0, user.email)
    .first();
  return c.json(row, 201);
});

settingsDatMua.patch("/ly-do-cham/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ ten_ly_do?: string; he_thong_su_dung?: string; quan_ly_don_thieu_linh_kien?: boolean; bat_tat?: boolean; stt?: number }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_ly_do_cham WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = {
    ten_ly_do: body.ten_ly_do !== undefined ? body.ten_ly_do.trim() : existing.ten_ly_do,
    he_thong_su_dung: body.he_thong_su_dung !== undefined ? body.he_thong_su_dung.trim() : existing.he_thong_su_dung,
    quan_ly_don_thieu_linh_kien: body.quan_ly_don_thieu_linh_kien !== undefined ? (body.quan_ly_don_thieu_linh_kien ? 1 : 0) : existing.quan_ly_don_thieu_linh_kien,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    stt: body.stt !== undefined ? body.stt : existing.stt,
  };
  const user = c.get("user");
  await c.env.DB.prepare(
    "UPDATE settings_ly_do_cham SET ten_ly_do = ?, he_thong_su_dung = ?, quan_ly_don_thieu_linh_kien = ?, bat_tat = ?, stt = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?",
  )
    .bind(next.ten_ly_do, next.he_thong_su_dung, next.quan_ly_don_thieu_linh_kien, next.bat_tat, next.stt, user.email, nowVN(), id)
    .run();
  return c.json({ ok: true });
});

// ---------- Loai de xuat: nhom + options ----------

settingsDatMua.get("/loai-de-xuat/nhom", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_loai_de_xuat_nhom ORDER BY id").all();
  return c.json({ rows: results });
});

settingsDatMua.post("/loai-de-xuat/nhom", adminOnly, async (c) => {
  const body = await c.req.json<{ ten_nhom: string; vai_tro_json: string; bat_tat?: boolean }>();
  if (!body.ten_nhom?.trim()) return c.json({ error: "MISSING_TEN_NHOM" }, 400);
  const user = c.get("user");
  const vaiTroJson = typeof body.vai_tro_json === "string" ? body.vai_tro_json : JSON.stringify(body.vai_tro_json ?? []);
  const row = await c.env.DB.prepare(
    "INSERT INTO settings_loai_de_xuat_nhom (ten_nhom, vai_tro_json, bat_tat, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(body.ten_nhom.trim(), vaiTroJson, body.bat_tat !== false ? 1 : 0, user.email, nowVN())
    .first();
  return c.json(row, 201);
});

settingsDatMua.patch("/loai-de-xuat/nhom/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ ten_nhom?: string; vai_tro_json?: string; bat_tat?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_loai_de_xuat_nhom WHERE id = ?").bind(id).first<{ ten_nhom: string; vai_tro_json: string; bat_tat: number }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  const next = {
    ten_nhom: body.ten_nhom !== undefined ? body.ten_nhom.trim() : existing.ten_nhom,
    vai_tro_json: body.vai_tro_json !== undefined ? (typeof body.vai_tro_json === "string" ? body.vai_tro_json : JSON.stringify(body.vai_tro_json)) : existing.vai_tro_json,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
  };
  await c.env.DB.prepare(
    "UPDATE settings_loai_de_xuat_nhom SET ten_nhom = ?, vai_tro_json = ?, bat_tat = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?",
  )
    .bind(next.ten_nhom, next.vai_tro_json, next.bat_tat, user.email, nowVN(), id)
    .run();
  return c.json({ ok: true });
});

settingsDatMua.get("/loai-de-xuat", async (c) => {
  const since = c.req.query("since")?.trim();
  let query =
    "SELECT o.id, o.nhom_id, o.ten_option, o.bat_tat, o.stt, o.ngay_cap_nhat, o.loai_file_xuat_misa, n.ten_nhom, n.vai_tro_json " +
    "FROM settings_loai_de_xuat o JOIN settings_loai_de_xuat_nhom n ON n.id = o.nhom_id " +
    "WHERE n.bat_tat = 1";
  const binds: string[] = [];
  if (since) { query += " AND o.ngay_cap_nhat > ?"; binds.push(since); }
  query += " ORDER BY o.nhom_id, o.stt, o.id";
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json({ rows: results });
});

// "loai_file_xuat_misa" (them migration 0015_misa_export.sql) - null|'chuyen_kho'|'ban_hang'|'xuat_kho',
// validate o day (khong CHECK constraint duoc vi la ALTER TABLE ADD COLUMN) - CHI dung khi don
// dat_don_hang.loai_don='mua' luc xuat file MISA (xem lib/misaExport.ts), null = mac dinh 'ban_hang'.
const MISA_LOAI_FILE_XUAT_VALUES = ["chuyen_kho", "ban_hang", "xuat_kho"] as const;

settingsDatMua.post("/loai-de-xuat", adminOnly, async (c) => {
  const body = await c.req.json<{ nhom_id: number; ten_option: string; stt?: number }>();
  if (!body.nhom_id || !body.ten_option?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  const user = c.get("user");
  const row = await c.env.DB.prepare(
    "INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(body.nhom_id, body.ten_option.trim(), body.stt ?? 0, user.email, nowVN())
    .first();
  return c.json(row, 201);
});

settingsDatMua.patch("/loai-de-xuat/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ ten_option?: string; bat_tat?: boolean; stt?: number; loai_file_xuat_misa?: string | null }>();
  if (body.loai_file_xuat_misa !== undefined && body.loai_file_xuat_misa !== null && !MISA_LOAI_FILE_XUAT_VALUES.includes(body.loai_file_xuat_misa as (typeof MISA_LOAI_FILE_XUAT_VALUES)[number])) {
    return c.json({ error: "INVALID_LOAI_FILE_XUAT_MISA" }, 400);
  }
  const existing = await c.env.DB.prepare("SELECT * FROM settings_loai_de_xuat WHERE id = ?").bind(id).first<{ ten_option: string; bat_tat: number; stt: number; loai_file_xuat_misa: string | null }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  const next = {
    ten_option: body.ten_option !== undefined ? body.ten_option.trim() : existing.ten_option,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    stt: body.stt !== undefined ? body.stt : existing.stt,
    loai_file_xuat_misa: body.loai_file_xuat_misa !== undefined ? body.loai_file_xuat_misa : existing.loai_file_xuat_misa,
  };
  await c.env.DB.prepare(
    "UPDATE settings_loai_de_xuat SET ten_option = ?, bat_tat = ?, stt = ?, loai_file_xuat_misa = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?",
  )
    .bind(next.ten_option, next.bat_tat, next.stt, next.loai_file_xuat_misa, user.email, nowVN(), id)
    .run();
  return c.json({ ok: true });
});

settingsDatMua.delete("/loai-de-xuat/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM settings_loai_de_xuat WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ---------- Khu vuc (them 2026-08-26, xay lai quan ly tai khoan/vai tro - xem migration 0009) ----------
// 1 khu vuc chi 1 GS tai 1 thoi diem (ep boi schema: 1 cot gs_email/dong), 1 GS duoc phep phu trach
// nhieu khu vuc. Gan GS moi cho 1 khu vuc da co GS se ghi de - FE PHAI canh bao ro truoc khi goi PATCH
// /:ma/gs (xem Phase 3, UsersModule/SettingsModule).

settingsDatMua.get("/khu-vuc", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT k.*, u.ten as gs_ten FROM khu_vuc k LEFT JOIN users u ON u.email = k.gs_email ORDER BY k.stt, k.ma`,
  ).all();
  return c.json({ rows: results });
});

settingsDatMua.post("/khu-vuc", adminOnly, async (c) => {
  const body = await c.req.json<{ ma: string; ten: string; stt?: number }>();
  if (!body.ma?.trim() || !body.ten?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO khu_vuc (ma, ten, stt, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ma) DO UPDATE SET
       ten = excluded.ten, stt = excluded.stt, nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat
     RETURNING *`,
  )
    .bind(body.ma.trim(), body.ten.trim(), body.stt ?? 0, user.email, nowVN())
    .first();
  return c.json(row, 201);
});

settingsDatMua.patch("/khu-vuc/:ma", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ ten?: string; bat_tat?: boolean; stt?: number }>();
  const existing = await c.env.DB.prepare("SELECT * FROM khu_vuc WHERE ma = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = {
    ten: body.ten !== undefined ? body.ten.trim() : existing.ten,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    stt: body.stt !== undefined ? body.stt : existing.stt,
  };
  const user = c.get("user");
  await c.env.DB.prepare("UPDATE khu_vuc SET ten = ?, bat_tat = ?, stt = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma = ?")
    .bind(next.ten, next.bat_tat, next.stt, user.email, nowVN(), ma)
    .run();
  return c.json({ ok: true });
});

// PATCH /api/settings/khu-vuc/:ma/gs - gan/go GS phu trach 1 khu vuc. { gs_email: string | null }.
// Validate gs_email (neu co) phai la 1 user vai_tro="Giam sat" - tranh gan nham 1 tai khoan khong
// phai GS. Ghi de truc tiep (khong can xoa "khu vuc cu" cua GS do - 1 GS duoc phep nhieu khu vuc).
settingsDatMua.patch("/khu-vuc/:ma/gs", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const existing = await c.env.DB.prepare("SELECT ma FROM khu_vuc WHERE ma = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<{ gs_email?: string | null }>();
  const gsEmail = body.gs_email?.trim() || null;
  if (gsEmail) {
    const gsUser = await c.env.DB.prepare("SELECT vai_tro FROM users WHERE email = ?").bind(gsEmail).first<{ vai_tro: string | null }>();
    if (!gsUser || gsUser.vai_tro !== "Giam sat") return c.json({ error: "NOT_A_GIAM_SAT" }, 400);
  }

  const user = c.get("user");
  await c.env.DB.prepare("UPDATE khu_vuc SET gs_email = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma = ?")
    .bind(gsEmail, user.email, nowVN(), ma)
    .run();
  // Phase 4 (2026-08-26): GS cua khu vuc nay vua doi - dong bo lai giam_sat_quan_ly cho MOI KTV
  // thuoc khu vuc nay (co the nhieu dong cung luc) - xem lib/khuVucSync.ts.
  await resyncKhuVucDerivedFieldsForAll(c.env.DB);
  return c.json({ ok: true });
});

// ---------- App settings (key-value chung, migration 0004_app_settings.sql) ----------
// GET mo cho MOI nguoi dung da dang nhap (khong rieng Admin) - "nen_anh_tra_hang" duoc doc boi client
// luc chon anh tai TraHangAnhPicker/QcTuChoiModal (module Dat mua linh kien), khong phai man quan tri.
// 4 khoa "Ma kho/Ten kho mac dinh theo mien" (them migration 0015_misa_export.sql) - dung de dien cot
// "Mã kho" khi xuat file MISA (xem lib/misaExport.ts), doc CHUNG 1 lan voi nen_anh_tra_hang de khong
// them round-trip rieng.
const MISA_KHO_KEYS = ["misa_ma_kho_mien_bac", "misa_ten_kho_mien_bac", "misa_ma_kho_mien_nam", "misa_ten_kho_mien_nam"] as const;

settingsDatMua.get("/app-settings", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT key, value FROM app_settings WHERE key IN ('nen_anh_tra_hang', ${MISA_KHO_KEYS.map(() => "?").join(",")})`,
  )
    .bind(...MISA_KHO_KEYS)
    .all<{ key: string; value: string }>();
  const byKey = new Map(results.map((r) => [r.key, r.value]));
  return c.json({
    nen_anh_tra_hang: byKey.has("nen_anh_tra_hang") ? byKey.get("nen_anh_tra_hang") === "1" : true,
    misa_ma_kho_mien_bac: byKey.get("misa_ma_kho_mien_bac") ?? "",
    misa_ten_kho_mien_bac: byKey.get("misa_ten_kho_mien_bac") ?? "",
    misa_ma_kho_mien_nam: byKey.get("misa_ma_kho_mien_nam") ?? "",
    misa_ten_kho_mien_nam: byKey.get("misa_ten_kho_mien_nam") ?? "",
  });
});

// PATCH /api/settings/app-settings - { nen_anh_tra_hang?: boolean, misa_*?: string } - CHI Admin duoc
// doi (phan hoi 2026-08-24 cho nen_anh_tra_hang; 4 khoa misa_* them 2026-09-02).
settingsDatMua.patch("/app-settings", adminOnly, async (c) => {
  const body = await c.req.json<{ nen_anh_tra_hang?: boolean; misa_ma_kho_mien_bac?: string; misa_ten_kho_mien_bac?: string; misa_ma_kho_mien_nam?: string; misa_ten_kho_mien_nam?: string }>();
  const user = c.get("user");
  const updates: Array<[string, string]> = [];
  if (body.nen_anh_tra_hang !== undefined) updates.push(["nen_anh_tra_hang", body.nen_anh_tra_hang ? "1" : "0"]);
  for (const key of MISA_KHO_KEYS) {
    if (body[key] !== undefined) updates.push([key, body[key]!.trim()]);
  }
  if (updates.length === 0) return c.json({ error: "INVALID_BODY" }, 400);
  for (const [key, value] of updates) {
    await c.env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
      .bind(key, value, user.email, nowVN())
      .run();
  }
  return c.json({ ok: true });
});

export default settingsDatMua;
