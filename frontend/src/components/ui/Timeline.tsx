import type { ReactNode } from "react";

// Danh sach lich su xu ly (log) trong Drawer chi tiet (concept 1, pattern ".timeline") - thay cho
// danh sach text tho truoc day. `items` da theo thu tu hien thi mong muon (khong tu sap xep lai).
export interface TimelineItem {
  title: ReactNode;
  time: ReactNode;
  // "dotClassName" (them - ra soat "giao diện demo không hề giống" 2026-09-09, doi chieu anh demo PXK:
  // moi dong trong Lịch sử xử lý co 1 cham/icon MAU RIENG theo tung trang thai) - QUAY LAI dung y "cham
  // tron nho dau moi dong theo tone trang thai" tung co truoc khi doi sang Timeline (xem git history +
  // TRANG_THAI_DOT_TONE trong constants.ts, truyen thang class Tailwind vao day, khong tinh mau lai o
  // component nay). Optional - bo qua thi ve cham xam trung tinh (--ink-400).
  dotClassName?: string;
}

export function Timeline({ items, emptyText = "Chưa có lịch sử xử lý." }: { items: TimelineItem[]; emptyText?: string }) {
  if (items.length === 0) return <div className="text-xs text-[var(--ink-400)]">{emptyText}</div>;
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${it.dotClassName ?? "bg-[var(--ink-400)]"}`} />
          <div>
            <div className="font-semibold text-[var(--ink-800)] text-[12.5px] leading-snug">{it.title}</div>
            <div className="text-[var(--ink-400)] text-[11px] mt-0.5">{it.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
