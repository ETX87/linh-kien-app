-- Migration 0051: SO TIEN TU DOC TREN ANH CHUYEN KHOAN (2026-09-30, phan hoi "nếu đã đọc lúc KTV load ảnh thì lưu số tiền
-- này lại đi kèm với mỗi ảnh, sau này không cần load lại ở bên máy kế toán"). Viec DOC chay tren trinh duyet
-- (frontend/src/lib/docTienAnh.ts) - server chi LUU ket qua. Chi de canh bao Ke toan, khong dung de tinh tien.
-- JSON object { "<url anh>": so_tien | null } (null = may KTV doc nhung khong xac dinh duoc so tien).

-- Anh dang dinh kem phieu (khop phieu_xuat_kho.bang_chung_chuyen_tien_anh) - ghi luc KTV bam "Đã chuyển".
ALTER TABLE phieu_xuat_kho ADD COLUMN bang_chung_tien_doc TEXT;

-- Ban chup luc Ke toan duyet/tu choi (cung luc voi khoan_chuyen_tien.anh) - modal "Sửa tiền" dung lai.
ALTER TABLE khoan_chuyen_tien ADD COLUMN tien_doc_anh TEXT;
