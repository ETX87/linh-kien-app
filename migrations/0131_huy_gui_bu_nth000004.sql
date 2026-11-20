-- Migration 0131 (2026-11-20, v1.537): huy phieu gui bu PMH-002814 + 3 don gui bu DDH-008219/8220/8221 cua ticket NTH-000004.
-- Yeu cau chu he thong: "thực tế không cần tạo đơn xuất bù - kho gửi ngoài" -> dua ve dung nhu lua chon moi "Không tạo đơn xuất bù —
-- Kho tự gửi bù ngoài hệ thống": phieu goc PMH-002263 giu nguyen SL + tien (818.100d da tra), khong co don / phieu gui bu.
-- Tien KHONG di qua quy (khong co giao dich quy nao cua PMH-002814): tien chi nam o phieu_xuat_kho.da_thanh_toan -> tra thang ve phieu goc.
-- Chi chay khi PMH-002814 van con "Dang tao phieu", chua Ma MISA, da tra dung 818.100 va ticket van tro toi no (dieu kien G lap lai o
-- moi lenh; 2 lenh cuoi lam G sai nen chay lai migration khong lam gi).

-- 1) Log
INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
SELECT 'PMH-002263', 'Ke toan can doi nhan thieu', 'meomeo3101@gmail.com', datetime('now', '+7 hours'),
       'NTH-000004: Kho gửi bù NGOÀI hệ thống — hủy phiếu gửi bù PMH-002814 (DDH-008219, DDH-008220, DDH-008221), trả 818.100đ đã thanh toán về phiếu này, SL thực xuất DDH-006772/006773/006774 về như cũ (1 / 100 / 1)'
WHERE EXISTS (SELECT 1 FROM nhan_thieu WHERE id = 'NTH-000004' AND pxk_gui_bu_id = 'PMH-002814')
  AND EXISTS (SELECT 1 FROM phieu_xuat_kho WHERE id = 'PMH-002814' AND trang_thai_hien_tai = 'Dang tao phieu' AND da_thanh_toan = 818100 AND ma_misa IS NULL);

INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
SELECT 'PMH-002814', 'Ke toan huy', 'meomeo3101@gmail.com', datetime('now', '+7 hours'),
       'Hủy phiếu gửi bù NTH-000004: Kho gửi bù ngoài hệ thống, không cần xuất lại — 818.100đ đã thanh toán trả về phiếu gốc PMH-002263'
WHERE EXISTS (SELECT 1 FROM nhan_thieu WHERE id = 'NTH-000004' AND pxk_gui_bu_id = 'PMH-002814')
  AND EXISTS (SELECT 1 FROM phieu_xuat_kho WHERE id = 'PMH-002814' AND trang_thai_hien_tai = 'Dang tao phieu' AND da_thanh_toan = 818100 AND ma_misa IS NULL);

INSERT INTO nhan_thieu_log (nhan_thieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
SELECT 'NTH-000004', 'Da gui bu', 'meomeo3101@gmail.com', datetime('now', '+7 hours'),
       'Kho gửi bù NGOÀI hệ thống — hủy phiếu gửi bù PMH-002814 + 3 đơn gửi bù, giữ nguyên SL và tiền của phiếu PMH-002263'
WHERE EXISTS (SELECT 1 FROM nhan_thieu WHERE id = 'NTH-000004' AND pxk_gui_bu_id = 'PMH-002814')
  AND EXISTS (SELECT 1 FROM phieu_xuat_kho WHERE id = 'PMH-002814' AND trang_thai_hien_tai = 'Dang tao phieu' AND da_thanh_toan = 818100 AND ma_misa IS NULL);

INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
SELECT d.id, 'Da huy', 'meomeo3101@gmail.com', datetime('now', '+7 hours'),
       'Hủy đơn gửi bù NTH-000004: Kho gửi bù ngoài hệ thống, không cần tạo đơn xuất bù (phiếu gửi bù PMH-002814 đã hủy)'
FROM dat_don_hang d
WHERE d.id IN ('DDH-008219', 'DDH-008220', 'DDH-008221') AND d.trang_thai_hien_tai = 'TN da duyet'
  AND EXISTS (SELECT 1 FROM nhan_thieu WHERE id = 'NTH-000004' AND pxk_gui_bu_id = 'PMH-002814')
  AND EXISTS (SELECT 1 FROM phieu_xuat_kho WHERE id = 'PMH-002814' AND trang_thai_hien_tai = 'Dang tao phieu' AND da_thanh_toan = 818100 AND ma_misa IS NULL);

-- 2) Tien ve phieu goc (dang 0 / 0)
UPDATE phieu_xuat_kho SET so_tien_can_chuyen = 818100, da_thanh_toan = 818100, version = version + 1
WHERE id = 'PMH-002263' AND so_tien_can_chuyen = 0 AND da_thanh_toan = 0
  AND EXISTS (SELECT 1 FROM nhan_thieu WHERE id = 'NTH-000004' AND pxk_gui_bu_id = 'PMH-002814')
  AND EXISTS (SELECT 1 FROM phieu_xuat_kho WHERE id = 'PMH-002814' AND trang_thai_hien_tai = 'Dang tao phieu' AND da_thanh_toan = 818100 AND ma_misa IS NULL);

