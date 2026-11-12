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
import { khoaQuy, laKhoaQuyKh, giaiKhoaQuy } from "../lib/quyKhoa";
import { lenhGhiQuy, phanBoQuy, soDuQuy, suaThucNhanKhoan, huyKhoanChuyen, KHOAN_HUY_DUOC_SQL } from "../lib/quyKtv";
import { xuLyDonChoThanhToan } from "../lib/tuDongDuyet";
import { notifyWorkflowTask, emailGsListForPxk, pastActorsFor } from "../lib/taskNotify";
import { bumpVersions } from "../lib/dataVersions";
import { laEmailKhLeSql } from "../lib/khachLe";
import { guiNopTien, xuLyNopTien, hanhDongNopTien, laKeToanNopTien, quyCuaNguoiGui, type NopTienRow, type HanhDongNopTien } from "../lib/nopTienQuy";
import { nhanAnhTaiLen } from "../lib/anhUpload";
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
  // QC dat hang nhu KTV (v1.451): quy cua chinh minh.
  if (u.vai_tro === "QC") return [u.email];
  // Giam sat (chot 2026-10-21, "ngoài vai trò kế toán, danh sách quỹ sẽ chỉ hiện quỹ theo tài khoản do giám sát đó quản lý"): CHI quy
  // cua tai khoan GS quan ly (users.giam_sat_quan_ly = GS - suy tu Khu vuc ma GS phu trach, lib/khuVucSync.ts) + KTV thuoc "Khu vuc
  // xem them" Admin gan (user_khu_vuc, cung quy tac gsKhuVucXemThemSql) + chinh GS (GS cung dat/nhan hang). Chi xem.
  if (u.vai_tro === "Giam sat") {
    const { results } = await c.env.DB.prepare(
      `SELECT email FROM users WHERE giam_sat_quan_ly = ?1
       UNION SELECT k.email_dang_nhap FROM ktv_lien_he k
         WHERE k.email_dang_nhap IS NOT NULL AND k.khu_vuc_ma IN (SELECT khu_vuc_ma FROM user_khu_vuc WHERE user_email = ?1)
       UNION SELECT ?1`,
    ).bind(u.email).all<{ email: string }>();
    return (results ?? []).map((r) => r.email);
  }
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

/** ?quy=kh | ktv (2026-11-09, tab rieng "Quỹ KH chuyển (HĐ)"): "kh" = chi "Quỹ xuất hóa đơn do KH chuyển" (khoa khhd:), "ktv" = chi quy du
 * KTV, khong truyen = ca 2 (tuong thich ban cu). */
