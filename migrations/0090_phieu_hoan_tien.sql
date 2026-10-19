-- Migration 0090 (2026-10-19): PHIẾU HOÀN TIỀN QUỸ CHO KTV - "thêm luồng quy trình hoàn tiền (tiền quỹ đủ tiền) => KT tạo phiếu hoàn
-- tiền => tiền tạm giữ khỏi quỹ => KTV xác nhận => tiền bị trừ khỏi quỹ. KTV từ chối => đẩy về KT xác nhận. KT xác nhận thì hủy luồng.
-- KTV từ chối thì lại đẩy lại chờ KTV xác nhận. các xác nhận, từ chối, hủy bỏ đều có thể thêm ghi chú".
-- Luong (backend/src/lib/phieuHoanTien.ts, routes/quyKtv.ts /phieu-hoan-tien):
--   Ke toan tao (quy >= so tien) -> 'Cho KTV xac nhan': tien TAM GIU = tru khoi quy_ktv.so_du NGAY (giao dich 'hoan_tien_ktv' gan
--   phieu_hoan_tien_id) nen khong bi tu tru tra phieu xuat.
--   KTV xac nhan -> 'Da hoan tien' (tien da ra khoi quy tu luc tam giu, khong ghi them giao dich).
--   KTV tu choi -> 'Cho KT xac nhan' -> Ke toan xac nhan = 'Da huy' (tra lai tien tam giu vao quy: 'dieu_chinh' +) |
--   Ke toan tu choi = ve 'Cho KTV xac nhan'. Ke toan huy duoc o ca 2 trang thai mo.
CREATE TABLE phieu_hoan_tien (
    id               TEXT PRIMARY KEY,                    -- HT-000001 (nextSequentialId 'phieu_hoan_tien')
    email            TEXT NOT NULL,                       -- chu quy (nguoi nhan hang; Ve tinh = Tram)
    so_tien          INTEGER NOT NULL CHECK (so_tien > 0),
    trang_thai       TEXT NOT NULL DEFAULT 'Cho KTV xac nhan'
                     CHECK (trang_thai IN ('Cho KTV xac nhan', 'Cho KT xac nhan', 'Da hoan tien', 'Da huy')),
    ghi_chu          TEXT,                                -- ghi chu cua Ke toan luc tao
    nguoi_tao        TEXT NOT NULL,
    ngay_tao         TEXT NOT NULL,
    cap_nhat_luc     TEXT NOT NULL,
    ktv_xac_nhan_luc TEXT,
    huy_luc          TEXT
);
CREATE INDEX idx_pht_email ON phieu_hoan_tien(email, trang_thai);
CREATE INDEX idx_pht_trang_thai ON phieu_hoan_tien(trang_thai, cap_nhat_luc);

CREATE TABLE phieu_hoan_tien_log (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_hoan_tien_id TEXT NOT NULL REFERENCES phieu_hoan_tien(id),
    hanh_dong          TEXT NOT NULL CHECK (hanh_dong IN ('tao', 'ktv_xac_nhan', 'ktv_tu_choi', 'kt_xac_nhan_huy', 'kt_tu_choi', 'kt_huy')),
    trang_thai         TEXT NOT NULL,                     -- trang thai SAU thao tac
    ghi_chu            TEXT,
    nguoi              TEXT NOT NULL,
    ngay_tao           TEXT NOT NULL
);
CREATE INDEX idx_pht_log ON phieu_hoan_tien_log(phieu_hoan_tien_id, id);

-- So quy: giao dich tam giu / tra lai tam giu gan voi phieu hoan tien.
ALTER TABLE quy_ktv_giao_dich ADD COLUMN phieu_hoan_tien_id TEXT;

INSERT INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES ('phieu_hoan_tien', 0);
