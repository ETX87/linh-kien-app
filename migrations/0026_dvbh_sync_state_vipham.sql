-- Migration 0026: them dich "vipham" (Worker vi-pham-app, giai trinh vi pham) - CHI entity "ktv" can
-- (vi-pham-app dung danh ba KTV de khop ten KTV vi pham, khong can linh_kien/khu_vuc). Seed cap
-- (ktv, vipham) tu epoch - theo dung khuon migration 0016 da lam cho "suachua"/"khu_vuc": thieu dong
-- seed nay thi UPDATE trong dvbhSyncClient.ts syncEntityToTarget() se khong khop dong nao (0 rows
-- affected, khong loi) va con tro se khong bao gio duoc luu.
INSERT INTO dvbh_sync_state (entity, target, last_synced_at) VALUES
    ('ktv', 'vipham', '1970-01-01 00:00:00');
