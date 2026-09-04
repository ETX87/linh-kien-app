import type { Env } from "../types";
import { nowVN } from "./vnTime";

// Day danh ba KTV/danh muc linh kien/danh muc Khu vuc sang cac he ngoai dinh ky (phan hoi
// 2026-08-28: "khi cập nhật danh sách ktv hoặc cập nhật danh sách linh kiện, sẽ bắn API về web dvbh
// để cập nhật bổ sung dữ liệu mới nhất" + phan hoi 04/09/2026: "Bên linh-kien-app sẽ bắn api khi danh
// sách ktv có thay đổi. bên app sua chua sẽ nhận api vào cập nhật danh sách" / "Khu vực sẽ học
// linh-kien-app. lấy thông tin đồng bộ tự động từ linh-kien-app khi bên linh kien app có thay đổi" -
// xem CLAUDE.md repo "gui-bao-hanh-linh-kien" muc "Chot 5 cau hoi mo..."). linh-kien-app la nguon su
// that cho 3 bang nay tu sau khi tach he (xem CLAUDE.md muc "Nguon goc tach he thong"), sync GHI DE
// thang cac cot chung ben nhan, KHONG dong bo xoa (upsert-only - xem POST /sync/ktv, /sync/linh-kien,
// /sync/khu-vuc cua tung he nhan).
//
// MOI 04/09/2026 - da tach thanh 2 DICH doc lap (truoc do CHI co "dvbh"):
//   - "dvbh"    : ktv + linh_kien (nhu cu, khong doi).
//   - "suachua" : ktv + linh_kien + khu_vuc (Worker moi, module Sua chua bao hanh - "dvbh" khong co
//                 khai niem Khu vuc trong schema cua no nen entity nay CHI gui toi "suachua").
// Moi cap (entity, target) co CON TRO RIENG (dvbh_sync_state, xem migration 0016) - 1 dich loi tam
// thoi (Worker kia down, sai key...) khong lam cham/an mat tien do cua dich con lai.
//
// Dung Service Binding (KHONG fetch() thang URL that) - cac Worker cung 1 tai khoan Cloudflare,
// fetch() thang bi chan loi 1042 (chong SSRF) - xem giai thich day du trong lib/caseLookupClient.ts.
//
// Con tro dong bo chi advance khi TOAN BO lo cua 1 cap (entity, target) gui thanh cong - loi giua
// chung (he nhan tam down, key sai...) thi lan sau tu gui lai nguyen ven, an toan nho endpoint nhan
// la upsert (chay lai nhieu lan khong sao).
const SYNC_BATCH_SIZE = 200;

type EntityKey = "ktv" | "linh_kien" | "khu_vuc";
type TargetKey = "dvbh" | "suachua";

interface TargetConfig {
  label: string;
  baseUrl: (env: Env) => string;
  service: (env: Env) => Fetcher;
  apiKey: (env: Env) => string;
  authHeader: string;
}

const TARGETS: Record<TargetKey, TargetConfig> = {
  dvbh: { label: "DVBH", baseUrl: (env) => env.CASE_LOOKUP_BASE_URL, service: (env) => env.CASE_LOOKUP_SERVICE, apiKey: (env) => env.DVBH_SYNC_API_KEY, authHeader: "X-API-Key" },
  // "suachua" dung khuon xac thuc rieng cua no (X-Sync-Key, xem routes/sync.ts ben do) - khac
  // "X-API-Key" cua dvbh vi 2 he goc khac nhau, khong dung chung 1 quy uoc partnerApi.ts.
  suachua: { label: "Sửa chữa bảo hành", baseUrl: (env) => env.SUACHUA_SYNC_BASE_URL, service: (env) => env.SUACHUA_SYNC_SERVICE, apiKey: (env) => env.SUACHUA_SYNC_API_KEY, authHeader: "X-Sync-Key" },
};

interface EntityConfig {
  table: string;
  // Chi gui cac truong ben nhan THAT SU DUNG - vd DVBH KHONG co khu_vuc_ma/ktv_cap1_phu_trach/
  // cong_no/cong_no_cap_nhat_luc (cac cot Phase 4 rieng cua linh-kien-app, them sau khi tach he) va
  // KHONG co phan_loai_dac_thu cua linh_kien; ca "dvbh" lan "suachua" deu bo qua duoc cot du thua o
  // day (route nhan chi doc field no can), nen dung CHUNG 1 danh sach cot rong cho ca 2 dich cho don
  // gian - khong can tach rieng theo target.
  columns: string;
  syncPath: string;
  targets: TargetKey[];
}

