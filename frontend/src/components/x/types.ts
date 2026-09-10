// Types prototype - mo phong shape du lieu that (doi chieu
// frontend/src/modules/datMuaLinhKien/types.ts) de dot port sau map 1-1 de dang.

export type CoreRole = "ADMIN" | "QC" | "GS" | null;

export interface Persona {
  id: string;
  ten: string;
  email: string;
  coreRole: CoreRole;
  // Co nghiep vu (7) + 2 co danh muc
  ktvDVBH: boolean;
  veTinh: boolean;
  kho: boolean;
  keToan: boolean;
  tn: boolean;
  tpDVBH: boolean;
  view: boolean;
  manageParts: boolean;
  viewParts: boolean;
  // Quan he (dung cho scope)
  tramCha?: string | null;
  giamSat?: string | null;
  ghiChu?: string;
}

export type LoaiDon = "mua" | "cong_no" | "tra_hang";

export type OrderStatus =
  | "Chờ Trạm duyệt"
  | "Chờ TBP xác nhận"
  | "Chờ TN duyệt"
  | "TN đã duyệt"
  | "Từ chối"
  | "Đã huỷ";

export interface OrderLog {
  trangThai: string;
  nguoiXuLy: string;
  ngayXuLy: string;
  ghiChu?: string | null;
}

export interface GiaiTrinh {
  noiDung: string;
  nguoiTao: string;
  ngayTao: string;
  lanDau?: boolean;
}

export interface CaseInfo {
  id: string;
  khachHang: string | null;
  khuVuc: string | null;
  tinh?: string | null;
  quanHuyen?: string | null;
  hang?: string | null;
  sanPhamBaoHanh?: string | null;
  kyThuatVien?: string | null;
  seri?: string | null;
  tienDo?: string | null;
}

export interface Order {
  id: string;
  loai: LoaiDon;
  maLk: string;
  tenLk: string;
  loaiDeXuat: string;
  slDeXuat: number;
  slThucXuat: number | null;
  giaDeXuat: number | null;
  giaChot: number | null;
  soTienCongNo?: number | null;
  danhGiaCongNo?: "Đủ" | "Không đủ" | null;
  nguoiTao: string;
  nguoiTaoTen: string;
  taoHo?: boolean;
  nguoiNhanHang: string;
  nguoiNhanHangTen: string;
  emailGs: string | null;
  gsTen?: string | null;
  tram?: string | null;
  khuVuc?: string | null;
  ngayTao: string;
  ghiChu?: string | null;
  yeuCauHoaDon?: string | null;
  ttMailDuyet?: string | null;
  ttKhachHang?: string | null;
  chinhSach?: string | null;
  maYeuCauSuCo?: string | null;
  uuTien: boolean;
  trangThai: OrderStatus;
  quaHan?: boolean;
  lyDoCham?: string | null;
  cases: CaseInfo[];
  logs: OrderLog[];
  giaiTrinh: GiaiTrinh[];
  tranCongNo?: number | null;
}

// --- Tra hang ---
export type ReturnStep =
  | "Chờ kế toán duyệt mềm"
  | "Chờ kho xác nhận"
  | "Chờ QC xác nhận"
  | "Chờ TN duyệt tổng"
  | "Đã duyệt"
  | "Lên PXK (trả hàng)";

export type ReturnStatus = "Đang xử lý" | "Hoàn thành" | "Từ chối";

export interface ReturnOrder extends Omit<Order, "trangThai" | "loai"> {
  loai: "tra_hang";
  buoc: ReturnStep;
  trangThaiTraHang: ReturnStatus;
  anhLinhKien: string[];
  lyDoTra?: string | null;
}

// --- Danh muc linh kien ---
export interface Part {
  ma: string;
  ten: string;
  hang: string;
  giaBan: number | null;
  giaThamChieu?: number | null;
  donVi?: string | null;
  dacThu: boolean;
  phanLoaiDacThu?: string | null;
  chiSuaChua: boolean;
  batTat: boolean;
  anhDemo?: string | null;
  ghiChu?: string | null;
  thayThe: string[];
  giaTriCongNo?: number | null;
}

export interface LyDoCham {
  ma: string;
  ten: string;
  moTicketThieuLk: boolean;
}

