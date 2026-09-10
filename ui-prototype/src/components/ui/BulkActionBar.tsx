import type { ReactNode } from "react";

export function BulkActionBar({ count, children }: { count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="anim-in flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-primary)]/25 bg-[var(--color-primary-soft)] px-3 py-2">
      <span className="text-[13px] font-semibold text-[var(--color-primary)]">Đã chọn {count}</span>
      <span className="mx-0.5 h-4 w-px bg-[var(--color-primary)]/25" />
      {children}
    </div>
  );
}
