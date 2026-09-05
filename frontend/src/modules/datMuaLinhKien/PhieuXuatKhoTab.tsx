import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Drawer, DrawerNavButtons, useDrawerArrowNav } from "../../components/ui/Drawer";
import { Select } from "../../components/ui/Select";
import { PaginatedTable, type Column } from "../../components/ui/PaginatedTable";
import { useColumnConfig } from "../../components/ui/useColumnConfig";
import { ColumnSettingsButton } from "../../components/ui/ColumnHeader";
import { KvRow } from "../../components/ui/KvRow";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { Timeline } from "../../components/ui/Timeline";
import { Stepper } from "../../components/ui/Stepper";
import { api, buildQuery, ApiError } from "../../api/client";
import { fmtDateTime, fmtVND } from "../../types";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import type { DonHangRow, PhieuXuatKhoRow, DonHangKhaDungRow, NguoiNhanHangKhaDungRow, LyDoChamRow, KtvDisplayMap } from "./types";
import { PXK_TRANG_THAI_TONE, CHUYEN_TIEN_TONE, PXK_TRANG_THAI_OPTIONS, CHUYEN_TIEN_OPTIONS, PXK_MINI_STEPS, PXK_MINI_LABEL } from "./constants";
import {
  describeApiError, formatNguoiDisplay, useKtvDisplayMap, ktvOptionLabel, invalidatePipelineCounts,
  trangThaiLabel, LOAI_DON_TONE,
} from "./helpers";
import { StatusBadge, ActiveFiltersBar, TrangThaiDropdownFilter, FilterSearchBar, KhuVucChipFilter } from "./SharedUi";
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
  addToast, qc, canTacNghiep, canKho, canKeToan, currentEmail, isAdmin, initialFilterOverride, initialNguoiNhanHangOverride, initialLoaiDonOverride,
  initialDetailIdOverride,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean; canKho: boolean; canKeToan: boolean; currentEmail: string; isAdmin: boolean;
  initialFilterOverride?: string; initialNguoiNhanHangOverride?: string;
  // Them (migration 0002_tra_hang_pxk.sql) - dat truoc sub-tab loai_don khi bam vao 1 trong 3 buoc
  // PXK tra hang tren pipeline (xem loaiDonFor trong DatMuaLinhKienModule.tsx).
  initialLoaiDonOverride?: string;
  // Mo THANG Drawer chi tiet 1 PXK (them 2026-09-05, thong bao "viec moi" link_type='phieu_xuat_kho')
  // - cung pattern voi DonCuaToiTab.initialDetailIdOverride (xem openDetailIdFor trong
  // DatMuaLinhKienModule.tsx).
  initialDetailIdOverride?: string;
}) {
  // FIX (2026-08-31, phan hoi "Phiếu xuất kho (x2) nhưng ấn vào lại...hiện 3 đơn (1 đơn đang chờ kế
  // toán)"): truoc day TN mac dinh giu "Tat ca" (y dinh ban dau: theo doi xuyen suot vong doi PXK minh
  // tao), nhung badge mo-count cho TN chi dem trang_thai "Dang tao phieu" (buoc TN thuc su can xu ly
  // tiep, xem GET /phieu-xuat-kho/mo-count) nen mac dinh "Tat ca" gay lech y het bug da sua o
  // DonCuaToiTab.tsx/TraHangTab.tsx - doi TN sang mac dinh dung buoc cua minh cho khop badge.
  // FIX (ra soat bug mua hang 2026-08-26, BUG-002): tach lop luu-lau-dai khoi lop hien-thi/query,
  // xem giai thich day du o DonCuaToiTab.tsx. Doi key -v2 (2026-08-31) de reset gia tri "Tat ca" cu.
  const [savedFilterTrangThai, setSavedFilterTrangThai] = useLocalStorageState(
    "filters:dmlk-pxk-tt-v2",
    canKeToan ? "Cho ke toan" : canKho ? "Da chot xong don xuat" : canTacNghiep ? "Dang tao phieu" : "",
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
    if (initialFilterOverride !== undefined) setFilterTrangThaiDisplay(initialFilterOverride);
  }, [initialFilterOverride]);
  // Loc theo "Nguoi nhan hang" (KTV) - them cung dot voi chot nghiep vu "1 PXK = 1 KTV" (migration
  // 0074), phuc vu drill-down tu tab "Bao cao" (nhay toi dung KTV + trang thai).
  const [filterNguoiNhanHang, setFilterNguoiNhanHang] = useState(initialNguoiNhanHangOverride ?? "");
  useEffect(() => {
    if (initialNguoiNhanHangOverride !== undefined) setFilterNguoiNhanHang(initialNguoiNhanHangOverride);
  }, [initialNguoiNhanHangOverride]);
  const [detailId, setDetailId] = useState<string | null>(null);
  useEffect(() => {
    if (initialDetailIdOverride) setDetailId(initialDetailIdOverride);
  }, [initialDetailIdOverride]);
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({ ghi_chu: "", so_tien_can_chuyen: "" });
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
  const [xemLoaiDon, setXemLoaiDon] = useState<"mua" | "cong_no" | "tra_hang">(
    initialLoaiDonOverride === "mua" || initialLoaiDonOverride === "cong_no" || initialLoaiDonOverride === "tra_hang" ? initialLoaiDonOverride : "mua",
  );
  useEffect(() => {
    if (initialLoaiDonOverride === "mua" || initialLoaiDonOverride === "cong_no" || initialLoaiDonOverride === "tra_hang") setXemLoaiDon(initialLoaiDonOverride);
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

  const q = timKiemDonHang.trim().toLowerCase();
  // Chi hien dong cua KTV DA CHON (chot nghiep vu 1 PXK = 1 KTV) - rong neu chua chon KTV.
  const donHangLoc = chonKtv
    ? (khaDungData?.rows ?? []).filter(
        (r) => r.nguoi_nhan_hang === chonKtv && (!q || r.ma_lk.toLowerCase().includes(q) || (r.ten_lk_snapshot ?? "").toLowerCase().includes(q)),
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
        dat_don_hang_ids: [...selectedDonHang],
        so_tien_can_chuyen: createData.so_tien_can_chuyen ? Number(createData.so_tien_can_chuyen) : undefined,
        nguoi_nhan_hang: chonKtv,
        loai_don: chonLoaiDon,
      }),
    onSuccess: (res) => {
      addToast(`Đã tạo phiếu xuất kho ${res.id}`);
      setShowCreate(false);
      setCreateData({ ghi_chu: "", so_tien_can_chuyen: "" });
      setSelectedDonHang(new Set());
      setTimKiemDonHang("");
      setChonKtv("");
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
      const ok = await downloadMisaExport(result.sheets, `MISA_${LOAI_DON_TONE[xemLoaiDon].label}_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
      key: "id",
      header: "Mã PXK",
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
      key: "ma_xuat_kho",
      header: "Mã đơn hàng",
      render: (r) => (r.ma_xuat_kho_xac_nhan ? r.ma_xuat_kho : <span className="text-[var(--ink-400)] italic">Chưa có (đang chờ KTV chuyển tiền)</span>),
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
        {/* SUA (phan hoi 2026-08-18) - xem giai thich chi tiet o cung mau nut nay trong DonCuaToiTab. */}
        {(["mua", "cong_no", "tra_hang"] as const).map((l) => {
          const active = xemLoaiDon === l;
          const attention = !active && loaiDonCounts[l] > 0;
          return (
            <button
              key={l}
              type="button"
              onClick={() => setXemLoaiDon(l)}
              className={`focus-ring rounded-lg font-semibold transition-colors px-2.5 py-1.5 text-xs ${
                active
                  ? "bg-[var(--ocean-800)] text-white shadow-sm"
                  : attention
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
        trailing={
          <div className="flex items-center gap-2">
            {settingsButtonEl}
            {/* Tai gop file MISA cho danh sach PXK dang hien theo bo loc (them 2026-09-02) - 3 nut
                rieng cho 3 mau, TN/Ke toan tu chon mau nao thi tai mau do (khong con tu dong 1 nut). */}
            {MISA_TEMPLATE_ORDER.map((tpl) => (
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
              <Btn size="sm" onClick={() => { setChonLoaiDon(xemLoaiDon); setShowCreate(true); }}>
                + Tạo phiếu xuất kho
              </Btn>
            )}
          </div>
        }
      >
        <TrangThaiDropdownFilter value={filterTrangThai} onChange={setFilterTrangThai} options={PXK_TRANG_THAI_OPTIONS} counts={statusCountsData?.counts} />
        {/* Bo loc Khu vuc (them 2026-08-31, dong bo voi DonCuaToiTab.tsx). */}
        {showKhuVucFilter && khuVucOptions.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">Khu vực</div>
            <KhuVucChipFilter value={filterKhuVuc} onChange={setFilterKhuVuc} options={khuVucOptions} />
          </div>
        )}
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
  id, onClose, addToast, qc, canTacNghiep, canKho, canKeToan, currentEmail, isAdmin, navRows, onNavigate,
}: {
  id: string; onClose: () => void; addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>; canTacNghiep: boolean; canKho: boolean; canKeToan: boolean;
  currentEmail: string; isAdmin: boolean;
  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "Drawer + Next/Previous") - xem comment day du o
  // DonHangDetailModal (cung pattern).
  navRows?: PhieuXuatKhoRow[];
  onNavigate?: (id: string) => void;
}) {
  const [ghiChu, setGhiChu] = useState("");
  const [maVanDonInput, setMaVanDonInput] = useState("");
  const [soTienMoi, setSoTienMoi] = useState("");
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
      }>(`/phieu-xuat-kho/${id}`),
  });

  function invalidate() {
    setGhiChu("");
    setMaVanDonInput("");
    setSoTienMoi("");
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

  const yeuCauChuyenTienMutation = useMutation({
    mutationFn: () => api.post(`/phieu-xuat-kho/${id}/chuyen-tien`, { so_tien: Number(soTienMoi) }),
    onSuccess: () => { invalidate(); addToast("Đã yêu cầu chuyển tiền"); },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const chuyenTienMutation = useMutation({
    mutationFn: (body: { trang_thai: string; bang_chung_chuyen_tien_url?: string; bang_chung_chuyen_tien_ghi_chu?: string }) => api.patch(`/phieu-xuat-kho/${id}/chuyen-tien`, body),
    onSuccess: () => { invalidate(); addToast("Đã cập nhật chuyển tiền"); },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const pxk = data?.phieuXuatKho;
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
              ? "Ghi chú (bắt buộc nếu bấm Kế toán huỷ)"
              : "Ghi chú (tuỳ chọn)"
          }
          className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        {/* Icon hoa (phan hoi 2026-08-19: "PXK được tạo ra đang bị tràn vùng xem... dựa theo
            cách xử ở table TN để làm chuẩn") - cung mau pattern icon+tooltip da ap dung cho 4
            nut Duyet/Cho hang/Tu choi/Huy trong DonCuaToiTab.tsx (title/aria-label giu nguyen
            ten day du, className="px-2" thu hep padding ngang) - chi khac o day la hang nut
            WORKFLOW cua CA PXK (khong phai tung dong), van giu nguyen dieu kien hien/disabled cu. */}
        <div className="flex gap-1 flex-wrap">
          {canTacNghiep && trangThai === "Dang tao phieu" && (
            <Btn
              size="sm"
              className="px-2"
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
            <Btn
              size="sm"
              variant="danger"
              className="px-2"
              onClick={() => logMutation.mutate("Ke toan huy")}
              disabled={logMutation.isPending || !ghiChu.trim()}
              title={!ghiChu.trim() ? "Cần nhập ghi chú/lý do huỷ trước" : "Kế toán huỷ"}
              aria-label="Kế toán huỷ"
            >
              🗑
            </Btn>
          )}
          {canKeToan && trangThai === "Cho ke toan" && (
            <Btn
              size="sm"
              className="px-2"
              onClick={() => logMutation.mutate("Da chot xong don xuat")}
              disabled={logMutation.isPending || !pxk.ma_misa}
              loading={logMutation.isPending}
              title={!pxk.ma_misa ? "Cần nhập Mã MISA trước" : "Đã chốt xong đơn xuất"}
              aria-label="Đã chốt xong đơn xuất"
            >
              ✅
            </Btn>
          )}
          {/* SUA (migration 0002_tra_hang_pxk.sql): PXK tra hang KHONG co buoc "dang gui" trung
              gian (hang khong phai ship di dau) - chi 1 nut Kho xac nhan da nhan hang VE kho. */}
          {canKho && trangThai === "Da chot xong don xuat" && pxk.loai_don === "tra_hang" && (
            <Btn size="sm" className="px-2" onClick={() => logMutation.mutate("Kho da nhan hang tra")} disabled={logMutation.isPending} loading={logMutation.isPending} title="Kho đã nhận hàng trả" aria-label="Kho đã nhận hàng trả">
              📥
            </Btn>
          )}
          {canKho && trangThai === "Da chot xong don xuat" && pxk.loai_don !== "tra_hang" && (
            <>
              <Btn size="sm" className="px-2" onClick={() => logMutation.mutate("Dang gui KTV")} disabled={logMutation.isPending} loading={logMutation.isPending} title="Đang gửi KTV" aria-label="Đang gửi KTV">
                🚚
              </Btn>
              <Btn size="sm" variant="ghost" className="px-2" onClick={() => logMutation.mutate("Hang tru kho")} disabled={logMutation.isPending} title="Hàng trừ kho" aria-label="Hàng trừ kho">
                📦
              </Btn>
            </>
          )}
          {/* Muc F (Dot 2): CHOT bat buoc DUNG nguoi nhan hang xac nhan - an nut voi moi nguoi
              khac (ke ca Admin/TN xem, du backend van cho Admin bam duoc de xu ly su co). */}
          {trangThai === "Dang gui KTV" && currentEmail === pxk.nguoi_nhan_hang && (
            <Btn size="sm" className="px-2" onClick={() => logMutation.mutate("KTV da nhan")} disabled={logMutation.isPending} loading={logMutation.isPending} title="KTV đã nhận" aria-label="KTV đã nhận">
              📥
            </Btn>
          )}
          {trangThai === "Dang gui KTV" && currentEmail !== pxk.nguoi_nhan_hang && isAdmin && (
            <Btn size="sm" variant="ghost" className="px-2" onClick={() => logMutation.mutate("KTV da nhan")} disabled={logMutation.isPending} title="KTV đã nhận (Admin xác nhận thay - trường hợp đặc biệt)" aria-label="KTV đã nhận (Admin xác nhận thay)">
              🛡️📥
            </Btn>
          )}
          {canKho && trangThai === "Dang gui KTV" && (
            <Btn size="sm" variant="ghost" className="px-2" onClick={() => logMutation.mutate("Kho da ket thuc")} disabled={logMutation.isPending} title="Kho đã kết thúc (KTV không phản hồi)" aria-label="Kho đã kết thúc (KTV không phản hồi)">
              ⏹️
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
      title={`Phiếu xuất kho ${id}`}
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
          {/* MOI (concept 1 "Structured Neutral", pattern .stepper): dai buoc tuyen tinh cho luong
              chinh cua PXK (5 buoc chinh trong PXK_MINI_STEPS) - bo sung canh PxkMiniPipeline hien co
              (chevron, van GIU NGUYEN khong doi), khong thay the. Trang thai nhanh re (Ke toan huy/
              Hang tru kho/Kho da ket thuc/Kho da nhan hang tra) khong nam trong truc chinh -> khong
              buoc nao duoc danh dau "done"/"cur", giong dung cach PxkMiniPipeline xu ly re nhanh. */}
          <Stepper
            steps={PXK_MINI_STEPS.map((s, i) => {
              const idxHienTai = PXK_MINI_STEPS.indexOf(trangThai as (typeof PXK_MINI_STEPS)[number]);
              return { label: PXK_MINI_LABEL[s], state: idxHienTai < 0 ? "todo" : i < idxHienTai ? "done" : i === idxHienTai ? "cur" : "todo" };
            })}
          />
          {/* CHOT (ra soat module "Dat Mua Linh Kien 2.0" #19): mini pipeline dau modal - truoc day
              chi co 1 StatusBadge dong dau, khong biet dang o buoc may trong bao nhieu buoc cua vong
              doi PXK (9 trang thai). */}
          <PxkMiniPipeline trangThai={trangThai} />
          <div className="flex gap-3 items-center flex-wrap">
            {pxk.ma_xuat_kho_xac_nhan ? (
              <span className="font-mono font-bold">{pxk.ma_xuat_kho}</span>
            ) : (
              <span className="text-[var(--ink-400)] italic text-xs">Chưa có mã đơn hàng (đang chờ KTV chuyển tiền)</span>
            )}
            {pxk.ma_xuat_kho_xac_nhan &&
              MISA_TEMPLATE_ORDER.map((tpl) => (
                <Btn
                  key={tpl}
                  size="sm"
                  variant="ghost"
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
            {pxk.ma_misa && <span className="text-xs text-[var(--ink-500)]">Mã MISA: <span className="font-mono">{pxk.ma_misa}</span></span>}
            {pxk.ma_van_don && <span className="text-xs text-[var(--ink-500)]">Mã vận đơn: <span className="font-mono">{pxk.ma_van_don}</span></span>}
            {pxk.anh_bien_ban_url && (
              <a href={pxk.anh_bien_ban_url} target="_blank" rel="noreferrer" className="text-[var(--ocean-800)] underline text-xs">Xem ảnh biên bản</a>
            )}
          </div>

          {/* Gop 4 "the" nho (phan lon loai tru nhau theo trang_thai) vao 1 grid 2 cot tu sm+ - xem
              comment o <Modal width="max-w-2xl"> phia tren. */}
          <div className="grid sm:grid-cols-2 gap-3">
          {/* Muc C (Dot 2, 2026-08-15): TN nhap "Ma don hang" that SAU khi KTV da chuyen tien xong -
              chi hien luc con "Dang tao phieu", bat buoc truoc khi duoc gui ke toan (chan o backend). */}
          {canTacNghiep && trangThai === "Dang tao phieu" && (
            <div className="border border-[var(--line)] rounded-lg p-3">
              <SectionTitle>Mã đơn hàng {!pxk.ma_xuat_kho_xac_nhan && <span className="text-[var(--coral-600)] normal-case tracking-normal">*</span>}</SectionTitle>
              <div className="flex gap-2 items-end">
                <input
                  value={maXuatKhoDraft}
                  onChange={(e) => setMaXuatKhoDraft(e.target.value)}
                  placeholder={pxk.ma_xuat_kho_xac_nhan ? pxk.ma_xuat_kho : "Nhập mã đơn hàng sau khi KTV đã chuyển tiền"}
                  className="focus-ring flex-1 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <Btn size="sm" onClick={() => maXuatKhoMutation.mutate()} disabled={!maXuatKhoDraft.trim() || maXuatKhoMutation.isPending}>Lưu</Btn>
              </div>
            </div>
          )}

          {/* Muc D (Dot 2): Ke toan dien "Ma MISA" tren chinh PXK, bat buoc truoc khi chot xong don xuat. */}
          {canKeToan && trangThai === "Cho ke toan" && (
            <div className="border border-[var(--line)] rounded-lg p-3">
              <SectionTitle>Mã MISA {!pxk.ma_misa && <span className="text-[var(--coral-600)] normal-case tracking-normal">*</span>}</SectionTitle>
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
              <SectionTitle>Ảnh biên bản tiếp nhận (không bắt buộc)</SectionTitle>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={uploadingAnh}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUploadAnhBienBan(f); }}
                className="text-xs"
              />
              {uploadingAnh && <div className="text-xs text-[var(--ink-500)] mt-2">Đang tải ảnh...</div>}
            </div>
          )}

          <div className="border border-[var(--line)] rounded-lg p-3">
            <SectionTitle>Chuyển tiền</SectionTitle>
            {pxk.so_tien_can_chuyen == null ? (
              canTacNghiep && trangThai === "Dang tao phieu" ? (
                <div className="flex gap-2 items-end">
                  <input
                    type="number"
                    value={soTienMoi}
                    onChange={(e) => setSoTienMoi(e.target.value)}
                    placeholder="Số tiền cần chuyển"
                    className="focus-ring flex-1 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <Btn size="sm" onClick={() => yeuCauChuyenTienMutation.mutate()} disabled={!soTienMoi || yeuCauChuyenTienMutation.isPending}>Yêu cầu chuyển</Btn>
                </div>
              ) : (
                <span className="text-[var(--ink-400)] text-xs">Không cần chuyển tiền</span>
              )
            ) : (
              <>
                <KvRow label="Số tiền"><span className="font-semibold text-[var(--green-700)]">{fmtVND(pxk.so_tien_can_chuyen)}</span></KvRow>
                <KvRow label="Trạng thái"><StatusBadge value={pxk.trang_thai_chuyen_tien ?? ""} tones={CHUYEN_TIEN_TONE} options={CHUYEN_TIEN_OPTIONS} /></KvRow>
                {pxk.bang_chung_chuyen_tien_url && (
                  <KvRow label="Bằng chứng"><a href={pxk.bang_chung_chuyen_tien_url} target="_blank" rel="noreferrer" className="text-[var(--ocean-800)] underline text-xs">Xem bằng chứng</a></KvRow>
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
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={uploadingBangChung}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUploadBangChungChuyenTien(f); }}
                        className="text-xs"
                      />
                      {uploadingBangChung && <span className="text-xs text-[var(--ink-500)]">Đang tải ảnh...</span>}
                      {bangChungUrl && !uploadingBangChung && <span className="text-xs text-[var(--teal-600)]">✓ Đã tải ảnh, sẵn sàng xác nhận</span>}
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <input
                        value={bangChungGhiChuDraft}
                        onChange={(e) => setBangChungGhiChuDraft(e.target.value)}
                        placeholder="Hoặc ghi chú thông tin chuyển khoản (vd: đã chuyển qua Momo, mã GD...)"
                        className="focus-ring flex-1 min-w-[200px] bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
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
            <SectionTitle>Dòng đơn hàng</SectionTitle>
            <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[var(--surface-soft)] border-b border-[var(--line)]">
                    <th className="px-2.5 py-2">Mã</th>
                    <th className="px-2.5 py-2">Tên LK</th>
                    <th className="px-2.5 py-2 text-right">SL</th>
                    <th className="px-2.5 py-2">Lý do chậm</th>
                  </tr>
                </thead>
                <tbody>
                  {data.donHang.map((d) => (
                    <tr key={d.id} className={`border-b border-[var(--line)] last:border-0 hover:bg-slate-50 ${d.uu_tien === 1 ? "bg-[var(--orange-100)] ring-1 ring-inset ring-[var(--orange-500)]" : ""}`}>
                      <td className="px-2.5 py-2 font-mono">{d.ma_lk}</td>
                      <td className="px-2.5 py-2">
                        {d.uu_tien === 1 && <span title="Ưu tiên">⭐ </span>}
                        {d.ten_lk_snapshot ?? d.ma_lk}
                      </td>
                      <td className="px-2.5 py-2 text-right">{d.so_luong_de_xuat}</td>
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
                          {canTacNghiep && trangThai === "Dang tao phieu" && d.qua_han_ly_do_cham ? (
                            <div className="flex flex-col gap-1">
                              {/* CHOT (phan hoi 2026-08-24: "đổi hẳn thành dropdown bắt buộc, bỏ ô nhập
                                  tay") - Select BAT BUOC chon tu danh muc "Mua hàng" (settings_ly_do_cham),
                                  khong con o nhap tu do - neu Settings CHUA co ly do nao, TN se khong
                                  nhap duoc cho toi khi Admin bo sung (dung y da chot voi nguoi dung). */}
                              <div className="flex gap-1 items-center">
                                <Badge tone="coral">Quá hạn</Badge>
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
                          ) : (!d.giaiTrinh || d.giaiTrinh.length === 0) ? (
                            <span className="text-[var(--ink-400)]">—</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* "Lịch sử xử lý" - noi dung SAU CUNG trong vung cuon (footer ghi chu/nut thao tac da
              chuyen ra ngoai vao Drawer footer, xem bien `footer` phia tren). */}
          <div>
            <SectionTitle>Lịch sử xử lý</SectionTitle>
            <Timeline
              items={data.logs.map((l) => ({
                title: (
                  <>
                    {trangThaiLabel(PXK_TRANG_THAI_OPTIONS, l.trang_thai)}
                    {l.ghi_chu && <span className="font-normal text-[var(--ink-400)]"> ({l.ghi_chu})</span>}
                  </>
                ),
                time: `${l.nguoi_xu_ly} · ${fmtDateTime(l.ngay_xu_ly)}`,
              }))}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}

