-- Migration 0021: cho phep dong ktv_ton_kho "chua khop KTV" ton tai (phan hoi 2026-09-08: import
-- tồn kho, dòng không khớp được Mã kho <-> Mã MISA truoc day bi BO HAN, gio van luu lai de Admin/Ke
-- toan sau nay vao "KTV hien truong" chon bo sung Mã MISA tu danh sach cac ma kho chua khop). Them
-- ma_kho (ma kho GOC tu file, luon co du khop hay chua) + ten_kho (ten nguoi trong file, chi de goi y
-- nhan dien), doi ma_ktv sang NULLABLE, doi khoa duy nhat tu (ma_ktv, ma_hang) sang (ma_kho, ma_hang)
-- vi nhieu ma kho KHAC NHAU van chua khop (ma_ktv=NULL) co the trung ma_hang - khong the giu khoa cu.
-- SQLite khong cho ALTER COLUMN doi NOT NULL/UNIQUE truc tiep nen rebuild bang.
CREATE TABLE ktv_ton_kho_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_ktv      TEXT,
    ma_kho      TEXT NOT NULL,
    ten_kho     TEXT,
    ma_hang     TEXT NOT NULL,
    ten_hang    TEXT,
    dvt         TEXT,
    dau_ky      REAL,
    nhap_kho    REAL,
    xuat_kho    REAL,
    cuoi_ky     REAL,
    UNIQUE(ma_kho, ma_hang)
);
INSERT INTO ktv_ton_kho_new (ma_ktv, ma_kho, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
SELECT t.ma_ktv, COALESCE(k.ma_misa, t.ma_ktv), t.ma_hang, t.ten_hang, t.dvt, t.dau_ky, t.nhap_kho, t.xuat_kho, t.cuoi_ky
FROM ktv_ton_kho t LEFT JOIN ktv_lien_he k ON k.ma_ktv = t.ma_ktv;
DROP TABLE ktv_ton_kho;
ALTER TABLE ktv_ton_kho_new RENAME TO ktv_ton_kho;
CREATE INDEX idx_ktv_ton_kho_ma_ktv ON ktv_ton_kho(ma_ktv);
CREATE INDEX idx_ktv_ton_kho_ma_kho ON ktv_ton_kho(ma_kho);
