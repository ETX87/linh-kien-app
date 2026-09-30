// He thong "Cong no KTV" (them 04/09/2026, phan hoi nguoi dung - xem migration 0017 de biet day du
// boi canh/quyet dinh). Dung chung boi routes/ktvTonKho.ts (hien thi bang tong hop) VA
// routes/datMuaLinhKien.ts (chot danh_gia_cong_no luc tao don).
//
// "Moc tinh cong no" = thoi diem import ton kho MISA GAN NHAT (app_settings key=
// 'ktv_ton_kho_import_meta', xem routes/ktvTonKho.ts POST /import) - moi lan import GHI DE toan bo
// ktv_ton_kho nen day la 1 moc DUY NHAT dung chung cho MOI KTV, khong phai truong rieng tung KTV.
// Chua tung import lan nao -> null (coi nhu "tu dau", khong loc theo thoi gian o computeCongNoPhatSinh).
export async function getMocTinhCongNo(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT updated_at FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ updated_at: string }>();
  return row?.updated_at ?? null;
}

// "Cong no thuc te" = tong (so luong ton kho cuoi ky x gia tri cong no cua linh kien do) cho 1 KTV -
// khop ktv_ton_kho.ma_hang voi linh_kien.ma_linh_kien TRUC TIEP (xac nhan nguoi dung: MISA "Mã hàng"
// luon giong het "Mã linh kiện" trong danh muc). Linh kien khong co gia_tri_cong_no (chua dat) tinh
// la 0, khong loai tru dong do khoi tong.
export async function computeCongNoThucTe(db: D1Database, maKtv: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(t.cuoi_ky * COALESCE(lk.gia_tri_cong_no, 0)), 0) as gia_tri
       FROM ktv_ton_kho t
       LEFT JOIN linh_kien lk ON lk.ma_linh_kien = t.ma_hang
       WHERE t.ma_ktv = ?`,
    )
    .bind(maKtv)
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

// "Cong no phat sinh" = tong so_tien_cong_no cua cac dong don loai_don='cong_no' DA duoc TN duyet
// ("TN da duyet" - trang thai DONG cua state machine mua/cong_no, xem CLAUDE.md), tinh TU moc tinh
// cong no tro di (dat_don_hang.updated_at > moc - dung updated_at vi day la trang thai DONG, khong
// doi tiep nen updated_at chinh la luc chuyen vao trang thai nay). mocTinhCongNo=null (chua tung
// import) -> khong loc theo thoi gian (tinh tu dau).
export async function computeCongNoPhatSinh(db: D1Database, maKtv: string, mocTinhCongNo: string | null): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(ddh.so_tien_cong_no), 0) as gia_tri
       FROM dat_don_hang ddh
       JOIN ktv_lien_he k ON k.email_dang_nhap = ddh.nguoi_nhan_hang
       WHERE k.ma_ktv = ? AND ddh.loai_don = 'cong_no' AND ddh.trang_thai_hien_tai = 'TN da duyet'
         -- Chot 2026-09-28: dong "TRỪ CÔNG NỢ" hoat dong nhu don MUA (KTV chuyen tien) - KHONG cong vao cong
         -- no phat sinh (khop laTruCongNo o lib/pxkRecalculate.ts; loai_de_xuat luu IN HOA).
         AND instr(COALESCE(ddh.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') = 0
         AND (? IS NULL OR ddh.updated_at > ?)`,
    )
    .bind(maKtv, mocTinhCongNo, mocTinhCongNo)
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

