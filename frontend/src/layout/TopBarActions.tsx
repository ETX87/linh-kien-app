import { useEffect, useState } from "react";
import type { AppUser } from "../auth/AuthContext";
import { VIEW_AS_ROLES, type ViewAsRole } from "../auth/viewAsRoles";
import { api } from "../api/client";
import { formatPersonDisplay, usePersonDirectory } from "../lib/personDisplay";
import { ThemeSettingsModal } from "../theme/ThemeSettingsModal";

// Tach tu TopBar.tsx (hang muc #15, 2026-08-25: "mobile mặc định bỏ top, ấn menu ở bottom mới hiện")
// - avatar/tai khoan gio dung CHUNG duoc o CA TopBar (desktop) lan Sidebar (mobile off-canvas, mo qua
// nut "Thêm" cuoi BottomTabBar) thay vi chi ton tai trong TopBar da bi an han tren mobile.
// BO chuong "Việc cần xử lý" (phan hoi 2026-08-26: "bỏ cái chuông ở top... vì đã có giao diện home
// rồi") - trung lap voi khu vuc "Việc cần làm hôm nay" tren TrangChuTab.tsx (man Home moi, da la diem
// vao mac dinh cho MOI vai tro). Du lieu goc (computeDatMuaLkBreakdown/GET /notifications/count) VAN
// giu nguyen o backend - con dung cho badge "Đơn hàng (N)" tren Sidebar/BottomTabBar va nut "Cần làm
// N" trong DatMuaLinhKienModule.tsx, chi bo phan hien thi RIENG o day.
export function TopBarActions({
  role,
  user,
  realIsAdmin,
  viewAsRole,
  mobilePreviewOpen,
  onToggleMobilePreview,
}: {
  role: string;
  user: AppUser;
  realIsAdmin: boolean;
  viewAsRole: ViewAsRole | null;
  // Nut "Xem trước Mobile" (mo iframe gia lap) chi co y nghia tren man hinh desktop that - undefined =
  // an het (dung khi render ben trong Sidebar mobile off-canvas, xem Sidebar.tsx).
  mobilePreviewOpen?: boolean;
  onToggleMobilePreview?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const personDir = usePersonDirectory();

  useEffect(() => {
    function onClickOutside() {
      setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [menuOpen]);

  async function logout() {
    await api.post("/auth/logout");
    window.location.href = "/";
  }

  async function setViewAs(role: ViewAsRole | "") {
    setSwitching(true);
    try {
      await api.post("/auth/view-as", { role: role || null });
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  }

  const displayName = user.ten || user.email;

  return (
    <div className="flex items-center gap-3">
      {realIsAdmin && onToggleMobilePreview && (
        <button
          type="button"
          onClick={onToggleMobilePreview}
          title={mobilePreviewOpen ? "Đóng xem trước Mobile" : "Xem trước giao diện Mobile (test nhanh, không cần thu nhỏ cửa sổ)"}
          className={`focus-ring w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            mobilePreviewOpen ? "bg-[var(--ocean-100)] text-[var(--ocean-800)]" : "hover:bg-slate-100 text-[var(--ink-600)]"
          }`}
        >
          📱
        </button>
      )}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setMenuOpen(!menuOpen)} className="focus-ring flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100">
          <div className="w-8 h-8 rounded-full bg-[var(--ocean-800)] text-white flex items-center justify-center text-xs font-bold">
            {displayName.trim().split(" ").slice(-1)[0]?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="text-left hidden sm:block">
            {/* Quy uoc "Ten (email)" toan he thong (phan hoi 2026-08-25, hang muc #16). */}
            <div className="text-xs font-semibold leading-tight">{formatPersonDisplay(user.email, personDir)}</div>
            <div className="text-[10px] text-[var(--ink-400)] leading-tight">{role}</div>
          </div>
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-lg py-1.5 anim-in">
            <div className="px-3.5 py-2 text-xs text-[var(--ink-400)] border-b border-[var(--line)] truncate">{user.email}</div>
            {realIsAdmin && (
              <div className="px-3.5 py-2.5 border-b border-[var(--line)]" onClick={(e) => e.stopPropagation()}>
                <div className="text-[10px] font-semibold text-[var(--ink-400)] uppercase tracking-wide mb-1">Xem thử vai trò (test)</div>
                <select
                  value={viewAsRole ?? ""}
                  disabled={switching}
                  onChange={(e) => setViewAs(e.target.value as ViewAsRole | "")}
                  className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-md px-2 py-1.5 text-xs font-medium disabled:opacity-60"
                >
                  <option value="">— Admin thật (mặc định) —</option>
                  {VIEW_AS_ROLES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* "Giao diện" (them 2026-08-26) - so thich CA NHAN (chi luu localStorage, xem
                useThemeSettings.ts), nen dat o day (hien cho MOI vai tro) thay vi trong SettingsModule
                von chi Admin vao duoc qua ROLE_MODULES. */}
            <button
              onClick={() => {
                setMenuOpen(false);
                setThemeModalOpen(true);
              }}
              className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 text-[var(--ink-700)]"
            >
              🎨 Giao diện
            </button>
            <button onClick={logout} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 text-[var(--coral-500)]">
              Đăng xuất
            </button>
          </div>
        )}
      </div>
      <ThemeSettingsModal open={themeModalOpen} onClose={() => setThemeModalOpen(false)} />
    </div>
  );
}
