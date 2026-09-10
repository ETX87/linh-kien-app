import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { NAV_GROUPS } from "./navConfig";
import { Icon } from "../components/ui/Icon";
import { useIsMobile } from "../hooks/useMediaQuery";
import { APP_VERSION } from "../version";
import { api } from "../api/client";
import { pushOverlayClose } from "../lib/overlayStack";
import { TopBarActions } from "./TopBarActions";
import { InstallAppButton } from "./InstallAppButton";
import type { AppUser } from "../auth/AuthContext";
import type { ViewAsRole } from "../auth/viewAsRoles";

interface NotificationCounts {
  datMuaLk: { total: number };
  ktvLogChuaDoc: number;
}

// Sidebar — nền DARK NAVY (port P0, theo ui-prototype/UI_SPEC.md §3.1). Prop contract giữ nguyên
// như bản cũ để App.tsx không phải đổi.
export function Sidebar({
  active,
  setActive,
  allowedModules,
  collapsed,
  setCollapsed,
  mobileOpen,
  onMobileClose,
  role,
  user,
  realIsAdmin,
  viewAsRole,
}: {
  active: string;
  setActive: (key: string) => void;
  allowedModules: string[];
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  role: string;
  user: AppUser;
  realIsAdmin: boolean;
  viewAsRole: ViewAsRole | null;
}) {
  const isMobile = useIsMobile();
  useEffect(() => {
    if (!mobileOpen) return;
    return pushOverlayClose(onMobileClose);
  }, [mobileOpen, onMobileClose]);
  const { data: counts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<NotificationCounts>("/notifications/count"),
    refetchInterval: 5 * 60_000,
  });

  const showText = !collapsed || isMobile;

  const content = (
    <aside
      className={`h-full flex flex-col text-[var(--sidebar-fg)] transition-all duration-200 ${isMobile ? "w-64" : collapsed ? "w-[68px]" : "w-60"}`}
      style={{ background: "linear-gradient(180deg, var(--sidebar-bg-from), var(--sidebar-bg-to) 55%)" }}
    >
      <div className="flex items-center gap-2.5 px-4 h-16 shrink-0 border-b border-[var(--sidebar-border)]">
        <img src="/icon-192.png" alt="Đặt mua linh kiện" width={32} height={32} className="shrink-0 rounded-lg" />
        {showText && (
          <div className="leading-tight">
            <div className="text-[13px] font-extrabold tracking-tight text-white">Đặt hàng linh kiện</div>
            <div className="text-[11px] font-semibold text-[var(--sidebar-fg-dim)]">3T</div>
          </div>
        )}
      </div>

      {isMobile && (
        <div className="px-3 py-2.5 border-b border-[var(--sidebar-border)] shrink-0">
          <TopBarActions role={role} user={user} realIsAdmin={realIsAdmin} viewAsRole={viewAsRole} />
        </div>
      )}
      {isMobile && (
        <div className="px-2.5 pt-2 border-b border-[var(--sidebar-border)] shrink-0 pb-1">
          <InstallAppButton onNavigateAway={onMobileClose} />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto sidebar-scroll py-3 px-2.5">
        {NAV_GROUPS.map((g) => {
          const items = g.items.filter((i) => i.href || allowedModules.includes(i.key));
          if (items.length === 0) return null;
          return (
            <div key={g.label} className="mb-4">
              {showText && <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--sidebar-fg-dim)] px-2.5 mb-1.5">{g.label}</div>}
              {items.map((it) => {
                const count = !it.countKey || !counts ? 0 : it.countKey === "ktvLogChuaDoc" ? counts.ktvLogChuaDoc : counts.datMuaLk.total;
                const on = active === it.key;
                const IconCmp = (Icon as Record<string, ((p: { size?: number; className?: string }) => JSX.Element) | undefined>)[it.icon as string];
                const cls = `focus-ring w-full flex items-center gap-3 px-2.5 py-2 rounded-lg mb-0.5 text-[13px] font-semibold transition-colors ${
                  on ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-fg)]" : "text-[var(--sidebar-fg)] hover:bg-[var(--sidebar-hover-bg)]"
                }`;
                const inner = (
                  <>
                    <span className="w-[18px] shrink-0 flex items-center justify-center">
                      {IconCmp ? <IconCmp size={18} /> : <span className="text-base leading-none">{it.icon}</span>}
                    </span>
                    {showText && (
                      <>
                        <span className="truncate flex-1 text-left min-w-0">{it.label}</span>
                        {count > 0 && (
                          <span className="shrink-0 tabular grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </>
                    )}
                  </>
                );
                if (it.href) {
                  return (
                    <a key={it.key} href={it.href} className={cls} title={collapsed ? it.label : undefined}>
                      {inner}
                    </a>
                  );
                }
                return (
                  <button
                    key={it.key}
                    onClick={() => {
                      setActive(it.key);
                      if (isMobile) onMobileClose();
                    }}
                    className={cls}
                    title={collapsed ? it.label : undefined}
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="focus-ring m-2.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[var(--sidebar-fg-dim)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-fg)]"
        >
          <Icon.chevronLeft size={15} className={collapsed ? "rotate-180" : ""} />
          {showText && "Thu gọn sidebar"}
        </button>
      )}
      {showText && (
        <div className="px-3.5 pb-3 pt-1 text-[9px] leading-snug text-[var(--sidebar-fg-dim)] shrink-0">
          Hệ thống nội bộ không chia sẻ dưới mọi hình thức.
          <br />
          Phiên bản v{APP_VERSION}
        </div>
      )}
    </aside>
  );

  if (isMobile) {
    return (
      <div className={`fixed inset-0 z-50 ${mobileOpen ? "" : "pointer-events-none"}`}>
        <div onClick={onMobileClose} className={`absolute inset-0 bg-[rgba(9,30,66,0.5)] transition-opacity duration-200 ${mobileOpen ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute left-0 top-0 h-full transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>{content}</div>
      </div>
    );
  }

  return <div className="h-screen sticky top-0">{content}</div>;
}
