-- CÔNG NỢ SỬA CHỮA - giai doan 1 (chot 2026-11-16, v1.495). Nguyen van: "NV sửa chữa sẽ lên app linh kiện đặt 'công nợ sửa chữa' ... linh
-- kiện cần để sửa chữa cho sản phẩm, linh kiện tại kho ... Các luồng sẽ hoạt động như bình thường, có hàng thiếu hàng... => kế toán duyệt
-- xuất => kho xuất và giao hàng cho nv sửa chữa". Chot: NV dat TREN APP NAY, moi dong BAT BUOC gan 1 don bao hanh (app Bao hanh doi tra,
-- ma "DH-xxxxxx" / don vi "DH-xxxxxx-n"); tru cong no tu dong theo xu ly xac + tra kho phan thua = giai doan sau.

-- Co "NV sửa chữa" (nhan vien sua chua van phong) - loc loai de xuat (token la_nv_sua_chua) + quyen dat loai CÔNG NỢ SỬA CHỮA.
ALTER TABLE users ADD COLUMN la_nv_sua_chua INTEGER NOT NULL DEFAULT 0;
-- 2 NV sua chua dang cap linh kien qua app Bao hanh doi tra (don "SỬA CHỮA TẠI KHO", migration 0116).
UPDATE users SET la_nv_sua_chua = 1 WHERE email IN ('fotohuongthanh@gmail.com', 'nvk.joseph86@gmail.com');

-- Ma don bao hanh (app Bao hanh doi tra) cua dong don - BAT BUOC voi loai CÔNG NỢ SỬA CHỮA.
ALTER TABLE dat_don_hang ADD COLUMN bh_don_vi_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ddh_bh_don_vi ON dat_don_hang(bh_don_vi_id) WHERE bh_don_vi_id IS NOT NULL;

-- Nhom loai de xuat rieng cho NV sua chua (Admin luon thay moi loai). Mau file MISA = "CN, hỗ trợ" nhu CÔNG NỢ.
INSERT INTO settings_loai_de_xuat_nhom (ten_nhom, vai_tro_json, bat_tat) VALUES ('NV sửa chữa', '["la_nv_sua_chua"]', 1);
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, bat_tat, stt, loai_file_xuat_misa)
SELECT id, 'CÔNG NỢ SỬA CHỮA', 1, 1, 'xuat_kho' FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'NV sửa chữa' ORDER BY id DESC LIMIT 1;
