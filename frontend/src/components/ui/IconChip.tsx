import type { ReactNode } from "react";

// Chip icon nho, nen mau nhat + vien mo (glow) - khop giao dien demo (phan hoi ra soat "giao diện demo
// không hề giống" 2026-09-09, xac nhan qua chup man hinh that + do mau pixel truc tiep tren 2 anh demo,
// KHONG doan mo): tieu de Drawer va cac SectionTitle trong drawer PXK deu co 1 icon nho dat trong khoi
// vuong bo goc, nen mau nhat + hieu ung "glow" mem xung quanh, KHAC hoan toan voi text thuan truoc day.
// `tone` chon cap mau nen/glow - "ocean" (xanh duong, mac dinh, dung cho da so) va "teal" (xanh la, rieng
// cho khoi "Chuyển tiền" - dung mau tien/thanh cong dong bo voi quy uoc "5 nhom mau trang thai" toan he).
export function IconChip({ icon, tone = "ocean", size = "md" }: { icon: ReactNode; tone?: "ocean" | "teal"; size?: "sm" | "md" }) {
  const bg = tone === "teal" ? "var(--teal-100)" : "var(--ocean-100)";
  const glow = tone === "teal" ? "var(--teal-500)" : "var(--ocean-400)";
  const dims = size === "md" ? "w-9 h-9 text-lg rounded-xl" : "w-5 h-5 text-[11px] rounded-md";
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${dims}`}
      style={{ background: bg, boxShadow: `0 0 0 6px color-mix(in srgb, ${glow} 10%, transparent)` }}
    >
      {icon}
    </span>
  );
}
