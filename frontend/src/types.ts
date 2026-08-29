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
  // "Phân loại đặc thù" (them 2026-08-25) - CHI co y nghia khi dac_thu=1, giai thich RO linh kien nay
  // thuoc dang dac thu gi (vd "Hàng nhập riêng"/"Độc quyền hãng X"...), listdown tu do (dung y het
  // don_vi/"Phân loại" - khong phai bang settings rieng, tu goi y tu cac gia tri da co san).
  phan_loai_dac_thu: string | null;
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
  // Gia tri THAT dang ap dung tu users.giam_sat_quan_ly (nguon duy nhat phan quyen, xem CLAUDE.md) -
  // chi de hien thi read-only, khac voi giam_sat_quan_ly o tren (chi la ghi chu danh ba).
  giam_sat_quan_ly_hien_tai?: string | null;
  // Them 2026-08-26 (xay lai quan ly tai khoan/vai tro, migration 0009) - khu_vuc_ma gan truc tiep
  // cho MOI KTV (ca cap 1 lan cap 2); ktv_cap1_phu_trach CHI y nghia khi vai_tro_ktv='Ve tinh' (tro
  // toi ma_ktv cua 1 KTV cap 1 phu trach truc tiep); cong_no nhap tay/import, khong dong bo tu dong.
  khu_vuc_ma: string | null;
  ktv_cap1_phu_trach: string | null;
  cong_no: number | null;
  cong_no_cap_nhat_luc: string | null;
  // Them 2026-08-28 (phan hoi "thêm 1 cột tài khoản MISA cho admin bổ sung, có thể import") - truong
  // tham chieu tu do, dung doi soat cheo voi phan mem ke toan MISA, khong FK/rang buoc gi.
  ma_misa: string | null;
  // Them 2026-08-29 (phan hoi "thêm 1 cột Tên trên MISA ngay bên cạnh Mã tài khoản MISA") - cung 1
  // kieu truong tham chieu tu do, khong FK/rang buoc gi.
  ten_misa: string | null;
}

// Them 2026-08-29 (phan hoi "xây dựng settings quản lý Tồn kho công nợ KTV", import hang ngay tu
// bao cao MISA - xem lib/tonKhoImport.ts) - dong tong hop 1 KTV (GROUP BY ma_ktv o backend).
export interface KtvTonKhoSummaryRow {
  ma_ktv: string;
  ten_hien_thi: string | null;
  ma_misa: string | null;
  ten_misa: string | null;
  cong_no: number | null;
  cong_no_cap_nhat_luc: string | null;
  so_ma_hang: number;
  tong_cuoi_ky: number | null;
}
export interface KtvTonKhoChiTietRow {
  ma_hang: string;
  ten_hang: string | null;
  dvt: string | null;
  dau_ky: number | null;
  nhap_kho: number | null;
  xuat_kho: number | null;
  cuoi_ky: number | null;
}
export interface KtvTonKhoImportMeta {
  ky_tu_ngay: string | null;
  ky_den_ngay: string | null;
  so_dong: number;
}

// Them 2026-08-26 (migration 0009) - 1 khu vuc chi 1 GS tai 1 thoi diem (gs_email), 1 GS duoc phep
// phu trach nhieu khu vuc. gs_ten la LEFT JOIN users.ten, chi de hien thi.
export interface KhuVucRow {
  ma: string;
  ten: string;
  bat_tat: number;
  stt: number;
  gs_email: string | null;
  gs_ten: string | null;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
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
  la_view: number;
  quan_ly_danh_muc_lk: number;
  xem_danh_muc_lk: number;
  tram_cha: string | null;
  giam_sat_quan_ly: string | null;
  ma_misa: string | null;
  ten_misa: string | null;
}

export interface Paged<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
}

// GET /users/login-log (bo sung theo audit "Ma trận kiểm soát hệ thống" 2026-08-27, muc A1) - bang
// login_log da duoc ghi day du tu luc dang nhap (routes/auth.ts) nhung truoc day khong co man nao
// hien thi ca.
export interface LoginLogRow {
  id: number;
  email: string;
  thoi_gian: string;
  ip: string | null;
  user_agent: string | null;
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
