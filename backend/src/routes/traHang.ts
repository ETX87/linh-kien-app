import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { scopeDatMuaNguoiTao, khuVucSetWhereSql } from "../lib/scopeDatMua";
import { uploadPublicImage } from "../lib/googleDrive";
import { notifyWorkflowTask, emailsForRoleOrQC, pastActorsFor, TRA_HANG_ROLES, type ViecMoiRoleCol } from "../lib/taskNotify";
import { nextSequentialId } from "../lib/idCounter";
import { pushTraHangToKhovan, notifyTraHangQcRejected, notifyTraHangReceivedViaApp, buildWorkUrl } from "../lib/khovanPushClient";

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
const MAX_ANH_TRA_HANG = 3;
const THU_TU_BUOC = [
  "Cho ke toan duyet mem",
  "Cho kho xac nhan",
  "Cho QC xac nhan",
  "Cho TN duyet tong",
  "TN da duyet",
] as const;

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
  const q = c.req.query("q")?.trim();
  // GD4 (phan hoi Codex #17): truoc day tra ve TOAN BO dong khop bo loc, frontend tu slice o client.
  // Them phan trang server-side, cung pattern voi GET /dat-mua-lk/don-hang. "nguoi_tao" chuyen tu loc
  // client-side (tren data.rows) sang server-side de khop dung tong so sau khi phan trang that su.
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(1000, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;
  let whereSql = "ddh.loai_don = 'tra_hang'" + (scope?.whereSql ?? "");
  const binds: unknown[] = [...(scope?.binds ?? [])];
  if (trangThai) {
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
    whereSql += " AND (ddh.ma_lk LIKE ? OR ddh.ten_lk_snapshot LIKE ? OR ddh.id LIKE ? OR ddh.nguoi_tao LIKE ?)";
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
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
    `SELECT ddh.*, ddh.trang_thai_hien_tai as trang_thai_tra_hang
     FROM dat_don_hang ddh WHERE ${whereSql} ORDER BY ddh.ngay_tao DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/tra-hang/:donHangId - chi tiet dong don hang + log rieng luong tra hang. Ap dung
// scopeDatMuaNguoiTao giong GET / (RA SOAT BAO MAT 2026-08-18) - tra 404 khi ngoai pham vi.
traHang.get("/:donHangId", async (c) => {
  const donHangId = c.req.param("donHangId");
  const scope = scopeDatMuaNguoiTao(c);
  const whereSql = "ddh.id = ? AND ddh.loai_don = 'tra_hang'" + (scope?.whereSql ?? "");
  const binds = [donHangId, ...(scope?.binds ?? [])];
  const ddh = await c.env.DB.prepare(
    `SELECT ddh.*, ddh.trang_thai_hien_tai as trang_thai_tra_hang FROM dat_don_hang ddh WHERE ${whereSql}`,
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
  return c.json({ donHang: ddh, logs, anh });
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
  const contentType = c.req.header("Content-Type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return c.json({ error: "INVALID_CONTENT_TYPE" }, 400);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);

  const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const filename = `tra-hang-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
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
  return c.json({ driveFileId: uploaded.id, url: uploaded.thumbnailUrl });
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

  const contentType = c.req.header("Content-Type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return c.json({ error: "INVALID_CONTENT_TYPE" }, 400);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);

  const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const filename = `tra-hang-qc-${donHangId}-${Date.now()}.${ext}`;
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
  return c.json({ ok: true, url: uploaded.thumbnailUrl });
});

// Logic dung chung cho 1 dong don tra hang - tach ra de route bulk-log tai su dung dung 1 cho (them
// 2026-08-15, tieu chi UX #4), khong copy lai role-check. Tra { error, status } khi khong hop le,
// hoac { nextTrangThai } khi thanh cong.
async function applyTraHangLog(
  c: Context<{ Bindings: Env }>,
  donHangId: string,
  hanhDong: "duyet" | "tu_choi" | "huy",
  ghiChu: string | undefined,
): Promise<{ error: string; status: 404 | 409 | 403 } | { nextTrangThai: string }> {
  // SUA 2026-08-21: truoc doc trang thai qua subquery tuong quan tra_hang_log (co bug qualify cot "id"
  // bi shadow, da vá bang fallback `?? "Cho ke toan duyet mem"") - doi hang doc thang cot mirror
  // trang_thai_hien_tai (LUON dong bo qua CAS ngay ben duoi), vua don gian hon vua tranh dung ca lop
  // "dong tra_hang vua tao chua co log dau tien" (xem giai thich o GET / ben tren).
  const ddh = await c.env.DB.prepare(
    "SELECT id, nguoi_tao, version, trang_thai_hien_tai as trang_thai, email_gs, ten_lk_snapshot, so_luong_de_xuat, ma_thung_tra FROM dat_don_hang WHERE id = ? AND loai_don = 'tra_hang'",
  )
    .bind(donHangId)
    .first<{
      id: string; nguoi_tao: string; version: number; trang_thai: string | null;
      email_gs: string | null; ten_lk_snapshot: string; so_luong_de_xuat: number; ma_thung_tra: string | null;
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
    nextTrangThai = hanhDong === "duyet" ? "Cho TN duyet tong" : "Tu choi";
  } else if (trangThaiHienTai === "Cho TN duyet tong") {
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
  const casResult = await c.env.DB.prepare(
    maThungTraMoi
      ? "UPDATE dat_don_hang SET trang_thai_hien_tai = ?, ma_thung_tra = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?"
      : "UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
  )
    .bind(...(maThungTraMoi ? [nextTrangThai, maThungTraMoi, nowVN(), donHangId, ddh.version] : [nextTrangThai, nowVN(), donHangId, ddh.version]))
    .run();
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

  return { nextTrangThai };
}

// POST /api/tra-hang/:donHangId/log - { hanh_dong: "duyet" | "tu_choi" | "huy" | "day_lui",
// ghi_chu? } chuyen trang thai theo dung thu tu vai tro. "day_lui" xem buoc 4 ke hoach (chi Ke
// toan/Kho duoc dung, xem route rieng ben duoi thay vi nhanh nay de tach rach ly do bat buoc).
traHang.post("/:donHangId/log", async (c) => {
  const donHangId = c.req.param("donHangId");
  const body = await c.req.json<{ hanh_dong: "duyet" | "tu_choi" | "huy"; ghi_chu?: string }>();
  const result = await applyTraHangLog(c, donHangId, body.hanh_dong, body.ghi_chu);
  if ("error" in result) return c.json({ error: result.error }, result.status);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, trang_thai: result.nextTrangThai });
});

