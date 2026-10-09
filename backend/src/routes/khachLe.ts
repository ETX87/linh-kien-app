import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { chuanHoaSdt, nhomKhLeTheoEmail, timHoacTaoKhachLe } from "../lib/khachLe";
import { taiTinhPxkMoCuaKtv } from "../lib/pxkRecalculate";
import { bumpVersions } from "../lib/dataVersions";
import { nowVN } from "../lib/vnTime";

// KH le theo tung khach (chot 2026-10-09, migration 0074, lib/khachLe.ts). Mount /api/khach-le.
//   GET  /nhom              - cac tai khoan nhom KH le (FE nhan biet khi chon nguoi nhan hang)
//   GET  /tra-cuu           - ?nhom=<email nhom>&sdt= - KH da co chua (o nhap SDT luc tao don)
//   GET  /                  - danh sach KH le kem quy du / tien dang giu tren don / so don (tab "KH lẻ" o Quy & chuyen tien)
//   POST /gan-don           - {don_hang_id, sdt?} TN gan don CU cua tai khoan nhom cho 1 KH (tien da tra di theo don)
const khachLe = new Hono<{ Bindings: Env }>();
khachLe.use("*", verifySessionMiddleware, loadUser, requireDatMuaLkArea);

type C = Context<{ Bindings: Env }>;
const laTn = (c: C) => !!c.get("user").la_tac_nghiep || c.get("user").vai_tro === "Admin";
const datHoDuoc = (c: C) => laTn(c) || c.get("user").vai_tro === "Giam sat";
// Xem danh sach KH le = cung nhom duoc xem toan bo quy (routes/quyKtv.ts phamViXem tra null).
const xemDanhSach = (c: C) => {
  const u = c.get("user");
  return u.vai_tro === "Admin" || !!u.la_ke_toan || !!u.la_tac_nghiep || !!u.la_mua_hang;
};

// Don "con mo" = chua tu choi/huy va chua xuat khoi kho (phieu chua toi "Dang gui KTV" tro di).
const DON_CON_MO_SQL = (a: string) => `${a}.trang_thai_hien_tai NOT IN ('TN tu choi', 'Tu choi', 'Da huy')
  AND NOT EXISTS (SELECT 1 FROM phieu_xuat_kho_dong d JOIN phieu_xuat_kho p ON p.id = d.phieu_xuat_kho_id
                  WHERE d.dat_don_hang_id = ${a}.id AND p.trang_thai_hien_tai IN ('Dang gui KTV', 'KTV da nhan', 'Kho da ket thuc', 'Hang tru kho'))`;

const COT_KH = `kl.ma, kl.sdt, kl.nhom_ma, kl.email, kl.ngay_tao, kl.nguoi_tao, u.ten,
  COALESCE((SELECT so_du FROM quy_ktv q WHERE q.email = kl.email), 0) AS quy_du,
  COALESCE((SELECT SUM(d.tien_da_tra) FROM dat_don_hang d WHERE d.tien_da_tra_email = kl.email AND d.tien_da_tra > 0), 0) AS tien_giu_tren_don,
  (SELECT COUNT(*) FROM dat_don_hang d WHERE d.nguoi_nhan_hang = kl.email) AS so_don,
  (SELECT COUNT(*) FROM dat_don_hang d WHERE d.nguoi_nhan_hang = kl.email AND d.trang_thai_hien_tai = 'Cho hang') AS so_don_cho_hang,
  (SELECT COUNT(*) FROM dat_don_hang d WHERE d.nguoi_nhan_hang = kl.email AND ${DON_CON_MO_SQL("d")}) AS so_don_mo`;

khachLe.get("/nhom", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT n.ma_ktv, k.email_dang_nhap AS email, k.ten_hien_thi AS ten, k.khu_vuc_ma
     FROM khach_le_nhom n JOIN ktv_lien_he k ON k.ma_ktv = n.ma_ktv ORDER BY n.ma_ktv`,
  ).all();
  return c.json({ rows: results });
});

khachLe.get("/tra-cuu", async (c) => {
  if (!datHoDuoc(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const nhom = await nhomKhLeTheoEmail(c.env.DB, c.req.query("nhom") ?? "");
  if (!nhom) return c.json({ error: "KHONG_PHAI_NHOM_KH_LE" }, 400);
  const sdt = chuanHoaSdt(c.req.query("sdt"));
  if (sdt === "sai") return c.json({ sdt: null, sai: true, kh: null });
  if (!sdt) return c.json({ sdt: null, sai: false, kh: null });
  const kh = await c.env.DB.prepare(`SELECT ${COT_KH} FROM khach_le kl LEFT JOIN users u ON u.email = kl.email WHERE kl.nhom_ma = ? AND kl.sdt = ?`)
    .bind(nhom.ma_ktv, sdt)
    .first();
  return c.json({ sdt, sai: false, kh: kh ?? null });
});

khachLe.get("/", async (c) => {
  if (!xemDanhSach(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const where: string[] = [];
  const binds: unknown[] = [];
  const q = (c.req.query("q") ?? "").trim();
  if (q) {
    const so = q.replace(/\D/g, "");
    where.push(so.length >= 3 ? "(kl.sdt LIKE ? OR kl.ma LIKE ?)" : "kl.ma LIKE ?");
    if (so.length >= 3) binds.push(`%${so}%`);
    binds.push(`%${q}%`);
  }
  const nhom = c.req.query("nhom")?.trim();
  if (nhom) {
    where.push("kl.nhom_ma = ?");
    binds.push(nhom);
  }
  // Mac dinh an KH khong con gi theo doi (khong don mo, khong tien) - ?tat_ca=1 de xem het.
  if (c.req.query("tat_ca") !== "1") {
    where.push(`(EXISTS (SELECT 1 FROM dat_don_hang d WHERE d.nguoi_nhan_hang = kl.email AND ${DON_CON_MO_SQL("d")})
      OR COALESCE((SELECT so_du FROM quy_ktv q WHERE q.email = kl.email), 0) > 0
      OR EXISTS (SELECT 1 FROM dat_don_hang d WHERE d.tien_da_tra_email = kl.email AND d.tien_da_tra > 0))`);
  }
  const page = Math.max(1, Math.trunc(Number(c.req.query("page"))) || 1);
  const pageSize = Math.min(200, Math.max(1, Math.trunc(Number(c.req.query("pageSize"))) || 50));
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM khach_le kl ${whereSql}`).bind(...binds).first<{ n: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT ${COT_KH} FROM khach_le kl LEFT JOIN users u ON u.email = kl.email ${whereSql} ORDER BY kl.ngay_tao DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all();
  return c.json({ rows: results, total: total?.n ?? 0, page, pageSize });
});

