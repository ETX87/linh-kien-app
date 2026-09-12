import { useMemo, useState } from "react";
import { usePublicSheetCache, type SheetRow } from "../../lib/publicSheetCache";
import { SheetSyncBar } from "./SheetSyncBar";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ02aMyUHGYZC59csU07jfbzDX0M3vRPipKCN1ZAwhGU6p6JWElulY1GFn5aAAJuAJ3VegHivyEKsfN/pub?gid=1488773788&single=true&output=tsv";
const STORAGE_KEY = "dat-mua-lk-linh-kien-thay-the-cache-v1";

interface ThayTheRow {
  nhom: string;
  ma: string;
  ten: string;
  ghiChu: string;
}

function toRow(r: SheetRow): ThayTheRow {
  return { nhom: r["NHÓM"] ?? "", ma: r["MÃ"] ?? "", ten: r["TÊN"] ?? "", ghiChu: r["GHI CHÚ"] ?? "" };
}

// Tra cuu nhom linh kien thay the cho nhau (yeu cau nguoi dung 2026-08-27, xem lib/publicSheetCache.ts)
// - go ma/ten linh kien HOAC ten nhom, he thong hien TOAN BO cac ma cung nhom (co the dung thay the
// cho nhau khi thieu hang). Khac BomHangTab: o tim kiem rong hien TOAN BO cac nhom ngay (dataset nay
// nho, la danh sach nhom co chu dich - khong dai nhu BOM toan bo model), giup duyet nhanh khong can
// go dung ma.
export function ThayTheTab() {
  const { rows: rawRows, syncedAt, syncing, error, sync } = usePublicSheetCache(STORAGE_KEY, SHEET_URL);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => rawRows.map(toRow), [rawRows]);
  // .normalize("NFC") - xem giai thich day du o components/ui/Select.tsx (cung fix, cung ngay).
  const q = query.trim().toLowerCase().normalize("NFC");

  const matchedGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const r of rows) {
      if (!q || r.nhom.toLowerCase().normalize("NFC").includes(q) || r.ma.toLowerCase().normalize("NFC").includes(q) || r.ten.toLowerCase().normalize("NFC").includes(q)) groups.add(r.nhom);
    }
    return Array.from(groups);
  }, [rows, q]);

  return (
    <div>
      <SheetSyncBar syncedAt={syncedAt} syncing={syncing} error={error} onSync={sync} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Nhập mã/tên linh kiện, hoặc tên nhóm..."
        className="focus-ring w-full max-w-lg bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mb-3"
      />

      {matchedGroups.length === 0 && <div className="text-sm text-[var(--ink-400)] py-6 text-center">Không tìm thấy nhóm linh kiện phù hợp.</div>}

      <div className="space-y-4">
        {matchedGroups.map((nhom) => {
          const group = rows.filter((r) => r.nhom === nhom);
          return (
            <div key={nhom} className="border border-[var(--line)] rounded-xl overflow-hidden">
              <div className="bg-[var(--surface-100)] px-3 py-2 text-sm font-semibold text-[var(--ocean-800)]">
                {nhom}
                <span className="ml-2 text-xs font-normal text-[var(--ink-400)]">({group.length} mã có thể thay thế cho nhau)</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--ink-400)] border-b border-[var(--line)]">
                    <th className="px-3 py-1.5 font-medium">Mã</th>
                    <th className="px-3 py-1.5 font-medium">Tên</th>
                    <th className="px-3 py-1.5 font-medium">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((r, i) => (
                    <tr key={i} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-3 py-1.5 font-mono text-xs">{r.ma}</td>
                      <td className="px-3 py-1.5">{r.ten}</td>
                      <td className="px-3 py-1.5 text-xs text-[var(--ink-600)]">{r.ghiChu || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
