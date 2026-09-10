import type { AppUser } from "../auth/AuthContext";
import type { ViewAsRole } from "../auth/viewAsRoles";
import { TopBarActions } from "./TopBarActions";
import { Icon } from "../components/ui/Icon";
import { MODULE_TITLES, BREADCRUMB_ROOT } from "./navConfig";

// Top banner — nền DARK NAVY (port P0, theo ui-prototype/UI_SPEC.md §3.2). CHỈ render trên desktop
// (App.tsx: `{!isMobile && <TopBar .../>}`).
export function TopBar({
  active,
  role,
  user,
  realIsAdmin,
  viewAsRole,
  onToggleSidebar,
  onOpenCommandPalette,
  mobilePreviewOpen,
  onToggleMobilePreview,
  notificationBell,
}: {
  active: string;
  role: string;
  user: AppUser;
  realIsAdmin: boolean;
  viewAsRole: ViewAsRole | null;
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
  mobilePreviewOpen: boolean;
  onToggleMobilePreview: () => void;
  notificationBell?: React.ReactNode;
}) {
  const root = BREADCRUMB_ROOT[active];
  const title = MODULE_TITLES[active] ?? active;
  return (
    <header className="h-14 bg-[var(--topbar-bg)] text-[var(--topbar-fg)] border-b border-[var(--topbar-border)] flex items-center gap-3 px-4 sticky top-0 z-30">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Thu gọn menu"
        className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--topbar-fg-dim)] hover:bg-white/10 hover:text-white"
      >
        <Icon.menu size={18} />
      </button>
      <nav className="flex shrink-0 items-center gap-1.5 text-[13px]">
        <Icon.calendar size={14} className="text-[var(--topbar-fg-dim)]" />
        {root && (
          <>
            <span className="text-[var(--topbar-fg-dim)]">{root}</span>
            <Icon.chevronRight size={13} className="text-[var(--topbar-fg-dim)]" />
          </>
        )}
        <span className="font-semibold text-white">{title}</span>
      </nav>

      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="focus-ring mx-auto flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-btn)] border border-[var(--topbar-field-border)] bg-[var(--topbar-field-bg)] px-3 text-[13px] text-[var(--topbar-fg-dim)] hover:border-white/30 xl:max-w-[380px]"
      >
        <Icon.search size={15} className="shrink-0" />
        <span className="flex-1 truncate text-left">Tìm kiếm hoặc gõ lệnh...</span>
        <kbd className="shrink-0 rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold">Ctrl K</kbd>
      </button>

      <div className="flex min-w-0 shrink items-center gap-1">
        {notificationBell}
        <TopBarActions
          role={role}
          user={user}
          realIsAdmin={realIsAdmin}
          viewAsRole={viewAsRole}
          mobilePreviewOpen={mobilePreviewOpen}
          onToggleMobilePreview={onToggleMobilePreview}
        />
      </div>
    </header>
  );
}
