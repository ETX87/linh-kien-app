// Quyen them/sua/xoa nhom linh kien thay the (tuong duong) - ban sao FE cua suaThayThe o backend/src/routes/lkSettings.ts,
// doi 1 ben phai doi ca 2. Chot 2026-10-22 (v1.390): ngoai nguoi sua linh kien (Quan ly danh muc LK / Mua hang / Admin) con
// Kho, Ke toan, Giam sat - "xây dựng công cụ để kho, hoặc kế toán, giám sát cho phép tạo, sửa, thay đổi các danh sách linh kiện tương đương".
type U = {
  quan_ly_danh_muc_lk?: boolean | number | null;
  la_mua_hang?: boolean | number | null;
  la_kho?: boolean | number | null;
  la_ke_toan?: boolean | number | null;
  vai_tro?: string | null;
} | null | undefined;

export function coQuyenSuaThayThe(u: U): boolean {
  if (!u) return false;
  return !!u.quan_ly_danh_muc_lk || !!u.la_mua_hang || !!u.la_kho || !!u.la_ke_toan
    || u.vai_tro === "Admin" || u.vai_tro === "Giam sat";
}
