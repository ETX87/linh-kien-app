import type { AppUser } from "../types";

// Tai khoan CHI la KTV / Ve tinh (khong kiem vai tro van phong nao) - dung de chan/loc du lieu NOI BO o cac API chi can dang nhap
// (ra soat bao mat 2026-11-09: GET /settings/ktv-lien-he tra ca danh ba SDT/Gmail/cong no/han muc moi KTV, GET /settings/linh-kien
// tra gia du phong / gia EU cho ca KTV - giao dien an nhung goi API thang van lay duoc). Khop dieu kien cap menu "Danh sách KTV" o
// frontend App.tsx (KTV/Ve tinh khong co menu nay).
export function laKtvThuan(user: AppUser): boolean {
  if (!user.la_ktv_dvbh && !user.la_ve_tinh) return false;
  if (user.vai_tro) return false; // Admin / QC / Giam sat
  return !(user.la_kho || user.la_ke_toan || user.la_tac_nghiep || user.la_tp_dvbh || user.la_view || user.la_mua_hang || user.quan_ly_danh_muc_lk);
}
