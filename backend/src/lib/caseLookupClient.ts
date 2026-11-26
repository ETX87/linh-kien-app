import type { Env } from "../types";

// Diem noi DUY NHAT toi he DVBH goc (xem CLAUDE.md muc "Nguon goc tach he thong") - tra cuu 1 case
// su co THEO ID, chi doc, khong ghi gi ca. Goi sang route `/api/partner/case-lookup` cua he goc (xem
// DEPLOY.md muc "Thiet lap ket noi he cu" - Admin he goc tao 1 API key rieng cho he nay qua UI
// Settings > API doi tac co san). Khai bao DAY DU 35 field theo PARTNER_API_GUIDE.md (kha nang doi
// tac tra ve, mo rong 2026-09-11: +ngay_import/ngay_cap_nhat_gan_nhat/dung_han/xu_ly_24h_bucket/
// ly_do_huy/link_hinh_anh) - GET /kiem-tra-ma-yeu-cau (canh bao mem luc tao don) chi CHON 9 field de
// hien, con GET /case-detail/:id (man "Xem chi tiet case", xem migration 0008) tra nguyen ca object
// nay (qua lookupCaseFull, kem lich su giai trinh).
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
  ngay_import: string | null;
  ngay_cap_nhat_gan_nhat: string | null;
  dung_han: string | null;
  xu_ly_24h_bucket: string | null;
  ly_do_huy: string | null;
  link_hinh_anh: string[];
}

// Lich su giai trinh cham tre cua case (them 2026-09-07, xem PARTNER_API_GUIDE.md muc 3.3) - mang
// rieng, khong nam trong `preview`, chi lay khi can hien day du (GET /case-detail/:id) qua
// lookupCaseFull(); lookupCase()/lookupCases() (dung o cac cho chi can preview nhanh) bo qua field nay.
export interface CaseLookupGiaiTrinh {
  case_id: string;
  ly_do_cham: string;
  noi_dung: string | null;
  ngay_giai_trinh: string;
}

interface CaseLookupRawResponse {
  found: boolean;
  preview: CaseLookupPreview | null;
  giaiTrinh?: CaseLookupGiaiTrinh[];
}

async function fetchCaseLookupRaw(id: string, env: Env): Promise<CaseLookupRawResponse | null> {
  // DVBH luu ma chu HOA ("SC26100799", "T25258") va tra cuu khop dung - KTV hay go thuong ("sc26100171") -> quy ve chu hoa.
  if (/^(tsc|sc|t)\d+$/i.test(id)) id = id.toUpperCase(); // + "TSC" + so (v1.573)
  const url = `${env.CASE_LOOKUP_BASE_URL.replace(/\/$/, "")}/api/partner/case-lookup?id=${encodeURIComponent(id)}`;
  try {
    // SUA 2026-08-26 (debug production): fetch() thang toi URL nay tu 1 Worker khac (chinh he nay) bi
    // Cloudflare chan voi "error code: 1042" (chong SSRF, chi xay ra khi ben goi CUNG la Worker - curl
    // tay/server thuong khong dinh, do la ly do lam ra soat ban dau bi lac huong). Dung Service Binding
    // (CASE_LOOKUP_SERVICE, xem wrangler.jsonc + types.ts) de dispatch NOI BO qua Cloudflare thay vi
    // fetch() mang that - van dung dung URL/header nhu cu, chi doi noi goi .fetch().
    const res = await env.CASE_LOOKUP_SERVICE.fetch(url, { headers: { "X-API-Key": env.CASE_LOOKUP_API_KEY } });
    // Neu route ben he goc chua deploy/sai URL, co the nhan ve trang SPA fallback (200 OK, HTML) thay
    // vi JSON that - kiem tra Content-Type truoc khi parse de tranh SyntaxError lam sap ca request
    // (vd "kiem-tra-ma-yeu-cau" tra 500 thay vi "khong tim thay case" nhu mong doi). Log lai (khong
    // chan luong, endpoint goi ham nay van tra "khong tim thay" cho nguoi dung) de con cho ma tra cuu
    // qua wrangler tail khi co su co - day la diem noi DUY NHAT toi 1 he ben ngoai, dang gia de log.
    if (!res.ok || !(res.headers.get("Content-Type") ?? "").includes("application/json")) {
      console.error("[caseLookup] fetch that bai", res.status, res.headers.get("Content-Type"));
      return null;
    }
    return await res.json<CaseLookupRawResponse>();
  } catch (err) {
    console.error("[caseLookup] exception", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function lookupCase(id: string, env: Env): Promise<CaseLookupPreview | null> {
  const body = await fetchCaseLookupRaw(id, env);
  return body?.found ? body.preview : null;
}

// Ban day du cho GET /case-detail/:id (man "Xem chi tiet case") - kem lich su giai trinh cham tre
// cua case, khac lookupCase() (chi tra preview, dung cho cac canh bao/doi chieu nhanh khong can lich su).
export async function lookupCaseFull(id: string, env: Env): Promise<{ preview: CaseLookupPreview; giaiTrinh: CaseLookupGiaiTrinh[] } | null> {
  const body = await fetchCaseLookupRaw(id, env);
  if (!body?.found || !body.preview) return null;
  return { preview: body.preview, giaiTrinh: body.giaiTrinh ?? [] };
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
