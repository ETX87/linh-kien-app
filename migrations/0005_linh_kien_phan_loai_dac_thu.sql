-- Migration 0005: "Phân loại đặc thù" cho danh muc linh kien (phan hoi 2026-08-25: "bổ sung thêm 1
-- cột 'Phân loại đặc thù' (listdown có thể thêm mới) để bổ sung rõ hơn linh kiện đặc thù gì") - dung
-- CUNG kieu "listdown tu do" nhu cot "don_vi" (Phan loai) da co san (xem comment phanLoaiOptions
-- trong DanhMucLinhKienModule.tsx: goi y qua <datalist> gom tu cac gia tri da co, KHONG phai bang
-- settings rieng) - chi la 1 cot TEXT nullable, khong doi schema nao khac. CHI co y nghia khi
-- dac_thu=1 (frontend chi hien o nhap khi da tick "Linh kien dac thu").
ALTER TABLE linh_kien ADD COLUMN phan_loai_dac_thu TEXT;
