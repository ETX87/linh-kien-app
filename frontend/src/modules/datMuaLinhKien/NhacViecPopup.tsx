import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Modal } from "../../components/ui/Modal";
import { Btn } from "../../components/ui/Btn";
import { danhSachViecCanLam, type NotifCounts, type ViecCanLam } from "./viecCanLam";
import { dichSau, t } from "../../i18n";

// Popup "Việc bạn cần xử lý" khi KTV MO APP (2026-11-20, v1.535 - "khi ktv vào app, hiện tại có hiện 1 popup nhắc nhở các đơn tồn cần xử
// lý không? ví dụ 2 phiếu đang chờ bạn chuyển tiền => click vào để xem..." -> "Có, làm luôn"). Nguon = CUNG /notifications/count +
// danhSachViecCanLam() voi o "Cần làm" Trang chu + so menu (viecCanLam.ts) -> 3 cho luon khop so. Them the "Đơn bị từ chối" (choDonBiTuChoi).
// Chi KTV / Ve tinh / NV sua chua thuan (co la_ktv_dvbh / la_ve_tinh, khong vai tro van phong) - nhan vien van phong co so menu + popup
// giai trinh rieng. Bo viec "Đơn của tôi đang chờ duyệt" (chi de biet, KTV khong lam gi duoc).
// "Để sau" = an trong PHIEN mo app nay (sessionStorage) - mo app lai, hoac 1 viec TANG so / viec moi xuat hien thi hien lai.
const KHOA_AN = "nhac-viec-ktv-an";
const BO_QUA = new Set(["don_cua_toi"]);
// Loi rieng cho KTV (de hieu hon nhan o Trang chu).
const NHAN_KTV: Record<string, string> = {
  tien_cua_toi: dichSau("Phiếu chờ bạn chuyển tiền"),
  nhan_hang_cua_toi: dichSau("Phiếu chờ bạn xác nhận đã nhận hàng"),
};

function docAn(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(KHOA_AN) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function NhacViecKtvPopup({ onMo }: { onMo: (v: ViecCanLam) => void }) {
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const laKtv = !!u && u.trang_thai_duyet === "Da duyet" && u.vai_tro !== "Admin" && (!!u.la_ktv_dvbh || !!u.la_ve_tinh);
  const { data } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<NotifCounts>("/notifications/count"),
    enabled: laKtv,
    refetchInterval: 5 * 60_000,
  });
  const [an, setAn] = useState<Record<string, number>>(docAn);
  if (!laKtv || !data?.datMuaLk) return null;

  const viec = danhSachViecCanLam(data, u?.email).filter((v) => !BO_QUA.has(v.key)).map((v) => ({ ...v, label: NHAN_KTV[v.key] ?? v.label }));
  const tuChoi = data.datMuaLk.choDonBiTuChoi ?? 0;
  if (tuChoi > 0) {
    viec.unshift({
      key: "tu_choi",
      label: dichSau("Đơn của bạn bị từ chối — xem lý do"),
      count: tuChoi,
      jump: { tab: "don-cua-toi", filter: "__TU_CHOI_CHUA_XEM__", nguoiNhanHang: "", loaiDon: "all" },
    });
  }
  // Con viec nao vuot so luong luc bam "De sau" thi hien lai.
  const conMoi = viec.some((v) => v.count > (an[v.key] ?? 0));
  if (!viec.length || !conMoi) return null;

  const anDi = () => {
    const moi = Object.fromEntries(viec.map((v) => [v.key, v.count]));
    sessionStorage.setItem(KHOA_AN, JSON.stringify(moi));
    setAn(moi);
  };
  const tong = viec.reduce((n, v) => n + v.count, 0);

  return (
    <Modal
      open
      onClose={anDi}
      title={t("📋 Việc bạn cần xử lý")}
      width="max-w-md"
      footer={
        <div className="flex justify-end">
          <Btn variant="ghost" onClick={anDi}>{t("Để sau")}</Btn>
        </div>
      }
    >
      <div className="space-y-3 text-[14px]">
        <div className="text-[var(--color-text-secondary)]">
          {t("Bạn đang có {n} việc chờ xử lý. Bấm vào từng mục để xem danh sách.", { n: tong })}
        </div>
        <div className="space-y-2">
          {viec.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => { anDi(); onMo(v); }}
              className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors hover:bg-[var(--color-surface-soft)] ${
                v.key === "tu_choi" ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"
              }`}
            >
              <span
                className={`min-w-[36px] h-9 px-2 rounded-lg grid place-items-center font-bold text-[16px] ${
                  v.key === "tu_choi" ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
                }`}
              >
                {v.count}
              </span>
              <span className="flex-1 font-semibold text-[var(--color-text)]">{t(v.label)}</span>
              <span className="text-[var(--color-text-secondary)]">›</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
