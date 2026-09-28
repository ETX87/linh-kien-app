import type { Context } from "hono";
import type { Env, AppUser } from "../types";

/**
 * "View" (them 2026-08-26, xac nhan cua nguoi dung: "view thấy theo khu vực được set") - CHI doc,
 * pham vi = tap KTV/Ve tinh co ktv_lien_he.khu_vuc_ma nam trong danh sach Khu vuc Admin gan cho
 * chinh tai khoan View do (bang user_khu_vuc - CUNG bang TN/Kho/Ke toan dang dung de "tim
 * kiem/thong ke", nhung voi View bang nay THAT SU gioi han du lieu xem duoc, khac y nghia cua
 * TN/Kho/Ke toan). Chua gan Khu vuc nao -> IN (SELECT...) rong -> khong thay gi (an toan mac dinh,
 * KHONG phai thay het). Dung chung 1 sql snippet o ca scopeDatMuaNguoiTao/scopePxkNguoiNhanHang va
 * GET /dat-mua-lk/thieu-lk (xem routes/datMuaLinhKien.ts) de tranh viet lap subquery 3 lan.
 */
export function khuVucViewEmailInSql(): string {
  return "(SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL AND khu_vuc_ma IN (SELECT khu_vuc_ma FROM user_khu_vuc WHERE user_email = ?))";
}

/**
 * Scope rieng cho module "Dat mua linh kien" - KHONG dung scopeByKhuVuc() (khu_vuc_phu_trach) vi
 * quyen xem o day phu thuoc vao QUAN HE nguoi dung (nguoi tao / Tram cha / GS quan ly) chu khong
 * theo khu vuc dia ly.
 *
 * CHOT 2026-08-15 (bo khai niem "phieu dat" khoi trai nghiem nguoi dung): whereSql gio doc THANG
 * tren dat_don_hang (alias BAT BUOC la "ddh" o FROM/JOIN cua caller) thay vi join qua phieu_dat -
 * xem migration 0075 (denormalize email_gs/nguoi_nhan_hang xuong dat_don_hang).
 *
 * - KTV/CTV thuong (la_ktv_dvbh, khong co Ve tinh nao tram_cha=email minh): don minh tao + don
 *   nguoi khac tao ho minh (ddh.nguoi_nhan_hang = email minh - Giai doan 4b, migration 0068).
 * - Tram (la_ktv_dvbh + co it nhat 1 Ve tinh voi tram_cha=email minh): don cua minh + don cua
 *   moi Ve tinh thuoc tram + don tao ho minh.
 * - Ve tinh (la_ve_tinh): don minh tao + don tao ho minh.
 * - GS (vai_tro='Giam sat'): don co dat_don_hang.email_gs = email minh (chi de theo doi, khong duyet).
 * - TN (la_tac_nghiep, doc lap khoi vai_tro - xem migration 0081), TBP (la_tp_dvbh, xac nhan linh
 *   kien dac thu - xem migration 0082), Kho (la_kho), Ke toan (la_ke_toan): xem toan bo (loc rieng
 *   theo buoc xu ly o tung endpoint, khong loc o day).
 */
export function scopeDatMuaNguoiTao(c: Context<{ Bindings: Env }>): { whereSql: string; binds: string[] } | null {
  const user = c.get("user");
  if (user.la_tac_nghiep || user.la_tp_dvbh || user.vai_tro === "Admin" || user.vai_tro === "QC" || user.la_kho || user.la_ke_toan) {
    return null; // khong gioi han - QC them vao buoc 1 ke hoach "Luong tao don mua hang" (nen tang cho luong tra hang QC xac nhan)
  }
  if (user.vai_tro === "Giam sat") {
    // + don CHINH GS tao (2026-09-28: GS dat duoc cho KTV ngoai khu vuc -> email_gs la GS khac).
    return { whereSql: " AND (ddh.email_gs = ? OR ddh.nguoi_tao = ?)", binds: [user.email, user.email] };
  }
  if (user.la_ktv_dvbh || user.la_ve_tinh) {
    return {
      whereSql: " AND (ddh.nguoi_tao = ? OR ddh.nguoi_nhan_hang = ? OR ddh.nguoi_tao IN (SELECT email FROM users WHERE tram_cha = ?))",
      binds: [user.email, user.email, user.email],
    };
  }
  if (user.la_view) {
    const emailIn = khuVucViewEmailInSql();
    return {
      whereSql: ` AND (ddh.nguoi_tao IN ${emailIn} OR ddh.nguoi_nhan_hang IN ${emailIn})`,
      binds: [user.email, user.email],
    };
  }
  return { whereSql: " AND 1=0", binds: [] };
}

