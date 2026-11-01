import { Hono } from "hono";
import { laUrlHttp } from "../lib/anhUpload";
import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { requireQuanLyDanhMucLk } from "../middleware/requireQuanLyDanhMucLk";
import { nowVN } from "../lib/vnTime";
import { chuanMaCombo } from "../lib/lkCombo";
import { quyVeMaChuan } from "../lib/linhKienXetDuyet";
import { computeTonKhoChot } from "../lib/tonKhoCongTy";

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
  if (body.anh_demo?.trim() && !laUrlHttp(body.anh_demo.trim())) return c.json({ error: "INVALID_URL" }, 400);
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
  if (body.anh_demo?.trim() && !laUrlHttp(body.anh_demo.trim())) return c.json({ error: "INVALID_URL" }, 400);
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

// ---------- Nhom thay the (chot 2026-10-19, migration 0092 - "chuyển hẳn sang app") ----------
// Bang lk_nhom_thay_the + lk_nhom_thay_the_ct la nguon DUY NHAT (tab "Linh kiện thay thế" Bang gia, goi y luc tao don, drawer LK
// "Liên quan", API doi tac /v1/lk-thay-the + linh-kien/chi-tiet). Truoc 2026-10-19 man hinh doc Google Sheet, bang rong.
// Doc: moi user da dang nhap. Ghi (them/sua/xoa nhom, them/bot ma): nguoi co quyen sua linh kien = Quan ly danh muc LK / Mua hang /
// Admin + Kho / Ke toan / Giam sat (chot 2026-10-22, v1.390 - "xây dựng công cụ để kho, hoặc kế toán, giám sát cho phép tạo, sửa,
// thay đổi các danh sách linh kiện tương đương"; ban sao FE coQuyenSuaThayThe o frontend/src/lib/quyenThayThe.ts). Thanh vien CHUA co trong danh muc (nhap tu Sheet)
// van giu duoc khi sua nhom; ma MOI them vao phai co trong danh muc (ma 'Da doi ma' tu quy ve ma chuan).
const suaThayThe = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const u = c.get("user");
  if (!u.quan_ly_danh_muc_lk && !u.la_mua_hang && !u.la_kho && !u.la_ke_toan && u.vai_tro !== "Admin" && u.vai_tro !== "Giam sat") {
    return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  }
  await next();
});
const TOI_DA_THANH_VIEN = 100;

interface ThanhVienGui {
  ma_lk?: unknown;
  ghi_chu?: unknown;
}
interface BodyNhomThayThe {
  ten_nhom?: string;
  ghi_chu?: string | null;
  thanh_vien?: ThanhVienGui[];
  ma_lk_list?: string[]; // kieu cu (nut "+ Thêm vào nhóm thay thế" o form tao don) - chi ma, khong ghi chu
}

// GET /api/lk-settings/nhom-thay-the - moi nhom kem thanh vien (ten/gia/trang thai theo danh muc hien tai, ten luc them neu ma chua co).
lkSettings.get("/nhom-thay-the", async (c) => {
  const { results: nhoms } = await c.env.DB.prepare(
    "SELECT id, ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat FROM lk_nhom_thay_the ORDER BY ten_nhom COLLATE NOCASE, id",
  ).all<{ id: number; ten_nhom: string; ghi_chu: string | null; nguoi_cap_nhat: string | null; ngay_cap_nhat: string }>();
  const { results: cts } = await c.env.DB.prepare(
    `SELECT ct.nhom_id, ct.ma_lk, COALESCE(lk.ten_linh_kien, ct.ten_lk) AS ten_lk, ct.ghi_chu, ct.stt,
            CASE WHEN lk.ma_linh_kien IS NULL THEN 0 ELSE 1 END AS co_trong_danh_muc,
            lk.bat_tat, lk.trang_thai_ma, lk.ma_chuan, lk.gia_ban, lk.gia_tri_cong_no, lk.anh_demo
     FROM lk_nhom_thay_the_ct ct LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ct.ma_lk
     ORDER BY ct.nhom_id, ct.stt, ct.ma_lk`,
  ).all<{ nhom_id: number; ma_lk: string } & Record<string, unknown>>();
  const theoNhom = new Map<number, (typeof cts)[number][]>();
  for (const ct of cts) theoNhom.set(Number(ct.nhom_id), [...(theoNhom.get(Number(ct.nhom_id)) ?? []), ct]);
  const rows = nhoms.map((n) => {
    const tv = (theoNhom.get(n.id) ?? []).map(({ nhom_id: _n, ...r }) => r);
    return { ...n, thanh_vien: tv, ma_lk_list: tv.map((t) => t.ma_lk) };
  });
  return c.json({ rows });
});

