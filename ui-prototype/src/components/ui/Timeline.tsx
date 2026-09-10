import type { OrderLog } from "../../types";
import { fmtDateTime } from "../../lib/format";

export function Timeline({ logs }: { logs: OrderLog[] }) {
  return (
    <ol className="relative ml-1.5 border-l border-[var(--color-border)] pl-4">
      {logs.map((l, i) => {
        const last = i === logs.length - 1;
        return (
          <li key={i} className="relative pb-3 last:pb-0">
            <span
              className={`absolute -left-[21px] top-0.5 grid h-3 w-3 place-items-center rounded-full border-2 ${
                last ? "border-[var(--color-primary)] bg-[var(--color-primary)]" : "border-[var(--color-border-strong)] bg-[var(--color-surface)]"
              }`}
            />
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold text-[var(--color-text)]">{l.trangThai}</span>
              <span className="tabular shrink-0 text-[11px] text-[var(--color-text-faint)]">{fmtDateTime(l.ngayXuLy)}</span>
            </div>
            <div className="text-[12px] text-[var(--color-text-secondary)]">
              {l.nguoiXuLy}
              {l.ghiChu ? ` · ${l.ghiChu}` : ""}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
