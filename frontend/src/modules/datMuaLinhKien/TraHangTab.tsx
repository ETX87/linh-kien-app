import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Drawer, DrawerNavButtons, useDrawerArrowNav } from "../../components/ui/Drawer";
import { Select } from "../../components/ui/Select";
import { PaginatedTable, type Column } from "../../components/ui/PaginatedTable";
import { useColumnConfig } from "../../components/ui/useColumnConfig";
import { ColumnSettingsButton } from "../../components/ui/ColumnHeader";
import { api, buildQuery, ApiError } from "../../api/client";
import { fmtDateTime } from "../../types";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import type { TraHangRow } from "./types";
import { TRA_HANG_TRANG_THAI_TONE, TRA_HANG_TRANG_THAI_OPTIONS, TRA_HANG_BULK_ERROR_MESSAGES, TRANG_THAI_DOT_TONE } from "./constants";
import { describeApiError, formatNguoiDisplay, useKtvDisplayMap, invalidatePipelineCounts, trangThaiLabel } from "./helpers";
import { ActiveFiltersBar, TrangThaiChipFilter, BulkConfirmButton, FilterSearchBar, StatusBadge } from "./SharedUi";

// ---------- Tab "Don tra hang" (tach hoan toan khoi mua/cong no - buoc 3 ke hoach) ----------

// Nang len module-level (truoc o trong TraHangTab) - TraHangDetailModal (them 2026-08-21) cung can
// dung 2 danh sach nay, tranh dinh nghia trung lap.
// SUA (migration 0002_tra_hang_pxk.sql): dong o "TN da duyet" gio la trang thai DONG cua state
// machine nay (khong con "Da hoan thanh" - xem giai thich o backend traHang.ts).
const DA_DONG = ["TN da duyet", "Tu choi", "Da huy"];
const CO_THE_DAY_LUI = ["Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong"];

