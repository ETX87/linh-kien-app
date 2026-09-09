export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export function Tabs({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--line)] mb-4 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = active === t.key;
        // Chi hien badge khi count > 0 - tab "rong" (0) khong can hien "(0)" gay roi mat, vua giup
        // hang tab gon hon vua lam tab co du lieu THUC SU noi bat (giong bao hieu "co tin nhan moi").
        const hasCount = !!t.count;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            // Nen mau nhat (them UX audit 2026-09-08) - truoc day tab active CHI khac o vien duoi 2px,
            // de bi lan voi badge dem tron mau canh no (nguoi test tu nham nhieu lan khi chi luot qua).
            // Them nen + bo goc tren de tin hieu "dang chon" ro rang hon, khong doi bo cuc/kich thuoc.
            className={`focus-ring px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors flex items-center gap-1.5 rounded-t-lg ${
              isActive
                ? "border-[var(--ocean-800)] text-[var(--ocean-900)] bg-[var(--ocean-100)]"
                : hasCount
                  ? "border-transparent text-[var(--ink-700)] hover:text-[var(--ink-900)] hover:bg-slate-50"
                  : "border-transparent text-[var(--ink-400)] hover:text-[var(--ink-600)] hover:bg-slate-50"
            }`}
          >
            {t.label}
            {hasCount && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--coral-500)] text-white text-[10px] font-bold leading-none">
                {t.count! > 99 ? "99+" : t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
