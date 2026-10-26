-- Tab "Han muc du tru" trong Danh sach KTV (chot 2026-10-26): "bổ sung thêm 1 tab 'Hạn mức dữ trữ' trong danh sách KTV cho phép kế toán
-- import, chỉnh sửa, tắt/bật. gồm các cột: ID Misa, 'Hạn mức dự phòng hiện tại', 'Hạn mức dự phòng'. Dữ liệu này sẽ kết nối đến danh sách
-- KTV thay thế vào cột ... (2 cột này sẽ không cho chỉnh sửa mà sẽ kéo về từ tab 'Hạn mức dữ trữ')".
-- Bang han_muc_du_tru (khoa = Ma MISA, NOCASE) la NGUON DUY NHAT. ktv_lien_he.han_muc_du_phong / _hien_tai / _cap_nhat_luc thanh cot DAN
-- XUAT: trigger do gia tri cua dong cung Ma MISA (dong TAT hoac khong co dong = NULL) sang MOI ma KTV co Ma MISA do, va ep lai neu co
-- duong ghi cu nao sua thang 2 cot nay (doc nhu cu o lib/duPhongKtv.ts, danh sach KTV, /cong-no-du-kien).
CREATE TABLE IF NOT EXISTS han_muc_du_tru (
  ma_misa TEXT PRIMARY KEY COLLATE NOCASE,
  han_muc_du_phong REAL,
  han_muc_du_phong_hien_tai REAL,
  bat_tat INTEGER NOT NULL DEFAULT 1,
  ghi_chu TEXT,
  ngay_tao TEXT,
  cap_nhat_luc TEXT,
  cap_nhat_boi TEXT
);

-- Chuyen du lieu dang co tren KTV (moi Ma MISA 1 dong; KTV khong co Ma MISA thi bo - luc chuyen chi 1 dong rac, gia tri 0).
INSERT OR IGNORE INTO han_muc_du_tru (ma_misa, han_muc_du_phong, han_muc_du_phong_hien_tai, bat_tat, ghi_chu, ngay_tao, cap_nhat_luc, cap_nhat_boi)
SELECT TRIM(MIN(ma_misa)), MAX(han_muc_du_phong), MAX(han_muc_du_phong_hien_tai), 1, 'Chuyen tu danh sach KTV (migration 0098)',
       strftime('%Y-%m-%d %H:%M:%S', 'now', '+7 hours'), MAX(han_muc_du_phong_cap_nhat_luc), 'migration 0098'
FROM ktv_lien_he
WHERE COALESCE(TRIM(ma_misa), '') <> '' AND (han_muc_du_phong IS NOT NULL OR han_muc_du_phong_hien_tai IS NOT NULL)
GROUP BY UPPER(TRIM(ma_misa));

-- Bang -> KTV (them / sua / doi Ma MISA / xoa dong).
CREATE TRIGGER IF NOT EXISTS trg_han_muc_du_tru_i AFTER INSERT ON han_muc_du_tru
BEGIN
  UPDATE ktv_lien_he SET
    han_muc_du_phong = CASE WHEN NEW.bat_tat = 1 THEN NEW.han_muc_du_phong END,
    han_muc_du_phong_hien_tai = CASE WHEN NEW.bat_tat = 1 THEN NEW.han_muc_du_phong_hien_tai END,
    han_muc_du_phong_cap_nhat_luc = NEW.cap_nhat_luc
  WHERE UPPER(TRIM(ma_misa)) = UPPER(NEW.ma_misa);
END;

CREATE TRIGGER IF NOT EXISTS trg_han_muc_du_tru_u AFTER UPDATE ON han_muc_du_tru
BEGIN
  UPDATE ktv_lien_he SET han_muc_du_phong = NULL, han_muc_du_phong_hien_tai = NULL, han_muc_du_phong_cap_nhat_luc = NULL
  WHERE UPPER(TRIM(ma_misa)) = UPPER(OLD.ma_misa) AND UPPER(OLD.ma_misa) <> UPPER(NEW.ma_misa);
  UPDATE ktv_lien_he SET
    han_muc_du_phong = CASE WHEN NEW.bat_tat = 1 THEN NEW.han_muc_du_phong END,
    han_muc_du_phong_hien_tai = CASE WHEN NEW.bat_tat = 1 THEN NEW.han_muc_du_phong_hien_tai END,
    han_muc_du_phong_cap_nhat_luc = NEW.cap_nhat_luc
  WHERE UPPER(TRIM(ma_misa)) = UPPER(NEW.ma_misa);
