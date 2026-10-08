import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { runEtxNhanSuSyncWithState } from "../lib/etxNhanSuSync";
import { tuDongTaoKtvTuEtx, taoTaiKhoanTuEtx } from "../lib/etxTuDongKtv";
import { resyncKhuVucDerivedFieldsForEmail } from "../lib/khuVucSync";
import { nowVN } from "../lib/vnTime";

// Quan tri "ETX nhan su" (xem lib/etxNhanSuSync.ts) - danh ba nhan su dong bo tu he ETX, du lieu
// nhay cam hon ktv_lien_he nen Admin-only TOAN BO router (khac settingsKtv.ts, noi GET / mo cho moi
// vai tro dang nhap vi dung lam picker chon nguoi nhan hang). Cron trong index.ts (scheduled(), gate
// theo thu+gio UTC) goi thang runEtxNhanSuSyncWithState() moi 7 ngay, khong qua route nay.
const etxNhanSuSync = new Hono<{ Bindings: Env }>();
etxNhanSuSync.use("*", verifySessionMiddleware, loadUser, requireRole("Admin"));

interface EtxNhanSuSyncStateRow {
  last_run_at: string | null;
  last_status: string | null;
  changed_count: number;
  last_error: string | null;
  ktv_tu_tao?: number;
  tk_tu_duyet?: number;
}

// Trang thai "Tai khoan dat hang" (2026-10-01): da_tao = tai khoan lien ket (qua Ma KTV) hoac tai khoan Gmail "Da duyet" va
// la Email dang nhap cua 1 KTV; van_phong = Gmail co tai khoan "Da duyet" nhung khong phai KTV (nhan vien van phong - khong
// tao KTV tu day); cho_duyet / tu_choi theo users; chua_tao = chua co tai khoan; khong_gmail = ETX khong co Gmail hop le (cung dieu kien EMAIL_RE cua taoTaiKhoanTuEtx).
// Join ug (users theo Gmail) + u (tai khoan lien ket) phai co trong FROM noi dung bieu thuc nay.
const TK_TRANG_THAI = ["da_tao", "van_phong", "cho_duyet", "tu_choi", "chua_tao", "khong_gmail"] as const;
const TK_TRANG_THAI_SQL = `(CASE
  WHEN u.trang_thai_duyet = 'Da duyet' THEN 'da_tao'
  WHEN e.gmail IS NULL OR TRIM(e.gmail) NOT LIKE '%_@_%._%' OR TRIM(e.gmail) LIKE '% %' THEN 'khong_gmail'
  WHEN ug.trang_thai_duyet = 'Da duyet' AND EXISTS (SELECT 1 FROM ktv_lien_he kg WHERE kg.email_dang_nhap = ug.email) THEN 'da_tao'
  WHEN ug.trang_thai_duyet = 'Da duyet' THEN 'van_phong'
  WHEN ug.trang_thai_duyet = 'Cho duyet' THEN 'cho_duyet'
  WHEN ug.trang_thai_duyet = 'Tu choi' THEN 'tu_choi'
  ELSE 'chua_tao' END)`;

