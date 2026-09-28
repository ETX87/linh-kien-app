-- Migration 0041: mo rong CHECK cua thieu_lk_log.trang_thai them 'Kho da cap nhat' (2026-09-28, xem 0040 + routes/
-- datMuaLinhKien.ts applyThieuLkLog). SQLite khong ho tro ALTER CHECK - rebuild bang, dung khuon migration 0030
-- (phieu_xuat_kho_log). Khong bang nao tham chieu thieu_lk_log; giu nguyen id (AUTOINCREMENT) + 2 index cu.
CREATE TABLE thieu_lk_log_new (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    thieu_lk_id  TEXT NOT NULL REFERENCES thieu_lk(id),
    trang_thai   TEXT NOT NULL CHECK (trang_thai IN (
                     'Cho kho xu ly', 'Kho da tiep nhan', 'Kho da cap nhat',
                     'Kho xac nhan hang da ve', 'Kho tu choi sai TT',
                     'Da huy bo', 'Da ket thuc'
                 )),
    nguoi_xu_ly  TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly   TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu      TEXT
);
INSERT INTO thieu_lk_log_new (id, thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
  SELECT id, thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu FROM thieu_lk_log;
DROP TABLE thieu_lk_log;
ALTER TABLE thieu_lk_log_new RENAME TO thieu_lk_log;
CREATE INDEX idx_tlkl_tlk ON thieu_lk_log(thieu_lk_id);
CREATE INDEX idx_tlkl_entity_order ON thieu_lk_log(thieu_lk_id, id);
