// Tu dong gom don DA duoc tu dong duyet (xem lib/tonKhoCongTy.ts + routes/datMuaLinhKien.ts POST
// /phieu-dat) vao 1 Phieu xuat kho - phan hoi nguoi dung 2026-09-11: "tất cả các đơn được duyệt tự
// động được add vào ID phiếu và tính toán khoản tiền cần chuyển - bước TN add đơn đã duyệt vào
// phiếu". Lam THAY dung buoc TN thuong lam thu cong o PhieuXuatKhoTab.tsx ("+ Tạo phiếu xuất kho" ->
// chon dong -> nhap so tien -> Tao), nhung KHONG dong cham file routes/phieuXuatKho.ts (giu nguyen
// luong thu cong da on dinh, tranh rui ro hoi quy).
//
// Tim PXK dang o trang thai "Dang tao phieu" GAN NHAT cung (nguoi_nhan_hang, loai_don) de gop tiep
// vao - tranh moi don tu duyet lai tao rieng 1 PXK nho (1 KTV dat nhieu lan/ngay se don thanh 1 PXK
// duy nhat, dung y "TN gom don" tu nhien). Chua co PXK nao dang mo thi tao moi. Gop ca vao phieu KTV da nop
// bang chung (chot 2026-09-29: KHONG tach phieu) - tong doi thi bang chung cu duoc GIU, KTV chuyen bo sung +
// tai them anh (toi da 5, xem PATCH /phieu-xuat-kho/:id/chuyen-tien).
// MO RONG 2026-09-30: gom ca don Mua / TRỪ CÔNG NỢ co tien > 0 CHUA duoc tu dong duyet (bat_buoc_chuyen_tien - yeu cau KTV
// chuyen tien truoc; "Gửi kế toán" chan phieu con don chua TN duyet). KHONG gop vao phieu Ke toan da duyet tien ('TN da
// duyet') hay da co ma MISA -> tao phieu moi (chot nguoi dung).
import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { nextSequentialId } from "./idCounter";
import { notifyWorkflowTask, emailGsListForPxk, PXK_ROLES } from "./taskNotify";
import { taiTinhPxk } from "./pxkRecalculate";
import { lenhNhanTienDaTraDon, moTaCanChuyen, tienPhieuVaQuy } from "./quyKtv";

// Trung voi ham cung ten (khong export) trong routes/phieuXuatKho.ts - giu RIENG o day (khong import
// tu file routes) de lib/ khong phu thuoc nguoc vao routes/, dung quy uoc lop kien truc san co.
// + "tra_hang" -> PTL (2026-10-14: QC dong y don tra hang -> tu vao phieu tra hang, bo buoc TN duyet tong).
function pxkIdPrefix(loaiDon: "mua" | "cong_no" | "tra_hang"): "PMH" | "PCN" | "PTL" {
  return loaiDon === "mua" ? "PMH" : loaiDon === "cong_no" ? "PCN" : "PTL";
}

export interface AutoApprovedLine {
  donHangId: string;
  // Khong con dung de tinh tien (tong PXK do taiTinhPxk tinh lai tu toan bo dong, xem
  // lib/pxkRecalculate.ts) - giu field de khong phai sua cac cho goi.
  soTien: number;
}

