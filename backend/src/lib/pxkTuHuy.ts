import { nowVN } from "./vnTime";
import { taiTinhPxk } from "./pxkRecalculate";
import { canBangPxk, KE_TOAN_DA_CHOT_TIEN_SQL } from "./quyKtv";

// KTV / nguoi tao TU HUY don tu duyet da tu gom vao PXK (chot nguoi dung 2026-09-28):
//   "cho phép ktv hoặc người tạo đơn tự hủy đơn của bản thân nếu đơn đó được hệ thống tự duyệt, tự đẩy vào
//    phiếu xk và chưa được kế toán xác nhận tiền về (hoặc TN tương tác vào phiếu) => nếu đơn đó là đơn duy
//    nhất của phiếu thì sẽ hủy luôn cả phiếu."
// Chot them: ca nguoi tao LAN KTV nhan hang deu huy duoc; "TN tuong tac" = MOI thao tac TAY cua van phong
// (TN/Kho/Ke toan/Admin) tren phieu (tinh lai tien TU DONG khong tinh); KTV da bao chuyen tien nhung Ke toan
// chua xac nhan van huy duoc (chi khoa khi trang_thai_chuyen_tien = 'TN da duyet' = Ke toan da duyet).
// Dau vet "van phong da thao tac": phieu_xuat_kho.van_phong_tac_dong_luc/_boi (migration 0036), ghi bang
// danhDauVanPhongTacDong() - middleware routes/phieuXuatKho.ts + PATCH /dat-mua-lk/don-hang/:id.

export function laVanPhong(user: { la_tac_nghiep?: number | boolean | null; la_kho?: number | boolean | null; la_ke_toan?: number | boolean | null; vai_tro?: string | null }): boolean {
  return !!(user.la_tac_nghiep || user.la_kho || user.la_ke_toan || user.vai_tro === "Admin");
}

export async function danhDauVanPhongTacDong(db: D1Database, pxkId: string, email: string): Promise<void> {
  await db
    .prepare(
      `UPDATE phieu_xuat_kho SET van_phong_tac_dong_luc = ?, van_phong_tac_dong_boi = ?
       WHERE id = ? AND van_phong_tac_dong_luc IS NULL`,
    )
    .bind(nowVN(), email, pxkId)
    .run();
}

/**
 * Dieu kien DON (khong gom kiem tra nguoi thao tac - la nguoi tao/nguoi nhan hang): tu duyet (dong log DAU
 * TIEN da la "TN da duyet" = POST /phieu-dat tu duyet), van "TN da duyet", nam trong PXK con "Dang tao phieu",
 * Ke toan chua duyet chuyen tien, van phong chua thao tac tay. Dung cho SELECT danh sach/chi tiet (cot
 * tu_huy_duoc) va kiem tra lai o applyDonHangLog.
 */
export const TU_HUY_DUOC_SQL = (alias: string) => `(
  ${alias}.trang_thai_hien_tai = 'TN da duyet' AND ${alias}.loai_don IN ('mua', 'cong_no')
  AND (SELECT l.trang_thai FROM dat_don_hang_log l WHERE l.dat_don_hang_id = ${alias}.id ORDER BY l.id ASC LIMIT 1) = 'TN da duyet'
  AND EXISTS (
    SELECT 1 FROM phieu_xuat_kho_dong tpd JOIN phieu_xuat_kho tp ON tp.id = tpd.phieu_xuat_kho_id
    WHERE tpd.dat_don_hang_id = ${alias}.id AND tp.trang_thai_hien_tai = 'Dang tao phieu'
      AND NOT ${KE_TOAN_DA_CHOT_TIEN_SQL("tp")} AND tp.van_phong_tac_dong_luc IS NULL
  )
)`;

/**
 * TN doi trang thai (Huy / Tu choi / Cho hang) don "TN da duyet" DA nam trong PXK (chot 2026-09-28, muc 5):
 * PXK con "Dang tao phieu" va Ke toan chua duyet chuyen tien (KTV da bao chuyen van doi duoc). Roi "TN da duyet"
 * -> don tu go khoi phieu (goDonKhoiPxk).
 */
export const TN_DOI_TRONG_PXK_SQL = (alias: string) => `(
  ${alias}.trang_thai_hien_tai = 'TN da duyet' AND ${alias}.loai_don IN ('mua', 'cong_no')
  AND EXISTS (
    SELECT 1 FROM phieu_xuat_kho_dong npd JOIN phieu_xuat_kho np ON np.id = npd.phieu_xuat_kho_id
    WHERE npd.dat_don_hang_id = ${alias}.id AND np.trang_thai_hien_tai = 'Dang tao phieu'
      AND NOT ${KE_TOAN_DA_CHOT_TIEN_SQL("np")}
  )
)`;

