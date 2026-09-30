-- TIEN DA THANH TOAN MANG THEO DON (2026-09-30, phan hoi "phiếu hàng đã thanh toán nhưng tác nghiệp muốn bỏ bớt 1 đơn
-- khỏi phiếu => 2 lựa chọn: đơn chưa thanh toán (tiền đã thanh toán của đơn = 0) / đã thanh toán (giữ tiền, đẩy về chờ
-- tạo phiếu xuất) => từng đơn đều gắn với tiền thật").
-- TN bo don khoi phieu da co tien + chon "Đã thanh toán": phan tien cua dong (toi da phieu da tra) RUT khoi
-- phieu_xuat_kho.da_thanh_toan va nam o don (tien_da_tra) thay vi hoan ve quy. Don vao phieu moi -> tien chuyen sang
-- da_thanh_toan cua phieu moi (routes/phieuXuatKho.ts, lib/pxkAutoBundle.ts - lenhNhanTienDaTraDon), canBangPxk lo phan con lai.
ALTER TABLE dat_don_hang ADD COLUMN tien_da_tra INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dat_don_hang ADD COLUMN tien_da_tra_email TEXT;   -- chu quy cua tien (= nguoi nhan hang cua phieu cu)
ALTER TABLE dat_don_hang ADD COLUMN tien_da_tra_pxk TEXT;     -- phieu da tra tien cho don (hien thi)

-- Don dang mang tien ma bi tu choi/huy, doi nguoi nhan hang, hoac doi sang Tra hang -> tien ve QUY cua chu tien (moi
-- duong ghi, khong can nho goi trong code). Chi UPDATE OF 3 cot nay nen lenh xoa tien_da_tra ben trong khong tu kich lai.
CREATE TRIGGER IF NOT EXISTS trg_ddh_hoan_tien_da_tra
AFTER UPDATE OF trang_thai_hien_tai, nguoi_nhan_hang, loai_don ON dat_don_hang
WHEN OLD.tien_da_tra > 0 AND OLD.tien_da_tra_email IS NOT NULL AND (
  NEW.trang_thai_hien_tai IN ('TN tu choi', 'Tu choi', 'Da huy')
  OR NEW.nguoi_nhan_hang IS NOT OLD.nguoi_nhan_hang
  OR NEW.loai_don = 'tra_hang'
)
BEGIN
  INSERT OR IGNORE INTO quy_ktv (email, so_du, cap_nhat_luc) VALUES (OLD.tien_da_tra_email, 0, datetime('now', '+7 hours'));
  UPDATE quy_ktv SET so_du = so_du + OLD.tien_da_tra, cap_nhat_luc = datetime('now', '+7 hours') WHERE email = OLD.tien_da_tra_email;
  INSERT INTO quy_ktv_giao_dich (email, loai, so_tien, so_du_sau, phieu_xuat_kho_id, khoan_chuyen_tien_id, ghi_chu, nguoi_tao, ngay_tao)
    SELECT OLD.tien_da_tra_email, 'hoan_phieu', OLD.tien_da_tra, so_du, OLD.tien_da_tra_pxk, NULL,
           'Hoàn tiền đã thanh toán của đơn ' || OLD.id || ' (' || COALESCE(OLD.ma_lk, '') || ') — đơn không còn cần xuất',
           'he-thong', datetime('now', '+7 hours')
    FROM quy_ktv WHERE email = OLD.tien_da_tra_email;
  UPDATE dat_don_hang SET tien_da_tra = 0, tien_da_tra_email = NULL, tien_da_tra_pxk = NULL WHERE id = NEW.id;
END;
