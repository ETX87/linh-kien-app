-- Migration 0070: CHUYEN KHO XUAT MB/MN THEO PHIEU (chot 2026-10-07, phan hoi "cho phép TN hoặc kế toán chuyển kho xuất
-- hàng cho đơn hàng (MB, MN) => ảnh hưởng đến phiếu misa tải ra và view của các tài khoản KHO, KT, TN" - chot: theo PHIEU,
-- chuyen duoc truoc khi gui Kho, chi mien moi thay mac dinh). Xem backend/src/lib/mienXuat.ts.

-- 1) Mien xuat chon tay cua phieu. NULL = theo khu vuc cua phieu ("MB" -> bac, "MN" -> nam - nhu truoc).
ALTER TABLE phieu_xuat_kho ADD COLUMN mien_xuat TEXT CHECK (mien_xuat IS NULL OR mien_xuat IN ('bac', 'nam'));

-- 2) Mo rong CHECK phieu_xuat_kho_log.trang_thai them 1 gia tri LOG-ONLY 'Da chuyen kho xuat' (rebuild cung khuon 0049).
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
                          'Da chuyen kho xuat'
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
