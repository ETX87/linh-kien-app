import { Hono } from "hono";
import { nhanAnhTaiLen } from "../lib/anhUpload";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { nowVN } from "../lib/vnTime";
import { mocGiaiDoanTraHangSql, quaHanGiaiDoanTraHang, tinhHanLyDoCham, TRA_HANG_GIAI_DOAN_HAN, traHangTuHuySql } from "../lib/hanLyDoCham";
import { emailsTheoTen, orEmailIn, orMaYcsc, orPxkCuaDon, tenLkKhopSql } from "../lib/timTheoTen";
import { bumpVersions } from "../lib/dataVersions";
import { scopeDatMuaNguoiTao, khuVucSetWhereSql, phuTrachGsSet, duocDoiKhuVucDon } from "../lib/scopeDatMua";
import { notifyWorkflowTask, emailsForRoleOrQC, pastActorsFor, TRA_HANG_ROLES, type ViecMoiRoleCol } from "../lib/taskNotify";
import { nextSequentialId } from "../lib/idCounter";
import { pushTraHangToKhovan, notifyTraHangQcRejected, notifyTraHangReceivedViaApp, buildWorkUrl } from "../lib/khovanPushClient";
import { bundleAutoApprovedIntoPxk } from "../lib/pxkAutoBundle";
import { batDauTaiVideo, hoanTatVideo, VIDEO_TOI_DA_BYTE } from "../lib/googleDrive";
import { goDonKhoiPxk } from "../lib/pxkTuHuy";

// Don tra hang QC DA DUYET ("TN da duyet") dua lai ve "Cho QC xac nhan" duoc (chot 2026-11-10, DDH-002554 "bị xác nhận nhầm, chỉ duyệt 5, 1 linh kiện
// sẽ bị từ chối hiện tại đang không cho đẩy lùi sau khi QC xác nhận nhầm") khi phieu tra hang chua bi Ke toan chot (chua vao phieu, hoac phieu con
// "Dang tao phieu" / "Cho ke toan"). Day lui = go don khoi phieu (phieu het don thi tu huy) + ve "Cho QC xac nhan".
const DAY_LUI_QC_DUOC_SQL = (a: string) => `(${a}.trang_thai_hien_tai = 'TN da duyet' AND ${a}.loai_don = 'tra_hang' AND NOT EXISTS (
  SELECT 1 FROM phieu_xuat_kho_dong pdq JOIN phieu_xuat_kho pq ON pq.id = pdq.phieu_xuat_kho_id
  WHERE pdq.dat_don_hang_id = ${a}.id AND pq.trang_thai_hien_tai NOT IN ('Dang tao phieu', 'Cho ke toan', 'Ke toan huy')))`;
const MAX_VIDEO_QC = 30; // 2026-11-14: 2 -> 30 (khop VIDEO_QC_TOI_DA o FE TraHangTab.tsx)

// Vai tro can bao "viec moi" khi 1 dong tra hang toi trang thai nay (phan hoi 2026-09-05) - dung
// chung cho ca applyTraHangLog (di xuoi) va POST /:donHangId/log-lui (di lui), vi 2 chieu deu ha
// canh vao dung 1 trong 4 trang thai cho-xu-ly nay. "Cho ke toan duyet mem" o day CHI phuc vu
// log-lui (luc tao moi da duoc bao rieng o datMuaLinhKien.ts).
function roleForTraHangState(trangThai: string): ViecMoiRoleCol | "qc" | null {
  if (trangThai === "Cho ke toan duyet mem") return "la_ke_toan";
  if (trangThai === "Cho kho xac nhan") return "la_kho";
  if (trangThai === "Cho QC xac nhan") return "qc";
  if (trangThai === "Cho TN duyet tong") return "la_tac_nghiep";
  return null;
}

// Luong "Don tra hang" - tach hoan toan khoi state machine mua/cong no, xem migration
// 0059_tra_hang_log.sql + 0064_tra_hang_log_du_6_buoc.sql. 1 dong dat_don_hang (loai_don='tra_hang')
// di qua 5 buoc tuyen tinh: Ke toan duyet mem -> Kho xac nhan -> QC xac nhan -> TN duyet tong ->
// TN da duyet.
//
// SUA (phan hoi 2026-08-21, migration 0002_tra_hang_pxk.sql: "thiếu bước Tác nghiệp nhặt linh kiện
// vào PXK"): truoc day sau "Cho TN duyet tong" di THANG toi "Cho ke toan xac nhan nhap kho" -> "Cho
// kho xac nhan nhap kho" -> "Da hoan thanh", khong co PXK/tai lieu that nao duoc tao ca. Gio dong o
// "TN da duyet" (dung y het "TN da duyet" cua mua/cong_no) - TN sang tab "Phieu xuat kho" > sub-tab
// "Tra hang" de gom cac dong nay vao 1 PXK that (loai_don='tra_hang', xem phieuXuatKho.ts), roi PXK
// do tu di qua Cho ke toan (KT xac nhan dung don) -> Da chot xong don xuat -> Kho da nhan hang tra
// (Kho xac nhan da nhan hang VE kho) - PHAN CON LAI cua luong duoc theo doi qua trang_thai cua CHINH
// PXK do, KHONG con qua tra_hang_log/dat_don_hang.trang_thai_hien_tai nua (dong dat_don_hang dung yen
// o "TN da duyet" mai mai, giong het cach mua/cong_no hoat dong).
const traHang = new Hono<{ Bindings: Env }>();
traHang.use("*", verifySessionMiddleware, loadUser, requireDatMuaLkArea);

const TRANG_THAI_DONG = ["TN da duyet", "Tu choi", "Da huy"] as const;
// RA SOAT BAO MAT/CHI PHI D1 2026-08-18 (phan hoi Codex #9) - xem giai thich o datMuaLinhKien.ts.
const MAX_BULK_IDS = 100;
// Anh tra hang (phan hoi 2026-08-24, migration 0003_tra_hang_anh.sql) - toi da 3 anh/loai/dong,
// dung chung cho ca "tao_moi" (luc tao don) va "qc_tu_choi" (QC tu choi).
const MAX_ANH_TRA_HANG = 30; // chi dung cho anh QC tu choi (/:donHangId/anh); 2026-11-14: 3 -> 30 (khop ANH_QC_TOI_DA o FE TraHangTab.tsx)
const THU_TU_BUOC = [
  "Cho ke toan duyet mem",
  "Cho kho xac nhan",
  "Cho QC xac nhan",
  "Cho TN duyet tong",
  "TN da duyet",
] as const;

// Han 24h tung giai doan (chot 2026-10-01, lib/hanLyDoCham.ts) - gan qua_han_ly_do_cham (cung ten cot voi don mua de FE
// dung lai) + han_giai_doan ("YYYY-MM-DD HH:MM:SS" gio VN) cho 1 dong co cot moc_giai_doan.
function ganHanGiaiDoan<T extends Record<string, unknown>>(row: T): T & { qua_han_ly_do_cham: boolean; han_giai_doan: string | null } {
  const trangThai = row.trang_thai_hien_tai as string | null;
  const moc = row.moc_giai_doan as string | null;
  const coHan = !!trangThai && (TRA_HANG_GIAI_DOAN_HAN as readonly string[]).includes(trangThai);
  return {
    ...row,
    qua_han_ly_do_cham: quaHanGiaiDoanTraHang(trangThai, moc, nowVN()),
    han_giai_doan: coHan && moc ? tinhHanLyDoCham(moc).toISOString().slice(0, 19).replace("T", " ") : null,
  };
}

function canKeToan(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_ke_toan || user.vai_tro === "Admin";
}
function canKho(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_kho || user.vai_tro === "Admin";
}
function canQC(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return user.vai_tro === "QC" || user.vai_tro === "Admin";
}
function canTacNghiep(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_tac_nghiep || user.vai_tro === "Admin";
}

