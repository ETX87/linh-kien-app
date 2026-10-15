import { useState, useEffect, useRef, type ReactNode } from "react";
import { Btn, type BtnVariant } from "../../components/x/Btn";
import { Badge, type Tone } from "../../components/x/Badge";
import { Select } from "../../components/x/Form";
import { DropdownPortal } from "../../components/ui/DropdownPortal";
import { api } from "../../api/client";
import { anhVuaGioiHan, compressImage } from "../../lib/imageCompress";
import { formatPersonDisplay, usePersonDirectory } from "../../lib/personDisplay";
import { trangThaiLabel, describeApiError, useNenAnhTraHangEnabled, LOAI_DON_TONE, loaiDonLabel } from "./helpers";
import { t } from "../../i18n";
import { linkAnToan } from "../../lib/linhAnToan";
import { baoLoiTaiAnh, canhBaoHanMucAnh, type HanMucAnh } from "../../lib/hanMucAnh";

// Cac component UI dung chung nhieu tab cua module "Dat mua linh kien" (tach tu
// DatMuaLinhKienModule.tsx - UI redesign Phase 3, phan hoi Codex 2026-08-19).

// Xem anh phong to ngay tren man hinh hien tai (phan hoi 2026-09-10: "bây giờ đang mở ra 1 link khác
// rất phiền") - THAY the cho pattern cu <a href={url} target="_blank"> dung rai rac o cac man chi tiet
// don hang/PXK/tra hang (mo tab moi, mat ngu canh dang xem). Port tu ImageLightbox cuc bo cua
// DanhMucLinhKienModule.tsx (giu nguyen hanh vi: Escape/bam ra ngoai de dong, van co link "Mo anh goc"
// cho ai muon tai/mo tab that) - chuyen thanh dung CHUNG o day vi can dung o nhieu tab khac trong module
// nay (PhieuXuatKhoTab/TraHangTab/DonCuaToiTab), khong chi rieng danh muc linh kien.
export function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-8 anim-in" onClick={onClose}>
      <button onClick={onClose} className="focus-ring absolute top-4 right-4 w-9 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20 text-lg">
        ✕
      </button>
      <img src={url} alt={t("Ảnh phóng to")} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <a
        href={linkAnToan(url)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-5 text-xs text-white/70 hover:text-white hover:underline"
      >
        {t("Mở ảnh gốc trên Google Drive ↗")}
      </a>
    </div>
  );
}

// Tieu de 1 dong "Lịch sử xử lý" (2026-09-30, phan hoi "log đang để trạng thái - tên người thao tác gây hiểu lầm là trạng
// thái đó do người thao tác xử lý"): NGUOI THAO TAC dung dau (dam) + hanh dong (chu nhat) + trang thai KET QUA trong 1 o
// vien rieng -> doc thanh "Nguyễn A chuyển sang [Chờ TN duyệt]", khong con nham la Nguyen A dang xu ly buoc do.
// Dung chung 4 man: don hang, phieu xuat kho, thieu hang, tra hang.
export function LogTieuDe({ nguoi, hanhDong, trangThai, ghiChu }: { nguoi: ReactNode; hanhDong: string; trangThai?: ReactNode; ghiChu?: string | null }) {
  return (
    <>
      <span className="font-semibold text-[var(--color-text)]">{nguoi}</span>{" "}
      <span className="font-normal text-[var(--color-text-secondary)]">{hanhDong}</span>
      {trangThai && (
        <>
          {" "}
          <span className="inline-flex items-center rounded-[var(--radius-badge)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1.5 py-px text-[11.5px] font-semibold text-[var(--color-text)]">
            {trangThai}
          </span>
        </>
      )}
      {ghiChu && <span className="mt-0.5 block whitespace-pre-line font-normal text-[var(--color-text-body)]">{ghiChu}</span>}
    </>
  );
}

/** Ten nguoi thao tac trong log (ten hien thi day du moi tai khoan; "he-thong"/rong = "Hệ thống"). */
export function useTenNguoiLog(): (email: string | null | undefined) => string {
  const dir = usePersonDirectory();
  return (email) => (!email || email === "he-thong" ? t("Hệ thống") : formatPersonDisplay(email, dir));
}

