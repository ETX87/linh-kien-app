import { Badge } from "../../components/x/Badge";
import { fmtDate } from "../../types";
import { t } from "../../i18n";

// v1.572 (26/11/2026, "Thêm cảnh báo cho Kho khi EO báo hàng đã về đủ mà ticket chưa xác nhận"): cron backend lib/dongBoNgayEo.ts ghi
// eo_ve_du = JSON {po, sl_ve, sl_dat, ngay_ve} khi MOI dong EO Mua hang khop ticket da ket thuc va co hang ve. Ticket da dong -> khong hien.
// He thong KHONG tu xac nhan hang ve (keo theo duyet don / vao phieu / tien) - Kho kiem hang thuc te roi bam "Hàng đã về".
export interface EoVeDu { po: string; sl_ve: number; sl_dat: number; ngay_ve: string | null }

const TT_DONG = ["Da ket thuc", "Da huy bo", "Kho tu choi sai TT", "Kho xac nhan hang da ve", "Mua hang tu choi", "Kho tu choi", "Da huy"];

export function docEoVeDu(raw: string | null | undefined, trangThai?: string | null): EoVeDu | null {
  if (!raw || (trangThai && TT_DONG.includes(trangThai))) return null;
  try {
    const v = JSON.parse(raw) as EoVeDu;
    return v && v.po ? v : null;
  } catch {
    return null;
  }
}

const moTa = (v: EoVeDu) =>
  t("EO Mua hàng báo PO {po} đã kết thúc, hàng đã nhập kho {a}/{b}{ngay}. Kho kiểm tra hàng thực tế rồi bấm \"Hàng đã về\" để đơn đi tiếp.", {
    po: v.po, a: v.sl_ve, b: v.sl_dat, ngay: v.ngay_ve ? ` ${t("ngày")} ${fmtDate(v.ngay_ve)}` : "",
  });

/** Nhan nho o danh sach / dau chi tiet. */
export function EoVeDuBadge({ raw, trangThai }: { raw: string | null | undefined; trangThai?: string | null }) {
  const v = docEoVeDu(raw, trangThai);
  if (!v) return null;
  return (
    <span title={moTa(v)} className="shrink-0">
      <Badge tone="danger">{t("EO báo đã về {a}/{b}", { a: v.sl_ve, b: v.sl_dat })}</Badge>
    </span>
  );
}

/** Khung canh bao trong chi tiet ticket. */
export function EoVeDuBanner({ raw, trangThai }: { raw: string | null | undefined; trangThai?: string | null }) {
  const v = docEoVeDu(raw, trangThai);
  if (!v) return null;
  return (
    <div className="rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-xs text-[var(--color-text)]">
      <b>{t("EO báo hàng đã về")}</b> — {moTa(v)}
    </div>
  );
}
