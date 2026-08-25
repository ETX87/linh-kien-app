import { useEffect, useRef, useState } from "react";

// Tooltip "?" nho (hang muc #5, 2026-08-25: "Bỏ các đoạn text giải thích dài dòng cho vào icon ? nhỏ
// ở cuối cùng, chuyển hết về dạng tooltip. Di chuột vào mới hiện hoặc ấn vào để hiện.") - dieu khien
// hoan toan bang React state (KHONG dung native title=) vi title= khong hoat dong tren mobile cham
// (da ghi nhan lai o TaoDonTab.tsx truoc day) - ho tro CA hover (desktop) LAN tap/click (mobile).
export function Tooltip({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onOutside);
    return () => document.removeEventListener("click", onOutside);
  }, [open]);

  return (
    <span
      ref={ref}
      className={`relative inline-flex align-middle ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="focus-ring w-4 h-4 rounded-full bg-[var(--surface-200)] text-[var(--ink-500)] text-[10px] font-bold flex items-center justify-center hover:bg-[var(--ocean-100)] hover:text-[var(--ocean-800)] transition-colors"
        aria-label="Xem giải thích"
      >
        ?
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1.5 w-64 max-w-[80vw] bg-[var(--ink-900)] text-white text-xs leading-snug rounded-lg px-3 py-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </div>
      )}
    </span>
  );
}
