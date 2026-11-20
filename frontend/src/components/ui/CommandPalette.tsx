import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { fetchWithHashCache } from "../../lib/staticListCache";
import { timLk, sapTheoDiem } from "../../lib/timLinhKien";
import { useBoTimLk } from "../../lib/useTimLinhKien";
import { useAuth } from "../../auth/AuthContext";
import { laKtvXemBangGia } from "../../lib/quyenBangGia";
import type { LinhKienRow } from "../../types";
import { Icon } from "./Icon";
import { khopTim } from "../../lib/boDau";
import { t } from "../../i18n";

// Command palette (Ctrl+K / Cmd+K) - moi (concept 1 "Structured Neutral" da duyet, 2026-08-24). Chi
// dieu huong giua cac module/man hinh nguoi dung DANG DUOC PHEP xem (danh sach `items` truyen tu App.tsx,
// da loc theo allowedModules giong het Sidebar.tsx - khong tu tao danh sach song song). Go de loc theo
// nhan (substring, khong phan biet hoa/thuong/dau).
// MO RONG (phan hoi 2026-09-10: "mục tìm kiếm tổng đang bug không tìm được ví dụ DDH-000004") - truoc
// day o day CHI dieu huong module, khong tim du lieu don hang that. Gio khi go >= 3 ky tu, GOI THEM
// GET /dat-mua-lk/search (debounce) va gop ket qua (neu co) vao cuoi danh sach duoi dang 1 nhom rieng
// "Kết quả tra cứu", moi item mang theo `action` (thay vi dieu huong module qua `key`) - onSelect o
// App.tsx phan biet 2 loai qua co/khong co `action`.
// + TIM LINH KIEN (2026-10-29, phan hoi "công cụ tìm kiếm chung đang chưa đúng, muốn tìm mã linh kiện không tìm được"):
// truoc day o nay KHONG tim linh kien. Gio go >= 2 ky tu -> tim TREN MAY (cung bo tim lib/timLinhKien.ts voi Bang gia,
// danh muc "settings-linh-kien" da cache - khong goi server khi go), nhom "Linh kiện" toi da 6 ma (bam = mo drawer thong tin
// LK, action "linh_kien") + dong "Tìm “…” trong Bảng giá" (action "bang_gia", mo Bang gia voi o tim dien san). Ma da doi
// (A -> B) hien ma chuan B. Backend /dat-mua-lk/search them don theo MA LK.
export type CommandAction =
  | { type: "don_hang" | "phieu_xuat_kho" | "thieu_lk" | "thieu_hang_bh"; id: string }
  | { type: "linh_kien"; id: string }
  | { type: "bang_gia"; id: string };
export interface CommandItem {
  key: string;
  label: string;
  icon: string;
  group: string;
  action?: CommandAction;
}

const SEARCH_TYPE_ICON: Record<string, string> = { don_hang: "📄", phieu_xuat_kho: "📦", thieu_lk: "⚠", thieu_hang_bh: "🛠" };
const SEARCH_TYPE_GROUP: Record<string, string> = { don_hang: "Đơn hàng", phieu_xuat_kho: "Phiếu xuất kho", thieu_lk: "Thiếu LK", thieu_hang_bh: "Thiếu hàng bảo hành" };

interface PaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  /** q = tu khoa dang go (de mo module "Bảng giá" voi o tim dien san). */
  onSelect: (item: CommandItem, q: string) => void;
}

// Chi dung bo tim LK khi palette MO (khong dung chi muc ~6000 dong luc dong).
export function CommandPalette(props: PaletteProps) {
  if (!props.open) return null;
  return <PaletteBody {...props} />;
}

