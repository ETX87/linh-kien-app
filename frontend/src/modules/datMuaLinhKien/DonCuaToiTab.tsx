import { useState, useEffect, useMemo, useRef, Fragment, lazy, Suspense } from "react";
// Lazy: PhieuXuatKhoTab da import DonHangDetailModal tu file nay - tranh vong import tinh (2026-10-02).
const PxkDetailModalLazy = lazy(() => import("./PhieuXuatKhoTab").then((m) => ({ default: m.PxkDetailModal })));
import { BangChungAnhPxk } from "./XemAnhNhanh";
import { LoaiChietKhauText, LoaiChietKhauPicker, HoaDonGiaNiemYet, TienDaTraDon, coYeuCauHoaDon, useLoaiChietKhauList, tenLoaiChietKhau, duocDoiLoaiChietKhau } from "./LoaiChietKhau";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { FileButton } from "../../components/ui/FileButton";
import { Badge, type Tone } from "../../components/x/Badge";
import { Modal } from "../../components/ui/Modal";
import { Drawer, DrawerNavButtons, useDrawerArrowNav, DRAWER_WIDTH_CHI_TIET } from "../../components/ui/Drawer";
import { Select } from "../../components/ui/Select";
import { KvRow } from "../../components/ui/KvRow";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { IconChip } from "../../components/ui/IconChip";
import { Tooltip } from "../../components/ui/Tooltip";
import { Timeline } from "../../components/ui/Timeline";
import type { Column } from "../../components/ui/PaginatedTable";
import { useColumnConfig } from "../../components/ui/useColumnConfig";
import { useAutoColumnWidths, BADGE_FONT, BADGE_PAD, MONO_FONT, type AutoWidthSpec } from "../../components/ui/useAutoColumnWidths";
import { ColumnSettingsButton, ResizableHeaderCell } from "../../components/ui/ColumnHeader";
import { api, buildQuery } from "../../api/client";
import { exportRowsToExcel } from "../../lib/exportExcel";
import { fmtDate, fmtDateTime, fmtVND } from "../../types";
import { useAuth } from "../../auth/AuthContext";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { getOptionsForUser } from "../../lib/loaiDeXuatCache";
import { formatPersonDisplay, usePersonDirectory, doiNguoiThanhTen } from "../../lib/personDisplay";
import type { DonHangRow, DonHangLogRow, LyDoChamRow, ActionTarget, DonHangDraft, NguoiNhanHangKhaDungRow } from "./types";
import {
  DON_HANG_TRANG_THAI_TONE_ALL, DON_HANG_ROW_STYLE, TRANG_THAI_DOT_TONE, DON_CUA_TOI_TRANG_THAI_OPTIONS,
  DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, DON_HANG_DANG_MO, BULK_LOG_ERROR_MESSAGES, TRA_HANG_BULK_ERROR_MESSAGES, YEU_CAU_HOA_DON_OPTIONS,
  CHINH_SACH_OPTIONS, YEU_CAU_HOA_DON_SHORT_LABELS, TRA_HANG_TRANG_THAI_OPTIONS, TAT_CA_LOAI_TRANG_THAI_OPTIONS,
  CHUYEN_TIEN_TONE, CHUYEN_TIEN_OPTIONS, PXK_TRANG_THAI_TONE, PXK_TRANG_THAI_OPTIONS,
  THIEU_LK_TRANG_THAI_TONE, THIEU_LK_TRANG_THAI_OPTIONS,
  TRANG_THAI_PXK_DON_OPTIONS, TRANG_THAI_PXK_DON_TONE, THANH_TOAN_DON_OPTIONS, THANH_TOAN_DON_TONE,
} from "./constants";
import {
  describeApiError, formatNguoiDisplay, useKtvDisplayMap, ktvOptionLabel, invalidatePipelineCounts,
  LOAI_DON_TONE, loaiDonLabel, deriveLoaiDon, laTruCongNo, actionsFor, laTraHangChoTn, laChoHangMoKhoa, laChoHangBiKhoa, dayLaiDuoc, trangThaiLabel, canNoRequired, maYcscRequired, coMaIdLienQuan, pickLdeQuick, emptyDraft,
  useLkAndLdeCache, useLkCombo, useLinhKienRankMap, formatLkLabel, isCongNoTaoHo, isDonTaoHo,
  donGiaSauChietKhau, tienSauChietKhau, giaNiemYet, boQuaTbpDacThu, lkCamBanVoiLoai } from "./helpers";
import { StatusBadge, LoaiDeXuatBadge, loaiDeXuatText, ActiveFiltersBar, TrangThaiDropdownFilter, KhuVucChipFilter, BulkConfirmButton, MaYcscCell, DetailZone, QuickStat, ImageLink, LogTieuDe } from "./SharedUi";
import { MaYeuCauSuCoCheck } from "./MaYeuCauSuCoCheck";
import { MaLadaCheck } from "./MaLadaCheck";
import { LinhKienPicker, LinhKienDetailModal } from "./LinhKienPicker";
// Lien ket 2 chieu voi ticket thieu LK (phan hoi 2026-09-10) - xem giai thich import vong o
// ThieuLkTab.tsx (file do cung import nguoc lai DonHangDetailModal tu day).
import { ThieuLkDetailModal } from "./ThieuLkTab";
import { Money } from "../../components/ui/Money";
import { TongNgayKtvInfo } from "./TongNgayKtv";
import { NguoiTao, NguoiNhan } from "../../components/ui/TenNguoi";
import { useLocCot, LocCotButton, LocCotBar, type LocCotCfg } from "../../components/ui/LocCot";
import { TienPhieuVaQuy, BangChungAnhList, BangChungChuyenTienForm, docAnhBangChung } from "./BangChungChuyenTien";
import { TraHangDetailModal } from "./TraHangTab";
import { t } from "../../i18n";

// FIX (ra soat "logic sai theo vai tro" 2026-08-31): KTV/Ve tinh khong co tab "Phieu xuat kho" rieng
// (chi Tac nghiep/Kho/Ke toan/Giam sat moi thay, xem canXemPxkTab o DatMuaLinhKienModule.tsx) - theo
// xac nhan nguoi dung "Vệ tinh không cần quan tâm đến PXK... toàn bộ thông tin PXK có thể xem được ở
// đơn chi tiết", PXK cua dong dang xem gio nhung SAU DAY trong chinh Drawer nay thay vi mo them 1 man
// hinh rieng. Field lay tu GET /dat-mua-lk/don-hang/:id (them cung dot).
interface PxkInfo {
  id: string;
  trang_thai: string | null;
  so_tien_can_chuyen: number | null;
  trang_thai_chuyen_tien: string | null;
  bang_chung_chuyen_tien_url: string | null;
  bang_chung_chuyen_tien_anh?: string | null; // JSON array URL (migration 0043)
  bang_chung_tien_doc?: string | null; // so tien tu doc tren anh (migration 0051)
  anh_da_ghi_nhan?: string | null;
  ly_do_tu_choi_chuyen_tien?: string | null; // Ke toan tu choi bang chung (migration 0046)
  tu_choi_chuyen_tien_luc?: string | null;
  da_thanh_toan?: number; // quy du KTV (migration 0047)
  quy_du?: number | null;
  bang_chung_chuyen_tien_ghi_chu: string | null;
  nguoi_nhan_hang: string | null;
  ma_xuat_kho: string | null;
  // Thong tin phieu hien o chi tiet don (2026-10-02).
  ma_xuat_kho_xac_nhan?: number | null;
  ma_misa?: string | null;
  ma_van_don?: string | null;
  ngay_tao?: string | null;
  nguoi_tao?: string | null;
  loai_don?: string | null;
  so_dong?: number | null;
}

// Them (phan hoi 2026-09-10: "đơn gốc cũng không có truy vấn đến đơn ticket đơn thiếu linh kiện") -
// ban ghi thieu_lk MOI NHAT cua dong nay (neu co), tra ve tu GET /dat-mua-lk/don-hang/:id.
interface ThieuLkRefInfo {
  id: string;
  trang_thai: string | null;
  // Dua thong tin ticket ra don goc (2026-09-30).
  ngay_du_kien_co_hang?: string | null;
  ngay_hang_ve_thuc_te?: string | null;
  tiep_nhan_luc?: string | null;
  nguoi_tiep_nhan?: string | null;
}

