import { Hono } from "hono";
import type { Env } from "../types";
import { partnerApiAuth } from "../lib/partnerApiAuth";
import { buildCaseTimeline } from "../lib/partnerTimeline";
import { docLienQuanLk } from "../lib/linhKienLienQuan";
import { dsAnhLk } from "../lib/anhLinhKien";
import { docCongNoTongHop, SL_HO_TRO_0D_SQL } from "../lib/congNoKtv";
import { donChoHangDuTonKho, getMocTonKhoCongTy } from "../lib/tonKhoCongTy";
import { ktvChinhCuaEmailSql } from "../lib/ktvChinh";
import { TRANG_THAI_PXK_DON_SQL } from "../lib/trangThaiDonPxk";
import { ganRouteDatHang } from "./partnerDatHang";
import { docDongHoaDon } from "../lib/hoaDonDvbh";
import { VI_PHAM_COT_SQL, VI_PHAM_FROM_SQL, boSungViPham, type ViPhamRow } from "./viPham";
import { BUOC_THEO_MA } from "../lib/viPham";
import { nowVN } from "../lib/vnTime";

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
                t.ma_hang, t.ten_hang, t.dvt, t.dau_ky, t.nhap_kho, t.xuat_kho, t.cuoi_ky
         FROM kho_cong_ty_ton_kho t LEFT JOIN kho_cong_ty k ON k.ma = t.kho_ma
         WHERE t.id > ? ORDER BY t.id LIMIT ?`
      : `SELECT t.id, t.ma_kho, t.ten_kho, t.ma_ktv, COALESCE(k.ten_hien_thi, k.ten_misa) AS ten_ktv, k.khu_vuc_ma,
                t.ma_hang, t.ten_hang, t.dvt, t.dau_ky, t.nhap_kho, t.xuat_kho, t.cuoi_ky
         FROM ktv_ton_kho t LEFT JOIN ktv_lien_he k ON k.ma_ktv = t.ma_ktv
         WHERE t.id > ? ORDER BY t.id LIMIT ?`;
  const [meta, { results }] = await Promise.all([
    c.env.DB.prepare("SELECT updated_at FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ updated_at: string }>(),
    c.env.DB.prepare(sql).bind(afterId, limit).all<{ id: number }>(),
  ]);
  const nextAfterId = results.length === limit ? results[results.length - 1].id : null;
  return c.json({ phien_ban: meta?.updated_at ?? null, rows: results, next_after_id: nextAfterId });
});

// ---- Cho app "Phan tich ton kho 3T" (2026-10-29) - danh muc LK gon + danh ba kho/KTV de keo ve hang ngay. Chi DOC.
// /v1/ton-kho o tren tra them dau_ky / nhap_kho / xuat_kho (ky = ky_tu_ngay..ky_den_ngay cua /v1/ton-kho/meta).

// GET /api/partner/v1/linh-kien/danh-sach?after_ma=&limit=2000 - moi LK 1 dong, khong kem anh/ton kho (nhe hon /chi-tiet).
partnerApi.get("/v1/linh-kien/danh-sach", async (c) => {
  const afterMa = c.req.query("after_ma") ?? "";
  const limit = Math.min(5000, Math.max(1, Number(c.req.query("limit") ?? 2000) || 2000));
  const { results } = await c.env.DB.prepare(
    `SELECT ma_linh_kien, ten_linh_kien, nhom_lk, don_vi AS phan_loai, phan_loai_dac_thu, gia_ban AS gia_niem_yet, gia_du_phong,
            bat_tat, trang_thai_ma, ma_chuan, ngay_cap_nhat
     FROM linh_kien WHERE ma_linh_kien > ? ORDER BY ma_linh_kien LIMIT ?`,
  )
    .bind(afterMa, limit)
    .all<{ ma_linh_kien: string }>();
  return c.json({ rows: results, next_after_ma: results.length === limit ? results[results.length - 1].ma_linh_kien : null });
});

// GET /api/partner/v1/danh-ba-kho - kho cong ty + moi ma KTV (ma MISA = ma kho cua KTV trong file ton kho). dang_lam = ma KTV
// khong bi tat (ngung_hoat_dong) va Gmail dang nhap khong bi khoa (ETX nghi viec / Admin khoa).
partnerApi.get("/v1/danh-ba-kho", async (c) => {
  const [kho, ktv] = await Promise.all([
    c.env.DB.prepare("SELECT ma, ten, bat_tat FROM kho_cong_ty ORDER BY ma").all(),
    c.env.DB.prepare(
      `SELECT k.ma_ktv, k.ma_misa, COALESCE(NULLIF(TRIM(k.ten_misa), ''), NULLIF(TRIM(k.ten_hien_thi), ''), k.ma_ktv) AS ten,
              k.vai_tro_ktv, k.khu_vuc_ma, kv.ten AS khu_vuc_ten,
              CASE WHEN k.ngung_hoat_dong = 1 OR COALESCE(u.bi_khoa, 0) = 1 THEN 0 ELSE 1 END AS dang_lam
       FROM ktv_lien_he k
       LEFT JOIN khu_vuc kv ON kv.ma = k.khu_vuc_ma
       LEFT JOIN users u ON u.email = k.email_dang_nhap
       ORDER BY k.ma_ktv`,
    ).all(),
  ]);
  return c.json({ kho_cong_ty: kho.results, ktv: ktv.results });
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
              d.ma_yeu_cau_su_co, d.ma_lada,
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
                  bat_tat, dac_thu, chi_sua_chua, cam_ban, bo_ma, trang_thai_ma, ma_chuan, ghi_chu, anh_demo, anh_ds, ngay_cap_nhat`;
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
  // Truy van lien quan dung chung voi drawer Bang gia (lib/linhKienLienQuan.ts) - API doi tac: khong gioi han pham vi.
  const lq = await docLienQuanLk(db, masJson);
  const meta = { updated_at: lq.phienBanTonKho };
  const thayThe = { results: lq.thayThe }, combo = { results: lq.combo }, tuKhoa = { results: lq.tuKhoa };
  const tonKtv = { results: lq.tonKtv }, tonKho = { results: lq.tonKho };

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

