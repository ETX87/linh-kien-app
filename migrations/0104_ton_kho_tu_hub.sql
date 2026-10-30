-- Migration 0104: ton kho keo tu app "Phan tich ton kho 3T" (kho du lieu MISA goc - repo phan-tich-ton-kho-3t,
-- docs/KE_HOACH_KHO_MISA.md). Bang tam RIENG cho luong keo (Ke toan import file cung luc khong dung chung _tam) +
-- bang BONG de chay song song: che do "hub_thu" ghi vao bong de doi chieu, KHONG anh huong nghiep vu.
-- Cong tac: app_settings 'nguon_ton_kho' = file (mac dinh, chua co dong) | hub_thu | hub.
CREATE TABLE IF NOT EXISTS hub_ktv_ton_kho_tam (
    ma_ktv TEXT, ma_kho TEXT NOT NULL, ten_kho TEXT, ma_hang TEXT NOT NULL, ten_hang TEXT, dvt TEXT,
    dau_ky REAL, nhap_kho REAL, xuat_kho REAL, cuoi_ky REAL,
    UNIQUE(ma_kho, ma_hang)
);
CREATE TABLE IF NOT EXISTS hub_kho_cong_ty_ton_kho_tam (
    kho_ma TEXT NOT NULL, ma_hang TEXT NOT NULL, ten_hang TEXT, dvt TEXT,
    dau_ky REAL, nhap_kho REAL, xuat_kho REAL, cuoi_ky REAL,
    UNIQUE(kho_ma, ma_hang)
);
CREATE TABLE IF NOT EXISTS hub_ktv_ton_kho (
    ma_ktv TEXT, ma_kho TEXT NOT NULL, ten_kho TEXT, ma_hang TEXT NOT NULL, ten_hang TEXT, dvt TEXT,
    dau_ky REAL, nhap_kho REAL, xuat_kho REAL, cuoi_ky REAL,
    UNIQUE(ma_kho, ma_hang)
);
CREATE TABLE IF NOT EXISTS hub_kho_cong_ty_ton_kho (
    kho_ma TEXT NOT NULL, ma_hang TEXT NOT NULL, ten_hang TEXT, dvt TEXT,
    dau_ky REAL, nhap_kho REAL, xuat_kho REAL, cuoi_ky REAL,
    UNIQUE(kho_ma, ma_hang)
);

-- Tai khoan HE THONG dung ten cho thao tac tu dong khi keo ton kho (app_settings.updated_by, thieu_lk_log.nguoi_xu_ly,
-- dat_don_hang_log... deu REFERENCES users(email)). Tu choi + bi khoa -> khong dang nhap duoc.
INSERT OR IGNORE INTO users (email, ten, trang_thai_duyet, bi_khoa, xem_danh_muc_lk)
VALUES ('ton-kho-misa@he-thong.local', 'Hệ thống — Tồn kho MISA', 'Tu choi', 1, 0);
