import type { CSSProperties, ReactNode } from "react";

// DESIGN_GUIDELINES.md §5: bo 12px, vien #F1F5F9 cuc mo, bong sieu nhe.
export function Card({ className = "", style, children, onClick }: { className?: string; style?: CSSProperties; children: ReactNode; onClick?: () => void }) {
  return (
    <div className={`bg-[var(--surface)] rounded-[var(--radius-card)] border border-[var(--color-border-soft)] shadow-[var(--shadow-card)] ${className}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}
