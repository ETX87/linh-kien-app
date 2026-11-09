-- "KHÁCH HÀNG ĐÃ CHUYỂN KHOẢN VỀ CÔNG TY" (2026-11-09). Don co yeu cau hoa don ma KH tu chuyen tien ve cong ty: tien Ke toan xac nhan
-- KHONG vao quy du cua KTV ma vao "Quỹ xuất hóa đơn do KH chuyển" CUA KTV DO (nguoi nhan hang), va don co tich nay CHI tieu tien
-- trong quy nay. Huy / tu choi -> tien ve lai quy KH.
--
-- Thiet ke (lib/quyKhoa.ts): quy KH dung CHUNG bang quy_ktv / quy_ktv_giao_dich voi KHOA rieng 'khhd:<email nguoi nhan>' -> cung
-- CHECK so_du >= 0, cung CAS chong ghi dua, cung so quy chi ghi them; nhung 2 so du khong bao gio tron. Phieu xuat kho mang co quy_kh
-- va CHI chua don cung co (trigger duoi) -> moi lan tru / hoan cua phieu tu di dung quy. Tien don mang theo (dat_don_hang.
-- tien_da_tra_email) luu chinh khoa quy -> trigger hoan tien trg_ddh_hoan_tien_da_tra tu tra ve dung quy, khong can sua trigger.

ALTER TABLE dat_don_hang ADD COLUMN kh_chuyen_khoan INTEGER NOT NULL DEFAULT 0;
ALTER TABLE phieu_xuat_kho ADD COLUMN quy_kh INTEGER NOT NULL DEFAULT 0;

-- 1 phieu = 1 quy: chan moi duong dua don sai quy vao phieu (tu gom, tao tay, them dong, chuyen don, tach don...).
CREATE TRIGGER IF NOT EXISTS trg_pxk_dong_quy_kh
BEFORE INSERT ON phieu_xuat_kho_dong
WHEN COALESCE((SELECT kh_chuyen_khoan FROM dat_don_hang WHERE id = NEW.dat_don_hang_id), 0)
  <> COALESCE((SELECT quy_kh FROM phieu_xuat_kho WHERE id = NEW.phieu_xuat_kho_id), 0)
BEGIN
  SELECT RAISE(ABORT, 'DON_KH_CHUYEN_KHOAN_KHAC_PHIEU');
END;

-- Doi co tren don dang giu tien / dang nam trong phieu con hieu luc = tien lech quy -> chan o tang du lieu.
CREATE TRIGGER IF NOT EXISTS trg_ddh_kh_chuyen_khoan_khoa
BEFORE UPDATE OF kh_chuyen_khoan ON dat_don_hang
WHEN OLD.kh_chuyen_khoan IS NOT NEW.kh_chuyen_khoan AND (
  COALESCE(OLD.tien_da_tra, 0) > 0
  OR EXISTS (SELECT 1 FROM phieu_xuat_kho_dong d JOIN phieu_xuat_kho p ON p.id = d.phieu_xuat_kho_id
             WHERE d.dat_don_hang_id = OLD.id AND p.trang_thai_hien_tai != 'Ke toan huy')
)
BEGIN
  SELECT RAISE(ABORT, 'KH_CHUYEN_KHOAN_KHONG_DOI_DUOC');
END;
