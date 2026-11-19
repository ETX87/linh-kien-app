import { congGioLamViec, parseGioVn } from "./gioLamViec";

/**
 * Tinh han "Ly do cham" cho 1 dong dat_don_hang (CHOT 2026-08-14 voi chu he thong; tu 2026-11-19 = 8 GIO LAM VIEC, xem
 * GIO_SLA_LY_DO_CHAM - phan mo ta 24h/T7-CN ben duoi la quy tac cu): 24h tinh tu luc
 * dong chuyen "Cho TN duyet" (dat_don_hang_log.ngay_xu_ly); neu han (cong thuc +24h don gian) roi
 * vao thu 7/CN thi day tiep TUNG NGAY cho den khi roi vao ngay thuong - vd tao thu 6 17h => han
 * thuc te la thu 2 17h (cong ca T7 lan CN, khong phai chi 1 ngay). Dung chung boi datMuaLinhKien.ts
 * (PATCH /don-hang/:id cho TN dien ly_do_cham) va phieuXuatKho.ts (chan cung luc TN gui "Cho ke toan").
 *
 * Cac cot ngay_xu_ly/nowVN() la chuoi "YYYY-MM-DD HH:MM:SS" gio VN "tho", KHONG phai UTC that (xem
 * vnTime.ts) - parse bang cach gan hau to "Z" de Date object doc dung gio/thu trong tuan ma khong bi
 * quy doi timezone them lan nua (Workers runtime chay UTC).
 */
function parseVnTime(s: string): Date {
  return parseGioVn(s);
}

/** So GIO LAM VIEC cua han "Ly do cham" (TN) + han tung giai doan tra hang. Doi 2026-11-19 (v1.527): 24h lich (day qua T7/CN)
 * -> 8 gio lam viec (lib/gioLamViec.ts - T2-T6 8h, T7 sang 4h, CN nghi). */
export const GIO_SLA_LY_DO_CHAM = 8;

export function tinhHanLyDoCham(choTnDuyetAt: string): Date {
  return congGioLamViec(parseVnTime(choTnDuyetAt), GIO_SLA_LY_DO_CHAM);
}

export function quaHanLyDoCham(choTnDuyetAt: string, nowVnStr: string): boolean {
  return parseVnTime(nowVnStr).getTime() > tinhHanLyDoCham(choTnDuyetAt).getTime();
}

/** Moc tinh han "Cho TN duyet" = MUON HON trong 2 moc: lan giai trinh gan nhat va lan vao "Cho TN duyet" gan nhat
 * (2026-09-29). Truoc day `last_giai_trinh_at ?? cho_tn_duyet_at` - don quay lai "Cho TN duyet" (vd sau khi Kho xac nhan
 * hang ve o ticket thieu LK) ma tung giai trinh tu lan truoc se bi tinh qua han NGAY vi moc giai trinh cu. Chuoi gio VN
 * "YYYY-MM-DD HH:MM:SS" so sanh duoc bang chu. Dung CHUNG cho moi noi tinh han (danh sach, chi tiet, duyet, PXK). */
export function mocTinhHanTn(lastGiaiTrinhAt: string | null | undefined, choTnDuyetAt: string | null | undefined): string | null {
  if (!lastGiaiTrinhAt) return choTnDuyetAt ?? null;
  if (!choTnDuyetAt) return lastGiaiTrinhAt;
  return lastGiaiTrinhAt > choTnDuyetAt ? lastGiaiTrinhAt : choTnDuyetAt;
}

/** Han 24h TUNG GIAI DOAN cua don TRA HANG (chot 2026-10-01): Ke toan duyet mem / Kho xac nhan / QC xac nhan / TN duyet tong -
 * moi buoc co 8 gio lam viec (tu 2026-11-19, cung tinhHanLyDoCham; truoc la 24h) tinh tu MOC XU LY CUOI cua giai doan truoc = lan dau don vao
 * trang thai hien tai sau lan doi trang thai gan nhat (log cung trang thai, vd QC tai anh, KHONG reset dong ho). Buoc dau chua co
 * log (don tao thang la tra hang) -> ngay_tao. Qua han ma bam Duyet/Tu choi -> bat buoc chon ly do cham (routes/traHang.ts).
 * `alias` = bang dat_don_hang (cot id/trang_thai_hien_tai/ngay_tao). */
export const TRA_HANG_GIAI_DOAN_HAN = ["Cho ke toan duyet mem", "Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong"] as const;
export function mocGiaiDoanTraHangSql(alias: string): string {
  return `COALESCE(
    (SELECT MIN(l.ngay_xu_ly) FROM tra_hang_log l WHERE l.dat_don_hang_id = ${alias}.id AND l.trang_thai = ${alias}.trang_thai_hien_tai
       AND l.id > COALESCE((SELECT MAX(l2.id) FROM tra_hang_log l2 WHERE l2.dat_don_hang_id = ${alias}.id AND l2.trang_thai <> ${alias}.trang_thai_hien_tai), 0)),
    ${alias}.ngay_tao)`;
}
/** Don tra hang "TU HUY" (chot 2026-11-18, v1.524 — "bước chờ kho (trả hàng) => đơn quá hạn 10 ngày cho vào danh sách hủy bỏ (do KTV không
 * gửi hàng). không đếm trong danh sách cần xử lý nữa. vẫn có thể vào danh sách đơn tự hủy để tìm nếu sau này hàng về muộn"):
 * don o "Cho kho xac nhan" qua TRA_HANG_TU_HUY_NGAY ngay tinh tu moc vao buoc. TINH LUC DOC, KHONG doi trang thai -> hang ve muon
 * Kho van xac nhan binh thuong (don tu quay ve luong). Dung CHUNG cho danh sach / so dem / badge / con ton. Khong bind. */
export const TRA_HANG_TU_HUY_NGAY = 10;
export function traHangTuHuySql(alias: string): string {
  return `(${alias}.loai_don = 'tra_hang' AND ${alias}.trang_thai_hien_tai = 'Cho kho xac nhan'
    AND ${mocGiaiDoanTraHangSql(alias)} <= datetime('now', '+7 hours', '-${TRA_HANG_TU_HUY_NGAY} days'))`;
}
export function quaHanGiaiDoanTraHang(trangThai: string | null | undefined, moc: string | null | undefined, nowVnStr: string): boolean {
  return !!moc && !!trangThai && (TRA_HANG_GIAI_DOAN_HAN as readonly string[]).includes(trangThai) && quaHanLyDoCham(moc, nowVnStr);
}
