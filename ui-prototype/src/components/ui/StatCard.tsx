import type { ReactNode } from "react";
import type { Tone } from "./Badge";
import { Icon } from "./Icon";

const NUM: Record<Tone, string> = {
  info: "text-[var(--color-info)]",
  success: "text-[var(--color-success)]",
  warning: "text-[#b9770e]",
  danger: "text-[var(--color-danger)]",
  purple: "text-[var(--color-purple)]",
  neutral: "text-[var(--color-text)]",
};
const TILE: Record<Tone, string> = {
  info: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-soft)] text-[#b9770e]",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  purple: "bg-[var(--color-purple-soft)] text-[var(--color-purple)]",
  neutral: "bg-[var(--color-neutral-soft)] text-[var(--color-text-secondary)]",
};
// Nen gradient nhat + vien theo tone (khop screenshot: "các khu vực này đều có màu khác nhau")
const SOFT: Record<Tone, string> = {
  info: "var(--color-info-soft)",
  success: "var(--color-success-soft)",
  warning: "var(--color-warning-soft)",
  danger: "var(--color-danger-soft)",
  purple: "var(--color-purple-soft)",
  neutral: "var(--color-neutral-soft)",
};
const EDGE: Record<Tone, string> = {
  info: "var(--color-info)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  purple: "var(--color-purple)",
  neutral: "var(--color-border-strong)",
};

export function StatCard({
  label,
  value,
  tone = "info",
  icon,
  onClick,
  active,
  muted,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  icon?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={
        active
          ? undefined
          : {
              background: `linear-gradient(140deg, ${SOFT[tone]} 0%, var(--color-surface) 60%)`,
              borderColor: `color-mix(in srgb, ${EDGE[tone]} 32%, var(--color-border))`,
            }
      }
      className={`focus-ring group flex min-w-[150px] flex-1 items-start gap-3 rounded-[var(--radius-card)] border p-3.5 text-left transition-colors ${
        active ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] shadow-[0_0_0_3px_var(--color-primary-soft)]" : ""
      } ${onClick ? "cursor-pointer hover:brightness-[0.985]" : "cursor-default"}`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${TILE[tone]}`}>{icon ?? <Icon.package size={18} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold leading-tight text-[var(--color-text-secondary)]">{label}</span>
        <span className="mt-1 flex items-center gap-1.5">
          <span className={`tabular text-[25px] font-extrabold leading-none ${muted ? "text-[var(--color-text-faint)]" : NUM[tone]}`}>{value}</span>
          {onClick && <Icon.arrowRight size={15} className="text-[var(--color-text-faint)] transition-transform group-hover:translate-x-0.5" />}
        </span>
      </span>
    </button>
  );
}
