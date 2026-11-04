-- THIEU HANG BAO HANH (2026-11-04, yeu cau "them luong gui don thieu linh kien tu App bao hanh sang app dat linh kien dua theo ly do
-- cham 'Khong co linh kien', 'Het hang ton kho' => tao ticket thieu hang de kho va nhan vien mua hang xu ly. Khi ticket duoc duyet
-- hoac thay doi se phan hoi ve don bao hanh goc").
-- Bang RIENG, khong dung thieu_lk (thieu_lk.dat_don_hang_id NOT NULL - gan cung voi don dat mua). Ticket do Worker "suachua" tao qua
-- /api/suachua-partner/thieu-hang-bh; nguon_id = ma don vi bao hanh ben suachua (DH-xxxxxx-n). Nguoi bao / KTV la email ben suachua
-- nen KHONG khoa ngoai toi users.
-- Trang thai MO: 'Cho kho xu ly', 'Kho da tiep nhan', 'Cho mua hang', 'Mua hang da dat'.
-- Trang thai DONG: 'Kho xac nhan hang da ve', 'Kho tu choi', 'Mua hang tu choi', 'Da huy'.
CREATE TABLE thieu_hang_bh (
    id             TEXT PRIMARY KEY,
    nguon_id       TEXT NOT NULL,
    ma_lk          TEXT NOT NULL,
    ten_lk         TEXT,
    so_luong       INTEGER NOT NULL DEFAULT 1,
    ly_do          TEXT,
    ghi_chu        TEXT,
    mien           TEXT,
    case_id        TEXT,
    ktv_email      TEXT,
    ktv_ten        TEXT,
    nguoi_bao      TEXT,
    nguoi_bao_ten  TEXT,
    trang_thai     TEXT NOT NULL DEFAULT 'Cho kho xu ly',
    ngay_du_kien   TEXT,
    ma_eo_mua      TEXT,
    ghi_chu_xu_ly  TEXT,
    nguoi_xu_ly    TEXT,
    ngay_tao       TEXT NOT NULL,
    ngay_cap_nhat  TEXT NOT NULL
);
CREATE INDEX idx_thb_nguon ON thieu_hang_bh(nguon_id);
CREATE INDEX idx_thb_tt ON thieu_hang_bh(trang_thai);
CREATE INDEX idx_thb_cap_nhat ON thieu_hang_bh(ngay_cap_nhat);

CREATE TABLE thieu_hang_bh_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    thieu_hang_bh_id  TEXT NOT NULL REFERENCES thieu_hang_bh(id),
    trang_thai        TEXT NOT NULL,
    nguoi_xu_ly       TEXT NOT NULL,
    ngay_xu_ly        TEXT NOT NULL,
    ghi_chu           TEXT
);
CREATE INDEX idx_thbl ON thieu_hang_bh_log(thieu_hang_bh_id, id);

INSERT OR IGNORE INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES ('thieu_hang_bh', 0);
