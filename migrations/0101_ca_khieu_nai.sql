-- Ca KHIEU NAI (chot 2026-10-28, v1.411 - "Thêm 1 box tích ca khiếu nại cho GS, Kho, TN, KT có thể tích cho 1 đơn bất kỳ ... ca sẽ có 1 màu đỏ
-- nhạt cho các UI giao diện để cảnh báo đây là đơn quan trọng"). Cung la muc uu tien CAO NHAT khi he thong tu xac nhan hang ve cho don thieu
-- hang (lib/tuDongHangVe.ts): khieu nai > ton lau > (cung ngay tao) don uu tien.
ALTER TABLE dat_don_hang ADD COLUMN khieu_nai INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dat_don_hang ADD COLUMN khieu_nai_luc TEXT;
ALTER TABLE dat_don_hang ADD COLUMN khieu_nai_boi TEXT;
ALTER TABLE dat_don_hang ADD COLUMN khieu_nai_ghi_chu TEXT;
CREATE INDEX IF NOT EXISTS idx_ddh_khieu_nai ON dat_don_hang(khieu_nai) WHERE khieu_nai = 1;
