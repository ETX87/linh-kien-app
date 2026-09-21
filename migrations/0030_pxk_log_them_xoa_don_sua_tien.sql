-- Migration 0030: mo rong CHECK constraint cua phieu_xuat_kho_log.trang_thai (SQLite khong ho tro
-- ALTER CHECK - rebuild bang, dung khuon migration 0028) - phan hoi nguoi dung "cho phep Ke toan/TN
-- sua tong tien can chuyen + them/bo don khoi phieu ngay o buoc chờ KTV chuyển tiền" - them 3 gia tri
-- LOG-ONLY moi (chua bao gio la trang_thai_hien_tai THAT cua phieu_xuat_kho, chi xuat hien trong log)
-- cho 3 hanh dong moi: sua tong tien can chuyen (khong dung POST /:id/chuyen-tien vi route do RESET
-- toan bo bang chung), them don vao phieu, xoa don khoi phieu (xem backend/src/routes/phieuXuatKho.ts).
CREATE TABLE phieu_xuat_kho_log_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_xuat_kho_id TEXT NOT NULL REFERENCES phieu_xuat_kho(id),
    trang_thai        TEXT NOT NULL CHECK (trang_thai IN (
                          'Dang tao phieu', 'Cho ke toan', 'Da chot xong don xuat',
                          'Dang gui KTV', 'KTV da nhan', 'Ke toan huy', 'Hang tru kho', 'Kho da ket thuc',
                          'Kho da nhan hang tra',
                          'Da luu ma don hang', 'Da luu ma MISA', 'Da tai anh bien ban',
                          'Da yeu cau KTV chuyen tien', 'Da dinh bang chung chuyen tien',
                          'Ke toan da duyet bang chung chuyen tien',
                          'Da sua tong tien can chuyen', 'Da them don vao phieu', 'Da xoa don khoi phieu'
                      )),
    nguoi_xu_ly       TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly        TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu           TEXT
);
INSERT INTO phieu_xuat_kho_log_new SELECT * FROM phieu_xuat_kho_log;
DROP TABLE phieu_xuat_kho_log;
ALTER TABLE phieu_xuat_kho_log_new RENAME TO phieu_xuat_kho_log;
CREATE INDEX idx_pxkl_id ON phieu_xuat_kho_log(phieu_xuat_kho_id);
