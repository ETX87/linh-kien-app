import { useEffect, useState } from "react";
import type { AppUser } from "../auth/AuthContext";
import { VIEW_AS_ROLES, type ViewAsRole } from "../auth/viewAsRoles";
import { api } from "../api/client";
import { formatPersonDisplay, usePersonDirectory } from "../lib/personDisplay";

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
  dropdownAlign = "left",
}: {
  role: string;
  user: AppUser;
  realIsAdmin: boolean;
  viewAsRole: ViewAsRole | null;
  // Nut "Xem trước Mobile" (mo iframe gia lap) chi co y nghia tren man hinh desktop that - undefined =
  // an het (dung khi render ben trong Sidebar mobile off-canvas, xem Sidebar.tsx).
  mobilePreviewOpen?: boolean;
  onToggleMobilePreview?: () => void;
  // FIX (phan hoi 2026-09-05: "trên giao diện mobile, ấn vào thông tin tài khoản, UI hiện lỗi") -
  // component nay duoc mount o 2 CHO khac nhau tren mobile voi trigger nam o 2 MEP doi nhau: (1)
  // Sidebar.tsx (off-canvas drawer hep w-64, trigger sat mep TRAI) - "left" (mac dinh, giu dung hanh
  // vi FIX 2026-08-26 truoc do), (2) App.tsx (header chinh full-width, trigger sat mep PHAI man hinh,
  // them 2026-08-27 "muc 7" nhung QUEN doi CSS cho dung context moi) - phai truyen "right" o do, neu
  // khong dropdown w-56 se neo theo "left-0" tu trigger sat mep phai va tran han ra ngoai man hinh.
  dropdownAlign?: "left" | "right";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
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

  // FIX (ra soat bug mua hang 2026-08-26, BUG-004): filter trang thai mac dinh cua Don cua toi/Thieu
  // LK/PXK/Tra hang phu thuoc vai tro (vd Kho -> "Cho kho xu ly") nhung duoc luu localStorage - doi
  // "Xem thu vai tro" chi lam window.location.reload() (xoa QueryClient in-memory) chu KHONG xoa
  // localStorage, nen filter cua vai tro TRUOC do (vd Kho) van con nguyen khi xem thu vai tro MOI (vd
  // TN), sai voi mac dinh dang ky vong. Xoa dung 4 key trang-thai (KHONG dong tay filters:dat-mua-lk-
  // view/filters:dmlk-xem-loai-don... - nhung key do khong phu thuoc vai tro nen khong lien quan bug
  // nay) truoc khi reload, de moi lan xem thu vai tro moi tu tinh lai dung mac dinh theo vai tro do.
  const FILTER_TRANG_THAI_KEYS = ["filters:dmlk-trang-thai", "filters:dmlk-tlk-tt", "filters:dmlk-pxk-tt", "filters:dmlk-th-tt"];
  async function setViewAs(role: ViewAsRole | "") {
    setSwitching(true);
    try {
      await api.post("/auth/view-as", { role: role || null });
      for (const k of FILTER_TRANG_THAI_KEYS) localStorage.removeItem(k);
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
            mobilePreviewOpen ? "bg-white/15 text-white" : "hover:bg-white/10 text-[var(--topbar-fg-dim)]"
          }`}
        >
          📱
        </button>
      )}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setMenuOpen(!menuOpen)} className="focus-ring flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-white/10">
          <div className="w-8 h-8 rounded-full bg-white/15 text-white flex items-center justify-center text-xs font-bold">
            {displayName.trim().split(" ").slice(-1)[0]?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-xs font-semibold leading-tight text-white">{formatPersonDisplay(user.email, personDir)}</div>
            <div className="text-[10px] text-[var(--topbar-fg-dim)] leading-tight">{role}</div>
          </div>
        </button>
        {menuOpen && (
          // FIX (loi hien thi mobile, phat hien qua kiem thu 2026-08-26, mo rong 2026-09-05): dropdown
          // nay TRUOC DAY luon "right-0" - dung tren desktop (TopBar.tsx dat trigger o SAT MEP PHAI 1
          // header rong, xem "ml-auto" o do), nhung SAI khi component nay duoc nhung vao Sidebar
          // off-canvas (hang muc #15) - trigger (avatar, ten bi an qua "hidden sm:block") nam SAT MEP
          // TRAI 1 drawer hep w-64 (256px), "right-0" neo canh phai dropdown vao canh phai cua trigger
          // nho hep do khien dropdown tran GAN HET ra ngoai mep trai man hinh. Doi sang "left-0" cho
          // context do (dropdownAlign="left", mac dinh). NHUNG khi component nay lai duoc mount THEM 1
          // cho nua o App.tsx (header chinh full-width tren mobile, them 2026-08-27 "muc 7") thi trigger
          // nam SAT MEP PHAI man hinh - "left-0" o day khien dropdown w-56 tran han ra ngoai mep PHAI
          // (dung bug trong anh chup 2026-09-05: dropdown bi cat, chi thay 1 dai hep sat mep phai) - App.tsx
          // phai truyen dropdownAlign="right" de dung "right-0" giong desktop. md:left-auto md:right-0
          // luon giu nguyen cho desktop (nguong md=768px khop dung useIsMobile()), khong phu thuoc prop.
          <div
            className={`absolute mt-2 w-56 md:w-64 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-lg py-1.5 anim-in ${
              dropdownAlign === "right" ? "right-0" : "left-0 md:left-auto"
            } md:right-0`}
          >
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
            <button onClick={logout} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 text-[var(--coral-500)]">
              Đăng xuất
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
