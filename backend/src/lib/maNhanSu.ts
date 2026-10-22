// MÃ NHÂN SỰ (chot 2026-10-22, migration 0096 - "tất cả các danh người dùng ktv, văn phòng đều có thêm cột mã nhân sự để điền mã nhân
// sự. khi tự động tạo tài khoản, mã nhân sự cũng sẽ tự được điền: mã nhân sự là mã dạng NS-xxxx"). Luu o users.ma_nhan_su (1 nguoi = 1 tai
// khoan, KTV lan van phong). Nguon tu dien = danh ba ETX nhan su (etx_nhan_su.ma_nhan_su "NS-001"...): khop Gmail (LOWER/TRIM) truoc, khong
// co thi qua ma KTV da lien ket (etx_nhan_su.ma_ktv -> ktv_lien_he.email_dang_nhap). CHI dien khi o con trong + ung vien DUY NHAT + ma chua
// thuoc tai khoan khac (khong ghi de ma Admin da sua tay). Moi tai khoan 1 ma, 1 ma chi 1 tai khoan (kiem tra o API, khong UNIQUE index vi
// du lieu cu co the trung).

/** Chuan hoa ma nhap tay: "" / null -> null; "ns-12" -> "NS-12"; sai dang -> "INVALID". */
export function chuanMaNhanSu(v: unknown): string | null | "INVALID" {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  return /^NS-\d{1,10}$/.test(s) ? s : "INVALID";
}

const THEO_GMAIL = (u: string) => `(SELECT e.ma_nhan_su FROM etx_nhan_su e WHERE LOWER(TRIM(e.gmail)) = LOWER(${u}.email))`;
const DEM_GMAIL = (u: string) => `(SELECT COUNT(*) FROM etx_nhan_su e WHERE LOWER(TRIM(e.gmail)) = LOWER(${u}.email))`;
const THEO_MA_KTV = (u: string) =>
  `(SELECT e.ma_nhan_su FROM etx_nhan_su e JOIN ktv_lien_he k ON k.ma_ktv = e.ma_ktv WHERE LOWER(k.email_dang_nhap) = LOWER(${u}.email))`;
const DEM_MA_KTV = (u: string) =>
  `(SELECT COUNT(*) FROM etx_nhan_su e JOIN ktv_lien_he k ON k.ma_ktv = e.ma_ktv WHERE LOWER(k.email_dang_nhap) = LOWER(${u}.email))`;

/** Dien ma nhan su con trong tu ETX - email = chi 1 tai khoan, bo trong = moi tai khoan. Tra so tai khoan vua dien. */
export async function dienMaNhanSuTuEtx(db: D1Database, email?: string): Promise<number> {
  const loc = email ? " AND users.email = ?" : "";
  const binds = email ? [email] : [];
  const lenh = (giaTri: string, dem: string) =>
    db.prepare(
      `UPDATE users SET ma_nhan_su = ${giaTri}
       WHERE ma_nhan_su IS NULL${loc} AND ${dem} = 1
         AND NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.ma_nhan_su = ${giaTri})`,
    ).bind(...binds);
  const [a, b] = await db.batch([lenh(THEO_GMAIL("users"), DEM_GMAIL("users")), lenh(THEO_MA_KTV("users"), DEM_MA_KTV("users"))]);
  return (a.meta.changes ?? 0) + (b.meta.changes ?? 0);
}
