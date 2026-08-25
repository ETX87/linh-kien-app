import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AppUser } from "../auth/AuthContext";
import { VIEW_AS_ROLES, type ViewAsRole } from "../auth/viewAsRoles";
import { api } from "../api/client";

// Rut gon manh tu frontend/src/layout/TopBar.tsx cua he DVBH goc - bo GlobalSearch (khong co
// case_dvbh cuc bo o he nay, tra cuu case qua MaYeuCauSuCoCheck.tsx rieng trong tung form), bo
// Greeting/bao cao 08:00 (thuoc mien nghiep vu khac, khong tach sang day), bo nut doi giao dien
// (khong port ThemeModule - xem CLAUDE.md).
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

export function TopBar({
  role,
  user,
  realIsAdmin,
  viewAsRole,
  onOpenMobileMenu,
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
  onOpenMobileMenu: () => void;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const { data: counts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<{ datMuaLk: DatMuaLkBreakdown }>("/notifications/count"),
    refetchInterval: 5 * 60_000,
  });
  const datMuaLk = counts?.datMuaLk;

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

  // Reload trang thay vi tu invalidate tung react-query key (co ~15+ key rai rac khap module) -
  // don gian hon nhieu va dam bao KHONG con state cu (badge/danh sach) lan tu profile quyen truoc,
  // chap nhan duoc vi day la thao tac Admin chu dong bat/tat de test, khong phai hot-path thuong xuyen.
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
    <header className="h-16 bg-[var(--topbar-bg)] border-b border-[var(--line)] flex items-center gap-4 px-5 sticky top-0 z-30">
      <button onClick={onOpenMobileMenu} className="focus-ring md:hidden w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-[var(--ink-600)] shrink-0">
        ☰
      </button>
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="focus-ring hidden sm:flex items-center gap-2 w-full max-w-sm px-3 py-1.5 rounded-lg border border-[var(--line)] text-sm text-[var(--ink-400)] hover:border-[var(--ink-400)] transition-colors"
      >
        <span>🔍</span>
        <span className="flex-1 text-left">Tìm kiếm hoặc gõ lệnh...</span>
        <kbd className="text-[10px] font-semibold border border-[var(--line)] rounded px-1.5 py-0.5">Ctrl K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-3">
        {realIsAdmin && (
          <button
            type="button"
            onClick={onToggleMobilePreview}
            title={mobilePreviewOpen ? "Đóng xem trước Mobile" : "Xem trước giao diện Mobile (test nhanh, không cần thu nhỏ cửa sổ)"}
            className={`focus-ring w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              mobilePreviewOpen ? "bg-[var(--indigo-100)] text-[var(--indigo-600)]" : "hover:bg-slate-100 text-[var(--ink-600)]"
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
            <div className="w-8 h-8 rounded-full bg-[var(--indigo-600)] text-white flex items-center justify-center text-xs font-bold">
              {displayName.trim().split(" ").slice(-1)[0]?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-semibold leading-tight">{displayName}</div>
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
    </header>
  );
}
