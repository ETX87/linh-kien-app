import { parseTonKhoImportFile, type TonKhoParseResult } from "./tonKhoImport";
// Tach rieng file (khong de trong tonKhoImport.ts) vi worker import tonKhoImport.ts - tranh worker tu bundle chinh no.
// Doc file trong Web Worker (2026-10-03): XLSX.read file lon chay tren luong giao dien lam DONG BANG tab (khong bam duoc
// Huy, thanh tien do dung o "0/0"). Worker chay rieng; Huy = terminate. Qua `gioiHanMs` ma chua xong -> bao loi thay vi treo.
// Trinh duyet khong ho tro module worker -> doc tren luong chinh nhu cu.
export function parseTonKhoImportFileNen(file: File, opts: { signal?: AbortSignal; gioiHanMs?: number } = {}): Promise<TonKhoParseResult> {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./tonKhoImport.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return parseTonKhoImportFile(file);
  }
  return new Promise((resolve, reject) => {
    const xong = () => {
      clearTimeout(hen);
      opts.signal?.removeEventListener("abort", huy);
      worker.terminate();
    };
    const huy = () => { xong(); reject(new DOMException("Đã huỷ", "AbortError")); };
    const hen = setTimeout(() => {
      xong();
      reject(new Error("Đọc file quá lâu (> " + Math.round((opts.gioiHanMs ?? 180000) / 1000) + " giây) — file có thể quá lớn hoặc hỏng. Thử xuất lại báo cáo từ MISA (chỉ sheet dữ liệu)."));
    }, opts.gioiHanMs ?? 180000);
    opts.signal?.addEventListener("abort", huy);
    worker.onmessage = (e: MessageEvent<{ ok: true; ketQua: TonKhoParseResult } | { ok: false; loi: string }>) => {
      xong();
      if (e.data.ok) resolve(e.data.ketQua);
      else reject(new Error(e.data.loi));
    };
    worker.onerror = (e) => { xong(); reject(new Error("Lỗi đọc file: " + (e.message || "không rõ"))); };
    worker.postMessage(file);
  });
}