/** Chuan hoa + kiem tra danh sach thanh vien gui len. `cu` = thanh vien hien co cua nhom (sua) - ma da co thi duoc giu du chua co trong
 * danh muc. Tra loi (400) hoac danh sach {ma_lk, ten_lk, ghi_chu} theo thu tu gui. */
async function chuanThanhVien(
  db: D1Database,
  body: BodyNhomThayThe,
  cu: Map<string, { ten_lk: string | null }>,
): Promise<{ error: string; ma?: string[] } | { ds: { ma_lk: string; ten_lk: string | null; ghi_chu: string | null }[] }> {
  const vao: { ma: string; ghi_chu: string | null }[] = Array.isArray(body.thanh_vien)
    ? body.thanh_vien.map((t) => ({ ma: String(t?.ma_lk ?? "").trim(), ghi_chu: typeof t?.ghi_chu === "string" ? t.ghi_chu.trim().slice(0, 300) || null : null }))
    : Array.isArray(body.ma_lk_list)
      ? body.ma_lk_list.map((m) => ({ ma: String(m ?? "").trim(), ghi_chu: null }))
      : [];
  const coMa = vao.filter((t) => t.ma);
  if (coMa.length > TOI_DA_THANH_VIEN) return { error: "QUA_NHIEU_THANH_VIEN" };
  const moi = [...new Set(coMa.map((t) => t.ma).filter((m) => !cu.has(m)))];
  const lkMap = new Map<string, { ma_linh_kien: string; ten_linh_kien: string | null; trang_thai_ma: string | null; ma_chuan: string | null }>();
  if (moi.length) {
    const { results } = await db
      .prepare("SELECT ma_linh_kien, ten_linh_kien, trang_thai_ma, ma_chuan FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(moi))
      .all<{ ma_linh_kien: string; ten_linh_kien: string | null; trang_thai_ma: string | null; ma_chuan: string | null }>();
    for (const r of results) lkMap.set(r.ma_linh_kien, r);
  }
  const khongCo = moi.filter((m) => !lkMap.has(m));
  if (khongCo.length) return { error: "MA_KHONG_CO_TRONG_DANH_MUC", ma: khongCo };
  // Ma da doi ('Da doi ma') -> ma chuan (ten lay theo ma chuan neu co).
  const chuan = new Map<string, string>();
  const canTenChuan: string[] = [];
  for (const m of moi) {
    const r = lkMap.get(m)!;
    if (r.trang_thai_ma === "Da doi ma" && r.ma_chuan) {
      chuan.set(m, r.ma_chuan);
      canTenChuan.push(r.ma_chuan);
    }
  }
  const tenChuan = new Map<string, string | null>();
  if (canTenChuan.length) {
    const { results } = await db
      .prepare("SELECT ma_linh_kien, ten_linh_kien FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(canTenChuan))
      .all<{ ma_linh_kien: string; ten_linh_kien: string | null }>();
    for (const r of results) tenChuan.set(r.ma_linh_kien, r.ten_linh_kien);
  }
  const ds: { ma_lk: string; ten_lk: string | null; ghi_chu: string | null }[] = [];
  const daCo = new Set<string>();
  for (const t of coMa) {
    const ma = chuan.get(t.ma) ?? t.ma;
    if (daCo.has(ma)) continue; // trung (hoac 2 ma cung quy ve 1 ma chuan) -> giu dong dau
    daCo.add(ma);
    const ten = chuan.has(t.ma) ? (tenChuan.get(ma) ?? null) : (lkMap.get(ma)?.ten_linh_kien ?? cu.get(ma)?.ten_lk ?? null);
    ds.push({ ma_lk: ma, ten_lk: ten, ghi_chu: t.ghi_chu });
  }
  if (ds.length < 2) return { error: "IT_NHAT_2_MA" };
  return { ds };
}

async function tenNhomDaCo(db: D1Database, ten: string, boQuaId?: number): Promise<boolean> {
  // So khong phan biet hoa/thuong o JS (lower() SQLite khong ha chu co dau).
  const { results } = await db.prepare("SELECT id, ten_nhom FROM lk_nhom_thay_the").all<{ id: number; ten_nhom: string }>();
  const k = ten.toLocaleLowerCase("vi").replace(/\s+/g, " ").trim();
  return results.some((r) => r.id !== boQuaId && r.ten_nhom.toLocaleLowerCase("vi").replace(/\s+/g, " ").trim() === k);
}

const lenhGhiThanhVien = (db: D1Database, nhomId: number, ds: { ma_lk: string; ten_lk: string | null; ghi_chu: string | null }[]) =>
  ds.map((t, i) =>
    db.prepare("INSERT INTO lk_nhom_thay_the_ct (nhom_id, ma_lk, ten_lk, ghi_chu, stt) VALUES (?, ?, ?, ?, ?)").bind(nhomId, t.ma_lk, t.ten_lk, t.ghi_chu, i + 1),
  );

// POST /api/lk-settings/nhom-thay-the - { ten_nhom, ghi_chu?, thanh_vien: [{ma_lk, ghi_chu?}] } (>= 2 ma).
lkSettings.post("/nhom-thay-the", suaThayThe, async (c) => {
  const body = await c.req.json<BodyNhomThayThe>().catch((): BodyNhomThayThe => ({}));
  const ten = body.ten_nhom?.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!ten) return c.json({ error: "MISSING_TEN_NHOM" }, 400);
  if (await tenNhomDaCo(c.env.DB, ten)) return c.json({ error: "TEN_NHOM_DA_CO" }, 409);
  const kq = await chuanThanhVien(c.env.DB, body, new Map());
  if ("error" in kq) return c.json(kq, 400);
  const user = c.get("user");
  const nhom = await c.env.DB.prepare(
    "INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?) RETURNING id",
  )
    .bind(ten, body.ghi_chu?.trim().slice(0, 500) || null, user.email, nowVN())
    .first<{ id: number }>();
  if (!nhom) return c.json({ error: "INSERT_FAILED" }, 500);
  try {
    await c.env.DB.batch(lenhGhiThanhVien(c.env.DB, nhom.id, kq.ds));
  } catch (e) {
    await c.env.DB.prepare("DELETE FROM lk_nhom_thay_the WHERE id = ?").bind(nhom.id).run();
    throw e;
  }
  return c.json({ ok: true, id: nhom.id }, 201);
});

// PATCH /api/lk-settings/nhom-thay-the/:id - { ten_nhom?, ghi_chu?, thanh_vien? | ma_lk_list? } - thanh vien gui len = DANH SACH DAY DU
// (thay toan bo, 1 batch). Khong gui thanh vien = chi doi ten/ghi chu.
lkSettings.patch("/nhom-thay-the/:id", suaThayThe, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<BodyNhomThayThe>().catch((): BodyNhomThayThe => ({}));
  const existing = await c.env.DB.prepare("SELECT id, ten_nhom, ghi_chu FROM lk_nhom_thay_the WHERE id = ?").bind(id).first<{ id: number; ten_nhom: string; ghi_chu: string | null }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const ten = body.ten_nhom !== undefined ? body.ten_nhom.replace(/\s+/g, " ").trim().slice(0, 200) : existing.ten_nhom;
  if (!ten) return c.json({ error: "MISSING_TEN_NHOM" }, 400);
  if (ten !== existing.ten_nhom && (await tenNhomDaCo(c.env.DB, ten, id))) return c.json({ error: "TEN_NHOM_DA_CO" }, 409);
  const ghiChu = body.ghi_chu !== undefined ? body.ghi_chu?.trim().slice(0, 500) || null : existing.ghi_chu;
  const user = c.get("user");
  const lenh: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE lk_nhom_thay_the SET ten_nhom = ?, ghi_chu = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?").bind(ten, ghiChu, user.email, nowVN(), id),
  ];
  if (body.thanh_vien !== undefined || body.ma_lk_list !== undefined) {
    const { results: cu } = await c.env.DB.prepare("SELECT ma_lk, ten_lk, ghi_chu FROM lk_nhom_thay_the_ct WHERE nhom_id = ?").bind(id).all<{ ma_lk: string; ten_lk: string | null; ghi_chu: string | null }>();
    const cuMap = new Map(cu.map((r) => [r.ma_lk, r]));
    const kq = await chuanThanhVien(c.env.DB, body, cuMap);
    if ("error" in kq) return c.json(kq, 400);
    // Kieu cu ma_lk_list (khong co ghi chu) -> giu ghi chu dang co cua tung ma.
    const ds = body.thanh_vien === undefined ? kq.ds.map((t) => ({ ...t, ghi_chu: cuMap.get(t.ma_lk)?.ghi_chu ?? null })) : kq.ds;
    lenh.push(c.env.DB.prepare("DELETE FROM lk_nhom_thay_the_ct WHERE nhom_id = ?").bind(id), ...lenhGhiThanhVien(c.env.DB, id, ds));
  }
  await c.env.DB.batch(lenh);
  return c.json({ ok: true });
});

