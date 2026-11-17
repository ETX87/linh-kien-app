import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";
import { api } from "../api/client";
import { APP_VERSION } from "../version";

// Cache du lieu "tinh" tren may nguoi dung (2026-09-28, yeu cau "hạn chế việc phải load 1 dữ liệu cố định nhiều lần,
// tận dụng cache trên máy người dùng, chỉ khi trên hệ thống có thay đổi phiên bản thì mới load về").
//
// Co che:
//   - Server: moi domain md_* co 1 so phien ban (data_versions), tang TU DONG bang trigger o bang nguon (migration
//     0039) - GET /api/auth/data-versions tra ca bo (~5 dong).
//   - Cac query React Query dang ky o TINH_QUERY duoi day (theo queryKey[0], KHONG phai sua tung noi goi) duoc dat
//     staleTime = Infinity (khong tu tai lai khi doi man/mount lai) va luu vao IndexedDB kem "tag" = APP_VERSION +
//     phien ban cac domain luc BAT DAU tai. Mo app lan sau: nap thang tu IndexedDB, khong goi mang.
//   - Moi 5 phut (khi tab dang mo) + khi quay lai tab: hoi lai phien ban, CHI query co domain doi phien ban moi tai
//     lai. Deploy ban moi (APP_VERSION doi) -> bo het cache cu (tranh sai shape du lieu).
//   - Pham vi luu = email + vai tro "xem thu" (du lieu 1 so endpoint loc theo nguoi goi).
// Them 1 du lieu tinh moi: them queryKey[0] + domain vao TINH_QUERY; bang nguon moi thi them trigger md_* (migration).

export const TINH_QUERY: Record<string, string[]> = {
  "nguoi-directory": ["md_danh_ba"],
  "dat-mua-lk-nguoi-nhan-hang-kha-dung": ["md_danh_ba"],
  "settings-khu-vuc": ["md_danh_ba"],
  "dat-mua-lk-khu-vuc-cua-toi": ["md_danh_ba"],
  "dat-mua-lk-ly-do-cham": ["md_ly_do_cham"],
  "settings-ly-do-cham": ["md_ly_do_cham"],
  "settings-loai-chiet-khau": ["md_loai_chiet_khau"],
  // Combo LK (migration 0066) - kem ten/gia thanh phan nen theo ca md_linh_kien.
  "lk-combo": ["md_lk_combo", "md_linh_kien"],
  // Tu khoa phu + tu dong nghia cho bo tim LK tren may (migration 0067).
  "lk-tu-khoa": ["md_lk_tu_khoa"],
};

type PhienBan = Record<string, number>;

let phienBan: PhienBan | null = null;
let hoiLuc = 0;
let dangHoi: Promise<PhienBan | null> | null = null;

/** Phien ban hien tai cua cac domain md_* (gop cac lan goi dong thoi; dung lai ket qua < 30 giay tru khi epMoi). */
export function layPhienBan(epMoi = false): Promise<PhienBan | null> {
  if (!epMoi && phienBan && Date.now() - hoiLuc < 30_000) return Promise.resolve(phienBan);
  if (dangHoi) return dangHoi;
  dangHoi = api
    .get<{ versions: PhienBan }>("/auth/data-versions")
    .then((r) => {
      phienBan = r.versions;
      hoiLuc = Date.now();
      return phienBan;
    })
    .catch(() => phienBan)
    .finally(() => {
      dangHoi = null;
    });
  return dangHoi;
}

/** Tag phien ban cho 1 bo domain (null = chua biet phien ban server). */
export function tagCua(domains: string[], pb: PhienBan | null): string | null {
  if (!pb) return null;
  return `${APP_VERSION}|${domains.map((d) => `${d}:${pb[d] ?? 0}`).join(",")}`;
}

function domainsCua(key: QueryKey): string[] | null {
  return typeof key[0] === "string" ? TINH_QUERY[key[0]] ?? null : null;
}

