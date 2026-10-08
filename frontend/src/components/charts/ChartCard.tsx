import type { ReactNode } from "react";
import { t } from "../../i18n";

// Khung the bieu do (DESIGN_GUIDELINES.md §6 + demo): tieu de 14px/700, phu de 11px xam, link "Xem chi
// tiet →" goc phai. Dung .content-card (bo 12px, vien #F1F5F9, bong sieu nhe).
export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`content-card flex min-w-0 flex-col p-4 ${className}`}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="card-title leading-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-text-secondary)]">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

export function ChartLink({ children = t("Xem chi tiết"), onClick }: { children?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="focus-ring card-header-link shrink-0 whitespace-nowrap hover:underline">
      {children} →
    </button>
  );
}

export interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
}

// Chu thich: CHAM/VACH mau mang danh tinh, CHU giu mau chu (khong to chu theo mau series - quy tac dataviz).
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-[var(--color-text-body)]">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.dashed ? (
            <svg width="16" height="8" aria-hidden>
              <line x1="0" y1="4" x2="16" y2="4" stroke={it.color} strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
            </svg>
          ) : (
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} aria-hidden />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function ChartEmpty({ children = t("Chưa có dữ liệu trong kỳ này.") }: { children?: ReactNode }) {
  return <div className="grid h-full min-h-[120px] place-items-center rounded-[10px] bg-[var(--color-surface-soft)] text-xs text-[var(--color-text-faint)]">{children}</div>;
}
