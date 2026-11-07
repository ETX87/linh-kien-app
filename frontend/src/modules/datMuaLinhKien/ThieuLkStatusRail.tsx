import { THIEU_LK_TRANG_THAI_OPTIONS } from "./constants";
import { trangThaiLabel } from "./helpers";
import { t } from "../../i18n";

// Cot trang thai ben trai man "Thiếu linh kiện" (2026-09-28, phan hoi "tạo 1 side bar con bên trong và nhóm các trạng
// thái thành các vùng lựa chọn riêng") - bo cuc master-detail kieu hop thu: nhom trang thai theo "viec cua ai / da xong
// chua", bam 1 muc (hoac tieu de nhom) thi danh sach ben phai loc theo trang thai do. Mobile: hang chip cuon ngang.
// So dem lay tu GET /thieu-lk-status-counts (CUNG bo loc voi danh sach, 1 truy van GROUP BY) - khong ton them truy van.
// Gia tri loc: 1 trang thai | nhieu trang thai noi bang "," (tieu de nhom) | "__VIEC__" (Can xu ly, khop badge Sidebar).

// "Kho tu choi sai TT" (2026-09-29) chua dong: don goc quay ve "Cho TN duyet", ticket dong khi TN duyet/tu choi don.
const DANG_MO = [
  "Cho kho xu ly", "Kho da tiep nhan", "Kho da cap nhat", "Cho mua hang", "Mua hang da dat",
  "Kho xac nhan hang da ve", "Kho tu choi sai TT", "Mua hang tu choi",
];
const DA_DONG = ["Da ket thuc", "Da huy bo"];

export interface Muc {
  value: string;
  label: string;
  phu?: string;
}
export interface Nhom {
  tieuDe: string;
  value: string;
  canLam?: boolean;
  muc: Muc[];
}

function nhomTrangThai(canKho: boolean, canTacNghiep: boolean, canMuaHang: boolean): Nhom[] {
  const nhan = (v: string) => trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, v);
  // Cung tap voi thieuLkTrangThaiViec() (backend) + badge Sidebar (routes/notifications.ts).
  const canXuLy = [
    ...(canKho ? ["Cho kho xu ly", "Kho da tiep nhan"] : []),
    ...(canTacNghiep ? ["Kho xac nhan hang da ve", "Kho tu choi sai TT", "Mua hang tu choi"] : []),
    ...(canMuaHang ? ["Cho mua hang"] : []),
  ];
  const coViec = canXuLy.length > 0;
  const dangCho = DANG_MO.filter((v) => !canXuLy.includes(v));
  const phuDangCho: Record<string, string> = {
    "Kho da cap nhat": t("chờ hàng về"),
    "Kho xac nhan hang da ve": t("chờ TN duyệt"),
    "Kho tu choi sai TT": t("chờ TN duyệt"),
    "Cho kho xu ly": t("chờ Kho"),
    "Kho da tiep nhan": t("chờ Kho"),
    "Cho mua hang": t("chờ Mua hàng"),
    "Mua hang da dat": t("chờ hàng về"),
    "Mua hang tu choi": t("chờ TN duyệt"),
  };
  const nhom: Nhom[] = [];
  if (coViec) nhom.push({ tieuDe: t("Cần xử lý"), value: "__VIEC__", canLam: true, muc: canXuLy.map((v) => ({ value: v, label: nhan(v) })) });
  nhom.push({
    tieuDe: coViec ? t("Đang chờ") : t("Đang xử lý"),
    value: dangCho.join(","),
    muc: dangCho.map((v) => ({ value: v, label: nhan(v), phu: coViec ? phuDangCho[v] : undefined })),
  });
  nhom.push({ tieuDe: t("Đã đóng"), value: DA_DONG.join(","), muc: DA_DONG.map((v) => ({ value: v, label: nhan(v) })) });
  return nhom;
}

function demNhom(g: Nhom, counts: Record<string, number> | undefined): number | undefined {
  if (!counts) return undefined;
  // Nhom co so dem rieng (vd "__VIEC__", "can_xu_ly" - Thieu hang bao hanh) dung so do; con lai cong cac muc.
  return counts[g.value] ?? g.muc.reduce((s, m) => s + (counts[m.value] ?? 0), 0);
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
  canMuaHang = false,
}: {
  value: string;
  onChange: (v: string) => void;
  counts: Record<string, number> | undefined;
  canKho: boolean;
  canTacNghiep: boolean;
  canMuaHang?: boolean;
}) {
  return <TrangThaiRail nhom={nhomTrangThai(canKho, canTacNghiep, canMuaHang)} value={value} onChange={onChange} counts={counts} />;
}