// ---- Danh muc phu tro linh kien + cong no KTV (2026-10-17, doi tac bao "API Đặt linh kiện thiếu: Mã thay thế, combo, từ khoá
// riêng, nhóm đồng nghĩa, công nợ KTV") - 4 endpoint DANH SACH (keo ca bang ve dong bo), khac /v1/linh-kien/chi-tiet (theo tung LK).
// Moi endpoint tra `phien_ban` de ben keo biet du lieu co doi khong (chi so sanh chuoi, khong tu tach nghia). Chi DOC.
const pbMaxCount = (table: string, col: string) => `SELECT COALESCE(MAX(${col}), '') || '#' || COUNT(*) AS pb FROM ${table}`;
const tachMa = (v: string | undefined) => [...new Set((v ?? "").split(",").map((m) => m.trim()).filter(Boolean))].slice(0, 200);

// GET /api/partner/v1/lk-thay-the[?ma=A,B] - nhom linh kien thay the (cac ma trong 1 nhom dung thay nhau duoc). ?ma= = chi nhom chua
// 1 trong cac ma do. phien_ban = ngay sua nhom moi nhat + so nhom + so dong thanh vien.
partnerApi.get("/v1/lk-thay-the", async (c) => {
  const db = c.env.DB;
  const mas = tachMa(c.req.query("ma"));
  const loc = mas.length ? "WHERE n.id IN (SELECT nhom_id FROM lk_nhom_thay_the_ct WHERE ma_lk IN (SELECT value FROM json_each(?)))" : "";
  const [pb, pbCt, { results }] = await Promise.all([
    db.prepare(pbMaxCount("lk_nhom_thay_the", "ngay_cap_nhat")).first<{ pb: string }>(),
    db.prepare("SELECT COUNT(*) AS n FROM lk_nhom_thay_the_ct").first<{ n: number }>(),
    db.prepare(
      `SELECT n.id, n.ten_nhom, n.ghi_chu, n.ngay_cap_nhat,
              (SELECT json_group_array(json_object('ma_linh_kien', t.ma_lk, 'ten_linh_kien', t.ten, 'bat_tat', t.bat_tat,
                                                 'co_trong_danh_muc', t.co_dm, 'ghi_chu', t.ghi_chu))
               FROM (SELECT ct.ma_lk, COALESCE(lk.ten_linh_kien, ct.ten_lk) AS ten, lk.bat_tat, ct.ghi_chu,
                            CASE WHEN lk.ma_linh_kien IS NULL THEN 0 ELSE 1 END AS co_dm
                     FROM lk_nhom_thay_the_ct ct
                     LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ct.ma_lk WHERE ct.nhom_id = n.id ORDER BY ct.stt, ct.ma_lk) t) AS linh_kien
       FROM lk_nhom_thay_the n ${loc} ORDER BY n.id`,
    ).bind(...(mas.length ? [JSON.stringify(mas)] : [])).all<{ id: number; ten_nhom: string; ghi_chu: string | null; ngay_cap_nhat: string; linh_kien: string }>(),
  ]);
  return c.json({
    phien_ban: `${pb?.pb ?? ""}#${pbCt?.n ?? 0}`,
    rows: results.map((r) => ({ ...r, linh_kien: JSON.parse(r.linh_kien) as unknown[] })),
  });
});

// GET /api/partner/v1/lk-combo[?ma=A,B][&chi_bat=1] - combo linh kien (dat 1 combo = dat du cac thanh phan theo SL/bo). ?ma= = combo
// chua 1 trong cac ma LK do; chi_bat=1 = chi combo dang bat. gia_niem_yet = tong Gia NY thanh phan x SL/bo (tham khao).
partnerApi.get("/v1/lk-combo", async (c) => {
  const db = c.env.DB;
  const mas = tachMa(c.req.query("ma"));
  const dk: string[] = [];
  if (mas.length) dk.push("cb.ma_combo IN (SELECT ma_combo FROM lk_combo_ct WHERE ma_lk IN (SELECT value FROM json_each(?)))");
  if (c.req.query("chi_bat") === "1") dk.push("cb.bat_tat = 1");
  const [pb, pbCt, { results }] = await Promise.all([
    db.prepare(pbMaxCount("lk_combo", "ngay_cap_nhat")).first<{ pb: string }>(),
    db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(so_luong), 0) AS sl FROM lk_combo_ct").first<{ n: number; sl: number }>(),
    db.prepare(
      `SELECT cb.ma_combo, cb.ten_combo, cb.bat_tat, cb.ghi_chu, cb.ngay_cap_nhat,
              (SELECT json_group_array(json_object('ma_linh_kien', t.ma_lk, 'ten_linh_kien', t.ten, 'so_luong', t.so_luong, 'gia_niem_yet', t.gia))
               FROM (SELECT ct.ma_lk, lk.ten_linh_kien AS ten, ct.so_luong, lk.gia_ban AS gia FROM lk_combo_ct ct
                     LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ct.ma_lk WHERE ct.ma_combo = cb.ma_combo ORDER BY ct.stt, ct.ma_lk) t) AS thanh_phan
       FROM lk_combo cb ${dk.length ? `WHERE ${dk.join(" AND ")}` : ""} ORDER BY cb.ma_combo`,
    ).bind(...(mas.length ? [JSON.stringify(mas)] : [])).all<{ ma_combo: string; ten_combo: string; bat_tat: number; ghi_chu: string | null; ngay_cap_nhat: string; thanh_phan: string }>(),
  ]);
  return c.json({
    phien_ban: `${pb?.pb ?? ""}#${pbCt?.n ?? 0}#${pbCt?.sl ?? 0}`,
    rows: results.map((r) => {
      const tp = JSON.parse(r.thanh_phan) as { so_luong: number; gia_niem_yet: number | null }[];
      return { ...r, thanh_phan: tp, gia_niem_yet: tp.reduce((t, x) => t + (x.gia_niem_yet ?? 0) * x.so_luong, 0) };
    }),
  });
});

