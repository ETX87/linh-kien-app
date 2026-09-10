import type { Order, ReturnOrder, WorkflowStep, Persona, RoleKey } from "../types";
import { scopeOrders, scopeReturns } from "./scope";

// Sinh "viec can lam" theo vai tro tu du lieu don/tra hang da loc theo persona.
// roleKeys: vai tro nao co viec o buoc do (dung group KPI theo vai tro tren Dashboard).

export function buildWorkflowSteps(p: Persona, orders: Order[], returns: ReturnOrder[]): WorkflowStep[] {
  const o = scopeOrders(p, orders);
  const r = scopeReturns(p, returns);
  const count = (fn: (x: Order) => boolean) => o.filter(fn).length;
  const rcount = (fn: (x: ReturnOrder) => boolean) => r.filter(fn).length;

  const steps: WorkflowStep[] = [
    { key: "cho-tram", label: "Chờ Trạm duyệt", count: count((x) => x.trangThai === "Chờ Trạm duyệt"), roleKeys: ["tram", "gs"], tab: "mua-hang", filter: "cho-toi-duyet", tone: "warning" },
    { key: "cho-tbp", label: "Chờ TBP xác nhận", count: count((x) => x.trangThai === "Chờ TBP xác nhận"), roleKeys: ["tbp"], tab: "mua-hang", filter: "cho-toi-duyet", tone: "warning" },
    { key: "cho-tn", label: "Chờ TN duyệt", count: count((x) => x.trangThai === "Chờ TN duyệt"), roleKeys: ["tn"], tab: "mua-hang", filter: "cho-toi-duyet", tone: "info" },
    { key: "qua-han", label: "Đơn quá hạn", count: count((x) => !!x.quaHan), roleKeys: ["tn", "gs"], tab: "mua-hang", filter: "qua-han", tone: "danger" },
    { key: "da-duyet-chua-pxk", label: "Đã duyệt chưa lên PXK", count: count((x) => x.trangThai === "TN đã duyệt"), roleKeys: ["tn"], tab: "phieu-xuat-kho", filter: "cho-tao-phieu", tone: "info" },
    { key: "th-ketoan", label: "Trả hàng chờ kế toán duyệt mềm", count: rcount((x) => x.buoc === "Chờ kế toán duyệt mềm" && x.trangThaiTraHang === "Đang xử lý"), roleKeys: ["ketoan"], tab: "tra-hang", filter: "buoc-1", tone: "warning" },
    { key: "th-kho", label: "Trả hàng chờ kho xác nhận", count: rcount((x) => x.buoc === "Chờ kho xác nhận" && x.trangThaiTraHang === "Đang xử lý"), roleKeys: ["kho"], tab: "tra-hang", filter: "buoc-2", tone: "info" },
    { key: "th-qc", label: "Trả hàng chờ QC xác nhận", count: rcount((x) => x.buoc === "Chờ QC xác nhận" && x.trangThaiTraHang === "Đang xử lý"), roleKeys: ["qc"], tab: "tra-hang", filter: "buoc-3", tone: "info" },
    { key: "th-tn", label: "Trả hàng chờ TN duyệt tổng", count: rcount((x) => x.buoc === "Chờ TN duyệt tổng" && x.trangThaiTraHang === "Đang xử lý"), roleKeys: ["tn"], tab: "tra-hang", filter: "buoc-4", tone: "info" },
  ];
  return steps;
}

export const ROLE_META: Record<RoleKey, { label: string; icon: string; color: string; soft: string }> = {
  tn: { label: "Tác nghiệp", icon: "🗂", color: "var(--role-tn)", soft: "var(--role-tn-soft)" },
  kho: { label: "Kho", icon: "📦", color: "var(--role-kho)", soft: "var(--role-kho-soft)" },
  ketoan: { label: "Kế toán", icon: "🧮", color: "var(--role-ketoan)", soft: "var(--role-ketoan-soft)" },
  qc: { label: "QC", icon: "✅", color: "var(--role-qc)", soft: "var(--role-qc-soft)" },
  gs: { label: "Giám sát", icon: "🧭", color: "var(--role-gs)", soft: "var(--role-gs-soft)" },
  tram: { label: "Trạm", icon: "🏢", color: "var(--color-text-secondary)", soft: "var(--color-neutral-soft)" },
  tbp: { label: "TP DVBH", icon: "👤", color: "var(--color-text-secondary)", soft: "var(--color-neutral-soft)" },
  ktv: { label: "KTV", icon: "🔧", color: "var(--color-text-secondary)", soft: "var(--color-neutral-soft)" },
};

// Meta cho pill "Bước hiện tại" o bang Tra hang (icon + tone mau, khop screenshot 1)
export const RETURN_STEP_META: Record<string, { icon: string; tone: "warning" | "info" | "success" | "purple" }> = {
  "Chờ kế toán duyệt mềm": { icon: "🧮", tone: "warning" },
  "Chờ kho xác nhận": { icon: "📦", tone: "success" },
  "Chờ QC xác nhận": { icon: "✅", tone: "warning" },
  "Chờ TN duyệt tổng": { icon: "🗂", tone: "info" },
  "Đã duyệt": { icon: "✔", tone: "success" },
  "Lên PXK (trả hàng)": { icon: "🚚", tone: "purple" },
};

// Cac RoleKey mot persona "nhan" (de group KPI + loc "viec cua toi")
export function personaRoleKeys(p: Persona): Set<RoleKey> {
  const s = new Set<RoleKey>();
  if (p.coreRole === "ADMIN") ["tn", "kho", "ketoan", "qc", "gs", "tram", "tbp"].forEach((x) => s.add(x as RoleKey));
  if (p.coreRole === "QC") s.add("qc");
  if (p.coreRole === "GS") s.add("gs");
  if (p.tn) s.add("tn");
  if (p.kho) s.add("kho");
  if (p.keToan) s.add("ketoan");
  if (p.tpDVBH) s.add("tbp");
  if (p.ktvDVBH && !p.veTinh) s.add("tram");
  if (p.ktvDVBH || p.veTinh) s.add("ktv");
  return s;
}
