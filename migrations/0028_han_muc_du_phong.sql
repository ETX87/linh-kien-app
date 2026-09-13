-- Migration 0028: he thong "Han muc du phong KTV" (phan hoi nguoi dung 2026-09-13) - mirror dung
-- cap cot cong_no/cong_no_cap_nhat_luc (migration 0009) nhung KHONG co "thuc te" tu ton kho (khong co
-- bang tuong duong ktv_ton_kho cho du phong):
--   han_muc_du_phong = tran duoc cap (dien tay/import).
--   han_muc_du_phong_hien_tai = so du con lai THEO LAN CAP NHAT GAN NHAT (dien tay/import, KHONG tu
--     tinh) - dung chung 1 moc "mocTinhDuPhong" toan he thong (app_settings key
--     'du_phong_ktv_import_meta', xem backend/src/lib/duPhongKtv.ts) de biet tinh "phat sinh" tu dau.
--   "Han muc du phong phat sinh" va "Moc du phong hien tai" la GIA TRI TINH TOAN (khong luu cot rieng),
--   xem duPhongKtv.ts.
ALTER TABLE ktv_lien_he ADD COLUMN han_muc_du_phong REAL;
ALTER TABLE ktv_lien_he ADD COLUMN han_muc_du_phong_hien_tai REAL;
-- Mirror cong_no_cap_nhat_luc: stamp MOI LAN han_muc_du_phong_hien_tai (khong phai han_muc_du_phong)
-- thay doi, chi de HIEN THI ("Cập nhật lúc..." tren UI) - KHONG phai moc dung de tinh "phat sinh" (moc
-- do la app_settings key toan he thong, xem duPhongKtv.ts).
ALTER TABLE ktv_lien_he ADD COLUMN han_muc_du_phong_cap_nhat_luc TEXT;

-- Mo rong CHECK constraint cua phieu_xuat_kho_log.trang_thai (SQLite khong ho tro ALTER CHECK - phai
-- rebuild bang, giong khuon migration 0002) - phan hoi nguoi dung "log đang bị trùng tên của các giai
-- đoạn (ví dụ tất cả các giai đoạn đều tên là 'Đang tạo phiếu'" - cac hanh dong con (luu ma don hang/
-- ma MISA/tai anh bien ban/yeu cau KTV chuyen tien/dinh bang chung/ke toan duyet bang chung) TRUOC DAY
-- deu ghi log tai su dung trang_thai CHINH hien tai cua phieu (vd "Dang tao phieu") lam headline, chi
-- phan biet duoc qua ghi_chu (dim, de bi bo qua khi luot nhanh). Them 6 gia tri LOG-ONLY moi - CHUA
-- BAO GIO la trang_thai_hien_tai THAT cua phieu_xuat_kho (chi xuat hien trong log), an toan vi da xac
-- nhan CHI notifications.ts doc "trang thai log moi nhat" lam proxy (so khop dung 2 chuoi 'Da chot
-- xong don xuat'/'Cho ke toan', khong dinh gia tri log-only nao o day).
CREATE TABLE phieu_xuat_kho_log_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_xuat_kho_id TEXT NOT NULL REFERENCES phieu_xuat_kho(id),
    trang_thai        TEXT NOT NULL CHECK (trang_thai IN (
                          'Dang tao phieu', 'Cho ke toan', 'Da chot xong don xuat',
                          'Dang gui KTV', 'KTV da nhan', 'Ke toan huy', 'Hang tru kho', 'Kho da ket thuc',
                          'Kho da nhan hang tra',
                          'Da luu ma don hang', 'Da luu ma MISA', 'Da tai anh bien ban',
                          'Da yeu cau KTV chuyen tien', 'Da dinh bang chung chuyen tien',
                          'Ke toan da duyet bang chung chuyen tien'
                      )),
    nguoi_xu_ly       TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly        TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu           TEXT
);
INSERT INTO phieu_xuat_kho_log_new SELECT * FROM phieu_xuat_kho_log;
DROP TABLE phieu_xuat_kho_log;
ALTER TABLE phieu_xuat_kho_log_new RENAME TO phieu_xuat_kho_log;
CREATE INDEX idx_pxkl_id ON phieu_xuat_kho_log(phieu_xuat_kho_id);
