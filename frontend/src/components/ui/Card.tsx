import type { CSSProperties, ReactNode } from "react";

export function Card({ className = "", style, children, onClick }: { className?: string; style?: CSSProperties; children: ReactNode; onClick?: () => void }) {
  return (
    <div className={`bg-[var(--surface)] rounded-xl border border-[var(--line)] shadow-[0_1px_2px_rgba(24,24,27,0.03)] ${className}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}
