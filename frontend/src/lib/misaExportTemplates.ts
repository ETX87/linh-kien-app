// Xuat file import MISA AMIS Accounting tu Phieu xuat kho (xem backend/src/lib/misaExport.ts cho
// phan tinh toan du lieu - file nay CHI lo phan dung XLSX.utils.aoa_to_sheet de dung LAI DUNG khung
// (title/huong dan/hang header o dung vi tri) cua 3 file mau nguoi dung gui ("Mau xuat nhap kho.xls"),
// tranh MISA tu choi import vi lech vi tri cot/hang so voi mau chuan cua ho.
export type MisaTemplate = "xuat_kho" | "chuyen_kho" | "ban_hang";

// 3 nut chon mau rieng (them 2026-09-02, phan hoi "tạo 3 button, TN muốn tải mẫu nào thì tải") - TN/
// Ke toan tu quyet dinh mau nao, khong phu thuoc phan loai tu dong o backend.
export const MISA_TEMPLATE_LABELS: Record<MisaTemplate, string> = {
  xuat_kho: "Xuất kho",
  chuyen_kho: "Chuyển kho",
  ban_hang: "Bán hàng",
};

export interface XuatKhoRow {
  stt: number;
  loaiXuatKho: string;
  ngayHachToan: string;
  ngayChungTu: string;
  soChungTu: string;
  maDoiTuong: string;
  tenDoiTuong: string;
  nguoiNhan: string;
  lyDoXuat: string;
  maNhanVienBanHang: string;
  maHang: string;
  tenHang: string;
  maKho: string;
  tkNo: string;
  tkCo: string;
  dvt: string;
  soLuong: number | null;
  donGia: number | null;
  thanhTien: number | null;
}

export interface ChuyenKhoRow {
  hinhThucChuyenKho: string;
  ngayHachToan: string;
  ngayChungTu: string;
  soChungTu: string;
  veViecDienGiai: string;
  voiDaiLyMaDonViNhan: string;
  tenDaiLyTenDonViNhan: string;
  maHang: string;
  tenHang: string;
  xuatTaiKho: string;
  nhapTaiKho: string;
  tkNo: string;
  tkCo: string;
  dvt: string;
  soLuong: number | null;
  donGiaBan: number | null;
  thanhTien: number | null;
}

export interface BanHangRow {
  hinhThucBanHang: string;
  phuongThucThanhToan: string;
  kiemPhieuXuatKho: string;
  lapKemHoaDon: string;
  ngayHachToan: string;
  ngayChungTu: string;
  soChungTu: string;
  maKhachHang: string;
  tenKhachHang: string;
  lyDoXuat: string;
  maHang: string;
  tenHang: string;
  tkNo: string;
  tkCo: string;
  dvt: string;
  soLuong: number | null;
  donGia: number | null;
  thanhTien: number | null;
  maKho: string;
  tkGiaVon: string;
  tkKho: string;
}

export interface MisaExportSheets {
  xuat_kho: XuatKhoRow[];
  chuyen_kho: ChuyenKhoRow[];
  ban_hang: BanHangRow[];
}

const XUAT_KHO_HEADER = [
  "STT chứng từ", "Loại xuất kho", "Ngày hạch toán (*)", "Ngày chứng từ (*)", "Số chứng từ (*)",
  "Mã đối tượng", "Tên đối tượng", "Địa chỉ/Bộ phận", "Người nhận", "Lý do xuất",
  "Xuất đến chi nhánh", "Lệnh điều động số", "Phương tiện", "Xuất tại kho", "Địa chỉ kho xuất",
  "Nhập tại kho", "Địa chỉ kho nhập", "Mã nhân viên bán hàng", "Số chứng từ kèm theo", "Mã hàng (*)",
  "Thuộc combo", "Tên hàng", "Là dòng ghi chú", "Hàng khuyến mại", "Mã kho",
  "Hàng hóa giữ hộ/bán hộ", "TK Nợ (*)", "TK Có (*)", "ĐVT", "Vị trí",
  "Số lượng", "Đơn giá", "Thành tiền", "Số lệnh sản xuất", "Mã khoản mục chi phí",
  "Mã đơn vị", "Mã đối tượng THCP", "Mã công trình", "Số đơn đặt hàng", "Số hợp đồng mua",
  "Số hợp đồng bán", "Mã thống kê", "CP không hợp lý", "Trường mở rộng",
];

const CHUYEN_KHO_HEADER = [
  "Hình thức chuyển kho", "Ngày hạch toán (*)", "Ngày chứng từ (*)", "Số chứng từ (*)", "Mẫu số HĐ",
  "Ký hiệu HĐ", "Hợp đồng KT số/Lệnh điều động số", "Ngày", "Của", "Về việc/Diễn giải",
  "Với đại lý/ Mã đơn vị nhận", "Tên đại lý/ Tên đơn vị nhận", "Mã số thuế đại lý/ MST đơn vị nhận", "Hợp đồng vận chuyển", "Phương tiện vận chuyển",
  "Mã người vận chuyển", "Tên người vận chuyển", "Mã hàng (*)", "Tên hàng", "Là dòng ghi chú",
  "Xuất tại kho", "Nhập tại kho", "TK Nợ (*)", "TK Có (*)", "ĐVT",
  "Số lượng", "Đơn giá bán", "Thành tiền", "Đơn giá vốn", "Tiền vốn",
  "Trường mở rộng",
];

