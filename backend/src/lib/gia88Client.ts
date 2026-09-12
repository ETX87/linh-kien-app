import type { Env } from "../types";

// Client goi API doi tac "gia88" (xem api-lk-prices_gia88.md o goc repo) - nguon chinh cap nhat danh
// muc linh_kien tu 2026-09-12 (xem lib/gia88Sync.ts). Chi PULL 1 chieu, khong ghi gi ve phia doi tac.
// Domain la Google Cloud Function (asia-southeast1-...cloudfunctions.net), KHONG phai Worker cung tai
// khoan Cloudflare voi he nay - fetch() thang la du, KHONG dinh loi 1042 nhu caseLookupClient.ts (loi
// do chi xay ra khi ca 2 dau la Worker cung 1 tai khoan Cloudflare).
export interface Gia88Item {
  ma: string;
  nhanHang: string | null;
  thietBi: string | null;
  tenLinhKien: string;
  donViNhap: string | null;
  donViTinh: string | null;
  giaNY: number | null;
  giaKTV: number | null;
  giaDuPhong: number | null;
  giaEU: number | null;
  ghiChuDacBiet: string | null;
  camBan: boolean;
}

interface Gia88Response {
  brand: string;
  count: number;
  generatedAt: string;
  currency: string;
  items: Gia88Item[];
}

// brand co dinh "3t" (dung brand cua chinh he nay - xem CLAUDE.md, thu muc goc "QLBH 3T") - doi tac
// con ho tro "dmkp" nhung khong lien quan he nay, khong pull.
const BRAND = "3t";

export async function fetchGia88Prices(env: Env): Promise<Gia88Item[]> {
  const url = `${env.GIA88_BASE_URL.replace(/\/$/, "")}/lkPrices?brand=${BRAND}`;
  // Timeout 60s theo dung khuyen nghi cua tai lieu doi tac (danh sach co the vai nghin dong).
  const res = await fetch(url, {
    headers: { "x-api-key": env.GIA88_API_KEY },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok || !(res.headers.get("Content-Type") ?? "").includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(`gia88 tra loi ${res.status} (Content-Type: ${res.headers.get("Content-Type")}): ${text.slice(0, 200)}`);
  }
  const body = await res.json<Gia88Response>();
  return body.items;
}
