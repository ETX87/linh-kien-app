import type { ReactNode } from "react";
import type { CaseInfo } from "../../types";
import { Icon } from "./Icon";
import { Btn } from "./Btn";

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid place-items-center gap-1 py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-neutral-soft)] text-[var(--color-text-faint)]">
        <Icon.file size={20} />
      </div>
      <div className="text-[13px] font-semibold text-[var(--color-text)]">{title}</div>
      {hint && <div className="text-[12px] text-[var(--color-text-secondary)]">{hint}</div>}
    </div>
  );
}

export function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  if (pageCount <= 1) return null;
  const nums = Array.from({ length: pageCount }, (_, i) => i + 1).filter((n) => n === 1 || n === pageCount || Math.abs(n - page) <= 1);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - (nums[i - 1] as number) > 1) out.push("…");
    out.push(n);
  });
  return (
    <div className="flex items-center justify-end gap-1 py-2 text-[13px]">
      <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className="focus-ring grid h-7 w-7 place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30">
        <Icon.chevronLeft size={15} />
      </button>
      {out.map((n, i) =>
        n === "…" ? (
          <span key={i} className="px-1 text-[var(--color-text-faint)]">
            …
          </span>
        ) : (
          <button
            key={i}
            onClick={() => onPage(n)}
            className={`tabular focus-ring h-7 min-w-7 rounded-md px-1.5 font-semibold ${n === page ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"}`}
          >
            {n}
          </button>
        ),
      )}
      <button onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page === pageCount} className="focus-ring grid h-7 w-7 place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30">
        <Icon.chevronRight size={15} />
      </button>
    </div>
  );
}

export function CaseList({ cases, onAttach }: { cases: CaseInfo[]; onAttach?: () => void }) {
  return (
    <div className="space-y-1.5">
      {cases.length === 0 && <div className="text-[12px] text-[var(--color-text-secondary)]">Chưa gắn case nào.</div>}
      {cases.map((c) => (
        <div key={c.id} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[12.5px]">
          <span className="font-mono font-semibold text-[var(--color-primary)]">{c.id}</span>
          <span className="text-[var(--color-text)]">{c.khachHang}</span>
          <span className="text-[var(--color-text-secondary)]">· {c.khuVuc}</span>
          <button className="focus-ring ml-auto text-[var(--color-text-faint)] hover:text-[var(--color-danger)]">
            <Icon.x size={13} />
          </button>
        </div>
      ))}
      {onAttach && (
        <Btn variant="ghost" size="sm" onClick={onAttach} className="mt-1">
          <Icon.plus size={14} /> Gắn thêm case
        </Btn>
      )}
    </div>
  );
}

export function KvGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4">{children}</div>;
}
