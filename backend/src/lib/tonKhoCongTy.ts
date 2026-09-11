// "Ton kho Kho cong ty" (them 2026-09-11, phan hoi nguoi dung: tu dong duyet don mua/cong no khi
// kho con du hang) - dung CHUNG mot phan kien truc voi lib/congNoKtv.ts (Ton goc + Ton phat sinh =
// Ton chot), nhung khac o 2 diem CHOT theo nguoi dung:
//   - Ton phat sinh tinh CA don "dang ton" (chua xu ly xong) LAN "da duyet" (KHONG chi rieng da
//     duyet nhu cong no) - vi phai khoa (reserve) hang tu luc dat, tranh 2 don cung luc auto-duyet
//     de len cung 1 luong ton.
//   - Cong don theo TAT CA kho_cong_ty dang bat (bat_tat=1) cung phuc vu 1 Khu vuc (khong phan biet
//     kho theo hang/muc dich - CHOT nguoi dung "Cộng gộp tất cả kho cùng Miền", chap nhan rui ro neu
//     1 ma hang thuc te chi nam o kho rieng cua 1 hang).
// Moc tinh ton kho = luc import gan nhat (dung CHUNG app_settings key voi ktv_ton_kho vi CA 2 bang
// deu ghi de trong CUNG 1 lan import 1 file MISA - xem routes/ktvTonKho.ts POST /import).
export async function getMocTonKhoCongTy(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT updated_at FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ updated_at: string }>();
  return row?.updated_at ?? null;
}

// "Ton goc" = tong cuoi_ky cua MOI kho_cong_ty dang bat (bat_tat=1) duoc gan Khu vuc nay, cho dung
// 1 ma hang.
export async function computeTonKhoGoc(db: D1Database, khuVucMa: string, maLk: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(t.cuoi_ky), 0) as gia_tri
       FROM kho_cong_ty_ton_kho t
       JOIN kho_cong_ty k ON k.ma = t.kho_ma
       JOIN kho_cong_ty_khu_vuc kv ON kv.kho_ma = k.ma
       WHERE k.bat_tat = 1 AND kv.khu_vuc_ma = ? AND t.ma_hang = ?`,
    )
    .bind(khuVucMa, maLk)
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

// "Ton phat sinh" = tong so_luong_de_xuat cua cac dong dat_don_hang (loai_don mua/cong_no) CUNG ma
// hang, CUNG Khu vuc (qua nguoi_nhan_hang -> ktv_lien_he.khu_vuc_ma), tao SAU moc tinh ton kho, CHUA
// bi tu choi/huy (TAT CA trang thai con lai deu tinh, ke ca dang cho duyet - xem giai thich dau file).
export async function computeTonKhoPhatSinh(db: D1Database, khuVucMa: string, maLk: string, mocTonKho: string | null): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(ddh.so_luong_de_xuat), 0) as gia_tri
       FROM dat_don_hang ddh
       JOIN ktv_lien_he k ON k.email_dang_nhap = ddh.nguoi_nhan_hang
       WHERE k.khu_vuc_ma = ? AND ddh.ma_lk = ? AND ddh.loai_don IN ('mua', 'cong_no')
         AND ddh.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')
         AND (? IS NULL OR ddh.ngay_tao > ?)`,
    )
    .bind(khuVucMa, maLk, mocTonKho, mocTonKho)
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

// "Ton chot" = Ton goc - Ton phat sinh (co the am neu da dat vuot ton thuc te ghi nhan luc import -
// khong clamp ve 0, ben goi chi can so sanh >= so_luong_de_xuat cua dong DANG xet).
export async function computeTonKhoChot(db: D1Database, khuVucMa: string | null, maLk: string): Promise<number> {
  if (!khuVucMa) return 0;
  const moc = await getMocTonKhoCongTy(db);
  const [tonGoc, tonPhatSinh] = await Promise.all([
    computeTonKhoGoc(db, khuVucMa, maLk),
    computeTonKhoPhatSinh(db, khuVucMa, maLk, moc),
  ]);
  return tonGoc - tonPhatSinh;
}
