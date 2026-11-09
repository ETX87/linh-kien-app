-- Nhat ky thay doi QUYEN tai khoan (ra soat bao mat 2026-11-09): truoc day PATCH /api/users/:email ghi de co vai tro / khoa /
-- duyet ma khong luu lich su -> khong tra loi duoc "ai cap quyen Ke toan / Admin cho X, luc nao" khi nghi bi chiem quyen.
-- Ghi bang TRIGGER de bat MOI duong ghi (Admin sua, tu kich hoat khi dang nhap, ETX tu tao / khoa, bat-tat ma KTV...).
-- Nguoi thuc hien: route ghi kem users.quyen_sua_boi trong CUNG cau UPDATE; trigger doc roi xoa ngay (duong khac = 'he_thong').

ALTER TABLE users ADD COLUMN quyen_sua_boi TEXT;

CREATE TABLE IF NOT EXISTS users_quyen_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  hanh_dong TEXT NOT NULL,          -- 'sua' | 'tao' | 'them_gmail_phu' | 'go_gmail_phu'
  truoc TEXT,                       -- JSON
  sau TEXT,                         -- JSON
  nguoi_thuc_hien TEXT NOT NULL,
  luc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_quyen_log_email ON users_quyen_log(email, id);

CREATE TRIGGER IF NOT EXISTS trg_users_quyen_log_u AFTER UPDATE ON users
WHEN OLD.vai_tro IS NOT NEW.vai_tro OR OLD.trang_thai_duyet IS NOT NEW.trang_thai_duyet OR OLD.bi_khoa IS NOT NEW.bi_khoa
  OR OLD.la_ktv_dvbh IS NOT NEW.la_ktv_dvbh OR OLD.la_ve_tinh IS NOT NEW.la_ve_tinh OR OLD.la_kho IS NOT NEW.la_kho
  OR OLD.la_ke_toan IS NOT NEW.la_ke_toan OR OLD.la_tac_nghiep IS NOT NEW.la_tac_nghiep OR OLD.la_tp_dvbh IS NOT NEW.la_tp_dvbh
  OR OLD.la_view IS NOT NEW.la_view OR OLD.la_mua_hang IS NOT NEW.la_mua_hang
  OR OLD.quan_ly_danh_muc_lk IS NOT NEW.quan_ly_danh_muc_lk OR OLD.xem_danh_muc_lk IS NOT NEW.xem_danh_muc_lk
BEGIN
  INSERT INTO users_quyen_log (email, hanh_dong, truoc, sau, nguoi_thuc_hien, luc) VALUES (
    NEW.email, 'sua',
    json_object('vai_tro', OLD.vai_tro, 'trang_thai_duyet', OLD.trang_thai_duyet, 'bi_khoa', OLD.bi_khoa, 'la_ktv_dvbh', OLD.la_ktv_dvbh,
      'la_ve_tinh', OLD.la_ve_tinh, 'la_kho', OLD.la_kho, 'la_ke_toan', OLD.la_ke_toan, 'la_tac_nghiep', OLD.la_tac_nghiep,
      'la_tp_dvbh', OLD.la_tp_dvbh, 'la_view', OLD.la_view, 'la_mua_hang', OLD.la_mua_hang,
      'quan_ly_danh_muc_lk', OLD.quan_ly_danh_muc_lk, 'xem_danh_muc_lk', OLD.xem_danh_muc_lk),
    json_object('vai_tro', NEW.vai_tro, 'trang_thai_duyet', NEW.trang_thai_duyet, 'bi_khoa', NEW.bi_khoa, 'la_ktv_dvbh', NEW.la_ktv_dvbh,
      'la_ve_tinh', NEW.la_ve_tinh, 'la_kho', NEW.la_kho, 'la_ke_toan', NEW.la_ke_toan, 'la_tac_nghiep', NEW.la_tac_nghiep,
      'la_tp_dvbh', NEW.la_tp_dvbh, 'la_view', NEW.la_view, 'la_mua_hang', NEW.la_mua_hang,
      'quan_ly_danh_muc_lk', NEW.quan_ly_danh_muc_lk, 'xem_danh_muc_lk', NEW.xem_danh_muc_lk),
    COALESCE(NEW.quyen_sua_boi, 'he_thong'),
    strftime('%Y-%m-%d %H:%M:%S', 'now', '+7 hours')
  );
  UPDATE users SET quyen_sua_boi = NULL WHERE email = NEW.email AND quyen_sua_boi IS NOT NULL;
END;

-- Tai khoan tao moi da co quyen (Admin bootstrap, KTV tu kich hoat, ETX tu tao...).
CREATE TRIGGER IF NOT EXISTS trg_users_quyen_log_i AFTER INSERT ON users
WHEN NEW.vai_tro IS NOT NULL OR NEW.trang_thai_duyet = 'Da duyet'
BEGIN
  INSERT INTO users_quyen_log (email, hanh_dong, truoc, sau, nguoi_thuc_hien, luc) VALUES (
    NEW.email, 'tao', NULL,
    json_object('vai_tro', NEW.vai_tro, 'trang_thai_duyet', NEW.trang_thai_duyet, 'bi_khoa', NEW.bi_khoa, 'la_ktv_dvbh', NEW.la_ktv_dvbh,
      'la_ve_tinh', NEW.la_ve_tinh, 'la_kho', NEW.la_kho, 'la_ke_toan', NEW.la_ke_toan, 'la_tac_nghiep', NEW.la_tac_nghiep,
      'la_tp_dvbh', NEW.la_tp_dvbh, 'la_view', NEW.la_view, 'la_mua_hang', NEW.la_mua_hang,
      'quan_ly_danh_muc_lk', NEW.quan_ly_danh_muc_lk, 'xem_danh_muc_lk', NEW.xem_danh_muc_lk),
    COALESCE(NEW.quyen_sua_boi, 'he_thong'),
    strftime('%Y-%m-%d %H:%M:%S', 'now', '+7 hours')
  );
END;

-- Gmail dang nhap phu = 1 Gmail KHAC dang nhap thang vao tai khoan -> duong chiem quyen, phai ghi lai.
CREATE TRIGGER IF NOT EXISTS trg_users_gmail_phu_log_i AFTER INSERT ON users_gmail_phu
BEGIN
  INSERT INTO users_quyen_log (email, hanh_dong, truoc, sau, nguoi_thuc_hien, luc) VALUES (
    NEW.email_chinh, 'them_gmail_phu', NULL, json_object('gmail_phu', NEW.email_phu),
    COALESCE(NEW.nguoi_them, 'he_thong'), strftime('%Y-%m-%d %H:%M:%S', 'now', '+7 hours'));
END;

CREATE TRIGGER IF NOT EXISTS trg_users_gmail_phu_log_d AFTER DELETE ON users_gmail_phu
BEGIN
  INSERT INTO users_quyen_log (email, hanh_dong, truoc, sau, nguoi_thuc_hien, luc) VALUES (
    OLD.email_chinh, 'go_gmail_phu', json_object('gmail_phu', OLD.email_phu), NULL,
    'he_thong', strftime('%Y-%m-%d %H:%M:%S', 'now', '+7 hours'));
END;
