import { Hono, type Context } from "hono";
import type { Env, AppUser } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { gioLamViecGiua, parseGioVn } from "../lib/gioLamViec";
import { tenNguoiNullSql } from "../lib/tenNguoi";
import { nhanAnhTaiLen, laUrlAnhDrive } from "../lib/anhUpload";
import { docLocCot, sqlLocCot, sqlSapXep, giaTriCot, tenNguoiSql, type CotLoc } from "../lib/locCot";
import {
  BUOC_VI_PHAM, BUOC_THEO_MA, TEN_BO_PHAN, TRANG_THAI_VI_PHAM, LY_DO_KHONG_DUNG, boPhanCua, docCauHinh, quetViPham, type BoPhan,
} from "../lib/viPham";

// Man "Quá hạn & vi phạm" (v1.517, migration 0125; v1.518 migration 0126 - nguoi phu trach cu the, ly do, bao khong dung, tong hop).
// Xem: moi nhan vien van phong (BO) + Admin; KTV khong giai trinh. Giai trinh: nguoi trong nguoi_phu_trach hoac cung bo phan + Admin.
// Ghi nhan sai = giai trinh voi ly do LY_DO_KHONG_DUNG (chot 2026-11-18: khong co buoc Admin xem xet / go the). Cau hinh SLA / quet ngay: Admin.
const viPham = new Hono<{ Bindings: Env }>();
viPham.use("*", verifySessionMiddleware, loadUser);
viPham.use("*", async (c, next) => {
  const user = c.get("user");
  if (user.vai_tro !== "Admin" && (user.la_ktv_dvbh || user.la_ve_tinh)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});

const laAdmin = (u: AppUser) => u.vai_tro === "Admin";
const CUA_TOI_SQL = "EXISTS (SELECT 1 FROM json_each(COALESCE(v.nguoi_phu_trach, '[]')) j WHERE j.value = ?)";

/** Cot chung cho man noi bo + API doi tac. Alias: v = vi_pham, d = don goc. */
export const VI_PHAM_COT_SQL = `
  v.id, v.buoc, v.loai, v.bo_phan, v.doi_tuong, v.doi_tuong_id, v.dat_don_hang_id, v.phieu_xuat_kho_id, v.khu_vuc_ma,
  v.nguoi_nhan_hang, ${tenNguoiNullSql("v.nguoi_nhan_hang")} AS nguoi_nhan_hang_ten,
  v.moc_vao, v.so_gio_sla, v.han, v.ket_thuc_luc, v.trang_thai_sau,
  v.nguoi_xu_ly, ${tenNguoiNullSql("v.nguoi_xu_ly")} AS nguoi_xu_ly_ten, (SELECT u.ma_nhan_su FROM users u WHERE u.email = v.nguoi_xu_ly) AS nguoi_xu_ly_ma_nhan_su,
  (SELECT json_group_array(json_object('email', j.value, 'ten', ${tenNguoiNullSql("j.value")},
      'ma_nhan_su', (SELECT u.ma_nhan_su FROM users u WHERE u.email = j.value)))
   FROM json_each(COALESCE(v.nguoi_phu_trach, '[]')) j) AS phu_trach_json,
  v.trang_thai, v.han_giai_trinh, v.ly_do, v.phan_loai_loi, v.bang_chung AS bang_chung_json, v.giai_trinh, v.nguoi_giai_trinh, ${tenNguoiNullSql("v.nguoi_giai_trinh")} AS nguoi_giai_trinh_ten,
  (SELECT u.ma_nhan_su FROM users u WHERE u.email = v.nguoi_giai_trinh) AS nguoi_giai_trinh_ma_nhan_su,
  v.giai_trinh_luc, v.giai_trinh_tu_dong, v.nhac_luc, v.gan_the_luc, v.tao_luc, v.cap_nhat_luc,
  d.ma_yeu_cau_su_co, d.ma_lada, d.ma_lk, d.ten_lk_snapshot AS ten_lk, d.loai_de_xuat,
  CASE WHEN v.doi_tuong = 'phieu' THEN (SELECT json_group_array(pd.dat_don_hang_id) FROM phieu_xuat_kho_dong pd WHERE pd.phieu_xuat_kho_id = v.phieu_xuat_kho_id) END AS don_ids_json`;
export const VI_PHAM_FROM_SQL = "FROM vi_pham v LEFT JOIN dat_don_hang d ON d.id = v.dat_don_hang_id";

export interface ViPhamRow {
  id: number;
  buoc: string;
  bo_phan: BoPhan;
  han: string;
  trang_thai: string;
  ket_thuc_luc: string | null;
  don_ids_json: string | null;
  phu_trach_json: string | null;
  bang_chung_json?: string | null;
  phan_loai_loi?: string | null;
  giai_trinh_tu_dong: number;
  [k: string]: unknown;
}

/** Bo sung nhan + so gio tre (tinh tai thoi diem doc) cho 1 dong. */
export function boSungViPham(r: ViPhamRow, now: string) {
  const { don_ids_json, phu_trach_json, bang_chung_json, ...rest } = r;
  const den = r.ket_thuc_luc ?? now;
  // So gio tre tinh theo GIO LAM VIEC (2026-11-19, v1.527 - cung don vi voi han SLA).
  const gioTre = Math.round(gioLamViecGiua(parseGioVn(r.han), parseGioVn(den)) * 10) / 10;
  return {
    ...rest,
    ten_buoc: BUOC_THEO_MA.get(r.buoc)?.ten ?? r.buoc,
    ten_bo_phan: TEN_BO_PHAN[r.bo_phan] ?? r.bo_phan,
    so_gio_tre: gioTre,
    dang_cho: r.ket_thuc_luc === null,
    giai_trinh_tu_dong: !!r.giai_trinh_tu_dong,
    nguoi_phu_trach: phu_trach_json ? (JSON.parse(phu_trach_json) as { email: string; ten: string | null; ma_nhan_su: string | null }[]) : [],
    ten_phan_loai_loi: r.phan_loai_loi ? (PHAN_LOAI_LOI[r.phan_loai_loi] ?? r.phan_loai_loi) : null,
    bang_chung: bang_chung_json ? (JSON.parse(bang_chung_json) as string[]) : [],
    don_ids: don_ids_json ? (JSON.parse(don_ids_json) as string[]) : r.dat_don_hang_id ? [r.dat_don_hang_id as string] : [],
    // v1.524: het han giai trinh ma chua giai trinh -> "Ton CEO" (truoc goi "Gan the"); gan_the_luc = luc chuyen.
    ton_ceo: r.trang_thai === "Ton CEO",
    ton_ceo_luc: r.trang_thai === "Ton CEO" ? ((r.gan_the_luc as string | null) ?? null) : null,
  };
}

/** Them co thao tac theo nguoi dang xem. */
function voiQuyen(user: AppUser, r: ReturnType<typeof boSungViPham>) {
  const laNguoiPt = r.nguoi_phu_trach.some((p) => p.email === user.email);
  const cungBoPhan = boPhanCua(user).includes(r.bo_phan as BoPhan);
  const duocLam = laNguoiPt || cungBoPhan;
  return {
    ...r,
    la_cua_toi: laNguoiPt,
    duoc_giai_trinh: r.trang_thai === "Cho giai trinh" && duocLam,
  };
}

/** Phan loai loi khi giai trinh (v1.548). Khac 'cua_toi' -> bat buoc anh bang chung. */
export const PHAN_LOAI_LOI: Record<string, string> = { noi_bo: "Lỗi nội bộ", doi_tac: "Lỗi đối tác", cua_toi: "Lỗi của tôi", khac: "Khác" };
const MAX_BANG_CHUNG = 5;

const COT_LOC: Record<string, CotLoc> = {
  phan_loai_loi: { kieu: "don", expr: "v.phan_loai_loi" },
  buoc: { kieu: "don", expr: "v.buoc" },
  bo_phan: { kieu: "don", expr: "v.bo_phan" },
  loai: { kieu: "don", expr: "v.loai" },
  trang_thai: { kieu: "don", expr: "v.trang_thai" },
  khu_vuc_ma: { kieu: "don", expr: "v.khu_vuc_ma", khuVuc: true },
  nguoi_nhan_hang: { kieu: "don", expr: "v.nguoi_nhan_hang", sortExpr: tenNguoiSql("v.nguoi_nhan_hang") },
  nguoi_xu_ly: { kieu: "don", expr: "v.nguoi_xu_ly", sortExpr: tenNguoiSql("v.nguoi_xu_ly") },
  nguoi_phu_trach: { kieu: "nhieu", tu: "FROM json_each(COALESCE(v.nguoi_phu_trach, '[]')) jpt WHERE 1 = 1", join: ", json_each(COALESCE(v.nguoi_phu_trach, '[]')) jpt", expr: "jpt.value" },
  ly_do: { kieu: "don", expr: "v.ly_do" },
  doi_tuong_id: { kieu: "don", expr: "v.doi_tuong_id" },
  moc_vao: { kieu: "don", expr: "substr(v.moc_vao, 1, 10)", sortExpr: "v.moc_vao" },
  han: { kieu: "don", expr: "substr(v.han, 1, 10)", sortExpr: "v.han" },
  han_giai_trinh: { kieu: "don", expr: "substr(v.han_giai_trinh, 1, 10)", sortExpr: "v.han_giai_trinh" },
  ket_thuc_luc: { kieu: "don", expr: "substr(v.ket_thuc_luc, 1, 10)", sortExpr: "v.ket_thuc_luc" },
  so_gio_tre: { kieu: "don", expr: "v.han", sortExpr: "(julianday(COALESCE(v.ket_thuc_luc, datetime('now', '+7 hours'))) - julianday(v.han))" },
};

function listWhere(c: Context<{ Bindings: Env }>, boQuaCot?: string): { whereSql: string; binds: unknown[] } {
  const user = c.get("user");
  const dk: string[] = ["1 = 1"];
  const binds: unknown[] = [];
  const tab = c.req.query("tab") ?? "can_toi";
  if (tab === "can_toi") {
    dk.push(`v.trang_thai = 'Cho giai trinh' AND ${CUA_TOI_SQL}`);
    binds.push(user.email);
  } else if (tab === "cua_toi") {
    dk.push(`(${CUA_TOI_SQL} OR v.nguoi_giai_trinh = ?)`);
    binds.push(user.email, user.email);
  } else if (tab === "cho") dk.push("v.trang_thai = 'Cho giai trinh'");
  else if (tab === "da_giai_trinh") dk.push("v.trang_thai = 'Da giai trinh'");
  else if (tab === "gan_the") dk.push("v.trang_thai = 'Ton CEO'");
  else if (tab === "dang_cho") dk.push("v.ket_thuc_luc IS NULL");
  const loai = c.req.query("loai");
  if (loai === "dat_hang" || loai === "tra_hang") {
    dk.push("v.loai = ?");
    binds.push(loai);
  }
  const boPhan = c.req.query("bo_phan");
  if (boPhan) {
    dk.push("v.bo_phan = ?");
    binds.push(boPhan);
  }
  const nguoi = c.req.query("nguoi");
  if (nguoi) {
    dk.push(`(${CUA_TOI_SQL} OR v.nguoi_giai_trinh = ?)`);
    binds.push(nguoi, nguoi);
  }
  const q = c.req.query("q")?.trim();
  if (q) {
    dk.push(`(v.doi_tuong_id LIKE ? OR v.dat_don_hang_id LIKE ? OR v.phieu_xuat_kho_id LIKE ? OR d.ma_yeu_cau_su_co LIKE ? OR d.ma_lada LIKE ?
             OR EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pd WHERE pd.phieu_xuat_kho_id = v.phieu_xuat_kho_id AND pd.dat_don_hang_id LIKE ?))`);
    const like = `%${q.toUpperCase()}%`;
    binds.push(like, like, like, like, like, like);
  }
  const loc = sqlLocCot(COT_LOC, docLocCot(c.req.query("cf"), COT_LOC), boQuaCot);
  return { whereSql: dk.join(" AND ") + loc.sql, binds: [...binds, ...loc.binds] };
}

viPham.get("/", async (c) => {
  const db = c.env.DB;
  const page = Math.max(1, Math.trunc(Number(c.req.query("page"))) || 1);
  const pageSize = Math.min(500, Math.max(1, Math.trunc(Number(c.req.query("pageSize"))) || 50));
  const { whereSql, binds } = listWhere(c);
  // Mac dinh: ca sap het han giai trinh len dau, roi qua han lau nhat.
  const sapXep = sqlSapXep(COT_LOC, c.req.query("cs"), c.req.query("cd")) ?? "CASE WHEN v.trang_thai = 'Cho giai trinh' THEN v.han_giai_trinh END IS NULL, v.han_giai_trinh, v.han";
  const [tong, ds] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n ${VI_PHAM_FROM_SQL} WHERE ${whereSql}`).bind(...binds).first<{ n: number }>(),
    db
      .prepare(`SELECT ${VI_PHAM_COT_SQL} ${VI_PHAM_FROM_SQL} WHERE ${whereSql} ORDER BY ${sapXep}, v.id DESC LIMIT ? OFFSET ?`)
      .bind(...binds, pageSize, (page - 1) * pageSize)
      .all<ViPhamRow>(),
  ]);
  const user = c.get("user");
  const now = nowVN();
  return c.json({ rows: (ds.results ?? []).map((r) => voiQuyen(user, boSungViPham(r, now))), total: tong?.n ?? 0, page, pageSize });
});

viPham.get("/gia-tri-loc", async (c) => {
  const cot = c.req.query("cot") ?? "";
  const def = Object.hasOwn(COT_LOC, cot) ? COT_LOC[cot] : undefined;
  if (!def) return c.json({ error: "COT_KHONG_HOP_LE" }, 400);
  const { whereSql, binds } = listWhere(c, cot);
  return c.json({ rows: await giaTriCot(c.env.DB, def, VI_PHAM_FROM_SQL, "v.id", whereSql, binds) });
});

/** Ca lien quan 1 don / phieu / ticket - banner trong man chi tiet. ids = ma DDH / TLK / PMH… (phan cach dau phay, <= 50). */
viPham.get("/theo-doi-tuong", async (c) => {
  const ids = (c.req.query("ids") ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 50);
  if (!ids.length) return c.json({ rows: [] });
  const ds = JSON.stringify(ids);
  const { results } = await c.env.DB.prepare(
    `SELECT ${VI_PHAM_COT_SQL} ${VI_PHAM_FROM_SQL}
     WHERE v.doi_tuong_id IN (SELECT value FROM json_each(?)) OR v.dat_don_hang_id IN (SELECT value FROM json_each(?))
        OR v.phieu_xuat_kho_id IN (SELECT pd.phieu_xuat_kho_id FROM phieu_xuat_kho_dong pd WHERE pd.dat_don_hang_id IN (SELECT value FROM json_each(?)))
     ORDER BY v.moc_vao DESC LIMIT 30`,
  )
    .bind(ds, ds, ds)
    .all<ViPhamRow>();
  const user = c.get("user");
  const now = nowVN();
  return c.json({ rows: (results ?? []).map((r) => voiQuyen(user, boSungViPham(r, now))) });
});

/** So dem cho tab + badge menu. */
viPham.get("/dem", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `SELECT
       SUM(CASE WHEN v.trang_thai = 'Cho giai trinh' AND ${CUA_TOI_SQL} THEN 1 ELSE 0 END) AS can_toi,
       SUM(CASE WHEN v.trang_thai = 'Cho giai trinh' THEN 1 ELSE 0 END) AS cho,
       SUM(CASE WHEN v.trang_thai = 'Da giai trinh' THEN 1 ELSE 0 END) AS da_giai_trinh,
       SUM(CASE WHEN v.trang_thai = 'Ton CEO' THEN 1 ELSE 0 END) AS gan_the,
       SUM(CASE WHEN v.ket_thuc_luc IS NULL THEN 1 ELSE 0 END) AS dang_cho,
       SUM(CASE WHEN v.trang_thai = 'Ton CEO' AND ${CUA_TOI_SQL} THEN 1 ELSE 0 END) AS gan_the_cua_toi,
       COUNT(*) AS tat_ca
     FROM vi_pham v`,
  )
    .bind(user.email, user.email)
    .first<Record<string, number | null>>();
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(row ?? {})) out[k] = v ?? 0;
  return c.json(out);
});

/** Tong hop theo bo phan + theo nguoi (de quan ly theo doi ton). */
viPham.get("/tong-hop", async (c) => {
  const db = c.env.DB;
  const [bp, nguoi, chuaCo] = await Promise.all([
    db.prepare(
      `SELECT bo_phan,
         SUM(trang_thai = 'Cho giai trinh') AS cho, SUM(trang_thai = 'Da giai trinh') AS da_giai_trinh, SUM(trang_thai = 'Ton CEO') AS gan_the,
         SUM(ket_thuc_luc IS NULL) AS dang_cho, COUNT(*) AS tong
       FROM vi_pham GROUP BY bo_phan`,
    ).all<Record<string, number | string>>(),
    db.prepare(
      `SELECT j.value AS email, ${tenNguoiNullSql("j.value")} AS ten, (SELECT u.ma_nhan_su FROM users u WHERE u.email = j.value) AS ma_nhan_su,
         SUM(v.trang_thai = 'Cho giai trinh') AS cho, SUM(v.trang_thai = 'Ton CEO') AS gan_the,
         SUM(v.trang_thai = 'Da giai trinh' AND v.nguoi_giai_trinh = j.value) AS da_giai_trinh, MIN(CASE WHEN v.trang_thai = 'Cho giai trinh' THEN v.han_giai_trinh END) AS han_som_nhat,
         group_concat(DISTINCT v.bo_phan) AS bo_phan
       FROM vi_pham v, json_each(COALESCE(v.nguoi_phu_trach, '[]')) j
       GROUP BY j.value ORDER BY cho DESC, gan_the DESC`,
    ).all<Record<string, number | string | null>>(),
    db.prepare("SELECT COUNT(*) AS n FROM vi_pham WHERE trang_thai = 'Cho giai trinh' AND COALESCE(nguoi_phu_trach, '[]') = '[]'").first<{ n: number }>(),
  ]);
  return c.json({
    bo_phan: (bp.results ?? []).map((r) => ({ ...r, ten_bo_phan: TEN_BO_PHAN[r.bo_phan as BoPhan] ?? r.bo_phan })),
    nguoi: nguoi.results ?? [],
    chua_co_nguoi_phu_trach: chuaCo?.n ?? 0,
  });
});

viPham.get("/buoc", async (c) => {
  const cfg = await docCauHinh(c.env.DB);
  return c.json({
    buoc: BUOC_VI_PHAM.map((b) => ({
      ...(cfg.get(b.ma) ?? { so_gio: 8, gio_giai_trinh: 8, tinh_cuoi_tuan: 0, bat_tat: 0, cap_nhat_luc: null, cap_nhat_boi: null }),
      ma: b.ma,
      ten: b.ten,
      loai: b.loai,
      bo_phan: b.boPhan,
      ten_bo_phan: TEN_BO_PHAN[b.boPhan],
      doi_tuong: b.doiTuong,
      trang_thai_buoc: b.trangThai,
    })),
    bo_phan: TEN_BO_PHAN,
    bo_phan_cua_toi: boPhanCua(c.get("user")),
    trang_thai: TRANG_THAI_VI_PHAM,
    lan_quet: (await c.env.DB.prepare("SELECT MAX(quet_luc) AS l FROM vi_pham_quet").first<{ l: string | null }>())?.l ?? null,
  });
});

/** Danh muc ly do giai trinh = LY_DO_KHONG_DUNG (ghi nhan sai) + danh muc "lý do chậm" nhom Mua hàng (Cài đặt) + "Khác". */
viPham.get("/ly-do", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT ten_ly_do FROM settings_ly_do_cham WHERE bat_tat = 1 AND he_thong_su_dung LIKE '%Mua hàng%' ORDER BY stt, id",
  ).all<{ ten_ly_do: string }>();
  return c.json({ rows: [LY_DO_KHONG_DUNG, ...(results ?? []).map((r) => r.ten_ly_do), "Khác"], khong_dung: LY_DO_KHONG_DUNG });
});

viPham.put("/buoc/:ma", async (c) => {
  const user = c.get("user");
  if (!laAdmin(user)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const ma = c.req.param("ma");
  if (!BUOC_THEO_MA.has(ma)) return c.json({ error: "NOT_FOUND" }, 404);
  const b = await c.req.json<{ so_gio?: number; gio_giai_trinh?: number; tinh_cuoi_tuan?: boolean; bat_tat?: boolean }>();
  const soGio = Math.trunc(Number(b.so_gio));
  const gioGt = Math.trunc(Number(b.gio_giai_trinh));
  if (!(soGio >= 1 && soGio <= 2160)) return c.json({ error: "SO_GIO_KHONG_HOP_LE" }, 400);
  if (!(gioGt >= 1 && gioGt <= 720)) return c.json({ error: "GIO_GIAI_TRINH_KHONG_HOP_LE" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO sla_buoc (ma, so_gio, gio_giai_trinh, tinh_cuoi_tuan, bat_tat, cap_nhat_luc, cap_nhat_boi) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ma) DO UPDATE SET so_gio = excluded.so_gio, gio_giai_trinh = excluded.gio_giai_trinh, tinh_cuoi_tuan = excluded.tinh_cuoi_tuan,
       bat_tat = excluded.bat_tat, cap_nhat_luc = excluded.cap_nhat_luc, cap_nhat_boi = excluded.cap_nhat_boi`,
  )
    .bind(ma, soGio, gioGt, b.tinh_cuoi_tuan ? 1 : 0, b.bat_tat === false ? 0 : 1, nowVN(), user.email)
    .run();
  return c.json({ ok: true });
});

