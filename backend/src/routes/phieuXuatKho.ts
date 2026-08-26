import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { nextSequentialId } from "../lib/idCounter";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { quaHanLyDoCham } from "../lib/hanLyDoCham";
import { autoClaimGs, scopePxkNguoiNhanHang } from "../lib/scopeDatMua";
import { uploadPublicImage } from "../lib/googleDrive";

// Phieu xuat kho/giao hang - xem migration 0058_phieu_xuat_kho.sql + 0066_pxk_gop_chuyen_tien.sql.
// Pattern header+log giong phieu_dat. TN tao (gom nhieu dong don hang da "TN da duyet" vao 1
// phieu), Ke toan xu ly AMIS, Kho dong goi/giao, KTV xac nhan nhan hang.
//
// 8 trang thai dung dung theo sheet "Settings" (cot "3. Phieu tra") cua file Excel goc, KHONG tu
// dat ten - xem comment migration 0066: Dang tao phieu -> Cho ke toan -> Da chot xong don xuat ->
// [Dang gui KTV -> KTV da nhan] hoac [Hang tru kho] hoac [Kho da ket thuc] (Kho tu dong khi KTV
// khong phan hoi), + nhanh huy "Ke toan huy" o 2 buoc dau. Ap dung cho loai_don='mua'/'cong_no'.
//
// SUA (phan hoi 2026-08-21, migration 0002_tra_hang_pxk.sql): mo rong them 1 nhanh CHO RIENG
// loai_don='tra_hang' (loai_don nay da duoc CHECK constraint cho phep tu migration 0001 nhung chua co
// code nao tao/xu ly duoc) - dung LAI dung 3 buoc dau (Dang tao phieu -> Cho ke toan -> Da chot xong
// don xuat), roi thay vi [Dang gui KTV -> KTV da nhan] (KTV nhan hang RA), tra hang di THANG toi 1
// trang thai MOI "Kho da nhan hang tra" (Kho xac nhan da nhan hang VE kho) - khong co buoc "dang gui"
// trung gian vi hang khong phai ship di dau (xem giai thich day du o traHang.ts).
//
// "Chuyen tien" (thay the bang phieu_so_tien cu) la 1 DIEU KIEN CHAN rieng tren chinh phieu_xuat_kho
// (cot so_tien_can_chuyen/trang_thai_chuyen_tien/...), khong phai 1 buoc trong chuoi trang_thai
// chinh - chan luc chuyen "Dang tao phieu" -> "Cho ke toan" (xem POST /:id/log). Khong ap dung thuc
// te cho tra_hang (khong co khai niem chuyen tien khi tra linh kien), nhung van la truong TUY CHON
// nen khong can chan them - TN chi don gian bo trong luc tao PXK tra hang.
const phieuXuatKho = new Hono<{ Bindings: Env }>();
phieuXuatKho.use("*", verifySessionMiddleware, loadUser, requireDatMuaLkArea);

