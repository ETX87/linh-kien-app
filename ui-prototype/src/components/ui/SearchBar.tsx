import { Icon } from "./Icon";

export function SearchBar({
  value,
  onChange,
  placeholder = "Tìm kiếm…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`flex h-9 items-center gap-2 rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 ${className}`}>
      <Icon.search size={16} className="shrink-0 text-[var(--color-text-faint)]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--color-text-faint)]"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} className="focus-ring text-[var(--color-text-faint)] hover:text-[var(--color-text)]">
          <Icon.x size={14} />
        </button>
      )}
    </div>
  );
}