function loaiQuyLoc(c: C): "kh" | "ktv" | null {
  const q = c.req.query("quy");
  return q === "kh" || q === "ktv" ? q : null;
}

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
  const loc = locEmail("ng.nguoi", pv);
  const { results } = await c.env.DB.prepare(
    // 1 dong / QUY (2026-11-09, migration 0111): quy du KTV (email) va "Quỹ xuất hóa đơn do KH chuyển" (khhd:email) la 2 dong rieng -
    // khoan chuyen / phieu cho tien tinh vao dung quy theo phieu_xuat_kho.quy_kh. ng.nguoi = nguoi nhan hang (loc pham vi theo nguoi).
    `WITH ng0 AS (
       SELECT CASE WHEN COALESCE(kp.quy_kh, 0) = 1 THEN 'khhd:' || k.email_nguoi_chuyen ELSE k.email_nguoi_chuyen END AS email
         FROM khoan_chuyen_tien k LEFT JOIN phieu_xuat_kho kp ON kp.id = k.phieu_xuat_kho_id
       UNION SELECT email FROM quy_ktv
       UNION SELECT email FROM phieu_hoan_tien WHERE trang_thai IN ('Cho KTV xac nhan', 'Cho KT xac nhan')
       UNION SELECT CASE WHEN COALESCE(quy_kh, 0) = 1 THEN 'khhd:' || nguoi_nhan_hang ELSE nguoi_nhan_hang END FROM phieu_xuat_kho
         WHERE nguoi_nhan_hang IS NOT NULL AND trang_thai_hien_tai != 'Ke toan huy'
           AND trang_thai_chuyen_tien IN ('Cho KTV chuyen', 'KTV da chuyen')
     ),
     ng AS (
       SELECT email, CASE WHEN email LIKE 'khhd:%' THEN substr(email, 6) ELSE email END AS nguoi,
              CASE WHEN email LIKE 'khhd:%' THEN 1 ELSE 0 END AS quy_kh
       FROM ng0
     )
     SELECT ng.email, ng.nguoi, ng.quy_kh, COALESCE(q.so_du, 0) AS so_du, q.cap_nhat_luc,
       (SELECT COALESCE(SUM(h.so_tien), 0) FROM phieu_hoan_tien h
          WHERE h.email = ng.email AND h.trang_thai IN ('Cho KTV xac nhan', 'Cho KT xac nhan')) AS tam_giu,
       (SELECT COALESCE(SUM(k.so_tien_thuc_nhan), 0) FROM khoan_chuyen_tien k JOIN phieu_xuat_kho kp ON kp.id = k.phieu_xuat_kho_id
          WHERE k.email_nguoi_chuyen = ng.nguoi AND COALESCE(kp.quy_kh, 0) = ng.quy_kh AND k.trang_thai = 'Da duyet') AS tong_thuc_nhan,
       (SELECT COUNT(*) FROM khoan_chuyen_tien k JOIN phieu_xuat_kho kp ON kp.id = k.phieu_xuat_kho_id
          WHERE k.email_nguoi_chuyen = ng.nguoi AND COALESCE(kp.quy_kh, 0) = ng.quy_kh AND k.trang_thai = 'Da duyet') AS so_khoan_duyet,
       (SELECT COUNT(*) FROM khoan_chuyen_tien k JOIN phieu_xuat_kho kp ON kp.id = k.phieu_xuat_kho_id
          WHERE k.email_nguoi_chuyen = ng.nguoi AND COALESCE(kp.quy_kh, 0) = ng.quy_kh AND k.trang_thai = 'Tu choi') AS so_lan_tu_choi,
       (SELECT MAX(k.duyet_luc) FROM khoan_chuyen_tien k JOIN phieu_xuat_kho kp ON kp.id = k.phieu_xuat_kho_id
          WHERE k.email_nguoi_chuyen = ng.nguoi AND COALESCE(kp.quy_kh, 0) = ng.quy_kh) AS lan_cuoi,
       (SELECT COALESCE(SUM(MAX(COALESCE(p.so_tien_can_chuyen, 0) - p.da_thanh_toan, 0)), 0) FROM phieu_xuat_kho p
          WHERE p.nguoi_nhan_hang = ng.nguoi AND COALESCE(p.quy_kh, 0) = ng.quy_kh AND p.trang_thai_hien_tai != 'Ke toan huy'
            AND p.trang_thai_chuyen_tien IN ('Cho KTV chuyen', 'KTV da chuyen')) AS con_phai_chuyen,
       (SELECT COUNT(*) FROM phieu_xuat_kho p
          WHERE p.nguoi_nhan_hang = ng.nguoi AND COALESCE(p.quy_kh, 0) = ng.quy_kh AND p.trang_thai_hien_tai != 'Ke toan huy'
            AND p.trang_thai_chuyen_tien IN ('Cho KTV chuyen', 'KTV da chuyen')) AS so_phieu_cho
     FROM ng LEFT JOIN quy_ktv q ON q.email = ng.email
     WHERE ng.email IS NOT NULL${loc.sql}${loaiQuyLoc(c) ? ` AND ng.quy_kh = ${loaiQuyLoc(c) === "kh" ? 1 : 0}` : ""}
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
  // ?email= co the la KHOA quy (khhd:<email>) -> loc theo nguoi + quy KH.
  const emailQ = c.req.query("email")?.trim() || undefined;
  const loaiQuy = emailQ && laKhoaQuyKh(emailQ) ? "kh" : loaiQuyLoc(c);
  const loc = locEmail("k.email_nguoi_chuyen", pv, emailQ ? giaiKhoaQuy(emailQ).email : undefined);
  let where = `1 = 1${loc.sql}`;
  const binds = [...loc.binds];
  if (loaiQuy) where += ` AND COALESCE(p.quy_kh, 0) = ${loaiQuy === "kh" ? 1 : 0}`;
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
    `SELECT k.*, p.ma_xuat_kho, p.loai_don, p.trang_thai_hien_tai AS trang_thai_phieu, COALESCE(p.quy_kh, 0) AS quy_kh,
       CASE WHEN ${KHOAN_HUY_DUOC_SQL} THEN 1 ELSE 0 END AS huy_duoc,
       -- Phieu DA HUY: tien da tra thuc te di dau (2026-10-23, PMH-001137 "thấy ghi tiền đã hủy chuyển về quỹ, thực tế tiền đó đã về quỹ hay
       -- đã chuyển vào đơn"): hoan ve quy (hoan_phieu) / dang giu o don cho hang (tien_da_tra_pxk) / don mang tien sang phieu khac (log
       -- 'Da them don vao phieu' do lenhNhanTienDaTraDon ghi "… ở phiếu <id> → …"). Chi tinh khi phieu da huy.
       CASE WHEN p.trang_thai_hien_tai = 'Ke toan huy' THEN
         (SELECT COALESCE(SUM(g.so_tien), 0) FROM quy_ktv_giao_dich g WHERE g.loai = 'hoan_phieu' AND g.phieu_xuat_kho_id = k.phieu_xuat_kho_id) END AS huy_tien_ve_quy,
       CASE WHEN p.trang_thai_hien_tai = 'Ke toan huy' THEN
         (SELECT group_concat(d.id, ', ') FROM dat_don_hang d WHERE d.tien_da_tra_pxk = k.phieu_xuat_kho_id AND d.tien_da_tra > 0) END AS huy_don_giu_tien,
       CASE WHEN p.trang_thai_hien_tai = 'Ke toan huy' THEN
         (SELECT group_concat(DISTINCT l.phieu_xuat_kho_id) FROM phieu_xuat_kho_log l
          WHERE l.trang_thai = 'Da them don vao phieu' AND l.ghi_chu LIKE '% ở phiếu ' || k.phieu_xuat_kho_id || ' →%') END AS huy_sang_phieu,
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
  // pv = danh sach NGUOI -> ca 2 khoa quy cua moi nguoi (quy KTV + khhd: quy KH chuyen); ?email= la KHOA quy dang chon.
  const loc = locEmail("g.email", pv ? pv.flatMap((e) => [e, khoaQuy(e, true)]) : null, c.req.query("email")?.trim() || undefined);
  const loai = c.req.query("loai");
  let where = `1 = 1${loc.sql}`;
  const binds = [...loc.binds];
  const loaiQuy = loaiQuyLoc(c);
  if (loaiQuy) where += loaiQuy === "kh" ? " AND g.email LIKE 'khhd:%'" : " AND g.email NOT LIKE 'khhd:%'";
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
  // email = KHOA quy: quy KTV (email) hoac "Quỹ xuất hóa đơn do KH chuyển" (khhd:email, migration 0111).
  const quyKh = laKhoaQuyKh(email);
  const tonTai = await c.env.DB.prepare("SELECT 1 AS x FROM users WHERE email = ?").bind(giaiKhoaQuy(email).email).first();
  if (!tonTai) return c.json({ error: "USER_NOT_FOUND" }, 404);
  // Hoan tien cho KTV = phieu hoan tien (KTV xac nhan, migration 0090). Tru thang chi con cho KH le (khong co tai khoan de xac nhan).
  // Quy KH chuyen (quyKh): tien cua KHACH, khong phai cua KTV -> Ke toan hoan tra thang cho KH, khong qua phieu hoan tien.
  if (body.loai === "hoan_tien_ktv" && !quyKh) {
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

// ===== KHOẢN TIỀN NGOÀI VÀO QUỸ (chot 2026-10-22, migration 0095) =====
// "cho phép kế toán tự thêm khoản tiền chuyển ngoài cho KTV (tạo thủ công hoặc import hàng loạt - import sẽ theo mã misa hoặc ID KTV
// làm chuẩn ...) ví dụ đầu tháng sẽ có 1 khoản tiền KTV bị trừ lương ... tạo thành quỹ để dùng khi ktv sau này đặt hàng".
// Ke toan/Admin ghi tien vao quy nguoi nhan hang (Ve tinh -> quy cua Tram) KHONG qua phieu xuat; so quy = giao dich 'dieu_chinh' gan
// khoan_tien_ngoai_id. Doi chieu ma trong file -> KTV lam TREN TRINH DUYET (danh ba tu GET /tien-ngoai/ktv) de nguoi import xem + chon
// lai tung dong; server chi kiem tra email chu quy co that + so tien/noi dung, roi ghi CA LO trong 1 batch (CAS theo lo_id chong gui 2 lan).
const TIEN_NGOAI_TOI_DA_LO = 50; // 4 lenh/dong + phanBoQuy moi email -> giu duoi gioi han truy van D1 cua 1 request
const QUY_EMAIL_SQL = `CASE WHEN k.vai_tro_ktv = 'Ve tinh' AND t.email_dang_nhap IS NOT NULL THEN t.email_dang_nhap ELSE k.email_dang_nhap END`;

// GET /api/quy-ktv/tien-ngoai/ktv - danh ba KTV de doi chieu file import / chon tay (Ke toan/Admin).
quyKtv.get("/tien-ngoai/ktv", async (c) => {
  if (!coTheDieuChinh(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT k.ma_ktv, k.ten_hien_thi, k.ma_misa, k.ten_misa, k.email_dang_nhap AS email, k.khu_vuc_ma, k.vai_tro_ktv,
            COALESCE(k.ngung_hoat_dong, 0) AS ngung, COALESCE(u.bi_khoa, 0) AS bi_khoa,
            ${QUY_EMAIL_SQL} AS quy_email,
            CASE WHEN k.vai_tro_ktv = 'Ve tinh' THEN t.ten_hien_thi END AS tram_ten,
            (SELECT so_du FROM quy_ktv q WHERE q.email = ${QUY_EMAIL_SQL}) AS so_du
     FROM ktv_lien_he k
     LEFT JOIN ktv_lien_he t ON t.ma_ktv = k.ktv_cap1_phu_trach
     LEFT JOIN users u ON u.email = k.email_dang_nhap
     ORDER BY k.ma_ktv`,
  ).all();
  return c.json({ rows: results ?? [] });
});

// GET /api/quy-ktv/tien-ngoai?q=&tu=&den=&trang_thai=&nguon=&email=&page=&pageSize= - danh sach khoan tien ngoai (theo pham vi xem quy).
quyKtv.get("/tien-ngoai", async (c) => {
  const pv = await phamViXem(c);
  if (pv === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const loc = locEmail("n.email", pv, c.req.query("email")?.trim() || undefined);
  let where = `1 = 1${loc.sql}`;
  const binds: unknown[] = [...loc.binds];
  const tu = c.req.query("tu")?.trim();
  const den = c.req.query("den")?.trim();
  if (tu && /^\d{4}-\d{2}-\d{2}$/.test(tu)) { where += " AND substr(n.ngay_tao, 1, 10) >= ?"; binds.push(tu); }
  if (den && /^\d{4}-\d{2}-\d{2}$/.test(den)) { where += " AND substr(n.ngay_tao, 1, 10) <= ?"; binds.push(den); }
  const tt = c.req.query("trang_thai");
  if (tt === "Da ghi" || tt === "Da huy") { where += " AND n.trang_thai = ?"; binds.push(tt); }
  const nguon = c.req.query("nguon");
  if (nguon === "thu_cong" || nguon === "import" || nguon === "ktv") { where += " AND n.nguon = ?"; binds.push(nguon); }
  const q = c.req.query("q")?.trim();
  if (q) {
    // Ma / noi dung / ten file / email; ten KTV so tren danh ba (ten hien thi, ten MISA) - LIKE chi bo hoa/thuong ASCII, du cho ma.
    where += ` AND (n.ma_ktv LIKE ?1x OR n.ma_trong_file LIKE ?1x OR n.noi_dung LIKE ?1x OR n.ten_file LIKE ?1x OR n.email LIKE ?1x
               OR EXISTS (SELECT 1 FROM ktv_lien_he kk WHERE kk.email_dang_nhap = n.email AND (kk.ten_hien_thi LIKE ?1x OR kk.ten_misa LIKE ?1x OR kk.ma_misa LIKE ?1x)))`;
  }
  const qBind = q ? `%${q}%` : null;
  // ?1x = cung 1 gia tri tim kiem lap lai - thay bang ? va day du so bind.
  const soLap = (where.match(/\?1x/g) ?? []).length;
  where = where.replace(/\?1x/g, "?");
  const allBinds = [...binds, ...Array(soLap).fill(qBind)];
  const page = Math.max(1, Math.trunc(Number(c.req.query("page"))) || 1);
  const pageSize = Math.min(500, Math.max(1, Math.trunc(Number(c.req.query("pageSize"))) || 20));
  const tong = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN n.trang_thai = 'Da ghi' THEN n.so_tien END), 0) AS tong_tien FROM khoan_tien_ngoai n WHERE ${where}`,
  ).bind(...allBinds).first<{ total: number; tong_tien: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT n.*, (SELECT so_du FROM quy_ktv q WHERE q.email = n.email) AS so_du_hien_tai
     FROM khoan_tien_ngoai n WHERE ${where} ORDER BY n.id DESC LIMIT ? OFFSET ?`,
  ).bind(...allBinds, pageSize, (page - 1) * pageSize).all();
  return c.json({ rows: results ?? [], total: tong?.total ?? 0, tong_tien: tong?.tong_tien ?? 0, page, pageSize, coTheGhi: coTheDieuChinh(c) });
});

type DongTienNgoai = { email?: string; ma_ktv?: string; ma_trong_file?: string; so_tien?: number; noi_dung?: string; ngay_chung_tu?: string };

// POST /api/quy-ktv/tien-ngoai { lo_id, nguon: 'thu_cong'|'import', ten_file?, items: [...] } - Ke toan/Admin. Ghi CA LO hoac khong ghi gi.
quyKtv.post("/tien-ngoai", async (c) => {
  if (!coTheDieuChinh(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ lo_id?: string; nguon?: string; ten_file?: string; items?: DongTienNgoai[] }>();
  const loId = body.lo_id?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(loId)) return c.json({ error: "INVALID_LO_ID" }, 400);
  const nguon = body.nguon === "import" ? "import" : "thu_cong";
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return c.json({ error: "MISSING_ITEMS" }, 400);
  if (items.length > TIEN_NGOAI_TOI_DA_LO) return c.json({ error: "QUA_NHIEU_DONG", max: TIEN_NGOAI_TOI_DA_LO }, 400);
  const loi: { dong: number; loi: string }[] = [];
  const sach = items.map((it, i) => {
    const email = typeof it.email === "string" ? it.email.trim() : "";
    const soTien = Number(it.so_tien);
    const noiDung = typeof it.noi_dung === "string" ? it.noi_dung.trim().slice(0, 300) : "";
    const ngay = typeof it.ngay_chung_tu === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.ngay_chung_tu.trim()) ? it.ngay_chung_tu.trim() : null;
    if (!email) loi.push({ dong: i + 1, loi: "MISSING_EMAIL" });
    if (!Number.isInteger(soTien) || soTien <= 0 || soTien > 10_000_000_000) loi.push({ dong: i + 1, loi: "INVALID_SO_TIEN" });
    if (!noiDung) loi.push({ dong: i + 1, loi: "MISSING_NOI_DUNG" });
    return {
      email, soTien, noiDung, ngay,
      maKtv: typeof it.ma_ktv === "string" ? it.ma_ktv.trim().slice(0, 80) || null : null,
      maFile: typeof it.ma_trong_file === "string" ? it.ma_trong_file.trim().slice(0, 80) || null : null,
    };
  });
  if (loi.length) return c.json({ error: "DONG_KHONG_HOP_LE", loi }, 400);
  const dsEmail = [...new Set(sach.map((s) => s.email))];
  const { results: coThat } = await c.env.DB.prepare("SELECT email FROM users WHERE email IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(dsEmail)).all<{ email: string }>();
  const coThatSet = new Set((coThat ?? []).map((r) => r.email));
  const thieu = sach.map((s, i) => (coThatSet.has(s.email) ? null : { dong: i + 1, loi: "USER_NOT_FOUND" })).filter(Boolean);
  if (thieu.length) return c.json({ error: "DONG_KHONG_HOP_LE", loi: thieu }, 400);

  const user = c.get("user");
  const now = nowVN();
  const tenFile = typeof body.ten_file === "string" ? body.ten_file.trim().slice(0, 200) || null : null;
  const lenh: D1PreparedStatement[] = [
    // CAS: lo nay da ghi (bam 2 lan / gui lai) -> CHECK x=0 vi pham -> rollback ca batch.
    c.env.DB.prepare("INSERT INTO quy_cas_guard (x) SELECT 1 WHERE EXISTS (SELECT 1 FROM khoan_tien_ngoai WHERE lo_id = ?)").bind(loId),
  ];
  for (const s of sach) {
    const ghiChu = `Tiền ngoài vào quỹ: ${s.noiDung}`;
    const [taoQuy, congQuy, ghiSo] = lenhGhiQuy(c.env.DB, {
      email: s.email, loai: "dieu_chinh", soTien: s.soTien, nguoi: user.email, now, ghiChu, khoanTienNgoaiSql: "last_insert_rowid()",
    });
    lenh.push(
      taoQuy,
      congQuy,
      c.env.DB.prepare(
        `INSERT INTO khoan_tien_ngoai (email, ma_ktv, ma_trong_file, so_tien, noi_dung, ngay_chung_tu, nguon, ten_file, lo_id, nguoi_tao, ngay_tao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(s.email, s.maKtv, s.maFile, s.soTien, s.noiDung, s.ngay, nguon, tenFile, loId, user.email, now),
      ghiSo, // ngay sau INSERT khoan -> last_insert_rowid() = id khoan vua tao
    );
  }
  try {
    await c.env.DB.batch(lenh);
  } catch (e) {
    if (String(e).includes("CHECK")) return c.json({ error: "LO_DA_GHI" }, 409);
    throw e;
  }
  // Tien vao quy -> tu tra cac phieu dang cho chuyen tien cu nhat cua tung nguoi (nhu moi lan cong quy).
  for (const email of dsEmail) await phanBoQuy(c.env.DB, email, user.email);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, so_dong: sach.length, tong_tien: sach.reduce((t, s) => t + s.soTien, 0) });
});

// POST /api/quy-ktv/tien-ngoai/:id/huy { ly_do } - Ke toan/Admin huy khoan ghi nham: tru lai dung so tien khoi quy (quy phai con du).
quyKtv.post("/tien-ngoai/:id/huy", async (c) => {
  if (!coTheDieuChinh(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = Math.trunc(Number(c.req.param("id")));
  const body = await c.req.json<{ ly_do?: string }>().catch(() => ({}) as { ly_do?: string });
  const lyDo = body.ly_do?.trim().slice(0, 300);
  if (!lyDo) return c.json({ error: "MISSING_LY_DO" }, 400);
  const k = await c.env.DB.prepare("SELECT email, so_tien, trang_thai, noi_dung FROM khoan_tien_ngoai WHERE id = ?").bind(id)
    .first<{ email: string; so_tien: number; trang_thai: string; noi_dung: string }>();
  if (!k) return c.json({ error: "NOT_FOUND" }, 404);
  if (k.trang_thai !== "Da ghi") return c.json({ error: "DA_HUY" }, 409);
  const user = c.get("user");
  const now = nowVN();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO quy_cas_guard (x) SELECT 1 WHERE (SELECT trang_thai FROM khoan_tien_ngoai WHERE id = ?) IS NOT 'Da ghi'").bind(id),
      c.env.DB.prepare("UPDATE khoan_tien_ngoai SET trang_thai = 'Da huy', huy_boi = ?, huy_luc = ?, ly_do_huy = ? WHERE id = ?").bind(user.email, now, lyDo, id),
      ...lenhGhiQuy(c.env.DB, {
        email: k.email, loai: "dieu_chinh", soTien: -k.so_tien, nguoi: user.email, now,
        ghiChu: `Hủy tiền ngoài "${k.noi_dung}": ${lyDo}`, khoanTienNgoaiSql: String(id),
      }),
    ]);
  } catch {
    const sau = await c.env.DB.prepare("SELECT trang_thai FROM khoan_tien_ngoai WHERE id = ?").bind(id).first<{ trang_thai: string }>();
    if (sau?.trang_thai !== "Da ghi") return c.json({ error: "DA_HUY" }, 409);
    return c.json({ error: "QUY_KHONG_DU", so_du: await soDuQuy(c.env.DB, k.email) }, 409);
  }
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, so_du: await soDuQuy(c.env.DB, k.email) });
});

