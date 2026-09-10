import { Icon } from "../ui/Icon";

// Toi da 5 nut. Nut cuoi ("Thêm") mo panel menu day du (xem AppShell).
const TABS = [
  { key: "trang-chu", label: "Trang chủ", icon: Icon.home },
  { key: "mua-hang", label: "Mua hàng", icon: Icon.cart },
  { key: "tra-hang", label: "Trả hàng", icon: Icon.return },
  { key: "danh-muc-lk", label: "Danh mục", icon: Icon.catalog },
  { key: "__more", label: "Thêm", icon: Icon.menu },
];

export function BottomTabBar({
  active,
  onNavigate,
  onMore,
  moreActive,
}: {
  active: string;
  onNavigate: (k: string) => void;
  onMore: () => void;
  moreActive?: boolean;
}) {
  return (
    <nav className="flex h-14 shrink-0 items-stretch border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      {TABS.map((t) => {
        const on = t.key === "__more" ? moreActive : active === t.key;
        const IconCmp = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => (t.key === "__more" ? onMore() : onNavigate(t.key))}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
              on ? "text-[var(--color-primary)]" : "text-[var(--color-text-faint)]"
            }`}
          >
            <IconCmp size={19} />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