export function DonHangDetailModal({
  id,
  onClose,
  addToast,
  qc,
  canTacNghiep,
  canTPDvbhXacNhan,
  canActAsTram,
  currentEmail,
  isAdmin,
  canXemChiTietCa,
  canKho,
  openCase,
  navRows,
  onNavigate,
  giuPhieuTrong,
}: {
  id: string;
  onClose: () => void;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean;
  canTPDvbhXacNhan: boolean;
  canActAsTram: boolean;
  currentEmail: string;
  // "Hủy" (phan hoi 2026-09-05, muc #4) - CHI nguoi tao hoac Admin duoc huy, xem canHuy trong
  // helpers.ts actionsFor(). Optional = mac dinh false (khong phai Admin) o noi goi chua kip cap nhat.
  isAdmin?: boolean;
  canXemChiTietCa: boolean;
  // Them (phan hoi 2026-09-10, lien ket 2 chieu voi ticket thieu LK) - chi de truyen tiep sang
  // ThieuLkDetailModal khi mo tu day (quyet dinh nut hanh dong Kho co hien hay khong). Optional = mac
  // dinh false o noi goi chua co san context nay (vd mo tu ThieuLkTab, xem canKho o do).
  canKho?: boolean;
  openCase?: (id: string, tab?: string) => void;
  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "Drawer + Next/Previous"): danh sach DONG PHANG
  // cua TRANG dang xem (component cha da fetch san, khong goi API moi) de duyet qua tung dong lien
  // tiep ma khong phai dong Drawer roi bam lai tu dau. Optional - undefined = an nut dieu huong (vd
  // noi goi tuong lai khac chua can tinh nang nay).
  navRows?: DonHangRow[];
  onNavigate?: (id: string) => void;
  // true = mo tu man chi tiet PXK (chot 2026-09-28, muc 5): TN doi trang thai don cuoi cua phieu thi GIU phieu
  // trong (dong man phieu moi tu huy); mac dinh (mo tu danh sach don) = huy phieu ngay.
  giuPhieuTrong?: boolean;
}) {
  const [ghiChu, setGhiChu] = useState("");
  // "Tu choi" bat buoc chon 1 Ly do cham, "Huy" bat buoc nhap ghiChu tu do (phan hoi UX muc 1, xem
  // comment applyDonHangLog o backend).
  const [actionTarget, setActionTarget] = useState<"tu_choi" | "cho_hang" | "huy" | "duyet_qua_han" | "day_lai" | null>(null);
  // Canh bao "Công nợ tạo hộ" (them 2026-08-24, muc 4) - chan 1 nhip TRUOC khi goi mutation "duyet"
  // that su, xem isCongNoTaoHo o helpers.ts.
  const [confirmDuyetTaoHo, setConfirmDuyetTaoHo] = useState(false);
  const [lyDoChamId, setLyDoChamId] = useState("");
  // FIX (phan hoi QA 2026-08-31, muc #4: "khi duyệt đơn, nếu SL đặt > 1, TN có thể sửa SL thực xuất,
  // nếu đổi thì bắt buộc ghi chú lý do") - 2 state rieng, dong bo lai tu du lieu MOI moi khi id doi
  // (dieu huong "Duyet va tiep theo" tai su dung CUNG 1 component instance, khong remount - xem
  // useEffect duoi).
  const [soLuongThucXuat, setSoLuongThucXuat] = useState("");
  const [lyDoSoLuong, setLyDoSoLuong] = useState("");
  const [showThieuLk, setShowThieuLk] = useState(false);
  const [showPxk, setShowPxk] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["dat-mua-lk-don-hang-detail", id],
    queryFn: () => api.get<{ donHang: DonHangRow; pxk: PxkInfo | null; thieuLk: ThieuLkRefInfo | null }>(`/dat-mua-lk/don-hang/${id}`),
  });
  useEffect(() => {
    if (data?.donHang && data.donHang.id === id) {
      setSoLuongThucXuat(String(data.donHang.so_luong_thuc_xuat ?? data.donHang.so_luong_de_xuat));
      setLyDoSoLuong("");
    }
  }, [data?.donHang, id]);
  const { data: lyDoData } = useQuery({
    queryKey: ["dat-mua-lk-ly-do-cham"],
    queryFn: () => api.get<{ rows: LyDoChamRow[] }>("/dat-mua-lk/ly-do-cham?he_thong=" + encodeURIComponent("Mua hàng")),
    enabled: canTacNghiep,
  });

  function invalidate() {
    setGhiChu("");
    setActionTarget(null);
    setLyDoChamId("");
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail", id] });
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
    // Doi trang thai don trong PXK -> don tu go khoi phieu (chot 2026-09-28) - lam moi man phieu dang mo.
    qc.invalidateQueries({ queryKey: ["pxk-detail"] });
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
    invalidatePipelineCounts(qc);
  }

  // TN bat/tat "Linh kiện đặc thù" tren don (2026-10-02, PATCH /don-hang/:id/dac-thu) - tat: thoat buoc TBP + khong con bat
  // buoc thanh toan moi "Chờ hàng"; bat: don "Chờ TN duyệt" vao lai buoc TBP (tru loai de xuat bo qua TBP).
  const dacThuMutation = useMutation({
    mutationFn: (dac_thu: boolean) => api.patch<{ trang_thai: string }>(`/dat-mua-lk/don-hang/${id}/dac-thu`, { dac_thu }),
    onSuccess: (res, dac_thu) => {
      addToast(t("{a} linh kiện đặc thù cho đơn → {b}", { a: dac_thu ? t("Đã bật") : t("Đã tắt"), b: trangThaiLabel(DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, res.trang_thai) }));
      invalidate();
    },
    onError: (err) => addToast(t("Không đổi được linh kiện đặc thù: ") + describeApiError(err)),
  });

  const logMutation = useMutation({
    mutationFn: ({ hanh_dong, ly_do_cham_id, so_luong_thuc_xuat, ghi_chu_so_luong }: { hanh_dong: string; ly_do_cham_id?: number; so_luong_thuc_xuat?: number; ghi_chu_so_luong?: string }) =>
      api.post(`/dat-mua-lk/don-hang/${id}/log`, { hanh_dong, ly_do_cham_id, ghi_chu: ghiChu.trim() || undefined, so_luong_thuc_xuat, ghi_chu_so_luong, giu_phieu_trong: giuPhieuTrong || undefined }),
    onSuccess: (_res, variables) => {
      invalidate();
      // UI redesign (phan hoi Codex 2026-08-19, muc P2 "Duyet va tiep"): sau khi Duyet, tu dong nhay
      // sang dong TIEP THEO trong danh sach dang xem (navRows - snapshot LUC MO drawer, van dung du
      // dong vua duyet se bien mat khoi danh sach sau khi TN filter mac dinh "Cho TN duyet" refetch)
      // thay vi dong lai drawer - TN duyet hang loat khong phai dong/mo lai tung dong. Chi ap dung cho
      // "duyet" (tu choi/huy van can nguoi dung tu xem lai ket qua, khong nhay tiep tu dong).
      if (variables.hanh_dong === "duyet" && onNavigate && navNextId) {
        onNavigate(navNextId);
      } else {
        addToast(t("Đã cập nhật trạng thái dòng đơn hàng"));
      }
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  // TN "đẩy lại" don da huy / tu choi ve "Chờ TN duyệt" trong 24h (chot 2026-10-05).
  const dayLaiMutation = useMutation({
    mutationFn: () => api.post(`/dat-mua-lk/don-hang/${id}/day-lai`, { ghi_chu: ghiChu.trim() || undefined }),
    onSuccess: () => {
      invalidate();
      addToast(t("Đã đẩy lại đơn {a} về Chờ TN duyệt", { a: id }));
    },
    onError: (err) => addToast(t("Không đẩy lại được đơn: ") + describeApiError(err)),
  });

  // "Lý do chậm" khi dòng còn "Cho TN duyệt" quá hạn (phản hồi: "danh sách chờ TN duyệt đang không có
  // nơi để nhập lý do quá hạn") - cùng pattern/endpoint với PhieuXuatKhoTab.tsx. SUA (phan hoi QA
  // 2026-08-31, muc #5): doi tu PATCH /don-hang/:id { ly_do_cham } (1 lan duy nhat, khoa vinh vien) ->
  // POST /don-hang/:id/giai-trinh (migration 0014) - cho phep giai trinh LAP LAI moi khi qua han lai.
  const [lyDoChamDraft, setLyDoChamDraft] = useState("");
  // TN xac nhan don da thanh toan bang quy du cua KTV nhan hang (chot 2026-09-30) - POST /don-hang/:id/tra-bang-quy.
  const traBangQuyMutation = useMutation({
    mutationFn: () => api.post<{ ok: true; so_tien: number }>(`/dat-mua-lk/don-hang/${id}/tra-bang-quy`, {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail", id] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      addToast(t("Đã trừ quỹ {a} — đơn đã thanh toán", { a: fmtVND(r.so_tien) }));
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  const lyDoChamMutation = useMutation({
    mutationFn: (noi_dung: string) => api.post(`/dat-mua-lk/don-hang/${id}/giai-trinh`, { noi_dung }),
    onSuccess: () => {
      setLyDoChamDraft("");
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail", id] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      addToast(t("Đã lưu lý do chậm"));
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  // Khoi PXK cua dong (xem PxkInfo o dau file) - reuse dung endpoint/logic da co san o
  // PhieuXuatKhoTab.tsx (POST bang-chung-chuyen-tien, PATCH chuyen-tien, POST log "KTV da nhan"), chi
  // khac noi hien thi (ngay trong Drawer nay thay vi 1 man PXK rieng KTV khong vao duoc).
  function invalidatePxk() {
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail", id] });
    invalidatePipelineCounts(qc);
  }
  const pxkLogMutation = useMutation({
    mutationFn: ({ pxkId, trang_thai }: { pxkId: string; trang_thai: string }) => api.post(`/phieu-xuat-kho/${pxkId}/log`, { trang_thai }),
    onSuccess: () => {
      invalidatePxk();
      addToast(t("Đã cập nhật trạng thái phiếu xuất kho"));
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  function confirmTuChoi() {
    if (actionTarget !== "tu_choi" && actionTarget !== "cho_hang") return;
    // "Cho TBP xac nhan"/"Cho Tram duyet" tu choi don gian - khong can chon Ly do cham, chi ghi chu
    // tu do (nay BAT BUOC, hang muc #19 2026-08-25 - nut xac nhan da disable san khi rong). "TN da
    // duyet" (phan hoi 2026-09-24) dung chung nhanh nay - backend (laTuChoiSauDuyet) cung chi doi
    // ghi_chu tu do, khong nhan ly_do_cham_id.
    // "Cho hang" tu "TN da duyet" (2026-09-28) di nhanh chon ly do ben duoi (mo ticket thieu LK), CHI
    // "tu_choi" moi dung ghi chu tu do.
    if (
      data?.donHang.trang_thai === "Cho TBP xac nhan" ||
      data?.donHang.trang_thai === "Cho Tram duyet" ||
      (data?.donHang.trang_thai === "TN da duyet" && actionTarget === "tu_choi")
    ) {
      if (!ghiChu.trim()) return;
      logMutation.mutate({ hanh_dong: "tu_choi" });
      return;
    }
    if (!lyDoChamId) return;
    // Ca "tu_choi" lan "cho_hang" deu goi CUNG 1 hanh_dong backend "tu_choi" - he thong tu quyet
    // dinh ket qua thuc te ("TN tu choi" hay "Cho hang") dua tren co quan_ly_don_thieu_linh_kien cua
    // ly_do_cham_id da chon (xem comment actionsFor.choHang o helpers.ts).
    logMutation.mutate({ hanh_dong: "tu_choi", ly_do_cham_id: Number(lyDoChamId) });
  }
  function confirmHuy() {
    if (actionTarget !== "huy" || !ghiChu.trim()) return;
    logMutation.mutate({ hanh_dong: "huy" });
  }
  // Hang muc #17/#18 (2026-08-25): "Duyệt" 1 dong da qua han 24h "Cho TN duyet" bat buoc chon ly do
  // truoc (dung LAI danh sach lyDoData, khong tach nhom nhu confirmTuChoi vi day khong phai tu
  // choi/mo ticket thieu hang).
  function confirmDuyetQuaHan() {
    if (actionTarget !== "duyet_qua_han" || !lyDoChamId) return;
    if (soLuongThucXuatDaDoi && !lyDoSoLuong.trim()) return;
    logMutation.mutate({ ...duyetPayload(), ly_do_cham_id: Number(lyDoChamId) });
  }

  const d = data?.donHang;
  const pxk = data?.pxk;
  const thieuLk = data?.thieuLk;
  const personDirChiTiet = usePersonDirectory();
  const actions = d ? actionsFor(d, { canTacNghiep, canTPDvbhXacNhan, canActAsTram, currentEmail, isAdmin }) : { duyet: false, tuChoi: false, choHang: false, huy: false };
  // Muc #4: SL thuc xuat CHI cho sua khi dong dang "Cho TN duyet" va SL de xuat > 1 (dung dieu kien
  // nguoi dung neu ra). "Da doi" so voi SL de xuat (khong phai so voi gia tri cu da luu - dong nay
  // chua tung duoc duyet nen chua co "gia tri cu" nao khac SL de xuat) la dieu kien bat buoc ghi chu.
  const soLuongThucXuatDaDoi = !!d && d.so_luong_de_xuat > 1 && Number(soLuongThucXuat) !== d.so_luong_de_xuat;
  function duyetPayload(): { hanh_dong: "duyet"; so_luong_thuc_xuat?: number; ghi_chu_so_luong?: string } {
    return soLuongThucXuatDaDoi ? { hanh_dong: "duyet", so_luong_thuc_xuat: Number(soLuongThucXuat), ghi_chu_so_luong: lyDoSoLuong.trim() } : { hanh_dong: "duyet" };
  }
  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "Drawer + Next/Previous"): chi so cua dong dang
  // xem trong navRows (trang hien tai o danh sach cha) - undefined navRows (chua truyen) = an het nut
  // dieu huong, KHONG throw loi (xem DrawerNavButtons duoc render co dieu kien ben duoi). DUA LEN DAY
  // (truoc la o cuoi ham, sau `footer`) - concept 1 "Duyet va tiep theo" (2026-08-24) can navNextId
  // TRUOC KHI tinh `footer` de doi nhan nut "Duyệt" -> "Duyệt và tiếp theo →" khi con dong ke tiep.
  const navIndex = navRows?.findIndex((r) => r.id === id) ?? -1;
  const navPrevId = navRows && navIndex > 0 ? navRows[navIndex - 1]?.id : undefined;
  const navNextId = navRows && navIndex >= 0 && navIndex < navRows.length - 1 ? navRows[navIndex + 1]?.id : undefined;
  // Ly do co quan_ly_don_thieu_linh_kien=1 -> chon o nut "Chờ hàng"; con lai -> nut "Từ chối" (phan
  // hoi 2026-08-19: tach ro 2 nut de TN biet truoc ket qua thay vi chon ly do "mu" trong 1 dropdown
  // chung roi moi biet la tu choi hay cho hang - xem actionsFor.choHang o helpers.ts).
  const choHangReasons = (lyDoData?.rows ?? []).filter((l) => l.quan_ly_don_thieu_linh_kien);
  const tuChoiReasons = (lyDoData?.rows ?? []).filter((l) => !l.quan_ly_don_thieu_linh_kien);
  const tone = d ? LOAI_DON_TONE[d.loai_don] : null;
  const ktvDisplayMap = useKtvDisplayMap();

  // CHOT 2026-08-16 (dot 3 gop y #6, dao nguoc quy tac "6 truong phu bat bien" cua migration 0070):
  // nguoi tao sua duoc TOAN BO thong tin dong CHI khi dong con dang mo (chua qua TN xu ly xong) - khop
  // dung DON_HANG_DANG_MO da dinh nghia o tren cho hanh dong duyet/tu choi.
  const isCreatorEditWindow = !!d && currentEmail === d.nguoi_tao && DON_HANG_DANG_MO.includes(d.trang_thai ?? "");
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #9): gop 2 che do sua CHONG CHEO truoc day (nguoi
  // tao sua toan bo qua isEditMode rieng, TN ho tro sua 4 truong phu qua tnEditOpen/tnDraft rieng)
  // thanh 1 nut "Sua" + 1 form DUY NHAT - field nao nguoi bam khong co quyen thi disabled ngay trong
  // form, khong con 2 khoi UI tach roi cho cung 1 dong.
  // MOI (2026-09-21, phan hoi "cho phep TN sua thong tin don ngay ca khi da len PXK"): TN sua duoc
  // TOAN BO thong tin don (khong chi 4 truong phu nhu truoc) mien PXK (neu co) con dung buoc "Dang tao
  // phieu" (= ke toan chua duyet xong chuyen tien) HOAC don chua len PXK nao - khop dung gate backend
  // moi cua PATCH /don-hang/:id (xem comment tnEditWindow o do). canEditTn cu (khong gioi han trang
  // thai) da bo - gop chung vao canEditFull, dung luon cho dieu kien hien nut "Sua".
  const tnEditWindow = canTacNghiep && (!pxk || pxk.trang_thai === "Dang tao phieu");
  const canEditFull = isCreatorEditWindow || tnEditWindow;
  // MOI (2026-09-22, phan hoi "'Loại đề xuất · Số lượng' không cho sửa khi đã lên phiếu xuất kho, vì
  // nó liên quan đến các đơn khác chung trong phiếu"): rieng 2 truong nay khoa THEM 1 lop nua ngay ca
  // trong canEditFull khi don DA thuoc 1 PXK (pxk != null) - cac truong con lai (ma LK, ghi chu, chinh
  // sach...) VAN sua binh thuong theo canEditFull, chi rieng Loai de xuat/SL de xuat la khoa.
  const canEditLoaiSoLuong = canEditFull && !pxk;
  const [isEditMode, setIsEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<DonHangDraft | null>(null);
  // 4 truong loi rieng cua TN (SL thuc xuat/Gia chot/Ma xuat kho/Ma MISA) - state RIENG, KHONG gop vao
  // DonHangDraft (type do dung chung voi useTaoDonForm.ts/TaoDonTab, khong nen mang field TN-only vao
  // form tao don). null = khong hien khoi UI nay (ngoai tnEditWindow).
  const [tnCoreDraft, setTnCoreDraft] = useState<{ so_luong_thuc_xuat: string; gia_chot: string; ma_xuat_kho: string; ma_misa: string; ghi_chu_so_luong: string } | null>(null);
  // CHOT (ra soat module #18): luu lai BAN GOC luc bat dau sua de "Huy sua" chi hoi xac nhan khi
  // draft THUC SU khac ban goc - truoc day xoa draft ngay khong canh bao, du da sua nhieu truong.
  const [editDraftSnapshot, setEditDraftSnapshot] = useState<DonHangDraft | null>(null);
  const [confirmCancelPending, setConfirmCancelPending] = useState(false);
  // "khac..." mo Select day du cho Loai de xuat trong form sua - chi 1 dong nen dung 1 boolean thay
  // vi Set<number> nhu TaoDonTab.
  const [otherLdeOpen, setOtherLdeOpen] = useState(false);
  // SUA (phan hoi 2026-09-28: "chi tiết khi xem đơn hàng thiếu tên linh kiện, thiếu chức năng click vào
  // mã linh kiện để xem chi tiết linh kiện") - truoc chi nap danh muc o che do SUA; gio nap ca khi XEM
  // de tra ten LK (du phong khi ten_lk_snapshot rong) + mo LinhKienDetailModal. Rẻ: IndexedDB + ?since=.
  const { danhMuc, ldeEntries } = useLkAndLdeCache(true);
  const { data: comboData } = useLkCombo();
  const rankMap = useLinhKienRankMap();
  const [xemLkChiTiet, setXemLkChiTiet] = useState(false);
  const auth = useAuth();
  const authUser = auth.status === "authenticated" ? auth.user : null;
  const loaiDeXuatOptions = getOptionsForUser(auth.status === "authenticated" ? auth.user : null, ldeEntries);

  function startEdit() {
    if (!d) return;
    const snap: DonHangDraft = {
      ma_lk: d.ma_lk,
      loai_de_xuat: d.loai_de_xuat ?? "",
      so_luong_de_xuat: d.so_luong_de_xuat,
      ghi_chu: d.ghi_chu ?? "",
      yeu_cau_hoa_don: d.yeu_cau_hoa_don ?? YEU_CAU_HOA_DON_OPTIONS[0],
      tt_mail_duyet: d.tt_mail_duyet ?? "",
      tt_khach_hang: d.tt_khach_hang ?? "",
      chinh_sach: d.chinh_sach ?? "",
      ma_yeu_cau_su_co: d.ma_yeu_cau_su_co ?? "",
      ma_lada: d.ma_lada ?? "",
      uu_tien: d.uu_tien === 1,
      // "anh" khong dung o luong sua nay (chi don loai_don='tra_hang' moi co anh, va dong tra_hang
      // KHONG bao gio vao duoc isCreatorEditWindow - xem giai thich o comment dat_don_hang_log/
      // isCreatorEditWindow ben tren) - de rong cho khop type DonHangDraft.
      anh: [],
    };
    setEditDraft(snap);
    setEditDraftSnapshot(snap);
    // Khoi 4 truong loi TN (them 2026-09-21) - chi khoi tao khi tnEditWindow, gia tri dau tu chinh
    // dong dang xem (fallback SL de xuat cho SL thuc xuat, khop pattern QuickStat/duyetPayload da co).
    setTnCoreDraft(
      tnEditWindow
        ? {
            so_luong_thuc_xuat: String(d.so_luong_thuc_xuat ?? d.so_luong_de_xuat),
            gia_chot: d.gia_chot != null ? String(d.gia_chot) : "",
            ma_xuat_kho: d.ma_xuat_kho ?? "",
            ma_misa: d.ma_misa ?? "",
            ghi_chu_so_luong: "",
          }
        : null,
    );
    setConfirmCancelPending(false);
    setOtherLdeOpen(false);
    setIsEditMode(true);
  }
  function isEditDraftDirty(): boolean {
    return !!editDraft && !!editDraftSnapshot && JSON.stringify(editDraft) !== JSON.stringify(editDraftSnapshot);
  }
  function cancelEdit() {
    if (isEditDraftDirty() && !confirmCancelPending) {
      setConfirmCancelPending(true);
      return;
    }
    setIsEditMode(false);
    setEditDraft(null);
    setEditDraftSnapshot(null);
    setTnCoreDraft(null);
    setConfirmCancelPending(false);
  }
  function updateEditDraft(patch: Partial<DonHangDraft>) {
    setEditDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setConfirmCancelPending(false);
  }
  function updateTnCoreDraft(patch: Partial<NonNullable<typeof tnCoreDraft>>) {
    setTnCoreDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setConfirmCancelPending(false);
  }

  const editMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<{ ok: boolean; chuyen_luong?: "tra_hang" | "dat_hang" }>(`/dat-mua-lk/don-hang/${id}`, body),
    onSuccess: (res) => {
      setIsEditMode(false);
      setEditDraft(null);
      setEditDraftSnapshot(null);
      setTnCoreDraft(null);
      invalidate();
      // Doi loai de xuat Mua <-> TRA HANG = doi luong quy trinh (backend dat lai trang thai dau cua luong moi) -
      // don roi khoi danh sach dang xem nen dong chi tiet.
      if (res?.chuyen_luong) {
        qc.invalidateQueries({ queryKey: ["tra-hang"] });
        qc.invalidateQueries({ queryKey: ["tra-hang-detail", id] });
        addToast(
          res.chuyen_luong === "tra_hang"
            ? t("Đã chuyển đơn sang luồng Trả hàng — chờ Kế toán duyệt mềm")
            : t("Đã chuyển đơn về luồng Đơn hàng — chờ TN duyệt"),
        );
        onClose();
      } else {
        addToast(t("Đã lưu thay đổi đơn hàng"));
      }
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  function saveEdit() {
    if (!editDraft) return;
    const body: Record<string, unknown> = {
      ma_lk: editDraft.ma_lk,
      loai_de_xuat: editDraft.loai_de_xuat.trim(),
      so_luong_de_xuat: editDraft.so_luong_de_xuat,
      ghi_chu: editDraft.ghi_chu.trim() || undefined,
      yeu_cau_hoa_don: editDraft.yeu_cau_hoa_don.trim() || undefined,
      tt_mail_duyet: editDraft.tt_mail_duyet.trim() || undefined,
      tt_khach_hang: editDraft.tt_khach_hang.trim() || undefined,
      chinh_sach: editDraft.chinh_sach.trim() || undefined,
      ma_yeu_cau_su_co: editDraft.ma_yeu_cau_su_co.trim() || undefined,
      ma_lada: editDraft.ma_lada.trim().toUpperCase(), // gui ca chuoi rong = xoa ma
      uu_tien: editDraft.uu_tien,
    };
    if (tnCoreDraft) {
      const slThucXuat = Number(tnCoreDraft.so_luong_thuc_xuat);
      const slGoc = d?.so_luong_thuc_xuat ?? d?.so_luong_de_xuat;
      // Chi gui khi THAT SU doi (khop backend - xem FIX MISSING_GHI_CHU_SO_LUONG o PATCH /don-hang/:id).
      if (slThucXuat !== slGoc) body.so_luong_thuc_xuat = slThucXuat;
      body.gia_chot = tnCoreDraft.gia_chot.trim() === "" ? undefined : Number(tnCoreDraft.gia_chot);
      body.ma_misa = tnCoreDraft.ma_misa.trim() || undefined;
      // Ma xuat kho: chi gui khi don CHUA co PXK (khop gate backend - da co PXK thi BE im lang bo qua
      // gia tri gui len, xem comment tnEditWindow o PATCH /don-hang/:id).
      if (!pxk) body.ma_xuat_kho = tnCoreDraft.ma_xuat_kho.trim() || undefined;
      if (slThucXuat !== slGoc) body.ghi_chu_so_luong = tnCoreDraft.ghi_chu_so_luong.trim() || undefined;
    }
    editMutation.mutate(body);
  }

  const tnSlThucXuatDaDoi = !!tnCoreDraft && Number(tnCoreDraft.so_luong_thuc_xuat) !== (d?.so_luong_thuc_xuat ?? d?.so_luong_de_xuat);
  const editCanSave =
    !!editDraft &&
    editDraft.ma_lk.trim() !== "" &&
    editDraft.loai_de_xuat.trim() !== "" &&
    editDraft.so_luong_de_xuat > 0 &&
    (!canNoRequired(editDraft.loai_de_xuat) || editDraft.chinh_sach.trim() !== "") &&
    (!maYcscRequired(editDraft.loai_de_xuat) || coMaIdLienQuan(editDraft.ma_yeu_cau_su_co, editDraft.ma_lada)) &&
    (!tnSlThucXuatDaDoi || !!tnCoreDraft?.ghi_chu_so_luong.trim()) &&
    // LK cam ban + MUA HÀNG / MUA HÀNG CÓ ID - chi chan khi DOI ma LK hoac loai (khop backend PATCH, khong chan sua don cu).
    !((editDraft.ma_lk !== d?.ma_lk || editDraft.loai_de_xuat !== (d?.loai_de_xuat ?? "")) &&
      lkCamBanVoiLoai(danhMuc.find((m) => m.ma_linh_kien === editDraft.ma_lk), editDraft.loai_de_xuat));

  const footer =
    !isLoading && d ? (
      isEditMode ? (
        <div className="flex items-center justify-end gap-2">
          {confirmCancelPending && <span className="text-[11px] text-[var(--coral-600)] font-medium">{t("Bấm lần nữa để huỷ thay đổi")}</span>}
          <Btn variant={confirmCancelPending ? "danger" : "ghost"} size="sm" onClick={cancelEdit} disabled={editMutation.isPending}>
            {confirmCancelPending ? t("Xác nhận huỷ") : t("Huỷ sửa")}
          </Btn>
          <Btn size="sm" onClick={saveEdit} disabled={!editCanSave || editMutation.isPending}>{t("Lưu thay đổi")}</Btn>
        </div>
      ) : actionTarget === "tu_choi" && (d.trang_thai === "Cho TBP xac nhan" || d.trang_thai === "Cho Tram duyet" || d.trang_thai === "TN da duyet") ? (
        // Panel tu choi inline (concept 1, pattern ".inline-panel"/".field": nen xam nhat, vien dut
        // net, label chu hoa nho phia tren input) - thay khoi flex ngang tu viet tay truoc day.
        // FIX (phan hoi 2026-08-25, hang muc #19): ghi chu tu "tuy chon" thanh "bat buoc" (dao nguoc
        // quyet dinh cu), va gop them "Cho Tram duyet" vao day (truoc do Tram tu choi ban ban khong
        // qua panel nao ca - bam la huy ngay, khong con hop le sau khi backend bat buoc ghi_chu).
        <div className="w-full space-y-2 bg-[var(--surface-100)] border border-dashed border-[var(--line)] rounded-lg p-2.5">
          <div className="font-semibold text-xs">{t("Từ chối dòng {a}", { a: d.id })}</div>
          {d.trang_thai === "TN da duyet" && d.ma_xuat_kho && (
            <div className="text-[11px] text-[var(--ink-500)]">
              {t("Đơn sẽ được gỡ khỏi phiếu xuất kho {ma};", { ma: d.ma_xuat_kho })} {giuPhieuTrong && canTacNghiep ? t("nếu phiếu không còn đơn nào, đóng màn phiếu sẽ tự hủy phiếu.") : t("nếu là đơn duy nhất của phiếu thì phiếu cũng bị hủy.")}
            </div>
          )}
          <div>
            <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">{t("Lý do từ chối (bắt buộc)")}</label>
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder={t("Lý do từ chối (bắt buộc)")}
              className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setGhiChu(""); }}>{t("Hủy")}</Btn>
            <Btn size="sm" variant="danger" onClick={confirmTuChoi} disabled={!ghiChu.trim() || logMutation.isPending}>{t("Xác nhận từ chối")}</Btn>
          </div>
        </div>
      ) : actionTarget === "tu_choi" ? (
        <div className="w-full space-y-2 bg-[var(--surface-100)] border border-dashed border-[var(--line)] rounded-lg p-2.5">
          <div className="font-semibold text-xs">{t("Từ chối dòng {a} — chọn lý do chậm", { a: d.id })}</div>
          {d.trang_thai === "TN da duyet" && d.ma_xuat_kho && (
            <div className="text-[11px] text-[var(--ink-500)]">
              {t("Đơn sẽ được gỡ khỏi phiếu xuất kho {ma};", { ma: d.ma_xuat_kho })} {giuPhieuTrong && canTacNghiep ? t("nếu phiếu không còn đơn nào, đóng màn phiếu sẽ tự hủy phiếu.") : t("nếu là đơn duy nhất của phiếu thì phiếu cũng bị hủy.")}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">{t("Lý do chậm (bắt buộc)")}</label>
              <Select
                value={lyDoChamId}
                onChange={setLyDoChamId}
                options={[{ value: "", label: t("-- Chọn lý do --") }, ...tuChoiReasons.map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">{t("Ghi chú thêm (tuỳ chọn)")}</label>
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder={t("Ghi chú thêm (tuỳ chọn)")}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setLyDoChamId(""); }}>{t("Hủy")}</Btn>
            <Btn size="sm" variant="danger" onClick={confirmTuChoi} disabled={!lyDoChamId || logMutation.isPending}>{t("Xác nhận từ chối")}</Btn>
          </div>
        </div>
      ) : actionTarget === "cho_hang" ? (
        <div className="w-full space-y-2 bg-[var(--surface-100)] border border-dashed border-[var(--line)] rounded-lg p-2.5">
          <div className="font-semibold text-xs">{t("Chuyển dòng {a} sang chờ hàng — chọn lý do", { a: d.id })}</div>
          {d.trang_thai === "TN da duyet" && d.ma_xuat_kho && (
            <div className="text-[11px] text-[var(--ink-500)]">
              {t("Đơn sẽ được gỡ khỏi phiếu xuất kho {ma};", { ma: d.ma_xuat_kho })} {giuPhieuTrong && canTacNghiep ? t("nếu phiếu không còn đơn nào, đóng màn phiếu sẽ tự hủy phiếu.") : t("nếu là đơn duy nhất của phiếu thì phiếu cũng bị hủy.")}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">{t("Lý do (bắt buộc)")}</label>
              <Select
                value={lyDoChamId}
                onChange={setLyDoChamId}
                options={[{ value: "", label: t("-- Chọn lý do --") }, ...choHangReasons.map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">{t("Ghi chú thêm (tuỳ chọn)")}</label>
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder={t("Ghi chú thêm (tuỳ chọn)")}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setLyDoChamId(""); }}>{t("Hủy")}</Btn>
            <Btn size="sm" onClick={confirmTuChoi} disabled={!lyDoChamId || logMutation.isPending}>{t("Xác nhận chờ hàng")}</Btn>
          </div>
        </div>
      ) : actionTarget === "duyet_qua_han" ? (
        // Hang muc #17/#18 (2026-08-25): panel giong tu_choi/cho_hang o tren nhung khong tach nhom ly
        // do (dung ca danh sach lyDoData) - day chi la giai trinh ly do cham xu ly, khong phai
        // tu choi/mo ticket thieu hang.
        <div className="w-full space-y-2 bg-[var(--surface-100)] border border-dashed border-[var(--coral-500)] rounded-lg p-2.5">
          <div className="font-semibold text-xs text-[var(--coral-600)]">{t("Đơn đã quá hạn 24h — chọn lý do trước khi duyệt dòng {a}", { a: d.id })}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">{t("Lý do chậm (bắt buộc)")}</label>
              <Select
                value={lyDoChamId}
                onChange={setLyDoChamId}
                options={[{ value: "", label: t("-- Chọn lý do --") }, ...(lyDoData?.rows ?? []).map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">{t("Ghi chú thêm (tuỳ chọn)")}</label>
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder={t("Ghi chú thêm (tuỳ chọn)")}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
          {soLuongThucXuatDaDoi && (
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">
                {t("Lý do đổi SL thực xuất ({a} → {b}) — bắt buộc", { a: d.so_luong_de_xuat, b: soLuongThucXuat })}
              </label>
              <input
                value={lyDoSoLuong}
                onChange={(e) => setLyDoSoLuong(e.target.value)}
                placeholder={t("Lý do đổi số lượng thực xuất (bắt buộc)")}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setLyDoChamId(""); }}>{t("Hủy")}</Btn>
            <Btn size="sm" onClick={confirmDuyetQuaHan} disabled={!lyDoChamId || logMutation.isPending || (soLuongThucXuatDaDoi && !lyDoSoLuong.trim())}>{t("Xác nhận duyệt")}</Btn>
          </div>
        </div>
      ) : actionTarget === "huy" ? (
        <div className="w-full space-y-2 bg-[var(--surface-100)] border border-dashed border-[var(--line)] rounded-lg p-2.5">
          <div className="font-semibold text-xs">{t("Hủy dòng {a} — nhập lý do hủy", { a: d.id })}</div>
          {d.trang_thai === "TN da duyet" && d.ma_xuat_kho && (
            <div className="text-[11px] text-[var(--ink-500)]">
              {t("Đơn sẽ được gỡ khỏi phiếu xuất kho {ma};", { ma: d.ma_xuat_kho })} {giuPhieuTrong && canTacNghiep ? t("nếu phiếu không còn đơn nào, đóng màn phiếu sẽ tự hủy phiếu.") : t("nếu là đơn duy nhất của phiếu thì phiếu cũng bị hủy.")}
            </div>
          )}
          <div>
            <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">{t("Lý do hủy (bắt buộc)")}</label>
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder={t("Lý do hủy (bắt buộc)")}
              className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setGhiChu(""); }}>{t("Đóng")}</Btn>
            <Btn size="sm" variant="danger" onClick={confirmHuy} disabled={!ghiChu.trim() || logMutation.isPending}>{t("Xác nhận hủy")}</Btn>
          </div>
        </div>
      ) : actionTarget === "day_lai" ? (
        <div className="w-full space-y-2 bg-[var(--surface-100)] border border-dashed border-[var(--line)] rounded-lg p-2.5">
          <div className="font-semibold text-xs">{t("Đẩy lại dòng {a} về Chờ TN duyệt", { a: d.id })}</div>
          <div className="text-[11px] text-[var(--ink-500)]">
            {t("Đơn quay lại hàng chờ duyệt của Tác nghiệp để xử lý lại (duyệt / từ chối / chờ hàng). Ticket thiếu hàng đã đóng không mở lại; đơn cần chuyển tiền trước sẽ được gom lại vào phiếu đang tạo của người nhận.")}
          </div>
          <div>
            <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">{t("Ghi chú (tuỳ chọn)")}</label>
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder={t("Lý do đẩy lại (tuỳ chọn)")}
              className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setGhiChu(""); }}>{t("Đóng")}</Btn>
            <Btn size="sm" onClick={() => dayLaiMutation.mutate()} loading={dayLaiMutation.isPending} disabled={dayLaiMutation.isPending}>{t("Xác nhận đẩy lại")}</Btn>
          </div>
        </div>
      ) : actions.duyet || actions.tuChoi || actions.choHang || actions.huy ? (
        <div className="w-full space-y-2">
          {laChoHangMoKhoa(d) && (
            <div className="text-[11.5px] text-[var(--color-text-secondary)]">
              {t("Kho chưa tiếp nhận ticket thiếu hàng{a} — thao tác trên đơn sẽ tự hủy ticket đang chờ.", { a: thieuLk?.id ? ` ${thieuLk.id}` : "" })}
            </div>
          )}
          {/* FIX (phan hoi 2026-09-24): them dieu kien actions.duyet - neu khong, dong "TN da duyet"
              (chi con actions.tuChoi, ma_xuat_kho con NULL) co the hien nham o day khi so_luong_thuc_xuat
              da duyet truoc do khac so_luong_de_xuat, dù hanh dong duy nhat kha dung la Tu choi. */}
          {soLuongThucXuatDaDoi && actions.duyet && (
            <div className="bg-[var(--surface-100)] border border-dashed border-[var(--orange-500)] rounded-lg p-2.5">
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">
                {t("Lý do đổi SL thực xuất ({a} → {b}) — bắt buộc", { a: d.so_luong_de_xuat, b: soLuongThucXuat })}
              </label>
              <input
                value={lyDoSoLuong}
                onChange={(e) => setLyDoSoLuong(e.target.value)}
                placeholder={t("Lý do đổi số lượng thực xuất (bắt buộc)")}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap justify-end">
          {actions.duyet && (
            <Btn
              size="sm"
              onClick={() =>
                isCongNoTaoHo(d)
                  ? setConfirmDuyetTaoHo(true)
                  : d.qua_han_ly_do_cham
                    ? setActionTarget("duyet_qua_han")
                    : logMutation.mutate(duyetPayload())
              }
              disabled={logMutation.isPending || (soLuongThucXuatDaDoi && !lyDoSoLuong.trim())}
              loading={logMutation.isPending}
            >
              {navNextId && onNavigate ? t("Duyệt và tiếp theo →") : t("Duyệt")}
            </Btn>
          )}
          {actions.choHang && (
            <Btn size="sm" variant="ghost" onClick={() => setActionTarget("cho_hang")} disabled={logMutation.isPending}>
              {t("Chờ hàng||nút")}
            </Btn>
          )}
          {actions.tuChoi && (
            <Btn
              size="sm"
              variant="danger"
              onClick={() => setActionTarget("tu_choi")}
              disabled={logMutation.isPending}
            >
              {t("Từ chối||nút")}
            </Btn>
          )}
          {actions.huy && <Btn size="sm" variant="ghost" onClick={() => setActionTarget("huy")} disabled={logMutation.isPending}>{t("Hủy")}</Btn>}
          </div>
        </div>
      ) : dayLaiDuoc(d, canTacNghiep) ? (
        <div className="w-full flex items-center justify-end gap-2 flex-wrap">
          <span className="text-[11.5px] text-[var(--color-text-secondary)]">{t("Đẩy lại được đến {a}", { a: fmtDateTime(d.day_lai_han) })}</span>
          <Btn size="sm" variant="ghost" onClick={() => setActionTarget("day_lai")}>{t("↩ Đẩy lại chờ duyệt")}</Btn>
        </div>
      ) : laChoHangBiKhoa(d) ? (
        <div className="w-full rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--color-warning-strong)]">
          {t("🔒 Kho đã tiếp nhận ticket thiếu hàng{a} và đang xử lý — chờ Kho xác nhận hàng về hoặc từ chối, đơn sẽ tự về “Chờ TN duyệt” để thao tác tiếp.", { a: thieuLk?.id ? ` ${thieuLk.id}` : "" })}
        </div>
      ) : null
    ) : null;

  // Phase 4 (phim tat): ←/→ dieu huong dong truoc/sau giong het DrawerNavButtons, chi kich hoat khi
  // co navRows/onNavigate (giu dong bo dieu kien an/hien voi nut bam o headerExtra ben duoi).
  useDrawerArrowNav({
    hasPrev: !!(onNavigate && navRows && navPrevId),
    hasNext: !!(onNavigate && navRows && navNextId),
    onPrev: () => navPrevId && onNavigate?.(navPrevId),
    onNext: () => navNextId && onNavigate?.(navNextId),
  });

  return (
    <>
    <Drawer
      open
      // SUA (phan hoi ra soat UI/UX 2026-08-28, van de #1: "tên linh kiện tạo thành tiêu đề trên
      // cùng") - truoc day la ID tho (`Đơn hàng ${id}`), nguoi xem phai cuon vao than Drawer moi biet
      // dang xem linh kien gi. Fallback ve ID trong luc dang tai (d chua co).
      title={
        <span className="flex items-center gap-2.5">
          <IconChip icon={<img src="/icon-192.png" alt="" width={22} height={22} className="rounded" />} size="md" />
          {d ? (d.ten_lk_snapshot ?? d.ma_lk) : t("Đơn hàng {a}", { a: id })}
        </span>
      }
      onClose={onClose}
      width={DRAWER_WIDTH_CHI_TIET}
      footer={footer}
      // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #18): nut Sua dat canh nut dong ✕ (headerExtra),
      // tach khoi hang badge trang thai ben trong noi dung - truoc day 2 cum "xem" va "sua" cung 1
      // hang ngang, khong phan biet ro "khu vuc thong tin" va "khu vuc dieu khien modal".
      headerExtra={
        <>
          {onNavigate && navRows && (
            <DrawerNavButtons
              hasPrev={!!navPrevId}
              hasNext={!!navNextId}
              onPrev={() => navPrevId && onNavigate(navPrevId)}
              onNext={() => navNextId && onNavigate(navNextId)}
            />
          )}
          {canEditFull && !isEditMode ? (
            <Btn size="sm" variant="ghost" onClick={startEdit}>{t("✎ Sửa")}</Btn>
          ) : undefined}
        </>
      }
    >
      {isLoading ? (
        <div className="text-sm text-[var(--ink-500)] py-4 text-center">{t("Đang tải...")}</div>
      ) : !d ? null : (
        <div className="space-y-4 text-sm">
          {/* SUA (ra soat UI/UX 2026-08-28, van de #2/#3/#4/#11: "chia thành các vùng dữ liệu" + tien
              gom 1 cho + badge trang thai qua tai): thay khoi KvRow phang truoc day bang 1 dai "chỉ số
              nhanh" ngay duoi tieu de (SL/gia/trang thai noi bat NGAY, khong phai cuon vao than moi
              thay) roi den cac DetailZone co ranh gioi ro rang (xem SharedUi.tsx). Ap dung CHUNG cau
              truc nay cho ca TraHangDetailModal (phan hoi "sửa chung cho 1 màn rồi áp dụng ra"). */}
          <div className="flex items-start gap-4 flex-wrap pb-3 border-b border-[var(--line)]">
            <QuickStat label={t("SL đề xuất")} value={d.so_luong_de_xuat} />
            {/* Muc #4 (phan hoi QA 2026-08-31): TN sua SL thuc xuat NGAY LUC DUYET (khong phai qua PATCH
                tuy y truoc do) - chi hien khi con "Cho TN duyet" (dang o buoc duyet) VA SL de xuat > 1
                (dung dieu kien nguoi dung neu). Doi gia tri thi bat buoc nhap ly do (xem
                soLuongThucXuatDaDoi/disabled cua nut Duyet ben duoi). */}
            {canTacNghiep && (d.trang_thai === "Cho TN duyet" || laChoHangMoKhoa(d)) && d.so_luong_de_xuat > 1 ? (
              <QuickStat
                label={t("SL thực xuất")}
                value={
                  <input
                    type="number"
                    min={0}
                    value={soLuongThucXuat}
                    onChange={(e) => setSoLuongThucXuat(e.target.value)}
                    className="focus-ring w-20 bg-white border border-[var(--line)] rounded-lg px-1.5 py-0.5 text-sm font-bold"
                  />
                }
                tone={soLuongThucXuatDaDoi ? undefined : "green"}
              />
            ) : (
              d.trang_thai !== "Cho TN duyet" && !(canTacNghiep && laChoHangMoKhoa(d)) && (
                // FIX (phan hoi 2026-09-21: "các thông tin đơn hàng đang thiếu sl thực xuất") - o tren
                // chi hien Ô NHẬP luc dang o buoc "Cho TN duyet" - sau khi qua buoc do (don da duoc
                // duyet) thi khong con hien SL thuc xuat o dau ca, kieu ca khi TN GIU NGUYEN so voi de
                // xuat (so_luong_thuc_xuat = null trong TH do, xem duyetPayload() o tren - BE chi luu
                // gia tri khi TN THAT SU doi). Hien CHI-DOC, fallback ve SL de xuat khi null (dung y
                // het cach khoi tao o nhap o dong 129 "?? d.so_luong_de_xuat") vi null = "giu nguyen
                // SL de xuat", khong phai "chua co du lieu". QuickStat chi co 2 tone (green/default) -
                // "green" khi giu nguyen (khop SL de xuat canh no), de trong (default) khi THAT SU
                // khac de nguoi xem chu y da co dieu chinh.
                <QuickStat
                  label={t("SL thực xuất")}
                  value={d.so_luong_thuc_xuat ?? d.so_luong_de_xuat}
                  tone={d.so_luong_thuc_xuat != null && d.so_luong_thuc_xuat !== d.so_luong_de_xuat ? undefined : "green"}
                />
              )
            )}
            {/* Giá niêm yết (giá bán) + Giá đề xuất = SAU chiet khau (2026-09-28, xem donGiaSauChietKhau). */}
            <QuickStat label={t("Giá niêm yết")} value={giaNiemYet(d) != null ? <Money>{fmtVND(giaNiemYet(d))}</Money> : "—"} />
            <QuickStat label={t("Giá đề xuất")} value={donGiaSauChietKhau(d) != null ? <Money>{fmtVND(donGiaSauChietKhau(d))}</Money> : "—"} tone="green" />
            <QuickStat label={t("Tổng tiền đề xuất")} value={<Money>{fmtVND(tienSauChietKhau(d))}</Money>} tone="green" />
            {d.gia_chot != null && <QuickStat label={t("Giá chốt")} value={<Money>{fmtVND(d.gia_chot)}</Money>} tone="green" />}
            {/* "Cong no tam tinh" + danh gia (them 04/09/2026) - chi co y nghia voi dong loai_don=
                'cong_no', chot 1 LAN luc tao don (xem lib/congNoKtv.ts o backend, khong tinh lai). */}
            {d.loai_don === "cong_no" && d.so_tien_cong_no != null && (
              <QuickStat label={t("Công nợ tạm tính")} value={<Money>{fmtVND(d.so_tien_cong_no)}</Money>} />
            )}
            {/* SUA (ra soat "giao diện demo không hề giống" 2026-09-09): bo caption "Trạng thái" - doi
                chieu truc tiep voi anh demo (crop + do mau pixel) xac nhan cum badge noi day KHONG co
                nhan chu thich rieng, chi noi (self-center) giua chieu cao dai QuickStat ben canh. */}
            <div className="flex-1 min-w-[160px] self-center">
              <div className="flex items-center gap-1.5 flex-wrap">
                {tone && d && <LoaiDeXuatBadge loaiDon={d.loai_don} loaiDeXuat={d.loai_de_xuat} />}
                <StatusBadge value={d.trang_thai ?? ""} tones={DON_HANG_TRANG_THAI_TONE_ALL} options={DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL} />
                {d.loai_don === "tra_hang" && (
                  <span className="text-[var(--ink-400)] text-xs">{t("(xử lý ở luồng quy trình phía trên)")}</span>
                )}
                {/* DOI MAU (2026-08-27, "5 nhóm màu trạng thái"): "Quá hạn" la 1 khai niem RIENG voi
                    "tu choi" (violet)/"da huy" (coral) - doi sang tone "orange" (cam, gia tri khong
                    doi) de khong bi trung mau voi 2 khai niem do sau khi gan lai tone theo constants.ts. */}
                {d.qua_han_ly_do_cham && <Badge tone="danger">{t("Quá hạn - cần lý do chậm")}</Badge>}
                {/* SUA (phan hoi 2026-08-19): amber trung mau voi loai_don "Cong no" gay nham lan "vien
                    vang" - doi ca Badge nay lan ring/bg cua dong bang sang cam THAT (token --orange-*
                    rieng, khac amber), dong bo voi TaoDonTab. */}
                {d.uu_tien === 1 && <Badge tone="warning">{t("⭐ Ưu tiên")}</Badge>}
                {/* "Đơn tạo hộ" (yeu cau nguoi dung 2026-08-27) - nguoi tao khac nguoi nhan hang, ap
                    dung cho MOI loai_don (khong rieng cong_no, xem isDonTaoHo o helpers.ts). Tone
                    "neutral" (trung tinh) - day la nhan METADATA, khong phai 1 trong 6 tone ngu nghia
                    (info/success/warning/danger/purple/neutral) da quy uoc cho trang_thai. */}
                {isDonTaoHo(d) && <Badge tone="neutral">{t("Đơn tạo hộ")}</Badge>}
                {/* Chuyen vao day (truoc kem ben canh tieu de LK cu, gio tieu de Drawer chi con la ten
                    LK thuan - xem prop `title` cua Drawer o tren) - van la 1 trang thai dang chu y nen
                    hop ly nam canh cum badge trang thai. */}
                {!!d.dac_thu && <Badge tone="warning">{t("🔒 Đặc thù")}</Badge>}
                {/* "Đủ/Không đủ công nợ" (them 04/09/2026) - chot 1 LAN luc tao don, xem QuickStat
                    "Công nợ tạm tính" o tren + lib/congNoKtv.ts o backend. */}
                {d.loai_don === "cong_no" && !laTruCongNo(d.loai_de_xuat) && d.danh_gia_cong_no === "Du" && <Badge tone="success">{t("Đủ công nợ")}</Badge>}
                {d.loai_don === "cong_no" && !laTruCongNo(d.loai_de_xuat) && d.danh_gia_cong_no === "Khong du" && <Badge tone="danger">{t("Không đủ công nợ")}</Badge>}
              </div>
            </div>
          </div>

          <DetailZone title={t("Thông tin đơn")}>
            {/* "ID hệ thống" (phan hoi 2026-09-05, muc #6: "cần nhìn thấy ID hệ thống của đơn hàng để
                dễ tra cứu hoặc kiểm soát") - d.id la ID that cua dong dat_don_hang, dung tra cuu truc
                tiep qua wrangler d1/API khi can doi chieu voi nguoi dung. */}
            <KvRow label={t("ID hệ thống")}><span className="font-mono text-xs">{d.id}</span></KvRow>
            <KvRow label={t("Người tạo")}><NguoiTao>{formatNguoiDisplay(d.nguoi_tao, ktvDisplayMap)}</NguoiTao></KvRow>
            {/* Luon hien (phan hoi 2026-08-25, hang muc #9) - truoc chi hien khi khac nguoi tao, gay
                cam giac "thieu thong tin nguoi nhan hang" khi 2 gia tri trung nhau. */}
            <KvRow label={t("Người nhận hàng")}>{d.nguoi_nhan_hang ? <NguoiNhan>{formatNguoiDisplay(d.nguoi_nhan_hang, ktvDisplayMap)}</NguoiNhan> : "—"}</KvRow>
            <KvRow label={t("Ngày tạo")}>{fmtDateTime(d.ngay_tao)}</KvRow>
            {/* Loai chiet khau (2026-09-26) - he thong gan khi don vao PXK; TN chon lai ngay tai day
                (ca tren mobile, noi khong co cot bang). Don tra hang khong co chiet khau. */}
            {d.loai_don !== "tra_hang" && (
              <KvRow label={t("Loại chiết khấu")}>
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {canTacNghiep && pxk ? (
                    <LoaiChietKhauPicker don={d} duocDoi={duocDoiLoaiChietKhau(pxk)} />
                  ) : (
                    <LoaiChietKhauText id={d.loai_chiet_khau_id} thuCong={d.loai_chiet_khau_thu_cong} />
                  )}
                  <HoaDonGiaNiemYet don={d} />
                  {!pxk && <TienDaTraDon don={d} />}
                </span>
              </KvRow>
            )}
            {d.tra_bang_quy && (
              <KvRow label={t("Thanh toán")}>
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-[var(--color-text-secondary)]">
                    {t("Còn thiếu")} <b className="text-[var(--color-text)]">{fmtVND(d.tra_bang_quy.can_tra)}</b> · {t("Quỹ dư KTV {tien}", { tien: fmtVND(d.tra_bang_quy.quy) })}
                  </span>
                  {d.tra_bang_quy.quy >= d.tra_bang_quy.can_tra ? (
                    <Btn
                      size="sm"
                      variant="subtle"
                      loading={traBangQuyMutation.isPending}
                      disabled={traBangQuyMutation.isPending}
                      onClick={() => {
                        if (window.confirm(t("Xác nhận đơn {id} đã thanh toán bằng quỹ dư?\n\nQuỹ của KTV giảm {tien}.", { id: d.id, tien: fmtVND(d.tra_bang_quy!.can_tra) }))) {
                          traBangQuyMutation.mutate();
                        }
                      }}
                    >
                      {t("Trả bằng quỹ dư")}
                    </Btn>
                  ) : (
                    <span className="text-[12px] text-[var(--color-text-secondary)]">{t("(quỹ không đủ)")}</span>
                  )}
                </span>
              </KvRow>
            )}
            {/* Tong dat Mua + TRỪ CÔNG NỢ cua KTV trong NGAY TAO don nay - moc chiet khau (2026-09-28). */}
            {(d.loai_don === "mua" || laTruCongNo(d.loai_de_xuat)) && d.nguoi_nhan_hang && (
              <KvRow label={t("Tổng đặt trong ngày")}>
                <TongNgayKtvInfo email={d.nguoi_nhan_hang} ngays={[d.ngay_tao.slice(0, 10)]} />
              </KvRow>
            )}
          </DetailZone>

          {/* SUA (ra soat UI/UX 2026-08-28, van de #8: "Ca liên kết bị chôn cuối") - chuyen len ngay
              sau "Thông tin đơn" (truoc day nam duoi cung, sau ca Lich su xu ly, phai cuon het moi
              thay) + boc DetailZone cho dong bo voi cac khoi khac. CHOT (ra soat module #18): chip 2
              dong (ma case + ten khach hang) thay vi chi ma thuan chu - bam duoc tren MOI thiet bi. */}
          {d.cases && d.cases.length > 0 && (
            <DetailZone title={t("Ca liên kết")}>
              <div className="flex gap-1.5 flex-wrap">
                {d.cases.map((cRow) => (
                  <span
                    key={cRow.id}
                    className={`inline-flex flex-col rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 leading-tight ${canXemChiTietCa && openCase ? "cursor-pointer hover:border-[var(--ocean-400)] hover:bg-[var(--ocean-100)]/30" : ""}`}
                    onClick={canXemChiTietCa && openCase ? () => openCase(cRow.id, "giai-trinh") : undefined}
                  >
                    <span className="font-mono text-[11px] font-semibold text-[var(--ocean-600)]">{cRow.id}</span>
                    {cRow.khach_hang && <span className="text-[10px] text-[var(--ink-500)] truncate max-w-[160px]">{cRow.khach_hang}</span>}
                  </span>
                ))}
              </div>
            </DetailZone>
          )}

          {/* SUA (phan hoi QA 2026-08-31, muc #5): truoc day "co ly_do_cham" la khoa VINH VIEN (chi
              hien text, khong bao gio nhap lai duoc). Gio la LICH SU (migration 0014) - luon hien du
              cac lan da giai trinh (moi nhat truoc), VA them o nhap MOI moi khi dong dang qua han
              (qua_han_ly_do_cham=true, ke ca khi da tung giai trinh truoc do). */}
          {(d.giaiTrinh && d.giaiTrinh.length > 0) || (canTacNghiep && d.trang_thai === "Cho TN duyet" && d.qua_han_ly_do_cham) ? (
            <DetailZone title={t("Lý do chậm")}>
              <div className="flex flex-col gap-2">
                {d.giaiTrinh && d.giaiTrinh.length > 0 && (
                  <ul className="space-y-1">
                    {d.giaiTrinh.map((g) => (
                      <li key={g.id} className="text-sm">
                        <span>{g.noi_dung}</span>
                        <span className="text-[11px] text-[var(--ink-400)]"> — <NguoiTao>{formatNguoiDisplay(g.nguoi_tao, ktvDisplayMap)}</NguoiTao>, {fmtDateTime(g.ngay_tao)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {canTacNghiep && d.trang_thai === "Cho TN duyet" && d.qua_han_ly_do_cham && (
                  // CHOT (phan hoi 2026-08-24: "đổi hẳn thành dropdown bắt buộc, bỏ ô nhập tay") - Select
                  // BAT BUOC chon tu danh muc "Mua hàng" (settings_ly_do_cham), khong con o nhap tu do -
                  // neu Settings CHUA co ly do nao, TN se khong nhap duoc cho toi khi Admin bo sung
                  // (dung y da chot voi nguoi dung). Dung lai lyDoData da fetch san o tren cho luong "Từ
                  // chối" (cung queryKey/endpoint), khong goi API moi. CHI hien khi dang qua han (muc
                  // #5: khong can nhap "phong ngua" khi con moi, giu giao dien gon).
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Select
                        value={lyDoChamDraft}
                        onChange={setLyDoChamDraft}
                        options={[{ value: "", label: t("-- Chọn lý do chậm --") }, ...(lyDoData?.rows ?? []).map((l) => ({ value: l.ten_ly_do, label: l.ten_ly_do }))]}
                        disabled={(lyDoData?.rows.length ?? 0) === 0}
                        className="flex-1 min-w-[200px]"
                      />
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => lyDoChamMutation.mutate(lyDoChamDraft.trim())}
                        disabled={!lyDoChamDraft.trim() || lyDoChamMutation.isPending}
                      >
                        {t("Lưu")}
                      </Btn>
                    </div>
                    {(lyDoData?.rows.length ?? 0) === 0 && (
                      <div className="text-[11px] text-[var(--coral-600)]">{t("Chưa có lý do chậm nào được cấu hình cho \"Mua hàng\" — vào Settings › Lý do chậm để thêm.")}</div>
                    )}
                  </div>
                )}
              </div>
            </DetailZone>
          ) : null}

          {isEditMode && editDraft ? (
            <div className="space-y-3 bg-[var(--surface-100)] rounded-xl p-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Mã linh kiện")}</label>
                <LinhKienPicker value={editDraft.ma_lk} onChange={(v) => updateEditDraft({ ma_lk: v })} options={danhMuc} disabled={!canEditFull} loaiDeXuat={editDraft.loai_de_xuat} />
              </div>
              {/* Loai de xuat + So luong GOP 1 HANG (tai dung dung layout da chot o TaoDonTab 2.0 -
                  ca 2 noi cung dung DonHangDraft/updateDraft nen chi phi dong bo thap). */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Loại đề xuất · Số lượng *")}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex gap-1 flex-wrap flex-1 min-w-[160px]">
                    {(["MUA HÀNG", "MUA HÀNG CÓ ID", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const).map((kw) => {
                      const matched = pickLdeQuick(loaiDeXuatOptions, kw);
                      if (!matched) return null;
                      return (
                        <Btn key={kw} size="sm" variant={editDraft.loai_de_xuat === matched ? "primary" : "ghost"} disabled={!canEditLoaiSoLuong} onClick={() => updateEditDraft({ loai_de_xuat: matched })}>
                          {kw}
                        </Btn>
                      );
                    })}
                    <Btn size="sm" variant={otherLdeOpen ? "primary" : "ghost"} disabled={!canEditLoaiSoLuong} onClick={() => setOtherLdeOpen(true)}>
                      {t("khác…")}
                    </Btn>
                  </div>
                  <div className="flex items-center border border-[var(--line)] rounded-lg overflow-hidden shrink-0">
                    <button
                      type="button"
                      disabled={!canEditLoaiSoLuong}
                      onClick={() => updateEditDraft({ so_luong_de_xuat: Math.max(1, editDraft.so_luong_de_xuat - 1) })}
                      className="focus-ring w-7 h-8 flex items-center justify-center text-[var(--ink-600)] font-bold hover:bg-[var(--surface-100)] disabled:opacity-40"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      disabled={!canEditLoaiSoLuong}
                      value={editDraft.so_luong_de_xuat}
                      onChange={(e) => updateEditDraft({ so_luong_de_xuat: Number(e.target.value) })}
                      className="focus-ring w-11 text-center text-sm border-x border-[var(--line)] py-1.5 disabled:opacity-40"
                    />
                    <button
                      type="button"
                      disabled={!canEditLoaiSoLuong}
                      onClick={() => updateEditDraft({ so_luong_de_xuat: editDraft.so_luong_de_xuat + 1 })}
                      className="focus-ring w-7 h-8 flex items-center justify-center text-[var(--ink-600)] font-bold hover:bg-[var(--surface-100)] disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
                {otherLdeOpen && (
                  <Select
                    value={editDraft.loai_de_xuat}
                    onChange={(v) => updateEditDraft({ loai_de_xuat: v })}
                    options={[{ value: "", label: t("-- Chọn --") }, ...loaiDeXuatOptions.map((o) => ({ value: o, label: o }))]}
                    disabled={!canEditLoaiSoLuong}
                    className="w-full mt-1"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">
                    {t("Mã yêu cầu sự cố liên quan{a}", { a: maYcscRequired(editDraft.loai_de_xuat) ? " *" : "" })}
                  </label>
                  <input
                    value={editDraft.ma_yeu_cau_su_co}
                    onChange={(e) => updateEditDraft({ ma_yeu_cau_su_co: e.target.value })}
                    maxLength={20}
                    className={`focus-ring w-full bg-[var(--surface-100)] border rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-40 ${maYcscRequired(editDraft.loai_de_xuat) && !coMaIdLienQuan(editDraft.ma_yeu_cau_su_co, editDraft.ma_lada) ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">
                    {t("Mã Lada liên quan{a}", { a: maYcscRequired(editDraft.loai_de_xuat) ? " *" : "" })}
                  </label>
                  <input
                    value={editDraft.ma_lada}
                    onChange={(e) => updateEditDraft({ ma_lada: e.target.value })}
                    maxLength={20}
                    placeholder="VD: D1154680"
                    className={`focus-ring w-full bg-[var(--surface-100)] border rounded-lg px-2.5 py-1.5 text-sm font-mono uppercase disabled:opacity-40 ${maYcscRequired(editDraft.loai_de_xuat) && !coMaIdLienQuan(editDraft.ma_yeu_cau_su_co, editDraft.ma_lada) ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
                  />
                  {maYcscRequired(editDraft.loai_de_xuat) && <div className="mt-1 text-[11px] text-[var(--ink-500)]">{t("Chỉ cần 1 trong 2: Mã YCSC hoặc Mã Lada.")}</div>}
                  <MaLadaCheck value={editDraft.ma_lada} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">
                    {t("Chính sách{a}", { a: canNoRequired(editDraft.loai_de_xuat) ? " *" : "" })}
                  </label>
                  <Select
                    value={editDraft.chinh_sach}
                    onChange={(v) => updateEditDraft({ chinh_sach: v })}
                    options={[{ value: "", label: t("-- Không chọn --") }, ...CHINH_SACH_OPTIONS.map((o) => ({ value: o, label: o }))]}
                    disabled={!canEditFull}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Yêu cầu hóa đơn")}</label>
                <div className="flex gap-1 flex-wrap">
                  {YEU_CAU_HOA_DON_OPTIONS.map((o) => (
                    <Btn key={o} size="sm" variant={editDraft.yeu_cau_hoa_don === o ? "primary" : "ghost"} onClick={() => updateEditDraft({ yeu_cau_hoa_don: o })}>
                      {YEU_CAU_HOA_DON_SHORT_LABELS[o] ?? o}
                    </Btn>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("TT+Mail duyệt")}</label>
                  <input
                    value={editDraft.tt_mail_duyet}
                    onChange={(e) => updateEditDraft({ tt_mail_duyet: e.target.value })}
                    className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("TT khách hàng")}</label>
                  <input
                    value={editDraft.tt_khach_hang}
                    onChange={(e) => updateEditDraft({ tt_khach_hang: e.target.value })}
                    className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
              </div>
              {/* Mau uu tien dong bo voi .priority-tag concept 1 (var(--orange-600), khong dung amber
                  de tranh trung mau voi loai_don "Cong no"). */}
              <label className={`flex items-center gap-2 text-xs font-extrabold text-[var(--orange-600)] ${!canEditFull ? "opacity-40" : ""}`}>
                <input type="checkbox" checked={editDraft.uu_tien} disabled={!canEditFull} onChange={(e) => updateEditDraft({ uu_tien: e.target.checked })} />
                {t("⭐ Đơn ưu tiên")}
              </label>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Ghi chú (tuỳ chọn)")}</label>
                <input
                  value={editDraft.ghi_chu}
                  disabled={!canEditFull}
                  onChange={(e) => updateEditDraft({ ghi_chu: e.target.value })}
                  className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-40"
                />
              </div>
              {/* Khoi 4 truong loi TN (them 2026-09-21, phan hoi "cho phep TN sua thong tin don ngay
                  ca khi da len PXK") - chi hien khi tnEditWindow (xem khoi tao o startEdit). Mã xuất
                  kho CHỈ hiện khi đơn CHƯA có PXK (khớp gate backend - đã có PXK thật quản lý thì field
                  này chỉ đọc, xem KvRow "Mã xuất kho" ở chế độ xem). */}
              {tnCoreDraft && (
                <div className="space-y-3 pt-3 border-t border-[var(--line)]">
                  <div className="text-[11px] font-semibold text-[var(--ink-600)]">
                    {t("Thông tin TN (SL thực xuất · Giá chốt · Mã MISA")}{!pxk ? t(" · Mã xuất kho") : ""})
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("SL thực xuất")}</label>
                      <input
                        type="number"
                        min={0}
                        value={tnCoreDraft.so_luong_thuc_xuat}
                        onChange={(e) => updateTnCoreDraft({ so_luong_thuc_xuat: e.target.value })}
                        className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Giá chốt (tuỳ chọn)")}</label>
                      <input
                        type="number"
                        min={0}
                        value={tnCoreDraft.gia_chot}
                        onChange={(e) => updateTnCoreDraft({ gia_chot: e.target.value })}
                        className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  {tnSlThucXuatDaDoi && (
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Lý do đổi SL thực xuất *")}</label>
                      <input
                        value={tnCoreDraft.ghi_chu_so_luong}
                        onChange={(e) => updateTnCoreDraft({ ghi_chu_so_luong: e.target.value })}
                        className={`focus-ring w-full bg-white border rounded-lg px-2.5 py-1.5 text-sm ${!tnCoreDraft.ghi_chu_so_luong.trim() ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Mã MISA (tuỳ chọn)")}</label>
                      <input
                        value={tnCoreDraft.ma_misa}
                        onChange={(e) => updateTnCoreDraft({ ma_misa: e.target.value })}
                        className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                      />
                    </div>
                    {!pxk && (
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">{t("Mã xuất kho (tuỳ chọn)")}</label>
                        <input
                          value={tnCoreDraft.ma_xuat_kho}
                          onChange={(e) => updateTnCoreDraft({ ma_xuat_kho: e.target.value })}
                          className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* SUA (ra soat UI/UX 2026-08-28): ten LK khong con lap lai o day - da la TIEU DE Drawer
                  (prop `title` o tren, dung y van de #1). Con lai gom vao 1 DetailZone rieng cho cac
                  ma tham chieu (Mã LK/Mã YCSC/Mã xuất kho) - Giá đề xuất/Giá chốt/Tổng tiền đa chuyen
                  len dai "chỉ số nhanh" unconditional o dau (khong lap lai o day nua). */}
              <DetailZone title={t("Mã tham chiếu")}>
                <KvRow label={t("Tên linh kiện")}>
                  {d.ten_lk_snapshot ?? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk)?.ten_linh_kien ?? "—"}
                </KvRow>
                {d.combo_ma && (
                  <KvRow label="Combo">
                    🧩 {formatLkLabel(d.combo_ma, comboData?.rows.find((cb) => cb.ma_combo === d.combo_ma)?.ten_combo ?? d.combo_ma)}
                  </KvRow>
                )}
                <KvRow label={t("Mã LK")}>
                  <button
                    type="button"
                    className="code-link font-mono text-xs"
                    title={t("Xem chi tiết linh kiện")}
                    onClick={() => {
                      if (danhMuc.some((m) => m.ma_linh_kien === d.ma_lk)) setXemLkChiTiet(true);
                      else addToast(t("Không tìm thấy linh kiện này trong danh mục (có thể đã bị ẩn/xoá)"));
                    }}
                  >
                    {d.ma_lk}
                  </button>
                </KvRow>
                <KvRow label={t("Mã YCSC")}>
                  <MaYcscCell value={d.ma_yeu_cau_su_co} canXemChiTietCa={canXemChiTietCa} openCase={openCase} />
                </KvRow>
                {d.ma_lada && <KvRow label={t("Mã Lada")}><span className="font-mono">{d.ma_lada}</span></KvRow>}
                <KvRow label={t("Mã xuất kho")}>{d.ma_xuat_kho ?? "—"}</KvRow>
              </DetailZone>

              {/* Moi thong tin nguoi dung nhap luc tao don (2026-10-02, phan hoi "chi tiết đơn hàng cần hiện đầy đủ tất cả
                  các thông tin khi người dùng tạo đơn") - truoc day TT khách hàng/TT mail duyệt/Yêu cầu hóa đơn/Chính sách
                  chi thay o form Sua, ghi chu hien 1 dong khong nhan. Truong trong van hien "—" de biet la chua nhap. */}
              <DetailZone title={t("Thông tin đặt hàng")}>
                <KvRow label={t("Loại đề xuất")}>{d.loai_de_xuat || "—"}</KvRow>
                <KvRow label={t("Chính sách")}>{d.chinh_sach || "—"}</KvRow>
                <KvRow label={t("Yêu cầu hóa đơn")}>{d.yeu_cau_hoa_don || "—"}</KvRow>
                <KvRow label={t("TT khách hàng")}><span className="whitespace-pre-line break-words">{d.tt_khach_hang || "—"}</span></KvRow>
                <KvRow label={t("TT + Mail duyệt")}><span className="whitespace-pre-line break-words">{d.tt_mail_duyet || "—"}</span></KvRow>
                <KvRow label={t("Ưu tiên")}>{d.uu_tien === 1 ? t("Có") : t("Không")}</KvRow>
                {d.loai_don !== "tra_hang" && (
                  <KvRow label={t("Linh kiện đặc thù")}>
                    <span className="inline-flex items-center gap-1.5">
                      {canTacNghiep && !["TN tu choi", "Tu choi", "Da huy"].includes(d.trang_thai ?? "") ? (
                        <ToggleSwitch
                          checked={!!d.dac_thu}
                          onChange={() => {
                            if (dacThuMutation.isPending) return;
                            const bat = !d.dac_thu;
                            const canhBao = !bat
                              ? d.trang_thai === "Cho TBP xac nhan"
                                ? t("Tắt đặc thù: đơn bỏ bước TBP, chuyển sang Chờ TN duyệt và không còn bắt buộc thanh toán mới được Chờ hàng. Tiếp tục?")
                                : t("Tắt đặc thù: đơn không còn bắt buộc thanh toán mới được Chờ hàng. Tiếp tục?")
                              : d.trang_thai === "Cho TN duyet" && !boQuaTbpDacThu(d.loai_de_xuat ?? "")
                                ? t("Bật đặc thù: đơn chuyển về Chờ TBP xác nhận. Tiếp tục?")
                                : t("Bật đặc thù cho đơn này?");
                            if (window.confirm(canhBao)) dacThuMutation.mutate(bat);
                          }}
                        />
                      ) : null}
                      <span>{d.dac_thu ? t("Có") : t("Không")}</span>
                      {d.dac_thu_thu_cong != null && (
                        <span className="text-[11px] text-[var(--color-text-faint)]">
                          {t("(TN chỉnh tay{a}", { a: d.dac_thu_nguoi_sua ? ` · ${formatNguoiDisplay(d.dac_thu_nguoi_sua, ktvDisplayMap)}` : "" })}
                          {d.dac_thu_sua_luc ? ` · ${fmtDateTime(d.dac_thu_sua_luc)}` : ""}; {t("danh mục:")} {d.lk_dac_thu ? t("đặc thù") : t("thường")})
                        </span>
                      )}
                    </span>
                  </KvRow>
                )}
                <KvRow label={t("Ghi chú")}><span className="whitespace-pre-line break-words">{d.ghi_chu || "—"}</span></KvRow>
              </DetailZone>
              {/* Ly do chon luc "tu choi"/"cho hang" luu trong ghi_chu cua log moi nhat (xem
                  applyDonHangLog backend) - hien cho nguoi tao biet vi sao, khong chi hien trang thai suong. */}
              {(d.trang_thai === "TN tu choi" || d.trang_thai === "Cho hang") && d.logs?.[0]?.ghi_chu && (
                <div className="text-xs text-[var(--ink-500)]">{d.logs[0].ghi_chu}</div>
              )}
            </>
          )}

          {/* FIX (ra soat "logic sai theo vai tro" 2026-08-31): KTV/Ve tinh khong co tab "Phieu xuat
              kho" rieng - day la CHO DUY NHAT ho xem trang thai PXK cua dong nay + tu chuyen tien/xac
              nhan nhan hang (chinh minh, xem PxkInfo dau file). Chi hien khi dong DA duoc gom vao 1
              PXK (pxk != null). */}
          {pxk && (
            <DetailZone title={t("Phiếu xuất kho")}>
              {/* Thong tin phieu + link mo Drawer chi tiet phieu (2026-10-02). */}
              <KvRow label={t("Mã phiếu")}>
                <button type="button" className="code-link underline underline-offset-2 hover:opacity-80 font-mono" title={t("Mở chi tiết phiếu")} onClick={() => setShowPxk(true)}>
                  {pxk.id}
                </button>
                {pxk.so_dong != null && <span className="ml-2 text-xs text-[var(--ink-400)]">{t("{a} dòng", { a: pxk.so_dong })}</span>}
              </KvRow>
              <KvRow label={t("Mã đơn hàng (HĐ)")}>
                {pxk.ma_xuat_kho_xac_nhan ? <span className="font-mono">{pxk.ma_xuat_kho}</span> : <span className="italic text-xs text-[var(--ink-400)]">{t("Chưa có")}</span>}
              </KvRow>
              <KvRow label={t("Mã PXK (MISA)")}>
                {pxk.ma_misa ? <span className="font-mono">{pxk.ma_misa}</span> : <span className="italic text-xs text-[var(--ink-400)]">{t("Chưa có")}</span>}
              </KvRow>
              {pxk.ma_van_don && <KvRow label={t("Mã vận đơn")}><span className="font-mono">{pxk.ma_van_don}</span></KvRow>}
              <KvRow label={t("Trạng thái")}>
                <StatusBadge value={pxk.trang_thai ?? ""} tones={PXK_TRANG_THAI_TONE} options={PXK_TRANG_THAI_OPTIONS} />
              </KvRow>
              {pxk.nguoi_tao && <KvRow label={t("Người tạo")}>{formatNguoiDisplay(pxk.nguoi_tao, ktvDisplayMap)}</KvRow>}
              {pxk.ngay_tao && <KvRow label={t("Thời gian tạo")}>{fmtDateTime(pxk.ngay_tao)}</KvRow>}
              {pxk.nguoi_nhan_hang && <KvRow label={t("Người nhận hàng")}>{formatNguoiDisplay(pxk.nguoi_nhan_hang, ktvDisplayMap)}</KvRow>}
              {pxk.so_tien_can_chuyen != null && (
                <>
                  <TienPhieuVaQuy
                    tong={pxk.so_tien_can_chuyen}
                    daThanhToan={pxk.da_thanh_toan ?? 0}
                    daDuyet={pxk.trang_thai_chuyen_tien === "TN da duyet"}
                    quyDu={pxk.quy_du ?? 0}
                  />
                  <KvRow label={t("Trạng thái chuyển tiền")}>
                    <StatusBadge value={pxk.trang_thai_chuyen_tien ?? ""} tones={CHUYEN_TIEN_TONE} options={CHUYEN_TIEN_OPTIONS} />
                  </KvRow>
                  {/* Nhieu anh (2026-09-29, BangChungChuyenTien.tsx) - form ben duoi tu hien anh khi dang nop. */}
                  {!(currentEmail === pxk.nguoi_nhan_hang && pxk.trang_thai_chuyen_tien === "Cho KTV chuyen") && docAnhBangChung(pxk).length > 0 && (
                    <KvRow label={t("Bằng chứng")}><BangChungAnhPxk pxk={pxk} ten={(e) => (e ? formatNguoiDisplay(e, ktvDisplayMap) : "")} /></KvRow>
                  )}
                  {!(currentEmail === pxk.nguoi_nhan_hang && pxk.trang_thai_chuyen_tien === "Cho KTV chuyen") && pxk.bang_chung_chuyen_tien_ghi_chu && (
                    <KvRow label={t("Ghi chú")}><span className="text-xs text-[var(--ink-600)]">{pxk.bang_chung_chuyen_tien_ghi_chu}</span></KvRow>
                  )}
                  {/* CHI nguoi_nhan_hang that su cua PXK moi thay 2 hanh dong nay (khop dung quyen
                      backend PATCH /phieu-xuat-kho/:id/chuyen-tien - xem comment "FORBIDDEN_ROLE"). */}
                  {currentEmail === pxk.nguoi_nhan_hang && pxk.trang_thai_chuyen_tien === "Cho KTV chuyen" && (
                    <BangChungChuyenTienForm
                      key={`${pxk.id}|${pxk.so_tien_can_chuyen}|${pxk.bang_chung_chuyen_tien_anh ?? ""}`}
                      pxkId={pxk.id}
                      pxk={pxk}
                      onDone={invalidatePxk}
                      addToast={addToast}
                    />
                  )}
                </>
              )}
              {currentEmail === pxk.nguoi_nhan_hang && pxk.trang_thai === "Dang gui KTV" && (
                <Btn size="sm" className="mt-2" onClick={() => pxkLogMutation.mutate({ pxkId: pxk.id, trang_thai: "KTV da nhan" })} disabled={pxkLogMutation.isPending} loading={pxkLogMutation.isPending}>
                  {t("Đã nhận hàng")}
                </Btn>
              )}
            </DetailZone>
          )}

          {/* Them (phan hoi 2026-09-10: "đơn gốc cũng không có truy vấn đến đơn ticket đơn thiếu linh
              kiện") - chi hien khi dong nay tung mo 1 ca thieu_lk (xem openThieuLkForDonHang o backend),
              cho phep bam thang sang Drawer chi tiet ticket do thay vi phai tu chuyen qua tab "Thiếu LK"
              roi tim lai bang tay. */}
          {thieuLk && (
            <DetailZone title={t("Thiếu linh kiện")}>
              <KvRow label={t("Trạng thái")}>
                <StatusBadge value={thieuLk.trang_thai ?? ""} tones={THIEU_LK_TRANG_THAI_TONE} options={THIEU_LK_TRANG_THAI_OPTIONS} />
              </KvRow>
              <KvRow label={t("Kho tiếp nhận")}>
                {thieuLk.tiep_nhan_luc
                  ? `${fmtDateTime(thieuLk.tiep_nhan_luc)} · ${formatPersonDisplay(thieuLk.nguoi_tiep_nhan ?? "", personDirChiTiet)}`
                  : t("Chưa tiếp nhận")}
              </KvRow>
              <KvRow label={t("Dự kiến có hàng")}>{thieuLk.ngay_du_kien_co_hang ? fmtDate(thieuLk.ngay_du_kien_co_hang) : "—"}</KvRow>
              {thieuLk.ngay_hang_ve_thuc_te && <KvRow label={t("Hàng về thực tế")}>{fmtDate(thieuLk.ngay_hang_ve_thuc_te)}</KvRow>}
              <Btn size="sm" variant="ghost" className="mt-1" onClick={() => setShowThieuLk(true)}>
                {t("Xem ticket {id} ↗", { id: thieuLk.id })}
              </Btn>
            </DetailZone>
          )}

          {/* CHOT (ra soat module #18): them 1 cham tron nho dau moi dong theo dung tone trang thai
              (khong to mau ca dong chu) - du quet nhanh "chuoi mau" cua hanh trinh xu ly ma khong
              canh tranh voi StatusBadge chinh o dau modal (van la diem neo cho trang thai HIEN TAI). */}
          {(d.logs?.length ?? 0) > 0 && (
            <div>
              {/* Doi sang Timeline (concept 1, pattern ".timeline") - thay cho danh sach cham tron mau
                  theo tone trang thai truoc day. TRANG_THAI_DOT_TONE khong con dung o day. */}
              <SectionTitle icon="🕐">{t("Lịch sử xử lý")}</SectionTitle>
              <Timeline
                items={d.logs!.map((l, i, all) => ({
                  dotClassName: TRANG_THAI_DOT_TONE[DON_HANG_TRANG_THAI_TONE_ALL[l.trang_thai] ?? "neutral"],
                  // Nguoi thao tac -> hanh dong -> trang thai ket qua (LogTieuDe, 2026-09-30). Log moi nhat truoc -> dong
                  // CUOI la luc tao don. "Tự động duyệt" (he thong tu duyet luc tao) tach khoi "TN đã duyệt" (chot 2026-09-28).
                  title: (
                    <LogTieuDe
                      nguoi={l.tu_dong ? t("Hệ thống") : formatPersonDisplay(l.nguoi_xu_ly, personDirChiTiet)}
                      hanhDong={l.tu_dong ? t("tự động duyệt đơn của {a} →", { a: formatPersonDisplay(l.nguoi_xu_ly, personDirChiTiet) }) : i === all.length - 1 ? t("tạo đơn →") : t("chuyển sang")}
                      trangThai={trangThaiLabel(DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, l.trang_thai)}
                      ghiChu={l.ghi_chu}
                    />
                  ),
                  time: fmtDateTime(l.ngay_xu_ly),
                }))}
              />
            </div>
          )}
        </div>
      )}
    </Drawer>
    {/* FIX (phan hoi 2026-09-05, muc #5: "popup cảnh báo đơn tạo hộ hiện phía sau UI chi tiết không
        click được") - Modal nay dung z-50 GIONG Drawer o tren; ca hai la fixed sibling trong CUNG 1
        Fragment nen thu tu DOM (khong phai z-index) quyet dinh ai ve TREN - phai dat SAU </Drawer> de
        ve tren, truoc day dat TRUOC nen bi Drawer de len, khong bam duoc. */}
    {/* Chi tiet linh kien khi bam "Mã LK" o vung "Mã tham chiếu" - dat SAU </Drawer> de ve TREN (cung ly
        do voi Modal canh bao ben duoi). */}
    {xemLkChiTiet && d && (() => {
      const part = danhMuc.find((m) => m.ma_linh_kien === d.ma_lk);
      return part ? <LinhKienDetailModal part={part} rank={rankMap.get(d.ma_lk)} onClose={() => setXemLkChiTiet(false)} /> : null;
    })()}
    {confirmDuyetTaoHo && (
      <Modal open title={t("Cảnh báo")} onClose={() => setConfirmDuyetTaoHo(false)}>
        <div className="space-y-3 text-sm">
          <div className="font-semibold text-[var(--coral-600)]">{t("(!!!) Đơn công nợ này được tạo hộ! Bạn có chắc đồng ý phê duyệt không?")}</div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" size="sm" onClick={() => setConfirmDuyetTaoHo(false)}>{t("Huỷ")}</Btn>
            <Btn
              size="sm"
              disabled={soLuongThucXuatDaDoi && !lyDoSoLuong.trim()}
              onClick={() => { setConfirmDuyetTaoHo(false); logMutation.mutate(duyetPayload()); }}
            >
              {t("Đồng ý phê duyệt")}
            </Btn>
          </div>
        </div>
      </Modal>
    )}
    {showPxk && pxk && (
      <Suspense fallback={null}>
        <PxkDetailModalLazy
          id={pxk.id}
          onClose={() => setShowPxk(false)}
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          canKho={canKho ?? false}
          canKeToan={!!authUser?.la_ke_toan || !!isAdmin}
          canDownloadMisa={!!authUser?.la_ke_toan || !!authUser?.la_kho || canTacNghiep || !!isAdmin}
          currentEmail={currentEmail}
          isAdmin={!!isAdmin}
        />
      </Suspense>
    )}
    {showThieuLk && thieuLk && (
      <ThieuLkDetailModal
        id={thieuLk.id}
        onClose={() => setShowThieuLk(false)}
        addToast={addToast}
        qc={qc}
        canKho={canKho ?? false}
        canTacNghiep={canTacNghiep}
        currentEmail={currentEmail}
      />
    )}
    </>
  );
}


// ---------- Tab "Don cua toi / Danh sach" ----------

export function DonCuaToiTab({
  user,
  addToast,
  qc,
  xemLoaiDon,
  canTacNghiep,
  canTPDvbhXacNhan,
  canBulkTram,
  canKho,
  canKeToan,
  isGiamSat,
  canXemChiTietCa,
  openCase,
  initialFilterOverride,
  initialNguoiNhanHangOverride,
  initialLoaiDonOverride,
  initialDetailIdOverride,
  onDetailIdConsumed,
  onJumpConsumed,
  loaiDonTabClickSeq,
}: {
  user: { email: string; vai_tro: string | null } | null;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  // Sub-loc "Mua hang | Cong no | Tra hang" - NANG LEN component cha (phan hoi 2026-08-19: hien
  // thanh 3 tab thuc su o thanh tab tren cung thay vi 1 hang nut rieng trong tab nay, xem
  // DatMuaLinhKienModule.tsx).
  xemLoaiDon: "mua" | "cong_no" | "tra_hang";
  canTacNghiep: boolean;
  canTPDvbhXacNhan: boolean;
  canBulkTram: boolean;
  // 3 co them 2026-08-27 (bo loc Khu vuc "nhan vien van phong") - dung de quyet dinh HIEN bo loc Khu
  // vuc (showKhuVucFilter = canTacNghiep || canKho || canKeToan || isGiamSat), khong lien quan cac
  // nhanh quyen khac da co san trong file (vd canBulkTram).
  canKho: boolean;
  canKeToan: boolean;
  isGiamSat: boolean;
  canXemChiTietCa: boolean;
  openCase?: (id: string, tab?: string) => void;
  initialFilterOverride?: string;
  initialNguoiNhanHangOverride?: string;
  initialLoaiDonOverride?: string;
  // Mo THANG chi tiet 1 dong (phan hoi 2026-08-26: "click vào xem đơn chi tiết" tu danh sach thong
  // bao KTV) - khac initialFilterOverride (chi loc danh sach), gia tri nay mo LUON Drawer chi tiet
  // ngay khi nhay toi, cung co che "tieu thu 1 lan" voi jumpTarget o component cha (xem
  // DatMuaLinhKienModule.tsx/openDetailIdFor).
  initialDetailIdOverride?: string;
  // FIX (phan hoi 2026-09-05: chuong thong bao nang len App.tsx, xem comment day du o
  // pendingOpenDetailId trong DatMuaLinhKienModule.tsx) - bao cho component cha DA doc/ap dung xong
  // initialDetailIdOverride de cha xoa dung 1 lan, KHONG con dung timer mu (setTimeout(0)) de tu xoa -
  // an toan ke ca tab nay phai cho xong dynamic import() (lan dau mount trong phien) roi moi doc duoc.
  onDetailIdConsumed?: () => void;
  // FIX (phan hoi 2026-09-24: "click vào việc cần làm/starbar thường phải click 2 lần" - xem giai
  // thich day du o jumpTarget/consumeJumpTarget trong DatMuaLinhKienModule.tsx) - bao cho component cha
  // DA doc/ap dung xong initialFilterOverride/initialLoaiDonOverride/initialNguoiNhanHangOverride, cung
  // co che "tu tieu thu" nhu onDetailIdConsumed o tren thay vi timer mu.
  onJumpConsumed?: () => void;
  loaiDonTabClickSeq?: number;
}) {
  const personDir = usePersonDirectory();
  // Mac dinh loc thang vao bucket "can xu ly" cua vai tro dang xem (chi anh huong lan dau, xem
  // comment defaultView o component cha) - TN thay "Cho TN duyet", Tram thay "Cho Tram duyet", con
  // lai (KTV/Ve tinh xem don cua chinh minh, GS theo doi) mac dinh "__OPEN__" (sentinel "con ton",
  // them 2026-08-27, phan hoi UI mobile "mặc định lọc các đơn còn tồn" - truoc day la "" tuc "Tất cả",
  // khien man hinh lan man lich su lan don dang mo). "__OPEN__" khop dung backend GET /don-hang (loc
  // NOT IN tap trang thai "dong" da co san, xem DON_HANG_TRANG_THAI_DONG o datMuaLinhKien.ts).
  // FIX (ra soat bug mua hang 2026-08-26, BUG-002): filterTrangThai TRUOC DAY la 1 bien localStorage
  // DUY NHAT - jump tu Home/Pipeline (initialFilterOverride) goi thang setter cua no, nen 1 lan bam
  // KPI tu Trang chu se GHI DE VINH VIEN filter da luu, du nguoi dung khong chu dong chon. Tach lam 2
  // lop: `savedFilterTrangThai` (localStorage, CHI doi khi nguoi dung tu bam chip) la "gia tri nho lau
  // dai", `filterTrangThai` (state thuong, dung cho query/hien thi) khoi tao tu gia tri da luu - jump
  // chi doi lop hien thi nay, KHONG dong vao localStorage. Chot voi chu he thong: mo tab binh thuong
  // (khong qua jump) van "giữ filter đã lưu gần nhất" nhu hanh vi cu.
  const [savedFilterTrangThai, setSavedFilterTrangThai] = useLocalStorageState(
    // v2 (2026-08-31): doi key de reset gia tri cu bi ket ("Con ton"/"Tat ca") ve dung
    // default theo vai tro, khop voi badge "loai-don-counts" moi (dem theo luot xu ly)
    "filters:dmlk-trang-thai-v2",
    canTacNghiep ? "Cho TN duyet" : canTPDvbhXacNhan ? "Cho TBP xac nhan" : canBulkTram ? "Cho Tram duyet" : "__OPEN__",
  );
  // FIX (phan hoi 2026-08-28: "click vào 1 số liệu Trang chủ => danh sách trống, quay lại bấm lại =>
  // hiện đúng đơn") - khoi tao TRUC TIEP tu initialFilterOverride khi co, tranh lan render dau tien
  // fetch nham filter cu (savedFilterTrangThai) truoc khi effect ben duoi kip sua - xem giai thich day
  // du o PhieuXuatKhoTab.tsx (cung 1 class bug, sua dong loat ca 4 tab dung pattern nay).
  const [filterTrangThai, setFilterTrangThaiDisplay] = useState(initialFilterOverride ?? savedFilterTrangThai);
  function setFilterTrangThai(v: string) {
    setFilterTrangThaiDisplay(v);
    setSavedFilterTrangThai(v);
  }
  // Nhay tu thanh tom tat cua module cha (tieu chi UX #2) - CHI doi lop hien thi, khong ghi localStorage.
  useEffect(() => {
    if (initialFilterOverride !== undefined) { setFilterTrangThaiDisplay(initialFilterOverride); onJumpConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilterOverride]);
  const [filterNguoiTao, setFilterNguoiTao] = useState("");
  const [filterNguoiNhanHang, setFilterNguoiNhanHang] = useState(initialNguoiNhanHangOverride ?? "");
  useEffect(() => {
    if (initialNguoiNhanHangOverride !== undefined) { setFilterNguoiNhanHang(initialNguoiNhanHangOverride); onJumpConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNguoiNhanHangOverride]);
  const [filterTuNgay, setFilterTuNgay] = useState("");
  const [filterDenNgay, setFilterDenNgay] = useState("");
  // Bo loc Khu vuc (them 2026-08-27, phan hoi "GS test không thấy đơn của KTV khu vực mình" + yeu cau
  // "bổ sung thêm filter theo khu vực... nếu giám sát sẽ tự lọc filter mặc định theo khu vực mình
  // được set") - showKhuVucFilter khop dung nhom "nhan vien van phong" (GS/TN/Kho/Ke toan, GIONG
  // showKhuVucAssign o UsersModule.tsx). options la TOAN BO Khu vuc (khong chi khu vuc cua minh) - TN/
  // Kho/Ke toan van xem duoc "toàn quốc" (chi mac dinh CHON SAN khu vuc cua ho, khong bi GIOI HAN nhu
  // La_view - khac ban chat voi khu_vuc_ma trong scopeDatMua.ts).
  const showKhuVucFilter = canTacNghiep || canKho || canKeToan || isGiamSat;
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
  // Mac dinh CHON SAN khu vuc cua chinh nguoi dang xem (yeu cau "GS tự lọc filter mặc định theo khu
  // vực mình được set") - CHI 1 LAN dau tien khi du lieu ve, khong ghi de lua chon nguoi dung da tu
  // doi sau do (khop dung tinh than cua savedFilterTrangThai/khuVucDefaultAppliedRef).
  // FIX (2026-08-31, phan hoi "vai trò TN: danh sách mua hàng có 3 đơn mà bên trên đếm (X1)" roi "check
  // lại toàn bộ hệ thống"): TAM THOI chi ap dung cho GS (badge lech vi TN/Kho/Ke toan chua loc theo Khu
  // vuc), sau do nguoi dung xac nhan MUON badge/list DONG BO ca 2 chieu (auto-chon cho TAT CA vai tro) -
  // GET /loai-don-counts nay da them dieu kien loc theo khuVucCuaToiSet khi scope===null (xem file do),
  // nen mo lai auto-chon cho TN/Kho/Ke toan, khop dung badge moi.
  // FIX (phat hien qua test 2026-08-31, xem PhieuXuatKhoTab.tsx/TraHangTab.tsx) - chan tuong minh
  // bang showKhuVucFilter thay vi chi dua vao du lieu query da ve (React Query dung chung cache theo
  // queryKey, khong tu dong ton trong "enabled" cua rieng component nay).
  useEffect(() => {
    if (!showKhuVucFilter) return;
    if (khuVucDefaultAppliedRef.current) return;
    if (!khuVucCuaToiData) return;
    khuVucDefaultAppliedRef.current = true;
    if (khuVucCuaToiData.rows.length > 0) setFilterKhuVuc(new Set(khuVucCuaToiData.rows.map((r) => r.ma)));
  }, [khuVucCuaToiData, showKhuVucFilter]);
  const khuVucOptions = showKhuVucFilter ? (khuVucAllData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ten })) : [];
  // CHOT #8 (ra soat module "Dat Mua Linh Kien 2.0"): tim theo ma LK/ten LK/ma dong - gui len SERVER
  // (khong loc client-side, danh sach da phan trang server-side that su nen loc client chi tim duoc
  // trong 20 dong dang tai). Debounce 500ms giong pattern MaYeuCauSuCoCheck da co san trong file.
  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  // Tim kiem tren "Tổng"/"Còn tồn" (2026-10-03, "cho phép tìm kiếm theo tổng"): co tu khoa thi tim TREN MOI trang thai (ke ca
  // don/phieu da xong/da huy - tim theo ma don hang/ma xuat thuong la phieu cu); chon 1 trang thai cu the thi van tim trong do.
  const trangThaiGui = debouncedQ.trim() && filterTrangThai === "__OPEN__" ? "" : filterTrangThai;
  useEffect(() => {
    const hen = setTimeout(() => setDebouncedQ(filterQ.trim()), 500);
    return () => clearTimeout(hen);
  }, [filterQ]);
  const [detailId, setDetailId] = useState<string | null>(null);
  useEffect(() => {
    if (initialDetailIdOverride) {
      setDetailId(initialDetailIdOverride);
      onDetailIdConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDetailIdOverride]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  // UI redesign (phan hoi 2026-08-19: "cho hết vào 1 nút thu gọn/mở rộng") - GOM toan bo bo loc (tim
  // kiem/trang thai chip/nguoi tao-ngay/nguoi nhan hang) vao CHUNG 1 khoi an mac dinh, thay 2 tang
  // rieng ("Loc them ▾" long trong hang toolbar chinh) truoc day - muc tieu ngay sau thanh tab tren
  // cung la den thang bang danh sach, khong con hang loc chiem san dien tich.
  const [showFilters, setShowFilters] = useState(false);
  // FIX (ra soat UI 2026-08-27, hang muc #2 dot 2): nut "⚙ Tuỳ chỉnh cột" rat it dung, chuyen vao
  // CHUNG bang loc (mac dinh an theo showFilters) thay vi 1 hang rieng luon hien phia tren danh sach.
  // Nut/panel that su duoc DonHangGroupedList tu ve (can effectiveColumns/toggleColumn cua chinh no),
  // nen dung Portal (createPortal) render VAO 1 "o trong" dat trong bang loc o day - dung callback ref
  // (setColumnSettingsSlot, KHONG phai useRef thuong) vi o trong chi ton tai sau khi showFilters=true
  // mount xong; callback ref moi kich hoat re-render dung luc DOM node san sang, useRef thuong se bi
  // "cham 1 nhip" (ref doi gia tri nhung khong tu gay re-render).
  const [columnSettingsSlot, setColumnSettingsSlot] = useState<HTMLDivElement | null>(null);
  // xemLoaiDon gio la PROP (nang len DatMuaLinhKienModule, hien thanh 3 tab that "Mua hang/Cong no/
  // Tra hang" o thanh tab tren cung - xem comment o chu ky ham). Doi sang "Tra hang" thi filterTrangThai
  // phai reset - bo loc trang thai dang dung gia tri cua dat_don_hang_log (vd "Cho TN duyet"), khong
  // khop trang thai cua tra_hang_log nen se ra rong neu giu nguyen. SUA (2026-08-27): reset ve
  // "__OPEN__" (con ton) thay vi "" (Tat ca) - khop dung mac dinh moi, va "__OPEN__" hop le cho CA 2
  // loai_don (backend tu chon dung tap trang thai "dong" theo loaiDon, xem GET /don-hang).
  useEffect(() => {
    if (xemLoaiDon === "tra_hang") setFilterTrangThai("__OPEN__");
  }, [xemLoaiDon]);
  // SUA BUG (phan hoi 2026-08-21: "ấn TN 2 chỉ hiện 1... ấn TBP 1 lúc thì hiện 1 dòng, lúc lại báo
  // không có dữ liệu") - cac buoc Tram/TBP/TN tren pipeline dem GOP ca "mua" lan "cong_no" (xem
  // GET /luong-quy-trinh, dieu kien "loai_don != 'tra_hang'"), nhung danh sach o day truoc day LUON
  // loc dung 1 xemLoaiDon (dang sub-tab dang mo) - so dem tren pipeline va danh sach hien thi lech
  // nhau tuy thuoc sub-tab nao dang mo luc bam. Backend GET /don-hang da san sang: KHONG truyen
  // loai_don se tra ve GOP ca 2 loai (xem comment o route). "all" la sentinel rieng (backend dat cho
  // 3 buoc nay, xem LuongQuyTrinhStep) bao override sang GOP, khac voi undefined (= khong override,
  // dung xemLoaiDon nhu binh thuong). Override tu xoa khi nguoi dung tu tay doi sub-tab (xemLoaiDon
  // that su doi gia tri) - tranh giu mai trang thai "gop" sau khi da roi khoi luong nhay tu pipeline.
  const [loaiDonOverride, setLoaiDonOverride] = useState<string | undefined>(undefined);
  // FIX (phan hoi 2026-09-11: "số lượng đếm đang không khớp... chỉ có 3 dòng nhưng đang đếm 4") - 2
  // effect nay PHAI dung dung THU TU khai bao nay (hieu ung "clear" o TREN, "set" o DUOI). Moi lan
  // StageMenu bam 1 muc "Đơn đặt hàng" (loaiDon:"") deu bump CA HAI prop cung luc trong CUNG 1 lan
  // re-render (jumpTarget.loaiDon VA loaiDonTabClickSeq, xem stageJump() trong
  // DatMuaLinhKienModule.tsx) - React chay effect theo dung thu tu khai bao trong CUNG 1 lan flush,
  // nen neu effect "clear" (phu thuoc loaiDonTabClickSeq) dung SAU effect "set" (phu thuoc
  // initialLoaiDonOverride) nhu truoc day, no se GHI DE setLoaiDonOverride(undefined) NGAY SAU khi
  // effect kia vua set "" - ket qua la override "gop ca loai" KHONG BAO GIO thuc su co hieu luc, danh
  // sach am tham loc rieng theo xemLoaiDon da luu (vd "mua") thay vi gop dung ca mua+cong_no+tra_hang
  // nhu jumpTarget yeu cau - gay dung ca dem tren StageMenu/pipeline (tinh KHONG loc loai_don) LON HON
  // so dong danh sach thuc su hien ra (co loc loai_don sai). Dat effect "set" o DUOI de no chay SAU va
  // thang trong truong hop ca 2 cung bump 1 luot.
  const isFirstLoaiDonSeqRef = useRef(true);
  useEffect(() => {
    if (isFirstLoaiDonSeqRef.current) {
      isFirstLoaiDonSeqRef.current = false;
      return;
    }
    setLoaiDonOverride(undefined);
  }, [loaiDonTabClickSeq]);
  useEffect(() => {
    // "tat_ca" (StageMenu "Tổng đơn hàng") -> loai_don=all: GOP CA 3 loai ke ca tra hang (khac "all"/""
    // = chi gop mua + cong no nhu cac muc khac - xem donConTonSql o backend GET /don-hang).
    if (initialLoaiDonOverride !== undefined) {
      setLoaiDonOverride(initialLoaiDonOverride === "all" ? "" : initialLoaiDonOverride === "tat_ca" ? "all" : initialLoaiDonOverride);
      onJumpConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoaiDonOverride]);
  const effectiveLoaiDon = loaiDonOverride !== undefined ? loaiDonOverride : xemLoaiDon;
  const xemTatCaLoai = effectiveLoaiDon === "all";
  const trangThaiOptions = xemTatCaLoai ? TAT_CA_LOAI_TRANG_THAI_OPTIONS : xemLoaiDon === "tra_hang" ? TRA_HANG_TRANG_THAI_OPTIONS : DON_CUA_TOI_TRANG_THAI_OPTIONS;
  const isAdmin = user?.vai_tro === "Admin";
  const canActAsTram = canBulkTram || isAdmin;
  // "Tu choi" bat buoc chon Ly do cham khi nguoi bam la TN/Admin tren dong "Cho TN duyet" (khac Tram
  // tu choi dong Ve tinh dang "Cho Tram duyet", khong can ly do); "Huy" bat buoc nhap ly do tu do
  // (phan hoi UX muc 1) - dung chung 1 ActionTarget (xem dinh nghia canh actionsFor). id = "bulk"
  // (tu choi ca set `selected` dang chon) HOAC 1 dat_don_hang id cu the (1 dong).
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [bulkLyDoChamId, setBulkLyDoChamId] = useState("");
  const [actionGhiChu, setActionGhiChu] = useState("");
  const { data: bulkLyDoData } = useQuery({
    queryKey: ["dat-mua-lk-ly-do-cham"],
    queryFn: () =>
      api.get<{ rows: { id: number; ten_ly_do: string; quan_ly_don_thieu_linh_kien: number }[] }>(
        "/dat-mua-lk/ly-do-cham?he_thong=" + encodeURIComponent("Mua hàng"),
      ),
    enabled: canTacNghiep,
  });

  const pageSize = 20;
  // CHOT 2026-08-15 (bo khai niem "phieu dat"): danh sach gio la DONG PHANG (GET /don-hang), phan
  // trang server-side that su (truoc day page/pageSize khong duoc gui len backend - bug tiem an, chi
  // luon lay trang 1 roi slice() client-side - sua luon vi dang viet lai dung doan code nay).
  const khuVucParam = filterKhuVuc.size > 0 ? [...filterKhuVuc].sort().join(",") : "";
  // So "(N)" canh moi trang thai trong TrangThaiDropdownFilter (them 2026-09-01) - dem TINH theo dung
  // sub-tab dang mo (xemLoaiDon, KHONG phai effectiveLoaiDon co the bi override), bo qua cac bo loc
  // phu khac (nguoi_tao/khu_vuc/ngay/q) - xem GET /don-hang-status-counts.
  const donHangStatusCountsLoaiDon = xemTatCaLoai ? "all" : xemLoaiDon === "tra_hang" ? "tra_hang" : undefined;
  const { data: donHangStatusCountsData } = useQuery({
    queryKey: ["dat-mua-lk-don-hang-status-counts", donHangStatusCountsLoaiDon],
    queryFn: () =>
      api.get<{ counts: Record<string, number> }>(
        "/dat-mua-lk/don-hang-status-counts" + buildQuery({ loai_don: donHangStatusCountsLoaiDon }),
      ),
  });
  // "Tải danh sách chi tiết" (them 2026-09-13, phan hoi "Các danh sách đều có phím bấm tải danh sách
  // chi tiết") - goi lai GET /dat-mua-lk/don-hang VOI CUNG bo loc dang xem nhung KHONG truyen page (BE
  // tra HET, xem GET /don-hang trong datMuaLinhKien.ts), mirror handleDownloadFullList() cua UsersModule.tsx.
  const [downloadingFull, setDownloadingFull] = useState(false);
  // Loc cot kieu Excel (phan hoi 2026-09-28) - loc/sap xep o server (lib/locCot.ts), sap xep dong TRONG tung nhom
  // KTV (sap xep cot "Người nhận hàng" = sap xep thu tu nhom). Ap cho ca danh sach lan "Tải danh sách chi tiết".
  const locCot = useLocCot();
  const ktvDisplayMapLoc = useKtvDisplayMap();
  const locCotCfg: LocCotCfg = {
    ...locCot,
    endpoint: "/dat-mua-lk/don-hang/gia-tri-loc",
    params: {
      trang_thai: trangThaiGui || undefined,
      nguoi_tao: filterNguoiTao || undefined,
      nguoi_nhan_hang: filterNguoiNhanHang || undefined,
      tu_ngay: filterTuNgay || undefined,
      den_ngay: filterDenNgay || undefined,
      loai_don: effectiveLoaiDon || undefined,
      q: debouncedQ || undefined,
      khu_vuc: khuVucParam || undefined,
    },
    tieuDe: {
      loai_de_xuat: t("Loại đề xuất"),
      nguoi_tao: t("Người tạo"),
      nguoi_nhan_hang: t("Người nhận hàng"),
      trang_thai: t("Trạng thái"),
      trang_thai_pxk: t("Phiếu xuất kho"),
      thanh_toan: t("Chuyển tiền"),
      yeu_cau_hoa_don: t("Yêu cầu hóa đơn"),
      khu_vuc: t("Khu vực"),
    },
    nhan: {
      nguoi_tao: (v) => formatNguoiDisplay(v, ktvDisplayMapLoc),
      nguoi_nhan_hang: (v) => formatNguoiDisplay(v, ktvDisplayMapLoc),
      trang_thai: (v) => trangThaiLabel(DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, v),
      trang_thai_pxk: (v) => (v ? trangThaiLabel(TRANG_THAI_PXK_DON_OPTIONS, v) : t("— (chưa vào phiếu)")),
      thanh_toan: (v) => trangThaiLabel(THANH_TOAN_DON_OPTIONS, v),
    },
  };
  async function handleDownloadFullList() {
    setDownloadingFull(true);
    try {
      const res = await api.get<{ rows: DonHangRow[] }>(
        "/dat-mua-lk/don-hang" +
          buildQuery({
            trang_thai: trangThaiGui || undefined,
            nguoi_tao: filterNguoiTao || undefined,
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            tu_ngay: filterTuNgay || undefined,
            den_ngay: filterDenNgay || undefined,
            loai_don: effectiveLoaiDon || undefined,
            q: debouncedQ || undefined,
            khu_vuc: khuVucParam || undefined,
            ...locCot.queryParams,
          }),
      );
      await exportRowsToExcel(doiNguoiThanhTen(res.rows, personDir), "don_hang_chi_tiet.xlsx", "Đơn hàng");
    } catch (err) {
      addToast(t("Không tải được danh sách chi tiết: ") + describeApiError(err));
    } finally {
      setDownloadingFull(false);
    }
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-don-hang", filterTrangThai, filterNguoiTao, filterNguoiNhanHang, filterTuNgay, filterDenNgay, effectiveLoaiDon, debouncedQ, khuVucParam, locCot.queryParams, page],
    queryFn: () =>
      api.get<{ rows: DonHangRow[]; page: number; pageSize: number; total: number }>(
        "/dat-mua-lk/don-hang" +
          buildQuery({
            trang_thai: trangThaiGui || undefined,
            nguoi_tao: filterNguoiTao || undefined,
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            tu_ngay: filterTuNgay || undefined,
            den_ngay: filterDenNgay || undefined,
            loai_don: effectiveLoaiDon || undefined,
            q: debouncedQ || undefined,
            khu_vuc: khuVucParam || undefined,
            ...locCot.queryParams,
            page,
            pageSize,
          }),
      ),
  });
  // GD4 (phan hoi Codex #16): ve trang 1 + xoa selection dang chon moi khi BAT KY bo loc nao doi -
  // truoc day chi debouncedQ moi reset trang, cac filter khac (trang thai/nguoi tao/nguoi nhan hang/
  // ngay/loai don) khong reset nen de dung o vd trang 3 roi doi filter ra tap ket qua chi con 1 trang
  // -> hien trang rong gay hieu lam "khong co du lieu". selected cung phai xoa vi cac id da chon co
  // the khong con nam trong tap ket qua moi, bulk hanh dong nham dong ngoai man hinh dang xem.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [filterTrangThai, filterNguoiTao, filterNguoiNhanHang, filterTuNgay, filterDenNgay, effectiveLoaiDon, debouncedQ, khuVucParam, locCot.queryParams.cf, locCot.queryParams.cs, locCot.queryParams.cd]);

  // Dropdown "Người tạo" (sua 2026-09-29: truoc day chi lay Ve tinh co tram_cha = minh -> TN khong phai Tram cua ai nen
  // chi con "Tất cả người tạo"). Gio lay DANH SACH NGUOI TAO THAT trong pham vi dang xem tu CUNG endpoint loc cot
  // (/don-hang/gia-tri-loc?cot=nguoi_tao, cung WHERE voi danh sach) - BO chinh bo loc nguoi_tao de van chon lai duoc.
  const { data: nguoiTaoData } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-tao-options", filterTrangThai, filterNguoiNhanHang, filterTuNgay, filterDenNgay, effectiveLoaiDon, debouncedQ, khuVucParam, locCot.queryParams.cf],
    queryFn: () =>
      api.get<{ rows: { v: string; n: number }[] }>(
        "/dat-mua-lk/don-hang/gia-tri-loc" +
          buildQuery({
            cot: "nguoi_tao",
            trang_thai: trangThaiGui || undefined,
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            tu_ngay: filterTuNgay || undefined,
            den_ngay: filterDenNgay || undefined,
            loai_don: effectiveLoaiDon || undefined,
            q: debouncedQ || undefined,
            khu_vuc: khuVucParam || undefined,
            cf: locCot.queryParams.cf,
          }),
      ),
    enabled: canBulkTram,
    staleTime: 60_000,
  });
  const nguoiTaoOptions = useMemo(() => {
    const rows = (nguoiTaoData?.rows ?? []).filter((r) => r.v);
    const opts = rows
      .map((r) => ({ value: r.v, label: `${formatPersonDisplay(r.v, personDir)} (${r.n})` }))
      .sort((a, b) => a.label.localeCompare(b.label, "vi"));
    // Gia tri dang loc khong con trong danh sach (vd vua doi bo loc khac) -> van hien de biet dang loc ai.
    if (filterNguoiTao && !rows.some((r) => r.v === filterNguoiTao)) opts.unshift({ value: filterNguoiTao, label: formatPersonDisplay(filterNguoiTao, personDir) });
    return [{ value: "", label: t("Tất cả người tạo") }, ...opts];
  }, [nguoiTaoData, personDir, filterNguoiTao]);

  // Giai doan 4b - TN nhom/loc hang doi theo nguoi nhan hang (diem 5 yeu cau).
  // FIX (phan hoi 2026-08-28: "Thiếu công cụ filter theo KTV") - truoc day CHI enabled cho canTacNghiep,
  // trong khi endpoint GET /nguoi-nhan-hang-kha-dung da MO cho moi vai tro tu truoc (tu scope dung theo
  // nguoi goi - xem comment o backend) nen GS/Kho/Ke toan hoan toan dung duoc, chi bi chan oan o FE. Mo
  // rong theo dung dieu kien showKhuVucFilter da co san cho bo loc Khu vuc (cung nhom "nhan vien van
  // phong" can loc theo KTV).
  const { data: nguoiNhanHangData } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: NguoiNhanHangKhaDungRow[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
    enabled: showKhuVucFilter,
  });
  // loaiDonCounts (so dong dang mo theo loai don) da chuyen len DatMuaLinhKienModule.tsx lam badge
  // do tren 3 tab "Mua hang/Cong no/Tra hang" (phan hoi 2026-08-19) - khong con dung o day.

  const pageRowsRef = useRef<DonHangRow[]>([]);
  const bulkMutation = useMutation({
    // "ids" truyen tuong minh (khong doc "selected" qua closure) - cho phep goi truc tiep voi 1 dong
    // don le (thao tac nhanh tren tung dong trong DonHangGroupedList) ma khong dung den state
    // `selected` (chi danh cho chon hang loat cua Tram).
    // Dong tra hang "Cho TN duyet tong" (cung muc "Chờ tác nghiệp") di luong tra_hang_log rieng -> tach gui /tra-hang/bulk-log,
    // gop ket qua 2 ben lai nhu 1 lan goi.
    mutationFn: async ({ ids, hanh_dong, ly_do_cham_id, ghi_chu }: { ids: string[]; hanh_dong: "duyet" | "tu_choi" | "huy"; ly_do_cham_id?: number; ghi_chu?: string }) => {
      const traIds = ids.filter((i) => { const r = pageRowsRef.current.find((x) => x.id === i); return !!r && laTraHangChoTn(r); });
      const donIds = ids.filter((i) => !traIds.includes(i));
      const [a, b] = await Promise.all([
        donIds.length ? api.post<{ results: Record<string, string> }>("/dat-mua-lk/don-hang/bulk-log", { ids: donIds, hanh_dong, ly_do_cham_id, ghi_chu }) : null,
        traIds.length ? api.post<{ results: Record<string, string> }>("/tra-hang/bulk-log", { ids: traIds, hanh_dong, ly_do_cham_id, ghi_chu }) : null,
      ]);
      return { results: { ...(a?.results ?? {}), ...(b?.results ?? {}) }, traIds };
    },
    onSuccess: (res, vars) => {
      setActionTarget(null);
      setBulkLyDoChamId("");
      setActionGhiChu("");
      if (res.traIds.length) qc.invalidateQueries({ queryKey: ["tra-hang"] });
      // Don tra hang qua han 24h o buoc TN -> backend doi ly do cham (khong biet truoc o danh sach) -> mo hop chon ly do
      // cho dung cac dong do roi gui lai.
      const canLyDo = vars.ly_do_cham_id ? [] : res.traIds.filter((i) => res.results[i] === "MISSING_LY_DO_CHAM");
      if (canLyDo.length > 0) {
        setSelected(new Set(canLyDo));
        setActionTarget({ id: canLyDo.length === 1 ? canLyDo[0] : "bulk", action: vars.hanh_dong === "tu_choi" ? "tu_choi" : "duyet_qua_han" });
        if (vars.hanh_dong === "tu_choi" && vars.ghi_chu) setActionGhiChu(vars.ghi_chu);
        addToast(t("{a} đơn trả hàng quá hạn 24h — chọn lý do chậm để xử lý tiếp", { a: canLyDo.length }));
        qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
        invalidatePipelineCounts(qc);
        return;
      }
      const entries = Object.entries(res.results);
      const loiMsg = (code: string) => BULK_LOG_ERROR_MESSAGES[code] ?? TRA_HANG_BULK_ERROR_MESSAGES[code];
      const failed = entries.filter(([, v]) => !!loiMsg(v));
      // Phase 4 (bulk retry, phan hoi Codex 2026-08-19 roadmap goc): that bai 1 phan thi CHI giu lai
      // dung cac dong loi trong `selected` (thay vi xoa het) - nguoi dung bam lai nut bulk 1 lan nua
      // la retry DUNG cac dong that bai, khong phai do tim lai tay trong danh sach.
      setSelected(new Set(failed.map(([lineId]) => lineId)));
      if (failed.length === 0) {
        addToast(t("Đã xử lý thành công {a} dòng", { a: entries.length }));
      } else {
        const detail = failed.map(([lineId, code]) => `${lineId}: ${loiMsg(code) ? t(loiMsg(code)) : code}`).join("; ");
        addToast(t("Thành công {a}/{b} dòng. Thất bại: {c} — đã giữ lại các dòng lỗi, bấm lại để thử lại", { a: entries.length - failed.length, b: entries.length, c: detail }));
      }
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      invalidatePipelineCounts(qc);
    },
  });

  function confirmTuChoiChe() {
    if (!actionTarget || (actionTarget.action !== "tu_choi" && actionTarget.action !== "cho_hang")) return;
    const ids = actionTarget.id === "bulk" ? [...selected] : [actionTarget.id];
    const targetRow = actionTarget.id !== "bulk" ? pageRows.find((r) => r.id === actionTarget.id) : undefined;
    // "Cho TBP xac nhan"/"Cho Tram duyet" tu choi don gian (ghi chu tu do, khong chon Ly do cham) -
    // ghi_chu nay BAT BUOC (hang muc #19 2026-08-25), nut xac nhan da disable san khi rong. "TN da
    // duyet" (phan hoi 2026-09-24) dung chung nhanh nay - khong the vao bulk (rowsCoTheChon khong gom
    // trang thai nay) nen chi can xu ly o day, cho thao tac tung dong.
    if (
      targetRow?.trang_thai === "Cho TBP xac nhan" ||
      targetRow?.trang_thai === "Cho Tram duyet" ||
      (targetRow?.trang_thai === "TN da duyet" && actionTarget.action === "tu_choi")
    ) {
      if (!actionGhiChu.trim()) return;
      bulkMutation.mutate({ ids, hanh_dong: "tu_choi", ghi_chu: actionGhiChu.trim() });
      return;
    }
    // Don tra hang "Cho TN duyet tong": bat buoc ly do (ghi_chu), ly do cham chi khi qua han 24h (backend bao MISSING_LY_DO_CHAM).
    if (targetRow && laTraHangChoTn(targetRow)) {
      if (!actionGhiChu.trim()) return;
      bulkMutation.mutate({ ids, hanh_dong: "tu_choi", ghi_chu: actionGhiChu.trim(), ly_do_cham_id: bulkLyDoChamId ? Number(bulkLyDoChamId) : undefined });
      return;
    }
    // Bulk (id === "bulk") co the gom lan CA dong "Cho Tram duyet" VA "Cho TN duyet" (Admin xem duoc
    // ca 2 vai) - dong Tram BAT BUOC actionGhiChu rieng (khong dung ly_do_cham_id), dong TN BAT BUOC
    // bulkLyDoChamId - modal chi hien field tuong ung neu co dong loai do trong lua chon (xem
    // bulkCoDongTram/bulkCoDongTN o JSX ben duoi), nen chi validate field NAO thuc su can.
    const coDongTram = ids.some((i) => pageRows.find((r) => r.id === i)?.trang_thai === "Cho Tram duyet");
    const coDongTN = ids.some((i) => pageRows.find((r) => r.id === i)?.trang_thai === "Cho TN duyet");
    const coDongTra = ids.some((i) => { const r = pageRows.find((x) => x.id === i); return !!r && laTraHangChoTn(r); });
    if (coDongTN && !bulkLyDoChamId) return;
    if ((coDongTram || coDongTra) && !actionGhiChu.trim()) return;
    // "cho_hang" cung goi hanh_dong backend "tu_choi" - xem comment actionsFor.choHang o helpers.ts.
    bulkMutation.mutate({
      ids,
      hanh_dong: "tu_choi",
      ly_do_cham_id: bulkLyDoChamId ? Number(bulkLyDoChamId) : undefined,
      ghi_chu: actionGhiChu.trim() || undefined,
    });
  }

  function confirmHuyChe() {
    if (!actionTarget || actionTarget.action !== "huy" || !actionGhiChu.trim()) return;
    const ids = actionTarget.id === "bulk" ? [...selected] : [actionTarget.id];
    bulkMutation.mutate({ ids, hanh_dong: "huy", ghi_chu: actionGhiChu.trim() });
  }

  // "Duyệt" 1 dong da qua han 24h (hang muc #17/#18, 2026-08-25) - dung LAI cung ly_do_cham_id nhu
  // tu_choi/cho_hang, chi khac hanh_dong gui len la "duyet".
  function confirmDuyetQuaHan() {
    if (!actionTarget || actionTarget.action !== "duyet_qua_han" || !bulkLyDoChamId) return;
    const ids = actionTarget.id === "bulk" ? [...selected] : [actionTarget.id];
    bulkMutation.mutate({ ids, hanh_dong: "duyet", ly_do_cham_id: Number(bulkLyDoChamId) });
  }

  const pageRows = data?.rows ?? [];
  pageRowsRef.current = pageRows;
  // Dong tra hang dang o 4 buoc duyet rieng (tra_hang_log) -> chi tiet mo TraHangDetailModal.
  const detailRowDs = detailId ? pageRows.find((r) => r.id === detailId) : undefined;
  const detailTraHang =
    detailRowDs?.loai_don === "tra_hang" &&
    ["Cho ke toan duyet mem", "Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong"].includes(detailRowDs.trang_thai ?? "");
  // Chon hang loat gio o CAP DONG (truoc day cap phieu) - dong dang "Cho Tram duyet" ma Tram co the
  // duyet/tu choi, khong phai chinh dong nguoi tao tu tao. Phan hoi 2026-08-19 ("duyệt/từ chối hàng
  // loạt của tác nghiệp đâu rồi?"): mo rong them dong "Cho TN duyet" cho TN - truoc day placeholder
  // dropdown Ly do cham o duoi da ghi san "(ap dung cho dong TN xu ly)" tu truoc nhung chua co dong
  // nao thuc su chon duoc vi rowsCoTheChon/chonDuoc chi loc "Cho Tram duyet". Khong gioi han
  // nguoi_tao cho nhanh TN (actionsFor cho buoc "Cho TN duyet" von khong chan tu-duyet, giu dung
  // hanh vi hien co cua thao tac tung dong rieng le).
  const rowsCoTheChon = pageRows.filter((r) => {
    const a = actionsFor(r, { canTacNghiep, canActAsTram, currentEmail: user?.email ?? "" });
    if (r.trang_thai === "Cho Tram duyet") return (a.duyet || a.tuChoi) && r.nguoi_tao !== user?.email;
    if (r.trang_thai === "Cho TN duyet" || laTraHangChoTn(r)) return a.duyet || a.tuChoi;
    return false;
  });
  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "Preview truoc bulk action") - tong tien cua CAC
  // DONG DANG CHON, hien kem so dong trong nut xac nhan bulk de nguoi dung thay ro quy mo truoc khi
  // bam xac nhan lan 2 (xem BulkConfirmButton).
  const tongTienDaChon = pageRows.filter((r) => selected.has(r.id)).reduce((s, r) => s + tienSauChietKhau(r), 0);

  function toggleSelectAll() {
    setSelected((s) => (s.size === rowsCoTheChon.length ? new Set() : new Set(rowsCoTheChon.map((r) => r.id))));
  }
  function toggleSelectOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // + so cot dang loc kieu Excel (2026-09-29: tren mobile loc cot nam trong bang "Bộ lọc" nen phai dem vao day).
  const activeFilterCount = [filterTrangThai, filterNguoiTao, filterNguoiNhanHang, filterTuNgay, filterDenNgay, filterQ, khuVucParam].filter(Boolean).length + Object.keys(locCot.loc).length;

  return (
    <div className="mt-4">
      {/* UI redesign (phan hoi 2026-08-19): sub-tab "Mua hang/Cong no/Tra hang" + nut "+ Tao don" da
          bo khoi day - sub-tab gio la 3 tab THAT o thanh tab tren cung (xem DatMuaLinhKienModule.tsx,
          xemLoaiDon truyen xuong qua prop), "+ Tao don" trung chuc nang voi "Buoc 0 - Tao don" da co
          san tren pipeline (canCreateDon/onCreateDon, luon hien moi tab). Toan bo bo loc con lai (tim
          kiem/trang thai/nguoi tao-ngay/nguoi nhan hang) gom CHUNG 1 nut thu gon/mo rong duy nhat -
          muc tieu "ngay sau tab tren cung la den bang danh sach", khong con hang loc chiem san dien
          tich khi chua can dung den. */}
      {/* FIX (ra soat UI 2026-08-27, hang muc #3 dot 2, "Trạng thái đang filter chuyển lên cùng dòng
          với nút filter"): ActiveFiltersBar gop VAO CHUNG hang voi nut "Bộ lọc"/o tim kiem (truoc day
          nam rieng 1 hang duoi) - flex-wrap cua hang ngoai tu xuong dong khi khong du cho (man hep),
          ActiveFiltersBar tu return null khi khong co bo loc nao dang bat nen khong chiem cho thua. */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Btn size="sm" variant="ghost" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? t("▲ Ẩn bộ lọc") : `☰ ${t("Bộ lọc")}${activeFilterCount > 0 ? ` (${activeFilterCount})` : ""} ▾`}
        </Btn>
        <Btn size="sm" variant="ghost" onClick={handleDownloadFullList} disabled={downloadingFull}>
          {downloadingFull ? t("Đang tải...") : t("⬇ Tải danh sách chi tiết")}
        </Btn>
        {/* FIX (phan hoi 2026-08-28: "'Đang lọc: (còn tồn X)' chuyển lên cùng dòng với nút bộ lọc") -
            dat NGAY SAU nut "Bộ lọc", TRUOC o tim kiem (rong co dinh w-64) - tren man hep, flex-wrap uu
            tien giu cac phan tu DAU hang o line 1, o tim kiem la phan tu it uu tien nhat nen se tu wrap
            xuong duoi truoc thay vi day chip loc xuong cung no nhu truoc day. */}
        <ActiveFiltersBar
          chips={[
            ...(filterTrangThai
              ? [{ label: trangThaiLabel(trangThaiOptions, filterTrangThai), onClear: () => setFilterTrangThai("") }]
              : []),
            ...(filterNguoiTao ? [{ label: t("Người tạo đã lọc"), onClear: () => setFilterNguoiTao("") }] : []),
            ...(filterNguoiNhanHang ? [{ label: t("Người nhận hàng đã lọc"), onClear: () => setFilterNguoiNhanHang("") }] : []),
            ...(khuVucParam
              ? [{ label: t("Khu vực: {a}", { a: [...filterKhuVuc].map((ma) => khuVucOptions.find((o) => o.value === ma)?.label ?? ma).join(", ") }), onClear: () => setFilterKhuVuc(new Set()) }]
              : []),
            ...(filterTuNgay ? [{ label: t("Từ ngày {a}", { a: filterTuNgay }), onClear: () => setFilterTuNgay("") }] : []),
            ...(filterDenNgay ? [{ label: t("Đến ngày {a}", { a: filterDenNgay }), onClear: () => setFilterDenNgay("") }] : []),
            ...(filterQ ? [{ label: t("Tìm: \"{a}\"", { a: filterQ }), onClear: () => setFilterQ("") }] : []),
          ]}
        />
        <span className="relative inline-flex items-center">
          <input
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            placeholder={t("Tìm theo mã LK, mã đơn, mã YCSC, mã Lada, mã phiếu/mã đơn hàng/mã MISA, tên KTV…")}
            className="focus-ring bg-[var(--surface-100)] border border-[var(--line)] rounded-lg pl-2.5 pr-7 py-1.5 text-sm w-64"
          />
          {/* FIX (ra soat UI 2026-08-27, hang muc #3): placeholder cu liet ke du 6 tieu chi, qua dai so
              voi be rong o input - rut gon con vai tu khoa chinh, chuyen phan liet ke DAY DU sang
              tooltip (dung lai component Tooltip da chot 2026-08-25 cho dung tinh huong nay). */}
          <span className="absolute right-1.5">
            <Tooltip text={t("Tìm theo: mã LK, tên LK, mã đơn, người tạo, người nhận, mã yêu cầu sự cố.")} />
          </span>
        </span>
      </div>
      {showFilters && (
        // SUA (phan hoi 2026-09-12: "chuyển tất cả các nút filter lên cùng dòng") - dong bo voi
        // FilterSearchBar (SharedUi.tsx): flex-col -> flex-wrap, cac khoi loc nam CHUNG 1 hang khi du
        // cho, tu xuong dong khi man hep thay vi luon xep thanh 1 cot doc.
        <div className="mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-xl p-3 flex flex-wrap items-start gap-3">
          {/* SUA (2026-08-27, phan hoi "tab trả hàng filter không có gì hiện"): truoc day dong
              tra_hang bi AN HAN bo loc trang thai vi options cua DON_CUA_TOI_TRANG_THAI_OPTIONS khong
              khop trang thai cua tra_hang_log, khien khoi loc mo rong hien RONG (chi con o tim kiem o
              ngoai) - gio doi SANG BO OPTIONS KHAC (TRA_HANG_TRANG_THAI_OPTIONS) thay vi an han, danh
              sach trang thai van dung dung tra_hang_log qua trang_thai_hien_tai (xem GET /don-hang). */}
          <TrangThaiDropdownFilter
            value={filterTrangThai}
            onChange={setFilterTrangThai}
            options={trangThaiOptions}
            counts={donHangStatusCountsData?.counts}
          />
          {/* Bo loc Khu vuc (them 2026-08-27) - chi GS/TN/Kho/Ke toan (showKhuVucFilter), chi hien khi
              he thong da co >=1 Khu vuc de chon (khuVucOptions rong o he moi tinh chua cau hinh gi). */}
          {/* SUA BUG GIAO DIEN (phan hoi 2026-09-12): bo the <div> nhan "Khu vực" rieng ben ngoai (gay
              lech chieu cao so voi cac o loc khac cung hang flex-wrap) - nhan da gop vao THANG nut
              trigger cua KhuVucChipFilter (xem triggerLabel trong SharedUi.tsx). */}
          {showKhuVucFilter && khuVucOptions.length > 0 && <KhuVucChipFilter value={filterKhuVuc} onChange={setFilterKhuVuc} options={khuVucOptions} />}
          {(canBulkTram || (showKhuVucFilter && (nguoiNhanHangData?.rows.length ?? 0) > 0)) && (
            <div className="flex gap-2 flex-wrap items-center">
              {canBulkTram && (
                <div
                  className="flex items-center gap-2 flex-wrap"
                  title={t("Lọc theo Vệ tinh + khoảng ngày tạo đơn (dành cho Trạm xem đơn của Vệ tinh mình quản lý)")}
                >
                  <Select
                    value={filterNguoiTao}
                    onChange={setFilterNguoiTao}
                    options={nguoiTaoOptions}
                  />
                  <span className="text-xs text-[var(--ink-500)]">{t("Từ ngày")}</span>
                  <input
                    type="date"
                    value={filterTuNgay}
                    onChange={(e) => setFilterTuNgay(e.target.value)}
                    className="focus-ring bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <span className="text-xs text-[var(--ink-500)]">{t("Đến ngày")}</span>
                  <input
                    type="date"
                    value={filterDenNgay}
                    onChange={(e) => setFilterDenNgay(e.target.value)}
                    className="focus-ring bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
              )}
              {showKhuVucFilter && (nguoiNhanHangData?.rows.length ?? 0) > 0 && (
                <Select
                  value={filterNguoiNhanHang}
                  onChange={setFilterNguoiNhanHang}
                  options={[
                    { value: "", label: t("Tất cả KTV (người nhận hàng)") },
                    ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: ktvOptionLabel(r, nguoiNhanHangData?.rows ?? []) })),
                  ]}
                />
              )}
            </div>
          )}
          {/* FIX (ra soat UI 2026-08-27, hang muc #2 dot 2): "⚙ Tuỳ chỉnh cột" chuyen vao day (mac
              dinh an theo showFilters, truoc day 1 hang rieng luon hien tren dau danh sach - it dung
              nen khong dang chiem cho co dinh). O trong (div ref) la dich Portal - DonHangGroupedList
              tu render nut/panel that su vao day, xem prop columnSettingsSlot truyen xuong duoi. */}
          {/* Mobile (2026-09-29, phan hoi "lọc cột trên bản mobile cho gọn vào trong bộ lọc"): toan bo chip loc cot nam
              TRONG bang Bo loc thay vi 1 hang chip luon hien tren danh sach; ngoai bang chi con chip cot DANG loc. */}
          <div className="w-full sm:hidden">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">{t("Lọc theo cột")}</div>
            <LocCotBar cfg={locCotCfg} cots={Object.keys(locCotCfg.tieuDe)} hienTatCa nhan={null} />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">{t("Cột hiển thị")}</div>
            <div ref={setColumnSettingsSlot} />
          </div>
        </div>
      )}
      {/* CHOT #17: doi cau chu ro pham vi ap dung - truoc day "...tren trang nay" de hieu nham la chi
          ap dung cho 1 nhom KTV dang nhin thay gan checkbox nay, trong khi thuc te DonHangGroupedList
          gom nhieu nhom KTV/trang khac nhau va "Chon tat ca" ap dung xuyen suot MOI nhom. */}
      {/* FIX (ra soat UI 2026-08-27, hang muc #4): an khi chi co 0-1 dong co the chon - "Chon tat ca"
          vo nghia khi khong co gi ngoai 1 dong de chon gop, chi chiem cho vo ich. */}
      {(canActAsTram || canTacNghiep) && rowsCoTheChon.length > 1 && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <input type="checkbox" checked={rowsCoTheChon.length > 0 && selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />
          {/* Phan hoi 2026-08-19: mo rong bulk cho dong "Cho TN duyet" - danh sach chon co the gom
              CA dong Tram lan TN (vd Admin xem duoc ca 2) nen doi cau chu chung, khong con gia dinh
              chi co "cho Tram duyet". */}
          <span className="text-[var(--ink-500)]">{t("Chọn tất cả {a} dòng có thể xử lý (trên mọi nhóm KTV ở trang này)", { a: rowsCoTheChon.length })}</span>
        </div>
      )}
      {/* Toolbar hang loat (concept 1 "Structured Neutral" - pattern .bulkbar): nen indigo nhat, vien
          indigo mo, chu indigo dam - thay cho khoi surface-100 trung mau voi cac panel loc khac truoc
          day, giup phan biet ro day la thanh HANH DONG (dang co dong duoc chon) chu khong phai bo loc. */}
      {(canActAsTram || canTacNghiep) && selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 bg-[var(--ocean-100)] border border-[var(--ocean-400)] text-[var(--ocean-900)] rounded-lg px-3 py-2 text-[12.5px]">
          <span><b className="font-extrabold">{selected.size}</b> {t("đơn được chọn")}{tongTienDaChon > 0 && <> · <Money>{fmtVND(tongTienDaChon)}</Money></>}</span>
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <BulkConfirmButton
              label={t("Duyệt tất cả")}
              confirmLabel={t("Xác nhận duyệt {a} dòng?", { a: selected.size })}
              count={selected.size}
              onConfirm={() => bulkMutation.mutate({ ids: [...selected], hanh_dong: "duyet" })}
              disabled={bulkMutation.isPending}
              loading={bulkMutation.isPending}
            />
            {/* FIX (phan hoi 2026-08-25, hang muc #19): nhanh Tram (!canTacNghiep) truoc day bam la
                tu choi NGAY khong qua modal nao - backend nay bat buoc ghi_chu nen phai qua cung
                modal "tu_choi"/"bulk" (them o nut chua goi setActionTarget) de nhap ly do truoc. */}
            <Btn size="sm" variant="danger" onClick={() => setActionTarget({ id: "bulk", action: "tu_choi" })} disabled={bulkMutation.isPending}>
              {t("Từ chối tất cả")}
            </Btn>
          </div>
        </div>
      )}
      {/* Phan hoi 2026-08-19: "hien popup len de chon, chu khong phai hien 1 lua chon nho ben duoi
          nhu hien tai, rat kho thao tac" - doi tu khoi Select nho nhet trong thanh "Da chon N dong"
          sang Modal that su, giu dung logic/mutation cu (confirmTuChoiChe), chi doi lop hien thi. */}
      {(() => {
        const bulkIds = [...selected];
        const bulkCoDongTram = bulkIds.some((i) => pageRows.find((r) => r.id === i)?.trang_thai === "Cho Tram duyet");
        const bulkCoDongTN = bulkIds.some((i) => pageRows.find((r) => r.id === i)?.trang_thai === "Cho TN duyet");
        const bulkCoDongTra = bulkIds.some((i) => { const r = pageRows.find((x) => x.id === i); return !!r && laTraHangChoTn(r); });
        return (
          <Modal
            open={actionTarget?.id === "bulk" && actionTarget.action === "tu_choi"}
            onClose={() => { setActionTarget(null); setBulkLyDoChamId(""); setActionGhiChu(""); }}
            title={t("Từ chối {a} dòng đã chọn", { a: selected.size })}
          >
            <div className="space-y-3">
              {(bulkCoDongTN || bulkCoDongTra) && (
                <Select
                  value={bulkLyDoChamId}
                  onChange={setBulkLyDoChamId}
                  options={[{ value: "", label: bulkCoDongTN ? t("-- Chọn lý do chậm --") : t("-- Lý do chậm (chỉ khi quá hạn 24h) --") }, ...(bulkLyDoData?.rows ?? []).map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                  className="w-full"
                />
              )}
              {/* Hang muc #19 (2026-08-25): dong "Cho Tram duyet" trong lua chon bat buoc ghi_chu rieng
                  (backend khong con nhan tuy chon). O luon o day de phuc vu ca truong hop chon lan
                  ca 2 loai dong (Admin dong thoi xem duoc ca Tram lan TN). */}
              {(bulkCoDongTram || bulkCoDongTra) && (
                <div>
                  <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">
                    {bulkCoDongTram ? t("Lý do từ chối cho các dòng đang chờ Trạm duyệt / đơn trả hàng (bắt buộc)") : t("Lý do từ chối đơn trả hàng (bắt buộc)")}
                  </label>
                  <input
                    value={actionGhiChu}
                    onChange={(e) => setActionGhiChu(e.target.value)}
                    placeholder={t("Lý do từ chối (bắt buộc)")}
                    className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
              )}
              {bulkCoDongTN && (
                <div className="text-xs text-[var(--ink-500)]">
                  {t("Lý do chậm chỉ áp dụng cho các dòng đang chờ tác nghiệp (TN) xử lý trong lựa chọn.")}
                </div>
              )}
              {bulkCoDongTN && !bulkCoDongTram && !bulkCoDongTra && (
                <input
                  value={actionGhiChu}
                  onChange={(e) => setActionGhiChu(e.target.value)}
                  placeholder={t("Ghi chú thêm (tuỳ chọn)")}
                  className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
              )}
              <div className="flex justify-end gap-2">
                <Btn variant="ghost" onClick={() => { setActionTarget(null); setBulkLyDoChamId(""); setActionGhiChu(""); }}>{t("Huỷ")}</Btn>
                <Btn
                  variant="danger"
                  onClick={confirmTuChoiChe}
                  disabled={(bulkCoDongTN && !bulkLyDoChamId) || ((bulkCoDongTram || bulkCoDongTra) && !actionGhiChu.trim()) || bulkMutation.isPending}
                >
                  {t("Xác nhận từ chối")}
                </Btn>
              </div>
            </div>
          </Modal>
        );
      })()}
      {/* Chi cac cot DANG loc/sap xep (ca mobile lan desktop) - danh sach day du: desktop o tieu de cot, mobile trong "Bộ lọc". */}
      <LocCotBar cfg={locCotCfg} cots={Object.keys(locCotCfg.tieuDe)} hienTatCa={false} />
      <DonHangGroupedList
        locCot={locCotCfg}
        rows={pageRows}
        isLoading={isLoading}
        isError={isError}
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onDetail={setDetailId}
        addToast={addToast}
        qc={qc}
        canTacNghiep={canTacNghiep}
        canTPDvbhXacNhan={canTPDvbhXacNhan}
        canActAsTram={canActAsTram}
        currentEmail={user?.email ?? ""}
        canXemChiTietCa={canXemChiTietCa}
        openCase={openCase}
        bulkMutation={bulkMutation}
        actionTarget={actionTarget}
        setActionTarget={setActionTarget}
        bulkLyDoChamId={bulkLyDoChamId}
        setBulkLyDoChamId={setBulkLyDoChamId}
        bulkLyDoData={bulkLyDoData}
        confirmTuChoiChe={confirmTuChoiChe}
        confirmDuyetQuaHan={confirmDuyetQuaHan}
        actionGhiChu={actionGhiChu}
        setActionGhiChu={setActionGhiChu}
        confirmHuyChe={confirmHuyChe}
        selected={selected}
        toggleSelectOne={toggleSelectOne}
        showCheckbox={canActAsTram || canTacNghiep}
        columnSettingsSlot={columnSettingsSlot}
      />
      {detailId && detailTraHang && (
        // Don tra hang con trong luong duyet rieng (vd "Cho TN duyet tong" hien o muc "Chờ tác nghiệp" cung don mua,
        // 2026-09-30) -> mo DUNG man duyet tra hang (nut Duyet/Tu choi theo tra_hang_log), khong phai chi tiet don mua.
        <TraHangDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          addToast={addToast}
          qc={qc}
          canXuLy={(tt) =>
            tt === "Cho TN duyet tong" ? canTacNghiep : tt === "Cho ke toan duyet mem" ? canKeToan : tt === "Cho kho xac nhan" ? canKho : false
          }
          canKeToan={canKeToan}
          canKho={canKho}
          currentEmail={user?.email ?? ""}
          isAdmin={isAdmin}
          onNavigate={setDetailId}
        />
      )}
      {detailId && !detailTraHang && (
        <DonHangDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          canTPDvbhXacNhan={canTPDvbhXacNhan}
          canActAsTram={canActAsTram}
          currentEmail={user?.email ?? ""}
          isAdmin={isAdmin}
          canXemChiTietCa={canXemChiTietCa}
          canKho={canKho}
          openCase={openCase}
          navRows={pageRows}
          onNavigate={setDetailId}
        />
      )}
    </div>
  );
}

// 1 dong don hang da tinh san actions/tone/rowStyle/chonDuoc (dung 1 lan cho ca desktop table VA
// dinh nghia cot "⚙ Tuy chinh cot", tranh tinh lai trong tung Column.render) - xem cols trong
// DonHangGroupedList.
// Co phu canh trang thai chinh (them 2026-09-26, bang danh sach khong con xep doc 4 badge lam cao dong) -
// thu tu = muc uu tien hien thi: "Không đủ công nợ" (canh bao tien) > "Quá hạn" > "Đơn tạo hộ" > "Đủ công
// nợ". Bang desktop chi hien co DAU TIEN + "+N" (tooltip liet ke du), dung quy tac MAX_BADGE cua the mobile.
function trangThaiFlags(d: DonHangRow): { tone: Tone; label: string }[] {
  return [
    ...(d.loai_don === "cong_no" && !laTruCongNo(d.loai_de_xuat) && d.danh_gia_cong_no === "Khong du" ? [{ tone: "danger" as Tone, label: t("Không đủ công nợ") }] : []),
    ...(d.qua_han_ly_do_cham ? [{ tone: "danger" as Tone, label: t("Quá hạn - cần lý do") }] : []),
    ...(isDonTaoHo(d) ? [{ tone: "neutral" as Tone, label: t("Đơn tạo hộ") }] : []),
    ...(d.loai_don === "cong_no" && !laTruCongNo(d.loai_de_xuat) && d.danh_gia_cong_no === "Du" ? [{ tone: "success" as Tone, label: t("Đủ công nợ") }] : []),
  ];
}

interface EnrichedRow {
  d: DonHangRow;
  actions: { duyet: boolean; tuChoi: boolean; choHang: boolean; huy: boolean };
  tone: { tone: Tone; label: string; border: string };
  rowStyle: string;
  chonDuoc: boolean;
}

export function DonHangGroupedList({
  rows,
  isLoading,
  isError,
  page,
  pageSize,
  total,
  onPageChange,
  onDetail,
  addToast,
  qc,
  canTacNghiep,
  canTPDvbhXacNhan,
  canActAsTram,
  currentEmail,
  canXemChiTietCa,
  openCase,
  bulkMutation,
  actionTarget,
  setActionTarget,
  bulkLyDoChamId,
  setBulkLyDoChamId,
  bulkLyDoData,
  confirmTuChoiChe,
  confirmDuyetQuaHan,
  actionGhiChu,
  setActionGhiChu,
  confirmHuyChe,
  selected,
  toggleSelectOne,
  showCheckbox,
  columnSettingsSlot,
  locCot,
}: {
  locCot?: LocCotCfg;
  rows: DonHangRow[];
  isLoading: boolean;
  isError: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onDetail: (id: string) => void;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean;
  canTPDvbhXacNhan: boolean;
  canActAsTram: boolean;
  currentEmail: string;
  canXemChiTietCa: boolean;
  openCase?: (id: string, tab?: string) => void;
  bulkMutation: ReturnType<typeof useMutation<{ results: Record<string, string> }, Error, { ids: string[]; hanh_dong: "duyet" | "tu_choi" | "huy"; ly_do_cham_id?: number; ghi_chu?: string }>>;
  actionTarget: ActionTarget | null;
  setActionTarget: (v: ActionTarget | null) => void;
  bulkLyDoChamId: string;
  setBulkLyDoChamId: (v: string) => void;
  bulkLyDoData: { rows: { id: number; ten_ly_do: string; quan_ly_don_thieu_linh_kien: number }[] } | undefined;
  confirmTuChoiChe: () => void;
  confirmDuyetQuaHan: () => void;
  actionGhiChu: string;
  setActionGhiChu: (v: string) => void;
  confirmHuyChe: () => void;
  selected: Set<string>;
  toggleSelectOne: (id: string) => void;
  showCheckbox: boolean;
  // Dich Portal cho nut/panel "⚙ Tuỳ chỉnh cột" (xem comment o DonCuaToiTab, cho goi component nay) -
  // null khi bang loc dang an (showFilters=false o component cha), portal tu khong render gi ca.
  columnSettingsSlot: HTMLDivElement | null;
}) {
  const ktvDisplayMap = useKtvDisplayMap();
  const personDir = usePersonDirectory();
  // Xem chi tiet linh kien (phan hoi 2026-08-19: "Click vào tên linh kiện sẽ mở UI xem thông tin chi
  // tiết của linh kiện đó") - tai dung LinhKienDetailModal da co san (LinhKienPicker.tsx, dung boi
  // TaoDonTab). danhMuc/rankMap can THEM o day vi component nay truoc gio khong doc danh muc (chi hien
  // snapshot ten/ma da luu san tren dong don hang).
  const { danhMuc } = useLkAndLdeCache(true);
  const rankMap = useLinhKienRankMap();
  // Tach 2 nhom Ly do cham theo quan_ly_don_thieu_linh_kien (xem comment actionsFor.choHang o
  // helpers.ts) - dung cho ca nut "Chờ hàng" rieng tren tung dong.
  const choHangReasons = (bulkLyDoData?.rows ?? []).filter((l) => l.quan_ly_don_thieu_linh_kien);
  const tuChoiReasons = (bulkLyDoData?.rows ?? []).filter((l) => !l.quan_ly_don_thieu_linh_kien);
  // TN "đẩy lại" don da huy / tu choi ve "Chờ TN duyệt" trong 24h ngay tren dong (chot 2026-10-05) - ghi chu tuy chon nhap o
  // chi tiet don; o day bam 1 lan la day lai (de thao tac lai: TN tu choi/huy lai don nhu thuong).
  const dayLaiMutation = useMutation({
    mutationFn: (donId: string) => api.post(`/dat-mua-lk/don-hang/${donId}/day-lai`, {}),
    onSuccess: (_r, donId) => {
      addToast(t("Đã đẩy lại đơn {a} về Chờ TN duyệt", { a: donId }));
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
      invalidatePipelineCounts(qc);
    },
    onError: (err) => addToast(t("Không đẩy lại được đơn: ") + describeApiError(err)),
  });
  const [detailLk, setDetailLk] = useState<string | null>(null);
  function openLkDetail(maLk: string) {
    if (danhMuc.some((m) => m.ma_linh_kien === maLk)) setDetailLk(maLk);
    else addToast(t("Không tìm thấy linh kiện này trong danh mục (có thể đã bị ẩn/xoá)"));
  }

  // Tuy chinh cot (them 2026-08-21, "hợp nhất phong cách giao diện" - Mua hang/Cong no truoc day la
  // MAN DUY NHAT khong co "⚙ Tuy chinh cot" trong khi Trả hàng/PXK/Thiếu LK/Danh mục LK deu co). Dung
  // lai CHINH useColumnConfig ma PaginatedTable dung (xem useColumnConfig.ts) - goi 1 LAN o day (CAP
  // TOAN BO danh sach, khong phai tung nhom KTV) vi moi nhom render 1 <table> RIENG (xem SUA LECH COT
  // ben duoi) nhung PHAI dung chung 1 cau hinh cot/do rong, khong the goi hook nay o trong moi nhom.
  // Mobile van GIU nguyen the doc rieng (khong doc effectiveColumns) - tuy chinh cot la khai niem cua
  // BANG desktop, the mobile da gon san khong can an bot truong.
  // Nut loc cot (Excel) canh tieu de - `cot` = ten cot loc o backend (DON_HANG_COT_LOC, datMuaLinhKien.ts).
  const loc = (cot: string) => (locCot ? <LocCotButton cfg={locCot} cot={cot} /> : undefined);
  const cols: Column<EnrichedRow>[] = [
    ...(showCheckbox
      ? [
          {
            key: "chon",
            header: "",
            render: (row: EnrichedRow) =>
              row.chonDuoc ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(row.d.id)} onChange={() => toggleSelectOne(row.d.id)} />
                </span>
              ) : null,
          } as Column<EnrichedRow>,
        ]
      : []),
    {
      key: "linh_kien",
      header: t("Linh kiện"),
      // SUA BUG GIAO DIEN (phan hoi 2026-09-12, kem anh chup ma LK lap 2 lan trong cung 1 dong don) -
      // truoc day hien ma_lk RIENG 1 dong tren, gay lap voi ten_lk_snapshot da TU chua san ma trong
      // chuoi - gop ve DUNG 1 dong bang formatLkLabel() (dong bo voi LinhKienPicker.tsx).
      render: (row) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openLkDetail(row.d.ma_lk); }}
          title={t("Xem chi tiết linh kiện")}
          className={`block w-full truncate text-left font-medium hover:underline hover:text-[var(--ocean-600)] ${row.rowStyle}`}
        >
          {row.d.uu_tien === 1 && <span title={t("Ưu tiên")} className="text-[var(--orange-600)] font-extrabold">⭐ </span>}
          {row.d.combo_ma && <span title={t("Đơn tách từ combo {a}", { a: row.d.combo_ma })}>🧩 </span>}
          {formatLkLabel(row.d.ma_lk, row.d.ten_lk_snapshot ?? row.d.ma_lk)}
          {!!row.d.dac_thu && <span title={t("Linh kiện đặc thù")}> 🔒</span>}
        </button>
      ),
    },
    // Trang thai / Phieu xuat kho / Chuyen tien dua len NGAY SAU "Linh kiện" (phan hoi 2026-10-03).
    {
      key: "trang_thai",
      header: t("Trạng thái"),
      filter: loc("trang_thai"),
      // SUA 2026-09-26 (phan hoi "danh sách đơn hàng bị kéo giãn"): truoc day xep DOC toi 4 badge (Chờ TN
      // duyệt / Quá hạn / Đơn tạo hộ / Đủ-Không đủ công nợ) lam dong cao gap 3-4 lan - gio 1 HANG: trang
      // thai chinh + co phu uu tien nhat (trangThaiFlags) + "+N" (tooltip liet ke du, Drawer chi tiet van
      // hien day du). Thong tin khong mat, chi gon lai.
      render: (row) => {
        const flags = trangThaiFlags(row.d);
        const rest = flags.slice(1);
        return (
          <div className="flex items-center gap-1 whitespace-nowrap">
            <StatusBadge value={row.d.trang_thai ?? ""} tones={DON_HANG_TRANG_THAI_TONE_ALL} options={DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL} />
            {flags[0] && <Badge tone={flags[0].tone}>{flags[0].label}</Badge>}
            {rest.length > 0 && (
              <span title={rest.map((f) => f.label).join(" · ")} className="rounded-[var(--radius-badge)] bg-[var(--color-neutral-soft)] px-1.5 py-[3px] text-[10.5px] font-semibold leading-none text-[var(--color-text-secondary)]">
                +{rest.length}
              </span>
            )}
          </div>
        );
      },
    },
    // Trang thai phieu xuat kho chua don + chuyen tien THEO DON (2026-09-29, phan hoi "bổ sung thêm cột trạng thái 'Phiếu
    // xuất kho'... vị trí phía sau trạng thái đơn" + "trạng thái chuyển tiền gắn với từng đơn") - backend suy tu PXK
    // (lib/trangThaiDonPxk.ts), loc cot o server.
    {
      key: "trang_thai_pxk",
      header: t("Phiếu xuất kho"),
      filter: loc("trang_thai_pxk"),
      render: (row) =>
        row.d.trang_thai_pxk ? (
          <StatusBadge value={row.d.trang_thai_pxk} tones={TRANG_THAI_PXK_DON_TONE} options={TRANG_THAI_PXK_DON_OPTIONS} />
        ) : (
          <span className="text-[var(--ink-400)]">—</span>
        ),
    },
    {
      key: "thanh_toan",
      header: t("Chuyển tiền"),
      filter: loc("thanh_toan"),
      render: (row) =>
        row.d.thanh_toan ? <StatusBadge value={row.d.thanh_toan} tones={THANH_TOAN_DON_TONE} options={THANH_TOAN_DON_OPTIONS} /> : <span className="text-[var(--ink-400)]">—</span>,
    },
    // Loai / Ghi chu nguoi dat hang / Ma YCSC / Ma Lada dua len NGAY SAU "Chuyển tiền" (phan hoi 2026-10-04).
    { key: "loai", header: t("Loại"), filter: loc("loai_de_xuat"), render: (row) => <LoaiDeXuatBadge loaiDon={row.d.loai_don} loaiDeXuat={row.d.loai_de_xuat} /> },
    { key: "ghi_chu", header: t("Ghi chú người đặt hàng"), render: (row) => row.d.ghi_chu || <span className="text-[var(--ink-400)]">—</span> },
    {
      key: "ma_ycsc",
      header: t("Mã yêu cầu sự cố"),
      render: (row) =>
        row.d.ma_yeu_cau_su_co ? (
          <span onClick={(e) => e.stopPropagation()}>
            <MaYcscCell value={row.d.ma_yeu_cau_su_co} canXemChiTietCa={canXemChiTietCa} openCase={openCase} />
          </span>
        ) : (
          <span className="text-[var(--ink-400)]">—</span>
        ),
    },
    {
      key: "ma_lada",
      header: t("Mã Lada"),
      render: (row) => (row.d.ma_lada ? <span className="font-mono">{row.d.ma_lada}</span> : <span className="text-[var(--ink-400)]">—</span>),
    },
    // SUA (phan hoi 2026-09-12: "sắp xếp các cột trong table danh sách đơn giống" file tham chiếu
    // AppSheet "ADMIN XUAT HANG MN v3" - doi ca THU TU LAN gop toan bo cot "Tuỳ chỉnh cột" (truoc day
    // an mac dinh) thanh cot chinh LUON hien, khop dung thu tu: Linh kien -> Ngay de xuat -> SL de
    // xuat -> SL thuc xuat -> Gia de xuat -> Loai don -> Yeu cau hoa don -> Trang thai duyet -> Nguoi
    // nhan hang -> Ly do tu choi/cho hang -> Khu vuc -> Ghi chu nguoi dat hang -> Ghi chu Admin ->
    // Nguoi tao yeu cau -> Ma yeu cau su co (2 cot UI-only "chon"/"hanh_dong" khong co trong file tham
    // chieu, giu nguyen vi tri dau/cuoi). "Cảnh báo linh kiện đặc thù"/"Đơn ưu tiên" GIU dang icon
    // 🔒/⭐ trong cot Linh kien (khong tach cot rieng, theo xac nhan nguoi dung).
    { key: "ngay_de_xuat", header: t("Ngày đề xuất"), render: (row) => fmtDate(row.d.ngay_tao) },
    // Tu ticket thieu hang GAN NHAT cua don (2026-09-30) - di chuot xem Kho tiep nhan luc nao, ai.
    {
      key: "ngay_du_kien_co_hang", header: t("Dự kiến có hàng"),
      render: (row) =>
        row.d.tlk_ngay_du_kien ? (
          <span
            className={row.d.trang_thai === "Cho hang" ? "font-semibold text-[var(--color-warning-strong)]" : "text-[var(--color-text-secondary)]"}
            title={
              (row.d.tlk_tiep_nhan_luc ? t("Kho tiếp nhận {a} · {b}", { a: fmtDateTime(row.d.tlk_tiep_nhan_luc), b: formatPersonDisplay(row.d.tlk_nguoi_tiep_nhan ?? "", personDir) }) : t("Kho chưa tiếp nhận")) +
              (row.d.tlk_ngay_hang_ve ? t(" · hàng về {a}", { a: fmtDate(row.d.tlk_ngay_hang_ve) }) : "")
            }
          >
            {fmtDate(row.d.tlk_ngay_du_kien)}
          </span>
        ) : (
          <span className="text-[var(--ink-400)]">—</span>
        ),
    },
    { key: "sl", header: t("SL đề xuất"), className: "text-right", render: (row) => row.d.so_luong_de_xuat },
    { key: "sl_thuc_xuat", header: t("SL thực xuất"), className: "text-right", render: (row) => row.d.so_luong_thuc_xuat ?? <span className="text-[var(--ink-400)]">—</span> },
    // "Giá niêm yết" (giá bán) canh "Giá đề xuất" = don gia SAU chiet khau (phan hoi 2026-09-28).
    { key: "gia_niem_yet", header: t("Giá niêm yết"), className: "text-right", render: (row) => (giaNiemYet(row.d) != null ? <Money>{fmtVND(giaNiemYet(row.d))}</Money> : "—") },
    { key: "gia", header: t("Giá đề xuất"), className: "text-right", render: (row) => (donGiaSauChietKhau(row.d) != null ? <span className="text-[var(--green-700)] font-semibold" title={t("Đơn giá sau chiết khấu (giá thực cần chuyển tiền)")}><Money>{fmtVND(donGiaSauChietKhau(row.d))}</Money></span> : "—") },
    // Loai chiet khau (2026-09-26) - he thong gan luc tao PXK, TN sua o chi tiet don/chi tiet PXK.
    {
      key: "loai_chiet_khau",
      header: t("Loại chiết khấu"),
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <LoaiChietKhauText id={row.d.loai_chiet_khau_id} thuCong={row.d.loai_chiet_khau_thu_cong} />
          <HoaDonGiaNiemYet don={row.d} />
        </span>
      ),
    },
    { key: "yeu_cau_hoa_don", header: t("Yêu cầu hóa đơn"), filter: loc("yeu_cau_hoa_don"), render: (row) => row.d.yeu_cau_hoa_don || <span className="text-[var(--ink-400)]">—</span> },
    { key: "nguoi_nhan_hang", header: t("Người nhận hàng"), filter: loc("nguoi_nhan_hang"), render: (row) => (row.d.nguoi_nhan_hang ? <NguoiNhan>{formatNguoiDisplay(row.d.nguoi_nhan_hang, ktvDisplayMap)}</NguoiNhan> : <span className="text-[var(--ink-400)]">—</span>) },
    { key: "ly_do_cham", header: t("Lý do từ chối/chờ hàng"), render: (row) => row.d.ly_do_cham || <span className="text-[var(--ink-400)]">—</span> },
    // "Khu vực" cua NGUOI NHAN HANG (khong phai cot that tren dat_don_hang - server LEFT JOIN qua
    // ktv_lien_he.khu_vuc_ma, xem GET /don-hang + DonHangRow.khu_vuc_ten trong types.ts).
    { key: "khu_vuc", header: t("Khu vực"), filter: loc("khu_vuc"), render: (row) => row.d.khu_vuc_ten || <span className="text-[var(--ink-400)]">—</span> },
    // "Ghi chú Admin" - xem giai thich mapping (dong dat_don_hang_log MOI NHAT) o comment tren
    // DonHangRow.ghi_chu_xu_ly_gan_nhat trong types.ts.
    { key: "ghi_chu_admin", header: t("Ghi chú Admin"), render: (row) => row.d.ghi_chu_xu_ly_gan_nhat || <span className="text-[var(--ink-400)]">—</span> },
    { key: "nguoi_tao_yc", header: t("Người tạo yêu cầu"), filter: loc("nguoi_tao"), render: (row) => <NguoiTao>{formatNguoiDisplay(row.d.nguoi_tao, ktvDisplayMap)}</NguoiTao> },
    {
      key: "hanh_dong",
      header: "",
      mobileHint: "actions",
      render: (row) => (
        <div className="flex gap-1 flex-nowrap" onClick={(e) => e.stopPropagation()}>
          {row.actions.duyet && (
            <Btn
              size="sm"
              variant="ghost"
              className="px-2"
              title={t("Duyệt")}
              aria-label={t("Duyệt")}
              onClick={() =>
                isCongNoTaoHo(row.d)
                  ? setActionTarget({ id: row.d.id, action: "duyet_tao_ho" })
                  : row.d.qua_han_ly_do_cham
                    ? setActionTarget({ id: row.d.id, action: "duyet_qua_han" })
                    : bulkMutation.mutate({ ids: [row.d.id], hanh_dong: "duyet" })
              }
              disabled={bulkMutation.isPending}
            >
              ✓
            </Btn>
          )}
          {row.actions.choHang && (
            <Btn size="sm" variant="ghost" className="px-2" title={t("Chờ hàng||nút")} aria-label={t("Chờ hàng||nút")} onClick={() => setActionTarget({ id: row.d.id, action: "cho_hang" })} disabled={bulkMutation.isPending}>
              ⏳
            </Btn>
          )}
          {row.actions.tuChoi && (
            <Btn
              size="sm"
              variant="danger"
              className="px-2"
              title={t("Từ chối||nút")}
              aria-label={t("Từ chối||nút")}
              onClick={() => setActionTarget({ id: row.d.id, action: "tu_choi" })}
              disabled={bulkMutation.isPending}
            >
              ✕
            </Btn>
          )}
{dayLaiDuoc(row.d, canTacNghiep) && (
            <Btn
              size="sm"
              variant="ghost"
              className="px-2"
              title={t("Đẩy lại về Chờ TN duyệt (được đến {a})", { a: fmtDateTime(row.d.day_lai_han) })}
              aria-label={t("Đẩy lại về Chờ TN duyệt")}
              onClick={() => dayLaiMutation.mutate(row.d.id)}
              disabled={dayLaiMutation.isPending}
            >
              ↩
            </Btn>
          )}
          {/* FIX (phan hoi 2026-09-05: "nút hủy đơn của tất cả các giao diện đều bỏ ở màn hình ngoài,
              chỉ hiện ở màn hình UI chi tiết để tránh bấm nhầm") - nut "Hủy" (row.actions.huy) truoc day
              hien CA o day (danh sach ngoai) LAN trong DonHangDetailModal - bo han o day, chi giu lai
              trong Modal chi tiet (setActionTarget/actions.huy o dong ~553) de tranh bam nham tren
              danh sach. Duyet/Cho hang/Tu choi VAN giu nguyen o day (khong doi). */}
        </div>
      ),
    },
  ];
  // Cot tuy chon (Phase 2 StageMenu, them 2026-09-11, phan hoi "man hình chỉ có sẵn vài cột, cần thêm
  // lựa chọn ẩn/hiện giống các tab khác"). SUA (phan hoi 2026-09-12: "sắp xếp cột bảng danh sách đơn
  // giống" file tham chiếu, xac nhan "hiện sẵn tất cả" 5 cot truoc day o day - sl_thuc_xuat/
  // yeu_cau_hoa_don/ly_do_cham/ghi_chu/ghi_chu_admin) - da CHUYEN het 5 cot do sang `cols` chinh (luon
  // hien) de khop 100% file tham chiếu, chi con "Phân loại linh kiện" (khong co trong file tham chieu)
  // o day, van AN MAC DINH nhu truoc.
  const optionalCols: Column<EnrichedRow>[] = [
    { key: "phan_loai_lk", header: t("Phân loại linh kiện"), render: (row) => row.d.loai_de_xuat || <span className="text-[var(--ink-400)]">—</span> },
  ];
  const {
    effectiveColumns, toggleableColumns, resolvedOrder, colWidths,
    settingsOpen, setSettingsOpen, dragOverKey, setDragOverKey, draggedColKey,
    toggleColumn, handleColumnDrop, handleResizeStart,
  } = useColumnConfig(cols, optionalCols, [], "dmlk-don-hang-list-v4", "dmlk-don-hang-list-v2") /* -v4 (2026-10-04): Loai/Ghi chu/Ma YCSC/Ma Lada sau Chuyen tien - bo thu tu da luu cu */;

  // ===== Bo cuc cot bang desktop (SUA 2026-09-26, phan hoi "danh sách đơn hàng đang bị kéo giãn...
  // các nút bấm chuyển về góc trái, các cột không tự xuống dòng, dựa vào độ dài các ký tự thật") =====
  // Nguyen nhan cu (do tren trinh duyet): cot nut Duyệt/Chờ hàng/Từ chối nam CUOI, rong ~62px + flex-wrap
  // -> 3 nut xep DOC cao ~98px keo MOI dong len ~114px; khong o nao nowrap nen ten dai bi be 3-4 dong;
  // do rong da keo tay luu localStorage + overflow hidden cat cut so ("930.000(").
  // (1) Cot nut luon dung NGAY SAU checkbox (bat ke thu tu cot da luu - nguoi dung khong phai keo lai),
  //     an han neu khong dong nao co nut (vd KTV xem don cua minh).
  const actionCount = (d: DonHangRow) => {
    const a = actionsFor(d, { canTacNghiep, canTPDvbhXacNhan, canActAsTram, currentEmail });
    return (a.duyet ? 1 : 0) + (a.choHang ? 1 : 0) + (a.tuChoi ? 1 : 0) + (dayLaiDuoc(d, canTacNghiep) ? 1 : 0);
  };
  const maxActions = rows.reduce((m, d) => Math.max(m, actionCount(d)), 0);
  const actionCol = effectiveColumns.find((c) => c.key === "hanh_dong");
  const tableColumns = (() => {
    const rest = effectiveColumns.filter((c) => c.key !== "hanh_dong");
    if (!actionCol || maxActions === 0) return rest;
    const at = rest[0]?.key === "chon" ? 1 : 0;
    return [...rest.slice(0, at), actionCol, ...rest.slice(at)];
  })();
  // (2) Do rong tu tinh theo DO DAI CHU THAT cua dong dang hien (useAutoColumnWidths) - chuoi o day PHAI
  //     giong dinh dang render cua cot tuong ung. "max" = tran cho cot chu dai (vuot tran -> "…" + tooltip).
  const dash = "—";
  const { data: loaiChietKhauList } = useLoaiChietKhauList();
  const widthSpecs: Record<string, AutoWidthSpec<DonHangRow>> = {
    chon: { fixed: 40 },
    hanh_dong: { fixed: maxActions * 34 + Math.max(0, maxActions - 1) * 4 + 24 },
    linh_kien: { text: (d) => `${d.uu_tien === 1 ? "⭐ " : ""}${formatLkLabel(d.ma_lk, d.ten_lk_snapshot ?? d.ma_lk)}${d.dac_thu ? " 🔒" : ""}`, font: `500 12px "Plus Jakarta Sans", "Be Vietnam Pro", sans-serif`, min: 180, max: 340 },
    ngay_de_xuat: { text: (d) => fmtDate(d.ngay_tao) },
    sl: { text: (d) => String(d.so_luong_de_xuat) },
    sl_thuc_xuat: { text: (d) => (d.so_luong_thuc_xuat != null ? String(d.so_luong_thuc_xuat) : dash) },
    gia_niem_yet: { text: (d) => (giaNiemYet(d) != null ? fmtVND(giaNiemYet(d)) : dash) },
    gia: { text: (d) => (donGiaSauChietKhau(d) != null ? fmtVND(donGiaSauChietKhau(d)) : dash), font: `700 12px "Plus Jakarta Sans", "Be Vietnam Pro", sans-serif` },
    loai: { text: (d) => loaiDeXuatText(d.loai_don, d.loai_de_xuat), font: BADGE_FONT, extra: BADGE_PAD, max: 180 },
    loai_chiet_khau: {
      text: (d) =>
        (tenLoaiChietKhau(loaiChietKhauList, d.loai_chiet_khau_id) ?? dash) +
        (d.loai_chiet_khau_thu_cong ? " ✎" : "") +
        (coYeuCauHoaDon(d.yeu_cau_hoa_don) && d.gia_chot == null ? t("     HĐ · giá niêm yết") : ""), // chip HoaDonGiaNiemYet
      font: BADGE_FONT,
      extra: BADGE_PAD,
      max: 360,
    },
    yeu_cau_hoa_don: { text: (d) => d.yeu_cau_hoa_don || dash, max: 220 },
    trang_thai: {
      text: (d) => {
        const flags = trangThaiFlags(d);
        return [trangThaiLabel(DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, d.trang_thai ?? ""), ...(flags[0] ? [flags[0].label] : [])];
      },
      font: BADGE_FONT,
      // padding 2 badge + khe 4px + "+N" (~30px) khi co tu 2 co phu tro len
      extra: BADGE_PAD * 2 + 4 + 30,
      max: 300,
    },
    trang_thai_pxk: { text: (d) => (d.trang_thai_pxk ? trangThaiLabel(TRANG_THAI_PXK_DON_OPTIONS, d.trang_thai_pxk) : dash), font: BADGE_FONT, extra: BADGE_PAD },
    thanh_toan: { text: (d) => (d.thanh_toan ? trangThaiLabel(THANH_TOAN_DON_OPTIONS, d.thanh_toan) : dash), font: BADGE_FONT, extra: BADGE_PAD },
    nguoi_nhan_hang: { text: (d) => (d.nguoi_nhan_hang ? formatNguoiDisplay(d.nguoi_nhan_hang, ktvDisplayMap) : dash), max: 300 },
    ly_do_cham: { text: (d) => d.ly_do_cham || dash, max: 220 },
    khu_vuc: { text: (d) => d.khu_vuc_ten || dash, max: 150 },
    ghi_chu: { text: (d) => d.ghi_chu || dash, max: 220 },
    ghi_chu_admin: { text: (d) => d.ghi_chu_xu_ly_gan_nhat || dash, max: 220 },
    nguoi_tao_yc: { text: (d) => formatNguoiDisplay(d.nguoi_tao, ktvDisplayMap), max: 300 },
    ma_ycsc: { text: (d) => d.ma_yeu_cau_su_co || dash, font: MONO_FONT, max: 180 },
    ma_lada: { text: (d) => d.ma_lada || dash, font: MONO_FONT, max: 140 },
    phan_loai_lk: { text: (d) => d.loai_de_xuat || dash, max: 180 },
  };
  const autoWidths = useAutoColumnWidths(tableColumns, rows, widthSpecs);
  // Do rong nguoi dung TU KEO (luu localStorage khoa v2) van thang do rong tu tinh cua cot do.
  const colWidth = (key: string) => colWidths[key] ?? autoWidths[key] ?? 120;
  const tableWidth = tableColumns.reduce((sum, c) => sum + colWidth(c.key), 0);
  // Tooltip day du cho o co the bi cat "…" (cot co tran max).
  const cellTitle = (key: string, d: DonHangRow): string | undefined => {
    const spec = widthSpecs[key];
    if (!spec?.max || !spec.text || key === "trang_thai") return undefined;
    const txt = spec.text(d);
    return Array.isArray(txt) ? txt.join(" ") : txt;
  };
  const settingsButtonEl = (
    <ColumnSettingsButton
      toggleableColumns={toggleableColumns}
      resolvedOrder={resolvedOrder}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      toggleColumn={toggleColumn}
    />
  );

  if (isLoading) return <div className="text-sm text-[var(--ink-500)] py-6 text-center">{t("Đang tải...")}</div>;
  if (isError) return <div className="text-sm text-[var(--coral-500)] py-6 text-center">{t("Lỗi tải dữ liệu.")}</div>;
  if (rows.length === 0) return <div className="text-sm text-[var(--ink-400)] py-6 text-center">{t("Không có dữ liệu.")}</div>;

  const groups = new Map<string, DonHangRow[]>();
  for (const d of rows) {
    const key = d.nguoi_nhan_hang || d.nguoi_tao;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  // FIX (ra soat UI 2026-08-27, hang muc #1 dot 2, "chuyển cột tiêu đề chung lên trên cùng tạo thành
  // tiêu đề chung cho toàn bộ đơn hàng"): tinh san banner-stats + rowsEnriched cho MOI nhom 1 LAN
  // DUY NHAT (truoc day tinh lai ben trong closure cua tung nhom) - dung CHUNG cho ca 2 kieu hien thi
  // (bang desktop hop nhat + the mobile), tranh trung lap logic/tinh 2 lan.
  const groupEntries = [...groups.entries()].map(([nguoiNhan, dongCon]) => {
    // + 4 buoc duyet rieng cua don tra hang (hien chung o "Tổng"/"Chờ tác nghiệp" - 2026-09-30).
    const choDuyet = dongCon.filter((d) =>
      ["Cho Tram duyet", "Cho TBP xac nhan", "Cho TN duyet", "Cho ke toan duyet mem", "Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong"].includes(d.trang_thai ?? ""),
    ).length;
    const dongY = dongCon.filter((d) => d.trang_thai === "TN da duyet").length;
    const tuChoi = dongCon.filter((d) => d.trang_thai === "TN tu choi").length;
    const choHang = dongCon.filter((d) => d.trang_thai === "Cho hang").length;
    const tongTien = dongCon.reduce((s, d) => s + tienSauChietKhau(d), 0);
    const rowsEnriched: EnrichedRow[] = dongCon.map((d) => {
      const actions = actionsFor(d, { canTacNghiep, canTPDvbhXacNhan, canActAsTram, currentEmail });
      const tone = LOAI_DON_TONE[d.loai_don];
      const rowStyle = DON_HANG_ROW_STYLE[d.trang_thai ?? ""] ?? "";
      const chonDuoc = showCheckbox && (d.trang_thai === "Cho Tram duyet" || d.trang_thai === "Cho TN duyet" || laTraHangChoTn(d)) && (actions.duyet || actions.tuChoi);
      return { d, actions, tone, rowStyle, chonDuoc };
    });
    return { nguoiNhan, dongCon, choDuyet, dongY, tuChoi, choHang, tongTien, rowsEnriched };
  });

  return (
    <div className="space-y-2">
      {/* FIX (ra soat UI 2026-08-27, hang muc #2 dot 2): "⚙ Tuỳ chỉnh cột" rat it dung, khong con 1
          hang rieng luon hien - Portal vao o "Cột hiển thị" trong bang loc cua component cha (mac
          dinh AN theo showFilters, xem DonCuaToiTab). null khi bang loc dang dong -> khong render gi. */}
      {columnSettingsSlot && createPortal(settingsButtonEl, columnSettingsSlot)}
      {/* FIX (hang muc #3 dot 2, "chuyển cột tiêu đề chung lên trên cùng"): truoc day MOI nhom KTV la
          1 <table> doc lap kem <thead> rieng (lap lai header N lan). Gio GOP thanh 1 <table> DUY NHAT
          cho toan bo danh sach - 1 <thead> chung tren cung, <tbody> noi tiep tung nhom (1 hang banner
          <td colSpan> + cac hang du lieu). Cung 1 <table> nen trinh duyet TU CAN CHINH do rong cot
          khop tuyet doi giua cac nhom, khong con phu thuoc effectiveColumns/colWidths phai "giong het
          nhau" giua nhieu <table> rieng biet nhu truoc (rui ro lech neu 1 cot chua co colWidths
          explicit - kich thuoc tu dong theo NOI DUNG rieng cua tung table). */}
      <div className="hidden sm:block overflow-x-auto border-t border-[var(--line)]">
        {/* table-layout FIXED + tong do rong = tong cac cot (toi thieu bang khung): moi cot DUNG bang do
            rong da tinh, o dai hien "…" thay vi be dong hay day cot khac. */}
        <table className="tbl border-collapse" style={{ tableLayout: "fixed", width: tableWidth, minWidth: "100%" }}>
          <thead>
            {/* Khop dung header ".tbl th" concept 1 (chu hoa nho, xam, nen #FBFBFB) - dong
                bo voi header cua PaginatedTable.tsx (xem tr className tuong tu o do). */}
            <tr className="tbl-head">
              {tableColumns.map((col, idx) => (
                <ResizableHeaderCell
                  key={col.key}
                  col={col}
                  idx={idx}
                  isPinned={idx === 0}
                  width={colWidth(col.key)}
                  storageKey="dmlk-don-hang-list"
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
              <Fragment key={g.nguoiNhan}>
                {/* Hang banner nhom KTV (them 2026-08-27, thay cho div rieng ngoai bang truoc day) -
                    Phan hoi 2026-08-26: "tô màu cho top banner này khác hẳn màu nền bên dưới" - dung
                    --ocean-100 (mau nhan chinh, tu doi theo "Giao diện" ca nhan - xem theme/presets.ts). */}
                <tr className="bg-[var(--ocean-100)]">
                  <td colSpan={tableColumns.length} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 flex-wrap text-sm min-w-0">
                        <span className="font-bold text-[var(--ink-900)] text-sm truncate">
                          <NguoiNhan>{formatNguoiDisplay(g.nguoiNhan, ktvDisplayMap)}</NguoiNhan>
                        </span>
                        <span className="font-semibold text-[var(--green-700)] shrink-0"><Money>{fmtVND(g.tongTien)}</Money></span>
                      </div>
                      {/* Rut gon banner nhom (Phase 4 StageMenu, them 2026-09-11, phan hoi "banner nhóm
                          KTV đang quá nhiều badge rời rạc") - truoc day hien RIENG 4 badge (chờ duyệt/
                          đồng ý/từ chối/chờ hàng) cung luc, gio gop lai thanh 1 dong toi thieu "tên +
                          số lượng" giong HET logic da co san (va da xac nhan) o the mobile ben duoi. */}
                      {g.choDuyet + g.choHang > 0 ? (
                        <Badge tone="warning">{t("Chờ {a}/{b} đơn", { a: g.choDuyet + g.choHang, b: g.dongCon.length })}</Badge>
                      ) : (
                        <Badge tone="success">{t("Đã xong {a} đơn", { a: g.dongCon.length })}</Badge>
                      )}
                    </div>
                  </td>
                </tr>
                {/* SUA (phan hoi 2026-08-18): dong uu_tien noi bat HAN LEN thay vi mau tint
                    30% mo nhat truoc day (de lan voi hover:bg-slate-50) - nen dam mau + vien
                    bao quanh (ring-inset, khong dung border-l vi cham vien loai_don da chiem o
                    do). SUA (phan hoi 2026-08-19): doi tu amber sang teal - amber trung voi
                    loai_don "Cong no" (border-l-4 cung amber-500) khien nguoi dung nham dong
                    moi "tu dong uu tien" khi thuc ra chi la ke thua loai don Cong no. */}
                {/* SUA (phan hoi 2026-08-19: "danh sách chi tiết đang bị tự xuống dòng quá
                    rộng") - ca hang gio bam duoc (mo chi tiet don hang) - moi Column.render da
                    tu stopPropagation cho vung con onClick rieng (checkbox/ma YCSC/nut hanh
                    dong), xem dinh nghia cols o tren. */}
                {g.rowsEnriched.map((row) => (
                  <tr
                    key={row.d.id}
                    onClick={() => onDetail(row.d.id)}
                    className={`cursor-pointer transition-colors border-b border-[var(--line)] last:border-0 ${row.tone.border} border-l-4 ${
                      row.d.uu_tien === 1
                        ? "bg-[var(--orange-100)] ring-1 ring-inset ring-[var(--orange-500)] hover:brightness-95"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    {tableColumns.map((col) => {
                      const width = colWidth(col.key);
                      return (
                        <td
                          key={col.key}
                          title={cellTitle(col.key, row.d)}
                          style={{ width, maxWidth: width }}
                          className={`px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap ${col.className ?? ""}`}
                        >
                          {col.render(row)}
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
      {/* CHOT #6 (ra soat module "Dat Mua Linh Kien 2.0"): the doc rieng cho mobile (<640px) - truoc
          day moi nhom KTV la 1 bang 7-8 cot rieng phai cuon ngang, TN/GS xem hang chuc nhom phai cuon
          ngang lap lai N lan; the doc cuon DOC xuyen suot nhu moi danh sach khac trong app. Banner
          nhom VAN lap lai o day (khac desktop) - tren mobile nguoi dung cuon doc qua nhieu nhom, can
          moc "dang xem nhom nao" ngay truoc mat thay vi phai cuon nguoc len dau trang. */}
      <div className="sm:hidden space-y-2">
        {groupEntries.map((g) => (
          <div key={g.nguoiNhan} className="border border-[var(--line)] rounded-xl overflow-hidden">
            {/* RUT GON CARD NHOM (phan hoi 2026-08-27: "các thẻ card này đang quá rộng, gộp lại thành
                2 dòng") - dong 1 CHI ten (1 dong truncate, bo "tối đa 2 dòng" cu vi gio khong con chia
                se cho voi "N dòng"/tong tien nua); dong 2 gop "N dòng"+4 badge rieng (chờ duyệt/đồng
                ý/từ chối/chờ hàng) thanh 1 badge DUY NHAT "Chờ X/Y đơn" (X = con cho xu ly = chờ duyệt
                + chờ hàng, Y = tong so dong) doi voi tong tien canh phai - mat granularity dong y/tu
                choi rieng le, dung y don gian hoa da xac nhan. */}
            <div className="bg-[var(--ocean-100)] px-3 py-2">
              <div className="font-bold text-[var(--ink-900)] text-xs truncate"><NguoiNhan>{formatNguoiDisplay(g.nguoiNhan, ktvDisplayMap)}</NguoiNhan></div>
              <div className="flex items-center justify-between gap-2 mt-1">
                {g.choDuyet + g.choHang > 0 ? (
                  <Badge tone="warning">{t("Chờ {a}/{b} đơn", { a: g.choDuyet + g.choHang, b: g.dongCon.length })}</Badge>
                ) : (
                  <Badge tone="success">{t("Đã xong {a} đơn", { a: g.dongCon.length })}</Badge>
                )}
                <span className="font-semibold text-[var(--green-700)] text-sm shrink-0"><Money>{fmtVND(g.tongTien)}</Money></span>
              </div>
            </div>
            <div className="border-t border-[var(--line)] divide-y divide-[var(--line)]">
              {g.rowsEnriched.map(({ d, actions, tone, rowStyle, chonDuoc }) => {
                      // RUT GON THE MOBILE (2026-08-27, phan hoi "thẻ chi tiết linh kiện rút gọn lại
                      // tối đa 3 dòng... chuyển các card trạng thái lên góc trên bên phải... nếu hiện
                      // không hết thì hiện (N)... ấn vào chi tiết để xem đầy đủ"): bo dong ma LK rieng
                      // (chi con trong Drawer chi tiet, xem DonHangDetailModal), don CA badge loai don
                      // (tone.label) LAN StatusBadge LAN badge "Qua han" thanh 1 mang, chi hien toi da
                      // 2 cai + "+N" khi con lai - bam vao the (onClick co san o div ngoai) mo Drawer
                      // xem du. Nut hanh dong (✓/⏳/✕/🚫) giu nguyen, KHONG tinh vao "3 dong" (hang
                      // thao tac rieng, theo dung xac nhan cua nguoi dung qua AskUserQuestion).
                      const badges: { tone: Tone; label: string; dot?: boolean }[] = [
                        // FIX (phan hoi 2026-09-04: "đặt đơn công nợ vượt trần nhưng không thấy cảnh
                        // báo") - dat LEN DAU MANG (uu tien cao nhat) vi MAX_BADGE=1 phia duoi CHI hien
                        // badges[0], badge canh bao nay se bi "+N" nuot mat neu de sau cac badge khac.
                        ...(d.loai_don === "cong_no" && !laTruCongNo(d.loai_de_xuat) && d.danh_gia_cong_no === "Khong du" ? [{ tone: "danger" as Tone, label: t("Không đủ công nợ") }] : []),
                        // SUA (phan hoi 2026-09-05: "thẻ Trạng thái ưu tiên hiện đầu tiên thay vì loại đề
                        // xuất (mua hàng, công nợ...) - giao diện mobile") - dao Trang thai LEN TRUOC loai
                        // don, vi MAX_BADGE=1 phia duoi CHI hien badges[0] (tru truong hop canh bao cong no
                        // o tren van uu tien tuyet doi, khong doi).
                        { tone: DON_HANG_TRANG_THAI_TONE_ALL[d.trang_thai ?? ""] ?? "neutral", label: trangThaiLabel(DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, d.trang_thai ?? "") },
                        { tone: tone.tone, label: loaiDeXuatText(d.loai_don, d.loai_de_xuat), dot: false },
                        ...(d.qua_han_ly_do_cham ? [{ tone: "danger" as Tone, label: t("Quá hạn") }] : []),
                        // "Đơn tạo hộ" (yeu cau nguoi dung 2026-08-27) - xem giai thich day du o KvRow
                        // "Trạng thái" cua Drawer chi tiet phia tren (isDonTaoHo, helpers.ts).
                        ...(isDonTaoHo(d) ? [{ tone: "neutral" as Tone, label: t("Đơn tạo hộ") }] : []),
                        ...(d.loai_don === "cong_no" && !laTruCongNo(d.loai_de_xuat) && d.danh_gia_cong_no === "Du" ? [{ tone: "success" as Tone, label: t("Đủ công nợ") }] : []),
                      ];
                      // SUA (phan hoi 2026-08-28: "dòng 1 60% diện tích cho tên linh kiện, 40% còn lại
                      // cho card trạng thái, không đủ thì ẩn bớt và hiện (N)") - giam tu 3 xuong 1 de
                      // thuc su vua trong ~40% chieu rong 1 the mobile TREN DUNG 1 DONG (khong do JS do
                      // be rong that de quyet dinh - phoi hop voi flex-[3]/flex-[2] o JSX ben duoi, 60/
                      // 40) - 2 badge tro len (vd "Công nợ" + "Chờ TN duyệt") van thuong khong vua 1
                      // dong 40% rong tren man 375px (phan hoi 2026-08-28 lan 2: "ẩn cả thẻ nếu không
                      // đủ diện tích, KHÔNG xuống dòng") - chi hien badge DAU TIEN (uu tien nhat), badge
                      // con lai gop vao "+N" thay vi xuong dong 2 nhu ban thu truoc.
                      const MAX_BADGE = 1;
                      const shownBadges = badges.slice(0, MAX_BADGE);
                      const extraBadgeCount = badges.length - shownBadges.length;
                      return (
                      <div
                        key={d.id}
                        onClick={() => onDetail(d.id)}
                        className={`cursor-pointer px-3 py-2.5 ${tone.border} border-l-4 ${
                          d.uu_tien === 1
                            ? "bg-[var(--orange-100)] ring-1 ring-inset ring-[var(--orange-500)] active:brightness-95"
                            : "active:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {chonDuoc && (
                            <input
                              type="checkbox"
                              className="mt-1 shrink-0"
                              checked={selected.has(d.id)}
                              onChange={() => toggleSelectOne(d.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            {/* Dong 1: ten LK (trai, ~60% rong, 1 dong truncate) + cum badge trang thai
                                (phai, ~40% rong toi da) - SUA (phan hoi 2026-08-28: "60% tên linh
                                kiện, 40% card trạng thái, không đủ thì ẩn bớt và hiện (N)"): truoc day
                                ten dung flex-1 (chi la "phan con lai") + badge dung shrink-0 (LUON du
                                cho, co the lan at ten neu badge dai) - doi lai thanh flex-[3]/flex-[2]
                                RO RANG de ten LUON co toi thieu ~60%, cum badge bi ep toi da ~40% that
                                su (overflow-hidden + MAX_BADGE=2 phoi hop nhau tranh badge bi cat dut
                                giua chung). */}
                            <div className="flex items-start gap-2">
                              {/* FIX (phan hoi 2026-08-28: "click vào vùng không có chữ không mở UI chi
                                  tiết, bắt buộc phải click vùng có chữ") - truoc day <button> ten LK
                                  dat flex-[3] TRUC TIEP nen vung bam cua no LUON rong het 60% cot (flex-
                                  basis:0% khong co "shrink-to-fit" theo noi dung), du ten ngan cung
                                  chiem het khoang trong ben phai - bam vao khoang trong "khong chu" do
                                  bi <button> nay nuot (stopPropagation, mo chi tiet LINH KIEN) thay vi
                                  lot qua the de mo chi tiet DON HANG nhu mong doi. Sua: bao button trong
                                  1 div flex-[3] (giu ty le 60%), rieng <button> doi sang inline-block +
                                  max-w-full de tu CO LAI dung do rong noi dung that su - khoang trong
                                  con lai trong div bao (khong co onClick) se lot qua cho the ben ngoai. */}
                              <div className="min-w-0 flex-[3]">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openLkDetail(d.ma_lk); }}
                                  title={t("Xem chi tiết linh kiện")}
                                  className={`inline-block align-top max-w-full min-w-0 truncate text-left font-medium text-sm hover:underline hover:text-[var(--ocean-600)] ${rowStyle}`}
                                >
                                  {d.uu_tien === 1 && <span title={t("Ưu tiên")} className="text-[var(--orange-600)] font-extrabold">⭐ </span>}
                                  {d.combo_ma && <span title={t("Đơn tách từ combo {a}", { a: d.combo_ma })}>🧩 </span>}
                                  {d.ten_lk_snapshot ?? d.ma_lk}
                                  {!!d.dac_thu && <span title={t("Linh kiện đặc thù")}> 🔒</span>}
                                </button>
                              </div>
                              {/* SUA (phan hoi 2026-08-28, lan 2: "ẩn cả thẻ nếu không đủ diện tích,
                                  không xuống dòng") - quay lai 1 dong DUY NHAT (overflow-hidden, khong
                                  con flex-wrap) - Badge component gio da shrink-0/whitespace-nowrap nen
                                  it nhat KHONG con tu vo chu ben trong nhu bug cu; MAX_BADGE=1 o tren
                                  dam bao badge con lai luon gop vao "+N" thay vi day xuong dong 2. */}
                              <div className="flex-[2] flex items-center justify-end gap-1 min-w-0 overflow-hidden">
                                {shownBadges.map((b, i) => (
                                  <Badge key={i} tone={b.tone} dot={b.dot}>{b.label}</Badge>
                                ))}
                                {extraBadgeCount > 0 && (
                                  <span
                                    title={t("Xem đầy đủ trạng thái trong chi tiết")}
                                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--ink-500)] text-white text-[10px] font-bold leading-none shrink-0"
                                  >
                                    +{extraBadgeCount}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Dong 2 (phan hoi 2026-08-27: gop "SL/gia" + "mã YCSC" + "TT khách hàng"
                                thanh 1 DONG DUY NHAT thay vi 2 dong rieng truoc day) - "(mã YCSC) TT
                                khách hàng    SL:x · giá", mã YCSC giu rieng vung stopPropagation (van
                                bam mo popup case duoc, xem MaYcscCell) con SL/gia van cho bam xuyen
                                qua the de mo Drawer nhu binh thuong. */}
                            <div className="flex items-center gap-1.5 text-xs text-[var(--ink-500)] mt-1">
                              {d.ma_yeu_cau_su_co?.trim() && (
                                // SUA (phan hoi 2026-08-28: "mã (123456) => ID: 123456") - doi dang tu
                                // dau ngoac (de lan voi text thuong) sang tien to "ID:" ro rang hon.
                                <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                  ID: <MaYcscCell value={d.ma_yeu_cau_su_co} canXemChiTietCa={canXemChiTietCa} openCase={openCase} />
                                </span>
                              )}
                              {d.ma_lada?.trim() && <span className="shrink-0 font-mono">Lada: {d.ma_lada}</span>}
                              {d.tt_khach_hang?.trim() && <span className="truncate min-w-0">{d.tt_khach_hang.trim()}</span>}
                              <span className="shrink-0 ml-auto whitespace-nowrap">
                                {t("SL:{a}", { a: d.so_luong_de_xuat })} ·{" "}
                                {giaNiemYet(d) != null && giaNiemYet(d) !== donGiaSauChietKhau(d) && (
                                  <span className="text-[var(--ink-400)] line-through mr-1" title={t("Giá niêm yết")}><Money>{fmtVND(giaNiemYet(d))}</Money></span>
                                )}
                                {donGiaSauChietKhau(d) != null ? <span className="text-[var(--green-700)] font-semibold"><Money>{fmtVND(donGiaSauChietKhau(d))}</Money></span> : "—"}
                              </span>
                            </div>
                            {/* Dong 3 (2026-09-29, phan hoi "trên giao diện mobile thêm trạng thái ở card của từng đơn
                                hàng"): trang thai phieu xuat kho + chuyen tien cua don (cung nguon cot desktop). */}
                            {(d.trang_thai_pxk || d.thanh_toan) && (
                              <div className="mt-1 flex items-center gap-1.5 overflow-hidden text-[11px] text-[var(--ink-500)]">
                                {d.trang_thai_pxk && (
                                  <span className="inline-flex min-w-0 items-center gap-1" title={t("Phiếu xuất kho")}>
                                    <span className="shrink-0">{t("Phiếu:")}</span>
                                    <StatusBadge value={d.trang_thai_pxk} tones={TRANG_THAI_PXK_DON_TONE} options={TRANG_THAI_PXK_DON_OPTIONS} />
                                  </span>
                                )}
                                {d.thanh_toan && (
                                  <span className="inline-flex min-w-0 items-center gap-1" title={t("Chuyển tiền")}>
                                    <span className="shrink-0">{t("Tiền:")}</span>
                                    <StatusBadge value={d.thanh_toan} tones={THANH_TOAN_DON_TONE} options={THANH_TOAN_DON_OPTIONS} />
                                  </span>
                                )}
                              </div>
                            )}
                            {/* FIX (phan hoi 2026-08-28, lan 2: "ấn vào vùng trống trên thẻ vẫn không mở
                                UI chi tiết") - truoc day CA HANG nut hanh dong nay stopPropagation, kha
                                ca khoang trong quanh cac nut icon nho (hang luon rong het chieu ngang
                                the du nut chi chiem 1 phan nho) - moi cu bam vao khoang trong do bi nuot
                                ma khong lam gi (khong mo chi tiet, khong kich hoat nut nao). Chi
                                stopPropagation khi click THAT SU trung 1 nut con (target != currentTarget
                                cua chinh hang), con click vao khoang trong cua hang (target ===
                                currentTarget) cho lot qua de the mo chi tiet don nhu binh thuong. */}
                            <div
                              className="flex gap-1 flex-wrap mt-1.5"
                              onClick={(e) => {
                                if (e.target !== e.currentTarget) e.stopPropagation();
                              }}
                            >
                              {actions.duyet && (
                                <Btn
                                  size="sm"
                                  variant="ghost"
                                  className="px-2"
                                  title={t("Duyệt")}
                                  aria-label={t("Duyệt")}
                                  onClick={() =>
                                    isCongNoTaoHo(d)
                                      ? setActionTarget({ id: d.id, action: "duyet_tao_ho" })
                                      : d.qua_han_ly_do_cham
                                        ? setActionTarget({ id: d.id, action: "duyet_qua_han" })
                                        : bulkMutation.mutate({ ids: [d.id], hanh_dong: "duyet" })
                                  }
                                  disabled={bulkMutation.isPending}
                                >
                                  ✓
                                </Btn>
                              )}
                              {actions.choHang && (
                                <Btn size="sm" variant="ghost" className="px-2" title={t("Chờ hàng||nút")} aria-label={t("Chờ hàng||nút")} onClick={() => setActionTarget({ id: d.id, action: "cho_hang" })} disabled={bulkMutation.isPending}>
                                  ⏳
                                </Btn>
                              )}
                              {actions.tuChoi && (
                                <Btn
                                  size="sm"
                                  variant="danger"
                                  className="px-2"
                                  title={t("Từ chối||nút")}
                                  aria-label={t("Từ chối||nút")}
                                  onClick={() => setActionTarget({ id: d.id, action: "tu_choi" })}
                                  disabled={bulkMutation.isPending}
                                >
                                  ✕
                                </Btn>
                              )}
{dayLaiDuoc(d, canTacNghiep) && (
                                <Btn
                                  size="sm"
                                  variant="ghost"
                                  className="px-2"
                                  title={t("Đẩy lại về Chờ TN duyệt (được đến {a})", { a: fmtDateTime(d.day_lai_han) })}
                                  aria-label={t("Đẩy lại về Chờ TN duyệt")}
                                  onClick={() => dayLaiMutation.mutate(d.id)}
                                  disabled={dayLaiMutation.isPending}
                                >
                                  ↩
                                </Btn>
                              )}
                              {/* FIX (phan hoi 2026-09-05: "nút hủy đơn ... bỏ ở màn hình ngoài, chỉ
                                  hiện ở màn hình UI chi tiết") - bo nut Hủy o danh sach nhom-theo-KTV
                                  nay, giu nguyen trong DonHangDetailModal (dong ~553). */}
                            </div>
                          </div>
                        </div>
                      </div>
                      );
              })}
            </div>
          </div>
        ))}
      </div>
      {/* CHOT #7 (ra soat module): panel Tu choi/Huy 1 DONG gio la 1 THANH CHUNG dinh vi sticky day
          man hinh (dung pattern footer co dinh da chot o TaoDonTab) thay vi chen NGAY DUOI group dang
          thao tac - truoc day bam Tu choi o group thu 3 se day cac group 4,5,6... xuong dot ngot, de
          mat vi tri dang lam viec. Tim dong theo actionTarget.id tren TOAN BO `rows` (khong con gioi
          han trong 1 dongCon cua 1 group) vi panel gio dung chung cho moi group. */}
      {/* Phan hoi 2026-08-19: "hien popup len de chon, chu khong phai hien 1 lua chon nho ben duoi
          nhu hien tai, rat kho thao tac" - Tu choi/Cho hang doi tu thanh sticky day man hinh sang
          Modal that su (popup chi tap trung vao vung chon ly do). "Huy" GIU NGUYEN dang thanh sticky
          (nguoi dung khong nhac toi, chi nhap ghi chu tu do chu khong phai chon tu 1 danh sach dai
          nen it kho thao tac hon). */}
      {(() => {
        const targetId = actionTarget && actionTarget.id !== "bulk" ? actionTarget.id : null;
        const rowTarget = targetId ? rows.find((r) => r.id === targetId) : undefined;
        const laTraTarget = !!rowTarget && laTraHangChoTn(rowTarget);
        const isTuChoiTBP =
          !!targetId &&
          actionTarget?.action === "tu_choi" &&
          (rowTarget?.trang_thai === "Cho TBP xac nhan" || rowTarget?.trang_thai === "Cho Tram duyet" || rowTarget?.trang_thai === "TN da duyet" || laTraTarget);
        const isTuChoiTN = !!targetId && actionTarget?.action === "tu_choi" && !isTuChoiTBP;
        const isChoHang = !!targetId && actionTarget?.action === "cho_hang";
        const isDuyetTaoHo = !!targetId && actionTarget?.action === "duyet_tao_ho";
        // id "bulk": don tra hang qua han 24h phat hien khi duyet hang loat (bulkMutation) -> chon 1 ly do cho ca nhom.
        const isDuyetQuaHan = !!actionTarget && actionTarget.action === "duyet_qua_han";
        return (
          <>
            {/* Canh bao "Công nợ tạo hộ" (them 2026-08-24, muc 4) - nut nhanh (✓) tren dong bang/the
                mobile, xem isCongNoTaoHo o helpers.ts. */}
            <Modal open={isDuyetTaoHo} onClose={() => setActionTarget(null)} title={t("Cảnh báo")}>
              <div className="space-y-3 text-sm">
                <div className="font-semibold text-[var(--coral-600)]">{t("(!!!) Đơn công nợ này được tạo hộ! Bạn có chắc đồng ý phê duyệt không?")}</div>
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" size="sm" onClick={() => setActionTarget(null)}>{t("Huỷ")}</Btn>
                  <Btn
                    size="sm"
                    onClick={() => {
                      if (targetId) bulkMutation.mutate({ ids: [targetId], hanh_dong: "duyet" });
                      setActionTarget(null);
                    }}
                  >
                    {t("Đồng ý phê duyệt")}
                  </Btn>
                </div>
              </div>
            </Modal>
            <Modal open={isTuChoiTBP} onClose={() => { setActionTarget(null); setActionGhiChu(""); setBulkLyDoChamId(""); }} title={t("Từ chối dòng {a} — nhập lý do", { a: targetId })}>
              <div className="space-y-3">
                {laTraTarget && (
                  <Select
                    value={bulkLyDoChamId}
                    onChange={setBulkLyDoChamId}
                    options={[{ value: "", label: t("-- Lý do chậm (chỉ khi quá hạn 24h) --") }, ...(bulkLyDoData?.rows ?? []).map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                    className="w-full"
                  />
                )}
                <input
                  value={actionGhiChu}
                  onChange={(e) => setActionGhiChu(e.target.value)}
                  placeholder={t("Lý do từ chối (bắt buộc)")}
                  className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => { setActionTarget(null); setActionGhiChu(""); }}>{t("Hủy")}</Btn>
                  <Btn variant="danger" onClick={confirmTuChoiChe} disabled={!actionGhiChu.trim() || bulkMutation.isPending}>{t("Xác nhận")}</Btn>
                </div>
              </div>
            </Modal>
            <Modal open={isTuChoiTN} onClose={() => { setActionTarget(null); setBulkLyDoChamId(""); setActionGhiChu(""); }} title={t("Từ chối dòng {a} — chọn lý do chậm", { a: targetId })}>
              <div className="space-y-3">
                <Select
                  value={bulkLyDoChamId}
                  onChange={setBulkLyDoChamId}
                  options={[{ value: "", label: t("-- Chọn lý do --") }, ...tuChoiReasons.map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                  className="w-full"
                />
                {/* O ghi chu TUY CHON khi tu choi (phan hoi 2026-09-28) - noi sau ly do o log. */}
                <input
                  value={actionGhiChu}
                  onChange={(e) => setActionGhiChu(e.target.value)}
                  placeholder={t("Ghi chú thêm (tuỳ chọn)")}
                  className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => { setActionTarget(null); setBulkLyDoChamId(""); setActionGhiChu(""); }}>{t("Hủy")}</Btn>
                  <Btn variant="danger" onClick={confirmTuChoiChe} disabled={!bulkLyDoChamId || bulkMutation.isPending}>{t("Xác nhận")}</Btn>
                </div>
              </div>
            </Modal>
            <Modal open={isChoHang} onClose={() => { setActionTarget(null); setBulkLyDoChamId(""); setActionGhiChu(""); }} title={t("Chuyển dòng {a} sang chờ hàng — chọn lý do", { a: targetId })}>
              <div className="space-y-3">
                <Select
                  value={bulkLyDoChamId}
                  onChange={setBulkLyDoChamId}
                  options={[{ value: "", label: t("-- Chọn lý do --") }, ...choHangReasons.map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                  className="w-full"
                />
                <input
                  value={actionGhiChu}
                  onChange={(e) => setActionGhiChu(e.target.value)}
                  placeholder={t("Ghi chú thêm (tuỳ chọn)")}
                  className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => { setActionTarget(null); setBulkLyDoChamId(""); setActionGhiChu(""); }}>{t("Hủy")}</Btn>
                  <Btn onClick={confirmTuChoiChe} disabled={!bulkLyDoChamId || bulkMutation.isPending}>{t("Xác nhận chờ hàng")}</Btn>
                </div>
              </div>
            </Modal>
            {/* Hang muc #17/#18 (2026-08-25): dong da qua han 24h "Cho TN duyet" chua co ly_do_cham -
                bam Duyet bat buoc chon 1 ly do TRUOC khi thuc su duyet, dung LAI toan bo danh sach ly
                do (khong tach nhom nhu tu_choi/cho_hang vi day khong phai tu choi/mo ticket thieu
                hang, chi la giai trinh ly do cham xu ly). */}
            <Modal open={isDuyetQuaHan} onClose={() => { setActionTarget(null); setBulkLyDoChamId(""); }} title={targetId ? t("Duyệt dòng {a} đã quá hạn — chọn lý do chậm", { a: targetId }) : t("Duyệt {a} dòng đã quá hạn — chọn lý do chậm", { a: selected.size })}>
              <div className="space-y-3">
                <div className="text-xs text-[var(--coral-600)]">{t("Đơn này đã quá 24h chưa được tiếp nhận. Vui lòng chọn lý do trước khi duyệt.")}</div>
                <Select
                  value={bulkLyDoChamId}
                  onChange={setBulkLyDoChamId}
                  options={[{ value: "", label: t("-- Chọn lý do --") }, ...(bulkLyDoData?.rows ?? []).map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                  className="w-full"
                />
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => { setActionTarget(null); setBulkLyDoChamId(""); }}>{t("Hủy")}</Btn>
                  <Btn onClick={confirmDuyetQuaHan} disabled={!bulkLyDoChamId || bulkMutation.isPending}>{t("Xác nhận duyệt")}</Btn>
                </div>
              </div>
            </Modal>
            {targetId && actionTarget?.action === "huy" && (
              // FIX (bao cao 2026-08-26: "nút hủy bỏ có hiện nhưng bấm vào không có phản hồi") - panel
              // nay dung `position: sticky` neo theo VIEWPORT (khong co ancestor overflow rieng nao
              // giua no va <main>), tren mobile BottomTabBar.tsx la `fixed bottom-0 z-40` PHU DUNG len
              // dung vi tri `bottom-2` cu, va z-10 < z-40 nen panel bi VE PHIA SAU thanh tab duoi - vo
              // hinh hoan toan du DA MO thanh cong. "bottom-20" (khop pb-20 cua <main> o App.tsx) +
              // z-50 (> z-40 cua BottomTabBar) de panel luon noi TREN, khong bi che tren mobile.
              <div className="sticky bottom-20 md:bottom-2 z-50 flex items-center gap-2 flex-wrap border border-[var(--line)] bg-[var(--surface)] shadow-lg rounded-xl px-3 py-2.5">
                <span className="text-xs font-semibold">{t("Hủy dòng {a} — nhập lý do", { a: targetId })}</span>
                <input
                  value={actionGhiChu}
                  onChange={(e) => setActionGhiChu(e.target.value)}
                  placeholder={t("Lý do hủy (bắt buộc)")}
                  className="focus-ring flex-1 min-w-[160px] bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs"
                />
                <Btn size="sm" variant="danger" onClick={confirmHuyChe} disabled={!actionGhiChu.trim() || bulkMutation.isPending}>{t("Xác nhận hủy")}</Btn>
                <Btn size="sm" variant="ghost" onClick={() => { setActionTarget(null); setActionGhiChu(""); }}>{t("Đóng")}</Btn>
              </div>
            )}
          </>
        );
      })()}
      {/* Dong bo chan trang phan trang voi PaginatedTable (them 2026-08-21, "hợp nhất phong cách giao
          diện") - truoc day chi co "‹ Trước/Trang N/Sau ›", khong hien tong so dong nhu 3 man con lai. */}
      <div className="flex items-center justify-between px-1 py-2 text-xs text-[var(--ink-400)]">
        <span>{t("{a} dòng", { a: total })}</span>
        <div className="flex gap-1">
          <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</Btn>
          <span className="px-2 py-1.5">{page}/{Math.max(1, Math.ceil(total / pageSize))}</span>
          <Btn variant="ghost" size="sm" disabled={page * pageSize >= total} onClick={() => onPageChange(page + 1)}>›</Btn>
        </div>
      </div>
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

