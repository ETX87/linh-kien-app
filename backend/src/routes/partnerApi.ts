import { Hono } from "hono";
import type { Env } from "../types";
import { partnerApiAuth } from "../lib/partnerApiAuth";
import { buildCaseTimeline } from "../lib/partnerTimeline";
import { SL_HO_TRO_0D_SQL } from "../lib/congNoKtv";
import { dsAnhLk } from "../lib/anhLinhKien";

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

// GET /api/partner/v1/linh-kien/lich-su?ma=<ma_lk>&limit=50 (2026-10-08, DVBH "Ho so linh kien") - cac don gan nhat
// cua 1 ma linh kien (mua/cong no/tra hang, ca gan kem) + ticket thieu hang cua ma do (trang thai = log moi nhat).
// Index idx_ddh_ma_lk (migration 0072). Ten nguoi nhan lay qua subquery LIMIT 1 (1 Gmail co the gan nhieu ma KTV).
partnerApi.get("/v1/linh-kien/lich-su", async (c) => {
  const ma = c.req.query("ma")?.trim();
  if (!ma) return c.json({ error: "MISSING_MA" }, 400);
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  const [orders, thieuLk] = await Promise.all([
    c.env.DB.prepare(
      `SELECT d.id, d.loai_don, d.loai_de_xuat, d.trang_thai_hien_tai, d.so_luong_de_xuat, d.so_luong_thuc_xuat,
              d.ngay_tao, d.updated_at, d.khu_vuc_ma, d.ma_xuat_kho, d.nguoi_nhan_hang,
              COALESCE(
                (SELECT COALESCE(NULLIF(TRIM(k.ten_hien_thi), ''), NULLIF(TRIM(k.ten_misa), '')) FROM ktv_lien_he k WHERE k.email_dang_nhap = d.nguoi_nhan_hang LIMIT 1),
                (SELECT COALESCE(NULLIF(TRIM(u.ten_misa), ''), NULLIF(TRIM(u.ten), '')) FROM users u WHERE u.email = d.nguoi_nhan_hang),
                d.nguoi_nhan_hang
              ) AS nguoi_nhan_hang_ten,
              COALESCE((SELECT group_concat(dc.case_id) FROM dat_don_case dc WHERE dc.dat_don_hang_id = d.id), d.ma_yeu_cau_su_co) AS case_ids
       FROM dat_don_hang d
       WHERE d.ma_lk = ?
       ORDER BY d.ngay_tao DESC LIMIT ?`,
    )
      .bind(ma, limit)
      .all(),
    c.env.DB.prepare(
      `SELECT t.id, t.dat_don_hang_id, COALESCE(s.ten_ly_do, t.ly_do) AS ly_do, t.ngay_tao, t.ngay_du_kien_co_hang, t.ngay_hang_ve_thuc_te,
              (SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1) AS trang_thai,
              (SELECT l.ngay_xu_ly FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1) AS ngay_cap_nhat
       FROM thieu_lk t
       JOIN dat_don_hang d ON d.id = t.dat_don_hang_id
       LEFT JOIN settings_ly_do_cham s ON s.id = t.ly_do_cham_id
       WHERE d.ma_lk = ?
       ORDER BY t.ngay_tao DESC LIMIT 100`,
    )
      .bind(ma)
      .all(),
  ]);
  return c.json({ orders: orders.results, thieu_lk: thieuLk.results });
});

