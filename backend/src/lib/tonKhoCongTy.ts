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

// "Ton phat sinh" = tong so_luong_de_xuat cua cac dong dat_don_hang (loai_don mua/cong_no) CUNG ma hang, CUNG Khu vuc, tao SAU moc
// tinh ton kho, CHUA bi tu choi/huy (TAT CA trang thai con lai deu tinh, ke ca dang cho duyet / cho hang - xem giai thich dau file).
// SUA 2026-10-14 (tu dong duyet 100%, migration 0080): khu vuc = KHU VUC CUA DON (COALESCE(khu_vuc_chon, khu_vuc_ma)) thay vi
// ktv_lien_he cua nguoi nhan - tinh duoc ca don nguoi nhan khong phai KTV (GS/TN, KH le). `truocDon` co -> CHI tinh cac don tao
// TRUOC don do (ngay_tao, id) - uu tien don tao truoc (tru dan cung ma, chot nguoi dung: don truoc du hang, don sau thieu).
export async function computeTonKhoPhatSinh(
  db: D1Database, khuVucMa: string, maLk: string, mocTonKho: string | null, truocDon?: { id: string; ngay_tao: string },
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(ddh.so_luong_de_xuat), 0) as gia_tri
       FROM dat_don_hang ddh
       WHERE ddh.ma_lk = ? AND COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) = ? AND ddh.loai_don IN ('mua', 'cong_no')
         -- "TRỪ CÔNG NỢ" lay tu ton kho CUA KTV, khong giu hang kho cong ty (chot 2026-09-28, lib/tonKhoKtv.ts)
         AND instr(COALESCE(ddh.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') = 0
         AND ddh.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')
         AND (? IS NULL OR ddh.ngay_tao > ?)${truocDon ? " AND (ddh.ngay_tao < ? OR (ddh.ngay_tao = ? AND ddh.id < ?))" : ""}`,
    )
    .bind(maLk, khuVucMa, mocTonKho, mocTonKho, ...(truocDon ? [truocDon.ngay_tao, truocDon.ngay_tao, truocDon.id] : []))
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

// "Ton chot" = Ton goc - Ton phat sinh (co the am neu da dat vuot ton thuc te ghi nhan luc import -
// khong clamp ve 0, ben goi chi can so sanh >= so_luong_de_xuat cua dong DANG xet).
export async function computeTonKhoChot(
  db: D1Database, khuVucMa: string | null, maLk: string, truocDon?: { id: string; ngay_tao: string },
): Promise<number> {
  if (!khuVucMa) return 0;
  const moc = await getMocTonKhoCongTy(db);
  const [tonGoc, tonPhatSinh] = await Promise.all([
    computeTonKhoGoc(db, khuVucMa, maLk),
    computeTonKhoPhatSinh(db, khuVucMa, maLk, moc, truocDon),
  ]);
  return tonGoc - tonPhatSinh;
}
