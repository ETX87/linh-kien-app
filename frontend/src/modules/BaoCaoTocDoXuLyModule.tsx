import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "../api/client";
import { Card } from "../components/ui/Card";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { useToast } from "../components/ui/Toast";
import { KhuVucChipFilter } from "./datMuaLinhKien/SharedUi";
import { ChartCard } from "../components/charts/ChartCard";
import { HBarList } from "../components/charts/BarCharts";

// Bao cao "Toc do xu ly" (SLA theo tai khoan x giai doan quy trinh) - them 04/09/2026, xem
// backend/src/lib/slaMetrics.ts cho thuat toan tinh gio cho + backend/src/routes/baoCaoTocDoXuLy.ts
// cho endpoint. CHI Admin + la_view vao duoc module nay (xem App.tsx/navConfig.ts) - anh huong danh
// gia nhan su nen KHONG mo cho cac vai tro xu ly (TN/Kho/Ke toan/QC/GS) tu xem lan nhau.
interface GiaiDoanMeta {
  key: string;
  label: string;
  luong: "mua_cong_no" | "tra_hang" | "pxk" | "cho_ktv";
  noi_bo: boolean;
  ghi_chu: string | null;
}
interface XepHangRow {
  email: string;
  ten: string | null;
  da_xu_ly: number;
  tu_choi: number;
  tb_gio: number | null;
  tb_gio_ky_truoc: number | null;
  xu_huong_phan_tram: number | null;
}
interface XepHangResult {
  giai_doan: string;
  ky_loai: "thang" | "tuan";
  ky: string;
  dang_cho: number;
  rows: XepHangRow[];
}

const LUONG_LABELS: Record<GiaiDoanMeta["luong"], string> = {
  mua_cong_no: "Mua hàng / Công nợ",
  tra_hang: "Trả hàng",
  pxk: "Phiếu xuất kho",
  cho_ktv: "Chờ KTV hành động",
};
const LUONG_ORDER: GiaiDoanMeta["luong"][] = ["mua_cong_no", "tra_hang", "pxk", "cho_ktv"];

function defaultMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
function defaultWeek(): string {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function fmtGio(h: number | null): string {
  if (h == null) return "—";
  return `${h.toFixed(1)}h`;
}

// v1.552 (2026-11-21, "thêm cột TB ngày làm việc bên cạnh cột TB giờ"): 1 ngày làm việc = 8 giờ làm việc (cùng mốc SLA,
// lib/gioLamViec.ts backend). TB giờ đã tính theo giờ làm việc (v1.551) nên ngày = giờ / 8.
const GIO_MOT_NGAY = 8;
const ngayLv = (h: number | null) => (h == null ? null : h / GIO_MOT_NGAY);
function fmtNgay(h: number | null): string {
  const n = ngayLv(h);
  if (n == null) return "—";
  return `${n.toFixed(1)} ngày`;
}

function XuHuongBadge({ percent }: { percent: number | null }) {
  if (percent == null || Math.abs(percent) < 1) return <span className="text-[var(--ink-400)]">—</span>;
  const slower = percent > 0; // gio TB tang = xu ly cham di
  return (
    <span className={`font-semibold ${slower ? "text-[var(--coral-600)]" : "text-[var(--teal-600)]"}`}>
      {slower ? "▲" : "▼"} {Math.abs(percent).toFixed(0)}%
    </span>
  );
}

interface Filters {
  kyLoai: "thang" | "tuan";
  ky: string;
  khuVuc: Set<string>;
  nhomId: string;
}

// v1.447: server luu 1 ban / ngay cho CA 14 giai doan (GET /tong-hop) — man nay chi goi 1 lan, nut "Đồng bộ" moi tinh lai (?dong_bo=1).
interface TongHopResult {
  ky_loai: "thang" | "tuan";
  ky: string;
  cap_nhat_luc: string;
  cap_nhat_boi: string;
  giai_doan: Record<string, { dang_cho: number; rows: XepHangRow[] }>;
}

function tongHopKey(filters: Filters) {
  return ["bao-cao-toc-do-tong-hop", filters.kyLoai, filters.ky, [...filters.khuVuc].join(","), filters.nhomId];
}

function useTongHop(filters: Filters) {
  return useQuery({
    queryKey: tongHopKey(filters),
    queryFn: () => api.get<TongHopResult>(`/bao-cao-toc-do/tong-hop${xepHangQuery(filters)}`),
    staleTime: Infinity,
  });
}

function useXepHang(giaiDoan: string, filters: Filters): { data: XepHangResult | undefined; isLoading: boolean } {
  const { data, isLoading } = useTongHop(filters);
  const g = data?.giai_doan[giaiDoan];
  return { isLoading, data: data ? { giai_doan: giaiDoan, ky_loai: data.ky_loai, ky: data.ky, dang_cho: g?.dang_cho ?? 0, rows: g?.rows ?? [] } : undefined };
}

function xepHangQuery(filters: Filters, dongBo = false): string {
  return buildQuery({
    dong_bo: dongBo ? "1" : undefined,
    ky_loai: filters.kyLoai,
    ky: filters.ky,
    khu_vuc: [...filters.khuVuc].join(",") || undefined,
    nhom_id: filters.nhomId || undefined,
  });
}

// Ten sheet Excel: toi da 31 ky tu, khong chua : \ / ? * [ ], phai duy nhat trong 1 workbook - cac
// nhan giai doan hien tai deu da nam trong gioi han nay (kiem tra tay), nhung van xu ly phong khi co
// giai doan moi dai hon sau nay.
function sanitizeSheetName(label: string, used: Set<string>): string {
  let name = label.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet";
  let i = 2;
  while (used.has(name)) {
    const suffix = ` (${i})`;
    name = name.slice(0, 31 - suffix.length) + suffix;
    i += 1;
  }
  used.add(name);
  return name;
}

function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}

