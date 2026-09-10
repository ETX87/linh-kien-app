import type { Order, ReturnOrder, AppNotification, OrderStatus, ReturnStep } from "../types";
import { ORDERS } from "../mock/orders";
import { RETURNS, RETURN_STEPS } from "../mock/returns";
import { NOTIFICATIONS } from "../mock/misc";

// Store prototype: mang nam trong bo nho, thao tac (duyet/tu choi...) mutate tai cho roi phat
// su kien de UI re-render. Dot port: thay cac ham nay bang fetch('/api/...').

let orders: Order[] = ORDERS.map((o) => ({ ...o }));
let returns: ReturnOrder[] = RETURNS.map((r) => ({ ...r }));
let notifications: AppNotification[] = NOTIFICATIONS.map((n) => ({ ...n }));

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export const store = {
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getVersion: () => version,
  getOrders: () => orders,
  getReturns: () => returns,
  getNotifications: () => notifications,

  approveOrder(id: string, actor: string) {
    orders = orders.map((o) => {
      if (o.id !== id) return o;
      const next: OrderStatus =
        o.trangThai === "Chờ Trạm duyệt" ? "Chờ TN duyệt" : o.trangThai === "Chờ TBP xác nhận" ? "Chờ TN duyệt" : "TN đã duyệt";
      return {
        ...o,
        trangThai: next,
        quaHan: false,
        giaChot: next === "TN đã duyệt" ? o.giaDeXuat : o.giaChot,
        slThucXuat: next === "TN đã duyệt" ? o.slDeXuat : o.slThucXuat,
        logs: [...o.logs, { trangThai: next === "TN đã duyệt" ? "TN đã duyệt" : "Duyệt", nguoiXuLy: actor, ngayXuLy: new Date().toISOString(), ghiChu: null }],
      };
    });
    emit();
  },
  rejectOrder(id: string, actor: string, lyDo: string) {
    orders = orders.map((o) =>
      o.id === id
        ? { ...o, trangThai: "Từ chối", lyDoCham: lyDo, logs: [...o.logs, { trangThai: "Từ chối", nguoiXuLy: actor, ngayXuLy: new Date().toISOString(), ghiChu: lyDo }] }
        : o,
    );
    emit();
  },
  cancelOrder(id: string, actor: string, lyDo: string) {
    orders = orders.map((o) =>
      o.id === id
        ? { ...o, trangThai: "Đã huỷ", logs: [...o.logs, { trangThai: "Đã huỷ", nguoiXuLy: actor, ngayXuLy: new Date().toISOString(), ghiChu: lyDo }] }
        : o,
    );
    emit();
  },
  addGiaiTrinh(id: string, noiDung: string, actor: string) {
    orders = orders.map((o) => (o.id === id ? { ...o, giaiTrinh: [{ noiDung, nguoiTao: actor, ngayTao: new Date().toISOString(), lanDau: o.giaiTrinh.length === 0 }, ...o.giaiTrinh] } : o));
    returns = returns.map((r) => (r.id === id ? { ...r, giaiTrinh: [{ noiDung, nguoiTao: actor, ngayTao: new Date().toISOString(), lanDau: r.giaiTrinh.length === 0 }, ...r.giaiTrinh] } : r));
    emit();
  },
  createOrder(o: Order) {
    orders = [o, ...orders];
    emit();
  },

  advanceReturn(id: string, actor: string) {
    returns = returns.map((r) => {
      if (r.id !== id || r.trangThaiTraHang !== "Đang xử lý") return r;
      const idx = RETURN_STEPS.indexOf(r.buoc);
      const nextStep: ReturnStep = RETURN_STEPS[Math.min(idx + 1, RETURN_STEPS.length - 1)];
      const done = nextStep === "Đã duyệt" || nextStep === "Lên PXK (trả hàng)";
      return {
        ...r,
        buoc: nextStep,
        trangThaiTraHang: done ? "Hoàn thành" : "Đang xử lý",
        logs: [...r.logs, { trangThai: r.buoc, nguoiXuLy: actor, ngayXuLy: new Date().toISOString(), ghiChu: null }],
      };
    });
    emit();
  },
  stepBackReturn(id: string, actor: string) {
    returns = returns.map((r) => {
      if (r.id !== id) return r;
      const idx = RETURN_STEPS.indexOf(r.buoc);
      const prev: ReturnStep = RETURN_STEPS[Math.max(idx - 1, 0)];
      return { ...r, buoc: prev, trangThaiTraHang: "Đang xử lý", logs: [...r.logs, { trangThai: "Lùi bước → " + prev, nguoiXuLy: actor, ngayXuLy: new Date().toISOString(), ghiChu: null }] };
    });
    emit();
  },
  rejectReturn(id: string, actor: string, lyDo: string) {
    returns = returns.map((r) =>
      r.id === id ? { ...r, trangThaiTraHang: "Từ chối", logs: [...r.logs, { trangThai: "Từ chối", nguoiXuLy: actor, ngayXuLy: new Date().toISOString(), ghiChu: lyDo }] } : r,
    );
    emit();
  },

  markAllNotifRead() {
    notifications = notifications.map((n) => ({ ...n, chuaDoc: false }));
    emit();
  },
  markNotifRead(id: string) {
    notifications = notifications.map((n) => (n.id === id ? { ...n, chuaDoc: false } : n));
    emit();
  },
};
