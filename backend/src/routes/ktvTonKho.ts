import { Hono, type Context, type Next } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { VIEW_CHUA_GAN_KHU_VUC_SQL, gsKhuVucXemThemSql, scopeKtvTonKho } from "../lib/scopeDatMua";
import { nowVN } from "../lib/vnTime";
import { SL_HO_TRO_0D_SQL, docCongNoTongHop } from "../lib/congNoKtv";
import { daTruTheoMaHang } from "../lib/tonKhoKtv";
import { maKtvTheoTen } from "../lib/timTheoTen";
import { quyVeMaChuan } from "../lib/linhKienXetDuyet";

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
// (2026-10-16) Than ham chuyen sang lib/scopeDatMua.ts (export scopeKtvTonKho) - dung chung voi drawer LK o Bang gia.

// GET /?search= - danh sach tong hop theo KTV (chi KTV DANG co du lieu ton kho, INNER JOIN) - kem
// Cong no/Ma MISA de doi chieu chung 1 man hinh (dung y "Tồn kho công nợ KTV" cua nguoi dung).
ktvTonKho.get("/", async (c) => {
  // .normalize("NFC") - xem giai thich day du o settingsKtv.ts GET / (cung fix, cung ngay).
  const search = c.req.query("search")?.trim().normalize("NFC");
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (search) {
    // + ten KHONG dau (2026-09-29, lib/timTheoTen.ts).
    conditions.push("(LOWER(k.ma_ktv) LIKE LOWER(?) OR LOWER(COALESCE(k.ten_hien_thi,'')) LIKE LOWER(?) OR LOWER(COALESCE(k.ma_misa,'')) LIKE LOWER(?) OR k.ma_ktv IN (SELECT value FROM json_each(?)))");
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`, JSON.stringify(await maKtvTheoTen(c.env.DB, search)));
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
  // Tinh tong hop cong no (2026-10-17): than truy van chuyen sang lib/congNoKtv.ts docCongNoTongHop() - dung CHUNG voi API doi tac
  // GET /api/partner/v1/cong-no-ktv (sua cong thuc 1 cho la doi ca 2).
  const rows = await docCongNoTongHop(c.env.DB, where, binds);
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
  // + TN (2026-09-30): TN cung sua duoc ma MISA (PATCH /:ma/cong-no-misa).
  if (user.vai_tro !== "Admin" && !user.la_ke_toan && !user.la_tac_nghiep) return c.json({ error: "FORBIDDEN" }, 403);
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
  // cong_no_thuc_te tung dong = cuoi_ky * gia_tri_cong_no cua linh kien (khop ma_hang = ma_linh_kien
  // TRUC TIEP, dung y het computeCongNoThucTe() o lib/congNoKtv.ts - tong cac dong nay chinh la
  // "Công nợ thực tế" hien o dau modal).
  const { results } = await c.env.DB.prepare(
    `SELECT t.ma_hang, t.ten_hang, t.dvt, t.dau_ky, t.nhap_kho, t.xuat_kho, t.cuoi_ky,
            (t.cuoi_ky - ${SL_HO_TRO_0D_SQL("t")}) * COALESCE(lk.gia_tri_cong_no, 0) as cong_no_thuc_te,
            ${SL_HO_TRO_0D_SQL("t")} as sl_ho_tro_0d
     FROM ktv_ton_kho t
     LEFT JOIN linh_kien lk ON lk.ma_linh_kien = t.ma_hang
     WHERE t.ma_ktv = ?
     ORDER BY t.ten_hang`,
  )
    .bind(maKtv)
    .all<Record<string, unknown> & { ma_hang: string; cuoi_ky: number | null }>();
  // Them 2026-09-28 (don "TRỪ CÔNG NỢ" tru ton kho CUA KTV - lib/tonKhoKtv.ts): "Đã trừ theo đơn" + "Tồn còn
  // lại" tung ma hang. Ma chi co don tru (khong co trong file ton) van hien them 1 dong (cuoi ky 0).
  const daTru = await daTruTheoMaHang(c.env.DB, maKtv);
  const rows: Record<string, unknown>[] = results.map((r) => {
    const tru = daTru.get(r.ma_hang)?.sl ?? 0;
    return { ...r, da_tru_theo_don: tru, ton_con_lai: (r.cuoi_ky ?? 0) - tru };
  });
  const coSan = new Set(results.map((r) => r.ma_hang));
  for (const [maHang, v] of daTru) {
    if (coSan.has(maHang)) continue;
    rows.push({ ma_hang: maHang, ten_hang: v.ten_lk, dvt: null, dau_ky: null, nhap_kho: null, xuat_kho: null, cuoi_ky: 0, cong_no_thuc_te: 0, da_tru_theo_don: v.sl, ton_con_lai: -v.sl });
  }
  return c.json({ rows });
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
    // total (2026-10-03): client moi gui `rows` = CHINH lo dang xu ly + total = tong so dong file (truoc day gui lai TOAN BO
    // file moi request, server slice - van ho tro cho tab cu chua tai lai: thieu total -> rows la ca file).
    total?: number;
    ky_tu_ngay?: string;
    ky_den_ngay?: string;
  }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const CHUNK_SIZE = 100;
  const offset = Math.max(0, body.offset ?? 0);
  const user = c.get("user");
  const kieuLo = typeof body.total === "number";
  const total = kieuLo ? Math.max(0, body.total!) : body.rows.length;
  if (kieuLo && body.rows.length > 500) return c.json({ error: "LO_QUA_LON" }, 400);
  if (kieuLo && body.rows.length === 0 && offset < total) return c.json({ error: "LO_RONG" }, 400); // tranh client lap vo han

  // Ghi vao BANG TAM (migration 0065) - lo dau xoa tam, lo cuoi thay bang that trong 1 batch. Dung giua chung = du lieu
  // ton kho cu con nguyen (truoc day lo dau xoa trang bang that).
  if (offset === 0) {
    await c.env.DB.batch([c.env.DB.prepare("DELETE FROM ktv_ton_kho_tam"), c.env.DB.prepare("DELETE FROM kho_cong_ty_ton_kho_tam")]);
  }

  const chunk = kieuLo ? body.rows : body.rows.slice(offset, offset + CHUNK_SIZE);
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
          `INSERT INTO ktv_ton_kho_tam (ma_ktv, ma_kho, ten_kho, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
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
          `INSERT INTO kho_cong_ty_ton_kho_tam (kho_ma, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
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
          `INSERT INTO ktv_ton_kho_tam (ma_ktv, ma_kho, ten_kho, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
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

  const nextOffset = offset + (kieuLo ? chunk.length : CHUNK_SIZE);
  const done = nextOffset >= total;
  if (done) {
    // Thay bang that + ghi meta trong CUNG 1 batch (giao dich) - "GHI DE toan bo" ca 2 bang nhu cu.
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM ktv_ton_kho"),
      c.env.DB.prepare(
        `INSERT INTO ktv_ton_kho (ma_ktv, ma_kho, ten_kho, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
         SELECT ma_ktv, ma_kho, ten_kho, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky FROM ktv_ton_kho_tam`,
      ),
      c.env.DB.prepare("DELETE FROM kho_cong_ty_ton_kho"),
      c.env.DB.prepare(
        `INSERT INTO kho_cong_ty_ton_kho (kho_ma, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky)
         SELECT kho_ma, ma_hang, ten_hang, dvt, dau_ky, nhap_kho, xuat_kho, cuoi_ky FROM kho_cong_ty_ton_kho_tam`,
      ),
      c.env.DB.prepare("DELETE FROM ktv_ton_kho_tam"),
      c.env.DB.prepare("DELETE FROM kho_cong_ty_ton_kho_tam"),
      c.env.DB.prepare(
        `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('ktv_ton_kho_import_meta', ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      ).bind(
        JSON.stringify({ ky_tu_ngay: body.ky_tu_ngay ?? null, ky_den_ngay: body.ky_den_ngay ?? null, so_dong: total }),
        user.email,
        nowVN(),
      ),
    ]);
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

// ---------- "Công nợ 0 đồng" (2026-10-05, migration 0069) ----------
// Ke toan/Admin khai bao chuong trinh: danh sach ma LK + SL ho tro (cho MOI KTV ap dung), khoang ngay, KTV ap dung (1 / nhieu /
// toan bo). Cong no thuc te tru phan nay TRUC TIEP luc doc (SL_HO_TRO_0D_SQL o lib/congNoKtv.ts) nen bat/tat/sua la so lieu doi
// ngay, khong can tinh lai/luu gi them.
type CongNo0dBody = {
  ten?: string | null;
  tu_ngay?: string;
  den_ngay?: string;
  tat_ca_ktv?: boolean;
  bat_tat?: boolean;
  ktv?: string[];
  lk?: { ma_linh_kien: string; so_luong: number }[];
  // Tu khoa (migration 0079): LK co ma (khop_ten: ca ten) chua tu khoa tu vao chuong trinh, ke ca LK them sau (trigger).
  tu_khoa?: { tu_khoa: string; so_luong: number; khop_ten?: boolean }[];
  // Ma LK khop tu khoa ma nguoi dung TAT (sai) - luu bat_tat = 0, trigger khong tu bat lai.
  tat_ma?: string[];
};
const NGAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function kiemTraCongNo0d(db: D1Database, b: CongNo0dBody): Promise<{ error: string } | {
  ten: string | null; tu: string; den: string; tatCa: boolean; ktv: string[]; lk: { ma: string; sl: number }[];
  tuKhoa: { tu_khoa: string; sl: number; khop_ten: number }[]; tatMa: string[];
}> {
  const tu = (b.tu_ngay ?? "").trim();
  const den = (b.den_ngay ?? "").trim();
  if (!NGAY_RE.test(tu) || !NGAY_RE.test(den)) return { error: "NGAY_KHONG_HOP_LE" };
  if (tu > den) return { error: "TU_NGAY_SAU_DEN_NGAY" };
  const tatCa = !!b.tat_ca_ktv;
  const lkVao = (b.lk ?? []).filter((d) => d && String(d.ma_linh_kien ?? "").trim());
  const tuKhoaVao = (b.tu_khoa ?? []).filter((d) => d && String(d.tu_khoa ?? "").trim());
  if (lkVao.length === 0 && tuKhoaVao.length === 0) return { error: "THIEU_LINH_KIEN" };
  // Tu khoa >= 3 ky tu (tranh 1-2 ky tu khop gan het danh muc), trung (khong phan biet hoa/thuong) -> gop.
  const tuKhoa: { tu_khoa: string; sl: number; khop_ten: number }[] = [];
  for (const d of tuKhoaVao) {
    const tk = String(d.tu_khoa).trim();
    if (tk.length < 3) return { error: "TU_KHOA_QUA_NGAN" };
    if (!Number.isInteger(d.so_luong) || d.so_luong <= 0) return { error: "SO_LUONG_KHONG_HOP_LE" };
    if (tuKhoa.some((x) => x.tu_khoa.toUpperCase() === tk.toUpperCase())) return { error: `TU_KHOA_TRUNG:${tk}` };
    tuKhoa.push({ tu_khoa: tk, sl: d.so_luong, khop_ten: d.khop_ten ? 1 : 0 });
  }
  const tatMa = [...new Set((b.tat_ma ?? []).map((m) => String(m).trim()).filter(Boolean))];
  if (lkVao.some((d) => !Number.isInteger(d.so_luong) || d.so_luong <= 0)) return { error: "SO_LUONG_KHONG_HOP_LE" };
  // Ma A da doi/gop sang B -> quy ve B (cung quy uoc moi bang co cot ma LK).
  const chuan = await quyVeMaChuan(db, lkVao.map((d) => String(d.ma_linh_kien).trim()));
  const gop = new Map<string, number>();
  for (const d of lkVao) {
    const ma = chuan.get(String(d.ma_linh_kien).trim()) ?? String(d.ma_linh_kien).trim();
    gop.set(ma, (gop.get(ma) ?? 0) + d.so_luong);
  }
  const { results: lkCo } = await db
    .prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify([...gop.keys()]))
    .all<{ ma_linh_kien: string }>();
  const lkCoSet = new Set(lkCo.map((r) => r.ma_linh_kien));
  const lkThieu = gop.size ? [...gop.keys()].filter((m) => !lkCoSet.has(m)) : [];
  if (lkThieu.length) return { error: `LINH_KIEN_KHONG_TON_TAI:${lkThieu.join(",")}` };
  let ktv: string[] = [];
  if (!tatCa) {
    ktv = [...new Set((b.ktv ?? []).map((m) => String(m).trim()).filter(Boolean))];
    if (ktv.length === 0) return { error: "THIEU_KTV" };
    const { results: ktvCo } = await db
      .prepare("SELECT ma_ktv FROM ktv_lien_he WHERE ma_ktv IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(ktv))
      .all<{ ma_ktv: string }>();
    if (ktvCo.length !== ktv.length) return { error: "KTV_KHONG_TON_TAI" };
  }
  const ten = (b.ten ?? "").trim() || null;
  return { ten, tu, den, tatCa, ktv, lk: [...gop].map(([ma, sl]) => ({ ma, sl })), tuKhoa, tatMa };
}

// Dieu kien "LK khop tu khoa" - CUNG cong thuc voi 2 trigger o migration 0079 (sua 1 cho phai sua ca 2). Alias: k = cong_no_0d_tu_khoa
// (hoac bang co cot tu_khoa/khop_ten), lk = linh_kien.
const LK_KHOP_TU_KHOA_SQL = `COALESCE(lk.trang_thai_ma, '') <> 'Da doi ma'
  AND (instr(UPPER(lk.ma_linh_kien), UPPER(k.tu_khoa)) > 0
       OR (k.khop_ten = 1 AND instr(UPPER(COALESCE(lk.ten_linh_kien, '')), UPPER(k.tu_khoa)) > 0))`;

// Ghi lai toan bo LK/KTV/tu khoa cua 1 chuong trinh: dong nhap tay truoc (thang dong tu khoa cung ma), roi LK khop tu khoa
// (INSERT OR IGNORE, ma trong tat_ma -> bat_tat = 0).
function lenhConCongNo0d(
  db: D1Database,
  id: number,
  v: { ktv: string[]; lk: { ma: string; sl: number }[]; tuKhoa: { tu_khoa: string; sl: number; khop_ten: number }[]; tatMa: string[] },
) {
  return [
    db.prepare("DELETE FROM cong_no_0d_lk WHERE cong_no_0d_id = ?").bind(id),
    db.prepare("DELETE FROM cong_no_0d_ktv WHERE cong_no_0d_id = ?").bind(id),
    db.prepare("DELETE FROM cong_no_0d_tu_khoa WHERE cong_no_0d_id = ?").bind(id),
    db
      .prepare("INSERT INTO cong_no_0d_lk (cong_no_0d_id, ma_linh_kien, so_luong) SELECT ?, json_extract(value, '$.ma'), json_extract(value, '$.sl') FROM json_each(?)")
      .bind(id, JSON.stringify(v.lk)),
    db
      .prepare(
        `INSERT INTO cong_no_0d_tu_khoa (cong_no_0d_id, tu_khoa, khop_ten, so_luong)
         SELECT ?, json_extract(value, '$.tu_khoa'), json_extract(value, '$.khop_ten'), json_extract(value, '$.sl') FROM json_each(?)`,
      )
      .bind(id, JSON.stringify(v.tuKhoa)),
    db
      .prepare(
        `INSERT OR IGNORE INTO cong_no_0d_lk (cong_no_0d_id, ma_linh_kien, so_luong, tu_khoa_id, bat_tat)
         SELECT k.cong_no_0d_id, lk.ma_linh_kien, k.so_luong, k.id,
                CASE WHEN lk.ma_linh_kien IN (SELECT value FROM json_each(?)) THEN 0 ELSE 1 END
         FROM cong_no_0d_tu_khoa k JOIN linh_kien lk ON ${LK_KHOP_TU_KHOA_SQL}
         WHERE k.cong_no_0d_id = ?
         ORDER BY k.id, lk.ma_linh_kien`,
      )
      .bind(JSON.stringify(v.tatMa), id),
    db.prepare("INSERT INTO cong_no_0d_ktv (cong_no_0d_id, ma_ktv) SELECT ?, value FROM json_each(?)").bind(id, JSON.stringify(v.ktv)),
  ];
}

// GET /cong-no-0d - danh sach chuong trinh kem LK/KTV (chuong trinh trung nhau thi cong don SL ho tro, xem SL_HO_TRO_0D_SQL).
ktvTonKho.get("/cong-no-0d", adminOrKeToan, async (c) => {
  const db = c.env.DB;
  const [rules, lks, ktvs, tks] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT r.*, date('now', '+7 hours') as hom_nay FROM cong_no_0d r ORDER BY r.bat_tat DESC, r.den_ngay DESC, r.id DESC`),
    db.prepare(
      `SELECT l.cong_no_0d_id, l.ma_linh_kien, l.so_luong, l.tu_khoa_id, l.bat_tat, lk.ten_linh_kien, lk.gia_tri_cong_no
       FROM cong_no_0d_lk l LEFT JOIN linh_kien lk ON lk.ma_linh_kien = l.ma_linh_kien
       ORDER BY l.cong_no_0d_id, l.ma_linh_kien`,
    ),
    db.prepare(
      `SELECT x.cong_no_0d_id, x.ma_ktv, k.ten_hien_thi, k.khu_vuc_ma FROM cong_no_0d_ktv x
       LEFT JOIN ktv_lien_he k ON k.ma_ktv = x.ma_ktv ORDER BY x.cong_no_0d_id, x.ma_ktv`,
    ),
    db.prepare("SELECT id, cong_no_0d_id, tu_khoa, khop_ten, so_luong FROM cong_no_0d_tu_khoa ORDER BY cong_no_0d_id, id"),
  ]);
  const rows = rules.results.map((r) => ({
    ...r,
    lk: lks.results.filter((l) => l.cong_no_0d_id === r.id),
    ktv: ktvs.results.filter((k) => k.cong_no_0d_id === r.id),
    tu_khoa: tks.results.filter((k) => k.cong_no_0d_id === r.id),
  }));
  return c.json({ rows });
});

// GET /cong-no-0d/khop?tu_khoa=&khop_ten=1 - xem truoc LK khop 1 tu khoa (form them/sua chuong trinh) - CUNG dieu kien
// LK_KHOP_TU_KHOA_SQL voi luc luu. Toi da 2000 dong.
ktvTonKho.get("/cong-no-0d/khop", adminOrKeToan, async (c) => {
  const tk = (c.req.query("tu_khoa") ?? "").trim();
  if (tk.length < 3) return c.json({ error: "TU_KHOA_QUA_NGAN" }, 400);
  const khopTen = c.req.query("khop_ten") === "1" ? 1 : 0;
  const { results } = await c.env.DB.prepare(
    `SELECT lk.ma_linh_kien, lk.ten_linh_kien, lk.gia_tri_cong_no, lk.bat_tat,
            instr(UPPER(lk.ma_linh_kien), UPPER(k.tu_khoa)) > 0 AS khop_ma
     FROM (SELECT ? AS tu_khoa, ? AS khop_ten) k JOIN linh_kien lk ON ${LK_KHOP_TU_KHOA_SQL}
     ORDER BY lk.ma_linh_kien LIMIT 2000`,
  )
    .bind(tk, khopTen)
    .all();
  return c.json({ rows: results });
});

// PATCH /cong-no-0d/:id/lk/:ma - { bat_tat } bat/tat nhanh 1 ma trong chuong trinh (ma khop tu khoa bi sai). Cong no tinh lai ngay.
ktvTonKho.patch("/cong-no-0d/:id/lk/:ma", adminOrKeToan, async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const ma = c.req.param("ma");
  const body = await c.req.json<{ bat_tat?: boolean }>().catch(() => ({}) as { bat_tat?: boolean });
  if (typeof body.bat_tat !== "boolean") return c.json({ error: "NOTHING_TO_UPDATE" }, 400);
  const [r] = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE cong_no_0d_lk SET bat_tat = ? WHERE cong_no_0d_id = ? AND ma_linh_kien = ?").bind(body.bat_tat ? 1 : 0, id, ma),
    c.env.DB.prepare("UPDATE cong_no_0d SET nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?").bind(user.email, nowVN(), id),
  ]);
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// GET /cong-no-0d/ktv-options - danh ba KTV de chon ap dung (kem khu vuc de loc nhanh).
ktvTonKho.get("/cong-no-0d/ktv-options", adminOrKeToan, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT k.ma_ktv, k.ten_hien_thi, k.ma_misa, k.ten_misa, k.khu_vuc_ma, k.vai_tro_ktv, COALESCE(k.ngung_hoat_dong, 0) as ngung_hoat_dong
     FROM ktv_lien_he k ORDER BY k.khu_vuc_ma, k.ten_hien_thi`,
  ).all();
  return c.json({ rows: results });
});

ktvTonKho.post("/cong-no-0d", adminOrKeToan, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CongNo0dBody>();
  const v = await kiemTraCongNo0d(c.env.DB, body);
  if ("error" in v) return c.json({ error: v.error }, 400);
  const now = nowVN();
  const row = await c.env.DB.prepare(
    `INSERT INTO cong_no_0d (ten, tu_ngay, den_ngay, tat_ca_ktv, bat_tat, nguoi_tao, ngay_tao, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(v.ten, v.tu, v.den, v.tatCa ? 1 : 0, body.bat_tat === false ? 0 : 1, user.email, now, user.email, now)
    .first<{ id: number }>();
  if (!row) return c.json({ error: "INSERT_FAILED" }, 500);
  try {
    await c.env.DB.batch(lenhConCongNo0d(c.env.DB, row.id, v));
  } catch (e) {
    await c.env.DB.prepare("DELETE FROM cong_no_0d WHERE id = ?").bind(row.id).run();
    throw e;
  }
  return c.json({ ok: true, id: row.id });
});

// PATCH /cong-no-0d/:id - chi { bat_tat } = bat/tat nhanh; co tu_ngay = sua toan bo (thay LK/KTV).
ktvTonKho.patch("/cong-no-0d/:id", adminOrKeToan, async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<CongNo0dBody>();
  const coSan = await c.env.DB.prepare("SELECT id FROM cong_no_0d WHERE id = ?").bind(id).first();
  if (!coSan) return c.json({ error: "NOT_FOUND" }, 404);
  const now = nowVN();
  if (body.tu_ngay === undefined) {
    if (body.bat_tat === undefined) return c.json({ error: "NOTHING_TO_UPDATE" }, 400);
    await c.env.DB.prepare("UPDATE cong_no_0d SET bat_tat = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?")
      .bind(body.bat_tat ? 1 : 0, user.email, now, id)
      .run();
    return c.json({ ok: true });
  }
  const v = await kiemTraCongNo0d(c.env.DB, body);
  if ("error" in v) return c.json({ error: v.error }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE cong_no_0d SET ten = ?, tu_ngay = ?, den_ngay = ?, tat_ca_ktv = ?, bat_tat = COALESCE(?, bat_tat),
         nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?`,
    ).bind(v.ten, v.tu, v.den, v.tatCa ? 1 : 0, body.bat_tat === undefined ? null : body.bat_tat ? 1 : 0, user.email, now, id),
    ...lenhConCongNo0d(c.env.DB, id, v),
  ]);
  return c.json({ ok: true });
});

ktvTonKho.delete("/cong-no-0d/:id", adminOrKeToan, async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM cong_no_0d_lk WHERE cong_no_0d_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM cong_no_0d_ktv WHERE cong_no_0d_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM cong_no_0d_tu_khoa WHERE cong_no_0d_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM cong_no_0d WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

export default ktvTonKho;
