import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Btn } from "../../components/ui/Btn";
import { Modal } from "../../components/ui/Modal";
import { HopViPham, MaDoiTuong, conLai, gioTre, ngayGio, type ViPhamRow } from "./ViPhamUi";
import { t } from "../../i18n";

// Popup nhac giai trinh khi MO APP (2026-11-19, v1.529 — "Ca quá hạn sẽ báo đích danh người phải giải trình, và nhắc lại khi còn … giờ là hết hạn
// giải trình. đẩy qua thông báo, khi mở sẽ hiện popup nhắc nhở"). Nguon: GET /vi-pham?tab=can_toi (ca "Cho giai trinh" co ten minh trong
// nguoi_phu_trach — cung tap voi badge / tab "Cần tôi giải trình"). Hoi lai 5 phut / khi quay lai tab.
// "Để sau" = an trong PHIEN mo app nay (sessionStorage) — mo app lai, co ca moi hoac ca chuyen sang "sắp hết hạn" thi hien lai.
const GIO_SAP_HET = 2; // gio lich; khop nguong nhac cua backend (GIO_NHAC = 2 gio lam viec) o muc gan dung
const KHOA_AN = "nhac-giai-trinh-an";

export function NhacGiaiTrinhPopup({ onMoDanhSach }: { onMoDanhSach: () => void }) {
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const vanPhong = !!u && u.trang_thai_duyet === "Da duyet" && (u.vai_tro === "Admin" || (!u.la_ktv_dvbh && !u.la_ve_tinh));
  const { data } = useQuery({
    queryKey: ["vi-pham", "nhac-popup"],
    queryFn: () => api.get<{ rows: ViPhamRow[]; total: number }>("/vi-pham?tab=can_toi&page=1&pageSize=20"),
    enabled: vanPhong,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  const [anKhoa, setAnKhoa] = useState(() => sessionStorage.getItem(KHOA_AN) ?? "");
  const [hop, setHop] = useState<ViPhamRow | null>(null);
  const rows = data?.rows ?? [];
  const tong = data?.total ?? 0;
  const sapHet = rows.filter((r) => {
    const ms = Date.parse(r.han_giai_trinh.replace(" ", "T") + "+07:00") - Date.now();
    return ms <= GIO_SAP_HET * 3_600_000;
  });
  // Khoa = tap ca + ca nao dang "sap het" -> doi thi hien lai.
  const khoa = rows.map((r) => r.id + (sapHet.includes(r) ? "!" : "")).join(",");
  const an = () => {
    sessionStorage.setItem(KHOA_AN, khoa);
    setAnKhoa(khoa);
  };

  if (hop) return <HopViPham r={hop} onClose={() => setHop(null)} />;
  if (!rows.length || anKhoa === khoa) return null;
  return (
    <Modal
      open
      onClose={an}
      title={sapHet.length ? t("⚠ Sắp hết hạn giải trình") : t("⏰ Bạn có ca quá hạn cần giải trình")}
      width="max-w-xl"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Btn variant="ghost" onClick={an}>{t("Để sau")}</Btn>
          <Btn onClick={() => { an(); onMoDanhSach(); }}>{t("Mở danh sách cần giải trình")}</Btn>
        </div>
      }
    >
      <div className="space-y-3 text-[14px] text-[var(--color-text-body)]">
        <div
          className={`rounded-xl border-2 px-4 py-3 text-[15px] font-semibold ${
            sapHet.length
              ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
              : "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-text)]"
          }`}
        >
          {t("Bạn đang có {n} ca quá hạn chờ bạn giải trình.", { n: tong })}
          {sapHet.length > 0 && <> {t("{n} ca sắp hết hạn giải trình.", { n: sapHet.length })}</>}
          <div className="mt-1 text-[13px] font-normal">
            {t("Hết hạn mà chưa giải trình, ca sẽ chuyển sang Tồn CEO (báo đối tác). Ca không thuộc trách nhiệm của bạn: vẫn giải trình, chọn lý do \"Ghi nhận không đúng\".")}
          </div>
        </div>
        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
          {rows.map((r) => {
            const con = conLai(r.han_giai_trinh);
            const gap = sapHet.includes(r);
            return (
              <div
                key={r.id}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${gap ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"}`}
              >
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MaDoiTuong r={r} />
                    <span className="text-[13px] text-[var(--color-text-secondary)]">· {t(r.ten_buoc)} · {t("quá hạn {a}", { a: gioTre(r.so_gio_tre) })}</span>
                  </div>
                  <div className={`text-[12px] ${gap ? "font-semibold text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]"}`}>
                    {t("Hạn giải trình {a}", { a: ngayGio(r.han_giai_trinh) })}
                    {con ? ` (${con})` : ""}
                  </div>
                </div>
                {r.duoc_giai_trinh && (
                  <Btn size="sm" onClick={() => setHop(r)}>{t("Giải trình")}</Btn>
                )}
              </div>
            );
          })}
          {tong > rows.length && (
            <div className="text-center text-[12px] text-[var(--color-text-secondary)]">
              {t("… và {n} ca khác trong danh sách", { n: tong - rows.length })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