// GET /api/partner/v1/lk-tu-khoa - tu khoa tim kiem RIENG cua tung LK (ten goi khac) + NHOM DONG NGHIA (go 1 tu trong nhom = tim ca
// cac tu con lai). 2 bang nho - tra ca bang. phien_ban = data_versions 'md_lk_tu_khoa' (trigger tang moi lan them/sua/xoa ca 2 bang).
const tachTu = (s: string | null) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
partnerApi.get("/v1/lk-tu-khoa", async (c) => {
  const db = c.env.DB;
  const [pb, { results: tuKhoa }, { results: dongNghia }] = await Promise.all([
    db.prepare("SELECT version FROM data_versions WHERE domain = 'md_lk_tu_khoa'").first<{ version: number }>(),
    db.prepare("SELECT ma_linh_kien, tu_khoa, ngay_cap_nhat FROM lk_tu_khoa ORDER BY ma_linh_kien").all<{ ma_linh_kien: string; tu_khoa: string; ngay_cap_nhat: string }>(),
    db.prepare("SELECT id, nhom, ngay_cap_nhat FROM lk_dong_nghia ORDER BY id").all<{ id: number; nhom: string; ngay_cap_nhat: string }>(),
  ]);
  return c.json({
    phien_ban: String(pb?.version ?? 0),
    tu_khoa: tuKhoa.map((r) => ({ ma_linh_kien: r.ma_linh_kien, tu_khoa: tachTu(r.tu_khoa), ngay_cap_nhat: r.ngay_cap_nhat })),
    dong_nghia: dongNghia.map((r) => ({ id: r.id, tu: tachTu(r.nhom), ngay_cap_nhat: r.ngay_cap_nhat })),
  });
});

