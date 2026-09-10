import type { Persona, Order, ReturnOrder } from "../types";
import { KTV_LIST } from "../mock/people";

// Pham vi du lieu persona thay trong 1 danh sach - ui-concepts/SPEC.md Ma tran 4.
// Admin/TN/Kho/KT/TBP: toan bo. GS: KTV/VT/Tram minh phu trach. Tram: minh + VT cap duoi.
// KTV/VT: chi cua minh.

function ktvEmailsOfGs(gsEmail: string): Set<string> {
  return new Set(KTV_LIST.filter((k) => k.giamSat === gsEmail).map((k) => k.email));
}
function veTinhOfTram(tramEmail: string): Set<string> {
  return new Set(KTV_LIST.filter((k) => k.tramCha === tramEmail).map((k) => k.email));
}

export function scopeOrders(p: Persona, rows: Order[]): Order[] {
  if (p.coreRole === "ADMIN" || p.tn || p.kho || p.keToan || p.tpDVBH) return rows;
  if (p.coreRole === "GS") {
    const set = ktvEmailsOfGs(p.email);
    return rows.filter((o) => set.has(o.nguoiNhanHang) || o.emailGs === p.email);
  }
  if (p.ktvDVBH && !p.veTinh) {
    // Tram: don cua minh + cua Ve tinh minh quan ly
    const vt = veTinhOfTram(p.email);
    return rows.filter((o) => o.nguoiNhanHang === p.email || vt.has(o.nguoiNhanHang));
  }
  // KTV / Ve tinh
  return rows.filter((o) => o.nguoiNhanHang === p.email || o.nguoiTao === p.email);
}

export function scopeReturns(p: Persona, rows: ReturnOrder[]): ReturnOrder[] {
  // Tram/KTV/VT/TBP o man "chi theo doi" xem TOAN BO he thong (SPEC muc 8.5 - chu dich).
  if (p.coreRole === "ADMIN" || p.coreRole === "QC" || p.tn || p.kho || p.keToan) return rows;
  if (p.coreRole === "GS") {
    const set = ktvEmailsOfGs(p.email);
    return rows.filter((r) => set.has(r.nguoiTao) || r.emailGs === p.email);
  }
  return rows; // Tram/KTV/VT/TBP: toan bo, read-only
}
