-- Sua du lieu (2026-09-29, bug "TN chuyển đơn sai loại đề xuất sang loại TRẢ HÀNG, đơn vẫn nằm Chờ TN duyệt"):
-- truoc ban sua PATCH /dat-mua-lk/don-hang/:id, doi loai de xuat Mua/Cong no -> TRA HANG chi doi cot loai_don,
-- giu nguyen trang_thai_hien_tai cua luong mua ("Cho TN duyet"...) - trang thai khong ton tai trong luong tra hang
-- nen don ket, khong ai xu ly duoc. Dua cac don do ve buoc dau luong tra hang "Cho ke toan duyet mem" (giong code
-- moi), ghi 1 dong tra_hang_log (nguoi = nguoi da sua loai de xuat = log cuoi cua don). Chi dong CHUA vao PXK.
-- Chay lai an toan: lan 2 khong con dong nao khop.

INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
SELECT ddh.id, 'Cho ke toan duyet mem',
       (SELECT l.nguoi_xu_ly FROM dat_don_hang_log l WHERE l.dat_don_hang_id = ddh.id ORDER BY l.id DESC LIMIT 1),
       strftime('%Y-%m-%d %H:%M:%S', 'now', '+7 hours'),
       'Chuyển từ đơn đặt hàng sang luồng Trả hàng (loại đề xuất ' || ddh.loai_de_xuat || ') - sửa dữ liệu đơn bị kẹt trạng thái'
FROM dat_don_hang ddh
WHERE ddh.loai_don = 'tra_hang'
  AND ddh.trang_thai_hien_tai IN ('Cho Tram duyet', 'Cho TBP xac nhan', 'Cho TN duyet')
  AND NOT EXISTS (SELECT 1 FROM phieu_xuat_kho_dong d WHERE d.dat_don_hang_id = ddh.id)
  AND EXISTS (SELECT 1 FROM dat_don_hang_log l WHERE l.dat_don_hang_id = ddh.id);

UPDATE dat_don_hang
SET trang_thai_hien_tai = 'Cho ke toan duyet mem',
    version = version + 1,
    updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now', '+7 hours')
WHERE loai_don = 'tra_hang'
  AND trang_thai_hien_tai IN ('Cho Tram duyet', 'Cho TBP xac nhan', 'Cho TN duyet')
  AND NOT EXISTS (SELECT 1 FROM phieu_xuat_kho_dong d WHERE d.dat_don_hang_id = dat_don_hang.id)
  AND EXISTS (SELECT 1 FROM dat_don_hang_log l WHERE l.dat_don_hang_id = dat_don_hang.id);

-- Lam moi cache badge/bao cao theo version (lib/dataVersions.ts).
INSERT INTO data_versions (domain, version, updated_at) VALUES ('dat_mua_lk', 1, datetime('now'))
ON CONFLICT(domain) DO UPDATE SET version = data_versions.version + 1, updated_at = excluded.updated_at;
