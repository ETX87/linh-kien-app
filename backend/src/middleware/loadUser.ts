import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { AppUser, Env, VaiTro } from "../types";
import { applyViewAsOverride, isViewAsRole } from "../lib/viewAsPresets";

// Cookie rieng cho "xem thu vai tro" (khac SESSION_COOKIE) - xem lib/viewAsPresets.ts va
// routes/auth.ts POST /view-as. Dat const o day (khong phai viewAsPresets.ts) vi day la noi DUY
// NHAT doc cookie nay, viewAsPresets.ts chi chua logic override thuan tuy khong dung Hono Context.
export const VIEW_AS_COOKIE = "dvbh_view_as";
// "Xem như người dùng" (2026-09-30): cookie chua EMAIL tai khoan Admin muon xem nhu - xem cuoi loadUser().
export const VIEW_AS_USER_COOKIE = "dvbh_view_as_user";

// Request ghi van cho phep khi dang "xem nhu nguoi dung" - chi cac duong doi/thoat che do xem + dang xuat.
const XEM_NHU_CHO_GHI = new Set(["/api/auth/view-as", "/api/auth/view-as-user", "/api/auth/logout"]);

interface UserRow {
  email: string;
  ten: string | null;
  vai_tro: VaiTro | null;
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi";
  bi_khoa: number;
  la_ktv_dvbh: number;
  la_ve_tinh: number;
  la_kho: number;
  la_ke_toan: number;
  la_tac_nghiep: number;
  la_tp_dvbh: number;
  la_view: number;
  la_mua_hang: number;
  quan_ly_danh_muc_lk: number;
  xem_danh_muc_lk: number;
  tram_cha: string | null;
  giam_sat_quan_ly: string | null;
  nhan_tb_nhiem_vu: number;
  nhan_tb_lien_quan: number;
  nhan_tb_theo_doi: number;
}

const USER_COLUMNS =
  "email, ten, vai_tro, trang_thai_duyet, bi_khoa, la_ktv_dvbh, la_ve_tinh, la_kho, la_ke_toan, la_tac_nghiep, la_tp_dvbh, la_view, la_mua_hang, quan_ly_danh_muc_lk, xem_danh_muc_lk, tram_cha, giam_sat_quan_ly, nhan_tb_nhiem_vu, nhan_tb_lien_quan, nhan_tb_theo_doi";

export async function loadUser(c: Context<{ Bindings: Env }>, next: Next) {
  const email = c.get("email");
  await c.env.DB.prepare("PRAGMA foreign_keys = ON").run();

  let row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`).bind(email).first<UserRow>();

  if (!row) {
    const isBootstrapAdmin = email === c.env.BOOTSTRAP_ADMIN_EMAIL;
    row = await c.env.DB.prepare(
      `INSERT INTO users (email, vai_tro, trang_thai_duyet)
       VALUES (?, ?, ?)
       RETURNING ${USER_COLUMNS}`,
    )
      .bind(email, isBootstrapAdmin ? "Admin" : null, isBootstrapAdmin ? "Da duyet" : "Cho duyet")
      .first<UserRow>();
  }

  if (!row) return c.json({ error: "USER_LOAD_FAILED" }, 500);

  if (row.bi_khoa) {
    return c.json({ error: "DISABLED" }, 403);
  }
  if (row.trang_thai_duyet === "Cho duyet") {
    return c.json({ error: "PENDING_APPROVAL" }, 403);
  }
  if (row.trang_thai_duyet === "Tu choi") {
    return c.json({ error: "REJECTED" }, 403);
  }

  const user = toAppUser(row);
  const realIsAdmin = user.vai_tro === "Admin";
  c.set("realIsAdmin", realIsAdmin);
  c.set("realEmail", user.email);
  c.set("viewAsUser", null);

  // "Xem như người dùng" (2026-09-30, phan hoi "chon nhan vien A -> thay dung nhung gi he thong show va cap quyen cho
  // A, de test va huong dan nguoi dung"): CHI Admin THAT (doi chieu DB o moi request, khong tin cookie). `user` duoc
  // THAY HAN bang tai khoan A (email, co quyen, tram_cha, giam_sat_quan_ly...) nen moi scope/badge/menu doc
  // user.email tu dung nhu A. CHI DOC: moi request khong phai GET/HEAD bi chan (tru doi/thoat che do + dang xuat) -
  // neu cho ghi, don/log se mang email A du nguoi bam la Admin (gia mao danh tinh trong du lieu). Uu tien hon
  // viewAsRole. Tai khoan A bi khoa/chua duyet/khong ton tai -> bo qua (ve Admin that).
  const viewAsEmail = realIsAdmin ? getCookie(c, VIEW_AS_USER_COOKIE) : undefined;
  if (viewAsEmail && viewAsEmail !== user.email) {
    const target = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`).bind(viewAsEmail).first<UserRow>();
    if (target && !target.bi_khoa && target.trang_thai_duyet === "Da duyet") {
      const method = c.req.method;
      if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !XEM_NHU_CHO_GHI.has(c.req.path)) {
        return c.json({ error: "XEM_NHU_CHI_DOC" }, 403);
      }
      c.set("viewAsRole", null);
      c.set("viewAsUser", { email: target.email, ten: target.ten });
      c.set("user", toAppUser(target));
      await next();
      return;
    }
  }

  // "Xem thu vai tro" - CHI ap dung khi DB row THAT (chua bi override) la Admin, doc lai tu `user`
  // o tren (chua qua override nao) nen khong the chong override lien tuc du cookie con gia tri cu.
  const viewAsCookie = getCookie(c, VIEW_AS_COOKIE);
  if (realIsAdmin && isViewAsRole(viewAsCookie)) {
    c.set("viewAsRole", viewAsCookie);
    c.set("user", applyViewAsOverride(user, viewAsCookie));
  } else {
    c.set("viewAsRole", null);
    c.set("user", user);
  }
  await next();
}

function toAppUser(row: UserRow): AppUser {
  return {
    email: row.email,
    ten: row.ten,
    vai_tro: row.vai_tro,
    trang_thai_duyet: row.trang_thai_duyet,
    bi_khoa: !!row.bi_khoa,
    la_ktv_dvbh: !!row.la_ktv_dvbh,
    la_ve_tinh: !!row.la_ve_tinh,
    la_kho: !!row.la_kho,
    la_ke_toan: !!row.la_ke_toan,
    la_tac_nghiep: !!row.la_tac_nghiep,
    la_tp_dvbh: !!row.la_tp_dvbh,
    la_view: !!row.la_view,
    la_mua_hang: !!row.la_mua_hang,
    quan_ly_danh_muc_lk: !!row.quan_ly_danh_muc_lk,
    xem_danh_muc_lk: !!row.xem_danh_muc_lk,
    tram_cha: row.tram_cha ?? null,
    giam_sat_quan_ly: row.giam_sat_quan_ly ?? null,
    la_tram: false,
    nhan_tb_nhiem_vu: !!row.nhan_tb_nhiem_vu,
    nhan_tb_lien_quan: !!row.nhan_tb_lien_quan,
    nhan_tb_theo_doi: !!row.nhan_tb_theo_doi,
  };
}
