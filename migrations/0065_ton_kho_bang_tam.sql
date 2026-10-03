-- Import ton kho MISA qua BANG TAM (2026-10-03): truoc day lo dau XOA TRANG ktv_ton_kho + kho_cong_ty_ton_kho roi nhap dan
-- tung lo 100 dong - nguoi dung dong tab / mat mang / loi giua chung -> bang that con 1 phan (cong no, ton kho KTV, du doan
-- duyet don TRU CONG NO sai cho toi lan import sau). Gio moi lo ghi vao 2 bang tam duoi day, lo CUOI thay bang that trong
-- 1 batch (giao dich D1). Cung cot/khoa UNIQUE voi bang that (routes/ktvTonKho.ts POST /import).
CREATE TABLE IF NOT EXISTS ktv_ton_kho_tam (
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
CREATE TABLE IF NOT EXISTS kho_cong_ty_ton_kho_tam (
    kho_ma    TEXT NOT NULL,
    ma_hang   TEXT NOT NULL,
    ten_hang  TEXT,
    dvt       TEXT,
    dau_ky    REAL,
    nhap_kho  REAL,
    xuat_kho  REAL,
    cuoi_ky   REAL,
    UNIQUE(kho_ma, ma_hang)
);
