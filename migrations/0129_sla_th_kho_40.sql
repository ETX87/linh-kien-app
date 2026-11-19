-- Migration 0129 (2026-11-19, v1.527): SLA buoc "Kho xac nhan tra hang" (th_kho) 120 gio -> 40 GIO LAM VIEC.
-- Sau 0128 con so 120 bi hieu la 120 gio lam viec (~2,7 tuan, dai hon han tu huy 10 ngay). Chu he thong chot "Đổi sang 40h" (giu ti le 1/3 nhu 24 -> 8).
UPDATE sla_buoc SET so_gio = 40, cap_nhat_luc = datetime('now', '+7 hours'), cap_nhat_boi = 'migration 0129'
WHERE ma = 'th_kho' AND so_gio = 120;
