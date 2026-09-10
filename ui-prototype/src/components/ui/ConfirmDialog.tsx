import { useState } from "react";
import { Modal } from "./Modal";
import { Btn } from "./Btn";
import { FormField, Select, TextArea } from "./Form";

// Dialog xac nhan thao tac nguy hiem - prompt sec.22. `reasons` != null -> bat buoc chon 1 ly do.
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Xác nhận",
  danger = true,
  reasons,
  noteLabel = "Ghi chú",
  mobile,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason?: string; note?: string }) => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  reasons?: { value: string; label: string }[];
  noteLabel?: string;
  mobile?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const blocked = !!reasons && !reason;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="440px"
      mobile={mobile}
      footer={
        <>
          <Btn variant="ghost" size="sm" onClick={onClose}>
            Huỷ
          </Btn>
          <Btn
            variant={danger ? "danger" : "primary"}
            size="sm"
            disabled={blocked}
            onClick={() => {
              onConfirm({ reason: reason || undefined, note: note || undefined });
              setReason("");
              setNote("");
            }}
          >
            {confirmLabel}
          </Btn>
        </>
      }
    >
      {message && <p className="mb-3 text-[13px] text-[var(--color-text-secondary)]">{message}</p>}
      {reasons && (
        <div className="mb-3">
          <FormField label="Lý do" required>
            <Select value={reason} onChange={setReason} options={reasons} placeholder="Chọn lý do" />
          </FormField>
        </div>
      )}
      <FormField label={noteLabel}>
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nhập ghi chú (tuỳ chọn)…" />
      </FormField>
    </Modal>
  );
}
