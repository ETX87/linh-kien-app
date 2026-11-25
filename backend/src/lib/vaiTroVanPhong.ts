// VAI TRO VAN PHONG cua 1 tai khoan (2026-11-25, phan hoi "tài khoản này tôi chuyển sang giám sát mà bên ktv vẫn bị tồn lại"):
// vai_tro (Admin / QC / Giam sat) + 6 co van phong (cung bo co ma POST /users/:email/chuyen-nhom-vai-tro tat khi chuyen sang KTV).
// Dung chung cho: (1) chan "Tạo tài khoản" tu ETX nhan su khi Gmail da khai bao vai tro (lib/etxTuDongKtv.ts),
// (2) hien vai tro van phong canh ma KTV o the "KTV hiện trường" (routes/settingsKtv.ts GET /) + the ETX nhan su.
// Ma tra ve noi bang ",": "Admin" | "QC" | "Giam sat" | "kho" | "ke_toan" | "tn" | "tp_dvbh" | "view" | "mua_hang".
// Ban sao nhan hien thi o FE: frontend/src/lib/vaiTroVanPhong.ts (doi ma o day phai doi ben do).

export const CO_VAN_PHONG: readonly [string, string][] = [
  ["la_kho", "kho"],
  ["la_ke_toan", "ke_toan"],
  ["la_tac_nghiep", "tn"],
  ["la_tp_dvbh", "tp_dvbh"],
  ["la_view", "view"],
  ["la_mua_hang", "mua_hang"],
];

// Bieu thuc SQL tra chuoi ma (NULL neu khong co vai tro van phong nao). `u` = alias bang users (co the NULL do LEFT JOIN).
export function vaiTroVanPhongSql(u: string): string {
  const phan = [
    `CASE WHEN ${u}.vai_tro IS NOT NULL THEN ${u}.vai_tro || ',' ELSE '' END`,
    ...CO_VAN_PHONG.map(([cot, ma]) => `CASE WHEN ${u}.${cot} = 1 THEN '${ma},' ELSE '' END`),
  ];
  return `NULLIF(RTRIM(${phan.map((p) => `(${p})`).join(" || ")}, ','), '')`;
}

export interface CoVaiTroRow {
  vai_tro: string | null;
  la_kho: number;
  la_ke_toan: number;
  la_tac_nghiep: number;
  la_tp_dvbh: number;
  la_view: number;
  la_mua_hang: number;
}

export function vaiTroVanPhong(u: CoVaiTroRow | null | undefined): string | null {
  if (!u) return null;
  const ds: string[] = [];
  if (u.vai_tro) ds.push(u.vai_tro);
  for (const [cot, ma] of CO_VAN_PHONG) if ((u as unknown as Record<string, number>)[cot] === 1) ds.push(ma);
  return ds.length ? ds.join(",") : null;
}

export const COT_VAI_TRO_SQL = "vai_tro, la_kho, la_ke_toan, la_tac_nghiep, la_tp_dvbh, la_view, la_mua_hang";