const TRANG_THAI_DONG = ["KTV da nhan", "Ke toan huy", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"] as const;

function latestStatusExpr(idCol: string): string {
  return `(SELECT trang_thai FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = ${idCol} ORDER BY id DESC LIMIT 1)`;
}

// Trang thai 1 DONG dat_don_hang (khac PXK o tren) - dung khi loc dong "TN da duyet" cho picker tao
// PXK. Cung cong thuc voi latestDonHangStatusExpr trong datMuaLinhKien.ts (khong dung chung 1 ham
// export - moi route file tu dinh nghia ham rieng cho log table minh doc). An toan vi PXK/dat_don_hang
// (loai_don != 'tra_hang') LUON nhan dong log dau tien ngay luc tao (khac tra_hang - xem bug/fix o
// traHang.ts GET / - tra_hang KHONG nhan log dau tien nen phai doc thang cot mirror thay vi qua day).
function latestDonHangLogStatusExpr(donHangIdCol: string): string {
  return `(SELECT trang_thai FROM dat_don_hang_log WHERE dat_don_hang_id = ${donHangIdCol} ORDER BY id DESC LIMIT 1)`;
}

function canTacNghiep(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_tac_nghiep || user.vai_tro === "Admin";
}

function canKeToan(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_ke_toan || user.vai_tro === "Admin";
}

function canKho(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_kho || user.vai_tro === "Admin";
}

// GET /api/phieu-xuat-kho/mo-count - tong so PXK DANG MO (chua xu ly xong, xem TRANG_THAI_DONG dau
// file), dung cho badge "(N)" o tab "Phiếu xuất kho" tren thanh tab (phan hoi 2026-08-24: "Thẻ phiếu
// xuất kho có đơn nhưng đang không hiện (1) ở tên thẻ như thẻ trả hàng"). Gom CA mua/cong_no/tra_hang
// (khong loc loai_don) - tab nay ban than da gom ca 3 qua sub-tab xemLoaiDon rieng, khop dung y nghia
// "co viec dang cho xu ly trong tab nay" giong cach badge "Trả hàng" the hien. Dung CHUNG scope voi
// GET / (scopePxkNguoiNhanHang) de con so khop dung nhung gi nguoi dung se thay khi mo tab that su.
phieuXuatKho.get("/mo-count", async (c) => {
  const scope = scopePxkNguoiNhanHang(c);
  const placeholders = TRANG_THAI_DONG.map(() => "?").join(",");
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM phieu_xuat_kho pxk WHERE pxk.trang_thai_hien_tai NOT IN (${placeholders})${scope?.whereSql ?? ""}`,
  )
    .bind(...TRANG_THAI_DONG, ...(scope?.binds ?? []))
    .first<{ n: number }>();
  return c.json({ count: row?.n ?? 0 });
});

// GET /api/phieu-xuat-kho?trang_thai= - danh sach. TN/Kho/Ke toan/QC/Admin xem toan bo (can theo doi
// giao hang toan he thong); KTV/Ve tinh/Giam sat bi gioi han qua scopePxkNguoiNhanHang (RA SOAT BAO
// MAT 2026-08-18, phan hoi Codex: truoc day KHONG gioi han cho AI ca, lo gia/cong no/ma MISA/bang
// chung chuyen tien toan he thong cho moi tai khoan trong module).
phieuXuatKho.get("/", async (c) => {
  const scope = scopePxkNguoiNhanHang(c);
  const trangThai = c.req.query("trang_thai");
  const nguoiNhanHang = c.req.query("nguoi_nhan_hang");
  const loaiDon = c.req.query("loai_don");
  // Them 2026-08-21 (dong bo UI voi GET /dat-mua-lk/don-hang) - tim theo ma PXK/ma don hang/ma
  // MISA/ma van don/nguoi tao/nguoi nhan hang.
  const q = c.req.query("q")?.trim();
  // GD4 (phan hoi Codex #17): endpoint nay truoc day tra VE TOAN BO dong khop bo loc, frontend tu
  // slice 20 dong/trang o client - moi lan doi trang van tai lai het du lieu tu D1. Them phan trang
  // server-side, cung pattern voi GET /dat-mua-lk/don-hang.
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(1000, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;
  let whereSql = "1=1" + (scope?.whereSql ?? "");
  const binds: unknown[] = [...(scope?.binds ?? [])];
  if (trangThai === "CHO_TIEN") {
    // Sentinel rieng (phan hoi 2026-08-24: "2 thẻ chờ tiền và pxk hình như đang là 1... ấn giữa 2
    // button này không có phản hồi") - "cho tien" la 1 DIEU KIEN CHAN tren so_tien_can_chuyen/
    // trang_thai_chuyen_tien (xem comment dau file), KHONG phai 1 gia tri trang_thai_hien_tai that
    // nen KHONG the loc bang so sanh = nhu cac trang thai khac - truoc day nut "Chờ tiền" tren
    // pipeline tro TAM ve filter="Dang tao phieu" (trung voi nut "Tạo PXK" ben canh, khien 2 nut
    // nhu lam 1 viec). Gio loc DUNG dieu kien that, doc lap voi trang_thai_hien_tai.
    whereSql += " AND pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet'";
  } else if (trangThai === "Dang tao phieu") {
    // CHOT (phan hoi 2026-08-24: "khi pxk đang chờ tiền, thì tính nó thành chờ tiền, khi cập nhật
    // tiền xong thì mới chuyển thành pxk") - loai tru PXK dang thoa dieu kien CHO_TIEN o tren khoi
    // chinh trang thai "Dang tao phieu", de 1 PXK CHI thuoc DUNG 1 trong 2 nhom tai 1 thoi diem. An
    // toan: PXK co tien CHUA chuyen xong khong bao gio roi khoi "Dang tao phieu" duoc (POST /:id/log
    // chan cung boi MISSING_CHUYEN_TIEN_APPROVED), nen dieu kien loai tru nay khong bao gio anh
    // huong cac trang_thai_hien_tai khac.
    whereSql += " AND pxk.trang_thai_hien_tai = ? AND NOT (pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet')";
    binds.push(trangThai);
  } else if (trangThai) {
    // RA SOAT CHI PHI D1 2026-08-18 (phan hoi Codex #11/#13, migration 0087+0088): doc thang cot
    // trang_thai_hien_tai (co index idx_pxk_trang_thai_nhan_hang) thay vi correlated subquery.
    whereSql += " AND pxk.trang_thai_hien_tai = ?";
    binds.push(trangThai);
  }
  if (nguoiNhanHang) {
    whereSql += " AND pxk.nguoi_nhan_hang = ?";
    binds.push(nguoiNhanHang);
  }
  if (loaiDon) {
    whereSql += " AND pxk.loai_don = ?";
    binds.push(loaiDon);
  }
  if (q) {
    whereSql += " AND (pxk.id LIKE ? OR pxk.ma_xuat_kho LIKE ? OR pxk.ma_misa LIKE ? OR pxk.ma_van_don LIKE ? OR pxk.nguoi_tao LIKE ? OR pxk.nguoi_nhan_hang LIKE ?)";
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM phieu_xuat_kho pxk WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT pxk.id, pxk.ma_xuat_kho, pxk.ma_xuat_kho_xac_nhan, pxk.ma_misa, pxk.ma_van_don, pxk.anh_bien_ban_url,
       pxk.nguoi_tao, pxk.ngay_tao, pxk.ghi_chu, pxk.nguoi_nhan_hang, pxk.loai_don,
       pxk.so_tien_can_chuyen, pxk.trang_thai_chuyen_tien,
       pxk.trang_thai_hien_tai as trang_thai,
       (SELECT COUNT(*) FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = pxk.id) as so_dong,
       EXISTS(
         SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
         WHERE pxkd.phieu_xuat_kho_id = pxk.id AND ddh.uu_tien = 1
       ) as co_don_uu_tien
     FROM phieu_xuat_kho pxk WHERE ${whereSql} ORDER BY pxk.ngay_tao DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/phieu-xuat-kho/don-hang-kha-dung - danh sach dong dat_don_hang DA "TN da duyet" VA CHUA
// gan vao PXK nao (ma_xuat_kho IS NULL) - nguon cho picker chon dong luc "Tao phieu xuat kho".
// CHOT 2026-08-14 (ra soat UX toan dien): truoc day o nay la 1 o nhap tay/dan chuoi ID tu do, nhung
// khong noi nao trong UI tung hien dat_don_hang.id cho nguoi dung xem - TN khong co cach nao biet
// ID de go vao ngoai DevTools. Thay bang picker doc tu endpoint nay.
//
// SUA (migration 0002_tra_hang_pxk.sql): "TN da duyet" la trang thai san sang gom PXK cho CA 2
// nhanh, nhung NGUON DOC KHAC nhau - mua/cong_no qua dat_don_hang_log (latestDonHangLogStatusExpr,
// LUON co dong log dau tien), tra_hang qua THANG cot trang_thai_hien_tai (dong tra_hang KHONG dam
// bao co dong log dau tien - xem giai thich bug o traHang.ts GET /).
phieuXuatKho.get("/don-hang-kha-dung", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const loaiDon = c.req.query("loai_don");
  const isTraHang = loaiDon === "tra_hang";
  let whereSql = (isTraHang ? "ddh.loai_don = 'tra_hang'" : "ddh.loai_don != 'tra_hang'") + " AND ddh.ma_xuat_kho IS NULL";
  const binds: unknown[] = [];
  if (!isTraHang && loaiDon) {
    whereSql += " AND ddh.loai_don = ?";
    binds.push(loaiDon);
  }
  whereSql += isTraHang ? " AND ddh.trang_thai_hien_tai = 'TN da duyet'" : ` AND ${latestDonHangLogStatusExpr("ddh.id")} = 'TN da duyet'`;
  const { results } = await c.env.DB.prepare(
    `SELECT ddh.id, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat, ddh.gia_chot, ddh.gia_de_xuat,
       ddh.updated_at, ddh.nguoi_nhan_hang, ddh.loai_don
     FROM dat_don_hang ddh
     WHERE ${whereSql}
     ORDER BY ddh.nguoi_nhan_hang, ddh.updated_at`,
  )
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

// POST /api/phieu-xuat-kho - { ma_xuat_kho?, ghi_chu?, dat_don_hang_ids, so_tien_can_chuyen? } - TN
// tao, gan ma_xuat_kho vao tung dong don hang lien quan (dat_don_hang.ma_xuat_kho) de tra cuu
// nguoc. so_tien_can_chuyen tuy chon ngay luc tao (co the bo trong roi dat sau qua
// POST /:id/chuyen-tien, hoac bo qua han neu PXK nay khong can KTV chuyen tien truoc).
//
// CHOT 2026-08-15 (Dot 2, muc C): "Ma don hang" (ma_xuat_kho) gio la TUY CHON luc tao - luc nay
// thuong CHUA biet vi KTV chua chuyen tien xong. Neu khong truyen, he thong tu dien PLACEHOLDER
// bang chinh id PXK (luon duy nhat, thoa UNIQUE) va danh dau ma_xuat_kho_xac_nhan = 0; TN nhap ma
// that sau qua PATCH /:id/ma-xuat-kho, luc do moi duoc gui "Cho ke toan" (xem POST /:id/log).
phieuXuatKho.post("/", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{
    ma_xuat_kho?: string; ghi_chu?: string; dat_don_hang_ids: string[]; so_tien_can_chuyen?: number;
    nguoi_nhan_hang: string; loai_don: "mua" | "cong_no" | "tra_hang";
  }>();
  if (!Array.isArray(body.dat_don_hang_ids) || body.dat_don_hang_ids.length === 0) return c.json({ error: "MISSING_DON_HANG" }, 400);
  if (!body.nguoi_nhan_hang?.trim()) return c.json({ error: "MISSING_NGUOI_NHAN_HANG" }, 400);
  if (body.loai_don !== "mua" && body.loai_don !== "cong_no" && body.loai_don !== "tra_hang") return c.json({ error: "MISSING_LOAI_DON" }, 400);
  const nguoiNhanHang = body.nguoi_nhan_hang.trim();
  const isTraHang = body.loai_don === "tra_hang";

  // Xac nhan tung dong that su hop le (da "TN da duyet" + chua gan PXK nao) truoc khi ghi - tranh
  // gan nham dong dang "Cho TN duyet"/da co ma_xuat_kho tu 1 PXK khac (vd 2 tab cung mo, hoac ID cu
  // con luu trong bo nho trinh duyet). SUA (migration 0002_tra_hang_pxk.sql): tra_hang doc thang cot
  // trang_thai_hien_tai thay vi latestDonHangLogStatusExpr - xem giai thich o GET /don-hang-kha-dung.
  const placeholders = body.dat_don_hang_ids.map(() => "?").join(", ");
  const { results: hopLe } = await c.env.DB.prepare(
    isTraHang
      ? `SELECT id FROM dat_don_hang ddh WHERE ddh.id IN (${placeholders}) AND ddh.loai_don = 'tra_hang' AND ddh.ma_xuat_kho IS NULL
           AND ddh.trang_thai_hien_tai = 'TN da duyet'`
      : `SELECT id FROM dat_don_hang ddh WHERE ddh.id IN (${placeholders}) AND ddh.loai_don != 'tra_hang' AND ddh.ma_xuat_kho IS NULL
           AND ${latestDonHangLogStatusExpr("ddh.id")} = 'TN da duyet'`,
  )
    .bind(...body.dat_don_hang_ids)
    .all<{ id: string }>();
  const hopLeIds = new Set((hopLe as { id: string }[]).map((r) => r.id));
  const khongHopLe = body.dat_don_hang_ids.filter((id) => !hopLeIds.has(id));
  if (khongHopLe.length > 0) return c.json({ error: "DON_HANG_KHONG_HOP_LE", ids: khongHopLe }, 400);

  // Chot nghiep vu 2026-08-15: 1 PXK CHI duoc gan cho 1 KTV duy nhat - kiem tra moi dong chon deu
  // thuoc dung nguoi_nhan_hang da khai bao (xem migration 0074).
  const { results: ktvRows } = await c.env.DB.prepare(
    `SELECT DISTINCT ddh.nguoi_nhan_hang FROM dat_don_hang ddh WHERE ddh.id IN (${placeholders})`,
  )
    .bind(...body.dat_don_hang_ids)
    .all<{ nguoi_nhan_hang: string | null }>();
  const ktvSet = new Set((ktvRows as { nguoi_nhan_hang: string | null }[]).map((r) => r.nguoi_nhan_hang));
  if (ktvSet.size !== 1 || !ktvSet.has(nguoiNhanHang)) return c.json({ error: "NHIEU_KTV_TRONG_1_PXK" }, 400);

  // Chot 2026-08-16 (dot 3 gop y #8): 1 PXK CHI duoc gom dong CUNG 1 loai_don (mua/cong_no) - khong
  // bao gio tron 2 loai trong 1 phieu (tra_hang da bi loai o buoc kiem tra hopLe o tren).
  const { results: loaiDonRows } = await c.env.DB.prepare(
    `SELECT DISTINCT ddh.loai_don FROM dat_don_hang ddh WHERE ddh.id IN (${placeholders})`,
  )
    .bind(...body.dat_don_hang_ids)
    .all<{ loai_don: string }>();
  const loaiDonSet = new Set((loaiDonRows as { loai_don: string }[]).map((r) => r.loai_don));
  if (loaiDonSet.size !== 1 || !loaiDonSet.has(body.loai_don)) return c.json({ error: "NHIEU_LOAI_TRONG_1_PXK" }, 400);

  const user = c.get("user");
  const now = nowVN();
  const id = await nextSequentialId(c.env.DB, "phieu_xuat_kho", "PXK", 6);
  const coChuyenTien = !!body.so_tien_can_chuyen && body.so_tien_can_chuyen > 0;
  const maXuatKhoNhap = body.ma_xuat_kho?.trim();
  const maXuatKho = maXuatKhoNhap || id;
  const maXacNhan = maXuatKhoNhap ? 1 : 0;

  const statements = [
    c.env.DB.prepare(
      "INSERT INTO phieu_xuat_kho (id, ma_xuat_kho, ma_xuat_kho_xac_nhan, nguoi_tao, ngay_tao, ghi_chu, so_tien_can_chuyen, trang_thai_chuyen_tien, nguoi_nhan_hang, loai_don, trang_thai_hien_tai) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, maXuatKho, maXacNhan, user.email, now, body.ghi_chu?.trim() || null, coChuyenTien ? body.so_tien_can_chuyen : null, coChuyenTien ? "Cho KTV chuyen" : null, nguoiNhanHang, body.loai_don, "Dang tao phieu"),
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly) VALUES (?, ?, ?, ?)").bind(
      id,
      "Dang tao phieu",
      user.email,
      now,
    ),
    ...body.dat_don_hang_ids.flatMap((donHangId) => [
      c.env.DB.prepare("INSERT INTO phieu_xuat_kho_dong (phieu_xuat_kho_id, dat_don_hang_id) VALUES (?, ?)").bind(id, donHangId),
      c.env.DB.prepare("UPDATE dat_don_hang SET ma_xuat_kho = ?, updated_at = ? WHERE id = ?").bind(maXuatKho, now, donHangId),
    ]),
  ];

  await c.env.DB.batch(statements);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ id }, 201);
});

// GET /api/phieu-xuat-kho/:id - chi tiet + dong don hang + log. Ap dung scopePxkNguoiNhanHang giong
// GET / (RA SOAT BAO MAT 2026-08-18) - tra 404 (khong phai 403) khi ngoai pham vi, tranh lo cho
// nguoi ngoai pham vi biet 1 ID PXK co that su ton tai hay khong.
phieuXuatKho.get("/:id", async (c) => {
  const id = c.req.param("id");
  const scope = scopePxkNguoiNhanHang(c);
  const whereSql = "pxk.id = ?" + (scope?.whereSql ?? "");
  const binds = [id, ...(scope?.binds ?? [])];
  const pxk = await c.env.DB.prepare(`SELECT pxk.*, pxk.trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho pxk WHERE ${whereSql}`)
    .bind(...binds)
    .first();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);

  // "Cho TN duyet" MOI NHAT tung dong dung de tinh han "Ly do cham" (xem lib/hanLyDoCham.ts) - hien
  // canh bao "qua han" ngay tren modal chi tiet PXK, truoc khi TN bam "Gui ke toan" bi chan cung o
  // POST /:id/log (xem duoi).
  const { results: donHang } = await c.env.DB.prepare(
    `SELECT ddh.*,
       (SELECT ngay_xu_ly FROM dat_don_hang_log WHERE dat_don_hang_id = ddh.id AND trang_thai = 'Cho TN duyet' ORDER BY id DESC LIMIT 1) as cho_tn_duyet_at
     FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = ?`,
  )
    .bind(id)
    .all<{ ly_do_cham: string | null; cho_tn_duyet_at: string | null }>();
  const { results: logs } = await c.env.DB.prepare("SELECT * FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = ? ORDER BY id DESC").bind(id).all();

  const now = nowVN();
  const donHangWithFlag = (donHang as { ly_do_cham: string | null; cho_tn_duyet_at: string | null }[]).map((d) => ({
    ...d,
    qua_han_ly_do_cham: !d.ly_do_cham && !!d.cho_tn_duyet_at && quaHanLyDoCham(d.cho_tn_duyet_at, now),
  }));

  return c.json({ phieuXuatKho: pxk, donHang: donHangWithFlag, logs });
});

// PATCH /api/phieu-xuat-kho/:id/ma-xuat-kho - { ma_xuat_kho } TN nhap MA DON HANG THAT sau khi KTV
// da chuyen tien xong (Dot 2, muc C) - chi khi PXK con "Dang tao phieu" (chua gui ke toan). Dong bo
// lai dat_don_hang.ma_xuat_kho cua moi dong trong phieu cho khop (tra cuu nguoc dung ma that).
phieuXuatKho.patch("/:id/ma-xuat-kho", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json<{ ma_xuat_kho: string }>();
  const maXuatKho = body.ma_xuat_kho?.trim();
  if (!maXuatKho) return c.json({ error: "MISSING_MA_XUAT_KHO" }, 400);

  // BUG THAT (phat hien 2026-08-18 tu bao cao "khong luu duoc Ma MISA"): latestStatusExpr("id") -
  // "id" khong qualify se bi SHADOW boi CHINH cot "id" cua phieu_xuat_kho_log (PK cua bang do) trong
  // subquery tuong quan, thay vi tro toi id cua bang ngoai phieu_xuat_kho - pha vo tuong quan, luon
  // tra NULL (WHERE phieu_xuat_kho_id = phieu_xuat_kho_log.id gan nhu khong bao gio dung). Cho nay
  // "may man" khong lo vi co fallback `?? "Dang tao phieu"` khop dung trang thai that cua 1 PXK MOI
  // TAO - phai qualify ro "phieu_xuat_kho.id" moi dung cho MOI truong hop (xem cung loi o ma-misa/
  // anh-bien-ban/log ben duoi, cac cho KHONG co fallback nen loi lo ro hon).
  const pxk = await c.env.DB.prepare(`SELECT ${latestStatusExpr("phieu_xuat_kho.id")} as trang_thai FROM phieu_xuat_kho WHERE id = ?`).bind(id).first<{ trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if ((pxk.trang_thai ?? "Dang tao phieu") !== "Dang tao phieu") return c.json({ error: "INVALID_STATE" }, 409);

  const trung = await c.env.DB.prepare("SELECT id FROM phieu_xuat_kho WHERE ma_xuat_kho = ? AND id != ?").bind(maXuatKho, id).first();
  if (trung) return c.json({ error: "MA_XUAT_KHO_DA_TON_TAI" }, 409);

  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE phieu_xuat_kho SET ma_xuat_kho = ?, ma_xuat_kho_xac_nhan = 1 WHERE id = ?").bind(maXuatKho, id),
    c.env.DB.prepare(
      "UPDATE dat_don_hang SET ma_xuat_kho = ?, updated_at = ? WHERE id IN (SELECT dat_don_hang_id FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?)",
    ).bind(maXuatKho, now, id),
  ]);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// PATCH /api/phieu-xuat-kho/:id/ma-misa - { ma_misa } Ke toan dien tren CHINH PXK (Dot 2, muc D,
// thay the cho dien tung dong dat_don_hang.ma_misa cu) - chi khi PXK dang "Cho ke toan".
phieuXuatKho.patch("/:id/ma-misa", async (c) => {
  if (!canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json<{ ma_misa: string }>();
  const maMisa = body.ma_misa?.trim();
  if (!maMisa) return c.json({ error: "MISSING_MA_MISA" }, 400);

  const pxk = await c.env.DB.prepare(`SELECT ${latestStatusExpr("phieu_xuat_kho.id")} as trang_thai FROM phieu_xuat_kho WHERE id = ?`).bind(id).first<{ trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (pxk.trang_thai !== "Cho ke toan") return c.json({ error: "INVALID_STATE" }, 409);

  await c.env.DB.prepare("UPDATE phieu_xuat_kho SET ma_misa = ? WHERE id = ?").bind(maMisa, id).run();
  return c.json({ ok: true });
});

// POST /api/phieu-xuat-kho/:id/anh-bien-ban - upload BINARY THO (Content-Type = mime anh) len Google
// Drive (Dot 2, muc F) - CHI nguoi_nhan_hang duoc upload (khong tinh Admin - anh bien ban phai dung
// nguoi thuc te chup), chi khi PXK dang "Dang gui KTV". Khong bat buoc goi truoc "KTV da nhan".
phieuXuatKho.post("/:id/anh-bien-ban", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const pxk = await c.env.DB.prepare(
    `SELECT nguoi_nhan_hang, ${latestStatusExpr("phieu_xuat_kho.id")} as trang_thai FROM phieu_xuat_kho WHERE id = ?`,
  )
    .bind(id)
    .first<{ nguoi_nhan_hang: string | null; trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (user.email !== pxk.nguoi_nhan_hang) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  if (pxk.trang_thai !== "Dang gui KTV") return c.json({ error: "INVALID_STATE" }, 409);

  const contentType = c.req.header("Content-Type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return c.json({ error: "INVALID_CONTENT_TYPE" }, 400);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);

  const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const filename = `bien-ban-${id}-${Date.now()}.${ext}`;
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

  await c.env.DB.prepare("UPDATE phieu_xuat_kho SET anh_bien_ban_url = ? WHERE id = ?").bind(uploaded.thumbnailUrl, id).run();
  return c.json({ ok: true, url: uploaded.thumbnailUrl });
});

// POST /api/phieu-xuat-kho/:id/bang-chung-chuyen-tien - upload BINARY THO anh bang chung chuyen
// tien len Google Drive (phan hoi 2026-08-19: "cho phép upload ảnh") - CUNG dieu kien quyen/trang
// thai voi nhanh "KTV da chuyen" o PATCH /:id/chuyen-tien phia tren (chi nguoi_nhan_hang hoac Admin,
// chi khi dang "Cho KTV chuyen"), CHI upload anh va tra URL - client tu goi PATCH /:id/chuyen-tien
// sau do de thuc su chuyen trang thai (giong 2 buoc cua "Ma xuat kho"), tranh 1 endpoint lam 2 viec.
phieuXuatKho.post("/:id/bang-chung-chuyen-tien", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const pxk = await c.env.DB.prepare("SELECT trang_thai_chuyen_tien, nguoi_nhan_hang FROM phieu_xuat_kho WHERE id = ?")
    .bind(id)
    .first<{ trang_thai_chuyen_tien: string | null; nguoi_nhan_hang: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  // FIX (bao cao 2026-08-26: "Vai trò TN thử up hình ảnh bằng chứng chuyển tiền thì bị báo lỗi") -
  // truoc day CHI KTV (nguoi_nhan_hang that su) hoac Admin upload duoc, nhung thuc te KTV thuong gui
  // anh chuyen khoan qua Zalo/tin nhan roi TN (nguoi xu ly PXK) up HO len he thong, khong tu dang
  // nhap upload. Them dieu kien canTacNghiep(c) (la_tac_nghiep hoac Admin, dung cung dinh nghia voi
  // moi noi khac trong file nay) vao truong hop duoc phep.
  if (user.email !== pxk.nguoi_nhan_hang && user.vai_tro !== "Admin" && !canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  if (pxk.trang_thai_chuyen_tien !== "Cho KTV chuyen") return c.json({ error: "INVALID_STATE" }, 409);

  const contentType = c.req.header("Content-Type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return c.json({ error: "INVALID_CONTENT_TYPE" }, 400);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);

  const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const filename = `bang-chung-chuyen-tien-${id}-${Date.now()}.${ext}`;
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
  return c.json({ ok: true, url: uploaded.thumbnailUrl });
});

// POST /api/phieu-xuat-kho/:id/chuyen-tien - { so_tien } TN (tao moi hoac dat lai) 1 khoan can KTV
// chuyen - dua PXK ve "Cho KTV chuyen", xoa bang chung/ngay cu (neu dang dat lai sau khi bi tu choi).
phieuXuatKho.post("/:id/chuyen-tien", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json<{ so_tien: number }>();
  if (!body.so_tien || body.so_tien <= 0) return c.json({ error: "MISSING_SO_TIEN" }, 400);

  const pxk = await c.env.DB.prepare("SELECT id FROM phieu_xuat_kho WHERE id = ?").bind(id).first();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);

  await c.env.DB.prepare(
    "UPDATE phieu_xuat_kho SET so_tien_can_chuyen = ?, trang_thai_chuyen_tien = 'Cho KTV chuyen', bang_chung_chuyen_tien_url = NULL, bang_chung_chuyen_tien_ghi_chu = NULL, ngay_ktv_chuyen = NULL WHERE id = ?",
  )
    .bind(body.so_tien, id)
    .run();
  return c.json({ ok: true }, 201);
});

// PATCH /api/phieu-xuat-kho/:id/chuyen-tien - { trang_thai: "KTV da chuyen" | "TN da duyet",
// bang_chung_chuyen_tien_url? } - KTV dinh bang chung (CHI DUNG nguoi_nhan_hang cua chinh PXK do,
// hoac Admin xac nhan thay - RA SOAT BAO MAT 2026-08-18 phan hoi Codex: truoc day KHONG check gi ca,
// bat ky tai khoan da duyet nao cung PATCH duoc trang thai "da chuyen tien" kem link bang chung tuy
// y cho PXK cua nguoi khac), hoac TN duyet lai bang chung da dinh.
phieuXuatKho.patch("/:id/chuyen-tien", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ trang_thai: string; bang_chung_chuyen_tien_url?: string; bang_chung_chuyen_tien_ghi_chu?: string }>();
  const pxk = await c.env.DB.prepare("SELECT trang_thai_chuyen_tien, nguoi_nhan_hang FROM phieu_xuat_kho WHERE id = ?").bind(id).first<{ trang_thai_chuyen_tien: string | null; nguoi_nhan_hang: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);

  if (body.trang_thai === "KTV da chuyen") {
    const user = c.get("user");
    // FIX (bao cao 2026-08-26, cung ly do voi POST /:id/bang-chung-chuyen-tien o duoi): cho phep TN
    // (canTacNghiep) xac nhan ho buoc nay - KTV thuong gui anh/tin nhan qua kenh khac, TN la nguoi
    // thao tac tren he thong thay vi tu KTV dang nhap.
    if (user.email !== pxk.nguoi_nhan_hang && user.vai_tro !== "Admin" && !canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    if (pxk.trang_thai_chuyen_tien !== "Cho KTV chuyen") return c.json({ error: "INVALID_STATE" }, 409);
    // migration 0091 (phan hoi 2026-08-19: "cho phép upload ảnh hoặc ghi chú thông tin chuyển
    // tiền") - bat buoc CO IT NHAT 1 trong 2 (anh that qua Drive HOAC ghi chu van ban), khong con
    // bat buoc rieng URL nhu truoc.
    if (!body.bang_chung_chuyen_tien_url?.trim() && !body.bang_chung_chuyen_tien_ghi_chu?.trim()) {
      return c.json({ error: "MISSING_BANG_CHUNG" }, 400);
    }
    await c.env.DB.prepare(
      "UPDATE phieu_xuat_kho SET trang_thai_chuyen_tien = 'KTV da chuyen', bang_chung_chuyen_tien_url = ?, bang_chung_chuyen_tien_ghi_chu = ?, ngay_ktv_chuyen = ? WHERE id = ?",
    )
      .bind(body.bang_chung_chuyen_tien_url?.trim() || null, body.bang_chung_chuyen_tien_ghi_chu?.trim() || null, nowVN(), id)
      .run();
  } else if (body.trang_thai === "TN da duyet") {
    if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    if (pxk.trang_thai_chuyen_tien !== "KTV da chuyen") return c.json({ error: "INVALID_STATE" }, 409);
    await c.env.DB.prepare("UPDATE phieu_xuat_kho SET trang_thai_chuyen_tien = 'TN da duyet' WHERE id = ?").bind(id).run();
  } else {
    return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  }

  return c.json({ ok: true });
});

// POST /api/phieu-xuat-kho/:id/log - { trang_thai, ghi_chu? } chuyen trang thai tiep theo, dung 8
// trang thai chuan (xem comment dau file):
//  - TN: "Dang tao phieu" -> "Cho ke toan" (chan boi chuyen tien neu co_tien_can_chuyen != null),
//    hoac "Ke toan huy" tu 2 buoc dau (TN tu huy don minh tao nham).
//  - Ke toan: "Cho ke toan" -> "Da chot xong don xuat" (xu ly xong AMIS) hoac "Ke toan huy".
//  - Kho: "Da chot xong don xuat" -> "Dang gui KTV" (can giao vat ly) hoac "Hang tru kho" (khong
//    can giao vat ly - vd tru thang vao ton kho KTV dang giu); tu "Dang gui KTV" -> "Kho da ket
//    thuc" (Kho tu dong thay KTV khi KTV khong phan hoi).
//  - KTV (nguoi nhan hang thuc te, khong gioi han vai tro): "Dang gui KTV" -> "KTV da nhan".
phieuXuatKho.post("/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ trang_thai: string; ghi_chu?: string; ma_van_don?: string }>();
  const pxk = await c.env.DB.prepare(
    `SELECT so_tien_can_chuyen, trang_thai_chuyen_tien, ma_xuat_kho_xac_nhan, ma_misa, nguoi_nhan_hang, loai_don, version, ${latestStatusExpr("phieu_xuat_kho.id")} as trang_thai FROM phieu_xuat_kho WHERE id = ?`,
  )
    .bind(id)
    .first<{
      so_tien_can_chuyen: number | null;
      trang_thai_chuyen_tien: string | null;
      ma_xuat_kho_xac_nhan: number;
      ma_misa: string | null;
      nguoi_nhan_hang: string | null;
      loai_don: string | null;
      version: number;
      trang_thai: string | null;
    }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (pxk.trang_thai && (TRANG_THAI_DONG as readonly string[]).includes(pxk.trang_thai)) return c.json({ error: "PHIEU_DA_DONG" }, 409);

  const user = c.get("user");
  const hienTai = pxk.trang_thai ?? "Dang tao phieu";
  const target = body.trang_thai;

  if (target === "Cho ke toan") {
    if (hienTai !== "Dang tao phieu") return c.json({ error: "INVALID_STATE" }, 409);
    if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    if (!pxk.ma_xuat_kho_xac_nhan) return c.json({ error: "MA_XUAT_KHO_CHUA_XAC_NHAN" }, 409);
    if (pxk.so_tien_can_chuyen != null && pxk.trang_thai_chuyen_tien !== "TN da duyet") return c.json({ error: "MISSING_CHUYEN_TIEN_APPROVED" }, 409);

    // CHOT 2026-08-14: chan cung neu co dong nao qua han "Ly do cham" (24h tu luc "Cho TN duyet",
    // cong T7/CN neu co - xem lib/hanLyDoCham.ts) ma van chua duoc TN dien ly_do_cham (qua PATCH
    // /don-hang/:id ben datMuaLinhKien.ts) - bat buoc TN giai trinh truoc khi day don len ke toan.
    const { results: dongTrongPxk } = await c.env.DB.prepare(
      `SELECT ddh.id, ddh.ly_do_cham,
         (SELECT ngay_xu_ly FROM dat_don_hang_log WHERE dat_don_hang_id = ddh.id AND trang_thai = 'Cho TN duyet' ORDER BY id DESC LIMIT 1) as cho_tn_duyet_at
       FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
       WHERE pxkd.phieu_xuat_kho_id = ?`,
    )
      .bind(id)
      .all<{ id: string; ly_do_cham: string | null; cho_tn_duyet_at: string | null }>();

    const now = nowVN();
    const quaHanIds = (dongTrongPxk as { id: string; ly_do_cham: string | null; cho_tn_duyet_at: string | null }[])
      .filter((d) => !d.ly_do_cham && d.cho_tn_duyet_at && quaHanLyDoCham(d.cho_tn_duyet_at, now))
      .map((d) => d.id);
    if (quaHanIds.length > 0) return c.json({ error: "THIEU_LY_DO_CHAM", ids: quaHanIds }, 409);
  } else if (target === "Ke toan huy") {
    if (hienTai !== "Dang tao phieu" && hienTai !== "Cho ke toan") return c.json({ error: "INVALID_STATE" }, 409);
    if (!canKeToan(c) && !canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    // FIX (phan hoi 2026-08-25, hang muc #19): bat buoc ghi_chu khi huy PXK - truoc day khong bat
    // buoc gi.
    if (!body.ghi_chu?.trim()) return c.json({ error: "MISSING_GHI_CHU" }, 400);
  } else if (target === "Da chot xong don xuat") {
    if (hienTai !== "Cho ke toan") return c.json({ error: "INVALID_STATE" }, 409);
    if (!canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    if (!pxk.ma_misa?.trim()) return c.json({ error: "MISSING_MA_MISA" }, 409);
  } else if (target === "Dang gui KTV" || target === "Hang tru kho") {
    if (hienTai !== "Da chot xong don xuat") return c.json({ error: "INVALID_STATE" }, 409);
    if (!canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  } else if (target === "KTV da nhan") {
    if (hienTai !== "Dang gui KTV") return c.json({ error: "INVALID_STATE" }, 409);
    // CHOT 2026-08-15 (Dot 2, muc F): bat buoc DUNG nguoi nhan hang xac nhan (hoac Admin) - truoc day
    // bat ky ai cung xac nhan duoc.
    if (user.email !== pxk.nguoi_nhan_hang && user.vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  } else if (target === "Kho da ket thuc") {
    if (hienTai !== "Dang gui KTV") return c.json({ error: "INVALID_STATE" }, 409);
    if (!canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  } else if (target === "Kho da nhan hang tra") {
    // SUA (migration 0002_tra_hang_pxk.sql): buoc CUOI rieng cho PXK tra hang (Kho xac nhan da nhan
    // hang VE kho) - thay the cho cap "Dang gui KTV"/"KTV da nhan" cua chieu xuat hang thuong, xem
    // giai thich o comment dau file.
    if (hienTai !== "Da chot xong don xuat") return c.json({ error: "INVALID_STATE" }, 409);
    if (pxk.loai_don !== "tra_hang") return c.json({ error: "INVALID_TRANG_THAI" }, 400);
    if (!canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  } else {
    return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  }

  // RA SOAT BAO MAT 2026-08-18 (phan hoi Codex #8, migration 0087) - CAS giong applyDonHangLog, xem
  // comment o do.
  const casResult = await c.env.DB.prepare(
    "UPDATE phieu_xuat_kho SET trang_thai_hien_tai = ?, version = version + 1 WHERE id = ? AND version = ?",
  )
    .bind(target, id, pxk.version)
    .run();
  if (!casResult.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);

  await c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(id, target, user.email, nowVN(), body.ghi_chu?.trim() || null)
    .run();

  // Muc E (Dot 2): Kho tach rieng "Ma van don" khoi ghi_chu chung, chi ap dung luc chuyen "Dang gui KTV".
  if (target === "Dang gui KTV" && body.ma_van_don?.trim()) {
    await c.env.DB.prepare("UPDATE phieu_xuat_kho SET ma_van_don = ? WHERE id = ?").bind(body.ma_van_don.trim(), id).run();
  }

  // Auto-claim khu vuc phu trach (muc F) - chi khi nguoi xu ly THUC SU la Kho/Ke toan (khong tinh
  // Admin/TN dung quyen "canTacNghiep" bypass o nhanh "Ke toan huy"). 1 PXK co the gom dong tu nhieu
  // phieu_dat khac nhau (nguoi nhan hang khac nhau) - auto-claim TUNG email_gs lien quan.
  if (user.la_kho || user.la_ke_toan) {
    const { results: gsRows } = await c.env.DB.prepare(
      `SELECT DISTINCT ddh.email_gs FROM phieu_xuat_kho_dong pxkd
         JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
       WHERE pxkd.phieu_xuat_kho_id = ? AND ddh.email_gs IS NOT NULL`,
    )
      .bind(id)
      .all<{ email_gs: string }>();
    c.executionCtx.waitUntil(
      Promise.all((gsRows as { email_gs: string }[]).map((r) => autoClaimGs(c.env.DB, user.email, r.email_gs))).then(() => undefined),
    );
  }

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

export default phieuXuatKho;
