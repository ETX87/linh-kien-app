// Tim nguoi theo TEN (phan hoi 2026-09-28: "bổ sung tìm kiếm theo tên người gửi (tên KTV)") - o tim kiem
// cac danh sach truoc day chi so LIKE tren cot EMAIL (nguoi_tao/nguoi_nhan_hang), go ten KTV khong ra gi.
// So sanh o JS thay vi LIKE cua SQLite vi LIKE chi khong phan biet hoa/thuong voi chu ASCII va KHONG bo dau:
// go "le ngoc anh" / "LÊ NGỌC ANH" deu phai khop "Lê Ngọc Anh". Danh ba KTV + users chi vai tram dong nen
// doc het 1 lan moi request tim kiem la re.

export function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Email (dang nhap) cua moi nguoi co ten/ma khop `q` (khong dau, khong phan biet hoa/thuong): KTV theo
 * ktv_lien_he.ten_hien_thi/ma_ktv, nhan vien van phong theo users.ten/ten_misa. Tra [] neu q qua ngan.
 */
export async function emailsTheoTen(db: D1Database, q: string): Promise<string[]> {
  const key = boDau(q);
  if (key.length < 2) return [];
  const [ktv, users] = await Promise.all([
    db.prepare("SELECT email_dang_nhap as email, ten_hien_thi, ma_ktv FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL").all<{ email: string; ten_hien_thi: string | null; ma_ktv: string }>(),
    db.prepare("SELECT email, ten, ten_misa FROM users").all<{ email: string; ten: string | null; ten_misa: string | null }>(),
  ]);
  const out = new Set<string>();
  for (const r of ktv.results) if ([r.ten_hien_thi, r.ma_ktv].some((v) => v && boDau(v).includes(key))) out.add(r.email);
  for (const r of users.results) if ([r.ten, r.ten_misa].some((v) => v && boDau(v).includes(key))) out.add(r.email);
  return [...out].slice(0, 500);
}

/** Menh de SQL "OR <cot> IN (...)" cho tung cot email - rong neu khong co ai khop. */
export function orEmailIn(cols: string[], emails: string[]): { sql: string; binds: string[] } {
  if (emails.length === 0) return { sql: "", binds: [] };
  const ph = emails.map(() => "?").join(",");
  return { sql: cols.map((c) => ` OR ${c} IN (${ph})`).join(""), binds: cols.flatMap(() => emails) };
}
