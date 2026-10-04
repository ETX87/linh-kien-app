import { doanToDam, type ToDamSpec } from "../../lib/timLinhKien";

// To dam phan khop tu khoa trong ten (2026-10-04, bo tim linh kien) - so khop khong dau, hien nguyen chu goc.
export function ToDam({ text, spec }: { text: string; spec?: ToDamSpec | null }) {
  if (!spec || (spec.sub.length === 0 && spec.tok.length === 0)) return <>{text}</>;
  return (
    <>
      {doanToDam(text, spec).map((d, i) =>
        d.dam ? (
          <mark key={i} className="rounded-[3px] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] font-bold">
            {d.s}
          </mark>
        ) : (
          <span key={i}>{d.s}</span>
        ),
      )}
    </>
  );
}
