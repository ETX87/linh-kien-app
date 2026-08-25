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
  }>();
  if (!body.ma_linh_kien?.trim() || !body.ten_linh_kien?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, gia_tham_chieu, don_vi, ghi_chu, anh_demo, dac_thu, chi_sua_chua, phan_loai_dac_thu, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      body.ma_linh_kien.trim(), body.ten_linh_kien.trim(), body.gia_ban ?? null, body.gia_tham_chieu ?? null,
      body.don_vi?.trim() || null, body.ghi_chu?.trim() || null, body.anh_demo?.trim() || null,
      body.dac_thu ? 1 : 0, body.chi_sua_chua ? 1 : 0, body.dac_thu ? body.phan_loai_dac_thu?.trim() || null : null,
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
    bat_tat?: boolean; gia_ban?: number; gia_tham_chieu?: number; don_vi?: string; ghi_chu?: string;
    anh_demo?: string; dac_thu?: boolean; chi_sua_chua?: boolean; phan_loai_dac_thu?: string;
  }>();
  const existing = await c.env.DB.prepare("SELECT * FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const user = c.get("user");
  const dacThuNext = body.dac_thu !== undefined ? (body.dac_thu ? 1 : 0) : existing.dac_thu;
  const next = {
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
    "UPDATE linh_kien SET bat_tat = ?, gia_ban = ?, gia_tham_chieu = ?, don_vi = ?, ghi_chu = ?, anh_demo = ?, dac_thu = ?, chi_sua_chua = ?, phan_loai_dac_thu = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?",
  )
    .bind(next.bat_tat, next.gia_ban, next.gia_tham_chieu, next.don_vi, next.ghi_chu, next.anh_demo, next.dac_thu, next.chi_sua_chua, next.phan_loai_dac_thu, user.email, nowVN(), ma)
    .run();

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

// POST /api/settings/linh-kien/bulk-import - { rows: [{ma_linh_kien, ten_linh_kien, gia_ban?,
// gia_tham_chieu?, don_vi?, ghi_chu?, dac_thu?, chi_sua_chua?, anh_url?}], offset } - nhap/cap nhat
// HANG LOAT ca dong danh muc - dung khi mang danh sach linh kien tu he khac sang (vd he bao hanh
// goc) qua file Excel/CSV. UPSERT theo ma_linh_kien (ON CONFLICT DO UPDATE) - chay lai nhieu lan an
// toan, KHONG dong vao bat_tat (giu trang thai an/hien da chinh tay truoc do). "anh_url" (phan hoi
// 2026-08-20: "import danh sách linh kiện có link ảnh, nhưng không hiện trên web" - truoc day
// endpoint nay KHONG doc cot anh nao ca) la TUY CHON - neu co, tai anh tu URL nguon roi upload lai
// len Google Drive CUA HE THONG (uploadPublicImage, GIONG HET co che /bulk-import-anh) truoc khi ghi
// anh_demo, KHONG luu thang URL nguon (tranh hotlink chet/CORS/het han khi nguon la he khac). Loi
// tai anh KHONG lam hong dong (van tinh "thanh_cong" cho phan danh muc, chi rieng anh bao "loi_anh"
// trong details). Chunk giam tu 25 xuong 10 (giong bulk-import-anh) vi moi dong CO THE ton them 1
// fetch + 1 upload Drive khi co anh_url, khac chi ghi DB thuan truoc day.
settingsDatMua.post("/linh-kien/bulk-import", linhKienWriteRoles, async (c) => {
  const body = await c.req.json<{
    rows: {
      ma_linh_kien: string; ten_linh_kien: string; gia_ban?: number; gia_tham_chieu?: number;
      don_vi?: string; ghi_chu?: string; dac_thu?: boolean; chi_sua_chua?: boolean; anh_url?: string;
      phan_loai_dac_thu?: string;
    }[];
    offset: number;
  }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const CHUNK_SIZE = 10;
  const offset = Math.max(0, body.offset ?? 0);
  const chunk = body.rows.slice(offset, offset + CHUNK_SIZE);
  const user = c.get("user");
  const now = nowVN();

  let success = 0;
  let errorCount = 0;
  const details: { ma_linh_kien: string; status: string }[] = [];

  for (const row of chunk) {
    const ma = row.ma_linh_kien?.trim();
    const ten = row.ten_linh_kien?.trim();
    if (!ma || !ten) {
      errorCount++;
      details.push({ ma_linh_kien: ma || "(rỗng)", status: "thieu_ma_hoac_ten" });
      continue;
    }

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

    try {
      await c.env.DB.prepare(
        `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, gia_tham_chieu, don_vi, ghi_chu, anh_demo, dac_thu, chi_sua_chua, phan_loai_dac_thu, nguoi_cap_nhat, ngay_cap_nhat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ma_linh_kien) DO UPDATE SET
           ten_linh_kien = excluded.ten_linh_kien,
           gia_ban = excluded.gia_ban,
           gia_tham_chieu = excluded.gia_tham_chieu,
           don_vi = excluded.don_vi,
           ghi_chu = excluded.ghi_chu,
           anh_demo = COALESCE(excluded.anh_demo, linh_kien.anh_demo),
           dac_thu = excluded.dac_thu,
           chi_sua_chua = excluded.chi_sua_chua,
           phan_loai_dac_thu = excluded.phan_loai_dac_thu,
           nguoi_cap_nhat = excluded.nguoi_cap_nhat,
           ngay_cap_nhat = excluded.ngay_cap_nhat`,
      )
        .bind(
          ma, ten, row.gia_ban ?? null, row.gia_tham_chieu ?? null, row.don_vi?.trim() || null, row.ghi_chu?.trim() || null,
          anhDemo, row.dac_thu ? 1 : 0, row.chi_sua_chua ? 1 : 0, row.dac_thu ? row.phan_loai_dac_thu?.trim() || null : null,
          user.email, now,
        )
        .run();
      success++;
      details.push({ ma_linh_kien: ma, status: anhLoi ? "thanh_cong_loi_anh" : "thanh_cong" });
    } catch {
      errorCount++;
      details.push({ ma_linh_kien: ma, status: "loi_ghi_db" });
    }
  }

  const nextOffset = offset + CHUNK_SIZE;
  const done = nextOffset >= body.rows.length;
  if (done) await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ done, nextOffset, success, errorCount, details });
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
    "SELECT o.id, o.nhom_id, o.ten_option, o.bat_tat, o.stt, o.ngay_cap_nhat, n.ten_nhom, n.vai_tro_json " +
    "FROM settings_loai_de_xuat o JOIN settings_loai_de_xuat_nhom n ON n.id = o.nhom_id " +
    "WHERE n.bat_tat = 1";
  const binds: string[] = [];
  if (since) { query += " AND o.ngay_cap_nhat > ?"; binds.push(since); }
  query += " ORDER BY o.nhom_id, o.stt, o.id";
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json({ rows: results });
});

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
  const body = await c.req.json<{ ten_option?: string; bat_tat?: boolean; stt?: number }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_loai_de_xuat WHERE id = ?").bind(id).first<{ ten_option: string; bat_tat: number; stt: number }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  const next = {
    ten_option: body.ten_option !== undefined ? body.ten_option.trim() : existing.ten_option,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    stt: body.stt !== undefined ? body.stt : existing.stt,
  };
  await c.env.DB.prepare(
    "UPDATE settings_loai_de_xuat SET ten_option = ?, bat_tat = ?, stt = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?",
  )
    .bind(next.ten_option, next.bat_tat, next.stt, user.email, nowVN(), id)
    .run();
  return c.json({ ok: true });
});

