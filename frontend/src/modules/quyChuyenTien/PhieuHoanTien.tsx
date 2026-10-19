import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../../components/ui/Btn";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Money } from "../../components/ui/Money";
import { PaginatedTable, type Column } from "../../components/ui/PaginatedTable";
import { Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/Toast";
import { fmtDateTime, fmtVND } from "../../types";
import { describeApiError } from "../datMuaLinhKien/helpers";
import { t, dichSau } from "../../i18n";

// PHIẾU HOÀN TIỀN QUỸ (chot 2026-10-19, backend lib/phieuHoanTien.ts, migration 0090) - "KT tạo phiếu hoàn tiền => tiền tạm giữ khỏi
// quỹ => KTV xác nhận => tiền bị trừ khỏi quỹ. KTV từ chối => đẩy về KT xác nhận. KT xác nhận thì hủy luồng ... các xác nhận, từ chối,
// hủy bỏ đều có thể thêm ghi chú". Nut thao tac theo `hanh_dong` backend tra ve (hanhDongDuoc) - FE khong tu suy quyen.

export type TrangThaiHt = "Cho KTV xac nhan" | "Cho KT xac nhan" | "Da hoan tien" | "Da huy";
export type HanhDongHt = "ktv_xac_nhan" | "ktv_tu_choi" | "kt_xac_nhan_huy" | "kt_tu_choi" | "kt_huy";

export interface PhieuHoanTienRow {
  id: string;
  email: string;
  so_tien: number;
  trang_thai: TrangThaiHt;
  ghi_chu: string | null;
  nguoi_tao: string;
  ngay_tao: string;
  cap_nhat_luc: string;
  ktv_xac_nhan_luc: string | null;
  huy_luc: string | null;
  ghi_chu_cuoi?: string | null;
  hanh_dong_cuoi?: string | null;
  nguoi_cuoi?: string | null;
  hanh_dong: HanhDongHt[];
}
interface LogRow {
  id: number;
  hanh_dong: "tao" | HanhDongHt;
  trang_thai: TrangThaiHt;
  ghi_chu: string | null;
  nguoi: string;
  ngay_tao: string;
}

export const TT_HT: Record<TrangThaiHt, { label: string; tone: BadgeTone }> = {
  "Cho KTV xac nhan": { label: dichSau("Chờ KTV xác nhận"), tone: "amber" },
  "Cho KT xac nhan": { label: dichSau("KTV từ chối · chờ KT"), tone: "coral" },
  "Da hoan tien": { label: dichSau("Đã hoàn tiền"), tone: "teal" },
  "Da huy": { label: dichSau("Đã hủy"), tone: "gray" },
};
const HANH_DONG: Record<"tao" | HanhDongHt, string> = {
  tao: dichSau("Kế toán tạo phiếu, tạm giữ tiền khỏi quỹ"),
  ktv_xac_nhan: dichSau("KTV xác nhận đã nhận tiền"),
  ktv_tu_choi: dichSau("KTV từ chối"),
  kt_xac_nhan_huy: dichSau("Kế toán xác nhận hủy — tiền trả lại quỹ"),
  kt_tu_choi: dichSau("Kế toán từ chối, đẩy lại chờ KTV xác nhận"),
  kt_huy: dichSau("Kế toán hủy phiếu — tiền trả lại quỹ"),
};
// Nut thao tac: nhan + kieu + co can bam 2 lan (thao tac chot tien).
const NUT: Record<HanhDongHt, { label: string; variant: "primary" | "danger" | "ghost"; xacNhan: boolean }> = {
  ktv_xac_nhan: { label: dichSau("✓ Đã nhận tiền"), variant: "primary", xacNhan: true },
  ktv_tu_choi: { label: dichSau("Từ chối"), variant: "danger", xacNhan: false },
  kt_xac_nhan_huy: { label: dichSau("Xác nhận hủy phiếu"), variant: "danger", xacNhan: true },
  kt_tu_choi: { label: dichSau("Từ chối, đẩy lại KTV"), variant: "ghost", xacNhan: false },
  kt_huy: { label: dichSau("Hủy phiếu"), variant: "danger", xacNhan: true },
};
const GIAI_THICH: Record<TrangThaiHt, string> = {
  "Cho KTV xac nhan": dichSau("Tiền đang được tạm giữ khỏi quỹ. KTV bấm \"Đã nhận tiền\" khi đã nhận được tiền Kế toán chuyển — phiếu hoàn tất; chưa nhận thì bấm \"Từ chối\"."),
  "Cho KT xac nhan": dichSau("KTV báo chưa nhận được tiền. Kế toán \"Xác nhận hủy phiếu\" (tiền tạm giữ trả lại quỹ) hoặc \"Từ chối\" để đẩy lại cho KTV xác nhận."),
  "Da hoan tien": dichSau("KTV đã xác nhận nhận tiền — số tiền đã trừ hẳn khỏi quỹ."),
  "Da huy": dichSau("Phiếu đã hủy — tiền tạm giữ đã trả lại quỹ."),
};

export function HtBadge({ tt }: { tt: TrangThaiHt }) {
  return <Badge tone={TT_HT[tt]?.tone ?? "gray"}>{t(TT_HT[tt]?.label ?? tt)}</Badge>;
}

const LOC: { v: string; label: string }[] = [
  { v: "__MO__", label: dichSau("Đang mở") },
  { v: "Cho KTV xac nhan", label: dichSau("Chờ KTV xác nhận") },
  { v: "Cho KT xac nhan", label: dichSau("KTV từ chối · chờ KT") },
  { v: "Da hoan tien", label: dichSau("Đã hoàn tiền") },
  { v: "Da huy", label: dichSau("Đã hủy") },
  { v: "", label: dichSau("Tất cả") },
];

const nhanO = "text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]";
const oNhap = "focus-ring mt-1 w-full rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-base sm:text-sm";

export function lamMoiHoanTien(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["quy-ktv-hoan-tien"] });
  void qc.invalidateQueries({ queryKey: ["quy-ktv-hoan-tien-ct"] });
  void qc.invalidateQueries({ queryKey: ["quy-ktv-tong-quan"] });
  void qc.invalidateQueries({ queryKey: ["quy-ktv-giao-dich"] });
  void qc.invalidateQueries({ queryKey: ["notifications-count"] });
}

