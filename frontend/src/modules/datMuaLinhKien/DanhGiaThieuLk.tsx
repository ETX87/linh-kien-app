import { useQuery } from "@tanstack/react-query";
import { laTonKhongKiem } from "../../lib/tonKhongKiem";
import { api } from "../../api/client";
import { Badge } from "../../components/x/Badge";
import { fmtDate } from "../../types";
import { t } from "../../i18n";
import { trangThaiLabel } from "./helpers";
import { THIEU_LK_TRANG_THAI_OPTIONS } from "./constants";

// Khung "Thông tin để Kho đánh giá" trong Drawer ticket thiếu hàng (2026-10-19): giúp Kho chọn TIẾP NHẬN chờ hàng về (mã đang có hàng
// về / EO đang về) hay CHUYỂN MUA HÀNG đặt hàng (chưa có kế hoạch hàng về). Nguồn: GET /dat-mua-lk/thieu-lk/:id/danh-gia. EO mua hàng
// (app muahang) chưa kết nối API -> chỉ dựa dữ liệu trong app (ticket cùng mã đã tiếp nhận / Mua hàng đã đặt, tồn kho công ty).
interface DanhGia {
  ma_lk: string;
  sl: number;
  khu_vuc: string | null;
  ton_con_dat: number;
  ticket_cung_ma: { id: string; trang_thai: string; ngay_du_kien_co_hang: string | null; ma_eo_mua: string | null; sl: number; khu_vuc: string | null }[];
  ngay_hang_ve_gan_nhat: string | null;
  don_cho_cung_ma: { so_don: number; tong_sl: number };
  ngay_du_kien_gan_nhat: string | null;
  eo: { ket_noi: boolean };
  goi_y: "co_ton" | "dang_ve" | "dang_cho_mua" | "can_dat";
}

const fmtSl = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

export function DanhGiaThieuLk({ id }: { id: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["thieu-lk-danh-gia", id],
    queryFn: () => api.get<DanhGia>(`/dat-mua-lk/thieu-lk/${encodeURIComponent(id)}/danh-gia`),
    staleTime: 30_000,
  });
  if (isLoading) return <div className="mb-4 text-xs text-[var(--color-text-secondary)]">{t("Đang tải thông tin đánh giá…")}</div>;
  if (isError || !data) return null;

  const goiY =
    data.goi_y === "co_ton"
      ? { tone: "success" as const, text: t("Kho công ty đang còn đủ hàng cho đơn này — kiểm tra và bấm \"Đã có hàng\".") }
      : data.goi_y === "dang_ve"
        ? { tone: "info" as const, text: t("Mã này đang có hàng về (dự kiến {a}) — nên Tiếp nhận, chờ hàng về.", { a: data.ngay_du_kien_gan_nhat ? fmtDate(data.ngay_du_kien_gan_nhat) : "—" }) }
        : data.goi_y === "dang_cho_mua"
          ? { tone: "warning" as const, text: t("Mã này đã có ticket đang chờ Mua hàng đặt — có thể chuyển Mua hàng để gộp đặt cùng.") }
          : { tone: "warning" as const, text: t("Chưa có kế hoạch hàng về cho mã này — nên Chuyển Mua hàng để đặt hàng.") };

  return (
    <div className="mb-4 rounded-xl border border-[var(--color-border-soft)] p-3 text-[13px]">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">{t("Thông tin để Kho đánh giá")}</div>
      <div className="mb-2.5"><Badge tone={goiY.tone}>{goiY.text}</Badge></div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        <div>
          <div className="text-[11px] text-[var(--color-text-secondary)]">{t("Tồn kho còn đặt được")}</div>
          <div className="font-semibold">{laTonKhongKiem(data.ton_con_dat) ? t("Không kiểm tra tồn kho") : fmtSl(data.ton_con_dat)} <span className="text-[11px] font-normal text-[var(--color-text-secondary)]">/ {t("cần {a}", { a: fmtSl(data.sl) })}</span></div>
          {data.khu_vuc && <div className="text-[11px] text-[var(--color-text-secondary)]">{t("Kho khu vực {a}", { a: data.khu_vuc })}</div>}
        </div>
        <div>
          <div className="text-[11px] text-[var(--color-text-secondary)]">{t("Đơn đang chờ mã này")}</div>
          <div className="font-semibold">{t("{a} đơn · SL {b}", { a: data.don_cho_cung_ma.so_don, b: fmtSl(data.don_cho_cung_ma.tong_sl) })}</div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--color-text-secondary)]">{t("Hàng về gần nhất")}</div>
          <div className="font-semibold">{data.ngay_hang_ve_gan_nhat ? fmtDate(data.ngay_hang_ve_gan_nhat) : "—"}</div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--color-text-secondary)]">{t("EO mua hàng")}</div>
          <div className="text-[12px] text-[var(--color-text-secondary)]">{data.eo.ket_noi ? "" : t("Chưa kết nối app EO mua hàng")}</div>
        </div>
      </div>
      {data.ticket_cung_ma.length > 0 && (
        <div className="mt-2.5">
          <div className="mb-1 text-[11px] font-semibold text-[var(--color-text-secondary)]">{t("Ticket khác cùng mã đang mở ({n})", { n: data.ticket_cung_ma.length })}</div>
          <div className="space-y-1">
            {data.ticket_cung_ma.slice(0, 8).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                <span className="font-mono">{r.id}</span>
                <Badge variant="dot" tone="info">{trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, r.trang_thai)}</Badge>
                <span className="text-[var(--color-text-secondary)]">SL {fmtSl(r.sl)}{r.khu_vuc ? ` · ${r.khu_vuc}` : ""}</span>
                {r.ngay_du_kien_co_hang && <span>{t("dự kiến {a}", { a: fmtDate(r.ngay_du_kien_co_hang) })}</span>}
                {r.ma_eo_mua && <span className="font-mono text-[var(--color-text-secondary)]">EO {r.ma_eo_mua}</span>}
              </div>
            ))}
            {data.ticket_cung_ma.length > 8 && <div className="text-[11px] text-[var(--color-text-secondary)]">{t("… và {n} ticket khác", { n: data.ticket_cung_ma.length - 8 })}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