const ENTITIES: Record<EntityKey, EntityConfig> = {
  ktv: {
    table: "ktv_lien_he",
    columns: "ma_ktv, ten_hien_thi, sdt, ghi_chu, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap, khu_vuc_ma, ktv_cap1_phu_trach",
    syncPath: "/api/partner/sync/ktv",
    targets: ["dvbh", "suachua"],
  },
  linh_kien: {
    table: "linh_kien",
    columns: "ma_linh_kien, ten_linh_kien, gia_ban, gia_tham_chieu, don_vi, ghi_chu, anh_demo, bat_tat, dac_thu, chi_sua_chua",
    syncPath: "/api/partner/sync/linh-kien",
    targets: ["dvbh", "suachua"],
  },
  // MOI 04/09/2026 - CHI "suachua" dung (xem giai thich o dau file). "dvbh" khong nam trong
  // ENTITIES[...].targets nen se khong bao gio duoc seed/dong bo toi day.
  khu_vuc: {
    table: "khu_vuc",
    columns: "ma, ten, gs_email",
    syncPath: "/api/partner/sync/khu-vuc",
    targets: ["suachua"],
  },
};

export interface PendingSyncCounts {
  ktv: number;
  linhKien: number;
  khuVuc: number;
}

// "Con tro hieu qua" cho 1 entity = CU NHAT (MIN) trong so cac dich cua no - 1 dong moi hon lan dong
// bo GAN NHAT cua dich cham nhat van tinh la "dang cho" (vi it nhat 1 dich con thieu no), dung de tinh
// so "dang cho" theo huong bi quan nhat (khop dung tinh than UI hien tai: 0 = da xong het, > 0 la con
// viec o DAU DO).
async function getEffectiveSinceForPending(db: D1Database, entity: EntityKey): Promise<string> {
  const targets = ENTITIES[entity].targets;
  const placeholders = targets.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT last_synced_at FROM dvbh_sync_state WHERE entity = ? AND target IN (${placeholders})`)
    .bind(entity, ...targets)
    .all<{ last_synced_at: string }>();
  if (results.length === 0) return "1970-01-01 00:00:00";
  return results.reduce((min, r) => (r.last_synced_at < min ? r.last_synced_at : min), results[0].last_synced_at);
}

export async function getPendingSyncCounts(db: D1Database): Promise<PendingSyncCounts> {
  const [ktvSince, linhKienSince, khuVucSince] = await Promise.all([
    getEffectiveSinceForPending(db, "ktv"),
    getEffectiveSinceForPending(db, "linh_kien"),
    getEffectiveSinceForPending(db, "khu_vuc"),
  ]);
  const [ktvRow, linhKienRow, khuVucRow] = await Promise.all([
    db.prepare("SELECT COUNT(*) as cnt FROM ktv_lien_he WHERE ngay_cap_nhat > ?").bind(ktvSince).first<{ cnt: number }>(),
    db.prepare("SELECT COUNT(*) as cnt FROM linh_kien WHERE ngay_cap_nhat > ?").bind(linhKienSince).first<{ cnt: number }>(),
    db.prepare("SELECT COUNT(*) as cnt FROM khu_vuc WHERE ngay_cap_nhat > ?").bind(khuVucSince).first<{ cnt: number }>(),
  ]);
  return { ktv: ktvRow?.cnt ?? 0, linhKien: linhKienRow?.cnt ?? 0, khuVuc: khuVucRow?.cnt ?? 0 };
}

export interface DvbhSyncLastRun {
  ktv: string | null;
  linhKien: string | null;
  khuVuc: string | null;
}

// "Lan dong bo gan nhat" hien thi cho nguoi dung = CU NHAT (MIN) trong so cac dich cua entity do -
// phan anh dung "toan bo da dong bo xong toi moc thoi gian nay", tranh lac quan qua muc chi vi 1 dich
// da xong con dich kia thi chua (tra null neu it nhat 1 dich CHUA TUNG dong bo lan nao).
async function getOldestSyncedAt(db: D1Database, entity: EntityKey): Promise<string | null> {
  const targets = ENTITIES[entity].targets;
  const placeholders = targets.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT last_synced_at FROM dvbh_sync_state WHERE entity = ? AND target IN (${placeholders})`)
    .bind(entity, ...targets)
    .all<{ last_synced_at: string }>();
  const epoch = "1970-01-01 00:00:00";
  const vals = results.map((r) => r.last_synced_at).filter((v) => v !== epoch);
  if (vals.length < targets.length) return null;
  return vals.reduce((min, v) => (v < min ? v : min), vals[0]);
}

