-- Migration 0015: ho tro xuat file import MISA tu Phieu xuat kho (phan hoi 2026-09-02: "PXK da tao...
-- thêm 1 nút tải danh sách... để import lên hệ thống MISA"). 2 phan:
-- 1) settings_loai_de_xuat them cot loai_file_xuat_misa (nullable, 'chuyen_kho'|'ban_hang'|'xuat_kho' -
--    validate o app layer, khong CHECK constraint vi ALTER TABLE ADD COLUMN cua SQLite khong the them
--    CHECK ma khong rebuild bang) - CHI dung khi dong dat_don_hang.loai_don='mua' (loai_don='cong_no'/
--    'tra_hang' LUON co dinh dung mau "Chuyen kho", khong doc cot nay - xac nhan nguoi dung qua
--    AskUserQuestion 2026-09-02). Null = mac dinh 'ban_hang'. Seed truoc cac dong "HO TRO..."/"TRU CONG
--    NO TG12..." hien co ve 'xuat_kho' (dung y "Xuat kho dung cho TH: ho tro 0d, ho tro KD, ho tro
--    ngoai BH..." trong yeu cau goc) - Admin tu chinh lai qua Settings neu can (xac nhan nguoi dung:
--    "thêm settings... để admin có thể chỉnh lại nếu muốn").
-- 2) app_settings them 4 khoa "Ma kho/Ten kho mac dinh" theo mien Bac/Nam (dung de dien cot "Mã kho"
--    trong file MISA, vi PXK/dat_don_hang KHONG co cot kho vat ly nao ca - xac nhan nguoi dung "nếu
--    chưa có thì tạo thêm vào settings"). Mien suy tu ktv_lien_he.khu_vuc_ma cua nguoi nhan hang (chua
--    "MB"=Bac, chua "MN"=Nam - xem lib/misaExport.ts).
ALTER TABLE settings_loai_de_xuat ADD COLUMN loai_file_xuat_misa TEXT;

UPDATE settings_loai_de_xuat
SET loai_file_xuat_misa = 'xuat_kho'
WHERE ten_option LIKE 'HỖ TRỢ%' OR ten_option LIKE 'TRỪ CÔNG NỢ TG12%';

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('misa_ma_kho_mien_bac', ''),
  ('misa_ten_kho_mien_bac', ''),
  ('misa_ma_kho_mien_nam', ''),
  ('misa_ten_kho_mien_nam', '');
