-- Migration 0083 (2026-10-15): KTV PTDV mien Nam bi gan nham khu vuc "PTDV MB" (ma PTDV) - nguoi dung yeu cau "PTDV Đồng nai đang set
-- PTDV MB => đổi sang PTDV MN". Chuyen sang PTDV_MN moi KTV khu vuc PTDV TRU: KTV Ha Noi (ma *.ptdv-hn / ten co "Hà Nội"), ktv3t.mb, va 3 tai
-- khoan chung chua ro mien (ktv3t, ktv3t.ptdv-vn, linhhd.dvbh-ptdv) - luc chay: 99 KTV. Trigger trg_ktv_khu_vuc_don_u tu tinh lai
-- khu_vuc_ma cua don/PXK cua cac KTV nay; 2 khu vuc cung GS (quangvupt01) nen giam_sat_quan_ly/email_gs khong doi. ngay_cap_nhat moi de
-- dong bo danh ba sang DVBH/khovan/vipham.
UPDATE ktv_lien_he
SET khu_vuc_ma = 'PTDV_MN', ngay_cap_nhat = datetime('now', '+7 hours')
WHERE khu_vuc_ma = 'PTDV'
  AND ma_ktv NOT LIKE '%.ptdv-hn'
  AND ten_hien_thi NOT LIKE '%Hà Nội%'
  AND ma_ktv NOT IN ('ktv3t.mb', 'ktv3t', 'ktv3t.ptdv-vn', 'linhhd.dvbh-ptdv');
