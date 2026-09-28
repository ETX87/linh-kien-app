import type { ReactNode } from "react";

// So tien hien thi tren UI (phan hoi 2026-09-28: "tất cả UI số tiền tô màu xanh lá cây đậm lên cho
// tôi để dễ phân biệt") - MOI so tien render qua day de dung 1 mau (--color-money, class .money o
// tokens.css). Nhan THANG chuoi da format (fmtVND cua lib/format.ts hoac types.ts) de giu nguyen cach
// hien null ("—" / "0đ") cua tung noi goi; "—" (khong co gia tri) giu mau chu nhat, khong to xanh.
export function Money({ children, className = "" }: { children: ReactNode; className?: string }) {
  if (children === "—") return <span className="text-[var(--color-text-faint)]">—</span>;
  return <span className={`money ${className}`}>{children}</span>;
}
