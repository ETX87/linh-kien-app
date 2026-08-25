import type { AppUser } from "../auth/AuthContext";
import type { ViewAsRole } from "../auth/viewAsRoles";
import { TopBarActions } from "./TopBarActions";

// Rut gon manh tu frontend/src/layout/TopBar.tsx cua he DVBH goc - bo GlobalSearch (khong co
// case_dvbh cuc bo o he nay, tra cuu case qua MaYeuCauSuCoCheck.tsx rieng trong tung form), bo
// Greeting/bao cao 08:00 (thuoc mien nghiep vu khac, khong tach sang day), bo nut doi giao dien
// (khong port ThemeModule - xem CLAUDE.md).
// FIX (phan hoi 2026-08-25, hang muc #15): TopBar gio CHI render tren desktop (App.tsx bao boc
// `{!isMobile && <TopBar .../>}`) - da bo han nut hamburger (☰) va prop onOpenMobileMenu (chet, mobile
// khong con duong nao goi toi component nay nua). Chuong thong bao + avatar/tai khoan trich sang
// TopBarActions.tsx de dung LAI duoc ben trong Sidebar.tsx (mobile off-canvas, mo qua nut "Thêm" cuoi
// BottomTabBar - xem hang muc #8, gio da hop nhat lam 1 voi #15).
export function TopBar({
  role,
  user,
  realIsAdmin,
  viewAsRole,
  onNavigate,
  onOpenCommandPalette,
  mobilePreviewOpen,
  onToggleMobilePreview,
}: {
  role: string;
  user: AppUser;
  // "Xem thu vai tro" (phan hoi 2026-08-20) - CHI Admin that (realIsAdmin, khong doi khi dang "xem
  // thu") moi thay duoc dropdown nay, de luon co duong quay lai du dang gia lap vai tro gi (nav
  // sidebar co the da an het muc "He thong" luc do - xem App.tsx allowedModules).
  realIsAdmin: boolean;
  viewAsRole: ViewAsRole | null;
  onNavigate?: (module: string) => void;
  // Command palette (concept 1, 2026-08-24) - o "tim kiem" o day chi la 1 NUT MO palette that (dat tai
  // App.tsx), khong tu xu ly tim kiem tai day.
  onOpenCommandPalette: () => void;
  // Nut "Xem truoc Mobile" (them 2026-08-24, chu he thong yeu cau "nút chuyển đổi giữa giao diện
  // mobile và web để test cho nhanh") - CHI Admin that (giong dropdown "Xem thu vai tro" o duoi), mo
  // 1 khung dien thoai that (iframe, xem App.tsx) thay vi tu resize cua so trinh duyet.
  mobilePreviewOpen: boolean;
  onToggleMobilePreview: () => void;
}) {
  return (
    <header className="h-16 bg-[var(--topbar-bg)] border-b border-[var(--line)] flex items-center gap-4 px-5 sticky top-0 z-30">
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="focus-ring flex items-center gap-2 w-full max-w-sm px-3 py-1.5 rounded-lg border border-[var(--line)] text-sm text-[var(--ink-400)] hover:border-[var(--ink-400)] transition-colors"
      >
        <span>🔍</span>
        <span className="flex-1 text-left">Tìm kiếm hoặc gõ lệnh...</span>
        <kbd className="text-[10px] font-semibold border border-[var(--line)] rounded px-1.5 py-0.5">Ctrl K</kbd>
      </button>
      <div className="ml-auto">
        <TopBarActions
          role={role}
          user={user}
          realIsAdmin={realIsAdmin}
          viewAsRole={viewAsRole}
          onNavigate={onNavigate}
          mobilePreviewOpen={mobilePreviewOpen}
          onToggleMobilePreview={onToggleMobilePreview}
        />
      </div>
    </header>
  );
}
