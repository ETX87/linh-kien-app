import { Hono } from "hono";
import type { Env } from "../types";
import { khoaKhop } from "../lib/baoVe";
import { nowVN } from "../lib/vnTime";
import { nextSequentialId } from "../lib/idCounter";
import { THB_MO, docThb, thbGhiBuoc, thbThayDoiSau } from "../lib/thieuHangBh";
import { apDungCapLk, type CapLkItem } from "../lib/donSuaChuaKho";
import { uploadPublicImage } from "../lib/googleDrive";
import { ANH_TOI_DA_BYTE, laAnhThat, loaiAnhHopLe } from "../lib/anhUpload";
import { ganRouteDonSc } from "./suachuaDonSc";

// He "Sua chua bao hanh" (Worker suachua) goi vao day qua Service Binding khi Admin BH sua tay "Phan
// loai" (cot don_vi) cua 1 linh kien dong bo (2026-10-11, yeu cau "phan loai cho phep dong bo nguoc ve
// danh sach linh kien app"). Xac thuc bang CHINH secret dong bo da dung chung giua 2 he (chieu
// linh-kien-app -> suachua gui X-Sync-Key = SUACHUA_SYNC_API_KEY), khong can tao key moi. Ghi
// ngay_cap_nhat moi de dot dong bo tiep theo day lai gia tri moi sang ca dvbh lan suachua (nhat quan).
const suachuaPartner = new Hono<{ Bindings: Env }>();

suachuaPartner.use("*", async (c, next) => {
  if (!(await khoaKhop(c.req.header("X-Sync-Key"), c.env.SUACHUA_SYNC_API_KEY))) return c.json({ error: "INVALID_KEY" }, 401);
  await next();
});

// CÔNG NỢ SỬA CHỮA tao / sua / huy / doc tu app Bao hanh doi tra (v1.498) - xem routes/suachuaDonSc.ts.
ganRouteDonSc(suachuaPartner);

// GET /api/suachua-partner/lk-theo-case?case_id=SC123 (v1.539, 20/11/2026) - app Bao hanh doi tra goi khi KTV / NV chon ma case
// luc tao don gui bao hanh: tra cac linh kien DA DAT ben nay cho case do (de uu tien len dau o chon linh kien). Khop ma case qua
// dat_don_hang.ma_yeu_cau_su_co (co index) + dat_don_case; nhan 3 dang chu (SC / Sc / sc). Bo don tra hang + don bi tu choi / huy.
suachuaPartner.get("/lk-theo-case", async (c) => {
  const raw = (c.req.query("case_id") ?? "").trim();
  if (raw.length < 3 || raw.length > 60) return c.json({ rows: [] });
  const up = raw.toUpperCase();
  const ds = [...new Set([raw, up, up.toLowerCase(), up.slice(0, 1) + up.slice(1).toLowerCase()])];
  const ph = ds.map(() => "?").join(",");
  const { results } = await c.env.DB.prepare(
    `SELECT d.ma_lk, MAX(d.ten_lk_snapshot) AS ten_lk, SUM(COALESCE(d.so_luong_thuc_xuat, d.so_luong_de_xuat)) AS so_luong,
            COUNT(*) AS so_don, MAX(d.ngay_tao) AS ngay_moi, GROUP_CONCAT(d.id) AS don_ids
       FROM dat_don_hang d
      WHERE (d.ma_yeu_cau_su_co IN (${ph}) OR d.id IN (SELECT dat_don_hang_id FROM dat_don_case WHERE case_id IN (${ph})))
        AND d.loai_don <> 'tra_hang'
        AND COALESCE(d.trang_thai_hien_tai, '') NOT IN ('TN tu choi', 'Tu choi', 'Da huy')
      GROUP BY d.ma_lk ORDER BY ngay_moi DESC LIMIT 50`,
  )
    .bind(...ds, ...ds)
    .all();
  return c.json({ rows: results ?? [] });
});

