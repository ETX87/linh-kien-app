-- Tach "Tu dong duyet don" (he thong tu duyet luc tao don, POST /phieu-dat) khoi "TN da duyet" (nguoi duyet that)
-- trong Lich su xu ly (chot 2026-09-28). trang_thai van la 'TN da duyet' (state machine khong doi), them co tu_dong.
ALTER TABLE dat_don_hang_log ADD COLUMN tu_dong INTEGER NOT NULL DEFAULT 0;

-- Backfill: dong log DAU TIEN cua don da la 'TN da duyet' = tu dong duyet luc tao.
UPDATE dat_don_hang_log SET tu_dong = 1
WHERE trang_thai = 'TN da duyet'
  AND id = (SELECT MIN(l2.id) FROM dat_don_hang_log l2 WHERE l2.dat_don_hang_id = dat_don_hang_log.dat_don_hang_id);
