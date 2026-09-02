import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Drawer, DrawerNavButtons, useDrawerArrowNav } from "../../components/ui/Drawer";
import type { Column } from "../../components/ui/PaginatedTable";
import { useColumnConfig } from "../../components/ui/useColumnConfig";
import { ColumnSettingsButton, ResizableHeaderCell } from "../../components/ui/ColumnHeader";
import { KvRow } from "../../components/ui/KvRow";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { Timeline } from "../../components/ui/Timeline";
import { api, buildQuery } from "../../api/client";
import { fmtDateTime } from "../../types";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import type { ThieuLkRow, LyDoChamRow } from "./types";
import { THIEU_LK_TRANG_THAI_TONE, THIEU_LK_TRANG_THAI_OPTIONS } from "./constants";
import { describeApiError, formatNguoiDisplay, useKtvDisplayMap, invalidatePipelineCounts, trangThaiLabel, LOAI_DON_TONE } from "./helpers";
import { StatusBadge, TrangThaiDropdownFilter, BulkConfirmButton, FilterSearchBar, ActiveFiltersBar, KhuVucChipFilter } from "./SharedUi";

// Nhan "Ưu tiên" (concept 1 "Structured Neutral" da duyet, 2026-08-24, pattern ".priority-tag") - thay
// cho ngoi sao "⭐" tho truoc day, presentational thuan tuy (khong doc/ghi state).
function PriorityTag() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[var(--orange-600)] font-extrabold text-xs" title="Đơn ưu tiên">
      <span aria-hidden>★</span>Ưu tiên
    </span>
  );
}

// ---------- Tab "Thieu linh kien" ----------

// Nang len module-level (truoc o trong ThieuLkTab, dong closure qua canKho/canTacNghiep/currentEmail)
// - ThieuLkDetailModal (them 2026-08-21, bo sung nut hanh dong vao Drawer theo phan hoi "nút chức
// năng không hiện trong drawer") cung can dung, nhan ctx qua tham so thay vi dong qua closure.
function nextStatesForThieuLk(
  r: ThieuLkRow,
  ctx: { canKho: boolean; canTacNghiep: boolean; currentEmail: string },
): { trangThai: string; canDo: boolean }[] {
  const isCreator = r.nguoi_tao === ctx.currentEmail;
  if (r.trang_thai === "Cho kho xu ly")
    return [
      { trangThai: "Kho da tiep nhan", canDo: ctx.canKho },
      { trangThai: "Kho tu choi sai TT", canDo: ctx.canKho },
      { trangThai: "Da huy bo", canDo: isCreator },
    ];
  if (r.trang_thai === "Kho da tiep nhan")
    return [
      { trangThai: "Kho xac nhan hang da ve", canDo: ctx.canKho },
      { trangThai: "Da huy bo", canDo: ctx.canKho || isCreator },
    ];
  if (r.trang_thai === "Kho xac nhan hang da ve") return [{ trangThai: "Da ket thuc", canDo: ctx.canTacNghiep }];
  return [];
}

// SUA (phan hoi 2026-08-21: "button 'Đã hủy bỏ' => thành 'Hủy bỏ'") - THIEU_LK_TRANG_THAI_OPTIONS
// dung 1 nhan CHUNG "Đã huỷ bỏ" cho ca 2 vai tro khac nhau: hien trang thai DA XAY RA (StatusBadge,
// lich su xu ly - dung THI QUA KHU la dung) va nhan cho HANH DONG sap bam (nut/tieu de Modal/nut xac
// nhan bulk - can THE MENH LENH, khong phai qua khu). Ham nay CHI dung cho nhom hanh dong, tra ve
// nhan khac trangThaiLabel() dung cho nhom trang thai - hien chi "Da huy bo" can tach, cac gia tri
// khac giu nguyen (dung chung 1 nhan cho ca 2 vai tro).
function actionLabel(trangThai: string): string {
  if (trangThai === "Da huy bo") return "Hủy bỏ";
  return trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, trangThai);
}

