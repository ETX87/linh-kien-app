import { useCallback, useEffect, useState } from "react";

// Tra cuu du lieu tu Google Sheet cong khai (Publish to web -> TSV) - dung cho tinh nang "Tra cuu ma
// hang hoa" (BOM) / "Linh kien thay the cho nhau" (yeu cau nguoi dung 2026-08-27). Co che nay HOAN
// TOAN DOC LAP voi backend Cloudflare Worker cua he thong: fetch() thang tu trinh duyet nguoi dung
// sang Google, KHONG di qua /api/* nao, KHONG dung api/client.ts. Cache TREN MAY NGUOI DUNG (khong
// dong bo len server), tu dong dong bo lai neu lan gan nhat cach qua 1 ngay, va LUON nuot loi (mang
// cham/rot mang/sheet doi cau truc...) - dong bo that bai thi giu nguyen ban cache cu, KHONG BAO GIO
// nem loi lam anh huong phan con lai cua trang (dung y "loi/cham khong duoc phep anh huong he thong
// chung" tu yeu cau nguoi dung).
//
// Dung IndexedDB (khong phai localStorage) - sheet BOM thuc te ~39.000 dong/~3.7MB tho, luu dang JSON
// object[] (lap lai ten cot moi dong) de vuot qua han muc localStorage pho bien (~5MB/origin) neu tinh
// ca sheet thay the. Nen gzip truoc khi luu (CompressionStream, co san tren trinh duyet, giong pattern
// staticListCache.ts) - dung DB/store RIENG (khong chung voi staticListCache.ts) de giu dung y "doc
// lap hoan toan", khong lien can gi toi co che cache theo hash-server cua module khac.

const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DB_NAME = "linh-kien-app-public-sheet-cache";
const STORE_NAME = "cache";
const DB_VERSION = 1;

export interface SheetRow {
  [column: string]: string;
}

interface CachedSheet {
  syncedAt: number;
  compressed: boolean;
  payload: ArrayBuffer | string;
}

function parseTsv(text: string): SheetRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row: SheetRow = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    return row;
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadCache(storageKey: string): Promise<{ syncedAt: number; rows: SheetRow[] } | null> {
  try {
    const db = await openDb();
    const entry = await new Promise<CachedSheet | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(storageKey);
      req.onsuccess = () => resolve((req.result as CachedSheet) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (!entry) return null;
    const json = entry.compressed
      ? await new Response(new Blob([entry.payload as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
      : (entry.payload as string);
    const rows = JSON.parse(json) as SheetRow[];
    if (!Array.isArray(rows)) return null;
    return { syncedAt: entry.syncedAt, rows };
  } catch {
    return null;
  }
}

async function saveCache(storageKey: string, syncedAt: number, rows: SheetRow[]): Promise<void> {
  try {
    const json = JSON.stringify(rows);
    let compressed = false;
    let payload: ArrayBuffer | string = json;
    try {
      payload = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
      compressed = true;
    } catch {
      // trinh duyet khong ho tro CompressionStream - luu tho, van dung duoc (chi ton nhieu dung luong hon)
    }
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ syncedAt, compressed, payload } satisfies CachedSheet, storageKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* IndexedDB khong kha dung (private mode/day dung luong...) - chi mat cache, khong anh huong chuc nang tra cuu */
  }
}

export interface PublicSheetState {
  rows: SheetRow[];
  syncedAt: number | null;
  syncing: boolean;
  error: string | null;
  sync: () => void;
}

export function usePublicSheetCache(storageKey: string, url: string): PublicSheetState {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(() => {
    setSyncing(true);
    setError(null);
    fetch(url, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(async (text) => {
        const newRows = parseTsv(text);
        const now = Date.now();
        setRows(newRows);
        setSyncedAt(now);
        await saveCache(storageKey, now, newRows);
      })
      .catch((err) => {
        // Neu that bai (mang/CORS/sheet doi cau truc) thi CHI bao loi nhe, KHONG doi rows hien co -
        // trang van dung ban cache cu tren may, dung y "loi khong duoc phep anh huong he thong chung".
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setSyncing(false));
  }, [storageKey, url]);

  useEffect(() => {
    let cancelled = false;
    loadCache(storageKey).then((cached) => {
      if (cancelled) return;
      if (cached) {
        setRows(cached.rows);
        setSyncedAt(cached.syncedAt);
      }
      if (!cached || Date.now() - cached.syncedAt > AUTO_SYNC_INTERVAL_MS) sync();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, url]);

  return { rows, syncedAt, syncing, error, sync };
}

export function fmtSyncedAt(ms: number | null): string {
  if (!ms) return "chưa đồng bộ lần nào";
  return new Date(ms).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}
