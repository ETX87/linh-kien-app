-- Migration 0092 (2026-10-19): NHÓM LINH KIỆN THAY THẾ CHUYỂN HẲN VÀO APP - "chuyển hẳn sang app, xây dựng chức năng thêm, bớt
-- chỉnh sửa đầy đủ cho người dùng trên app (cho người có quyền chỉnh sửa linh kiện)". Truoc day tab "Linh kiện thay thế" (Bang gia) + goi y
-- luc tao don doc Google Sheet cong khai tren trinh duyet, con bang lk_nhom_thay_the RONG -> API doi tac /v1/lk-thay-the tra [].
-- 1) Dung lai lk_nhom_thay_the_ct (dang rong): BO khoa ngoai ma_lk -> linh_kien (Sheet co 43/142 ma CHUA co trong danh muc app - giu lai
--    kem ten tu Sheet, gan nhan "Chưa có trong danh mục"; them moi tren app thi chi chon ma trong danh muc), them ten_lk / ghi_chu (ghi chu
--    THEO TUNG MA - cot "GHI CHÚ" cua Sheet) / stt (thu tu hien thi); nhom_id INTEGER + ON DELETE CASCADE.
-- 2) Nhap 1 lan 50 nhom tu Sheet (gid=1488773788, tai 2026-10-19): bo dong trung (nhom, ma); nhom Sheet dat ten = chinh ma LK goc doi thanh
--    "Thay thế cho <ma> · <ten>". Chay lai an toan: nhom trung ten da co thi bo qua.
CREATE TABLE lk_nhom_thay_the_ct_moi (
    nhom_id INTEGER NOT NULL REFERENCES lk_nhom_thay_the(id) ON DELETE CASCADE,
    ma_lk   TEXT    NOT NULL,
    ten_lk  TEXT,                         -- ten luc them vao nhom (hien khi ma chua co trong danh muc)
    ghi_chu TEXT,                         -- ghi chu rieng cua ma nay trong nhom (vd "Cần đi kèm 1 cút nối vuông")
    stt     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (nhom_id, ma_lk)
);
INSERT INTO lk_nhom_thay_the_ct_moi (nhom_id, ma_lk, ten_lk, stt)
  SELECT CAST(ct.nhom_id AS INTEGER), ct.ma_lk, lk.ten_linh_kien, 0 FROM lk_nhom_thay_the_ct ct LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ct.ma_lk;
DROP TABLE lk_nhom_thay_the_ct;
ALTER TABLE lk_nhom_thay_the_ct_moi RENAME TO lk_nhom_thay_the_ct;
CREATE INDEX idx_lk_nhom_ct_ma ON lk_nhom_thay_the_ct(ma_lk);

INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Bơm đẩy 1', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 1');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 1'), '2008010036', 'Bơm 24V 8369T KAROFI (có chân bơm)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 1'), '2008010004', 'Bơm 24V KAROFI 8369', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 1'), '2008010005', 'Bơm 24V Headon HF-8369', NULL, 3);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Bơm đẩy 2', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 2');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 2'), '2008010063', 'Bơm 24V 8369T KAROFI (không chân bơm)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 2'), '2008010041', 'Bơm 24V Headon 8369 KAROFI v2', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 2'), '2008010061', 'Bơm 24V KAROFI TF-1800', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 2'), '2008010010', 'Bơm 24V 8369T v2', NULL, 4),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 2'), '2008010052', 'Bơm 24V Headon TF-1200', NULL, 5),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 2'), '2008010054', 'Bơm 24V Headon TF-1800 (No Base/No MIT)', NULL, 6),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 2'), '2008010055', 'Bơm 24V Headon TF-1800', NULL, 7),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 2'), '2008010058', 'Bơm 24V Headon TF-1800 PLUS', NULL, 8),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 2'), '2008010068', 'Bơm 24V RD-8369 RADIAN', NULL, 9),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm đẩy 2'), '2008010050', 'Bơm 24V 8369T', NULL, 10);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Bơm Hút', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm Hút');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm Hút'), '2008010076', 'Bơm 24V G&B R1-14550', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm Hút'), '2008010031', 'Bơm 24V GMB-E-RS-121000', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm Hút'), '2008010040', 'Bơm 24V GMB-G-14500', NULL, 3);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Bơm BCN', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm BCN');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm BCN'), '2008010059', 'Bơm 36V Headon TF-3400', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm BCN'), '2008030001', 'Bơm 36V Headon 9200 MIT', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm BCN'), '2008030002', 'Bơm 24V Headon HF-9500', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bơm BCN'), '2008010060', 'Bơm 24V Headon TF-4500', NULL, 4);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Công tắc 1', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Công tắc 1');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Công tắc 1'), '2010070009', 'Công tắc KCD1-1 đỏ 0.6mm', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Công tắc 1'), '2013040116', 'Công tắc đỏ SHENTONG K10-1 0.8mm', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Công tắc 1'), '2010070010', 'Công tắc KCD1-1 đen 0.6mm', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Công tắc 1'), '2013040117', 'Công tắc đen SHENTONG K10-1 0.8mm', NULL, 4),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Công tắc 1'), '2010070007', 'Công tắc KCD1 CQC đỏ 0.6mm', NULL, 5),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Công tắc 1'), '2010070008', 'Công tắc KCD1 CQC đen 0.6mm', NULL, 6);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Van 1 chiều vuông', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Van 1 chiều vuông');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Van 1 chiều vuông'), '2011020028', 'Van 1CEZ V-4U-4 SHITONG', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Van 1 chiều vuông'), '2011020025', 'Van 1C-EZ-I 14 SHITONG', 'Cần đi kèm 1 cút nối vuông', 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Màng RO Purifilm Mỹ', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO Purifilm Mỹ');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO Purifilm Mỹ'), '2003030291', 'Màng RO EZ270T-100 PURIFILM', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO Purifilm Mỹ'), '2012010071', 'Màng RO EZ355 100 PURIFIM', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO Purifilm Mỹ'), '2012010083', 'Màng RO PURIFIM M-T1812A100', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO Purifilm Mỹ'), '2012010085', 'Màng RO EZ323 100 PURIFILM (DM)', NULL, 4),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO Purifilm Mỹ'), '2012010092', 'Màng RO EZ323 100 PURIFILM v2 (DM)', NULL, 5),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO Purifilm Mỹ'), '2003030346', 'Màng RO EZ270T-AMI (DM)', NULL, 6),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO Purifilm Mỹ'), '2012010076', 'Màng RO M-T1810T100 AMI', NULL, 7);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Màng RO MCM Hàn Quốc', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO MCM Hàn Quốc');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO MCM Hàn Quốc'), '2012010079', 'Màng RO EZ270T-2R (MCM)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO MCM Hàn Quốc'), '2003030316', 'Màng RO EZ270T-2R (MCM) (DM)', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO MCM Hàn Quốc'), '2012010091', 'Màng RO EZ 14" 100 MCM (DM)', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO MCM Hàn Quốc'), '2012010096', 'Màng RO EZ 14" 100 MCM (DM) V2', NULL, 4),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Màng RO MCM Hàn Quốc'), '2012010097', 'Màng RO EZ 13" 100 MCM (DM)', NULL, 5);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Lõi nano Karofi', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Lõi nano Karofi');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Lõi nano Karofi'), '2003070009', 'Lõi Nano K KAROFI (hộp)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Lõi nano Karofi'), '2003070008', 'Lõi Nano K xanh D KAROFI', 'Đang hết hàng', 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Cút 1044', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Cút 1044');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Cút 1044'), '2011020057', 'Cút EZ T-4M-4 ZQ (ZQ-002-B)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Cút 1044'), '2010020021', 'Cút 1044 nối nhanh (Ren 19G)', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Vòi 1', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Vòi 1');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Vòi 1'), '2013080089', 'Vòi SL-D031 KAROFI (2000310)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Vòi 1'), '2013080135', 'Vòi gạt EZ-S KAROFI', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Lõi Carbon 11'' korihome', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Lõi Carbon 11'' korihome');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Lõi Carbon 11'' korihome'), '2005020078', 'Lõi CARBON BLOCK 11" KoriHome (Q2-M9/T)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Lõi Carbon 11'' korihome'), '2005020062', 'Lõi CARBON BLOCK 11" (Q2-M9)', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Bình áp thép 3.2', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Bình áp thép 3.2');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bình áp thép 3.2'), '2013100015', 'Bình áp thép 3.2G Xanh TW', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bình áp thép 3.2'), '2013100014', 'Bình áp thép trắng RO-132 TW', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Mạch OTM', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch OTM');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch OTM'), '3004030050', 'Vi mạch OPTIMUS I2 (1000338)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch OTM'), '3004030145', 'Vi mạch OPTIMUS I2 (1004502)', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Van điện từ 24v', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Van điện từ 24v');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Van điện từ 24v'), '2007030040', 'Van điện từ 24V EZ xanh YS-DCF-J2 KSD', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Van điện từ 24v'), '2007030074', 'Van điện từ 24V/6.5W EZ đen YS-DCF', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Mạch AIO', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch AIO');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch AIO'), '3004030158', 'Vi mạch AIOTEC 4.2_9C', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch AIO'), '3004030175', 'Vi mạch AIOTEC 4.2_5C', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Mạch IRO2', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch IRO2');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch IRO2'), '3004030159', 'Vi mạch IRO 2 v3', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch IRO2'), '3004030145', 'Vi mạch OPTIMUS I2 (1004502)', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'HP 6.2', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'HP 6.2');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'HP 6.2'), '2003030340', 'Bộ lõi Karofi Smax hiệu suất cao HP 6.2', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'HP 6.2'), '2003030526', 'Bộ lõi Karofi Smax HP 6.2-PPN v2', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Mạch HC02', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch HC02');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch HC02'), '3004030046', 'Vi mạch HC02-W', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Mạch HC02'), '3004030032', 'Mạch điều khiển HC300-RO', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'HP 6.1', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'HP 6.1');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'HP 6.1'), '2003030335', 'Bộ lõi Karofi Smax hiệu suất cao HP 6.1', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'HP 6.1'), '2003030526', 'Bộ lõi Karofi Smax HP 6.2-PPN v2', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Bình lạnh 1l', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Bình lạnh 1l');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bình lạnh 1l'), '2013100072', '(Kho MB Hết hàng) Bình lạnh GS', 'Hết hàng', 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Bình lạnh 1l'), '2013100088', 'Bình lạnh 1L', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2010020187 · Cốc 10" V6 (FX9190) trắng', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020187 · Cốc 10" V6 (FX9190) trắng');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020187 · Cốc 10" V6 (FX9190) trắng'), '2010020187', 'Cốc 10" V6 (FX9190) trắng', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020187 · Cốc 10" V6 (FX9190) trắng'), '2001020031', 'Cốc 10" V6 (BF160-N5) v2 trắng', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2003010003 · Lõi ORP K KAROFI (MCPP)', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2003010003 · Lõi ORP K KAROFI (MCPP)');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2003010003 · Lõi ORP K KAROFI (MCPP)'), '2003010003', 'Lõi ORP K KAROFI (MCPP)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2003010003 · Lõi ORP K KAROFI (MCPP)'), '2003010002', 'Lõi ORP K xanh D KAROFI (DM)', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2003070052 · Lõi Nano EZ270 trắng KoriHome', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2003070052 · Lõi Nano EZ270 trắng KoriHome');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2003070052 · Lõi Nano EZ270 trắng KoriHome'), '2003070052', 'Lõi Nano EZ270 trắng KoriHome', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2003070052 · Lõi Nano EZ270 trắng KoriHome'), '2003030639', 'Lõi Nano EZ270 trắng KoriHome v2', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2003070051 · Lõi Nano EZ270 trắng KoriHome (DM)', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2003070051 · Lõi Nano EZ270 trắng KoriHome (DM)');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2003070051 · Lõi Nano EZ270 trắng KoriHome (DM)'), '2003070051', 'Lõi Nano EZ270 trắng KoriHome (DM)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2003070051 · Lõi Nano EZ270 trắng KoriHome (DM)'), '2003030644', 'Lõi Nano EZ270 trắng KoriHome v2 (DM)', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2004050005 · Lõi SEDIMENT KoriHome (EZ-U-10")', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2004050005 · Lõi SEDIMENT KoriHome (EZ-U-10")');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2004050005 · Lõi SEDIMENT KoriHome (EZ-U-10")'), '2004050005', 'Lõi SEDIMENT KoriHome (EZ-U-10")', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2004050005 · Lõi SEDIMENT KoriHome (EZ-U-10")'), '2004010430', 'Lõi SEDIMENT KoriHome (EZ-U-10") v2', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2005020033 · Lõi PRE CARBON KoriHome (EZ-U-10")', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2005020033 · Lõi PRE CARBON KoriHome (EZ-U-10")');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2005020033 · Lõi PRE CARBON KoriHome (EZ-U-10")'), '2005020033', 'Lõi PRE CARBON KoriHome (EZ-U-10")', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2005020033 · Lõi PRE CARBON KoriHome (EZ-U-10")'), '2005020210', 'Lõi PRE CARBON KoriHome (EZ-U-10") v2', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2007010003 · Van áp cao đen 1/4" JEAK', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2007010003 · Van áp cao đen 1/4" JEAK');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2007010003 · Van áp cao đen 1/4" JEAK'), '2007010003', 'Van áp cao đen 1/4" JEAK', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2007010003 · Van áp cao đen 1/4" JEAK'), '2007010002', 'Van áp cao đen 1/4" NK JEAK', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2007030051 · Van điện từ 24V đen FPD-360L83', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2007030051 · Van điện từ 24V đen FPD-360L83');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2007030051 · Van điện từ 24V đen FPD-360L83'), '2007030051', 'Van điện từ 24V đen FPD-360L83', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2007030051 · Van điện từ 24V đen FPD-360L83'), '2007030040', 'Van điện từ 24V EZ xanh YS-DCF-J2 KSD', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2008030001 · Bơm 36V Headon 9200 MIT', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2008030001 · Bơm 36V Headon 9200 MIT');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2008030001 · Bơm 36V Headon 9200 MIT'), '2008030001', 'Bơm 36V Headon 9200 MIT', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2008030001 · Bơm 36V Headon 9200 MIT'), '2008010059', 'Bơm 36V Headon TF-3400', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2008010059 · Bơm 36V Headon TF-3400', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2008010059 · Bơm 36V Headon TF-3400');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2008010059 · Bơm 36V Headon TF-3400'), '2008010059', 'Bơm 36V Headon TF-3400', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2008010059 · Bơm 36V Headon TF-3400'), '2008030001', 'Bơm 36V Headon 9200 MIT', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2009020006 · Nguồn xung 36/2 (GM365)', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2009020006 · Nguồn xung 36/2 (GM365)');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2009020006 · Nguồn xung 36/2 (GM365)'), '2009020006', 'Nguồn xung 36/2 (GM365)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2009020006 · Nguồn xung 36/2 (GM365)'), '2009010106', 'Nguồn xung 36V 2A (GM365/XL)', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)'), '2010020021', 'Cút EZ T-4M-4 (19G)', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)'), '2010020002', 'Cút EZ T-4M-4', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)'), '2010020029', 'Cút EZ T-4M-4 ORGANIC', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)'), '2010020036', 'Cút EZ T-4M-4 SC (G)', NULL, 4),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)'), '2010020044', 'Cút EZ T-4M-4 SC', NULL, 5),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)'), '2010020051', 'Cút EZ T-4M-4 ORGANIC (G)', NULL, 6),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)'), '2011020057', 'Cút EZ T-4M-4 ZQ (ZQ-002-B)', NULL, 7),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)'), '2011020197', 'Cút EZ T-4M-4 ORGANIC NSF61', NULL, 8),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)'), '2011020245', 'Cút EZ T-4M-4 (PPC0404)', NULL, 9),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020021 · Cút EZ T-4M-4 (19G)'), '2011020253', 'Cút EZ T-4M-4 (G/PPCG0404)', NULL, 10);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2010020004 · Cút EZ V-4M-4', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020004 · Cút EZ V-4M-4');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020004 · Cút EZ V-4M-4'), '2010020004', 'Cút EZ V-4M-4', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020004 · Cút EZ V-4M-4'), '2010020031', 'Cút EZ V-4M-4 ORGANIC', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020004 · Cút EZ V-4M-4'), '2010020038', 'Cút EZ V-4M-4 SC (G)', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020004 · Cút EZ V-4M-4'), '2010020046', 'Cút EZ V-4M-4 SC', NULL, 4),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020004 · Cút EZ V-4M-4'), '2010020053', 'Cút EZ V-4M-4 ORGANIC (G)', NULL, 5),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020004 · Cút EZ V-4M-4'), '2010020058', 'Cút EZ V-4M-4 SC (GX)', NULL, 6),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020004 · Cút EZ V-4M-4'), '2011020119', 'Cút EZ V-4M-4 ST', NULL, 7),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020004 · Cút EZ V-4M-4'), '2011020193', 'Cút EZ V-4M-4 ORGANIC NSF61', NULL, 8),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020004 · Cút EZ V-4M-4'), '2011020226', 'Cút EZ V-4M-4 (ZQ-001-B)', NULL, 9),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020004 · Cút EZ V-4M-4'), '2011020250', 'Cút EZ V-4M-4 (PPLG0404)', NULL, 10);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2010020015 · Cút EZ V-4U-4 ST', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020015 · Cút EZ V-4U-4 ST');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020015 · Cút EZ V-4U-4 ST'), '2010020015', 'Cút EZ V-4U-4 ST', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020015 · Cút EZ V-4U-4 ST'), '2011020048', 'Cút EZ V-4U-4 DCC', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020015 · Cút EZ V-4U-4 ST'), '2011020053', 'Cút EZ V-4U-4 ZQ (ZQ-005-A)', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020015 · Cút EZ V-4U-4 ST'), '2011020121', 'Cút EZ V-4U-4 MCM xám (LEK1414G01)', NULL, 4),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020015 · Cút EZ V-4U-4 ST'), '2011020186', 'Cút EZ V-4U-4 ORGANIC NSF61', NULL, 5),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020015 · Cút EZ V-4U-4 ST'), '2011020191', 'Cút EZ V-4U-4 DZ', NULL, 6),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020015 · Cút EZ V-4U-4 ST'), '2011020234', 'Cút EZ V-4U-4 (PPV0404)', NULL, 7);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2001020016 · Cốc 10" V6 trong', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2001020016 · Cốc 10" V6 trong');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2001020016 · Cốc 10" V6 trong'), '2001020016', 'Cốc 10" V6 trong', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2001020016 · Cốc 10" V6 trong'), '2010020272', 'Cốc 10" V6 (ABS) trong', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2010070007 · Công tắc KCD1 CQC đỏ 0.6mm', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010070007 · Công tắc KCD1 CQC đỏ 0.6mm');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010070007 · Công tắc KCD1 CQC đỏ 0.6mm'), '2010070007', 'Công tắc KCD1 CQC đỏ 0.6mm', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010070007 · Công tắc KCD1 CQC đỏ 0.6mm'), '2010070009', 'Công tắc KCD1-1 đỏ 0.6mm', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2010070008 · Công tắc KCD1 CQC đen 0.6mm', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010070008 · Công tắc KCD1 CQC đen 0.6mm');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010070008 · Công tắc KCD1 CQC đen 0.6mm'), '2010070008', 'Công tắc KCD1 CQC đen 0.6mm', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010070008 · Công tắc KCD1 CQC đen 0.6mm'), '2010070010', 'Công tắc KCD1-1 đen 0.6mm', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2011020023 · Van 1C-EZ-I 1/4" ORGANIC', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020023 · Van 1C-EZ-I 1/4" ORGANIC');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020023 · Van 1C-EZ-I 1/4" ORGANIC'), '2011020023', 'Van 1C-EZ-I 1/4" ORGANIC', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020023 · Van 1C-EZ-I 1/4" ORGANIC'), '2011020004', 'Van 1CEZ T-4U-4 NRT trắng', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020023 · Van 1C-EZ-I 1/4" ORGANIC'), '2011020025', 'Van 1C-EZ-I 14 SHITONG', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020023 · Van 1C-EZ-I 1/4" ORGANIC'), '2011020029', 'Van 1CEZ T-4U-4 CNKB', NULL, 4),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020023 · Van 1C-EZ-I 1/4" ORGANIC'), '2011020267', 'Van 1CEZ T-4U-4 ESHIONG', NULL, 5),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020023 · Van 1C-EZ-I 1/4" ORGANIC'), '2011020285', 'Van 1CEZ T-4U-4 DNT', NULL, 6),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020023 · Van 1C-EZ-I 1/4" ORGANIC'), '2011020304', 'Van 1CEZ T-4U-4 ZQ', NULL, 7);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2010020012 · Cút EZ T-6BU-6 trắng', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020012 · Cút EZ T-6BU-6 trắng');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020012 · Cút EZ T-6BU-6 trắng'), '2010020012', 'Cút EZ T-6BU-6 trắng', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020012 · Cút EZ T-6BU-6 trắng'), '2011020037', 'Cút EZ T-6BU-6 ZQ', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020012 · Cút EZ T-6BU-6 trắng'), '2011020188', 'Cút EZ T-6BU-6 ORGANIC NSF61', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020012 · Cút EZ T-6BU-6 trắng'), '2011020243', 'Cút EZ T-6BU-6 (PPM0606)', NULL, 4);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2010020010 · Cút EZ T-4BU-4 trắng ST', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020010 · Cút EZ T-4BU-4 trắng ST');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020010 · Cút EZ T-4BU-4 trắng ST'), '2010020010', 'Cút EZ T-4BU-4 trắng ST', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020010 · Cút EZ T-4BU-4 trắng ST'), '2011020038', 'Cút EZ T-4BU-4 ZQ', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020010 · Cút EZ T-4BU-4 trắng ST'), '2011020189', 'Cút EZ T-4BU-4 ORGANIC NSF61', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020010 · Cút EZ T-4BU-4 trắng ST'), '2011020242', 'Cút EZ T-4BU-4 (PPM0404)', NULL, 4),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020010 · Cút EZ T-4BU-4 trắng ST'), '2011020286', 'Cút EZ T-4BU-4 trắng (DZ)', NULL, 5),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020010 · Cút EZ T-4BU-4 trắng ST'), '2011020290', 'Cút EZ T-4BU-4 DNT', NULL, 6);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2010020020 · Cút EZ V-4F-4 ST', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020020 · Cút EZ V-4F-4 ST');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020020 · Cút EZ V-4F-4 ST'), '2010020020', 'Cút EZ V-4F-4 ST', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020020 · Cút EZ V-4F-4 ST'), '2011020056', 'Cút EZ V-4F-4 ZQ (ZQ-015-B)', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2010020020 · Cút EZ V-4F-4 ST'), '2011020247', 'Cút EZ V-4F-4 (PPLF0404)', NULL, 3);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2011020028 · Van 1CEZ V-4U-4 SHITONG', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020028 · Van 1CEZ V-4U-4 SHITONG');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020028 · Van 1CEZ V-4U-4 SHITONG'), '2011020028', 'Van 1CEZ V-4U-4 SHITONG', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020028 · Van 1CEZ V-4U-4 SHITONG'), '2011020224', 'Van 1CEZ V-4U-4 ESHIONG', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2011020028 · Van 1CEZ V-4U-4 SHITONG'), '2011020298', 'Van 1CEZ V-4U-4 ZQ', NULL, 3);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2013050083 · Van bình áp EZ BV1C 1/4 DE KANG', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2013050083 · Van bình áp EZ BV1C 1/4 DE KANG');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2013050083 · Van bình áp EZ BV1C 1/4 DE KANG'), '2013050083', 'Van bình áp EZ BV1C 1/4 DE KANG', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2013050083 · Van bình áp EZ BV1C 1/4 DE KANG'), '2013050030', 'Van bình áp EZ BV1C 1/4 Eshiong', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2013050083 · Van bình áp EZ BV1C 1/4 DE KANG'), '2013050084', 'Van bình áp EZ BV1C 1/4 INFIMI', NULL, 3),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2013050083 · Van bình áp EZ BV1C 1/4 DE KANG'), '2013050109', 'Van bình áp EZ BV1C 1/4 Landun', NULL, 4);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2017020067 · Ống silicone D8', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2017020067 · Ống silicone D8');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2017020067 · Ống silicone D8'), '2017020067', 'Ống silicone D8', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2017020067 · Ống silicone D8'), '2017020119', 'Ống Silicone D8xd5 (VRC)', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 3004010070 · Dây đo TDS 1.3 NK', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 3004010070 · Dây đo TDS 1.3 NK');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 3004010070 · Dây đo TDS 1.3 NK'), '3004010070', 'Dây đo TDS 1.3 NK', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 3004010070 · Dây đo TDS 1.3 NK'), '3004010072', 'Dây đo TDS v2 1.3', NULL, 2),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 3004010070 · Dây đo TDS 1.3 NK'), '3004010154', 'Dây đo TDS v2 1.3 (dẹt)', NULL, 3);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 4006010992 · Thùng carton KAROFI KAD-D66', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 4006010992 · Thùng carton KAROFI KAD-D66');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 4006010992 · Thùng carton KAROFI KAD-D66'), '4006010992', 'Thùng carton KAROFI KAD-D66', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 4006010992 · Thùng carton KAROFI KAD-D66'), '4006010410', 'Thùng carton tủ IQO KAROFI', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 4006010868 · Thùng carton KAROFI KAD-X39', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 4006010868 · Thùng carton KAROFI KAD-X39');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 4006010868 · Thùng carton KAROFI KAD-X39'), '4006010868', 'Thùng carton KAROFI KAD-X39', NULL, 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 4006010868 · Thùng carton KAROFI KAD-X39'), '4006010931', 'Thùng carton L611 KAROFI', NULL, 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2013040117 · Công tắc đen SHENTONG K10-1 0.8mm', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2013040117 · Công tắc đen SHENTONG K10-1 0.8mm');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2013040117 · Công tắc đen SHENTONG K10-1 0.8mm'), '2013040117', 'Công tắc đen SHENTONG K10-1 0.8mm', 'Có thể sử dụng 2010070010 nhưng chú ý cosse cắm', 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2013040117 · Công tắc đen SHENTONG K10-1 0.8mm'), '2010070010', 'Công tắc KCD1-1 đen 0.6mm', 'Có thể sử dụng 2010070010 nhưng chú ý cosse cắm', 2);
INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
  SELECT 'Thay thế cho 2013040116 · Công tắc đỏ SHENTONG K10-1 0.8mm', NULL, NULL, datetime('now', '+7 hours') WHERE NOT EXISTS (SELECT 1 FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2013040116 · Công tắc đỏ SHENTONG K10-1 0.8mm');
INSERT OR IGNORE INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2013040116 · Công tắc đỏ SHENTONG K10-1 0.8mm'), '2013040116', 'Công tắc đỏ SHENTONG K10-1 0.8mm', 'Có thể sử dụng 2010070009 nhưng chú ý cosse cắm', 1),
  ((SELECT MAX(id) FROM lk_nhom_thay_the WHERE ten_nhom = 'Thay thế cho 2013040116 · Công tắc đỏ SHENTONG K10-1 0.8mm'), '2010070009', 'Công tắc KCD1-1 đỏ 0.6mm', 'Có thể sử dụng 2010070009 nhưng chú ý cosse cắm', 2);
