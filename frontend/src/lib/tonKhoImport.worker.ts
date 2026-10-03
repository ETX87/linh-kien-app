// Web Worker doc file "Tổng hợp tồn kho" MISA (2026-10-03) - xem parseTonKhoImportFileNen() o tonKhoImport.ts.
import { parseTonKhoImportFile } from "./tonKhoImport";

self.onmessage = async (e: MessageEvent<File>) => {
  try {
    const ketQua = await parseTonKhoImportFile(e.data);
    self.postMessage({ ok: true, ketQua });
  } catch (err) {
    self.postMessage({ ok: false, loi: err instanceof Error ? err.message : String(err) });
  }
};
