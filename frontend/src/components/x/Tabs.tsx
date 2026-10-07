import { useIsMobile } from "../../hooks/useMediaQuery";
import { tn } from "../../i18n";

export interface TabDef {
  key: string;
  label: string;
  // Nhan rut gon dung tren mobile khi khong gian hep (vd "Mua hàng" -> "Mua") - phan hoi 2026-09-11:
  // "giao diện tiêu đề chưa tối ưu" (nhan dai + badge so dem xuong dong lam thanh tab lech cao). Neu
  // khong khai bao, mobile dung nguyen `label` (khong ep rut gon nhung tab chua can).
  shortLabel?: string;
  count?: number;
}

export function Tabs({ tabs, value, onChange, size = "md" }: { tabs: TabDef[]; value: string; onChange: (k: string) => void; size?: "sm" | "md" }) {
  const isMobile = useIsMobile();
  return (
    <div className="flex items-center gap-1 border-b border-[var(--color-border)]">
      {tabs.map((t) => {
        const active = t.key === value;
        const useShort = isMobile && t.shortLabel;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`focus-ring relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 font-semibold transition-colors ${
              size === "sm" ? "h-8 text-[12px]" : "h-10 text-[13px]"
            } ${active ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
          >
            {useShort ? (
              <>
                {tn(t.shortLabel)}
                {t.count != null && <span className="tabular">{` (x${t.count})`}</span>}
              </>
            ) : (
              <>
                {tn(t.label)}
                {t.count != null && (
                  <span className={`tabular rounded-full px-1.5 text-[11px] ${active ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]" : "bg-[var(--color-neutral-soft)] text-[var(--color-text-secondary)]"}`}>
                    {t.count}
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
