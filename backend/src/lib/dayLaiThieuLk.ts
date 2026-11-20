// "ĐẨY LẠI TICKET" thiếu hàng (chốt 2026-10-16, phản hồi "ý tôi là đẩy ticket lại trạng thái trước khi bị từ chối => đơn gốc cũng đẩy
// ngược lại theo ticket" - vd TLK-000317 Kho từ chối nhầm -> DDH-002653 tự hủy). Khác "đẩy lại đơn" (POST /don-hang/:id/day-lai, đơn về
// "Cho TN duyet"): ở đây PHỤC HỒI nguyên trạng trước lúc bị từ chối / hủy:
//  - ticket: ghi thêm 1 log = trạng thái MỞ cuối cùng trước khi đóng ('Cho kho xu ly' / 'Kho da tiep nhan' / 'Kho da cap nhat'; trạng thái
//    ticket = log mới nhất nên không sửa log cũ, lịch sử giữ nguyên);
//  - đơn gốc: 'Da huy' -> 'Cho hang' (log mới);
//  - tiền: lúc hủy, trigger trg_ddh_hoan_tien_da_tra đã hoàn tien_da_tra của đơn về quỹ người nhận (giao dịch 'hoan_phieu' ghi chú
//    "Hoàn tiền đã thanh toán của đơn <id> (…"). Đẩy lại = rút lại đúng số đó từ quỹ gắn vào đơn (tối đa số dư quỹ hiện có - phần quỹ
//    đã tự trả phiếu khác thì không rút được, đơn thiếu phần đó sẽ trả khi vào phiếu).
// Điều kiện (hanDayLaiTicketSql - dùng CHUNG cho cột hiển thị nút và lúc ghi): ticket đang 'Da huy bo' + là ticket MỚI NHẤT của đơn + có
// trạng thái mở trước đó; đơn đang 'Da huy' (không phải trả hàng), log hủy ngay sau 'Cho hang', người hủy KHÔNG phải chính người tạo /
// người nhận hàng (trừ TN/Kế toán/Admin - cùng quy tắc dayLaiHanSql); trong 24h kể từ lúc ticket đóng. Không báo sang khovan (như mọi
// đường đóng/mở ticket từ app).
import { khoaQuy } from "./quyKhoa";
import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { lenhGhiQuy, soDuQuy } from "./quyKtv";
import { taiTinhPxkMoCuaKtv } from "./pxkRecalculate";
import { baoNguoiTaoDon } from "./tuDongDuyet";

// + 2 trang thai Mua hang (2026-10-19, migration 0093).
const TRANG_THAI_MO = ["Cho kho xu ly", "Kho da tiep nhan", "Kho da cap nhat", "Cho mua hang", "Mua hang da dat"] as const;

/** Hạn đẩy lại ticket (giờ VN) hoặc NULL = không đẩy lại được. `t` = alias bảng thieu_lk. */
export function hanDayLaiTicketSql(t: string): string {
  const logTk = `(SELECT MAX(id) FROM thieu_lk_log WHERE thieu_lk_id = ${t}.id)`;
  return `(CASE WHEN (SELECT trang_thai FROM thieu_lk_log WHERE id = ${logTk}) = 'Da huy bo'
      AND NOT EXISTS (SELECT 1 FROM thieu_lk t2 WHERE t2.dat_don_hang_id = ${t}.dat_don_hang_id AND t2.id > ${t}.id)
      AND EXISTS (SELECT 1 FROM thieu_lk_log o WHERE o.thieu_lk_id = ${t}.id AND o.trang_thai IN ('Cho kho xu ly', 'Kho da tiep nhan', 'Kho da cap nhat', 'Cho mua hang', 'Mua hang da dat'))
      AND EXISTS (
        SELECT 1 FROM dat_don_hang d
        JOIN dat_don_hang_log l ON l.id = (SELECT MAX(id) FROM dat_don_hang_log WHERE dat_don_hang_id = d.id)
        JOIN users u ON u.email = l.nguoi_xu_ly
        WHERE d.id = ${t}.dat_don_hang_id AND d.loai_don != 'tra_hang' AND d.trang_thai_hien_tai = 'Da huy' AND l.trang_thai = 'Da huy'
          AND (SELECT l2.trang_thai FROM dat_don_hang_log l2 WHERE l2.dat_don_hang_id = d.id AND l2.id < l.id ORDER BY l2.id DESC LIMIT 1) = 'Cho hang'
          AND (u.la_tac_nghiep = 1 OR u.la_ke_toan = 1 OR u.vai_tro = 'Admin' OR (u.email != d.nguoi_tao AND u.email != COALESCE(d.nguoi_nhan_hang, ''))))
    THEN datetime((SELECT ngay_xu_ly FROM thieu_lk_log WHERE id = ${logTk}), '+24 hours') END)`;
}

/** Trạng thái ticket sẽ được phục hồi (trạng thái mở cuối cùng). `t` = alias bảng thieu_lk. */
export function trangThaiTruocTicketSql(t: string): string {
  return `(SELECT o.trang_thai FROM thieu_lk_log o WHERE o.thieu_lk_id = ${t}.id AND o.trang_thai IN ('Cho kho xu ly', 'Kho da tiep nhan', 'Kho da cap nhat', 'Cho mua hang', 'Mua hang da dat') ORDER BY o.id DESC LIMIT 1)`;
}

