-- Migration 0087: XAC NHAN KHU VUC KTV KHI BO SUNG MA MISA (chot 2026-10-16, "khi bổ sung mã MISA + tên misa của 1 nhân sự, nếu khu
-- vực chưa được chọn tay lần nào, sẽ yêu cầu người bổ sung xác nhận hoặc chọn lại khu vực chính xác của KTV mới cho lưu").
-- khu_vuc_xac_nhan_luc (gio VN) / _boi (email) - NULL = khu vuc CHUA tung duoc nguoi chon tay/xac nhan (trong, hoac he thong tu gan:
-- tao tu ETX doan theo quan ly truc tiep - lib/etxTuDongKtv.ts, migration ra soat gan theo phong doan). Ghi boi: Admin chon/doi khu vuc
-- (PATCH /:ma/dat-mua-lk, import co cot khu vuc, tao ma nhan hang van phong) + nguoi bo sung Ma MISA xac nhan (PATCH /:ma/cong-no-misa).
ALTER TABLE ktv_lien_he ADD COLUMN khu_vuc_xac_nhan_luc TEXT;
ALTER TABLE ktv_lien_he ADD COLUMN khu_vuc_xac_nhan_boi TEXT;

-- Du lieu cu: coi la DA xac nhan neu co khu vuc VA khong phai ma tao tu dong tu ETX (ma_ktv = Ma NV cua chinh nhan su ETX lien ket)
-- VA khong thuoc 11 tai khoan migration 0084 gan MB2 theo phong doan ("KTV chua ro").
UPDATE ktv_lien_he
SET khu_vuc_xac_nhan_luc = datetime('now', '+7 hours'), khu_vuc_xac_nhan_boi = 'du-lieu-truoc-0087'
WHERE khu_vuc_ma IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM etx_nhan_su e WHERE e.ma_ktv = ktv_lien_he.ma_ktv AND UPPER(e.ma_nhan_su) = UPPER(ktv_lien_he.ma_ktv))
  AND ma_ktv NOT IN ('NS-032', 'NS-3380', 'NS-3421', 'NS-3549', 'NS-3623', 'NS-3663', 'NS-3681', 'NS-848', 'ktv3t', 'ktv3t.ptdv-vn', 'linhhd.dvbh-ptdv');
