import type { AppNotification, ImportPreviewRow } from "../types";

export const NOTIFICATIONS: AppNotification[] = [
  { id: "n1", icon: "📥", noiDung: "Đơn DH-2405 chờ bạn duyệt", thoiGian: "5 phút trước", chuaDoc: true, target: { tab: "mua-hang", id: "DH-2405" } },
  { id: "n2", icon: "🧾", noiDung: "PXK-502 đã có mã MISA", thoiGian: "12 phút trước", chuaDoc: true, target: { tab: "phieu-xuat-kho", id: "PXK-502" } },
  { id: "n3", icon: "↩️", noiDung: "Trả hàng TH-703 cần QC xác nhận", thoiGian: "25 phút trước", chuaDoc: true, target: { tab: "tra-hang", id: "TH-703" } },
  { id: "n4", icon: "⏰", noiDung: "Ticket thiếu LK-01 sắp quá hạn", thoiGian: "1 giờ trước", chuaDoc: false, target: { tab: "thieu-lk", id: "TLK-01" } },
  { id: "n5", icon: "📍", noiDung: "Bạn được gán vào khu vực MB2", thoiGian: "2 giờ trước", chuaDoc: false },
];

// Bang preview gia lap cho ImportExcelDialog.
export const IMPORT_PREVIEW: ImportPreviewRow[] = [
  { "Mã LK": "LK001", "Người nhận": "ktv.a@3t.vn", "SL": 3, "Giá đề xuất": 350000, "Ghi chú": "Bổ sung tồn" },
  { "Mã LK": "LK002", "Người nhận": "ktv.a@3t.vn", "SL": 2, "Giá đề xuất": 220000, "Ghi chú": "" },
  { "Mã LK": "LK020", "Người nhận": "vetinh.b@3t.vn", "SL": 5, "Giá đề xuất": 95000, "Ghi chú": "" },
  { "Mã LK": "LK030", "Người nhận": "ktv.e@3t.vn", "SL": 1, "Giá đề xuất": 780000, "Ghi chú": "Đổi lỗi" },
  { "Mã LK": "LK099", "Người nhận": "ktv.f@3t.vn", "SL": 2, "Giá đề xuất": 0, "Ghi chú": "Mã LK không tồn tại" },
];

export const IMPORT_ERRORS = ["Dòng 5: mã linh kiện LK099 không có trong danh mục"];
