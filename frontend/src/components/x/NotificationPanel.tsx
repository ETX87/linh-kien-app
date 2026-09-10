import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface NotifItem {
  id: string;
  icon: ReactNode;
  noiDung: ReactNode;
  thoiGian: string;
  chuaDoc: boolean;
}

// Props-driven (port P1). Dữ liệu thật + mark-read + deep-link do nơi gọi truyền vào (P2 wiring).
export function NotificationPanel({
  items,
  unread,
  onMarkAllRead,
  onItemClick,
  onDark,
  emptyText = "Chưa có thông báo.",
}: {
  items: NotifItem[];
  unread?: number;
  onMarkAllRead?: () => void;
  onItemClick?: (item: NotifItem) => void;
  onDark?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unreadCount = unread ?? items.filter((n) => n.chuaDoc).length;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`focus-ring relative grid h-9 w-9 place-items-center rounded-lg ${
          onDark ? "text-[var(--topbar-fg-dim)] hover:bg-white/10 hover:text-white" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
        }`}
        aria-label="Thông báo"
      >
        <Icon.bell size={18} />
        {unreadCount > 0 && (
          <span className="tabular absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="anim-in absolute right-0 top-11 z-50 w-[340px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-drawer">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
            <span className="text-[13px] font-bold">Thông báo</span>
            {onMarkAllRead && (
              <button onClick={onMarkAllRead} className="focus-ring text-[12px] font-semibold text-[var(--color-primary)] hover:underline">
                Đánh dấu đã đọc hết
              </button>
            )}
          </div>
          <ul className="max-h-[360px] overflow-y-auto">
            {items.length === 0 && <li className="px-3 py-6 text-center text-[12px] text-[var(--color-text-secondary)]">{emptyText}</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    onItemClick?.(n);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2.5 border-b border-[var(--color-border)] px-3 py-2.5 text-left last:border-0 hover:bg-[var(--color-surface-hover)]"
                >
                  <span className="mt-0.5 text-[15px]">{n.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-[var(--color-text)]">{n.noiDung}</span>
                    <span className="text-[11px] text-[var(--color-text-faint)]">{n.thoiGian}</span>
                  </span>
                  {n.chuaDoc && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
