import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import type { ViewAsRole } from "./auth/viewAsRoles";
import { VIEW_AS_LABELS } from "./auth/viewAsRoles";
import { LoginScreen } from "./login/LoginScreen";
import { Sidebar } from "./layout/Sidebar";
import { TopBar } from "./layout/TopBar";
import { BottomTabBar } from "./layout/BottomTabBar";
import { ROLE_MODULES, MODULE_TITLES, NAV_GROUPS } from "./layout/navConfig";
import { DatMuaLinhKienModule } from "./modules/DatMuaLinhKienModule";
import { DanhMucLinhKienModule } from "./modules/DanhMucLinhKienModule";
import { SettingsModule } from "./modules/SettingsModule";
import { UsersModule } from "./modules/UsersModule";
import { api } from "./api/client";
import { useIsMobile } from "./hooks/useMediaQuery";
import { CommandPalette, type CommandItem } from "./components/ui/CommandPalette";

// Shell RUT GON tu frontend/src/App.tsx cua he DVBH goc - he doc lap nay CHI phuc vu 1 mien nghiep
// vu (Dat mua linh kien + Tra hang + Danh muc linh kien + Settings/Users quan tri), nen KHONG con
// CaseDetail/caseStack/openCase (khong co case_dvbh cuc bo - xem CLAUDE.md), khong con GreetingPopup/
// bao cao 08:00/tim kiem case (thuoc mien nghiep vu khac o he goc, khong tach sang day).
const ACTIVE_MODULE_KEY = "dat_mua_lk_active_module";

export function App() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--ink-700)] text-xl font-bold">Đang tải…</div>
      </div>
    );
  }
  if (auth.status === "anonymous") return <LoginScreen variant="login" />;
  if (auth.status === "pending") return <LoginScreen variant="pending" />;
  if (auth.status === "rejected") return <LoginScreen variant="rejected" />;
  if (auth.status === "disabled") return <LoginScreen variant="disabled" />;

  return <MainApp user={auth.user} realIsAdmin={auth.realIsAdmin} viewAsRole={auth.viewAsRole} />;
}

