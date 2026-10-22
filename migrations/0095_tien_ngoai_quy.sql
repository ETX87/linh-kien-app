-- KHOAN TIEN NGOAI VAO QUY KTV (chot 2026-10-22, "cho phép kế toán tự thêm khoản tiền chuyển ngoài cho KTV (tạo thủ công hoặc
-- import hàng loạt ...) ví dụ đầu tháng sẽ có 1 khoản tiền KTV bị trừ lương, kế toán sẽ import danh sách các ktv bị trừ lương +
-- khoản tiền bị trừ tạo thành quỹ để dùng khi ktv sau này đặt hàng").
-- Moi dong = 1 khoan Ke toan ghi vao quy cua 1 nguoi nhan hang (Ve tinh -> quy cua Tram), khong gan phieu xuat nao. So quy ghi
-- giao dich loai 'dieu_chinh' (khong rebuild CHECK cua quy_ktv_giao_dich) kem cot moi khoan_tien_ngoai_id de hien nhan rieng.
-- lo_id: ma lo client sinh cho moi lan gui (chong bam 2 lan / gui lai cung lo -> ghi trung tien).
CREATE TABLE khoan_tien_ngoai (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT NOT NULL,              -- chu quy (nguoi nhan hang; Ve tinh = Tram)
    ma_ktv       TEXT,                       -- ma KTV da chon luc ghi (de doi chieu)
    ma_trong_file TEXT,                      -- ma nguoi import go trong file (Ma MISA / Ma KTV) - doi chieu sau nay
    so_tien      INTEGER NOT NULL CHECK (so_tien > 0),
    noi_dung     TEXT NOT NULL,              -- vd "Trừ lương T10/2026"
    ngay_chung_tu TEXT,                      -- YYYY-MM-DD (tuy chon)
    nguon        TEXT NOT NULL,              -- 'thu_cong' | 'import'
    ten_file     TEXT,
    lo_id        TEXT NOT NULL,
    trang_thai   TEXT NOT NULL DEFAULT 'Da ghi' CHECK (trang_thai IN ('Da ghi', 'Da huy')),
    nguoi_tao    TEXT NOT NULL,
    ngay_tao     TEXT NOT NULL,
    huy_boi      TEXT,
    huy_luc      TEXT,
    ly_do_huy    TEXT
);
CREATE INDEX idx_ktn_email ON khoan_tien_ngoai(email, id);
CREATE INDEX idx_ktn_lo ON khoan_tien_ngoai(lo_id);
CREATE INDEX idx_ktn_ngay ON khoan_tien_ngoai(ngay_tao);

ALTER TABLE quy_ktv_giao_dich ADD COLUMN khoan_tien_ngoai_id INTEGER;
