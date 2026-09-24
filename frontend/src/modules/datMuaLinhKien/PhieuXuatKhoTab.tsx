import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { FileButton } from "../../components/ui/FileButton";
import { Badge } from "../../components/x/Badge";
import { Modal } from "../../components/ui/Modal";
import { Drawer, DrawerNavButtons, useDrawerArrowNav } from "../../components/ui/Drawer";
import { Select } from "../../components/ui/Select";
import { PaginatedTable, type Column } from "../../components/ui/PaginatedTable";
import { useColumnConfig } from "../../components/ui/useColumnConfig";
import { ColumnSettingsButton } from "../../components/ui/ColumnHeader";
import { KvRow } from "../../components/ui/KvRow";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { IconChip } from "../../components/ui/IconChip";
import { Timeline } from "../../components/ui/Timeline";
import { api, buildQuery, ApiError } from "../../api/client";
import { exportRowsToExcel } from "../../lib/exportExcel";
import { fmtDateTime, fmtVND } from "../../types";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import type { DonHangRow, PhieuXuatKhoRow, DonHangKhaDungRow, NguoiNhanHangKhaDungRow, LyDoChamRow, KtvDisplayMap } from "./types";
// Lien ket 2 chieu voi don goc trong phieu (them 2026-09-21, phan hoi "cho phép click vào dòng đơn
// hàng trong phiếu để mở giao diện UI chi tiết") - tai dung nguyen DonHangDetailModal, dung y het cach
// ThieuLkTab.tsx da lam (xem comment o do ve import vong an toan trong ESM).
import { DonHangDetailModal } from "./DonCuaToiTab";
import { PXK_TRANG_THAI_TONE, CHUYEN_TIEN_TONE, PXK_TRANG_THAI_OPTIONS, CHUYEN_TIEN_OPTIONS, TRANG_THAI_DOT_TONE, PXK_LOG_ONLY_OPTIONS, PXK_LOG_ONLY_TONE } from "./constants";
import {
  describeApiError, formatNguoiDisplay, useKtvDisplayMap, ktvOptionLabel, invalidatePipelineCounts,
  trangThaiLabel, LOAI_DON_TONE,
} from "./helpers";
import { StatusBadge, ActiveFiltersBar, TrangThaiDropdownFilter, FilterSearchBar, KhuVucChipFilter, ImageLink } from "./SharedUi";
import { PxkMiniPipeline } from "./PipelineFlow";
import { downloadMisaExport, MISA_TEMPLATE_LABELS, type MisaExportResult, type MisaTemplate } from "../../lib/misaExportTemplates";

const MISA_TEMPLATE_ORDER: MisaTemplate[] = ["xuat_kho", "chuyen_kho", "ban_hang"];