// GET /api/partner/v1/linh-kien/chi-tiet?after_ma=&limit=100 | ?ma=A,B,C (2026-10-13, "API danh sách linh kiện chi tiết") - moi LK
// kem 6 phan: anh minh hoa (toi da 10, migration 0077), nhom LK thay the, combo chua LK, tu khoa tim kiem, cong no chi tiet theo KTV
// (gia tri cong no = Gia KTV, cung cong thuc computeCongNoThucTe - tru SL ho tro "Cong no 0 dong"), ton kho chi tiet (kho cong ty +
// kho KTV theo file MISA import gan nhat - "phien_ban" nhu /v1/ton-kho). Phan trang con tro theo ma (khong OFFSET); ?ma= (<= 200 ma)
// bo qua phan trang. Moi trang 7 truy van, danh sach ma truyen 1 bind JSON (json_each) - khong vuong gioi han 100 tham so D1.
partnerApi.get("/v1/linh-kien/chi-tiet", async (c) => {
  const db = c.env.DB;
  const maQuery = c.req.query("ma")?.trim();
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 100) || 100));
  const COT_LK = `ma_linh_kien, ten_linh_kien, don_vi AS phan_loai, gia_ban AS gia_niem_yet, gia_tri_cong_no, gia_du_phong, gia_eu,
                  bat_tat, dac_thu, chi_sua_chua, cam_ban, trang_thai_ma, ma_chuan, ghi_chu, anh_demo, anh_ds, ngay_cap_nhat`;
  type LkRow = Record<string, unknown> & { ma_linh_kien: string; anh_demo: string | null; anh_ds: string | null };
  let lks: LkRow[];
  if (maQuery) {
    const mas = [...new Set(maQuery.split(",").map((m) => m.trim()).filter(Boolean))];
    if (mas.length > 200) return c.json({ error: "QUA_NHIEU_MA", toi_da: 200 }, 400);
    lks = (await db.prepare(`SELECT ${COT_LK} FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?)) ORDER BY ma_linh_kien`).bind(JSON.stringify(mas)).all<LkRow>()).results;
  } else {
    const afterMa = c.req.query("after_ma") ?? "";
    lks = (await db.prepare(`SELECT ${COT_LK} FROM linh_kien WHERE ma_linh_kien > ? ORDER BY ma_linh_kien LIMIT ?`).bind(afterMa, limit).all<LkRow>()).results;
  }
  const masJson = JSON.stringify(lks.map((l) => l.ma_linh_kien));
  const IN_MAS = "(SELECT value FROM json_each(?))";

  const [meta, thayThe, combo, tuKhoa, tonKtv, tonKho] = await Promise.all([
    db.prepare("SELECT updated_at FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ updated_at: string }>(),
    db.prepare(
      `SELECT ct.ma_lk AS ma, n.id AS nhom_id, n.ten_nhom, ct2.ma_lk AS ma_thay_the, lk2.ten_linh_kien AS ten_thay_the, lk2.bat_tat
       FROM lk_nhom_thay_the_ct ct
       JOIN lk_nhom_thay_the n ON n.id = ct.nhom_id
       JOIN lk_nhom_thay_the_ct ct2 ON ct2.nhom_id = ct.nhom_id AND ct2.ma_lk <> ct.ma_lk
       LEFT JOIN linh_kien lk2 ON lk2.ma_linh_kien = ct2.ma_lk
       WHERE ct.ma_lk IN ${IN_MAS} ORDER BY n.id, ct2.ma_lk`,
    ).bind(masJson).all<{ ma: string; nhom_id: number; ten_nhom: string; ma_thay_the: string; ten_thay_the: string | null; bat_tat: number | null }>(),
    db.prepare(
      `SELECT x.ma_lk AS ma, cb.ma_combo, cb.ten_combo, cb.bat_tat, x.so_luong AS so_luong_trong_combo,
              (SELECT json_group_array(json_object('ma_linh_kien', t.ma_lk, 'so_luong', t.so_luong))
               FROM (SELECT ma_lk, so_luong FROM lk_combo_ct WHERE ma_combo = cb.ma_combo ORDER BY stt, ma_lk) t) AS thanh_phan
       FROM lk_combo_ct x JOIN lk_combo cb ON cb.ma_combo = x.ma_combo
       WHERE x.ma_lk IN ${IN_MAS} ORDER BY cb.ma_combo`,
    ).bind(masJson).all<{ ma: string; ma_combo: string; ten_combo: string; bat_tat: number; so_luong_trong_combo: number; thanh_phan: string }>(),
    db.prepare(`SELECT ma_linh_kien AS ma, tu_khoa FROM lk_tu_khoa WHERE ma_linh_kien IN ${IN_MAS}`).bind(masJson).all<{ ma: string; tu_khoa: string }>(),
    db.prepare(
      `SELECT t.ma_hang AS ma, t.ma_ktv, t.ma_kho, COALESCE(k.ten_hien_thi, k.ten_misa, t.ten_kho) AS ten_ktv, k.khu_vuc_ma, t.cuoi_ky,
              ${SL_HO_TRO_0D_SQL("t")} AS sl_ho_tro_0d,
              (t.cuoi_ky - ${SL_HO_TRO_0D_SQL("t")}) * COALESCE(lk.gia_tri_cong_no, 0) AS cong_no
       FROM ktv_ton_kho t
       LEFT JOIN ktv_lien_he k ON k.ma_ktv = t.ma_ktv
       LEFT JOIN linh_kien lk ON lk.ma_linh_kien = t.ma_hang
       WHERE t.ma_hang IN ${IN_MAS} ORDER BY t.ma_hang, t.ma_kho`,
    ).bind(masJson).all<{ ma: string; ma_ktv: string | null; ma_kho: string | null; ten_ktv: string | null; khu_vuc_ma: string | null; cuoi_ky: number | null; sl_ho_tro_0d: number; cong_no: number }>(),
    db.prepare(
      `SELECT t.ma_hang AS ma, t.kho_ma AS ma_kho, kc.ten AS ten_kho, t.cuoi_ky
       FROM kho_cong_ty_ton_kho t LEFT JOIN kho_cong_ty kc ON kc.ma = t.kho_ma
       WHERE t.ma_hang IN ${IN_MAS} ORDER BY t.ma_hang, t.kho_ma`,
    ).bind(masJson).all<{ ma: string; ma_kho: string; ten_kho: string | null; cuoi_ky: number | null }>(),
  ]);

  const nhom = <T extends { ma: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.ma, [...(m.get(r.ma) ?? []), r]);
    return m;
  };
  const thayTheMap = nhom(thayThe.results);
  const comboMap = nhom(combo.results);
  const tuKhoaMap = new Map(tuKhoa.results.map((r) => [r.ma, r.tu_khoa]));
  const tonKtvMap = nhom(tonKtv.results);
  const tonKhoMap = nhom(tonKho.results);
  const so = (v: number | null | undefined) => Number(v ?? 0);

  const rows = lks.map(({ anh_demo, anh_ds, ...lk }) => {
    const nhomTt = new Map<number, { nhom_id: number; ten_nhom: string; linh_kien: { ma_linh_kien: string; ten_linh_kien: string | null; bat_tat: number | null }[] }>();
    for (const r of thayTheMap.get(lk.ma_linh_kien) ?? []) {
      const g = nhomTt.get(r.nhom_id) ?? { nhom_id: r.nhom_id, ten_nhom: r.ten_nhom, linh_kien: [] };
      g.linh_kien.push({ ma_linh_kien: r.ma_thay_the, ten_linh_kien: r.ten_thay_the, bat_tat: r.bat_tat });
      nhomTt.set(r.nhom_id, g);
    }
    const ktv = tonKtvMap.get(lk.ma_linh_kien) ?? [];
    const kho = tonKhoMap.get(lk.ma_linh_kien) ?? [];
    const ktvCoMa = ktv.filter((r) => r.ma_ktv);
    return {
      ...lk,
      anh: dsAnhLk({ anh_demo, anh_ds }),
      thay_the: [...nhomTt.values()],
      combo: (comboMap.get(lk.ma_linh_kien) ?? []).map(({ ma: _ma, thanh_phan, ...cb }) => ({ ...cb, thanh_phan: JSON.parse(thanh_phan) as unknown[] })),
      tu_khoa: (tuKhoaMap.get(lk.ma_linh_kien) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      cong_no: {
        gia_tri_cong_no: lk.gia_tri_cong_no ?? null,
        tong_cong_no: ktvCoMa.reduce((s, r) => s + so(r.cong_no), 0),
        chi_tiet: ktvCoMa.map((r) => ({ ma_ktv: r.ma_ktv, ten_ktv: r.ten_ktv, khu_vuc_ma: r.khu_vuc_ma, sl_ton: so(r.cuoi_ky), sl_ho_tro_0d: so(r.sl_ho_tro_0d), cong_no: so(r.cong_no) })),
      },
      ton_kho: {
        tong_kho_cong_ty: kho.reduce((s, r) => s + so(r.cuoi_ky), 0),
        tong_kho_ktv: ktv.reduce((s, r) => s + so(r.cuoi_ky), 0),
        kho_cong_ty: kho.map((r) => ({ ma_kho: r.ma_kho, ten_kho: r.ten_kho, sl_ton: so(r.cuoi_ky) })),
        kho_ktv: ktv.map((r) => ({ ma_kho: r.ma_kho, ma_ktv: r.ma_ktv, ten_ktv: r.ten_ktv, khu_vuc_ma: r.khu_vuc_ma, sl_ton: so(r.cuoi_ky) })),
      },
    };
  });
  const nextAfterMa = !maQuery && lks.length === limit ? lks[lks.length - 1].ma_linh_kien : null;
  return c.json({ phien_ban_ton_kho: meta?.updated_at ?? null, rows, next_after_ma: nextAfterMa });
});

export default partnerApi;
