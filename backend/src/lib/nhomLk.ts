// Nhom linh kien Karofi / B2B (chot 2026-10-16, migration 0088 - giai thich day du o dau file migration).
// linh_kien.nhom_lk = 'karofi' | 'b2b'; users.kho_nhom_lk = NULL (ca 2) | 'karofi' | 'b2b' (Admin gan cho tai khoan Kho).
// Kho THUAN (laKhoThuan) da gan nhom: danh sach / so dem / chi tiet ticket "Thieu hang dat mua" + badge + thong bao ticket moi
// chi theo LK thuoc nhom do. Tai khoan Kho kiem TN/Ke toan/Admin khong bi loc (viec TN cua ho van can thay het).
import { laKhoThuan } from "./scopeDatMua";

export const NHOM_LK = ["karofi", "b2b"] as const;
export type NhomLk = (typeof NHOM_LK)[number];
export const NHOM_LK_LABEL: Record<NhomLk, string> = { karofi: "Linh kiện Karofi", b2b: "Linh kiện B2B" };

/** Quy gia tri nguoi dung gui / o file Excel ve ma noi bo: "karofi", "Linh kiện Karofi", "KAROFI", "b2b", "Linh kiện B2B"... */
export function chuanNhomLk(v: unknown): NhomLk | null {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFC").trim().toUpperCase();
  if (!s) return null;
  if (s.includes("B2B")) return "b2b";
  if (s.includes("KAROFI") || s === "KRF") return "karofi";
  return null;
}

const TU_KHOA_KAROFI = ["KAROFI", "KRF", "LVT", "LIVOTEC", "KRH", "KORIHOME"];

/** Quy tac tu doan - CUNG cong thuc trigger trg_linh_kien_nhom_lk_i/u (migration 0088) + ban sao FE frontend/src/lib/nhomLk.ts. */
export function doanNhomLk(ma: string | null | undefined, ten: string | null | undefined): NhomLk {
  const m = (ma ?? "").trim();
  if (/^[0-9]{10}$/.test(m)) return "karofi";
  // UPPER cua SQLite chi doi chu ASCII - tu khoa deu ASCII nen toUpperCase() cho cung ket qua.
  const t = (ten ?? "").toUpperCase();
  return TU_KHOA_KAROFI.some((k) => t.includes(k)) ? "karofi" : "b2b";
}

type UserNhom = { kho_nhom_lk?: string | null; la_kho?: boolean | number | null; la_tac_nghiep?: boolean | number | null; la_ke_toan?: boolean | number | null; vai_tro?: string | null };

/** Nhom LK ma tai khoan nay CHI xu ly (null = khong loc). */
export function khoNhomLkLoc(user: UserNhom): NhomLk | null {
  if (!laKhoThuan(user)) return null;
  return chuanNhomLk(user.kho_nhom_lk ?? null);
}

/** Dieu kien SQL loc dong theo nhom LK cua don (alias don co cot ma_lk). LK khong tim thay trong danh muc -> van hien (khong mat
 * ticket). Gia tri nhom da qua chuanNhomLk nen noi chuoi an toan (khong can bind - dung duoc trong cac truy van ghep san binds). */
export function locNhomLkSql(ddhAlias: string, nhom: NhomLk): string {
  return ` AND COALESCE((SELECT lk_nhom.nhom_lk FROM linh_kien lk_nhom WHERE lk_nhom.ma_linh_kien = ${ddhAlias}.ma_lk), '${nhom}') = '${nhom}'`;
}

/** Bo khoi danh sach nguoi nhan thong bao "viec moi" cua Kho cac tai khoan Kho THUAN da gan nhom KHAC nhom LK cua don. */
export async function locEmailKhoTheoNhomLk(db: D1Database, emails: string[], maLk: string | null | undefined): Promise<string[]> {
  if (!emails.length || !maLk) return emails;
  const lk = await db.prepare("SELECT nhom_lk FROM linh_kien WHERE ma_linh_kien = ?").bind(maLk).first<{ nhom_lk: string | null }>();
  const nhom = chuanNhomLk(lk?.nhom_lk ?? null);
  if (!nhom) return emails;
  const { results } = await db
    .prepare(
      `SELECT email, kho_nhom_lk, la_kho, la_tac_nghiep, la_ke_toan, vai_tro FROM users WHERE email IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(emails))
    .all<UserNhom & { email: string }>();
  const boQua = new Set(results.filter((u) => {
    const n = khoNhomLkLoc(u);
    return n !== null && n !== nhom;
  }).map((u) => u.email));
  return emails.filter((e) => !boQua.has(e));
}
