-- Migration 0029: "ETX nhân sự" - danh bạ nhân sự đồng bộ (PULL, 1 chiều) từ hệ ETX bên ngoài
-- (asia-southeast1-etx-nhan-su.cloudfunctions.net/hrApi, xem backend/src/lib/etxNhanSuClient.ts) -
-- CHỈ là bảng tham chiếu/quản lý thông tin, KHÔNG tự tạo tài khoản users (khác provisionPlaceholderUser
-- của ktv_lien_he). ma_chuc_danh/quan_ly_truc_tiep la mang/object tu API, luu JSON TEXT vi khong can
-- query quan he tren cac truong con (du lieu chi tham khao).
CREATE TABLE etx_nhan_su (
  ma_nhan_su          TEXT PRIMARY KEY,
  ho_ten              TEXT NOT NULL,
  chuc_danh           TEXT,
  ma_chuc_danh        TEXT,        -- JSON array (string[])
  gmail               TEXT,
  trang_thai_lam_viec TEXT NOT NULL, -- 'on' | 'off'
  tai_khoan_lada_ma   TEXT,
  tai_khoan_lada_ten  TEXT,
  quan_ly_truc_tiep   TEXT,        -- JSON array cua {maNhanSu,hoTen,gmail,chucDanhCuaToi}
  -- Admin nhap tay, tham chieu ktv_lien_he.ma_ktv - KHONG FK (giong tinh than ma_misa o ktv_lien_he,
  -- Admin co the go sai/tro toi ma chua ton tai, khong duoc chan ghi). Dung de cascade khoa/mo khoa
  -- users.bi_khoa khi trang_thai_lam_viec doi - xem lib/etxNhanSuSync.ts. Sync KHONG BAO GIO ghi de
  -- cot nay, chi route PATCH /:maNhanSu/ma-ktv rieng moi sua.
  ma_ktv              TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX idx_etx_nhan_su_ma_ktv ON etx_nhan_su(ma_ktv);

-- Trang thai lan dong bo PULL gan nhat - cung khuon gia88_sync_state (migration 0027). Seed san
-- dong id=1 (bai hoc lib/idCounter.ts: bang kieu con tro/trang thai PHAI tu seed).
CREATE TABLE etx_nhan_su_sync_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  last_run_at   TEXT,
  last_status   TEXT,   -- 'ok' | 'error'
  changed_count INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT
);
INSERT INTO etx_nhan_su_sync_state (id) VALUES (1);