/** Ticket mới nhất của đơn có đẩy lại được không (để POST /don-hang/:id/day-lai chuyển sang phục hồi theo ticket). */
// boQuaHan (2026-11-20, v1.541 - "cho phép admin đẩy lại không giới hạn 24h"): Admin đẩy lại được cả khi đã quá 24h.
export async function ticketDayLaiCuaDon(db: D1Database, donHangId: string, boQuaHan = false): Promise<string | null> {
  const r = await db
    .prepare(`SELECT t.id, ${hanDayLaiTicketSql("t")} as han, ? as bay_gio FROM thieu_lk t WHERE t.dat_don_hang_id = ? ORDER BY t.id DESC LIMIT 1`)
    .bind(nowVN(), donHangId)
    .first<{ id: string; han: string | null; bay_gio: string }>();
  return r && r.han && (boQuaHan || r.han >= r.bay_gio) ? r.id : null;
}

export type KetQuaDayLaiTicket =
  | { ok: true; donHangId: string; trangThaiTicket: string; tienLayLai: number; tienHoan: number }
  | { error: string; status: 404 | 409; han?: string; pxk?: string };

export async function dayLaiTicketThieuLk(
  env: Env, db: D1Database, ticketId: string, nguoi: string, ghiChuNguoiDung?: string, opts: { boQuaHan?: boolean } = {},
): Promise<KetQuaDayLaiTicket> {
  const now = nowVN();
  const tk = await db
    .prepare(
      `SELECT t.id, t.dat_don_hang_id, ${hanDayLaiTicketSql("t")} as han, ${trangThaiTruocTicketSql("t")} as trang_thai_truoc,
              (SELECT MAX(id) FROM thieu_lk_log WHERE thieu_lk_id = t.id) as log_tk_id,
              d.version, d.nguoi_tao, d.nguoi_nhan_hang, COALESCE(d.kh_chuyen_khoan, 0) AS kh_chuyen_khoan, d.ten_lk_snapshot, d.so_luong_de_xuat, d.loai_don, d.trang_thai_hien_tai as trang_thai_don,
              (SELECT ngay_xu_ly FROM dat_don_hang_log WHERE id = (SELECT MAX(id) FROM dat_don_hang_log WHERE dat_don_hang_id = d.id)) as huy_luc,
              (SELECT bi_khoa FROM users WHERE email = d.nguoi_nhan_hang) as nhan_bi_khoa
       FROM thieu_lk t JOIN dat_don_hang d ON d.id = t.dat_don_hang_id WHERE t.id = ?`,
    )
    .bind(ticketId)
    .first<{
      id: string; dat_don_hang_id: string; han: string | null; trang_thai_truoc: string | null; log_tk_id: number;
      version: number; nguoi_tao: string; nguoi_nhan_hang: string | null; kh_chuyen_khoan: number; ten_lk_snapshot: string; so_luong_de_xuat: number;
      loai_don: string; trang_thai_don: string; huy_luc: string | null; nhan_bi_khoa: number | null;
    }>();
  if (!tk) return { error: "NOT_FOUND", status: 404 };
  if (!tk.han || !tk.trang_thai_truoc || !(TRANG_THAI_MO as readonly string[]).includes(tk.trang_thai_truoc)) {
    return { error: "TICKET_KHONG_DAY_LAI_DUOC", status: 409 };
  }
  const quaHan = tk.han < now;
  if (quaHan && !opts.boQuaHan) return { error: "QUA_24H_KHONG_DAY_LAI", status: 409, han: tk.han };
  if (tk.nhan_bi_khoa) return { error: "NGUOI_NHAN_HANG_DA_TAT", status: 409 };
  const conPhieu = await db
    .prepare(
      `SELECT p.id FROM phieu_xuat_kho_dong x JOIN phieu_xuat_kho p ON p.id = x.phieu_xuat_kho_id
       WHERE x.dat_don_hang_id = ? AND p.trang_thai_hien_tai != 'Ke toan huy' LIMIT 1`,
    )
    .bind(tk.dat_don_hang_id)
    .first<{ id: string }>();
  if (conPhieu) return { error: "DON_CON_TRONG_PHIEU", status: 409, pxk: conPhieu.id };

  // Quỹ của đơn: quỹ KTV hoặc "Quỹ KH chuyển khoản" (migration 0111) - trigger hoàn tiền đã trả về đúng quỹ này.
  const quyDon = tk.nguoi_nhan_hang ? khoaQuy(tk.nguoi_nhan_hang, tk.kh_chuyen_khoan) : null;
  // Số tiền trigger đã hoàn về quỹ lúc đơn bị hủy (giao dịch SAU lúc hủy, đúng mã đơn).
  const hoan = quyDon && tk.huy_luc
    ? await db
        .prepare(
          `SELECT so_tien, phieu_xuat_kho_id FROM quy_ktv_giao_dich
           WHERE email = ? AND loai = 'hoan_phieu' AND ngay_tao >= ? AND instr(ghi_chu, ?) = 1 ORDER BY id DESC LIMIT 1`,
        )
        // instr() thay LIKE: D1 gioi han do dai mau LIKE (~50 byte) -> "LIKE or GLOB pattern too complex" voi cau tieng Viet nay.
        .bind(quyDon, tk.huy_luc, `Hoàn tiền đã thanh toán của đơn ${tk.dat_don_hang_id} (`)
        .first<{ so_tien: number; phieu_xuat_kho_id: string | null }>()
    : null;
  const tienHoan = Math.max(0, hoan?.so_tien ?? 0);
  const tienLayLai = tienHoan > 0 && quyDon ? Math.min(tienHoan, Math.max(0, await soDuQuy(db, quyDon))) : 0;

  const nhanTicket: Record<string, string> = {
    "Cho kho xu ly": "Chờ kho xử lý", "Kho da tiep nhan": "Kho đã tiếp nhận", "Kho da cap nhat": "Kho đã cập nhật",
    "Cho mua hang": "Chờ mua hàng", "Mua hang da dat": "Mua hàng đã đặt",
  };
  const them = (quaHan ? " (Admin đẩy lại khi đã quá 24h)" : "") + (ghiChuNguoiDung?.trim() ? `: ${ghiChuNguoiDung.trim().slice(0, 500)}` : "");
  const ghiChuTicket = `Đẩy lại ticket về "${nhanTicket[tk.trang_thai_truoc]}" (trước khi bị từ chối / hủy) — đơn gốc ${tk.dat_don_hang_id} về Chờ hàng${them}`;
  const ghiChuDon = `Đẩy lại theo ticket ${tk.id}: ticket về "${nhanTicket[tk.trang_thai_truoc]}", đơn về Chờ hàng${
    tienLayLai > 0 ? ` (lấy lại ${tienLayLai.toLocaleString("vi-VN")}đ đã hoàn về quỹ)` : ""
  }${them}`;

  try {
    await db.batch([
      // CAS: đơn / ticket vừa bị thao tác khác đổi -> INSERT vi phạm CHECK (x = 0) -> rollback cả batch.
      db.prepare(
        `INSERT INTO quy_cas_guard (x) SELECT 1 WHERE (SELECT version FROM dat_don_hang WHERE id = ?) IS NOT ?
           OR (SELECT trang_thai_hien_tai FROM dat_don_hang WHERE id = ?) IS NOT 'Da huy'
           OR (SELECT MAX(id) FROM thieu_lk_log WHERE thieu_lk_id = ?) IS NOT ?`,
      ).bind(tk.dat_don_hang_id, tk.version, tk.dat_don_hang_id, tk.id, tk.log_tk_id),
      db.prepare("UPDATE dat_don_hang SET trang_thai_hien_tai = 'Cho hang', version = version + 1, updated_at = ? WHERE id = ?").bind(now, tk.dat_don_hang_id),
      db.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho hang', ?, ?, ?)")
        .bind(tk.dat_don_hang_id, nguoi, now, ghiChuDon),
      db.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
        .bind(tk.id, tk.trang_thai_truoc, nguoi, now, ghiChuTicket),
      ...(tienLayLai > 0 && quyDon
        ? [
            // so_du quỹ CHECK >= 0: quỹ vừa bị trừ chỗ khác -> rollback.
            ...lenhGhiQuy(db, {
              email: quyDon, loai: "tra_phieu", soTien: -tienLayLai, pxkId: hoan?.phieu_xuat_kho_id ?? null, nguoi, now,
              ghiChu: `Đẩy lại đơn ${tk.dat_don_hang_id} theo ticket ${tk.id} — lấy lại tiền đã hoàn khi hủy`,
            }),
            db.prepare("UPDATE dat_don_hang SET tien_da_tra = ?, tien_da_tra_email = ?, tien_da_tra_pxk = ? WHERE id = ?")
              .bind(tienLayLai, quyDon, hoan?.phieu_xuat_kho_id ?? null, tk.dat_don_hang_id),
          ]
        : []),
    ]);
  } catch {
    return { error: "DU_LIEU_VUA_DOI", status: 409 };
  }

  // Đơn quay lại tổng đơn trong ngày (chiết khấu) -> tính lại PXK đang tạo của người nhận.
  await taiTinhPxkMoCuaKtv(db, tk.nguoi_nhan_hang, nguoi);
  if (tk.nguoi_tao !== nguoi) {
    await baoNguoiTaoDon(
      env, db, tk.nguoi_tao, "mo_lai",
      `Đơn hàng "${tk.ten_lk_snapshot} (x${tk.so_luong_de_xuat})" bị hủy theo ticket ${tk.id} đã được đẩy lại — đơn về Chờ hàng, ticket về "${nhanTicket[tk.trang_thai_truoc]}"`,
      tk.dat_don_hang_id,
    ).catch(() => undefined);
  }
  return { ok: true, donHangId: tk.dat_don_hang_id, trangThaiTicket: tk.trang_thai_truoc, tienLayLai, tienHoan };
}