// DELETE /api/lk-settings/nhom-thay-the/:id - xoa nhom + thanh vien (khong anh huong don/LK nao).
lkSettings.delete("/nhom-thay-the/:id", suaThayThe, async (c) => {
  const id = Number(c.req.param("id"));
  const r = await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM lk_nhom_thay_the_ct WHERE nhom_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM lk_nhom_thay_the WHERE id = ?").bind(id),
  ]);
  if (!r[1]?.meta?.changes) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// GET /api/lk-settings/thay-the/:ma_lk - goi y ma LK khac cung nhom thay the voi :ma_lk (khong
// tra chinh :ma_lk). Dung o TaoDonTab khi chon 1 ma_lk - buoc 2 ke hoach "Luong tao don mua hang".
// ?khu_vuc=<ma> (v1.431, "khi hiện đề xuất hiện luôn là còn hàng hay không (x123)"): kem `ton` = ton kho cong ty con dat duoc o khu vuc
// cua don (computeTonKhoChot - CUNG cong thuc tu duyet; form lay khu vuc tu POST /phieu-dat/kiem-tra). Khong tru cac dong khac dang soan.
lkSettings.get("/thay-the/:ma_lk", async (c) => {
  const maLk = c.req.param("ma_lk").trim();
  const khuVuc = c.req.query("khu_vuc")?.trim() || null;
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT dm.ma_linh_kien, dm.ten_linh_kien, dm.gia_ban
     FROM lk_nhom_thay_the_ct ct
     JOIN linh_kien dm ON dm.ma_linh_kien = ct.ma_lk
     WHERE ct.nhom_id IN (SELECT nhom_id FROM lk_nhom_thay_the_ct WHERE ma_lk = ?)
       AND ct.ma_lk != ?
     ORDER BY dm.ma_linh_kien`,
  )
    .bind(maLk, maLk)
    .all<{ ma_linh_kien: string }>();
  if (!khuVuc) return c.json({ rows: results });
  const rows = [];
  for (const r of results) rows.push({ ...r, ton: await computeTonKhoChot(c.env.DB, khuVuc, r.ma_linh_kien) });
  return c.json({ rows });
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

// ---------- Tu khoa tim kiem LK (migration 0067, frontend/src/lib/timLinhKien.ts) ----------
// Doc mo cho moi user da duyet (bo tim chay tren may o Bang gia + o chon LK luc tao don, cache theo md_lk_tu_khoa);
// ghi = cung nhom sua combo (Quan ly danh muc LK / Mua hang / Admin). 2 bang nho - doc ca bang chi khi co nguoi sua.
const chuanTuKhoa = (s: unknown) =>
  [...new Set(String(s ?? "").split(/[,;\n]/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean))].join(", ").slice(0, 500);

lkSettings.get("/tu-khoa", async (c) => {
  const [{ results: tuKhoa }, { results: dongNghia }] = await Promise.all([
    c.env.DB.prepare("SELECT ma_linh_kien, tu_khoa FROM lk_tu_khoa").all<{ ma_linh_kien: string; tu_khoa: string }>(),
    c.env.DB.prepare("SELECT id, nhom, nguoi_cap_nhat, ngay_cap_nhat FROM lk_dong_nghia ORDER BY id").all(),
  ]);
  return c.json({ tu_khoa: tuKhoa, dong_nghia: dongNghia });
});

// PUT /tu-khoa/:ma - { tu_khoa } (cac tu cach nhau dau phay; rong = xoa).
lkSettings.put("/tu-khoa/:ma", quanLyCombo, async (c) => {
  const ma = c.req.param("ma");
  const tuKhoa = chuanTuKhoa((await c.req.json<{ tu_khoa?: string }>().catch(() => ({}) as { tu_khoa?: string })).tu_khoa);
  const lk = await c.env.DB.prepare("SELECT 1 FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
  if (!lk) return c.json({ error: "NOT_FOUND" }, 404);
  if (!tuKhoa) {
    await c.env.DB.prepare("DELETE FROM lk_tu_khoa WHERE ma_linh_kien = ?").bind(ma).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO lk_tu_khoa (ma_linh_kien, tu_khoa, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?)
       ON CONFLICT(ma_linh_kien) DO UPDATE SET tu_khoa = excluded.tu_khoa, nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat`,
    ).bind(ma, tuKhoa, c.get("user").email, nowVN()).run();
  }
  return c.json({ ok: true, tu_khoa: tuKhoa || null });
});

