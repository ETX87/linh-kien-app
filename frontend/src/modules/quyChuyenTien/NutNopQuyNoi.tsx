import { lazy, Suspense, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { t } from "../../i18n";

// Form tai lazy - keo theo OCR doc tien anh, chi tai khi bam.
const NopTienForm = lazy(() => import("./NopTienQuy").then((m) => ({ default: m.NopTienForm })));

// Nut tron NOI "Nạp quỹ" canh nut chat Hoi dap (2026-10-30, v1.426 - "thêm quỹ cho ktv hoặc gs tạo 1 nút tròn nổi bên cạnh nút chat để ktv truy
// cập nhanh việc nạp quỹ"): bam = mo thang form KTV nop tien vao quy (NopTienForm, POST /quy-ktv/nop-tien), khong can vao menu Quỹ. Chi hien cho
// nguoi duoc nop tien = KTV / Ve tinh / GS, tru Ke toan/Admin - KHOP coTheNopTien (QuyChuyenTienModule.tsx) va duocNopTien backend (quyKtv.ts).
// Vi tri: goc duoi phai (desktop right-5 bottom-28, mobile right-3 bottom 9rem) - cho cua nut chat Hoi dap cu (da xoa 2026-11-17, v1.516).
export function NutNopQuyNoi() {
  const auth = useAuth();
  const isMobile = useIsMobile();
  const [mo, setMo] = useState(false);
  const u = auth.status === "authenticated" ? auth.user : null;
  const duocNop = !!u && u.vai_tro !== "Admin" && !u.la_ke_toan && (!!u.la_ktv_dvbh || !!u.la_ve_tinh || u.vai_tro === "Giam sat" || u.vai_tro === "QC");
  if (!duocNop) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setMo(true)}
        title={t("Nạp tiền vào quỹ")}
        aria-label={t("Nạp tiền vào quỹ")}
        className={`focus-ring fixed z-40 grid h-[52px] w-[52px] place-items-center rounded-full border border-[var(--color-primary)] bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[var(--shadow-raise)] transition-transform hover:scale-105 hover:bg-[var(--color-primary-soft)] ${
          isMobile ? "right-3 bottom-[calc(9rem+env(safe-area-inset-bottom))]" : "right-5 bottom-28"
        }`}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          <path d="M21 9h-5a3 3 0 0 0 0 6h5z" />
          <path d="M8 8v6M5 11h6" />
        </svg>
        <span className="pointer-events-none absolute -bottom-4 whitespace-nowrap rounded bg-[var(--color-surface)] px-1 text-[10px] font-semibold leading-tight text-[var(--color-primary)]">
          {t("Nạp quỹ")}
        </span>
      </button>
      {mo && (
        <Suspense fallback={null}>
          <NopTienForm onClose={() => setMo(false)} />
        </Suspense>
      )}
    </>
  );
}
