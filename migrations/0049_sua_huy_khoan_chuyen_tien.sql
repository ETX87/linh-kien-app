-- Migration 0049: KE TOAN SUA TIEN THUC NHAN / HUY KHOAN CHUYEN TIEN DA DUYET (2026-09-29, phan hoi "cho phép kế toán
-- sửa tiền thực nhận cho các PXK đã duyệt" + "bổ sung các nút hủy khoản chuyển tiền này cho trường hợp kế toán duyệt
-- nhầm"). Xem lib/quyKtv.ts suaThucNhanKhoan()/huyKhoanChuyen().

-- 1) khoan_chuyen_tien: them trang thai 'Da huy' (Ke toan huy xac nhan da nhan) + vet sua/huy. Bang khong co FK nao tro
--    toi (quy_ktv_giao_dich.khoan_chuyen_tien_id chi la so, khong REFERENCES) nen rebuild an toan.
CREATE TABLE khoan_chuyen_tien_new (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_xuat_kho_id   TEXT NOT NULL,
    email_nguoi_chuyen  TEXT NOT NULL,
    trang_thai          TEXT NOT NULL CHECK (trang_thai IN ('Da duyet', 'Tu choi', 'Da huy')),
    tong_phieu          INTEGER,
    da_thanh_toan_truoc INTEGER NOT NULL DEFAULT 0,
    so_tien_can_chuyen  INTEGER,
    so_tien_thuc_nhan   INTEGER,
    anh                 TEXT,
    ghi_chu_ktv         TEXT,
    ktv_bao_chuyen_luc  TEXT,
    ly_do_tu_choi       TEXT,
    nguoi_duyet         TEXT NOT NULL,
    duyet_luc           TEXT NOT NULL,
    lich_su             INTEGER NOT NULL DEFAULT 0,
    thuc_nhan_goc       INTEGER,                -- so thuc nhan LUC DUYET (chi co khi da sua it nhat 1 lan)
    sua_luc             TEXT,                   -- lan sua gan nhat
    nguoi_sua           TEXT,
    ly_do_sua           TEXT,
    huy_luc             TEXT,
    nguoi_huy           TEXT,
    ly_do_huy           TEXT
);
INSERT INTO khoan_chuyen_tien_new (id, phieu_xuat_kho_id, email_nguoi_chuyen, trang_thai, tong_phieu, da_thanh_toan_truoc,
    so_tien_can_chuyen, so_tien_thuc_nhan, anh, ghi_chu_ktv, ktv_bao_chuyen_luc, ly_do_tu_choi, nguoi_duyet, duyet_luc, lich_su)
SELECT id, phieu_xuat_kho_id, email_nguoi_chuyen, trang_thai, tong_phieu, da_thanh_toan_truoc,
    so_tien_can_chuyen, so_tien_thuc_nhan, anh, ghi_chu_ktv, ktv_bao_chuyen_luc, ly_do_tu_choi, nguoi_duyet, duyet_luc, lich_su
FROM khoan_chuyen_tien;
DROP TABLE khoan_chuyen_tien;
ALTER TABLE khoan_chuyen_tien_new RENAME TO khoan_chuyen_tien;
CREATE INDEX IF NOT EXISTS idx_kct_pxk ON khoan_chuyen_tien(phieu_xuat_kho_id);
CREATE INDEX IF NOT EXISTS idx_kct_nguoi ON khoan_chuyen_tien(email_nguoi_chuyen, id);
CREATE INDEX IF NOT EXISTS idx_kct_duyet_luc ON khoan_chuyen_tien(duyet_luc);

-- 2) Mo rong CHECK phieu_xuat_kho_log.trang_thai them 2 gia tri LOG-ONLY (rebuild cung khuon 0046/0047).
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
                          'Tru quy du', 'Hoan tien ve quy',
                          'Ke toan sua tien thuc nhan', 'Ke toan huy duyet chuyen tien'
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
