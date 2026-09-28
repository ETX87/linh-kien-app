// Loc/sap xep theo cot kieu Excel (phan hoi 2026-09-28: "filter theo các loại đề xuất, người tạo, người đặt hàng,
// trạng thái, yêu cầu hóa đơn, khu vực ... giống filter tiêu đề của excel, có tìm kiếm, chọn 1 hoặc nhiều, hoặc tất
// cả, sort") - dung chung cho GET /dat-mua-lk/don-hang va GET /phieu-xuat-kho (loc o SERVER, dung cho moi trang).
//
// Query param:
//   cf = JSON { <cot>: { v: string[], not?: true } } - v = cac gia tri DUOC chon (not=true: v = cac gia tri BI BO,
//        client tu chon dang ngan hon). Gia tri rong/NULL = "". Truyen qua 1 bind json_each (khong vuong gioi han
//        100 tham so cua D1 du chon hang tram gia tri).
//   cs = cot sap xep, cd = asc|desc.

export type CotLoc =
  // Cot 1 gia tri/dong: `expr` la bieu thuc SQL tren dong goc.
  | { kieu: "don"; expr: string; sortExpr?: string; khuVuc?: boolean }
  // Cot nhieu gia tri/dong (vd PXK -> cac dong don ben trong). `tu` = "FROM ... WHERE <noi voi dong goc>" (subquery
  // tuong quan, dung de loc/sap xep), `join` = cung quan he viet dang JOIN (dung de dem gia tri), `expr` tren alias
  // cua 2 cau do. Loc = dong goc co IT NHAT 1 gia tri duoc chon.
  | { kieu: "nhieu"; tu: string; join: string; expr: string; khuVuc?: boolean };

export type LocCotInput = Record<string, { v: string[]; not?: boolean }>;

const coalesce = (expr: string) => `COALESCE(CAST(${expr} AS TEXT), '')`;
const TAP_JSON = "(SELECT value FROM json_each(?))";

export function docLocCot(raw: string | undefined, defs: Record<string, CotLoc>): LocCotInput {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: LocCotInput = {};
    for (const [cot, val] of Object.entries(obj ?? {})) {
      if (!defs[cot] || !val || typeof val !== "object") continue;
      const v = (val as { v?: unknown }).v;
      if (!Array.isArray(v)) continue;
      out[cot] = { v: v.map((x) => String(x ?? "")).slice(0, 2000), not: !!(val as { not?: unknown }).not };
    }
    return out;
  } catch {
    return {};
  }
}

/** Dieu kien WHERE (bat dau bang " AND ...") cho moi cot dang loc, tru `boQua` (dung khi lay gia tri cua chinh cot do). */
export function sqlLocCot(defs: Record<string, CotLoc>, loc: LocCotInput, boQua?: string): { sql: string; binds: unknown[] } {
  let sql = "";
  const binds: unknown[] = [];
  for (const [cot, { v, not }] of Object.entries(loc)) {
    if (cot === boQua) continue;
    const def = defs[cot];
    if (!def) continue;
    if (def.kieu === "don") {
      sql += ` AND ${coalesce(def.expr)} ${not ? "NOT IN" : "IN"} ${TAP_JSON}`;
    } else {
      // "nhieu": chon tap S (= tat ca - tap bo) <=> co it nhat 1 gia tri thuoc S <=> co it nhat 1 gia tri NGOAI tap bo.
      sql += ` AND EXISTS (SELECT 1 ${def.tu} AND ${coalesce(def.expr)} ${not ? "NOT IN" : "IN"} ${TAP_JSON})`;
    }
    binds.push(JSON.stringify(v));
  }
  return { sql, binds };
}

/** Bieu thuc ORDER BY cua cot sap xep (null = khong sap xep theo cot). */
export function sqlSapXep(defs: Record<string, CotLoc>, cot: string | undefined, dir: string | undefined): string | null {
  if (!cot || !defs[cot]) return null;
  const def = defs[cot];
  const huong = dir === "desc" ? "DESC" : "ASC";
  const expr = def.kieu === "don" ? def.sortExpr ?? coalesce(def.expr) : `(SELECT MIN(${coalesce(def.expr)}) ${def.tu})`;
  return `${expr} ${huong}`;
}

/** Ten hien thi (users.ten, khong co thi email) cua 1 cot email - dung lam sortExpr cho cot nguoi. */
export const tenNguoiSql = (emailExpr: string) => `COALESCE((SELECT u.ten FROM users u WHERE u.email = ${emailExpr}), ${emailExpr}, '')`;

/**
 * Cac gia tri (kem so dong goc) cua 1 cot trong tap dong dang xem (whereSql da ap moi bo loc KHAC, bo qua bo loc cua
 * chinh cot) - nguon danh sach checkbox. `bang` = "FROM <bang> <alias>", `khoa` = khoa dong goc (dem DISTINCT).
 */
export async function giaTriCot(
  db: D1Database,
  def: CotLoc,
  bang: string,
  khoa: string,
  whereSql: string,
  binds: unknown[],
): Promise<{ v: string; n: number; nhan?: string }[]> {
  const sql =
    def.kieu === "don"
      ? `SELECT ${coalesce(def.expr)} as v, COUNT(*) as n ${bang} WHERE ${whereSql} GROUP BY v ORDER BY n DESC LIMIT 2000`
      : `SELECT ${coalesce(def.expr)} as v, COUNT(DISTINCT ${khoa}) as n ${bang} ${def.join} WHERE ${whereSql} GROUP BY v ORDER BY n DESC LIMIT 2000`;
  const { results } = await db.prepare(sql).bind(...binds).all<{ v: string; n: number }>();
  if (!def.khuVuc) return results;
  const { results: kv } = await db.prepare("SELECT ma, ten FROM khu_vuc").all<{ ma: string; ten: string | null }>();
  const ten = new Map(kv.map((r) => [r.ma, r.ten ?? r.ma]));
  return results.map((r) => ({ ...r, nhan: r.v ? ten.get(r.v) ?? r.v : undefined }));
}
