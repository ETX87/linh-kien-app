import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { computeAndStoreHash, getOrComputeHash } from "../lib/contentHash";
import { nowVN } from "../lib/vnTime";
import { resyncKhuVucDerivedFieldsForAll, resyncKhuVucDerivedFieldsForEmail } from "../lib/khuVucSync";

// Port rut gon tu backend/src/routes/settings.ts cua he DVBH goc (phan "Danh sach KTV") - danh ba
// ky thuat vien/Tram/CTV/Ve tinh dung de chon "nguoi nhan hang" trong module Dat mua linh kien.
// Schema GIU NGUYEN so voi he goc (bao gom sdt/ghi_chu du khong dung nhieu o he nay) de giam rui ro
// khi port - xem CLAUDE.md muc "Nguon goc tach he thong". Du lieu ban dau COPY 1 LAN tu he goc luc
// trien khai (xem DEPLOY.md), sau do 2 he KHONG dong bo tiep.
const settingsKtv = new Hono<{ Bindings: Env }>();
settingsKtv.use("*", verifySessionMiddleware, loadUser);
const adminOnly = requireRole("Admin");

async function refreshHash(db: D1Database) {
  const { results } = await db.prepare("SELECT * FROM ktv_lien_he ORDER BY ma_ktv").all();
  await computeAndStoreHash(db, "ktv_lien_he", results);
}

// "Giam sat quan ly" - users.giam_sat_quan_ly la NGUON DUY NHAT phan quyen thuc su (scopeDatMua.ts/
// datMuaLinhKien.ts/phieuXuatKho.ts van doc thang cot nay, khong doi) - LEFT JOIN sang users qua
// email_dang_nhap de tra them gia tri THAT dang ap dung (giam_sat_quan_ly_hien_tai), chi de HIEN THI
// (frontend hien read-only). Tu Phase 4 (2026-08-26) cot users.giam_sat_quan_ly nay KHONG con do
// Admin nhap tay o Users module nua - duoc TU DONG dong bo tu khu_vuc_ma cua chinh dong ktv_lien_he
// nay (xem lib/khuVucSync.ts, goi o cuoi PATCH .../dat-mua-lk ben duoi). Cot
// ktv_lien_he.giam_sat_quan_ly cu van giu nguyen trong DB/response nhung chi la ghi chu danh ba.
//
// GET /?search=&cap=1|2&khu_vuc_ma=&page=&pageSize= (loc/phan trang them 2026-08-26, muc 1-2: tach
// the "KTV hien truong" can tim kiem/loc tren danh sach co the rat dai - truoc day tra het khong loc
// gi ca). "cap=1" = KTV/CTV/Tram, "cap=2" = Ve tinh (dung dung tinh than "KTV cap 1 tuong duong
// nhau"/"Ve tinh la KTV cap 2" cua yeu cau). KHONG truyen page -> giu nguyen hanh vi cu (tra het).
settingsKtv.get("/", async (c) => {
  const search = c.req.query("search")?.trim();
  const cap = c.req.query("cap")?.trim();
  const khuVucMa = c.req.query("khu_vuc_ma")?.trim();
  const pageParam = c.req.query("page");

  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (search) {
    conditions.push(
      "(LOWER(k.ma_ktv) LIKE LOWER(?) OR LOWER(COALESCE(k.ten_hien_thi,'')) LIKE LOWER(?) OR LOWER(COALESCE(k.sdt,'')) LIKE LOWER(?) OR LOWER(COALESCE(k.gmail,'')) LIKE LOWER(?) OR LOWER(COALESCE(k.email_dang_nhap,'')) LIKE LOWER(?))",
    );
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (cap === "1") {
    conditions.push("COALESCE(k.vai_tro_ktv, 'KTV') != 'Ve tinh'");
  } else if (cap === "2") {
    conditions.push("k.vai_tro_ktv = 'Ve tinh'");
  }
  if (khuVucMa) {
    // Ho tro nhieu ma cach nhau boi dau phay (them 2026-08-27, khoi "KTV khu vực của tôi" o
    // TrangChuTab.tsx - 1 GS/TN/Kho/Ke toan co the phu trach NHIEU Khu vuc cung luc).
    const khuVucList = khuVucMa.split(",").map((s) => s.trim()).filter(Boolean);
    if (khuVucList.length === 1) {
      conditions.push("k.khu_vuc_ma = ?");
      binds.push(khuVucList[0]);
    } else if (khuVucList.length > 1) {
      conditions.push(`k.khu_vuc_ma IN (${khuVucList.map(() => "?").join(",")})`);
      binds.push(...khuVucList);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const baseSql = `FROM ktv_lien_he k LEFT JOIN users u ON u.email = k.email_dang_nhap ${where}`;
  if (!pageParam) {
    const { results } = await c.env.DB.prepare(
      `SELECT k.*, u.giam_sat_quan_ly as giam_sat_quan_ly_hien_tai ${baseSql} ORDER BY k.ma_ktv`,
    )
      .bind(...binds)
      .all();
    return c.json({ rows: results });
  }

  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 50)));
  const offset = (page - 1) * pageSize;
  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total ${baseSql}`).bind(...binds).first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT k.*, u.giam_sat_quan_ly as giam_sat_quan_ly_hien_tai ${baseSql} ORDER BY k.ma_ktv LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

settingsKtv.get("/version", async (c) => {
  const hash = await getOrComputeHash(c.env.DB, "ktv_lien_he", "ktv_lien_he", "ma_ktv");
  return c.json({ hash });
});

settingsKtv.post("/", adminOnly, async (c) => {
  const body = await c.req.json<{ ma_ktv: string; ten_hien_thi?: string; sdt?: string; ghi_chu?: string }>();
  if (!body.ma_ktv?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, sdt, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(ma_ktv) DO UPDATE SET
       ten_hien_thi = excluded.ten_hien_thi, sdt = excluded.sdt, ghi_chu = excluded.ghi_chu,
       nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat
     RETURNING *`,
  )
    .bind(body.ma_ktv.trim(), body.ten_hien_thi?.trim() || null, body.sdt?.trim() || null, body.ghi_chu?.trim() || null, user.email, nowVN())
    .first();

  await refreshHash(c.env.DB);
  return c.json(row, 201);
});

