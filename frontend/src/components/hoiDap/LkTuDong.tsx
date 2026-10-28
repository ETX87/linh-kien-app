import { lazy, Suspense, useMemo, useState } from "react";
import { t } from "../../i18n";
import { fmtDate } from "../../types";
import type { LkDanhMucRow } from "../../modules/datMuaLinhKien/types";
import { useLienQuanLk, tongTonCongTy, tongTonKtv } from "../../modules/danhMucLinhKien/LienQuanLk";

// Tra loi TU DONG khi cau hoi co nhac ma linh kien (2026-10-28, "KTV hỏi hàng còn tồn kho không?, tự động xác định trong câu hỏi có thông
// tin liên quan đến mã linh kiện bất kỳ, sẽ hiện 1 câu trả lời ... khi click vào sẽ hiện thông tin UI linh kiện đó như tồn kho, đơn đang đặt
// của ktv"). Nhan dien TREN MAY tu danh muc LK da cache (useLkAndLdeCache) - khong ghi DB, ap ca cho tin cu, 2 phia deu thay. So lieu nhanh
// lay tu GET /settings/linh-kien/:ma/lien-quan (CUNG nguon/pham vi voi drawer Bang gia: KTV chi thay ton kho + don cua minh); bam the = mo
// XemLinhKienDrawer (tab Tong quan / Ton kho / Dat hang / Lien quan).
const XemLinhKienDrawer = lazy(() => import("../../modules/DanhMucLinhKienModule").then((m) => ({ default: m.XemLinhKienDrawer })));

const TOI_DA_MOI_TIN = 5;
const chuan = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

// Bo tim ma LK trong cau: khop CHINH XAC ma (khong phan biet hoa/thuong), khong ra thi khop sau khi bo dau gach/cham/khoang trang
// ("lk ro 75" khong tinh - chi 1 cum lien). Chi xet cum CO CHU SO (tranh "MAY", "BOM"... trung ma chu thuong gap) va >= 3 ky tu.
export function useTimMaLk(danhMuc: LkDanhMucRow[]) {
  return useMemo(() => {
    const chinhXac = new Map<string, LkDanhMucRow>();
    const daChuan = new Map<string, LkDanhMucRow | null>(); // null = nhieu ma trung sau khi chuan hoa -> bo
    for (const r of danhMuc) {
      chinhXac.set(r.ma_linh_kien.toUpperCase(), r);
      const k = chuan(r.ma_linh_kien);
      if (k.length >= 4) daChuan.set(k, daChuan.has(k) ? null : r);
    }
    return (cau: string, them: (string | null | undefined)[] = []): LkDanhMucRow[] => {
      const kq = new Map<string, LkDanhMucRow>();
      const xet = (tu: string) => {
        if (kq.size >= TOI_DA_MOI_TIN || tu.length < 3 || !/\d/.test(tu)) return;
        const r = chinhXac.get(tu.toUpperCase()) ?? daChuan.get(chuan(tu)) ?? null;
        if (r) kq.set(r.ma_linh_kien, r);
      };
      for (const m of them) if (m) { const r = chinhXac.get(m.toUpperCase()); if (r) kq.set(r.ma_linh_kien, r); }
      for (const tu of cau.match(/[A-Za-z0-9][A-Za-z0-9._\-/]*[A-Za-z0-9]/g) ?? []) xet(tu);
      return [...kq.values()];
    };
  }, [danhMuc]);
}

function TheLk({ lk, onMo }: { lk: LkDanhMucRow; onMo: () => void }) {
  const { data, isLoading, isError } = useLienQuanLk(lk.ma_linh_kien);
  const tonCty = tongTonCongTy(data);
  const kho = (data?.ton_kho_cong_ty ?? []).filter((r) => r.sl_ton !== 0).slice(0, 3);
  const tonKtv = tongTonKtv(data);
  const tk = data?.thong_ke_dat_hang;
  return (
    <button
      type="button"
      onClick={onMo}
      className="focus-ring block w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left transition-colors hover:border-[var(--color-primary)]"
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-text)]">{lk.ten_linh_kien}</span>
        <span className="shrink-0 font-mono text-[11px] text-[var(--color-primary-dark)]">{lk.ma_linh_kien}</span>
      </div>
      {isLoading ? (
        <div className="mt-1 text-[11.5px] text-[var(--color-text-secondary)]">{t("Đang tải tồn kho…")}</div>
      ) : isError || !data ? (
        <div className="mt-1 text-[11.5px] text-[var(--color-text-secondary)]">{t("Bấm để xem thông tin linh kiện")}</div>
      ) : (
        <div className="mt-1 space-y-0.5 text-[12px] text-[var(--color-text-body)]">
          <div>
            {t("Tồn kho công ty:")}{" "}
            <b className={tonCty > 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>{tonCty > 0 ? tonCty.toLocaleString("vi-VN") : t("Hết hàng")}</b>
            {kho.length > 0 && <span className="text-[var(--color-text-secondary)]"> ({kho.map((r) => `${r.ten_kho || r.ma_kho}: ${r.sl_ton.toLocaleString("vi-VN")}`).join(" · ")})</span>}
          </div>
          {tonKtv > 0 && <div>{t("Tồn kho KTV:")} <b>{tonKtv.toLocaleString("vi-VN")}</b></div>}
          <div className="text-[var(--color-text-secondary)]">
            {t("Đơn đang chờ hàng: {a} · Đơn đặt 30 ngày: {b}", { a: Number(tk?.dang_cho_hang ?? 0), b: Number(tk?.don_30 ?? 0) })}
          </div>
          {data.phien_ban_ton_kho && <div className="text-[10.5px] text-[var(--color-text-faint)]">{t("Tồn kho theo file MISA cập nhật {a}", { a: fmtDate(data.phien_ban_ton_kho) })}</div>}
        </div>
      )}
      <div className="mt-1 text-[11.5px] font-semibold text-[var(--color-primary)]">{t("Xem chi tiết: tồn kho, đơn đang đặt ›")}</div>
    </button>
  );
}

// Bong bong "🤖" ngay sau tin nhan co nhac ma LK.
export function TraLoiLinhKien({ ds }: { ds: LkDanhMucRow[] }) {
  const [dangXem, setDangXem] = useState<string | null>(null);
  if (ds.length === 0) return null;
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-1.5 rounded-2xl rounded-bl-sm border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)] px-3 py-2.5">
        <div className="text-[12px] font-semibold text-[var(--color-primary-dark)]">
          🤖 {ds.length === 1 ? t("Thông tin linh kiện trong câu hỏi") : t("Thông tin {n} linh kiện trong câu hỏi", { n: ds.length })}
        </div>
        {ds.map((lk) => <TheLk key={lk.ma_linh_kien} lk={lk} onMo={() => setDangXem(lk.ma_linh_kien)} />)}
      </div>
      {dangXem && (
        <Suspense fallback={null}>
          <XemLinhKienDrawer ma={dangXem} onClose={() => setDangXem(null)} />
        </Suspense>
      )}
    </div>
  );
}
