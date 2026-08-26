import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Drawer, DrawerNavButtons, useDrawerArrowNav } from "../../components/ui/Drawer";
import { Select } from "../../components/ui/Select";
import { KvRow } from "../../components/ui/KvRow";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { Timeline } from "../../components/ui/Timeline";
import type { Column } from "../../components/ui/PaginatedTable";
import { useColumnConfig } from "../../components/ui/useColumnConfig";
import { ColumnSettingsButton, ResizableHeaderCell } from "../../components/ui/ColumnHeader";
import { api, buildQuery } from "../../api/client";
import { fmtDateTime, fmtVND } from "../../types";
import { useAuth } from "../../auth/AuthContext";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { getOptionsForUser } from "../../lib/loaiDeXuatCache";
import { formatPersonDisplay, usePersonDirectory } from "../../lib/personDisplay";
import type { DonHangRow, DonHangLogRow, LyDoChamRow, ActionTarget, DonHangDraft, NguoiNhanHangKhaDungRow } from "./types";
import {
  DON_HANG_TRANG_THAI_TONE_ALL, DON_HANG_ROW_STYLE, TRANG_THAI_DOT_TONE, DON_CUA_TOI_TRANG_THAI_OPTIONS,
  DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, DON_HANG_DANG_MO, BULK_LOG_ERROR_MESSAGES, YEU_CAU_HOA_DON_OPTIONS,
  CHINH_SACH_OPTIONS, YEU_CAU_HOA_DON_SHORT_LABELS,
} from "./constants";
import {
  describeApiError, formatNguoiDisplay, useKtvDisplayMap, ktvOptionLabel, invalidatePipelineCounts,
  LOAI_DON_TONE, deriveLoaiDon, actionsFor, trangThaiLabel, canNoRequired, pickLdeQuick, emptyDraft,
  useLkAndLdeCache, useLinhKienRankMap, formatLkLabel, isCongNoTaoHo,
} from "./helpers";
import { StatusBadge, ActiveFiltersBar, TrangThaiChipFilter, BulkConfirmButton, MaYcscCell } from "./SharedUi";
import { MaYeuCauSuCoCheck } from "./MaYeuCauSuCoCheck";
import { LinhKienPicker, LinhKienDetailModal } from "./LinhKienPicker";

