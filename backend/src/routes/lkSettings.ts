import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { requireQuanLyDanhMucLk } from "../middleware/requireQuanLyDanhMucLk";
import { nowVN } from "../lib/vnTime";
import { chuanMaCombo } from "../lib/lkCombo";
import { quyVeMaChuan } from "../lib/linhKienXetDuyet";

// Catalog "Dat mua linh kien": danh muc LK, nhom thay the, BOM tra cuu - xem migration
// 0054_lk_danh_muc.sql + 0055_lk_bom.sql. Doc mo cho moi user da duyet (dropdown tao don), ghi
// gioi han Admin (giong pattern settings.ts).
const lkSettings = new Hono<{ Bindings: Env }>();
lkSettings.use("*", verifySessionMiddleware, loadUser);
const adminOnly = requireRole("Admin");
// CHOT 2026-08-17: quyen ghi danh muc linh kien + nhom thay the gio la flag doc lap
// quan_ly_danh_muc_lk (xem middleware/requireQuanLyDanhMucLk.ts + migration 0082) - THAY THE
// requireRole("Admin","TBP DVBH","Giam sat") cu (Giai doan 5, 2026-08-14) vi da lech sau khi tach
// la_tac_nghiep khoi vai_tro o migration 0081. BOM import van giu adminOnly (ngoai pham vi chot).
const quanLyDanhMuc = requireQuanLyDanhMucLk;

// D1 batch/bind-param safety margin - xem lib/importProcessor.ts.
const CHUNK_SIZE_BATCH = 500;

// ---------- Danh muc linh kien ----------

// GET /api/lk-settings/danh-muc?since=<ISO-timestamp> - tra ve chi nhung LK co ngay_cap_nhat
// > since (incremental sync cho client cache). Neu khong co ?since thi tra ve tat ca.
lkSettings.get("/danh-muc", async (c) => {
  const since = c.req.query("since")?.trim();
  let query = "SELECT * FROM linh_kien";
  const binds: string[] = [];

  if (since) {
    query += " WHERE ngay_cap_nhat > ?";
    binds.push(since);
  }

  // Co ?since: "+ma_linh_kien" (2026-09-28, migration 0038) de SQLite KHONG di theo khoa chinh cho ORDER BY (quet ca
  // ~6000 dong) ma SEARCH theo idx_linh_kien_ngay_cap_nhat roi sap vai dong thay doi - FE poll ~900 lan/ngay.
  query += since ? " ORDER BY +ma_linh_kien" : " ORDER BY ma_linh_kien";
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json({ rows: results });
});

