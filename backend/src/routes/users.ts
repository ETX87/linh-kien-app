import { Hono } from "hono";
import type { Env, VaiTro } from "../types";
import { VAI_TRO_VALUES } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { bumpVersions } from "../lib/dataVersions";
import { nowVN } from "../lib/vnTime";

// Port rut gon tu backend/src/routes/users.ts cua he DVBH goc - bo cac truong khong con ton tai o
// he nay (khu_vuc_phu_trach, la_ksnb_doi_tac, modules, co_the_import_tranh_chap - xem types.ts).
// Vai tro o he nay CHI con Admin/QC/Giam sat + 6 co vai tro nghiep vu (la_ktv_dvbh...la_tp_dvbh) -
// KHONG con nhom "CSKH/TN CSKH/TBP CSKH" nen bo luon logic auto-derive xem_danh_muc_lk theo nhom do.
const users = new Hono<{ Bindings: Env }>();
users.use("*", verifySessionMiddleware, loadUser, requireRole("Admin"));

// GET /api/users?tab=cho-duyet|da-duyet&search=&vai_tro=
users.get("/", async (c) => {
  const tab = c.req.query("tab") ?? "cho-duyet";
  const search = c.req.query("search")?.trim();
  const vaiTro = c.req.query("vai_tro")?.trim();

  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (tab === "cho-duyet") {
    conditions.push("trang_thai_duyet = ?");
    binds.push("Cho duyet");
  } else {
    conditions.push("trang_thai_duyet != 'Cho duyet'");
  }

  if (search) {
    conditions.push("(LOWER(email) LIKE LOWER(?) OR LOWER(COALESCE(ten,'')) LIKE LOWER(?))");
    binds.push(`%${search}%`, `%${search}%`);
  }
  if (vaiTro && (VAI_TRO_VALUES as readonly string[]).includes(vaiTro)) {
    conditions.push("vai_tro = ?");
    binds.push(vaiTro);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { results } = await c.env.DB.prepare(`SELECT * FROM users ${where} ORDER BY created_at DESC`).bind(...binds).all();
  return c.json({ rows: results });
});

// GET /api/users/login-log?email=&page=&pageSize=
users.get("/login-log", async (c) => {
  const email = c.req.query("email")?.trim();
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const whereSql = email ? " WHERE email = ?" : " WHERE thoi_gian >= datetime('now', '-90 days')";
  const binds = email ? [email] : [];

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM login_log${whereSql}`).bind(...binds).first<{ total: number }>();
  const offset = (page - 1) * pageSize;
  const { results } = await c.env.DB.prepare(`SELECT * FROM login_log${whereSql} ORDER BY thoi_gian DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// PATCH /api/users/:email - duyet/tu choi/doi vai tro + role-flag.
users.patch("/:email", async (c) => {
  const email = decodeURIComponent(c.req.param("email"));
  const body = await c.req.json<{
    trang_thai_duyet?: "Da duyet" | "Tu choi";
    vai_tro?: VaiTro | null;
    bi_khoa?: boolean;
    la_ktv_dvbh?: boolean;
    la_ve_tinh?: boolean;
    la_kho?: boolean;
    la_ke_toan?: boolean;
    la_tac_nghiep?: boolean;
    la_tp_dvbh?: boolean;
    quan_ly_danh_muc_lk?: boolean;
    xem_danh_muc_lk?: boolean;
    tram_cha?: string | null;
    giam_sat_quan_ly?: string | null;
  }>();

  if (body.vai_tro !== undefined && body.vai_tro !== null && !(VAI_TRO_VALUES as readonly string[]).includes(body.vai_tro)) {
    return c.json({ error: "INVALID_VAI_TRO" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = {
    trang_thai_duyet: body.trang_thai_duyet ?? existing.trang_thai_duyet,
    vai_tro: body.vai_tro !== undefined ? body.vai_tro : (existing.vai_tro as VaiTro | null),
    bi_khoa: body.bi_khoa !== undefined ? (body.bi_khoa ? 1 : 0) : existing.bi_khoa,
    la_ktv_dvbh: body.la_ktv_dvbh !== undefined ? (body.la_ktv_dvbh ? 1 : 0) : existing.la_ktv_dvbh,
    la_ve_tinh: body.la_ve_tinh !== undefined ? (body.la_ve_tinh ? 1 : 0) : existing.la_ve_tinh,
    la_kho: body.la_kho !== undefined ? (body.la_kho ? 1 : 0) : existing.la_kho,
    la_ke_toan: body.la_ke_toan !== undefined ? (body.la_ke_toan ? 1 : 0) : existing.la_ke_toan,
    la_tac_nghiep: body.la_tac_nghiep !== undefined ? (body.la_tac_nghiep ? 1 : 0) : existing.la_tac_nghiep,
    la_tp_dvbh: body.la_tp_dvbh !== undefined ? (body.la_tp_dvbh ? 1 : 0) : existing.la_tp_dvbh,
    quan_ly_danh_muc_lk: body.quan_ly_danh_muc_lk !== undefined ? (body.quan_ly_danh_muc_lk ? 1 : 0) : existing.quan_ly_danh_muc_lk,
    xem_danh_muc_lk: body.xem_danh_muc_lk !== undefined ? (body.xem_danh_muc_lk ? 1 : 0) : existing.xem_danh_muc_lk,
    tram_cha: body.tram_cha !== undefined ? (body.tram_cha ?? null) : existing.tram_cha,
    giam_sat_quan_ly: body.giam_sat_quan_ly !== undefined ? (body.giam_sat_quan_ly ?? null) : existing.giam_sat_quan_ly,
  };

  await c.env.DB.prepare(
    "UPDATE users SET trang_thai_duyet = ?, vai_tro = ?, bi_khoa = ?, la_ktv_dvbh = ?, la_ve_tinh = ?, la_kho = ?, la_ke_toan = ?, la_tac_nghiep = ?, la_tp_dvbh = ?, quan_ly_danh_muc_lk = ?, xem_danh_muc_lk = ?, tram_cha = ?, giam_sat_quan_ly = ?, updated_at = ? WHERE email = ?",
  )
    .bind(
      next.trang_thai_duyet,
      next.vai_tro,
      next.bi_khoa,
      next.la_ktv_dvbh,
      next.la_ve_tinh,
      next.la_kho,
      next.la_ke_toan,
      next.la_tac_nghiep,
      next.la_tp_dvbh,
      next.quan_ly_danh_muc_lk,
      next.xem_danh_muc_lk,
      next.tram_cha,
      next.giam_sat_quan_ly,
      nowVN(),
      email,
    )
    .run();

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["users"]));
  return c.json({ ok: true });
});

export default users;
