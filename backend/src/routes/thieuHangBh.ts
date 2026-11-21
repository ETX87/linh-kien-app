// THIEU HANG BAO HANH - man Kho / Mua hang xu ly ticket do app "Sua chua bao hanh" gui sang (2026-11-04, migration 0106, xem
// lib/thieuHangBh.ts). Router RIENG (khong dung requireDatMuaLkArea - middleware do chan ghi voi Mua hang chi doc).
//   Kho / TN / Admin: Tiep nhan (ngay du kien) | Chuyen Mua hang | Xac nhan hang da ve | Tu choi (bat buoc ly do).
//   Mua hang / Admin: Da dat hang (bat buoc ma EO, ngay du kien tuy chon tu v1.545) | Khong mua duoc (bat buoc ghi chu).
// Moi buoc day ngay ban tin ve suachua (waitUntil).
import { chuanNgayDuKien, loiNgayDuKien } from "../lib/ngayDuKien";
import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { THB_MO, THB_TRANG_THAI, docThb, pushThieuHangBhToSuachua, thbChuyenHopLe, thbGhiBuoc, type ThbRow } from "../lib/thieuHangBh";

const r = new Hono<{ Bindings: Env }>();
r.use("*", verifySessionMiddleware, loadUser);

type C = Context<{ Bindings: Env }>;
const laAdmin = (c: C) => c.get("user").vai_tro === "Admin";
const vaiKho = (c: C) => !!c.get("user").la_kho || !!c.get("user").la_tac_nghiep || laAdmin(c);
// "Viec cua toi" (2026-11-10): TN chi thao tac HO Kho (vaiKho) - khong dem / khong loc "Cần tôi xử lý" ticket cho Kho cho TN; chi Kho THAT + Admin.
const viecKho = (c: C) => !!c.get("user").la_kho || laAdmin(c);
const vaiMua = (c: C) => !!c.get("user").la_mua_hang || laAdmin(c);
const xemDuoc = (c: C) => vaiKho(c) || vaiMua(c) || !!c.get("user").la_ke_toan || !!c.get("user").la_view;

