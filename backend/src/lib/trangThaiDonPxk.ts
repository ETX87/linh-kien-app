import { TRU_CONG_NO_SQL } from "./tonKhoKtv";

// 2 trang thai SUY RA tren TUNG DON tu phieu xuat kho chua don (chot 2026-09-29, phan hoi "tại danh sách đơn hàng chi
// tiết, bổ sung thêm cột trạng thái 'Phiếu xuất kho'... + 1 trạng thái chuyển tiền 'Không cần chuyển', 'Chờ thanh
// toán', 'Chờ xác nhận tiền', 'Đã thanh toán', 'Đã hủy bỏ' => dựa vào thực tế chuyển tiền trên phiếu chứa đơn, khi kế
// toán xác nhận thì 'Đã thanh toán'"). KHONG luu cot - tinh bang bieu thuc SQL (luon dung theo phieu hien tai), dung
// CHUNG cho hien thi (GET /dat-mua-lk/don-hang + /don-hang/:id) VA loc cot Excel (DON_HANG_COT_LOC) -> 1 dinh nghia.
// Tra MA (ASCII) - nhan tieng Viet o frontend (TRANG_THAI_PXK_DON_OPTIONS / THANH_TOAN_DON_OPTIONS, constants.ts).

// PXK chua don (lien ket phieu_xuat_kho_dong - huy PXK vi "lỗi" xoa lien ket, don quay ve "chua vao phieu").
const pxkCuaDon = (a: string) =>
  `(SELECT d.phieu_xuat_kho_id FROM phieu_xuat_kho_dong d WHERE d.dat_don_hang_id = ${a}.id ORDER BY d.rowid DESC LIMIT 1)`;

// "Chờ chuyển tiền" cua PXK = cung dieu kien CHO_TIEN o GET /phieu-xuat-kho (so_tien_can_chuyen co gia tri, chua
// "TN da duyet" - nhan hien thi "Kế toán đã duyệt").
export const TRANG_THAI_PXK_DON_SQL = (a: string) => `COALESCE(
  (SELECT CASE
     WHEN p.trang_thai_hien_tai = 'Dang tao phieu' AND p.so_tien_can_chuyen IS NOT NULL AND p.trang_thai_chuyen_tien = 'KTV da chuyen' THEN 'cho_xac_nhan_chuyen_tien'
     WHEN p.trang_thai_hien_tai = 'Dang tao phieu' AND p.so_tien_can_chuyen IS NOT NULL AND COALESCE(p.trang_thai_chuyen_tien, '') != 'TN da duyet' THEN 'cho_ktv_chuyen_tien'
     WHEN p.trang_thai_hien_tai = 'Dang tao phieu' THEN 'cho_gui_ke_toan'
     WHEN p.trang_thai_hien_tai = 'Cho ke toan' THEN 'cho_ke_toan_chot'
     WHEN p.trang_thai_hien_tai = 'Da chot xong don xuat' AND p.loai_don = 'tra_hang' THEN 'cho_kho_nhan_hang_tra'
     WHEN p.trang_thai_hien_tai = 'Da chot xong don xuat' THEN 'cho_kho_gui_hang'
     WHEN p.trang_thai_hien_tai = 'Dang gui KTV' THEN 'cho_ktv_xac_nhan'
     WHEN p.trang_thai_hien_tai = 'KTV da nhan' THEN 'ktv_da_nhan'
     WHEN p.trang_thai_hien_tai = 'Hang tru kho' THEN 'hang_tru_kho'
     WHEN p.trang_thai_hien_tai = 'Kho da ket thuc' THEN 'kho_da_ket_thuc'
     WHEN p.trang_thai_hien_tai = 'Kho da nhan hang tra' THEN 'kho_da_nhan_hang_tra'
     WHEN p.trang_thai_hien_tai = 'Ke toan huy' THEN 'phieu_da_huy'
     ELSE 'khac' END
   FROM phieu_xuat_kho p WHERE p.id = ${pxkCuaDon(a)}),
  CASE WHEN ${a}.trang_thai_hien_tai = 'TN da duyet' THEN 'cho_tao_phieu' END
)`;

// Chuyen tien THEO DON: don bi tu choi/huy -> da_huy_bo; don khong phai tra tien (chi Mua + TRỪ CÔNG NỢ phai chuyen tien -
// cung tap voi thuat toan tien PXK, lib/pxkRecalculate.ts) -> khong_can; CHUA vao phieu -> cho_thanh_toan (chot nguoi
// dung); trong phieu -> theo trang_thai_chuyen_tien cua phieu (Kế toán duyệt = da_thanh_toan).
export const THANH_TOAN_DON_SQL = (a: string) => `CASE
  WHEN ${a}.trang_thai_hien_tai IN ('TN tu choi', 'Tu choi', 'Da huy') THEN 'da_huy_bo'
  WHEN NOT (${a}.loai_don = 'mua' OR (${a}.loai_don = 'cong_no' AND ${TRU_CONG_NO_SQL(a)})) THEN 'khong_can'
  ELSE COALESCE(
    (SELECT CASE
       WHEN p.trang_thai_hien_tai = 'Ke toan huy' THEN 'da_huy_bo'
       WHEN p.so_tien_can_chuyen IS NULL THEN 'khong_can'
       WHEN p.trang_thai_chuyen_tien = 'TN da duyet' THEN 'da_thanh_toan'
       WHEN p.trang_thai_chuyen_tien = 'KTV da chuyen' THEN 'cho_xac_nhan'
       ELSE 'cho_thanh_toan' END
     FROM phieu_xuat_kho p WHERE p.id = ${pxkCuaDon(a)}),
    'cho_thanh_toan')
END`;
