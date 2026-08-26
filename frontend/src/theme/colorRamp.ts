// Sinh toan bo ~54 bien CSS mau (tokens.css :root) tu 11 "seed" mau ngu nghia (RoleSeed) - dung cho
// tinh nang doi giao dien ca nhan (ThemeSettingsModal). Bo "Mac dinh" KHONG di qua file nay (dung
// nguyen hex hien co cua tokens.css lam baseline, xem presets.ts) - chi 4 bo dung san + tab "Tuy
// chinh" moi can sinh ramp, nen khong can khop tuyet doi voi ramp thu cong cu (tung bo hex rieng le
// theo yeu cau UX truoc day) - chi can NOI BO tung bo tu sinh dep + du tuong phan.

export interface RoleSeed {
  bg: string;
  surface: string;
  surfaceSoft: string;
  ink: string;
  inkSoft: string;
  line: string;
  /** Mau nhan/CTA chinh (nut hanh dong, badge tone "orange") - chi phoi ca --orange-*. */
  priority: string;
  /** Mau "thong tin/dang xu ly" (badge tone "ocean") - chi phoi --ocean-* (8 sac, ke ca 900/950 dung
   * cho gradient trang dang nhap, focus-ring, checkbox accent) + duoc xoay hue de suy ra --indigo-*. */
  ocean: string;
  /** Mau "thanh cong/hoan thanh" (badge tone "teal") - chi phoi --teal-*, va xoay hue sang luc de
   * suy ra --green-* (mau tien te/gia, xem constants.ts). */
  teal: string;
  /** Mau "canh bao/cho duyet" (badge tone "amber") - chi phoi --amber-*. */
  amber: string;
  /** Mau "loi/tu choi/huy" (badge tone "coral") - chi phoi --coral-*, va xoay hue sang tim de suy
   * ra --violet-* (vien input noi bat rieng module Dat mua linh kien). */
  coral: string;
}

type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
    case gn: h = (bn - rn) / d + 2; break;
    default: h = (rn - gn) / d + 4;
  }
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }: HSL): RGB {
  const sn = s / 100, ln = l / 100;
  if (sn === 0) {
    const v = ln * 255;
    return { r: v, g: v, b: v };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hue2rgb = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const hn = h / 360;
  return { r: hue2rgb(hn + 1 / 3) * 255, g: hue2rgb(hn) * 255, b: hue2rgb(hn - 1 / 3) * 255 };
}

function hexToHsl(hex: string): HSL {
  return rgbToHsl(hexToRgb(hex));
}

function hslToHex(hsl: HSL): string {
  return rgbToHex(hslToRgb({ h: ((hsl.h % 360) + 360) % 360, s: clamp(hsl.s, 0, 100), l: clamp(hsl.l, 0, 100) }));
}

/** Tron 2 mau hex theo ty le t (0 = a, 1 = b) - dung cho ramp neutral (ink) khong can giu hue co dinh. */
export function mixHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  return rgbToHex({ r: ra.r + (rb.r - ra.r) * t, g: ra.g + (rb.g - ra.g) * t, b: ra.b + (rb.b - ra.b) * t });
}

/** Xoay hue cua 1 mau sang gia tri co dinh, giu nguyen S/L - dung de suy indigo tu ocean, violet tu
 * coral, green tu teal (xem RoleSeed) ma khong can them picker rieng cho 4 tong mau it dung nay. */
function hueRotateTo(hex: string, targetHue: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, h: targetHue });
}

/** Rgba tu hex + alpha - dung cho --sidebar-highlight. */
export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

interface RampTierSpec {
  suffix: string;
  dl: number; // delta lightness (diem %) so voi seed, hoac null neu fixed
  fixedL?: number;
  satMul?: number; // he so nhan them vao saturation (vd nhat di o tier 100)
  minL?: number;
  maxL?: number;
}

const TIERS_FULL: RampTierSpec[] = [
  { suffix: "950", dl: -38, minL: 8 },
  { suffix: "900", dl: -32, minL: 10 },
  { suffix: "800", dl: -24, minL: 14 },
  { suffix: "700", dl: -15, minL: 20 },
  { suffix: "600", dl: 0 },
  { suffix: "500", dl: 8, maxL: 62 },
  { suffix: "400", dl: 22, maxL: 74 },
  { suffix: "100", dl: 0, fixedL: 93, satMul: 0.45 },
];

