// "Quỹ & chuyển tiền" (2026-09-29, ban 2 cua quy du KTV - migration 0047, lib/quyKtv.ts): so quan ly cac khoan
// chuyen tien Ke toan da duyet/tu choi (kem anh, so can/thuc nhan), so du quy tung nguoi nhan hang va so quy chi tiet;
// Ke toan/Admin dieu chinh quy (+/-) hoac ghi "Hoan tien cho KTV" (bat buoc ly do).
// Pham vi (chot nguoi dung "KT điều chỉnh, KTV+TN xem"): Admin/Ke toan/TN xem TAT CA; KTV xem cua chinh minh, Ve tinh xem
// quy cua Tram (don cua Ve tinh ghi nguoi nhan hang = Tram); vai tro khac khong vao.
import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { nowVN } from "../lib/vnTime";
import { lenhGhiQuy, phanBoQuy, soDuQuy } from "../lib/quyKtv";
import { bumpVersions } from "../lib/dataVersions";

const quyKtv = new Hono<{ Bindings: Env }>();
quyKtv.use("*", verifySessionMiddleware, loadUser, requireDatMuaLkArea);

type C = Context<{ Bindings: Env }>;

/** null = xem tat ca; mang = chi cac email nay; undefined = khong co quyen. */
function phamViXem(c: C): string[] | null | undefined {
  const u = c.get("user");
  if (u.vai_tro === "Admin" || u.la_ke_toan || u.la_tac_nghiep) return null;
  if (u.la_ve_tinh) return u.tram_cha ? [u.tram_cha] : [];
  if (u.la_ktv_dvbh) return [u.email];
  return undefined;
}
const coTheDieuChinh = (c: C) => c.get("user").vai_tro === "Admin" || !!c.get("user").la_ke_toan;

/** Dieu kien email (1 bind JSON - khong vuong gioi han 100 tham so D1). */
function locEmail(cot: string, emails: string[] | null, emailChon?: string): { sql: string; binds: unknown[] } {
  const parts: string[] = [];
  const binds: unknown[] = [];
  if (emails) {
    parts.push(`${cot} IN (SELECT value FROM json_each(?))`);
    binds.push(JSON.stringify(emails));
  }
  if (emailChon) {
    parts.push(`${cot} = ?`);
    binds.push(emailChon);
  }
  return { sql: parts.length ? ` AND ${parts.join(" AND ")}` : "", binds };
}

