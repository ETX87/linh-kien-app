import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../components/ui/Modal";
import { Btn } from "../../components/ui/Btn";
import { Money } from "../../components/ui/Money";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ui/Toast";
import { fmtDateTime, fmtVND } from "../../types";
import { useTenNguoiLog } from "./SharedUi";
import { t } from "../../i18n";

const PxkDetailModal = lazy(() => import("./PhieuXuatKhoTab").then((m) => ({ default: m.PxkDetailModal })));

// Popup LON "Chuyển tiền bị từ chối" cho KTV (chot 2026-11-10, "Khi yêu cầu xác nhận chuyển tiền của KTV bị từ chối => đẩy thông báo về cho ktv +
// tạo 1 popup cảnh báo nhắc nhở rất lớn ... hiện 2 lựa chọn, đã đọc hoặc đến phiếu bị từ chối"). Nguon: GET /phieu-xuat-kho/tu-choi-chuyen-tien-cua-toi
// (phieu CUA TOI bi Ke toan tu choi / TN tra lai bang chung, chua bam Đã đọc - luu o server nen tat tren 1 may la tat moi may). Hoi 60s/lan.
interface Dong {
  id: string; ly_do: string | null; luc: string | null; so_tien_can_chuyen: number | null; da_thanh_toan: number; nguoi_tu_choi: string | null; so_don: number;
}

export function TuChoiChuyenTienPopup() {
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const qc = useQueryClient();
  const addToast = useToast();
  const tenNguoi = useTenNguoiLog();
  const [moPhieu, setMoPhieu] = useState<string | null>(null);
  // ✕ / Esc = an TAM (khong ghi da doc) - mo lai app hoac co tu choi moi thi hien lai.
  const [anTam, setAnTam] = useState("");
  const { data } = useQuery({
    queryKey: ["pxk-tu-choi-chuyen-tien-cua-toi"],
    queryFn: () => api.get<{ rows: Dong[] }>("/phieu-xuat-kho/tu-choi-chuyen-tien-cua-toi"),
    enabled: !!u && u.trang_thai_duyet === "Da duyet",
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const daDoc = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api.post(`/phieu-xuat-kho/${id}/da-doc-tu-choi`, {}))),
    onSettled: () => qc.invalidateQueries({ queryKey: ["pxk-tu-choi-chuyen-tien-cua-toi"] }),
  });
  const ds = data?.rows ?? [];
  const khoa = ds.map((d) => d.id + d.luc).join(",");

  return (
    <>
      {ds.length > 0 && !moPhieu && anTam !== khoa && (
        <Modal
          open
          onClose={() => setAnTam(khoa)}
          title={t("⚠ Thông tin chuyển tiền của bạn đã bị từ chối")}
          width="max-w-xl"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="ghost" loading={daDoc.isPending} disabled={daDoc.isPending} onClick={() => daDoc.mutate(ds.map((d) => d.id))}>
                {t("Đã đọc")}
              </Btn>
              <Btn
                disabled={daDoc.isPending}
                onClick={() => { const id = ds[0].id; daDoc.mutate([id]); setMoPhieu(id); }}
              >
                {ds.length > 1 ? t("Đến phiếu {p}", { p: ds[0].id }) : t("Đến phiếu bị từ chối")}
              </Btn>
            </div>
          }
        >
          <div className="space-y-3 text-[14px] text-[var(--color-text-body)]">
            <div className="rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-4 py-3 text-[15px] font-semibold text-[var(--color-danger)]">
              {ds.length > 1
                ? t("{n} phiếu của bạn bị trả lại bằng chứng chuyển tiền. Kế toán CHƯA ghi nhận số tiền này — hàng sẽ chưa được xuất cho tới khi bạn chuyển lại / bổ sung đúng.", { n: ds.length })
                : t("Bằng chứng chuyển tiền của bạn bị trả lại. Kế toán CHƯA ghi nhận số tiền này — hàng sẽ chưa được xuất cho tới khi bạn chuyển lại / bổ sung đúng.")}
            </div>
            {ds.map((d) => {
              const laTn = (d.ly_do ?? "").startsWith("(TN)");
              const lyDo = (d.ly_do ?? "").replace(/^\(TN\)\s*/, "");
              const conPhai = Math.max(0, (d.so_tien_can_chuyen ?? 0) - d.da_thanh_toan);
              return (
                <div key={d.id} className="rounded-xl border border-[var(--color-border)] px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" className="code-link font-bold underline underline-offset-2" onClick={() => { daDoc.mutate([d.id]); setMoPhieu(d.id); }}>
                      {d.id}
                    </button>
                    <span className="text-[12px] text-[var(--color-text-secondary)]">{d.luc ? fmtDateTime(d.luc) : ""}</span>
                  </div>
                  <div className="mt-1.5 text-[13px]">
                    <b>{laTn ? t("Tác nghiệp trả lại") : t("Kế toán từ chối")}</b>
                    {d.nguoi_tu_choi ? <> ({tenNguoi(d.nguoi_tu_choi)})</> : null}:
                  </div>
                  <div className="mt-1 whitespace-pre-wrap rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[14px] font-medium text-[var(--color-text)]">
                    {lyDo || t("(không ghi lý do)")}
                  </div>
                  <div className="mt-1.5 text-[13px] text-[var(--color-text-secondary)]">
                    {t("{n} đơn · Tổng phiếu", { n: d.so_don })} <Money>{fmtVND(d.so_tien_can_chuyen ?? 0)}</Money>
                    {d.da_thanh_toan > 0 && <> · {t("đã ghi nhận")} <Money>{fmtVND(d.da_thanh_toan)}</Money></>}
                    {" · "}<b className="text-[var(--color-text)]">{t("còn phải chuyển")} <Money>{fmtVND(conPhai)}</Money></b>
                  </div>
                </div>
              );
            })}
            <ul className="list-disc space-y-1 pl-5 text-[13px]">
              <li>{t("Kiểm tra lại số tiền, tài khoản nhận, nội dung chuyển khoản theo lý do trên.")}</li>
              <li>{t("Mở phiếu → bỏ ảnh sai, tải ảnh chuyển khoản đúng (hoặc chuyển bổ sung phần còn thiếu) → bấm \"Đã chuyển\" để gửi Kế toán xác nhận lại.")}</li>
              <li>{t("Ảnh và ghi chú lần trước vẫn được giữ trên phiếu.")}</li>
            </ul>
          </div>
        </Modal>
      )}
      {moPhieu && u && (
        <Suspense fallback={null}>
          <PxkDetailModal
            id={moPhieu}
            onClose={() => setMoPhieu(null)}
            addToast={addToast}
            qc={qc}
            canTacNghiep={!!u.la_tac_nghiep}
            canKho={!!u.la_kho}
            canKeToan={!!u.la_ke_toan}
            canDownloadMisa={false}
            currentEmail={u.email}
            isAdmin={u.vai_tro === "Admin"}
          />
        </Suspense>
      )}
    </>
  );
}
