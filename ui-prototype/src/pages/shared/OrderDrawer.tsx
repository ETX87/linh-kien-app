import { useEffect, useState } from "react";
import type { Order } from "../../types";
import { Drawer } from "../../components/ui/Drawer";
import { Tabs } from "../../components/ui/Tabs";
import { StatusBadge } from "../../components/ui/Badge";
import { Btn } from "../../components/ui/Btn";
import { Icon } from "../../components/ui/Icon";
import { KvRow, SectionTitle } from "../../components/ui/Card";
import { Timeline } from "../../components/ui/Timeline";
import { CaseList } from "../../components/ui/Misc";
import { TextArea } from "../../components/ui/Form";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { fmtVND, fmtDateTime } from "../../lib/format";
import { usePersona } from "../../hooks/usePersona";
import { orderRowActions } from "../../lib/permissions";
import { store } from "../../services/store";
import { useToast } from "../../components/ui/Toast";
import { LY_DO_CHAM } from "../../mock/catalog";

export function OrderDrawer({
  order,
  onClose,
  nav,
  mobile,
}: {
  order: Order | null;
  onClose: () => void;
  nav?: { hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void };
  mobile?: boolean;
}) {
  const { persona } = usePersona();
  const toast = useToast();
  const [tab, setTab] = useState("info");
  const [moreOpen, setMoreOpen] = useState(false);
  const [gt, setGt] = useState("");
  const [confirm, setConfirm] = useState<null | "reject" | "cancel">(null);

  useEffect(() => {
    setTab("info");
    setGt("");
  }, [order?.id]);

  if (!order) return null;
  const actions = orderRowActions(persona, order);
  const canAct = actions.length > 0;

  return (
    <>
      <Drawer
        open={!!order}
        onClose={onClose}
        mobile={mobile}
        nav={nav}
        title={
          <>
            <span className="font-mono text-[15px] font-bold text-[var(--color-text)]">{order.id}</span>
            {order.uuTien && <Icon.star size={15} className="text-[var(--color-star)]" />}
            <StatusBadge status={order.quaHan ? "Quá hạn" : order.trangThai} />
          </>
        }
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {canAct && (
              <>
                <Btn variant="success" size="sm" onClick={() => { store.approveOrder(order.id, persona.ten); toast("Đã duyệt " + order.id); }}>
                  Duyệt
                </Btn>
                <Btn variant="danger" size="sm" onClick={() => setConfirm("reject")}>
                  Từ chối <Icon.chevronDown size={13} />
                </Btn>
              </>
            )}
            <Btn variant="ghost" size="sm" onClick={() => setConfirm("cancel")}>
              Huỷ đơn
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => toast("Mở form sửa đơn (mô phỏng)", "info")}>
              Sửa đơn
            </Btn>
            {canAct && nav?.hasNext && (
              <Btn size="sm" className="ml-auto" onClick={() => { store.approveOrder(order.id, persona.ten); toast("Đã duyệt, sang đơn tiếp theo"); nav.onNext(); }}>
                Duyệt và tiếp theo <Icon.arrowRight size={14} />
              </Btn>
            )}
          </div>
        }
      >
        <Tabs
          size="sm"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "info", label: "Thông tin đơn" },
            { key: "case", label: "Case", count: order.cases.length },
            { key: "log", label: "Lịch sử xử lý" },
            { key: "giaitrinh", label: "Giải trình", count: order.giaiTrinh.length },
          ]}
        />

        {tab === "info" && (
          <div className="pt-3">
            <SectionTitle right={<Icon.chevronDown size={14} className="text-[var(--color-text-faint)]" />}>Thông tin đơn hàng</SectionTitle>
            <div className="grid">
              <KvRow label="Loại đơn">{order.loai === "cong_no" ? "Công nợ" : order.loai === "tra_hang" ? "Trả hàng" : "Mua hàng"}</KvRow>
              <KvRow label="Mã linh kiện">
                <span className="font-mono">{order.maLk}</span> — {order.tenLk}
              </KvRow>
              <KvRow label="SL đề xuất / thực xuất">
                {order.slDeXuat} / {order.slThucXuat ?? "—"}
              </KvRow>
              <KvRow label="Giá đề xuất / chốt">
                <span className="font-mono">{fmtVND(order.giaDeXuat)}</span> / <span className="font-mono">{fmtVND(order.giaChot)}</span>
              </KvRow>
              <KvRow label="Loại đề xuất">{order.loaiDeXuat}</KvRow>
              <KvRow label="Người nhận hàng">
                {order.nguoiNhanHangTen}
                <span className="block text-[11px] text-[var(--color-text-secondary)]">GS: {order.gsTen}</span>
              </KvRow>
              <KvRow label="Người tạo">
                {order.nguoiTaoTen} {order.taoHo && <span className="text-[var(--color-text-secondary)]">(tạo hộ)</span>}
              </KvRow>
              <KvRow label="Ngày tạo">{fmtDateTime(order.ngayTao)}</KvRow>
            </div>

            {order.loai === "cong_no" && (
              <div className="mt-3 rounded-lg border border-[var(--color-border)] p-2.5">
                <div className="mb-1 flex items-center gap-2 text-[12.5px] font-semibold">
                  <span className={order.danhGiaCongNo === "Đủ" ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>
                    {order.danhGiaCongNo === "Đủ" ? "✓ Đủ trong hạn" : "✕ Không đủ hạn mức"}
                  </span>
                  <span className="ml-auto font-mono text-[12px] text-[var(--color-text-secondary)]">
                    {fmtVND(order.soTienCongNo)} / {fmtVND(order.tranCongNo)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-neutral-soft)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-primary)]"
                    style={{ width: Math.min(100, ((order.soTienCongNo ?? 0) / (order.tranCongNo || 1)) * 100) + "%" }}
                  />
                </div>
              </div>
            )}

            <div className="mt-3">
              <button onClick={() => setMoreOpen((v) => !v)} className="focus-ring flex w-full items-center justify-between py-1 text-[12px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Thông tin bổ sung <Icon.chevronDown size={14} className={moreOpen ? "rotate-180" : ""} />
              </button>
              {moreOpen && (
                <div className="grid">
                  <KvRow label="Ghi chú">{order.ghiChu ?? "—"}</KvRow>
                  <KvRow label="Yêu cầu hoá đơn">{order.yeuCauHoaDon ?? "—"}</KvRow>
                  <KvRow label="TT mail duyệt">{order.ttMailDuyet ?? "—"}</KvRow>
                  <KvRow label="TT khách hàng">{order.ttKhachHang ?? "—"}</KvRow>
                  <KvRow label="Chính sách">{order.chinhSach ?? "—"}</KvRow>
                  <KvRow label="Mã yêu cầu sự cố">
                    {order.maYeuCauSuCo ? <span className="font-mono text-[var(--color-primary)]">{order.maYeuCauSuCo}</span> : "—"}
                  </KvRow>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "case" && (
          <div className="pt-3">
            <SectionTitle right={<span className="text-[11px] text-[var(--color-text-faint)]">{order.cases.length} case</span>}>Case đính kèm</SectionTitle>
            <CaseList cases={order.cases} onAttach={() => toast("Mở hộp thoại gắn case (mô phỏng)", "info")} />
          </div>
        )}

        {tab === "log" && (
          <div className="pt-3">
            <SectionTitle right={<Icon.chevronDown size={14} className="text-[var(--color-text-faint)]" />}>Lịch sử xử lý</SectionTitle>
            <Timeline logs={order.logs} />
            <button className="focus-ring mt-1 text-[12px] font-semibold text-[var(--color-primary)] hover:underline">Xem tất cả</button>
          </div>
        )}

        {tab === "giaitrinh" && (
          <div className="pt-3">
            <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]/50 p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--color-danger)]">
                <Icon.alert size={14} /> Giải trình lý do chậm
              </div>
              <TextArea value={gt} onChange={(e) => setGt(e.target.value)} placeholder="Nhập lý do giải trình…" />
              <div className="mt-1.5 flex justify-end">
                <Btn
                  size="xs"
                  disabled={!gt.trim()}
                  onClick={() => {
                    store.addGiaiTrinh(order.id, gt.trim(), persona.ten);
                    setGt("");
                    toast("Đã lưu giải trình");
                  }}
                >
                  Lưu giải trình
                </Btn>
              </div>
            </div>
            <div className="mt-3">
              <SectionTitle>Lịch sử giải trình</SectionTitle>
              {order.giaiTrinh.length === 0 && <div className="text-[12px] text-[var(--color-text-secondary)]">Chưa có lần giải trình nào.</div>}
              <ul className="space-y-2">
                {order.giaiTrinh.map((g, i) => (
                  <li key={i} className="rounded-lg border border-[var(--color-border)] p-2 text-[12.5px]">
                    <div className="text-[var(--color-text)]">{g.noiDung}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--color-text-faint)]">
                      {g.nguoiTao} · {fmtDateTime(g.ngayTao)} {g.lanDau && "· Lần đầu"}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirm === "reject"}
        onClose={() => setConfirm(null)}
        mobile={mobile}
        title={`Từ chối đơn ${order.id}`}
        danger
        confirmLabel="Xác nhận từ chối"
        reasons={LY_DO_CHAM.map((l) => ({ value: l.ten, label: l.ten }))}
        onConfirm={({ reason }) => {
          store.rejectOrder(order.id, persona.ten, reason ?? "");
          setConfirm(null);
          toast("Đã từ chối " + order.id, "danger");
        }}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        mobile={mobile}
        title={`Huỷ đơn ${order.id}`}
        message="Đơn đã huỷ không thể khôi phục."
        danger
        confirmLabel="Xác nhận huỷ"
        noteLabel="Lý do huỷ"
        onConfirm={({ note }) => {
          store.cancelOrder(order.id, persona.ten, note ?? "");
          setConfirm(null);
          toast("Đã huỷ " + order.id, "danger");
        }}
      />
    </>
  );
}
