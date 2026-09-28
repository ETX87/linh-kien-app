import { useState, useEffect, useRef, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge, type Tone } from "../../components/x/Badge";
import { Modal } from "../../components/ui/Modal";
import { Drawer, DrawerNavButtons, useDrawerArrowNav } from "../../components/ui/Drawer";
import { Select } from "../../components/ui/Select";
import { type Column } from "../../components/ui/PaginatedTable";
import { useColumnConfig, type ColumnConfig } from "../../components/ui/useColumnConfig";
import { ColumnSettingsButton, ResizableHeaderCell } from "../../components/ui/ColumnHeader";
import { KvRow } from "../../components/ui/KvRow";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { Timeline } from "../../components/ui/Timeline";
import { api, buildQuery, ApiError } from "../../api/client";
import { exportRowsToExcel } from "../../lib/exportExcel";
import { fmtDate, fmtDateTime, fmtVND } from "../../types";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { compressImage } from "../../lib/imageCompress";
import type { TraHangRow } from "./types";
import { TRA_HANG_TRANG_THAI_TONE, TRA_HANG_TRANG_THAI_OPTIONS, TRA_HANG_BULK_ERROR_MESSAGES } from "./constants";
import {
  describeApiError, formatNguoiDisplay, useKtvDisplayMap, invalidatePipelineCounts, trangThaiLabel, useNenAnhTraHangEnabled,
  useLkAndLdeCache, useLinhKienRankMap, isDonTaoHo, formatLkLabel, LOAI_DON_TONE, loaiDonLabel,
} from "./helpers";
import { ActiveFiltersBar, TrangThaiDropdownFilter, BulkConfirmButton, FilterSearchBar, StatusBadge, DetailZone, QuickStat, KhuVucChipFilter, ImageLink, ImageThumb, MaYcscCell } from "./SharedUi";
import { LinhKienDetailModal } from "./LinhKienPicker";

// Nhan "Ưu tiên" (concept 1 "Structured Neutral" da duyet, 2026-08-24, pattern ".priority-tag") - thay
// cho ngoi sao "⭐" tho truoc day, presentational thuan tuy (khong doc/ghi state).
function PriorityTag() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[var(--orange-600)] font-extrabold text-xs" title="Đơn ưu tiên">
      <span aria-hidden>★</span>Ưu tiên
    </span>
  );
}

