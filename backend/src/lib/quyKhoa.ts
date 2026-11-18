// KHOA QUY (2026-11-09, migration 0111) - 2 quy TACH BIET cua cung 1 nguoi nhan hang:
//   - Quy du cua KTV:                          khoa = email nguoi nhan hang (nhu truoc nay)
//   - "Quỹ KH chuyển khoản":         khoa = 'khhd:' + email nguoi nhan hang
// Ca 2 nam chung bang quy_ktv / quy_ktv_giao_dich (cot `email` = KHOA quy, khong phai FK users). Phieu xuat kho co quy_kh = 1 chi chua
// don kh_chuyen_khoan = 1 (trigger trg_pxk_dong_quy_kh) -> MOI ham tien cua phieu (canBangPxk, duyet / sua / huy khoan, phanBoQuy, tien
// don mang theo) phai lay khoa quy qua cac helper duoi day, KHONG dung thang pxk.nguoi_nhan_hang.

export const TIEN_TO_QUY_KH = "khhd:";

export function khoaQuy(email: string, quyKh: boolean | number | null | undefined): string {
  return quyKh ? TIEN_TO_QUY_KH + email : email;
}

export function laKhoaQuyKh(khoa: string | null | undefined): boolean {
  return !!khoa && khoa.startsWith(TIEN_TO_QUY_KH);
}

/** Khoa quy -> { email nguoi nhan hang, la quy KH }. */
export function giaiKhoaQuy(khoa: string): { email: string; quyKh: boolean } {
  return laKhoaQuyKh(khoa) ? { email: khoa.slice(TIEN_TO_QUY_KH.length), quyKh: true } : { email: khoa, quyKh: false };
}

/** Bieu thuc SQL khoa quy cua 1 phieu (`a` = alias phieu_xuat_kho). */
export const khoaQuyPxkSql = (a: string) => `(CASE WHEN COALESCE(${a}.quy_kh, 0) = 1 THEN '${TIEN_TO_QUY_KH}' || ${a}.nguoi_nhan_hang ELSE ${a}.nguoi_nhan_hang END)`;

/** Bieu thuc SQL khoa quy cua 1 don (`a` = alias dat_don_hang) - theo nguoi nhan hang + co KH chuyen khoan. */
export const khoaQuyDonSql = (a: string) => `(CASE WHEN COALESCE(${a}.kh_chuyen_khoan, 0) = 1 THEN '${TIEN_TO_QUY_KH}' || ${a}.nguoi_nhan_hang ELSE ${a}.nguoi_nhan_hang END)`;

export const TEN_QUY_KH = "Quỹ KH chuyển khoản";
