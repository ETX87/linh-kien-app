import { useQuery } from "@tanstack/react-query";
import { NAV_GROUPS } from "./navConfig";
import { useIsMobile } from "../hooks/useMediaQuery";
import { APP_VERSION } from "../version";
import { api } from "../api/client";
import { TopBarActions } from "./TopBarActions";
import { InstallAppButton } from "./InstallAppButton";
import { ThemeMenuButton } from "../theme/ThemeMenuButton";
import type { AppUser } from "../auth/AuthContext";
import type { ViewAsRole } from "../auth/viewAsRoles";

// Rut gon tu frontend/src/layout/Sidebar.tsx cua he DVBH goc - 2 nguon badge doc lap (them
// ktvLogChuaDoc 2026-08-26, xem countKey trong navConfig.ts).
interface NotificationCounts {
  datMuaLk: { total: number };
  ktvLogChuaDoc: number;
}

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
  // Chuong thong bao + avatar/tai khoan (hang muc #15, 2026-08-25) - CHI can khi render tren mobile
  // (TopBar da bi an han tren mobile, xem TopBar.tsx). Optional vi Sidebar desktop khong dung toi.
  role: string;
  user: AppUser;
  realIsAdmin: boolean;
  viewAsRole: ViewAsRole | null;
}) {
  const isMobile = useIsMobile();
  const { data: counts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<NotificationCounts>("/notifications/count"),
    refetchInterval: 5 * 60_000,
  });

  const content = (
    <aside
      className={`ripple-bg h-full flex flex-col transition-all duration-200 border-r border-[var(--line)] ${isMobile ? "w-64" : collapsed ? "w-[72px]" : "w-64"}`}
      style={{ background: "linear-gradient(180deg, var(--sidebar-from), var(--sidebar-to) 60%)" }}
    >
      <div className="flex items-center gap-2.5 px-4 h-16 shrink-0 border-b border-[var(--sidebar-highlight)]">
        <img src="/logo-37.png" alt="Đặt mua linh kiện" width={30} height={30} className="shrink-0 rounded-md" />
        {(!collapsed || isMobile) && (
          <div className="leading-tight">
            <div className="font-display font-extrabold text-[var(--sidebar-ink)] text-sm tracking-tight">ĐẶT MUA LINH KIỆN</div>
            <div className="text-[10px] text-[var(--sidebar-ink-dim)] font-medium">Hệ thống độc lập</div>
          </div>
        )}
      </div>
      {/* Avatar/tai khoan (hang muc #15, 2026-08-25) - TopBar da bi an han tren mobile nen day gio la
          noi DUY NHAT tren mobile de doi giao dien/dang xuat. */}
      {isMobile && (
        <div className="px-3 py-2.5 border-b border-[var(--sidebar-highlight)] shrink-0">
          <TopBarActions role={role} user={user} realIsAdmin={realIsAdmin} viewAsRole={viewAsRole} />
        </div>
      )}
      {/* Nut "Cai dat vao man hinh chinh" (hang muc #1, phan hoi 2026-08-26: "chỉ hiện trên mobile") -
          dat ngay duoi khoi TopBarActions, tren nav chinh. "Giao diện" (them 2026-08-26, phan hoi "ấn
          vào menu sẽ hiện ra") dat CANH ben - hien NGAY khi mo menu off-canvas, khong bat bam them vao
          avatar/dropdown cua TopBarActions moi thay (van con giu o do, dung cho desktop). */}
      {isMobile && (
        <div className="px-2.5 pt-2 border-b border-[var(--sidebar-highlight)] shrink-0 pb-1">
          <InstallAppButton onNavigateAway={onMobileClose} />
          <ThemeMenuButton />
        </div>
      )}
      <nav className="flex-1 overflow-y-auto sidebar-scroll py-3 px-2.5">
        {NAV_GROUPS.map((g) => {
          // "href" (lien ket ra ngoai, xem navConfig.ts) LUON hien cho MOI nguoi dang nhap, khong loc
          // qua allowedModules - muc do khong phai 1 view noi bo cua app nay nen khong co khai niem
          // "duoc cap quyen xem" giong cac module con lai.
          const items = g.items.filter((i) => i.href || allowedModules.includes(i.key));
          if (items.length === 0) return null;
          return (
            <div key={g.label} className="mb-4">
              {(!collapsed || isMobile) && <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--sidebar-ink-dim)] px-2.5 mb-1.5">{g.label}</div>}
              {items.map((it) => {
                const count = !it.countKey || !counts ? 0 : it.countKey === "ktvLogChuaDoc" ? counts.ktvLogChuaDoc : counts.datMuaLk.total;
                // Accent doi sang Navy dam (hang muc #10/#20, 2026-08-25) - xem giai thich o Btn.tsx.
                const itemClassName = `focus-ring w-full flex items-center gap-3 px-2.5 py-2 rounded-xl mb-0.5 text-sm font-semibold transition-colors border-l-[3px] ${
                  active === it.key
                    ? "bg-[var(--sidebar-highlight)] text-[var(--sidebar-ink)] border-[var(--ocean-800)]"
                    : "border-transparent text-[var(--sidebar-ink-mid)] hover:bg-[var(--sidebar-highlight)] hover:text-[var(--sidebar-ink)]"
                }`;
                const itemContent = (
                  <>
                    <span className="w-6 text-center text-base">{it.icon}</span>
                    {(!collapsed || isMobile) && (
                      <>
                        <span className="truncate flex-1 text-left min-w-0">{it.label}</span>
                        {count > 0 && <span className="shrink-0 text-xs text-[var(--sidebar-ink-dim)] font-medium">({count})</span>}
                      </>
                    )}
                  </>
                );
                // Muc "href" (them 2026-08-25) - dieu huong THAT sang he/app khac (khong phai
                // setActive noi bo), dung <a> chuan thay vi <button onClick> de trinh duyet tu xu ly
                // dieu huong "mượt" (khong can JS rieng), giu nguyen tab hien tai (khong target=_blank
                // - dung y "chuyển sang trang" cua nguoi dung, khac "mo tab moi").
                if (it.href) {
                  return (
                    <a key={it.key} href={it.href} className={itemClassName}>
                      {itemContent}
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
                    className={itemClassName}
                  >
                    {itemContent}
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
          className="focus-ring m-2.5 py-2 rounded-xl text-[var(--sidebar-ink-dim)] hover:bg-[var(--sidebar-highlight)] hover:text-[var(--sidebar-ink)] text-xs font-semibold"
        >
          {collapsed ? "»" : "« Thu gọn"}
        </button>
      )}
      {(!collapsed || isMobile) && (
        <div className="px-3.5 pb-3 pt-1 text-[9px] leading-snug text-[var(--sidebar-ink-dim)] shrink-0">
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
        <div onClick={onMobileClose} className={`absolute inset-0 bg-[rgba(6,32,51,0.45)] transition-opacity duration-200 ${mobileOpen ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute left-0 top-0 h-full transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>{content}</div>
      </div>
    );
  }

  return <div className="h-screen sticky top-0">{content}</div>;
}