function MainApp({
  user,
  realIsAdmin,
  viewAsRole,
}: {
  user: Extract<ReturnType<typeof useAuth>, { status: "authenticated" }>["user"];
  realIsAdmin: boolean;
  viewAsRole: ViewAsRole | null;
}) {
  const role = user.vai_tro;
  // Tai khoan "chi Dat mua linh kien" - vai_tro=NULL CO CHU DICH (KTV/CTV/Tram/Ve tinh/Kho/Ke toan),
  // dung y giong he goc: khong tham gia mien nghiep vu nao khac, chi vao duoc qua cac co vai tro rieng.
  const laTaiKhoanMuaHangThuanTuy = !role && !!(user.la_ktv_dvbh || user.la_ve_tinh || user.la_kho || user.la_ke_toan || user.la_tac_nghiep || user.la_tp_dvbh);
  let allowedModules = role === "Admin" ? ROLE_MODULES.Admin : role ? (ROLE_MODULES[role] ?? []) : [];
  // Cap them "dat-mua-lk"/"tra-hang" tu dong khi bat 1 trong 6 co "Dat mua linh kien", va
  // "danh-muc-lk" khi bat xem_danh_muc_lk/quan_ly_danh_muc_lk - PHAI khop dung
  // backend/src/middleware/requireDatMuaLkArea.ts + requireQuanLyDanhMucLk.ts (khong co co che dung
  // chung giua 2 codebase Workers/Vite nen phai tu dong bo tay khi doi 1 ben).
  if (role !== "Admin" && (user.la_ktv_dvbh || user.la_ve_tinh || user.la_kho || user.la_ke_toan || user.la_tac_nghiep || user.la_tp_dvbh)) {
    allowedModules = [...new Set([...allowedModules, "dat-mua-lk", "tra-hang"])];
  }
  if (role !== "Admin" && (user.xem_danh_muc_lk || user.quan_ly_danh_muc_lk)) {
    allowedModules = [...new Set([...allowedModules, "danh-muc-lk"])];
  }

  const [active, setActive] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_MODULE_KEY);
    return saved && allowedModules.includes(saved) ? saved : (allowedModules[0] ?? "dat-mua-lk");
  });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  // "Xem truoc Mobile" cho Admin (them 2026-08-24, yeu cau "nút chuyển đổi giữa giao diện mobile và
  // web để test cho nhanh") - CHI Admin that duoc bat (gate o TopBar). Dung IFRAME that (khong phai
  // CSS gia lap) vi Tailwind sm:/md:/useIsMobile() (window.matchMedia) deu doc theo VIEWPORT THAT cua
  // trinh duyet - 1 <div> hep khong lam cac class do doi, chi co iframe (co viewport rieng, cung
  // origin nen tu dong dung chung cookie dang nhap) moi kich hoat dung layout mobile that su.
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  // Command palette (Ctrl+K / Cmd+K, concept 1 "Structured Neutral" da duyet 2026-08-24) - danh sach
  // lenh CHI la cac module nguoi dung dang duoc phep vao (allowedModules, dung LAI y het danh sach
  // Sidebar da loc, khong tao nguon phan quyen thu 2).
  const [commandOpen, setCommandOpen] = useState(false);
  const commandItems: CommandItem[] = useMemo(
    () =>
      NAV_GROUPS.flatMap((g) => g.items.filter((i) => allowedModules.includes(i.key)).map((i) => ({ key: i.key, label: i.label, icon: i.icon, group: g.label }))),
    [allowedModules],
  );
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  // Slot dung chung de DatMuaLinhKienModule "portal" luong quy trinh + nut "Việc của tôi: N" len canh
  // tieu de trang thay vi 1 hang rieng ben duoi - dung y giong he goc.
  const [headerExtraEl, setHeaderExtraEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!allowedModules.includes(active)) setActive(allowedModules[0] ?? "dat-mua-lk");
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem(ACTIVE_MODULE_KEY, active);
  }, [active]);

  if (!role && !laTaiKhoanMuaHangThuanTuy) {
    return <LoginScreen variant="pending" />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        active={active}
        setActive={setActive}
        allowedModules={allowedModules}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Banner "xem thu vai tro" (phan hoi 2026-08-20) - LUON hien khi viewAsRole != null, ke ca
            khi cuon xuong tab khac, de khong bao gio quen minh dang thao tac duoi 1 profile quyen bi
            gioi han (hanh dong ghi that vao DB, khong phai sandbox rieng - xem lib/viewAsPresets.ts). */}
        {viewAsRole && (
          <div className="bg-[var(--amber-500)] text-white text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-3 flex-wrap text-center">
            <span>
              🔍 Admin đang xem/thao tác thử dưới vai trò <strong>{VIEW_AS_LABELS[viewAsRole]}</strong> — mọi hành động vẫn ghi nhận thật vào hệ thống.
            </span>
            <button
              type="button"
              onClick={async () => {
                await api.post("/auth/view-as", { role: null });
                window.location.reload();
              }}
              className="focus-ring underline underline-offset-2 shrink-0"
            >
              Thoát về Admin thật
            </button>
          </div>
        )}
        <TopBar
          role={role ?? "Đặt mua linh kiện"}
          user={user}
          realIsAdmin={realIsAdmin}
          viewAsRole={viewAsRole}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onNavigate={setActive}
          onOpenCommandPalette={() => setCommandOpen(true)}
          mobilePreviewOpen={mobilePreviewOpen}
          onToggleMobilePreview={() => setMobilePreviewOpen((v) => !v)}
        />
        <main className={`p-3 sm:p-5 flex-1 ${isMobile ? "pb-20" : ""}`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              {active !== "dat-mua-lk" && <h1 className="font-display text-lg sm:text-xl font-extrabold text-[var(--ink-900)]">{MODULE_TITLES[active]}</h1>}
              <div ref={setHeaderExtraEl} className="flex items-center gap-2 flex-wrap min-w-0" />
            </div>
          </div>
          {active === "dat-mua-lk" && <DatMuaLinhKienModule headerExtra={headerExtraEl} />}
          {active === "tra-hang" && <DatMuaLinhKienModule forceView="tra-hang" headerExtra={headerExtraEl} />}
          {active === "danh-muc-lk" && <DanhMucLinhKienModule />}
          {active === "settings" && <SettingsModule />}
          {active === "users" && <UsersModule />}
        </main>
      </div>
      {isMobile && <BottomTabBar active={active} setActive={setActive} allowedModules={allowedModules} onOpenMore={() => setMobileOpen(true)} />}
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} items={commandItems} onSelect={setActive} />
      {realIsAdmin && mobilePreviewOpen && (
        <div className="fixed inset-0 z-[100] bg-[rgba(24,24,27,0.65)] flex items-center justify-center p-4 sm:p-8 overflow-auto">
          <div className="relative shrink-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-white text-xs font-semibold">📱 Xem trước Mobile — cửa sổ riêng, cùng phiên đăng nhập</span>
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(false)}
                className="focus-ring text-white text-xs font-semibold underline underline-offset-2 shrink-0"
              >
                ✕ Đóng
              </button>
            </div>
            <div
              className="rounded-[36px] border-[10px] border-[#111113] bg-white shadow-2xl overflow-hidden"
              style={{ width: 390, height: 844, maxHeight: "calc(100vh - 96px)" }}
            >
              <iframe src={window.location.href} title="Xem trước giao diện Mobile" className="w-full h-full border-0" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
