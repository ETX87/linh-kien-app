import type { ReactNode } from "react";

// Nhan nhom noi dung trong Drawer/man hinh chi tiet (concept 1, pattern ".section-title") - chu hoa
// nho, mau nhat, dung de tach cac khoi thong tin (vd "Thông tin đơn" / "Lịch sử xử lý") thay cho tieu
// de <h4> tu viet rieng le truoc day.
export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`text-[11px] uppercase tracking-wider text-[var(--ink-400)] font-extrabold mt-4 mb-2 first:mt-0 ${className}`}>{children}</div>;
}
