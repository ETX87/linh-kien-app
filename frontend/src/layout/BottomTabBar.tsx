import { useQuery } from "@tanstack/react-query";
import { NAV_GROUPS } from "./navConfig";
import { api } from "../api/client";

// Bottom tab bar cho mobile (concept 1 "Structured Neutral" da duyet, 2026-08-24) - THEM MOI, khong
// thay the sidebar off-canvas (hamburger) hien co: sidebar van la duong vao qua muc "Thêm ⋯" cuoi
// thanh nay (da xac nhan voi chu he thong, giu nguyen chuc nang cu). Toi da 4 module thuc te hien co
// (xem navConfig.ts) nen KHONG can scroll ngang; neu sau nay allowedModules > 4, cac muc con lai van
// truy cap duoc qua "Thêm ⋯".
const MAX_TABS = 4;

// Cung shape voi Sidebar.tsx - 2 nguon badge doc lap (them ktvLogChuaDoc 2026-08-26, xem
// countKey trong navConfig.ts).
interface NotificationCounts {
  datMuaLk: { total: number };
  ktvLogChuaDoc: number;
}

export function BottomTabBar({ active, setActive, allowedModules, onOpenMore }: { active: string; setActive: (key: string) => void; allowedModules: string[]; onOpenMore: () => void }) {
  const allItems = NAV_GROUPS.flatMap((g) => g.items).filter((i) => allowedModules.includes(i.key));
  const shown = allItems.slice(0, MAX_TABS);
  const hasMore = allItems.length > MAX_TABS;
  // So luong "viec can lam" (phan hoi 2026-08-26: "tiêu đề tab thiếu không hiện số lượng bên cạnh")
  // - Sidebar.tsx da hien so nay dang "(2)" mau xam nhat canh nhan, nhung BottomTabBar (duong vao
  // CHINH tren mobile) truoc gio khong fetch/hien gi ca. Dung CHUNG queryKey voi Sidebar.tsx nen
  // React Query gop chung 1 request (dedupe theo key), khong ton them goi API rieng.
  const { data: counts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<NotificationCounts>("/notifications/count"),
    refetchInterval: 5 * 60_000,
  });

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-[var(--surface)] border-t border-[var(--line)] flex items-stretch" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {shown.map((it) => {
        const count = !it.countKey || !counts ? 0 : it.countKey === "ktvLogChuaDoc" ? counts.ktvLogChuaDoc : counts.datMuaLk.total;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => setActive(it.key)}
            // Phan hoi 2026-08-26: "chọn thẻ nào thì tô màu nền của tab đó lên" - truoc day CHI doi
            // mau chu (text-[var(--ocean-800)]), de nham lan tren man hinh nho. Them nen tot-[var(
            // --ocean-100)] + vien tren mau nhan de PHAN BIET RO tab dang mo, giong pattern active cua
            // Sidebar.tsx (bg-[var(--sidebar-highlight)] + border-l).
            className={`focus-ring flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold border-t-2 transition-colors ${
              active === it.key
                ? "text-[var(--ocean-800)] bg-[var(--ocean-100)] border-[var(--ocean-800)]"
                : "text-[var(--ink-400)] border-transparent"
            }`}
          >
            <span className="relative">
              <span className="text-base leading-none">{it.icon}</span>
              {/* Bam "kieu tin nhan" (phan hoi) - cham do dinh so tron o goc tren-phai icon, KHAC voi
                  "(N)" xam nhat cua Sidebar desktop vi khong gian bottom bar qua hep de dat so canh
                  nhan chu. */}
              {count > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-[3px] rounded-full bg-[var(--coral-600)] text-white text-[9px] font-bold leading-[15px] text-center">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </span>
            <span className="truncate max-w-full px-1">{it.label}</span>
          </button>
        );
      })}
      <button type="button" onClick={onOpenMore} className="focus-ring flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold text-[var(--ink-400)]">
        <span className="text-base leading-none">⋯</span>
        <span>{hasMore ? "Thêm" : "Menu"}</span>
      </button>
    </nav>
  );
}
