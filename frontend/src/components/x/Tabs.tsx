export interface TabDef {
  key: string;
  label: string;
  count?: number;
}

export function Tabs({ tabs, value, onChange, size = "md" }: { tabs: TabDef[]; value: string; onChange: (k: string) => void; size?: "sm" | "md" }) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--color-border)]">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`focus-ring relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 font-semibold transition-colors ${
              size === "sm" ? "h-8 text-[12px]" : "h-10 text-[13px]"
            } ${active ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
          >
            {t.label}
            {t.count != null && (
              <span className={`tabular rounded-full px-1.5 text-[11px] ${active ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]" : "bg-[var(--color-neutral-soft)] text-[var(--color-text-secondary)]"}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
