-- KET QUA DOC SO TIEN TREN ANH CHUYEN KHOAN - dung chung moi may (2026-09-30, phan hoi "đã đọc thành công rồi thì đẩy lên
-- server để lần sau đỡ phải đọc lại"). OCR van chay tren trinh duyet (frontend/src/lib/docTienAnh.ts); may nao doc xong 1 anh
-- thi ghi vao day theo URL anh, may khac mo lai lay thang, KHONG doc lai. `phien_ban` = phien ban bo nhan dang (PHIEN_BAN_OCR
-- o frontend): tang phien ban khi sua bo doc -> ket qua cu bi bo qua, may dau tien mo anh doc lai + ghi de.
-- so_tien NULL = da doc xong nhung khong xac dinh duoc so (loi mang/CORS thi KHONG ghi).
CREATE TABLE IF NOT EXISTS ocr_anh_tien (
  url TEXT PRIMARY KEY,
  so_tien INTEGER,
  phien_ban INTEGER NOT NULL,
  nguoi_doc TEXT,
  doc_luc TEXT NOT NULL
);
