import type { RoleSeed } from "./colorRamp";

// 5 bo mau dung san cho tinh nang "Giao diện" (ca nhan, chi luu localStorage - xem
// useThemeSettings.ts). Seed hex deu lay tu thang mau Tailwind CSS v3 da cong bo (da kiem chung
// tuong phan/tham my rong rai) - rieng "Ấm áp" lay dung tu file "mau css.txt" o goc repo (dac ta
// "Warm Workspace" da duyet, chinh no cung dung gia tri Tailwind).

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  seed: RoleSeed;
}

export const DEFAULT_PRESET_ID = "mac-dinh";

// Seed tuong duong bo "Mac dinh" hien co cua tokens.css (lay dung gia tri tier "600" lam seed, khop
// quy uoc buildRampTiers). CHI dung de: (1) hien mini-swatch preset "Mac dinh" trong tab "Co san"
// bang chinh resolveTheme() cho nhat quan cach ve voi 4 bo kia, (2) lam diem bat dau mac dinh khi
// nguoi dung mo tab "Tuy chinh" lan dau (chua tung luu customSeed). KHONG dung seed nay de AP DUNG
// bo "Mac dinh" thuc su - luc ap dung phai dung DEFAULT_THEME_VARS (hex y nguyen tokens.css) de dam
// bao khong lech 1 pixel nao so voi giao dien hien tai cho nguoi chua bao gio mo thẻ cai dat.
// amber/teal (2026-08-27): seed doi theo dung gia tri "600" moi cua tokens.css sau khi doi ngu nghia
// mau trang thai toan he thong ("amber" = dang cho buoc dau -> xanh duong nhat, "teal" = hoan thanh ->
// xanh la, xem constants.ts + tokens.css) - truoc la #b3730f (vang hoi phach)/#0f7d74 (xanh-lam-ngoc).
// FIX (phan hoi 2026-09-09: "màu mặc định set theo gam màu icon") - ocean doi tu #1176a6 sang
// #0c72b6 (khop seed moi trong tokens.css :root, xem giai thich day du o do) - CHI doi ocean, cac
// seed con lai (priority/teal/amber/coral) giu nguyen vi la mau NGU NGHIA (CTA/trang thai) da chot
// rieng truoc do, khong thuoc "gam mau icon".
export const DEFAULT_ROLE_SEED: RoleSeed = {
  bg: "#fafafa",
  surface: "#ffffff",
  surfaceSoft: "#fbfbfb",
  ink: "#18181b",
  inkSoft: "#71717a",
  line: "#e4e4e7",
  priority: "#c2410c",
  ocean: "#0c72b6",
  teal: "#059669",
  amber: "#2563eb",
  coral: "#b23a3a",
};

// Hex Y NGUYEN cua tokens.css hien tai - dung lam gia tri ap dung that cho preset "Mac dinh" (khong
// di qua resolveTheme, xem giai thich o DEFAULT_ROLE_SEED phia tren).
export const DEFAULT_THEME_VARS: Record<string, string> = {
  "ocean-950": "#031826",
  "ocean-900": "#031e30",
  "ocean-800": "#042a43",
  "ocean-700": "#07456e",
  "ocean-600": "#0c72b6",
  "ocean-500": "#0f8adc",
  "ocean-400": "#40abf2",
  "ocean-100": "#e6eff4",
  "teal-700": "#047857",
  "teal-600": "#059669",
  "teal-500": "#10b981",
  "teal-100": "#d1fae5",
  "amber-700": "#1d4ed8",
  "amber-600": "#2563eb",
  "amber-500": "#3b82f6",
  "amber-100": "#dbeafe",
  "coral-700": "#7a2424",
  "coral-600": "#b23a3a",
  "coral-500": "#d84c4c",
  "coral-400": "#e78888",
  "coral-100": "#fbe1e1",
  "orange-700": "#9a3412",
  "orange-600": "#c2410c",
  "orange-500": "#ea580c",
  "orange-100": "#ffedd5",
  bg: "#fafafa",
  surface: "#ffffff",
  "surface-soft": "#fbfbfb",
  "surface-100": "#f4f4f5",
  "surface-200": "#e4e4e7",
  "surface-2": "#f4f4f5",
  "topbar-bg": "#ffffff",
  "sidebar-from": "#ffffff",
  "sidebar-to": "#fafafa",
  "sidebar-ink": "#18181b",
  "sidebar-ink-mid": "#3f3f46",
  "sidebar-ink-dim": "#71717a",
  "sidebar-highlight": "rgba(79, 70, 229, 0.08)",
  line: "#e4e4e7",
  "ink-900": "#18181b",
  "ink-700": "#3f3f46",
  "ink-600": "#52525b",
  "ink-500": "#71717a",
  "ink-400": "#a1a1aa",
  "indigo-700": "#3730a3",
  "indigo-600": "#4f46e5",
  "indigo-500": "#6366f1",
  "indigo-100": "#eef2ff",
  "violet-700": "#4c1d95",
  "violet-600": "#7c3aed",
  "violet-500": "#8b5cf6",
  "violet-100": "#ede9fe",
  "green-700": "#15803d",
  "green-600": "#16a34a",
};

