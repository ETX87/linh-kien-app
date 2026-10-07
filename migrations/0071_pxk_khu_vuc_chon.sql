-- Migration 0071: KHO CHUYEN KHU VUC CHO PHIEU SAI KHU VUC (chot 2026-10-07, phan hoi "cho phép kho chuyển khu vực cho phiếu
-- sai khu vực => chọn lại khu vực => phiếu và đơn sẽ chuyển về đúng khu vực => kho + kt + tn khu vực đó sẽ nhìn thấy đơn").
-- khu_vuc_ma (0042/0055) do TRIGGER tu tinh lai khi doi nguoi nhan/khu vuc KTV... nen KHONG ghi de duoc - them cot rieng
-- khu_vuc_chon (NULL = theo khu_vuc_ma tu tinh), THANG khu_vuc_ma o bo loc khu vuc (khuVucSetWhereSql) + cot "Khu vực" +
-- mien kho xuat/MISA. Kho chon tren PXK -> ghi CA phieu lan moi don trong phieu.
ALTER TABLE phieu_xuat_kho ADD COLUMN khu_vuc_chon TEXT;
ALTER TABLE dat_don_hang ADD COLUMN khu_vuc_chon TEXT;

-- Mo rong CHECK phieu_xuat_kho_log.trang_thai them 'Da chuyen khu vuc' (rebuild cung khuon 0070).
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
                          'Da chuyen kho xuat', 'Da chuyen khu vuc'
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
