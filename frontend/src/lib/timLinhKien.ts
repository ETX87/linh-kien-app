// Bo tim linh kien DUNG CHUNG (2026-10-04, "hỗ trợ tìm kiếm tốt hơn ... chỉ tìm trên máy người dùng") - Bang gia
// (DanhMucLinhKienModule) + o chon LK luc tao/sua don (LinhKienPicker). Chay HOAN TOAN tren may: danh muc, tu khoa phu,
// tu dong nghia deu da tai 1 lan va cache tren may (fetchWithHashCache / linhKienCache / TINH_QUERY "lk-tu-khoa") -
// go phim KHONG goi server.
//
// Quy tac khop (moi "cum" tu khoa phai khop, khong can lien nhau / dung thu tu - "lõi ro" ra "Lõi lọc nước RO"):
//   1. Truc tiep: cum co trong ten/ma/tu khoa phu. Go KHONG dau khop moi bien the co dau, go CO dau phai dung dau
//      (cung quy tac khopTim). Bo qua gach noi/cham/khoang trang khi so ma ("cpf1102" ra "CPF-1102R").
//   2. Tu dong nghia (bang lk_dong_nghia, vd "bo mach" ~ "board"): khop nguyen tu.
//   3. Go sai 1 ky tu (tu >= 4 chu, khong dau): khop tu gan dung trong danh muc ("karofy" ra "Karofi").
// Diem: nguyen tu 30 > dong nghia 20 > dau tu 15 > go sai 8 > chuoi con 2; + ca cum lien nhau / dau ten; ma go dung len
// dau. Nguoi goi cong them diem uu tien (hay dat) qua `uuTien`.

import { boDau, khopTim } from "./boDau";

export interface LkTimDong {
  ma: string;
  ten: string;
}

interface ChiMuc {
  goc: string;
  bd: string;
  gon: string;
  tuNoi: string;
  tu: Set<string>;
  dauTu: string;
  maBd: string;
  maGon: string;
}

export interface BoTimLk {
  chiMuc: Map<string, ChiMuc>;
  /** tu -> so linh kien chua tu do (de goi y sua loi). */
  tuVung: Map<string, number>;
  /** tu/cum (bo dau) -> cac tu/cum dong nghia. */
  dongNghia: Map<string, string[]>;
  /** cac cum nhieu tu trong bang dong nghia, dai truoc (de nhan "bo mach" la 1 cum). */
  cumNhieuTu: string[][];
}

interface Cum {
  goc: string;
  bd: string;
  gon: string;
  coDau: boolean;
  nhieuTu: boolean;
  alts: string[];
  bienThe: string[];
}

export interface ToDamSpec {
  /** chuoi con (bo dau) - to dam bat ky cho nao xuat hien. */
  sub: string[];
  /** tu nguyen ven (bo dau) - chi to khi dung 1 tu/cum tu. */
  tok: string[];
}

const gonChu = (s: string) => s.replace(/[^a-z0-9]/g, "");
const tachTu = (bd: string) => bd.split(/[^a-z0-9]+/).filter(Boolean);
// Co dau = bo dau lam doi chuoi (goc da la chu thuong, 1 khoang trang giua cac tu).
const coDauChu = (s: string) => boDau(s) !== s;

/** Tach "nhom dong nghia" nhap tay ("bo mach, board, mainboard") -> danh sach tu/cum bo dau, bo trung. */
export function tachNhomDongNghia(nhom: string): string[] {
  return [...new Set(nhom.split(/[,;\n]/).map((s) => boDau(s)).filter((s) => gonChu(s).length > 0))];
}

/**
 * Dung bo tim 1 lan khi danh muc/tu khoa/dong nghia doi (useMemo o noi goi). tuKhoa: ma -> tu khoa phu (lk_tu_khoa),
 * nhomDongNghia: cac chuoi nhom (lk_dong_nghia.nhom).
 */
export function taoBoTimLk(rows: LkTimDong[], tuKhoa?: Map<string, string>, nhomDongNghia?: string[]): BoTimLk {
  const chiMuc = new Map<string, ChiMuc>();
  const tuVung = new Map<string, number>();
  for (const r of rows) {
    const phu = tuKhoa?.get(r.ma) ?? "";
    const goc = `${r.ten} ${r.ma}${phu ? ` ${phu}` : ""}`;
    const bd = boDau(goc);
    const dsTu = tachTu(bd);
    const tu = new Set(dsTu);
    for (const t of tu) if (t.length >= 2) tuVung.set(t, (tuVung.get(t) ?? 0) + 1);
    const maBd = boDau(r.ma);
    chiMuc.set(r.ma, { goc, bd, gon: gonChu(bd), tuNoi: ` ${dsTu.join(" ")} `, tu, dauTu: dsTu[0] ?? "", maBd, maGon: gonChu(maBd) });
  }
  const dongNghia = new Map<string, string[]>();
  const cum = new Set<string>();
  for (const nhom of nhomDongNghia ?? []) {
    const ds = tachNhomDongNghia(nhom).map((s) => tachTu(s).join(" ")).filter(Boolean);
    if (ds.length < 2) continue;
    for (const a of ds) {
      const cu = dongNghia.get(a) ?? [];
      dongNghia.set(a, [...new Set([...cu, ...ds.filter((b) => b !== a)])]);
      if (a.includes(" ")) cum.add(a);
    }
  }
  const cumNhieuTu = [...cum].map((c) => c.split(" ")).sort((a, b) => b.length - a.length);
  return { chiMuc, tuVung, dongNghia, cumNhieuTu };
}

