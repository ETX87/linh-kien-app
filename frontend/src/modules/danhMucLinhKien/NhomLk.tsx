import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/Badge";
import { DropdownPortal } from "../../components/ui/DropdownPortal";
import { useToast } from "../../components/ui/Toast";
import { api } from "../../api/client";
import { t } from "../../i18n";
import { NHOM_LK_LABEL, NHOM_LK_LIST, type NhomLk } from "../../lib/nhomLk";

/** Nhan "Nhóm LK" (Karofi / B2B, 2026-10-16, migration 0088). Karofi = mau thuong hieu, B2B = trung tinh (§10 giam mau). */
export function NhomLkBadge({ value }: { value: string | null | undefined }) {
  if (value !== "karofi" && value !== "b2b") return <span className="text-xs text-[var(--color-text-faint)]">—</span>;
  return <Badge tone={value === "karofi" ? "ocean" : "gray"}>{t(NHOM_LK_LABEL[value])}</Badge>;
}

/** O "Nhóm LK" trong bang Bang gia: bam -> chon Karofi / B2B, luu ngay qua PATCH /settings/linh-kien/:ma (chi gui nhom_lk).
 * Khong co quyen sua -> chi hien nhan. Cung kieu PhanLoaiNhanh. */
export function NhomLkNhanh({ ma, value, canEdit }: { ma: string; value: string | null | undefined; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const addToast = useToast();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const tg = e.target as Node;
      if (anchorRef.current?.contains(tg) || contentRef.current?.contains(tg)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!canEdit) return <NhomLkBadge value={value} />;

  async function chon(v: NhomLk) {
    if (saving) return;
    if (v === value) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/settings/linh-kien/${encodeURIComponent(ma)}`, { nhom_lk: v });
      addToast(`Đã chuyển ${ma} sang ${NHOM_LK_LABEL[v]}`);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    } catch {
      addToast("Không thể cập nhật nhóm linh kiện.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        title="Bấm để chọn nhóm linh kiện"
        onClick={(e) => {
          // O nam trong dong co onRowClick (mo chi tiet LK) - khong de lan len.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="focus-ring -mx-1 inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[var(--color-surface-hover)]"
      >
        <NhomLkBadge value={value} />
        <span className="text-[10px] text-[var(--color-text-faint)]">▾</span>
      </button>
      <DropdownPortal anchorRef={anchorRef} contentRef={contentRef} open={open} matchWidth={false} maxHeight={200} className="w-48 rounded-xl py-1.5">
        {NHOM_LK_LIST.map((o) => (
          <button
            key={o}
            type="button"
            disabled={saving}
            onClick={(e) => {
              e.stopPropagation();
              void chon(o);
            }}
            className={`block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-hover)] ${
              o === value ? "bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]" : "text-[var(--color-text)]"
            }`}
          >
            {o === value ? "✓ " : ""}
            {NHOM_LK_LABEL[o]}
          </button>
        ))}
      </DropdownPortal>
    </>
  );
}
