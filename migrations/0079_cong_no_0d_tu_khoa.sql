-- "Công nợ 0 đồng" theo TU KHOA (chot 2026-10-14, phan hoi "bổ sung lựa chọn danh sách linh kiện hàng loạt = nếu linh kiện đó có
-- chứa ký tự tùy chỉnh ví dụ BH004 hoặc BH024 ... tự động lập danh sách và bổ sung khi có linh kiện mới phù hợp, có thể tắt hoặc bật
-- từng mã sai"). Moi chuong trinh co them danh sach tu khoa (+ SL ho tro / KTV); LK co MA (hoac ca TEN neu khop_ten = 1) chua tu khoa
-- (khong phan biet hoa/thuong ASCII) duoc DUA SAN vao cong_no_0d_lk (tu_khoa_id = tu khoa sinh ra dong) - SL_HO_TRO_0D_SQL chi doc
-- cong_no_0d_lk nen cong thuc cong no khong doi, chi them dieu kien bat_tat = 1. Tat 1 ma sai = bat_tat = 0 (giu dong de trigger
-- khong tu bat lai). LK MOI / doi ma / doi ten khop tu khoa -> TRIGGER ben duoi tu them (INSERT OR IGNORE: ma da co trong chuong trinh,
-- ke ca dong nhap tay hoac dong da tat, giu nguyen). Dong chuyen huong 'Da doi ma' khong tinh.
ALTER TABLE cong_no_0d_lk ADD COLUMN tu_khoa_id INTEGER;
ALTER TABLE cong_no_0d_lk ADD COLUMN bat_tat INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS cong_no_0d_tu_khoa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cong_no_0d_id INTEGER NOT NULL REFERENCES cong_no_0d(id) ON DELETE CASCADE,
  tu_khoa TEXT NOT NULL,
  khop_ten INTEGER NOT NULL DEFAULT 0,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  UNIQUE (cong_no_0d_id, tu_khoa)
);

CREATE TRIGGER IF NOT EXISTS trg_cong_no_0d_tu_khoa_lk_i AFTER INSERT ON linh_kien
WHEN COALESCE(NEW.trang_thai_ma, '') <> 'Da doi ma'
BEGIN
  INSERT OR IGNORE INTO cong_no_0d_lk (cong_no_0d_id, ma_linh_kien, so_luong, tu_khoa_id, bat_tat)
  SELECT k.cong_no_0d_id, NEW.ma_linh_kien, k.so_luong, k.id, 1
  FROM cong_no_0d_tu_khoa k
  WHERE instr(UPPER(NEW.ma_linh_kien), UPPER(k.tu_khoa)) > 0
     OR (k.khop_ten = 1 AND instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), UPPER(k.tu_khoa)) > 0)
  ORDER BY k.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_cong_no_0d_tu_khoa_lk_u AFTER UPDATE OF ma_linh_kien, ten_linh_kien, trang_thai_ma ON linh_kien
WHEN COALESCE(NEW.trang_thai_ma, '') <> 'Da doi ma'
BEGIN
  INSERT OR IGNORE INTO cong_no_0d_lk (cong_no_0d_id, ma_linh_kien, so_luong, tu_khoa_id, bat_tat)
  SELECT k.cong_no_0d_id, NEW.ma_linh_kien, k.so_luong, k.id, 1
  FROM cong_no_0d_tu_khoa k
  WHERE instr(UPPER(NEW.ma_linh_kien), UPPER(k.tu_khoa)) > 0
     OR (k.khop_ten = 1 AND instr(UPPER(COALESCE(NEW.ten_linh_kien, '')), UPPER(k.tu_khoa)) > 0)
  ORDER BY k.id;
END;
