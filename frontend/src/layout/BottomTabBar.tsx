import { useQuery } from "@tanstack/react-query";
import { NAV_GROUPS, navCount, type NavCounts } from "./navConfig";
import { Icon } from "../components/ui/Icon";
import { api } from "../api/client";

// Bottom nav mobile (port P0) — tối đa 4 mục + nút "Thêm" (mở Sidebar off-canvas). Nút "Thêm" là
// đường vào duy nhất tới các module còn lại + tài khoản/đăng xuất (xem Sidebar.tsx mobile).
const MAX_TABS = 4;

export function BottomTabBar({
  active,
  setActive,
  allowedModules,
  onOpenMore,
}: {
  active: string;
  setActive: (key: string) => void;
  allowedModules: string[];
  onOpenMore: () => void;
}) {
  const allItems = NAV_GROUPS.flatMap((g) => g.items).filter((i) => !i.href && allowedModules.includes(i.key));
  const shown = allItems.slice(0, MAX_TABS);
  const { data: counts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<NavCounts>("/notifications/count"),
    refetchInterval: 5 * 60_000,
  });

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex items-stretch h-14"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {shown.map((it) => {
        const count = navCount(it.countKey, counts);
        const on = active === it.key;
        const IconCmp = (Icon as Record<string, ((p: { size?: number }) => JSX.Element) | undefined>)[it.icon as string];
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => setActive(it.key)}
            className={`focus-ring flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
              on ? "text-[var(--color-primary)]" : "text-[var(--color-text-faint)]"
            }`}
          >
            <span className="relative">
              {IconCmp ? <IconCmp size={19} /> : <span className="text-base leading-none">{it.icon}</span>}
              {count > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-[3px] rounded-full bg-[var(--color-danger)] text-white text-[9px] font-bold leading-[15px] text-center">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </span>
            <span className="truncate max-w-full px-1">{it.label}</span>
          </button>
        );
      })}
      <button type="button" onClick={onOpenMore} className="focus-ring flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-[var(--color-text-faint)]">
        <Icon.menu size={19} />
        <span>Thêm</span>
      </button>
    </nav>
  );
}
