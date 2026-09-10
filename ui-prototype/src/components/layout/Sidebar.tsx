import { NAV } from "./nav";
import { Icon } from "../ui/Icon";
import { usePersona } from "../../hooks/usePersona";
import { visibleModules } from "../../lib/permissions";
import { useOrders, useReturns } from "../../hooks/useStore";
import { buildWorkflowSteps, personaRoleKeys } from "../../lib/workflow";

// Sidebar / menu - nen DARK NAVY (khop anh nguoi dung gui 2026-09-10):
// chu/icon trang, muc active = o bo tron to nen xanh sang, tag "Admin" = pill navy nhat.
export function Sidebar({
  active,
  onNavigate,
  collapsed,
  onToggleCollapse,
  mobile,
  onCloseMobile,
}: {
  active: string;
  onNavigate: (k: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobile?: boolean;
  onCloseMobile?: () => void;
}) {
  const { persona } = usePersona();
  const allowed = new Set(visibleModules(persona));
  const orders = useOrders();
  const returns = useReturns();
  const myKeys = personaRoleKeys(persona);
  const workCount = buildWorkflowSteps(persona, orders, returns)
    .filter((s) => s.roleKeys.some((r) => myKeys.has(r)))
    .reduce((a, s) => a + s.count, 0);

  const groups = ["Vận hành", "Hệ thống"] as const;
  const showText = !collapsed || mobile;

  return (
    <aside
      className="flex h-full flex-col text-[var(--sidebar-fg)]"
      style={{
        width: showText ? "var(--sidebar-w)" : "var(--sidebar-w-collapsed)",
        background: "linear-gradient(180deg, var(--sidebar-bg-from), var(--sidebar-bg-to) 55%)",
      }}
    >
      <div className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2.5 border-b border-[var(--sidebar-border)] px-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2b74f0] to-[#12d3e6] text-[13px] font-extrabold text-white">
          3T
        </span>
        {showText && (
          <div className="leading-tight">
            <div className="text-[13px] font-extrabold tracking-tight text-white">Đặt hàng linh kiện</div>
            <div className="text-[11px] font-semibold text-[var(--sidebar-fg-dim)]">3T</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {groups.map((g) => {
          const items = NAV.filter((i) => i.group === g && allowed.has(i.key));
          if (!items.length) return null;
          return (
            <div key={g} className="mb-4">
              {showText && <div className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--sidebar-fg-dim)]">{g}</div>}
              {items.map((it) => {
                const IconCmp = Icon[it.icon];
                const on = active === it.key || (active === "cong-no" && it.key === "mua-hang");
                return (
                  <button
                    key={it.key}
                    onClick={() => {
                      onNavigate(it.key);
                      if (mobile) onCloseMobile?.();
                    }}
                    className={`focus-ring mb-0.5 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors ${
                      on
                        ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-fg)]"
                        : "text-[var(--sidebar-fg)] hover:bg-[var(--sidebar-hover-bg)]"
                    }`}
                    title={collapsed ? it.label : undefined}
                  >
                    <IconCmp size={18} className="shrink-0" />
                    {showText && <span className="flex-1 truncate text-left">{it.label}</span>}
                    {showText && it.tag && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wide ${
                          on ? "bg-white/20 text-white" : "bg-[var(--sidebar-tag-bg)] text-[var(--sidebar-tag-fg)]"
                        }`}
                      >
                        {it.tag}
                      </span>
                    )}
                    {showText && it.badge === "work" && workCount > 0 && (
                      <span className="tabular grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
                        {workCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {!mobile && (
        <button
          onClick={onToggleCollapse}
          className="focus-ring m-2.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[var(--sidebar-fg-dim)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-fg)]"
        >
          <Icon.chevronLeft size={15} className={collapsed ? "rotate-180" : ""} />
          {showText && "Thu gọn sidebar"}
        </button>
      )}
    </aside>
  );
}
