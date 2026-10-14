import { Hono } from "hono";
import type { Env, VaiTro } from "../types";
import { VAI_TRO_VALUES } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { bumpVersions } from "../lib/dataVersions";
import { nowVN } from "../lib/vnTime";
import { resyncKhuVucDerivedFieldsForEmail } from "../lib/khuVucSync";
import { emailsTheoTen } from "../lib/timTheoTen";

// Port rut gon tu backend/src/routes/users.ts cua he DVBH goc - bo cac truong khong con ton tai o
// he nay (khu_vuc_phu_trach, la_ksnb_doi_tac, modules, co_the_import_tranh_chap - xem types.ts).
// Vai tro o he nay CHI con Admin/QC/Giam sat + 6 co vai tro nghiep vu (la_ktv_dvbh...la_tp_dvbh) -
// KHONG con nhom "CSKH/TN CSKH/TBP CSKH" nen bo luon logic auto-derive xem_danh_muc_lk theo nhom do.
const users = new Hono<{ Bindings: Env }>();
users.use("*", verifySessionMiddleware, loadUser, requireRole("Admin"));

// GET /api/users?tab=cho-duyet|da-duyet&search=&vai_tro=&nhom=van-phong|ktv&khu_vuc=&page=&pageSize=
// "nhom" (them 2026-08-26, muc 1-2 yeu cau tach 2 the quan ly) - loc theo 6 co la_ktv_dvbh/la_ve_tinh:
// "ktv" = 2 co do = 1, "van-phong" (mac dinh khi co truyen nhom) = ca 2 co = 0. Khong truyen "nhom" ->
// giu nguyen hanh vi cu (tra ca 2 nhom lan trong 1 danh sach, tab "cho-duyet" dung kieu nay vi tai
// khoan moi CHUA duoc Admin xac dinh thuoc nhom nao - xem PATCH /:email).
// "khu_vuc" - loc nhan vien van phong dang phu trach 1 khu vuc cu the: GS qua khu_vuc.gs_email, TN/
// Kho/Ke toan qua bang user_khu_vuc (xem migration 0009).
// "page"/"pageSize" (them 2026-08-26, LUON phan trang tu 2026-09-05 - phan hoi audit AUD-001: nhanh
// "tra het khong phan trang" da bi xoa sau khi ca 3 noi render danh sach o UsersModule.tsx deu chuyen
// sang dung PaginatedTable + truyen page/pageSize, xem VanPhongTab lam mau).
users.get("/", async (c) => {
  const tab = c.req.query("tab") ?? "cho-duyet";
  // .normalize("NFC") - xem giai thich day du o settingsKtv.ts GET / (cung fix, cung ngay).
  const search = c.req.query("search")?.trim().normalize("NFC");
  const vaiTro = c.req.query("vai_tro")?.trim();
  const nhom = c.req.query("nhom")?.trim();
  const khuVuc = c.req.query("khu_vuc")?.trim();
  const pageParam = c.req.query("page");

  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (tab === "cho-duyet") {
    conditions.push("trang_thai_duyet = ?");
    binds.push("Cho duyet");
  } else {
    conditions.push("trang_thai_duyet != 'Cho duyet'");
  }
  // Tai khoan NOI BO cua KH le (migration 0074, <ma>@khle.local) - chi lam nguoi nhan hang, khong phai nguoi dung.
  conditions.push("NOT EXISTS (SELECT 1 FROM khach_le kl WHERE kl.email = users.email)");

  if (search) {
    // + ten KHONG dau (2026-09-29, lib/timTheoTen.ts: users.ten/ten_misa + ten KTV trong danh ba).
    conditions.push("(LOWER(email) LIKE LOWER(?) OR LOWER(COALESCE(ten,'')) LIKE LOWER(?) OR email IN (SELECT value FROM json_each(?)))");
    binds.push(`%${search}%`, `%${search}%`, JSON.stringify(await emailsTheoTen(c.env.DB, search)));
  }
  if (vaiTro && (VAI_TRO_VALUES as readonly string[]).includes(vaiTro)) {
    conditions.push("vai_tro = ?");
    binds.push(vaiTro);
  }
  // "ktv_lien_he" = da co dong danh ba KTV tro toi email nay - the "KTV hiện trường" liet ke THEO danh ba
  // (khong theo bang users), nen tai khoan co co KTV/Ve tinh ma chua lien ket danh ba se khong hien o the nao.
  const CO_KTV_LIEN_HE = "EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = users.email)";
  if (nhom === "ktv") {
    conditions.push("(la_ktv_dvbh = 1 OR la_ve_tinh = 1)");
  } else if (nhom === "khong-thuoc-the") {
    // Them 2026-09-28 (phan hoi "tài khoản phamgiang3104@gmail.com đang không hiện ở bất kỳ đâu để quản lý").
    conditions.push(`(la_ktv_dvbh = 1 OR la_ve_tinh = 1) AND NOT ${CO_KTV_LIEN_HE}`);
  } else if (nhom === "van-phong") {
    conditions.push("la_ktv_dvbh = 0 AND la_ve_tinh = 0");
  }
  if (khuVuc) {
    conditions.push(
      "(email IN (SELECT gs_email FROM khu_vuc WHERE ma = ?) OR email IN (SELECT user_email FROM user_khu_vuc WHERE khu_vuc_ma = ?))",
    );
    binds.push(khuVuc, khuVuc);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(200, Math.max(1, (Math.trunc(Number(c.req.query("pageSize"))) || 50)));
  const offset = (page - 1) * pageSize;
  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM users ${where}`).bind(...binds).first<{ total: number }>();
  const { results } = await c.env.DB.prepare(`SELECT users.*, ${CO_KTV_LIEN_HE} as co_ktv_lien_he, (SELECT group_concat(k.ma_ktv, ',') FROM ktv_lien_he k WHERE k.email_dang_nhap = users.email) as ma_ktv_gan, (SELECT group_concat(khu_vuc_ma, ',') FROM user_khu_vuc WHERE user_email = users.email) as khu_vuc_gan FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/users/login-log?email=&page=&pageSize=
users.get("/login-log", async (c) => {
  const email = c.req.query("email")?.trim();
  const page = Math.max(1, (Math.trunc(Number(c.req.query("page"))) || 1));
  const pageSize = Math.min(100, Math.max(1, (Math.trunc(Number(c.req.query("pageSize"))) || 20)));
  const whereSql = email ? " WHERE email = ?" : " WHERE thoi_gian >= datetime('now', '-90 days')";
  const binds = email ? [email] : [];

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM login_log${whereSql}`).bind(...binds).first<{ total: number }>();
  const offset = (page - 1) * pageSize;
  const { results } = await c.env.DB.prepare(`SELECT * FROM login_log${whereSql} ORDER BY thoi_gian DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// PATCH /api/users/:email - duyet/tu choi/doi vai tro + role-flag. KHONG con nhan tram_cha/
// giam_sat_quan_ly tu body (Phase 4, 2026-08-26) - 2 cot nay tro thanh derived/read-only, tu dong
// tinh tu Khu vuc/KTV cap 1 phu trach cua ktv_lien_he (xem lib/khuVucSync.ts, goi tu
// routes/settingsKtv.ts/settingsDatMua.ts) thay vi Admin nhap tay o day nhu truoc.
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
    la_view?: boolean;
    la_mua_hang?: boolean;
    quan_ly_danh_muc_lk?: boolean;
    xem_danh_muc_lk?: boolean;
    ma_misa?: string | null;
    ten_misa?: string | null;
    khu_vuc_dat_hang?: string | null;
  }>();

  if (body.vai_tro !== undefined && body.vai_tro !== null && !(VAI_TRO_VALUES as readonly string[]).includes(body.vai_tro)) {
    return c.json({ error: "INVALID_VAI_TRO" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  // Khu vuc dat hang (0055): chi nhan ma khu vuc THAT, khong nhan "CHUA_CO" (dat thi nhu khong dat).
  const kvDatHang = body.khu_vuc_dat_hang?.trim();
  if (kvDatHang) {
    const kv = await c.env.DB.prepare("SELECT 1 FROM khu_vuc WHERE ma = ? AND ma <> 'CHUA_CO'").bind(kvDatHang).first();
    if (!kv) return c.json({ error: "KHU_VUC_KHONG_HOP_LE" }, 400);
  }

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
    la_view: body.la_view !== undefined ? (body.la_view ? 1 : 0) : existing.la_view,
    la_mua_hang: body.la_mua_hang !== undefined ? (body.la_mua_hang ? 1 : 0) : existing.la_mua_hang,
    quan_ly_danh_muc_lk: body.quan_ly_danh_muc_lk !== undefined ? (body.quan_ly_danh_muc_lk ? 1 : 0) : existing.quan_ly_danh_muc_lk,
    xem_danh_muc_lk: body.xem_danh_muc_lk !== undefined ? (body.xem_danh_muc_lk ? 1 : 0) : existing.xem_danh_muc_lk,
    ma_misa: body.ma_misa !== undefined ? body.ma_misa?.trim() || null : existing.ma_misa,
    ten_misa: body.ten_misa !== undefined ? body.ten_misa?.trim() || null : existing.ten_misa,
    khu_vuc_dat_hang: body.khu_vuc_dat_hang !== undefined ? body.khu_vuc_dat_hang?.trim() || null : (existing.khu_vuc_dat_hang as string | null),
  };

  await c.env.DB.prepare(
    "UPDATE users SET trang_thai_duyet = ?, vai_tro = ?, bi_khoa = ?, la_ktv_dvbh = ?, la_ve_tinh = ?, la_kho = ?, la_ke_toan = ?, la_tac_nghiep = ?, la_tp_dvbh = ?, la_view = ?, la_mua_hang = ?, quan_ly_danh_muc_lk = ?, xem_danh_muc_lk = ?, ma_misa = ?, ten_misa = ?, khu_vuc_dat_hang = ?, updated_at = ? WHERE email = ?",
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
      next.la_view,
      next.la_mua_hang,
      next.quan_ly_danh_muc_lk,
      next.xem_danh_muc_lk,
      next.ma_misa,
      next.ten_misa,
      next.khu_vuc_dat_hang,
      nowVN(),
      email,
    )
    .run();

  // Doi khu vuc dat hang -> trigger 0055 tinh lai khu_vuc_ma/email_gs cua don/PXK cu -> bump ca dat_mua_lk.
  const doiKhuVucDatHang = next.khu_vuc_dat_hang !== (existing.khu_vuc_dat_hang ?? null);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, doiKhuVucDatHang ? ["users", "dat_mua_lk"] : ["users"]));
  return c.json({ ok: true });
});

// POST /api/users/:email/chuyen-nhom-vai-tro - { to: "ktv" | "van_phong" } (them 2026-09-05, phan hoi
// "có trường hợp setup nhầm tài khoản gmail thành ktv, giờ cần chuyển thành tài khoản văn phòng" ->
// tong quat hoa thanh "xây dựng chức năng để admin hệ thống có thể chuyển đổi giữa 2 nhóm vai trò
// này"). "2 nhom" khop DUNG bo loc cua GET /users?nhom=ktv|van-phong o tren (la_ktv_dvbh/la_ve_tinh
// vs 5 co van phong). Gop nhieu buoc rieng le (truoc day phai tu PATCH /:email + PATCH
// /settings/ktv-lien-he/:ma/dat-mua-lk, de sot lien ket "mo coi" neu quen 1 buoc) thanh 1 hanh dong
// nguyen tu:
//  - "van_phong": tat la_ktv_dvbh/la_ve_tinh, HUY LIEN KET moi dong ktv_lien_he dang tro toi email
//    nay (email_dang_nhap = NULL - danh ba KTV van giu nguyen, chi mat "nguoi dang nhap"), dong bo lai
//    giam_sat_quan_ly/tram_cha ve NULL (khong con la KTV, xem lib/khuVucSync.ts). Admin tu chon co van
//    phong phu hop O BUOC SAU qua PATCH /:email thong thuong (mo lai EditUserModal - tai khoan gio da
//    hien trong "Nhân viên văn phòng" vi khong con thoa dieu kien nhom=ktv nua).
//  - "ktv": tat toan bo 5 co van phong, bat la_ktv_dvbh (KTV thuong, Admin tu doi thanh Ve tinh sau
//    neu can qua the "KTV hiện trường"), xoa moi Khu vuc phu trach van phong cu (user_khu_vuc - khong
//    con y nghia). KHONG tu tao dong ktv_lien_he (can them ma_ktv/ten... Admin tu lam qua "+ Thêm
//    KTV", dien Email đăng nhập = email nay).
// KHONG dong toi vai_tro (Admin/QC/Giam sat la khai niem doc lap, khong thuoc "2 nhom" nay) hay 2 co
// danh muc LK (quan_ly_danh_muc_lk/xem_danh_muc_lk).
users.post("/:email/chuyen-nhom-vai-tro", async (c) => {
  const email = decodeURIComponent(c.req.param("email"));
  const body = await c.req.json<{ to?: "ktv" | "van_phong" }>();
  if (body.to !== "ktv" && body.to !== "van_phong") return c.json({ error: "INVALID_TO" }, 400);

  const existing = await c.env.DB.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const now = nowVN();
  if (body.to === "van_phong") {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET la_ktv_dvbh = 0, la_ve_tinh = 0, updated_at = ? WHERE email = ?").bind(now, email),
      c.env.DB.prepare("UPDATE ktv_lien_he SET email_dang_nhap = NULL WHERE email_dang_nhap = ?").bind(email),
    ]);
    await resyncKhuVucDerivedFieldsForEmail(c.env.DB, email);
  } else {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE users SET la_ktv_dvbh = 1, la_kho = 0, la_ke_toan = 0, la_tac_nghiep = 0, la_tp_dvbh = 0, la_view = 0, la_mua_hang = 0, updated_at = ? WHERE email = ?",
      ).bind(now, email),
      c.env.DB.prepare("DELETE FROM user_khu_vuc WHERE user_email = ?").bind(email),
    ]);
  }

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["users"]));
  return c.json({ ok: true });
});

