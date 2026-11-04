// THIEU HANG BAO HANH (2026-11-04, backend routes/thieuHangBh.ts, migration 0106) - muc thu 3 trong menu "Thiếu hàng": ticket do app
// "Sửa chữa bảo hành" gui sang khi don bao hanh cham vi "Không có linh kiện" / "Hết hàng tồn kho". Kho / Mua hang xu ly tai day; moi
// buoc tu bao ve don bao hanh goc.
import { useState } from "react";
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
const LOC = [
  { value: "can_xu_ly", label: dichSau("Cần tôi xử lý") },
  { value: "mo", label: dichSau("Đang mở") },
  { value: "Kho xac nhan hang da ve", label: dichSau("Hàng đã về") },
  { value: "tat_ca", label: dichSau("Tất cả") },
];
const LOI: Record<string, string> = {
  INVALID_TRANSITION: dichSau("Ticket đã chuyển trạng thái khác — tải lại để xem"),
  STATE_CHANGED: dichSau("Trạng thái vừa bị người khác thay đổi — tải lại và thử lại"),
  MISSING_LY_DO_TU_CHOI: dichSau("Bắt buộc ghi lý do khi từ chối / không mua được"),
  THIEU_MA_EO: dichSau("Nhập mã EO đặt hàng"),
  THIEU_NGAY_DU_KIEN: dichSau("Nhập ngày dự kiến có hàng"),
  INVALID_NGAY: dichSau("Ngày không hợp lệ"),
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

export function ThieuHangBhList({ addToast }: { addToast: (msg: string) => void }) {
  const [tt, setTt] = useLocalStorageState("thieu-hang-bh-loc", "can_xu_ly");
  const [mien, setMien] = useLocalStorageState("thieu-hang-bh-mien", "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [mo, setMo] = useState<ThbRow | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["thieu-hang-bh", tt, q, mien, page],
    queryFn: () => api.get<ListResp>(`/thieu-hang-bh${buildQuery({ trang_thai: tt, q: q.trim() || undefined, mien: mien || undefined, page })}`),
  });
  const counts = data?.counts ?? {};
  const dem = (v: string) =>
    v === "tat_ca"
      ? Object.values(counts).reduce((s, n) => s + n, 0)
      : v === "can_xu_ly"
        ? data?.can_xu_ly ?? 0
        : v === "mo"
          ? ["Cho kho xu ly", "Kho da tiep nhan", "Cho mua hang", "Mua hang da dat"].reduce((s, k) => s + (counts[k] ?? 0), 0)
          : counts[v] ?? 0;
  const soTrang = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const ten = useTenNguoiLog();

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--ink-500)]">
        {t("Linh kiện còn thiếu để xử lý đơn bảo hành — do app Sửa chữa bảo hành gửi sang khi đơn chậm vì không có linh kiện / hết hàng tồn kho. Mỗi bước xử lý được báo ngay về đơn bảo hành gốc.")}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {LOC.map((o) => (
          <button key={o.value} type="button" className={`filter-tab ${tt === o.value ? "active" : ""}`} onClick={() => { setTt(o.value); setPage(1); }}>
            {t(o.label)} <span className="opacity-70">({dem(o.value)})</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Tìm mã ticket / mã đơn BH / linh kiện / case / KTV / mã EO")} className={`o-tim ${INPUT} w-full sm:w-96`} />
        <select value={mien} onChange={(e) => { setMien(e.target.value); setPage(1); }} className={INPUT}>
          <option value="">{t("Mọi miền")}</option>
          <option value="MB">{t("Miền Bắc")}</option>
          <option value="MN">{t("Miền Nam")}</option>
          <option value="__none__">{t("Chưa khai báo")}</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-white">
        <table className={TBL}>
          <thead className="tbl-head">
            <tr>
              <th className="text-left">{t("Mã ticket")}</th>
              <th className="text-left">{t("Trạng thái")}</th>
              <th className="text-left">{t("Linh kiện")}</th>
              <th className="text-right">{t("SL")}</th>
              <th className="text-left">{t("Đơn bảo hành")}</th>
              <th className="text-left">{t("KTV")}</th>
              <th className="text-left">{t("Miền")}</th>
              <th className="text-left">{t("Dự kiến có hàng")}</th>
              <th className="text-left">{t("Ngày báo")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="text-center text-[var(--ink-500)] py-4">{t("Đang tải...")}</td></tr>
            )}
            {!isLoading && (data?.data.length ?? 0) === 0 && (
              <tr><td colSpan={9} className="text-center text-[var(--ink-500)] py-4">{t("Không có ticket thiếu hàng bảo hành nào")}</td></tr>
            )}
            {data?.data.map((r) => {
              const s = THB_TRANG_THAI[r.trang_thai];
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-[var(--color-surface-hover)]" onClick={() => setMo(r)}>
                  <td className="font-mono font-semibold whitespace-nowrap">{r.id}</td>
                  <td className="whitespace-nowrap">{s ? <Badge tone={s.tone}>{t(s.label)}</Badge> : r.trang_thai}</td>
                  <td className="max-w-[260px] truncate" title={`${r.ten_lk ?? ""} (${r.ma_lk})`}>
                    {r.ten_lk ?? ""} <span className="font-mono text-[var(--ink-500)]">({r.ma_lk})</span>
                  </td>
                  <td className="text-right font-semibold">{r.so_luong}</td>
                  <td className="whitespace-nowrap"><span className="font-mono">{r.nguon_id}</span>{r.case_id ? <span className="text-[var(--ink-500)]"> · {r.case_id}</span> : null}</td>
                  <td className="max-w-[180px] truncate">{r.ktv_ten ?? r.ktv_email ?? ""}</td>
                  <td>{r.mien ?? "—"}</td>
                  <td className="whitespace-nowrap">{r.ngay_du_kien ? fmtDate(r.ngay_du_kien) : "—"}{r.ma_eo_mua ? <span className="text-[var(--ink-500)]"> · EO {r.ma_eo_mua}</span> : null}</td>
                  <td className="whitespace-nowrap">{fmtDateTime(r.ngay_tao)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
  const [ngay, setNgay] = useState(tk.ngay_du_kien ?? "");
  const [eo, setEo] = useState(tk.ma_eo_mua ?? "");
  const m = useMutation({
    mutationFn: (den: string) =>
      api.post<{ ticket: ThbRow }>(`/thieu-hang-bh/${encodeURIComponent(row.id)}/log`, { trang_thai: den, ghi_chu: ghiChu.trim() || undefined, ngay_du_kien: ngay || undefined, ma_eo_mua: eo.trim() || undefined }),
    onSuccess: (r) => {
      addToast(t("Đã cập nhật {id} → {tt}", { id: row.id, tt: t(THB_TRANG_THAI[r.ticket.trang_thai]?.label ?? r.ticket.trang_thai) }));
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["thieu-hang-bh"] });
      qc.invalidateQueries({ queryKey: ["thieu-hang-bh-ct", row.id] });
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
        {tk.ghi_chu && <p className="rounded-lg bg-[var(--surface-100)] px-3 py-2 whitespace-pre-wrap">{tk.ghi_chu}</p>}

        {canNhap && (
          <div className="rounded-lg border border-[var(--line)] p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-[var(--ink-500)]">{t("Ngày dự kiến có hàng")}</span>
                <input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} className={`${INPUT} w-full`} />
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