// CHOT 2026-09-12 (tich hop gia88 lam nguon chinh danh muc): bo han "gia_ban"/"gia_tham_chieu" khoi
// POST/PATCH cua route nay - gia_ban tro thanh "chi xem" (do gia88Sync.ts quan ly, xem
// routes/settingsDatMua.ts PATCH /linh-kien/:ma), gia_tham_chieu bi xoa cot (migration 0027).
lkSettings.post("/danh-muc", quanLyDanhMuc, async (c) => {
  const body = await c.req.json<{ ma_linh_kien: string; ten_linh_kien: string; don_vi?: string | null; ghi_chu?: string | null; anh_demo?: string | null; dac_thu?: boolean; chi_sua_chua?: boolean }>();
  if (!body.ma_linh_kien?.trim() || !body.ten_linh_kien?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  // Phan loai bat buoc (chot 2026-09-30, cung quy tac POST /settings/linh-kien).
  if (!body.don_vi?.trim()) return c.json({ error: "THIEU_PHAN_LOAI" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, don_vi, ghi_chu, anh_demo, dac_thu, chi_sua_chua, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ma_linh_kien) DO UPDATE SET
       ten_linh_kien = excluded.ten_linh_kien,
       don_vi = excluded.don_vi, ghi_chu = excluded.ghi_chu, anh_demo = excluded.anh_demo, dac_thu = excluded.dac_thu,
       chi_sua_chua = excluded.chi_sua_chua, nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat
     RETURNING *`,
  )
    .bind(body.ma_linh_kien.trim(), body.ten_linh_kien.trim(), body.don_vi?.trim() || null, body.ghi_chu?.trim() || null, body.anh_demo?.trim() || null, body.dac_thu ? 1 : 0, body.chi_sua_chua ? 1 : 0, user.email, nowVN())
    .first();

  return c.json(row, 201);
});

lkSettings.patch("/danh-muc/:ma", quanLyDanhMuc, async (c) => {
  const ma = c.req.param("ma");
  // "ten_linh_kien" cung chuyen "chi xem" tu 2026-09-12 (dong bo tu gia88) - route nay khong con nhan
  // truong do, giong het PATCH /settings/linh-kien/:ma.
  const body = await c.req.json<{ don_vi?: string | null; ghi_chu?: string | null; anh_demo?: string | null; bat_tat?: boolean; dac_thu?: boolean; chi_sua_chua?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const user = c.get("user");
  const next = {
    don_vi: body.don_vi !== undefined ? body.don_vi?.trim() || null : existing.don_vi,
    ghi_chu: body.ghi_chu !== undefined ? body.ghi_chu?.trim() || null : existing.ghi_chu,
    anh_demo: body.anh_demo !== undefined ? body.anh_demo?.trim() || null : existing.anh_demo,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    dac_thu: body.dac_thu !== undefined ? (body.dac_thu ? 1 : 0) : existing.dac_thu,
    chi_sua_chua: body.chi_sua_chua !== undefined ? (body.chi_sua_chua ? 1 : 0) : existing.chi_sua_chua,
  };

  await c.env.DB.prepare(
    "UPDATE linh_kien SET don_vi = ?, ghi_chu = ?, anh_demo = ?, bat_tat = ?, dac_thu = ?, chi_sua_chua = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?",
  )
    .bind(next.don_vi, next.ghi_chu, next.anh_demo, next.bat_tat, next.dac_thu, next.chi_sua_chua, user.email, nowVN(), ma)
    .run();

  return c.json({ ok: true });
});

// ---------- Nhom thay the ----------

lkSettings.get("/nhom-thay-the", async (c) => {
  const { results: nhoms } = await c.env.DB.prepare("SELECT * FROM lk_nhom_thay_the ORDER BY id").all();
  const { results: cts } = await c.env.DB.prepare("SELECT * FROM lk_nhom_thay_the_ct").all<{ nhom_id: number; ma_lk: string }>();

  const maLkByNhom = new Map<number, string[]>();
  for (const ct of cts) {
    const list = maLkByNhom.get(ct.nhom_id) ?? [];
    list.push(ct.ma_lk);
    maLkByNhom.set(ct.nhom_id, list);
  }

  const rows = (nhoms as Record<string, unknown>[]).map((n) => ({ ...n, ma_lk_list: maLkByNhom.get(n.id as number) ?? [] }));
  return c.json({ rows });
});

// POST /api/lk-settings/nhom-thay-the - { ten_nhom, ghi_chu?, ma_lk_list } tao moi (thay toan bo
// thanh vien trong 1 lan, khong PATCH tung dong - danh sach thanh vien thuong nho, don gian hon).
lkSettings.post("/nhom-thay-the", quanLyDanhMuc, async (c) => {
  const body = await c.req.json<{ ten_nhom: string; ghi_chu?: string | null; ma_lk_list: string[] }>();
  if (!body.ten_nhom?.trim() || !Array.isArray(body.ma_lk_list) || body.ma_lk_list.length === 0) {
    return c.json({ error: "MISSING_FIELDS" }, 400);
  }

  const user = c.get("user");
  const nhom = await c.env.DB.prepare(
    "INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?) RETURNING *",
  )
    .bind(body.ten_nhom.trim(), body.ghi_chu?.trim() || null, user.email, nowVN())
    .first<{ id: number }>();
  if (!nhom) return c.json({ error: "INSERT_FAILED" }, 500);

  await c.env.DB.batch(
    body.ma_lk_list.map((ma) => c.env.DB.prepare("INSERT INTO lk_nhom_thay_the_ct (nhom_id, ma_lk) VALUES (?, ?)").bind(nhom.id, ma)),
  );

  return c.json(nhom, 201);
});

lkSettings.patch("/nhom-thay-the/:id", quanLyDanhMuc, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ ten_nhom?: string; ghi_chu?: string | null; ma_lk_list?: string[] }>();
  const existing = await c.env.DB.prepare("SELECT * FROM lk_nhom_thay_the WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const user = c.get("user");
  const next = {
    ten_nhom: body.ten_nhom !== undefined ? body.ten_nhom.trim() : existing.ten_nhom,
    ghi_chu: body.ghi_chu !== undefined ? body.ghi_chu?.trim() || null : existing.ghi_chu,
  };

  await c.env.DB.prepare("UPDATE lk_nhom_thay_the SET ten_nhom = ?, ghi_chu = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?")
    .bind(next.ten_nhom, next.ghi_chu, user.email, nowVN(), id)
    .run();

  if (body.ma_lk_list !== undefined) {
    await c.env.DB.prepare("DELETE FROM lk_nhom_thay_the_ct WHERE nhom_id = ?").bind(id).run();
    if (body.ma_lk_list.length > 0) {
      await c.env.DB.batch(
        body.ma_lk_list.map((ma) => c.env.DB.prepare("INSERT INTO lk_nhom_thay_the_ct (nhom_id, ma_lk) VALUES (?, ?)").bind(id, ma)),
      );
    }
  }

  return c.json({ ok: true });
});

// GET /api/lk-settings/thay-the/:ma_lk - goi y ma LK khac cung nhom thay the voi :ma_lk (khong
// tra chinh :ma_lk). Dung o TaoDonTab khi chon 1 ma_lk - buoc 2 ke hoach "Luong tao don mua hang".
lkSettings.get("/thay-the/:ma_lk", async (c) => {
  const maLk = c.req.param("ma_lk").trim();
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT dm.ma_linh_kien, dm.ten_linh_kien, dm.gia_ban
     FROM lk_nhom_thay_the_ct ct
     JOIN linh_kien dm ON dm.ma_linh_kien = ct.ma_lk
     WHERE ct.nhom_id IN (SELECT nhom_id FROM lk_nhom_thay_the_ct WHERE ma_lk = ?)
       AND ct.ma_lk != ?
     ORDER BY dm.ma_linh_kien`,
  )
    .bind(maLk, maLk)
    .all();
  return c.json({ rows: results });
});

// ---------- BOM tra cuu ----------

lkSettings.get("/bom/lookup", async (c) => {
  const maModel = c.req.query("ma_model")?.trim();
  if (!maModel) return c.json({ error: "MISSING_MA_MODEL" }, 400);

  const { results } = await c.env.DB.prepare("SELECT ma_lk, ten_lk, so_luong FROM lk_bom WHERE ma_model = ? ORDER BY ma_lk").bind(maModel).all();
  return c.json({ rows: results });
});

interface BomImportRow {
  ma_model?: string;
  ma_lk?: string;
  ten_lk?: string;
  so_luong?: number;
}

// POST /api/lk-settings/bom/import - { rows, offset } xu ly 1 chunk (client tu chia file 39k dong
// va lap goi cho den done:true). Khong dung UPSERT (lk_bom khong co unique key tu nhien - 1
// (ma_model, ma_lk) co the xuat hien lai khi import lai) - client tu xoa du lieu cu qua rows=[]
// truoc neu can nap lai tu dau (xem "?reset=1").
lkSettings.post("/bom/import", adminOnly, async (c) => {
  const reset = c.req.query("reset") === "1";
  const body = await c.req.json<{ rows: BomImportRow[]; offset: number }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  if (reset && body.offset === 0) {
    await c.env.DB.prepare("DELETE FROM lk_bom").run();
  }

  const offset = Math.max(0, body.offset ?? 0);
  // Kieu lo (2026-10-03): client moi gui `rows` = CHINH lo + `total` (truoc gui lai ca file moi request); thieu total = kieu cu.
  const kieuLo = typeof (body as { total?: unknown }).total === "number";
  const total = kieuLo ? (body as { total?: number }).total! : body.rows.length;
  if (kieuLo && (body.rows.length > CHUNK_SIZE_BATCH * 2 || (body.rows.length === 0 && offset < total))) return c.json({ error: "LO_KHONG_HOP_LE" }, 400);
  const chunk = kieuLo ? body.rows : body.rows.slice(offset, offset + CHUNK_SIZE_BATCH);
  const now = nowVN();

  const valid = chunk
    .map((r) => ({
      ma_model: String(r.ma_model ?? "").trim(),
      ma_lk: String(r.ma_lk ?? "").trim(),
      ten_lk: r.ten_lk ? String(r.ten_lk).trim() : null,
      so_luong: Number(r.so_luong ?? 1) || 1,
    }))
    .filter((r) => r.ma_model && r.ma_lk);

  if (valid.length > 0) {
    await c.env.DB.batch(
      valid.map((v) =>
        c.env.DB.prepare("INSERT INTO lk_bom (ma_model, ma_lk, ten_lk, so_luong, ngay_import) VALUES (?, ?, ?, ?, ?)").bind(
          v.ma_model,
          v.ma_lk,
          v.ten_lk,
          v.so_luong,
          now,
        ),
      ),
    );
  }

  const nextOffset = offset + (kieuLo ? chunk.length : CHUNK_SIZE_BATCH);
  const done = nextOffset >= total;
  return c.json({ done, nextOffset: done ? total : nextOffset, processed: valid.length });
});

// ---------- Combo linh kien (migration 0066, lib/lkCombo.ts) ----------
// Doc mo cho moi user da duyet (o chon LK luc tao don hien combo); ghi = Quan ly danh muc LK / Mua hang / Admin.
const quanLyCombo = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const u = c.get("user");
  if (!u.quan_ly_danh_muc_lk && !u.la_mua_hang && u.vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});

