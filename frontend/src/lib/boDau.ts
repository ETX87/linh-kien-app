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

// ---------- Tim theo TU + xep hang (2026-09-30, Bang gia: go "lõi ro" phai ra "Lõi lọc nước RO") ----------
// Tach tu khoa thanh cac tu: MOI tu phai co mat (khong can lien nhau, khong can dung thu tu); tu go khong dau khop moi
// bien the co dau, tu co dau phai dung dau (cung quy tac khopTim). Diem cao hon = sat hon: tu trung NGUYEN TU trong ten
// (vd "RO") > trung dau tu > chi la chuoi con (vd "ro" trong "Karofi"); ca cum go lien nhau co trong ten duoc cong them.
// Chay HOAN TOAN tren may (du lieu da tai 1 lan) - khong goi server.

export interface ChiMucTim {
  goc: string;
  bd: string;
  tu: string[];
}

/** Chuan bi 1 lan cho moi dong (bo dau + tach tu) - tranh bo dau lai moi lan go phim. Dat phan chinh (ten) TRUOC. */
export function taoChiMucTim(text: string): ChiMucTim {
  const bd = boDau(text);
  return { goc: text, bd, tu: bd.split(/[^a-z0-9]+/).filter(Boolean) };
}

/** -1 = khong khop; >= 0 = khop (cang cao cang sat). q rong -> 0. */
export function diemTimTheoTu(cm: ChiMucTim, q: string): number {
  const qq = chuan(q);
  if (!qq) return 0;
  let diem = 0;
  for (const w of qq.split(" ")) {
    const wbd = boDau(w);
    if (!wbd) continue;
    const coDau = [...w].some((c) => goc(c) !== c);
    if (coDau ? !khopTim(cm.goc, w) : !cm.bd.includes(wbd)) return -1;
    if (cm.tu.includes(wbd)) diem += 30;
    else if (cm.tu.some((t) => t.startsWith(wbd))) diem += 15;
  }
  const qbd = boDau(qq);
  if (cm.bd.startsWith(qbd)) diem += 60;
  else if (cm.bd.includes(qbd)) diem += 40;
  // Chu dau ten trung tu dau tien go (vd "lõi ..." -> "Lõi lọc ..." dung truoc "Nắp lõi ...") - chi muc nen de TEN truoc.
  else if (cm.tu[0] && cm.tu[0] === boDau(qq.split(" ")[0])) diem += 10;
  return diem;
}
