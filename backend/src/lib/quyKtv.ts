// QUY TIEN DU CUA KTV (2026-09-29, migration 0047) - moi dong tien chuyen ve di qua quy cua NGUOI NHAN HANG:
//   Ke toan duyet khoan chuyen (thuc nhan T) -> quy +T -> tu tru quy tra phieu (toi da so con thieu) -> du nam lai quy.
//   Tong phieu giam / phieu huy sau khi da tra -> hoan phan thua ve quy. Quy con tien -> tu tru cho phieu
//   "Cho KTV chuyen" CU NHAT cua cung nguoi (chot nguoi dung). Quy du tra het phieu -> phieu tu "Ke toan da duyet"
//   ('TN da duyet') ngay, khong cho Ke toan (tien quy da duoc Ke toan xac nhan tu truoc).
// Bat bien: so_du = tong so_tien cua quy_ktv_giao_dich; so_du >= 0 (CHECK); phieu con thieu tien o "Cho KTV chuyen"
// thi quy cua nguoi do = 0 (vi quy duoc tru ngay khi co).
// Chong ghi dua (2 thao tac cung luc): moi batch mo dau bang CAS tren phieu_xuat_kho.da_thanh_toan (quy_cas_guard) +
// CHECK so_du >= 0 -> lech thi CA batch rollback, doc lai va thu lai.
import { nowVN } from "./vnTime";

export type LoaiGiaoDichQuy = "nop_tien" | "tra_phieu" | "hoan_phieu" | "dieu_chinh" | "hoan_tien_ktv";
export const NGUOI_HE_THONG = "he-thong";

const tien = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/** Phieu da duoc KE TOAN chot tien (duyet it nhat 1 khoan chuyen, ke ca du lieu cu) va dang "da thanh toan". Phieu
 * tra HET bang quy du (khong co khoan nao) KHONG tinh - van tu huy / TN doi / tu tinh lai duoc nhu phieu chua chot,
 * vi huy/giam tien se tu hoan ve quy (khong phai hoan tay). `a` = alias/ten bang phieu_xuat_kho. */
export const KE_TOAN_DA_CHOT_TIEN_SQL = (a: string) =>
  `(COALESCE(${a}.trang_thai_chuyen_tien, '') = 'TN da duyet' AND EXISTS (SELECT 1 FROM khoan_chuyen_tien kct WHERE kct.phieu_xuat_kho_id = ${a}.id AND kct.trang_thai = 'Da duyet'))`;

export async function soDuQuy(db: D1Database, email: string | null | undefined): Promise<number> {
  if (!email) return 0;
  const row = await db.prepare("SELECT so_du FROM quy_ktv WHERE email = ?").bind(email).first<{ so_du: number }>();
  return row?.so_du ?? 0;
}

/** Cac lenh ghi 1 giao dich quy (tu tao dong quy_ktv neu chua co). `khoanChuyenMoiNhatCuaPxk` = gan voi khoan
 * chuyen tien VUA INSERT cung batch (lay id lon nhat cua phieu). */
export function lenhGhiQuy(
  db: D1Database,
  g: {
    email: string;
    loai: LoaiGiaoDichQuy;
    soTien: number;
    pxkId?: string | null;
    khoanChuyenMoiNhatCuaPxk?: boolean;
    ghiChu?: string | null;
    nguoi: string;
    now: string;
  },
): D1PreparedStatement[] {
  const khoanSql = g.khoanChuyenMoiNhatCuaPxk
    ? "(SELECT MAX(id) FROM khoan_chuyen_tien WHERE phieu_xuat_kho_id = ?)"
    : "NULL";
  const insert = db.prepare(
    `INSERT INTO quy_ktv_giao_dich (email, loai, so_tien, so_du_sau, phieu_xuat_kho_id, khoan_chuyen_tien_id, ghi_chu, nguoi_tao, ngay_tao)
     SELECT ?, ?, ?, so_du, ?, ${khoanSql}, ?, ?, ? FROM quy_ktv WHERE email = ?`,
  );
  return [
    db.prepare("INSERT INTO quy_ktv (email, so_du, cap_nhat_luc) VALUES (?, 0, ?) ON CONFLICT(email) DO NOTHING").bind(g.email, g.now),
    db.prepare("UPDATE quy_ktv SET so_du = so_du + ?, cap_nhat_luc = ? WHERE email = ?").bind(g.soTien, g.now, g.email),
    g.khoanChuyenMoiNhatCuaPxk
      ? insert.bind(g.email, g.loai, g.soTien, g.pxkId ?? null, g.pxkId ?? null, g.ghiChu ?? null, g.nguoi, g.now, g.email)
      : insert.bind(g.email, g.loai, g.soTien, g.pxkId ?? null, g.ghiChu ?? null, g.nguoi, g.now, g.email),
  ];
}

