import { Hono } from "hono";
import type { Env } from "../types";
import { partnerApiAuth } from "../lib/partnerApiAuth";
import { buildCaseTimeline } from "../lib/partnerTimeline";

// API tra cuu cho CAC HE THONG DOI TAC ben ngoai (khac hoan toan cac router khac trong app - khong
// dung verifySessionMiddleware/cookie, xac thuc rieng qua header "X-API-Key", xem
// lib/partnerApiAuth.ts). Quan ly key qua Admin (routes/settingsDatMua.ts, muc "Partner API keys").
//
// "v1" trong duong dan (khong phai "/api/partner/case-timeline" tho) - danh dau day la 1 HOP DONG
// CONG KHAI voi ben ngoai, versioned tu dau: doi cau truc response khong tuong thich nguoc thi mo
// "/v2" moi thay vi sua thang "/v1" (vo hieu moi tich hop dang chay).
const partnerApi = new Hono<{ Bindings: Env }>();
partnerApi.use("*", partnerApiAuth());

// GET /api/partner/v1/case-timeline?id=<case_id> - tra toan bo don hang gan voi case_id + timeline
// da chuan hoa (gop 4 bang log noi bo thanh 1 mang su kien phang, xem lib/partnerTimeline.ts). Luon
// 200 (orders: [] khi khong khop don nao) - case_id hop le ve cu phap, chi la chua/khong con du lieu
// noi bo nao gan voi no.
partnerApi.get("/v1/case-timeline", async (c) => {
  const caseId = c.req.query("id")?.trim();
  if (!caseId) return c.json({ error: "MISSING_ID" }, 400);
  const result = await buildCaseTimeline(c.env.DB, caseId);
  return c.json(result);
});

// ---- Ton kho (them 2026-10-08, he DVBH keo ve de hien "Tồn kho MB/MN" o module Ca thieu linh kien) ----
// Nguon = 2 bang ghi de moi lan Ke toan import file MISA (routes/ktvTonKho.ts POST /import): kho_cong_ty_ton_kho
// (kho cong ty) + ktv_ton_kho (kho KTV, ma_ktv NULL = ma kho chua khop KTV nao). "phien_ban" = updated_at cua
// app_settings 'ktv_ton_kho_import_meta' (gio VN) - doi khi va chi khi co lan import moi.

// GET /api/partner/v1/ton-kho/meta - re (1 dong), ben keo hoi dinh ky de biet co phien ban moi chua.
partnerApi.get("/v1/ton-kho/meta", async (c) => {
  const row = await c.env.DB.prepare("SELECT value, updated_at FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ value: string; updated_at: string }>();
  if (!row) return c.json({ phien_ban: null });
  const meta = JSON.parse(row.value) as { ky_tu_ngay?: string | null; ky_den_ngay?: string | null; so_dong?: number };
  return c.json({ phien_ban: row.updated_at, ky_tu_ngay: meta.ky_tu_ngay ?? null, ky_den_ngay: meta.ky_den_ngay ?? null, so_dong: meta.so_dong ?? null });
});

// GET /api/partner/v1/ton-kho?nguon=kho|ktv&after_id=0&limit=2000 - phan trang theo con tro id (khong OFFSET,
// moi trang chi doc dung so dong tra ve). Tra kem "phien_ban" moi trang: ben keo thay doi giua chung (Ke toan vua
// import lai) thi bo dot keo, thu lai sau - tranh tron 2 phien ban.
partnerApi.get("/v1/ton-kho", async (c) => {
  const nguon = c.req.query("nguon");
  if (nguon !== "kho" && nguon !== "ktv") return c.json({ error: "INVALID_NGUON" }, 400);
  const afterId = Math.max(0, Number(c.req.query("after_id") ?? 0) || 0);
  const limit = Math.min(5000, Math.max(1, Number(c.req.query("limit") ?? 2000) || 2000));
  const sql =
    nguon === "kho"
      ? `SELECT t.id, t.kho_ma AS ma_kho, k.ten AS ten_kho, NULL AS ma_ktv, NULL AS ten_ktv, NULL AS khu_vuc_ma,
                t.ma_hang, t.ten_hang, t.dvt, t.cuoi_ky
         FROM kho_cong_ty_ton_kho t LEFT JOIN kho_cong_ty k ON k.ma = t.kho_ma
         WHERE t.id > ? ORDER BY t.id LIMIT ?`
      : `SELECT t.id, t.ma_kho, t.ten_kho, t.ma_ktv, COALESCE(k.ten_hien_thi, k.ten_misa) AS ten_ktv, k.khu_vuc_ma,
                t.ma_hang, t.ten_hang, t.dvt, t.cuoi_ky
         FROM ktv_ton_kho t LEFT JOIN ktv_lien_he k ON k.ma_ktv = t.ma_ktv
         WHERE t.id > ? ORDER BY t.id LIMIT ?`;
  const [meta, { results }] = await Promise.all([
    c.env.DB.prepare("SELECT updated_at FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ updated_at: string }>(),
    c.env.DB.prepare(sql).bind(afterId, limit).all<{ id: number }>(),
  ]);
  const nextAfterId = results.length === limit ? results[results.length - 1].id : null;
  return c.json({ phien_ban: meta?.updated_at ?? null, rows: results, next_after_id: nextAfterId });
});

export default partnerApi;
