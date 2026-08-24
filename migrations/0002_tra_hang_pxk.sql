-- Migration 0002: bo sung buoc "Tac nghiep nhat linh kien vao PXK" con thieu trong luong tra hang
-- (phan hoi nguoi dung 2026-08-21: "thiếu bước Tác nghiệp nhặt linh kiện vào PXK... luồng pxk này
-- tương tự như pxk hiện tại chỉ là bước xác nhận khác"). 3 quyet dinh da chot voi nguoi dung:
--   1) Tai su dung dung bang/luong phieu_xuat_kho hien co (loai_don da cho phep 'tra_hang' tu dau,
--      chi chua co code nao tao duoc) thay vi xay 1 bang rieng.
--   2) tra_hang_log rut gon con 5 buoc dau, dung o "TN da duyet" (giong het cach dat_don_hang cua
--      mua/cong_no dung o "TN da duyet" roi theo doi tiep qua phieu_xuat_kho) - 2 buoc cuoi cu ("Cho
--      ke toan xac nhan nhap kho"/"Cho kho xac nhan nhap kho") bi xoa khoi CHECK, thay bang viec PXK
--      tra hang tu theo doi phan con lai qua trang_thai rieng cua no.
--   3) Nut "Duyet" o buoc "Cho TN duyet tong" GIU NGUYEN hanh vi cu (chuyen trang thai ngay, khong mo
--      man tao PXK) - TN vao man "Phieu xuat kho" > tab "Tra hang" de tao PXK sau, tach lam 2 hanh
--      dong doc lap (khong gop chung).
--
-- SQLite khong ho tro ALTER...DROP/MODIFY CONSTRAINT - phai rebuild bang. He chua co du lieu that
-- (xem CLAUDE.md "Nguon goc tach he thong": "hệ mới bắt đầu rỗng"), INSERT...SELECT ben duoi chi de
-- an toan cho du lieu test cuc bo cua dev, khong anh huong du lieu that nao.

CREATE TABLE tra_hang_log_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_don_hang_id TEXT NOT NULL REFERENCES dat_don_hang(id),
    trang_thai      TEXT NOT NULL CHECK (trang_thai IN (
                        'Cho ke toan duyet mem', 'Cho kho xac nhan', 'Cho QC xac nhan',
                        'Cho TN duyet tong', 'TN da duyet', 'Tu choi', 'Da huy'
                    )),
    nguoi_xu_ly     TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly      TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu         TEXT
);
INSERT INTO tra_hang_log_new (id, dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
  SELECT id, dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu FROM tra_hang_log
  WHERE trang_thai NOT IN ('Cho ke toan xac nhan nhap kho', 'Cho kho xac nhan nhap kho', 'Da hoan thanh');
DROP TABLE tra_hang_log;
ALTER TABLE tra_hang_log_new RENAME TO tra_hang_log;
CREATE INDEX idx_thl_don_hang ON tra_hang_log(dat_don_hang_id);

-- phieu_xuat_kho_log: them 1 trang thai moi 'Kho da nhan hang tra' - buoc CUOI CUNG rieng cho PXK
-- loai_don='tra_hang' (Kho xac nhan da nhan hang tra VE kho) - thay the cho cap "Dang gui KTV"/"KTV
-- da nhan" cua chieu xuat hang thuong (chieu tra hang khong co buoc "dang gui" trung gian vi hang
-- khong phai ship di dau ca, chi can 1 xac nhan duy nhat tu Kho).
CREATE TABLE phieu_xuat_kho_log_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_xuat_kho_id TEXT NOT NULL REFERENCES phieu_xuat_kho(id),
    trang_thai        TEXT NOT NULL CHECK (trang_thai IN (
                          'Dang tao phieu', 'Cho ke toan', 'Da chot xong don xuat',
                          'Dang gui KTV', 'KTV da nhan', 'Ke toan huy', 'Hang tru kho', 'Kho da ket thuc',
                          'Kho da nhan hang tra'
                      )),
    nguoi_xu_ly       TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly        TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu           TEXT
);
INSERT INTO phieu_xuat_kho_log_new SELECT * FROM phieu_xuat_kho_log;
DROP TABLE phieu_xuat_kho_log;
ALTER TABLE phieu_xuat_kho_log_new RENAME TO phieu_xuat_kho_log;
CREATE INDEX idx_pxkl_id ON phieu_xuat_kho_log(phieu_xuat_kho_id);
