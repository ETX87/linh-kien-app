-- Anh bien ban dong goi cho phieu_xuat_kho (chot 2026-09-08: chuan hoa hanh dong Kho "Dong
-- goi" giua PXK- va TR- - ben suachua da co phieu_tra_bh_anh, PXK- ben nay chua co bang tuong
-- duong. Mirror dung khuon phieu_tra_bh_anh (gui-bao-hanh-linh-kien/migrations/0001_init.sql):
-- chi luu URL anh, KHONG doi trang_thai_hien_tai cua phieu_xuat_kho khi upload.
CREATE TABLE phieu_xuat_kho_anh (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_xuat_kho_id TEXT NOT NULL REFERENCES phieu_xuat_kho(id),
    anh_url           TEXT NOT NULL,
    nguoi_upload      TEXT REFERENCES users(email),
    ngay_upload       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pxk_anh_phieu ON phieu_xuat_kho_anh(phieu_xuat_kho_id);
