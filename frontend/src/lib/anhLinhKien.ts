// Anh minh hoa linh kien nhieu anh (2026-10-13, migration 0077) - ban sao FE cua dsAnhLk() (backend lib/anhLinhKien.ts):
// anh_ds = JSON array URL (<= 10, anh dau = anh chinh = anh_demo); NULL = chi co anh_demo (du lieu cu).
export const SO_ANH_LK_TOI_DA = 10;

export function anhCuaLk(row: { anh_demo?: string | null; anh_ds?: string | null }): string[] {
  if (row.anh_ds) {
    try {
      const v: unknown = JSON.parse(row.anh_ds);
      if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, SO_ANH_LK_TOI_DA);
    } catch { /* hong -> roi ve anh_demo */ }
  }
  return row.anh_demo ? [row.anh_demo] : [];
}
