-- v1.545 (21/11/2026) - "fix loi 01/01/1900": Mua hang tung dien 01/01/1900 vao o "Ngay du kien co hang" (o bat buoc) khi chua biet
-- ngay hang ve. Chu he thong chot: "mac dinh gia tri 01/01/1900 thi de trong" + o nay nay TUY CHON. Lay luc lam: 136 ticket thieu_lk,
-- 20 ticket thieu_hang_bh; ghi chu log 137 dong thieu_lk_log, 25 thieu_hang_bh_log, 48 dat_don_hang_log, 95 thong bao.

UPDATE thieu_lk SET ngay_du_kien_co_hang = NULL WHERE ngay_du_kien_co_hang LIKE '1900-%';

UPDATE thieu_lk_log SET ghi_chu = REPLACE(ghi_chu, ' · Dự kiến có hàng 01/01/1900', '') WHERE ghi_chu LIKE '%Dự kiến có hàng 01/01/1900%';
UPDATE thieu_lk_log SET ghi_chu = REPLACE(ghi_chu, 'Dự kiến có hàng 01/01/1900', 'Chưa có ngày dự kiến') WHERE ghi_chu LIKE '%Dự kiến có hàng 01/01/1900%';
UPDATE dat_don_hang_log SET ghi_chu = REPLACE(ghi_chu, ' · Dự kiến có hàng 01/01/1900', '') WHERE ghi_chu LIKE '%Dự kiến có hàng 01/01/1900%';
UPDATE dat_don_hang_log SET ghi_chu = REPLACE(ghi_chu, 'Dự kiến có hàng 01/01/1900', 'Chưa có ngày dự kiến') WHERE ghi_chu LIKE '%Dự kiến có hàng 01/01/1900%';
UPDATE thong_bao_ktv SET noi_dung = REPLACE(noi_dung, ' · Dự kiến có hàng 01/01/1900', '') WHERE noi_dung LIKE '%Dự kiến có hàng 01/01/1900%';
UPDATE thong_bao_ktv SET noi_dung = REPLACE(noi_dung, 'Dự kiến có hàng 01/01/1900', 'Chưa có ngày dự kiến') WHERE noi_dung LIKE '%Dự kiến có hàng 01/01/1900%';

-- Thieu hang bao hanh: doi ngay_cap_nhat de app Sua chua bao hanh keo lai ban moi (con tro theo ngay_cap_nhat).
UPDATE thieu_hang_bh SET ngay_du_kien = NULL, ngay_cap_nhat = strftime('%Y-%m-%d %H:%M:%S', 'now', '+7 hours') WHERE ngay_du_kien LIKE '1900-%';
UPDATE thieu_hang_bh_log SET ghi_chu = REPLACE(ghi_chu, 'Dự kiến có hàng: 1900-01-01 | ', '') WHERE ghi_chu LIKE 'Dự kiến có hàng: 1900-01-01 | %';
UPDATE thieu_hang_bh_log SET ghi_chu = REPLACE(ghi_chu, 'Dự kiến có hàng: 1900-01-01', 'Chưa có ngày dự kiến') WHERE ghi_chu LIKE '%Dự kiến có hàng: 1900-01-01%';

UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'dat_mua_lk';
