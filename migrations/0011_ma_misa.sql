-- Migration 0011: them "Mã tài khoản MISA" (phan hoi 2026-08-28: "Danh sách tài khoản thêm 1 cột tài
-- khoản MISA nữa cho admin bổ sung, có thể import") - chi 1 truong tham chieu tu do (khong FK/rang
-- buoc gi ca), dung de doi soat cheo voi phan mem ke toan MISA. Them ca 2 ben theo xac nhan nguoi
-- dung ("Cả hai"): ktv_lien_he (KTV/CTV/Tram/Ve tinh - nhap tay hoac qua bulk-import co san, cung co
-- che voi cong_no/khu_vuc_ma) va users (Nhan vien van phong - nhap tay qua EditUserModal, CHUA co
-- bulk-import cho nhom nay).
ALTER TABLE ktv_lien_he ADD COLUMN ma_misa TEXT;
ALTER TABLE users ADD COLUMN ma_misa TEXT;
