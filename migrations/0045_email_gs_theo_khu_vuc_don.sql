-- Migration 0045 (2026-09-29, phan hoi "TN ngatran12302 khong thay don cua GS diepbush/phamluong" + chot nguoi dung
-- "luôn đảm bảo tất cả các đơn hàng không bị miss, nếu không xác định được khu vực hoặc KTV chưa được set khu vực =>
-- mặc định đẩy vào khu vực Chưa có khu vực"). 2 thay doi:
--
-- 1. KHU VUC CUA DON (sua quy tac 0042): nguoi nhan hang la KTV trong danh ba (ktv_lien_he) ma CHUA gan khu vuc ->
--    "Chưa có khu vực" (CHUA_CO), KHONG con muon khu vuc cua nguoi tao (KTV tao / GS tao) nhu 0042. Thu tu moi:
--    KTV nhan hang (co khu vuc -> khu vuc do, chua co -> CHUA_CO) -> [nguoi nhan KHONG phai KTV:] KTV tao don co khu vuc
--    -> GS nhan hang -> GS tao don -> CHUA_CO. Cot khong bao gio NULL. PXK giu nguyen quy tac 0042 (KTV -> GS -> CHUA_CO,
--    KTV chua co khu vuc da ra CHUA_CO). Thay 6 trigger don cua 0042 (phan PXK trong cac trigger do chep y nguyen).
--
-- 2. dat_don_hang.email_gs khong con NULL khi nguoi nhan khong phai KTV (GS/TN tu nhan hang): truoc day = giam_sat_quan_ly
--    cua nguoi nhan -> GS tu nhan hang ra NULL -> moi scope doc email_gs (lop "Giám sát phụ trách" cu, thong bao viec moi
--    theo GS) bo sot don. Gio fallback = GS cua KHU VUC CUA DON (GS tu nhan -> khu vuc dau tien cua GS -> chinh GS do).
--    Trigger AFTER UPDATE OF khu_vuc_ma (moi lan cac trigger khu vuc ghi cot nay). Cung cong thuc voi DON_EMAIL_GS_MOI
--    trong backend/src/lib/khuVucSync.ts - doi 1 ben phai doi ben kia.

DROP TRIGGER IF EXISTS trg_ddh_khu_vuc_i;
DROP TRIGGER IF EXISTS trg_ddh_khu_vuc_u;
DROP TRIGGER IF EXISTS trg_ktv_khu_vuc_don_u;
DROP TRIGGER IF EXISTS trg_ktv_khu_vuc_don_i;
DROP TRIGGER IF EXISTS trg_ktv_khu_vuc_don_d;
DROP TRIGGER IF EXISTS trg_kv_gs_don_u;

-- ===== email_gs theo khu vuc cua don (tao TRUOC buoc tinh lai o cuoi de chay luon cho don cu) =====
CREATE TRIGGER IF NOT EXISTS trg_ddh_email_gs_theo_khu_vuc AFTER UPDATE OF khu_vuc_ma ON dat_don_hang BEGIN
  UPDATE dat_don_hang SET email_gs = COALESCE(
    (SELECT u.giam_sat_quan_ly FROM users u WHERE u.email = NEW.nguoi_nhan_hang
       AND NEW.nguoi_nhan_hang IN (SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL)),
    (SELECT kv.gs_email FROM khu_vuc kv WHERE kv.ma = NEW.khu_vuc_ma))
  WHERE id = NEW.id AND email_gs IS NOT COALESCE(
    (SELECT u.giam_sat_quan_ly FROM users u WHERE u.email = NEW.nguoi_nhan_hang
       AND NEW.nguoi_nhan_hang IN (SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL)),
    (SELECT kv.gs_email FROM khu_vuc kv WHERE kv.ma = NEW.khu_vuc_ma));
END;

-- ===== Don: tao moi / doi nguoi tao-nguoi nhan =====
CREATE TRIGGER IF NOT EXISTS trg_ddh_khu_vuc_i AFTER INSERT ON dat_don_hang BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
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
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE id = NEW.id;
END;

-- ===== Nguon doi (danh ba KTV / GS cua khu vuc) -> tinh lai don + PXK cua CHINH email bi anh huong =====
CREATE TRIGGER IF NOT EXISTS trg_ktv_khu_vuc_don_u AFTER UPDATE OF khu_vuc_ma, email_dang_nhap ON ktv_lien_he
WHEN OLD.khu_vuc_ma IS NOT NEW.khu_vuc_ma OR OLD.email_dang_nhap IS NOT NEW.email_dang_nhap BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang IN (OLD.email_dang_nhap, NEW.email_dang_nhap) OR nguoi_tao IN (OLD.email_dang_nhap, NEW.email_dang_nhap);
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang IN (OLD.email_dang_nhap, NEW.email_dang_nhap);
END;
CREATE TRIGGER IF NOT EXISTS trg_ktv_khu_vuc_don_i AFTER INSERT ON ktv_lien_he
WHEN NEW.email_dang_nhap IS NOT NULL BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang = NEW.email_dang_nhap OR nguoi_tao = NEW.email_dang_nhap;
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang = NEW.email_dang_nhap;
END;
CREATE TRIGGER IF NOT EXISTS trg_ktv_khu_vuc_don_d AFTER DELETE ON ktv_lien_he
WHEN OLD.email_dang_nhap IS NOT NULL BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang = OLD.email_dang_nhap OR nguoi_tao = OLD.email_dang_nhap;
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang = OLD.email_dang_nhap;
END;
-- GS cua khu vuc doi (gan/go/chuyen GS) hoac doi thu tu (stt quyet dinh "khu vuc dau tien" cua GS). + moi don dang
-- nam trong CHINH khu vuc nay (OLD.ma) de email_gs cua don GS/TN tu nhan theo GS moi.
CREATE TRIGGER IF NOT EXISTS trg_kv_gs_don_u AFTER UPDATE OF gs_email, stt ON khu_vuc
WHEN OLD.gs_email IS NOT NEW.gs_email OR OLD.stt IS NOT NEW.stt BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang IN (OLD.gs_email, NEW.gs_email) OR nguoi_tao IN (OLD.gs_email, NEW.gs_email) OR khu_vuc_ma = OLD.ma;
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang IN (OLD.gs_email, NEW.gs_email);
END;

-- ===== Tinh lai TOAN BO don theo quy tac moi (kich hoat trigger email_gs cho tung dong) =====
UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang)
      THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO');
UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
WHERE khu_vuc_ma IS NULL;

-- Badge/bao cao cache theo version - lam moi ngay sau khi tinh lai.
UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'dat_mua_lk';
