-- Migration 0046: Ke toan TU CHOI bang chung chuyen tien (2026-09-29, phan hoi "bên cạnh nút duyệt chuyển tiền, bổ
-- sung chức năng đẩy lại các trường hợp sai tiền, thiếu bằng chứng... cho kế toán. khi đẩy sẽ cho phép tạo ghi chú lý
-- do từ chối đẩy lại") - xem PATCH /phieu-xuat-kho/:id/chuyen-tien nhanh "Cho KTV chuyen".
--
-- 1) Ly do tu choi GAN NHAT tren phieu - hien cho KTV/TN o khoi "Chuyển tiền" toi khi KTV xac nhan chuyen lai (xoa
--    khi KTV da chuyen / Ke toan duyet). Lich su day du van o phieu_xuat_kho_log.
ALTER TABLE phieu_xuat_kho ADD COLUMN ly_do_tu_choi_chuyen_tien TEXT;
ALTER TABLE phieu_xuat_kho ADD COLUMN tu_choi_chuyen_tien_luc TEXT;

-- 2) Mo rong CHECK phieu_xuat_kho_log.trang_thai them gia tri LOG-ONLY 'Ke toan tu choi bang chung chuyen tien'
--    (SQLite khong ALTER CHECK duoc - rebuild bang, cung khuon migration 0028/0030). Tao lai CA 2 index (0030 chi tao
--    lai idx_pxkl_id, lam mat idx_pxkl_entity_order cua 0018).
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
                          'Da sua tong tien can chuyen', 'Da them don vao phieu', 'Da xoa don khoi phieu'
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
