import { useMemo, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Card, SectionTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { Tabs } from "../components/ui/Tabs";
import { OrdersView } from "./shared/OrdersView";
import { fmtDateLong, fmtVND } from "../lib/format";
import { usePersona } from "../hooks/usePersona";
import { useOrders, useReturns } from "../hooks/useStore";
import { scopeOrders } from "../lib/scope";
import { buildWorkflowSteps, personaRoleKeys, ROLE_META } from "../lib/workflow";
import type { RoleKey } from "../types";

interface GroupItem {
  label: string;
  value: number;
  tab: string;
  danger?: boolean;
}

export function DashboardPage({ mobile, onJump }: { mobile?: boolean; onJump: (tab: string) => void }) {
  const { persona } = usePersona();
  const orders = useOrders();
  const returns = useReturns();
  const [repTab, setRepTab] = useState("tong-quan");

  const myKeys = personaRoleKeys(persona);
  const steps = useMemo(() => buildWorkflowSteps(persona, orders, returns), [persona, orders, returns]);
  const so = useMemo(() => scopeOrders(persona, orders).filter((o) => o.loai !== "tra_hang"), [persona, orders]);
  const stepCount = (k: string) => steps.find((s) => s.key === k)?.count ?? 0;

  // 4 thẻ cá nhân lớn - khớp screenshot 2 (2 thẻ PXK dùng số tĩnh vì PXK chưa dựng đợt này)
  const myCards: { label: string; value: number; tone: "warning" | "danger" | "info" | "purple"; icon: JSX.Element; tab: string }[] = [
    { label: "Đơn của tôi đang chờ duyệt", value: so.filter((o) => o.nguoiTao === persona.email && /^Chờ/.test(o.trangThai)).length, tone: "warning", icon: <Icon.clock size={18} />, tab: "mua-hang" },
    { label: "Đơn bị từ chối", value: so.filter((o) => o.trangThai === "Từ chối").length, tone: "danger", icon: <Icon.x size={18} />, tab: "mua-hang" },
    { label: "PXK chờ tôi xác nhận nhận hàng", value: 5, tone: "info", icon: <Icon.package size={18} />, tab: "phieu-xuat-kho" },
    { label: "PXK chờ tôi chuyển tiền", value: 3, tone: "purple", icon: <Icon.file size={18} />, tab: "phieu-xuat-kho" },
  ];

  // Nhóm KPI theo vai trò - danh sách ô khớp screenshot 2 (ô PXK/ticket dùng số tĩnh)
  const GROUPS: { rk: RoleKey; items: GroupItem[] }[] = [
    {
      rk: "tn",
      items: [
        { label: "Chờ TN duyệt", value: stepCount("cho-tn"), tab: "mua-hang" },
        { label: "Ticket thiếu LK chờ đóng", value: 3, tab: "thieu-lk" },
        { label: "Đơn đã duyệt chưa lên PXK", value: stepCount("da-duyet-chua-pxk"), tab: "phieu-xuat-kho" },
        { label: "PXK chờ gán xuất kho", value: 4, tab: "phieu-xuat-kho" },
      ],
    },
    {
      rk: "kho",
      items: [
        { label: "Ticket thiếu LK chờ tiếp nhận", value: 9, tab: "thieu-lk" },
        { label: "Chờ kho xác nhận hàng về", value: 3, tab: "thieu-lk" },
        { label: "PXK chờ gửi hàng", value: 5, tab: "phieu-xuat-kho" },
        { label: "Trả hàng chờ kho xác nhận", value: stepCount("th-kho"), tab: "tra-hang" },
      ],
    },
    {
      rk: "ketoan",
      items: [
        { label: "PXK chờ gán mã MISA", value: 4, tab: "phieu-xuat-kho" },
        { label: "PXK chờ chốt đơn xuất", value: 6, tab: "phieu-xuat-kho" },
        { label: "Trả hàng chờ kế toán duyệt mềm", value: stepCount("th-ketoan"), tab: "tra-hang" },
      ],
    },
    { rk: "qc", items: [{ label: "Việc QC cần xác nhận", value: stepCount("th-qc"), tab: "tra-hang" }] },
    { rk: "gs", items: [{ label: "Đơn tồn đọng khu vực phụ trách", value: so.filter((o) => /^Chờ/.test(o.trangThai)).length, tab: "mua-hang" }] },
  ];
  const groups = GROUPS.filter((g) => persona.coreRole === "ADMIN" || myKeys.has(g.rk));

  // "Đang tồn" - danh sách khớp screenshot 2
  const dangTon = [
    { label: "Chờ Trạm duyệt", value: stepCount("cho-tram"), tab: "mua-hang" },
    { label: "Chờ TN duyệt", value: stepCount("cho-tn"), tab: "mua-hang" },
    { label: "Chờ kho xác nhận hàng về", value: 6, tab: "thieu-lk" },
    { label: "PXK chờ gửi hàng", value: 5, tab: "phieu-xuat-kho" },
    { label: "Trả hàng chờ QC xác nhận", value: stepCount("th-qc"), tab: "tra-hang" },
  ].filter((s) => s.value > 0);

  const tongTien = so.reduce((a, o) => a + (o.giaChot ?? 0), 0);

  return (
    <div className="anim-in space-y-4">
      <PageHeader
        title="Việc cần làm"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Icon.calendar size={13} /> Hôm nay, {fmtDateLong()}
          </span>
        }
      />

      <div className={mobile ? "grid grid-cols-2 gap-2.5" : "grid grid-cols-2 gap-3 lg:grid-cols-4"}>
        {myCards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} tone={c.tone} icon={c.icon} muted={c.value === 0} onClick={() => onJump(c.tab)} />
        ))}
      </div>

      <div className={mobile ? "grid gap-3" : "grid gap-3 md:grid-cols-2 xl:grid-cols-3"}>
        {groups.map(({ rk, items }) => {
          const meta = ROLE_META[rk];
          return (
            <div
              key={rk}
              className="overflow-hidden rounded-[var(--radius-card)] border"
              style={{
                background: `linear-gradient(160deg, ${meta.soft} 0%, var(--color-surface) 46%)`,
                borderColor: `color-mix(in srgb, ${meta.color} 26%, var(--color-border))`,
              }}
            >
              <div className="flex items-center gap-2 px-3.5 py-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-md text-[13px]" style={{ background: "var(--color-surface)", color: meta.color }}>
                  {meta.icon}
                </span>
                <span className="text-[13px] font-bold" style={{ color: meta.color }}>
                  {meta.label}
                </span>
              </div>
              <div className={`grid gap-2 px-3 pb-3 ${items.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                {items.map((it) => (
                  <button
                    key={it.label}
                    onClick={() => onJump(it.tab)}
                    className="focus-ring rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-left transition-colors hover:border-[var(--color-primary)]"
                  >
                    <span className="block text-[11px] font-medium leading-tight text-[var(--color-text-secondary)]">{it.label}</span>
                    <span className={`tabular mt-1 block text-[19px] font-extrabold ${it.value === 0 ? "text-[var(--color-text-faint)]" : it.danger ? "text-[var(--color-danger)]" : "text-[var(--color-text)]"}`}>
                      {it.value}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className={mobile ? "grid gap-3" : "grid gap-3 lg:grid-cols-2"}>
        <Card className="p-3.5">
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Icon.chart size={13} /> Đang tồn
            </span>
          </SectionTitle>
          <ul className="divide-y divide-[var(--color-border)]">
            {dangTon.length === 0 && <li className="py-2 text-[12px] text-[var(--color-text-secondary)]">Không có đơn tồn đọng trong phạm vi của bạn.</li>}
            {dangTon.map((s) => (
              <li key={s.label}>
                <button onClick={() => onJump(s.tab)} className="focus-ring flex w-full items-center gap-2 py-2 text-left text-[13px] hover:text-[var(--color-primary)]">
                  <span className="flex-1">{s.label}</span>
                  <span className="tabular font-bold">{s.value}</span>
                  <Icon.chevronRight size={15} className="text-[var(--color-text-faint)]" />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-3.5">
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Icon.file size={13} /> Báo cáo
            </span>
          </SectionTitle>
          <Tabs
            size="sm"
            value={repTab}
            onChange={setRepTab}
            tabs={[
              { key: "tong-quan", label: "Tổng quan" },
              { key: "doanh-thu", label: "Doanh thu" },
              { key: "hieu-suat", label: "Hiệu suất" },
              { key: "sla", label: "SLA" },
            ]}
          />
          <div className="pt-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Thẻ cá nhân (KTV / Trạm / Vệ tinh)</div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Đơn của tôi" value={so.filter((o) => o.nguoiTao === persona.email).length || 12} />
              <MiniStat label="Tổng tiền" value={fmtVND(tongTien || 124_500_000)} small />
              <MiniStat label="Đã duyệt" value={so.filter((o) => o.trangThai === "TN đã duyệt").length || 8} />
            </div>
            <LineChart />

            <div className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Pivot nhanh (Admin / TN / Kho / KT)</div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Tổng đơn" value="1.248" trend="+12%" />
              <MiniStat label="Tổng tiền thực tế" value="2.450.000.000đ" small trend="+8%" />
              <MiniStat label="Chờ duyệt" value="86" trend="-6%" down />
            </div>
            <BarChart />
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <Icon.cart size={13} /> Mua hàng
          </span>
        </SectionTitle>
        <OrdersView mobile={mobile} compact showCreateActions />
      </div>
    </div>
  );
}

function MiniStat({ label, value, small, trend, down }: { label: string; value: string | number; small?: boolean; trend?: string; down?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-2">
      <span className="block text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</span>
      <span className={`tabular mt-0.5 block font-extrabold text-[var(--color-text)] ${small ? "text-[13px]" : "text-[18px]"}`}>{value}</span>
      {trend && <span className={`text-[11px] font-semibold ${down ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>{down ? "▼" : "▲"} {trend}</span>}
    </div>
  );
}

function LineChart() {
  const pts = [28, 22, 34, 30, 42, 38, 52, 46, 58];
  const max = 64;
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${40 - (p / max) * 36}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-12 w-full">
      <polyline points={d} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function BarChart() {
  const bars = [40, 62, 48, 75, 58, 84, 70, 66];
  return (
    <div className="mt-2 flex h-12 items-end gap-1.5">
      {bars.map((h, i) => (
        <div key={i} className="flex-1 rounded-sm bg-[var(--color-primary)]" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}
