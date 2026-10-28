-- Migration 0102 (2026-10-28): HỎI ĐÁP TỰ ĐỘNG - "xây dựng cơ chế hỏi, đáp thắc mắc tự động trên app, khi KTV click vào mục hỏi sẽ hiện
-- các hướng dẫn, hình ảnh tự động đẩy lên drive và hiện ra trong câu trả lời".
-- Route: backend/src/routes/huongDan.ts (/api/huong-dan) + routes/hoiDap.ts. FE: components/hoiDap/HuongDan.tsx.
--
-- huong_dan = kho hướng dẫn / câu hỏi thường gặp do Mua hàng / Admin soạn (ảnh tải lên Google Drive, JSON array URL <= 10).
-- KTV mở khung hỏi đáp thấy ngay danh sách hướng dẫn; gõ câu hỏi -> gợi ý hướng dẫn khớp (lib/huongDan.ts, chấm điểm trên máy);
-- gửi câu hỏi -> hệ thống tự trả lời bằng hướng dẫn khớp nhất (tin 'he_thong' có huong_dan_ids).
CREATE TABLE huong_dan (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tieu_de         TEXT NOT NULL,
    noi_dung        TEXT NOT NULL DEFAULT '',
    anh             TEXT,                                -- JSON array URL anh Drive (<= 10)
    tu_khoa         TEXT,                                -- tu khoa / cach hoi khac, cach nhau dau phay (tang do khop goi y)
    nhom            TEXT,                                -- nhom hien thi (VD "Đặt hàng", "Chuyển tiền")
    stt             INTEGER NOT NULL DEFAULT 0,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    luot_xem        INTEGER NOT NULL DEFAULT 0,
    luot_huu_ich    INTEGER NOT NULL DEFAULT 0,          -- KTV bam "Đã giải đáp được" sau khi xem
    nguoi_tao       TEXT NOT NULL,
    ngay_tao        TEXT NOT NULL,
    nguoi_cap_nhat  TEXT,
    ngay_cap_nhat   TEXT NOT NULL
);
CREATE INDEX idx_huong_dan_bat ON huong_dan(bat_tat, stt);

-- Tin nhan hoi dap: anh dinh kem (JSON array URL Drive <= 5) + huong dan gui kem (JSON array id huong_dan - tra loi tu dong
-- cua he thong hoac Mua hang bam "Gửi hướng dẫn"). noi_dung van NOT NULL - tin chi co anh/huong dan luu ''.
ALTER TABLE hoi_dap_tin ADD COLUMN anh TEXT;
ALTER TABLE hoi_dap_tin ADD COLUMN huong_dan_ids TEXT;