// POST /gan-don {don_hang_id, sdt?} - don CU dang ghi cho tai khoan nhom KH le -> chuyen sang 1 KH (tim theo SDT / ma tu dong).
// CHI don chua nam trong phieu xuat con hieu luc (dang trong phieu: TN bo don khoi phieu truoc, chon "Đơn đã thanh toán" de giu
// tien) va chua tu choi/huy. Tien da tra cua don (tien_da_tra) di THEO DON sang KH (trigger 0074 khong hoan ve quy nhom).
khachLe.post("/gan-don", async (c) => {
  if (!laTn(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const user = c.get("user");
  const body = await c.req.json<{ don_hang_id?: string; sdt?: string }>().catch(() => ({}) as { don_hang_id?: string; sdt?: string });
  const id = body.don_hang_id?.trim();
  if (!id) return c.json({ error: "INVALID_BODY" }, 400);
  const don = await c.env.DB.prepare(
    `SELECT id, nguoi_nhan_hang, trang_thai_hien_tai, loai_don, tien_da_tra, version,
       EXISTS (SELECT 1 FROM phieu_xuat_kho_dong d JOIN phieu_xuat_kho p ON p.id = d.phieu_xuat_kho_id
               WHERE d.dat_don_hang_id = dat_don_hang.id AND p.trang_thai_hien_tai <> 'Ke toan huy') AS trong_phieu
     FROM dat_don_hang WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; nguoi_nhan_hang: string | null; trang_thai_hien_tai: string | null; loai_don: string; tien_da_tra: number | null; version: number; trong_phieu: number }>();
  if (!don) return c.json({ error: "NOT_FOUND" }, 404);
  const nhom = don.nguoi_nhan_hang ? await nhomKhLeTheoEmail(c.env.DB, don.nguoi_nhan_hang) : null;
  if (!nhom) return c.json({ error: "KHONG_PHAI_DON_KH_LE_CHUNG" }, 400);
  if (["TN tu choi", "Tu choi", "Da huy"].includes(don.trang_thai_hien_tai ?? "")) return c.json({ error: "DON_DA_DONG" }, 409);
  if (don.trong_phieu) return c.json({ error: "DON_CON_TRONG_PHIEU" }, 409);
  const sdt = chuanHoaSdt(body.sdt);
  if (sdt === "sai") return c.json({ error: "SDT_KHONG_HOP_LE" }, 400);

  const kh = await timHoacTaoKhachLe(c.env.DB, nhom, sdt, user.email);
  const now = nowVN();
  const tien = don.tien_da_tra ?? 0;
  const ghiChu = `Sửa: Gán KH lẻ ${kh.sdt ?? kh.ma} (${kh.ma})${tien > 0 ? ` — tiền đã thanh toán ${tien.toLocaleString("vi-VN")}đ chuyển theo đơn sang KH` : ""}`;
  const [cas] = await c.env.DB.batch([
    // tien_da_tra_email = KH trong CUNG lenh -> trigger 0074 khong hoan tien ve quy nhom. CAS theo version + nguoi nhan cu.
    c.env.DB.prepare(
      `UPDATE dat_don_hang SET nguoi_nhan_hang = ?1,
         tien_da_tra_email = CASE WHEN COALESCE(tien_da_tra, 0) > 0 THEN ?1 ELSE tien_da_tra_email END,
         version = version + 1, updated_at = ?2
       WHERE id = ?3 AND version = ?4 AND nguoi_nhan_hang = ?5`,
    ).bind(kh.email, now, id, don.version, don.nguoi_nhan_hang),
    c.env.DB.prepare(
      `INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
       SELECT id, trang_thai_hien_tai, ?, ?, ? FROM dat_don_hang WHERE id = ? AND nguoi_nhan_hang = ?`,
    ).bind(user.email, now, ghiChu, id, kh.email),
  ]);
  if (!cas.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);
  // Tong ngay / nhan chiet khau: nhom mat 1 don, KH tinh gia niem yet.
  await taiTinhPxkMoCuaKtv(c.env.DB, don.nguoi_nhan_hang, user.email);
  await taiTinhPxkMoCuaKtv(c.env.DB, kh.email, user.email);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, kh: { ma: kh.ma, sdt: kh.sdt, moi: kh.moi }, tien_chuyen_theo: tien });
});

export default khachLe;
