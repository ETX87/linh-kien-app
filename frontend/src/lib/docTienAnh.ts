// DOC SO TIEN TREN ANH CHUYEN KHOAN - chay HOAN TOAN tren trinh duyet (2026-09-30, phan hoi "tích hợp phần mềm tự đọc hình
// ảnh chuyển khoản để xác định số tiền... lệch thì cảnh báo"). tesseract.js (WASM, web worker rieng - khong khoa giao
// dien) tu dat tren web minh: /ocr/* do vite.config.ts `ocrAssets()` chep tu node_modules. Thu vien CHI tai (dynamic
// import) khi co anh can doc; du lieu tieng Viet duoc tesseract luu IndexedDB, lan sau khong tai lai.
// Ket qua chi de CANH BAO (may co the doc sai) - khong bao gio chan thao tac.
// Luong: KTV tai anh -> doc ngay tu file tren may (khong qua mang) -> so doc duoc gui kem luc bam "Đã chuyển" (luu
// phieu_xuat_kho.bang_chung_tien_doc, migration 0051) -> may Ke toan dung lai, chi doc bu anh chua co so.

import type { Line, Worker } from "tesseract.js";

/** Ket qua doc 1 anh: so tien (VND) hoac null = khong xac dinh duoc. */
export type SoTienDoc = number | null;

