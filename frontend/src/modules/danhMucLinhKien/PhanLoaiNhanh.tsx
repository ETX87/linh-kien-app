import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/Badge";
import { DropdownPortal } from "../../components/ui/DropdownPortal";
import { useToast } from "../../components/ui/Toast";
import { api } from "../../api/client";
import { khopTim } from "../../lib/boDau";

/** O "Phân loại" trong bang Bang gia (2026-10-01, "khi click vào phân loại cho phép chọn phân loại nhanh"): bam o -> xo
 * danh sach phan loai dang dung + o go (loc / them phan loai moi) -> chon la luu ngay qua PATCH /settings/linh-kien/:ma
 * (chi gui don_vi, cac truong khac giu nguyen). Khong xoa duoc phan loai (backend bat buoc, khong nhan rong).
 * Nguoi khong co quyen sua -> hien chu/badge nhu cu. */
export function PhanLoaiNhanh({ ma, value, options, canEdit }: { ma: string; value: string | null | undefined; options: string[]; canEdit: boolean }) {
  const hienTai = value?.trim() || "";
  const nhan = hienTai ? <span className="text-xs">{hienTai}</span> : <Badge tone="amber">Chưa phân loại</Badge>;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const addToast = useToast();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || contentRef.current?.contains(t)) return;
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

  if (!canEdit) return nhan;

  const tuKhoa = q.trim();
  const loc = options.filter((o) => khopTim(o, tuKhoa));
  const coTheThem = !!tuKhoa && !options.some((o) => o.toLowerCase() === tuKhoa.toLowerCase());

  async function chon(v: string) {
    const moi = v.trim();
    if (!moi || saving) return;
    if (moi === hienTai) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/settings/linh-kien/${encodeURIComponent(ma)}`, { don_vi: moi });
      addToast(`Đã phân loại ${ma}: ${moi}`);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    } catch {
      addToast("Không thể cập nhật phân loại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        title="Bấm để chọn phân loại"
        onClick={(e) => {
          // O nam trong dong co onRowClick (mo chi tiet LK) - khong de lan len.
          e.stopPropagation();
          setQ("");
          setOpen((v) => !v);
        }}
        className="focus-ring -mx-1 inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[var(--color-surface-hover)]"
      >
        {nhan}
        <span className="text-[10px] text-[var(--color-text-faint)]">▾</span>
      </button>
      <DropdownPortal anchorRef={anchorRef} contentRef={contentRef} open={open} matchWidth={false} maxHeight={300} className="w-56 rounded-xl py-1.5">
        <div className="px-2 pb-1.5">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (coTheThem) void chon(tuKhoa);
              else if (loc.length > 0) void chon(loc[0]);
            }}
            placeholder="Tìm hoặc gõ phân loại mới..."
            disabled={saving}
            className="focus-ring w-full rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs"
          />
        </div>
        {loc.map((o) => (
          <button
            key={o}
            type="button"
            disabled={saving}
            onClick={() => void chon(o)}
            className={`block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-hover)] ${
              o === hienTai ? "bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]" : "text-[var(--color-text)]"
            }`}
          >
            {o === hienTai ? "✓ " : ""}
            {o}
          </button>
        ))}
        {coTheThem && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void chon(tuKhoa)}
            className="block w-full truncate px-3 py-1.5 text-left text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)]"
          >
            + Thêm “{tuKhoa}”
          </button>
        )}
        {!coTheThem && loc.length === 0 && <div className="px-3 py-1.5 text-xs text-[var(--color-text-faint)]">Chưa có phân loại nào</div>}
        {saving && <div className="px-3 pt-1 text-[11px] text-[var(--color-text-faint)]">Đang lưu...</div>}
      </DropdownPortal>
    </>
  );
}
