import { useMemo, useState } from "react";
import type { Part } from "../types";
import { PageHeader } from "../components/layout/PageHeader";
import { Tabs } from "../components/ui/Tabs";
import { SearchBar } from "../components/ui/SearchBar";
import { Select, FormField, TextInput, TextArea, Checkbox } from "../components/ui/Form";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Btn } from "../components/ui/Btn";
import { Icon } from "../components/ui/Icon";
import { Drawer } from "../components/ui/Drawer";
import { Modal } from "../components/ui/Modal";
import { KvRow, SectionTitle } from "../components/ui/Card";
import { ImportExcelDialog } from "../components/ui/ImportExcelDialog";
import { EmptyState } from "../components/ui/Misc";
import { fmtVND } from "../lib/format";
import { usePersona } from "../hooks/usePersona";
import { canManageParts } from "../lib/permissions";
import { useToast } from "../components/ui/Toast";
import { PARTS } from "../mock/catalog";

export function DanhMucPage({ mobile }: { mobile?: boolean }) {
  const { persona } = usePersona();
  const toast = useToast();
  const canEdit = canManageParts(persona);
  const [tab, setTab] = useState("danh-muc");
  const [q, setQ] = useState("");
  const [fDacThu, setFDacThu] = useState("");
  const [fHien, setFHien] = useState("");
  const [openMa, setOpenMa] = useState<string | null>(null);
  const [form, setForm] = useState<Part | null>(null);
  const [imp, setImp] = useState(false);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return PARTS.filter((p) => {
      if (s && !(p.ma.toLowerCase().includes(s) || p.ten.toLowerCase().includes(s))) return false;
      if (fDacThu === "co" && !p.dacThu) return false;
      if (fDacThu === "khong" && p.dacThu) return false;
      if (fHien === "hien" && !p.batTat) return false;
      if (fHien === "an" && p.batTat) return false;
      return true;
    });
  }, [q, fDacThu, fHien]);

  const active = PARTS.find((p) => p.ma === openMa) ?? null;

  const cols: Column<Part & { id: string }>[] = [
    { key: "ma", header: "Mã LK", cell: (p) => <span className="font-mono text-[12.5px] font-semibold">{p.ma}</span> },
    { key: "ten", header: "Tên linh kiện", cell: (p) => <span className="text-[12.5px]">{p.ten}</span> },
    { key: "hang", header: "Hãng", cell: (p) => <span className="text-[12.5px] text-[var(--color-text-secondary)]">{p.hang}</span> },
    { key: "gia", header: "Giá bán", align: "right", cell: (p) => <span className="font-mono text-[12.5px] text-[var(--color-success)]">{fmtVND(p.giaBan)}</span> },
    { key: "gtc", header: "Giá tham chiếu", align: "right", cell: (p) => <span className="font-mono text-[12px]">{fmtVND(p.giaThamChieu ?? null)}</span> },
    { key: "dv", header: "Phân loại", cell: (p) => <span className="text-[12px] text-[var(--color-text-secondary)]">{p.donVi ?? "—"}</span> },
    { key: "dt", header: "Đặc thù", cell: (p) => (p.dacThu ? <span className="text-[11px] font-semibold text-[#b9770e]">Đặc thù</span> : <span className="text-[11px] text-[var(--color-text-faint)]">—</span>) },
    { key: "osc", header: "Only sửa chữa", cell: (p) => (p.chiSuaChua ? <span className="text-[11px] font-semibold text-[var(--color-purple)]">Only sửa chữa</span> : <span className="text-[11px] text-[var(--color-text-faint)]">—</span>) },
    { key: "hien", header: "Hiển thị", cell: (p) => (p.batTat ? <Badge tone="success" variant="soft">Đang hiển thị</Badge> : <Badge tone="neutral" variant="soft">Đang ẩn</Badge>) },
  ];

  return (
    <div className="anim-in">
      <PageHeader
        title="Danh mục linh kiện"
        actions={
          <>
            <Btn variant="ghost" size="md" onClick={() => toast("Đã xuất Excel (mô phỏng)", "info")}><Icon.download size={15} /> Xuất Excel</Btn>
            {canEdit && (
              <>
                <Btn variant="ghost" size="md" onClick={() => setImp(true)}><Icon.upload size={15} /> Nhập hàng loạt</Btn>
                <Btn size="md" onClick={() => setForm({ ma: "", ten: "", hang: "", giaBan: null, donVi: "", dacThu: false, chiSuaChua: false, batTat: true, thayThe: [] })}><Icon.plus size={15} /> Thêm linh kiện</Btn>
              </>
            )}
          </>
        }
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "danh-muc", label: "Danh mục" }, { key: "bom", label: "BOM" }, { key: "thay-the", label: "Linh kiện thay thế" }]} />

      {tab === "danh-muc" ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchBar value={q} onChange={setQ} placeholder="Tìm theo mã hoặc tên linh kiện…" className="min-w-[240px] flex-1" />
            <Select value={fDacThu} onChange={setFDacThu} className="w-36" options={[{ value: "", label: "Đặc thù: Tất cả" }, { value: "co", label: "Đặc thù" }, { value: "khong", label: "Không đặc thù" }]} />
            <Select value={fHien} onChange={setFHien} className="w-36" options={[{ value: "", label: "Hiển thị: Tất cả" }, { value: "hien", label: "Đang hiển thị" }, { value: "an", label: "Đang ẩn" }]} />
          </div>
          <DataTable columns={cols} rows={rows.map((p) => ({ ...p, id: p.ma }))} onRowClick={(p) => setOpenMa(p.ma)} minWidth={980} emptyText="Không có linh kiện phù hợp." />
          <div className="text-[12px] text-[var(--color-text-secondary)]">Hiển thị {rows.length} / {PARTS.length} linh kiện</div>
        </div>
      ) : (
        <div className="mt-3">
          <EmptyState title={tab === "bom" ? "BOM" : "Linh kiện thay thế"} hint="Sẽ dựng chi tiết ở đợt sau — dùng chung design system." />
        </div>
      )}

      <Drawer
        open={!!active}
        onClose={() => setOpenMa(null)}
        mobile={mobile}
        title={active && (<><span className="font-mono text-[15px] font-bold">{active.ma}</span>{active.dacThu && <Badge tone="warning">Đặc thù</Badge>}{active.chiSuaChua && <Badge tone="purple">Only sửa chữa</Badge>}</>)}
        footer={active && canEdit && <Btn size="sm" onClick={() => { setForm(active); setOpenMa(null); }}>Sửa thông tin</Btn>}
      >
        {active && (
          <div className="space-y-4 pt-1">
            <div className="grid h-40 place-items-center rounded-lg border border-dashed border-[var(--color-border-strong)] text-[var(--color-text-faint)]"><Icon.package size={28} /></div>
            <div>
              <SectionTitle>Thông tin</SectionTitle>
              <KvRow label="Tên">{active.ten}</KvRow>
              <KvRow label="Hãng">{active.hang}</KvRow>
              <KvRow label="Giá bán"><span className="font-mono text-[var(--color-success)]">{fmtVND(active.giaBan)}</span></KvRow>
              <KvRow label="Giá tham chiếu"><span className="font-mono">{fmtVND(active.giaThamChieu ?? null)}</span></KvRow>
              <KvRow label="Phân loại">{active.donVi ?? "—"}</KvRow>
              {active.dacThu && <KvRow label="Phân loại đặc thù">{active.phanLoaiDacThu ?? "—"}</KvRow>}
              <KvRow label="Linh kiện thay thế">{active.thayThe.length ? active.thayThe.join(", ") : "—"}</KvRow>
            </div>
            <div>
              <SectionTitle>Ghi chú</SectionTitle>
              <p className="text-[12.5px] text-[var(--color-text-secondary)]">{active.ghiChu?.trim() || "Không có ghi chú."}</p>
            </div>
          </div>
        )}
      </Drawer>

      {form && (
        <Modal
          open
          onClose={() => setForm(null)}
          mobile={mobile}
          title={form.ma ? `Sửa ${form.ma}` : "Thêm linh kiện"}
          width="560px"
          footer={
            <>
              <Btn variant="ghost" size="sm" onClick={() => setForm(null)}>Huỷ</Btn>
              <Btn size="sm" onClick={() => { toast(form.ma ? "Đã lưu thay đổi" : "Đã thêm linh kiện"); setForm(null); }}>Lưu</Btn>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Mã linh kiện" required><TextInput value={form.ma} onChange={(e) => setForm({ ...form, ma: e.target.value })} placeholder="LK…" /></FormField>
            <FormField label="Hãng"><TextInput value={form.hang} onChange={(e) => setForm({ ...form, hang: e.target.value })} /></FormField>
            <FormField label="Tên linh kiện" required><TextInput value={form.ten} onChange={(e) => setForm({ ...form, ten: e.target.value })} /></FormField>
            <FormField label="Phân loại"><TextInput value={form.donVi ?? ""} onChange={(e) => setForm({ ...form, donVi: e.target.value })} placeholder="Cái / Sợi / Bộ…" /></FormField>
            <FormField label="Giá bán"><TextInput type="number" value={form.giaBan ?? 0} onChange={(e) => setForm({ ...form, giaBan: +e.target.value })} /></FormField>
            <FormField label="Giá tham chiếu"><TextInput type="number" value={form.giaThamChieu ?? 0} onChange={(e) => setForm({ ...form, giaThamChieu: +e.target.value })} /></FormField>
          </div>
          <div className="mt-3">
            <FormField label="Ghi chú"><TextArea value={form.ghiChu ?? ""} onChange={(e) => setForm({ ...form, ghiChu: e.target.value })} /></FormField>
          </div>
          <div className="mt-3 space-y-2">
            <Checkbox checked={form.dacThu} onChange={(v) => setForm({ ...form, dacThu: v })} label="Linh kiện đặc thù (cần TP DVBH xác nhận)" />
            {form.dacThu && <FormField label="Phân loại đặc thù"><TextInput value={form.phanLoaiDacThu ?? ""} onChange={(e) => setForm({ ...form, phanLoaiDacThu: e.target.value })} /></FormField>}
            <Checkbox checked={form.chiSuaChua} onChange={(v) => setForm({ ...form, chiSuaChua: v })} label="Only sửa chữa (loại khỏi picker khi tạo đơn)" />
            <Checkbox checked={form.batTat} onChange={(v) => setForm({ ...form, batTat: v })} label="Đang hiển thị" />
          </div>
        </Modal>
      )}

      <ImportExcelDialog open={imp} onClose={() => setImp(false)} mobile={mobile} />
    </div>
  );
}
