import type { Persona } from "../types";

// 10 persona theo ui-concepts/SPEC.md muc 2. `id` dung lam key persona switcher.
const base = {
  ktvDVBH: false,
  veTinh: false,
  kho: false,
  keToan: false,
  tn: false,
  tpDVBH: false,
  view: false,
  manageParts: false,
  viewParts: false,
  tramCha: null as string | null,
  giamSat: null as string | null,
};

export const PERSONAS: Persona[] = [
  {
    ...base,
    id: "admin",
    ten: "Nguyễn Văn An",
    email: "admin@3t.vn",
    coreRole: "ADMIN",
    // Demo: Admin bat kem het co de dai chip tren topbar giong screenshot (Admin vuot moi kiem tra quyen).
    ktvDVBH: true,
    veTinh: true,
    kho: true,
    keToan: true,
    tn: true,
    tpDVBH: true,
    view: true,
    manageParts: true,
    ghiChu: "Vượt gần như mọi kiểm tra quyền",
  },
  { ...base, id: "qc", ten: "Trần Thị QC", email: "qc@3t.vn", coreRole: "QC" },
  { ...base, id: "gs", ten: "Lê Thị C (GS)", email: "gs.mienbac@3t.vn", coreRole: "GS", ghiChu: "Phụ trách KTV Nguyễn Văn A, Vệ tinh Lê Thị B, Trạm Hà Đông" },
  { ...base, id: "tram", ten: "Trạm Hà Đông", email: "tram.hadong@3t.vn", coreRole: null, ktvDVBH: true, ghiChu: "Quản lý Vệ tinh: Lê Thị B, Phạm Văn D" },
  { ...base, id: "ktv", ten: "Nguyễn Văn A", email: "ktv.a@3t.vn", coreRole: null, ktvDVBH: true, giamSat: "gs.mienbac@3t.vn" },
  { ...base, id: "vetinh", ten: "Lê Thị B (Vệ tinh)", email: "vetinh.b@3t.vn", coreRole: null, veTinh: true, tramCha: "tram.hadong@3t.vn", giamSat: "gs.mienbac@3t.vn" },
  { ...base, id: "kho", ten: "Kho Trung Tâm", email: "kho.trungtam@3t.vn", coreRole: null, kho: true },
  { ...base, id: "ketoan", ten: "Kế toán C", email: "ketoan.c@3t.vn", coreRole: null, keToan: true },
  { ...base, id: "tn", ten: "Tác nghiệp D", email: "tacnghiep.d@3t.vn", coreRole: null, tn: true, manageParts: true },
  { ...base, id: "tpdvbh", ten: "TP DVBH E", email: "tpdvbh.e@3t.vn", coreRole: null, tpDVBH: true, viewParts: true },
];

export const DEFAULT_PERSONA_ID = "admin";
