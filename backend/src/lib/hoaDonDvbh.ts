import type { Env } from "../types";
import { nhomHoaDonSql } from "./nhomLoaiDeXuat";

// Don co yeu cau XUAT HOA DON da duoc Ke toan chot (2026-11-14, chu he thong: "khi 1 don dat hang tren app linh kien duoc ke toan
// duyet => tao thanh 1 danh sach don xuat hoa don => ban thong tin sang dvbh"). He DVBH (repo "cloudflare smarttrade base",
// migration 0170, lib/hoaDonLk.ts) lap danh sach "Đơn xuất hóa đơn" + tu danh dau ca "co xuat hoa don".
//  - DAY: pushHoaDonPxkSangDvbh() ngay khi 1 PXK roi "Dang tao phieu"/"Cho ke toan" sang buoc da chot (Da chot xong don xuat /
//    Ke toan xac nhan Hang tru kho) -> POST {DVBH}/api/partner/sync/don-hoa-don. Best-effort (waitUntil), loi khong chan Ke toan.
//  - KEO: GET /api/partner/v1/don-hoa-don?tu_ngay= (routes/partnerApi.ts) - nut "Đồng bộ" ben DVBH bu cac lan day loi.
// "Da chot" = phieu_xuat_kho.chot_ke_toan_luc (trigger migration 0105). Bo phieu tra hang. Gui CA dong da huy (da_huy = 1) de DVBH
// bo danh dau thay vi giu dong cu.

export interface DongHoaDon {
  don_id: string;
  ma_ca: string | null; // "id1,id2" - dat_don_case, khong co thi ma_yeu_cau_su_co
  ma_lada: string | null;
  pxk_id: string;
  ma_misa: string | null;
  chot_ke_toan_luc: string | null;
  trang_thai_pxk: string | null;
  trang_thai_don: string | null;
  da_huy: number;
  yeu_cau_hoa_don: string | null;
  ma_lk: string | null;
  ten_lk: string | null;
  so_luong: number | null;
  loai_de_xuat: string | null;
  nguoi_nhan_hang: string | null;
}

const SELECT_DONG = `
  SELECT d.id AS don_id,
         COALESCE((SELECT group_concat(dc.case_id) FROM dat_don_case dc WHERE dc.dat_don_hang_id = d.id), NULLIF(TRIM(d.ma_yeu_cau_su_co), '')) AS ma_ca,
         NULLIF(TRIM(d.ma_lada), '') AS ma_lada,
         p.id AS pxk_id, p.ma_misa, p.chot_ke_toan_luc, p.trang_thai_hien_tai AS trang_thai_pxk, d.trang_thai_hien_tai AS trang_thai_don,
         CASE WHEN d.trang_thai_hien_tai = 'Da huy' OR p.trang_thai_hien_tai IN ('Ke toan huy', 'Da huy') THEN 1 ELSE 0 END AS da_huy,
         TRIM(d.yeu_cau_hoa_don) AS yeu_cau_hoa_don, d.ma_lk, d.ten_lk_snapshot AS ten_lk,
         COALESCE(d.so_luong_thuc_xuat, d.so_luong_de_xuat) AS so_luong, d.loai_de_xuat, d.nguoi_nhan_hang
  FROM phieu_xuat_kho p
  JOIN phieu_xuat_kho_dong pd ON pd.phieu_xuat_kho_id = p.id
  JOIN dat_don_hang d ON d.id = pd.dat_don_hang_id
  WHERE p.chot_ke_toan_luc IS NOT NULL AND COALESCE(p.loai_don, '') != 'tra_hang'
    AND ${nhomHoaDonSql("d.yeu_cau_hoa_don")} != ''`;

export async function docDongHoaDon(db: D1Database, opts: { pxkId?: string; tuNgay?: string }): Promise<DongHoaDon[]> {
  if (opts.pxkId) {
    const { results } = await db.prepare(`${SELECT_DONG} AND p.id = ?`).bind(opts.pxkId).all<DongHoaDon>();
    return results;
  }
  const { results } = await db
    .prepare(`${SELECT_DONG} AND p.chot_ke_toan_luc >= ? ORDER BY p.chot_ke_toan_luc DESC LIMIT 2000`)
    .bind(opts.tuNgay ?? "2026-11-01")
    .all<DongHoaDon>();
  return results;
}

export async function pushHoaDonPxkSangDvbh(env: Env, pxkId: string): Promise<void> {
  try {
    const rows = await docDongHoaDon(env.DB, { pxkId });
    if (!rows.length) return;
    const url = `${env.CASE_LOOKUP_BASE_URL.replace(/\/$/, "")}/api/partner/sync/don-hoa-don`;
    const res = await env.CASE_LOOKUP_SERVICE.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": env.DVBH_SYNC_API_KEY },
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[hoaDonDvbh] day that bai", pxkId, res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.error("[hoaDonDvbh] exception", pxkId, err instanceof Error ? err.message : err);
  }
}
