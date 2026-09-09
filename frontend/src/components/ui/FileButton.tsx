import type { ChangeEvent, ReactNode } from "react";
import { btnClasses, type BtnSize, type BtnVariant } from "./Btn";

interface FileButtonProps {
  children: ReactNode;
  onFileSelected: (file: File) => void;
  accept?: string;
  capture?: "environment" | "user";
  disabled?: boolean;
  variant?: BtnVariant;
  size?: BtnSize;
  className?: string;
}

// UX audit 2026-09-08, van de #5: <input type="file"> tho hien thi chrome mac dinh cua trinh duyet
// ("Choose File / No file chosen"), khac han toan bo design system con lai cua app. Bao input that
// (bat buoc de trinh duyet mo dialog chon file) trong <label> voi CUNG bo class voi Btn - nhan vao
// label kich hoat input ben trong ma khong can ref/onClick thu cong.
export function FileButton({ children, onFileSelected, accept, capture, disabled, variant = "ghost", size = "sm", className = "" }: FileButtonProps) {
  return (
    <label className={`${btnClasses(variant, size, className)} cursor-pointer ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      {children}
      <input
        type="file"
        accept={accept}
        capture={capture}
        disabled={disabled}
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const f = e.target.files?.[0];
          if (f) onFileSelected(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
