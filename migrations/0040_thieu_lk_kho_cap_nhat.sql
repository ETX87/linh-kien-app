-- Trang thai "Kho da cap nhat" cho ticket thieu LK (2026-09-28): sau "Kho da tiep nhan", Kho cap nhat lai thong tin
-- (ngay du kien co hang + ghi chu), cap nhat duoc nhieu lan, moi lan 1 dong thieu_lk_log. Trang thai chi nam trong
-- log (khong co cot rieng) nen KHONG can doi du lieu cu.
-- "Ngay hang ve thuc te" = ngay (gio VN) Kho bam "Hàng đã về" - server tu dien (routes/datMuaLinhKien.ts applyThieuLkLog).
ALTER TABLE thieu_lk ADD COLUMN ngay_hang_ve_thuc_te TEXT;
