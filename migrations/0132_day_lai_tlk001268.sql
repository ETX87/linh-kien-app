-- Migration 0132 (2026-11-20): đẩy lại ticket TLK-001268 (Kho từ chối nhầm 18/11 16:25 → đơn DDH-007592 tự hủy, 264.200đ hoàn về quỹ
-- hoanggiang51574@gmail.com). Chủ hệ thống: "TLK-001268 bị kho hủy nhầm, đẩy lại cho tôi" — đã quá 24h nên nút "↩ Đẩy lại ticket" không còn.
-- Làm ĐÚNG các bước của dayLaiThieuLk() (lib/dayLaiThieuLk.ts): ticket về "Cho kho xu ly", đơn về "Cho hang", rút lại 264.200đ từ quỹ gắn vào
-- đơn (tien_da_tra, pxk gốc PMH-002537 đã hủy). KTV không có phiếu mở → không cần tính lại chiết khấu.
-- Điều kiện G (mọi lệnh): log mới nhất của ticket vẫn là id 4904 ('Da huy bo') + đơn vẫn 'Da huy' version 3. Lệnh cuối ghi log ticket → G sai,
-- chạy lại không làm gì. Quỹ chỉ trừ khi còn ≥ 264.200 (CHECK so_du ≥ 0); không đủ thì đơn vẫn về Chờ hàng nhưng không mang tiền.

INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
SELECT 'DDH-007592', 'Cho hang', 'meomeo3101@gmail.com', datetime('now', '+7 hours'),
       'Đẩy lại theo ticket TLK-001268: ticket về "Chờ kho xử lý", đơn về Chờ hàng (lấy lại 264.200đ đã hoàn về quỹ): Kho từ chối nhầm, đẩy lại theo yêu cầu chủ hệ thống'
WHERE (SELECT MAX(id) FROM thieu_lk_log WHERE thieu_lk_id = 'TLK-001268') = 4904
  AND EXISTS (SELECT 1 FROM dat_don_hang WHERE id = 'DDH-007592' AND trang_thai_hien_tai = 'Da huy' AND version = 3);

INSERT INTO quy_ktv_giao_dich (email, loai, so_tien, so_du_sau, phieu_xuat_kho_id, khoan_chuyen_tien_id, ghi_chu, nguoi_tao, ngay_tao)
SELECT email, 'tra_phieu', -264200, so_du - 264200, 'PMH-002537', NULL,
       'Đẩy lại đơn DDH-007592 theo ticket TLK-001268 — lấy lại tiền đã hoàn khi hủy', 'meomeo3101@gmail.com', datetime('now', '+7 hours')
FROM quy_ktv WHERE email = 'hoanggiang51574@gmail.com' AND so_du >= 264200
  AND (SELECT MAX(id) FROM thieu_lk_log WHERE thieu_lk_id = 'TLK-001268') = 4904
  AND EXISTS (SELECT 1 FROM dat_don_hang WHERE id = 'DDH-007592' AND trang_thai_hien_tai = 'Da huy' AND version = 3);

UPDATE quy_ktv SET so_du = so_du - 264200, cap_nhat_luc = datetime('now', '+7 hours')
WHERE email = 'hoanggiang51574@gmail.com' AND so_du >= 264200
  AND (SELECT MAX(id) FROM thieu_lk_log WHERE thieu_lk_id = 'TLK-001268') = 4904
  AND EXISTS (SELECT 1 FROM dat_don_hang WHERE id = 'DDH-007592' AND trang_thai_hien_tai = 'Da huy' AND version = 3)
  AND EXISTS (SELECT 1 FROM quy_ktv_giao_dich WHERE email = 'hoanggiang51574@gmail.com' AND loai = 'tra_phieu'
              AND ghi_chu = 'Đẩy lại đơn DDH-007592 theo ticket TLK-001268 — lấy lại tiền đã hoàn khi hủy');

-- tien_da_tra chỉ gắn khi đã trừ quỹ (có dòng sổ vừa ghi). Đổi trạng thái + tiền cùng 1 lệnh: OLD.tien_da_tra = 0 nên trigger hoàn quỹ không chạy.
UPDATE dat_don_hang
SET trang_thai_hien_tai = 'Cho hang', version = version + 1, updated_at = datetime('now', '+7 hours'),
    tien_da_tra = CASE WHEN EXISTS (SELECT 1 FROM quy_ktv_giao_dich WHERE email = 'hoanggiang51574@gmail.com' AND loai = 'tra_phieu'
                        AND ghi_chu = 'Đẩy lại đơn DDH-007592 theo ticket TLK-001268 — lấy lại tiền đã hoàn khi hủy') THEN 264200 ELSE 0 END,
    tien_da_tra_email = CASE WHEN EXISTS (SELECT 1 FROM quy_ktv_giao_dich WHERE email = 'hoanggiang51574@gmail.com' AND loai = 'tra_phieu'
                        AND ghi_chu = 'Đẩy lại đơn DDH-007592 theo ticket TLK-001268 — lấy lại tiền đã hoàn khi hủy') THEN 'hoanggiang51574@gmail.com' END,
    tien_da_tra_pxk = CASE WHEN EXISTS (SELECT 1 FROM quy_ktv_giao_dich WHERE email = 'hoanggiang51574@gmail.com' AND loai = 'tra_phieu'
                        AND ghi_chu = 'Đẩy lại đơn DDH-007592 theo ticket TLK-001268 — lấy lại tiền đã hoàn khi hủy') THEN 'PMH-002537' END
WHERE id = 'DDH-007592' AND trang_thai_hien_tai = 'Da huy' AND version = 3
  AND (SELECT MAX(id) FROM thieu_lk_log WHERE thieu_lk_id = 'TLK-001268') = 4904;

INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
SELECT 'TLK-001268', 'Cho kho xu ly', 'meomeo3101@gmail.com', datetime('now', '+7 hours'),
       'Đẩy lại ticket về "Chờ kho xử lý" (trước khi bị từ chối / hủy) — đơn gốc DDH-007592 về Chờ hàng: Kho từ chối nhầm, đẩy lại theo yêu cầu chủ hệ thống'
WHERE (SELECT MAX(id) FROM thieu_lk_log WHERE thieu_lk_id = 'TLK-001268') = 4904
  AND EXISTS (SELECT 1 FROM dat_don_hang WHERE id = 'DDH-007592' AND trang_thai_hien_tai = 'Cho hang' AND version = 4);

UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'dat_mua_lk';
