// Rut gon tu backend/src/types.ts cua he DVBH goc - chi giu cac truong AppUser/Env that su can cho
// mien nghiep vu "Dat mua linh kien" (xem CLAUDE.md muc "Nguon goc tach he thong" de biet ly do rut
// gon tung truong). KHONG con he thong "users.modules" tuy chinh theo tung tai khoan (moduleAccess.ts
// cua he goc) - qua thua cho 1 he chi phuc vu dung 1 mien nghiep vu, quyen xem duoc suy thang tu
// vai_tro/co role-flag (xem middleware/requireDatMuaLkArea.ts).

export const VAI_TRO_VALUES = ["Admin", "QC", "Giam sat"] as const;
export type VaiTro = (typeof VAI_TRO_VALUES)[number];

export type TrangThaiDuyet = "Cho duyet" | "Da duyet" | "Tu choi";

export interface AppUser {
  email: string;
  ten: string | null;
  vai_tro: VaiTro | null;
  trang_thai_duyet: TrangThaiDuyet;
  bi_khoa: boolean;
  // Cac co vai tro nghiep vu - port nguyen y nghia tu he goc (migration 0053/0081/0082 cua he goc),
  // xem HANDOFF.md cua he nay de biet dinh nghia tung vai tro.
  la_ktv_dvbh: boolean; // KTV / CTV / Tram
  la_ve_tinh: boolean; // Ve tinh (nhan vien noi bo Tram)
  la_kho: boolean; // Nhan vien Kho
  la_ke_toan: boolean; // Ke toan
  la_tac_nghiep: boolean; // "TN" - nguoi duyet don mua/PXK/tra hang
  la_tp_dvbh: boolean; // Xac nhan "linh kien dac thu" truoc buoc TN
  la_view: boolean; // "View" (them 2026-08-26) - chi doc bao cao/danh sach, khong tao/duyet/sua
  quan_ly_danh_muc_lk: boolean; // Quyen SUA danh muc linh kien
  xem_danh_muc_lk: boolean; // Quyen XEM danh muc linh kien (doc lap voi quyen sua)
  tram_cha: string | null;
  giam_sat_quan_ly: string | null;
  // Tinh o backend (GET /api/auth/me, khong phai cot DB) - xem routes/auth.ts.
  la_tram: boolean;
  // Bat/tat rieng 3 loai thong bao "viec moi theo vai tro + khu vuc" (them 2026-09-05, migration
  // 0019) - so thich CA NHAN, KHONG bi applyViewAsOverride() dung vao (xem viewAsPresets.ts).
  nhan_tb_nhiem_vu: boolean; // Loai 1: nhiem vu TRUC TIEP toi phai xu ly (mac dinh BAT)
  nhan_tb_lien_quan: boolean; // Loai 2: viec lien quan cung khu vuc, chua den luot (mac dinh TAT)
  nhan_tb_theo_doi: boolean; // Loai 3: viec toi tung xu ly, van con nhiem vu (mac dinh TAT)
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BOOTSTRAP_ADMIN_EMAIL: string;
  GOOGLE_REDIRECT_URI: string;
  FRONTEND_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  // Diem noi DUY NHAT toi he DVBH goc - tra cuu 1 case su co theo ID (xem lib/caseLookupClient.ts).
  // Khong ghi gi ca, chi doc.
  CASE_LOOKUP_BASE_URL: string;
  CASE_LOOKUP_API_KEY: string;
  // SUA 2026-08-26 (debug production: fetch() thang toi "*.workers.dev" tu 1 Worker khac bi Cloudflare
  // chan voi "error code: 1042" - han che chong SSRF, CHI xay ra khi ben goi CUNG la 1 Worker, curl/
  // server thuong khong dinh). "linhkien" va "dvbh" cung 1 tai khoan Cloudflare nen dung Service
  // Binding (RPC noi bo, khong qua fetch() mang that) thay the - xem wrangler.jsonc muc "services"
  // (service: "dvbh", dung ten script suy tu chinh URL "dvbh.dichvu3t.workers.dev").
  CASE_LOOKUP_SERVICE: Fetcher;
  // Dong bo danh ba KTV/danh muc linh kien sang he DVBH goc (them 2026-08-28, xem
  // lib/dvbhSyncClient.ts + routes/dvbhSync.ts) - CHIEU NGUOC LAI voi CASE_LOOKUP_API_KEY o tren (he
  // nay GHI sang DVBH thay vi doc). Key RIENG, KHONG dung chung CASE_LOOKUP_API_KEY - key ghi rui ro
  // cao hon key chi doc, tach ra de co the thu hoi doc lap. Cung dung CASE_LOOKUP_SERVICE/
  // CASE_LOOKUP_BASE_URL de goi (cung 1 Worker dvbh, khac route).
  DVBH_SYNC_API_KEY: string;
  // Them 04/09/2026: dich day THU 2, Worker doc lap "suachua" (module Sua chua bao hanh - xem
  // CLAUDE.md repo "gui-bao-hanh-linh-kien" muc "Chot 5 cau hoi mo..."/"Cau hoi #6 chot xong...") -
  // nhan cung 1 dang du lieu KTV/linh kien nhu "dvbh" o tren, CONG THEM entity "khu_vuc" rieng ma
  // "dvbh" khong co. Dung Service Binding (KHONG fetch() thang URL - cung 1 tai khoan Cloudflare se bi
  // chan loi 1042, ly do giong het CASE_LOOKUP_SERVICE o tren). Key RIENG voi DVBH_SYNC_API_KEY (khac
  // Worker nhan, khong dung chung).
  SUACHUA_SYNC_BASE_URL: string;
  SUACHUA_SYNC_SERVICE: Fetcher;
  SUACHUA_SYNC_API_KEY: string;
  // Them 2026-09-07: dich day THU 3, Worker "khovan" (Quan ly hang ve kho) - chi nhan
  // entity "ktv" (lam danh sach "Nguoi gui hang"), dung khuon external_systems +
  // header X-Api-Key san co cua khovan. Service Binding cung ly do nhu 2 dich tren.
  KHOVAN_SYNC_BASE_URL: string;
  KHOVAN_SYNC_SERVICE: Fetcher;
  KHOVAN_SYNC_API_KEY: string;
  // Them 2026-09-11: dich day THU 4, Worker "vipham" (Giai trinh vi pham) - chi nhan entity "ktv"
  // (khop ten KTV vi pham). Service Binding cung ly do nhu 3 dich tren.
  VIPHAM_SYNC_BASE_URL: string;
  VIPHAM_SYNC_SERVICE: Fetcher;
  VIPHAM_SYNC_API_KEY: string;
  // Them 2026-09-07 (nguyen tac "Kho chi thao tac qua app kho van"): CHIEU NGUOC LAI -
  // khovan GOI VAO day. KHOVAN_LOOKUP_API_KEY (routes/khovanLookup.ts, chi doc) va
  // KHOVAN_PARTNER_API_KEY (routes/partnerKho.ts, GHI - doi trang thai PXK) la 2 secret
  // TACH RIENG (least-privilege), moi cai dung chung 1-1 voi truong tuong ung ben
  // external_systems (code=linh_kien_app) cua khovan (lookup_api_key/action_api_key).
  KHOVAN_LOOKUP_API_KEY?: string;
  KHOVAN_PARTNER_API_KEY?: string;
  // Cua sau dang nhap CHI danh cho local dev (xem routes/auth.ts GET /dev-login), giong co che he goc.
  LOCAL_DEV_BYPASS_AUTH?: string;
  // Web Push (phan hoi 2026-08-26: day thong bao ngay khi co "tin nhan thong bao" moi trong
  // thong_bao_ktv) - xem lib/webPush.ts. VAPID_SUBJECT/PUBLIC_KEY khong nhay cam (dat trong "vars"),
  // rieng VAPID_SERVER_PRIVATE_KEY la khoa ky JWT, PHAI dat qua "wrangler secret put" (xem DEPLOY.md).
  VAPID_SUBJECT: string;
  VAPID_SERVER_PUBLIC_KEY: string;
  VAPID_SERVER_PRIVATE_KEY: string;
}

declare module "hono" {
  interface ContextVariableMap {
    email: string;
    user: AppUser;
    // Gan o middleware dau tien trong index.ts, dung cho onError (AUD-007) - moi request 1 id.
    requestId: string;
    // "Xem thu vai tro" (Admin-only) - xem lib/viewAsPresets.ts. realIsAdmin phan anh DB row THAT
    // (truoc override), viewAsRole la gia tri cookie dang ap dung (null = khong "xem thu", dang la
    // chinh Admin that). Dung "string" thay vi import ViewAsRole de tranh vong lap import voi
    // viewAsPresets.ts (file do da import AppUser tu day).
    realIsAdmin: boolean;
    viewAsRole: string | null;
    // Xac thuc router /api/partner (xem middleware/lib/partnerApiAuth.ts) - he thong doi tac dang
    // goi API, khac hoan toan "user" (khong co tai khoan Google/session o day).
    partnerKey: { id: number; ten_he_thong: string };
  }
}
