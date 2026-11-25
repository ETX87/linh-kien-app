// Rut gon tu frontend/src/types.ts cua he DVBH goc - chi giu cac kieu/ham thuc su dung boi module
// "Dat mua linh kien" va cac trang quan tri (Settings/Users) cua he doc lap nay.

export interface LinhKienRow {
  ma_linh_kien: string;
  ten_linh_kien: string;
  // "Giá NY" - gia_tham_chieu XOA HAN 2026-09-12 (migration 0027, tich hop gia88 lam nguon chinh).
  gia_ban: number | null;
  don_vi: string | null;
  ghi_chu: string | null;
  anh_demo: string | null;
  // Toi da 10 anh (2026-10-13, migration 0077) - JSON array, doc qua anhCuaLk() (lib/anhLinhKien.ts).
  anh_ds?: string | null;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
  bat_tat: number;
  dac_thu: number;
  chi_sua_chua: number;
  // "Cho phép giá 0đ" (migration 0080, tu dong duyet 100%): LK chua co gia ban van dat duoc don MUA / TRỪ CÔNG NỢ.
  cho_phep_gia_0?: number;
  // "Không kiểm tra tồn kho" (migration 0118, 2026-11-13): phi dich vu... - dat don luon coi la co hang.
  khong_kiem_ton?: number;
  // "Phân loại đặc thù" (them 2026-08-25) - CHI co y nghia khi dac_thu=1, giai thich RO linh kien nay
  // thuoc dang dac thu gi (vd "Hàng nhập riêng"/"Độc quyền hãng X"...), listdown tu do (dung y het
  // don_vi/"Phân loại" - khong phai bang settings rieng, tu goi y tu cac gia tri da co san).
  phan_loai_dac_thu: string | null;
  // "Giá trị công nợ" = "Giá KTV" (them 04/09/2026, tu 2026-09-12 do gia88Sync.ts tu dong ghi - xem
  // migration 0027) - gia tri cong no cho 1 don vi linh kien, dung tinh "Cong no thuc te" cua KTV tu
  // ton kho + "cong no tam tinh" khi tao don cong no moi (xem TonKhoKtvModule.tsx/DonCuaToiTab.tsx).
  gia_tri_cong_no: number | null;
  // Cac truong moi tu API doi tac gia88 (them 2026-09-12, xem api-lk-prices_gia88.md +
  // lib/gia88Sync.ts) - TAT CA la "chi xem" trong UI quan tri, KHONG sua tay duoc.
  gia_du_phong: number | null;
  gia_eu: number | null;
  don_vi_nhap: string | null; // thong tin phu, khac "don_vi" (dang dung nhu "Phan loai" tu nhap tay)
  nhan_hang: string | null; // thong tin phu, KHONG phai khoa - 1 ma_linh_kien van chi 1 dong duy nhat
  thiet_bi: string | null; // thong tin phu
  don_vi_tinh: string | null; // thong tin phu, khac "don_vi"
  ghi_chu_doi_tac: string | null; // thong tin phu, khac "ghi_chu" (van tu nhap tay binh thuong)
  // "Cấm bán" - van tim/xem/chon/dat duoc voi moi loai de xuat (chot 2026-10-10), o chon LK chi hien canh bao khi chon.
  cam_ban: number;
  // "Đã bỏ mã" (bang gia doi tac v2.0, migration 0108) - van con vi KTV con ton, khong nen dat moi. Chi canh bao.
  bo_ma?: number;
  // Xet duyet ma chuan (2026-09-30, migration 0053 - backend lib/linhKienXetDuyet.ts). "Da doi ma" = dong chuyen huong
  // (an), ma_chuan = ma moi. co_tren_gia88 = 0 -> Mua hang nhap duoc gia tam.
  trang_thai_ma: TrangThaiMaLk;
  ma_chuan: string | null;
  co_tren_gia88: number;
  // Ngay tao ma (gio VN, migration 0081) - NULL = LK tao truoc khi co nhat ky xet duyet ma.
  ngay_tao?: string | null;
  // Nhom LK Karofi / B2B (2026-10-16, migration 0088) - bat buoc khi tao/sua; Kho xu ly thieu hang theo nhom (lib/nhomLk.ts).
  nhom_lk?: "karofi" | "b2b" | null;
}

