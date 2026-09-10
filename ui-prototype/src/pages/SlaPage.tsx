import { useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Card, SectionTitle } from "../components/ui/Card";
import { Select } from "../components/ui/Form";
import { DataTable, type Column } from "../components/ui/DataTable";
import { usePersona } from "../hooks/usePersona";
import { EmptyState } from "../components/ui/Misc";
import { SLA } from "../mock/extra";
import type { SlaRow } from "../types";

const LUONG_LABEL: Record<string, string> = {
  mua_cong_no: "Mua hàng / Công nợ",
  tra_hang: "Trả hàng",
  pxk: "Phiếu xuất kho",
  cho_ktv: "Chờ KTV hành động",
};

export function SlaPage() {
  const { persona } = usePersona();
  const allowed = persona.coreRole === "ADMIN" || persona.view;
  const [ky, setKy] = useState("thang");
  const [luong, setLuong] = useState("mua_cong_no");

  if (!allowed) {
    return (
      <div className="anim-in">
        <PageHeader title="Báo cáo tốc độ xử lý" />
        <EmptyState title="Không có quyền xem" hint="Báo cáo này chỉ dành cho Admin và tài khoản View." />
      </div>
    );
  }

  const giaiDoans = SLA.filter((g) => g.luong === luong);

  const cols: Column<SlaRow & { id: string }>[] = [
    { key: "ten", header: "Người xử lý", cell: (r) => <span className="text-[12.5px] font-semibold">{r.ten}<span className="block text-[11px] font-normal text-[var(--color-text-faint)]">{r.email}</span></span> },
    { key: "dx", header: "Đã xử lý", align: "right", cell: (r) => <span className="tabular">{r.daXuLy}</span> },
    { key: "tc", header: "Từ chối", align: "right", cell: (r) => <span className="tabular">{r.tuChoi}</span> },
    { key: "tb", header: "TB giờ chờ", align: "right", cell: (r) => <span className="tabular font-mono">{r.tbGio}h</span> },
    { key: "tbk", header: "Kỳ trước", align: "right", cell: (r) => <span className="tabular font-mono text-[var(--color-text-secondary)]">{r.tbGioKyTruoc}h</span> },
    {
      key: "xh",
      header: "Xu hướng",
      align: "right",
      cell: (r) => {
        const pct = ((r.tbGio - r.tbGioKyTruoc) / r.tbGioKyTruoc) * 100;
        const better = pct < 0;
        return <span className={`text-[12px] font-semibold ${better ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>{better ? "▼" : "▲"} {Math.abs(pct).toFixed(0)}%</span>;
      },
    },
  ];

  return (
    <div className="anim-in">
      <PageHeader title="Báo cáo tốc độ xử lý" />
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Kỳ<Select value={ky} onChange={setKy} className="mt-1 w-32" options={[{ value: "thang", label: "Theo tháng" }, { value: "tuan", label: "Theo tuần" }]} />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Nhóm luồng<Select value={luong} onChange={setLuong} className="mt-1 w-48" options={Object.entries(LUONG_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        </label>
      </div>

      <div className="space-y-4">
        {giaiDoans.map((g) => (
          <Card key={g.key} className="p-3.5">
            <SectionTitle right={<span className="text-[11px] text-[var(--color-text-faint)]">Đang chờ: <b className="text-[var(--color-text)]">{g.dangCho}</b></span>}>{g.label}</SectionTitle>
            <DataTable columns={cols} rows={g.rows.map((r) => ({ ...r, id: r.email }))} minWidth={620} />
          </Card>
        ))}
      </div>
    </div>
  );
}