viPham.post("/quet", async (c) => {
  if (!laAdmin(c.get("user"))) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  return c.json(await quetViPham(c.env));
});

async function docMot(db: D1Database, id: number) {
  return db
    .prepare("SELECT id, bo_phan, trang_thai, nguoi_phu_trach FROM vi_pham WHERE id = ?")
    .bind(id)
    .first<{ id: number; bo_phan: BoPhan; trang_thai: string; nguoi_phu_trach: string | null }>();
}
function duocLam(user: AppUser, v: { bo_phan: BoPhan; nguoi_phu_trach: string | null }): boolean {
  const pt = v.nguoi_phu_trach ? (JSON.parse(v.nguoi_phu_trach) as string[]) : [];
  return pt.includes(user.email) || boPhanCua(user).includes(v.bo_phan);
}

// POST /api/vi-pham/:id/anh - tai 1 anh bang chung giai trinh len Drive (han muc anh/ngay nhu moi cho tai anh).
viPham.post("/:id/anh", async (c) => {
  const user = c.get("user");
  const v = await docMot(c.env.DB, Number(c.req.param("id")));
  if (!v) return c.json({ error: "NOT_FOUND" }, 404);
  if (!duocLam(user, v)) return c.json({ error: "KHONG_PHAI_NGUOI_PHU_TRACH" }, 403);
  const up = await nhanAnhTaiLen(c, (ext) => `giai-trinh-vp${v.id}-${user.email.split("@")[0]}-${Date.now()}.${ext}`);
  if (up instanceof Response) return up;
  return c.json({ ok: true, url: up.thumbnailUrl, han_muc_anh: up.hanMucAnh });
});

