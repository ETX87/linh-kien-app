import { useMemo, useState } from "react";
import type { ReturnOrder } from "../types";
import { PageHeader } from "../components/layout/PageHeader";
import { WorkflowStepper } from "../components/ui/WorkflowStepper";
import { DataTable, type Column } from "../components/ui/DataTable";
import { FilterChips } from "../components/ui/FilterChips";
import { SearchBar } from "../components/ui/SearchBar";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Btn } from "../components/ui/Btn";
import { Icon } from "../components/ui/Icon";
import { Card } from "../components/ui/Card";
import { ReturnDrawer } from "./shared/ReturnDrawer";
import { fmtDateTime, fmtVND } from "../lib/format";
import { usePersona } from "../hooks/usePersona";
import { useReturns } from "../hooks/useStore";
import { scopeReturns } from "../lib/scope";
import { returnsReadOnly } from "../lib/permissions";
import { RETURN_STEP_META } from "../lib/workflow";
import { RETURN_STEPS } from "../mock/returns";

export function ReturnPage({ mobile, externalOpenId }: { mobile?: boolean; externalOpenId?: string | null }) {
  const { persona } = usePersona();
  const all = useReturns();
  const readOnly = returnsReadOnly(persona);
  const [stepFilter, setStepFilter] = useState<string | null>(null);
  const [chip, setChip] = useState("tat-ca");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const scoped = useMemo(() => scopeReturns(persona, all).sort((a, b) => b.ngayTao.localeCompare(a.ngayTao)), [persona, all]);

  const filtered = useMemo(() => {
    let rows = scoped;
    if (stepFilter) rows = rows.filter((r) => r.buoc === stepFilter);
    if (chip === "uu-tien") rows = rows.filter((r) => r.uuTien);
    if (chip === "tu-choi") rows = rows.filter((r) => r.trangThaiTraHang === "Từ chối");
    const s = q.trim().toLowerCase();
    if (s) rows = rows.filter((r) => r.id.toLowerCase().includes(s) || r.maLk.toLowerCase().includes(s) || r.nguoiTaoTen.toLowerCase().includes(s));
    return rows;
  }, [scoped, stepFilter, chip, q]);

  const activeId = externalOpenId ?? openId;
  const activeRow = (all.find((r) => r.id === activeId) as ReturnOrder) ?? null;
  const navIdx = filtered.findIndex((r) => r.id === activeId);

  const stats = {
    tong: scoped.length,
    daDuyet: scoped.filter((r) => r.trangThaiTraHang === "Hoàn thành").length,
    dangXuLy: scoped.filter((r) => r.trangThaiTraHang === "Đang xử lý").length,
    tuChoi: scoped.filter((r) => r.trangThaiTraHang === "Từ chối").length,
  };
  const myTong = scoped.filter((r) => r.nguoiTao === persona.email).length;
  const myTien = scoped.filter((r) => r.nguoiTao === persona.email).reduce((a, r) => a + (r.giaChot ?? 0), 0);

  const cols: Column<ReturnOrder>[] = [
    {
      key: "id",
      header: "Mã đơn",
      cell: (r) => (
        <span className="inline-flex items-center gap-1 font-mono text-[12.5px] font-semibold">
          {r.id}
          {r.uuTien && <Icon.star size={12} className="text-[var(--color-star)]" />}
        </span>
      ),
    },
    { key: "loai", header: "Loại", cell: () => <Badge tone="warning">Trả hàng</Badge> },
    {
      key: "lk",
      header: "Linh kiện",
      cell: (r) => (
        <span className="text-[12.5px]">
          <span className="font-mono text-[var(--color-text-secondary)]">{r.maLk}</span> — {r.tenLk}
        </span>
      ),
    },
    { key: "sl", header: "SL", align: "right", cell: (r) => <span className="tabular">{r.slDeXuat}</span> },
    { key: "tao", header: "Người tạo", cell: (r) => <span className="text-[12.5px]">{r.nguoiTaoTen}{r.taoHo && <span className="text-[var(--color-text-secondary)]"> (tạo hộ)</span>}</span> },
    { key: "gs", header: "GS", cell: (r) => <span className="text-[12.5px] text-[var(--color-text-secondary)]">{r.gsTen}</span> },
    { key: "ngay", header: "Ngày tạo", cell: (r) => <span className="tabular text-[12px] text-[var(--color-text-secondary)]">{fmtDateTime(r.ngayTao)}</span> },
    {
      key: "buoc",
      header: "Bước hiện tại",
      cell: (r) => {
        const m = RETURN_STEP_META[r.buoc] ?? { icon: "•", tone: "info" as const };
        return (
          <Badge tone={m.tone} variant="soft">
            <span className="mr-0.5">{m.icon}</span>
            {r.buoc}
          </Badge>
        );
      },
    },
    { key: "tt", header: "Trạng thái", cell: (r) => <StatusBadge status={r.trangThaiTraHang} /> },
    {
      key: "act",
      header: "Hành động",
      cell: (r) => (
        <Btn variant="ghost" size="xs" onClick={() => setOpenId(r.id)}>
          Xem
        </Btn>
      ),
    },
  ];

  return (
    <div className="anim-in">
      <PageHeader
        title="Trả hàng"
        subtitle={readOnly ? "Chế độ theo dõi — bạn xem toàn bộ đơn trả hàng, không có nút xử lý." : undefined}
      />

      <div className="mb-4">
        <WorkflowStepper
          steps={RETURN_STEPS.map((s) => ({ key: s, label: s }))}
          activeKey={stepFilter ?? undefined}
          branch={{ label: "Từ chối", active: chip === "tu-choi", onClick: () => setChip((c) => (c === "tu-choi" ? "tat-ca" : "tu-choi")) }}
          onStepClick={(k) => setStepFilter((v) => (v === k ? null : k))}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterChips
          value={chip}
          onChange={setChip}
          options={[
            { key: "tat-ca", label: "Tất cả", count: scoped.length },
            { key: "uu-tien", label: "Ưu tiên", count: scoped.filter((r) => r.uuTien).length, icon: "⭐" },
            { key: "tu-choi", label: "Từ chối", count: scoped.filter((r) => r.trangThaiTraHang === "Từ chối").length, icon: "🔴" },
          ]}
        />
        <SearchBar value={q} onChange={setQ} placeholder="Tìm mã đơn / mã LK / tên KTV…" className="w-[280px]" />
      </div>

      <DataTable columns={cols} rows={filtered} onRowClick={(r) => setOpenId(r.id)} rowAccent={(r) => r.uuTien} emptyText="Không có đơn trả hàng phù hợp." />
      <div className="py-2 text-[12px] text-[var(--color-text-secondary)]">Hiển thị {filtered.length} / {scoped.length} đơn</div>

      <div className={mobile ? "grid gap-3" : "grid gap-3 lg:grid-cols-2"}>
        <Card className="p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
            <Icon.chart size={13} /> Thống kê nhanh
          </div>
          <div className="grid grid-cols-4 gap-2">
            <MiniStat label="Tổng đơn" value={stats.tong} />
            <MiniStat label="Đã duyệt" value={stats.daDuyet} tone="success" />
            <MiniStat label="Đang xử lý" value={stats.dangXuLy} tone="info" />
            <MiniStat label="Từ chối" value={stats.tuChoi} tone="danger" />
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
            <Icon.file size={13} /> Báo cáo (thẻ cá nhân)
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Đơn của tôi" value={myTong || 8} />
            <MiniStat label="Tổng tiền" value={fmtVND(myTien || 24_500_000)} small />
            <MiniStat label="Đã duyệt" value={stats.daDuyet || 5} />
          </div>
        </Card>
      </div>

      <ReturnDrawer
        row={activeRow}
        mobile={mobile}
        onClose={() => setOpenId(null)}
        nav={{
          hasPrev: navIdx > 0,
          hasNext: navIdx > -1 && navIdx < filtered.length - 1,
          onPrev: () => setOpenId(filtered[navIdx - 1]?.id ?? null),
          onNext: () => setOpenId(filtered[navIdx + 1]?.id ?? null),
        }}
      />
    </div>
  );
}

function MiniStat({ label, value, tone, small }: { label: string; value: string | number; tone?: "success" | "info" | "danger"; small?: boolean }) {
  const c = tone === "success" ? "text-[var(--color-success)]" : tone === "info" ? "text-[var(--color-info)]" : tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-text)]";
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-2">
      <span className="block text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</span>
      <span className={`tabular mt-0.5 block font-extrabold ${small ? "text-[12.5px]" : "text-[17px]"} ${c}`}>{value}</span>
    </div>
  );
}