/** CAS: da_thanh_toan cua phieu phai con dung `mongDoi` - khac thi INSERT vi pham CHECK -> rollback ca batch. */
export function lenhKhoaDaThanhToan(db: D1Database, pxkId: string, mongDoi: number): D1PreparedStatement {
  return db
    .prepare("INSERT INTO quy_cas_guard (x) SELECT 1 WHERE (SELECT da_thanh_toan FROM phieu_xuat_kho WHERE id = ?) IS NOT ?")
    .bind(pxkId, mongDoi);
}

/** CAS: trang_thai_chuyen_tien cua phieu phai dang la `mongDoi` (chan bam duyet/tu choi 2 lan -> nop quy 2 lan). */
export function lenhKhoaTrangThaiChuyenTien(db: D1Database, pxkId: string, mongDoi: string): D1PreparedStatement {
  return db
    .prepare("INSERT INTO quy_cas_guard (x) SELECT 1 WHERE (SELECT trang_thai_chuyen_tien FROM phieu_xuat_kho WHERE id = ?) IS NOT ?")
    .bind(pxkId, mongDoi);
}

interface PxkTien {
  id: string;
  nguoi_nhan_hang: string | null;
  so_tien_can_chuyen: number | null;
  da_thanh_toan: number;
  trang_thai_chuyen_tien: string | null;
  trang_thai_hien_tai: string | null;
}

async function docPxkTien(db: D1Database, pxkId: string): Promise<PxkTien | null> {
  return db
    .prepare(
      "SELECT id, nguoi_nhan_hang, so_tien_can_chuyen, da_thanh_toan, trang_thai_chuyen_tien, trang_thai_hien_tai FROM phieu_xuat_kho WHERE id = ?",
    )
    .bind(pxkId)
    .first<PxkTien>();
}

export interface KetQuaCanBang {
  hoan: number; // tien tra thua da hoan ve quy
  tru: number; // tien quy vua tru tra phieu
  daThanhToanDu: boolean; // phieu vua chuyen sang "Ke toan da duyet" nho quy/da tra truoc
}

/** Can bang tien 1 phieu voi quy (goi sau MOI thay doi co the lam lech: tong phieu doi, phieu can tien, phieu huy,
 * Ke toan duyet/tu choi). An toan goi lap lai (khong co gi lech thi khong ghi gi). `nguoi` co thi ghi log phieu. */
