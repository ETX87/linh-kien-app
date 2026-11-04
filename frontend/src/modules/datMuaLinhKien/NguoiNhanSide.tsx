import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, buildQuery } from "../../api/client";
import type { LocCotCfg } from "../../components/ui/LocCot";
import { khopTim } from "../../lib/boDau";
import { t } from "../../i18n";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { Btn } from "../../components/ui/Btn";

// Side phu "Người nhận hàng" ben trai danh sach don (desktop, 2026-11-04 - "1 side phụ bên cạnh để hiện thị danh sách các
// người nhận hàng (kèm sl sau tên (x123)) ... click vào tên người nhận trong side phụ để lọc danh sách chính"). Dung CHUNG
// endpoint + bo loc cua loc cot Excel (`cfg`, cot nguoi_nhan_hang) nen so dem khop dung danh sach dang xem (tru bo loc cua
// chinh cot nay) va bam ten = dat bo loc cot "Người nhận hàng" (chip + popup loc cot tu dong theo). Ctrl/⌘ + bam = chon them.
// Dung chung cho danh sach Don hang + Phieu xuat (v1.436): `khoa` = khoa localStorage rieng moi danh sach (bat/tat + do rong).
// Keo mep phai de doi do rong (180-520px); ten dai hien 1 dong + "…" (rê chuột xem đủ).
const COT = "nguoi_nhan_hang";
const RONG_MIN = 180;
const RONG_MAX = 520;

/** Bat/tat side, luu tren may theo `khoa`. */
export function useHienSideNguoiNhan(khoa: string) {
  return useLocalStorageState(khoa, true);
}

/** Nut mo lai side khi dang an (chi desktop >= lg). */
export function NutMoSideNguoiNhan({ onClick }: { onClick: () => void }) {
  return (
    <Btn size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={onClick} title={t("Hiện danh sách người nhận hàng bên trái")}>
      {t("» Người nhận")}
    </Btn>
  );
}

export function NguoiNhanSide({ cfg, onDong, khoa }: { cfg: LocCotCfg; onDong: () => void; khoa: string }) {
  const [tim, setTim] = useState("");
  const [rong, setRong] = useLocalStorageState(`${khoa}-rong`, 260);
  const keoRef = useRef<{ x: number; rong: number } | null>(null);
  function batDauKeo(e: React.PointerEvent) {
    e.preventDefault();
    keoRef.current = { x: e.clientX, rong };
    const di = (ev: PointerEvent) => {
      if (!keoRef.current) return;
      setRong(Math.round(Math.min(RONG_MAX, Math.max(RONG_MIN, keoRef.current.rong + ev.clientX - keoRef.current.x))));
    };
    const tha = () => {
      keoRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", di);
      window.removeEventListener("pointerup", tha);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", di);
    window.addEventListener("pointerup", tha);
  }
  const locKhac = useMemo(() => {
    const { [COT]: _bo, ...rest } = cfg.loc;
    return rest;
  }, [cfg.loc]);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["loc-cot-side", cfg.endpoint, COT, cfg.params, locKhac],
    queryFn: () =>
      api.get<{ rows: { v: string; n: number; nhan?: string }[] }>(
        cfg.endpoint + buildQuery({ ...cfg.params, cf: Object.keys(locKhac).length ? JSON.stringify(locKhac) : undefined, cot: COT }),
      ),
    staleTime: 30_000,
  });
  const nhan = cfg.nhan?.[COT] ?? ((v: string) => v);
  const ds = useMemo(
    () =>
      (data?.rows ?? [])
        .map((r) => ({ ...r, label: r.v === "" ? t("(Trống)") : r.nhan ?? nhan(r.v) }))
        .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "vi")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, cfg.nhan],
  );
  const tong = ds.reduce((s, r) => s + r.n, 0);
  const khop = tim.trim() ? ds.filter((r) => khopTim(r.label, tim)) : ds;

  const hienTai = cfg.loc[COT];
  const dangChon = (v: string) => (hienTai ? (hienTai.not ? !hienTai.v.includes(v) : hienTai.v.includes(v)) : false);
  const tapChon = (): string[] => (hienTai ? ds.map((r) => r.v).filter(dangChon) : []);

  function bam(v: string, them: boolean) {
    if (!them) {
      const chiMinh = hienTai && !hienTai.not && hienTai.v.length === 1 && hienTai.v[0] === v;
      cfg.setLoc(COT, chiMinh ? undefined : { v: [v] });
      return;
    }
    const tap = new Set(tapChon());
    if (tap.has(v)) tap.delete(v);
    else tap.add(v);
    cfg.setLoc(COT, tap.size ? { v: [...tap] } : undefined);
  }

  const dong = (key: string, label: string, n: number, chon: boolean, onClick: (e: React.MouseEvent) => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      title={label}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] leading-snug ${
        chon ? "bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]" : "text-[var(--ink-700)] hover:bg-[var(--surface-100)]"
      }`}
    >
      <span className="min-w-0 flex-1 truncate whitespace-nowrap">{label}</span>
      <span className={`shrink-0 tabular-nums ${chon ? "" : "text-[var(--ink-400)]"}`}>(x{n})</span>
    </button>
  );

  return (
    <aside
      style={{ width: Math.min(RONG_MAX, Math.max(RONG_MIN, rong)) }}
      className="relative flex max-h-[calc(100vh-96px)] shrink-0 flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)]"
    >
      {/* Tay keo doi do rong (mep phai); bam dup = ve mac dinh 260px. */}
      <div
        onPointerDown={batDauKeo}
        onDoubleClick={() => setRong(260)}
        title={t("Kéo để đổi độ rộng (bấm đúp: mặc định)")}
        className="absolute -right-1.5 top-0 z-10 h-full w-3 cursor-col-resize after:absolute after:left-1/2 after:top-1/2 after:h-10 after:w-[3px] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-[var(--line)] hover:after:bg-[var(--color-primary)]"
      />
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-500)]">{t("Người nhận hàng")}</span>
        <button
          type="button"
          onClick={onDong}
          title={t("Ẩn danh sách người nhận")}
          className="focus-ring rounded px-1.5 text-[var(--ink-400)] hover:bg-[var(--surface-100)] hover:text-[var(--ink-700)]"
        >
          «
        </button>
      </div>
      <div className="px-2 pt-2">
        <input
          value={tim}
          onChange={(e) => setTim(e.target.value)}
          placeholder={t("Tìm người nhận…")}
          className="focus-ring w-full rounded-lg border border-[var(--line)] bg-[var(--surface-100)] px-2 py-1 text-xs"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="py-3 text-center text-xs text-[var(--ink-400)]">{t("Đang tải…")}</div>
        ) : isError ? (
          <div className="py-3 text-center text-xs text-[var(--coral-600)]">{t("Không tải được danh sách giá trị")}</div>
        ) : (
          <>
            {!tim.trim() && dong("__tat_ca__", t("Tất cả"), tong, !hienTai, () => cfg.setLoc(COT, undefined))}
            {khop.length === 0 ? (
              <div className="py-3 text-center text-xs text-[var(--ink-400)]">{t("Không có giá trị")}</div>
            ) : (
              khop.map((r) => dong(r.v || "__trong__", r.label, r.n, dangChon(r.v), (e) => bam(r.v, e.ctrlKey || e.metaKey)))
            )}
          </>
        )}
      </div>
      <div className="border-t border-[var(--line)] px-3 py-1.5 text-[10.5px] text-[var(--ink-400)]">{t("Ctrl + bấm để chọn nhiều người")}</div>
    </aside>
  );
}