// ===== KTV TU NOP TIEN VAO QUY (chot 2026-10-30, migration 0104, lib/nopTienQuy.ts) =====
const NOP_TIEN_TT = ["Cho ke toan", "Da duyet", "Tu choi", "Da huy"];
// Nguoi co quy dat hang: KTV, Ve tinh (vao quy Tram), Giam sat. Ke toan/Admin ghi bang "Tiền ngoài vào quỹ".
const duocNopTien = (u: { vai_tro?: string | null; la_ke_toan?: boolean | number | null; la_ktv_dvbh?: boolean | number | null; la_ve_tinh?: boolean | number | null; tram_cha?: string | null; email: string }) =>
  !laKeToanNopTien(u) && !!quyCuaNguoiGui(u) && (!!u.la_ktv_dvbh || !!u.la_ve_tinh || u.vai_tro === "Giam sat" || u.vai_tro === "QC");

// GET /api/quy-ktv/nop-tien?trang_thai=&email=&page=&pageSize= - theo pham vi xem quy (KTV: cua minh; Ve tinh: quy Tram + yeu cau minh gui).
quyKtv.get("/nop-tien", async (c) => {
  const pv = await phamViXem(c);
  if (pv === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const u = c.get("user");
  const loc = locEmail("n.email", pv, c.req.query("email")?.trim() || undefined);
  // Nguoi gui luon thay yeu cau cua chinh minh (vd Ve tinh gui vao quy Tram).
  const phamVi = pv ? `(n.nguoi_gui = ?${loc.sql.replace(" AND ", " OR ")})` : `1 = 1${loc.sql}`;
  const phamViBinds = pv ? [u.email, ...loc.binds] : loc.binds;
  let where = phamVi;
  const binds: unknown[] = [...phamViBinds];
  const tt = c.req.query("trang_thai");
  if (tt && NOP_TIEN_TT.includes(tt)) { where += " AND n.trang_thai = ?"; binds.push(tt); }
  const page = Math.max(1, Math.trunc(Number(c.req.query("page"))) || 1);
  const pageSize = Math.min(200, Math.max(1, Math.trunc(Number(c.req.query("pageSize"))) || 20));
  const dem = await c.env.DB.prepare(
    `SELECT COUNT(*) AS tat_ca, ${NOP_TIEN_TT.map((t, i) => `SUM(CASE WHEN n.trang_thai = '${t}' THEN 1 ELSE 0 END) AS t${i}`).join(", ")}
     FROM nop_tien_quy n WHERE ${phamVi}`,
  ).bind(...phamViBinds).first<Record<string, number | null>>();
  const tong = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM nop_tien_quy n WHERE ${where}`).bind(...binds).first<{ total: number }>();
  // trung: khoan cung chu quy, CUNG so tien trong 30 ngay (khoan chuyen tien Ke toan da duyet / yeu cau nop khac chua bi tu choi-huy)
  // - nhac Ke toan tranh xac nhan 1 lan chuyen 2 lan (chi tinh cho yeu cau dang cho).
  const { results } = await c.env.DB.prepare(
    `SELECT n.*, (SELECT so_du FROM quy_ktv q WHERE q.email = n.email) AS so_du_hien_tai,
       (SELECT trang_thai FROM khoan_tien_ngoai k WHERE k.id = n.khoan_tien_ngoai_id) AS khoan_trang_thai,
       CASE WHEN n.trang_thai = 'Cho ke toan' THEN (
         SELECT group_concat(x, ', ') FROM (
           SELECT k.phieu_xuat_kho_id AS x FROM khoan_chuyen_tien k WHERE k.email_nguoi_chuyen = n.email AND k.trang_thai = 'Da duyet'
             AND k.so_tien_thuc_nhan = n.so_tien AND k.duyet_luc >= datetime(n.ngay_tao, '-30 days')
           UNION ALL
           SELECT 'NTQ-' || m.id FROM nop_tien_quy m WHERE m.email = n.email AND m.id != n.id AND m.trang_thai IN ('Cho ke toan', 'Da duyet')
             AND COALESCE(m.so_tien_thuc_nhan, m.so_tien) = n.so_tien AND m.ngay_tao >= datetime(n.ngay_tao, '-30 days')
         )) END AS trung
     FROM nop_tien_quy n WHERE ${where}
     ORDER BY CASE n.trang_thai WHEN 'Cho ke toan' THEN 0 ELSE 1 END, n.id DESC LIMIT ? OFFSET ?`,
  ).bind(...binds, pageSize, (page - 1) * pageSize).all<NopTienRow>();
  return c.json({
    rows: results.map((r) => ({ ...r, hanh_dong: hanhDongNopTien(r, u) })),
    page, pageSize, total: tong?.total ?? 0,
    dem: { "": dem?.tat_ca ?? 0, ...Object.fromEntries(NOP_TIEN_TT.map((t, i) => [t, dem?.[`t${i}`] ?? 0])) },
    // Ke toan / Admin ghi bang "Tiền ngoài vào quỹ" - khong tu nop.
    coTheGui: duocNopTien(u),
  });
});

// POST /api/quy-ktv/nop-tien/anh - tai 1 anh chuyen khoan len Drive (han muc anh/ngay nhu moi cho tai anh).
quyKtv.post("/nop-tien/anh", async (c) => {
  if ((await phamViXem(c)) === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const u = c.get("user");
  const up = await nhanAnhTaiLen(c, (ext) => `nop-tien-quy-${u.email.split("@")[0]}-${Date.now()}.${ext}`);
  if (up instanceof Response) return up;
  return c.json({ ok: true, url: up.thumbnailUrl, han_muc_anh: up.hanMucAnh });
});

// POST /api/quy-ktv/nop-tien { so_tien, anh: [url], tien_doc_anh?, ghi_chu?, ngay_chuyen? } - KTV gui yeu cau.
quyKtv.post("/nop-tien", async (c) => {
  if ((await phamViXem(c)) === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const u = c.get("user");
  if (laKeToanNopTien(u)) return c.json({ error: "DUNG_TIEN_NGOAI" }, 409);
  if (!duocNopTien(u)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const kq = await guiNopTien(c.env, u, body, (p) => c.executionCtx.waitUntil(p));
  if ("error" in kq) return c.json({ error: kq.error }, kq.status);
  return c.json({ ok: true, id: kq.id }, 201);
});

// GET /api/quy-ktv/nop-tien/:id/doi-soat (2026-11-12, v1.481 - "tab bên cạnh hiện các hóa đơn đã xác nhận của cùng KTV nhận quỹ ... số tiền
// tương đương với 1 trong các ảnh ... đẩy lên trên cùng và hiện cảnh báo"): MOI khoan tien da vao CUNG quy trong 180 ngay - khoan chuyen tien
// PXK Ke toan da duyet (anh bang chung), yeu cau nop tien khac (da duyet / dang cho), tien ngoai nhap tay/import (khong anh). Chi doc; viec so
// so tien OCR tung anh + so "van anh" (mau, bo cuc) lam tren trinh duyet Ke toan (NopTienDoiSoat.tsx).
quyKtv.get("/nop-tien/:id/doi-soat", async (c) => {
  const pv = await phamViXem(c);
  if (pv === undefined) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = Math.trunc(Number(c.req.param("id")));
  const n = await c.env.DB.prepare("SELECT id, email, nguoi_gui, ngay_tao FROM nop_tien_quy WHERE id = ?").bind(id).first<{ id: number; email: string; nguoi_gui: string; ngay_tao: string }>();
  if (!n) return c.json({ error: "NOT_FOUND" }, 404);
  if (pv && !pv.includes(n.email) && n.nguoi_gui !== c.get("user").email) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const tu = "datetime('now', '+7 hours', '-180 days')";
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM (
       SELECT 'pxk' AS loai, k.id AS id, k.phieu_xuat_kho_id AS ma, k.so_tien_thuc_nhan AS so_tien, k.anh, k.tien_doc_anh,
              k.duyet_luc AS luc, k.nguoi_duyet AS nguoi, k.ktv_bao_chuyen_luc AS ngay_chuyen, k.ghi_chu_ktv AS ghi_chu, 'Da duyet' AS trang_thai
         FROM khoan_chuyen_tien k
        WHERE k.email_nguoi_chuyen = ?1 AND k.trang_thai = 'Da duyet' AND k.lich_su = 0 AND k.duyet_luc >= ${tu}
       UNION ALL
       SELECT 'ntq', m.id, 'NTQ-' || m.id, COALESCE(m.so_tien_thuc_nhan, m.so_tien), m.anh, m.tien_doc_anh,
              COALESCE(m.xu_ly_luc, m.ngay_tao), COALESCE(m.nguoi_xu_ly, m.nguoi_gui), m.ngay_chuyen, m.ghi_chu, m.trang_thai
         FROM nop_tien_quy m
        WHERE m.email = ?1 AND m.id != ?2 AND m.trang_thai IN ('Da duyet', 'Cho ke toan') AND m.ngay_tao >= ${tu}
       UNION ALL
       SELECT 'ngoai', t.id, 'TN-' || t.id, t.so_tien, NULL, NULL, t.ngay_tao, t.nguoi_tao, t.ngay_chung_tu, t.noi_dung, 'Da duyet'
         FROM khoan_tien_ngoai t
        WHERE t.email = ?1 AND t.trang_thai = 'Da ghi' AND t.nguon != 'ktv' AND t.ngay_tao >= ${tu}
     ) ORDER BY luc DESC LIMIT 150`,
  ).bind(n.email, id).all();
  return c.json({ rows: results });
});

// POST /api/quy-ktv/nop-tien/:id/xu-ly { hanh_dong: duyet|tu_choi|huy, so_tien_thuc_nhan?, ly_do? }
quyKtv.post("/nop-tien/:id/xu-ly", async (c) => {
  type BodyNt = { hanh_dong?: string; so_tien_thuc_nhan?: unknown; ly_do?: unknown };
  const body = await c.req.json<BodyNt>().catch((): BodyNt => ({}));
  const hd = body.hanh_dong as HanhDongNopTien;
  if (!["duyet", "tu_choi", "huy"].includes(hd)) return c.json({ error: "INVALID_HANH_DONG" }, 400);
  const kq = await xuLyNopTien(c.env, c.get("user"), Math.trunc(Number(c.req.param("id"))), hd, body, (p) => c.executionCtx.waitUntil(p));
  if ("error" in kq) return c.json({ error: kq.error }, kq.status);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, ...kq });
});

export default quyKtv;
