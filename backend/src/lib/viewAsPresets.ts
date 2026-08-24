import type { AppUser } from "../types";

// "Xem thu vai tro" (Admin-only, phan hoi 2026-08-20: "test nhanh theo tung man hinh, chinh xac
// chuc nang cua thuc te tung vai tro ma khong can tao hang loat tai khoan rac"). CHI Admin THAT
// (vai_tro="Admin" doc tu DB, kiem tra trong middleware/loadUser.ts truoc khi ap dung override nay)
// moi kich hoat duoc - khong co duong nao de 1 tai khoan thuong tu gia mao vai tro cao hon vi gia
// tri cookie luon bi doi chieu lai voi DB o MOI request, khong tin client tu khai.
export const VIEW_AS_ROLE_KEYS = ["ktv", "ve_tinh", "tram", "kho", "ke_toan", "tac_nghiep", "tp_dvbh", "qc", "giam_sat"] as const;
export type ViewAsRole = (typeof VIEW_AS_ROLE_KEYS)[number];

export const VIEW_AS_LABELS: Record<ViewAsRole, string> = {
  ktv: "KTV DVBH",
  ve_tinh: "Vệ tinh",
  tram: "Trạm",
  kho: "Kho",
  ke_toan: "Kế toán",
  tac_nghiep: "Tác nghiệp (TN)",
  tp_dvbh: "TP DVBH",
  qc: "QC",
  giam_sat: "Giám sát",
};

export function isViewAsRole(v: unknown): v is ViewAsRole {
  return typeof v === "string" && (VIEW_AS_ROLE_KEYS as readonly string[]).includes(v);
}

/** Ap 1 preset vai tro nghiep vu len AppUser THAT cua Admin - CHI doi vai_tro/cac co phan quyen,
 * GIU NGUYEN email/ten that. Moi hanh dong ghi log (nguoi_tao, nguoi_thay_doi...) trong luc dang
 * "xem thu" van dung dung email that cua Admin - khong tao danh tinh gia trong du lieu, chi doi
 * PROFILE QUYEN de cac check `user.la_x || vai_tro==="Admin"` rai rac khap backend hoat dong dung
 * nhu 1 tai khoan that co dung 1 co do, khong con duong bypass "|| Admin" nao sot lai.
 * "tram": la_tram FORCE true (khac cac co con lai deu tu AppUser that) - vi la_tram tinh THAT qua
 * query "co Ve tinh nao tro tram_cha ve email nay" (xem routes/auth.ts /me), Admin that gan nhu
 * chac chan khong co Ve tinh nao ca nen khong the test duoc buoc "Cho Tram duyet" neu khong force. */
export function applyViewAsOverride(user: AppUser, role: ViewAsRole): AppUser {
  const base: AppUser = {
    ...user,
    vai_tro: null,
    la_ktv_dvbh: false,
    la_ve_tinh: false,
    la_kho: false,
    la_ke_toan: false,
    la_tac_nghiep: false,
    la_tp_dvbh: false,
    quan_ly_danh_muc_lk: false,
    xem_danh_muc_lk: false,
    la_tram: false,
  };
  switch (role) {
    case "ktv":
      return { ...base, la_ktv_dvbh: true };
    case "ve_tinh":
      return { ...base, la_ve_tinh: true };
    case "tram":
      return { ...base, la_ktv_dvbh: true, la_tram: true };
    case "kho":
      return { ...base, la_kho: true };
    case "ke_toan":
      return { ...base, la_ke_toan: true };
    case "tac_nghiep":
      return { ...base, la_tac_nghiep: true };
    case "tp_dvbh":
      return { ...base, la_tp_dvbh: true };
    case "qc":
      return { ...base, vai_tro: "QC" };
    case "giam_sat":
      return { ...base, vai_tro: "Giam sat" };
  }
}
