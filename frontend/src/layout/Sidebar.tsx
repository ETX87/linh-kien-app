import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { NAV_GROUPS, navCount, type NavCounts } from "./navConfig";
import { Icon } from "../components/ui/Icon";
import { useIsMobile } from "../hooks/useMediaQuery";
import { APP_VERSION } from "../version";
import { api } from "../api/client";
import { pushOverlayClose } from "../lib/overlayStack";
import { TopBarActions } from "./TopBarActions";
import { InstallAppButton } from "./InstallAppButton";
import type { AppUser } from "../auth/AuthContext";
import type { ViewAsRole } from "../auth/viewAsRoles";

// Sidebar — DESIGN_GUIDELINES.md §2.1/§4 (chuyển đổi 2026-09-26): rộng 261px, nền gradient xanh hoàng gia
// (--sidebar-gradient), item cao 40px bo 8px, active = nền trắng 25%. Prop contract giữ nguyên.
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
  stageMenuSlotRefs,
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
  // Slot long duoi muc "Đơn đặt hàng" (dat-mua-lk) / "Phiếu xuất" (phieu-xuat) de DatMuaLinhKienModule.tsx "portal"
  // menu giai doan hoa vao (them 2026-09-11, tach 2 slot 2026-09-29 - xem prop `stageMenuSlots` cua module do) - chi
  // 1 <div> rong, Sidebar KHONG biet/khong can biet noi dung ben trong no la gi.
  // Ham ref phai ON DINH (setter cua useState o App.tsx) - ref inline doi moi lan render se goi null/el lien tuc.
  stageMenuSlotRefs?: Partial<Record<"dat-mua-lk" | "phieu-xuat" | "tra-hang", (el: HTMLDivElement | null) => void>>;
}) {
  const isMobile = useIsMobile();
  useEffect(() => {
    if (!mobileOpen) return;
    return pushOverlayClose(onMobileClose);
  }, [mobileOpen, onMobileClose]);
  const { data: counts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<NavCounts>("/notifications/count"),
    refetchInterval: 5 * 60_000,
  });
  // "Hàng trả" (desktop, 2026-09-30): so = tong don tra hang cho Ke toan/Kho/QC xac nhan trong pham vi xem - CUNG query
  // (queryKey) voi menu con cua muc nay trong DatMuaLinhKienModule nen khong ton them request khi dang mo module.
  const coHangTra = !isMobile && allowedModules.includes("tra-hang");
  const { data: traHangCounts } = useQuery({
    queryKey: ["dat-mua-lk-don-hang-status-counts", "tra_hang"],
    queryFn: () => api.get<{ counts: Record<string, number> }>("/dat-mua-lk/don-hang-status-counts?loai_don=tra_hang"),
    enabled: coHangTra,
    refetchInterval: 5 * 60_000,
  });
  const tc = traHangCounts?.counts ?? {};
  const countsDu: NavCounts | undefined = counts
    ? { ...counts, hangTra: (tc["Cho ke toan duyet mem"] ?? 0) + (tc["Cho kho xac nhan"] ?? 0) + (tc["Cho QC xac nhan"] ?? 0) }
    : undefined;

  const showText = !collapsed || isMobile;

  const content = (
    <aside
      className={`relative overflow-hidden h-full flex flex-col text-[var(--sidebar-fg)] transition-all duration-200 ${isMobile ? "w-[min(261px,85vw)]" : collapsed ? "w-[var(--sidebar-w-collapsed)]" : "w-[var(--sidebar-w)]"}`}
      style={{ background: "var(--sidebar-gradient)" }}
    >
      <div className="flex items-center gap-2.5 px-4 h-16 shrink-0 border-b border-[var(--sidebar-border)]">
        <img src="/icon-192.png" alt="Đặt mua linh kiện" width={34} height={34} className="shrink-0 rounded-[10px] shadow-[var(--shadow-raise)]" />
        {showText && (
          <div className="leading-tight">
            <div className="text-[16px] font-bold tracking-tight text-white">Đặt hàng linh kiện</div>
            <div className="text-[11px] font-semibold text-[var(--sidebar-fg-dim)]">3T</div>
          </div>
        )}
      </div>

      {isMobile && (
        <div className="px-3 py-2.5 border-b border-[var(--sidebar-border)] shrink-0">
          <TopBarActions role={role} user={user} realIsAdmin={realIsAdmin} viewAsRole={viewAsRole} tone="dark" />
        </div>
      )}
      {isMobile && (
        <div className="px-2.5 pt-2 border-b border-[var(--sidebar-border)] shrink-0 pb-1">
          <InstallAppButton onNavigateAway={onMobileClose} />
        </div>
      )}

      <nav className="relative z-[1] flex-1 overflow-y-auto sidebar-scroll py-3 px-2.5">
        {NAV_GROUPS.map((g) => {
          const items = g.items.filter((i) => (i.href || allowedModules.includes(i.key)) && !(i.desktopOnly && isMobile));
          if (items.length === 0) return null;
          return (
            <div key={g.label} className="mb-4">
              {showText && <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--sidebar-fg-dim)] px-2.5 mb-1.5">{g.label}</div>}
              {items.map((it) => {
                const count = navCount(it.countKey, countsDu, coHangTra);
                const on = active === it.key;
                const IconCmp = (Icon as Record<string, ((p: { size?: number; className?: string }) => JSX.Element) | undefined>)[it.icon as string];
                const cls = `focus-ring w-full flex items-center gap-3 h-10 px-3.5 rounded-[8px] mb-0.5 text-[13.5px] transition-colors ${
                  on ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-fg)] font-semibold" : "text-[var(--sidebar-fg)] font-medium hover:bg-[var(--sidebar-hover-bg)]"
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
                          <span className="shrink-0 tabular grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[11px] font-bold text-white">
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </>
                    )}
                  </>
                );
                const itemEl = it.href ? (
                  <a href={it.href} className={cls} title={collapsed ? it.label : undefined}>
                    {inner}
                  </a>
                ) : (
                  <button
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
                // Slot menu giai doan hoa (them 2026-09-11) - long NGAY DUOI muc "Đặt mua linh kiện",
                // rong (empty:hidden) khi khong co gi portal vao (VD dang o module khac, hoac Sidebar
                // dang thu gon icon-only nen an luon showText). Xem stageMenuSlot o DatMuaLinhKienModule.tsx.
                if (it.key !== "dat-mua-lk" && it.key !== "phieu-xuat" && it.key !== "tra-hang") return <div key={it.key}>{itemEl}</div>;
                return (
                  <div key={it.key}>
                    {itemEl}
                    {showText && (
                      <div ref={stageMenuSlotRefs?.[it.key]} className="empty:hidden pl-[30px] pr-1 pb-1.5" />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>

      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="focus-ring relative z-[1] m-2.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[var(--sidebar-fg-dim)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-fg)]"
        >
          <Icon.chevronLeft size={15} className={collapsed ? "rotate-180" : ""} />
          {showText && "Thu gọn sidebar"}
        </button>
      )}
      {/* Sóng cyan trang trí chân sidebar (§4) - thuần thẩm mỹ, không bắt sự kiện. */}
      <svg aria-hidden className="pointer-events-none absolute bottom-0 left-0 w-full h-24 opacity-[0.18]" viewBox="0 0 261 96" preserveAspectRatio="none">
        <path d="M0 52 C 60 28, 120 76, 190 50 S 261 40, 261 40 L 261 96 L 0 96 Z" fill="var(--brand-cyan)" />
        <path d="M0 70 C 70 50, 140 92, 210 66 S 261 60, 261 60 L 261 96 L 0 96 Z" fill="var(--brand-cyan)" opacity="0.6" />
      </svg>
      {showText && (
        <div className="relative z-[1] px-3.5 pb-3 pt-1 text-[10px] leading-snug text-[var(--sidebar-fg-dim)] shrink-0">
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
        <div onClick={onMobileClose} className={`absolute inset-0 bg-[var(--overlay)] transition-opacity duration-200 ${mobileOpen ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute left-0 top-0 h-full transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>{content}</div>
      </div>
    );
  }

  return <div className="h-screen sticky top-0">{content}</div>;
}
