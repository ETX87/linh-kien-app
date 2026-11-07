-- 2026-11-07 (v1.455): YEU CAU HUY DON can bo phan dang xu ly dong y. Yeu cau nguoi dung: "Cho phép KTV, GS hủy bỏ đơn chưa xuất
-- tuy nhiên sẽ cần sự đồng ý từ bộ phận đang xử lý đơn đó (KHO nếu kho đã xác nhận chờ hàng, mua hàng nếu mua hàng đã xác nhận đặt
-- hàng, kế toán nếu kế toán đã lên mã đơn hàng hoặc misa), nếu kế toán duyệt tiền thì KTV vẫn hủy được, tiền trả về quỹ".
-- Giai doan khong anh huong ai -> huy ngay (khong ghi bang nay). Can dong y -> 1 dong "Cho dong y" (toi da 1 yeu cau mo / don),
-- bo phan duyet -> he thong huy that (lib/yeuCauHuy.ts + POST /dat-mua-lk/yeu-cau-huy/:id/xu-ly).
CREATE TABLE IF NOT EXISTS yeu_cau_huy_don (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dat_don_hang_id TEXT NOT NULL REFERENCES dat_don_hang(id),
  nguoi_yeu_cau TEXT NOT NULL,
  ly_do TEXT NOT NULL,
  bo_phan TEXT NOT NULL CHECK (bo_phan IN ('kho', 'mua_hang', 'ke_toan')),
  giai_doan TEXT,
  pxk_id TEXT,
  trang_thai TEXT NOT NULL DEFAULT 'Cho dong y' CHECK (trang_thai IN ('Cho dong y', 'Da dong y', 'Tu choi', 'Da rut')),
  ngay_tao TEXT NOT NULL,
  nguoi_xu_ly TEXT,
  ngay_xu_ly TEXT,
  ghi_chu_xu_ly TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ycHuy_mo ON yeu_cau_huy_don(dat_don_hang_id) WHERE trang_thai = 'Cho dong y';
CREATE INDEX IF NOT EXISTS idx_ycHuy_trang_thai ON yeu_cau_huy_don(trang_thai, bo_phan);
