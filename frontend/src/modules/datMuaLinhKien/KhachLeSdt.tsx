import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../../components/ui/Btn";
import { fmtVND } from "../../types";
import { t } from "../../i18n";
import { describeApiError, invalidatePipelineCounts } from "./helpers";
import type { DonHangRow } from "./types";
import type { TaoDonForm } from "./useTaoDonForm";

// O nhap SDT KH le (migration 0074) - hien duoi "Người nhận hàng" khi chon tai khoan nhom KH le (KH_LE_MB/KH_LE_MN). Moi KH
// = 1 nguoi nhan rieng: tien KH chuyen, quy du, phieu xuat, hoan tien... theo dung KH (backend lib/khachLe.ts). Bo trong ->
// he thong cap ma KH tu dong. Dung CHUNG cho Modal desktop (TaoDonTab) + man mobile (TaoDonMobileScreen).
export function KhachLeSdt({ form, compact = false }: { form: TaoDonForm; compact?: boolean }) {
  const { laNhomKhLe, khLeSdt, setKhLeSdt, khLeSdtSai, khLeTraCuu, khLeDangTraCuu } = form;
  if (!laNhomKhLe) return null;
  const so = khLeSdt.replace(/\D/g, "");
  const kh = khLeTraCuu?.kh;
  return (
    <div className={compact ? "mt-2" : "mt-2.5"}>
      <label className={`block font-bold uppercase tracking-wide text-[var(--ocean-700)] mb-1 ${compact ? "text-[10px]" : "text-[11px]"}`}>
        {t("📱 SĐT khách hàng lẻ")}
      </label>
      <input
        value={khLeSdt}
        onChange={(e) => setKhLeSdt(e.target.value)}
        inputMode="tel"
        maxLength={16}
        placeholder={t("VD: 0912345678")}
        className={`focus-ring w-full max-w-[260px] bg-white border rounded-lg px-2.5 py-1.5 text-sm font-mono ${khLeSdtSai ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
      />
      <div className="text-[11px] mt-1">
        {!so ? (
          <span className="text-[var(--ink-500)]">{t("Bỏ trống → hệ thống tự cấp mã KH. Tiền KH chuyển, quỹ dư, hoàn tiền được theo dõi riêng cho từng KH.")}</span>
        ) : khLeSdtSai ? (
          <span className="font-semibold text-[var(--coral-700)]">{t("⚠ SĐT không hợp lệ (10–11 số, bắt đầu bằng 0)")}</span>
        ) : khLeDangTraCuu && !khLeTraCuu ? (
          <span className="text-[var(--ink-500)]">{t("Đang tra cứu…")}</span>
        ) : kh ? (
          <span className="text-[var(--ink-600)]">
            {t("KH đã có: {ma} · {n} đơn ({c} chờ hàng) · quỹ dư {q}", { ma: kh.ma, n: kh.so_don, c: kh.so_don_cho_hang, q: fmtVND(kh.quy_du) })}
          </span>
        ) : (
          <span className="text-[var(--ink-500)]">{t("KH mới — sẽ tạo khi bấm Tạo đơn.")}</span>
        )}
      </div>
    </div>
  );
}

// Danh sach tai khoan nhom KH le (GET /khach-le/nhom) - it doi, giu lau.
export function useNhomKhLe() {
  return useQuery({
    queryKey: ["khach-le-nhom"],
    queryFn: () => api.get<{ rows: { ma_ktv: string; email: string | null; ten: string | null; khu_vuc_ma: string | null }[] }>("/khach-le/nhom"),
    staleTime: 10 * 60_000,
  });
}

// "Gán KH lẻ" cho don CU dang ghi nguoi nhan = tai khoan nhom (chot nguoi dung "Cho TN gán KH cho đơn cũ") - POST
// /khach-le/gan-don. Chi TN/Admin, don chua tu choi/huy va khong nam trong phieu xuat con hieu luc (dang trong phieu: TN bo don
// khoi phieu truoc, chon "Đơn đã thanh toán" de tien di theo don). Tien da tra cua don chuyen theo sang KH.
export function GanKhachLe({ don, trongPhieu, onDone }: { don: DonHangRow; trongPhieu: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: nhom } = useNhomKhLe();
  const [mo, setMo] = useState(false);
  const [sdt, setSdt] = useState("");
  const [loi, setLoi] = useState("");
  const gan = useMutation({
    mutationFn: () =>
      api.post<{ ok: true; kh: { ma: string; sdt: string | null; moi: boolean }; tien_chuyen_theo: number }>("/khach-le/gan-don", {
        don_hang_id: don.id,
        sdt: sdt.trim() || undefined,
      }),
    onSuccess: () => {
      setMo(false);
      setSdt("");
      setLoi("");
      qc.invalidateQueries({ queryKey: ["khach-le"] });
      qc.invalidateQueries({ queryKey: ["nguoi-directory"] });
      invalidatePipelineCounts(qc);
      onDone();
    },
    onError: (err) => setLoi(describeApiError(err)),
  });
  const laNhom = !!don.nguoi_nhan_hang && !!nhom?.rows.some((r) => r.email && r.email.toLowerCase() === don.nguoi_nhan_hang!.toLowerCase());
  if (!laNhom || ["TN tu choi", "Tu choi", "Da huy"].includes(don.trang_thai_hien_tai ?? "")) return null;
  if (trongPhieu) {
    return <span className="text-[11px] text-[var(--color-text-secondary)]">{t("(đơn đang trong phiếu xuất — bỏ khỏi phiếu trước khi gán KH lẻ)")}</span>;
  }
  if (!mo) {
    return (
      <Btn size="sm" variant="subtle" onClick={() => setMo(true)}>
        {t("Gán KH lẻ")}
      </Btn>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input
        autoFocus
        value={sdt}
        onChange={(e) => {
          setSdt(e.target.value);
          setLoi("");
        }}
        inputMode="tel"
        maxLength={16}
        placeholder={t("SĐT KH (bỏ trống = mã tự động)")}
        className="focus-ring w-[220px] bg-white border border-[var(--line)] rounded-lg px-2 py-1 text-[12px] font-mono"
      />
      <Btn size="sm" variant="subtle" loading={gan.isPending} disabled={gan.isPending} onClick={() => gan.mutate()}>
        {t("Gán")}
      </Btn>
      <Btn size="sm" variant="ghost" onClick={() => setMo(false)}>
        {t("Hủy")}
      </Btn>
      {loi && <span className="w-full text-[11px] font-semibold text-[var(--coral-700)]">{loi}</span>}
    </span>
  );
}
