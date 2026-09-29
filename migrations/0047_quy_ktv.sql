-- Migration 0047: QUY TIEN DU CUA KTV (2026-09-29, phan hoi "cần tạo 1 quỹ tiền đã chuyển của từng nhân viên... KTV
-- chuyển khoản 200k, phiếu chỉ cần 120k => dư 80k => kế toán xác nhận thực tế số tiền đã chuyển về => lưu quỹ 80k dư.
-- Quỹ tiền này sẽ sử dụng cho các khoản mua sau"). Xem lib/quyKtv.ts.
--
-- Mo hinh: MOI dong tien di qua quy cua NGUOI NHAN HANG (phieu_xuat_kho.nguoi_nhan_hang):
--   Ke toan duyet 1 khoan chuyen voi so THUC NHAN T -> quy +T ('nop_tien') -> he thong tu tru quy tra phieu
--   ('tra_phieu', toi da so con thieu) -> phan du nam lai trong quy. Tong phieu giam / phieu huy sau khi da tra ->
--   hoan phan tra thua ve quy ('hoan_phieu'). Quy con tien -> tu tru cho phieu "Cho KTV chuyen" cu nhat.
-- phieu_xuat_kho.so_tien_can_chuyen GIU NGUYEN nghia = TONG gia tri phieu; con phai chuyen = so_tien_can_chuyen -
-- da_thanh_toan.

-- 1) Da thanh toan cho phieu (tien chuyen + quy da tru, tru phan da hoan).
ALTER TABLE phieu_xuat_kho ADD COLUMN da_thanh_toan INTEGER NOT NULL DEFAULT 0;

-- 2) So du quy - KHONG BAO GIO am (CHECK lam 1 batch tru qua tay loi va rollback ca batch).
CREATE TABLE quy_ktv (
    email        TEXT PRIMARY KEY,
    so_du        INTEGER NOT NULL DEFAULT 0 CHECK (so_du >= 0),
    cap_nhat_luc TEXT
);

-- 3) So quy - CHI GHI THEM (khong sua/xoa). so_tien co dau (+ vao quy, - ra quy); so_du_sau = so du ngay sau giao dich.
CREATE TABLE quy_ktv_giao_dich (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    email                TEXT NOT NULL,
    loai                 TEXT NOT NULL CHECK (loai IN ('nop_tien', 'tra_phieu', 'hoan_phieu', 'dieu_chinh', 'hoan_tien_ktv')),
    so_tien              INTEGER NOT NULL,
    so_du_sau            INTEGER NOT NULL,
    phieu_xuat_kho_id    TEXT,
    khoan_chuyen_tien_id INTEGER,
    ghi_chu              TEXT,
    nguoi_tao            TEXT NOT NULL,
    ngay_tao             TEXT NOT NULL
);
CREATE INDEX idx_qktv_gd_email ON quy_ktv_giao_dich(email, id);
CREATE INDEX idx_qktv_gd_pxk ON quy_ktv_giao_dich(phieu_xuat_kho_id);

-- 4) Moi lan Ke toan DUYET hoac TU CHOI 1 khoan chuyen tien (so quan ly tien da duoc duyet kem bang chung).
CREATE TABLE khoan_chuyen_tien (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_xuat_kho_id   TEXT NOT NULL,
    email_nguoi_chuyen  TEXT NOT NULL,          -- = nguoi_nhan_hang cua phieu (tien tinh cho nguoi nhan hang)
    trang_thai          TEXT NOT NULL CHECK (trang_thai IN ('Da duyet', 'Tu choi')),
    tong_phieu          INTEGER,                -- so_tien_can_chuyen luc duyet
    da_thanh_toan_truoc INTEGER NOT NULL DEFAULT 0,
    so_tien_can_chuyen  INTEGER,                -- con thieu luc duyet (tong - da thanh toan truoc)
    so_tien_thuc_nhan   INTEGER,                -- NULL khi tu choi
    anh                 TEXT,                   -- JSON array URL anh bang chung luc duyet/tu choi
    ghi_chu_ktv         TEXT,
    ktv_bao_chuyen_luc  TEXT,
    ly_do_tu_choi       TEXT,
    nguoi_duyet         TEXT NOT NULL,
    duyet_luc           TEXT NOT NULL,
    lich_su             INTEGER NOT NULL DEFAULT 0  -- 1 = chuyen tu du lieu truoc khi co quy (thuc nhan = can chuyen)
);
CREATE INDEX idx_kct_pxk ON khoan_chuyen_tien(phieu_xuat_kho_id);
CREATE INDEX idx_kct_nguoi ON khoan_chuyen_tien(email_nguoi_chuyen, id);
CREATE INDEX idx_kct_duyet_luc ON khoan_chuyen_tien(duyet_luc);

