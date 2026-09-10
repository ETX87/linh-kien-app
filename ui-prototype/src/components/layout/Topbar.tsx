import { Icon } from "../ui/Icon";
import { MODULE_TITLE, BREADCRUMB_ROOT } from "./nav";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { NotificationPanel } from "../ui/NotificationPanel";

// Top banner - DARK NAVY (khop yêu cầu người dùng 2026-09-10: "top banner cũng thế" - đồng bộ với menu)
export function Topbar({
  active,
  onToggleSidebar,
  onOpenSearch,
  onOpenTarget,
  mobile,
}: {
  active: string;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onOpenTarget: (t: { tab: string; id: string }) => void;
  mobile?: boolean;
}) {
  const root = BREADCRUMB_ROOT[active];

  if (mobile) {
    return (
      <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-2 border-b border-[var(--topbar-border)] bg-[var(--topbar-bg)] px-3 text-[var(--topbar-fg)]">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-[#2b74f0] to-[#12d3e6] text-[11px] font-extrabold text-white">3T</span>
        <span className="flex-1 truncate text-[15px] font-bold text-white">{MODULE_TITLE[active] ?? active}</span>
        <NotificationPanel onOpenTarget={onOpenTarget} onDark />
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-3 border-b border-[var(--topbar-border)] bg-[var(--topbar-bg)] px-4 text-[var(--topbar-fg)]">
      <button onClick={onToggleSidebar} className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--topbar-fg-dim)] hover:bg-white/10 hover:text-white">
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
        <span className="font-semibold text-white">{MODULE_TITLE[active] ?? active}</span>
      </nav>

      <button
        onClick={onOpenSearch}
        className="focus-ring mx-auto flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-btn)] border border-[var(--topbar-field-border)] bg-[var(--topbar-field-bg)] px-3 text-[13px] text-[var(--topbar-fg-dim)] hover:border-white/30 xl:max-w-[380px]"
      >
        <Icon.search size={15} className="shrink-0" />
        <span className="flex-1 truncate text-left">Tìm kiếm hoặc gõ lệnh...</span>
        <kbd className="shrink-0 rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold">Ctrl K</kbd>
      </button>

      <div className="flex min-w-0 shrink items-center gap-1">
        <NotificationPanel onOpenTarget={onOpenTarget} onDark />
        <PersonaSwitcher onDark />
      </div>
    </header>
  );
}
