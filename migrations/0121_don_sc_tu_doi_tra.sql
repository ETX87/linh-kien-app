-- CÔNG NỢ SỬA CHỮA - cap linh kien tu CA 2 app (chot 2026-11-16, v1.498). Nguyen van: "Cấp lk tạo được từ cả 2 bên: thông tin thống nhất
-- đẩy hết về app linh kiện, kế toán duyệt trên app lk. app đổi trả chỉ còn bước tạo cấp lk (sửa lk, số lượng nếu cần trước khi kế toán
-- duyệt xuất kho)" + "Nếu tạo trên hệ thống nào thì khóa chỉ cho chỉnh sửa thông tin từ hệ thống đó".
-- nguon_tao = 'doitra' khi don duoc app Bao hanh doi tra tao qua POST /api/suachua-partner/don-sc (NULL = tao tren app nay);
-- nguon_tao_id = ma de xuat ben do (DX-xxxxxx). Don 'doitra' KHONG sua noi dung (ma LK / SL / ghi chu) tren app nay - sua tren app doi tra.
-- KHAC cot nguon_ngoai (don "SỬA CHỮA TẠI KHO" chi xem, migration 0116 - khoa cung bang trigger): don nay la don CONG NO SUA CHUA that,
-- di du luong ton kho / phieu / Ke toan / Kho nhu don tao tren app.
ALTER TABLE dat_don_hang ADD COLUMN nguon_tao TEXT;
ALTER TABLE dat_don_hang ADD COLUMN nguon_tao_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ddh_nguon_tao_id ON dat_don_hang(nguon_tao_id) WHERE nguon_tao_id IS NOT NULL;
