// So CONG NO DOI TAC (chot 2026-10-26, v1.403, migration 0099 - "MUA HÀNG CÔNG NỢ ĐỐI TÁC"). Tinh LUC DOC, khong luu so du:
//   Hien tai = Cong no ban dau + Tien MOI don doi tac con hieu luc (chua tu choi/huy) - Da thanh toan (doi_tac_thanh_toan 'Da ghi')
//   trong do "Da ghi no" = don nam trong phieu Ke toan DA CHOT (qua buoc "Chờ mã MISA", phieu khong huy), "Dang cho" = phan con lai
//   (don moi dat / chua chot) - van tinh vao Hien tai de giu cho, tranh dat vuot muc toi da.
//   Kha dung = Toi da - Hien tai. Dat don lam Hien tai vuot Toi da -> "Cho GS duyet" nhu don cong no vuot tran (lib/tuDongDuyet.ts).
// Tien 1 don = gia chot (neu TN nhap) hoac gia niem yet luc tao (gia_de_xuat) x SL thuc xuat (chua co thi SL de xuat) - CUNG cong thuc
// tinh tien dong doi tac trong tinhToanPxk (lib/pxkRecalculate.ts).

export const TIEN_DON_DOI_TAC_SQL = (a: string) =>
  `COALESCE(${a}.gia_chot, ${a}.gia_de_xuat, 0) * COALESCE(${a}.so_luong_thuc_xuat, ${a}.so_luong_de_xuat)`;
const DON_HIEU_LUC_SQL = (a: string) => `${a}.loai_don <> 'tra_hang' AND ${a}.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')`;
// Don da GHI NO: nam trong phieu da qua buoc Ke toan chot (khong con "Dang tao phieu" / "Cho ke toan" / da huy).
export const DON_DA_GHI_NO_SQL = (a: string) => `EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id
  WHERE pd.dat_don_hang_id = ${a}.id AND p.trang_thai_hien_tai NOT IN ('Dang tao phieu', 'Cho ke toan', 'Ke toan huy'))`;

export interface CongNoDoiTac {
  ma_misa: string;
  ten_misa: string;
  cong_no_ban_dau: number;
  cong_no_toi_da: number;
  bat_tat: number;
  ghi_chu: string | null;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string | null;
  da_ghi_no: number;
  dang_cho: number;
  da_thanh_toan: number;
  so_don: number;
  hien_tai: number;
  kha_dung: number;
}

/** Doc so cong no doi tac (ma = 1 danh sach ma MISA; bo trong = tat ca). */
export async function docCongNoDoiTac(db: D1Database, ma?: string[]): Promise<CongNoDoiTac[]> {
  const loc = ma && ma.length ? "WHERE UPPER(dt.ma_misa) IN (SELECT UPPER(value) FROM json_each(?))" : "";
  const { results } = await db
    .prepare(
      `SELECT dt.ma_misa, dt.ten_misa, dt.cong_no_ban_dau, dt.cong_no_toi_da, dt.bat_tat, dt.ghi_chu, dt.nguoi_cap_nhat, dt.ngay_cap_nhat,
         COALESCE((SELECT SUM(${TIEN_DON_DOI_TAC_SQL("d")}) FROM dat_don_hang d
                   WHERE UPPER(d.doi_tac_ma) = UPPER(dt.ma_misa) AND ${DON_HIEU_LUC_SQL("d")} AND ${DON_DA_GHI_NO_SQL("d")}), 0) AS da_ghi_no,
         COALESCE((SELECT SUM(${TIEN_DON_DOI_TAC_SQL("d")}) FROM dat_don_hang d
                   WHERE UPPER(d.doi_tac_ma) = UPPER(dt.ma_misa) AND ${DON_HIEU_LUC_SQL("d")} AND NOT ${DON_DA_GHI_NO_SQL("d")}), 0) AS dang_cho,
         (SELECT COUNT(*) FROM dat_don_hang d WHERE UPPER(d.doi_tac_ma) = UPPER(dt.ma_misa) AND ${DON_HIEU_LUC_SQL("d")}) AS so_don,
         COALESCE((SELECT SUM(tt.so_tien) FROM doi_tac_thanh_toan tt WHERE UPPER(tt.ma_doi_tac) = UPPER(dt.ma_misa) AND tt.trang_thai = 'Da ghi'), 0)
           AS da_thanh_toan
       FROM doi_tac_cong_no dt ${loc} ORDER BY dt.ten_misa`,
    )
    .bind(...(ma && ma.length ? [JSON.stringify(ma)] : []))
    .all<Omit<CongNoDoiTac, "hien_tai" | "kha_dung">>();
  return results.map((r) => {
    const hienTai = r.cong_no_ban_dau + r.da_ghi_no + r.dang_cho - r.da_thanh_toan;
    return { ...r, hien_tai: hienTai, kha_dung: r.cong_no_toi_da - hienTai };
  });
}

/** Ma MISA (ktv_lien_he) cua CAC ma KTV dang hoat dong gan Gmail - KTV chi duoc dat don doi tac cho chinh minh khi 1 trong cac ma
 *  nay co trong danh sach doi tac (chot 2026-10-26: "trường hợp KTV mà có trong danh sách CÔNG NỢ ĐỐI TÁC (dựa vào mã misa) thì mới được đặt"). */
export async function maMisaCuaEmail(db: D1Database, email: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT TRIM(ma_misa) AS m FROM ktv_lien_he WHERE LOWER(TRIM(email_dang_nhap)) = LOWER(?) AND COALESCE(ngung_hoat_dong, 0) = 0
         AND TRIM(COALESCE(ma_misa, '')) <> ''`,
    )
    .bind(email)
    .all<{ m: string }>();
  return results.map((r) => r.m);
}

/** Nguoi dat duoc chon MOI doi tac (TN - gom Ke toan lam thay -, Giam sat, Admin). Nguoi khac (KTV) chi duoc doi tac trung Ma MISA cua minh. */
export function duocChonMoiDoiTac(user: { vai_tro: string | null; la_tac_nghiep?: boolean | number | null; la_ke_toan?: boolean | number | null }): boolean {
  return user.vai_tro === "Admin" || user.vai_tro === "Giam sat" || !!user.la_tac_nghiep || !!user.la_ke_toan;
}