export async function bundleAutoApprovedIntoPxk(
  env: Env,
  db: D1Database,
  actorEmail: string,
  nguoiNhanHang: string,
  loaiDon: "mua" | "cong_no" | "tra_hang",
  lines: AutoApprovedLine[],
): Promise<string | null> {
  if (lines.length === 0) return null;
  // Don da duoc chon khu vuc xu ly rieng (dat_don_hang.khu_vuc_chon - PATCH /dat-mua-lk/don-hang/:id/khu-vuc, 2026-10-15) di vao
  // phieu CUNG khu vuc chon (phieu mang theo khu_vuc_chon de Kho/Ke toan/TN khu vuc do thay ca phieu) - tach nhom theo khu vuc chon.
  // + thong tin de ghi LY DO vao lich su phieu (2026-10-23, "lịch xử xử lý của phiếu hiện tại chưa rõ ràng lý do phiếu được tạo"):
  // trang thai don + ghi chu log don MOI NHAT (ly do tu dong: du hang / hang ve / doi khu vuc / thanh toan sau...).
  const { results: kvDon } = await db
    .prepare(
      `SELECT d.id, d.khu_vuc_chon, d.ma_lk, d.ten_lk_snapshot, d.so_luong_de_xuat, d.trang_thai_hien_tai,
              (SELECT l.ghi_chu FROM dat_don_hang_log l WHERE l.dat_don_hang_id = d.id ORDER BY l.id DESC LIMIT 1) AS ghi_chu_log
       FROM dat_don_hang d WHERE d.id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(lines.map((l) => l.donHangId)))
    .all<DonVaoPhieu>();
  const donTheoId = new Map(kvDon.map((r) => [r.id, r]));
  const nhom = new Map<string | null, AutoApprovedLine[]>();
  for (const l of lines) {
    const kv = donTheoId.get(l.donHangId)?.khu_vuc_chon ?? null;
    nhom.set(kv, [...(nhom.get(kv) ?? []), l]);
  }
  let pxkCuoi: string | null = null;
  for (const [kvChon, dong] of nhom) {
    const lyDo = dong.map((l) => moTaDonVaoPhieu(donTheoId.get(l.donHangId), l.donHangId, loaiDon)).join("\n");
    pxkCuoi = await gomMotNhom(env, db, actorEmail, nguoiNhanHang, loaiDon, dong, kvChon, lyDo);
  }
  return pxkCuoi;
}

interface DonVaoPhieu {
  id: string; khu_vuc_chon: string | null; ma_lk: string | null; ten_lk_snapshot: string | null; so_luong_de_xuat: number | null;
  trang_thai_hien_tai: string | null; ghi_chu_log: string | null;
}

const TRANG_THAI_CHO: Record<string, string> = {
  "Cho TN duyet": "chờ Tác nghiệp duyệt", "Cho TBP xac nhan": "chờ TBP xác nhận", "Cho GS duyet": "chờ GS duyệt", "Cho tram duyet": "chờ Trạm duyệt",
};

/** 1 dong giai thich vi sao don vao phieu: "Đơn DDH-… (ma · ten xSL) <theo trang thai> — <ly do tu dong moi nhat cua don>". */
function moTaDonVaoPhieu(d: DonVaoPhieu | undefined, id: string, loaiDon: "mua" | "cong_no" | "tra_hang"): string {
  if (!d) return `Đơn ${id}`;
  const tt = d.trang_thai_hien_tai ?? "";
  const vi =
    loaiDon === "tra_hang" ? "QC đã đồng ý trả hàng"
    : tt === "TN da duyet" ? "đã duyệt, chờ xuất kho"
    : tt === "Cho thanh toan" ? (d.ghi_chu_log ? "chờ chuyển tiền" : "chờ chuyển tiền (kho thiếu hàng — Kế toán xác nhận tiền xong hệ thống xét lại tồn kho)")
    : `${TRANG_THAI_CHO[tt] ?? tt} — cần chuyển tiền trước khi duyệt`;
  const logDong = (d.ghi_chu_log ?? "").split("\n")[0].replace(/^Tự động:\s*/, "").trim();
  return `Đơn ${id} (${d.ma_lk ?? ""}${d.ten_lk_snapshot ? ` · ${d.ten_lk_snapshot}` : ""} x${d.so_luong_de_xuat ?? "?"}) ${vi}${logDong ? ` — ${logDong.slice(0, 220)}` : ""}`;
}

async function gomMotNhom(
  env: Env,
  db: D1Database,
  actorEmail: string,
  nguoiNhanHang: string,
  loaiDon: "mua" | "cong_no" | "tra_hang",
  lines: AutoApprovedLine[],
  kvChon: string | null,
  lyDo: string,
): Promise<string> {
  const now = nowVN();

  const existing = await db
    .prepare(
      `SELECT id, ma_xuat_kho, so_tien_can_chuyen FROM phieu_xuat_kho
       WHERE nguoi_nhan_hang = ? AND loai_don = ? AND trang_thai_hien_tai = 'Dang tao phieu'
         AND COALESCE(trang_thai_chuyen_tien, '') != 'TN da duyet' AND COALESCE(TRIM(ma_misa), '') = ''
         AND khu_vuc_chon IS ?
       ORDER BY ngay_tao DESC LIMIT 1`,
    )
    .bind(nguoiNhanHang, loaiDon, kvChon)
    .first<{ id: string; ma_xuat_kho: string; so_tien_can_chuyen: number | null }>();

  const statements = [];
  let pxkId: string;
  let maXuatKho: string;
  const soTienTruoc = existing?.so_tien_can_chuyen ?? 0;

  if (existing) {
    pxkId = existing.id;
    maXuatKho = existing.ma_xuat_kho;
    // Tong tien KHONG cong don o day - taiTinhPxk ben duoi so tong cu (soTienTruoc) voi tong tinh lai
    // tu toan bo dong, doi -> reset trang thai chuyen tien giong luong them dong thu cong.
    statements.push(
      db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
        pxkId, "Da them don vao phieu", actorEmail, now, `Hệ thống tự gom vào phiếu đang tạo:\n${lyDo}`.slice(0, 2000),
      ),
    );
  } else {
    pxkId = await nextSequentialId(db, "phieu_xuat_kho", pxkIdPrefix(loaiDon), 6);
    maXuatKho = pxkId;
    statements.push(
      db
        .prepare(
          `INSERT INTO phieu_xuat_kho
             (id, ma_xuat_kho, ma_xuat_kho_xac_nhan, nguoi_tao, ngay_tao, ghi_chu, so_tien_can_chuyen, trang_thai_chuyen_tien, nguoi_nhan_hang, loai_don, trang_thai_hien_tai, khu_vuc_chon)
           VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(pxkId, maXuatKho, actorEmail, now, loaiDon === "tra_hang" ? "Tự động gom đơn trả hàng QC đã đồng ý" : "Tự động gom đơn mới (đơn tự động duyệt + đơn cần chuyển tiền trước)", null, null, nguoiNhanHang, loaiDon, "Dang tao phieu", kvChon),
      db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
        pxkId, "Dang tao phieu", actorEmail, now, `Hệ thống tự tạo phiếu để gom ${lines.length > 1 ? `${lines.length} đơn` : "đơn"}:\n${lyDo}`.slice(0, 2000),
      ),
    );
  }

  for (const l of lines) {
    statements.push(
      db.prepare("INSERT INTO phieu_xuat_kho_dong (phieu_xuat_kho_id, dat_don_hang_id) VALUES (?, ?)").bind(pxkId, l.donHangId),
      db.prepare("UPDATE dat_don_hang SET ma_xuat_kho = ?, updated_at = ? WHERE id = ?").bind(maXuatKho, now, l.donHangId),
      ...lenhNhanTienDaTraDon(db, pxkId, l.donHangId, actorEmail, now),
    );
  }

  await db.batch(statements);
  const ketQuaTaiTinh = await taiTinhPxk(db, pxkId, true, true, existing ? actorEmail : undefined, actorEmail);

  // Chi bao KTV khi PXK vua CHUYEN sang "co tien can chuyen" (tu 0/chua co sang > 0) - tranh spam
  // thong bao lap lai moi lan gop them dong vao 1 PXK dang cho KTV chuyen tu truoc.
  const vuaCanChuyenTien = soTienTruoc <= 0 && ketQuaTaiTinh.total > 0;
  if (vuaCanChuyenTien) {
    const emailGsList = await emailGsListForPxk(db, pxkId);
    await notifyWorkflowTask(env, db, {
      cat1Emails: [nguoiNhanHang],
      otherRoles: PXK_ROLES,
      emailGsList,
      pastActors: [],
      title: "Phiếu xuất kho",
      body: `(Đơn mới) ${moTaCanChuyen(pxkId, await tienPhieuVaQuy(db, pxkId))}`,
      linkType: "phieu_xuat_kho",
      linkId: pxkId,
    });
  }
  return pxkId;
}
