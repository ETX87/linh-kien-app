import { Icon } from "../ui/Icon";

export interface NavItem {
  key: string;
  label: string;
  icon: keyof typeof Icon;
  badge?: "work";
  tag?: string;
  group: "Vận hành" | "Hệ thống";
}

// Nhan ĐẦY ĐỦ tiếng Việt - theo screenshot 260910 (ghi đè bản rút gọn của app thật).
export const NAV: NavItem[] = [
  { key: "trang-chu", label: "Trang chủ", icon: "home", group: "Vận hành" },
  { key: "mua-hang", label: "Đặt mua linh kiện", icon: "cart", badge: "work", group: "Vận hành" },
  { key: "tra-hang", label: "Trả hàng", icon: "return", group: "Vận hành" },
  { key: "danh-muc-lk", label: "Danh mục linh kiện", icon: "catalog", group: "Vận hành" },
  { key: "ton-kho-ktv", label: "Tồn kho công nợ KTV", icon: "stock", group: "Vận hành" },
  { key: "bao-cao-toc-do", label: "Báo cáo tốc độ xử lý", icon: "chart", tag: "Admin", group: "Hệ thống" },
  { key: "settings", label: "Cài đặt", icon: "settings", tag: "Admin", group: "Hệ thống" },
  { key: "users", label: "Quản lý người dùng", icon: "users", tag: "Admin", group: "Hệ thống" },
];

export const MODULE_TITLE: Record<string, string> = {
  "trang-chu": "Trang chủ",
  "mua-hang": "Mua hàng",
  "cong-no": "Công nợ",
  "tra-hang": "Trả hàng",
  "phieu-xuat-kho": "Phiếu xuất kho",
  "thieu-lk": "Thiếu linh kiện",
  "bao-cao": "Báo cáo",
  "danh-muc-lk": "Danh mục linh kiện",
  "ton-kho-ktv": "Tồn kho công nợ KTV",
  "bao-cao-toc-do": "Báo cáo tốc độ xử lý",
  settings: "Cài đặt",
  users: "Quản lý người dùng",
};

// Gốc breadcrumb - khớp screenshot: "Mua hàng" thuộc module "Đặt mua linh kiện";
// "Trả hàng" là mục top-level nên gốc là "Trang chủ".
export const BREADCRUMB_ROOT: Record<string, string> = {
  "mua-hang": "Đặt mua linh kiện",
  "cong-no": "Đặt mua linh kiện",
  "phieu-xuat-kho": "Đặt mua linh kiện",
  "thieu-lk": "Đặt mua linh kiện",
  "bao-cao": "Đặt mua linh kiện",
  "tra-hang": "Trang chủ",
  "danh-muc-lk": "Trang chủ",
  "ton-kho-ktv": "Trang chủ",
  "bao-cao-toc-do": "Trang chủ",
  settings: "Trang chủ",
  users: "Trang chủ",
};
