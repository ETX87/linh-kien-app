import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-[var(--color-text)]">{title}</h1>
        {subtitle && <div className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
