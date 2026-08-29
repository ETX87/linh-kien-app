-- Migration 0012: them "Tên trên MISA" ngay canh "Mã tài khoản MISA" (phan hoi nguoi dung 2026-08-29)
-- - cung 1 kieu truong tham chieu tu do (khong FK/rang buoc gi), dung doi soat cheo voi phan mem ke
-- toan MISA. Them ca 2 ben giong het ma_misa (migration 0011): ktv_lien_he va users.
ALTER TABLE ktv_lien_he ADD COLUMN ten_misa TEXT;
ALTER TABLE users ADD COLUMN ten_misa TEXT;