/**
 * RA SOAT BAO MAT 2026-08-18 (phan hoi Codex): scope rieng cho phieu_xuat_kho (alias BAT BUOC la
 * "pxk") - truoc day GET /phieu-xuat-kho va GET /phieu-xuat-kho/:id hoan toan khong loc, moi nguoi
 * trong module (ke ca 1 KTV) xem duoc gia/cong no/ma MISA/bang chung chuyen tien cua TOAN BO PXK he
 * thong. Dung cung nguyen tac quan he nhu scopeDatMuaNguoiTao() nhung doc truc tiep tren cot
 * pxk.nguoi_nhan_hang (phieu_xuat_kho khong co nguoi_tao/email_gs rieng nhu dat_don_hang).
 * la_tp_dvbh KHONG nam trong tap unrestricted (buoc "TBP xac nhan dac thu" xay ra TRUOC khi co PXK,
 * khong co quan he truc tiep voi phieu_xuat_kho) - se roi vao nhanh "tra ve 1=0" o cuoi neu ho khong
 * dong thoi co 1 co khac (vd la_ktv_dvbh).
 */
export function scopePxkNguoiNhanHang(c: Context<{ Bindings: Env }>): { whereSql: string; binds: string[] } | null {
  const user = c.get("user");
  if (user.la_tac_nghiep || user.la_kho || user.la_ke_toan || user.vai_tro === "Admin" || user.vai_tro === "QC") {
    return null; // khong gioi han
  }
  if (user.vai_tro === "Giam sat") {
    return { whereSql: " AND pxk.nguoi_nhan_hang IN (SELECT email FROM users WHERE giam_sat_quan_ly = ?)", binds: [user.email] };
  }
  if (user.la_ktv_dvbh || user.la_ve_tinh) {
    return {
      whereSql: " AND (pxk.nguoi_nhan_hang = ? OR pxk.nguoi_nhan_hang IN (SELECT email FROM users WHERE tram_cha = ?))",
      binds: [user.email, user.email],
    };
  }
  if (user.la_view) {
    return { whereSql: ` AND pxk.nguoi_nhan_hang IN ${khuVucViewEmailInSql()}`, binds: [user.email] };
  }
  return { whereSql: " AND 1=0", binds: [] };
}

/**
 * "Khu vuc phu trach" (Giam sat) cho TN/Kho/Ke toan - scope MEM, chi dung cho badge/thong ke, KHONG
 * dung de gioi han danh sach/tim kiem (xem migration 0073). Tra null neu nguoi dung chua duoc Admin
 * gan khu vuc nao (0 dong) = che do khong gioi han nhu truoc gio; khac null tra Set email GS ma
 * nguoi dung nay dang phu trach.
 */
export async function phuTrachGsSet(db: D1Database, email: string): Promise<Set<string> | null> {
  const rows = await db
    .prepare("SELECT giam_sat_email FROM dat_mua_lk_phu_trach_gs WHERE nguoi_phu_trach = ?")
    .bind(email)
    .all<{ giam_sat_email: string }>();
  if (!rows.results || rows.results.length === 0) return null;
  return new Set(rows.results.map((r) => r.giam_sat_email));
}

/**
 * Tu dong gan them 1 Giam sat vao khu vuc phu trach cua nguoi dung khi ho xu ly 1 don ngoai khu vuc
 * hien tai - CHI kich hoat neu nguoi dung DA o che do gioi han (>=1 dong gan sẵn), tranh ep nguoi
 * chua duoc Admin cau hinh gi vao che do gioi han ngoai y muon.
 */
