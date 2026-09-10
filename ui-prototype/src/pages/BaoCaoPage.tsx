import { useMemo, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Card, SectionTitle } from "../components/ui/Card";
import { StatCard } from "../components/ui/StatCard";
import { Btn } from "../components/ui/Btn";
import { Icon } from "../components/ui/Icon";
import { Select } from "../components/ui/Form";
import { DataTable, type Column } from "../components/ui/DataTable";
import { fmtVND } from "../lib/format";
import { usePersona } from "../hooks/usePersona";
import { useOrders, useReturns } from "../hooks/useStore";
import { scopeOrders, scopeReturns } from "../lib/scope";
import { KHU_VUC } from "../mock/extra";

interface PivotRow {
  id: string;
  ten: string;
  slDon: number;
  slMua: number;
  slCongNo: number;
  slTraHang: number;
  slTuChoi: number;
  slDangCho: number;
  slDaDuyet: number;
  tongTien: number;
  tienChoDuyet: number;
}

export function BaoCaoPage({ mobile }: { mobile?: boolean; onJump?: (t: string) => void }) {
  const { persona } = usePersona();
  const orders = useOrders();
  const returns = useReturns();
  const [range, setRange] = useState("30");
  const [kv, setKv] = useState("");
  const [loai, setLoai] = useState("");

  const isManager = persona.coreRole === "ADMIN" || persona.coreRole === "GS" || persona.tn || persona.kho || persona.keToan;
  const isQc = persona.coreRole === "QC";

  const so = useMemo(() => scopeOrders(persona, orders).filter((o) => (loai ? o.loai === loai : true)).filter((o) => (kv ? o.khuVuc === kv : true)), [persona, orders, loai, kv]);
  const sr = useMemo(() => scopeReturns(persona, returns), [persona, returns]);

  const pivot: PivotRow[] = useMemo(() => {
    const m = new Map<string, PivotRow>();
    const get = (email: string, ten: string) => {
      if (!m.has(email)) m.set(email, { id: email, ten, slDon: 0, slMua: 0, slCongNo: 0, slTraHang: 0, slTuChoi: 0, slDangCho: 0, slDaDuyet: 0, tongTien: 0, tienChoDuyet: 0 });
      return m.get(email)!;
    };
    so.forEach((o) => {
      const r = get(o.nguoiNhanHang, o.nguoiNhanHangTen);
      r.slDon++;
      if (o.loai === "mua") r.slMua++;
      if (o.loai === "cong_no") r.slCongNo++;
      if (o.trangThai === "Từ chối") r.slTuChoi++;
      if (/^Chờ/.test(o.trangThai)) { r.slDangCho++; r.tienChoDuyet += o.giaDeXuat ?? 0; }
      if (o.trangThai === "TN đã duyệt") { r.slDaDuyet++; r.tongTien += o.giaChot ?? 0; }
    });
    sr.forEach((x) => get(x.nguoiNhanHang, x.nguoiNhanHangTen).slTraHang++);
    return [...m.values()].sort((a, b) => b.slDon - a.slDon);
  }, [so, sr]);

  const total = pivot.reduce(
    (a, r) => ({
      slDon: a.slDon + r.slDon,
      slMua: a.slMua + r.slMua,
      slCongNo: a.slCongNo + r.slCongNo,
      slTraHang: a.slTraHang + r.slTraHang,
      slTuChoi: a.slTuChoi + r.slTuChoi,
      slDangCho: a.slDangCho + r.slDangCho,
      slDaDuyet: a.slDaDuyet + r.slDaDuyet,
      tongTien: a.tongTien + r.tongTien,
      tienChoDuyet: a.tienChoDuyet + r.tienChoDuyet,
    }),
    { slDon: 0, slMua: 0, slCongNo: 0, slTraHang: 0, slTuChoi: 0, slDangCho: 0, slDaDuyet: 0, tongTien: 0, tienChoDuyet: 0 },
  );

  const cols: Column<PivotRow>[] = [
    { key: "ten", header: "KTV", cell: (r) => <span className="text-[12.5px] font-semibold">{r.ten}</span> },
    { key: "slDon", header: "SL đơn", align: "right", cell: (r) => <span className="tabular">{r.slDon}</span> },
    { key: "slMua", header: "Mua", align: "right", cell: (r) => <span className="tabular">{r.slMua}</span> },
    { key: "slCongNo", header: "Công nợ", align: "right", cell: (r) => <span className="tabular">{r.slCongNo}</span> },
    { key: "slTraHang", header: "Trả hàng", align: "right", cell: (r) => <span className="tabular">{r.slTraHang}</span> },
    { key: "slDangCho", header: "Đang chờ", align: "right", cell: (r) => <span className="tabular">{r.slDangCho}</span> },
    { key: "slDaDuyet", header: "Đã duyệt", align: "right", cell: (r) => <span className="tabular">{r.slDaDuyet}</span> },
    { key: "slTuChoi", header: "Từ chối", align: "right", cell: (r) => <span className="tabular">{r.slTuChoi}</span> },
    { key: "tienChoDuyet", header: "Tiền chờ duyệt", align: "right", cell: (r) => <span className="font-mono text-[12px]">{fmtVND(r.tienChoDuyet)}</span> },
    { key: "tongTien", header: "Tổng tiền thực tế", align: "right", cell: (r) => <span className="font-mono text-[12px] text-[var(--color-success)]">{fmtVND(r.tongTien)}</span> },
  ];

  return (
    <div className="anim-in">
      <PageHeader title="Báo cáo" />

      {isQc ? (
        <Card className="p-3.5">
          <SectionTitle>Việc QC cần xác nhận</SectionTitle>
          <ul className="divide-y divide-[var(--color-border)]">
            {sr.filter((r) => r.buoc === "Chờ QC xác nhận" && r.trangThaiTraHang === "Đang xử lý").map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2.5 text-[12.5px]">
                <span className="font-mono font-semibold">{r.id}</span>
                <span className="truncate text-[var(--color-text-secondary)]">{r.maLk} — {r.tenLk}</span>
                <Btn size="xs" variant="success" className="ml-auto">QC xác nhận</Btn>
              </li>
            ))}
            {sr.filter((r) => r.buoc === "Chờ QC xác nhận" && r.trangThaiTraHang === "Đang xử lý").length === 0 && (
              <li className="py-2.5 text-[12px] text-[var(--color-text-secondary)]">Không có việc chờ xác nhận.</li>
            )}
          </ul>
        </Card>
      ) : isManager ? (
        <>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Khoảng ngày
              <Select value={range} onChange={setRange} className="mt-1 w-40" options={[{ value: "7", label: "7 ngày qua" }, { value: "30", label: "30 ngày qua" }, { value: "90", label: "Quý này" }]} />
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Khu vực
              <Select value={kv} onChange={setKv} className="mt-1 w-40" options={[{ value: "", label: "— Tất cả —" }, ...KHU_VUC.map((k) => ({ value: k.ma, label: k.ten }))]} />
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Loại đơn
              <Select value={loai} onChange={setLoai} className="mt-1 w-40" options={[{ value: "", label: "— Tất cả —" }, { value: "mua", label: "Mua hàng" }, { value: "cong_no", label: "Công nợ" }]} />
            </label>
            <Btn variant="ghost" size="sm" className="mb-[1px]" onClick={() => { setRange("30"); setKv(""); setLoai(""); }}>Xoá lọc</Btn>
          </div>

          <div className="mb-3 flex flex-wrap gap-3">
            <StatCard label="Tổng đơn" value={total.slDon} tone="info" icon={<Icon.cart size={18} />} />
            <StatCard label="Đã duyệt" value={total.slDaDuyet} tone="success" icon={<Icon.check size={18} />} />
            <StatCard label="Đang chờ" value={total.slDangCho} tone="warning" icon={<Icon.clock size={18} />} />
            <StatCard label="Tổng tiền thực tế" value={fmtVND(total.tongTien)} tone="success" icon={<Icon.chart size={18} />} />
          </div>

          <DataTable columns={cols} rows={pivot} minWidth={1000} emptyText="Không có dữ liệu trong phạm vi." />
          {pivot.length > 0 && (
            <div className="mt-1 flex justify-end gap-4 rounded-b-[var(--radius-card)] border border-t-0 border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-[12px] font-semibold">
              <span>Tổng: {total.slDon} đơn</span>
              <span className="font-mono text-[var(--color-success)]">{fmtVND(total.tongTien)}</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap gap-3">
          <StatCard label="Đơn của tôi" value={so.filter((o) => o.nguoiTao === persona.email).length} tone="info" icon={<Icon.cart size={18} />} />
          <StatCard label="Đã duyệt" value={so.filter((o) => o.nguoiTao === persona.email && o.trangThai === "TN đã duyệt").length} tone="success" icon={<Icon.check size={18} />} />
          <StatCard label="Bị từ chối" value={so.filter((o) => o.nguoiTao === persona.email && o.trangThai === "Từ chối").length} tone="danger" icon={<Icon.x size={18} />} />
          <StatCard label="Tổng tiền" value={fmtVND(so.filter((o) => o.nguoiTao === persona.email).reduce((a, o) => a + (o.giaChot ?? 0), 0))} tone="success" icon={<Icon.chart size={18} />} />
        </div>
      )}
      {mobile && <div className="h-4" />}
    </div>
  );
}
