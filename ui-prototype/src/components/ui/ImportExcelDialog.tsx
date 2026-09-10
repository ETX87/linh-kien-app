import { useState } from "react";
import { Modal } from "./Modal";
import { Btn } from "./Btn";
import { Icon } from "./Icon";
import { IMPORT_PREVIEW, IMPORT_ERRORS } from "../../mock/misc";
import { useToast } from "./Toast";

export function ImportExcelDialog({ open, onClose, mobile, onImported }: { open: boolean; onClose: () => void; mobile?: boolean; onImported?: (n: number) => void }) {
  const [picked, setPicked] = useState(false);
  const toast = useToast();
  const cols = Object.keys(IMPORT_PREVIEW[0]);
  const ok = IMPORT_PREVIEW.length - IMPORT_ERRORS.length;

  return (
    <Modal
      open={open}
      onClose={() => {
        setPicked(false);
        onClose();
      }}
      title="Nhập Excel hàng loạt"
      width="620px"
      mobile={mobile}
      footer={
        <>
          <Btn variant="ghost" size="sm" onClick={() => toast("Đã tải file mẫu (mô phỏng)", "info")}>
            <Icon.download size={14} /> Tải file mẫu
          </Btn>
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => {
              setPicked(false);
              onClose();
            }}
          >
            Huỷ
          </Btn>
          <Btn
            size="sm"
            disabled={!picked}
            onClick={() => {
              toast(`Đã nhập ${ok} dòng hợp lệ`);
              onImported?.(ok);
              setPicked(false);
              onClose();
            }}
          >
            Nhập ngay
          </Btn>
        </>
      }
    >
      {!picked ? (
        <button
          type="button"
          onClick={() => setPicked(true)}
          className="focus-ring grid w-full place-items-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--color-border-strong)] py-10 text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]/40"
        >
          <Icon.upload size={22} />
          <span className="text-[13px] font-semibold">Chọn file .xlsx hoặc kéo thả vào đây</span>
          <span className="text-[11px] text-[var(--color-text-faint)]">Cột: Mã LK · Người nhận · SL · Giá đề xuất · Ghi chú</span>
        </button>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-3 text-[12.5px]">
            <span className="font-semibold text-[var(--color-success)]">✓ {ok} dòng hợp lệ</span>
            <span className="font-semibold text-[var(--color-danger)]">✕ {IMPORT_ERRORS.length} dòng lỗi</span>
            <button onClick={() => setPicked(false)} className="focus-ring ml-auto text-[var(--color-primary)] hover:underline">
              Chọn file khác
            </button>
          </div>
          <div className="overflow-x-auto rounded-[var(--radius-btn)] border border-[var(--color-border)]">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-[var(--color-surface-soft)] text-left text-[var(--color-text-secondary)]">
                  {cols.map((c) => (
                    <th key={c} className="px-2.5 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {IMPORT_PREVIEW.map((r, i) => {
                  const bad = i === IMPORT_PREVIEW.length - 1;
                  return (
                    <tr key={i} className={`border-t border-[var(--color-border)] ${bad ? "bg-[var(--color-danger-soft)]" : ""}`}>
                      {cols.map((c) => (
                        <td key={c} className="px-2.5 py-1.5">
                          {String(r[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {IMPORT_ERRORS.length > 0 && (
            <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-danger)]">
              {IMPORT_ERRORS.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