// "Cong no da tru" (chot 2026-09-30, nghiep vu "KTV chuyển tiền để đặt linh kiện A, TN và kế toán duyệt => dùng số
// tiền đó để giảm bớt công nợ của KTV đi linh kiện A"): don "TRỪ CÔNG NỢ" ma phieu da THANH TOAN DU (trang_thai_chuyen_tien
// 'TN da duyet' - Ke toan duyet hoac quy du tra het; phieu khong bi huy, don khong tu choi/huy) -> tru gia_tri_cong_no x SL
// thuc xuat cua LK do khoi cong no NGAY, khong cho lan import ton kho MISA sau. Chi tinh don tao SAU moc import (cung
// quy uoc tru ton kho KTV - lib/tonKhoKtv.ts: don truoc moc coi nhu file MISA da phan anh). Tinh lai moi lan (Ke toan
// huy khoan -> phieu ve "KTV da chuyen" -> tu het tru). SQL dung chung cho computeCongNoDaTru + CTE o ktvTonKho.ts GET /:
// alias `ddh` = dat_don_hang, 2 bind (moc, moc).
export const CONG_NO_DA_TRU_FROM_SQL = `
  JOIN phieu_xuat_kho_dong ctn_d ON ctn_d.dat_don_hang_id = ddh.id
  JOIN phieu_xuat_kho ctn_p ON ctn_p.id = ctn_d.phieu_xuat_kho_id
  LEFT JOIN linh_kien ctn_lk ON ctn_lk.ma_linh_kien = ddh.ma_lk`;
export const CONG_NO_DA_TRU_WHERE_SQL = `ddh.loai_don = 'cong_no' AND instr(COALESCE(ddh.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') > 0
  AND ddh.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')
  AND ctn_p.trang_thai_hien_tai <> 'Ke toan huy' AND ctn_p.trang_thai_chuyen_tien = 'TN da duyet'
  AND (? IS NULL OR ddh.ngay_tao > ?)`;
export const CONG_NO_DA_TRU_GIA_TRI_SQL = "COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) * COALESCE(ctn_lk.gia_tri_cong_no, 0)";

export async function computeCongNoDaTru(db: D1Database, maKtv: string, mocTinhCongNo: string | null): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(${CONG_NO_DA_TRU_GIA_TRI_SQL}), 0) as gia_tri
       FROM dat_don_hang ddh
       JOIN ktv_lien_he k ON k.email_dang_nhap = ddh.nguoi_nhan_hang
       ${CONG_NO_DA_TRU_FROM_SQL}
       WHERE k.ma_ktv = ? AND ${CONG_NO_DA_TRU_WHERE_SQL}`,
    )
    .bind(maKtv, mocTinhCongNo, mocTinhCongNo)
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

// "Cong no chot" = Cong no thuc te + Cong no phat sinh (cong thuc CHOT nguoi dung xac nhan) - Cong no da tru (don TRỪ
// CÔNG NỢ da thanh toan, 2026-09-30).
export async function computeCongNoChot(db: D1Database, maKtv: string): Promise<number> {
  const moc = await getMocTinhCongNo(db);
  const [thucTe, phatSinh, daTru] = await Promise.all([
    computeCongNoThucTe(db, maKtv),
    computeCongNoPhatSinh(db, maKtv, moc),
    computeCongNoDaTru(db, maKtv, moc),
  ]);
  return thucTe + phatSinh - daTru;
}

export type DanhGiaCongNo3Muc = "Vuot tran" | "Canh bao" | "Binh thuong" | null;

// 3 muc (CHOT nguoi dung, SUA 2026-09-04 - phan hoi "trường hợp ktv không có trần công nợ, tạo cảnh
// báo tương tự với trần công nợ = 0"): Tran chua dat (null) duoc coi NHU tran = 0, KHONG con tra ve
// null/bo qua danh gia nhu truoc - 1 KTV chua duoc gan tran nghia la CHUA duoc cap phep no gi ca, nen
// bat ky cong no chot > 0 nao cung la "Vuot tran" ngay. "null" van con trong type de tuong thich nguoc
// (khong con duong nao thuc su tra ve null nua, nhung cac noi goi/hien thi (vd DanhGiaCongNoBadge) van
// an toan neu gap gia tri null cu).
export function danhGiaCongNo3Muc(congNoChot: number, tranCongNo: number | null): DanhGiaCongNo3Muc {
  const tran = tranCongNo ?? 0;
  if (congNoChot > tran) return "Vuot tran";
  if (tran > 0 && congNoChot > 0.7 * tran) return "Canh bao";
  return "Binh thuong";
}
