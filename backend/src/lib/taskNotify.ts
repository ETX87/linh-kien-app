import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { sendPushToUser } from "./webPush";

// Day thong bao "viec moi theo vai tro + khu vuc" (phan hoi 2026-09-05) - khac thongBaoChoNguoiTao()
// (datMuaLinhKien.ts, bao NGUOI TAO don khi don doi trang thai): ham o day bao NGUOI SAP/DANG/DA
// LIEN QUAN toi 1 buoc chuyen trang thai, tach 3 loai DOC LAP nguoi dung tu bat/tat rieng (migration
// 0019_notification_prefs.sql, cot users.nhan_tb_*):
//   1. "nhiem_vu" (loai DB "viec_moi", mac dinh BAT) - vai tro TRUC TIEP phai xu ly buoc nay (khu vuc
//      khop) - CHINH LA tinh nang goc, giu nguyen logic emailsForRoleOrQC().
//   2. "lien_quan" (mac dinh TAT) - MOI vai tro KHAC cung thuoc quy trinh nay (cung khu vuc phu
//      trach), du CHUA den luot ho xu ly - CHOT voi nguoi dung: bao O MOI buoc chuyen, khong chi buoc
//      lien ke truoc vai tro do.
//   3. "theo_doi" (mac dinh TAT) - nguoi TUNG la nguoi_xu_ly cua CHINH entity nay (bat ky vai tro nao
//      luc do), tru nguoi da nam trong loai 1 cho lan nay (uu tien 1 > 3 > 2, CHOT voi nguoi dung).
// Ca 3 loai LUON ghi 1 dong thong_bao_ktv (xem lai duoc trong chuong du co tat push hay khong) - CHI
// khac o buoc co goi sendPushToUser() hay khong, tuy cot nhan_tb_* cua tung nguoi nhan.
export type ViecMoiRoleCol = "la_tac_nghiep" | "la_kho" | "la_ke_toan" | "la_tp_dvbh";

// Nhom vai tro "cung 1 quy trinh" dung cho loai 2 (bao MOI buoc cho MOI vai tro con lai trong nhom,
// tru vai tro dang la nguoi xu ly buoc nay). Khong dua Tram/KTV chinh chu vao day - 2 vi tri do la
// DINH DANH 1 nguoi cu the (tram_cha/nguoi_nhan_hang), khong co cot vai tro roi rac de broadcast.
export const MUA_CONG_NO_ROLES: ViecMoiRoleCol[] = ["la_tp_dvbh", "la_tac_nghiep", "la_kho", "la_ke_toan"];
export const TRA_HANG_ROLES: (ViecMoiRoleCol | "qc")[] = ["la_ke_toan", "la_kho", "qc", "la_tac_nghiep"];
export const PXK_ROLES: ViecMoiRoleCol[] = ["la_tac_nghiep", "la_ke_toan", "la_kho"];

// "Khu vuc phu trach" (CHOT voi nguoi dung 2026-09-05: dung lai co che dat_mua_lk_phu_trach_gs dang
// dung cho badge/thong ke - xem scopeDatMua.ts phuTrachGsSet() - KHONG dung bang khu_vuc/user_khu_vuc
// moi, bang do hien "chi phuc vu tim kiem/loc" theo CLAUDE.md, chua phai co che scope that). Ham nay
// la CHIEU NGUOC LAI cua phuTrachGsSet(): cho 1 danh sach email_gs cua (cac) don lien quan, tra ve
// tap email nguoi dung co co roleCol=1 (hoac QC) VA (chua duoc gan khu vuc phu trach nao (khong gioi
// han) HOAC da duoc gan dung 1 trong cac GS trong danh sach). emailGsList RONG (don khong gan GS nao)
// -> chi tra nguoi dung KHONG bi gioi han. QC (CHOT voi nguoi dung): khong gioi han khu vuc o BAT KY
// dau trong he (canQC chi kiem tra vai_tro==='QC') - bo qua scope GS, bao TOAN BO QC.
export async function emailsForRoleOrQC(db: D1Database, role: ViecMoiRoleCol | "qc", emailGsList: string[]): Promise<string[]> {
  if (role === "qc") {
    const { results } = await db.prepare("SELECT email FROM users WHERE vai_tro = 'QC' AND bi_khoa = 0").all<{ email: string }>();
    return results.map((r) => r.email);
  }
  const scopeSql = emailGsList.length
    ? `AND (email NOT IN (SELECT DISTINCT nguoi_phu_trach FROM dat_mua_lk_phu_trach_gs)
         OR email IN (SELECT nguoi_phu_trach FROM dat_mua_lk_phu_trach_gs WHERE giam_sat_email IN (SELECT value FROM json_each(?))))`
    : `AND email NOT IN (SELECT DISTINCT nguoi_phu_trach FROM dat_mua_lk_phu_trach_gs)`;
  const { results } = await db
    .prepare(`SELECT email FROM users WHERE ${role} = 1 AND bi_khoa = 0 ${scopeSql}`)
    .bind(...(emailGsList.length ? [JSON.stringify(emailGsList)] : []))
    .all<{ email: string }>();
  return results.map((r) => r.email);
}

