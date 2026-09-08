-- Luong C moi (chot 08/09/2026, xem Artifact "Ma tran luong Kho van"): don "Tra hang" (KTV de
-- xuat, dat_don_hang.loai_don='tra_hang') gio gui vat ly 1 thung ve kho NGAY khi ke toan duyet
-- mem (som hon truoc day - truoc day hang chi thuc su ve kho khi TN tao PXK that O CUOI luong).
-- ma_thung_tra la ma thung vat ly (vd "TRA-000001"), sinh 1 lan duy nhat luc do, KHAC ma_xuat_kho
-- (do la ma PXK tao sau, chi con la thu tuc ke toan/MISA, khong con kich hoat lai luong "cho
-- nhan" trong khovan nua - xem guard moi trong phieuXuatKho.ts).
ALTER TABLE dat_don_hang ADD COLUMN ma_thung_tra TEXT;
CREATE UNIQUE INDEX idx_ddh_ma_thung_tra ON dat_don_hang(ma_thung_tra) WHERE ma_thung_tra IS NOT NULL;

INSERT INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES ('tra_hang_box', 0);
