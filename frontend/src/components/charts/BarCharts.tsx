import { useId, useState, type ReactNode } from "react";
import { ChartEmpty } from "./ChartCard";
import { niceScale, pct, useElementWidth } from "./chartUtils";
import { t } from "../../i18n";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}

// Cot dung (khop "Hieu suat xu ly theo khu vuc" cua demo): gradient dam->nhat tu dinh xuong day, bo 6px
// o dinh, neo day tai truc 0, so lieu ngay tren dinh (it cot, doc ngay khong can re chuot). Moi cot 1
// mau CHI khi moi cot la 1 THUC THE khac nhau (vd 5 buoc PXK) - xep hang nguoi dung 1 mau (xem HBarList).
export function VBarChart({
  bars,
  height = 210,
  formatValue = (v: number) => v.toLocaleString("vi-VN"),
}: {
  bars: BarDatum[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const uid = useId().replace(/:/g, "");
  const padL = 30;
  const padT = 20;
  const padB = 6;
  const plotW = Math.max(0, width - padL);
  const plotH = height - padT - padB;
  const { max: maxV, step: tickStep } = niceScale(Math.max(0, ...bars.map((b) => b.value)), 2);
  const band = bars.length ? plotW / bars.length : 0;
  const barW = Math.min(46, band * 0.56);
  const y = (v: number) => padT + plotH - (v / maxV) * plotH;
  const allZero = bars.every((b) => b.value === 0);

  return (
    <div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {allZero ? (
          <ChartEmpty />
        ) : (
          width > 0 && (
            <svg width={width} height={height} role="img" aria-label={bars.map((b) => `${b.label}: ${formatValue(b.value)}`).join("; ")}>
              <defs>
                {bars.map((b) => (
                  <linearGradient key={b.key} id={`${uid}-${b.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={b.color} stopOpacity={1} />
                    <stop offset="100%" stopColor={b.color} stopOpacity={0.62} />
                  </linearGradient>
                ))}
              </defs>
              {[0, 1, 2].map((i) => (
                <g key={i}>
                  <line x1={padL} x2={width} y1={y(i * tickStep)} y2={y(i * tickStep)} stroke="var(--chart-grid)" />
                  <text x={padL - 8} y={y(i * tickStep)} dy="0.32em" textAnchor="end" fontSize={10.5} fill="var(--chart-axis)">
                    {formatValue(i * tickStep)}
                  </text>
                </g>
              ))}
              {bars.map((b, i) => {
                const cx = padL + band * i + band / 2;
                const top = y(b.value);
                const h = Math.max(0, padT + plotH - top);
                const rr = Math.min(6, barW / 2, h);
                const x0 = cx - barW / 2;
                const base = padT + plotH;
                const d = h <= 0 ? "" : `M${x0},${base} L${x0},${top + rr} Q${x0},${top} ${x0 + rr},${top} L${x0 + barW - rr},${top} Q${x0 + barW},${top} ${x0 + barW},${top + rr} L${x0 + barW},${base} Z`;
                return (
                  <g
                    key={b.key}
                    onPointerEnter={() => setHover(b.key)}
                    onPointerLeave={() => setHover(null)}
                    onClick={b.onClick}
                    className={b.onClick ? "cursor-pointer" : ""}
                    opacity={hover && hover !== b.key ? 0.45 : 1}
                    style={{ transition: "opacity .15s" }}
                  >
                    {/* vung bam rong hon cot (ca cot doc) - khong bat nguoi dung bam trung than cot mong */}
                    <rect x={cx - band / 2} y={padT} width={band} height={plotH} fill="transparent" />
                    {d && <path d={d} fill={`url(#${uid}-${b.key})`} />}
                    <text x={cx} y={top - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-text)">
                      {formatValue(b.value)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )
        )}
      </div>
      {/* Nhan truc X bang HTML (tu xuong dong khi dai), chia cot DUNG bang be rong voi SVG ben tren. */}
      <div className="mt-1.5 grid gap-1" style={{ paddingLeft: padL, gridTemplateColumns: `repeat(${bars.length || 1}, minmax(0, 1fr))` }}>
        {bars.map((b) => (
          <button
            key={b.key}
            type="button"
            disabled={!b.onClick}
            onClick={b.onClick}
            className={`focus-ring rounded text-center text-[11px] leading-tight text-[var(--color-text-secondary)] ${b.onClick ? "hover:text-[var(--color-primary)]" : ""}`}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface HBarRow {
  key: string;
  label: ReactNode;
  value: number;
  /** Chuoi hien thi thay cho value (vd so tien da dinh dang). */
  display?: string;
  sub?: ReactNode;
  color?: string;
  onClick?: () => void;
}

// Danh sach thanh ngang (khop "Top 5 ..." cua demo). `ranked` = hien vong so thu hang - vong so dung MAU
// THUONG HIEU (khong to moi hang 1 mau khac nhau - mau theo thu hang la anti-pattern dataviz).
export function HBarList({
  rows,
  ranked = false,
  showPct = false,
  emptyText,
}: {
  rows: HBarRow[];
  ranked?: boolean;
  showPct?: boolean;
  emptyText?: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (rows.length === 0 || max === 0) return <ChartEmpty>{emptyText ?? t("Chưa có dữ liệu trong kỳ này.")}</ChartEmpty>;
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => {
        const color = r.color ?? "var(--color-primary)";
        const inner = (
          <>
            {ranked && (
              <span
                className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  i === 0 ? "text-white" : "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                }`}
                style={i === 0 ? { background: "var(--brand-gradient)" } : undefined}
              >
                {i + 1}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12.5px] text-[var(--color-text-body)]">{r.label}</span>
                <span className="shrink-0 text-[12.5px] font-bold text-[var(--color-text)]">
                  {r.display ?? r.value.toLocaleString("vi-VN")}
                  {showPct && <span className="ml-2 font-normal text-[var(--color-text-secondary)]">{pct(r.value, total)}</span>}
                </span>
              </span>
              <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-[var(--color-subtle)]">
                <span
                  className="block h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 55%, white))` }}
                />
              </span>
              {r.sub && <span className="mt-1 block text-[11px] text-[var(--color-text-secondary)]">{r.sub}</span>}
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {r.onClick ? (
              <button type="button" onClick={r.onClick} className="focus-ring flex w-full items-center gap-3 rounded-[8px] px-2 py-2 text-left hover:bg-[var(--color-surface-soft)]">
                {inner}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-2 py-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface StackSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  icon?: ReactNode;
}

// Thanh xep chong 100% (phan bo tuoi don / trang thai) - khe 2px giua cac doan, chu thich co so + % ben
// duoi (khong nhet so vao doan hep de tranh chu bi cat).
export function StackedBar({ segments, height = 12 }: { segments: StackSegment[]; height?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex w-full gap-[2px] overflow-hidden rounded-full" style={{ height }} role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join("; ")}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span key={s.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.value}`} />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--color-text-body)]">
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.icon}
            {s.label}
            <b className="text-[var(--color-text)]">{s.value}</b>
            <span className="text-[var(--color-text-secondary)]">({pct(s.value, total)})</span>
          </span>
        ))}
      </div>
    </div>
  );
}
