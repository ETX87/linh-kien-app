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
import { khuVucViewEmailInSql } from "../lib/scopeDatMua";
import { lenhGhiQuy, phanBoQuy, soDuQuy, suaThucNhanKhoan, huyKhoanChuyen, KHOAN_HUY_DUOC_SQL } from "../lib/quyKtv";
import { xuLyDonChoThanhToan } from "../lib/tuDongDuyet";
import { notifyWorkflowTask, emailGsListForPxk, pastActorsFor } from "../lib/taskNotify";
import { bumpVersions } from "../lib/dataVersions";
import { laEmailKhLeSql } from "../lib/khachLe";
import { taoPhieuHoanTien, xuLyPhieuHoanTien, hanhDongDuoc, type PhieuHoanTienRow, type HanhDongHoanTien } from "../lib/phieuHoanTien";

const quyKtv = new Hono<{ Bindings: Env }>();
quyKtv.use("*", verifySessionMiddleware, loadUser, requireDatMuaLkArea);

type C = Context<{ Bindings: Env }>;

/** null = xem tat ca; mang = chi cac email nay; undefined = khong co quyen. */
async function phamViXem(c: C): Promise<string[] | null | undefined> {
  const u = c.get("user");
  if (u.vai_tro === "Admin" || u.la_ke_toan || u.la_tac_nghiep || u.la_mua_hang) return null; // Mua hang: xem, khong dieu chinh
  if (u.la_ve_tinh) return u.tram_cha ? [u.tram_cha] : [];
  if (u.la_ktv_dvbh) return [u.email];
  // View (2026-10-14, "xem full các menu"): chi doc, quy cua KTV thuoc Khu vuc duoc gan (cung tap voi khuVucViewEmailInSql).
  // Chua gan Khu vuc nao -> xem tat ca (chot 2026-10-15).
  if (u.la_view) {
    const coGan = await c.env.DB.prepare("SELECT 1 FROM user_khu_vuc WHERE user_email = ? LIMIT 1").bind(u.email).first();
    if (!coGan) return null;
    const { results } = await c.env.DB.prepare(khuVucViewEmailInSql().slice(1, -1)).bind(u.email).all<{ email_dang_nhap: string }>();
    return (results ?? []).map((r) => r.email_dang_nhap);
  }
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

// KET QUA OCR SO TIEN THEO URL ANH (migration 0058) - may nao doc xong thi ghi, may khac lay lai khong doc nua. Chi la so
// canh bao (khong tinh tien) nen moi tai khoan vao duoc module deu doc/ghi; gioi han so luong + do dai URL.
const OCR_TOI_DA = 100;
const urlOcrHopLe = (u: unknown): u is string => typeof u === "string" && u.length <= 500 && /^https:\/\//.test(u);

// GET /api/quy-ktv/ocr-anh?urls=<JSON mang URL>&phien_ban=N -> { ket_qua: {url: so|null} } (chi ket qua dung phien ban).
quyKtv.get("/ocr-anh", async (c) => {
  let urls: unknown;
  try {
    urls = JSON.parse(c.req.query("urls") ?? "[]");
  } catch {
    return c.json({ error: "INVALID_URLS" }, 400);
  }
  const pb = Number(c.req.query("phien_ban"));
  if (!Array.isArray(urls) || !Number.isInteger(pb)) return c.json({ error: "INVALID_URLS" }, 400);
  const ds = urls.filter(urlOcrHopLe).slice(0, OCR_TOI_DA);
  if (!ds.length) return c.json({ ket_qua: {} });
  const { results } = await c.env.DB.prepare(
    "SELECT url, so_tien FROM ocr_anh_tien WHERE phien_ban = ? AND url IN (SELECT value FROM json_each(?))",
  ).bind(pb, JSON.stringify(ds)).all<{ url: string; so_tien: number | null }>();
  const ket_qua: Record<string, number | null> = {};
  for (const r of results) ket_qua[r.url] = r.so_tien;
  return c.json({ ket_qua });
});

// POST /api/quy-ktv/ocr-anh { phien_ban, ket_qua: {url: so|null} } - ghi de ket qua phien ban CU HON hoac bang.
quyKtv.post("/ocr-anh", async (c) => {
  const body = await c.req.json<{ phien_ban?: unknown; ket_qua?: unknown }>().catch(() => ({}) as { phien_ban?: unknown; ket_qua?: unknown });
  const pb = body.phien_ban;
  if (!Number.isInteger(pb) || !body.ket_qua || typeof body.ket_qua !== "object") return c.json({ error: "INVALID_BODY" }, 400);
  const email = c.get("user").email;
  const now = nowVN();
  const lenh = Object.entries(body.ket_qua as Record<string, unknown>)
    .filter(([u, so]) => urlOcrHopLe(u) && (so === null || (Number.isInteger(so) && (so as number) >= 0 && (so as number) <= 5_000_000_000)))
    .slice(0, OCR_TOI_DA)
    .map(([u, so]) =>
      c.env.DB.prepare(
        `INSERT INTO ocr_anh_tien (url, so_tien, phien_ban, nguoi_doc, doc_luc) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET so_tien = excluded.so_tien, phien_ban = excluded.phien_ban, nguoi_doc = excluded.nguoi_doc,
           doc_luc = excluded.doc_luc
         WHERE excluded.phien_ban > ocr_anh_tien.phien_ban
            OR (excluded.phien_ban = ocr_anh_tien.phien_ban AND ocr_anh_tien.so_tien IS NULL AND excluded.so_tien IS NOT NULL)`,
      ).bind(u, so as number | null, pb as number, email, now),
    );
  if (lenh.length) await c.env.DB.batch(lenh);
  return c.json({ ok: true, so_dong: lenh.length });
});

// GET /api/quy-ktv/tong-quan -so du quy + tong tien da nhan + con phai chuyen cua tung nguoi nhan hang.
quyKtv.get("/tong-quan", async (c) => {
  const pv = await phamViXem(c);
  if (pv === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const loc = locEmail("ng.email", pv);
  const { results } = await c.env.DB.prepare(
    `WITH ng AS (
       SELECT email_nguoi_chuyen AS email FROM khoan_chuyen_tien
       UNION SELECT email FROM quy_ktv
       UNION SELECT email FROM phieu_hoan_tien WHERE trang_thai IN ('Cho KTV xac nhan', 'Cho KT xac nhan')
       UNION SELECT nguoi_nhan_hang FROM phieu_xuat_kho
         WHERE nguoi_nhan_hang IS NOT NULL AND trang_thai_hien_tai != 'Ke toan huy'
           AND trang_thai_chuyen_tien IN ('Cho KTV chuyen', 'KTV da chuyen')
     )
     SELECT ng.email, COALESCE(q.so_du, 0) AS so_du, q.cap_nhat_luc,
       (SELECT COALESCE(SUM(h.so_tien), 0) FROM phieu_hoan_tien h
          WHERE h.email = ng.email AND h.trang_thai IN ('Cho KTV xac nhan', 'Cho KT xac nhan')) AS tam_giu,
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
  const pv = await phamViXem(c);
  if (pv === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const loc = locEmail("k.email_nguoi_chuyen", pv, c.req.query("email")?.trim() || undefined);
  let where = `1 = 1${loc.sql}`;
  const binds = [...loc.binds];
  const trangThai = c.req.query("trang_thai");
  if (trangThai === "Da duyet" || trangThai === "Tu choi" || trangThai === "Da huy") {
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
  const page = Math.max(1, (Math.trunc(Number(pageParam)) || 1));
  const pageSize = Math.min(200, Math.max(1, (Math.trunc(Number(c.req.query("pageSize"))) || 20)));
  const from = "FROM khoan_chuyen_tien k LEFT JOIN phieu_xuat_kho p ON p.id = k.phieu_xuat_kho_id";
  const tong = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN k.trang_thai = 'Da duyet' THEN k.so_tien_thuc_nhan END), 0) AS tong_thuc_nhan,
       COALESCE(SUM(CASE WHEN k.trang_thai = 'Da duyet' AND k.lich_su = 0 AND k.so_tien_thuc_nhan > k.so_tien_can_chuyen
                         THEN k.so_tien_thuc_nhan - k.so_tien_can_chuyen END), 0) AS tong_du
     ${from} WHERE ${where}`,
  ).bind(...binds).first<{ total: number; tong_thuc_nhan: number; tong_du: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT k.*, p.ma_xuat_kho, p.loai_don, p.trang_thai_hien_tai AS trang_thai_phieu,
       CASE WHEN ${KHOAN_HUY_DUOC_SQL} THEN 1 ELSE 0 END AS huy_duoc,
       -- Anh da duoc ghi nhan o khoan DA DUYET TRUOC cua cung phieu (anh giu qua cac lan chuyen bo sung) - modal "Sửa
       -- tiền" chi doi chieu tong tien doc tu anh MOI cua khoan nay (migration 0051).
       (SELECT json_group_array(j.value) FROM khoan_chuyen_tien k2,
          json_each(CASE WHEN json_valid(k2.anh) THEN k2.anh ELSE '[]' END) j
        WHERE k2.phieu_xuat_kho_id = k.phieu_xuat_kho_id AND k2.trang_thai = 'Da duyet' AND k2.id < k.id) AS anh_truoc
     ${from} WHERE ${where} ORDER BY k.duyet_luc DESC, k.id DESC ${pageParam ? "LIMIT ? OFFSET ?" : ""}`,
  )
    .bind(...binds, ...(pageParam ? [pageSize, (page - 1) * pageSize] : []))
    .all();
  return c.json({ rows: results, page, pageSize, total: tong?.total ?? 0, tongThucNhan: tong?.tong_thuc_nhan ?? 0, tongDu: tong?.tong_du ?? 0 });
});

// GET /api/quy-ktv/giao-dich?email=&page=&pageSize= - so quy (chi ghi them), moi nhat truoc.
quyKtv.get("/giao-dich", async (c) => {
  const pv = await phamViXem(c);
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
  const page = Math.max(1, (Math.trunc(Number(pageParam)) || 1));
  const pageSize = Math.min(200, Math.max(1, (Math.trunc(Number(c.req.query("pageSize"))) || 20)));
  const tong = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM quy_ktv_giao_dich g WHERE ${where}`).bind(...binds).first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT g.*, p.ma_xuat_kho, ht.trang_thai AS ht_trang_thai FROM quy_ktv_giao_dich g LEFT JOIN phieu_xuat_kho p ON p.id = g.phieu_xuat_kho_id
       LEFT JOIN phieu_hoan_tien ht ON ht.id = g.phieu_hoan_tien_id
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
  // Hoan tien cho KTV = phieu hoan tien (KTV xac nhan, migration 0090). Tru thang chi con cho KH le (khong co tai khoan de xac nhan).
  if (body.loai === "hoan_tien_ktv") {
    const khLe = await c.env.DB.prepare(`SELECT ${laEmailKhLeSql("?1")} AS la`).bind(email).first<{ la: number }>();
    if (!khLe?.la) return c.json({ error: "DUNG_PHIEU_HOAN_TIEN" }, 409);
  }

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

// ===== PHIẾU HOÀN TIỀN (migration 0090, lib/phieuHoanTien.ts) =====

type BodyHt = { email?: string; so_tien?: number; ghi_chu?: string; hanh_dong?: string };

// GET /api/quy-ktv/phieu-hoan-tien?trang_thai=__MO__|<trang thai>&email=&page=&pageSize= - theo pham vi xem quy.
quyKtv.get("/phieu-hoan-tien", async (c) => {
  const pv = await phamViXem(c);
  if (pv === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const loc = locEmail("h.email", pv, c.req.query("email")?.trim() || undefined);
  let where = `1 = 1${loc.sql}`;
  const binds = [...loc.binds];
  const tt = c.req.query("trang_thai");
  if (tt === "__MO__") where += " AND h.trang_thai IN ('Cho KTV xac nhan', 'Cho KT xac nhan')";
  else if (tt && ["Cho KTV xac nhan", "Cho KT xac nhan", "Da hoan tien", "Da huy"].includes(tt)) {
    where += " AND h.trang_thai = ?";
    binds.push(tt);
  }
  const page = Math.max(1, (Math.trunc(Number(c.req.query("page"))) || 1));
  const pageSize = Math.min(200, Math.max(1, (Math.trunc(Number(c.req.query("pageSize"))) || 20)));
  // So dem theo trang thai: cung pham vi + nguoi dang loc, KHONG theo chinh bo loc trang thai (de hien so tren tung chip).
  const dem = await c.env.DB.prepare(
    `SELECT COUNT(*) AS tat_ca,
       SUM(CASE WHEN h.trang_thai = 'Cho KTV xac nhan' THEN 1 ELSE 0 END) AS cho_ktv,
       SUM(CASE WHEN h.trang_thai = 'Cho KT xac nhan' THEN 1 ELSE 0 END) AS cho_kt,
       SUM(CASE WHEN h.trang_thai = 'Da hoan tien' THEN 1 ELSE 0 END) AS da_hoan,
       SUM(CASE WHEN h.trang_thai = 'Da huy' THEN 1 ELSE 0 END) AS da_huy
     FROM phieu_hoan_tien h WHERE 1 = 1${loc.sql}`,
  ).bind(...loc.binds).first<Record<string, number | null>>();
  const tong = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM phieu_hoan_tien h WHERE ${where}`).bind(...binds).first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT h.*,
       (SELECT l.ghi_chu FROM phieu_hoan_tien_log l WHERE l.phieu_hoan_tien_id = h.id ORDER BY l.id DESC LIMIT 1) AS ghi_chu_cuoi,
       (SELECT l.hanh_dong FROM phieu_hoan_tien_log l WHERE l.phieu_hoan_tien_id = h.id ORDER BY l.id DESC LIMIT 1) AS hanh_dong_cuoi,
       (SELECT l.nguoi FROM phieu_hoan_tien_log l WHERE l.phieu_hoan_tien_id = h.id ORDER BY l.id DESC LIMIT 1) AS nguoi_cuoi
     FROM phieu_hoan_tien h WHERE ${where}
     ORDER BY CASE h.trang_thai WHEN 'Cho KT xac nhan' THEN 0 WHEN 'Cho KTV xac nhan' THEN 1 ELSE 2 END, h.cap_nhat_luc DESC, h.id DESC
     LIMIT ? OFFSET ?`,
  ).bind(...binds, pageSize, (page - 1) * pageSize).all<PhieuHoanTienRow>();
  const u = c.get("user");
  return c.json({
    rows: results.map((r) => ({ ...r, hanh_dong: hanhDongDuoc(r, u) })),
    page,
    pageSize,
    total: tong?.total ?? 0,
    dem: {
      __MO__: (dem?.cho_ktv ?? 0) + (dem?.cho_kt ?? 0),
      "Cho KTV xac nhan": dem?.cho_ktv ?? 0,
      "Cho KT xac nhan": dem?.cho_kt ?? 0,
      "Da hoan tien": dem?.da_hoan ?? 0,
      "Da huy": dem?.da_huy ?? 0,
      "": dem?.tat_ca ?? 0,
    },
    coTheTao: coTheDieuChinh(c),
  });
});

// GET /api/quy-ktv/phieu-hoan-tien/:id - chi tiet + lich su (ghi chu tung buoc).
quyKtv.get("/phieu-hoan-tien/:id", async (c) => {
  const pv = await phamViXem(c);
  if (pv === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const p = await c.env.DB.prepare("SELECT * FROM phieu_hoan_tien WHERE id = ?").bind(c.req.param("id")).first<PhieuHoanTienRow>();
  if (!p || (pv && !pv.includes(p.email))) return c.json({ error: "NOT_FOUND" }, 404);
  const { results: log } = await c.env.DB.prepare(
    "SELECT id, hanh_dong, trang_thai, ghi_chu, nguoi, ngay_tao FROM phieu_hoan_tien_log WHERE phieu_hoan_tien_id = ? ORDER BY id",
  ).bind(p.id).all();
  return c.json({ phieu: { ...p, hanh_dong: hanhDongDuoc(p, c.get("user")) }, log, so_du: await soDuQuy(c.env.DB, p.email) });
});

// POST /api/quy-ktv/phieu-hoan-tien { email, so_tien, ghi_chu? } - Ke toan/Admin tao phieu, tam giu tien khoi quy.
quyKtv.post("/phieu-hoan-tien", async (c) => {
  if (!coTheDieuChinh(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<BodyHt>().catch((): BodyHt => ({}));
  const email = body.email?.trim();
  if (!email) return c.json({ error: "MISSING_EMAIL" }, 400);
  const soTien = Number(body.so_tien);
  if (!Number.isInteger(soTien) || soTien <= 0 || soTien > 10_000_000_000) return c.json({ error: "INVALID_SO_TIEN" }, 400);
  const nd = await c.env.DB.prepare(`SELECT ${laEmailKhLeSql("users.email")} AS kh_le FROM users WHERE email = ?`).bind(email).first<{ kh_le: number }>();
  if (!nd) return c.json({ error: "USER_NOT_FOUND" }, 404);
  if (nd.kh_le) return c.json({ error: "KH_LE_HOAN_TRUC_TIEP" }, 409);
  const user = c.get("user");
  const kq = await taoPhieuHoanTien(c.env, { email, soTien, ghiChu: body.ghi_chu?.trim().slice(0, 500) || null, nguoi: user.email }, (p) =>
    c.executionCtx.waitUntil(p),
  );
  if ("error" in kq) return c.json({ error: kq.error, so_du: kq.so_du }, kq.status);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, ...kq }, 201);
});

// POST /api/quy-ktv/phieu-hoan-tien/:id/xu-ly { hanh_dong, ghi_chu? } - KTV (chu quy): ktv_xac_nhan | ktv_tu_choi; Ke toan/Admin:
// kt_xac_nhan_huy | kt_tu_choi | kt_huy. Ghi chu tuy chon o moi buoc.
quyKtv.post("/phieu-hoan-tien/:id/xu-ly", async (c) => {
  const body = await c.req.json<BodyHt>().catch((): BodyHt => ({}));
  const user = c.get("user");
  const kq = await xuLyPhieuHoanTien(c.env, c.req.param("id"), body.hanh_dong as HanhDongHoanTien, body.ghi_chu?.trim().slice(0, 500) || null, user, (p) =>
    c.executionCtx.waitUntil(p),
  );
  if ("error" in kq) return c.json({ error: kq.error }, kq.status);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, ...kq });
});

const tienVnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/** Bao KTV nhan hang (+ nguoi da xu ly phieu) khi Ke toan sua/huy 1 khoan cua ho. */
function baoKtv(c: C, email: string, pxkId: string, body: string) {
  c.executionCtx.waitUntil(
    (async () => {
      const user = c.get("user");
      await notifyWorkflowTask(c.env, c.env.DB, {
        cat1Emails: [email],
        otherRoles: [],
        emailGsList: await emailGsListForPxk(c.env.DB, pxkId),
        pastActors: (await pastActorsFor(c.env.DB, "phieu_xuat_kho_log", "phieu_xuat_kho_id", pxkId, user.email)).filter((e) => e !== email),
        title: "Quỹ & chuyển tiền",
        body,
        linkType: "phieu_xuat_kho",
        linkId: pxkId,
      });
    })(),
  );
}

// POST /api/quy-ktv/khoan-chuyen/:id/sua { so_tien_thuc_nhan, ly_do } - Ke toan/Admin sua so thuc nhan cua 1 khoan DA
// DUYET (migration 0049, lib/quyKtv.ts suaThucNhanKhoan). Tang = cong quy (tu tru phieu con thieu); giam = tru quy, chi
// khi quy con du (409 QUY_KHONG_DU kem message giai thich).
quyKtv.post("/khoan-chuyen/:id/sua", async (c) => {
  if (!coTheDieuChinh(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const khoanId = Number(c.req.param("id"));
  const body = await c.req.json<{ so_tien_thuc_nhan?: number; ly_do?: string }>();
  const lyDo = body.ly_do?.trim();
  const moi = Number(body.so_tien_thuc_nhan);
  if (!Number.isInteger(khoanId)) return c.json({ error: "NOT_FOUND" }, 404);
  if (!lyDo) return c.json({ error: "MISSING_LY_DO" }, 400);
  if (!Number.isInteger(moi) || moi <= 0 || moi > 10_000_000_000) return c.json({ error: "INVALID_SO_TIEN_THUC_NHAN" }, 400);
  const user = c.get("user");
  const kq = await suaThucNhanKhoan(c.env.DB, khoanId, moi, lyDo.slice(0, 500), user.email);
  if ("error" in kq) return c.json({ error: kq.error, message: kq.message, so_du: kq.so_du }, kq.status);
  // Sua tang -> phieu co the vua du tien: don "Cho thanh toan" (thieu hang) trong phieu -> kiem tra ton lai (2026-10-14).
  if (kq.pxkId) await xuLyDonChoThanhToan(c.env, c.env.DB, kq.pxkId, user.email, (p) => c.executionCtx.waitUntil(p));
  baoKtv(c, kq.email, kq.pxkId,
    `PXK ${kq.pxkId}: Kế toán sửa số tiền thực nhận ${tienVnd(kq.cu)} → ${tienVnd(kq.moi)} (${lyDo}). Quỹ của bạn hiện còn ${tienVnd(kq.soDuQuy)}`);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, ...kq });
});

// POST /api/quy-ktv/khoan-chuyen/:id/huy { ly_do } - Ke toan/Admin HUY 1 khoan da duyet (duyet nham). Phieu ve "KTV da
// chuyen" cho duyet lai (lib/quyKtv.ts huyKhoanChuyen - dieu kien = KHOAN_HUY_DUOC_SQL + quy du).
quyKtv.post("/khoan-chuyen/:id/huy", async (c) => {
  if (!coTheDieuChinh(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const khoanId = Number(c.req.param("id"));
  const body = await c.req.json<{ ly_do?: string }>();
  const lyDo = body.ly_do?.trim();
  if (!Number.isInteger(khoanId)) return c.json({ error: "NOT_FOUND" }, 404);
  if (!lyDo) return c.json({ error: "MISSING_LY_DO" }, 400);
  const user = c.get("user");
  const kq = await huyKhoanChuyen(c.env.DB, khoanId, lyDo.slice(0, 500), user.email);
  if ("error" in kq) return c.json({ error: kq.error, message: kq.message, so_du: kq.so_du }, kq.status);
  baoKtv(c, kq.email, kq.pxkId,
    `PXK ${kq.pxkId}: Kế toán hủy xác nhận đã nhận ${tienVnd(kq.thucNhan)} (${lyDo})` +
      (kq.phieuDaHuy ? "" : " — phiếu chờ Kế toán kiểm tra lại khoản chuyển của bạn"));
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, ...kq });
});

export default quyKtv;
