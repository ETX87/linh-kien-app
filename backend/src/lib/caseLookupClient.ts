import type { Env } from "../types";

// Diem noi DUY NHAT toi he DVBH goc (xem CLAUDE.md muc "Nguon goc tach he thong") - tra cuu 1 case
// su co THEO ID, chi doc, khong ghi gi ca. Goi sang route `/api/partner/case-lookup` cua he goc (xem
// DEPLOY.md muc "Thiet lap ket noi he cu" - Admin he goc tao 1 API key rieng cho he nay qua UI
// Settings > API doi tac co san). Khai bao DAY DU 29 field theo PARTNER_API_GUIDE.md (kha nang doi
// tac tra ve) - GET /kiem-tra-ma-yeu-cau (canh bao mem luc tao don) chi CHON 9 field de hien, con
// GET /case-detail/:id (man "Xem chi tiet case", xem migration 0008) tra nguyen ca object nay.
export interface CaseLookupPreview {
  ky_thuat_vien: string | null;
  khach_hang: string | null;
  seri_san_pham: string | null;
  khu_vuc: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  hang: string | null;
  san_pham_bao_hanh: string | null;
  tien_do_hoan_thanh: string | null;
  mo_ta_loi: string | null;
  nhom_san_pham: string | null;
  nhom_yeu_cau: string | null;
  loai_yeu_cau: string | null;
  hinh_thuc_bao_hanh: string | null;
  ngay_mua: string | null;
  thoi_gian_cskh_tiep_nhan: string | null;
  thoi_gian_hen_xu_ly: string | null;
  thoi_gian_hoan_thanh: string | null;
  doi_tac: string | null;
  link_crm: string | null;
  noi_dung_xu_ly: string | null;
  luu_y_loi_linh_kien: string | null;
  cach_thuc_xu_ly: string | null;
  nganh: string | null;
  loai_nganh: string | null;
  nhom_kh: string | null;
  dt_san_pham: number | null;
  dt_linh_kien: number | null;
  dt_dich_vu: number | null;
  ly_do_qua_han: string | null;
}

export async function lookupCase(id: string, env: Env): Promise<CaseLookupPreview | null> {
  const url = `${env.CASE_LOOKUP_BASE_URL.replace(/\/$/, "")}/api/partner/case-lookup?id=${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, { headers: { "X-API-Key": env.CASE_LOOKUP_API_KEY } });
    // Neu route ben he goc chua deploy/sai URL, co the nhan ve trang SPA fallback (200 OK, HTML) thay
    // vi JSON that - kiem tra Content-Type truoc khi parse de tranh SyntaxError lam sap ca request
    // (vd "kiem-tra-ma-yeu-cau" tra 500 thay vi "khong tim thay case" nhu mong doi).
    if (!res.ok || !(res.headers.get("Content-Type") ?? "").includes("application/json")) return null;
    const body = await res.json<{ found: boolean; preview: CaseLookupPreview | null }>();
    return body.found ? body.preview : null;
  } catch {
    return null;
  }
}

/** Tra cuu nhieu ID cung luc (vd danh sach case lien ket 1 don hang) - song song, boc loi tung cai
 * (1 case_lookup that bai khong lam hong ca danh sach). */
export async function lookupCases(ids: string[], env: Env): Promise<Map<string, CaseLookupPreview>> {
  const uniqueIds = [...new Set(ids)];
  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        return [id, await lookupCase(id, env)] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  );
  const map = new Map<string, CaseLookupPreview>();
  for (const [id, preview] of results) {
    if (preview) map.set(id, preview);
  }
  return map;
}
