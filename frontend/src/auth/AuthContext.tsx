import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ViewAsRole } from "./viewAsRoles";

// Rut gon tu frontend/src/auth/AuthContext.tsx cua he DVBH goc - chi 3 vai tro (Admin/QC/Giam sat)
// con lai la co vai tro nghiep vu doc lap (xem backend/src/types.ts).
export type VaiTro = "Admin" | "QC" | "Giam sat";

export interface AppUser {
  email: string;
  ten: string | null;
  vai_tro: VaiTro | null;
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi";
  bi_khoa: boolean;
  la_ktv_dvbh: boolean;
  la_ve_tinh: boolean;
  la_kho: boolean;
  la_ke_toan: boolean;
  la_tac_nghiep: boolean;
  la_tp_dvbh: boolean;
  la_view: boolean;
  quan_ly_danh_muc_lk: boolean;
  xem_danh_muc_lk: boolean;
  tram_cha: string | null;
  giam_sat_quan_ly: string | null;
  // Tinh o backend (GET /api/auth/me) - co it nhat 1 Ve tinh voi tram_cha = email minh.
  la_tram: boolean;
}

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "pending" }
  | { status: "rejected" }
  | { status: "disabled" }
  // realIsAdmin/viewAsRole: "xem thu vai tro" (Admin-only, xem TopBar.tsx) - realIsAdmin phan anh
  // tai khoan THAT (khong doi du dang "xem thu" vai tro nao), viewAsRole la preset dang ap dung
  // (null = dang la chinh Admin that, khong "xem thu" gi).
  | { status: "authenticated"; user: AppUser; realIsAdmin: boolean; viewAsRole: ViewAsRole | null };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          const { user, realIsAdmin, viewAsRole } = (await res.json()) as { user: AppUser; realIsAdmin: boolean; viewAsRole: ViewAsRole | null };
          setState({ status: "authenticated", user, realIsAdmin, viewAsRole });
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (body.error === "PENDING_APPROVAL") setState({ status: "pending" });
        else if (body.error === "REJECTED") setState({ status: "rejected" });
        else if (body.error === "DISABLED") setState({ status: "disabled" });
        else setState({ status: "anonymous" });
      } catch {
        if (!cancelled) setState({ status: "anonymous" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phai dung trong AuthProvider");
  return ctx;
}