// GET /api/lk-settings/combo - moi combo (ca dang tat) kem thanh phan theo stt (+ ten/gia/trang thai LK hien tai).
lkSettings.get("/combo", async (c) => {
  const [{ results: combos }, { results: ct }] = await Promise.all([
    c.env.DB.prepare("SELECT ma_combo, ten_combo, bat_tat, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat FROM lk_combo ORDER BY ten_combo").all<Record<string, unknown>>(),
    c.env.DB.prepare(
      `SELECT ct.ma_combo, ct.ma_lk, ct.so_luong, lk.ten_linh_kien AS ten_lk, lk.gia_ban, lk.gia_tri_cong_no, lk.bat_tat AS lk_bat_tat
       FROM lk_combo_ct ct LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ct.ma_lk ORDER BY ct.ma_combo, ct.stt, ct.ma_lk`,
    ).all<{ ma_combo: string } & Record<string, unknown>>(),
  ]);
  const theoCombo = new Map<string, Record<string, unknown>[]>();
  for (const r of ct) {
    const { ma_combo, ...rest } = r;
    if (!theoCombo.has(ma_combo)) theoCombo.set(ma_combo, []);
    theoCombo.get(ma_combo)!.push(rest);
  }
  return c.json({ rows: combos.map((cb) => ({ ...cb, ct: theoCombo.get(cb.ma_combo as string) ?? [] })) });
});

