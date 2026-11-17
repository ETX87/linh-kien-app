-- Moc tinh du tru THEO TUNG MA MISA (chot 2026-11-17, "kiểm tra logic tăng quỹ mua dữ trữ ... mức tiền quỹ dự trữ của KTV không tăng
-- dù họ đặt mua dữ trữ"). Truoc day 1 moc CHUNG (app_settings 'du_phong_ktv_import_meta'): Ke toan sua "hien tai" cua BAT KY KTV nao
-- -> moc cua MOI KTV nhay theo -> don MUA DỰ TRỮ da mua nhung chua co trong so MISA bi bo khoi "phat sinh" (vd NS-3871 mua 8,81tr
-- 10-13/11, moc nhay 16/11 -> coi nhu chua mua). Nay: hien_tai_luc = luc Ke toan nhap "Hạn mức dự phòng hiện tại" cho CHINH Ma MISA
-- do (so MISA tai luc nay). Phat sinh = don MUA DỰ TRỮ chua duoc Ke toan chot xuat ("Da chot xong don xuat") truoc moc nay.
ALTER TABLE han_muc_du_tru ADD COLUMN hien_tai_luc TEXT;
-- Du lieu cu: dong co "hien tai" -> lay cap_nhat_luc (lan sua gan nhat cua dong) lam moc.
UPDATE han_muc_du_tru SET hien_tai_luc = cap_nhat_luc WHERE han_muc_du_phong_hien_tai IS NOT NULL;
