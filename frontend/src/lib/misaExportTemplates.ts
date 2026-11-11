// Xuat file import MISA AMIS Accounting tu Phieu xuat kho (xem backend/src/lib/misaExport.ts cho
// phan tinh toan du lieu - file nay CHI lo phan dung XLSX.utils.aoa_to_sheet de dung LAI DUNG khung
// (header dung vi tri, khong con 6-7 dong huong dan/tieu de nhu file mau) cua file mau nguoi dung gui,
// tranh MISA tu choi import vi lech vi tri cot/hang so voi mau chuan cua ho.
// SUA LON 2026-09-09 (file mau moi "File đẩy hàng lên amis - CHỐT CUỐI.xls", 12 sheet) - xem giai
// thich day du o backend/src/lib/misaExport.ts dau file: "xuat_kho"/"ban_hang" gio DUNG CHUNG 1 bo cot
// "Don dat hang" (38 cot) thay vi 2 bo cot rieng 44/51 cot nhu truoc; "chuyen_kho" GIU NGUYEN header cu
// (da khop san voi file mau moi), chi them 3 cot truoc do chua duoc dien gia tri.
export type MisaTemplate = "xuat_kho" | "chuyen_kho" | "ban_hang";

// 3 nut chon mau rieng (them 2026-09-02, phan hoi "tạo 3 button, TN muốn tải mẫu nào thì tải") - TN/
// Ke toan tu quyet dinh mau nao, khong phu thuoc phan loai tu dong o backend.
// "xuat_kho" hien la "CN, hỗ trợ" (2026-10-05, doi ten "misa xuất kho" => "MISA CN, hỗ trợ" - mau dung cho don cong no / ho tro).
export const MISA_TEMPLATE_LABELS: Record<MisaTemplate, string> = {
  xuat_kho: "CN, hỗ trợ",
  chuyen_kho: "Chuyển kho",
  ban_hang: "Bán hàng",
};

// Dung chung cho ca "xuat_kho" va "ban_hang" - xem giai thich o backend/src/lib/misaExport.ts.
export interface DonDatHangRow {
  ngayDonHang: string;
  soDonHang: string;
  tinhGiaThanh: "Có" | "Không";
  maKhachHang: string;
  tenKhachHang: string;
  nguoiNhanHang: string;
  dienGiai: string;
  maNhanVienBanHang: string;
  maHang: string;
  tenHang: string;
  maKho: string;
  dvt: string;
  soLuong: number | null;
  donGia: number | null;
  thanhTien: number | null;
  phanTramThueGTGT: number;
  tienThueGTGT: number | null;
  truongMoRong1: string;
  truongMoRong2: string;
}

export interface ChuyenKhoRow {
  hinhThucChuyenKho: string;
  ngayHachToan: string;
  ngayChungTu: string;
  soChungTu: string;
  veViecDienGiai: string;
  voiDaiLyMaDonViNhan: string;
  tenDaiLyTenDonViNhan: string;
  maNguoiVanChuyen: string;
  tenNguoiVanChuyen: string;
  maHang: string;
  tenHang: string;
  laDongGhiChu: string;
  xuatTaiKho: string;
  nhapTaiKho: string;
  tkNo: string;
  tkCo: string;
  dvt: string;
  soLuong: number | null;
  donGiaBan: number | null;
  thanhTien: number | null;
  donGiaVon: number | null;
  tienVon: number | null;
  truongMoRong: string;
}

export interface MisaExportSheets {
  xuat_kho: DonDatHangRow[];
  chuyen_kho: ChuyenKhoRow[];
  ban_hang: DonDatHangRow[];
}

// KTV xuat hien trong file nhung thieu ma_misa/ten_misa (them 2026-09-04) - xem giai thich day du o
// backend/src/lib/misaExport.ts MisaExportResult.
export interface MisaExportWarning {
  ma_ktv: string;
  ten_hien_thi: string | null;
}