// Canh bao KTV thieu ma_misa/ten_misa (them 2026-09-04, xem giai thich o backend/src/lib/misaExport.ts
// MisaExportResult) - hien 1 toast RIENG (khong chan file .xlsx da tai, chi canh bao them) liet ke toi
// da vai KTV dau tien tranh toast qua dai.
function toastCanhBaoThieuMisa(result: MisaExportResult, addToast: (msg: string) => void) {
  if (result.canhBaoThieuMisa.length === 0) return;
  const ten = result.canhBaoThieuMisa.slice(0, 5).map((w) => w.ten_hien_thi || w.ma_ktv).join(", ");
  const more = result.canhBaoThieuMisa.length > 5 ? ` và ${result.canhBaoThieuMisa.length - 5} người khác` : "";
  addToast(`⚠ ${result.canhBaoThieuMisa.length} KTV thiếu Mã MISA/Tên MISA (file thiếu dữ liệu): ${ten}${more}`);
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
  useEffect(() => {
    if (initialDetailIdOverride) setDetailId(initialDetailIdOverride);
  }, [initialDetailIdOverride]);
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({ ghi_chu: "", so_tien_can_chuyen: "", ma_xuat_kho: "" });
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
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filterQ.trim()), 500);
    return () => clearTimeout(t);
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

  // GD4 (phan hoi Codex #16): ve trang 1 moi khi bo loc doi - tranh dung o 1 trang qua so trang moi.
  useEffect(() => {
    setPage(1);
  }, [filterTrangThai, filterNguoiNhanHang, xemLoaiDon, debouncedQ, khuVucParam]);

  // GD4 (phan hoi Codex #17): phan trang server-side that su - truoc day tai TOAN BO dong khop bo loc
  // roi tu slice o client.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-pxk", filterTrangThai, filterNguoiNhanHang, xemLoaiDon, debouncedQ, khuVucParam, page],
    queryFn: () =>
      api.get<{ rows: PhieuXuatKhoRow[]; total: number }>(
        "/phieu-xuat-kho" +
          buildQuery({
            trang_thai: filterTrangThai || undefined,
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            loai_don: xemLoaiDon,
            q: debouncedQ || undefined,
            khu_vuc: khuVucParam || undefined,
            page,
            pageSize: 20,
          }),
      ),
  });

  // "Tải danh sách chi tiết" (them 2026-09-13) - mirror handleDownloadFullList() cua UsersModule.tsx,
  // goi lai GET /phieu-xuat-kho VOI CUNG bo loc dang xem nhung KHONG truyen page (BE tra HET).
  const [downloadingFull, setDownloadingFull] = useState(false);
  async function handleDownloadFullList() {
    setDownloadingFull(true);
    try {
      const res = await api.get<{ rows: PhieuXuatKhoRow[] }>(
        "/phieu-xuat-kho" +
          buildQuery({
            trang_thai: filterTrangThai || undefined,
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            loai_don: xemLoaiDon,
            q: debouncedQ || undefined,
            khu_vuc: khuVucParam || undefined,
          }),
      );
      await exportRowsToExcel(res.rows, "phieu_xuat_kho_chi_tiet.xlsx", "PXK");
    } catch (err) {
      addToast("Không tải được danh sách chi tiết: " + describeApiError(err));
    } finally {
      setDownloadingFull(false);
    }
  }

  // So "(N)" canh moi trang thai trong TrangThaiDropdownFilter (them 2026-09-01) - dem TINH theo dung
  // sub-tab loai_don dang mo (xemLoaiDon LUON co gia tri o tab nay, khac DonCuaToiTab), bo qua cac bo
  // loc phu khac (nguoi_nhan_hang/khu_vuc/q) - xem GET /phieu-xuat-kho/status-counts.
  const { data: statusCountsData } = useQuery({
    queryKey: ["dat-mua-lk-pxk-status-counts", xemLoaiDon],
    queryFn: () => api.get<{ counts: Record<string, number> }>("/phieu-xuat-kho/status-counts" + buildQuery({ loai_don: xemLoaiDon })),
  });

  // So luong "can xu ly" (chua o 4 trang thai da xong) theo tung loai_don, hien canh nhan cua 3 nut
  // sub-tab (CHOT vong 7: "Nút filter 'Mua hàng' 'Công nợ' sẽ hiện thị số lượng cần xử lý") - lay 1
  // lan MOI loai (khong loc theo trang_thai dang chon, chi theo nguoi_nhan_hang neu co) de con so on
  // dinh, khong doi theo bo loc trang_thai tam thoi dang xem. pageSize lon (khong phai 20 nhu danh
  // sach chinh) vi day la truy van rieng chi de DEM theo loai_don, can thay het dong dang mo.
  const { data: pxkCountsData } = useQuery({
    queryKey: ["dat-mua-lk-pxk-loai-counts", filterNguoiNhanHang, khuVucParam],
    queryFn: () =>
      api.get<{ rows: PhieuXuatKhoRow[] }>(
        "/phieu-xuat-kho" + buildQuery({ nguoi_nhan_hang: filterNguoiNhanHang || undefined, khu_vuc: khuVucParam || undefined, page: 1, pageSize: 1000 }),
      ),
  });
  const PXK_OPEN_STATES = new Set(["Dang tao phieu", "Cho ke toan", "Da chot xong don xuat", "Dang gui KTV"]);
  const loaiDonCounts: Record<"mua" | "cong_no" | "tra_hang", number> = { mua: 0, cong_no: 0, tra_hang: 0 };
  for (const r of pxkCountsData?.rows ?? []) {
    if (r.loai_don && PXK_OPEN_STATES.has(r.trang_thai)) loaiDonCounts[r.loai_don]++;
  }

  // Danh sach dong "TN da duyet" + chua gan PXK nao - nguon picker chon dong (CHOT 2026-08-14: thay
  // o nhap tay ID tu do, xem comment GET /phieu-xuat-kho/don-hang-kha-dung backend). Loc san theo
  // chonLoaiDon (dot 3 gop y #8) - doi Loai phieu se lam lai truy van.
  const { data: khaDungData, isLoading: khaDungLoading } = useQuery({
    queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung", chonLoaiDon],
    queryFn: () => api.get<{ rows: DonHangKhaDungRow[] }>("/phieu-xuat-kho/don-hang-kha-dung" + buildQuery({ loai_don: chonLoaiDon })),
    enabled: showCreate,
  });
  // So dong kha dung THEO tung loai_don (phan hoi QA 2026-08-31, muc #8) - hien "(x123)" canh 3 nut
  // chon Loai phieu de TN biet truoc co bao nhieu KTV dang cho len PXK o moi loai, khong phai bam thu
  // tung nut moi biet co dong hay khong.
  const { data: khaDungCountsData } = useQuery({
    queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung-counts"],
    queryFn: () => api.get<{ counts: Record<"mua" | "cong_no" | "tra_hang", number> }>("/phieu-xuat-kho/don-hang-kha-dung-counts"),
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

  // .normalize("NFC") - xem giai thich day du o components/ui/Select.tsx (cung fix, cung ngay).
  const q = timKiemDonHang.trim().toLowerCase().normalize("NFC");
  // Chi hien dong cua KTV DA CHON (chot nghiep vu 1 PXK = 1 KTV) - rong neu chua chon KTV.
  const donHangLoc = chonKtv
    ? (khaDungData?.rows ?? []).filter(
        (r) =>
          r.nguoi_nhan_hang === chonKtv &&
          (!q || r.ma_lk.toLowerCase().normalize("NFC").includes(q) || (r.ten_lk_snapshot ?? "").toLowerCase().normalize("NFC").includes(q)),
      )
    : [];
  // Danh sach KTV thuc su co dong kha dung (de dung lam options Select "Chon KTV") - chi liet ke
  // KTV dang co dong cho tao PXK, tranh chon xong roi thay danh sach rong.
  const ktvKhaDung = [...new Set((khaDungData?.rows ?? []).map((r) => r.nguoi_nhan_hang).filter((x): x is string => !!x))];
  // Tong tien cac dong DA CHON (them 2026-08-26: "1 nút ấn tự điền tiền ước tính... = số tiền tổng
  // theo danh sách đã chọn") - tach thanh bien dung chung, truoc day chi tinh INLINE 1 lan de HIEN THI
  // o dong "Đã chọn N" (xem JSX ben duoi), gio dung lai CHINH XAC con so nay de tu dien vao o "Số tiền
  // cần KTV chuyển" qua 1 nut bam, tranh 2 noi tinh lai co the lech nhau.
  const tongTienDaChon = (khaDungData?.rows ?? []).filter((r) => selectedDonHang.has(r.id)).reduce((s, r) => s + (r.gia_de_xuat ?? 0) * r.so_luong_de_xuat, 0);

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
        so_tien_can_chuyen: createData.so_tien_can_chuyen ? Number(createData.so_tien_can_chuyen) : undefined,
        nguoi_nhan_hang: chonKtv,
        loai_don: chonLoaiDon,
      }),
    onSuccess: (res) => {
      addToast(`Đã tạo phiếu xuất kho ${res.id}`);
      setShowCreate(false);
      setCreateData({ ghi_chu: "", so_tien_can_chuyen: "", ma_xuat_kho: "" });
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
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
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
            template,
          }),
      ),
    onSuccess: async (result) => {
      const ok = await downloadMisaExport(result.sheets, `MISA_${LOAI_DON_TONE[xemLoaiDon || "mua"].label}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      if (!ok) addToast("Không có dòng nào để xuất");
      else toastCanhBaoThieuMisa(result, addToast);
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #19): bang danh sach chi de XEM (khong thao tac
  // nhanh duoc vi moi trang thai can nhap lieu khac nhau - xem #6) - them 1 cot tom tat NGAN "viec
  // can lam tiep" de biet TRUOC KHI bam "Chi tiet" co dang cho minh lam gi khong, hanh dong that van
  // phai vao modal chi tiet moi thuc hien duoc.
  function pxkViecCanLamTiep(r: PhieuXuatKhoRow): string | null {
    if (r.trang_thai === "Dang tao phieu") {
      if (!r.ma_xuat_kho_xac_nhan) return "Cần nhập Mã đơn hàng";
      if (r.so_tien_can_chuyen != null && r.trang_thai_chuyen_tien !== "TN da duyet") return "Chờ xác nhận chuyển tiền";
      return "Sẵn sàng gửi Kế toán";
    }
    if (r.trang_thai === "Cho ke toan") return r.ma_misa ? "Sẵn sàng chốt xong" : "Cần nhập Mã MISA";
    // SUA (migration 0002_tra_hang_pxk.sql): PXK tra hang di THANG toi "Kho da nhan hang tra" (Kho
    // xac nhan nhan hang VE kho) tu "Da chot xong don xuat" - khac chieu "Kho gui hang" cua mua/cong_no.
    if (r.trang_thai === "Da chot xong don xuat") return r.loai_don === "tra_hang" ? "Chờ Kho xác nhận nhận hàng" : "Chờ Kho gửi hàng";
    if (r.trang_thai === "Dang gui KTV") return "Chờ KTV xác nhận đã nhận";
    return null;
  }

  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "rut gon cot mac dinh"): 3 cot bo qua optionalColumns
  // (an mac dinh, van bat lai duoc qua "⚙ Tuy chinh cot") - loai_don thua vi sub-tab Mua hang/Cong no/
  // Tra hang o tren da loc dung 1 loai_don roi (gia tri luon giong nhau trong 1 lan xem), ma_van_don
  // thuong rong o cac buoc dau (chi co gia tri tu "Dang gui KTV" tro di), so_dong la thong tin phu chua
  // can thiet de quyet dinh hanh dong tiep theo. Nguoi dung da tung tuy chinh bang nay truoc do (bam an/
  // hien cot) khong bi anh huong - PaginatedTable giu nguyen lua chon da luu cua ho.
  const cols: Column<PhieuXuatKhoRow>[] = [
    {
      // SUA (phan hoi 2026-09-10: "cột này sai tên, nó chỉ là ID hệ thống tự sinh, không phải mã pxk,
      // mã misa mới chính là pxk") - `id` la ID tuan tu tu dong sinh (nextSequentialId(), xem
      // lib/idCounter.ts), CHI dung de tham chieu/tim kiem noi bo, KHONG phai "mã PXK" that su theo
      // nghiep vu - doi nhan "Mã PXK" -> "ID" cho dung ban chat, mã PXK thuc su la ma_misa (cot rieng
      // ben duoi, Ke toan nhap luc "chốt xong đơn xuất").
      key: "id",
      header: "ID",
      render: (r) => (
        <span className="font-mono text-xs">
          {/* !! bat buoc - D1 tra EXISTS(...) ve 0/1 (khong phai boolean that), "0 && <X/>" trong
              JSX se render ra chu "0" thay vi an di neu khong ep kieu truoc. */}
          {!!r.co_don_uu_tien && <span title="Có dòng ưu tiên bên trong">⭐ </span>}
          {r.id}
        </span>
      ),
    },
    {
      key: "ma_misa",
      header: "Mã PXK",
      render: (r) => (r.ma_misa ? <span className="font-mono text-xs font-bold text-[var(--ocean-800)]">{r.ma_misa}</span> : <span className="text-[var(--ink-400)] italic text-xs">Chưa có</span>),
    },
    {
      key: "ma_xuat_kho",
      header: "Mã đơn hàng",
      // FIX (phan hoi 2026-09-05, giong het comment o Drawer chi tiet ben duoi): chi ghi "(đang chờ KTV
      // chuyển tiền)" khi THAT SU con cho (co so_tien_can_chuyen VA chua "TN da duyet") - PXK khong can
      // chuyen tien hoac da chuyen+duyet xong thi chi con thieu buoc TN tu nhap ma, khong con "cho" ai.
      render: (r) => {
        const chuyenTienOk = r.so_tien_can_chuyen == null || r.trang_thai_chuyen_tien === "TN da duyet";
        return r.ma_xuat_kho_xac_nhan ? r.ma_xuat_kho : (
          <span className="text-[var(--ink-400)] italic">{chuyenTienOk ? "Chưa có" : "Chưa có (đang chờ KTV chuyển tiền)"}</span>
        );
      },
    },
    { key: "nguoi_tao", header: "Người tạo", render: (r) => labelKtv(r.nguoi_tao) },
    { key: "nguoi_nhan_hang", header: "Người nhận hàng", render: (r) => (r.nguoi_nhan_hang ? labelKtv(r.nguoi_nhan_hang) : <span className="text-[var(--ink-400)]">—</span>) },
    { key: "ngay_tao", header: "Ngày tạo", render: (r) => fmtDateTime(r.ngay_tao) },
    {
      key: "chuyen_tien", header: "Chuyển tiền",
      render: (r) => (r.so_tien_can_chuyen != null ? <StatusBadge value={r.trang_thai_chuyen_tien ?? ""} tones={CHUYEN_TIEN_TONE} options={CHUYEN_TIEN_OPTIONS} /> : <span className="text-[var(--ink-400)] text-xs">Không cần</span>),
    },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge value={r.trang_thai} tones={PXK_TRANG_THAI_TONE} options={PXK_TRANG_THAI_OPTIONS} /> },
    {
      // Co phu "Da in phieu" (migration 0032) - CHI co y nghia tu luc "Đã chốt xong đơn xuất" tro di
      // (loai_don != tra_hang, tra hang khong co buoc "gui KTV"/in phieu giao hang) - cac dong khac
      // hien "—" thay vi badge "Chưa in" gay nham la CAN in (vd dong dang o "Dang tao phieu"/"Cho ke
      // toan" chua toi luc Kho can quan tam).
      key: "da_in_phieu", header: "In phiếu",
      render: (r) =>
        r.loai_don !== "tra_hang" && ["Da chot xong don xuat", "Dang gui KTV", "KTV da nhan"].includes(r.trang_thai) ? (
          r.da_in_phieu ? <Badge tone="success">🖨 Đã in</Badge> : <Badge tone="warning">Chưa in</Badge>
        ) : (
          <span className="text-[var(--ink-400)]">—</span>
        ),
    },
    {
      key: "viec_can_lam", header: "Việc cần làm tiếp",
      render: (r) => {
        const viec = pxkViecCanLamTiep(r);
        return viec ? <span className="text-xs text-[var(--amber-700)] font-medium">{viec}</span> : <span className="text-[var(--ink-400)]">—</span>;
      },
    },
    { key: "actions", header: "", mobileHint: "actions", render: (r) => <Btn size="sm" variant="ghost" onClick={() => setDetailId(r.id)}>Chi tiết</Btn> },
  ];
  const optionalCols: Column<PhieuXuatKhoRow>[] = [
    { key: "loai_don", header: "Loại", render: (r) => (r.loai_don ? <Badge tone={LOAI_DON_TONE[r.loai_don].tone}>{LOAI_DON_TONE[r.loai_don].label}</Badge> : <span className="text-[var(--ink-400)]">—</span>) },
    { key: "ma_van_don", header: "Mã vận đơn", render: (r) => r.ma_van_don ?? <span className="text-[var(--ink-400)]">—</span> },
    { key: "so_dong", header: "Số dòng", render: (r) => r.so_dong },
  ];

  // Nang len goi useColumnConfig O DAY (2026-08-21, sua loi UX "nút Tùy chỉnh cột khiến table bị
  // trống ra 1 khoảng trông rất xấu" - xem giai thich day du o TraHangTab.tsx, cung 1 sua).
  const columnConfig = useColumnConfig(cols, optionalCols, [], "dmlk-pxk-list");
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
      {/* Sub-tab "Mua hang | Cong no | Tra hang" (dot 3 gop y #8; them Tra hang CHOT vong 7 khi bo
          tab "Don tra hang" rieng khoi menu) - TN khong bao gio gop cac mang de xuat nay trong cung
          1 PXK, tach han danh sach xem theo tung mang, mac dinh Mua hang. So (x{n}) canh nhan la so
          don dang can xu ly (chua o 4 trang thai da xong) cua tung loai. */}
      <div className="flex gap-1 mb-3">
        {/* "Tất cả" (them 2026-09-11) - cho phep StageMenu nhay thang toi 1 trang thai PXK khong phan
            biet loai don (vd "Hàng trừ kho"/"Kho đã kết thúc") ma khong ep nguoi dung phai tu chon lai
            1 trong 3 sub-tab con lai. Nguoi dung van bam lai "Mua hàng"/"Công nợ"/"Trả hàng" binh
            thuong de thu hep khi can. */}
        <button
          type="button"
          onClick={() => setXemLoaiDon("")}
          className={`focus-ring rounded-lg font-semibold transition-colors px-2.5 py-1.5 text-xs ${
            xemLoaiDon === "" ? "bg-[var(--ocean-800)] text-white shadow-sm" : "bg-white text-[var(--ink-600)] border border-[var(--line)] hover:bg-slate-50"
          }`}
        >
          Tất cả
        </button>
        {/* SUA (phan hoi 2026-08-18) - xem giai thich chi tiet o cung mau nut nay trong DonCuaToiTab.
            SUA (phan hoi nguoi dung: "tab đang xem tô đen, tab còn tồn tô cam => không biết tab nào
            đang xem") - truoc day active dung mau ocean-800 (xanh/den, khong lien quan he mau
            cam="con tồn" dung o cac nut khac), khien 2 khai niem "dang xem" va "con tồn" tach roi
            nhau, de nham "cam = dang chon". Doi active CO dem (attention) sang amber-600 dam (van la
            1 sac cam, DAM hon amber-100 cua nut chi co dem KHONG active) - "cam = con tồn" nhat quan
            xuyen suot, chi khac do dam/nhat theo dang xem hay khong; active KHONG dem giu nguyen
            ocean-800 (khong co gi can canh bao). */}
        {(["mua", "cong_no", "tra_hang"] as const).map((l) => {
          const active = xemLoaiDon === l;
          const conTon = loaiDonCounts[l] > 0;
          return (
            <button
              key={l}
              type="button"
              onClick={() => setXemLoaiDon(l)}
              className={`focus-ring rounded-lg font-semibold transition-colors px-2.5 py-1.5 text-xs ${
                active
                  ? conTon
                    ? "bg-[var(--amber-600)] text-white shadow-sm"
                    : "bg-[var(--ocean-800)] text-white shadow-sm"
                  : conTon
                    ? "bg-[var(--amber-100)] text-[var(--amber-700)] border border-[var(--amber-500)]"
                    : "bg-white text-[var(--ink-600)] border border-[var(--line)] hover:bg-slate-50"
              }`}
            >
              {LOAI_DON_TONE[l].label}
              {loaiDonCounts[l] > 0 ? ` (x${loaiDonCounts[l]})` : ""}
            </button>
          );
        })}
      </div>
      {/* UI redesign (phan hoi 2026-08-21, "hợp nhất phong cách giao diện"): chip trang thai + Select
          nguoi nhan hang gop vao chung khoi loc thu gon (FilterSearchBar), dong bo voi Mua hang/Cong
          no - "+ Tạo phiếu xuất kho" GIU luon hien (hanh dong chinh, khong phai bo loc). */}
      <FilterSearchBar
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((v) => !v)}
        // FIX (ra soat bug mua hang 2026-08-26, BUG-003): thieu filterTrangThai, khop pattern DonCuaToiTab.tsx.
        activeFilterCount={[filterTrangThai, filterNguoiNhanHang, filterQ, khuVucParam].filter(Boolean).length}
        searchValue={filterQ}
        onSearchChange={setFilterQ}
        searchPlaceholder="Tìm theo mã PXK, mã đơn hàng, mã MISA, mã vận đơn..."
        activeFilters={
          <>
            {/* Nut bam nhanh "Đơn chờ xử lý" (them 2026-09-09, phan hoi "thêm 1 nút ấn nhanh...tự
                filter ra danh sách cần làm theo vai trò bản thân") - chi hien khi vai tro dang xem
                THAT SU co 1 buoc rieng trong pipeline PXK (pendingTrangThaiForRole khac rong), nhay
                thang bo loc trang thai ve dung buoc do, khong dong cham cac bo loc phu khac. */}
            {pendingTrangThaiForRole() && (
              <Btn size="sm" variant="ghost" onClick={() => setFilterTrangThai(pendingTrangThaiForRole())}>
                📋 Đơn chờ xử lý
              </Btn>
            )}
            {/* Nut "Xóa bộ lọc" (them 2026-09-09, phan hoi "tab pxk thiếu nút xóa filter") - khac
                "Xoá tất cả bộ lọc" trong ActiveFiltersBar ben duoi (chi xoa cac chip dang hien: nguoi
                nhan hang/khu vuc/tim kiem, CO Y khong dong cham trang thai - xem comment "SUA (ra soat
                #3)"), nut nay xoa THAT SU toan bo ke ca trang thai ve "Tất cả" - dat gan nut bam nhanh
                o tren cho ro day la cap doi "nhay toi viec cua minh" / "xem het khong loc gi". Chi
                hien khi co it nhat 1 bo loc dang ap dung, tranh chiem cho khi khong can.
            */}
            {(filterTrangThai || filterNguoiNhanHang || filterQ || khuVucParam) && (
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFilterTrangThai("");
                  setFilterNguoiNhanHang("");
                  setFilterQ("");
                  setFilterKhuVuc(new Set());
                }}
              >
                ✕ Xóa bộ lọc
              </Btn>
            )}
          </>
        }
        trailing={
          <div className="flex items-center gap-2">
            {settingsButtonEl}
            <Btn size="sm" variant="ghost" onClick={handleDownloadFullList} disabled={downloadingFull}>
              {downloadingFull ? "Đang tải..." : "⬇ Tải danh sách chi tiết"}
            </Btn>
            {/* Tai gop file MISA cho danh sach PXK dang hien theo bo loc (them 2026-09-02) - 3 nut
                rieng cho 3 mau, TN/Ke toan tu chon mau nao thi tai mau do (khong con tu dong 1 nut).
                An het voi KTV/Trạm/CTV/Vệ tinh (canDownloadMisa=false, xem giai thich o khai bao prop). */}
            {canDownloadMisa && MISA_TEMPLATE_ORDER.map((tpl) => (
              <Btn
                key={tpl}
                size="sm"
                variant="ghost"
                onClick={() => misaExportBulkMutation.mutate(tpl)}
                disabled={misaExportBulkMutation.isPending}
                loading={misaExportBulkMutation.isPending && misaExportBulkMutation.variables === tpl}
              >
                ⬇ MISA {MISA_TEMPLATE_LABELS[tpl]}
              </Btn>
            ))}
            {canTacNghiep && (
              <Btn size="sm" onClick={() => { setChonLoaiDon(xemLoaiDon || "mua"); setShowCreate(true); }}>
                + Tạo phiếu xuất kho
              </Btn>
            )}
          </div>
        }
      >
        <TrangThaiDropdownFilter value={filterTrangThai} onChange={setFilterTrangThai} options={PXK_TRANG_THAI_OPTIONS} counts={statusCountsData?.counts} />
        {/* Bo loc Khu vuc (them 2026-08-31, dong bo voi DonCuaToiTab.tsx). SUA BUG GIAO DIEN (phan hoi
            2026-09-12): bo nhan "Khu vực" rieng ben ngoai (gay lech chieu cao so voi cac o loc khac
            cung hang) - nhan da gop vao THANG nut trigger (xem triggerLabel trong SharedUi.tsx). */}
        {showKhuVucFilter && khuVucOptions.length > 0 && <KhuVucChipFilter value={filterKhuVuc} onChange={setFilterKhuVuc} options={khuVucOptions} />}
        {(nguoiNhanHangData?.rows.length ?? 0) > 0 && (
          <Select
            value={filterNguoiNhanHang}
            onChange={setFilterNguoiNhanHang}
            options={[{ value: "", label: "Tất cả người nhận hàng" }, ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: ktvOptionLabel(r, nguoiNhanHangData?.rows ?? []) }))]}
          />
        )}
      </FilterSearchBar>
      {/* SUA (ra soat #3): bo chip "Trạng thái: ..." - gia tri dang chon da hien SAN trong o
          TrangThaiDropdownFilter ngay ben tren (doi tu chip/nut sang dropdown 2026-09-01), khong can
          lap lai o day. */}
      <ActiveFiltersBar
        chips={[
          ...(filterNguoiNhanHang ? [{ label: "Người nhận hàng đã lọc", onClear: () => setFilterNguoiNhanHang("") }] : []),
          ...(khuVucParam ? [{ label: `Khu vực: ${[...filterKhuVuc].map((ma) => khuVucOptions.find((o) => o.value === ma)?.label ?? ma).join(", ")}`, onClear: () => setFilterKhuVuc(new Set()) }] : []),
          ...(filterQ ? [{ label: `Tìm: "${filterQ}"`, onClear: () => setFilterQ("") }] : []),
        ]}
      />
      {/* SUA (phan hoi 2026-08-18 muc 2): onRowClick mo thang modal chi tiet (bam CA HANG, khong chi
          nut "Chi tiet" nho o cuoi hang dai) + storageKey de nguoi dung tu an bot/keo rong cot theo y
          minh (⚙ Tuy chinh cot, tinh nang co san cua PaginatedTable, chi chua duoc bat o bang nay) -
          giai quyet ca 2 y "tran/qua dai" (an bot cot khong can) va "man hinh to nhung chu nho" (keo
          rong cot can xem ky) ma khong can ve lai toan bo bang. */}
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
        onRowClick={(r) => setDetailId(r.id)}
        columnConfig={columnConfig}
        rowClassName={(r) => (r.co_don_uu_tien ? "bg-[var(--orange-100)] hover:brightness-95" : "")}
      />
      {showCreate && (
        <Modal
          open
          title="Tạo phiếu xuất kho"
          width="max-w-[95vw] sm:max-w-[1100px]"
          height="max-h-[92vh]"
          onClose={() => {
            setShowCreate(false);
            setSelectedDonHang(new Set());
            setTimKiemDonHang("");
            setChonKtv("");
            setChonLoaiDon("mua");
          }}
        >
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Loại phiếu *</label>
              <div className="flex gap-1">
                {(["mua", "cong_no", "tra_hang"] as const).map((l) => (
                  <Btn
                    key={l}
                    size="sm"
                    variant={chonLoaiDon === l ? "primary" : "ghost"}
                    onClick={() => { setChonLoaiDon(l); setChonKtv(""); setSelectedDonHang(new Set()); }}
                  >
                    {LOAI_DON_TONE[l].label} (x{khaDungCounts[l]})
                  </Btn>
                ))}
              </div>
            </div>
            <div>
              {/* Chot nghiep vu 2026-08-15: 1 PXK CHI gan cho 1 KTV - bat buoc chon KTV TRUOC, danh
                  sach dong ben duoi chi hien dong cua dung KTV do (khong con tron nhieu KTV). */}
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Chọn KTV nhận hàng *</label>
              <Select
                value={chonKtv}
                onChange={(v) => { setChonKtv(v); setSelectedDonHang(new Set()); }}
                options={[{ value: "", label: "-- Chọn KTV --" }, ...ktvKhaDung.map((email) => ({ value: email, label: labelKtv(email) }))]}
                className="w-full"
              />
            </div>
            {/* CHOT (ra soat module "Dat Mua Linh Kien 2.0" #1/#19): khoa TRUC QUAN (mo + khong bam
                duoc) toan bo khoi nay khi chua chon KTV, khong chi dua vao dong chu placeholder ben
                trong nhu truoc - ro rang ngay tu cai nhin dau tien day la buoc CHUA TOI LUOT, khong
                phai chi 1 o tim kiem bi disabled le loi. */}
            <div className={!chonKtv ? "opacity-50 pointer-events-none" : ""}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--ink-600)]">Chọn dòng đơn hàng đã "TN đã duyệt" (*)</label>
                {/* CHOT #10 (ra soat module "Dat Mua Linh Kien 2.0"): them tong tien cua cac dong DA
                    CHON de doi chieu voi o "So tien can KTV chuyen" ngay ben duoi - truoc day chi
                    hien so luong dong, khong biet tong gia tri de doi chieu. */}
                <span className="text-xs text-[var(--ink-500)]">
                  Đã chọn {selectedDonHang.size}
                  {selectedDonHang.size > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-[var(--green-700)]">{fmtVND(tongTienDaChon)}</span>
                    </>
                  )}
                </span>
              </div>
              <input
                value={timKiemDonHang}
                onChange={(e) => setTimKiemDonHang(e.target.value)}
                placeholder="Tìm theo mã LK, tên LK..."
                disabled={!chonKtv}
                className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mb-1.5 disabled:bg-[var(--surface-200)]"
              />
              <div className="border border-[var(--line)] rounded-lg max-h-64 overflow-y-auto">
                {!chonKtv ? (
                  <div className="text-xs text-[var(--ink-400)] text-center py-4">Chọn KTV nhận hàng ở trên trước.</div>
                ) : khaDungLoading ? (
                  <div className="text-xs text-[var(--ink-500)] text-center py-4">Đang tải...</div>
                ) : donHangLoc.length === 0 ? (
                  <div className="text-xs text-[var(--ink-400)] text-center py-4">
                    {(khaDungData?.rows.length ?? 0) === 0 ? "Không có dòng nào đang chờ tạo phiếu xuất kho." : "Không khớp tìm kiếm."}
                  </div>
                ) : (
                  <>
                    <label className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--line)] bg-[var(--surface-100)] text-xs font-semibold cursor-pointer">
                      <input type="checkbox" checked={donHangLoc.length > 0 && donHangLoc.every((r) => selectedDonHang.has(r.id))} onChange={toggleChonTatCaLoc} />
                      Chọn tất cả ({donHangLoc.length})
                    </label>
                    {donHangLoc.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-100)] cursor-pointer text-xs">
                        <input type="checkbox" checked={selectedDonHang.has(r.id)} onChange={() => toggleDonHang(r.id)} />
                        <span className="font-mono">{r.ma_lk}</span>
                        <span className="flex-1 truncate">{r.ten_lk_snapshot ?? r.ma_lk}</span>
                        <span className="text-[var(--ink-500)]">SL {r.so_luong_de_xuat}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Mã đơn hàng (tuỳ chọn, có thể nhập sau nếu chưa biết)</label>
              <input
                value={createData.ma_xuat_kho}
                onChange={(e) => setCreateData((p) => ({ ...p, ma_xuat_kho: e.target.value }))}
                placeholder="Nhập nếu đã biết mã đơn hàng ngay lúc tạo"
                className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--ink-600)]">Số tiền cần KTV chuyển * (nhập 0 nếu không cần chuyển tiền)</label>
                {/* Tu dien tien uoc tinh (phan hoi 2026-08-26) - dien = tong tien cac dong DA CHON o
                    tren (tongTienDaChon), nguoi dung van sua tay duoc sau khi bam neu can khac di. */}
                <button
                  type="button"
                  onClick={() => setCreateData((p) => ({ ...p, so_tien_can_chuyen: String(tongTienDaChon) }))}
                  disabled={selectedDonHang.size === 0}
                  className="shrink-0 text-[11px] font-semibold text-[var(--ocean-700)] hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline disabled:text-[var(--ink-400)]"
                >
                  = Tổng đã chọn ({fmtVND(tongTienDaChon)})
                </button>
              </div>
              <input
                type="number"
                value={createData.so_tien_can_chuyen}
                onChange={(e) => setCreateData((p) => ({ ...p, so_tien_can_chuyen: e.target.value }))}
                className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Ghi chú</label>
              <input
                value={createData.ghi_chu}
                onChange={(e) => setCreateData((p) => ({ ...p, ghi_chu: e.target.value }))}
                className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreate(false);
                  setSelectedDonHang(new Set());
                  setTimKiemDonHang("");
                  setChonKtv("");
                  setChonLoaiDon("mua");
                }}
              >
                Hủy
              </Btn>
              <Btn
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={!chonKtv || selectedDonHang.size === 0 || createData.so_tien_can_chuyen.trim() === "" || createMutation.isPending}
                loading={createMutation.isPending}
              >
                Tạo
              </Btn>
            </div>
          </div>
        </Modal>
      )}
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
  const [bangChungUrl, setBangChungUrl] = useState("");
  // Ghi chu thay the/di kem anh (phan hoi 2026-08-19: "cho phép upload ảnh hoặc ghi chú thông tin
  // chuyển tiền") - bangChungUrl gio duoc DIEN TU DONG qua upload anh that (khong con go tay link),
  // bangChungGhiChuDraft la lua chon thay the khi khong co anh de upload.
  const [bangChungGhiChuDraft, setBangChungGhiChuDraft] = useState("");
  const [maXuatKhoDraft, setMaXuatKhoDraft] = useState("");
  const [maMisaDraft, setMaMisaDraft] = useState("");
  const [uploadingAnh, setUploadingAnh] = useState(false);
  const [uploadingBangChung, setUploadingBangChung] = useState(false);
  // Nhap "Ly do cham" tung dong (CHOT 2026-08-14 - xem lib/hanLyDoCham.ts backend) - TN dien khi
  // dong ton qua 24h ke tu "Cho TN duyet" ma chua duoc dua vao PXK "Cho ke toan", bat buoc truoc khi
  // bam "Gui ke toan" (backend chan cung, xem POST /phieu-xuat-kho/:id/log).
  const [lyDoChamDraft, setLyDoChamDraft] = useState<Record<string, string>>({});
  // 4 state moi (2026-09-21, phan hoi "cho phép Kế toán/TN sửa lại thông tin đơn ở bước chờ KTV
  // chuyển tiền") - xem 4 khoi lien quan ben duoi (mutation + JSX).
  const [donDetailId, setDonDetailId] = useState<string | null>(null);
  const [soTienCongNoDraft, setSoTienCongNoDraft] = useState<Record<string, string>>({});
  // MOI (2026-09-22, phan hoi "Khi ấn vào tiền số tiền ước tính, mở popup UI giao diện sửa tiền gồm
  // sửa SL thực xuất và đơn giá thực tế") - popup gon rieng cho loai_don "mua", tranh phai mo het
  // DonHangDetailModal chi de sua 2 truong nay.
  const [suaTienDonId, setSuaTienDonId] = useState<string | null>(null);
  const [suaTienDraft, setSuaTienDraft] = useState({ so_luong_thuc_xuat: "", gia_chot: "", ghi_chu_so_luong: "" });
  // Sua tong tien can chuyen (2026-09-21, yeu cau #2, TAT lai 2026-09-22 cho MOI loai_don khi "(uoc
  // tinh)" tu dong thay the - xem tongTienUocTinhPxk. BAT LAI 2026-09-23, phan hoi "các phiếu xk liên
  // quan đến công nợ cho phép sửa giá trị tiền cần chuyển về") - CHI cho loai_don="cong_no": khac
  // "mua" (tien tu dong = Gia chot x SL thuc xuat tung dong, sua tung dong qua popup suaTienDonId o
  // tren), tien cong no dung so_tien_cong_no tung don (co the can dieu chinh CA tong sau khi da "Yêu
  // cầu chuyển" - vd KTV bao sai/thieu) ma khong co dong SL/don gia nao de sua rieng le nhu "mua".
  const [suaTongTien, setSuaTongTien] = useState(false);
  const [soTienCanChuyenSuaDraft, setSoTienCanChuyenSuaDraft] = useState("");
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
  const { data, isLoading } = useQuery({
    queryKey: ["pxk-detail", id],
    queryFn: () =>
      api.get<{
        phieuXuatKho: PhieuXuatKhoRow & { trang_thai: string };
        donHang: DonHangRow[];
        logs: Array<{ id: number; trang_thai: string; nguoi_xu_ly: string; ngay_xu_ly: string; ghi_chu: string | null }>;
        // Mau MISA duoc de xuat theo settings_loai_de_xuat cua cac dong trong phieu (them 2026-09-10) -
        // dung de to mau noi bat 1 trong 3 nut tai MISA ben duoi, xem MISA_TEMPLATE_ORDER.map.
        misaTemplateDeXuat: MisaTemplate | null;
      }>(`/phieu-xuat-kho/${id}`),
  });

  function invalidate() {
    setGhiChu("");
    setMaVanDonInput("");
    setBangChungUrl("");
    setBangChungGhiChuDraft("");
    qc.invalidateQueries({ queryKey: ["pxk-detail", id] });
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
    onSuccess: () => { invalidate(); addToast("Đã cập nhật trạng thái"); },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "THIEU_LY_DO_CHAM") {
        addToast("Còn dòng chưa nhập Lý do chậm (quá 24h) - điền ở bảng dòng đơn hàng bên dưới trước khi gửi kế toán");
      } else if (code === "MA_XUAT_KHO_CHUA_XAC_NHAN") {
        addToast("Cần nhập Mã đơn hàng trước khi gửi kế toán");
      } else if (code === "MISSING_MA_MISA") {
        addToast("Cần nhập Mã MISA trước khi chốt xong đơn xuất");
      } else if (code === "MISSING_GHI_CHU") {
        addToast("Cần nhập ghi chú/lý do trước khi huỷ");
      } else {
        addToast("Lỗi: " + describeApiError(err));
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
      addToast("Đã huỷ phiếu xuất kho");
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      addToast(code === "MISSING_GHI_CHU" ? "Cần nhập ghi chú/lý do trước khi huỷ" : "Lỗi: " + describeApiError(err));
    },
  });

  const maXuatKhoMutation = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${id}/ma-xuat-kho`, { ma_xuat_kho: maXuatKhoDraft.trim() }),
    onSuccess: () => { setMaXuatKhoDraft(""); qc.invalidateQueries({ queryKey: ["pxk-detail", id] }); qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] }); invalidatePipelineCounts(qc); addToast("Đã lưu mã đơn hàng"); },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const maMisaMutation = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${id}/ma-misa`, { ma_misa: maMisaDraft.trim() }),
    onSuccess: () => { setMaMisaDraft(""); qc.invalidateQueries({ queryKey: ["pxk-detail", id] }); qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] }); invalidatePipelineCounts(qc); addToast("Đã lưu mã MISA"); },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // Co phu "Da in phieu" (migration 0032, phan hoi 2026-09-24) - CHI cap nhat 1 co theo doi cua Kho,
  // khong dung logMutation (khong ghi phieu_xuat_kho_log, khong doi trang_thai_hien_tai).
  const daInPhieuMutation = useMutation({
    mutationFn: (daInPhieu: boolean) => api.patch(`/phieu-xuat-kho/${id}/da-in-phieu`, { da_in_phieu: daInPhieu }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pxk-detail", id] }); qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] }); },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // Tai file import MISA CHO DUNG PXK nay (them 2026-09-02, xem lib/misaExport.ts o backend +
  // lib/misaExportTemplates.ts o frontend). Chi can "Mã đơn hàng" da xac nhan (dung lam "Số chứng
  // từ") - nut dat canh gia tri Mã đơn hàng, khong bat buoc phieu da xong. SUA (phan hoi "tạo 3
  // button, TN muốn tải mẫu nào thì tải"): nhan template tu UI, EP toan bo dong vao dung mau do.
  const misaExportMutation = useMutation({
    mutationFn: (template: MisaTemplate) => api.get<MisaExportResult>(`/phieu-xuat-kho/${id}/misa-export` + buildQuery({ template })),
    onSuccess: async (result) => {
      const ok = await downloadMisaExport(result.sheets, `MISA_${pxk?.ma_xuat_kho || id}.xlsx`);
      if (!ok) addToast("Không có dòng nào để xuất");
      else toastCanhBaoThieuMisa(result, addToast);
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  async function handleUploadAnhBienBan(file: File) {
    setUploadingAnh(true);
    try {
      const bytes = await file.arrayBuffer();
      await api.postBinary(`/phieu-xuat-kho/${id}/anh-bien-ban`, bytes, file.type || "image/jpeg");
      qc.invalidateQueries({ queryKey: ["pxk-detail", id] });
      addToast("Đã tải ảnh biên bản");
    } catch (err) {
      addToast("Lỗi tải ảnh: " + describeApiError(err));
    } finally {
      setUploadingAnh(false);
    }
  }

  async function handleUploadBangChungChuyenTien(file: File) {
    setUploadingBangChung(true);
    try {
      const bytes = await file.arrayBuffer();
      const res = await api.postBinary<{ ok: true; url: string }>(`/phieu-xuat-kho/${id}/bang-chung-chuyen-tien`, bytes, file.type || "image/jpeg");
      setBangChungUrl(res.url);
      addToast("Đã tải ảnh chuyển tiền - bấm \"Đã chuyển\" để xác nhận");
    } catch (err) {
      addToast("Lỗi tải ảnh: " + describeApiError(err));
    } finally {
      setUploadingBangChung(false);
    }
  }

  // SUA (phan hoi QA 2026-08-31, muc #5): doi tu PATCH /don-hang/:id { ly_do_cham } (1 lan duy nhat,
  // khoa vinh vien) -> POST /don-hang/:id/giai-trinh (migration 0014) - cho phep giai trinh LAP LAI
  // moi khi qua han lai, va lich su hien day du (xem giaiTrinh tren tung dong o duoi).
  const lyDoChamMutation = useMutation({
    mutationFn: ({ donHangId, ly_do_cham }: { donHangId: string; ly_do_cham: string }) =>
      api.post(`/dat-mua-lk/don-hang/${donHangId}/giai-trinh`, { noi_dung: ly_do_cham }),
    onSuccess: (_res, { donHangId }) => {
      setLyDoChamDraft((p) => { const n = { ...p }; delete n[donHangId]; return n; });
      qc.invalidateQueries({ queryKey: ["pxk-detail", id] });
      addToast("Đã lưu lý do chậm");
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // SUA (2026-09-22): khong con nhan so tien go tay - luon gui dung tong "(ước tính)" da tinh san o
  // tongTienUocTinhPxk (xem giai thich day du canh dinh nghia bien do).
  const yeuCauChuyenTienMutation = useMutation({
    mutationFn: (so_tien: number) => api.post(`/phieu-xuat-kho/${id}/chuyen-tien`, { so_tien }),
    onSuccess: () => { invalidate(); addToast("Đã yêu cầu chuyển tiền"); },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const chuyenTienMutation = useMutation({
    mutationFn: (body: { trang_thai: string; bang_chung_chuyen_tien_url?: string; bang_chung_chuyen_tien_ghi_chu?: string }) => api.patch(`/phieu-xuat-kho/${id}/chuyen-tien`, body),
    onSuccess: () => { invalidate(); addToast("Đã cập nhật chuyển tiền"); },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // BAT LAI 2026-09-23 (xem giai thich day du canh khai bao suaTongTien o tren) - goi lai dung
  // endpoint co san PATCH /:id/so-tien-can-chuyen (chua bao gio bi xoa o backend).
  const soTienCanChuyenSuaMutation = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${id}/so-tien-can-chuyen`, { so_tien_can_chuyen: Number(soTienCanChuyenSuaDraft) }),
    onSuccess: () => { setSuaTongTien(false); setSoTienCanChuyenSuaDraft(""); invalidate(); addToast("Đã sửa tổng tiền cần chuyển"); },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // 4 mutation moi (2026-09-21) - xem PATCH /don-hang/:id/so-tien-cong-no (datMuaLinhKien.ts) va
  // PATCH /:id/so-tien-can-chuyen, POST /:id/dong, DELETE /:id/dong/:donHangId (phieuXuatKho.ts).
  const soTienCongNoMutation = useMutation({
    mutationFn: ({ donHangId, so_tien_cong_no }: { donHangId: string; so_tien_cong_no: number }) =>
      api.patch(`/dat-mua-lk/don-hang/${donHangId}/so-tien-cong-no`, { so_tien_cong_no }),
    onSuccess: (_res, { donHangId }) => {
      setSoTienCongNoDraft((p) => { const n = { ...p }; delete n[donHangId]; return n; });
      qc.invalidateQueries({ queryKey: ["pxk-detail", id] });
      addToast("Đã lưu tiền cần chuyển của đơn");
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // MOI (2026-09-22) - popup "Sửa SL thực xuất/Đơn giá" tu cot Tien can chuyen (loai_don "mua"), dung
  // LAI dung PATCH /dat-mua-lk/don-hang/:id (tnEditWindow, da co san tu v1.141) voi body RUT GON chi 3
  // truong lien quan - cac truong khac (ma_lk, loai_de_xuat...) tu giu nguyen vi khong gui len (xem
  // pattern "body.X !== undefined ? ... : existing.X" trong route do).
  const suaTienDongMutation = useMutation({
    mutationFn: ({ donHangId, body }: { donHangId: string; body: { so_luong_thuc_xuat: number; gia_chot?: number; ghi_chu_so_luong?: string } }) =>
      api.patch(`/dat-mua-lk/don-hang/${donHangId}`, body),
    onSuccess: () => {
      setSuaTienDonId(null);
      qc.invalidateQueries({ queryKey: ["pxk-detail", id] });
      addToast("Đã lưu SL thực xuất/Đơn giá");
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      addToast(code === "MISSING_GHI_CHU_SO_LUONG" ? "Cần nhập lý do đổi SL thực xuất" : "Lỗi: " + describeApiError(err));
    },
  });

  // Danh sach dong "kha dung" de them vao phieu DANG XEM - tai dung dung endpoint/loai_don nhu luc tao
  // PXK moi, loc them phia client theo nguoi_nhan_hang cua CHINH pxk nay (backend van validate lai
  // chat trong POST /:id/dong nen khong rui ro neu loc sot o day).
  const { data: themDonKhaDungData, isLoading: themDonKhaDungLoading } = useQuery({
    queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung", data?.phieuXuatKho.loai_don],
    queryFn: () => api.get<{ rows: DonHangKhaDungRow[] }>("/phieu-xuat-kho/don-hang-kha-dung" + buildQuery({ loai_don: data?.phieuXuatKho.loai_don ?? undefined })),
    enabled: showThemDon && !!data?.phieuXuatKho.loai_don,
  });
  const themDonQNorm = themDonQ.trim().toLowerCase().normalize("NFC");
  const themDonLoc = (themDonKhaDungData?.rows ?? []).filter(
    (r) =>
      r.nguoi_nhan_hang === data?.phieuXuatKho.nguoi_nhan_hang &&
      (!themDonQNorm || r.ma_lk.toLowerCase().normalize("NFC").includes(themDonQNorm) || (r.ten_lk_snapshot ?? "").toLowerCase().normalize("NFC").includes(themDonQNorm)),
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
      addToast(`Đã thêm ${res.added} đơn vào phiếu`);
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const boDonMutation = useMutation({
    mutationFn: (donHangId: string) => api.delete(`/phieu-xuat-kho/${id}/dong/${donHangId}`),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung-counts"] });
      addToast("Đã bỏ đơn khỏi phiếu");
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      addToast(code === "LAST_ORDER" ? "Không thể bỏ - đây là đơn cuối cùng trong phiếu (dùng nút \"Huỷ\" ở dưới nếu muốn bỏ cả phiếu)" : "Lỗi: " + describeApiError(err));
    },
  });

  const pxk = data?.phieuXuatKho;
  // MOI (2026-09-22, phan hoi "tổng tiền cần chuyển sẽ tự động = tổng tiền ước tính trong danh sách
  // các đơn => tạm thời tắt khả năng sửa tổng tiền của phiếu đi"): tong CHUNG cho moi loai_don, dung
  // dung cong thuc "(ước tính)" da hien per-dong o bang Dong don hang (Gia chot/de xuat × SL thuc
  // xuat/de xuat) - thay the hoan toan cho viec nhap tay/sua tay so_tien_can_chuyen.
  // FIX (phan hoi 2026-09-22 "Đơn công nợ, đã sửa tiền ở đơn về 0 nhưng trên phiếu không thay đổi"):
  // cong thuc SL×gia CHI dung nghia cho mua/tra_hang - don cong_no dung so_tien_cong_no (truong tien
  // THAT, sua tay rieng o bang Dong don hang ben duoi, nuoi computeCongNoPhatSinh o congNoKtv.ts).
  // Truoc day tinh CHUNG 1 cong thuc cho MOI loai_don nen PXK cong_no luon hien sai so.
  const tongTienUocTinhPxk = (data?.donHang ?? []).reduce(
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
  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "Drawer + Next/Previous") - xem comment day du o
  // DonHangDetailModal (cung pattern, navRows undefined = -1 = an het nut).
  const navIndex = navRows?.findIndex((r) => r.id === id) ?? -1;
  // Phase 4 (phim tat): ←/→ dieu huong dong truoc/sau giong het DrawerNavButtons ben duoi.
  useDrawerArrowNav({
    hasPrev: !!(onNavigate && navRows && navIndex > 0),
    hasNext: !!(onNavigate && navRows && navIndex >= 0 && navIndex < navRows.length - 1),
    onPrev: () => navRows && navIndex > 0 && onNavigate?.(navRows[navIndex - 1].id),
    onNext: () => navRows && navIndex >= 0 && navIndex < navRows.length - 1 && onNavigate?.(navRows[navIndex + 1].id),
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
            placeholder="Mã vận đơn (tuỳ chọn, áp dụng khi bấm Đang gửi KTV)"
            className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        )}
        <input
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          placeholder={
            (canTacNghiep || canKeToan) && ["Dang tao phieu", "Cho ke toan"].includes(trangThai)
              ? "Ghi chú (bắt buộc nếu bấm Huỷ)"
              : "Ghi chú (tuỳ chọn)"
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
              title={!chuyenTienOk ? "Cần Kế toán duyệt bằng chứng chuyển tiền trước" : !pxk.ma_xuat_kho_xac_nhan ? "Cần nhập Mã đơn hàng trước" : "Gửi kế toán"}
              aria-label="Gửi kế toán"
            >
              📤 Gửi kế toán
            </Btn>
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
                title={!ghiChu.trim() ? "Cần nhập ghi chú/lý do huỷ trước" : "Huỷ phiếu, các đơn bên trong quay lại khả dụng để gom vào phiếu khác"}
                aria-label="Huỷ - phiếu bị lỗi"
              >
                🗑 Huỷ (phiếu lỗi)
              </Btn>
              <Btn
                variant="danger"
                onClick={() => huyPxkMutation.mutate("khong_con_nhu_cau")}
                disabled={huyPxkMutation.isPending || !ghiChu.trim()}
                title={!ghiChu.trim() ? "Cần nhập ghi chú/lý do huỷ trước" : "Huỷ phiếu VÀ huỷ luôn các đơn bên trong (không hoàn tác được)"}
                aria-label="Huỷ - không còn nhu cầu"
              >
                🗑 Huỷ (không còn nhu cầu)
              </Btn>
            </>
          )}
          {canKeToan && trangThai === "Cho ke toan" && (
            <Btn
              onClick={() => logMutation.mutate("Da chot xong don xuat")}
              disabled={logMutation.isPending || !pxk.ma_misa}
              loading={logMutation.isPending}
              title={!pxk.ma_misa ? "Cần nhập Mã MISA trước" : "Đã chốt xong đơn xuất"}
              aria-label="Đã chốt xong đơn xuất"
            >
              ✅ Đã chốt xong đơn xuất
            </Btn>
          )}
          {/* SUA (migration 0002_tra_hang_pxk.sql): PXK tra hang KHONG co buoc "dang gui" trung
              gian (hang khong phai ship di dau) - chi 1 nut Kho xac nhan da nhan hang VE kho. */}
          {canKho && trangThai === "Da chot xong don xuat" && pxk.loai_don === "tra_hang" && (
            <Btn onClick={() => logMutation.mutate("Kho da nhan hang tra")} disabled={logMutation.isPending} loading={logMutation.isPending} title="Kho đã nhận hàng trả" aria-label="Kho đã nhận hàng trả">
              📥 Kho đã nhận hàng trả
            </Btn>
          )}
          {canKho && trangThai === "Da chot xong don xuat" && pxk.loai_don !== "tra_hang" && (
            <>
              <Btn onClick={() => logMutation.mutate("Dang gui KTV")} disabled={logMutation.isPending} loading={logMutation.isPending} title="Đang gửi KTV" aria-label="Đang gửi KTV">
                🚚 Đang gửi KTV
              </Btn>
              <Btn variant="ghost" onClick={() => logMutation.mutate("Hang tru kho")} disabled={logMutation.isPending} title="Hàng trừ kho" aria-label="Hàng trừ kho">
                📦 Hàng trừ kho
              </Btn>
            </>
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
              title="Đánh dấu đã in/chưa in phiếu (chỉ để Kho theo dõi, không ảnh hưởng luồng xử lý)"
            >
              {pxk.da_in_phieu ? "🖨 Đã in phiếu (bấm để bỏ đánh dấu)" : "🖨 Đánh dấu đã in phiếu"}
            </Btn>
          )}
          {/* Muc F (Dot 2): CHOT bat buoc DUNG nguoi nhan hang xac nhan - an nut voi moi nguoi
              khac (ke ca Admin/TN xem, du backend van cho Admin bam duoc de xu ly su co). */}
          {trangThai === "Dang gui KTV" && currentEmail === pxk.nguoi_nhan_hang && (
            <Btn onClick={() => logMutation.mutate("KTV da nhan")} disabled={logMutation.isPending} loading={logMutation.isPending} title="KTV đã nhận" aria-label="KTV đã nhận">
              📥 KTV đã nhận
            </Btn>
          )}
          {trangThai === "Dang gui KTV" && currentEmail !== pxk.nguoi_nhan_hang && isAdmin && (
            <Btn variant="ghost" onClick={() => logMutation.mutate("KTV da nhan")} disabled={logMutation.isPending} title="KTV đã nhận (Admin xác nhận thay - trường hợp đặc biệt)" aria-label="KTV đã nhận (Admin xác nhận thay)">
              🛡️📥 KTV đã nhận (thay)
            </Btn>
          )}
          {canKho && trangThai === "Dang gui KTV" && (
            <Btn variant="ghost" onClick={() => logMutation.mutate("Kho da ket thuc")} disabled={logMutation.isPending} title="Kho đã kết thúc (KTV không phản hồi)" aria-label="Kho đã kết thúc (KTV không phản hồi)">
              ⏹️ Kho đã kết thúc
            </Btn>
          )}
        </div>
      </div>
    ) : null;

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
          {`Phiếu xuất kho ${id}`}
        </span>
      }
      onClose={onClose}
      width="max-w-2xl"
      footer={footer}
      headerExtra={
        onNavigate && navRows ? (
          <DrawerNavButtons
            hasPrev={navIndex > 0}
            hasNext={navIndex >= 0 && navIndex < navRows.length - 1}
            onPrev={() => navIndex > 0 && onNavigate(navRows[navIndex - 1].id)}
            onNext={() => navIndex >= 0 && navIndex < navRows.length - 1 && onNavigate(navRows[navIndex + 1].id)}
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="text-sm text-[var(--ink-500)] py-4 text-center">Đang tải...</div>
      ) : !data || !pxk ? null : (
        <div className="space-y-4 text-sm">
          {/* CHOT (ra soat module "Dat Mua Linh Kien 2.0" #19): mini pipeline dau modal - truoc day
              chi co 1 StatusBadge dong dau, khong biet dang o buoc may trong bao nhieu buoc cua vong
              doi PXK (9 trang thai). FIX (UX audit 2026-09-08): tung co them 1 <Stepper> (5 buoc,
              khong hien duoc trang thai nhanh re) NGAY TREN day, lap thong tin voi chinh mini pipeline
              nay ma khong bo sung gi (PxkMiniPipeline da xu ly du ca 5 buoc chinh lan 4 trang thai
              nhanh re) - bo han <Stepper>, chi giu 1 chi bao duy nhat. */}
          <PxkMiniPipeline trangThai={trangThai} />
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
                {chuyenTienOk ? "Chưa có mã đơn hàng" : "Chưa có mã đơn hàng (đang chờ KTV chuyển tiền)"}
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
            {canDownloadMisa && pxk.ma_xuat_kho_xac_nhan &&
              MISA_TEMPLATE_ORDER.map((tpl) => (
                <Btn
                  key={tpl}
                  size="sm"
                  // To mau noi bat nut trung mau MISA de xuat theo settings_loai_de_xuat cua cac dong
                  // trong phieu (phan hoi 2026-09-10 "nút tải nào được đề xuất sẽ tô màu nổi bật lên")
                  // - "subtle" (nen cam nhat) thay vi "ghost" (trang) cho 2 nut con lai.
                  variant={data.misaTemplateDeXuat === tpl ? "subtle" : "ghost"}
                  title={data.misaTemplateDeXuat === tpl ? "Mẫu được đề xuất theo Loại đề xuất của phiếu này" : undefined}
                  onClick={() => misaExportMutation.mutate(tpl)}
                  disabled={misaExportMutation.isPending}
                  loading={misaExportMutation.isPending && misaExportMutation.variables === tpl}
                >
                  ⬇ MISA {MISA_TEMPLATE_LABELS[tpl]}
                </Btn>
              ))}
            <StatusBadge value={trangThai} tones={PXK_TRANG_THAI_TONE} options={PXK_TRANG_THAI_OPTIONS} />
            {pxk.nguoi_nhan_hang && (
              <span className="text-[var(--ink-500)] text-xs">{formatNguoiDisplay(pxk.nguoi_nhan_hang, ktvDisplayMap)}</span>
            )}
            <span className="text-[var(--ink-500)] text-xs">{fmtDateTime(pxk.ngay_tao)}</span>
            {pxk.ma_van_don && <span className="text-xs text-[var(--ink-500)]">Mã vận đơn: <span className="font-mono">{pxk.ma_van_don}</span></span>}
            {pxk.anh_bien_ban_url && (
              <ImageLink url={pxk.anh_bien_ban_url} className="text-[var(--ocean-800)] underline text-xs">Xem ảnh biên bản</ImageLink>
            )}
          </div>

          {/* Gop 4 "the" nho (phan lon loai tru nhau theo trang_thai) vao 1 grid 2 cot tu sm+ - xem
              comment o <Modal width="max-w-2xl"> phia tren. */}
          <div className="grid sm:grid-cols-2 gap-3">
          {/* Muc C (Dot 2, 2026-08-15): TN nhap "Ma don hang" that SAU khi KTV da chuyen tien xong -
              chi hien luc con "Dang tao phieu", bat buoc truoc khi duoc gui ke toan (chan o backend). */}
          {canTacNghiep && trangThai === "Dang tao phieu" && (
            <div className="border border-[var(--line)] rounded-lg p-3">
              <SectionTitle icon="📦">Mã đơn hàng {!pxk.ma_xuat_kho_xac_nhan && <span className="text-[var(--coral-600)] normal-case tracking-normal">*</span>}</SectionTitle>
              <div className="flex gap-2 items-end">
                {/* SUA (phan hoi 2026-09-22 "2 ô nhập liệu đang không nổi bật và khó biết đã nhập hay
                    chưa nhập"): doi bg-surface-100 (mo, lan vao nen card bao quanh) -> bg-surface +
                    border-ink-400 (dam hon), DUNG LAI dung fix da ap dung cho Select.tsx 2026-09-05
                    ("nút filter... không nổi bật, khó nhìn" - cung 1 van de). */}
                <input
                  value={maXuatKhoDraft}
                  onChange={(e) => setMaXuatKhoDraft(e.target.value)}
                  placeholder={pxk.ma_xuat_kho_xac_nhan ? pxk.ma_xuat_kho : "Nhập mã đơn hàng sau khi KTV đã chuyển tiền"}
                  className="focus-ring flex-1 bg-[var(--surface)] border border-[var(--ink-400)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <Btn size="sm" onClick={() => maXuatKhoMutation.mutate()} disabled={!maXuatKhoDraft.trim() || maXuatKhoMutation.isPending}>Lưu</Btn>
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

          {/* Muc D (Dot 2): Ke toan dien "Ma MISA" tren chinh PXK, bat buoc truoc khi chot xong don xuat. */}
          {canKeToan && trangThai === "Cho ke toan" && (
            <div className="border border-[var(--line)] rounded-lg p-3">
              <SectionTitle icon="📄">Mã MISA {!pxk.ma_misa && <span className="text-[var(--coral-600)] normal-case tracking-normal">*</span>}</SectionTitle>
              <div className="flex gap-2 items-end">
                <input
                  value={maMisaDraft}
                  onChange={(e) => setMaMisaDraft(e.target.value)}
                  placeholder={pxk.ma_misa ?? "Nhập mã MISA"}
                  className="focus-ring flex-1 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <Btn size="sm" onClick={() => maMisaMutation.mutate()} disabled={!maMisaDraft.trim() || maMisaMutation.isPending}>Lưu</Btn>
              </div>
            </div>
          )}

          {/* Muc F (Dot 2): CHI dung nguoi nhan hang duoc tai anh bien ban + xac nhan da nhan. */}
          {trangThai === "Dang gui KTV" && currentEmail === pxk.nguoi_nhan_hang && (
            <div className="border border-[var(--line)] rounded-lg p-3">
              <SectionTitle icon="📷">Ảnh biên bản tiếp nhận (không bắt buộc)</SectionTitle>
              <FileButton accept="image/*" capture="environment" variant="subtle" disabled={uploadingAnh} onFileSelected={(f) => void handleUploadAnhBienBan(f)}>
                {uploadingAnh ? "Đang tải..." : "⬆ Chọn ảnh"}
              </FileButton>
            </div>
          )}

          <div className="border border-[var(--line)] rounded-lg p-3">
            <SectionTitle icon="💲" iconTone="teal">Chuyển tiền</SectionTitle>
            {pxk.so_tien_can_chuyen == null ? (
              canTacNghiep && trangThai === "Dang tao phieu" ? (
                <div className="flex gap-2 items-end">
                  {/* SUA (2026-09-22, phan hoi "tổng tiền cần chuyển sẽ tự động = tổng tiền ước tính
                      trong danh sách các đơn"): bo o nhap tu do, chi hien so da tu tinh (read-only) -
                      nut "Yêu cầu chuyển" gui thang tongTienUocTinhPxk, khong con go tay duoc. */}
                  <div className="flex-1 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm">
                    {fmtVND(tongTienUocTinhPxk)} <span className="text-[var(--ink-400)]">(tự động)</span>
                  </div>
                  <Btn size="sm" onClick={() => yeuCauChuyenTienMutation.mutate(tongTienUocTinhPxk)} disabled={tongTienUocTinhPxk <= 0 || yeuCauChuyenTienMutation.isPending}>Yêu cầu chuyển</Btn>
                </div>
              ) : (
                <span className="text-[var(--ink-400)] text-xs">Không cần chuyển tiền</span>
              )
            ) : (
              <>
                <KvRow label="Số tiền">
                  {/* SUA (2026-09-22): bo nut "✎ Sửa" cho MOI loai_don khi "(ước tính)" tu dong thay
                      the (xem tongTienUocTinhPxk) - rieng loai_don="mua" tien tu tinh dung Gia chot x
                      SL thuc xuat tung dong nen khong can sua tong tay nua.
                      BAT LAI 2026-09-23 rieng loai_don="cong_no" (phan hoi "các phiếu xk liên quan đến
                      công nợ cho phép sửa giá trị tiền cần chuyển về") - CHI hien nut sua khi con o
                      "Dang tao phieu" (khop dung gate backend PATCH /:id/so-tien-can-chuyen), khong
                      dung nut "Yêu cầu chuyển" o nhanh tren (nut do RESET het bang chung da nop). */}
                  {pxk.loai_don === "cong_no" && (canTacNghiep || canKeToan) && trangThai === "Dang tao phieu" && suaTongTien ? (
                    <span className="inline-flex gap-1.5 items-center">
                      <input
                        type="number"
                        autoFocus
                        value={soTienCanChuyenSuaDraft}
                        onChange={(e) => setSoTienCanChuyenSuaDraft(e.target.value)}
                        className="focus-ring w-32 bg-[var(--surface-100)] border border-[var(--line)] rounded px-1.5 py-0.5 text-xs"
                      />
                      <Btn size="sm" variant="ghost" onClick={() => soTienCanChuyenSuaMutation.mutate()} disabled={!soTienCanChuyenSuaDraft.trim() || soTienCanChuyenSuaMutation.isPending}>Lưu</Btn>
                      <button type="button" className="text-xs text-[var(--ink-400)] hover:underline" onClick={() => { setSuaTongTien(false); setSoTienCanChuyenSuaDraft(""); }}>Huỷ</button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-1.5 items-center">
                      <span className="font-semibold text-[var(--green-700)]">{fmtVND(pxk.so_tien_can_chuyen)}</span>
                      {pxk.loai_don === "cong_no" && (canTacNghiep || canKeToan) && trangThai === "Dang tao phieu" && (
                        <button
                          type="button"
                          className="text-xs text-[var(--ocean-700)] hover:underline"
                          onClick={() => { setSoTienCanChuyenSuaDraft(String(pxk.so_tien_can_chuyen ?? "")); setSuaTongTien(true); }}
                        >
                          ✎ Sửa
                        </button>
                      )}
                    </span>
                  )}
                </KvRow>
                <KvRow label="Trạng thái"><StatusBadge value={pxk.trang_thai_chuyen_tien ?? ""} tones={CHUYEN_TIEN_TONE} options={CHUYEN_TIEN_OPTIONS} /></KvRow>
                {pxk.bang_chung_chuyen_tien_url && (
                  <KvRow label="Bằng chứng"><ImageLink url={pxk.bang_chung_chuyen_tien_url} className="text-[var(--ocean-800)] underline text-xs">Xem bằng chứng</ImageLink></KvRow>
                )}
                {pxk.bang_chung_chuyen_tien_ghi_chu && (
                  <KvRow label="Ghi chú"><span className="text-xs text-[var(--ink-600)]">{pxk.bang_chung_chuyen_tien_ghi_chu}</span></KvRow>
                )}
                {/* Phan hoi 2026-08-19: "cho phép upload ảnh hoặc ghi chú thông tin chuyển tiền" -
                    truoc day CHI co 1 o dan link tay. Gio 2 lua chon SONG SONG (co the dung ca 2):
                    upload anh THAT qua Drive (giong "Ảnh biên bản") HOAC go ghi chu van ban, goi y
                    nhanh tu CUNG danh muc "Lý do chậm (Mua hàng)" da dung o cot "Lý do chậm" ben duoi. */}
                {pxk.trang_thai_chuyen_tien === "Cho KTV chuyen" && (
                  <div className="space-y-1.5 mt-2">
                    <div className="flex gap-2 items-center flex-wrap">
                      {/* SUA (phan hoi 2026-09-22 "Các nút bấm mờ và khó phân biệt => tô màu và làm
                          rõ ràng"): doi variant mac dinh "ghost" (trang, vien mo) -> "subtle" (nen cam
                          nhat), dung LAI pattern da dung cho nut MISA "de xuat" cung file (dong ~1300). */}
                      <FileButton accept="image/*" capture="environment" variant="subtle" disabled={uploadingBangChung} onFileSelected={(f) => void handleUploadBangChungChuyenTien(f)}>
                        {uploadingBangChung ? "Đang tải..." : "⬆ Chọn ảnh"}
                      </FileButton>
                      {bangChungUrl && !uploadingBangChung && <span className="text-xs text-[var(--teal-600)]">✓ Đã tải ảnh, sẵn sàng xác nhận</span>}
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      {/* SUA (phan hoi 2026-09-22, cung van de/fix voi input "Mã đơn hàng" o tren). */}
                      <input
                        value={bangChungGhiChuDraft}
                        onChange={(e) => setBangChungGhiChuDraft(e.target.value)}
                        placeholder="Hoặc ghi chú thông tin chuyển khoản (vd: đã chuyển qua Momo, mã GD...)"
                        className="focus-ring flex-1 min-w-[200px] bg-[var(--surface)] border border-[var(--ink-400)] rounded-lg px-2.5 py-1.5 text-sm"
                      />
                      {(lyDoChamGoiYData?.rows.length ?? 0) > 0 && (
                        <Select
                          value=""
                          onChange={(v) => v && setBangChungGhiChuDraft(v)}
                          options={[{ value: "", label: "+ Chọn nhanh lý do" }, ...(lyDoChamGoiYData?.rows ?? []).map((l) => ({ value: l.ten_ly_do, label: l.ten_ly_do }))]}
                          className="text-xs"
                        />
                      )}
                    </div>
                    <Btn
                      size="sm"
                      onClick={() => chuyenTienMutation.mutate({ trang_thai: "KTV da chuyen", bang_chung_chuyen_tien_url: bangChungUrl || undefined, bang_chung_chuyen_tien_ghi_chu: bangChungGhiChuDraft || undefined })}
                      disabled={(!bangChungUrl.trim() && !bangChungGhiChuDraft.trim()) || chuyenTienMutation.isPending}
                    >
                      Đã chuyển
                    </Btn>
                  </div>
                )}
                {/* SUA (phan hoi 04/09/2026: "Bước 2: 'Kế toán duyệt chuyển tiền'") - nguoi duyet
                    buoc cuoi chuyen tu TN sang Ke toan, khop dung gate canKeToan o backend PATCH
                    /:id/chuyen-tien nhanh "TN da duyet" (gia tri DB giu nguyen ten cu). */}
                {canKeToan && pxk.trang_thai_chuyen_tien === "KTV da chuyen" && (
                  <Btn size="sm" className="mt-2" onClick={() => chuyenTienMutation.mutate({ trang_thai: "TN da duyet" })} disabled={chuyenTienMutation.isPending}>Duyệt bằng chứng</Btn>
                )}
              </>
            )}
          </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <SectionTitle icon="📋">Dòng đơn hàng</SectionTitle>
              {/* Them don vao phieu dang xem (2026-09-21, yeu cau #4) - CHI hien khi con "Dang tao
                  phieu" (khop gate backend POST /:id/dong). */}
              {(canTacNghiep || canKeToan) && trangThai === "Dang tao phieu" && (
                <Btn size="sm" variant="ghost" onClick={() => setShowThemDon(true)}>+ Thêm đơn</Btn>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[var(--surface-soft)] border-b border-[var(--line)]">
                    <th className="px-2.5 py-2">Mã</th>
                    <th className="px-2.5 py-2">Tên LK</th>
                    <th className="px-2.5 py-2 text-right">SL</th>
                    <th className="px-2.5 py-2 text-right">Tiền cần chuyển</th>
                    <th className="px-2.5 py-2">Lý do chậm</th>
                    {(canTacNghiep || canKeToan) && trangThai === "Dang tao phieu" && <th className="px-2.5 py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.donHang.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setDonDetailId(d.id)}
                      className={`border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer ${d.uu_tien === 1 ? "bg-[var(--orange-100)] ring-1 ring-inset ring-[var(--orange-500)]" : ""}`}
                    >
                      <td className="px-2.5 py-2 font-mono">{d.ma_lk}</td>
                      <td className="px-2.5 py-2">
                        {d.uu_tien === 1 && <span title="Ưu tiên">⭐ </span>}
                        {d.ten_lk_snapshot ?? d.ma_lk}
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        {/* FIX (phan hoi 2026-09-22 "tất cả các dòng hiện thông tin đơn hàng cần hiện
                            cả sl thực xuất") - truoc day CHI hien SL thuc xuat cho loai_don==='mua',
                            cong_no/tra_hang luon hien SL de xuat du TN da sua SL thuc xuat qua "Thông
                            tin TN" (khong gioi han theo loai_don o backend). */}
                        {d.so_luong_thuc_xuat ?? d.so_luong_de_xuat}
                      </td>
                      <td className="px-2.5 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        {/* SUA (phan hoi 2026-09-22 "bắt sửa số lượng và đơn giá => tự sinh ra giá đề
                            xuất"): voi loai_don === "mua", BO HAN sua tay so_tien_cong_no (doc lap voi
                            SL/don gia that, de gay lech du lieu) - cot nay tro thanh READ-ONLY, luon la
                            SL thuc xuat (hoac de xuat) × Gia chot (hoac de xuat). MOI (cung ngay, phan
                            hoi "ấn vào tiền số tiền ước tính, mở popup sửa SL thực xuất và đơn giá thực
                            tế"): bam THANG vao so tien de mo popup gon (setSuaTienDonId) thay vi phai mo
                            ca DonHangDetailModal day du. Voi cong_no: GIU NGUYEN 100% co che sua tay
                            so_tien_cong_no cu (nuoi truc tiep cong no KTV qua computeCongNoPhatSinh,
                            khong duoc dung vao). */}
                        {pxk.loai_don === "mua" ? (
                          (() => {
                            const donGia = d.gia_chot ?? d.gia_de_xuat;
                            const sl = d.so_luong_thuc_xuat ?? d.so_luong_de_xuat;
                            const noiDung = donGia != null ? (
                              <span className="italic text-[var(--ink-400)]" title="Ước tính = (Giá chốt hoặc Giá đề xuất) × SL thực xuất">
                                {fmtVND(donGia * sl)} (ước tính)
                              </span>
                            ) : (
                              <span className="text-[var(--ink-400)]">—</span>
                            );
                            return canTacNghiep && trangThai === "Dang tao phieu" ? (
                              <button
                                type="button"
                                className="hover:underline decoration-dotted underline-offset-2"
                                title="Bấm để sửa SL thực xuất/Đơn giá thực tế"
                                onClick={() => {
                                  setSuaTienDonId(d.id);
                                  setSuaTienDraft({
                                    so_luong_thuc_xuat: String(sl),
                                    gia_chot: donGia != null ? String(donGia) : "",
                                    ghi_chu_so_luong: "",
                                  });
                                }}
                              >
                                {noiDung}
                              </button>
                            ) : (
                              noiDung
                            );
                          })()
                        ) : soTienCongNoDraft[d.id] !== undefined ? (
                          <span className="inline-flex gap-1 items-center">
                            <input
                              type="number"
                              autoFocus
                              value={soTienCongNoDraft[d.id]}
                              onChange={(e) => setSoTienCongNoDraft((p) => ({ ...p, [d.id]: e.target.value }))}
                              className="focus-ring w-24 bg-[var(--surface-100)] border border-[var(--line)] rounded px-1.5 py-0.5 text-xs text-right"
                            />
                            <Btn
                              size="sm"
                              variant="ghost"
                              onClick={() => soTienCongNoMutation.mutate({ donHangId: d.id, so_tien_cong_no: Number(soTienCongNoDraft[d.id]) })}
                              disabled={!soTienCongNoDraft[d.id]?.trim() || soTienCongNoMutation.isPending}
                            >
                              Lưu
                            </Btn>
                            <button type="button" className="text-[var(--ink-400)] hover:underline" onClick={() => setSoTienCongNoDraft((p) => { const n = { ...p }; delete n[d.id]; return n; })}>✕</button>
                          </span>
                        ) : (
                          <span className="inline-flex gap-1.5 items-center">
                            {/* FIX (phan hoi 2026-09-21: "tiền cần chuyển của đơn có mà trong phiếu
                                không hiện") - so_tien_cong_no la truong MOI (chua tung duoc dien tu
                                dong cho don loai "mua", xem comment types.ts:307-311), gan nhu LUON
                                null cho toi khi ai do tu sua qua o nay - hien "—" trong khi PXK-level
                                so_tien_can_chuyen da co gia tri (thuong = dung tong Gia de xuat*SL cua
                                cac dong, xem tongTienDaChon luc tao phieu) gay hieu lam la MAT du lieu.
                                Fallback ve gia_de_xuat*so_luong_de_xuat (uoc tinh, in nghieng + nhan
                                "(ước tính)") khi chua sua tay - dung con so nay lam gia tri khoi tao
                                khi bam ✎ thay vi de trong. */}
                            {d.so_tien_cong_no != null ? (
                              fmtVND(d.so_tien_cong_no)
                            ) : d.gia_de_xuat != null ? (
                              <span className="italic text-[var(--ink-400)]" title="Ước tính = Giá đề xuất × SL, chưa được xác nhận/sửa tay">
                                {fmtVND(d.gia_de_xuat * d.so_luong_de_xuat)} (ước tính)
                              </span>
                            ) : (
                              <span className="text-[var(--ink-400)]">—</span>
                            )}
                            {(canTacNghiep || canKeToan) && trangThai === "Dang tao phieu" && (
                              <button
                                type="button"
                                className="text-[var(--ocean-700)] hover:underline"
                                onClick={() =>
                                  setSoTienCongNoDraft((p) => ({
                                    ...p,
                                    [d.id]: String(d.so_tien_cong_no ?? (d.gia_de_xuat != null ? d.gia_de_xuat * d.so_luong_de_xuat : "")),
                                  }))
                                }
                              >
                                ✎
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        {/* SUA (phan hoi QA 2026-08-31, muc #5: "hiện tại đang không thể xem được lý
                            do giải trình chậm của đơn trong PXK") - truoc day chi hien 1 gia tri
                            ly_do_cham DUY NHAT (khoa vinh vien sau lan dau). Gio hien DAY DU lich su
                            (migration 0014, giaiTrinh) + cho nhap lai moi khi qua han LAN NUA. */}
                        <div className="flex flex-col gap-1">
                          {d.giaiTrinh && d.giaiTrinh.length > 0 && (
                            <ul className="space-y-0.5">
                              {d.giaiTrinh.map((g) => (
                                <li key={g.id} className="text-xs">
                                  {g.noi_dung}
                                  <span className="text-[10.5px] text-[var(--ink-400)]"> — {fmtDateTime(g.ngay_tao)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {canTacNghiep && d.qua_han_ly_do_cham && (d.trang_thai_hien_tai === "Cho TN duyet" || d.trang_thai_hien_tai === "TN da duyet") ? (
                            <div className="flex flex-col gap-1">
                              {/* CHOT (phan hoi 2026-08-24: "đổi hẳn thành dropdown bắt buộc, bỏ ô nhập
                                  tay") - Select BAT BUOC chon tu danh muc "Mua hàng" (settings_ly_do_cham),
                                  khong con o nhap tu do - neu Settings CHUA co ly do nao, TN se khong
                                  nhap duoc cho toi khi Admin bo sung (dung y da chot voi nguoi dung).
                                  FIX (phan hoi 2026-09-10: "PXK lỗi không nhập được lý do quá hạn?") -
                                  dong DA VAO PXK luon co trang_thai_hien_tai="TN da duyet" (khong con
                                  "Cho TN duyet"), nhung qua_han_ly_do_cham la co lai theo thoi gian
                                  (khong reset vinh vien sau khi duyet 1 lan) nen van co the qua han lai
                                  trong luc cho o buoc "Cho ke toan" - backend POST /don-hang/:id/giai-
                                  trinh da noi long gate de cho nop lai khi dang qua han ke ca da duyet
                                  (xem comment route datMuaLinhKien.ts), nen o day cung phai hien lai
                                  input thay vi chi hien badge thong tin. */}
                              <div className="flex gap-1 items-center">
                                <Badge tone="danger">Quá hạn</Badge>
                                <Select
                                  value={lyDoChamDraft[d.id] ?? ""}
                                  onChange={(v) => setLyDoChamDraft((p) => ({ ...p, [d.id]: v }))}
                                  options={[{ value: "", label: "-- Chọn lý do chậm --" }, ...(lyDoChamGoiYData?.rows ?? []).map((l) => ({ value: l.ten_ly_do, label: l.ten_ly_do }))]}
                                  disabled={(lyDoChamGoiYData?.rows.length ?? 0) === 0}
                                  className="flex-1"
                                />
                                <Btn
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => lyDoChamMutation.mutate({ donHangId: d.id, ly_do_cham: lyDoChamDraft[d.id] ?? "" })}
                                  disabled={!lyDoChamDraft[d.id]?.trim() || lyDoChamMutation.isPending}
                                >
                                  Lưu
                                </Btn>
                              </div>
                              {(lyDoChamGoiYData?.rows.length ?? 0) === 0 && (
                                <div className="text-[10.5px] text-[var(--coral-600)]">Chưa có lý do chậm nào được cấu hình cho "Mua hàng" — vào Settings › Lý do chậm để thêm.</div>
                              )}
                            </div>
                          ) : d.qua_han_ly_do_cham ? (
                            <Badge tone="danger">Quá hạn</Badge>
                          ) : (!d.giaiTrinh || d.giaiTrinh.length === 0) ? (
                            <span className="text-[var(--ink-400)]">—</span>
                          ) : null}
                        </div>
                      </td>
                      {(canTacNghiep || canKeToan) && trangThai === "Dang tao phieu" && (
                        <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                          {/* Bo don khoi phieu (2026-09-21, yeu cau #4) - an khi chi con 1 don (khop
                              gate LAST_ORDER cua backend), xac nhan qua window.confirm dung y het cach
                              UsersModule.tsx dang lam cho cac thao tac pha huy khac. */}
                          {data.donHang.length > 1 && (
                            <button
                              type="button"
                              className="text-[var(--coral-500)] hover:underline"
                              onClick={() => {
                                if (window.confirm(`Bỏ đơn "${d.ma_lk}" khỏi phiếu này?\n\nĐơn sẽ quay lại danh sách "khả dụng" để gán vào 1 phiếu khác.`)) {
                                  boDonMutation.mutate(d.id);
                                }
                              }}
                            >
                              ✕ Bỏ
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* "Lịch sử xử lý" - noi dung SAU CUNG trong vung cuon (footer ghi chu/nut thao tac da
              chuyen ra ngoai vao Drawer footer, xem bien `footer` phia tren). */}
          <div>
            <SectionTitle icon="🕐">Lịch sử xử lý</SectionTitle>
            <Timeline
              items={data.logs.map((l) => ({
                dotClassName: TRANG_THAI_DOT_TONE[PXK_TRANG_THAI_TONE[l.trang_thai] ?? PXK_LOG_ONLY_TONE[l.trang_thai] ?? "gray"],
                title: (
                  <>
                    {trangThaiLabel([...PXK_TRANG_THAI_OPTIONS, ...PXK_LOG_ONLY_OPTIONS], l.trang_thai)}
                    {l.ghi_chu && <span className="font-normal text-[var(--ink-400)]"> ({l.ghi_chu})</span>}
                  </>
                ),
                time: `${l.nguoi_xu_ly} · ${fmtDateTime(l.ngay_xu_ly)}`,
              }))}
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
        />
      )}
      {/* Them don vao phieu (2026-09-21, yeu cau #4) - tai dung UI checkbox-list y het modal "Tạo
          phiếu xuất kho" (Chọn tất cả + tim kiem + danh sach checkbox tung dong DonHangKhaDungRow). */}
      {showThemDon && (
        <Modal
          open
          title="Thêm đơn vào phiếu"
          width="max-w-lg"
          onClose={() => { setShowThemDon(false); setThemDonSelected(new Set()); setThemDonQ(""); }}
        >
          <div className="space-y-2 text-sm">
            <input
              value={themDonQ}
              onChange={(e) => setThemDonQ(e.target.value)}
              placeholder="Tìm theo mã LK, tên LK..."
              className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="border border-[var(--line)] rounded-lg max-h-72 overflow-y-auto">
              {themDonKhaDungLoading ? (
                <div className="text-xs text-[var(--ink-500)] text-center py-4">Đang tải...</div>
              ) : themDonLoc.length === 0 ? (
                <div className="text-xs text-[var(--ink-400)] text-center py-4">Không có dòng nào khả dụng của đúng KTV này.</div>
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
                    Chọn tất cả ({themDonLoc.length})
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
                      <span className="text-[var(--ink-500)]">SL {r.so_luong_de_xuat}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => { setShowThemDon(false); setThemDonSelected(new Set()); setThemDonQ(""); }}>Huỷ</Btn>
              <Btn size="sm" onClick={() => themDonMutation.mutate()} disabled={themDonSelected.size === 0 || themDonMutation.isPending}>
                Thêm {themDonSelected.size > 0 ? `(${themDonSelected.size})` : ""}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
      {/* MOI (2026-09-22, phan hoi "ấn vào tiền số tiền ước tính, mở popup sửa SL thực xuất và đơn giá
          thực tế") - popup gon, chi 2 truong lien quan truc tiep toi con so hien trong cot "Tiền cần
          chuyển", dung LAI backend PATCH /dat-mua-lk/don-hang/:id (tnEditWindow) qua suaTienDongMutation. */}
      {suaTienDonId && (() => {
        const donSua = data?.donHang.find((x) => x.id === suaTienDonId);
        if (!donSua) return null;
        const slGoc = donSua.so_luong_thuc_xuat ?? donSua.so_luong_de_xuat;
        const slDaDoi = suaTienDraft.so_luong_thuc_xuat.trim() !== "" && Number(suaTienDraft.so_luong_thuc_xuat) !== slGoc;
        return (
          <Modal open title={`Sửa SL thực xuất / Đơn giá — ${donSua.ma_lk}`} width="max-w-sm" onClose={() => setSuaTienDonId(null)}>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">SL thực xuất</label>
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
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Lý do đổi SL thực xuất *</label>
                  <input
                    value={suaTienDraft.ghi_chu_so_luong}
                    onChange={(e) => setSuaTienDraft((p) => ({ ...p, ghi_chu_so_luong: e.target.value }))}
                    className={`focus-ring w-full bg-[var(--surface)] border rounded-lg px-2.5 py-1.5 text-sm ${!suaTienDraft.ghi_chu_so_luong.trim() ? "border-[var(--coral-400)]" : "border-[var(--ink-400)]"}`}
                  />
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Đơn giá thực tế</label>
                <input
                  type="number"
                  min={0}
                  value={suaTienDraft.gia_chot}
                  onChange={(e) => setSuaTienDraft((p) => ({ ...p, gia_chot: e.target.value }))}
                  className="focus-ring w-full bg-[var(--surface)] border border-[var(--ink-400)] rounded-lg px-2.5 py-1.5 text-sm"
                />
              </div>
              <div className="text-xs text-[var(--ink-500)]">
                Tiền cần chuyển sau khi lưu:{" "}
                <span className="font-semibold text-[var(--ink-700)]">
                  {fmtVND((Number(suaTienDraft.gia_chot) || 0) * (Number(suaTienDraft.so_luong_thuc_xuat) || 0))}
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <Btn variant="ghost" size="sm" onClick={() => setSuaTienDonId(null)}>Huỷ</Btn>
                <Btn
                  size="sm"
                  onClick={() =>
                    suaTienDongMutation.mutate({
                      donHangId: donSua.id,
                      body: {
                        so_luong_thuc_xuat: Number(suaTienDraft.so_luong_thuc_xuat),
                        gia_chot: suaTienDraft.gia_chot.trim() === "" ? undefined : Number(suaTienDraft.gia_chot),
                        ghi_chu_so_luong: slDaDoi ? suaTienDraft.ghi_chu_so_luong.trim() || undefined : undefined,
                      },
                    })
                  }
                  disabled={!suaTienDraft.so_luong_thuc_xuat.trim() || (slDaDoi && !suaTienDraft.ghi_chu_so_luong.trim()) || suaTienDongMutation.isPending}
                >
                  Lưu
                </Btn>
              </div>
            </div>
          </Modal>
        );
      })()}
    </Drawer>
  );
}

