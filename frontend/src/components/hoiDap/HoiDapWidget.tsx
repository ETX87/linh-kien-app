import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../ui/Btn";
import { Badge, type Tone } from "../x/Badge";
import { useToast } from "../ui/Toast";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { pushOverlayClose } from "../../lib/overlayStack";
import { fmtDateTime } from "../../types";
import { t, dichSau } from "../../i18n";
import { LinhKienPicker } from "../../modules/datMuaLinhKien/LinhKienPicker";
import { useLkAndLdeCache, describeApiError } from "../../modules/datMuaLinhKien/helpers";

// HỎI ĐÁP KTV ↔ MUA HÀNG (2026-10-17, backend routes/hoiDap.ts, migration 0089) - "tạo 1 icon chat ở góc bên phải góc dưới, KTV ấn vào
// sẽ mở giao diện hỏi đáp. KTV sẽ gửi câu hỏi lên và chờ nv mua hàng giải đáp thắc mắc. Mỗi phiên chat sẽ tạo 1 ticket theo dõi".
// 1 widget cho CA 2 phia: nguoi hoi (KTV...) thay cau hoi cua minh; Mua hang/Admin (la_xu_ly) thay hang cho cua moi nguoi + nut xu ly.
// Chuong thong bao mo dung ticket qua su kien window "mo-hoi-dap" (detail = id ticket) - xem NotificationBell.tsx.

export type TrangThai = "Cho tiep nhan" | "Dang xu ly" | "Da xu ly" | "Huy bo" | "Tu choi";
export const TT: Record<TrangThai, { label: string; tone: Tone }> = {
  "Cho tiep nhan": { label: dichSau("Chờ tiếp nhận"), tone: "warning" },
  "Dang xu ly": { label: dichSau("Đang xử lý"), tone: "info" },
  "Da xu ly": { label: dichSau("Đã xử lý"), tone: "success" },
  "Huy bo": { label: dichSau("Hủy bỏ"), tone: "neutral" },
  "Tu choi": { label: dichSau("Từ chối"), tone: "danger" },
};
export const LOAI: Record<string, string> = { hoi_gia: dichSau("Hỏi giá"), hoi_ngay_ve: dichSau("Hỏi ngày hàng về"), khac: dichSau("Hỏi khác") };
export const LOC_XU_LY: { v: string; label: string }[] = [
  { v: "__MO__", label: dichSau("Đang mở") },
  { v: "Cho tiep nhan", label: dichSau("Chờ tiếp nhận") },
  { v: "Dang xu ly", label: dichSau("Đang xử lý") },
  { v: "Da xu ly", label: dichSau("Đã xử lý") },
  { v: "Tu choi", label: dichSau("Từ chối") },
  { v: "Huy bo", label: dichSau("Hủy bỏ") },
  { v: "", label: dichSau("Tất cả") },
];

export interface HoiDapRow {
  id: string;
  nguoi_hoi: string;
  ten_nguoi_hoi: string;
  loai: string;
  ma_lk: string | null;
  ma_don: string | null;
  tieu_de: string;
  trang_thai: TrangThai;
  nguoi_xu_ly: string | null;
  ten_nguoi_xu_ly: string | null;
  ly_do: string | null;
  ngay_tao: string;
  tin_cuoi_luc: string;
  chua_doc?: boolean;
}
interface ChiTiet {
  ticket: HoiDapRow;
  tin: { id: number; nguoi_gui: string; ten_nguoi_gui: string; phia: "hoi" | "xu_ly" | "he_thong"; noi_dung: string; ngay_tao: string }[];
  phia: "hoi" | "xu_ly";
  quyen: { gui_tin: boolean; tiep_nhan: boolean; da_xu_ly: boolean; tu_choi: boolean; huy_bo: boolean };
}
type Man = { ten: "ds" } | { ten: "moi"; loai?: string; maLk?: string; maDon?: string } | { ten: "ct"; id: string };

const O_NHAP = "focus-ring w-full rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-base sm:text-sm";

export function TtBadge({ tt }: { tt: TrangThai }) {
  return <Badge tone={TT[tt]?.tone ?? "neutral"}>{t(TT[tt]?.label ?? tt)}</Badge>;
}