settingsDatMua.delete("/loai-de-xuat/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM settings_loai_de_xuat WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ---------- App settings (key-value chung, migration 0004_app_settings.sql) ----------
// GET mo cho MOI nguoi dung da dang nhap (khong rieng Admin) - "nen_anh_tra_hang" duoc doc boi client
// luc chon anh tai TraHangAnhPicker/QcTuChoiModal (module Dat mua linh kien), khong phai man quan tri.
settingsDatMua.get("/app-settings", async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM app_settings WHERE key = 'nen_anh_tra_hang'").first<{ value: string }>();
  return c.json({ nen_anh_tra_hang: row ? row.value === "1" : true });
});

// PATCH /api/settings/app-settings - { nen_anh_tra_hang?: boolean } - CHI Admin duoc doi (phan hoi
// 2026-08-24: "cơ chế nén ảnh này cho tôi bật tắt tuỳ chỉnh trong settings").
settingsDatMua.patch("/app-settings", adminOnly, async (c) => {
  const body = await c.req.json<{ nen_anh_tra_hang?: boolean }>();
  if (body.nen_anh_tra_hang === undefined) return c.json({ error: "INVALID_BODY" }, 400);
  const user = c.get("user");
  await c.env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('nen_anh_tra_hang', ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  )
    .bind(body.nen_anh_tra_hang ? "1" : "0", user.email, nowVN())
    .run();
  return c.json({ ok: true });
});

export default settingsDatMua;
