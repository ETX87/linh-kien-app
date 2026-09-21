import { Hono, type Context, type Next } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { khuVucViewEmailInSql } from "../lib/scopeDatMua";
import { nowVN } from "../lib/vnTime";
import { getMocTinhCongNo, danhGiaCongNo3Muc } from "../lib/congNoKtv";

// "Tồn kho KTV" (them 2026-08-29, phan hoi nguoi dung) - import hang ngay file "Tổng hợp tồn kho"
// xuat tu MISA (mot bao cao gom NHIEU khoi "Kho: ..." xep lien tiep, moi khoi la 1 KTV/tram - xem
// frontend/src/lib/tonKhoImport.ts). Anh xa cot "Mã kho" trong file toi dung KTV qua
// ktv_lien_he.ma_misa (KHONG them truong anh xa moi, xac nhan nguoi dung dung lai cot san co tu
// migration 0011). Moi lan import GHI DE toan bo bang ktv_ton_kho (khong giu lich su - xac nhan nguoi
// dung, giong quy uoc "cong no" hien co).
const ktvTonKho = new Hono<{ Bindings: Env }>();
// requireDatMuaLkArea (them 2026-08-29, chuyen module ra khoi Settings) - tai su dung DUNG middleware
// gate module "Dat mua linh kien" (Admin/QC/Giam sat/7 co nghiep vu) lam dieu kien vao module nay,
// vi day gio la 1 muc Sidebar rieng mo cho CUNG tap tai khoan do (xem App.tsx/navConfig.ts). Middleware
// nay CUNG tu chan moi request khong phai GET neu la_view la con duong DUY NHAT dua tai khoan vao -
// dung y, vi POST /import van rieng adminOrKeToan ben duoi.
ktvTonKho.use("*", verifySessionMiddleware, loadUser, requireDatMuaLkArea);
// Them 2026-09-21 (phan hoi "mo modules cong no ktv full quyen cho ke toan") - Import tồn kho MISA +
// toan bo CRUD "Kho công ty" (truoc day adminOnly) nay mo them cho la_ke_toan, giong dung nhom da
// duoc phep GET /ma-kho-chua-khop va PATCH /:ma/cong-no-misa (settingsKtv.ts). requireRole() khong
// dung duoc o day vi chi so sanh users.vai_tro (enum Admin/QC/Giam sat), khong biet ve co boolean
// la_ke_toan - phai tu kiem tra thang.
const adminOrKeToan = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const user = c.get("user");
  if (user.vai_tro !== "Admin" && !user.la_ke_toan) return c.json({ error: "FORBIDDEN" }, 403);
  await next();
};

// Pham vi XEM (them 2026-08-29, phan hoi nguoi dung: "Cấp quyền cho KTV tự xem công nợ bản thân.
// Giám sát xem được KTV theo khu vực của mình. Các vai trò còn lại có thể xem toàn bộ."):
// - Admin/QC/la_kho/la_ke_toan/la_tac_nghiep/la_tp_dvbh: khong gioi han (null).
// - Giam sat (vai_tro): CHI cac KTV ma users.giam_sat_quan_ly = email GS do - cot nay tu dong bo tu
//   khu_vuc.gs_email (xem lib/khuVucSync.ts va CLAUDE.md muc "Khu vuc"), dung y het nhanh Giam sat
//   cua scopePxkNguoiNhanHang() trong lib/scopeDatMua.ts.
// - KTV/Ve tinh (la_ktv_dvbh/la_ve_tinh): CHI dong cua chinh minh (khop qua ktv_lien_he.email_dang_nhap).
// - la_view: theo Khu vuc duoc gan (khuVucViewEmailInSql(), giong moi luong khac cua la_view trong
//   module Dat mua linh kien - KHONG mac dinh xem het).
// - Khac (khong thuoc nhom nao o tren, tuc chua co co/vai_tro hop le) -> khong thay gi (1=0), tuy
//   thuc te se khong xay ra vi requireDatMuaLkArea da chan tu truoc.
function scopeKtvTonKho(c: Context<{ Bindings: Env }>): { whereSql: string; binds: string[] } | null {
  const user = c.get("user");
  if (user.vai_tro === "Admin" || user.vai_tro === "QC" || user.la_kho || user.la_ke_toan || user.la_tac_nghiep || user.la_tp_dvbh) {
    return null;
  }
  if (user.vai_tro === "Giam sat") {
    return { whereSql: "k.email_dang_nhap IN (SELECT email FROM users WHERE giam_sat_quan_ly = ?)", binds: [user.email] };
  }
  if (user.la_ktv_dvbh || user.la_ve_tinh) {
    return { whereSql: "k.email_dang_nhap = ?", binds: [user.email] };
  }
  if (user.la_view) {
    return { whereSql: `k.email_dang_nhap IN ${khuVucViewEmailInSql()}`, binds: [user.email] };
  }
  return { whereSql: "1=0", binds: [] };
}

