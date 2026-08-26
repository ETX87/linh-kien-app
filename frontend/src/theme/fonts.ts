// Lua chon font CHU CHINH (--font-body, chi phoi ~95% chu trong app qua `body{font-family:var(...)}`
// trong tokens.css) cho tinh nang "Giao diện" - CHI 3 lua chon (khong lam 5 nhu y tuong ban dau) de
// tranh phinh bundle voi 1 tinh nang khong phai ai cung dung. Ca 3 deu ho tro day du dau tieng Viet.
// `.font-display` (Manrope, so lieu KPI) va `.font-mono` (IBM Plex Mono) CO CHU DICH giu co dinh -
// coi la 2 font "thuong hieu", khong lo trong danh sach nay.
export interface FontOption {
  id: string;
  label: string;
  /** Gia tri gan thang cho --font-body (ten font + fallback, khop quy uoc co san trong tokens.css). */
  cssValue: string;
}

export const DEFAULT_FONT_ID = "inter";

export const FONT_OPTIONS: FontOption[] = [
  { id: "inter", label: "Inter (mặc định)", cssValue: '"Inter", ui-sans-serif, system-ui, sans-serif' },
  { id: "manrope", label: "Manrope", cssValue: '"Manrope", ui-sans-serif, system-ui, sans-serif' },
  { id: "be-vietnam-pro", label: "Be Vietnam Pro", cssValue: '"Be Vietnam Pro", ui-sans-serif, system-ui, sans-serif' },
];
