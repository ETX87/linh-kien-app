import { bumpVersions } from "./dataVersions";

/**
 * Phase 4 (2026-08-26, "xay lai quan ly tai khoan/vai tro theo Khu vuc" - xem CLAUDE.md): dong bo
 * users.giam_sat_quan_ly/users.tram_cha tu du lieu Khu vuc/KTV cap 1 phu trach.
 *
 * QUYET DINH QUAN TRONG da xac nhan voi nguoi dung: scope GS trong TOAN BO module Dat mua linh kien
 * (scopeDatMua.ts, datMuaLinhKien.ts, phieuXuatKho.ts - kiem tra "NGOAI_PHAM_VI_GS", loc danh sach
 * "nguoi nhan hang" theo GS...) van DOC NGUYEN 2 cot `users.giam_sat_quan_ly`/`users.tram_cha` nhu
 * truoc gio - KHONG sua bat ky dong logic phan quyen nao o cac file do (rui ro cao, dung toi tien
 * mua/cong no/tra hang dang chay that). Thay vao do, CHI DOI NGUON GHI 2 cot nay: truoc day Admin
 * nhap tay trong UsersModule.tsx, nay 2 cot TRO THANH gia tri derived/read-only, tinh lai tu:
 *   - giam_sat_quan_ly <- ktv_lien_he.khu_vuc_ma -> khu_vuc.gs_email (GS phu trach khu vuc cua KTV)
 *   - tram_cha         <- ktv_lien_he.ktv_cap1_phu_trach (CHI khi vai_tro_ktv='Ve tinh', tro toi
 *     email_dang_nhap cua KTV cap 1 duoc gan) - hop nhat co che "Tram/Ve tinh" cu (dang dung dung
 *     cot users.tram_cha nay) voi quan he KTV cap 1/cap 2 moi, tranh 2 nguon du lieu lech nhau.
 *
 * Goi resyncKhuVucDerivedFieldsForEmail() ngay sau khi 1 tai khoan KTV duoc tao/kich hoat (provision,
 * dang nhap lan dau - xem routes/auth.ts, routes/settingsKtv.ts); goi
 * resyncKhuVucDerivedFieldsForAll() sau khi sua du lieu co the anh huong NHIEU KTV cung luc (doi GS
 * cua 1 khu vuc, bulk-import, backfill - xem routes/settingsDatMua.ts, routes/settingsKtv.ts). Idempotent
 * - chay lai nhieu lan an toan, khong can theo dung thu tu voi cac ghi khac trong cung request.
 */

const TRAM_CHA_SUBQUERY = `(
  SELECT CASE WHEN vt.vai_tro_ktv = 'Ve tinh' THEN c1.email_dang_nhap ELSE NULL END
  FROM ktv_lien_he vt LEFT JOIN ktv_lien_he c1 ON c1.ma_ktv = vt.ktv_cap1_phu_trach
  WHERE vt.email_dang_nhap = {ALIAS}
)`;
const GIAM_SAT_QUAN_LY_SUBQUERY = `(
  SELECT kv.gs_email FROM ktv_lien_he k LEFT JOIN khu_vuc kv ON kv.ma = k.khu_vuc_ma
  WHERE k.email_dang_nhap = {ALIAS}
)`;

// CHOT 2026-09-28 (phan hoi "GS Ngô Tuấn gán MB1 nhưng báo cáo đang đếm cả đơn của KTV CTV Cần Thơ"):
// dat_don_hang.email_gs truoc day la anh chup GS luc TAO don, KHONG bao gio doi - KTV doi khu vuc / khu vuc doi
// GS thi don cu van tinh cho GS cu. Nguoi dung chot "theo khu vực HIỆN TẠI của KTV" (ca don cu) -> moi lan dong
// bo users.giam_sat_quan_ly, dong bo LUON email_gs cua moi don co nguoi nhan hang la KTV trong danh ba. Nhu vay
// MOI scope doc email_gs (GS, TN/Kho/Ke toan phu trach GS, PXK, tra hang, badge) tu dung khu vuc hien tai ma
// khong phai sua logic phan quyen. Don nguoi nhan khong co trong danh ba KTV: do trigger trg_ddh_email_gs_theo_khu_vuc
// (migration 0045) lo - email_gs = GS cua khu vuc cua don. KTV chua gan khu vuc cung fallback nhu vay (2026-09-29) -
// CUNG cong thuc voi trigger do, doi 1 ben phai doi ben kia.
const DON_EMAIL_GS_MOI = `COALESCE(
  (SELECT u.giam_sat_quan_ly FROM users u WHERE u.email = dat_don_hang.nguoi_nhan_hang),
  (SELECT kv.gs_email FROM khu_vuc kv WHERE kv.ma = dat_don_hang.khu_vuc_ma))`;

async function dongBoEmailGsDon(db: D1Database, email: string | null): Promise<void> {
  const res = await db
    .prepare(
      `UPDATE dat_don_hang SET email_gs = ${DON_EMAIL_GS_MOI}
       WHERE nguoi_nhan_hang IN (SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL)
         ${email ? "AND nguoi_nhan_hang = ?" : ""}
         AND COALESCE(email_gs, '') != COALESCE(${DON_EMAIL_GS_MOI}, '')`,
    )
    .bind(...(email ? [email] : []))
    .run();
  if ((res.meta?.changes ?? 0) > 0) await bumpVersions(db, ["dat_mua_lk"]);
}

/** Dong bo 1 tai khoan cu the (dung ngay sau dang nhap lan dau/provision 1 KTV) - re hon ban "ALL". */
export async function resyncKhuVucDerivedFieldsForEmail(db: D1Database, email: string): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET
         giam_sat_quan_ly = ${GIAM_SAT_QUAN_LY_SUBQUERY.replace(/{ALIAS}/g, "?")},
         tram_cha = ${TRAM_CHA_SUBQUERY.replace(/{ALIAS}/g, "?")}
       WHERE email = ?`,
    )
    .bind(email, email, email)
    .run();
  await dongBoEmailGsDon(db, email);
}

/** Dong bo TOAN BO tai khoan KTV (dung sau thao tac anh huong nhieu dong: doi GS 1 khu vuc, bulk-import, backfill). */
export async function resyncKhuVucDerivedFieldsForAll(db: D1Database): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET
         giam_sat_quan_ly = ${GIAM_SAT_QUAN_LY_SUBQUERY.replace(/{ALIAS}/g, "users.email")},
         tram_cha = ${TRAM_CHA_SUBQUERY.replace(/{ALIAS}/g, "users.email")}
       WHERE email IN (SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL)`,
    )
    .run();
  await dongBoEmailGsDon(db, null);
}