const BAN_HANG_HEADER = [
  "Hình thức bán hàng", "Phương thức thanh toán", "Kiêm phiếu xuất kho", "Lập kèm hóa đơn", "Đã lập hóa đơn",
  "Ngày hạch toán (*)", "Ngày chứng từ (*)", "Số chứng từ (*)", "Số phiếu xuất", "Mẫu số HĐ",
  "Ký hiệu HĐ", "Số hóa đơn", "Ngày hóa đơn", "Mã khách hàng", "Tên khách hàng",
  "Địa chỉ", "Mã số thuế", "Đơn vị giao đại lý", "Người nộp", "Nộp vào TK",
  "Tên ngân hàng", "Diễn giải/Lý do nộp", "Lý do xuất", "Mã hàng (*)", "Tên hàng",
  "Là dòng ghi chú", "Hàng khuyến mại", "Chiết khấu thương mại", "TK Tiền/Chi phí/Nợ (*)", "TK Doanh thu/Có (*)",
  "ĐVT", "Số lượng", "Đơn giá", "Thành tiền", "Tỷ lệ CK (%)",
  "Tiền chiết khấu", "TK chiết khấu", "Giá tính thuế XK", "% thuế xuất khẩu", "Tiền thuế xuất khẩu",
  "TK thuế xuất khẩu", "% thuế GTGT", "% thuế suất KHAC", "Tiền thuế GTGT", "TK thuế GTGT",
  "HH không TH trên tờ khai thuế GTGT", "Mã kho", "TK giá vốn", "TK Kho", "Đơn giá vốn",
  "Tiền vốn", "Hàng hóa giữ hộ/bán hộ",
];

function xuatKhoToRow(r: XuatKhoRow): unknown[] {
  return [
    r.stt, r.loaiXuatKho, r.ngayHachToan, r.ngayChungTu, r.soChungTu,
    r.maDoiTuong, r.tenDoiTuong, "", r.nguoiNhan, r.lyDoXuat,
    "", "", "", "", "",
    "", "", r.maNhanVienBanHang, "", r.maHang,
    "", r.tenHang, "", "", r.maKho,
    "", r.tkNo, r.tkCo, r.dvt, "",
    r.soLuong, r.donGia, r.thanhTien, "", "",
    "", "", "", "", "",
    "", "", "", "",
  ];
}

function chuyenKhoToRow(r: ChuyenKhoRow): unknown[] {
  return [
    r.hinhThucChuyenKho, r.ngayHachToan, r.ngayChungTu, r.soChungTu, "",
    "", "", "", "", r.veViecDienGiai,
    r.voiDaiLyMaDonViNhan, r.tenDaiLyTenDonViNhan, "", "", "",
    "", "", r.maHang, r.tenHang, "",
    r.xuatTaiKho, r.nhapTaiKho, r.tkNo, r.tkCo, r.dvt,
    r.soLuong, r.donGiaBan, r.thanhTien, "", "",
    "",
  ];
}

function banHangToRow(r: BanHangRow): unknown[] {
  return [
    r.hinhThucBanHang, r.phuongThucThanhToan, r.kiemPhieuXuatKho, r.lapKemHoaDon, "",
    r.ngayHachToan, r.ngayChungTu, r.soChungTu, "", "",
    "", "", "", r.maKhachHang, r.tenKhachHang,
    "", "", "", "", "",
    "", "", r.lyDoXuat, r.maHang, r.tenHang,
    "", "", "", r.tkNo, r.tkCo,
    r.dvt, r.soLuong, r.donGia, r.thanhTien, "",
    "", "", "", "", "",
    "", "", "", "", "",
    "", r.maKho, r.tkGiaVon, r.tkKho, "",
    "", "",
  ];
}

// FIX (phan hoi 2026-09-02: "filter import tải về bỏ tiêu đề mẫu, bắt đầu lấy từ dòng thứ 8 trở
// xuống") - file mau goc co 7 dong tieu de/huong dan/nhom cot phia truoc dong header (dong 8), file
// import MISA thuc te KHONG can cac dong nay - bo het, header la dong dau tien cua sheet xuat ra.
function buildSheetAoa(header: string[], rows: unknown[][]): unknown[][] {
  return [header, ...rows];
}

// Tai ve 1 file .xlsx (co the co 1-3 sheet, chi tao sheet nao co du lieu) tu ket qua GET
// /api/phieu-xuat-kho/:id/misa-export hoac GET /api/phieu-xuat-kho/misa-export?...
export async function downloadMisaExport(sheets: MisaExportSheets, filename: string) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  let hasAny = false;

  if (sheets.xuat_kho.length > 0) {
    const aoa = buildSheetAoa(XUAT_KHO_HEADER, sheets.xuat_kho.map(xuatKhoToRow));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), "Xuất kho");
    hasAny = true;
  }
  if (sheets.chuyen_kho.length > 0) {
    const aoa = buildSheetAoa(CHUYEN_KHO_HEADER, sheets.chuyen_kho.map(chuyenKhoToRow));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), "Chuyển kho");
    hasAny = true;
  }
  if (sheets.ban_hang.length > 0) {
    const aoa = buildSheetAoa(BAN_HANG_HEADER, sheets.ban_hang.map(banHangToRow));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), "Bán hàng");
    hasAny = true;
  }

  if (!hasAny) return false;
  XLSX.writeFile(workbook, filename);
  return true;
}
