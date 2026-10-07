// Kho xuat theo MIEN cua phieu xuat kho (chot 2026-10-07, migration 0070): mac dinh mien = suy tu ma khu vuc
// ("MB" -> Bac, "MN" -> Nam - cung quy tac file MISA tu truoc toi nay). TN/Ke toan duoc CHUYEN kho xuat cua ca
// phieu (`phieu_xuat_kho.mien_xuat`, NULL = theo khu vuc) khi phieu chua gui Kho ("Dang tao phieu"/"Cho ke toan").
// Phieu da chuyen: file MISA lay kho cua mien moi; bo loc khu vuc (danh sach/so dem/badge cua TN/Kho/Ke toan)
// coi phieu thuoc MIEN MOI - chi tai khoan co khu vuc thuoc mien do thay mac dinh, nguoi khac phai tu loc.
export type MienXuat = "bac" | "nam";

export const MIEN_XUAT_LABEL: Record<MienXuat, string> = { bac: "Miền Bắc", nam: "Miền Nam" };

// Trang thai phieu con duoc chuyen kho xuat (truoc khi Ke toan chot "Da chot xong don xuat" = giao sang Kho).
export const MIEN_XUAT_SUA_DUOC = ["Dang tao phieu", "Cho ke toan"];

export function mienTuMaKhuVuc(khuVucMa: string | null | undefined): MienXuat | null {
  if (!khuVucMa) return null;
  if (khuVucMa.includes("MB")) return "bac";
  if (khuVucMa.includes("MN")) return "nam";
  return null;
}

// Ban SQL cua mienTuMaKhuVuc (instr phan biet hoa/thuong - giong String.includes).
export function mienTuKhuVucSql(expr: string): string {
  return `(CASE WHEN instr(${expr}, 'MB') > 0 THEN 'bac' WHEN instr(${expr}, 'MN') > 0 THEN 'nam' END)`;
}

// Mien xuat HIEU LUC cua phieu = chon tay, khong co thi theo khu vuc cua phieu.
export function mienXuatHieuLucSql(alias = "pxk"): string {
  return `COALESCE(${alias}.mien_xuat, ${mienTuKhuVucSql(`${alias}.khu_vuc_ma`)})`;
}

// Phieu DA CHUYEN kho xuat khop 1 tap khu vuc khi tap co it nhat 1 khu vuc thuoc mien moi. `kvMaTable` = bang/subquery
// co cot `ma` (vd "(SELECT value AS ma FROM json_each(?))" hoac CTE "kv_ma"). Phieu chua chuyen (mien_xuat NULL) -> false.
export function pxkKhopMienXuatSql(alias: string, kvMaTable: string): string {
  return `EXISTS (SELECT 1 FROM ${kvMaTable} kvx WHERE ${mienTuKhuVucSql("kvx.ma")} = ${alias}.mien_xuat)`;
}
