-- Migration 0009: xay lai quan ly tai khoan/vai tro theo "Khu vuc" (phan hoi 2026-08-26: tach 2 the
-- quan ly KTV hien truong vs Nhan vien van phong, gan Khu vuc cho GS/TN/Kho/Ke toan, Ve tinh gan truc
-- tiep 1 KTV cap 1 phu trach, them cong no KTV). Xac nhan quan trong da chot voi nguoi dung truoc khi
-- viet migration nay:
--   - Khu vuc THAY THE HOAN TOAN co che gan tay `users.giam_sat_quan_ly` cho pham vi du lieu GS (se xu
--     ly o Phase 4 rieng, RUI RO CAO vi dung toi logic phan quyen loi cua module Dat mua linh kien -
--     KHONG xoa cot `giam_sat_quan_ly`/`tram_cha` o day, chi ngung dung de tinh quyen sau khi Phase 4
--     xong va da doi soat).
--   - Khu vuc gan cho TN/Kho/Ke toan CHI de tim kiem/thong ke/badge (giong y nghia
--     `dat_mua_lk_phu_trach_gs` hien co), KHONG gioi han quyen xu ly don.
--   - 1 khu vuc chi thuoc dung 1 GS tai 1 thoi diem - ep bang UNIQUE INDEX o DB (khong chi kiem tra o
--     code) de tranh race-condition.
--   - Ve tinh gan truc tiep 1 KTV cap 1 cu the qua cot moi tren CHINH ktv_lien_he (khong dat o `users`
--     nhu `tram_cha` hien tai) - vi ktv_lien_he la danh ba goc, co ca KTV chua tung dang nhap; dat o
--     `users` se lap lai dung van de 2 nguon du lieu nhu `giam_sat_quan_ly` dang gap (1 cot la "that",
--     1 cot chi la "ghi chu").
--   - Cong no: nhap tay/import Excel dinh ky (khong co cron/API dong bo - he nay khong co scheduled()).
--     Them cot `cong_no_cap_nhat_luc` de KT/Admin biet du lieu cu toi dau, tranh hieu nham la real-time.

-- 1 khu vuc chi 1 GS tai 1 thoi diem (moi dong khu_vuc chi co dung 1 cot gs_email - da la rang buoc
-- tu nhien, KHONG duoc them UNIQUE INDEX tren gs_email vi 1 GS duoc phep phu trach NHIEU khu vuc cung
-- luc, xem yeu cau muc 5). Gan GS moi cho 1 khu vuc da co GS se "cuop" khu vuc do khoi GS cu (UI phai
-- canh bao ro truoc khi ghi de - xem Phase 3).
CREATE TABLE khu_vuc (
    ma              TEXT PRIMARY KEY,
    ten             TEXT NOT NULL,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    stt             INTEGER NOT NULL DEFAULT 0,
    gs_email        TEXT REFERENCES users(email),
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_khu_vuc_gs_email ON khu_vuc(gs_email) WHERE gs_email IS NOT NULL;

-- Gan nhieu-nhieu Khu vuc cho TN/Kho/Ke toan - CHI phuc vu tim kiem/thong ke/badge, thay the
-- `dat_mua_lk_phu_trach_gs` (giu nguyen bang cu, se don o Phase 5 sau khi on dinh).
CREATE TABLE user_khu_vuc (
    user_email  TEXT NOT NULL REFERENCES users(email),
    khu_vuc_ma  TEXT NOT NULL REFERENCES khu_vuc(ma),
    ngay_gan    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_email, khu_vuc_ma)
);
CREATE INDEX idx_user_khu_vuc_khu_vuc ON user_khu_vuc(khu_vuc_ma);

ALTER TABLE ktv_lien_he ADD COLUMN khu_vuc_ma TEXT REFERENCES khu_vuc(ma);
-- Chi co y nghia khi ktv_lien_he.vai_tro_ktv = 'Ve tinh': tro toi ma_ktv cua 1 KTV cap 1 (KTV/CTV/
-- Tram) phu trach truc tiep. KTV cap 1 do se thay toan bo du lieu cua Ve tinh nay.
ALTER TABLE ktv_lien_he ADD COLUMN ktv_cap1_phu_trach TEXT REFERENCES ktv_lien_he(ma_ktv);
ALTER TABLE ktv_lien_he ADD COLUMN cong_no REAL;
ALTER TABLE ktv_lien_he ADD COLUMN cong_no_cap_nhat_luc TEXT;
CREATE INDEX idx_ktv_lien_he_khu_vuc ON ktv_lien_he(khu_vuc_ma) WHERE khu_vuc_ma IS NOT NULL;
CREATE INDEX idx_ktv_lien_he_cap1_phu_trach ON ktv_lien_he(ktv_cap1_phu_trach) WHERE ktv_cap1_phu_trach IS NOT NULL;

-- Seed danh sach khu vuc ban dau theo yeu cau (co the them/tat-bat sau qua Settings - xem Phase 3).
INSERT INTO khu_vuc (ma, ten, stt) VALUES
    ('MB1', 'MB1', 1),
    ('MB2', 'MB2', 2),
    ('MB3', 'MB3', 3),
    ('MN1', 'MN1', 4),
    ('MN2', 'MN2', 5),
    ('MN3', 'MN3', 6),
    ('PTDV', 'PTDV', 7),
    ('SCVP_MB', 'SCVP MB', 8),
    ('SCVP_MN', 'SCVP MN', 9),
    ('B2B_MB', 'B2B MB', 10),
    ('B2B_MN', 'B2B MN', 11);