// Nhom dong nghia - { nhom: "bộ mạch, board, mainboard" } (it nhat 2 tu).
async function docNhom(c: { req: { json: <T>() => Promise<T> } }): Promise<string | null> {
  const nhom = chuanTuKhoa((await c.req.json<{ nhom?: string }>().catch(() => ({}) as { nhom?: string })).nhom);
  return nhom.split(", ").length >= 2 ? nhom : null;
}
lkSettings.post("/dong-nghia", quanLyCombo, async (c) => {
  const nhom = await docNhom(c);
  if (!nhom) return c.json({ error: "NHOM_IT_NHAT_2_TU" }, 400);
  await c.env.DB.prepare("INSERT INTO lk_dong_nghia (nhom, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?)").bind(nhom, c.get("user").email, nowVN()).run();
  return c.json({ ok: true });
});
lkSettings.patch("/dong-nghia/:id", quanLyCombo, async (c) => {
  const nhom = await docNhom(c);
  if (!nhom) return c.json({ error: "NHOM_IT_NHAT_2_TU" }, 400);
  const r = await c.env.DB.prepare("UPDATE lk_dong_nghia SET nhom = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?")
    .bind(nhom, c.get("user").email, nowVN(), Number(c.req.param("id")))
    .run();
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});
lkSettings.delete("/dong-nghia/:id", quanLyCombo, async (c) => {
  await c.env.DB.prepare("DELETE FROM lk_dong_nghia WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

export default lkSettings;
