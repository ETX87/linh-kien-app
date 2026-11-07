import { nowVN } from "./vnTime";
import { taiTinhPxk, tinhToanPxk } from "./pxkRecalculate";
import { canBangPxk, KE_TOAN_DA_CHOT_TIEN_SQL, lenhKhoaDaThanhToan } from "./quyKtv";

// KTV / nguoi tao TU HUY don tu duyet da tu gom vao PXK (chot nguoi dung 2026-09-28):
//   "cho phép ktv hoặc người tạo đơn tự hủy đơn của bản thân nếu đơn đó được hệ thống tự duyệt, tự đẩy vào
//    phiếu xk và chưa được kế toán xác nhận tiền về (hoặc TN tương tác vào phiếu) => nếu đơn đó là đơn duy
//    nhất của phiếu thì sẽ hủy luôn cả phiếu."
// Chot them: ca nguoi tao LAN KTV nhan hang deu huy duoc; "TN tuong tac" = MOI thao tac TAY cua van phong
// (TN/Kho/Ke toan/Admin) tren phieu (tinh lai tien TU DONG khong tinh); KTV da bao chuyen tien nhung Ke toan
// chua xac nhan van huy duoc (chi khoa khi trang_thai_chuyen_tien = 'TN da duyet' = Ke toan da duyet).
// Dau vet "van phong da thao tac": phieu_xuat_kho.van_phong_tac_dong_luc/_boi (migration 0036), ghi bang
// danhDauVanPhongTacDong() - middleware routes/phieuXuatKho.ts + PATCH /dat-mua-lk/don-hang/:id.

export function laVanPhong(user: { la_tac_nghiep?: number | boolean | null; la_kho?: number | boolean | null; la_ke_toan?: number | boolean | null; vai_tro?: string | null }): boolean {
  return !!(user.la_tac_nghiep || user.la_kho || user.la_ke_toan || user.vai_tro === "Admin");
}

export async function danhDauVanPhongTacDong(db: D1Database, pxkId: string, email: string): Promise<void> {
  await db
    .prepare(
      `UPDATE phieu_xuat_kho SET van_phong_tac_dong_luc = ?, van_phong_tac_dong_boi = ?
       WHERE id = ? AND van_phong_tac_dong_luc IS NULL`,
    )
    .bind(nowVN(), email, pxkId)
    .run();
}

/**
 * Dieu kien DON (khong gom kiem tra nguoi thao tac - la nguoi tao/nguoi nhan hang): tu duyet (dong log DAU
 * TIEN da la "TN da duyet" = POST /phieu-dat tu duyet), van "TN da duyet", nam trong PXK con "Dang tao phieu",
 * Ke toan chua duyet chuyen tien, van phong chua thao tac tay. Dung cho SELECT danh sach/chi tiet (cot
 * tu_huy_duoc) va kiem tra lai o applyDonHangLog.
 */
export const TU_HUY_DUOC_SQL = (alias: string) => `(
  ${alias}.trang_thai_hien_tai = 'TN da duyet' AND ${alias}.loai_don IN ('mua', 'cong_no')
  AND (SELECT l.trang_thai FROM dat_don_hang_log l WHERE l.dat_don_hang_id = ${alias}.id ORDER BY l.id ASC LIMIT 1) = 'TN da duyet'
  AND EXISTS (
    SELECT 1 FROM phieu_xuat_kho_dong tpd JOIN phieu_xuat_kho tp ON tp.id = tpd.phieu_xuat_kho_id
    WHERE tpd.dat_don_hang_id = ${alias}.id AND tp.trang_thai_hien_tai = 'Dang tao phieu'
      AND NOT ${KE_TOAN_DA_CHOT_TIEN_SQL("tp")} AND tp.van_phong_tac_dong_luc IS NULL
  )
)`;

/**
 * TN doi trang thai (Huy / Tu choi / Cho hang) don "TN da duyet" DA nam trong PXK (chot 2026-09-28, muc 5):
 * PXK con "Dang tao phieu" va Ke toan chua duyet chuyen tien (KTV da bao chuyen van doi duoc). Roi "TN da duyet"
 * -> don tu go khoi phieu (goDonKhoiPxk).
 */
