// Ten hien thi 1 nguoi (theo email) DUNG CHUNG toan he thong - chot 2026-09-30 ("thứ tự hiển thị tên người dùng,
// cái nào có trước hiển thị cái đó => mã ktv => tên kho misa => tên gmail => gmail"):
//   1. ktv_lien_he.ten_hien_thi (ten trong danh ba KTV - da chua san ma KTV, vd "(NS-1240) CTV ... - Ho ten")
//   2. ten MISA: ktv_lien_he.ten_misa, khong co thi users.ten_misa (van phong/GS khai o Users)
//   3. users.ten (ten tai khoan Google)
//   4. email
// Ban sao phia frontend: GET /api/auth/nguoi-directory (tra san ten theo dung thu tu nay) + formatPersonDisplay().
// Doi thu tu phai doi ca 2 noi.

const khongRong = (col: string) => `NULLIF(TRIM(${col}), '')`;

/** Bieu thuc SQL ten hien thi cua emailExpr - NULL neu khong co ten nao (khong fallback email). */
export const tenNguoiNullSql = (emailExpr: string) =>
  `COALESCE(` +
  `(SELECT ${khongRong("k.ten_hien_thi")} FROM ktv_lien_he k WHERE k.email_dang_nhap = ${emailExpr} AND ${khongRong("k.ten_hien_thi")} IS NOT NULL LIMIT 1), ` +
  `(SELECT ${khongRong("k.ten_misa")} FROM ktv_lien_he k WHERE k.email_dang_nhap = ${emailExpr} AND ${khongRong("k.ten_misa")} IS NOT NULL LIMIT 1), ` +
  `(SELECT COALESCE(${khongRong("u.ten_misa")}, ${khongRong("u.ten")}) FROM users u WHERE u.email = ${emailExpr}))`;

/** Nhu tenNguoiNullSql nhung khong co ten thi tra chinh email. */
export const tenNguoiSql = (emailExpr: string) => `COALESCE(${tenNguoiNullSql(emailExpr)}, ${emailExpr})`;

/** Map email -> ten hien thi (khong co ten thi email) cho 1 danh sach email - 1 truy van, 1 bind JSON. */
export async function tenNguoiMap(db: D1Database, emails: string[]): Promise<Map<string, string>> {
  const ds = [...new Set(emails.filter(Boolean))];
  if (ds.length === 0) return new Map();
  const { results } = await db
    .prepare(`SELECT j.value AS email, ${tenNguoiSql("j.value")} AS ten FROM json_each(?) j`)
    .bind(JSON.stringify(ds))
    .all<{ email: string; ten: string }>();
  return new Map(results.map((r) => [r.email, r.ten]));
}
