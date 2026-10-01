-- 1 GMAIL = 1 MA KTV (chot nguoi dung 2026-10-01). Truoc day 6 Gmail gan nhieu ma KTV cung luc (Tram + Ve tinh dang nhap
-- chung, ma cu PTDV/DVBH...) -> moi JOIN danh ba theo email nhan dong (file MISA lap x5), cong no/ton kho tach theo ma.
-- Da doi chieu du lieu that: o MOI Gmail chi dung 1 ma co lien ket (Ma MISA / cong no / ton kho), cac ma con lai trong
-- hoan toan (khong Ma MISA, cong no, ton kho, Ve tinh tro toi, lien ket ETX). Don hang luu theo Gmail nen khong anh huong.
-- Nguoi dung xac nhan danh sach giu/dong (Tram Lo Van Thanh: giu datlv.vt-lvthcm vi co Ma MISA KTV0057).
--
-- "Dong" ma thua = go Gmail (email_dang_nhap NULL) + tat ma (ngung_hoat_dong, migration 0060), GIU dong ma de tra cuu.
UPDATE ktv_lien_he
SET ghi_chu = TRIM(COALESCE(ghi_chu, '') || ' [2026-10-01 đóng: Gmail ' || email_dang_nhap || ' chỉ giữ 1 mã KTV]'),
    email_dang_nhap = NULL,
    ngung_hoat_dong = 1,
    ngay_cap_nhat = strftime('%Y-%m-%d %H:%M:%S', 'now', '+7 hours')
WHERE ma_ktv IN (
  'khahv.ptdv-hn',
  'hieptm.vt-lvthcm', 'phuonghv.vt-lvthcm', 'tamnt.vt-lvthcm', 'thanhlv.trambhptdv-hcm',
  'sonnmh.dvbh-hcm',
  'vietnc.ptdv-hn',
  'minhdh.dvbh-hcm',
  'vibvlm.hcm'
);

-- Tinh lai GS / Tram cua 6 tai khoan theo DUNG 1 ma con lai (cung cong thuc lib/khuVucSync.ts).
UPDATE users SET
  giam_sat_quan_ly = (SELECT kv.gs_email FROM ktv_lien_he k LEFT JOIN khu_vuc kv ON kv.ma = k.khu_vuc_ma WHERE k.email_dang_nhap = users.email),
  tram_cha = (SELECT CASE WHEN vt.vai_tro_ktv = 'Ve tinh' THEN c1.email_dang_nhap ELSE NULL END
              FROM ktv_lien_he vt LEFT JOIN ktv_lien_he c1 ON c1.ma_ktv = vt.ktv_cap1_phu_trach WHERE vt.email_dang_nhap = users.email)
WHERE email IN ('hoangkha140419851985@gmail.com', 'karofibinhduong01@gmail.com', 'maihoangson95@gmail.com',
                'nguyencongviet09061999@gmail.com', 'onlinedohuuminh@gmail.com', 'vanvi000578@gmail.com');

-- Rang buoc cung: 1 Gmail chi la Email dang nhap cua 1 ma KTV (khong phan biet hoa thuong). API bao loi
-- EMAIL_DA_GAN_MA_KHAC truoc khi cham chi muc nay (routes/settingsKtv.ts, lib/ktvChinh.ts maKtvDangDungEmail).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ktv_lien_he_email_dang_nhap_unique
  ON ktv_lien_he(LOWER(TRIM(email_dang_nhap)))
  WHERE email_dang_nhap IS NOT NULL AND TRIM(email_dang_nhap) != '';
