// Nhom linh kien Karofi / B2B (2026-10-16, migration 0088). Ban sao FE cua backend/src/lib/nhomLk.ts - doi quy tac tu doan
// (doanNhomLk) phai doi CA 3 cho: file nay, backend/src/lib/nhomLk.ts, trigger trg_linh_kien_nhom_lk_i/u.
import { dichSau } from "../i18n";

export type NhomLk = "karofi" | "b2b";
export const NHOM_LK_LIST: NhomLk[] = ["karofi", "b2b"];
// Nhan hien thi - dich luc hien (t(NHOM_LK_LABEL[k])), file Excel giu nguyen tieng Viet.
export const NHOM_LK_LABEL: Record<NhomLk, string> = { karofi: dichSau("Linh kiện Karofi"), b2b: dichSau("Linh kiện B2B") };

/** "karofi" | "Linh kiện Karofi" | "B2B"... -> ma noi bo (dung cho o nhap / file import). */
export function chuanNhomLk(v: unknown): NhomLk | null {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFC").trim().toUpperCase();
  if (!s) return null;
  if (s.includes("B2B")) return "b2b";
  if (s.includes("KAROFI") || s === "KRF") return "karofi";
  return null;
}

const TU_KHOA_KAROFI = ["KAROFI", "KRF", "LVT", "LIVOTEC", "KRH", "KORIHOME"];

/** Goi y nhom cho LK moi: ma dung 10 chu so HOAC ten chua Karofi/KRF/LVT/Livotec/KRH/Korihome -> Karofi, con lai B2B. */
export function doanNhomLk(ma: string | null | undefined, ten: string | null | undefined): NhomLk {
  if (/^[0-9]{10}$/.test((ma ?? "").trim())) return "karofi";
  const t = (ten ?? "").toUpperCase();
  return TU_KHOA_KAROFI.some((k) => t.includes(k)) ? "karofi" : "b2b";
}
