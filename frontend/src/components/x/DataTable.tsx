import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
  hideBelow?: number; // px - an cot khi container hep hon (dung cho mobile card thi khong dung bang)
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  selectable,
  selected,
  onToggle,
  onToggleAll,
  onRowClick,
  rowAccent,
  emptyText = "Không có dữ liệu.",
  minWidth = 1060,
}: {
  columns: Column<T>[];
  rows: T[];
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  onRowClick?: (row: T) => void;
  rowAccent?: (row: T) => boolean;
  emptyText?: string;
  minWidth?: number;
}) {
  const allChecked = selectable && rows.length > 0 && rows.every((r) => selected?.has(r.id));
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <table className="w-full border-collapse text-[13px]" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-soft)] text-left text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {selectable && (
              <th className="w-9 px-3 py-2.5">
                <input type="checkbox" checked={!!allChecked} onChange={onToggleAll} className="h-3.5 w-3.5 accent-[var(--color-primary)]" />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-3 py-2.5" style={{ width: c.width, textAlign: c.align ?? "left" }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-10 text-center text-[var(--color-text-secondary)]">
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const accent = rowAccent?.(r);
            return (
              <tr
                key={r.id}
                onClick={() => onRowClick?.(r)}
                className={`border-b border-[var(--color-border)] last:border-0 transition-colors hover:bg-[var(--color-surface-hover)] ${onRowClick ? "cursor-pointer" : ""} ${
                  accent ? "bg-[#fff8ec]" : ""
                }`}
              >
                {selectable && (
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={!!selected?.has(r.id)} onChange={() => onToggle?.(r.id)} className="h-3.5 w-3.5 accent-[var(--color-primary)]" />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-3" style={{ height: "var(--row-h)", textAlign: c.align ?? "left" }}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
