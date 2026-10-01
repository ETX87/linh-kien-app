-- Gop phan loai "Đỉnh tủ" vao "Đình tủ" (2026-10-01, phan hoi: "có 2 giá trị là Đình tủ và Đỉnh tủ nó là 1 nhưng đang bị
-- nhầm"). Chiet khau Dinh tu 15% (lib/pxkRecalculate.ts) so dung chuoi "Đình tủ" nen LK go nham dau "Đỉnh tủ" khong duoc
-- giam. Luc gop: 1 LK (3003040099), chua co don nao -> khong doi tien don/PXK nao.

UPDATE linh_kien SET don_vi = 'Đình tủ', ngay_cap_nhat = datetime('now', '+7 hours')
WHERE TRIM(don_vi) IN ('Đỉnh tủ', 'đỉnh tủ', 'Đỉnh Tủ', 'ĐỈNH TỦ', 'đình tủ', 'Đình Tủ', 'ĐÌNH TỦ', 'Dinh tu', 'dinh tu', 'Dinh Tu', 'DINH TU')
   OR (don_vi <> 'Đình tủ' AND TRIM(don_vi) = 'Đình tủ');

-- Moi duong ghi (form, chon nhanh o Bang gia, import Excel, xac nhan ma, dong bo) deu quy ve 1 gia tri.
CREATE TRIGGER IF NOT EXISTS trg_linh_kien_dinh_tu_i AFTER INSERT ON linh_kien
WHEN NEW.don_vi <> 'Đình tủ' AND TRIM(NEW.don_vi) IN ('Đình tủ', 'Đỉnh tủ', 'đỉnh tủ', 'Đỉnh Tủ', 'ĐỈNH TỦ', 'đình tủ', 'Đình Tủ', 'ĐÌNH TỦ', 'Dinh tu', 'dinh tu', 'Dinh Tu', 'DINH TU')
BEGIN UPDATE linh_kien SET don_vi = 'Đình tủ' WHERE ma_linh_kien = NEW.ma_linh_kien; END;

CREATE TRIGGER IF NOT EXISTS trg_linh_kien_dinh_tu_u AFTER UPDATE OF don_vi ON linh_kien
WHEN NEW.don_vi <> 'Đình tủ' AND TRIM(NEW.don_vi) IN ('Đình tủ', 'Đỉnh tủ', 'đỉnh tủ', 'Đỉnh Tủ', 'ĐỈNH TỦ', 'đình tủ', 'Đình Tủ', 'ĐÌNH TỦ', 'Dinh tu', 'dinh tu', 'Dinh Tu', 'DINH TU')
BEGIN UPDATE linh_kien SET don_vi = 'Đình tủ' WHERE ma_linh_kien = NEW.ma_linh_kien; END;

-- Hash noi dung danh muc LK (lib/contentHash.ts) tinh lai o lan doc ke tiep -> may nguoi dung tai lai Bang gia.
DELETE FROM content_versions WHERE ten_bang = 'linh_kien';
