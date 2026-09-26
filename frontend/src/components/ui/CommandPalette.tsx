import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";

// Command palette (Ctrl+K / Cmd+K) - moi (concept 1 "Structured Neutral" da duyet, 2026-08-24). Chi
// dieu huong giua cac module/man hinh nguoi dung DANG DUOC PHEP xem (danh sach `items` truyen tu App.tsx,
// da loc theo allowedModules giong het Sidebar.tsx - khong tu tao danh sach song song). Go de loc theo
// nhan (substring, khong phan biet hoa/thuong/dau).
// MO RONG (phan hoi 2026-09-10: "mục tìm kiếm tổng đang bug không tìm được ví dụ DDH-000004") - truoc
// day o day CHI dieu huong module, khong tim du lieu don hang that. Gio khi go >= 3 ky tu, GOI THEM
// GET /dat-mua-lk/search (debounce) va gop ket qua (neu co) vao cuoi danh sach duoi dang 1 nhom rieng
// "Kết quả tra cứu", moi item mang theo `action` (thay vi dieu huong module qua `key`) - onSelect o
// App.tsx phan biet 2 loai qua co/khong co `action`.
export interface CommandItem {
  key: string;
  label: string;
  icon: string;
  group: string;
  action?: { type: "don_hang" | "phieu_xuat_kho" | "thieu_lk"; id: string };
}

const SEARCH_TYPE_ICON: Record<string, string> = { don_hang: "📄", phieu_xuat_kho: "📦", thieu_lk: "⚠" };
const SEARCH_TYPE_GROUP: Record<string, string> = { don_hang: "Đơn hàng", phieu_xuat_kho: "Phiếu xuất kho", thieu_lk: "Thiếu LK" };

export function CommandPalette({ open, onClose, items, onSelect }: { open: boolean; onClose: () => void; items: CommandItem[]; onSelect: (item: CommandItem) => void }) {
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchResults, setSearchResults] = useState<CommandItem[]>([]);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 3) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .get<{ results: { type: "don_hang" | "phieu_xuat_kho" | "thieu_lk"; id: string; label: string }[] }>(`/dat-mua-lk/search?q=${encodeURIComponent(needle)}`)
        .then((res) => {
          if (cancelled) return;
          setSearchResults(
            res.results.map((r) => ({ key: `search:${r.type}:${r.id}`, label: r.label, icon: SEARCH_TYPE_ICON[r.type] ?? "🔎", group: SEARCH_TYPE_GROUP[r.type] ?? "Kết quả", action: { type: r.type, id: r.id } })),
          );
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const filtered = useMemo(() => {
    // .normalize("NFC") - xem giai thich day du o components/ui/Select.tsx (cung fix, cung ngay).
    const needle = q.trim().toLowerCase().normalize("NFC");
    const staticMatches = !needle ? items : items.filter((it) => it.label.toLowerCase().normalize("NFC").includes(needle) || it.group.toLowerCase().normalize("NFC").includes(needle));
    return [...staticMatches, ...searchResults];
  }, [items, q, searchResults]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActiveIdx(0);
      // setTimeout (khong phai requestAnimationFrame) - doi 1 nhip event-loop de dam bao input da
      // thuc su mount/paint truoc khi focus (rAF co the chay truoc khi trinh duyet kip layout trong 1
      // so moi truong), giong pattern "doi 1 frame" nhung dang tin cay hon cho dialog vua mo.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setActiveIdx(0), [q]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = filtered[activeIdx];
        if (it) {
          onSelect(it);
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, activeIdx, onSelect, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-[var(--overlay)]" onClick={onClose} />
      <div className="fixed inset-x-0 top-[12vh] z-[60] mx-auto w-full max-w-lg px-3">
        <div className="anim-in bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--line)]">
            <span className="text-[var(--ink-400)]">⌘</span>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm kiếm hoặc gõ lệnh... (Ctrl K)"
              className="flex-1 bg-transparent outline-none text-sm text-[var(--ink-900)] placeholder:text-[var(--ink-400)]"
            />
            <kbd className="hidden sm:inline text-[10px] font-semibold text-[var(--ink-400)] border border-[var(--line)] rounded px-1.5 py-0.5">Esc</kbd>
          </div>
          <div className="max-h-[50vh] overflow-y-auto py-1.5">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[var(--ink-400)] text-center">Không tìm thấy lệnh nào khớp.</div>
            ) : (
              filtered.map((it, idx) => (
                <button
                  key={it.key}
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => {
                    onSelect(it);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left ${idx === activeIdx ? "bg-[var(--ocean-100)] text-[var(--ocean-900)]" : "text-[var(--ink-700)]"}`}
                >
                  <span className="w-5 text-center shrink-0">{it.icon}</span>
                  <span className="flex-1 min-w-0 truncate">{it.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-[var(--ink-400)] shrink-0">{it.group}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
