import type { ReactNode } from "react";

// Ten nguoi tao don (hong dam) / nguoi nhan hang (xanh duong dam) - phan hoi 2026-09-28 "để dễ phân
// biệt". Nhan THANG chuoi da format (formatNguoiDisplay/labelKtv) - chi doi MAU, giu do dam chu cua noi
// goi (tranh lam lech do rong cot tu tinh). "—" (khong co nguoi) giu mau chu nhat.
function TenNguoi({ children, className }: { children: ReactNode; className: string }) {
  if (children === "—") return <span className="text-[var(--color-text-faint)]">—</span>;
  return <span className={className}>{children}</span>;
}

export function NguoiTao({ children }: { children: ReactNode }) {
  return <TenNguoi className="nguoi-tao">{children}</TenNguoi>;
}

export function NguoiNhan({ children }: { children: ReactNode }) {
  return <TenNguoi className="nguoi-nhan">{children}</TenNguoi>;
}