// Cap tai khoan "users" PLACEHOLDER cho 1 KTV da ghep email_dang_nhap nhung CHUA TUNG dang nhap
// Google that - can thiet vi dat_don_hang.nguoi_nhan_hang/phieu_xuat_kho.nguoi_nhan_hang la FK THAT
// toi users(email). Khong co placeholder nay, "Nguoi nhan hang (tao ho)" se rong voi KTV chua tung
// mo app. trang_thai_duyet = 'Da duyet' NGAY (yeu cau 2026-08-25, hang muc #2: Admin da chu dong gan
// email dang nhap + vai tro luc nay roi nen khong can duyet lai lan 2 o Users module - khac truoc day
// giu "Cho duyet" cho toi khi Admin duyet that hoac chinh KTV do tu dang nhap). KHONG con nhan/ghi
// giam_sat_quan_ly o day (hang muc #3: users.giam_sat_quan_ly la nguon duy nhat, Admin gan rieng sau
// trong Users module) - da bo luon filterValidGsEmails() vi khong con noi nao can nua.
// FIX 2026-08-26 (phat hien tu bao cao "chờ duyệt vẫn có hàng loạt ktv"): truoc day dung
// "ON CONFLICT DO NOTHING" nen KHONG BAO GIO tai kich hoat 1 dong users co san dang "Cho duyet" (vd
// tao tu dot copy du lieu ban dau hoac tu 1 lan import truoc khi co quy tac "Da duyet NGAY") - KTV do
// bi ket vinh vien o "Cho duyet" cho toi khi TU dang nhap that (chi auth.ts co logic tai kich hoat).
// Doi sang DO UPDATE voi CASE WHEN GIONG HET pattern da dung dung o auth.ts (dong 102-122) de dam bao
// ca 2 duong (Admin gan email_dang_nhap TRUOC, hoac KTV tu dang nhap TRUOC) deu kich hoat dung.
async function provisionPlaceholderUser(
  db: D1Database,
  args: { email: string; ten: string | null; vaiTroKtv: string | null },
): Promise<D1PreparedStatement> {
  const laVeTinh = args.vaiTroKtv === "Ve tinh";
  const laKtvDvbh = laVeTinh ? 0 : 1;
  return db
    .prepare(
      `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, la_ktv_dvbh, la_ve_tinh)
       VALUES (?, ?, NULL, 'Da duyet', ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         ten = CASE WHEN trang_thai_duyet = 'Cho duyet' THEN excluded.ten ELSE ten END,
         trang_thai_duyet = CASE WHEN trang_thai_duyet = 'Cho duyet' THEN 'Da duyet' ELSE trang_thai_duyet END,
         la_ktv_dvbh = CASE WHEN trang_thai_duyet = 'Cho duyet' THEN excluded.la_ktv_dvbh ELSE la_ktv_dvbh END,
         la_ve_tinh = CASE WHEN trang_thai_duyet = 'Cho duyet' THEN excluded.la_ve_tinh ELSE la_ve_tinh END`,
    )
    .bind(args.email, args.ten, laKtvDvbh, laVeTinh ? 1 : 0);
}