/** Khoang cach sua (them/xoa/thay/dao 2 ky tu ke nhau), dung som khi > toiDa. */
function khoangCach(a: string, b: string, toiDa: number): number {
  if (Math.abs(a.length - b.length) > toiDa) return toiDa + 1;
  const m = a.length;
  const n = b.length;
  let truoc2 = new Array<number>(n + 1).fill(0);
  let truoc = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const hien = new Array<number>(n + 1).fill(0);
    hien[0] = i;
    let nhoNhat = hien[0];
    for (let j = 1; j <= n; j++) {
      const chi = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(truoc[j] + 1, hien[j - 1] + 1, truoc[j - 1] + chi);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, truoc2[j - 2] + 1);
      hien[j] = v;
      if (v < nhoNhat) nhoNhat = v;
    }
    if (nhoNhat > toiDa) return toiDa + 1;
    truoc2 = truoc;
    truoc = hien;
  }
  return truoc[n];
}

function phanTich(bo: BoTimLk, q: string): Cum[] {
  const words = q.normalize("NFC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const wordsBd = words.map((w) => tachTu(boDau(w)).join(" "));
  const out: Cum[] = [];
  let i = 0;
  while (i < words.length) {
    let k = 0;
    for (const c of bo.cumNhieuTu) {
      if (c.length <= words.length - i && c.every((t, j) => wordsBd[i + j] === t)) {
        k = c.length;
        break;
      }
    }
    const goc = k ? words.slice(i, i + k).join(" ") : words[i];
    const bd = k ? wordsBd.slice(i, i + k).join(" ") : boDau(words[i]);
    i += k || 1;
    if (!gonChu(bd)) continue;
    const coDau = coDauChu(goc);
    const bdTu = tachTu(bd).join(" ");
    const bienThe: string[] = [];
    if (!coDau && !k && /^[a-z]{4,}$/.test(bd) && !bo.tuVung.has(bd)) {
      for (const t of bo.tuVung.keys()) {
        if (Math.abs(t.length - bd.length) <= 1 && t.length >= 4 && khoangCach(bd, t, 1) <= 1) bienThe.push(t);
        if (bienThe.length >= 20) break;
      }
    }
    out.push({ goc, bd, gon: gonChu(bd), coDau, nhieuTu: !!k, alts: bo.dongNghia.get(bdTu) ?? [], bienThe });
  }
  return out;
}

function diemCum(c: Cum, cm: ChiMuc): number {
  let truc = false;
  if (cm.bd.includes(c.bd)) truc = c.coDau ? khopTim(cm.goc, c.goc) : true;
  // Ma/ky hieu go bo gach noi/cham ("cpf1102" ~ "CPF-1102R") - tinh nhu khop dau tu.
  else if (!c.coDau && c.gon.length >= 3 && cm.gon.includes(c.gon)) return 15;
  if (truc) {
    const bdTu = tachTu(c.bd).join(" ");
    if (bdTu && cm.tuNoi.includes(` ${bdTu} `)) return 30;
    if (bdTu && cm.tuNoi.includes(` ${bdTu}`)) return 15;
    return 2;
  }
  for (const a of c.alts) if (a.includes(" ") ? cm.tuNoi.includes(` ${a} `) : cm.tu.has(a)) return 20;
  for (const v of c.bienThe) if (cm.tu.has(v)) return 8;
  return -1;
}

export interface KetQuaTimLk {
  /** ma -> diem (chi cac ma khop). q rong -> null (khong loc). */
  diem: Map<string, number> | null;
  toDam: ToDamSpec;
  /** Goi y sua loi khi KHONG co ket qua ("Có phải bạn muốn tìm …"), null neu khong co. */
  goiY: string | null;
}

/** Cham diem moi ma trong `dsMa` (mac dinh: ca bo) theo tu khoa q. */
export function timLk(bo: BoTimLk, q: string, dsMa?: Iterable<string>): KetQuaTimLk {
  const cums = phanTich(bo, q);
  if (cums.length === 0) return { diem: null, toDam: { sub: [], tok: [] }, goiY: null };
  const qbd = boDau(q);
  const qGon = gonChu(qbd);
  const dauCum = tachTu(cums[0].bd)[0] ?? "";
  const diem = new Map<string, number>();
  for (const ma of dsMa ?? bo.chiMuc.keys()) {
    const cm = bo.chiMuc.get(ma);
    if (!cm) continue;
    let d = 0;
    let ok = true;
    for (const c of cums) {
      const x = diemCum(c, cm);
      if (x < 0) {
        ok = false;
        break;
      }
      d += x;
    }
    if (!ok) continue;
    if (cm.bd.startsWith(qbd)) d += 60;
    else if (cm.bd.includes(qbd)) d += 40;
    else if (cm.dauTu && cm.dauTu === dauCum) d += 10;
    if (cm.maBd === qbd || (qGon && cm.maGon === qGon)) d += 1000;
    else if (qGon.length >= 2 && cm.maGon.startsWith(qGon)) d += 200;
    diem.set(ma, d);
  }
  const toDam: ToDamSpec = {
    sub: cums.map((c) => c.bd),
    tok: cums.flatMap((c) => [...c.alts, ...c.bienThe]),
  };
  return { diem, toDam, goiY: diem.size === 0 ? goiYSuaLoi(bo, cums) : null };
}

function goiYSuaLoi(bo: BoTimLk, cums: Cum[]): string | null {
  let doi = false;
  const ds = cums.map((c) => {
    if (c.nhieuTu || c.alts.length || !/^[a-z]{3,}$/.test(c.bd)) return c.goc;
    for (const t of bo.tuVung.keys()) if (t.includes(c.bd)) return c.goc;
    // Sai toi da 1 ky tu (tu >= 5 chu: 2) - tranh goi y vo nghia cho tu ngan.
    const toiDa = c.bd.length >= 5 ? 2 : 1;
    let tot: { t: string; kc: number; n: number } | null = null;
    for (const [t, n] of bo.tuVung) {
      if (t.length < 2 || Math.abs(t.length - c.bd.length) > toiDa) continue;
      const kc = khoangCach(c.bd, t, toiDa);
      if (kc > toiDa) continue;
      if (!tot || kc < tot.kc || (kc === tot.kc && n > tot.n)) tot = { t, kc, n };
    }
    if (!tot) return c.goc;
    doi = true;
    return tot.t;
  });
  return doi ? ds.join(" ") : null;
}

/** Sap xep ma theo diem tim (+ uu tien), cung diem giu thu tu dau vao. */
export function sapTheoDiem<T>(rows: T[], layMa: (r: T) => string, diem: Map<string, number>, uuTien?: (ma: string) => number): T[] {
  const d = (r: T) => (diem.get(layMa(r)) ?? 0) + (uuTien ? uuTien(layMa(r)) : 0);
  return rows
    .filter((r) => diem.has(layMa(r)))
    .map((r, i) => ({ r, i, v: d(r) }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .map((x) => x.r);
}

/** Tach `text` thanh doan thuong / doan to dam theo spec (so khop khong dau, giu nguyen chu goc de hien thi). */
export function doanToDam(text: string, spec: ToDamSpec): { s: string; dam: boolean }[] {
  const chu = Array.from(text.normalize("NFC"));
  if (chu.length === 0 || (spec.sub.length === 0 && spec.tok.length === 0)) return [{ s: chu.join(""), dam: false }];
  const base = chu
    .map((c) => {
      const b = c.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
      return b.length === 1 ? b : "\u0000";
    })
    .join("");
  const dam = new Array<boolean>(chu.length).fill(false);
  const laChu = (ch: string | undefined) => !!ch && /[a-z0-9]/.test(ch);
  const danh = (f: string, nguyenTu: boolean) => {
    if (!f) return;
    let i = base.indexOf(f);
    while (i >= 0) {
      if (!nguyenTu || (!laChu(base[i - 1]) && !laChu(base[i + f.length]))) for (let j = i; j < i + f.length; j++) dam[j] = true;
      i = base.indexOf(f, i + 1);
    }
  };
  // Chuoi con 1-2 ky tu ("ro") chi to o DAU tu - tranh to "ro" giua "Karofi".
  for (const f of spec.sub) {
    if (f.length > 2) danh(f, false);
    else {
      let i = base.indexOf(f);
      while (i >= 0) {
        if (!laChu(base[i - 1])) for (let j = i; j < i + f.length; j++) dam[j] = true;
        i = base.indexOf(f, i + 1);
      }
    }
  }
  for (const f of spec.tok) danh(f, true);
  const out: { s: string; dam: boolean }[] = [];
  for (let i = 0; i < chu.length; i++) {
    const last = out[out.length - 1];
    if (last && last.dam === dam[i]) last.s += chu[i];
    else out.push({ s: chu[i], dam: dam[i] });
  }
  return out;
}
