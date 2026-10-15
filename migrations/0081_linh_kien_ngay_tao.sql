-- Migration 0081: ngay tao ma linh kien (2026-10-15, Bang gia - "thêm cột ngày tạo gần cột trạng thái mã để kiểm tra nhanh
-- mã nào tạo lâu rồi mà chưa được xác nhận"). Gio VN (+7) nhu moi cot thoi gian khac.
-- ALTER ADD COLUMN khong cho DEFAULT khong hang so -> TRIGGER AFTER INSERT tu ghi cho MOI duong tao LK (form, import, gia88,
-- /lk-settings/danh-muc); dong INSERT da mang san ngay_tao (doi ma A -> B chep ngay tao cua A, COT_CHEP) thi giu nguyen.
ALTER TABLE linh_kien ADD COLUMN ngay_tao TEXT;

-- LK cu: lay lan ghi nhat ky dau tien (uu tien 'Tao moi') - LK truoc khi co nhat ky (migration 0053) de NULL ("—").
UPDATE linh_kien SET ngay_tao = COALESCE(
  (SELECT MIN(l.thoi_gian) FROM linh_kien_log l WHERE l.ma_linh_kien = linh_kien.ma_linh_kien AND l.hanh_dong = 'Tao moi'),
  (SELECT MIN(l.thoi_gian) FROM linh_kien_log l WHERE l.ma_linh_kien = linh_kien.ma_linh_kien)
);

CREATE TRIGGER IF NOT EXISTS trg_linh_kien_ngay_tao AFTER INSERT ON linh_kien WHEN NEW.ngay_tao IS NULL
BEGIN
  UPDATE linh_kien SET ngay_tao = datetime('now', '+7 hours') WHERE ma_linh_kien = NEW.ma_linh_kien;
END;
