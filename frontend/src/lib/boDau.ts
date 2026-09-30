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

// Chu cai goc cua 1 ky tu (bo dau thanh/dau mu, đ -> d).
function goc(ch: string): string {
  return ch.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
}
function chuan(s: string): string {
  return s.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * `text` co chua `q`? q rong -> true. Ky tu KHONG dau trong q khop moi bien the co dau ("le" -> "Lê", "lẻ", "Telesale");
 * ky tu CO dau phai khop DUNG dau (sua 2026-09-30, phan hoi go "lẻ" ra ca "Telesale"/"Lê Thị Hường") - go "lẻ" chi ra
 * "Khách hàng lẻ", go "nguyễn van" khop "Nguyễn Văn". Ban sao o backend/src/lib/timTheoTen.ts - doi 1 ben doi ca 2.
 */
export function khopTim(text: string | null | undefined, q: string): boolean {
  const qq = chuan(q);
  if (!qq) return true;
  if (!text) return false;
  const Q = [...qq];
  if (Q.every((c) => goc(c) === c)) return boDau(text).includes(boDau(q));
  const T = [...chuan(text)];
  const Tg = T.map(goc);
  for (let i = 0; i + Q.length <= T.length; i++) {
    let dung = true;
    for (let j = 0; j < Q.length && dung; j++) dung = goc(Q[j]) === Q[j] ? Tg[i + j] === Q[j] : T[i + j] === Q[j];
    if (dung) return true;
  }
  return false;
}
