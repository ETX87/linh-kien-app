-- Migration 0125: SLA tung buoc + ghi nhan QUA HAN / GIAI TRINH / GAN THE VI PHAM (2026-11-17, v1.517).
-- Yeu cau quan ly: "API: Trả hàng - Các ca quá hạn - giải trình liên quan; Đặt linh kiện - Các ca quá hạn; Các ca bị gắn thẻ vi phạm"
-- + "Đặt SLA từng bước" + chot "triển khai theo hướng mở để đối tác tự kéo, chúng ta cung cấp api là đc".
-- Dinh nghia buoc (trang thai nao, bo phan nao, bang log nao) nam trong code: backend/src/lib/viPham.ts (BUOC_VI_PHAM).
-- Bang nay CHI giu phan Admin cau hinh duoc.

CREATE TABLE sla_buoc (
  ma              TEXT PRIMARY KEY,           -- = BUOC_VI_PHAM[].ma
  so_gio          INTEGER NOT NULL DEFAULT 24 CHECK (so_gio BETWEEN 1 AND 2160),  -- han xu ly (gio) tinh tu luc vao buoc
  gio_giai_trinh  INTEGER NOT NULL DEFAULT 24 CHECK (gio_giai_trinh BETWEEN 1 AND 720), -- qua han bao lau ma chua giai trinh thi gan the
  tinh_cuoi_tuan  INTEGER NOT NULL DEFAULT 0, -- 0 = han roi vao T7/CN thi day sang thu 2 (cung quy tac tinhHanLyDoCham)
  bat_tat         INTEGER NOT NULL DEFAULT 1,
  cap_nhat_luc    TEXT,
  cap_nhat_boi    TEXT
);

INSERT INTO sla_buoc (ma, so_gio, gio_giai_trinh) VALUES
  ('tbp_xac_nhan', 24, 24),
  ('gs_duyet', 24, 24),
  ('tn_duyet', 24, 24),
  ('kho_thieu', 24, 24),
  ('mua_hang_dat', 48, 24),
  ('kt_duyet_tien', 24, 24),
  ('kt_chot_phieu', 24, 24),
  ('kho_xuat', 24, 24),
  ('th_ke_toan', 24, 24),
  ('th_kho', 24, 24),
  ('th_qc', 24, 24),
  ('th_tn', 24, 24);

-- 1 dong = 1 lan 1 thuc the (don / ticket thieu hang / phieu xuat) nam o 1 buoc QUA HAN. Khoa tu nhien (buoc, doi_tuong_id, moc_vao):
-- quet lai nhieu lan khong sinh trung. Gio luu chuoi VN "YYYY-MM-DD HH:MM:SS" nhu toan he thong.
CREATE TABLE vi_pham (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  buoc               TEXT NOT NULL,
  loai               TEXT NOT NULL CHECK (loai IN ('dat_hang', 'tra_hang')),
  bo_phan            TEXT NOT NULL,           -- tbp | gs | tn | kho | mua_hang | ke_toan | qc
  doi_tuong          TEXT NOT NULL CHECK (doi_tuong IN ('don', 'ticket', 'phieu')),
  doi_tuong_id       TEXT NOT NULL,           -- DDH-… | TLK-… | PMH-/PCN-/PTL-…
  dat_don_hang_id    TEXT,                    -- don goc (don / ticket); NULL voi phieu
  phieu_xuat_kho_id  TEXT,
  khu_vuc_ma         TEXT,
  nguoi_nhan_hang    TEXT,
  moc_vao            TEXT NOT NULL,           -- luc vao buoc
  so_gio_sla         INTEGER NOT NULL,        -- anh chup cau hinh luc ghi nhan (doi cau hinh sau khong doi lich su)
  han                TEXT NOT NULL,
  ket_thuc_luc       TEXT,                    -- luc roi buoc (NULL = van dang cho)
  trang_thai_sau     TEXT,                    -- trang thai luc roi buoc
  nguoi_xu_ly        TEXT,                    -- nguoi lam thuc the roi buoc
  trang_thai         TEXT NOT NULL DEFAULT 'Cho giai trinh'
                     CHECK (trang_thai IN ('Cho giai trinh', 'Da giai trinh', 'Gan the', 'Da go the')),
  han_giai_trinh     TEXT NOT NULL,
  giai_trinh         TEXT,
  nguoi_giai_trinh   TEXT,
  giai_trinh_luc     TEXT,
  giai_trinh_tu_dong INTEGER NOT NULL DEFAULT 0, -- 1 = lay tu ly do cham / giai trinh co san (khong nhap o man vi pham)
  gan_the_luc        TEXT,
  go_the_ly_do       TEXT,
  go_the_boi         TEXT,
  go_the_luc         TEXT,
  tao_luc            TEXT NOT NULL,
  cap_nhat_luc       TEXT NOT NULL,           -- doi moi khi bat ky truong nao doi -> con tro cho API doi tac
  UNIQUE (buoc, doi_tuong_id, moc_vao)
);
CREATE INDEX idx_vi_pham_cap_nhat ON vi_pham(cap_nhat_luc, id);
CREATE INDEX idx_vi_pham_trang_thai ON vi_pham(trang_thai, bo_phan);
CREATE INDEX idx_vi_pham_don ON vi_pham(dat_don_hang_id);
CREATE INDEX idx_vi_pham_phieu ON vi_pham(phieu_xuat_kho_id);

-- Moc quet: id log / khoan lon nhat da xu ly cua tung nguon. NULL lan dau -> chi lay moc hien tai (KHONG quet nguoc lich su).
CREATE TABLE vi_pham_quet (
  nguon        TEXT PRIMARY KEY,
  id_cuoi      INTEGER,
  quet_luc     TEXT
);
