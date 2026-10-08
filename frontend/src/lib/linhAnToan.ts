// Link do NGUOI DUNG / he khac nhap (anh, link CRM) dua vao href - React 18 KHONG chan "javascript:", bam vao se chay
// script trong phien dang nhap (2026-10-08, danh gia bao mat). Chi giu http(s); con lai tra undefined (link khong bam duoc).
export function linkAnToan(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url, window.location.origin);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}
