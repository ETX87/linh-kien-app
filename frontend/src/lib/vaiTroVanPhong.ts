// Nhan hien thi cho chuoi ma vai tro van phong do backend tra ve (backend/src/lib/vaiTroVanPhong.ts vaiTroVanPhongSql, 2026-11-25).
// Doi bo ma o backend phai doi ban nay.
const NHAN: Record<string, string> = {
  Admin: "Admin",
  QC: "QC",
  "Giam sat": "Giám sát",
  kho: "Kho",
  ke_toan: "Kế toán",
  tn: "TN",
  tp_dvbh: "TP DVBH",
  view: "View",
  mua_hang: "Mua hàng",
};

export function nhanVaiTroVanPhong(ma: string | null | undefined): string {
  if (!ma) return "";
  return ma.split(",").filter(Boolean).map((m) => NHAN[m] ?? m).join(" · ");
}