// Khung cot trang thai DUNG CHUNG (2026-11-07, v1.455): "Thiếu hàng đặt mua" (ThieuLkStatusRail) + "Thiếu hàng bảo hành" (ThieuHangBh.tsx) -
// cung bo cuc / kieu nut / mobile 2 tang, chi khac danh sach nhom. "Tất cả" = value "" (so dem counts[""]).
export function TrangThaiRail({
  nhom,
  value,
  onChange,
  counts,
}: {
  nhom: Nhom[];
  value: string;
  onChange: (v: string) => void;
  counts: Record<string, number> | undefined;
}) {
  const dongCls = (active: boolean) =>
    `focus-ring flex w-full items-center justify-between rounded-[var(--radius-btn)] text-left transition-colors ${
      active
        ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] font-semibold"
        : "hover:bg-[var(--color-surface-hover)]"
    }`;

  return (
    <>
      {/* Desktop: cot doc ben trai */}
      <nav aria-label={t("Lọc theo trạng thái")} className="content-card hidden w-[232px] shrink-0 self-start p-2 md:block md:sticky md:top-3">
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
            <span>{t("Tất cả")}</span>
            <SoDem n={counts?.[""]} active={value === ""} />
          </button>
        </div>
      </nav>

      {/* Mobile (thiet ke lai 2026-09-29): 2 TANG giu dung thu bac cua cot desktop - truoc day 11 chip nhom lan
          muc tron 1 hang cuon ngang, khong phan biet duoc dau la nhom, phai cuon moi thay "Đã đóng"/"Tất cả".
          Tang 1: cac nhom + Tat ca chia deu 1 hang (luon thay het, cham 40px). Tang 2: muc con cua nhom dang
          chon (active = nen primary-soft, dung mau muc dang chon o cot desktop). */}
      <MobileTrangThai nhom={nhom} value={value} onChange={onChange} counts={counts} />
    </>
  );
}

function MobileTrangThai({
  nhom,
  value,
  onChange,
  counts,
}: {
  nhom: Nhom[];
  value: string;
  onChange: (v: string) => void;
  counts: Record<string, number> | undefined;
}) {
  const tang1 = [...nhom.map((g) => ({ value: g.value, label: g.tieuDe, n: demNhom(g, counts), canLam: g.canLam })), { value: "", label: t("Tất cả"), n: counts?.[""], canLam: false }];
  // Nhom dang chon: chinh no, hoac nhom chua muc dang chon.
  const nhomChon = nhom.find((g) => g.value === value || g.muc.some((m) => m.value === value));
  return (
    <div className="mb-3 md:hidden" role="group" aria-label={t("Lọc theo trạng thái")}>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${tang1.length}, minmax(0, 1fr))` }}>
        {tang1.map((x) => {
          const active = x.value === value || (nhomChon !== undefined && nhomChon.value === x.value);
          return (
            <button
              key={x.label}
              type="button"
              onClick={() => onChange(x.value)}
              aria-pressed={active}
              // Nhan tren / so duoi: 4 o chia deu ~80px khong du cho "Cần xử lý (3)" 1 dong (bi cat "Cần …").
              className={`filter-tab min-h-12 flex-col justify-center gap-0 px-1 py-1 leading-tight ${active ? "active" : ""}`}
            >
              <span className="max-w-full truncate">{x.label}</span>
              <span
                className={`text-[15px] font-extrabold tabular-nums ${
                  x.canLam && (x.n ?? 0) > 0 && !active ? "text-[var(--color-warning-strong)]" : ""
                }`}
              >
                {x.n ?? "–"}
              </span>
            </button>
          );
        })}
      </div>
      {nhomChon && nhomChon.muc.length > 1 && (
        <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
          {[{ value: nhomChon.value, label: t("Cả nhóm") }, ...nhomChon.muc].map((m) => {
            const active = value === m.value;
            const n = m.value === nhomChon.value ? demNhom(nhomChon, counts) : counts ? counts[m.value] ?? 0 : undefined;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => onChange(m.value)}
                aria-pressed={active}
                className={`focus-ring inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] border px-3 text-xs font-semibold transition-colors ${
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
                }`}
              >
                {m.label}
                {n !== undefined && <span className="tabular-nums opacity-80">({n})</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
