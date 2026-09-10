import { useEffect, useRef, useState } from "react";
import { usePersona } from "../../hooks/usePersona";
import { roleChips, roleLabel } from "../../lib/permissions";
import { Icon } from "../ui/Icon";
import { RoleChip } from "../ui/Badge";
import { Checkbox } from "../ui/Form";

export function PersonaSwitcher({ onDark }: { onDark?: boolean }) {
  const { persona, personaId, setPersonaId, all, manageParts, viewParts, toggleManageParts, toggleViewParts } = usePersona();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  const chips = roleChips(persona);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`focus-ring flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 ${onDark ? "hover:bg-white/10" : "hover:bg-[var(--color-surface-hover)]"}`}
      >
        <span className={`grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold ${onDark ? "bg-white/15 text-white" : "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"}`}>
          {persona.ten.split(" ").slice(-1)[0].slice(0, 1)}
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className={`block text-[12.5px] font-bold ${onDark ? "text-white" : "text-[var(--color-text)]"}`}>{persona.ten}</span>
          <span className={`block text-[11px] ${onDark ? "text-[var(--topbar-fg-dim)]" : "text-[var(--color-text-secondary)]"}`}>{persona.email}</span>
        </span>
        <span
          className={`hidden items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold sm:flex ${
            onDark ? "bg-white/10 text-[var(--topbar-fg-dim)]" : "bg-[var(--color-neutral-soft)] text-[var(--color-text-secondary)]"
          }`}
        >
          {roleLabel(persona)}
          <Icon.chevronDown size={12} />
        </span>
      </button>

      <div className="ml-1 hidden flex-wrap items-center gap-1 xl:flex">
        {chips.slice(1).map((c) => (
          <RoleChip key={c}>{c}</RoleChip>
        ))}
      </div>

      {open && (
        <div className="anim-in absolute right-0 top-12 z-50 w-[300px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-drawer">
          <div className="border-b border-[var(--color-border)] px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
            Đổi vai trò (demo)
          </div>
          <ul className="max-h-[280px] overflow-y-auto py-1">
            {all.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setPersonaId(p.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-[var(--color-surface-hover)] ${
                    p.id === personaId ? "font-bold text-[var(--color-primary)]" : "text-[var(--color-text)]"
                  }`}
                >
                  <span>
                    {p.ten}
                    <span className="block text-[11px] font-normal text-[var(--color-text-faint)]">{p.email}</span>
                  </span>
                  {p.id === personaId && <Icon.check size={15} />}
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-1.5 border-t border-[var(--color-border)] px-3 py-2.5">
            <Checkbox checked={manageParts} onChange={toggleManageParts} label="Quản lý DM LK" />
            <Checkbox checked={viewParts} onChange={toggleViewParts} label="Xem DM LK" />
          </div>
        </div>
      )}
    </div>
  );
}
