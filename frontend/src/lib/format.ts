export function fmtVND(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("vi-VN") + "đ";
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtDateLong(d = new Date()): string {
  const thu = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][d.getDay()];
  const p = (x: number) => String(x).padStart(2, "0");
  return `${thu}, ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
