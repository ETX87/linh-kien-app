import { Icon } from "./Icon";

export interface StepDef {
  key: string;
  label: string;
  count?: number;
}

// Stepper vong tron danh so + nhanh phu "Tu choi" - khop screenshot 1 (Tra hang).
export function WorkflowStepper({
  steps,
  activeKey,
  branch,
  onStepClick,
}: {
  steps: StepDef[];
  activeKey?: string;
  branch?: { label: string; active?: boolean; onClick?: () => void };
  onStepClick?: (key: string) => void;
}) {
  const activeIdx = steps.findIndex((s) => s.key === activeKey);
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
      {steps.map((s, i) => {
        const done = activeIdx > -1 && i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={s.key} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onStepClick?.(s.key)}
              className="focus-ring group flex items-center gap-2 rounded-lg px-1.5 py-1"
            >
              <span
                className={`tabular grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[12px] font-bold ${
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : done
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                    : "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text-faint)]"
                }`}
              >
                {done ? <Icon.check size={13} /> : i + 1}
              </span>
              <span
                className={`whitespace-nowrap text-[12.5px] font-semibold ${
                  active ? "text-[var(--color-text)]" : done ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-faint)]"
                }`}
              >
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && <Icon.chevronRight size={15} className="mx-0.5 shrink-0 text-[var(--color-border-strong)]" />}
          </div>
        );
      })}
      {branch && (
        <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-dashed border-[var(--color-danger)]/40 pl-2">
          <button
            type="button"
            onClick={branch.onClick}
            className={`focus-ring flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12.5px] font-semibold ${
              branch.active ? "text-[var(--color-danger)]" : "text-[var(--color-text-faint)]"
            }`}
          >
            <span className={`grid h-6 w-6 place-items-center rounded-full border ${branch.active ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : "border-[var(--color-border-strong)] text-[var(--color-text-faint)]"}`}>
              <Icon.x size={13} />
            </span>
            {branch.label}
          </button>
        </div>
      )}
    </div>
  );
}