// Thumbnail <img> co the bam de phong to (thay cho <a target="_blank"><img/></a>) - dung cho cac o
// hien danh sach anh dang thumbnail (vd "Ảnh LK cần trả"/"Ảnh bằng chứng QC" trong TraHangTab).
export function ImageThumb({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="focus-ring rounded-lg">
        <img src={url} alt={alt} className={className} />
      </button>
      {open && <ImageLightbox url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

// Link dang chu ("Xem ảnh biên bản"/"📷 Ảnh 1"...) co the bam de phong to (thay cho <a target="_blank">)
// - dung cho cac cho hien anh dang link chu thay vi thumbnail.
export function ImageLink({ url, className, children }: { url: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <ImageLightbox url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

// SUA BUG (phan hoi 2026-08-21: "các trạng thái đang không có tiếng việt") - `value` la gia tri THO
// luu trong DB (khong dau, vd "Cho kho xac nhan"), truoc day hien THANG khong qua dictionary nhan dep
// nao - CHI dung dung de tra cuu mau (`tones`). Them `options` (danh sach { value, label } co san moi
// noi goi, dung chung voi TrangThaiChipFilter/ActiveFiltersBar) de dich sang nhan tieng Viet co dau
// truoc khi hien, qua trangThaiLabel (fallback ve chinh value neu khong khop - khong an du lieu).
// `phu` (2026-10-15): trang thai PHU cua dong (vd Phiếu xuất kho / Chuyển tiền o danh sach don) - cham mau + chu thuong, khong nen;
// moi dong chi giu 1 badge nen mau cho trang thai chinh.
export function StatusBadge({ value, tones, options, phu = false }: { value: string; tones: Record<string, Tone>; options: { value: string; label: string }[]; phu?: boolean }) {
  return <Badge tone={tones[value] ?? "neutral"} variant={phu ? "dot" : "soft"}>{trangThaiLabel(options, value)}</Badge>;
}

// Thanh hien thi bo loc dang ap dung + nut xoa tung cai/xoa het (UI redesign phan hoi Codex
// 2026-08-19, muc P1 "nut reset filter + hien thi filter dang ap dung") - dung chung cho ca 4 tab
// danh sach, moi tab tu xay mang `chips` tu state filter rieng cua no. Rong (return null) khi khong
// co bo loc nao dang ap - khong chiem cho khi khong can.
// Nhan "Loại"/"Loại đề xuất" THONG NHAT cho moi man (phan hoi 2026-09-28 "thống nhất phong cách giao
// diện cho loại đề xuất" - truoc day "TRẢ HÀNG…" (tone warning) co them cham tron cua badge trang thai,
// lech kieu va bi cat chu). Cung 1 kieu pill, KHONG cham, chu IN HOA (khop gia tri loai_de_xuat); mau
// theo nhom Mua/Cong no/Tra hang (LOAI_DON_TONE). Khong co loai_de_xuat -> nhan nhom.
export function loaiDeXuatText(loaiDon: string | null | undefined, loaiDeXuat?: string | null): string {
  const nhom = (loaiDon && loaiDon in LOAI_DON_TONE ? loaiDon : "mua") as keyof typeof LOAI_DON_TONE;
  return loaiDonLabel(nhom, loaiDeXuat).toUpperCase();
}

export function LoaiDeXuatBadge({ loaiDon, loaiDeXuat }: { loaiDon: string | null | undefined; loaiDeXuat?: string | null }) {
  // 2026-10-15 ("app màu mè, rối mắt"): Loai = CHU THUONG trung tinh (truoc: pill mau theo nhom Mua/Cong no/Tra hang) - mau chi danh
  // cho trang thai. Cot "Loại" + loc cot van phan biet duoc nhom.
  return <span className="whitespace-nowrap text-[11px] font-semibold tracking-wide text-[var(--color-text-secondary)]">{loaiDeXuatText(loaiDon, loaiDeXuat)}</span>;
}

export function ActiveFiltersBar({ chips }: { chips: { label: string; onClear: () => void }[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      <span className="text-xs text-[var(--ink-500)]">{t("Đang lọc:")}</span>
      {chips.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={c.onClear}
          className="focus-ring inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)] hover:brightness-95"
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
          {t("Xoá tất cả bộ lọc")}
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
      {/* SUA (ra soat "giao diện demo không hề giống" 2026-09-09) - mau chu doi tu --ink-400 (xam nhat)
          sang --ocean-800 (navy dam), do mau pixel truc tiep tren anh demo (vung "THÔNG TIN ĐƠN") xac
          nhan la navy chu khong phai xam nhu truoc, dong bo voi SectionTitle.tsx cung dot sua. */}
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--color-primary)] font-extrabold mb-1.5">{title}</div>
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
      <div className={`font-bold text-base ${tone === "green" ? "text-[var(--color-success)]" : "text-[var(--color-text)]"}`}>{value}</div>
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
          className="focus-ring shrink-0 text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
        >
          {open ? t("▲ Thu gọn") : t("▼ Mở rộng")}
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
        {/* Mobile (2026-09-29, DESIGN_GUIDELINES §8.9 "ô tìm w-full sm:w-64"): nut Bo loc + o tim cung 1 hang,
            o tim gian het phan con lai thay vi rong co dinh 256px roi rot xuong hang rieng. */}
        <div className="flex w-full items-center gap-2 flex-wrap sm:w-auto">
          {/* DOI STYLE (2026-08-24, khop nut ".btn" cua concept 1 "Structured Neutral" - vien mong 1px,
              KHONG shadow, chu semibold 600, hover doi nen sang token surface-100 thay vi mau slate
              cung "roi" khoi bang mau he thong) - CHI doi className, khong doi hanh vi/logic. */}
          <button
            type="button"
            onClick={onToggleFilters}
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm font-semibold text-[var(--ink-600)] hover:bg-[var(--surface-100)]"
          >
            {showFilters ? t("▲ Ẩn bộ lọc") : `☰ ${t("Bộ lọc")}${activeFilterCount > 0 ? ` (${activeFilterCount})` : ""} ▾`}
          </button>
          {activeFilters}
          {onSearchChange && (
            <input
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder ?? t("Tìm kiếm...")}
              className="focus-ring bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-base sm:text-sm min-w-0 flex-1 basis-40 sm:flex-none sm:w-64"
            />
          )}
        </div>
        {trailing}
      </div>
      {showFilters && children && (
        // SUA (phan hoi 2026-09-12: "chuyển tất cả các nút filter lên cùng dòng") - truoc day flex-col
        // xep MOI khoi loc (trang thai/khu vuc/KTV/...) thanh 1 cot doc rieng bat ke con man rong, gio
        // flex-wrap de cac khoi nam CHUNG 1 hang khi du cho, tu xuong dong khi man hep - moi tab van tu
        // quyet dinh so khoi/thu tu qua children, component nay chi doi huong bo cuc.
        <div className="mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-xl p-3 flex flex-wrap items-start gap-3">{children}</div>
      )}
    </>
  );
}

// Doi tu chip/segmented (1 loat nut) sang dropdown thuc su (phan hoi 2026-09-01: "danh sách các nút
// filter quá nhiều, tạo thành filter listdown thay vì hiện 1 loạt button") - 4 tab dung chung
// component nay (DonCuaToiTab/TraHangTab/PhieuXuatKhoTab/ThieuLkTab) deu co 7-10 trang thai, chiem
// nhieu dong khi hien het thanh nut. Tai su dung Select (component san co, tu chuyen sang o tim kiem
// khi > 10 option - PXK dung dung 10 nen van la <select> thuan, khong bi doi hanh vi ngoai y muon).
// `counts` (tuy chon, undefined = dang tai/chua co du lieu) - hien "(N)" canh nhan MOI trang thai,
// ke ca N=0 (khong an option nao, giu du "khong gian trang thai" de nguoi dung tu chon xem trang thai
// dang rong). "Dem TINH" (xac nhan voi nguoi dung 2026-09-01) - server tra ve dung theo scope/loai_don
// cua tab, KHONG cong them cac bo loc PHU khac (nguoi_tao/khu_vuc/ngay/q) dang bat cung luc - xem GET
// /don-hang-status-counts, /phieu-xuat-kho/status-counts, /thieu-lk-status-counts.
export function TrangThaiDropdownFilter({
  value,
  onChange,
  options,
  counts,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  counts?: Record<string, number>;
}) {
  const decorated = options.map((o) => ({
    value: o.value,
    label: counts ? `${o.label} (${counts[o.value] ?? 0})` : o.label,
  }));
  // FIX (phan hoi 2026-09-12, dong bo voi doi flex-col -> flex-wrap o FilterSearchBar/DonCuaToiTab):
  // bo "w-full" - trong hang flex-wrap, width:100% khien <select> nay chiem TRON 1 hang, day moi khoi
  // loc khac xuong dong duoi du con nhieu cho trong. Khong con w-full, <select> tu co rong theo noi
  // dung (hanh vi mac dinh trinh duyet), van gioi han max-width de nhan dai khong tran qua rong.
  return <Select value={value} onChange={onChange} options={decorated} className="max-w-[280px]" />;
}

// Bo loc Khu vuc DA CHON NHIEU (them 2026-08-27, phan hoi "bổ sung filter theo khu vực... GS tự lọc
// mặc định theo khu vực mình được set") - khac TrangThaiChipFilter (chon 1), 1 GS/TN/Kho/Ke toan co
// the phu trach NHIEU Khu vuc cung luc nen can toggle duoc tung khu vuc doc lap. `value` rong (Set
// size 0) = "Tất cả" (khong loc gi, dung y nghia voi cac bo loc khac trong module nay - CHI la bo loc
// UI, KHONG phai gioi han bao mat nhu View - xem GET /khu-vuc-cua-toi backend).
// SUA (phan hoi 2026-09-11: "Bộ lọc Khu vực -> chuyển sang listdown nhiều tùy chọn + 1 tùy chọn tất
// cả") - TRUOC DAY la 1 hang chip rieng biet (moi khu vuc 1 nut tron), voi he thong co hang chuc Khu
// vuc se choan het chieu ngang/xuong nhieu hang. Doi thanh 1 nut trigger + dropdown checkbox (dung lai
// DropdownPortal, cung pattern voi ColumnSettingsButton o ColumnHeader.tsx) - GIU NGUYEN chu ky prop
// (value/onChange/options) de ca 5 noi goi (DonCuaToiTab/PhieuXuatKhoTab/ThieuLkTab/TraHangTab/
// TrangChuTab) khong phai doi gi. Ten export giu nguyen "KhuVucChipFilter" du khong con la "chip" nua,
// tranh doi 5 dong import chi vi doi UI trinh bay.
export function KhuVucChipFilter({
  value,
  onChange,
  options,
}: {
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const dich = e.target as Node;
      if (anchorRef.current?.contains(dich) || contentRef.current?.contains(dich)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle(ma: string) {
    const next = new Set(value);
    if (next.has(ma)) next.delete(ma);
    else next.add(ma);
    onChange(next);
  }

  const selectedLabels = [...value].map((ma) => options.find((o) => o.value === ma)?.label ?? ma);
  // SUA BUG GIAO DIEN (phan hoi 2026-09-12, kem anh chup "KHU VỰC" bi lech dong so voi cac o loc khac
  // cung hang) - truoc day nhan "Khu vực" nam RIENG 1 dong tren, khien khoi nay cao hon cac o loc khac
  // (vd "Còn tồn (2)") trong CUNG 1 hang flex-wrap (xem doi flex-col->flex-wrap o FilterSearchBar), gay
  // lech thang dung. Gop nhan "Khu vực: " VAO THANG nut trigger (giong cach "Còn tồn (2)" tu mo ta
  // trong chinh no) - bo nhan rieng ben ngoai o CA 4 noi goi (DonCuaToiTab/PhieuXuatKhoTab/ThieuLkTab/
  // TraHangTab), gio chi con 1 dong cao bang cac o loc khac.
  const triggerLabel =
    value.size === 0 ? t("Khu vực: Tất cả") : value.size <= 2 ? t("Khu vực: {a}", { a: selectedLabels.join(", ") }) : t("Khu vực ({a})", { a: value.size });

  return (
    <div className="relative inline-block">
      <button
        type="button"
        ref={anchorRef}
        onClick={() => setOpen((v) => !v)}
        className={`focus-ring inline-flex items-center gap-1.5 max-w-[240px] rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
          value.size > 0
            ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white font-semibold"
            : "bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
        }`}
      >
        <span className="truncate">{triggerLabel}</span>
        <span className="shrink-0 text-[10px] opacity-70">▾</span>
      </button>
      <DropdownPortal anchorRef={anchorRef} contentRef={contentRef} open={open} matchWidth={false} minWidth={200} maxHeight={320} className="rounded-xl py-1.5">
        <label className="flex items-center gap-2 px-3 py-1.5 mb-1 border-b border-[var(--line)] text-xs font-semibold text-[var(--ink-700)] hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" checked={value.size === 0} onChange={() => onChange(new Set())} className="w-3.5 h-3.5" />
          {t("Tất cả")}
        </label>
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--ink-700)] hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" checked={value.has(o.value)} onChange={() => toggle(o.value)} className="w-3.5 h-3.5" />
            {o.label}
          </label>
        ))}
      </DropdownPortal>
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
      const upload = await anhVuaGioiHan(nenAnh ? await compressImage(file) : file);
      const bytes = await upload.arrayBuffer();
      const res = await api.postBinary<{ driveFileId: string; url: string; han_muc_anh?: HanMucAnh | null }>("/tra-hang/upload-anh", bytes, upload.type || "image/jpeg");
      onChange([...photos, { driveFileId: res.driveFileId, url: res.url }]);
      canhBaoHanMucAnh(res.han_muc_anh, addToast);
    } catch (err) {
      baoLoiTaiAnh(err, addToast, describeApiError);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {photos.map((p, i) => (
          <span key={p.driveFileId} className="inline-flex items-center gap-1.5 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2 py-1 text-xs">
            <ImageLink url={p.url} className="text-[var(--color-primary)] underline underline-offset-2">
              {t("📷 Ảnh {a}", { a: i + 1 })}
            </ImageLink>
            <button type="button" onClick={() => onChange(photos.filter((_, j) => j !== i))} className="text-[var(--color-danger)] font-bold leading-none" title={t("Xoá ảnh này")}>
              ✕
            </button>
          </span>
        ))}
        {photos.length < max && (
          <label
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border border-dashed cursor-pointer ${
              uploading ? "opacity-50 pointer-events-none" : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            }`}
          >
            {uploading ? t("Đang tải...") : t("+ Thêm ảnh")}
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
      <div className={`text-[11px] mt-1 ${photos.length === 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-faint)]"}`}>{t("{n}/{max} ảnh (bắt buộc tối thiểu 1)", { n: photos.length, max })}</div>
    </div>
  );
}

// Cot "Ma yeu cau su co lien quan" - bam mo modal "Xem chi tiet case" (CaseDetailModal.tsx, qua
// openCase o DatMuaLinhKienModule) khi co canXemChiTietCa VA openCase - tu 2026-08-26 canXemChiTietCa
// LUON true (xem comment o DatMuaLinhKienModule), KHONG con loai KTV/CTV/Tram nhu truoc. Dung chung
// cho bang dong con o DonCuaToiTab va bang dong trong PhieuDatDetailModal.
export function MaYcscCell({ value, canXemChiTietCa, openCase }: { value: string | null; canXemChiTietCa: boolean; openCase?: (id: string, tab?: string) => void }) {
  if (!value?.trim()) return <span className="text-[var(--color-text-faint)]">—</span>;
  if (canXemChiTietCa && openCase) {
    // SUA (phan hoi 2026-08-28: "sửa màu và tô đậm lên để người dùng biết có thể click vào") - truoc
    // day chi doi mau + gach chan luc hover, nhung hover KHONG BAO GIO kich hoat tren cam ung (mobile)
    // nen nhin giong text thuong, khong ai biet bam duoc. Gach chan LUON HIEN (khong doi hover nua) +
    // dam mau/dam chu hon de ro rang la 1 link bam duoc ngay ca tren mobile.
    return (
      <span className="font-mono text-[var(--color-primary)] font-bold underline decoration-[var(--color-primary)]/40 underline-offset-2 cursor-pointer active:opacity-70" onClick={() => openCase(value.trim(), "giai-trinh")}>
        {value}
      </span>
    );
  }
  return <span className="font-mono">{value}</span>;
}

// CHOT 2026-08-15: thay the PhieuDatDetailModal (chi tiet ca "phieu") - khong con khai niem phieu,
// modal gio chi xem/xu ly DUNG 1 dong don hang (goi GET /dat-mua-lk/don-hang/:id). Khong con checkbox/
// bulk-select trong modal (bulk-select van hoat dong o ngoai bang danh sach, xem DonHangGroupedList).
