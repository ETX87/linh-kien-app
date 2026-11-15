import type { Env } from "../types";

// Tra cuu don bao hanh tren app "Bảo hành đổi trả 3T" (Worker suachua) qua Service Binding SUACHUA_SYNC_SERVICE + X-Sync-Key (cung khoa
// dong bo da dung cho POST /api/partner/sync/thieu-hang - lib/thieuHangBh.ts). Dung cho o "Mã đơn bảo hành" cua don CÔNG NỢ SỬA CHỮA
// (v1.496): goi y don vi NV dang sua + xac minh lien ket luc tao don. Loi mang / app kia chua co API -> tra rong, KHONG chan dat hang.

export interface DonBh {
  id: string;
  parent_id: string;
  case_id: string | null;
  ma_lk: string | null;
  ten_lk: string | null;
  san_pham_bh: string | null;
  ten_khach_hang: string | null;
  trang_thai: string;
  nguoi_sua_chua: string | null;
}

async function goi<T>(env: Env, query: Record<string, string>): Promise<T | null> {
  if (!env.SUACHUA_SYNC_SERVICE || !env.SUACHUA_SYNC_API_KEY) return null;
  const qs = new URLSearchParams(query).toString();
  try {
    const r = await env.SUACHUA_SYNC_SERVICE.fetch(`${env.SUACHUA_SYNC_BASE_URL}/api/partner/sync/don-vi-sua-chua?${qs}`, {
      headers: { "X-Sync-Key": env.SUACHUA_SYNC_API_KEY },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** Goi y: co q (>= 2 ky tu) = tim moi don vi theo ma / ma case; khong co = don vi NV (email) dang sua. null = khong ket noi duoc. */
export async function goiYDonBh(env: Env, email: string, q: string): Promise<DonBh[] | null> {
  const kq = await goi<{ rows: DonBh[] }>(env, q.trim().length >= 2 ? { q: q.trim() } : { email });
  return kq ? kq.rows ?? [] : null;
}

/** Tra 1 ma (don vi "DH-000123-1" hoac don cha "DH-000123"). undefined = khong ket noi duoc, null = khong co tren app doi tra. */
export async function traDonBh(env: Env, ma: string): Promise<DonBh | null | undefined> {
  const kq = await goi<{ row: DonBh | null }>(env, { ma });
  return kq ? kq.row : undefined;
}