// GET /api/partner/v1/cong-no-ktv[?ma_ktv=A,B][&khu_vuc=MB1,MB2][&chi_tiet=1] - cong no theo KTV, CUNG cong thuc + CUNG tap dong voi
// man Cong no cua app (lib/congNoKtv.ts docCongNoTongHop - chi KTV dang co ton kho trong file MISA import gan nhat). chi_tiet=1 (bat
// buoc kem ma_ktv, toi da 20 KTV) = them tung ma hang dang giu. KHONG tra email/so dien thoai KTV.
partnerApi.get("/v1/cong-no-ktv", async (c) => {
  const db = c.env.DB;
  const maKtv = tachMa(c.req.query("ma_ktv"));
  const khuVuc = tachMa(c.req.query("khu_vuc"));
  const chiTiet = c.req.query("chi_tiet") === "1";
  if (chiTiet && (maKtv.length === 0 || maKtv.length > 20)) return c.json({ error: "CHI_TIET_CAN_MA_KTV", toi_da: 20 }, 400);
  const dk: string[] = [];
  const binds: unknown[] = [];
  if (maKtv.length) {
    dk.push("UPPER(k.ma_ktv) IN (SELECT UPPER(value) FROM json_each(?))");
    binds.push(JSON.stringify(maKtv));
  }
  if (khuVuc.length) {
    dk.push("k.khu_vuc_ma IN (SELECT value FROM json_each(?))");
    binds.push(JSON.stringify(khuVuc));
  }
  const [meta, rows] = await Promise.all([
    db.prepare("SELECT updated_at FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ updated_at: string }>(),
    docCongNoTongHop(db, dk.length ? `WHERE ${dk.join(" AND ")}` : "", binds),
  ]);
  const ketQua = rows.map((r) => ({
    ma_ktv: r.ma_ktv, ten_ktv: r.ten_hien_thi, ma_misa: r.ma_misa, ten_misa: r.ten_misa, khu_vuc_ma: r.khu_vuc_ma,
    tran_cong_no: r.cong_no, so_ma_hang: r.so_ma_hang, tong_sl_ton: r.tong_cuoi_ky, sl_ho_tro_0d: r.sl_ho_tro_0d,
    cong_no_thuc_te: r.cong_no_thuc_te, cong_no_phat_sinh: r.cong_no_phat_sinh, cong_no_da_tru: r.cong_no_da_tru,
    cong_no_chot: r.cong_no_chot, danh_gia_cong_no: r.danh_gia_cong_no,
  }));
  if (!chiTiet) return c.json({ phien_ban_ton_kho: meta?.updated_at ?? null, rows: ketQua });
  const { results: ct } = await db.prepare(
    `SELECT t.ma_ktv, t.ma_hang AS ma_linh_kien, COALESCE(lk.ten_linh_kien, t.ten_hang) AS ten_linh_kien, t.cuoi_ky AS sl_ton,
            ${SL_HO_TRO_0D_SQL("t")} AS sl_ho_tro_0d, lk.gia_tri_cong_no AS gia_ktv,
            (t.cuoi_ky - ${SL_HO_TRO_0D_SQL("t")}) * COALESCE(lk.gia_tri_cong_no, 0) AS cong_no
     FROM ktv_ton_kho t LEFT JOIN linh_kien lk ON lk.ma_linh_kien = t.ma_hang
     WHERE t.ma_ktv IN (SELECT value FROM json_each(?)) ORDER BY t.ma_ktv, t.ma_hang`,
  ).bind(JSON.stringify(ketQua.map((r) => r.ma_ktv))).all<{ ma_ktv: string } & Record<string, unknown>>();
  return c.json({
    phien_ban_ton_kho: meta?.updated_at ?? null,
    rows: ketQua.map((r) => ({ ...r, chi_tiet: ct.filter((x) => x.ma_ktv === r.ma_ktv).map(({ ma_ktv: _m, ...x }) => x) })),
  });
});

// ---- Thieu hang + ton kha dung (2026-10-17, ra soat API doi tac - nguoi dung chon bo sung mang nay) ----

// GET /api/partner/v1/thieu-hang?trang_thai=mo|dong|tat_ca&ma=&ma_ktv=&khu_vuc=&cap_nhat_tu=&after_id=&limit= - ticket "Thiếu hàng
// đặt mua" (don cho hang: Kho tim nguon / du kien co hang / hang ve). Mac dinh chi ticket CON MO. cap_nhat_tu = chi ticket co thao tac
// (log moi nhat) SAU moc do (gio VN "YYYY-MM-DD HH:MM:SS") - dung de keo bu thay doi. Phan trang con tro theo id. kho_du_hang = ticket
// mo ma don goc da du ton kho cong ty (donChoHangDuTonKho - cung so voi chip "Kho đã có đủ hàng" tren app). KHONG tra email.
partnerApi.get("/v1/thieu-hang", async (c) => {
  const db = c.env.DB;
  const trangThai = c.req.query("trang_thai") ?? "mo";
  if (!["mo", "dong", "tat_ca"].includes(trangThai)) return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  const limit = Math.min(500, Math.max(1, Number(c.req.query("limit") ?? 200) || 200));
  const afterId = c.req.query("after_id")?.trim() ?? "";
  const capNhatTu = c.req.query("cap_nhat_tu")?.trim();
  const mas = tachMa(c.req.query("ma"));
  const maKtv = tachMa(c.req.query("ma_ktv"));
  const khuVuc = tachMa(c.req.query("khu_vuc"));
  const TT = "(SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1)";
  const LUC = "(SELECT l.ngay_xu_ly FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1)";
  const dk = ["t.id > ?"];
  const binds: unknown[] = [afterId];
  if (trangThai === "mo") dk.push(`${TT} NOT IN ('Da huy bo', 'Da ket thuc')`);
  if (trangThai === "dong") dk.push(`${TT} IN ('Da huy bo', 'Da ket thuc')`);
  if (capNhatTu) { dk.push(`${LUC} > ?`); binds.push(capNhatTu); }
  if (mas.length) { dk.push("d.ma_lk IN (SELECT value FROM json_each(?))"); binds.push(JSON.stringify(mas)); }
  if (khuVuc.length) { dk.push("COALESCE(d.khu_vuc_chon, d.khu_vuc_ma) IN (SELECT value FROM json_each(?))"); binds.push(JSON.stringify(khuVuc)); }
  if (maKtv.length) {
    dk.push("UPPER(k.ma_ktv) IN (SELECT UPPER(value) FROM json_each(?))");
    binds.push(JSON.stringify(maKtv));
  }
  const [{ results }, duHang] = await Promise.all([
    db.prepare(
      `SELECT t.id, t.dat_don_hang_id, d.ma_lk AS ma_linh_kien, COALESCE(lk.ten_linh_kien, d.ten_lk_snapshot) AS ten_linh_kien,
              d.so_luong_de_xuat AS so_luong, d.loai_don, d.loai_de_xuat, COALESCE(d.khu_vuc_chon, d.khu_vuc_ma) AS khu_vuc_ma,
              d.trang_thai_hien_tai AS trang_thai_don, k.ma_ktv AS nguoi_nhan_ma_ktv,
              COALESCE(NULLIF(TRIM(k.ten_hien_thi), ''), NULLIF(TRIM(k.ten_misa), ''), NULLIF(TRIM(u.ten_misa), ''), NULLIF(TRIM(u.ten), '')) AS nguoi_nhan_ten,
              COALESCE((SELECT group_concat(dc.case_id) FROM dat_don_case dc WHERE dc.dat_don_hang_id = d.id), d.ma_yeu_cau_su_co) AS case_ids,
              d.ma_yeu_cau_su_co, d.ma_lada,
              COALESCE(s.ten_ly_do, t.ly_do) AS ly_do, ${TT} AS trang_thai, t.ngay_tao, t.ngay_du_kien_co_hang, t.ngay_hang_ve_thuc_te,
              ${LUC} AS cap_nhat_luc
       FROM thieu_lk t
       JOIN dat_don_hang d ON d.id = t.dat_don_hang_id
       LEFT JOIN linh_kien lk ON lk.ma_linh_kien = d.ma_lk
       LEFT JOIN settings_ly_do_cham s ON s.id = t.ly_do_cham_id
       LEFT JOIN ktv_lien_he k ON k.ma_ktv = ${ktvChinhCuaEmailSql("d.nguoi_nhan_hang")}
       LEFT JOIN users u ON u.email = d.nguoi_nhan_hang
       WHERE ${dk.join(" AND ")}
       ORDER BY t.id LIMIT ?`,
    ).bind(...binds, limit).all<{ id: string; dat_don_hang_id: string; trang_thai: string }>(),
    donChoHangDuTonKho(db),
  ]);
  return c.json({
    rows: results.map((r) => ({
      ...r,
      kho_du_hang: !["Da huy bo", "Da ket thuc"].includes(r.trang_thai) && duHang.has(r.dat_don_hang_id),
    })),
    next_after_id: results.length === limit ? results[results.length - 1].id : null,
  });
});

// GET /api/partner/v1/ton-kho-kha-dung?ma=A,B[&khu_vuc=MB1,MN1] - TON KHA DUNG kho cong ty theo (ma LK, khu vuc) = dung so app dung
// de tu duyet don (lib/tonKhoCongTy.ts computeTonKhoChot): ton_goc = tong cuoi ky MOI kho cong ty dang bat phuc vu khu vuc (file MISA
// import gan nhat) - dang_giu = SL don Mua/Cong no (khong TRỪ CÔNG NỢ) tao SAU moc import, chua tu choi/huy, cung ma + cung khu vuc
// cua don (gom ca don "Cho hang" - so rieng o cho_hang). kha_dung co the AM (da dat vuot ton). `ma` bat buoc (<= 200). Khu vuc = cac
// khu vuc co kho cong ty dang bat (mac dinh tat ca).
partnerApi.get("/v1/ton-kho-kha-dung", async (c) => {
  const db = c.env.DB;
  const mas = tachMa(c.req.query("ma"));
  if (!mas.length) return c.json({ error: "MISSING_MA" }, 400);
  const khuVuc = tachMa(c.req.query("khu_vuc"));
  const moc = await getMocTonKhoCongTy(db);
  const { results } = await db.prepare(
    `WITH mas AS (SELECT value AS ma FROM json_each(?)),
     kvs AS (
       SELECT DISTINCT x.khu_vuc_ma AS kv FROM kho_cong_ty_khu_vuc x JOIN kho_cong_ty k ON k.ma = x.kho_ma
       WHERE k.bat_tat = 1 ${khuVuc.length ? "AND x.khu_vuc_ma IN (SELECT value FROM json_each(?))" : ""}
     ),
     goc AS (
       SELECT t.ma_hang AS ma, x.khu_vuc_ma AS kv, SUM(t.cuoi_ky) AS sl
       FROM kho_cong_ty_ton_kho t JOIN kho_cong_ty k ON k.ma = t.kho_ma JOIN kho_cong_ty_khu_vuc x ON x.kho_ma = k.ma
       WHERE k.bat_tat = 1 AND t.ma_hang IN (SELECT ma FROM mas) GROUP BY t.ma_hang, x.khu_vuc_ma
     ),
     giu AS (
       SELECT d.ma_lk AS ma, COALESCE(d.khu_vuc_chon, d.khu_vuc_ma) AS kv, SUM(d.so_luong_de_xuat) AS sl,
              SUM(CASE WHEN d.trang_thai_hien_tai = 'Cho hang' THEN d.so_luong_de_xuat ELSE 0 END) AS cho
       FROM dat_don_hang d
       WHERE d.ma_lk IN (SELECT ma FROM mas) AND d.loai_don IN ('mua', 'cong_no')
         AND instr(COALESCE(d.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') = 0
         AND d.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')
         AND (? IS NULL OR d.ngay_tao > ?)
       GROUP BY d.ma_lk, COALESCE(d.khu_vuc_chon, d.khu_vuc_ma)
     )
     SELECT m.ma AS ma_linh_kien, kvs.kv AS khu_vuc_ma, kvt.ten AS khu_vuc_ten,
            COALESCE(goc.sl, 0) AS ton_goc, COALESCE(giu.sl, 0) AS dang_giu, COALESCE(giu.cho, 0) AS cho_hang,
            COALESCE(goc.sl, 0) - COALESCE(giu.sl, 0) AS kha_dung
     FROM mas m CROSS JOIN kvs
     LEFT JOIN khu_vuc kvt ON kvt.ma = kvs.kv
     LEFT JOIN goc ON goc.ma = m.ma AND goc.kv = kvs.kv
     LEFT JOIN giu ON giu.ma = m.ma AND giu.kv = kvs.kv
     ORDER BY m.ma, kvt.stt, kvs.kv`,
  ).bind(JSON.stringify(mas), ...(khuVuc.length ? [JSON.stringify(khuVuc)] : []), moc, moc).all();
  return c.json({ phien_ban_ton_kho: moc, rows: results });
});

// POST /api/partner/v1/don-loi-loc {case_ids: string[]} (2026-11-11, he DVBH menu "QL NSKX") - voi moi ca gui sang, tra cac don dat
// linh kien loai de xuat "HỖ TRỢ NGOÀI BẢO HÀNH TG12…" (KH tra gop NSKX/NPP - don dat loi loc) CON HIEU LUC (bo don 'TN tu choi' /
// 'Tu choi' / 'Da huy'). Ca noi voi don qua dat_don_case (nhieu ca/don) HOAC dat_don_hang.ma_yeu_cau_su_co (cu) - 2 index san co.
// Don chi khai ID Lada (khong co ma ca) van khop qua "lada": [[ma_lada, case_id], ...] (DVBH lay tu case_lada) - index idx_ddh_ma_lada.
// Toi da 1000 ca/lan, 1 bind JSON moi nhanh. Ca khong co don nao van tra ve (don: []) de ben goi danh dau "chua len don".
// GET /api/partner/v1/don-hoa-don?tu_ngay=YYYY-MM-DD (2026-11-14, he DVBH module "Sửa DT · HĐ · BH") - moi dong don co yeu cau xuat
// hoa don thuoc phieu xuat kho Ke toan da chot tu tu_ngay (mac dinh 01/11/2026), toi da 2000 dong, gom ca dong da huy (da_huy = 1).
// DVBH goi khi bam "Đồng bộ" - bu cho cac lan day (lib/hoaDonDvbh.ts pushHoaDonPxkSangDvbh) bi loi.
partnerApi.get("/v1/don-hoa-don", async (c) => {
  const tuNgay = c.req.query("tu_ngay") ?? "2026-11-01";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tuNgay)) return c.json({ error: "INVALID_TU_NGAY" }, 400);
  return c.json({ rows: await docDongHoaDon(c.env.DB, { tuNgay }) });
});

