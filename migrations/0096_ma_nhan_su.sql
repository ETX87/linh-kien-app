-- MA NHAN SU cho moi tai khoan (KTV + van phong) - chot 2026-10-22, lib/maNhanSu.ts. Dang "NS-xxxx" lay tu danh ba ETX nhan su.
ALTER TABLE users ADD COLUMN ma_nhan_su TEXT;
CREATE INDEX idx_users_ma_nhan_su ON users(ma_nhan_su);

-- Dien 1 lan cho tai khoan san co (cung quy tac dienMaNhanSuTuEtx): khop Gmail truoc, roi qua ma KTV da lien ket ETX.
UPDATE users SET ma_nhan_su = (SELECT e.ma_nhan_su FROM etx_nhan_su e WHERE LOWER(TRIM(e.gmail)) = LOWER(users.email))
WHERE ma_nhan_su IS NULL
  AND (SELECT COUNT(*) FROM etx_nhan_su e WHERE LOWER(TRIM(e.gmail)) = LOWER(users.email)) = 1;

UPDATE users SET ma_nhan_su = (SELECT e.ma_nhan_su FROM etx_nhan_su e JOIN ktv_lien_he k ON k.ma_ktv = e.ma_ktv WHERE LOWER(k.email_dang_nhap) = LOWER(users.email))
WHERE ma_nhan_su IS NULL
  AND (SELECT COUNT(*) FROM etx_nhan_su e JOIN ktv_lien_he k ON k.ma_ktv = e.ma_ktv WHERE LOWER(k.email_dang_nhap) = LOWER(users.email)) = 1
  AND NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.ma_nhan_su = (SELECT e.ma_nhan_su FROM etx_nhan_su e JOIN ktv_lien_he k ON k.ma_ktv = e.ma_ktv WHERE LOWER(k.email_dang_nhap) = LOWER(users.email)));
