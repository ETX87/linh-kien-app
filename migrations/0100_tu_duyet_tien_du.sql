-- Tien can chuyen = 0 thi khong can Ke toan duyet (chot 2026-10-27, v1.410 - "Các trường hợp tiền cần chuyển = 0 thì không cần kế toán
-- duyệt tiền"; bug PMH-001400). Tu nay canBangPxk (lib/quyKtv.ts) tu dong "Ke toan da duyet" khi phieu da du tien bang quy / tien don mang
-- theo ma KTV chua bao chuyen. Migration nay ap 1 lan cho cac phieu CU dang ket "KTV da chuyen" cung dieu kien (he thong tu dat, KTV chua
-- bao chuyen, khong anh bang chung moi, khong co don "Chờ thanh toán").
INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
SELECT p.id, 'Tru quy du', 'he-thong', datetime('now', '+7 hours'),
  'Đã thanh toán đủ từ trước — tiền cần chuyển = 0: tự xác nhận, không cần Kế toán duyệt (cập nhật quy tắc 2026-10-27)'
FROM phieu_xuat_kho p
WHERE p.trang_thai_hien_tai = 'Dang tao phieu'
  AND p.trang_thai_chuyen_tien = 'KTV da chuyen'
  AND p.ngay_ktv_chuyen IS NULL
  AND COALESCE(p.so_tien_can_chuyen, 0) > 0
  AND COALESCE(p.da_thanh_toan, 0) >= p.so_tien_can_chuyen
  AND NOT EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid(p.bang_chung_chuyen_tien_anh) THEN p.bang_chung_chuyen_tien_anh ELSE '[]' END) a
    WHERE a.value NOT IN (
      SELECT j.value FROM khoan_chuyen_tien k, json_each(CASE WHEN json_valid(k.anh) THEN k.anh ELSE '[]' END) j
      WHERE k.phieu_xuat_kho_id = p.id AND k.trang_thai = 'Da duyet'))
  AND NOT EXISTS (
    SELECT 1 FROM phieu_xuat_kho_dong d JOIN dat_don_hang dd ON dd.id = d.dat_don_hang_id
    WHERE d.phieu_xuat_kho_id = p.id AND dd.trang_thai_hien_tai = 'Cho thanh toan');

UPDATE phieu_xuat_kho AS p SET trang_thai_chuyen_tien = 'TN da duyet', ly_do_tu_choi_chuyen_tien = NULL, tu_choi_chuyen_tien_luc = NULL
WHERE p.trang_thai_hien_tai = 'Dang tao phieu'
  AND p.trang_thai_chuyen_tien = 'KTV da chuyen'
  AND p.ngay_ktv_chuyen IS NULL
  AND COALESCE(p.so_tien_can_chuyen, 0) > 0
  AND COALESCE(p.da_thanh_toan, 0) >= p.so_tien_can_chuyen
  AND NOT EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid(p.bang_chung_chuyen_tien_anh) THEN p.bang_chung_chuyen_tien_anh ELSE '[]' END) a
    WHERE a.value NOT IN (
      SELECT j.value FROM khoan_chuyen_tien k, json_each(CASE WHEN json_valid(k.anh) THEN k.anh ELSE '[]' END) j
      WHERE k.phieu_xuat_kho_id = p.id AND k.trang_thai = 'Da duyet'))
  AND NOT EXISTS (
    SELECT 1 FROM phieu_xuat_kho_dong d JOIN dat_don_hang dd ON dd.id = d.dat_don_hang_id
    WHERE d.phieu_xuat_kho_id = p.id AND dd.trang_thai_hien_tai = 'Cho thanh toan');