partnerApi.post("/v1/don-loi-loc", async (c) => {
  const body = await c.req.json<{ case_ids?: unknown; lada?: unknown }>().catch(() => ({}) as { case_ids?: unknown; lada?: unknown });
  const ids = Array.isArray(body.case_ids) ? [...new Set(body.case_ids.map((x) => String(x ?? "").trim()).filter(Boolean))] : [];
  if (!ids.length) return c.json({ error: "MISSING_CASE_IDS" }, 400);
  if (ids.length > 1000) return c.json({ error: "TOO_MANY_CASE_IDS", max: 1000 }, 400);
  const idSet = new Set(ids);
  const lada = (Array.isArray(body.lada) ? body.lada : [])
    .filter((p): p is unknown[] => Array.isArray(p) && p.length >= 2)
    .map((p) => [String(p[0] ?? "").trim().toUpperCase(), String(p[1] ?? "").trim()])
    .filter(([ma, id]) => ma && idSet.has(id))
    .slice(0, 5000);
  const json = JSON.stringify(ids);
  const { results } = await c.env.DB.prepare(
    `WITH lk AS (
       SELECT dc.case_id, dc.dat_don_hang_id AS don_id FROM dat_don_case dc WHERE dc.case_id IN (SELECT value FROM json_each(?))
       UNION
       SELECT d0.ma_yeu_cau_su_co, d0.id FROM dat_don_hang d0 WHERE d0.ma_yeu_cau_su_co IN (SELECT value FROM json_each(?))
       UNION
       SELECT json_extract(j.value, '$[1]'), d1.id FROM json_each(?) j JOIN dat_don_hang d1 ON d1.ma_lada = json_extract(j.value, '$[0]')
     )
     SELECT lk.case_id, d.id AS don_id, d.ma_lk, COALESCE(l.ten_linh_kien, d.ten_lk_snapshot) AS ten_lk, d.loai_de_xuat,
            d.so_luong_de_xuat, d.trang_thai_hien_tai, d.ngay_tao
     FROM lk JOIN dat_don_hang d ON d.id = lk.don_id
     LEFT JOIN linh_kien l ON l.ma_linh_kien = d.ma_lk
     WHERE instr(COALESCE(d.loai_de_xuat, ''), 'HỖ TRỢ NGOÀI BẢO HÀNH TG12') > 0
       AND COALESCE(d.trang_thai_hien_tai, '') NOT IN ('TN tu choi', 'Tu choi', 'Da huy')
     ORDER BY lk.case_id, d.ngay_tao`,
  ).bind(json, json, JSON.stringify(lada)).all<{ case_id: string; don_id: string; ma_lk: string; ten_lk: string | null; loai_de_xuat: string; so_luong_de_xuat: number; trang_thai_hien_tai: string | null; ngay_tao: string }>();
  const theoCa = new Map<string, unknown[]>(ids.map((id) => [id, []]));
  for (const r of results) {
    const { case_id, ...don } = r;
    theoCa.get(case_id)?.push(don);
  }
  return c.json({ rows: [...theoCa.entries()].map(([case_id, don]) => ({ case_id, don })) });
});

