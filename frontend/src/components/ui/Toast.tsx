import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { tn } from "../../i18n";

interface ToastItem {
  id: number;
  msg: string;
}

// ms: thoi gian hien (mac dinh 3,2s) - canh bao can nguoi dung doc ky (vd het han muc anh) truyen dai hon.
const ToastContext = createContext<{ addToast: (msg: string, ms?: number) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((msg: string, ms = 3200) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="toast-in bg-[var(--ocean-900)] text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal-500)]"></span>
            {tn(t.msg)}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast phai dung trong ToastProvider");
  return ctx.addToast;
}
