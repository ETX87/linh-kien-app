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
      { key: "dat-mua-lk", label: "Đặt mua linh kiện", icon: "◈", countKey: "datMuaLk" },
      // "Đơn trả hàng" bo khoi menu (phan hoi 2026-08-20) - da co san 3 buoc bam thang qua pipeline
      // chevron (Trả·KT/Trả·Kho/Trả·QC) trong module "Dat mua linh kien" (xem PipelineFlow.tsx),
      // muc menu rieng nay thanh dư thua. Route forceView="tra-hang" o App.tsx GIU NGUYEN (khong
      // xoa) vi khong con duong nao tro toi no nua sau khi bo dong nay.
      { key: "danh-muc-lk", label: "Danh mục linh kiện", icon: "🔧" },
      // Lien ket ra ngoai (them 2026-08-25) - xem giai thich day du o NavItem.href phia tren.
      { key: "sua-chua-bao-hanh", label: "Sửa chữa bảo hành", icon: "🛠", href: "https://suachua.dichvu3t.workers.dev" },
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
  QC: ["dat-mua-lk", "danh-muc-lk"],
  "Giam sat": ["dat-mua-lk", "danh-muc-lk"],
};

export const MODULE_TITLES: Record<string, string> = {
  "dat-mua-lk": "Đặt mua linh kiện",
  "tra-hang": "Đơn trả hàng",
  "danh-muc-lk": "Danh mục linh kiện",
  settings: "Settings",
  users: "Quản lý User",
};
