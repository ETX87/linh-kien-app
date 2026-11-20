import type { Env } from "../types";

/**
 * Doc ket qua Mua hang (app EO mua hang - Worker "muahang") theo ID (v1.543, 20/11/2026).
 * Yeu cau: "dựa vào ID case và ID đơn hàng để trả kết quả về bên app linh kiện".
 * Ben muahang: GET /api/partner/theo-id?ids=<ma|ma>&po_lk=<3TDO~MA_LK|...> (X-API-Key = DOC_API_KEY ben do, chi doc).
 *  - ids khop o "ID CRM" HOAC "ID đặt hàng" cua dong EO (tach tung ma trong o, khong phan biet hoa thuong): ma don DDH-..., ticket TLK-..., ma case.
 *  - po_lk: ticket da ghi ma EO (3TDO-...) khi "Mua hàng đã đặt" -> dong cua PO do co ma LK cua don.
 * Service Binding (cung tai khoan Cloudflare, fetch() thang URL bi chan 1042). Loi / chua cau hinh -> null (FE hien "chưa kết nối").
 */
export interface DongMuaHang {
  khop_theo: string[];
  eo_item_id: number; eo_id: number; eo_code: string; ma_phe_duyet: string | null; link: string;
  trang_thai_eo: string; ngay_ban_hanh: string | null; ngay_dat_hang: string | null; nguoi_dat: string | null;
  id_crm: string | null; id_dat_hang: string | null;
  ma_lk: string; ma_lk_goc: string | null; ten_lk: string; kho: string; doi_tac: string | null;
  sl_dat: number; sl_ve: number; sl_con_thieu: number; trang_thai: string; ket_thuc: boolean;
  ngay_du_kien: string | null; ngay_nm_cam_ket: string | null; ngay_ve_gan_nhat: string | null; canh_bao: string | null; so_lan_lui: number;
}

export async function layKetQuaMuaHang(env: Env, ids: string[], poLk: string[]): Promise<{ rows: DongMuaHang[]; khong_khop: string[] } | null> {
  if (!env.MUAHANG_SERVICE || !env.MUAHANG_DOC_API_KEY) return null;
  const sach = (a: string[]) => [...new Set(a.map((x) => x.trim()).filter(Boolean))].slice(0, 50);
  const i = sach(ids), p = sach(poLk);
  if (!i.length && !p.length) return { rows: [], khong_khop: [] };
  const qs = new URLSearchParams();
  if (i.length) qs.set("ids", i.join("|"));
  if (p.length) qs.set("po_lk", p.join("|"));
  try {
    const res = await env.MUAHANG_SERVICE.fetch(`https://muahang.dichvu3t.workers.dev/api/partner/theo-id?${qs}`, {
      headers: { "X-API-Key": env.MUAHANG_DOC_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("muahang theo-id", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const j = (await res.json()) as { rows?: DongMuaHang[]; khong_khop?: string[] };
    return { rows: j.rows ?? [], khong_khop: j.khong_khop ?? [] };
  } catch (e) {
    console.error("muahang theo-id", e);
    return null;
  }
}
