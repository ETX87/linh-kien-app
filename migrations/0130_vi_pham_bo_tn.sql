-- v1.531 (2026-11-19): "cac ca nay dang bi day sang cho vai tro tac nghiep xu ly, nhung hien tai TN khong con tham gia nua".
-- Code (lib/viPham.ts nguoiPhuTrach) tu nay: buoc cua TN giao Ke toan; nguoi co co Tac nghiep (khong phai Ke toan) khong tinh vao bo phan khac.
-- Migration nay sua 1 lan cac ca DANG MO (Cho giai trinh / Ton CEO) da ghi theo quy tac cu.

-- (1) Bo phan khac TN / Ke toan: bo nguoi co co Tac nghiep (khong phai Ke toan), chi khi con lai it nhat 1 nguoi.
UPDATE vi_pham
SET nguoi_phu_trach = (
  SELECT json_group_array(j.value) FROM json_each(vi_pham.nguoi_phu_trach) j
  WHERE j.value NOT IN (SELECT email FROM users WHERE la_tac_nghiep = 1 AND COALESCE(la_ke_toan, 0) = 0)
)
WHERE trang_thai IN ('Cho giai trinh', 'Ton CEO')
  AND bo_phan NOT IN ('tn', 'ke_toan')
  AND EXISTS (SELECT 1 FROM json_each(vi_pham.nguoi_phu_trach) j
              WHERE j.value IN (SELECT email FROM users WHERE la_tac_nghiep = 1 AND COALESCE(la_ke_toan, 0) = 0))
  AND EXISTS (SELECT 1 FROM json_each(vi_pham.nguoi_phu_trach) j
              WHERE j.value NOT IN (SELECT email FROM users WHERE la_tac_nghiep = 1 AND COALESCE(la_ke_toan, 0) = 0));

-- (2) Buoc cua TN -> Ke toan dang hoat dong: duoc gan khu vuc cua ca; khong ai -> Ke toan khong gan khu vuc nao; khong ai -> moi Ke toan.
UPDATE vi_pham
SET nguoi_phu_trach = COALESCE(
  (SELECT json_group_array(u.email) FROM (SELECT u.email FROM users u
     WHERE u.la_ke_toan = 1 AND u.trang_thai_duyet = 'Da duyet' AND COALESCE(u.bi_khoa, 0) = 0
       AND EXISTS (SELECT 1 FROM user_khu_vuc k WHERE k.user_email = u.email AND k.khu_vuc_ma = vi_pham.khu_vuc_ma) ORDER BY u.email) u
   HAVING COUNT(*) > 0),
  (SELECT json_group_array(u.email) FROM (SELECT u.email FROM users u
     WHERE u.la_ke_toan = 1 AND u.trang_thai_duyet = 'Da duyet' AND COALESCE(u.bi_khoa, 0) = 0
       AND NOT EXISTS (SELECT 1 FROM user_khu_vuc k WHERE k.user_email = u.email) ORDER BY u.email) u
   HAVING COUNT(*) > 0),
  (SELECT json_group_array(u.email) FROM (SELECT u.email FROM users u
     WHERE u.la_ke_toan = 1 AND u.trang_thai_duyet = 'Da duyet' AND COALESCE(u.bi_khoa, 0) = 0 ORDER BY u.email) u
   HAVING COUNT(*) > 0),
  nguoi_phu_trach
)
WHERE trang_thai IN ('Cho giai trinh', 'Ton CEO') AND bo_phan = 'tn';