export function ThieuLkTab({
  addToast, qc, canKho, canTacNghiep, currentEmail, initialFilterOverride,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>; canKho: boolean; canTacNghiep: boolean; currentEmail: string;
  initialFilterOverride?: string;
}) {
  // FIX (ra soat bug mua hang 2026-08-26, BUG-002): tach lop luu-lau-dai (localStorage) khoi lop
  // hien-thi/query - jump tu Home/Pipeline CHI doi lop hien thi, khong ghi de vinh vien filter da luu
  // (dung y "giữ filter đã lưu gần nhất" cua chu he thong). Xem giai thich day du o DonCuaToiTab.tsx.
  // Kho mac dinh loc dung hang doi cua ho ("Cho kho xu ly"), con lai giu "Tat ca".
  const [savedFilterTrangThai, setSavedFilterTrangThai] = useLocalStorageState("filters:dmlk-tlk-tt", canKho ? "Cho kho xu ly" : "");
  // FIX (phan hoi 2026-08-28: nhay tu Trang chu lan dau hien danh sach trong, bam lai moi dung) - khoi
  // tao TRUC TIEP tu initialFilterOverride khi co, xem giai thich day du o PhieuXuatKhoTab.tsx.
  const [filterTrangThai, setFilterTrangThaiDisplay] = useState(initialFilterOverride ?? savedFilterTrangThai);
  function setFilterTrangThai(v: string) {
    setFilterTrangThaiDisplay(v);
    setSavedFilterTrangThai(v);
  }
  useEffect(() => {
    if (initialFilterOverride !== undefined) setFilterTrangThaiDisplay(initialFilterOverride);
  }, [initialFilterOverride]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionTrangThai, setActionTrangThai] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [ngayDuKien, setNgayDuKien] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ktvDisplayMap = useKtvDisplayMap();
  // Them 2026-08-21 (dong bo giao dien voi Mua hang/Cong no - "hợp nhất phong cách giao diện"): o
  // tim kiem tu do + nut thu gon "☰ Bộ lọc ▾" + Drawer chi tiet (xem ThieuLkDetailModal).
  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filterQ.trim()), 500);
    return () => clearTimeout(t);
  }, [filterQ]);
  const [showFilters, setShowFilters] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Bo loc Khu vuc (them 2026-08-31, dong bo voi DonCuaToiTab.tsx - xem CLAUDE.md muc kiem tra toan
  // he thong) - chi Kho (canKho) can, tab nay chi nhan prop canKho/canTacNghiep, TN giu "Tat ca" nhu
  // truoc (khong co badge rieng cho TN o day de can khop).
  const [filterKhuVuc, setFilterKhuVuc] = useState<Set<string>>(new Set());
  const khuVucDefaultAppliedRef = useRef(false);
  const { data: khuVucAllData } = useQuery({
    queryKey: ["settings-khu-vuc"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/settings/khu-vuc"),
    enabled: canKho,
  });
  const { data: khuVucCuaToiData } = useQuery({
    queryKey: ["dat-mua-lk-khu-vuc-cua-toi"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/dat-mua-lk/khu-vuc-cua-toi"),
    enabled: canKho,
  });
  // FIX (phat hien qua test 2026-08-31): "enabled: canKho" o 2 query tren KHONG du de chan du lieu -
  // React Query dung CHUNG cache theo queryKey xuyen suot app, ["dat-mua-lk-khu-vuc-cua-toi"] da duoc
  // DonCuaToiTab.tsx/PhieuXuatKhoTab.tsx/TraHangTab.tsx fetch san (enabled rong hon, gom ca TN) nen
  // component nay van "thay" duoc du lieu cache du chinh no khong tu fetch - phai chan tuong minh
  // bang canKho ngay trong effect/bien duoi, khong dua vao enabled/query rong hay co du lieu hay chua.
  useEffect(() => {
    if (!canKho) return;
    if (khuVucDefaultAppliedRef.current) return;
    if (!khuVucCuaToiData) return;
    khuVucDefaultAppliedRef.current = true;
    if (khuVucCuaToiData.rows.length > 0) setFilterKhuVuc(new Set(khuVucCuaToiData.rows.map((r) => r.ma)));
  }, [khuVucCuaToiData, canKho]);
  const khuVucOptions = canKho ? (khuVucAllData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ten })) : [];
  const khuVucParam = canKho && filterKhuVuc.size > 0 ? [...filterKhuVuc].sort().join(",") : "";

  // GD4 (phan hoi Codex #16): ve trang 1 + xoa selection dang chon khi doi bo loc trang thai.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [filterTrangThai, debouncedQ, khuVucParam]);

  // GD4 (phan hoi Codex #17): phan trang server-side - truoc day tai het toan bo dong khop bo loc
  // roi tu slice o client, moi lan doi trang van doc lai het du lieu tu D1.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-thieu-lk", filterTrangThai, debouncedQ, khuVucParam, page],
    queryFn: () =>
      api.get<{ rows: ThieuLkRow[]; total: number }>(
        "/dat-mua-lk/thieu-lk" +
          buildQuery({ trang_thai: filterTrangThai || undefined, q: debouncedQ || undefined, khu_vuc: khuVucParam || undefined, page, pageSize: 20 }),
      ),
  });
  // So "(N)" canh moi trang thai trong TrangThaiDropdownFilter (them 2026-09-01) - dem TINH theo dung
  // scope cua tab, bo qua cac bo loc phu (khu_vuc/q) - xem GET /dat-mua-lk/thieu-lk-status-counts.
  const { data: statusCountsData } = useQuery({
    queryKey: ["dat-mua-lk-thieu-lk-status-counts"],
    queryFn: () => api.get<{ counts: Record<string, number> }>("/dat-mua-lk/thieu-lk-status-counts"),
  });

  // "Kho da tiep nhan" = buoc Kho giai trinh ly do thieu hang that su + bao ngay du kien co hang
  // (dung cot trong Excel goc) - bat buoc ghi_chu, khong nhu cac buoc khac chi tuy chon.
  const isGiaiTrinh = actionTrangThai === "Kho da tiep nhan";
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #20): goi y nhanh (chip) cho o giai trinh bat buoc -
  // KHONG bulk hoa buoc nay (moi ticket thuong co ly do thuc te khac nhau, 1 ly do chung ap cho ca
  // loat se lam sai lech dung muc dich giai trinh THAT), thay vao do toi uu luong DON LE nhanh hon
  // bang chip goi y tu danh muc "Mua hang" da co san (settings_ly_do_cham) - Kho van go tu do binh
  // thuong, chip chi giup dien nhanh cac ly do hay gap.
  const { data: giaiTrinhGoiYData } = useQuery({
    queryKey: ["dat-mua-lk-ly-do-cham"],
    queryFn: () => api.get<{ rows: LyDoChamRow[] }>("/dat-mua-lk/ly-do-cham?he_thong=" + encodeURIComponent("Mua hàng")),
    enabled: canKho,
  });

  // Nhan tham so truc tiep (khong doc qua state actionId/actionTrangThai) de cac nut khong can nhap
  // lieu co the ban thang mutate() ma khong mo modal (tieu chi UX #3, sua 2026-08-15) - modal "Xac
  // nhan" van goi ham nay voi actionId/actionTrangThai hien tai cho truong hop isGiaiTrinh.
  const logMutation = useMutation({
    mutationFn: (args: { id: string; trangThai: string; ghiChu?: string; ngayDuKien?: string }) =>
      api.post(`/dat-mua-lk/thieu-lk/${args.id}/log`, {
        trang_thai: args.trangThai,
        ghi_chu: args.ghiChu?.trim() || undefined,
        ngay_du_kien_co_hang: args.ngayDuKien || undefined,
      }),
    onSuccess: () => {
      setActionId(null);
      setGhiChu("");
      setNgayDuKien("");
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      invalidatePipelineCounts(qc);
      addToast("Đã cập nhật trạng thái thiếu LK");
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // "Da ket thuc" la cua TN (khop cot "Admin xu ly" trong Excel goc), con lai la Kho. "Da huy bo"
  // cung mo cho chinh TN da tao ticket (nguoi_tao), khong chi Kho - khop quyen da co san o backend
  // (POST /thieu-lk/:id/log: isCancel cho phep nguoi_tao huy bat ky luc nao con dang mo).
  const NEXT_STATES = (r: ThieuLkRow) => nextStatesForThieuLk(r, { canKho, canTacNghiep, currentEmail });

  // Bulk-log (tieu chi UX #4, them 2026-08-15) - chi ap dung cho cac buoc KHONG can nhap lieu bat
  // buoc ("Kho da tiep nhan" can giai trinh rieng tung dong nen loai khoi bulk). Thanh hanh dong chi
  // hien cac trang thai dich CHUNG cho toan bo dong da chon (giao cua tap NEXT_STATES tung dong).
  const BULK_ELIGIBLE_STATES = ["Kho xac nhan hang da ve", "Kho tu choi sai TT", "Da huy bo", "Da ket thuc"];
  const eligibleBulkStates = (r: ThieuLkRow) => NEXT_STATES(r).filter((s) => s.canDo && BULK_ELIGIBLE_STATES.includes(s.trangThai)).map((s) => s.trangThai);
  const rowsCoTheChon = (data?.rows ?? []).filter((r) => eligibleBulkStates(r).length > 0);
  const selectedRows = (data?.rows ?? []).filter((r) => selected.has(r.id));
  const commonBulkStates =
    selectedRows.length === 0
      ? []
      : selectedRows.reduce<string[]>((acc, r, i) => (i === 0 ? eligibleBulkStates(r) : acc.filter((s) => eligibleBulkStates(r).includes(s))), []);

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
    mutationFn: (trangThai: string) => api.post<{ results: Record<string, string> }>("/dat-mua-lk/thieu-lk/bulk-log", { ids: [...selected], trang_thai: trangThai }),
    onSuccess: (res) => {
      const entries = Object.entries(res.results);
      const failed = entries.filter(([, v]) => v !== "ok");
      // Phase 4 (bulk retry): giu lai dung cac dong loi trong `selected` khi that bai 1 phan, xem
      // comment day du o DonCuaToiTab.tsx (cung pattern).
      setSelected(new Set(failed.map(([lineId]) => lineId)));
      addToast(
        failed.length === 0
          ? `Đã xử lý thành công ${entries.length} dòng`
          : `Thành công ${entries.length - failed.length}/${entries.length} dòng — đã giữ lại các dòng lỗi, bấm lại để thử lại`,
      );
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      invalidatePipelineCounts(qc);
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // FIX (ra soat bug mua hang 2026-08-26, BUG-003): thieu filterTrangThai trong bo dem - nut "☰ Bộ
  // lọc" khong bao gio hien "(N)" du dang loc theo trang thai (mac dinh Kho la "Cho kho xu ly"), va
  // panel loc mac dinh THU GON (showFilters=false) nen nguoi dung khong thay duoc dang loc gi ca. Khop
  // dung pattern da co san o DonCuaToiTab.tsx (activeFilterCount co filterTrangThai). KHONG them chip
  // rieng vao ActiveFiltersBar - gia tri dang chon da hien SAN trong o TrangThaiDropdownFilter (doi tu
  // chip/nut sang dropdown 2026-09-01), them chip nua se TRUNG LAP (xem comment tuong tu o
  // DonCuaToiTab.tsx/PhieuXuatKhoTab.tsx).
  const activeFilterCount = [filterTrangThai, filterQ, khuVucParam].filter(Boolean).length;

  return (
    <div className="mt-4">
      <FilterSearchBar
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((v) => !v)}
        activeFilterCount={activeFilterCount}
        searchValue={filterQ}
        onSearchChange={setFilterQ}
        searchPlaceholder="Tìm theo mã TLK, mã LK, tên LK, người báo..."
      >
        <TrangThaiDropdownFilter value={filterTrangThai} onChange={setFilterTrangThai} options={THIEU_LK_TRANG_THAI_OPTIONS} counts={statusCountsData?.counts} />
        {/* Bo loc Khu vuc (them 2026-08-31, dong bo voi DonCuaToiTab.tsx) - chi Kho. */}
        {canKho && khuVucOptions.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">Khu vực</div>
            <KhuVucChipFilter value={filterKhuVuc} onChange={setFilterKhuVuc} options={khuVucOptions} />
          </div>
        )}
      </FilterSearchBar>
      <ActiveFiltersBar
        chips={[
          ...(khuVucParam ? [{ label: `Khu vực: ${[...filterKhuVuc].map((ma) => khuVucOptions.find((o) => o.value === ma)?.label ?? ma).join(", ")}`, onClear: () => setFilterKhuVuc(new Set()) }] : []),
          ...(filterQ ? [{ label: `Tìm: "${filterQ}"`, onClear: () => setFilterQ("") }] : []),
        ]}
      />
      {/* Dong bo pattern "Chọn tất cả" voi DonHangGroupedList (DonCuaToiTab.tsx) - dat O DAY (thanh phan
          cha), KHONG trong ThieuLkGroupedList, vi ap dung xuyen suot MOI nhom KTV tren trang, khong
          rieng 1 nhom. */}
      {rowsCoTheChon.length > 0 && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <input type="checkbox" checked={selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />
          <span className="text-[var(--ink-500)]">Chọn tất cả {rowsCoTheChon.length} dòng có thể xử lý (trên mọi nhóm KTV ở trang này)</span>
        </div>
      )}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 bg-[var(--ocean-100)] border border-[var(--ocean-800)]/30 rounded-lg px-3 py-2">
          <span className="text-sm font-bold text-[var(--ocean-900)]">Đã chọn {selected.size} dòng</span>
          {commonBulkStates.length === 0 ? (
            <span className="text-xs text-[var(--ocean-900)]">Các dòng đã chọn không có bước xử lý chung — chọn lại theo cùng trạng thái</span>
          ) : (
            commonBulkStates.map((s) => (
              <BulkConfirmButton
                key={s}
                label={actionLabel(s)}
                confirmLabel={`Xác nhận chuyển ${selected.size} dòng sang "${actionLabel(s)}"?`}
                count={selected.size}
                onConfirm={() => bulkMutation.mutate(s)}
                disabled={bulkMutation.isPending}
                loading={bulkMutation.isPending}
              />
            ))
          )}
        </div>
      )}
      {/* SUA (phan hoi 2026-08-21: "format Thiếu LK khác Mua hàng/Công nợ") - doi tu 1 bang PHANG
          (PaginatedTable) sang danh sach NHOM THEO KTV + nut hanh dong dang ICON, dung KIEN TRUC
          giong het DonHangGroupedList (xem ThieuLkGroupedList duoi day) thay vi tu xay 1 kieu rieng. */}
      <ThieuLkGroupedList
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        page={page}
        pageSize={20}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onDetail={(id) => setDetailId(id)}
        ktvDisplayMap={ktvDisplayMap}
        nextStates={NEXT_STATES}
        onGiaiTrinh={(r) => { setActionId(r.id); setActionTrangThai("Kho da tiep nhan"); setGhiChu(""); setNgayDuKien(""); }}
        onQuickAction={(r, trangThai) => logMutation.mutate({ id: r.id, trangThai })}
        quickActionPending={logMutation.isPending}
        selected={selected}
        toggleSelectOne={toggleSelectOne}
        rowsCoTheChon={rowsCoTheChon}
      />
      {actionId && (
        <Modal open title={`Chuyển sang: ${actionLabel(actionTrangThai)}`} onClose={() => setActionId(null)}>
          <div className="space-y-3 text-sm">
            {isGiaiTrinh && (
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Ngày dự kiến có hàng</label>
                <input
                  type="date"
                  value={ngayDuKien}
                  onChange={(e) => setNgayDuKien(e.target.value)}
                  className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
              </div>
            )}
            <div>
              {isGiaiTrinh && <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Giải thích lý do thiếu hàng *</label>}
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder={isGiaiTrinh ? "Bắt buộc - giải thích thực tế vì sao thiếu hàng" : "Ghi chú (tuỳ chọn)"}
                className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
              {isGiaiTrinh && (giaiTrinhGoiYData?.rows.length ?? 0) > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-1.5">
                  {(giaiTrinhGoiYData?.rows ?? []).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setGhiChu(l.ten_ly_do)}
                      className="focus-ring px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-100)] text-[var(--ink-600)] border border-[var(--line)] hover:border-[var(--ocean-400)] hover:text-[var(--ocean-700)]"
                    >
                      {l.ten_ly_do}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setActionId(null)}>Hủy</Btn>
              <Btn
                size="sm"
                onClick={() => actionId && logMutation.mutate({ id: actionId, trangThai: actionTrangThai, ghiChu, ngayDuKien: isGiaiTrinh ? ngayDuKien : undefined })}
                disabled={logMutation.isPending || (isGiaiTrinh && !ghiChu.trim())}
              >
                Xác nhận
              </Btn>
            </div>
          </div>
        </Modal>
      )}
      {detailId && (
        <ThieuLkDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          addToast={addToast}
          qc={qc}
          canKho={canKho}
          canTacNghiep={canTacNghiep}
          currentEmail={currentEmail}
          navRows={data?.rows}
          onNavigate={setDetailId}
        />
      )}
    </div>
  );
}