export async function pxkTnDoiDuoc(db: D1Database, donHangId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT pd.phieu_xuat_kho_id as pxk_id FROM dat_don_hang ddh
       JOIN phieu_xuat_kho_dong pd ON pd.dat_don_hang_id = ddh.id
       WHERE ddh.id = ? AND ${TN_DOI_TRONG_PXK_SQL("ddh")}`,
    )
    .bind(donHangId)
    .first<{ pxk_id: string }>();
  return row?.pxk_id ?? null;
}

export async function pxkDuocTuHuy(db: D1Database, donHangId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT pd.phieu_xuat_kho_id as pxk_id FROM dat_don_hang ddh
       JOIN phieu_xuat_kho_dong pd ON pd.dat_don_hang_id = ddh.id
       WHERE ddh.id = ? AND ${TU_HUY_DUOC_SQL("ddh")}`,
    )
    .bind(donHangId)
    .first<{ pxk_id: string }>();
  return row?.pxk_id ?? null;
}

/**
 * Sau khi don roi "TN da duyet" (applyDonHangLog - KTV tu huy, hoac TN huy/tu choi/cho hang): go don khoi PXK.
 * Don DUY NHAT cua phieu + `huyPhieuNeuTrong` -> huy luon phieu ("Ke toan huy" = "Đã huỷ"); `huyPhieuNeuTrong`
 * = false (TN thao tac TRONG man phieu, chot 2026-09-28) -> giu phieu trong, dong man phieu moi tu huy
 * (POST /phieu-xuat-kho/:id/huy-neu-trong). Con dong khac -> tinh lai CA phieu (giong TN bo dong).
 * `moTa` = mo ta thao tac ghi vao log PXK, vd "KTV tự hủy đơn".
 */
export async function goDonKhoiPxk(
  db: D1Database, pxkId: string, donHangId: string, email: string, moTa: string, lyDo: string, huyPhieuNeuTrong = true,
): Promise<{ huyPhieu: boolean; hoanQuy: number }> {
  const now = nowVN();
  const dem = await db.prepare("SELECT COUNT(*) as n FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?").bind(pxkId).first<{ n: number }>();
  const donRow = await db.prepare("SELECT ma_lk FROM dat_don_hang WHERE id = ?").bind(donHangId).first<{ ma_lk: string }>();
  const huyPhieu = huyPhieuNeuTrong && (dem?.n ?? 0) <= 1;
  await db.batch([
    db.prepare("DELETE FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ? AND dat_don_hang_id = ?").bind(pxkId, donHangId),
    db.prepare("UPDATE dat_don_hang SET ma_xuat_kho = NULL, loai_chiet_khau_id = NULL, loai_chiet_khau_thu_cong = 0, updated_at = ? WHERE id = ?").bind(now, donHangId),
    huyPhieu
      ? db.prepare("UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'Ke toan huy', version = version + 1 WHERE id = ? AND trang_thai_hien_tai = 'Dang tao phieu'").bind(pxkId)
      : db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
          pxkId, "Da xoa don khoi phieu", email, now, `${moTa} ${donRow?.ma_lk ?? donHangId} (${donHangId})${lyDo ? `: ${lyDo}` : ""}`,
        ),
    ...(huyPhieu
      ? [
          db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
            pxkId, "Ke toan huy", email, now, `Tự hủy phiếu — ${moTa.toLowerCase()} duy nhất của phiếu ${donHangId}${lyDo ? `: ${lyDo}` : ""}`,
          ),
        ]
      : []),
  ]);
  if (!huyPhieu) {
    await taiTinhPxk(db, pxkId, true, true, email);
    return { huyPhieu, hoanQuy: 0 };
  }
  const { hoan } = await canBangPxk(db, pxkId, email); // phieu huy -> hoan tien da tra (neu co) ve quy du
  return { huyPhieu, hoanQuy: hoan };
}

/** PXK "Dang tao phieu" khong con dong nao -> huy (dong man phieu trong - chot 2026-09-28, muc 3). Tra ve null neu
 * khong huy, nguoc lai so tien da hoan ve quy (0 neu phieu chua tra tien). */
export async function huyPxkNeuTrong(db: D1Database, pxkId: string, email: string): Promise<{ hoanQuy: number } | null> {
  const res = await db
    .prepare(
      `UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'Ke toan huy', version = version + 1
       WHERE id = ? AND trang_thai_hien_tai = 'Dang tao phieu'
         AND NOT EXISTS (SELECT 1 FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?)`,
    )
    .bind(pxkId, pxkId)
    .run();
  if (!res.meta?.changes) return null;
  await db
    .prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Ke toan huy', ?, ?, ?)")
    .bind(pxkId, email, nowVN(), "Tự hủy phiếu trống (không còn đơn nào) khi đóng màn phiếu")
    .run();
  const { hoan } = await canBangPxk(db, pxkId, email); // hoan tien da tra (neu co) ve quy du
  return { hoanQuy: hoan };
}
