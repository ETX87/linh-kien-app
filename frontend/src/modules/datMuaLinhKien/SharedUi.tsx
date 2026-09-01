import { useState, useEffect, type ReactNode } from "react";
import { Btn, type BtnVariant } from "../../components/ui/Btn";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { api } from "../../api/client";
import { compressImage } from "../../lib/imageCompress";
import { trangThaiLabel, describeApiError, useNenAnhTraHangEnabled } from "./helpers";

// Cac component UI dung chung nhieu tab cua module "Dat mua linh kien" (tach tu
// DatMuaLinhKienModule.tsx - UI redesign Phase 3, phan hoi Codex 2026-08-19).

// SUA BUG (phan hoi 2026-08-21: "các trạng thái đang không có tiếng việt") - `value` la gia tri THO
// luu trong DB (khong dau, vd "Cho kho xac nhan"), truoc day hien THANG khong qua dictionary nhan dep
// nao - CHI dung dung de tra cuu mau (`tones`). Them `options` (danh sach { value, label } co san moi
// noi goi, dung chung voi TrangThaiChipFilter/ActiveFiltersBar) de dich sang nhan tieng Viet co dau
// truoc khi hien, qua trangThaiLabel (fallback ve chinh value neu khong khop - khong an du lieu).
export function StatusBadge({ value, tones, options }: { value: string; tones: Record<string, BadgeTone>; options: { value: string; label: string }[] }) {
  return <Badge tone={tones[value] ?? "gray"}>{trangThaiLabel(options, value)}</Badge>;
}

// Thanh hien thi bo loc dang ap dung + nut xoa tung cai/xoa het (UI redesign phan hoi Codex
// 2026-08-19, muc P1 "nut reset filter + hien thi filter dang ap dung") - dung chung cho ca 4 tab
// danh sach, moi tab tu xay mang `chips` tu state filter rieng cua no. Rong (return null) khi khong
// co bo loc nao dang ap - khong chiem cho khi khong can.
export function ActiveFiltersBar({ chips }: { chips: { label: string; onClear: () => void }[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      <span className="text-xs text-[var(--ink-500)]">Đang lọc:</span>
      {chips.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={c.onClear}
          className="focus-ring inline-flex items-center gap-1 rounded-full bg-[var(--ocean-100)] px-2 py-0.5 text-xs font-medium text-[var(--ocean-900)] hover:brightness-95"
        >
          {c.label} <span aria-hidden="true">✕</span>
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => chips.forEach((c) => c.onClear())}
          className="focus-ring text-xs text-[var(--ink-500)] underline decoration-dotted underline-offset-2 hover:text-[var(--ink-700)]"
        >
          Xoá tất cả bộ lọc
        </button>
      )}
    </div>
  );
}

