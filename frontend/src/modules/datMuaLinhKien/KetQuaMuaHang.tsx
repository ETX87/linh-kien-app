import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Badge, type Tone } from "../../components/x/Badge";
import { fmtDate } from "../../types";
import { t } from "../../i18n";
import { DetailZone } from "./SharedUi";

// v1.543 (20/11/2026, "dựa vào ID case và ID đơn hàng để trả kết quả về bên app linh kiện"): ket qua ben app EO Mua hang cho 1 don / ticket -
// PO (3TDO), trang thai, SL dat / ve / thieu, ngay du kien. Nguon: GET /dat-mua-lk/mua-hang-eo (backend goi muahang /api/partner/theo-id).
interface DongMuaHang {
  khop_theo: string[]; eo_item_id: number; eo_code: string; ma_phe_duyet: string | null; link: string; trang_thai_eo: string;
  ngay_dat_hang: string | null; id_crm: string | null; id_dat_hang: string | null; ma_lk: string; ten_lk: string; kho: string; doi_tac: string | null;
  sl_dat: number; sl_ve: number; sl_con_thieu: number; trang_thai: string; ket_thuc: boolean;
  ngay_du_kien: string | null; ngay_ve_gan_nhat: string | null; canh_bao: string | null; so_lan_lui: number;
}
interface KetQua { ket_noi: boolean; ma_da_hoi: string[]; rows: DongMuaHang[] }

const fmtSl = (n: number) => Number(n ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const TT_EO: Record<string, string> = { DRAFT: "PO nháp", IN_REVIEW: "PO đang trình duyệt", RETURNED: "PO bị trả về", REJECTED: "PO bị từ chối", CANCELLED: "PO đã hủy" };
function tone(r: DongMuaHang): Tone {
  if (r.trang_thai_eo !== "ISSUED") return "neutral";
  if (r.ket_thuc) return r.sl_ve > 0 ? "success" : "neutral";
  if (r.canh_bao) return "danger";
  return r.sl_ve > 0 ? "info" : "warning";
}

/** Khung "Mua hàng (EO)" o chi tiet don: don co ticket thieu hang -> luon hien; don khac chi hien khi Mua hang co dong khop. */
export function MuaHangZone({ don, coTicket }: { don: string; coTicket: boolean }) {
  const qs = `don=${encodeURIComponent(don)}`;
  const { data } = useQuery({ queryKey: ["mua-hang-eo", qs], queryFn: () => api.get<KetQua>(`/dat-mua-lk/mua-hang-eo?${qs}`), staleTime: 60_000, enabled: !!don });
  if (!coTicket && !data?.rows.length) return null;
  return <DetailZone title={t("Mua hàng (EO)")}><KetQuaMuaHang don={don} /></DetailZone>;
}

/** an = true khi khong co dong nao va khong ket noi duoc (de man cha tu quyet co hien khung hay khong qua hienKhiRong) */
export function KetQuaMuaHang({ don, ticket, hienKhiRong = true }: { don?: string; ticket?: string; hienKhiRong?: boolean }) {
  const qs = don ? `don=${encodeURIComponent(don)}` : `ticket=${encodeURIComponent(ticket ?? "")}`;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["mua-hang-eo", qs],
    queryFn: () => api.get<KetQua>(`/dat-mua-lk/mua-hang-eo?${qs}`),
    staleTime: 60_000,
    enabled: !!(don || ticket),
  });
  if (isLoading) return <div className="text-[12px] text-[var(--color-text-secondary)]">{t("Đang tải kết quả Mua hàng…")}</div>;
  if (isError || !data) return null;
  if (!data.ket_noi) return <div className="text-[12px] text-[var(--color-text-secondary)]">{t("Chưa kết nối app EO mua hàng")}</div>;
  if (!data.rows.length) {
    if (!hienKhiRong) return null;
    return <div className="text-[12px] text-[var(--color-text-secondary)]">{t("Mua hàng chưa có PO nào ghi ID đơn / ticket / case này")}</div>;
  }
  return (
    <div className="space-y-1.5">
      {data.rows.map((r) => (
        <div key={r.eo_item_id} className="rounded-lg border border-[var(--color-border-soft)] px-2.5 py-1.5 text-[12px]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <a href={r.link} target="_blank" rel="noreferrer" className="font-mono font-semibold text-[var(--color-brand)] underline">{r.ma_phe_duyet || r.eo_code}</a>
            <Badge tone={tone(r)}>{r.trang_thai_eo === "ISSUED" ? r.trang_thai : t(TT_EO[r.trang_thai_eo] ?? r.trang_thai_eo)}</Badge>
            <span className="font-mono">{r.ma_lk}</span>
            <span className="text-[var(--color-text-secondary)]">{r.kho}{r.doi_tac ? ` · ${r.doi_tac}` : ""}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{t("Đặt {a} · về {b} · thiếu {c}", { a: fmtSl(r.sl_dat), b: fmtSl(r.sl_ve), c: fmtSl(r.sl_con_thieu) })}</span>
            {r.ngay_dat_hang && <span>{t("Ngày đặt {a}", { a: fmtDate(r.ngay_dat_hang) })}</span>}
            {!r.ket_thuc && <span className={r.canh_bao ? "font-semibold text-[var(--color-danger)]" : ""}>{t("Dự kiến {a}", { a: r.ngay_du_kien ? fmtDate(r.ngay_du_kien) : "—" })}{r.so_lan_lui > 0 ? ` · ${t("đổi {n} lần", { n: r.so_lan_lui })}` : ""}</span>}
            {r.ngay_ve_gan_nhat && <span>{t("Về gần nhất {a}", { a: fmtDate(r.ngay_ve_gan_nhat) })}</span>}
            {r.canh_bao && <span className="text-[var(--color-danger)]">{r.canh_bao}</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
            {t("Khớp theo {a}", { a: r.khop_theo.join(", ") })}{r.id_crm ? ` · ID case ${r.id_crm}` : ""}{r.id_dat_hang ? ` · ID đặt hàng ${r.id_dat_hang}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