// GET /?search=&trang_thai=on|off&page=&pageSize= - danh sach danh ba, LEFT JOIN ktv_lien_he/users
// de hien "Tai khoan lien ket hien tai" (email_dang_nhap + bi_khoa) chi de tham khao, khong sua o day.
etxNhanSuSync.get("/", async (c) => {
  const search = c.req.query("search")?.trim().normalize("NFC");
  const trangThai = c.req.query("trang_thai")?.trim();
  const pageParam = c.req.query("page");

  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (search) {
    conditions.push(
      "(LOWER(e.ma_nhan_su) LIKE LOWER(?) OR LOWER(e.ho_ten) LIKE LOWER(?) OR LOWER(COALESCE(e.gmail,'')) LIKE LOWER(?) OR LOWER(COALESCE(e.ma_ktv,'')) LIKE LOWER(?))",
    );
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (trangThai === "on" || trangThai === "off") {
    conditions.push("e.trang_thai_lam_viec = ?");
    binds.push(trangThai);
  }
  const taiKhoan = c.req.query("tai_khoan")?.trim();
  if (taiKhoan && (TK_TRANG_THAI as readonly string[]).includes(taiKhoan)) {
    conditions.push(`${TK_TRANG_THAI_SQL} = ?`);
    binds.push(taiKhoan);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const selectCols = `e.*, k.email_dang_nhap as lien_ket_email, u.bi_khoa as lien_ket_bi_khoa, ${TK_TRANG_THAI_SQL} as tk_trang_thai`;
  const baseSql = `FROM etx_nhan_su e LEFT JOIN ktv_lien_he k ON k.ma_ktv = e.ma_ktv LEFT JOIN users u ON u.email = k.email_dang_nhap
    LEFT JOIN users ug ON ug.email = LOWER(TRIM(e.gmail)) ${where}`;

  if (!pageParam) {
    const { results } = await c.env.DB.prepare(`SELECT ${selectCols} ${baseSql} ORDER BY e.ho_ten`).bind(...binds).all();
    return c.json({ rows: results });
  }

  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(200, Math.max(1, (Math.trunc(Number(c.req.query("pageSize"))) || 50)));
  const offset = (page - 1) * pageSize;
  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total ${baseSql}`).bind(...binds).first<{ total: number }>();
  const { results } = await c.env.DB.prepare(`SELECT ${selectCols} ${baseSql} ORDER BY e.ho_ten LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

etxNhanSuSync.get("/sync-status", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT last_run_at, last_status, changed_count, last_error, ktv_tu_tao, tk_tu_duyet FROM etx_nhan_su_sync_state WHERE id = 1",
  ).first<EtxNhanSuSyncStateRow>();
  return c.json(row ?? { last_run_at: null, last_status: null, changed_count: 0, last_error: null });
});

etxNhanSuSync.post("/sync/run", async (c) => {
  await runEtxNhanSuSyncWithState(c.env, c.env.DB);
  const row = await c.env.DB.prepare(
    "SELECT last_run_at, last_status, changed_count, last_error, ktv_tu_tao, tk_tu_duyet FROM etx_nhan_su_sync_state WHERE id = 1",
  ).first<EtxNhanSuSyncStateRow>();
  return c.json(row);
});

// POST /tu-dong-ktv/run - CHI chay buoc tu tao KTV + duyet tai khoan (lib/etxTuDongKtv.ts) tren danh ba ETX DANG CO, khong
// keo lai tu ETX (vd Admin vua sua danh ba KTV, muon chay lai ngay). Dong bo thuong (/sync/run, cron) da tu chay buoc nay.
etxNhanSuSync.post("/tu-dong-ktv/run", async (c) => {
  const kq = await tuDongTaoKtvTuEtx(c.env.DB);
  return c.json(kq);
});

// POST /:maNhanSu/tao-tai-khoan - Admin tao tai khoan dat hang thu cong cho 1 nhan su (lib/etxTuDongKtv.ts taoTaiKhoanTuEtx).
etxNhanSuSync.post("/:maNhanSu/tao-tai-khoan", async (c) => {
  const kq = await taoTaiKhoanTuEtx(c.env.DB, c.req.param("maNhanSu"));
  if (!kq.ok) return c.json({ error: kq.error }, kq.error === "NOT_FOUND" ? 404 : 400);
  await resyncKhuVucDerivedFieldsForEmail(c.env.DB, kq.email);
  return c.json(kq);
});

// PATCH /:maNhanSu/ma-ktv - Admin gan/xoa lien ket toi ktv_lien_he.ma_ktv. Ap dung cascade khoa/mo
// khoa NGAY theo trang_thai_lam_viec HIEN TAI cua dong nay (khong doi toi lan sync ke tiep) - vd
// Admin gan KTV cho 1 nhan su dang "off" thi tai khoan phai khoa ngay luc gan.
etxNhanSuSync.patch("/:maNhanSu/ma-ktv", async (c) => {
  const maNhanSu = c.req.param("maNhanSu");
  const body = await c.req.json<{ ma_ktv?: string | null }>();
  const existing = await c.env.DB.prepare("SELECT trang_thai_lam_viec FROM etx_nhan_su WHERE ma_nhan_su = ?")
    .bind(maNhanSu)
    .first<{ trang_thai_lam_viec: string }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const maKtv = body.ma_ktv?.trim() || null;
  await c.env.DB.prepare("UPDATE etx_nhan_su SET ma_ktv = ?, updated_at = ? WHERE ma_nhan_su = ?")
    .bind(maKtv, nowVN(), maNhanSu)
    .run();

  if (maKtv) {
    await c.env.DB.prepare(
      `UPDATE users SET bi_khoa = ? WHERE email IN (SELECT email_dang_nhap FROM ktv_lien_he WHERE ma_ktv = ? AND email_dang_nhap IS NOT NULL)`,
    )
      .bind(existing.trang_thai_lam_viec === "off" ? 1 : 0, maKtv)
      .run();
  }

  return c.json({ ok: true });
});

export default etxNhanSuSync;