END;

CREATE TRIGGER IF NOT EXISTS trg_han_muc_du_tru_d AFTER DELETE ON han_muc_du_tru
BEGIN
  UPDATE ktv_lien_he SET han_muc_du_phong = NULL, han_muc_du_phong_hien_tai = NULL, han_muc_du_phong_cap_nhat_luc = NULL
  WHERE UPPER(TRIM(ma_misa)) = UPPER(OLD.ma_misa);
END;

-- KTV -> lay lai tu bang: KTV moi / doi Ma MISA / duong ghi cu sua thang 2 cot (ep ve gia tri cua bang). WHEN so sanh de khong UPDATE thua.
CREATE TRIGGER IF NOT EXISTS trg_ktv_han_muc_du_tru_i AFTER INSERT ON ktv_lien_he
WHEN NEW.han_muc_du_phong IS NOT (SELECT CASE WHEN h.bat_tat = 1 THEN h.han_muc_du_phong END FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(NEW.ma_misa))
  OR NEW.han_muc_du_phong_hien_tai IS NOT (SELECT CASE WHEN h.bat_tat = 1 THEN h.han_muc_du_phong_hien_tai END FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(NEW.ma_misa))
BEGIN
  UPDATE ktv_lien_he SET
    han_muc_du_phong = (SELECT CASE WHEN h.bat_tat = 1 THEN h.han_muc_du_phong END FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(NEW.ma_misa)),
    han_muc_du_phong_hien_tai = (SELECT CASE WHEN h.bat_tat = 1 THEN h.han_muc_du_phong_hien_tai END FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(NEW.ma_misa)),
    han_muc_du_phong_cap_nhat_luc = (SELECT h.cap_nhat_luc FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(NEW.ma_misa))
  WHERE ma_ktv = NEW.ma_ktv;
END;

CREATE TRIGGER IF NOT EXISTS trg_ktv_han_muc_du_tru_u AFTER UPDATE OF ma_misa, han_muc_du_phong, han_muc_du_phong_hien_tai ON ktv_lien_he
WHEN NEW.han_muc_du_phong IS NOT (SELECT CASE WHEN h.bat_tat = 1 THEN h.han_muc_du_phong END FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(NEW.ma_misa))
  OR NEW.han_muc_du_phong_hien_tai IS NOT (SELECT CASE WHEN h.bat_tat = 1 THEN h.han_muc_du_phong_hien_tai END FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(NEW.ma_misa))
BEGIN
  UPDATE ktv_lien_he SET
    han_muc_du_phong = (SELECT CASE WHEN h.bat_tat = 1 THEN h.han_muc_du_phong END FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(NEW.ma_misa)),
    han_muc_du_phong_hien_tai = (SELECT CASE WHEN h.bat_tat = 1 THEN h.han_muc_du_phong_hien_tai END FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(NEW.ma_misa)),
    han_muc_du_phong_cap_nhat_luc = (SELECT h.cap_nhat_luc FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(NEW.ma_misa))
  WHERE ma_ktv = NEW.ma_ktv;
END;

-- Dong bo 1 lan cho moi KTV hien co (KTV khong co dong trong bang -> NULL).
UPDATE ktv_lien_he SET
  han_muc_du_phong = (SELECT CASE WHEN h.bat_tat = 1 THEN h.han_muc_du_phong END FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(ktv_lien_he.ma_misa)),
  han_muc_du_phong_hien_tai = (SELECT CASE WHEN h.bat_tat = 1 THEN h.han_muc_du_phong_hien_tai END FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(ktv_lien_he.ma_misa)),
  han_muc_du_phong_cap_nhat_luc = (SELECT h.cap_nhat_luc FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(ktv_lien_he.ma_misa))
WHERE han_muc_du_phong IS NOT NULL OR han_muc_du_phong_hien_tai IS NOT NULL OR han_muc_du_phong_cap_nhat_luc IS NOT NULL
   OR EXISTS (SELECT 1 FROM han_muc_du_tru h WHERE h.ma_misa = TRIM(ktv_lien_he.ma_misa));
