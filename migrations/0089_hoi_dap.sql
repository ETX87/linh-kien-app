-- Migration 0089 (2026-10-17): HỎI ĐÁP KTV ↔ MUA HÀNG - "cần bổ sung thêm 1 công cụ trao đổi thắc mắc qua lại giữa KTV và nhân viên mua
-- hàng. Nhân viên sẽ hỏi giá hoặc hỏi ngày hàng về => tạo 1 icon chat ở góc bên phải góc dưới ... Mỗi phiên chat sẽ tạo 1 ticket theo dõi
-- và gửi cho nhân viên mua hàng tiếp nhận và giải đáp => kết quả là "Chờ tiếp nhận", Đang xử lý", "Đã xử lý", "Hủy bỏ", "Từ chối"".
-- Route: backend/src/routes/hoiDap.ts (/api/hoi-dap). FE: frontend/src/components/hoiDap/HoiDapWidget.tsx.
CREATE TABLE hoi_dap (
    id            TEXT PRIMARY KEY,                       -- HD-000001 (nextSequentialId 'hoi_dap')
    nguoi_hoi     TEXT NOT NULL REFERENCES users(email),
    loai          TEXT NOT NULL CHECK (loai IN ('hoi_gia', 'hoi_ngay_ve', 'khac')),
    ma_lk         TEXT,                                   -- tuy chon: ma linh kien dang hoi
    ma_don        TEXT,                                   -- tuy chon: ma don / ma phieu lien quan (chu tu do)
    tieu_de       TEXT NOT NULL,                          -- doan dau cau hoi (hien o danh sach)
    trang_thai    TEXT NOT NULL DEFAULT 'Cho tiep nhan'
                  CHECK (trang_thai IN ('Cho tiep nhan', 'Dang xu ly', 'Da xu ly', 'Huy bo', 'Tu choi')),
    nguoi_xu_ly   TEXT,                                   -- nhan vien Mua hang da tiep nhan
    ly_do         TEXT,                                   -- ly do Tu choi / Huy bo
    ngay_tao      TEXT NOT NULL,
    cap_nhat_luc  TEXT NOT NULL,
    tin_cuoi_luc  TEXT NOT NULL,                          -- thoi diem tin nhan moi nhat (sap xep + tin chua doc)
    tin_cuoi_tu   TEXT NOT NULL CHECK (tin_cuoi_tu IN ('hoi', 'xu_ly')),
    doc_hoi_luc   TEXT,                                   -- nguoi hoi doc lan cuoi
    doc_xu_ly_luc TEXT                                    -- phia Mua hang doc lan cuoi
);
CREATE INDEX idx_hoi_dap_nguoi_hoi ON hoi_dap(nguoi_hoi, tin_cuoi_luc);
CREATE INDEX idx_hoi_dap_trang_thai ON hoi_dap(trang_thai, tin_cuoi_luc);

CREATE TABLE hoi_dap_tin (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    hoi_dap_id TEXT NOT NULL REFERENCES hoi_dap(id),
    nguoi_gui  TEXT NOT NULL,
    phia       TEXT NOT NULL CHECK (phia IN ('hoi', 'xu_ly', 'he_thong')),  -- he_thong = dong bao doi trang thai
    noi_dung   TEXT NOT NULL,
    ngay_tao   TEXT NOT NULL
);
CREATE INDEX idx_hoi_dap_tin_ticket ON hoi_dap_tin(hoi_dap_id, id);

INSERT INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES ('hoi_dap', 0);
