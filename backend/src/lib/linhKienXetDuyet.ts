import { nowVN } from "./vnTime";
import { taiTinhPxkMoCuaKtv } from "./pxkRecalculate";

// Luong "Linh kien moi cho xet duyet ma chuan" (2026-09-30, migration 0053). Nguoi co "Quan ly danh muc LK" tao LK
// moi (ma tu dat, co the dung/sai ma that) -> "Cho xet duyet"; nhan vien Mua hang (users.la_mua_hang) / Admin:
//   - Xac nhan (giu ma, co the sua ten)          - Doi ma A -> B (B chua co)     - Gop A vao ma co san
//   - Tu choi (chi khi khong con don dang mo)    - Gia tam (LK chua co tren gia88)
// gia88 keo ve dung ma dang cho -> "Tu dong duyet" (lib/gia88Sync.ts).
//
// DOI/GOP MA KHONG XOA dong A: A thanh "dong chuyen huong" ('Da doi ma', ma_chuan = B, bat_tat = 0, ngay_cap_nhat moi)
// vi cache danh muc tren may nguoi dung (FE linhKienCache.ts, tai tang dan theo ngay_cap_nhat) KHONG biet dong bi xoa
// -> xoa A thi may cu van cho chon A. Moi don/BOM/nhom thay the dang dung A chuyen sang B TRONG 1 BATCH (1 transaction
// D1); ma A gui len sau do (form dang mo, file import cu) duoc quyVeMaChuan() quy ve B.

export const TT_MA = {
  CHO: "Cho xet duyet",
  DA_XAC_NHAN: "Da xac nhan",
  TU_DONG: "Tu dong duyet",
  TU_CHOI: "Tu choi",
  DA_DOI: "Da doi ma",
} as const;

/** Trang thai LK dong bo sang DVBH/Sua chua (lib/dvbhSyncClient.ts) - LK dang cho/tu choi/dong chuyen huong KHONG day. */
export const LK_DONG_BO_DUOC_SQL = `trang_thai_ma IN ('${TT_MA.DA_XAC_NHAN}', '${TT_MA.TU_DONG}')`;

// Don con hieu luc (khong tinh don da tu choi/huy) - dung dem "don dang dung LK" + chan tu choi.
const DON_CON_HIEU_LUC_SQL = "trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')";

// Cot linh_kien chep sang ma moi khi doi ma A -> B (tru ma_linh_kien/ten/trang thai/ma_chuan/nguoi+ngay cap nhat).
const COT_CHEP = "gia_ban, don_vi, ghi_chu, anh_demo, bat_tat, dac_thu, chi_sua_chua, phan_loai_dac_thu, gia_tri_cong_no, gia_du_phong, gia_eu, don_vi_nhap, nhan_hang, thiet_bi, don_vi_tinh, ghi_chu_doi_tac, cam_ban, co_tren_gia88";

export interface LinhKienXetDuyetRow {
  ma_linh_kien: string;
  ten_linh_kien: string;
  trang_thai_ma: string;
  ma_chuan: string | null;
  don_vi: string | null; // "Phân loại" (bat buoc khi xac nhan, 2026-09-30)
  co_tren_gia88: number;
}

export async function docLk(db: D1Database, ma: string): Promise<LinhKienXetDuyetRow | null> {
  return db
    .prepare("SELECT ma_linh_kien, ten_linh_kien, trang_thai_ma, ma_chuan, co_tren_gia88, don_vi FROM linh_kien WHERE ma_linh_kien = ?")
    .bind(ma)
    .first<LinhKienXetDuyetRow>();
}

export function logLk(
  db: D1Database,
  a: { ma: string; hanhDong: string; maCu?: string | null; maMoi?: string | null; tenCu?: string | null; tenMoi?: string | null; ghiChu?: string | null; soDon?: number | null; nguoi: string | null },
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO linh_kien_log (ma_linh_kien, hanh_dong, ma_cu, ma_moi, ten_cu, ten_moi, ghi_chu, so_don, nguoi_thuc_hien, thoi_gian) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(a.ma, a.hanhDong, a.maCu ?? null, a.maMoi ?? null, a.tenCu ?? null, a.tenMoi ?? null, a.ghiChu ?? null, a.soDon ?? null, a.nguoi, nowVN());
}

/**
 * Quy cac ma LK ve ma chuan: ma da bi doi/gop (dong 'Da doi ma') -> ma_chuan. Ma khong doi / khong ton tai -> khong co
 * trong Map (giu nguyen). ma_chuan luon tro thang ma cuoi (chuyenMaLk cap nhat ca chuoi), van lap toi 5 buoc cho chac.
 */
