// "KHÁCH HÀNG ĐÃ CHUYỂN KHOẢN VỀ CÔNG TY" (2026-11-09, migration 0111 - backend lib/quyKhoa.ts). Tich duoc khi la don phat sinh tien (mua /
// TRỪ CÔNG NỢ, khong phai cong no doi tac) - v1.521 (2026-11-18) BO dieu kien phai chon hinh thuc xuat hoa don; don tich o nay tinh GIA NIEM
// YET (tinhToanPxk). Luong don giu nguyen; tien Ke toan xac nhan vao "Quỹ KH chuyển khoản" CUA KTV nhan hang (khong vao quy du ca nhan KTV).
import { t } from "../../i18n";
import { Badge } from "../../components/x/Badge";
import { deriveLoaiDon, laTruCongNo, laMuaCongNoDoiTac } from "./helpers";
import type { DonHangDraft } from "./types";
import { YEU_CAU_HOA_DON_SHORT_LABELS } from "./constants";

export const TEN_QUY_KH = "Quỹ KH chuyển khoản";

/** Co chon 1 hinh thuc xuat hoa don (khac "Không") - ban sao FE cua coChonHoaDon (backend lib/nhomLoaiDeXuat.ts). */
export function coChonHoaDon(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  return s !== "" && s.toLowerCase() !== "không" && s.toLowerCase() !== "khong";
}

export function duocTichKhChuyenKhoan(d: Pick<DonHangDraft, "loai_de_xuat">): boolean {
  const lde = d.loai_de_xuat.trim();
  return !!lde && !laMuaCongNoDoiTac(lde) && (deriveLoaiDon(lde) === "mua" || laTruCongNo(lde));
}

export function KhChuyenKhoanCheck({ d, onChange }: { d: DonHangDraft; onChange: (v: boolean) => void }) {
  const duoc = duocTichKhChuyenKhoan(d);
  const tich = !!d.kh_chuyen_khoan && duoc;
  return (
    <div className="mt-2">
      <label className={`flex items-start gap-2 text-[13px] ${duoc ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}>
        <input type="checkbox" className="mt-0.5" checked={tich} disabled={!duoc} onChange={(e) => onChange(e.target.checked)} />
        <span>
          <b>{t("Khách hàng đã chuyển khoản về công ty")}</b>
          <span className="block text-[11.5px] text-[var(--ink-400)]">
            {duoc
              ? t("Tính giá niêm yết. Tiền Kế toán xác nhận vào Quỹ KH chuyển khoản (không vào quỹ của KTV); đơn chỉ dùng tiền trong quỹ này.")
              : t("Chỉ áp dụng cho đơn mua hàng (cần chuyển tiền).")}
          </span>
        </span>
      </label>
    </div>
  );
}

/** Nhan hien thi tren chi tiet don / dong don. */
export function KhChuyenKhoanBadge({ title }: { title?: string }) {
  return (
    <span title={title ?? t("Tiền vào Quỹ KH chuyển khoản, không vào quỹ của KTV")}>
      <Badge tone="purple" variant="soft">{t("KH chuyển khoản về công ty")}</Badge>
    </span>
  );
}

/** Nen dong phieu co yeu cau xuat hoa don (danh sach Phieu xuat) - ghi de hover nhu nenKhieuNai. */
export function nenHoaDon(hd: string | null | undefined): string {
  return coChonHoaDon(hd) ? "!bg-[var(--color-hoa-don-bg)] hover:!bg-[var(--color-hoa-don-hover)]" : "";
}

/** Nhan "🧾 HĐ - …" (+ "KH chuyển khoản") cua 1 phieu - danh sach + chi tiet phieu. */
export function HoaDonPhieuBadge({ hd, quyKh }: { hd: string | null | undefined; quyKh?: number | boolean | null }) {
  if (!coChonHoaDon(hd) && !quyKh) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {coChonHoaDon(hd) && (
        <span title={t("Phiếu có yêu cầu xuất hóa đơn: {a}", { a: hd ?? "" })}>
          <Badge tone="purple" variant="soft">🧾 {t(YEU_CAU_HOA_DON_SHORT_LABELS[hd!] ?? hd!)}</Badge>
        </span>
      )}
      {!!quyKh && <KhChuyenKhoanBadge />}
    </span>
  );
}

/** Khoi ghi chu dau chi tiet phieu cho Ke toan. */
export function HoaDonPhieuGhiChu({ hd, quyKh }: { hd: string | null | undefined; quyKh?: number | boolean | null }) {
  if (!coChonHoaDon(hd) && !quyKh) return null;
  return (
    <div className="rounded-xl border border-[var(--color-purple)]/30 bg-[var(--color-hoa-don-bg)] px-3 py-2 text-[13px] text-[var(--color-purple-strong)]">
      {coChonHoaDon(hd) && (
        <div>
          🧾 <b>{t("Phiếu có YÊU CẦU XUẤT HÓA ĐƠN")}</b>: {t(YEU_CAU_HOA_DON_SHORT_LABELS[hd!] ?? hd!)} {t("— Kế toán lưu ý xuất hóa đơn cho phiếu này.")}
        </div>
      )}
      {!!quyKh && (
        <div className="mt-0.5">
          💳 <b>{t("Khách hàng đã chuyển khoản về công ty")}</b> — {t("tiền xác nhận vào Quỹ KH chuyển khoản (không vào quỹ của KTV).")}
        </div>
      )}
    </div>
  );
}
