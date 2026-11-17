// He thong "Han muc du phong KTV" (them 13/09/2026, phan hoi nguoi dung - xem migration 0028 de biet
// day du boi canh/quyet dinh). Mirror cau truc congNoKtv.ts nhung KHONG co khai niem "thuc te" (khong
// co bang ton kho tuong duong ktv_ton_kho cho du phong) - "Han muc du phong hien tai" la field dien
// tay/import TRUC TIEP, khong tinh tu bang khac.
//
// "Moc tinh du phong" = thoi diem GAN NHAT han_muc_du_phong_hien_tai duoc sua (dien tay hoac import) -
// luu trong app_settings key='du_phong_ktv_import_meta' - 1 moc DUY NHAT dung chung cho MOI KTV, giong
// het pattern 'ktv_ton_kho_import_meta'. Chua tung sua lan nao -> null (tinh tu dau).
export async function getMocTinhDuPhong(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT updated_at FROM app_settings WHERE key = 'du_phong_ktv_import_meta'").first<{ updated_at: string }>();
  return row?.updated_at ?? null;
}

export async function setMocTinhDuPhong(db: D1Database, updatedBy: string, updatedAt: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('du_phong_ktv_import_meta', '1', ?, ?)
       ON CONFLICT(key) DO UPDATE SET updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .bind(updatedBy, updatedAt)
    .run();
}

// MOC TINH DU TRU THEO TUNG MA MISA (sua 2026-11-17, migration 0123 - "kiểm tra logic tăng quỹ mua dữ trữ ... mức tiền quỹ dự trữ
// của KTV không tăng dù họ đặt mua dữ trữ"): moc = han_muc_du_tru.hien_tai_luc = luc Ke toan nhap "Hạn mức dự phòng hiện tại"
// (so MISA) cho CHINH Ma MISA cua KTV. Truoc day dung 1 moc CHUNG (getMocTinhDuPhong) + loc ddh.updated_at > moc -> sai 2 chieu:
// Ke toan sua 1 KTV la moc moi KTV nhay theo, don da mua nhung MISA chua ghi bi bo mat (NS-3871 mua 8,81tr ngay 10-13/11, moc
// nhay 16/11 -> coi nhu chua mua); don cu da trong MISA chi doi trang thai sau moc thi bi cong lai.
// Join theo alias KTV `k` -> them `h` (NULL khi chua nhap "hien tai" / dong tat).
export const HAN_MUC_MOC_JOIN = (k: string, h: string) => `LEFT JOIN han_muc_du_tru ${h} ON ${h}.ma_misa = TRIM(${k}.ma_misa) AND ${h}.bat_tat = 1`;

// "Da mua du tru phat sinh" = gia du phong x SL cua don MUA DỰ TRỮ (tru Tu choi / Da huy, tinh CA don dang cho - "chặn ngay lúc
// tạo đơn") ma MISA CHUA ghi nhan tai luc nhap "hien tai": don chua duoc Ke toan chot xuat ("Da chot xong don xuat") truoc moc
// cua KTV. Chua nhap "hien tai" (moc NULL) -> tinh moi don. Subquery (ma_ktv, gia_tri) dung chung ham 1 KTV + bang Danh sach KTV.
// `loaiTruSql`: them dieu kien bo qua dong (khi xet CHINH cac dong do - xem computeMocDuPhongHienTai).
export const PHAT_SINH_DU_TRU_SUBQUERY = (loaiTruSql = "") => `
  SELECT k3.ma_ktv as ma_ktv, SUM(ddh.so_luong_de_xuat * COALESCE(lk.gia_du_phong, 0)) as gia_tri
  FROM dat_don_hang ddh
  JOIN ktv_lien_he k3 ON k3.email_dang_nhap = ddh.nguoi_nhan_hang
  ${HAN_MUC_MOC_JOIN("k3", "h3")}
  LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
  WHERE ddh.loai_de_xuat = 'MUA DỰ TRỮ' AND ddh.trang_thai_hien_tai NOT IN ('Tu choi', 'Da huy')
    AND (h3.hien_tai_luc IS NULL OR NOT EXISTS (
      SELECT 1 FROM phieu_xuat_kho_dong pd3 JOIN phieu_xuat_kho_log pl3 ON pl3.phieu_xuat_kho_id = pd3.phieu_xuat_kho_id
      WHERE pd3.dat_don_hang_id = ddh.id AND pl3.trang_thai = 'Da chot xong don xuat' AND pl3.ngay_xu_ly <= h3.hien_tai_luc))${loaiTruSql}
  GROUP BY k3.ma_ktv`;

