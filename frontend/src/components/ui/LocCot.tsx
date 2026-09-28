import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { api, buildQuery } from "../../api/client";
import { Btn } from "./Btn";

// Loc cot kieu Excel (phan hoi 2026-09-28: "filter ... giống như chức năng fiter tiêu đề của excel, có tìm kiếm, chọn
// 1 hoặc nhiều, hoặc tất cả, sort") - dung chung cho danh sach don (DonCuaToiTab) va danh sach PXK (PhieuXuatKhoTab).
// Loc + sap xep chay o SERVER (backend/src/lib/locCot.ts: query cf/cs/cd) nen dung cho moi trang, khong chi trang
// dang xem. Danh sach gia tri lay tu `<endpoint>?cot=...` voi CUNG bo loc dang ap (tru bo loc cua chinh cot do).

export type LocCotGiaTri = { v: string[]; not?: boolean };
export type LocCotState = Record<string, LocCotGiaTri>;
export type SapXepCot = { cot: string; dir: "asc" | "desc" } | null;

export interface LocCotCfg {
  loc: LocCotState;
  sapXep: SapXepCot;
  setLoc: (cot: string, g: LocCotGiaTri | undefined) => void;
  setSapXep: (s: SapXepCot) => void;
  xoaHet: () => void;
  /** Endpoint tra { rows: {v, n, nhan?}[] } cho 1 cot, vd "/dat-mua-lk/don-hang/gia-tri-loc". */
  endpoint: string;
  /** Bo loc KHAC dang ap (khong gom page) - gui kem khi lay gia tri de danh sach khop dung tap dong dang xem. */
  params: Record<string, string | number | undefined>;
  tieuDe: Record<string, string>;
  /** Nhan hien thi cho gia tri (vd email -> ten, ma trang thai -> nhan co dau). */
  nhan?: Record<string, (v: string) => string>;
}

/** State + query param (cf/cs/cd) cho 1 danh sach. `onDoi` goi moi khi loc/sap xep doi (vd ve trang 1). */
export function useLocCot(onDoi?: () => void) {
  const [loc, setLocState] = useState<LocCotState>({});
  const [sapXep, setSapXepState] = useState<SapXepCot>(null);
  const queryParams = {
    cf: Object.keys(loc).length ? JSON.stringify(loc) : undefined,
    cs: sapXep?.cot,
    cd: sapXep?.dir,
  };
  return {
    loc,
    sapXep,
    queryParams,
    setLoc: (cot: string, g: LocCotGiaTri | undefined) => {
      setLocState((prev) => {
        const next = { ...prev };
        if (g) next[cot] = g;
        else delete next[cot];
        return next;
      });
      onDoi?.();
    },
    setSapXep: (s: SapXepCot) => {
      setSapXepState(s);
      onDoi?.();
    },
    xoaHet: () => {
      setLocState({});
      setSapXepState(null);
      onDoi?.();
    },
  };
}

const nhanMacDinh = (v: string) => v;
const TRONG = "(Trống)";

function FunnelIcon({ active }: { active: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6">
      <path d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5z" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Nut loc 1 cot. variant "icon" = nut nho canh tieu de cot (bang desktop); "chip" = chip co ten cot (thanh loc
 * mobile / thanh bo loc dang ap).
 */
export function LocCotButton({ cfg, cot, variant = "icon" }: { cfg: LocCotCfg; cot: string; variant?: "icon" | "chip" }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dangLoc = !!cfg.loc[cot];
  const dangSapXep = cfg.sapXep?.cot === cot ? cfg.sapXep.dir : null;
  const active = dangLoc || !!dangSapXep;
  const tieuDe = cfg.tieuDe[cot] ?? cot;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      {variant === "icon" ? (
        <button
          ref={btnRef}
          type="button"
          draggable={false}
          title={`Lọc / sắp xếp cột "${tieuDe}"`}
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          onMouseDown={stop}
          onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className={`focus-ring ml-1 inline-flex h-5 w-5 items-center justify-center rounded ${
            active ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]" : "text-[var(--ink-400)] hover:bg-[var(--surface-100)] hover:text-[var(--ink-600)]"
          }`}
        >
          <FunnelIcon active={active} />
          {dangSapXep && <span className="text-[9px] leading-none">{dangSapXep === "asc" ? "▲" : "▼"}</span>}
        </button>
      ) : (
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`focus-ring inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${
            active
              ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
              : "border-[var(--line)] text-[var(--ink-600)] hover:bg-[var(--surface-100)]"
          }`}
        >
          <FunnelIcon active={active} />
          {tieuDe}
          {dangLoc && <span>({cfg.loc[cot].not ? "trừ " : ""}{cfg.loc[cot].v.length})</span>}
          {dangSapXep && <span>{dangSapXep === "asc" ? "▲" : "▼"}</span>}
        </button>
      )}
      {open && <LocCotPopover cfg={cfg} cot={cot} anchor={btnRef.current} onClose={() => setOpen(false)} />}
    </>
  );
}

