-- KTV/nguoi tao tu huy don tu duyet da tu gom vao PXK (2026-09-28, lib/pxkTuHuy.ts): chi duoc khi VAN PHONG
-- (TN/Kho/Ke toan/Admin) chua thao tac tay tren phieu. Dau vet thao tac dau tien cua van phong.
ALTER TABLE phieu_xuat_kho ADD COLUMN van_phong_tac_dong_luc TEXT;
ALTER TABLE phieu_xuat_kho ADD COLUMN van_phong_tac_dong_boi TEXT;

-- Backfill phieu cu: coi nhu van phong da thao tac neu phieu do van phong tao tay, hoac co dong log cua van
-- phong (tru log tinh lai tien tu dong "Da sua tong tien can chuyen"), hoac da in phieu / da co ma MISA.
UPDATE phieu_xuat_kho SET
  van_phong_tac_dong_luc = COALESCE(
    (SELECT MIN(l.ngay_xu_ly) FROM phieu_xuat_kho_log l JOIN users u ON u.email = l.nguoi_xu_ly
     WHERE l.phieu_xuat_kho_id = phieu_xuat_kho.id AND l.trang_thai != 'Da sua tong tien can chuyen'
       AND (u.la_tac_nghiep = 1 OR u.la_kho = 1 OR u.la_ke_toan = 1 OR u.vai_tro = 'Admin')),
    ngay_tao),
  van_phong_tac_dong_boi = 'backfill'
WHERE EXISTS (SELECT 1 FROM users u WHERE u.email = phieu_xuat_kho.nguoi_tao AND (u.la_tac_nghiep = 1 OR u.la_kho = 1 OR u.la_ke_toan = 1 OR u.vai_tro = 'Admin'))
   OR EXISTS (SELECT 1 FROM phieu_xuat_kho_log l JOIN users u ON u.email = l.nguoi_xu_ly
              WHERE l.phieu_xuat_kho_id = phieu_xuat_kho.id AND l.trang_thai != 'Da sua tong tien can chuyen'
                AND (u.la_tac_nghiep = 1 OR u.la_kho = 1 OR u.la_ke_toan = 1 OR u.vai_tro = 'Admin'))
   OR COALESCE(da_in_phieu, 0) = 1
   OR ma_misa IS NOT NULL;
