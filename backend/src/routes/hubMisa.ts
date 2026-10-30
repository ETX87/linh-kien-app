import { Hono, type Context, type Next } from "hono";
import type { Env } from "../types";
import { khoaKhop } from "../lib/baoVe";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { coCauHinhHub, docNguonTonKho, doiChieuBong, keoTonKhoTuHub, metaHub, type NguonTonKho } from "../lib/hubMisa";

// Ton kho tu app "Phan tich ton kho 3T" (kho du lieu MISA goc) - xem lib/hubMisa.ts.
//  POST /thong-bao  : app do bao "co phien ton moi" (Service Binding, X-Sync-Key = HUB_SYNC_KEY) -> keo ngay (nen).
//  GET  /trang-thai : Admin / Ke toan - nguon dang dung, phien ben app do, lan keo cuoi, doi chieu bang bong.
//  PUT  /nguon      : Admin - doi cong tac file | hub_thu | hub.
//  POST /keo-ngay   : Admin / Ke toan.
const hubMisa = new Hono<{ Bindings: Env }>();

hubMisa.post("/thong-bao", async (c) => {
  if (!(await khoaKhop(c.req.header("X-Sync-Key"), c.env.HUB_SYNC_KEY))) return c.json({ error: "INVALID_KEY" }, 401);
  c.executionCtx.waitUntil(keoTonKhoTuHub(c.env, { ctx: c.executionCtx }).then(() => undefined).catch((e) => console.error("[keoTonKhoTuHub]", e)));
  return c.json({ ok: true }, 202);
});

const adminOrKeToan = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const u = c.get("user");
  if (u.vai_tro !== "Admin" && !u.la_ke_toan) return c.json({ error: "FORBIDDEN" }, 403);
  await next();
};

hubMisa.use("/trang-thai", verifySessionMiddleware, loadUser, adminOrKeToan);
hubMisa.use("/keo-ngay", verifySessionMiddleware, loadUser, adminOrKeToan);
hubMisa.use("/nguon", verifySessionMiddleware, loadUser);

hubMisa.get("/trang-thai", async (c) => {
  const db = c.env.DB;
  const [nguon, keo, meta] = await Promise.all([
    docNguonTonKho(db),
    db.prepare("SELECT value, updated_at FROM app_settings WHERE key = 'hub_ton_kho_keo'").first<{ value: string; updated_at: string }>(),
    db.prepare("SELECT value, updated_by, updated_at FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ value: string; updated_by: string; updated_at: string }>(),
  ]);
  let hub: unknown = null;
  if (coCauHinhHub(c.env)) {
    try {
      hub = await metaHub(c.env);
    } catch (e) {
      hub = { loi: String((e as Error)?.message ?? e) };
    }
  }
  return c.json({
    nguon,
    da_cau_hinh: coCauHinhHub(c.env),
    hub,
    lan_keo: keo ? { ...JSON.parse(keo.value), luc: keo.updated_at } : null,
    ton_hien_tai: meta ? { ...JSON.parse(meta.value), updated_by: meta.updated_by, updated_at: meta.updated_at } : null,
    doi_chieu: nguon === "hub_thu" ? await doiChieuBong(db) : null,
  });
});

hubMisa.put("/nguon", async (c) => {
  if (c.get("user").vai_tro !== "Admin") return c.json({ error: "FORBIDDEN" }, 403);
  const b = await c.req.json<{ nguon?: NguonTonKho }>();
  if (!b.nguon || !["file", "hub_thu", "hub"].includes(b.nguon)) return c.json({ error: "INVALID_NGUON" }, 400);
  await c.env.DB.prepare(
    "INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('nguon_ton_kho', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
  )
    .bind(b.nguon, c.get("user").email, nowVN())
    .run();
  return c.json({ ok: true });
});

hubMisa.post("/keo-ngay", async (c) => c.json(await keoTonKhoTuHub(c.env, { epBuoc: true, ctx: c.executionCtx })));

export default hubMisa;
