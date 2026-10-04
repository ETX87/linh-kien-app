import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../components/ui/Btn";
import { FileButton } from "../components/ui/FileButton";
import { Tooltip } from "../components/ui/Tooltip";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { Badge } from "../components/ui/Badge";
import { KvRow } from "../components/ui/KvRow";
import { SectionTitle } from "../components/ui/SectionTitle";
import { Tabs } from "../components/ui/Tabs";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, ApiError } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { fmtVND, fmtDateTime, type LinhKienRow } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { fetchWithHashCache } from "../lib/staticListCache";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";
import { useAuth } from "../auth/AuthContext";
import { formatLkLabel } from "./datMuaLinhKien/helpers";
import { BomHangTab } from "./danhMucLinhKien/BomHangTab";
import { ThayTheTab } from "./danhMucLinhKien/ThayTheTab";
import { ComboTab } from "./danhMucLinhKien/ComboTab";
import { Money } from "../components/ui/Money";
import { timLk, sapTheoDiem } from "../lib/timLinhKien";
import { useBoTimLk, useLichSuLk, diemHayDat } from "../lib/useTimLinhKien";
import { ToDam } from "../components/ui/ToDam";
import { TimLkBox, TuKhoaLkSection, DongNghiaTab } from "./danhMucLinhKien/TimLkBox";
import { TRANG_THAI_MA, TrangThaiMaBadge, XetDuyetMaSection } from "./danhMucLinhKien/XetDuyetMaLk";
import { PhanLoaiNhanh } from "./danhMucLinhKien/PhanLoaiNhanh";

const PAGE_SIZE = 20;
const BOOL_FILTER_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "true", label: "Có" },
  { value: "false", label: "Không" },
];

// Nhap hang loat "anh demo" tu file Excel co san (cot "Mã linh kiện" / "ẢNH DEMO", vd export tu
// AppSheet cu) - CHOT 2026-08-17. Backend tu chia chunk 10 dong/lan (xem settings.ts
// bulk-import-anh) vi moi dong ton 1 fetch anh nguon + 3 goi Google Drive - frontend chi lap goi
// voi offset tra ve den khi done:true, khong can biet truoc kich thuoc chunk.
interface BulkImportRow { ma_linh_kien: string; source_url: string }
interface BulkImportChunkResult {
  done: boolean;
  nextOffset: number;
  success: number;
  notFound: number;
  fetchFailed: number;
  error: number;
  details: { ma_linh_kien: string; status: string }[];
}

async function parseBulkImportFile(file: File): Promise<BulkImportRow[]> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const rows: BulkImportRow[] = [];
  for (const raw of rawRows) {
    const maRaw = raw["Mã linh kiện"] ?? raw["Ma linh kien"] ?? raw["Mã"];
    // Fallback theo tu khoa (phan hoi 2026-08-21: "import có link ảnh, nhưng không hiện trên web" -
    // ten cot ANH thuc te trong file cua nguoi dung khac tat ca bien the liet ke san o day, bi bo
    // qua HOAN TOAN ma khong bao loi gi - xem findColumnByImageKeyword() dinh nghia o duoi).
    const urlRaw = raw["ẢNH DEMO"] ?? raw["ANH DEMO"] ?? findColumnByImageKeyword(raw);
    if (maRaw == null || urlRaw == null) continue;
    // File nguon co dong ma dang "[A039-140]" (bracket) lan ma so thuan (2010020647) - bo bracket
    // neu co de khop dung linh_kien.ma_linh_kien.
    const ma = String(maRaw).trim().replace(/^\[(.*)\]$/, "$1");
    const url = String(urlRaw).trim();
    if (ma && url) rows.push({ ma_linh_kien: ma, source_url: url });
  }
  return rows;
}

// Nhap/cap nhat hang loat CA DONG danh muc tu file Excel (phan hoi 2026-08-20: "thêm danh sách linh
// kiện từ database bảo hành sang" - he goc khong cung schema nen khong export/import D1 truc tiep
// duoc, dung duong file Excel trung lap). Header linh hoat: uu tien khop dung ten cot ma chinh
// exportRowsToExcel() cua module nay xuat ra ("Mã"/"Tên linh kiện"/...) de export-roi-sua-roi-nhap-
// lai hoat dong xuoi, kem vai bien the pho bien tu he khac ("Mã linh kiện"/"Ma linh kien"/"Gia ban").
// ten_linh_kien la TUY CHON (them 2026-09-04, phan hoi "chỉ import Mã + Giá trị công nợ, cột khác giữ
// nguyên") - CHI bat buoc khi ma_linh_kien la ma MOI (backend tu kiem tra, INSERT can NOT NULL); voi
// ma da co san, thieu ten_linh_kien = giu nguyen ten cu (COALESCE o backend, cung 1 pattern voi
// ktv_lien_he/bulk-import). dac_thu/chi_sua_chua cung doi sang boolean|undefined (thay vi luon la
// boolean) de phan biet DUOC "cot khong co trong file" (undefined, giu nguyen) voi "co cot nhung gia
// tri la Khong/0" (false, ghi de).
// CHOT 2026-09-12 (tich hop gia88 lam nguon chinh gia): bo han "gia_ban"/"gia_tham_chieu"/
// "gia_tri_cong_no" khoi import nay - backend khong con nhan 3 truong gia qua duong nay nua (xem
// routes/settingsDatMua.ts POST /linh-kien/bulk-import).
interface BulkImportCatalogRow {
  ma_linh_kien: string; ten_linh_kien?: string;
  don_vi?: string; ghi_chu?: string; dac_thu?: boolean; chi_sua_chua?: boolean; anh_url?: string;
  phan_loai_dac_thu?: string;
}
interface BulkImportCatalogChunkResult {
  success: number; errorCount: number;
  details: { ma_linh_kien: string; status: string }[];
}
const CHUA_PHAN_LOAI = "__CHUA_PHAN_LOAI__";

// Nhan de doc cho ket qua nhap danh muc (status backend POST /settings/linh-kien/bulk-import).
const TRANG_THAI_IMPORT_LK: Record<string, string> = {
  thieu_ma: "thiếu mã",
  ma_moi_thieu_ten: "mã mới thiếu tên",
  ma_moi_thieu_phan_loai: "mã mới thiếu Phân loại (bắt buộc)",
  thanh_cong_loi_anh: "đã lưu, lỗi tải ảnh",
  loi_ghi_db: "lỗi ghi dữ liệu",
};
function pickField(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (raw[k] != null && raw[k] !== "") return raw[k];
  return null;
}
// Fallback do TIM THEO TU KHOA (khong doi hoi khop CHINH XAC ten cot) - phan hoi 2026-08-21: "import
// có link ảnh nhưng không hiện" hoa ra la vi cot anh trong file that cua nguoi dung ten khac tat ca
// cac bien the da liet ke san trong pickField (vd "Link ảnh"/"Hình ảnh"/"Ảnh minh họa" dau khac,
// "Image URL"...) nen bi bo qua HOAN TOAN ma KHONG BAO LOI GI (dung y thiet ke cu: cot anh la tuy
// chon, thieu thi coi nhu khong co - nhung "ten cot khac ky vong" lai bi hieu nham thanh "khong co").
// Chuan hoa bo dau + chi khop TU NGUYEN VEN (\b, tranh "Thành tiền" -> "thanh" bi nham khop "anh")
// truoc khi thu cac tu khoa lien quan toi anh - dung LAM PHUONG AN CUOI, sau khi cac ten cot liet ke
// san trong pickField() da khong khop.
function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d");
}
function findColumnByImageKeyword(raw: Record<string, unknown>): unknown {
  for (const key of Object.keys(raw)) {
    if (raw[key] == null || raw[key] === "") continue;
    const norm = stripDiacritics(key).toLowerCase();
    const words = norm.split(/[^a-z0-9]+/);
    if (words.includes("anh") || words.includes("hinh") || norm.includes("image") || norm.includes("photo") || norm.includes("picture")) {
      return raw[key];
    }
  }
  return null;
}
function toBoolField(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "có" || s === "co" || s === "x" || s === "yes";
}
function toBoolFieldOptional(v: unknown): boolean | undefined {
  return v == null ? undefined : toBoolField(v);
}
async function parseCatalogImportFile(file: File): Promise<BulkImportCatalogRow[]> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const rows: BulkImportCatalogRow[] = [];
  for (const raw of rawRows) {
    const maRaw = pickField(raw, ["Mã", "Mã linh kiện", "Ma linh kien", "ma_linh_kien"]);
    if (maRaw == null) continue;
    const ma = String(maRaw).trim().replace(/^\[(.*)\]$/, "$1");
    if (!ma) continue;
    const tenRaw = pickField(raw, ["Tên linh kiện", "Ten linh kien", "ten_linh_kien"]);
    rows.push({
      ma_linh_kien: ma,
      ten_linh_kien: tenRaw != null ? String(tenRaw).trim() : undefined,
      don_vi: pickField(raw, ["Phân loại", "Phan loai", "Đơn vị", "Don vi", "don_vi"]) != null ? String(pickField(raw, ["Phân loại", "Phan loai", "Đơn vị", "Don vi", "don_vi"])).trim() : undefined,
      ghi_chu: pickField(raw, ["Ghi chú", "Ghi chu", "ghi_chu"]) != null ? String(pickField(raw, ["Ghi chú", "Ghi chu", "ghi_chu"])).trim() : undefined,
      dac_thu: toBoolFieldOptional(pickField(raw, ["Đặc thù", "Dac thu", "dac_thu"])),
      chi_sua_chua: toBoolFieldOptional(pickField(raw, ["Only sửa chữa", "Chỉ sửa chữa", "chi_sua_chua"])),
      phan_loai_dac_thu: pickField(raw, ["Phân loại đặc thù", "Phan loai dac thu", "phan_loai_dac_thu"]) != null
        ? String(pickField(raw, ["Phân loại đặc thù", "Phan loai dac thu", "phan_loai_dac_thu"])).trim()
        : undefined,
      anh_url: (() => {
        const v = pickField(raw, ["Ảnh", "ẢNH DEMO", "Anh demo", "Ảnh minh hoạ", "anh_url", "anh_demo"]) ?? findColumnByImageKeyword(raw);
        return v != null ? String(v).trim() : undefined;
      })(),
    });
  }
  return rows;
}