export interface MisaExportResult {
  sheets: MisaExportSheets;
  canhBaoThieuMisa: MisaExportWarning[];
  // Dong "TRỪ CÔNG NỢ" bi bo khoi file Chuyen kho (2026-09-30) - phai tai bang mau Ban hang (tru kho KTV).
  boQuaTruCongNo?: { so_phieu: string; ma_lk: string }[];
  // O bi cat ve 255 ky tu (MISA chi nhan toi da 255 ky tu / o, v1.471) - xem backend MISA_MAX_KY_TU.
  catNgan?: { so_phieu: string; ma_lk: string; cot: string; do_dai: number }[];
}

// Dung CHUNG cho ca sheet "Xuất kho" va "Bán hàng" khi xuat .xlsx (cung 1 bo cot AMIS "Đơn đặt hàng" -
// xem giai thich dau file) - 38 cot dung theo file mau "CHỐT CUỐI".
const DON_DAT_HANG_HEADER = [
  "Ngày đơn hàng (*)", "Số đơn hàng (*)", "Trạng thái", "Ngày giao hàng", "Địa điểm giao hàng",
  "Tính giá thành", "Mã khách hàng", "Tên khách hàng", "Địa chỉ", "Mã số thuế",
  "Người nhận hàng", "Diễn giải", "Mã nhân viên bán hàng", "Là đơn đặt hàng phát sinh trước khi sử dụng phần mềm", "Mã hàng (*)",
  "Thuộc combo", "Tên hàng", "Là dòng ghi chú", "Hàng khuyến mại", "Mã kho",
  "ĐVT", "Số lượng", "Đơn giá", "Thành tiền", "Tỷ lệ CK (%)",
  "Tiền chiết khấu", "% thuế GTGT", "% thuế suất KHAC", "Tiền thuế GTGT", "Mã khoản mục chi phí",
  "Mã đơn vị", "Mã đối tượng THCP", "Mã công trình", "Số hợp đồng bán", "Mã thống kê",
  "Biển kiểm soát", "Trường mở rộng 1", "Trường mở rộng 2",
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

function donDatHangToRow(r: DonDatHangRow): unknown[] {
  return [
    r.ngayDonHang, r.soDonHang, "Đang thực hiện", "", "",
    r.tinhGiaThanh, r.maKhachHang, r.tenKhachHang, "", "",
    r.nguoiNhanHang, r.dienGiai, r.maNhanVienBanHang, "Không", r.maHang,
    "", r.tenHang, "Không", "Không", r.maKho,
    r.dvt, r.soLuong, r.donGia, r.thanhTien, "",
    "", r.phanTramThueGTGT, "", r.tienThueGTGT, "",
    "PKD", "", "", "", "",
    "", r.truongMoRong1, r.truongMoRong2,
  ];
}

function chuyenKhoToRow(r: ChuyenKhoRow): unknown[] {
  return [
    r.hinhThucChuyenKho, r.ngayHachToan, r.ngayChungTu, r.soChungTu, "",
    "", "", "", "", r.veViecDienGiai,
    r.voiDaiLyMaDonViNhan, r.tenDaiLyTenDonViNhan, "", "", "",
    r.maNguoiVanChuyen, r.tenNguoiVanChuyen, r.maHang, r.tenHang, r.laDongGhiChu,
    r.xuatTaiKho, r.nhapTaiKho, r.tkNo, r.tkCo, r.dvt,
    r.soLuong, r.donGiaBan, r.thanhTien, r.donGiaVon, r.tienVon,
    r.truongMoRong,
  ];
}

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
    const aoa = buildSheetAoa(DON_DAT_HANG_HEADER, sheets.xuat_kho.map(donDatHangToRow));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), MISA_TEMPLATE_LABELS.xuat_kho);
    hasAny = true;
  }
  if (sheets.chuyen_kho.length > 0) {
    const aoa = buildSheetAoa(CHUYEN_KHO_HEADER, sheets.chuyen_kho.map(chuyenKhoToRow));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), "Chuyển kho");
    hasAny = true;
  }
  if (sheets.ban_hang.length > 0) {
    const aoa = buildSheetAoa(DON_DAT_HANG_HEADER, sheets.ban_hang.map(donDatHangToRow));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), "Bán hàng");
    hasAny = true;
  }

  if (!hasAny) return false;
  XLSX.writeFile(workbook, filename);
  return true;
}
