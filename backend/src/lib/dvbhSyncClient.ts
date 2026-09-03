import type { Env } from "../types";
import { nowVN } from "./vnTime";

// Day danh ba KTV (ktv_lien_he) + danh muc linh kien (linh_kien) sang he DVBH goc dinh ky (phan hoi
// 2026-08-28: "khi cập nhật danh sách ktv hoặc cập nhật danh sách linh kiện, sẽ bắn API về web dvbh
// để cập nhật bổ sung dữ liệu mới nhất") - linh-kien-app la nguon su that cho 2 bang nay tu sau khi
// tach he (xem CLAUDE.md muc "Nguon goc tach he thong"), sync GHI DE thang cac cot chung ben DVBH,
// KHONG dong bo xoa (upsert-only - xem POST /sync/ktv, /sync/linh-kien cua he goc,
// PARTNER_API_GUIDE.md muc 8).
//
// Dung Service Binding CASE_LOOKUP_SERVICE (KHONG phai fetch() toi URL that) - 2 Worker cung 1 tai
// khoan Cloudflare, fetch() thang bi chan loi 1042 (chong SSRF) - xem giai thich day du trong
// lib/caseLookupClient.ts (diem noi truoc do, cung 1 gioi han).
//
// Con tro dong bo (dvbh_sync_state.last_synced_at, migration 0012) chi advance khi TOAN BO lo cua 1
// entity gui thanh cong - loi giua chung (DVBH tam down, key sai...) thi lan sau tu gui lai nguyen
// ven, an toan nho endpoint nhan la upsert (chay lai nhieu lan khong sao).
const SYNC_BATCH_SIZE = 200;

// Chi gui cac truong 2 ben DEU CO - DVBH KHONG co khu_vuc_ma/ktv_cap1_phu_trach/cong_no/
// cong_no_cap_nhat_luc/ma_misa (cac cot Phase 4 rieng cua linh-kien-app, them sau khi tach he) va
// KHONG co phan_loai_dac_thu cua linh_kien - xem plan da duyet, khong gui thua cot DVBH khong hieu.
const KTV_SYNC_COLUMNS = "ma_ktv, ten_hien_thi, sdt, ghi_chu, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap";
const LINH_KIEN_SYNC_COLUMNS =
  "ma_linh_kien, ten_linh_kien, gia_ban, gia_tham_chieu, don_vi, ghi_chu, anh_demo, bat_tat, dac_thu, chi_sua_chua";

export interface PendingSyncCounts {
  ktv: number;
  linhKien: number;
}

async function getLastSyncedAt(db: D1Database, entity: "ktv" | "linh_kien"): Promise<string> {
  const row = await db.prepare("SELECT last_synced_at FROM dvbh_sync_state WHERE entity = ?").bind(entity).first<{ last_synced_at: string }>();
  return row?.last_synced_at ?? "1970-01-01 00:00:00";
}

export async function getPendingSyncCounts(db: D1Database): Promise<PendingSyncCounts> {
  const [ktvSince, linhKienSince] = await Promise.all([getLastSyncedAt(db, "ktv"), getLastSyncedAt(db, "linh_kien")]);
  const [ktvRow, linhKienRow] = await Promise.all([
    db.prepare("SELECT COUNT(*) as cnt FROM ktv_lien_he WHERE ngay_cap_nhat > ?").bind(ktvSince).first<{ cnt: number }>(),
    db.prepare("SELECT COUNT(*) as cnt FROM linh_kien WHERE ngay_cap_nhat > ?").bind(linhKienSince).first<{ cnt: number }>(),
  ]);
  return { ktv: ktvRow?.cnt ?? 0, linhKien: linhKienRow?.cnt ?? 0 };
}

export interface DvbhSyncLastRun {
  ktv: string | null;
  linhKien: string | null;
}

export async function getLastSyncTimes(db: D1Database): Promise<DvbhSyncLastRun> {
  const { results } = await db.prepare("SELECT entity, last_synced_at FROM dvbh_sync_state").all<{ entity: string; last_synced_at: string }>();
  const byEntity = new Map(results.map((r) => [r.entity, r.last_synced_at]));
  const epoch = "1970-01-01 00:00:00";
  const ktv = byEntity.get("ktv");
  const linhKien = byEntity.get("linh_kien");
  return { ktv: ktv && ktv !== epoch ? ktv : null, linhKien: linhKien && linhKien !== epoch ? linhKien : null };
}

async function postSyncBatch(env: Env, path: string, rows: Record<string, unknown>[]): Promise<void> {
  const url = `${env.CASE_LOOKUP_BASE_URL.replace(/\/$/, "")}${path}`;
  const res = await env.CASE_LOOKUP_SERVICE.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": env.DVBH_SYNC_API_KEY },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} tra loi ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function syncEntity(
  env: Env,
  db: D1Database,
  entity: "ktv" | "linh_kien",
  table: string,
  columns: string,
  syncPath: string,
): Promise<number> {
  const since = await getLastSyncedAt(db, entity);
  // Chot moc THOI GIAN BAT DAU truoc khi query - tranh bo sot 1 dong doi GIUA luc dang chay (neu
  // chot SAU khi query xong, 1 dong doi dung luc do se bi lan sau moi bat kip).
  const syncStartedAt = nowVN();

  const { results } = await db.prepare(`SELECT ${columns} FROM ${table} WHERE ngay_cap_nhat > ? ORDER BY ngay_cap_nhat`).bind(since).all<Record<string, unknown>>();
  if (results.length === 0) {
    // Van advance con tro (khong co gi doi tu lan truoc, tranh query lai WHERE ngay_cap_nhat > cu
    // moi lan chay du khong can thiet).
    await db.prepare("UPDATE dvbh_sync_state SET last_synced_at = ? WHERE entity = ?").bind(syncStartedAt, entity).run();
    return 0;
  }

  for (let i = 0; i < results.length; i += SYNC_BATCH_SIZE) {
    await postSyncBatch(env, syncPath, results.slice(i, i + SYNC_BATCH_SIZE));
  }

  await db.prepare("UPDATE dvbh_sync_state SET last_synced_at = ? WHERE entity = ?").bind(syncStartedAt, entity).run();
  return results.length;
}

export interface DvbhSyncResult {
  ktvSynced: number;
  linhKienSynced: number;
  errors: string[];
}

export async function runDvbhSync(env: Env, db: D1Database): Promise<DvbhSyncResult> {
  const errors: string[] = [];
  let ktvSynced = 0;
  let linhKienSynced = 0;

  try {
    ktvSynced = await syncEntity(env, db, "ktv", "ktv_lien_he", KTV_SYNC_COLUMNS, "/api/partner/sync/ktv");
  } catch (err) {
    errors.push(`KTV: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    linhKienSynced = await syncEntity(env, db, "linh_kien", "linh_kien", LINH_KIEN_SYNC_COLUMNS, "/api/partner/sync/linh-kien");
  } catch (err) {
    errors.push(`Linh kiện: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { ktvSynced, linhKienSynced, errors };
}