export const PRESETS: ThemePreset[] = [
  {
    id: DEFAULT_PRESET_ID,
    label: "Mặc định",
    description: "Trung tính (zinc) + cam nổi bật — giao diện hiện tại.",
    seed: DEFAULT_ROLE_SEED,
  },
  {
    id: "am-ap",
    label: "Ấm áp",
    description: "Nền kem ấm, chữ nâu đậm, nhấn cam rực (theo bảng màu \"Warm Workspace\").",
    seed: {
      bg: "#FAF7F2",
      surface: "#FFFFFF",
      surfaceSoft: "#F5F1E9",
      ink: "#2A2320",
      inkSoft: "#6B6058",
      line: "#EEE6D9",
      priority: "#EA580C",
      ocean: "#2563EB",
      // amber/teal (2026-08-27): doi theo ngu nghia trang thai moi (xanh duong nhat/xanh la, xem
      // tokens.css) - amber dung sky-400 (nhat/khac hue ro voi ocean=blue-600 o tren de van phan
      // biet duoc 2 giai doan "dang cho"), teal dung green-500 (khac priority=cam, khong trung mau).
      teal: "#22C55E",
      amber: "#38BDF8",
      coral: "#E11D48",
    },
  },
  {
    id: "cham-hien-dai",
    label: "Chàm hiện đại",
    description: "Nền xám lạnh (slate), nhấn chàm — phong cách SaaS gọn gàng.",
    seed: {
      bg: "#F8FAFC",
      surface: "#FFFFFF",
      surfaceSoft: "#F1F5F9",
      ink: "#0F172A",
      inkSoft: "#64748B",
      line: "#E2E8F0",
      priority: "#4F46E5",
      ocean: "#0284C7",
      // amber dung blue-500 (hue khac ro voi ocean=sky-600 o tren) - xem giai thich chung o preset
      // "Ấm áp".
      teal: "#22C55E",
      amber: "#3B82F6",
      coral: "#DC2626",
    },
  },
  {
    id: "rung-xanh",
    label: "Rừng xanh",
    description: "Nền xám ấm (stone), nhấn lục bảo — điềm tĩnh, dễ chịu cho mắt.",
    seed: {
      bg: "#FAFAF9",
      surface: "#FFFFFF",
      surfaceSoft: "#F5F5F4",
      ink: "#1C1917",
      inkSoft: "#78716C",
      line: "#E7E5E4",
      priority: "#059669",
      // amber dung sky-400 (nhat, khac ocean=blue-600). teal dung green-600 - khac sac voi
      // priority=emerald-600 o tren du cung ho xanh la (chap nhan duoc, "Rừng xanh" von da nhieu sac
      // xanh la lam chu dao).
      ocean: "#2563EB",
      teal: "#16A34A",
      amber: "#38BDF8",
      coral: "#DC2626",
    },
  },
  {
    id: "dai-duong-sau",
    label: "Đại dương sâu",
    description: "Nền xanh lam rất nhạt, nhấn xanh ngọc — mát mẻ, chuyên nghiệp.",
    seed: {
      bg: "#EFF8FB",
      surface: "#FFFFFF",
      surfaceSoft: "#E6F4F8",
      ink: "#0B2530",
      inkSoft: "#547885",
      line: "#D3ECF2",
      priority: "#0D9488",
      ocean: "#0284C7",
      // amber dung blue-500 (khac ocean=sky-600). teal dung green-500 (khac priority=teal-cyan).
      teal: "#22C55E",
      amber: "#3B82F6",
      coral: "#DC2626",
    },
  },
];
