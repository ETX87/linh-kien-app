import { useState, type ReactNode } from "react";
import { ChartEmpty } from "./ChartCard";
import { pct, useElementWidth } from "./chartUtils";
import { t } from "../../i18n";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
  /** Icon nho canh nhan (dung cho donut trang thai - trang thai khong bao gio chi dua vao mau). */
  icon?: ReactNode;
}

// Donut + chu thich co SO LUONG va % (khop "Phan loai phan anh" cua demo): tong o giua, khe 2px mau nen
// giua cac lat (khong ve vien), re chuot 1 lat -> cac lat khac mo di + giua hien lat dang chon. Chu
// thich nam PHAI khi du rong, xuong DUOI tren mobile (tu doi theo be rong khung, khong theo breakpoint).
export function DonutChart({
  segments,
  centerLabel = t("Tổng số"),
  formatValue = (v: number) => v.toLocaleString("vi-VN"),
  size = 168,
}: {
  segments: DonutSegment[];
  centerLabel?: string;
  formatValue?: (v: number) => string;
  size?: number;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const stacked = width > 0 && width < 380;
  const thickness = 24;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const nonZero = segments.filter((s) => s.value > 0);
  const gap = nonZero.length > 1 ? 3 : 0;

  let offset = 0;
  const arcs = nonZero.map((s) => {
    const len = (s.value / total) * C;
    const arc = { s, dash: Math.max(0.001, len - gap), offset };
    offset += len;
    return arc;
  });
  const active = hover ? segments.find((s) => s.key === hover) : null;

  return (
    <div ref={ref} className={`flex gap-5 ${stacked ? "flex-col items-center" : "items-center"}`}>
      {total === 0 ? (
        <ChartEmpty />
      ) : (
        <>
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Biểu đồ tròn, tổng ${formatValue(total)}`}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-subtle)" strokeWidth={thickness} />
              <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                {arcs.map(({ s, dash, offset: off }) => (
                  <circle
                    key={s.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={hover === s.key ? thickness + 4 : thickness}
                    strokeDasharray={`${dash} ${C - dash}`}
                    strokeDashoffset={-off}
                    opacity={hover && hover !== s.key ? 0.35 : 1}
                    className={`transition-[opacity,stroke-width] duration-150 ${s.onClick ? "cursor-pointer" : ""}`}
                    onPointerEnter={() => setHover(s.key)}
                    onPointerLeave={() => setHover(null)}
                    onClick={s.onClick}
                  />
                ))}
              </g>
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[24px] font-extrabold leading-none text-[var(--color-text)]">{formatValue(active ? active.value : total)}</span>
              <span className="mt-1 max-w-[96px] truncate text-[11px] text-[var(--color-text-secondary)]">{active ? active.label : centerLabel}</span>
            </div>
          </div>
          <ul className={`min-w-0 space-y-1 ${stacked ? "w-full" : "flex-1"}`}>
            {segments.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  disabled={!s.onClick}
                  onClick={s.onClick}
                  onPointerEnter={() => setHover(s.key)}
                  onPointerLeave={() => setHover(null)}
                  className={`focus-ring grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left text-[12px] transition-colors ${
                    hover === s.key ? "bg-[var(--color-subtle)]" : ""
                  } ${s.onClick ? "cursor-pointer hover:bg-[var(--color-subtle)]" : "cursor-default"}`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                  <span className="inline-flex min-w-0 items-center gap-1 truncate text-[var(--color-text-body)]">
                    {s.icon}
                    {s.label}
                  </span>
                  <span className="font-semibold text-[var(--color-text)]">{formatValue(s.value)}</span>
                  <span className="w-12 text-right text-[var(--color-text-secondary)]">{pct(s.value, total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
