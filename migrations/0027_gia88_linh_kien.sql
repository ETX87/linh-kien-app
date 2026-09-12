-- Migration 0027: tich hop API gia linh kien doi tac "gia88" (xem api-lk-prices_gia88.md o goc repo)
-- lam nguon chinh cap nhat danh muc linh_kien (Worker tu pull 1 lan/dem, xem lib/gia88Sync.ts). Cac
-- cot duoi day sau khi migrate se do gia88 quan ly (chi xem trong UI quan tri, xem
-- routes/settingsDatMua.ts + routes/lkSettings.ts) - nguoi dung xac nhan:
--   - gia_ban tiep tuc la "Gia NY" (khong doi ten cot, chi doi NGUON: tu tay -> tu dong tu gia88).
--   - gia_tri_cong_no tiep tuc la "Gia KTV" (giu nguyen co che PATCH rieng KHONG dung ngay_cap_nhat/
--     nguoi_cap_nhat cua migration 0017 - tranh day du sang DVBH/suachua moi dem).
--   - gia_tham_chieu XOA HAN (logic dat hang da ngung dung cot nay tu 2026-08-16, xem
--     datMuaLinhKien.ts dong ~1820 - khong con anh huong nghiep vu).
--   - 3 cot phu ghi_chu_doi_tac/thiet_bi/don_vi_tinh la du lieu THAM KHAO tu doi tac, co chu y KHONG
--     ghi de ghi_chu/don_vi hien co (don_vi dang duoc dung nhu "Phan loai" tu nhap tay, ghi_chu cung
--     dang tu nhap tay - tranh xung dot 2 nguon du lieu tren 1 cot).
--   - cam_ban: chan chon o picker tao don (xem frontend helpers.ts), KHONG chan o backend (nhat
--     quan voi cach bat_tat dang hoat dong hien nay).
ALTER TABLE linh_kien DROP COLUMN gia_tham_chieu;

ALTER TABLE linh_kien ADD COLUMN gia_du_phong REAL;
ALTER TABLE linh_kien ADD COLUMN gia_eu REAL;
ALTER TABLE linh_kien ADD COLUMN don_vi_nhap TEXT;
ALTER TABLE linh_kien ADD COLUMN nhan_hang TEXT;
ALTER TABLE linh_kien ADD COLUMN thiet_bi TEXT;
ALTER TABLE linh_kien ADD COLUMN don_vi_tinh TEXT;
ALTER TABLE linh_kien ADD COLUMN ghi_chu_doi_tac TEXT;
ALTER TABLE linh_kien ADD COLUMN cam_ban INTEGER NOT NULL DEFAULT 0;

-- Trang thai lan dong bo PULL gan nhat tu gia88 - CHIEU NGUOC voi dvbh_sync_state (bang do la con tro
-- DAY di theo (entity,target), con day la 1 dong DUY NHAT theo doi lan KEO VE gan nhat, ngu nghia
-- khac hoan toan nen KHONG tai dung chung bang. Seed san dong id=1 (bai hoc lib/idCounter.ts: bang
-- kieu con tro/trang thai PHAI tu seed, khong tu sinh).
CREATE TABLE gia88_sync_state (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  last_run_at     TEXT,
  last_status     TEXT,   -- 'ok' | 'error'
  changed_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT
);
INSERT INTO gia88_sync_state (id) VALUES (1);
