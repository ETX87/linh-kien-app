// THIEU HANG BAO HANH (2026-11-04, backend routes/thieuHangBh.ts, migration 0106) - muc thu 3 trong menu "Thiếu hàng": ticket do app
// "Sửa chữa bảo hành" gui sang khi don bao hanh cham vi "Không có linh kiện" / "Hết hàng tồn kho". Kho / Mua hang xu ly tai day; moi
// buoc tu bao ve don bao hanh goc.
import { canhBaoNgayDuKien, homNayVN, ngayDuKienToiDa } from "../../lib/ngayDuKien";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge, type Tone } from "../../components/x/Badge";
import { Modal } from "../../components/ui/Modal";
import { api, ApiError, buildQuery } from "../../api/client";
import { fmtDate, fmtDateTime } from "../../types";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { t, dichSau } from "../../i18n";
import { describeApiError } from "./helpers";
import { useTenNguoiLog } from "./SharedUi";
import { TrangThaiRail, type Nhom } from "./ThieuLkStatusRail";
import { EoVeDuBanner } from "./EoVeDu";

export const THB_TRANG_THAI: Record<string, { label: string; tone: Tone }> = {
  "Cho kho xu ly": { label: dichSau("Chờ Kho xử lý"), tone: "warning" },
  "Kho da tiep nhan": { label: dichSau("Kho đã tiếp nhận — chờ hàng về"), tone: "info" },
  "Cho mua hang": { label: dichSau("Chờ Mua hàng"), tone: "warning" },
  "Mua hang da dat": { label: dichSau("Mua hàng đã đặt"), tone: "info" },
  "Kho xac nhan hang da ve": { label: dichSau("Hàng đã về"), tone: "success" },
  "Kho tu choi": { label: dichSau("Kho từ chối"), tone: "danger" },
  "Mua hang tu choi": { label: dichSau("Không mua được"), tone: "danger" },
  "Da huy": { label: dichSau("App bảo hành rút lại"), tone: "neutral" },
};
const LOI: Record<string, string> = {
  INVALID_TRANSITION: dichSau("Ticket đã chuyển trạng thái khác — tải lại để xem"),
  STATE_CHANGED: dichSau("Trạng thái vừa bị người khác thay đổi — tải lại và thử lại"),
  MISSING_LY_DO_TU_CHOI: dichSau("Bắt buộc ghi lý do khi từ chối / không mua được"),
  THIEU_MA_EO: dichSau("Nhập mã EO đặt hàng"),
  THIEU_NGAY_DU_KIEN: dichSau("Nhập ngày dự kiến có hàng"),
  INVALID_NGAY: dichSau("Ngày không hợp lệ"),
  NGAY_DU_KIEN_KHONG_HOP_LE: dichSau("Ngày dự kiến có hàng không hợp lệ"),
  NGAY_DU_KIEN_TRONG_QUA_KHU: dichSau("Ngày dự kiến có hàng không được trước hôm nay — kiểm tra lại năm"),
  NGAY_DU_KIEN_QUA_XA: dichSau("Ngày dự kiến có hàng không được quá 1 năm kể từ hôm nay — kiểm tra lại năm"),
};
const loi = (e: unknown) => (e instanceof ApiError && e.code && LOI[e.code] ? t(LOI[e.code]) : describeApiError(e));
const TBL = "tbl w-full [&_th]:px-2.5 [&_th]:py-2 [&_td]:px-2.5 [&_td]:py-1.5 [&_tbody>tr]:border-t [&_tbody>tr]:border-[var(--line)]";
const INPUT = "focus-ring bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm";

export interface ThbRow {
  id: string;
  nguon_id: string;
  ma_lk: string;
  ten_lk: string | null;
  so_luong: number;
  ly_do: string | null;
  ghi_chu: string | null;
  mien: string | null;
  case_id: string | null;
  ktv_ten: string | null;
  ktv_email: string | null;
  nguoi_bao: string | null;
  nguoi_bao_ten: string | null;
  trang_thai: string;
  ngay_du_kien: string | null;
  ma_eo_mua: string | null;
  eo_ve_du?: string | null;
  ghi_chu_xu_ly: string | null;
  nguoi_xu_ly: string | null;
  nguoi_xu_ly_ten: string | null;
  ngay_tao: string;
  ngay_cap_nhat: string;
}
interface ListResp {
  data: ThbRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
  can_xu_ly: number;
  vai: { kho: boolean; mua_hang: boolean };
}

