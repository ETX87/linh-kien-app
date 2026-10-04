-- Tu khoa tim kiem linh kien (chot 2026-10-04, "hỗ trợ tìm kiếm tốt hơn ... không tốn lượng đọc server, hỗ trợ trên máy
-- người dùng"). Bo tim chay tren may (frontend/src/lib/timLinhKien.ts); 2 bang nho nay tai 1 lan + cache tren may theo
-- domain md_lk_tu_khoa (TINH_QUERY "lk-tu-khoa"), chi tai lai khi co nguoi sua.
-- Bang RIENG thay vi cot moi trong linh_kien: sua tu khoa KHONG cham ngay_cap_nhat cua linh_kien (khong bi coi la thay doi
-- de day sang DVBH/suachua, khong lam cache danh muc tren may phai tai lai).

-- Tu khoa phu cua 1 linh kien (ten cu, ten goi thuong dung...) - tim theo nhu ten.
CREATE TABLE lk_tu_khoa (
    ma_linh_kien    TEXT PRIMARY KEY,
    tu_khoa         TEXT NOT NULL,
    nguoi_cap_nhat  TEXT,
    ngay_cap_nhat   TEXT NOT NULL
);

-- Nhom tu dong nghia: "bộ mạch, board, mainboard" - go 1 tu trong nhom tim ra ca cac tu con lai.
CREATE TABLE lk_dong_nghia (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nhom            TEXT NOT NULL,
    nguoi_cap_nhat  TEXT,
    ngay_cap_nhat   TEXT NOT NULL
);

INSERT OR IGNORE INTO data_versions (domain, version) VALUES ('md_lk_tu_khoa', 1);
CREATE TRIGGER IF NOT EXISTS trg_md_lk_tu_khoa_i AFTER INSERT ON lk_tu_khoa BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_tu_khoa'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_lk_tu_khoa_u AFTER UPDATE ON lk_tu_khoa BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_tu_khoa'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_lk_tu_khoa_d AFTER DELETE ON lk_tu_khoa BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_tu_khoa'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_lk_dong_nghia_i AFTER INSERT ON lk_dong_nghia BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_tu_khoa'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_lk_dong_nghia_u AFTER UPDATE ON lk_dong_nghia BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_tu_khoa'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_lk_dong_nghia_d AFTER DELETE ON lk_dong_nghia BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_lk_tu_khoa'; END;

-- Nhom mac dinh (chon tu tu vung danh muc that; bo cac tu trung nghia khi bo dau nhu "đèn/đen", "vòi/với").
INSERT INTO lk_dong_nghia (nhom, nguoi_cap_nhat, ngay_cap_nhat) VALUES
  ('bộ mạch, mạch, board, mainboard, main, pcb', 'he-thong', datetime('now', '+7 hours')),
  ('bơm, pump', 'he-thong', datetime('now', '+7 hours')),
  ('cảm biến, sensor', 'he-thong', datetime('now', '+7 hours')),
  ('nguồn, bộ nguồn, adapter', 'he-thong', datetime('now', '+7 hours')),
  ('van, valve', 'he-thong', datetime('now', '+7 hours')),
  ('động cơ, motor', 'he-thong', datetime('now', '+7 hours')),
  ('quạt, fan', 'he-thong', datetime('now', '+7 hours')),
  ('phao, float', 'he-thong', datetime('now', '+7 hours')),
  ('màng, màng lọc, membrane', 'he-thong', datetime('now', '+7 hours')),
  ('lõi, lõi lọc, filter, cartridge', 'he-thong', datetime('now', '+7 hours')),
  ('điều khiển, remote', 'he-thong', datetime('now', '+7 hours')),
  ('gioăng, ron, zoăng, joăng', 'he-thong', datetime('now', '+7 hours'));
