-- v1.572 (26/11/2026): canh bao "EO báo đã về" - cron dongBoNgayEo (lib/dongBoNgayEo.ts) ghi JSON {po, sl_ve, sl_dat, ngay_ve} khi moi dong EO
-- khop ticket da ket thuc va co hang ve, NULL khi khong con dung. Ticket da dong thi FE / bo loc bo qua.
ALTER TABLE thieu_lk ADD COLUMN eo_ve_du TEXT;
ALTER TABLE thieu_hang_bh ADD COLUMN eo_ve_du TEXT;