// Panel "QC tu choi - anh bang chung bat buoc" (them 2026-08-24, muc 2: "khi QC duyệt đơn trả hàng:
// bắt buộc phải có ảnh bằng chứng nếu từ chối") - dung CHUNG cho ca nut hanh dong tren dong bang
// (TraHangTab) lan footer Drawer (TraHangDetailModal). Moi anh chon UPLOAD + GAN NGAY qua
// POST /tra-hang/:donHangId/anh (dong da TON TAI luc nay, khac TraHangAnhPicker luc TAO don o
// SharedUi.tsx - o do dong CHUA sinh nen chi pre-upload). "Xác nhận từ chối" chi bat khi da co >=1
// anh (khop dung kiem tra o applyTraHangLog backend).
function QcTuChoiModal({
  donHangId, onClose, onConfirm, confirmDisabled, confirmLoading, addToast,
}: {
  donHangId: string;
  onClose: () => void;
  onConfirm: (ghiChu: string) => void;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  addToast: (msg: string) => void;
}) {
  const [anh, setAnh] = useState<{ url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  // FIX (phan hoi 2026-08-25, hang muc #19): ghi_chu nay BAT BUOC o backend (truoc chi bat buoc anh).
  const [ghiChu, setGhiChu] = useState("");
  const nenAnh = useNenAnhTraHangEnabled();

  async function handleFile(file: File) {
    if (anh.length >= 3) return;
    setUploading(true);
    try {
      const upload = nenAnh ? await compressImage(file) : file;
      const bytes = await upload.arrayBuffer();
      const res = await api.postBinary<{ ok: true; url: string }>(`/tra-hang/${donHangId}/anh`, bytes, upload.type || "image/jpeg");
      setAnh((prev) => [...prev, { url: res.url }]);
    } catch (err) {
      addToast("Lỗi tải ảnh: " + describeApiError(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal open title={`Từ chối dòng ${donHangId} — QC — ảnh bằng chứng (bắt buộc)`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          {anh.map((a, i) => (
            <ImageLink key={i} url={a.url} className="inline-flex items-center gap-1 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2 py-1 text-xs text-[var(--ocean-800)] underline underline-offset-2">
              📷 Ảnh {i + 1}
            </ImageLink>
          ))}
          {anh.length < 3 && (
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
        <div className={`text-[11px] ${anh.length === 0 ? "text-[var(--coral-600)]" : "text-[var(--ink-400)]"}`}>{anh.length}/3 ảnh (bắt buộc tối thiểu 1)</div>
        <input
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          placeholder="Lý do từ chối (bắt buộc)"
          className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" size="sm" onClick={onClose}>Hủy</Btn>
          <Btn size="sm" variant="danger" disabled={anh.length === 0 || !ghiChu.trim() || confirmDisabled} loading={confirmLoading} onClick={() => onConfirm(ghiChu)}>
            Xác nhận từ chối
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Tab "Don tra hang" (tach hoan toan khoi mua/cong no - buoc 3 ke hoach) ----------

// Nang len module-level (truoc o trong TraHangTab) - TraHangDetailModal (them 2026-08-21) cung can
// dung 2 danh sach nay, tranh dinh nghia trung lap.
// SUA (migration 0002_tra_hang_pxk.sql): dong o "TN da duyet" gio la trang thai DONG cua state
// machine nay (khong con "Da hoan thanh" - xem giai thich o backend traHang.ts).
const DA_DONG = ["TN da duyet", "Tu choi", "Da huy"];
const CO_THE_DAY_LUI = ["Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong"];

export function TraHangTab({
  addToast, qc, canKeToan, canKho, canQC, canTacNghiep, currentEmail, isAdmin, initialFilterOverride,
  initialDetailIdOverride, onDetailIdConsumed, onJumpConsumed,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>;
  canKeToan: boolean; canKho: boolean; canQC: boolean; canTacNghiep: boolean;
  currentEmail: string; isAdmin: boolean; initialFilterOverride?: string;
  // Mo THANG Drawer chi tiet 1 dong tra hang (them 2026-09-09, link truy cap truc tiep theo ma thung
  // tra "TRA-xxxxxx" - xem lib/pxkDeepLink.ts) - cung pattern voi PhieuXuatKhoTab.initialDetailIdOverride.
  initialDetailIdOverride?: string;
  onDetailIdConsumed?: () => void;
  // FIX (phan hoi 2026-09-24: "click vào việc cần làm/starbar thường phải click 2 lần" - xem giai thich
  // day du o jumpTarget/consumeJumpTarget trong DatMuaLinhKienModule.tsx) - cung co che "tu tieu thu"
  // nhu onDetailIdConsumed o tren, ap dung cho initialFilterOverride thay vi timer mu.
  onJumpConsumed?: () => void;
}) {
  // Uu tien QC > Ke toan > Kho > TN cho mac dinh (chi anh huong lan dau) - 1 nguoi hiem khi giu qua
  // 1 trong 4 flag nay cung luc (ngoai Admin, da tu roi tabs[0] khac o component cha).
  // FIX (ra soat bug mua hang 2026-08-26, BUG-002): tach lop luu-lau-dai khoi lop hien-thi/query,
  // xem giai thich day du o DonCuaToiTab.tsx.
  const [savedFilterTrangThai, setSavedFilterTrangThai] = useLocalStorageState(
    // v2 (2026-08-31): doi key de reset gia tri cu bi ket ("Tat ca") ve dung default theo
    // vai tro, khop voi badge "loai-don-counts" moi (dem theo luot xu ly) - xem DonCuaToiTab.tsx
    "filters:dmlk-th-tt-v2",
    canQC ? "Cho QC xac nhan" : canKeToan ? "Cho ke toan duyet mem" : canKho ? "Cho kho xac nhan" : canTacNghiep ? "Cho TN duyet tong" : "",
  );
  // FIX (phan hoi 2026-08-28: nhay tu Trang chu lan dau hien danh sach trong, bam lai moi dung) - khoi
  // tao TRUC TIEP tu initialFilterOverride khi co, xem giai thich day du o PhieuXuatKhoTab.tsx.
  const [filterTrangThai, setFilterTrangThaiDisplay] = useState(initialFilterOverride ?? savedFilterTrangThai);
  function setFilterTrangThai(v: string) {
    setFilterTrangThaiDisplay(v);
    setSavedFilterTrangThai(v);
  }
  useEffect(() => {
    if (initialFilterOverride !== undefined) { setFilterTrangThaiDisplay(initialFilterOverride); onJumpConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilterOverride]);
  const [layLuiId, setLayLuiId] = useState<string | null>(null);
  const [tuChoiTnId, setTuChoiTnId] = useState<string | null>(null);
  // QC tu choi - anh bang chung bat buoc (them 2026-08-24, muc 2) - xem QcTuChoiModal o tren.
  const [tuChoiQcId, setTuChoiQcId] = useState<string | null>(null);
  // "Tu choi" o buoc Ke toan/Kho (them hang muc #19, 2026-08-25) - truoc day "bam thang" khong hoi gi
  // (backend khong bat buoc), nay backend bat buoc ghi_chu nen can mo modal nhap ly do truoc, cung
  // pattern voi tuChoiTnId (chi khac text tieu de).
  const [tuChoiSimpleId, setTuChoiSimpleId] = useState<string | null>(null);
  const [bulkTuChoiOpen, setBulkTuChoiOpen] = useState(false);
  const [ghiChu, setGhiChu] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ktvDisplayMap = useKtvDisplayMap();
  // Popup "Xem chi tiết linh kiện" tren cot "Linh kiện" (chuan hoa 2026-09-11, dong bo giao dien voi
  // Mua hang/Cong no - xem DonCuaToiTab.tsx dung y het pattern nay).
  const { danhMuc } = useLkAndLdeCache(true);
  const rankMap = useLinhKienRankMap();
  const [detailLk, setDetailLk] = useState<string | null>(null);
  function openLkDetail(maLk: string) {
    if (danhMuc.some((m) => m.ma_linh_kien === maLk)) setDetailLk(maLk);
    else addToast("Không tìm thấy linh kiện này trong danh mục (có thể đã bị ẩn/xoá)");
  }
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #21): loc theo "Nguoi tao", KHONG tai dung API
  // "ve-tinh-cua-toi" (phuc vu dung quan he Tram-Ve tinh, khong khop ngu canh Ke toan/Kho/QC/TN thuc
  // su dung man nay).
  const [filterNguoiTao, setFilterNguoiTao] = useState("");
  // Them 2026-08-21 (dong bo giao dien voi Mua hang/Cong no - "hợp nhất phong cách giao diện"): o
  // tim kiem tu do + nut thu gon "☰ Bộ lọc ▾", cung pattern debounce 500ms nhu DonCuaToiTab.
  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filterQ.trim()), 500);
    return () => clearTimeout(t);
  }, [filterQ]);
  const [showFilters, setShowFilters] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  useEffect(() => {
    if (initialDetailIdOverride) {
      setDetailId(initialDetailIdOverride);
      onDetailIdConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDetailIdOverride]);
  // Bo loc Khu vuc (them 2026-08-31, dong bo voi DonCuaToiTab.tsx - xem CLAUDE.md muc kiem tra toan
  // he thong). showKhuVucFilter khong gom canQC (giong DonCuaToiTab.tsx khong ap dung cho QC).
  const showKhuVucFilter = canTacNghiep || canKho || canKeToan;
  const [filterKhuVuc, setFilterKhuVuc] = useState<Set<string>>(new Set());
  const khuVucDefaultAppliedRef = useRef(false);
  const { data: khuVucAllData } = useQuery({
    queryKey: ["settings-khu-vuc"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/settings/khu-vuc"),
    enabled: showKhuVucFilter,
  });
  const { data: khuVucCuaToiData } = useQuery({
    queryKey: ["dat-mua-lk-khu-vuc-cua-toi"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/dat-mua-lk/khu-vuc-cua-toi"),
    enabled: showKhuVucFilter,
  });
  // FIX (phat hien qua test 2026-08-31): "enabled: showKhuVucFilter" o 2 query tren KHONG du de chan
  // du lieu cho GS - React Query dung CHUNG cache theo queryKey xuyen suot app, DonCuaToiTab.tsx fetch
  // truoc voi dieu kien RONG HON (co them isGiamSat) nen tab nay van "thay" duoc du lieu cache du
  // showKhuVucFilter cua chinh no la false - phai chan tuong minh bang showKhuVucFilter.
  useEffect(() => {
    if (!showKhuVucFilter) return;
    if (khuVucDefaultAppliedRef.current) return;
    if (!khuVucCuaToiData) return;
    khuVucDefaultAppliedRef.current = true;
    if (khuVucCuaToiData.rows.length > 0) setFilterKhuVuc(new Set(khuVucCuaToiData.rows.map((r) => r.ma)));
  }, [khuVucCuaToiData, showKhuVucFilter]);
  const khuVucOptions = showKhuVucFilter ? (khuVucAllData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ten })) : [];
  const khuVucParam = showKhuVucFilter && filterKhuVuc.size > 0 ? [...filterKhuVuc].sort().join(",") : "";

  // GD4 (phan hoi Codex #16): ve trang 1 + xoa selection dang chon khi doi bo loc.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [filterTrangThai, filterNguoiTao, debouncedQ, khuVucParam]);

  // GD4 (phan hoi Codex #17): phan trang server-side that su - truoc day tai TOAN BO dong khop
  // trang_thai roi loc/slice o client, "nguoi_tao" gio cung loc server-side (xem GET /tra-hang) de
  // total/trang khop dung sau khi loc, khong con lech nhu khi loc them 1 lop o client tren du lieu
  // da phan trang.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tra-hang", filterTrangThai, filterNguoiTao, debouncedQ, khuVucParam, page],
    queryFn: () =>
      api.get<{ rows: TraHangRow[]; total: number }>(
        "/tra-hang" +
          buildQuery({
            trang_thai: filterTrangThai || undefined,
            nguoi_tao: filterNguoiTao || undefined,
            q: debouncedQ || undefined,
            khu_vuc: khuVucParam || undefined,
            page,
            pageSize: 20,
          }),
      ),
  });
  // "Tải danh sách chi tiết" (them 2026-09-13) - mirror handleDownloadFullList() cua UsersModule.tsx,
  // goi lai GET /tra-hang VOI CUNG bo loc dang xem nhung KHONG truyen page (BE tra HET).
  const [downloadingFull, setDownloadingFull] = useState(false);
  async function handleDownloadFullList() {
    setDownloadingFull(true);
    try {
      const res = await api.get<{ rows: TraHangRow[] }>(
        "/tra-hang" +
          buildQuery({
            trang_thai: filterTrangThai || undefined,
            nguoi_tao: filterNguoiTao || undefined,
            q: debouncedQ || undefined,
            khu_vuc: khuVucParam || undefined,
          }),
      );
      await exportRowsToExcel(res.rows, "tra_hang_chi_tiet.xlsx", "Trả hàng");
    } catch (err) {
      addToast("Không tải được danh sách chi tiết: " + describeApiError(err));
    } finally {
      setDownloadingFull(false);
    }
  }

  // So "(N)" canh moi trang thai trong TrangThaiDropdownFilter (them 2026-09-01) - dung LAI DUNG
  // endpoint/key voi sub-tab "tra_hang" cua DonCuaToiTab.tsx (GET /dat-mua-lk/don-hang-status-counts
  // co cung scope/WHERE voi GET /tra-hang khi loai_don=tra_hang - xem comment goc tai endpoint do),
  // an theo cache dung 1 lan neu ca 2 tab cung mo.
  const { data: statusCountsData } = useQuery({
    queryKey: ["dat-mua-lk-don-hang-status-counts", "tra_hang"],
    queryFn: () => api.get<{ counts: Record<string, number> }>("/dat-mua-lk/don-hang-status-counts?loai_don=tra_hang"),
  });
  // Nguon rieng cho dropdown "Nguoi tao" - can danh sach KHONG bi gioi han boi trang hien tai cua
  // danh sach chinh, nen goi 1 truy van rong hon (pageSize lon) chi loc theo trang_thai, cung pattern
  // da dung o MissingPartsModule cho nhu cau tuong tu.
  const { data: nguoiTaoOptionsData } = useQuery({
    queryKey: ["tra-hang-nguoi-tao-options", filterTrangThai],
    queryFn: () => api.get<{ rows: TraHangRow[] }>("/tra-hang" + buildQuery({ trang_thai: filterTrangThai || undefined, page: 1, pageSize: 500 })),
  });
  const nguoiTaoOptions = [...new Set((nguoiTaoOptionsData?.rows ?? []).map((r) => r.nguoi_tao))];

  // Ban thang, khong qua modal (tieu chi UX #3, sua 2026-08-15) - "Duyet"/"Tu choi" khong bat buoc
  // nhap gi them nen khong can buoc "Xac nhan" phu. Modal chi con giu cho "Day lui" (ghiChu bat
  // buoc, xem layLuiMutation ben duoi).
  const logMutation = useMutation({
    mutationFn: (args: { id: string; hanhDong: "duyet" | "tu_choi" | "huy"; ghiChu?: string }) =>
      api.post(`/tra-hang/${args.id}/log`, { hanh_dong: args.hanhDong, ghi_chu: args.ghiChu?.trim() || undefined }),
    onSuccess: () => {
      setTuChoiTnId(null);
      setTuChoiQcId(null);
      setTuChoiSimpleId(null);
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      invalidatePipelineCounts(qc);
      addToast("Đã cập nhật trạng thái đơn trả hàng");
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      addToast(
        code === "MISSING_GHI_CHU"
          ? "Cần nhập lý do khi từ chối/huỷ"
          : code === "MISSING_ANH_QC"
            ? "Cần tải ít nhất 1 ảnh bằng chứng trước khi từ chối"
            : code === "KHOVAN_PUSH_FAILED"
              ? "Không báo được sang Kho vận (khovan) — thử duyệt lại. Đơn CHƯA được duyệt."
              : "Lỗi: " + describeApiError(err),
      );
    },
  });

  const layLuiMutation = useMutation({
    mutationFn: () => api.post(`/tra-hang/${layLuiId}/log-lui`, { ghi_chu: ghiChu.trim() }),
    onSuccess: () => {
      setLayLuiId(null);
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      invalidatePipelineCounts(qc);
      addToast("Đã đẩy lùi 1 bước");
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  function canXuLy(trangThai: string): boolean {
    if (trangThai === "Cho ke toan duyet mem") return canKeToan;
    if (trangThai === "Cho kho xac nhan") return canKho;
    if (trangThai === "Cho QC xac nhan") return canQC;
    if (trangThai === "Cho TN duyet tong") return canTacNghiep;
    return false;
  }

  // Bulk-log (tieu chi UX #4, them 2026-08-15) - "Duyet"/"Tu choi" khong bat buoc nhap gi nen ap
  // dung duoc hang loat, khac dong nhau ve trang_thai_tra_hang (moi dong tu tinh buoc ke tiep rieng
  // o server) - chi can canXuLy() dung cho trang thai hien tai cua dong do.
  const rowsCoTheChon = (data?.rows ?? []).filter((r) => canXuLy(r.trang_thai_tra_hang));
  function toggleSelectAll() {
    setSelected((s) => (s.size === rowsCoTheChon.length && rowsCoTheChon.length > 0 ? new Set() : new Set(rowsCoTheChon.map((r) => r.id))));
  }
  function toggleSelectOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const bulkMutation = useMutation({
    mutationFn: ({ hanhDong, ghiChu: gc }: { hanhDong: "duyet" | "tu_choi"; ghiChu?: string }) =>
      api.post<{ results: Record<string, string> }>("/tra-hang/bulk-log", { ids: [...selected], hanh_dong: hanhDong, ghi_chu: gc?.trim() || undefined }),
    onSuccess: (res) => {
      const entries = Object.entries(res.results);
      const failed = entries.filter(([, v]) => v in TRA_HANG_BULK_ERROR_MESSAGES);
      // Phase 4 (bulk retry): giu lai dung cac dong loi trong `selected` khi that bai 1 phan, xem
      // comment day du o DonCuaToiTab.tsx (cung pattern).
      setSelected(new Set(failed.map(([id]) => id)));
      setBulkTuChoiOpen(false);
      setGhiChu("");
      if (failed.length === 0) addToast(`Đã xử lý thành công ${entries.length} dòng`);
      else addToast(`Thành công ${entries.length - failed.length}/${entries.length} dòng. Thất bại: ${failed.map(([id, code]) => `${id}: ${TRA_HANG_BULK_ERROR_MESSAGES[code] ?? code}`).join("; ")} — đã giữ lại các dòng lỗi, bấm lại để thử lại`);
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      invalidatePipelineCounts(qc);
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const cols: Column<TraHangRow>[] = [
    {
      // SUA (2026-08-28, doi tu PaginatedTable phang sang TraHangGroupedList nhom-theo-KTV, khop kien
      // truc DonHangGroupedList/ThieuLkGroupedList): "chọn tất cả" khong con nam trong header cot nay
      // nua (1 bang PHANG duy nhat truoc day chi co 1 header; gio moi nhom KTV la 1 bang RIENG nen
      // header rieng khong the dai dien "chọn tất cả" XUYEN SUOT moi nhom) - chuyen thanh 1 hang rieng
      // phia tren danh sach (xem "rowsCoTheChon.length > 1" ben duoi), dung pattern voi 2 tab kia.
      key: "chon",
      header: "",
      render: (r: TraHangRow) =>
        canXuLy(r.trang_thai_tra_hang) ? (
          <span onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelectOne(r.id)} />
          </span>
        ) : null,
      mobileHint: "select",
    },
    { key: "id", header: "Mã đơn hàng", render: (r) => <span className="code-link font-mono text-xs">{r.id}</span> },
    {
      // CHUAN HOA (phan hoi 2026-09-11: "giao diện của tab trả hàng đang khác giao diện của tab mua
      // hàng") - gop "Mã LK"/"Tên LK" thanh 1 cot "Linh kiện" DUY NHAT, dung y het bo cuc/hanh vi cot
      // "linh_kien" cua DonCuaToiTab.tsx (mono ma_lk nho phia tren + ten LK dam bam-mo-chi-tiet phia
      // duoi, kem ⭐ uu tien/🔒 dac thu) thay vi 2 cot phang rieng nhu truoc.
      key: "linh_kien", header: "Linh kiện",
      // SUA BUG GIAO DIEN (phan hoi 2026-09-12, kem anh chup ma LK lap 2 lan trong cung 1 dong don) -
      // truoc day hien ma_lk RIENG 1 dong tren, gay lap voi ten_lk_snapshot da TU chua san ma trong
      // chuoi - gop ve DUNG 1 dong bang formatLkLabel() (dong bo voi LinhKienPicker.tsx/DonCuaToiTab.tsx).
      render: (r) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openLkDetail(r.ma_lk); }}
          title="Xem chi tiết linh kiện"
          className="block w-full truncate text-left font-medium hover:underline hover:text-[var(--ocean-600)]"
        >
          {r.uu_tien === 1 && <span title="Ưu tiên" className="text-[var(--orange-600)] font-extrabold">⭐ </span>}
          {formatLkLabel(r.ma_lk, r.ten_lk_snapshot ?? r.ma_lk)}
          {!!r.dac_thu && <span title="Linh kiện đặc thù"> 🔒</span>}
        </button>
      ),
    },
    // SUA (phan hoi 2026-09-12: "sắp xếp các cột trong table danh sách đơn giống" file tham chiếu -
    // ap dung cho CA 3 loai don, xac nhan "áp đủ bộ cột như Mua/Công nợ") - dong bo THU TU + BO CUC
    // voi cols cua DonCuaToiTab.tsx (cung 1 khuon dat_don_hang nen moi truong deu co san du lieu, ke
    // ca cac truong TraHangTab truoc day chua tung hien nhu gia_de_xuat/yeu_cau_hoa_don/ghi_chu...).
    // Giu rieng cot "id" (Mã đơn hàng, khong co trong file tham chieu) theo xac nhan nguoi dung.
    { key: "ngay_de_xuat", header: "Ngày đề xuất", render: (r) => fmtDate(r.ngay_tao) },
    { key: "so_luong_de_xuat", header: "SL đề xuất", render: (r) => r.so_luong_de_xuat },
    { key: "sl_thuc_xuat", header: "SL thực xuất", render: (r) => r.so_luong_thuc_xuat ?? <span className="text-[var(--ink-400)]">—</span> },
    { key: "gia", header: "Giá đề xuất", render: (r) => (r.gia_de_xuat != null ? <span className="text-[var(--green-700)] font-semibold">{fmtVND(r.gia_de_xuat)}</span> : "—") },
    { key: "loai", header: "Loại", render: (r) => { const loaiDon = (r.loai_don as keyof typeof LOAI_DON_TONE) ?? "tra_hang"; const t = LOAI_DON_TONE[loaiDon] ?? LOAI_DON_TONE.tra_hang; return <Badge tone={t.tone}>{loaiDonLabel(loaiDon, r.loai_de_xuat)}</Badge>; } },
    { key: "yeu_cau_hoa_don", header: "Yêu cầu hóa đơn", render: (r) => r.yeu_cau_hoa_don || <span className="text-[var(--ink-400)]">—</span> },
    {
      key: "trang_thai_tra_hang", header: "Trạng thái",
      render: (r) => (
        <div className="flex flex-col gap-0.5 items-start">
          <Badge tone={TRA_HANG_TRANG_THAI_TONE[r.trang_thai_tra_hang] ?? "neutral"}>
            {trangThaiLabel(TRA_HANG_TRANG_THAI_OPTIONS, r.trang_thai_tra_hang)}
          </Badge>
          {/* CHUAN HOA: them badge "Đơn tạo hộ" khop dung DonCuaToiTab.tsx - isDonTaoHo() la ham DUNG
              CHUNG cho MOI loai_don (khong rieng mua/cong no), chi la nhan hien thi thuan tuy. */}
          {isDonTaoHo(r) && <Badge tone="neutral">Đơn tạo hộ</Badge>}
        </div>
      ),
    },
    { key: "nguoi_nhan_hang", header: "Người nhận hàng", render: (r) => (r.nguoi_nhan_hang ? formatNguoiDisplay(r.nguoi_nhan_hang, ktvDisplayMap) : <span className="text-[var(--ink-400)]">—</span>) },
    { key: "ly_do_cham", header: "Lý do từ chối/chờ hàng", render: (r) => r.ly_do_cham || <span className="text-[var(--ink-400)]">—</span> },
    // "Khu vực" cua NGUOI NHAN HANG - khong phai cot that tren dat_don_hang, server LEFT JOIN qua
    // ktv_lien_he.khu_vuc_ma (xem GET /tra-hang backend + DonHangRow.khu_vuc_ten trong types.ts).
    { key: "khu_vuc", header: "Khu vực", render: (r) => r.khu_vuc_ten || <span className="text-[var(--ink-400)]">—</span> },
    { key: "ghi_chu", header: "Ghi chú người đặt hàng", render: (r) => r.ghi_chu || <span className="text-[var(--ink-400)]">—</span> },
    { key: "ghi_chu_admin", header: "Ghi chú Admin", render: (r) => r.ghi_chu_xu_ly_gan_nhat || <span className="text-[var(--ink-400)]">—</span> },
    { key: "nguoi_tao_yc", header: "Người tạo yêu cầu", render: (r) => formatNguoiDisplay(r.nguoi_tao, ktvDisplayMap) },
    { key: "ma_ycsc", header: "Mã yêu cầu sự cố", render: (r) => <MaYcscCell value={r.ma_yeu_cau_su_co} canXemChiTietCa={false} /> },
    {
      key: "actions", header: "", mobileHint: "actions",
      render: (r) => {
        if (DA_DONG.includes(r.trang_thai_tra_hang)) return null;
        // Sap xep nut theo dung nhom concept 1 (renderTraHangFull(): primary D1-D4 truoc, ghost "Lùi
        // bước" (D5) giua, danger "Huỷ"/"Từ chối" cuoi cung) - CHI doi THU TU hien thi, dieu kien/
        // handler cua tung nut giu nguyen 100%.
        const coTheXuLy = canXuLy(r.trang_thai_tra_hang);
        const coTheDayLui = (canKeToan || canKho) && CO_THE_DAY_LUI.includes(r.trang_thai_tra_hang);
        return (
          // FIX (phan hoi 2026-08-28: "ấn vào vùng trống trên thẻ vẫn không mở UI chi tiết") -
          // stopPropagation ca hang truoc day nuot ca khoang trong quanh cac nut, giong loi da sua o
          // DonCuaToiTab.tsx/ThieuLkTab.tsx - chi chan bubble khi click trung 1 nut con that su.
          <div
            className="flex gap-1"
            onClick={(e) => {
              if (e.target !== e.currentTarget) e.stopPropagation();
            }}
          >
            {/* CHUAN HOA: nut chu day "Duyệt"/"Đẩy lùi"/"Từ chối" -> nut icon nho (ghost/danger + ký tu
                ✓/↩/✕), dung y het kieu nut hanh dong cua DonCuaToiTab.tsx ("hanh_dong" column) - chi
                doi HINH THUC hien thi, dieu kien/handler giu nguyen 100%. */}
            {coTheXuLy && (
              <Btn
                size="sm"
                variant="ghost"
                className="px-2"
                title="Duyệt"
                aria-label="Duyệt"
                disabled={logMutation.isPending}
                onClick={() => logMutation.mutate({ id: r.id, hanhDong: "duyet" })}
              >
                ✓
              </Btn>
            )}
            {coTheDayLui && (
              <Btn size="sm" variant="ghost" className="px-2" title="Đẩy lùi 1 bước" aria-label="Đẩy lùi 1 bước" onClick={() => { setLayLuiId(r.id); setGhiChu(""); }}>
                ↩
              </Btn>
            )}
            {coTheXuLy && (
              <Btn
                size="sm"
                variant="danger"
                className="px-2"
                title="Từ chối"
                aria-label="Từ chối"
                disabled={logMutation.isPending}
                onClick={() => {
                  if (r.trang_thai_tra_hang === "Cho TN duyet tong") {
                    setTuChoiTnId(r.id);
                    setGhiChu("");
                  } else if (r.trang_thai_tra_hang === "Cho QC xac nhan") {
                    setTuChoiQcId(r.id);
                  } else {
                    setTuChoiSimpleId(r.id);
                    setGhiChu("");
                  }
                }}
              >
                ✕
              </Btn>
            )}
          </div>
        );
      },
    },
  ];

  // FIX (ra soat bug mua hang 2026-08-26, BUG-003): thieu filterTrangThai, khop pattern DonCuaToiTab.tsx.
  const activeFilterCount = [filterTrangThai, filterNguoiTao, filterQ, khuVucParam].filter(Boolean).length;

  // Nang len goi useColumnConfig O DAY (2026-08-21, sua loi UX "nút Tùy chỉnh cột khiến table bị
  // trống ra 1 khoảng trông rất xấu") - truoc day PaginatedTable tu goi hook nay noi bo VA tu ve nut
  // trong header cot dau ("chon", cot checkbox HEP) khien cot do bi keo rong bat thuong de vua noi
  // dung nut. Goi o day + truyen columnConfig xuong PaginatedTable, tu dat nut vao FilterSearchBar
  // (cung hang voi nut "☰ Bộ lọc") thay vi trong header bang.
  const columnConfig = useColumnConfig(cols, [], [], "dmlk-tra-hang-list");
  const settingsButtonEl = (
    <ColumnSettingsButton
      toggleableColumns={columnConfig.toggleableColumns}
      resolvedOrder={columnConfig.resolvedOrder}
      settingsOpen={columnConfig.settingsOpen}
      setSettingsOpen={columnConfig.setSettingsOpen}
      toggleColumn={columnConfig.toggleColumn}
    />
  );

  return (
    <div className="mt-4">
      <FilterSearchBar
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((v) => !v)}
        activeFilterCount={activeFilterCount}
        searchValue={filterQ}
        onSearchChange={setFilterQ}
        searchPlaceholder="Tìm theo mã đơn, mã LK, tên LK, tên KTV/người tạo..."
        trailing={
          <div className="flex items-center gap-2">
            {settingsButtonEl}
            <Btn size="sm" variant="ghost" onClick={handleDownloadFullList} disabled={downloadingFull}>
              {downloadingFull ? "Đang tải..." : "⬇ Tải danh sách chi tiết"}
            </Btn>
          </div>
        }
        activeFilters={
          // SUA (ra soat #3): bo chip "Trạng thái: ..." - gia tri dang chon da hien SAN trong o
          // TrangThaiDropdownFilter ngay ben tren (doi tu chip/nut sang dropdown 2026-09-01).
          <ActiveFiltersBar
            chips={[
              ...(filterNguoiTao ? [{ label: `KTV: ${formatNguoiDisplay(filterNguoiTao, ktvDisplayMap)}`, onClear: () => setFilterNguoiTao("") }] : []),
              ...(khuVucParam ? [{ label: `Khu vực: ${[...filterKhuVuc].map((ma) => khuVucOptions.find((o) => o.value === ma)?.label ?? ma).join(", ")}`, onClear: () => setFilterKhuVuc(new Set()) }] : []),
              ...(filterQ ? [{ label: `Tìm: "${filterQ}"`, onClear: () => setFilterQ("") }] : []),
            ]}
          />
        }
      >
        <TrangThaiDropdownFilter value={filterTrangThai} onChange={setFilterTrangThai} options={TRA_HANG_TRANG_THAI_OPTIONS} counts={statusCountsData?.counts} />
        {/* Bo loc Khu vuc (them 2026-08-31, dong bo voi DonCuaToiTab.tsx). SUA BUG GIAO DIEN (phan hoi
            2026-09-12): bo nhan "Khu vực" rieng ben ngoai (gay lech chieu cao so voi cac o loc khac
            cung hang) - nhan da gop vao THANG nut trigger (xem triggerLabel trong SharedUi.tsx). */}
        {showKhuVucFilter && khuVucOptions.length > 0 && <KhuVucChipFilter value={filterKhuVuc} onChange={setFilterKhuVuc} options={khuVucOptions} />}
        {/* FIX (phan hoi 2026-08-28: "Thiếu công cụ filter theo KTV") - bo dieu kien "> 1" (truoc day
            an han Select khi trang hien tai chi co 1 nguoi tao, khien bo loc bien mat that thuong tuy
            trang dang xem) - hien LUON khi co it nhat 1 lua chon, dung nguon KHONG phan trang
            (nguoiTaoOptionsData, xem query rieng o tren) nen danh sach KTV luon day du bat ke dang o
            trang nao/loc gi. */}
        {nguoiTaoOptions.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Select
              value={filterNguoiTao}
              onChange={(v) => { setFilterNguoiTao(v); setPage(1); }}
              options={[{ value: "", label: "Tất cả KTV (người tạo)" }, ...nguoiTaoOptions.map((email) => ({ value: email, label: formatNguoiDisplay(email, ktvDisplayMap) }))]}
            />
          </div>
        )}
      </FilterSearchBar>
      {/* Dong bo pattern "Chọn tất cả" voi ThieuLkTab.tsx/DonHangGroupedList (2026-08-28, cung dot
          chuyen sang TraHangGroupedList) - dat O DAY (thanh phan cha), ap dung xuyen suot MOI nhom KTV
          tren trang, khong rieng 1 nhom. */}
      {rowsCoTheChon.length > 1 && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <input type="checkbox" checked={selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />
          <span className="text-[var(--ink-500)]">Chọn tất cả {rowsCoTheChon.length} dòng có thể xử lý (trên mọi nhóm KTV ở trang này)</span>
        </div>
      )}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 bg-[var(--ocean-100)] border border-[var(--ocean-800)]/30 rounded-lg px-3 py-2">
          <span className="text-sm font-bold text-[var(--ocean-900)]">Đã chọn {selected.size} dòng</span>
          <BulkConfirmButton
            label="Duyệt tất cả"
            confirmLabel={`Xác nhận duyệt ${selected.size} dòng?`}
            count={selected.size}
            onConfirm={() => bulkMutation.mutate({ hanhDong: "duyet" })}
            disabled={bulkMutation.isPending}
            loading={bulkMutation.isPending}
          />
          {/* FIX (phan hoi 2026-08-25, hang muc #19): "Từ chối tất cả" truoc day bam la gui NGAY
              khong ghi_chu - backend nay bat buoc, nen doi sang mo modal nhap ly do chung truoc
              (ap dung cho ca lua chon, tru dong "Cho QC xac nhan" van can anh rieng tung dong nen
              khong the xu ly hang loat - giu nguyen han che da co tu truoc). */}
          <Btn size="sm" variant="danger" onClick={() => { setBulkTuChoiOpen(true); setGhiChu(""); }} disabled={bulkMutation.isPending}>
            Từ chối tất cả
          </Btn>
        </div>
      )}
      <TraHangGroupedList
        columns={cols}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        page={page}
        pageSize={20}
        total={data?.total ?? 0}
        onPageChange={setPage}
        columnConfig={columnConfig}
        onDetail={(id) => setDetailId(id)}
        onLkDetail={openLkDetail}
        ktvDisplayMap={ktvDisplayMap}
      />
      {detailId && (
        <TraHangDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          addToast={addToast}
          qc={qc}
          canXuLy={canXuLy}
          canKeToan={canKeToan}
          canKho={canKho}
          currentEmail={currentEmail}
          isAdmin={isAdmin}
          navRows={data?.rows}
          onNavigate={setDetailId}
        />
      )}
      {layLuiId && (
        <Modal open title="Đẩy lùi 1 bước" onClose={() => setLayLuiId(null)}>
          <div className="space-y-3 text-sm">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              // CHOT (ra soat module #21): giu input tu do (day la hanh dong it xay ra, ly do rat da
              // dang tuy ca cu the - chuan hoa cung se khong phu het, ep chon "Khac" thuong xuyen thi
              // vo nghia) - chi doi placeholder rong thanh vi du cu the de goi y muc do chi tiet can
              // viet.
              placeholder="VD: xác nhận sai số lượng, cần Kho kiểm lại"
              className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setLayLuiId(null)}>Hủy</Btn>
              <Btn size="sm" onClick={() => layLuiMutation.mutate()} disabled={layLuiMutation.isPending || !ghiChu.trim()}>Xác nhận</Btn>
            </div>
          </div>
        </Modal>
      )}
      {tuChoiQcId && (
        <QcTuChoiModal
          donHangId={tuChoiQcId}
          onClose={() => setTuChoiQcId(null)}
          onConfirm={(ghiChuQc) => logMutation.mutate({ id: tuChoiQcId, hanhDong: "tu_choi", ghiChu: ghiChuQc })}
          confirmDisabled={logMutation.isPending}
          confirmLoading={logMutation.isPending}
          addToast={addToast}
        />
      )}
      {tuChoiTnId && (
        <Modal open title={`Từ chối dòng ${tuChoiTnId} — TN duyệt tổng`} onClose={() => setTuChoiTnId(null)}>
          <div className="space-y-3 text-sm">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do từ chối (bắt buộc)"
              className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setTuChoiTnId(null)}>Hủy</Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={() => logMutation.mutate({ id: tuChoiTnId, hanhDong: "tu_choi", ghiChu })}
                disabled={logMutation.isPending || !ghiChu.trim()}
              >
                Xác nhận từ chối
              </Btn>
            </div>
          </div>
        </Modal>
      )}
      {tuChoiSimpleId && (
        <Modal open title={`Từ chối dòng ${tuChoiSimpleId}`} onClose={() => setTuChoiSimpleId(null)}>
          <div className="space-y-3 text-sm">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do từ chối (bắt buộc)"
              className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setTuChoiSimpleId(null)}>Hủy</Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={() => logMutation.mutate({ id: tuChoiSimpleId, hanhDong: "tu_choi", ghiChu })}
                disabled={logMutation.isPending || !ghiChu.trim()}
              >
                Xác nhận từ chối
              </Btn>
            </div>
          </div>
        </Modal>
      )}
      {bulkTuChoiOpen && (
        <Modal open title={`Từ chối ${selected.size} dòng đã chọn`} onClose={() => { setBulkTuChoiOpen(false); setGhiChu(""); }}>
          <div className="space-y-3 text-sm">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do từ chối (bắt buộc, áp dụng chung cho tất cả các dòng đã chọn)"
              className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => { setBulkTuChoiOpen(false); setGhiChu(""); }}>Hủy</Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={() => bulkMutation.mutate({ hanhDong: "tu_choi", ghiChu })}
                disabled={bulkMutation.isPending || !ghiChu.trim()}
              >
                Xác nhận từ chối
              </Btn>
            </div>
          </div>
        </Modal>
      )}
      {detailLk && (() => {
        const part = danhMuc.find((m) => m.ma_linh_kien === detailLk);
        return part ? (
          <LinhKienDetailModal
            part={part}
            rank={rankMap.get(detailLk)}
            onClose={() => setDetailLk(null)}
          />
        ) : null;
      })()}
    </div>
  );
}