// SUA (phan hoi 2026-08-21: "format Thiếu LK khác Mua hàng/Công nợ") - danh sach NHOM THEO KTV, dung
// kien truc GIONG HET DonHangGroupedList (DonCuaToiTab.tsx): 1 <table> rieng/nhom tren desktop, the
// doc tren mobile, nut hanh dong dang ICON tron thay vi nut co chu, "⚙ Tuy chinh cot" dat 1 hang rieng
// TRUOC cac nhom (khong phai trong header cot dau). Nhom theo `nguoi_nhan_hang || ddh_nguoi_tao` (KTV
// chu don, LAY TU dat_don_hang qua JOIN) - KHAC voi `nguoi_tao` cua rieng ticket thieu_lk (nguoi BAO
// thieu, thuong la Kho, khong phai KTV) nen van giu "TN báo" la 1 COT rieng trong bang, khong dung lam
// nhan nhom.
function ThieuLkGroupedList({
  rows, isLoading, isError, page, pageSize, total, onPageChange, onDetail, ktvDisplayMap,
  nextStates, onGiaiTrinh, onQuickAction, quickActionPending, selected, toggleSelectOne, rowsCoTheChon,
}: {
  rows: ThieuLkRow[];
  isLoading: boolean;
  isError: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onDetail: (id: string) => void;
  ktvDisplayMap: ReturnType<typeof useKtvDisplayMap>;
  nextStates: (r: ThieuLkRow) => { trangThai: string; canDo: boolean }[];
  onGiaiTrinh: (r: ThieuLkRow) => void;
  onQuickAction: (r: ThieuLkRow, trangThai: string) => void;
  quickActionPending: boolean;
  selected: Set<string>;
  toggleSelectOne: (id: string) => void;
  rowsCoTheChon: ThieuLkRow[];
}) {
  // Icon rieng cho tung trang thai dich (thay the nhan chu "Kho đã tiếp nhận…"/"Hủy bỏ"... o dang
  // PaginatedTable cu) - giu title/aria-label bang dung actionLabel() de khong mat thong tin cho
  // nguoi dung dung trinh doc man hinh/hover, chi phan hien thi la icon.
  const ACTION_ICON: Record<string, string> = {
    "Kho da tiep nhan": "📝",
    "Kho tu choi sai TT": "✕",
    "Da huy bo": "🚫",
    "Kho xac nhan hang da ve": "✓",
    "Da ket thuc": "🏁",
  };
  const ACTION_DANGER = new Set(["Kho tu choi sai TT", "Da huy bo"]);

  const cols: Column<ThieuLkRow>[] = [
    ...(rowsCoTheChon.length > 0
      ? [
          {
            key: "chon",
            header: "",
            render: (r: ThieuLkRow) =>
              rowsCoTheChon.some((x) => x.id === r.id) ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelectOne(r.id)} />
                </span>
              ) : null,
          } as Column<ThieuLkRow>,
        ]
      : []),
    {
      key: "linh_kien", header: "Linh kiện",
      render: (r) => (
        <>
          <div className="font-mono text-[10px] text-[var(--ink-400)] truncate">{r.ma_lk ?? r.id}</div>
          <div className="font-medium truncate">
            {r.uu_tien === 1 && <PriorityTag />}{" "}
            {r.ten_lk_snapshot ?? r.ma_lk ?? "—"}
          </div>
        </>
      ),
    },
    { key: "loai", header: "Loại", render: (r) => { const t = LOAI_DON_TONE[(r.loai_don as keyof typeof LOAI_DON_TONE) ?? "mua"] ?? LOAI_DON_TONE.mua; return <Badge tone={t.tone}>{t.label}</Badge>; } },
    { key: "nguoi_tao", header: "TN báo", render: (r) => formatNguoiDisplay(r.nguoi_tao, ktvDisplayMap) },
    { key: "ngay_tao", header: "Ngày báo", render: (r) => fmtDateTime(r.ngay_tao) },
    { key: "ngay_du_kien_co_hang", header: "Ngày dự kiến có hàng", render: (r) => r.ngay_du_kien_co_hang ?? "—" },
    {
      key: "trang_thai", header: "Trạng thái",
      render: (r) => (
        <div className="flex flex-col gap-0.5 items-start">
          <StatusBadge value={r.trang_thai} tones={THIEU_LK_TRANG_THAI_TONE} options={THIEU_LK_TRANG_THAI_OPTIONS} />
        </div>
      ),
    },
    {
      key: "hanh_dong", header: "", mobileHint: "actions",
      render: (r) => {
        const nexts = nextStates(r).filter((s) => s.canDo);
        if (nexts.length === 0) return null;
        return (
          <div className="flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {nexts.map((s) => (
              <Btn
                key={s.trangThai}
                size="sm"
                variant={ACTION_DANGER.has(s.trangThai) ? "danger" : "ghost"}
                className="px-2"
                title={`${s.trangThai === "Da ket thuc" ? "TN: " : ""}${actionLabel(s.trangThai)}`}
                aria-label={actionLabel(s.trangThai)}
                disabled={quickActionPending}
                onClick={() => (s.trangThai === "Kho da tiep nhan" ? onGiaiTrinh(r) : onQuickAction(r, s.trangThai))}
              >
                {ACTION_ICON[s.trangThai] ?? actionLabel(s.trangThai)}
              </Btn>
            ))}
          </div>
        );
      },
    },
  ];
  const optionalCols: Column<ThieuLkRow>[] = [
    { key: "dat_don_hang_id", header: "Đơn hàng", render: (r) => <span className="font-mono text-xs">{r.dat_don_hang_id}</span> },
    { key: "ten_ly_do", header: "Lý do TN báo", render: (r) => r.ten_ly_do ?? "—" },
  ];
  const {
    effectiveColumns, toggleableColumns, resolvedOrder, colWidths,
    settingsOpen, setSettingsOpen, dragOverKey, setDragOverKey, draggedColKey,
    toggleColumn, handleColumnDrop, handleResizeStart,
  } = useColumnConfig(cols, optionalCols, [], "dmlk-thieu-lk-list");
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

  const groups = new Map<string, ThieuLkRow[]>();
  for (const r of rows) {
    const key = r.nguoi_nhan_hang || r.ddh_nguoi_tao || r.nguoi_tao;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  return (
    <div className="space-y-2">
      <div className="hidden sm:flex justify-end">{settingsButtonEl}</div>
      {[...groups.entries()].map(([nguoiNhan, dongCon]) => {
        const choXuLy = dongCon.filter((r) => r.trang_thai === "Cho kho xu ly").length;
        const dangXuLy = dongCon.filter((r) => r.trang_thai === "Kho da tiep nhan").length;
        const hoanTat = dongCon.filter((r) => r.trang_thai === "Kho xac nhan hang da ve" || r.trang_thai === "Da ket thuc").length;
        const huyBo = dongCon.filter((r) => r.trang_thai === "Da huy bo" || r.trang_thai === "Kho tu choi sai TT").length;
        return (
          <div key={nguoiNhan} className="mb-4">
            {/* SectionTitle + bang rieng ben duoi (concept 1 "Structured Neutral", pattern .section-title
                + .tblwrap doc lap - khong long bang vao trong 1 the co vien mau nhu truoc). */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <SectionTitle>
                KTV/Người tạo đơn gốc: {formatNguoiDisplay(nguoiNhan, ktvDisplayMap)}
                <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--ink-400)]">({dongCon.length} dòng)</span>
              </SectionTitle>
              <div className="flex items-center gap-1 flex-wrap mb-2">
                {choXuLy > 0 && <Badge tone="amber">{choXuLy} chờ xử lý</Badge>}
                {dangXuLy > 0 && <Badge tone="ocean">{dangXuLy} đang xử lý</Badge>}
                {hoanTat > 0 && <Badge tone="teal">{hoanTat} hoàn tất</Badge>}
                {huyBo > 0 && <Badge tone="coral">{huyBo} huỷ/từ chối</Badge>}
              </div>
            </div>
            <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs border-collapse">
                  <thead>
                    {/* Khop dung header PaginatedTable.tsx (bg #FBFBFB, chu ink-400 uppercase 10.5px) - truoc
                        day dung bg-white text-ink-500, khac chuan da co san. */}
                    <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[var(--surface-soft)] border-b border-[var(--line)]">
                      {effectiveColumns.map((col, idx) => (
                        <ResizableHeaderCell
                          key={col.key}
                          col={col}
                          idx={idx}
                          isPinned={idx === 0}
                          width={colWidths[col.key]}
                          storageKey="dmlk-thieu-lk-list"
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
                    {dongCon.map((r) => (
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
                  </tbody>
                </table>
              </div>
              <div className="sm:hidden divide-y divide-[var(--line)]">
              {dongCon.map((r) => {
                const nexts = nextStates(r).filter((s) => s.canDo);
                const t = LOAI_DON_TONE[(r.loai_don as keyof typeof LOAI_DON_TONE) ?? "mua"] ?? LOAI_DON_TONE.mua;
                return (
                  <div
                    key={r.id}
                    onClick={() => onDetail(r.id)}
                    className={`cursor-pointer px-3 py-2.5 ${r.uu_tien === 1 ? "bg-[var(--orange-100)] ring-1 ring-inset ring-[var(--orange-500)] active:brightness-95" : "active:bg-slate-50"}`}
                  >
                    <div className="flex items-start gap-2">
                      {rowsCoTheChon.some((x) => x.id === r.id) && (
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelectOne(r.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[10px] text-[var(--ink-400)] truncate">{r.ma_lk ?? r.id}</div>
                        <div className="font-medium text-sm truncate">
                          {r.uu_tien === 1 && <PriorityTag />}{" "}
                          {r.ten_lk_snapshot ?? r.ma_lk ?? "—"}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          <Badge tone={t.tone}>{t.label}</Badge>
                          <StatusBadge value={r.trang_thai} tones={THIEU_LK_TRANG_THAI_TONE} options={THIEU_LK_TRANG_THAI_OPTIONS} />
                        </div>
                        <div className="text-xs text-[var(--ink-500)] mt-1">
                          TN báo {formatNguoiDisplay(r.nguoi_tao, ktvDisplayMap)} · {fmtDateTime(r.ngay_tao)}
                        </div>
                        {nexts.length > 0 && (
                          // FIX (phan hoi 2026-08-28: "ấn vào vùng trống trên thẻ vẫn không mở UI chi
                          // tiết") - stopPropagation ca hang truoc day nuot ca khoang trong quanh cac
                          // nut nho, giong loi da sua o DonCuaToiTab.tsx - chi chan bubble khi click
                          // trung 1 nut con that su.
                          <div
                            className="flex gap-1 flex-wrap mt-1.5"
                            onClick={(e) => {
                              if (e.target !== e.currentTarget) e.stopPropagation();
                            }}
                          >
                            {nexts.map((s) => (
                              <Btn
                                key={s.trangThai}
                                size="sm"
                                variant={ACTION_DANGER.has(s.trangThai) ? "danger" : "ghost"}
                                className="px-2"
                                title={`${s.trangThai === "Da ket thuc" ? "TN: " : ""}${actionLabel(s.trangThai)}`}
                                aria-label={actionLabel(s.trangThai)}
                                disabled={quickActionPending}
                                onClick={() => (s.trangThai === "Kho da tiep nhan" ? onGiaiTrinh(r) : onQuickAction(r, s.trangThai))}
                              >
                                {ACTION_ICON[s.trangThai] ?? actionLabel(s.trangThai)}
                              </Btn>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        );
      })}
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

// Them 2026-08-21 ("hợp nhất phong cách giao diện" - dong bo voi PXK/Mua hang) - man chi tiet + lich
// su xu ly 1 ticket thieu LK, dung API MOI GET /dat-mua-lk/thieu-lk/:id (chua tung co truoc do, ticket
// nay truoc chi xem duoc qua dong bang, khong co lich su ai xu ly buoc nao/luc nao).
//
// SUA (phan hoi 2026-08-21: "nút chức năng không hiện trong drawer") - truoc day Drawer nay CHI de
// xem (dung y CHOT #19: tranh 2 noi cung sua trang thai). Doi lai theo dung pattern TraHangDetailModal
// (da co san nut hanh dong LAN nut o dong bang, khong lech - ca 2 cung goi CHUNG 1 mutation/API, CUNG
// 1 react-query queryKey duoc invalidate nen khong co rui ro lech UI/CAS nhu lo ngai ban dau).
function ThieuLkDetailModal({
  id, onClose, addToast, qc, canKho, canTacNghiep, currentEmail, navRows, onNavigate,
}: {
  id: string;
  onClose: () => void;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canKho: boolean;
  canTacNghiep: boolean;
  currentEmail: string;
  navRows?: ThieuLkRow[];
  onNavigate?: (id: string) => void;
}) {
  const [actionTrangThai, setActionTrangThai] = useState<string | null>(null);
  const [ghiChu, setGhiChu] = useState("");
  const [ngayDuKien, setNgayDuKien] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["thieu-lk-detail", id],
    queryFn: () =>
      api.get<{
        thieuLk: ThieuLkRow;
        logs: Array<{ id: number; trang_thai: string; nguoi_xu_ly: string; ngay_xu_ly: string; ghi_chu: string | null }>;
      }>(`/dat-mua-lk/thieu-lk/${id}`),
  });
  const { data: giaiTrinhGoiYData } = useQuery({
    queryKey: ["dat-mua-lk-ly-do-cham"],
    queryFn: () => api.get<{ rows: LyDoChamRow[] }>("/dat-mua-lk/ly-do-cham?he_thong=" + encodeURIComponent("Mua hàng")),
    enabled: canKho && actionTrangThai === "Kho da tiep nhan",
  });

  const logMutation = useMutation({
    mutationFn: (args: { trangThai: string; ghiChu?: string; ngayDuKien?: string }) =>
      api.post(`/dat-mua-lk/thieu-lk/${id}/log`, {
        trang_thai: args.trangThai,
        ghi_chu: args.ghiChu?.trim() || undefined,
        ngay_du_kien_co_hang: args.ngayDuKien || undefined,
      }),
    onSuccess: () => {
      setActionTrangThai(null);
      setGhiChu("");
      setNgayDuKien("");
      qc.invalidateQueries({ queryKey: ["thieu-lk-detail", id] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      invalidatePipelineCounts(qc);
      // "Duyet va tiep theo" (concept 1 da duyet, 2026-08-24) - dong y het DonHangDetailModal: xu ly
      // xong 1 ticket thi tu nhay sang ticket TIEP THEO trong danh sach dang xem thay vi dong Drawer,
      // ap dung cho MOI buoc chuyen trang thai o man nay (khong chi rieng 1 hanh dong "duyet" duy nhat
      // nhu Mua hang - man nay co nhieu buoc chuyen khac nhau, deu la "xu ly xong 1 dong, sang dong
      // ke" nen deu nen tu nhay).
      if (onNavigate && navNextId) onNavigate(navNextId);
      else addToast("Đã cập nhật trạng thái thiếu LK");
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const ktvDisplayMap = useKtvDisplayMap();
  const t = data?.thieuLk;
  const nexts = t ? nextStatesForThieuLk(t, { canKho, canTacNghiep, currentEmail }).filter((s) => s.canDo) : [];
  const isGiaiTrinh = actionTrangThai === "Kho da tiep nhan";

  const navIndex = navRows?.findIndex((r) => r.id === id) ?? -1;
  const navPrevId = navRows && navIndex > 0 ? navRows[navIndex - 1]?.id : undefined;
  const navNextId = navRows && navIndex >= 0 && navIndex < navRows.length - 1 ? navRows[navIndex + 1]?.id : undefined;
  useDrawerArrowNav({
    hasPrev: !!(onNavigate && navRows && navPrevId),
    hasNext: !!(onNavigate && navRows && navNextId),
    onPrev: () => navPrevId && onNavigate?.(navPrevId),
    onNext: () => navNextId && onNavigate?.(navNextId),
  });

  const footer =
    !isLoading && t ? (
      actionTrangThai ? (
        <div className="space-y-2">
          <div className="font-semibold text-xs">Chuyển sang: {actionLabel(actionTrangThai)}</div>
          {isGiaiTrinh && (
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Ngày dự kiến có hàng</label>
              <input
                type="date"
                value={ngayDuKien}
                onChange={(e) => setNgayDuKien(e.target.value)}
                className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
          )}
          <input
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            placeholder={isGiaiTrinh ? "Bắt buộc - giải thích thực tế vì sao thiếu hàng" : "Ghi chú (tuỳ chọn)"}
            className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
          />
          {isGiaiTrinh && (giaiTrinhGoiYData?.rows.length ?? 0) > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {(giaiTrinhGoiYData?.rows ?? []).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setGhiChu(l.ten_ly_do)}
                  className="focus-ring px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-100)] text-[var(--ink-600)] border border-[var(--line)] hover:border-[var(--ocean-400)] hover:text-[var(--ocean-700)]"
                >
                  {l.ten_ly_do}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" size="sm" onClick={() => { setActionTrangThai(null); setGhiChu(""); setNgayDuKien(""); }}>Hủy</Btn>
            <Btn
              size="sm"
              onClick={() => logMutation.mutate({ trangThai: actionTrangThai, ghiChu, ngayDuKien: isGiaiTrinh ? ngayDuKien : undefined })}
              disabled={logMutation.isPending || (isGiaiTrinh && !ghiChu.trim())}
            >
              Xác nhận
            </Btn>
          </div>
        </div>
      ) : nexts.length > 0 ? (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {nexts.map((s) => (
            <Btn
              key={s.trangThai}
              size="sm"
              variant="ghost"
              disabled={logMutation.isPending}
              onClick={() => {
                if (s.trangThai === "Kho da tiep nhan") { setActionTrangThai(s.trangThai); setGhiChu(""); setNgayDuKien(""); }
                else logMutation.mutate({ trangThai: s.trangThai });
              }}
            >
              {s.trangThai === "Da ket thuc" ? <span className="text-[var(--ink-400)]">TN: </span> : null}
              {actionLabel(s.trangThai)}{s.trangThai === "Kho da tiep nhan" ? "…" : ""}
            </Btn>
          ))}
        </div>
      ) : null
    ) : null;

  return (
    <Drawer
      open
      title={`Ticket thiếu LK ${id}`}
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
      ) : !t ? null : (
        <div className="text-sm">
          {/* Khoi thong tin ticket + lich su xu ly doi sang KvRow/SectionTitle/Timeline (concept 1
              "Structured Neutral" da duyet, 2026-08-24, pattern .kv/.section-title/.timeline). */}
          <SectionTitle>Thông tin ticket</SectionTitle>
          <KvRow label="TN báo">{formatNguoiDisplay(t.nguoi_tao, ktvDisplayMap)}</KvRow>
          <KvRow label="Ngày báo">{fmtDateTime(t.ngay_tao)}</KvRow>
          <KvRow label="Trạng thái">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge value={t.trang_thai} tones={THIEU_LK_TRANG_THAI_TONE} options={THIEU_LK_TRANG_THAI_OPTIONS} />
              {t.uu_tien === 1 && <PriorityTag />}
            </div>
          </KvRow>
          {t.ma_lk && (
            <KvRow label="Mã LK">
              <span className="font-mono text-xs text-[var(--ink-500)] mr-1.5">{t.ma_lk}</span>
              <span className="font-semibold">{t.ten_lk_snapshot ?? t.ma_lk}</span>
            </KvRow>
          )}
          <KvRow label="Đơn hàng"><span className="font-mono text-xs">{t.dat_don_hang_id}</span></KvRow>
          <KvRow label="Ngày dự kiến có hàng">{t.ngay_du_kien_co_hang ?? "—"}</KvRow>
          {t.ten_ly_do && <KvRow label="Lý do TN báo">{t.ten_ly_do}</KvRow>}

          <SectionTitle>Lịch sử xử lý</SectionTitle>
          <Timeline
            items={(data?.logs ?? []).map((l) => ({
              title: (
                <>
                  {trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, l.trang_thai)}
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
  );
}

