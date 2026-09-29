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
