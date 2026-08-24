// Rut gon tu frontend/src/types.ts cua he DVBH goc - chi giu cac kieu/ham thuc su dung boi module
// "Dat mua linh kien" va cac trang quan tri (Settings/Users) cua he doc lap nay.

export interface LinhKienRow {
  ma_linh_kien: string;
  ten_linh_kien: string;
  gia_ban: number | null;
  gia_tham_chieu: number | null;
  don_vi: string | null;
  ghi_chu: string | null;
  anh_demo: string | null;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
  bat_tat: number;
  dac_thu: number;
  chi_sua_chua: number;
}

export interface KtvLienHeRow {
  ma_ktv: string;
  ten_hien_thi: string | null;
  sdt: string | null;
  ghi_chu: string | null;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
  gmail: string | null;
  vai_tro_ktv: "KTV" | "CTV" | "Tram" | "Ve tinh" | null;
  giam_sat_quan_ly: string | null;
  email_dang_nhap: string | null;
}

export interface LyDoChamMuaLkRow {
  id: number;
  ten_ly_do: string;
  he_thong_su_dung: string;
  quan_ly_don_thieu_linh_kien: number;
  bat_tat: number;
  stt: number;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
}

export interface UserRow {
  email: string;
  ten: string | null;
  vai_tro: string | null;
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi";
  bi_khoa: number;
  la_ktv_dvbh: number;
  la_ve_tinh: number;
  la_kho: number;
  la_ke_toan: number;
  la_tac_nghiep: number;
  la_tp_dvbh: number;
  quan_ly_danh_muc_lk: number;
  xem_danh_muc_lk: number;
  tram_cha: string | null;
  giam_sat_quan_ly: string | null;
}

export interface Paged<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function fmtVND(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("vi-VN") + "đ";
}

// Moi chuoi datetime tra ve tu API ("YYYY-MM-DD HH:MM:SS", khong co timezone) la gio VN dia phuong -
// phai tu them "+07:00" truoc khi parse, neu khong JS se hieu nham la gio dia phuong CUA TRINH DUYET
// hoac UTC. Gia tri da la ISO day du kem "Z"/offset that (vd cachedAt tu new Date().toISOString())
// khong duoc cong them nua.
export function parseDbDateTime(d: string): Date {
  const withT = d.replace(" ", "T");
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(withT);
  return new Date(hasTimezone ? withT : `${withT}+07:00`);
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  if (!/\d{2}:\d{2}/.test(d)) return fmtDate(d);
  return parseDbDateTime(d).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d.replace(" ", "T")).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
}
