import { fmtVND } from "../../types";
import { t } from "../../i18n";
import type { TaoDonForm } from "./useTaoDonForm";
import type { DonHangDraft } from "./types";

// PHI DICH VU (v1.561, 2026-11-25) - nguyen van: "với mã linh kiện phí dịch vụ (đang để 150.000) cho phép ktv sửa lại số tiền thực tế.
// (khi ktv chọn mã phí dịch vụ, hiện cảnh báo là phí có thể thay đổi và hiện số tiền để ktv nhập hoặc giữ nguyên)".
// Hien ngay duoi o Ma LK khi dong chon ma co ten "phí dịch vụ" (helpers.ts laPhiDichVu): canh bao + o so tien (mac dinh = gia danh muc) +
// nut "Giữ nguyên". So khac gia danh muc -> server ghi gia chot cua don (luon thang gia theo chiet khau).
export function PhiDichVuInput({ form, d, idx, cao = "h-9" }: { form: TaoDonForm; d: DonHangDraft; idx: number; cao?: string }) {
  const pdv = form.giaDvDraft(d);
  if (!pdv.laPdv) return null;
  const lk = form.danhMuc.find((m) => m.ma_linh_kien === d.ma_lk);
  const giaDanhMuc = lk?.gia_ban ?? null;
  const digits = d.gia_dv === undefined ? (giaDanhMuc != null ? String(giaDanhMuc) : "") : d.gia_dv.replace(/\D/g, "");
  const hienThi = digits ? Number(digits).toLocaleString("vi-VN") : "";
  const daSua = pdv.gia != null;
  return (
    <div id="tdo-phi-dv" className="mt-2 rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2">
      <div className="text-xs font-semibold text-[var(--color-warning-strong)]">
        {t("⚠ Phí dịch vụ có thể thay đổi theo thực tế — nhập đúng số tiền thực tế (đơn giá 1 lần dịch vụ) hoặc giữ nguyên giá mặc định {gia}.", {
          gia: giaDanhMuc != null ? fmtVND(giaDanhMuc) : "—",
        })}
      </div>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        <label htmlFor={`phi-dv-${idx}`} className="text-[11px] font-semibold text-[var(--ink-600)] shrink-0">{t("Số tiền thực tế (đ)")}</label>
        <input
          id={`phi-dv-${idx}`}
          type="text"
          inputMode="numeric"
          value={hienThi}
          placeholder={giaDanhMuc != null ? giaDanhMuc.toLocaleString("vi-VN") : ""}
          onChange={(e) => form.updateDraft(idx, { gia_dv: e.target.value.replace(/\D/g, "").slice(0, 10) })}
          className={`focus-ring w-40 ${cao} bg-white border rounded-lg px-2.5 text-sm font-semibold text-right ${pdv.hopLe ? "border-[var(--line)]" : "border-[var(--coral-400)] bg-[var(--coral-100)]/25"}`}
        />
        {(daSua || !pdv.hopLe) && (
          <button
            type="button"
            onClick={() => form.updateDraft(idx, { gia_dv: undefined })}
            className="focus-ring text-[11px] font-semibold text-[var(--ocean-600)] underline underline-offset-2 px-1"
          >
            {t("↺ Giữ nguyên {gia}", { gia: giaDanhMuc != null ? fmtVND(giaDanhMuc) : "" })}
          </button>
        )}
        {daSua && <span className="text-[11px] text-[var(--ink-600)]">{t("Đơn sẽ tính theo số tiền bạn nhập (giá chốt), không áp chiết khấu.")}</span>}
      </div>
      {!pdv.hopLe && <div className="mt-1 text-[11px] font-semibold text-[var(--coral-600)]">{t("Nhập số tiền lớn hơn 0 (tối đa 1 tỷ đồng) hoặc bấm Giữ nguyên.")}</div>}
    </div>
  );
}
