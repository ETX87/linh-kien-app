import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../ui/Btn";
import { Badge, type Tone } from "../x/Badge";
import { useToast } from "../ui/Toast";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { usePushNotifications } from "../../hooks/usePushNotifications";
import { pushOverlayClose } from "../../lib/overlayStack";
import { fmtDateTime } from "../../types";
import { t, dichSau } from "../../i18n";
import { useLkAndLdeCache, describeApiError } from "../../modules/datMuaLinhKien/helpers";
import { FileButton } from "../ui/FileButton";
import type { LkDanhMucRow } from "../../modules/datMuaLinhKien/types";
import { useTimMaLk, TraLoiLinhKien } from "./LkTuDong";
import { HoiNhanh, GhiChuTuDong } from "./HoiNhanh";
import {
  AnhLuoi, ChonHuongDanModal, HuongDanChiTiet, HuongDanDanhSach, HuongDanForm, HuongDanThe, useHuongDan, useTaiAnh,
  type HuongDan, type HuongDanNhap,
} from "./HuongDan";

// HỎI ĐÁP KTV ↔ MUA HÀNG (2026-10-17, backend routes/hoiDap.ts, migration 0089) - "tạo 1 icon chat ở góc bên phải góc dưới, KTV ấn vào
// sẽ mở giao diện hỏi đáp. KTV sẽ gửi câu hỏi lên và chờ nv mua hàng giải đáp thắc mắc. Mỗi phiên chat sẽ tạo 1 ticket theo dõi".
// 1 widget cho CA 2 phia: nguoi hoi (KTV...) thay cau hoi cua minh; Mua hang/Admin (la_xu_ly) thay hang cho cua moi nguoi + nut xu ly.
// Chuong thong bao mo dung ticket qua su kien window "mo-hoi-dap" (detail = id ticket) - xem NotificationBell.tsx.
// HỎI ĐÁP TỰ ĐỘNG (2026-10-28, migration 0102 - HuongDan.tsx): nguoi hoi mo khung thay ngay tab "Hướng dẫn"; go cau hoi -> goi y huong dan;
// gui xong he thong tu tra loi bang huong dan khop nhat (tin 'he_thong' kem huong_dan_ids). Tin nhan 2 phia dinh kem anh (tu tai len
// Drive qua POST /hoi-dap/anh); Mua hang gui kem huong dan ("📘 Hướng dẫn") + "Lưu thành hướng dẫn" tu 1 phien da tra loi.

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
  tin: {
    id: number; nguoi_gui: string; ten_nguoi_gui: string; phia: "hoi" | "xu_ly" | "he_thong"; noi_dung: string; ngay_tao: string;
    anh: string[]; huong_dan_ids: number[];
  }[];
  huong_dan: HuongDan[];
  phia: "hoi" | "xu_ly";
  quyen: { gui_tin: boolean; tiep_nhan: boolean; da_xu_ly: boolean; tu_choi: boolean; huy_bo: boolean };
}
type Man = { ten: "ds" } | { ten: "ct"; id: string } | { ten: "hd"; hd: HuongDan };
const TOI_DA_ANH_TIN = 5;

const O_NHAP = "focus-ring w-full rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-base sm:text-sm";

export function TtBadge({ tt }: { tt: TrangThai }) {
  return <Badge tone={TT[tt]?.tone ?? "neutral"}>{t(TT[tt]?.label ?? tt)}</Badge>;
}

interface MoiNhat {
  id: string;
  tieu_de: string;
  ten_nguoi_hoi: string;
  moi: boolean; // true = ticket "Cho tiep nhan", false = tin moi trong ticket dang xu ly
  luc: string;
}
interface DemHoiDap {
  la_xu_ly: boolean;
  chua_doc: number;
  cho_tiep_nhan: number;
  moi_nhat?: MoiNhat | null;
}

// Nhac bat Web Push tren thiet bi nay cho phia Mua hang - khong bat thi khong nhan duoc thong bao khi dong app (chi con chuong + popup khi dang mo).
export function BatPushHoiDap() {
  const push = usePushNotifications();
  const toast = useToast();
  if (!push.checked || !push.supported || push.subscribed) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-btn)] border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-[12.5px] text-[var(--color-text)]">
      <span className="min-w-0 flex-1">{t("Thiết bị này chưa bật thông báo đẩy — bật để nhận câu hỏi mới của KTV cả khi không mở app.")}</span>
      <Btn
        size="sm"
        variant="ghost"
        loading={push.busy}
        onClick={() =>
          push
            .subscribe()
            .then(() => toast(t("✓ Đã bật thông báo trên thiết bị này")))
            .catch((e) => toast(e instanceof Error ? e.message : String(e), 6000))
        }
      >
        {t("🔔 Bật thông báo")}
      </Btn>
    </div>
  );
}

