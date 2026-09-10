import type { Persona, Order, ReturnOrder } from "../types";

// Helper quyen role x co - theo ui-concepts/SPEC.md Ma tran 1/2/4. KHONG hardcode theo ten role o
// component; component luon hoi qua cac ham nay.

export function roleChips(p: Persona): string[] {
  const out: string[] = [];
  if (p.coreRole === "ADMIN") out.push("Admin");
  if (p.coreRole === "QC") out.push("QC");
  if (p.coreRole === "GS") out.push("Giám sát");
  if (p.ktvDVBH) out.push("KTV DVBH");
  if (p.veTinh) out.push("Vệ tinh");
  if (p.kho) out.push("Kho");
  if (p.keToan) out.push("Kế toán");
  if (p.tn) out.push("TN");
  if (p.tpDVBH) out.push("TP DVBH");
  if (p.view) out.push("View");
  if (p.manageParts) out.push("Quản lý DM LK");
  if (p.viewParts) out.push("Xem DM LK");
  return out;
}

export function roleLabel(p: Persona): string {
  return roleChips(p)[0] ?? "Đặt mua linh kiện";
}

const isAdmin = (p: Persona) => p.coreRole === "ADMIN";

// --- Module nao hien trong menu ---
export function visibleModules(p: Persona): string[] {
  const m = new Set<string>(["trang-chu", "danh-muc-lk"]);
  const canMuaHang = isAdmin(p) || p.coreRole === "GS" || p.ktvDVBH || p.veTinh || p.tn || p.tpDVBH;
  const canPxk = isAdmin(p) || p.coreRole === "GS" || p.kho || p.keToan || p.tn;
  if (canMuaHang) {
    m.add("mua-hang");
    m.add("cong-no");
  }
  // Tra hang: moi vai tro trong module deu thay (day du hoac chi theo doi)
  m.add("tra-hang");
  if (canPxk) m.add("phieu-xuat-kho");
  m.add("thieu-lk");
  m.add("bao-cao");
  m.add("ton-kho-ktv");
  m.add("bao-cao-toc-do");
  if (isAdmin(p)) {
    m.add("settings");
    m.add("users");
  }
  return [...m];
}

// --- Tra hang: persona co nut duyet tung buoc khong (day du) hay chi theo doi (read-only) ---
export function canActOnReturns(p: Persona): boolean {
  return isAdmin(p) || p.coreRole === "QC" || p.coreRole === "GS" || p.kho || p.keToan || p.tn;
}
export function returnsReadOnly(p: Persona): boolean {
  return !canActOnReturns(p);
}

// Nut 1 cham nao hien tren 1 dong tra hang theo buoc hien tai
export function returnRowActions(p: Persona, r: ReturnOrder): { label: string; kind: "success" | "danger" | "ghost" }[] {
  if (returnsReadOnly(p) || r.trangThaiTraHang !== "Đang xử lý") return [];
  const A = isAdmin(p);
  switch (r.buoc) {
    case "Chờ kế toán duyệt mềm":
      return p.keToan || A ? [{ label: "Duyệt mềm", kind: "success" }, { label: "Lùi bước", kind: "ghost" }] : [];
    case "Chờ kho xác nhận":
      return p.kho || A ? [{ label: "Xác nhận", kind: "success" }, { label: "Lùi bước", kind: "ghost" }] : [];
    case "Chờ QC xác nhận":
      return p.coreRole === "QC" || A ? [{ label: "QC xác nhận", kind: "success" }] : [];
    case "Chờ TN duyệt tổng":
      return p.tn || A ? [{ label: "Duyệt tổng", kind: "success" }, { label: "Từ chối", kind: "danger" }] : [];
    default:
      return [];
  }
}

// --- Mua hang: nut 1 cham tren 1 dong don ---
export function orderRowActions(p: Persona, o: Order): { label: string; kind: "success" | "danger" }[] {
  const A = isAdmin(p);
  if (o.trangThai === "Chờ Trạm duyệt" && (A || (p.ktvDVBH && !p.veTinh))) return [{ label: "Duyệt", kind: "success" }, { label: "Từ chối", kind: "danger" }];
  if (o.trangThai === "Chờ TBP xác nhận" && (A || p.tpDVBH)) return [{ label: "Duyệt", kind: "success" }, { label: "Từ chối", kind: "danger" }];
  if (o.trangThai === "Chờ TN duyệt" && (A || p.tn)) return [{ label: "Duyệt", kind: "success" }, { label: "Từ chối", kind: "danger" }];
  return [];
}

export function canCreateOrder(p: Persona): boolean {
  return isAdmin(p) || p.coreRole === "GS" || p.ktvDVBH || p.veTinh || p.tn;
}

export function canManageParts(p: Persona): boolean {
  return isAdmin(p) || p.manageParts;
}
