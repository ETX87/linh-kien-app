import type { ReactNode } from "react";
import { Card } from "./Card";
import { Btn } from "./Btn";
import { LoadingInline } from "./LoadingInline";
import { useColumnConfig, type ColumnConfig } from "./useColumnConfig";
import { ColumnSettingsButton, ResizableHeaderCell } from "./ColumnHeader";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  /** Neu co, header cot nay co the bam de sap xep (xem sortBy/sortDir/onSortChange o PaginatedTableProps). */
  sortKey?: string;
  /** Nut loc cot kieu Excel (LocCotButton, components/ui/LocCot.tsx) ve canh tieu de cot tren bang desktop. */
  filter?: ReactNode;
  /** Vai tro dac biet cua cot nay tren THE MOBILE (them 2026-08-21, "hợp nhất phong cách giao diện"
   * - PaginatedTable truoc day chi co bang cuon ngang, khong co layout the doc rieng cho man hinh
   * hep giong DonCuaToiTab). "select" = cot checkbox chon dong (ve o goc the, khong chiem 1 hang
   * rieng); "actions" = cot nut hanh dong (ve thanh 1 hang rieng cuoi the, chiem tron chieu rong).
   * Khong khai bao (mac dinh) = cot du lieu binh thuong, ve thanh 1 hang "nhan: gia tri". Cot co
   * header rong ("" hoac khong co) tu dong duoc coi la "actions" neu khong khai bao rieng. */
  mobileHint?: "select" | "actions";
  /** THE MOBILE GON (them 2026-09-27, ra soat mobile toan he thong): chi can 1 cot trong bang khai bao
   * `mobile` la the chuyen sang bo cuc gon thay cho kieu "nhan: gia tri" moi cot 1 dong (15 cot = the
   * cao ~400px o Danh sach KTV). "title" = dong 1 dam (nhieu cot noi bang " · "), "badge" = goc phai
   * dong 1, "sub" = dong 2 chu phu, "meta" = dong 3 cac cap "Nhan gia tri" ngan, "hide" = khong hien tren
   * the. Cot KHONG khai bao se AN tren the gon (xem day du o chi tiet/ban desktop). Cot select/actions
   * (mobileHint) giu nguyen vi tri cu tru khi dat "hide". */
  mobile?: "title" | "sub" | "badge" | "meta" | "hide";
}

