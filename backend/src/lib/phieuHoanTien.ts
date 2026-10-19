// PHIẾU HOÀN TIỀN QUỸ CHO KTV (chot 2026-10-19, migration 0090) - "KT tạo phiếu hoàn tiền => tiền tạm giữ khỏi quỹ => KTV xác nhận
// => tiền bị trừ khỏi quỹ. KTV từ chối => đẩy về KT xác nhận. KT xác nhận thì hủy luồng. KTV từ chối thì lại đẩy lại chờ KTV xác nhận.
// các xác nhận, từ chối, hủy bỏ đều có thể thêm ghi chú".
//
// Trang thai: 'Cho KTV xac nhan' --KTV xac nhan--> 'Da hoan tien'
//                                --KTV tu choi---> 'Cho KT xac nhan' --KT xac nhan huy--> 'Da huy'
//                                                                    --KT tu choi-------> 'Cho KTV xac nhan'
//             Ke toan "Hủy phiếu" khi con 'Cho KTV xac nhan' (tao nham) -> 'Da huy'.
// Tien: TAM GIU = tru quy_ktv.so_du NGAY luc tao (giao dich 'hoan_tien_ktv' gan phieu_hoan_tien_id) - CHECK so_du >= 0 lam batch tao
// phieu rollback khi quy khong du, va tien tam giu khong bi phanBoQuy() tu tru tra phieu xuat. KTV xac nhan = khong ghi giao dich them
// (tien da ra khoi quy tu luc tam giu). Huy = tra lai so tam giu ('dieu_chinh' +) roi phanBoQuy (cong quy -> tu tru phieu dang cho tien).
// Chong bam 2 lan: moi batch mo dau bang CAS trang thai (quy_cas_guard).
// Nguoi xac nhan phia KTV = CHINH chu quy (email nguoi nhan hang; Ve tinh -> Tram). Phia Ke toan = Ke toan / Admin.
import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { nextSequentialId } from "./idCounter";
import { lenhGhiQuy, phanBoQuy, soDuQuy } from "./quyKtv";
import { sendPushToUser } from "./webPush";
import { tenNguoiMap } from "./tenNguoi";

export type TrangThaiHoanTien = "Cho KTV xac nhan" | "Cho KT xac nhan" | "Da hoan tien" | "Da huy";
export type HanhDongHoanTien = "ktv_xac_nhan" | "ktv_tu_choi" | "kt_xac_nhan_huy" | "kt_tu_choi" | "kt_huy";
export const HOAN_TIEN_MO: TrangThaiHoanTien[] = ["Cho KTV xac nhan", "Cho KT xac nhan"];

export interface PhieuHoanTienRow {
  id: string;
  email: string;
  so_tien: number;
  trang_thai: TrangThaiHoanTien;
  ghi_chu: string | null;
  nguoi_tao: string;
  ngay_tao: string;
  cap_nhat_luc: string;
  ktv_xac_nhan_luc: string | null;
  huy_luc: string | null;
}

const tien = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
const MO_TA: Record<HanhDongHoanTien, string> = {
  ktv_xac_nhan: "KTV xác nhận đã nhận tiền hoàn",
  ktv_tu_choi: "KTV từ chối phiếu hoàn tiền",
  kt_xac_nhan_huy: "Kế toán xác nhận hủy phiếu hoàn tiền",
  kt_tu_choi: "Kế toán từ chối, đẩy lại chờ KTV xác nhận",
  kt_huy: "Kế toán hủy phiếu hoàn tiền",
};

/** Buoc chuyen hop le: [trang thai hien tai, phia thao tac, trang thai moi]. */
const BUOC: Record<HanhDongHoanTien, { tu: TrangThaiHoanTien[]; phia: "ktv" | "kt"; den: TrangThaiHoanTien }> = {
  ktv_xac_nhan: { tu: ["Cho KTV xac nhan"], phia: "ktv", den: "Da hoan tien" },
  ktv_tu_choi: { tu: ["Cho KTV xac nhan"], phia: "ktv", den: "Cho KT xac nhan" },
  kt_xac_nhan_huy: { tu: ["Cho KT xac nhan"], phia: "kt", den: "Da huy" },
  kt_tu_choi: { tu: ["Cho KT xac nhan"], phia: "kt", den: "Cho KTV xac nhan" },
  // O "Cho KT xac nhan" Ke toan dung kt_xac_nhan_huy (cung ket qua) - kt_huy chi cho phieu dang cho KTV (tao nham).
  kt_huy: { tu: ["Cho KTV xac nhan"], phia: "kt", den: "Da huy" },
};

export const laKeToanHoanTien = (u: { vai_tro?: string | null; la_ke_toan?: boolean | number | null }) =>
  u.vai_tro === "Admin" || !!u.la_ke_toan;

