import { useId, useState } from "react";
import { ChartEmpty, ChartLegend } from "./ChartCard";
import { monotonePath, niceScale, useElementWidth } from "./chartUtils";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
  /** Vach dut - ma hoa phu (khong chi dua vao mau) cho chuoi "xau" nhu tu choi. */
  dashed?: boolean;
}

// Bieu do area/line nhieu chuoi theo thoi gian (khop "Xu huong ... theo thoi gian" cua demo): 1 truc Y
// duy nhat, net 2px, vung to gradient mo dan, luoi ngang rat nhat, crosshair + tooltip khi re chuot/cham
// (tooltip KHONG phai cach duy nhat doc so - legend + bang chi tiet ben duoi van co).
export function TrendChart({
  labels,
  series,
  height = 230,
  formatValue = (v: number) => v.toLocaleString("vi-VN"),
  integer = true,
}: {
  labels: string[];
  series: TrendSeries[];
  height?: number;
  formatValue?: (v: number) => string;
  /** Du lieu la so dem (mac dinh) - vach chia truc Y luon la so nguyen. */
  integer?: boolean;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const n = labels.length;
  const allZero = series.every((s) => s.values.every((v) => v === 0));

  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 24;
  const plotW = Math.max(0, width - padL - padR);
  const plotH = height - padT - padB;
  const { max: maxV, step: tickStep } = niceScale(Math.max(0, ...series.flatMap((s) => s.values)), 4, integer);
  const ticks = [0, 1, 2, 3, 4].map((i) => i * tickStep);
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / maxV) * plotH;

  // Nhan truc X: chon deu theo buoc roi LOC THEO KHOANG CACH PIXEL THAT (>= 46px, du cho "dd/MM" 10.5px) -
  // luon giu nhan cuoi, bo nhan lien truoc neu qua sat (tranh "22/0926/09" de len nhau tren mobile).
  const maxLabels = width < 420 ? 4 : width < 760 ? 6 : 9;
  const step = Math.max(1, Math.ceil(n / maxLabels));
  const candidates = labels.map((_, i) => i).filter((i) => i % step === 0 || i === n - 1);
  const shownX: number[] = [];
  for (const i of candidates) {
    if (i === n - 1) {
      while (shownX.length && x(i) - x(shownX[shownX.length - 1]) < 46) shownX.pop();
      shownX.push(i);
    } else if (!shownX.length || x(i) - x(shownX[shownX.length - 1]) >= 46) {
      shownX.push(i);
    }
  }

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = n <= 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  }

  const tipLeft = hover != null ? Math.min(Math.max(x(hover) + 12, 0), Math.max(0, width - 170)) : 0;
  const tipFlip = hover != null && x(hover) + 12 + 160 > width;

  return (
    <div className="space-y-2.5">
      <ChartLegend items={series.map((s) => ({ label: s.label, color: s.color, dashed: s.dashed }))} />
      <div ref={ref} className="relative w-full" style={{ height }}>
        {allZero || n === 0 ? (
          <ChartEmpty />
        ) : (
          width > 0 && (
            <svg width={width} height={height} role="img" aria-label={`Biểu đồ xu hướng: ${series.map((s) => s.label).join(", ")}`}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
                  <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10.5} fill="var(--chart-axis)">
                    {formatValue(t)}
                  </text>
                </g>
              ))}
              {shownX.map((i) => (
                <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"} fontSize={10.5} fill="var(--chart-axis)">
                  {labels[i]}
                </text>
              ))}
              {series.map((s) => {
                const pts = s.values.map((v, i) => ({ x: x(i), y: y(v) }));
                const line = monotonePath(pts);
                const area = `${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`;
                return (
                  <g key={s.key}>
                    <path d={area} fill={`url(#${uid}-${s.key})`} />
                    <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? "5 4" : undefined} />
                  </g>
                );
              })}
              {hover != null && (
                <g pointerEvents="none">
                  <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="var(--color-border-strong)" strokeWidth={1} />
                  {series.map((s) => (
                    <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />
                  ))}
                </g>
              )}
              <rect
                x={padL}
                y={padT}
                width={plotW}
                height={plotH}
                fill="transparent"
                onPointerMove={onMove}
                onPointerDown={onMove}
                onPointerLeave={() => setHover(null)}
                style={{ touchAction: "pan-y" }}
              />
            </svg>
          )
        )}
        {hover != null && !allZero && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-[10px] border border-[var(--color-border-soft)] bg-white px-3 py-2 text-[11.5px] shadow-[var(--shadow-pop)]"
            style={tipFlip ? { left: Math.max(0, x(hover) - 12 - 160) } : { left: tipLeft }}
          >
            <div className="mb-1 font-semibold text-[var(--color-text)]">{labels[hover]}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3 text-[var(--color-text-body)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold text-[var(--color-text)]">{formatValue(s.values[hover] ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
