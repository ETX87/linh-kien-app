import { Select } from "../../components/ui/Select";
import { Money } from "../../components/ui/Money";
import { fmtVND } from "../../types";
import { t } from "../../i18n";
import { laMuaCongNoDoiTac } from "./helpers";
import type { TaoDonForm } from "./useTaoDonForm";
import type { DonHangDraft } from "./types";

// Chon doi tac cho dong "MUA HÀNG CÔNG NỢ ĐỐI TÁC" (chot 2026-10-26, v1.403) - dung CHUNG form desktop (TaoDonTab) + mobile
// (TaoDonMobileScreen). TN/Ke toan/GS/Admin chon doi tac; KTV co Ma MISA trong danh sach doi tac chi dat cho chinh minh (doi tac tu dien,
// khong cho doi). Canh bao kha dung: Kha dung (server: toi da - (ban dau + don con hieu luc - da thanh toan)) so voi tong gia niem yet cac dong
// dang soan cung doi tac -> vuot thi don se cho Giam sat duyet (backend lib/tuDongDuyet.ts quyet dinh that).
export function DoiTacCongNoChon({ form, d, idx, reqLabelClass }: { form: TaoDonForm; d: DonHangDraft; idx: number; reqLabelClass: (missing: boolean) => string }) {
  if (!laMuaCongNoDoiTac(d.loai_de_xuat)) return null;
  const ds = form.doiTacChon?.rows ?? [];
  const tuDat = !!form.doiTacChon?.tu_dat;
  const dt = ds.find((r) => r.ma_misa === d.doi_tac_ma);
  const tienForm = dt ? form.tienDoiTacTrenForm(dt.ma_misa) : 0;
  const conLai = dt ? dt.kha_dung - tienForm : 0;
  return (
    <div>
      <label className={reqLabelClass(!d.doi_tac_ma)}>{t("Đối tác công nợ *")}</label>
      {tuDat ? (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-100)] px-2.5 py-1.5 text-sm">
          {dt ? `${dt.ten_misa} (${dt.ma_misa})` : t("Đang tải…")}
        </div>
      ) : (
        <Select
          value={d.doi_tac_ma}
          onChange={(v) => form.updateDraft(idx, { doi_tac_ma: v })}
          options={[{ value: "", label: t("-- Chọn đối tác --") }, ...ds.map((r) => ({ value: r.ma_misa, label: `${r.ten_misa} (${r.ma_misa})` }))]}
          className="w-full"
        />
      )}
      {dt && (
        <div className={`mt-1 text-[12px] ${conLai < 0 ? "text-[var(--color-warning)]" : "text-[var(--color-text-secondary)]"}`}>
          {t("Khả dụng")}: <b><Money>{fmtVND(dt.kha_dung)}</Money></b> / {t("tối đa")} <Money>{fmtVND(dt.toi_da)}</Money>
          {tienForm > 0 && (
            <>
              {" · "}{t("Đơn đang đặt")}: <Money>{fmtVND(tienForm)}</Money>
              {" · "}{conLai < 0 ? <b>{t("Vượt mốc {a} — đơn sẽ chờ Giám sát duyệt", { a: fmtVND(-conLai) })}</b> : <>{t("Còn lại")}: <Money>{fmtVND(conLai)}</Money></>}
            </>
          )}
          <div className="text-[11px] text-[var(--ink-400)]">{t("Giá niêm yết, không cần chuyển khoản — ghi nợ đối tác khi Kế toán chốt phiếu.")}</div>
        </div>
      )}
    </div>
  );
}
