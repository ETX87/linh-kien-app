import type { ReactNode } from "react";

// Danh sach lich su xu ly (log) trong Drawer chi tiet (concept 1, pattern ".timeline") - thay cho
// danh sach text tho truoc day. `items` da theo thu tu hien thi mong muon (khong tu sap xep lai).
export interface TimelineItem {
  title: ReactNode;
  time: ReactNode;
}

export function Timeline({ items, emptyText = "Chưa có lịch sử xử lý." }: { items: TimelineItem[]; emptyText?: string }) {
  if (items.length === 0) return <div className="text-xs text-[var(--ink-400)]">{emptyText}</div>;
  return (
    <div className="border-l-2 border-[var(--line)] pl-3 flex flex-col gap-2.5">
      {items.map((it, i) => (
        <div key={i} className="text-xs">
          <div className="font-semibold text-[var(--ink-800)] text-[12.5px] leading-snug">{it.title}</div>
          <div className="text-[var(--ink-400)] text-[11px] mt-0.5">{it.time}</div>
        </div>
      ))}
    </div>
  );
}