// Anh Drive luu dang drive.google.com/thumbnail?id=... - link do chuyen huong (302) KHONG co header CORS nen trinh duyet
// khong cho doc pixel; link goc lh3.googleusercontent.com/d/<id> co "Access-Control-Allow-Origin: *" (da kiem tra that).
export function urlDocDuoc(url: string): string {
  const m = url.match(/drive\.google\.com\/thumbnail\?id=([\w-]+)/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w1600` : url;
}

// 2 worker: "vie" (luot chinh) + "eng" (chi tao khi luot chinh khong ra so - PHIEN_BAN_OCR 3).
const workerP = new Map<string, Promise<Worker>>();
function layWorker(lang: "vie" | "eng"): Promise<Worker> {
  let w = workerP.get(lang);
  if (!w) {
    w = import("tesseract.js")
      .then((T) =>
        T.createWorker(lang, 1 /* OEM.LSTM_ONLY */, {
          workerPath: "/ocr/worker.min.js",
          corePath: "/ocr/core",
          langPath: "/ocr/lang",
          gzip: true,
        }),
      )
      .catch((e) => {
        workerP.delete(lang); // lan sau thu lai (vd mat mang luc tai thu vien)
        throw e;
      });
    workerP.set(lang, w);
  }
  return w;
}

// Anh vua chon tren may (KTV) - doc thang tu file, khong phai tai lai tu Drive.
const anhCucBo = new Map<string, Blob>();
export function ghiNhoAnhCucBo(url: string, file: Blob) {
  anhCucBo.set(url, file);
}

// 1 lan doc / 1 anh / 1 phien lam viec. Worker xu ly tuan tu -> xep hang de anh sau khong tranh anh truoc.
const daDoc = new Map<string, Promise<SoTienDoc>>();
// Anh doc LOI (mang/CORS/anh hong) - null cua anh nay KHONG phai "khong nhan dang duoc", khong ghi len server.
const docLoi = new Set<string>();
export const docBiLoi = (url: string) => docLoi.has(url);

/**
 * Phien ban bo nhan dang - TANG moi khi sua cach doc/chon so (tachSoTien, quyetDinhSoTien, SO, NHAN_TIEN...). Ket qua luu
 * server (bang ocr_anh_tien) khac phien ban bi bo qua -> may dau tien mo anh doc lai bang bo moi + ghi de.
 * 2 = 2026-09-30 v1.249 (bo "30 9 2026" -> 9.202, nhan 3 dong tren, doc lai dong so TO khi lan 1 khong ra so).
 * 3 = 2026-10-30 (luot du phong tieng Anh / psm 11 / anh den trang - CAC_LUOT; bo ngay gio, "o" -> 0, "đ" doc thanh "4",
 *     so thieu 1 dau phan cach co don vi, bo nam 19xx-20xx).
 * 4 = 2026-11-12 (nhan manh "thanh cong"/"so tien" o dong tren +3, nhan yeu "chuyen tien" chung chung +1 - anh MBBank dang hoi
 *     thoai doc nham so cua bong bong cu).
 * 5 = 2026-11-13 (dong so TO doc doi chieu them bang bo tieng Anh, lech -> khong doc duoc - anh BIDV doc so 3 thanh 5; doiChieuEng).
 */
export const PHIEN_BAN_OCR = 5;
let hang: Promise<unknown> = Promise.resolve();

// Chu CAO hon muc nay (px) Tesseract hay doc sai so (da thu that: "3.200.000" dam 64px -> "2.200.000") - so tien tren app
// ngan hang lai thuong la dong TO nhat. Dong do duoc cat rieng, thu ve ~32px, doc LAN 2: 2 lan KHOP moi nhan; lech thi
// doc lan 3 o ~24px, lay so co 2/3 lan doc giong nhau; van lech -> "khong doc duoc" (Ke toan xem bang mat) thay vi dua ra
// so sai gay canh bao nham.
const CAO_CAN_DOC_LAI = 34;

// Tra ve Blob PNG: dua canvas thang vao tesseract.js cham ~1s/lan (do that), Blob chi ~20ms.
function catDong(anh: ImageBitmap, bb: { x0: number; y0: number; x1: number; y1: number }, caoMoi: number): Promise<Blob | null> {
  const cao = Math.max(1, bb.y1 - bb.y0);
  const le = Math.round(cao * 0.25);
  const x0 = Math.max(0, bb.x0 - le), y0 = Math.max(0, bb.y0 - le);
  const x1 = Math.min(anh.width, bb.x1 + le), y1 = Math.min(anh.height, bb.y1 + le);
  const k = caoMoi / cao;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round((x1 - x0) * k));
  c.height = Math.max(1, Math.round((y1 - y0) * k));
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(anh, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

// Anh "den trang": moi diem = kenh MAU TOI NHAT (min R,G,B) -> nen mau (xanh/tim/gradient cua app ngan hang) thanh sang,
// chu so dam van dam. Luot du phong cuoi cho anh nen mau Tesseract khong tach duoc chu.
async function denTrang(anh: ImageBitmap): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = anh.width;
  c.height = anh.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(anh, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.min(d[i], d[i + 1], d[i + 2]);
  g.putImageData(px, 0, 0);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

// Cac luot doc (PHIEN_BAN_OCR 3, 2026-10-30 - ra soat 75 anh chuyen khoan that, "1 số ảnh đang chưa đọc được"): tieng Viet nhu
// cu (48/75 dung) -> CHI KHI khong ra so moi thu tieng Anh (doc chu so ro hon tren nhieu app ngan hang) o che do 1 khoi (6),
// che do chu thua (11 - man hinh nhieu khoi roi), roi anh "den trang" -> 68/75 dung. KHONG dat tieng Anh len truoc: anh tieng
// Viet doc dung bi tieng Anh doc lech chu so (5->3, 9->3) = canh bao nham, te hon "khong doc duoc".
const CAC_LUOT: { lang: "vie" | "eng"; psm: string; denTrang?: boolean }[] = [
  { lang: "vie", psm: "6" },
  { lang: "eng", psm: "6" },
  { lang: "eng", psm: "11" },
  { lang: "eng", psm: "6", denTrang: true },
];

async function docMotLuot(worker: Worker, anh: Blob, psm: string, layBmp: () => Promise<ImageBitmap>): Promise<SoTienDoc> {
  await worker.setParameters({ tessedit_pageseg_mode: psm as never });
  const { data } = await worker.recognize(anh, {}, { blocks: true, text: false });
  const lines: DongChu[] = (data.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) => p.lines.map((l: Line) => ({ text: l.text, cao: Math.max(0, l.bbox.y1 - l.bbox.y0), bbox: l.bbox }))),
  );
  return quyetDinhSoTien(lines, async (bbox, caoMoi, lang) => {
    const cat = await catDong(await layBmp(), bbox, caoMoi);
    if (!cat) return [];
    // Dong cat rieng = 1 dong chu (psm 7), xong tra lai che do cua luot. `lang` = doc doi chieu bang bo ngon ngu khac (PHIEN_BAN_OCR 5).
    const wk = lang ? await layWorker(lang) : worker;
    await wk.setParameters({ tessedit_pageseg_mode: "7" as never });
    try {
      return cacSoTrong((await wk.recognize(cat, {}, { text: true })).data.text);
    } finally {
      if (wk === worker) await worker.setParameters({ tessedit_pageseg_mode: psm as never });
    }
  });
}

export function docSoTienAnh(url: string): Promise<SoTienDoc> {
  const cu = daDoc.get(url);
  if (cu) return cu;
  const p = (hang = hang.then(async () => {
    const goc = anhCucBo.get(url) ?? (await (await fetch(urlDocDuoc(url), { mode: "cors" })).blob());
    const bmp = { v: null as ImageBitmap | null, den: null as Blob | null };
    const layBmp = async () => (bmp.v ??= await createImageBitmap(goc));
    try {
      for (const l of CAC_LUOT) {
        const worker = await layWorker(l.lang);
        // Anh "den trang" cung kich thuoc anh goc -> bbox doc lai van dung tren anh goc.
        const anh = l.denTrang ? (bmp.den ??= await denTrang(await layBmp())) : goc;
        if (!anh) continue;
        const kq = await docMotLuot(worker, anh, l.psm, layBmp);
        if (kq != null) return kq;
      }
      return null;
    } finally {
      bmp.v?.close();
    }
  })) as Promise<SoTienDoc>;
  // Loi (mang/CORS/anh hong) = khong doc duoc; bo khoi cache de lan mo sau thu lai.
  const kq = p.then((v) => {
    docLoi.delete(url);
    return v;
  }).catch(() => {
    daDoc.delete(url);
    docLoi.add(url);
    return null;
  });
  daDoc.set(url, kq);
  return kq;
}

type DocLai = (bbox: { x0: number; y0: number; x1: number; y1: number }, caoMoi: number, lang?: "eng") => Promise<number[]>;

// DOI CHIEU BANG BO TIENG ANH (2026-11-13, PHIEN_BAN_OCR 5 - "fix orc" anh BIDV "3,142,000 VND" chu vang nen xanh dam doc thanh 5.142.000):
// font so cua vai app ngan hang (BIDV: so 3 dau phang) bo tieng Viet doc nham 3->5 o moi co / dao mau / nguong, bo tieng Anh doc dung o moi co.
// Nguoc lai o anh khac bo tieng Anh tung doc lech (5->3, 9->3) -> KHONG thay han, chi doi chieu: so cua dong TO da chot duoc doc them 1 lan
// bang tieng Anh, ra so KHAC -> "khong doc duoc" (Ke toan xem bang mat) thay vi dua ra so co the sai. Tieng Anh khong ra so nao -> giu so cu.
async function doiChieuEng(so: SoTienDoc, bbox: { x0: number; y0: number; x1: number; y1: number }, docLai: DocLai): Promise<SoTienDoc> {
  if (so == null) return null;
  const eng = await docLai(bbox, 32, "eng");
  return eng.length === 0 || eng.includes(so) ? so : null;
}

/**
 * Tu cac dong OCR lan 1 ra so tien cuoi (tach khoi tesseract de kiem thu tren node). Dong so tien CAO -> cat rieng doc lai
 * (xem CAO_CAN_DOC_LAI). Lan 1 KHONG ra so nao nhung co dong chu so TO (so tien kieu VCB "15,617,600" kem chu "VND" nho
 * phia tren bi dinh vao so -> lan 1 ra rac) -> doc lai dong to nhat do 2 lan, 2 lan KHOP moi nhan (2026-09-30).
 */
export async function quyetDinhSoTien(lines: DongChu[], docLai: DocLai): Promise<SoTienDoc> {
  const chon = chonSoTien(lines);
  if (chon) {
    const dong = lines[chon.dong];
    if (dong.cao <= CAO_CAN_DOC_LAI || !dong.bbox) return chon.giaTri;
    const lan2 = await docLai(dong.bbox, 32);
    if (lan2.includes(chon.giaTri)) return doiChieuEng(chon.giaTri, dong.bbox, docLai);
    const lan3 = await docLai(dong.bbox, 24);
    return doiChieuEng([chon.giaTri, ...lan2].find((v) => lan3.includes(v)) ?? null, dong.bbox, docLai);
  }
  const to = lines
    .filter((d) => d.bbox && d.cao > CAO_CAN_DOC_LAI && (d.text.match(/\d/g)?.length ?? 0) >= 4 && !DONG_LOAI.test(boDau(d.text)))
    .sort((a, b) => b.cao - a.cao)[0];
  if (!to) return null;
  const lan2 = await docLai(to.bbox!, 32);
  if (!lan2.length) return null;
  const lan3 = await docLai(to.bbox!, 24);
  return doiChieuEng(lan2.find((v) => lan3.includes(v)) ?? null, to.bbox!, docLai);
}

export interface DongChu {
  text: string;
  cao: number; // chieu cao dong (px) - so tien giao dich thuong la chu TO nhat man hinh
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

const boDau = (s: string) =>
  chuanChuSo(s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase());
// Chuan hoa loi OCR quanh chu so (2026-10-29, ra soat anh that doc khong ra):
// - bo ngay / gio ("29/10/2026", "27-10-2026", "14:06:37") - tranh nhat "2026" thanh so tien;
// - chu "o" dinh sau chu so la so 0 ("2,812,90OVND" Agribank);
// - chu "đ" nho cuoi so bi doc thanh "4" ("191.2504" = 191.250đ Viettel Money): so co phan cach ma nhom cuoi 4 chu so tan cung "4".
function chuanChuSo(t: string): string {
  t = t.replace(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g, " ").replace(/\d{1,2}:\d{2}(:\d{2})?/g, " ");
  let cu = "";
  while (cu !== t) {
    cu = t;
    t = t.replace(/(\d[.,]?)o/g, "$10");
  }
  return t.replace(/(\d{1,3}(?:[.,]\d{3})+)4(?=\s|$)/g, "$1d");
}

// Dong KHONG phai so tien chuyen: so du, phi, so tai khoan, ma giao dich, ngay gio, hotline...
const DONG_LOAI = /(so du|balance|\bphi\b|\bfee\b|tai khoan|account|\bstk\b|\bso tk\b|ma (gd|giao dich|tham chieu)|tham chieu|\bref\b|transaction id|hotline|ngay|thoi gian|thai gian|\btime\b|\bgio\b|so the|ma don)/;
// Nhan thuong dung ngay truoc/cung dong voi so tien chuyen.
// + "chuyen thanh cong" (2026-09-30: Techcombank ghi "Chuyển thành công" ngay tren dong so tien).
const NHAN_TIEN = /(so tien|amount|chuyen tien|chuyen khoan thanh cong|chuyen thanh cong|giao dich thanh cong|thanh toan|da chuyen|tong tien)/;
// Nhan MANH (chac chan la tieu de cua so tien) vs nhan yeu "chuyen tien"/"thanh toan" chung chung (2026-11-12, PHIEN_BAN_OCR 4 - anh MBBank
// dang hoi thoai: moi bong bong "-181,000 VND" / "NGUYEN ... chuyen tien" nen dong mo ta cua bong bong TRUOC duoc tinh la nhan cho so cua
// bong bong SAU -> so cu 181.000 thang so 327.000 duoi "Chuyển tiền thành công"). Nhan yeu o dong tren chi +1, nhan manh +3.
const NHAN_MANH = /(thanh cong|so tien|amount|tong tien|da chuyen)/;
// Don vi tien dung TRUOC so ("VND 310,000" - Techcombank, 2026-09-30) hoac SAU so ("310.000 VND", "310.000đ"). Truoc so chi
// nhan "vnd"/"₫" (chu "d" le truoc so de nham). Nhom: 1 dau, 2 don vi truoc, 3 so, 4 don vi sau.
// (?!\d) sau nhom so: loi nhan "30 9 2026" truoc day thanh "9 202" = 9.202d (2026-09-30, anh Techcombank that); don vi
// truoc so chap nhan OCR doc lech "VNO"/"VN0".
const SO = /([+\-−–]?)\s*(vnd|vn d|vno|vn0|₫)?\s*(\d{1,3}(?:[.,  ]\d{3})+(?!\d)|\d{1,3}(?:[.,  ]?\d{3})*[.,  ]\d{3}(?:[.,  ]?\d{3})*(?!\d)|\d{4,})(?:[.,]\d{1,2}(?!\d))?\s*(vnd|vnđ|vn d|vnp|vn\b|vp\b|v\b|đ|₫|d\b|dong)?/gi;

/**
 * Chon so tien chuyen trong cac dong chu OCR (ham thuan, khong phu thuoc thu vien - de kiem thu). Cham diem: co don vi
 * tien (VND/đ), dong/dong truoc co nhan "Số tiền"/"Amount"..., co dau +/-, co dau phan cach hang nghin, tron nghin; bo
 * dong so du/phi/tai khoan/ma GD/ngay gio va day so dai khong don vi (so TK, ma GD). Khong du chac (diem < 3) -> null.
 */
export function tachSoTien(lines: DongChu[]): SoTienDoc {
  return chonSoTien(lines)?.giaTri ?? null;
}

/** Cac so tien (>= 1.000, co dau phan cach hoac don vi) co trong 1 chuoi - dung doi chieu lan doc lai. */
export function cacSoTrong(text: string): number[] {
  return [...boDau(text).matchAll(SO)].map(soHopLe).filter((x): x is SoKhop => x !== null && (x.donVi || x.coPhanCach)).map((x) => x.giaTri);
}

interface SoKhop { giaTri: number; donVi: boolean; coPhanCach: boolean; dau: boolean }
/** 1 cum so khop SO -> so tien hop le hoac null (so TK / ma GD / nam / toa do GPS / ngoai khoang). */
function soHopLe(m: RegExpMatchArray): SoKhop | null {
  const [, dau, donViTruoc, so, donViSau] = m;
  const donVi = !!(donViTruoc || donViSau);
  const coPhanCach = /[.,  ]/.test(so);
  const chuSo = so.replace(/[^\d]/g, "");
  if (!coPhanCach && !donVi && chuSo.length > 7) return null; // so TK / ma GD / so dien thoai
  // Thieu 1 dau phan cach ("3.948350VND" ACB, "28911 400đ" VPBank) chi nhan khi co don vi tien - tranh toa do GPS "105.743916" tren anh chup.
  if (coPhanCach && !donVi && !/^\d{1,3}([.,  ]\d{3})+$/.test(so)) return null;
  const giaTri = Number(chuSo);
  if (!coPhanCach && !donVi && giaTri >= 1900 && giaTri <= 2100) return null; // nam ("Tháng 10, 2026")
  if (!Number.isFinite(giaTri) || giaTri < 1000 || giaTri > 5_000_000_000) return null;
  return { giaTri, donVi, coPhanCach, dau: !!dau };
}

/** Nhu tachSoTien, kem vi tri dong chua so (de doc lai dong do). */
export function chonSoTien(lines: DongChu[]): { giaTri: number; dong: number } | null {
  let tot: { diem: number; cao: number; giaTri: number; dong: number } | null = null;
  lines.forEach((dong, i) => {
    const t = boDau(dong.text);
    if (DONG_LOAI.test(t)) return;
    // Nhan "Chuyển thành công"/"Số tiền" o toi da 3 dong phia tren (Techcombank: nhan -> 2 dong ten nguoi nhan -> so tien),
    // dung khi gap dong loai (so du, tai khoan...) - nhan do khong con thuoc so nay.
    let nhanTruoc: 0 | 1 | 2 = 0; // 2 = nhan manh, 1 = nhan yeu
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const tj = boDau(lines[j].text);
      if (DONG_LOAI.test(tj)) break;
      if (NHAN_TIEN.test(tj)) {
        nhanTruoc = NHAN_MANH.test(tj) ? 2 : 1;
        break;
      }
    }
    for (const m of t.matchAll(SO)) {
      const k = soHopLe(m);
      if (!k) continue;
      const { giaTri, donVi, coPhanCach } = k;
      const dau = k.dau;
      let diem = 0;
      if (donVi) diem += 3;
      if (NHAN_TIEN.test(t)) diem += 3;
      else if (nhanTruoc === 2) diem += 3;
      else if (nhanTruoc === 1) diem += 1;
      if (dau) diem += 1;
      if (coPhanCach) diem += 1;
      if (giaTri % 1000 === 0) diem += 1;
      if (diem < 3) continue;
      if (!tot || diem > tot.diem || (diem === tot.diem && (dong.cao > tot.cao || (dong.cao === tot.cao && giaTri > tot.giaTri)))) {
        tot = { diem, cao: dong.cao, giaTri, dong: i };
      }
    }
  });
  const kq = tot as { giaTri: number; dong: number } | null;
  return kq ? { giaTri: kq.giaTri, dong: kq.dong } : null;
}
