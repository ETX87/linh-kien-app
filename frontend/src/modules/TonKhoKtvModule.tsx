import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Btn } from "../components/ui/Btn";
import { FileButton } from "../components/ui/FileButton";
import { Badge } from "../components/ui/Badge";
import { Tooltip } from "../components/ui/Tooltip";
import { Modal } from "../components/ui/Modal";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import type {
  KtvTonKhoSummaryRow, KtvTonKhoChiTietRow, KtvTonKhoImportMeta, MaKhoChuaKhopRow,
  KhoCongTyRow, KhoCongTyTonKhoSummaryRow, KhoCongTyTonKhoChiTietRow,
} from "../types";
import { fmtVND, fmtDateTime } from "../types";
import { parseTonKhoImportFileNen } from "../lib/tonKhoImportNen";
import { exportRowsToExcel } from "../lib/exportExcel";
import { StatCard } from "../components/x/StatCard";
import { Icon } from "../components/ui/Icon";
import { ChartCard } from "../components/charts/ChartCard";
import { DonutChart } from "../components/charts/DonutChart";
import { HBarList } from "../components/charts/BarCharts";
import { fmtCompactVND, pct } from "../components/charts/chartUtils";
import { Money } from "../components/ui/Money";
import { CongNo0dTab } from "./CongNo0dTab";

// File mau cho "Import tồn kho MISA" - chi can dung dong tieu de cot (parser tim theo TEN cot, xem
// HEADER_ALIASES o lib/tonKhoImport.ts) + vai dong vi du, KHONG can dung dinh dang goc phuc tap cua
// MISA (nhieu khoi "Kho: ...", dong "Tổng cộng"...) vi parser da bo qua nhung dong khong co ca "Mã
// hàng" lan "Mã kho".
async function downloadTonKhoImportTemplate() {
  await exportRowsToExcel(
    [
      { "Mã kho": "vidu.ktv01", "Mã hàng": "LK001", "Tên hàng": "Bo nguon 65W", "ĐVT": "Cai", "Đầu kỳ": 2, "Nhập kho": 3, "Xuất kho": 1, "Cuối kỳ": 4 },
      { "Mã kho": "vidu.ktv01", "Mã hàng": "LK002", "Tên hàng": "Cap sac Type-C", "ĐVT": "Cai", "Đầu kỳ": 0, "Nhập kho": 5, "Xuất kho": 2, "Cuối kỳ": 3 },
    ],
    "mau_import_ton_kho_misa.xlsx",
    "Data",
  );
}

// Module RIENG (tach ra khoi Settings 2026-08-29, phan hoi nguoi dung: "Đẩy thẻ 'Tồn kho công nợ
// KTV' ra ngoài menu" - truoc day chi la 1 tab trong SettingsModule.tsx nen CHI Admin vao duoc, gio
// la 1 muc Sidebar rieng (xem navConfig.ts) mo cho MOI vai tro co lien quan, phan quyen DOC theo
// hang - xem scopeKtvTonKho() o backend/src/routes/ktvTonKho.ts:
//   - KTV/Ve tinh (la_ktv_dvbh/la_ve_tinh): CHI xem dong cua chinh minh.
//   - Giam sat (vai_tro='Giam sat'): xem cac KTV thuoc Khu vuc minh phu trach (qua
//     users.giam_sat_quan_ly, dong bo tu khu_vuc.gs_email - xem lib/khuVucSync.ts).
//   - la_view: xem theo Khu vuc duoc gan (giong quy uoc la_view o cac luong khac trong module Dat
//     mua linh kien - KHONG mac dinh xem het).
//   - Cac vai tro/co con lai (Admin/QC/la_kho/la_ke_toan/la_tac_nghiep/la_tp_dvbh): xem toan bo.
// Import (ghi) + toan bo CRUD "Kho công ty": Admin hoac la_ke_toan (adminOrKeToan o backend
// ktvTonKho.ts, sua 2026-09-21 theo phan hoi "mo modules cong no ktv full quyen cho ke toan") - nut
// "Import tồn kho MISA"/"+ Thêm kho"/"Sửa" o day chi hien voi 2 nhom nay (bien canManage ben duoi).
// Them 2026-09-11 (phan hoi "Kho công ty" - tu dong duyet don mua/cong no khi kho con du hang, xem
// migration 0025 + backend/src/lib/tonKhoCongTy.ts) - tab cap CAO NHAT gop chung voi "Tồn kho KTV"
// (cung nhom nghiep vu "ton kho tham chieu", tranh phan manh them 1 muc Sidebar rieng). Import van
// dung CHUNG 1 nut/1 file MISA cho ca 2 tab (xem chu thich trong TonKhoKtvContent).
export function TonKhoKtvModule() {
  const auth = useAuth();
  // FIX (phan hoi "với vai trò KTV, ẩn tab tồn 'kho công ty'"): tab "Kho công ty" la cau hinh NOI BO
  // (danh sach kho vat ly + khu vuc phuc vu, dung cho logic tu dong duyet don - xem comment
  // KhoCongTyContent o duoi), KHONG phai thong tin lien quan truc tiep toi ban than 1 KTV/Ve tinh (khac
  // tab "Tồn kho KTV" - luon loc CHI dong cua chinh ho qua scopeKtvTonKho()). An han tab nay cho
  // la_ktv_dvbh/la_ve_tinh, giu nguyen cho moi vai tro con lai (Giam sat/la_view/Admin/Kho/Ke toan/Tac
  // nghiep/TBP - xem scopeKtvTonKho() o backend/src/routes/ktvTonKho.ts).
  const isKtvLike = auth.status === "authenticated" && (auth.user.la_ktv_dvbh || auth.user.la_ve_tinh);
  // "Công nợ 0 đồng" (2026-10-05) - chi Admin/Ke toan (adminOrKeToan o backend).
  const canCongNo0d = auth.status === "authenticated" && (auth.user.vai_tro === "Admin" || !!auth.user.la_ke_toan);
  const [topTab, setTopTab] = useState<"ktv" | "kho-cong-ty" | "cong-no-0d">("ktv");
  return (
    <div className="anim-in space-y-3">
      {!isKtvLike && (
        <Tabs
          tabs={[
            { key: "ktv", label: "Tồn kho KTV" },
            { key: "kho-cong-ty", label: "Kho công ty" },
            ...(canCongNo0d ? [{ key: "cong-no-0d", label: "Công nợ 0 đồng" }] : []),
          ]}
          active={topTab}
          onChange={(k) => setTopTab(k as "ktv" | "kho-cong-ty" | "cong-no-0d")}
        />
      )}
      {topTab === "ktv" || isKtvLike ? <TonKhoKtvContent /> : topTab === "cong-no-0d" && canCongNo0d ? <CongNo0dTab /> : <KhoCongTyContent />}
    </div>
  );
}

