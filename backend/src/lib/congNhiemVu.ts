/**
 * CONG NHIEM VU eOffice (v1.554, 2026-11-23) - day CA QUA HAN CHO GIAI TRINH len App Nhiem vu cong ty
 * (https://etx-eoffice.web.app/task, tab Lien ket, khoi "Đặt linh kiện") + thong bao day ve dien thoai.
 * Yeu cau: "kiem tra logic cua app nhiem vu: day cac nhiem vu can giai trinh qua han cho giai trinh" -> "Lam luon".
 * Dac ta cong: skill qlbh3t-cf-integrations / api-cong-nhiem-vu.md. Ma app "dat-linh-kien", khoa = secret TASK_FEED_KEY.
 *
 * Luon gui ANH CHUP DU (toanBo: true): moi lan gom TOAN BO ca vi_pham 'Cho giai trinh' cua MOI nguoi phu trach
 * (cot nguoi_phu_trach - CUNG nguon voi "Cần tôi giải trình" + chuong + popup nhac). Nguoi vang mat = cong xoa het
 * viec cua ho -> ca da giai trinh / chuyen Ton CEO tu bien mat o lan gui ke tiep.
 * Khi nao gui: (1) cron moi gio ngay sau quetViPham, (2) sau khi 1 ca duoc giai trinh (waitUntil),
 * (3) Admin bam "Đẩy lên App Nhiệm vụ" (menu Quá hạn & vi phạm › Cấu hình SLA).
 * Chua nap secret -> bo qua im lang (khong lam hong nghiep vu).
 */
import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { BUOC_THEO_MA, GIO_NHAC, tinhHan } from "./viPham";

const CONG = "https://asia-southeast1-etx-nhan-su.cloudfunctions.net/taskFeedNhan";
const APP = "dat-linh-kien";
const KHOA_STATE = "cong_nhiem_vu_state";

export interface ViecCong { id: string; title: string; tag?: string; link?: string; han?: string; khan?: boolean }
type Nguoi = { maNS: string } | { email: string };
export interface KetQuaCong {
  ok: boolean; nguoi: number; viec: number; khan: number;
  viecMoi?: number; khongRo?: unknown[]; loi?: string; luc: string; bo_qua?: boolean;
}

const cat = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const hh = (s: string) => `${s.slice(11, 16)} ${s.slice(8, 10)}/${s.slice(5, 7)}`;

/** Gom anh chup du: moi nguoi phu trach -> danh sach ca 'Cho giai trinh'. Khoa nguoi = Ma NS (cong tu tra email), khong co thi email. */
export async function gomViecGiaiTrinh(env: Env): Promise<{ nguoi: Nguoi; items: ViecCong[] }[]> {
  const rows = (
    await env.DB.prepare(
      `SELECT v.id, v.buoc, v.doi_tuong_id, v.han, v.han_giai_trinh, LOWER(TRIM(j.value)) AS email, u.ma_nhan_su
       FROM vi_pham v, json_each(COALESCE(v.nguoi_phu_trach, '[]')) j
       LEFT JOIN users u ON LOWER(u.email) = LOWER(TRIM(j.value))
       WHERE v.trang_thai = 'Cho giai trinh'`,
    ).all<{ id: number; buoc: string; doi_tuong_id: string; han: string; han_giai_trinh: string; email: string; ma_nhan_su: string | null }>()
  ).results ?? [];
  const sapHet = tinhHan(nowVN(), GIO_NHAC, false);
  const base = (env.FRONTEND_URL || "https://linhkien.dichvu3t.workers.dev").replace(/\/+$/, "");
  const map = new Map<string, { nguoi: Nguoi; items: ViecCong[] }>();
  for (const r of rows) {
    if (!r.email) continue;
    const ma = (r.ma_nhan_su ?? "").trim();
    const k = ma ? `ns:${ma}` : `em:${r.email}`;
    if (!map.has(k)) map.set(k, { nguoi: ma ? { maNS: ma } : { email: r.email }, items: [] });
    const ds = map.get(k)!.items;
    const id = `VP-${r.id}`;
    if (ds.some((x) => x.id === id)) continue;
    const ten = BUOC_THEO_MA.get(r.buoc)?.ten ?? r.buoc;
    ds.push({
      id,
      tag: "Giải trình quá hạn",
      title: cat(`${r.doi_tuong_id} · ${ten} · quá hạn SLA ${hh(r.han)} · giải trình trước ${hh(r.han_giai_trinh)}`, 200),
      link: `${base}/?vi_pham=can_toi`,
      han: r.han_giai_trinh.slice(0, 10),
      // con <= GIO_NHAC gio lam viec (cung nguong voi thong bao "Sắp hết hạn giải trình") -> khan
      khan: r.han_giai_trinh <= sapHet,
    });
  }
  // khan len dau, roi han giai trinh som nhat (cong giu toi da 20 dong / nguoi, uu tien dong khan)
  for (const v of map.values()) v.items.sort((a, b) => Number(!!b.khan) - Number(!!a.khan) || (a.han ?? "").localeCompare(b.han ?? ""));
  return [...map.values()];
}

