import { Badge } from "../../components/x/Badge";
import { Money } from "../../components/ui/Money";
import { fmtDateTime, fmtVND } from "../../types";
import { formatPersonDisplay, usePersonDirectory } from "../../lib/personDisplay";
import { t } from "../../i18n";
import type { DonHangRow } from "./types";

// Don cong no VUOT TRAN da duoc GS / TBP duyet (co ma EO) - hien ro o thong tin don + dong don trong chi tiet PXK de Ke toan nhin nhanh
// day la don duoc duyet vuot tran va vuot bao nhieu (chot 2026-10-27). So lieu lay tu log khoi tao (backend VUOT_TRAN_GHI_CHU_SQL):
// "Vượt trần công nợ: công nợ chốt X + đơn mới Y > trần Z" / "vượt mốc công nợ đối tác …: công nợ hiện tại X + đơn mới Y > tối đa Z".

type DonVuotTran = Pick<DonHangRow, "ma_eo" | "ma_eo_nguoi" | "ma_eo_luc" | "vuot_tran_ghi_chu" | "doi_tac_ma">;

const soTien = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

export function phanTichVuotTran(ghiChu: string | null | undefined): { chot: number; don: number; tran: number; vuot: number } | null {
  if (!ghiChu) return null;
  const m = /(?:chốt|hiện tại)\s+([\d.,]+)đ\s*\+\s*đơn mới\s+([\d.,]+)đ\s*>\s*(?:trần|tối đa)\s+([\d.,]+)đ/i.exec(ghiChu);
  if (!m) return null;
  const chot = soTien(m[1]);
  const don = soTien(m[2]);
  const tran = soTien(m[3]);
  return { chot, don, tran, vuot: Math.max(0, chot + don - tran) };
}

export function laDonDuyetVuotTran(d: DonVuotTran): boolean {
  return !!d.ma_eo;
}

/** Nhan gon (dong don trong bang PXK): "✓ Duyệt vượt trần" + tooltip chi tiet. */
export function DuyetVuotTranBadge({ d }: { d: DonVuotTran }) {
  const dir = usePersonDirectory();
  if (!laDonDuyetVuotTran(d)) return null;
  const pt = phanTichVuotTran(d.vuot_tran_ghi_chu);
  const nhan = d.doi_tac_ma ? t("Đối tác") : t("Công nợ");
  const tip = [
    d.doi_tac_ma ? t("Đơn vượt mốc công nợ đối tác — đã được duyệt") : t("Đơn vượt trần công nợ — đã được duyệt"),
    `${t("Mã EO")}: ${d.ma_eo}`,
    d.ma_eo_nguoi ? `${t("Người duyệt")}: ${formatPersonDisplay(d.ma_eo_nguoi, dir)}${d.ma_eo_luc ? ` · ${fmtDateTime(d.ma_eo_luc)}` : ""}` : "",
    pt ? `${t("Công nợ")} ${fmtVND(pt.chot)} + ${t("đơn mới")} ${fmtVND(pt.don)} > ${t("trần")} ${fmtVND(pt.tran)} → ${t("vượt")} ${fmtVND(pt.vuot)}` : "",
  ].filter(Boolean).join("\n");
  return (
    <span title={tip} className="ml-1 inline-flex">
      <Badge tone="purple">
        ✓ {t("Duyệt vượt trần")}
        {pt ? ` +${fmtVND(pt.vuot)}` : ""}
        {` · ${nhan}`}
      </Badge>
    </span>
  );
}

/** Khoi day du (chi tiet don). */
export function DuyetVuotTranKhoi({ d }: { d: DonVuotTran }) {
  const dir = usePersonDirectory();
  if (!laDonDuyetVuotTran(d)) return null;
  const pt = phanTichVuotTran(d.vuot_tran_ghi_chu);
  return (
    <div className="rounded-lg border border-[var(--color-purple)]/30 bg-[var(--color-purple-soft)] px-3 py-2 text-[12.5px] text-[var(--color-text)]">
      <div className="font-bold text-[var(--color-purple-strong)]">
        ✓ {d.doi_tac_ma ? t("Đơn vượt mốc công nợ đối tác — đã được duyệt") : t("Đơn vượt trần công nợ — đã được duyệt")}
      </div>
      <div className="mt-0.5">
        {t("Mã EO")}: <b className="font-mono">{d.ma_eo}</b>
        {d.ma_eo_nguoi && (
          <>
            {" · "}{t("Người duyệt")}: <b>{formatPersonDisplay(d.ma_eo_nguoi, dir)}</b>
            {d.ma_eo_luc && <span className="text-[var(--color-text-secondary)]"> · {fmtDateTime(d.ma_eo_luc)}</span>}
          </>
        )}
      </div>
      {pt ? (
        <div className="mt-0.5">
          {d.doi_tac_ma ? t("Công nợ đối tác") : t("Công nợ chốt")} <Money>{fmtVND(pt.chot)}</Money> + {t("đơn mới")} <Money>{fmtVND(pt.don)}</Money>
          {" > "}{d.doi_tac_ma ? t("mốc tối đa") : t("trần")} <Money>{fmtVND(pt.tran)}</Money>
          {" → "}<b>{t("vượt")} <Money>{fmtVND(pt.vuot)}</Money></b>
        </div>
      ) : (
        <div className="mt-0.5 text-[var(--color-text-secondary)]">{t("Không có số liệu vượt trần lúc tạo đơn (đơn qua bước duyệt trước).")}</div>
      )}
    </div>
  );
}