export const TN_DOI_TRONG_PXK_SQL = (alias: string) => `(
  ${alias}.trang_thai_hien_tai = 'TN da duyet' AND ${alias}.loai_don IN ('mua', 'cong_no')
  AND EXISTS (
    SELECT 1 FROM phieu_xuat_kho_dong npd JOIN phieu_xuat_kho np ON np.id = npd.phieu_xuat_kho_id
    WHERE npd.dat_don_hang_id = ${alias}.id AND np.trang_thai_hien_tai = 'Dang tao phieu'
      AND NOT ${KE_TOAN_DA_CHOT_TIEN_SQL("np")}
  )
)`;

/**
 * GS khu vuc HUY HO don "TN da duyet" DA nam trong phieu (chot 2026-10-27, "Cho GS khả năng hủy đơn nếu phiếu chứa đơn đó chưa được kế
 * toán duyệt tiền hoặc chưa được kế toán duyệt phiếu (nếu không chuyển tiền)"): phieu "Dang tao phieu" + Ke toan chua chot tien (giong TN)
 * HOAC phieu KHONG can chuyen tien dang "Cho ke toan" (cho Ke toan chot) ma chua co Ma MISA. Don tu go khoi phieu (goDonKhoiPxk).
 */
export const GS_HUY_TRONG_PXK_SQL = (alias: string) => `(
  ${alias}.trang_thai_hien_tai = 'TN da duyet' AND ${alias}.loai_don IN ('mua', 'cong_no')
  AND EXISTS (
    SELECT 1 FROM phieu_xuat_kho_dong gpd JOIN phieu_xuat_kho gp ON gp.id = gpd.phieu_xuat_kho_id
    WHERE gpd.dat_don_hang_id = ${alias}.id AND (
      (gp.trang_thai_hien_tai = 'Dang tao phieu' AND NOT ${KE_TOAN_DA_CHOT_TIEN_SQL("gp")})
      OR (gp.trang_thai_hien_tai = 'Cho ke toan' AND gp.so_tien_can_chuyen IS NULL AND TRIM(COALESCE(gp.ma_misa, '')) = '')
    )
  )
)`;