// POST /api/partner/v1/don-gan-nhat-theo-ca (2026-11-12, he DVBH "Quan ly ton" > Danh sach chi tiet, cot "ID đặt hàng gần nhất").
// Body: { ca: [[case_id, ma_lk_thieu], ...] (<=1000), lada?: [[ma_lada, case_id]], ma_don?: [[dat_don_hang.id, case_id]] }
//   - ma_don = ma don DVBH doc duoc tu o "Mã xuất hàng liên quan" cua giai trinh (chi gui ma dang DDH-xxxxxx).
// Moi ca tra 1 don "gan nhat": bo don tra hang / TN tu choi / Tu choi / Da huy; uu tien don dung ma LK thieu (ke ca ma cung nhom
// thay the), roi don tao moi nhat. Kem ngay duyet (lan dau "TN da duyet"), ngay xuat (lan dau PXK "Dang gui KTV"), ngay KTV nhan,
// trang thai don + trang thai PXK (ma ASCII, nhu GET /dat-mua-lk/don-hang). Ngay = gio VN "YYYY-MM-DD HH:MM:SS" nhu luu trong DB.
// ket_thuc = 1 khi PXK da KTV nhan / tru kho / kho ket thuc -> ben goi it phai hoi lai. Ca khong co don van tra (don: null).
partnerApi.post("/v1/don-gan-nhat-theo-ca", async (c) => {
  type Cap = [string, string];
  const body = await c.req.json<{ ca?: unknown; lada?: unknown; ma_don?: unknown }>().catch(() => ({}) as { ca?: unknown; lada?: unknown; ma_don?: unknown });
  const cap = (v: unknown, hoa0 = false): Cap[] =>
    (Array.isArray(v) ? v : [])
      .filter((p): p is unknown[] => Array.isArray(p) && p.length >= 2)
      .map((p) => [String(p[0] ?? "").trim(), String(p[1] ?? "").trim()] as Cap)
      .map(([a, b]) => [hoa0 ? a.toUpperCase() : a, b] as Cap);
  const ca = new Map<string, string>();
  for (const [id, ma] of cap(body.ca)) if (id) ca.set(id, ma);
  if (!ca.size) return c.json({ error: "MISSING_CA" }, 400);
  if (ca.size > 1000) return c.json({ error: "TOO_MANY_CA", max: 1000 }, 400);
  const lada = cap(body.lada, true).filter(([ma, id]) => ma && ca.has(id)).slice(0, 5000);
  const maDon = cap(body.ma_don, true).filter(([ma, id]) => ma && ca.has(id)).slice(0, 5000);
  const ids = [...ca.keys()];
  const db = c.env.DB;
  const maLkThieu = [...new Set([...ca.values()].filter(Boolean))];

  const [donRes, tdRes] = await db.batch([
    db.prepare(
      `WITH lk AS (
         SELECT dc.case_id, dc.dat_don_hang_id AS don_id, 1 AS uu_tien FROM dat_don_case dc WHERE dc.case_id IN (SELECT value FROM json_each(?1))
         UNION
         SELECT d0.ma_yeu_cau_su_co, d0.id, 1 FROM dat_don_hang d0 WHERE d0.ma_yeu_cau_su_co IN (SELECT value FROM json_each(?1))
         UNION
         SELECT json_extract(j.value, '$[1]'), d1.id, 2 FROM json_each(?2) j JOIN dat_don_hang d1 ON d1.ma_lada = json_extract(j.value, '$[0]')
         UNION
         SELECT json_extract(j.value, '$[1]'), d2.id, 3 FROM json_each(?3) j JOIN dat_don_hang d2 ON d2.id = json_extract(j.value, '$[0]')
       )
       SELECT lk.case_id, MIN(lk.uu_tien) AS uu_tien, ddh.id AS don_id, ddh.ma_lk, COALESCE(l.ten_linh_kien, ddh.ten_lk_snapshot) AS ten_lk,
              ddh.loai_de_xuat, ddh.trang_thai_hien_tai, ${TRANG_THAI_PXK_DON_SQL("ddh")} AS trang_thai_pxk, ddh.ngay_tao,
              (SELECT MIN(g.ngay_xu_ly) FROM dat_don_hang_log g WHERE g.dat_don_hang_id = ddh.id AND g.trang_thai = 'TN da duyet') AS ngay_duyet,
              (SELECT MIN(pl.ngay_xu_ly) FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho_log pl ON pl.phieu_xuat_kho_id = pd.phieu_xuat_kho_id
                WHERE pd.dat_don_hang_id = ddh.id AND pl.trang_thai = 'Dang gui KTV') AS ngay_xuat,
              (SELECT MIN(pl.ngay_xu_ly) FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho_log pl ON pl.phieu_xuat_kho_id = pd.phieu_xuat_kho_id
                WHERE pd.dat_don_hang_id = ddh.id AND pl.trang_thai = 'KTV da nhan') AS ngay_ktv_nhan
       FROM lk JOIN dat_don_hang ddh ON ddh.id = lk.don_id
       LEFT JOIN linh_kien l ON l.ma_linh_kien = ddh.ma_lk
       WHERE ddh.loai_don != 'tra_hang' AND COALESCE(ddh.trang_thai_hien_tai, '') NOT IN ('TN tu choi', 'Tu choi', 'Da huy')
       GROUP BY lk.case_id, ddh.id`,
    ).bind(JSON.stringify(ids), JSON.stringify(lada), JSON.stringify(maDon)),
    db.prepare(
      `SELECT a.ma_lk AS goc, b.ma_lk AS td FROM lk_nhom_thay_the_ct a JOIN lk_nhom_thay_the_ct b ON b.nhom_id = a.nhom_id
       WHERE a.ma_lk IN (SELECT value FROM json_each(?))`,
    ).bind(JSON.stringify(maLkThieu)),
  ]);
  type DonRow = {
    case_id: string; uu_tien: number; don_id: string; ma_lk: string; ten_lk: string | null; loai_de_xuat: string | null;
    trang_thai_hien_tai: string | null; trang_thai_pxk: string | null; ngay_tao: string; ngay_duyet: string | null; ngay_xuat: string | null; ngay_ktv_nhan: string | null;
  };
  const tuongDuong = new Map<string, Set<string>>();
  for (const r of (tdRes.results ?? []) as { goc: string; td: string }[]) {
    if (!tuongDuong.has(r.goc)) tuongDuong.set(r.goc, new Set([r.goc]));
    tuongDuong.get(r.goc)!.add(r.td);
  }
  const theoCa = new Map<string, DonRow[]>();
  for (const r of (donRes.results ?? []) as DonRow[]) {
    const k = String(r.case_id);
    if (!theoCa.has(k)) theoCa.set(k, []);
    theoCa.get(k)!.push(r);
  }
  const NGUON = ["", "lien_ket", "lada", "giai_trinh"];
  const KET_THUC = new Set(["ktv_da_nhan", "hang_tru_kho", "kho_da_ket_thuc"]);
  const rows = ids.map((case_id) => {
    const ds = theoCa.get(case_id) ?? [];
    const thieu = ca.get(case_id) ?? "";
    const khop = (r: DonRow) => !!thieu && (r.ma_lk === thieu || !!tuongDuong.get(thieu)?.has(r.ma_lk));
    const chon = [...ds].sort((a, b) => Number(khop(b)) - Number(khop(a)) || b.ngay_tao.localeCompare(a.ngay_tao) || b.don_id.localeCompare(a.don_id))[0];
    if (!chon) return { case_id, so_don: 0, don: null };
    const { case_id: _c, uu_tien, ...don } = chon;
    return {
      case_id,
      so_don: ds.length,
      don: { ...don, nguon: NGUON[uu_tien] ?? "lien_ket", khop_ma_lk: khop(chon) ? 1 : 0, ket_thuc: KET_THUC.has(chon.trang_thai_pxk ?? "") ? 1 : 0 },
    };
  });
  return c.json({ rows });
});


