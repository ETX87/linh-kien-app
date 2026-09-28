-- Dong bo 1 lan (2026-09-28): dat_don_hang.email_gs truoc day la anh chup GS luc tao don, khong doi khi KTV
-- doi khu vuc / khu vuc doi GS -> bao cao GS dem nham don cua KTV khu vuc khac. Chot nguoi dung: tinh theo khu
-- vuc HIEN TAI cua KTV nhan hang (ca don cu). Tu nay lib/khuVucSync.ts tu dong bo moi lan doi khu vuc/GS.
-- Buoc 1: tinh lai users.giam_sat_quan_ly (derived) tu ktv_lien_he.khu_vuc_ma -> khu_vuc.gs_email.
UPDATE users SET giam_sat_quan_ly = (
  SELECT kv.gs_email FROM ktv_lien_he k LEFT JOIN khu_vuc kv ON kv.ma = k.khu_vuc_ma
  WHERE k.email_dang_nhap = users.email
)
WHERE email IN (SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL);

-- Buoc 2: email_gs cua don = GS hien tai cua nguoi nhan hang (chi nguoi nhan co trong danh ba KTV).
UPDATE dat_don_hang SET email_gs = (SELECT u.giam_sat_quan_ly FROM users u WHERE u.email = dat_don_hang.nguoi_nhan_hang)
WHERE nguoi_nhan_hang IN (SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL)
  AND COALESCE(email_gs, '') != COALESCE((SELECT u.giam_sat_quan_ly FROM users u WHERE u.email = dat_don_hang.nguoi_nhan_hang), '');

-- Bao cache bao cao (reportCache theo version-tag) tinh lai.
INSERT INTO data_versions (domain, version, updated_at) VALUES ('dat_mua_lk', 1, datetime('now'))
  ON CONFLICT(domain) DO UPDATE SET version = data_versions.version + 1, updated_at = excluded.updated_at;