// GET /?search= - danh sach tong hop theo KTV (chi KTV DANG co du lieu ton kho, INNER JOIN) - kem
// Cong no/Ma MISA de doi chieu chung 1 man hinh (dung y "Tồn kho công nợ KTV" cua nguoi dung).
ktvTonKho.get("/", async (c) => {
  // .normalize("NFC") - xem giai thich day du o settingsKtv.ts GET / (cung fix, cung ngay).
  const search = c.req.query("search")?.trim().normalize("NFC");
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (search) {
    conditions.push("(LOWER(k.ma_ktv) LIKE LOWER(?) OR LOWER(COALESCE(k.ten_hien_thi,'')) LIKE LOWER(?) OR LOWER(COALESCE(k.ma_misa,'')) LIKE LOWER(?))");
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const scope = scopeKtvTonKho(c);
  if (scope) {
    conditions.push(scope.whereSql);
    binds.push(...scope.binds);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  // "Cong no thuc te"/"phat sinh"/"chot"/"danh gia" (them 04/09/2026, xem lib/congNoKtv.ts) - tinh
  // gop qua 2 CTE thay vi N+1 query rieng tung KTV (bang co the toi vai tram KTV). "phat_sinh" loc
  // theo moc tinh cong no (tham so ?3/?4, bind 2 lan cho dieu kien "IS NULL OR >") - giong dung logic
  // computeCongNoPhatSinh() nhung viet lai o day de gop 1 lan truy van duy nhat.
  const mocTinhCongNo = await getMocTinhCongNo(c.env.DB);
  const { results } = await c.env.DB.prepare(
    `WITH thuc_te AS (
       SELECT t2.ma_ktv, SUM(t2.cuoi_ky * COALESCE(lk.gia_tri_cong_no, 0)) as gia_tri
       FROM ktv_ton_kho t2
       LEFT JOIN linh_kien lk ON lk.ma_linh_kien = t2.ma_hang
       GROUP BY t2.ma_ktv
     ),
     phat_sinh AS (
       SELECT k2.ma_ktv, SUM(ddh.so_tien_cong_no) as gia_tri
       FROM dat_don_hang ddh
       JOIN ktv_lien_he k2 ON k2.email_dang_nhap = ddh.nguoi_nhan_hang
       WHERE ddh.loai_don = 'cong_no' AND ddh.trang_thai_hien_tai = 'TN da duyet'
         AND (? IS NULL OR ddh.updated_at > ?)
       GROUP BY k2.ma_ktv
     )
     SELECT k.ma_ktv, k.ten_hien_thi, k.ma_misa, k.ten_misa, k.cong_no, k.cong_no_cap_nhat_luc,
       COUNT(t.id) as so_ma_hang, SUM(t.cuoi_ky) as tong_cuoi_ky,
       COALESCE(tt.gia_tri, 0) as cong_no_thuc_te, COALESCE(ps.gia_tri, 0) as cong_no_phat_sinh
     FROM ktv_ton_kho t
     JOIN ktv_lien_he k ON k.ma_ktv = t.ma_ktv
     LEFT JOIN thuc_te tt ON tt.ma_ktv = k.ma_ktv
     LEFT JOIN phat_sinh ps ON ps.ma_ktv = k.ma_ktv
     ${where}
     GROUP BY k.ma_ktv
     ORDER BY tong_cuoi_ky DESC`,
  )
    .bind(mocTinhCongNo, mocTinhCongNo, ...binds)
    .all<{ cong_no: number | null; cong_no_thuc_te: number; cong_no_phat_sinh: number }>();

  const rows = results.map((r) => {
    const congNoChot = r.cong_no_thuc_te + r.cong_no_phat_sinh;
    return { ...r, cong_no_chot: congNoChot, danh_gia_cong_no: danhGiaCongNo3Muc(congNoChot, r.cong_no) };
  });
  return c.json({ rows });
});

// GET /import-meta - thong tin lan import gan nhat (ky bao cao/nguoi import/luc nao) - luu trong
// app_settings (migration 0004), khong can bang rieng cho 1 dong metadata.
ktvTonKho.get("/import-meta", async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ value: string }>();
  return c.json(row ? JSON.parse(row.value) : null);
});