// "Đánh giá công nợ" 3 mức (them 04/09/2026, xem backend/src/lib/congNoKtv.ts). SUA 2026-09-04: Tran
// cong no chua duoc dat gio coi NHU tran = 0 (KTV chua duoc cap phep no gi ca) - backend khong con tra
// ve null cho truong hop nay nua, chi con "null" trong type de tuong thich nguoc (an toan neu gap).
function DanhGiaCongNoBadge({ value }: { value: "Vuot tran" | "Canh bao" | "Binh thuong" | null }) {
  if (value === "Vuot tran") return <Badge tone="coral">Vượt trần</Badge>;
  if (value === "Canh bao") return <Badge tone="amber">Cảnh báo</Badge>;
  if (value === "Binh thuong") return <Badge tone="teal">Bình thường</Badge>;
  return <span className="text-xs text-[var(--ink-400)]">—</span>;
}

// Tong quan cong no bang bieu do (them 2026-09-26, yeu cau "bo sung chart"): 4 KPI + donut 3 muc danh
// gia cong no + Top 5 cong no chot cao nhat. Tinh CLIENT-SIDE tu dung `rows` cua bang (GET / da tra ve
// toan bo KTV trong pham vi xem, khong phan trang server) nen luon khop so voi bang ben duoi. Mau trang
// thai (--chart-good/warn/bad, da qua validator) luon di kem icon + chu + so, khong chi dua vao mau.
function CongNoOverview({ rows, onOpen }: { rows: KtvTonKhoSummaryRow[]; onOpen: (r: KtvTonKhoSummaryRow) => void }) {
  const vuotTran = rows.filter((r) => r.danh_gia_cong_no === "Vuot tran");
  const canhBao = rows.filter((r) => r.danh_gia_cong_no === "Canh bao");
  const binhThuong = rows.filter((r) => r.danh_gia_cong_no === "Binh thuong");
  const tongChot = rows.reduce((s, r) => s + (r.cong_no_chot ?? 0), 0);
  const top = [...rows].filter((r) => (r.cong_no_chot ?? 0) > 0).sort((a, b) => b.cong_no_chot - a.cong_no_chot).slice(0, 5);
  const wrap = "flex min-w-0";
  return (
    <div className="space-y-[14px]">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-[14px] lg:grid-cols-4">
        <div className={wrap}><StatCard label="KTV đang theo dõi" value={rows.length.toLocaleString("vi-VN")} color="blue" iconType={Icon.users} /></div>
        <div className={wrap}><StatCard label="Tổng công nợ chốt" value={fmtCompactVND(tongChot)} tone="purple" iconType={Icon.chart} /></div>
        <div className={wrap}><StatCard label="Vượt trần" value={vuotTran.length} tone="danger" muted={vuotTran.length === 0} iconType={Icon.alert} sub={`${pct(vuotTran.length, rows.length)} số KTV`} /></div>
        <div className={wrap}><StatCard label="Cảnh báo" value={canhBao.length} tone="warning" muted={canhBao.length === 0} iconType={Icon.clock} sub={`${pct(canhBao.length, rows.length)} số KTV`} /></div>
      </div>
      <div className="grid gap-[14px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <ChartCard title="Đánh giá công nợ" subtitle="So công nợ chốt với trần công nợ của từng KTV">
          <DonutChart
            centerLabel="KTV"
            segments={[
              { key: "ok", label: "Bình thường", value: binhThuong.length, color: "var(--chart-good)", icon: <Icon.check size={13} /> },
              { key: "warn", label: "Cảnh báo", value: canhBao.length, color: "var(--chart-warn)", icon: <Icon.clock size={13} /> },
              { key: "bad", label: "Vượt trần", value: vuotTran.length, color: "var(--chart-bad)", icon: <Icon.alert size={13} /> },
            ]}
          />
        </ChartCard>
        <ChartCard title="Top 5 KTV công nợ chốt cao nhất" subtitle="Bấm để xem chi tiết tồn kho — % là mức dùng so với trần">
          <HBarList
            ranked
            emptyText="Chưa có KTV nào phát sinh công nợ."
            rows={top.map((r) => ({
              key: r.ma_ktv,
              label: r.ten_hien_thi ?? r.ma_ktv,
              value: r.cong_no_chot,
              display: fmtCompactVND(r.cong_no_chot),
              color: r.danh_gia_cong_no === "Vuot tran" ? "var(--chart-bad)" : r.danh_gia_cong_no === "Canh bao" ? "var(--chart-warn)" : "var(--chart-good)",
              sub: r.cong_no ? `Trần ${fmtCompactVND(r.cong_no)} · dùng ${pct(r.cong_no_chot, r.cong_no)}` : "Chưa đặt trần công nợ",
              onClick: () => onOpen(r),
            }))}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function TonKhoKtvContent() {
  const auth = useAuth();
  const isAdmin = auth.status === "authenticated" && auth.user.vai_tro === "Admin";
  const isKeToan = auth.status === "authenticated" && !!auth.user.la_ke_toan;
  // "Chưa khớp mã kho" (them 2026-09-09, tach tab theo phan hoi nguoi dung) - dung LAI dung nhom duoc
  // phep goi GET /ma-kho-chua-khop o backend (Admin/Ke toan, xem ktvTonKho.ts) - vai tro khac khong
  // thay tab nay, tranh goi API se bi 403.
  const canSeeChuaKhop = isAdmin || isKeToan;
  // Import tồn kho MISA (ghi) - them 2026-09-21: Ke toan duoc mo them (adminOrKeToan o backend),
  // giong dung nhom canSeeChuaKhop o tren.
  const canManage = isAdmin || isKeToan;
  const [tab, setTab] = useState<"da-khop" | "chua-khop">("da-khop");
  const qc = useQueryClient();
  const addToast = useToast();
  const [search, setSearch] = useState("");
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const { data, isLoading } = useQuery({
    queryKey: ["ktv-ton-kho", search],
    queryFn: () => api.get<{ rows: KtvTonKhoSummaryRow[] }>(`/settings/ktv-ton-kho${query}`),
  });
  // FIX (phan hoi 2026-09-05: "phân theo trang, tối đa 10 dòng 1 trang") - GET / khong phan trang o
  // backend (tra ve toan bo KTV khop bo loc/search 1 lan), nen phan trang CLIENT-SIDE bang slice() la
  // du (tong so KTV bi chan boi scopeKtvTonKho(), thuc te toi da vai tram dong - khong can doi sang
  // server-side pagination nhu ThieuLkTab/DonCuaToiTab). Ve trang 1 moi khi doi tu khoa tim kiem.
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search]);
  const allRows = data?.rows ?? [];
  const pageRows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const { data: meta } = useQuery({
    queryKey: ["ktv-ton-kho-meta"],
    queryFn: () => api.get<KtvTonKhoImportMeta | null>("/settings/ktv-ton-kho/import-meta"),
  });
  const { data: chuaKhopData } = useQuery({
    queryKey: ["ktv-ton-kho-ma-kho-chua-khop"],
    queryFn: () => api.get<{ rows: MaKhoChuaKhopRow[] }>("/settings/ktv-ton-kho/ma-kho-chua-khop"),
    enabled: canSeeChuaKhop,
  });
  const chuaKhopRows = chuaKhopData?.rows ?? [];

  const [detailKtv, setDetailKtv] = useState<KtvTonKhoSummaryRow | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importRunning, setImportRunning] = useState(false);
  const [importTotal, setImportTotal] = useState(0);
  const [importProcessed, setImportProcessed] = useState(0);
  const [importSummary, setImportSummary] = useState<{ matched: number; unmatched: string[] } | null>(null);
  // "doc" = dang doc file (Web Worker), "gui" = dang gui tung lo len server (2026-10-03).
  const [importPha, setImportPha] = useState<"doc" | "gui">("doc");
  const importAbort = useRef<AbortController | null>(null);

  async function handleImport(file: File) {
    setImportRunning(true);
    setImportSummary(null);
    setImportPha("doc");
    setImportTotal(0);
    setImportProcessed(0);
    const ac = new AbortController();
    importAbort.current = ac;
    try {
      const parsed = await parseTonKhoImportFileNen(file, { signal: ac.signal });
      if (parsed.rows.length === 0) {
        addToast('Không đọc được dòng nào hợp lệ (kiểm tra lại file có cột "Mã kho"/"Mã hàng")');
        return;
      }
      setImportTotal(parsed.rows.length);
      setImportProcessed(0);
      setImportPha("gui");
      // CHI gui dung lo dang xu ly (2026-10-03) - truoc day MOI request gui lai TOAN BO file (8.895 dong ~ 1,5 MB x 89 lan
      // = ~130 MB tai len, Worker parse JSON lon moi lan). Server ghi vao bang TAM, lo cuoi moi thay bang that (khong mat du
      // lieu neu dung giua chung).
      const LO = 200;
      let offset = 0;
      let matched = 0;
      const unmatched = new Set<string>();
      while (offset < parsed.rows.length) {
        if (ac.signal.aborted) throw new DOMException("Đã huỷ", "AbortError");
        const res = await api.post<{ done: boolean; nextOffset: number; matched: number; unmatched: string[] }>("/settings/ktv-ton-kho/import", {
          rows: parsed.rows.slice(offset, offset + LO),
          offset,
          total: parsed.rows.length,
          ky_tu_ngay: parsed.ky_tu_ngay,
          ky_den_ngay: parsed.ky_den_ngay,
        });
        matched += res.matched;
        res.unmatched.forEach((m) => unmatched.add(m));
        offset = res.nextOffset;
        setImportProcessed(Math.min(offset, parsed.rows.length));
        if (res.done) break;
      }
      setImportSummary({ matched, unmatched: Array.from(unmatched) });
      await qc.invalidateQueries({ queryKey: ["ktv-ton-kho"] });
      await qc.invalidateQueries({ queryKey: ["ktv-ton-kho-meta"] });
      await qc.invalidateQueries({ queryKey: ["ktv-ton-kho-ma-kho-chua-khop"] });
      addToast(`Đã nhập xong: ${matched} dòng khớp KTV / ${parsed.rows.length} dòng đọc được`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") addToast("Đã huỷ import — dữ liệu tồn kho cũ giữ nguyên");
      else addToast("Lỗi nhập tồn kho: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      importAbort.current = null;
      setImportRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)] flex items-center gap-1.5">
        Tồn kho linh kiện đang giữ tại từng KTV, đối chiếu cùng Trần công nợ - import hàng ngày từ báo cáo "Tổng hợp tồn kho" của MISA.
        <Tooltip text={`Ghép theo cột "Mã kho" trong file MISA với "Mã tài khoản MISA" đã gán cho từng KTV (thẻ "KTV hiện trường" › Quản lý User). KTV chưa có Mã MISA hoặc Mã MISA không khớp sẽ bị bỏ qua khi import - xem danh sách "không khớp" sau khi import xong.`} />
      </div>
      {meta && (
        <div className="text-xs text-[var(--ink-500)]">
          {/* File "toan quoc" (them 2026-09-08) chi co 1 moc ngay (bao cao chup nhanh), khong phai
          khoang - ky_tu_ngay===ky_den_ngay thi hien 1 lan, tranh lap "X -> X" gay hieu lam. */}
          Cập nhật lần cuối theo kỳ báo cáo MISA:{" "}
          <b>
            {meta.ky_tu_ngay && meta.ky_tu_ngay === meta.ky_den_ngay
              ? meta.ky_tu_ngay
              : `${meta.ky_tu_ngay ?? "?"} → ${meta.ky_den_ngay ?? "?"}`}
          </b>{" "}
          ({meta.so_dong} dòng đọc được)
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        {canManage && (
          <Btn size="sm" onClick={() => { setImportOpen(true); setImportSummary(null); setImportTotal(0); setImportProcessed(0); }}>
            📥 Import tồn kho MISA
          </Btn>
        )}
      </div>
      {canSeeChuaKhop && (
        <Tabs
          tabs={[
            { key: "da-khop", label: "Đã khớp mã kho" },
            { key: "chua-khop", label: "Chưa khớp mã kho", count: chuaKhopRows.length },
          ]}
          active={tab}
          onChange={(k) => setTab(k as "da-khop" | "chua-khop")}
        />
      )}
      {tab === "chua-khop" && canSeeChuaKhop ? (
        <ChuaKhopPanel rows={chuaKhopRows} />
      ) : (
        <>
      {allRows.length > 1 && <CongNoOverview rows={allRows} onOpen={setDetailKtv} />}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã/tên KTV, mã MISA…"
          className="o-tim focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-full sm:w-64"
        />
      </div>
      {/* The mobile (ra soat mobile 2026-09-27): bang 10 cot cuon ngang tren dien thoai chi thay "Mã KTV/Tên",
          so lieu can doc (cong no chot / tran / danh gia) nam khuat ben phai. The: ten + danh gia (goc phai)
          / ma KTV · MISA / Cong no chot noi bat + Tran + SL ton. Bam the mo chi tiet nhu bam dong bang. */}
      <div className="sm:hidden divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
        {isLoading && <div className="px-3 py-6 text-center text-sm text-[var(--ink-400)]">Đang tải…</div>}
        {!isLoading && allRows.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-[var(--ink-400)]">Chưa có dữ liệu tồn kho{canManage ? ' - bấm "Import tồn kho MISA" để nhập.' : "."}</div>
        )}
        {pageRows.map((r) => (
          <div
            key={r.ma_ktv}
            role="button"
            tabIndex={0}
            onClick={() => setDetailKtv(r)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailKtv(r); } }}
            className="space-y-1 px-3 py-2.5 active:bg-slate-50 cursor-pointer focus-ring"
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--color-text)]">{r.ten_hien_thi ?? r.ma_ktv}</div>
              <div className="shrink-0"><DanhGiaCongNoBadge value={r.danh_gia_cong_no} /></div>
            </div>
            <div className="truncate text-xs text-[var(--color-text-secondary)]">
              <span className="font-mono">{r.ma_ktv}</span>
              {r.ma_misa && <> · MISA {r.ma_misa}</>}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
              <span>
                <span className="text-[var(--color-text-muted)]">Công nợ chốt </span>
                <b className="text-[13px] text-[var(--color-text)]"><Money>{fmtVND(r.cong_no_chot)}</Money></b>
              </span>
              <span>
                <span className="text-[var(--color-text-muted)]">Trần </span>
                {r.cong_no != null ? <Money>{fmtVND(r.cong_no)}</Money> : "—"}
              </span>
              <span>
                <span className="text-[var(--color-text-muted)]">Tồn </span>
                {r.so_ma_hang} mã · {r.tong_cuoi_ky?.toLocaleString("vi-VN") ?? 0} SL
              </span>
              {!!r.sl_ho_tro_0d && (
                <span>
                  <span className="text-[var(--color-text-muted)]">Hỗ trợ 0đ </span>
                  {r.sl_ho_tro_0d.toLocaleString("vi-VN")} SL
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden sm:block border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr className="tbl-head">
                <th className="px-3 py-2">Mã KTV</th>
                <th className="px-3 py-2">Tên hiển thị</th>
                <th className="px-3 py-2">Mã MISA</th>
                <th className="px-3 py-2">Trần công nợ</th>
                <th className="px-3 py-2">Công nợ thực tế</th>
                <th className="px-3 py-2">Công nợ phát sinh</th>
                <th className="px-3 py-2" title="Đơn TRỪ CÔNG NỢ đã thanh toán (Kế toán duyệt chuyển tiền) — trừ ngay, không chờ lần import tồn kho MISA sau">Đã trừ công nợ</th>
                <th className="px-3 py-2">Công nợ chốt</th>
                <th className="px-3 py-2">Đánh giá công nợ</th>
                <th className="px-3 py-2">Số mã hàng tồn</th>
                <th className="px-3 py-2">Tổng SL tồn</th>
                <th className="px-3 py-2" title="SL tồn đang được tính công nợ = 0đ theo chương trình &quot;Công nợ 0 đồng&quot; (đã trừ khỏi Công nợ thực tế)">SL hỗ trợ 0 đồng</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={13} className="px-3 py-6 text-center text-[var(--ink-400)]">Đang tải…</td>
                </tr>
              )}
              {!isLoading && allRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-6 text-center text-[var(--ink-400)]">Chưa có dữ liệu tồn kho{canManage ? ' - bấm "Import tồn kho MISA" để nhập.' : "."}</td>
                </tr>
              )}
              {pageRows.map((r) => (
                <tr
                  key={r.ma_ktv}
                  className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer focus-ring"
                  onClick={() => setDetailKtv(r)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailKtv(r); } }}
                >
                  <td className="px-3 py-2 font-mono text-xs">{r.ma_ktv}</td>
                  <td className="px-3 py-2">{r.ten_hien_thi ?? "—"}</td>
                  <td className="px-3 py-2">{r.ma_misa ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span title={r.cong_no_cap_nhat_luc ? `Cập nhật lúc ${fmtDateTime(r.cong_no_cap_nhat_luc)}` : undefined}>
                      {r.cong_no != null ? <Money>{fmtVND(r.cong_no)}</Money> : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs"><Money>{fmtVND(r.cong_no_thuc_te)}</Money></td>
                  <td className="px-3 py-2 font-mono text-xs"><Money>{fmtVND(r.cong_no_phat_sinh)}</Money></td>
                  <td className="px-3 py-2 font-mono text-xs">{r.cong_no_da_tru > 0 ? <>−<Money>{fmtVND(r.cong_no_da_tru)}</Money></> : "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold"><Money>{fmtVND(r.cong_no_chot)}</Money></td>
                  <td className="px-3 py-2">
                    <DanhGiaCongNoBadge value={r.danh_gia_cong_no} />
                  </td>
                  <td className="px-3 py-2">{r.so_ma_hang}</td>
                  <td className="px-3 py-2">{r.tong_cuoi_ky?.toLocaleString("vi-VN") ?? 0}</td>
                  <td className="px-3 py-2">{r.sl_ho_tro_0d ? r.sl_ho_tro_0d.toLocaleString("vi-VN") : <span className="text-[var(--ink-400)]">—</span>}</td>
                  <td className="px-3 py-2">
                    <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={(e) => { e.stopPropagation(); setDetailKtv(r); }}>
                      Xem chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {allRows.length > 0 && (
        <div className="flex items-center justify-between px-1 py-1 text-xs text-[var(--ink-400)]">
          <span>{allRows.length} KTV</span>
          <div className="flex gap-1">
            <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Btn>
            <span className="px-2 py-1.5">{page}/{Math.max(1, Math.ceil(allRows.length / PAGE_SIZE))}</span>
            <Btn variant="ghost" size="sm" disabled={page * PAGE_SIZE >= allRows.length} onClick={() => setPage((p) => p + 1)}>›</Btn>
          </div>
        </div>
      )}
        </>
      )}

      {detailKtv && <TonKhoChiTietModal row={detailKtv} onClose={() => setDetailKtv(null)} />}

      {canManage && (
        <Modal open={importOpen} onClose={() => { if (!importRunning) setImportOpen(false); }} title="Import tồn kho MISA">
          <div className="space-y-3">
            <div className="text-xs text-[var(--ink-500)]">
              Chọn file Excel "Tổng hợp tồn kho" xuất từ MISA (báo cáo gồm tất cả kho/KTV trong 1 file). Import sẽ <b>GHI ĐÈ toàn bộ</b> dữ liệu tồn kho hiện có bằng dữ liệu trong file.
            </div>
            {!importRunning && !importSummary && (
              <>
                <Btn variant="ghost" size="sm" onClick={() => void downloadTonKhoImportTemplate()}>
                  ⬇ Tải file mẫu
                </Btn>
                <FileButton accept=".xlsx,.xls" onFileSelected={(f) => void handleImport(f)}>
                  ⬆ Chọn file Excel
                </FileButton>
              </>
            )}
            {importRunning && (
              <div className="text-sm">
                {importPha === "doc" ? "Đang đọc file Excel..." : `Đang nhập... ${importProcessed}/${importTotal} dòng`}
                <div className="w-full h-2 bg-[var(--surface-100)] rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-[var(--ocean-800)] transition-all"
                    style={{ width: `${importTotal ? Math.min(100, (importProcessed / importTotal) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}
            {importSummary && (
              <div className="text-sm space-y-2">
                <div>
                  ✅ Đã khớp KTV: <b>{importSummary.matched}</b> dòng
                  {importSummary.unmatched.length > 0 && <> · ⚠ Không khớp: <b>{importSummary.unmatched.length}</b> mã kho</>}
                </div>
                {importSummary.unmatched.length > 0 && (
                  <div className="rounded-lg border border-[var(--coral-500)] bg-[var(--coral-100)] px-3 py-2 text-xs text-[var(--coral-600)]">
                    {/* SUA (phan hoi 2026-09-08): truoc day cac ma nay bi BO HAN (khong luu), phai gan
                    Mã MISA roi IMPORT LAI moi thay - gio da luu san (ma_ktv de trong), Admin/Ke toan chi
                    can vao "KTV hiện trường" chọn bổ sung Mã MISA (co dropdown chọn tu danh sách nay) la
                    khop lai NGAY, khong can import lai. */}
                    <div className="font-semibold mb-1">Các mã kho sau không khớp Mã MISA của KTV nào (đã lưu tồn kho, chưa hiện trong danh sách KTV):</div>
                    <div className="font-mono max-h-32 overflow-y-auto">{importSummary.unmatched.join(", ")}</div>
                    <div className="mt-1">Vào thẻ "KTV hiện trường" (Quản lý User) mở Sửa 1 KTV, chọn bổ sung "Mã tài khoản MISA" từ danh sách gợi ý - khớp lại ngay, không cần import lại.</div>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              {/* Huy khi dang chay (2026-10-03): dung doc file / dung gui lo tiep - server chi thay bang that o lo cuoi nen du lieu cu con nguyen. */}
              <Btn variant="ghost" onClick={() => (importRunning ? importAbort.current?.abort() : setImportOpen(false))}>
                {importSummary ? "Đóng" : "Huỷ"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// "Chưa khớp mã kho" (them 2026-09-09) - danh sach cac "Mã kho" da import (ktv_ton_kho.ma_ktv IS
// NULL) nhung khong khop "Mã MISA" cua KTV nao, xem GET /ma-kho-chua-khop o backend/src/routes/ktvTonKho.ts.
// Tim kiem/phan trang lam CLIENT-SIDE (giong TonKhoKtvContent) vi backend khong phan trang endpoint nay
// va so dong thuc te chi vai tram.
function ChuaKhopPanel({ rows }: { rows: MaKhoChuaKhopRow[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const filtered = search
    ? rows.filter((r) => {
        // .normalize("NFC") - xem giai thich day du o components/ui/Select.tsx (cung fix, cung ngay).
        const q = search.toLowerCase().normalize("NFC");
        return r.ma_kho.toLowerCase().normalize("NFC").includes(q) || (r.ten_kho ?? "").toLowerCase().normalize("NFC").includes(q);
      })
    : rows;
  useEffect(() => setPage(1), [search]);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)]">
        Các "Mã kho" đã import nhưng chưa khớp "Mã MISA" của KTV nào - dữ liệu tồn kho vẫn được lưu nhưng chưa hiện trong danh sách "Đã khớp mã kho". Vào thẻ "KTV hiện trường" (Quản lý User) mở Sửa 1 KTV, chọn bổ sung "Mã tài khoản MISA" từ danh sách gợi ý để khớp lại.
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã/tên kho…"
          className="o-tim focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-64"
        />
      </div>
      <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr className="tbl-head">
                <th className="px-3 py-2">Mã kho</th>
                <th className="px-3 py-2">Tên kho</th>
                <th className="px-3 py-2">Số mã hàng tồn</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-[var(--ink-400)]">
                    {rows.length === 0 ? "Không có mã kho nào chưa khớp." : "Không tìm thấy mã kho phù hợp."}
                  </td>
                </tr>
              )}
              {pageRows.map((r) => (
                <tr key={r.ma_kho} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{r.ma_kho}</td>
                  <td className="px-3 py-2">{r.ten_kho ?? "—"}</td>
                  <td className="px-3 py-2">{r.so_ma_hang}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-1 py-1 text-xs text-[var(--ink-400)]">
          <span>{filtered.length} mã kho</span>
          <div className="flex gap-1">
            <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Btn>
            <span className="px-2 py-1.5">{page}/{Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}</span>
            <Btn variant="ghost" size="sm" disabled={page * PAGE_SIZE >= filtered.length} onClick={() => setPage((p) => p + 1)}>›</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function TonKhoChiTietModal({ row, onClose }: { row: KtvTonKhoSummaryRow; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ktv-ton-kho-chi-tiet", row.ma_ktv],
    queryFn: () => api.get<{ rows: KtvTonKhoChiTietRow[] }>(`/settings/ktv-ton-kho/${encodeURIComponent(row.ma_ktv)}/chi-tiet`),
  });

  return (
    <Modal open onClose={onClose} title={`Tồn kho - ${row.ten_hien_thi ?? row.ma_ktv}`} width="max-w-[95vw] sm:max-w-[1100px]">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs border border-[var(--line)] rounded-xl bg-[var(--surface-soft)] px-3 py-2">
          <div><span className="text-[var(--ink-400)]">Trần công nợ: </span><span className="font-semibold">{row.cong_no != null ? <Money>{fmtVND(row.cong_no)}</Money> : "—"}</span></div>
          <div><span className="text-[var(--ink-400)]">Công nợ thực tế: </span><span className="font-mono font-semibold"><Money>{fmtVND(row.cong_no_thuc_te)}</Money></span></div>
          {!!row.sl_ho_tro_0d && (
            <div title="Đã trừ khỏi Công nợ thực tế"><span className="text-[var(--ink-400)]">SL hỗ trợ 0 đồng: </span><span className="font-semibold">{row.sl_ho_tro_0d}</span></div>
          )}
          <div><span className="text-[var(--ink-400)]">Công nợ phát sinh: </span><span className="font-mono font-semibold"><Money>{fmtVND(row.cong_no_phat_sinh)}</Money></span></div>
          {row.cong_no_da_tru > 0 && (
            <div title="Đơn TRỪ CÔNG NỢ đã thanh toán — trừ ngay, không chờ lần import tồn kho MISA sau">
              <span className="text-[var(--ink-400)]">Đã trừ công nợ: </span><span className="font-mono font-semibold">−<Money>{fmtVND(row.cong_no_da_tru)}</Money></span>
            </div>
          )}
          <div><span className="text-[var(--ink-400)]">Công nợ chốt: </span><span className="font-mono font-semibold"><Money>{fmtVND(row.cong_no_chot)}</Money></span></div>
          <div className="flex items-center gap-1"><span className="text-[var(--ink-400)]">Đánh giá: </span><DanhGiaCongNoBadge value={row.danh_gia_cong_no} /></div>
        </div>
        <div className="border border-[var(--line)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="tbl w-full">
              <thead className="sticky top-0 bg-[var(--surface-soft)]">
                <tr className="tbl-head">
                  <th className="px-3 py-2">Mã hàng</th>
                  <th className="px-3 py-2">Tên hàng</th>
                  <th className="px-3 py-2">ĐVT</th>
                  <th className="px-3 py-2 text-right">Đầu kỳ</th>
                  <th className="px-3 py-2 text-right">Nhập kho</th>
                  <th className="px-3 py-2 text-right">Xuất kho</th>
                  <th className="px-3 py-2 text-right">Cuối kỳ</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap" title="SL các đơn TRỪ CÔNG NỢ tạo sau lần import tồn kho gần nhất, chưa bị từ chối/hủy">Đã trừ theo đơn</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Tồn còn lại</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap" title="SL tồn được tính công nợ = 0đ (chương trình Công nợ 0 đồng đang áp dụng)">SL hỗ trợ 0đ</th>
                  <th className="px-3 py-2 text-right">Công nợ thực tế</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={11} className="px-3 py-6 text-center text-[var(--ink-400)]">Đang tải…</td></tr>
                )}
                {(data?.rows ?? []).map((p) => (
                  <tr key={p.ma_hang} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-2 font-mono">{p.ma_hang}</td>
                    <td className="px-3 py-2">{p.ten_hang ?? "—"}</td>
                    <td className="px-3 py-2">{p.dvt ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{p.dau_ky ?? 0}</td>
                    <td className="px-3 py-2 text-right">{p.nhap_kho ?? 0}</td>
                    <td className="px-3 py-2 text-right">{p.xuat_kho ?? 0}</td>
                    <td className="px-3 py-2 text-right font-semibold">{p.cuoi_ky ?? 0}</td>
                    <td className="px-3 py-2 text-right">{p.da_tru_theo_don ? p.da_tru_theo_don : <span className="text-[var(--ink-400)]">—</span>}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${(p.ton_con_lai ?? p.cuoi_ky ?? 0) < 0 ? "text-[var(--color-danger-strong)]" : ""}`}>
                      {p.ton_con_lai ?? p.cuoi_ky ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right">{p.sl_ho_tro_0d ? p.sl_ho_tro_0d : <span className="text-[var(--ink-400)]">—</span>}</td>
                    <td className="px-3 py-2 text-right font-mono"><Money>{fmtVND(p.cong_no_thuc_te)}</Money></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex justify-end">
          <Btn variant="ghost" size="sm" onClick={onClose}>Đóng</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Tab "Kho công ty" (them 2026-09-11) ----------

function KhoCongTyContent() {
  const auth = useAuth();
  const isAdmin = auth.status === "authenticated" && auth.user.vai_tro === "Admin";
  // Them 2026-09-21 (phan hoi "mo modules cong no ktv full quyen cho ke toan") - CRUD "Kho công ty"
  // (Them/Sua kho + gan Khu vuc phuc vu) mo them cho Ke toan, giong dung nhom adminOrKeToan o backend.
  const canManage = isAdmin || (auth.status === "authenticated" && !!auth.user.la_ke_toan);
  const qc = useQueryClient();
  const addToast = useToast();

  const { data: khoData, isLoading } = useQuery({
    queryKey: ["kho-cong-ty"],
    queryFn: () => api.get<{ rows: KhoCongTyRow[] }>("/settings/ktv-ton-kho/kho-cong-ty"),
  });
  const { data: tonData } = useQuery({
    queryKey: ["kho-cong-ty-ton-kho"],
    queryFn: () => api.get<{ rows: KhoCongTyTonKhoSummaryRow[] }>("/settings/ktv-ton-kho/kho-cong-ty-ton-kho"),
  });
  const { data: khuVucData } = useQuery({
    queryKey: ["settings-khu-vuc"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/settings/khu-vuc"),
  });
  const khuVucOptions = khuVucData?.rows ?? [];
  const khuVucTenByMa = new Map(khuVucOptions.map((k) => [k.ma, k.ten]));
  const tonByMa = new Map((tonData?.rows ?? []).map((r) => [r.ma, r]));
  const rows = khoData?.rows ?? [];

  const [formTarget, setFormTarget] = useState<KhoCongTyRow | "new" | null>(null);
  const [detailRow, setDetailRow] = useState<{ ma: string; ten: string } | null>(null);

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)]">
        Danh sách kho vật lý của công ty - dùng để tự động duyệt (bỏ qua bước chờ TN duyệt) đơn mua/công nợ khi khu vực của KTV còn đủ tồn. Tồn kho gốc nhập <b>chung 1 file</b> với tab "Tồn kho KTV" (cùng nút "Import tồn kho MISA").
        <Tooltip text={`Tồn chốt = Tồn gốc (lần import gần nhất) trừ Tồn phát sinh (tổng SL các đơn cùng mã hàng, cùng khu vực, tạo sau lần import đó, chưa bị huỷ/từ chối) - cộng gộp mọi kho đang bật cùng phục vụ 1 khu vực.`} />
      </div>
      {canManage && (
        <Btn size="sm" onClick={() => setFormTarget("new")}>
          + Thêm kho
        </Btn>
      )}
      {/* The mobile (ra soat mobile 2026-09-27) - cung du lieu voi bang 7 cot ben duoi. */}
      <div className="sm:hidden divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
        {isLoading && <div className="px-3 py-6 text-center text-sm text-[var(--ink-400)]">Đang tải…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-[var(--ink-400)]">Chưa có kho nào{canManage ? ' - bấm "+ Thêm kho" để tạo.' : "."}</div>
        )}
        {rows.map((r) => {
          const ton = tonByMa.get(r.ma);
          return (
            <div
              key={r.ma}
              role="button"
              tabIndex={0}
              onClick={() => setDetailRow({ ma: r.ma, ten: r.ten })}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailRow({ ma: r.ma, ten: r.ten }); } }}
              className="flex items-start gap-2 px-3 py-2.5 active:bg-slate-50 cursor-pointer focus-ring"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--color-text)]">{r.ten}</div>
                  <div className="shrink-0">{r.bat_tat ? <Badge tone="teal">Đang dùng</Badge> : <Badge tone="gray">Đã tắt</Badge>}</div>
                </div>
                <div className="truncate text-xs text-[var(--color-text-secondary)]">
                  <span className="font-mono">{r.ma}</span> · {r.khu_vuc_ma.length > 0 ? r.khu_vuc_ma.map((m) => khuVucTenByMa.get(m) ?? m).join(", ") : "Chưa gán khu vực"}
                </div>
                <div className="text-xs">
                  <span className="text-[var(--color-text-muted)]">Tồn </span>
                  {ton?.so_ma_hang ?? 0} mã · {(ton?.tong_cuoi_ky ?? 0).toLocaleString("vi-VN")} SL
                </div>
              </div>
              {canManage && (
                <button className="shrink-0 pt-0.5 text-xs text-[var(--ocean-600)]" onClick={(e) => { e.stopPropagation(); setFormTarget(r); }}>
                  Sửa
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="hidden sm:block border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr className="tbl-head">
                <th className="px-3 py-2">Mã kho</th>
                <th className="px-3 py-2">Tên kho</th>
                <th className="px-3 py-2">Khu vực phục vụ</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Số mã hàng</th>
                <th className="px-3 py-2">Tổng SL tồn</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--ink-400)]">Đang tải…</td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--ink-400)]">Chưa có kho nào{canManage ? ' - bấm "+ Thêm kho" để tạo.' : "."}</td>
                </tr>
              )}
              {rows.map((r) => {
                const ton = tonByMa.get(r.ma);
                return (
                  <tr
                    key={r.ma}
                    className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer focus-ring"
                    onClick={() => setDetailRow({ ma: r.ma, ten: r.ten })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailRow({ ma: r.ma, ten: r.ten }); } }}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{r.ma}</td>
                    <td className="px-3 py-2">{r.ten}</td>
                    <td className="px-3 py-2 text-xs">{r.khu_vuc_ma.length > 0 ? r.khu_vuc_ma.map((m) => khuVucTenByMa.get(m) ?? m).join(", ") : "—"}</td>
                    <td className="px-3 py-2">
                      {r.bat_tat ? <Badge tone="teal">Đang dùng</Badge> : <Badge tone="gray">Đã tắt</Badge>}
                    </td>
                    <td className="px-3 py-2">{ton?.so_ma_hang ?? 0}</td>
                    <td className="px-3 py-2">{(ton?.tong_cuoi_ky ?? 0).toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-2">
                      {canManage && (
                        <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={(e) => { e.stopPropagation(); setFormTarget(r); }}>
                          Sửa
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {formTarget && (
        <KhoCongTyFormModal
          existing={formTarget === "new" ? null : formTarget}
          khuVucOptions={khuVucOptions}
          onClose={() => setFormTarget(null)}
          addToast={addToast}
          onSaved={() => {
            setFormTarget(null);
            qc.invalidateQueries({ queryKey: ["kho-cong-ty"] });
            qc.invalidateQueries({ queryKey: ["kho-cong-ty-ton-kho"] });
          }}
        />
      )}
      {detailRow && <KhoCongTyChiTietModal ma={detailRow.ma} ten={detailRow.ten} onClose={() => setDetailRow(null)} />}
    </div>
  );
}

function KhoCongTyFormModal({
  existing, khuVucOptions, onClose, addToast, onSaved,
}: {
  existing: KhoCongTyRow | null;
  khuVucOptions: { ma: string; ten: string }[];
  onClose: () => void;
  addToast: (msg: string) => void;
  onSaved: () => void;
}) {
  const [ma, setMa] = useState(existing?.ma ?? "");
  const [ten, setTen] = useState(existing?.ten ?? "");
  const [batTat, setBatTat] = useState(existing?.bat_tat !== 0);
  const [khuVucMa, setKhuVucMa] = useState<Set<string>>(new Set(existing?.khu_vuc_ma ?? []));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (existing) {
        await api.patch(`/settings/ktv-ton-kho/kho-cong-ty/${encodeURIComponent(existing.ma)}`, { ten: ten.trim(), bat_tat: batTat });
      } else {
        await api.post("/settings/ktv-ton-kho/kho-cong-ty", { ma: ma.trim(), ten: ten.trim() });
      }
      const targetMa = existing?.ma ?? ma.trim();
      await api.patch(`/settings/ktv-ton-kho/kho-cong-ty/${encodeURIComponent(targetMa)}/khu-vuc`, { khu_vuc_ma: [...khuVucMa] });
    },
    onSuccess: () => {
      addToast(existing ? "Đã lưu thay đổi" : "Đã thêm kho mới");
      onSaved();
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  function toggleKhuVuc(m: string) {
    setKhuVucMa((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  return (
    <Modal open onClose={onClose} title={existing ? `Sửa kho ${existing.ma}` : "Thêm kho công ty"}>
      <div className="space-y-3 text-sm">
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Mã kho *</label>
          <input
            value={ma}
            onChange={(e) => setMa(e.target.value)}
            disabled={!!existing}
            placeholder="Vd: 6803, 6804-MB"
            className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm disabled:bg-[var(--surface-200)] disabled:text-[var(--ink-400)]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Tên kho *</label>
          <input
            value={ten}
            onChange={(e) => setTen(e.target.value)}
            className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        </div>
        {existing && (
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-600)]">
            <input type="checkbox" checked={batTat} onChange={(e) => setBatTat(e.target.checked)} />
            Đang dùng (tính vào tồn kho tự động duyệt)
          </label>
        )}
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Khu vực phục vụ</label>
          <div className="flex flex-wrap gap-1.5">
            {khuVucOptions.map((k) => {
              const active = khuVucMa.has(k.ma);
              return (
                <button
                  key={k.ma}
                  type="button"
                  onClick={() => toggleKhuVuc(k.ma)}
                  className={`focus-ring rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                    active
                      ? "bg-[var(--ocean-800)] border-[var(--ocean-800)] text-white font-semibold"
                      : "bg-white border-[var(--line)] text-[var(--ink-600)] hover:border-[var(--ocean-400)]"
                  }`}
                >
                  {k.ten}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" size="sm" onClick={onClose}>Huỷ</Btn>
          <Btn
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!ma.trim() || !ten.trim() || saveMutation.isPending}
            loading={saveMutation.isPending}
          >
            Lưu
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function KhoCongTyChiTietModal({ ma, ten, onClose }: { ma: string; ten: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["kho-cong-ty-ton-kho-chi-tiet", ma],
    queryFn: () => api.get<{ rows: KhoCongTyTonKhoChiTietRow[] }>(`/settings/ktv-ton-kho/kho-cong-ty-ton-kho/${encodeURIComponent(ma)}/chi-tiet`),
  });

  return (
    <Modal open onClose={onClose} title={`Tồn kho - ${ten}`} width="max-w-2xl">
      <div className="space-y-3 text-sm">
        <div className="border border-[var(--line)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="tbl w-full">
              <thead className="sticky top-0 bg-[var(--surface-soft)]">
                <tr className="tbl-head">
                  <th className="px-3 py-2">Mã hàng</th>
                  <th className="px-3 py-2">Tên hàng</th>
                  <th className="px-3 py-2">ĐVT</th>
                  <th className="px-3 py-2 text-right">Đầu kỳ</th>
                  <th className="px-3 py-2 text-right">Nhập kho</th>
                  <th className="px-3 py-2 text-right">Xuất kho</th>
                  <th className="px-3 py-2 text-right">Cuối kỳ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--ink-400)]">Đang tải…</td></tr>
                )}
                {(data?.rows ?? []).map((p) => (
                  <tr key={p.ma_hang} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-2 font-mono">{p.ma_hang}</td>
                    <td className="px-3 py-2">{p.ten_hang ?? "—"}</td>
                    <td className="px-3 py-2">{p.dvt ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{p.dau_ky ?? 0}</td>
                    <td className="px-3 py-2 text-right">{p.nhap_kho ?? 0}</td>
                    <td className="px-3 py-2 text-right">{p.xuat_kho ?? 0}</td>
                    <td className="px-3 py-2 text-right font-semibold">{p.cuoi_ky ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex justify-end">
          <Btn variant="ghost" size="sm" onClick={onClose}>Đóng</Btn>
        </div>
      </div>
    </Modal>
  );
}
