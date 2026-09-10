import { useMemo, useState } from "react";
import type { TonKhoRow } from "../types";
import { PageHeader } from "../components/layout/PageHeader";
import { SearchBar } from "../components/ui/SearchBar";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Btn } from "../components/ui/Btn";
import { Icon } from "../components/ui/Icon";
import { Drawer } from "../components/ui/Drawer";
import { SectionTitle } from "../components/ui/Card";
import { fmtVND, fmtDateTime } from "../lib/format";
import { usePersona } from "../hooks/usePersona";
import { useToast } from "../components/ui/Toast";
import { TON_KHO } from "../mock/extra";

const DG_TONE: Record<TonKhoRow["danhGiaCongNo"], "danger" | "warning" | "success"> = {
  "Vượt trần": "danger",
  "Cảnh báo": "warning",
  "Bình thường": "success",
};

export function TonKhoPage({ mobile }: { mobile?: boolean }) {
  const { persona } = usePersona();
  const toast = useToast();
  const isAdmin = persona.coreRole === "ADMIN";
  const [q, setQ] = useState("");
  const [openMa, setOpenMa] = useState<string | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TON_KHO.filter((r) => !s || r.maKho.toLowerCase().includes(s) || r.tenKtv.toLowerCase().includes(s));
  }, [q]);
  const active = TON_KHO.find((r) => r.maKho === openMa) ?? null;

  const cols: Column<TonKhoRow & { id: string }>[] = [
    { key: "maKho", header: "Mã kho", cell: (r) => <span className="font-mono text-[12.5px] font-semibold">{r.maKho}</span> },
    { key: "tenKtv", header: "Tên KTV", cell: (r) => <span className="text-[12.5px]">{r.tenKtv}</span> },
    { key: "smh", header: "Số mặt hàng", align: "right", cell: (r) => <span className="tabular">{r.soMatHang}</span> },
    { key: "tck", header: "Tổng SL cuối kỳ", align: "right", cell: (r) => <span className="tabular">{r.tongCuoiKy}</span> },
    { key: "cn", header: "Công nợ", align: "right", cell: (r) => <span className="font-mono text-[12px]">{fmtVND(r.congNo)}</span> },
    { key: "dg", header: "Đánh giá công nợ", cell: (r) => <Badge tone={DG_TONE[r.danhGiaCongNo]} variant="soft">{r.danhGiaCongNo}</Badge> },
    { key: "cnl", header: "Cập nhật lúc", cell: (r) => <span className="tabular text-[12px] text-[var(--color-text-secondary)]">{fmtDateTime(r.capNhatLuc)}</span> },
    { key: "act", header: "", cell: (r) => <Btn variant="ghost" size="xs" onClick={() => setOpenMa(r.maKho)}>Xem chi tiết</Btn> },
  ];

  return (
    <div className="anim-in">
      <PageHeader
        title="Tồn kho công nợ KTV"
        actions={isAdmin && <Btn size="md" onClick={() => toast("Import tồn kho MISA (mô phỏng)", "info")}><Icon.upload size={15} /> Import tồn kho MISA</Btn>}
      />
      <div className="mb-3"><SearchBar value={q} onChange={setQ} placeholder="Tìm theo mã kho / tên KTV…" className="w-[320px]" /></div>
      <DataTable columns={cols} rows={rows.map((r) => ({ ...r, id: r.maKho }))} onRowClick={(r) => setOpenMa(r.maKho)} minWidth={920} emptyText="Không có dữ liệu tồn kho." />
      <div className="py-2 text-[12px] text-[var(--color-text-secondary)]">Hiển thị {rows.length} kho</div>

      <Drawer
        open={!!active}
        onClose={() => setOpenMa(null)}
        mobile={mobile}
        title={active && (<><span className="font-mono text-[15px] font-bold">{active.maKho}</span><span className="text-[13px] text-[var(--color-text-secondary)]">· {active.tenKtv}</span></>)}
      >
        {active && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              <Badge tone={DG_TONE[active.danhGiaCongNo]} variant="soft">{active.danhGiaCongNo}</Badge>
              <span className="text-[12px] text-[var(--color-text-secondary)]">Công nợ: <span className="font-mono">{fmtVND(active.congNo)}</span></span>
            </div>
            <SectionTitle>Chi tiết theo mặt hàng</SectionTitle>
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[var(--color-surface-soft)] text-left text-[var(--color-text-secondary)]">
                    <th className="px-2.5 py-1.5">Mã hàng</th><th className="px-2.5 py-1.5">Tên hàng</th><th className="px-2.5 py-1.5">ĐVT</th>
                    <th className="px-2.5 py-1.5 text-right">Đầu kỳ</th><th className="px-2.5 py-1.5 text-right">Nhập</th><th className="px-2.5 py-1.5 text-right">Xuất</th><th className="px-2.5 py-1.5 text-right">Cuối kỳ</th>
                  </tr>
                </thead>
                <tbody>
                  {active.chiTiet.map((c) => (
                    <tr key={c.maHang} className="border-t border-[var(--color-border)]">
                      <td className="px-2.5 py-1.5 font-mono">{c.maHang}</td>
                      <td className="px-2.5 py-1.5">{c.tenHang}</td>
                      <td className="px-2.5 py-1.5">{c.dvt}</td>
                      <td className="px-2.5 py-1.5 text-right tabular">{c.dauKy}</td>
                      <td className="px-2.5 py-1.5 text-right tabular">{c.nhap}</td>
                      <td className="px-2.5 py-1.5 text-right tabular">{c.xuat}</td>
                      <td className="px-2.5 py-1.5 text-right tabular font-semibold">{c.cuoiKy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
