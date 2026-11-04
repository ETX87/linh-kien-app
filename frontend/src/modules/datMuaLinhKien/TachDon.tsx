import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Modal } from "../../components/ui/Modal";
import { Btn } from "../../components/x/Btn";
import { t } from "../../i18n";
import { describeApiError, invalidatePipelineCounts } from "./helpers";

// TACH DON CHO HANG (chot 2026-11-03, v1.434 - "đặt 2, nhưng về có 1 linh kiện => thêm cho kế toán và kho, TN khả năng tách đơn nhiều thành đơn
// nhỏ (có tiền sẽ chia tiền ra theo số linh kiện đi theo đơn)"). Backend: POST /dat-mua-lk/don-hang/:id/tach-don (lib/tachDon.ts). Dung o Drawer
// ticket thieu hang (ThieuLkTab) + chi tiet don (DonCuaToiTab). `goiY` = SL kho dang co (Kho có x/y) - dien san.

export function TachDonModal({
  donId, soLuong, goiY, tienDaTra, onClose, onDone,
}: {
  donId: string;
  soLuong: number;
  goiY?: number | null;
  tienDaTra?: number | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [sl, setSl] = useState(String(goiY && goiY > 0 && goiY < soLuong ? goiY : 1));
  const [duyet, setDuyet] = useState(true);
  const [ghiChu, setGhiChu] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const n = Number(sl);
  const hopLe = Number.isInteger(n) && n >= 1 && n < soLuong;
  const tien = tienDaTra ?? 0;
  const tienTach = hopLe && tien > 0 ? Math.round((tien * n) / soLuong) : 0;
  const m = useMutation({
    mutationFn: () =>
      api.post<{ ok: true; don_moi: string; trang_thai_moi: string }>(`/dat-mua-lk/don-hang/${encodeURIComponent(donId)}/tach-don`, {
        so_luong: n, duyet, ghi_chu: ghiChu.trim() || undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      qc.invalidateQueries({ queryKey: ["thieu-lk-detail"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail"] });
      qc.invalidateQueries({ queryKey: ["pxk-detail"] });
      invalidatePipelineCounts(qc);
      onDone(
        r.trang_thai_moi === "TN da duyet"
          ? t("Đã tách {n} chiếc sang đơn {id} — đã duyệt vào phiếu; đơn {goc} còn chờ {c}", { n, id: r.don_moi, goc: donId, c: soLuong - n })
          : t("Đã tách {n} chiếc sang đơn {id}; đơn {goc} còn chờ {c}", { n, id: r.don_moi, goc: donId, c: soLuong - n }),
      );
    },
    onError: (e) => setLoi(describeApiError(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t("Tách đơn {id}", { id: donId })}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>{t("Hủy")}</Btn>
          <Btn variant="primary" disabled={!hopLe || m.isPending} loading={m.isPending} onClick={() => { setLoi(null); m.mutate(); }}>
            {t("✂ Tách đơn")}
          </Btn>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-[var(--color-text-secondary)]">
          {t("Đơn đang chờ {n} chiếc. Phần tách ra thành 1 đơn mới; đơn gốc giữ phần còn lại và tiếp tục chờ Kho (ticket thiếu hàng giữ nguyên).", { n: soLuong })}
        </p>
        <label className="block">
          <span className="text-xs font-semibold text-[var(--color-text)]">{t("Số lượng tách ra (hàng đã về)")}</span>
          <input
            type="number"
            min={1}
            max={soLuong - 1}
            value={sl}
            onChange={(e) => setSl(e.target.value)}
            className="mt-1 w-32 rounded-lg border border-[var(--color-border)] px-2 py-1.5"
          />
          <span className="ml-2 text-xs text-[var(--color-text-faint)]">{t("còn chờ: {c}", { c: hopLe ? soLuong - n : "—" })}</span>
        </label>
        {tien > 0 && hopLe && (
          <div className="rounded-lg bg-[var(--color-surface-soft)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)]">
            {t("Tiền đã thanh toán {a}đ chia theo số lượng: đơn mới {b}đ, đơn gốc {c}đ.", {
              a: tien.toLocaleString("vi-VN"), b: tienTach.toLocaleString("vi-VN"), c: (tien - tienTach).toLocaleString("vi-VN"),
            })}
          </div>
        )}
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={duyet} onChange={(e) => setDuyet(e.target.checked)} className="mt-0.5" />
          <span>
            {t("Phần tách ra là hàng ĐÃ VỀ — duyệt ngay và đưa vào phiếu xuất kho (chuyển Kế toán)")}
            <span className="block text-xs text-[var(--color-text-faint)]">{t("Bỏ chọn = chỉ tách đơn, cả 2 đơn vẫn chờ hàng.")}</span>
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-[var(--color-text)]">{t("Ghi chú (tuỳ chọn)")}</span>
          <input
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            maxLength={300}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5"
          />
        </label>
        {!hopLe && <div className="text-xs text-[var(--color-danger)]">{t("Số lượng tách phải từ 1 đến {m}", { m: soLuong - 1 })}</div>}
        {loi && <div className="text-xs text-[var(--color-danger)]">{loi}</div>}
      </div>
    </Modal>
  );
}

// TACH DON NGAY TRONG PHIEU (chot 2026-11-05, v1.440 - "kế toán xác định chỉ cho xuất trước 5 linh kiện, 5 linh kiện còn lại tách ra phiếu khác
// để xuất sau"). Backend: POST /phieu-xuat-kho/:id/dong/:donHangId/tach (lib/tachDon.ts tachDonTrongPhieu). Dung o bang dong don cua phieu
// (PxkDongDonHangTable - Drawer chi tiet PXK + dong xo xuong o danh sach).
export function TachDonPhieuModal({
  pxkId, donId, maLk, soLuong, tienDong, daTraPhieu, tongPhieu, onClose, onDone,
}: {
  pxkId: string;
  donId: string;
  maLk: string;
  soLuong: number;
  tienDong: number; // tien dong trong phieu (tien_uoc_tinh)
  daTraPhieu: number;
  tongPhieu: number | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [sl, setSl] = useState(String(Math.max(1, Math.floor(soLuong / 2))));
  const [ghiChu, setGhiChu] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const n = Number(sl);
  const hopLe = Number.isInteger(n) && n >= 1 && n < soLuong;
  const tienTach = hopLe ? Math.round((tienDong * n) / soLuong) : 0;
  const tyLe = (tongPhieu ?? 0) > 0 ? Math.min(1, daTraPhieu / tongPhieu!) : daTraPhieu > 0 ? 1 : 0;
  const tienMang = Math.min(daTraPhieu, Math.round(tienTach * tyLe));
  const m = useMutation({
    mutationFn: () =>
      api.post<{ ok: true; don_moi: string; phieu_moi: string | null; tien_mang_theo: number }>(
        `/phieu-xuat-kho/${encodeURIComponent(pxkId)}/dong/${encodeURIComponent(donId)}/tach`,
        { so_luong: n, ghi_chu: ghiChu.trim() || undefined },
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["pxk-detail"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      invalidatePipelineCounts(qc);
      onDone(
        r.phieu_moi
          ? t("Đã tách {n} chiếc sang đơn {id} — vào phiếu {p} để xuất sau", { n, id: r.don_moi, p: r.phieu_moi })
          : t("Đã tách {n} chiếc sang đơn {id} (chờ tạo phiếu)", { n, id: r.don_moi }),
      );
    },
    onError: (e) => setLoi(describeApiError(e)),
  });
  return (
    <Modal
      open
      onClose={() => !m.isPending && onClose()}
      title={t("Tách đơn {id} — xuất trước một phần", { id: donId })}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" disabled={m.isPending} onClick={onClose}>{t("Hủy")}</Btn>
          <Btn variant="primary" disabled={!hopLe || m.isPending} loading={m.isPending} onClick={() => { setLoi(null); m.mutate(); }}>
            {t("✂ Tách đơn")}
          </Btn>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-[var(--color-text-secondary)]">
          {t("Dòng {ma} đang xuất {n} chiếc. Phần tách ra thành 1 đơn mới và chuyển sang phiếu khác để xuất sau; phiếu này chỉ xuất phần còn lại.", { ma: maLk, n: soLuong })}
        </p>
        <label className="block">
          <span className="text-xs font-semibold text-[var(--color-text)]">{t("Số lượng tách ra (xuất sau)")}</span>
          <input
            type="number"
            min={1}
            max={soLuong - 1}
            value={sl}
            onChange={(e) => setSl(e.target.value)}
            className="mt-1 w-32 rounded-lg border border-[var(--color-border)] px-2 py-1.5"
          />
          <span className="ml-2 text-xs text-[var(--color-text-faint)]">{t("xuất ở phiếu này: {c}", { c: hopLe ? soLuong - n : "—" })}</span>
        </label>
        {hopLe && tienMang > 0 && (
          <div className="rounded-lg bg-[var(--color-surface-soft)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)]">
            {t("Phần tách mang theo {a}đ đã thanh toán sang phiếu mới (phiếu này giảm tương ứng) — KTV không phải chuyển thêm.", { a: tienMang.toLocaleString("vi-VN") })}
          </div>
        )}
        <label className="block">
          <span className="text-xs font-semibold text-[var(--color-text)]">{t("Ghi chú (tuỳ chọn)")}</span>
          <input
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            maxLength={300}
            placeholder={t("vd: chia hàng cho KTV khác, xuất phần còn lại khi có hàng")}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5"
          />
        </label>
        {!hopLe && <div className="text-xs text-[var(--color-danger)]">{t("Số lượng tách phải từ 1 đến {m}", { m: soLuong - 1 })}</div>}
        {loi && <div className="text-xs text-[var(--color-danger)]">{loi}</div>}
      </div>
    </Modal>
  );
}