export function HoiDapWidget() {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [mo, setMo] = useState(false);
  const [man, setMan] = useState<Man>({ ten: "ds" });

  const { data: dem } = useQuery({
    queryKey: ["hoi-dap-dem"],
    queryFn: () => api.get<{ la_xu_ly: boolean; chua_doc: number; cho_tiep_nhan: number }>("/hoi-dap/dem"),
    refetchInterval: mo ? 20_000 : 60_000,
  });
  const soBadge = (dem?.chua_doc ?? 0) + (dem?.cho_tiep_nhan ?? 0);

  // Chuong thong bao (link_type 'hoi_dap') mo dung ticket.
  useEffect(() => {
    const nghe = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setMo(true);
      setMan(id ? { ten: "ct", id } : { ten: "ds" });
    };
    window.addEventListener("mo-hoi-dap", nghe);
    return () => window.removeEventListener("mo-hoi-dap", nghe);
  }, []);
  // Nut Back (mobile) / Esc dong khung - dung chung overlayStack nhu Drawer/Modal.
  useEffect(() => {
    if (!mo) return;
    return pushOverlayClose(() => setMo(false));
  }, [mo]);

  const lamMoi = () => {
    qc.invalidateQueries({ queryKey: ["hoi-dap-dem"] });
    qc.invalidateQueries({ queryKey: ["hoi-dap-ds"] });
    qc.invalidateQueries({ queryKey: ["hoi-dap-ct"] });
  };

  return (
    <>
      {!mo && (
        <button
          type="button"
          onClick={() => setMo(true)}
          title={t("Hỏi đáp mua hàng")}
          aria-label={t("Hỏi đáp mua hàng")}
          className={`focus-ring fixed z-40 grid h-[52px] w-[52px] place-items-center rounded-full bg-[var(--color-primary)] text-white shadow-[var(--shadow-raise)] transition-transform hover:scale-105 hover:bg-[var(--color-primary-hover)] ${
            isMobile ? "right-3 bottom-[calc(9rem+env(safe-area-inset-bottom))]" : "right-5 bottom-28"
          }`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M8 9h8M8 13h5" />
          </svg>
          {soBadge > 0 && (
            <span className="tabular absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[11px] font-bold text-white ring-2 ring-[var(--color-surface)]">
              {soBadge > 99 ? "99+" : soBadge}
            </span>
          )}
        </button>
      )}
      {mo && (
        <div
          role="dialog"
          aria-label={t("Hỏi đáp mua hàng")}
          className={`fixed z-50 flex flex-col overflow-hidden bg-[var(--color-surface)] ${
            isMobile
              ? "inset-0 h-[100dvh]"
              : "right-5 bottom-5 h-[min(620px,calc(100vh-2.5rem))] w-[400px] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-raise)]"
          }`}
        >
          {man.ten === "ds" && (
            <DanhSach laXuLy={!!dem?.la_xu_ly} onDong={() => setMo(false)} onMo={(id) => setMan({ ten: "ct", id })} onMoi={() => setMan({ ten: "moi" })} />
          )}
          {man.ten === "moi" && (
            <CauHoiMoi
              goiY={man}
              onQuay={() => setMan({ ten: "ds" })}
              onDong={() => setMo(false)}
              onXong={(id) => {
                lamMoi();
                setMan({ ten: "ct", id });
              }}
            />
          )}
          {man.ten === "ct" && (
            <ChiTietHoiDap
              id={man.id}
              onQuay={() => setMan({ ten: "ds" })}
              onDong={() => setMo(false)}
              onHoiTiep={(tk) => setMan({ ten: "moi", loai: tk.loai, maLk: tk.ma_lk ?? undefined, maDon: tk.ma_don ?? undefined })}
              onDoi={lamMoi}
            />
          )}
        </div>
      )}
    </>
  );
}

function DauKhung({ tieuDe, phu, onQuay, onDong }: { tieuDe: ReactNode; phu?: ReactNode; onQuay?: () => void; onDong: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3 py-2.5">
      {onQuay && (
        <button type="button" onClick={onQuay} className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-subtle)]" aria-label={t("Quay lại")}>
          ‹
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold text-[var(--color-text)]">{tieuDe}</div>
        {phu && <div className="truncate text-[11.5px] text-[var(--color-text-secondary)]">{phu}</div>}
      </div>
      <button type="button" onClick={onDong} className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-subtle)]" aria-label={t("Đóng")}>
        ✕
      </button>
    </div>
  );
}

