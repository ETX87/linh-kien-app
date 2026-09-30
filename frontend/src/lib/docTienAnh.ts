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

let workerP: Promise<Worker> | null = null;
function layWorker(): Promise<Worker> {
  if (!workerP) {
    workerP = import("tesseract.js")
      .then((T) =>
        T.createWorker("vie", 1 /* OEM.LSTM_ONLY */, {
          workerPath: "/ocr/worker.min.js",
          corePath: "/ocr/core",
          langPath: "/ocr/lang",
          gzip: true,
        }),
      )
      .catch((e) => {
        workerP = null; // lan sau thu lai (vd mat mang luc tai thu vien)
        throw e;
      });
  }
  return workerP;
}

// Anh vua chon tren may (KTV) - doc thang tu file, khong phai tai lai tu Drive.
const anhCucBo = new Map<string, Blob>();
export function ghiNhoAnhCucBo(url: string, file: Blob) {
  anhCucBo.set(url, file);
}

// 1 lan doc / 1 anh / 1 phien lam viec. Worker xu ly tuan tu -> xep hang de anh sau khong tranh anh truoc.
const daDoc = new Map<string, Promise<SoTienDoc>>();
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

export function docSoTienAnh(url: string): Promise<SoTienDoc> {
  const cu = daDoc.get(url);
  if (cu) return cu;
  const p = (hang = hang.then(async () => {
    const worker = await layWorker();
    const anh = anhCucBo.get(url) ?? (await (await fetch(urlDocDuoc(url), { mode: "cors" })).blob());
    const { data } = await worker.recognize(anh, {}, { blocks: true, text: false });
    const lines: DongChu[] = (data.blocks ?? []).flatMap((b) =>
      b.paragraphs.flatMap((p) => p.lines.map((l: Line) => ({ text: l.text, cao: Math.max(0, l.bbox.y1 - l.bbox.y0), bbox: l.bbox }))),
    );
    const chon = chonSoTien(lines);
    if (!chon) return null;
    const dong = lines[chon.dong];
    if (dong.cao <= CAO_CAN_DOC_LAI || !dong.bbox) return chon.giaTri;
    const bmp = await createImageBitmap(anh);
    try {
      const docLai = async (caoMoi: number) => {
        const cat = await catDong(bmp, dong.bbox!, caoMoi);
        return cat ? cacSoTrong((await worker.recognize(cat, {}, { text: true })).data.text) : [];
      };
      const lan2 = await docLai(32);
      if (lan2.includes(chon.giaTri)) return chon.giaTri;
      const lan3 = await docLai(24);
      return [chon.giaTri, ...lan2].find((v) => lan3.includes(v)) ?? null;
    } finally {
      bmp.close();
    }
  })) as Promise<SoTienDoc>;
  // Loi (mang/CORS/anh hong) = khong doc duoc; bo khoi cache de lan mo sau thu lai.
  const kq = p.catch(() => {
    daDoc.delete(url);
    return null;
  });
  daDoc.set(url, kq);
  return kq;
}

export interface DongChu {
  text: string;
  cao: number; // chieu cao dong (px) - so tien giao dich thuong la chu TO nhat man hinh
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

const boDau = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

// Dong KHONG phai so tien chuyen: so du, phi, so tai khoan, ma giao dich, ngay gio, hotline...
const DONG_LOAI = /(so du|balance|\bphi\b|\bfee\b|tai khoan|account|\bstk\b|\bso tk\b|ma (gd|giao dich|tham chieu)|tham chieu|\bref\b|transaction id|hotline|ngay|thoi gian|\btime\b|\bgio\b|so the|ma don)/;
// Nhan thuong dung ngay truoc/cung dong voi so tien chuyen.
// + "chuyen thanh cong" (2026-09-30: Techcombank ghi "Chuyển thành công" ngay tren dong so tien).
const NHAN_TIEN = /(so tien|amount|chuyen tien|chuyen khoan thanh cong|chuyen thanh cong|giao dich thanh cong|thanh toan|da chuyen|tong tien)/;
// Don vi tien dung TRUOC so ("VND 310,000" - Techcombank, 2026-09-30) hoac SAU so ("310.000 VND", "310.000đ"). Truoc so chi
// nhan "vnd"/"₫" (chu "d" le truoc so de nham). Nhom: 1 dau, 2 don vi truoc, 3 so, 4 don vi sau.
const SO = /([+\-−–]?)\s*(vnd|vn d|₫)?\s*(\d{1,3}(?:[.,  ]\d{3})+|\d{4,})(?:[.,]\d{1,2}(?!\d))?\s*(vnd|vnđ|vn d|đ|₫|d\b|dong)?/gi;

/**
 * Chon so tien chuyen trong cac dong chu OCR (ham thuan, khong phu thuoc thu vien - de kiem thu). Cham diem: co don vi
 * tien (VND/đ), dong/dong truoc co nhan "Số tiền"/"Amount"..., co dau +/-, co dau phan cach hang nghin, tron nghin; bo
 * dong so du/phi/tai khoan/ma GD/ngay gio va day so dai khong don vi (so TK, ma GD). Khong du chac (diem < 3) -> null.
 */
export function tachSoTien(lines: DongChu[]): SoTienDoc {
  return chonSoTien(lines)?.giaTri ?? null;
}

/** Cac so tien (>= 1.000) co trong 1 chuoi - dung doi chieu lan doc lai. */
export function cacSoTrong(text: string): number[] {
  return [...boDau(text).matchAll(SO)].map((m) => Number(m[3].replace(/[^\d]/g, ""))).filter((v) => Number.isFinite(v) && v >= 1000 && v <= 5_000_000_000);
}

/** Nhu tachSoTien, kem vi tri dong chua so (de doc lai dong do). */
export function chonSoTien(lines: DongChu[]): { giaTri: number; dong: number } | null {
  let tot: { diem: number; cao: number; giaTri: number; dong: number } | null = null;
  lines.forEach((dong, i) => {
    const t = boDau(dong.text);
    if (DONG_LOAI.test(t)) return;
    const truoc = i > 0 ? boDau(lines[i - 1].text) : "";
    for (const m of t.matchAll(SO)) {
      const [, dau, donViTruoc, so, donViSau] = m;
      const donVi = donViTruoc || donViSau;
      const coPhanCach = /[.,  ]/.test(so);
      const chuSo = so.replace(/[^\d]/g, "");
      if (!coPhanCach && !donVi && chuSo.length > 7) continue; // so TK / ma GD / so dien thoai
      const giaTri = Number(chuSo);
      if (!Number.isFinite(giaTri) || giaTri < 1000 || giaTri > 5_000_000_000) continue;
      let diem = 0;
      if (donVi) diem += 3;
      if (NHAN_TIEN.test(t)) diem += 3;
      else if (NHAN_TIEN.test(truoc) && !DONG_LOAI.test(truoc)) diem += 2;
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
