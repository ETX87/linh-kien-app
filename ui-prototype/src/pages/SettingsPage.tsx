import { useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Tabs } from "../components/ui/Tabs";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Btn } from "../components/ui/Btn";
import { Icon } from "../components/ui/Icon";
import { Card, SectionTitle } from "../components/ui/Card";
import { EmptyState } from "../components/ui/Misc";
import { usePersona } from "../hooks/usePersona";
import { useToast } from "../components/ui/Toast";
import { KHU_VUC, LOAI_DE_XUAT_ROWS } from "../mock/extra";
import { LY_DO_CHAM } from "../mock/catalog";
import type { KhuVucRow, LoaiDeXuatRow } from "../types";

export function SettingsPage() {
  const { persona } = usePersona();
  const toast = useToast();
  const [tab, setTab] = useState("khu-vuc");

  if (persona.coreRole !== "ADMIN") {
    return (
      <div className="anim-in">
        <PageHeader title="Cài đặt" />
        <EmptyState title="Chỉ Admin truy cập được" />
      </div>
    );
  }

  const kvCols: Column<KhuVucRow & { id: string }>[] = [
    { key: "ma", header: "Mã", cell: (r) => <span className="font-mono text-[12.5px] font-semibold">{r.ma}</span> },
    { key: "ten", header: "Tên khu vực", cell: (r) => <span className="text-[12.5px]">{r.ten}</span> },
    { key: "gs", header: "GS phụ trách", cell: (r) => (r.gsTen ? <span className="text-[12.5px]">{r.gsTen}</span> : <span className="text-[12px] text-[var(--color-text-faint)]">— Chưa gán —</span>) },
    { key: "so", header: "Số KTV", align: "right", cell: (r) => <span className="tabular">{r.soKtv}</span> },
    { key: "act", header: "", cell: () => <span className="flex gap-1"><Btn variant="ghost" size="xs" onClick={() => toast("Sửa khu vực (mô phỏng)", "info")}>Sửa</Btn></span> },
  ];
  const ldxCols: Column<LoaiDeXuatRow & { id: string }>[] = [
    { key: "ten", header: "Tên loại đề xuất", cell: (r) => <span className="text-[12.5px] font-medium">{r.ten}</span> },
    { key: "nhom", header: "Nhóm", cell: (r) => <span className="text-[12px] text-[var(--color-text-secondary)]">{r.nhom}</span> },
    { key: "bt", header: "Trạng thái", cell: (r) => <Badge tone={r.batTat ? "success" : "neutral"} variant="soft">{r.batTat ? "Đang bật" : "Đã tắt"}</Badge> },
    { key: "act", header: "", cell: () => <Btn variant="ghost" size="xs" onClick={() => toast("Sửa (mô phỏng)", "info")}>Sửa</Btn> },
  ];
  const ldcCols: Column<{ id: string; ma: string; ten: string; moTicketThieuLk: boolean }>[] = [
    { key: "ten", header: "Tên lý do", cell: (r) => <span className="text-[12.5px] font-medium">{r.ten}</span> },
    { key: "mo", header: "Mở ticket thiếu LK", cell: (r) => <Badge tone={r.moTicketThieuLk ? "info" : "neutral"} variant="soft">{r.moTicketThieuLk ? "Có" : "Không"}</Badge> },
    { key: "bt", header: "Trạng thái", cell: () => <Badge tone="success" variant="soft">Đang bật</Badge> },
    { key: "act", header: "", cell: () => <Btn variant="ghost" size="xs" onClick={() => toast("Sửa (mô phỏng)", "info")}>Sửa</Btn> },
  ];

  return (
    <div className="anim-in">
      <PageHeader title="Cài đặt" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "khu-vuc", label: "Khu vực" },
          { key: "ly-do-cham", label: "Lý do chậm" },
          { key: "loai-de-xuat", label: "Loại đề xuất" },
          { key: "drive", label: "Google Drive" },
        ]}
      />

      <div className="mt-3">
        {tab === "khu-vuc" && (
          <>
            <div className="mb-2 flex justify-end"><Btn size="sm" onClick={() => toast("Thêm khu vực (mô phỏng)", "info")}><Icon.plus size={14} /> Thêm khu vực</Btn></div>
            <DataTable columns={kvCols} rows={KHU_VUC.map((k) => ({ ...k, id: k.ma }))} minWidth={640} />
          </>
        )}
        {tab === "ly-do-cham" && (
          <>
            <div className="mb-2 flex justify-end"><Btn size="sm" onClick={() => toast("Thêm lý do (mô phỏng)", "info")}><Icon.plus size={14} /> Thêm lý do</Btn></div>
            <DataTable columns={ldcCols} rows={LY_DO_CHAM.map((l) => ({ ...l, id: l.ma }))} minWidth={620} />
          </>
        )}
        {tab === "loai-de-xuat" && (
          <>
            <div className="mb-2 flex justify-end"><Btn size="sm" onClick={() => toast("Thêm loại đề xuất (mô phỏng)", "info")}><Icon.plus size={14} /> Thêm loại</Btn></div>
            <DataTable columns={ldxCols} rows={LOAI_DE_XUAT_ROWS.map((l, i) => ({ ...l, id: String(i) }))} minWidth={620} />
          </>
        )}
        {tab === "drive" && (
          <Card className="max-w-xl p-4">
            <SectionTitle>Kết nối Google Drive</SectionTitle>
            <p className="text-[12.5px] text-[var(--color-text-secondary)]">Dùng cho mọi ảnh trong hệ (ảnh linh kiện, ảnh trả hàng, ảnh biên bản PXK).</p>
            <div className="my-3 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-soft)]/50 p-2.5 text-[12.5px]">
              ✓ Đã kết nối · tài khoản <b>dichvu3t.linhkien@gmail.com</b> · thư mục <span className="font-mono">1AbC… (folder_id)</span>
            </div>
            <div className="flex gap-2">
              <Btn variant="ghost" size="sm" onClick={() => toast("Kết nối lại (mô phỏng)", "info")}>Kết nối lại</Btn>
              <Btn variant="danger-line" size="sm" onClick={() => toast("Đã ngắt kết nối (mô phỏng)", "danger")}>Ngắt kết nối</Btn>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