export async function canBangPxk(
  db: D1Database,
  pxkId: string,
  nguoi?: string | null,
  opts: { phanBoTiep?: boolean } = {},
): Promise<KetQuaCanBang> {
  const ketQua: KetQuaCanBang = { hoan: 0, tru: 0, daThanhToanDu: false };
  let email: string | null = null;
  for (let lan = 0; lan < 3; lan++) {
    const pxk = await docPxkTien(db, pxkId);
    if (!pxk || !pxk.nguoi_nhan_hang) return ketQua;
    email = pxk.nguoi_nhan_hang;
    const daHuy = pxk.trang_thai_hien_tai === "Ke toan huy";
    const tong = daHuy ? 0 : Math.max(0, pxk.so_tien_can_chuyen ?? 0);
    const daTra = pxk.da_thanh_toan ?? 0;
    const choTien = !daHuy && pxk.trang_thai_hien_tai === "Dang tao phieu" && pxk.trang_thai_chuyen_tien === "Cho KTV chuyen";
    const now = nowVN();
    const nguoiGhi = nguoi || NGUOI_HE_THONG;

    let hoan = 0;
    let tru = 0;
    if (daTra > tong) hoan = daTra - tong;
    else if (choTien && tong > daTra) tru = Math.min(await soDuQuy(db, email), tong - daTra);
    const sauCung = daTra - hoan + tru;
    const thanhToanDu = choTien && tong > 0 && sauCung >= tong;
    if (hoan === 0 && tru === 0 && !thanhToanDu) return ketQua;

    const lenh: D1PreparedStatement[] = [lenhKhoaDaThanhToan(db, pxkId, daTra)];
    if (hoan > 0) {
      lenh.push(
        ...lenhGhiQuy(db, {
          email, loai: "hoan_phieu", soTien: hoan, pxkId, nguoi: nguoiGhi, now,
          ghiChu: daHuy ? `Hoàn tiền phiếu ${pxkId} đã hủy` : `Hoàn phần trả thừa phiếu ${pxkId} (tổng phiếu còn ${tien(tong)})`,
        }),
        db.prepare("UPDATE phieu_xuat_kho SET da_thanh_toan = da_thanh_toan - ? WHERE id = ?").bind(hoan, pxkId),
      );
    }
    if (tru > 0) {
      lenh.push(
        ...lenhGhiQuy(db, { email, loai: "tra_phieu", soTien: -tru, pxkId, nguoi: nguoiGhi, now, ghiChu: `Trừ quỹ trả phiếu ${pxkId}` }),
        db.prepare("UPDATE phieu_xuat_kho SET da_thanh_toan = da_thanh_toan + ? WHERE id = ?").bind(tru, pxkId),
      );
    }
    if (thanhToanDu) {
      lenh.push(
        db.prepare(
          "UPDATE phieu_xuat_kho SET trang_thai_chuyen_tien = 'TN da duyet', ly_do_tu_choi_chuyen_tien = NULL, tu_choi_chuyen_tien_luc = NULL WHERE id = ?",
        ).bind(pxkId),
      );
    }
    if (nguoi) {
      const logLenh = (trangThai: string, ghiChu: string) =>
        db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
          pxkId, trangThai, nguoi, now, ghiChu,
        );
      if (hoan > 0) lenh.push(logLenh("Hoan tien ve quy", `Hoàn ${tien(hoan)} về quỹ dư của người nhận hàng` + (daHuy ? " (phiếu đã hủy)" : ` — tổng phiếu còn ${tien(tong)}`)));
      if (tru > 0 || thanhToanDu) {
        lenh.push(logLenh(
          "Tru quy du",
          (tru > 0 ? `Trừ ${tien(tru)} từ quỹ dư` : "Đã thanh toán đủ từ trước") +
            (thanhToanDu ? " — phiếu đã thanh toán đủ, không cần chuyển thêm" : ` — còn phải chuyển ${tien(tong - sauCung)}`),
        ));
      }
    }
    try {
      await db.batch(lenh);
    } catch (err) {
      if (lan === 2) throw err;
      continue; // du lieu vua doi (CAS/so du) -> doc lai
    }
    ketQua.hoan += hoan;
    ketQua.tru += tru;
    ketQua.daThanhToanDu = ketQua.daThanhToanDu || thanhToanDu;
    break;
  }
  if (email && ketQua.hoan > 0 && opts.phanBoTiep !== false) await phanBoQuy(db, email, nguoi, pxkId);
  return ketQua;
}

