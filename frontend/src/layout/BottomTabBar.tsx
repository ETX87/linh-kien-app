import { NAV_GROUPS } from "./navConfig";

// Bottom tab bar cho mobile (concept 1 "Structured Neutral" da duyet, 2026-08-24) - THEM MOI, khong
// thay the sidebar off-canvas (hamburger) hien co: sidebar van la duong vao qua muc "Thêm ⋯" cuoi
// thanh nay (da xac nhan voi chu he thong, giu nguyen chuc nang cu). Toi da 4 module thuc te hien co
// (xem navConfig.ts) nen KHONG can scroll ngang; neu sau nay allowedModules > 4, cac muc con lai van
// truy cap duoc qua "Thêm ⋯".
const MAX_TABS = 4;

export function BottomTabBar({ active, setActive, allowedModules, onOpenMore }: { active: string; setActive: (key: string) => void; allowedModules: string[]; onOpenMore: () => void }) {
  const allItems = NAV_GROUPS.flatMap((g) => g.items).filter((i) => allowedModules.includes(i.key));
  const shown = allItems.slice(0, MAX_TABS);
  const hasMore = allItems.length > MAX_TABS;

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-[var(--surface)] border-t border-[var(--line)] flex items-stretch" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {shown.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => setActive(it.key)}
          className={`focus-ring flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold ${
            active === it.key ? "text-[var(--ocean-800)]" : "text-[var(--ink-400)]"
          }`}
        >
          <span className="text-base leading-none">{it.icon}</span>
          <span className="truncate max-w-full px-1">{it.label}</span>
        </button>
      ))}
      <button type="button" onClick={onOpenMore} className="focus-ring flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold text-[var(--ink-400)]">
        <span className="text-base leading-none">⋯</span>
        <span>{hasMore ? "Thêm" : "Menu"}</span>
      </button>
    </nav>
  );
}