// POST /api/suachua-partner/phan-loai - { rows: [{ ma_linh_kien, don_vi }] } (toi da 500 dong/lan).
suachuaPartner.post("/phan-loai", async (c) => {
  const body = await c.req.json<{ rows?: { ma_linh_kien?: string; don_vi?: string | null }[] }>().catch(() => ({}) as { rows?: undefined });
  if (!Array.isArray(body.rows) || body.rows.length > 500) return c.json({ error: "INVALID_BODY" }, 400);
  const rows = body.rows.filter((r) => typeof r.ma_linh_kien === "string" && r.ma_linh_kien.trim());
  if (!rows.length) return c.json({ cap_nhat: 0, khong_thay: [] });
  const ma = rows.map((r) => r.ma_linh_kien!.trim());
  const { results } = await c.env.DB.prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ma))
    .all<{ ma_linh_kien: string }>();
  const co = new Set(results.map((r) => r.ma_linh_kien));
  const now = nowVN();
  const stmts = rows
    .filter((r) => co.has(r.ma_linh_kien!.trim()))
    .map((r) =>
      c.env.DB.prepare("UPDATE linh_kien SET don_vi = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ? AND COALESCE(don_vi, '') <> COALESCE(?, '')").bind(
        (r.don_vi ?? "").trim() || null,
        now,
        r.ma_linh_kien!.trim(),
        (r.don_vi ?? "").trim() || null,
      ),
    );
  // Chi dong co gia tri THUC SU khac moi bi ghi (dieu kien trong WHERE) - dem dung so dong doi.
  const res = stmts.length ? await c.env.DB.batch(stmts) : [];
  return c.json({ cap_nhat: res.reduce((n, r) => n + (r.meta?.changes ?? 0), 0), khong_thay: ma.filter((m) => !co.has(m)) });
});

// GET /api/suachua-partner/etx-nhan-su - danh ba "ETX nhan su" (2026-10-16, yeu cau suachua "tu duyet neu co tren ETX, tu
// khoa neu nghi viec"). suachua KHONG goi thang API ETX (khong can them secret ETX, khong tang tai doi tac) - doc lai bang
// etx_nhan_su ma he nay da PULL hang tuan. Chi tra cac cot can cho duyet/khoa tai khoan.
suachuaPartner.get("/etx-nhan-su", async (c) => {
  const [{ results }, state] = await Promise.all([
    c.env.DB.prepare("SELECT ma_nhan_su, ho_ten, chuc_danh, gmail, trang_thai_lam_viec, ma_ktv FROM etx_nhan_su").all(),
    c.env.DB.prepare("SELECT last_run_at, last_status FROM etx_nhan_su_sync_state WHERE id = 1").first<{ last_run_at: string | null; last_status: string | null }>(),
  ]);
  return c.json({ rows: results, etx_dong_bo_luc: state?.last_run_at ?? null, etx_trang_thai: state?.last_status ?? null });
});

// GET /api/suachua-partner/user-khu-vuc - khu vuc phu trach cua tai khoan nhan su (2026-10-21, yeu cau suachua "chi can
// dong bo kiem tra 1 ngay 1 lan + bo sung dong bo thu cong"). suachua dung de gioi han pham vi xem (View) va tu suy mien.
suachuaPartner.get("/user-khu-vuc", async (c) => {
  // la_gs (2026-11-01): tai khoan vai tro Giam sat -> khu vuc nay la khu vuc GS PHU trach (quyen nhu GS chinh) - suachua dua vao
  // danh sach GS cua khu vuc (khu_vuc_gs_bh).
  const { results } = await c.env.DB.prepare(
    `SELECT uk.user_email, uk.khu_vuc_ma, CASE WHEN u.vai_tro = 'Giam sat' AND COALESCE(u.bi_khoa, 0) = 0 THEN 1 ELSE 0 END AS la_gs
     FROM user_khu_vuc uk LEFT JOIN users u ON u.email = uk.user_email`,
  ).all();
  return c.json({ rows: results });
});

