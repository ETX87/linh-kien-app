import type { ReactNode } from "react";

export type BadgeTone = "ocean" | "teal" | "amber" | "coral" | "orange" | "violet" | "gray";

// Doi sang dang VIEN MONG + chu mau (khong to nen dac) - concept 1 "Structured Neutral" da duyet
// (2026-08-24). `solid` (da co san truoc do) van la loi thoat cho cho nao thuc su can nhan manh dang
// to nen dac, khong doi API cua component.
const TONE_MAP: Record<BadgeTone, [string, string]> = {
  ocean: ["border border-[var(--ocean-500)]/50 text-[var(--ocean-700)]", "bg-[var(--ocean-500)] text-white"],
  teal: ["border border-[var(--teal-500)]/50 text-[var(--teal-600)]", "bg-[var(--teal-500)] text-white"],
  amber: ["border border-[var(--amber-500)]/50 text-[var(--amber-700)]", "bg-[var(--amber-500)] text-white"],
  coral: ["border border-[var(--coral-500)]/50 text-[var(--coral-600)]", "bg-[var(--coral-500)] text-white"],
  orange: ["border border-[var(--orange-500)]/50 text-[var(--orange-700)]", "bg-[var(--orange-500)] text-white"],
  // Them (2026-08-27, yeu cau "5 nhom mau trang thai: ... bị từ chối tô màu tím") - tai dung
  // --violet-* co san (truoc chi dung cho vien input noi bat rieng module Dat mua linh kien), danh
  // RIENG cho trang thai "tu choi" (xem constants.ts) de tach khoi "coral" (gio danh cho "da huy").
  violet: ["border border-[var(--violet-500)]/50 text-[var(--violet-700)]", "bg-[var(--violet-500)] text-white"],
  gray: ["border border-[var(--line)] text-[var(--ink-600)]", "bg-[var(--ink-500)] text-white"],
};

export function Badge({ children, tone = "ocean", solid = false }: { children: ReactNode; tone?: BadgeTone; solid?: boolean }) {
  const cls = TONE_MAP[tone][solid ? 1 : 0];
  return <span className={`inline-flex items-center gap-1 px-[7px] py-[1.5px] rounded text-[10.5px] font-bold tracking-wide ${cls}`}>{children}</span>;
}

/** Suy ra tong mau tu chuoi trang thai vi pham (khop voi mockup statusTone). */
export function statusTone(status: string): BadgeTone {
  if (status.includes("đã xác nhận")) return "coral";
  if (status.includes("chờ QC")) return "amber";
  if (status.includes("Nghi ngờ")) return "ocean";
  if (status.includes("Không vi phạm")) return "teal";
  return "gray";
}
