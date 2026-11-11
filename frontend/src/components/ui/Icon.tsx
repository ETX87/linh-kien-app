import type { SVGProps } from "react";

// Bo icon outline noi bo (1 phong cach - stroke 1.75, round). Khong dung lib ngoai.
type P = SVGProps<SVGSVGElement> & { size?: number };
function S({ size = 18, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  );
}

export const Icon = {
  home: (p: P) => (
    <S {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </S>
  ),
  cart: (p: P) => (
    <S {...p}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6" />
    </S>
  ),
  return: (p: P) => (
    <S {...p}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10H9" />
    </S>
  ),
  catalog: (p: P) => (
    <S {...p}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z" />
      <path d="M9 7.5h7M9 11h7" />
    </S>
  ),
  // Hoi dap KTV <-> Mua hang (2026-10-17).
  chat: (p: P) => (
    <S {...p}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8M8 13h5" />
    </S>
  ),
  wallet: (p: P) => (
    <S {...p}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <path d="M4 7.5V18a2 2 0 0 0 2 2h14V8H6.5A2.5 2.5 0 0 1 4 5.5" />
      <path d="M16.5 14h.01" />
    </S>
  ),
  stock: (p: P) => (
    <S {...p}>
      <path d="M4 7 12 3l8 4v10l-8 4-8-4z" />
      <path d="M4 7l8 4 8-4M12 11v10" />
    </S>
  ),
  chart: (p: P) => (
    <S {...p}>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M13 16V8M18 16v-6" />
    </S>
  ),
  settings: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 6.9 4.2l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </S>
  ),
  users: (p: P) => (
    <S {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 20a5.5 5.5 0 0 0-3-4.9" />
    </S>
  ),
  bell: (p: P) => (
    <S {...p}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </S>
  ),
  search: (p: P) => (
    <S {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.6-3.6" />
    </S>
  ),
  filter: (p: P) => (
    <S {...p}>
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </S>
  ),
  plus: (p: P) => (
    <S {...p}>
      <path d="M12 5v14M5 12h14" />
    </S>
  ),
  upload: (p: P) => (
    <S {...p}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </S>
  ),
  download: (p: P) => (
    <S {...p}>
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </S>
  ),
  check: (p: P) => (
    <S {...p}>
      <path d="m5 12 5 5L20 6" />
    </S>
  ),
  x: (p: P) => (
    <S {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </S>
  ),
  chevronRight: (p: P) => (
    <S {...p}>
      <path d="m9 6 6 6-6 6" />
    </S>
  ),
  chevronLeft: (p: P) => (
    <S {...p}>
      <path d="m15 6-6 6 6 6" />
    </S>
  ),
  chevronDown: (p: P) => (
    <S {...p}>
      <path d="m6 9 6 6 6-6" />
    </S>
  ),
  arrowRight: (p: P) => (
    <S {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </S>
  ),
  clock: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </S>
  ),
  star: ({ size = 18, ...rest }: P) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}>
      <path d="m12 2 2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.8 6.1 20.8l1.2-6.6L2.5 9l6.6-.9z" />
    </svg>
  ),
  alert: (p: P) => (
    <S {...p}>
      <path d="M12 3 2 20h20z" />
      <path d="M12 9v5M12 17h.01" />
    </S>
  ),
  menu: (p: P) => (
    <S {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </S>
  ),
  file: (p: P) => (
    <S {...p}>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v4h4" />
    </S>
  ),
  calendar: (p: P) => (
    <S {...p}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </S>
  ),
  package: (p: P) => (
    <S {...p}>
      <path d="M4 7 12 3l8 4v10l-8 4-8-4z" />
      <path d="M4 7l8 4 8-4M12 11v10" />
    </S>
  ),
  flow: (p: P) => (
    <S {...p}>
      <circle cx="5" cy="6" r="2.2" />
      <circle cx="19" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M7.2 6h9.6M17.8 7.9l-4.6 8.2M10.8 16.1 6.2 7.9" />
    </S>
  ),
};
