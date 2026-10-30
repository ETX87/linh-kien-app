// Keo ton kho tu app "Phan tich ton kho 3T" - KHO DU LIEU MISA GOC (2026-10-30, repo phan-tich-ton-kho-3t:
// docs/KE_HOACH_KHO_MISA.md + docs/API_DOI_TAC_MISA.md). Ke toan nhap file MISA 1 lan o app do; app nay KEO ve giu ban
// sao (khong goi app do luc tao don / tu duyet). Cong tac app_settings 'nguon_ton_kho':
//   file    (mac dinh) - nhu cu, Ke toan import file o day; khong keo.
//   hub_thu - chay song song: keo vao BANG BONG (hub_*), KHONG anh huong nghiep vu - de doi chieu voi bang that.
//   hub     - keo vao bang THAT + ghi moc nhap ton = phien_ban cua app do (= luc Ke toan nhap file) + tu xac nhan hang ve.
// Kich hoat: app do bao qua POST /api/hub-misa/thong-bao (routes/hubMisa.ts) + cron moi gio (index.ts) + nut "Kéo ngay".
import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { BANG, chotTonKho, ghiLoTonKho, lenhXoaTam, type DongTonMisa } from "./tonKhoNhap";
import { tuDongXacNhanHangVe } from "./tuDongHangVe";

export type NguonTonKho = "file" | "hub_thu" | "hub";

// Tai khoan he thong (migration 0104) dung ten cho moi ghi chep tu dong cua luong keo - cac cot nguoi_* REFERENCES users(email).
export const NGUOI_HE_THONG = "ton-kho-misa@he-thong.local";

export async function docNguonTonKho(db: D1Database): Promise<NguonTonKho> {
  const v = await db.prepare("SELECT value FROM app_settings WHERE key = 'nguon_ton_kho'").first<string>("value");
  return v === "hub" || v === "hub_thu" ? v : "file";
}

interface MetaHub { phien_ban: string | null; ky_tu_ngay?: string | null; ky_den_ngay?: string | null; so_dong?: number; ten_file?: string | null }
interface TrangHub { phien_ban: string; ky_tu_ngay: string | null; ky_den_ngay: string | null; rows: DongTonMisa[]; next_after: number | null }

export const coCauHinhHub = (env: Env) => !!env.HUB_API_KEY && (!!env.HUB_SERVICE || !!env.HUB_BASE_URL);

async function goiHub<T>(env: Env, duongDan: string): Promise<{ status: number; body: T }> {
  const req = new Request(new URL(`/api/doi-tac${duongDan}`, env.HUB_BASE_URL || "https://phantichtonkho.dichvu3t.workers.dev"), {
    headers: { "X-API-Key": env.HUB_API_KEY! },
    signal: AbortSignal.timeout(15000),
  });
  const res = env.HUB_SERVICE ? await env.HUB_SERVICE.fetch(req) : await fetch(req);
  const body = (await res.json().catch(() => null)) as T;
  if (!res.ok && res.status !== 409) throw new Error(`HUB_HTTP_${res.status} ${(body as { error?: string } | null)?.error ?? ""}`.trim());
  return { status: res.status, body };
}

export async function metaHub(env: Env): Promise<MetaHub> {
  return (await goiHub<MetaHub>(env, "/v1/misa/ton-kho/meta")).body;
}

type KetQuaKeo = { trang_thai: string; phien_ban?: string | null; so_dong?: number; che_do?: NguonTonKho; chua_khop?: number; loi?: string };

