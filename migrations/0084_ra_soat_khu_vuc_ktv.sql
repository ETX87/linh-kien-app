-- Migration 0084 (2026-10-15): ra soat khu vuc KTV theo chot nguoi dung (sau 0083 PTDV MN):
--  1. hungnd.mb1 ("CTV MB1", dang MN3) -> MB2; phongbh3tmn.mn ("Phòng bảo hành 3T Miền Nam", dang SCVP MB) -> SCVP_MN.
--  2. 56 tai khoan tao tu ETX CHUA gan khu vuc nhung DA dat don, quan ly truc tiep tren ETX = NS-739 Nguyễn Trung Tất Linh (nhom thu
--     ngan, dong nghiep da o THUNGAN-MN) -> THUNGAN-MN.
--  3. "KTV chua ro" -> MB2: 8 tai khoan ETX chua gan khu vuc (quan ly khac) da dat don + 3 tai khoan chung dang o PTDV MB (ktv3t,
--     ktv3t.ptdv-vn, linhhd.dvbh-ptdv).
-- Chi doi dong DANG o gia tri cu (chay lai / da sua tay = khong doi). Trigger trg_ktv_khu_vuc_don_u tu tinh lai khu vuc don/PXK.
UPDATE ktv_lien_he SET khu_vuc_ma = 'MB2', ngay_cap_nhat = datetime('now', '+7 hours') WHERE ma_ktv = 'hungnd.mb1' AND khu_vuc_ma = 'MN3';
UPDATE ktv_lien_he SET khu_vuc_ma = 'SCVP_MN', ngay_cap_nhat = datetime('now', '+7 hours') WHERE ma_ktv = 'phongbh3tmn.mn' AND khu_vuc_ma = 'SCVP_MB';
UPDATE ktv_lien_he SET khu_vuc_ma = 'THUNGAN-MN', ngay_cap_nhat = datetime('now', '+7 hours') WHERE khu_vuc_ma IS NULL AND ma_ktv IN ('NS-1031','NS-1212','NS-1294','NS-1346','NS-1995','NS-2017','NS-2056','NS-2285','NS-2426','NS-2452','NS-2530','NS-2694','NS-2777','NS-2778','NS-2784','NS-2922','NS-2962','NS-3101','NS-3503','NS-3765','NS-3803','NS-479','NS-484','NS-514','NS-520','NS-537','NS-555','NS-556','NS-557','NS-560','NS-561','NS-563','NS-576','NS-578','NS-579','NS-580','NS-581','NS-582','NS-592','NS-594','NS-683','NS-684','NS-687','NS-690','NS-695','NS-735','NS-748','NS-754','NS-765','NS-782','NS-837','NS-884','NS-925','NS-926','NS-974','NS-986');
UPDATE ktv_lien_he SET khu_vuc_ma = 'MB2', ngay_cap_nhat = datetime('now', '+7 hours') WHERE khu_vuc_ma IS NULL AND ma_ktv IN ('NS-032','NS-3380','NS-3421','NS-3549','NS-3623','NS-3663','NS-3681','NS-848');
UPDATE ktv_lien_he SET khu_vuc_ma = 'MB2', ngay_cap_nhat = datetime('now', '+7 hours') WHERE khu_vuc_ma = 'PTDV' AND ma_ktv IN ('ktv3t', 'ktv3t.ptdv-vn', 'linhhd.dvbh-ptdv');

-- Dong bo GS phu trach (users.giam_sat_quan_ly) + email_gs don - BAN SAO resyncKhuVucDerivedFieldsForAll() (lib/khuVucSync.ts:
-- GIAM_SAT_QUAN_LY_SUBQUERY + DON_EMAIL_GS_MOI) vi khu vuc dich co GS khac. Chay cho moi KTV (idempotent - cung cong thuc code).
UPDATE users SET giam_sat_quan_ly = (
  SELECT kv.gs_email FROM ktv_lien_he k LEFT JOIN khu_vuc kv ON kv.ma = k.khu_vuc_ma WHERE k.email_dang_nhap = users.email
)
WHERE email IN (SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL);

UPDATE dat_don_hang SET email_gs = COALESCE(
  (SELECT u.giam_sat_quan_ly FROM users u WHERE u.email = dat_don_hang.nguoi_nhan_hang),
  (SELECT kv.gs_email FROM khu_vuc kv WHERE kv.ma = dat_don_hang.khu_vuc_ma))
WHERE nguoi_nhan_hang IN (SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL)
  AND COALESCE(email_gs, '') != COALESCE(COALESCE(
    (SELECT u.giam_sat_quan_ly FROM users u WHERE u.email = dat_don_hang.nguoi_nhan_hang),
    (SELECT kv.gs_email FROM khu_vuc kv WHERE kv.ma = dat_don_hang.khu_vuc_ma)), '');
