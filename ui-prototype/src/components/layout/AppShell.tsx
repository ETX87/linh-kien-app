import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BottomTabBar } from "./BottomTabBar";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { usePersona } from "../../hooks/usePersona";

export type ViewMode = "web" | "mobile";

export function AppShell({
  active,
  onNavigate,
  viewMode,
  onToggleViewMode,
  onOpenTarget,
  children,
}: {
  active: string;
  onNavigate: (k: string) => void;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  onOpenTarget: (t: { tab: string; id: string }) => void;
  children: ReactNode;
}) {
  usePersona(); // giu subscribe de re-render khi doi persona
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const isMobile = viewMode === "mobile";

  const shell = (
    <div className={`flex ${isMobile ? "h-full flex-col" : "h-screen"} overflow-hidden bg-[var(--color-background)]`}>
      {!isMobile && (
        <Sidebar active={active} onNavigate={onNavigate} collapsed={collapsed} onToggleCollapse={() => setCollapsed((v) => !v)} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar active={active} mobile={isMobile} onToggleSidebar={() => setCollapsed((v) => !v)} onOpenSearch={() => {}} onOpenTarget={onOpenTarget} />
        <main className="min-h-0 flex-1 overflow-y-auto" style={{ padding: isMobile ? "16px 14px 20px" : "var(--content-pad)" }}>
          {children}
        </main>
        {isMobile && <BottomTabBar active={active} onNavigate={onNavigate} onMore={() => setMoreOpen(true)} moreActive={moreOpen} />}
      </div>

      {/* Mobile: nut thu 5 "Thêm" mo panel menu day du (dark navy, giong sidebar) truot tu duoi len */}
      {isMobile && moreOpen && (
        <div className="absolute inset-0 z-50">
          <div className="absolute inset-0 bg-[rgba(9,30,66,.5)]" onClick={() => setMoreOpen(false)} />
          <div className="sheet-in absolute inset-x-0 bottom-0 top-10 flex flex-col overflow-hidden rounded-t-2xl">
            <Sidebar active={active} onNavigate={onNavigate} collapsed={false} onToggleCollapse={() => {}} mobile onCloseMobile={() => setMoreOpen(false)} />
            <div className="shrink-0 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg-to)] px-3 py-2.5">
              <PersonaSwitcher onDark />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative min-h-screen">
      {/* Nut chuyen Web / Mobile - prototype-only, goc duoi trai */}
      <button
        onClick={onToggleViewMode}
        className="focus-ring fixed bottom-4 left-4 z-[70] flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-bold shadow-pop"
      >
        {isMobile ? "🖥️ Bản Web" : "📱 Bản Mobile"}
      </button>

      {isMobile ? (
        <div className="flex min-h-screen items-center justify-center bg-[#e9edf3] p-6">
          <div className="relative overflow-hidden rounded-[40px] border-[10px] border-[#0d1524] bg-black shadow-2xl" style={{ width: 390, height: 844 }}>
            <div className="relative h-full w-full overflow-hidden rounded-[30px] bg-[var(--color-background)]">{shell}</div>
          </div>
        </div>
      ) : (
        shell
      )}
    </div>
  );
}