interface ComboBody { ma_combo?: string; ten_combo?: string; ghi_chu?: string | null; bat_tat?: boolean | number; ct?: { ma_lk?: string; so_luong?: number }[] }

// Kiem tra ten + thanh phan (quy ma da doi/gop ve ma chuan, ma phai co trong danh muc, khong trung, SL nguyen > 0).
async function kiemTraCombo(db: D1Database, body: ComboBody): Promise<{ error: string; ma_lk?: string } | { ten: string; ct: { ma_lk: string; so_luong: number }[] }> {
  const ten = body.ten_combo?.trim();
  if (!ten) return { error: "THIEU_TEN_COMBO" };
  const dong = (body.ct ?? []).map((r) => ({ ma_lk: String(r.ma_lk ?? "").trim(), so_luong: Number(r.so_luong ?? 1) })).filter((r) => r.ma_lk);
  if (dong.length === 0) return { error: "THIEU_THANH_PHAN" };
  const maChuan = await quyVeMaChuan(db, dong.map((r) => r.ma_lk));
  const ct: { ma_lk: string; so_luong: number }[] = [];
  for (const r of dong) {
    const ma = maChuan.get(r.ma_lk) ?? r.ma_lk;
    if (!Number.isInteger(r.so_luong) || r.so_luong <= 0) return { error: "SO_LUONG_KHONG_HOP_LE", ma_lk: ma };
    if (ct.some((x) => x.ma_lk === ma)) return { error: "TRUNG_THANH_PHAN", ma_lk: ma };
    ct.push({ ma_lk: ma, so_luong: r.so_luong });
  }
  const { results } = await db.prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ct.map((r) => r.ma_lk)))
    .all<{ ma_linh_kien: string }>();
  const coSan = new Set(results.map((r) => r.ma_linh_kien));
  const thieu = ct.find((r) => !coSan.has(r.ma_lk));
  if (thieu) return { error: "MA_LK_NOT_FOUND", ma_lk: thieu.ma_lk };
  return { ten, ct };
}

function lenhGhiThanhPhan(db: D1Database, ma: string, ct: { ma_lk: string; so_luong: number }[]) {
  return [
    db.prepare("DELETE FROM lk_combo_ct WHERE ma_combo = ?").bind(ma),
    ...ct.map((r, i) => db.prepare("INSERT INTO lk_combo_ct (ma_combo, ma_lk, so_luong, stt) VALUES (?, ?, ?, ?)").bind(ma, r.ma_lk, r.so_luong, i + 1)),
  ];
}

