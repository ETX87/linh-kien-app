import { Hono } from "hono";
import type { Env } from "../types";
import { partnerApiAuth } from "../lib/partnerApiAuth";
import { buildCaseTimeline } from "../lib/partnerTimeline";
import { docLienQuanLk } from "../lib/linhKienLienQuan";
import { dsAnhLk } from "../lib/anhLinhKien";
import { docCongNoTongHop, SL_HO_TRO_0D_SQL } from "../lib/congNoKtv";
import { donChoHangDuTonKho, getMocTonKhoCongTy } from "../lib/tonKhoCongTy";
import { ktvChinhCuaEmailSql } from "../lib/ktvChinh";

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

export default partnerApi;