// ---------- IndexedDB ----------
const DB_NAME = "linhkien-tinh-cache";
const STORE = "q";
interface MucLuu {
  scope: string;
  queryKey: QueryKey;
  tag: string | null;
  data: unknown;
  luc: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;
function moDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

async function docTheoScope(scope: string): Promise<MucLuu[]> {
  try {
    const db = await moDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve(((req.result ?? []) as MucLuu[]).filter((m) => m.scope === scope));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function ghi(key: string, muc: MucLuu): Promise<void> {
  try {
    const db = await moDb();
    db.transaction(STORE, "readwrite").objectStore(STORE).put(muc, key);
  } catch {
    // khong luu duoc thi lan sau coi nhu chua co cache
  }
}

// Tag cua du lieu DANG nam trong bo nho cho tung query (queryHash -> tag) - de biet query nao can tai lai khi doi phien ban.
const tagDuLieu = new Map<string, string | null>();
let khoiDongPromise: Promise<void> | null = null;
let lanKiemTraCuoi = 0;

/**
 * Goi 1 lan sau khi dang nhap, TRUOC khi render cac module: dat mac dinh cho query tinh, nap cache IndexedDB cua
 * dung pham vi vao QueryClient, lay phien ban server (song song). Toi da ~1,5 giay roi cho qua (mang cham van dung).
 */
export function khoiDongCacheTinh(qc: QueryClient, scope: string): Promise<void> {
  // Goi lai (StrictMode chay effect 2 lan) tra CUNG 1 promise - khong dang ky subscribe 2 lan.
  if (!khoiDongPromise) khoiDongPromise = khoiDong(qc, scope);
  return khoiDongPromise;
}

async function khoiDong(qc: QueryClient, scope: string): Promise<void> {
  for (const k of Object.keys(TINH_QUERY)) qc.setQueryDefaults([k], { staleTime: Infinity, gcTime: 24 * 60 * 60_000 });

  const tagLucTai = new WeakMap<Query, string | null>();
  qc.getQueryCache().subscribe((ev) => {
    if (ev.type !== "updated") return;
    const q = ev.query;
    const domains = domainsCua(q.queryKey);
    if (!domains) return;
    // Tag chot LUC BAT DAU tai: du lieu tai ve SAU khi phien ban doi van mang tag cu -> lan kiem tra sau tai lai (an toan).
    if (ev.action.type === "fetch") tagLucTai.set(q, tagCua(domains, phienBan));
    else if (ev.action.type === "success" && !ev.action.manual) {
      const tag = tagLucTai.has(q) ? tagLucTai.get(q)! : tagCua(domains, phienBan);
      tagDuLieu.set(q.queryHash, tag);
      void ghi(`${scope}::${q.queryHash}`, { scope, queryKey: q.queryKey, tag, data: ev.action.data, luc: Date.now() });
    }
  });

  const cho = new Promise<void>((r) => setTimeout(r, 1500));
  const napCache = docTheoScope(scope).then((ds) => {
    for (const m of ds) {
      if (!m.tag?.startsWith(`${APP_VERSION}|`) || !domainsCua(m.queryKey)) continue;
      if (qc.getQueryData(m.queryKey) !== undefined) continue;
      qc.setQueryData(m.queryKey, m.data, { updatedAt: m.luc });
      tagDuLieu.set(qc.getQueryCache().find({ queryKey: m.queryKey, exact: true })?.queryHash ?? "", m.tag);
    }
  });
  await Promise.race([Promise.all([napCache, layPhienBan(true)]), cho]);
  void kiemTraPhienBan(qc, true, true);
}

/** Hoi phien ban server; query tinh nao co du lieu mang tag khac phien ban moi -> tai lai (chi query do). */
export async function kiemTraPhienBan(qc: QueryClient, boQuaGioiHan = false, dungLaiPhienBan = false): Promise<void> {
  if (!boQuaGioiHan && Date.now() - lanKiemTraCuoi < 60_000) return;
  lanKiemTraCuoi = Date.now();
  // Luc khoi dong vua hoi xong -> dung lai (khong goi mang lan 2).
  const pb = await layPhienBan(!dungLaiPhienBan);
  if (!pb) return;
  for (const q of qc.getQueryCache().getAll()) {
    const domains = domainsCua(q.queryKey);
    if (!domains || q.state.data === undefined || q.state.fetchStatus === "fetching") continue;
    if (tagDuLieu.get(q.queryHash) !== tagCua(domains, pb)) void qc.invalidateQueries({ queryKey: q.queryKey, exact: true });
  }
  window.dispatchEvent(new CustomEvent("tinh-phien-ban", { detail: pb }));
}

/** Kiem tra dinh ky 5 phut (khi tab dang hien) + khi quay lai tab. Tra ve ham huy. */
export function theoDoiPhienBan(qc: QueryClient): () => void {
  const chay = () => {
    if (document.visibilityState === "visible") void kiemTraPhienBan(qc);
  };
  const id = window.setInterval(chay, 5 * 60_000);
  window.addEventListener("focus", chay);
  document.addEventListener("visibilitychange", chay);
  return () => {
    window.clearInterval(id);
    window.removeEventListener("focus", chay);
    document.removeEventListener("visibilitychange", chay);
  };
}
