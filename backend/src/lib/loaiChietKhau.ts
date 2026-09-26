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

/**
 * Chi duoc doi loai chiet khau TRUOC KHI chot chuyen tien (phan hoi 2026-09-26: "chỉ cho chỉnh sửa loại
 * chiết khấu trước khi đơn được chốt đã gửi tiền") = PXK con "Dang tao phieu" VA (khong can chuyen tien
 * HOAC KTV chua chuyen - "Cho KTV chuyen"). KTV da chuyen theo so tien cu -> khoa, tranh gia lech tien.
 */
export function choPhepDoiLoaiChietKhau(pxk: { trang_thai: string | null; so_tien_can_chuyen: number | null; trang_thai_chuyen_tien: string | null }): boolean {
  return pxk.trang_thai === "Dang tao phieu" && (pxk.so_tien_can_chuyen == null || pxk.trang_thai_chuyen_tien === "Cho KTV chuyen");
}

/** Ten luu vao DB: bo khoang trang thua (giu nguyen hoa/thuong nguoi dung go). */
export function gonTenLoaiChietKhau(ten: string): string {
  return ten.normalize("NFC").trim().replace(/\s+/g, " ");
}
