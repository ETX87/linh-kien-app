// HỎI ĐÁP TỰ ĐỘNG (2026-10-28, migration 0102) - cham diem muc do khop giua 1 cau hoi va 1 huong dan de goi y / tu tra loi.
// Ban sao: frontend/src/lib/huongDan.ts (goi y truc tiep khi KTV dang go) - DOI 1 BEN PHAI DOI CA 2, de goi y tren man hinh
// khop voi cau tra loi tu dong ma he thong gui sau khi tao cau hoi.
import { boDau } from "./timTheoTen";

// Tu chuc nang / hu tu hay gap trong cau hoi tieng Viet (da bo dau) - bo qua khi cham diem.
const BO_QUA = new Set([
  "toi", "minh", "em", "anh", "chi", "ban", "la", "bao", "nhieu", "the", "nao", "sao", "co", "khong", "ko", "k", "cua", "cho", "va",
  "thi", "duoc", "dc", "nay", "do", "oi", "a", "nhe", "nha", "voi", "hoi", "gi", "khi", "o", "de", "lam", "mot", "cac", "nhung",
  "ma", "vay", "roi", "chua", "can", "phai", "di", "len", "ra", "vao", "tu", "den", "trong", "ngoai", "nhu", "neu", "hay", "giup",
]);

export function tachTu(s: string | null | undefined): string[] {
  return boDau(s ?? "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2 && !BO_QUA.has(w));
}

export interface HuongDanKhop {
  tieu_de: string;
  noi_dung: string;
  tu_khoa: string | null;
}

/** Diem khop (0 = khong lien quan). Moi tu cua cau hoi: trung dau 1 tu trong tu khoa = 3, tieu de = 2, noi dung = 1. */
export function diemHuongDan(hd: HuongDanKhop, cauHoi: string): number {
  const tu = [...new Set(tachTu(cauHoi))];
  if (tu.length === 0) return 0;
  const tk = ` ${tachTu(hd.tu_khoa).join(" ")} `;
  const tieu = ` ${tachTu(hd.tieu_de).join(" ")} `;
  const nd = ` ${tachTu(hd.noi_dung).join(" ")} `;
  let diem = 0;
  let khop = 0;
  for (const w of tu) {
    const d = tk.includes(` ${w}`) ? 3 : tieu.includes(` ${w}`) ? 2 : nd.includes(` ${w}`) ? 1 : 0;
    if (d) {
      khop += 1;
      diem += d;
    }
  }
  const tiLe = khop / tu.length;
  // Cau 1 tu: phai trung tieu de / tu khoa. Cau dai: >= 2 tu trung hoac >= 40% so tu.
  if (tu.length === 1 ? diem < 2 : khop < 2 && tiLe < 0.4) return 0;
  return diem + tiLe * 3;
}

/** Huong dan khop nhat (diem >= 3), giam dan, toi da `toiDa`. */
export function goiYHuongDan<T extends HuongDanKhop>(ds: T[], cauHoi: string, toiDa = 3): T[] {
  return ds
    .map((hd) => ({ hd, d: diemHuongDan(hd, cauHoi) }))
    .filter((x) => x.d >= 3)
    .sort((a, b) => b.d - a.d)
    .slice(0, toiDa)
    .map((x) => x.hd);
}