export async function autoClaimGs(db: D1Database, nguoiPhuTrach: string, emailGs: string | null): Promise<void> {
  if (!emailGs) return;
  const current = await phuTrachGsSet(db, nguoiPhuTrach);
  if (current === null) return; // chua o che do gioi han - khong lam gi
  if (current.has(emailGs)) return;
  await db
    .prepare(
      "INSERT OR IGNORE INTO dat_mua_lk_phu_trach_gs (nguoi_phu_trach, giam_sat_email, tu_dong_gan) VALUES (?, ?, 1)"
    )
    .bind(nguoiPhuTrach, emailGs)
    .run();
}

/**
 * "Khu vuc cua toi" (dia ly, bang khu_vuc/user_khu_vuc) cho GS/TN/Kho/Ke toan - tra Set ma Khu vuc gan
 * cho CHINH tai khoan dang goi. KHAC phuTrachGsSet o tren (chi anh huong badge, KHONG anh huong
 * list/search) - Khu vuc dia ly nay ANH HUONG CA HAI: dung lam (1) gia tri MAC DINH cho bo loc Khu vuc
 * UI (xem GET /khu-vuc-cua-toi, tai su dung DUNG query o day) va (2) dieu kien loc them cho cac badge
 * dem theo vai tro (GET /loai-don-counts, GET /phieu-xuat-kho/mo-count) - de badge/danh sach mac dinh
 * luon khop nhau (xac nhan nguoi dung 2026-08-31, phan hoi "Mua hang (1) nhung danh sach rong"/kiem tra
 * dong bo toan he thong). Tra null neu vai tro khac hoac chua duoc gan Khu vuc nao (= khong gioi han,
 * giu hanh vi "toan quoc" nhu truoc).
 */
export async function khuVucCuaToiSet(db: D1Database, user: Pick<AppUser, "email" | "vai_tro" | "la_tac_nghiep" | "la_kho" | "la_ke_toan">): Promise<Set<string> | null> {
  if (user.vai_tro === "Giam sat") {
    const rows = await db.prepare("SELECT ma FROM khu_vuc WHERE gs_email = ?").bind(user.email).all<{ ma: string }>();
    if (!rows.results || rows.results.length === 0) return null;
    return new Set(rows.results.map((r) => r.ma));
  }
  if (user.la_tac_nghiep || user.la_kho || user.la_ke_toan) {
    const rows = await db
      .prepare("SELECT kv.ma FROM user_khu_vuc uk JOIN khu_vuc kv ON kv.ma = uk.khu_vuc_ma WHERE uk.user_email = ?")
      .bind(user.email)
      .all<{ ma: string }>();
    if (!rows.results || rows.results.length === 0) return null;
    return new Set(rows.results.map((r) => r.ma));
  }
  return null;
}

/**
 * Sinh dieu kien " AND (col1 IN (email thuoc Khu vuc) OR col2 IN (...))" tu 1 Set ma Khu vuc (khac
 * rong) - tra ve email cac KTV/Ve tinh thuoc cac Khu vuc do (join qua ktv_lien_he.khu_vuc_ma). Dung
 * chung cho moi noi can ap dung khuVucCuaToiSet len 1 hoac nhieu cot email (vd ddh.nguoi_tao +
 * ddh.nguoi_nhan_hang, hoac chi pxk.nguoi_nhan_hang).
 */
export function khuVucSetWhereSql(khuVucSet: Set<string>, emailCols: string[]): { sql: string; binds: string[] } {
  const list = [...khuVucSet];
  const emailInKhuVuc = `(SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL AND khu_vuc_ma IN (${list.map(() => "?").join(",")}))`;
  const binds: string[] = [];
  const conds = emailCols.map((col) => {
    binds.push(...list);
    return `${col} IN ${emailInKhuVuc}`;
  });
  return { sql: ` AND (${conds.join(" OR ")})`, binds };
}
