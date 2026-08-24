import type { ReactNode } from "react";
import type { Column } from "./PaginatedTable";

// Tach tu PaginatedTable.tsx (UI redesign 2026-08-21) - phan UI cua 1 o <th> (sap xep/keo doi vi
// tri/keo doi do rong) + nut "⚙ Tuy chinh cot" + panel, dung chung voi useColumnConfig.ts. Tach
// rieng khoi PaginatedTable de DonCuaToiTab (bang tu viet tay, gop nhom theo nguoi nhan hang) dung
// lai duoc CUNG 1 giao dien tuy chinh cot, khong copy lai markup.

export function ColumnSettingsButton<T>({
  toggleableColumns,
  resolvedOrder,
  settingsOpen,
  setSettingsOpen,
  toggleColumn,
}: {
  toggleableColumns: Column<T>[];
  resolvedOrder: string[];
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  toggleColumn: (key: string) => void;
}) {
  return (
    <span className="relative inline-block ml-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setSettingsOpen((v) => !v)}
        className="focus-ring inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--ocean-400)] bg-[var(--ocean-100)] text-[var(--ocean-700)] hover:bg-[var(--ocean-400)] hover:text-white normal-case font-semibold transition-colors"
        title="Chọn cột hiển thị / ẩn bớt, đổi độ rộng, kéo thả sắp xếp cột"
      >
        <span className="text-sm leading-none">⚙</span>
        <span className="hidden sm:inline whitespace-nowrap">Tùy chỉnh cột</span>
      </button>
      {settingsOpen && (
        <div className="absolute left-0 top-full mt-2 w-64 max-h-96 overflow-y-auto bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-lg py-1.5 z-20 anim-in normal-case font-normal">
          <div className="px-3 py-1.5 text-xs text-[var(--ink-600)] border-b border-[var(--line)] mb-1">
            ↔ Kéo đường kẻ giữa 2 tiêu đề để đổi độ rộng · Kéo cả tiêu đề để đổi vị trí cột
          </div>
          <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-400)] uppercase tracking-wide">Cột hiển thị (bỏ tick để ẩn bớt)</div>
          {toggleableColumns.map((tc) => (
            <label key={tc.key} className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--ink-700)] hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={resolvedOrder.includes(tc.key)} onChange={() => toggleColumn(tc.key)} className="w-3.5 h-3.5" />
              {tc.header}
            </label>
          ))}
        </div>
      )}
    </span>
  );
}

export function ResizableHeaderCell<T>({
  col,
  idx,
  isPinned,
  width,
  storageKey,
  dragOverKey,
  setDragOverKey,
  draggedColKey,
  handleColumnDrop,
  handleResizeStart,
  sortable,
  isActive,
  sortDir,
  onSortClick,
  settingsButton,
}: {
  col: Column<T>;
  idx: number;
  isPinned: boolean;
  width: number | undefined;
  storageKey: string | undefined;
  dragOverKey: string | null;
  setDragOverKey: (v: string | null | ((prev: string | null) => string | null)) => void;
  draggedColKey: React.MutableRefObject<string | null>;
  handleColumnDrop: (targetKey: string) => void;
  handleResizeStart: (e: React.MouseEvent, colKey: string, startWidth: number) => void;
  sortable: boolean;
  isActive: boolean;
  sortDir?: "asc" | "desc";
  onSortClick?: () => void;
  settingsButton?: ReactNode;
}) {
  const reorderable = !!storageKey && !isPinned;
  return (
    <th
      style={storageKey ? { width, maxWidth: width, position: "relative" } : undefined}
      className={`py-2.5 px-3 ${col.className ?? ""} ${sortable ? "cursor-pointer select-none hover:text-[var(--ink-600)]" : ""} ${
        reorderable ? "cursor-grab" : ""
      } ${dragOverKey === col.key ? "bg-[var(--ocean-100)]" : ""}`}
      onClick={sortable ? onSortClick : undefined}
      draggable={reorderable}
      onDragStart={reorderable ? (e) => { e.stopPropagation(); draggedColKey.current = col.key; } : undefined}
      onDragOver={
        reorderable
          ? (e) => {
              e.preventDefault();
              if (draggedColKey.current && draggedColKey.current !== col.key) setDragOverKey(col.key);
            }
          : undefined
      }
      onDragLeave={reorderable ? () => setDragOverKey((k) => (k === col.key ? null : k)) : undefined}
      onDrop={reorderable ? (e) => { e.preventDefault(); handleColumnDrop(col.key); } : undefined}
      onDragEnd={reorderable ? () => { draggedColKey.current = null; setDragOverKey(null); } : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {col.header}
        {isActive && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
      </span>
      {idx === 0 && isPinned && storageKey && settingsButton}
      {storageKey && (
        <span
          onMouseDown={(e) => handleResizeStart(e, col.key, width ?? (e.currentTarget.parentElement as HTMLElement).offsetWidth)}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
          className="group absolute top-0 right-0 h-full w-2.5 cursor-col-resize select-none flex items-center justify-center hover:bg-[var(--ocean-100)]"
          title="Kéo để đổi độ rộng cột"
        >
          <span className="w-px h-3/5 bg-[var(--ink-400)] group-hover:bg-[var(--ocean-500)]" />
        </span>
      )}
    </th>
  );
}