/** Quy cua `email` con tien -> tru cho cac phieu dang "Cho KTV chuyen" con thieu, CU NHAT truoc. */
export async function phanBoQuy(db: D1Database, email: string, nguoi?: string | null, boQuaPxkId?: string): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT id FROM phieu_xuat_kho
       WHERE nguoi_nhan_hang = ? AND trang_thai_hien_tai = 'Dang tao phieu' AND trang_thai_chuyen_tien = 'Cho KTV chuyen'
         AND COALESCE(so_tien_can_chuyen, 0) > da_thanh_toan
       ORDER BY ngay_tao, id`,
    )
    .bind(email)
    .all<{ id: string }>();
  for (const { id } of results) {
    if (id === boQuaPxkId) continue;
    if ((await soDuQuy(db, email)) <= 0) break;
    await canBangPxk(db, id, nguoi, { phanBoTiep: false });
  }
}

export interface KetQuaDuyet {
  thucNhan: number;
  canChuyen: number; // con thieu truoc khi duyet
  tru: number; // quy da tru tra phieu (gom ca tien vua nhan)
  conThieu: number; // sau khi duyet
  soDuQuy: number; // sau khi duyet + phan bo sang phieu khac
}

/** Ke toan DUYET 1 khoan chuyen voi so THUC NHAN (route da kiem quyen + trang thai "KTV da chuyen"). Ghi khoan
 * chuyen tien + nop quy + log, roi can bang phieu (tru quy -> du thi "Ke toan da duyet", thieu thi ve "Cho KTV
 * chuyen" cho KTV chuyen bo sung) va phan bo phan du cho phieu cho khac cua cung nguoi. */
export async function duyetKhoanChuyen(
  db: D1Database,
  pxkId: string,
  thucNhan: number,
  nguoiDuyet: string,
): Promise<KetQuaDuyet | null> {
  const pxk = await db
    .prepare(
      `SELECT id, nguoi_nhan_hang, so_tien_can_chuyen, da_thanh_toan, bang_chung_chuyen_tien_anh, bang_chung_chuyen_tien_url,
         bang_chung_chuyen_tien_ghi_chu, ngay_ktv_chuyen FROM phieu_xuat_kho WHERE id = ?`,
    )
    .bind(pxkId)
    .first<{
      id: string; nguoi_nhan_hang: string | null; so_tien_can_chuyen: number | null; da_thanh_toan: number;
      bang_chung_chuyen_tien_anh: string | null; bang_chung_chuyen_tien_url: string | null;
      bang_chung_chuyen_tien_ghi_chu: string | null; ngay_ktv_chuyen: string | null;
    }>();
  if (!pxk || !pxk.nguoi_nhan_hang) return null;
  const email = pxk.nguoi_nhan_hang;
  const tong = Math.max(0, pxk.so_tien_can_chuyen ?? 0);
  const daTra = pxk.da_thanh_toan ?? 0;
  const canChuyen = Math.max(0, tong - daTra);
  const now = nowVN();
  const anh = pxk.bang_chung_chuyen_tien_anh ?? (pxk.bang_chung_chuyen_tien_url ? JSON.stringify([pxk.bang_chung_chuyen_tien_url]) : null);
  const chenhLech = thucNhan - canChuyen;
  const ghiChuLog =
    `Kế toán xác nhận thực nhận ${tien(thucNhan)} / cần chuyển ${tien(canChuyen)}` +
    (chenhLech > 0 ? ` — dư ${tien(chenhLech)} vào quỹ` : chenhLech < 0 ? ` — thiếu ${tien(-chenhLech)}` : "");

  await db.batch([
    lenhKhoaDaThanhToan(db, pxkId, daTra),
    lenhKhoaTrangThaiChuyenTien(db, pxkId, "KTV da chuyen"),
    db.prepare(
      `INSERT INTO khoan_chuyen_tien (phieu_xuat_kho_id, email_nguoi_chuyen, trang_thai, tong_phieu, da_thanh_toan_truoc,
         so_tien_can_chuyen, so_tien_thuc_nhan, anh, ghi_chu_ktv, ktv_bao_chuyen_luc, nguoi_duyet, duyet_luc)
       VALUES (?, ?, 'Da duyet', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(pxkId, email, tong, daTra, canChuyen, thucNhan, anh, pxk.bang_chung_chuyen_tien_ghi_chu, pxk.ngay_ktv_chuyen, nguoiDuyet, now),
    ...(thucNhan > 0
      ? lenhGhiQuy(db, {
          email, loai: "nop_tien", soTien: thucNhan, pxkId, khoanChuyenMoiNhatCuaPxk: true, nguoi: nguoiDuyet, now,
          ghiChu: `Kế toán xác nhận thực nhận phiếu ${pxkId}`,
        })
      : []),
    // Ve "Cho KTV chuyen" de canBangPxk tru quy: du -> "TN da duyet", thieu -> o lai cho KTV chuyen bo sung.
    db.prepare(
      "UPDATE phieu_xuat_kho SET trang_thai_chuyen_tien = 'Cho KTV chuyen', ly_do_tu_choi_chuyen_tien = NULL, tu_choi_chuyen_tien_luc = NULL WHERE id = ?",
    ).bind(pxkId),
    db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      pxkId, "Ke toan da duyet bang chung chuyen tien", nguoiDuyet, now, ghiChuLog,
    ),
  ]);

  const canBang = await canBangPxk(db, pxkId, nguoiDuyet, { phanBoTiep: false });
  const sau = await docPxkTien(db, pxkId);
  const conThieu = Math.max(0, (sau?.so_tien_can_chuyen ?? 0) - (sau?.da_thanh_toan ?? 0));
  // Con thieu -> KTV phai chuyen lan moi: xoa moc "KTV bao chuyen" cu.
  if (conThieu > 0) await db.prepare("UPDATE phieu_xuat_kho SET ngay_ktv_chuyen = NULL WHERE id = ?").bind(pxkId).run();
  await phanBoQuy(db, email, nguoiDuyet, pxkId);
  return { thucNhan, canChuyen, tru: canBang.tru, conThieu, soDuQuy: await soDuQuy(db, email) };
}

