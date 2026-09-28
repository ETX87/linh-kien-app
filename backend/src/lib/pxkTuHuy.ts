import { nowVN } from "./vnTime";
import { taiTinhPxk } from "./pxkRecalculate";

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
      AND COALESCE(tp.trang_thai_chuyen_tien, '') != 'TN da duyet' AND tp.van_phong_tac_dong_luc IS NULL
  )
)`;

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
 * Sau khi don da chuyen "Da huy" (applyDonHangLog): go don khoi PXK. Don DUY NHAT cua phieu -> huy luon phieu
 * (trang thai "Ke toan huy" = "Đã huỷ"); con dong khac -> tinh lai CA phieu (thanh phan doi, giong TN bo dong).
 */
export async function goDonTuHuyKhoiPxk(db: D1Database, pxkId: string, donHangId: string, email: string, lyDo: string): Promise<{ huyPhieu: boolean }> {
  const now = nowVN();
  const dem = await db.prepare("SELECT COUNT(*) as n FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?").bind(pxkId).first<{ n: number }>();
  const donRow = await db.prepare("SELECT ma_lk FROM dat_don_hang WHERE id = ?").bind(donHangId).first<{ ma_lk: string }>();
  const huyPhieu = (dem?.n ?? 0) <= 1;
  await db.batch([
    db.prepare("DELETE FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ? AND dat_don_hang_id = ?").bind(pxkId, donHangId),
    db.prepare("UPDATE dat_don_hang SET ma_xuat_kho = NULL, loai_chiet_khau_id = NULL, loai_chiet_khau_thu_cong = 0, updated_at = ? WHERE id = ?").bind(now, donHangId),
    huyPhieu
      ? db.prepare("UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'Ke toan huy', version = version + 1 WHERE id = ? AND trang_thai_hien_tai = 'Dang tao phieu'").bind(pxkId)
      : db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
          pxkId, "Da xoa don khoi phieu", email, now, `KTV tự hủy đơn ${donRow?.ma_lk ?? donHangId} (${donHangId}): ${lyDo}`,
        ),
    ...(huyPhieu
      ? [
          db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
            pxkId, "Ke toan huy", email, now, `Tự hủy theo đơn duy nhất của phiếu ${donHangId}: ${lyDo}`,
          ),
        ]
      : []),
  ]);
  if (!huyPhieu) await taiTinhPxk(db, pxkId, true, true, email);
  return { huyPhieu };
}