export function HoanTienTab({ xemNhieuNguoi, nguoiOptions, ten, moId, onTao }: {
  xemNhieuNguoi: boolean;
  nguoiOptions: { value: string; label: string }[];
  ten: (e: string | null | undefined) => string;
  moId: { id: string; nonce: number } | null; // mo chi tiet tu chuong / link push
  onTao: (() => void) | null; // null = khong co quyen tao (khong phai Ke toan/Admin)
}) {
  const [loc, setLoc] = useState("__MO__");
  const [emailLoc, setEmailLoc] = useState("");
  const [page, setPage] = useState(1);
  const [chiTiet, setChiTiet] = useState<string | null>(null);
  useEffect(() => {
    if (moId) setChiTiet(moId.id);
  }, [moId]);
  const params = new URLSearchParams({ trang_thai: loc, page: String(page), pageSize: "20" });
  if (emailLoc) params.set("email", emailLoc);
  const qs = params.toString();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["quy-ktv-hoan-tien", qs],
    queryFn: () => api.get<{ rows: PhieuHoanTienRow[]; total: number; dem: Record<string, number> }>(`/quy-ktv/phieu-hoan-tien?${qs}`),
    refetchInterval: 60_000,
  });
  const columns: Column<PhieuHoanTienRow>[] = [
    { key: "id", header: t("Mã phiếu"), render: (r) => <span className="code-link font-mono">{r.id}</span>, mobile: "title" },
    ...(xemNhieuNguoi ? [{ key: "nguoi", header: t("KTV nhận hoàn"), render: (r: PhieuHoanTienRow) => <span className="font-semibold">{ten(r.email)}</span>, mobile: "sub" as const }] : []),
    { key: "tien", header: t("Số tiền"), className: "text-right", render: (r) => <b><Money>{fmtVND(r.so_tien)}</Money></b>, mobile: "meta" },
    { key: "tt", header: t("Trạng thái"), render: (r) => <HtBadge tt={r.trang_thai} />, mobile: "badge" },
    {
      key: "gc", header: t("Ghi chú mới nhất"),
      render: (r) => {
        const gc = r.ghi_chu_cuoi ?? r.ghi_chu;
        return gc ? <span className="block max-w-[300px] truncate" title={gc}>{gc}</span> : <span className="text-[var(--color-text-faint)]">—</span>;
      },
    },
    { key: "tao", header: t("Kế toán tạo"), render: (r) => <span className="whitespace-nowrap">{ten(r.nguoi_tao)} · {fmtDateTime(r.ngay_tao)}</span> },
    { key: "cn", header: t("Cập nhật"), render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.cap_nhat_luc)}</span>, mobile: "meta" },
    {
      key: "can", header: "", mobileHint: "actions",
      render: (r) => (r.hanh_dong.length ? <Btn size="sm" variant="subtle" onClick={() => setChiTiet(r.id)}>{t("Xử lý")}</Btn> : null),
    },
  ];
  return (
    <div className="space-y-3">
      <div className="text-[13px] text-[var(--color-text-secondary)]">
        {t("Kế toán tạo phiếu hoàn tiền từ quỹ dư → tiền tạm giữ khỏi quỹ → KTV xác nhận đã nhận thì trừ hẳn; KTV từ chối thì Kế toán xác nhận hủy (tiền về lại quỹ) hoặc đẩy lại cho KTV.")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {LOC.map((l) => (
            <button key={l.v} type="button" onClick={() => { setLoc(l.v); setPage(1); }} className={`filter-tab ${loc === l.v ? "active" : ""}`}>
              {t(l.label)} <span className="tabular opacity-70">({data?.dem?.[l.v] ?? 0})</span>
            </button>
          ))}
        </div>
        {xemNhieuNguoi && <Select value={emailLoc} onChange={(v) => { setEmailLoc(v); setPage(1); }} options={nguoiOptions} className="w-full sm:w-60" />}
        {onTao && <Btn className="sm:ml-auto" onClick={onTao}>{t("+ Tạo phiếu hoàn tiền")}</Btn>}
      </div>
      <PaginatedTable
        columns={columns}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        page={page}
        pageSize={20}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onRowClick={(r) => setChiTiet(r.id)}
        rowKey={(r) => r.id}
        emptyText={t("Chưa có phiếu hoàn tiền")}
      />
      {chiTiet && <ChiTietHoanTienModal id={chiTiet} ten={ten} onClose={() => setChiTiet(null)} />}
    </div>
  );
}

