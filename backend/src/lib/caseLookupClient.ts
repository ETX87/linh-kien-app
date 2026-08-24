import type { Env } from "../types";

// Diem noi DUY NHAT toi he DVBH goc (xem CLAUDE.md muc "Nguon goc tach he thong") - tra cuu 1 case
// su co THEO ID, chi doc, khong ghi gi ca. Goi sang route moi `/api/partner/case-lookup` cua he goc
// (xem DEPLOY.md muc "Thiet lap ket noi he cu" - Admin he goc tao 1 API key rieng cho he nay qua UI
// Settings > API doi tac co san). Dung LAI dung contract response cua endpoint goc
// `GET /api/dat-mua-lk/kiem-tra-ma-yeu-cau` (chi doi noi goi + cach xac thuc, KHONG doi shape) de cac
// route/frontend da port khong phai sua gi them.
export interface CaseLookupPreview {
  khach_hang: string | null;
  seri_san_pham: string | null;
  khu_vuc: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  hang: string | null;
  san_pham_bao_hanh: string | null;
  tien_do_hoan_thanh: string | null;
  ky_thuat_vien: string | null;
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
