-- 0124 (2026-11-17, v1.516): XOA HAN du lieu tinh nang "Hoi dap" (chu he thong: "xóa bỏ luôn tính năng hỏi đáp" -> "Xoá 3 bảng").
-- Ma nguon da go o commit v1.516. Truoc khi xoa (production): hoi_dap 22 dong, hoi_dap_tin 93, huong_dan 85.
-- Moc khoi phuc D1 Time Travel truoc khi chay (giu 30 ngay):
--   wrangler d1 time-travel restore dat-mua-linh-kien-db --bookmark=00001ae8-00001aff-00005126-28d6f37e80a02ddc39f291f7121cd32f
-- (restore = quay CA database ve moc do, mat moi thay doi sau moc - chi dung khi that can.)

DROP TRIGGER IF EXISTS trg_md_huong_dan_i;
DROP TRIGGER IF EXISTS trg_md_huong_dan_u;
DROP TRIGGER IF EXISTS trg_md_huong_dan_d;

DROP INDEX IF EXISTS idx_hoi_dap_tin_ticket;
DROP INDEX IF EXISTS idx_hoi_dap_nguoi_hoi;
DROP INDEX IF EXISTS idx_hoi_dap_trang_thai;
DROP INDEX IF EXISTS idx_huong_dan_bat;

-- hoi_dap_tin tham chieu hoi_dap -> xoa truoc.
DROP TABLE IF EXISTS hoi_dap_tin;
DROP TABLE IF EXISTS hoi_dap;
DROP TABLE IF EXISTS huong_dan;

DELETE FROM data_versions WHERE domain = 'md_huong_dan';
DELETE FROM id_counters WHERE ten_bang = 'hoi_dap';