export async function quyVeMaChuan(db: D1Database, mas: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let canTra = [...new Set(mas.map((m) => m.trim()).filter(Boolean))];
  const goc = new Map(canTra.map((m) => [m, m]));
  for (let buoc = 0; buoc < 5 && canTra.length; buoc++) {
    const { results } = await db
      .prepare("SELECT ma_linh_kien, ma_chuan FROM linh_kien WHERE ma_chuan IS NOT NULL AND ma_linh_kien IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(canTra))
      .all<{ ma_linh_kien: string; ma_chuan: string }>();
    if (!results.length) break;
    const tiep: string[] = [];
    for (const r of results) {
      for (const [g, hienTai] of goc) {
        if (hienTai === r.ma_linh_kien) {
          goc.set(g, r.ma_chuan);
          out.set(g, r.ma_chuan);
        }
      }
      tiep.push(r.ma_chuan);
    }
    canTra = tiep;
  }
  return out;
}

export async function demDonDungLk(db: D1Database, ma: string): Promise<{ tong: number; con_hieu_luc: number }> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS tong, COALESCE(SUM(CASE WHEN ${DON_CON_HIEU_LUC_SQL} THEN 1 ELSE 0 END), 0) AS con_hieu_luc FROM dat_don_hang WHERE ma_lk = ?`)
    .bind(ma)
    .first<{ tong: number; con_hieu_luc: number }>();
  return { tong: r?.tong ?? 0, con_hieu_luc: r?.con_hieu_luc ?? 0 };
}

/**
 * Tinh lai tien PXK dang tao + nhan chiet khau cua MOI KTV co don con hieu luc dung ma nay - gia don tinh theo gia
 * HIEN TAI trong danh muc (pxkRecalculate.ts) nen gop sang ma khac gia / doi gia tam la doi tien. Dung lai
 * taiTinhPxkMoCuaKtv() (khong viet cong thuc gia moi).
 */
export async function tinhLaiTienTheoLk(db: D1Database, ma: string, nguoi: string): Promise<void> {
  const { results } = await db
    .prepare(`SELECT DISTINCT nguoi_nhan_hang FROM dat_don_hang WHERE ma_lk = ? AND ${DON_CON_HIEU_LUC_SQL} AND nguoi_nhan_hang IS NOT NULL`)
    .bind(ma)
    .all<{ nguoi_nhan_hang: string }>();
  for (const r of results) await taiTinhPxkMoCuaKtv(db, r.nguoi_nhan_hang, nguoi);
}

/**
 * Doi ma A -> B (taoMoi: B chua co, tao B tu A voi ten moi) hoac gop A vao B co san (taoMoi = null). 1 batch:
 * tao B -> chuyen don/BOM/nhom thay the -> chuoi chuyen huong cu tro ve A doi sang B -> A thanh dong chuyen huong -> log.
 * Ten tren don (ten_lk_snapshot) cap nhat theo ten B (ten cu cua LK cho duyet chua chuan).
 */
export async function chuyenMaLk(
  db: D1Database,
  a: { maNguon: string; maDich: string; tenNguon: string; taoMoi: { ten: string } | null; hanhDong: "Doi ma" | "Gop ma"; ghiChu?: string | null; soDon: number; nguoi: string },
): Promise<void> {
  const now = nowVN();
  const { maNguon: A, maDich: B } = a;
  const stmts: D1PreparedStatement[] = [];
  if (a.taoMoi) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, ${COT_CHEP}, trang_thai_ma, ma_chuan, nguoi_cap_nhat, ngay_cap_nhat)
           SELECT ?, ?, ${COT_CHEP}, ?, NULL, ?, ? FROM linh_kien WHERE ma_linh_kien = ?`,
        )
        .bind(B, a.taoMoi.ten, TT_MA.DA_XAC_NHAN, a.nguoi, now, A),
    );
  }
  stmts.push(
    db.prepare("UPDATE dat_don_hang SET ma_lk = ?, ten_lk_snapshot = (SELECT ten_linh_kien FROM linh_kien WHERE ma_linh_kien = ?) WHERE ma_lk = ?").bind(B, B, A),
    db.prepare("UPDATE lk_bom SET ma_lk = ? WHERE ma_lk = ?").bind(B, A),
    // (nhom_id, ma_lk) la khoa chinh - B da nam trong cung nhom thi bo dong cua A.
    db.prepare("UPDATE OR IGNORE lk_nhom_thay_the_ct SET ma_lk = ? WHERE ma_lk = ?").bind(B, A),
    db.prepare("DELETE FROM lk_nhom_thay_the_ct WHERE ma_lk = ?").bind(A),
    // Thanh phan combo (migration 0066) - (ma_combo, ma_lk) la khoa chinh, B da co trong combo thi bo dong cua A.
    db.prepare("UPDATE OR IGNORE lk_combo_ct SET ma_lk = ? WHERE ma_lk = ?").bind(B, A),
    db.prepare("DELETE FROM lk_combo_ct WHERE ma_lk = ?").bind(A),
    db.prepare("UPDATE linh_kien SET ma_chuan = ? WHERE ma_chuan = ?").bind(B, A),
    db
      .prepare("UPDATE linh_kien SET trang_thai_ma = ?, ma_chuan = ?, bat_tat = 0, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?")
      .bind(TT_MA.DA_DOI, B, a.nguoi, now, A),
    logLk(db, { ma: A, hanhDong: a.hanhDong, maCu: A, maMoi: B, tenCu: a.tenNguon, tenMoi: a.taoMoi?.ten ?? null, ghiChu: a.ghiChu, soDon: a.soDon, nguoi: a.nguoi }),
  );
  if (a.taoMoi) stmts.push(logLk(db, { ma: B, hanhDong: "Xac nhan", maCu: A, maMoi: B, tenCu: a.tenNguon, tenMoi: a.taoMoi.ten, soDon: a.soDon, nguoi: a.nguoi }));
  else stmts.push(logLk(db, { ma: B, hanhDong: "Gop ma", maCu: A, maMoi: B, tenCu: a.tenNguon, ghiChu: a.ghiChu, soDon: a.soDon, nguoi: a.nguoi }));
  await db.batch(stmts);
}
