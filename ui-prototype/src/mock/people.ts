// Danh ba nguoi dung / KTV mau - dung de map email -> ten hien thi + quan he GS/Tram.
export interface KtvRow {
  email: string;
  ten: string;
  vaiTro: "Trạm" | "KTV/CTV" | "Vệ tinh";
  tramCha: string | null;
  giamSat: string;
  gsTen: string;
  khuVuc: string;
}

export const KTV_LIST: KtvRow[] = [
  { email: "tram.hadong@3t.vn", ten: "Trạm Hà Đông", vaiTro: "Trạm", tramCha: null, giamSat: "gs.mienbac@3t.vn", gsTen: "Lê Thị C", khuVuc: "MB1" },
  { email: "ktv.a@3t.vn", ten: "Nguyễn Văn A", vaiTro: "KTV/CTV", tramCha: null, giamSat: "gs.mienbac@3t.vn", gsTen: "Lê Thị C", khuVuc: "MB1" },
  { email: "vetinh.b@3t.vn", ten: "Lê Thị B", vaiTro: "Vệ tinh", tramCha: "tram.hadong@3t.vn", giamSat: "gs.mienbac@3t.vn", gsTen: "Lê Thị C", khuVuc: "MB1" },
  { email: "vetinh.d@3t.vn", ten: "Phạm Văn D", vaiTro: "Vệ tinh", tramCha: "tram.hadong@3t.vn", giamSat: "gs.mienbac@3t.vn", gsTen: "Lê Thị C", khuVuc: "MB1" },
  { email: "ktv.e@3t.vn", ten: "Hoàng Thị E", vaiTro: "KTV/CTV", tramCha: null, giamSat: "gs.miennam@3t.vn", gsTen: "Ngô Văn H", khuVuc: "MN2" },
  { email: "ktv.f@3t.vn", ten: "Vũ Văn F", vaiTro: "KTV/CTV", tramCha: null, giamSat: "gs.miennam@3t.vn", gsTen: "Ngô Văn H", khuVuc: "MN2" },
  { email: "vetinh.g@3t.vn", ten: "Đỗ Thị G", vaiTro: "Vệ tinh", tramCha: "tram.hadong@3t.vn", giamSat: "gs.mienbac@3t.vn", gsTen: "Lê Thị C", khuVuc: "MB2" },
];

export const PEOPLE: Record<string, string> = Object.fromEntries([
  ...KTV_LIST.map((k) => [k.email, k.ten]),
  ["admin@3t.vn", "Nguyễn Văn An"],
  ["qc@3t.vn", "Trần Thị QC"],
  ["gs.mienbac@3t.vn", "Lê Thị C"],
  ["gs.miennam@3t.vn", "Ngô Văn H"],
  ["kho.trungtam@3t.vn", "Kho Trung Tâm"],
  ["ketoan.c@3t.vn", "Kế toán C"],
  ["tacnghiep.d@3t.vn", "Tác nghiệp D"],
  ["tpdvbh.e@3t.vn", "TP DVBH E"],
]);

export function tenOf(email: string | null | undefined): string {
  if (!email) return "—";
  return PEOPLE[email] ?? email;
}
export function ktvOf(email: string): KtvRow | undefined {
  return KTV_LIST.find((k) => k.email === email);
}