-- 5) Khoa "so sanh roi ghi" (CAS) trong 1 batch D1: INSERT 1 dong x=1 vao day khi du lieu da doi -> vi pham CHECK ->
--    ca batch rollback (D1 batch khong co IF). Bang luon rong.
CREATE TABLE quy_cas_guard (x INTEGER NOT NULL CHECK (x = 0));

-- 6) Du lieu cu: phieu Ke toan da duyet = da tra DU, khong du (quy moi nguoi bat dau 0). Ghi 1 khoan "lich su" de
--    so quan ly chuyen tien co ca cac lan duyet truoc do.
UPDATE phieu_xuat_kho SET da_thanh_toan = COALESCE(so_tien_can_chuyen, 0)
WHERE trang_thai_chuyen_tien = 'TN da duyet' AND so_tien_can_chuyen IS NOT NULL;

INSERT INTO khoan_chuyen_tien (phieu_xuat_kho_id, email_nguoi_chuyen, trang_thai, tong_phieu, da_thanh_toan_truoc,
    so_tien_can_chuyen, so_tien_thuc_nhan, anh, ghi_chu_ktv, ktv_bao_chuyen_luc, nguoi_duyet, duyet_luc, lich_su)
SELECT p.id, p.nguoi_nhan_hang, 'Da duyet', p.so_tien_can_chuyen, 0, p.so_tien_can_chuyen, p.so_tien_can_chuyen,
    COALESCE(p.bang_chung_chuyen_tien_anh,
             CASE WHEN p.bang_chung_chuyen_tien_url IS NOT NULL THEN json_array(p.bang_chung_chuyen_tien_url) END),
    p.bang_chung_chuyen_tien_ghi_chu, p.ngay_ktv_chuyen,
    COALESCE((SELECT l.nguoi_xu_ly FROM phieu_xuat_kho_log l WHERE l.phieu_xuat_kho_id = p.id
                AND l.trang_thai = 'Ke toan da duyet bang chung chuyen tien' ORDER BY l.id DESC LIMIT 1), 'he-thong'),
    COALESCE((SELECT l.ngay_xu_ly FROM phieu_xuat_kho_log l WHERE l.phieu_xuat_kho_id = p.id
                AND l.trang_thai = 'Ke toan da duyet bang chung chuyen tien' ORDER BY l.id DESC LIMIT 1),
             p.ngay_ktv_chuyen, p.ngay_tao),
    1
FROM phieu_xuat_kho p
WHERE p.trang_thai_chuyen_tien = 'TN da duyet' AND p.so_tien_can_chuyen IS NOT NULL AND p.nguoi_nhan_hang IS NOT NULL;

-- 7) Mo rong CHECK phieu_xuat_kho_log.trang_thai them 2 gia tri LOG-ONLY 'Tru quy du' / 'Hoan tien ve quy' (rebuild
--    cung khuon 0046).
CREATE TABLE phieu_xuat_kho_log_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_xuat_kho_id TEXT NOT NULL REFERENCES phieu_xuat_kho(id),
    trang_thai        TEXT NOT NULL CHECK (trang_thai IN (
                          'Dang tao phieu', 'Cho ke toan', 'Da chot xong don xuat',
                          'Dang gui KTV', 'KTV da nhan', 'Ke toan huy', 'Hang tru kho', 'Kho da ket thuc',
                          'Kho da nhan hang tra',
                          'Da luu ma don hang', 'Da luu ma MISA', 'Da tai anh bien ban',
                          'Da yeu cau KTV chuyen tien', 'Da dinh bang chung chuyen tien',
                          'Ke toan da duyet bang chung chuyen tien', 'Ke toan tu choi bang chung chuyen tien',
                          'Da sua tong tien can chuyen', 'Da them don vao phieu', 'Da xoa don khoi phieu',
                          'Tru quy du', 'Hoan tien ve quy'
                      )),
    nguoi_xu_ly       TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly        TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu           TEXT
);
INSERT INTO phieu_xuat_kho_log_new SELECT * FROM phieu_xuat_kho_log;
DROP TABLE phieu_xuat_kho_log;
ALTER TABLE phieu_xuat_kho_log_new RENAME TO phieu_xuat_kho_log;
CREATE INDEX IF NOT EXISTS idx_pxkl_id ON phieu_xuat_kho_log(phieu_xuat_kho_id);
CREATE INDEX IF NOT EXISTS idx_pxkl_entity_order ON phieu_xuat_kho_log(phieu_xuat_kho_id, id);
