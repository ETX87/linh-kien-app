import { THIEU_LK_TRANG_THAI_OPTIONS } from "./constants";
import { trangThaiLabel } from "./helpers";

// Cot trang thai ben trai man "Thiếu linh kiện" (2026-09-28, phan hoi "tạo 1 side bar con bên trong và nhóm các trạng
// thái thành các vùng lựa chọn riêng") - bo cuc master-detail kieu hop thu: nhom trang thai theo "viec cua ai / da xong
// chua", bam 1 muc (hoac tieu de nhom) thi danh sach ben phai loc theo trang thai do. Mobile: hang chip cuon ngang.
// So dem lay tu GET /thieu-lk-status-counts (CUNG bo loc voi danh sach, 1 truy van GROUP BY) - khong ton them truy van.
// Gia tri loc: 1 trang thai | nhieu trang thai noi bang "," (tieu de nhom) | "__VIEC__" (Can xu ly, khop badge Sidebar).

const DANG_MO = ["Cho kho xu ly", "Kho da tiep nhan", "Kho da cap nhat", "Kho xac nhan hang da ve"];
const DA_DONG = ["Da ket thuc", "Kho tu choi sai TT", "Da huy bo"];

interface Muc {
  value: string;
  label: string;
  phu?: string;
}
interface Nhom {
  tieuDe: string;
  value: string;
  canLam?: boolean;
  muc: Muc[];
}

function nhomTrangThai(canKho: boolean, canTacNghiep: boolean): Nhom[] {
  const nhan = (v: string) => trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, v);
  // Cung tap voi thieuLkTrangThaiViec() (backend) + badge Sidebar (routes/notifications.ts).
  const canXuLy = [...(canKho ? ["Cho kho xu ly", "Kho da tiep nhan"] : []), ...(canTacNghiep ? ["Kho xac nhan hang da ve"] : [])];
  const coViec = canXuLy.length > 0;
  const dangCho = DANG_MO.filter((v) => !canXuLy.includes(v));
  const phuDangCho: Record<string, string> = {
    "Kho da cap nhat": "chờ hàng về",
    "Kho xac nhan hang da ve": "chờ TN kết thúc",
    "Cho kho xu ly": "chờ Kho",
    "Kho da tiep nhan": "chờ Kho",
  };
  const nhom: Nhom[] = [];
  if (coViec) nhom.push({ tieuDe: "Cần xử lý", value: "__VIEC__", canLam: true, muc: canXuLy.map((v) => ({ value: v, label: nhan(v) })) });
  nhom.push({
    tieuDe: coViec ? "Đang chờ" : "Đang xử lý",
    value: dangCho.join(","),
    muc: dangCho.map((v) => ({ value: v, label: nhan(v), phu: coViec ? phuDangCho[v] : undefined })),
  });
  nhom.push({ tieuDe: "Đã đóng", value: DA_DONG.join(","), muc: DA_DONG.map((v) => ({ value: v, label: nhan(v) })) });
  return nhom;
}

function demNhom(g: Nhom, counts: Record<string, number> | undefined): number | undefined {
  if (!counts) return undefined;
  if (g.value === "__VIEC__") return counts.__VIEC__ ?? g.muc.reduce((s, m) => s + (counts[m.value] ?? 0), 0);
  return g.muc.reduce((s, m) => s + (counts[m.value] ?? 0), 0);
}

function SoDem({ n, canLam, active }: { n: number | undefined; canLam?: boolean; active?: boolean }) {
  if (n === undefined) return null;
  const tone =
    canLam && n > 0
      ? "bg-[var(--amber-100)] text-[var(--amber-700)]"
      : active
        ? "bg-[var(--color-surface)] text-[var(--color-primary-dark)]"
        : "bg-[var(--color-subtle)] text-[var(--color-text-secondary)]";
  return <span className={`ml-2 min-w-[22px] shrink-0 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums ${tone}`}>{n}</span>;
}

export function ThieuLkStatusRail({
  value,
  onChange,
  counts,
  canKho,
  canTacNghiep,
}: {
  value: string;
  onChange: (v: string) => void;
  counts: Record<string, number> | undefined;
  canKho: boolean;
  canTacNghiep: boolean;
}) {
  const nhom = nhomTrangThai(canKho, canTacNghiep);
  const dongCls = (active: boolean) =>
    `focus-ring flex w-full items-center justify-between rounded-[var(--radius-btn)] text-left transition-colors ${
      active
        ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] font-semibold"
        : "hover:bg-[var(--color-surface-hover)]"
    }`;

  return (
    <>
      {/* Desktop: cot doc ben trai */}
      <nav aria-label="Lọc theo trạng thái" className="content-card hidden w-[232px] shrink-0 self-start p-2 md:block md:sticky md:top-3">
        {nhom.map((g) => {
          const activeNhom = value === g.value;
          return (
            <div key={g.tieuDe} className="mb-2 last:mb-0">
              <button
                type="button"
                onClick={() => onChange(g.value)}
                aria-pressed={activeNhom}
                className={`${dongCls(activeNhom)} px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide ${activeNhom ? "" : "text-[var(--ink-400)]"}`}
              >
                <span>{g.tieuDe}</span>
                <SoDem n={demNhom(g, counts)} canLam={g.canLam} active={activeNhom} />
              </button>
              {g.muc.map((m) => {
                const active = value === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => onChange(m.value)}
                    aria-pressed={active}
                    className={`${dongCls(active)} py-1.5 pl-5 pr-2.5 text-[13px] ${active ? "" : "text-[var(--color-text)]"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{m.label}</span>
                      {m.phu && <span className="block truncate text-[11px] font-normal text-[var(--ink-400)]">{m.phu}</span>}
                    </span>
                    <SoDem n={counts ? counts[m.value] ?? 0 : undefined} canLam={g.canLam} active={active} />
                  </button>
                );
              })}
            </div>
          );
        })}
        <div className="mt-1 border-t border-[var(--color-border)] pt-1">
          <button type="button" onClick={() => onChange("")} aria-pressed={value === ""} className={`${dongCls(value === "")} px-2.5 py-1.5 text-[13px]`}>
            <span>Tất cả</span>
            <SoDem n={counts?.[""]} active={value === ""} />
          </button>
        </div>
      </nav>

      {/* Mobile: hang chip cuon ngang (filter-tab, DESIGN_GUIDELINES §6.3) */}
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 md:hidden" role="group" aria-label="Lọc theo trạng thái">
        {nhom.flatMap((g) => [
          { value: g.value, label: g.tieuDe, n: demNhom(g, counts), nhom: true },
          ...g.muc.map((m) => ({ value: m.value, label: m.label, n: counts ? counts[m.value] ?? 0 : undefined, nhom: false })),
        ])
          .concat([{ value: "", label: "Tất cả", n: counts?.[""], nhom: true }])
          .map((x) => (
            <button
              key={`${x.nhom ? "g" : "m"}:${x.value}`}
              type="button"
              onClick={() => onChange(x.value)}
              className={`filter-tab shrink-0 ${value === x.value ? "active" : ""} ${x.nhom ? "uppercase" : ""}`}
            >
              {x.label}
              {x.n !== undefined && <span className="tabular-nums opacity-80">({x.n})</span>}
            </button>
          ))}
      </div>
    </>
  );
}
