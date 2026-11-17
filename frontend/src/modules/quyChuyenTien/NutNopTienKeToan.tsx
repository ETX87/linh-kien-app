import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { Btn } from "../../components/ui/Btn";
import { Money } from "../../components/ui/Money";
import { fmtDateTime, fmtVND } from "../../types";
import { formatPersonDisplay, usePersonDirectory } from "../../lib/personDisplay";
import { amBao } from "../../lib/amBao";
import { NopTienChiTiet, type NopTienRow } from "./NopTienQuy";
import { t } from "../../i18n";

// ICON NOI "Tiền nạp quỹ chờ xác nhận" cho KE TOAN (2026-10-30, v1.427 - "tiền nạp quỹ làm sao để kế toán biết cần xác nhận nếu họ chỉ quen vào mục
// phiếu? tạo luôn 1 icon popup hiện góc giống chat cho kế toán"). Cung cho voi nut "Nạp quỹ" cua KTV (NutNopQuyNoi - 2 nhom nguoi khong giao nhau):
// ben trai nut chat. So do = so yeu cau "Cho ke toan" (GET /quy-ktv/nop-tien, cung quyen duyet laKeToanNopTien backend = Ke toan + Admin; Admin chi
// thay icon khi co yeu cau). Bam = popup danh sach cho, bam dong = NopTienChiTiet (xac nhan so thuc nhan / tu choi) ngay tai cho. Yeu cau MOI (id lon
// hon lan hoi truoc) -> popup nhac canh icon + am bao; lan tai dau con yeu cau cho -> popup nhac khong am bao.
const QS = "trang_thai=Cho%20ke%20toan&pageSize=50";