/** Cac hanh dong nguoi xem duoc lam tren phieu (FE hien nut theo danh sach nay). */
export function hanhDongDuoc(p: PhieuHoanTienRow, u: { email: string; vai_tro?: string | null; la_ke_toan?: boolean | number | null }): HanhDongHoanTien[] {
  const kt = laKeToanHoanTien(u);
  return (Object.keys(BUOC) as HanhDongHoanTien[]).filter((h) => {
    const b = BUOC[h];
    if (!b.tu.includes(p.trang_thai)) return false;
    return b.phia === "ktv" ? p.email === u.email : kt;
  });
}

async function emailsKeToan(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT email FROM users WHERE la_ke_toan = 1 AND trang_thai_duyet = 'Da duyet' AND COALESCE(bi_khoa, 0) = 0")
    .all<{ email: string }>();
  return results.map((r) => r.email);
}

/** Chuong (thong_bao_ktv loai/link_type 'phieu_hoan_tien') + Web Push mo thang phieu (url "/?hoan_tien=<id>"). */
async function bao(env: Env, nguoiNhan: string[], tru: string, id: string, noiDung: string): Promise<void> {
  const ds = [...new Set(nguoiNhan.filter((e) => e && e !== tru))];
  const now = nowVN();
  for (const email of ds) {
    await env.DB.prepare(
      "INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, 'phieu_hoan_tien', ?, 'phieu_hoan_tien', ?, ?)",
    )
      .bind(email, noiDung.slice(0, 500), id, now)
      .run()
      .catch(() => undefined);
    await sendPushToUser(env, email, { title: "Phiếu hoàn tiền quỹ", body: noiDung.slice(0, 200), url: `/?hoan_tien=${encodeURIComponent(id)}` }).catch(
      () => undefined,
    );
  }
}

export type KetQua<T> = T | { error: string; status: 400 | 403 | 404 | 409; so_du?: number };