export async function computeDuPhongPhatSinh(db: D1Database, maKtv: string, loaiTruDonIds: string[] = []): Promise<number> {
  const co = loaiTruDonIds.length > 0;
  const row = await db
    .prepare(`SELECT gia_tri FROM (${PHAT_SINH_DU_TRU_SUBQUERY(co ? " AND ddh.id NOT IN (SELECT value FROM json_each(?))" : "")}) WHERE ma_ktv = ?`)
    .bind(...(co ? [JSON.stringify(loaiTruDonIds)] : []), maKtv)
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

// "Tra hang du tru da chot" (CHOT 2026-10-26, chu he thong): don "TRẢ HÀNG DỮ TRỮ" cua KTV (loai_don='tra_hang') khi KE TOAN
// DA CHOT phieu tra hang (PXK sang "Da chot xong don xuat" - buoc cuoi sau QC, khong can Kho; phieu co ma thung TRA- tu sang
// "Kho da nhan hang tra") -> TRA LAI han muc du tru theo GIA MUA DU TRU (linh_kien.gia_du_phong) x SL THUC TE Kho nhan
// (COALESCE(so_luong_thuc_xuat, so_luong_de_xuat)). Chi tinh phieu chot SAU moc cua KTV (moc theo Ma MISA, 2026-11-17).
// Phieu "Ke toan huy" khong tinh. Subquery (ma_ktv, gia_tri), KHONG bind.
export const TRA_HANG_DU_TRU_SUBQUERY = `
  SELECT kt.ma_ktv as ma_ktv, SUM(COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) * COALESCE(lk.gia_du_phong, 0)) as gia_tri
  FROM dat_don_hang ddh
  JOIN ktv_lien_he kt ON kt.email_dang_nhap = ddh.nguoi_nhan_hang
  ${HAN_MUC_MOC_JOIN("kt", "ht")}
  LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
  JOIN phieu_xuat_kho_dong pd ON pd.dat_don_hang_id = ddh.id
  JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id
  WHERE ddh.loai_don = 'tra_hang' AND ddh.loai_de_xuat = 'TRẢ HÀNG DỮ TRỮ'
    AND p.trang_thai_hien_tai IN ('Da chot xong don xuat', 'Kho da nhan hang tra')
    AND (ht.hien_tai_luc IS NULL OR (SELECT MAX(pl.ngay_xu_ly) FROM phieu_xuat_kho_log pl WHERE pl.phieu_xuat_kho_id = p.id AND pl.trang_thai = 'Da chot xong don xuat') > ht.hien_tai_luc)
  GROUP BY kt.ma_ktv`;

export async function computeDuPhongTraHang(db: D1Database, maKtv: string): Promise<number> {
  const row = await db
    .prepare(`SELECT gia_tri FROM (${TRA_HANG_DU_TRU_SUBQUERY}) WHERE ma_ktv = ?`)
    .bind(maKtv)
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

// "Con duoc mua du tru" (truoc goi "Moc du phong hien tai") = Han muc - Hien tai (so MISA) - Phat sinh + Tra hang du tru da chot
// (cong thuc CHOT nguoi dung, KHONG cong "thuc te" nhu cong no vi khong co bang ton kho tuong duong).
// `loaiTruDonIds` (FIX 2026-09-28, dem trung): khi xet PXK, cac dong CUA CHINH PXK da nam san trong "phat
// sinh" (don MUA DỰ TRỮ tinh ngay tu luc tao) roi lai bi so them 1 lan nua -> KTV can gap doi han muc.
// Chot nguoi dung: "han muc 20tr, da dung 19tr, dat PXK 900k => 19tr9 van dat; dat 2tr => 21tr > 20tr
// => khong dat" - tuc da dung (KHONG tinh chinh phieu) + gia tri phieu <= han muc.
export async function computeMocDuPhongHienTai(db: D1Database, maKtv: string, loaiTruDonIds: string[] = []): Promise<number> {
  const ktv = await db.prepare("SELECT han_muc_du_phong, han_muc_du_phong_hien_tai FROM ktv_lien_he WHERE ma_ktv = ?").bind(maKtv).first<{
    han_muc_du_phong: number | null;
    han_muc_du_phong_hien_tai: number | null;
  }>();
  const hanMuc = ktv?.han_muc_du_phong ?? 0;
  const hienTai = ktv?.han_muc_du_phong_hien_tai ?? 0;
  const [phatSinh, traHang] = await Promise.all([computeDuPhongPhatSinh(db, maKtv, loaiTruDonIds), computeDuPhongTraHang(db, maKtv)]);
  return hanMuc - hienTai - phatSinh + traHang;
}