// GET /ma-kho-chua-khop (them 2026-09-08) - danh sach ma kho da import nhung CHUA khop KTV nao
// (ma_ktv IS NULL, xem migration 0021), dung cho picker "chọn bổ sung Mã MISA" o UsersModule.tsx
// KtvTab - gate dung nhom duoc sua ma_misa (Admin/Ke toan, xem settingsKtv.ts PATCH /:ma/dat-mua-lk
// va /:ma/cong-no-misa), khong dung requireRole("Admin") vi Ke toan cung can goi duoc.
ktvTonKho.get("/ma-kho-chua-khop", async (c) => {
  const user = c.get("user");
  if (user.vai_tro !== "Admin" && !user.la_ke_toan) return c.json({ error: "FORBIDDEN" }, 403);
  const { results } = await c.env.DB.prepare(
    "SELECT ma_kho, MAX(ten_kho) as ten_kho, COUNT(*) as so_ma_hang FROM ktv_ton_kho WHERE ma_ktv IS NULL GROUP BY ma_kho ORDER BY ma_kho",
  ).all();
  return c.json({ rows: results });
});

// GET /:ma_ktv/chi-tiet - danh sach tung ma hang ton kho cua 1 KTV - kiem tra ma_ktv yeu cau nam
// trong pham vi scopeKtvTonKho() truoc khi tra du lieu (chi-tiet khong tu join ktv_lien_he nhu GET /,
// nen phai truy van rieng 1 lan qua bang ktv_lien_he de ap dung dung dieu kien).
ktvTonKho.get("/:ma_ktv/chi-tiet", async (c) => {
  const maKtv = c.req.param("ma_ktv");
  const scope = scopeKtvTonKho(c);
  if (scope) {
    const allowed = await c.env.DB.prepare(`SELECT 1 FROM ktv_lien_he k WHERE k.ma_ktv = ? AND ${scope.whereSql}`)
      .bind(maKtv, ...scope.binds)
      .first();
    if (!allowed) return c.json({ error: "FORBIDDEN" }, 403);
  }
  const { results } = await c.env.DB.prepare(
    "SELECT ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky FROM ktv_ton_kho WHERE ma_ktv = ? ORDER BY ten_hang",
  )
    .bind(maKtv)
    .all();
  return c.json({ rows: results });
});