function LocCotPopover({ cfg, cot, anchor, onClose }: { cfg: LocCotCfg; cot: string; anchor: HTMLElement | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  const [tim, setTim] = useState("");
  const nhan = cfg.nhan?.[cot] ?? nhanMacDinh;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["loc-cot", cfg.endpoint, cot, cfg.params, cfg.loc],
    queryFn: () =>
      api.get<{ rows: { v: string; n: number; nhan?: string }[] }>(
        cfg.endpoint + buildQuery({ ...cfg.params, cf: Object.keys(cfg.loc).length ? JSON.stringify(cfg.loc) : undefined, cot }),
      ),
    staleTime: 0,
  });
  const giaTri = useMemo(() => {
    const rows = (data?.rows ?? []).map((r) => ({ ...r, label: r.v === "" ? TRONG : r.nhan ?? nhan(r.v) }));
    // Giu ca gia tri dang chon nhung khong con xuat hien (vd bo loc cot khac vua doi) de khong mat lua chon.
    const hienTai = cfg.loc[cot];
    if (hienTai && !hienTai.not) {
      for (const v of hienTai.v) if (!rows.some((r) => r.v === v)) rows.push({ v, n: 0, label: v === "" ? TRONG : nhan(v) });
    }
    return rows.sort((a, b) => (a.v === "" ? 1 : b.v === "" ? -1 : a.label.localeCompare(b.label, "vi")));
  }, [data, cfg.loc, cot, nhan]);

  // Tap DANG CHON (tinh tu bo loc hien tai; chua loc = tat ca).
  const [chon, setChon] = useState<Set<string> | null>(null);
  const tapChon = useMemo(() => {
    if (chon) return chon;
    const hienTai = cfg.loc[cot];
    if (!hienTai) return new Set(giaTri.map((g) => g.v));
    if (hienTai.not) return new Set(giaTri.map((g) => g.v).filter((v) => !hienTai.v.includes(v)));
    return new Set(hienTai.v);
  }, [chon, cfg.loc, cot, giaTri]);

  const khop = tim.trim() ? giaTri.filter((g) => g.label.toLowerCase().includes(tim.trim().toLowerCase())) : giaTri;
  const tatCaKhopDaChon = khop.length > 0 && khop.every((g) => tapChon.has(g.v));

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = 280;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const top = Math.min(r.bottom + 4, window.innerHeight - 120);
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  function toggle(v: string) {
    const next = new Set(tapChon);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setChon(next);
  }
  function toggleTatCa() {
    const next = new Set(tapChon);
    if (tatCaKhopDaChon) khop.forEach((g) => next.delete(g.v));
    else khop.forEach((g) => next.add(g.v));
    setChon(next);
  }
  function apDung() {
    // Dang tim: giong Excel - chi giu cac gia tri KHOP tim kiem dang duoc tick.
    const tap = tim.trim() ? new Set(khop.filter((g) => tapChon.has(g.v)).map((g) => g.v)) : tapChon;
    const tatCa = giaTri.map((g) => g.v);
    if (tatCa.length > 0 && tatCa.every((v) => tap.has(v))) cfg.setLoc(cot, undefined);
    else {
      const bo = tatCa.filter((v) => !tap.has(v));
      cfg.setLoc(cot, tap.size <= bo.length ? { v: [...tap] } : { v: bo, not: true });
    }
    onClose();
  }
  function sapXep(dir: "asc" | "desc") {
    cfg.setSapXep(cfg.sapXep?.cot === cot && cfg.sapXep.dir === dir ? null : { cot, dir });
    onClose();
  }

  const sapXepHienTai = cfg.sapXep?.cot === cot ? cfg.sapXep.dir : null;
  const dongSapXep = (dir: "asc" | "desc", text: string) => (
    <button
      type="button"
      onClick={() => sapXep(dir)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--surface-100)] ${
        sapXepHienTai === dir ? "font-semibold text-[var(--color-primary)]" : "text-[var(--ink-700)]"
      }`}
    >
      <span className="w-3">{sapXepHienTai === dir ? "✓" : ""}</span>
      {text}
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      // Portal van noi bot su kien React len <th> cha (sap xep/keo tha cot) - chan lai.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.stopPropagation()}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: 280, zIndex: 80 }}
      className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 text-sm shadow-[var(--shadow-pop)]"
    >
      <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">{cfg.tieuDe[cot] ?? cot}</div>
      {dongSapXep("asc", "Sắp xếp A → Z")}
      {dongSapXep("desc", "Sắp xếp Z → A")}
      <div className="my-1.5 border-t border-[var(--line)]" />
      <input
        autoFocus
        value={tim}
        onChange={(e) => setTim(e.target.value)}
        placeholder="Tìm…"
        className="focus-ring mb-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-100)] px-2 py-1 text-xs"
      />
      <div className="max-h-60 overflow-auto rounded-lg border border-[var(--line)]">
        {isLoading ? (
          <div className="px-2 py-3 text-center text-xs text-[var(--ink-400)]">Đang tải…</div>
        ) : isError ? (
          <div className="px-2 py-3 text-center text-xs text-[var(--coral-600)]">Không tải được danh sách giá trị</div>
        ) : khop.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-[var(--ink-400)]">Không có giá trị</div>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-2 border-b border-[var(--line)] px-2 py-1.5 text-xs font-semibold">
              <input type="checkbox" checked={tatCaKhopDaChon} onChange={toggleTatCa} />
              {tim.trim() ? "(Chọn tất cả kết quả tìm)" : "(Chọn tất cả)"}
            </label>
            {khop.map((g) => (
              <label key={g.v} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-[var(--surface-100)]">
                <input type="checkbox" checked={tapChon.has(g.v)} onChange={() => toggle(g.v)} />
                <span className="min-w-0 flex-1 truncate" title={g.label}>{g.label}</span>
                <span className="tabular-nums text-[var(--ink-400)]">{g.n}</span>
              </label>
            ))}
          </>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!cfg.loc[cot]}
          onClick={() => { cfg.setLoc(cot, undefined); onClose(); }}
          className="text-xs text-[var(--color-primary)] hover:underline disabled:text-[var(--ink-400)] disabled:no-underline"
        >
          Xóa lọc cột này
        </button>
        <div className="flex gap-1.5">
          <Btn size="sm" variant="ghost" onClick={onClose}>Hủy</Btn>
          <Btn size="sm" onClick={apDung} disabled={isLoading}>OK</Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Thanh loc cot: desktop chi hien cac cot DANG loc/sap xep (+ "Xóa tất cả"); mobile (hienTatCa) hien moi cot loc
 * duoc duoi dang chip vi the mobile khong co tieu de cot.
 */
export function LocCotBar({ cfg, cots, hienTatCa }: { cfg: LocCotCfg; cots: string[]; hienTatCa: boolean }) {
  const dangAp = cots.filter((c) => cfg.loc[c] || cfg.sapXep?.cot === c);
  const hien = hienTatCa ? cots : dangAp;
  if (hien.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-400)]">Lọc cột:</span>
      {hien.map((c) => (
        <LocCotButton key={c} cfg={cfg} cot={c} variant="chip" />
      ))}
      {dangAp.length > 0 && (
        <button type="button" onClick={cfg.xoaHet} className="text-xs text-[var(--color-primary)] hover:underline">
          Xóa tất cả
        </button>
      )}
    </div>
  );
}
