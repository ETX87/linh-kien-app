-- "Công nợ 0 đồng" (chot 2026-10-05): Ke toan khai bao danh sach ma LK + SL ho tro (cho MOI KTV ap dung) trong khoang
-- ngay [tu_ngay, den_ngay] (ngay VN, 'YYYY-MM-DD', tinh ca 2 dau) cho 1 / nhieu / toan bo KTV. Trong khoang do, KTV co ton
-- (ktv_ton_kho.cuoi_ky) ma LK nay thi MIN(ton, tong SL ho tro) chiec tinh cong no = 0, phan con lai tinh binh thuong -
-- xem SL_HO_TRO_0D_SQL o backend/src/lib/congNoKtv.ts (tinh truc tiep moi lan, khong luu ket qua).
CREATE TABLE IF NOT EXISTS cong_no_0d (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ten TEXT,
  tu_ngay TEXT NOT NULL,
  den_ngay TEXT NOT NULL,
  -- 1 = ap dung MOI KTV (ke ca KTV them sau), bo qua cong_no_0d_ktv.
  tat_ca_ktv INTEGER NOT NULL DEFAULT 0,
  bat_tat INTEGER NOT NULL DEFAULT 1,
  nguoi_tao TEXT,
  ngay_tao TEXT,
  nguoi_cap_nhat TEXT,
  ngay_cap_nhat TEXT,
  CHECK (tu_ngay <= den_ngay)
);

CREATE TABLE IF NOT EXISTS cong_no_0d_lk (
  cong_no_0d_id INTEGER NOT NULL REFERENCES cong_no_0d(id) ON DELETE CASCADE,
  ma_linh_kien TEXT NOT NULL,
  so_luong INTEGER NOT NULL CHECK (so_luong > 0),
  PRIMARY KEY (cong_no_0d_id, ma_linh_kien)
);
CREATE INDEX IF NOT EXISTS idx_cong_no_0d_lk_ma ON cong_no_0d_lk(ma_linh_kien);

CREATE TABLE IF NOT EXISTS cong_no_0d_ktv (
  cong_no_0d_id INTEGER NOT NULL REFERENCES cong_no_0d(id) ON DELETE CASCADE,
  ma_ktv TEXT NOT NULL,
  PRIMARY KEY (cong_no_0d_id, ma_ktv)
);
CREATE INDEX IF NOT EXISTS idx_cong_no_0d_ktv_ma ON cong_no_0d_ktv(ma_ktv);
