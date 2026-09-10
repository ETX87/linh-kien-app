import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "560px",
  fullScreenMobile = false,
  mobile = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  fullScreenMobile?: boolean;
  mobile?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  const full = fullScreenMobile && mobile;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-[rgba(9,30,66,.4)] backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={`anim-in relative flex max-h-full w-full flex-col rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-drawer ${full ? "!max-h-none min-h-full !rounded-none" : ""}`}
        style={{ maxWidth: full ? "100%" : width }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="text-[15px] font-bold text-[var(--color-text)]">{title}</h3>
          <button onClick={onClose} className="focus-ring grid h-7 w-7 place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">
            <Icon.x size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
