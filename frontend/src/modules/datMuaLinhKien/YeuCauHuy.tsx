import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { fmtDateTime } from "../../types";
import { formatPersonDisplay, usePersonDirectory } from "../../lib/personDisplay";
import { Modal } from "../../components/ui/Modal";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/x/Badge";
import { t, dichSau } from "../../i18n";
import { describeApiError, invalidatePipelineCounts } from "./helpers";

// YEU CAU HUY DON (chot 2026-11-07, v1.455 — "Cho phép KTV, GS hủy bỏ đơn chưa xuất tuy nhiên sẽ cần sự đồng ý từ bộ phận đang xử lý
// đơn đó"). Backend quyet dinh giai doan (GET /dat-mua-lk/don-hang/:id/huy-don -> phanLoaiHuyDon): huy ngay / can Kho / Mua hang / Ke toan
// dong y / khong huy duoc. Khoi nay o chi tiet don: nguoi tao / nguoi nhan / GS gui yeu cau (khi chua co nut "Hủy đơn" thuong); bo phan
// thay yeu cau dang mo + nut Dong y / Tu choi; nguoi gui rut lai.

export type BoPhanHuy = "kho" | "mua_hang" | "ke_toan";
const TEN_BO_PHAN: Record<BoPhanHuy, string> = { kho: dichSau("Kho"), mua_hang: dichSau("Mua hàng"), ke_toan: dichSau("Kế toán") };
export const tenBoPhanHuy = (b: BoPhanHuy) => t(TEN_BO_PHAN[b]);

interface YeuCauHuyRow {
  id: number;
  nguoi_yeu_cau: string;
  ly_do: string;
  bo_phan: BoPhanHuy;
  giai_doan: string | null;
  trang_thai: "Cho dong y" | "Da dong y" | "Tu choi" | "Da rut";
  ngay_tao: string;
  nguoi_xu_ly: string | null;
  ngay_xu_ly: string | null;
  ghi_chu_xu_ly: string | null;
}
interface HuyDonInfo {
  phan_loai: { huy_duoc: boolean; bo_phan: BoPhanHuy | null; giai_doan: string };
  yeu_cau: YeuCauHuyRow | null;
  lich_su: YeuCauHuyRow[];
  duoc_yeu_cau: boolean;
  duoc_duyet: boolean;
}

const NHAN_KQ: Record<string, string> = { "Da dong y": dichSau("Đã đồng ý hủy"), "Tu choi": dichSau("Bị từ chối"), "Da rut": dichSau("Đã rút yêu cầu") };

/** Nhan nho o danh sach / dong don trong phieu / ticket. */
export function YeuCauHuyChip({ boPhan }: { boPhan?: BoPhanHuy | null }) {
  if (!boPhan) return null;
  return (
    <span title={t("Có yêu cầu hủy đơn đang chờ {a} đồng ý", { a: tenBoPhanHuy(boPhan) })}>
      <Badge tone="danger">{t("⏳ Chờ {a} đồng ý hủy", { a: tenBoPhanHuy(boPhan) })}</Badge>
    </span>
  );
}