function DanhSach({ laXuLy, onDong, onMo, onMoi }: { laXuLy: boolean; onDong: () => void; onMo: (id: string) => void; onMoi: () => void }) {
  const [loc, setLoc] = useState("__MO__");
  const [q, setQ] = useState("");
  const [qGui, setQGui] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setQGui(q.trim()), 400);
    return () => clearTimeout(h);
  }, [q]);
  const { data, isLoading } = useQuery({
    queryKey: ["hoi-dap-ds", loc, qGui],
    queryFn: () => api.get<{ la_xu_ly: boolean; rows: HoiDapRow[] }>(`/hoi-dap?trang_thai=${encodeURIComponent(loc)}&q=${encodeURIComponent(qGui)}`),
    refetchInterval: 20_000,
  });
  const rows = data?.rows ?? [];
  const locs = laXuLy ? LOC_XU_LY : LOC_XU_LY.filter((l) => l.v === "__MO__" || l.v === "");
  return (
    <>
      <DauKhung tieuDe={t("Hỏi đáp mua hàng")} phu={laXuLy ? t("Giải đáp câu hỏi của KTV về giá, ngày hàng về…") : t("Hỏi nhân viên mua hàng về giá, ngày hàng về…")} onDong={onDong} />
      <div className="shrink-0 space-y-2 border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {locs.map((l) => (
            <button key={l.v} type="button" onClick={() => setLoc(l.v)} className={`filter-tab shrink-0 ${loc === l.v ? "active" : ""}`}>
              {t(l.label)}
            </button>
          ))}
        </div>
        {laXuLy && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Tìm mã HD, mã LK, mã đơn, nội dung…")} className={O_NHAP} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-[var(--color-text-secondary)]">{t("Đang tải...")}</div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-[var(--color-text-secondary)]">
            {laXuLy ? t("Không có câu hỏi nào.") : t("Bạn chưa có câu hỏi nào. Bấm \"Câu hỏi mới\" để hỏi nhân viên mua hàng.")}
          </div>
        ) : (
          rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onMo(r.id)}
              className="focus-ring block w-full border-b border-[var(--color-border-soft)] px-3 py-2.5 text-left hover:bg-[var(--color-surface-soft)]"
            >
              <div className="flex items-center gap-2">
                {r.chua_doc && <span aria-label={t("Tin mới")} className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-danger)]" />}
                <span className="font-mono text-[12px] font-semibold text-[var(--color-primary-dark)]">{r.id}</span>
                <span className="truncate text-[11.5px] text-[var(--color-text-secondary)]">{t(LOAI[r.loai] ?? r.loai)}{r.ma_lk ? ` · ${r.ma_lk}` : ""}</span>
                <span className="ml-auto shrink-0"><TtBadge tt={r.trang_thai} /></span>
              </div>
              <div className={`mt-1 truncate text-[13px] ${r.chua_doc ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text-body)]"}`}>{r.tieu_de}</div>
              <div className="mt-0.5 flex gap-2 truncate text-[11px] text-[var(--color-text-faint)]">
                {laXuLy && <span className="truncate">{r.ten_nguoi_hoi}</span>}
                <span className="ml-auto shrink-0">{fmtDateTime(r.tin_cuoi_luc)}</span>
              </div>
            </button>
          ))
        )}
      </div>
      <div className="shrink-0 border-t border-[var(--color-border)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Btn className="min-h-10 w-full" onClick={onMoi}>{t("＋ Câu hỏi mới")}</Btn>
      </div>
    </>
  );
}

function CauHoiMoi({
  goiY, onQuay, onDong, onXong,
}: { goiY: { loai?: string; maLk?: string; maDon?: string }; onQuay: () => void; onDong: () => void; onXong: (id: string) => void }) {
  const toast = useToast();
  const [loai, setLoai] = useState(goiY.loai ?? "hoi_gia");
  const [maLk, setMaLk] = useState(goiY.maLk ?? "");
  const [maDon, setMaDon] = useState(goiY.maDon ?? "");
  const [noiDung, setNoiDung] = useState("");
  const { danhMuc } = useLkAndLdeCache(true);
  const m = useMutation({
    mutationFn: () => api.post<{ id: string }>("/hoi-dap", { loai, ma_lk: maLk || undefined, ma_don: maDon.trim() || undefined, noi_dung: noiDung.trim() }),
    onSuccess: (r) => {
      toast(t("Đã gửi câu hỏi {a} — chờ nhân viên mua hàng tiếp nhận", { a: r.id }));
      onXong(r.id);
    },
    onError: (e) => toast(t("Lỗi: ") + describeApiError(e)),
  });
  return (
    <>
      <DauKhung tieuDe={t("Câu hỏi mới")} onQuay={onQuay} onDong={onDong} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        <div>
          <div className="mb-1 text-xs font-semibold text-[var(--color-text-body)]">{t("Bạn muốn hỏi")}</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(LOAI).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setLoai(k)} className={`filter-tab ${loai === k ? "active" : ""}`}>
                {t(v)}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Linh kiện (nếu có)")}</span>
          <LinhKienPicker value={maLk} onChange={setMaLk} options={danhMuc} ghiLichSu={false} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Mã đơn / mã phiếu (nếu có)")}</span>
          <input value={maDon} onChange={(e) => setMaDon(e.target.value)} placeholder="DDH-…, PMH-…" className={O_NHAP} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Nội dung câu hỏi *")}</span>
          <textarea
            rows={5}
            value={noiDung}
            onChange={(e) => setNoiDung(e.target.value)}
            maxLength={2000}
            placeholder={loai === "hoi_ngay_ve" ? t("VD: Linh kiện này khi nào kho có hàng?") : loai === "hoi_gia" ? t("VD: Giá KTV của linh kiện này là bao nhiêu?") : ""}
            className={`${O_NHAP} resize-none`}
          />
        </label>
      </div>
      <div className="flex shrink-0 gap-2 border-t border-[var(--color-border)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Btn variant="ghost" className="min-h-10 flex-1" onClick={onQuay}>{t("Quay lại")}</Btn>
        <Btn className="min-h-10 flex-1" onClick={() => m.mutate()} loading={m.isPending} disabled={!noiDung.trim()}>
          {t("Gửi câu hỏi")}
        </Btn>
      </div>
    </>
  );
}

