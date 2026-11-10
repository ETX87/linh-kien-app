import { useState, useEffect, useRef, type ReactNode } from "react";
import { HoaDonPhieuBadge, HoaDonPhieuGhiChu, nenHoaDon, coChonHoaDon } from "./KhChuyenKhoan";
import { ChoHangBadge, PhieuChoHangCanhBao } from "./TachChoHang";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, btnClasses } from "../../components/ui/Btn";
import { FileButton } from "../../components/ui/FileButton";
import { Badge } from "../../components/x/Badge";
import { Modal } from "../../components/ui/Modal";
import { Drawer, DrawerNavButtons, useDrawerArrowNav, DRAWER_WIDTH_CHI_TIET } from "../../components/ui/Drawer";
import { Select } from "../../components/ui/Select";
import { PaginatedTable, type Column } from "../../components/ui/PaginatedTable";
import { useColumnConfig } from "../../components/ui/useColumnConfig";
import { ColumnSettingsButton } from "../../components/ui/ColumnHeader";
import { KvRow } from "../../components/ui/KvRow";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { IconChip } from "../../components/ui/IconChip";
import { Timeline } from "../../components/ui/Timeline";
import { api, buildQuery, ApiError } from "../../api/client";
import { anhVuaGioiHan } from "../../lib/imageCompress";
import { exportRowsToExcel } from "../../lib/exportExcel";
import { fmtDateTime, fmtVND } from "../../types";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { pushOverlayClose } from "../../lib/overlayStack";
import type { DonHangRow, PhieuXuatKhoRow, DonHangKhaDungRow, NguoiNhanHangKhaDungRow, LyDoChamRow, KtvDisplayMap } from "./types";
import { TongNgayKtvInfo } from "./TongNgayKtv";
import { PxkDongDonHangTable } from "./PxkDongDonHangTable";
import { KhoXuatBadge, ChuyenKhoXuatCard, MIEN_XUAT_SUA_DUOC, KhuVucPxkBadge, ChuyenKhuVucCard, PXK_TRANG_THAI_DONG } from "./KhoXuat";
// Lien ket 2 chieu voi don goc trong phieu (them 2026-09-21, phan hoi "cho phép click vào dòng đơn
// hàng trong phiếu để mở giao diện UI chi tiết") - tai dung nguyen DonHangDetailModal, dung y het cach
// ThieuLkTab.tsx da lam (xem comment o do ve import vong an toan trong ESM).
import { DonHangDetailModal } from "./DonCuaToiTab";
import { XemAnhNhanh, BangChungAnhPxk, anhXemCuaPxk, type AnhXem } from "./XemAnhNhanh";
import { LoaiChietKhauPicker, LoaiChietKhauText, LoaiChietKhauChip, HoaDonGiaNiemYet, TienDaTraDon, useLoaiChietKhauList, duocDoiLoaiChietKhau, tenLoaiChietKhau } from "./LoaiChietKhau";
import { PXK_TRANG_THAI_TONE, CHUYEN_TIEN_TONE, PXK_TRANG_THAI_OPTIONS, CHUYEN_TIEN_OPTIONS, TRANG_THAI_DOT_TONE, PXK_LOG_ONLY_OPTIONS, PXK_LOG_ONLY_TONE, MIEN_XUAT_LABEL, type MienXuat } from "./constants";
import {
  describeApiError, formatNguoiDisplay, useKtvDisplayMap, ktvOptionLabel, invalidatePipelineCounts,
  trangThaiLabel, LOAI_DON_TONE, laTruCongNo,
  nenKhieuNai,
} from "./helpers";
import { StatusBadge, LoaiDeXuatBadge, ActiveFiltersBar, TrangThaiDropdownFilter, KhuVucChipFilter, ImageLink, LogTieuDe, timelineLogGop, useTenNguoiLog } from "./SharedUi";
import { PxkMiniPipeline } from "./PipelineFlow";
import { BaoNhanThieuModal, NhanThieuCard, nhanThieuPxkQuery } from "./NhanThieu";
import { downloadMisaExport, MISA_TEMPLATE_LABELS, type MisaExportResult, type MisaTemplate } from "../../lib/misaExportTemplates";
import { Money } from "../../components/ui/Money";
import { NguoiTao, NguoiNhan } from "../../components/ui/TenNguoi";
import { useLocCot, LocCotButton, LocCotBar, type LocCotCfg } from "../../components/ui/LocCot";
import { NguoiNhanSide, NutMoSideNguoiNhan, useHienSideNguoiNhan } from "./NguoiNhanSide";
import { MenuTai } from "./MenuTai";
import { NutKtDuyetNhanh, ThanhDuyetNhanhPxk, type PxkDuyetNhanh } from "./DuyetNhanhPxk";
import { BangChungAnhList, BangChungChuyenTienForm, docAnhBangChung, DuyetChuyenTienForm, LichSuKhoanChuyen, RutLaiBangChungButton, TienPhieuVaQuy, TienBiBotCanhBao, TuChoiChuyenTienButton, type KhoanChuyenTien } from "./BangChungChuyenTien";
import { doiNguoiThanhTen, formatPersonDisplay, usePersonDirectory } from "../../lib/personDisplay";
import { t } from "../../i18n";
import { LocNgayTao, chipNgayTao } from "./LocNgayTao";
import { baoLoiTaiAnh, canhBaoHanMucAnh, type HanMucAnh } from "../../lib/hanMucAnh";

const MISA_TEMPLATE_ORDER: MisaTemplate[] = ["xuat_kho", "chuyen_kho", "ban_hang"];

// O loc dong don kha dung (modal tao PXK + "Thêm đơn") - q da lowercase + NFC. Khop mã LK, tên LK, mã đơn,
// Mã YCSC, Mã Lada (2026-09-30).
function khopDongKhaDung(r: DonHangKhaDungRow, q: string): boolean {
  if (!q) return true;
  return [r.ma_lk, r.ten_lk_snapshot, r.id, r.ma_yeu_cau_su_co, r.ma_lada].some((v) => (v ?? "").toLowerCase().normalize("NFC").includes(q));
}

// Canh bao KTV thieu ma_misa/ten_misa (them 2026-09-04, xem giai thich o backend/src/lib/misaExport.ts
// MisaExportResult) - hien 1 toast RIENG (khong chan file .xlsx da tai, chi canh bao them) liet ke toi
// da vai KTV dau tien tranh toast qua dai.
// + dong "TRỪ CÔNG NỢ" bi bo khoi file Chuyen kho (2026-09-30): hang da o kho KTV, KTV tra tien giam cong no -> chi
// hach toan bang "MISA Bán hàng" (tru kho KTV). `ok` = da tai duoc file.
// "Loại phiếu" (2026-09-30) - badge loai de xuat cua cac dong trong phieu (loai_phieu = JSON mang tu GET /phieu-xuat-kho).
function LoaiPhieu({ r }: { r: PhieuXuatKhoRow }) {
  let ds: string[] = [];
  try {
    ds = r.loai_phieu ? (JSON.parse(r.loai_phieu) as string[]) : [];
  } catch {
    ds = [];
  }
  if (!ds.length) return <span className="text-[var(--ink-400)]">—</span>;
  return (
    <span className="inline-flex shrink-0 gap-1">
      {ds.map((l) => <LoaiDeXuatBadge key={l} loaiDon={r.loai_don} loaiDeXuat={l} />)}
    </span>
  );
}

function toastKetQuaMisa(result: MisaExportResult, ok: boolean, addToast: (msg: string) => void) {
  const boQua = result.boQuaTruCongNo ?? [];
  if (boQua.length > 0) {
    const phieu = [...new Set(boQua.map((b) => b.so_phieu))];
    addToast(
      t("⚠ Bỏ {a} dòng TRỪ CÔNG NỢ khỏi file Chuyển kho (phiếu {b}{c}) — dòng TRỪ CÔNG NỢ trừ kho KTV, tải bằng nút \"MISA Bán hàng\"", { a: boQua.length, b: phieu.slice(0, 5).join(", "), c: phieu.length > 5 ? "…" : "" }),
    );
  } else if (!ok) addToast(t("Không có dòng nào để xuất"));
  if (ok) toastCanhBaoThieuMisa(result, addToast);
}

function toastCanhBaoThieuMisa(result: MisaExportResult, addToast: (msg: string) => void) {
  if (result.canhBaoThieuMisa.length === 0) return;
  const ten = result.canhBaoThieuMisa.slice(0, 5).map((w) => w.ten_hien_thi || w.ma_ktv).join(", ");
  const more = result.canhBaoThieuMisa.length > 5 ? t(" và {a} người khác", { a: result.canhBaoThieuMisa.length - 5 }) : "";
  addToast(t("⚠ {a} KTV thiếu Mã MISA/Tên MISA (file thiếu dữ liệu): {b}{c}", { a: result.canhBaoThieuMisa.length, b: ten, c: more }));
}

// ---------- Tab "Phieu xuat kho" (TN/Ke toan/Kho) ----------
// "Chuyen tien" (thay phieu_so_tien cu) la dieu kien chan rieng tren chinh PXK, khong con tab/bang
// rieng - xem chi tiet trong PxkDetailModal.