// POST /api/vi-pham/:id/giai-trinh { ly_do, noi_dung, phan_loai_loi, bang_chung? }
// v1.548: phan_loai_loi bat buoc (noi_bo | doi_tac | cua_toi | khac); khac 'cua_toi' -> 1..5 anh bang chung (link Drive).
viPham.post("/:id/giai-trinh", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ ly_do?: string; noi_dung?: string; phan_loai_loi?: string; bang_chung?: unknown }>();
  const lyDo = (b.ly_do ?? "").trim();
  const noiDung = (b.noi_dung ?? "").trim();
  const phanLoai = (b.phan_loai_loi ?? "").trim();
  const bangChung = Array.isArray(b.bang_chung) ? [...new Set(b.bang_chung.filter(laUrlAnhDrive))] : [];
  if (!lyDo) return c.json({ error: "THIEU_LY_DO" }, 400);
  if (!PHAN_LOAI_LOI[phanLoai]) return c.json({ error: "THIEU_PHAN_LOAI_LOI" }, 400);
  if (phanLoai !== "cua_toi" && bangChung.length === 0) return c.json({ error: "THIEU_BANG_CHUNG" }, 400);
  if (bangChung.length > MAX_BANG_CHUNG) return c.json({ error: "QUA_SO_ANH_BANG_CHUNG" }, 400);
  if (noiDung.length < 5) return c.json({ error: "NOI_DUNG_QUA_NGAN" }, 400);
  if (noiDung.length > 2000 || lyDo.length > 200) return c.json({ error: "NOI_DUNG_QUA_DAI" }, 400);
  const v = await docMot(c.env.DB, id);
  if (!v) return c.json({ error: "NOT_FOUND" }, 404);
  if (!duocLam(user, v)) return c.json({ error: "KHONG_PHAI_NGUOI_PHU_TRACH" }, 403);
  const now = nowVN();
  const r = await c.env.DB.prepare(
    `UPDATE vi_pham SET trang_thai = 'Da giai trinh', ly_do = ?, giai_trinh = ?, phan_loai_loi = ?, bang_chung = ?, nguoi_giai_trinh = ?, giai_trinh_luc = ?,
       giai_trinh_tu_dong = 0, cap_nhat_luc = ?
     WHERE id = ? AND trang_thai = 'Cho giai trinh'`,
  )
    .bind(lyDo, noiDung, phanLoai, bangChung.length ? JSON.stringify(bangChung) : null, user.email, now, now, id)
    .run();
  if (!r.meta.changes) return c.json({ error: v.trang_thai === "Ton CEO" ? "DA_GAN_THE" : "TRANG_THAI_DA_DOI" }, 409);
  return c.json({ ok: true });
});

export default viPham;
