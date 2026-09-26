import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

// Drawer phai (desktop) / BottomSheet full-height (mobile) - cung API. `mobile` do AppShell truyen.
export function Drawer({
  open,
  onClose,
  title,
  headerExtra,
  children,
  footer,
  nav,
  mobile = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  nav?: { hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void };
  mobile?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (nav && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        if (e.key === "ArrowLeft" && nav.hasPrev) nav.onPrev();
        if (e.key === "ArrowRight" && nav.hasNext) nav.onNext();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose, nav]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={
          mobile
            ? "sheet-in absolute inset-x-0 bottom-0 top-6 flex flex-col rounded-t-2xl bg-[var(--color-surface)] shadow-drawer"
            : "drawer-in absolute inset-y-0 right-0 flex w-full flex-col bg-[var(--color-surface)] shadow-drawer"
        }
        style={mobile ? undefined : { maxWidth: "var(--drawer-w)" }}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
          <div className="flex min-w-0 items-center gap-2">{title}</div>
          <div className="flex shrink-0 items-center gap-1">
            {nav && (
              <>
                <button onClick={nav.onPrev} disabled={!nav.hasPrev} className="focus-ring grid h-7 w-7 place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30">
                  <Icon.chevronLeft size={16} />
                </button>
                <button onClick={nav.onNext} disabled={!nav.hasNext} className="focus-ring grid h-7 w-7 place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30">
                  <Icon.chevronRight size={16} />
                </button>
              </>
            )}
            {headerExtra}
            <button onClick={onClose} className="focus-ring grid h-7 w-7 place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">
              <Icon.x size={16} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