export function PhieuXuatKhoTab({
  addToast, qc, canTacNghiep, canKho, canKeToan, canDownloadMisa, currentEmail, isAdmin, initialFilterOverride, initialNguoiNhanHangOverride, initialLoaiDonOverride,
  initialDetailIdOverride, onDetailIdConsumed, onJumpConsumed,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean; canKho: boolean; canKeToan: boolean;
  // CHOT (phan hoi nguoi dung: "bỏ quyền tải file form misa" cho KTV/Trạm/CTV/Vệ tinh) - MISA la form
  // ke toan noi bo, an het nut tai o ca toolbar danh sach lan Drawer chi tiet khi false. Backend gate
  // tuong ung: canDownloadMisa() trong phieuXuatKho.ts.
  canDownloadMisa: boolean;
  currentEmail: string; isAdmin: boolean;
  initialFilterOverride?: string; initialNguoiNhanHangOverride?: string;
  // Them (migration 0002_tra_hang_pxk.sql) - dat truoc sub-tab loai_don khi bam vao 1 trong 3 buoc
  // PXK tra hang tren pipeline (xem loaiDonFor trong DatMuaLinhKienModule.tsx).
  initialLoaiDonOverride?: string;
  // Mo THANG Drawer chi tiet 1 PXK (them 2026-09-05, thong bao "viec moi" link_type='phieu_xuat_kho')
  // - cung pattern voi DonCuaToiTab.initialDetailIdOverride (xem openDetailIdFor trong
  // DatMuaLinhKienModule.tsx).
  initialDetailIdOverride?: string;
  // FIX (phan hoi 2026-09-05, giong het DonCuaToiTab.tsx) - bao cho cha da doc/ap dung xong de cha xoa
  // dung 1 lan, khong con dung timer mu.
  onDetailIdConsumed?: () => void;
  // FIX (phan hoi 2026-09-24: "click vào việc cần làm/starbar thường phải click 2 lần" - xem giai thich
  // day du o jumpTarget/consumeJumpTarget trong DatMuaLinhKienModule.tsx) - cung co che "tu tieu thu"
  // nhu onDetailIdConsumed o tren, ap dung cho initialFilterOverride/initialLoaiDonOverride/
  // initialNguoiNhanHangOverride thay vi timer mu.
  onJumpConsumed?: () => void;
}) {
  // Trang thai "cho xu ly" theo dung buoc cua vai tro dang xem (them 2026-09-09, phan hoi "thêm 1 nút
  // ấn nhanh 'Đơn chờ xử lý'") - tach ham rieng de dung LAI o ca 3 noi: gia tri mac dinh luc mo tab
  // (savedFilterTrangThai ben duoi), luc tao xong 1 PXK moi (xem createMutation.onSuccess), va nut bam
  // nhanh "Đơn chờ xử lý" trong FilterSearchBar - tranh 3 noi tu tinh rieng roi lech nhau.
  function pendingTrangThaiForRole(): string {
    return canKeToan ? "Cho ke toan" : canKho ? "Da chot xong don xuat" : canTacNghiep ? "Dang tao phieu" : "";
  }
  // FIX (2026-08-31, phan hoi "Phiếu xuất kho (x2) nhưng ấn vào lại...hiện 3 đơn (1 đơn đang chờ kế
  // toán)"): truoc day TN mac dinh giu "Tat ca" (y dinh ban dau: theo doi xuyen suot vong doi PXK minh
  // tao), nhung badge mo-count cho TN chi dem trang_thai "Dang tao phieu" (buoc TN thuc su can xu ly
  // tiep, xem GET /phieu-xuat-kho/mo-count) nen mac dinh "Tat ca" gay lech y het bug da sua o
  // DonCuaToiTab.tsx/TraHangTab.tsx - doi TN sang mac dinh dung buoc cua minh cho khop badge.
  // FIX (ra soat bug mua hang 2026-08-26, BUG-002): tach lop luu-lau-dai khoi lop hien-thi/query,
  // xem giai thich day du o DonCuaToiTab.tsx. Doi key -v2 (2026-08-31) de reset gia tri "Tat ca" cu.
  const [savedFilterTrangThai, setSavedFilterTrangThai] = useLocalStorageState(
    "filters:dmlk-pxk-tt-v2",
    pendingTrangThaiForRole(),
  );
  // FIX (phan hoi 2026-08-28: "click vào Chờ tiền (x1) => danh sách trống, quay lại bấm lại => hiện 1
  // đơn") - khoi tao TRUC TIEP tu initialFilterOverride khi co (thay vi luon khoi tao tu
  // savedFilterTrangThai roi doi lai qua effect o duoi): truoc day lan render DAU TIEN van fetch voi
  // filter CU (sai) truoc khi effect kip sua, tao 1 cache React Query rong/sai cho key do - nguoi dung
  // thay "trong" ngay lan bam dau, chi tu sua khi bam lai (lan nay key dung da duoc cache tu request
  // nen tro lai) chu khong sua ngay lap tuc trong lan xem dau.
  const [filterTrangThai, setFilterTrangThaiDisplay] = useState(initialFilterOverride ?? savedFilterTrangThai);
  function setFilterTrangThai(v: string) {
    setFilterTrangThaiDisplay(v);
    setSavedFilterTrangThai(v);
  }
  useEffect(() => {
    if (initialFilterOverride !== undefined) { setFilterTrangThaiDisplay(initialFilterOverride); onJumpConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilterOverride]);
  // Loc theo "Nguoi nhan hang" (KTV) - them cung dot voi chot nghiep vu "1 PXK = 1 KTV" (migration
  // 0074), phuc vu drill-down tu tab "Bao cao" (nhay toi dung KTV + trang thai).
  const [filterNguoiNhanHang, setFilterNguoiNhanHang] = useState(initialNguoiNhanHangOverride ?? "");
  useEffect(() => {
    if (initialNguoiNhanHangOverride !== undefined) { setFilterNguoiNhanHang(initialNguoiNhanHangOverride); onJumpConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNguoiNhanHangOverride]);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Dong PXK dang xo xuong (2026-09-29) - bam dong phieu = mo/thu cac dong don con ben duoi; bam ID phieu mo Drawer.
  const [moRongPxk, setMoRongPxk] = useState<Set<string>>(new Set());
  function toggleMoRong(pxkId: string) {
    setMoRongPxk((s) => {
      const n = new Set(s);
      if (n.has(pxkId)) n.delete(pxkId);
      else n.add(pxkId);
      return n;
    });
  }
  useEffect(() => {
    if (initialDetailIdOverride) setDetailId(initialDetailIdOverride);
  }, [initialDetailIdOverride]);
  const [showCreate, setShowCreate] = useState(false);
  const isMobile = useIsMobile();
  const [createData, setCreateData] = useState({ ghi_chu: "", ma_xuat_kho: "" });
  const [chonKtv, setChonKtv] = useState("");
  const [chonLoaiDon, setChonLoaiDon] = useState<"mua" | "cong_no" | "tra_hang">("mua");
  const [selectedDonHang, setSelectedDonHang] = useState<Set<string>>(new Set());
  const [timKiemDonHang, setTimKiemDonHang] = useState("");
  const [page, setPage] = useState(1);
  // Sub-tab "Mua hang | Cong no | Tra hang" (dot 3 gop y #8: TN khong bao gio gop 2 mang de xuat nay
  // trong cung 1 PXK; them "Tra hang" CHOT vong 7 khi bo tab "Don tra hang" rieng khoi menu - luc do
  // tra hang da qua buoc "TN duyet tong" nen co PXK that voi loai_don='tra_hang', GET /phieu-xuat-kho
  // da ho tro loc loai_don nay san, khong can sua backend) - danh sach chinh loc theo dung loai dang
  // xem, mac dinh "Mua hang".
  // "" (them 2026-09-11, muc menu StageMenu giai doan hoa) = "Tất cả" - cac trang thai PXK nhu "Hàng
  // trừ kho"/"Kho đã kết thúc"/... khong gan voi 1 loai_don cu the nao trong tam thuc nguoi dung (menu
  // muon 1 lan bam thay HET, khong bat chon lai Mua hang/Cong no/Tra hang truoc). Backend GET
  // /phieu-xuat-kho da san sang (loai_don la optional filter, xem routes/phieuXuatKho.ts).
  const [xemLoaiDon, setXemLoaiDon] = useState<"mua" | "cong_no" | "tra_hang" | "">(
    initialLoaiDonOverride === "mua" || initialLoaiDonOverride === "cong_no" || initialLoaiDonOverride === "tra_hang" || initialLoaiDonOverride === ""
      ? initialLoaiDonOverride
      : "mua",
  );
  useEffect(() => {
    if (initialLoaiDonOverride === "mua" || initialLoaiDonOverride === "cong_no" || initialLoaiDonOverride === "tra_hang" || initialLoaiDonOverride === "") {
      setXemLoaiDon(initialLoaiDonOverride);
      onJumpConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoaiDonOverride]);
  // Them 2026-08-21 (dong bo giao dien voi Mua hang/Cong no - "hợp nhất phong cách giao diện"): o
  // tim kiem tu do + nut thu gon "☰ Bộ lọc ▾".
  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  // Loc ngay tao phieu (Thang tao / Tu ngay - Den ngay, 2026-11-09 - LocNgayTao.tsx).
  const [filterTuNgay, setFilterTuNgay] = useState("");
  const [filterDenNgay, setFilterDenNgay] = useState("");
  const datNgayTao = (a: string, b: string) => { setFilterTuNgay(a); setFilterDenNgay(b); };
  // Tim kiem tren "Tổng"/"Còn tồn" (2026-10-03, "cho phép tìm kiếm theo tổng"): co tu khoa thi tim TREN MOI trang thai (ke ca
  // don/phieu da xong/da huy - tim theo ma don hang/ma xuat thuong la phieu cu); chon 1 trang thai cu the thi van tim trong do.
  const trangThaiGui = debouncedQ.trim() && filterTrangThai === "__OPEN__" ? "" : filterTrangThai;
  useEffect(() => {
    const hen = setTimeout(() => setDebouncedQ(filterQ.trim()), 500);
    return () => clearTimeout(hen);
  }, [filterQ]);
  const [showFilters, setShowFilters] = useState(false);
  // Bo loc Khu vuc (them 2026-08-31, dong bo voi DonCuaToiTab.tsx - xem CLAUDE.md muc kiem tra toan
  // he thong "check lại toàn bộ hệ thống đã bổ sung filter mặc định theo khu vực cho các vai trò
  // chưa?"). showKhuVucFilter khong co isGiamSat (khong nhan prop nay - GS khong dung tab PXK).
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

  // Loc cot kieu Excel (phan hoi 2026-09-28) - loc/sap xep o server (PXK_COT_LOC, phieuXuatKho.ts).
  const locCot = useLocCot();
  // Side phu "Người nhận hàng" (desktop, v1.436) - giong danh sach Don hang (NguoiNhanSide.tsx).
  const [hienSideNguoiNhan, setHienSideNguoiNhan] = useHienSideNguoiNhan("pxk-side-nguoi-nhan");

  // GD4 (phan hoi Codex #16): ve trang 1 moi khi bo loc doi - tranh dung o 1 trang qua so trang moi.
  useEffect(() => {
    setPage(1);
    setChonPxk(new Map());
    setDangChonTatCa(false);
  }, [filterTrangThai, filterNguoiNhanHang, xemLoaiDon, debouncedQ, khuVucParam, filterTuNgay, filterDenNgay, locCot.queryParams.cf, locCot.queryParams.cs, locCot.queryParams.cd]);
  // Chon nhieu phieu -> Ke toan duyet nhanh hang loat (v1.441, DuyetNhanhPxk.tsx). Giu ca dong (can trang thai / ma) de chay khong goi lai.
  const [chonPxk, setChonPxk] = useState<Map<string, PxkDuyetNhanh>>(new Map());
  const [dangChonTatCa, setDangChonTatCa] = useState(false);
  const coChonPxk = canKeToan;
  const batChonPxk = (r: PhieuXuatKhoRow) =>
    setChonPxk((m) => { const n = new Map(m); if (n.has(r.id)) n.delete(r.id); else n.set(r.id, r); return n; });

  // GD4 (phan hoi Codex #17): phan trang server-side that su - truoc day tai TOAN BO dong khop bo loc
  // roi tu slice o client.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-pxk", filterTrangThai, filterNguoiNhanHang, xemLoaiDon, debouncedQ, khuVucParam, filterTuNgay, filterDenNgay, locCot.queryParams, page],
    queryFn: () =>
      api.get<{ rows: PhieuXuatKhoRow[]; total: number }>(
        "/phieu-xuat-kho" +
          buildQuery({
            trang_thai: trangThaiGui || undefined,
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            loai_don: xemLoaiDon,
            q: debouncedQ || undefined,
            khu_vuc: khuVucParam || undefined,
            tu_ngay: filterTuNgay || undefined,
            den_ngay: filterDenNgay || undefined,
            ...locCot.queryParams,
            page,
            pageSize: 20,
          }),
      ),
  });

  // "Tải danh sách chi tiết" (them 2026-09-13) - mirror handleDownloadFullList() cua UsersModule.tsx,
  // goi lai GET /phieu-xuat-kho VOI CUNG bo loc dang xem nhung KHONG truyen page (BE tra HET).
  const personDir = usePersonDirectory(); // ten nguoi trong file tai ve (2026-09-29)
  const [downloadingFull, setDownloadingFull] = useState(false);
  // MOI phieu theo bo loc dang xem (khong phan trang) - dung chung cho "Tải chi tiết phiếu" + "Tải chi tiết đơn".
  const taiPhieuTheoBoLoc = () =>
    api.get<{ rows: PhieuXuatKhoRow[] }>(
      "/phieu-xuat-kho" +
        buildQuery({
          trang_thai: trangThaiGui || undefined,
          nguoi_nhan_hang: filterNguoiNhanHang || undefined,
          loai_don: xemLoaiDon,
          q: debouncedQ || undefined,
          khu_vuc: khuVucParam || undefined,
          tu_ngay: filterTuNgay || undefined,
          den_ngay: filterDenNgay || undefined,
          ...locCot.queryParams,
        }),
    );
  async function handleDownloadFullList() {
    setDownloadingFull(true);
    try {
      const res = await taiPhieuTheoBoLoc();
      // Cot chuyen tien dat DAU file (2026-09-29, quy du KTV): Ma HD, nguoi chuyen, can/thuc chuyen, quy, link anh.
      // 4 cot chi dung cho "Xem ảnh nhanh" (XemAnhNhanh.tsx) - bo khoi file.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const rows = res.rows.map(({ bang_chung_chuyen_tien_anh, bang_chung_chuyen_tien_url, da_thanh_toan, tien_thuc_chuyen, bang_chung_tien_doc, bang_chung_chuyen_tien_ghi_chu, ly_do_tu_choi_chuyen_tien, ngay_ktv_chuyen, anh_da_ghi_nhan, mien_xuat, mien_xuat_hieu_luc, ...r }) => {
        const tong = r.so_tien_can_chuyen ?? 0;
        const daTra = da_thanh_toan ?? 0;
        const thucChuyen = tien_thuc_chuyen ?? 0;
        const anh = docAnhBangChung({ bang_chung_chuyen_tien_anh, bang_chung_chuyen_tien_url });
        return {
          "Mã HĐ": r.ma_xuat_kho,
          "Người chuyển tiền": r.nguoi_nhan_hang ? formatPersonDisplay(r.nguoi_nhan_hang, personDir) : "",
          "Tiền cần chuyển": r.so_tien_can_chuyen,
          "Tiền thực chuyển": thucChuyen,
          "Đã dùng quỹ": Math.max(0, daTra - thucChuyen),
          "Dư vào quỹ": Math.max(0, thucChuyen - daTra),
          "Còn phải chuyển": Math.max(0, tong - daTra),
          ...Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`Ảnh chuyển tiền ${i + 1}`, anh[i] ?? ""])),
          "Kho xuất": mien_xuat_hieu_luc ? MIEN_XUAT_LABEL[mien_xuat_hieu_luc] + (mien_xuat ? " (đã chuyển)" : "") : "",
          ...r,
        };
      });
      await exportRowsToExcel(doiNguoiThanhTen(rows, personDir), "phieu_xuat_kho_chi_tiet.xlsx", "PXK", undefined, {
        linkFields: [0, 1, 2, 3, 4].map((i) => `Ảnh chuyển tiền ${i + 1}`),
      });
    } catch (err) {
      addToast(t("Không tải được danh sách chi tiết: ") + describeApiError(err));
    } finally {
      setDownloadingFull(false);
    }
  }

  // "Tải chi tiết đơn" (2026-10-19, "tải tất cả danh sách đơn bên trong các phiếu đang xem - format theo format tải đơn"): lay
  // cac phieu theo bo loc dang xem roi tai don cua chung qua GET /dat-mua-lk/don-hang?pxk_ids= (CUNG endpoint + dinh dang file voi
  // nut tai o danh sach Don hang / trong chi tiet PXK), chia lo 100 phieu cho URL khong qua dai, bo trung don.
  const [dangTaiDon, setDangTaiDon] = useState(false);
  async function taiChiTietDon() {
    setDangTaiDon(true);
    try {
      const ids = (await taiPhieuTheoBoLoc()).rows.map((r) => r.id);
      if (ids.length === 0) {
        addToast(t("Không có phiếu nào trong danh sách đang xem"));
        return;
      }
      const don: DonHangRow[] = [];
      const daCo = new Set<string>();
      for (let i = 0; i < ids.length; i += 100) {
        const res = await api.get<{ rows: DonHangRow[] }>(
          "/dat-mua-lk/don-hang" + buildQuery({ pxk_ids: JSON.stringify(ids.slice(i, i + 100)), loai_don: "all" }),
        );
        for (const r of res.rows) if (!daCo.has(r.id)) { daCo.add(r.id); don.push(r); }
      }
      await exportRowsToExcel(doiNguoiThanhTen(don, personDir), "don_hang_trong_phieu.xlsx", "Đơn hàng");
      addToast(t("Đã tải {n} đơn của {m} phiếu", { n: don.length, m: ids.length }));
    } catch (err) {
      addToast(t("Không tải được danh sách chi tiết: ") + describeApiError(err));
    } finally {
      setDangTaiDon(false);
    }
  }

  // So "(N)" canh moi trang thai trong TrangThaiDropdownFilter (them 2026-09-01) - dem TINH theo dung
  // sub-tab loai_don dang mo (xemLoaiDon LUON co gia tri o tab nay, khac DonCuaToiTab), bo qua cac bo
  // loc phu khac (nguoi_nhan_hang/khu_vuc/q) - xem GET /phieu-xuat-kho/status-counts.
  const { data: statusCountsData } = useQuery({
    queryKey: ["dat-mua-lk-pxk-status-counts", xemLoaiDon],
    queryFn: () => api.get<{ counts: Record<string, number> }>("/phieu-xuat-kho/status-counts" + buildQuery({ loai_don: xemLoaiDon })),
  });

  // So luong "can xu ly" theo tung loai_don, hien canh nhan cua 3 nut sub-tab (CHOT vong 7: "Nút
  // filter 'Mua hàng' 'Công nợ' sẽ hiện thị số lượng cần xử lý"). pageSize lon (khong phai 20 nhu danh
  // sach chinh) vi day la truy van rieng chi de DEM theo loai_don, can thay het dong khop bo loc.
  // FIX (phan hoi 2026-09-24, kem anh chup "công nợ báo (x1) nhưng ấn vào không có dòng nào") - truoc
  // day query nay KHONG BAO GIO truyen trang_thai (chu dinh "so on dinh, khong doi theo bo loc trang
  // thai tam thoi dang xem" - dung khi xem "Tất cả"/"Còn tồn", vi luc do khong huong toi 1 buoc cu the
  // nao). Nhung khi filterTrangThai DANG la 1 gia tri CU THE (vd nhay tu StageMenu "Đã chốt xong đơn
  // xuất"), so canh sub-tab van dem TONG CA 4 trang thai mo, lech voi danh sach chinh (chi hien DUNG 1
  // trang thai dang loc) - bam vao sub-tab bao "(x1)" nhung ra 0 dong. Theo xac nhan nguoi dung ("Đếm
  // theo đúng bước đang lọc"): khi filterTrangThai cu the, truyen THANG vao query de dem dung trong
  // buoc do (khop 100% voi danh sach se hien ra); chi giu "tong 4 trang thai mo" (khong doi theo bo loc)
  // khi dang xem "Tất cả" ("")/"Còn tồn" ("__OPEN__") - 2 gia tri KHONG huong toi 1 buoc cu the.
  const isSpecificTrangThai = filterTrangThai !== "" && filterTrangThai !== "__OPEN__";
  const { data: pxkCountsData } = useQuery({
    queryKey: ["dat-mua-lk-pxk-loai-counts", filterNguoiNhanHang, khuVucParam, isSpecificTrangThai ? filterTrangThai : ""],
    queryFn: () =>
      api.get<{ rows: PhieuXuatKhoRow[] }>(
        "/phieu-xuat-kho" +
          buildQuery({
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            khu_vuc: khuVucParam || undefined,
            trang_thai: isSpecificTrangThai ? filterTrangThai : undefined,
            page: 1,
            pageSize: 1000,
          }),
      ),
  });
  const PXK_OPEN_STATES = new Set(["Dang tao phieu", "Cho ke toan", "Da chot xong don xuat", "Dang gui KTV"]);
  const loaiDonCounts: Record<"mua" | "cong_no" | "tra_hang", number> = { mua: 0, cong_no: 0, tra_hang: 0 };
  for (const r of pxkCountsData?.rows ?? []) {
    if (r.loai_don && (isSpecificTrangThai || PXK_OPEN_STATES.has(r.trang_thai))) loaiDonCounts[r.loai_don]++;
  }

  // Danh sach dong "TN da duyet" + chua gan PXK nao - nguon picker chon dong (CHOT 2026-08-14: thay
  // o nhap tay ID tu do, xem comment GET /phieu-xuat-kho/don-hang-kha-dung backend). Loc san theo
  // chonLoaiDon (dot 3 gop y #8) - doi Loai phieu se lam lai truy van.
  // LUON tai moi khi mo modal (2026-09-29): truoc day staleTime mac dinh 2 phut -> mo lai modal dung ban cu, don da bi
  // huy/tu choi/gom vao phieu khac (ke ca do nguoi khac/tu dong) van hien KTV trong dropdown cho toi khi F5. Nut mo modal
  // XOA cache danh sach (moModal) -> dropdown "Đang tải" cho toi khi co ban moi, khong bao gio hien ban cu.
  function moModalTaoPxk() {
    qc.removeQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung"] });
    qc.removeQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung-counts"] });
    setChonLoaiDon(xemLoaiDon || "mua");
    setShowCreate(true);
  }
  // Don kha dung chi theo DUNG bo loc dang chon o danh sach ben ngoai (2026-09-29): chip Khu vuc + loc Nguoi nhan hang +
  // loc cot Excel cua 2 cot Khu vuc/Nguoi nhan hang (backend khaDungLocNgoai() o phieuXuatKho.ts).
  const cfKhaDung = (() => {
    const o: Record<string, { v: string[]; not?: boolean }> = {};
    for (const k of ["khu_vuc", "nguoi_nhan_hang"]) if (locCot.loc[k]) o[k] = locCot.loc[k];
    return Object.keys(o).length ? JSON.stringify(o) : undefined;
  })();
  const locNgoaiKhaDung = { khu_vuc: khuVucParam || undefined, nguoi_nhan_hang: filterNguoiNhanHang || undefined, cf: cfKhaDung };
  const { data: khaDungData, isLoading: khaDungLoading } = useQuery({
    queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung", chonLoaiDon, locNgoaiKhaDung],
    queryFn: () => api.get<{ rows: DonHangKhaDungRow[] }>("/phieu-xuat-kho/don-hang-kha-dung" + buildQuery({ loai_don: chonLoaiDon, ...locNgoaiKhaDung })),
    enabled: showCreate,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: showCreate ? 60_000 : false,
  });
  // So dong kha dung THEO tung loai_don (phan hoi QA 2026-08-31, muc #8) - hien "(x123)" canh 3 nut
  // chon Loai phieu de TN biet truoc co bao nhieu KTV dang cho len PXK o moi loai, khong phai bam thu
  // tung nut moi biet co dong hay khong.
  const { data: khaDungCountsData } = useQuery({
    queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung-counts", locNgoaiKhaDung],
    queryFn: () => api.get<{ counts: Record<"mua" | "cong_no" | "tra_hang", number> }>("/phieu-xuat-kho/don-hang-kha-dung-counts" + buildQuery(locNgoaiKhaDung)),
    enabled: showCreate,
  });
  const khaDungCounts = khaDungCountsData?.counts ?? { mua: 0, cong_no: 0, tra_hang: 0 };

  // Danh sach KTV co ten hien thi dep, dung cho ca bo loc VA buoc "chon KTV" bat buoc luc tao PXK
  // (chot nghiep vu 2026-08-15: 1 PXK chi gan cho 1 KTV) - tai dung dung endpoint DonCuaToiTab da
  // dung. Backend da mo quyen xem cho moi vai tro (Dot 3 gop y #7) nen bo "enabled: canTacNghiep" -
  // Kho/Ke toan cung can tra cuu ten khi doi email -> ten trong bang/chi tiet PXK.
  const { data: nguoiNhanHangData } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: NguoiNhanHangKhaDungRow[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
  });
  const ktvDisplayMap: KtvDisplayMap = new Map((nguoiNhanHangData?.rows ?? []).map((r) => [r.email_dang_nhap, { ma_ktv: r.ma_ktv, ten_hien_thi: r.ten_hien_thi }]));
  function labelKtv(email: string): string {
    return formatNguoiDisplay(email, ktvDisplayMap);
  }
  // "Xem ảnh nhanh" (2026-09-30, XemAnhNhanh.tsx) cot Bang chung: chuyen anh chay xuyen MOI phieu tren trang dang xem.
  const [xemAnhPxk, setXemAnhPxk] = useState<number | null>(null);
  const anhPxkDs: AnhXem[] = [];
  const batDauAnhPxk = new Map<string, number>();
  for (const r of data?.rows ?? []) {
    batDauAnhPxk.set(r.id, anhPxkDs.length);
    anhPxkDs.push(...anhXemCuaPxk(r, (e) => (e ? labelKtv(e) : "")));
  }

  // .normalize("NFC") - xem giai thich day du o components/ui/Select.tsx (cung fix, cung ngay).
  const q = timKiemDonHang.trim().toLowerCase().normalize("NFC");
  // Chi hien dong cua KTV DA CHON (chot nghiep vu 1 PXK = 1 KTV) - rong neu chua chon KTV.
  const donHangLoc = chonKtv
    ? (khaDungData?.rows ?? []).filter(
        (r) =>
          r.nguoi_nhan_hang === chonKtv &&
          khopDongKhaDung(r, q),
      )
    : [];
  // Danh sach KTV thuc su co dong kha dung (de dung lam options Select "Chon KTV") - chi liet ke
  // KTV dang co dong cho tao PXK, tranh chon xong roi thay danh sach rong.
  const ktvKhaDung = [...new Set((khaDungData?.rows ?? []).map((r) => r.nguoi_nhan_hang).filter((x): x is string => !!x))];
  // KTV dang chon khong con dong kha dung sau khi tai lai -> bo chon (tranh tao phieu cho KTV khong con don).
  const ktvKhaDungKey = ktvKhaDung.join("|");
  useEffect(() => {
    if (khaDungData && chonKtv && !ktvKhaDungKey.split("|").includes(chonKtv)) {
      setChonKtv("");
      setSelectedDonHang(new Set());
    }
  }, [khaDungData, chonKtv, ktvKhaDungKey]);
  // Tong tien cac dong DA CHON (them 2026-08-26: "1 nút ấn tự điền tiền ước tính... = số tiền tổng
  // theo danh sách đã chọn") - tach thanh bien dung chung, truoc day chi tinh INLINE 1 lan de HIEN THI
  // o dong "Đã chọn N" (xem JSX ben duoi), gio dung lai CHINH XAC con so nay de tu dien vao o "Số tiền
  // cần KTV chuyển" qua 1 nut bam, tranh 2 noi tinh lai co the lech nhau.
  const selectedDonHangKey = [...selectedDonHang].sort().join(",");
  const { data: goiYSoTienData } = useQuery({
    queryKey: ["pxk-goi-y-so-tien", selectedDonHangKey],
    queryFn: () =>
      api.get<{ goi_y: number; dong?: { id: string; tien_uoc_tinh: number | null; ma_chiet_khau: string | null }[] }>(
        "/phieu-xuat-kho/goi-y-so-tien?ids=" + encodeURIComponent(selectedDonHangKey),
      ),
    enabled: showCreate && selectedDonHang.size > 0,
  });
  // Tien can chuyen do backend tinh (cung ham voi luc luu) - null = dang tinh. Tra hang khong co tien;
  // cong no chi tinh dong "TRỪ CÔNG NỢ" (backend tu xu ly).
  const tongTienTaoPxk: number | null = chonLoaiDon === "tra_hang" ? 0 : (goiYSoTienData?.goi_y ?? null);
  const fmtTongTaoPxk = tongTienTaoPxk == null ? t("Đang tính…") : fmtVND(tongTienTaoPxk);
  // Tien uoc tinh + loai chiet khau DU KIEN tung dong DA CHON (backend tinh theo CA tap dang chon - nguong
  // 200k/500k phu thuoc tong nen dong chua chon khong co so rieng). Bang chon dong (2026-09-28) hien giong
  // "Dòng đơn hàng" cua PXK da tao.
  const goiYTheoDong = new Map((goiYSoTienData?.dong ?? []).map((x) => [x.id, x]));
  const { data: loaiChietKhauList } = useLoaiChietKhauList();
  const [suaTienTaoId, setSuaTienTaoId] = useState<string | null>(null);

  function toggleDonHang(id: string) {
    setSelectedDonHang((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleChonTatCaLoc() {
    setSelectedDonHang((s) => {
      const idsLoc = donHangLoc.map((r) => r.id);
      const daChonHet = idsLoc.length > 0 && idsLoc.every((id) => s.has(id));
      const next = new Set(s);
      if (daChonHet) idsLoc.forEach((id) => next.delete(id));
      else idsLoc.forEach((id) => next.add(id));
      return next;
    });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/phieu-xuat-kho", {
        ghi_chu: createData.ghi_chu.trim() || undefined,
        // FIX (phan hoi 2026-09-09: "bổ sung thêm 1 cột mã đơn hàng nhập cùng lúc với PXK") - truoc
        // day form tao PXK khong co o nhap "Mã đơn hàng" du backend da ho tro tuy chon truong nay
        // tu Dot 2 (xem comment POST /phieu-xuat-kho o backend) - TN buoc phai tao PXK truoc, roi
        // quay lai Drawer nhap rieng qua PATCH /:id/ma-xuat-kho. Them o nhap ngay tai day de nhap
        // 1 lan, cung luc voi cac truong con lai (khi da biet ma tu luc tao, khong can round-trip).
        ma_xuat_kho: createData.ma_xuat_kho.trim() || undefined,
        dat_don_hang_ids: [...selectedDonHang],
        nguoi_nhan_hang: chonKtv,
        loai_don: chonLoaiDon,
      }),
    onSuccess: (res) => {
      addToast(t("Đã tạo phiếu xuất kho {a}", { a: res.id }));
      setShowCreate(false);
      setCreateData({ ghi_chu: "", ma_xuat_kho: "" });
      setSelectedDonHang(new Set());
      setTimKiemDonHang("");
      setChonKtv("");
      // FIX (phan hoi 2026-09-09: "tạo xong pxk, danh sách filter lại không hiện phiếu vừa tạo gây khó
      // khăn chọn người thao tác") - PXK vua tao luon nam o sub-tab loai_don + trang thai dung buoc cua
      // nguoi tao (TN, nguoi duy nhat thay nut "+ Tạo phiếu xuất kho"), chuyen THANG bo loc danh sach
      // sang do + xoa cac bo loc phu (nguoi nhan hang/tim kiem) co the dang che khuat dong vua tao,
      // thay vi bat nguoi dung tu di doi trang thai/sub-tab de tim lai chinh dong minh vua tao.
      setXemLoaiDon(chonLoaiDon);
      setFilterTrangThai(pendingTrangThaiForRole());
      setFilterNguoiNhanHang("");
      setFilterQ("");
      setChonLoaiDon("mua");
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung-counts"] });
      invalidatePipelineCounts(qc);
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  // Tai gop file MISA cho TOAN BO PXK dang khop bo loc hien tai cua thẻ nay (them 2026-09-02) - dung
  // LAI dung whereSql cua GET / (sub-tab loai_don + trang thai + nguoi nhan hang + khu vuc + tim
  // kiem), BO QUA phan trang - xuat het cac dong khop, khong chi rieng trang dang xem. SUA (phan hoi
  // "tạo 3 button, TN muốn tải mẫu nào thì tải"): nhan template tu UI, EP toan bo dong vao dung mau
  // do (server bo qua phan loai tu dong khi co ?template=).
  const misaExportBulkMutation = useMutation({
    mutationFn: (template: MisaTemplate) =>
      api.get<MisaExportResult>(
        "/phieu-xuat-kho/misa-export" +
          buildQuery({
            trang_thai: filterTrangThai || undefined,
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            loai_don: xemLoaiDon,
            q: debouncedQ || undefined,
            khu_vuc: khuVucParam || undefined,
            tu_ngay: filterTuNgay || undefined,
            den_ngay: filterDenNgay || undefined,
            template,
          }),
      ),
    onSuccess: async (result) => {
      const ok = await downloadMisaExport(result.sheets, `MISA_${LOAI_DON_TONE[xemLoaiDon || "mua"].label}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toastKetQuaMisa(result, ok, addToast);
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #19): bang danh sach chi de XEM (khong thao tac
  // nhanh duoc vi moi trang thai can nhap lieu khac nhau - xem #6) - them 1 cot tom tat NGAN "viec
  // can lam tiep" de biet TRUOC KHI bam "Chi tiet" co dang cho minh lam gi khong, hanh dong that van
  // phai vao modal chi tiet moi thuc hien duoc.
  function pxkViecCanLamTiep(r: PhieuXuatKhoRow): string | null {
    if (r.trang_thai === "Dang tao phieu") {
      if (!r.ma_xuat_kho_xac_nhan) return t("Cần nhập Mã đơn hàng");
      if (r.so_tien_can_chuyen != null && r.trang_thai_chuyen_tien !== "TN da duyet") return t("Chờ xác nhận chuyển tiền");
      return t("Sẵn sàng gửi Kế toán");
    }
    if (r.trang_thai === "Cho ke toan") return r.ma_misa ? t("Sẵn sàng chốt xong") : t("Cần nhập Mã MISA");
    // SUA (migration 0002_tra_hang_pxk.sql): PXK tra hang di THANG toi "Kho da nhan hang tra" (Kho
    // xac nhan nhan hang VE kho) tu "Da chot xong don xuat" - khac chieu "Kho gui hang" cua mua/cong_no.
    if (r.trang_thai === "Da chot xong don xuat") return r.loai_don === "tra_hang" ? t("Chờ Kho xác nhận nhận hàng") : t("Chờ Kho gửi hàng");
    if (r.trang_thai === "Dang gui KTV") return t("Chờ KTV xác nhận đã nhận");
    return null;
  }

  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "rut gon cot mac dinh"): 3 cot bo qua optionalColumns
  // (an mac dinh, van bat lai duoc qua "⚙ Tuy chinh cot") - loai_don thua vi sub-tab Mua hang/Cong no/
  // Tra hang o tren da loc dung 1 loai_don roi (gia tri luon giong nhau trong 1 lan xem), ma_van_don
  // thuong rong o cac buoc dau (chi co gia tri tu "Dang gui KTV" tro di), so_dong la thong tin phu chua
  // can thiet de quyet dinh hanh dong tiep theo. Nguoi dung da tung tuy chinh bang nay truoc do (bam an/
  // hien cot) khong bi anh huong - PaginatedTable giu nguyen lua chon da luu cua ho.
  const locCotCfg: LocCotCfg = {
    ...locCot,
    endpoint: "/phieu-xuat-kho/gia-tri-loc",
    params: {
      trang_thai: trangThaiGui || undefined,
      nguoi_nhan_hang: filterNguoiNhanHang || undefined,
      loai_don: xemLoaiDon,
      q: debouncedQ || undefined,
      khu_vuc: khuVucParam || undefined,
      tu_ngay: filterTuNgay || undefined,
      den_ngay: filterDenNgay || undefined,
    },
    tieuDe: {
      viec_can_lam: t("Việc cần làm tiếp"),
      da_in_phieu: t("In phiếu"),
      trang_thai: t("Trạng thái"),
      chuyen_tien: t("Chuyển tiền"),
      nguoi_tao: t("Người tạo"),
      nguoi_nhan_hang: t("Người nhận hàng"),
      khu_vuc: t("Khu vực"),
      mien_xuat: t("Kho xuất"),
      loai_de_xuat: t("Loại phiếu"),
      yeu_cau_hoa_don: t("Yêu cầu hóa đơn"),
      loai_chiet_khau: t("Loại chiết khấu"),
    },
    nhan: {
      viec_can_lam: (v) => t(v),
      trang_thai: (v) => trangThaiLabel(PXK_TRANG_THAI_OPTIONS, v),
      chuyen_tien: (v) => (v === "Khong can" ? t("Không cần") : trangThaiLabel(CHUYEN_TIEN_OPTIONS, v)),
      nguoi_tao: (v) => labelKtv(v),
      nguoi_nhan_hang: (v) => labelKtv(v),
      mien_xuat: (v) => (MIEN_XUAT_LABEL[v as MienXuat] ? t(MIEN_XUAT_LABEL[v as MienXuat]) : v),
      loai_chiet_khau: (v) => tenLoaiChietKhau(loaiChietKhauList, Number(v)) ?? v,
    },
  };
  // 3 cot loc KHONG co cot tuong ung tren bang PXK (gia tri nam o cac dong don ben trong / KTV) -> luon hien chip.
  // loai_de_xuat co cot "Loại phiếu" tu 2026-09-30 -> loc ngay tren tieu de cot, khong con chip rieng.
  const LOC_COT_KHONG_CO_COT = ["khu_vuc", "yeu_cau_hoa_don"];
  const locCotDangAp = Object.keys(locCotCfg.tieuDe).filter((c) => !LOC_COT_KHONG_CO_COT.includes(c) && (locCot.loc[c] || locCot.sapXep?.cot === c));
  const loc = (cot: string) => <LocCotButton cfg={locCotCfg} cot={cot} />;
  const cols: Column<PhieuXuatKhoRow>[] = [
    {
      // SUA (phan hoi 2026-09-10: "cột này sai tên, nó chỉ là ID hệ thống tự sinh, không phải mã pxk,
      // mã misa mới chính là pxk") - `id` la ID tuan tu tu dong sinh (nextSequentialId(), xem
      // lib/idCounter.ts), CHI dung de tham chieu/tim kiem noi bo, KHONG phai "mã PXK" that su theo
      // nghiep vu - doi nhan "Mã PXK" -> "ID" cho dung ban chat, mã PXK thuc su la ma_misa (cot rieng
      // ben duoi, Ke toan nhap luc "chốt xong đơn xuất").
      key: "id",
      header: coChonPxk ? (
        <span className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            title={t("Chọn cả trang")}
            checked={(data?.rows.length ?? 0) > 0 && (data?.rows ?? []).every((r) => chonPxk.has(r.id))}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const rows = data?.rows ?? [];
              setDangChonTatCa(false);
              setChonPxk((m) => {
                const n = new Map(m);
                for (const r of rows) {
                  if (e.target.checked) n.set(r.id, r);
                  else n.delete(r.id);
                }
                return n;
              });
            }}
          />
          ID
        </span>
      ) : "ID",
      render: (r) => (
        <span className="font-mono text-xs">
          {coChonPxk && (
            <input
              type="checkbox"
              className="mr-1.5 align-middle"
              checked={chonPxk.has(r.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => { setDangChonTatCa(false); batChonPxk(r); }}
            />
          )}
          {/* !! bat buoc - D1 tra EXISTS(...) ve 0/1 (khong phai boolean that), "0 && <X/>" trong
              JSX se render ra chu "0" thay vi an di neu khong ep kieu truoc. */}
          <NutXoDongDon mo={moRongPxk.has(r.id)} onClick={() => toggleMoRong(r.id)} />
          {!!r.co_don_uu_tien && <span title={t("Có dòng ưu tiên bên trong")}>⭐ </span>}
          {/* Bam ID = mo chi tiet phieu (2026-09-29, thay nut "Chi tiết" cuoi dong) - bam phan con lai cua dong van xo/thu dong don. */}
          <button type="button" className="code-link underline underline-offset-2 hover:opacity-80" title={t("Mở chi tiết phiếu")} onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}>
            {r.id}
          </button>
          {(coChonHoaDon(r.yeu_cau_hd) || !!r.quy_kh) && <span className="ml-1.5"><HoaDonPhieuBadge hd={r.yeu_cau_hd} quyKh={r.quy_kh} /></span>}
          {!!r.cho_hang && <span className="ml-1.5"><ChoHangBadge /></span>}
        </span>
      ),
    },
    {
      key: "ma_misa",
      header: t("Mã PXK"),
      render: (r) => (r.ma_misa ? <span className="code-link font-mono text-xs">{r.ma_misa}</span> : <span className="text-[var(--ink-400)] italic text-xs">{t("Chưa có")}</span>),
    },
    {
      key: "ma_xuat_kho",
      header: t("Mã đơn hàng"),
      // FIX (phan hoi 2026-09-05, giong het comment o Drawer chi tiet ben duoi): chi ghi "(đang chờ KTV
      // chuyển tiền)" khi THAT SU con cho (co so_tien_can_chuyen VA chua "TN da duyet") - PXK khong can
      // chuyen tien hoac da chuyen+duyet xong thi chi con thieu buoc TN tu nhap ma, khong con "cho" ai.
      render: (r) => {
        const chuyenTienOk = r.so_tien_can_chuyen == null || r.trang_thai_chuyen_tien === "TN da duyet";
        return r.ma_xuat_kho_xac_nhan ? r.ma_xuat_kho : (
          <span className="text-[var(--ink-400)] italic">{chuyenTienOk ? t("Chưa có") : t("Chưa có (đang chờ KTV chuyển tiền)")}</span>
        );
      },
    },
    {
      // Dat TRUOC cot "Người tạo" (phan hoi 2026-09-29).
      // Co phu "Da in phieu" (migration 0032) - CHI co y nghia tu luc "Đã chốt xong đơn xuất" tro di
      // (loai_don != tra_hang, tra hang khong co buoc "gui KTV"/in phieu giao hang) - cac dong khac
      // hien "—" thay vi badge "Chưa in" gay nham la CAN in (vd dong dang o "Dang tao phieu"/"Cho ke
      // toan" chua toi luc Kho can quan tam).
      key: "da_in_phieu", header: t("In phiếu"), filter: loc("da_in_phieu"),
      render: (r) =>
        r.loai_don !== "tra_hang" && ["Da chot xong don xuat", "Dang gui KTV", "KTV da nhan"].includes(r.trang_thai) ? (
          r.da_in_phieu ? <Badge tone="success" variant="dot">{t("Đã in")}</Badge> : <Badge tone="warning" variant="dot">{t("Chưa in")}</Badge>
        ) : (
          <span className="text-[var(--ink-400)]">—</span>
        ),
    },
    // "Loại phiếu" (2026-09-30) = loai de xuat cua cac dong don trong phieu (1 phieu chi gom 1 loai) - dat SAU "In phiếu".
    // key = "loai_de_xuat" de dung lai bo loc/sap xep cot PXK_COT_LOC.loai_de_xuat o backend.
    { key: "loai_de_xuat", header: t("Loại phiếu"), filter: loc("loai_de_xuat"), render: (r) => <LoaiPhieu r={r} /> },
    { key: "nguoi_tao", header: t("Người tạo"), filter: loc("nguoi_tao"), render: (r) => <NguoiTao>{labelKtv(r.nguoi_tao)}</NguoiTao> },
    { key: "nguoi_nhan_hang", header: t("Người nhận hàng"), filter: loc("nguoi_nhan_hang"), render: (r) => (r.nguoi_nhan_hang ? <NguoiNhan>{labelKtv(r.nguoi_nhan_hang)}</NguoiNhan> : <span className="text-[var(--ink-400)]">—</span>) },
    // Kho xuat MB/MN (2026-10-07, migration 0070) - phieu TN/Ke toan da chuyen kho hien badge "đã chuyển".
    { key: "mien_xuat", header: t("Kho xuất"), filter: loc("mien_xuat"), render: (r) => <KhoXuatBadge r={r} /> },
    { key: "ngay_tao", header: t("Ngày tạo"), render: (r) => fmtDateTime(r.ngay_tao) },
    // Them 2026-09-28 (phan hoi "hiện thêm cột Tiền cần chuyển + Loại chiết khấu đang được hưởng (theo
    // loại chiết khấu cao nhất)") - tong do backend tinh (1 nguon, lib/pxkRecalculate.ts); PXK cong no
    // thuan/tra hang luu NULL -> "—".
    {
      key: "so_tien_can_chuyen", header: t("Tiền cần chuyển"),
      render: (r) => (r.so_tien_can_chuyen != null ? <Money>{fmtVND(r.so_tien_can_chuyen)}</Money> : <span className="text-[var(--ink-400)]">—</span>),
    },
    {
      key: "loai_chiet_khau", header: t("Loại chiết khấu"), filter: loc("loai_chiet_khau"),
      render: (r) => (
        <span className="block max-w-[240px]">
          <LoaiChietKhauText id={r.loai_chiet_khau_cao_nhat_id} title={t("Loại chiết khấu cao nhất trong các dòng của phiếu")} />
        </span>
      ),
    },
    {
      key: "chuyen_tien", header: t("Chuyển tiền"), filter: loc("chuyen_tien"),
      render: (r) => (r.so_tien_can_chuyen != null ? <StatusBadge phu value={r.trang_thai_chuyen_tien ?? ""} tones={CHUYEN_TIEN_TONE} options={CHUYEN_TIEN_OPTIONS} /> : <span className="text-[var(--ink-400)] text-xs">{t("Không cần")}</span>),
    },
    // Anh bang chung chuyen tien xem nhanh ngay tren danh sach (2026-09-29, giong cot "Ảnh" man Quỹ & chuyển tiền) - bam anh
    // mo lightbox, khong xo dong.
    {
      key: "bang_chung", header: t("Bằng chứng"),
      render: (r) => {
        const anh = docAnhBangChung(r);
        return anh.length > 0 ? (
          <BangChungAnhList urls={anh} nho onXem={(i) => setXemAnhPxk((batDauAnhPxk.get(r.id) ?? 0) + i)} />
        ) : (
          <span className="text-[var(--ink-400)]">—</span>
        );
      },
    },
    { key: "trang_thai", header: t("Trạng thái"), filter: loc("trang_thai"), render: (r) => <StatusBadge value={r.trang_thai} tones={PXK_TRANG_THAI_TONE} options={PXK_TRANG_THAI_OPTIONS} /> },
    {
      key: "viec_can_lam", header: t("Việc cần làm tiếp"), filter: loc("viec_can_lam"),
      render: (r) => {
        const viec = pxkViecCanLamTiep(r);
        return viec ? <span className="text-xs text-[var(--amber-700)] font-medium">{viec}</span> : <span className="text-[var(--ink-400)]">—</span>;
      },
    },
  ];
  const optionalCols: Column<PhieuXuatKhoRow>[] = [
    { key: "loai_don", header: t("Loại"), render: (r) => (r.loai_don ? <LoaiDeXuatBadge loaiDon={r.loai_don} /> : <span className="text-[var(--ink-400)]">—</span>) },
    { key: "ma_van_don", header: t("Mã vận đơn"), render: (r) => r.ma_van_don ?? <span className="text-[var(--ink-400)]">—</span> },
    { key: "so_dong", header: t("Số dòng"), render: (r) => r.so_dong },
  ];

  // The PXK rieng cho mobile (phan hoi 2026-09-26: "thẻ thông tin đang quá nhiều thông tin và nhìn rối
  // mắt") - truoc day PaginatedTable in ~11 dong "nhan: gia tri" (ID, Mã PXK, Mã đơn hàng, Người tạo...,
  // nut Chi tiết). Rut con 3 dong theo thu tu quet mat: (1) PXK nao + dang o buoc nao, (2) giao cho ai +
  // khi nao, (3) viec can lam tiep (dong duy nhat to mau amber) + toi da 2 co phu CHI khi can chu y
  // (chuyen tien chua duyet / chua in phieu). Bo khoi the: Người tạo, Mã đơn hàng, nut Chi tiết (bam ca
  // the da mo chi tiet) - van xem day du trong Drawer chi tiet va tren bang desktop.
  const renderPxkMobileCard = (r: PhieuXuatKhoRow) => {
    const viec = pxkViecCanLamTiep(r);
    // Co phu chi hien khi con tac dong toi buoc dang mo: chuyen tien chi chan buoc "Dang tao phieu", co in
    // phieu chi can o 2 buoc Kho/KTV con xu ly - PXK da huy/da dong khong hien co nao (bang desktop van du).
    const coInPhieu = r.loai_don !== "tra_hang" && ["Da chot xong don xuat", "Dang gui KTV"].includes(r.trang_thai);
    const chuyenTienCho = r.trang_thai === "Dang tao phieu" && r.so_tien_can_chuyen != null && r.trang_thai_chuyen_tien !== "TN da duyet";
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate">
            <NutXoDongDon mo={moRongPxk.has(r.id)} onClick={() => toggleMoRong(r.id)} />
            {!!r.co_don_uu_tien && <span title={t("Có dòng ưu tiên bên trong")} className="text-[var(--orange-600)]">⭐ </span>}
            {r.ma_misa ? (
              <span className="font-mono text-[13px] font-semibold text-[var(--color-text)]">{r.ma_misa}</span>
            ) : (
              <span className="text-[13px] italic text-[var(--ink-400)]">{t("Chưa có mã PXK")}</span>
            )}
            <button type="button" className="code-link ml-1.5 font-mono text-[11px] underline underline-offset-2" title={t("Mở chi tiết phiếu")} onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}>
              #{r.id}
            </button>
          </div>
          <div className="shrink-0">
            <StatusBadge value={r.trang_thai} tones={PXK_TRANG_THAI_TONE} options={PXK_TRANG_THAI_OPTIONS} />
          </div>
        </div>
        <div className="flex items-baseline gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-[var(--color-text-body)]">{r.nguoi_nhan_hang ? <NguoiNhan>{labelKtv(r.nguoi_nhan_hang)}</NguoiNhan> : "—"}</span>
          <LoaiPhieu r={r} />
          {r.mien_xuat && <KhoXuatBadge r={r} />}
          <span className="shrink-0 text-[11px] text-[var(--ink-400)]">{fmtDateTime(r.ngay_tao)}</span>
        </div>
        {(viec || chuyenTienCho || coInPhieu) && (
          <div className="flex items-center gap-1.5 pt-0.5">
            {viec && <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--amber-700)]">→ {viec}</span>}
            {!viec && <span className="flex-1" />}
            {chuyenTienCho && <StatusBadge value={r.trang_thai_chuyen_tien ?? ""} tones={CHUYEN_TIEN_TONE} options={CHUYEN_TIEN_OPTIONS} />}
            {coInPhieu && (r.da_in_phieu ? <span title={t("Đã in phiếu")} className="shrink-0 text-xs text-[var(--color-success-strong)]">{t("🖨 Đã in")}</span> : <Badge tone="warning">{t("Chưa in")}</Badge>)}
          </div>
        )}
      </div>
    );
  };

  // Nang len goi useColumnConfig O DAY (2026-08-21, sua loi UX "nút Tùy chỉnh cột khiến table bị
  // trống ra 1 khoảng trông rất xấu" - xem giai thich day du o TraHangTab.tsx, cung 1 sua).
  const columnConfig = useColumnConfig(cols, optionalCols, [], "dmlk-pxk-list");
  const moHetTrang = (data?.rows.length ?? 0) > 0 && (data?.rows ?? []).every((r) => moRongPxk.has(r.id));
  const soBoLoc = [filterTrangThai, filterNguoiNhanHang, filterQ, khuVucParam, filterTuNgay, filterDenNgay].filter(Boolean).length + Object.keys(locCot.loc).length;
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
      {/* Thanh cong cu 1 HANG (v1.437, "thiết kế lại các chức năng này cho giao diện gọn hàng và sạch sẽ"): truoc day 3 hang (chip loai
          don / Bo loc + nut nhanh + o tim / Tuy chinh cot + Xo dong + Tao phieu + 5 nut tai). Gio: nhom phan doan loai don | o tim | Bo
          loc | Cho xu ly | Xoa loc ... ben phai: Xo dong (icon) | Tai xuong ▾ (gop 5 nut tai, MenuTai.tsx) | + Tao phieu xuat kho (primary
          duy nhat). "Tùy chỉnh cột" chuyen vao bang Bo loc (giong danh sach Don hang). */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex max-w-full items-center overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--surface-100)] p-0.5">
          {(["", "mua", "cong_no", "tra_hang"] as const).map((l) => {
            const active = xemLoaiDon === l;
            const n = l ? loaiDonCounts[l] : 0;
            return (
              <button
                key={l || "tat-ca"}
                type="button"
                onClick={() => setXemLoaiDon(l)}
                className={`focus-ring inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors ${
                  active ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--ink-500)] hover:text-[var(--ink-700)]"
                }`}
              >
                {l ? t(LOAI_DON_TONE[l].label) : t("Tất cả")}
                {n > 0 && (
                  <span className="rounded-full bg-[var(--color-warning-soft)] px-1.5 text-[10.5px] font-bold tabular-nums text-[var(--color-warning-strong)]">{n}</span>
                )}
              </button>
            );
          })}
        </div>
        {!hienSideNguoiNhan && <NutMoSideNguoiNhan onClick={() => setHienSideNguoiNhan(true)} />}
        <input
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
          placeholder={t("Tìm theo mã PXK, mã đơn hàng, mã YCSC, mã Lada, mã MISA, tên KTV...")}
          className="o-tim focus-ring h-8 min-w-0 flex-1 basis-44 rounded-lg border border-[var(--line)] bg-[var(--surface-100)] px-2.5 text-base sm:max-w-sm sm:text-sm"
        />
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={btnClasses(showFilters || soBoLoc > 0 ? "subtle" : "ghost", "sm", "h-8")}
          aria-expanded={showFilters}
        >
          ☰ {t("Bộ lọc")}
          {soBoLoc > 0 && <span className="rounded-full bg-[var(--color-primary)] px-1.5 text-[10.5px] font-bold text-white">{soBoLoc}</span>}
          <span className="text-[10px] opacity-60">{showFilters ? "▲" : "▾"}</span>
        </button>
        {pendingTrangThaiForRole() && (
          <button
            type="button"
            onClick={() => setFilterTrangThai(pendingTrangThaiForRole())}
            className={btnClasses(filterTrangThai === pendingTrangThaiForRole() ? "subtle" : "ghost", "sm", "h-8")}
            title={t("Lọc nhanh các phiếu đang chờ vai trò của bạn xử lý")}
          >
            {t("Đơn chờ xử lý")}
          </button>
        )}
        {(filterTrangThai || filterNguoiNhanHang || filterQ || khuVucParam || filterTuNgay || filterDenNgay) && (
          <button
            type="button"
            onClick={() => {
              setFilterTrangThai("");
              setFilterNguoiNhanHang("");
              setFilterQ("");
              setFilterKhuVuc(new Set());
              datNgayTao("", "");
            }}
            className="focus-ring inline-flex h-8 w-7 items-center justify-center rounded-lg text-sm text-[var(--ink-400)] hover:bg-[var(--surface-100)] hover:text-[var(--color-danger-strong)]"
            title={t("✕ Xóa bộ lọc")}
            aria-label={t("✕ Xóa bộ lọc")}
          >
            ✕
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {(data?.rows.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setMoRongPxk(moHetTrang ? new Set() : new Set((data?.rows ?? []).map((r) => r.id)))}
              className={btnClasses("ghost", "sm", "h-8 w-8 !px-0")}
              title={moHetTrang ? t("⊟ Thu gọn tất cả") : t("⊞ Xổ tất cả dòng đơn")}
              aria-label={moHetTrang ? t("⊟ Thu gọn tất cả") : t("⊞ Xổ tất cả dòng đơn")}
            >
              {moHetTrang ? "⊟" : "⊞"}
            </button>
          )}
          <MenuTai
            dangTai={downloadingFull || dangTaiDon || misaExportBulkMutation.isPending}
            muc={[
              { nhom: t("Danh sách"), nhan: t("⬇ Tải chi tiết phiếu"), moTa: t("Mỗi dòng là 1 phiếu trong danh sách đang xem"), onClick: handleDownloadFullList, dangTai: downloadingFull },
              { nhan: t("⬇ Tải chi tiết đơn"), moTa: t("Mọi đơn hàng nằm trong các phiếu đang xem — cùng định dạng file tải ở danh sách Đơn hàng"), onClick: taiChiTietDon, dangTai: dangTaiDon },
              // An voi KTV/Trạm/CTV/Vệ tinh (canDownloadMisa=false, xem giai thich o khai bao prop).
              ...(canDownloadMisa
                ? MISA_TEMPLATE_ORDER.map((tpl, i) => ({
                    nhom: i === 0 ? t("File MISA") : undefined,
                    nhan: `⬇ MISA ${MISA_TEMPLATE_LABELS[tpl]}`,
                    onClick: () => misaExportBulkMutation.mutate(tpl),
                    dangTai: misaExportBulkMutation.isPending && misaExportBulkMutation.variables === tpl,
                  }))
                : []),
            ]}
          />
          {canTacNghiep && (
            <button type="button" onClick={moModalTaoPxk} className={btnClasses("primary", "sm", "h-8")}>
              {t("+ Tạo phiếu xuất kho")}
            </button>
          )}
        </div>
      </div>
      {showFilters && (
        <div className="mb-3 flex flex-wrap items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-100)] p-3">
        <TrangThaiDropdownFilter value={filterTrangThai} onChange={setFilterTrangThai} options={PXK_TRANG_THAI_OPTIONS} counts={statusCountsData?.counts} />
        {/* Bo loc Khu vuc (them 2026-08-31, dong bo voi DonCuaToiTab.tsx). SUA BUG GIAO DIEN (phan hoi
            2026-09-12): bo nhan "Khu vực" rieng ben ngoai (gay lech chieu cao so voi cac o loc khac
            cung hang) - nhan da gop vao THANG nut trigger (xem triggerLabel trong SharedUi.tsx). */}
        {showKhuVucFilter && khuVucOptions.length > 0 && <KhuVucChipFilter value={filterKhuVuc} onChange={setFilterKhuVuc} options={khuVucOptions} />}
        {(nguoiNhanHangData?.rows.length ?? 0) > 0 && (
          <Select
            value={filterNguoiNhanHang}
            onChange={setFilterNguoiNhanHang}
            options={[{ value: "", label: t("Tất cả người nhận hàng") }, ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: ktvOptionLabel(r, nguoiNhanHangData?.rows ?? []) }))]}
          />
        )}
        <LocNgayTao tu={filterTuNgay} den={filterDenNgay} onChange={datNgayTao} />
        {/* Mobile (2026-09-29, phan hoi "lọc cột trên bản mobile cho gọn vào trong bộ lọc"): toan bo chip loc cot nam
              TRONG bang Bo loc thay vi 1 hang chip luon hien tren danh sach; ngoai bang chi con chip cot DANG loc. */}
          <div className="w-full sm:hidden">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">{t("Lọc theo cột")}</div>
            <LocCotBar cfg={locCotCfg} cots={Object.keys(locCotCfg.tieuDe)} hienTatCa nhan={null} />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">{t("Cột hiển thị")}</div>
            {settingsButtonEl}
          </div>
        </div>
      )}
      {/* SUA (ra soat #3): bo chip "Trạng thái: ..." - gia tri dang chon da hien SAN trong o
          TrangThaiDropdownFilter ngay ben tren (doi tu chip/nut sang dropdown 2026-09-01), khong can
          lap lai o day. */}
      <ActiveFiltersBar
        chips={[
          ...(filterNguoiNhanHang ? [{ label: t("Người nhận hàng đã lọc"), onClear: () => setFilterNguoiNhanHang("") }] : []),
          ...(khuVucParam ? [{ label: t("Khu vực: {a}", { a: [...filterKhuVuc].map((ma) => khuVucOptions.find((o) => o.value === ma)?.label ?? ma).join(", ") }), onClear: () => setFilterKhuVuc(new Set()) }] : []),
          ...chipNgayTao(filterTuNgay, filterDenNgay, datNgayTao),
        ]}
      />
      {/* SUA (phan hoi 2026-08-18 muc 2): onRowClick mo thang modal chi tiet (bam CA HANG, khong chi
          nut "Chi tiet" nho o cuoi hang dai) + storageKey de nguoi dung tu an bot/keo rong cot theo y
          minh (⚙ Tuy chinh cot, tinh nang co san cua PaginatedTable, chi chua duoc bat o bang nay) -
          giai quyet ca 2 y "tran/qua dai" (an bot cot khong can) va "man hinh to nhung chu nho" (keo
          rong cot can xem ky) ma khong can ve lai toan bo bang. */}
      <div className="flex items-start gap-3">
      {hienSideNguoiNhan && (
        <div className="sticky top-2 hidden self-start lg:block">
          <NguoiNhanSide cfg={locCotCfg} khoa="pxk-side-nguoi-nhan" onDong={() => setHienSideNguoiNhan(false)} />
        </div>
      )}
      <div className="min-w-0 flex-1">
      <div className="sm:hidden">
        <LocCotBar cfg={locCotCfg} cots={Object.keys(locCotCfg.tieuDe)} hienTatCa={false} />
      </div>
      <div className="hidden sm:block">
        <LocCotBar cfg={locCotCfg} cots={[...LOC_COT_KHONG_CO_COT, ...locCotDangAp]} hienTatCa />
      </div>
      {xemAnhPxk != null && <XemAnhNhanh items={anhPxkDs} batDau={xemAnhPxk} onClose={() => setXemAnhPxk(null)} />}
      {coChonPxk && (
        <ThanhDuyetNhanhPxk
          chon={[...chonPxk.values()]}
          tongTheoBoLoc={data?.total ?? 0}
          dangChonTatCa={dangChonTatCa}
          onChonTatCa={async () => {
            try {
              const res = await taiPhieuTheoBoLoc();
              setChonPxk(new Map(res.rows.map((r) => [r.id, r])));
              setDangChonTatCa(true);
            } catch (err) {
              addToast(t("Lỗi: ") + describeApiError(err));
            }
          }}
          onBoChon={() => { setChonPxk(new Map()); setDangChonTatCa(false); }}
          addToast={addToast}
        />
      )}
      <PaginatedTable
        columns={cols}
        optionalColumns={optionalCols}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        page={page}
        pageSize={20}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(r) => r.id}
        // SUA 2026-10-28 ("click vào bất kỳ vị trí nào để mở UI chi tiết của phiếu ... nút tam giác ngược để xổ chi tiết nếu cần xem"):
        // bam CA DONG = mo chi tiet phieu; xo / thu dong don bang nut ▼ (NutXoDongDon) o cot ID.
        onRowClick={(r) => setDetailId(r.id)}
        columnConfig={columnConfig}
        mobileCard={renderPxkMobileCard}
        expandedContent={(r) =>
          moRongPxk.has(r.id) ? (
            <PxkDongMoRong
              pxkId={r.id}
              addToast={addToast}
              qc={qc}
              canTacNghiep={canTacNghiep}
              canKho={canKho}
              canKeToan={canKeToan}
              currentEmail={currentEmail}
              isAdmin={isAdmin}
            />
          ) : null
        }
        // FIX (phan hoi 2026-09-24: "đơn đã xác nhận in phiếu => cả card list của đơn chuyển sang màu
        // xanh dương nhạt để phân biệt với các pxk chưa in phiếu") - uu_tien (cam) van uu tien hien thi
        // truoc (canh bao quan trong hon), da_in_phieu chi to khi KHONG co uu_tien de tranh 2 mau ganh nhau tren cung
        // 1 dong. Doi xanh duong nhat -> XANH LA nhat --color-success-soft (phan hoi 2026-09-29 "xanh dương nhạt khó nhìn").
        // SUA 2026-10-15 ("nền màu trắng", "app màu mè"): bo nen cam/xanh la ca dong - nen dong luon trang; phieu co don uu tien = 1
        // vach cam ben trai (o dau tien), da in = xem cot "In phiếu".
        rowClassName={(r) => `${r.co_don_uu_tien ? "[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-warning)] shadow-[inset_3px_0_0_var(--color-warning)]" : ""} ${nenKhieuNai(r.co_khieu_nai) || nenHoaDon(r.yeu_cau_hd)}`}
      />
      </div>
      </div>
      {showCreate && (() => {
        const dongTaoPxk = () => {
          setShowCreate(false);
          setSelectedDonHang(new Set());
          setTimKiemDonHang("");
          setChonKtv("");
          setChonLoaiDon("mua");
        };
        // Mobile (2026-09-30, "tối ưu giao diện tạo phiếu cho điện thoại"): CUNG 1 form, chi khac vo - man toan man hinh
        // (TaoPxkMobileShell) + dong don dang THE bam ca the de chon + thanh CTA dinh day; desktop giu Modal + bang nhu cu.
        const inputCls = `focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 ${isMobile ? "py-2 text-base" : "py-1.5 text-sm"}`;
        // Tien + loai chiet khau du kien 1 dong - dung CHUNG cho bang (desktop) va the (mobile).
        const oTienTaoPxk = (r: DonHangKhaDungRow) => {
          const goiY = goiYTheoDong.get(r.id);
          if (!(chonLoaiDon === "mua" || laTruCongNo(r.loai_de_xuat))) {
            return r.so_tien_cong_no != null ? (
              <span title={t("Tiền công nợ ghi nhận cho KTV — không cộng vào tiền cần chuyển của phiếu")}>
                <Money>{fmtVND(r.so_tien_cong_no)}</Money> <span className="text-[11px] text-[var(--ink-400)]">{t("công nợ")}</span>
              </span>
            ) : (
              <span className="text-[11px] text-[var(--ink-400)]">{t("công nợ")}</span>
            );
          }
          if (!selectedDonHang.has(r.id)) {
            return (
              <span className="text-[11px] text-[var(--ink-400)]" title={t("Tiền tính theo cả tập dòng đang chọn (mốc 200k/500k)")}>
                {t("chọn để tính")}
              </span>
            );
          }
          if (goiY?.tien_uoc_tinh == null) return <span className="text-[var(--ink-400)]">{t("Đang tính…")}</span>;
          return (
            <button
              type="button"
              className="italic text-[var(--ink-400)] hover:underline decoration-dotted underline-offset-2"
              title={t("Bấm để sửa SL thực xuất/Đơn giá thực tế")}
              onClick={(e) => { e.stopPropagation(); setSuaTienTaoId(r.id); }}
            >
              <Money>{fmtVND(goiY.tien_uoc_tinh)}</Money> {t("(ước tính)")}
            </button>
          );
        };
        const loaiCkTaoPxk = (r: DonHangKhaDungRow) => {
          const ma = goiYTheoDong.get(r.id)?.ma_chiet_khau;
          return ma ? loaiChietKhauList?.find((l) => l.ma === ma) : undefined;
        };
        const body = (
          <div className="space-y-3 text-sm">
            {(khuVucParam || filterNguoiNhanHang || cfKhaDung) && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-subtle)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text-secondary)]">
                {t("Chỉ hiện đơn theo bộ lọc đang chọn bên ngoài:")}
                <b className="text-[var(--color-text)]">
                  {[
                    khuVucParam && t("Khu vực {a}", { a: [...filterKhuVuc].map((ma) => khuVucOptions.find((o) => o.value === ma)?.label ?? ma).join(", ") }),
                    filterNguoiNhanHang && t("KTV {a}", { a: labelKtv(filterNguoiNhanHang) }),
                    cfKhaDung && t("lọc cột Khu vực/Người nhận hàng"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </b>
                {t(". Muốn thấy KTV khu vực khác, đóng lại và đổi bộ lọc.")}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">{t("Loại phiếu *")}</label>
              <div className="flex gap-1">
                {(["mua", "cong_no", "tra_hang"] as const).map((l) => (
                  <Btn
                    key={l}
                    size="sm"
                    className={isMobile ? "h-10 flex-1 justify-center" : undefined}
                    variant={chonLoaiDon === l ? "primary" : "ghost"}
                    onClick={() => { setChonLoaiDon(l); setChonKtv(""); setSelectedDonHang(new Set()); }}
                  >
                    {t(LOAI_DON_TONE[l].label)} (x{khaDungCounts[l]})
                  </Btn>
                ))}
              </div>
            </div>
            <div>
              {/* Chot nghiep vu 2026-08-15: 1 PXK CHI gan cho 1 KTV - bat buoc chon KTV TRUOC, danh
                  sach dong ben duoi chi hien dong cua dung KTV do (khong con tron nhieu KTV). */}
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">{t("Chọn KTV nhận hàng *")}</label>
              <Select
                value={chonKtv}
                onChange={(v) => { setChonKtv(v); setSelectedDonHang(new Set()); }}
                options={[{ value: "", label: khaDungLoading ? t("Đang tải danh sách KTV…") : t("-- Chọn KTV --") }, ...ktvKhaDung.map((email) => ({ value: email, label: labelKtv(email) }))]}
                disabled={khaDungLoading}
                className="w-full"
              />
            </div>
            {/* CHOT (ra soat module "Dat Mua Linh Kien 2.0" #1/#19): khoa TRUC QUAN (mo + khong bam
                duoc) toan bo khoi nay khi chua chon KTV, khong chi dua vao dong chu placeholder ben
                trong nhu truoc - ro rang ngay tu cai nhin dau tien day la buoc CHUA TOI LUOT, khong
                phai chi 1 o tim kiem bi disabled le loi. */}
            <div className={!chonKtv ? "opacity-50 pointer-events-none" : ""}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--ink-600)]">{t("Chọn dòng đơn hàng đã \"TN đã duyệt\" (*)")}</label>
                {/* CHOT #10 (ra soat module "Dat Mua Linh Kien 2.0"): them tong tien cua cac dong DA
                    CHON de doi chieu voi o "So tien can KTV chuyen" ngay ben duoi - truoc day chi
                    hien so luong dong, khong biet tong gia tri de doi chieu. */}
                <span className={`text-xs text-[var(--ink-500)] ${isMobile ? "hidden" : ""}`}>
                  {t("Đã chọn {a}", { a: selectedDonHang.size })}
                  {selectedDonHang.size > 0 && (
                    <>
                      {" · "}
                      <Money>{fmtTongTaoPxk}</Money>
                    </>
                  )}
                </span>
              </div>
              {/* Tong dat Mua + TRỪ CÔNG NỢ cua KTV trong ngay tao cac dong da chon (chua chon = hom nay) - moc
                  chiet khau (2026-09-28). */}
              {chonKtv && chonLoaiDon !== "tra_hang" && (
                <div className="mb-1.5">
                  <TongNgayKtvInfo
                    email={chonKtv}
                    ngays={(khaDungData?.rows ?? [])
                      .filter((r) => selectedDonHang.has(r.id) && (r.loai_don === "mua" || laTruCongNo(r.loai_de_xuat)))
                      .map((r) => (r.ngay_tao ?? "").slice(0, 10))
                      .filter(Boolean)}
                  />
                </div>
              )}
              <input
                value={timKiemDonHang}
                onChange={(e) => setTimKiemDonHang(e.target.value)}
                placeholder={t("Tìm theo mã LK, tên LK, mã đơn, mã YCSC/Lada...")}
                disabled={!chonKtv}
                className={`o-tim ${inputCls} mb-1.5 disabled:bg-[var(--surface-200)]`}
              />
              {/* SUA (phan hoi 2026-09-28 "danh sách đơn hàng cho hiện thị giống danh sách Dòng đơn hàng trong
                  UI phiếu xuất đã tạo (có các chức năng thay đổi, sửa thông tin...)") - truoc day chi la list
                  checkbox (ma + ten + SL). Gio la bang cung cot voi "Dòng đơn hàng": Loai de xuat, SL de xuat/
                  thuc xuat, Tien can chuyen (TN bam de sua SL thuc xuat/Don gia - SuaTienDongModal, sua duoc vi
                  dong CHUA vao PXK), Loai chiet khau DU KIEN (chi xem - doi loai can dong da nam trong PXK). */}
              <div className={isMobile ? "" : "border border-[var(--line)] rounded-lg max-h-[45vh] overflow-auto"}>
                {!chonKtv ? (
                  <div className="text-xs text-[var(--ink-400)] text-center py-4">{t("Chọn KTV nhận hàng ở trên trước.")}</div>
                ) : khaDungLoading ? (
                  <div className="text-xs text-[var(--ink-500)] text-center py-4">{t("Đang tải...")}</div>
                ) : donHangLoc.length === 0 ? (
                  <div className="text-xs text-[var(--ink-400)] text-center py-4">
                    {(khaDungData?.rows.length ?? 0) === 0 ? t("Không có dòng nào đang chờ tạo phiếu xuất kho.") : t("Không khớp tìm kiếm.")}
                  </div>
                ) : isMobile ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={toggleChonTatCaLoc}
                      className="focus-ring text-xs font-semibold text-[var(--color-primary)] underline underline-offset-2 py-1"
                    >
                      {donHangLoc.every((r) => selectedDonHang.has(r.id)) ? t("Bỏ chọn tất cả") : t("Chọn tất cả ({a})", { a: donHangLoc.length })}
                    </button>
                    {donHangLoc.map((r) => {
                      const chon = selectedDonHang.has(r.id);
                      const loaiCk = loaiCkTaoPxk(r);
                      const lechSl = r.so_luong_thuc_xuat != null && r.so_luong_thuc_xuat !== r.so_luong_de_xuat;
                      return (
                        // Ca the la vung bam chon (div role=button - ben trong con nut sua tien, khong long button trong button).
                        <div
                          key={r.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={chon}
                          onClick={() => toggleDonHang(r.id)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDonHang(r.id); } }}
                          className={`focus-ring flex gap-2.5 rounded-[var(--radius-card)] border px-3 py-2.5 transition-colors ${
                            chon ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface)]"
                          }`}
                        >
                          <input type="checkbox" checked={chon} readOnly tabIndex={-1} className="mt-0.5 h-5 w-5 shrink-0 pointer-events-none" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-mono text-[13px] font-semibold text-[var(--color-text)]">{r.ma_lk}</span>
                              <span className="shrink-0"><LoaiDeXuatBadge loaiDon={r.loai_don ?? chonLoaiDon} loaiDeXuat={r.loai_de_xuat} /></span>
                            </div>
                            <div className="truncate text-[13px] text-[var(--color-text-body)]">
                              {r.trang_thai_hien_tai === "Cho thanh toan" && <span className="mr-1.5"><Badge tone="warning" variant="dot">{t("Chờ thanh toán")}</Badge></span>}
                              {r.ten_lk_snapshot ?? r.ma_lk}
                            </div>
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-[var(--color-text-secondary)]">
                                {t("SL {a}", { a: r.so_luong_de_xuat })}
                                {lechSl && <span className="font-semibold text-[var(--amber-700)]">{" "}{t("→ thực xuất {a}", { a: r.so_luong_thuc_xuat })}</span>}
                              </span>
                              {chonLoaiDon !== "tra_hang" && <span className="shrink-0">{oTienTaoPxk(r)}</span>}
                              <TienDaTraDon don={r} />
                            </div>
                            {chon && loaiCk && chonLoaiDon !== "tra_hang" && (
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                <LoaiChietKhauChip loai={loaiCk} title={t("{a} — dự kiến; TN đổi được sau khi tạo phiếu", { a: loaiCk.ten })} />
                                <HoaDonGiaNiemYet don={r} />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <table className="tbl min-w-full border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="tbl-head">
                        <th className="px-2.5 py-2 w-8">
                          <input
                            type="checkbox"
                            title={t("Chọn tất cả ({a})", { a: donHangLoc.length })}
                            checked={donHangLoc.length > 0 && donHangLoc.every((r) => selectedDonHang.has(r.id))}
                            onChange={toggleChonTatCaLoc}
                          />
                        </th>
                        <th className="px-2.5 py-2">{t("Mã")}</th>
                        <th className="px-2.5 py-2">{t("Tên LK")}</th>
                        <th className="px-2.5 py-2 whitespace-nowrap">{t("Loại đề xuất")}</th>
                        <th className="px-2.5 py-2 text-right whitespace-nowrap">{t("SL đề xuất")}</th>
                        <th className="px-2.5 py-2 text-right whitespace-nowrap">{t("SL thực xuất")}</th>
                        {chonLoaiDon !== "tra_hang" && <th className="px-2.5 py-2 text-right whitespace-nowrap">{t("Tiền cần chuyển")}</th>}
                        {chonLoaiDon !== "tra_hang" && <th className="px-2.5 py-2 whitespace-nowrap">{t("Loại chiết khấu (dự kiến)")}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {donHangLoc.map((r) => {
                        const chon = selectedDonHang.has(r.id);
                        const loaiCk = loaiCkTaoPxk(r);
                        return (
                          <tr
                            key={r.id}
                            onClick={() => toggleDonHang(r.id)}
                            className={`border-b border-[var(--line)] last:border-0 cursor-pointer ${chon ? "bg-[var(--color-primary-soft)]" : "hover:bg-slate-50"}`}
                          >
                            <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={chon} onChange={() => toggleDonHang(r.id)} />
                            </td>
                            <td className="px-2.5 py-2 font-mono">{r.ma_lk}</td>
                            <td className="px-2.5 py-2">
                              {r.trang_thai_hien_tai === "Cho thanh toan" && <span className="mr-1.5"><Badge tone="warning" variant="dot">{t("Chờ thanh toán")}</Badge></span>}
                              {r.ten_lk_snapshot ?? r.ma_lk}
                            </td>
                            <td className="px-2.5 py-2 whitespace-nowrap">
                              <LoaiDeXuatBadge loaiDon={r.loai_don ?? chonLoaiDon} loaiDeXuat={r.loai_de_xuat} />
                            </td>
                            <td className="px-2.5 py-2 text-right">{r.so_luong_de_xuat}</td>
                            <td className="px-2.5 py-2 text-right">
                              {r.so_luong_thuc_xuat == null ? (
                                <span className="text-[var(--ink-400)]">—</span>
                              ) : r.so_luong_thuc_xuat !== r.so_luong_de_xuat ? (
                                <span className="font-semibold text-[var(--amber-700)]" title={t("Khác SL đề xuất")}>{r.so_luong_thuc_xuat}</span>
                              ) : (
                                r.so_luong_thuc_xuat
                              )}
                            </td>
                            {chonLoaiDon !== "tra_hang" && (
                              <td className="px-2.5 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                {oTienTaoPxk(r)}
                                {!!r.tien_da_tra && <span className="ml-1.5"><TienDaTraDon don={r} /></span>}
                              </td>
                            )}
                            {chonLoaiDon !== "tra_hang" && (
                              <td className="px-2.5 py-2">
                                {chon && loaiCk ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <LoaiChietKhauChip loai={loaiCk} title={t("{a} — dự kiến; TN đổi được sau khi tạo phiếu", { a: loaiCk.ten })} />
                                    <HoaDonGiaNiemYet don={r} />
                                  </span>
                                ) : (
                                  <span className="text-[var(--ink-400)]">—</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">{t("Mã đơn hàng (tuỳ chọn, có thể nhập sau nếu chưa biết)")}</label>
              <input
                value={createData.ma_xuat_kho}
                onChange={(e) => setCreateData((p) => ({ ...p, ma_xuat_kho: e.target.value }))}
                placeholder={t("Nhập nếu đã biết mã đơn hàng ngay lúc tạo")}
                className={inputCls}
              />
            </div>
            {/* Mobile: so tien nam o thanh CTA dinh day (luon thay), khong lap lai o day. */}
            {!isMobile && (
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">{t("Số tiền cần chuyển")}</label>
                <div className="w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm">
                  <Money>{fmtTongTaoPxk}</Money> <span className="text-[var(--ink-400)]">{t("(tự động)")}</span>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">{t("Ghi chú")}</label>
              <input
                value={createData.ghi_chu}
                onChange={(e) => setCreateData((p) => ({ ...p, ghi_chu: e.target.value }))}
                className={inputCls}
              />
            </div>
            {!isMobile && (
              <div className="flex justify-end gap-2">
                <Btn variant="ghost" size="sm" onClick={dongTaoPxk}>
                  {t("Hủy")}
                </Btn>
                <Btn
                  size="sm"
                  onClick={() => createMutation.mutate()}
                  disabled={!chonKtv || selectedDonHang.size === 0 || createMutation.isPending}
                  loading={createMutation.isPending}
                >
                  {t("Tạo")}
                </Btn>
              </div>
            )}
          </div>
        );
        if (!isMobile) {
          return (
            <Modal open title={t("Tạo phiếu xuất kho")} width="max-w-[95vw] sm:max-w-[1100px]" height="max-h-[92vh]" onClose={dongTaoPxk}>
              {body}
            </Modal>
          );
        }
        return (
          <TaoPxkMobileShell
            onClose={dongTaoPxk}
            footer={
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">{t("Đã chọn {a} dòng", { a: selectedDonHang.size })}</span>
                  {chonLoaiDon !== "tra_hang" && selectedDonHang.size > 0 && (
                    <span className="font-bold text-[var(--color-text)]">
                      {t("Cần chuyển:")} <Money>{fmtTongTaoPxk}</Money>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Btn variant="ghost" size="md" className="h-11 shrink-0" onClick={dongTaoPxk}>
                    {t("Hủy")}
                  </Btn>
                  <Btn
                    size="md"
                    className="h-11 flex-1 justify-center text-base"
                    onClick={() => createMutation.mutate()}
                    disabled={!chonKtv || selectedDonHang.size === 0 || createMutation.isPending}
                    loading={createMutation.isPending}
                  >
                    {t("Tạo phiếu")}
                  </Btn>
                </div>
              </>
            }
          >
            {body}
          </TaoPxkMobileShell>
        );
      })()}
      {suaTienTaoId && (() => {
        const r = (khaDungData?.rows ?? []).find((x) => x.id === suaTienTaoId);
        return r ? (
          <SuaTienDongModal
            don={{ ...r, tien_uoc_tinh: goiYTheoDong.get(r.id)?.tien_uoc_tinh ?? null }}
            addToast={addToast}
            onClose={() => setSuaTienTaoId(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung"] });
              qc.invalidateQueries({ queryKey: ["pxk-goi-y-so-tien"] });
            }}
          />
        ) : null;
      })()}
      {detailId && (
        <PxkDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          canKho={canKho}
          canKeToan={canKeToan}
          canDownloadMisa={canDownloadMisa}
          currentEmail={currentEmail}
          isAdmin={isAdmin}
          navRows={data?.rows}
          onNavigate={setDetailId}
        />
      )}
    </div>
  );
}


// GET /phieu-xuat-kho/:id - dung CHUNG cho Drawer chi tiet VA dong xo xuong o danh sach (cung queryKey -> 1 cache, moi
// thao tac o 1 noi lam moi ca noi kia).
interface PxkDetailData {
  phieuXuatKho: PhieuXuatKhoRow & { trang_thai: string };
  donHang: DonHangRow[];
  tongTienUocTinh: number;
  logs: Array<{ id: number; trang_thai: string; nguoi_xu_ly: string; ngay_xu_ly: string; ghi_chu: string | null }>;
  // Mau MISA duoc de xuat theo settings_loai_de_xuat cua cac dong trong phieu (them 2026-09-10) - dung de to mau noi
  // bat 1 trong 3 nut tai MISA, xem MISA_TEMPLATE_ORDER.map.
  misaTemplateDeXuat: MisaTemplate | null;
  // Quy du cua nguoi nhan hang + cac lan Ke toan duyet/tu choi khoan chuyen (migration 0047).
  quyDu?: number;
  khoanChuyen?: KhoanChuyenTien[];
}
function pxkDetailQuery(id: string) {
  return { queryKey: ["pxk-detail", id], queryFn: () => api.get<PxkDetailData>(`/phieu-xuat-kho/${id}`) };
}

// Noi dung XO XUONG cua 1 dong PXK trong danh sach (2026-09-29, phan hoi "tạo bảng danh sách dạng phiếu gốc, ấn xổ
// xuống sẽ có danh sách các dòng đơn hàng chi tiết bên trong... format giống kiểu ảnh 2 [danh sách đơn nhóm theo KTV],
// 1 dòng phiếu, và các dòng đơn con bên dưới"). Tai lazy CHI khi mo (dung chung cache "pxk-detail" voi Drawer), bang
// dong + moi thao tac tung dong = PxkDongDonHangTable (y het "Dòng đơn hàng" trong chi tiet phieu).
function PxkDongMoRong({
  pxkId, addToast, qc, canTacNghiep, canKho, canKeToan, currentEmail, isAdmin,
}: {
  pxkId: string; addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean; canKho: boolean; canKeToan: boolean; currentEmail: string; isAdmin: boolean;
}) {
  const [donDetailId, setDonDetailId] = useState<string | null>(null);
  const [suaTienDonId, setSuaTienDonId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery(pxkDetailQuery(pxkId));
  const donSua = suaTienDonId ? data?.donHang.find((x) => x.id === suaTienDonId) : undefined;
  return (
    // Kieu GON (2026-09-29, nguoi dung chon "Lưới cột chung"): KHONG khung tieu de/nut rieng, dong don nam sat duoi dong
    // phieu - thut le + vach trai mau chinh + nen nhat; moi phieu cung 1 bo do rong cot (COT_GON) nen thang hang.
    <div className="border-l-2 border-[var(--color-primary)] bg-[var(--color-surface-soft)] pl-6" onClick={(e) => e.stopPropagation()}>
      {isLoading ? (
        <div className="px-2 py-1.5 text-xs text-[var(--color-text-secondary)]">{t("Đang tải dòng đơn…")}</div>
      ) : isError || !data ? (
        <div className="px-2 py-1.5 text-xs text-[var(--color-danger)]">
          {t("Không tải được dòng đơn.")}
          <button type="button" className="underline" onClick={() => void refetch()}>{t("Thử lại")}</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <PxkDongDonHangTable
            gon
            pxkId={pxkId}
            pxk={data.phieuXuatKho}
            donHang={data.donHang}
            canTacNghiep={canTacNghiep}
            canKeToan={canKeToan}
            addToast={addToast}
            onOpenDon={setDonDetailId}
            onSuaTien={setSuaTienDonId}
            giuPhieuTrong={false}
          />
        </div>
      )}
      {donDetailId && (
        <DonHangDetailModal
          id={donDetailId}
          onClose={() => setDonDetailId(null)}
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          canTPDvbhXacNhan={false}
          canActAsTram={false}
          currentEmail={currentEmail}
          isAdmin={isAdmin}
          canXemChiTietCa={false}
          canKho={canKho}
        />
      )}
      {donSua && (
        <SuaTienDongModal
          don={donSua}
          addToast={addToast}
          onClose={() => setSuaTienDonId(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["pxk-detail", pxkId] });
            qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
          }}
        />
      )}
    </div>
  );
}

export function PxkDetailModal({
  id, onClose, addToast, qc, canTacNghiep, canKho, canKeToan, canDownloadMisa, currentEmail, isAdmin, navRows, onNavigate,
}: {
  id: string; onClose: () => void; addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>; canTacNghiep: boolean; canKho: boolean; canKeToan: boolean;
  canDownloadMisa: boolean;
  currentEmail: string; isAdmin: boolean;
  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "Drawer + Next/Previous") - xem comment day du o
  // DonHangDetailModal (cung pattern).
  navRows?: PhieuXuatKhoRow[];
  onNavigate?: (id: string) => void;
}) {
  const [ghiChu, setGhiChu] = useState("");
  const [maVanDonInput, setMaVanDonInput] = useState("");
  const [maXuatKhoDraft, setMaXuatKhoDraft] = useState("");
  const [maMisaDraft, setMaMisaDraft] = useState("");
  // Id phieu dang MO them cac mau MISA khong de xuat (mac dinh chi hien nut de xuat - 2026-10-05); luu theo id de chuyen
  // phieu (←/→) tu thu gon lai.
  const [moMauMisaKhac, setMoMauMisaKhac] = useState<string | null>(null);
  const [uploadingAnh, setUploadingAnh] = useState(false);
  // Ly do cham / tien cong no / bo don tung dong: nam trong PxkDongDonHangTable.tsx (tach 2026-09-29).
  // 4 state moi (2026-09-21, phan hoi "cho phép Kế toán/TN sửa lại thông tin đơn ở bước chờ KTV
  // chuyển tiền") - xem 4 khoi lien quan ben duoi (mutation + JSX).
  const [donDetailId, setDonDetailId] = useState<string | null>(null);
  // MOI (2026-09-22, phan hoi "Khi ấn vào tiền số tiền ước tính, mở popup UI giao diện sửa tiền gồm
  // sửa SL thực xuất và đơn giá thực tế") - popup gon rieng cho loai_don "mua", tranh phai mo het
  // DonHangDetailModal chi de sua 2 truong nay.
  const [suaTienDonId, setSuaTienDonId] = useState<string | null>(null);
  const [showThemDon, setShowThemDon] = useState(false);
  const [themDonSelected, setThemDonSelected] = useState<Set<string>>(new Set());
  const [themDonQ, setThemDonQ] = useState("");
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #19): goi y nhanh tu CUNG danh muc "Mua hang" da
  // dung o luong TN tu choi (settings_ly_do_cham, migration 0065 - da xac nhan he_thong_su_dung chua
  // toan bo 12 ly do co san deu ap dung duoc cho ca ngu canh "vi sao PXK dong nay bi cham") - chon 1
  // muc se DIEN SAN vao o nhap tu do ben canh (van la truong TEXT tren dat_don_hang.ly_do_cham,
  // KHONG doi thanh FK), giu duoc truong hop ly do khong co san trong danh muc.
  const { data: lyDoChamGoiYData } = useQuery({
    queryKey: ["dat-mua-lk-ly-do-cham"],
    queryFn: () => api.get<{ rows: LyDoChamRow[] }>("/dat-mua-lk/ly-do-cham?he_thong=" + encodeURIComponent("Mua hàng")),
    enabled: canTacNghiep,
  });
  const { data, isLoading } = useQuery(pxkDetailQuery(id));
  // "Tải danh sách chi tiết" CUA RIENG phieu nay (2026-10-02) - cung endpoint + cung dinh dang file voi nut o danh sach
  // Don hang (DonCuaToiTab handleDownloadFullList), chi loc theo pxk_id, moi loai don (gom ca tra hang).
  const personDir = usePersonDirectory();
  const [dangTaiDs, setDangTaiDs] = useState(false);
  async function taiDanhSachDon() {
    setDangTaiDs(true);
    try {
      const res = await api.get<{ rows: DonHangRow[] }>("/dat-mua-lk/don-hang" + buildQuery({ pxk_id: id, loai_don: "all" }));
      await exportRowsToExcel(doiNguoiThanhTen(res.rows, personDir), `don_hang_${id}.xlsx`, "Đơn hàng");
    } catch (err) {
      addToast(t("Không tải được danh sách chi tiết: ") + describeApiError(err));
    } finally {
      setDangTaiDs(false);
    }
  }

  // Bao nhan thieu (migration 0075): ticket dang cho Kho kiem tra -> an "KTV đã nhận" (backend cung chan).
  const [showBaoThieu, setShowBaoThieu] = useState(false);
  const { data: nhanThieuData } = useQuery(nhanThieuPxkQuery(id));
  const dangBaoThieu = !!nhanThieuData?.tickets.some((tk) => tk.trang_thai === "Cho kho kiem tra");
  function invalidate() {
    setGhiChu("");
    setMaVanDonInput("");
    qc.invalidateQueries({ queryKey: ["pxk-detail", id] });
    qc.invalidateQueries({ queryKey: ["nhan-thieu-pxk", id] });
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
    invalidatePipelineCounts(qc);
  }

  const logMutation = useMutation({
    mutationFn: (trang_thai: string) =>
      api.post(`/phieu-xuat-kho/${id}/log`, {
        trang_thai,
        ghi_chu: ghiChu.trim() || undefined,
        ma_van_don: trang_thai === "Dang gui KTV" ? maVanDonInput.trim() || undefined : undefined,
      }),
    onSuccess: () => { invalidate(); addToast(t("Đã cập nhật trạng thái")); },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "THIEU_LY_DO_CHAM") {
        addToast(t("Còn dòng chưa nhập Lý do chậm (quá 24h) - điền ở bảng dòng đơn hàng bên dưới trước khi gửi kế toán"));
      } else if (code === "MA_XUAT_KHO_CHUA_XAC_NHAN") {
        addToast(t("Cần nhập Mã đơn hàng trước khi gửi kế toán"));
      } else if (code === "MISSING_MA_MISA") {
        addToast(t("Cần nhập Mã MISA trước khi chốt xong đơn xuất"));
      } else if (code === "MISSING_GHI_CHU") {
        addToast(t("Cần nhập ghi chú/lý do trước"));
      } else {
        addToast(t("Lỗi: ") + describeApiError(err));
      }
    },
  });

  // Mutation RIENG cho huy PXK (them 2026-09-22, phan hoi "bổ sung việc cho hủy PXK bị lỗi hoặc không
  // còn nhu cầu đặt hàng nữa") - khong tai dung logMutation (dung chung string don gian cho 8 nut
  // trang thai khac) vi can gui kem "ly_do_huy_pxk" de backend biet giai phong hay huy han cac don
  // dang gom trong phieu (xem POST /:id/log nhanh "Ke toan huy").
  const huyPxkMutation = useMutation({
    mutationFn: (lyDoHuyPxk: "loi" | "khong_con_nhu_cau") =>
      api.post(`/phieu-xuat-kho/${id}/log`, { trang_thai: "Ke toan huy", ghi_chu: ghiChu.trim() || undefined, ly_do_huy_pxk: lyDoHuyPxk }),
    onSuccess: () => {
      invalidate();
      // FIX (phan hoi 2026-09-22 "đơn hủy vẫn hiện trong ds cần xử lý"): ca 2 ly do huy deu UPDATE
      // truc tiep N dong dat_don_hang o backend (giai phong ma_xuat_kho hoac chuyen "Da huy") nhung
      // truoc day khong invalidate danh sach nay - "Đơn của tôi" (DonCuaToiTab.tsx) neu dang mo cung
      // phien SPA se hien du lieu cu tu cache React Query cho toi khi F5.
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung-counts"] });
      addToast(t("Đã huỷ phiếu xuất kho"));
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      addToast(code === "MISSING_GHI_CHU" ? t("Cần nhập ghi chú/lý do trước khi huỷ") : t("Lỗi: ") + describeApiError(err));
    },
  });

  const maXuatKhoMutation = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${id}/ma-xuat-kho`, { ma_xuat_kho: maXuatKhoDraft.trim() }),
    onSuccess: () => { setMaXuatKhoDraft(""); qc.invalidateQueries({ queryKey: ["pxk-detail", id] }); qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] }); invalidatePipelineCounts(qc); addToast(t("Đã lưu mã đơn hàng")); },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  const maMisaMutation = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${id}/ma-misa`, { ma_misa: maMisaDraft.trim() }),
    onSuccess: () => { setMaMisaDraft(""); qc.invalidateQueries({ queryKey: ["pxk-detail", id] }); qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] }); invalidatePipelineCounts(qc); addToast(t("Đã lưu mã MISA")); },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  // Co phu "Da in phieu" (migration 0032, phan hoi 2026-09-24) - CHI cap nhat 1 co theo doi cua Kho,
  // khong dung logMutation (khong ghi phieu_xuat_kho_log, khong doi trang_thai_hien_tai).
  const daInPhieuMutation = useMutation({
    mutationFn: (daInPhieu: boolean) => api.patch(`/phieu-xuat-kho/${id}/da-in-phieu`, { da_in_phieu: daInPhieu }),
    // + so dem menu "Đã chốt xong đơn xuất"/"Phiếu đã in" (2026-09-29) - phieu chuyen muc ngay khi danh dau/bo danh dau.
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pxk-detail", id] }); qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] }); qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-status-counts"] }); },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  // Tai file import MISA CHO DUNG PXK nay (them 2026-09-02, xem lib/misaExport.ts o backend +
  // lib/misaExportTemplates.ts o frontend). Chi can "Mã đơn hàng" da xac nhan (dung lam "Số chứng
  // từ") - nut dat canh gia tri Mã đơn hàng, khong bat buoc phieu da xong. SUA (phan hoi "tạo 3
  // button, TN muốn tải mẫu nào thì tải"): nhan template tu UI, EP toan bo dong vao dung mau do.
  const misaExportMutation = useMutation({
    mutationFn: (template: MisaTemplate) => api.get<MisaExportResult>(`/phieu-xuat-kho/${id}/misa-export` + buildQuery({ template })),
    onSuccess: async (result) => {
      const ok = await downloadMisaExport(result.sheets, `MISA_${pxk?.ma_xuat_kho || id}.xlsx`);
      toastKetQuaMisa(result, ok, addToast);
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  async function handleUploadAnhBienBan(file: File) {
    setUploadingAnh(true);
    try {
      const gui = await anhVuaGioiHan(file);
      const res = await api.postBinary<{ ok: true; url: string; han_muc_anh?: HanMucAnh | null }>(`/phieu-xuat-kho/${id}/anh-bien-ban`, await gui.arrayBuffer(), gui.type || "image/jpeg");
      qc.invalidateQueries({ queryKey: ["pxk-detail", id] });
      addToast(t("Đã tải ảnh biên bản"));
      canhBaoHanMucAnh(res.han_muc_anh, addToast);
    } catch (err) {
      baoLoiTaiAnh(err, addToast, describeApiError);
    } finally {
      setUploadingAnh(false);
    }
  }


  // SUA (2026-09-22): khong con nhan so tien go tay - luon gui dung tong "(ước tính)" da tinh san o
  // tongTienUocTinhPxk (xem giai thich day du canh dinh nghia bien do).
  const yeuCauChuyenTienMutation = useMutation({
    mutationFn: (so_tien: number) => api.post(`/phieu-xuat-kho/${id}/chuyen-tien`, { so_tien }),
    onSuccess: () => { invalidate(); addToast(t("Đã yêu cầu chuyển tiền")); },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });




  // Danh sach dong "kha dung" de them vao phieu DANG XEM - tai dung dung endpoint/loai_don nhu luc tao
  // PXK moi, loc them phia client theo nguoi_nhan_hang cua CHINH pxk nay (backend van validate lai
  // chat trong POST /:id/dong nen khong rui ro neu loc sot o day).
  const { data: themDonKhaDungData, isLoading: themDonKhaDungLoading } = useQuery({
    queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung", data?.phieuXuatKho.loai_don],
    queryFn: () => api.get<{ rows: DonHangKhaDungRow[] }>("/phieu-xuat-kho/don-hang-kha-dung" + buildQuery({ loai_don: data?.phieuXuatKho.loai_don ?? undefined })),
    enabled: showThemDon && !!data?.phieuXuatKho.loai_don,
    staleTime: 0, // luon tai moi khi mo "Thêm đơn" (cung ly do voi modal tao phieu, 2026-09-29)
  });
  const themDonQNorm = themDonQ.trim().toLowerCase().normalize("NFC");
  const themDonLoc = (themDonKhaDungData?.rows ?? []).filter(
    (r) =>
      r.nguoi_nhan_hang === data?.phieuXuatKho.nguoi_nhan_hang &&
      // Phieu "Cho ke toan" (v1.442) chi nhan don da duyet (backend chan don "Cho thanh toan").
      (data?.phieuXuatKho.trang_thai !== "Cho ke toan" || r.trang_thai_hien_tai !== "Cho thanh toan") &&
      khopDongKhaDung(r, themDonQNorm),
  );

  const themDonMutation = useMutation({
    mutationFn: () => api.post<{ ok: true; added: number }>(`/phieu-xuat-kho/${id}/dong`, { dat_don_hang_ids: [...themDonSelected] }),
    onSuccess: (res) => {
      setShowThemDon(false);
      setThemDonSelected(new Set());
      setThemDonQ("");
      invalidate();
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung-counts"] });
      addToast(t("Đã thêm {a} đơn vào phiếu", { a: res.added }));
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });


  const pxk = data?.phieuXuatKho;
  // Backend la nguon tinh tien duy nhat: tong nay cung ket qua voi loai chiet khau va tien uoc tinh
  // tung dong; fallback chi de tuong thich trong luc client/server cu moi dang duoc cap nhat.
  const tongTienUocTinhPxk = data?.tongTienUocTinh ?? (data?.donHang ?? []).reduce(
    (s, d) =>
      s +
      (pxk?.loai_don === "cong_no"
        ? d.so_tien_cong_no ?? 0
        : (d.gia_chot ?? d.gia_de_xuat ?? 0) * (d.so_luong_thuc_xuat ?? d.so_luong_de_xuat)),
    0,
  );
  const trangThai = pxk?.trang_thai ?? "";
  const isDong = ["KTV da nhan", "Ke toan huy", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"].includes(trangThai);
  const chuyenTienOk = pxk?.so_tien_can_chuyen == null || pxk.trang_thai_chuyen_tien === "TN da duyet";
  const ktvDisplayMap = useKtvDisplayMap();
  const tenLog = useTenNguoiLog();
  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "Drawer + Next/Previous") - xem comment day du o
  // DonHangDetailModal (cung pattern, navRows undefined = -1 = an het nut).
  const navIndex = navRows?.findIndex((r) => r.id === id) ?? -1;
  // Phieu trong (TN bo het don / doi trang thai don cuoi tu man nay) -> dong man hoac chuyen sang phieu khac thi
  // TU HUY phieu (chot 2026-09-28, muc 3 "phiếu trống nếu người dùng tắt đi sẽ tự hủy bỏ").
  const phieuTrong = !!pxk && trangThai === "Dang tao phieu" && (data?.donHang.length ?? 0) === 0;
  async function roiPhieu(tiepTheo: () => void) {
    if (phieuTrong && (canTacNghiep || canKeToan)) {
      try {
        const r = await api.post<{ da_huy: boolean }>(`/phieu-xuat-kho/${id}/huy-neu-trong`, {});
        if (r.da_huy) {
          addToast(t("Phiếu {a} không còn đơn nào — đã tự hủy", { a: id }));
          invalidate();
        }
      } catch (err) {
        addToast(t("Không tự hủy được phiếu trống: ") + describeApiError(err));
      }
    }
    tiepTheo();
  }
  const dongPhieu = () => void roiPhieu(onClose);
  const sangPhieu = (x: string) => void roiPhieu(() => onNavigate?.(x));
  // Phase 4 (phim tat): ←/→ dieu huong dong truoc/sau giong het DrawerNavButtons ben duoi.
  useDrawerArrowNav({
    hasPrev: !!(onNavigate && navRows && navIndex > 0),
    hasNext: !!(onNavigate && navRows && navIndex >= 0 && navIndex < navRows.length - 1),
    onPrev: () => navRows && navIndex > 0 && sangPhieu(navRows[navIndex - 1].id),
    onNext: () => navRows && navIndex >= 0 && navIndex < navRows.length - 1 && sangPhieu(navRows[navIndex + 1].id),
  });

  // SUA (phan hoi 2026-09-02: "thống nhất toàn bộ UI theo 1 phong cách... chuyển toàn bộ sang cố
  // định footer ở dưới") - khoi ghi chu/nut thao tac chinh chuyen thanh Drawer footer (co dinh, luon
  // hien) thay vi nam INLINE trong than modal, dong bo voi DonCuaToiTab/ThieuLkTab/TraHangTab (3 tab
  // kia da dung pattern nay tu truoc). "Lịch sử xử lý" (o duoi cung than modal) khong bi anh huong -
  // van la noi dung SAU CUNG trong vung cuon, tach biet hoan toan voi footer.
  const footer =
    !isLoading && pxk && !isDong ? (
      <div className="space-y-2">
        {/* Muc E (Dot 2): Kho tach rieng "Ma van don" khoi ghi chu chung, chi ap dung luc chuyen
            "Dang gui KTV". */}
        {canKho && trangThai === "Da chot xong don xuat" && pxk.loai_don !== "tra_hang" && (
          <input
            value={maVanDonInput}
            onChange={(e) => setMaVanDonInput(e.target.value)}
            placeholder={t("Mã vận đơn (tuỳ chọn, áp dụng khi bấm Đang gửi KTV)")}
            className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        )}
        <input
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          placeholder={
            canKeToan && trangThai === "Cho ke toan"
              ? t("Ghi chú (bắt buộc nếu bấm Huỷ / Trả về chờ mã HĐ)")
              : (canKho || canKeToan) && trangThai === "Da chot xong don xuat"
                ? t("Ghi chú (bắt buộc nếu bấm Đẩy lùi về chờ mã MISA)")
              : canKho && trangThai === "Dang gui KTV" && pxk.loai_don !== "tra_hang"
                ? t("Ghi chú (bắt buộc nếu bấm Đẩy lùi về chờ gửi)")
              : (canTacNghiep || canKeToan) && ["Dang tao phieu", "Cho ke toan"].includes(trangThai)
                ? t("Ghi chú (bắt buộc nếu bấm Huỷ)")
                : t("Ghi chú (tuỳ chọn)")
          }
          className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        {/* FIX (phan hoi 2026-09-09: "button trong drawer qua nho, lam to va co chu - chi icon
            tren table moi can nho") - truoc day hang nut WORKFLOW nay dung chung 1 pattern voi
            action icon o TABLE (size="sm" + className="px-2" thu hep, nhieu nut chi con 1 icon
            khong chu). Trong DRAWER (khong bi gioi han be rong 1 dong nhu table) khong con ly do
            nen giu nho/an chu - doi sang size="md" + luon hien chu, bo "px-2". Cac nut trong TABLE
            (DonCuaToiTab.tsx/ThieuLkTab.tsx cot "hanh dong") KHONG doi, van giu icon nho vi phai
            gon trong 1 dong danh sach. */}
        <div className="flex gap-2 flex-wrap">
          {canTacNghiep && trangThai === "Dang tao phieu" && (
            <Btn
              onClick={() => logMutation.mutate("Cho ke toan")}
              disabled={logMutation.isPending || !chuyenTienOk || !pxk.ma_xuat_kho_xac_nhan}
              title={!chuyenTienOk ? t("Cần Kế toán duyệt bằng chứng chuyển tiền trước") : !pxk.ma_xuat_kho_xac_nhan ? t("Cần nhập Mã đơn hàng trước") : t("Gửi kế toán")}
              aria-label={t("Gửi kế toán")}
            >
              {t("📤 Gửi kế toán")}
            </Btn>
          )}
          {/* Ke toan duyet nhanh (v1.441): Ma don hang = ID phieu, Ma PXK = PXK-ID, gui ke toan - DuyetNhanhPxk.tsx. */}
          {canKeToan && (trangThai === "Dang tao phieu" || (trangThai === "Cho ke toan" && !pxk.ma_misa)) && (
            <NutKtDuyetNhanh pxk={{ ...pxk, id, trang_thai: trangThai }} addToast={addToast} />
          )}
          {(canTacNghiep || canKeToan) && ["Dang tao phieu", "Cho ke toan"].includes(trangThai) && (
            // FIX (phan hoi 2026-08-25, hang muc #19): ghi_chu nay BAT BUOC o backend - disable
            // nut khi chua nhap (truoc day khong bat buoc gi).
            // SUA (2026-09-22, phan hoi "bổ sung việc cho hủy PXK bị lỗi hoặc không còn nhu cầu đặt
            // hàng nữa"): tach 1 nut "Kế toán huỷ" cu thanh 2 nut theo ly do, vi 2 ly do dan toi 2 ket
            // cuc khac han cho cac don dang gom trong phieu (xem POST /:id/log nhanh "Ke toan huy").
            <>
              <Btn
                variant="danger"
                onClick={() => huyPxkMutation.mutate("loi")}
                disabled={huyPxkMutation.isPending || !ghiChu.trim()}
                title={!ghiChu.trim() ? t("Cần nhập ghi chú/lý do huỷ trước") : t("Huỷ phiếu, các đơn bên trong quay lại khả dụng để gom vào phiếu khác")}
                aria-label={t("Huỷ - phiếu bị lỗi")}
              >
                🗑 {t("Huỷ (phiếu lỗi)")}
              </Btn>
              <Btn
                variant="danger"
                onClick={() => huyPxkMutation.mutate("khong_con_nhu_cau")}
                disabled={huyPxkMutation.isPending || !ghiChu.trim()}
                title={!ghiChu.trim() ? t("Cần nhập ghi chú/lý do huỷ trước") : t("Huỷ phiếu VÀ huỷ luôn các đơn bên trong (không hoàn tác được)")}
                aria-label={t("Huỷ - không còn nhu cầu")}
              >
                🗑 {t("Huỷ (không còn nhu cầu)")}
              </Btn>
            </>
          )}
          {canKeToan && trangThai === "Cho ke toan" && (
            <Btn
              onClick={() => logMutation.mutate("Da chot xong don xuat")}
              disabled={logMutation.isPending || !pxk.ma_misa}
              loading={logMutation.isPending}
              title={!pxk.ma_misa ? t("Cần nhập Mã MISA trước") : t("Đã chốt xong đơn xuất")}
              aria-label={t("Đã chốt xong đơn xuất")}
            >
              {t("✅ Đã chốt xong đơn xuất")}
            </Btn>
          )}
          {/* Ke toan chot + xac nhan "Hang tru kho" 1 buoc, ket thuc phieu (2026-10-12) - hang khong giao vat ly, khong qua Kho. */}
          {canKeToan && trangThai === "Cho ke toan" && pxk.loai_don !== "tra_hang" && (
            <Btn
              variant="ghost"
              onClick={() => {
                if (window.confirm(t("Chốt xong đơn xuất và xác nhận HÀNG TRỪ KHO để kết thúc phiếu {a}? Phiếu không chuyển sang Kho gửi hàng.", { a: id }))) logMutation.mutate("Hang tru kho");
              }}
              disabled={logMutation.isPending || !pxk.ma_misa}
              title={!pxk.ma_misa ? t("Cần nhập Mã MISA trước") : t("Chốt xong và kết thúc phiếu bằng Hàng trừ kho (không qua Kho)")}
              aria-label={t("Hàng trừ kho")}
            >
              {t("📦 Hàng trừ kho")}
            </Btn>
          )}
          {/* Day lui "Chờ mã MISA" -> "Chờ mã HĐ" (2026-09-29) - Ke toan tra phieu ve TN, bat buoc ly do (o ghi chu). */}
          {canKeToan && trangThai === "Cho ke toan" && (
            <Btn
              variant="ghost"
              onClick={() => logMutation.mutate("Dang tao phieu")}
              disabled={logMutation.isPending || !ghiChu.trim()}
              title={!ghiChu.trim() ? t("Nhập lý do trả về vào ô Ghi chú trước") : t("Trả phiếu về bước Chờ mã HĐ để Tác nghiệp sửa rồi gửi kế toán lại")}
              aria-label={t("Trả về chờ mã HĐ")}
            >
              {t("↩ Trả về chờ mã HĐ")}
            </Btn>
          )}
          {/* SUA (migration 0002_tra_hang_pxk.sql): PXK tra hang KHONG co buoc "dang gui" trung
              gian (hang khong phai ship di dau) - chi 1 nut Kho xac nhan da nhan hang VE kho. */}
          {canKho && trangThai === "Da chot xong don xuat" && pxk.loai_don === "tra_hang" && (
            <Btn onClick={() => logMutation.mutate("Kho da nhan hang tra")} disabled={logMutation.isPending} loading={logMutation.isPending} title={t("Kho đã nhận hàng trả")} aria-label={t("Kho đã nhận hàng trả")}>
              {t("📥 Kho đã nhận hàng trả")}
            </Btn>
          )}
          {canKho && trangThai === "Da chot xong don xuat" && pxk.loai_don !== "tra_hang" && (
            <>
              <Btn onClick={() => logMutation.mutate("Dang gui KTV")} disabled={logMutation.isPending} loading={logMutation.isPending} title={t("Đang gửi KTV")} aria-label={t("Đang gửi KTV")}>
                {t("🚚 Đang gửi KTV")}
              </Btn>
              <Btn variant="ghost" onClick={() => logMutation.mutate("Hang tru kho")} disabled={logMutation.isPending} title={t("Hàng trừ kho")} aria-label={t("Hàng trừ kho")}>
                {t("📦 Hàng trừ kho")}
              </Btn>
            </>
          )}
          {/* Day lui "Đã chốt xong đơn xuất" -> "Chờ mã MISA" (2026-10-07) - Kho/Ke toan tra phieu ve Ke toan, bat buoc ly do (o ghi chu). */}
          {(canKho || canKeToan) && trangThai === "Da chot xong don xuat" && (
            <Btn
              variant="ghost"
              onClick={() => logMutation.mutate("Cho ke toan")}
              disabled={logMutation.isPending || !ghiChu.trim()}
              title={!ghiChu.trim() ? t("Nhập lý do đẩy lùi vào ô Ghi chú trước") : t("Trả phiếu về bước Chờ mã MISA để Kế toán kiểm tra/sửa rồi chốt lại")}
              aria-label={t("Đẩy lùi về chờ mã MISA")}
            >
              {t("↩ Đẩy lùi về chờ mã MISA")}
            </Btn>
          )}
          {/* Co phu "Da in phieu" (migration 0032, phan hoi 2026-09-24: "ở giai đoạn chờ kho gửi hàng
              cho ktv, thêm 1 trạng thái phụ là đã in phiếu/ chưa in phiếu để kho xác định được phiếu
              nào đã in") - thuan tuy theo doi, KHONG anh huong nut/luong khac. SUA (phan hoi 2026-09-24,
              kem anh chup: "các button cho xuống dưới cùng với nhau cho thống nhất") - gop vao CHUNG 1
              hang voi cac nut workflow khac (truoc day dung rieng 1 dong giua 2 o nhap, lech voi hang
              nut). */}
          {canKho && ["Da chot xong don xuat", "Dang gui KTV"].includes(trangThai) && pxk.loai_don !== "tra_hang" && (
            <Btn
              variant={pxk.da_in_phieu ? "primary" : "ghost"}
              onClick={() => daInPhieuMutation.mutate(!pxk.da_in_phieu)}
              disabled={daInPhieuMutation.isPending}
              title={t("Đánh dấu đã in/chưa in phiếu (chỉ để Kho theo dõi, không ảnh hưởng luồng xử lý)")}
            >
              {pxk.da_in_phieu ? t("🖨 Đã in phiếu (bấm để bỏ đánh dấu)") : t("🖨 Đánh dấu đã in phiếu")}
            </Btn>
          )}
          {/* Muc F (Dot 2): CHOT bat buoc DUNG nguoi nhan hang xac nhan - an nut voi moi nguoi
              khac (ke ca Admin/TN xem, du backend van cho Admin bam duoc de xu ly su co). */}
          {trangThai === "Dang gui KTV" && currentEmail === pxk.nguoi_nhan_hang && !dangBaoThieu && (
            <Btn onClick={() => logMutation.mutate("KTV da nhan")} disabled={logMutation.isPending} loading={logMutation.isPending} title={t("KTV đã nhận")} aria-label={t("KTV đã nhận")}>
              {t("📥 KTV đã nhận")}
            </Btn>
          )}
          {/* Bao nhan thieu / khong nhan duoc hang (2026-10-12) - nguoi nhan hang hoac TN bao ho. */}
          {trangThai === "Dang gui KTV" && pxk.loai_don !== "tra_hang" && !nhanThieuData?.co_ticket_mo && (currentEmail === pxk.nguoi_nhan_hang || canTacNghiep) && (
            <Btn variant="danger" onClick={() => setShowBaoThieu(true)} title={t("Báo nhận thiếu / không nhận được hàng")}>
              {t("⚠ Báo nhận thiếu")}
            </Btn>
          )}
          {trangThai === "Dang gui KTV" && currentEmail !== pxk.nguoi_nhan_hang && isAdmin && !dangBaoThieu && (
            <Btn variant="ghost" onClick={() => logMutation.mutate("KTV da nhan")} disabled={logMutation.isPending} title={t("KTV đã nhận (Admin xác nhận thay - trường hợp đặc biệt)")} aria-label={t("KTV đã nhận (Admin xác nhận thay)")}>
              🛡️📥 {t("KTV đã nhận (thay)")}
            </Btn>
          )}
          {canKho && trangThai === "Dang gui KTV" && (
            <Btn variant="ghost" onClick={() => logMutation.mutate("Kho da ket thuc")} disabled={logMutation.isPending} title={t("Kho đã kết thúc (KTV không phản hồi)")} aria-label={t("Kho đã kết thúc (KTV không phản hồi)")}>
              {t("⏹️ Kho đã kết thúc")}
            </Btn>
          )}
          {/* Day lui "Đang gửi KTV" -> "Đã chốt xong đơn xuất" (2026-10-22, v1.394) - Kho bam nham / hang chua di, bat buoc ly do. */}
          {canKho && trangThai === "Dang gui KTV" && pxk.loai_don !== "tra_hang" && (
            <Btn
              variant="ghost"
              onClick={() => logMutation.mutate("Da chot xong don xuat")}
              disabled={logMutation.isPending || !ghiChu.trim() || dangBaoThieu}
              title={dangBaoThieu ? t("Phiếu đang có báo nhận thiếu — xử lý ticket trước") : !ghiChu.trim() ? t("Nhập lý do đẩy lùi vào ô Ghi chú trước") : t("Đưa phiếu về bước Chờ gửi KTV (Kho chưa gửi hàng)")}
              aria-label={t("Đẩy lùi về chờ gửi")}
            >
              {t("↩ Đẩy lùi về chờ gửi")}
            </Btn>
          )}
        </div>
      </div>
    ) : null;

  // Khoi "Chuyển tiền" - App KTV (khong phai TN/Kho/Ke toan/Admin) dua len TREN CUNG chi tiet phieu (2026-10-20, "giao diện App KTV
  // phiếu tiền => hiện phần tiền cần chuyển lên ưu tiên trên cùng"); van phong giu vi tri cu trong luoi the.
  const uuTienTien = !canTacNghiep && !canKho && !canKeToan && !isAdmin && pxk?.so_tien_can_chuyen != null;
  const veKhoiChuyenTien = (pxk: NonNullable<typeof data>["phieuXuatKho"]) => (
    <div className="border border-[var(--line)] rounded-lg p-3">
      <SectionTitle icon="💲" iconTone="teal">{t("Chuyển tiền")}</SectionTitle>
      {pxk.doi_tac_ma ? (
        // Phieu MUA HÀNG CÔNG NỢ ĐỐI TÁC (v1.403): khong chuyen tien - ghi no doi tac khi Ke toan chot phieu.
        <div className="text-sm space-y-0.5">
          <div>
            {t("Công nợ đối tác")}: <b>{pxk.doi_tac_ten ?? pxk.doi_tac_ma}</b> <span className="font-mono text-xs text-[var(--ink-400)]">({pxk.doi_tac_ma})</span>
          </div>
          <div>
            {t("Ghi nợ")}: <b><Money>{fmtVND(tongTienUocTinhPxk)}</Money></b>{" "}
            <span className="text-xs text-[var(--color-text-secondary)]">
              {["Dang tao phieu", "Cho ke toan", "Ke toan huy"].includes(trangThai) ? t("— ghi nợ khi Kế toán chốt phiếu") : t("— đã ghi nợ đối tác")}
            </span>
          </div>
          <div className="text-xs text-[var(--ink-400)]">{t("Không cần chuyển tiền")}</div>
        </div>
      ) : pxk.so_tien_can_chuyen == null ? (
        canTacNghiep && trangThai === "Dang tao phieu" ? (
          <div className="flex gap-2 items-end">
            {/* SUA (2026-09-22, phan hoi "tổng tiền cần chuyển sẽ tự động = tổng tiền ước tính
                trong danh sách các đơn"): bo o nhap tu do, chi hien so da tu tinh (read-only) -
                nut "Yêu cầu chuyển" gui thang tongTienUocTinhPxk, khong con go tay duoc. */}
            <div className="flex-1 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm">
              <Money>{fmtVND(tongTienUocTinhPxk)}</Money> <span className="text-[var(--ink-400)]">{t("(tự động)")}</span>
            </div>
            <Btn size="sm" onClick={() => yeuCauChuyenTienMutation.mutate(tongTienUocTinhPxk)} disabled={tongTienUocTinhPxk <= 0 || yeuCauChuyenTienMutation.isPending}>{t("Yêu cầu chuyển")}</Btn>
          </div>
        ) : (
          <span className="text-[var(--ink-400)] text-xs">{t("Không cần chuyển tiền")}</span>
        )
      ) : (
        <>
          {/* Quy du KTV (2026-09-29, migration 0047): tong / da thanh toan / con phai chuyen / quy du. */}
          <TienPhieuVaQuy
            tong={pxk.so_tien_can_chuyen}
            daThanhToan={pxk.da_thanh_toan ?? 0}
            daDuyet={pxk.trang_thai_chuyen_tien === "TN da duyet"}
            quyDu={data?.quyDu}
            quyKh={!!pxk.quy_kh}
          />
          <TienBiBotCanhBao ds={pxk.tien_bi_bot} ten={(e) => (e ? formatNguoiDisplay(e, ktvDisplayMap) : "")} onMoDon={setDonDetailId} />
          <KvRow label={t("Trạng thái")}><StatusBadge value={pxk.trang_thai_chuyen_tien ?? ""} tones={CHUYEN_TIEN_TONE} options={CHUYEN_TIEN_OPTIONS} /></KvRow>
          {/* Nhieu anh (2026-09-29, BangChungChuyenTien.tsx) - dang "Cho KTV chuyen" thi form ben duoi tu hien anh. */}
          {pxk.trang_thai_chuyen_tien !== "Cho KTV chuyen" && docAnhBangChung(pxk).length > 0 && (
            <KvRow label={t("Bằng chứng")}><BangChungAnhPxk pxk={pxk} ten={(e) => (e ? formatNguoiDisplay(e, ktvDisplayMap) : "")} /></KvRow>
          )}
          {pxk.trang_thai_chuyen_tien !== "Cho KTV chuyen" && pxk.bang_chung_chuyen_tien_ghi_chu && (
            <KvRow label={t("Ghi chú")}><span className="text-xs text-[var(--ink-600)]">{pxk.bang_chung_chuyen_tien_ghi_chu}</span></KvRow>
          )}
          {/* Phan hoi 2026-08-19: "cho phép upload ảnh hoặc ghi chú thông tin chuyển tiền" -
              truoc day CHI co 1 o dan link tay. Gio 2 lua chon SONG SONG (co the dung ca 2):
              upload anh THAT qua Drive (giong "Ảnh biên bản") HOAC go ghi chu van ban, goi y
              nhanh tu CUNG danh muc "Lý do chậm (Mua hàng)" da dung o cot "Lý do chậm" ben duoi. */}
          {pxk.trang_thai_chuyen_tien === "Cho KTV chuyen" && (
            <BangChungChuyenTienForm
              key={`${pxk.id}|${pxk.so_tien_can_chuyen}|${pxk.bang_chung_chuyen_tien_anh ?? ""}`}
              pxkId={pxk.id}
              pxk={pxk}
              goiYGhiChu={(lyDoChamGoiYData?.rows ?? []).map((l) => l.ten_ly_do)}
              onDone={invalidate}
              addToast={addToast}
            />
          )}
          {/* SUA (phan hoi 04/09/2026: "Bước 2: 'Kế toán duyệt chuyển tiền'") - nguoi duyet
              buoc cuoi chuyen tu TN sang Ke toan, khop dung gate canKeToan o backend PATCH
              /:id/chuyen-tien nhanh "TN da duyet" (gia tri DB giu nguyen ten cu). */}
          {/* KTV / nguoi tao ho / GS up nham anh -> rut lai sua (2026-10-21); Ke toan / TN da co nut tu choi / day lai rieng. */}
          {!canKeToan && !canTacNghiep && pxk.trang_thai_chuyen_tien === "KTV da chuyen" && pxk.trang_thai !== "Ke toan huy" &&
            (currentEmail === pxk.nguoi_nhan_hang || (data?.donHang ?? []).some((d) => d.nguoi_tao === currentEmail || d.email_gs === currentEmail)) && (
            <div className="mt-2">
              <RutLaiBangChungButton pxkId={pxk.id} onDone={invalidate} addToast={addToast} />
            </div>
          )}
          {canKeToan && pxk.trang_thai_chuyen_tien === "KTV da chuyen" && (
            // + "Từ chối, đẩy lại" (2026-09-29, migration 0046) - sai tien/thieu bang chung -> ve "Chờ KTV chuyển" kem ly do.
            // Quy du (migration 0047): Ke toan nhap so THUC NHAN - du vao quy, thieu thi ve cho chuyen bo sung.
            <div className="mt-2 space-y-2">
              <DuyetChuyenTienForm
                key={`${pxk.id}|${pxk.so_tien_can_chuyen}|${pxk.da_thanh_toan ?? 0}`}
                pxkId={pxk.id}
                conPhaiChuyen={Math.max(0, pxk.so_tien_can_chuyen - (pxk.da_thanh_toan ?? 0))}
                pxk={pxk}
                onDone={invalidate}
                addToast={addToast}
              />
              <TuChoiChuyenTienButton pxkId={pxk.id} onDone={invalidate} addToast={addToast} />
            </div>
          )}
          {/* TN day lai khi KTV xac nhan nham/thieu tien (2026-09-30) - KHONG ghi so khoan chuyen tien cua Ke toan. */}
          {!canKeToan && canTacNghiep && pxk.trang_thai_chuyen_tien === "KTV da chuyen" && pxk.trang_thai !== "Ke toan huy" && (
            <div className="mt-2">
              <TuChoiChuyenTienButton pxkId={pxk.id} onDone={invalidate} addToast={addToast} laTn />
            </div>
          )}
          {(data?.khoanChuyen?.length ?? 0) > 0 && <LichSuKhoanChuyen rows={data!.khoanChuyen!} />}
        </>
      )}
    </div>
  );

  return (
    // SUA (phan hoi 2026-08-18 muc 2 + 4): rong modal tu max-w-lg (mac dinh, 512px) len max-w-2xl
    // (672px) - noi dung modal nay co toi 4-5 khoi "the" xep DOC lien tiep (Ma don hang/Ma MISA/Anh
    // bien ban/Chuyen tien/Dong don hang/Lich su), tren man hinh desktop rong ma modal van hep gay
    // cam giac "tran/qua dai" phai cuon nhieu du con thua khong gian ngang 2 ben. Cac the nho ben
    // duoi (Ma don hang/Ma MISA/Anh bien ban/Chuyen tien - phan lon LOAI TRU nhau theo trang_thai nen
    // hiem khi ca 4 cung hien) gop vao 1 grid 2 cot tu sm+ thay vi luon xep 1 cot, tan dung chieu rong
    // moi vua mo rong; bang "Dong don hang" va lich su van giu FULL WIDTH vi can nhieu cot ngang.
    <Drawer
      open
      title={
        <span className="flex items-center gap-2.5">
          <IconChip icon="📄" size="md" />
          {t("Phiếu xuất kho {a}", { a: id })}
        </span>
      }
      onClose={dongPhieu}
      width={DRAWER_WIDTH_CHI_TIET}
      footer={footer}
      headerExtra={
        onNavigate && navRows ? (
          <DrawerNavButtons
            hasPrev={navIndex > 0}
            hasNext={navIndex >= 0 && navIndex < navRows.length - 1}
            onPrev={() => navIndex > 0 && sangPhieu(navRows[navIndex - 1].id)}
            onNext={() => navIndex >= 0 && navIndex < navRows.length - 1 && sangPhieu(navRows[navIndex + 1].id)}
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="text-sm text-[var(--ink-500)] py-4 text-center">{t("Đang tải...")}</div>
      ) : !data || !pxk ? null : (
        <div className="space-y-4 text-sm">
          {/* CHOT (ra soat module "Dat Mua Linh Kien 2.0" #19): mini pipeline dau modal - truoc day
              chi co 1 StatusBadge dong dau, khong biet dang o buoc may trong bao nhieu buoc cua vong
              doi PXK (9 trang thai). FIX (UX audit 2026-09-08): tung co them 1 <Stepper> (5 buoc,
              khong hien duoc trang thai nhanh re) NGAY TREN day, lap thong tin voi chinh mini pipeline
              nay ma khong bo sung gi (PxkMiniPipeline da xu ly du ca 5 buoc chinh lan 4 trang thai
              nhanh re) - bo han <Stepper>, chi giu 1 chi bao duy nhat. */}
          <PxkMiniPipeline trangThai={trangThai} />
          {/* Ghi chu Ke toan: phieu co yeu cau xuat hoa don / KH chuyen khoan ve cong ty (2026-11-09). */}
          <HoaDonPhieuGhiChu hd={pxk.yeu_cau_hd} quyKh={pxk.quy_kh} />
          {/* Phieu cho hang tach rieng / phieu co hang co phieu cho hang lien quan (2026-11-10, migration 0112). */}
          <PhieuChoHangCanhBao choHang={pxk.cho_hang} lienQuan={pxk.phieu_cho_hang_lien_quan} />
          {uuTienTien && veKhoiChuyenTien(pxk)}
          <div className="flex gap-3 items-center flex-wrap">
            {pxk.ma_xuat_kho_xac_nhan ? (
              <span className="font-mono font-bold">{pxk.ma_xuat_kho}</span>
            ) : (
              // FIX (phan hoi 2026-09-05: "đã xác nhận chuyển tiền nhưng vẫn báo đang chờ ktv chuyển
              // tiền") - truoc day LUON ghi cung "(đang chờ KTV chuyển tiền)" moi khi chua co ma_xuat_kho
              // (chua nhap "Mã đơn hàng"), du chuyenTienOk (dong 844, PXK khong can chuyen tien HOAC KTV
              // da chuyen + Ke toan da duyet xong) - 2 buoc nay DOC LAP, khong con blocking gi nhau nua
              // sau khi chuyen tien xong (backend van cho TN tu nhap ma bat ky luc nao trong "Dang tao
              // phieu"), nen nhan phai PHAN ANH DUNG ly do dang cho: chi neu THAT SU con cho chuyen tien.
              <span className="text-[var(--ink-400)] italic text-xs">
                {chuyenTienOk ? t("Chưa có mã đơn hàng") : t("Chưa có mã đơn hàng (đang chờ KTV chuyển tiền)")}
              </span>
            )}
            {/* FIX (phan hoi 2026-09-09: "mã MISA đã nhập là thông tin quan trọng, làm to và tô màu
                lên + song song với mã đơn hàng/PXK") - truoc day Mã MISA chi la 1 <span> nho mau xam
                lan trong hang metadata cuoi (ngang hang ngay tao/mã vận đơn), de bi bo qua du la du
                lieu Ke toan da doi chieu that su voi MISA. Doi sang badge noi bat (nen mau, chu dam,
                to hon text-xs binh thuong) dat NGAY CANH ma don hang/PXK dau hang thay vi cuoi hang.*/}
            {pxk.ma_misa && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--ocean-100)] text-[var(--ocean-800)] font-mono font-bold text-sm px-2.5 py-1">
                MISA: {pxk.ma_misa}
              </span>
            )}
            {canDownloadMisa && pxk.ma_xuat_kho_xac_nhan && (() => {
              // Chi hien nut mau DE XUAT (2026-10-05, "ẩn 2 nút không đề xuất, hiện mũi tên hiện thêm" - tranh tai nham);
              // mui ten mo/thu 2 mau con lai. Khong co mau de xuat (phieu rong) -> hien du 3 nut nhu cu.
              const deXuat = data.misaTemplateDeXuat;
              const moKhac = !deXuat || moMauMisaKhac === id;
              const dsMau = deXuat ? [deXuat, ...MISA_TEMPLATE_ORDER.filter((t) => t !== deXuat)] : MISA_TEMPLATE_ORDER;
              return (
                <>
                  {dsMau.filter((tpl) => moKhac || tpl === deXuat).map((tpl) => (
                    <Btn
                      key={tpl}
                      size="sm"
                      // To mau noi bat nut trung mau MISA de xuat theo settings_loai_de_xuat cua cac dong
                      // trong phieu (phan hoi 2026-09-10 "nút tải nào được đề xuất sẽ tô màu nổi bật lên")
                      // - "subtle" (nen cam nhat) thay vi "ghost" (trang) cho 2 nut con lai.
                      variant={deXuat === tpl ? "subtle" : "ghost"}
                      title={deXuat === tpl ? t("Mẫu được đề xuất theo Loại đề xuất của phiếu này") : t("Mẫu không được đề xuất cho phiếu này")}
                      onClick={() => misaExportMutation.mutate(tpl)}
                      disabled={misaExportMutation.isPending}
                      loading={misaExportMutation.isPending && misaExportMutation.variables === tpl}
                    >
                      ⬇ MISA {MISA_TEMPLATE_LABELS[tpl]}
                    </Btn>
                  ))}
                  {deXuat && (
                    <Btn
                      size="sm"
                      variant="ghost"
                      className="px-2"
                      title={moKhac ? t("Ẩn các mẫu MISA không đề xuất") : t("Hiện thêm các mẫu MISA khác (không đề xuất)")}
                      aria-label={moKhac ? t("Ẩn các mẫu MISA không đề xuất") : t("Hiện thêm các mẫu MISA khác")}
                      aria-expanded={moKhac}
                      onClick={() => setMoMauMisaKhac(moKhac ? null : id)}
                    >
                      {moKhac ? "◂" : "▸"}
                    </Btn>
                  )}
                </>
              );
            })()}
            <StatusBadge value={trangThai} tones={PXK_TRANG_THAI_TONE} options={PXK_TRANG_THAI_OPTIONS} />
            <KhoXuatBadge r={pxk} />
            {pxk.mien_xuat && pxk.mien_xuat_nguoi_chuyen && (
              <span className="text-xs text-[var(--ink-500)]" title={t("Người chuyển kho xuất chịu trách nhiệm theo dõi phiếu")}>
                {t("Người chuyển kho: {a}", { a: tenLog(pxk.mien_xuat_nguoi_chuyen) })}
              </span>
            )}
            <KhuVucPxkBadge pxk={pxk} />
            {pxk.nguoi_nhan_hang && (
              <span className="text-[var(--ink-500)] text-xs"><NguoiNhan>{formatNguoiDisplay(pxk.nguoi_nhan_hang, ktvDisplayMap)}</NguoiNhan></span>
            )}
            <span className="text-[var(--ink-500)] text-xs">{fmtDateTime(pxk.ngay_tao)}</span>
            {pxk.ma_van_don && <span className="text-xs text-[var(--ink-500)]">{t("Mã vận đơn:")} <span className="font-mono">{pxk.ma_van_don}</span></span>}
            {pxk.anh_bien_ban_url && (
              <ImageLink url={pxk.anh_bien_ban_url} className="text-[var(--ocean-800)] underline text-xs">{t("Xem ảnh biên bản")}</ImageLink>
            )}
          </div>

          {/* Gop 4 "the" nho (phan lon loai tru nhau theo trang_thai) vao 1 grid 2 cot tu sm+ - xem
              comment o <Modal width="max-w-2xl"> phia tren. */}
          <div className="grid sm:grid-cols-2 gap-3">
          {/* Muc C (Dot 2, 2026-08-15): TN nhap "Ma don hang" that SAU khi KTV da chuyen tien xong -
              chi hien luc con "Dang tao phieu", bat buoc truoc khi duoc gui ke toan (chan o backend). */}
          {canTacNghiep && trangThai === "Dang tao phieu" && (
            <div className="border border-[var(--line)] rounded-lg p-3">
              <SectionTitle icon="📦">{t("Mã đơn hàng")} {!pxk.ma_xuat_kho_xac_nhan && <span className="text-[var(--coral-600)] normal-case tracking-normal">*</span>}</SectionTitle>
              <div className="flex gap-2 items-end">
                {/* SUA (phan hoi 2026-09-22 "2 ô nhập liệu đang không nổi bật và khó biết đã nhập hay
                    chưa nhập"): doi bg-surface-100 (mo, lan vao nen card bao quanh) -> bg-surface +
                    border-ink-400 (dam hon), DUNG LAI dung fix da ap dung cho Select.tsx 2026-09-05
                    ("nút filter... không nổi bật, khó nhìn" - cung 1 van de). */}
                <input
                  value={maXuatKhoDraft}
                  onChange={(e) => setMaXuatKhoDraft(e.target.value)}
                  placeholder={pxk.ma_xuat_kho_xac_nhan ? pxk.ma_xuat_kho : t("Nhập mã đơn hàng sau khi KTV đã chuyển tiền")}
                  className="focus-ring flex-1 bg-[var(--surface)] border border-[var(--ink-400)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <Btn size="sm" onClick={() => maXuatKhoMutation.mutate()} disabled={!maXuatKhoDraft.trim() || maXuatKhoMutation.isPending}>{t("Lưu")}</Btn>
              </div>
              {/* MOI (phan hoi 2026-09-22 "Dưới mục mã đơn hàng ghi thêm log cập nhật mã đơn hàng, mã
                  pxk"): du lieu DA CO SAN (backend da ghi log trang_thai="Da luu ma don hang" moi lan
                  luu, xem PATCH /:id/ma-xuat-kho) - chi loc lai tu data.logs da fetch san cho Timeline
                  chung ben duoi, KHONG can sua backend. */}
              {data.logs.filter((l) => l.trang_thai === "Da luu ma don hang").length > 0 && (
                <div className="mt-2 space-y-1">
                  {data.logs
                    .filter((l) => l.trang_thai === "Da luu ma don hang")
                    .map((l) => (
                      <div key={l.id} className="text-[11px] text-[var(--ink-500)]">
                        {l.ghi_chu} — {l.nguoi_xu_ly} · {fmtDateTime(l.ngay_xu_ly)}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Nhan hang: han tu xac nhan + bao nhan thieu (2026-10-12). */}
          <NhanThieuCard
            pxkId={id}
            nguoiNhanHang={pxk.nguoi_nhan_hang ?? null}
            canKho={canKho}
            canKeToan={canKeToan}
            canTacNghiep={canTacNghiep}
            currentEmail={currentEmail}
            addToast={addToast}
            onDone={invalidate}
          />
          {showBaoThieu && (
            <BaoNhanThieuModal pxkId={id} dong={data.donHang} onClose={() => setShowBaoThieu(false)} onDone={invalidate} addToast={addToast} />
          )}

          {/* Chuyen kho xuat MB/MN (2026-10-07) - TN/Ke toan (+ Kho 2026-10-15), truoc khi phieu gui Kho. */}
          {(canTacNghiep || canKeToan || canKho) && MIEN_XUAT_SUA_DUOC.includes(trangThai) && (
            <ChuyenKhoXuatCard pxk={pxk} addToast={addToast} onDone={invalidate} />
          )}

          {/* Chon lai khu vuc cho phieu sai khu vuc (2026-10-07 Kho; + TN/Ke toan 2026-10-15; + TBP/GS/nguoi tao don ho 2026-10-22) - phieu chua dong. */}
          {(canKho || canTacNghiep || canKeToan || !!pxk.duoc_doi_khu_vuc) && !PXK_TRANG_THAI_DONG.includes(trangThai) && (
            <ChuyenKhuVucCard pxk={pxk} addToast={addToast} onDone={invalidate} />
          )}

          {/* Muc D (Dot 2): Ke toan dien "Ma MISA" tren chinh PXK, bat buoc truoc khi chot xong don xuat. */}
          {canKeToan && trangThai === "Cho ke toan" && (
            <div className="border border-[var(--line)] rounded-lg p-3">
              <SectionTitle icon="📄">{t("Mã MISA")} {!pxk.ma_misa && <span className="text-[var(--coral-600)] normal-case tracking-normal">*</span>}</SectionTitle>
              <div className="flex gap-2 items-end">
                <input
                  value={maMisaDraft}
                  onChange={(e) => setMaMisaDraft(e.target.value)}
                  placeholder={pxk.ma_misa ?? t("Nhập mã MISA")}
                  className="focus-ring flex-1 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <Btn size="sm" onClick={() => maMisaMutation.mutate()} disabled={!maMisaDraft.trim() || maMisaMutation.isPending}>{t("Lưu")}</Btn>
              </div>
            </div>
          )}

          {/* Muc F (Dot 2): CHI dung nguoi nhan hang duoc tai anh bien ban + xac nhan da nhan. */}
          {trangThai === "Dang gui KTV" && currentEmail === pxk.nguoi_nhan_hang && (
            <div className="border border-[var(--line)] rounded-lg p-3">
              <SectionTitle icon="📷">{t("Ảnh biên bản tiếp nhận (không bắt buộc)")}</SectionTitle>
              <FileButton accept="image/*" capture="environment" variant="subtle" disabled={uploadingAnh} onFileSelected={(f) => void handleUploadAnhBienBan(f)}>
                {uploadingAnh ? t("Đang tải...") : t("⬆ Chọn ảnh")}
              </FileButton>
            </div>
          )}

          {!uuTienTien && veKhoiChuyenTien(pxk)}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <SectionTitle icon="📋">{t("Dòng đơn hàng")}</SectionTitle>
              <div className="flex items-center gap-1.5">
                {data.donHang.length > 0 && (
                  <Btn size="sm" variant="ghost" onClick={taiDanhSachDon} disabled={dangTaiDs}>
                    {dangTaiDs ? t("Đang tải...") : t("⬇ Tải danh sách chi tiết")}
                  </Btn>
                )}
                {/* Them don vao phieu dang xem (2026-09-21, yeu cau #4) - CHI hien khi con "Dang tao
                    phieu" (khop gate backend POST /:id/dong). */}
                {(canTacNghiep || canKeToan) && (trangThai === "Dang tao phieu" || trangThai === "Cho ke toan") && (
                  <Btn size="sm" variant="ghost" onClick={() => setShowThemDon(true)}>{t("+ Thêm đơn")}</Btn>
                )}
              </div>
            </div>
            {phieuTrong && (
              <div className="mb-1.5 rounded-lg border border-[var(--amber-500)]/30 bg-[var(--amber-100)]/60 px-2.5 py-1.5 text-[11px] font-medium text-[var(--amber-700)]">
                ⚠ {t("Phiếu không còn đơn nào — bấm \"+ Thêm đơn\" để thêm, hoặc đóng màn này thì phiếu sẽ tự hủy.")}
              </div>
            )}
            {/* Tong dat Mua + TRỪ CÔNG NỢ cua KTV theo tung ngay tao cac dong trong phieu - moc chiet khau
                (2026-09-28). PXK gom don nhieu ngay -> moi ngay 1 dong. */}
            {pxk.loai_don !== "tra_hang" && pxk.nguoi_nhan_hang && (() => {
              const ngays = data.donHang.filter((d) => d.loai_don === "mua" || laTruCongNo(d.loai_de_xuat)).map((d) => d.ngay_tao.slice(0, 10));
              return ngays.length > 0 ? <div className="mb-1.5"><TongNgayKtvInfo email={pxk.nguoi_nhan_hang} ngays={ngays} anQuy /></div> : null;
            })()}
            <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
              {/* Bang dong don dung CHUNG voi dong xo xuong o danh sach PXK (PxkDongDonHangTable.tsx, 2026-09-29). */}
              <PxkDongDonHangTable
                pxkId={id}
                pxk={pxk}
                donHang={data.donHang}
                canTacNghiep={canTacNghiep}
                canKeToan={canKeToan}
                addToast={addToast}
                onOpenDon={setDonDetailId}
                onSuaTien={setSuaTienDonId}
                giuPhieuTrong
              />
            </div>
          </div>

          {/* "Lịch sử xử lý" - noi dung SAU CUNG trong vung cuon (footer ghi chu/nut thao tac da
              chuyen ra ngoai vao Drawer footer, xem bien `footer` phia tren). */}
          <div>
            <SectionTitle icon="🕐">{t("Lịch sử xử lý")}</SectionTitle>
            {/* Gop cac buoc tu dong lien tiep (timelineLogGop, v1.434). */}
            <Timeline
              items={timelineLogGop(data.logs, (l, i, phu) => {
                // Nguoi thao tac -> hanh dong -> trang thai (LogTieuDe, 2026-09-30). Trang thai chinh cua phieu = "chuyển phiếu
                // sang [..]"; log-only (luu ma, chuyen tien, tru quy...) la chinh hanh dong -> "đã thao tác: [..]".
                const laTrangThaiPhieu = PXK_TRANG_THAI_OPTIONS.some((o) => o.value === l.trang_thai);
                return {
                  dotClassName: TRANG_THAI_DOT_TONE[PXK_TRANG_THAI_TONE[l.trang_thai] ?? PXK_LOG_ONLY_TONE[l.trang_thai] ?? "gray"],
                  title: (
                    <LogTieuDe
                      nguoi={phu ? (l.nguoi_xu_ly === "he-thong" ? `↳ ${tenLog(l.nguoi_xu_ly)}` : "↳") : tenLog(l.nguoi_xu_ly)}
                      hanhDong={i === data.logs.length - 1 ? t("tạo phiếu →") : laTrangThaiPhieu ? t("chuyển phiếu sang") : phu ? t("tự động:") : t("đã thao tác:")}
                      trangThai={trangThaiLabel([...PXK_TRANG_THAI_OPTIONS, ...PXK_LOG_ONLY_OPTIONS], l.trang_thai)}
                      ghiChu={l.ghi_chu}
                      onMoDon={setDonDetailId}
                    />
                  ),
                };
              })}
            />
          </div>
        </div>
      )}
      {/* Mo chi tiet 1 don hang ngay trong phieu (2026-09-21, yeu cau #3) - tai dung nguyen
          DonHangDetailModal, dung y het cach ThieuLkTab.tsx dang lam. */}
      {donDetailId && (
        <DonHangDetailModal
          id={donDetailId}
          onClose={() => setDonDetailId(null)}
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          canTPDvbhXacNhan={false}
          canActAsTram={false}
          currentEmail={currentEmail}
          isAdmin={isAdmin}
          canXemChiTietCa={false}
          canKho={canKho}
          giuPhieuTrong
        />
      )}
      {/* Them don vao phieu (2026-09-21, yeu cau #4) - tai dung UI checkbox-list y het modal "Tạo
          phiếu xuất kho" (Chọn tất cả + tim kiem + danh sach checkbox tung dong DonHangKhaDungRow). */}
      {showThemDon && (
        <Modal
          open
          title={t("Thêm đơn vào phiếu")}
          width="max-w-lg"
          onClose={() => { setShowThemDon(false); setThemDonSelected(new Set()); setThemDonQ(""); }}
        >
          <div className="space-y-2 text-sm">
            <input
              value={themDonQ}
              onChange={(e) => setThemDonQ(e.target.value)}
              placeholder={t("Tìm theo mã LK, tên LK, mã đơn, mã YCSC/Lada...")}
              className="o-tim focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="border border-[var(--line)] rounded-lg max-h-72 overflow-y-auto">
              {themDonKhaDungLoading ? (
                <div className="text-xs text-[var(--ink-500)] text-center py-4">{t("Đang tải...")}</div>
              ) : themDonLoc.length === 0 ? (
                <div className="text-xs text-[var(--ink-400)] text-center py-4">{t("Không có dòng nào khả dụng của đúng KTV này.")}</div>
              ) : (
                <>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--line)] bg-[var(--surface-100)] text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={themDonLoc.every((r) => themDonSelected.has(r.id))}
                      onChange={() =>
                        setThemDonSelected((s) => {
                          const idsLoc = themDonLoc.map((r) => r.id);
                          const daChonHet = idsLoc.every((id) => s.has(id));
                          const next = new Set(s);
                          if (daChonHet) idsLoc.forEach((id) => next.delete(id));
                          else idsLoc.forEach((id) => next.add(id));
                          return next;
                        })
                      }
                    />
                    {t("Chọn tất cả ({a})", { a: themDonLoc.length })}
                  </label>
                  {themDonLoc.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-100)] cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={themDonSelected.has(r.id)}
                        onChange={() =>
                          setThemDonSelected((s) => {
                            const next = new Set(s);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          })
                        }
                      />
                      <span className="font-mono">{r.ma_lk}</span>
                      <span className="flex-1 truncate">{r.ten_lk_snapshot ?? r.ma_lk}</span>
                      <span className="text-[var(--ink-500)]">{t("SL {a}", { a: r.so_luong_de_xuat })}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => { setShowThemDon(false); setThemDonSelected(new Set()); setThemDonQ(""); }}>{t("Huỷ")}</Btn>
              <Btn size="sm" onClick={() => themDonMutation.mutate()} disabled={themDonSelected.size === 0 || themDonMutation.isPending}>
                {t("Thêm {a}", { a: themDonSelected.size > 0 ? `(${themDonSelected.size})` : "" })}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
      {/* Popup sua SL thuc xuat/Don gia (2026-09-22) - tach component dung chung voi modal tao PXK. */}
      {suaTienDonId && (() => {
        const donSua = data?.donHang.find((x) => x.id === suaTienDonId);
        return donSua ? (
          <SuaTienDongModal
            don={donSua}
            addToast={addToast}
            onClose={() => setSuaTienDonId(null)}
            onSaved={() => qc.invalidateQueries({ queryKey: ["pxk-detail", id] })}
          />
        ) : null;
      })()}
    </Drawer>
  );
}

// Popup "Sửa SL thực xuất / Đơn giá" 1 dong (MOI 2026-09-22, phan hoi "ấn vào tiền số tiền ước tính, mở
// popup sửa SL thực xuất và đơn giá thực tế"). Tach component 2026-09-28 de dung CHUNG cho bang "Dòng đơn
// hàng" (PxkDetailModal) VA bang chon dong trong modal "Tạo phiếu xuất kho" - dung LAI backend PATCH
// /dat-mua-lk/don-hang/:id (tnEditWindow: TN sua duoc khi dong CHUA vao PXK hoac PXK con "Dang tao phieu").
export function SuaTienDongModal({
  don, addToast, onClose, onSaved,
}: {
  don: { id: string; ma_lk: string; so_luong_de_xuat: number; so_luong_thuc_xuat?: number | null; gia_chot: number | null; gia_de_xuat: number | null; tien_uoc_tinh?: number | null };
  addToast: (msg: string) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const donSua = don;
  const slGoc = donSua.so_luong_thuc_xuat ?? donSua.so_luong_de_xuat;
  const [suaTienDraft, setSuaTienDraft] = useState({
    so_luong_thuc_xuat: String(slGoc),
    // CHI dien gia chot that - dien san gia de xuat thi bam Luu (chi sua SL) se bien no thanh gia chot,
    // de mat chiet khau (gia chot luon uu tien).
    gia_chot: donSua.gia_chot != null ? String(donSua.gia_chot) : "",
    ghi_chu_so_luong: "",
  });
  // MOI (2026-09-22) - popup "Sửa SL thực xuất/Đơn giá" tu cot Tien can chuyen (loai_don "mua"), dung
  // LAI dung PATCH /dat-mua-lk/don-hang/:id (tnEditWindow, da co san tu v1.141) voi body RUT GON chi 3
  // truong lien quan - cac truong khac (ma_lk, loai_de_xuat...) tu giu nguyen vi khong gui len (xem
  // pattern "body.X !== undefined ? ... : existing.X" trong route do).
  const suaTienDongMutation = useMutation({
    mutationFn: ({ donHangId, body }: { donHangId: string; body: { so_luong_thuc_xuat?: number; gia_chot?: number; ghi_chu_so_luong?: string } }) =>
      api.patch(`/dat-mua-lk/don-hang/${donHangId}`, body),
    onSuccess: () => {
      onClose();
      onSaved();
      addToast(t("Đã lưu SL thực xuất/Đơn giá"));
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      addToast(code === "MISSING_GHI_CHU_SO_LUONG" ? t("Cần nhập lý do đổi SL thực xuất") : t("Lỗi: ") + describeApiError(err));
    },
  });
  const slDaDoi = suaTienDraft.so_luong_thuc_xuat.trim() !== "" && Number(suaTienDraft.so_luong_thuc_xuat) !== slGoc;
  // Don gia dang ap dung khi CHUA co gia chot = tien uoc tinh (backend, theo loai chiet khau) / SL.
  const donGiaTheoCk = donSua.tien_uoc_tinh != null && slGoc > 0 ? Math.round(donSua.tien_uoc_tinh / slGoc) : (donSua.gia_de_xuat ?? 0);
  const donGiaXemTruoc = suaTienDraft.gia_chot.trim() === "" ? donGiaTheoCk : Number(suaTienDraft.gia_chot) || 0;
  return (
    <Modal open title={t("Sửa SL thực xuất / Đơn giá — {a}", { a: donSua.ma_lk })} width="max-w-sm" onClose={() => onClose()}>
      <div className="space-y-3 text-sm">
        <div>
          <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("SL thực xuất")}</label>
          <input
            type="number"
            min={0}
            value={suaTienDraft.so_luong_thuc_xuat}
            onChange={(e) => setSuaTienDraft((p) => ({ ...p, so_luong_thuc_xuat: e.target.value }))}
            className="focus-ring w-full bg-[var(--surface)] border border-[var(--ink-400)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        </div>
        {slDaDoi && (
          <div>
            <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Lý do đổi SL thực xuất *")}</label>
            <input
              value={suaTienDraft.ghi_chu_so_luong}
              onChange={(e) => setSuaTienDraft((p) => ({ ...p, ghi_chu_so_luong: e.target.value }))}
              className={`focus-ring w-full bg-[var(--surface)] border rounded-lg px-2.5 py-1.5 text-sm ${!suaTienDraft.ghi_chu_so_luong.trim() ? "border-[var(--coral-400)]" : "border-[var(--ink-400)]"}`}
            />
          </div>
        )}
        <div>
          <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Đơn giá thực tế")}</label>
          <input
            type="number"
            min={0}
            value={suaTienDraft.gia_chot}
            placeholder={t("Để trống = theo loại chiết khấu ({a})", { a: fmtVND(donGiaTheoCk) })}
            onChange={(e) => setSuaTienDraft((p) => ({ ...p, gia_chot: e.target.value }))}
            className="focus-ring w-full bg-[var(--surface)] border border-[var(--ink-400)] rounded-lg px-2.5 py-1.5 text-sm"
          />
          <div className="mt-1 text-[11px] text-[var(--ink-400)]">{t("Nhập giá thực tế sẽ thay giá theo loại chiết khấu của dòng này.")}</div>
        </div>
        <div className="text-xs text-[var(--ink-500)]">
          {t("Tiền cần chuyển sau khi lưu:")}
          <span className="font-semibold text-[var(--ink-700)]">
            <Money>{fmtVND(donGiaXemTruoc * (Number(suaTienDraft.so_luong_thuc_xuat) || 0))}</Money>
          </span>{" "}
          <span className="text-[var(--ink-400)]">{t("(ước tính)")}</span>
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" size="sm" onClick={() => onClose()}>{t("Huỷ")}</Btn>
          <Btn
            size="sm"
            onClick={() =>
              suaTienDongMutation.mutate({
                donHangId: donSua.id,
                body: {
                  // FIX (phan hoi 2026-09-24: "yêu cầu nhập lý do thay đổi SL thực xuất trong khi
                  // không hề thay đổi và cũng không có chỗ để nhập lý do") - truoc day LUON gui
                  // so_luong_thuc_xuat (kem gia tri fallback tu so_luong_de_xuat khi dong nay
                  // CHUA tung co so_luong_thuc_xuat rieng, con NULL trong DB). Backend so sanh
                  // THANG voi existing.so_luong_thuc_xuat (KHONG fallback ve so_luong_de_xuat
                  // nhu FE) - NULL != so gia tri gui len -> luon bi coi la "da doi", doi
                  // ghi_chu_so_luong du UI (dung slDaDoi so voi slGoc CO fallback) nghi la khong
                  // doi nen khong hien o nhap. CHI gui so_luong_thuc_xuat khi THAT SU doi (slDaDoi)
                  // - khong doi thi bo qua field nay, backend tu giu nguyen existing (co the van
                  // la NULL, cong thuc hien thi noi khac da fallback ve so_luong_de_xuat san).
                  so_luong_thuc_xuat: slDaDoi ? Number(suaTienDraft.so_luong_thuc_xuat) : undefined,
                  gia_chot: suaTienDraft.gia_chot.trim() === "" ? undefined : Number(suaTienDraft.gia_chot),
                  ghi_chu_so_luong: slDaDoi ? suaTienDraft.ghi_chu_so_luong.trim() || undefined : undefined,
                },
              })
            }
            disabled={!suaTienDraft.so_luong_thuc_xuat.trim() || (slDaDoi && !suaTienDraft.ghi_chu_so_luong.trim()) || suaTienDongMutation.isPending}
          >
            {t("Lưu")}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// Vo toan man hinh cho "Tạo phiếu xuất kho" tren dien thoai (2026-09-30) - cung kieu TaoDonMobileScreen.tsx: fixed inset-0
// + 100dvh (ban phim khong che thanh CTA), noi dung cuon giua, thanh CTA dinh day. Dang ky overlayStack de nut Back dien
// thoai dong man nay thay vi hoi thoat app (onClose qua ref: dang ky 1 lan, khong doi thu tu ngan xep moi lan render).
function TaoPxkMobileShell({ onClose, footer, children }: { onClose: () => void; footer: ReactNode; children: ReactNode }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => pushOverlayClose(() => onCloseRef.current()), []);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-surface)] anim-in" style={{ height: "100dvh" }}>
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2.5">
        <h3 className="font-display text-sm font-bold text-[var(--color-text)]">{t("Tạo phiếu xuất kho")}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Đóng")}
          className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-[var(--color-text-faint)] hover:bg-[var(--color-subtle)]"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">{children}</div>
      <div
        className="shrink-0 flex flex-col gap-2 border-t border-[var(--color-border)] bg-[var(--color-subtle)] px-3.5 pt-2.5"
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      >
        {footer}
      </div>
    </div>
  );
}

// Nut tam giac nguoc xo / thu dong don cua 1 phieu trong danh sach (2026-10-28) - bam ca dong mo chi tiet phieu, chi nut nay moi xo dong.
function NutXoDongDon({ mo, onClick }: { mo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={mo}
      title={mo ? t("Thu gọn dòng đơn") : t("Xổ xuống xem dòng đơn")}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="focus-ring mr-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[11px] text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
    >
      {mo ? "▲" : "▼"}
    </button>
  );
}
