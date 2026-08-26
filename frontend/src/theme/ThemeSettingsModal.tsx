import { Modal } from "../components/ui/Modal";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Select } from "../components/ui/Select";
import { useState } from "react";
import type { RoleSeed } from "./colorRamp";
import { resolveTheme } from "./colorRamp";
import { DEFAULT_PRESET_ID, DEFAULT_THEME_VARS, PRESETS } from "./presets";
import { FONT_OPTIONS } from "./fonts";
import { useThemeSettings } from "./useThemeSettings";

const ROLE_LABELS: [keyof RoleSeed, string][] = [
  ["bg", "Nền trang"],
  ["surface", "Bề mặt thẻ/card"],
  ["surfaceSoft", "Nền mềm (header bảng, hover)"],
  ["ink", "Chữ chính"],
  ["inkSoft", "Chữ phụ"],
  ["line", "Đường viền"],
  ["priority", "Màu ưu tiên / nút chính"],
  ["ocean", "Thông tin / đang xử lý"],
  ["teal", "Thành công / hoàn thành"],
  ["amber", "Cảnh báo / chờ duyệt"],
  ["coral", "Lỗi / từ chối / huỷ"],
];

/** Mini-mockup THAT (khong phai chấm màu minh hoạ) dung dung mau da resolve cua 1 bo - giup nguoi
 * dung thay truoc hinh dang topbar/sidebar/card/nut/badge se trong nhu the nao truoc khi bam ap dung. */
function ThemeSwatchPreview({ vars }: { vars: Record<string, string> }) {
  return (
    <div className="rounded-lg border overflow-hidden shrink-0" style={{ borderColor: vars.line, width: 92, height: 64 }}>
      <div className="flex h-full">
        <div className="w-5 h-full flex flex-col items-center pt-1.5 gap-1" style={{ background: vars["sidebar-from"] }}>
          <div className="w-2 h-2 rounded-full" style={{ background: vars["orange-600"] }} />
          <div className="w-2.5 h-0.5 rounded-full" style={{ background: vars["ink-400"] }} />
        </div>
        <div className="flex-1 flex flex-col" style={{ background: vars.bg }}>
          <div className="h-3 shrink-0" style={{ background: vars["topbar-bg"], borderBottom: `1px solid ${vars.line}` }} />
          <div className="flex-1 p-1.5 flex flex-col gap-1">
            <div className="rounded-sm px-1 py-0.5" style={{ background: vars.surface, border: `1px solid ${vars.line}` }}>
              <div className="w-full h-1 rounded-full mb-0.5" style={{ background: vars["ink-400"] }} />
              <div className="w-2/3 h-1 rounded-full" style={{ background: vars["orange-600"] }} />
            </div>
            <div className="flex gap-1">
              <div className="flex-1 h-2 rounded-full" style={{ background: vars["ocean-100"] }} />
              <div className="flex-1 h-2 rounded-full" style={{ background: vars["teal-100"] }} />
              <div className="flex-1 h-2 rounded-full" style={{ background: vars["amber-100"] }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemeSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useThemeSettings();
  const [tab, setTab] = useState<"presets" | "custom">("presets");

  return (
    <Modal open={open} onClose={onClose} title="🎨 Giao diện" width="max-w-2xl">
      <Tabs
        tabs={[
          { key: "presets", label: "Có sẵn" },
          { key: "custom", label: "Tuỳ chỉnh" },
        ]}
        active={tab}
        onChange={(k) => setTab(k as "presets" | "custom")}
      />

      {tab === "presets" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {PRESETS.map((p) => {
            const vars = p.id === DEFAULT_PRESET_ID ? DEFAULT_THEME_VARS : resolveTheme(p.seed);
            const active = theme.presetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => theme.setPreset(p.id)}
                className={`focus-ring flex items-start gap-3 text-left p-3 rounded-xl border transition-colors ${
                  active ? "border-[var(--ocean-800)] bg-[var(--ocean-100)]/30" : "border-[var(--line)] hover:bg-[var(--surface-soft)]"
                }`}
              >
                <ThemeSwatchPreview vars={vars} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-[var(--ink-900)]">{p.label}</span>
                    {active && <span className="text-[10px] font-bold text-[var(--ocean-800)]">✓ Đang dùng</span>}
                  </div>
                  <p className="text-xs text-[var(--ink-500)] mt-0.5 leading-snug">{p.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {tab === "custom" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ROLE_LABELS.map(([role, label]) => (
              <label key={role} className="flex items-center gap-2 text-xs font-medium text-[var(--ink-700)]">
                <input
                  type="color"
                  value={theme.customSeed[role]}
                  onChange={(e) => theme.setCustomColor(role, e.target.value)}
                  className="w-8 h-8 rounded-md border border-[var(--line)] cursor-pointer shrink-0 p-0"
                />
                {label}
              </label>
            ))}
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-1">Font chữ</label>
            <Select
              value={theme.fontId}
              onChange={theme.setFont}
              options={FONT_OPTIONS.map((f) => ({ value: f.id, label: f.label }))}
              className="max-w-xs"
            />
            <p className="text-[11px] text-[var(--ink-400)] mt-1">
              Chỉ đổi font phần nội dung — số liệu lớn (KPI) vẫn giữ font Manrope cố định.
            </p>
          </div>
          <Btn variant="ghost" size="sm" onClick={theme.reset}>
            Khôi phục mặc định
          </Btn>
        </div>
      )}

      <p className="text-[11px] text-[var(--ink-400)] mt-4 pt-3 border-t border-[var(--line)]">
        Chỉ lưu trên máy này (trình duyệt), không ảnh hưởng người dùng khác, không gửi lên máy chủ.
      </p>
    </Modal>
  );
}
