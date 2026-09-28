import { getMocTonKhoCongTy } from "./tonKhoCongTy";

// "Ton kho cua KTV" cho don "TRỪ CÔNG NỢ" (chot nguoi dung 2026-09-28): don TRỪ CÔNG NỢ KHONG doi chieu
// ton kho cong ty (lib/tonKhoCongTy.ts) ma doi chieu ton kho CUA CHINH nguoi nhan hang (ktv_ton_kho, import
// tu file MISA - cung moc import voi ton kho cong ty, app_settings 'ktv_ton_kho_import_meta').
//   - Ton goc      = tong cuoi_ky cua KTV cho ma hang (ktv_ton_kho, co the nhieu ma kho cung 1 KTV).
//   - Da tru       = tong SL (thuc xuat, chua co thi de xuat) cac don TRỪ CÔNG NỢ cua KTV (nguoi nhan hang),
//                    tao SAU moc import, CHUA bi tu choi/huy - tru NGAY TU LUC TAO DON (chot nguoi dung,
//                    giong co che giu hang cua ton kho cong ty). Tu dieu chinh khi don bi tu choi/huy/doi
//                    SL thuc xuat vi tinh lai tu du lieu don moi lan (khong ghi de ktv_ton_kho).
//   - Ton con lai  = Ton goc - Da tru (co the am, khong clamp).
// Du ton (ton con lai >= SL dat) -> POST /phieu-dat tu duyet; thieu -> giu "Cho TN duyet" cho TN xu ly tay.

// Dieu kien SQL nhan dien dong TRỪ CÔNG NỢ - khop laTruCongNo() (lib/pxkRecalculate.ts); loai_de_xuat luu
// IN HOA nen instr() la du (lower()/upper() cua SQLite khong xu ly chu co dau).
export const TRU_CONG_NO_SQL = (alias: string) => `instr(COALESCE(${alias}.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') > 0`;

const DA_TRU_WHERE = (alias: string) =>
  `${alias}.loai_don = 'cong_no' AND ${TRU_CONG_NO_SQL(alias)}
   AND ${alias}.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')
   AND (? IS NULL OR ${alias}.ngay_tao > ?)`;

export async function computeTonKtvGoc(db: D1Database, maKtv: string, maLk: string): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(cuoi_ky), 0) as gia_tri FROM ktv_ton_kho WHERE ma_ktv = ? AND ma_hang = ?")
    .bind(maKtv, maLk)
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

export async function computeTonKtvDaTru(db: D1Database, maKtv: string, maLk: string, moc: string | null): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat)), 0) as gia_tri
       FROM dat_don_hang ddh
       JOIN ktv_lien_he k ON k.email_dang_nhap = ddh.nguoi_nhan_hang
       WHERE k.ma_ktv = ? AND ddh.ma_lk = ? AND ${DA_TRU_WHERE("ddh")}`,
    )
    .bind(maKtv, maLk, moc, moc)
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

export async function computeTonKtvConLai(db: D1Database, maKtv: string, maLk: string): Promise<number> {
  const moc = await getMocTonKhoCongTy(db);
  const [goc, daTru] = await Promise.all([computeTonKtvGoc(db, maKtv, maLk), computeTonKtvDaTru(db, maKtv, maLk, moc)]);
  return goc - daTru;
}

/** SL da tru theo don TRỪ CÔNG NỢ cua 1 KTV, theo tung ma hang (man "Tồn kho công nợ KTV" > chi tiet). */
export async function daTruTheoMaHang(db: D1Database, maKtv: string): Promise<Map<string, { sl: number; ten_lk: string | null }>> {
  const moc = await getMocTonKhoCongTy(db);
  const { results } = await db
    .prepare(
      `SELECT ddh.ma_lk, MAX(ddh.ten_lk_snapshot) as ten_lk, COALESCE(SUM(COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat)), 0) as sl
       FROM dat_don_hang ddh
       JOIN ktv_lien_he k ON k.email_dang_nhap = ddh.nguoi_nhan_hang
       WHERE k.ma_ktv = ? AND ${DA_TRU_WHERE("ddh")}
       GROUP BY ddh.ma_lk`,
    )
    .bind(maKtv, moc, moc)
    .all<{ ma_lk: string; ten_lk: string | null; sl: number }>();
  return new Map(results.map((r) => [r.ma_lk, { sl: r.sl, ten_lk: r.ten_lk }]));
}
