-- Migration 0003: anh tra hang (phan hoi 2026-08-24) - 2 yeu cau:
--   1) Bat buoc anh linh kien can tra (toi da 3) luc TAO don tra hang.
--   2) Bat buoc anh bang chung (toi da 3) khi QC TU CHOI don tra hang (chi rieng buoc QC, khong ap
--      dung 3 buoc con lai cua luong nay - chot voi nguoi dung).
-- Dung OAuth uy quyen tai khoan Google THAT (uploadPublicImage(), xem lib/googleDrive.ts) - CUNG co
-- che voi anh minh hoa linh kien (Danh muc linh kien), KHONG dung Service Account (chu he thong chi
-- co tai khoan Gmail ca nhan, khong tra phi Google Workspace nen SA khong co storage quota). Khac
-- PXK anh_bien_ban_url o cho co THE CO NHIEU anh (toi da 3) cho 1 "loai" tren 1 dong, nen tach bang
-- con thay vi cot TEXT don nhu phieu_xuat_kho.
--
-- KHONG co co che tu dong xoa anh (chot voi nguoi dung: "lưu trên drive thì không cần xóa") - anh
-- luu vinh vien tren Drive cua tai khoan da ket noi, giong het chinh sach cua anh minh hoa linh kien.
CREATE TABLE tra_hang_anh (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_don_hang_id TEXT NOT NULL REFERENCES dat_don_hang(id),
    loai            TEXT NOT NULL CHECK (loai IN ('tao_moi', 'qc_tu_choi')),
    drive_file_id   TEXT NOT NULL,
    url             TEXT NOT NULL,
    nguoi_upload    TEXT NOT NULL REFERENCES users(email),
    ngay_upload     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tha_don_loai ON tra_hang_anh(dat_don_hang_id, loai);