interface PaginatedTableProps<T> {
  /** columns[0] LUON duoc ghim vi tri dau (khong keo/an duoc) - TAT CA cot con lai (columns[1..])
   * deu bat/tat duoc qua "⚙ Tuy chinh cot" (CHOT 2026-08-13: truoc day cac cot nay co dinh, chi
   * optionalColumns moi an/hien duoc - nay mac dinh HIEN nhung nguoi dung van tat duoc, giong dung
   * cach optionalColumns hoat dong, chi khac diem xuat phat mac dinh HIEN thay vi AN). */
  columns: Column<T>[];
  /** Cot bo sung AN mac dinh - nguoi dung tu bat qua nut "⚙" canh cot dau tien (xem settingsGear ben
   * duoi). Chi khac columns[1..] o DIEM XUAT PHAT (AN thay vi HIEN), cung 1 co che bat/tat/keo vi
   * tri sau do. */
  optionalColumns?: Column<T>[];
  /** Cac key trong optionalColumns duoc BAT SAN (hien nhu cot thuong) cho nguoi dung CHUA TUNG tuy
   * chinh bang nay tren may ho (xem hasCustomized trong resolvedOrder) - van la cot "tuy chon" nen
   * nguoi dung van co the tu tat qua "⚙" neu khong can, chi khac cot optional thuong (mac dinh AN)
   * la nhung cot nay mac dinh HIEN. Nguoi dung DA tung tuy chinh (bat/tat/keo BAT KY cot nao) thi GIU
   * NGUYEN lua chon cu, khong ep lai theo danh sach nay nua. */
  defaultVisibleOptionalKeys?: string[];
  rows: T[];
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  rowKey: (row: T) => string | number;
  /** Class bo sung theo tung dong (vd to mau canh bao) - tuy chon, khong truyen thi giu nguyen hanh vi cu. */
  rowClassName?: (row: T) => string;
  /** Sap xep (tuy chon) - chi cot co Column.sortKey moi hien header bam duoc, chi khi onSortChange duoc truyen vao. */
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (sortBy: string, sortDir: "asc" | "desc") => void;
  /** Bat tinh nang keo doi rong tung cot (o mep phai header) + keo doi vi tri cot + chon cot bo
   * sung (khi co optionalColumns) - luu theo key nay vao localStorage cua trinh duyet, CHI luu cuc
   * bo tren may nguoi dung, khong dong bo len server, moi bang (moi "storageKey" khac nhau) nho
   * cau hinh rieng. Bo qua prop nay se giu nguyen hanh vi cu (khong keo/chon cot duoc). */
  storageKey?: string;
  /** Khi truyen vao (component cha tu goi useColumnConfig), PaginatedTable dung state nay thay vi tu
   * quan ly + KHONG tu ve nut "⚙ Tuy chinh cot" trong header cot dau nua - component cha tu dat nut o
   * noi khac (vd FilterSearchBar). SUA LOI UX (phan hoi 2026-08-21: "nút Tùy chỉnh cột khiến table bị
   * trống ra 1 khoảng trông rất xấu") - nut nam trong header cot dau (thuong la cot checkbox HEP)
   * khien trinh duyet tu keo rong ca cot do de vua noi dung nut, de trong 1 khoang lon o than bang
   * ngay duoi no. Neu KHONG truyen, giu hanh vi cu (tu quan ly + tu ve nut trong header) - dung cho
   * cac bang chua can di chuyen nut ra ngoai (vd DanhMucLinhKienModule). */
  columnConfig?: ColumnConfig<T>;
  /** Giao dien the rieng tren mobile (< sm) thay cho kieu mac dinh "nhan: gia tri" moi cot 1 dong -
   * dung khi bang co nhieu cot khien the mobile qua dai/roi (vd PXK). Van giu wrapper bam duoc,
   * rowClassName va o chon (mobileHint "select") - chi thay phan noi dung. */
  mobileCard?: (row: T) => ReactNode;
}