// GET /api/quy-ktv/tong-quan - so du quy + tong tien da nhan + con phai chuyen cua tung nguoi nhan hang.
quyKtv.get("/tong-quan", async (c) => {
  const pv = phamViXem(c);
  if (pv === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const loc = locEmail("ng.email", pv);
  const { results } = await c.env.DB.prepare(
    `WITH ng AS (
       SELECT email_nguoi_chuyen AS email FROM khoan_chuyen_tien
       UNION SELECT email FROM quy_ktv
       UNION SELECT nguoi_nhan_hang FROM phieu_xuat_kho
         WHERE nguoi_nhan_hang IS NOT NULL AND trang_thai_hien_tai != 'Ke toan huy'
           AND trang_thai_chuyen_tien IN ('Cho KTV chuyen', 'KTV da chuyen')
     )
     SELECT ng.email, COALESCE(q.so_du, 0) AS so_du, q.cap_nhat_luc,
       (SELECT COALESCE(SUM(k.so_tien_thuc_nhan), 0) FROM khoan_chuyen_tien k
          WHERE k.email_nguoi_chuyen = ng.email AND k.trang_thai = 'Da duyet') AS tong_thuc_nhan,
       (SELECT COUNT(*) FROM khoan_chuyen_tien k WHERE k.email_nguoi_chuyen = ng.email AND k.trang_thai = 'Da duyet') AS so_khoan_duyet,
       (SELECT COUNT(*) FROM khoan_chuyen_tien k WHERE k.email_nguoi_chuyen = ng.email AND k.trang_thai = 'Tu choi') AS so_lan_tu_choi,
       (SELECT MAX(k.duyet_luc) FROM khoan_chuyen_tien k WHERE k.email_nguoi_chuyen = ng.email) AS lan_cuoi,
       (SELECT COALESCE(SUM(MAX(COALESCE(p.so_tien_can_chuyen, 0) - p.da_thanh_toan, 0)), 0) FROM phieu_xuat_kho p
          WHERE p.nguoi_nhan_hang = ng.email AND p.trang_thai_hien_tai != 'Ke toan huy'
            AND p.trang_thai_chuyen_tien IN ('Cho KTV chuyen', 'KTV da chuyen')) AS con_phai_chuyen,
       (SELECT COUNT(*) FROM phieu_xuat_kho p
          WHERE p.nguoi_nhan_hang = ng.email AND p.trang_thai_hien_tai != 'Ke toan huy'
            AND p.trang_thai_chuyen_tien IN ('Cho KTV chuyen', 'KTV da chuyen')) AS so_phieu_cho
     FROM ng LEFT JOIN quy_ktv q ON q.email = ng.email
     WHERE ng.email IS NOT NULL${loc.sql}
     ORDER BY so_du DESC, con_phai_chuyen DESC, ng.email`,
  )
    .bind(...loc.binds)
    .all();
  return c.json({ rows: results, coTheDieuChinh: coTheDieuChinh(c) });
});

// GET /api/quy-ktv/khoan-chuyen?email=&trang_thai=&tu=&den=&q=&page=&pageSize= - so cac lan Ke toan duyet/tu choi.
// Khong truyen page = tra HET (tai Excel).
quyKtv.get("/khoan-chuyen", async (c) => {
  const pv = phamViXem(c);
  if (pv === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const loc = locEmail("k.email_nguoi_chuyen", pv, c.req.query("email")?.trim() || undefined);
  let where = `1 = 1${loc.sql}`;
  const binds = [...loc.binds];
  const trangThai = c.req.query("trang_thai");
  if (trangThai === "Da duyet" || trangThai === "Tu choi") {
    where += " AND k.trang_thai = ?";
    binds.push(trangThai);
  }
  const loai = c.req.query("loai");
  if (loai === "du") where += " AND k.trang_thai = 'Da duyet' AND k.so_tien_thuc_nhan > k.so_tien_can_chuyen";
  if (loai === "thieu") where += " AND k.trang_thai = 'Da duyet' AND k.so_tien_thuc_nhan < k.so_tien_can_chuyen";
  const tu = c.req.query("tu");
  const den = c.req.query("den");
  if (tu && /^\d{4}-\d{2}-\d{2}$/.test(tu)) { where += " AND k.duyet_luc >= ?"; binds.push(tu); }
  if (den && /^\d{4}-\d{2}-\d{2}$/.test(den)) { where += " AND k.duyet_luc < date(?, '+1 day')"; binds.push(den); }
  const q = c.req.query("q")?.trim();
  if (q) {
    where += " AND (k.phieu_xuat_kho_id LIKE ? OR p.ma_xuat_kho LIKE ? OR k.email_nguoi_chuyen LIKE ?)";
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const pageParam = c.req.query("page");
  const page = Math.max(1, Number(pageParam ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const from = "FROM khoan_chuyen_tien k LEFT JOIN phieu_xuat_kho p ON p.id = k.phieu_xuat_kho_id";
  const tong = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN k.trang_thai = 'Da duyet' THEN k.so_tien_thuc_nhan END), 0) AS tong_thuc_nhan,
       COALESCE(SUM(CASE WHEN k.trang_thai = 'Da duyet' AND k.lich_su = 0 AND k.so_tien_thuc_nhan > k.so_tien_can_chuyen
                         THEN k.so_tien_thuc_nhan - k.so_tien_can_chuyen END), 0) AS tong_du
     ${from} WHERE ${where}`,
  ).bind(...binds).first<{ total: number; tong_thuc_nhan: number; tong_du: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT k.*, p.ma_xuat_kho, p.loai_don, p.trang_thai_hien_tai AS trang_thai_phieu
     ${from} WHERE ${where} ORDER BY k.duyet_luc DESC, k.id DESC ${pageParam ? "LIMIT ? OFFSET ?" : ""}`,
  )
    .bind(...binds, ...(pageParam ? [pageSize, (page - 1) * pageSize] : []))
    .all();
  return c.json({ rows: results, page, pageSize, total: tong?.total ?? 0, tongThucNhan: tong?.tong_thuc_nhan ?? 0, tongDu: tong?.tong_du ?? 0 });
});

// GET /api/quy-ktv/giao-dich?email=&page=&pageSize= - so quy (chi ghi them), moi nhat truoc.
quyKtv.get("/giao-dich", async (c) => {
  const pv = phamViXem(c);
  if (pv === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const loc = locEmail("g.email", pv, c.req.query("email")?.trim() || undefined);
  const loai = c.req.query("loai");
  let where = `1 = 1${loc.sql}`;
  const binds = [...loc.binds];
  if (loai && ["nop_tien", "tra_phieu", "hoan_phieu", "dieu_chinh", "hoan_tien_ktv"].includes(loai)) {
    where += " AND g.loai = ?";
    binds.push(loai);
  }
  const pageParam = c.req.query("page");
  const page = Math.max(1, Number(pageParam ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const tong = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM quy_ktv_giao_dich g WHERE ${where}`).bind(...binds).first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT g.*, p.ma_xuat_kho FROM quy_ktv_giao_dich g LEFT JOIN phieu_xuat_kho p ON p.id = g.phieu_xuat_kho_id
     WHERE ${where} ORDER BY g.id DESC ${pageParam ? "LIMIT ? OFFSET ?" : ""}`,
  )
    .bind(...binds, ...(pageParam ? [pageSize, (page - 1) * pageSize] : []))
    .all();
  return c.json({ rows: results, page, pageSize, total: tong?.total ?? 0 });
});

// POST /api/quy-ktv/dieu-chinh { email, loai: 'dieu_chinh' | 'hoan_tien_ktv', so_tien, ghi_chu } - Ke toan/Admin.
// dieu_chinh: so_tien co dau (+ cong / - tru, vd sua Ke toan nhap nham so thuc nhan). hoan_tien_ktv: so duong = tien
// Ke toan da tra lai KTV (tru quy). Quy khong du -> 409 QUY_KHONG_DU (CHECK so_du >= 0). Cong quy -> tu tru phieu cho.
quyKtv.post("/dieu-chinh", async (c) => {
  if (!coTheDieuChinh(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ email?: string; loai?: string; so_tien?: number; ghi_chu?: string }>();
  const email = body.email?.trim();
  const ghiChu = body.ghi_chu?.trim();
  if (!email) return c.json({ error: "MISSING_EMAIL" }, 400);
  if (!ghiChu) return c.json({ error: "MISSING_LY_DO" }, 400);
  if (body.loai !== "dieu_chinh" && body.loai !== "hoan_tien_ktv") return c.json({ error: "INVALID_LOAI" }, 400);
  const soTien = Number(body.so_tien);
  if (!Number.isInteger(soTien) || soTien === 0 || Math.abs(soTien) > 10_000_000_000) return c.json({ error: "INVALID_SO_TIEN" }, 400);
  if (body.loai === "hoan_tien_ktv" && soTien < 0) return c.json({ error: "INVALID_SO_TIEN" }, 400);
  const tonTai = await c.env.DB.prepare("SELECT 1 AS x FROM users WHERE email = ?").bind(email).first();
  if (!tonTai) return c.json({ error: "USER_NOT_FOUND" }, 404);

  const user = c.get("user");
  const bienDong = body.loai === "hoan_tien_ktv" ? -soTien : soTien;
  try {
    await c.env.DB.batch(
      lenhGhiQuy(c.env.DB, { email, loai: body.loai, soTien: bienDong, nguoi: user.email, now: nowVN(), ghiChu }),
    );
  } catch {
    return c.json({ error: "QUY_KHONG_DU", so_du: await soDuQuy(c.env.DB, email) }, 409);
  }
  if (bienDong > 0) await phanBoQuy(c.env.DB, email, user.email);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, so_du: await soDuQuy(c.env.DB, email) });
});

export default quyKtv;
