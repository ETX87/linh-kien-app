import type { Context, Next } from "hono";
import type { Env } from "../types";

// Port rut gon tu he DVBH goc (backend/src/middleware/requireDatMuaLkArea.ts +
// lib/moduleAccess.ts canAccessDatMuaLkArea()) - he nay KHONG co co che "users.modules" tuy chinh
// theo tung tai khoan (khong can, vi day la toan bo he thong chi phuc vu 1 mien nghiep vu duy nhat),
// nen dieu kien rut gon con dung phan role-flag/vai_tro truc tiep.
export async function requireDatMuaLkArea(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get("user");
  // "allowedWithoutView" - moi dieu kien cu (KHONG doi) - dung lai de biet 1 tai khoan co quyen vao
  // module qua con duong nao KHAC la_view hay khong (xem nhanh chan ghi ben duoi).
  const allowedWithoutView =
    user.vai_tro === "Admin" ||
    user.vai_tro === "QC" ||
    user.vai_tro === "Giam sat" ||
    user.la_ktv_dvbh ||
    user.la_ve_tinh ||
    user.la_kho ||
    user.la_ke_toan ||
    user.la_tac_nghiep ||
    user.la_tp_dvbh;
  // "Mua hang" (2026-09-30, migration 0053): xem TOAN BO module (khong gioi han Khu vuc nhu la_view), CHI DOC - ghi
  // duy nhat o /api/settings/linh-kien (xet duyet ma LK, router rieng khong qua middleware nay).
  const chiDoc = !allowedWithoutView && (user.la_view || user.la_mua_hang);
  if (!allowedWithoutView && !chiDoc) return c.json({ error: "MODULE_NOT_ALLOWED" }, 403);
  // "View" (them 2026-08-26, xac nhan nguoi dung: "view thấy theo khu vực được set") - CHI doc, chan
  // NGAY O DAY moi request khong phai GET neu la_view la con duong DUY NHAT dua ho vao module (tranh
  // phai ra soat tung endpoint POST/PATCH/DELETE rieng le trong 3 router dung middleware nay - datMuaLinhKien.ts/
  // phieuXuatKho.ts/traHang.ts). Neu tai khoan co ca la_view LAN 1 co khac (vd la_kho), van duoc ghi
  // binh thuong theo quyen cua co kia.
  if (chiDoc && c.req.method !== "GET") {
    return c.json({ error: "VIEW_READONLY" }, 403);
  }
  await next();
}
