import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/x/Badge";
import { api } from "../../api/client";
import { describeApiError, invalidatePipelineCounts, trangThaiLabel } from "./helpers";
import { MaPhieuLink } from "./MaLienKet";
import { PXK_TRANG_THAI_OPTIONS } from "./constants";
import { t } from "../../i18n";

// Phieu CHO HANG tach rieng don kho thieu hang (chot 2026-11-10, migration 0112): tu gom don "Chờ thanh toán (thiếu hàng)" vao phieu rieng
// (lib/pxkAutoBundle.ts) + KTV / TN bam tach nhanh (POST /phieu-xuat-kho/:id/tach-cho-hang) -> phieu don co hang duoc Ke toan xuat truoc.

export function ChoHangBadge() {
  return (
    <span title={t("Phiếu chờ hàng — tách riêng đơn kho thiếu hàng, đơn có hàng nằm ở phiếu khác")}>
      <Badge tone="warning">{t("Phiếu chờ hàng")}</Badge>
    </span>
  );
}

/** Khoi nhac Ke toan o chi tiet phieu: KTV co phieu cung loai de xuat dang tach rieng (phieu co hang <-> phieu cho hang). */
export function PhieuChoHangCanhBao({ choHang, lienQuan }: {
  choHang?: number | null;
  lienQuan?: { id: string; trang_thai: string; cho_hang: number; so_don: number }[];
}) {
  const ds = lienQuan ?? [];
  if (!choHang && ds.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)] px-3 py-2 text-[13px] text-[var(--color-text-body)]">
      {choHang ? (
        <div>
          ⏳ <b>{t("Phiếu chờ hàng")}</b> — {t("chứa đơn kho đang thiếu hàng, tách riêng để đơn có hàng của KTV được xuất trước.")}
        </div>
      ) : null}
      {ds.length > 0 && (
        <div className={choHang ? "mt-0.5" : ""}>
          {choHang
            ? t("Đơn có hàng của KTV này nằm ở phiếu:")
            : <>⚠ <b>{t("Lưu ý Kế toán")}</b>: {t("KTV này đang có phiếu cùng loại đề xuất nhưng THIẾU HÀNG, đang tách riêng:")}</>}{" "}
          {ds.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <MaPhieuLink id={p.id} /> <span className="text-[var(--color-text-secondary)]">({p.so_don} {t("đơn")} · {trangThaiLabel(PXK_TRANG_THAI_OPTIONS, p.trang_thai)})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Nut "Tách N đơn thiếu hàng ra phiếu riêng" - backend tu kiem tra quyen (duoc_tach_cho_hang). */
export function NutTachChoHang({ pxkId, soDon, addToast, size = "sm" }: {
  pxkId: string; soDon: number; addToast: (msg: string) => void; size?: "sm" | "md";
}) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.post<{ ok: true; phieu_dich: string; xong: number }>(`/phieu-xuat-kho/${pxkId}/tach-cho-hang`, {}),
    onSuccess: (r) => addToast(t("Đã tách {n} đơn thiếu hàng sang phiếu chờ hàng {p}", { n: r.xong, p: r.phieu_dich })),
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pxk-detail"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      invalidatePipelineCounts(qc);
    },
  });
  return (
    <Btn
      size={size}
      variant="subtle"
      loading={m.isPending}
      disabled={m.isPending}
      title={t("Đơn kho thiếu hàng sang 1 phiếu chờ hàng riêng — phiếu này còn đơn có hàng để Kế toán xuất trước")}
      onClick={(e) => {
        e.stopPropagation();
        if (window.confirm(t("Tách {n} đơn kho thiếu hàng ra 1 phiếu chờ hàng riêng?\n\nPhiếu này chỉ còn đơn có hàng để Kế toán xuất trước. Tiền cần chuyển được tính lại cho từng phiếu (phần đã chuyển thừa về quỹ và tự trừ cho phiếu kia).", { n: soDon }))) m.mutate();
      }}
    >
      {t("✂ Tách {n} đơn thiếu hàng ra phiếu riêng", { n: soDon })}
    </Btn>
  );
}
