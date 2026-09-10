export interface ChipOption {
  key: string;
  label: string;
  count?: number;
  icon?: string;
}

export function FilterChips({ options, value, onChange }: { options: ChipOption[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors ${
              active
                ? "bg-[var(--color-primary)] text-white"
                : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            {o.icon && <span>{o.icon}</span>}
            {o.label}
            {o.count != null && (
              <span className={`tabular rounded-full px-1.5 text-[11px] ${active ? "bg-white/25" : "bg-[var(--color-neutral-soft)] text-[var(--color-text-secondary)]"}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
