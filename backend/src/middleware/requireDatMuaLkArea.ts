import type { Context, Next } from "hono";
import type { Env } from "../types";

// Port rut gon tu he DVBH goc (backend/src/middleware/requireDatMuaLkArea.ts +
// lib/moduleAccess.ts canAccessDatMuaLkArea()) - he nay KHONG co co che "users.modules" tuy chinh
// theo tung tai khoan (khong can, vi day la toan bo he thong chi phuc vu 1 mien nghiep vu duy nhat),
// nen dieu kien rut gon con dung phan role-flag/vai_tro truc tiep.
export async function requireDatMuaLkArea(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get("user");
  const allowed =
    user.vai_tro === "Admin" ||
    user.vai_tro === "QC" ||
    user.vai_tro === "Giam sat" ||
    user.la_ktv_dvbh ||
    user.la_ve_tinh ||
    user.la_kho ||
    user.la_ke_toan ||
    user.la_tac_nghiep ||
    user.la_tp_dvbh;
  if (!allowed) return c.json({ error: "MODULE_NOT_ALLOWED" }, 403);
  await next();
}