// "Tai bao cao" (them 04/09/2026, phan hoi nguoi dung) - xuat 1 file .xlsx nhieu sheet cho TOAN BO
// giai doan cung luc (theo dung ky/bo loc dang chon tren man hinh), khong chi rieng tab dang mo -
// 1 sheet "Tong quan" (giong het so lieu tab Tong quan tren man hinh) + 1 sheet/giai doan (bang xep
// hang day du, ke ca "TB gio ky truoc" khong hien tren UI de doi chieu tay khi can).
async function downloadBaoCaoTocDo(stages: GiaiDoanMeta[], filters: Filters) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const tongHop = await api.get<TongHopResult>(`/bao-cao-toc-do/tong-hop${xepHangQuery(filters)}`);
  const results = stages.map((stage) => ({ stage, data: tongHop.giai_doan[stage.key] ?? { dang_cho: 0, rows: [] } }));

  const tongQuanRows = results
    .filter(({ stage }) => stage.noi_bo)
    .map(({ stage, data }) => {
      const totalCount = data.rows.reduce((s, r) => s + r.da_xu_ly + r.tu_choi, 0);
      const totalHours = data.rows.reduce((s, r) => s + (r.tb_gio ?? 0) * (r.da_xu_ly + r.tu_choi), 0);
      return {
        "Luồng": LUONG_LABELS[stage.luong],
        "Giai đoạn": stage.label,
        "TB giờ (toàn hệ thống)": totalCount > 0 ? round1(totalHours / totalCount) : null,
        "TB ngày làm việc (toàn hệ thống)": totalCount > 0 ? round1(ngayLv(totalHours / totalCount)) : null,
        "Đang chờ": data.dang_cho,
        "Tổng đã xử lý": totalCount,
      };
    });
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(tongQuanRows), "Tong quan");

  const usedNames = new Set<string>(["Tong quan"]);
  for (const { stage, data } of results) {
    const rows = data.rows.map((r) => ({
      "Tài khoản": r.ten ?? r.email,
      "Email": r.email,
      "Đã xử lý": r.da_xu_ly,
      "Từ chối": r.tu_choi,
      "TB giờ xử lý": round1(r.tb_gio),
      "TB ngày làm việc": round1(ngayLv(r.tb_gio)),
      "TB giờ kỳ trước": round1(r.tb_gio_ky_truoc),
      "Xu hướng (%)": round1(r.xu_huong_phan_tram),
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName(stage.label, usedNames));
  }

  const kyLabel = filters.ky.replace(/[^0-9A-Za-z-]/g, "_");
  XLSX.writeFile(workbook, `bao_cao_toc_do_xu_ly_${kyLabel}.xlsx`);
}

function StageLeaderboard({ stage, filters }: { stage: GiaiDoanMeta; filters: Filters }) {
  const { data, isLoading } = useXepHang(stage.key, filters);
  return (
    <div className="space-y-3">
      {!stage.noi_bo && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--ink-500)]">
          Giai đoạn "chờ KTV hành động" - phản ánh tốc độ phản hồi của KTV, KHÔNG dùng để đánh giá tốc độ xử lý của nhân viên nội bộ.
        </div>
      )}
      {stage.ghi_chu && (
        <div className="rounded-lg border border-[var(--amber-500)] bg-[var(--amber-100)] px-3 py-2 text-xs text-[var(--amber-600)]">⚠ {stage.ghi_chu}</div>
      )}
      <div className="text-sm text-[var(--ink-700)]">
        Đang chờ ở bước này: <b className="font-display text-base">{isLoading ? "…" : (data?.dang_cho ?? 0)}</b>
      </div>
      {/* Bieu do (them 2026-09-26): gio TB theo tai khoan, cham nhat len dau (toi da 8 nguoi - con lai xem
          bang). Nguoi cham nhat to cam de noi bat, con lai 1 mau thuong hieu (do lon, khong phai phan loai). */}
      {!isLoading && (data?.rows.length ?? 0) > 0 && (
        <ChartCard title="Giờ xử lý trung bình theo tài khoản" subtitle="Chậm nhất ở trên cùng — tối đa 8 tài khoản, xem đủ ở bảng bên dưới">
          <HBarList
            rows={[...(data?.rows ?? [])]
              .filter((r) => r.tb_gio != null)
              .sort((a, b) => b.tb_gio! - a.tb_gio!)
              .slice(0, 8)
              .map((r, i) => ({
                key: r.email,
                label: r.ten ?? r.email,
                value: r.tb_gio!,
                display: fmtGio(r.tb_gio),
                color: i === 0 ? "var(--chart-2)" : "var(--chart-1)",
                sub: `${r.da_xu_ly} đã xử lý · ${r.tu_choi} từ chối`,
              }))}
          />
        </ChartCard>
      )}
      <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              {/* FIX (UX audit 2026-09-08, van de #6): them whitespace-nowrap cho header - truoc day
                  o man hinh mobile (375px), overflow-x-auto khong kich hoat cuon ngang vi <table w-full>
                  co the co lai bang cach cho chu header xuong 4-5 dong (vd "TB gio xu ly") thay vi
                  vuot qua be rong container. nowrap buoc bang phai rong hon container that su, luc do
                  overflow-x-auto moi cuon ngang dung nhu ky vong. */}
              <tr className="tbl-head">
                <th className="px-3 py-2 whitespace-nowrap">Tài khoản</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Đã xử lý</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Từ chối</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">TB giờ xử lý</th>
                <th className="px-3 py-2 text-right whitespace-nowrap" title="1 ngày làm việc = 8 giờ làm việc">TB ngày làm việc</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Xu hướng</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--ink-400)]">Đang tải…</td>
                </tr>
              )}
              {!isLoading && (data?.rows.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--ink-400)]">Chưa có dữ liệu trong kỳ này.</td>
                </tr>
              )}
              {(data?.rows ?? []).map((r) => (
                <tr key={r.email} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.ten ?? r.email}</div>
                    <div className="text-xs text-[var(--ink-400)]">{r.email}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.da_xu_ly}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.tu_choi}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{fmtGio(r.tb_gio)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtNgay(r.tb_gio)}</td>
                  <td className="px-3 py-2 text-right"><XuHuongBadge percent={r.xu_huong_phan_tram} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Tab "Tong quan" - 1 dong / giai doan NOI BO, bam vao 1 dong nhay thang toi tab chi tiet giai doan