// GET /api/partner/v1/vi-pham (2026-11-17, v1.517) - cac ca QUA HAN SLA tung buoc + giai trinh + gan the vi pham (xem lib/viPham.ts).
// Doi tac TU KEO (chot quan ly). Con tro: cap_nhat_tu + after_id (thu tu cap_nhat_luc, id) - moi doi trang thai / giai trinh / roi buoc
// deu doi cap_nhat_luc nen doi tac keo lai tu con tro cuoi la nhan du thay doi. Loc: loai=dat_hang|tra_hang, trang_thai (danh sach,
// "Cho giai trinh,Da giai trinh,Ton CEO; "Gan the" van nhan = Ton CEO"), buoc, bo_phan, don (ma DDH), khu_vuc. limit <= 500.
partnerApi.get("/v1/vi-pham", async (c) => {
  const db = c.env.DB;
  const limit = Math.min(500, Math.max(1, Number(c.req.query("limit") ?? 200) || 200));
  const dk: string[] = ["1 = 1"];
  const binds: unknown[] = [];
  const tu = c.req.query("cap_nhat_tu")?.trim();
  const afterId = Number(c.req.query("after_id") ?? "");
  if (tu && Number.isFinite(afterId) && afterId > 0) {
    dk.push("(v.cap_nhat_luc > ? OR (v.cap_nhat_luc = ? AND v.id > ?))");
    binds.push(tu, tu, afterId);
  } else if (tu) {
    dk.push("v.cap_nhat_luc >= ?");
    binds.push(tu);
  }
  const loai = c.req.query("loai");
  if (loai) {
    if (loai !== "dat_hang" && loai !== "tra_hang") return c.json({ error: "INVALID_LOAI" }, 400);
    dk.push("v.loai = ?");
    binds.push(loai);
  }
  // "Gan the" (ten cu truoc v1.524) van nhan = "Ton CEO".
  const trangThai = tachMa(c.req.query("trang_thai")).map((x) => (x === "Gan the" ? "Ton CEO" : x));
  if (trangThai.length) {
    dk.push("v.trang_thai IN (SELECT value FROM json_each(?))");
    binds.push(JSON.stringify(trangThai));
  }
  const buoc = tachMa(c.req.query("buoc"));
  if (buoc.some((b) => !BUOC_THEO_MA.has(b))) return c.json({ error: "INVALID_BUOC" }, 400);
  if (buoc.length) {
    dk.push("v.buoc IN (SELECT value FROM json_each(?))");
    binds.push(JSON.stringify(buoc));
  }
  const boPhan = tachMa(c.req.query("bo_phan"));
  if (boPhan.length) {
    dk.push("v.bo_phan IN (SELECT value FROM json_each(?))");
    binds.push(JSON.stringify(boPhan));
  }
  const khuVuc = tachMa(c.req.query("khu_vuc"));
  if (khuVuc.length) {
    dk.push("v.khu_vuc_ma IN (SELECT value FROM json_each(?))");
    binds.push(JSON.stringify(khuVuc));
  }
  const don = tachMa(c.req.query("don")).map((x) => x.toUpperCase());
  if (don.length) {
    dk.push(`(v.dat_don_hang_id IN (SELECT value FROM json_each(?))
             OR v.phieu_xuat_kho_id IN (SELECT pd.phieu_xuat_kho_id FROM phieu_xuat_kho_dong pd WHERE pd.dat_don_hang_id IN (SELECT value FROM json_each(?))))`);
    binds.push(JSON.stringify(don), JSON.stringify(don));
  }
  const { results } = await db
    .prepare(`SELECT ${VI_PHAM_COT_SQL} ${VI_PHAM_FROM_SQL} WHERE ${dk.join(" AND ")} ORDER BY v.cap_nhat_luc, v.id LIMIT ?`)
    .bind(...binds, limit)
    .all<ViPhamRow & { cap_nhat_luc: string }>();
  const now = nowVN();
  const rows = (results ?? []).map((r) => boSungViPham(r, now));
  const cuoi = results && results.length === limit ? results[results.length - 1] : null;
  return c.json({ rows, next: cuoi ? { cap_nhat_tu: cuoi.cap_nhat_luc, after_id: cuoi.id } : null, thoi_diem: now });
});

// GET /api/partner/v1/vi-pham/buoc - danh muc buoc + SLA dang ap (de doi tac hien thi / doi chieu).
partnerApi.get("/v1/vi-pham/buoc", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT ma, so_gio, gio_giai_trinh, tinh_cuoi_tuan, bat_tat FROM sla_buoc").all<{
    ma: string; so_gio: number; gio_giai_trinh: number; tinh_cuoi_tuan: number; bat_tat: number;
  }>();
  const cfg = new Map((results ?? []).map((r) => [r.ma, r]));
  return c.json({
    buoc: [...BUOC_THEO_MA.values()].map((b) => {
      const k = cfg.get(b.ma);
      return {
        ma: b.ma, ten: b.ten, loai: b.loai, bo_phan: b.boPhan, doi_tuong: b.doiTuong,
        so_gio_sla: k?.so_gio ?? null, gio_giai_trinh: k?.gio_giai_trinh ?? null, tinh_cuoi_tuan: !!k?.tinh_cuoi_tuan, bat: !!k?.bat_tat,
      };
    }),
  });
});

