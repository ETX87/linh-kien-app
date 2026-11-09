import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Card } from "./ui/Card";
import { Btn } from "./ui/Btn";
import { api, ApiError } from "../api/client";
import { useToast } from "./ui/Toast";

/** Rut ra thong diep loi cu the tu ApiError (ma loi backend tra ve, hoac HTTP status neu backend
 * khong tra ma) thay vi luon hien 1 cau chung chung - truoc day moi loi (400/500/mat mang...) deu
 * hien y het nhau nen nguoi dung khong biet dang loi gi that su. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.detail ?? (err.code ? err.code : `Loi may chu (HTTP ${err.status})`);
  return "Mat ket noi hoac may chu khong phan hoi";
}

// CHOT 2026-08-03: phat hien "cot Excel khong khop tieu de" - truoc day neu 1 header trong columnMap
// khong ton tai trong file (sai chinh ta, thieu dau, khac tieu de mau...), raw[excelCol] luon
// undefined -> ?? null -> TOAN BO dong ghi gia tri null cho cot do, ma khong co canh bao gi (preview/
// commit van bao "thanh cong"). Xay ra that: import "Link hinh anh" qua /update-column ghi de NULL
// len 10185 ca vi file nguoi dung dung tieu de khac file mau, khong 1 dong loi nao duoc bao. Chi bat
// buoc kiem tra khi requireAllColumns=true (dung cho /update-column, noi CHI co 2 cot nen KHONG co ly
// do hop le nao de 1 cot bi thieu) - KHONG bat cho CRM import thuong (columnMap ~40 cot, file that co
// the hop le thieu vai cot khong bat buoc).
async function parseSpreadsheet(file: File, columnMap?: Record<string, string>, requireAllColumns?: boolean): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary", cellDates: true });
        const sheet = workbook.Sheets["DATA"] ?? workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
        if (!columnMap) {
          resolve(rawRows);
          return;
        }
        if (requireAllColumns) {
          const headerRow = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })[0] ?? [];
          const headerSet = new Set(headerRow.map((h) => String(h ?? "").trim()));
          const missing = Object.keys(columnMap).filter((h) => !headerSet.has(h));
          if (missing.length > 0) {
            reject(new Error(`Không tìm thấy cột "${missing.join('", "')}" trong file — kiểm tra lại tên cột (phải khớp chính xác với file mẫu, kể cả dấu).`));
            return;
          }
        }
        const mapped = rawRows.map((raw) => {
          const row: Record<string, unknown> = {};
          for (const [excelCol, dbCol] of Object.entries(columnMap)) {
            row[dbCol] = raw[excelCol] ?? null;
          }
          return row;
        });
        resolve(mapped);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

export interface ImportUploaderProps<TSummary> {
  description: ReactNode;
  templateUrl: string;
  previewUrl: string;
  commitUrl: string;
  columnMapUrl?: string;
  // Anh xa Excel->DB truyen thang tu component cha, dung khi map thay doi dong theo lua chon cua
  // nguoi dung (vd chon cot can cap nhat) - khong the fetch tinh 1 lan qua columnMapUrl duoc. Neu
  // ca 2 cung truyen, columnMap (truc tiep) duoc uu tien.
  columnMap?: Record<string, string>;
  // Bat buoc TAT CA header trong columnMap phai co that trong file (xem giai thich o parseSpreadsheet)
  // - dung cho cac luong "vai cot co dinh, bat buoc" nhu /update-column, KHONG bat cho CRM import
  // thuong (nhieu cot, co the hop le thieu vai cot khong bat buoc).
  requireAllColumns?: boolean;
  buildBody: (rows: Record<string, unknown>[], filename: string) => unknown;
  renderSummary: (summary: TSummary) => ReactNode;
  getErrors: (summary: TSummary) => string[];
  // Canh bao KHONG chan (vd dat trung ma LK + Ma YCSC / ID Lada, v1.457): hien o buoc xem truoc, nguoi dung phai tick "da kiem tra"
  // moi bam duoc "Xác nhận import" - tranh import lai cung 1 file nhieu lan ma khong biet.
  getWarnings?: (summary: TSummary) => string[];
  successMessage: (summary: TSummary) => string;
  invalidateKeys: QueryKey[];
  // Ghi theo LO (v1.457, import don hang): file lon gui 1 request vuot gioi han truy van / CPU cua Worker -> loi giua chung, don tao 1 nua.
  // Co prop nay -> chia file thanh cac lo `size` dong LIEN TIEP, gui lan luot (buildBody nhan offset = so dong cua cac lo truoc de backend
  // bao "Dòng N" dung so dong trong file), gop ket qua bang `merge`. Lo nao loi -> dung, bao ro lo da xong / lo loi / dong chua import.
  commitChunk?: {
    size: number;
    buildBody: (rows: Record<string, unknown>[], offset: number, filename: string) => unknown;
    merge: (a: TSummary, b: TSummary) => TSummary;
  };
}

// Ket qua lan import vua chay - hien CO DINH trong khung (truoc chi co toast tu tat -> nguoi dung khong thay loi).
interface KetQuaImport<TSummary> {
  summary: TSummary | null;
  loiHeThong: string | null;
}

export function ImportUploader<TSummary>({
  description,
  templateUrl,
  previewUrl,
  commitUrl,
  columnMapUrl,
  columnMap,
  requireAllColumns,
  buildBody,
  renderSummary,
  getErrors,
  getWarnings,
  successMessage,
  invalidateKeys,
  commitChunk,
}: ImportUploaderProps<TSummary>) {
  const [daXemCanhBao, setDaXemCanhBao] = useState(false);
  const [step, setStep] = useState<"idle" | "preview" | "done">("idle");
  const [ketQua, setKetQua] = useState<KetQuaImport<TSummary> | null>(null);
  const [tienDo, setTienDo] = useState<string | null>(null);
  const [preview, setPreview] = useState<TSummary | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [filename, setFilename] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToast();
  const qc = useQueryClient();

  const { data: columnMapData } = useQuery({
    queryKey: ["import-column-map", columnMapUrl],
    queryFn: () => api.get<{ columnMap: Record<string, string> }>(columnMapUrl!),
    enabled: !!columnMapUrl,
  });

  const previewMutation = useMutation({
    mutationFn: (rows: Record<string, unknown>[]) => api.post<TSummary>(previewUrl, buildBody(rows, filename)),
    onSuccess: (summary) => {
      setPreview(summary);
      setDaXemCanhBao(false);
      setStep("preview");
    },
    onError: (err) => {
      const msg = `Không phân tích được file: ${describeError(err)}`;
      addToast(msg);
      setKetQua({ summary: null, loiHeThong: msg });
      setStep("done");
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (): Promise<KetQuaImport<TSummary>> => {
      if (!commitChunk || parsedRows.length <= commitChunk.size) {
        try {
          const summary = await api.post<TSummary>(commitUrl, commitChunk ? commitChunk.buildBody(parsedRows, 0, filename) : buildBody(parsedRows, filename));
          return { summary, loiHeThong: null };
        } catch (err) {
          return { summary: null, loiHeThong: `Import thất bại: ${describeError(err)}. Một phần đơn có thể đã được tạo — kiểm tra danh sách trước khi import lại.` };
        }
      }
      const size = commitChunk.size;
      const soLo = Math.ceil(parsedRows.length / size);
      let gop: TSummary | null = null;
      for (let i = 0; i < soLo; i++) {
        const tu = i * size;
        const den = Math.min(parsedRows.length, tu + size);
        setTienDo(`Đang import lô ${i + 1}/${soLo} (dòng ${tu + 1}–${den})…`);
        try {
          const s = await api.post<TSummary>(commitUrl, commitChunk.buildBody(parsedRows.slice(tu, den), tu, filename));
          gop = gop ? commitChunk.merge(gop, s) : s;
        } catch (err) {
          return {
            summary: gop,
            loiHeThong:
              `Lô dòng ${tu + 1}–${den} bị lỗi: ${describeError(err)}. ` +
              (tu > 0 ? `Các dòng 1–${tu} đã import xong (xem kết quả bên dưới). ` : "") +
              `Dòng ${tu + 1}–${den} có thể đã tạo một phần — kiểm tra danh sách đơn trước khi import lại; dòng ${den + 1}–${parsedRows.length} CHƯA import.`,
          };
        }
      }
      return { summary: gop, loiHeThong: null };
    },
    onSuccess: (kq) => {
      setTienDo(null);
      setKetQua(kq);
      setStep("done");
      setPreview(null);
      if (kq.summary) addToast(successMessage(kq.summary));
      if (kq.loiHeThong) addToast(kq.loiHeThong);
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => {
      setTienDo(null);
      setKetQua({ summary: null, loiHeThong: `Import thất bại: ${describeError(err)}` });
      setStep("done");
    },
  });

  async function handleFileChosen(file: File) {
    if (columnMapUrl && !columnMap && !columnMapData) return;
    setFilename(file.name);
    try {
      const rows = await parseSpreadsheet(file, columnMap ?? columnMapData?.columnMap, requireAllColumns);
      setParsedRows(rows);
      previewMutation.mutate(rows);
    } catch (err) {
      addToast(`Không đọc được file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const errors = preview ? getErrors(preview) : [];
  const warnings = preview && getWarnings ? getWarnings(preview) : [];

  return (
    <Card className="p-6 mb-5">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-sm text-[var(--ink-600)] flex-1 min-w-[240px]">{description}</div>
        <a href={templateUrl} className="text-xs font-semibold text-[var(--ocean-600)] hover:underline whitespace-nowrap">
          ⬇ Tải file mẫu
        </a>
      </div>
      {step === "idle" && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="mt-4 cursor-pointer border-2 border-dashed border-[var(--ocean-100)] rounded-2xl p-10 text-center hover:border-[var(--ocean-400)] hover:bg-[var(--ocean-100)]/20 transition-colors"
        >
          <div className="text-3xl mb-2">⇩</div>
          <div className="font-semibold text-[var(--ink-900)]">{previewMutation.isPending ? "Đang phân tích file…" : "Kéo thả hoặc bấm để chọn file Excel/CSV"}</div>
          <div className="text-xs text-[var(--ink-400)] mt-1">Định dạng .xlsx/.xls/.csv</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileChosen(file);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {step === "done" && ketQua && (
        <div className="anim-in mt-4">
          <div className="flex items-center gap-2 mb-3 bg-slate-50 rounded-xl p-3">
            <span className="text-xl">{ketQua.loiHeThong || (ketQua.summary && getErrors(ketQua.summary).length > 0) ? "⚠" : "✓"}</span>
            <div className="flex-1">
              <div className="font-semibold text-sm">{filename}</div>
              <div className="text-xs text-[var(--ink-400)]">Kết quả import</div>
            </div>
          </div>
          {ketQua.loiHeThong && (
            <div className="text-sm text-[var(--color-danger-strong)] bg-[var(--color-danger-soft)] border border-[var(--color-danger-soft)] rounded-xl p-3 mb-3">{ketQua.loiHeThong}</div>
          )}
          {ketQua.summary && (
            <>
              <div className="text-sm font-semibold text-[var(--ink-900)] mb-2">{successMessage(ketQua.summary)}</div>
              {renderSummary(ketQua.summary)}
              {getErrors(ketQua.summary).length > 0 && (
                <div className="text-xs text-[var(--coral-500)] mb-3 mt-3 max-h-48 overflow-y-auto border border-[var(--color-danger-soft)] rounded-lg p-2">
                  <div className="font-semibold mb-1">Các dòng không được tạo / cần kiểm tra ({getErrors(ketQua.summary).length}):</div>
                  {getErrors(ketQua.summary).map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
            </>
          )}
          <Btn
            variant="ghost"
            onClick={() => {
              setStep("idle");
              setKetQua(null);
            }}
          >
            Import file khác
          </Btn>
        </div>
      )}
      {step === "preview" && preview && (
        <div className="anim-in mt-4">
          <div className="flex items-center gap-2 mb-4 bg-slate-50 rounded-xl p-3">
            <span className="text-xl">📄</span>
            <div className="flex-1">
              <div className="font-semibold text-sm">{filename}</div>
              <div className="text-xs text-[var(--ink-400)]">Đã phân tích xong — sẵn sàng import</div>
            </div>
          </div>
          {renderSummary(preview)}
          {errors.length > 0 && (
            <div className="text-xs text-[var(--coral-500)] mb-4 mt-3 max-h-24 overflow-y-auto">
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="mt-3 mb-3 rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3">
              <div className="text-sm font-semibold text-[var(--color-warning-strong)] mb-1">
                ⚠ {warnings.length} dòng có thể ĐẶT TRÙNG (cùng mã LK + Mã YCSC / ID Lada đã có đơn hoặc lặp trong file)
              </div>
              <div className="text-xs text-[var(--color-text-body)] max-h-40 overflow-y-auto">
                {warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="checkbox" checked={daXemCanhBao} onChange={(e) => setDaXemCanhBao(e.target.checked)} />
                Tôi đã kiểm tra, vẫn muốn import các dòng này
              </label>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Btn onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending || (warnings.length > 0 && !daXemCanhBao)}>
              {commitMutation.isPending ? (tienDo ?? "Đang import…") : "Xác nhận import"}
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => {
                setStep("idle");
                setPreview(null);
              }}
            >
              Hủy
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}
