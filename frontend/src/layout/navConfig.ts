import type { VaiTro } from "../auth/AuthContext";
import { Icon } from "../components/ui/Icon";

export interface NavItem {
  key: string;
  label: string;
  // Tên khoá trong `Icon` (components/ui/Icon.tsx) — hoặc 1 emoji (fallback cho link ngoài).
  icon: keyof typeof Icon | string;
  countKey?: "datMuaLk" | "phieuXuat" | "ktvLogChuaDoc" | "thieuLk" | "lkChoXetDuyet";
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
      { key: "thieu-lk", label: "Thiếu hàng", icon: "package", countKey: "thieuLk" },
      // Tach "Đặt mua linh kiện" thanh 2 muc (2026-09-29): "Đơn đặt hàng" + "Phiếu xuất" - van la CUNG 1
      // DatMuaLinhKienModule (App.tsx), moi muc chi la 1 "khu" rieng (prop section) + menu giai doan rieng.
      { key: "dat-mua-lk", label: "Đơn hàng", icon: "cart", countKey: "datMuaLk" },
      { key: "phieu-xuat", label: "Phiếu xuất", icon: "file", countKey: "phieuXuat" },
      { key: "danh-muc-lk", label: "Bảng giá", icon: "catalog", countKey: "lkChoXetDuyet" },
      { key: "ton-kho-ktv", label: "Công nợ", icon: "stock" },
      { key: "danh-sach-ktv", label: "Danh sách KTV", icon: "users" },
      // Quy du KTV (2026-09-29, migration 0047) - Admin/Ke toan/TN xem tat ca, KTV/Ve tinh xem cua minh (App.tsx).
      { key: "quy-chuyen-tien", label: "Quỹ & chuyển tiền", icon: "wallet" },
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
  "Giam sat": ["trang-chu", "dat-mua-lk", "phieu-xuat", "thieu-lk", "danh-muc-lk", "ton-kho-ktv"],
};

export const MODULE_TITLES: Record<string, string> = {
  "trang-chu": "Trang chủ",
  "dat-mua-lk": "Đơn hàng",
  "phieu-xuat": "Phiếu xuất",
  "thieu-lk": "Thiếu hàng",
  "tra-hang": "Trả hàng",
  "danh-muc-lk": "Bảng giá",
  "ton-kho-ktv": "Công nợ",
  "danh-sach-ktv": "Danh sách KTV",
  "quy-chuyen-tien": "Quỹ & chuyển tiền",
  "bao-cao-toc-do": "Báo cáo tốc độ xử lý",
  settings: "Cài đặt",
  users: "Quản lý người dùng",
};

// Gốc breadcrumb — module thuộc "Đặt mua linh kiện" thì gốc là tên đó; còn lại gốc "Trang chủ".
export const BREADCRUMB_ROOT: Record<string, string> = {
  "dat-mua-lk": "Đặt mua linh kiện",
  "phieu-xuat": "Đặt mua linh kiện",
  "thieu-lk": "Đặt mua linh kiện",
  "tra-hang": "Đặt mua linh kiện",
};

// So tren muc menu (Sidebar + BottomTabBar dung chung). "phieuXuat" = phan viec PXK trong breakdown badge
// (TN/Kho/Ke toan), "datMuaLk" = phan con lai (don + tra hang). choKhoThieuLk (ticket thieu hang cho Kho) nam trong total
// nhung thuoc muc "Thiếu hàng" (da dem o thieuLkCanXuLy) - tru ra khoi "Đơn hàng" (2026-09-29).
export interface NavCounts {
  datMuaLk: { total: number; thieuLkCanXuLy?: number; choTnPxk?: number; choKhoPxk?: number; choKeToanPxk?: number; choKhoThieuLk?: number };
  ktvLogChuaDoc: number;
  // So LK "Cho xet duyet" ma chuan - backend chi tra > 0 cho Mua hang/Admin (routes/notifications.ts).
  lkChoXetDuyet?: number;
}
export function navCount(countKey: NavItem["countKey"], counts: NavCounts | undefined): number {
  if (!countKey || !counts) return 0;
  if (countKey === "ktvLogChuaDoc") return counts.ktvLogChuaDoc;
  if (countKey === "lkChoXetDuyet") return counts.lkChoXetDuyet ?? 0;
  if (countKey === "thieuLk") return counts.datMuaLk.thieuLkCanXuLy ?? 0;
  const d = counts.datMuaLk;
  const pxk = (d.choTnPxk ?? 0) + (d.choKhoPxk ?? 0) + (d.choKeToanPxk ?? 0);
  return countKey === "phieuXuat" ? pxk : Math.max(0, d.total - pxk - (d.choKhoThieuLk ?? 0));
}
