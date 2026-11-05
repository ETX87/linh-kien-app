import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { nextSequentialId } from "./idCounter";
import { baoNguoiTaoDon, duyetDonKhiHangVe, moTicketChoHangTuDong } from "./tuDongDuyet";
import { tinhToanPxk, taiTinhPxk } from "./pxkRecalculate";
import { lenhKhoaDaThanhToan } from "./quyKtv";
import { bundleAutoApprovedIntoPxk } from "./pxkAutoBundle";

// TACH DON CHO HANG KHI HANG VE MOT PHAN (chot 2026-11-03, v1.434 - "các đơn thiếu hàng, có trường hợp hàng về trước với số lượng ít hơn số
// lượng đặt. ví dụ đặt 2, nhưng về có 1 linh kiện => thêm cho kế toán và kho, TN khả năng tách đơn nhiều thành đơn nhỏ (có tiền sẽ chia tiền ra
// theo số linh kiện đi theo đơn) => ví dụ đơn chờ 2, kho xác nhận về 1, hỏi kho tách đơn còn thiếu sang kế toán, 1 đơn thiếu vẫn chờ kho").
//
// Don goc D (Mua / Cong no, "Cho hang", SL n) -> tao don MOI D' = ban sao D voi SL k (phan da ve) + tach D con n - k:
// - Tien da tra (tien_da_tra) + gia tri cong no (so_tien_cong_no) chia THEO SL (D' = lam tron tien x k / n, D giu phan con lai).
// - D' giu ngay_tao cua D (khong doi tong ngay chiet khau / thu tu uu tien), chep lich su xu ly + Ma YCSC bo sung cua D roi ghi them dong "Tách
//   từ đơn D". D giu ticket thieu hang dang mo (Kho van cho phan con thieu) + ghi vet tach vao ca log don lan log ticket.
// - duyet = true (mac dinh): D' = phan HANG DA VE -> duyet + vao phieu nhu Kho bam "Hàng đã về" (duyetDonKhiHangVe, mang tien sang phieu, sang
//   Ke toan). duyet = false: chi tach, D' cung cho hang (mo ticket rieng).
// Batch: INSERT D' chon tu D VOI dieu kien SL/trang thai/tien chua doi - doi roi thi INSERT khong ra dong, cac lenh sau (log/ticket tro toi D')
// vi pham khoa ngoai -> ca batch rollback -> STATE_CHANGED.

// Cot KHONG chep nguyen tu don goc (gan lai rieng).
const COT_GAN_LAI = new Set([
  "id", "so_luong_de_xuat", "so_luong_thuc_xuat", "tien_da_tra", "tien_da_tra_email", "tien_da_tra_pxk", "so_tien_cong_no", "ma_xuat_kho", "updated_at",
]);

export type KetQuaTach = { ok: true; donMoi: string; trangThaiMoi: string } | { ok: false; error: string; status: 400 | 404 | 409 };

