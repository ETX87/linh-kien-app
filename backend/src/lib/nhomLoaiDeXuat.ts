// Tach phieu xuat kho THEO LOAI DE XUAT (chot 2026-10-28 - "nếu khác loại đề xuất thì tách riêng phiếu ngoại trừ đơn MUA HÀNG + MUA HÀNG CÓ ID
// thì gộp chung 1 phiếu được"; truoc do phieu chi tach theo nguoi nhan + loai_don, nen CÔNG NỢ + HỖ TRỢ 0 ĐỒNG tung chung PCN-001432).
// 1 phieu chi chua don CUNG nhom loai de xuat; nhom = loai de xuat da chuan hoa, rieng "MUA HÀNG CÓ ID" quy ve "MUA HÀNG".
// Ban SQL (nhomLdeSql) va ban JS (nhomLoaiDeXuat) PHAI cho cung ket qua: UPPER() cua SQLite chi doi chu ASCII -> ban JS cung chi doi
// chu ASCII (khong dung toUpperCase() day du). Dung o: tu gom (pxkAutoBundle.ts), tao phieu tay, them dong, chuyen don (phieuXuatKho.ts).

const MUA_HANG = "MUA HÀNG";
const GOP_VAO_MUA_HANG = ["MUA HÀNG", "MUA HÀNG CÓ ID"];

export function nhomLoaiDeXuat(loaiDeXuat: string | null | undefined): string {
  const s = (loaiDeXuat ?? "").trim().replace(/[a-z]/g, (ch) => ch.toUpperCase());
  return GOP_VAO_MUA_HANG.includes(s) ? MUA_HANG : s;
}

/** Bieu thuc SQL nhom loai de xuat cua 1 cot (vd "d.loai_de_xuat"). */
export function nhomLdeSql(cot: string): string {
  return `CASE WHEN UPPER(TRIM(COALESCE(${cot}, ''))) IN (${GOP_VAO_MUA_HANG.map((x) => `'${x}'`).join(", ")}) THEN '${MUA_HANG}'
    ELSE UPPER(TRIM(COALESCE(${cot}, ''))) END`;
}

/** Dieu kien SQL: phieu `pxkIdExpr` KHONG co dong nao khac nhom `nhomExpr` (phieu trong = hop le). */
export function phieuCungNhomLdeSql(pxkIdExpr: string, nhomExpr: string): string {
  return `NOT EXISTS (SELECT 1 FROM phieu_xuat_kho_dong x_lde JOIN dat_don_hang d_lde ON d_lde.id = x_lde.dat_don_hang_id
    WHERE x_lde.phieu_xuat_kho_id = ${pxkIdExpr} AND ${nhomLdeSql("d_lde.loai_de_xuat")} <> ${nhomExpr})`;
}
