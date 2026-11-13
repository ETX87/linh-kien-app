-- Migration 0118 (2026-11-13, v1.489): Linh kien "Không kiểm tra tồn kho".
-- Yeu cau: "1 số link kiện thuộc dạng không cần kiểm tra tồn kho, ví dụ như phí dịch vụ. mặc định đặt là có hàng".
-- Co = 1 -> computeTonKhoChot (lib/tonKhoCongTy.ts) tra TON_KHONG_KIEM (coi nhu luon du) -> tao don / doi loai / xet lai deu tu duyet,
-- khong bao gio "Cho hang" / "Cho thanh toan" vi thieu hang; don "Cho hang" cu cua ma do duoc "Rà soát hàng về" tu xac nhan.
-- Bat/tat o Bang gia (cung nhom quyen "Cho phep gia 0d"). Cot noi bo, khong cham ngay_cap_nhat (khong day DVBH/Sua chua).
ALTER TABLE linh_kien ADD COLUMN khong_kiem_ton INTEGER NOT NULL DEFAULT 0;
ALTER TABLE linh_kien ADD COLUMN khong_kiem_ton_nguoi TEXT;
ALTER TABLE linh_kien ADD COLUMN khong_kiem_ton_luc TEXT;
