export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export function Tabs({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange: (key: string) => void }) {
  return (
    // DESIGN_GUIDELINES.md §6.3 (chuyen doi 2026-09-26): filter tab dang PILL - active nen primary chu
    // trang, inactive nen #F1F5F9 chu xam (class .filter-tab trong tokens.css). Thay kieu gach chan +
    // nen nhat cu; van giu tin hieu "dang chon" ro rang ma UX audit 2026-09-08 yeu cau.
    <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-0.5">
      {tabs.map((t) => {
        const isActive = active === t.key;
        // Chi hien badge khi count > 0 - tab "rong" (0) khong can hien "(0)" gay roi mat, vua giup
        // hang tab gon hon vua lam tab co du lieu THUC SU noi bat (giong bao hieu "co tin nhan moi").
        const hasCount = !!t.count;
        return (
          <button key={t.key} onClick={() => onChange(t.key)} className={`focus-ring filter-tab ${isActive ? "active" : ""}`}>
            {t.label}
            {hasCount && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-danger)] text-white text-[10px] font-bold leading-none">
                {t.count! > 99 ? "99+" : t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