// POST /api/settings/ktv-lien-he/bulk-import - { rows: [{ma_ktv, ten_hien_thi?, sdt?, ghi_chu?,
// vai_tro_ktv?, gmail?, giam_sat_quan_ly?, email_dang_nhap?, ma_misa?}], offset } - nhap/cap nhat
// HANG LOAT danh ba KTV tu file Excel (vd export tu he bao hanh goc), UPSERT theo ma_ktv (chay lai
// nhieu lan an toan). Neu co email_dang_nhap, cap luon "users" placeholder qua provisionPlaceholderUser
// - GIONG HET logic PATCH /:ma/dat-mua-lk o tren, chi khac o cho lam theo tung chunk. Chunk 25 dong/
// lan (thuan ghi DB, khong goi ngoai).
//
// FIX (phan hoi 2026-08-28: "import theo số cột trong file, cột không có trong file để nguyên") -
// TRUOC DAY chi khu_vuc_ma/cong_no moi "giu nguyen neu khong truyen" (COALESCE/CASE WHEN), moi truong
// con lai (ten_hien_thi, sdt, ghi_chu, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap) OVERWRITE
// THANG bang excluded.X - neu file import chi co cot "Mã KTV"+"Tên hiển thị" (khong co cot SĐT/Ghi
// chú/...), pickKtvField() o frontend tra ve undefined cho cac cot thieu -> gui len day thanh
// null -> XOA MAT du lieu cu cua CA CAC TRUONG KHONG CO Y DINH SUA. Doi TOAN BO cac truong con lai
// sang cung 1 pattern COALESCE(excluded.X, ktv_lien_he.X) - dong bo voi khu_vuc_ma/cong_no da co san,
// dam bao "cot khong co trong file = giu nguyen gia tri cu" cho MOI truong, dung nhu yeu cau. Danh
// doi CHAP NHAN DUOC: khong the dung import de XOA TRANG 1 truong da co gia tri (vd muon xoa Ghi chú
// cu) - phai sua tay tung dong o Modal "Sửa KTV", giong han che da co san voi khu_vuc_ma/cong_no.
settingsKtv.post("/bulk-import", adminOnly, async (c) => {
  const body = await c.req.json<{
    rows: {
      ma_ktv: string; ten_hien_thi?: string; sdt?: string; ghi_chu?: string;
      vai_tro_ktv?: string; gmail?: string; giam_sat_quan_ly?: string; email_dang_nhap?: string;
      khu_vuc_ma?: string; cong_no?: number; ma_misa?: string; ten_misa?: string;
    }[];
    offset: number;
  }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const CHUNK_SIZE = 25;
  const offset = Math.max(0, body.offset ?? 0);
  const chunk = body.rows.slice(offset, offset + CHUNK_SIZE);
  const user = c.get("user");
  const now = nowVN();
  const VAI_TRO_KTV_VALUES = ["KTV", "CTV", "Tram", "Ve tinh"];

  let success = 0;
  let errorCount = 0;
  const details: { ma_ktv: string; status: string }[] = [];

  for (const row of chunk) {
    const ma = row.ma_ktv?.trim();
    if (!ma) {
      errorCount++;
      details.push({ ma_ktv: "(rỗng)", status: "thieu_ma" });
      continue;
    }
    const vaiTroKtv = row.vai_tro_ktv?.trim() || null;
    if (vaiTroKtv && !VAI_TRO_KTV_VALUES.includes(vaiTroKtv)) {
      errorCount++;
      details.push({ ma_ktv: ma, status: "vai_tro_khong_hop_le" });
      continue;
    }
    const tenHienThi = row.ten_hien_thi?.trim() || null;
    const giamSatQuanLy = row.giam_sat_quan_ly?.trim() || null;
    const emailDangNhap = row.email_dang_nhap?.trim() || null;
    // khu_vuc_ma/cong_no (them 2026-08-26) - CHI cap nhat khi co truyen trong dong Excel (undefined =
    // giu nguyen gia tri cu, khac cac truong khac o tren vi day la 2 truong MOI, file import cu chua
    // co cot nay se khong vo tinh xoa mat du lieu da gan tay truoc do qua PATCH /:ma/dat-mua-lk).
    const khuVucMa = row.khu_vuc_ma?.trim() || null;
    const maMisa = row.ma_misa?.trim() || null;
    const tenMisa = row.ten_misa?.trim() || null;
    try {
      await c.env.DB.prepare(
        `INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, sdt, ghi_chu, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap, khu_vuc_ma, cong_no, cong_no_cap_nhat_luc, ma_misa, ten_misa, nguoi_cap_nhat, ngay_cap_nhat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ma_ktv) DO UPDATE SET
           ten_hien_thi = COALESCE(excluded.ten_hien_thi, ktv_lien_he.ten_hien_thi),
           sdt = COALESCE(excluded.sdt, ktv_lien_he.sdt),
           ghi_chu = COALESCE(excluded.ghi_chu, ktv_lien_he.ghi_chu),
           gmail = COALESCE(excluded.gmail, ktv_lien_he.gmail),
           vai_tro_ktv = COALESCE(excluded.vai_tro_ktv, ktv_lien_he.vai_tro_ktv),
           giam_sat_quan_ly = COALESCE(excluded.giam_sat_quan_ly, ktv_lien_he.giam_sat_quan_ly),
           email_dang_nhap = COALESCE(excluded.email_dang_nhap, ktv_lien_he.email_dang_nhap),
           khu_vuc_ma = COALESCE(excluded.khu_vuc_ma, ktv_lien_he.khu_vuc_ma),
           cong_no = CASE WHEN excluded.cong_no IS NOT NULL THEN excluded.cong_no ELSE ktv_lien_he.cong_no END,
           cong_no_cap_nhat_luc = CASE WHEN excluded.cong_no IS NOT NULL THEN excluded.cong_no_cap_nhat_luc ELSE ktv_lien_he.cong_no_cap_nhat_luc END,
           ma_misa = COALESCE(excluded.ma_misa, ktv_lien_he.ma_misa),
           ten_misa = COALESCE(excluded.ten_misa, ktv_lien_he.ten_misa),
           nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat`,
      )
        .bind(
          ma, tenHienThi, row.sdt?.trim() || null, row.ghi_chu?.trim() || null, row.gmail?.trim() || null, vaiTroKtv, giamSatQuanLy, emailDangNhap,
          khuVucMa, row.cong_no ?? null, row.cong_no !== undefined ? now : null, maMisa, tenMisa, user.email, now,
        )
        .run();

      if (emailDangNhap) {
        await provisionPlaceholderUser(c.env.DB, { email: emailDangNhap, ten: tenHienThi, vaiTroKtv }).then((stmt) => stmt.run());
      }
      success++;
      details.push({ ma_ktv: ma, status: "thanh_cong" });
    } catch {
      errorCount++;
      details.push({ ma_ktv: ma, status: "loi_ghi_db" });
    }
  }

  const nextOffset = offset + CHUNK_SIZE;
  const done = nextOffset >= body.rows.length;
  if (done) {
    await refreshHash(c.env.DB);
    // Phase 4: 1 lan duy nhat sau khi CA file import xong (khong phai tung chunk) - du lieu khu_vuc_ma
    // co the anh huong nhieu dong cung luc, resyncKhuVucDerivedFieldsForAll re hon goi tung dong.
    await resyncKhuVucDerivedFieldsForAll(c.env.DB);
  }
  return c.json({ done, nextOffset, success, errorCount, details });
});

