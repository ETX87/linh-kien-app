-- Migration 0013: ton kho linh kien theo KTV, import hang ngay tu bao cao "Tổng hợp tồn kho" cua
-- MISA (phan hoi nguoi dung 2026-08-29). Anh xa cot "Mã kho" trong file MISA toi dung KTV qua
-- ktv_lien_he.ma_misa (da co san tu migration 0011, xac nhan nguoi dung dung lai cot nay, KHONG them
-- truong anh xa moi). Moi lan import GHI DE toan bo bang nay (xac nhan nguoi dung: khong giu lich su,
-- giong quy uoc "cong no" hien co - file import hang ngay luon la ban "tong hop" day du TAT CA
-- kho/KTV cung luc nen an toan de xoa trang roi nhap lai). KHONG dung FK cung toi ktv_lien_he(ma_ktv)
-- - giu quy uoc long-coupling giong ma_misa/cong_no (ktv_lien_he co the bi hard-delete, xem
-- settingsKtv.ts DELETE /:ma).
CREATE TABLE ktv_ton_kho (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_ktv      TEXT NOT NULL,
    ma_hang     TEXT NOT NULL,
    ten_hang    TEXT,
    dvt         TEXT,
    dau_ky      REAL,
    nhap_kho    REAL,
    xuat_kho    REAL,
    cuoi_ky     REAL,
    UNIQUE(ma_ktv, ma_hang)
);
CREATE INDEX idx_ktv_ton_kho_ma_ktv ON ktv_ton_kho(ma_ktv);
