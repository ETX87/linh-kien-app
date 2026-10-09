-- KH le theo tung khach (chot 2026-10-09): truoc day moi KH le dung chung 1 tai khoan (KH_LE_MB / KH_LE_MN) nen tien KH
-- chuyen ve khong gan duoc voi KH nao (quy/phieu xuat/chuyen tien deu theo NGUOI NHAN HANG). Gio moi KH le = 1 NGUOI NHAN
-- RIENG: 1 dong users NOI BO (email <ma>@khle.local, khong dang nhap duoc) + 1 dong khach_le. KHONG them vao ktv_lien_he (danh
-- ba KTV dong bo sang DVBH/khovan/vipham, cong no, ETX... - KH le khong duoc lot vao). Xem backend/src/lib/khachLe.ts.

-- Nhom KH le = ma KTV cua tai khoan chung (cha). Dat hang cho nguoi nhan la tai khoan nhom -> nhap SDT -> tim/tao KH.
CREATE TABLE IF NOT EXISTS khach_le_nhom (
  ma_ktv TEXT PRIMARY KEY
);
INSERT OR IGNORE INTO khach_le_nhom (ma_ktv) SELECT ma_ktv FROM ktv_lien_he WHERE ma_ktv IN ('KH_LE_MB', 'KH_LE_MN');

-- Ho so KH le - chi SDT (chot nguoi dung); khong co SDT -> ma tu dong. 1 SDT = 1 KH trong 1 nhom.
CREATE TABLE IF NOT EXISTS khach_le (
  ma        TEXT PRIMARY KEY,
  nhom_ma   TEXT NOT NULL,
  sdt       TEXT,
  email     TEXT NOT NULL UNIQUE REFERENCES users(email),
  nguoi_tao TEXT,
  ngay_tao  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_khach_le_nhom_sdt ON khach_le (nhom_ma, sdt) WHERE sdt IS NOT NULL;
INSERT OR IGNORE INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES ('khach_le', 0);

-- Trigger hoan tien da tra khi doi nguoi nhan (0056): them NGOAI LE khi chinh lenh UPDATE chuyen luon chu tien sang nguoi nhan
-- moi (tien_da_tra_email = nguoi nhan moi) - "Gan KH le" cho don cu cua tai khoan chung: tien KH da tra di THEO DON sang KH, khong
-- hoan ve quy chung. Moi duong doi nguoi nhan khac khong dong toi tien_da_tra_email -> van hoan nhu cu.
DROP TRIGGER IF EXISTS trg_ddh_hoan_tien_da_tra;
CREATE TRIGGER IF NOT EXISTS trg_ddh_hoan_tien_da_tra
AFTER UPDATE OF trang_thai_hien_tai, nguoi_nhan_hang, loai_don ON dat_don_hang
WHEN OLD.tien_da_tra > 0 AND OLD.tien_da_tra_email IS NOT NULL AND (
  NEW.trang_thai_hien_tai IN ('TN tu choi', 'Tu choi', 'Da huy')
  OR NEW.nguoi_nhan_hang IS NOT OLD.nguoi_nhan_hang
  OR NEW.loai_don = 'tra_hang'
) AND NOT (
  NEW.tien_da_tra_email IS NOT OLD.tien_da_tra_email AND NEW.tien_da_tra_email = NEW.nguoi_nhan_hang
  AND NEW.trang_thai_hien_tai NOT IN ('TN tu choi', 'Tu choi', 'Da huy') AND NEW.loai_don <> 'tra_hang'
)
BEGIN
  INSERT OR IGNORE INTO quy_ktv (email, so_du, cap_nhat_luc) VALUES (OLD.tien_da_tra_email, 0, datetime('now', '+7 hours'));
  UPDATE quy_ktv SET so_du = so_du + OLD.tien_da_tra, cap_nhat_luc = datetime('now', '+7 hours') WHERE email = OLD.tien_da_tra_email;
  INSERT INTO quy_ktv_giao_dich (email, loai, so_tien, so_du_sau, phieu_xuat_kho_id, khoan_chuyen_tien_id, ghi_chu, nguoi_tao, ngay_tao)
    SELECT OLD.tien_da_tra_email, 'hoan_phieu', OLD.tien_da_tra, so_du, OLD.tien_da_tra_pxk, NULL,
           'Hoàn tiền đã thanh toán của đơn ' || OLD.id || ' (' || COALESCE(OLD.ma_lk, '') || ') — đơn không còn cần xuất',
           'he-thong', datetime('now', '+7 hours')
    FROM quy_ktv WHERE email = OLD.tien_da_tra_email;
  UPDATE dat_don_hang SET tien_da_tra = 0, tien_da_tra_email = NULL, tien_da_tra_pxk = NULL WHERE id = NEW.id;
END;

-- Don CU cua tai khoan nhom KH le DA THANH TOAN theo gia chiet khau cu (luc tao 2026-10-09: 6 don "Cho hang" cua KH_LE_MN, 5 Dinh
-- tu 85% + 1 gia KTV). Quy tac moi KH le = gia niem yet se tinh lai cao hon khi don vao phieu -> KH "thieu tien". Chot nguoi
-- dung: GIU gia KH da tra - ghi gia_chot (don gia, luon thang gia theo chiet khau) = tien da tra / SL de xuat. Chi don chua
-- dong, chua xuat kho, chua co gia chot. Don MOI cua KH le tinh gia niem yet.
UPDATE dat_don_hang
SET gia_chot = ROUND(tien_da_tra * 1.0 / so_luong_de_xuat, 2)
WHERE tien_da_tra > 0 AND gia_chot IS NULL AND so_luong_de_xuat > 0
  AND trang_thai_hien_tai NOT IN ('TN tu choi', 'Tu choi', 'Da huy')
  AND nguoi_nhan_hang IN (SELECT k.email_dang_nhap FROM khach_le_nhom n JOIN ktv_lien_he k ON k.ma_ktv = n.ma_ktv WHERE k.email_dang_nhap IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM phieu_xuat_kho_dong d JOIN phieu_xuat_kho p ON p.id = d.phieu_xuat_kho_id
                  WHERE d.dat_don_hang_id = dat_don_hang.id AND p.trang_thai_hien_tai IN ('Dang gui KTV', 'KTV da nhan', 'Kho da ket thuc', 'Hang tru kho'));
