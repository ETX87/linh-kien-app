import type { VaiTro } from "../auth/AuthContext";
import { Icon } from "../components/ui/Icon";

export interface NavItem {
  key: string;
  label: string;
  // Tên khoá trong `Icon` (components/ui/Icon.tsx) — hoặc 1 emoji (fallback cho link ngoài).
  icon: keyof typeof Icon | string;
  countKey?: "datMuaLk" | "phieuXuat" | "ktvLogChuaDoc" | "thieuLk" | "lkChoXetDuyet" | "hangTra" | "hoanTienCanXuLy" | "viPham";
  // Chi hien tren desktop (Sidebar rong) - mobile gop vao muc khac (vd "Hàng trả" nam trong menu con "Đơn hàng").
  desktopOnly?: boolean;
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
      // "Hàng trả" (2026-09-30): don tra hang CHO CAC BEN XAC NHAN (Ke toan/Kho/QC) tach khoi "Đơn hàng" - CUNG
      // DatMuaLinhKienModule (section "tra-hang"), menu con 3 muc. Mobile: nam trong menu con "Đơn hàng" (desktopOnly).
      { key: "tra-hang", label: "Hàng trả", icon: "return", countKey: "hangTra", desktopOnly: true },
      // Tach "Đặt mua linh kiện" thanh 2 muc (2026-09-29): "Đơn đặt hàng" + "Phiếu xuất" - van la CUNG 1
      // DatMuaLinhKienModule (App.tsx), moi muc chi la 1 "khu" rieng (prop section) + menu giai doan rieng.
      { key: "dat-mua-lk", label: "Đơn hàng", icon: "cart", countKey: "datMuaLk" },
      { key: "phieu-xuat", label: "Phiếu xuất", icon: "file", countKey: "phieuXuat" },
      { key: "danh-muc-lk", label: "Bảng giá", icon: "catalog", countKey: "lkChoXetDuyet" },
      { key: "ton-kho-ktv", label: "Công nợ", icon: "stock" },
      { key: "danh-sach-ktv", label: "Danh sách KTV", icon: "users" },
      // Quy du KTV (2026-09-29, migration 0047) - Admin/Ke toan/TN xem tat ca, KTV/Ve tinh xem cua minh (App.tsx).
      { key: "quy-chuyen-tien", label: "Quỹ & chuyển tiền", icon: "wallet", countKey: "hoanTienCanXuLy" },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { key: "bao-cao-toc-do", label: "Báo cáo tốc độ xử lý", icon: "chart" },
      // Qua han SLA / giai trinh / gan the vi pham (2026-11-17, v1.517) - moi nhan vien van phong + Admin (App.tsx).
      { key: "vi-pham", label: "Quá hạn & vi phạm", icon: "clock", countKey: "viPham" },
      // So do toan bo luong nghiep vu (2026-11-11, v1.471) - noi dung tinh, moi nhan vien van phong + Admin (App.tsx).
      { key: "luong-he-thong", label: "Luồng & logic hệ thống", icon: "flow" },
      { key: "settings", label: "Cài đặt", icon: "settings" },
      { key: "users", label: "Quản lý người dùng", icon: "users" },
    ],
  },
];

export const ROLE_MODULES: Record<VaiTro, string[]> = {
  Admin: NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key)),
  // + "phieu-xuat"/"quy-chuyen-tien" (v1.451): QC dat hang nhu KTV - theo doi phieu, chuyen tien, xac nhan nhan hang, quy cua minh.
  QC: ["trang-chu", "dat-mua-lk", "phieu-xuat", "thieu-lk", "tra-hang", "danh-muc-lk", "ton-kho-ktv", "quy-chuyen-tien"],
  "Giam sat": ["trang-chu", "dat-mua-lk", "phieu-xuat", "thieu-lk", "tra-hang", "danh-muc-lk", "ton-kho-ktv", "quy-chuyen-tien"], // + Quy (2026-10-21): chi quy tai khoan GS quan ly (phamViXem)
};

