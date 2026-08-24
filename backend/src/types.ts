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
  quan_ly_danh_muc_lk: boolean; // Quyen SUA danh muc linh kien
  xem_danh_muc_lk: boolean; // Quyen XEM danh muc linh kien (doc lap voi quyen sua)
  tram_cha: string | null;
  giam_sat_quan_ly: string | null;
  // Tinh o backend (GET /api/auth/me, khong phai cot DB) - xem routes/auth.ts.
  la_tram: boolean;
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
  // Uy quyen Google Drive de upload anh bien ban/bang chung chuyen tien (xem lib/googleDrive.ts) -
  // OAuth delegation rieng cua HE NAY, khong dung chung voi he DVBH goc.
  GOOGLE_DRIVE_SA_EMAIL: string;
  GOOGLE_DRIVE_SA_PRIVATE_KEY: string;
  GOOGLE_DRIVE_FOLDER_ID: string;
  // Diem noi DUY NHAT toi he DVBH goc - tra cuu 1 case su co theo ID (xem lib/caseLookupClient.ts).
  // Khong ghi gi ca, chi doc.
  CASE_LOOKUP_BASE_URL: string;
  CASE_LOOKUP_API_KEY: string;
  // Cua sau dang nhap CHI danh cho local dev (xem routes/auth.ts GET /dev-login), giong co che he goc.
  LOCAL_DEV_BYPASS_AUTH?: string;
}

declare module "hono" {
  interface ContextVariableMap {
    email: string;
    user: AppUser;
    // "Xem thu vai tro" (Admin-only) - xem lib/viewAsPresets.ts. realIsAdmin phan anh DB row THAT
    // (truoc override), viewAsRole la gia tri cookie dang ap dung (null = khong "xem thu", dang la
    // chinh Admin that). Dung "string" thay vi import ViewAsRole de tranh vong lap import voi
    // viewAsPresets.ts (file do da import AppUser tu day).
    realIsAdmin: boolean;
    viewAsRole: string | null;
  }
}
