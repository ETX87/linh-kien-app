-- 0055: "Khu vuc dat hang" cho tai khoan KHONG phai KTV (GS quan tri chung, TN, Kho, Ke toan...) - chot 2026-09-30.
-- Truoc day don/PXK cua GS khong phu trach khu vuc nao (hoac TN/Kho dat ho cho chinh minh) roi vao 'CHUA_CO'.
-- users.khu_vuc_dat_hang (-> khu_vuc.ma, NULL = khong dat) chen vao chuoi suy khu vuc cua don (0042/0045):
--   DON: KTV nhan hang (khu vuc hoac CHUA_CO) -> khu vuc dat hang cua nguoi nhan -> KTV tao don
--        -> khu vuc dat hang cua nguoi tao -> GS phu trach (nguoi nhan, roi nguoi tao) -> 'CHUA_CO'
--   PXK: KTV nhan hang -> khu vuc dat hang cua nguoi nhan (khong phai KTV) -> GS phu trach -> 'CHUA_CO'
-- => khu vuc dat hang THANG khu vuc GS dang phu trach. Doi khu vuc dat hang -> trigger tinh lai don/PXK cu cua nguoi do
--    (email_gs tu theo qua trg_ddh_email_gs_theo_khu_vuc).
ALTER TABLE users ADD COLUMN khu_vuc_dat_hang TEXT;

DROP TRIGGER IF EXISTS trg_ddh_khu_vuc_i;
DROP TRIGGER IF EXISTS trg_ddh_khu_vuc_u;
DROP TRIGGER IF EXISTS trg_pxk_khu_vuc_i;
DROP TRIGGER IF EXISTS trg_pxk_khu_vuc_u;
DROP TRIGGER IF EXISTS trg_ktv_khu_vuc_don_u;
DROP TRIGGER IF EXISTS trg_ktv_khu_vuc_don_i;
DROP TRIGGER IF EXISTS trg_ktv_khu_vuc_don_d;
DROP TRIGGER IF EXISTS trg_kv_gs_don_u;
DROP TRIGGER IF EXISTS trg_users_khu_vuc_dat_hang_u;

CREATE TRIGGER IF NOT EXISTS trg_ddh_khu_vuc_i AFTER INSERT ON dat_don_hang BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = NEW.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = NEW.nguoi_tao AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_ddh_khu_vuc_u AFTER UPDATE OF nguoi_nhan_hang, nguoi_tao ON dat_don_hang
WHEN OLD.nguoi_nhan_hang IS NOT NEW.nguoi_nhan_hang OR OLD.nguoi_tao IS NOT NEW.nguoi_tao BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = NEW.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = NEW.nguoi_tao AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_pxk_khu_vuc_i AFTER INSERT ON phieu_xuat_kho BEGIN
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = NEW.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang)),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_pxk_khu_vuc_u AFTER UPDATE OF nguoi_nhan_hang ON phieu_xuat_kho
WHEN OLD.nguoi_nhan_hang IS NOT NEW.nguoi_nhan_hang BEGIN
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = NEW.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang)),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_ktv_khu_vuc_don_u AFTER UPDATE OF khu_vuc_ma, email_dang_nhap ON ktv_lien_he
WHEN OLD.khu_vuc_ma IS NOT NEW.khu_vuc_ma OR OLD.email_dang_nhap IS NOT NEW.email_dang_nhap BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = dat_don_hang.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = dat_don_hang.nguoi_tao AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang IN (OLD.email_dang_nhap, NEW.email_dang_nhap) OR nguoi_tao IN (OLD.email_dang_nhap, NEW.email_dang_nhap);
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = phieu_xuat_kho.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang)),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang IN (OLD.email_dang_nhap, NEW.email_dang_nhap);
END;
CREATE TRIGGER IF NOT EXISTS trg_ktv_khu_vuc_don_i AFTER INSERT ON ktv_lien_he
WHEN NEW.email_dang_nhap IS NOT NULL BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = dat_don_hang.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = dat_don_hang.nguoi_tao AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang = NEW.email_dang_nhap OR nguoi_tao = NEW.email_dang_nhap;
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = phieu_xuat_kho.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang)),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang = NEW.email_dang_nhap;
END;
CREATE TRIGGER IF NOT EXISTS trg_ktv_khu_vuc_don_d AFTER DELETE ON ktv_lien_he
WHEN OLD.email_dang_nhap IS NOT NULL BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = dat_don_hang.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = dat_don_hang.nguoi_tao AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang = OLD.email_dang_nhap OR nguoi_tao = OLD.email_dang_nhap;
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = phieu_xuat_kho.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang)),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang = OLD.email_dang_nhap;
END;
CREATE TRIGGER IF NOT EXISTS trg_kv_gs_don_u AFTER UPDATE OF gs_email, stt ON khu_vuc
WHEN OLD.gs_email IS NOT NEW.gs_email OR OLD.stt IS NOT NEW.stt BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = dat_don_hang.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = dat_don_hang.nguoi_tao AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang IN (OLD.gs_email, NEW.gs_email) OR nguoi_tao IN (OLD.gs_email, NEW.gs_email) OR khu_vuc_ma = OLD.ma;
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = phieu_xuat_kho.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang)),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang IN (OLD.gs_email, NEW.gs_email);
END;

-- Doi khu vuc dat hang -> tinh lai don (nguoi nhan HOAC nguoi tao) + PXK (nguoi nhan) cua chinh tai khoan do.
CREATE TRIGGER IF NOT EXISTS trg_users_khu_vuc_dat_hang_u AFTER UPDATE OF khu_vuc_dat_hang ON users
WHEN OLD.khu_vuc_dat_hang IS NOT NEW.khu_vuc_dat_hang BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = dat_don_hang.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = dat_don_hang.nguoi_tao AND u.khu_vuc_dat_hang IS NOT NULL),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang = NEW.email OR nguoi_tao = NEW.email;
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = phieu_xuat_kho.nguoi_nhan_hang AND u.khu_vuc_dat_hang IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang)),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang = NEW.email;
END;
