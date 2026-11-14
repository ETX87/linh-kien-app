import type { DonHangDraft } from "./types";

// "Tạo đơn giống đơn này" (chot 2026-11-14, v1.491 - "Thêm nút này ở các đơn đang có sẵn, KTV có thể ấn vào để tạo 1 đơn đặt hàng giống hệt
// đơn đang xem. (nếu đơn đó chưa có trong ds thì điền luôn linh kiện - nếu có trong ds đang tạo thì bỏ trống)").
// Chi tiet don (DonHangDetailModal) mo o RAT nhieu noi (Trang chu, Phieu xuat, Thieu hang, Quy, Hoi dap...) nen KHONG truyen prop: day
// 1 dong vao HANG CHO + phat su kien window. Form tao don dang mo (useTaoDonForm) tu lay hang cho -> them dong; khong co form nao dang mo
// -> TaoDonGiongHost (App.tsx) mo form, form vua mount tu lay hang cho.
export type DongTaoGiong = { draft: DonHangDraft; nguoiNhanHang?: string | null };

export const SU_KIEN_TAO_DON_GIONG = "tao-don-giong";
const hangCho: DongTaoGiong[] = [];
let soFormDangMo = 0;

export function guiTaoDonGiong(v: DongTaoGiong) {
  hangCho.push(v);
  window.dispatchEvent(new CustomEvent(SU_KIEN_TAO_DON_GIONG));
}

export function layHangChoTaoGiong(): DongTaoGiong[] {
  return hangCho.splice(0, hangCho.length);
}

export function coHangChoTaoGiong(): boolean {
  return hangCho.length > 0;
}

// Form tao don dang mo (dem, vi co the mo tu module Don hang lan tu App) - App chi tu mo form khi = 0.
export function dangKyFormTaoDon(): () => void {
  soFormDangMo++;
  return () => {
    soFormDangMo--;
  };
}

export function coFormTaoDonDangMo(): boolean {
  return soFormDangMo > 0;
}
