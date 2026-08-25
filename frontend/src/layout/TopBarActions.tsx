import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AppUser } from "../auth/AuthContext";
import { VIEW_AS_ROLES, type ViewAsRole } from "../auth/viewAsRoles";
import { api } from "../api/client";
import { formatPersonDisplay, usePersonDirectory } from "../lib/personDisplay";

// Tach tu TopBar.tsx (hang muc #15, 2026-08-25: "mobile mặc định bỏ top, ấn menu ở bottom mới hiện")
// - chuong thong bao + avatar/tai khoan gio dung CHUNG duoc o CA TopBar (desktop) lan Sidebar (mobile
// off-canvas, mo qua nut "Thêm" cuoi BottomTabBar) thay vi chi ton tai trong TopBar da bi an han tren
// mobile. Khong doi logic/API goi, chi trich xuat nguyen khoi JSX+state ra component rieng.
interface DatMuaLkBreakdown {
  total: number;
  choTnDuyet: number;
  choTnTraHang: number;
  choKhoThieuLk: number;
  choKhoPxk: number;
  choKhoTraHang: number;
  choKeToanPxk: number;
  choKeToanTraHang: number;
  choQcTraHang: number;
  choTramDuyet: number;
  choTpXacNhan: number;
}

const BUCKET_LABELS: [keyof Omit<DatMuaLkBreakdown, "total">, string, string][] = [
  ["choTnDuyet", "Chờ TN duyệt (mua hàng)", "dat-mua-lk"],
  ["choTpXacNhan", "Chờ TP DVBH xác nhận (linh kiện đặc thù)", "dat-mua-lk"],
  ["choTramDuyet", "Chờ Trạm duyệt (Vệ tinh của bạn)", "dat-mua-lk"],
  ["choKhoThieuLk", "Chờ Kho xử lý thiếu linh kiện", "dat-mua-lk"],
  ["choKhoPxk", "Chờ Kho xử lý PXK", "dat-mua-lk"],
  ["choKeToanPxk", "Chờ Kế toán xử lý PXK", "dat-mua-lk"],
  ["choTnTraHang", "Chờ TN duyệt trả hàng", "tra-hang"],
  ["choKhoTraHang", "Chờ Kho xử lý trả hàng", "tra-hang"],
  ["choKeToanTraHang", "Chờ Kế toán xử lý trả hàng", "tra-hang"],
  ["choQcTraHang", "Chờ QC xác nhận trả hàng", "tra-hang"],
];

export function TopBarActions({
  role,
  user,
  realIsAdmin,
  viewAsRole,
  onNavigate,
  mobilePreviewOpen,
  onToggleMobilePreview,
}: {
  role: string;
  user: AppUser;
  realIsAdmin: boolean;
  viewAsRole: ViewAsRole | null;
  onNavigate?: (module: string) => void;
  // Nut "Xem trước Mobile" (mo iframe gia lap) chi co y nghia tren man hinh desktop that - undefined =
  // an het (dung khi render ben trong Sidebar mobile off-canvas, xem Sidebar.tsx).
  mobilePreviewOpen?: boolean;
  onToggleMobilePreview?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const { data: counts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<{ datMuaLk: DatMuaLkBreakdown }>("/notifications/count"),
    refetchInterval: 5 * 60_000,
  });
  const datMuaLk = counts?.datMuaLk;
  const personDir = usePersonDirectory();

  useEffect(() => {
    function onClickOutside() {
      setMenuOpen(false);
      setNotifOpen(false);
    }
    if (menuOpen || notifOpen) document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [menuOpen, notifOpen]);

  function goTo(module: string) {
    setNotifOpen(false);
    onNavigate?.(module);
  }

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
  const buckets = datMuaLk ? BUCKET_LABELS.filter(([key]) => datMuaLk[key] > 0) : [];

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
        <button
          onClick={() => setNotifOpen(!notifOpen)}
          className="focus-ring relative w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-[var(--ink-600)]"
          title="Việc cần xử lý"
        >
          <span className="bell-shake">🔔</span>
          {(datMuaLk?.total ?? 0) > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--coral-500)]"></span>}
        </button>
        {notifOpen && (
          <div className="absolute right-0 mt-2 w-80 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-lg py-1.5 anim-in">
            <div className="px-3.5 py-2 text-xs font-semibold text-[var(--ink-400)] border-b border-[var(--line)]">Việc cần xử lý</div>
            {buckets.length === 0 ? (
              <div className="px-3.5 py-3 text-sm text-[var(--ink-400)]">Không có việc nào đang chờ.</div>
            ) : (
              buckets.map(([key, label, target]) => (
                <button key={key} onClick={() => goTo(target)} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2">
                  <span>{label}</span>
                  <span className="font-semibold text-[var(--coral-500)] shrink-0">{datMuaLk![key]}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
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
            <button onClick={logout} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 text-[var(--coral-500)]">
              Đăng xuất
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
