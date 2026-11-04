import { useEffect, useRef, useState } from "react";
import { DropdownPortal } from "../../components/ui/DropdownPortal";
import { btnClasses } from "../../components/ui/Btn";
import { t } from "../../i18n";

// Gop cac nut tai du lieu thanh 1 nut "⬇ Tải xuống ▾" (v1.437, "thiết kế lại các chức năng này cho giao diện gọn hàng và sạch
// sẽ") - thanh cong cu danh sach Phieu xuat truoc co 5 nut tai rieng (chi tiet phieu / chi tiet don / 3 mau MISA).
export interface MucTai {
  nhan: string;
  moTa?: string;
  onClick: () => void;
  dangTai?: boolean;
  /** Muc dau tien cua 1 nhom moi -> ke vach ngan phia tren, `nhom` = tieu de nhom. */
  nhom?: string;
}

export function MenuTai({ muc, dangTai }: { muc: MucTai[]; dangTai?: boolean }) {
  const [mo, setMo] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => {
      const n = e.target as Node;
      if (anchorRef.current?.contains(n) || contentRef.current?.contains(n)) return;
      setMo(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMo(false);
    document.addEventListener("mousedown", dong);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", dong);
      document.removeEventListener("keydown", esc);
    };
  }, [mo]);

  return (
    <div ref={anchorRef} className="inline-flex">
      <button type="button" onClick={() => setMo((v) => !v)} className={btnClasses("ghost", "sm", "h-8")} aria-expanded={mo}>
        {dangTai ? t("Đang tải...") : t("⬇ Tải xuống")}
        <span className="text-[10px] text-[var(--ink-400)]">▾</span>
      </button>
      <DropdownPortal anchorRef={anchorRef} contentRef={contentRef} open={mo} maxHeight={360} minWidth={240} matchWidth className="rounded-lg py-1">
        {muc.map((m, i) => (
          <div key={m.nhan}>
            {m.nhom && (
              <div className={`px-3 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-[var(--ink-400)] ${i > 0 ? "mt-1 border-t border-[var(--line)]" : ""}`}>
                {m.nhom}
              </div>
            )}
            <button
              type="button"
              disabled={m.dangTai}
              onClick={() => {
                setMo(false);
                m.onClick();
              }}
              className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-[var(--color-subtle)] disabled:opacity-50"
            >
              <span className="whitespace-nowrap text-[13px] text-[var(--color-text-body)]">{m.dangTai ? t("Đang tải...") : m.nhan}</span>
              {m.moTa && <span className="text-[11px] leading-snug text-[var(--ink-400)]">{m.moTa}</span>}
            </button>
          </div>
        ))}
      </DropdownPortal>
    </div>
  );
}
