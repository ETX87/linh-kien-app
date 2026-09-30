-- Migration 0052: CHUYEN TAY PCN-000046 sang "Hang tru kho" (2026-09-30, nguoi dung dong y "ok").
-- Phieu chi gom dong "TRỪ CÔNG NỢ" nhung Ke toan chot luc 29/09 16:17, TRUOC ban v1.209 (tu "Hang tru kho", deploy 20:16)
-- nen van di qua Kho -> "Dang gui KTV". Dua ve dung quy trinh moi: hang tru thang kho KTV, dong phieu.
-- Chi doi khi phieu con "Dang gui KTV" (khong de len thao tac moi hon); DB local khong co phieu nay -> khong lam gi.

INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
SELECT id, 'Hang tru kho', 'meomeo3101@gmail.com', datetime('now', '+7 hours'),
       'Chuyển tay theo quy trình TRỪ CÔNG NỢ (phiếu chốt trước bản tự chuyển "Hàng trừ kho") — hàng trừ thẳng kho KTV'
FROM phieu_xuat_kho
WHERE id = 'PCN-000046' AND trang_thai_hien_tai = 'Dang gui KTV'
  AND EXISTS (SELECT 1 FROM users WHERE email = 'meomeo3101@gmail.com');

UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'Hang tru kho', version = version + 1
WHERE id = 'PCN-000046' AND trang_thai_hien_tai = 'Dang gui KTV'
  AND EXISTS (SELECT 1 FROM users WHERE email = 'meomeo3101@gmail.com');

INSERT INTO data_versions (domain, version, updated_at) VALUES ('dat_mua_lk', 1, datetime('now'))
ON CONFLICT(domain) DO UPDATE SET version = data_versions.version + 1, updated_at = excluded.updated_at;
