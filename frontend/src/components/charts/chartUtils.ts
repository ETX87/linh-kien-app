import { useLayoutEffect, useRef, useState, type RefObject } from "react";

// Bo bieu do SVG tu dung (2026-09-26, xem DESIGN_GUIDELINES.md §9) - KHONG dung thu vien chart (nang cho
// mobile, kho ep theo token mau). Mau lay tu token --chart-* trong tokens.css (da chay validator dataviz).
export const CHART_CATEGORICAL = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

/** Do chieu rong THAT cua khung chua (bieu do ve theo pixel that, khong scale chu/net theo viewBox). */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Tran truc Y "dep" = segments x buoc, buoc thuoc 1/2/5 x 10^n va KHONG nho hon 1 khi du lieu la so dem
 * (tranh vach "2,5 đơn"). Tra ve ca buoc de ve dung `segments` vach chia deu.
 */
export function niceScale(v: number, segments = 4, integer = true): { max: number; step: number } {
  const raw = v <= 0 ? 1 : v / segments;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  let step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  if (integer) step = Math.max(1, Math.round(step));
  return { max: step * segments, step };
}

export function niceMax(v: number, segments = 4, integer = true): number {
  return niceScale(v, segments, integer).max;
}

/** So tien gon cho nhan bieu do: 1,25 tỷ / 850 tr / 12 k. */
export function fmtCompactVND(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  if (abs >= 1e3) return `${(n / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} k`;
  return n.toLocaleString("vi-VN");
}

export function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((part / total) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

/**
 * Duong cong "monotone X" (Fritsch-Carlson) - muot nhu demo nhung KHONG vong qua diem du lieu (khong ve
 * ra gia tri am/vuot dinh gia nhu Catmull-Rom), quan trong voi so dem luon >= 0.
 */
export function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1));
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  m.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i].x + h},${pts[i].y + m[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - m[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}
