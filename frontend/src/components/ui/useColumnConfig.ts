import { useEffect, useRef, useState } from "react";
import type { Column } from "./PaginatedTable";

// Tach tu PaginatedTable.tsx (UI redesign 2026-08-21, "hợp nhất phong cách giao diện") - logic
// tuy chinh cot (an/hien/keo doi vi tri/do rong, luu localStorage) truoc day chi song BEN TRONG
// PaginatedTable, khong dung lai duoc cho DonCuaToiTab (bang tu viet tay, khong dung PaginatedTable
// vi can gop nhom theo nguoi nhan hang). Tach thanh hook rieng de CA HAI noi dung CHUNG 1 co che +
// 1 UI "⚙ Tuy chinh cot", khong copy lai logic.

const MIN_COL_WIDTH = 60;

function loadColWidths(storageKey: string | undefined): Record<string, number> {
  if (!storageKey || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`col-widths:${storageKey}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

interface ColConfig {
  order: string[];
  hidden: string[];
}

function loadColumnConfig(storageKey: string | undefined): ColConfig {
  if (!storageKey || typeof window === "undefined") return { order: [], hidden: [] };
  try {
    const raw = window.localStorage.getItem(`col-config:${storageKey}`);
    if (!raw) return { order: [], hidden: [] };
    const parsed = JSON.parse(raw) as { order?: string[]; hidden?: string[] };
    return { order: Array.isArray(parsed.order) ? parsed.order : [], hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [] };
  } catch {
    return { order: [], hidden: [] };
  }
}

function saveColumnConfig(storageKey: string, config: ColConfig) {
  try {
    window.localStorage.setItem(`col-config:${storageKey}`, JSON.stringify(config));
  } catch {
    /* localStorage day/private mode - tinh nang phu, bo qua loi */
  }
}

export type ColumnConfig<T> = ReturnType<typeof useColumnConfig<T>>;

export function useColumnConfig<T>(columns: Column<T>[], optionalColumns: Column<T>[], defaultVisibleOptionalKeys: string[], storageKey: string | undefined) {
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => loadColWidths(storageKey));
  const [colConfig, setColConfig] = useState<ColConfig>(() => loadColumnConfig(storageKey));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const dragState = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const draggedColKey = useRef<string | null>(null);

  useEffect(() => {
    setColWidths(loadColWidths(storageKey));
    setColConfig(loadColumnConfig(storageKey));
  }, [storageKey]);

  useEffect(() => {
    function onClickOutside() {
      setSettingsOpen(false);
    }
    if (settingsOpen) document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [settingsOpen]);

  const pinnedColumn = columns[0];
  const defaultRestColumns = columns.slice(1);
  const columnMap = new Map<string, Column<T>>();
  for (const col of defaultRestColumns) columnMap.set(col.key, col);
  for (const col of optionalColumns) columnMap.set(col.key, col);

  const knownKeys = new Set(columnMap.keys());
  const hasCustomized = colConfig.order.length > 0 || colConfig.hidden.length > 0;
  const hiddenSet = new Set(colConfig.hidden.filter((k) => knownKeys.has(k)));
  let resolvedOrder: string[];
  if (!storageKey) {
    resolvedOrder = defaultRestColumns.map((c) => c.key);
  } else if (!hasCustomized) {
    resolvedOrder = [...defaultRestColumns.map((c) => c.key), ...defaultVisibleOptionalKeys.filter((k) => knownKeys.has(k))];
  } else {
    const savedOrder = colConfig.order.filter((k) => knownKeys.has(k) && !hiddenSet.has(k));
    const missingDefaultKeys = defaultRestColumns.map((c) => c.key).filter((k) => !savedOrder.includes(k) && !hiddenSet.has(k));
    resolvedOrder = [...savedOrder, ...missingDefaultKeys];
  }
  const visibleRestColumns = resolvedOrder.map((k) => columnMap.get(k)).filter((c): c is Column<T> => !!c);
  const effectiveColumns = pinnedColumn ? [pinnedColumn, ...visibleRestColumns] : visibleRestColumns;
  const toggleableColumns = [...visibleRestColumns, ...defaultRestColumns.filter((c) => !resolvedOrder.includes(c.key)), ...optionalColumns.filter((c) => !resolvedOrder.includes(c.key))];

  function persist(next: ColConfig) {
    setColConfig(next);
    if (storageKey) saveColumnConfig(storageKey, next);
  }

  function toggleColumn(key: string) {
    if (resolvedOrder.includes(key)) {
      persist({ order: resolvedOrder.filter((k) => k !== key), hidden: [...colConfig.hidden.filter((k) => k !== key), key] });
    } else {
      persist({ order: [...resolvedOrder, key], hidden: colConfig.hidden.filter((k) => k !== key) });
    }
  }

  function handleColumnDrop(targetKey: string) {
    const draggedKey = draggedColKey.current;
    draggedColKey.current = null;
    setDragOverKey(null);
    if (!draggedKey || draggedKey === targetKey) return;
    const withoutDragged = resolvedOrder.filter((k) => k !== draggedKey);
    const targetIdx = withoutDragged.indexOf(targetKey);
    if (targetIdx === -1) return;
    withoutDragged.splice(targetIdx, 0, draggedKey);
    persist({ order: withoutDragged, hidden: colConfig.hidden });
  }

  function handleResizeStart(e: React.MouseEvent, colKey: string, startWidth: number) {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { key: colKey, startX: e.clientX, startWidth };

    function onMove(ev: MouseEvent) {
      if (!dragState.current) return;
      const { key, startX, startWidth } = dragState.current;
      const next = Math.max(MIN_COL_WIDTH, startWidth + (ev.clientX - startX));
      setColWidths((prev) => ({ ...prev, [key]: next }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dragState.current = null;
      if (!storageKey) return;
      setColWidths((prev) => {
        try {
          window.localStorage.setItem(`col-widths:${storageKey}`, JSON.stringify(prev));
        } catch {
          /* localStorage day/private mode - tinh nang phu, bo qua loi */
        }
        return prev;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return {
    effectiveColumns,
    toggleableColumns,
    resolvedOrder,
    colWidths,
    settingsOpen,
    setSettingsOpen,
    dragOverKey,
    setDragOverKey,
    draggedColKey,
    toggleColumn,
    handleColumnDrop,
    handleResizeStart,
  };
}
