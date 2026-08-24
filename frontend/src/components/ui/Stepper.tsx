// Dai buoc quy trinh dang doc/gion (concept 1, pattern ".stepper") - dung cho cac man co chuoi buoc
// tuyen tinh ro rang (vd PXK: Dang tao phieu -> Cho ke toan -> Dang gui KTV -> Kho da ket thuc). KHONG
// thay the PipelineFlow.tsx (chevron nhieu vai tro/nhieu luong cung luc) - Stepper danh cho 1 luong
// DUY NHAT, tuyen tinh, hien ben trong 1 Drawer/man hinh chi tiet.
export interface StepperStep {
  label: string;
  state: "done" | "cur" | "todo";
}

export function Stepper({ steps }: { steps: StepperStep[] }) {
  return (
    <div className="flex gap-0 mb-3.5">
      {steps.map((s, i) => (
        <div
          key={i}
          className={`flex-1 text-center text-[10.5px] font-bold pb-2 border-b-[3px] px-1 ${
            s.state === "done"
              ? "text-[var(--teal-600)] border-[var(--teal-500)]"
              : s.state === "cur"
                ? "text-[var(--indigo-600)] border-[var(--indigo-600)]"
                : "text-[var(--ink-400)] border-[var(--line)]"
          }`}
        >
          {s.label}
        </div>
      ))}
    </div>
  );
}
