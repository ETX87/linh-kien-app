import type { ButtonHTMLAttributes, ReactNode } from "react";

export type BtnVariant = "primary" | "ghost" | "success" | "danger" | "danger-line" | "subtle";
export type BtnSize = "xs" | "sm" | "md";

const SIZES: Record<BtnSize, string> = {
  xs: "h-7 px-2 text-[12px] gap-1",
  sm: "h-8 px-2.5 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-[13px] gap-1.5",
};

const VARIANTS: Record<BtnVariant, string> = {
  primary: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]",
  ghost: "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]",
  success: "bg-[var(--color-success)] text-white hover:brightness-95",
  danger: "bg-[var(--color-danger)] text-white hover:brightness-95",
  "danger-line": "bg-[var(--color-surface)] text-[var(--color-danger)] border border-[var(--color-danger)]/40 hover:bg-[var(--color-danger-soft)]",
  subtle: "bg-[var(--color-primary-soft)] text-[var(--color-primary)] hover:brightness-95",
};

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  children: ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
}

export function Btn({ children, variant = "primary", size = "md", className = "", loading, disabled, ...rest }: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={`focus-ring inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-btn)] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <span className="spin inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