export async function tachDonChoHang(
  env: Env, db: D1Database, donId: string, slTach: number, nguoi: string,
  opts: { duyet: boolean; ghiChu?: string; waitUntil?: (p: Promise<unknown>) => void },
): Promise<KetQuaTach> {
  const d = await db
    .prepare(
      `SELECT id, trang_thai_hien_tai AS trang_thai, loai_don, so_luong_de_xuat AS sl, COALESCE(tien_da_tra, 0) AS tien, so_tien_cong_no,
              tien_da_tra_email, tien_da_tra_pxk, nguoi_tao, ten_lk_snapshot, ma_lk
       FROM dat_don_hang WHERE id = ?`,
    )
    .bind(donId)
    .first<{
      id: string; trang_thai: string; loai_don: string; sl: number; tien: number; so_tien_cong_no: number | null;
      tien_da_tra_email: string | null; tien_da_tra_pxk: string | null; nguoi_tao: string; ten_lk_snapshot: string; ma_lk: string;
    }>();
  if (!d) return { ok: false, error: "NOT_FOUND", status: 404 };
  if (d.trang_thai !== "Cho hang") return { ok: false, error: "CHI_TACH_DON_CHO_HANG", status: 409 };
  if (d.loai_don !== "mua" && d.loai_don !== "cong_no") return { ok: false, error: "CHI_TACH_DON_MUA_CONG_NO", status: 409 };
  if (!Number.isInteger(slTach) || slTach < 1 || slTach >= d.sl) return { ok: false, error: "SO_LUONG_TACH_KHONG_HOP_LE", status: 400 };

  const conLai = d.sl - slTach;
  const tienMoi = Math.round((d.tien * slTach) / d.sl);
  const tienCon = d.tien - tienMoi;
  const cnMoi = d.so_tien_cong_no != null ? Math.round((d.so_tien_cong_no * slTach) / d.sl) : null;
  const cnCon = d.so_tien_cong_no != null ? d.so_tien_cong_no - (cnMoi ?? 0) : null;

  const { results: cot } = await db.prepare("PRAGMA table_info(dat_don_hang)").all<{ name: string }>();
  const chep = cot.map((c) => c.name).filter((n) => !COT_GAN_LAI.has(n));
  const newId = await nextSequentialId(db, "dat_don_hang", "DDH", 6);
  const now = nowVN();
  const ghiChuThem = opts.ghiChu?.trim() ? ` — ${opts.ghiChu.trim()}` : "";
  const moTaTien = d.tien > 0 ? `; tiền đã thanh toán ${d.tien.toLocaleString("vi-VN")}đ chia ${tienMoi.toLocaleString("vi-VN")}đ / ${tienCon.toLocaleString("vi-VN")}đ` : "";
  const ghiChuMoi = `Tách từ đơn ${d.id}: ${slTach}/${d.sl} ${d.ma_lk}${opts.duyet ? " (phần hàng đã về)" : ""}${moTaTien}${ghiChuThem}`;
  const ghiChuGoc = `Tách ${slTach} sang đơn ${newId}${opts.duyet ? " (hàng đã về, duyệt vào phiếu)" : ""} — đơn này còn chờ ${conLai}${moTaTien}${ghiChuThem}`;

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO dat_don_hang (id, so_luong_de_xuat, so_luong_thuc_xuat, tien_da_tra, tien_da_tra_email, tien_da_tra_pxk, so_tien_cong_no, ma_xuat_kho,
             updated_at, ${chep.join(", ")})
           SELECT ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ${chep.join(", ")}
           FROM dat_don_hang WHERE id = ? AND trang_thai_hien_tai = 'Cho hang' AND so_luong_de_xuat = ? AND COALESCE(tien_da_tra, 0) = ?`,
        )
        .bind(newId, slTach, tienMoi, tienMoi > 0 ? d.tien_da_tra_email : null, tienMoi > 0 ? d.tien_da_tra_pxk : null, cnMoi, now, d.id, d.sl, d.tien),
      db
        .prepare(
          `UPDATE dat_don_hang SET so_luong_de_xuat = ?, so_luong_thuc_xuat = NULL, tien_da_tra = ?, tien_da_tra_email = ?, tien_da_tra_pxk = ?,
             so_tien_cong_no = ?, updated_at = ?
           WHERE id = ? AND trang_thai_hien_tai = 'Cho hang' AND so_luong_de_xuat = ? AND COALESCE(tien_da_tra, 0) = ?`,
        )
        .bind(conLai, tienCon, tienCon > 0 ? d.tien_da_tra_email : null, tienCon > 0 ? d.tien_da_tra_pxk : null, cnCon, now, d.id, d.sl, d.tien),
      // Lich su: chep lich su don goc sang don moi (doc lai duoc tu dau) + dong tach.
      db.prepare(
        `INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong)
         SELECT ?, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong FROM dat_don_hang_log WHERE dat_don_hang_id = ? ORDER BY id`,
      ).bind(newId, d.id),
      db.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong) VALUES (?, 'Cho hang', ?, ?, ?, 0)")
        .bind(newId, nguoi, now, ghiChuMoi.slice(0, 1000)),
      db.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong) VALUES (?, 'Cho hang', ?, ?, ?, 0)")
        .bind(d.id, nguoi, now, ghiChuGoc.slice(0, 1000)),
      db.prepare("INSERT OR IGNORE INTO dat_don_case (dat_don_hang_id, case_id) SELECT ?, case_id FROM dat_don_case WHERE dat_don_hang_id = ?").bind(newId, d.id),
      // Ticket dang mo cua don goc: ghi vet (giu nguyen trang thai hien tai cua ticket).
      db.prepare(
        `INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
         SELECT t.id, (SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1), ?, ?, ?
         FROM thieu_lk t
         WHERE t.dat_don_hang_id = ?
           AND COALESCE((SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1), '') NOT IN ('Da huy bo', 'Da ket thuc')`,
      ).bind(nguoi, now, ghiChuGoc.slice(0, 1000), d.id),
    ]);
  } catch {
    return { ok: false, error: "STATE_CHANGED", status: 409 };
  }
  const moi = await db.prepare("SELECT id FROM dat_don_hang WHERE id = ?").bind(newId).first();
  if (!moi) return { ok: false, error: "STATE_CHANGED", status: 409 };

  let trangThaiMoi = "Cho hang";
  if (opts.duyet) {
    if (await duyetDonKhiHangVe(env, db, newId, nguoi, `Hàng về ${slTach}/${d.sl} — duyệt phần đã về, vào phiếu (tách từ ${d.id})`)) trangThaiMoi = "TN da duyet";
  } else {
    await moTicketChoHangTuDong(env, db, newId, d.nguoi_tao, `Tách từ đơn ${d.id} — chờ hàng ${slTach}`, opts.waitUntil);
  }
  if (d.nguoi_tao !== nguoi) {
    const p = baoNguoiTaoDon(
      env, db, d.nguoi_tao, trangThaiMoi === "TN da duyet" ? "da_duyet" : "cho_hang",
      `Đơn hàng "${d.ten_lk_snapshot} (x${d.sl})" được tách: ${slTach} chiếc sang đơn ${newId}${trangThaiMoi === "TN da duyet" ? " (hàng đã về, đã duyệt vào phiếu)" : ""}, đơn ${d.id} còn chờ ${conLai} chiếc`,
      d.id,
    ).catch(() => undefined);
    if (opts.waitUntil) opts.waitUntil(p);
    else await p;
  }
  return { ok: true, donMoi: newId, trangThaiMoi };
}

// TACH DON NGAY TRONG PHIEU XUAT (chot 2026-11-05, v1.440 - "tách đơn cho phép KT thực hiện ngay ở phiếu kế toán (trước khi kế toán xác nhận
// phiếu misa) => ví dụ KTV đặt 10 lk, đã chuyển khoản, nhưng kế toán xác định chỉ cho xuất trước 5 linh kiện, 5 linh kiện còn lại tách ra phiếu
// khác để xuất sau (có thể là sl linh kiện phải chia cho nhiều KTV nên chia ra để nhiều KTV đều có hàng)").
// Don D ("TN da duyet", SL n) trong phieu P ("Dang tao phieu" / "Cho ke toan", CHUA Ma MISA, khong tra hang) -> D giu n - k o lai P, don MOI D'
// = ban sao D voi SL k RA KHOI P:
// - Tien: phan tien cua dong (tienUocTinhTheoDong x k / n, quy theo ty le phieu da thanh toan) RUT khoi P.da_thanh_toan va MANG THEO D'
//   (tien_da_tra) - giong "Bỏ đơn - Đơn đã thanh toán". P "Cho ke toan" (taiTinhPxk khong sua tien buoc nay) -> tru thang so_tien_can_chuyen.
// - Cong no (so_tien_cong_no) chia theo SL. D' giu ngay_tao + updated_at cua D (tong ngay chiet khau / cong no phat sinh khong doi).
// - D' tu vao phieu khac (bundleAutoApprovedIntoPxk, bo qua P) - don da thanh toan -> phieu rieng da du tien, cho xuat sau.
export type KetQuaTachTrongPhieu =
  | { ok: true; donMoi: string; phieuMoi: string | null; tienMangTheo: number }
  | { ok: false; error: string; status: 400 | 404 | 409 };

export async function tachDonTrongPhieu(
  env: Env, db: D1Database, pxkId: string, donId: string, slTach: number, nguoi: string, ghiChu?: string,
): Promise<KetQuaTachTrongPhieu> {
  const p = await db
    .prepare(
      `SELECT trang_thai_hien_tai AS tt, ma_misa, COALESCE(da_thanh_toan, 0) AS da_tt, so_tien_can_chuyen, nguoi_nhan_hang, loai_don
       FROM phieu_xuat_kho WHERE id = ?`,
    )
    .bind(pxkId)
    .first<{ tt: string; ma_misa: string | null; da_tt: number; so_tien_can_chuyen: number | null; nguoi_nhan_hang: string | null; loai_don: string | null }>();
  if (!p) return { ok: false, error: "NOT_FOUND", status: 404 };
  if (p.tt !== "Dang tao phieu" && p.tt !== "Cho ke toan") return { ok: false, error: "PHIEU_DA_CHOT", status: 409 };
  if (p.loai_don === "tra_hang") return { ok: false, error: "TRA_HANG_KHONG_TACH", status: 409 };
  const d = await db
    .prepare(
      `SELECT d.id, d.trang_thai_hien_tai AS tt, d.loai_don, d.so_luong_de_xuat AS sl, d.so_luong_thuc_xuat AS sl_tx, d.so_tien_cong_no, d.nguoi_nhan_hang,
              d.nguoi_tao, d.ten_lk_snapshot, d.ma_lk
       FROM phieu_xuat_kho_dong pd JOIN dat_don_hang d ON d.id = pd.dat_don_hang_id
       WHERE pd.phieu_xuat_kho_id = ? AND pd.dat_don_hang_id = ?`,
    )
    .bind(pxkId, donId)
    .first<{
      id: string; tt: string; loai_don: "mua" | "cong_no" | "tra_hang"; sl: number; sl_tx: number | null; so_tien_cong_no: number | null;
      nguoi_nhan_hang: string; nguoi_tao: string; ten_lk_snapshot: string; ma_lk: string;
    }>();
  if (!d) return { ok: false, error: "NOT_FOUND", status: 404 };
  if (d.tt !== "TN da duyet") return { ok: false, error: "DON_CHUA_DUYET", status: 409 };
  if (d.sl_tx != null && d.sl_tx !== d.sl) return { ok: false, error: "SL_THUC_XUAT_DA_SUA", status: 409 };
  if (!Number.isInteger(slTach) || slTach < 1 || slTach >= d.sl) return { ok: false, error: "SO_LUONG_TACH_KHONG_HOP_LE", status: 400 };

  const { results: dong } = await db.prepare("SELECT dat_don_hang_id AS id FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?").bind(pxkId).all<{ id: string }>();
  const tinh = await tinhToanPxk(db, dong.map((r) => r.id));
  const tienDongTach = Math.round(((tinh.tienUocTinhTheoDong.get(donId) ?? 0) * slTach) / d.sl);
  // Phieu tra chua du -> phan tach mang theo dung ty le da tra.
  const tyLeDaTra = (p.so_tien_can_chuyen ?? 0) > 0 ? Math.min(1, p.da_tt / p.so_tien_can_chuyen!) : p.da_tt > 0 ? 1 : 0;
  const tienMang = Math.min(p.da_tt, Math.round(tienDongTach * tyLeDaTra));
  const conLai = d.sl - slTach;
  const cnMoi = d.so_tien_cong_no != null ? Math.round((d.so_tien_cong_no * slTach) / d.sl) : null;
  const cnCon = d.so_tien_cong_no != null ? d.so_tien_cong_no - (cnMoi ?? 0) : null;

  const { results: cot } = await db.prepare("PRAGMA table_info(dat_don_hang)").all<{ name: string }>();
  const ganLai = new Set(["id", "so_luong_de_xuat", "so_luong_thuc_xuat", "tien_da_tra", "tien_da_tra_email", "tien_da_tra_pxk", "so_tien_cong_no", "ma_xuat_kho"]);
  const chep = cot.map((c) => c.name).filter((n) => !ganLai.has(n));
  const newId = await nextSequentialId(db, "dat_don_hang", "DDH", 6);
  const now = nowVN();
  const them = ghiChu?.trim() ? ` — ${ghiChu.trim()}` : "";
  const moTaTien = tienMang > 0 ? `, mang theo ${tienMang.toLocaleString("vi-VN")}đ đã thanh toán` : "";
  const ghiChuMoi = `Tách từ đơn ${d.id} trong phiếu ${pxkId}: ${slTach}/${d.sl} ${d.ma_lk} — để xuất sau${moTaTien}${them}`;
  const ghiChuGoc = `Tách ${slTach} sang đơn ${newId} để xuất sau — đơn này còn ${conLai} xuất ở phiếu ${pxkId}${moTaTien}${them}`;

  const lenh: D1PreparedStatement[] = [];
  if (tienMang > 0) lenh.push(lenhKhoaDaThanhToan(db, pxkId, p.da_tt));
  lenh.push(
    db
      .prepare(
        `INSERT INTO dat_don_hang (id, so_luong_de_xuat, so_luong_thuc_xuat, tien_da_tra, tien_da_tra_email, tien_da_tra_pxk, so_tien_cong_no, ma_xuat_kho,
           ${chep.join(", ")})
         SELECT ?, ?, NULL, ?, ?, ?, ?, NULL, ${chep.join(", ")}
         FROM dat_don_hang WHERE id = ? AND trang_thai_hien_tai = 'TN da duyet' AND so_luong_de_xuat = ?`,
      )
      .bind(newId, slTach, tienMang, tienMang > 0 ? p.nguoi_nhan_hang : null, tienMang > 0 ? pxkId : null, cnMoi, d.id, d.sl),
    db
      .prepare("UPDATE dat_don_hang SET so_luong_de_xuat = ?, so_luong_thuc_xuat = NULL, so_tien_cong_no = ? WHERE id = ? AND trang_thai_hien_tai = 'TN da duyet' AND so_luong_de_xuat = ?")
      .bind(conLai, cnCon, d.id, d.sl),
    db.prepare(
      `INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong)
       SELECT ?, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong FROM dat_don_hang_log WHERE dat_don_hang_id = ? ORDER BY id`,
    ).bind(newId, d.id),
    db.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong) VALUES (?, 'TN da duyet', ?, ?, ?, 0)")
      .bind(newId, nguoi, now, ghiChuMoi.slice(0, 1000)),
    db.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong) VALUES (?, 'TN da duyet', ?, ?, ?, 0)")
      .bind(d.id, nguoi, now, ghiChuGoc.slice(0, 1000)),
    db.prepare("INSERT OR IGNORE INTO dat_don_case (dat_don_hang_id, case_id) SELECT ?, case_id FROM dat_don_case WHERE dat_don_hang_id = ?").bind(newId, d.id),
    db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Da xoa don khoi phieu', ?, ?, ?)")
      .bind(pxkId, nguoi, now, `Tách đơn ${d.id}: giữ ${conLai}/${d.sl} ${d.ma_lk} ở phiếu này, ${slTach} sang đơn ${newId} xuất sau${moTaTien}${them}`.slice(0, 2000)),
  );
  if (tienMang > 0) lenh.push(db.prepare("UPDATE phieu_xuat_kho SET da_thanh_toan = da_thanh_toan - ? WHERE id = ?").bind(tienMang, pxkId));
  try {
    await db.batch(lenh);
  } catch {
    return { ok: false, error: "STATE_CHANGED", status: 409 };
  }
  if (!(await db.prepare("SELECT 1 FROM dat_don_hang WHERE id = ?").bind(newId).first())) return { ok: false, error: "STATE_CHANGED", status: 409 };

  // Phieu nguon "Dang tao phieu" -> tinh lai tien + chiet khau (tong giam dung bang phan da rut, quy can bang lech lam tron).
  // v1.442: taiTinhPxk tinh lai ca phieu "Cho ke toan" (du tien giu Ke toan da duyet, thua hoan quy).
  await taiTinhPxk(db, pxkId, false, true, nguoi);
  const phieuMoi = await bundleAutoApprovedIntoPxk(env, db, nguoi, d.nguoi_nhan_hang, d.loai_don, [{ donHangId: newId, soTien: 0 }], { boQuaPxk: pxkId });
  if (phieuMoi) {
    await db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Da xoa don khoi phieu', ?, ?, ?)")
      .bind(pxkId, nguoi, nowVN(), `Đơn ${newId} (tách từ ${d.id}) đã vào phiếu ${phieuMoi}${moTaTien}`)
      .run();
  }
  if (d.nguoi_tao !== nguoi) {
    await baoNguoiTaoDon(
      env, db, d.nguoi_tao, "da_duyet",
      `Đơn hàng "${d.ten_lk_snapshot} (x${d.sl})" được Kế toán tách: ${conLai} chiếc xuất trước ở phiếu ${pxkId}, ${slTach} chiếc sang đơn ${newId}${phieuMoi ? ` (phiếu ${phieuMoi})` : ""} để xuất sau`,
      d.id,
    ).catch(() => undefined);
  }
  return { ok: true, donMoi: newId, phieuMoi, tienMangTheo: tienMang };
}