async function guiCong(key: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let loi = "";
  for (let lan = 0; lan < 3; lan++) {
    const r = await fetch(CONG, {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ app: APP, ...body }),
    });
    if (r.ok) return (await r.json()) as Record<string, unknown>;
    loi = `HTTP_${r.status}: ${(await r.text()).slice(0, 200)}`;
    if (r.status < 500) break; // 400/401: thu lai cung vo ich
    await new Promise((s) => setTimeout(s, 1000 * (lan + 1)));
  }
  throw new Error(loi);
}

async function bam(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function docState(env: Env): Promise<(KetQuaCong & { hash?: string | null }) | null> {
  const st = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(KHOA_STATE).first<{ value: string }>();
  try { return st ? JSON.parse(st.value) : null; } catch { return null; }
}

/** Gui anh chup du. force = gui ca khi danh sach khong doi (nut Admin). Tra null khi chua nap khoa. */
export async function dayCongNhiemVu(env: Env, opts: { force?: boolean } = {}): Promise<KetQuaCong | null> {
  const key = env.TASK_FEED_KEY;
  if (!key) return null;
  const cu = await docState(env);
  let kq: KetQuaCong;
  let hash: string | null = null;
  try {
    const ds = await gomViecGiaiTrinh(env);
    const nguoi = ds.map((d) => ({ ...d.nguoi, items: d.items.slice(0, 200) }));
    hash = await bam(JSON.stringify(nguoi));
    const viec = ds.reduce((s, d) => s + d.items.length, 0);
    const khan = ds.reduce((s, d) => s + d.items.filter((x) => x.khan).length, 0);
    // khong doi so voi lan gui thanh cong truoc -> khong goi cong
    if (!opts.force && cu?.ok && cu.hash === hash) return { ...cu, bo_qua: true };
    const r = await guiCong(key, { toanBo: true, nguoi });
    kq = {
      ok: r.ok === true, nguoi: ds.length, viec, khan,
      viecMoi: r.viecMoi as number | undefined,
      khongRo: Array.isArray(r.khongRo) && r.khongRo.length ? r.khongRo : undefined, luc: nowVN(),
    };
  } catch (err) {
    kq = { ok: false, nguoi: 0, viec: 0, khan: 0, loi: (err instanceof Error ? err.message : String(err)).slice(0, 300), luc: nowVN() };
    console.error("[congNhiemVu]", kq.loi);
  }
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind(KHOA_STATE, JSON.stringify({ ...kq, hash: kq.ok ? hash : null }), kq.luc).run();
  return kq;
}

export async function trangThaiCong(env: Env): Promise<{ bat: boolean; lan_cuoi: KetQuaCong | null }> {
  const st = await docState(env);
  if (st) delete st.hash;
  return { bat: !!env.TASK_FEED_KEY, lan_cuoi: st };
}
