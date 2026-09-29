// So khop o tim kiem phia client KHONG dau, khong phan biet hoa/thuong (2026-09-29, "các công cụ tìm kiếm cho
// phép tìm theo tên ktv") - go "nguyen van a" phai ra "Nguyễn Văn A". Cung quy tac voi boDau() o backend
// (backend/src/lib/timTheoTen.ts) de o tim server va o loc client cho cung ket qua.
export function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** `text` co chua `q` (da bo dau ca 2 ben)? q rong -> true. */
export function khopTim(text: string | null | undefined, q: string): boolean {
  const key = boDau(q);
  if (!key) return true;
  return text ? boDau(text).includes(key) : false;
}
