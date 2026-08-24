import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { computeAndStoreHash, getOrComputeHash } from "../lib/contentHash";
import { nowVN } from "../lib/vnTime";

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

settingsKtv.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM ktv_lien_he ORDER BY ma_ktv").all();
  return c.json({ rows: results });
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
// mo app. trang_thai_duyet giu "Cho duyet" (chua cap quyen truy cap gi - loadUser.ts van chan cho
// den khi Admin duyet that hoac chinh KTV do tu dang nhap, luc do auth.ts se nang len "Da duyet").
async function filterValidGsEmails(db: D1Database, emails: (string | null)[]): Promise<Set<string>> {
  const distinct = [...new Set(emails.filter((e): e is string => !!e))];
  if (distinct.length === 0) return new Set();
  const { results } = await db
    .prepare(`SELECT email FROM users WHERE email IN (${distinct.map(() => "?").join(",")})`)
    .bind(...distinct)
    .all<{ email: string }>();
  return new Set((results as { email: string }[]).map((r) => r.email));
}

async function provisionPlaceholderUser(
  db: D1Database,
  args: { email: string; ten: string | null; vaiTroKtv: string | null; giamSatQuanLy: string | null },
): Promise<D1PreparedStatement> {
  const laVeTinh = args.vaiTroKtv === "Ve tinh";
  return db
    .prepare(
      `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, la_ktv_dvbh, la_ve_tinh, giam_sat_quan_ly)
       VALUES (?, ?, NULL, 'Cho duyet', ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(args.email, args.ten, laVeTinh ? 0 : 1, laVeTinh ? 1 : 0, args.giamSatQuanLy);
}

// POST /api/settings/ktv-lien-he/bulk-import - { rows: [{ma_ktv, ten_hien_thi?, sdt?, ghi_chu?,
// vai_tro_ktv?, gmail?, giam_sat_quan_ly?, email_dang_nhap?}], offset } - nhap/cap nhat HANG LOAT
// danh ba KTV tu file Excel (vd export tu he bao hanh goc), UPSERT theo ma_ktv (chay lai nhieu lan
// an toan). Neu co email_dang_nhap, cap luon "users" placeholder qua provisionPlaceholderUser -
// GIONG HET logic PATCH /:ma/dat-mua-lk o tren, chi khac o cho lam theo tung chunk. Chunk 25 dong/
// lan (thuan ghi DB, khong goi ngoai).
settingsKtv.post("/bulk-import", adminOnly, async (c) => {
  const body = await c.req.json<{
    rows: {
      ma_ktv: string; ten_hien_thi?: string; sdt?: string; ghi_chu?: string;
      vai_tro_ktv?: string; gmail?: string; giam_sat_quan_ly?: string; email_dang_nhap?: string;
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

  const validGs = await filterValidGsEmails(c.env.DB, chunk.map((r) => r.giam_sat_quan_ly?.trim() || null));

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
    try {
      await c.env.DB.prepare(
        `INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, sdt, ghi_chu, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap, nguoi_cap_nhat, ngay_cap_nhat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ma_ktv) DO UPDATE SET
           ten_hien_thi = excluded.ten_hien_thi, sdt = excluded.sdt, ghi_chu = excluded.ghi_chu,
           gmail = excluded.gmail, vai_tro_ktv = excluded.vai_tro_ktv,
           giam_sat_quan_ly = excluded.giam_sat_quan_ly, email_dang_nhap = excluded.email_dang_nhap,
           nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat`,
      )
        .bind(ma, tenHienThi, row.sdt?.trim() || null, row.ghi_chu?.trim() || null, row.gmail?.trim() || null, vaiTroKtv, giamSatQuanLy, emailDangNhap, user.email, now)
        .run();

      if (emailDangNhap) {
        await provisionPlaceholderUser(c.env.DB, {
          email: emailDangNhap,
          ten: tenHienThi,
          vaiTroKtv,
          giamSatQuanLy: giamSatQuanLy && validGs.has(giamSatQuanLy) ? giamSatQuanLy : null,
        }).then((stmt) => stmt.run());
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
  if (done) await refreshHash(c.env.DB);
  return c.json({ done, nextOffset, success, errorCount, details });
});

settingsKtv.patch("/:ma/dat-mua-lk", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ gmail?: string | null; vai_tro_ktv?: string | null; giam_sat_quan_ly?: string | null; email_dang_nhap?: string | null }>();
  const existing = await c.env.DB.prepare("SELECT ten_hien_thi, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap FROM ktv_lien_he WHERE ma_ktv = ?")
    .bind(ma)
    .first<{ ten_hien_thi: string | null; gmail: string | null; vai_tro_ktv: string | null; giam_sat_quan_ly: string | null; email_dang_nhap: string | null }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  if (body.vai_tro_ktv !== undefined && body.vai_tro_ktv !== null && !["KTV", "CTV", "Tram", "Ve tinh"].includes(body.vai_tro_ktv)) {
    return c.json({ error: "INVALID_VAI_TRO_KTV" }, 400);
  }

  const next = {
    gmail: body.gmail !== undefined ? body.gmail?.trim() || null : existing.gmail,
    vai_tro_ktv: body.vai_tro_ktv !== undefined ? body.vai_tro_ktv : existing.vai_tro_ktv,
    giam_sat_quan_ly: body.giam_sat_quan_ly !== undefined ? body.giam_sat_quan_ly?.trim() || null : existing.giam_sat_quan_ly,
    email_dang_nhap: body.email_dang_nhap !== undefined ? body.email_dang_nhap?.trim() || null : existing.email_dang_nhap,
  };

  await c.env.DB.prepare("UPDATE ktv_lien_he SET gmail = ?, vai_tro_ktv = ?, giam_sat_quan_ly = ?, email_dang_nhap = ? WHERE ma_ktv = ?")
    .bind(next.gmail, next.vai_tro_ktv, next.giam_sat_quan_ly, next.email_dang_nhap, ma)
    .run();

  if (next.email_dang_nhap) {
    const validGs = await filterValidGsEmails(c.env.DB, [next.giam_sat_quan_ly]);
    await provisionPlaceholderUser(c.env.DB, {
      email: next.email_dang_nhap,
      ten: existing.ten_hien_thi,
      vaiTroKtv: next.vai_tro_ktv,
      giamSatQuanLy: next.giam_sat_quan_ly && validGs.has(next.giam_sat_quan_ly) ? next.giam_sat_quan_ly : null,
    }).then((stmt) => stmt.run());
  }

  return c.json({ ok: true });
});

settingsKtv.post("/backfill-users", adminOnly, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT ten_hien_thi, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL",
  ).all<{ ten_hien_thi: string | null; vai_tro_ktv: string | null; giam_sat_quan_ly: string | null; email_dang_nhap: string }>();
  const rows = results as { ten_hien_thi: string | null; vai_tro_ktv: string | null; giam_sat_quan_ly: string | null; email_dang_nhap: string }[];
  if (rows.length === 0) return c.json({ ok: true, checked: 0 });

  const validGs = await filterValidGsEmails(c.env.DB, rows.map((r) => r.giam_sat_quan_ly));
  const statements = await Promise.all(
    rows.map((r) =>
      provisionPlaceholderUser(c.env.DB, {
        email: r.email_dang_nhap,
        ten: r.ten_hien_thi,
        vaiTroKtv: r.vai_tro_ktv,
        giamSatQuanLy: r.giam_sat_quan_ly && validGs.has(r.giam_sat_quan_ly) ? r.giam_sat_quan_ly : null,
      }),
    ),
  );
  await c.env.DB.batch(statements);
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
