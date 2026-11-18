import { useState } from "react";
import { fmtDate, fmtVND } from "../../types";
import { Money } from "../../components/ui/Money";
import { MaPhieuLink } from "./MaLienKet";
import { t } from "../../i18n";

// GIAI THICH VI SAO DON DUOC MUC CHIET KHAU (chot 2026-11-03, v1.434 - "cần giải thích rõ lý do tại sao linh kiện này lại được giảm theo
// chiết khấu đó"). Nguon: dat_don_hang.ck_co_so (backend lib/pxkRecalculate.ts tinhToanPxk - CoSoChietKhau). Moc 200k/500k = tong dat
// trong ngay + gia tri cac phieu cua KTV CHUA duoc Ke toan chot xong don xuat luc don duoc tao (phieu dang mo).

export interface CoSoChietKhau {
  ma: string | null;
  ly_do: "bac_thang" | "chua_gia_ktv" | "dinh_tu" | "hoa_don" | "kh_chuyen_khoan" | "du_phong" | "kh_le" | "gia_chot";
  moc?: number;
  ngay?: string;
  tong_ngay?: number;
  phieu?: { id: string; tong: number }[];
}

export function docCoSoChietKhau(json: string | null | undefined): CoSoChietKhau | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as CoSoChietKhau;
    return v && typeof v === "object" && v.ly_do ? v : null;
  } catch {
    return null;
  }
}

const MOC_1 = 200000;
const MOC_2 = 500000;

function mucTheoMoc(moc: number): string {
  if (moc < MOC_1) return t("dưới 200.000đ → giá niêm yết (chưa được chiết khấu)");
  if (moc < MOC_2) return t("từ 200.000đ đến dưới 500.000đ → giảm 30% giá niêm yết");
  return t("từ 500.000đ trở lên → hưởng Giá KTV");
}

/** Cau ket luan ngan (1 dong) - dung cho tooltip. */
export function tomTatCoSo(cs: CoSoChietKhau): string {
  switch (cs.ly_do) {
    case "dinh_tu": return t("Linh kiện phân loại Đình tủ luôn giảm 15% (giá niêm yết × 85%), không phụ thuộc tổng đặt.");
    case "hoa_don": return t("Đơn có yêu cầu hóa đơn → tính giá niêm yết, không áp chiết khấu.");
    case "kh_chuyen_khoan": return t("Khách hàng chuyển khoản về công ty → tính giá niêm yết, không áp chiết khấu.");
    case "du_phong": return t("Đơn MUA DỰ TRỮ còn trong hạn mức dự phòng → tính theo giá dự phòng.");
    case "kh_le": return t("Khách lẻ → tính giá niêm yết, không chiết khấu.");
    default: {
      const moc = cs.moc ?? 0;
      const phan = [t("đơn đặt ngày {ngay} {tien}", { ngay: cs.ngay ? fmtDate(cs.ngay) : "", tien: fmtVND(cs.tong_ngay ?? moc) })];
      for (const p of cs.phieu ?? []) phan.push(t("phiếu {id} {tien}", { id: p.id, tien: fmtVND(p.tong) }));
      const base = t("Tổng tính chiết khấu {moc} = {phan}: {muc}.", { moc: fmtVND(moc), phan: phan.join(" + "), muc: mucTheoMoc(moc) });
      const them = cs.ly_do === "chua_gia_ktv" ? " " + t("Linh kiện chưa có Giá KTV nên vẫn giữ giá niêm yết.") : "";
      const chot = cs.ly_do === "gia_chot" ? " " + t("Đơn đang áp giá chốt tay (giá chốt luôn thay cho giá theo chiết khấu).") : "";
      return base + them + chot;
    }
  }
}

/** Khoi giai thich day du (chi tiet don) - ma phieu bam duoc. */
export function CoSoChietKhauKhoi({ json }: { json: string | null | undefined }) {
  const cs = docCoSoChietKhau(json);
  if (!cs) return null;
  const laBacThang = cs.ly_do === "bac_thang" || cs.ly_do === "chua_gia_ktv" || cs.ly_do === "gia_chot";
  if (!laBacThang || cs.moc == null) {
    return <div className="mt-1 text-[12px] leading-snug text-[var(--color-text-secondary)]">💡 {tomTatCoSo(cs)}</div>;
  }
  const phieu = cs.phieu ?? [];
  return (
    <div className="mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5 text-[12px] leading-snug text-[var(--color-text-secondary)]">
      <div>
        💡 {t("Tổng tính chiết khấu:")} <Money className="font-semibold text-[var(--color-text)]">{fmtVND(cs.moc)}</Money> — {mucTheoMoc(cs.moc)}
      </div>
      <ul className="mt-0.5 list-disc pl-5">
        <li>
          {t("Đơn Mua + Trừ công nợ đặt ngày {ngay}:", { ngay: cs.ngay ? fmtDate(cs.ngay) : "—" })} <Money>{fmtVND(cs.tong_ngay ?? 0)}</Money>
        </li>
        {phieu.map((p) => (
          <li key={p.id}>
            {t("Phiếu")} <MaPhieuLink id={p.id} /> {t("(chưa được Kế toán chốt xong đơn xuất):")} <Money>{fmtVND(p.tong)}</Money>
          </li>
        ))}
      </ul>
      {phieu.length > 0 && (
        <div className="mt-0.5 text-[11.5px] text-[var(--color-text-faint)]">
          {t("Đơn được tạo khi các phiếu trên còn chờ chuyển tiền / chờ Kế toán chốt đơn xuất nên giá trị của chúng được cộng dồn — công ty khuyến khích KTV gom đơn để hưởng mức chiết khấu cao hơn.")}
        </div>
      )}
      {cs.ly_do === "chua_gia_ktv" && <div className="mt-0.5">{t("Linh kiện chưa có Giá KTV nên vẫn giữ giá niêm yết.")}</div>}
      {cs.ly_do === "gia_chot" && <div className="mt-0.5">{t("Đơn đang áp giá chốt tay (giá chốt luôn thay cho giá theo chiết khấu).")}</div>}
    </div>
  );
}

/** Nut ⓘ nho canh nhan loai chiet khau (bang dong don trong phieu) - bam mo/thu giai thich. */
export function CoSoChietKhauNut({ json }: { json: string | null | undefined }) {
  const [mo, setMo] = useState(false);
  const cs = docCoSoChietKhau(json);
  if (!cs) return null;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="text-[12px] text-[var(--color-text-faint)] hover:text-[var(--color-primary)]"
        title={tomTatCoSo(cs)}
        onClick={(e) => { e.stopPropagation(); setMo((v) => !v); }}
        aria-label={t("Vì sao được mức chiết khấu này?")}
      >
        ⓘ
      </button>
      {mo && (
        <span
          className="absolute left-0 top-5 z-30 w-[340px] max-w-[80vw] whitespace-normal rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-left shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <CoSoChietKhauKhoi json={json} />
        </span>
      )}
    </span>
  );
}