// POST /api/tra-hang/bulk-log - { ids, hanh_dong, ghi_chu? } xu ly hang loat nhieu dong tra hang
// cung luc (them 2026-08-15, tieu chi UX #4). Tai su dung applyTraHangLog, tiep tuc xu ly cac id
// con lai ngay ca khi 1 id loi - tra ket qua tung id (khong phai tung phieu, moi id la 1 dong).
traHang.post("/bulk-log", async (c) => {
  const body = await c.req.json<{ ids: string[]; hanh_dong: "duyet" | "tu_choi" | "huy"; ghi_chu?: string }>();
  if (!Array.isArray(body.ids) || body.ids.length === 0) return c.json({ error: "MISSING_IDS" }, 400);
  const ids = [...new Set(body.ids)];
  if (ids.length > MAX_BULK_IDS) return c.json({ error: "QUA_NHIEU_ID", max: MAX_BULK_IDS }, 400);

  const results: Record<string, string> = {};
  let coThanhCong = false;
  // Do thoi gian ca batch (giam sat AUD-002, cung ly do nhu datMuaLinhKien.ts - xem
  // docs/audit/RESPONSE_PLAN.md).
  const bulkStartedAt = Date.now();
  for (const donHangId of ids) {
    const result = await applyTraHangLog(c, donHangId, body.hanh_dong, body.ghi_chu);
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
  if (!canKeToan(c) && !canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
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
  const idx = (THU_TU_BUOC as readonly string[]).indexOf(trangThaiHienTai);
  if (idx <= 0) return c.json({ error: "KHONG_THE_DAY_LUI" }, 409);

  const user = c.get("user");
  const prevTrangThai = THU_TU_BUOC[idx - 1];
  const now = nowVN();
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
