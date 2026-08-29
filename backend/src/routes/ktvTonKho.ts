import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";

// "Tồn kho KTV" (them 2026-08-29, phan hoi nguoi dung) - import hang ngay file "Tổng hợp tồn kho"
// xuat tu MISA (mot bao cao gom NHIEU khoi "Kho: ..." xep lien tiep, moi khoi la 1 KTV/tram - xem
// frontend/src/lib/tonKhoImport.ts). Anh xa cot "Mã kho" trong file toi dung KTV qua
// ktv_lien_he.ma_misa (KHONG them truong anh xa moi, xac nhan nguoi dung dung lai cot san co tu
// migration 0011). Moi lan import GHI DE toan bo bang ktv_ton_kho (khong giu lich su - xac nhan nguoi
// dung, giong quy uoc "cong no" hien co).
const ktvTonKho = new Hono<{ Bindings: Env }>();
ktvTonKho.use("*", verifySessionMiddleware, loadUser);
const adminOnly = requireRole("Admin");

// GET /?search= - danh sach tong hop theo KTV (chi KTV DANG co du lieu ton kho, INNER JOIN) - kem
// Cong no/Ma MISA de doi chieu chung 1 man hinh (dung y "Tồn kho công nợ KTV" cua nguoi dung).
ktvTonKho.get("/", async (c) => {
  const search = c.req.query("search")?.trim();
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (search) {
    conditions.push("(LOWER(k.ma_ktv) LIKE LOWER(?) OR LOWER(COALESCE(k.ten_hien_thi,'')) LIKE LOWER(?) OR LOWER(COALESCE(k.ma_misa,'')) LIKE LOWER(?))");
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { results } = await c.env.DB.prepare(
    `SELECT k.ma_ktv, k.ten_hien_thi, k.ma_misa, k.ten_misa, k.cong_no, k.cong_no_cap_nhat_luc,
       COUNT(t.id) as so_ma_hang, SUM(t.cuoi_ky) as tong_cuoi_ky
     FROM ktv_ton_kho t
     JOIN ktv_lien_he k ON k.ma_ktv = t.ma_ktv
     ${where}
     GROUP BY k.ma_ktv
     ORDER BY tong_cuoi_ky DESC`,
  )
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

// GET /import-meta - thong tin lan import gan nhat (ky bao cao/nguoi import/luc nao) - luu trong
// app_settings (migration 0004), khong can bang rieng cho 1 dong metadata.
ktvTonKho.get("/import-meta", async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ value: string }>();
  return c.json(row ? JSON.parse(row.value) : null);
});

// GET /:ma_ktv/chi-tiet - danh sach tung ma hang ton kho cua 1 KTV.
ktvTonKho.get("/:ma_ktv/chi-tiet", async (c) => {
  const maKtv = c.req.param("ma_ktv");
  const { results } = await c.env.DB.prepare(
    "SELECT ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky FROM ktv_ton_kho WHERE ma_ktv = ? ORDER BY ten_hang",
  )
    .bind(maKtv)
    .all();
  return c.json({ rows: results });
});

// POST /import - { rows: [{ma_kho, ma_hang, ten_hang?, dvt?, dau_ky?, nhap_kho?, xuat_kho?,
// cuoi_ky?}], offset, ky_tu_ngay?, ky_den_ngay? } - nhap hang loat theo chunk (giong pattern
// settingsKtv.ts /bulk-import). offset=0 XOA TRANG toan bo bang truoc (file import luon la "tổng
// hợp" day du, xem chu thich dau file) roi nhap lai tu dau. "Mã kho" khong khop ma_misa nao duoc tra
// ve trong "unmatched" de FE gom lai bao cho Admin (khong luu server-side - chi co y nghia ngay sau
// lan import, khong can ton tai qua lan sau).
ktvTonKho.post("/import", adminOnly, async (c) => {
  const body = await c.req.json<{
    rows: {
      ma_kho: string; ma_hang: string; ten_hang?: string; dvt?: string;
      dau_ky?: number; nhap_kho?: number; xuat_kho?: number; cuoi_ky?: number;
    }[];
    offset: number;
    ky_tu_ngay?: string;
    ky_den_ngay?: string;
  }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const CHUNK_SIZE = 100;
  const offset = Math.max(0, body.offset ?? 0);
  const user = c.get("user");

  if (offset === 0) {
    await c.env.DB.prepare("DELETE FROM ktv_ton_kho").run();
  }

  const chunk = body.rows.slice(offset, offset + CHUNK_SIZE);
  const { results: ktvRows } = await c.env.DB.prepare("SELECT ma_ktv, ma_misa FROM ktv_lien_he WHERE ma_misa IS NOT NULL AND ma_misa != ''")
    .all<{ ma_ktv: string; ma_misa: string }>();
  const maMisaToKtv = new Map(ktvRows.map((r) => [r.ma_misa.trim().toLowerCase(), r.ma_ktv]));

  let matched = 0;
  const unmatched = new Set<string>();
  const statements = [];
  for (const row of chunk) {
    const maKho = row.ma_kho?.trim();
    const maHang = row.ma_hang?.trim();
    if (!maKho || !maHang) continue;
    const maKtv = maMisaToKtv.get(maKho.toLowerCase());
    if (!maKtv) {
      unmatched.add(maKho);
      continue;
    }
    matched++;
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO ktv_ton_kho (ma_ktv, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ma_ktv, ma_hang) DO UPDATE SET
           ten_hang = excluded.ten_hang, dvt = excluded.dvt, dau_ky = excluded.dau_ky,
           nhap_kho = excluded.nhap_kho, xuat_kho = excluded.xuat_kho, cuoi_ky = excluded.cuoi_ky`,
      ).bind(
        maKtv, maHang, row.ten_hang?.trim() || null, row.dvt?.trim() || null,
        row.dau_ky ?? null, row.nhap_kho ?? null, row.xuat_kho ?? null, row.cuoi_ky ?? null,
      ),
    );
  }
  if (statements.length) await c.env.DB.batch(statements);

  const nextOffset = offset + CHUNK_SIZE;
  const done = nextOffset >= body.rows.length;
  if (done) {
    await c.env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('ktv_ton_kho_import_meta', ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
      .bind(
        JSON.stringify({ ky_tu_ngay: body.ky_tu_ngay ?? null, ky_den_ngay: body.ky_den_ngay ?? null, so_dong: body.rows.length }),
        user.email,
        nowVN(),
      )
      .run();
  }
  return c.json({ done, nextOffset, matched, unmatched: Array.from(unmatched) });
});

export default ktvTonKho;
