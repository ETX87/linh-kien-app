import { ApiError } from "../api/client";
import { t } from "../i18n";

// Han muc anh tai len/ngay (2026-10-09, backend lib/anhUpload.ts): 20 anh/ngay, Ke toan/Tac nghiep/Giam sat 100, Admin khong
// gioi han. Moi upload thanh cong tra `han_muc_anh` {da_dung, han_muc} (null = khong gioi han).
export interface HanMucAnh {
  da_dung: number;
  han_muc: number;
}

const THOI_GIAN_CANH_BAO = 8000;

// Goi sau MOI lan tai anh thanh cong - vua dung het han muc thi canh bao (anh tiep theo se bi chan toi ngay mai).
export function canhBaoHanMucAnh(h: HanMucAnh | null | undefined, addToast: (msg: string, ms?: number) => void) {
  if (h && h.da_dung >= h.han_muc) {
    addToast(t("⚠ Bạn đã dùng hết {n}/{n} ảnh được tải hôm nay - ảnh tiếp theo sẽ bị chặn tới ngày mai", { n: h.han_muc }), THOI_GIAN_CANH_BAO);
  }
}

// Loi het luot (429 QUA_SO_ANH_NGAY) -> cau canh bao kem dung han muc cua tai khoan; null = loi khac.
export function loiHetHanMucAnh(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.code !== "QUA_SO_ANH_NGAY") return null;
  const n = Number(err.body?.han_muc);
  return n > 0
    ? t("⚠ Đã hết hạn mức {n} ảnh/ngày của tài khoản - ngày mai mới tải tiếp được", { n })
    : t("⚠ Đã hết hạn mức tải ảnh hôm nay - ngày mai mới tải tiếp được");
}

// Import hang loat (backend chi bao co `het_han_muc_anh`, khong kem so) - cau chung.
export function loiHetHanMucAnhTuMa(): string {
  return t("⚠ Đã hết hạn mức tải ảnh hôm nay - ngày mai mới tải tiếp được");
}

// Bao loi tai anh: het han muc -> canh bao (hien lau), loi khac -> "Loi tai anh: ..." nhu cu.
export function baoLoiTaiAnh(err: unknown, addToast: (msg: string, ms?: number) => void, moTaLoi: (e: unknown) => string) {
  const het = loiHetHanMucAnh(err);
  if (het) addToast(het, THOI_GIAN_CANH_BAO);
  else addToast(t("Lỗi tải ảnh: ") + moTaLoi(err));
}
