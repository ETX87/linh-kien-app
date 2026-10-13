// Anh minh hoa linh kien nhieu anh (2026-10-13, migration 0077): linh_kien.anh_ds = JSON array URL (<= 10), anh_demo = anh dau.
// anh_ds NULL = LK chi co anh_demo (du lieu cu). Ban sao FE: anhCuaLk() o frontend/src/lib/anhLinhKien.ts.
export const SO_ANH_LK_TOI_DA = 10;

export function dsAnhLk(row: { anh_demo?: string | null; anh_ds?: string | null }): string[] {
  if (row.anh_ds) {
    try {
      const v = JSON.parse(row.anh_ds);
      if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, SO_ANH_LK_TOI_DA);
    } catch { /* hong -> roi ve anh_demo */ }
  }
  return row.anh_demo ? [row.anh_demo] : [];
}

// Gia tri ghi DB: anh_demo = anh dau (NULL khi rong), anh_ds = NULL khi chi 0-1 anh (giu dung dang du lieu cu).
export function cotAnhLk(ds: string[]): { anh_demo: string | null; anh_ds: string | null } {
  return { anh_demo: ds[0] ?? null, anh_ds: ds.length > 1 ? JSON.stringify(ds) : null };
}
