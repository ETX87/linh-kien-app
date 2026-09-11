// Tu dong gom don DA duoc tu dong duyet (xem lib/tonKhoCongTy.ts + routes/datMuaLinhKien.ts POST
// /phieu-dat) vao 1 Phieu xuat kho - phan hoi nguoi dung 2026-09-11: "tất cả các đơn được duyệt tự
// động được add vào ID phiếu và tính toán khoản tiền cần chuyển - bước TN add đơn đã duyệt vào
// phiếu". Lam THAY dung buoc TN thuong lam thu cong o PhieuXuatKhoTab.tsx ("+ Tạo phiếu xuất kho" ->
// chon dong -> nhap so tien -> Tao), nhung KHONG dong cham file routes/phieuXuatKho.ts (giu nguyen
// luong thu cong da on dinh, tranh rui ro hoi quy).
//
// Tim PXK dang o trang thai "Dang tao phieu" GAN NHAT cung (nguoi_nhan_hang, loai_don) de gop tiep
// vao - tranh moi don tu duyet lai tao rieng 1 PXK nho (1 KTV dat nhieu lan/ngay se don thanh 1 PXK
// duy nhat, dung y "TN gom don" tu nhien). Chua co PXK nao dang mo thi tao moi.
import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { nextSequentialId } from "./idCounter";
import { notifyWorkflowTask, emailGsListForPxk, PXK_ROLES } from "./taskNotify";

// Trung voi ham cung ten (khong export) trong routes/phieuXuatKho.ts - giu RIENG o day (khong import
// tu file routes) de lib/ khong phu thuoc nguoc vao routes/, dung quy uoc lop kien truc san co.
function pxkIdPrefix(loaiDon: "mua" | "cong_no"): "PMH" | "PCN" {
  return loaiDon === "mua" ? "PMH" : "PCN";
}

export interface AutoApprovedLine {
  donHangId: string;
  // gia_de_xuat x so_luong_de_xuat - CUNG cong thuc voi tongTienDaChon o PhieuXuatKhoTab.tsx (chi la
  // goi y mac dinh, TN van sua tay duoc khi thao tac thu cong - o day khong co nguoi sua nen dung
  // thang lam so tien chinh thuc).
  soTien: number;
}

export async function bundleAutoApprovedIntoPxk(
  env: Env,
  db: D1Database,
  actorEmail: string,
  nguoiNhanHang: string,
  loaiDon: "mua" | "cong_no",
  lines: AutoApprovedLine[],
): Promise<void> {
  if (lines.length === 0) return;
  const now = nowVN();
  const tongTienMoi = lines.reduce((s, l) => s + l.soTien, 0);

  const existing = await db
    .prepare(
      `SELECT id, ma_xuat_kho, so_tien_can_chuyen FROM phieu_xuat_kho
       WHERE nguoi_nhan_hang = ? AND loai_don = ? AND trang_thai_hien_tai = 'Dang tao phieu'
       ORDER BY ngay_tao DESC LIMIT 1`,
    )
    .bind(nguoiNhanHang, loaiDon)
    .first<{ id: string; ma_xuat_kho: string; so_tien_can_chuyen: number | null }>();

  const statements = [];
  let pxkId: string;
  let maXuatKho: string;
  const soTienTruoc = existing?.so_tien_can_chuyen ?? 0;

  if (existing) {
    pxkId = existing.id;
    maXuatKho = existing.ma_xuat_kho;
    const soTienMoiTong = soTienTruoc + tongTienMoi;
    statements.push(
      db
        .prepare(
          `UPDATE phieu_xuat_kho SET so_tien_can_chuyen = ?,
             trang_thai_chuyen_tien = CASE WHEN ? > 0 THEN COALESCE(trang_thai_chuyen_tien, 'Cho KTV chuyen') ELSE trang_thai_chuyen_tien END
           WHERE id = ?`,
        )
        .bind(soTienMoiTong, soTienMoiTong, pxkId),
    );
  } else {
    pxkId = await nextSequentialId(db, "phieu_xuat_kho", pxkIdPrefix(loaiDon), 6);
    maXuatKho = pxkId;
    const coChuyenTien = tongTienMoi > 0;
    statements.push(
      db
        .prepare(
          `INSERT INTO phieu_xuat_kho
             (id, ma_xuat_kho, ma_xuat_kho_xac_nhan, nguoi_tao, ngay_tao, ghi_chu, so_tien_can_chuyen, trang_thai_chuyen_tien, nguoi_nhan_hang, loai_don, trang_thai_hien_tai)
           VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(pxkId, maXuatKho, actorEmail, now, "Tự động gom các đơn đủ tồn kho, đã tự động duyệt", tongTienMoi, coChuyenTien ? "Cho KTV chuyen" : null, nguoiNhanHang, loaiDon, "Dang tao phieu"),
      db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly) VALUES (?, ?, ?, ?)").bind(pxkId, "Dang tao phieu", actorEmail, now),
    );
  }

  for (const l of lines) {
    statements.push(
      db.prepare("INSERT INTO phieu_xuat_kho_dong (phieu_xuat_kho_id, dat_don_hang_id) VALUES (?, ?)").bind(pxkId, l.donHangId),
      db.prepare("UPDATE dat_don_hang SET ma_xuat_kho = ?, updated_at = ? WHERE id = ?").bind(maXuatKho, now, l.donHangId),
    );
  }

  await db.batch(statements);

  // Chi bao KTV khi PXK vua CHUYEN sang "co tien can chuyen" (tu 0/chua co sang > 0) - tranh spam
  // thong bao lap lai moi lan gop them dong vao 1 PXK dang cho KTV chuyen tu truoc.
  const vuaCanChuyenTien = soTienTruoc <= 0 && tongTienMoi > 0;
  if (vuaCanChuyenTien) {
    const emailGsList = await emailGsListForPxk(db, pxkId);
    await notifyWorkflowTask(env, db, {
      cat1Emails: [nguoiNhanHang],
      otherRoles: PXK_ROLES,
      emailGsList,
      pastActors: [],
      title: "Phiếu xuất kho",
      body: `PXK ${pxkId} (tự động duyệt) cần bạn xác nhận thông tin chuyển tiền ${tongTienMoi.toLocaleString("vi-VN")}đ`,
      linkType: "phieu_xuat_kho",
      linkId: pxkId,
    });
  }
}