export async function pxkGsHuyDuoc(db: D1Database, donHangId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT pd.phieu_xuat_kho_id as pxk_id FROM dat_don_hang ddh
       JOIN phieu_xuat_kho_dong pd ON pd.dat_don_hang_id = ddh.id
       JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id AND p.trang_thai_hien_tai != 'Ke toan huy'
       WHERE ddh.id = ? AND ${GS_HUY_TRONG_PXK_SQL("ddh")}`,
    )
    .bind(donHangId)
    .first<{ pxk_id: string }>();
  return row?.pxk_id ?? null;
}

/**
 * Mua hang day don ve "Cho hang" (chot 2026-10-27, "bổ sung nút chờ hàng cho vai trò mua hàng" + "đẩy đơn lại trạng thái chờ hàng cho nhân
 * viên mua hàng (nếu đơn chưa được kế toán duyệt phiếu)"): don Mua / Cong no (khong TRỪ CÔNG NỢ - ton KTV, khong don gui bu) dang "Cho TN
 * duyet" / "Cho thanh toan" / "TN da duyet", CHUA nam trong phieu nao da gui Ke toan (phieu "Dang tao phieu" thi don roi phieu mang theo tien).
 */
export const MUA_HANG_CHO_HANG_DUOC_SQL = (alias: string) => `(
  ${alias}.loai_don IN ('mua', 'cong_no') AND ${alias}.gui_bu_nhan_thieu_id IS NULL
  AND instr(COALESCE(${alias}.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') = 0
  AND ${alias}.trang_thai_hien_tai IN ('Cho TN duyet', 'Cho thanh toan', 'TN da duyet')
  AND NOT EXISTS (
    SELECT 1 FROM phieu_xuat_kho_dong mpd JOIN phieu_xuat_kho mp ON mp.id = mpd.phieu_xuat_kho_id
    WHERE mpd.dat_don_hang_id = ${alias}.id AND mp.trang_thai_hien_tai NOT IN ('Dang tao phieu', 'Ke toan huy')
  )
)`;

export async function pxkTnDoiDuoc(db: D1Database, donHangId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT pd.phieu_xuat_kho_id as pxk_id FROM dat_don_hang ddh
       JOIN phieu_xuat_kho_dong pd ON pd.dat_don_hang_id = ddh.id
       WHERE ddh.id = ? AND ${TN_DOI_TRONG_PXK_SQL("ddh")}`,
    )
    .bind(donHangId)
    .first<{ pxk_id: string }>();
  return row?.pxk_id ?? null;
}

export async function pxkDuocTuHuy(db: D1Database, donHangId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT pd.phieu_xuat_kho_id as pxk_id FROM dat_don_hang ddh
       JOIN phieu_xuat_kho_dong pd ON pd.dat_don_hang_id = ddh.id
       WHERE ddh.id = ? AND ${TU_HUY_DUOC_SQL("ddh")}`,
    )
    .bind(donHangId)
    .first<{ pxk_id: string }>();
  return row?.pxk_id ?? null;
}

/**
 * Sau khi don roi "TN da duyet" (applyDonHangLog - KTV tu huy, hoac TN huy/tu choi/cho hang): go don khoi PXK.
 * Don DUY NHAT cua phieu + `huyPhieuNeuTrong` -> huy luon phieu ("Ke toan huy" = "Đã huỷ"); `huyPhieuNeuTrong`
 * = false (TN thao tac TRONG man phieu, chot 2026-09-28) -> giu phieu trong, dong man phieu moi tu huy
 * (POST /phieu-xuat-kho/:id/huy-neu-trong). Con dong khac -> tinh lai CA phieu (giong TN bo dong).
 * `moTa` = mo ta thao tac ghi vao log PXK, vd "KTV tự hủy đơn".
 */
/** Don rời phieu MANG THEO tien cua dong (migration 0056): so tien = tien dong trong phieu (tinhToanPxk), toi da so phieu
 * da tra. Tra ve cac lenh (CAS da_thanh_toan + rut khoi phieu + ghi vao don) de them vao CUNG batch go dong. */
export async function lenhMangTienDon(
  db: D1Database, pxkId: string, donHangId: string,
): Promise<{ tien: number; lenh: D1PreparedStatement[] }> {
  const pxk = await db.prepare("SELECT da_thanh_toan, nguoi_nhan_hang FROM phieu_xuat_kho WHERE id = ?")
    .bind(pxkId)
    .first<{ da_thanh_toan: number | null; nguoi_nhan_hang: string | null }>();
  const daTra = pxk?.da_thanh_toan ?? 0;
  if (!pxk?.nguoi_nhan_hang || daTra <= 0) return { tien: 0, lenh: [] };
  const { results } = await db.prepare("SELECT dat_don_hang_id FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?")
    .bind(pxkId)
    .all<{ dat_don_hang_id: string }>();
  const tinh = await tinhToanPxk(db, results.map((r) => r.dat_don_hang_id));
  const tien = Math.min(Math.max(0, tinh.tienUocTinhTheoDong.get(donHangId) ?? 0), daTra);
  if (tien <= 0) return { tien: 0, lenh: [] };
  return {
    tien,
    lenh: [
      lenhKhoaDaThanhToan(db, pxkId, daTra),
      db.prepare("UPDATE phieu_xuat_kho SET da_thanh_toan = da_thanh_toan - ? WHERE id = ?").bind(tien, pxkId),
      db.prepare("UPDATE dat_don_hang SET tien_da_tra = tien_da_tra + ?, tien_da_tra_email = ?, tien_da_tra_pxk = ? WHERE id = ?")
        .bind(tien, pxk.nguoi_nhan_hang, pxkId, donHangId),
    ],
  };
}

/** PXK "Dang tao phieu" dang chua 1 don CHUA TN duyet (don can chuyen tien truoc, vao phieu tu luc tao - chot 2026-09-30). */
export async function pxkChuaDonChuaDuyet(db: D1Database, donHangId: string): Promise<string | null> {
  const row = await db.prepare(
    `SELECT d.phieu_xuat_kho_id as id FROM phieu_xuat_kho_dong d JOIN phieu_xuat_kho p ON p.id = d.phieu_xuat_kho_id
     WHERE d.dat_don_hang_id = ? AND p.trang_thai_hien_tai = 'Dang tao phieu' LIMIT 1`,
  ).bind(donHangId).first<{ id: string }>();
  return row?.id ?? null;
}

/** giuTien: don roi phieu mang theo tien cua dong (don chuyen "Cho hang" - chot 2026-09-30); false = tong phieu giam,
 * phan tra thua hoan ve quy nhu cu. */
export async function goDonKhoiPxk(
  db: D1Database, pxkId: string, donHangId: string, email: string, moTa: string, lyDo: string, huyPhieuNeuTrong = true,
  giuTien = false,
): Promise<{ huyPhieu: boolean; hoanQuy: number; tienMangTheo: number }> {
  const now = nowVN();
  const dem = await db.prepare("SELECT COUNT(*) as n FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?").bind(pxkId).first<{ n: number }>();
  const donRow = await db.prepare("SELECT ma_lk FROM dat_don_hang WHERE id = ?").bind(donHangId).first<{ ma_lk: string }>();
  const huyPhieu = huyPhieuNeuTrong && (dem?.n ?? 0) <= 1;
  const mang = giuTien ? await lenhMangTienDon(db, pxkId, donHangId) : { tien: 0, lenh: [] };
  const ghiTien = mang.tien > 0 ? ` — đơn giữ ${mang.tien.toLocaleString("vi-VN")}đ đã thanh toán` : "";
  await db.batch([
    ...mang.lenh,
    db.prepare("DELETE FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ? AND dat_don_hang_id = ?").bind(pxkId, donHangId),
    db.prepare("UPDATE dat_don_hang SET ma_xuat_kho = NULL, loai_chiet_khau_id = NULL, loai_chiet_khau_thu_cong = 0, updated_at = ? WHERE id = ?").bind(now, donHangId),
    huyPhieu
      ? db.prepare("UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'Ke toan huy', version = version + 1 WHERE id = ? AND trang_thai_hien_tai = 'Dang tao phieu'").bind(pxkId)
      : db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
          pxkId, "Da xoa don khoi phieu", email, now, `${moTa} ${donRow?.ma_lk ?? donHangId} (${donHangId})${lyDo ? `: ${lyDo}` : ""}${ghiTien}`,
        ),
    ...(huyPhieu
      ? [
          db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
            pxkId, "Ke toan huy", email, now, `Tự hủy phiếu — ${moTa.toLowerCase()} duy nhất của phiếu ${donHangId}${lyDo ? `: ${lyDo}` : ""}${ghiTien}`,
          ),
        ]
      : []),
  ]);
  if (!huyPhieu) {
    await taiTinhPxk(db, pxkId, true, true, email);
    return { huyPhieu, hoanQuy: 0, tienMangTheo: mang.tien };
  }
  const { hoan } = await canBangPxk(db, pxkId, email); // phieu huy -> hoan tien da tra (neu co) ve quy du
  return { huyPhieu, hoanQuy: hoan, tienMangTheo: mang.tien };
}

/** PXK "Dang tao phieu" khong con dong nao -> huy (dong man phieu trong - chot 2026-09-28, muc 3). Tra ve null neu
 * khong huy, nguoc lai so tien da hoan ve quy (0 neu phieu chua tra tien). */
export async function huyPxkNeuTrong(db: D1Database, pxkId: string, email: string, ghiChu?: string): Promise<{ hoanQuy: number } | null> {
  const res = await db
    .prepare(
      `UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'Ke toan huy', version = version + 1
       WHERE id = ? AND trang_thai_hien_tai = 'Dang tao phieu'
         AND NOT EXISTS (SELECT 1 FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?)`,
    )
    .bind(pxkId, pxkId)
    .run();
  if (!res.meta?.changes) return null;
  await db
    .prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Ke toan huy', ?, ?, ?)")
    .bind(pxkId, email, nowVN(), ghiChu ?? "Tự hủy phiếu trống (không còn đơn nào) khi đóng màn phiếu")
    .run();
  const { hoan } = await canBangPxk(db, pxkId, email); // hoan tien da tra (neu co) ve quy du
  return { hoanQuy: hoan };
}
