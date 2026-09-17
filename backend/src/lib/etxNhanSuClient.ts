import type { Env } from "../types";

// Client goi API doi tac "ETX nhan su" (xem KHOA-API-Thai3T.txt cap rieng cho he nay o goc repo) -
// nguon danh ba nhan su dong bo mot chieu vao bang etx_nhan_su (xem lib/etxNhanSuSync.ts). Domain la
// Google Cloud Function (asia-southeast1-...cloudfunctions.net), KHONG phai Worker cung tai khoan
// Cloudflare voi he nay - fetch() thang la du, giong tinh than gia88Client.ts (khong dinh loi 1042).
export interface EtxNhanSuItem {
  maNhanSu: string;
  hoTen: string;
  chucDanh: string | null;
  maChucDanh: string[];
  gmail: string | null;
  trangThaiLamViec: "on" | "off";
  taiKhoanLada: { maLada: string; tenLada: string } | null;
  quanLyTrucTiep: { maNhanSu: string; hoTen: string; gmail: string; chucDanhCuaToi: string }[];
}

interface EtxHrApiResponse {
  duLieuLuc: string;
  nguon: string;
  trangThaiLoc: string;
  tong: number;
  trang: number;
  soTrang: number;
  co: number;
  nhanSu: EtxNhanSuItem[];
}

const PAGE_SIZE = 1000;

// trangThai=all (KHONG dung mac dinh "on") - can bat ca nhan su da OFF de phat hien dung thoi diem
// chuyen ON->OFF/OFF->ON giua 2 lan dong bo (xem cascade khoa/mo khoa o etxNhanSuSync.ts). Gom toan
// bo cac trang vao 1 mang trong bo nho TRUOC khi tra ve - neu 1 trang giua chung loi, throw ngay,
// KHONG ghi DB do dang (tranh dong bo mot phan gay sai lech du lieu).
export async function fetchEtxNhanSuAll(env: Env): Promise<EtxNhanSuItem[]> {
  const base = env.ETX_HR_BASE_URL.replace(/\/$/, "");
  const items: EtxNhanSuItem[] = [];
  let trang = 1;
  let soTrang = 1;

  do {
    const url = `${base}/hrApi?trangThai=all&co=${PAGE_SIZE}&trang=${trang}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.ETX_HR_API_KEY}` },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ETX HR API tra loi ${res.status} (trang ${trang}): ${text.slice(0, 200)}`);
    }
    const body = await res.json<EtxHrApiResponse>();
    items.push(...body.nhanSu);
    soTrang = body.soTrang;
    trang++;
  } while (trang <= soTrang);

  return items;
}