export const MODULE_TITLES: Record<string, string> = {
  "trang-chu": "Trang chủ",
  "dat-mua-lk": "Đơn hàng",
  "phieu-xuat": "Phiếu xuất",
  "thieu-lk": "Thiếu hàng",
  "tra-hang": "Hàng trả",
  "danh-muc-lk": "Bảng giá",
  "ton-kho-ktv": "Công nợ",
  "danh-sach-ktv": "Danh sách KTV",
  "quy-chuyen-tien": "Quỹ & chuyển tiền",
  "bao-cao-toc-do": "Báo cáo tốc độ xử lý",
  "luong-he-thong": "Luồng & logic hệ thống",
  "vi-pham": "Quá hạn & vi phạm",
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
  datMuaLk: {
    total: number; thieuLkCanXuLy?: number; choTnPxk?: number; choKhoPxk?: number; choKeToanPxk?: number; choKhoThieuLk?: number;
    choKeToanTraHang?: number; choKhoTraHang?: number; choQcTraHang?: number;
    // v1.450: viec PXK tach theo nguoi lam (Ke toan xac nhan tien, chinh nguoi nhan chuyen tien / xac nhan nhan hang).
    choKeToanTien?: number; choTienCuaToi?: number; choNhanHangCuaToi?: number;
  };
  ktvLogChuaDoc: number;
  // So LK "Cho xet duyet" ma chuan - backend chi tra > 0 cho Mua hang/Admin (routes/notifications.ts).
  lkChoXetDuyet?: number;
  // Tong don tra hang cho Ke toan/Kho/QC xac nhan (tinh o Sidebar tu /don-hang-status-counts?loai_don=tra_hang).
  hangTra?: number;
  // Phieu hoan tien quy can minh xu ly (backend demHoanTienCanXuLy, migration 0090).
  hoanTienCanXuLy?: number;
  nopTienCanXuLy?: number;
  viPhamCanGiaiTrinh?: number;
}
// tachHangTra: desktop co muc "Hàng trả" rieng -> viec tra hang cua Ke toan/Kho/QC khong tinh vao "Đơn hàng" nua.
export function navCount(countKey: NavItem["countKey"], counts: NavCounts | undefined, tachHangTra = false): number {
  if (!countKey || !counts) return 0;
  if (countKey === "hangTra") return counts.hangTra ?? 0;
  if (countKey === "viPham") return counts.viPhamCanGiaiTrinh ?? 0;
  if (countKey === "hoanTienCanXuLy") return (counts.hoanTienCanXuLy ?? 0) + (counts.nopTienCanXuLy ?? 0);
  if (countKey === "ktvLogChuaDoc") return counts.ktvLogChuaDoc;
  if (countKey === "lkChoXetDuyet") return counts.lkChoXetDuyet ?? 0;
  if (countKey === "thieuLk") return counts.datMuaLk.thieuLkCanXuLy ?? 0;
  const d = counts.datMuaLk;
  const pxk = (d.choTnPxk ?? 0) + (d.choKhoPxk ?? 0) + (d.choKeToanPxk ?? 0) + (d.choKeToanTien ?? 0) + (d.choTienCuaToi ?? 0) + (d.choNhanHangCuaToi ?? 0);
  const hangTra = tachHangTra ? (d.choKeToanTraHang ?? 0) + (d.choKhoTraHang ?? 0) + (d.choQcTraHang ?? 0) : 0;
  return countKey === "phieuXuat" ? pxk : Math.max(0, d.total - pxk - (d.choKhoThieuLk ?? 0) - hangTra);
}

// Buoc don tra hang "cua toi" (2026-11-10, "vai trò kế toán đơn hàng trả không thuộc việc của kế toán nhưng vẫn bị đếm"): Ke toan chi dem
// "Cho ke toan duyet mem", Kho chi "Cho kho xac nhan", QC chi "Cho QC xac nhan" (Admin / nguoi kiem nhieu co = cong cac buoc cua minh).
// Nguoi KHONG xu ly buoc nao (Giam sat, View, Mua hang, TN thuan) = nguoi theo doi -> giu ca 3 buoc nhu truoc.
export const BUOC_TRA_HANG = ["Cho ke toan duyet mem", "Cho kho xac nhan", "Cho QC xac nhan"] as const;
export function buocTraHangCuaToi(user: { la_ke_toan?: boolean | number | null; la_kho?: boolean | number | null; vai_tro?: string | null } | null | undefined): Set<string> {
  const admin = user?.vai_tro === "Admin";
  const s = new Set<string>();
  if (admin || user?.la_ke_toan) s.add("Cho ke toan duyet mem");
  if (admin || user?.la_kho) s.add("Cho kho xac nhan");
  if (admin || user?.vai_tro === "QC") s.add("Cho QC xac nhan");
  return s.size > 0 ? s : new Set(BUOC_TRA_HANG);
}
