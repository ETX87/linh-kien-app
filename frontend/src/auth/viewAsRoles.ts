// Khop dung backend/src/lib/viewAsPresets.ts (VIEW_AS_ROLE_KEYS/VIEW_AS_LABELS) - trung lap co chu
// dich, giong quy uoc AppUser da trung lap giua FE/BE cua repo nay (khong dung package chung giua 2
// codebase Workers/Vite), sua 1 ben thi phai sua ca 2.
export type ViewAsRole = "ktv" | "ve_tinh" | "tram" | "kho" | "ke_toan" | "tac_nghiep" | "tp_dvbh" | "qc" | "giam_sat";

export const VIEW_AS_ROLES: { key: ViewAsRole; label: string }[] = [
  { key: "ktv", label: "KTV DVBH" },
  { key: "ve_tinh", label: "Vệ tinh" },
  { key: "tram", label: "Trạm" },
  { key: "kho", label: "Kho" },
  { key: "ke_toan", label: "Kế toán" },
  { key: "tac_nghiep", label: "Tác nghiệp (TN)" },
  { key: "tp_dvbh", label: "TP DVBH" },
  { key: "qc", label: "QC" },
  { key: "giam_sat", label: "Giám sát" },
];

export const VIEW_AS_LABELS: Record<ViewAsRole, string> = Object.fromEntries(VIEW_AS_ROLES.map((r) => [r.key, r.label])) as Record<ViewAsRole, string>;
