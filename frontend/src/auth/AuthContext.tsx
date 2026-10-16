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
  la_mua_hang: boolean;
  quan_ly_danh_muc_lk: boolean;
  xem_danh_muc_lk: boolean;
  tram_cha: string | null;
  giam_sat_quan_ly: string | null;
  // Tinh o backend (GET /api/auth/me) - co it nhat 1 Ve tinh voi tram_cha = email minh.
  la_tram: boolean;
  // Bat/tat rieng 3 loai thong bao "viec moi theo vai tro + khu vuc" (them 2026-09-05) - xem
  // NotificationBell.tsx.
  nhan_tb_nhiem_vu: boolean;
  nhan_tb_lien_quan: boolean;
  nhan_tb_theo_doi: boolean;
  // Nhom LK Kho xu ly thieu hang (2026-10-16, migration 0088): null = ca 2 - xem lib/nhomLk.ts.
  kho_nhom_lk?: "karofi" | "b2b" | null;
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
  // viewAsUser (2026-09-30): Admin dang "xem nhu nguoi dung" - user = CHINH tai khoan do, chi doc (layout/XemNhuNguoiDung.tsx).
  | { status: "authenticated"; user: AppUser; realIsAdmin: boolean; viewAsRole: ViewAsRole | null; viewAsUser: { email: string; ten: string | null } | null };

interface AuthContextValue {
  state: AuthState;
  // Goi lai GET /auth/me va cap nhat state (them 2026-09-05: dung sau khi doi 1 toggle thong bao o
  // NotificationBell.tsx de UI phan anh ngay, khong can reload trang).
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  async function load(cancelledRef?: { current: boolean }) {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (cancelledRef?.current) return;
      if (res.ok) {
        const { user, realIsAdmin, viewAsRole, viewAsUser } = (await res.json()) as {
          user: AppUser;
          realIsAdmin: boolean;
          viewAsRole: ViewAsRole | null;
          viewAsUser?: { email: string; ten: string | null } | null;
        };
        setState({ status: "authenticated", user, realIsAdmin, viewAsRole, viewAsUser: viewAsUser ?? null });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === "PENDING_APPROVAL") setState({ status: "pending" });
      else if (body.error === "REJECTED") setState({ status: "rejected" });
      else if (body.error === "DISABLED") setState({ status: "disabled" });
      else setState({ status: "anonymous" });
    } catch {
      if (!cancelledRef?.current) setState({ status: "anonymous" });
    }
  }

  useEffect(() => {
    const cancelledRef = { current: false };
    load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  return <AuthContext.Provider value={{ state, refreshUser: () => load() }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phai dung trong AuthProvider");
  return ctx.state;
}

export function useRefreshUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useRefreshUser phai dung trong AuthProvider");
  return ctx.refreshUser;
}