export async function getLastSyncTimes(db: D1Database): Promise<DvbhSyncLastRun> {
  const [ktv, linhKien, khuVuc] = await Promise.all([getOldestSyncedAt(db, "ktv"), getOldestSyncedAt(db, "linh_kien"), getOldestSyncedAt(db, "khu_vuc")]);
  return { ktv, linhKien, khuVuc };
}

async function postSyncBatch(env: Env, target: TargetKey, path: string, rows: Record<string, unknown>[]): Promise<void> {
  const cfg = TARGETS[target];
  const url = `${cfg.baseUrl(env).replace(/\/$/, "")}${path}`;
  const res = await cfg.service(env).fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", [cfg.authHeader]: cfg.apiKey(env) },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[${cfg.label}] ${path} tra loi ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function getCursor(db: D1Database, entity: EntityKey, target: TargetKey): Promise<string> {
  const row = await db.prepare("SELECT last_synced_at FROM dvbh_sync_state WHERE entity = ? AND target = ?").bind(entity, target).first<{ last_synced_at: string }>();
  return row?.last_synced_at ?? "1970-01-01 00:00:00";
}

async function syncEntityToTarget(env: Env, db: D1Database, entity: EntityKey, target: TargetKey): Promise<number> {
  const cfg = ENTITIES[entity];
  const since = await getCursor(db, entity, target);
  // Chot moc THOI GIAN BAT DAU truoc khi query - tranh bo sot 1 dong doi GIUA luc dang chay (neu chot
  // SAU khi query xong, 1 dong doi dung luc do se bi lan sau moi bat kip).
  const syncStartedAt = nowVN();

  const { results } = await db.prepare(`SELECT ${cfg.columns} FROM ${cfg.table} WHERE ngay_cap_nhat > ? ORDER BY ngay_cap_nhat`).bind(since).all<Record<string, unknown>>();
  if (results.length === 0) {
    // Van advance con tro (khong co gi doi tu lan truoc, tranh query lai WHERE ngay_cap_nhat > cu
    // moi lan chay du khong can thiet).
    await db.prepare("UPDATE dvbh_sync_state SET last_synced_at = ? WHERE entity = ? AND target = ?").bind(syncStartedAt, entity, target).run();
    return 0;
  }

  for (let i = 0; i < results.length; i += SYNC_BATCH_SIZE) {
    await postSyncBatch(env, target, cfg.syncPath, results.slice(i, i + SYNC_BATCH_SIZE));
  }

  await db.prepare("UPDATE dvbh_sync_state SET last_synced_at = ? WHERE entity = ? AND target = ?").bind(syncStartedAt, entity, target).run();
  return results.length;
}

export interface DvbhSyncResult {
  ktvSynced: number;
  linhKienSynced: number;
  khuVucSynced: number;
  errors: string[];
}

// Chay dong bo TOAN BO cap (entity, target) da khai bao o ENTITIES - moi cap chay doc lap, 1 cap loi
// KHONG chan cac cap con lai (gom loi vao "errors", van tra ve so dong da dong bo thanh cong o cac
// cap khac). ktvSynced/linhKienSynced/khuVucSynced la TONG so dong da gui THANH CONG cong don qua moi
// dich cua entity do.
export async function runDvbhSync(env: Env, db: D1Database): Promise<DvbhSyncResult> {
  const errors: string[] = [];
  const totals: Record<EntityKey, number> = { ktv: 0, linh_kien: 0, khu_vuc: 0 };

  for (const entity of Object.keys(ENTITIES) as EntityKey[]) {
    for (const target of ENTITIES[entity].targets) {
      try {
        totals[entity] += await syncEntityToTarget(env, db, entity, target);
      } catch (err) {
        errors.push(`${entity}->${target}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { ktvSynced: totals.ktv, linhKienSynced: totals.linh_kien, khuVucSynced: totals.khu_vuc, errors };
}
