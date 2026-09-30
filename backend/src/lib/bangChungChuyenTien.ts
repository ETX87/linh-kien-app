// Bang chung chuyen tien PXK nhieu anh (migration 0043, chot 2026-09-29): `phieu_xuat_kho.bang_chung_chuyen_tien_anh`
// = JSON array URL, toi da 5. Tong tien doi (gop them don / tinh lai chiet khau) KHONG xoa anh - phieu ve "Cho KTV
// chuyen", KTV chuyen bo sung + tai them anh roi xac nhan lai.
export const MAX_ANH_BANG_CHUNG = 5;

export function docAnhBangChung(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === "string" && u.length > 0) : [];
  } catch {
    return [];
  }
}

/** JSON array anh da nam trong 1 khoan Ke toan DA DUYET cua phieu (alias `a` = phieu_xuat_kho) - anh giu lai qua cac lan
 * chuyen bo sung, nen doi chieu so tien chi cong anh CHUA duoc ghi nhan (migration 0051). */
export const ANH_DA_GHI_NHAN_SQL = (a: string) =>
  `(SELECT json_group_array(j.value) FROM khoan_chuyen_tien kgn,
      json_each(CASE WHEN json_valid(kgn.anh) THEN kgn.anh ELSE '[]' END) j
    WHERE kgn.phieu_xuat_kho_id = ${a}.id AND kgn.trang_thai = 'Da duyet')`;

/**
 * So tien trinh duyet tu doc tren tung anh (migration 0051, frontend lib/docTienAnh.ts) - JSON { url: so | null }. Gop so
 * da luu (`cuJson`) voi so client vua gui (`moi`, thang), CHI giu anh con trong `anh`; gia tri hop le = so nguyen
 * 0..5 ty hoac null. Tra ve JSON de luu (null neu rong). Chi de canh bao, khong dung tinh tien.
 */
export function locTienDocAnh(cuJson: string | null | undefined, moi: unknown, anh: string[]): string | null {
  const hopLe = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 5_000_000_000);
  const gop: Record<string, number | null> = {};
  let cu: unknown = null;
  try {
    cu = cuJson ? JSON.parse(cuJson) : null;
  } catch {
    cu = null;
  }
  for (const nguon of [cu, moi]) {
    if (!nguon || typeof nguon !== "object" || Array.isArray(nguon)) continue;
    for (const [url, v] of Object.entries(nguon as Record<string, unknown>)) {
      if (anh.includes(url) && hopLe(v)) gop[url] = v;
    }
  }
  return Object.keys(gop).length > 0 ? JSON.stringify(gop) : null;
}
