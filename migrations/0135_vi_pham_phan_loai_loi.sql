-- v1.548 (2026-11-21): giai trinh qua han them "phan loai loi" + bang chung.
-- Yeu cau: "khi giải trình sẽ thêm lựa chọn: 1. Sau khi giải trình bắt lỗi: lỗi nội bộ, lỗi đối tác, lỗi của tôi, khác
--  2. Bằng chứng của việc giải trình nếu không phải lỗi của bản thân".
-- phan_loai_loi: 'noi_bo' | 'doi_tac' | 'cua_toi' | 'khac' (NULL = ca cu / giai trinh tu dong). Kiem tra gia tri o API (routes/viPham.ts).
-- bang_chung: JSON array URL anh Drive (1..5), BAT BUOC khi phan_loai_loi khac 'cua_toi'.
ALTER TABLE vi_pham ADD COLUMN phan_loai_loi TEXT;
ALTER TABLE vi_pham ADD COLUMN bang_chung TEXT;
