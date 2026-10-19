-- 0091 (chot 2026-10-19, v1.367): Gmail dang nhap PHU - 1 tai khoan (email chinh trong users) co the dang nhap bang nhieu
-- Gmail. KTV co 2 Gmail hay dang nhap nham -> Admin gan Gmail con lai lam Gmail phu cua tai khoan chinh. Luc OAuth callback
-- (routes/auth.ts) email Google khop email_phu -> ky phien bang email_chinh, toan he thong chi thay email chinh (don/PXK/quy/
-- cong no/thong bao deu theo email chinh, khong phai sua gi them).
-- Luu chu thuong + trim. 1 Gmail phu chi thuoc 1 tai khoan (PK); API chan Gmail phu = email chinh cua tai khoan khac / email
-- dang nhap cua ma KTV / da co du lieu don-PXK (lib/gmailPhu.ts).
CREATE TABLE IF NOT EXISTS users_gmail_phu (
  email_phu TEXT PRIMARY KEY,
  email_chinh TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  nguoi_them TEXT,
  ngay_them TEXT NOT NULL,
  ghi_chu TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_gmail_phu_chinh ON users_gmail_phu(email_chinh);
