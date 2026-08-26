import { useCallback, useEffect, useState } from "react";
import type { RoleSeed } from "./colorRamp";
import { resolveTheme } from "./colorRamp";
import { DEFAULT_FONT_ID, FONT_OPTIONS } from "./fonts";
import { DEFAULT_PRESET_ID, DEFAULT_ROLE_SEED, DEFAULT_THEME_VARS, PRESETS } from "./presets";

// Tinh nang "Giao diện" (ca nhan) - CHI luu localStorage, KHONG bao gio goi API/dua len server (yeu
// cau nguoi dung, nhac lai 2 lan). Co che ap dung: ghi de truc tiep len document.documentElement.style
// (specificity cao nhat, de hoan tac bang removeProperty) - KHONG dung React context/them <style> moi,
// vi 701/765 lan dung mau trong code da la var(--x) san co trong tokens.css :root.
const STORAGE_KEY = "theme-settings-v1";

interface StoredSettings {
  presetId: string;
  customSeed?: Partial<RoleSeed>;
  fontId: string;
}

function readStored(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { presetId: DEFAULT_PRESET_ID, fontId: DEFAULT_FONT_ID };
    const parsed = JSON.parse(raw);
    return {
      presetId: typeof parsed.presetId === "string" ? parsed.presetId : DEFAULT_PRESET_ID,
      customSeed: parsed.customSeed,
      fontId: typeof parsed.fontId === "string" ? parsed.fontId : DEFAULT_FONT_ID,
    };
  } catch {
    return { presetId: DEFAULT_PRESET_ID, fontId: DEFAULT_FONT_ID };
  }
}

function resolveVars(s: StoredSettings): Record<string, string> {
  if (s.presetId === "custom") {
    const seed: RoleSeed = { ...DEFAULT_ROLE_SEED, ...s.customSeed };
    return resolveTheme(seed);
  }
  if (s.presetId === DEFAULT_PRESET_ID) return DEFAULT_THEME_VARS;
  const preset = PRESETS.find((p) => p.id === s.presetId);
  return preset ? resolveTheme(preset.seed) : DEFAULT_THEME_VARS;
}

// Ghi kem 1 ban "da tinh san" (resolvedVars/fontCssValue) vao localStorage cung voi settings tho
// (presetId/customSeed/fontId) - script inline chong nhay mau trong index.html chi doc 2 truong nay
// va set thang, KHONG can nhung lai toan bo logic HSL/resolveTheme (colorRamp.ts) sang JS thuan trong
// <script> tag (kho dong bo, de lech logic voi ban TypeScript). settings tho van giu de UI modal doc
// lai dung "presetId dang chon"/"cac mau tuy chinh da luu" khi mo lai.
function writeStored(s: StoredSettings) {
  const font = FONT_OPTIONS.find((f) => f.id === s.fontId) ?? FONT_OPTIONS[0];
  const payload = { ...s, resolvedVars: resolveVars(s), fontCssValue: font.cssValue };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** Ap dung 1 bo bien mau + font len document that - dung chung boi useThemeSettings VA script chong
 * nhay trong index.html (ham nay duoc goi lai o day, khong chi ton tai trong <script> inline, de 2
 * noi khong bao gio lech logic nhau). */
export function applyThemeToDocument(vars: Record<string, string>, fontCssValue: string) {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(vars)) root.setProperty(`--${name}`, value);
  root.setProperty("--font-body", fontCssValue);
  // PWA/status-bar theme-color (index.html hien hardcode #06304a = --ocean-900 mac dinh) - doi theo
  // luon de khop tong mau dang chon, tranh lech mau khi doi sang bo khac ocean.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && vars["ocean-900"]) meta.setAttribute("content", vars["ocean-900"]);
}

export function useThemeSettings() {
  const [settings, setSettings] = useState<StoredSettings>(() => readStored());

  useEffect(() => {
    const font = FONT_OPTIONS.find((f) => f.id === settings.fontId) ?? FONT_OPTIONS[0];
    applyThemeToDocument(resolveVars(settings), font.cssValue);
  }, [settings]);

  const persist = useCallback((next: StoredSettings) => {
    setSettings(next);
    writeStored(next);
  }, []);

  const setPreset = useCallback((presetId: string) => persist({ presetId, fontId: settings.fontId }), [persist, settings.fontId]);

  const setCustomColor = useCallback(
    (role: keyof RoleSeed, hex: string) => {
      const base: RoleSeed = settings.presetId === "custom" ? { ...DEFAULT_ROLE_SEED, ...settings.customSeed } : DEFAULT_ROLE_SEED;
      persist({ presetId: "custom", customSeed: { ...base, [role]: hex }, fontId: settings.fontId });
    },
    [persist, settings],
  );

  const setFont = useCallback((fontId: string) => persist({ ...settings, fontId }), [persist, settings]);

  const reset = useCallback(() => persist({ presetId: DEFAULT_PRESET_ID, fontId: DEFAULT_FONT_ID }), [persist]);

  const customSeed: RoleSeed = { ...DEFAULT_ROLE_SEED, ...(settings.presetId === "custom" ? settings.customSeed : undefined) };

  return {
    presetId: settings.presetId,
    fontId: settings.fontId,
    customSeed,
    setPreset,
    setCustomColor,
    setFont,
    reset,
  };
}