/** So ticket bao hanh can nguoi dang xem xu ly - dung cho huy hieu tab trong ThieuHangTabs. */
export function useThbCanXuLy(enabled = true): number {
  const { data } = useQuery({
    queryKey: ["thieu-hang-bh", "can_xu_ly", "", "", 1],
    queryFn: () => api.get<ListResp>(`/thieu-hang-bh${buildQuery({ trang_thai: "can_xu_ly", page: 1 })}`),
    retry: false,
    enabled,
  });
  return data?.can_xu_ly ?? 0;
}

// Nhom trang thai cho cot ben trai (v1.455, "Xây dựng lại giao diện cho 'Thiếu hàng bảo hành', tách thành các trạng thái để kho và mua hàng
// tiện quản lý như chờ kho, chờ mua hàng... tương tự bên thiếu hàng mua hàng") - cung khung TrangThaiRail voi "Thiếu hàng đặt mua".
const THB_CHO_KHO = ["Cho kho xu ly", "Kho da tiep nhan"];
const THB_CHO_MUA = ["Cho mua hang", "Mua hang da dat"];
const THB_DONG = ["Kho tu choi", "Mua hang tu choi", "Da huy"];
function nhomThb(vai: { kho: boolean; mua_hang: boolean }): Nhom[] {
  const nhan = (v: string) => t(THB_TRANG_THAI[v]?.label ?? v);
  const canXuLy = [...(vai.kho ? ["Cho kho xu ly"] : []), ...(vai.mua_hang ? ["Cho mua hang"] : [])];
  const nhom: Nhom[] = [];
  if (canXuLy.length) nhom.push({ tieuDe: t("Cần tôi xử lý"), value: "can_xu_ly", canLam: true, muc: canXuLy.map((v) => ({ value: v, label: nhan(v) })) });
  nhom.push({
    tieuDe: t("Chờ Kho"),
    value: THB_CHO_KHO.join(","),
    muc: [
      { value: "Cho kho xu ly", label: t("Chờ Kho tiếp nhận") },
      { value: "Kho da tiep nhan", label: t("Kho đã tiếp nhận"), phu: t("chờ hàng về") },
    ],
  });
  nhom.push({
    tieuDe: t("Chờ Mua hàng"),
    value: THB_CHO_MUA.join(","),
    muc: [
      { value: "Cho mua hang", label: t("Chờ Mua hàng đặt") },
      { value: "Mua hang da dat", label: t("Mua hàng đã đặt"), phu: t("chờ hàng về") },
    ],
  });
  nhom.push({ tieuDe: t("Hàng đã về"), value: "Kho xac nhan hang da ve", muc: [{ value: "Kho xac nhan hang da ve", label: nhan("Kho xac nhan hang da ve") }] });
  nhom.push({ tieuDe: t("Đã đóng"), value: THB_DONG.join(","), muc: THB_DONG.map((v) => ({ value: v, label: nhan(v) })) });
  return nhom;
}

// Viec tiep theo / ai dang giu ticket - hien o danh sach de Kho, Mua hang nhin 1 giay biet ticket dang o dau.
function viecTiep(tt: string): { text: string; cua: "kho" | "mua_hang" | null } {
  switch (tt) {
    case "Cho kho xu ly": return { text: t("Kho tiếp nhận / chuyển Mua hàng"), cua: "kho" };
    case "Kho da tiep nhan": return { text: t("Kho chờ hàng về"), cua: "kho" };
    case "Cho mua hang": return { text: t("Mua hàng đặt hàng"), cua: "mua_hang" };
    case "Mua hang da dat": return { text: t("Chờ hàng về (Kho xác nhận)"), cua: "kho" };
    default: return { text: "—", cua: null };
  }
}