// SUA (2026-08-28, phan hoi ra soat UI "màn Trả hàng vẫn dùng bảng/card mặc định (chưa redesign)"):
// doi tu PaginatedTable (1 bang PHANG + the mobile TU DONG dang "nhãn: giá trị") sang danh sach NHOM
// THEO KTV (nguoi_tao), dung KIEN TRUC GIONG HET ThieuLkGroupedList/DonHangGroupedList - 1 <table>
// rieng/nhom tren desktop, the doc 2-DONG tren mobile (dong 1: ten LK ~60% + badge trang thai ~40%,
// dong 2: SL + ngay tao), khop dung chuan da ap dung cho "Đơn của tôi". Nhan `columns`/`columnConfig`
// tu component cha (TraHangTab da goi useColumnConfig o do de dat nut "⚙" trong FilterSearchBar, xem
// comment goc 2026-08-21) - KHONG tu goi lai hook o day, tranh 2 nguon state cot lech nhau.
function TraHangGroupedList({
  columns, rows, isLoading, isError, page, pageSize, total, onPageChange, onDetail, onLkDetail, ktvDisplayMap, columnConfig,
}: {
  columns: Column<TraHangRow>[];
  rows: TraHangRow[];
  isLoading: boolean;
  isError: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onDetail: (id: string) => void;
  onLkDetail: (maLk: string) => void;
  ktvDisplayMap: ReturnType<typeof useKtvDisplayMap>;
  columnConfig: ColumnConfig<TraHangRow>;
}) {
  const { effectiveColumns, colWidths, dragOverKey, setDragOverKey, draggedColKey, handleColumnDrop, handleResizeStart } = columnConfig;
  const chonCol = columns.find((c) => c.key === "chon");
  const actionsCol = columns.find((c) => c.key === "actions");

  if (isLoading) return <div className="text-sm text-[var(--ink-500)] py-6 text-center">Đang tải...</div>;
  if (isError) return <div className="text-sm text-[var(--coral-500)] py-6 text-center">Lỗi tải dữ liệu.</div>;
  if (rows.length === 0) return <div className="text-sm text-[var(--ink-400)] py-6 text-center">Không có dữ liệu.</div>;

  const groups = new Map<string, TraHangRow[]>();
  for (const r of rows) {
    if (!groups.has(r.nguoi_tao)) groups.set(r.nguoi_tao, []);
    groups.get(r.nguoi_tao)!.push(r);
  }

  // FIX (phan hoi QA 2026-08-31, muc #13): truoc day MOI nhom KTV la 1 <table> doc lap kem <thead>
  // rieng (lap lai header nhieu lan, nhin nhu nhieu bang tach biet) - gop thanh 1 <table> DUY NHAT cho
  // toan bo danh sach (1 <thead> chung tren cung, <tbody> noi tiep tung nhom qua 1 hang banner
  // <td colSpan>), dung CHUNG pattern da ap dung cho Mua hang/Cong no o DonCuaToiTab.tsx.
  const groupEntries = [...groups.entries()].map(([nguoiTao, dongCon]) => {
    const dangCho = dongCon.filter((r) => !DA_DONG.includes(r.trang_thai_tra_hang)).length;
    const daDong = dongCon.length - dangCho;
    return { nguoiTao, dongCon, dangCho, daDong };
  });

  return (
    <div className="space-y-2">
      <div className="hidden sm:block overflow-x-auto border-t border-[var(--line)]">
        <table className="tbl w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="tbl-head">
              {effectiveColumns.map((col, idx) => (
                <ResizableHeaderCell
                  key={col.key}
                  col={col}
                  idx={idx}
                  isPinned={idx === 0}
                  width={colWidths[col.key]}
                  storageKey="dmlk-tra-hang-list"
                  dragOverKey={dragOverKey}
                  setDragOverKey={setDragOverKey}
                  draggedColKey={draggedColKey}
                  handleColumnDrop={handleColumnDrop}
                  handleResizeStart={handleResizeStart}
                  sortable={false}
                  isActive={false}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {groupEntries.map((g) => (
              <Fragment key={g.nguoiTao}>
                <tr className="bg-[var(--ocean-100)]">
                  <td colSpan={effectiveColumns.length} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 flex-wrap text-sm min-w-0">
                        <span className="font-bold text-[var(--ink-900)] text-sm truncate">
                          {formatNguoiDisplay(g.nguoiTao, ktvDisplayMap)}
                        </span>
                        <span className="text-[var(--ink-500)] text-xs">({g.dongCon.length} dòng)</span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {g.dangCho > 0 && <Badge tone="warning">{g.dangCho} đang chờ</Badge>}
                        {g.daDong > 0 && <Badge tone="success">{g.daDong} đã xong</Badge>}
                      </div>
                    </div>
                  </td>
                </tr>
                {g.dongCon.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => onDetail(r.id)}
                    className={`cursor-pointer transition-colors border-b border-[var(--line)] last:border-0 ${
                      r.uu_tien === 1 ? "bg-[var(--orange-100)] ring-1 ring-inset ring-[var(--orange-500)] hover:brightness-95" : "hover:bg-slate-50"
                    }`}
                  >
                    {effectiveColumns.map((col) => {
                      const width = colWidths[col.key];
                      return (
                        <td key={col.key} style={width ? { width, maxWidth: width, overflow: "hidden" } : undefined} className={`px-3 py-1.5 ${col.className ?? ""}`}>
                          {col.render(r)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {groupEntries.map((g) => (
        <div key={g.nguoiTao} className="mb-4">
          <div className="sm:hidden flex items-center justify-between gap-2 flex-wrap">
            <SectionTitle>
              KTV: {formatNguoiDisplay(g.nguoiTao, ktvDisplayMap)}
              <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--ink-400)]">({g.dongCon.length} dòng)</span>
            </SectionTitle>
            <div className="flex items-center gap-1 flex-wrap mb-2">
              {g.dangCho > 0 && <Badge tone="warning">{g.dangCho} đang chờ</Badge>}
              {g.daDong > 0 && <Badge tone="success">{g.daDong} đã xong</Badge>}
            </div>
          </div>
          <div className="sm:hidden border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
              <div className="divide-y divide-[var(--line)]">
                {g.dongCon.map((r) => {
                  // Dong 1: ten LK (~60%) + badge trang thai (~40%, cat bot + "+N" neu khong du cho) -
                  // khop dung quy uoc "60/40 + (N) ẩn bớt" da ap dung cho DonCuaToiTab.tsx cung dot.
                  const badges: { tone: Tone; label: string }[] = [
                    { tone: TRA_HANG_TRANG_THAI_TONE[r.trang_thai_tra_hang] ?? "neutral", label: trangThaiLabel(TRA_HANG_TRANG_THAI_OPTIONS, r.trang_thai_tra_hang) },
                    // CHUAN HOA (dong bo voi DonCuaToiTab.tsx) - them "Đơn tạo hộ" khi co, isDonTaoHo()
                    // dung chung cho moi loai_don.
                    ...(isDonTaoHo(r) ? [{ tone: "neutral" as Tone, label: "Đơn tạo hộ" }] : []),
                  ];
                  // SUA (phan hoi 2026-08-28, dong bo voi DonCuaToiTab.tsx): giam ve 1 - xem giai thich
                  // day du o DonCuaToiTab.tsx (MAX_BADGE gan voi comment "ẩn cả thẻ nếu không đủ diện
                  // tích, không xuống dòng").
                  const MAX_BADGE = 1;
                  const shownBadges = badges.slice(0, MAX_BADGE);
                  const extraBadgeCount = badges.length - shownBadges.length;
                  return (
                    <div
                      key={r.id}
                      onClick={() => onDetail(r.id)}
                      className={`cursor-pointer px-3 py-2.5 ${r.uu_tien === 1 ? "bg-[var(--orange-100)] ring-1 ring-inset ring-[var(--orange-500)] active:brightness-95" : "active:bg-slate-50"}`}
                    >
                      <div className="flex items-start gap-2">
                        {chonCol && (
                          <span className="mt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>{chonCol.render(r)}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-[3]">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onLkDetail(r.ma_lk); }}
                                title="Xem chi tiết linh kiện"
                                className="inline-block align-top max-w-full min-w-0 truncate text-left font-medium text-sm hover:underline hover:text-[var(--ocean-600)]"
                              >
                                {r.uu_tien === 1 && <span title="Ưu tiên" className="text-[var(--orange-600)] font-extrabold">⭐ </span>}
                                {r.ten_lk_snapshot ?? r.ma_lk}
                                {!!r.dac_thu && <span title="Linh kiện đặc thù"> 🔒</span>}
                              </button>
                            </div>
                            {/* SUA (phan hoi 2026-08-28, lan 2, dong bo voi DonCuaToiTab.tsx): 1 dong
                                DUY NHAT (overflow-hidden) - badge thua gop vao "+N" thay vi xuong dong. */}
                            <div className="flex-[2] flex items-center justify-end gap-1 min-w-0 overflow-hidden">
                              {shownBadges.map((b, i) => (
                                <Badge key={i} tone={b.tone}>{b.label}</Badge>
                              ))}
                              {extraBadgeCount > 0 && (
                                <span
                                  title="Xem đầy đủ trạng thái trong chi tiết"
                                  className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--ink-500)] text-white text-[10px] font-bold leading-none shrink-0"
                                >
                                  +{extraBadgeCount}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[var(--ink-500)] mt-1">
                            <span>Mã đơn {r.id}</span>
                            <span>·</span>
                            <span>SL:{r.so_luong_de_xuat}</span>
                            <span>·</span>
                            <span>{fmtDateTime(r.ngay_tao)}</span>
                          </div>
                          {actionsCol && <div className="mt-1.5">{actionsCol.render(r)}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between px-1 py-2 text-xs text-[var(--ink-400)]">
        <span>{total} dòng</span>
        <div className="flex gap-1">
          <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</Btn>
          <span className="px-2 py-1.5">{page}/{Math.max(1, Math.ceil(total / pageSize))}</span>
          <Btn variant="ghost" size="sm" disabled={page * pageSize >= total} onClick={() => onPageChange(page + 1)}>›</Btn>
        </div>
      </div>
    </div>
  );
}

// Them 2026-08-21 ("hợp nhất phong cách giao diện" - dong bo voi PXK/Mua hang, ca 2 deu bam-dong-de-
// xem-chi-tiet qua Drawer) - truoc day Trả hàng KHONG co man chi tiet rieng du backend da co san API
// tra ca lich su xu ly (GET /api/tra-hang/:id -> {donHang, logs}, chi chua tung duoc frontend dung
// toi). Tu chua/goi lai CUNG mutation endpoint voi TraHangTab (khong dung chung state qua props) -
// don gian hon truyen 3-4 mutation object qua props, doi gia la invalidate rieng (khong lech du lieu
// vi CUNG 1 react-query queryKey "tra-hang" duoc invalidate).
function TraHangDetailModal({
  id, onClose, addToast, qc, canXuLy, canKeToan, canKho, currentEmail, isAdmin, navRows, onNavigate,
}: {
  id: string;
  onClose: () => void;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canXuLy: (trangThai: string) => boolean;
  canKeToan: boolean;
  canKho: boolean;
  currentEmail: string;
  isAdmin: boolean;
  navRows?: TraHangRow[];
  onNavigate?: (id: string) => void;
}) {
  const [ghiChu, setGhiChu] = useState("");
  const [actionMode, setActionMode] = useState<"tu_choi_tn" | "tu_choi_qc" | "tu_choi_simple" | "day_lui" | "huy" | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["tra-hang-detail", id],
    queryFn: () =>
      api.get<{
        donHang: TraHangRow;
        logs: Array<{ id: number; trang_thai: string; nguoi_xu_ly: string; ngay_xu_ly: string; ghi_chu: string | null }>;
        // Anh tra hang (them 2026-08-24) - xem GET /tra-hang/:donHangId o backend.
        anh: Array<{ id: number; loai: "tao_moi" | "qc_tu_choi"; url: string; nguoi_upload: string; ngay_upload: string }>;
      }>(`/tra-hang/${id}`),
  });

  function invalidate() {
    setGhiChu("");
    setActionMode(null);
    qc.invalidateQueries({ queryKey: ["tra-hang-detail", id] });
    qc.invalidateQueries({ queryKey: ["tra-hang"] });
    invalidatePipelineCounts(qc);
  }

  const logMutation = useMutation({
    mutationFn: (args: { hanhDong: "duyet" | "tu_choi" | "huy"; ghiChu?: string }) =>
      api.post(`/tra-hang/${id}/log`, { hanh_dong: args.hanhDong, ghi_chu: args.ghiChu?.trim() || undefined }),
    onSuccess: (_res, variables) => {
      invalidate();
      // "Duyet va tiep theo" (concept 1 da duyet, 2026-08-24) - dong y het DonHangDetailModal: chi tu
      // nhay dong ke tiep khi "duyet" (tu choi/huy nguoi dung can tu xem lai ket qua, khong nhay tiep).
      if (variables.hanhDong === "duyet" && onNavigate && navNextId) onNavigate(navNextId);
      else addToast("Đã cập nhật trạng thái đơn trả hàng");
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      addToast(
        code === "MISSING_GHI_CHU"
          ? "Cần nhập lý do khi từ chối/huỷ"
          : code === "MISSING_ANH_QC"
            ? "Cần tải ít nhất 1 ảnh bằng chứng trước khi từ chối"
            : code === "KHOVAN_PUSH_FAILED"
              ? "Không báo được sang Kho vận (khovan) — thử duyệt lại. Đơn CHƯA được duyệt."
              : "Lỗi: " + describeApiError(err),
      );
    },
  });

  const layLuiMutation = useMutation({
    mutationFn: () => api.post(`/tra-hang/${id}/log-lui`, { ghi_chu: ghiChu.trim() }),
    onSuccess: () => { invalidate(); addToast("Đã đẩy lùi 1 bước"); },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const d = data?.donHang;
  const trangThai = d?.trang_thai_tra_hang ?? "";
  const daDong = DA_DONG.includes(trangThai);
  const coTheXuLy = !!d && !daDong && canXuLy(trangThai);
  const coTheDayLui = !!d && (canKeToan || canKho) && CO_THE_DAY_LUI.includes(trangThai);
  // FIX (phan hoi QA 2026-08-31, muc #2): backend da cho phep chinh nguoi tao (hoac Admin) tu huy don
  // tra hang cua minh o bat ky buoc nao con mo (xem traHang.ts, hanhDong "huy") nhung frontend truoc
  // day khong co duong nao goi toi hanh dong nay - chi co Duyet/Tu choi cho cac vai tro xu ly.
  const coTheHuy = !!d && !daDong && (currentEmail === d.nguoi_tao || isAdmin);
  const ktvDisplayMap = useKtvDisplayMap();

  const navIndex = navRows?.findIndex((r) => r.id === id) ?? -1;
  const navPrevId = navRows && navIndex > 0 ? navRows[navIndex - 1]?.id : undefined;
  const navNextId = navRows && navIndex >= 0 && navIndex < navRows.length - 1 ? navRows[navIndex + 1]?.id : undefined;
  useDrawerArrowNav({
    hasPrev: !!(onNavigate && navRows && navPrevId),
    hasNext: !!(onNavigate && navRows && navNextId),
    onPrev: () => navPrevId && onNavigate?.(navPrevId),
    onNext: () => navNextId && onNavigate?.(navNextId),
  });

  function handleTuChoi() {
    if (trangThai === "Cho TN duyet tong") {
      setActionMode("tu_choi_tn");
      setGhiChu("");
      return;
    }
    if (trangThai === "Cho QC xac nhan") {
      setActionMode("tu_choi_qc");
      return;
    }
    // FIX (phan hoi 2026-08-25, hang muc #19): cac buoc KT/Kho tu choi gio backend bat buoc ghi_chu -
    // khong con ban duoc fire thang khong hoi ly do nua (truoc day khong prompt gi ca).
    setActionMode("tu_choi_simple");
    setGhiChu("");
  }

  const footer =
    !isLoading && d ? (
      actionMode === "tu_choi_tn" ? (
        <div className="space-y-2">
          <div className="font-semibold text-xs">Từ chối — TN duyệt tổng — lý do (bắt buộc)</div>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do từ chối (bắt buộc)"
              className="focus-ring flex-1 min-w-[160px] bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <Btn variant="ghost" size="sm" onClick={() => { setActionMode(null); setGhiChu(""); }}>Hủy</Btn>
            <Btn size="sm" variant="danger" onClick={() => logMutation.mutate({ hanhDong: "tu_choi", ghiChu })} disabled={!ghiChu.trim() || logMutation.isPending}>
              Xác nhận từ chối
            </Btn>
          </div>
        </div>
      ) : actionMode === "tu_choi_qc" ? (
        // QcTuChoiModal render RIENG (overlay Modal, xem ben duoi return chinh) - o day chi can an
        // het cac nut hanh dong thuong trong luc modal do dang mo.
        null
      ) : actionMode === "tu_choi_simple" ? (
        <div className="space-y-2">
          <div className="font-semibold text-xs">Từ chối — lý do (bắt buộc)</div>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do từ chối (bắt buộc)"
              className="focus-ring flex-1 min-w-[160px] bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <Btn variant="ghost" size="sm" onClick={() => { setActionMode(null); setGhiChu(""); }}>Hủy</Btn>
            <Btn size="sm" variant="danger" onClick={() => logMutation.mutate({ hanhDong: "tu_choi", ghiChu })} disabled={!ghiChu.trim() || logMutation.isPending}>
              Xác nhận từ chối
            </Btn>
          </div>
        </div>
      ) : actionMode === "day_lui" ? (
        <div className="space-y-2">
          <div className="font-semibold text-xs">Đẩy lùi 1 bước — lý do</div>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="VD: xác nhận sai số lượng, cần Kho kiểm lại"
              className="focus-ring flex-1 min-w-[160px] bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <Btn variant="ghost" size="sm" onClick={() => { setActionMode(null); setGhiChu(""); }}>Hủy</Btn>
            <Btn size="sm" onClick={() => layLuiMutation.mutate()} disabled={!ghiChu.trim() || layLuiMutation.isPending}>Xác nhận</Btn>
          </div>
        </div>
      ) : actionMode === "huy" ? (
        <div className="space-y-2">
          <div className="font-semibold text-xs">Hủy đơn trả hàng — lý do (bắt buộc)</div>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do hủy (bắt buộc)"
              className="focus-ring flex-1 min-w-[160px] bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <Btn variant="ghost" size="sm" onClick={() => { setActionMode(null); setGhiChu(""); }}>Đóng</Btn>
            <Btn size="sm" variant="danger" onClick={() => logMutation.mutate({ hanhDong: "huy", ghiChu })} disabled={!ghiChu.trim() || logMutation.isPending}>
              Xác nhận hủy
            </Btn>
          </div>
        </div>
      ) : coTheXuLy || coTheDayLui || coTheHuy ? (
        // Sap xep nut theo dung nhom concept 1 (renderTraHangDrawer(): primary D1-D4 truoc, ghost
        // "Lùi bước" (D5) giua, danger "Từ chối" cuoi cung) - CHI doi THU TU hien thi, dieu kien/
        // handler cua tung nut giu nguyen 100%.
        <div className="flex flex-col items-end gap-2">
          {/* MOI (phan hoi 2026-09-23 "khi duyệt trả hàng cho phép Kế toán, Kho, QC thêm ghi chú nếu
              cần, không bắt buộc") - CHI 3 buoc KT/Kho/QC (loai tru "Cho TN duyet tong" theo dung yeu
              cau, TN giu nguyen hanh vi cu). Tai su dung THANG state `ghiChu` co san (dang RANH khi
              actionMode===null - moi nhanh Huy/actionMode khac deu tu clear ve "" luc bam Huy/Dong nen
              an toan, khong lo dinh gia tri cu). Backend applyTraHangLog() da nhan ghiChu tuy chon cho
              MOI hanh dong (khong rieng tu_choi/huy) tu truoc - chi can gui len, khong can sua BE. */}
          {coTheXuLy && trangThai !== "Cho TN duyet tong" && (
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Ghi chú khi duyệt (không bắt buộc)"
              className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          )}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {coTheXuLy && (
              <Btn
                size="sm"
                onClick={() => logMutation.mutate({ hanhDong: "duyet", ghiChu: trangThai !== "Cho TN duyet tong" ? ghiChu : undefined })}
                disabled={logMutation.isPending}
                loading={logMutation.isPending}
              >
                {navNextId && onNavigate ? "Duyệt và tiếp theo →" : "Duyệt"}
              </Btn>
            )}
            {coTheDayLui && (
              <Btn size="sm" variant="ghost" onClick={() => { setActionMode("day_lui"); setGhiChu(""); }} disabled={logMutation.isPending}>
                Đẩy lùi
              </Btn>
            )}
            {coTheXuLy && (
              <Btn size="sm" variant="danger" onClick={handleTuChoi} disabled={logMutation.isPending}>Từ chối</Btn>
            )}
            {coTheHuy && (
              <Btn size="sm" variant="danger" onClick={() => { setActionMode("huy"); setGhiChu(""); }} disabled={logMutation.isPending}>Hủy</Btn>
            )}
          </div>
        </div>
      ) : null
    ) : null;

  return (
    <>
    <Drawer
      open
      // SUA (ra soat UI/UX 2026-08-28, van de #1: "tên linh kiện tạo thành tiêu đề trên cùng",
      // "sửa chung cho 1 màn rồi áp dụng ra") - khop dung cau truc da doi cho DonHangDetailModal
      // (DonCuaToiTab.tsx): tieu de la ID truoc day, gio la ten LK.
      title={d ? (d.ten_lk_snapshot ?? d.ma_lk) : `Đơn trả hàng ${id}`}
      onClose={onClose}
      footer={footer}
      headerExtra={
        onNavigate && navRows ? (
          <DrawerNavButtons
            hasPrev={!!navPrevId}
            hasNext={!!navNextId}
            onPrev={() => navPrevId && onNavigate(navPrevId)}
            onNext={() => navNextId && onNavigate(navNextId)}
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="text-sm text-[var(--ink-500)] py-4 text-center">Đang tải...</div>
      ) : !d ? null : (
        <div className="text-sm space-y-4">
          {/* SUA (ra soat UI/UX 2026-08-28, "sửa chung cho 1 màn rồi áp dụng ra") - khop dung cau truc
              da doi cho DonHangDetailModal (DonCuaToiTab.tsx): dai "chỉ số nhanh" + DetailZone thay
              cho khoi KvRow/SectionTitle phang truoc day. */}
          <div className="flex items-start gap-4 flex-wrap pb-3 border-b border-[var(--line)]">
            <QuickStat label="SL" value={d.so_luong_de_xuat} />
            <div className="flex-1 min-w-[160px]">
              <div className="text-[10px] uppercase tracking-wide text-[var(--ink-400)] font-bold mb-1">Trạng thái</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <StatusBadge value={trangThai} tones={TRA_HANG_TRANG_THAI_TONE} options={TRA_HANG_TRANG_THAI_OPTIONS} />
                {d.uu_tien === 1 && <PriorityTag />}
              </div>
            </div>
          </div>

          <DetailZone title="Thông tin đơn">
            <KvRow label="Người tạo">{formatNguoiDisplay(d.nguoi_tao, ktvDisplayMap)}</KvRow>
            <KvRow label="Ngày tạo">{fmtDateTime(d.ngay_tao)}</KvRow>
            <KvRow label="Mã LK"><span className="font-mono text-xs">{d.ma_lk}</span></KvRow>
            {d.ghi_chu && <KvRow label="Ghi chú">{d.ghi_chu}</KvRow>}
          </DetailZone>

          {/* Anh tra hang (them 2026-08-24, muc 3: "các ảnh này các vai trò liên quan đến có thể xem
              được") - moi vai tro xem duoc chi tiet don nay deu xem duoc ca 2 nhom anh. */}
          {(() => {
            const anhTaoMoi = (data?.anh ?? []).filter((a) => a.loai === "tao_moi");
            const anhQc = (data?.anh ?? []).filter((a) => a.loai === "qc_tu_choi");
            if (anhTaoMoi.length === 0 && anhQc.length === 0) return null;
            return (
              <DetailZone title="Ảnh">
                {/* FIX (phan hoi QA 2026-08-31, muc #12): truoc day chi hien link chu "📷 Ảnh N" - phai
                    bam moi biet anh chup gi, doi thanh thumbnail xem truoc ngay tai cho, bam vao moi
                    mo anh goc kich thuoc that o tab moi. */}
                {anhTaoMoi.length > 0 && (
                  <KvRow label="Ảnh LK cần trả">
                    <div className="flex gap-1.5 flex-wrap">
                      {anhTaoMoi.map((a) => (
                        <ImageThumb key={a.id} url={a.url} alt="Ảnh linh kiện cần trả" className="w-16 h-16 object-cover rounded-lg border border-[var(--line)] hover:opacity-80 transition-opacity" />
                      ))}
                    </div>
                  </KvRow>
                )}
                {anhQc.length > 0 && (
                  <KvRow label="Ảnh bằng chứng QC">
                    <div className="flex gap-1.5 flex-wrap">
                      {anhQc.map((a) => (
                        <ImageThumb key={a.id} url={a.url} alt="Ảnh bằng chứng QC" className="w-16 h-16 object-cover rounded-lg border border-[var(--line)] hover:opacity-80 transition-opacity" />
                      ))}
                    </div>
                  </KvRow>
                )}
              </DetailZone>
            );
          })()}

          <SectionTitle className="mt-0">Lịch sử xử lý</SectionTitle>
          <Timeline
            items={(data?.logs ?? []).map((l) => ({
              title: (
                <>
                  {trangThaiLabel(TRA_HANG_TRANG_THAI_OPTIONS, l.trang_thai)}
                  <span className="font-normal text-[var(--ink-400)]"> ({l.nguoi_xu_ly})</span>
                  {l.ghi_chu ? ` — ${l.ghi_chu}` : ""}
                </>
              ),
              time: fmtDateTime(l.ngay_xu_ly),
            }))}
          />
        </div>
      )}
    </Drawer>
    {/* FIX (phan hoi 2026-09-23, kem anh chup man hinh: "khi QC từ chối, popup từ chối bị ẩn phía sau
        drawer") - Modal.tsx VA Drawer.tsx deu dung fixed + z-50 KHONG portal, nen khi 2 overlay cung
        z-index la anh em (sibling) trong DOM, ai render SAU thang o tren (thu tu DOM quyet dinh, khong
        phai z-index vi bang nhau). QcTuChoiModal truoc day nam TRUOC <Drawer> trong return (render
        truoc) nen bi chinh Drawer de len tren - doi cho render SAU <Drawer> de no luon o tren cung, KHONG
        dong cham Modal.tsx/Drawer.tsx dung chung ~40 noi khac. */}
    {actionMode === "tu_choi_qc" && (
      <QcTuChoiModal
        donHangId={id}
        onClose={() => setActionMode(null)}
        onConfirm={(ghiChuQc) => logMutation.mutate({ hanhDong: "tu_choi", ghiChu: ghiChuQc })}
        confirmDisabled={logMutation.isPending}
        confirmLoading={logMutation.isPending}
        addToast={addToast}
      />
    )}
    </>
  );
}
