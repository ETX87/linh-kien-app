import type { ReactNode } from "react";
import { tn } from "../../i18n";

export type BadgeTone = "ocean" | "teal" | "amber" | "coral" | "orange" | "violet" | "gray";

// DESIGN_GUIDELINES.md §6.2 (chuyen doi 2026-09-26): NEN PASTEL + chu nhan dam, bo 10px (thay dang vien
// mong cua concept 1). `solid` van la loi thoat cho cho can to nen dac. Y nghia tung tone GIU NGUYEN
// nhu da chot truoc (vd violet = "tu choi", coral = "da huy" - xem constants.ts), chi doi kieu hien thi.
const TONE_MAP: Record<BadgeTone, [string, string]> = {
  ocean: ["bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]", "bg-[var(--color-primary)] text-white"],
  teal: ["bg-[var(--color-success-soft)] text-[var(--color-success)]", "bg-[var(--color-success)] text-white"],
  amber: ["bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]", "bg-[var(--color-warning)] text-white"],
  coral: ["bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]", "bg-[var(--color-danger)] text-white"],
  orange: ["bg-[var(--orange-100)] text-[var(--orange-700)]", "bg-[var(--orange-600)] text-white"],
  violet: ["bg-[var(--color-purple-soft)] text-[var(--color-purple-strong)]", "bg-[var(--color-purple)] text-white"],
  gray: ["bg-[var(--color-neutral-soft)] text-[var(--color-text-secondary)]", "bg-[var(--color-text-secondary)] text-white"],
};

export function Badge({ children, tone = "ocean", solid = false }: { children: ReactNode; tone?: BadgeTone; solid?: boolean }) {
  const cls = TONE_MAP[tone][solid ? 1 : 0];
  // whitespace-nowrap + shrink-0 (phan hoi 2026-08-28: "thẻ trạng thái tự ý xuống dòng") - trong 1
  // flex container hep (vd cum badge tren the mobile), Badge truoc day khong co gi ngan text TU VO
  // CHU khi bi ep hep (vd "Công nợ" -> "Công"/"nợ") - 1 badge/pill khong bao gio nen tu xuong dong
  // ben trong, luon giu nguyen 1 dong du container co phai wrap ca badge sang dong khac.
  return <span className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-[var(--radius-badge)] text-[11px] font-semibold leading-none whitespace-nowrap shrink-0 ${cls}`}>{tn(children)}</span>;
}

/** Suy ra tong mau tu chuoi trang thai vi pham (khop voi mockup statusTone). */
export function statusTone(status: string): BadgeTone {
  if (status.includes("đã xác nhận")) return "coral";
  if (status.includes("chờ QC")) return "amber";
  if (status.includes("Nghi ngờ")) return "ocean";
  if (status.includes("Không vi phạm")) return "teal";
  return "gray";
}
