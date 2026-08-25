import { useState } from "react";
import { Modal } from "../components/ui/Modal";
import { usePwaInstall, isIosSafari, isStandalonePwa } from "../hooks/usePwaInstall";

// Nut "Cai dat vao man hinh chinh" (hang muc #1, phan hoi 2026-08-26: "chỉ hiện trên mobile", dat
// trong Sidebar mobile off-canvas cung TopBarActions) - CHI render khi CHUA cai dat (isStandalonePwa()
// false luc mount, khong theo doi thay doi realtime vi nguoi dung phai dong/mo lai app moi chuyen
// standalone). Android/Chrome: bam la trigger prompt() that. iOS Safari: khong co API nao tu kich
// hoat duoc - hien Modal huong dan thao tac thu cong (Chia se > Them vao MH chinh).
export function InstallAppButton({ onNavigateAway }: { onNavigateAway?: () => void }) {
  const { available, promptInstall } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (isStandalonePwa()) return null;

  async function handleClick() {
    if (available) {
      await promptInstall();
      onNavigateAway?.();
      return;
    }
    if (isIosSafari()) {
      setShowIosGuide(true);
      return;
    }
    setShowIosGuide(true); // fallback: van hien huong dan chung khi khong bat duoc prompt (vd da tu choi truoc do)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="focus-ring w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-semibold text-[var(--sidebar-ink-mid)] hover:bg-[var(--sidebar-highlight)] hover:text-[var(--sidebar-ink)] transition-colors"
      >
        <span className="w-6 text-center text-base">📲</span>
        <span>Cài đặt vào màn hình chính</span>
      </button>
      {showIosGuide && (
        <Modal open title="📲 Cài đặt vào màn hình chính" onClose={() => setShowIosGuide(false)}>
          <div className="space-y-3 text-sm text-[var(--ink-700)]">
            <p>Trình duyệt này không hỗ trợ cài đặt tự động. Làm theo hướng dẫn thủ công:</p>
            <div className="space-y-1.5 bg-[var(--surface-100)] rounded-lg p-3">
              <div className="font-semibold text-[var(--ocean-800)]">iPhone/iPad (Safari)</div>
              <div>1. Bấm nút Chia sẻ <span className="font-mono">⬆️</span> ở thanh trình duyệt.</div>
              <div>2. Chọn "Thêm vào Màn hình chính" (Add to Home Screen).</div>
            </div>
            <div className="space-y-1.5 bg-[var(--surface-100)] rounded-lg p-3">
              <div className="font-semibold text-[var(--ocean-800)]">Android (Chrome)</div>
              <div>1. Bấm menu ⋮ ở góc trên bên phải.</div>
              <div>2. Chọn "Cài đặt ứng dụng" hoặc "Thêm vào Màn hình chính".</div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
