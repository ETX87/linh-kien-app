-- Migration 0042: Khu vuc CUA DON (2026-09-29, phan hoi "1 so don khong thuoc khu vuc nao, vd don cua GS diepbush -
-- TN duoc phan theo khu vuc nen khong thay don").
-- Truoc day 1 don "thuoc" khu vuc X chi khi nguoi tao HOAC nguoi nhan hang la KTV trong ktv_lien_he co khu_vuc_ma = X.
-- GS/TN tao don de "-- Chính tôi --" nhan hang (hoac KTV chua gan khu vuc) -> don khong thuoc khu vuc nao -> bi bo loc
-- Khu vuc mac dinh cua TN an mat. Chot nguoi dung:
--   1. GS -> tu dong gan vao 1 trong cac khu vuc GS do phu trach (khu vuc dau tien theo stt, ma).
--   2. Khong xac dinh duoc (GS khong phu trach khu vuc nao, TN tu nhan hang, KTV chua gan khu vuc...) -> khu vuc
--      "Chưa có khu vực" (ma CHUA_CO) - 1 khu vuc THAT trong danh sach, Admin gan TN xu ly qua Users nhu khu vuc khac.
-- Luu san thanh cot (khong tinh luc doc): bo loc Khu vuc chi con so 1 cot co index, khong ton them dong doc D1.
-- Giu TRIGGER cap nhat (moi duong ghi deu dung: tao don, import, doi nguoi nhan, doi khu vuc KTV, doi GS khu vuc).
-- Bo loc cu (nguoi tao/nguoi nhan IN email KTV cua khu vuc) VAN giu, cot nay chi OR them - khong don nao bi mat.

INSERT OR IGNORE INTO khu_vuc (ma, ten, bat_tat, stt) VALUES ('CHUA_CO', 'Chưa có khu vực', 1, 9999);

ALTER TABLE dat_don_hang ADD COLUMN khu_vuc_ma TEXT;
ALTER TABLE phieu_xuat_kho ADD COLUMN khu_vuc_ma TEXT;

-- Thu tu uu tien (DON): KTV nhan hang -> KTV tao don -> GS nhan hang -> GS tao don -> CHUA_CO.
UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
  (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
  (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
  (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
  (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
  'CHUA_CO');

-- PXK: theo nguoi nhan hang cua phieu (KTV -> GS -> CHUA_CO).
UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
  (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
  (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
  'CHUA_CO');

CREATE INDEX IF NOT EXISTS idx_ddh_khu_vuc ON dat_don_hang(khu_vuc_ma);
CREATE INDEX IF NOT EXISTS idx_pxk_khu_vuc ON phieu_xuat_kho(khu_vuc_ma);
-- Trigger ben duoi tim don theo nguoi_tao (khi KTV/GS doi khu vuc) - truoc day cot nay khong co index.
CREATE INDEX IF NOT EXISTS idx_ddh_nguoi_tao ON dat_don_hang(nguoi_tao);
CREATE INDEX IF NOT EXISTS idx_pxk_nguoi_nhan_hang ON phieu_xuat_kho(nguoi_nhan_hang);

-- ===== Don: tao moi / doi nguoi tao-nguoi nhan =====
CREATE TRIGGER IF NOT EXISTS trg_ddh_khu_vuc_i AFTER INSERT ON dat_don_hang BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_ddh_khu_vuc_u AFTER UPDATE OF nguoi_nhan_hang, nguoi_tao ON dat_don_hang
WHEN OLD.nguoi_nhan_hang IS NOT NEW.nguoi_nhan_hang OR OLD.nguoi_tao IS NOT NEW.nguoi_tao BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE id = NEW.id;
END;

-- ===== PXK: tao moi / doi nguoi nhan =====
CREATE TRIGGER IF NOT EXISTS trg_pxk_khu_vuc_i AFTER INSERT ON phieu_xuat_kho BEGIN
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_pxk_khu_vuc_u AFTER UPDATE OF nguoi_nhan_hang ON phieu_xuat_kho
WHEN OLD.nguoi_nhan_hang IS NOT NEW.nguoi_nhan_hang BEGIN
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = NEW.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = NEW.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE id = NEW.id;
END;

-- ===== Nguon doi (danh ba KTV / GS cua khu vuc) -> tinh lai don + PXK cua CHINH email bi anh huong =====
-- Chi cham don/PXK cua email bi anh huong (co index nguoi_nhan_hang/nguoi_tao) va chi khi gia tri nguon THAT SU doi
-- (WHEN ...) - import danh ba hang loat ghi lai gia tri cu se khong kich hoat.
CREATE TRIGGER IF NOT EXISTS trg_ktv_khu_vuc_don_u AFTER UPDATE OF khu_vuc_ma, email_dang_nhap ON ktv_lien_he
WHEN OLD.khu_vuc_ma IS NOT NEW.khu_vuc_ma OR OLD.email_dang_nhap IS NOT NEW.email_dang_nhap BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
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
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
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
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
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
-- GS cua khu vuc doi (gan/go/chuyen GS) hoac doi thu tu (stt quyet dinh "khu vuc dau tien" cua GS).
CREATE TRIGGER IF NOT EXISTS trg_kv_gs_don_u AFTER UPDATE OF gs_email, stt ON khu_vuc
WHEN OLD.gs_email IS NOT NEW.gs_email OR OLD.stt IS NOT NEW.stt BEGIN
  UPDATE dat_don_hang SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = dat_don_hang.nguoi_tao AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = dat_don_hang.nguoi_tao AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang IN (OLD.gs_email, NEW.gs_email) OR nguoi_tao IN (OLD.gs_email, NEW.gs_email);
  UPDATE phieu_xuat_kho SET khu_vuc_ma = COALESCE(
    (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = phieu_xuat_kho.nguoi_nhan_hang AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
    (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = phieu_xuat_kho.nguoi_nhan_hang AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
    'CHUA_CO')
  WHERE nguoi_nhan_hang IN (OLD.gs_email, NEW.gs_email);
END;
