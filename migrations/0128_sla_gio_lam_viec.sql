-- Migration 0128: SLA tinh theo GIO LAM VIEC (2026-11-19, v1.527).
-- Yeu cau chu he thong: "các logic quá hạn SLA trên toàn bộ hệ thống từ 24h =>8h, 48h => 16h làm việc (loại trừ 8h chủ nhật và 4h chiều thứ 7)".
-- Gio lam viec dinh nghia o backend/src/lib/gioLamViec.ts (T2-T6 08-12 + 13-17, T7 08-12, CN nghi).
-- Chi doi cac buoc dang de gia tri mac dinh cu (24 / 48); buoc Admin da tu dat so khac giu nguyen.
-- tinh_cuoi_tuan = 0 nay nghia la "tinh theo gio lam viec" (truoc: gio lich, han roi T7/CN thi day sang thu 2).
UPDATE sla_buoc SET
  so_gio = CASE so_gio WHEN 24 THEN 8 WHEN 48 THEN 16 ELSE so_gio END,
  gio_giai_trinh = CASE gio_giai_trinh WHEN 24 THEN 8 WHEN 48 THEN 16 ELSE gio_giai_trinh END,
  cap_nhat_luc = datetime('now', '+7 hours'),
  cap_nhat_boi = 'migration 0128'
WHERE so_gio IN (24, 48) OR gio_giai_trinh IN (24, 48);