// PATCH /:ma/dat-mua-lk mo rong 2026-08-26 (muc 3+4+8): them khu_vuc_ma (Khu vuc gan truc tiep cho
// KTV nay), ktv_cap1_phu_trach (CHI y nghia khi vai_tro_ktv='Ve tinh' - tro toi ma_ktv cua 1 KTV cap 1
// phu trach truc tiep, xem migration 0009), cong_no (nhap tay/import - tu dong ghi
// cong_no_cap_nhat_luc = gio hien tai moi lan gia tri thay doi, KHONG co cron dong bo).
settingsKtv.patch("/:ma/dat-mua-lk", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{
    gmail?: string | null; vai_tro_ktv?: string | null; giam_sat_quan_ly?: string | null; email_dang_nhap?: string | null;
    khu_vuc_ma?: string | null; ktv_cap1_phu_trach?: string | null; cong_no?: number | null; ma_misa?: string | null; ten_misa?: string | null;
  }>();
  const existing = await c.env.DB.prepare(
    "SELECT ten_hien_thi, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap, khu_vuc_ma, ktv_cap1_phu_trach, cong_no, ma_misa, ten_misa FROM ktv_lien_he WHERE ma_ktv = ?",
  )
    .bind(ma)
    .first<{
      ten_hien_thi: string | null; gmail: string | null; vai_tro_ktv: string | null; giam_sat_quan_ly: string | null; email_dang_nhap: string | null;
      khu_vuc_ma: string | null; ktv_cap1_phu_trach: string | null; cong_no: number | null; ma_misa: string | null; ten_misa: string | null;
    }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  if (body.vai_tro_ktv !== undefined && body.vai_tro_ktv !== null && !["KTV", "CTV", "Tram", "Ve tinh"].includes(body.vai_tro_ktv)) {
    return c.json({ error: "INVALID_VAI_TRO_KTV" }, 400);
  }

  const next = {
    gmail: body.gmail !== undefined ? body.gmail?.trim() || null : existing.gmail,
    vai_tro_ktv: body.vai_tro_ktv !== undefined ? body.vai_tro_ktv : existing.vai_tro_ktv,
    giam_sat_quan_ly: body.giam_sat_quan_ly !== undefined ? body.giam_sat_quan_ly?.trim() || null : existing.giam_sat_quan_ly,
    email_dang_nhap: body.email_dang_nhap !== undefined ? body.email_dang_nhap?.trim() || null : existing.email_dang_nhap,
    khu_vuc_ma: body.khu_vuc_ma !== undefined ? body.khu_vuc_ma?.trim() || null : existing.khu_vuc_ma,
    ktv_cap1_phu_trach: body.ktv_cap1_phu_trach !== undefined ? body.ktv_cap1_phu_trach?.trim() || null : existing.ktv_cap1_phu_trach,
    cong_no: body.cong_no !== undefined ? body.cong_no : existing.cong_no,
    ma_misa: body.ma_misa !== undefined ? body.ma_misa?.trim() || null : existing.ma_misa,
    ten_misa: body.ten_misa !== undefined ? body.ten_misa?.trim() || null : existing.ten_misa,
  };

  if (next.khu_vuc_ma) {
    const khuVuc = await c.env.DB.prepare("SELECT ma FROM khu_vuc WHERE ma = ?").bind(next.khu_vuc_ma).first();
    if (!khuVuc) return c.json({ error: "KHU_VUC_NOT_FOUND" }, 400);
  }
  if (next.ktv_cap1_phu_trach) {
    if (next.ktv_cap1_phu_trach === ma) return c.json({ error: "INVALID_KTV_CAP1_PHU_TRACH" }, 400);
    const cap1 = await c.env.DB.prepare("SELECT vai_tro_ktv FROM ktv_lien_he WHERE ma_ktv = ?")
      .bind(next.ktv_cap1_phu_trach)
      .first<{ vai_tro_ktv: string | null }>();
    if (!cap1 || cap1.vai_tro_ktv === "Ve tinh") return c.json({ error: "INVALID_KTV_CAP1_PHU_TRACH" }, 400);
  }
  const congNoChanged = next.cong_no !== existing.cong_no;
  const congNoCapNhatLuc = congNoChanged ? nowVN() : undefined;

  await c.env.DB.prepare(
    `UPDATE ktv_lien_he SET gmail = ?, vai_tro_ktv = ?, giam_sat_quan_ly = ?, email_dang_nhap = ?, khu_vuc_ma = ?, ktv_cap1_phu_trach = ?, cong_no = ?, ma_misa = ?, ten_misa = ?${congNoChanged ? ", cong_no_cap_nhat_luc = ?" : ""} WHERE ma_ktv = ?`,
  )
    .bind(
      ...[next.gmail, next.vai_tro_ktv, next.giam_sat_quan_ly, next.email_dang_nhap, next.khu_vuc_ma, next.ktv_cap1_phu_trach, next.cong_no ?? null, next.ma_misa, next.ten_misa],
      ...(congNoChanged ? [congNoCapNhatLuc] : []),
      ma,
    )
    .run();

  if (next.email_dang_nhap) {
    await provisionPlaceholderUser(c.env.DB, { email: next.email_dang_nhap, ten: existing.ten_hien_thi, vaiTroKtv: next.vai_tro_ktv }).then((stmt) => stmt.run());
    // Phase 4: khu_vuc_ma/ktv_cap1_phu_trach vua doi (hoac tai khoan vua duoc provision) - dong bo
    // ngay giam_sat_quan_ly/tram_cha cua chinh tai khoan nay - xem lib/khuVucSync.ts.
    await resyncKhuVucDerivedFieldsForEmail(c.env.DB, next.email_dang_nhap);
  }
  // Ghep lai email_dang_nhap khac (hiem gap) - dong bo not "email cu" de xoa gia tri con sot lai
  // (email cu khong con ktv_lien_he nao tro toi nua nen resync se tra ve NULL, dung y nghia).
  if (existing.email_dang_nhap && existing.email_dang_nhap !== next.email_dang_nhap) {
    await resyncKhuVucDerivedFieldsForEmail(c.env.DB, existing.email_dang_nhap);
  }

  await refreshHash(c.env.DB);
  return c.json({ ok: true });
});

settingsKtv.post("/backfill-users", adminOnly, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT ten_hien_thi, vai_tro_ktv, email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL",
  ).all<{ ten_hien_thi: string | null; vai_tro_ktv: string | null; email_dang_nhap: string }>();
  const rows = results as { ten_hien_thi: string | null; vai_tro_ktv: string | null; email_dang_nhap: string }[];
  if (rows.length === 0) return c.json({ ok: true, checked: 0 });

  const statements = await Promise.all(
    rows.map((r) => provisionPlaceholderUser(c.env.DB, { email: r.email_dang_nhap, ten: r.ten_hien_thi, vaiTroKtv: r.vai_tro_ktv })),
  );
  await c.env.DB.batch(statements);
  await resyncKhuVucDerivedFieldsForAll(c.env.DB);
  return c.json({ ok: true, checked: rows.length });
});

settingsKtv.delete("/:ma", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const existing = await c.env.DB.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  await c.env.DB.prepare("DELETE FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).run();
  await refreshHash(c.env.DB);
  return c.json({ ok: true });
});

export default settingsKtv;
