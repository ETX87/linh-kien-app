// Ban sao FE cua backend/src/lib/ngayDuKien.ts (v1.545) - ngay du kien co hang: tu hom nay (gio VN) toi toi da 365 ngay.
// Doi quy tac thi doi ca 2 ben.
import { dichSau } from "../i18n";
export const NGAY_DU_KIEN_TOI_DA_NGAY = 365;

export function homNayVN(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}
export function ngayDuKienToiDa(): string {
  return new Date(Date.parse(homNayVN() + "T00:00:00Z") + NGAY_DU_KIEN_TOI_DA_NGAY * 86_400_000).toISOString().slice(0, 10);
}
/** Cau canh bao (tieng Viet, chua dich) hoac null khi hop le / de trong. */
export function canhBaoNgayDuKien(v: string): string | null {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return dichSau("Ngày không hợp lệ");
  if (v < homNayVN()) return dichSau("Ngày dự kiến không được trước hôm nay — kiểm tra lại năm");
  if (v > ngayDuKienToiDa()) return dichSau("Ngày dự kiến không được quá 1 năm kể từ hôm nay — kiểm tra lại năm");
  return null;
}
