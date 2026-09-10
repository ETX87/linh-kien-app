import { useMemo, useState } from "react";
import type { Order } from "../../types";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { FilterChips } from "../../components/ui/FilterChips";
import { SearchBar } from "../../components/ui/SearchBar";
import { BulkActionBar } from "../../components/ui/BulkActionBar";
import { Select } from "../../components/ui/Form";
import { Badge, StatusBadge } from "../../components/ui/Badge";
import { Btn } from "../../components/ui/Btn";
import { Icon } from "../../components/ui/Icon";
import { Pagination } from "../../components/ui/Misc";
import { OrderDrawer } from "./OrderDrawer";
import { CreateOrderModal } from "./CreateOrderModal";
import { ImportExcelDialog } from "../../components/ui/ImportExcelDialog";
import { fmtVND, fmtDateTime } from "../../lib/format";
import { usePersona } from "../../hooks/usePersona";
import { useOrders } from "../../hooks/useStore";
import { scopeOrders } from "../../lib/scope";
import { orderRowActions, canCreateOrder } from "../../lib/permissions";
import { store } from "../../services/store";
import { useToast } from "../../components/ui/Toast";

const PAGE = 10;

export function OrdersView({
  loai,
  mobile,
  compact,
  initialFilter = "tat-ca",
  externalOpenId,
  showCreateActions,
}: {
  loai?: "mua" | "cong_no";
  mobile?: boolean;
  compact?: boolean;
  initialFilter?: string;
  externalOpenId?: string | null;
  showCreateActions?: boolean;
}) {
  const { persona } = usePersona();
  const toast = useToast();
  const all = useOrders();
  const [chip, setChip] = useState(initialFilter);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [create, setCreate] = useState(false);
  const [imp, setImp] = useState(false);
  // Lọc thêm - TẤT CẢ dạng dropdown (yêu cầu người dùng 2026-09-10)
  const [adv, setAdv] = useState({ ktv: "", gs: "", ngay: "", maLk: "", loai: "", tt: "" });
  // Bộ lọc phụ khi chip = "Chờ tôi duyệt": Tất cả + theo Loại đề xuất
  const [subLoai, setSubLoai] = useState("");

  const scoped = useMemo(() => {
    let rows = scopeOrders(persona, all).filter((o) => o.loai !== "tra_hang");
    if (loai) rows = rows.filter((o) => o.loai === loai);
    return rows.sort((a, b) => b.ngayTao.localeCompare(a.ngayTao));
  }, [persona, all, loai]);

  const opt = (vals: string[]) => [{ value: "", label: "— Tất cả —" }, ...[...new Set(vals)].filter(Boolean).sort().map((v) => ({ value: v, label: v }))];
  const advOptions = useMemo(
    () => ({
      ktv: opt(scoped.map((o) => o.nguoiNhanHangTen)),
      gs: opt(scoped.map((o) => o.gsTen ?? "")),
      ngay: [
        { value: "", label: "— Tất cả —" },
        { value: "7", label: "7 ngày qua" },
        { value: "30", label: "30 ngày qua" },
        { value: "90", label: "90 ngày qua" },
      ],
      maLk: opt(scoped.map((o) => o.maLk)),
      loai: opt(scoped.map((o) => o.loaiDeXuat)),
      tt: opt(scoped.map((o) => o.trangThai)),
    }),
    [scoped],
  );

  const counts = useMemo(() => {
    const mine = scoped.filter((o) => orderRowActions(persona, o).length > 0);
    return {
      "tat-ca": scoped.length,
      "cho-toi-duyet": mine.length,
      "uu-tien": scoped.filter((o) => o.uuTien).length,
      "qua-han": scoped.filter((o) => o.quaHan).length,
    } as Record<string, number>;
  }, [scoped, persona]);

  // Danh sách "Loại đề xuất" xuất hiện trong tập "Chờ tôi duyệt" (cho bộ lọc phụ ở mục #4)
  const subLoaiList = useMemo(
    () => [...new Set(scoped.filter((o) => orderRowActions(persona, o).length > 0).map((o) => o.loaiDeXuat))].filter(Boolean).sort(),
    [scoped, persona],
  );

  const filtered = useMemo(() => {
    let rows = scoped;
    if (chip === "cho-toi-duyet") {
      rows = rows.filter((o) => orderRowActions(persona, o).length > 0);
      if (subLoai) rows = rows.filter((o) => o.loaiDeXuat === subLoai);
    }
    if (chip === "uu-tien") rows = rows.filter((o) => o.uuTien);
    if (chip === "qua-han") rows = rows.filter((o) => o.quaHan);
    // Lọc thêm (dropdown)
    if (adv.ktv) rows = rows.filter((o) => o.nguoiNhanHangTen === adv.ktv);
    if (adv.gs) rows = rows.filter((o) => o.gsTen === adv.gs);
    if (adv.maLk) rows = rows.filter((o) => o.maLk === adv.maLk);
    if (adv.loai) rows = rows.filter((o) => o.loaiDeXuat === adv.loai);
    if (adv.tt) rows = rows.filter((o) => o.trangThai === adv.tt);
    if (adv.ngay) {
      const days = +adv.ngay;
      const cutoff = Date.now() - days * 864e5;
      rows = rows.filter((o) => new Date(o.ngayTao).getTime() >= cutoff);
    }
    const s = q.trim().toLowerCase();
    if (s) rows = rows.filter((o) => o.id.toLowerCase().includes(s) || o.maLk.toLowerCase().includes(s) || o.nguoiNhanHangTen.toLowerCase().includes(s));
    return rows;
  }, [scoped, chip, q, persona, adv, subLoai]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const curPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((curPage - 1) * PAGE, curPage * PAGE);

  const activeId = externalOpenId ?? openId;
  const activeOrder = (all.find((o) => o.id === activeId) as Order) ?? null;
  const navIdx = filtered.findIndex((o) => o.id === activeId);

  const cols: Column<Order>[] = [
    {
      key: "id",
      header: "Mã đơn",
      cell: (o) => (
        <span className="inline-flex items-center gap-1 font-mono text-[12.5px] font-semibold text-[var(--color-text)]">
          {o.id}
          {o.uuTien && <Icon.star size={12} className="text-[var(--color-star)]" />}
        </span>
      ),
    },
    { key: "loai", header: "Loại", cell: (o) => <Badge tone={o.loai === "cong_no" ? "purple" : "info"}>{o.loai === "cong_no" ? "Công nợ" : "Mua"}</Badge> },
    {
      key: "lk",
      header: "Linh kiện",
      cell: (o) => (
        <span className="text-[12.5px]">
          <span className="font-mono text-[var(--color-text-secondary)]">{o.maLk}</span> — {o.tenLk}
        </span>
      ),
    },
    { key: "sl", header: "SL", align: "right", cell: (o) => <span className="tabular">{o.slDeXuat}</span> },
    { key: "gia", header: "Giá đề xuất", align: "right", cell: (o) => <span className="font-mono text-[12.5px]">{fmtVND(o.giaDeXuat)}</span> },
    ...(loai === "cong_no"
      ? [
          {
            key: "congno",
            header: "Công nợ",
            align: "right" as const,
            cell: (o: Order) => (
              <span className="flex items-center justify-end gap-1.5">
                <span className="font-mono text-[12px]">{fmtVND(o.soTienCongNo)}</span>
                {o.danhGiaCongNo && <Badge tone={o.danhGiaCongNo === "Đủ" ? "success" : "danger"}>{o.danhGiaCongNo}</Badge>}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "nhan",
      header: "Người nhận",
      cell: (o) => (
        <span className="text-[12.5px]">
          {o.nguoiNhanHangTen}
          <span className="block text-[11px] text-[var(--color-text-secondary)]">GS: {o.gsTen}</span>
        </span>
      ),
    },
    ...(compact
      ? []
      : [
          {
            key: "tao",
            header: "Người tạo",
            cell: (o: Order) => (
              <span className="text-[12.5px]">
                {o.nguoiTaoTen}
                {o.taoHo && <span className="block text-[11px] text-[var(--color-text-secondary)]">(tạo hộ)</span>}
              </span>
            ),
          },
          { key: "ngay", header: "Ngày tạo", cell: (o: Order) => <span className="tabular text-[12px] text-[var(--color-text-secondary)]">{fmtDateTime(o.ngayTao)}</span> },
        ]),
    { key: "tt", header: "Trạng thái", cell: (o) => <StatusBadge status={o.quaHan ? "Quá hạn" : o.trangThai} /> },
    {
      key: "act",
      header: "Hành động",
      cell: (o) => {
        const acts = orderRowActions(persona, o);
        if (!acts.length)
          return (
            <Btn variant="ghost" size="xs" onClick={() => setOpenId(o.id)}>
              Xem
            </Btn>
          );
        return (
          <span className="flex gap-1">
            <Btn variant="success" size="xs" onClick={() => { store.approveOrder(o.id, persona.ten); toast("Đã duyệt " + o.id); }}>
              Duyệt
            </Btn>
            <Btn variant="danger-line" size="xs" onClick={() => { store.rejectOrder(o.id, persona.ten, "Từ chối nhanh"); toast("Đã từ chối " + o.id, "danger"); }}>
              Từ chối
            </Btn>
          </span>
        );
      },
    },
  ];

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterChips
          value={chip}
          onChange={(k) => {
            setChip(k);
            setSubLoai("");
            setPage(1);
          }}
          options={[
            { key: "tat-ca", label: "Tất cả", count: counts["tat-ca"] },
            { key: "cho-toi-duyet", label: "Chờ tôi duyệt", count: counts["cho-toi-duyet"] },
            { key: "uu-tien", label: "Ưu tiên", count: counts["uu-tien"], icon: "⭐" },
            { key: "qua-han", label: "Quá hạn", count: counts["qua-han"], icon: "🔴" },
          ]}
        />
      </div>

      {/* #4: bấm "Chờ tôi duyệt" hiện bộ lọc phụ: Tất cả + theo Loại đề xuất */}
      {chip === "cho-toi-duyet" && subLoaiList.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-btn)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-soft)] px-2 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-faint)]">Loại đề xuất</span>
          {[{ key: "", label: "Tất cả" }, ...subLoaiList.map((l) => ({ key: l, label: l }))].map((o) => (
            <button
              key={o.key || "all"}
              onClick={() => { setSubLoai(o.key); setPage(1); }}
              className={`focus-ring h-7 rounded-full px-2.5 text-[12px] font-semibold transition-colors ${
                subLoai === o.key ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Tìm mã đơn / mã LK / tên KTV…" className="min-w-[220px] flex-1" />
        <Btn variant="ghost" size="md" onClick={() => setAdvanced((v) => !v)}>
          <Icon.filter size={15} /> Lọc thêm
        </Btn>
        {showCreateActions && canCreateOrder(persona) && (
          <>
            <Btn size="md" onClick={() => setCreate(true)}>
              <Icon.plus size={15} /> Tạo đơn
            </Btn>
            <Btn variant="ghost" size="md" onClick={() => setImp(true)}>
              <Icon.upload size={15} /> Nhập Excel
            </Btn>
          </>
        )}
      </div>

      {advanced && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ["Người nhận (KTV)", "ktv"],
              ["Giám sát (GS)", "gs"],
              ["Khoảng ngày", "ngay"],
              ["Mã linh kiện", "maLk"],
              ["Loại đề xuất", "loai"],
              ["Trạng thái", "tt"],
            ] as const).map(([label, key]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</span>
                <Select value={adv[key]} onChange={(v) => { setAdv((s) => ({ ...s, [key]: v })); setPage(1); }} options={advOptions[key]} />
              </label>
            ))}
          </div>
          <div className="mt-2.5 flex justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setAdv({ ktv: "", gs: "", ngay: "", maLk: "", loai: "", tt: "" }); setPage(1); }}>
              Xoá lọc
            </Btn>
          </div>
        </div>
      )}

      <BulkActionBar count={sel.size}>
        <Btn variant="success" size="xs" onClick={() => { sel.forEach((id) => store.approveOrder(id, persona.ten)); toast(`Đã duyệt ${sel.size} đơn`); setSel(new Set()); }}>
          Duyệt hàng loạt
        </Btn>
        <Btn variant="danger-line" size="xs" onClick={() => { sel.forEach((id) => store.rejectOrder(id, persona.ten, "Từ chối hàng loạt")); toast(`Đã từ chối ${sel.size} đơn`, "danger"); setSel(new Set()); }}>
          Từ chối hàng loạt
        </Btn>
        <Btn variant="ghost" size="xs" onClick={() => setSel(new Set())}>
          Bỏ chọn
        </Btn>
      </BulkActionBar>

      <DataTable
        columns={cols}
        rows={pageRows}
        selectable
        selected={sel}
        onToggle={toggle}
        onToggleAll={() => setSel((s) => (pageRows.every((r) => s.has(r.id)) ? new Set() : new Set(pageRows.map((r) => r.id))))}
        onRowClick={(o) => setOpenId(o.id)}
        rowAccent={(o) => o.uuTien}
      />
      <div className="flex items-center justify-between text-[12px] text-[var(--color-text-secondary)]">
        <span>
          Hiển thị {pageRows.length} / {filtered.length} đơn
        </span>
        <Pagination page={curPage} pageCount={pageCount} onPage={setPage} />
      </div>

      <OrderDrawer
        order={activeOrder}
        mobile={mobile}
        onClose={() => setOpenId(null)}
        nav={{
          hasPrev: navIdx > 0,
          hasNext: navIdx > -1 && navIdx < filtered.length - 1,
          onPrev: () => setOpenId(filtered[navIdx - 1]?.id ?? null),
          onNext: () => setOpenId(filtered[navIdx + 1]?.id ?? null),
        }}
      />

      {showCreateActions && (
        <>
          <CreateOrderModal open={create} onClose={() => setCreate(false)} mobile={mobile} onOpenImport={() => { setCreate(false); setImp(true); }} />
          <ImportExcelDialog open={imp} onClose={() => setImp(false)} mobile={mobile} />
        </>
      )}
    </div>
  );
}