export type TrangThaiMaLk = "Cho xet duyet" | "Da xac nhan" | "Tu dong duyet" | "Tu choi" | "Da doi ma";

export interface LinhKienLogRow {
  id: number;
  ma_linh_kien: string;
  hanh_dong: "Tao moi" | "Xac nhan" | "Cap nhat" | "Doi ma" | "Gop ma" | "Tu choi" | "Gia tam" | "Tu dong duyet";
  ma_cu: string | null;
  ma_moi: string | null;
  ten_cu: string | null;
  ten_moi: string | null;
  ghi_chu: string | null;
  so_don: number | null;
  nguoi_thuc_hien: string | null;
  thoi_gian: string;
}

export interface KtvLienHeRow {
  ma_ktv: string;
  ma_nhan_su?: string | null; // users.ma_nhan_su cua Email dang nhap (2026-10-22)
  // NULL = khu vuc chua tung duoc chon tay/xac nhan (tu ETX, he thong tu gan) - migration 0087.
  khu_vuc_xac_nhan_luc?: string | null;
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
  // Cong no hien tai (= cong no chot cua menu Cong no: thuc te + phat sinh - da tru) - chi co khi goi ?cong_no=1 va nguoi xem
  // khong phai KTV thuan (v1.532). null = KTV khong co ton kho trong file MISA gan nhat.
  cong_no_hien_tai?: number | null;
  cong_no_danh_gia?: "Vuot tran" | "Canh bao" | "Binh thuong" | null;
  // KTV "Không có trần công nợ" (migration 0117) - đơn không xét trần.
  khong_tran_cong_no?: number | null;
  khong_tran_cong_no_luc?: string | null;
  khong_tran_cong_no_boi?: string | null;
  // Them 2026-08-28 (phan hoi "thêm 1 cột tài khoản MISA cho admin bổ sung, có thể import") - truong
  // tham chieu tu do, dung doi soat cheo voi phan mem ke toan MISA, khong FK/rang buoc gi.
  ma_misa: string | null;
  // Them 2026-08-29 (phan hoi "thêm 1 cột Tên trên MISA ngay bên cạnh Mã tài khoản MISA") - cung 1
  // kieu truong tham chieu tu do, khong FK/rang buoc gi.
  ten_misa: string | null;
  // He thong "Han muc du phong KTV" (them 2026-09-13, xem migration 0028 + backend/src/lib/duPhongKtv.ts):
  // han_muc_du_phong/han_muc_du_phong_hien_tai nhap tay/import (giong het cap cong_no/cong_no_cap_nhat_luc
  // o tren). han_muc_du_phong_phat_sinh/moc_du_phong_hien_tai la GIA TRI TINH TOAN server-side, tra
  // kem theo tung dong tu GET /settings/ktv-lien-he (khong sua tay duoc).
  han_muc_du_phong: number | null;
  han_muc_du_phong_hien_tai: number | null;
  han_muc_du_phong_cap_nhat_luc: string | null;
  han_muc_du_phong_phat_sinh: number;
  han_muc_du_phong_moc?: string | null; // luc Ke toan nhap "hien tai" cua Ma MISA nay (moc rieng, migration 0123)
  // Don "TRẢ HÀNG DỮ TRỮ" ke toan da chot phieu (sau moc) - tra lai han muc theo gia mua du tru (2026-10-26).
  han_muc_du_phong_tra_hang?: number;
  moc_du_phong_hien_tai: number;
  // Bat/tat tai khoan KTV (2026-10-01): users.bi_khoa cua email dang nhap; tk_email NULL = chua co dong users
  tk_bi_khoa?: number | null;
  tk_email?: string | null;
  // Bat/tat THEO MA (migration 0060) + cac ma khac dung CHUNG Gmail dang nhap (GROUP_CONCAT, NULL = khong co).
  ngung_hoat_dong?: number;
  ma_cung_gmail?: string | null;
  // Gmail dang nhap PHU cua tai khoan (migration 0091), noi bang ", "; NULL = khong co.
  gmail_phu?: string | null;
  // Vai tro van phong cua nguoi gan voi ma (tai khoan dang nhap, chua co thi theo Gmail danh ba) - 2026-11-25, lib/vaiTroVanPhong.ts.
  vp_email?: string | null;
  vp_vai_tro?: string | null;
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
  khong_tran_cong_no?: number;
  so_ma_hang: number;
  tong_cuoi_ky: number | null;
  // He thong "Cong no KTV" (them 04/09/2026) - tinh server-side (khong luu cot rieng, xem
  // backend/src/lib/congNoKtv.ts): cong_no_thuc_te = ton kho x Gia tri cong no tung linh kien;
  // cong_no_phat_sinh = tong don Cong no da TN duyet ke tu moc tinh cong no (lan import ton kho gan
  // nhat); cong_no_chot = thuc_te + phat_sinh; danh_gia_cong_no so sanh cong_no_chot voi Tran cong no
  // (cot "cong_no" o tren) - null neu Tran chua duoc dat (khong the danh gia).
  cong_no_thuc_te: number;
  // Tong SL ton dang duoc tinh cong no 0d ("Công nợ 0 đồng", 2026-10-05) - da tru san khoi cong_no_thuc_te.
  sl_ho_tro_0d?: number;
  cong_no_phat_sinh: number;
  // Don "TRỪ CÔNG NỢ" da thanh toan (Ke toan duyet / quy tra du) - tru ngay khoi cong no (2026-09-30);
  // cong_no_chot = thuc_te + phat_sinh - da_tru.
  cong_no_da_tru: number;
  cong_no_chot: number;
  danh_gia_cong_no: "Vuot tran" | "Canh bao" | "Binh thuong" | null;
}
export interface KtvTonKhoChiTietRow {
  // Them 2026-09-28: SL da tru theo don "TRỪ CÔNG NỢ" (sau moc import) + ton con lai = cuoi_ky - da tru.
  da_tru_theo_don?: number;
  ton_con_lai?: number;
  ma_hang: string;
  ten_hang: string | null;
  dvt: string | null;
  dau_ky: number | null;
  nhap_kho: number | null;
  xuat_kho: number | null;
  cuoi_ky: number | null;
  // Them 2026-09-21 - gia tri cong no cua rieng dong nay (cuoi_ky x Gia tri cong no cua linh kien,
  // xem backend routes/ktvTonKho.ts GET /:ma_ktv/chi-tiet) - tong cac dong nay = "Công nợ thực tế"
  // hien o dau modal (computeCongNoThucTe() trong lib/congNoKtv.ts).
  cong_no_thuc_te: number;
  // SL cua dong nay tinh cong no 0d ("Công nợ 0 đồng", 2026-10-05).
  sl_ho_tro_0d?: number;
}
export interface KtvTonKhoImportMeta {
  ky_tu_ngay: string | null;
  ky_den_ngay: string | null;
  so_dong: number;
}
// Them 2026-09-08 - danh sach ma kho da import nhung chua khop KTV nao (ma_ktv IS NULL), dung cho
// picker "chọn bổ sung Mã MISA" o UsersModule.tsx KtvTab (xem GET /settings/ktv-ton-kho/ma-kho-chua-khop).
export interface MaKhoChuaKhopRow {
  ma_kho: string;
  ten_kho: string | null;
  so_ma_hang: number;
}

