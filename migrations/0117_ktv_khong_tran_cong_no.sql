-- Migration 0117 (2026-11-12, v1.484): KTV "Không có trần công nợ".
-- Yeu cau: "1 số KTV không có trần công nợ, cho phép KT, TN set up trong mục ds KTV mục trần công nợ thêm dạng KTV không có
-- trần công nợ => khi đặt hàng sẽ không phải chờ TBP duyệt trần nữa."
-- Co = 1 -> danhGiaPhieu (lib/tuDongDuyet.ts) KHONG doi chieu tran (giong nguoi nhan la GS): don cong no khong vao "Cho GS duyet",
-- TBP duyet don dac thu khong doi ma EO, man Cong no danh gia "Binh thuong". Ke toan / TN / Admin bat-tat o Danh sach KTV.
ALTER TABLE ktv_lien_he ADD COLUMN khong_tran_cong_no INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ktv_lien_he ADD COLUMN khong_tran_cong_no_luc TEXT;
ALTER TABLE ktv_lien_he ADD COLUMN khong_tran_cong_no_boi TEXT;