// ---------- THIEU HANG BAO HANH (2026-11-04, migration 0106) ----------
// POST /api/suachua-partner/thieu-hang-bh - { items: [{ nguon_id, ma_lk, ten_lk, so_luong, ly_do, ghi_chu, mien, case_id, ktv_email,
// ktv_ten, nguoi_bao, nguoi_bao_ten }] } (toi da 100). Cung nguon_id + ma_lk dang co ticket MO -> tra lai ticket do (khong tao trung).
suachuaPartner.post("/thieu-hang-bh", async (c) => {
  type Item = {
    nguon_id?: string; ma_lk?: string; ten_lk?: string; so_luong?: number; ly_do?: string; ghi_chu?: string; mien?: string;
    case_id?: string; ktv_email?: string; ktv_ten?: string; nguoi_bao?: string; nguoi_bao_ten?: string;
  };
  const body = await c.req.json<{ items?: Item[] }>().catch(() => ({}) as { items?: Item[] });
  if (!Array.isArray(body.items) || body.items.length > 100) return c.json({ error: "INVALID_BODY" }, 400);
  const s = (v: unknown, n = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const out: { nguon_id: string; ma_lk: string; id: string; trang_thai: string; moi: boolean }[] = [];
  const db = c.env.DB;
  for (const it of body.items) {
    const nguon = s(it.nguon_id, 60);
    const ma = s(it.ma_lk, 80);
    if (!nguon || !ma) continue;
    const co = await db
      .prepare(`SELECT id, trang_thai FROM thieu_hang_bh WHERE nguon_id = ? AND ma_lk = ? AND trang_thai IN (${THB_MO.map(() => "?").join(",")}) LIMIT 1`)
      .bind(nguon, ma, ...THB_MO)
      .first<{ id: string; trang_thai: string }>();
    if (co) {
      out.push({ nguon_id: nguon, ma_lk: ma, id: co.id, trang_thai: co.trang_thai, moi: false });
      continue;
    }
    const lk = await db.prepare("SELECT ten_linh_kien FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first<{ ten_linh_kien: string }>().catch(() => null);
    const id = await nextSequentialId(db, "thieu_hang_bh", "THB", 6);
    const now = nowVN();
    const sl = Math.max(1, Math.min(999, Math.round(Number(it.so_luong) || 1)));
    const nguoiBao = s(it.nguoi_bao, 120) ?? "suachua";
    await db.batch([
      db
        .prepare(
          `INSERT INTO thieu_hang_bh (id, nguon_id, ma_lk, ten_lk, so_luong, ly_do, ghi_chu, mien, case_id, ktv_email, ktv_ten, nguoi_bao, nguoi_bao_ten,
             trang_thai, ngay_tao, ngay_cap_nhat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Cho kho xu ly', ?, ?)`,
        )
        .bind(id, nguon, ma, lk?.ten_linh_kien ?? s(it.ten_lk, 300), sl, s(it.ly_do, 200), s(it.ghi_chu, 1000), s(it.mien, 10), s(it.case_id, 80),
          s(it.ktv_email, 120), s(it.ktv_ten, 200), nguoiBao, s(it.nguoi_bao_ten, 200), now, now),
      db
        .prepare("INSERT INTO thieu_hang_bh_log (thieu_hang_bh_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho kho xu ly', ?, ?, ?)")
        .bind(id, nguoiBao, now, `App bảo hành báo thiếu hàng (đơn ${nguon})${s(it.ly_do) ? ` — ${s(it.ly_do)}` : ""}`),
    ]);
    out.push({ nguon_id: nguon, ma_lk: ma, id, trang_thai: "Cho kho xu ly", moi: true });
  }
  return c.json({ rows: out });
});

// GET /api/suachua-partner/thieu-hang-bh?since=&after_id=&limit= (keo thay doi) | ?ids=a,b (doc theo ma ticket).
suachuaPartner.get("/thieu-hang-bh", async (c) => {
  const ids = (c.req.query("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 200);
  if (ids.length) return c.json({ rows: await docThb(c.env.DB, ids) });
  const limit = Math.max(1, Math.min(500, Number(c.req.query("limit")) || 200));
  const rows = await thbThayDoiSau(c.env.DB, c.req.query("since") ?? "", c.req.query("after_id") ?? "", limit);
  return c.json({ rows, het: rows.length < limit });
});

// POST /api/suachua-partner/thieu-hang-bh/:id/huy - { nguoi, ly_do } - Admin BH ben suachua rut lai bao thieu (vd da tim duoc hang).
suachuaPartner.post("/thieu-hang-bh/:id/huy", async (c) => {
  const body = await c.req.json<{ nguoi?: string; ly_do?: string }>().catch(() => ({}) as { nguoi?: string; ly_do?: string });
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT trang_thai FROM thieu_hang_bh WHERE id = ?").bind(id).first<{ trang_thai: string }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (!(THB_MO as readonly string[]).includes(row.trang_thai)) return c.json({ error: "WRONG_STATE", trang_thai: row.trang_thai }, 400);
  const ok = await thbGhiBuoc(c.env.DB, id, row.trang_thai, "Da huy", (body.nguoi ?? "suachua").slice(0, 120), {
    ghi_chu: `App bảo hành rút lại báo thiếu${body.ly_do?.trim() ? `: ${body.ly_do.trim().slice(0, 500)}` : ""}`,
  });
  if (!ok) return c.json({ error: "STATE_CHANGED" }, 409);
  return c.json({ rows: await docThb(c.env.DB, [id]) });
});

// ---------- DON "SỬA CHỮA TẠI KHO" (2026-11-12, v1.478, migration 0116) ----------
// POST /api/suachua-partner/cap-lk - { items: CapLkItem[] } (toi da 100). Moi item = trang thai HIEN TAI cua 1 de xuat cap linh kien
// (DX-xxxxxx) ben suachua; tao / cap nhat 1 don dat CHI XEM + nhat ky chong trung (lib/donSuaChuaKho.ts). Tra { rows: [{ nguon_id,
// ddh_id, ok, bo_qua?, loi? }] } - suachua chi danh dau "da day" dong ok.
suachuaPartner.post("/cap-lk", async (c) => {
  const body = await c.req.json<{ items?: CapLkItem[] }>().catch(() => ({}) as { items?: CapLkItem[] });
  if (!Array.isArray(body.items) || body.items.length > 100) return c.json({ error: "INVALID_BODY" }, 400);
  return c.json({ rows: await apDungCapLk(c.env.DB, body.items) });
});

// ---------- ANH CUA APP SUA CHUA (2026-11-12, v1.481) ----------
// Yeu cau suachua: "Anh tren toan bo he thong phai luu tren link drive da lien ket, khong cho phep luu tren R2 hoac D1". suachua KHONG
// co ket noi Drive rieng - gui anh sang day de tai len CHINH tai khoan Google Drive da ket noi o Cai dat (uploadPublicImage, chia se
// cong khai theo link), D1 suachua chi giu link tra ve. POST /api/suachua-partner/anh?ten=<ten file> - body = binary anh (Content-Type
// = mime anh), toi da 10MB, kiem tra chu ky file that la anh. Khong tinh han muc anh/ngay (suachua tu gioi han theo nguoi dung).
suachuaPartner.post("/anh", async (c) => {
  const mime = loaiAnhHopLe(c.req.header("Content-Type") || "image/jpeg");
  if (!mime) return c.json({ error: "DINH_DANG_ANH_KHONG_HO_TRO" }, 400);
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);
  if (buf.byteLength > ANH_TOI_DA_BYTE) return c.json({ error: "ANH_QUA_LON" }, 413);
  if (!laAnhThat(buf)) return c.json({ error: "DINH_DANG_ANH_KHONG_HO_TRO" }, 400);
  const ext = mime.split("/")[1] || "jpg";
  const ten = (c.req.query("ten") || `anh-${crypto.randomUUID()}`).replace(/[^\w.\-]+/g, "_").slice(0, 120);
  try {
    const anh = await uploadPublicImage(c.env, c.env.DB, buf, mime, `suachua_${ten}.${ext}`);
    return c.json({ id: anh.id, url: anh.thumbnailUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("GOOGLE_DRIVE_NOT_CONNECTED")) return c.json({ error: "GOOGLE_DRIVE_NOT_CONNECTED" }, 503);
    return c.json({ error: "UPLOAD_FAILED", message: message.slice(0, 300) }, 502);
  }
});

export default suachuaPartner;
