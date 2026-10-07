import type { ReactNode } from "react";
import { tn } from "../../i18n";

// Dong "nhan: gia tri" trong Drawer chi tiet (concept 1 "Structured Neutral" da duyet, 2026-08-24,
// pattern ".kv") - thay cho cac khoi <div> tu viet rieng le truoc day trong tung Drawer
// (DonHangDetailModal/ThieuLkDetailModal/TraHangDetailModal/PxkDetailModal).
export function KvRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-x-2.5 gap-y-1 text-[12.5px] mb-1 items-baseline">
      <div className="text-[var(--ink-400)]">{tn(label)}</div>
      <div className="text-[var(--ink-900)] min-w-0">{children}</div>
    </div>
  );
}