function ChiTietHoiDap({
  id, onQuay, onDong, onHoiTiep, onDoi,
}: { id: string; onQuay: () => void; onDong: () => void; onHoiTiep: (tk: HoiDapRow) => void; onDoi: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [tin, setTin] = useState("");
  const [lyDoMo, setLyDoMo] = useState<"Tu choi" | "Huy bo" | null>(null);
  const [lyDo, setLyDo] = useState("");
  const cuoiRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["hoi-dap-ct", id],
    queryFn: () => api.get<ChiTiet>(`/hoi-dap/${encodeURIComponent(id)}`),
    refetchInterval: 10_000,
  });
  const soTin = data?.tin.length ?? 0;
  // Danh dau da doc moi khi co tin moi (ca lan mo dau) + cuon xuong cuoi.
  useEffect(() => {
    if (!data) return;
    cuoiRef.current?.scrollIntoView({ block: "end" });
    api.post(`/hoi-dap/${encodeURIComponent(id)}/doc`, {}).then(() => {
      qc.invalidateQueries({ queryKey: ["hoi-dap-dem"] });
      qc.invalidateQueries({ queryKey: ["hoi-dap-ds"] });
    }).catch(() => undefined);
  }, [id, soTin, data?.ticket.trang_thai]); // eslint-disable-line react-hooks/exhaustive-deps

  const gui = useMutation({
    mutationFn: () => api.post(`/hoi-dap/${encodeURIComponent(id)}/tin`, { noi_dung: tin.trim() }),
    onSuccess: () => {
      setTin("");
      onDoi();
    },
    onError: (e) => toast(t("Lỗi: ") + describeApiError(e)),
  });
  const doiTt = useMutation({
    mutationFn: (a: { trang_thai: TrangThai; ly_do?: string }) => api.post(`/hoi-dap/${encodeURIComponent(id)}/trang-thai`, a),
    onSuccess: (_r, a) => {
      setLyDoMo(null);
      setLyDo("");
      toast(t("Đã chuyển {a} → {b}", { a: id, b: t(TT[a.trang_thai].label) }));
      onDoi();
    },
    onError: (e) => toast(t("Lỗi: ") + describeApiError(e)),
  });

  if (isLoading || !data) {
    return (
      <>
        <DauKhung tieuDe={id} onQuay={onQuay} onDong={onDong} />
        <div className="py-8 text-center text-sm text-[var(--color-text-secondary)]">{isError ? t("Không tải được câu hỏi.") : t("Đang tải...")}</div>
      </>
    );
  }
  const tk = data.ticket;
  const q = data.quyen;
  return (
    <>
      <DauKhung
        tieuDe={<span className="flex items-center gap-2">{tk.id} <TtBadge tt={tk.trang_thai} /></span>}
        phu={[t(LOAI[tk.loai] ?? tk.loai), tk.ma_lk, tk.ma_don, data.phia === "xu_ly" ? tk.ten_nguoi_hoi : tk.ten_nguoi_xu_ly ? t("Người xử lý: {a}", { a: tk.ten_nguoi_xu_ly }) : null].filter(Boolean).join(" · ")}
        onQuay={onQuay}
        onDong={onDong}
      />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[var(--color-surface-soft)] px-3 py-3">
        {data.tin.map((m) => {
          if (m.phia === "he_thong") {
            return (
              <div key={m.id} className="text-center text-[11px] text-[var(--color-text-secondary)]">
                {m.ten_nguoi_gui} · {m.noi_dung} · {fmtDateTime(m.ngay_tao)}
              </div>
            );
          }
          const cuaToi = m.phia === data.phia;
          return (
            <div key={m.id} className={`flex ${cuaToi ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] ${
                  cuaToi
                    ? "rounded-br-sm bg-[var(--color-primary)] text-white"
                    : "rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                }`}
              >
                {!cuaToi && <div className="mb-0.5 text-[11px] font-semibold text-[var(--color-primary-dark)]">{m.ten_nguoi_gui}</div>}
                <div className="whitespace-pre-wrap break-words">{m.noi_dung}</div>
                <div className={`mt-1 text-right text-[10.5px] ${cuaToi ? "text-white/75" : "text-[var(--color-text-faint)]"}`}>{fmtDateTime(m.ngay_tao)}</div>
              </div>
            </div>
          );
        })}
        <div ref={cuoiRef} />
      </div>
      <div className="shrink-0 space-y-2 border-t border-[var(--color-border)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {lyDoMo ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[var(--color-text-body)]">
              {lyDoMo === "Tu choi" ? t("Lý do từ chối *") : t("Lý do hủy câu hỏi (tuỳ chọn)")}
            </div>
            <textarea rows={2} value={lyDo} onChange={(e) => setLyDo(e.target.value)} className={`${O_NHAP} resize-none`} autoFocus />
            <div className="flex gap-2">
              <Btn variant="ghost" className="min-h-10 flex-1" onClick={() => setLyDoMo(null)}>{t("Quay lại")}</Btn>
              <Btn
                variant="danger"
                className="min-h-10 flex-1"
                loading={doiTt.isPending}
                disabled={lyDoMo === "Tu choi" && !lyDo.trim()}
                onClick={() => doiTt.mutate({ trang_thai: lyDoMo, ly_do: lyDo.trim() || undefined })}
              >
                {lyDoMo === "Tu choi" ? t("Từ chối") : t("Hủy câu hỏi")}
              </Btn>
            </div>
          </div>
        ) : q.gui_tin ? (
          <>
            {(q.tiep_nhan || q.da_xu_ly || q.tu_choi || q.huy_bo) && (
              <div className="flex flex-wrap gap-1.5">
                {q.tiep_nhan && <Btn size="sm" variant="ghost" loading={doiTt.isPending} onClick={() => doiTt.mutate({ trang_thai: "Dang xu ly" })}>{t("Tiếp nhận")}</Btn>}
                {q.da_xu_ly && <Btn size="sm" variant="success" loading={doiTt.isPending} onClick={() => doiTt.mutate({ trang_thai: "Da xu ly" })}>{t("✓ Đã xử lý")}</Btn>}
                {q.tu_choi && <Btn size="sm" variant="ghost" onClick={() => setLyDoMo("Tu choi")}>{t("Từ chối…")}</Btn>}
                {q.huy_bo && <Btn size="sm" variant="ghost" onClick={() => setLyDoMo("Huy bo")}>{t("Hủy câu hỏi")}</Btn>}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={tin}
                onChange={(e) => setTin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (tin.trim() && !gui.isPending) gui.mutate();
                  }
                }}
                maxLength={2000}
                placeholder={data.phia === "xu_ly" ? t("Nhập câu trả lời… (Enter để gửi)") : t("Nhập tin nhắn… (Enter để gửi)")}
                className={`${O_NHAP} resize-none`}
              />
              <Btn className="min-h-10 shrink-0" onClick={() => gui.mutate()} loading={gui.isPending} disabled={!tin.trim()}>{t("Gửi")}</Btn>
            </div>
          </>
        ) : (
          <div className="space-y-2 text-center">
            <div className="text-xs text-[var(--color-text-secondary)]">
              {t("Phiên hỏi đáp đã đóng — {a}", { a: t(TT[tk.trang_thai].label) })}
              {tk.ly_do ? ` · ${tk.ly_do}` : ""}
            </div>
            {data.phia === "hoi" && (
              <Btn variant="ghost" className="min-h-10 w-full" onClick={() => onHoiTiep(tk)}>{t("Hỏi tiếp (tạo câu hỏi mới)")}</Btn>
            )}
          </div>
        )}
      </div>
    </>
  );
}