// Quet lich su LOG THAT (dat_don_hang_log/tra_hang_log/phieu_xuat_kho_log - KHONG phai cot mirror
// trang_thai_hien_tai) cua dung 1 entity, tra ve tap nguoi_xu_ly KHAC nguoi vua thao tac (dung cho
// loai 3). logTable/fkCol la hang so noi bo do code goi (khong tu request nguoi dung), an toan noi
// chuoi truc tiep vao SQL.
export async function pastActorsFor(
  db: D1Database,
  logTable: "dat_don_hang_log" | "tra_hang_log" | "phieu_xuat_kho_log",
  fkCol: string,
  id: string,
  exclude: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT DISTINCT nguoi_xu_ly FROM ${logTable} WHERE ${fkCol} = ? AND nguoi_xu_ly != ?`)
    .bind(id, exclude)
    .all<{ nguoi_xu_ly: string }>();
  return results.map((r) => r.nguoi_xu_ly);
}

type TaskCategory = "nhiem_vu" | "lien_quan" | "theo_doi";
const CATEGORY_LOAI: Record<TaskCategory, string> = { nhiem_vu: "viec_moi", lien_quan: "lien_quan", theo_doi: "theo_doi" };
const CATEGORY_PREF_COL: Record<TaskCategory, "nhan_tb_nhiem_vu" | "nhan_tb_lien_quan" | "nhan_tb_theo_doi"> = {
  nhiem_vu: "nhan_tb_nhiem_vu",
  lien_quan: "nhan_tb_lien_quan",
  theo_doi: "nhan_tb_theo_doi",
};

// Ghi 1 dong thong_bao_ktv/nguoi nhan LUON LUON (de xem lai duoc trong chuong du co tat push hay
// khong) - CHI goi sendPushToUser cho nguoi co cot nhan_tb_* tuong ung = 1 (1 truy van doc san
// nhan_tb_* cua ca danh sach, tranh N+1).
async function sendCategory(
  env: Env,
  db: D1Database,
  category: TaskCategory,
  emails: string[],
  title: string,
  body: string,
  linkType: "don_hang" | "phieu_xuat_kho",
  linkId: string,
): Promise<void> {
  if (emails.length === 0) return;
  const prefCol = CATEGORY_PREF_COL[category];
  const loai = CATEGORY_LOAI[category];
  // 1 bind JSON (D1 <= 100 tham so) - danh sach nguoi nhan thong bao co the > 100.
  const { results } = await db
    .prepare(`SELECT email, ${prefCol} as pref FROM users WHERE email IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(emails))
    .all<{ email: string; pref: number }>();
  const now = nowVN();
  await Promise.all(
    results.map(async (r) => {
      await db
        .prepare("INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(r.email, loai, body, linkType, linkId, now)
        .run();
      if (r.pref) await sendPushToUser(env, r.email, { title, body, url: "/" });
    }),
  );
}

export interface WorkflowNotifyOpts {
  // Nguoi/vai tro SAP PHAI xu ly buoc nay (loai 1) - da duoc caller resolve san (qua
  // emailsForRoleOrQC() cho truong hop broadcast theo vai tro, hoac 1 mang [email] cho truong hop
  // dinh danh nhu Tram/KTV chinh chu). Rong = buoc nay khong co ai "sap phai xu ly" ro rang (vd don
  // vua tao chi cho 1 minh Tram, khong co nguoi khac).
  cat1Emails: string[];
  // Cac vai tro CON LAI cung quy trinh (MUA_CONG_NO_ROLES/TRA_HANG_ROLES/PXK_ROLES, da tu TRU vai
  // tro dung lam cat1Emails o tren) - dung cho loai 2.
  otherRoles: (ViecMoiRoleCol | "qc")[];
  emailGsList: string[];
  // Nguoi tung xu ly CHINH entity nay (tu pastActorsFor(), da TRU nguoi vua thao tac) - dung cho
  // loai 3.
  pastActors: string[];
  title: string;
  body: string;
  linkType: "don_hang" | "phieu_xuat_kho";
  linkId: string;
}

/** Dispatcher dung chung cho MOI diem goi - tu phan loai 1 nguoi nhan vao DUNG 1 trong 3 loai (uu
 * tien 1 > 3 > 2: da o cat1 thi khong bao lai o cat2/cat3 cho cung 1 nguoi), roi goi sendCategory
 * rieng cho tung loai. Goi ham nay trong c.executionCtx.waitUntil(...) tai noi goi, khong await truc
 * tiep tren response chinh. */
export async function notifyWorkflowTask(env: Env, db: D1Database, opts: WorkflowNotifyOpts): Promise<void> {
  const cat1Set = new Set(opts.cat1Emails);

  const otherRoleLists = await Promise.all(opts.otherRoles.map((r) => emailsForRoleOrQC(db, r, opts.emailGsList)));
  const cat3Set = new Set(opts.pastActors.filter((e) => !cat1Set.has(e)));
  const cat2Set = new Set(otherRoleLists.flat().filter((e) => !cat1Set.has(e) && !cat3Set.has(e)));

  await Promise.all([
    sendCategory(env, db, "nhiem_vu", [...cat1Set], opts.title, opts.body, opts.linkType, opts.linkId),
    sendCategory(env, db, "theo_doi", [...cat3Set], opts.title, opts.body, opts.linkType, opts.linkId),
    sendCategory(env, db, "lien_quan", [...cat2Set], opts.title, opts.body, opts.linkType, opts.linkId),
  ]);
}

/** PXK khong co cot email_gs rieng (chi dat_don_hang moi co) - suy tu cac dong don hang da gop vao
 * PXK nay qua phieu_xuat_kho_dong, lay DISTINCT email_gs (khac null) - 1 PXK gop nhieu don co the co
 * nhieu GS khac nhau, emailsForRoleOrQC se hop nhat (OR) tap nguoi dung hop le cho tung GS. */
export async function emailGsListForPxk(db: D1Database, phieuXuatKhoId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT ddh.email_gs as email_gs FROM phieu_xuat_kho_dong pxkd
         JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
         WHERE pxkd.phieu_xuat_kho_id = ? AND ddh.email_gs IS NOT NULL`,
    )
    .bind(phieuXuatKhoId)
    .all<{ email_gs: string }>();
  return results.map((r) => r.email_gs);
}
