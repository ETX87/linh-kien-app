-- 0080: Tu dong duyet 100% - bo Tac nghiep khoi khau duyet don (chot 2026-10-14, lib/tuDongDuyet.ts).
--  - 2 trang thai don moi:
--      'Cho GS duyet'   = don cong no / ho tro VUOT TRAN cong no -> Giam sat khu vuc cua KTV duyet, bat buoc nhap ma EO.
--      'Cho thanh toan' = don MUA (co tien) THIEU ton kho cong ty: nam trong phieu cho KTV chuyen tien; Ke toan xac nhan
--                         tien xong -> kiem tra ton lai: du -> tu duyet, van thieu -> roi phieu mang theo tien, sang "Cho hang".
--  - dat_don_hang.ma_eo (+ nguoi/luc): ma EO GS / TBP nhap khi duyet don vuot tran.
--  - linh_kien.cho_phep_gia_0: LK duoc phep dat don phat sinh tien (MUA / TRỪ CÔNG NỢ) khi gia ban 0/chua co gia.
--    KHONG cham ngay_cap_nhat (cot noi bo, khong day sang DVBH/Sua chua).
ALTER TABLE dat_don_hang ADD COLUMN ma_eo TEXT;
ALTER TABLE dat_don_hang ADD COLUMN ma_eo_nguoi TEXT;
ALTER TABLE dat_don_hang ADD COLUMN ma_eo_luc TEXT;
ALTER TABLE linh_kien ADD COLUMN cho_phep_gia_0 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE linh_kien ADD COLUMN cho_phep_gia_0_nguoi TEXT;
ALTER TABLE linh_kien ADD COLUMN cho_phep_gia_0_luc TEXT;

-- Mo rong CHECK dat_don_hang_log.trang_thai (SQLite khong ALTER CHECK -> rebuild, khuon 0041). Khong bang nao tham chieu
-- dat_don_hang_log; giu nguyen id (AUTOINCREMENT) + cot tu_dong (0037) + 2 index cu.
CREATE TABLE dat_don_hang_log_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_don_hang_id   TEXT NOT NULL REFERENCES dat_don_hang(id),
    trang_thai        TEXT NOT NULL CHECK (trang_thai IN (
                          'Cho Tram duyet', 'Cho TN duyet', 'Cho TBP xac nhan', 'TN da duyet', 'TN tu choi',
                          'Cho hang', 'Da huy', 'Cho GS duyet', 'Cho thanh toan'
                      )),
    nguoi_xu_ly       TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly        TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu           TEXT,
    tu_dong           INTEGER NOT NULL DEFAULT 0
);
INSERT INTO dat_don_hang_log_new (id, dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong)
  SELECT id, dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong FROM dat_don_hang_log;
DROP TABLE dat_don_hang_log;
ALTER TABLE dat_don_hang_log_new RENAME TO dat_don_hang_log;
CREATE INDEX idx_ddhl_dat_don_hang ON dat_don_hang_log(dat_don_hang_id);
CREATE INDEX idx_ddhl_entity_order ON dat_don_hang_log(dat_don_hang_id, id);

-- Ton kho cong ty tinh theo KHU VUC CUA DON (khong con qua ktv_lien_he cua nguoi nhan) - index phuc vu tru dan theo ma + khu vuc.
CREATE INDEX IF NOT EXISTS idx_ddh_ma_lk_khu_vuc ON dat_don_hang(ma_lk, khu_vuc_ma);