// --- Dashboard / workflow ---
export type RoleKey = "tram" | "tbp" | "tn" | "kho" | "ketoan" | "qc" | "gs" | "ktv";

export interface WorkflowStep {
  key: string;
  label: string;
  count: number;
  roleKeys: RoleKey[];
  tab: string;
  filter: string;
  loaiDon?: LoaiDon;
  tone?: "info" | "warning" | "danger" | "success";
}

export interface AppNotification {
  id: string;
  icon: string;
  noiDung: string;
  thoiGian: string;
  chuaDoc: boolean;
  target?: { tab: string; id: string };
}

export interface ImportPreviewRow {
  [col: string]: string | number;
}

// --- Phiếu xuất kho (S8) ---
export type PxkStep = "Đang tạo phiếu" | "Chờ kế toán" | "Đang gửi KTV" | "Kho đã kết thúc";
export interface PxkLineRef {
  id: string;
  maLk: string;
  tenLk: string;
  slDeXuat: number;
  slThucXuat: number | null;
  giaChot: number | null;
}
export interface Pxk {
  id: string;
  loai: "mua" | "cong_no" | "tra_hang";
  nguoiNhanHang: string;
  nguoiNhanHangTen: string;
  gsTen: string;
  soDong: number;
  maXuatKho: string | null;
  maMisa: string | null;
  maVanDon: string | null;
  soTienCanChuyen: number | null;
  ttChuyenTien: "Chưa" | "Chờ KTV chuyển" | "KTV đã chuyển" | "TN đã duyệt" | null;
  anhBienBan: boolean;
  buoc: PxkStep;
  coDonUuTien: boolean;
  ngayTao: string;
  dong: PxkLineRef[];
  logs: OrderLog[];
}

// --- Thiếu linh kiện (S9) ---
export type ThieuLkStatus =
  | "Chờ kho tiếp nhận"
  | "Kho đã tiếp nhận"
  | "Chờ kho xác nhận"
  | "Đã về kho"
  | "Từ chối sai thông tin"
  | "Đã kết thúc"
  | "Đã huỷ bỏ";
export interface ThieuLkTicket {
  id: string;
  donGoc: string;
  maLk: string;
  tenLk: string;
  loaiDon: "mua" | "cong_no";
  lyDoCham: string;
  ngayDuKien: string | null;
  nguoiTaoTicket: string;
  nguoiNhanHang: string;
  nguoiNhanHangTen: string;
  gsTen: string;
  ngayTao: string;
  trangThai: ThieuLkStatus;
  uuTien: boolean;
  logs: OrderLog[];
}

// --- Tồn kho công nợ KTV (S12) ---
export interface TonKhoRow {
  maKho: string;
  tenKtv: string;
  soMatHang: number;
  tongCuoiKy: number;
  congNo: number;
  danhGiaCongNo: "Vượt trần" | "Cảnh báo" | "Bình thường";
  capNhatLuc: string;
  chiTiet: { maHang: string; tenHang: string; dvt: string; dauKy: number; nhap: number; xuat: number; cuoiKy: number }[];
}

// --- SLA (S13) ---
export interface SlaRow {
  email: string;
  ten: string;
  daXuLy: number;
  tuChoi: number;
  tbGio: number;
  tbGioKyTruoc: number;
}
export interface SlaGiaiDoan {
  key: string;
  label: string;
  luong: "mua_cong_no" | "tra_hang" | "pxk" | "cho_ktv";
  dangCho: number;
  rows: SlaRow[];
}

// --- Settings (S14) ---
export interface KhuVucRow {
  ma: string;
  ten: string;
  gsEmail: string | null;
  gsTen: string | null;
  soKtv: number;
}
export interface LoaiDeXuatRow {
  ten: string;
  nhom: string;
  batTat: boolean;
}

// --- Users (S15) ---
export interface UserRow {
  email: string;
  ten: string;
  vaiTro: "Admin" | "QC" | "Giám sát" | "—";
  co: string[];
  khuVuc: string[];
  trangThai: "Hoạt động" | "Khoá";
}
export interface PendingUserRow {
  email: string;
  ten: string;
  ngayDangKy: string;
}
export interface LoginLogRow {
  email: string;
  thoiGian: string;
  ip: string;
  ua: string;
}