function ChiTietHoanTienModal({ id, ten, onClose }: { id: string; ten: (e: string | null | undefined) => string; onClose: () => void }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const [ghiChu, setGhiChu] = useState("");
  const [cho, setCho] = useState<HanhDongHt | null>(null); // nut dang cho bam lan 2
  const { data, isLoading, isError } = useQuery({
    queryKey: ["quy-ktv-hoan-tien-ct", id],
    queryFn: () => api.get<{ phieu: PhieuHoanTienRow; log: LogRow[]; so_du: number }>(`/quy-ktv/phieu-hoan-tien/${encodeURIComponent(id)}`),
  });
  const mut = useMutation({
    mutationFn: (hanhDong: HanhDongHt) =>
      api.post<{ trang_thai: TrangThaiHt }>(`/quy-ktv/phieu-hoan-tien/${encodeURIComponent(id)}/xu-ly`, { hanh_dong: hanhDong, ghi_chu: ghiChu.trim() || undefined }),
    onSuccess: (r) => {
      addToast(t("Đã cập nhật {a} → {b}", { a: id, b: t(TT_HT[r.trang_thai].label) }));
      setGhiChu("");
      setCho(null);
      lamMoiHoanTien(qc);
    },
    onError: (err) => { setCho(null); addToast(t("Lỗi: ") + describeApiError(err)); },
  });
  const p = data?.phieu;
  const bam = (h: HanhDongHt) => {
    if (NUT[h].xacNhan && cho !== h) return setCho(h);
    mut.mutate(h);
  };
  return (
    <Modal open onClose={onClose} title={t("Phiếu hoàn tiền {a}", { a: id })}>
      {isLoading ? (
        <div className="py-6 text-center text-sm text-[var(--color-text-secondary)]">{t("Đang tải…")}</div>
      ) : isError || !p ? (
        <div className="py-6 text-center text-sm text-[var(--color-danger-strong)]">{t("Không tải được phiếu hoàn tiền.")}</div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><div className={nhanO}>{t("KTV nhận hoàn")}</div><div className="font-semibold">{ten(p.email)}</div></div>
            <div><div className={nhanO}>{t("Số tiền")}</div><div className="text-base font-bold"><Money>{fmtVND(p.so_tien)}</Money></div></div>
            <div><div className={nhanO}>{t("Trạng thái")}</div><HtBadge tt={p.trang_thai} /></div>
            <div><div className={nhanO}>{t("Quỹ dư hiện tại")}</div><Money>{fmtVND(data.so_du)}</Money></div>
          </div>
          <div className="rounded-lg bg-[var(--color-surface-hover)] px-3 py-2 text-[13px] text-[var(--color-text-body)]">{t(GIAI_THICH[p.trang_thai])}</div>
          <div>
            <div className={nhanO}>{t("Lịch sử xử lý")}</div>
            <ol className="mt-1 space-y-1.5">
              {data.log.map((l) => (
                <li key={l.id} className="border-l-2 border-[var(--color-border)] pl-2.5">
                  <div className="text-[13px]">
                    <b>{ten(l.nguoi)}</b> · {t(HANH_DONG[l.hanh_dong] ?? l.hanh_dong)}
                  </div>
                  {l.ghi_chu && <div className="text-[13px] text-[var(--color-text-body)]">“{l.ghi_chu}”</div>}
                  <div className="text-[11px] text-[var(--color-text-faint)]">{fmtDateTime(l.ngay_tao)}</div>
                </li>
              ))}
            </ol>
          </div>
          {p.hanh_dong.length > 0 && (
            <>
              <div>
                <label className={nhanO}>{t("Ghi chú (không bắt buộc)")}</label>
                <textarea value={ghiChu} onChange={(e) => { setGhiChu(e.target.value); setCho(null); }} rows={2} className={oNhap}
                  placeholder={p.trang_thai === "Cho KTV xac nhan" ? t("Vd: Đã nhận qua chuyển khoản ngày …") : t("Vd: Đã kiểm tra sao kê, tiền đã chuyển thành công")} />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {cho && <span className="text-[11px] font-medium text-[var(--color-danger-strong)]">{t("Bấm lần nữa để xác nhận")}</span>}
                {p.hanh_dong.map((h) => (
                  <Btn key={h} variant={NUT[h].variant} onClick={() => bam(h)} disabled={mut.isPending} loading={mut.isPending && mut.variables === h}>
                    {cho === h ? t("Xác nhận: {a}", { a: t(NUT[h].label) }) : t(NUT[h].label)}
                  </Btn>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Ke toan tao phieu hoan tien (POST /quy-ktv/phieu-hoan-tien) - chon nguoi co quy du, so tien <= quy. */
export function TaoHoanTienModal({ nguoi, emailChon, ten, onClose, onDone }: {
  nguoi: { email: string; so_du: number }[];
  emailChon?: string;
  ten: (e: string | null | undefined) => string;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const addToast = useToast();
  const coQuy = nguoi.filter((n) => n.so_du > 0 || n.email === emailChon);
  const [email, setEmail] = useState(emailChon ?? "");
  const [soTien, setSoTien] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const soDu = nguoi.find((n) => n.email === email)?.so_du ?? 0;
  const so = Number(soTien);
  const hopLe = !!email && Number.isInteger(so) && so > 0 && so <= soDu;
  const mut = useMutation({
    mutationFn: () => api.post<{ id: string }>("/quy-ktv/phieu-hoan-tien", { email, so_tien: so, ghi_chu: ghiChu.trim() || undefined }),
    onSuccess: (r) => onDone(r.id),
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });
  return (
    <Modal open onClose={onClose} title={t("Tạo phiếu hoàn tiền quỹ")}>
      <div className="space-y-3 text-sm">
        <div className="rounded-lg bg-[var(--color-surface-hover)] px-3 py-2 text-[13px] text-[var(--color-text-body)]">
          {t("Số tiền được tạm giữ khỏi quỹ ngay (không còn tự trừ cho phiếu xuất). KTV xác nhận đã nhận thì trừ hẳn; hủy phiếu thì tiền trả lại quỹ.")}
        </div>
        <div>
          <label className={nhanO}>{t("KTV nhận hoàn")}</label>
          <Select
            value={email}
            onChange={(v) => setEmail(v)}
            options={[{ value: "", label: t("— Chọn người có quỹ dư —") }, ...coQuy.map((n) => ({ value: n.email, label: `${ten(n.email) || n.email} — ${fmtVND(n.so_du)}` }))]}
            className="mt-1 w-full"
          />
        </div>
        <div>
          <label className={nhanO}>{t("Số tiền hoàn")}</label>
          <div className="flex items-center gap-2">
            <input type="number" min={1} inputMode="numeric" value={soTien} onChange={(e) => setSoTien(e.target.value)} className={oNhap} />
            {soDu > 0 && <Btn size="sm" variant="ghost" className="mt-1 shrink-0" onClick={() => setSoTien(String(soDu))}>{t("Toàn bộ quỹ")}</Btn>}
          </div>
          {email && (
            <div className={`mt-1 text-xs ${so > soDu ? "text-[var(--color-danger-strong)]" : "text-[var(--color-text-secondary)]"}`}>
              {t("Quỹ hiện tại:")} <Money>{fmtVND(soDu)}</Money>
              {so > 0 && (so > soDu ? t(" — vượt quỹ dư, không tạo được") : <> · {t("còn lại sau tạm giữ:")} <Money>{fmtVND(soDu - so)}</Money></>)}
            </div>
          )}
        </div>
        <div>
          <label className={nhanO}>{t("Ghi chú (không bắt buộc)")}</label>
          <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2} className={oNhap} placeholder={t("Vd: Chuyển khoản trả tiền dư ngày …, UNC số …")} />
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose} disabled={mut.isPending}>{t("Đóng")}</Btn>
          <Btn onClick={() => mut.mutate()} disabled={!hopLe || mut.isPending} loading={mut.isPending}>{t("Tạo phiếu & tạm giữ tiền")}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/** Nhan giao dich so quy gan phieu hoan tien (tam giu / tra lai) theo trang thai phieu hien tai. */
export function nhanGiaoDichHoanTien(g: { loai: string; phieu_hoan_tien_id?: string | null; ht_trang_thai?: TrangThaiHt | null }): { label: string; tone: BadgeTone } | null {
  if (!g.phieu_hoan_tien_id) return null;
  if (g.loai === "dieu_chinh") return { label: dichSau("Trả lại tiền tạm giữ"), tone: "violet" };
  if (g.ht_trang_thai === "Da hoan tien") return { label: dichSau("Hoàn tiền cho KTV"), tone: "coral" };
  if (g.ht_trang_thai === "Da huy") return { label: dichSau("Tạm giữ hoàn tiền (đã hủy)"), tone: "gray" };
  return { label: dichSau("Tạm giữ hoàn tiền"), tone: "amber" };
}
