-- Migration 0093: TICKET THIEU HANG CHUYEN MUA HANG (chot 2026-10-19, "linh kiện cần phải đặt hàng (chưa có bất kỳ kế hoạch EO mua
-- hàng nào gần đây đang về) => chuyển sang nv mua hàng => thêm 1 nút chuyển mua hàng hoặc tiếp nhận như bình thường"; chốt: Mua hàng
-- không mua được = "từ chối luôn"; ticket khác cùng mã Kho tự tiếp nhận từng cái).
-- Trang thai log MOI:
--   'Cho mua hang'     - Kho chuyen ticket cho Mua hang dat hang (tu Cho kho xu ly / Kho da tiep nhan / Kho da cap nhat).
--   'Mua hang da dat'  - Mua hang bao da dat (ma EO + ngay du kien) -> cho hang ve nhu sau khi Kho tiep nhan; Kho xac nhan hang ve.
--   'Mua hang tu choi' - Mua hang khong mua duoc (bat buoc ly do) -> nhu Kho tu choi: don goc tu huy, ticket dong.
-- SQLite khong ALTER CHECK duoc -> rebuild cung khuon 0041 (khong bang nao tham chieu thieu_lk_log; giu id + 2 index).
CREATE TABLE thieu_lk_log_new (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    thieu_lk_id  TEXT NOT NULL REFERENCES thieu_lk(id),
    trang_thai   TEXT NOT NULL CHECK (trang_thai IN (
                     'Cho kho xu ly', 'Kho da tiep nhan', 'Kho da cap nhat',
                     'Cho mua hang', 'Mua hang da dat', 'Mua hang tu choi',
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

-- Ma EO Mua hang nhap khi bao "Da dat hang" (tham khao, doi chieu app EO mua hang - chua ket noi API).
ALTER TABLE thieu_lk ADD COLUMN ma_eo_mua TEXT;
