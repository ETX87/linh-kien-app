import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { tn } from "../../i18n";

export function FormField({ label, required, hint, children }: { label: string; required?: boolean; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {tn(label)}
        {required && <span className="text-[var(--color-danger)]"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[var(--color-text-faint)]">{tn(hint)}</span>}
    </label>
  );
}

const base =
  "w-full rounded-[var(--radius-btn)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-[13px] outline-none transition-colors placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-primary)] focus:shadow-[0_0_0_3px_var(--color-primary-soft)] disabled:bg-[var(--color-surface-soft)]";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-9 ${base} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`min-h-[64px] py-2 ${base} ${props.className ?? ""}`} />;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-9 ${base} ${className}`}>
      {placeholder && <option value="">{tn(placeholder)}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {tn(o.label)}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
      {tn(label)}
    </label>
  );
}
