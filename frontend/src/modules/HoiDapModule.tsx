import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { fmtDateTime } from "../types";
import { t } from "../i18n";
import { BatPushHoiDap, LOAI, LOC_XU_LY, TtBadge, type HoiDapRow } from "../components/hoiDap/HoiDapWidget";
import { HuongDanQuanLy } from "../components/hoiDap/HuongDan";

// Menu "Hỏi đáp" (2026-10-17, phan hoi "thêm menu sidebar cho nhân viên mua hàng quản lý ticket thắc mắc") - bang quan ly ticket hoi dap
// cho Mua hang/Admin (backend GET /hoi-dap, cung API voi khung chat). Bam 1 dong = mo khung chat dung ticket (su kien "mo-hoi-dap" ma
// HoiDapWidget nghe) - tra loi / tiep nhan / da xu ly / tu choi lam o do, khong lap lai giao dien chat o day.
const PAGE_SIZE = 30;

// Tab "Hướng dẫn tự động" (2026-10-28, migration 0102): kho huong dan KTV xem trong khung Hoi dap + he thong tu tra loi.
export function HoiDapModule() {
  const [tab, setTab] = useState<"cau-hoi" | "huong-dan">("cau-hoi");
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setTab("cau-hoi")} className={`filter-tab ${tab === "cau-hoi" ? "active" : ""}`}>{t("💬 Câu hỏi của KTV")}</button>
        <button type="button" onClick={() => setTab("huong-dan")} className={`filter-tab ${tab === "huong-dan" ? "active" : ""}`}>{t("📘 Hướng dẫn tự động")}</button>
      </div>
      {tab === "cau-hoi" ? <CauHoiKtv /> : <HuongDanQuanLy />}
    </div>
  );
}

function CauHoiKtv() {
  const [loc, setLoc] = useState("__MO__");
  const [q, setQ] = useState("");
  const [qGui, setQGui] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const h = setTimeout(() => setQGui(q.trim()), 400);
    return () => clearTimeout(h);
  }, [q]);
  // Tai MOI trang thai 1 lan (toi da 500 ticket gan nhat, mo truoc) roi loc tren may - so dem tung tab khop danh sach.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["hoi-dap-ds", "__QUAN_LY__", qGui],
    queryFn: () => api.get<{ rows: HoiDapRow[] }>(`/hoi-dap?trang_thai=&q=${encodeURIComponent(qGui)}&gioi_han=500`),
    refetchInterval: 30_000,
  });
  const tatCa = useMemo(() => data?.rows ?? [], [data]);
  const dem = useMemo(() => {
    const m: Record<string, number> = { "": tatCa.length, __MO__: 0 };
    for (const r of tatCa) {
      m[r.trang_thai] = (m[r.trang_thai] ?? 0) + 1;
      if (r.trang_thai === "Cho tiep nhan" || r.trang_thai === "Dang xu ly") m.__MO__ += 1;
    }
    return m;
  }, [tatCa]);
  const rows = useMemo(
    () => tatCa.filter((r) => (loc === "" ? true : loc === "__MO__" ? r.trang_thai === "Cho tiep nhan" || r.trang_thai === "Dang xu ly" : r.trang_thai === loc)),
    [tatCa, loc],
  );
  useEffect(() => setPage(1), [loc, qGui]);
  const trang = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const moChat = (id: string) => window.dispatchEvent(new CustomEvent("mo-hoi-dap", { detail: id }));

  const cols: Column<HoiDapRow>[] = [
    {
      key: "id",
      header: t("Mã"),
      mobile: "title",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {r.chua_doc && <span aria-label={t("Tin mới")} className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-danger)]" />}
          <span className="code-link font-mono">{r.id}</span>
        </span>
      ),
    },
    { key: "trang_thai", header: t("Trạng thái"), mobile: "badge", render: (r) => <TtBadge tt={r.trang_thai} /> },
    { key: "loai", header: t("Loại"), mobile: "meta", render: (r) => <span className="whitespace-nowrap">{t(LOAI[r.loai] ?? r.loai)}</span> },
    {
      key: "tieu_de",
      header: t("Câu hỏi"),
      mobile: "sub",
      render: (r) => <span className={`block max-w-[420px] truncate ${r.chua_doc ? "font-semibold text-[var(--color-text)]" : ""}`} title={r.tieu_de}>{r.tieu_de}</span>,
    },
    { key: "ma_lk", header: t("Mã LK"), mobile: "meta", render: (r) => (r.ma_lk ? <span className="font-mono">{r.ma_lk}</span> : <span className="text-[var(--color-text-faint)]">—</span>) },
    { key: "ma_don", header: t("Mã đơn / phiếu"), render: (r) => (r.ma_don ? <span className="font-mono">{r.ma_don}</span> : <span className="text-[var(--color-text-faint)]">—</span>) },
    { key: "nguoi_hoi", header: t("Người hỏi"), mobile: "meta", render: (r) => <span className="block max-w-[240px] truncate" title={r.ten_nguoi_hoi}>{r.ten_nguoi_hoi}</span> },
    { key: "nguoi_xu_ly", header: t("Người xử lý"), render: (r) => r.ten_nguoi_xu_ly ?? <span className="text-[var(--color-text-faint)]">—</span> },
    { key: "ngay_tao", header: t("Ngày hỏi"), render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.ngay_tao)}</span> },
    { key: "tin_cuoi", header: t("Cập nhật"), mobile: "meta", render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.tin_cuoi_luc)}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="text-[13px] text-[var(--color-text-secondary)]">
        {t("Câu hỏi của KTV gửi nhân viên mua hàng (giá, ngày hàng về…). Bấm 1 dòng để mở khung chat trả lời / tiếp nhận / đóng ticket.")}
      </div>
      <BatPushHoiDap />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {LOC_XU_LY.map((l) => (
            <button key={l.v} type="button" onClick={() => setLoc(l.v)} className={`filter-tab ${loc === l.v ? "active" : ""}`}>
              {t(l.label)} <span className="tabular opacity-70">({dem[l.v] ?? 0})</span>
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Tìm mã HD, mã LK, mã đơn, nội dung…")}
          className="o-tim focus-ring ml-auto w-full rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-base sm:w-72 sm:text-sm"
        />
      </div>
      <PaginatedTable
        columns={cols}
        rows={trang}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        page={page}
        pageSize={PAGE_SIZE}
        total={rows.length}
        onPageChange={setPage}
        onRowClick={(r) => moChat(r.id)}
        rowKey={(r) => r.id}
        emptyText={t("Không có câu hỏi nào.")}
        storageKey="hoi-dap-quan-ly"
      />
    </div>
  );
}
