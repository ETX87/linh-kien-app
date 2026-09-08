import { Hono } from "hono";
import type { Env } from "../types";

// Khovan (he Quan ly hang ve kho) goi vao day khi Kho quet ma 1 PXK da duoc bao truoc
// (xem lib/khovanPushClient.ts) - lay thong tin MOI NHAT (nguoi nhan hang, loai_don) de
// tu dien form/xac dinh dung nhanh hanh dong (xuat thuong vs tra hang) ben khovan. Xac
// thuc bang 1 secret dung chung don gian (X-Khovan-Key), cung khuon voi repo
// gui-bao-hanh-linh-kien (routes/khovanLookup.ts).
const khovanLookup = new Hono<{ Bindings: Env }>();

khovanLookup.use("*", async (c, next) => {
  const key = c.req.header("X-Khovan-Key");
  if (!key || !c.env.KHOVAN_LOOKUP_API_KEY || key !== c.env.KHOVAN_LOOKUP_API_KEY) {
    return c.json({ error: "INVALID_KEY" }, 401);
  }
  await next();
});

khovanLookup.get("/:id", async (c) => {
  const id = c.req.param("id");
  const pxk = await c.env.DB.prepare("SELECT loai_don, nguoi_nhan_hang FROM phieu_xuat_kho WHERE id = ?")
    .bind(id)
    .first<{ loai_don: string | null; nguoi_nhan_hang: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);

  return c.json({
    sender_name: `Xuất kho ${id}` + (pxk.nguoi_nhan_hang ? ` (giao ${pxk.nguoi_nhan_hang})` : ""),
    loai_don: pxk.loai_don,
  });
});

export default khovanLookup;
