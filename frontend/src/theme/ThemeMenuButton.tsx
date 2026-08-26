import { useState } from "react";
import { ThemeSettingsModal } from "./ThemeSettingsModal";

// Nut mo "Giao diện" dat TRUC TIEP trong menu off-canvas mobile (Sidebar.tsx, canh InstallAppButton) -
// them 2026-08-26 theo phan hoi "ấn vào menu sẽ hiện ra": truoc do CHI vao duoc qua 1 lop nua (bam
// avatar trong TopBarActions moi thay muc "🎨 Giao diện" trong dropdown) - nut nay hien NGAY khi mo
// menu, khong can bam them lan 2. Van GIU NGUYEN muc trong dropdown TopBarActions (dung cho desktop,
// noi khong co menu off-canvas nay).
export function ThemeMenuButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-semibold text-[var(--sidebar-ink-mid)] hover:bg-[var(--sidebar-highlight)] hover:text-[var(--sidebar-ink)] transition-colors"
      >
        <span className="w-6 text-center text-base">🎨</span>
        <span>Giao diện</span>
      </button>
      <ThemeSettingsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
