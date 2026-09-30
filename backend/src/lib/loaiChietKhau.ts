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
 * Chi duoc doi loai chiet khau TRUOC KHI Ke toan chot tien = PXK con "Dang tao phieu" VA Ke toan CHUA duyet chuyen tien
 * (trang_thai_chuyen_tien khac 'TN da duyet'). SUA 2026-09-30 (phan hoi "đơn trong phiếu kế toán chưa chốt tiền thì cho
 * sửa chiết khấu, sửa giá" - PMH-000144 KTV thuntmctv tra bang quy du dang "KTV da chuyen" cho Ke toan nen bi khoa): truoc
 * day chi cho khi con "Cho KTV chuyen". Doi loai + cap nhat gia -> tong doi -> taiTinhPxk() dua phieu ve "Cho KTV chuyen"
 * (giu anh/ghi chu), tru quy / KTV chuyen bo sung roi Ke toan duyet lai - khong lech tien.
 */
export function choPhepDoiLoaiChietKhau(pxk: { trang_thai: string | null; so_tien_can_chuyen: number | null; trang_thai_chuyen_tien: string | null }): boolean {
  return pxk.trang_thai === "Dang tao phieu" && (pxk.so_tien_can_chuyen == null || pxk.trang_thai_chuyen_tien !== "TN da duyet");
}

/** Ten luu vao DB: bo khoang trang thua (giu nguyen hoa/thuong nguoi dung go). */
export function gonTenLoaiChietKhau(ten: string): string {
  return ten.normalize("NFC").trim().replace(/\s+/g, " ");
}