// Them 2026-09-11 ("Kho công ty" - phan hoi tu dong duyet don khi kho con du hang, xem migration
// 0025 + backend/src/lib/tonKhoCongTy.ts). KHAC voi KtvTonKhoSummaryRow - day la kho VAT LY cua cong
// ty (6803, 6804-MB...), khong phai kho ao ca nhan tung KTV.
export interface KhoCongTyRow {
  ma: string;
  ten: string;
  bat_tat: number;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
  khu_vuc_ma: string[];
}
export interface KhoCongTyTonKhoSummaryRow {
  ma: string;
  ten: string;
  bat_tat: number;
  so_ma_hang: number;
  tong_cuoi_ky: number;
}
export interface KhoCongTyTonKhoChiTietRow {
  ma_hang: string;
  ten_hang: string | null;
  dvt: string | null;
  dau_ky: number | null;
  nhap_kho: number | null;
  xuat_kho: number | null;
  cuoi_ky: number | null;
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
  // GET /api/users - 1 = co dong ktv_lien_he tro toi email nay (hien o the "KTV hiện trường").
  co_ktv_lien_he?: number;
  ma_ktv_gan?: string | null; // ma KTV co Email dang nhap = tai khoan nay, noi dau phay (2026-10-14)
  ma_nhan_su?: string | null; // Ma nhan su NS-xxxx (2026-10-22, migration 0096, tu dien tu ETX)
  // Ma/Ten MISA cua ma KTV chinh gan tai khoan (2026-10-19: nguon DUY NHAT - form tai khoan chi hien, khong sua).
  ktv_ma_misa?: string | null;
  ktv_ten_misa?: string | null;
  khu_vuc_gan?: string | null; // ma khu vuc gan qua user_khu_vuc, noi bang dau phay (2026-10-02)
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
  la_mua_hang: number;
  la_nv_sua_chua?: number;
  quan_ly_danh_muc_lk: number;
  xem_danh_muc_lk: number;
  tram_cha: string | null;
  giam_sat_quan_ly: string | null;
  ma_misa: string | null;
  ten_misa: string | null;
  // "Khu vuc dat hang" (0055) - tai khoan KHONG phai KTV: don/PXK cua ho thuoc khu vuc nay (thang khu vuc GS phu trach).
  khu_vuc_dat_hang: string | null;
  // Nhom LK Kho xu ly thieu hang (2026-10-16, migration 0088): null = ca 2.
  kho_nhom_lk?: "karofi" | "b2b" | null;
}

