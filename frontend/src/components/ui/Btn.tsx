import type { ButtonHTMLAttributes, ReactNode } from "react";

export type BtnVariant = "primary" | "ghost" | "subtle" | "danger" | "success";
export type BtnSize = "sm" | "md";

// DESIGN_GUIDELINES.md §6.4: nut chuan cao toi thieu 36px (md), ban thu gon 30px (sm) cho hang thao tac trong bang.
const SIZES: Record<BtnSize, string> = {
  sm: "min-h-[30px] px-2.5 py-1 text-xs",
  md: "min-h-9 px-3.5 py-1.5 text-[13px]",
};

// DESIGN_GUIDELINES.md §6.4 (chuyen doi 2026-09-26): nut chinh = xanh primary cua icon app (#1467E8),
// thay cho huong "Navy dam + Cam ruc" cu - cam gio CHI mang nghia "cho/can xu ly/uu tien" (§7.4), khong
// con dung cho hanh dong. Moi vung/modal toi da 1 nut primary, con lai dung ghost/subtle.
const VARIANTS: Record<BtnVariant, string> = {
  primary: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]",
  ghost: "bg-white text-[var(--color-text-body)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]",
  subtle: "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] hover:bg-[var(--kpi-blue-to)]",
  danger: "bg-white text-[var(--color-danger-strong)] border border-[var(--color-danger-soft)] hover:bg-[var(--color-danger-soft)]",
  success: "bg-[var(--color-success)] text-white hover:bg-[var(--color-success-strong)]",
};

// Tach rieng (UX audit 2026-09-08, van de #5 "input file tho pha vo design system") de FileButton.tsx
// dung chung dung 1 bo class voi Btn thay vi copy tay 2 noi - doi 1 cho la du.
export function btnClasses(variant: BtnVariant = "primary", size: BtnSize = "md", className = "") {
  return `focus-ring inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]} ${className}`;
}

interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  children: ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  // UI redesign (phan hoi Codex 2026-08-19, muc P1 "loading state ro rang tren button") - optional,
  // KHONG doi hanh vi cac noi goi cu chua truyen prop nay. Khi true: hien spinner nho canh label (giu
  // nguyen text, tranh nhay chu) + tu dong disable, khong can noi goi tu lam ca 2 viec.
  loading?: boolean;
}

export function Btn({ children, variant = "primary", size = "md", className = "", disabled, loading, ...rest }: BtnProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={btnClasses(variant, size, className)}
      {...rest}
    >
      {loading && (
        <svg className="h-3.5 w-3.5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