// File mau cho 2 modal "Nhap hang loat" phia duoi - truoc day khong co, nguoi dung phai tu doan ten
// cot dung dinh dang tu tooltip.
async function downloadAnhImportTemplate() {
  await exportRowsToExcel(
    [{ "Mã linh kiện": "LK001", "ẢNH DEMO": "https://drive.google.com/file/d/vidu/view" }],
    "mau_import_anh_linh_kien.xlsx",
    "Data",
  );
}
async function downloadCatalogImportTemplate() {
  await exportRowsToExcel(
    [
      {
        "Mã": "LK001", "Tên linh kiện": "Bo nguon 65W",
        "Phân loại": "Nguồn/Sạc", "Ghi chú": "", "Đặc thù": "", "Phân loại đặc thù": "",
        "Only sửa chữa": "", "Ảnh": "",
      },
    ],
    "mau_import_danh_muc_linh_kien.xlsx",
    "Data",
  );
}

function IconImageOff({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="M21 15l-5-5-4 4-3-3-6 6" />
    </svg>
  );
}

function IconZoom({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
    </svg>
  );
}

// Anh minh hoa - <img> nhung truc tiep tu Google Drive (link cong khai "anyone with link", xem
// backend/src/lib/googleDrive.ts uploadPublicImage()) - 3 trang thai ro rang (dang tai/da tai/loi)
// thay vi chi co onError nhu ban truoc: skeleton nhap nhay trong luc cho, fade-in khi xong, roi ve
// placeholder gon gang khi loi - KHONG BAO GIO chan luong lam viec chinh (danh sach/sua) du anh
// cham hay hong. Bam vao thumbnail mo PartDetailDrawer (xem duoi) thay vi mo tab moi.
// "active" (hang muc #14, 2026-08-25): linh kien dang BAT -> anh noi len (shadow + vien ro); TAT ->
// anh chim xuong + mo di (opacity + grayscale). undefined = khong ap dung (giu nguyen, dung o cho
// khong lien quan trang thai bat_tat, vd anh trong form them/sua).
function AnhThumbnail({
  url, cacheBust, size = 40, onClick, active,
}: {
  url: string | null; cacheBust?: number; size?: number; onClick?: () => void; active?: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => setStatus("loading"), [url]);
  const stateClass = active === false ? "opacity-50 grayscale" : active === true ? "shadow-md" : "";

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-dashed border-[var(--line)] text-[var(--ink-400)] ${stateClass}`}
        style={{ width: size, height: size }}
      >
        <IconImageOff className="w-4 h-4" />
      </div>
    );
  }

  const src = cacheBust ? `${url}${url.includes("?") ? "&" : "?"}cb=${cacheBust}` : url;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative block rounded-lg border border-[var(--line)] overflow-hidden shrink-0 focus-ring transition-all ${stateClass}`}
      style={{ width: size, height: size }}
      title="Xem chi tiết"
    >
      {status === "loading" && <div className="img-skeleton absolute inset-0 bg-[var(--surface-200)]" />}
      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-100)] text-[var(--ink-400)]">
          <IconImageOff className="w-4 h-4" />
        </div>
      ) : (
        <img
          src={src}
          loading="lazy"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`w-full h-full object-cover transition-opacity duration-300 ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </button>
  );
}

// Xem anh phong to toan man hinh - lop tren ca Modal (z-[60] > 50) vi PartDetailDrawer co the dang
// mo cung luc. object-contain (khac object-cover cua thumbnail) de KHONG cat mat anh du ty le nao.
function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
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
      <img src={url} alt="Ảnh linh kiện phóng to" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-5 text-xs text-white/70 hover:text-white hover:underline"
      >
        Mở ảnh gốc trên Google Drive ↗
      </a>
    </div>
  );
}

// Anh lon trong drawer xem chi tiet - khung ty le co dinh (4:3) nen bo cuc khong "nhay" khi doi
// giua cac linh kien co/khong co anh; object-contain de khong cat mat, nen trung tinh lam noi bat
// anh san pham thuc te. Bam vao anh (khi da tai xong) mo ImageLightbox phong to.
function PartHeroImage({ url, alt, onZoom }: { url: string | null; alt: string; onZoom: () => void }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(url ? "loading" : "error");
  useEffect(() => setStatus(url ? "loading" : "error"), [url]);

  return (
    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-[var(--line)] bg-[var(--surface-100)]">
      {status === "loading" && <div className="img-skeleton absolute inset-0 bg-[var(--surface-200)]" />}
      {url && status !== "error" && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          onClick={() => status === "loaded" && onZoom()}
          className={`w-full h-full object-contain transition-opacity duration-300 ${status === "loaded" ? "opacity-100 cursor-zoom-in" : "opacity-0"}`}
        />
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[var(--ink-400)]">
          <IconImageOff className="w-7 h-7" />
          <span className="text-xs font-medium">{url ? "Không tải được ảnh" : "Chưa có ảnh minh hoạ"}</span>
        </div>
      )}
      {status === "loaded" && (
        <div className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center pointer-events-none">
          <IconZoom className="w-3.5 h-3.5" />
        </div>
      )}
    </div>
  );
}

// Drawer truot tu phai - man hinh "XEM" chi tiet 1 linh kien, tach rieng voi Modal "SUA" (form) o
// duoi: xem la thao tac tra cuu nhanh (bam vao dong/thumbnail trong bang), khong nen dung chung
// giao dien voi form chinh sua de tranh nguoi dung tuong nham co the sua ngay tai day.
function PartDetailDrawer({
  part, onClose, onEdit, canEdit, chiGiaNiemYet, parts, canXetDuyet, onDoiMa,
}: { part: LinhKienRow | null; onClose: () => void; onEdit: () => void; canEdit: boolean; chiGiaNiemYet: boolean; parts: LinhKienRow[]; canXetDuyet: boolean; onDoiMa: (ma: string) => void }) {
  const personDir = usePersonDirectory();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  useEffect(() => setLightboxOpen(false), [part?.ma_linh_kien]);
  useEffect(() => {
    if (!part) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !lightboxOpen) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [part, lightboxOpen, onClose]);

  if (!part) return null;

  // Cac gia + thong tin phu (them 2026-09-12, tich hop gia88) - TAT CA la "chi xem", dong bo tu doi
  // tac moi dem, xem CLAUDE.md/lib/gia88Sync.ts. gia_tham_chieu XOA HAN, thay bang gia_ban ("Gia NY").
  const specs: { label: string; value: ReactNode }[] = [
    // Them 2026-09-12 (phan hoi "bổ sung hiện mã linh kiện") - tieu de dau drawer dung formatLkLabel()
    // NEN co the AN mã neu ten_linh_kien da tu chua san (tranh lap, xem comment o <h3> ben duoi), luon
    // hien rieng 1 dong "Mã linh kiện" o day de tra cuu/copy nhanh du ten co chua ma hay khong.
    { label: "Mã linh kiện", value: <span className="font-mono font-semibold text-[var(--ocean-700)]">{part.ma_linh_kien}</span> },
    { label: "Giá NY", value: <span className="font-mono font-semibold text-[var(--green-700)]"><Money>{fmtVND(part.gia_ban)}</Money></span> },
    ...(chiGiaNiemYet ? [] : [
      { label: "Giá KTV", value: <span className="font-mono font-semibold text-[var(--green-700)]"><Money>{fmtVND(part.gia_tri_cong_no)}</Money></span> },
      { label: "Giá dự phòng", value: <span className="font-mono text-[var(--ink-600)]"><Money>{fmtVND(part.gia_du_phong)}</Money></span> },
      { label: "Giá EU", value: <span className="font-mono text-[var(--ink-600)]"><Money>{fmtVND(part.gia_eu)}</Money></span> },
    ]),
    { label: "Phân loại", value: part.don_vi?.trim() || "⚠ Chưa phân loại — cần bổ sung" },
    ...(part.nhan_hang?.trim() ? [{ label: "Nhãn hàng", value: part.nhan_hang.trim() }] : []),
    ...(part.thiet_bi?.trim() ? [{ label: "Thiết bị", value: part.thiet_bi.trim() }] : []),
    ...(part.don_vi_nhap?.trim() ? [{ label: "Đơn vị nhập", value: part.don_vi_nhap.trim() }] : []),
    ...(part.ghi_chu_doi_tac?.trim() ? [{ label: "Ghi chú đối tác", value: part.ghi_chu_doi_tac.trim() }] : []),
    ...(part.dac_thu ? [{ label: "Phân loại đặc thù", value: part.phan_loai_dac_thu?.trim() || "—" }] : []),
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px]" onClick={onClose} />
      <div className="drawer-in fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[var(--surface)] shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--line)] shrink-0">
          {/* SUA BUG GIAO DIEN (phan hoi 2026-09-12, dong bo voi LinhKienPicker.tsx trong module "Dat
              mua linh kien" - cung 1 danh muc linh_kien): truoc day hien rieng ma_linh_kien o dong
              tren, gay lap 2 lan voi nhung ten_linh_kien DA TU chua san ma trong chuoi (vd "...
              [2014010043]") - doi sang formatLkLabel() dung chung, ma chi con xuat hien 1 LAN. */}
          <div className="min-w-0">
            <h3 className="font-display font-bold text-lg text-[var(--ocean-800)] leading-snug truncate">{formatLkLabel(part.ma_linh_kien, part.ten_linh_kien)}</h3>
          </div>
          <button onClick={onClose} className="focus-ring shrink-0 w-8 h-8 rounded-lg hover:bg-slate-100 text-[var(--ink-400)]">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5 flex-1">
          <PartHeroImage url={part.anh_demo} alt={part.ten_linh_kien} onZoom={() => setLightboxOpen(true)} />

          <div className="flex flex-wrap gap-1.5">
            {part.trang_thai_ma && part.trang_thai_ma !== "Da xac nhan" && <TrangThaiMaBadge tt={part.trang_thai_ma} />}
            {!!part.bat_tat === false && <Badge tone="gray">Đang ẩn</Badge>}
            {!!part.cam_ban && <Badge tone="coral">Cấm bán (đối tác)</Badge>}
            {!!part.dac_thu && (
              <Badge tone="amber">
                Đặc thù{part.phan_loai_dac_thu?.trim() ? `: ${part.phan_loai_dac_thu.trim()}` : ""} — cần TP DVBH xác nhận
              </Badge>
            )}
            {!!part.chi_sua_chua && <Badge tone="coral">Only sửa chữa</Badge>}
            {!part.dac_thu && !part.chi_sua_chua && !!part.bat_tat && <Badge tone="teal">Đang hiển thị bình thường</Badge>}
          </div>

          <div>
            <SectionTitle>Thông tin</SectionTitle>
            {specs.map((s) => (
              <KvRow key={s.label} label={s.label}>
                {s.value}
              </KvRow>
            ))}
          </div>

          <XetDuyetMaSection part={part} parts={parts} canXetDuyet={canXetDuyet} onDoiMa={onDoiMa} />

          <TuKhoaLkSection ma={part.ma_linh_kien} canSua={canEdit || canXetDuyet} />

          <div>
            <SectionTitle>Ghi chú</SectionTitle>
            <div className="text-sm text-[var(--ink-700)] whitespace-pre-wrap rounded-xl bg-[var(--surface-100)] px-3.5 py-2.5 min-h-[2.5rem]">
              {part.ghi_chu?.trim() || <span className="text-[var(--ink-400)]">Không có ghi chú.</span>}
            </div>
          </div>

          <div className="text-xs text-[var(--ink-400)] pt-1">
            Cập nhật lần cuối bởi <span className="font-medium text-[var(--ink-500)]">{part.nguoi_cap_nhat ? formatPersonDisplay(part.nguoi_cap_nhat, personDir) : "—"}</span> lúc {fmtDateTime(part.ngay_cap_nhat)}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-[var(--line)] shrink-0">
          <Btn variant="ghost" onClick={onClose}>
            Đóng
          </Btn>
          {canEdit && <Btn onClick={onEdit}>Sửa thông tin</Btn>}
        </div>
      </div>
      {lightboxOpen && part.anh_demo && <ImageLightbox url={part.anh_demo} onClose={() => setLightboxOpen(false)} />}
    </>
  );
}

const TABS = [
  { key: "danh-muc", label: "Danh mục" },
  { key: "bom-hang", label: "BOM" },
  { key: "thay-the", label: "Linh kiện thay thế" },
  { key: "combo", label: "Combo" },
  { key: "tu-khoa", label: "Từ khóa tìm kiếm" },
];

// Tach ra khoi SettingsModule.tsx (truoc la 1 tab trong trang Settings Admin-only) thanh module
// rieng tren sidebar - CHOT 2026-08-17: nguoi co quan_ly_danh_muc_lk (hoac Admin) can vao thang,
// khong phai qua trang Settings. Truoc day co 2 section trung lap (1 cho "giai trinh thieu linh
// kien", 1 cho "dat mua linh kien") cung doc/ghi 1 bang linh_kien - gop lai con 1 o day.
// Them 2 tab "Tra cuu Bang ke vat tu (BOM)"/"Linh kien thay the" (yeu cau nguoi dung 2026-08-27) -
// doc du lieu TRUC TIEP tu Google Sheet cong khai qua lib/publicSheetCache.ts, KHONG di qua backend
// cua he thong (xem comment dau file do). Dat CHUNG module nay (theo xac nhan nguoi dung: "ghep chung
// voi co duoc gan") thay vi tach menu rieng mo cho moi nguoi - nghia la pham vi truy cap 2 tab moi
// VAN theo dung co xem_danh_muc_lk/quan_ly_danh_muc_lk hien co cua module "Bang Gia", KHONG mo rong
// cho MOI tai khoan dang nhap nhu de xuat ban dau.
export function DanhMucLinhKienModule() {
  const [tab, setTab] = useState("danh-muc");
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  // Sua tu khoa / dong nghia = cung nhom sua combo (backend lkSettings quanLyCombo).
  const canSuaTuKhoa = !!u && (!!u.quan_ly_danh_muc_lk || !!u.la_mua_hang || u.vai_tro === "Admin");
  return (
    <div className="anim-in">
      <Tabs active={tab} onChange={setTab} tabs={TABS} />
      {tab === "danh-muc" && <DanhMucTab />}
      {tab === "bom-hang" && <BomHangTab />}
      {tab === "thay-the" && <ThayTheTab />}
      {tab === "combo" && <ComboTab />}
      {tab === "tu-khoa" && <DongNghiaTab canSua={canSuaTuKhoa} />}
    </div>
  );
}

function DanhMucTab() {
  const addToast = useToast();
  const qc = useQueryClient();
  // FIX (ma tran kiem soat he thong, Van de #3 sheet "5. Van de phat hien", xac nhan 2026-08-24): file
  // nay truoc day khong doc useAuth nen moi nut ghi (Them/Sua/Nhap hang loat/bat-tat) hien KHONG DIEU
  // KIEN cho MOI nguoi vao duoc module - backend (requireQuanLyDanhMucLk) van chan dung (403) nhung
  // trai UX "bam thi bao loi". An han cac nut ghi neu khong co co quan_ly_danh_muc_lk/khong phai Admin
  // - KHONG doi backend (da dung san). "Xuất Excel" KHONG gate (chi doc/export du lieu da tai o may
  // client, khong goi endpoint ghi nao ca).
  const auth = useAuth();
  const authUser = auth.status === "authenticated" ? auth.user : null;
  const canWrite = !!authUser?.quan_ly_danh_muc_lk || authUser?.vai_tro === "Admin";
  // "Mua hang" (2026-09-30, migration 0053): xet duyet ma LK moi + sua thong tin LK (khong them/nhap hang loat) - khop
  // backend settingsDatMua.ts muaHangRoles/suaLinhKienRoles.
  const canXetDuyet = !!authUser?.la_mua_hang || authUser?.vai_tro === "Admin";
  const canSua = canWrite || canXetDuyet;
  // Cong tac "Đặc thù" nhanh (2026-10-02) - them TN + Ke toan, khop backend PATCH /settings/linh-kien/:ma/dac-thu.
  const canDacThu = canSua || !!authUser?.la_tac_nghiep || !!authUser?.la_ke_toan;
  // "Đồng bộ Gia88" thủ công (them 2026-09-12, phan hoi "thêm nút đồng bộ thủ công cho admin trong
  // danh mục linh kiện") - GATE RIENG theo Admin (khac canWrite o tren dung quan_ly_danh_muc_lk) vi
  // backend routes/gia88Sync.ts CHI cho Admin (requireRole("Admin"), khong nhan quan_ly_danh_muc_lk) -
  // an nut voi nguoi khong phai Admin de tranh "bam thi bao loi" (cung tinh than voi canWrite o tren).
  const isAdmin = authUser?.vai_tro === "Admin";
  // Chot 2026-09-30 ("trong bảng giá: chỉ hiện giá niêm yết cho ktv, ẩn các giá còn lại"): KTV/Ve tinh
  // (khong quan ly danh muc) chi thay "Giá NY" - an Giá KTV/dự phòng/EU o bang + drawer chi tiet. Cung
  // dieu kien voi nut Xuat Excel ben duoi. CHI an o Bang gia - man tao don (LinhKienPicker, canh bao
  // cong no) van dung gia_tri_cong_no nen API khong cat truong nay.
  const chiGiaNiemYet = !!(authUser?.la_ktv_dvbh || authUser?.la_ve_tinh) && !canWrite;
  const personDir = usePersonDirectory();
  // Them (ra soat UI 2026-08-27, hang muc #5): cot "Lượt dùng 30 ngày" - tai dung DU LIEU DA CO SAN
  // (GET /dat-mua-lk/xep-hang-linh-kien, tinh 1 lan/ngay o backend, dang dung cho goi y trong
  // LinhKienPicker luc tao don) de Admin quan ly danh muc biet linh kiện nao dang "hot" ma khong can
  // query moi. `retry: false` + bo qua loi (KHONG throwOnError) - endpoint nam duoi requireDatMuaLkArea
  // nen 1 tai khoan CHI co quyen xem_danh_muc_lk (khong co co nghiep vu nao) co the bi 403; man Bang
  // Gia van phai hien thi binh thuong, chi rieng cot nay am tham rong.
  const { data: xepHangData } = useQuery({
    queryKey: ["dat-mua-lk-xep-hang-linh-kien"],
    queryFn: () => api.get<{ rows: { ma_lk: string; so_lan: number }[] }>("/dat-mua-lk/xep-hang-linh-kien"),
    retry: false,
  });
  const luotDungByMa = useMemo(() => new Map((xepHangData?.rows ?? []).map((r) => [r.ma_lk, r.so_lan])), [xepHangData]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [filterDacThu, setFilterDacThu] = useState("");
  const [filterChiSuaChua, setFilterChiSuaChua] = useState("");
  const [filterBatTat, setFilterBatTat] = useState("");
  // "Cấm bán" (them 2026-09-12, tich hop gia88) - loc rieng, cung kieu voi filterBatTat.
  const [filterCamBan, setFilterCamBan] = useState("");
  // "Trạng thái mã" (xet duyet ma chuan, migration 0053). Mac dinh "" = an dong chuyen huong "Da doi ma"; Mua hang/Admin
  // mo Bang gia khi co LK cho duyet -> mac dinh loc "Cho xet duyet" (khop so dem tren Sidebar).
  const [filterTrangThaiMa, setFilterTrangThaiMa] = useState("");
  // Loc Phan loai (2026-09-30): "" tat ca, CHUA_PHAN_LOAI = LK chua co phan loai (ma moi dong bo gia88), con lai = dung gia tri.
  const [filterPhanLoai, setFilterPhanLoai] = useState("");
  // SUA (phan hoi 2026-08-20: "giao diện tạo mới đang khác giao diện chỉnh sửa, chuyển về chung 1
  // giao diện chuẩn (có thêm ảnh)") - gop addOpen/editOpen thanh 1 formMode duy nhat, dung chung 1
  // Modal ben duoi cho ca 2 che do (khac KtvTab.editing van dung union type row|"new"|null vi can
  // giu du lieu goc de so sanh - o day khong can, chi can biet dang o che do nao).
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingMa, setEditingMa] = useState<string | null>(null);
  const [viewingMa, setViewingMa] = useState<string | null>(null);
  const [uploadingAnh, setUploadingAnh] = useState(false);
  const [imgCacheBust, setImgCacheBust] = useState(0);
  // Anh "tam giu" luc dang o che do THEM MOI - chua co ma_linh_kien that (dong chua duoc tao trong
  // DB) nen chua the goi API upload (POST /linh-kien/:ma/anh doi hoi dong da ton tai) - giu File tho
  // trong state, chi thuc su upload SAU KHI addMutation tao dong thanh cong (xem addMutation.onSuccess).
  const [stagedImageFile, setStagedImageFile] = useState<File | null>(null);
  const [stagedImagePreview, setStagedImagePreview] = useState<string | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportRunning, setBulkImportRunning] = useState(false);
  const [bulkImportTotal, setBulkImportTotal] = useState(0);
  const [bulkImportProcessed, setBulkImportProcessed] = useState(0);
  const [bulkImportSummary, setBulkImportSummary] = useState<{ success: number; notFound: number; fetchFailed: number; error: number } | null>(null);
  const [bulkImportFailDetails, setBulkImportFailDetails] = useState<{ ma_linh_kien: string; status: string }[]>([]);
  const [catalogImportOpen, setCatalogImportOpen] = useState(false);
  const [catalogImportRunning, setCatalogImportRunning] = useState(false);
  const [catalogImportTotal, setCatalogImportTotal] = useState(0);
  const [catalogImportProcessed, setCatalogImportProcessed] = useState(0);
  const [catalogImportSummary, setCatalogImportSummary] = useState<{ success: number; errorCount: number; anhLoi: number; coAnh: number } | null>(null);
  const [catalogImportFailDetails, setCatalogImportFailDetails] = useState<{ ma_linh_kien: string; status: string }[]>([]);
  const [form, setForm] = useState({
    ma_linh_kien: "", ten_linh_kien: "", gia_ban: "", don_vi: "", ghi_chu: "", dac_thu: false, chi_sua_chua: false, phan_loai_dac_thu: "",
  });

  const { data: parts } = useQuery({
    queryKey: ["settings-linh-kien"],
    queryFn: () => fetchWithHashCache<{ rows: LinhKienRow[] }>("settings-linh-kien", "/settings/linh-kien/version", "/settings/linh-kien"),
  });

  // Bo tim tren may (2026-10-04, lib/timLinhKien.ts - CUNG bo voi o chon LK luc tao don): tach tu khoa roi rac, khong dau,
  // bo qua gach noi trong ma, tu dong nghia/tu khoa phu, go sai 1 ky tu. Danh muc + tu khoa da cache tren may - go tim KHONG
  // goi server. useDeferredValue: go phim muot, loc 6000 dong chay sau.
  const lichSu = useLichSuLk();
  const rowsTim = useMemo(() => (parts?.rows ?? []).map((p) => ({ ma: p.ma_linh_kien, ten: p.ten_linh_kien })), [parts?.rows]);
  const boTim = useBoTimLk(rowsTim);
  const searchHoan = useDeferredValue(search);
  const kqTim = useMemo(() => timLk(boTim, searchHoan), [boTim, searchHoan]);
  // Hang dat 30 ngay toan he thong (ma -> hang 1..n) - cung nguon cot "Lượt dùng 30 ngày".
  const hangCongTy = useMemo(() => new Map((xepHangData?.rows ?? []).map((r, i) => [r.ma_lk, i + 1])), [xepHangData]);
  // LK CHUA phan loai (gia88 dong bo ma moi khong co "Phân loại") - canh bao cho moi nguoi (chot 2026-09-30).
  const soChuaPhanLoai = useMemo(
    () => (parts?.rows ?? []).filter((p) => p.trang_thai_ma !== "Da doi ma" && !p.don_vi?.trim()).length,
    [parts?.rows],
  );
  const soChoXetDuyet = useMemo(() => (parts?.rows ?? []).filter((p) => p.trang_thai_ma === "Cho xet duyet").length, [parts?.rows]);
  // Mua hang/Admin mo Bang gia luc con LK cho duyet -> loc san "Cho xet duyet" (1 lan, nguoi dung doi lai thoai mai).
  const daLocMacDinh = useRef(false);
  useEffect(() => {
    if (daLocMacDinh.current || !parts) return;
    daLocMacDinh.current = true;
    if (canXetDuyet && soChoXetDuyet > 0) setFilterTrangThaiMa("Cho xet duyet");
  }, [parts, canXetDuyet, soChoXetDuyet]);
  const filteredRows = useMemo(() => {
    let rows = parts?.rows ?? [];
    // "Hay mua" len dau (2026-10-04): co tu khoa -> do sat + uu tien hay dat; o trong -> chinh minh hay chon (lich su tren
    // may) roi hang dat 30 ngay toan he thong, con lai giu thu tu cu.
    const uuTien = (ma: string) => diemHayDat(ma, lichSu.soLanChon, hangCongTy);
    if (kqTim.diem) rows = sapTheoDiem(rows, (p) => p.ma_linh_kien, kqTim.diem, uuTien);
    else rows = rows.map((p, i) => ({ p, i, v: uuTien(p.ma_linh_kien) })).sort((x, y) => y.v - x.v || x.i - y.i).map((x) => x.p);
    if (filterDacThu) rows = rows.filter((p) => (filterDacThu === "true" ? !!p.dac_thu : !p.dac_thu));
    if (filterChiSuaChua) rows = rows.filter((p) => (filterChiSuaChua === "true" ? !!p.chi_sua_chua : !p.chi_sua_chua));
    if (filterBatTat) rows = rows.filter((p) => (filterBatTat === "true" ? !!p.bat_tat : !p.bat_tat));
    if (filterCamBan) rows = rows.filter((p) => (filterCamBan === "true" ? !!p.cam_ban : !p.cam_ban));
    if (filterPhanLoai) rows = rows.filter((p) => (filterPhanLoai === CHUA_PHAN_LOAI ? !p.don_vi?.trim() : p.don_vi === filterPhanLoai));
    rows = filterTrangThaiMa ? rows.filter((p) => (p.trang_thai_ma ?? "Da xac nhan") === filterTrangThaiMa) : rows.filter((p) => p.trang_thai_ma !== "Da doi ma");
    return rows;
  }, [parts?.rows, kqTim, lichSu.soLanChon, hangCongTy, filterDacThu, filterChiSuaChua, filterBatTat, filterCamBan, filterTrangThaiMa, filterPhanLoai]);

  // "Phân loại" (doi ten tu "Đơn vị", phan hoi 2026-08-20) dang listdown NHUNG van cho go gia tri
  // moi (chon "tu dong gom tu du lieu hien co", khong phai danh sach co dinh quan ly rieng) - gop
  // TAT CA gia tri khac rong dang co san trong danh muc lam goi y qua <datalist>, khong can bang
  // settings/API rieng. Cot DB van ten "don_vi" (khong doi schema) - chi doi NHAN hien thi.
  const phanLoaiOptions = useMemo(() => Array.from(new Set((parts?.rows ?? []).map((p) => p.don_vi).filter((v): v is string => !!v?.trim()))).sort(), [parts?.rows]);
  // "Phân loại đặc thù" (them 2026-08-25) - CUNG kieu listdown tu do nhu phanLoaiOptions o tren, chi
  // goi y tu cac gia tri da tung nhap, khong phai danh sach co dinh quan ly rieng qua Settings.
  const phanLoaiDacThuOptions = useMemo(
    () => Array.from(new Set((parts?.rows ?? []).map((p) => p.phan_loai_dac_thu).filter((v): v is string => !!v?.trim()))).sort(),
    [parts?.rows],
  );

  const editingRow = editingMa ? parts?.rows.find((p) => p.ma_linh_kien === editingMa) ?? null : null;
  const viewingRow = viewingMa ? parts?.rows.find((p) => p.ma_linh_kien === viewingMa) ?? null : null;

  function openAdd() {
    setForm({ ma_linh_kien: "", ten_linh_kien: "", gia_ban: "", don_vi: "", ghi_chu: "", dac_thu: false, chi_sua_chua: false, phan_loai_dac_thu: "" });
    setStagedImageFile(null);
    setStagedImagePreview(null);
    setFormMode("add");
  }

  function openEdit(p: LinhKienRow) {
    setViewingMa(null);
    setEditingMa(p.ma_linh_kien);
    setImgCacheBust(0);
    setStagedImageFile(null);
    setStagedImagePreview(null);
    setForm({
      // ten_linh_kien/gia_ban chi con dung de HIEN THI tinh trong form Sua (chi xem, dong bo tu
      // gia88) - khong gui len khi Luu (xem editMutation ben duoi).
      ma_linh_kien: p.ma_linh_kien,
      ten_linh_kien: p.ten_linh_kien,
      gia_ban: p.gia_ban?.toString() ?? "",
      don_vi: p.don_vi ?? "",
      ghi_chu: p.ghi_chu ?? "",
      dac_thu: !!p.dac_thu,
      chi_sua_chua: !!p.chi_sua_chua,
      phan_loai_dac_thu: p.phan_loai_dac_thu ?? "",
    });
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode(null);
    setEditingMa(null);
    if (stagedImagePreview) URL.revokeObjectURL(stagedImagePreview);
    setStagedImageFile(null);
    setStagedImagePreview(null);
  }

  function onPickStagedImage(file: File) {
    if (stagedImagePreview) URL.revokeObjectURL(stagedImagePreview);
    setStagedImageFile(file);
    setStagedImagePreview(URL.createObjectURL(file));
  }

  const toggleDacThu = useMutation({
    mutationFn: ({ ma, dac_thu }: { ma: string; dac_thu: boolean }) => api.patch(`/settings/linh-kien/${encodeURIComponent(ma)}/dac-thu`, { dac_thu }),
    onSuccess: (_r, v) => {
      addToast(`${v.ma}: ${v.dac_thu ? "đã bật" : "đã tắt"} linh kiện đặc thù`);
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
    onError: () => addToast("Không thể cập nhật linh kiện đặc thù."),
  });
  const togglePart = useMutation({
    mutationFn: ({ ma, bat_tat }: { ma: string; bat_tat: boolean }) => api.patch(`/settings/linh-kien/${ma}`, { bat_tat }),
    onSuccess: () => {
      addToast("Đã cập nhật danh mục linh kiện");
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
  });

  // "Đồng bộ Gia88" thủ công - CUNG queryKey ["gia88-sync-status"] voi tab "Đồng bộ Gia88" trong
  // SettingsModule.tsx (React Query tu dung chung cache, khong goi API 2 lan) de nut o day + tab kia
  // luon nhat quan trang thai, khong can them state rieng.
  const { data: gia88Status } = useQuery({
    queryKey: ["gia88-sync-status"],
    queryFn: () => api.get<{ last_run_at: string | null; last_status: string | null; changed_count: number; last_error: string | null }>("/gia88-sync"),
    enabled: isAdmin,
  });
  const runGia88Sync = useMutation({
    mutationFn: () =>
      api.post<{ last_run_at: string | null; last_status: string | null; changed_count: number; last_error: string | null }>("/gia88-sync/run", {}),
    onSuccess: (res) => {
      if (res.last_status === "error") addToast(`Đồng bộ Gia88 lỗi: ${res.last_error}`);
      else addToast(`Đã đồng bộ Gia88 xong, ${res.changed_count} dòng thay đổi`);
      qc.invalidateQueries({ queryKey: ["gia88-sync-status"] });
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
    onError: (err) => addToast("Không thể đồng bộ Gia88: " + (err instanceof Error ? err.message : String(err))),
  });

  // "Giá trị công nợ" = "Giá KTV" - CHOT 2026-09-12 (tich hop gia88): chuyen "chi xem", khong con sua
  // tay qua inline-edit trong bang nua (dong bo tu doi tac moi dem, xem lib/gia88Sync.ts). Route PATCH
  // .../gia-tri-cong-no o backend van con (khong ai goi tu UI nua) - xem comment tai do.

  // Upload anh dung 1 ma cu the - tach rieng khoi handleUploadAnh() ben duoi (truoc chi dung
  // editingMa co san trong closure) de dung lai duoc cho CA 2 luong: sua (ma da co san tu truoc) VA
  // them moi (ma vua duoc tao xong, chi biet duoc SAU KHI addMutation thanh cong - xem duoi).
  async function uploadAnhForMa(ma: string, file: File) {
    setUploadingAnh(true);
    try {
      const bytes = await file.arrayBuffer();
      await api.postBinary(`/settings/linh-kien/${ma}/anh`, bytes, file.type || "image/jpeg");
      setImgCacheBust((n) => n + 1);
    } catch (err) {
      addToast("Đã lưu linh kiện nhưng lỗi tải ảnh: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploadingAnh(false);
    }
  }

  const addMutation = useMutation({
    mutationFn: () =>
      api.post("/settings/linh-kien", {
        ma_linh_kien: form.ma_linh_kien.trim(),
        ten_linh_kien: form.ten_linh_kien.trim(),
        gia_ban: form.gia_ban ? Number(form.gia_ban) : undefined,
        don_vi: form.don_vi.trim() || undefined,
        ghi_chu: form.ghi_chu.trim() || undefined,
        dac_thu: form.dac_thu,
        chi_sua_chua: form.chi_sua_chua,
        phan_loai_dac_thu: form.dac_thu ? form.phan_loai_dac_thu.trim() || undefined : undefined,
      }),
    onSuccess: async () => {
      // Anh (neu co chon luc them moi) chi upload duoc BAY GIO - dong vua duoc tao that su trong DB,
      // POST .../anh doi hoi dong da ton tai (xem backend/src/routes/settingsDatMua.ts).
      if (stagedImageFile) await uploadAnhForMa(form.ma_linh_kien.trim(), stagedImageFile);
      addToast("Đã thêm linh kiện mới - chờ Mua hàng xác nhận mã chuẩn");
      setForm({ ma_linh_kien: "", ten_linh_kien: "", gia_ban: "", don_vi: "", ghi_chu: "", dac_thu: false, chi_sua_chua: false, phan_loai_dac_thu: "" });
      closeForm();
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
    onError: (err) =>
      addToast(
        err instanceof ApiError && err.code === "MA_DA_TON_TAI"
          ? `Mã ${form.ma_linh_kien.trim()} đã có trong danh mục (kể cả mã đã đổi/gộp sang mã khác) - dùng mã khác.`
          : err instanceof ApiError && err.code === "THIEU_PHAN_LOAI"
            ? "Bắt buộc chọn Phân loại linh kiện."
            : "Không thể thêm linh kiện.",
      ),
  });

  // CHOT 2026-09-12 (tich hop gia88 lam nguon chinh gia): "ten_linh_kien"/"gia_ban" KHONG con gui len
  // qua PATCH nay - backend gio bo qua 2 truong nay (chi xem, dong bo tu gia88Sync.ts), gui len cung
  // vo tac dung. Form Sua van HIEN 2 truong nay (tinh, khong phai input) de nguoi dung biet gia tri
  // hien tai, xem JSX ben duoi.
  const editMutation = useMutation({
    mutationFn: () =>
      api.patch(`/settings/linh-kien/${editingMa}`, {
        don_vi: form.don_vi.trim() || null,
        ghi_chu: form.ghi_chu.trim() || null,
        dac_thu: form.dac_thu,
        chi_sua_chua: form.chi_sua_chua,
        phan_loai_dac_thu: form.dac_thu ? form.phan_loai_dac_thu.trim() || null : null,
      }),
    onSuccess: () => {
      addToast("Đã cập nhật linh kiện");
      closeForm();
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
    onError: () => addToast("Không thể cập nhật linh kiện."),
  });

  // Giu ten ham cu (goi tu input file trong Modal ben duoi khi dang o che do SUA - editingMa chac
  // chan co gia tri luc nay) de khong phai doi cho goi trong JSX, chi doi than ham sang dung lai
  // uploadAnhForMa() dung chung voi luong them moi.
  async function handleUploadAnh(file: File) {
    if (!editingMa) return;
    await uploadAnhForMa(editingMa, file);
    addToast("Đã tải ảnh linh kiện lên Google Drive");
    qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
  }

  async function handleBulkImportAnh(file: File) {
    setBulkImportRunning(true);
    setBulkImportSummary(null);
    setBulkImportFailDetails([]);
    try {
      const rows = await parseBulkImportFile(file);
      if (rows.length === 0) {
        addToast('Không đọc được dòng nào hợp lệ (kiểm tra lại tiêu đề cột "Mã linh kiện" / "ẢNH DEMO")');
        return;
      }
      setBulkImportTotal(rows.length);
      let offset = 0;
      let success = 0, notFound = 0, fetchFailed = 0, errorCount = 0;
      const failDetails: { ma_linh_kien: string; status: string }[] = [];
      while (offset < rows.length) {
        const res = await api.post<BulkImportChunkResult>("/settings/linh-kien/bulk-import-anh", { rows: rows.slice(offset, offset + 10), offset, total: rows.length } /* chi gui lo dang xu ly (2026-10-03) */);
        success += res.success;
        notFound += res.notFound;
        fetchFailed += res.fetchFailed;
        errorCount += res.error;
        failDetails.push(...res.details.filter((d) => d.status !== "OK"));
        offset = res.nextOffset;
        setBulkImportProcessed(offset);
        if (res.done) break;
      }
      setBulkImportSummary({ success, notFound, fetchFailed, error: errorCount });
      setBulkImportFailDetails(failDetails);
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
      addToast(`Đã nhập xong: ${success} thành công / ${rows.length} dòng`);
    } catch (err) {
      addToast("Lỗi nhập ảnh hàng loạt: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBulkImportRunning(false);
    }
  }

  async function handleBulkImportCatalog(file: File) {
    setCatalogImportRunning(true);
    setCatalogImportSummary(null);
    setCatalogImportFailDetails([]);
    try {
      const rows = await parseCatalogImportFile(file);
      if (rows.length === 0) {
        addToast('Không đọc được dòng nào hợp lệ (kiểm tra lại tiêu đề cột "Mã")');
        return;
      }
      setCatalogImportTotal(rows.length);
      // Dem SO DONG CO PHAT HIEN link anh trong file (khong phu thuoc ket qua tai len thanh cong hay
      // khong) - hien rieng trong tom tat de nguoi dung biet NGAY cot anh co duoc doc dung khong,
      // tranh lap lai chinh tinh huong hom nay: import "khong bao loi gi" nhung thuc ra la vi khong
      // he doc duoc cot anh nao ca (ten cot trong file khac tat ca bien the da liet ke san).
      const coAnh = rows.filter((r) => r.anh_url).length;
      // FIX (phan hoi 2026-09-04: "tốc độ import rất chậm") - 2 phan: (1) TRUOC DAY moi request gui
      // NGUYEN CA MANG "rows" kem "offset" de backend tu cat 10 dong/lan - gay O(N^2) du lieu qua
      // mang, da doi sang tu CAT rows thanh tung lo O DAY, moi request chi gui 1 lo; (2) nguyen nhan
      // LON HON: backend truoc do await TUNG dong INSERT rieng (moi dong 1 round-trip D1) - da doi
      // sang D1Database.batch() (gom ca lo thanh 1 round-trip), nen lo co the lon hon nhieu ma van
      // nhanh - tang CHUNK tu 25 len 100 (giam so request HTTP them 4 lan nua).
      const CHUNK = 100;
      let offset = 0;
      let success = 0, errorCount = 0, anhLoi = 0;
      const failDetails: { ma_linh_kien: string; status: string }[] = [];
      while (offset < rows.length) {
        const slice = rows.slice(offset, offset + CHUNK);
        offset += slice.length;
        const isLast = offset >= rows.length;
        const res = await api.post<BulkImportCatalogChunkResult>("/settings/linh-kien/bulk-import", { rows: slice, isLast });
        success += res.success;
        errorCount += res.errorCount;
        anhLoi += res.details.filter((d) => d.status === "thanh_cong_loi_anh").length;
        failDetails.push(...res.details.filter((d) => d.status !== "thanh_cong"));
        setCatalogImportProcessed(offset);
      }
      setCatalogImportSummary({ success, errorCount, anhLoi, coAnh });
      setCatalogImportFailDetails(failDetails);
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
      addToast(`Đã nhập xong: ${success} thành công / ${rows.length} dòng`);
    } catch (err) {
      addToast("Lỗi nhập danh mục hàng loạt: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCatalogImportRunning(false);
    }
  }

  const tatCaCot: Column<LinhKienRow>[] = [
    { key: "ma_linh_kien", header: "Mã", render: (p) => <span className="font-mono text-xs"><ToDam text={p.ma_linh_kien} spec={kqTim.toDam} /></span> },
    { key: "ten_linh_kien", header: "Tên linh kiện", render: (p) => <span className="font-semibold text-[var(--ocean-800)]"><ToDam text={p.ten_linh_kien} spec={kqTim.toDam} /></span> },
    { key: "trang_thai_ma", header: "Trạng thái mã", render: (p) => <TrangThaiMaBadge tt={p.trang_thai_ma} /> },
    { key: "gia_ban", header: "Giá NY", render: (p) => <span className="font-mono font-semibold text-[var(--green-700)]"><Money>{fmtVND(p.gia_ban)}</Money></span> },
    { key: "gia_tri_cong_no", header: "Giá KTV", render: (p) => <span className="font-mono text-xs">{p.gia_tri_cong_no != null ? <Money>{fmtVND(p.gia_tri_cong_no)}</Money> : "—"}</span> },
    { key: "gia_du_phong", header: "Giá dự phòng", render: (p) => <span className="font-mono text-xs">{p.gia_du_phong != null ? <Money>{fmtVND(p.gia_du_phong)}</Money> : "—"}</span> },
    { key: "gia_eu", header: "Giá EU", render: (p) => <span className="font-mono text-xs">{p.gia_eu != null ? <Money>{fmtVND(p.gia_eu)}</Money> : "—"}</span> },
    {
      key: "cam_ban",
      header: "Cấm bán",
      render: (p) => (!!p.cam_ban ? <Badge tone="coral">Cấm bán</Badge> : <span className="text-xs text-[var(--ink-400)]">—</span>),
    },
    {
      key: "luot_dung_30_ngay",
      header: "Lượt dùng 30 ngày",
      render: (p) => {
        const soLan = luotDungByMa.get(p.ma_linh_kien);
        return soLan ? <span className="font-mono text-xs">{soLan}</span> : <span className="text-xs text-[var(--ink-400)]">—</span>;
      },
    },
    {
      key: "don_vi",
      header: "Phân loại",
      render: (p) => <PhanLoaiNhanh ma={p.ma_linh_kien} value={p.don_vi} options={phanLoaiOptions} canEdit={canSua && p.trang_thai_ma !== "Da doi ma"} />,
    },
    { key: "anh_demo", header: "Ảnh minh hoạ", render: (p) => <AnhThumbnail url={p.anh_demo} active={!!p.bat_tat} /> },
    { key: "ghi_chu", header: "Ghi chú", render: (p) => <span className="text-xs text-[var(--ink-600)]">{p.ghi_chu ?? "—"}</span> },
    {
      key: "dac_thu",
      header: "Đặc thù",
      render: (p) =>
        canDacThu && p.trang_thai_ma !== "Da doi ma" ? (
          // stopPropagation - nhu cot "Hiển thị": dong co onRowClick mo chi tiet LK.
          <span onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5" title="Bật/tắt linh kiện đặc thù (cần TP DVBH xác nhận)">
            <ToggleSwitch checked={!!p.dac_thu} onChange={() => toggleDacThu.mutate({ ma: p.ma_linh_kien, dac_thu: !p.dac_thu })} />
            {!!p.dac_thu && <span className="text-xs font-semibold text-[var(--amber-600)]">Đặc thù</span>}
          </span>
        ) : !!p.dac_thu ? (
          <span className="text-xs font-semibold text-[var(--amber-600)]">Đặc thù</span>
        ) : (
          <span className="text-xs text-[var(--ink-400)]">—</span>
        ),
    },
    {
      key: "phan_loai_dac_thu",
      header: "Phân loại đặc thù",
      render: (p) => (!!p.dac_thu && p.phan_loai_dac_thu?.trim() ? <span className="text-xs">{p.phan_loai_dac_thu}</span> : <span className="text-xs text-[var(--ink-400)]">—</span>),
    },
    {
      key: "chi_sua_chua",
      header: "Only sửa chữa",
      render: (p) => (!!p.chi_sua_chua ? <span className="text-xs font-semibold text-[var(--coral-600)]">Only sửa chữa</span> : <span className="text-xs text-[var(--ink-400)]">—</span>),
    },
    { key: "nguoi_cap_nhat", header: "Người cập nhật", render: (p) => (p.nguoi_cap_nhat ? formatPersonDisplay(p.nguoi_cap_nhat, personDir) : p.nguoi_cap_nhat) },
    // FIX (ra soat UI 2026-08-27): truoc day hien nguyen chuoi gio VN "tho" tu DB (khac dinh dang
    // dd/mm/yyyy dung khap noi khac) - doi qua fmtDateTime cho nhat quan (xem memory
    // feedback_vn_timezone).
    { key: "ngay_cap_nhat", header: "Ngày cập nhật", render: (p) => <span className="text-xs">{fmtDateTime(p.ngay_cap_nhat)}</span> },
    {
      key: "bat_tat",
      header: "Hiển thị",
      // stopPropagation - cot nay nam trong dong da co onRowClick (bam dong mo xem chi tiet), khong
      // muon bam nham vao cong tac lai mo them drawer xem.
      render: (p) =>
        canSua ? (
          <span onClick={(e) => e.stopPropagation()} className="inline-block">
            <ToggleSwitch checked={!!p.bat_tat} onChange={() => togglePart.mutate({ ma: p.ma_linh_kien, bat_tat: !p.bat_tat })} />
          </span>
        ) : (
          <Badge tone={p.bat_tat ? "teal" : "gray"}>{p.bat_tat ? "Bật" : "Tắt"}</Badge>
        ),
    },
    {
      key: "action",
      header: "",
      mobileHint: "actions",
      render: (p) =>
        canSua ? (
          <button className="text-xs text-[var(--ocean-800)] hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
            Sửa
          </button>
        ) : null,
    },
  ];
  const columns = chiGiaNiemYet
    ? tatCaCot.filter((c) => c.key !== "gia_tri_cong_no" && c.key !== "gia_du_phong" && c.key !== "gia_eu")
    : tatCaCot;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-[var(--ink-600)] flex items-center gap-1.5">
          <Tooltip text={`Đánh dấu "Đặc thù" để chèn thêm bước TP DVBH xác nhận trước khi Tác nghiệp duyệt khi tạo phiếu đặt. Đánh dấu "Only sửa chữa" để ẩn mã này khỏi danh sách chọn khi tạo đơn mua hàng.`} />
        </div>
        {/* SUA mobile (phan hoi 2026-09-27: "danh mục linh kiện chưa tối ưu cho mobile, mất bottom, độ dài vượt
            diện tích màn hình") - nguyen nhan do tren trinh duyet: hang 5 nut (Xuất Excel/Nhập ảnh/Nhập danh
            mục/+ Thêm/Đồng bộ Gia88) la "flex shrink-0" KHONG xuong dong, rong 749px tren man 375px -> ca trang
            gian ra 781px (dien thoai thu nho/cuon ngang, thanh dieu huong day mat khoi tam nhin). Sua: mobile
            chi hien nut chinh "+ Thêm linh kiện" + nut "⋯" mo menu doc chua cac cong cu con lai; desktop
            (>= sm) giu nguyen 1 hang nut nhu cu. */}
        {moreOpen && <div className="fixed inset-0 z-20 sm:hidden" onClick={() => setMoreOpen(false)} />}
        <div className="relative flex items-center gap-2 shrink-0">
          <div
            onClick={() => setMoreOpen(false)}
            className={`${moreOpen ? "flex" : "hidden"} absolute right-0 top-full z-30 mt-1 min-w-[230px] flex-col items-stretch gap-1 rounded-[10px] border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-pop)] sm:static sm:z-auto sm:mt-0 sm:flex sm:min-w-0 sm:flex-row sm:items-center sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none [&>button]:justify-start sm:[&>button]:justify-center`}
          >
          {/* FIX (phan hoi 2026-08-25, hang muc #6, mo rong 2026-08-26): KTV thuan VA Ve tinh thuan
              (khong co quan_ly_danh_muc_lk/Admin) khong duoc xuat Excel danh muc - truoc day nut nay
              khong gate gi (xem comment dau file), vo tinh lo gia_ban/gia_tham_chieu cho vai tro khong
              nen thay gia. Ve tinh la vai tro ky thuat hien truong tuong tu KTV, cung ly do bao mat gia
              nen chan luon (phan hoi 2026-08-26). Cac vai tro khac (Kho/Ke toan/TN/GS/Admin) khong bi
              anh huong vi khong mang co la_ktv_dvbh/la_ve_tinh. */}
          {!((authUser?.la_ktv_dvbh || authUser?.la_ve_tinh) && !canWrite) && (
          <Btn
            variant="ghost"
            size="sm"
            onClick={() =>
              exportRowsToExcel(filteredRows.map((r) => ({ ...r, trang_thai_ma: TRANG_THAI_MA[r.trang_thai_ma]?.label ?? r.trang_thai_ma })), "danh_muc_linh_kien.xlsx", "Data", {
                ma_linh_kien: "Mã",
                ten_linh_kien: "Tên linh kiện",
                trang_thai_ma: "Trạng thái mã",
                gia_ban: "Giá NY",
                gia_tri_cong_no: "Giá KTV",
                gia_du_phong: "Giá dự phòng",
                gia_eu: "Giá EU",
                don_vi: "Phân loại",
                nhan_hang: "Nhãn hàng",
                thiet_bi: "Thiết bị",
                don_vi_nhap: "Đơn vị nhập",
                cam_ban: "Cấm bán",
                ghi_chu: "Ghi chú",
                ghi_chu_doi_tac: "Ghi chú đối tác",
                dac_thu: "Đặc thù",
                phan_loai_dac_thu: "Phân loại đặc thù",
                chi_sua_chua: "Only sửa chữa",
                bat_tat: "Hiển thị",
                nguoi_cap_nhat: "Người cập nhật",
                ngay_cap_nhat: "Ngày cập nhật",
              })
            }
          >
            ⬇ Xuất Excel
          </Btn>
          )}
          {canWrite && (
            <>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBulkImportOpen(true);
                  setBulkImportSummary(null);
                  setBulkImportFailDetails([]);
                  setBulkImportTotal(0);
                  setBulkImportProcessed(0);
                }}
              >
                📥 Nhập ảnh minh hoạ hàng loạt
              </Btn>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCatalogImportOpen(true);
                  setCatalogImportSummary(null);
                  setCatalogImportFailDetails([]);
                  setCatalogImportTotal(0);
                  setCatalogImportProcessed(0);
                }}
              >
                📋 Nhập danh mục hàng loạt
              </Btn>
            </>
          )}
          {isAdmin && (
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => runGia88Sync.mutate()}
              loading={runGia88Sync.isPending}
              title={gia88Status?.last_run_at ? `Lần đồng bộ gần nhất: ${fmtDateTime(gia88Status.last_run_at)}` : "Chưa đồng bộ lần nào"}
            >
              🔄 Đồng bộ Gia88
            </Btn>
          )}
          </div>
          {(!((authUser?.la_ktv_dvbh || authUser?.la_ve_tinh) && !canWrite) || canWrite || isAdmin) && (
            <Btn variant="ghost" size="sm" className="sm:hidden" aria-label="Công cụ khác" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
              ⋯
            </Btn>
          )}
          {canWrite && (
            <Btn size="sm" onClick={openAdd}>
              + Thêm linh kiện
            </Btn>
          )}
        </div>
      </div>

      {soChuaPhanLoai > 0 && (
        <div className="mb-3 flex items-center gap-2 flex-wrap rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-sm text-[var(--color-warning-strong)]">
          <span>
            ⚠ <b>{soChuaPhanLoai}</b> linh kiện <b>chưa có Phân loại</b> (thường là mã mới đồng bộ về). Phân loại quyết định kho
            xuất trong file MISA (vd "Máy") — cần bổ sung.
          </span>
          {filterPhanLoai !== CHUA_PHAN_LOAI && (
            <Btn size="sm" variant="ghost" onClick={() => { setFilterPhanLoai(CHUA_PHAN_LOAI); setFilterTrangThaiMa(""); setPage(1); }}>
              Xem danh sách
            </Btn>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <TimLkBox
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          ketQua={filteredRows}
          tong={filteredRows.length}
          toDam={kqTim.toDam}
          goiY={kqTim.goiY}
          timGanDay={lichSu.timGanDay}
          onChonMa={(ma) => setViewingMa(ma)}
          onGhiTim={lichSu.ghiTim}
          onXoaTim={lichSu.xoaTim}
        />
        {search.trim() && (
          <span className="text-xs text-[var(--ink-400)]">
            {filteredRows.length} kết quả
            {filteredRows.length === 0 && kqTim.goiY && (
              <button type="button" className="ml-1 text-[var(--color-link)] hover:underline" onClick={() => { setSearch(kqTim.goiY!); setPage(1); }}>
                · Có phải bạn muốn tìm “<b>{kqTim.goiY}</b>”?
              </button>
            )}
          </span>
        )}
        <div className="flex items-center gap-1 text-xs text-[var(--ink-500)]">
          <span>Đặc thù:</span>
          <Select value={filterDacThu} onChange={(v) => { setFilterDacThu(v); setPage(1); }} options={BOOL_FILTER_OPTIONS} />
        </div>
        <div className="flex items-center gap-1 text-xs text-[var(--ink-500)]">
          <span>Only sửa chữa:</span>
          <Select value={filterChiSuaChua} onChange={(v) => { setFilterChiSuaChua(v); setPage(1); }} options={BOOL_FILTER_OPTIONS} />
        </div>
        <div className="flex items-center gap-1 text-xs text-[var(--ink-500)]">
          <span>Hiển thị:</span>
          <Select value={filterBatTat} onChange={(v) => { setFilterBatTat(v); setPage(1); }} options={BOOL_FILTER_OPTIONS} />
        </div>
        <div className="flex items-center gap-1 text-xs text-[var(--ink-500)]">
          <span>Cấm bán:</span>
          <Select value={filterCamBan} onChange={(v) => { setFilterCamBan(v); setPage(1); }} options={BOOL_FILTER_OPTIONS} />
        </div>
        <div className="flex items-center gap-1 text-xs text-[var(--ink-500)]">
          <span>Phân loại:</span>
          <Select
            value={filterPhanLoai}
            onChange={(v) => { setFilterPhanLoai(v); setPage(1); }}
            options={[
              { value: "", label: "Tất cả" },
              { value: CHUA_PHAN_LOAI, label: `Chưa phân loại${soChuaPhanLoai ? ` (${soChuaPhanLoai})` : ""}` },
              ...phanLoaiOptions.map((v) => ({ value: v, label: v })),
            ]}
          />
        </div>
        <div className="flex items-center gap-1 text-xs text-[var(--ink-500)]">
          <span>Trạng thái mã:</span>
          <Select
            value={filterTrangThaiMa}
            onChange={(v) => { setFilterTrangThaiMa(v); setPage(1); }}
            options={[
              { value: "", label: "Tất cả" },
              ...Object.entries(TRANG_THAI_MA).map(([value, m]) => ({
                value,
                label: value === "Cho xet duyet" && soChoXetDuyet ? `${m.label} (${soChoXetDuyet})` : m.label,
              })),
            ]}
          />
        </div>
      </div>

      {/* Card mobile rieng cho module nay (hang muc #7, 2026-08-25) - thay cho fallback the chung cua
          PaginatedTable (khong toi uu cho danh muc co anh: anh nho, khong noi bat). 1 dong = 1 linh
          kien, anh lon ben trai + ten/gia/trang thai ben phai, dung LAI AnhThumbnail (prop `active`
          moi = hang muc #14: linh kien tat -> anh mo/xam). An o >=640px (thay bang PaginatedTable
          desktop table qua wrapper "hidden sm:block" ben duoi). */}
      <div className="sm:hidden divide-y divide-[var(--line)] border border-[var(--line)] rounded-xl bg-[var(--surface)] overflow-hidden">
        {filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).length === 0 ? (
          <div className="py-8 text-center text-[var(--ink-400)] text-sm">Không có linh kiện phù hợp.</div>
        ) : (
          filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((p) => (
            // FIX (phan hoi 2026-08-26, hang muc #7): rut con DUNG 2 dong thong tin co ban (ten + gia/
            // trang thai) - bo ma_linh_kien/Dac thu khoi mat card (van xem day du trong
            // PartDetailDrawer khi bam vao card), tranh card qua dai/roi mat tren man hinh hep.
            <div
              key={p.ma_linh_kien}
              onClick={() => setViewingMa(p.ma_linh_kien)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewingMa(p.ma_linh_kien); } }}
              className="flex items-center gap-3 px-3 py-2.5 active:bg-slate-50 cursor-pointer focus-ring"
            >
              <AnhThumbnail url={p.anh_demo} active={!!p.bat_tat} size={56} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[var(--ocean-800)] truncate"><ToDam text={p.ten_linh_kien} spec={kqTim.toDam} /></div>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="font-mono text-sm font-semibold text-[var(--green-700)]"><Money>{fmtVND(p.gia_ban)}</Money></span>
                  <Badge tone={p.bat_tat ? "teal" : "gray"}>{p.bat_tat ? "Bật" : "Tắt"}</Badge>
                  {p.trang_thai_ma && p.trang_thai_ma !== "Da xac nhan" && <TrangThaiMaBadge tt={p.trang_thai_ma} />}
                </div>
              </div>
              {canSua && (
                <button className="text-xs text-[var(--ocean-800)] shrink-0" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                  Sửa
                </button>
              )}
            </div>
          ))
        )}
        <div className="flex items-center justify-between px-3 py-2.5 text-xs text-[var(--ink-400)]">
          <span>{filteredRows.length} dòng</span>
          <div className="flex gap-1">
            <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Btn>
            <span className="px-2 py-1.5">{page}/{Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))}</span>
            <Btn variant="ghost" size="sm" disabled={page >= Math.ceil(filteredRows.length / PAGE_SIZE)} onClick={() => setPage(page + 1)}>›</Btn>
          </div>
        </div>
      </div>
      <div className="hidden sm:block">
        <PaginatedTable
          columns={columns}
          rows={filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
          isLoading={false}
          isError={false}
          page={page}
          pageSize={PAGE_SIZE}
          total={filteredRows.length}
          onPageChange={setPage}
          onRowClick={(p) => setViewingMa(p.ma_linh_kien)}
          rowKey={(p) => p.ma_linh_kien}
          emptyText="Không có linh kiện phù hợp."
          storageKey="danh-muc-lk"
        />
      </div>

      {/* SUA (phan hoi 2026-08-20): gop "Thêm linh kiện mới" va "Sửa linh kiện" thanh 1 Modal DUY
          NHAT dung chung form (truoc day 2 Modal rieng, khac bo cuc - them moi khong co upload anh
          ngay, phai luu xong roi mo lai "Sua" moi gan anh duoc). Ma linh kien: disabled o che do sua
          (khoa PK sau khi tao, dung y cu), an/hien duoc vi field nam CHUNG 1 cho voi Ten linh kien. */}
      <Modal open={formMode !== null} onClose={closeForm} title={formMode === "add" ? "Thêm linh kiện mới" : `Sửa linh kiện ${editingMa ?? ""}`}>
        <div className="space-y-3">
          {formMode === "add" && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Mã linh kiện</label>
              <input value={form.ma_linh_kien} onChange={(e) => setForm({ ...form, ma_linh_kien: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
          )}
          {/* CHOT 2026-09-12 (tich hop gia88 lam nguon chinh gia): che do THEM MOI van cho nhap "Tên
              linh kiện"/"Giá bán" tay (ma chua tung xuat hien ben gia88, chua co gi de "chi xem") - che
              do SUA (ma DA CO) hien 2 truong nay + cac truong dong bo khac o dang TINH, khong sua duoc,
              vi gia88Sync.ts se tu dong ghi de moi dem (xem lib/gia88Sync.ts). */}
          {formMode === "add" ? (
            <>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Tên linh kiện</label>
                <input value={form.ten_linh_kien} onChange={(e) => setForm({ ...form, ten_linh_kien: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Giá bán (Giá NY)</label>
                <input type="number" value={form.gia_ban} onChange={(e) => setForm({ ...form, gia_ban: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-100)] px-3.5 py-3 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
                Đồng bộ tự động từ đối tác — không sửa tay được
                <Tooltip text={`Các trường này do API giá linh kiện đối tác (gia88) tự động cập nhật mỗi đêm, xem lib/gia88Sync.ts. Muốn sửa, liên hệ đối tác cập nhật dữ liệu gốc.`} />
              </div>
              <KvRow label="Tên linh kiện">{editingRow?.ten_linh_kien}</KvRow>
              <KvRow label="Giá NY"><Money>{fmtVND(editingRow?.gia_ban ?? null)}</Money></KvRow>
              <KvRow label="Giá KTV"><Money>{fmtVND(editingRow?.gia_tri_cong_no ?? null)}</Money></KvRow>
              <KvRow label="Giá dự phòng"><Money>{fmtVND(editingRow?.gia_du_phong ?? null)}</Money></KvRow>
              <KvRow label="Giá EU"><Money>{fmtVND(editingRow?.gia_eu ?? null)}</Money></KvRow>
              {editingRow?.nhan_hang?.trim() && <KvRow label="Nhãn hàng">{editingRow.nhan_hang}</KvRow>}
              {editingRow?.thiet_bi?.trim() && <KvRow label="Thiết bị">{editingRow.thiet_bi}</KvRow>}
              {editingRow?.don_vi_nhap?.trim() && <KvRow label="Đơn vị nhập">{editingRow.don_vi_nhap}</KvRow>}
              {editingRow?.ghi_chu_doi_tac?.trim() && <KvRow label="Ghi chú đối tác">{editingRow.ghi_chu_doi_tac}</KvRow>}
              <KvRow label="Cấm bán">{editingRow?.cam_ban ? "Có" : "Không"}</KvRow>
            </div>
          )}
          <div>
            {/* BAT BUOC (chot 2026-09-30): "Máy" quyet dinh kho xuat trong file MISA (backend lib/misaExport.ts). */}
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">
              Phân loại <span className="text-[var(--color-danger)]">*</span>
            </label>
            <input
              value={form.don_vi}
              onChange={(e) => setForm({ ...form, don_vi: e.target.value })}
              list="danh-muc-lk-phan-loai-options"
              placeholder="Chọn có sẵn hoặc gõ phân loại mới..."
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            {!form.don_vi.trim() && <div className="mt-1 text-[11px] text-[var(--color-danger)]">Bắt buộc chọn phân loại linh kiện.</div>}
            <datalist id="danh-muc-lk-phan-loai-options">
              {phanLoaiOptions.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Ảnh minh hoạ</label>
            <div className="flex items-center gap-3 mt-1">
              <AnhThumbnail url={formMode === "add" ? stagedImagePreview : editingRow?.anh_demo ?? null} cacheBust={formMode === "edit" ? imgCacheBust || undefined : undefined} size={64} />
              <div className="flex flex-col gap-1 items-start">
                <FileButton
                  accept="image/*"
                  disabled={uploadingAnh}
                  onFileSelected={(f) => {
                    if (formMode === "add") onPickStagedImage(f);
                    else void handleUploadAnh(f);
                  }}
                >
                  {uploadingAnh ? "Đang tải..." : "⬆ Chọn ảnh"}
                </FileButton>
                {formMode === "edit" && editingRow?.anh_demo && (
                  <button type="button" className="text-xs text-[var(--ocean-600)] hover:underline self-start" onClick={() => setImgCacheBust((n) => n + 1)}>
                    🔄 Đồng bộ lại ảnh
                  </button>
                )}
                {formMode === "add" && !stagedImageFile && <div className="text-xs text-[var(--ink-400)]">Chưa chọn ảnh — có thể để trống, thêm sau.</div>}
                {uploadingAnh && <div className="text-xs text-[var(--ink-500)]">Đang tải ảnh lên Google Drive...</div>}
              </div>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Ghi chú</label>
            <textarea value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} rows={2} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.dac_thu} onChange={(e) => setForm({ ...form, dac_thu: e.target.checked })} className="w-4 h-4" />
            <span className="font-semibold">Linh kiện đặc thù</span>
            <Tooltip text={`Khi tạo/duyệt phiếu đặt mua dùng mã này, hệ thống chèn thêm bước "Chờ TP DVBH xác nhận" trước khi Tác nghiệp (TN) duyệt.`} />
          </label>
          {/* "Phân loại đặc thù" (them 2026-08-25) - CHI hien khi da tick "Linh kien dac thu" o tren,
              cung kieu listdown tu do nhu o "Phân loại" (khong bang settings rieng). */}
          {form.dac_thu && (
            <div className="-mt-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Phân loại đặc thù</label>
              <input
                value={form.phan_loai_dac_thu}
                onChange={(e) => setForm({ ...form, phan_loai_dac_thu: e.target.value })}
                list="danh-muc-lk-phan-loai-dac-thu-options"
                placeholder="Chọn có sẵn hoặc gõ phân loại đặc thù mới..."
                className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
              <datalist id="danh-muc-lk-phan-loai-dac-thu-options">
                {phanLoaiDacThuOptions.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.chi_sua_chua} onChange={(e) => setForm({ ...form, chi_sua_chua: e.target.checked })} className="w-4 h-4" />
            <span className="font-semibold">Only sửa chữa</span>
            <Tooltip text={`Mã này sẽ không hiện trong danh sách chọn khi tạo đơn mua hàng ở module "Đặt mua linh kiện".`} />
          </label>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={closeForm}>
              Hủy
            </Btn>
            {formMode === "add" ? (
              <Btn onClick={() => addMutation.mutate()} disabled={!form.ma_linh_kien.trim() || !form.ten_linh_kien.trim() || !form.don_vi.trim() || addMutation.isPending || uploadingAnh}>
                Thêm
              </Btn>
            ) : (
              <Btn onClick={() => editMutation.mutate()} disabled={!form.ten_linh_kien.trim() || !form.don_vi.trim() || editMutation.isPending}>
                Lưu
              </Btn>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={bulkImportOpen} onClose={() => { if (!bulkImportRunning) setBulkImportOpen(false); }} title="Nhập ảnh minh hoạ hàng loạt">
        <div className="space-y-3">
          <div className="text-xs text-[var(--ink-500)] flex items-center gap-1.5">
            File Excel 2 cột <span className="font-mono">Mã linh kiện</span> + <span className="font-mono">ẢNH DEMO</span>.
            <Tooltip text="Hệ thống sẽ tải từng ảnh về và lưu lên Google Drive của hệ thống, khớp theo mã linh kiện đã có sẵn trong danh mục — mã chưa tồn tại sẽ bị bỏ qua." />
          </div>
          {!bulkImportRunning && !bulkImportSummary && (
            <>
              <Btn variant="ghost" size="sm" onClick={() => void downloadAnhImportTemplate()}>
                ⬇ Tải file mẫu
              </Btn>
              <FileButton accept=".xlsx,.xls" onFileSelected={(f) => void handleBulkImportAnh(f)}>
                ⬆ Chọn file Excel
              </FileButton>
            </>
          )}
          {bulkImportRunning && (
            <div className="text-sm">
              Đang xử lý... {bulkImportProcessed}/{bulkImportTotal} dòng
              <div className="w-full h-2 bg-[var(--surface-100)] rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-[var(--ocean-500)] transition-all"
                  style={{ width: `${bulkImportTotal ? Math.min(100, (bulkImportProcessed / bulkImportTotal) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
          {bulkImportSummary && (
            <div className="text-sm space-y-2">
              <div>
                ✅ Thành công: <b>{bulkImportSummary.success}</b> · Không tìm thấy mã: <b>{bulkImportSummary.notFound}</b> · Lỗi tải ảnh nguồn: <b>{bulkImportSummary.fetchFailed}</b> · Lỗi khác: <b>{bulkImportSummary.error}</b>
              </div>
              {bulkImportFailDetails.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-[var(--line)] rounded-lg p-2 text-xs font-mono space-y-0.5">
                  {bulkImportFailDetails.map((d, i) => (
                    <div key={i}>{d.ma_linh_kien}: {d.status}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setBulkImportOpen(false)} disabled={bulkImportRunning}>
              {bulkImportSummary ? "Đóng" : "Hủy"}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={catalogImportOpen} onClose={() => { if (!catalogImportRunning) setCatalogImportOpen(false); }} title="Nhập danh mục linh kiện hàng loạt">
        <div className="space-y-3">
          <div className="text-xs text-[var(--ink-500)] flex items-center gap-1.5">
            File Excel chỉ cần cột <span className="font-mono">Mã</span> — dùng được luôn file xuất từ nút "⬇ Xuất Excel".
            <Tooltip
              text={`Dùng được file xuất từ nút "⬇ Xuất Excel" ở trên, hoặc file từ hệ khác (vd hệ bảo hành gốc) có tên cột tương tự. Chỉ bắt buộc cột "Mã" — mọi cột khác (Tên linh kiện, Phân loại, Ghi chú, Đặc thù, Phân loại đặc thù, Only sửa chữa, Ảnh) đều tuỳ chọn: cột nào KHÔNG có trong file (hoặc để trống) sẽ GIỮ NGUYÊN giá trị cũ, không bị xoá trắng. Ảnh (link ảnh nguồn) sẽ được hệ thống tự tải về và lưu lên Google Drive của hệ thống (cần đã kết nối ở Settings > Google Drive). Mã đã tồn tại sẽ được CẬP NHẬT theo các cột có mặt trong file, mã CHƯA CÓ sẽ được thêm mới nhưng bắt buộc phải kèm "Tên linh kiện" (mã mới thiếu tên sẽ báo lỗi riêng dòng đó). Lưu ý: Giá NY/Giá KTV/Giá dự phòng/Giá EU KHÔNG import được qua đây nữa — các giá này giờ đồng bộ tự động từ đối tác gia88 mỗi đêm.`}
            />
          </div>
          {!catalogImportRunning && !catalogImportSummary && (
            <>
              <Btn variant="ghost" size="sm" onClick={() => void downloadCatalogImportTemplate()}>
                ⬇ Tải file mẫu
              </Btn>
              <FileButton accept=".xlsx,.xls" onFileSelected={(f) => void handleBulkImportCatalog(f)}>
                ⬆ Chọn file Excel
              </FileButton>
            </>
          )}
          {catalogImportRunning && (
            <div className="text-sm">
              Đang xử lý... {catalogImportProcessed}/{catalogImportTotal} dòng
              <div className="w-full h-2 bg-[var(--surface-100)] rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-[var(--ocean-500)] transition-all"
                  style={{ width: `${catalogImportTotal ? Math.min(100, (catalogImportProcessed / catalogImportTotal) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
          {catalogImportSummary && (
            <div className="text-sm space-y-2">
              <div>
                ✅ Thành công: <b>{catalogImportSummary.success}</b> · Lỗi: <b>{catalogImportSummary.errorCount}</b>
              </div>
              <div className="text-xs text-[var(--ink-500)]">
                {catalogImportSummary.coAnh === 0
                  ? "⚠ Không phát hiện cột ảnh nào trong file này (hoặc mọi dòng đều để trống) — kiểm tra lại tên cột nếu bạn có ý định kèm ảnh."
                  : `Phát hiện link ảnh ở ${catalogImportSummary.coAnh} dòng${catalogImportSummary.anhLoi > 0 ? `, trong đó ${catalogImportSummary.anhLoi} dòng tải ảnh lên Drive thất bại (xem chi tiết bên dưới)` : ", tất cả tải lên Drive thành công"}.`}
              </div>
              {catalogImportFailDetails.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-[var(--line)] rounded-lg p-2 text-xs font-mono space-y-0.5">
                  {catalogImportFailDetails.map((d, i) => (
                    <div key={i}>{d.ma_linh_kien}: {TRANG_THAI_IMPORT_LK[d.status] ?? d.status}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setCatalogImportOpen(false)} disabled={catalogImportRunning}>
              {catalogImportSummary ? "Đóng" : "Hủy"}
            </Btn>
          </div>
        </div>
      </Modal>

      <PartDetailDrawer
        part={viewingRow}
        onClose={() => setViewingMa(null)}
        onEdit={() => { if (viewingRow) openEdit(viewingRow); }}
        canEdit={canSua}
        chiGiaNiemYet={chiGiaNiemYet}
        parts={parts?.rows ?? []}
        canXetDuyet={canXetDuyet}
        onDoiMa={setViewingMa}
      />
    </div>
  );
}
