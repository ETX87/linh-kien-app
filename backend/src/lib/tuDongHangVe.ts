import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { getMocTonKhoCongTy } from "./tonKhoCongTy";
import { baoNguoiTaoDon, duyetDonKhiHangVe } from "./tuDongDuyet";

// TU DONG XAC NHAN HANG VE cho don thieu hang khi ton kho cong ty duoc cap nhat (chot 2026-10-28, v1.411 - "Khi hệ thống cập nhật hàng về kho
// (kế toán cập nhật hoặc đồng bộ từ các bên) => sẽ tự động rà soát các đơn thiếu hàng đang chờ kho xác nhận => sắp xếp ưu tiên theo mức độ
// đơn khiếu nại > đơn tồn lâu > (nếu đơn cùng ngày tạo sẽ ưu tiên đơn VIP) => Lần lượt sẽ xác nhận tự động hàng về cho các đơn này đến khi hết
// tồn kho").
// Moi (ma LK, khu vuc hieu luc cua don): ton kha dung = ton goc kho cong ty - SL don KHAC "Cho hang" dang giu hang sau moc import (CUNG cong
// thuc donChoHangDuTonKho / computeTonKhoPhatSinh). Don "Cho hang" (Mua / Cong no, khong TRỪ CÔNG NỢ) xep: ca khieu nai truoc -> ngay tao cu
// truoc -> cung ngay: don uu tien (⭐ VIP) truoc -> gio tao; luy ke SL <= kha dung = du -> xac nhan hang ve nhu Kho bam "Hàng đã về"
// (duyetDonKhiHangVe: tu duyet + vao phieu mang tien da tra; ticket mo ghi "Kho xac nhan hang da ve" + "Da ket thuc"). Don nao khong du thi
// bo qua, don SL nho hon xep sau van duoc xet tren phan ton con lai. Goi sau import ton kho (routes/ktvTonKho.ts) + nut "Rà soát hàng về".
// Them nguon ton kho moi (dong bo he khac): ghi kho_cong_ty_ton_kho + moc 'ktv_ton_kho_import_meta' roi goi ham nay.

export interface DonHangVeTuDong {
  id: string;
  ma_lk: string;
  kv: string;
  khieu_nai: number;
  uu_tien: number;
}

export async function donHangVeTheoUuTien(db: D1Database): Promise<DonHangVeTuDong[]> {
  const moc = await getMocTonKhoCongTy(db);
  const { results } = await db
    .prepare(
      `WITH cho AS (
         SELECT ddh.id, ddh.ma_lk, COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) AS kv, ddh.so_luong_de_xuat AS sl, ddh.ngay_tao,
                COALESCE(ddh.khieu_nai, 0) AS khieu_nai, COALESCE(ddh.uu_tien, 0) AS uu_tien
         FROM dat_don_hang ddh
         WHERE ddh.trang_thai_hien_tai = 'Cho hang' AND ddh.loai_don IN ('mua', 'cong_no')
           AND instr(COALESCE(ddh.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') = 0
       ),
       cap AS (SELECT DISTINCT ma_lk, kv FROM cho),
       ton AS (
         SELECT c.ma_lk, c.kv,
           COALESCE((SELECT SUM(t.cuoi_ky) FROM kho_cong_ty_ton_kho t JOIN kho_cong_ty k ON k.ma = t.kho_ma
                     JOIN kho_cong_ty_khu_vuc x ON x.kho_ma = k.ma
                     WHERE k.bat_tat = 1 AND x.khu_vuc_ma = c.kv AND t.ma_hang = c.ma_lk), 0)
           - COALESCE((SELECT SUM(d.so_luong_de_xuat) FROM dat_don_hang d
                       WHERE d.ma_lk = c.ma_lk AND COALESCE(d.khu_vuc_chon, d.khu_vuc_ma) = c.kv AND d.loai_don IN ('mua', 'cong_no')
                         AND instr(COALESCE(d.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') = 0
                         AND d.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy', 'Cho hang')
                         AND (? IS NULL OR d.ngay_tao > ?)), 0) AS kha_dung
         FROM cap c
       )
       SELECT c.id, c.ma_lk, c.kv, c.sl, c.khieu_nai, c.uu_tien, t.kha_dung
       FROM cho c JOIN ton t ON t.ma_lk = c.ma_lk AND t.kv = c.kv
       WHERE t.kha_dung > 0
       ORDER BY c.khieu_nai DESC, substr(c.ngay_tao, 1, 10), c.uu_tien DESC, c.ngay_tao, c.id`,
    )
    .bind(moc, moc)
    .all<DonHangVeTuDong & { sl: number; kha_dung: number }>();
  // Cap phat lan luot theo thu tu uu tien tren phan ton con lai cua tung (ma, khu vuc).
  const conLai = new Map<string, number>();
  const chon: DonHangVeTuDong[] = [];
  for (const r of results) {
    const key = `${r.ma_lk}|${r.kv}`;
    const ton = conLai.has(key) ? conLai.get(key)! : r.kha_dung;
    if (r.sl <= ton) {
      chon.push({ id: r.id, ma_lk: r.ma_lk, kv: r.kv, khieu_nai: r.khieu_nai, uu_tien: r.uu_tien });
      conLai.set(key, ton - r.sl);
    } else {
      conLai.set(key, ton);
    }
  }
  return chon;
}