export function PaginatedTable<T>({
  columns,
  optionalColumns = [],
  defaultVisibleOptionalKeys = [],
  rows,
  isLoading,
  isError,
  onRetry,
  page,
  pageSize,
  total,
  onPageChange,
  onRowClick,
  emptyText = "Không có dữ liệu.",
  rowKey,
  rowClassName,
  mobileCard,
  sortBy,
  sortDir,
  onSortChange,
  storageKey,
  columnConfig: externalColumnConfig,
}: PaginatedTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Hook PHAI goi khong dieu kien (rules of hooks) - khi da co externalColumnConfig, truyen storageKey
  // undefined de lam cho lan goi noi bo nay tro nen "tro" (khong doc/ghi localStorage), ket qua cua no
  // bi bo qua ben duoi (uu tien externalColumnConfig).
  const ownColumnConfig = useColumnConfig(columns, optionalColumns, defaultVisibleOptionalKeys, externalColumnConfig ? undefined : storageKey);
  const {
    effectiveColumns, toggleableColumns, resolvedOrder, colWidths,
    settingsOpen, setSettingsOpen, dragOverKey, setDragOverKey, draggedColKey,
    toggleColumn, handleColumnDrop, handleResizeStart,
  } = externalColumnConfig ?? ownColumnConfig;
  // Cot/do rong "tuy chinh duoc" khi CO storageKey (tu quan ly) HOAC component cha da tu quan ly qua
  // externalColumnConfig - dung thay cho kiem tra truc tiep `storageKey` o cac cho render ben duoi.
  const customizable = !!(externalColumnConfig || storageKey);

  function handleSortClick(col: Column<T>) {
    if (!col.sortKey || !onSortChange) return;
    if (sortBy === col.sortKey) {
      onSortChange(col.sortKey, sortDir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(col.sortKey, "asc");
    }
  }

  // KHONG tu ve nut khi da co externalColumnConfig - component cha tu dat nut o noi khac (xem comment
  // prop columnConfig o tren).
  const settingsButton = externalColumnConfig ? null : (
    <ColumnSettingsButton
      toggleableColumns={toggleableColumns}
      resolvedOrder={resolvedOrder}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      toggleColumn={toggleColumn}
    />
  );

  return (
    <Card className="overflow-hidden">
      {/* THE DOC cho mobile (them 2026-08-21, "hợp nhất phong cách giao diện" - truoc day PaginatedTable
          CHI co bang cuon ngang o moi kich thuoc man hinh, khac voi DonCuaToiTab da co san the doc rieng
          cho <640px). Dung LAI effectiveColumns (dung thu tu/an-hien nguoi dung da tuy chinh) - cot
          mobileHint="select" ve o goc the, "actions" (hoac header rong) ve thanh 1 hang cuoi, con lai
          ve "nhan: gia tri". Khong lap lai logic loc/phan trang, chi doi CACH VE 1 dong. */}
      <div className="sm:hidden divide-y divide-[var(--line)]">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={`skeleton-m-${i}`} className="px-3 py-3">
              <div className="h-3.5 rounded bg-slate-100 animate-pulse mb-2" style={{ width: `${50 + ((i * 17) % 40)}%` }} />
              <div className="h-3 rounded bg-slate-100 animate-pulse" style={{ width: `${30 + ((i * 11) % 40)}%` }} />
            </div>
          ))}
        {!isLoading && isError && (
          <div className="py-8 text-center">
            <div className="text-sm text-[var(--coral-500)] font-semibold mb-2">Không tải được dữ liệu.</div>
            {onRetry && <Btn size="sm" variant="ghost" onClick={onRetry}>Thử lại</Btn>}
          </div>
        )}
        {!isLoading && !isError && rows.length === 0 && <div className="py-8 text-center text-[var(--ink-400)] text-sm">{emptyText}</div>}
        {!isLoading &&
          !isError &&
          rows.map((row) => {
            const compact = columns.some((c) => c.mobile && c.mobile !== "hide");
            const selectCol = effectiveColumns.find((c) => c.mobileHint === "select");
            const actionsCol = effectiveColumns.find((c) => c.mobileHint === "actions" || (!c.mobileHint && !c.header && c.key !== selectCol?.key));
            const fieldCols = effectiveColumns.filter((c) => c.key !== selectCol?.key && c.key !== actionsCol?.key);
            return (
              <div
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                // FIX (UX audit 2026-09-08, van de #7): dong bam duoc CHI la <div onClick>, khong
                // the Tab toi hay kich hoat bang ban phim, va trinh doc man hinh khong bao day la 1
                // dieu khien co the bam - them role/tabIndex/onKeyDown de dong bam duoc coi nhu 1
                // button that su. Cac o con (checkbox/nut hanh dong) van stopPropagation binh thuong.
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={`relative px-3 py-2.5 ${onRowClick ? "cursor-pointer active:bg-slate-50 focus-ring" : ""} ${rowClassName?.(row) ?? ""}`}
              >
                <div className={`flex items-start gap-2 ${selectCol ? "pl-6" : ""}`}>
                  {selectCol && <div className="absolute left-3 top-3" onClick={(e) => e.stopPropagation()}>{selectCol.render(row)}</div>}
                  {mobileCard ? (
                    <div className="flex-1 min-w-0">{mobileCard(row)}</div>
                  ) : compact ? (
                    <div className="flex-1 min-w-0">{renderCompactCard(columns, row)}</div>
                  ) : (
                  <div className="flex-1 min-w-0 space-y-1">
                    {fieldCols.map((col) => (
                      <div key={col.key} className="flex items-baseline gap-1.5 text-xs">
                        {col.header ? <span className="text-[var(--ink-400)] shrink-0">{col.header}:</span> : null}
                        <span className="text-[var(--ink-800)] min-w-0">{col.render(row)}</span>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
                {actionsCol && !mobileCard && actionsCol.mobile !== "hide" && (
                  <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                    {actionsCol.render(row)}
                  </div>
                )}
              </div>
            );
          })}
      </div>
      <div className="hidden sm:block overflow-x-auto">
        <table className="tbl dense w-full">
          <thead>
            <tr className="tbl-head">
              {effectiveColumns.map((col, idx) => {
                const isPinned = idx === 0 && col.key === columns[0]?.key;
                const sortable = !!col.sortKey && !!onSortChange;
                const isActive = sortable && sortBy === col.sortKey;
                return (
                  <ResizableHeaderCell
                    key={col.key}
                    col={col}
                    idx={idx}
                    isPinned={isPinned}
                    width={colWidths[col.key]}
                    storageKey={customizable ? (storageKey ?? "external") : undefined}
                    dragOverKey={dragOverKey}
                    setDragOverKey={setDragOverKey}
                    draggedColKey={draggedColKey}
                    handleColumnDrop={handleColumnDrop}
                    handleResizeStart={handleResizeStart}
                    sortable={sortable}
                    isActive={isActive}
                    sortDir={sortDir}
                    onSortClick={() => handleSortClick(col)}
                    settingsButton={settingsButton}
                  />
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={effectiveColumns.length} className="py-4 px-3 text-center">
                  <LoadingInline className="text-sm font-semibold text-[var(--ink-600)] justify-center" />
                </td>
              </tr>
            )}
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-[var(--line)] last:border-0">
                  {effectiveColumns.map((col) => (
                    <td key={col.key} className="py-3 px-3">
                      <div className="h-3.5 rounded bg-slate-100 animate-pulse" style={{ width: `${40 + ((i * 13) % 50)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading && isError && (
              <tr>
                <td colSpan={effectiveColumns.length} className="py-8 text-center">
                  <div className="text-sm text-[var(--coral-500)] font-semibold mb-2">Không tải được dữ liệu.</div>
                  {onRetry && (
                    <Btn size="sm" variant="ghost" onClick={onRetry}>
                      Thử lại
                    </Btn>
                  )}
                </td>
              </tr>
            )}

            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={effectiveColumns.length} className="py-8 text-center text-[var(--ink-400)] text-sm">
                  {emptyText}
                </td>
              </tr>
            )}

            {!isLoading &&
              !isError &&
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={`border-b border-[var(--line)] last:border-0 hover:bg-slate-50 ${onRowClick ? "cursor-pointer focus-ring" : ""} ${rowClassName?.(row) ?? ""}`}
                  onClick={() => onRowClick?.(row)}
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {effectiveColumns.map((col) => {
                    const width = colWidths[col.key];
                    return (
                      <td
                        key={col.key}
                        style={customizable && width ? { width, maxWidth: width, overflow: "hidden" } : undefined}
                        className={`py-2 px-3 ${col.className ?? ""}`}
                      >
                        {col.render(row)}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-[var(--line)] text-xs text-[var(--ink-400)]">
        <span>{total} dòng</span>
        <div className="flex gap-1">
          <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            ‹
          </Btn>
          <span className="px-2 py-1.5">
            {page}/{totalPages}
          </span>
          <Btn variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            ›
          </Btn>
        </div>
      </div>
    </Card>
  );
}

function joinDot(nodes: ReactNode[]): ReactNode[] {
  return nodes.flatMap((n, i) => (i === 0 ? [n] : [<span key={`dot-${i}`} className="text-[var(--color-text-muted)]"> · </span>, n]));
}

// The mobile gon dung chung (xem Column.mobile) - 3 dong: tieu de + badge / dong phu / cac cap "Nhan gia
// tri". Moi dong 1 hang, cat "…" thay vi xuong dong (quy tac bang/the gon DESIGN_GUIDELINES.md §8).
function renderCompactCard<T>(columns: Column<T>[], row: T): ReactNode {
  const by = (m: Column<T>["mobile"]) => columns.filter((c) => c.mobile === m);
  const title = by("title");
  const sub = by("sub");
  const badge = by("badge");
  const meta = by("meta");
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--color-text)]">
          {joinDot(title.map((c) => <span key={c.key}>{c.render(row)}</span>))}
        </div>
        {badge.length > 0 && <div className="flex shrink-0 items-center gap-1">{badge.map((c) => <span key={c.key}>{c.render(row)}</span>)}</div>}
      </div>
      {sub.length > 0 && (
        <div className="truncate text-xs text-[var(--color-text-secondary)]">{joinDot(sub.map((c) => <span key={c.key}>{c.render(row)}</span>))}</div>
      )}
      {meta.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {meta.map((c) => (
            <span key={c.key} className="inline-flex min-w-0 max-w-full items-baseline gap-1">
              <span className="shrink-0 text-[var(--color-text-muted)]">{c.header}</span>
              <span className="min-w-0 truncate text-[var(--color-text-body)]">{c.render(row)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
