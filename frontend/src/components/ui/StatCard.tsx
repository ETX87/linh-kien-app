import type { ReactNode } from "react";
import { Card } from "./Card";
import type { BadgeTone } from "./Badge";

export function StatCard({
  label,
  value,
  sub,
  tone = "ocean",
  muted = false,
  active = false,
  onClick,
  size = "md",
}: {
  label: string;
  value: string | number;
  sub?: ReactNode;
  tone?: BadgeTone;
  /** Lam mo di khi so lieu = 0 (khong co viec can lam) - giu "cham mau" + so lon noi bat CHI cho gia
   * tri >0, tranh the "0" canh bao mau do/cam gay nhieu loan mat khi quet nhanh nhieu the lien tiep. */
  muted?: boolean;
  /** The nay dang la bo loc dang duoc chon (CHOT 2026-08-06) - vien 2px + nen nhat theo mau tone, thay
   * the cac cho tung tu viet rieng "ring-2 ring-[...]" o TranhChapModule.tsx truoc day (khong nhat
   * quan giua cac module) - dung 1 quy uoc chung cho MOI StatCard co the bam duoc trong app. */
  active?: boolean;
  onClick?: () => void;
  /** "sm" = the thu gon (CHOT 2026-08-16, "Phuong an A") - dung o cac luoi nhieu the day dac
   * (Quan ly ton), mac dinh "md" giu nguyen kich thuoc cu cho moi noi khac dang dung component nay. */
  size?: "md" | "sm";
}) {
  // Doi sang dung "kpi-card" cua concept 1 (2026-08-24): SO LIEU CHINH to mau theo tone (khong con
  // cham tron rieng) - vien 1px, hover chi doi mau vien + shadow nhe (khong nang/dich chuyen the nua).
  const numColor = { ocean: "var(--ocean-600)", teal: "var(--teal-600)", amber: "var(--amber-600)", coral: "var(--coral-600)", orange: "var(--orange-600)", gray: "var(--ink-900)" }[tone];
  const hoverCls = onClick ? "cursor-pointer transition-colors hover:border-[var(--indigo-600)] hover:shadow-[0_0_0_3px_var(--indigo-100)]" : "";
  if (size === "sm") {
    return (
      <Card
        className={`p-1.5 flex-1 min-w-[110px] ${hoverCls} ${active ? "border-[var(--indigo-600)] shadow-[0_0_0_3px_var(--indigo-100)]" : ""}`}
        onClick={onClick}
      >
        <span className="text-[10px] font-semibold text-[var(--ink-400)] uppercase tracking-wide leading-tight">{label}</span>
        <div className="font-display text-base sm:text-lg font-extrabold leading-tight mt-0.5" style={{ color: muted ? "var(--ink-400)" : numColor }}>
          {value}
        </div>
        {sub && <div className="text-[10px] text-[var(--ink-400)] leading-tight mt-0.5">{sub}</div>}
      </Card>
    );
  }
  return (
    <Card
      className={`p-3 sm:p-4 flex-1 min-w-[150px] ${hoverCls} ${active ? "border-[var(--indigo-600)] shadow-[0_0_0_3px_var(--indigo-100)]" : ""}`}
      onClick={onClick}
    >
      <span className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide">{label}</span>
      <div className="font-display text-xl sm:text-2xl font-extrabold mt-1.5" style={{ color: muted ? "var(--ink-400)" : numColor }}>
        {value}
      </div>
      {sub && <div className="text-xs text-[var(--ink-400)] mt-1">{sub}</div>}
    </Card>
  );
}