// POST /import - { rows: [{ma_kho, ten_kho?, ma_hang, ten_hang?, dvt?, dau_ky?, nhap_kho?, xuat_kho?,
// cuoi_ky?}], offset, ky_tu_ngay?, ky_den_ngay? } - nhap hang loat theo chunk (giong pattern
// settingsKtv.ts /bulk-import). offset=0 XOA TRANG toan bo bang truoc (file import luon la "tổng
// hợp" day du, xem chu thich dau file) roi nhap lai tu dau.
// SUA (phan hoi 2026-09-08: "trường hợp không khớp mã KTV vẫn import vào, phần mã bỏ trống") - truoc
// day "Mã kho" khong khop ma_misa nao bi BO HAN (chi tra ve "unmatched" tam thoi trong response, khong
// luu server-side). Gio LUON insert (ma_ktv=null neu chua khop) - xem migration 0021 (them
// ma_kho/ten_kho, doi khoa duy nhat sang (ma_kho, ma_hang), ma_ktv nullable) va
// GET /ma-kho-chua-khop + lib/ktvTonKhoRelink.ts (Admin/Ke toan chon bo sung Mã MISA sau, khop lai
// ngay khong can doi import lai).
ktvTonKho.post("/import", adminOrKeToan, async (c) => {
  const body = await c.req.json<{
    rows: {
      ma_kho: string; ten_kho?: string; ma_hang: string; ten_hang?: string; dvt?: string;
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
    // Xoa cung luc voi ktv_ton_kho (cung 1 file import, xem giai thich duoi) - giu dung y "GHI DE
    // toan bo" cho ca 2 bang.
    await c.env.DB.prepare("DELETE FROM kho_cong_ty_ton_kho").run();
  }

  const chunk = body.rows.slice(offset, offset + CHUNK_SIZE);
  const { results: ktvRows } = await c.env.DB.prepare("SELECT ma_ktv, ma_misa FROM ktv_lien_he WHERE ma_misa IS NOT NULL AND ma_misa != ''")
    .all<{ ma_ktv: string; ma_misa: string }>();
  const maMisaToKtv = new Map(ktvRows.map((r) => [r.ma_misa.trim().toLowerCase(), r.ma_ktv]));
  // Them 2026-09-11 ("Kho công ty" - xem lib/tonKhoCongTy.ts) - cung 1 file MISA "Tổng hợp tồn kho"
  // co the chua LAN dong cua kho vat ly cong ty (vd "6803", "6804-MB") xen giua cac khoi cua tung
  // KTV. Dong khong khop ma_misa cua KTV nao (nhu cu) se thu khop TIEP voi kho_cong_ty.ma truoc khi
  // roi vao nhom "chua khop" that su - xem GET /ma-kho-chua-khop (WHERE ma_ktv IS NULL, khong doi).
  const { results: khoRows } = await c.env.DB.prepare("SELECT ma FROM kho_cong_ty").all<{ ma: string }>();
  const maKhoCongTySet = new Set(khoRows.map((r) => r.ma.trim().toLowerCase()));

  let matched = 0;
  const unmatched = new Set<string>();
  const statements = [];
  for (const row of chunk) {
    const maKho = row.ma_kho?.trim();
    const maHang = row.ma_hang?.trim();
    if (!maKho || !maHang) continue;
    const maKtv = maMisaToKtv.get(maKho.toLowerCase()) ?? null;
    if (maKtv) {
      matched++;
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO ktv_ton_kho (ma_ktv, ma_kho, ten_kho, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ma_kho, ma_hang) DO UPDATE SET
             ma_ktv = excluded.ma_ktv, ten_kho = excluded.ten_kho, ten_hang = excluded.ten_hang, dvt = excluded.dvt,
             dau_ky = excluded.dau_ky, nhap_kho = excluded.nhap_kho, xuat_kho = excluded.xuat_kho, cuoi_ky = excluded.cuoi_ky`,
        ).bind(
          maKtv, maKho, row.ten_kho?.trim() || null, maHang, row.ten_hang?.trim() || null, row.dvt?.trim() || null,
          row.dau_ky ?? null, row.nhap_kho ?? null, row.xuat_kho ?? null, row.cuoi_ky ?? null,
        ),
      );
    } else if (maKhoCongTySet.has(maKho.toLowerCase())) {
      matched++;
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO kho_cong_ty_ton_kho (kho_ma, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(kho_ma, ma_hang) DO UPDATE SET
             ten_hang = excluded.ten_hang, dvt = excluded.dvt,
             dau_ky = excluded.dau_ky, nhap_kho = excluded.nhap_kho, xuat_kho = excluded.xuat_kho, cuoi_ky = excluded.cuoi_ky`,
        ).bind(
          maKho, maHang, row.ten_hang?.trim() || null, row.dvt?.trim() || null,
          row.dau_ky ?? null, row.nhap_kho ?? null, row.xuat_kho ?? null, row.cuoi_ky ?? null,
        ),
      );
    } else {
      unmatched.add(maKho);
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO ktv_ton_kho (ma_ktv, ma_kho, ten_kho, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
           VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ma_kho, ma_hang) DO UPDATE SET
             ma_ktv = excluded.ma_ktv, ten_kho = excluded.ten_kho, ten_hang = excluded.ten_hang, dvt = excluded.dvt,
             dau_ky = excluded.dau_ky, nhap_kho = excluded.nhap_kho, xuat_kho = excluded.xuat_kho, cuoi_ky = excluded.cuoi_ky`,
        ).bind(
          maKho, row.ten_kho?.trim() || null, maHang, row.ten_hang?.trim() || null, row.dvt?.trim() || null,
          row.dau_ky ?? null, row.nhap_kho ?? null, row.xuat_kho ?? null, row.cuoi_ky ?? null,
        ),
      );
    }
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

// ---------- Kho cong ty (them 2026-09-11 - xem migration 0025 + lib/tonKhoCongTy.ts) ----------
// Doc: mo cho MOI vai tro co trong module (giong quy uoc GET /khu-vuc cua settingsDatMua.ts - day la
// du lieu tham chieu, khong nhay cam theo tung nguoi). Ghi (CRUD danh sach kho + gan Khu vuc): Admin
// ONLY, giong het khu_vuc.

// GET /kho-cong-ty - danh sach kho + Khu vuc da gan (mang ma), dung cho man CRUD.
ktvTonKho.get("/kho-cong-ty", async (c) => {
  const { results: khoRows } = await c.env.DB.prepare("SELECT * FROM kho_cong_ty ORDER BY bat_tat DESC, ma").all<{
    ma: string; ten: string; bat_tat: number; nguoi_cap_nhat: string | null; ngay_cap_nhat: string;
  }>();
  const { results: gan } = await c.env.DB.prepare("SELECT kho_ma, khu_vuc_ma FROM kho_cong_ty_khu_vuc").all<{ kho_ma: string; khu_vuc_ma: string }>();
  const khuVucByKho = new Map<string, string[]>();
  for (const g of gan) {
    const list = khuVucByKho.get(g.kho_ma) ?? [];
    list.push(g.khu_vuc_ma);
    khuVucByKho.set(g.kho_ma, list);
  }
  const rows = khoRows.map((k) => ({ ...k, khu_vuc_ma: khuVucByKho.get(k.ma) ?? [] }));
  return c.json({ rows });
});

// POST /kho-cong-ty - them/sua 1 kho (upsert theo ma, giong pattern POST /khu-vuc).
ktvTonKho.post("/kho-cong-ty", adminOrKeToan, async (c) => {
  const body = await c.req.json<{ ma: string; ten: string }>();
  if (!body.ma?.trim() || !body.ten?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO kho_cong_ty (ma, ten, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ma) DO UPDATE SET ten = excluded.ten, nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat
     RETURNING *`,
  )
    .bind(body.ma.trim(), body.ten.trim(), user.email, nowVN())
    .first();
  return c.json(row, 201);
});

