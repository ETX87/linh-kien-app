import type { ReactNode } from "react";
import { IconChip } from "./IconChip";
import { tn } from "../../i18n";

// Nhan nhom noi dung trong Drawer/man hinh chi tiet (concept 1, pattern ".section-title") - chu hoa
// nho, dung de tach cac khoi thong tin (vd "Thông tin đơn" / "Lịch sử xử lý") thay cho tieu de <h4> tu
// viet rieng le truoc day.
// SUA (ra soat "giao diện demo không hề giống" 2026-09-09, do mau pixel truc tiep tren anh demo PXK -
// KHONG doan mo): mau chu truoc la --ink-400 (xam nhat) nhung anh demo la navy dam (~#303b70, gan nhat
// voi --ocean-800 san co cua he - dung lai token nay thay vi bia them 1 hex rieng). `icon` (moi) - 1 so
// SectionTitle trong drawer PXK co icon nho dat truoc chu (Ma MISA/Chuyen tien/Dong don hang/Lich su xu
// ly - xem PhieuXuatKhoTab.tsx), CHI truyen o nhung noi da doi chieu duoc voi anh demo, khong bia them.
export function SectionTitle({ children, icon, iconTone, className = "" }: { children: ReactNode; icon?: ReactNode; iconTone?: "ocean" | "teal"; className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--ocean-800)] font-extrabold mt-4 mb-2 first:mt-0 ${className}`}>
      {icon && <IconChip icon={icon} tone={iconTone} size="sm" />}
      {tn(children)}
    </div>
  );
}
