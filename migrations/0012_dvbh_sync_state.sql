-- Migration 0012: dong bo danh ba KTV/danh muc linh kien sang he DVBH goc (phan hoi 2026-08-28:
-- "khi cập nhật danh sách ktv hoặc cập nhật danh sách linh kiện, sẽ bắn API về web dvbh de cap nhat
-- bo sung du lieu moi nhat"). Con tro thoi gian dong bo gan nhat cho tung bang - dung boi cron 1h/lan
-- + nut "Đồng bộ ngay" (xem lib/dvbhSyncClient.ts) de biet "cai gi doi ke tu lan dong bo truoc" (query
-- WHERE ngay_cap_nhat > last_synced_at). Seed san 2 dong ngay trong migration - giong bai hoc da ghi
-- trong lib/idCounter.ts: bang kieu con tro/counter PHAI tu seed dong, khong tu sinh.
CREATE TABLE dvbh_sync_state (
    entity          TEXT PRIMARY KEY,   -- 'ktv' | 'linh_kien'
    last_synced_at  TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'
);
INSERT INTO dvbh_sync_state (entity) VALUES ('ktv'), ('linh_kien');
