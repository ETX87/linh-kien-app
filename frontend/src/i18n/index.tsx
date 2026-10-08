import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

// Da ngon ngu VI / EN / ID (2026-10-07). Khoa tra cuu = CHINH cau tieng Viet goc (kieu gettext): t("Đơn hàng") -> tu dien
// en.ts/id.ts; cau chua dich -> hien tieng Viet (dich dan tung man, khong vo man nao). Bien chen: t("Đã tạo đơn {id}", { id }).
// Lua chon luu localStorage "ngon-ngu" (theo may, khong gui server). Doi ngon ngu -> NgonNguGate remount cay App (moi cot/nhan
// tinh san trong useMemo tu tinh lai), KHONG tai lai trang. Tu dien EN/ID tai luoi (vi khong ton gi).
// KHONG dich: du lieu nghiep vu (ten LK, loai de xuat, khu vuc, ghi chu nguoi nhap...), file Excel/MISA tai ve.
// Kiem tra cau thieu ban dich: `node frontend/scripts/kiem-tra-dich.mjs`.

export type NgonNgu = "vi" | "en" | "id";
export const NGON_NGU: { ma: NgonNgu; nhan: string; ten: string }[] = [
  { ma: "vi", nhan: "VI", ten: "Tiếng Việt" },
  { ma: "en", nhan: "EN", ten: "English" },
  { ma: "id", nhan: "ID", ten: "Bahasa Indonesia" },
];
const KHOA_LUU = "ngon-ngu";

function docLuu(): NgonNgu {
  try {
    const v = localStorage.getItem(KHOA_LUU);
    if (v === "en" || v === "id" || v === "vi") return v;
  } catch {
    /* localStorage bi chan */
  }
  return "vi";
}

let hienTai: NgonNgu = docLuu();
const tuDien: Partial<Record<NgonNgu, Record<string, string>>> = {};
const nguoiNghe = new Set<() => void>();

function taiTuDien(n: NgonNgu): Promise<void> {
  if (n === "vi" || tuDien[n]) return Promise.resolve();
  const p = n === "en" ? import("./en") : import("./id");
  return p.then((m) => {
    tuDien[n] = m.default;
  });
}

/** Dich 1 cau tieng Viet sang ngon ngu dang chon (thieu ban dich -> giu tieng Viet). */
// Ngu canh: cung 1 chu tieng Viet nhung nghia khac (nut "Từ chối" = Reject, muc menu "Từ chối" = Rejected) -> khoa
// "Từ chối||nút": tieng Viet hien phan truoc "||", tu dien tra theo CA khoa.
export function t(vi: string, bien?: Record<string, string | number | null | undefined>): string {
  const ngat = vi.indexOf("||");
  const goc = ngat >= 0 ? vi.slice(0, ngat) : vi;
  let s = hienTai === "vi" ? goc : (tuDien[hienTai]?.[vi] ?? goc);
  if (bien) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in bien ? String(bien[k] ?? "") : m));
  return s;
}

/** Danh dau cau se dich LUC HIEN THI (tra nguyen tieng Viet) - dung trong hang so cap module (chay 1 lan luc nap file nen
 *  khong goi t() duoc): `{ label: dichSau("Trả phiếu") }` roi hien thi `t(x.label)`. Script kiem-tra-dich thu khoa tu day. */
export function dichSau(vi: string): string {
  return vi;
}

/** Dich node React neu la chuoi (component dung chung: tieu de Modal/Drawer, nhan tab/cot/KvRow/StatCard, chu tren nut/Badge).
 *  Node khac (JSX, so) giu nguyen. Du lieu nghiep vu truyen vao chi bi doi neu TRUNG DUNG 1 cau giao dien trong tu dien. */
export function tn<T>(node: T): T | string {
  return typeof node === "string" ? t(node) : node;
}

export function ngonNguHienTai(): NgonNgu {
  return hienTai;
}

export async function doiNgonNgu(n: NgonNgu): Promise<void> {
  await taiTuDien(n);
  hienTai = n;
  try {
    localStorage.setItem(KHOA_LUU, n);
  } catch {
    /* bo qua */
  }
  document.documentElement.lang = n;
  nguoiNghe.forEach((f) => f());
}

export function useNgonNgu(): NgonNgu {
  return useSyncExternalStore(
    (f) => {
      nguoiNghe.add(f);
      return () => nguoiNghe.delete(f);
    },
    () => hienTai,
  );
}

/** Boc cay App: cho tu dien tai xong roi moi ve; doi ngon ngu -> remount (key) de moi nhan tinh lai. */
export function NgonNguGate({ children }: { children: ReactNode }) {
  const n = useNgonNgu();
  const [sanSang, setSanSang] = useState(n === "vi" || !!tuDien[n]);
  useEffect(() => {
    document.documentElement.lang = n;
    if (sanSang) return;
    taiTuDien(n)
      .catch(() => {
        hienTai = "vi";
      })
      .finally(() => setSanSang(true));
  }, [n, sanSang]);
  if (!sanSang) return null;
  return <Fragment key={n}>{children}</Fragment>;
}

/** Nut chon VI / EN / ID. `toi` = dat tren nen toi (Sidebar mobile). */
export function ChonNgonNgu({ toi = false, className = "" }: { toi?: boolean; className?: string }) {
  const n = useNgonNgu();
  return (
    <div
      role="group"
      aria-label="Ngôn ngữ / Language / Bahasa"
      className={`inline-flex shrink-0 items-center rounded-[var(--radius-btn)] p-0.5 ${toi ? "bg-white/15" : "bg-[var(--color-subtle)]"} ${className}`}
    >
      {NGON_NGU.map((x) => {
        const on = x.ma === n;
        return (
          <button
            key={x.ma}
            type="button"
            title={x.ten}
            aria-pressed={on}
            onClick={() => !on && doiNgonNgu(x.ma)}
            className={`focus-ring h-7 min-w-[32px] rounded-[6px] px-1.5 text-[11px] font-bold transition-colors ${
              on
                ? toi
                  ? "bg-white text-[var(--color-primary)]"
                  : "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[var(--shadow-raise)]"
                : toi
                  ? "text-white/80 hover:text-white"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            }`}
          >
            {x.nhan}
          </button>
        );
      })}
    </div>
  );
}