// Khoi "vùng dữ liệu" co vien+nen rieng trong Drawer chi tiet (them 2026-08-28, phan hoi ra soat UI/UX
// "chia thành các vùng dữ liệu" + "sửa chung cho 1 màn rồi áp dụng ra") - boc 1 nhom KvRow lien quan
// vao 1 khung THAT SU co ranh gioi thi giac (border+nen nhe), khac SectionTitle don thuan (chi 1 dong
// chu nho, khong co khung) - dung CHUNG cho ca DonHangDetailModal (DonCuaToiTab.tsx) lan
// TraHangDetailModal (TraHangTab.tsx), vi 2 man dung chung 1 nguon du lieu (dat_don_hang) nen chung 1
// bo cuc hop ly cho ca 2.
export function DetailZone({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--line)] bg-[var(--surface-100)]/50 p-3 ${className}`}>
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--ink-400)] font-extrabold mb-1.5">{title}</div>
      {children}
    </div>
  );
}

// Dai "chỉ số nhanh" ngay duoi tieu de Drawer (cung dot 2026-08-28) - vai chi so quan trong nhat (SL/
// tien/trang thai) noi bat NGAY LAP TUC thay vi phai cuon vao than Drawer moi thay (van de #11 trong
// ra soat UX). Dung CHUNG cho ca 2 man chi tiet, dat truoc moi DetailZone.
export function QuickStat({ label, value, tone }: { label: string; value: ReactNode; tone?: "green" | "default" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--ink-400)] font-bold">{label}</div>
      <div className={`font-bold text-base ${tone === "green" ? "text-[var(--green-700)]" : "text-[var(--ink-900)]"}`}>{value}</div>
    </div>
  );
}

// Muc C (phan hoi 2026-08-28: "Home mobile lỗi giao diện nặng" - danh sach 10 van de + de xuat da gui
// nguoi dung chot) - khoi 1 section co the thu gon/mo rong, dung cho "Báo cáo tổng thể"/"Đơn hàng đang
// tồn theo KTV" tren TrangChuTab.tsx: mac dinh MO tren desktop (hanh vi cu, khong doi), mac dinh DONG
// tren mobile (giam do dai trang khi moi vao Home - nguoi dung tu bam mo khi can xem sau). Chi doc
// `defaultOpen` 1 LAN luc mount (useState lazy) - xoay man hinh/resize sau do khong tu dong dong lai
// section nguoi dung da chu dong mo, tranh mat trang thai bat ngo.
// `open`/`onOpenChange` (them 2026-09-01, phan hoi "đang tồn/tồn đọng toàn hệ thống không click để
// xem danh sách được") - CHO PHEP component cha dieu khien trang thai mo/dong tu ben ngoai (vd bam 1
// StatCard o TrangChuTab de tu mo rong + cuon toi report nay), MAC DINH van khong truyen (uncontrolled,
// dung internal useState nhu cu) - khong doi hanh vi cac noi dang goi component nay.
export function CollapsibleSection({
  title,
  note,
  defaultOpen,
  open: openProp,
  onOpenChange,
  children,
}: {
  title: ReactNode;
  note?: ReactNode;
  defaultOpen: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = (updater: (v: boolean) => boolean) => {
    if (onOpenChange) onOpenChange(updater(open));
    else setOpenState(updater);
  };
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mt-6 mb-2">
        <div className="text-[11px] uppercase tracking-wider text-[var(--ink-400)] font-extrabold">
          {title}
          {note}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="focus-ring shrink-0 text-[11px] font-semibold text-[var(--ocean-700)] hover:underline"
        >
          {open ? "▲ Thu gọn" : "▼ Mở rộng"}
        </button>
      </div>
      {open && children}
    </div>
  );
}

// Thanh loc THU GON (nut "☰ Bộ lọc ▾" + o tim kiem tu do, an mac dinh phan loc chi tiet phia duoi) -
// tach tu DonCuaToiTab.tsx (UI redesign 2026-08-21, "hợp nhất phong cách giao diện": Trả hàng/Phiếu
// xuất kho/Thiếu linh kiện truoc day luon hien san chip loc + KHONG co o tim kiem, khac voi Mua hang/
// Cong no - dung chung component nay de ca 4 man giong nhau tuyet doi). `children` la phan loc CHI
// TIET (chip trang thai/Select phu) chi hien khi mo rong - moi tab tu quyet dinh noi dung ben trong,
// component nay chi lo phan khung + trang thai an/hien.
export function FilterSearchBar({
  showFilters,
  onToggleFilters,
  activeFilterCount,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  trailing,
  activeFilters,
  children,
}: {
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  /** Noi dung phu them cuoi hang nut/o tim kiem (vd nut hanh dong chinh "+ Tạo phiếu xuất kho" cua
   * PhieuXuatKhoTab) - dat rieng thanh prop (khong phai children) vi children danh cho khoi loc CHI
   * TIET (chi hien khi mo rong), con `trailing` LUON hien cung hang voi nut thu gon - tranh loi bo
   * cuc neu chen thang JSX ben ngoai (component nay tra ve Fragment 2 khoi, dat lam sibling flex se
   * lam nut hanh dong bi day xuong duoi khoi loc mo rong thay vi nam yen tren cung hang nut). */
  trailing?: ReactNode;
  /** FIX (phan hoi 2026-08-28: "'Đang lọc: (còn tồn X)' chuyển lên cùng dòng với nút bộ lọc") - truyen
   * thang <ActiveFiltersBar/> vao day thay vi render no nhu 1 sibling RIENG ben duoi FilterSearchBar.
   * Dat NGAY SAU nut "Bộ lọc" va TRUOC o tim kiem trong CUNG 1 flex-wrap - tren man hep, o tim kiem
   * (rong co dinh) la phan tu it uu tien nhat nen se tu wrap xuong dong duoi TRUOC, giu nut+chip dang
   * loc luon dung 1 hang voi nhau. */
  activeFilters?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-2 flex-wrap justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {/* DOI STYLE (2026-08-24, khop nut ".btn" cua concept 1 "Structured Neutral" - vien mong 1px,
              KHONG shadow, chu semibold 600, hover doi nen sang token surface-100 thay vi mau slate
              cung "roi" khoi bang mau he thong) - CHI doi className, khong doi hanh vi/logic. */}
          <button
            type="button"
            onClick={onToggleFilters}
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm font-semibold text-[var(--ink-600)] hover:bg-[var(--surface-100)]"
          >
            {showFilters ? "▲ Ẩn bộ lọc" : `☰ Bộ lọc${activeFilterCount > 0 ? ` (${activeFilterCount})` : ""} ▾`}
          </button>
          {activeFilters}
          {onSearchChange && (
            <input
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder ?? "Tìm kiếm..."}
              className="focus-ring bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-64"
            />
          )}
        </div>
        {trailing}
      </div>
      {showFilters && children && (
        <div className="mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-xl p-3 flex flex-col gap-3">{children}</div>
      )}
    </>
  );
}

// Quick filter dang chip/segmented thay cho Select lon (UI redesign phan hoi Codex 2026-08-19, muc
// P2#1) - CUNG danh sach option nhu Select cu (khong doi bo trang thai/logic), chi doi CACH HIEN THI
// de thay duoc ca trang thai dang chon VA cac lua chon khac cung luc, khong can mo dropdown. Dung
// dung pattern nut sub-tab "Mua hang | Cong no | Tra hang" da co san trong file.
export function TrangThaiChipFilter({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value || "__all__"}
            type="button"
            onClick={() => onChange(o.value)}
            className={`focus-ring rounded-full px-[13px] py-[5.5px] text-xs font-medium transition-colors ${
              active ? "bg-[var(--ocean-800)] border border-[var(--ocean-800)] text-white font-semibold" : "bg-white text-[var(--ink-700)] border border-[var(--line)] hover:border-[var(--ocean-800)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Bo loc Khu vuc DA CHON NHIEU (them 2026-08-27, phan hoi "bổ sung filter theo khu vực... GS tự lọc
// mặc định theo khu vực mình được set") - khac TrangThaiChipFilter (chon 1), 1 GS/TN/Kho/Ke toan co
// the phu trach NHIEU Khu vuc cung luc nen can toggle duoc tung khu vuc doc lap. `value` rong (Set
// size 0) = "Tất cả" (khong loc gi, dung y nghia voi cac bo loc khac trong module nay - CHI la bo loc
// UI, KHONG phai gioi han bao mat nhu View - xem GET /khu-vuc-cua-toi backend).
export function KhuVucChipFilter({
  value,
  onChange,
  options,
}: {
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  options: { value: string; label: string }[];
}) {
  function toggle(ma: string) {
    const next = new Set(value);
    if (next.has(ma)) next.delete(ma);
    else next.add(ma);
    onChange(next);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(new Set())}
        className={`focus-ring rounded-full px-[13px] py-[5.5px] text-xs font-medium transition-colors ${
          value.size === 0 ? "bg-[var(--ocean-800)] border border-[var(--ocean-800)] text-white font-semibold" : "bg-white text-[var(--ink-700)] border border-[var(--line)] hover:border-[var(--ocean-800)]"
        }`}
      >
        Tất cả
      </button>
      {options.map((o) => {
        const active = value.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`focus-ring rounded-full px-[13px] py-[5.5px] text-xs font-medium transition-colors ${
              active ? "bg-[var(--ocean-800)] border border-[var(--ocean-800)] text-white font-semibold" : "bg-white text-[var(--ink-700)] border border-[var(--line)] hover:border-[var(--ocean-800)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// UI redesign (phan hoi Codex 2026-08-19, muc P2 "Preview truoc bulk action"): bam LAN 2 moi thuc su
// chay (giong pattern "Bam lan nua de xac nhan huy" da co san o DonHangDetailModal - confirmCancelPending)
// thay vi chay NGAY LAP TUC khi bam 1 lan nhu truoc - tranh bam nham duyet/tu choi hang loat khong co
// buoc dung lai. Tu dong RESET ve chua xac nhan khi count doi (vd doi selection) - tranh tinh huong
// dang "cho xac nhan" cho N dong cu ma nguoi dung da doi sang chon M dong khac.
export function BulkConfirmButton({
  label,
  confirmLabel,
  count,
  onConfirm,
  disabled,
  loading,
  variant = "primary",
}: {
  label: string;
  confirmLabel: string;
  count: number;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: BtnVariant;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(false), [count]);
  if (armed) {
    return (
      <Btn size="sm" variant={variant} onClick={() => { setArmed(false); onConfirm(); }} disabled={disabled} loading={loading}>
        {confirmLabel}
      </Btn>
    );
  }
  return (
    <Btn size="sm" variant={variant} onClick={() => setArmed(true)} disabled={disabled}>
      {label}
    </Btn>
  );
}


// Anh linh kien can tra (phan hoi 2026-08-24, muc 1: "bắt buộc phải có ảnh... tối đa 3 ảnh") - dung
// luc TAO don tra hang (TaoDonTab.tsx/TaoDonMobileScreen.tsx). Moi anh chon xong UPLOAD NGAY qua
// POST /tra-hang/upload-anh (pre-upload len Drive, CHUA gan vao dong nao - id dong con chua sinh luc
// nay), giu {driveFileId, url} trong state cua form (xem DonHangDraft.anh) de gui kem luc submit
// POST /phieu-dat that su gan vao dong vua sinh (xem datMuaLinhKien.ts).
export function TraHangAnhPicker({
  photos, onChange, addToast, max = 3,
}: {
  photos: { driveFileId: string; url: string }[];
  onChange: (next: { driveFileId: string; url: string }[]) => void;
  addToast: (msg: string) => void;
  max?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const nenAnh = useNenAnhTraHangEnabled();
  async function handleFile(file: File) {
    if (photos.length >= max) return;
    setUploading(true);
    try {
      const upload = nenAnh ? await compressImage(file) : file;
      const bytes = await upload.arrayBuffer();
      const res = await api.postBinary<{ driveFileId: string; url: string }>("/tra-hang/upload-anh", bytes, upload.type || "image/jpeg");
      onChange([...photos, res]);
    } catch (err) {
      addToast("Lỗi tải ảnh: " + describeApiError(err));
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {photos.map((p, i) => (
          <span key={p.driveFileId} className="inline-flex items-center gap-1.5 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2 py-1 text-xs">
            <a href={p.url} target="_blank" rel="noreferrer" className="text-[var(--ocean-800)] underline underline-offset-2">
              📷 Ảnh {i + 1}
            </a>
            <button type="button" onClick={() => onChange(photos.filter((_, j) => j !== i))} className="text-[var(--coral-600)] font-bold leading-none" title="Xoá ảnh này">
              ✕
            </button>
          </span>
        ))}
        {photos.length < max && (
          <label
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border border-dashed cursor-pointer ${
              uploading ? "opacity-50 pointer-events-none" : "border-[var(--line)] text-[var(--ink-500)] hover:border-[var(--ocean-400)] hover:text-[var(--ocean-600)]"
            }`}
          >
            {uploading ? "Đang tải..." : "+ Thêm ảnh"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <div className={`text-[11px] mt-1 ${photos.length === 0 ? "text-[var(--coral-600)]" : "text-[var(--ink-400)]"}`}>{photos.length}/{max} ảnh (bắt buộc tối thiểu 1)</div>
    </div>
  );
}

// Cot "Ma yeu cau su co lien quan" - bam mo modal "Xem chi tiet case" (CaseDetailModal.tsx, qua
// openCase o DatMuaLinhKienModule) khi co canXemChiTietCa VA openCase - tu 2026-08-26 canXemChiTietCa
// LUON true (xem comment o DatMuaLinhKienModule), KHONG con loai KTV/CTV/Tram nhu truoc. Dung chung
// cho bang dong con o DonCuaToiTab va bang dong trong PhieuDatDetailModal.
export function MaYcscCell({ value, canXemChiTietCa, openCase }: { value: string | null; canXemChiTietCa: boolean; openCase?: (id: string, tab?: string) => void }) {
  if (!value?.trim()) return <span className="text-[var(--ink-400)]">—</span>;
  if (canXemChiTietCa && openCase) {
    // SUA (phan hoi 2026-08-28: "sửa màu và tô đậm lên để người dùng biết có thể click vào") - truoc
    // day chi doi mau + gach chan luc hover, nhung hover KHONG BAO GIO kich hoat tren cam ung (mobile)
    // nen nhin giong text thuong, khong ai biet bam duoc. Gach chan LUON HIEN (khong doi hover nua) +
    // dam mau/dam chu hon de ro rang la 1 link bam duoc ngay ca tren mobile.
    return (
      <span className="font-mono text-[var(--ocean-700)] font-bold underline decoration-[var(--ocean-700)]/40 underline-offset-2 cursor-pointer active:opacity-70" onClick={() => openCase(value.trim(), "giai-trinh")}>
        {value}
      </span>
    );
  }
  return <span className="font-mono">{value}</span>;
}

// CHOT 2026-08-15: thay the PhieuDatDetailModal (chi tiet ca "phieu") - khong con khai niem phieu,
// modal gio chi xem/xu ly DUNG 1 dong don hang (goi GET /dat-mua-lk/don-hang/:id). Khong con checkbox/
// bulk-select trong modal (bulk-select van hoat dong o ngoai bang danh sach, xem DonHangGroupedList).
