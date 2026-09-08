// Parser cho file "Tổng hợp tồn kho" xuat tu MISA (them 2026-08-29, phan hoi nguoi dung: "import file
// này lên hàng ngày" de xay Settings "Tồn kho công nợ KTV"). Ho tro 2 bien the da xac nhan thuc te
// (them bien the 2 vao 2026-09-08, phan hoi file mau "ton kho ton quoc - demo.xlsx"):
//  1. Bien the "theo tung KTV": gom NHIEU khoi "Kho: <tên kho>, Từ ngày dd/mm/yyyy đến ngày
//     dd/mm/yyyy" xep lien tiep - moi khoi la ton kho cua 1 KTV/tram, ket bang 1 dong "Tổng cộng" phu
//     (con ca file ket 1 dong "Tổng cộng" toan bo).
//  2. Bien the "toan quoc" (1 bang phang, MOI dong da co san cot "Mã kho" rieng, khong chia khoi):
//     2 dong tieu de + 1 dong trong TRUOC dong tieu de cot (dong tieu de cot vi vay "lui xuong duoi"
//     thay vi o dong 1), dong tieu de 2 la moc "Ngày dd tháng mm năm yyyy" (1 thoi diem, khong phai
//     khoang Từ ngày...đến ngày...), va co THEM 1 dong phu "Số lượng" ngay duoi dong tieu de cot
//     (dong con cua tieu de gop Đầu kỳ/Nhập kho/Xuất kho/Cuối kỳ, merge cell 2 tang).
// KHONG can tach block hay dem so dong tieu de - chi can tim 1 LAN dong tieu de cot (chua "Mã hàng")
// O BAT KY VI TRI NAO (khong gia dinh la dong 1) de xac dinh vi tri cac cot theo TEN (chong chiu thay
// doi thu tu cot), sau do loc MOI dong co ca "Mã hàng" lan "Mã kho" khac rong lam dong du lieu that
// su - tu dong bo qua dong "Kho: ...", dong trong, dong "Tổng cộng", dong phu "Số lượng" (deu co "Mã
// hàng" rong).
export interface TonKhoImportRow {
  ma_kho: string;
  // "Tên kho" (them 2026-09-08) - ten nguoi trong file MISA, KHONG dung de khop (van khop qua ma_kho
  // <-> ma_misa nhu cu) - chi luu lai lam goi y nhan dien khi Admin/Ke toan chon bo sung Mã MISA tu
  // danh sach "chưa khớp" (xem backend/src/routes/ktvTonKho.ts GET /ma-kho-chua-khop).
  ten_kho?: string;
  ma_hang: string;
  ten_hang?: string;
  dvt?: string;
  dau_ky?: number;
  nhap_kho?: number;
  xuat_kho?: number;
  cuoi_ky?: number;
}
export interface TonKhoParseResult {
  rows: TonKhoImportRow[];
  ky_tu_ngay: string | null;
  ky_den_ngay: string | null;
}

const HEADER_ALIASES: Record<string, string[]> = {
  ma_kho: ["Mã kho"],
  ten_kho: ["Tên kho"],
  ma_hang: ["Mã hàng"],
  ten_hang: ["Tên hàng"],
  dvt: ["ĐVT"],
  dau_ky: ["Đầu kỳ"],
  nhap_kho: ["Nhập kho"],
  xuat_kho: ["Xuất kho"],
  cuoi_ky: ["Cuối kỳ"],
};

function toNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function cellText(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

interface ZipEntry {
  name: string;
  crc32: number;
  compSize: number;
  method: number;
  localOffset: number;
}

// File MISA xuat ra co stream DEFLATE ma ca bo giai nen JS thuan cua thu vien "xlsx" (SheetJS) LAN
// "jszip" deu doc sai (tra ve sheet rong hoac loi "uncompressed data size mismatch") - da xac minh
// bang doi chieu voi zlib that (Python) va DecompressionStream native cua trinh duyet, ca 2 deu giai
// nen dung 1840 -> 9491 byte. SheetJS/JSZip chi dung nativ zlib khi chay tren Node (qua module
// "zlib"), con tren browser roi ve bo giai nen JS thuan tu viet, kem manh hon zlib that - day la loi
// da biet cua ca 2 thu vien, khong phai loi file. Fix: tu unzip bang DecompressionStream("deflate-raw")
// (co san tren moi trinh duyet hien dai) roi dong goi lai thanh zip KHONG nen (STORE), luc do
// XLSX.read() doc binh thuong vi khong con phai tu giai nen DEFLATE nua.
async function repackAsStoreZip(data: ArrayBuffer): Promise<ArrayBuffer> {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Không phải file zip hợp lệ");

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdCount = view.getUint16(eocdOffset + 10, true);

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("Central directory không hợp lệ");
    const method = view.getUint16(p + 10, true);
    const crc32 = view.getUint32(p + 16, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, crc32, compSize, method, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const outParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const lp = e.localOffset;
    if (view.getUint32(lp, true) !== 0x04034b50) throw new Error("Local file header không hợp lệ");
    const lNameLen = view.getUint16(lp + 26, true);
    const lExtraLen = view.getUint16(lp + 28, true);
    const dataStart = lp + 30 + lNameLen + lExtraLen;
    const compBytes = bytes.subarray(dataStart, dataStart + e.compSize);

    let content: Uint8Array;
    if (e.method === 0) {
      content = compBytes;
    } else if (e.method === 8) {
      const stream = new Blob([compBytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      content = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error("Không hỗ trợ phương thức nén " + e.method);
    }

    const nameBytes = new TextEncoder().encode(e.name);
    const entryOffset = offset;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, e.crc32, true);
    lv.setUint32(18, content.length, true);
    lv.setUint32(22, content.length, true);
    lv.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    outParts.push(localHeader, content);
    offset += localHeader.length + content.length;

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, e.crc32, true);
    cv.setUint32(20, content.length, true);
    cv.setUint32(24, content.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, entryOffset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
  }

  const cdStart = offset;
  for (const part of centralParts) {
    outParts.push(part);
    offset += part.length;
  }
  const cdSize = offset - cdStart;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  outParts.push(eocd);

  const total = outParts.reduce((s, part) => s + part.length, 0);
  const result = new Uint8Array(total);
  let o = 0;
  for (const part of outParts) {
    result.set(part, o);
    o += part.length;
  }
  return result.buffer;
}

export async function parseTonKhoImportFile(file: File): Promise<TonKhoParseResult> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  let readData: ArrayBuffer = data;
  if (typeof DecompressionStream !== "undefined") {
    try {
      readData = await repackAsStoreZip(data);
    } catch {
      readData = data;
    }
  }
  const workbook = XLSX.read(readData, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });

  // Tim dong tieu de ky bao cao - 2 dinh dang da xac nhan (xem comment dau file): khoang "Từ ngày...
  // đến ngày..." (bien the theo tung KTV) hoac 1 moc "Ngày dd tháng mm năm yyyy" (bien the toan
  // quoc, dung CHUNG lam ca ky_tu_ngay lan ky_den_ngay vi day la bao cao chup nhanh 1 thoi diem).
  let kyTuNgay: string | null = null;
  let kyDenNgay: string | null = null;
  for (const row of raw) {
    const cell = row?.[0];
    if (typeof cell !== "string") continue;
    const rangeMatch = cell.match(/Từ ngày (\d{2}\/\d{2}\/\d{4}) đến ngày (\d{2}\/\d{2}\/\d{4})/);
    if (rangeMatch) {
      kyTuNgay = rangeMatch[1];
      kyDenNgay = rangeMatch[2];
      break;
    }
    const asOfMatch = cell.match(/Ngày (\d{1,2}) tháng (\d{1,2}) năm (\d{4})/);
    if (asOfMatch) {
      const asOf = `${asOfMatch[1].padStart(2, "0")}/${asOfMatch[2].padStart(2, "0")}/${asOfMatch[3]}`;
      kyTuNgay = asOf;
      kyDenNgay = asOf;
      break;
    }
  }

  let headerRowIdx = -1;
  const colIndex: Record<string, number> = {};
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    const idx = row.findIndex((v) => typeof v === "string" && v.trim() === "Mã hàng");
    if (idx >= 0) {
      headerRowIdx = i;
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        const colIdx = row.findIndex((v) => typeof v === "string" && aliases.includes(v.trim()));
        if (colIdx >= 0) colIndex[key] = colIdx;
      }
      break;
    }
  }
  if (headerRowIdx < 0 || colIndex.ma_kho == null || colIndex.ma_hang == null) {
    return { rows: [], ky_tu_ngay: kyTuNgay, ky_den_ngay: kyDenNgay };
  }

  const rows: TonKhoImportRow[] = [];
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    const maHang = cellText(row[colIndex.ma_hang]);
    const maKho = cellText(row[colIndex.ma_kho]);
    // Bo qua dong "Kho: ...", dong trong, dong "Tổng cộng" (Ma hang rong) va dong tieu de lap lai
    // (neu MISA lap lai header moi khoi kho - phong ho, hiem gap).
    if (!maHang || !maKho || maHang === "Mã hàng" || maKho === "Mã kho") continue;
    rows.push({
      ma_kho: maKho,
      ten_kho: colIndex.ten_kho != null ? cellText(row[colIndex.ten_kho]) : undefined,
      ma_hang: maHang,
      ten_hang: colIndex.ten_hang != null ? cellText(row[colIndex.ten_hang]) : undefined,
      dvt: colIndex.dvt != null ? cellText(row[colIndex.dvt]) : undefined,
      dau_ky: colIndex.dau_ky != null ? toNumber(row[colIndex.dau_ky]) : undefined,
      nhap_kho: colIndex.nhap_kho != null ? toNumber(row[colIndex.nhap_kho]) : undefined,
      xuat_kho: colIndex.xuat_kho != null ? toNumber(row[colIndex.xuat_kho]) : undefined,
      cuoi_ky: colIndex.cuoi_ky != null ? toNumber(row[colIndex.cuoi_ky]) : undefined,
    });
  }
  return { rows, ky_tu_ngay: kyTuNgay, ky_den_ngay: kyDenNgay };
}
