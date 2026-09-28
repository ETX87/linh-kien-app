-- Index hieu nang doc (ra soat D1 insights 2026-09-28, CHI them index - khong doi du lieu/logic).
--
-- 1) ktv_lien_he(email_dang_nhap): gan nhu moi truy van noi don/PXK/users voi danh ba KTV qua email
--    (LEFT JOIN ktv_lien_he dsk ON dsk.email_dang_nhap = ddh.nguoi_nhan_hang o GET /dat-mua-lk/don-hang,
--    resyncKhuVucDerivedFieldsForAll() "UPDATE users ... WHERE k.email_dang_nhap = users.email", ...) nhung
--    cot nay chua co index -> EXPLAIN la "SCAN dsk"/"SCAN k": quet lai ca ~500 dong KTV cho MOI don/user
--    (1 trang danh sach don doc 50-65 nghin dong du bang don chi ~180 dong; UPDATE users doc ~223 nghin dong).
CREATE INDEX IF NOT EXISTS idx_ktv_lien_he_email ON ktv_lien_he(email_dang_nhap);

-- 2) linh_kien(ngay_cap_nhat): GET /api/lk-settings/linh-kien?since= (FE poll danh muc thay doi) + dong bo
--    DVBH hang gio loc "ngay_cap_nhat > ?" -> dang quet ca ~6000 dong linh kien moi lan (~880 lan/ngay, lon nhat
--    trong tong so dong doc/ngay). Cung ly do cho ktv_lien_he(ngay_cap_nhat) (dong bo DVBH hang gio).
CREATE INDEX IF NOT EXISTS idx_linh_kien_ngay_cap_nhat ON linh_kien(ngay_cap_nhat);
CREATE INDEX IF NOT EXISTS idx_ktv_lien_he_ngay_cap_nhat ON ktv_lien_he(ngay_cap_nhat);
