import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { scopeDatMuaNguoiTao } from "../lib/scopeDatMua";

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
  return c.json({ donHang: ddh, logs });
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
    "SELECT id, nguoi_tao, version, trang_thai_hien_tai as trang_thai FROM dat_don_hang WHERE id = ? AND loai_don = 'tra_hang'",
  )
    .bind(donHangId)
    .first<{ id: string; nguoi_tao: string; version: number; trang_thai: string | null }>();
  if (!ddh) return { error: "NOT_FOUND", status: 404 };

  const trangThaiHienTai = ddh.trang_thai ?? "Cho ke toan duyet mem";
  if ((TRANG_THAI_DONG as readonly string[]).includes(trangThaiHienTai)) return { error: "DA_DONG", status: 409 };

  const user = c.get("user");
  let nextTrangThai: string;

  if (hanhDong === "huy") {
    if (ddh.nguoi_tao !== user.email && !canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = "Da huy";
  } else if (trangThaiHienTai === "Cho ke toan duyet mem") {
    if (!canKeToan(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = hanhDong === "duyet" ? "Cho kho xac nhan" : "Tu choi";
  } else if (trangThaiHienTai === "Cho kho xac nhan") {
    if (!canKho(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = hanhDong === "duyet" ? "Cho QC xac nhan" : "Tu choi";
  } else if (trangThaiHienTai === "Cho QC xac nhan") {
    if (!canQC(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = hanhDong === "duyet" ? "Cho TN duyet tong" : "Tu choi";
  } else if (trangThaiHienTai === "Cho TN duyet tong") {
    if (!canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #13): chi bat buoc ghi_chu khi Tu choi o BUOC
    // CUOI CO TINH QUYET DINH nhat (tuong duong "Cho TN duyet" ben luong mua hang, noi
    // DonHangDetailModal cung bat buoc chon Ly do cham) - 3 buoc KT/Kho/QC dau chuoi giu nhe nhu cu
    // (khong bat buoc gi), tranh ep ca 4 buoc deu phai nhap trong khi chi 1 buoc that su nghiem trong.
    if (hanhDong === "tu_choi" && !ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 409 };
    // SUA (migration 0002_tra_hang_pxk.sql): truoc day di tiep toi "Cho ke toan xac nhan nhap kho" ->
    // "Cho kho xac nhan nhap kho" -> "Da hoan thanh" - gio dung o "TN da duyet" (trang thai DONG cua
    // state machine nay, xem TRANG_THAI_DONG dau file), TN sang tab "Phieu xuat kho" tao PXK that de
    // di tiep phan con lai (xem giai thich day du o comment dau file).
    nextTrangThai = hanhDong === "duyet" ? "TN da duyet" : "Tu choi";
  } else {
    return { error: "INVALID_STATE", status: 409 };
  }

  // RA SOAT BAO MAT 2026-08-18 (phan hoi Codex #8, migration 0087) - CAS giong applyDonHangLog, xem
  // comment o do.
  const casResult = await c.env.DB.prepare(
    "UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
  )
    .bind(nextTrangThai, nowVN(), donHangId, ddh.version)
    .run();
  if (!casResult.meta.changes) return { error: "STATE_CHANGED", status: 409 };

  await c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(donHangId, nextTrangThai, user.email, nowVN(), ghiChu?.trim() || null)
    .run();

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
  for (const donHangId of ids) {
    const result = await applyTraHangLog(c, donHangId, body.hanh_dong, body.ghi_chu);
    results[donHangId] = "error" in result ? result.error : result.nextTrangThai;
    if (!("error" in result)) coThanhCong = true;
  }

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
  const ddh = await c.env.DB.prepare("SELECT trang_thai_hien_tai as trang_thai FROM dat_don_hang WHERE id = ? AND loai_don = 'tra_hang'")
    .bind(donHangId)
    .first<{ trang_thai: string | null }>();
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
  return c.json({ ok: true, trang_thai: prevTrangThai });
});

export default traHang;
