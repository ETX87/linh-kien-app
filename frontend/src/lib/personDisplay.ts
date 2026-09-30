import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

// Danh ba email -> ten hien thi DUNG CHUNG TOAN HE THONG (phan hoi 2026-08-19: "Toàn bộ hệ thống
// nếu tạo thông tin người dùng có tên => sẽ ưu tiên hiện tên dưới dạng Tên (mail). Riêng với
// KTV/Trạm/CTV sẽ hiện tên KTV (mail)"). Nguon: GET /api/auth/nguoi-directory (chi can dang nhap,
// khong gioi han theo vai_tro/module - khac GET /api/users (Admin-only) va endpoint KTV rieng cua
// module "Dat mua linh kien" (khoa theo requireDatMuaLkArea), ca 2 deu KHONG dung chung duoc cho
// moi module khac trong app).
export interface PersonDirectory {
  users: Map<string, string>;
  ktv: Map<string, string>;
}

export function usePersonDirectory(): PersonDirectory {
  const { data } = useQuery({
    queryKey: ["nguoi-directory"],
    queryFn: () => api.get<{ users: { email: string; ten: string }[]; ktv: { email: string; ten_hien_thi: string }[] }>("/auth/nguoi-directory"),
  });
  return {
    users: new Map((data?.users ?? []).map((r) => [r.email, r.ten])),
    ktv: new Map((data?.ktv ?? []).map((r) => [r.email, r.ten_hien_thi])),
  };
}

// Uu tien ten KTV (do CSKH/Admin bien tap rieng trong "Danh sách KTV đã khai báo", thuong sat thuc
// te hon ten Google) truoc ten users.ten (tu dong dien tu profile Google luc dang nhap) - CHOT theo
// dung yeu cau "Riêng với KTV/Trạm/CTV sẽ hiện tên KTV". Khong tim thay o ca 2 -> tra nguyen email.
// SUA (phan hoi 2026-09-12: "Tên user bỏ gmail phía sau (trường hợp không có tên mới hiện theo
// mail)") - truoc day LUON ghep "(email)" sau ten (ke ca khi da co ten that), gio CHI hien email khi
// khong tim duoc ten nao (fallback), khong con ghep kem sau ten that.
// CHOT 2026-09-30 thu tu: ten KTV (danh ba) -> ten MISA -> ten Google -> email. Backend /nguoi-directory da gop san
// (ktv = ten_hien_thi/ten_misa cua KTV, users = ten_misa/ten cua tai khoan) nen ham nay giu nguyen "ktv ?? users ??
// email". Ban SQL cung thu tu: backend/src/lib/tenNguoi.ts.
export function formatPersonDisplay(email: string | null | undefined, dir: PersonDirectory): string {
  if (!email) return "—";
  const ten = dir.ktv.get(email) ?? dir.users.get(email);
  return ten ?? email;
}

// File tai ve (2026-09-29, "dữ liệu tải về đang để người tạo và người nhận hàng = gmail => đổi thành tên (nếu ko có
// tên thì để gmail)"): doi moi cot NGUOI (khoa bat dau "nguoi_" hoac ket thuc "_nguoi_tao", gia tri la email) sang
// ten theo danh ba - khong co ten thi giu email. Cot khac giu nguyen.
export function doiNguoiThanhTen<T extends object>(rows: T[], dir: PersonDirectory): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...(row as unknown as Record<string, unknown>) };
    for (const [k, v] of Object.entries(out)) {
      if ((k.startsWith("nguoi_") || k.endsWith("_nguoi_tao")) && typeof v === "string" && v.includes("@")) {
        out[k] = formatPersonDisplay(v, dir);
      }
    }
    return out;
  });
}
