-- Bao ve he thong (2026-10-08, danh gia bao mat):
-- 1) users.phien_ban_phien - JWT phien dang nhap mang so nay (truong "pv"); "Đăng xuất mọi thiết bị" tang so -> moi
--    phien cu tren moi may het hieu luc (loadUser so sanh). Mac dinh 0 = khop moi phien cu (khong ai bi dang xuat).
ALTER TABLE users ADD COLUMN phien_ban_phien INTEGER NOT NULL DEFAULT 0;

-- 2) Dem anh tai len theo tai khoan + ngay (gio VN) - gioi han 20 anh/ngay/tai khoan (Admin khong gioi han), xem
--    lib/anhUpload.ts. Chi giu so dem, khong luu anh.
CREATE TABLE IF NOT EXISTS anh_upload_ngay (
  email    TEXT NOT NULL,
  ngay     TEXT NOT NULL,
  so_luong INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, ngay)
);