/** Ghi lai 1 lan Ke toan TU CHOI khoan chuyen (so quan ly chuyen tien) - goi CUNG batch voi UPDATE tu choi. */
export function lenhGhiKhoanTuChoi(
  db: D1Database,
  pxk: {
    id: string; nguoi_nhan_hang: string; so_tien_can_chuyen: number | null; da_thanh_toan: number;
    bang_chung_chuyen_tien_anh: string | null; bang_chung_chuyen_tien_ghi_chu: string | null; ngay_ktv_chuyen: string | null;
  },
  lyDo: string,
  nguoi: string,
  now: string,
): D1PreparedStatement {
  const tong = Math.max(0, pxk.so_tien_can_chuyen ?? 0);
  return db
    .prepare(
      `INSERT INTO khoan_chuyen_tien (phieu_xuat_kho_id, email_nguoi_chuyen, trang_thai, tong_phieu, da_thanh_toan_truoc,
         so_tien_can_chuyen, so_tien_thuc_nhan, anh, ghi_chu_ktv, ktv_bao_chuyen_luc, ly_do_tu_choi, nguoi_duyet, duyet_luc)
       VALUES (?, ?, 'Tu choi', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      pxk.id, pxk.nguoi_nhan_hang, tong, pxk.da_thanh_toan ?? 0, Math.max(0, tong - (pxk.da_thanh_toan ?? 0)),
      pxk.bang_chung_chuyen_tien_anh, pxk.bang_chung_chuyen_tien_ghi_chu, pxk.ngay_ktv_chuyen, lyDo, nguoi, now,
    );
}

export interface TienPhieuVaQuy {
  tong: number; // tong gia tri phieu (so_tien_can_chuyen)
  daThanhToan: number;
  conPhaiChuyen: number;
  soDuQuy: number; // quy du hien tai cua nguoi nhan hang
}

export async function tienPhieuVaQuy(db: D1Database, pxkId: string): Promise<TienPhieuVaQuy> {
  const pxk = await docPxkTien(db, pxkId);
  const tong = Math.max(0, pxk?.so_tien_can_chuyen ?? 0);
  const daThanhToan = pxk?.da_thanh_toan ?? 0;
  return { tong, daThanhToan, conPhaiChuyen: Math.max(0, tong - daThanhToan), soDuQuy: await soDuQuy(db, pxk?.nguoi_nhan_hang) };
}

/** Noi dung thong bao KTV "can chuyen tien" - tinh theo so CON PHAI CHUYEN sau khi tru quy du. */
export function moTaCanChuyen(pxkId: string, t: TienPhieuVaQuy): string {
  if (t.tong > 0 && t.conPhaiChuyen === 0) return `PXK ${pxkId} (${tien(t.tong)}) đã được thanh toán bằng quỹ dư của bạn, không cần chuyển tiền`;
  return `PXK ${pxkId} cần bạn chuyển ${tien(t.conPhaiChuyen)}` + (t.daThanhToan > 0 ? ` (tổng ${tien(t.tong)}, đã trừ quỹ/đã trả ${tien(t.daThanhToan)})` : "");
}
