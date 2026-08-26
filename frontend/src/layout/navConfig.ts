import type { VaiTro } from "../auth/AuthContext";

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  countKey?: "datMuaLk";
  // "href" (them 2026-08-25, phan hoi "chuyển mượt sang trang suachua.dichvu3t.workers.dev") - danh
  // dau 1 muc menu la LIEN KET RA NGOAI (he Worker/app khac hoan toan, khong phai 1 view noi bo cua
  // app nay), KHONG tham gia co che allowedModules/setActive binh thuong - Sidebar.tsx render <a
  // href> that thay vi <button onClick={setActive}>, va LUON hien cho MOI nguoi dang nhap (khong loc
  // theo allowedModules) vi day chi la 1 duong dan ra ngoai, khong lo du lieu gi cua app nay.
  href?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Rut gon tu frontend/src/layout/navConfig.ts cua he DVBH goc - he nay CHI co 1 mien nghiep vu nen
// khong con nhieu nhom/module nhu he goc.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Vận hành",
    items: [
      // "Trang chủ"/"Thiếu linh kiện" tach thanh muc menu RIENG (phan hoi 2026-08-26: "không gộp
      // chung vào 1 thẻ Đặt mua linh kiện như hiện tại") - truoc day chi la 2 tab NOI BO cua "Đặt mua
      // linh kiện" (xem DatMuaLinhKienModule.tsx). Vao qua forceView="trang-chu"/"thieu-lk" o App.tsx,
      // dung y het pattern "tra-hang" da co san (route forceView rieng, khong con la tab noi bo).
      // "Trang chủ" dat DAU TIEN (phan hoi 2026-08-26) - lam diem vao dashboard cho MOI vai tro.
      { key: "trang-chu", label: "Home", icon: "🏠" },
      { key: "dat-mua-lk", label: "Đơn hàng", icon: "◈", countKey: "datMuaLk" },
      { key: "thieu-lk", label: "Chờ LK", icon: "📦" },
      { key: "danh-muc-lk", label: "Bảng Giá", icon: "🔧" },
      // Lien ket ra ngoai (them 2026-08-25) - xem giai thich day du o NavItem.href phia tren.
      { key: "sua-chua-bao-hanh", label: "Sửa chữa", icon: "🛠", href: "https://suachua.dichvu3t.workers.dev" },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { key: "settings", label: "Settings", icon: "⚙" },
      { key: "users", label: "Quản lý User", icon: "⚉" },
    ],
  },
];

// dat-mua-lk/tra-hang/danh-muc-lk duoc cap TU DONG theo role-flag (xem App.tsx), khong hardcode theo
// vai_tro nhu he goc - o he nay MOI tai khoan (ke ca vai_tro=NULL "chi Dat mua linh kien") deu co the
// vao duoc 3 muc do neu co co phu hop. ROLE_MODULES chi con dung cho 2 muc He thong (Admin-only).
export const ROLE_MODULES: Record<VaiTro, string[]> = {
  Admin: NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key)),
  // "trang-chu"/"thieu-lk" them vao day (phan hoi 2026-08-26) - QC/Giam sat truoc day van xem duoc 2
  // man nay qua tab noi bo cua "dat-mua-lk" (tabs[] khong loc theo canQC/isGiamSat cho 2 key nay),
  // nen gio phai duoc cap quyen tuong duong o cap muc menu moi de khong mat quyen truy cap.
  QC: ["trang-chu", "dat-mua-lk", "thieu-lk", "danh-muc-lk"],
  "Giam sat": ["trang-chu", "dat-mua-lk", "thieu-lk", "danh-muc-lk"],
};

export const MODULE_TITLES: Record<string, string> = {
  "trang-chu": "Home",
  "dat-mua-lk": "Đơn hàng",
  "thieu-lk": "Chờ LK",
  "tra-hang": "Đơn trả hàng",
  "danh-muc-lk": "Bảng Giá",
  settings: "Settings",
  users: "Quản lý User",
};
