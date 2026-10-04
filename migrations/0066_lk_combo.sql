-- Combo linh kien (chot 2026-10-04, yeu cau "cho phép tạo các combo linh kiện ... khi người dùng chọn linh kiện là combo,
-- hệ thống sẽ tự sinh ra 4 đơn hàng của bộ combo"). Combo KHONG phai linh kien: form tao don / import giu 1 dong ma combo,
-- server (lib/lkCombo.ts) tach thanh tung don LK thanh phan (SL = SL combo x SL thanh phan) - moi don tinh gia/chiet khau/
-- cong no/ton kho/MISA nhu don thuong. dat_don_hang.combo_ma chi la nhan "don sinh tu combo" de hien thi.
-- Ma combo khong trung ma LK dang bat (kiem tra o route); 10 dong "combo" cu trong linh_kien (ma = danh sach ma noi dau
-- phay, deu da tat) giu nguyen cho 4 don cu - combo moi cung ma se thang khi tao don (tach truoc khi tra linh_kien).
CREATE TABLE lk_combo (
    ma_combo        TEXT PRIMARY KEY,
    ten_combo       TEXT NOT NULL,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    ghi_chu         TEXT,
    nguoi_cap_nhat  TEXT,
    ngay_cap_nhat   TEXT NOT NULL
);
CREATE TABLE lk_combo_ct (
    ma_combo  TEXT NOT NULL REFERENCES lk_combo(ma_combo) ON DELETE CASCADE ON UPDATE CASCADE,
    ma_lk     TEXT NOT NULL REFERENCES linh_kien(ma_linh_kien),
    so_luong  INTEGER NOT NULL DEFAULT 1 CHECK (so_luong > 0),
    stt       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ma_combo, ma_lk)
);
CREATE INDEX idx_lk_combo_ct_ma_lk ON lk_combo_ct(ma_lk);

ALTER TABLE dat_don_hang ADD COLUMN combo_ma TEXT;

-- Cache tren may (lib/tinhCache.ts TINH_QUERY "lk-combo").
INSERT OR IGNORE INTO data_versions (domain, version) VALUES ('md_lk_combo', 1);
CREATE TRIGGER IF NOT EXISTS trg_md_lk_combo_i AFTER INSERT ON lk_combo BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_combo'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_lk_combo_u AFTER UPDATE ON lk_combo BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_combo'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_lk_combo_d AFTER DELETE ON lk_combo BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_combo'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_lk_combo_ct_i AFTER INSERT ON lk_combo_ct BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_combo'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_lk_combo_ct_u AFTER UPDATE ON lk_combo_ct BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_combo'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_lk_combo_ct_d AFTER DELETE ON lk_combo_ct BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_combo'; END;

-- Khoi tao: cac bo dang dung (danh sach nguoi dung gui 2026-10-04) + vi du 3030CHIP. Moi thanh phan SL 1.
-- Chi chen thanh phan co trong linh_kien (FK) - da kiem tra du 26 ma tren D1 that.
INSERT INTO lk_combo (ma_combo, ten_combo, nguoi_cap_nhat, ngay_cap_nhat) VALUES
  ('3030CHIP', 'Combo Bộ mạch 3030 Chip lạnh', 'he-thong', datetime('now', '+7 hours')),
  ('2004010185,2005010108,2004010184', 'Bộ 123 thường', 'he-thong', datetime('now', '+7 hours')),
  ('2004010025,2005010032,2005020007', 'Bộ bán công nghiệp (PP,UDF,CTO)', 'he-thong', datetime('now', '+7 hours')),
  ('2004010185,2005020052,2004010184', 'Bộ 123 SS', 'he-thong', datetime('now', '+7 hours')),
  ('2004020282,2004020146,2004020283', 'Bộ 123 Pro', 'he-thong', datetime('now', '+7 hours')),
  ('2004010185,2003030233,2004010184', 'Bộ 123 NE', 'he-thong', datetime('now', '+7 hours')),
  ('2003030126,2003050050,2003040010,2003030331', 'Bộ 5678 (t33, khoáng, nano, hồng ngoại)', 'he-thong', datetime('now', '+7 hours')),
  ('2004010025,2005010300,2005020007', 'Bộ lõi BCN Lõi PP 20'' G240,Lõi UDF 20'' Karofi,Lõi CTO 20'' trắng', 'he-thong', datetime('now', '+7 hours')),
  ('2004020151,2004020152,2005010194', 'Bộ lõi PURASTAR', 'he-thong', datetime('now', '+7 hours')),
  ('2004020297,2004020299,2004020298', 'Bộ 123 Pro V', 'he-thong', datetime('now', '+7 hours'));

INSERT INTO lk_combo_ct (ma_combo, ma_lk, so_luong, stt)
SELECT v.ma_combo, v.ma_lk, 1, v.stt FROM (
  SELECT '3030CHIP' AS ma_combo, '3004010525' AS ma_lk, 1 AS stt UNION ALL
  SELECT '3030CHIP', '3004010539', 2 UNION ALL
  SELECT '3030CHIP', '3004010545', 3 UNION ALL
  SELECT '3030CHIP', '3004030320', 4
) v WHERE EXISTS (SELECT 1 FROM linh_kien lk WHERE lk.ma_linh_kien = v.ma_lk);

-- Cac combo con lai: ma combo = danh sach ma thanh phan (tach chuoi bang json_each tren mang JSON dung tu ma).
INSERT INTO lk_combo_ct (ma_combo, ma_lk, so_luong, stt)
SELECT c.ma_combo, j.value, 1, CAST(j.key AS INTEGER) + 1
FROM lk_combo c, json_each('["' || replace(c.ma_combo, ',', '","') || '"]') j
WHERE c.ma_combo LIKE '%,%' AND EXISTS (SELECT 1 FROM linh_kien lk WHERE lk.ma_linh_kien = j.value);