export async function tuDongXacNhanHangVe(
  env: Env, db: D1Database, nguoi: string, nguon: string,
): Promise<{ daXacNhan: string[]; boQua: string[] }> {
  const ds = await donHangVeTheoUuTien(db);
  const kq = { daXacNhan: [] as string[], boQua: [] as string[] };
  for (const d of ds) {
    const uuTien = d.khieu_nai ? "ca khiếu nại (ưu tiên 1)" : d.uu_tien ? "đơn ưu tiên" : "đơn tồn lâu trước";
    const lyDo = `Tự động xác nhận hàng về (${nguon}): kho công ty khu vực ${d.kv} đủ hàng — xếp theo ${uuTien}`;
    const now = nowVN();
    // Ticket mo cua don -> "Kho xac nhan hang da ve" + "Da ket thuc" (cung vet nhu Kho bam "Hàng đã về").
    const tk = await db
      .prepare(
        `SELECT t.id FROM thieu_lk t WHERE t.dat_don_hang_id = ?
           AND COALESCE((SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1), '') NOT IN ('Da huy bo', 'Da ket thuc')
         ORDER BY t.ngay_tao DESC, t.id DESC LIMIT 1`,
      )
      .bind(d.id)
      .first<{ id: string }>();
    if (!(await duyetDonKhiHangVe(env, db, d.id, nguoi, lyDo))) {
      kq.boQua.push(d.id);
      continue;
    }
    if (tk) {
      await db.batch([
        db.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Kho xac nhan hang da ve', ?, ?, ?)")
          .bind(tk.id, nguoi, now, lyDo.slice(0, 1000)),
        db.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Da ket thuc', ?, ?, ?)")
          .bind(tk.id, nguoi, now, "Tự động: hàng về → duyệt đơn gốc, vào phiếu"),
        db.prepare("UPDATE thieu_lk SET ngay_hang_ve_thuc_te = ? WHERE id = ?").bind(now.slice(0, 10), tk.id),
      ]);
    }
    kq.daXacNhan.push(d.id);
    const don = await db.prepare("SELECT nguoi_tao, ten_lk_snapshot, so_luong_de_xuat FROM dat_don_hang WHERE id = ?").bind(d.id)
      .first<{ nguoi_tao: string; ten_lk_snapshot: string; so_luong_de_xuat: number }>();
    if (don && don.nguoi_tao !== nguoi) {
      await baoNguoiTaoDon(env, db, don.nguoi_tao, "da_duyet", `Đơn hàng "${don.ten_lk_snapshot} (x${don.so_luong_de_xuat})" đã có hàng về kho — tự động duyệt và vào phiếu xuất kho`, d.id)
        .catch(() => undefined);
    }
  }
  return kq;
}
