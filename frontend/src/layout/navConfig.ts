import type { VaiTro } from "../auth/AuthContext";
import { Icon } from "../components/ui/Icon";

export interface NavItem {
  key: string;
  label: string;
  // Tên khoá trong `Icon` (components/ui/Icon.tsx) — hoặc 1 emoji (fallback cho link ngoài).
  icon: keyof typeof Icon | string;
  countKey?: "datMuaLk" | "ktvLogChuaDoc" | "thieuLk";
  // "href" — mục menu là LIÊN KẾT RA NGOÀI (Worker/app khác), KHÔNG tham gia allowedModules/setActive;
  // Sidebar render <a href> thật, LUÔN hiện cho mọi người đăng nhập.
  href?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Nhãn ĐẦY ĐỦ tiếng Việt + icon outline SVG (port P0 — theo ui-prototype/UI_SPEC.md + ảnh sidebar
// người dùng gửi). Cấu trúc/khoá/href/countKey/ROLE_MODULES GIỮ NGUYÊN như bản cũ để không đụng
// logic phân quyền `allowedModules` trong App.tsx.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Vận hành",
    items: [
      { key: "trang-chu", label: "Trang chủ", icon: "home", countKey: "ktvLogChuaDoc" },
      // "Thiếu linh kiện" dung thu 2 ngay sau "Trang chủ" (phan hoi 2026-09-28).
      { key: "thieu-lk", label: "Thiếu linh kiện", icon: "package", countKey: "thieuLk" },
      { key: "dat-mua-lk", label: "Đặt mua linh kiện", icon: "cart", countKey: "datMuaLk" },
      { key: "danh-muc-lk", label: "Danh mục linh kiện", icon: "catalog" },
      { key: "ton-kho-ktv", label: "Tồn kho công nợ KTV", icon: "stock" },
      { key: "danh-sach-ktv", label: "Danh sách KTV", icon: "users" },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { key: "bao-cao-toc-do", label: "Báo cáo tốc độ xử lý", icon: "chart" },
      { key: "settings", label: "Cài đặt", icon: "settings" },
      { key: "users", label: "Quản lý người dùng", icon: "users" },
    ],
  },
];

export const ROLE_MODULES: Record<VaiTro, string[]> = {
  Admin: NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key)),
  QC: ["trang-chu", "dat-mua-lk", "thieu-lk", "danh-muc-lk", "ton-kho-ktv"],
  "Giam sat": ["trang-chu", "dat-mua-lk", "thieu-lk", "danh-muc-lk", "ton-kho-ktv"],
};

export const MODULE_TITLES: Record<string, string> = {
  "trang-chu": "Trang chủ",
  "dat-mua-lk": "Đặt mua linh kiện",
  "thieu-lk": "Thiếu linh kiện",
  "tra-hang": "Trả hàng",
  "danh-muc-lk": "Danh mục linh kiện",
  "ton-kho-ktv": "Tồn kho công nợ KTV",
  "danh-sach-ktv": "Danh sách KTV",
  "bao-cao-toc-do": "Báo cáo tốc độ xử lý",
  settings: "Cài đặt",
  users: "Quản lý người dùng",
};

// Gốc breadcrumb — module thuộc "Đặt mua linh kiện" thì gốc là tên đó; còn lại gốc "Trang chủ".
export const BREADCRUMB_ROOT: Record<string, string> = {
  "dat-mua-lk": "Đặt mua linh kiện",
  "thieu-lk": "Đặt mua linh kiện",
  "tra-hang": "Đặt mua linh kiện",
};