// POST /api/lk-settings/combo - tao combo. Ma combo khong doi duoc ve sau (don da tao giu nhan combo_ma theo ma).
lkSettings.post("/combo", quanLyCombo, async (c) => {
  const body = await c.req.json<ComboBody>();
  const ma = chuanMaCombo(body.ma_combo);
  if (!ma) return c.json({ error: "THIEU_MA_COMBO" }, 400);
  if (ma.length > 200) return c.json({ error: "MA_COMBO_QUA_DAI" }, 400);
  const kt = await kiemTraCombo(c.env.DB, body);
  if ("error" in kt) return c.json(kt, 400);
  if (await c.env.DB.prepare("SELECT 1 FROM lk_combo WHERE ma_combo = ?").bind(ma).first()) return c.json({ error: "MA_COMBO_DA_CO" }, 409);
  // Ma trung 1 LK DANG BAT -> o chon LK se co 2 muc cung ma, dat don khong biet la LK hay combo.
  if (await c.env.DB.prepare("SELECT 1 FROM linh_kien WHERE ma_linh_kien = ? AND bat_tat = 1").bind(ma).first())
    return c.json({ error: "MA_TRUNG_LINH_KIEN" }, 409);
  const user = c.get("user");
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO lk_combo (ma_combo, ten_combo, bat_tat, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(ma, kt.ten, body.bat_tat === false || body.bat_tat === 0 ? 0 : 1, body.ghi_chu?.trim() || null, user.email, nowVN()),
    ...lenhGhiThanhPhan(c.env.DB, ma, kt.ct),
  ]);
  return c.json({ ok: true, ma_combo: ma });
});

// PATCH /api/lk-settings/combo/:ma - sua ten/ghi chu/bat tat/thanh phan (gui ct = thay TOAN BO thanh phan).
lkSettings.patch("/combo/:ma", quanLyCombo, async (c) => {
  const ma = c.req.param("ma");
  const cu = await c.env.DB.prepare("SELECT ten_combo, ghi_chu, bat_tat FROM lk_combo WHERE ma_combo = ?").bind(ma)
    .first<{ ten_combo: string; ghi_chu: string | null; bat_tat: number }>();
  if (!cu) return c.json({ error: "NOT_FOUND" }, 404);
  const body = await c.req.json<ComboBody>();
  const stmts: D1PreparedStatement[] = [];
  let ten = cu.ten_combo;
  if (body.ct !== undefined) {
    const kt = await kiemTraCombo(c.env.DB, { ten_combo: body.ten_combo ?? cu.ten_combo, ct: body.ct });
    if ("error" in kt) return c.json(kt, 400);
    ten = kt.ten;
    stmts.push(...lenhGhiThanhPhan(c.env.DB, ma, kt.ct));
  } else if (body.ten_combo !== undefined) {
    if (!body.ten_combo.trim()) return c.json({ error: "THIEU_TEN_COMBO" }, 400);
    ten = body.ten_combo.trim();
  }
  const batTat = body.bat_tat === undefined ? cu.bat_tat : body.bat_tat === false || body.bat_tat === 0 ? 0 : 1;
  const ghiChu = body.ghi_chu === undefined ? cu.ghi_chu : body.ghi_chu?.trim() || null;
  const user = c.get("user");
  stmts.unshift(
    c.env.DB.prepare("UPDATE lk_combo SET ten_combo = ?, bat_tat = ?, ghi_chu = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_combo = ?")
      .bind(ten, batTat, ghiChu, user.email, nowVN(), ma),
  );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// DELETE /api/lk-settings/combo/:ma - xoa han combo (don da tao giu nguyen, van con nhan ma combo).
lkSettings.delete("/combo/:ma", quanLyCombo, async (c) => {
  const ma = c.req.param("ma");
  if (!(await c.env.DB.prepare("SELECT 1 FROM lk_combo WHERE ma_combo = ?").bind(ma).first())) return c.json({ error: "NOT_FOUND" }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM lk_combo_ct WHERE ma_combo = ?").bind(ma),
    c.env.DB.prepare("DELETE FROM lk_combo WHERE ma_combo = ?").bind(ma),
  ]);
  return c.json({ ok: true });
});

export default lkSettings;
