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
export const DEFAULT_ROLE_SEED: RoleSeed = {
  bg: "#fafafa",
  surface: "#ffffff",
  surfaceSoft: "#fbfbfb",
  ink: "#18181b",
  inkSoft: "#71717a",
  line: "#e4e4e7",
  priority: "#c2410c",
  ocean: "#1176a6",
  teal: "#0f7d74",
  amber: "#b3730f",
  coral: "#b23a3a",
};

// Hex Y NGUYEN cua tokens.css hien tai - dung lam gia tri ap dung that cho preset "Mac dinh" (khong
// di qua resolveTheme, xem giai thich o DEFAULT_ROLE_SEED phia tren).
export const DEFAULT_THEME_VARS: Record<string, string> = {
  "ocean-950": "#052033",
  "ocean-900": "#06304a",
  "ocean-800": "#0a4666",
  "ocean-700": "#0e5d85",
  "ocean-600": "#1176a6",
  "ocean-500": "#1591c9",
  "ocean-400": "#3fb0e0",
  "ocean-100": "#ddf1fb",
  "teal-700": "#0a5a52",
  "teal-600": "#0f7d74",
  "teal-500": "#159c93",
  "teal-100": "#dcf5f2",
  "amber-700": "#8a5810",
  "amber-600": "#b3730f",
  "amber-500": "#d98a1f",
  "amber-100": "#fbebd1",
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
      teal: "#059669",
      amber: "#D97706",
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
      teal: "#059669",
      amber: "#D97706",
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
      ocean: "#2563EB",
      teal: "#0D9488",
      amber: "#D97706",
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
      teal: "#16A34A",
      amber: "#D97706",
      coral: "#DC2626",
    },
  },
];
