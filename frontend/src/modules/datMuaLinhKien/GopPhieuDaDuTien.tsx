import { fmtVND } from "../../types";
import { Money } from "../../components/ui/Money";
import { t } from "../../i18n";
import type { KiemTraPhieuDat } from "./types";

// CHON TACH / GOP PHIEU KHI DA CO PHIEU DU TIEN (v1.538, chot 2026-11-20 - "khi nhân viên đặt đơn, hiện tại đang tự động tách phiếu xuất nếu đơn có
// tiền với đơn chưa chuyển tiền ... thêm lựa chọn cho người tạo (có muốn tách thành phiếu chờ chuyển/ phiếu đã có đủ tiền không - vì có ktv muốn được
// chuyển về trong cùng 1 lần)"). Nguon: POST /phieu-dat/kiem-tra -> phieu_da_du_tien (phieu dang tao Ke toan DA duyet tien, cung nhom phieu voi dong
// moi). Mac dinh TACH (giu quy tac cu: phieu du tien gui Ke toan xuat ngay). Gop -> gui gop_phieu_da_du_tien, phieu do ve "Chờ KTV chuyển" so con thieu.
export function GopPhieuDaDuTien({
  kiemTra, gop, setGop, gon = false,
}: { kiemTra: KiemTraPhieuDat | null | undefined; gop: boolean; setGop: (v: boolean) => void; gon?: boolean }) {
  const ds = kiemTra?.phieu_da_du_tien ?? [];
  if (!ds.length) return null;
  const ma = ds.map((p) => p.id).join(", ");
  return (
    <div className={`rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)] ${gon ? "p-2.5" : "p-3"} text-[12px]`} role="group">
      <div className="font-semibold text-[var(--color-text)]">
        {t("Bạn đang có phiếu đã đủ tiền: {ma}", { ma })}
      </div>
      <div className="mt-0.5 text-[11.5px] text-[var(--ink-500)]">
        {ds.map((p) => (
          <span key={p.id} className="block">
            {p.id}: {t("{n} đơn", { n: p.so_don })} · {t("Kế toán đã xác nhận")} <Money>{fmtVND(p.da_thanh_toan)}</Money>
          </span>
        ))}
      </div>
      <label className="mt-2 flex items-start gap-2 cursor-pointer">
        <input type="radio" className="mt-0.5" checked={!gop} onChange={() => setGop(false)} />
        <span>
          <b>{t("Tách phiếu mới chờ chuyển tiền")}</b>
          <span className="block text-[11.5px] text-[var(--ink-500)]">{t("Phiếu đã đủ tiền được gửi Kế toán xuất hàng ngay, đơn mới đi phiếu riêng.")}</span>
        </span>
      </label>
      <label className="mt-1.5 flex items-start gap-2 cursor-pointer">
        <input type="radio" className="mt-0.5" checked={gop} onChange={() => setGop(true)} />
        <span>
          <b>{t("Gộp vào phiếu đã đủ tiền (nhận hàng 1 lần)")}</b>
          <span className="block text-[11.5px] text-[var(--ink-500)]">
            {t("Phiếu {ma} sẽ quay về chờ chuyển bổ sung phần tiền tăng thêm; Kế toán xác nhận lại rồi mới xuất cả phiếu.", { ma })}
          </span>
        </span>
      </label>
    </div>
  );
}
