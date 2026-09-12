// IndexedDB cache cho danh sach linh kien - chi dong bo incremental (rows co ngay_cap_nhat
// moi hon timestamp cache) de giam D1 rows_read. Tuong tu closedDataCache.ts nhung don gian
// hon (khong can manifest hash, chi can 1 timestamp duy nhat).

import type { LinhKienRow } from "../types";

const DB_NAME = "dvbh_lk_cache";
const DB_VERSION = 1;
const STORE_NAME = "linh_kien";

interface CacheEntry {
  ma_linh_kien: string; // PK
  ten_linh_kien: string;
  gia_ban: number | null;
  don_vi: string | null;
  ghi_chu: string | null;
  anh_demo: string | null;
  bat_tat: number;
  chi_sua_chua: number;
  // BUG THAT (phat hien 2026-08-25, khi kiem thu tinh nang "note linh kien đặc thù" trong
  // LinhKienPicker.tsx): "dac_thu" da co san tren API/DB tu truoc nhung CHUA TUNG duoc whitelist o
  // day - moi lan qua cache nay (LUON DUNG boi TaoDonTab/DonCuaToiTab qua useLkAndLdeCache) deu bi
  // XOA MAT truong nay, khien moi tinh nang dua tren "options[i].dac_thu" o cac man tao/sua don deu
  // luon nhan gia tri undefined du DB that su co dac_thu=1.
  dac_thu: number;
  // "phan_loai_dac_thu" (them 2026-08-25) - xem giai thich o types.ts LinhKienRow.
  phan_loai_dac_thu: string | null;
  // "gia_tri_cong_no" (them 2026-09-04) - CUNG loai bug voi "dac_thu" o comment tren: whitelist nay
  // phai duoc cap nhat MOI LAN them cot moi vao LinhKienRow can dung o cac man dua vao cache nay
  // (TaoDonTab/DonCuaToiTab qua useLkAndLdeCache) - de sot se khien truong bi am tham mat khi doc lai
  // tu IndexedDB, du API/DB co du lieu dung.
  gia_tri_cong_no: number | null;
  // "cam_ban" (them 2026-09-12, tich hop gia88) - BAT BUOC whitelist, dung loc khoi picker tao don o
  // helpers.ts useLkAndLdeCache (cung loai bug voi dac_thu/gia_tri_cong_no o tren).
  cam_ban: number;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string | null; // ISO timestamp
}

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "ma_linh_kien" });
      }
    };
  });
}

// Doc tat ca LK tu cache (dung cho initial render truoc khi fetch incremental).
export async function getAllFromCache(): Promise<CacheEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

// Lay timestamp moi nhat trong cache (de gui len server qua ?since=).
export async function getLastCacheTimestamp(): Promise<string | null> {
  const rows = await getAllFromCache();
  if (rows.length === 0) return null;
  const timestamps = rows.map((r) => r.ngay_cap_nhat).filter((t): t is string => !!t);
  if (timestamps.length === 0) return null;
  return timestamps.sort().reverse()[0]; // ISO string sort lexicographically
}

// Merge incremental updates vao cache (upsert by ma_linh_kien).
export async function mergeLinhKienToCache(rows: LinhKienRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const row of rows) {
      store.put({
        ma_linh_kien: row.ma_linh_kien,
        ten_linh_kien: row.ten_linh_kien,
        gia_ban: row.gia_ban,
        don_vi: row.don_vi,
        ghi_chu: row.ghi_chu,
        anh_demo: row.anh_demo,
        bat_tat: row.bat_tat,
        chi_sua_chua: row.chi_sua_chua,
        dac_thu: row.dac_thu,
        phan_loai_dac_thu: row.phan_loai_dac_thu,
        gia_tri_cong_no: row.gia_tri_cong_no,
        cam_ban: row.cam_ban,
        nguoi_cap_nhat: row.nguoi_cap_nhat,
        ngay_cap_nhat: row.ngay_cap_nhat,
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Xoa toan bo cache (dung khi Admin yeu cau "Tai lai toan bo" hoac co loi).
export async function clearLinhKienCache(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// "Schema version" cua cache (them 2026-09-04, phat hien khi kiem thu canh bao cong no song: "gia_
// tri_cong_no" du da whitelist dung nhung TRINH DUYET DA CO CACHE TU TRUOC (ghi truoc luc them cot
// nay vao whitelist) se KHONG BAO GIO tu sua - dong bo incremental theo "since" chi lay dong co
// ngay_cap_nhat MOI HON, nen 1 dong linh kien lau khong ai sua van giu nguyen ban cache thieu cot MAI
// MAI). Moi lan them cot moi vao CacheEntry can BUMP so nay 1 lan - buoc TOAN BO trinh duyet dang co
// cache cu tu dong xoa sach + fetch lai FULL (khong "since") DUY NHAT 1 LAN, tu heal moi truong hop
// thieu cot tu truoc do (ke ca bug "dac_thu" cu hon, khong chi gia_tri_cong_no). Dung localStorage
// (khong phai IndexedDB) vi can doc duoc TRUOC khi mo DB.
// BUMP len 3 (2026-09-12): them "cam_ban" vao whitelist (tich hop gia88) - cung ly do bump 1->2 o
// tren, bat buoc de trinh duyet dang co cache cu tu heal, khong thi picker tao don se KHONG BAO GIO
// loc duoc "cam_ban" cho cac ma lau khong ai sua (field luon undefined trong cache cu).
const SCHEMA_VERSION = 3;
const SCHEMA_VERSION_KEY = "dvbh_lk_cache_schema_version";

export async function ensureCacheSchemaVersion(): Promise<void> {
  if (localStorage.getItem(SCHEMA_VERSION_KEY) === String(SCHEMA_VERSION)) return;
  await clearLinhKienCache();
  localStorage.setItem(SCHEMA_VERSION_KEY, String(SCHEMA_VERSION));
}