export function TraHangTab({
  addToast, qc, canKeToan, canKho, canQC, canTacNghiep, initialFilterOverride,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>;
  canKeToan: boolean; canKho: boolean; canQC: boolean; canTacNghiep: boolean; initialFilterOverride?: string;
}) {
  // Uu tien QC > Ke toan > Kho > TN cho mac dinh (chi anh huong lan dau) - 1 nguoi hiem khi giu qua
  // 1 trong 4 flag nay cung luc (ngoai Admin, da tu roi tabs[0] khac o component cha).
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState(
    "filters:dmlk-th-tt",
    canQC ? "Cho QC xac nhan" : canKeToan ? "Cho ke toan duyet mem" : canKho ? "Cho kho xac nhan" : canTacNghiep ? "Cho TN duyet tong" : "",
  );
  useEffect(() => {
    if (initialFilterOverride !== undefined) setFilterTrangThai(initialFilterOverride);
  }, [initialFilterOverride]);
  const [layLuiId, setLayLuiId] = useState<string | null>(null);
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #13): "Tu choi" o dung 1 buoc CUOI CO TINH QUYET
  // DINH nhat ("Cho TN duyet tong") moi can mo modal nhap ly do bat buoc - 3 buoc KT/Kho/QC dau
  // chuoi van giu "bam thang" nhu cu (khong doi hanh vi cho da so truong hop).
  const [tuChoiTnId, setTuChoiTnId] = useState<string | null>(null);
  const [ghiChu, setGhiChu] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ktvDisplayMap = useKtvDisplayMap();
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

  // GD4 (phan hoi Codex #16): ve trang 1 + xoa selection dang chon khi doi bo loc.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [filterTrangThai, filterNguoiTao, debouncedQ]);

  // GD4 (phan hoi Codex #17): phan trang server-side that su - truoc day tai TOAN BO dong khop
  // trang_thai roi loc/slice o client, "nguoi_tao" gio cung loc server-side (xem GET /tra-hang) de
  // total/trang khop dung sau khi loc, khong con lech nhu khi loc them 1 lop o client tren du lieu
  // da phan trang.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tra-hang", filterTrangThai, filterNguoiTao, debouncedQ, page],
    queryFn: () =>
      api.get<{ rows: TraHangRow[]; total: number }>(
        "/tra-hang" + buildQuery({ trang_thai: filterTrangThai || undefined, nguoi_tao: filterNguoiTao || undefined, q: debouncedQ || undefined, page, pageSize: 20 }),
      ),
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
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      invalidatePipelineCounts(qc);
      addToast("Đã cập nhật trạng thái đơn trả hàng");
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      addToast(code === "MISSING_GHI_CHU" ? "Cần nhập lý do khi từ chối bước TN duyệt tổng" : "Lỗi: " + describeApiError(err));
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
    mutationFn: (hanhDong: "duyet" | "tu_choi") => api.post<{ results: Record<string, string> }>("/tra-hang/bulk-log", { ids: [...selected], hanh_dong: hanhDong }),
    onSuccess: (res) => {
      const entries = Object.entries(res.results);
      const failed = entries.filter(([, v]) => v in TRA_HANG_BULK_ERROR_MESSAGES);
      // Phase 4 (bulk retry): giu lai dung cac dong loi trong `selected` khi that bai 1 phan, xem
      // comment day du o DonCuaToiTab.tsx (cung pattern).
      setSelected(new Set(failed.map(([id]) => id)));
      if (failed.length === 0) addToast(`Đã xử lý thành công ${entries.length} dòng`);
      else addToast(`Thành công ${entries.length - failed.length}/${entries.length} dòng. Thất bại: ${failed.map(([id, code]) => `${id}: ${TRA_HANG_BULK_ERROR_MESSAGES[code] ?? code}`).join("; ")} — đã giữ lại các dòng lỗi, bấm lại để thử lại`);
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      invalidatePipelineCounts(qc);
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const cols: Column<TraHangRow>[] = [
    {
      key: "chon",
      header: <input type="checkbox" checked={rowsCoTheChon.length > 0 && selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />,
      render: (r: TraHangRow) =>
        canXuLy(r.trang_thai_tra_hang) ? (
          <span onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelectOne(r.id)} />
          </span>
        ) : null,
      mobileHint: "select",
    },
    { key: "id", header: "Mã đơn hàng", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "ma_lk", header: "Mã LK", render: (r) => r.ma_lk },
    {
      key: "ten_lk_snapshot", header: "Tên LK",
      render: (r) => (
        <>
          {r.uu_tien === 1 && <span title="Ưu tiên">⭐ </span>}
          {r.ten_lk_snapshot ?? r.ma_lk}
        </>
      ),
    },
    { key: "so_luong_de_xuat", header: "SL", render: (r) => r.so_luong_de_xuat },
    { key: "nguoi_tao", header: "Người tạo", render: (r) => formatNguoiDisplay(r.nguoi_tao, ktvDisplayMap) },
    { key: "ngay_tao", header: "Ngày tạo", render: (r) => fmtDateTime(r.ngay_tao) },
    {
      key: "trang_thai_tra_hang", header: "Trạng thái",
      render: (r) => (
        <Badge tone={TRA_HANG_TRANG_THAI_TONE[r.trang_thai_tra_hang] ?? "gray"}>
          {trangThaiLabel(TRA_HANG_TRANG_THAI_OPTIONS, r.trang_thai_tra_hang)}
        </Badge>
      ),
    },
    {
      key: "actions", header: "", mobileHint: "actions",
      render: (r) => {
        if (DA_DONG.includes(r.trang_thai_tra_hang)) return null;
        return (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            {canXuLy(r.trang_thai_tra_hang) && (
              <>
                <Btn size="sm" disabled={logMutation.isPending} loading={logMutation.isPending} onClick={() => logMutation.mutate({ id: r.id, hanhDong: "duyet" })}>Duyệt</Btn>
                <Btn
                  size="sm"
                  variant="danger"
                  disabled={logMutation.isPending}
                  onClick={() => {
                    if (r.trang_thai_tra_hang === "Cho TN duyet tong") {
                      setTuChoiTnId(r.id);
                      setGhiChu("");
                    } else {
                      logMutation.mutate({ id: r.id, hanhDong: "tu_choi" });
                    }
                  }}
                >
                  Từ chối
                </Btn>
              </>
            )}
            {(canKeToan || canKho) && CO_THE_DAY_LUI.includes(r.trang_thai_tra_hang) && (
              <Btn size="sm" variant="ghost" onClick={() => { setLayLuiId(r.id); setGhiChu(""); }}>Đẩy lùi</Btn>
            )}
          </div>
        );
      },
    },
  ];

  const activeFilterCount = [filterNguoiTao, filterQ].filter(Boolean).length;

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
        searchPlaceholder="Tìm theo mã đơn, mã LK, tên LK, người tạo..."
        trailing={settingsButtonEl}
      >
        <TrangThaiChipFilter value={filterTrangThai} onChange={setFilterTrangThai} options={TRA_HANG_TRANG_THAI_OPTIONS} />
        {nguoiTaoOptions.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <Select
              value={filterNguoiTao}
              onChange={(v) => { setFilterNguoiTao(v); setPage(1); }}
              options={[{ value: "", label: "Tất cả người tạo" }, ...nguoiTaoOptions.map((email) => ({ value: email, label: formatNguoiDisplay(email, ktvDisplayMap) }))]}
            />
          </div>
        )}
      </FilterSearchBar>
      {/* SUA (ra soat #3): bo chip "Trạng thái: ..." - da hien TRUNG voi chip dang to sang trong
          TrangThaiChipFilter ngay ben tren. */}
      <ActiveFiltersBar
        chips={[
          ...(filterNguoiTao ? [{ label: "Người tạo đã lọc", onClear: () => setFilterNguoiTao("") }] : []),
          ...(filterQ ? [{ label: `Tìm: "${filterQ}"`, onClear: () => setFilterQ("") }] : []),
        ]}
      />
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-3 py-2">
          <span className="text-sm">Đã chọn {selected.size} dòng</span>
          <BulkConfirmButton
            label="Duyệt tất cả"
            confirmLabel={`Xác nhận duyệt ${selected.size} dòng?`}
            count={selected.size}
            onConfirm={() => bulkMutation.mutate("duyet")}
            disabled={bulkMutation.isPending}
            loading={bulkMutation.isPending}
          />
          <BulkConfirmButton
            label="Từ chối tất cả"
            confirmLabel={`Xác nhận từ chối ${selected.size} dòng?`}
            count={selected.size}
            variant="danger"
            onConfirm={() => bulkMutation.mutate("tu_choi")}
            disabled={bulkMutation.isPending}
            loading={bulkMutation.isPending}
          />
        </div>
      )}
      <PaginatedTable
        columns={cols}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        page={page}
        pageSize={20}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(r) => r.id}
        columnConfig={columnConfig}
        onRowClick={(r) => setDetailId(r.id)}
        rowClassName={(r) => (r.uu_tien === 1 ? "bg-[var(--orange-100)] hover:brightness-95" : "")}
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
  id, onClose, addToast, qc, canXuLy, canKeToan, canKho, navRows, onNavigate,
}: {
  id: string;
  onClose: () => void;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canXuLy: (trangThai: string) => boolean;
  canKeToan: boolean;
  canKho: boolean;
  navRows?: TraHangRow[];
  onNavigate?: (id: string) => void;
}) {
  const [ghiChu, setGhiChu] = useState("");
  const [actionMode, setActionMode] = useState<"tu_choi_tn" | "day_lui" | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["tra-hang-detail", id],
    queryFn: () =>
      api.get<{
        donHang: TraHangRow;
        logs: Array<{ id: number; trang_thai: string; nguoi_xu_ly: string; ngay_xu_ly: string; ghi_chu: string | null }>;
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
      addToast(code === "MISSING_GHI_CHU" ? "Cần nhập lý do khi từ chối bước TN duyệt tổng" : "Lỗi: " + describeApiError(err));
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
    logMutation.mutate({ hanhDong: "tu_choi" });
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
      ) : coTheXuLy || coTheDayLui ? (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {coTheXuLy && (
            <>
              <Btn size="sm" onClick={() => logMutation.mutate({ hanhDong: "duyet" })} disabled={logMutation.isPending} loading={logMutation.isPending}>
                {navNextId && onNavigate ? "Duyệt và tiếp theo →" : "Duyệt"}
              </Btn>
              <Btn size="sm" variant="danger" onClick={handleTuChoi} disabled={logMutation.isPending}>Từ chối</Btn>
            </>
          )}
          {coTheDayLui && (
            <Btn size="sm" variant="ghost" onClick={() => { setActionMode("day_lui"); setGhiChu(""); }} disabled={logMutation.isPending}>
              Đẩy lùi
            </Btn>
          )}
        </div>
      ) : null
    ) : null;

  return (
    <Drawer
      open
      title={`Đơn trả hàng ${id}`}
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
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 bg-[var(--surface-100)] rounded-xl p-3">
            <div>
              <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">Người tạo</div>
              <div className="font-semibold text-[var(--ink-900)]">{formatNguoiDisplay(d.nguoi_tao, ktvDisplayMap)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">Ngày tạo</div>
              <div className="text-[var(--ink-900)]">{fmtDateTime(d.ngay_tao)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge value={trangThai} tones={TRA_HANG_TRANG_THAI_TONE} options={TRA_HANG_TRANG_THAI_OPTIONS} />
            {d.uu_tien === 1 && <Badge tone="orange">⭐ Ưu tiên</Badge>}
          </div>

          <div>
            <div className="font-mono text-xs text-[var(--ink-500)]">{d.ma_lk}</div>
            <div className="font-semibold text-base">{d.ten_lk_snapshot ?? d.ma_lk}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">SL</div>
              <div>{d.so_luong_de_xuat}</div>
            </div>
          </div>

          {d.ghi_chu && <div className="text-[var(--ink-500)]">{d.ghi_chu}</div>}

          {(data?.logs.length ?? 0) > 0 && (
            <div>
              <div className="font-semibold mb-1">Lịch sử xử lý</div>
              <ul className="text-xs space-y-1.5 text-[var(--ink-500)]">
                {data!.logs.map((l) => (
                  <li key={l.id} className="flex items-start gap-1.5">
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${TRANG_THAI_DOT_TONE[TRA_HANG_TRANG_THAI_TONE[l.trang_thai] ?? "gray"]}`} />
                    <span>
                      {fmtDateTime(l.ngay_xu_ly)} — <span className="font-semibold text-[var(--ink-700)]">{trangThaiLabel(TRA_HANG_TRANG_THAI_OPTIONS, l.trang_thai)}</span> ({l.nguoi_xu_ly})
                      {l.ghi_chu ? ` — ${l.ghi_chu}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
