-- Migration 0085: QUAN LY TON KHO CUA GIAM SAT (chot 2026-10-16, "cần quản lý cả tồn kho của giám sát vì giám sát cũng đặt hàng").
-- Ton kho / cong no / don TRU CONG NO deu gan theo MA KTV (ktv_lien_he): import file MISA chi khop "Mã kho" voi ktv_lien_he.ma_misa.
-- GS dat hang co Ma MISA tren TAI KHOAN (users.ma_misa, GS01/GS02/GS03/GS09/GSMN06) nhung KHONG co ma KTV -> ton kho cua ho nam o
-- "mã kho chưa khớp" (ktv_ton_kho.ma_ktv NULL), khong vao man Cong no, khong dat duoc TRU CONG NO.
-- Cach lam = dung lai "Mã nhận hàng" cho tai khoan van phong (v1.323, POST /settings/ktv-lien-he/tao-cho-van-phong): tao 1 ma KTV gan
-- Gmail GS, KHONG bat co KTV (tai khoan van o the "Nhân viên văn phòng", vai tro giu nguyen). ma_ktv = Ma MISA (khong trung ma nao).
-- Khu vuc cua ma = khu vuc dat hang, khong co thi khu vuc dau tien GS phu trach - CUNG khu vuc ma chuoi tinh khu vuc don dang cho ra,
-- nen trigger trg_ktv_khu_vuc_don_i tinh lai don cu khong doi gia tri.
INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, vai_tro_ktv, email_dang_nhap, khu_vuc_ma, ma_misa, ten_misa, ghi_chu, ngay_cap_nhat)
SELECT UPPER(TRIM(u.ma_misa)),
       COALESCE(NULLIF(TRIM(u.ten_misa), ''), NULLIF(TRIM(u.ten), ''), u.email),
       'KTV', u.email,
       COALESCE(u.khu_vuc_dat_hang, (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = u.email ORDER BY kv.stt, kv.ma LIMIT 1), 'CHUA_CO'),
       TRIM(u.ma_misa), NULLIF(TRIM(u.ten_misa), ''),
       'Mã nhận hàng của Giám sát - tự tạo 2026-10-16 để quản lý tồn kho/công nợ GS (migration 0085)',
       datetime('now', '+7 hours')
FROM users u
WHERE u.vai_tro = 'Giam sat' AND u.trang_thai_duyet = 'Da duyet'
  AND TRIM(COALESCE(u.ma_misa, '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM ktv_lien_he k WHERE LOWER(TRIM(k.email_dang_nhap)) = LOWER(TRIM(u.email)))
  AND NOT EXISTS (SELECT 1 FROM ktv_lien_he k WHERE UPPER(k.ma_ktv) = UPPER(TRIM(u.ma_misa)) OR UPPER(TRIM(k.ma_misa)) = UPPER(TRIM(u.ma_misa)));

-- Nhu resyncKhuVucDerivedFieldsForEmail(): GS phu trach cua tai khoan = GS cua khu vuc cua ma vua tao.
UPDATE users SET giam_sat_quan_ly = (SELECT kv.gs_email FROM ktv_lien_he k JOIN khu_vuc kv ON kv.ma = k.khu_vuc_ma WHERE k.email_dang_nhap = users.email)
WHERE vai_tro = 'Giam sat' AND email IN (SELECT email_dang_nhap FROM ktv_lien_he WHERE ghi_chu LIKE '%(migration 0085)');

-- Nhu relinkTonKhoForMaMisa(): noi ton kho da import (dang "chưa khớp") vao ma moi.
UPDATE ktv_ton_kho SET ma_ktv = (SELECT k.ma_ktv FROM ktv_lien_he k WHERE LOWER(TRIM(k.ma_misa)) = LOWER(TRIM(ktv_ton_kho.ma_kho)) AND k.ghi_chu LIKE '%(migration 0085)')
WHERE ma_ktv IS NULL AND LOWER(TRIM(ma_kho)) IN (SELECT LOWER(TRIM(ma_misa)) FROM ktv_lien_he WHERE ghi_chu LIKE '%(migration 0085)');
