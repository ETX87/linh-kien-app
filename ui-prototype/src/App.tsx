import { useEffect, useState } from "react";
import { PersonaProvider } from "./hooks/usePersona";
import { ToastProvider } from "./components/ui/Toast";
import { AppShell, type ViewMode } from "./components/layout/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DatMuaModule } from "./pages/DatMuaModule";
import { ReturnPage } from "./pages/ReturnPage";
import { DanhMucPage } from "./pages/DanhMucPage";
import { TonKhoPage } from "./pages/TonKhoPage";
import { SlaPage } from "./pages/SlaPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(true); // prototype: vao thang, doi persona qua switcher
  const [active, setActive] = useState("trang-chu");
  const [viewMode, setViewMode] = useState<ViewMode>("web");
  // "cong vao" mo Drawer chi tiet tu 1 dong thong bao
  const [openTarget, setOpenTarget] = useState<{ tab: string; id: string; nonce: number } | null>(null);

  useEffect(() => {
    if (!openTarget) return;
    // PXK / Thiếu LK / Mua hàng đều thuộc module "mua-hang"; Trả hàng riêng.
    setActive(openTarget.tab === "tra-hang" ? "tra-hang" : "mua-hang");
  }, [openTarget]);

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />;

  const isMobile = viewMode === "mobile";
  const ext = openTarget ? { tab: openTarget.tab, id: openTarget.id } : null;

  function renderPage() {
    switch (active) {
      case "trang-chu":
        return <DashboardPage mobile={isMobile} onJump={(t) => setActive(t)} />;
      case "mua-hang":
        return <DatMuaModule mobile={isMobile} externalOpen={ext && ext.tab !== "tra-hang" ? ext : null} />;
      case "tra-hang":
        return <ReturnPage mobile={isMobile} externalOpenId={ext?.tab === "tra-hang" ? ext.id : null} />;
      case "danh-muc-lk":
        return <DanhMucPage mobile={isMobile} />;
      case "ton-kho-ktv":
        return <TonKhoPage mobile={isMobile} />;
      case "bao-cao-toc-do":
        return <SlaPage />;
      case "settings":
        return <SettingsPage />;
      case "users":
        return <UsersPage />;
      default:
        return <DashboardPage mobile={isMobile} onJump={(t) => setActive(t)} />;
    }
  }

  return (
    <PersonaProvider>
      <ToastProvider>
        <AppShell
          active={active}
          onNavigate={setActive}
          viewMode={viewMode}
          onToggleViewMode={() => setViewMode((v) => (v === "web" ? "mobile" : "web"))}
          onOpenTarget={(t) => setOpenTarget({ ...t, nonce: Date.now() })}
        >
          {renderPage()}
        </AppShell>
      </ToastProvider>
    </PersonaProvider>
  );
}
