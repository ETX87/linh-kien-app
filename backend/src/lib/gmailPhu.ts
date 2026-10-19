// GMAIL DANG NHAP PHU (chot 2026-10-19, v1.367, migration 0091): 1 tai khoan (email chinh) dang nhap duoc bang nhieu Gmail.
// OAuth callback (routes/auth.ts) goi emailChinhCuaGmail() ngay sau khi Google tra email -> ky phien bang email chinh, nen
// moi phan con lai cua he thong (don/PXK/quy/cong no/thong bao/phan quyen) KHONG biet toi Gmail phu.

export function chuanHoaGmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function emailChinhCuaGmail(db: D1Database, email: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT email_chinh FROM users_gmail_phu WHERE email_phu = ?")
    .bind(chuanHoaGmail(email))
    .first<{ email_chinh: string }>();
  return row?.email_chinh ?? null;
}

export async function dsGmailPhu(db: D1Database): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT email_phu FROM users_gmail_phu").all<{ email_phu: string }>();
  return new Set(results.map((r) => r.email_phu));
}

export type GmailPhuLoi =
  | "EMAIL_KHONG_HOP_LE"
  | "TRUNG_EMAIL_CHINH"
  | "DA_LA_GMAIL_PHU"
  | "LA_EMAIL_CHINH_CO_GMAIL_PHU"
  | "LA_EMAIL_DANG_NHAP_KTV"
  | "GMAIL_PHU_DA_CO_DU_LIEU";

// Kiem tra truoc khi gan. Gmail phu KHONG duoc: trung email chinh; da la Gmail phu (cua ai do); la email chinh co Gmail phu
// khac tro toi; la Email dang nhap cua 1 ma KTV DANG BAT (ma da tat thi go Gmail khoi ma do khi gan); da co don/PXK/quy -
// du lieu cu nam duoi email do, gan vao se "mat" khoi mat nguoi dung (chua ho tro gop du lieu).
export async function kiemTraGmailPhu(
  db: D1Database,
  emailChinh: string,
  emailPhu: string,
): Promise<{ ok: true } | { ok: false; error: GmailPhuLoi; chi_tiet?: string }> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPhu)) return { ok: false, error: "EMAIL_KHONG_HOP_LE" };
  if (emailPhu === chuanHoaGmail(emailChinh)) return { ok: false, error: "TRUNG_EMAIL_CHINH" };
  const [daPhu, laChinh, ktv, duLieu] = await Promise.all([
    db.prepare("SELECT email_chinh FROM users_gmail_phu WHERE email_phu = ?").bind(emailPhu).first<{ email_chinh: string }>(),
    db.prepare("SELECT 1 FROM users_gmail_phu WHERE LOWER(email_chinh) = ? LIMIT 1").bind(emailPhu).first(),
    db
      .prepare("SELECT ma_ktv FROM ktv_lien_he WHERE LOWER(TRIM(email_dang_nhap)) = ? AND COALESCE(ngung_hoat_dong, 0) = 0 LIMIT 1")
      .bind(emailPhu)
      .first<{ ma_ktv: string }>(),
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM dat_don_hang WHERE LOWER(nguoi_tao) = ?1 OR LOWER(nguoi_nhan_hang) = ?1)
              + (SELECT COUNT(*) FROM phieu_xuat_kho WHERE LOWER(nguoi_nhan_hang) = ?1)
              + (SELECT COUNT(*) FROM quy_ktv WHERE LOWER(email) = ?1 AND so_du <> 0) AS n`,
      )
      .bind(emailPhu)
      .first<{ n: number }>(),
  ]);
  if (daPhu) return { ok: false, error: "DA_LA_GMAIL_PHU", chi_tiet: daPhu.email_chinh };
  if (laChinh) return { ok: false, error: "LA_EMAIL_CHINH_CO_GMAIL_PHU" };
  if (ktv) return { ok: false, error: "LA_EMAIL_DANG_NHAP_KTV", chi_tiet: ktv.ma_ktv };
  if ((duLieu?.n ?? 0) > 0) return { ok: false, error: "GMAIL_PHU_DA_CO_DU_LIEU", chi_tiet: String(duLieu?.n) };
  return { ok: true };
}
