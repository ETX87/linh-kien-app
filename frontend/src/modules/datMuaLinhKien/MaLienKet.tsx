import { lazy, Suspense, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ui/Toast";
import { t } from "../../i18n";

// Ma phieu / ma don BAM DUOC o bat ky dau (chuyen tu QuyChuyenTienModule 2026-11-03, v1.434 - "các ID đơn, Id phiếu đều có thể click vào"
// trong lich su xu ly). Tu mo Drawer chi tiet (tai luoi - import dong de khong tao vong import tinh voi PhieuXuatKhoTab/DonCuaToiTab), quyen
// theo tai khoan dang dang nhap (backend van ap pham vi xem).
const PxkDetailModal = lazy(() => import("./PhieuXuatKhoTab").then((m) => ({ default: m.PxkDetailModal })));
const DonHangDetailModal = lazy(() => import("./DonCuaToiTab").then((m) => ({ default: m.DonHangDetailModal })));
const ThieuLkDetailModal = lazy(() => import("./ThieuLkTab").then((m) => ({ default: m.ThieuLkDetailModal })));

const CLS = "code-link font-semibold underline underline-offset-2 hover:opacity-80";

export function MaPhieuLink({ id, nhan, className }: { id: string | null; nhan?: ReactNode; className?: string }) {
  const [mo, setMo] = useState(false);
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const qc = useQueryClient();
  const addToast = useToast();
  if (!id) return <>{nhan ?? "—"}</>;
  return (
    <>
      <button type="button" className={className ?? CLS} title={t("Mở chi tiết phiếu")} onClick={(e) => { e.stopPropagation(); setMo(true); }}>
        {nhan ?? id}
      </button>
      {mo && u && (
        <Suspense fallback={null}>
          <PxkDetailModal
            id={id}
            onClose={() => setMo(false)}
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

export function MaDonLink({ id, nhan, className }: { id: string; nhan?: ReactNode; className?: string }) {
  const [mo, setMo] = useState(false);
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const qc = useQueryClient();
  const addToast = useToast();
  return (
    <>
      <button type="button" className={className ?? CLS} title={t("Mở chi tiết đơn")} onClick={(e) => { e.stopPropagation(); setMo(true); }}>
        {nhan ?? id}
      </button>
      {mo && u && (
        <Suspense fallback={null}>
          <DonHangDetailModal
            id={id}
            onClose={() => setMo(false)}
            addToast={addToast}
            qc={qc}
            canTacNghiep={!!u.la_tac_nghiep}
            canTPDvbhXacNhan={!!u.la_tp_dvbh}
            canActAsTram={false}
            currentEmail={u.email}
            isAdmin={u.vai_tro === "Admin"}
            canXemChiTietCa={false}
            canKho={!!u.la_kho}
          />
        </Suspense>
      )}
    </>
  );
}

/** Ma ticket thieu hang (TLK-…) bam duoc - mo Drawer chi tiet ticket tai cho (v1.542, man "Quá hạn & vi phạm"). */
export function MaTicketLink({ id, nhan, className }: { id: string; nhan?: ReactNode; className?: string }) {
  const [mo, setMo] = useState(false);
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const qc = useQueryClient();
  const addToast = useToast();
  return (
    <>
      <button type="button" className={className ?? CLS} title={t("Mở chi tiết ticket thiếu hàng")} onClick={(e) => { e.stopPropagation(); setMo(true); }}>
        {nhan ?? id}
      </button>
      {mo && u && (
        <Suspense fallback={null}>
          <ThieuLkDetailModal
            id={id}
            onClose={() => setMo(false)}
            addToast={addToast}
            qc={qc}
            canKho={!!u.la_kho}
            canTacNghiep={!!u.la_tac_nghiep}
            currentEmail={u.email}
          />
        </Suspense>
      )}
    </>
  );
}
