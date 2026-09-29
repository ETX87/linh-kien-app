-- Tu dong tao KTV + duyet tai khoan tu ETX nhan su (chot 2026-09-29, xem backend/src/lib/etxTuDongKtv.ts) - luu so
-- lieu lan dong bo gan nhat de trang "ETX nhân sự" hien: bao nhieu KTV duoc tu tao, bao nhieu tai khoan "Cho duyet"
-- duoc tu duyet.
ALTER TABLE etx_nhan_su_sync_state ADD COLUMN ktv_tu_tao INTEGER NOT NULL DEFAULT 0;
ALTER TABLE etx_nhan_su_sync_state ADD COLUMN tk_tu_duyet INTEGER NOT NULL DEFAULT 0;
