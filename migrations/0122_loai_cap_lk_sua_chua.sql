-- 0122 (2026-11-16, v1.508 + app Bao hanh doi tra v1.142). Nguyen van chu he thong: "Đơn của đối tác Karofi => mặc định xuất sang đơn "HỖ TRỢ
-- SỬA CHỮA 0 ĐỒNG" (nếu còn bảo hành), các đối tác khác sẽ xuất "CÔNG NỢ SỬA CHỮA". Trường hợp hết bảo hành => đề xuất dạng "MUA HÀNG SỬA CHỮA".
-- => Chỉ có đơn "CÔNG NỢ SỬA CHỮA" mới cần lên đơn trừ công nợ."
-- Chot: MUA HÀNG SỬA CHỮA = nhu MUA HÀNG thuong (gia chiet khau, NV chuyen tien). HỖ TRỢ SỬA CHỮA 0 ĐỒNG = khong tinh cong no, khong chuyen tien,
-- MISA "CN, hỗ trợ" dien giai nhu HỖ TRỢ 0 ĐỒNG. He thong tu chon 1 trong 3 loai theo don bao hanh (lib/pxkRecalculate.ts loaiDeXuatTheoDonBh).

INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, bat_tat, stt, loai_file_xuat_misa)
SELECT id, 'HỖ TRỢ SỬA CHỮA 0 ĐỒNG', 1, 2, 'xuat_kho' FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'NV sửa chữa'
  AND NOT EXISTS (SELECT 1 FROM settings_loai_de_xuat WHERE ten_option = 'HỖ TRỢ SỬA CHỮA 0 ĐỒNG') ORDER BY id DESC LIMIT 1;
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, bat_tat, stt, loai_file_xuat_misa)
SELECT id, 'MUA HÀNG SỬA CHỮA', 1, 3, 'ban_hang' FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'NV sửa chữa'
  AND NOT EXISTS (SELECT 1 FROM settings_loai_de_xuat WHERE ten_option = 'MUA HÀNG SỬA CHỮA') ORDER BY id DESC LIMIT 1;

-- HỖ TRỢ SỬA CHỮA 0 ĐỒNG khong tinh gia tri cong no (nhu HỖ TRỢ 0 ĐỒNG - migration 0082) cho MOI duong ghi.
CREATE TRIGGER IF NOT EXISTS trg_ddh_ho_tro_sc_0d_i AFTER INSERT ON dat_don_hang
WHEN NEW.loai_don = 'cong_no' AND instr(COALESCE(NEW.loai_de_xuat, ''), 'HỖ TRỢ SỬA CHỮA 0 ĐỒNG') > 0
BEGIN
  UPDATE dat_don_hang SET so_tien_cong_no = 0, danh_gia_cong_no = NULL WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_ddh_ho_tro_sc_0d_u AFTER UPDATE OF loai_de_xuat, loai_don ON dat_don_hang
WHEN NEW.loai_don = 'cong_no' AND instr(COALESCE(NEW.loai_de_xuat, ''), 'HỖ TRỢ SỬA CHỮA 0 ĐỒNG') > 0
  AND (OLD.loai_de_xuat IS NOT NEW.loai_de_xuat OR OLD.loai_don IS NOT NEW.loai_don)
BEGIN
  UPDATE dat_don_hang SET so_tien_cong_no = 0, danh_gia_cong_no = NULL WHERE id = NEW.id;
END;
