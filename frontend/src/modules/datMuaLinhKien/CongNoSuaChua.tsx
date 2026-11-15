import { t } from "../../i18n";
import { chuanMaDonBh, laCongNoSuaChua } from "./helpers";
import type { DonHangDraft } from "./types";

// CÔNG NỢ SỬA CHỮA (chot 2026-11-16, v1.495, migration 0119): NV sua chua van phong dat linh kien ky gui de sua san pham bao hanh. Moi dong
// BAT BUOC gan ma don bao hanh cua app "Bảo hành đổi trả 3T" (don cha "DH-000123" hoac don vi "DH-000123-1") - giai doan sau he thong dua
// vao ma nay de tu tao don tru cong no khi linh kien da tieu hao / xac tra doi tac. Dung CHUNG form tao don desktop (TaoDonTab) + mobile.
// Chi hien khi dong dang chon loai CÔNG NỢ SỬA CHỮA.
export function MaDonBhInput({
  d,
  onChange,
  id,
  cao = "h-9",
}: {
  d: DonHangDraft;
  onChange: (v: string) => void;
  id?: string;
  cao?: string;
}) {
  if (!laCongNoSuaChua(d.loai_de_xuat)) return null;
  const v = d.bh_don_vi_id ?? "";
  const hopLe = !!chuanMaDonBh(v);
  const sai = v.trim() !== "" && !hopLe;
  return (
    <div id={id}>
      <label className={`block text-[11px] font-semibold mb-1 ${hopLe ? "text-[var(--ink-600)]" : "text-[var(--coral-600)]"}`}>{t("Mã đơn bảo hành *")}</label>
      <input
        value={v}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        maxLength={16}
        placeholder={t("VD: DH-000123-1")}
        className={`focus-ring w-full max-w-[320px] ${cao} bg-white border rounded-lg px-2.5 text-sm font-mono uppercase ${hopLe ? "border-[var(--line)]" : "border-[var(--coral-400)] bg-[var(--coral-100)]/25"}`}
      />
      <div className={`mt-1 text-[11px] ${sai ? "text-[var(--coral-700)] font-medium" : "text-[var(--ink-500)]"}`}>
        {sai
          ? t("Mã không đúng dạng — nhập mã đơn trên app Bảo hành đổi trả, dạng DH-000123 hoặc DH-000123-1")
          : t("Mã đơn bảo hành (app Bảo hành đổi trả) đang sửa cần linh kiện này — dùng để đối trừ công nợ khi linh kiện đã thay thế.")}
      </div>
    </div>
  );
}
