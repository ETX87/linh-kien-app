import { nextSequentialId } from "./idCounter";
import { nowVN } from "./vnTime";

// KH le theo tung khach (chot 2026-10-09, migration 0074). Moi KH le = 1 NGUOI NHAN RIENG (users noi bo <ma>@khle.local + dong
// khach_le) nam duoi 1 "nhom" = tai khoan chung cu (KH_LE_MB / KH_LE_MN, bang khach_le_nhom). Dat hang cho nguoi nhan la tai
// khoan nhom -> nhap SDT (khong bat buoc) -> timHoacTaoKhachLe() tra email KH -> don ghi nguoi_nhan_hang = KH. Nho vay quy du,
// phieu xuat, chuyen tien, tra bang quy, tien theo don luc Cho hang, hoan tien... chay Y HET KTV ma khong sua co che quy.
// KH le KHONG nam trong ktv_lien_he (danh ba KTV dong bo sang DVBH/khovan/vipham, cong no, ETX...). Gia: KH le (ca KH lan tai
// khoan nhom) tinh GIA NIEM YET, khong chiet khau (laNguoiNhanKhLe, dung o pxkRecalculate.ts). Ma/ten MISA: ma MISA cua nhom
// ghi vao users.ma_misa cua KH; ten MISA lay tu nhom trong misaExport.ts (KHONG ghi users.ten_misa - se de len ten hien thi KH).

export interface NhomKhLe {
  ma_ktv: string;
  email: string;
  khu_vuc_ma: string | null;
  ma_misa: string | null;
  ten_hien_thi: string | null;
}

// SQL: email (cot) la nguoi nhan KH le - KH le hoac tai khoan nhom.
export const laEmailKhLeSql = (col: string) =>
  `(EXISTS (SELECT 1 FROM khach_le kl WHERE kl.email = ${col})
    OR EXISTS (SELECT 1 FROM khach_le_nhom kn JOIN ktv_lien_he kk ON kk.ma_ktv = kn.ma_ktv WHERE kk.email_dang_nhap = ${col}))`;

// Tai khoan nhom KH le theo email dang nhap (null = khong phai nhom).
export async function nhomKhLeTheoEmail(db: D1Database, email: string): Promise<NhomKhLe | null> {
  return await db
    .prepare(
      `SELECT k.ma_ktv, k.email_dang_nhap AS email, k.khu_vuc_ma, k.ma_misa, k.ten_hien_thi
       FROM khach_le_nhom n JOIN ktv_lien_he k ON k.ma_ktv = n.ma_ktv
       WHERE LOWER(TRIM(k.email_dang_nhap)) = LOWER(TRIM(?)) LIMIT 1`,
    )
    .bind(email)
    .first<NhomKhLe>();
}

// Danh sach email cac tai khoan nhom (FE hien o nhap SDT khi chon nguoi nhan la nhom).
export async function emailNhomKhLe(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT k.email_dang_nhap AS email FROM khach_le_nhom n JOIN ktv_lien_he k ON k.ma_ktv = n.ma_ktv WHERE k.email_dang_nhap IS NOT NULL")
    .all<{ email: string }>();
  return results.map((r) => r.email);
}

// Nguoi nhan (email) la KH le hoac nhom KH le -> tinh gia niem yet.
export async function laNguoiNhanKhLe(db: D1Database, email: string): Promise<boolean> {
  if (!email) return false;
  const r = await db.prepare(`SELECT ${laEmailKhLeSql("?1")} AS la`).bind(email).first<{ la: number }>();
  return !!r?.la;
}

// SDT Viet Nam: bo moi ky tu khong phai so, +84/84 -> 0. Hop le = 0 + 9-10 chu so. "" -> null (khong nhap). Sai -> "sai".
export function chuanHoaSdt(raw: string | null | undefined): string | null | "sai" {
  const so = (raw ?? "").replace(/\D/g, "");
  if (!so) return null;
  const sdt = so.startsWith("84") && so.length >= 11 ? "0" + so.slice(2) : so;
  return /^0\d{9,10}$/.test(sdt) ? sdt : "sai";
}

// "KH_LE_MB" -> "MB" (hau to tai khoan nhom, dung dat ma/ten KH).
function hauToNhom(maNhom: string): string {
  return maNhom.replace(/^KH[_-]?LE[_-]?/i, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "KL";
}

export interface KhachLe {
  ma: string;
  email: string;
  sdt: string | null;
  moi: boolean;
}

// Tim KH theo SDT trong nhom (co -> dung lai), khong co SDT / chua co -> tao moi (users noi bo + khach_le). Ma: KL<hau to>-<SDT>,
// khong SDT: KL<hau to>-A<so tu tang>. users: ten "KH lẻ <hau to> - <SDT|ma>", Da duyet (chi de lam FK nguoi nhan; email
// @khle.local khong dang nhap Google duoc), khu_vuc_dat_hang = khu vuc nhom (trigger 0055 tinh khu vuc cua don), ma_misa nhom.
export async function timHoacTaoKhachLe(db: D1Database, nhom: NhomKhLe, sdt: string | null, nguoiTao: string): Promise<KhachLe> {
  if (sdt) {
    const co = await db.prepare("SELECT ma, email, sdt FROM khach_le WHERE nhom_ma = ? AND sdt = ?").bind(nhom.ma_ktv, sdt).first<{ ma: string; email: string; sdt: string }>();
    if (co) return { ...co, moi: false };
  }
  const hau = hauToNhom(nhom.ma_ktv);
  const ma = sdt ? `KL${hau}-${sdt}` : (await nextSequentialId(db, "khach_le", `KL${hau}`, 6)).replace(/-(\d+)$/, "-A$1");
  const email = `${ma.toLowerCase()}@khle.local`;
  const now = nowVN();
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, khu_vuc_dat_hang, ma_misa)
         VALUES (?, ?, NULL, 'Da duyet', ?, ?) ON CONFLICT(email) DO NOTHING`,
      )
      .bind(email, `KH lẻ ${hau} - ${sdt ?? ma}`, nhom.khu_vuc_ma, nhom.ma_misa),
    db
      .prepare("INSERT INTO khach_le (ma, nhom_ma, sdt, email, nguoi_tao, ngay_tao) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(ma) DO NOTHING")
      .bind(ma, nhom.ma_ktv, sdt, email, nguoiTao, now),
  ]);
  // 2 nguoi tao cung luc cung SDT: dong cua nguoi kia thang (UNIQUE nhom_ma+sdt) - doc lai dong that.
  const that = await db.prepare("SELECT ma, email, sdt FROM khach_le WHERE ma = ?").bind(ma).first<{ ma: string; email: string; sdt: string | null }>();
  return { ma: that?.ma ?? ma, email: that?.email ?? email, sdt: that?.sdt ?? sdt, moi: true };
}
