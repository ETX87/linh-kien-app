import { t } from "../i18n";

// Nen anh phia trinh duyet truoc khi upload (phan hoi 2026-08-24: "thêm cơ chế nén ảnh mà không giảm
// chất lượng ảnh") - dung Canvas API co san (khong can them thu vien nao, khac backend Workers KHONG
// co bo giai ma/nen anh native). Gioi han canh dai nhat ~2000px (mat thuong khong phan biet duoc so
// voi anh goc khi xem tren man hinh, nhung dung luong giam manh - anh camera dien thoai thuong
// 3000-4000px) + xuat JPEG chat luong cao (92%) giu chi tiet thi giac. Chi dung cho anh tra hang
// (TraHangAnhPicker trong SharedUi.tsx, QcTuChoiModal trong TraHangTab.tsx) - anh minh hoa linh kien
// (Danh muc linh kien) la luong khac, khong yeu cau nen.
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.92;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // SVG/GIF dong hoa - ve len canvas se "phang" ve 1 khung hinh tinh, mat hoat hoa/vector - bo qua,
  // giu nguyen file goc de khong pha hong dinh dang.
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    // Chi dung ban nen NEU thuc su nho hon file goc (phong truong hop anh da nen san/kich thuoc nho -
    // tranh nen "nguoc" lam to file hon).
    if (!blob || blob.size >= file.size) return file;

    const nameNoExt = file.name.replace(/\.[^./\\]+$/, "") || "anh";
    return new File([blob], `${nameNoExt}.jpg`, { type: "image/jpeg" });
  } catch {
    // Trinh duyet khong giai ma duoc (vd 1 so dinh dang HEIC hiem) - upload thang file goc, khong
    // chan luong tao/xu ly don vi loi nen thuan tuy o buoc phu nay.
    return file;
  }
}

// Gioi han server (2026-10-08, backend lib/anhUpload.ts): moi anh <= 10MB. Anh lon hon -> tu nen (ke ca khi nguoi dung
// tat "nen anh"), nen roi van qua -> bao loi ngay, khong gui len (tranh tai 20MB roi moi bi tu choi).
export const ANH_TOI_DA_BYTE = 10 * 1024 * 1024;
export async function anhVuaGioiHan(file: File): Promise<File> {
  if (file.size <= ANH_TOI_DA_BYTE) return file;
  const nen = await compressImage(file);
  if (nen.size > ANH_TOI_DA_BYTE) throw new Error(t("Ảnh tối đa 10MB"));
  return nen;
}
