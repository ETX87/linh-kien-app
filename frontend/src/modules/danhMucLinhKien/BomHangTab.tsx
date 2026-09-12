import { useMemo, useState } from "react";
import { usePublicSheetCache, type SheetRow } from "../../lib/publicSheetCache";
import { SheetSyncBar } from "./SheetSyncBar";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ02aMyUHGYZC59csU07jfbzDX0M3vRPipKCN1ZAwhGU6p6JWElulY1GFn5aAAJuAJ3VegHivyEKsfN/pub?gid=1789335988&single=true&output=tsv";
const STORAGE_KEY = "dat-mua-lk-bom-hang-cache-v1";
const MAX_GROUPS_SHOWN = 30;

interface BomRow {
  maModel: string;
  model: string;
  maLinhKien: string;
  tenLinhKien: string;
  soLuong: string;
}

function toBomRow(r: SheetRow): BomRow {
  return {
    maModel: r["MÃ MODEL"] ?? "",
    model: r["MODEL"] ?? "",
    maLinhKien: r["MÃ LINH KIỆN"] ?? "",
    tenLinhKien: r["TÊN LINH KIỆN"] ?? "",
    soLuong: r["SỐ LƯỢNG"] ?? "",
  };
}

// Tra cuu Bang ke vat tu (BOM) tu Google Sheet cong khai (yeu cau nguoi dung 2026-08-27, xem
// lib/publicSheetCache.ts) - tra cuu 2 CHIEU trong 1 o tim kiem duy nhat: go ma/ten Model se ra TOAN
// BO linh kien cau thanh model do; go ma/ten linh kien se ra danh sach Model nao dung no. Uu tien khop
// THEO MODEL truoc (neu co khop) - day la huong tra cuu chinh (BOM = bill of material CUA 1 model),
// chi roi xuong tra theo linh kien khi khong co Model nao khop tu khoa.
export function BomHangTab() {
  const { rows: rawRows, syncedAt, syncing, error, sync } = usePublicSheetCache(STORAGE_KEY, SHEET_URL);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => rawRows.map(toBomRow), [rawRows]);
  // .normalize("NFC") - xem giai thich day du o components/ui/Select.tsx (cung fix, cung ngay).
  const q = query.trim().toLowerCase().normalize("NFC");

  const modelMatches = useMemo(() => {
    if (!q) return [];
    const set = new Set<string>();
    for (const r of rows) if (r.maModel.toLowerCase().normalize("NFC").includes(q) || r.model.toLowerCase().normalize("NFC").includes(q)) set.add(r.maModel);
    return Array.from(set);
  }, [rows, q]);

  const partMatches = useMemo(() => {
    if (!q || modelMatches.length > 0) return [];
    const set = new Set<string>();
    for (const r of rows) if (r.maLinhKien.toLowerCase().normalize("NFC").includes(q) || r.tenLinhKien.toLowerCase().normalize("NFC").includes(q)) set.add(r.maLinhKien);
    return Array.from(set);
  }, [rows, q, modelMatches.length]);

  return (
    <div>
      <SheetSyncBar syncedAt={syncedAt} syncing={syncing} error={error} onSync={sync} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Nhập mã/tên Model để xem BOM, hoặc mã/tên linh kiện để xem Model nào dùng..."
        className="focus-ring w-full max-w-lg bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mb-3"
      />

      {!q && <div className="text-sm text-[var(--ink-400)] py-6 text-center">Nhập từ khoá để tra cứu Bảng kê vật tư (BOM).</div>}
      {q && modelMatches.length === 0 && partMatches.length === 0 && (
        <div className="text-sm text-[var(--ink-400)] py-6 text-center">Không tìm thấy Model hoặc linh kiện phù hợp.</div>
      )}

      {modelMatches.length > 0 && (
        <div className="space-y-4">
          {modelMatches.length > MAX_GROUPS_SHOWN && (
            <div className="text-xs text-[var(--amber-600)]">
              Có {modelMatches.length} Model phù hợp, chỉ hiển thị {MAX_GROUPS_SHOWN} model đầu — thu hẹp từ khoá để chính xác hơn.
            </div>
          )}
          {modelMatches.slice(0, MAX_GROUPS_SHOWN).map((maModel) => {
            const group = rows.filter((r) => r.maModel === maModel);
            const modelName = group[0]?.model ?? "";
            return (
              <div key={maModel} className="border border-[var(--line)] rounded-xl overflow-hidden">
                <div className="bg-[var(--surface-100)] px-3 py-2 text-sm font-semibold text-[var(--ocean-800)]">
                  <span className="font-mono text-xs mr-2">{maModel}</span>
                  {modelName}
                  <span className="ml-2 text-xs font-normal text-[var(--ink-400)]">({group.length} linh kiện)</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--ink-400)] border-b border-[var(--line)]">
                      <th className="px-3 py-1.5 font-medium">Mã linh kiện</th>
                      <th className="px-3 py-1.5 font-medium">Tên linh kiện</th>
                      <th className="px-3 py-1.5 font-medium">SL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((r, i) => (
                      <tr key={i} className="border-b border-[var(--line)] last:border-0">
                        <td className="px-3 py-1.5 font-mono text-xs">{r.maLinhKien}</td>
                        <td className="px-3 py-1.5">{r.tenLinhKien}</td>
                        <td className="px-3 py-1.5">{r.soLuong}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {partMatches.length > 0 && (
        <div className="space-y-4">
          {partMatches.length > MAX_GROUPS_SHOWN && (
            <div className="text-xs text-[var(--amber-600)]">
              Có {partMatches.length} linh kiện phù hợp, chỉ hiển thị {MAX_GROUPS_SHOWN} mã đầu — thu hẹp từ khoá để chính xác hơn.
            </div>
          )}
          {partMatches.slice(0, MAX_GROUPS_SHOWN).map((maLk) => {
            const group = rows.filter((r) => r.maLinhKien === maLk);
            const tenLk = group[0]?.tenLinhKien ?? "";
            return (
              <div key={maLk} className="border border-[var(--line)] rounded-xl overflow-hidden">
                <div className="bg-[var(--surface-100)] px-3 py-2 text-sm font-semibold text-[var(--ocean-800)]">
                  <span className="font-mono text-xs mr-2">{maLk}</span>
                  {tenLk}
                  <span className="ml-2 text-xs font-normal text-[var(--ink-400)]">(dùng trong {group.length} model)</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--ink-400)] border-b border-[var(--line)]">
                      <th className="px-3 py-1.5 font-medium">Mã Model</th>
                      <th className="px-3 py-1.5 font-medium">Model</th>
                      <th className="px-3 py-1.5 font-medium">SL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((r, i) => (
                      <tr key={i} className="border-b border-[var(--line)] last:border-0">
                        <td className="px-3 py-1.5 font-mono text-xs">{r.maModel}</td>
                        <td className="px-3 py-1.5">{r.model}</td>
                        <td className="px-3 py-1.5">{r.soLuong}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
