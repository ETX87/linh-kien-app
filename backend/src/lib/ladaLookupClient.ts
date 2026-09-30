import { strFromU8, unzipSync } from "fflate";
import type { Env } from "../types";

// Tra cuu "Mã Lada liên quan" (2026-09-30) - port tu App Khieu nai (backend/src/lib/center3tClient.ts), cung API
// noi bo nhan vien "center.dichvu3t.com" - API 3 "Tai chi dinh Ecolada theo ID LADA"
// (POST /api/v1/export-excel-order-get-data, tai lieu api_document_staff.md ben repo App Khieu nai). API tra ve
// file .xlsx nhi phan (khong phai JSON) -> tu giai nen (fflate) + doc XML lay dong du lieu dau tien. SDT/dia chi
// da duoc ben kia che san; o day con loc tiep chi giu vai truong de nguoi tao don doi chieu (ladaPreview).
const API_PATH = "/api/v1/export-excel-order-get-data";

export type LadaOrderRow = Record<string, string>;

export interface LadaLookupResult {
  found: boolean;
  row?: LadaOrderRow;
  warning?: string;
}

// Dinh dang ID LADA: 1 chu cai + so (vd D1154680, B1391729). Loc som truoc khi goi API ngoai (tranh goi
// cho moi ky tu dang go do) - ban sao FE: isLikelyLadaId() o MaLadaCheck.tsx.
export function isLikelyLadaId(id: string): boolean {
  return /^[A-Z]\d{5,}$/i.test(id);
}

export async function lookupLada(env: Env, idLada: string): Promise<LadaLookupResult> {
  if (!env.CENTER3T_API_TOKEN || !env.CENTER3T_API_BASE) return { found: false, warning: "CENTER3T_NOT_CONFIGURED" };

  let res: Response;
  try {
    res = await fetch(`${env.CENTER3T_API_BASE}${API_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CENTER3T_API_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ codes: [idLada] }),
    });
  } catch {
    return { found: false, warning: "CENTER3T_NETWORK_ERROR" };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("spreadsheet")) {
    return { found: false, warning: `CENTER3T_HTTP_${res.status}` };
  }

  let sheetXml: string;
  try {
    const buf = new Uint8Array(await res.arrayBuffer());
    const unzipped = unzipSync(buf, { filter: (f) => f.name === "xl/worksheets/sheet1.xml" });
    const file = unzipped["xl/worksheets/sheet1.xml"];
    if (!file) return { found: false, warning: "CENTER3T_PARSE_FAILED" };
    sheetXml = strFromU8(file);
  } catch {
    return { found: false, warning: "CENTER3T_PARSE_FAILED" };
  }

  const row = parseFirstDataRow(sheetXml);
  if (!row) return { found: false }; // ID khong ton tai - khong phai loi, file chi co dong tieu de.
  return { found: true, row };
}

export interface LadaPreview {
  khach_hang: string | null;
  ky_thuat_vien: string | null;
  trang_thai: string | null;
  model: string | null;
  hang: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  ngay_khoi_tao: string | null;
  ngay_chot_don: string | null;
}

// Tap nho da chon (cung ten cot ma App Khieu nai doc tu file ECO LADA V2) - KHONG tra nguyen dong 122 cot ve trinh duyet.
export function ladaPreview(r: LadaOrderRow): LadaPreview {
  const str = (label: string) => {
    const v = r[label]?.trim();
    return v ? v : null;
  };
  return {
    khach_hang: str("Tên KH"),
    ky_thuat_vien: str("Kỹ Thuật Viên"),
    trang_thai: str("Trạng thái"),
    model: str("Model máy"),
    hang: str("Nhãn hiệu máy"),
    tinh: str("Tỉnh/Thành"),
    quan_huyen: str("Quận/Huyện"),
    ngay_khoi_tao: str("Ngày khởi tạo"),
    ngay_chot_don: str("Ngày Chốt Đơn"),
  };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/g, "\r")
    .replace(/&#xA;/g, "\n")
    .replace(/&amp;/g, "&");
}

const CELL_RE = /<c r="([A-Z]+)\d+"[^>]*>(?:<is><t[^>]*>([\s\S]*?)<\/t><\/is>|<v>([\s\S]*?)<\/v>)?<\/c>/g;

// Doc dong tieu de (row 1) + dong du lieu dau tien (row 2) - moi lan chi gui 1 ID LADA => toi da 1 dong ket qua.
function parseFirstDataRow(xml: string): LadaOrderRow | null {
  const headerMatch = xml.match(/<row r="1"[^>]*>([\s\S]*?)<\/row>/);
  const dataMatch = xml.match(/<row r="2"[^>]*>([\s\S]*?)<\/row>/);
  if (!headerMatch || !dataMatch) return null;

  const headers: Record<string, string> = {};
  CELL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CELL_RE.exec(headerMatch[1]))) {
    headers[m[1]] = decodeXmlEntities(m[2] ?? m[3] ?? "");
  }

  const row: LadaOrderRow = {};
  CELL_RE.lastIndex = 0;
  while ((m = CELL_RE.exec(dataMatch[1]))) {
    const label = headers[m[1]];
    if (label) row[label] = decodeXmlEntities(m[2] ?? m[3] ?? "");
  }
  return row;
}
