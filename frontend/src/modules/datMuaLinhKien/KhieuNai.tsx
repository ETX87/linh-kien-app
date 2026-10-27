import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { fmtDateTime } from "../../types";
import { formatPersonDisplay, usePersonDirectory } from "../../lib/personDisplay";
import { t } from "../../i18n";
import { describeApiError } from "./helpers";
import type { DonHangRow } from "./types";

// "Ca khiếu nại" (chot 2026-10-28, migration 0101): GS / Kho / TN / Ke toan / Admin tich cho 1 don bat ky (PATCH /don-hang/:id/khieu-nai) -
// don duoc to do nhat o moi danh sach (helpers nenKhieuNai) + uu tien 1 khi he thong tu xac nhan hang ve. Nguoi khac chi thay nhan.
export function KhieuNaiBox({ d, onDone, addToast }: { d: DonHangRow; onDone: () => void; addToast: (msg: string) => void }) {
  const auth = useAuth();
  const dir = usePersonDirectory();
  const u = auth.status === "authenticated" ? auth.user : null;
  const duocTich = !!u && (!!u.la_tac_nghiep || !!u.la_ke_toan || !!u.la_kho || u.vai_tro === "Giam sat" || u.vai_tro === "Admin");
  const [ghiChu, setGhiChu] = useState("");
  const dat = useMutation({
    mutationFn: (bat: boolean) => api.patch(`/dat-mua-lk/don-hang/${d.id}/khieu-nai`, { khieu_nai: bat, ghi_chu: ghiChu.trim() || undefined }),
    onSuccess: (_r, bat) => {
      addToast(bat ? t("Đã đánh dấu ca khiếu nại") : t("Đã bỏ đánh dấu ca khiếu nại"));
      setGhiChu("");
      onDone();
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });
  const laKhieuNai = !!d.khieu_nai;
  if (!duocTich && !laKhieuNai) return null;
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-[12.5px] ${
        laKhieuNai ? "border-[var(--color-danger)]/40 bg-[var(--color-khieu-nai-bg)]" : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <label className={`flex items-center gap-2 font-semibold ${laKhieuNai ? "text-[var(--color-danger-strong)]" : "text-[var(--color-text)]"}`}>
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={laKhieuNai}
          disabled={!duocTich || dat.isPending}
          onChange={(e) => dat.mutate(e.target.checked)}
        />
        ⚠ {t("Ca khiếu nại")}
        {!laKhieuNai && <span className="font-normal text-[var(--color-text-secondary)]">— {t("tích để đánh dấu đơn quan trọng (tô đỏ ở mọi danh sách, ưu tiên khi hàng về)")}</span>}
      </label>
      {laKhieuNai && (
        <div className="mt-0.5 text-[var(--color-text-secondary)]">
          {d.khieu_nai_boi && <>{t("Đánh dấu bởi")} <b>{formatPersonDisplay(d.khieu_nai_boi, dir)}</b></>}
          {d.khieu_nai_luc && <> · {fmtDateTime(d.khieu_nai_luc)}</>}
          {d.khieu_nai_ghi_chu && <div className="text-[var(--color-text)]">{d.khieu_nai_ghi_chu}</div>}
        </div>
      )}
      {duocTich && !laKhieuNai && (
        <input
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          placeholder={t("Ghi chú khiếu nại (tuỳ chọn) — nhập trước rồi tích")}
          className="focus-ring mt-1.5 w-full rounded-lg border border-[var(--line)] bg-white px-2.5 py-1 text-sm"
        />
      )}
    </div>
  );
}
