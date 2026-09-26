import type { ReactNode } from "react";
import type { Tone } from "./Badge";
import { Icon } from "./Icon";

// DESIGN_GUIDELINES.md §2.4/§6.1 (chuyen doi 2026-09-26): the KPI pastel - nen gradient theo nhom, icon
// tron nen dam goc trai tren, watermark mo goc phai duoi, so lieu 28px/800 mau chu chinh. Mau tone ->
// bo pastel: info = Sky Cyan (dang chay), success = xanh la, warning = Amber (can lam), danger = do,
// purple = tim, neutral = trang/xam. Class .kpi-card/.kpi-* dinh nghia trong styles/tokens.css.
const KPI_CLASS: Record<Tone, string> = {
  info: "kpi-cyan",
  success: "kpi-green",
  warning: "kpi-amber",
  danger: "kpi-red",
  purple: "kpi-purple",
  neutral: "kpi-gray",
};

// Icon mac dinh theo y nghia nhom (khi noi goi khong truyen `icon`) - dung chung cho icon tron va watermark.
const DEFAULT_ICON: Record<Tone, (p: { size?: number }) => JSX.Element> = {
  info: Icon.package,
  success: Icon.check,
  warning: Icon.clock,
  danger: Icon.alert,
  purple: Icon.chart,
  neutral: Icon.file,
};

export function StatCard({
  label,
  value,
  tone = "info",
  icon,
  onClick,
  active,
  muted,
  sub,
  color,
  iconType,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  icon?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  muted?: boolean;
  /** Dong phu duoi so lieu (vd "89% tổng số", "Dự kiến: 12 tr") - khop the KPI cua demo. */
  sub?: ReactNode;
  /** Ghi de bo pastel (mac dinh suy tu tone) - vd "blue" cho chi so thuong hieu "Tổng đơn". */
  /** Component icon (vd Icon.cart) - dung cho CA icon tron lan watermark, de 2 cho luon khop nhau. */
  iconType?: (p: { size?: number }) => JSX.Element;
  color?: "blue" | "cyan" | "indigo" | "purple" | "amber" | "green" | "red" | "gray";
}) {
  const DefIcon = iconType ?? DEFAULT_ICON[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`focus-ring kpi-card group flex min-w-[150px] flex-1 items-start gap-3 p-3.5 text-left transition-shadow ${muted ? "kpi-gray" : color ? `kpi-${color}` : KPI_CLASS[tone]} ${
        active ? "!border-[var(--color-primary)] shadow-[0_0_0_3px_var(--color-primary-ring)]" : ""
      } ${onClick ? "cursor-pointer hover:shadow-[var(--shadow-pop)]" : "cursor-default"}`}
    >
      <span className="kpi-icon grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full">{icon ?? <DefIcon size={18} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold leading-tight text-[var(--color-text-body)]">{label}</span>
        <span className="mt-1.5 flex items-center gap-1.5">
          <span className={`text-[28px] font-extrabold leading-none tracking-tight ${muted ? "text-[var(--color-text-faint)]" : "text-[var(--color-text)]"}`}>{value}</span>
          {onClick && <Icon.arrowRight size={15} className="kpi-accent transition-transform group-hover:translate-x-0.5" />}
        </span>
        {sub && <span className="mt-1.5 block text-[11px] leading-snug text-[var(--color-text-secondary)]">{sub}</span>}
      </span>
      <span aria-hidden className="kpi-watermark pointer-events-none absolute -bottom-2 -right-1">
        <DefIcon size={52} />
      </span>
    </button>
  );
}
