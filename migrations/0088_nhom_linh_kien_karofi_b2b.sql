-- Nhom linh kien Karofi / B2B (chot 2026-10-16, yeu cau "Linh kiện sẽ có thêm phân loại bắt buộc: Linh kiện Karofi, Linh kiện
-- B2B" + "Kho sẽ có thêm lựa chọn xử lý thiếu linh kiện cho đơn Linh kiện Karofi hay Linh kiện B2B"). Truong MOI, tach rieng
-- khoi "Phan loai" (linh_kien.don_vi - Mach/May/Dinh tu... van dung cho chiet khau Dinh tu, kho May).
--   linh_kien.nhom_lk  = 'karofi' | 'b2b' (bat buoc o form tao/sua LK; duong tu dong - gia88, import khong co cot - tu doan
--                        theo quy tac ben duoi qua TRIGGER).
--   users.kho_nhom_lk  = NULL (xu ly ca 2) | 'karofi' | 'b2b' - Admin gan cho tai khoan Kho; Kho THUAN (khong TN/Ke toan/Admin -
--                        laKhoThuan) chi thay / dem viec / nhan thong bao thieu hang cua LK thuoc nhom do (lib/nhomLk.ts).
-- Quy tac tu doan (chot nguoi dung: "linh kiện karofi sẽ có format gồm 10 số liên tiếp nhau ví dụ: 3004030490 hoặc trong tên có
-- chứa Karofi, KRF, LVT, Livotec, KRH, Korihome... => sau này tôi sẽ import bổ sung nếu bị sai"): ma = dung 10 chu so HOAC ten
-- chua 1 trong cac tu tren (khong phan biet hoa/thuong) -> 'karofi', con lai 'b2b'. Ban sao JS: doanNhomLk() o
-- backend/src/lib/nhomLk.ts + frontend/src/lib/nhomLk.ts - doi quy tac phai doi ca 3 cho (+ 2 trigger duoi).
-- KHONG doi ngay_cap_nhat (khong day lai DVBH/Sua chua); cache danh muc tren may nguoi dung tu tai lai vi APP_VERSION doi.
ALTER TABLE linh_kien ADD COLUMN nhom_lk TEXT;
ALTER TABLE users ADD COLUMN kho_nhom_lk TEXT;

UPDATE linh_kien SET nhom_lk = CASE
  WHEN (length(trim(ma_linh_kien)) = 10 AND trim(ma_linh_kien) GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')
    OR instr(UPPER(COALESCE(ten_linh_kien, '')), 'KAROFI') > 0
    OR instr(UPPER(COALESCE(ten_linh_kien, '')), 'KRF') > 0
    OR instr(UPPER(COALESCE(ten_linh_kien, '')), 'LVT') > 0
    OR instr(UPPER(COALESCE(ten_linh_kien, '')), 'LIVOTEC') > 0
    OR instr(UPPER(COALESCE(ten_linh_kien, '')), 'KRH') > 0
    OR instr(UPPER(COALESCE(ten_linh_kien, '')), 'KORIHOME') > 0
  THEN 'karofi' ELSE 'b2b' END
WHERE nhom_lk IS NULL;

-- Bang gia (fetchWithHashCache) chi tai lai khi hash content_versions doi - xoa de GET /settings/linh-kien/version tinh lai
-- (khong thi trinh duyet giu ban cache cu khong co cot nhom_lk).
DELETE FROM content_versions WHERE ten_bang = 'linh_kien';

-- Moi duong INSERT khong mang nhom_lk (gia88, import Excel khong co cot, /lk-settings/danh-muc cu...) -> tu doan.
CREATE TRIGGER IF NOT EXISTS trg_linh_kien_nhom_lk_i AFTER INSERT ON linh_kien
WHEN NEW.nhom_lk IS NULL OR NEW.nhom_lk NOT IN ('karofi', 'b2b')
BEGIN
  UPDATE linh_kien SET nhom_lk = CASE
    WHEN (length(trim(NEW.ma_linh_kien)) = 10 AND trim(NEW.ma_linh_kien) GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'KAROFI') > 0
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'KRF') > 0
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'LVT') > 0
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'LIVOTEC') > 0
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'KRH') > 0
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'KORIHOME') > 0
    THEN 'karofi' ELSE 'b2b' END
  WHERE ma_linh_kien = NEW.ma_linh_kien;
END;

-- Khong cho xoa / ghi gia tri la (vd UPDATE lam rong) -> tu doan lai thay vi de NULL.
CREATE TRIGGER IF NOT EXISTS trg_linh_kien_nhom_lk_u AFTER UPDATE OF nhom_lk ON linh_kien
WHEN NEW.nhom_lk IS NULL OR NEW.nhom_lk NOT IN ('karofi', 'b2b')
BEGIN
  UPDATE linh_kien SET nhom_lk = CASE
    WHEN (length(trim(NEW.ma_linh_kien)) = 10 AND trim(NEW.ma_linh_kien) GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'KAROFI') > 0
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'KRF') > 0
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'LVT') > 0
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'LIVOTEC') > 0
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'KRH') > 0
      OR instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), 'KORIHOME') > 0
    THEN 'karofi' ELSE 'b2b' END
  WHERE ma_linh_kien = NEW.ma_linh_kien;
END;
