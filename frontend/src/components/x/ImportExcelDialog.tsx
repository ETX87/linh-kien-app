import { useRef, useState } from "react";
import { Modal } from "./Modal";
import { Btn } from "./Btn";
import { Icon } from "./Icon";

// Props-driven (port P1). Nơi gọi lo: đọc file (preview qua API), truyền previewRows/errors về,
// và onConfirm (commit). `dropHint` mô tả cột file mẫu.
export function ImportExcelDialog({
  open,
  onClose,
  mobile,
  title = "Nhập Excel hàng loạt",
  dropHint,
  fileName,
  previewRows,
  errors = [],
  loading,
  onPickFile,
  onDownloadTemplate,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  mobile?: boolean;
  title?: string;
  dropHint?: string;
  fileName?: string | null;
  previewRows?: Record<string, unknown>[];
  errors?: string[];
  loading?: boolean;
  onPickFile?: (file: File) => void;
  onDownloadTemplate?: () => void;
  onConfirm?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const hasPreview = !!previewRows && previewRows.length > 0;
  const cols = hasPreview ? Object.keys(previewRows![0]) : [];
  const okCount = hasPreview ? previewRows!.length - errors.length : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="640px"
      mobile={mobile}
      footer={
        <>
          {onDownloadTemplate && (
            <Btn variant="ghost" size="sm" onClick={onDownloadTemplate}>
              <Icon.download size={14} /> Tải file mẫu
            </Btn>
          )}
          <Btn variant="ghost" size="sm" onClick={onClose}>
            Huỷ
          </Btn>
          <Btn size="sm" loading={loading} disabled={!hasPreview || errors.length === previewRows!.length} onClick={onConfirm}>
            Nhập ngay
          </Btn>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile?.(f);
          e.target.value = "";
        }}
      />
      {!hasPreview ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onPickFile?.(f);
          }}
          className={`focus-ring grid w-full place-items-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed py-10 text-[var(--color-text-secondary)] transition-colors ${
            dragOver ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/40" : "border-[var(--color-border-strong)] hover:border-[var(--color-primary)]"
          }`}
        >
          {loading ? <span className="spin inline-block h-5 w-5 rounded-full border-2 border-current border-t-transparent" /> : <Icon.upload size={22} />}
          <span className="text-[13px] font-semibold">{fileName || "Chọn file .xlsx hoặc kéo thả vào đây"}</span>
          {dropHint && <span className="text-[11px] text-[var(--color-text-faint)]">{dropHint}</span>}
        </button>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-3 text-[12.5px]">
            <span className="font-semibold text-[var(--color-success)]">✓ {okCount} dòng hợp lệ</span>
            {errors.length > 0 && <span className="font-semibold text-[var(--color-danger)]">✕ {errors.length} dòng lỗi</span>}
            <button onClick={() => inputRef.current?.click()} className="focus-ring ml-auto text-[var(--color-primary)] hover:underline">
              Chọn file khác
            </button>
          </div>
          <div className="overflow-x-auto rounded-[var(--radius-btn)] border border-[var(--color-border)]">
            <table className="tbl w-full border-collapse">
              <thead>
                <tr className="tbl-head">
                  {cols.map((c) => (
                    <th key={c} className="px-2.5 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows!.slice(0, 30).map((r, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    {cols.map((c) => (
                      <td key={c} className="px-2.5 py-1.5">
                        {String(r[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {errors.length > 0 && (
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[12px] text-[var(--color-danger)]">
              {errors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