// POST /api/users/:email/dang-xuat-moi-thiet-bi (2026-10-08) - Admin thu hoi MOI phien dang nhap cua 1 tai khoan (mat
// may, nghi lo tai khoan, nhan vien nghi viec). Tang users.phien_ban_phien -> loadUser tu choi token cu (PHIEN_DA_THU_HOI).
users.post("/:email/dang-xuat-moi-thiet-bi", async (c) => {
  const email = decodeURIComponent(c.req.param("email"));
  const r = await c.env.DB.prepare("UPDATE users SET phien_ban_phien = phien_ban_phien + 1, updated_at = ? WHERE email = ?")
    .bind(nowVN(), email)
    .run();
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// GET/PUT /api/users/:email/khu-vuc - gan nhieu Khu vuc cho 1 nguoi TN/Kho/Ke toan (them 2026-08-26,
// muc 6 yeu cau: "co the gan dong thoi nhieu khu vuc, co the chong cheo"). CHI phuc vu tim
// kiem/thong ke/badge (xac nhan cua nguoi dung), KHONG gioi han quyen xu ly don - giu dung y nghia cu
// cua dat_mua_lk_phu_trach_gs (bang do van giu nguyen, chua doi sang co che nay, xem CLAUDE.md/ke
// hoach Phase 4-5). Thay the toan bo tap hop moi lan PUT (giong pattern GET/PUT /phu-trach-gs cua
// datMuaLinhKien.ts).
users.get("/:email/khu-vuc", async (c) => {
  const email = decodeURIComponent(c.req.param("email"));
  const { results } = await c.env.DB.prepare("SELECT khu_vuc_ma FROM user_khu_vuc WHERE user_email = ? ORDER BY khu_vuc_ma")
    .bind(email)
    .all<{ khu_vuc_ma: string }>();
  return c.json({ khu_vuc_ma: (results as { khu_vuc_ma: string }[]).map((r) => r.khu_vuc_ma) });
});

users.put("/:email/khu-vuc", async (c) => {
  const email = decodeURIComponent(c.req.param("email"));
  const existing = await c.env.DB.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<{ khu_vuc_ma?: string[] }>();
  if (!Array.isArray(body.khu_vuc_ma)) return c.json({ error: "INVALID_BODY" }, 400);

  const statements = [c.env.DB.prepare("DELETE FROM user_khu_vuc WHERE user_email = ?").bind(email)];
  for (const ma of new Set(body.khu_vuc_ma.map((m) => m.trim()).filter(Boolean))) {
    statements.push(c.env.DB.prepare("INSERT INTO user_khu_vuc (user_email, khu_vuc_ma) VALUES (?, ?)").bind(email, ma));
  }
  await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

export default users;