// TAT CHAT NGUOI THAT (chot 2026-11-07, v1.449 - "tắt việc chat với người thât, chỉ để lại tính năng tự động phản hồi hướng dẫn theo các vấn đề
// có sẵn. Ghi rõ đây là tài liệu hướng dẫn tự động, các thông tin thắc mắc linh kiện vui lòng trao đổi trên ứng dụng 'Hỏi đáp linh kiện'"):
// khung chi con "Hỏi nhanh" + "Hướng dẫn" cho MOI nguoi, khong tao cau hoi moi / nhan tin (backend POST /hoi-dap, /:id/tin tra 410 CHAT_DA_TAT).
// Man "ct" giu lai de Mua hang / Admin xem lich su ticket cu (menu Hoi dap, chuong thong bao) - chi doc, dong ticket cu.
export function HoiDapWidget() {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [mo, setMo] = useState(false);
  const [man, setMan] = useState<Man>({ ten: "ds" });

  // Link push cu "/?hoi_dap=<id>" - mo dung ticket roi xoa tham so khoi thanh dia chi.
  useEffect(() => {
    const u = new URL(window.location.href);
    const id = u.searchParams.get("hoi_dap");
    if (!id) return;
    u.searchParams.delete("hoi_dap");
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    setMo(true);
    setMan({ ten: "ct", id });
  }, []);

  // Chuong thong bao (link_type 'hoi_dap') / menu Hoi dap mo dung ticket cu.
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
          title={t("Hướng dẫn tự động")}
          aria-label={t("Hướng dẫn tự động")}
          className={`focus-ring fixed z-40 grid h-[52px] w-[52px] place-items-center rounded-full bg-[var(--color-primary)] text-white shadow-[var(--shadow-raise)] transition-transform hover:scale-105 hover:bg-[var(--color-primary-hover)] ${
            isMobile ? "right-3 bottom-[calc(9rem+env(safe-area-inset-bottom))]" : "right-5 bottom-28"
          }`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M8 9h8M8 13h5" />
          </svg>
        </button>
      )}
      {mo && (
        <div
          role="dialog"
          aria-label={t("Hướng dẫn tự động")}
          className={`fixed z-50 flex flex-col overflow-hidden bg-[var(--color-surface)] ${
            isMobile
              ? "inset-0 h-[100dvh]"
              : "right-5 bottom-5 h-[min(620px,calc(100vh-2.5rem))] w-[400px] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-raise)]"
          }`}
        >
          {man.ten === "ds" && <DanhSach onDong={() => setMo(false)} onXemHd={(hd) => setMan({ ten: "hd", hd })} />}
          {man.ten === "hd" && (
            <>
              <DauKhung tieuDe={t("Hướng dẫn")} onQuay={() => setMan({ ten: "ds" })} onDong={() => setMo(false)} />
              <HuongDanChiTiet hd={man.hd} onDaGiaiDap={() => setMan({ ten: "ds" })} />
            </>
          )}
          {man.ten === "ct" && (
            <ChiTietHoiDap id={man.id} onQuay={() => setMan({ ten: "ds" })} onDong={() => setMo(false)} onDoi={lamMoi} />
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

function DanhSach({ onDong, onXemHd }: { onDong: () => void; onXemHd: (hd: HuongDan) => void }) {
  const { data: hdData } = useHuongDan();
  const coHd = (hdData?.rows.length ?? 0) > 0;
  const [tab, setTab] = useState<"nhanh" | "hd">("nhanh");
  const tabs = coHd ? ([["nhanh", t("💬 Hỏi nhanh")], ["hd", t("📘 Hướng dẫn")]] as const) : null;
  return (
    <>
      <DauKhung tieuDe={t("Hướng dẫn tự động")} phu={t("Tra cứu nhanh cách dùng app, giá, tồn kho linh kiện…")} onDong={onDong} />
      <div className="shrink-0 border-b border-[var(--color-border)] px-3 py-2">
        <GhiChuTuDong />
      </div>
      {tabs && (
        <div className="flex shrink-0 border-b border-[var(--color-border)]">
          {tabs.map(([k, nhan]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`focus-ring flex-1 border-b-2 px-3 py-2 text-[13px] font-semibold ${tab === k ? "border-[var(--color-primary)] text-[var(--color-primary-dark)]" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
            >
              {nhan}
            </button>
          ))}
        </div>
      )}
      {coHd && tab === "hd" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <HuongDanDanhSach onMo={onXemHd} />
        </div>
      ) : (
        <HoiNhanh />
      )}
    </>
  );
}

function ChiTietHoiDap({
  id, onQuay, onDong, onDoi,
}: { id: string; onQuay: () => void; onDong: () => void; onDoi: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [tin, setTin] = useState("");
  const [anhCho, setAnhCho] = useState<string[]>([]);
  const [chonHd, setChonHd] = useState(false);
  const [luuHd, setLuuHd] = useState<Partial<HuongDanNhap> | null>(null);
  const { tai, dangTai } = useTaiAnh("/hoi-dap/anh");
  const [lyDoMo, setLyDoMo] = useState<"Tu choi" | "Huy bo" | null>(null);
  const [lyDo, setLyDo] = useState("");
  const cuoiRef = useRef<HTMLDivElement>(null);
  const { danhMuc } = useLkAndLdeCache(true);
  const timMaLk = useTimMaLk(danhMuc);
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
    mutationFn: (hdIds?: number[]) =>
      api.post(`/hoi-dap/${encodeURIComponent(id)}/tin`, {
        noi_dung: tin.trim(), anh: anhCho.length ? anhCho : undefined, huong_dan_ids: hdIds?.length ? hdIds : undefined,
      }),
    onSuccess: () => {
      setTin("");
      setAnhCho([]);
      setChonHd(false);
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
  const hdTheoId = new Map(data.huong_dan.map((h) => [h.id, h]));
  // Tra loi tu dong khi tin cua nguoi hoi nhac ma LK (LkTuDong.tsx) - moi ma chi hien 1 lan (lan dau duoc nhac), ma LK chon o
  // ticket tinh vao tin dau tien.
  const lkDaHien = new Set<string>();
  let daCoTinHoi = false;
  const lkCuaTin = (m: ChiTiet["tin"][number]): LkDanhMucRow[] => {
    if (m.phia !== "hoi") return [];
    const ds = timMaLk(m.noi_dung ?? "", daCoTinHoi ? [] : [tk.ma_lk]).filter((r) => !lkDaHien.has(r.ma_linh_kien));
    daCoTinHoi = true;
    for (const r of ds) lkDaHien.add(r.ma_linh_kien);
    return ds;
  };
  const coTheGui = (!!tin.trim() || anhCho.length > 0) && dangTai === 0;
  // "Lưu thành hướng dẫn": cau hoi -> tieu de, cac cau tra loi cua Mua hang -> noi dung, anh 2 phia -> anh (<= 10).
  const moLuuHd = () => {
    const traLoi = data.tin.filter((m) => m.phia === "xu_ly");
    setLuuHd({
      tieu_de: tk.tieu_de,
      noi_dung: traLoi.map((m) => m.noi_dung).filter(Boolean).join("\n\n"),
      anh: [...traLoi, ...data.tin.filter((m) => m.phia === "hoi")].flatMap((m) => m.anh).slice(0, 10),
      tu_khoa: [t(LOAI[tk.loai] ?? tk.loai), tk.ma_lk].filter(Boolean).join(", "),
    });
  };
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
          if (m.phia === "he_thong" && m.huong_dan_ids.length > 0) {
            return (
              <div key={m.id} className="space-y-1.5 rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)] px-3 py-2.5">
                <div className="text-[12px] font-semibold text-[var(--color-primary-dark)]">🤖 {m.noi_dung}</div>
                {m.huong_dan_ids.map((hid, i) => <HuongDanThe key={hid} hd={hdTheoId.get(hid)} moSan={i === 0 && data.phia === "hoi"} />)}
                {data.phia === "hoi" && q.huy_bo && (
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="text-[11.5px] text-[var(--color-text-secondary)]">{t("Hướng dẫn đã giải đáp được thắc mắc?")}</span>
                    <Btn size="sm" variant="success" loading={doiTt.isPending} onClick={() => doiTt.mutate({ trang_thai: "Huy bo", ly_do: "Đã tự giải đáp qua hướng dẫn" })}>
                      {t("✓ Đã giải đáp, đóng câu hỏi")}
                    </Btn>
                  </div>
                )}
                <div className="text-right text-[10.5px] text-[var(--color-text-faint)]">{fmtDateTime(m.ngay_tao)}</div>
              </div>
            );
          }
          if (m.phia === "he_thong") {
            return (
              <div key={m.id} className="text-center text-[11px] text-[var(--color-text-secondary)]">
                {m.ten_nguoi_gui} · {m.noi_dung} · {fmtDateTime(m.ngay_tao)}
              </div>
            );
          }
          const cuaToi = m.phia === data.phia;
          const lkTin = lkCuaTin(m);
          return (
            <div key={m.id} className="space-y-2">
            <div className={`flex ${cuaToi ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] ${
                  cuaToi
                    ? "rounded-br-sm bg-[var(--color-primary)] text-white"
                    : "rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                }`}
              >
                {!cuaToi && <div className="mb-0.5 text-[11px] font-semibold text-[var(--color-primary-dark)]">{m.ten_nguoi_gui}</div>}
                {m.noi_dung && <div className="whitespace-pre-wrap break-words">{m.noi_dung}</div>}
                {m.anh.length > 0 && <div className={m.noi_dung ? "mt-1.5" : ""}><AnhLuoi anh={m.anh} nho /></div>}
                {m.huong_dan_ids.length > 0 && (
                  <div className={`space-y-1.5 ${m.noi_dung || m.anh.length ? "mt-1.5" : ""}`}>
                    {m.huong_dan_ids.map((hid) => <HuongDanThe key={hid} hd={hdTheoId.get(hid)} moSan={!cuaToi} />)}
                  </div>
                )}
                <div className={`mt-1 text-right text-[10.5px] ${cuaToi ? "text-white/75" : "text-[var(--color-text-faint)]"}`}>{fmtDateTime(m.ngay_tao)}</div>
              </div>
            </div>
            <TraLoiLinhKien ds={lkTin} />
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
            {anhCho.length > 0 && <AnhLuoi anh={anhCho} nho onXoa={(i) => setAnhCho((v) => v.filter((_, j) => j !== i))} />}
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={tin}
                onChange={(e) => setTin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (coTheGui && !gui.isPending) gui.mutate(undefined);
                  }
                }}
                maxLength={2000}
                placeholder={data.phia === "xu_ly" ? t("Nhập câu trả lời… (Enter để gửi)") : t("Nhập tin nhắn… (Enter để gửi)")}
                className={`${O_NHAP} resize-none`}
              />
              <Btn className="min-h-10 shrink-0" onClick={() => gui.mutate(undefined)} loading={gui.isPending} disabled={!coTheGui}>{t("Gửi")}</Btn>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <FileButton
                multiple
                accept="image/*"
                disabled={anhCho.length >= TOI_DA_ANH_TIN || dangTai > 0}
                onFilesSelected={async (files) => {
                  const urls = await tai(files.slice(0, TOI_DA_ANH_TIN - anhCho.length));
                  if (urls.length) setAnhCho((v) => [...v, ...urls].slice(0, TOI_DA_ANH_TIN));
                }}
              >
                {dangTai > 0 ? t("Đang tải {n} ảnh…", { n: dangTai }) : t("📷 Ảnh")}
              </FileButton>
              {data.phia === "xu_ly" && <Btn size="sm" variant="ghost" onClick={() => setChonHd(true)}>{t("📘 Gửi hướng dẫn")}</Btn>}
              {data.phia === "xu_ly" && <Btn size="sm" variant="ghost" className="ml-auto" onClick={moLuuHd}>{t("Lưu thành hướng dẫn")}</Btn>}
            </div>
          </>
        ) : (
          <div className="space-y-2 text-center">
            <div className="text-xs text-[var(--color-text-secondary)]">
              {q.da_xu_ly || q.tu_choi || q.huy_bo
                ? t("Tính năng chat với nhân viên đã tắt — không gửi thêm tin nhắn.")
                : t("Phiên hỏi đáp đã đóng — {a}", { a: t(TT[tk.trang_thai].label) })}
              {tk.ly_do ? ` · ${tk.ly_do}` : ""}
            </div>
            {(q.da_xu_ly || q.tu_choi || q.huy_bo) && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {q.da_xu_ly && <Btn size="sm" variant="success" loading={doiTt.isPending} onClick={() => doiTt.mutate({ trang_thai: "Da xu ly" })}>{t("✓ Đã xử lý")}</Btn>}
                {q.tu_choi && <Btn size="sm" variant="ghost" onClick={() => setLyDoMo("Tu choi")}>{t("Từ chối…")}</Btn>}
                {q.huy_bo && <Btn size="sm" variant="ghost" onClick={() => setLyDoMo("Huy bo")}>{t("Hủy câu hỏi")}</Btn>}
              </div>
            )}
            {data.phia === "hoi" && <GhiChuTuDong className="text-left" />}
            {data.phia === "xu_ly" && (
              <Btn variant="ghost" className="min-h-10 w-full" onClick={moLuuHd}>{t("Lưu thành hướng dẫn")}</Btn>
            )}
          </div>
        )}
      </div>
      {data.phia === "xu_ly" && (
        <>
          <ChonHuongDanModal open={chonHd} onClose={() => setChonHd(false)} goiYTu={data.tin.filter((m) => m.phia === "hoi").map((m) => m.noi_dung).join(" ")} onChon={(ids) => gui.mutate(ids)} />
          <HuongDanForm open={!!luuHd} onClose={() => setLuuHd(null)} macDinh={luuHd ?? undefined} />
        </>
      )}
    </>
  );
}
