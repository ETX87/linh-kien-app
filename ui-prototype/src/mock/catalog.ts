import type { Part, LyDoCham } from "../types";

// Danh muc linh kien mau (ui-concepts/SPEC.md muc 7, mo rong nhe).
export const PARTS: Part[] = [
  { ma: "LK001", ten: "Bo mạch chủ Samsung A52", hang: "Samsung", giaBan: 350000, giaThamChieu: 360000, donVi: "Cái", dacThu: false, chiSuaChua: false, batTat: true, thayThe: ["LK001B"], ghiChu: "Dùng chung cho A52/A52s" },
  { ma: "LK001B", ten: "Bo mạch chủ Samsung A52 (hàng thay thế)", hang: "Samsung", giaBan: 340000, donVi: "Cái", dacThu: false, chiSuaChua: false, batTat: true, thayThe: [] },
  { ma: "LK002", ten: "Pin Samsung A52", hang: "Samsung", giaBan: 220000, donVi: "Cái", dacThu: false, chiSuaChua: false, batTat: true, thayThe: [] },
  { ma: "LK010", ten: "Màn hình iPhone 13", hang: "Apple", giaBan: 1850000, donVi: "Cái", dacThu: true, phanLoaiDacThu: "Màn hình chính hãng", chiSuaChua: false, batTat: true, thayThe: [] },
  { ma: "LK011", ten: "Camera sau iPhone 13", hang: "Apple", giaBan: 620000, donVi: "Cái", dacThu: true, phanLoaiDacThu: "Camera chính hãng", chiSuaChua: false, batTat: true, thayThe: [] },
  { ma: "LK020", ten: "Loa ngoài Xiaomi Redmi Note 11", hang: "Xiaomi", giaBan: 95000, donVi: "Cái", dacThu: false, chiSuaChua: true, batTat: true, thayThe: [] },
  { ma: "LK025", ten: "Pin Xiaomi Redmi Note 11", hang: "Xiaomi", giaBan: 180000, donVi: "Cái", dacThu: false, chiSuaChua: false, batTat: true, thayThe: [] },
  { ma: "LK030", ten: "Màn hình Oppo A96", hang: "Oppo", giaBan: 780000, donVi: "Cái", dacThu: false, chiSuaChua: false, batTat: true, thayThe: [] },
  { ma: "LK031", ten: "Bàn phím laptop Dell Vostro", hang: "Dell", giaBan: 420000, donVi: "Cái", dacThu: false, chiSuaChua: false, batTat: true, thayThe: [] },
  { ma: "LK040", ten: "Cáp sạc Type-C 65W", hang: "3T", giaBan: 85000, donVi: "Sợi", dacThu: false, chiSuaChua: false, batTat: false, thayThe: [] },
];

export const LY_DO_CHAM: LyDoCham[] = [
  { ma: "LDC1", ten: "Chờ hàng nhập kho", moTicketThieuLk: true },
  { ma: "LDC2", ten: "Sai thông tin đơn hàng", moTicketThieuLk: false },
  { ma: "LDC3", ten: "KTV yêu cầu huỷ", moTicketThieuLk: false },
  { ma: "LDC4", ten: "Vượt hạn mức duyệt", moTicketThieuLk: false },
];

export const LOAI_DE_XUAT = [
  "Đề xuất mua mới",
  "Đề xuất mua (công nợ)",
  "Đổi linh kiện lỗi",
  "Bổ sung tồn kho",
  "Trả hàng lỗi kỹ thuật",
];
