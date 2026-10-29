import type { AppUser } from "../auth/AuthContext";

// Che do xem gon Bang gia cho KTV/Ve tinh thuan (2026-10-11) - KTV/Ve tinh KHONG co quyen sua / xet duyet / dac thu
// (TN, Ke toan) -> an LK dang tat, ma cho xet duyet / da doi ma. Dung chung DanhMucLinhKienModule (DanhMucTab,
// XemLinhKienDrawer) + o tim chung Ctrl+K (CommandPalette) - doi quy tac o day.
export function laKtvXemBangGia(u: Pick<AppUser, "la_ktv_dvbh" | "la_ve_tinh" | "quan_ly_danh_muc_lk" | "la_mua_hang" | "vai_tro" | "la_tac_nghiep" | "la_ke_toan"> | null | undefined): boolean {
  if (!u) return false;
  const canSua = !!u.quan_ly_danh_muc_lk || !!u.la_mua_hang || u.vai_tro === "Admin";
  const canDacThu = canSua || !!u.la_tac_nghiep || !!u.la_ke_toan;
  return !!(u.la_ktv_dvbh || u.la_ve_tinh) && !canSua && !canDacThu;
}