// do (dap ung "nhin 5s"). Tinh TB gio TOAN HE THONG bang binh quan gia quyen theo so lan xu ly cua
// tung tai khoan (khong phai trung binh cong don gian giua cac tai khoan).
function tbGioToanHeThong(rows: XepHangRow[]): number | null {
  const totalCount = rows.reduce((s, r) => s + r.da_xu_ly + r.tu_choi, 0);
  const totalHours = rows.reduce((s, r) => s + (r.tb_gio ?? 0) * (r.da_xu_ly + r.tu_choi), 0);
  return totalCount > 0 ? totalHours / totalCount : null;
}

function TongQuanRow({ stage, filters, onJump }: { stage: GiaiDoanMeta; filters: Filters; onJump: (luong: GiaiDoanMeta["luong"], key: string) => void }) {
  const { data, isLoading } = useXepHang(stage.key, filters);
  const rows = data?.rows ?? [];
  const tbGio = tbGioToanHeThong(rows);
  const sorted = [...rows].filter((r) => r.tb_gio != null).sort((a, b) => (b.tb_gio! - a.tb_gio!));
  const cham = sorted[0];
  const nhanh = sorted[sorted.length - 1];
  const withTrend = rows.filter((r) => r.xu_huong_phan_tram != null);
  const avgTrend = withTrend.length > 0 ? withTrend.reduce((s, r) => s + r.xu_huong_phan_tram!, 0) / withTrend.length : null;

  return (
    <tr
      className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer focus-ring"
      onClick={() => onJump(stage.luong, stage.key)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJump(stage.luong, stage.key); } }}
    >
      <td className="px-3 py-2">
        <div className="font-medium">{stage.label}</div>
        <div className="text-xs text-[var(--ink-400)]">{LUONG_LABELS[stage.luong]}</div>
      </td>
      <td className="px-3 py-2 text-right font-mono font-semibold">{isLoading ? "…" : fmtGio(tbGio)}</td>
      <td className="px-3 py-2 text-right font-mono">{isLoading ? "…" : fmtNgay(tbGio)}</td>
      <td className="px-3 py-2 text-right font-mono">{isLoading ? "…" : (data?.dang_cho ?? 0)}</td>
      <td className="px-3 py-2 text-xs">{cham ? `${cham.ten ?? cham.email} (${fmtGio(cham.tb_gio)})` : "—"}</td>
      <td className="px-3 py-2 text-xs">{nhanh ? `${nhanh.ten ?? nhanh.email} (${fmtGio(nhanh.tb_gio)})` : "—"}</td>
      <td className="px-3 py-2 text-right"><XuHuongBadge percent={avgTrend} /></td>
    </tr>
  );
}

