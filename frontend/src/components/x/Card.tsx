import type { ReactNode } from "react";
import { tn } from "../../i18n";

export function Card({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h4 className="text-[12px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">{tn(children)}</h4>
      {right}
    </div>
  );
}

export function KvRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[136px_1fr] gap-2 border-b border-[var(--color-border)]/60 py-[7px] text-[13px] last:border-0">
      <div className="text-[var(--color-text-secondary)]">{tn(label)}</div>
      <div className="font-medium text-[var(--color-text)]">{children}</div>
    </div>
  );
}
