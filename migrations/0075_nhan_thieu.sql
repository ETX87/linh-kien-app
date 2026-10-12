-- Migration 0075: KTV BAO NHAN THIEU / KHONG NHAN DUOC HANG + TU XAC NHAN DA NHAN SAU 10 NGAY (chot 2026-10-12).
-- Phan hoi: "Tự đóng đã nhận sau 10 ngày, mỗi ngày sẽ đẩy thông báo định kỳ đơn còn chờ chưa xác nhận" + "báo thiếu => tạo
-- ticket thiếu hàng nhưng luồng này hoạt động khác luồng thiếu hàng thông thường ... kho từ chối và đẩy lại yêu cầu KTV xác
-- nhận lại / kho đồng ý => chọn 2 phương án => kế toán cân đối phiếu trên misa thành số lượng thực tế => hoàn tiền về quỹ KTV
-- hoặc tạo phiếu gửi hàng bù". Code: routes/nhanThieu.ts (+ cron trong index.ts). Ticket la BANG RIENG (khong dung thieu_lk -
-- bang do gan chat voi don "Cho hang", ~46 cho dong bo, tron vao de vo).

-- 1) Han tu xac nhan "KTV da nhan" cua PXK dang "Dang gui KTV". Trigger dat lai MOI lan phieu vao "Dang gui KTV" (moi duong
--    ghi: app, khovan). Kho tu choi bao thieu -> code dat lai +10 ngay (phieu khong doi trang thai).
ALTER TABLE phieu_xuat_kho ADD COLUMN han_tu_nhan TEXT;

CREATE TRIGGER IF NOT EXISTS trg_pxk_han_tu_nhan AFTER UPDATE OF trang_thai_hien_tai ON phieu_xuat_kho
WHEN NEW.trang_thai_hien_tai = 'Dang gui KTV' AND OLD.trang_thai_hien_tai IS NOT 'Dang gui KTV'
BEGIN
  UPDATE phieu_xuat_kho SET han_tu_nhan = datetime('now', '+7 hours', '+10 days') WHERE id = NEW.id;
END;

-- Phieu dang cho san luc trien khai: han = lan gui + 10 ngay, nhung KHONG som hon 3 ngay tu bay gio (phieu da qua 10 ngay
-- van duoc nhac 3 ngay truoc khi tu dong, khong bi dong ngay luc deploy).
UPDATE phieu_xuat_kho
SET han_tu_nhan = MAX(
  COALESCE(datetime((SELECT MAX(l.ngay_xu_ly) FROM phieu_xuat_kho_log l WHERE l.phieu_xuat_kho_id = phieu_xuat_kho.id AND l.trang_thai = 'Dang gui KTV'), '+10 days'), datetime('now', '+7 hours', '+10 days')),
  datetime('now', '+7 hours', '+3 days')
)
WHERE trang_thai_hien_tai = 'Dang gui KTV';

-- 2) Ticket bao nhan thieu (1 ticket / 1 lan KTV bao tren 1 PXK).
--    trang_thai: 'Cho kho kiem tra' -> 'Kho tu choi' (dong, PXK ve cho KTV xac nhan lai) | 'Cho ke toan' (Kho xac nhan thieu +
--    chon phuong_an) -> 'Da hoan tien' / 'Da gui bu' / 'Da can doi' (dong); KTV huy luc con 'Cho kho kiem tra' -> 'Da huy'.
--    phuong_an: 'gui_bu' (tao don + phieu gui bu mang theo tien da tra) | 'hoan_tien' (khong gui bu - tien phan thieu ve quy KTV,
--    dong khong co tien thi chi dieu chinh SL).
CREATE TABLE nhan_thieu (
    id                 TEXT PRIMARY KEY,
    phieu_xuat_kho_id  TEXT NOT NULL REFERENCES phieu_xuat_kho(id),
    nguoi_nhan_hang    TEXT,
    ly_do              TEXT NOT NULL CHECK (ly_do IN ('thieu_sl', 'khong_nhan', 'sai_hong', 'khac')),
    ghi_chu            TEXT,
    anh                TEXT, -- JSON array URL Drive
    nguoi_bao          TEXT NOT NULL REFERENCES users(email),
    ngay_bao           TEXT NOT NULL,
    trang_thai         TEXT NOT NULL CHECK (trang_thai IN ('Cho kho kiem tra', 'Kho tu choi', 'Cho ke toan', 'Da hoan tien', 'Da gui bu', 'Da can doi', 'Da huy')),
    phuong_an          TEXT CHECK (phuong_an IS NULL OR phuong_an IN ('gui_bu', 'hoan_tien')),
    so_tien_hoan       INTEGER,
    pxk_gui_bu_id      TEXT,
    version            INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_nhan_thieu_pxk ON nhan_thieu(phieu_xuat_kho_id);
CREATE INDEX idx_nhan_thieu_tt ON nhan_thieu(trang_thai);

CREATE TABLE nhan_thieu_dong (
    nhan_thieu_id      TEXT NOT NULL REFERENCES nhan_thieu(id),
    dat_don_hang_id    TEXT NOT NULL REFERENCES dat_don_hang(id),
    so_luong_xuat      INTEGER NOT NULL,  -- SL thuc xuat luc KTV bao
    so_luong_ktv_bao   INTEGER NOT NULL,  -- SL KTV bao da nhan
    so_luong_xac_nhan  INTEGER,           -- SL Kho xac nhan KTV da nhan (NULL = chua xac nhan)
    so_tien_thieu      INTEGER,           -- tien phan thieu (Ke toan chot)
    don_gui_bu_id      TEXT,
    PRIMARY KEY (nhan_thieu_id, dat_don_hang_id)
);

CREATE TABLE nhan_thieu_log (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nhan_thieu_id  TEXT NOT NULL REFERENCES nhan_thieu(id),
    trang_thai     TEXT NOT NULL,
    nguoi_xu_ly    TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly     TEXT NOT NULL,
    ghi_chu        TEXT
);
CREATE INDEX idx_nhan_thieu_log ON nhan_thieu_log(nhan_thieu_id, id);

INSERT OR IGNORE INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES ('nhan_thieu', 0);

-- 3) Don gui bu (tao tu ticket) - KHONG tinh vao tong ngay chiet khau (DON_TINH_TONG_NGAY_SQL), gia chot = don gia don goc.
ALTER TABLE dat_don_hang ADD COLUMN gui_bu_nhan_thieu_id TEXT;

-- 4) Mo rong CHECK phieu_xuat_kho_log.trang_thai them cac gia tri LOG-ONLY (rebuild cung khuon 0071).
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
                          'Ke toan sua tien thuc nhan', 'Ke toan huy duyet chuyen tien',
                          'Da chuyen kho xuat', 'Da chuyen khu vuc',
                          'KTV bao nhan thieu', 'Kho tu choi bao nhan thieu', 'Ke toan can doi nhan thieu'
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
