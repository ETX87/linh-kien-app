// MA KTV "CHINH" cua 1 email dang nhap (2026-10-01). Du lieu that co nhieu ma KTV dung CHUNG 1 Gmail (vd Tram + cac
// Ve tinh dang nhap chung, ma cu/ma moi - v1.256 cho phep tat tung ma), nen `JOIN ktv_lien_he k ON k.email_dang_nhap =
// <email>` NHAN moi dong theo so ma (file MISA bi lap dong x5). Noi can thong tin KTV theo email nguoi nhan (ma/ten MISA,
// khu vuc...) dung `LEFT JOIN ktv_lien_he k ON k.ma_ktv = ${ktvChinhCuaEmailSql("ddh.nguoi_nhan_hang")}` - dung 1 dong:
// uu tien ma CO Ma MISA, roi ma dang bat, roi ma_ktv nho nhat (on dinh).
export function ktvChinhCuaEmailSql(emailExpr: string): string {
  return `(SELECT kc.ma_ktv FROM ktv_lien_he kc WHERE kc.email_dang_nhap = ${emailExpr}
    ORDER BY (NULLIF(TRIM(COALESCE(kc.ma_misa, '')), '') IS NULL), COALESCE(kc.ngung_hoat_dong, 0), kc.ma_ktv LIMIT 1)`;
}
