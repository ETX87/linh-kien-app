import { useMemo, useState } from "react";
import type { Pxk } from "../types";
import { PageHeader } from "../components/layout/PageHeader";
import { WorkflowStepper } from "../components/ui/WorkflowStepper";
import { Tabs } from "../components/ui/Tabs";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Btn } from "../components/ui/Btn";
import { Icon } from "../components/ui/Icon";
import { Drawer } from "../components/ui/Drawer";
import { KvRow, SectionTitle } from "../components/ui/Card";
import { Timeline } from "../components/ui/Timeline";
import { fmtVND, fmtDateTime } from "../lib/format";
import { usePersona } from "../hooks/usePersona";
import { useToast } from "../components/ui/Toast";
import { PXK } from "../mock/extra";

const STEPS = ["Đang tạo phiếu", "Chờ kế toán", "Đang gửi KTV", "Kho đã kết thúc"];
const TIEN_TONE: Record<string, "neutral" | "warning" | "info" | "success"> = {
  "Chưa": "neutral",
  "Chờ KTV chuyển": "warning",
  "KTV đã chuyển": "info",
  "TN đã duyệt": "success",
};

export function PxkPage({ mobile, externalOpenId }: { mobile?: boolean; externalOpenId?: string | null }) {
  const { persona } = usePersona();
  const toast = useToast();
  const [xemLoai, setXemLoai] = useState<"mua_cong_no" | "tra_hang">("mua_cong_no");
  const [stepFilter, setStepFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    let r = PXK.filter((p) => (xemLoai === "tra_hang" ? p.loai === "tra_hang" : p.loai !== "tra_hang"));
    if (stepFilter) r = r.filter((p) => p.buoc === stepFilter);
    return r.sort((a, b) => b.ngayTao.localeCompare(a.ngayTao));
  }, [xemLoai, stepFilter]);

  const activeId = externalOpenId ?? openId;
  const active = PXK.find((p) => p.id === activeId) ?? null;
  const navIdx = rows.findIndex((p) => p.id === activeId);

  const cols: Column<Pxk>[] = [
    {
      key: "id",
      header: "Mã PXK",
      cell: (p) => (
        <span className="inline-flex items-center gap-1 font-mono text-[12.5px] font-semibold">
          {p.id}
          {p.coDonUuTien && <Icon.star size={12} className="text-[var(--color-star)]" />}
        </span>
      ),
    },
    { key: "loai", header: "Loại", cell: (p) => <Badge tone={p.loai === "tra_hang" ? "warning" : p.loai === "cong_no" ? "purple" : "info"}>{p.loai === "tra_hang" ? "Trả hàng" : p.loai === "cong_no" ? "Công nợ" : "Mua"}</Badge> },
    {
      key: "nhan",
      header: "Người nhận hàng",
      cell: (p) => (
        <span className="text-[12.5px]">
          {p.nguoiNhanHangTen}
          <span className="block text-[11px] text-[var(--color-text-secondary)]">GS: {p.gsTen}</span>
        </span>
      ),
    },
    { key: "sd", header: "Số dòng", align: "right", cell: (p) => <span className="tabular">{p.soDong}</span> },
    { key: "xk", header: "Mã xuất kho", cell: (p) => <span className="font-mono text-[12px]">{p.maXuatKho ?? "—"}</span> },
    { key: "misa", header: "Mã MISA", cell: (p) => <span className="font-mono text-[12px]">{p.maMisa ?? "—"}</span> },
    { key: "tien", header: "Tiền cần chuyển", align: "right", cell: (p) => <span className="font-mono text-[12px]">{p.soTienCanChuyen == null ? "—" : fmtVND(p.soTienCanChuyen)}</span> },
    {
      key: "ttt",
      header: "TT chuyển tiền",
      cell: (p) => (p.ttChuyenTien ? <Badge tone={TIEN_TONE[p.ttChuyenTien]} variant="soft">{p.ttChuyenTien}</Badge> : <span className="text-[var(--color-text-faint)]">—</span>),
    },
    { key: "tt", header: "Trạng thái", cell: (p) => <StatusBadge status={p.buoc} /> },
    { key: "ngay", header: "Ngày tạo", cell: (p) => <span className="tabular text-[12px] text-[var(--color-text-secondary)]">{fmtDateTime(p.ngayTao)}</span> },
    {
      key: "act",
      header: "Hành động",
      cell: (p) => (
        <Btn variant="ghost" size="xs" onClick={() => setOpenId(p.id)}>
          Xem
        </Btn>
      ),
    },
  ];

  const stepCount = (s: string) => PXK.filter((p) => (xemLoai === "tra_hang" ? p.loai === "tra_hang" : p.loai !== "tra_hang") && p.buoc === s).length;

  return (
    <div className="anim-in">
      <PageHeader title="Phiếu xuất kho" />
      <Tabs
        value={xemLoai}
        onChange={(v) => { setXemLoai(v as typeof xemLoai); setStepFilter(null); }}
        tabs={[
          { key: "mua_cong_no", label: "Mua / Công nợ", count: PXK.filter((p) => p.loai !== "tra_hang").length },
          { key: "tra_hang", label: "Trả hàng", count: PXK.filter((p) => p.loai === "tra_hang").length },
        ]}
      />

      <div className="my-4">
        <WorkflowStepper
          steps={STEPS.map((s) => ({ key: s, label: s, count: stepCount(s) }))}
          activeKey={stepFilter ?? undefined}
          onStepClick={(k) => setStepFilter((v) => (v === k ? null : k))}
        />
      </div>

      <DataTable columns={cols} rows={rows} onRowClick={(p) => setOpenId(p.id)} rowAccent={(p) => p.coDonUuTien} minWidth={1120} emptyText="Không có phiếu xuất kho phù hợp." />
      <div className="py-2 text-[12px] text-[var(--color-text-secondary)]">Hiển thị {rows.length} phiếu</div>

      <Drawer
        open={!!active}
        onClose={() => setOpenId(null)}
        mobile={mobile}
        nav={{
          hasPrev: navIdx > 0,
          hasNext: navIdx > -1 && navIdx < rows.length - 1,
          onPrev: () => setOpenId(rows[navIdx - 1]?.id ?? null),
          onNext: () => setOpenId(rows[navIdx + 1]?.id ?? null),
        }}
        title={
          active && (
            <>
              <span className="font-mono text-[15px] font-bold">{active.id}</span>
              {active.coDonUuTien && <Icon.star size={15} className="text-[var(--color-star)]" />}
              <StatusBadge status={active.buoc} />
            </>
          )
        }
        footer={
          active && (
            <div className="flex flex-wrap items-center gap-2">
              {active.buoc === "Đang tạo phiếu" && (persona.tn || persona.coreRole === "ADMIN") && (
                <>
                  <Btn size="sm" onClick={() => toast("Gán mã xuất kho (mô phỏng)", "info")}>Gán mã xuất kho</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => toast("Chuyển 'Chờ kế toán' (mô phỏng)", "info")}>Chuyển kế toán</Btn>
                </>
              )}
              {active.buoc === "Chờ kế toán" && (persona.keToan || persona.coreRole === "ADMIN") && (
                <>
                  <Btn size="sm" onClick={() => toast("Gán mã MISA (mô phỏng)", "info")}>Gán mã MISA</Btn>
                  <Btn size="sm" variant="success" onClick={() => toast("Đã chốt xong đơn xuất", "success")}>Chốt đơn xuất</Btn>
                </>
              )}
              {active.buoc === "Đang gửi KTV" && (persona.kho || persona.coreRole === "ADMIN") && (
                <Btn size="sm" variant="success" onClick={() => toast("Kho kết thúc phiếu", "success")}>Kho kết thúc</Btn>
              )}
              <Btn size="sm" variant="ghost" onClick={() => toast("Tải mẫu MISA (mô phỏng)", "info")}>
                <Icon.download size={14} /> Xuất MISA
              </Btn>
            </div>
          )
        }
      >
        {active && (
          <div className="space-y-4 pt-1">
            <div>
              <SectionTitle>Các đơn trong phiếu ({active.dong.length})</SectionTitle>
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-[var(--color-surface-soft)] text-left text-[var(--color-text-secondary)]">
                      <th className="px-2.5 py-1.5">Mã LK</th>
                      <th className="px-2.5 py-1.5">Tên</th>
                      <th className="px-2.5 py-1.5 text-right">SL</th>
                      <th className="px-2.5 py-1.5 text-right">Giá chốt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.dong.map((d) => (
                      <tr key={d.id} className="border-t border-[var(--color-border)]">
                        <td className="px-2.5 py-1.5 font-mono">{d.maLk}</td>
                        <td className="px-2.5 py-1.5">{d.tenLk}</td>
                        <td className="px-2.5 py-1.5 text-right tabular">{d.slDeXuat}/{d.slThucXuat}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono">{fmtVND(d.giaChot)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionTitle>Mã & vận đơn</SectionTitle>
              <KvRow label="Mã xuất kho">{active.maXuatKho ?? "— (chờ TN gán)"}</KvRow>
              <KvRow label="Mã MISA">{active.maMisa ?? "— (chờ kế toán gán)"}</KvRow>
              <KvRow label="Mã vận đơn">{active.maVanDon ?? "—"}</KvRow>
            </div>

            {active.loai !== "tra_hang" && (
              <div>
                <SectionTitle>Chuyển tiền</SectionTitle>
                <KvRow label="Số tiền cần chuyển">{active.soTienCanChuyen == null ? "—" : fmtVND(active.soTienCanChuyen)}</KvRow>
                <KvRow label="Trạng thái">{active.ttChuyenTien ?? "—"}</KvRow>
                <KvRow label="Ảnh biên bản nhận hàng">
                  {active.anhBienBan ? <span className="text-[var(--color-success)]">✓ Đã có</span> : <span className="text-[var(--color-text-faint)]">Chưa upload</span>}
                </KvRow>
              </div>
            )}

            <div>
              <SectionTitle>Lịch sử xử lý</SectionTitle>
              <Timeline logs={active.logs} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