// PATCH /kho-cong-ty/:ma - sua ten/bat_tat.
ktvTonKho.patch("/kho-cong-ty/:ma", adminOrKeToan, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ ten?: string; bat_tat?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM kho_cong_ty WHERE ma = ?").bind(ma).first<{ ten: string; bat_tat: number }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const next = {
    ten: body.ten !== undefined ? body.ten.trim() : existing.ten,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
  };
  const user = c.get("user");
  await c.env.DB.prepare("UPDATE kho_cong_ty SET ten = ?, bat_tat = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma = ?")
    .bind(next.ten, next.bat_tat, user.email, nowVN(), ma)
    .run();
  return c.json({ ok: true });
});

// PATCH /kho-cong-ty/:ma/khu-vuc - ghi DE toan bo danh sach Khu vuc kho nay phuc vu (khong phai
// them/bot tung dong - FE gui nguyen mang moi, don gian hon cho UI dang chip multi-select).
ktvTonKho.patch("/kho-cong-ty/:ma/khu-vuc", adminOrKeToan, async (c) => {
  const ma = c.req.param("ma");
  const existing = await c.env.DB.prepare("SELECT ma FROM kho_cong_ty WHERE ma = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const body = await c.req.json<{ khu_vuc_ma: string[] }>();
  if (!Array.isArray(body.khu_vuc_ma)) return c.json({ error: "INVALID_BODY" }, 400);
  const statements = [
    c.env.DB.prepare("DELETE FROM kho_cong_ty_khu_vuc WHERE kho_ma = ?").bind(ma),
    ...body.khu_vuc_ma.map((kv) => c.env.DB.prepare("INSERT INTO kho_cong_ty_khu_vuc (kho_ma, khu_vuc_ma) VALUES (?, ?)").bind(ma, kv)),
  ];
  await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

// GET /kho-cong-ty-ton-kho - tong hop ton kho theo tung kho (so ma hang, tong cuoi ky) - man hinh
// doc lap voi "Da khop mã kho" cua KTV (khac bang du lieu).
ktvTonKho.get("/kho-cong-ty-ton-kho", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT k.ma, k.ten, k.bat_tat, COUNT(t.id) as so_ma_hang, COALESCE(SUM(t.cuoi_ky), 0) as tong_cuoi_ky
     FROM kho_cong_ty k
     LEFT JOIN kho_cong_ty_ton_kho t ON t.kho_ma = k.ma
     GROUP BY k.ma
     ORDER BY k.bat_tat DESC, k.ma`,
  ).all();
  return c.json({ rows: results });
});

// GET /kho-cong-ty-ton-kho/:ma/chi-tiet - danh sach tung ma hang ton kho cua 1 kho.
ktvTonKho.get("/kho-cong-ty-ton-kho/:ma/chi-tiet", async (c) => {
  const ma = c.req.param("ma");
  const { results } = await c.env.DB.prepare(
    "SELECT ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky FROM kho_cong_ty_ton_kho WHERE kho_ma = ? ORDER BY ten_hang",
  )
    .bind(ma)
    .all();
  return c.json({ rows: results });
});

export default ktvTonKho;