-- 3) SL thuc xuat don goc ve nhu cu (NULL = bang SL de xuat)
UPDATE dat_don_hang SET so_luong_thuc_xuat = NULL, version = version + 1
WHERE id IN ('DDH-006772', 'DDH-006773', 'DDH-006774') AND so_luong_thuc_xuat = 0
  AND EXISTS (SELECT 1 FROM nhan_thieu WHERE id = 'NTH-000004' AND pxk_gui_bu_id = 'PMH-002814')
  AND EXISTS (SELECT 1 FROM phieu_xuat_kho WHERE id = 'PMH-002814' AND trang_thai_hien_tai = 'Dang tao phieu' AND da_thanh_toan = 818100 AND ma_misa IS NULL);

UPDATE nhan_thieu_dong SET don_gui_bu_id = NULL, so_tien_thieu = 0
WHERE nhan_thieu_id = 'NTH-000004'
  AND EXISTS (SELECT 1 FROM nhan_thieu WHERE id = 'NTH-000004' AND pxk_gui_bu_id = 'PMH-002814')
  AND EXISTS (SELECT 1 FROM phieu_xuat_kho WHERE id = 'PMH-002814' AND trang_thai_hien_tai = 'Dang tao phieu' AND da_thanh_toan = 818100 AND ma_misa IS NULL);

-- 4) Huy 3 don gui bu (tien_da_tra = 0 -> trigger hoan quy khong chay) + go khoi phieu
UPDATE dat_don_hang SET trang_thai_hien_tai = 'Da huy', ma_xuat_kho = NULL, version = version + 1, updated_at = datetime('now', '+7 hours')
WHERE id IN ('DDH-008219', 'DDH-008220', 'DDH-008221') AND trang_thai_hien_tai = 'TN da duyet' AND tien_da_tra = 0
  AND EXISTS (SELECT 1 FROM nhan_thieu WHERE id = 'NTH-000004' AND pxk_gui_bu_id = 'PMH-002814')
  AND EXISTS (SELECT 1 FROM phieu_xuat_kho WHERE id = 'PMH-002814' AND trang_thai_hien_tai = 'Dang tao phieu' AND da_thanh_toan = 818100 AND ma_misa IS NULL);

DELETE FROM phieu_xuat_kho_dong
WHERE phieu_xuat_kho_id = 'PMH-002814'
  AND EXISTS (SELECT 1 FROM nhan_thieu WHERE id = 'NTH-000004' AND pxk_gui_bu_id = 'PMH-002814')
  AND EXISTS (SELECT 1 FROM phieu_xuat_kho WHERE id = 'PMH-002814' AND trang_thai_hien_tai = 'Dang tao phieu' AND da_thanh_toan = 818100 AND ma_misa IS NULL);

-- 5) Huy phieu gui bu (sau lenh nay G sai)
UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'Ke toan huy', so_tien_can_chuyen = 0, da_thanh_toan = 0, version = version + 1
WHERE id = 'PMH-002814' AND trang_thai_hien_tai = 'Dang tao phieu' AND da_thanh_toan = 818100 AND ma_misa IS NULL
  AND EXISTS (SELECT 1 FROM nhan_thieu WHERE id = 'NTH-000004' AND pxk_gui_bu_id = 'PMH-002814');

UPDATE nhan_thieu SET pxk_gui_bu_id = NULL, version = version + 1
WHERE id = 'NTH-000004' AND pxk_gui_bu_id = 'PMH-002814'
  AND EXISTS (SELECT 1 FROM phieu_xuat_kho WHERE id = 'PMH-002814' AND trang_thai_hien_tai = 'Ke toan huy');

UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'dat_mua_lk';