/** Ke toan tao phieu: tam giu `soTien` khoi quy cua `email` (quy khong du -> QUY_KHONG_DU). */
export async function taoPhieuHoanTien(
  env: Env,
  g: { email: string; soTien: number; ghiChu: string | null; nguoi: string },
  hen: (p: Promise<unknown>) => void,
): Promise<KetQua<{ id: string; so_du: number }>> {
  const db = env.DB;
  const soDu = await soDuQuy(db, g.email);
  if (soDu < g.soTien) return { error: "QUY_KHONG_DU", status: 409, so_du: soDu };
  const id = await nextSequentialId(db, "phieu_hoan_tien", "HT", 6);
  const now = nowVN();
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO phieu_hoan_tien (id, email, so_tien, trang_thai, ghi_chu, nguoi_tao, ngay_tao, cap_nhat_luc)
         VALUES (?, ?, ?, 'Cho KTV xac nhan', ?, ?, ?, ?)`,
      ).bind(id, g.email, g.soTien, g.ghiChu, g.nguoi, now, now),
      db.prepare(
        "INSERT INTO phieu_hoan_tien_log (phieu_hoan_tien_id, hanh_dong, trang_thai, ghi_chu, nguoi, ngay_tao) VALUES (?, 'tao', 'Cho KTV xac nhan', ?, ?, ?)",
      ).bind(id, g.ghiChu, g.nguoi, now),
      ...lenhGhiQuy(db, {
        email: g.email,
        loai: "hoan_tien_ktv",
        soTien: -g.soTien,
        phieuHoanTienId: id,
        ghiChu: `Tạm giữ hoàn tiền ${id}${g.ghiChu ? ` — ${g.ghiChu}` : ""}`,
        nguoi: g.nguoi,
        now,
      }),
    ]);
  } catch {
    // CHECK so_du >= 0 (thao tac khac vua dung quy) -> ca batch rollback.
    return { error: "QUY_KHONG_DU", status: 409, so_du: await soDuQuy(db, g.email) };
  }
  const ten = (await tenNguoiMap(db, [g.nguoi])).get(g.nguoi) ?? g.nguoi;
  hen(
    bao(env, [g.email], g.nguoi, id,
      `${ten} tạo phiếu hoàn tiền ${id}: ${tien(g.soTien)} từ quỹ dư của bạn${g.ghiChu ? ` (${g.ghiChu})` : ""}. Vui lòng xác nhận khi đã nhận được tiền, hoặc từ chối nếu chưa nhận.`),
  );
  return { id, so_du: await soDuQuy(db, g.email) };
}

/** 1 buoc chuyen trang thai (KTV xac nhan / tu choi; Ke toan xac nhan huy / tu choi / huy). */
export async function xuLyPhieuHoanTien(
  env: Env,
  id: string,
  hanhDong: HanhDongHoanTien,
  ghiChu: string | null,
  u: { email: string; vai_tro?: string | null; la_ke_toan?: boolean | number | null },
  hen: (p: Promise<unknown>) => void,
): Promise<KetQua<{ trang_thai: TrangThaiHoanTien }>> {
  const db = env.DB;
  const b = BUOC[hanhDong];
  if (!b) return { error: "INVALID_HANH_DONG", status: 400 };
  const p = await db.prepare("SELECT * FROM phieu_hoan_tien WHERE id = ?").bind(id).first<PhieuHoanTienRow>();
  if (!p) return { error: "NOT_FOUND", status: 404 };
  if (b.phia === "ktv" ? p.email !== u.email : !laKeToanHoanTien(u)) return { error: "FORBIDDEN_ROLE", status: 403 };
  if (!b.tu.includes(p.trang_thai)) return { error: "TRANG_THAI_DA_DOI", status: 409 };

  const now = nowVN();
  const huy = b.den === "Da huy";
  const lenh: D1PreparedStatement[] = [
    // CAS: trang thai phai con dung luc doc - bam 2 lan / 2 nguoi cung luc -> batch rollback.
    db.prepare("INSERT INTO quy_cas_guard (x) SELECT 1 WHERE (SELECT trang_thai FROM phieu_hoan_tien WHERE id = ?) IS NOT ?").bind(id, p.trang_thai),
    db.prepare(
      `UPDATE phieu_hoan_tien SET trang_thai = ?, cap_nhat_luc = ?,
         ktv_xac_nhan_luc = CASE WHEN ? = 'Da hoan tien' THEN ? ELSE ktv_xac_nhan_luc END,
         huy_luc = CASE WHEN ? = 'Da huy' THEN ? ELSE huy_luc END
       WHERE id = ?`,
    ).bind(b.den, now, b.den, now, b.den, now, id),
    db.prepare(
      "INSERT INTO phieu_hoan_tien_log (phieu_hoan_tien_id, hanh_dong, trang_thai, ghi_chu, nguoi, ngay_tao) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(id, hanhDong, b.den, ghiChu, u.email, now),
  ];
  if (huy) {
    lenh.push(
      ...lenhGhiQuy(db, {
        email: p.email,
        loai: "dieu_chinh",
        soTien: p.so_tien,
        phieuHoanTienId: id,
        ghiChu: `Trả lại tiền tạm giữ — hủy phiếu hoàn tiền ${id}${ghiChu ? ` (${ghiChu})` : ""}`,
        nguoi: u.email,
        now,
      }),
    );
  }
  try {
    await db.batch(lenh);
  } catch {
    return { error: "TRANG_THAI_DA_DOI", status: 409 };
  }
  if (huy) await phanBoQuy(db, p.email, u.email);

  const ten = (await tenNguoiMap(db, [u.email])).get(u.email) ?? u.email;
  const kem = ghiChu ? `: ${ghiChu}` : "";
  const noiDung =
    hanhDong === "ktv_xac_nhan"
      ? `${ten} đã xác nhận nhận ${tien(p.so_tien)} — phiếu hoàn tiền ${id} hoàn tất${kem}`
      : hanhDong === "ktv_tu_choi"
        ? `${ten} từ chối phiếu hoàn tiền ${id} (${tien(p.so_tien)})${kem}. Kế toán cần xác nhận hủy hoặc từ chối để đẩy lại cho KTV.`
        : hanhDong === "kt_tu_choi"
          ? `Kế toán ${ten} không chấp nhận từ chối — phiếu hoàn tiền ${id} (${tien(p.so_tien)}) chờ bạn xác nhận lại${kem}`
          : `Kế toán ${ten} đã hủy phiếu hoàn tiền ${id} — ${tien(p.so_tien)} trả lại vào quỹ của bạn${kem}`;
  // Phia KTV thao tac -> bao Ke toan (nguoi tao + moi Ke toan); phia Ke toan -> bao KTV (+ nguoi tao neu khac nguoi thao tac).
  const nhan = b.phia === "ktv" ? [p.nguoi_tao, ...(await emailsKeToan(db))] : [p.email, p.nguoi_tao];
  hen(bao(env, nhan, u.email, id, noiDung));
  return { trang_thai: b.den };
}

export const MO_TA_HANH_DONG = MO_TA;

/** So phieu hoan tien CAN nguoi nay xu ly (chu quy: cho KTV xac nhan; Ke toan/Admin: cho KT xac nhan) - badge Sidebar. */
export async function demHoanTienCanXuLy(db: D1Database, u: { email: string; vai_tro?: string | null; la_ke_toan?: boolean | number | null }): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN trang_thai = 'Cho KTV xac nhan' AND email = ? THEN 1
                                WHEN trang_thai = 'Cho KT xac nhan' AND ? = 1 THEN 1 ELSE 0 END), 0) AS n
       FROM phieu_hoan_tien WHERE trang_thai IN ('Cho KTV xac nhan', 'Cho KT xac nhan')`,
    )
    .bind(u.email, laKeToanHoanTien(u) ? 1 : 0)
    .first<{ n: number }>();
  return r?.n ?? 0;
}
