import { useMemo, useState } from "react";
import type { ThieuLkTicket } from "../types";
import { PageHeader } from "../components/layout/PageHeader";
import { FilterChips } from "../components/ui/FilterChips";
import { SearchBar } from "../components/ui/SearchBar";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Btn } from "../components/ui/Btn";
import { Icon } from "../components/ui/Icon";
import { Drawer } from "../components/ui/Drawer";
import { KvRow, SectionTitle } from "../components/ui/Card";
import { Timeline } from "../components/ui/Timeline";
import { fmtDateTime } from "../lib/format";
import { usePersona } from "../hooks/usePersona";
import { useToast } from "../components/ui/Toast";
import { THIEU_LK } from "../mock/extra";

export function ThieuLkPage({ mobile, externalOpenId }: { mobile?: boolean; externalOpenId?: string | null }) {
  const { persona } = usePersona();
  const toast = useToast();
  const canAct = persona.kho || persona.tn || persona.coreRole === "ADMIN";
  const [chip, setChip] = useState("tat-ca");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let r = THIEU_LK;
    if (chip === "cho-xu-ly") r = r.filter((t) => /Chờ kho/.test(t.trangThai));
    if (chip === "uu-tien") r = r.filter((t) => t.uuTien);
    if (chip === "da-dong") r = r.filter((t) => /kết thúc|Từ chối|huỷ/.test(t.trangThai));
    const s = q.trim().toLowerCase();
    if (s) r = r.filter((t) => t.id.toLowerCase().includes(s) || t.maLk.toLowerCase().includes(s) || t.nguoiNhanHangTen.toLowerCase().includes(s));
    return r;
  }, [chip, q]);

  const groups = useMemo(() => {
    const m = new Map<string, ThieuLkTicket[]>();
    filtered.forEach((t) => m.set(t.nguoiNhanHangTen, [...(m.get(t.nguoiNhanHangTen) ?? []), t]));
    return [...m.entries()];
  }, [filtered]);

  const active = THIEU_LK.find((t) => t.id === (externalOpenId ?? openId)) ?? null;

  return (
    <div className="anim-in">
      <PageHeader title="Thiếu linh kiện" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterChips
          value={chip}
          onChange={setChip}
          options={[
            { key: "tat-ca", label: "Tất cả", count: THIEU_LK.length },
            { key: "cho-xu-ly", label: "Chờ xử lý", count: THIEU_LK.filter((t) => /Chờ kho/.test(t.trangThai)).length },
            { key: "uu-tien", label: "Ưu tiên", count: THIEU_LK.filter((t) => t.uuTien).length, icon: "⭐" },
            { key: "da-dong", label: "Đã đóng", count: THIEU_LK.filter((t) => /kết thúc|Từ chối|huỷ/.test(t.trangThai)).length },
          ]}
        />
        <SearchBar value={q} onChange={setQ} placeholder="Tìm mã ticket / mã LK / tên KTV…" className="w-[280px]" />
      </div>

      <div className="space-y-4">
        {groups.length === 0 && <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] py-10 text-center text-[13px] text-[var(--color-text-secondary)]">Không có ticket phù hợp.</div>}
        {groups.map(([ktv, list]) => (
          <div key={ktv} className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-2.5">
              <Icon.users size={15} className="text-[var(--color-text-secondary)]" />
              <span className="text-[13px] font-bold">{ktv}</span>
              <span className="tabular rounded-full bg-[var(--color-neutral-soft)] px-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)]">{list.length} ticket</span>
            </div>
            <ul>
              {list.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-border)] px-4 py-2.5 last:border-0 hover:bg-[var(--color-surface-hover)]">
                  <button onClick={() => setOpenId(t.id)} className="focus-ring inline-flex items-center gap-1 font-mono text-[12.5px] font-semibold">
                    {t.id}
                    {t.uuTien && <Icon.star size={12} className="text-[var(--color-star)]" />}
                  </button>
                  <Badge tone={t.loaiDon === "cong_no" ? "purple" : "info"}>{t.loaiDon === "cong_no" ? "Công nợ" : "Mua"}</Badge>
                  <span className="text-[12.5px]"><span className="font-mono text-[var(--color-text-secondary)]">{t.maLk}</span> — {t.tenLk}</span>
                  <span className="text-[12px] text-[var(--color-text-secondary)]">Đơn gốc {t.donGoc}</span>
                  <span className="text-[12px] text-[var(--color-text-secondary)]">Dự kiến: {t.ngayDuKien ?? "—"}</span>
                  <StatusBadge status={t.trangThai} />
                  <span className="ml-auto flex gap-1">
                    {canAct && persona.kho && t.trangThai === "Chờ kho tiếp nhận" && <Btn size="xs" variant="success" onClick={() => toast("Đã tiếp nhận " + t.id)}>Tiếp nhận</Btn>}
                    {canAct && persona.kho && t.trangThai === "Chờ kho xác nhận" && <Btn size="xs" variant="success" onClick={() => toast("Xác nhận hàng về " + t.id)}>Xác nhận về</Btn>}
                    {canAct && persona.tn && t.trangThai === "Đã về kho" && <Btn size="xs" variant="success" onClick={() => toast("Đã đóng ticket " + t.id)}>Đóng ticket</Btn>}
                    <Btn size="xs" variant="ghost" onClick={() => setOpenId(t.id)}>Xem</Btn>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Drawer
        open={!!active}
        onClose={() => setOpenId(null)}
        mobile={mobile}
        title={active && (<><span className="font-mono text-[15px] font-bold">{active.id}</span>{active.uuTien && <Icon.star size={15} className="text-[var(--color-star)]" />}<StatusBadge status={active.trangThai} /></>)}
      >
        {active && (
          <div className="space-y-4 pt-1">
            <div>
              <SectionTitle>Thông tin ticket</SectionTitle>
              <KvRow label="Linh kiện"><span className="font-mono">{active.maLk}</span> — {active.tenLk}</KvRow>
              <KvRow label="Đơn gốc"><span className="font-mono text-[var(--color-primary)]">{active.donGoc}</span></KvRow>
              <KvRow label="Loại đơn">{active.loaiDon === "cong_no" ? "Công nợ" : "Mua"}</KvRow>
              <KvRow label="Lý do chậm">{active.lyDoCham}</KvRow>
              <KvRow label="Ngày dự kiến có hàng">{active.ngayDuKien ?? "—"}</KvRow>
              <KvRow label="Người nhận hàng">{active.nguoiNhanHangTen} · GS: {active.gsTen}</KvRow>
              <KvRow label="Người tạo ticket">Kho Trung Tâm</KvRow>
              <KvRow label="Ngày tạo">{fmtDateTime(active.ngayTao)}</KvRow>
            </div>
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