function TongQuanTab({ stages, filters, onJump }: { stages: GiaiDoanMeta[]; filters: Filters; onJump: (luong: GiaiDoanMeta["luong"], key: string) => void }) {
  const noiBoStages = stages.filter((s) => s.noi_bo);
  return (
    <div className="space-y-[14px]">
    <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
      <div className="overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr className="tbl-head">
              <th className="px-3 py-2 whitespace-nowrap">Giai đoạn</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">TB giờ (toàn hệ thống)</th>
              <th className="px-3 py-2 text-right whitespace-nowrap" title="1 ngày làm việc = 8 giờ làm việc">TB ngày làm việc</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Đang chờ</th>
              <th className="px-3 py-2 whitespace-nowrap">Chậm nhất</th>
              <th className="px-3 py-2 whitespace-nowrap">Nhanh nhất</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Xu hướng</th>
            </tr>
          </thead>
          <tbody>
            {noiBoStages.map((s) => (
              <TongQuanRow key={s.key} stage={s} filters={filters} onJump={onJump} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}

function FilterBar({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const { data: khuVucData } = useQuery({
    queryKey: ["settings-khu-vuc-all"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/settings/khu-vuc"),
  });
  const { data: nhomData } = useQuery({
    queryKey: ["loai-de-xuat-nhom"],
    queryFn: () => api.get<{ rows: { id: number; ten_nhom: string }[] }>("/settings/loai-de-xuat/nhom"),
  });
  const nhomRows = nhomData?.rows ?? [];
  const khuVucOptions = (khuVucData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ten }));

  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilters({ ...filters, kyLoai: "thang", ky: defaultMonth() })}
            className={`focus-ring filter-tab ${filters.kyLoai === "thang" ? "active" : ""}`}
          >
            Tháng
          </button>
          <button
            type="button"
            onClick={() => setFilters({ ...filters, kyLoai: "tuan", ky: defaultWeek() })}
            className={`focus-ring filter-tab ${filters.kyLoai === "tuan" ? "active" : ""}`}
          >
            Tuần
          </button>
        </div>
        {filters.kyLoai === "thang" ? (
          <input
            type="month"
            value={filters.ky}
            onChange={(e) => setFilters({ ...filters, ky: e.target.value })}
            className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        ) : (
          <input
            type="week"
            value={filters.ky}
            onChange={(e) => setFilters({ ...filters, ky: e.target.value })}
            className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        )}
        <select
          value={filters.nhomId}
          onChange={(e) => setFilters({ ...filters, nhomId: e.target.value })}
          className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        >
          <option value="">Tất cả loại đề xuất</option>
          {nhomRows.map((n) => (
            <option key={n.id} value={n.id}>{n.ten_nhom}</option>
          ))}
        </select>
      </div>
      {khuVucOptions.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide mb-1">Khu vực</div>
          <KhuVucChipFilter value={filters.khuVuc} onChange={(next) => setFilters({ ...filters, khuVuc: next })} options={khuVucOptions} />
        </div>
      )}
    </Card>
  );
}

export function BaoCaoTocDoXuLyModule() {
  const addToast = useToast();
  const { data: giaiDoanData, isLoading } = useQuery({
    queryKey: ["bao-cao-toc-do-giai-doan"],
    queryFn: () => api.get<{ giai_doan: GiaiDoanMeta[] }>("/bao-cao-toc-do/giai-doan"),
  });
  const stages = giaiDoanData?.giai_doan ?? [];
  const stagesByLuong = useMemo(() => {
    const m = new Map<GiaiDoanMeta["luong"], GiaiDoanMeta[]>();
    for (const s of stages) m.set(s.luong, [...(m.get(s.luong) ?? []), s]);
    return m;
  }, [stages]);

  const [filters, setFilters] = useState<Filters>({ kyLoai: "thang", ky: defaultMonth(), khuVuc: new Set(), nhomId: "" });
  const [level1, setLevel1] = useState<"tong-quan" | GiaiDoanMeta["luong"]>("tong-quan");
  const [stageKeyByLuong, setStageKeyByLuong] = useState<Partial<Record<GiaiDoanMeta["luong"], string>>>({});
  const [downloading, setDownloading] = useState(false);
  const qc = useQueryClient();
  const { data: tongHop } = useTongHop(filters);
  const dongBo = useMutation({
    mutationFn: () => api.get<TongHopResult>(`/bao-cao-toc-do/tong-hop${xepHangQuery(filters, true)}`),
    onSuccess: (d) => {
      qc.setQueryData(tongHopKey(filters), d);
      addToast("Đã đồng bộ báo cáo mới nhất");
    },
    onError: (err) => addToast("Lỗi đồng bộ: " + (err instanceof Error ? err.message : String(err))),
  });

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadBaoCaoTocDo(stages, filters);
    } catch (err) {
      addToast("Lỗi tải báo cáo: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDownloading(false);
    }
  }

  function jumpToStage(luong: GiaiDoanMeta["luong"], key: string) {
    setLevel1(luong);
    setStageKeyByLuong((prev) => ({ ...prev, [luong]: key }));
  }

  if (isLoading) return <div className="text-[var(--ink-400)] text-sm p-4">Đang tải…</div>;

  const level1Tabs = [
    { key: "tong-quan", label: "Tổng quan" },
    ...LUONG_ORDER.filter((l) => (stagesByLuong.get(l)?.length ?? 0) > 0).map((l) => ({ key: l, label: LUONG_LABELS[l] })),
  ];
  const currentLuongStages = level1 !== "tong-quan" ? (stagesByLuong.get(level1) ?? []) : [];
  const activeStageKey = level1 !== "tong-quan" ? (stageKeyByLuong[level1] ?? currentLuongStages[0]?.key) : undefined;
  const activeStage = currentLuongStages.find((s) => s.key === activeStageKey);

  return (
    <div className="anim-in space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-[var(--ink-500)] max-w-3xl">
          Tốc độ xử lý trung bình theo từng tài khoản ở từng giai đoạn của quy trình, tính theo GIỜ LÀM VIỆC (T2–T6 8h–12h, 13h–17h; T7 8h–12h; không tính đêm, chiều T7, Chủ nhật) — mỗi giai đoạn chỉ tính lượt do NGƯỜI PHỤ TRÁCH xử lý (vd bước TBP xác nhận chỉ tính TBP): không tính người đặt hàng / KTV tự thao tác, thao tác tự động của hệ thống và các ca hủy. Khoảng chờ KTV hành động xem tab riêng.
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {tongHop && (
            <span className="text-xs text-[var(--ink-500)]" title={`Lưu bởi ${tongHop.cap_nhat_boi}`}>
              Dữ liệu lúc {tongHop.cap_nhat_luc.slice(11, 16)} {tongHop.cap_nhat_luc.slice(8, 10)}/{tongHop.cap_nhat_luc.slice(5, 7)}
            </span>
          )}
          <Btn size="sm" variant="ghost" onClick={() => dongBo.mutate()} loading={dongBo.isPending} title="Tính lại báo cáo theo dữ liệu mới nhất (thay bản đã lưu hôm nay)">
            ⟳ Đồng bộ
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => void handleDownload()} loading={downloading} disabled={stages.length === 0}>
            ⬇ Tải báo cáo
          </Btn>
        </div>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} />
      <Tabs tabs={level1Tabs} active={level1} onChange={(k) => setLevel1(k as "tong-quan" | GiaiDoanMeta["luong"])} />
      {level1 === "tong-quan" && <TongQuanTab stages={stages} filters={filters} onJump={jumpToStage} />}
      {level1 !== "tong-quan" && currentLuongStages.length > 0 && (
        <div className="space-y-3">
          <Tabs
            tabs={currentLuongStages.map((s) => ({ key: s.key, label: s.label }))}
            active={activeStageKey ?? ""}
            onChange={(k) => setStageKeyByLuong((prev) => ({ ...prev, [level1]: k }))}
          />
          {activeStage && <StageLeaderboard stage={activeStage} filters={filters} />}
        </div>
      )}
    </div>
  );
}
