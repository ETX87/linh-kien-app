import type { ReactNode } from "react";
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
  // DESIGN_GUIDELINES.md §2.4/§6.1 (chuyen doi 2026-09-26): cung bo .kpi-card pastel voi x/StatCard -
  // nen gradient theo tone, so lieu mau chu chinh, nhan 12px/600. Active = vien primary + glow.
  const kpiCls = muted
    ? "kpi-gray"
    : { ocean: "kpi-blue", teal: "kpi-green", amber: "kpi-amber", coral: "kpi-red", orange: "kpi-amber", violet: "kpi-purple", gray: "kpi-gray" }[tone];
  const hoverCls = onClick ? "cursor-pointer transition-shadow hover:shadow-[var(--shadow-pop)]" : "";
  const activeCls = active ? "!border-[var(--color-primary)] shadow-[0_0_0_3px_var(--color-primary-ring)]" : "";
  const numCls = muted ? "text-[var(--color-text-faint)]" : "text-[var(--color-text)]";
  if (size === "sm") {
    return (
      <div className={`kpi-card ${kpiCls} p-2 flex-1 min-w-[110px] ${hoverCls} ${activeCls}`} onClick={onClick}>
        <span className="text-[10.5px] font-semibold text-[var(--color-text-body)] leading-tight">{label}</span>
        <div className={`tabular text-lg font-extrabold leading-tight mt-0.5 ${numCls}`}>{value}</div>
        {sub && <div className="text-[10.5px] text-[var(--color-text-secondary)] leading-tight mt-0.5">{sub}</div>}
      </div>
    );
  }
  return (
    <div className={`kpi-card ${kpiCls} p-3.5 sm:p-4 flex-1 min-w-[150px] ${hoverCls} ${activeCls}`} onClick={onClick}>
      <span className="text-xs font-semibold text-[var(--color-text-body)]">{label}</span>
      <div className={`tabular text-[26px] sm:text-[28px] font-extrabold leading-none mt-2 ${numCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-[var(--color-text-secondary)] mt-1.5">{sub}</div>}
    </div>
  );
}