export function NutNopTienKeToan() {
  const auth = useAuth();
  const isMobile = useIsMobile();
  const u = auth.status === "authenticated" ? auth.user : null;
  const laKeToan = !!u && !!u.la_ke_toan;
  const duocDuyet = !!u && (laKeToan || u.vai_tro === "Admin");
  const { data } = useQuery({
    queryKey: ["quy-ktv-nop-tien", "cho-ke-toan-noi"],
    queryFn: () => api.get<{ rows: NopTienRow[]; total: number }>(`/quy-ktv/nop-tien?${QS}`),
    enabled: duocDuyet,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
  const rows = data?.rows ?? [];
  const tong = data?.total ?? 0;
  const dir = usePersonDirectory();
  const ten = (e: string | null | undefined) => (e ? formatPersonDisplay(e, dir) : "");
  const [mo, setMo] = useState(false);
  const [chiTiet, setChiTiet] = useState<number | null>(null);
  const [nhac, setNhac] = useState<NopTienRow | null>(null);

  // Phat hien yeu cau moi: so id lon nhat giua 2 lan hoi.
  const mocId = useRef<number | null>(null);
  useEffect(() => {
    if (!data) return;
    const maxId = rows.reduce((m, r) => Math.max(m, r.id), 0);
    const lanDau = mocId.current === null;
    const truoc = mocId.current ?? 0;
    mocId.current = Math.max(truoc, maxId);
    if (!rows.length) { setNhac(null); return; }
    if (mo) return;
    if (lanDau) { setNhac(rows[0]); return; }
    if (maxId > truoc) {
      setNhac(rows.find((r) => r.id === maxId) ?? rows[0]);
      amBao();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!duocDuyet || (!laKeToan && tong === 0)) return null;
  // Goc duoi phai - cho cua nut chat Hoi dap cu (da xoa 2026-11-17, v1.516).
  const viTriNut = isMobile ? "right-3 bottom-[calc(9rem+env(safe-area-inset-bottom))]" : "right-5 bottom-28";
  const viTriKhung = isMobile
    ? "inset-x-3 bottom-[calc(13rem+env(safe-area-inset-bottom))] max-h-[60dvh]"
    : "right-5 bottom-[11.5rem] w-[360px] max-h-[min(480px,calc(100vh-14rem))]";

  return (
    <>
      {nhac && !mo && (
        <div className={`toast-in fixed z-40 rounded-[var(--radius-card)] border border-[var(--color-border)] border-l-4 border-l-[var(--color-warning)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-raise)] ${isMobile ? "inset-x-3 bottom-[calc(13rem+env(safe-area-inset-bottom))]" : "right-5 bottom-[11.5rem] w-[320px]"}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="text-[13px] font-bold text-[var(--color-text)]">
              💰 {tong > 1 ? t("{n} yêu cầu nạp quỹ chờ xác nhận", { n: tong }) : t("Có yêu cầu nạp quỹ chờ xác nhận")}
            </div>
            <button type="button" onClick={() => setNhac(null)} className="focus-ring -mr-1 -mt-1 px-1 text-[var(--color-text-faint)] hover:text-[var(--color-text)]" aria-label={t("Đóng")}>✕</button>
          </div>
          <div className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
            NTQ-{nhac.id} · {ten(nhac.nguoi_gui)} · <b className="text-[var(--color-text)]"><Money>{fmtVND(nhac.so_tien)}</Money></b>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Btn size="sm" variant="ghost" onClick={() => { setNhac(null); setMo(true); }}>{t("Xem danh sách")}</Btn>
            <Btn size="sm" onClick={() => { setChiTiet(nhac.id); setNhac(null); }}>{t("Xác nhận ngay")}</Btn>
          </div>
        </div>
      )}
      {mo && (
        <div role="dialog" aria-label={t("Nạp quỹ chờ xác nhận")} className={`fixed z-40 flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-raise)] ${viTriKhung}`}>
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <div className="text-[13px] font-bold text-[var(--color-text)]">💰 {t("Nạp quỹ chờ xác nhận")} <span className="tabular text-[var(--color-text-secondary)]">({tong})</span></div>
            <button type="button" onClick={() => setMo(false)} className="focus-ring px-1 text-[var(--color-text-faint)] hover:text-[var(--color-text)]" aria-label={t("Đóng")}>✕</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="px-3 py-6 text-center text-[13px] text-[var(--color-text-secondary)]">{t("Không còn yêu cầu nào chờ xác nhận")}</div>
            ) : (
              rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setChiTiet(r.id)}
                  className="focus-ring flex w-full items-start justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2 text-left hover:bg-[var(--color-surface-hover)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-[var(--color-text)]">{ten(r.nguoi_gui)}</span>
                    <span className="block text-[11px] text-[var(--color-text-secondary)]">
                      <span className="font-mono">NTQ-{r.id}</span> · {fmtDateTime(r.ngay_tao)}
                      {r.trung && <span className="ml-1 text-[var(--color-warning-strong)]" title={t("Trùng số tiền: {a}", { a: r.trung })}>⚠ {t("trùng số tiền")}</span>}
                    </span>
                  </span>
                  <b className="shrink-0 text-[13px] text-[var(--color-text)]"><Money>{fmtVND(r.so_tien)}</Money></b>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-[var(--color-border)] px-3 py-2 text-right">
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                setMo(false);
                // Mo menu Quỹ › tab "Nộp tiền vào quỹ" (App.tsx nghe su kien, id rong = chi chuyen tab).
                window.dispatchEvent(new CustomEvent("mo-nop-tien", { detail: "" }));
              }}
            >
              {t("Mở mục Nộp tiền vào quỹ")}
            </Btn>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => { setMo((v) => !v); setNhac(null); }}
        title={t("Nạp quỹ chờ xác nhận")}
        aria-label={t("Nạp quỹ chờ xác nhận")}
        className={`focus-ring fixed z-40 grid h-[52px] w-[52px] place-items-center rounded-full border border-[var(--color-primary)] bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[var(--shadow-raise)] transition-transform hover:scale-105 hover:bg-[var(--color-primary-soft)] ${viTriNut}`}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          <path d="M21 9h-5a3 3 0 0 0 0 6h5z" />
          <path d="m7 12 2 2 4-4" />
        </svg>
        {tong > 0 && (
          <span className="tabular absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[11px] font-bold text-white ring-2 ring-[var(--color-surface)]">
            {tong > 99 ? "99+" : tong}
          </span>
        )}
        <span className="pointer-events-none absolute -bottom-4 whitespace-nowrap rounded bg-[var(--color-surface)] px-1 text-[10px] font-semibold leading-tight text-[var(--color-primary)]">
          {t("Nạp quỹ")}
        </span>
      </button>
      {chiTiet != null && <NopTienChiTiet id={chiTiet} row={rows.find((r) => r.id === chiTiet)} ten={ten} onClose={() => setChiTiet(null)} />}
    </>
  );
}