export function HuyDonKhoi({
  donId, coNutHuyCu, dongDon, currentEmail, addToast, onDone,
}: {
  donId: string;
  coNutHuyCu: boolean; // nguoi xem da co nut "✕ Hủy đơn" thuong (actionsFor) -> khong hien nut gui yeu cau nua
  dongDon: boolean; // don da dong / tra hang -> khong tai
  currentEmail: string;
  addToast: (m: string) => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const dir = usePersonDirectory();
  const key = ["dat-mua-lk-huy-don", donId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api.get<HuyDonInfo>(`/dat-mua-lk/don-hang/${donId}/huy-don`),
    enabled: !dongDon,
    staleTime: 10_000,
  });
  const [moGui, setMoGui] = useState(false);
  const [moTuChoi, setMoTuChoi] = useState(false);
  const [lyDo, setLyDo] = useState("");
  const xong = (msg: string) => {
    addToast(msg);
    setMoGui(false);
    setMoTuChoi(false);
    setLyDo("");
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
    invalidatePipelineCounts(qc);
    onDone();
  };
  const gui = useMutation({
    mutationFn: () => api.post<{ da_huy: boolean; bo_phan?: BoPhanHuy }>(`/dat-mua-lk/don-hang/${donId}/yeu-cau-huy`, { ly_do: lyDo.trim() }),
    onSuccess: (r) => xong(r.da_huy ? t("Đã hủy đơn") : t("Đã gửi yêu cầu hủy — chờ {a} đồng ý", { a: r.bo_phan ? tenBoPhanHuy(r.bo_phan) : "" })),
    onError: (e) => addToast(t("Lỗi: ") + describeApiError(e)),
  });
  const xuLy = useMutation({
    mutationFn: (v: { hanh_dong: "dong_y" | "tu_choi" | "rut"; ghi_chu?: string }) =>
      api.post(`/dat-mua-lk/yeu-cau-huy/${data!.yeu_cau!.id}/xu-ly`, v),
    onSuccess: (_r, v) => xong(v.hanh_dong === "dong_y" ? t("Đã đồng ý — đơn đã hủy") : v.hanh_dong === "tu_choi" ? t("Đã từ chối yêu cầu hủy") : t("Đã rút yêu cầu hủy")),
    onError: (e) => addToast(t("Lỗi: ") + describeApiError(e)),
  });
  if (dongDon || !data) return null;
  const yc = data.yeu_cau;
  const pl = data.phan_loai;
  const ten = (e: string | null) => (e ? formatPersonDisplay(e, dir) : "");
  const ketQuaGanNhat = data.lich_su[0];

  if (yc) {
    const laNguoiGui = yc.nguoi_yeu_cau === currentEmail;
    return (
      <div className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-3 py-2 text-[12.5px]">
        <div className="font-semibold text-[var(--color-danger-strong)]">
          ⏳ {t("Yêu cầu hủy đơn — chờ {a} đồng ý", { a: tenBoPhanHuy(yc.bo_phan) })}
        </div>
        <div className="mt-0.5 text-[var(--color-text)]">
          <b>{ten(yc.nguoi_yeu_cau)}</b> · {fmtDateTime(yc.ngay_tao)} — {yc.ly_do}
        </div>
        {yc.giai_doan && <div className="text-[var(--color-text-secondary)]">{t("Giai đoạn")}: {yc.giai_doan}</div>}
        {(data.duoc_duyet || laNguoiGui) && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {data.duoc_duyet && (
              <>
                <Btn
                  size="sm"
                  variant="danger"
                  loading={xuLy.isPending}
                  onClick={() => {
                    if (window.confirm(t("Đồng ý hủy đơn này? Đơn sẽ bị hủy ngay, tiền đã thanh toán (nếu có) trả về quỹ dư của KTV."))) xuLy.mutate({ hanh_dong: "dong_y" });
                  }}
                >
                  {t("✓ Đồng ý hủy")}
                </Btn>
                <Btn size="sm" variant="ghost" disabled={xuLy.isPending} onClick={() => setMoTuChoi(true)}>{t("Từ chối||nút")}</Btn>
              </>
            )}
            {laNguoiGui && (
              <Btn size="sm" variant="ghost" disabled={xuLy.isPending} onClick={() => xuLy.mutate({ hanh_dong: "rut" })}>{t("↩ Rút yêu cầu")}</Btn>
            )}
          </div>
        )}
        <Modal open={moTuChoi} onClose={() => setMoTuChoi(false)} title={t("Từ chối yêu cầu hủy")}>
          <div className="space-y-3 text-sm">
            <textarea
              value={lyDo}
              onChange={(e) => setLyDo(e.target.value)}
              rows={3}
              placeholder={t("Lý do từ chối (bắt buộc) — vd hàng đã về / đã đặt với nhà cung cấp")}
              className="focus-ring w-full rounded-lg border border-[var(--line)] px-2.5 py-1.5"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setMoTuChoi(false)}>{t("Đóng")}</Btn>
              <Btn size="sm" disabled={!lyDo.trim()} loading={xuLy.isPending} onClick={() => xuLy.mutate({ hanh_dong: "tu_choi", ghi_chu: lyDo.trim() })}>
                {t("Từ chối||nút")}
              </Btn>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  if (!data.duoc_yeu_cau || coNutHuyCu) {
    if (!ketQuaGanNhat || ketQuaGanNhat.trang_thai !== "Tu choi") return null;
    return (
      <div className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[12px] text-[var(--color-text-secondary)]">
        {t("Yêu cầu hủy gần nhất bị {a} từ chối", { a: tenBoPhanHuy(ketQuaGanNhat.bo_phan) })}
        {ketQuaGanNhat.nguoi_xu_ly && <> ({ten(ketQuaGanNhat.nguoi_xu_ly)}, {fmtDateTime(ketQuaGanNhat.ngay_xu_ly)})</>}
        {ketQuaGanNhat.ghi_chu_xu_ly && <>: <span className="text-[var(--color-text)]">{ketQuaGanNhat.ghi_chu_xu_ly}</span></>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12.5px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-text)]">{t("Hủy đơn")}:</span>{" "}
          {pl.bo_phan ? t("cần {a} đồng ý", { a: tenBoPhanHuy(pl.bo_phan) }) : t("hủy được ngay")} — {pl.giai_doan}
        </div>
        <Btn size="sm" variant="danger" onClick={() => setMoGui(true)}>
          {pl.bo_phan ? t("✕ Gửi yêu cầu hủy") : t("✕ Hủy đơn")}
        </Btn>
      </div>
      {ketQuaGanNhat && (
        <div className="mt-1 text-[11.5px] text-[var(--color-text-secondary)]">
          {t("Lần trước")}: {t(NHAN_KQ[ketQuaGanNhat.trang_thai] ?? ketQuaGanNhat.trang_thai)}
          {ketQuaGanNhat.ghi_chu_xu_ly && <> — {ketQuaGanNhat.ghi_chu_xu_ly}</>}
        </div>
      )}
      <Modal open={moGui} onClose={() => setMoGui(false)} title={pl.bo_phan ? t("Gửi yêu cầu hủy đơn") : t("Hủy đơn")}>
        <div className="space-y-3 text-sm">
          <div className={`rounded-lg border px-2.5 py-1.5 text-[12px] ${pl.bo_phan ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)]"}`}>
            {pl.giai_doan}
            {pl.bo_phan
              ? " — " + t("đơn chỉ bị hủy khi {a} đồng ý; bạn sẽ nhận thông báo kết quả.", { a: tenBoPhanHuy(pl.bo_phan) })
              : " — " + t("đơn bị hủy ngay, tiền đã thanh toán (nếu có) trả về quỹ dư.")}
          </div>
          <textarea
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            rows={3}
            placeholder={t("Lý do hủy (bắt buộc)")}
            className="focus-ring w-full rounded-lg border border-[var(--line)] px-2.5 py-1.5"
          />
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" size="sm" onClick={() => setMoGui(false)}>{t("Đóng")}</Btn>
            <Btn size="sm" variant="danger" disabled={!lyDo.trim()} loading={gui.isPending} onClick={() => gui.mutate()}>
              {pl.bo_phan ? t("Gửi yêu cầu") : t("Hủy đơn")}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