async function ghiTrangThaiKeo(db: D1Database, kq: KetQuaKeo) {
  await db
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('hub_ton_kho_keo', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(JSON.stringify(kq), nowVN())
    .run();
}

// Keo phien ton moi nhat (neu doi so voi lan keo truoc cung che do, hoac epBuoc). Khoa chong chay chong (2 lan bao cung luc).
export async function keoTonKhoTuHub(env: Env, opts: { epBuoc?: boolean; ctx?: { waitUntil(p: Promise<unknown>): void } } = {}): Promise<KetQuaKeo> {
  const db = env.DB;
  const cheDo = await docNguonTonKho(db);
  if (cheDo === "file") return { trang_thai: "bo_qua_nguon_file" };
  if (!coCauHinhHub(env)) return { trang_thai: "chua_cau_hinh" };
  const now = nowVN();
  // Khoa 10 phut: UPDATE ... WHERE het han -> chi 1 lan chay thang.
  const khoa = await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('hub_ton_kho_khoa', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE app_settings.value < ?`,
    )
    .bind(new Date(Date.now() + 7 * 3600e3 + 600e3).toISOString().slice(0, 19).replace("T", " "), now, now)
    .run();
  if (!khoa.meta.changes) return { trang_thai: "dang_keo" };
  try {
    const meta = await metaHub(env);
    if (!meta.phien_ban) return await ketThuc({ trang_thai: "hub_chua_co_du_lieu" });
    const truoc = await db.prepare("SELECT value FROM app_settings WHERE key = 'hub_ton_kho_keo'").first<string>("value");
    const tt = truoc ? (JSON.parse(truoc) as KetQuaKeo) : null;
    if (!opts.epBuoc && tt?.trang_thai === "xong" && tt.phien_ban === meta.phien_ban && tt.che_do === cheDo) {
      return { trang_thai: "khong_doi", phien_ban: meta.phien_ban, che_do: cheDo };
    }
    await db.batch(lenhXoaTam(db, BANG.hub_tam));
    let after: number | null = 0;
    let soDong = 0;
    const chuaKhop = new Set<string>();
    let trang: TrangHub | null = null;
    while (after !== null) {
      const r: { status: number; body: TrangHub } = await goiHub<TrangHub>(env, `/v1/misa/ton-kho?phien_ban=${encodeURIComponent(meta.phien_ban)}&after=${after}&limit=2000`);
      if (r.status === 409) {
        await db.batch(lenhXoaTam(db, BANG.hub_tam));
        return await ketThuc({ trang_thai: "phien_doi_giua_chung", phien_ban: meta.phien_ban, che_do: cheDo });
      }
      const tr: TrangHub = r.body;
      trang = tr;
      // ghiLoTonKho batch theo lo nho (D1 gioi han lenh / batch) - 2000 dong / trang chia 500.
      for (let i = 0; i < tr.rows.length; i += 500) {
        const kq = await ghiLoTonKho(db, tr.rows.slice(i, i + 500), BANG.hub_tam);
        kq.unmatched.forEach((m) => chuaKhop.add(m));
      }
      soDong += tr.rows.length;
      after = tr.next_after;
    }
    if (cheDo === "hub") {
      await chotTonKho(db, BANG.hub_tam, BANG.that, {
        value: { ky_tu_ngay: trang?.ky_tu_ngay ?? meta.ky_tu_ngay ?? null, ky_den_ngay: trang?.ky_den_ngay ?? meta.ky_den_ngay ?? null, so_dong: soDong, nguon: "hub", ten_file: meta.ten_file ?? null },
        updated_by: NGUOI_HE_THONG,
        // MOC NHAP TON = luc Ke toan nhap file o app do (khong phai luc keo ve) -> don "sau lan import" giu dung nghia.
        updated_at: meta.phien_ban,
      });
      const p = tuDongXacNhanHangVe(env, db, NGUOI_HE_THONG, "Nhập tồn kho từ app Phân tích tồn kho").then(() => undefined).catch((e) => console.error("[tuDongXacNhanHangVe]", e));
      if (opts.ctx) opts.ctx.waitUntil(p);
      else await p;
    } else {
      await chotTonKho(db, BANG.hub_tam, BANG.bong);
    }
    return await ketThuc({ trang_thai: "xong", phien_ban: meta.phien_ban, so_dong: soDong, che_do: cheDo, chua_khop: chuaKhop.size });
  } catch (e) {
    return await ketThuc({ trang_thai: "loi", loi: String((e as Error)?.message ?? e).slice(0, 300), che_do: cheDo });
  } finally {
    await db.prepare("UPDATE app_settings SET value = '' WHERE key = 'hub_ton_kho_khoa'").run();
  }

  async function ketThuc(kq: KetQuaKeo) {
    await ghiTrangThaiKeo(db, kq);
    return kq;
  }
}

// Doi chieu bang BONG (keo tu app do) voi bang THAT (Ke toan import file o day) - giai doan chay song song.
// So theo (ma kho x ma hang) cuoi ky, ca kho KTV lan kho cong ty. Khop hoan toan = 0 dong lech.
export async function doiChieuBong(db: D1Database) {
  const sql = (ktv: string, kct: string) =>
    `SELECT ma_kho, ma_hang, cuoi_ky FROM ${ktv} UNION ALL SELECT kho_ma, ma_hang, cuoi_ky FROM ${kct}`;
  const [tong, lech] = await Promise.all([
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM ktv_ton_kho) + (SELECT COUNT(*) FROM kho_cong_ty_ton_kho) AS dong_that,
              (SELECT COUNT(*) FROM hub_ktv_ton_kho) + (SELECT COUNT(*) FROM hub_kho_cong_ty_ton_kho) AS dong_bong,
              (SELECT COALESCE(SUM(cuoi_ky), 0) FROM ktv_ton_kho) + (SELECT COALESCE(SUM(cuoi_ky), 0) FROM kho_cong_ty_ton_kho) AS tong_that,
              (SELECT COALESCE(SUM(cuoi_ky), 0) FROM hub_ktv_ton_kho) + (SELECT COALESCE(SUM(cuoi_ky), 0) FROM hub_kho_cong_ty_ton_kho) AS tong_bong`,
    ).first(),
    db.prepare(
      `SELECT ma_kho, ma_hang, SUM(that) AS that, SUM(bong) AS bong FROM (
         SELECT ma_kho, ma_hang, cuoi_ky AS that, 0 AS bong FROM (${sql("ktv_ton_kho", "kho_cong_ty_ton_kho")})
         UNION ALL SELECT ma_kho, ma_hang, 0, cuoi_ky FROM (${sql("hub_ktv_ton_kho", "hub_kho_cong_ty_ton_kho")})
       ) GROUP BY ma_kho, ma_hang HAVING ABS(COALESCE(SUM(that), 0) - COALESCE(SUM(bong), 0)) > 0.0001
       ORDER BY ABS(COALESCE(SUM(that), 0) - COALESCE(SUM(bong), 0)) DESC LIMIT 200`,
    ).all(),
  ]);
  return { tong, lech: lech.results };
}
