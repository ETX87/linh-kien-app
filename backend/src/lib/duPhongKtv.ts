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

// "Han muc du phong phat sinh" = tong gia tri (gia_du_phong x so_luong_de_xuat) cac dong dat_don_hang
// loai_de_xuat = 'MUA DỰ TRỮ' cua 1 KTV, tinh TU moc tinh du phong tro di (dat_don_hang.updated_at >
// moc). KHAC cong_no_phat_sinh: tinh CA don dang cho xu ly LAN don da dong (xac nhan nguoi dung "chặn
// ngay lúc tạo đơn" - khong loc theo trang_thai_hien_tai), CHI loai tru don da Tu choi/Da huy (khong
// con hieu luc). mocTinhDuPhong=null (chua tung sua) -> khong loc theo thoi gian (tinh tu dau).
// `loaiTruDonIds`: bo qua cac dong nay (dung khi xet CHINH cac dong do - xem computeMocDuPhongHienTai).
export async function computeDuPhongPhatSinh(
  db: D1Database,
  maKtv: string,
  mocTinhDuPhong: string | null,
  loaiTruDonIds: string[] = [],
): Promise<number> {
  const loaiTruSql = loaiTruDonIds.length > 0 ? ` AND ddh.id NOT IN (${loaiTruDonIds.map(() => "?").join(",")})` : "";
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(ddh.so_luong_de_xuat * COALESCE(lk.gia_du_phong, 0)), 0) as gia_tri
       FROM dat_don_hang ddh
       JOIN ktv_lien_he k ON k.email_dang_nhap = ddh.nguoi_nhan_hang
       LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
       WHERE k.ma_ktv = ? AND ddh.loai_de_xuat = 'MUA DỰ TRỮ'
         AND ddh.trang_thai_hien_tai NOT IN ('Tu choi', 'Da huy')
         AND (? IS NULL OR ddh.updated_at > ?)${loaiTruSql}`,
    )
    .bind(maKtv, mocTinhDuPhong, mocTinhDuPhong, ...loaiTruDonIds)
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

// "Moc du phong hien tai" = Han muc du phong - Han muc du phong hien tai - Han muc du phong phat sinh
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
  const moc = await getMocTinhDuPhong(db);
  const phatSinh = await computeDuPhongPhatSinh(db, maKtv, moc, loaiTruDonIds);
  return hanMuc - hienTai - phatSinh;
}
