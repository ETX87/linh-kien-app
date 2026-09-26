// Tim loai chiet khau trung ten (migration 0033) - so sanh KHONG phan biet hoa/thuong va khoang trang thua.
// Phai so sanh o JS: lower() cua SQLite chi ha chu ASCII A-Z, khong ha duoc chu tieng Viet co dau ("KHUYẾN"
// != "khuyến") -> truoc day TN go lai cung ten khac hoa/thuong tao ra loai trung.
function chuanHoaTen(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

export async function timLoaiChietKhauTheoTen(
  db: D1Database,
  ten: string,
  boQuaId?: number,
): Promise<{ id: number; bat_tat: number } | null> {
  const { results } = await db.prepare("SELECT id, ten, bat_tat FROM settings_loai_chiet_khau").all<{ id: number; ten: string; bat_tat: number }>();
  const key = chuanHoaTen(ten);
  return results.find((r) => r.id !== boQuaId && chuanHoaTen(r.ten) === key) ?? null;
}

/** Ten luu vao DB: bo khoang trang thua (giu nguyen hoa/thuong nguoi dung go). */
export function gonTenLoaiChietKhau(ten: string): string {
  return ten.normalize("NFC").trim().replace(/\s+/g, " ");
}
