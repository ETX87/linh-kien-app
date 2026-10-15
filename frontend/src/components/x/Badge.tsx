import type { ReactNode } from "react";
import { tn } from "../../i18n";

export type Tone = "info" | "success" | "warning" | "danger" | "purple" | "neutral";

// DESIGN_GUIDELINES.md §6.2 (chuyen doi 2026-09-26): badge trang thai mac dinh = NEN PASTEL + chu nhan
// dam, bo 10px. Y nghia mau co dinh (§7.4): info = cyan "dang chay/cho buoc tiep", warning = cam "can
// xu ly" (kem cham tron), success = xanh la "hoan thanh", danger = do "tu choi/loi", neutral = huy.
// `line` (vien mong) giu lai lam loi thoat cho noi can nhan manh nhe hon, khong con la mac dinh.
const LINE: Record<Tone, string> = {
  info: "border-[var(--color-info)]/40 text-[var(--color-info)]",
  success: "border-[var(--color-success)]/40 text-[var(--color-success)]",
  warning: "border-[var(--color-warning)]/50 text-[var(--color-warning-strong)]",
  danger: "border-[var(--color-danger)]/40 text-[var(--color-danger-strong)]",
  purple: "border-[var(--color-purple)]/40 text-[var(--color-purple-strong)]",
  neutral: "border-[var(--color-border-strong)] text-[var(--color-text-secondary)]",
};
const SOFT: Record<Tone, string> = {
  info: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]",
  purple: "bg-[var(--color-purple-soft)] text-[var(--color-purple-strong)]",
  neutral: "bg-[var(--color-neutral-soft)] text-[var(--color-text-secondary)]",
};

// variant "dot" (2026-10-15, "app màu mè, rối mắt"): trang thai PHU (vd Phiếu xuất kho / Chuyển tiền o danh sach don) = cham tron
// mau + chu thuong, KHONG nen - moi dong chi 1 badge nen mau (trang thai chinh).
const DOT: Record<Tone, string> = {
  info: "bg-[var(--color-info)]",
  success: "bg-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]",
  danger: "bg-[var(--color-danger)]",
  purple: "bg-[var(--color-purple)]",
  neutral: "bg-[var(--color-text-faint)]",
};

// `dot` (them 2026-09-28): cham tron cua tone warning mang nghia "can xu ly" - CHI hop voi badge TRANG
// THAI. Badge phan loai (vd LoaiDeXuatBadge) truyen dot={false} de khong bi hieu nham + khong lech kieu.
export function Badge({
  children, tone = "info", variant = "soft", dot = true,
}: { children: ReactNode; tone?: Tone; variant?: "line" | "soft" | "dot"; dot?: boolean }) {
  if (variant === "dot") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium leading-none text-[var(--color-text-body)]">
        <span aria-hidden className={`h-[6px] w-[6px] shrink-0 rounded-full ${DOT[tone]}`} />
        {tn(children)}
      </span>
    );
  }
  const cls = variant === "soft" ? SOFT[tone] : `border ${LINE[tone]}`;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--radius-badge)] px-2 py-[3px] text-[11px] font-semibold leading-none ${cls}`}>
      {dot && tone === "warning" && variant === "soft" && <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--color-warning)]" />}
      {tn(children)}
    </span>
  );
}

// Map chuoi trang thai -> tone (khop mau tren screenshot 260910).
export function statusTone(s: string): Tone {
  if (/(TN đã duyệt|Đã duyệt|Hoàn thành|Đã về kho|Kho đã kết thúc)/.test(s)) return "success";
  if (/(Từ chối|Quá hạn)/.test(s)) return "danger";
  if (/(Đã huỷ|Đã hủy)/.test(s)) return "neutral";
  if (/(Chờ TBP|Chờ kế toán|Chờ hàng)/.test(s)) return "warning";
  return "info"; // Chờ TN / Đang xử lý / Chờ kho / Chờ QC ...
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}

export function RoleChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-[var(--radius-badge)] bg-[var(--chip-bg)] px-2 py-[3px] text-[10.5px] font-semibold text-[var(--chip-fg)]">
      {tn(children)}
    </span>
  );
}
