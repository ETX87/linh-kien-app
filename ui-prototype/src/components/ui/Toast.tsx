import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

type ToastItem = { id: number; msg: string; kind: "success" | "info" | "danger" };
const Ctx = createContext<(msg: string, kind?: ToastItem["kind"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((msg: string, kind: ToastItem["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 2800);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className="toast-in flex items-center gap-2 rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] font-medium shadow-pop"
          >
            <span
              className={`grid h-5 w-5 place-items-center rounded-full text-white ${
                t.kind === "danger" ? "bg-[var(--color-danger)]" : t.kind === "info" ? "bg-[var(--color-info)]" : "bg-[var(--color-success)]"
              }`}
            >
              {t.kind === "danger" ? <Icon.x size={12} /> : <Icon.check size={12} />}
            </span>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