// So ngay tu luc bao (ticket con mo) - cam khi > 3 ngay.
function soNgayCho(r: ThbRow): number | null {
  if (!(THB_CHO_KHO.includes(r.trang_thai) || THB_CHO_MUA.includes(r.trang_thai))) return null;
  const ms = Date.now() - new Date(r.ngay_tao.replace(" ", "T") + "+07:00").getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}
function NgayCho({ r }: { r: ThbRow }) {
  const n = soNgayCho(r);
  if (n == null) return <span className="text-[var(--ink-400)]">—</span>;
  return <span className={n > 3 ? "font-semibold text-[var(--color-warning-strong)]" : ""}>{t("{n} ngày", { n })}</span>;
}

export function ThieuHangBhList({ addToast }: { addToast: (msg: string) => void }) {
  const [tt, setTt] = useLocalStorageState("thieu-hang-bh-loc-v2", "can_xu_ly");
  const [mien, setMien] = useLocalStorageState("thieu-hang-bh-mien", "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [mo, setMo] = useState<ThbRow | null>(null);
  // "" = Tat ca (khung cot) -> server "tat_ca" (server mac dinh "" = can_xu_ly).
  const ttGui = tt || "tat_ca";
  const { data, isLoading } = useQuery({
    queryKey: ["thieu-hang-bh", ttGui, q, mien, page],
    queryFn: () => api.get<ListResp>(`/thieu-hang-bh${buildQuery({ trang_thai: ttGui, q: q.trim() || undefined, mien: mien || undefined, page })}`),
  });
  const vai = data?.vai ?? { kho: false, mua_hang: false };
  const nhom = nhomThb(vai);
  // Nguoi khong co viec xu ly ma dang loc "Cần tôi xử lý" (gia tri mac dinh) -> chuyen sang "Chờ Kho".
  const coViec = vai.kho || vai.mua_hang;
  useEffect(() => {
    if (data && !coViec && tt === "can_xu_ly") setTt(THB_CHO_KHO.join(","));
  }, [data, coViec, tt, setTt]);
  const counts = data
    ? { ...data.counts, can_xu_ly: data.can_xu_ly, "": Object.values(data.counts).reduce((s, n) => s + n, 0) }
    : undefined;
  const soTrang = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const ten = useTenNguoiLog();
  const doi = (v: string) => { setTt(v); setPage(1); };
  const canToi = (r: ThbRow) => (r.trang_thai === "Cho kho xu ly" && vai.kho) || (r.trang_thai === "Cho mua hang" && vai.mua_hang);
  const vachCam = "shadow-[inset_3px_0_0_var(--color-warning)]";

  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <TrangThaiRail nhom={nhom} value={tt} onChange={doi} counts={counts} />
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-xs text-[var(--ink-500)]">
          {t("Linh kiện còn thiếu để xử lý đơn bảo hành — do app Sửa chữa bảo hành gửi sang khi đơn chậm vì không có linh kiện / hết hàng tồn kho. Mỗi bước xử lý được báo ngay về đơn bảo hành gốc.")}
        </p>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Tìm mã ticket / mã đơn BH / linh kiện / case / KTV / mã EO")} className={`o-tim ${INPUT} w-full sm:w-96`} />
          <select value={mien} onChange={(e) => { setMien(e.target.value); setPage(1); }} className={INPUT}>
            <option value="">{t("Mọi miền")}</option>
            <option value="MB">{t("Miền Bắc")}</option>
            <option value="MN">{t("Miền Nam")}</option>
            <option value="__none__">{t("Chưa khai báo")}</option>
          </select>
          {data && <span className="self-center text-xs text-[var(--ink-500)]">{t("{n} ticket", { n: data.total })}</span>}
        </div>

        {/* Desktop: bang */}
        <div className="hidden overflow-x-auto rounded-lg border border-[var(--line)] bg-white md:block">
          <table className={TBL}>
            <thead className="tbl-head">
              <tr>
                <th className="text-left">{t("Mã ticket")}</th>
                <th className="text-left">{t("Trạng thái")}</th>
                <th className="text-left">{t("Việc tiếp theo")}</th>
                <th className="text-left">{t("Linh kiện")}</th>
                <th className="text-right">{t("SL")}</th>
                <th className="text-left">{t("Đơn bảo hành")}</th>
                <th className="text-left">{t("KTV")}</th>
                <th className="text-left">{t("Miền")}</th>
                <th className="text-left">{t("Dự kiến có hàng")}</th>
                <th className="text-left">{t("Đã chờ")}</th>
                <th className="text-left">{t("Ngày báo")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={11} className="text-center text-[var(--ink-500)] py-4">{t("Đang tải...")}</td></tr>
              )}
              {!isLoading && (data?.data.length ?? 0) === 0 && (
                <tr><td colSpan={11} className="text-center text-[var(--ink-500)] py-4">{t("Không có ticket thiếu hàng bảo hành nào")}</td></tr>
              )}
              {data?.data.map((r) => {
                const s = THB_TRANG_THAI[r.trang_thai];
                const v = viecTiep(r.trang_thai);
                return (
                  <tr key={r.id} className={`cursor-pointer hover:bg-[var(--color-surface-hover)] ${canToi(r) ? vachCam : ""}`} onClick={() => setMo(r)}>
                    <td className="font-mono font-semibold whitespace-nowrap">{r.id}</td>
                    <td className="whitespace-nowrap">{s ? <Badge tone={s.tone}>{t(s.label)}</Badge> : r.trang_thai}</td>
                    <td className={`whitespace-nowrap ${canToi(r) ? "font-semibold text-[var(--color-warning-strong)]" : "text-[var(--color-text-secondary)]"}`}>{v.text}</td>
                    <td className="max-w-[260px] truncate" title={`${r.ten_lk ?? ""} (${r.ma_lk})`}>
                      {r.ten_lk ?? ""} <span className="font-mono text-[var(--ink-500)]">({r.ma_lk})</span>
                    </td>
                    <td className="text-right font-semibold">{r.so_luong}</td>
                    <td className="whitespace-nowrap"><span className="font-mono">{r.nguon_id}</span>{r.case_id ? <span className="text-[var(--ink-500)]"> · {r.case_id}</span> : null}</td>
                    <td className="max-w-[180px] truncate">{r.ktv_ten ?? r.ktv_email ?? ""}</td>
                    <td>{r.mien ?? "—"}</td>
                    <td className="whitespace-nowrap">{r.ngay_du_kien ? fmtDate(r.ngay_du_kien) : "—"}{r.ma_eo_mua ? <span className="text-[var(--ink-500)]"> · EO {r.ma_eo_mua}</span> : null}</td>
                    <td className="whitespace-nowrap"><NgayCho r={r} /></td>
                    <td className="whitespace-nowrap">{fmtDateTime(r.ngay_tao)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile: the */}
        <div className="divide-y divide-[var(--line)] overflow-hidden rounded-lg border border-[var(--line)] bg-white md:hidden">
          {isLoading && <div className="py-4 text-center text-sm text-[var(--ink-500)]">{t("Đang tải...")}</div>}
          {!isLoading && (data?.data.length ?? 0) === 0 && <div className="py-4 text-center text-sm text-[var(--ink-500)]">{t("Không có ticket thiếu hàng bảo hành nào")}</div>}
          {data?.data.map((r) => {
            const s = THB_TRANG_THAI[r.trang_thai];
            const v = viecTiep(r.trang_thai);
            return (
              <button key={r.id} type="button" className={`block w-full px-3 py-2.5 text-left active:bg-[var(--color-surface-hover)] ${canToi(r) ? vachCam : ""}`} onClick={() => setMo(r)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{r.ten_lk ?? r.ma_lk} <span className="font-mono text-xs text-[var(--ink-500)]">({r.ma_lk})</span></span>
                  <span className="shrink-0 text-sm font-semibold">x{r.so_luong}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 overflow-hidden text-xs">
                  {s && <Badge tone={s.tone}>{t(s.label)}</Badge>}
                  <span className="truncate text-[var(--ink-500)]">{r.id} · {r.nguon_id}{r.mien ? ` · ${r.mien}` : ""}</span>
                </div>
                {v.cua && (
                  <div className={`mt-0.5 text-xs ${canToi(r) ? "font-semibold text-[var(--color-warning-strong)]" : "text-[var(--ink-500)]"}`}>
                    → {v.text} · <NgayCho r={r} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {soTrang > 1 && (
          <div className="flex items-center gap-2 justify-end text-xs">
            <Btn size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Btn>
            <span>{page}/{soTrang}</span>
            <Btn size="sm" variant="ghost" disabled={page >= soTrang} onClick={() => setPage((p) => p + 1)}>›</Btn>
          </div>
        )}
        {mo && <ThbDetailModal row={mo} onClose={() => setMo(null)} addToast={addToast} ten={ten} />}
      </div>
    </div>
  );
}

interface LogRow { id: number; trang_thai: string; nguoi_xu_ly: string; nguoi_ten: string | null; ngay_xu_ly: string; ghi_chu: string | null }

function ThbDetailModal({ row, onClose, addToast, ten }: { row: ThbRow; onClose: () => void; addToast: (msg: string) => void; ten: (e: string | null | undefined) => string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["thieu-hang-bh-ct", row.id],
    queryFn: () => api.get<{ ticket: ThbRow; log: LogRow[]; vai: { kho: boolean; mua_hang: boolean } }>(`/thieu-hang-bh/${encodeURIComponent(row.id)}`),
  });
  const tk = data?.ticket ?? row;
  const vai = data?.vai ?? { kho: false, mua_hang: false };
  const [ghiChu, setGhiChu] = useState("");
  const [ngay, setNgay] = useState(tk.ngay_du_kien?.startsWith("1900-") ? "" : tk.ngay_du_kien ?? "");
  const [eo, setEo] = useState(tk.ma_eo_mua ?? "");
  const m = useMutation({
    mutationFn: (den: string) =>
      api.post<{ ticket: ThbRow }>(`/thieu-hang-bh/${encodeURIComponent(row.id)}/log`, { trang_thai: den, ghi_chu: ghiChu.trim() || undefined, ngay_du_kien: ngay || undefined, ma_eo_mua: eo.trim() || undefined }),
    onSuccess: (r) => {
      addToast(t("Đã cập nhật {id} → {tt}", { id: row.id, tt: t(THB_TRANG_THAI[r.ticket.trang_thai]?.label ?? r.ticket.trang_thai) }));
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["thieu-hang-bh"] });
      qc.invalidateQueries({ queryKey: ["thieu-hang-bh-ct", row.id] });
      // v1.565: ticket THB nam chung danh sach "Thiếu hàng" (ThieuLkTab).
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk-status-counts"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
    onError: (e) => addToast(t("Lỗi: {msg}", { msg: loi(e) })),
  });
  const tt = tk.trang_thai;
  const nut: { den: string; label: string; variant?: "primary" | "danger" | "ghost" }[] = [];
  if (vai.kho && (tt === "Cho kho xu ly" || tt === "Kho da tiep nhan")) {
    nut.push({ den: "Kho da tiep nhan", label: tt === "Kho da tiep nhan" ? dichSau("Cập nhật ngày dự kiến") : dichSau("Tiếp nhận — chờ hàng về") });
    nut.push({ den: "Cho mua hang", label: dichSau("Chuyển Mua hàng") });
  }
  if (vai.kho && ["Cho kho xu ly", "Kho da tiep nhan", "Cho mua hang", "Mua hang da dat"].includes(tt)) nut.push({ den: "Kho xac nhan hang da ve", label: dichSau("✔ Hàng đã về / đã có hàng"), variant: "primary" });
  if (vai.mua_hang && (tt === "Cho mua hang" || tt === "Mua hang da dat")) {
    nut.push({ den: "Mua hang da dat", label: tt === "Mua hang da dat" ? dichSau("Cập nhật EO / ngày dự kiến") : dichSau("Đã đặt hàng"), variant: "primary" });
    nut.push({ den: "Mua hang tu choi", label: dichSau("Không mua được"), variant: "danger" });
  }
  if (vai.kho && (tt === "Cho kho xu ly" || tt === "Kho da tiep nhan")) nut.push({ den: "Kho tu choi", label: dichSau("Từ chối (sai thông tin)"), variant: "danger" });
  const canNhap = nut.length > 0;
  const s = THB_TRANG_THAI[tt];

  return (
    <Modal open onClose={onClose} title={`${t("Thiếu hàng bảo hành")} ${tk.id}`} width="max-w-2xl">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {s ? <Badge tone={s.tone}>{t(s.label)}</Badge> : tt}
          <span className="text-[var(--ink-500)]">{t("Báo lúc")} {fmtDateTime(tk.ngay_tao)}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          <div><span className="text-[var(--ink-500)]">{t("Linh kiện")}: </span><b>{tk.ten_lk ?? ""}</b> <span className="font-mono">({tk.ma_lk})</span></div>
          <div><span className="text-[var(--ink-500)]">{t("Số lượng")}: </span><b>{tk.so_luong}</b></div>
          <div><span className="text-[var(--ink-500)]">{t("Đơn bảo hành")}: </span><span className="font-mono">{tk.nguon_id}</span></div>
          <div><span className="text-[var(--ink-500)]">{t("Mã case")}: </span>{tk.case_id ?? "—"}</div>
          <div><span className="text-[var(--ink-500)]">{t("KTV")}: </span>{tk.ktv_ten ?? tk.ktv_email ?? "—"}</div>
          <div><span className="text-[var(--ink-500)]">{t("Miền")}: </span>{tk.mien ?? "—"}</div>
          <div><span className="text-[var(--ink-500)]">{t("Người báo")}: </span>{tk.nguoi_bao_ten ?? tk.nguoi_bao ?? "—"}</div>
          <div><span className="text-[var(--ink-500)]">{t("Lý do")}: </span>{tk.ly_do ?? "—"}</div>
          {tk.ngay_du_kien && <div><span className="text-[var(--ink-500)]">{t("Dự kiến có hàng")}: </span><b>{fmtDate(tk.ngay_du_kien)}</b></div>}
          {tk.ma_eo_mua && <div><span className="text-[var(--ink-500)]">{t("Mã EO")}: </span><span className="font-mono">{tk.ma_eo_mua}</span></div>}
        </div>
        <EoVeDuBanner raw={tk.eo_ve_du} trangThai={tk.trang_thai} />
        {tk.ghi_chu && <p className="rounded-lg bg-[var(--surface-100)] px-3 py-2 whitespace-pre-wrap">{tk.ghi_chu}</p>}

        {canNhap && (
          <div className="rounded-lg border border-[var(--line)] p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-[var(--ink-500)]">{t("Ngày dự kiến có hàng")}</span>
                <input type="date" value={ngay} min={homNayVN()} max={ngayDuKienToiDa()} onChange={(e) => setNgay(e.target.value)} className={`${INPUT} w-full`} />
                {canhBaoNgayDuKien(ngay) && <span className="mt-0.5 block text-xs text-[var(--color-danger)]">{t(canhBaoNgayDuKien(ngay)!)}</span>}
              </label>
              {vai.mua_hang && (tt === "Cho mua hang" || tt === "Mua hang da dat") && (
                <label className="block">
                  <span className="text-xs text-[var(--ink-500)]">{t("Mã EO đặt hàng")}</span>
                  <input value={eo} onChange={(e) => setEo(e.target.value)} className={`${INPUT} w-full`} />
                </label>
              )}
            </div>
            <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2} placeholder={t("Ghi chú (bắt buộc khi từ chối / không mua được)")} className={`${INPUT} w-full`} />
            <div className="flex flex-wrap gap-2 justify-end">
              {nut.map((n) => (
                <Btn key={n.den + n.label} size="sm" variant={n.variant ?? "ghost"} disabled={m.isPending} onClick={() => m.mutate(n.den)}>
                  {t(n.label)}
                </Btn>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-[var(--ink-500)] mb-1">{t("Lịch sử xử lý")}</div>
          <ul className="space-y-1">
            {(data?.log ?? []).map((l) => (
              <li key={l.id} className="text-xs">
                <span className="text-[var(--ink-500)]">{fmtDateTime(l.ngay_xu_ly)}</span> · <b>{l.nguoi_ten ?? ten(l.nguoi_xu_ly)}</b> ·{" "}
                {t(THB_TRANG_THAI[l.trang_thai]?.label ?? l.trang_thai)}
                {l.ghi_chu ? <span className="text-[var(--ink-500)]"> — {l.ghi_chu}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

// Mo chi tiet 1 ticket THB tu o tim Ctrl+K (2026-11-20) - tai ticket truoc roi dung LAI ThbDetailModal (cung queryKey
// chi tiet nen modal khong tai lai). Khong co quyen / khong thay -> bao loi va dong.
export function XemThieuHangBh({ id, onClose, addToast }: { id: string; onClose: () => void; addToast: (msg: string) => void }) {
  const ten = useTenNguoiLog();
  const { data, error } = useQuery({
    queryKey: ["thieu-hang-bh-ct", id],
    queryFn: () => api.get<{ ticket: ThbRow; log: LogRow[]; vai: { kho: boolean; mua_hang: boolean } }>(`/thieu-hang-bh/${encodeURIComponent(id)}`),
  });
  useEffect(() => {
    if (error) {
      addToast(t("Lỗi: {msg}", { msg: loi(error) }));
      onClose();
    }
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return null;
  return <ThbDetailModal row={data.ticket} onClose={onClose} addToast={addToast} ten={ten} />;
}

// GOI Y KHI DANH SACH DON HANG TIM RA 0 DON (v1.566, 26/11/2026). Bao loi: "mã "SC2611090581" này đã tạo đơn linh kiện, nhưng bên app linh
// kiện lại không tìm thấy" - ca do KHONG co don dat (DDH), chi co 4 ticket THB (app Bao hanh doi tra bao thieu hang, Mua hang da dat EO) nen
// o tim Danh sach Don hang ra trong. Dung LAI /dat-mua-lk/search (cung quyen xem THB voi Ctrl+K: Kho / TN / Mua hang / Ke toan / View / Admin,
// tim theo tien to ma THB / ma case / ma don BH) -> hien dong goi y + chip mo chi tiet ticket. Khong co quyen / khong khop -> khong hien gi.
export function GoiYThbTheoMa({ q, addToast }: { q: string; addToast: (msg: string) => void }) {
  const tuKhoa = q.trim();
  const [moId, setMoId] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["goi-y-thb-theo-ma", tuKhoa.toUpperCase()],
    queryFn: () => api.get<{ results: { type: string; id: string; label: string }[] }>(`/dat-mua-lk/search?q=${encodeURIComponent(tuKhoa)}`),
    enabled: tuKhoa.length >= 3,
    staleTime: 60_000,
  });
  const ds = (data?.results ?? []).filter((r) => r.type === "thieu_hang_bh");
  if (!ds.length) return null;
  return (
    <div className="mb-2 rounded-lg border border-[var(--line)] bg-[var(--surface-100)] px-3 py-2 text-sm">
      <div className="text-[var(--ink-600)]">
        {t("Không có đơn đặt linh kiện nào khớp “{q}”, nhưng mã này có {n} phiếu thiếu hàng bảo hành (app Bảo hành đổi trả gửi sang) — xem ở menu Thiếu hàng:", {
          q: tuKhoa,
          n: ds.length >= 5 ? "5+" : ds.length,
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {ds.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setMoId(r.id)}
            className="focus-ring rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-xs hover:border-[var(--green-700)]"
          >
            🛠 {r.label}
          </button>
        ))}
      </div>
      {moId && <XemThieuHangBh id={moId} onClose={() => setMoId(null)} addToast={addToast} />}
    </div>
  );
}