function useTimLinhKienPalette(q: string, coBangGia: boolean): CommandItem[] {
  const auth = useAuth();
  const ktvXem = laKtvXemBangGia(auth.status === "authenticated" ? auth.user : null);
  const { data } = useQuery({
    queryKey: ["settings-linh-kien"],
    queryFn: () => fetchWithHashCache<{ rows: LinhKienRow[] }>("settings-linh-kien", "/settings/linh-kien/version", "/settings/linh-kien"),
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const rowsTim = useMemo(() => rows.map((p) => ({ ma: p.ma_linh_kien, ten: p.ten_linh_kien })), [rows]);
  const boTim = useBoTimLk(rowsTim);
  const needle = useDeferredValue(q.trim());
  return useMemo(() => {
    if (needle.length < 2 || rows.length === 0) return [];
    const kq = timLk(boTim, needle);
    if (!kq.diem || kq.diem.size === 0) return [];
    const theoMa = new Map(rows.map((p) => [p.ma_linh_kien, p]));
    // Ma da doi (A -> B): diem chuyen sang ma chuan B.
    const diem = new Map<string, number>();
    for (const [ma, d] of kq.diem) {
      const p = theoMa.get(ma);
      const dich = p?.trang_thai_ma === "Da doi ma" && p.ma_chuan ? p.ma_chuan : ma;
      if (theoMa.has(dich)) diem.set(dich, Math.max(diem.get(dich) ?? 0, d));
    }
    const hien = rows.filter(
      (p) => diem.has(p.ma_linh_kien) && p.trang_thai_ma !== "Da doi ma" && (!ktvXem || (!!p.bat_tat && (p.trang_thai_ma ?? "Da xac nhan") === "Da xac nhan")),
    );
    const sap = sapTheoDiem(hien, (p) => p.ma_linh_kien, diem);
    const nhom = t("Linh kiện");
    const out: CommandItem[] = sap.slice(0, 6).map((p) => {
      const ghi = [!p.bat_tat ? t("Đang tắt") : null, p.trang_thai_ma === "Cho xet duyet" ? t("Chờ xét duyệt") : null].filter(Boolean).join(", ");
      return {
        key: `lk:${p.ma_linh_kien}`,
        label: `${p.ma_linh_kien} — ${p.ten_linh_kien}${ghi ? ` (${ghi})` : ""}`,
        icon: "🔩",
        group: nhom,
        action: { type: "linh_kien", id: p.ma_linh_kien },
      };
    });
    if (coBangGia) {
      out.push({ key: "lk:tat-ca", label: t("Tìm “{q}” trong Bảng giá ({n} kết quả)", { q: needle, n: sap.length }), icon: "🔎", group: nhom, action: { type: "bang_gia", id: needle } });
    }
    return out;
  }, [needle, rows, boTim, ktvXem, coBangGia]);
}

function PaletteBody({ onClose, items, onSelect }: PaletteProps) {
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
    const hen = setTimeout(() => {
      api
        .get<{ results: { type: "don_hang" | "phieu_xuat_kho" | "thieu_lk" | "thieu_hang_bh"; id: string; label: string }[] }>(`/dat-mua-lk/search?q=${encodeURIComponent(needle)}`)
        .then((res) => {
          if (cancelled) return;
          setSearchResults(
            res.results.map((r) => ({ key: `search:${r.type}:${r.id}`, label: r.label, icon: SEARCH_TYPE_ICON[r.type] ?? "🔎", group: t(SEARCH_TYPE_GROUP[r.type] ?? "Kết quả"), action: { type: r.type, id: r.id } })),
          );
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(hen);
    };
  }, [q]);

  const lkResults = useTimLinhKienPalette(q, items.some((it) => it.key === "danh-muc-lk"));
  const filtered = useMemo(() => {
    // .normalize("NFC") - xem giai thich day du o components/ui/Select.tsx (cung fix, cung ngay).
    const needle = q.trim();
    const staticMatches = !needle ? items : items.filter((it) => khopTim(it.label, needle) || khopTim(it.group, needle));
    // Lenh dieu huong khop ten (vd go "bảng") len truoc, roi linh kien, roi don / phieu.
    return needle ? [...staticMatches, ...lkResults, ...searchResults] : staticMatches;
  }, [items, q, searchResults, lkResults]);

  useEffect(() => {
    // setTimeout (khong phai requestAnimationFrame) - doi 1 nhip event-loop de dam bao input da
    // thuc su mount/paint truoc khi focus (body chi mount khi palette mo).
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => setActiveIdx(0), [q]);

  useEffect(() => {
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
          onSelect(it, q.trim());
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, activeIdx, onSelect, onClose, q]);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-[var(--overlay)]" onClick={onClose} />
      <div className="fixed inset-x-0 top-[12vh] z-[60] mx-auto w-full max-w-lg px-3">
        <div className="anim-in bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--line)]">
            <span className="text-[var(--ink-400)]">⌘</span>
            <input
              ref={inputRef}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Tìm mã / tên linh kiện, mã đơn, phiếu, Mã YCSC, tên KTV... (Ctrl K)")}
              className="flex-1 bg-transparent outline-none text-sm text-[var(--ink-900)] placeholder:text-[var(--ink-400)]"
            />
            <kbd className="hidden sm:inline text-[10px] font-semibold text-[var(--ink-400)] border border-[var(--line)] rounded px-1.5 py-0.5">Esc</kbd>
          </div>
          <div className="max-h-[50vh] overflow-y-auto py-1.5">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[var(--ink-400)] text-center">{t("Không tìm thấy kết quả nào khớp.")}</div>
            ) : (
              filtered.map((it, idx) => (
                <button
                  key={it.key}
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => {
                    onSelect(it, q.trim());
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left ${idx === activeIdx ? "bg-[var(--ocean-100)] text-[var(--ocean-900)]" : "text-[var(--ink-700)]"}`}
                >
                  {/* SUA (2026-09-28): item module mang TEN icon ("home"/"cart"... tu navConfig) - truoc day in
                      thang chuoi nay ra man hinh, de len nhan. Ten co trong bo Icon -> ve SVG; con lai (emoji
                      cua ket qua tra cuu) giu nguyen. */}
                  <span className="grid w-5 shrink-0 place-items-center text-[var(--color-text-secondary)]">
                    {it.icon in Icon ? Icon[it.icon as keyof typeof Icon]({ size: 17 }) : it.icon}
                  </span>
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
