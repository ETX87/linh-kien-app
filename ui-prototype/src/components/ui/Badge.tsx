import type { ReactNode } from "react";

export type Tone = "info" | "success" | "warning" | "danger" | "purple" | "neutral";

const LINE: Record<Tone, string> = {
  info: "border-[var(--color-info)]/45 text-[var(--color-info)]",
  success: "border-[var(--color-success)]/45 text-[var(--color-success)]",
  warning: "border-[var(--color-warning)]/50 text-[#b9770e]",
  danger: "border-[var(--color-danger)]/45 text-[var(--color-danger)]",
  purple: "border-[var(--color-purple)]/45 text-[var(--color-purple)]",
  neutral: "border-[var(--color-border-strong)] text-[var(--color-text-secondary)]",
};
const SOFT: Record<Tone, string> = {
  info: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-soft)] text-[#b9770e]",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  purple: "bg-[var(--color-purple-soft)] text-[var(--color-purple)]",
  neutral: "bg-[var(--color-neutral-soft)] text-[var(--color-text-secondary)]",
};

export function Badge({ children, tone = "info", variant = "line" }: { children: ReactNode; tone?: Tone; variant?: "line" | "soft" }) {
  const cls = variant === "soft" ? SOFT[tone] : `border ${LINE[tone]}`;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[2px] text-[11px] font-semibold leading-none ${cls}`}>{children}</span>;
}

// Map chuoi trang thai -> tone (khop mau tren screenshot 260910).
export function statusTone(s: string): Tone {
  if (/(TN đã duyệt|Đã duyệt|Hoàn thành|Đã về kho|Kho đã kết thúc|Chờ Trạm duyệt)/.test(s)) return "success";
  if (/(Từ chối|Quá hạn)/.test(s)) return "danger";
  if (/(Đã huỷ|Đã hủy)/.test(s)) return "neutral";
  if (/(Chờ TBP|Chờ kế toán|Chờ hàng)/.test(s)) return "warning";
  return "info"; // Chờ TN / Đang xử lý / Chờ kho / Chờ QC ...
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}

export function RoleChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[var(--chip-bg)] px-2 py-[2px] text-[10.5px] font-semibold text-[var(--chip-fg)]">
      {children}
    </span>
  );
}
