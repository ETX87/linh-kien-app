// "Cần làm" tren Trang chu (v1.450, ra soat Trang chu 2026-11-07 — "lam ca 3 dot"): MOT nguon duy nhat = GET /notifications/count
// (computeDatMuaLkBreakdown, CUNG so voi badge menu ben trai). Truoc day may tinh doc /luong-quy-trinh, dien thoai doc /home-summary,
// menu doc /notifications/count -> 3 con so khac nhau, va 2 nguon dau con dem theo quy trinh cu (Tram/TBP/TN duyet - luon 0 tu khi tu
// dong duyet 100%) trong khi bo sot viec that (Ke toan xac nhan tien, chuyen tien cua minh, Cho mua hang, nhan thieu, nop tien quy...).
// Them viec moi: them truong o DatMuaLkBreakdown (backend notifications.ts) + 1 dong o day.
import type { JumpTarget } from "./types";
import { dichSau } from "../../i18n";

export interface DatMuaLkBadge {
  total: number;
  choTnDuyet?: number;
  choTnTraHang?: number;
  choTnTaoPxk?: number;
  choKhoThieuLk?: number;
  choKhoPxk?: number;
  choKhoTraHang?: number;
  choKeToanPxk?: number;
  choKeToanTien?: number;
  choKeToanTraHang?: number;
  choQcTraHang?: number;
  choTramDuyet?: number;
  choTpXacNhan?: number;
  choGsDuyet?: number;
  choDonCuaToi?: number;
  choDonBiTuChoi?: number;
  choTienCuaToi?: number;
  choNhanHangCuaToi?: number;
  thieuLkCanXuLy?: number;
  nhanThieuCanXuLy?: number;
  thieuHangBhCanXuLy?: number;
  yeuCauHuyCanXuLy?: number;
}

export interface NotifCounts {
  datMuaLk: DatMuaLkBadge;
  ktvLogChuaDoc: number;
  hoanTienCanXuLy?: number;
  nopTienCanXuLy?: number;
}

export interface ViecCanLam {
  key: string;
  label: string;
  count: number;
  /** Nhay trong module Dat mua linh kien. */
  jump?: JumpTarget;
  /** Viec o module khac (Quy & chuyen tien) - phat su kien window App.tsx dang nghe. */
  suKien?: string;
}

/** Danh sach viec > 0 cua nguoi dang xem, sap theo so luong giam dan. "Đơn bị từ chối" KHONG nam o day (the rieng mau do). */
export function danhSachViecCanLam(n: NotifCounts | undefined, email: string | undefined): ViecCanLam[] {
  if (!n) return [];
  const d = n.datMuaLk;
  const nhanThieu = d.nhanThieuCanXuLy ?? 0;
  const thb = d.thieuHangBhCanXuLy ?? 0;
  const thieuLk = Math.max(0, (d.thieuLkCanXuLy ?? 0) - nhanThieu - thb);
  const don = (filter: string, loaiDon = "all"): JumpTarget => ({ tab: "don-cua-toi", filter, loaiDon, nguoiNhanHang: "" });
  const pxk = (filter: string, nguoiNhanHang = ""): JumpTarget => ({ tab: "phieu-xuat-kho", filter, loaiDon: "", nguoiNhanHang });
  const rows: ViecCanLam[] = [
    { key: "yeu_cau_huy", label: dichSau("Yêu cầu hủy đơn chờ bạn đồng ý"), count: d.yeuCauHuyCanXuLy ?? 0, jump: don("__YEU_CAU_HUY__") },
    { key: "tien_cua_toi", label: dichSau("Chuyển tiền phiếu của tôi"), count: d.choTienCuaToi ?? 0, jump: pxk("CHO_TIEN", email) },
    { key: "nhan_hang_cua_toi", label: dichSau("Xác nhận đã nhận hàng"), count: d.choNhanHangCuaToi ?? 0, jump: pxk("Dang gui KTV", email) },
    { key: "don_cua_toi", label: dichSau("Đơn của tôi đang chờ duyệt"), count: d.choDonCuaToi ?? 0, jump: don("__OPEN__") },
    { key: "tram", label: dichSau("Trạm duyệt"), count: d.choTramDuyet ?? 0, jump: don("Cho Tram duyet") },
    { key: "tbp", label: dichSau("TBP duyệt LK đặc thù"), count: d.choTpXacNhan ?? 0, jump: don("Cho TBP xac nhan") },
    { key: "gs", label: dichSau("GS duyệt đơn vượt trần"), count: d.choGsDuyet ?? 0, jump: don("Cho GS duyet") },
    { key: "tn_duyet", label: dichSau("Chờ duyệt đơn"), count: d.choTnDuyet ?? 0, jump: don("Cho TN duyet") },
    { key: "tn_tao_pxk", label: dichSau("Phiếu chờ gửi kế toán"), count: d.choTnTaoPxk ?? 0, jump: pxk("Dang tao phieu") },
    { key: "kt_tien", label: dichSau("Xác nhận tiền KTV đã chuyển"), count: d.choKeToanTien ?? 0, jump: pxk("CHO_KT_TIEN") },
    { key: "kt_pxk", label: dichSau("Chờ mã MISA"), count: d.choKeToanPxk ?? 0, jump: pxk("Cho ke toan") },
    { key: "kho_pxk", label: dichSau("Kho chốt đơn xuất"), count: d.choKhoPxk ?? 0, jump: pxk("Da chot xong don xuat") },
    { key: "thieu_lk", label: dichSau("Thiếu hàng cần xử lý"), count: thieuLk, jump: { tab: "thieu-lk", filter: "__VIEC__" } },
    { key: "nhan_thieu", label: dichSau("KTV báo nhận thiếu"), count: nhanThieu, jump: { tab: "thieu-lk", filter: "__VIEC__" } },
    { key: "thieu_bh", label: dichSau("Thiếu hàng bảo hành"), count: thb, jump: { tab: "thieu-lk", filter: "__VIEC__" } },
    { key: "th_kt", label: dichSau("Trả hàng · Kế toán"), count: d.choKeToanTraHang ?? 0, jump: { tab: "tra-hang", filter: "Cho ke toan duyet mem" } },
    { key: "th_kho", label: dichSau("Trả hàng · Kho"), count: d.choKhoTraHang ?? 0, jump: { tab: "tra-hang", filter: "Cho kho xac nhan" } },
    { key: "th_qc", label: dichSau("Trả hàng · QC"), count: d.choQcTraHang ?? 0, jump: { tab: "tra-hang", filter: "Cho QC xac nhan" } },
    { key: "th_tn", label: dichSau("Trả hàng · TN"), count: d.choTnTraHang ?? 0, jump: { tab: "tra-hang", filter: "Cho TN duyet tong" } },
    { key: "nop_tien", label: dichSau("Nộp tiền vào quỹ chờ xác nhận"), count: n.nopTienCanXuLy ?? 0, suKien: "mo-nop-tien" },
    { key: "hoan_tien", label: dichSau("Phiếu hoàn tiền cần xử lý"), count: n.hoanTienCanXuLy ?? 0, suKien: "mo-phieu-hoan-tien" },
  ];
  return rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
}

/** Bam 1 viec: viec trong module -> onJump; viec o Quy & chuyen tien -> phat su kien App.tsx nghe (detail rong = chi mo tab). */
export function moViec(v: ViecCanLam, onJump: (t: JumpTarget) => void): void {
  if (v.suKien) window.dispatchEvent(new CustomEvent(v.suKien, { detail: "" }));
  else if (v.jump) onJump(v.jump);
}