// GET /api/thieu-hang-bh?trang_thai=can_xu_ly|mo|tat_ca|<trang thai>&q=&mien=&page=
r.get("/", async (c) => {
  if (!xemDuoc(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const tt = c.req.query("trang_thai") || "can_xu_ly";
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const mien = c.req.query("mien") ?? "";
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const pageSize = 30;
  const canXuLy = [...(viecKho(c) ? ["Cho kho xu ly"] : []), ...(vaiMua(c) ? ["Cho mua hang"] : [])];
  const where: string[] = [];
  const binds: unknown[] = [];
  const base: string[] = [];
  const baseBinds: unknown[] = [];
  if (mien === "MB" || mien === "MN") {
    base.push("mien = ?");
    baseBinds.push(mien);
  } else if (mien === "__none__") base.push("mien IS NULL");
  if (q) {
    base.push(
      "(LOWER(id) LIKE ? OR LOWER(nguon_id) LIKE ? OR LOWER(ma_lk) LIKE ? OR LOWER(COALESCE(ten_lk,'')) LIKE ? OR LOWER(COALESCE(case_id,'')) LIKE ? OR LOWER(COALESCE(ktv_ten,'')) LIKE ? OR LOWER(COALESCE(ma_eo_mua,'')) LIKE ?)",
    );
    for (let i = 0; i < 7; i++) baseBinds.push(`%${q}%`);
  }
  where.push(...base);
  binds.push(...baseBinds);
  if (tt === "can_xu_ly") {
    if (!canXuLy.length) where.push("0");
    else {
      where.push(`trang_thai IN (${canXuLy.map(() => "?").join(",")})`);
      binds.push(...canXuLy);
    }
  } else if (tt === "mo") {
    where.push(`trang_thai IN (${THB_MO.map(() => "?").join(",")})`);
    binds.push(...THB_MO);
  } else if (tt.includes(",")) {
    // Nhom trang thai (v1.455, cot trang thai ben trai - "Chờ Kho" = "Cho kho xu ly,Kho da tiep nhan"...): chi nhan trang thai hop le.
    const ds = tt.split(",").filter((x) => (THB_TRANG_THAI as readonly string[]).includes(x));
    if (!ds.length) where.push("0");
    else {
      where.push(`trang_thai IN (${ds.map(() => "?").join(",")})`);
      binds.push(...ds);
    }
  } else if ((THB_TRANG_THAI as readonly string[]).includes(tt)) {
    where.push("trang_thai = ?");
    binds.push(tt);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const wb = base.length ? `WHERE ${base.join(" AND ")}` : "";
  const db = c.env.DB;
  const [list, tong, dem] = await Promise.all([
    db
      .prepare(`SELECT t.*, u.ten AS nguoi_xu_ly_ten FROM thieu_hang_bh t LEFT JOIN users u ON u.email = t.nguoi_xu_ly ${w} ORDER BY t.ngay_tao DESC, t.id DESC LIMIT ? OFFSET ?`)
      .bind(...binds, pageSize, (page - 1) * pageSize)
      .all<ThbRow>(),
    db.prepare(`SELECT COUNT(*) AS n FROM thieu_hang_bh ${w}`).bind(...binds).first<{ n: number }>(),
    db.prepare(`SELECT trang_thai, COUNT(*) AS n FROM thieu_hang_bh ${wb} GROUP BY trang_thai`).bind(...baseBinds).all<{ trang_thai: string; n: number }>(),
  ]);
  const counts: Record<string, number> = {};
  for (const x of dem.results) counts[x.trang_thai] = x.n;
  return c.json({
    data: list.results,
    total: tong?.n ?? 0,
    page,
    pageSize,
    counts,
    can_xu_ly: canXuLy.reduce((s, k) => s + (counts[k] ?? 0), 0),
    // vai = viec CUA MINH (khung "Cần tôi xử lý"); quyen bam nut van theo vaiKho / vaiMua (chi tiet ticket).
    vai: { kho: viecKho(c), mua_hang: vaiMua(c) },
  });
});

// GET /api/thieu-hang-bh/:id - chi tiet + lich su
r.get("/:id", async (c) => {
  if (!xemDuoc(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const [row] = await docThb(c.env.DB, [id]);
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const { results: log } = await c.env.DB
    .prepare(
      `SELECT l.*, u.ten AS nguoi_ten FROM thieu_hang_bh_log l LEFT JOIN users u ON u.email = l.nguoi_xu_ly WHERE l.thieu_hang_bh_id = ? ORDER BY l.id DESC`,
    )
    .bind(id)
    .all();
  return c.json({ ticket: row, log, vai: { kho: vaiKho(c), mua_hang: vaiMua(c) } });
});

// POST /api/thieu-hang-bh/:id/log - { trang_thai, ghi_chu?, ngay_du_kien?, ma_eo_mua? }
r.post("/:id/log", async (c) => {
  const body = await c.req
    .json<{ trang_thai?: string; ghi_chu?: string; ngay_du_kien?: string; ma_eo_mua?: string }>()
    .catch(() => ({}) as { trang_thai?: string; ghi_chu?: string; ngay_du_kien?: string; ma_eo_mua?: string });
  const id = c.req.param("id");
  const den = body.trang_thai ?? "";
  const ghiChu = (body.ghi_chu ?? "").trim().slice(0, 1000);
  const ngay = chuanNgayDuKien(body.ngay_du_kien);
  const eo = (body.ma_eo_mua ?? "").trim().slice(0, 80);
  if (ngay && !/^\d{4}-\d{2}-\d{2}$/.test(ngay)) return c.json({ error: "INVALID_NGAY" }, 400);
  const loiNgay = loiNgayDuKien(ngay);
  if (loiNgay) return c.json({ error: loiNgay }, 400);
  const row = await c.env.DB.prepare("SELECT trang_thai FROM thieu_hang_bh WHERE id = ?").bind(id).first<{ trang_thai: string }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (!thbChuyenHopLe(row.trang_thai, den, { kho: vaiKho(c), muaHang: vaiMua(c) })) return c.json({ error: "INVALID_TRANSITION", trang_thai: row.trang_thai }, 400);
  if ((den === "Kho tu choi" || den === "Mua hang tu choi") && !ghiChu) return c.json({ error: "MISSING_LY_DO_TU_CHOI" }, 400);
  if (den === "Mua hang da dat") {
    if (!eo) return c.json({ error: "THIEU_MA_EO" }, 400);
  }
  const ok = await thbGhiBuoc(c.env.DB, id, row.trang_thai, den, c.get("user").email, {
    ghi_chu: ghiChu || null,
    ...(ngay ? { ngay_du_kien: ngay } : {}),
    ...(den === "Mua hang da dat" ? { ma_eo_mua: eo } : {}),
  });
  if (!ok) return c.json({ error: "STATE_CHANGED" }, 409);
  c.executionCtx.waitUntil(pushThieuHangBhToSuachua(c.env, [id]));
  const [ticket] = await docThb(c.env.DB, [id]);
  return c.json({ ok: true, ticket });
});

export default r;