// GET /api/partner/v1/danh-sach-ton?loai=ton-ceo (2026-11-18, v1.524) - "Danh sách các đơn bị lỗi tồn CEO sẽ bắn API sang cho đối tác. tương
// tự như cách app DVBH đang bắn đơn tồn CEO sang app vi phạm của đối tác (bên ngoài)". CUNG HINH DANG voi DVBH GET /api/partner/danh-sach-ton
// ?loai=canh-bao-ceo (loai, mo_ta, thoi_diem_lay, chot_luc, tong_hop[], so_ca, cases[]) de app vi pham dung lai bo doc. "Ton CEO" = vi pham
// het han giai trinh ma chua giai trinh (lib/viPham.ts quetViPham). Tinh tai thoi diem goi (chot_luc = null). Mac dinh: ca chuyen Ton CEO
// trong 30 ngay gan nhat; tu_ngay / den_ngay (YYYY-MM-DD, theo ngay chuyen Ton CEO, gio VN); con_ton=1 chi ca thuc the van ket o buoc;
// loai=dat_hang|tra_hang qua tham so nhom. <= 2000 ca (vuot -> con_nua = true, thu hep ngay).
const NGAY_RE = /^\d{4}-\d{2}-\d{2}$/;
partnerApi.get("/v1/danh-sach-ton", async (c) => {
  const loai = c.req.query("loai");
  if (loai !== "ton-ceo") return c.json({ error: "INVALID_LOAI", loai_hop_le: ["ton-ceo"] }, 400);
  const now = nowVN();
  // CON TRO (v1.525, "tránh 1 ca bị kéo lại liên tục"): gui cap_nhat_tu (+ after_id) = next cua lan truoc -> chi tra ca CHUYEN Ton CEO
  // hoac THAY DOI sau moc (thu tu cap_nhat_luc, id). Ca Ton CEO chi doi cap_nhat_luc khi don / phieu roi buoc (con_ton -> false) nen moi ca
  // di qua toi da 2 lan. Lan dau: cap_nhat_tu=2000-01-01. Co con tro thi bo qua tu_ngay / den_ngay.
  const conTroTu = c.req.query("cap_nhat_tu")?.trim();
  const afterId = Number(c.req.query("after_id") ?? "");
  const dk = ["v.trang_thai = 'Ton CEO'"];
  const binds: unknown[] = [];
  let tuNgay: string | null = null;
  let denNgay: string | null = null;
  if (conTroTu) {
    if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(conTroTu)) return c.json({ error: "INVALID_CAP_NHAT_TU" }, 400);
    if (Number.isFinite(afterId) && afterId > 0) {
      dk.push("(v.cap_nhat_luc > ? OR (v.cap_nhat_luc = ? AND v.id > ?))");
      binds.push(conTroTu, conTroTu, afterId);
    } else {
      dk.push("v.cap_nhat_luc >= ?");
      binds.push(conTroTu);
    }
  } else {
    tuNgay = c.req.query("tu_ngay")?.trim() || new Date(Date.parse(now.slice(0, 10) + "T00:00:00Z") - 30 * 86_400_000).toISOString().slice(0, 10);
    denNgay = c.req.query("den_ngay")?.trim() || now.slice(0, 10);
    if (!NGAY_RE.test(tuNgay) || !NGAY_RE.test(denNgay)) return c.json({ error: "INVALID_NGAY" }, 400);
    dk.push("v.gan_the_luc >= ?", "v.gan_the_luc < date(?, '+1 day')");
    binds.push(tuNgay + " 00:00:00", denNgay);
  }
  const nhom = c.req.query("nhom");
  if (nhom) {
    if (nhom !== "dat_hang" && nhom !== "tra_hang") return c.json({ error: "INVALID_NHOM" }, 400);
    dk.push("v.loai = ?");
    binds.push(nhom);
  }
  if (c.req.query("con_ton") === "1") dk.push("v.ket_thuc_luc IS NULL");
  const GIOI_HAN = conTroTu ? Math.min(500, Math.max(1, Number(c.req.query("limit") ?? 200) || 200)) : 2000;
  const { results } = await c.env.DB
    .prepare(`SELECT ${VI_PHAM_COT_SQL} ${VI_PHAM_FROM_SQL} WHERE ${dk.join(" AND ")}
              ORDER BY ${conTroTu ? "v.cap_nhat_luc, v.id" : "v.gan_the_luc DESC, v.id DESC"} LIMIT ?`)
    .bind(...binds, GIOI_HAN + 1)
    .all<ViPhamRow>();
  const trang = (results ?? []).slice(0, GIOI_HAN);
  const conNua = (results ?? []).length > GIOI_HAN;
  const cuoi = trang[trang.length - 1] as (ViPhamRow & { cap_nhat_luc: string }) | undefined;
  // next LUON tra khi dung con tro (ke ca het du lieu) de doi tac luu lai va lan sau gui tiep; khong co ca moi -> giu nguyen con tro cu.
  const next = conTroTu
    ? (cuoi ? { cap_nhat_tu: cuoi.cap_nhat_luc, after_id: cuoi.id } : { cap_nhat_tu: conTroTu, after_id: Number.isFinite(afterId) && afterId > 0 ? afterId : 0 })
    : null;
  const ds = trang.map((r) => {
    const x = boSungViPham(r, now);
    return { ...x, con_ton: x.dang_cho, nhom: [x.buoc] };
  });
  const dem = new Map<string, number>();
  for (const r of ds) dem.set(r.buoc, (dem.get(r.buoc) ?? 0) + 1);
  return c.json({
    loai,
    mo_ta: "Tồn CEO — quá hạn SLA, hết hạn giải trình mà chưa giải trình",
    thoi_diem_lay: now,
    chot_luc: null,
    tu_ngay: tuNgay,
    den_ngay: denNgay,
    tong_hop: [...BUOC_THEO_MA.values()].map((b) => ({ ma: b.ma, ten: b.ten, loai: b.loai, bo_phan: b.boPhan, so_ca: dem.get(b.ma) ?? 0 })),
    so_ca: ds.length,
    con_nua: conNua,
    next,
    cases: ds,
  });
});

// Dat linh kien qua API (v1.470) - xem routes/partnerDatHang.ts.
ganRouteDatHang(partnerApi);

export default partnerApi;
