import { useEffect, type ReactNode } from "react";
import { pushOverlayClose } from "../../lib/overlayStack";
import { t, tn } from "../../i18n";

// UI redesign (phan hoi Codex 2026-08-19, muc P2 "Doi Detail Modal sang Drawer"): component RIENG
// (khong sua Modal.tsx dung chung 40 noi trong 12 file) - copy dung pattern PartDetailDrawer da co san
// va da qua kiem thu (DanhMucLinhKienModule.tsx), chi tong quat hoa thanh props giong het Modal (open/
// title/onClose/width/footer/headerExtra) de cac noi dang dung Modal chuyen sang Drawer chi can doi
// ten the, khong phai viet lai JSX ben trong. Truot tu canh phai (.drawer-in, xem tokens.css) thay vi
// mo giua man hinh - phu hop luong "duyet qua nhieu dong lien tiep" (co Next/Previous o header) vi
// danh sach ben duoi/canh van con nhin thay duoc khi drawer mo, khong che het man hinh nhu Modal giua.
// Drawer "xem chi tiet" rong (phan hoi 2026-09-28: "kéo rộng diện tích hiển thị của UI xem phiếu và
// xem đơn, chiếm 2/3 diện tích hiển thị trên web") - desktop (>= lg 1024px) chiem 2/3 chieu ngang man
// hinh; tablet giu max-w-2xl nhu cu, mobile van full-width (w-full mac dinh cua Drawer).
export const DRAWER_WIDTH_CHI_TIET = "max-w-2xl lg:max-w-none lg:w-2/3";

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-[492px]",
  footer,
  headerExtra,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
  headerExtra?: ReactNode;
}) {
  // Phase 4 (phim tat, phan hoi Codex 2026-08-19 roadmap goc): Esc dong Drawer - hanh vi nen tang cho
  // moi dialog, ap dung o day (KHONG sua Modal.tsx, tranh dung cham 40 noi dung Modal) vi Drawer moi
  // chi co 2 noi dung (DonHangDetailModal/PxkDetailModal), rui ro thap.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Nut Back cua he dieu hanh (mobile) dong Drawer nay truoc, thay vi thoat thang app (phan hoi
  // 2026-08-28) - dang ky/go dang ky voi ngan xep dung chung, xem overlayStack.ts + useExitConfirm.ts.
  useEffect(() => {
    if (!open) return;
    return pushOverlayClose(onClose);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px]" onClick={onClose} />
      <div className={`drawer-in fixed inset-y-0 right-0 z-50 w-full ${width} bg-[var(--surface)] shadow-[var(--shadow-drawer)] flex flex-col`}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--color-border-soft)] shrink-0">
          <h3 className="text-base font-bold text-[var(--color-text)] truncate">{tn(title)}</h3>
          <div className="flex items-center gap-2 shrink-0">
            {headerExtra}
            <button onClick={onClose} aria-label={t("Đóng")} className="focus-ring w-10 h-10 sm:w-8 sm:h-8 rounded-[var(--radius-btn)] hover:bg-[var(--color-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-text-body)]">
              ✕
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
        {/* pb cong safe-area (2026-09-29): tren iPhone nut o chan Drawer khong bi thanh Home che/de sat. */}
        {footer && <div className="border-t border-[var(--color-border-soft)] bg-[var(--surface)] px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shrink-0">{footer}</div>}
      </div>
    </>
  );
}

// Mobile (2026-09-29): nut ‹ › ✕ cao 40px (DESIGN_GUIDELINES §3 vung cham toi thieu 40x40), desktop giu co cu.
// Nut Next/Previous dung CHUNG cho moi Drawer co danh sach dieu huong (DonHangDetailModal,
// PxkDetailModal) - disabled khi khong con dong truoc/sau trong TRANG DANG XEM (khong tu dong sang
// trang ke, giu don gian vi danh sach da phan trang server-side, xem comment goi noi dung).
export function DrawerNavButtons({ hasPrev, hasNext, onPrev, onNext }: { hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev}
        title={t("Dòng trước")}
        className="focus-ring w-9 h-10 sm:w-7 sm:h-8 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-[var(--ink-500)]"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext}
        title={t("Dòng sau")}
        className="focus-ring w-9 h-10 sm:w-7 sm:h-8 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-[var(--ink-500)]"
      >
        ›
      </button>
    </div>
  );
}

// Phim tat ←/→ cho dieu huong dong truoc/sau (Phase 4, phan hoi Codex 2026-08-19 roadmap goc) - opt-in
// rieng (khong gop chung vao Drawer) vi khong phai Drawer nao cung co danh sach de dieu huong, va 1
// Drawer co the muon tu xu ly phim mui ten cho noi dung khac (vd carousel anh) thay vi chuyen dong.
// Bo qua khi dang go trong input/textarea/select (tranh cuop phim mui ten luc sua ghi chu/tim kiem).
export function useDrawerArrowNav({
  hasPrev, hasNext, onPrev, onNext,
}: { hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      else if (e.key === "ArrowRight" && hasNext) onNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasPrev, hasNext, onPrev, onNext]);
}
