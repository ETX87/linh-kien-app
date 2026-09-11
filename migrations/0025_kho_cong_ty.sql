-- Migration 0025: "Kho công ty" (phan hoi 2026-09-11: tu dong duyet don mua/cong no khi kho con
-- du hang) - danh sach kho vat ly cua cong ty (KHAC voi ktv_ton_kho, dung cho "kho ao" ca nhan tung
-- KTV trong MISA), dung de tinh ton kho theo Khu vuc luc tao don. Seed 22 dong tu file "Danh sach
-- kho vat ly hong anh da ra soat.xlsx" nguoi dung cung cap - 7 kho co "Trang thai kho" = "Co xuat
-- hang thuc te" duoc gan Mien (khop dung ma khu_vuc.ma), 15 kho con lai giu bat_tat=0, chua gan
-- Mien nao (co the bat/gan sau qua Settings).
CREATE TABLE kho_cong_ty (
    ma              TEXT PRIMARY KEY,
    ten             TEXT NOT NULL,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Nhieu-nhieu: 1 kho co the phuc vu nhieu Khu vuc (vd "6804-MB" phuc vu ca MB1/MB2/MB3).
CREATE TABLE kho_cong_ty_khu_vuc (
    kho_ma      TEXT NOT NULL REFERENCES kho_cong_ty(ma),
    khu_vuc_ma  TEXT NOT NULL REFERENCES khu_vuc(ma),
    PRIMARY KEY (kho_ma, khu_vuc_ma)
);
CREATE INDEX idx_kctkv_khu_vuc ON kho_cong_ty_khu_vuc(khu_vuc_ma);

-- Ton kho GOC cua tung kho cong ty - GHI DE toan bo moi lan import (cung pattern ktv_ton_kho, dung
-- CHUNG 1 file/1 nut Import "Tồn kho MISA" - xem routes/ktvTonKho.ts POST /import, phan nhanh them
-- 2026-09-11: dong khong khop ma_misa cua KTV nao se thu khop tiep voi kho_cong_ty.ma truoc khi roi
-- vao nhom "chua khop mã kho" that su).
CREATE TABLE kho_cong_ty_ton_kho (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    kho_ma    TEXT NOT NULL REFERENCES kho_cong_ty(ma),
    ma_hang   TEXT NOT NULL,
    ten_hang  TEXT,
    dvt       TEXT,
    dau_ky    REAL,
    nhap_kho  REAL,
    xuat_kho  REAL,
    cuoi_ky   REAL,
    UNIQUE(kho_ma, ma_hang)
);
CREATE INDEX idx_kct_ton_kho_ma_hang ON kho_cong_ty_ton_kho(ma_hang);

INSERT INTO kho_cong_ty (ma, ten, bat_tat) VALUES
    ('6803', 'Kho 6803 - Q2 HCM', 1),
    ('6804-MB', 'Kho 6804 - Nguyễn Hữu Thọ', 1),
    ('GLMB', 'Kho bảo hành GCOOL Miền Bắc', 1),
    ('SNKMB', 'Kho bảo hành SANAKY Miền Bắc', 1),
    ('VGMB', 'Kho Dự Án VGREEN Miền Bắc', 1),
    ('VGMN', 'Kho Dự Án VGREEN Miền Nam', 1),
    ('MMMB', 'Kho linh kiện ký gửi Media Mart Miền Bắc', 1),
    ('6806-MB', 'Kho 6806 - Kho bảo hành MB', 0),
    ('9803-MN', 'Kho 9803 - MN Kho linh kiện bảo hành GTC', 0),
    ('CXL-MB', 'Kho chờ trả hàng KRF Miền Bắc', 0),
    ('C157KRFM-MN', 'Kho Chuẩn ký gửi Máy mới KRF-Q2 HCM', 0),
    ('KHOCC', 'Kho Chung Chuyển Nam Bắc', 0),
    ('KHOGL', 'Kho Gia Lâm', 0),
    ('CXL-MN', 'Kho hàng chờ trả KRF Miền Nam', 0),
    ('157KRFM-MB', 'Kho ký gửi hàng mới KRF-Hưng Yên', 0),
    ('157KRFM-MN', 'Kho ký gửi hàng mới KRF-Q2 HCM', 0),
    ('LKDH-MB', 'Kho linh kiện điều hòa Miền Bắc', 0),
    ('NTMN', 'Kho nhập tạm hàng trả lại Miền Nam', 0),
    ('SCVP MB', 'Kho sửa chữa VP Miền Bắc', 0),
    ('SCVP MN', 'Kho sửa chữa VP Miền Nam', 0),
    ('LVGMB', 'Kho Trụ sạc lỗi VGREEN Miền Bắc', 0),
    ('CXLVGMB', 'Kho trụ sạc Vgreen chờ xử lý Miền Bắc', 0);

INSERT INTO kho_cong_ty_khu_vuc (kho_ma, khu_vuc_ma) VALUES
    ('6803', 'MN1'), ('6803', 'MN2'), ('6803', 'MN3'),
    ('6804-MB', 'MB1'), ('6804-MB', 'MB2'), ('6804-MB', 'MB3'),
    ('GLMB', 'MB1'), ('GLMB', 'MB2'), ('GLMB', 'MB3'),
    ('SNKMB', 'MB1'), ('SNKMB', 'MB2'), ('SNKMB', 'MB3'),
    ('VGMB', 'MB1'), ('VGMB', 'MB2'), ('VGMB', 'MB3'),
    ('VGMN', 'MN1'), ('VGMN', 'MN2'), ('VGMN', 'MN3'),
    ('MMMB', 'MB1'), ('MMMB', 'MB2'), ('MMMB', 'MB3');
