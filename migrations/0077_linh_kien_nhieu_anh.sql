-- Migration 0077: ANH MINH HOA LINH KIEN TOI DA 10 ANH (chot 2026-10-13, "ảnh minh họa linh kiện cho phép up tối đa 10 ảnh").
-- anh_ds = JSON array URL Drive (<= 10, thu tu hien thi). anh_demo GIU NGUYEN = anh DAU TIEN (anh chinh) - dong bo DVBH/Sua
-- chua, anh thu nho bang/o chon LK doc cot nay nen khong doi. anh_ds NULL = chi co anh_demo (LK cu, chua can backfill) - code
-- doc qua dsAnhLk() (backend lib/anhLinhKien.ts) / anhCuaLk() (FE).
ALTER TABLE linh_kien ADD COLUMN anh_ds TEXT;

-- Moi duong ghi CHI doi anh_demo (import anh hang loat, import danh muc, lkSettings, gia88...) ma KHONG dong vao anh_ds ->
-- thay anh chinh (phan tu dau), giu cac anh phu; anh_demo ve NULL = xoa het.
CREATE TRIGGER IF NOT EXISTS trg_linh_kien_anh_ds AFTER UPDATE OF anh_demo ON linh_kien
WHEN NEW.anh_demo IS NOT OLD.anh_demo AND NEW.anh_ds IS OLD.anh_ds
BEGIN
  UPDATE linh_kien SET anh_ds = CASE
    WHEN NEW.anh_demo IS NULL THEN NULL
    WHEN OLD.anh_ds IS NULL OR json_array_length(OLD.anh_ds) = 0 THEN NULL
    ELSE json_set(OLD.anh_ds, '$[0]', NEW.anh_demo)
  END
  WHERE ma_linh_kien = NEW.ma_linh_kien;
END;