function buildRampTiers(seedHex: string, tiers: RampTierSpec[]): Record<string, string> {
  const seedHsl = hexToHsl(seedHex);
  const out: Record<string, string> = {};
  for (const tier of tiers) {
    let l = tier.fixedL ?? seedHsl.l + tier.dl;
    if (tier.minL != null) l = Math.max(l, tier.minL);
    if (tier.maxL != null) l = Math.min(l, tier.maxL);
    const s = tier.satMul != null ? clamp(seedHsl.s * tier.satMul, 20, 100) : seedHsl.s;
    out[tier.suffix] = hslToHex({ h: seedHsl.h, s, l });
  }
  return out;
}

function pick(tiers: Record<string, string>, suffixes: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of suffixes) out[s] = tiers[s];
  return out;
}

/** Suy toan bo ~54 bien CSS mau tu 11 seed - xem giai thich tung nhom o dau file. */
export function resolveTheme(seed: RoleSeed): Record<string, string> {
  const ocean = buildRampTiers(seed.ocean, TIERS_FULL);
  const teal = buildRampTiers(seed.teal, TIERS_FULL);
  const amber = buildRampTiers(seed.amber, TIERS_FULL);
  const coral = buildRampTiers(seed.coral, TIERS_FULL);
  const orange = buildRampTiers(seed.priority, TIERS_FULL);
  const indigo = buildRampTiers(hueRotateTo(seed.ocean, 243), TIERS_FULL);
  const violet = buildRampTiers(hueRotateTo(seed.coral, 258), TIERS_FULL);
  const green = buildRampTiers(hueRotateTo(seed.teal, 142), TIERS_FULL);

  const inkHsl = hexToHsl(seed.ink);
  const inkSoftHsl = hexToHsl(seed.inkSoft);
  const ink900 = seed.ink;
  const ink700 = mixHex(seed.ink, seed.inkSoft, 0.35);
  const ink600 = mixHex(seed.ink, seed.inkSoft, 0.6);
  const ink500 = seed.inkSoft;
  const ink400 = mixHex(seed.inkSoft, "#ffffff", 0.35);
  void inkHsl;
  void inkSoftHsl;

  // Nen "hover/tint" trung tinh (surface-100/surface-2) - phai o hien tai 2 bien nay LUON bang nhau
  // (xem tokens.css), tinh theo tong mau ink de tuy bien theo tung bo mau thay vi xam lanh co dinh.
  const hoverTint = mixHex(seed.surface, seed.ink, 0.05);

  return {
    bg: seed.bg,
    surface: seed.surface,
    "surface-soft": seed.surfaceSoft,
    "surface-100": hoverTint,
    "surface-2": hoverTint,
    "surface-200": seed.line,
    "topbar-bg": seed.surface,
    "sidebar-from": seed.surface,
    "sidebar-to": seed.bg,
    "sidebar-ink": ink900,
    "sidebar-ink-mid": ink700,
    "sidebar-ink-dim": ink500,
    "sidebar-highlight": hexToRgba(seed.priority, 0.08),
    line: seed.line,
    "ink-900": ink900,
    "ink-700": ink700,
    "ink-600": ink600,
    "ink-500": ink500,
    "ink-400": ink400,
    ...Object.fromEntries(Object.entries(pick(ocean, ["950", "900", "800", "700", "600", "500", "400", "100"])).map(([k, v]) => [`ocean-${k}`, v])),
    ...Object.fromEntries(Object.entries(pick(teal, ["700", "600", "500", "100"])).map(([k, v]) => [`teal-${k}`, v])),
    ...Object.fromEntries(Object.entries(pick(amber, ["700", "600", "500", "100"])).map(([k, v]) => [`amber-${k}`, v])),
    ...Object.fromEntries(Object.entries(pick(coral, ["700", "600", "500", "400", "100"])).map(([k, v]) => [`coral-${k}`, v])),
    ...Object.fromEntries(Object.entries(pick(orange, ["700", "600", "500", "100"])).map(([k, v]) => [`orange-${k}`, v])),
    ...Object.fromEntries(Object.entries(pick(indigo, ["700", "600", "500", "100"])).map(([k, v]) => [`indigo-${k}`, v])),
    ...Object.fromEntries(Object.entries(pick(violet, ["700", "600", "500", "100"])).map(([k, v]) => [`violet-${k}`, v])),
    ...Object.fromEntries(Object.entries(pick(green, ["700", "600"])).map(([k, v]) => [`green-${k}`, v])),
  };
}

/** Ty le tuong phan WCAG giua 2 mau hex - dung khi ra soat thu cong cac bo mau moi (khong phai
 * kiem tra tu dong luc runtime, xem CLAUDE.md "khong co test suite"). */
export function contrastRatio(hexA: string, hexB: string): number {
  const rel = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    const lin = (c: number) => {
      const cs = c / 255;
      return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const la = rel(hexA) + 0.05;
  const lb = rel(hexB) + 0.05;
  return la > lb ? la / lb : lb / la;
}
