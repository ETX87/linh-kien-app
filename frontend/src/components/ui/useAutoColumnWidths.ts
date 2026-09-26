import { useEffect, useMemo, useState } from "react";

// Tu tinh do rong cot theo DO DAI KY TU THAT (them 2026-09-26, phan hoi "danh sách đơn hàng đang bị kéo
// giãn... dựa vào độ dài các ký tự thật để tính khoảng cách") - do bang canvas measureText voi DUNG font/co
// chu dang ve trong bang (khong uoc luong theo so ky tu - chu "W" va "i" rong khac nhau, tieng Viet co dau),
// lay max tren cac dong DANG HIEN, cong padding o, kep trong [min, max] cua tung cot. Cot vuot "max" hien
// "…" + tooltip (xem noi goi). Do lai 1 lan khi font web tai xong (document.fonts.ready) - do truoc do se
// ra so do cua font du phong.

export const TABLE_BODY_FONT = `12px "Plus Jakarta Sans", "Be Vietnam Pro", sans-serif`;
export const TABLE_HEAD_FONT = `600 11.5px "Plus Jakarta Sans", "Be Vietnam Pro", sans-serif`;
export const BADGE_FONT = `600 11px "Plus Jakarta Sans", "Be Vietnam Pro", sans-serif`;
export const MONO_FONT = `12px "IBM Plex Mono", ui-monospace, monospace`;
/** Padding ngang cua 1 badge (px-2 = 8px x 2). */
export const BADGE_PAD = 16;

export interface AutoWidthSpec<T> {
  /** Chuoi DUNG nhu dang hien trong o (cung dinh dang voi render) - bo trong = chi tinh theo header. */
  text?: (row: T) => string | string[];
  font?: string;
  /** Cong them ngoai chu (padding badge, icon, khoang cach giua cac badge...). */
  extra?: number;
  min?: number;
  max?: number;
  /** Do rong co dinh (vd cot checkbox/nut) - bo qua do chu. */
  fixed?: number;
}

const CELL_PAD = 24; // px-3 hai ben
const HEADER_EXTRA = 12; // tay keo doi do rong o goc phai header

let ctx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function useAutoColumnWidths<T>(
  columns: { key: string; header: unknown }[],
  rows: T[],
  specs: Record<string, AutoWidthSpec<T>>,
): Record<string, number> {
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && setFontTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const col of columns) {
      const spec = specs[col.key] ?? {};
      if (spec.fixed != null) {
        out[col.key] = spec.fixed;
        continue;
      }
      const headerW = typeof col.header === "string" && col.header ? measure(col.header, TABLE_HEAD_FONT) + HEADER_EXTRA : 0;
      let bodyW = 0;
      if (spec.text) {
        const font = spec.font ?? TABLE_BODY_FONT;
        for (const row of rows) {
          const t = spec.text(row);
          const w = Array.isArray(t) ? t.reduce((s, x) => s + measure(x, font), 0) : measure(t, font);
          if (w > bodyW) bodyW = w;
        }
        if (bodyW > 0) bodyW += spec.extra ?? 0;
      }
      const raw = Math.ceil(Math.max(headerW, bodyW) + CELL_PAD);
      out[col.key] = Math.min(spec.max ?? 360, Math.max(spec.min ?? 56, raw));
    }
    return out;
    // specs la object tao moi moi render nhung chi chua ham truy xuat thuan - khong dua vao deps de tranh
    // do lai lien tuc; cot/dong/font doi moi can do lai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.map((c) => c.key).join("|"), rows, fontTick]);
}