export interface Paged<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
}

// Them 2026-09-17 - "ETX nhan su" (danh ba nhan su dong bo tu he ETX ngoai, xem
// backend/src/lib/etxNhanSuSync.ts). ma_chuc_danh/quan_ly_truc_tiep la JSON TEXT (mang/object tu API,
// khong query quan he tren cac truong con). ma_ktv la cot Admin tu go tay de lien ket toi
// ktv_lien_he.ma_ktv (khong FK) - dung de he thong tu khoa/mo khoa users.bi_khoa khi
// trang_thai_lam_viec doi. lien_ket_email/lien_ket_bi_khoa la LEFT JOIN chi de hien thi tham khao.
export interface EtxNhanSuRow {
  ma_nhan_su: string;
  ho_ten: string;
  chuc_danh: string | null;
  ma_chuc_danh: string | null;
  gmail: string | null;
  trang_thai_lam_viec: "on" | "off";
  tai_khoan_lada_ma: string | null;
  tai_khoan_lada_ten: string | null;
  quan_ly_truc_tiep: string | null;
  ma_ktv: string | null;
  created_at: string;
  updated_at: string;
  lien_ket_email: string | null;
  lien_ket_bi_khoa: number | null;
  // Trang thai tai khoan dat hang (2026-10-01, backend etxNhanSuSync.ts TK_TRANG_THAI_SQL)
  tk_trang_thai: "da_tao" | "van_phong" | "cho_duyet" | "tu_choi" | "chua_tao" | "khong_gmail";
  // Ma vai tro van phong cua tai khoan theo Gmail ETX (2026-11-25, backend lib/vaiTroVanPhong.ts) - co thi khong tao KTV tu ETX.
  tk_vai_tro_vp?: string | null;
}
export interface EtxNhanSuSyncStatus {
  last_run_at: string | null;
  last_status: string | null;
  changed_count: number;
  last_error: string | null;
  // Tu dong tao KTV / duyet tai khoan tu ETX (2026-09-29, migration 0044)
  ktv_tu_tao?: number;
  tk_tu_duyet?: number;
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