// GET /api/tra-hang?trang_thai= - danh sach dong dat_don_hang loai_don='tra_hang', kem trang thai
// rieng cua luong nay. Ke toan/Kho/QC/TN/Admin xem toan bo (scopeDatMuaNguoiTao tra null cho nhom
// nay) de xu ly; KTV/Tram/Ve tinh/Giam sat bi gioi han theo quan he - RA SOAT BAO MAT 2026-08-18
// (phan hoi Codex): truoc day KHONG scope cho AI ca, du comment cu noi "KTV xem qua tab Don cua toi"
// nhung endpoint nay van goi truc tiep duoc va tra ve TOAN BO du lieu tra hang he thong.
traHang.get("/", async (c) => {
  const user = c.get("user");
  const scope = scopeDatMuaNguoiTao(c);
  const trangThai = c.req.query("trang_thai");
  const nguoiTao = c.req.query("nguoi_tao");
  // "khu_vuc" (them 2026-08-31, dong bo voi GET /dat-mua-lk/don-hang - xem CLAUDE.md muc kiem tra
  // toan he thong) - cung dinh nghia/cach dung: danh sach ma Khu vuc cach nhau boi dau phay, khop don
  // co nguoi_tao HOAC nguoi_nhan_hang la 1 KTV thuoc 1 trong cac Khu vuc do.
  const khuVuc = c.req.query("khu_vuc")?.trim();
  // Them 2026-08-21 (dong bo UI voi GET /dat-mua-lk/don-hang - man "Tra hang" thieu o tim kiem tu do
  // so voi "Mua hang/Cong no") - cung 4 cot tim (ma_lk/ten_lk_snapshot/id/nguoi_tao), tra_hang khong
  // co ma_yeu_cau_su_co/nguoi_nhan_hang rieng biet nen bo 2 cot do so voi ban goc.
  // .normalize("NFC") - xem giai thich day du o settingsKtv.ts GET / (cung fix, cung ngay).
  const q = c.req.query("q")?.trim().normalize("NFC");
  // GD4 (phan hoi Codex #17): truoc day tra ve TOAN BO dong khop bo loc, frontend tu slice o client.
  // Them phan trang server-side, cung pattern voi GET /dat-mua-lk/don-hang. "nguoi_tao" chuyen tu loc
  // client-side (tren data.rows) sang server-side de khop dung tong so sau khi phan trang that su.
  // KHONG truyen page -> tra HET (nut "Tải danh sách chi tiết", them 2026-09-13, mirror settingsKtv.ts).
  const pageParam = c.req.query("page");
  const page = Math.max(1, (Math.trunc(Number(pageParam)) || 1));
  const pageSize = Math.min(1000, Math.max(1, (Math.trunc(Number(c.req.query("pageSize"))) || 20)));
  const offset = (page - 1) * pageSize;
  let whereSql = "ddh.loai_don = 'tra_hang'" + (scope?.whereSql ?? "");
  const binds: unknown[] = [...(scope?.binds ?? [])];
  // FIX (phan hoi nguoi dung: "đồng bộ danh sách theo badge" cho Khu vuc phu trach GS) - xem giai
  // thich day du o GET /dat-mua-lk/don-hang (cung 1 fix, cung ngay) - truoc day phuTrachGsSet chi
  // anh huong badge (qua /don-hang-status-counts?loai_don=tra_hang), KHONG anh huong chinh danh sach nay.
  if (scope === null && (canTacNghiep(c) || canKho(c) || canKeToan(c))) {
    const gsSet = await phuTrachGsSet(c.env.DB, user.email);
    if (gsSet) {
      whereSql += ` AND ddh.email_gs IN (${[...gsSet].map(() => "?").join(",")})`;
      binds.push(...gsSet);
    }
  }
  if (trangThai === "__OPEN__") {
    // Sentinel "con ton" (them 2026-09-11, phuc vu muc menu "Trả hàng chờ các bên" - gop 4 buoc duyet
    // dau cua luong nay thanh 1 muc bam duy nhat) - TRA_HANG_TRANG_THAI_OPTIONS da co san gia tri nay
    // tu 2026-08-27 (dropdown filter cua chinh tab nay) nhung route nay chua tung xu ly, khien chon
    // "Còn tồn" tren dropdown truoc day luon ra danh sach rong (trang_thai_hien_tai='__OPEN__' khong
    // khop dong nao that).
    whereSql += ` AND ddh.trang_thai_hien_tai NOT IN (${TRANG_THAI_DONG.map(() => "?").join(",")}) AND NOT ${traHangTuHuySql("ddh")}`;
    binds.push(...TRANG_THAI_DONG);
  } else if (trangThai === "__CHO_XAC_NHAN__") {
    // Muc Sidebar "Hàng trả" (2026-09-30): tong don CHO CAC BEN XAC NHAN (Ke toan/Kho/QC) - buoc TN duyet tong nam o
    // "Chờ tác nghiệp" cung don mua (GET /dat-mua-lk/don-hang?trang_thai=__CHO_TN__). Bo don tu huy (v1.524).
    whereSql += ` AND ddh.trang_thai_hien_tai IN ('Cho ke toan duyet mem', 'Cho kho xac nhan', 'Cho QC xac nhan') AND NOT ${traHangTuHuySql("ddh")}`;
  } else if (trangThai === "__TU_HUY_KHO__") {
    // Tab "Đơn tự hủy" (v1.524): cho Kho qua 10 ngay (KTV khong gui hang) - hang ve muon Kho van xac nhan tu day.
    whereSql += ` AND ${traHangTuHuySql("ddh")}`;
  } else if (trangThai === "Cho kho xac nhan") {
    whereSql += ` AND ddh.trang_thai_hien_tai = 'Cho kho xac nhan' AND NOT ${traHangTuHuySql("ddh")}`;
  } else if (trangThai) {
    whereSql += " AND ddh.trang_thai_hien_tai = ?";
    binds.push(trangThai);
  }
  if (nguoiTao) {
    whereSql += " AND ddh.nguoi_tao = ?";
    binds.push(nguoiTao);
  }
  if (khuVuc) {
    const khuVucList = khuVuc.split(",").map((s) => s.trim()).filter(Boolean);
    if (khuVucList.length > 0) {
      const { sql, binds: khuVucBinds } = khuVucSetWhereSql(new Set(khuVucList), ["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]);
      whereSql += sql;
      binds.push(...khuVucBinds);
    }
  }
  if (q) {
    const theoTen = orEmailIn(["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"], await emailsTheoTen(c.env.DB, q));
    const theoMa = orMaYcsc("ddh", q); // + ma yeu cau su co chinh/bo sung (2026-09-29)
    const theoPxk = orPxkCuaDon("ddh", q); // + ma phieu / ma don hang / ma PXK MISA (2026-10-03)
    const tenLk = tenLkKhopSql("ddh.ten_lk_snapshot", q); // ten LK khong phan biet hoa/thuong (v1.377)
    whereSql += ` AND (ddh.ma_lk LIKE ? OR ${tenLk.sql} OR ddh.id LIKE ? OR ddh.nguoi_tao LIKE ?${theoMa.sql}${theoPxk.sql}${theoTen.sql})`;
    binds.push(`%${q}%`, ...tenLk.binds, `%${q}%`, `%${q}%`, ...theoMa.binds, ...theoPxk.binds, ...theoTen.binds);
  }

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM dat_don_hang ddh WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>();
  // BUG THAT (phat hien 2026-08-21, phan hoi "sao đơn trả hàng vừa tạo không hiện trong danh sách kế
  // toán"): truoc day doc trang thai qua subquery tuong quan lay dong MOI NHAT cua tra_hang_log - dong
  // tra_hang vua tao KHONG co dong log dau tien nao (xem "if (loai_don !== 'tra_hang')" o
  // datMuaLinhKien.ts POST /phieu-dat, chi mirror thang trang_thai_hien_tai = 'Cho ke toan duyet mem'
  // ma khong insert log), nen subquery tra ve NULL, khong khop dieu kien loc "= 'Cho ke toan duyet
  // mem'" -> dong bien mat khoi MOI danh sach loc theo trang thai (nhung van dem dung trong badge
  // pipeline vi luong-quy-trinh doc thang trang_thai_hien_tai). trang_thai_hien_tai la mirror LUON
  // dong bo qua CAS (xem applyTraHangLog ben duoi) nen doc thang cot nay, khong qua tra_hang_log nua.
  const { results } = await c.env.DB.prepare(
    `SELECT ddh.*, ddh.trang_thai_hien_tai as trang_thai_tra_hang,
       (SELECT ghi_chu FROM dat_don_hang_log WHERE dat_don_hang_id = ddh.id ORDER BY id DESC LIMIT 1) as ghi_chu_xu_ly_gan_nhat,
       kv.ten as khu_vuc_ten,
       ${mocGiaiDoanTraHangSql("ddh")} as moc_giai_doan,
       CASE WHEN ${traHangTuHuySql("ddh")} THEN 1 ELSE 0 END as tu_huy_qua_han
     FROM dat_don_hang ddh
     -- "Khu vực" (them 2026-09-12, dong bo voi GET /don-hang - phan hoi "sắp xếp cột bảng danh sách
     -- đơn giống" file tham chieu) - lay tu Khu vuc cua CHINH nguoi_nhan_hang qua ktv_lien_he.khu_vuc_ma.
     LEFT JOIN khu_vuc kv ON kv.ma = COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) -- cot luu san, migration 0042 (+ Kho chon lai 0071)
     WHERE ${whereSql} ORDER BY ddh.ngay_tao DESC
     ${pageParam ? "LIMIT ? OFFSET ?" : ""}`,
  )
    .bind(...binds, ...(pageParam ? [pageSize, offset] : []))
    .all();
  return c.json({ rows: (results as Record<string, unknown>[]).map(ganHanGiaiDoan), page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/tra-hang/:donHangId - chi tiet dong don hang + log rieng luong tra hang. Ap dung
// scopeDatMuaNguoiTao giong GET / (RA SOAT BAO MAT 2026-08-18) - tra 404 khi ngoai pham vi.
traHang.get("/:donHangId", async (c) => {
  const donHangId = c.req.param("donHangId");
  const scope = scopeDatMuaNguoiTao(c);
  const whereSql = "ddh.id = ? AND ddh.loai_don = 'tra_hang'" + (scope?.whereSql ?? "");
  const binds = [donHangId, ...(scope?.binds ?? [])];
  const ddh = await c.env.DB.prepare(
    `SELECT ddh.*, ddh.trang_thai_hien_tai as trang_thai_tra_hang, ${mocGiaiDoanTraHangSql("ddh")} as moc_giai_doan, CASE WHEN ${traHangTuHuySql("ddh")} THEN 1 ELSE 0 END as tu_huy_qua_han FROM dat_don_hang ddh WHERE ${whereSql}`,
  )
    .bind(...binds)
    .first();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);

  const { results: logs } = await c.env.DB.prepare("SELECT * FROM tra_hang_log WHERE dat_don_hang_id = ? ORDER BY id DESC").bind(donHangId).all();
  // Anh tra hang (phan hoi 2026-08-24) - moi vai tro xem duoc chi tiet dong nay (da qua scopeDatMuaNguoiTao
  // o tren) deu xem duoc ca 2 loai anh, khong can gioi han them (yeu cau #3: "các ảnh này các vai trò
  // liên quan đến có thể xem được").
  const { results: anh } = await c.env.DB.prepare(
    "SELECT id, loai, url, nguoi_upload, ngay_upload FROM tra_hang_anh WHERE dat_don_hang_id = ? ORDER BY id",
  )
    .bind(donHangId)
    .all();
  const duocDoiKhuVuc = await duocDoiKhuVucDon(c.env.DB, c.get("user"), donHangId);
  const { results: video } = await c.env.DB.prepare(
    "SELECT id, drive_file_id, ten_file, kich_thuoc, nguoi_upload, ngay_upload FROM tra_hang_video WHERE dat_don_hang_id = ? ORDER BY id",
  ).bind(donHangId).all();
  const dlq = await c.env.DB.prepare(`SELECT ${DAY_LUI_QC_DUOC_SQL("d")} AS ok FROM dat_don_hang d WHERE d.id = ?`).bind(donHangId).first<{ ok: number }>();
  return c.json({ donHang: { ...ganHanGiaiDoan(ddh as Record<string, unknown>), duoc_doi_khu_vuc: duocDoiKhuVuc, day_lui_qc_duoc: !!dlq?.ok }, logs, anh, video });
});

// GET /api/tra-hang/resolve-ma-thung/:maThung - tra ve dat_don_hang.id tuong ung voi 1 ma thung tra
// (TRA-xxxxxx) - dung cho link truy cap truc tiep theo ma thung (them 2026-09-09, xem frontend/src/
// lib/pxkDeepLink.ts). ma_thung_tra la 1-1 voi dat_don_hang.id (moi dong tra hang rieng duoc sinh 1
// ma thung rieng luc "Cho ke toan duyet mem" -> "Cho kho xac nhan", xem applyTraHangLog ben duoi) nen
// chi can tra dung 1 id, khong phai danh sach.
traHang.get("/resolve-ma-thung/:maThung", async (c) => {
  const maThung = c.req.param("maThung");
  const scope = scopeDatMuaNguoiTao(c);
  const whereSql = "ddh.ma_thung_tra = ? AND ddh.loai_don = 'tra_hang'" + (scope?.whereSql ?? "");
  const binds = [maThung, ...(scope?.binds ?? [])];
  const row = await c.env.DB.prepare(`SELECT ddh.id FROM dat_don_hang ddh WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ id: string }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ id: row.id });
});

// POST /api/tra-hang/upload-anh - upload BINARY THO 1 anh len Drive qua OAuth uy quyen tai khoan
// Google THAT (phan hoi 2026-08-24: "hủy bỏ hoàn toàn cách lưu ảnh bằng google service [account]...
// chuyển sang OAuth vì tôi chỉ có tài khoản gmail cá nhân" - CUNG co che voi anh minh hoa linh kien,
// xem uploadPublicImage() trong lib/googleDrive.ts), KHONG gan vao don nao ca (dung luc TAO don - id
// dong con chua sinh, xem POST /dat-mua-lk/phieu-dat). Client giu lai {driveFileId, url} tra ve, gui
// kem trong body tao don de backend gan chinh thuc vao dong vua sinh trong CUNG 1 batch. Khong rang
// buoc role/trang thai o day (viec kiem tra so luong/quyen gan nam o noi NHAN cac gia tri nay).
traHang.post("/upload-anh", async (c) => {
  // Dinh dang / <= 10MB / <= 20 anh/ngay/tai khoan + tai len Drive - xem lib/anhUpload.ts.
  const uploaded = await nhanAnhTaiLen(c, (ext) => `tra-hang-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`);
  if (uploaded instanceof Response) return uploaded;
  return c.json({ driveFileId: uploaded.id, url: uploaded.thumbnailUrl, han_muc_anh: uploaded.hanMucAnh });
});

// POST /api/tra-hang/:donHangId/anh - upload BINARY THO 1 anh bang chung, gan THANG vao dong da
// TON TAI (khac /upload-anh o tren - dung khi QC tu choi, dong da co san tu luc tao). CHI QC (hoac
// Admin) duoc dung, CHI khi dong dang "Cho QC xac nhan" (khop dung buoc se bat buoc anh khi tu choi,
// xem applyTraHangLog). Chan qua 3 anh/dong cho loai nay.
traHang.post("/:donHangId/anh", async (c) => {
  if (!canQC(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const donHangId = c.req.param("donHangId");
  const ddh = await c.env.DB.prepare(
    "SELECT trang_thai_hien_tai as trang_thai FROM dat_don_hang WHERE id = ? AND loai_don = 'tra_hang'",
  )
    .bind(donHangId)
    .first<{ trang_thai: string | null }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);
  if (ddh.trang_thai !== "Cho QC xac nhan") return c.json({ error: "INVALID_STATE" }, 409);

  const countRow = await c.env.DB.prepare("SELECT COUNT(*) as n FROM tra_hang_anh WHERE dat_don_hang_id = ? AND loai = 'qc_tu_choi'")
    .bind(donHangId)
    .first<{ n: number }>();
  if ((countRow?.n ?? 0) >= MAX_ANH_TRA_HANG) return c.json({ error: "QUA_NHIEU_ANH" }, 400);

  // Dinh dang / <= 10MB / <= 20 anh/ngay/tai khoan + tai len Drive - xem lib/anhUpload.ts.
  const uploaded = await nhanAnhTaiLen(c, (ext) => `tra-hang-qc-${donHangId}-${Date.now()}.${ext}`);
  if (uploaded instanceof Response) return uploaded;

  const user = c.get("user");
  // FIX (phan hoi QA 2026-08-31, muc #6/#14): truoc day khong ghi log khi QC tai anh bang chung -
  // trang_thai giu nguyen "Cho QC xac nhan" (dung trang_thai hien tai cua don, xem guard tren), mo ta
  // that o ghi_chu (giong cach xu ly CHECK constraint co dinh cua phieu_xuat_kho_log).
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO tra_hang_anh (dat_don_hang_id, loai, drive_file_id, url, nguoi_upload) VALUES (?, 'qc_tu_choi', ?, ?, ?)",
    ).bind(donHangId, uploaded.id, uploaded.thumbnailUrl, user.email),
    c.env.DB.prepare(
      "INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)",
    ).bind(donHangId, "Cho QC xac nhan", user.email, nowVN(), "Đã tải ảnh bằng chứng từ chối"),
  ]);
  return c.json({ ok: true, url: uploaded.thumbnailUrl, han_muc_anh: uploaded.hanMucAnh });
});

// VIDEO bang chung QC tu choi (2026-11-10, <= 100MB, toi da 2 / don) - cung quyen + trang thai voi anh QC (/:donHangId/anh). 2 buoc:
// /video/bat-dau {ten, kich_thuoc, mime} -> URL phien tai resumable (trinh duyet PUT thang len Google); /video/xong {file_id} -> kiem tra file +
// chia se cong khai + ghi tra_hang_video + log.
async function kiemTraVideoQc(c: Context<{ Bindings: Env }>, donHangId: string): Promise<Response | null> {
  if (!canQC(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const ddh = await c.env.DB.prepare("SELECT trang_thai_hien_tai as trang_thai FROM dat_don_hang WHERE id = ? AND loai_don = 'tra_hang'")
    .bind(donHangId).first<{ trang_thai: string | null }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);
  if (ddh.trang_thai !== "Cho QC xac nhan") return c.json({ error: "INVALID_STATE" }, 409);
  const n = await c.env.DB.prepare("SELECT COUNT(*) as n FROM tra_hang_video WHERE dat_don_hang_id = ?").bind(donHangId).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_VIDEO_QC) return c.json({ error: "QUA_NHIEU_VIDEO" }, 400);
  return null;
}

traHang.post("/:donHangId/video/bat-dau", async (c) => {
  const donHangId = c.req.param("donHangId");
  const chan = await kiemTraVideoQc(c, donHangId);
  if (chan) return chan;
  const body = await c.req.json<{ ten?: string; kich_thuoc?: number; mime?: string }>().catch(() => ({}) as { ten?: string; kich_thuoc?: number; mime?: string });
  const kichThuoc = Number(body.kich_thuoc);
  const mime = String(body.mime ?? "");
  if (!mime.startsWith("video/")) return c.json({ error: "VIDEO_KHONG_HOP_LE" }, 400);
  if (!Number.isFinite(kichThuoc) || kichThuoc <= 0 || kichThuoc > VIDEO_TOI_DA_BYTE) return c.json({ error: "VIDEO_QUA_LON", toi_da: VIDEO_TOI_DA_BYTE }, 400);
  const duoi = (String(body.ten ?? "").match(/\.([A-Za-z0-9]{2,5})$/)?.[1] ?? "mp4").toLowerCase();
  try {
    const url = await batDauTaiVideo(c.env, c.env.DB, `tra-hang-qc-${donHangId}-${Date.now()}.${duoi}`, mime, kichThuoc, c.req.header("Origin") ?? null);
    return c.json({ upload_url: url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("video bat-dau", msg);
    if (msg.startsWith("GOOGLE_DRIVE_NOT_CONNECTED")) return c.json({ error: "GOOGLE_DRIVE_NOT_CONNECTED", message: "Chưa kết nối tài khoản Google Drive - vào Cài đặt để kết nối." }, 400);
    return c.json({ error: "TAI_VIDEO_THAT_BAI" }, 502);
  }
});

traHang.post("/:donHangId/video/xong", async (c) => {
  const donHangId = c.req.param("donHangId");
  const chan = await kiemTraVideoQc(c, donHangId);
  if (chan) return chan;
  const body = await c.req.json<{ file_id?: string }>().catch(() => ({}) as { file_id?: string });
  const fileId = String(body.file_id ?? "").trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) return c.json({ error: "VIDEO_KHONG_HOP_LE" }, 400);
  const da = await c.env.DB.prepare("SELECT 1 FROM tra_hang_video WHERE drive_file_id = ?").bind(fileId).first();
  if (da) return c.json({ error: "VIDEO_DA_GHI" }, 409);
  let kq: Awaited<ReturnType<typeof hoanTatVideo>>;
  try {
    kq = await hoanTatVideo(c.env, c.env.DB, fileId);
  } catch (err) {
    console.error("video xong", err instanceof Error ? err.message : String(err));
    return c.json({ error: "TAI_VIDEO_THAT_BAI" }, 502);
  }
  if (!kq.ok) return c.json({ error: kq.error }, 400);
  const user = c.get("user");
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO tra_hang_video (dat_don_hang_id, drive_file_id, ten_file, kich_thuoc, mime, nguoi_upload, ngay_upload) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(donHangId, fileId, kq.ten, kq.kichThuoc, kq.mime, user.email, now),
    c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
      .bind(donHangId, "Cho QC xac nhan", user.email, now, `Đã tải video bằng chứng từ chối (${(kq.kichThuoc / 1024 / 1024).toFixed(1)} MB)`),
  ]);
  return c.json({ ok: true, file_id: fileId, kich_thuoc: kq.kichThuoc });
});

// Logic dung chung cho 1 dong don tra hang - tach ra de route bulk-log tai su dung dung 1 cho (them
// 2026-08-15, tieu chi UX #4), khong copy lai role-check. Tra { error, status } khi khong hop le,
// hoac { nextTrangThai } khi thanh cong.
async function applyTraHangLog(
  c: Context<{ Bindings: Env }>,
  donHangId: string,
  hanhDong: "duyet" | "tu_choi" | "huy",
  ghiChu: string | undefined,
  lyDoChamId?: number,
  // SL thuc te Kho nhan duoc (2026-10-05) - CHI o buoc "Cho kho xac nhan" + duyet; ghi vao so_luong_thuc_xuat (PXK/MISA doc
  // COALESCE(so_luong_thuc_xuat, so_luong_de_xuat)). Bang SL de xuat -> NULL (khong doi).
  soLuongThucTe?: number,
  // SL QC xac nhan DAT (chot 2026-11-10, "gửi 6 LK, QC xác nhận 5, 1 LK sẽ được tách riêng đơn chờ QC xác nhận tiếp") - CHI buoc
  // "Cho QC xac nhan" + duyet. Nho hon SL dang nhan -> phan con lai tach thanh don MOI van "Cho QC xac nhan" (QC duyet / tu choi tiep).
  soLuongDat?: number,
): Promise<{ error: string; status: 400 | 404 | 409 | 403 } | { nextTrangThai: string; donTach?: string }> {
  // SUA 2026-08-21: truoc doc trang thai qua subquery tuong quan tra_hang_log (co bug qualify cot "id"
  // bi shadow, da vá bang fallback `?? "Cho ke toan duyet mem"") - doi hang doc thang cot mirror
  // trang_thai_hien_tai (LUON dong bo qua CAS ngay ben duoi), vua don gian hon vua tranh dung ca lop
  // "dong tra_hang vua tao chua co log dau tien" (xem giai thich o GET / ben tren).
  const ddh = await c.env.DB.prepare(
    `SELECT id, nguoi_tao, nguoi_nhan_hang, ma_xuat_kho, version, trang_thai_hien_tai as trang_thai, email_gs, ten_lk_snapshot, so_luong_de_xuat, so_luong_thuc_xuat, ma_thung_tra,
       ${mocGiaiDoanTraHangSql("dat_don_hang")} as moc_giai_doan
     FROM dat_don_hang WHERE id = ? AND loai_don = 'tra_hang'`,
  )
    .bind(donHangId)
    .first<{
      id: string; nguoi_tao: string; nguoi_nhan_hang: string | null; ma_xuat_kho: string | null; version: number; trang_thai: string | null;
      email_gs: string | null; ten_lk_snapshot: string; so_luong_de_xuat: number; so_luong_thuc_xuat: number | null; ma_thung_tra: string | null;
      moc_giai_doan: string | null;
    }>();
  if (!ddh) return { error: "NOT_FOUND", status: 404 };

  const trangThaiHienTai = ddh.trang_thai ?? "Cho ke toan duyet mem";
  if ((TRANG_THAI_DONG as readonly string[]).includes(trangThaiHienTai)) return { error: "DA_DONG", status: 409 };

  const user = c.get("user");
  let nextTrangThai: string;

  // FIX (phan hoi 2026-08-25, hang muc #19): bat buoc ghi_chu o TAT CA cac buoc huy/tu choi - dao
  // nguoc quyet dinh cu (comment goc giai thich ly do cu da xoa: chi bat buoc o buoc cuoi cung de
  // tranh ep nguoi dung nhap qua nhieu lan, nay chu he thong yeu cau nghiem ngat lai).
  if (hanhDong === "huy") {
    if (ddh.nguoi_tao !== user.email && !canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    if (!ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 409 };
    nextTrangThai = "Da huy";
  } else if (trangThaiHienTai === "Cho ke toan duyet mem") {
    if (!canKeToan(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    if (hanhDong === "tu_choi" && !ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 409 };
    nextTrangThai = hanhDong === "duyet" ? "Cho kho xac nhan" : "Tu choi";
  } else if (trangThaiHienTai === "Cho kho xac nhan") {
    if (!canKho(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    if (hanhDong === "tu_choi" && !ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 409 };
    // SUA (phan hoi 2026-09-09: "cho Kho xác nhận trực tiếp qua link mở linh-kien-app, chấp nhận mất
    // bước quét mã vật lý qua khovan") - truoc day (chot 08/09/2026) buoc nay CHAN CUNG khi da co
    // ma_thung_tra, bat Kho phai quet ma that qua khovan (xem routes/partnerKho.ts::/tra-hang/:id/
    // kho-xac-nhan). Nguoi dung xac nhan RO da danh doi mat lop xac minh vat ly do de doi lay duong
    // xac nhan THANG qua link (xem lib/pxkDeepLink.ts phia FE) - khovan van duoc bao lai trang thai
    // moi ngay sau khi CAS thanh cong (xem duoi), khong con la nguon xac nhan duy nhat nua.
    nextTrangThai = hanhDong === "duyet" ? "Cho QC xac nhan" : "Tu choi";
  } else if (trangThaiHienTai === "Cho QC xac nhan") {
    if (!canQC(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    // CHOT (phan hoi 2026-08-24, muc 2 "khi QC duyệt đơn trả hàng: bắt buộc phải có ảnh bằng chứng
    // nếu từ chối") - anh phai upload TRUOC qua POST /:donHangId/anh (xem tren) - kiem tra da co >=1
    // dong loai='qc_tu_choi' cho dong nay. Hang muc #19 (2026-08-25): THEM bat buoc ghi_chu (truoc chi
    // bat buoc anh, khong bat buoc ghi_chu).
    if (hanhDong === "tu_choi") {
      if (!ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 409 };
      const anhRow = await c.env.DB.prepare("SELECT COUNT(*) as n FROM tra_hang_anh WHERE dat_don_hang_id = ? AND loai = 'qc_tu_choi'")
        .bind(donHangId)
        .first<{ n: number }>();
      if (!anhRow?.n) return { error: "MISSING_ANH_QC", status: 409 };
    }
    // Tu dong duyet 100% (chot 2026-10-14, muc 1): QC dong y -> "TN da duyet" + tu vao phieu tra hang (bo buoc "Cho TN duyet tong").
    nextTrangThai = hanhDong === "duyet" ? "TN da duyet" : "Tu choi";
    if (hanhDong === "duyet") ghiChu = ghiChu?.trim() ? `${ghiChu.trim()} | QC đồng ý → tự duyệt, vào phiếu trả hàng` : "QC đồng ý → tự duyệt, vào phiếu trả hàng";
  } else if (trangThaiHienTai === "Cho TN duyet tong") {
    // Don con ton o buoc cu (truoc 2026-10-14) - TN van duyet duoc; duyet xong cung tu vao phieu tra hang (xem duoi).
    if (!canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    if (hanhDong === "tu_choi" && !ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 409 };
    // SUA (migration 0002_tra_hang_pxk.sql): truoc day di tiep toi "Cho ke toan xac nhan nhap kho" ->
    // "Cho kho xac nhan nhap kho" -> "Da hoan thanh" - gio dung o "TN da duyet" (trang thai DONG cua
    // state machine nay, xem TRANG_THAI_DONG dau file), TN sang tab "Phieu xuat kho" tao PXK that de
    // di tiep phan con lai (xem giai thich day du o comment dau file).
    nextTrangThai = hanhDong === "duyet" ? "TN da duyet" : "Tu choi";
  } else {
    return { error: "INVALID_STATE", status: 409 };
  }

  // Kho sua SL thuc te nhan duoc truoc khi duyet (2026-10-05).
  let slThucXuatMoi: number | null | undefined; // undefined = khong doi
  if (soLuongThucTe !== undefined && soLuongThucTe !== null) {
    if (trangThaiHienTai !== "Cho kho xac nhan" || hanhDong !== "duyet") return { error: "SO_LUONG_CHI_SUA_O_BUOC_KHO", status: 409 };
    if (!Number.isInteger(soLuongThucTe) || soLuongThucTe < 1 || soLuongThucTe > 10_000) return { error: "SO_LUONG_KHONG_HOP_LE", status: 400 };
    const slCu = ddh.so_luong_thuc_xuat ?? ddh.so_luong_de_xuat;
    if (soLuongThucTe !== slCu) {
      slThucXuatMoi = soLuongThucTe === ddh.so_luong_de_xuat ? null : soLuongThucTe;
      const moTa = `Kho sửa SL thực tế nhận: ${slCu} → ${soLuongThucTe}`;
      ghiChu = ghiChu?.trim() ? `${moTa} | ${ghiChu.trim()}` : moTa;
    }
  }

  // QC xac nhan SL dat < SL dang nhan -> tach phan con lai (2026-11-10).
  const slDangNhan = ddh.so_luong_thuc_xuat ?? ddh.so_luong_de_xuat;
  let slTachQc = 0;
  if (soLuongDat !== undefined && soLuongDat !== null) {
    if (trangThaiHienTai !== "Cho QC xac nhan" || hanhDong !== "duyet") return { error: "SL_DAT_CHI_O_BUOC_QC", status: 409 };
    if (!Number.isInteger(soLuongDat) || soLuongDat < 1 || soLuongDat > slDangNhan) return { error: "SO_LUONG_KHONG_HOP_LE", status: 400 };
    slTachQc = slDangNhan - soLuongDat;
  }

  // Han 24h tung giai doan (chot 2026-10-01): bo phan dang giu don xu ly (Duyet/Tu choi) SAU han 24h tinh tu moc xu ly cuoi cua
  // giai doan truoc -> BAT BUOC chon ly do cham (cung danh muc settings_ly_do_cham "Mua hàng" voi don mua), ghi vao log. Huy
  // (nguoi tao/TN) khong phai xu ly giai doan nen khong bat.
  if (hanhDong !== "huy" && quaHanGiaiDoanTraHang(trangThaiHienTai, ddh.moc_giai_doan, nowVN())) {
    if (!lyDoChamId) return { error: "MISSING_LY_DO_CHAM", status: 400 };
    const lyDo = await c.env.DB.prepare(
      "SELECT ten_ly_do FROM settings_ly_do_cham WHERE id = ? AND bat_tat = 1 AND he_thong_su_dung LIKE '%Mua hàng%'",
    )
      .bind(lyDoChamId)
      .first<{ ten_ly_do: string }>();
    if (!lyDo) return { error: "LY_DO_CHAM_KHONG_HOP_LE", status: 400 };
    const han = tinhHanLyDoCham(ddh.moc_giai_doan!).toISOString().slice(0, 16).replace("T", " ");
    ghiChu = `Chậm quá hạn 24h (hạn ${han}) - lý do: ${lyDo.ten_ly_do}` + (ghiChu?.trim() ? ` | ${ghiChu.trim()}` : "");
  }

  // Luong C moi (chot 08/09/2026, xem Artifact "Ma tran luong Kho van"): dung LUC chuyen "Cho ke
  // toan duyet mem" -> "Cho kho xac nhan" (Ke toan vua duyet mem xong) - day 1 thung vat ly moi
  // sang khovan de Kho nhan that qua khovan (thay vi bam nut noi bo nhu truoc day, dung nguyen tac
  // "Kho chi thao tac qua app kho van"). CHAN thao tac (khong best-effort nhu pushPxkToKhovan/
  // pushBoxToKhovan o 2 luong cu) - da thong nhat voi nguoi dung 2026-09-08: day la moc kich hoat
  // vat ly DUY NHAT cua ca luong, push loi ma van cho qua thi thung "mat tich" khong co trong
  // khovan de Kho quet nhan. Sinh ma truoc CAS - neu push loi, KHONG chay CAS, tra loi ngay de Ke
  // toan thu lai (ma thung sinh ra bi bo qua, khong ton hao gi vi id_counters chi dung de KHONG
  // trung, khong can lien tuc tuyet doi).
  let maThungTraMoi: string | null = null;
  if (trangThaiHienTai === "Cho ke toan duyet mem" && nextTrangThai === "Cho kho xac nhan") {
    maThungTraMoi = await nextSequentialId(c.env.DB, "tra_hang_box", "TRA", 6);
    const pushResult = await pushTraHangToKhovan(
      c.env,
      maThungTraMoi,
      `KTV ${ddh.nguoi_tao} trả hàng`,
      `Trả hàng "${ddh.ten_lk_snapshot} (x${ddh.so_luong_de_xuat})" - chờ Kho nhận, bàn giao QC`,
      buildWorkUrl(c.env, maThungTraMoi),
    );
    if (!pushResult.ok) return { error: "KHOVAN_PUSH_FAILED", status: 409 };
  }

  // RA SOAT BAO MAT 2026-08-18 (phan hoi Codex #8, migration 0087) - CAS giong applyDonHangLog, xem
  // comment o do.
  let donTach: string | undefined;
  if (slTachQc > 0) {
    // 1 batch: INSERT don moi (ban sao, SL con lai, "Cho QC xac nhan") CHON TU don goc voi DUNG version -> UPDATE don goc (SL dat, duyet).
    // Version doi giua chung -> ca 2 lenh khong khop dong nao -> STATE_CHANGED. Chep lich su tra hang + anh + Ma YCSC bo sung sang don moi.
    const { results: cot } = await c.env.DB.prepare("PRAGMA table_info(dat_don_hang)").all<{ name: string }>();
    const BO = new Set(["id", "so_luong_de_xuat", "so_luong_thuc_xuat", "so_tien_cong_no", "ma_xuat_kho", "updated_at", "trang_thai_hien_tai", "version", "ma_thung_tra"]);
    const chep = cot.map((x) => x.name).filter((n) => !BO.has(n));
    const newId = await nextSequentialId(c.env.DB, "dat_don_hang", "DDH", 6);
    const now = nowVN();
    const dc = await c.env.DB.prepare("SELECT so_tien_cong_no FROM dat_don_hang WHERE id = ?").bind(donHangId).first<{ so_tien_cong_no: number | null }>();
    const cnTach = dc?.so_tien_cong_no != null ? Math.round((dc.so_tien_cong_no * slTachQc) / slDangNhan) : null;
    const cnDat = dc?.so_tien_cong_no != null ? dc.so_tien_cong_no - (cnTach ?? 0) : null;
    const moTaSl = ddh.so_luong_thuc_xuat != null && ddh.so_luong_thuc_xuat !== ddh.so_luong_de_xuat
      ? ` (đề xuất ${ddh.so_luong_de_xuat}, Kho nhận ${ddh.so_luong_thuc_xuat})` : "";
    const ghiGoc = `QC xác nhận đạt ${soLuongDat}/${slDangNhan}${moTaSl} — ${slTachQc} chiếc chưa đạt tách sang đơn ${newId} chờ QC xác nhận tiếp`;
    ghiChu = ghiChu?.trim() ? `${ghiGoc} | ${ghiChu.trim()}` : ghiGoc;
    // ma_thung_tra UNIQUE (1 thung = 1 don) -> don tach KHONG mang ma thung, ghi ma thung goc vao lich su.
    const ghiMoi = `Tách từ đơn ${donHangId}${ddh.ma_thung_tra ? ` (thùng ${ddh.ma_thung_tra})` : ""}: ${slTachQc}/${slDangNhan} chiếc QC chưa xác nhận đạt (đơn gốc QC đạt ${soLuongDat}) — chờ QC duyệt hoặc từ chối`;
    const kq = await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO dat_don_hang (id, so_luong_de_xuat, so_luong_thuc_xuat, so_tien_cong_no, ma_xuat_kho, updated_at, trang_thai_hien_tai, version, ${chep.join(", ")})
         SELECT ?, ?, NULL, ?, NULL, ?, 'Cho QC xac nhan', 1, ${chep.join(", ")}
         FROM dat_don_hang WHERE id = ? AND version = ? AND trang_thai_hien_tai = 'Cho QC xac nhan'`,
      ).bind(newId, slTachQc, cnTach, now, donHangId, ddh.version),
      c.env.DB.prepare(
        `UPDATE dat_don_hang SET trang_thai_hien_tai = ?, so_luong_de_xuat = ?, so_luong_thuc_xuat = NULL, so_tien_cong_no = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND EXISTS (SELECT 1 FROM dat_don_hang WHERE id = ?)`,
      ).bind(nextTrangThai, soLuongDat, cnDat, now, donHangId, ddh.version, newId),
    ]);
    if (!kq[1].meta.changes) {
      await c.env.DB.prepare("DELETE FROM dat_don_hang WHERE id = ? AND NOT EXISTS (SELECT 1 FROM tra_hang_log WHERE dat_don_hang_id = ?)").bind(newId, newId).run();
      return { error: "STATE_CHANGED", status: 409 };
    }
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
         SELECT ?, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu FROM tra_hang_log WHERE dat_don_hang_id = ? ORDER BY id`,
      ).bind(newId, donHangId),
      c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho QC xac nhan', ?, ?, ?)")
        .bind(newId, user.email, now, ghiMoi.slice(0, 1000)),
      c.env.DB.prepare(
        `INSERT INTO tra_hang_anh (dat_don_hang_id, loai, drive_file_id, url, nguoi_upload, ngay_upload)
         SELECT ?, loai, drive_file_id, url, nguoi_upload, ngay_upload FROM tra_hang_anh WHERE dat_don_hang_id = ? ORDER BY id`,
      ).bind(newId, donHangId),
      c.env.DB.prepare("INSERT OR IGNORE INTO dat_don_case (dat_don_hang_id, case_id) SELECT ?, case_id FROM dat_don_case WHERE dat_don_hang_id = ?").bind(newId, donHangId),
    ]);
    donTach = newId;
  }

  const casResult = donTach ? { meta: { changes: 1 } } : await c.env.DB.prepare(
    maThungTraMoi
      ? "UPDATE dat_don_hang SET trang_thai_hien_tai = ?, ma_thung_tra = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?"
      : slThucXuatMoi !== undefined
        ? "UPDATE dat_don_hang SET trang_thai_hien_tai = ?, so_luong_thuc_xuat = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?"
        : "UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
  )
    .bind(
      ...(maThungTraMoi
        ? [nextTrangThai, maThungTraMoi, nowVN(), donHangId, ddh.version]
        : slThucXuatMoi !== undefined
          ? [nextTrangThai, slThucXuatMoi, nowVN(), donHangId, ddh.version]
          : [nextTrangThai, nowVN(), donHangId, ddh.version]),
    )
    .run();
  if (donTach) ddh.so_luong_de_xuat = soLuongDat!;
  if (!casResult.meta.changes) return { error: "STATE_CHANGED", status: 409 };

  await c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(donHangId, nextTrangThai, user.email, nowVN(), ghiChu?.trim() || null)
    .run();

  // Don dong ("Tu choi"/"Da huy") SAU KHI da co thung ve kho that (ma_thung_tra) - hang van dang
  // nam vat ly o kho, bao nguoc khovan de hien dung trang thai cuoi thay vi de nguyen "Da nhan"
  // gay hieu nham da xong viec (chot 08/09/2026: xu ly thu cong ngoai he thong, khong tu tao luot
  // xuat tra lai KTV). Best-effort, khong chan hanh dong dong don.
  if ((nextTrangThai === "Tu choi" || nextTrangThai === "Da huy") && ddh.ma_thung_tra) {
    c.executionCtx.waitUntil(notifyTraHangQcRejected(c.env, ddh.ma_thung_tra, ghiChu?.trim() || "Đơn trả hàng bị đóng sau khi hàng đã về kho"));
  }

  // Kho xac nhan da NHAN thung hang tra THANG tren linh-kien-app qua link (them 2026-09-09, thay the
  // cho chan cung PHAI_XAC_NHAN_QUA_KHOVAN da bo o tren) - bao nguoc khovan cap nhat dung trang thai,
  // khong de nguyen "pending" gay hieu nham chua ai xu ly. Best-effort.
  if (trangThaiHienTai === "Cho kho xac nhan" && nextTrangThai === "Cho QC xac nhan" && ddh.ma_thung_tra) {
    c.executionCtx.waitUntil(notifyTraHangReceivedViaApp(c.env, ddh.ma_thung_tra, `Kho đã xác nhận nhận hàng trực tiếp trên hệ thống Đặt mua linh kiện`));
  }

  // Duyet xong (QC dong y, hoac TN duyet don ton buoc cu) -> tu gom vao phieu tra hang "Dang tao phieu" cua nguoi nhan (tao moi neu
  // chua co), bao TN len ma don hang / gui Ke toan (2026-10-14).
  if (nextTrangThai === "TN da duyet" && ddh.nguoi_nhan_hang && ddh.ma_xuat_kho == null) {
    const pxkId = await bundleAutoApprovedIntoPxk(c.env, c.env.DB, user.email, ddh.nguoi_nhan_hang, "tra_hang", [{ donHangId, soTien: 0 }]);
    if (pxkId) {
      const emailGsList = ddh.email_gs ? [ddh.email_gs] : [];
      c.executionCtx.waitUntil(
        (async () => {
          await notifyWorkflowTask(c.env, c.env.DB, {
            cat1Emails: await emailsForRoleOrQC(c.env.DB, "la_tac_nghiep", emailGsList),
            otherRoles: [],
            emailGsList,
            pastActors: [],
            title: "Trả hàng",
            body: `Đơn trả hàng "${ddh.ten_lk_snapshot} (x${ddh.so_luong_de_xuat})" QC đã đồng ý, đã vào phiếu ${pxkId} — chờ lên mã đơn hàng`,
            linkType: "phieu_xuat_kho",
            linkId: pxkId,
          });
        })(),
      );
    }
  }

  if (donTach) {
    const emailGsList = ddh.email_gs ? [ddh.email_gs] : [];
    c.executionCtx.waitUntil(
      (async () => {
        await notifyWorkflowTask(c.env, c.env.DB, {
          cat1Emails: await emailsForRoleOrQC(c.env.DB, "qc", emailGsList),
          otherRoles: [],
          emailGsList,
          pastActors: [],
          title: "Trả hàng",
          body: `Đơn trả hàng ${donTach} "${ddh.ten_lk_snapshot} (x${slTachQc})" tách từ ${donHangId} — chờ QC xác nhận phần còn lại`,
          linkType: "don_hang",
          linkId: donTach,
        });
      })(),
    );
  }

  // Bao "viec moi" cho vai tro SAP xu ly buoc tiep theo (phan hoi 2026-09-05).
  const role = roleForTraHangState(nextTrangThai);
  if (role) {
    const emailGsList = ddh.email_gs ? [ddh.email_gs] : [];
    c.executionCtx.waitUntil(
      (async () => {
        const [cat1Emails, pastActors] = await Promise.all([
          emailsForRoleOrQC(c.env.DB, role, emailGsList),
          pastActorsFor(c.env.DB, "tra_hang_log", "dat_don_hang_id", donHangId, user.email),
        ]);
        await notifyWorkflowTask(c.env, c.env.DB, {
          cat1Emails,
          otherRoles: TRA_HANG_ROLES.filter((r) => r !== role),
          emailGsList,
          pastActors,
          title: "Trả hàng",
          body: `Đơn trả hàng "${ddh.ten_lk_snapshot} (x${ddh.so_luong_de_xuat})" đang chờ bạn xử lý`,
          linkType: "don_hang",
          linkId: donHangId,
        });
      })(),
    );
  }

  return { nextTrangThai, donTach };
}

// POST /api/tra-hang/:donHangId/log - { hanh_dong: "duyet" | "tu_choi" | "huy" | "day_lui",
// ghi_chu? } chuyen trang thai theo dung thu tu vai tro. "day_lui" xem buoc 4 ke hoach (chi Ke
// toan/Kho duoc dung, xem route rieng ben duoi thay vi nhanh nay de tach rach ly do bat buoc).
traHang.post("/:donHangId/log", async (c) => {
  const donHangId = c.req.param("donHangId");
  const body = await c.req.json<{ hanh_dong: "duyet" | "tu_choi" | "huy"; ghi_chu?: string; ly_do_cham_id?: number; so_luong_thuc_te?: number; so_luong_dat?: number }>();
  const result = await applyTraHangLog(c, donHangId, body.hanh_dong, body.ghi_chu, body.ly_do_cham_id, body.so_luong_thuc_te, body.so_luong_dat);
  if ("error" in result) return c.json({ error: result.error }, result.status);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, trang_thai: result.nextTrangThai, don_tach: result.donTach ?? null });
});

// POST /api/tra-hang/bulk-log - { ids, hanh_dong, ghi_chu? } xu ly hang loat nhieu dong tra hang
// cung luc (them 2026-08-15, tieu chi UX #4). Tai su dung applyTraHangLog, tiep tuc xu ly cac id
// con lai ngay ca khi 1 id loi - tra ket qua tung id (khong phai tung phieu, moi id la 1 dong).
traHang.post("/bulk-log", async (c) => {
  const body = await c.req.json<{ ids: string[]; hanh_dong: "duyet" | "tu_choi" | "huy"; ghi_chu?: string; ly_do_cham_id?: number }>();
  if (!Array.isArray(body.ids) || body.ids.length === 0) return c.json({ error: "MISSING_IDS" }, 400);
  const ids = [...new Set(body.ids)];
  if (ids.length > MAX_BULK_IDS) return c.json({ error: "QUA_NHIEU_ID", max: MAX_BULK_IDS }, 400);

  const results: Record<string, string> = {};
  let coThanhCong = false;
  // Do thoi gian ca batch (giam sat AUD-002, cung ly do nhu datMuaLinhKien.ts - xem
  // docs/audit/RESPONSE_PLAN.md).
  const bulkStartedAt = Date.now();
  for (const donHangId of ids) {
    const result = await applyTraHangLog(c, donHangId, body.hanh_dong, body.ghi_chu, body.ly_do_cham_id);
    results[donHangId] = "error" in result ? result.error : result.nextTrangThai;
    if (!("error" in result)) coThanhCong = true;
  }
  console.log("[bulk-log]", { route: "tra-hang/bulk-log", count: ids.length, durationMs: Date.now() - bulkStartedAt });

  if (coThanhCong) c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ results });
});

// POST /api/tra-hang/:donHangId/log-lui - buoc 4 ke hoach (diem 19): chi Ke toan/Kho day nguoc 1
// buoc, bat buoc ghi_chu ly do. Khong cho day lui khi da o trang thai dong.
traHang.post("/:donHangId/log-lui", async (c) => {
  if (!canKeToan(c) && !canKho(c) && !canQC(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const donHangId = c.req.param("donHangId");
  const body = await c.req.json<{ ghi_chu: string }>();
  if (!body.ghi_chu?.trim()) return c.json({ error: "MISSING_GHI_CHU" }, 400);

  // SUA 2026-08-21: doc thang cot mirror trang_thai_hien_tai, xem giai thich o applyTraHangLog.
  const ddh = await c.env.DB
    .prepare("SELECT trang_thai_hien_tai as trang_thai, email_gs, ten_lk_snapshot, so_luong_de_xuat FROM dat_don_hang WHERE id = ? AND loai_don = 'tra_hang'")
    .bind(donHangId)
    .first<{ trang_thai: string | null; email_gs: string | null; ten_lk_snapshot: string; so_luong_de_xuat: number }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);

  const trangThaiHienTai = ddh.trang_thai ?? "Cho ke toan duyet mem";
  const user = c.get("user");
  const now = nowVN();

  // QC da duyet (nham) -> ve "Cho QC xac nhan": go khoi phieu tra hang (chua bi Ke toan chot) roi doi trang thai (2026-11-10).
  if (trangThaiHienTai === "TN da duyet") {
    const dk = await c.env.DB.prepare(`SELECT ${DAY_LUI_QC_DUOC_SQL("d")} AS ok, d.version,
        (SELECT pd.phieu_xuat_kho_id FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id
          WHERE pd.dat_don_hang_id = d.id AND p.trang_thai_hien_tai IN ('Dang tao phieu', 'Cho ke toan') LIMIT 1) AS pxk
      FROM dat_don_hang d WHERE d.id = ?`).bind(donHangId).first<{ ok: number; version: number; pxk: string | null }>();
    if (!dk?.ok) return c.json({ error: "PHIEU_TRA_HANG_DA_CHOT" }, 409);
    let phieuHuy = false;
    if (dk.pxk) {
      const go = await goDonKhoiPxk(c.env.DB, dk.pxk, donHangId, user.email, "Đẩy lùi đơn trả hàng về chờ QC xác nhận", body.ghi_chu.trim(), true, false);
      phieuHuy = go.huyPhieu;
    }
    const kq = await c.env.DB.prepare(
      "UPDATE dat_don_hang SET trang_thai_hien_tai = 'Cho QC xac nhan', ma_xuat_kho = NULL, version = version + 1, updated_at = ? WHERE id = ? AND trang_thai_hien_tai = 'TN da duyet'",
    ).bind(now, donHangId).run();
    if (!kq.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);
    await c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
      .bind(donHangId, "Cho QC xac nhan", user.email, now,
        `Đẩy lùi QC đã duyệt về chờ QC xác nhận${dk.pxk ? ` (gỡ khỏi phiếu ${dk.pxk}${phieuHuy ? ", phiếu không còn đơn nên tự hủy" : ""})` : ""}: ${body.ghi_chu.trim()}`.slice(0, 1000))
      .run();
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
    return c.json({ ok: true, trang_thai: "Cho QC xac nhan", pxk_go: dk.pxk, phieu_huy: phieuHuy });
  }

  const idx = (THU_TU_BUOC as readonly string[]).indexOf(trangThaiHienTai);
  if (idx <= 0) return c.json({ error: "KHONG_THE_DAY_LUI" }, 409);
  // Cac buoc khac giu quyen cu (Ke toan / Kho).
  if (!canKeToan(c) && !canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const prevTrangThai = THU_TU_BUOC[idx - 1];
  // Hanh dong don-tac-nhan (chi Ke toan/Kho, khong phai luong nhieu vai tro cung tranh 1 dong nhu
  // duyet/tu choi) - khong can CAS, nhung van bump version/trang_thai_hien_tai (migration 0087) de
  // cot mirror khong bi lech so voi lich su that.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1, updated_at = ? WHERE id = ?").bind(prevTrangThai, now, donHangId),
    c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      donHangId,
      prevTrangThai,
      user.email,
      now,
      body.ghi_chu.trim(),
    ),
  ]);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  // Bao "viec moi" cho vai tro cua buoc VUA bi day lui ve (phan hoi 2026-09-05).
  const role = roleForTraHangState(prevTrangThai);
  if (role) {
    const emailGsList = ddh.email_gs ? [ddh.email_gs] : [];
    c.executionCtx.waitUntil(
      (async () => {
        const [cat1Emails, pastActors] = await Promise.all([
          emailsForRoleOrQC(c.env.DB, role, emailGsList),
          pastActorsFor(c.env.DB, "tra_hang_log", "dat_don_hang_id", donHangId, user.email),
        ]);
        await notifyWorkflowTask(c.env, c.env.DB, {
          cat1Emails,
          otherRoles: TRA_HANG_ROLES.filter((r) => r !== role),
          emailGsList,
          pastActors,
          title: "Trả hàng",
          body: `Đơn trả hàng "${ddh.ten_lk_snapshot} (x${ddh.so_luong_de_xuat})" bị đẩy lùi, đang chờ bạn xử lý`,
          linkType: "don_hang",
          linkId: donHangId,
        });
      })(),
    );
  }
  return c.json({ ok: true, trang_thai: prevTrangThai });
});

export default traHang;
