-- CHIET KHAU TINH CA PHIEU DANG MO (chot 2026-11-03, v1.434 - "khi KTV đặt linh kiện ở loại đề xuất cần chuyển tiền và được chiết khấu,
-- nếu hiện tại KTV có phiếu chờ chuyển tiền hoặc đơn đã chuyển tiền nhưng kế toán chưa chuyển sang trạng thái tạo xong đơn => thì cho phép
-- tính tổng tiền cả phiếu đó vào ... cần giải thích rõ lý do tại sao linh kiện này lại được giảm theo chiết khấu đó").
--
-- 1) phieu_xuat_kho.chot_ke_toan_luc = lan DAU phieu roi "Dang tao phieu"/"Cho ke toan" sang buoc Ke toan da chot xong don xuat tro di
--    (= da tao xong chung tu tren MISA). NULL = phieu con "mo" -> gia tri don trong phieu duoc cong vao moc chiet khau 200k/500k cua don moi
--    cua cung KTV (lib/pxkRecalculate.ts). Don tao TRUOC luc phieu chot van giu phan cong them do (chot_ke_toan_luc > ngay_tao don).
-- 2) dat_don_hang.ck_co_so = JSON "co so chiet khau" cua lan tinh gan nhat khi don con tinh lai duoc: {ma, moc, ngay, tong_ngay, phieu:[{id,
--    tong}], ly_do} - FE giai thich vi sao don duoc muc gia do; don trong phieu da KHOA tien (Ke toan da duyet tien / qua buoc tao phieu) dung
--    lai moc da luu thay vi tinh lai theo phieu moi phat sinh sau.

ALTER TABLE phieu_xuat_kho ADD COLUMN chot_ke_toan_luc TEXT;
ALTER TABLE dat_don_hang ADD COLUMN ck_co_so TEXT;

UPDATE phieu_xuat_kho
SET chot_ke_toan_luc = COALESCE(
  (SELECT MIN(l.ngay_xu_ly) FROM phieu_xuat_kho_log l
   WHERE l.phieu_xuat_kho_id = phieu_xuat_kho.id
     AND l.trang_thai IN ('Da chot xong don xuat', 'Hang tru kho', 'Dang gui KTV', 'KTV da nhan', 'Kho da ket thuc', 'Kho da nhan hang tra')),
  ngay_tao)
WHERE trang_thai_hien_tai NOT IN ('Dang tao phieu', 'Cho ke toan', 'Ke toan huy');

DROP TRIGGER IF EXISTS trg_pxk_chot_ke_toan_luc_u;
CREATE TRIGGER trg_pxk_chot_ke_toan_luc_u
AFTER UPDATE OF trang_thai_hien_tai ON phieu_xuat_kho
WHEN NEW.chot_ke_toan_luc IS NULL AND NEW.trang_thai_hien_tai NOT IN ('Dang tao phieu', 'Cho ke toan', 'Ke toan huy')
BEGIN
  UPDATE phieu_xuat_kho SET chot_ke_toan_luc = datetime('now', '+7 hours') WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_pxk_chot_ke_toan_luc_i;
CREATE TRIGGER trg_pxk_chot_ke_toan_luc_i
AFTER INSERT ON phieu_xuat_kho
WHEN NEW.chot_ke_toan_luc IS NULL AND NEW.trang_thai_hien_tai NOT IN ('Dang tao phieu', 'Cho ke toan', 'Ke toan huy')
BEGIN
  UPDATE phieu_xuat_kho SET chot_ke_toan_luc = datetime('now', '+7 hours') WHERE id = NEW.id;
END;

CREATE INDEX IF NOT EXISTS idx_pxk_nnh_chot_kt ON phieu_xuat_kho(nguoi_nhan_hang, chot_ke_toan_luc);