export function DonHangDetailModal({
  id,
  onClose,
  addToast,
  qc,
  canTacNghiep,
  canTPDvbhXacNhan,
  canActAsTram,
  currentEmail,
  canXemChiTietCa,
  openCase,
  navRows,
  onNavigate,
}: {
  id: string;
  onClose: () => void;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean;
  canTPDvbhXacNhan: boolean;
  canActAsTram: boolean;
  currentEmail: string;
  canXemChiTietCa: boolean;
  openCase?: (id: string, tab?: string) => void;
  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "Drawer + Next/Previous"): danh sach DONG PHANG
  // cua TRANG dang xem (component cha da fetch san, khong goi API moi) de duyet qua tung dong lien
  // tiep ma khong phai dong Drawer roi bam lai tu dau. Optional - undefined = an nut dieu huong (vd
  // noi goi tuong lai khac chua can tinh nang nay).
  navRows?: DonHangRow[];
  onNavigate?: (id: string) => void;
}) {
  const [ghiChu, setGhiChu] = useState("");
  // "Tu choi" bat buoc chon 1 Ly do cham, "Huy" bat buoc nhap ghiChu tu do (phan hoi UX muc 1, xem
  // comment applyDonHangLog o backend).
  const [actionTarget, setActionTarget] = useState<"tu_choi" | "cho_hang" | "huy" | "duyet_qua_han" | null>(null);
  // Canh bao "Công nợ tạo hộ" (them 2026-08-24, muc 4) - chan 1 nhip TRUOC khi goi mutation "duyet"
  // that su, xem isCongNoTaoHo o helpers.ts.
  const [confirmDuyetTaoHo, setConfirmDuyetTaoHo] = useState(false);
  const [lyDoChamId, setLyDoChamId] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["dat-mua-lk-don-hang-detail", id],
    queryFn: () => api.get<{ donHang: DonHangRow }>(`/dat-mua-lk/don-hang/${id}`),
  });
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
    invalidatePipelineCounts(qc);
  }

  const logMutation = useMutation({
    mutationFn: ({ hanh_dong, ly_do_cham_id }: { hanh_dong: string; ly_do_cham_id?: number }) =>
      api.post(`/dat-mua-lk/don-hang/${id}/log`, { hanh_dong, ly_do_cham_id, ghi_chu: ghiChu.trim() || undefined }),
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
        addToast("Đã cập nhật trạng thái dòng đơn hàng");
      }
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // "Lý do chậm" khi dòng còn "Cho TN duyệt" quá hạn (phản hồi: "danh sách chờ TN duyệt đang không có
  // nơi để nhập lý do quá hạn") - cùng pattern/endpoint với PhieuXuatKhoTab.tsx (input tự do, PATCH
  // /don-hang/:id), chỉ khác phạm vi hiển thị (ở đây là khi CÒN "Cho TN duyệt", PXK là "Dang tao phieu").
  const [lyDoChamDraft, setLyDoChamDraft] = useState("");
  const lyDoChamMutation = useMutation({
    mutationFn: (ly_do_cham: string) => api.patch(`/dat-mua-lk/don-hang/${id}`, { ly_do_cham }),
    onSuccess: () => {
      setLyDoChamDraft("");
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail", id] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      addToast("Đã lưu lý do chậm");
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  function confirmTuChoi() {
    if (actionTarget !== "tu_choi" && actionTarget !== "cho_hang") return;
    // "Cho TBP xac nhan"/"Cho Tram duyet" tu choi don gian - khong can chon Ly do cham, chi ghi chu
    // tu do (nay BAT BUOC, hang muc #19 2026-08-25 - nut xac nhan da disable san khi rong).
    if (data?.donHang.trang_thai === "Cho TBP xac nhan" || data?.donHang.trang_thai === "Cho Tram duyet") {
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
    logMutation.mutate({ hanh_dong: "duyet", ly_do_cham_id: Number(lyDoChamId) });
  }

  const d = data?.donHang;
  const actions = d ? actionsFor(d, { canTacNghiep, canTPDvbhXacNhan, canActAsTram, currentEmail }) : { duyet: false, tuChoi: false, choHang: false, huy: false };
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
  // form, khong con 2 khoi UI tach roi cho cung 1 dong. canEditTn (4 truong phu) khong gioi han
  // trang thai (dung y nghia cu cua tnEditOpen), canEditFull chi trong "cua so dang mo" cua nguoi tao.
  const canEditFull = isCreatorEditWindow;
  const canEditTn = canTacNghiep;
  const [isEditMode, setIsEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<DonHangDraft | null>(null);
  // CHOT (ra soat module #18): luu lai BAN GOC luc bat dau sua de "Huy sua" chi hoi xac nhan khi
  // draft THUC SU khac ban goc - truoc day xoa draft ngay khong canh bao, du da sua nhieu truong.
  const [editDraftSnapshot, setEditDraftSnapshot] = useState<DonHangDraft | null>(null);
  const [confirmCancelPending, setConfirmCancelPending] = useState(false);
  // "khac..." mo Select day du cho Loai de xuat trong form sua - chi 1 dong nen dung 1 boolean thay
  // vi Set<number> nhu TaoDonTab.
  const [otherLdeOpen, setOtherLdeOpen] = useState(false);
  const { danhMuc, ldeEntries } = useLkAndLdeCache(isEditMode);
  const auth = useAuth();
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
      uu_tien: d.uu_tien === 1,
      // "anh" khong dung o luong sua nay (chi don loai_don='tra_hang' moi co anh, va dong tra_hang
      // KHONG bao gio vao duoc isCreatorEditWindow - xem giai thich o comment dat_don_hang_log/
      // isCreatorEditWindow ben tren) - de rong cho khop type DonHangDraft.
      anh: [],
    };
    setEditDraft(snap);
    setEditDraftSnapshot(snap);
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
    setConfirmCancelPending(false);
  }
  function updateEditDraft(patch: Partial<DonHangDraft>) {
    setEditDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setConfirmCancelPending(false);
  }

  const editMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/dat-mua-lk/don-hang/${id}`, body),
    onSuccess: () => {
      setIsEditMode(false);
      setEditDraft(null);
      setEditDraftSnapshot(null);
      invalidate();
      addToast("Đã lưu thay đổi đơn hàng");
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  function saveEdit() {
    if (!editDraft) return;
    editMutation.mutate({
      ma_lk: editDraft.ma_lk,
      loai_de_xuat: editDraft.loai_de_xuat.trim(),
      so_luong_de_xuat: editDraft.so_luong_de_xuat,
      ghi_chu: editDraft.ghi_chu.trim() || undefined,
      yeu_cau_hoa_don: editDraft.yeu_cau_hoa_don.trim() || undefined,
      tt_mail_duyet: editDraft.tt_mail_duyet.trim() || undefined,
      tt_khach_hang: editDraft.tt_khach_hang.trim() || undefined,
      chinh_sach: editDraft.chinh_sach.trim() || undefined,
      ma_yeu_cau_su_co: editDraft.ma_yeu_cau_su_co.trim() || undefined,
      uu_tien: editDraft.uu_tien,
    });
  }

  const editCanSave =
    !!editDraft &&
    editDraft.ma_lk.trim() !== "" &&
    editDraft.loai_de_xuat.trim() !== "" &&
    editDraft.so_luong_de_xuat > 0 &&
    (!canNoRequired(editDraft.loai_de_xuat) || (editDraft.chinh_sach.trim() !== "" && editDraft.ma_yeu_cau_su_co.trim() !== ""));

  const footer =
    !isLoading && d ? (
      isEditMode ? (
        <div className="flex items-center justify-end gap-2">
          {confirmCancelPending && <span className="text-[11px] text-[var(--coral-600)] font-medium">Bấm lần nữa để huỷ thay đổi</span>}
          <Btn variant={confirmCancelPending ? "danger" : "ghost"} size="sm" onClick={cancelEdit} disabled={editMutation.isPending}>
            {confirmCancelPending ? "Xác nhận huỷ" : "Huỷ sửa"}
          </Btn>
          <Btn size="sm" onClick={saveEdit} disabled={!editCanSave || editMutation.isPending}>Lưu thay đổi</Btn>
        </div>
      ) : actionTarget === "tu_choi" && (d.trang_thai === "Cho TBP xac nhan" || d.trang_thai === "Cho Tram duyet") ? (
        // Panel tu choi inline (concept 1, pattern ".inline-panel"/".field": nen xam nhat, vien dut
        // net, label chu hoa nho phia tren input) - thay khoi flex ngang tu viet tay truoc day.
        // FIX (phan hoi 2026-08-25, hang muc #19): ghi chu tu "tuy chon" thanh "bat buoc" (dao nguoc
        // quyet dinh cu), va gop them "Cho Tram duyet" vao day (truoc do Tram tu choi ban ban khong
        // qua panel nao ca - bam la huy ngay, khong con hop le sau khi backend bat buoc ghi_chu).
        <div className="w-full space-y-2 bg-[var(--surface-100)] border border-dashed border-[var(--line)] rounded-lg p-2.5">
          <div className="font-semibold text-xs">Từ chối dòng {d.id}</div>
          <div>
            <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">Lý do từ chối (bắt buộc)</label>
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do từ chối (bắt buộc)"
              className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setGhiChu(""); }}>Hủy</Btn>
            <Btn size="sm" variant="danger" onClick={confirmTuChoi} disabled={!ghiChu.trim() || logMutation.isPending}>Xác nhận từ chối</Btn>
          </div>
        </div>
      ) : actionTarget === "tu_choi" ? (
        <div className="w-full space-y-2 bg-[var(--surface-100)] border border-dashed border-[var(--line)] rounded-lg p-2.5">
          <div className="font-semibold text-xs">Từ chối dòng {d.id} — chọn lý do chậm</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">Lý do chậm (bắt buộc)</label>
              <Select
                value={lyDoChamId}
                onChange={setLyDoChamId}
                options={[{ value: "", label: "-- Chọn lý do --" }, ...tuChoiReasons.map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">Ghi chú thêm (tuỳ chọn)</label>
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder="Ghi chú thêm (tuỳ chọn)"
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setLyDoChamId(""); }}>Hủy</Btn>
            <Btn size="sm" variant="danger" onClick={confirmTuChoi} disabled={!lyDoChamId || logMutation.isPending}>Xác nhận từ chối</Btn>
          </div>
        </div>
      ) : actionTarget === "cho_hang" ? (
        <div className="w-full space-y-2 bg-[var(--surface-100)] border border-dashed border-[var(--line)] rounded-lg p-2.5">
          <div className="font-semibold text-xs">Chuyển dòng {d.id} sang chờ hàng — chọn lý do</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">Lý do (bắt buộc)</label>
              <Select
                value={lyDoChamId}
                onChange={setLyDoChamId}
                options={[{ value: "", label: "-- Chọn lý do --" }, ...choHangReasons.map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">Ghi chú thêm (tuỳ chọn)</label>
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder="Ghi chú thêm (tuỳ chọn)"
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setLyDoChamId(""); }}>Hủy</Btn>
            <Btn size="sm" onClick={confirmTuChoi} disabled={!lyDoChamId || logMutation.isPending}>Xác nhận chờ hàng</Btn>
          </div>
        </div>
      ) : actionTarget === "duyet_qua_han" ? (
        // Hang muc #17/#18 (2026-08-25): panel giong tu_choi/cho_hang o tren nhung khong tach nhom ly
        // do (dung ca danh sach lyDoData) - day chi la giai trinh ly do cham xu ly, khong phai
        // tu choi/mo ticket thieu hang.
        <div className="w-full space-y-2 bg-[var(--surface-100)] border border-dashed border-[var(--coral-500)] rounded-lg p-2.5">
          <div className="font-semibold text-xs text-[var(--coral-600)]">Đơn đã quá hạn 24h — chọn lý do trước khi duyệt dòng {d.id}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">Lý do chậm (bắt buộc)</label>
              <Select
                value={lyDoChamId}
                onChange={setLyDoChamId}
                options={[{ value: "", label: "-- Chọn lý do --" }, ...(lyDoData?.rows ?? []).map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">Ghi chú thêm (tuỳ chọn)</label>
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder="Ghi chú thêm (tuỳ chọn)"
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setLyDoChamId(""); }}>Hủy</Btn>
            <Btn size="sm" onClick={confirmDuyetQuaHan} disabled={!lyDoChamId || logMutation.isPending}>Xác nhận duyệt</Btn>
          </div>
        </div>
      ) : actionTarget === "huy" ? (
        <div className="w-full space-y-2 bg-[var(--surface-100)] border border-dashed border-[var(--line)] rounded-lg p-2.5">
          <div className="font-semibold text-xs">Hủy dòng {d.id} — nhập lý do hủy</div>
          <div>
            <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">Lý do hủy (bắt buộc)</label>
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do hủy (bắt buộc)"
              className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setGhiChu(""); }}>Đóng</Btn>
            <Btn size="sm" variant="danger" onClick={confirmHuy} disabled={!ghiChu.trim() || logMutation.isPending}>Xác nhận hủy</Btn>
          </div>
        </div>
      ) : actions.duyet || actions.tuChoi || actions.choHang || actions.huy ? (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {actions.duyet && (
            <Btn
              size="sm"
              onClick={() =>
                isCongNoTaoHo(d)
                  ? setConfirmDuyetTaoHo(true)
                  : d.qua_han_ly_do_cham
                    ? setActionTarget("duyet_qua_han")
                    : logMutation.mutate({ hanh_dong: "duyet" })
              }
              disabled={logMutation.isPending}
              loading={logMutation.isPending}
            >
              {navNextId && onNavigate ? "Duyệt và tiếp theo →" : "Duyệt"}
            </Btn>
          )}
          {actions.choHang && (
            <Btn size="sm" variant="ghost" onClick={() => setActionTarget("cho_hang")} disabled={logMutation.isPending}>
              Chờ hàng
            </Btn>
          )}
          {actions.tuChoi && (
            <Btn
              size="sm"
              variant="danger"
              onClick={() => setActionTarget("tu_choi")}
              disabled={logMutation.isPending}
            >
              Từ chối
            </Btn>
          )}
          {actions.huy && <Btn size="sm" variant="ghost" onClick={() => setActionTarget("huy")} disabled={logMutation.isPending}>Hủy</Btn>}
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
    {confirmDuyetTaoHo && (
      <Modal open title="Cảnh báo" onClose={() => setConfirmDuyetTaoHo(false)}>
        <div className="space-y-3 text-sm">
          <div className="font-semibold text-[var(--coral-600)]">(!!!) Đơn công nợ này được tạo hộ! Bạn có chắc đồng ý phê duyệt không?</div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" size="sm" onClick={() => setConfirmDuyetTaoHo(false)}>Huỷ</Btn>
            <Btn size="sm" onClick={() => { setConfirmDuyetTaoHo(false); logMutation.mutate({ hanh_dong: "duyet" }); }}>Đồng ý phê duyệt</Btn>
          </div>
        </div>
      </Modal>
    )}
    <Drawer
      open
      title={`Đơn hàng ${id}`}
      onClose={onClose}
      width="max-w-2xl"
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
          {(canEditFull || canEditTn) && !isEditMode ? (
            <Btn size="sm" variant="ghost" onClick={startEdit}>✎ Sửa</Btn>
          ) : undefined}
        </>
      }
    >
      {isLoading ? (
        <div className="text-sm text-[var(--ink-500)] py-4 text-center">Đang tải...</div>
      ) : !d ? null : (
        <div className="space-y-4 text-sm">
          {/* Khoi thong tin dau Drawer doi sang KvRow/SectionTitle (concept 1 "Structured Neutral",
              pattern ".kv"/".section-title") - thay cho luoi <div> label/value tu viet tay truoc day. */}
          <div>
            <SectionTitle>Thông tin đơn</SectionTitle>
            <KvRow label="Người tạo">{formatNguoiDisplay(d.nguoi_tao, ktvDisplayMap)}</KvRow>
            {/* Luon hien (phan hoi 2026-08-25, hang muc #9) - truoc chi hien khi khac nguoi tao, gay
                cam giac "thieu thong tin nguoi nhan hang" khi 2 gia tri trung nhau. */}
            <KvRow label="Người nhận hàng">{d.nguoi_nhan_hang ? formatNguoiDisplay(d.nguoi_nhan_hang, ktvDisplayMap) : "—"}</KvRow>
            <KvRow label="Ngày tạo">{fmtDateTime(d.ngay_tao)}</KvRow>
            <KvRow label="Tổng tiền đề xuất">
              <span className="font-bold text-[var(--green-700)]">{fmtVND((d.gia_de_xuat ?? 0) * d.so_luong_de_xuat)}</span>
            </KvRow>
            <KvRow label="Trạng thái">
              <div className="flex items-center gap-2 flex-wrap">
                {tone && <Badge tone={tone.tone}>{tone.label}</Badge>}
                <StatusBadge value={d.trang_thai ?? ""} tones={DON_HANG_TRANG_THAI_TONE_ALL} options={DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL} />
                {d.loai_don === "tra_hang" && (
                  <span className="text-[var(--ink-400)] text-xs">(xử lý ở luồng quy trình phía trên)</span>
                )}
                {d.qua_han_ly_do_cham && <Badge tone="coral">Quá hạn - cần lý do chậm</Badge>}
                {/* SUA (phan hoi 2026-08-19): amber trung mau voi loai_don "Cong no" gay nham lan "vien
                    vang" - doi ca Badge nay lan ring/bg cua dong bang sang cam THAT (token --orange-*
                    rieng, khac amber), dong bo voi TaoDonTab. */}
                {d.uu_tien === 1 && <Badge tone="orange">⭐ Ưu tiên</Badge>}
              </div>
            </KvRow>
          </div>

          {d.ly_do_cham ? (
            <KvRow label="Lý do chậm">{d.ly_do_cham}</KvRow>
          ) : canTacNghiep && d.trang_thai === "Cho TN duyet" ? (
            <div className="flex flex-col gap-1">
              {/* CHOT (phan hoi 2026-08-24: "đổi hẳn thành dropdown bắt buộc, bỏ ô nhập tay") - Select
                  BAT BUOC chon tu danh muc "Mua hàng" (settings_ly_do_cham), khong con o nhap tu do -
                  neu Settings CHUA co ly do nao, TN se khong nhap duoc cho toi khi Admin bo sung
                  (dung y da chot voi nguoi dung). Dung lai lyDoData da fetch san o tren cho luong "Từ
                  chối" (cung queryKey/endpoint), khong goi API moi.*/}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Select
                  value={lyDoChamDraft}
                  onChange={setLyDoChamDraft}
                  options={[{ value: "", label: "-- Chọn lý do chậm --" }, ...(lyDoData?.rows ?? []).map((l) => ({ value: l.ten_ly_do, label: l.ten_ly_do }))]}
                  disabled={(lyDoData?.rows.length ?? 0) === 0}
                  className="flex-1 min-w-[200px]"
                />
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() => lyDoChamMutation.mutate(lyDoChamDraft.trim())}
                  disabled={!lyDoChamDraft.trim() || lyDoChamMutation.isPending}
                >
                  Lưu
                </Btn>
              </div>
              {(lyDoData?.rows.length ?? 0) === 0 && (
                <div className="text-[11px] text-[var(--coral-600)]">Chưa có lý do chậm nào được cấu hình cho "Mua hàng" — vào Settings › Lý do chậm để thêm.</div>
              )}
            </div>
          ) : null}

          {isEditMode && editDraft ? (
            <div className="space-y-3 bg-[var(--surface-100)] rounded-xl p-3">
              {!canEditFull && (
                <div className="text-[11px] text-[var(--ink-500)]">
                  Bạn chỉ có thể sửa các trường phụ bên dưới (Mã yêu cầu sự cố / Yêu cầu hóa đơn / TT khách hàng / TT mail duyệt) — các trường còn lại đã khoá.
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Mã linh kiện</label>
                <LinhKienPicker value={editDraft.ma_lk} onChange={(v) => updateEditDraft({ ma_lk: v })} options={danhMuc} disabled={!canEditFull} />
              </div>
              {/* Loai de xuat + So luong GOP 1 HANG (tai dung dung layout da chot o TaoDonTab 2.0 -
                  ca 2 noi cung dung DonHangDraft/updateDraft nen chi phi dong bo thap). */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Loại đề xuất · Số lượng *</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex gap-1 flex-wrap flex-1 min-w-[160px]">
                    {(["MUA HÀNG", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const).map((kw) => {
                      const matched = pickLdeQuick(loaiDeXuatOptions, kw);
                      if (!matched) return null;
                      return (
                        <Btn key={kw} size="sm" variant={editDraft.loai_de_xuat === matched ? "primary" : "ghost"} disabled={!canEditFull} onClick={() => updateEditDraft({ loai_de_xuat: matched })}>
                          {kw}
                        </Btn>
                      );
                    })}
                    <Btn size="sm" variant={otherLdeOpen ? "primary" : "ghost"} disabled={!canEditFull} onClick={() => setOtherLdeOpen(true)}>
                      khác…
                    </Btn>
                  </div>
                  <div className="flex items-center border border-[var(--line)] rounded-lg overflow-hidden shrink-0">
                    <button
                      type="button"
                      disabled={!canEditFull}
                      onClick={() => updateEditDraft({ so_luong_de_xuat: Math.max(1, editDraft.so_luong_de_xuat - 1) })}
                      className="focus-ring w-7 h-8 flex items-center justify-center text-[var(--ink-600)] font-bold hover:bg-[var(--surface-100)] disabled:opacity-40"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      disabled={!canEditFull}
                      value={editDraft.so_luong_de_xuat}
                      onChange={(e) => updateEditDraft({ so_luong_de_xuat: Number(e.target.value) })}
                      className="focus-ring w-11 text-center text-sm border-x border-[var(--line)] py-1.5 disabled:opacity-40"
                    />
                    <button
                      type="button"
                      disabled={!canEditFull}
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
                    options={[{ value: "", label: "-- Chọn --" }, ...loaiDeXuatOptions.map((o) => ({ value: o, label: o }))]}
                    disabled={!canEditFull}
                    className="w-full mt-1"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">
                    Mã yêu cầu sự cố liên quan{canNoRequired(editDraft.loai_de_xuat) ? " *" : ""}
                  </label>
                  <input
                    value={editDraft.ma_yeu_cau_su_co}
                    onChange={(e) => updateEditDraft({ ma_yeu_cau_su_co: e.target.value })}
                    maxLength={20}
                    className={`focus-ring w-full bg-[var(--surface-100)] border rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-40 ${canNoRequired(editDraft.loai_de_xuat) && !editDraft.ma_yeu_cau_su_co.trim() ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">
                    Chính sách{canNoRequired(editDraft.loai_de_xuat) ? " *" : ""}
                  </label>
                  <Select
                    value={editDraft.chinh_sach}
                    onChange={(v) => updateEditDraft({ chinh_sach: v })}
                    options={[{ value: "", label: "-- Không chọn --" }, ...CHINH_SACH_OPTIONS.map((o) => ({ value: o, label: o }))]}
                    disabled={!canEditFull}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Yêu cầu hóa đơn</label>
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
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">TT+Mail duyệt</label>
                  <input
                    value={editDraft.tt_mail_duyet}
                    onChange={(e) => updateEditDraft({ tt_mail_duyet: e.target.value })}
                    className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">TT khách hàng</label>
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
                ⭐ Đơn ưu tiên
              </label>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Ghi chú (tuỳ chọn)</label>
                <input
                  value={editDraft.ghi_chu}
                  disabled={!canEditFull}
                  onChange={(e) => updateEditDraft({ ghi_chu: e.target.value })}
                  className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-40"
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className={`font-semibold text-base ${DON_HANG_ROW_STYLE[d.trang_thai ?? ""] ?? ""}`}>
                  {d.ten_lk_snapshot ?? d.ma_lk}
                  {!!d.dac_thu && (
                    <span className="ml-2 align-middle"><Badge tone="amber">🔒 Đặc thù</Badge></span>
                  )}
                </div>
              </div>

              <div>
                <KvRow label="Mã LK"><span className="font-mono text-xs">{d.ma_lk}</span></KvRow>
                <KvRow label="SL đề xuất">{d.so_luong_de_xuat}</KvRow>
                <KvRow label="Giá đề xuất">{d.gia_de_xuat != null ? <span className="font-semibold text-[var(--green-700)]">{fmtVND(d.gia_de_xuat)}</span> : "—"}</KvRow>
                <KvRow label="Giá chốt">{d.gia_chot != null ? <span className="font-semibold text-[var(--green-700)]">{fmtVND(d.gia_chot)}</span> : "—"}</KvRow>
                <KvRow label="Mã YCSC">
                  <MaYcscCell value={d.ma_yeu_cau_su_co} canXemChiTietCa={canXemChiTietCa} openCase={openCase} />
                </KvRow>
                <KvRow label="Mã xuất kho">{d.ma_xuat_kho ?? "—"}</KvRow>
              </div>

              {d.ghi_chu && <div className="text-[var(--ink-500)]">{d.ghi_chu}</div>}
              {/* Ly do chon luc "tu choi"/"cho hang" luu trong ghi_chu cua log moi nhat (xem
                  applyDonHangLog backend) - hien cho nguoi tao biet vi sao, khong chi hien trang thai suong. */}
              {(d.trang_thai === "TN tu choi" || d.trang_thai === "Cho hang") && d.logs?.[0]?.ghi_chu && (
                <div className="text-xs text-[var(--ink-500)]">{d.logs[0].ghi_chu}</div>
              )}
            </>
          )}

          {/* CHOT (ra soat module #18): chip 2 dong (ma case + ten khach hang) thay vi chi ma thuan
              chu - bam duoc tren MOI thiet bi (khong dua vao hover, vo dung tren mobile - phan lon
              thao tac trong app nay dien ra tren dien thoai KTV ngoai hien truong). */}
          {d.cases && d.cases.length > 0 && (
            <div>
              <SectionTitle>Ca liên kết</SectionTitle>
              <div className="flex gap-1.5 flex-wrap">
                {d.cases.map((cRow) => (
                  <span
                    key={cRow.id}
                    className={`inline-flex flex-col rounded-lg border border-[var(--line)] px-2 py-1 leading-tight ${canXemChiTietCa && openCase ? "cursor-pointer hover:border-[var(--ocean-400)] hover:bg-[var(--ocean-100)]/30" : ""}`}
                    onClick={canXemChiTietCa && openCase ? () => openCase(cRow.id, "giai-trinh") : undefined}
                  >
                    <span className="font-mono text-[11px] font-semibold text-[var(--ocean-600)]">{cRow.id}</span>
                    {cRow.khach_hang && <span className="text-[10px] text-[var(--ink-500)] truncate max-w-[160px]">{cRow.khach_hang}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CHOT (ra soat module #18): them 1 cham tron nho dau moi dong theo dung tone trang thai
              (khong to mau ca dong chu) - du quet nhanh "chuoi mau" cua hanh trinh xu ly ma khong
              canh tranh voi StatusBadge chinh o dau modal (van la diem neo cho trang thai HIEN TAI). */}
          {(d.logs?.length ?? 0) > 0 && (
            <div>
              {/* Doi sang Timeline (concept 1, pattern ".timeline") - thay cho danh sach cham tron mau
                  theo tone trang thai truoc day. TRANG_THAI_DOT_TONE khong con dung o day. */}
              <SectionTitle>Lịch sử xử lý</SectionTitle>
              <Timeline
                items={d.logs!.map((l) => ({
                  title: (
                    <>
                      {trangThaiLabel(DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, l.trang_thai)}
                      <span className="font-normal text-[var(--ink-500)]"> · {l.nguoi_xu_ly}</span>
                    </>
                  ),
                  time: `${fmtDateTime(l.ngay_xu_ly)}${l.ghi_chu ? ` — ${l.ghi_chu}` : ""}`,
                }))}
              />
            </div>
          )}
        </div>
      )}
    </Drawer>
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
  canXemChiTietCa,
  openCase,
  initialFilterOverride,
  initialNguoiNhanHangOverride,
  initialLoaiDonOverride,
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
  canXemChiTietCa: boolean;
  openCase?: (id: string, tab?: string) => void;
  initialFilterOverride?: string;
  initialNguoiNhanHangOverride?: string;
  initialLoaiDonOverride?: string;
  loaiDonTabClickSeq?: number;
}) {
  const personDir = usePersonDirectory();
  // Mac dinh loc thang vao bucket "can xu ly" cua vai tro dang xem (chi anh huong lan dau, xem
  // comment defaultView o component cha) - TN thay "Cho TN duyet", Tram thay "Cho Tram duyet", con
  // lai (KTV/Ve tinh xem don cua chinh minh, GS theo doi) giu "Tat ca" vi ho can thay CA lich su, khong
  // chi phan cho duyet.
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState(
    "filters:dmlk-trang-thai",
    canTacNghiep ? "Cho TN duyet" : canTPDvbhXacNhan ? "Cho TBP xac nhan" : canBulkTram ? "Cho Tram duyet" : "",
  );
  // Nhay tu thanh tom tat cua module cha (tieu chi UX #2) - ghi de filter khi co jumpTarget dich.
  useEffect(() => {
    if (initialFilterOverride !== undefined) setFilterTrangThai(initialFilterOverride);
  }, [initialFilterOverride]);
  const [filterNguoiTao, setFilterNguoiTao] = useState("");
  const [filterNguoiNhanHang, setFilterNguoiNhanHang] = useState("");
  useEffect(() => {
    if (initialNguoiNhanHangOverride !== undefined) setFilterNguoiNhanHang(initialNguoiNhanHangOverride);
  }, [initialNguoiNhanHangOverride]);
  const [filterTuNgay, setFilterTuNgay] = useState("");
  const [filterDenNgay, setFilterDenNgay] = useState("");
  // CHOT #8 (ra soat module "Dat Mua Linh Kien 2.0"): tim theo ma LK/ten LK/ma dong - gui len SERVER
  // (khong loc client-side, danh sach da phan trang server-side that su nen loc client chi tim duoc
  // trong 20 dong dang tai). Debounce 500ms giong pattern MaYeuCauSuCoCheck da co san trong file.
  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filterQ.trim()), 500);
    return () => clearTimeout(t);
  }, [filterQ]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  // UI redesign (phan hoi 2026-08-19: "cho hết vào 1 nút thu gọn/mở rộng") - GOM toan bo bo loc (tim
  // kiem/trang thai chip/nguoi tao-ngay/nguoi nhan hang) vao CHUNG 1 khoi an mac dinh, thay 2 tang
  // rieng ("Loc them ▾" long trong hang toolbar chinh) truoc day - muc tieu ngay sau thanh tab tren
  // cung la den thang bang danh sach, khong con hang loc chiem san dien tich.
  const [showFilters, setShowFilters] = useState(false);
  // xemLoaiDon gio la PROP (nang len DatMuaLinhKienModule, hien thanh 3 tab that "Mua hang/Cong no/
  // Tra hang" o thanh tab tren cung - xem comment o chu ky ham). Doi sang "Tra hang" thi filterTrangThai
  // phai reset ve rong - bo loc trang thai dang dung gia tri cua dat_don_hang_log (vd "Cho TN duyet"),
  // khong khop trang thai cua tra_hang_log nen se ra rong neu giu nguyen.
  useEffect(() => {
    if (xemLoaiDon === "tra_hang") setFilterTrangThai("");
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
  useEffect(() => {
    if (initialLoaiDonOverride !== undefined) setLoaiDonOverride(initialLoaiDonOverride === "all" ? "" : initialLoaiDonOverride);
  }, [initialLoaiDonOverride]);
  // Xoa override khi nguoi dung TU BAM 1 sub-tab (dem qua loaiDonTabClickSeq tu component cha, xem
  // giai thich chi tiet o handleTabChange trong DatMuaLinhKienModule.tsx) - KHONG dung effect
  // [xemLoaiDon] truc tiep vi neu nguoi dung bam lai DUNG sub-tab dang mo san (gia tri khong doi),
  // React se bo qua effect, override "gop 2 loai" bi ket lai mai du nguoi dung da ro rang muon roi.
  const isFirstLoaiDonSeqRef = useRef(true);
  useEffect(() => {
    if (isFirstLoaiDonSeqRef.current) {
      isFirstLoaiDonSeqRef.current = false;
      return;
    }
    setLoaiDonOverride(undefined);
  }, [loaiDonTabClickSeq]);
  const effectiveLoaiDon = loaiDonOverride !== undefined ? loaiDonOverride : xemLoaiDon;
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
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-don-hang", filterTrangThai, filterNguoiTao, filterNguoiNhanHang, filterTuNgay, filterDenNgay, effectiveLoaiDon, debouncedQ, page],
    queryFn: () =>
      api.get<{ rows: DonHangRow[]; page: number; pageSize: number; total: number }>(
        "/dat-mua-lk/don-hang" +
          buildQuery({
            trang_thai: filterTrangThai || undefined,
            nguoi_tao: filterNguoiTao || undefined,
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            tu_ngay: filterTuNgay || undefined,
            den_ngay: filterDenNgay || undefined,
            loai_don: effectiveLoaiDon || undefined,
            q: debouncedQ || undefined,
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
  }, [filterTrangThai, filterNguoiTao, filterNguoiNhanHang, filterTuNgay, filterDenNgay, effectiveLoaiDon, debouncedQ]);

  const { data: veTinhData } = useQuery({
    queryKey: ["dat-mua-lk-ve-tinh-cua-toi"],
    queryFn: () => api.get<{ rows: { email: string; ten: string | null }[] }>("/dat-mua-lk/ve-tinh-cua-toi"),
    enabled: canBulkTram,
  });

  // Giai doan 4b - TN nhom/loc hang doi theo nguoi nhan hang (diem 5 yeu cau).
  const { data: nguoiNhanHangData } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: NguoiNhanHangKhaDungRow[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
    enabled: canTacNghiep,
  });
  // loaiDonCounts (so dong dang mo theo loai don) da chuyen len DatMuaLinhKienModule.tsx lam badge
  // do tren 3 tab "Mua hang/Cong no/Tra hang" (phan hoi 2026-08-19) - khong con dung o day.

  const bulkMutation = useMutation({
    // "ids" truyen tuong minh (khong doc "selected" qua closure) - cho phep goi truc tiep voi 1 dong
    // don le (thao tac nhanh tren tung dong trong DonHangGroupedList) ma khong dung den state
    // `selected` (chi danh cho chon hang loat cua Tram).
    mutationFn: ({ ids, hanh_dong, ly_do_cham_id, ghi_chu }: { ids: string[]; hanh_dong: "duyet" | "tu_choi" | "huy"; ly_do_cham_id?: number; ghi_chu?: string }) =>
      api.post<{ results: Record<string, string> }>("/dat-mua-lk/don-hang/bulk-log", { ids, hanh_dong, ly_do_cham_id, ghi_chu }),
    onSuccess: (res) => {
      setActionTarget(null);
      setBulkLyDoChamId("");
      setActionGhiChu("");
      const entries = Object.entries(res.results);
      const failed = entries.filter(([, v]) => v in BULK_LOG_ERROR_MESSAGES);
      // Phase 4 (bulk retry, phan hoi Codex 2026-08-19 roadmap goc): that bai 1 phan thi CHI giu lai
      // dung cac dong loi trong `selected` (thay vi xoa het) - nguoi dung bam lai nut bulk 1 lan nua
      // la retry DUNG cac dong that bai, khong phai do tim lai tay trong danh sach.
      setSelected(new Set(failed.map(([lineId]) => lineId)));
      if (failed.length === 0) {
        addToast(`Đã xử lý thành công ${entries.length} dòng`);
      } else {
        const detail = failed.map(([lineId, code]) => `${lineId}: ${BULK_LOG_ERROR_MESSAGES[code] ?? code}`).join("; ");
        addToast(`Thành công ${entries.length - failed.length}/${entries.length} dòng. Thất bại: ${detail} — đã giữ lại các dòng lỗi, bấm lại để thử lại`);
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
    // ghi_chu nay BAT BUOC (hang muc #19 2026-08-25), nut xac nhan da disable san khi rong.
    if (targetRow?.trang_thai === "Cho TBP xac nhan" || targetRow?.trang_thai === "Cho Tram duyet") {
      if (!actionGhiChu.trim()) return;
      bulkMutation.mutate({ ids, hanh_dong: "tu_choi", ghi_chu: actionGhiChu.trim() });
      return;
    }
    // Bulk (id === "bulk") co the gom lan CA dong "Cho Tram duyet" VA "Cho TN duyet" (Admin xem duoc
    // ca 2 vai) - dong Tram BAT BUOC actionGhiChu rieng (khong dung ly_do_cham_id), dong TN BAT BUOC
    // bulkLyDoChamId - modal chi hien field tuong ung neu co dong loai do trong lua chon (xem
    // bulkCoDongTram/bulkCoDongTN o JSX ben duoi), nen chi validate field NAO thuc su can.
    const coDongTram = ids.some((i) => pageRows.find((r) => r.id === i)?.trang_thai === "Cho Tram duyet");
    const coDongTN = ids.some((i) => pageRows.find((r) => r.id === i)?.trang_thai === "Cho TN duyet");
    if (coDongTN && !bulkLyDoChamId) return;
    if (coDongTram && !actionGhiChu.trim()) return;
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
    if (r.trang_thai === "Cho TN duyet") return a.duyet || a.tuChoi;
    return false;
  });
  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "Preview truoc bulk action") - tong tien cua CAC
  // DONG DANG CHON, hien kem so dong trong nut xac nhan bulk de nguoi dung thay ro quy mo truoc khi
  // bam xac nhan lan 2 (xem BulkConfirmButton).
  const tongTienDaChon = pageRows.filter((r) => selected.has(r.id)).reduce((s, r) => s + (r.gia_de_xuat ?? 0) * r.so_luong_de_xuat, 0);

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

  const activeFilterCount = [filterTrangThai, filterNguoiTao, filterNguoiNhanHang, filterTuNgay, filterDenNgay, filterQ].filter(Boolean).length;

  return (
    <div className="mt-4">
      {/* UI redesign (phan hoi 2026-08-19): sub-tab "Mua hang/Cong no/Tra hang" + nut "+ Tao don" da
          bo khoi day - sub-tab gio la 3 tab THAT o thanh tab tren cung (xem DatMuaLinhKienModule.tsx,
          xemLoaiDon truyen xuong qua prop), "+ Tao don" trung chuc nang voi "Buoc 0 - Tao don" da co
          san tren pipeline (canCreateDon/onCreateDon, luon hien moi tab). Toan bo bo loc con lai (tim
          kiem/trang thai/nguoi tao-ngay/nguoi nhan hang) gom CHUNG 1 nut thu gon/mo rong duy nhat -
          muc tieu "ngay sau tab tren cung la den bang danh sach", khong con hang loc chiem san dien
          tich khi chua can dung den. */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Btn size="sm" variant="ghost" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? "▲ Ẩn bộ lọc" : `☰ Bộ lọc${activeFilterCount > 0 ? ` (${activeFilterCount})` : ""} ▾`}
        </Btn>
        <input
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
          placeholder="Tìm theo mã LK, tên LK, mã đơn, người tạo, người nhận, mã YCSC..."
          className="focus-ring bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-64"
        />
      </div>
      {showFilters && (
        <div className="mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-xl p-3 flex flex-col gap-3">
          {/* Bo loc trang thai chi ap dung cho dat_don_hang_log (mua/cong no) - dong tra_hang dung
              trang_thai cua tra_hang_log rieng, khong khop danh sach option ben duoi nen an di. */}
          {xemLoaiDon !== "tra_hang" && (
            <TrangThaiChipFilter value={filterTrangThai} onChange={setFilterTrangThai} options={DON_CUA_TOI_TRANG_THAI_OPTIONS} />
          )}
          {(canBulkTram || (canTacNghiep && (nguoiNhanHangData?.rows.length ?? 0) > 0)) && (
            <div className="flex gap-2 flex-wrap items-center">
              {canBulkTram && (
                <div
                  className="flex items-center gap-2 flex-wrap"
                  title="Lọc theo Vệ tinh + khoảng ngày tạo đơn (dành cho Trạm xem đơn của Vệ tinh mình quản lý)"
                >
                  <Select
                    value={filterNguoiTao}
                    onChange={setFilterNguoiTao}
                    options={[
                      { value: "", label: "Tất cả người tạo" },
                      ...(veTinhData?.rows ?? []).map((v) => ({ value: v.email, label: formatPersonDisplay(v.email, personDir) })),
                    ]}
                  />
                  <span className="text-xs text-[var(--ink-500)]">Từ ngày</span>
                  <input
                    type="date"
                    value={filterTuNgay}
                    onChange={(e) => setFilterTuNgay(e.target.value)}
                    className="focus-ring bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <span className="text-xs text-[var(--ink-500)]">Đến ngày</span>
                  <input
                    type="date"
                    value={filterDenNgay}
                    onChange={(e) => setFilterDenNgay(e.target.value)}
                    className="focus-ring bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
              )}
              {canTacNghiep && (nguoiNhanHangData?.rows.length ?? 0) > 0 && (
                <Select
                  value={filterNguoiNhanHang}
                  onChange={setFilterNguoiNhanHang}
                  options={[
                    { value: "", label: "Tất cả người nhận hàng" },
                    ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: ktvOptionLabel(r, nguoiNhanHangData?.rows ?? []) })),
                  ]}
                />
              )}
            </div>
          )}
        </div>
      )}
      {/* SUA (ra soat #3): bo chip "Trạng thái: ..." khoi day - da hien TRUNG voi chip dang to sang
          (highlighted) ngay trong TrangThaiChipFilter o tren, gay cam giac "2 noi cung bao 1 thu". Cac
          chip con lai (nguoi tao/nguoi nhan hang/ngay/tim kiem) khong co hien thi truc quan nao khac
          nen GIU nguyen. */}
      <ActiveFiltersBar
        chips={[
          ...(filterNguoiTao ? [{ label: "Người tạo đã lọc", onClear: () => setFilterNguoiTao("") }] : []),
          ...(filterNguoiNhanHang ? [{ label: "Người nhận hàng đã lọc", onClear: () => setFilterNguoiNhanHang("") }] : []),
          ...(filterTuNgay ? [{ label: `Từ ngày ${filterTuNgay}`, onClear: () => setFilterTuNgay("") }] : []),
          ...(filterDenNgay ? [{ label: `Đến ngày ${filterDenNgay}`, onClear: () => setFilterDenNgay("") }] : []),
          ...(filterQ ? [{ label: `Tìm: "${filterQ}"`, onClear: () => setFilterQ("") }] : []),
        ]}
      />
      {/* CHOT #17: doi cau chu ro pham vi ap dung - truoc day "...tren trang nay" de hieu nham la chi
          ap dung cho 1 nhom KTV dang nhin thay gan checkbox nay, trong khi thuc te DonHangGroupedList
          gom nhieu nhom KTV/trang khac nhau va "Chon tat ca" ap dung xuyen suot MOI nhom. */}
      {(canActAsTram || canTacNghiep) && rowsCoTheChon.length > 0 && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <input type="checkbox" checked={rowsCoTheChon.length > 0 && selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />
          {/* Phan hoi 2026-08-19: mo rong bulk cho dong "Cho TN duyet" - danh sach chon co the gom
              CA dong Tram lan TN (vd Admin xem duoc ca 2) nen doi cau chu chung, khong con gia dinh
              chi co "cho Tram duyet". */}
          <span className="text-[var(--ink-500)]">Chọn tất cả {rowsCoTheChon.length} dòng có thể xử lý (trên mọi nhóm KTV ở trang này)</span>
        </div>
      )}
      {/* Toolbar hang loat (concept 1 "Structured Neutral" - pattern .bulkbar): nen indigo nhat, vien
          indigo mo, chu indigo dam - thay cho khoi surface-100 trung mau voi cac panel loc khac truoc
          day, giup phan biet ro day la thanh HANH DONG (dang co dong duoc chon) chu khong phai bo loc. */}
      {(canActAsTram || canTacNghiep) && selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 bg-[var(--ocean-100)] border border-[#C7D2FE] text-[var(--ocean-900)] rounded-lg px-3 py-2 text-[12.5px]">
          <span><b className="font-extrabold">{selected.size}</b> đơn được chọn{tongTienDaChon > 0 ? ` · ${fmtVND(tongTienDaChon)}` : ""}</span>
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <BulkConfirmButton
              label="Duyệt tất cả"
              confirmLabel={`Xác nhận duyệt ${selected.size} dòng?`}
              count={selected.size}
              onConfirm={() => bulkMutation.mutate({ ids: [...selected], hanh_dong: "duyet" })}
              disabled={bulkMutation.isPending}
              loading={bulkMutation.isPending}
            />
            {/* FIX (phan hoi 2026-08-25, hang muc #19): nhanh Tram (!canTacNghiep) truoc day bam la
                tu choi NGAY khong qua modal nao - backend nay bat buoc ghi_chu nen phai qua cung
                modal "tu_choi"/"bulk" (them o nut chua goi setActionTarget) de nhap ly do truoc. */}
            <Btn size="sm" variant="danger" onClick={() => setActionTarget({ id: "bulk", action: "tu_choi" })} disabled={bulkMutation.isPending}>
              Từ chối tất cả
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
        return (
          <Modal
            open={actionTarget?.id === "bulk" && actionTarget.action === "tu_choi"}
            onClose={() => { setActionTarget(null); setBulkLyDoChamId(""); setActionGhiChu(""); }}
            title={`Từ chối ${selected.size} dòng đã chọn`}
          >
            <div className="space-y-3">
              {bulkCoDongTN && (
                <Select
                  value={bulkLyDoChamId}
                  onChange={setBulkLyDoChamId}
                  options={[{ value: "", label: "-- Chọn lý do chậm --" }, ...(bulkLyDoData?.rows ?? []).map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                  className="w-full"
                />
              )}
              {/* Hang muc #19 (2026-08-25): dong "Cho Tram duyet" trong lua chon bat buoc ghi_chu rieng
                  (backend khong con nhan tuy chon). O luon o day de phuc vu ca truong hop chon lan
                  ca 2 loai dong (Admin dong thoi xem duoc ca Tram lan TN). */}
              {bulkCoDongTram && (
                <div>
                  <label className="block text-[10.5px] font-bold text-[var(--ink-500)] uppercase tracking-wide mb-1">
                    Lý do từ chối cho các dòng đang chờ Trạm duyệt (bắt buộc)
                  </label>
                  <input
                    value={actionGhiChu}
                    onChange={(e) => setActionGhiChu(e.target.value)}
                    placeholder="Lý do từ chối (bắt buộc)"
                    className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
              )}
              {bulkCoDongTN && (
                <div className="text-xs text-[var(--ink-500)]">
                  Lý do chậm chỉ áp dụng cho các dòng đang chờ tác nghiệp (TN) xử lý trong lựa chọn.
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Btn variant="ghost" onClick={() => { setActionTarget(null); setBulkLyDoChamId(""); setActionGhiChu(""); }}>Huỷ</Btn>
                <Btn
                  variant="danger"
                  onClick={confirmTuChoiChe}
                  disabled={(bulkCoDongTN && !bulkLyDoChamId) || (bulkCoDongTram && !actionGhiChu.trim()) || bulkMutation.isPending}
                >
                  Xác nhận từ chối
                </Btn>
              </div>
            </div>
          </Modal>
        );
      })()}
      <DonHangGroupedList
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
      />
      {detailId && (
        <DonHangDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          canTPDvbhXacNhan={canTPDvbhXacNhan}
          canActAsTram={canActAsTram}
          currentEmail={user?.email ?? ""}
          canXemChiTietCa={canXemChiTietCa}
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
interface EnrichedRow {
  d: DonHangRow;
  actions: { duyet: boolean; tuChoi: boolean; choHang: boolean; huy: boolean };
  tone: { tone: BadgeTone; label: string; border: string };
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
}: {
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
}) {
  const ktvDisplayMap = useKtvDisplayMap();
  // Xem chi tiet linh kien (phan hoi 2026-08-19: "Click vào tên linh kiện sẽ mở UI xem thông tin chi
  // tiết của linh kiện đó") - tai dung LinhKienDetailModal da co san (LinhKienPicker.tsx, dung boi
  // TaoDonTab). danhMuc/rankMap/canEditDanhMuc can THEM o day vi component nay truoc gio khong doc
  // danh muc (chi hien snapshot ten/ma da luu san tren dong don hang).
  const { danhMuc } = useLkAndLdeCache(true);
  const rankMap = useLinhKienRankMap();
  const auth = useAuth();
  const canEditDanhMuc = auth.status === "authenticated" && !!(auth.user.quan_ly_danh_muc_lk || auth.user.vai_tro === "Admin");
  // Tach 2 nhom Ly do cham theo quan_ly_don_thieu_linh_kien (xem comment actionsFor.choHang o
  // helpers.ts) - dung cho ca nut "Chờ hàng" rieng tren tung dong.
  const choHangReasons = (bulkLyDoData?.rows ?? []).filter((l) => l.quan_ly_don_thieu_linh_kien);
  const tuChoiReasons = (bulkLyDoData?.rows ?? []).filter((l) => !l.quan_ly_don_thieu_linh_kien);
  const [detailLk, setDetailLk] = useState<string | null>(null);
  function openLkDetail(maLk: string) {
    if (danhMuc.some((m) => m.ma_linh_kien === maLk)) setDetailLk(maLk);
    else addToast("Không tìm thấy linh kiện này trong danh mục (có thể đã bị ẩn/xoá)");
  }

  // Tuy chinh cot (them 2026-08-21, "hợp nhất phong cách giao diện" - Mua hang/Cong no truoc day la
  // MAN DUY NHAT khong co "⚙ Tuy chinh cot" trong khi Trả hàng/PXK/Thiếu LK/Danh mục LK deu co). Dung
  // lai CHINH useColumnConfig ma PaginatedTable dung (xem useColumnConfig.ts) - goi 1 LAN o day (CAP
  // TOAN BO danh sach, khong phai tung nhom KTV) vi moi nhom render 1 <table> RIENG (xem SUA LECH COT
  // ben duoi) nhung PHAI dung chung 1 cau hinh cot/do rong, khong the goi hook nay o trong moi nhom.
  // Mobile van GIU nguyen the doc rieng (khong doc effectiveColumns) - tuy chinh cot la khai niem cua
  // BANG desktop, the mobile da gon san khong can an bot truong.
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
      header: "Linh kiện",
      render: (row) => (
        <>
          <div className="font-mono text-[10px] text-[var(--ink-400)] truncate">{row.d.ma_lk}</div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openLkDetail(row.d.ma_lk); }}
            title="Xem chi tiết linh kiện"
            className={`block w-full truncate text-left font-medium hover:underline hover:text-[var(--ocean-600)] ${row.rowStyle}`}
          >
            {row.d.uu_tien === 1 && <span title="Ưu tiên" className="text-[var(--orange-600)] font-extrabold">⭐ </span>}
            {row.d.ten_lk_snapshot ?? row.d.ma_lk}
            {!!row.d.dac_thu && <span title="Linh kiện đặc thù"> 🔒</span>}
          </button>
        </>
      ),
    },
    { key: "loai", header: "Loại", render: (row) => <Badge tone={row.tone.tone}>{row.tone.label}</Badge> },
    { key: "sl", header: "SL", className: "text-right", render: (row) => row.d.so_luong_de_xuat },
    { key: "gia", header: "Giá đề xuất", className: "text-right", render: (row) => (row.d.gia_de_xuat != null ? <span className="text-[var(--green-700)] font-semibold">{fmtVND(row.d.gia_de_xuat)}</span> : "—") },
    {
      key: "ma_ycsc",
      header: "Mã yêu cầu sự cố",
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
      key: "trang_thai",
      header: "Trạng thái",
      render: (row) => (
        <div className="flex flex-col gap-0.5 items-start">
          <StatusBadge value={row.d.trang_thai ?? ""} tones={DON_HANG_TRANG_THAI_TONE_ALL} options={DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL} />
          {row.d.qua_han_ly_do_cham && <Badge tone="coral">Quá hạn - cần lý do</Badge>}
        </div>
      ),
    },
    {
      key: "hanh_dong",
      header: "",
      mobileHint: "actions",
      render: (row) => (
        <div className="flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {row.actions.duyet && (
            <Btn
              size="sm"
              variant="ghost"
              className="px-2"
              title="Duyệt"
              aria-label="Duyệt"
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
            <Btn size="sm" variant="ghost" className="px-2" title="Chờ hàng" aria-label="Chờ hàng" onClick={() => setActionTarget({ id: row.d.id, action: "cho_hang" })} disabled={bulkMutation.isPending}>
              ⏳
            </Btn>
          )}
          {row.actions.tuChoi && (
            <Btn
              size="sm"
              variant="danger"
              className="px-2"
              title="Từ chối"
              aria-label="Từ chối"
              onClick={() => setActionTarget({ id: row.d.id, action: "tu_choi" })}
              disabled={bulkMutation.isPending}
            >
              ✕
            </Btn>
          )}
          {row.actions.huy && (
            <Btn size="sm" variant="ghost" className="px-2" title="Hủy" aria-label="Hủy" onClick={() => setActionTarget({ id: row.d.id, action: "huy" })} disabled={bulkMutation.isPending}>
              🚫
            </Btn>
          )}
        </div>
      ),
    },
  ];
  const {
    effectiveColumns, toggleableColumns, resolvedOrder, colWidths,
    settingsOpen, setSettingsOpen, dragOverKey, setDragOverKey, draggedColKey,
    toggleColumn, handleColumnDrop, handleResizeStart,
  } = useColumnConfig(cols, [], [], "dmlk-don-hang-list");
  const settingsButtonEl = (
    <ColumnSettingsButton
      toggleableColumns={toggleableColumns}
      resolvedOrder={resolvedOrder}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      toggleColumn={toggleColumn}
    />
  );

  if (isLoading) return <div className="text-sm text-[var(--ink-500)] py-6 text-center">Đang tải...</div>;
  if (isError) return <div className="text-sm text-[var(--coral-500)] py-6 text-center">Lỗi tải dữ liệu.</div>;
  if (rows.length === 0) return <div className="text-sm text-[var(--ink-400)] py-6 text-center">Không có dữ liệu.</div>;

  const groups = new Map<string, DonHangRow[]>();
  for (const d of rows) {
    const key = d.nguoi_nhan_hang || d.nguoi_tao;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  return (
    <div className="space-y-2">
      {/* "⚙ Tuy chinh cot" dat rieng 1 hang o day (them 2026-08-21) - khac PaginatedTable (nut nam
          NGAY TRONG header cot ghim, vi chi co 1 <table> duy nhat), o day co NHIEU <table> doc lap
          (1/nhom KTV) nen dat NGOAI, ap dung chung cho toan bo danh sach - chi hien tren desktop
          (sm:block) vi mobile dung the doc rieng, khong doc effectiveColumns. */}
      <div className="hidden sm:flex justify-end">{settingsButtonEl}</div>
      {[...groups.entries()].map(([nguoiNhan, dongCon]) => {
        const choDuyet = dongCon.filter((d) => d.trang_thai === "Cho Tram duyet" || d.trang_thai === "Cho TBP xac nhan" || d.trang_thai === "Cho TN duyet").length;
        const dongY = dongCon.filter((d) => d.trang_thai === "TN da duyet").length;
        const tuChoi = dongCon.filter((d) => d.trang_thai === "TN tu choi").length;
        const choHang = dongCon.filter((d) => d.trang_thai === "Cho hang").length;
        const tongTien = dongCon.reduce((s, d) => s + (d.gia_de_xuat ?? 0) * d.so_luong_de_xuat, 0);
        return (
          <div key={nguoiNhan} className="border border-[var(--line)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 flex-wrap bg-[var(--surface-100)] px-3 py-2">
              <div className="flex items-center gap-3 flex-wrap text-sm">
                <span className="font-bold text-[var(--ink-900)]">{formatNguoiDisplay(nguoiNhan, ktvDisplayMap)}</span>
                <span className="text-[var(--ink-400)] text-xs">{dongCon.length} dòng</span>
                <span className="font-semibold text-[var(--green-700)]">{fmtVND(tongTien)}</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {choDuyet > 0 && <Badge tone="amber">{choDuyet} chờ duyệt</Badge>}
                {dongY > 0 && <Badge tone="teal">{dongY} đồng ý</Badge>}
                {tuChoi > 0 && <Badge tone="coral">{tuChoi} từ chối</Badge>}
                {choHang > 0 && <Badge tone="amber">{choHang} chờ hàng</Badge>}
              </div>
            </div>
            {/* CHOT #6 (ra soat module "Dat Mua Linh Kien 2.0"): bang ngang van giu cho tablet/desktop
                (sm:block), nhung tren mobile (<640px) doi sang danh sach THE DOC - truoc day moi nhom
                KTV la 1 bang 7-8 cot rieng phai cuon ngang, TN/GS xem hang chuc nhom phai cuon ngang
                lap lai N lan; the doc cuon DOC xuyen suot nhu moi danh sach khac trong app. Tinh
                actions/tone 1 lan dung chung cho ca 2 kieu hien thi, tranh trung lap logic. */}
            {(() => {
              const rowsEnriched = dongCon.map((d) => {
                const actions = actionsFor(d, { canTacNghiep, canTPDvbhXacNhan, canActAsTram, currentEmail });
                const tone = LOAI_DON_TONE[d.loai_don];
                const rowStyle = DON_HANG_ROW_STYLE[d.trang_thai ?? ""] ?? "";
                const chonDuoc = showCheckbox && (d.trang_thai === "Cho Tram duyet" || d.trang_thai === "Cho TN duyet") && (actions.duyet || actions.tuChoi);
                return { d, actions, tone, rowStyle, chonDuoc };
              });
              return (
                <>
                  <div className="hidden sm:block overflow-x-auto border-t border-[var(--line)]">
                    {/* SUA LECH COT (phan hoi 2026-08-18): moi nhom KTV render 1 <table> RIENG (mot
                        group = mot table). Truoc day co dinh % do rong qua <colgroup> GIONG HET NHAU o
                        MOI table de tranh lech cot giua cac nhom; gio (2026-08-21, "hợp nhất phong
                        cách giao diện") dung effectiveColumns/colWidths TU 1 useColumnConfig() DUY
                        NHAT o component cha (khong goi trong tung nhom) nen MOI table van nhan CUNG 1
                        bo cot/do rong - khong con lech, dong thoi co them "⚙ Tuy chinh cot" (xem nut o
                        dau danh sach). */}
                    <table className="w-full min-w-[720px] text-xs border-collapse">
                      <thead>
                        {/* Khop dung header ".tbl th" concept 1 (chu hoa nho, xam, nen #FBFBFB) - dong
                            bo voi header cua PaginatedTable.tsx (xem tr className tuong tu o do). */}
                        <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[var(--surface-soft)] border-b border-[var(--line)]">
                          {effectiveColumns.map((col, idx) => (
                            <ResizableHeaderCell
                              key={col.key}
                              col={col}
                              idx={idx}
                              isPinned={idx === 0}
                              width={colWidths[col.key]}
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
                        {rowsEnriched.map((row) => (
                          <tr
                            key={row.d.id}
                            onClick={() => onDetail(row.d.id)}
                            className={`cursor-pointer transition-colors border-b border-[var(--line)] last:border-0 ${row.tone.border} border-l-4 ${
                              row.d.uu_tien === 1
                                ? "bg-[var(--orange-100)] ring-1 ring-inset ring-[var(--orange-500)] hover:brightness-95"
                                : "hover:bg-slate-50"
                            }`}
                          >
                            {effectiveColumns.map((col) => {
                              const width = colWidths[col.key];
                              return (
                                <td key={col.key} style={width ? { width, maxWidth: width, overflow: "hidden" } : undefined} className={`px-3 py-2 ${col.className ?? ""}`}>
                                  {col.render(row)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="sm:hidden border-t border-[var(--line)] divide-y divide-[var(--line)]">
                    {rowsEnriched.map(({ d, actions, tone, rowStyle, chonDuoc }) => (
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
                            <div className="font-mono text-[10px] text-[var(--ink-400)] truncate">{d.ma_lk}</div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openLkDetail(d.ma_lk); }}
                              title="Xem chi tiết linh kiện"
                              className={`block w-full truncate text-left font-medium text-sm hover:underline hover:text-[var(--ocean-600)] ${rowStyle}`}
                            >
                              {d.uu_tien === 1 && <span title="Ưu tiên" className="text-[var(--orange-600)] font-extrabold">⭐ </span>}
                              {d.ten_lk_snapshot ?? d.ma_lk}
                              {!!d.dac_thu && <span title="Linh kiện đặc thù"> 🔒</span>}
                            </button>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              <Badge tone={tone.tone}>{tone.label}</Badge>
                              <StatusBadge value={d.trang_thai ?? ""} tones={DON_HANG_TRANG_THAI_TONE_ALL} options={DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL} />
                              {d.qua_han_ly_do_cham && <Badge tone="coral">Quá hạn - cần lý do</Badge>}
                            </div>
                            <div className="text-xs text-[var(--ink-500)] mt-1">
                              SL {d.so_luong_de_xuat} · {d.gia_de_xuat != null ? <span className="text-[var(--green-700)] font-semibold">{fmtVND(d.gia_de_xuat)}</span> : "—"}
                            </div>
                            {d.ma_yeu_cau_su_co && (
                              <div className="text-xs mt-1" onClick={(e) => e.stopPropagation()}>
                                <MaYcscCell value={d.ma_yeu_cau_su_co} canXemChiTietCa={canXemChiTietCa} openCase={openCase} />
                              </div>
                            )}
                            <div className="flex gap-1 flex-wrap mt-1.5" onClick={(e) => e.stopPropagation()}>
                              {actions.duyet && (
                                <Btn
                                  size="sm"
                                  variant="ghost"
                                  className="px-2"
                                  title="Duyệt"
                                  aria-label="Duyệt"
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
                                <Btn size="sm" variant="ghost" className="px-2" title="Chờ hàng" aria-label="Chờ hàng" onClick={() => setActionTarget({ id: d.id, action: "cho_hang" })} disabled={bulkMutation.isPending}>
                                  ⏳
                                </Btn>
                              )}
                              {actions.tuChoi && (
                                <Btn
                                  size="sm"
                                  variant="danger"
                                  className="px-2"
                                  title="Từ chối"
                                  aria-label="Từ chối"
                                  onClick={() => setActionTarget({ id: d.id, action: "tu_choi" })}
                                  disabled={bulkMutation.isPending}
                                >
                                  ✕
                                </Btn>
                              )}
                              {actions.huy && (
                                <Btn size="sm" variant="ghost" className="px-2" title="Hủy" aria-label="Hủy" onClick={() => setActionTarget({ id: d.id, action: "huy" })} disabled={bulkMutation.isPending}>
                                  🚫
                                </Btn>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        );
      })}
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
        const isTuChoiTBP =
          !!targetId && actionTarget?.action === "tu_choi" && (rowTarget?.trang_thai === "Cho TBP xac nhan" || rowTarget?.trang_thai === "Cho Tram duyet");
        const isTuChoiTN = !!targetId && actionTarget?.action === "tu_choi" && !isTuChoiTBP;
        const isChoHang = !!targetId && actionTarget?.action === "cho_hang";
        const isDuyetTaoHo = !!targetId && actionTarget?.action === "duyet_tao_ho";
        const isDuyetQuaHan = !!targetId && actionTarget?.action === "duyet_qua_han";
        return (
          <>
            {/* Canh bao "Công nợ tạo hộ" (them 2026-08-24, muc 4) - nut nhanh (✓) tren dong bang/the
                mobile, xem isCongNoTaoHo o helpers.ts. */}
            <Modal open={isDuyetTaoHo} onClose={() => setActionTarget(null)} title="Cảnh báo">
              <div className="space-y-3 text-sm">
                <div className="font-semibold text-[var(--coral-600)]">(!!!) Đơn công nợ này được tạo hộ! Bạn có chắc đồng ý phê duyệt không?</div>
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" size="sm" onClick={() => setActionTarget(null)}>Huỷ</Btn>
                  <Btn
                    size="sm"
                    onClick={() => {
                      if (targetId) bulkMutation.mutate({ ids: [targetId], hanh_dong: "duyet" });
                      setActionTarget(null);
                    }}
                  >
                    Đồng ý phê duyệt
                  </Btn>
                </div>
              </div>
            </Modal>
            <Modal open={isTuChoiTBP} onClose={() => { setActionTarget(null); setActionGhiChu(""); }} title={`Từ chối dòng ${targetId} — nhập lý do`}>
              <div className="space-y-3">
                <input
                  value={actionGhiChu}
                  onChange={(e) => setActionGhiChu(e.target.value)}
                  placeholder="Lý do từ chối (bắt buộc)"
                  className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => { setActionTarget(null); setActionGhiChu(""); }}>Hủy</Btn>
                  <Btn variant="danger" onClick={confirmTuChoiChe} disabled={!actionGhiChu.trim() || bulkMutation.isPending}>Xác nhận</Btn>
                </div>
              </div>
            </Modal>
            <Modal open={isTuChoiTN} onClose={() => { setActionTarget(null); setBulkLyDoChamId(""); }} title={`Từ chối dòng ${targetId} — chọn lý do chậm`}>
              <div className="space-y-3">
                <Select
                  value={bulkLyDoChamId}
                  onChange={setBulkLyDoChamId}
                  options={[{ value: "", label: "-- Chọn lý do --" }, ...tuChoiReasons.map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                  className="w-full"
                />
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => { setActionTarget(null); setBulkLyDoChamId(""); }}>Hủy</Btn>
                  <Btn variant="danger" onClick={confirmTuChoiChe} disabled={!bulkLyDoChamId || bulkMutation.isPending}>Xác nhận</Btn>
                </div>
              </div>
            </Modal>
            <Modal open={isChoHang} onClose={() => { setActionTarget(null); setBulkLyDoChamId(""); }} title={`Chuyển dòng ${targetId} sang chờ hàng — chọn lý do`}>
              <div className="space-y-3">
                <Select
                  value={bulkLyDoChamId}
                  onChange={setBulkLyDoChamId}
                  options={[{ value: "", label: "-- Chọn lý do --" }, ...choHangReasons.map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                  className="w-full"
                />
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => { setActionTarget(null); setBulkLyDoChamId(""); }}>Hủy</Btn>
                  <Btn onClick={confirmTuChoiChe} disabled={!bulkLyDoChamId || bulkMutation.isPending}>Xác nhận chờ hàng</Btn>
                </div>
              </div>
            </Modal>
            {/* Hang muc #17/#18 (2026-08-25): dong da qua han 24h "Cho TN duyet" chua co ly_do_cham -
                bam Duyet bat buoc chon 1 ly do TRUOC khi thuc su duyet, dung LAI toan bo danh sach ly
                do (khong tach nhom nhu tu_choi/cho_hang vi day khong phai tu choi/mo ticket thieu
                hang, chi la giai trinh ly do cham xu ly). */}
            <Modal open={isDuyetQuaHan} onClose={() => { setActionTarget(null); setBulkLyDoChamId(""); }} title={`Duyệt dòng ${targetId} đã quá hạn — chọn lý do chậm`}>
              <div className="space-y-3">
                <div className="text-xs text-[var(--coral-600)]">Đơn này đã quá 24h chưa được tiếp nhận. Vui lòng chọn lý do trước khi duyệt.</div>
                <Select
                  value={bulkLyDoChamId}
                  onChange={setBulkLyDoChamId}
                  options={[{ value: "", label: "-- Chọn lý do --" }, ...(bulkLyDoData?.rows ?? []).map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                  className="w-full"
                />
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => { setActionTarget(null); setBulkLyDoChamId(""); }}>Hủy</Btn>
                  <Btn onClick={confirmDuyetQuaHan} disabled={!bulkLyDoChamId || bulkMutation.isPending}>Xác nhận duyệt</Btn>
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
                <span className="text-xs font-semibold">Hủy dòng {targetId} — nhập lý do</span>
                <input
                  value={actionGhiChu}
                  onChange={(e) => setActionGhiChu(e.target.value)}
                  placeholder="Lý do hủy (bắt buộc)"
                  className="focus-ring flex-1 min-w-[160px] bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs"
                />
                <Btn size="sm" variant="danger" onClick={confirmHuyChe} disabled={!actionGhiChu.trim() || bulkMutation.isPending}>Xác nhận hủy</Btn>
                <Btn size="sm" variant="ghost" onClick={() => { setActionTarget(null); setActionGhiChu(""); }}>Đóng</Btn>
              </div>
            )}
          </>
        );
      })()}
      {/* Dong bo chan trang phan trang voi PaginatedTable (them 2026-08-21, "hợp nhất phong cách giao
          diện") - truoc day chi co "‹ Trước/Trang N/Sau ›", khong hien tong so dong nhu 3 man con lai. */}
      <div className="flex items-center justify-between px-1 py-2 text-xs text-[var(--ink-400)]">
        <span>{total} dòng</span>
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
            canEdit={canEditDanhMuc}
            onClose={() => setDetailLk(null)}
            addToast={addToast}
            qc={qc}
          />
        ) : null;
      })()}
    </div>
  );
}

