-- Migration 0086 (2026-10-16): DDH-002638 tao "Cho thanh toan" vi ma cu 2013100163 het hang (kho MN2 con 0), TN sua sang 2013100515
-- (kho MN2 con 77, khong don nao giu truoc) nhung luc do PATCH sua don CHUA danh gia lai ton kho -> don ket voi canh bao thieu hang.
-- Code da sua (danhGiaLaiDonChoThanhToan, v1.351); migration chi go ket DUNG don nay (cung ket qua ham tu duyet). Chi chay khi don van
-- "Cho thanh toan" + dung ma moi. Don van nam trong phieu PMH-000906 (KTV chuyen tien nhu don mua thuong).
INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong)
SELECT id, 'TN da duyet', 'ngatran12302@gmail.com', datetime('now', '+7 hours'),
       'Tự động duyệt sau khi sửa đơn (đổi mã LK 2013100163 → 2013100515): kho công ty khu vực MN2 còn 77, đặt 3 — đủ hàng', 1
FROM dat_don_hang WHERE id = 'DDH-002638' AND trang_thai_hien_tai = 'Cho thanh toan' AND ma_lk = '2013100515';

UPDATE dat_don_hang SET trang_thai_hien_tai = 'TN da duyet', version = version + 1, updated_at = datetime('now', '+7 hours')
WHERE id = 'DDH-002638' AND trang_thai_hien_tai = 'Cho thanh toan' AND ma_lk = '2013100515';
