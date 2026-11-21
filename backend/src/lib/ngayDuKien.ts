import { nowVN } from "./vnTime";

// Ngay du kien co hang (ticket thieu hang dat mua + thieu hang bao hanh) - v1.545, 21/11/2026.
// Truoc day chi kiem dang YYYY-MM-DD nen o <input type="date"> go nham nam (vd 01/01/1900) van luu duoc.
// Quy tac: ngay that, khong truoc hom nay (gio VN), khong qua 1 nam ke tu hom nay.
export const NGAY_DU_KIEN_TOI_DA_NGAY = 365;

/** 01/01/1900 = gia tri Mua hang tung dien khi chua biet ngay (o bat buoc) -> coi nhu TRONG (chot 21/11/2026). */
export function chuanNgayDuKien(s: string | null | undefined): string {
  const v = (s ?? "").trim();
  return v.startsWith("1900-") ? "" : v;
}

export function loiNgayDuKien(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return "NGAY_DU_KIEN_KHONG_HOP_LE";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.toISOString().slice(0, 10) !== v) return "NGAY_DU_KIEN_KHONG_HOP_LE";
  const homNay = nowVN().slice(0, 10);
  if (v < homNay) return "NGAY_DU_KIEN_TRONG_QUA_KHU";
  const toiDa = new Date(Date.parse(homNay + "T00:00:00Z") + NGAY_DU_KIEN_TOI_DA_NGAY * 86_400_000).toISOString().slice(0, 10);
  if (v > toiDa) return "NGAY_DU_KIEN_QUA_XA";
  return null;
}
