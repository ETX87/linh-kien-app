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

// ---------------------------------------------------------------------------------------------------------------------------------
// TACH PHIEU THEO YEU CAU HOA DON + KH CHUYEN KHOAN (2026-11-09, "Tách riêng các phiếu với các lựa chọn xuất hóa đơn khác nhau: ví dụ
// đơn MUA HÀNG (không xuất hóa đơn), MUA HÀNG (HĐ - Không thu phí), MUA HÀNG (HĐ - có thu phí), MUA HÀNG (HĐ - Xuất cho trạm)"):
// "nhom phieu" = nhom loai de xuat | nhom hoa don | co KH chuyen khoan (migration 0111). 1 phieu chi 1 nhom phieu. Phieu KHONG luu nhom -
// suy tu dong (giong nhom loai de xuat). JS va SQL phai cho CUNG ket qua.

const KHONG_HOA_DON = ["", "Không", "không", "KHÔNG", "Khong", "khong", "KHONG"];

/** Nhom hoa don: "" = khong yeu cau hoa don, con lai = chinh gia tri (da TRIM) - moi lua chon HĐ 1 nhom. */
export function nhomHoaDon(v: string | null | undefined): string {
  const s = (v ?? "").trim().normalize("NFC");
  return KHONG_HOA_DON.includes(s) ? "" : s;
}

/** Don co chon 1 hinh thuc xuat hoa don bat ky (ke ca "xuất cho Trạm") - dieu kien duoc tich "KH đã chuyển khoản về công ty". */
export const coChonHoaDon = (v: string | null | undefined) => nhomHoaDon(v) !== "";

export function nhomHoaDonSql(cot: string): string {
  return `(CASE WHEN TRIM(COALESCE(${cot}, '')) IN (${KHONG_HOA_DON.map((x) => `'${x}'`).join(", ")}) THEN '' ELSE TRIM(${cot}) END)`;
}

export function nhomPhieu(d: { loai_de_xuat: string | null | undefined; yeu_cau_hoa_don: string | null | undefined; kh_chuyen_khoan: number | boolean | null | undefined }): string {
  return `${nhomLoaiDeXuat(d.loai_de_xuat)}|${nhomHoaDon(d.yeu_cau_hoa_don)}|${d.kh_chuyen_khoan ? 1 : 0}`;
}

/** Bieu thuc SQL nhom phieu cua 1 don (`a` = alias dat_don_hang). */
export function nhomPhieuSql(a: string): string {
  return `(${nhomLdeSql(`${a}.loai_de_xuat`)} || '|' || ${nhomHoaDonSql(`${a}.yeu_cau_hoa_don`)} || '|' || COALESCE(${a}.kh_chuyen_khoan, 0))`;
}

/** Dieu kien SQL: phieu `pxkIdExpr` KHONG co dong nao khac nhom phieu `nhomExpr` (phieu trong = hop le). */
export function phieuCungNhomSql(pxkIdExpr: string, nhomExpr: string): string {
  return `NOT EXISTS (SELECT 1 FROM phieu_xuat_kho_dong x_np JOIN dat_don_hang d_np ON d_np.id = x_np.dat_don_hang_id
    WHERE x_np.phieu_xuat_kho_id = ${pxkIdExpr} AND ${nhomPhieuSql("d_np")} <> ${nhomExpr})`;
}
