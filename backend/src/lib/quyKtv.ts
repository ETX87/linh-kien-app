// QUY TIEN DU CUA KTV (2026-09-29, migration 0047) - moi dong tien chuyen ve di qua quy cua NGUOI NHAN HANG:
//   Ke toan duyet khoan chuyen (thuc nhan T) -> quy +T -> tu tru quy tra phieu (toi da so con thieu) -> du nam lai quy.
//   Tong phieu giam / phieu huy sau khi da tra -> hoan phan thua ve quy. Quy con tien -> tu tru cho phieu
//   "Cho KTV chuyen" CU NHAT cua cung nguoi (chot nguoi dung). Quy du tra het phieu -> phieu sang "KTV da chuyen"
//   (CHO Ke toan duyet, nhap thuc nhan 0d) - SUA 2026-09-30 (phan hoi KTV thuntmctv: huy phieu da tra tien, tao phieu
//   moi thi phieu moi tu "Ke toan da duyet" du Ke toan chua duyet): chi khi CHINH Ke toan dang duyet/sua khoan cua
//   phieu do moi dong thang "Ke toan da duyet" ('TN da duyet'). Truoc do: quy du -> tu 'TN da duyet' ngay.
// Bat bien: so_du = tong so_tien cua quy_ktv_giao_dich; so_du >= 0 (CHECK); phieu con thieu tien o "Cho KTV chuyen"
// thi quy cua nguoi do = 0 (vi quy duoc tru ngay khi co).
// Chong ghi dua (2 thao tac cung luc): moi batch mo dau bang CAS tren phieu_xuat_kho.da_thanh_toan (quy_cas_guard) +
// CHECK so_du >= 0 -> lech thi CA batch rollback, doc lai va thu lai.
import { nowVN } from "./vnTime";
import type { Env } from "../types";
import { notifyWorkflowTask, emailGsListForPxk } from "./taskNotify";

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
    khoanId?: number; // gan voi 1 khoan chuyen tien co san (sua/huy khoan)
    ghiChu?: string | null;
    nguoi: string;
    now: string;
  },
): D1PreparedStatement[] {
  const khoanSql = g.khoanChuyenMoiNhatCuaPxk
    ? "(SELECT MAX(id) FROM khoan_chuyen_tien WHERE phieu_xuat_kho_id = ?)"
    : g.khoanId != null
      ? String(Math.trunc(g.khoanId))
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

/** Khi phieu da duoc tra DU (bang quy / tien da tra), dat trang thai chuyen tien nao:
 *  "ke-toan"     -> 'TN da duyet' (Ke toan dang duyet/sua khoan cua CHINH phieu nay);
 *  "cho-ke-toan" -> 'KTV da chuyen' = cho Ke toan xac nhan (mac dinh - moi duong tu dong: tao/tinh lai phieu, phan bo quy);
 *  "giu"         -> khong doi (Ke toan vua tu choi: giu "Cho KTV chuyen", tranh vong lap tu choi -> tu cho duyet lai). */
export type KhiTraDu = "ke-toan" | "cho-ke-toan" | "giu";

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
  opts: { phanBoTiep?: boolean; khiTraDu?: KhiTraDu } = {},
): Promise<KetQuaCanBang> {
  const khiTraDu: KhiTraDu = opts.khiTraDu ?? "cho-ke-toan";
  const ketQua: KetQuaCanBang = { hoan: 0, tru: 0, daThanhToanDu: false };
  let email: string | null = null;
  for (let lan = 0; lan < 3; lan++) {
    const pxk = await docPxkTien(db, pxkId);
    if (!pxk || !pxk.nguoi_nhan_hang) return ketQua;
    email = pxk.nguoi_nhan_hang;
    const daHuy = pxk.trang_thai_hien_tai === "Ke toan huy";
    const tong = daHuy ? 0 : Math.max(0, pxk.so_tien_can_chuyen ?? 0);
    const daTra = pxk.da_thanh_toan ?? 0;
    // Khong bat buoc "Dang tao phieu": phieu cu da qua buoc (du lieu truoc gate) duoc Ke toan duyet van phai tru quy.
    const choTien = !daHuy && pxk.trang_thai_chuyen_tien === "Cho KTV chuyen";
    const now = nowVN();
    const nguoiGhi = nguoi || NGUOI_HE_THONG;

    let hoan = 0;
    let tru = 0;
    if (daTra > tong) hoan = daTra - tong;
    else if (choTien && tong > daTra) tru = Math.min(await soDuQuy(db, email), tong - daTra);
    const sauCung = daTra - hoan + tru;
    const thanhToanDu = choTien && tong > 0 && sauCung >= tong && khiTraDu !== "giu";
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
          `UPDATE phieu_xuat_kho SET trang_thai_chuyen_tien = ?, ly_do_tu_choi_chuyen_tien = NULL, tu_choi_chuyen_tien_luc = NULL WHERE id = ?`,
        ).bind(khiTraDu === "ke-toan" ? "TN da duyet" : "KTV da chuyen", pxkId),
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
          (tru > 0 ? `Dùng ${tien(tru)} trong quỹ trả phiếu` : "Đã thanh toán đủ từ trước") +
            (thanhToanDu
              ? khiTraDu === "ke-toan"
                ? " — phiếu đã thanh toán đủ, không cần chuyển thêm"
                : " — đã đủ tiền, KTV không cần chuyển thêm; chờ Kế toán xác nhận"
              : ` — còn phải chuyển ${tien(tong - sauCung)}`),
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
       WHERE nguoi_nhan_hang = ? AND trang_thai_hien_tai != 'Ke toan huy' AND trang_thai_chuyen_tien = 'Cho KTV chuyen'
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
         bang_chung_chuyen_tien_ghi_chu, ngay_ktv_chuyen, bang_chung_tien_doc FROM phieu_xuat_kho WHERE id = ?`,
    )
    .bind(pxkId)
    .first<{
      id: string; nguoi_nhan_hang: string | null; so_tien_can_chuyen: number | null; da_thanh_toan: number;
      bang_chung_chuyen_tien_anh: string | null; bang_chung_chuyen_tien_url: string | null;
      bang_chung_chuyen_tien_ghi_chu: string | null; ngay_ktv_chuyen: string | null; bang_chung_tien_doc: string | null;
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
         so_tien_can_chuyen, so_tien_thuc_nhan, anh, ghi_chu_ktv, ktv_bao_chuyen_luc, nguoi_duyet, duyet_luc, tien_doc_anh)
       VALUES (?, ?, 'Da duyet', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      pxkId, email, tong, daTra, canChuyen, thucNhan, anh, pxk.bang_chung_chuyen_tien_ghi_chu, pxk.ngay_ktv_chuyen, nguoiDuyet, now,
      pxk.bang_chung_tien_doc,
    ),
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

  const canBang = await canBangPxk(db, pxkId, nguoiDuyet, { phanBoTiep: false, khiTraDu: "ke-toan" });
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
    bang_chung_tien_doc?: string | null;
  },
  lyDo: string,
  nguoi: string,
  now: string,
): D1PreparedStatement {
  const tong = Math.max(0, pxk.so_tien_can_chuyen ?? 0);
  return db
    .prepare(
      `INSERT INTO khoan_chuyen_tien (phieu_xuat_kho_id, email_nguoi_chuyen, trang_thai, tong_phieu, da_thanh_toan_truoc,
         so_tien_can_chuyen, so_tien_thuc_nhan, anh, ghi_chu_ktv, ktv_bao_chuyen_luc, ly_do_tu_choi, nguoi_duyet, duyet_luc, tien_doc_anh)
       VALUES (?, ?, 'Tu choi', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      pxk.id, pxk.nguoi_nhan_hang, tong, pxk.da_thanh_toan ?? 0, Math.max(0, tong - (pxk.da_thanh_toan ?? 0)),
      pxk.bang_chung_chuyen_tien_anh, pxk.bang_chung_chuyen_tien_ghi_chu, pxk.ngay_ktv_chuyen, lyDo, nguoi, now,
      pxk.bang_chung_tien_doc ?? null,
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

// ---------------------------------------------------------------------------------------------------------------
// KE TOAN SUA TIEN THUC NHAN / HUY KHOAN DA DUYET (2026-09-29, migration 0049). Quy la "gop chung" cua nguoi nhan hang
// nen sua 1 khoan = bien dong quy (giao dich 'dieu_chinh' gan khoan_chuyen_tien_id), khong sua dong so quy cu.

interface KhoanDoc {
  id: number;
  phieu_xuat_kho_id: string;
  email_nguoi_chuyen: string;
  trang_thai: string;
  da_thanh_toan_truoc: number;
  so_tien_thuc_nhan: number | null;
  ktv_bao_chuyen_luc: string | null;
  duyet_luc: string;
}
export type LoiQuy = { error: string; status: 400 | 404 | 409; message?: string; so_du?: number };

async function docKhoan(db: D1Database, khoanId: number): Promise<KhoanDoc | null> {
  return db
    .prepare(
      `SELECT id, phieu_xuat_kho_id, email_nguoi_chuyen, trang_thai, da_thanh_toan_truoc, so_tien_thuc_nhan, ktv_bao_chuyen_luc, duyet_luc
       FROM khoan_chuyen_tien WHERE id = ?`,
    )
    .bind(khoanId)
    .first<KhoanDoc>();
}

/** CAS: khoan phai con 'Da duyet' voi dung so thuc nhan `mongDoi`. */
function lenhKhoaKhoan(db: D1Database, khoanId: number, mongDoi: number | null): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO quy_cas_guard (x) SELECT 1 WHERE NOT EXISTS (
         SELECT 1 FROM khoan_chuyen_tien WHERE id = ? AND trang_thai = 'Da duyet' AND so_tien_thuc_nhan IS ?)`,
    )
    .bind(khoanId, mongDoi);
}

/** Cac phieu KHAC da duoc quy nay tra tien ke tu luc duyet khoan - de bao Ke toan vi sao quy khong du. */
async function phieuDaDungQuy(db: D1Database, email: string, tuLuc: string, boQuaPxkId: string): Promise<string> {
  const { results } = await db
    .prepare(
      `SELECT phieu_xuat_kho_id AS id, -SUM(so_tien) AS tien FROM quy_ktv_giao_dich
       WHERE email = ? AND loai = 'tra_phieu' AND ngay_tao >= ? AND phieu_xuat_kho_id IS NOT ?
       GROUP BY phieu_xuat_kho_id ORDER BY MIN(id)`,
    )
    .bind(email, tuLuc, boQuaPxkId)
    .all<{ id: string; tien: number }>();
  const ds = results.filter((r) => r.tien > 0);
  return ds.length ? ` Tiền đã dùng trả: ${ds.map((r) => `${r.id} (${tien(r.tien)})`).join(", ")}.` : "";
}

/** Dieu kien SQL (alias k = khoan_chuyen_tien, p = phieu_xuat_kho) de HUY duoc khoan - co `huy_duoc` o danh sach, khop
 * cac kiem tra trong huyKhoanChuyen() (tru dieu kien quy du - chi biet luc bam). */
export const KHOAN_HUY_DUOC_SQL = `(k.trang_thai = 'Da duyet'
  AND NOT EXISTS (SELECT 1 FROM khoan_chuyen_tien k2 WHERE k2.phieu_xuat_kho_id = k.phieu_xuat_kho_id AND k2.id > k.id AND k2.trang_thai = 'Da duyet')
  AND (p.trang_thai_hien_tai = 'Ke toan huy'
       OR (p.trang_thai_hien_tai = 'Dang tao phieu' AND p.trang_thai_chuyen_tien IN ('TN da duyet', 'Cho KTV chuyen'))))`;

/**
 * Sua so THUC NHAN cua 1 khoan da duyet. Tang -> cong quy phan chenh roi tru tiep cho phieu con thieu (phieu nay truoc,
 * roi phieu cho cu nhat). Giam -> tru quy, CHI khi quy con du (chot nguoi dung: khong tu rut lai tien da tra phieu -
 * muon rut thi "Huy khoan" roi duyet lai).
 */
export async function suaThucNhanKhoan(
  db: D1Database,
  khoanId: number,
  thucNhanMoi: number,
  lyDo: string,
  nguoi: string,
): Promise<LoiQuy | { cu: number; moi: number; chenh: number; email: string; pxkId: string; soDuQuy: number }> {
  const k = await docKhoan(db, khoanId);
  if (!k) return { error: "NOT_FOUND", status: 404 };
  if (k.trang_thai !== "Da duyet") return { error: "KHOAN_KHONG_SUA_DUOC", status: 409 };
  const cu = k.so_tien_thuc_nhan ?? 0;
  const chenh = thucNhanMoi - cu;
  if (chenh === 0) return { error: "KHONG_DOI", status: 400 };
  const email = k.email_nguoi_chuyen;
  if (chenh < 0) {
    const soDu = await soDuQuy(db, email);
    if (soDu < -chenh) {
      return {
        error: "QUY_KHONG_DU",
        status: 409,
        so_du: soDu,
        message:
          `Quỹ chỉ còn ${tien(soDu)}, không trừ được ${tien(-chenh)} (tiền đã được dùng trả phiếu).` +
          (await phieuDaDungQuy(db, email, k.duyet_luc, "")) +
          " Nếu duyệt nhầm, hãy Hủy khoản rồi duyệt lại với số đúng.",
      };
    }
  }
  const now = nowVN();
  const ghiChu = `Sửa thực nhận khoản #${k.id} phiếu ${k.phieu_xuat_kho_id}: ${tien(cu)} → ${tien(thucNhanMoi)} — ${lyDo}`;
  try {
    await db.batch([
      lenhKhoaKhoan(db, k.id, k.so_tien_thuc_nhan),
      db.prepare(
        `UPDATE khoan_chuyen_tien SET so_tien_thuc_nhan = ?, thuc_nhan_goc = COALESCE(thuc_nhan_goc, ?), sua_luc = ?, nguoi_sua = ?, ly_do_sua = ?
         WHERE id = ?`,
      ).bind(thucNhanMoi, cu, now, nguoi, lyDo, k.id),
      ...lenhGhiQuy(db, { email, loai: "dieu_chinh", soTien: chenh, pxkId: k.phieu_xuat_kho_id, khoanId: k.id, ghiChu, nguoi, now }),
      db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
        k.phieu_xuat_kho_id, "Ke toan sua tien thuc nhan", nguoi, now,
        `Sửa số thực nhận ${tien(cu)} → ${tien(thucNhanMoi)} (${chenh > 0 ? "+" : "−"}${tien(Math.abs(chenh))} quỹ): ${lyDo}`,
      ),
    ]);
  } catch {
    // CAS (khoan vua bi sua/huy) hoac quy vua bi tru (CHECK so_du >= 0).
    return { error: "STATE_CHANGED", status: 409 };
  }
  if (chenh > 0) {
    await canBangPxk(db, k.phieu_xuat_kho_id, nguoi, { phanBoTiep: false, khiTraDu: "ke-toan" });
    await phanBoQuy(db, email, nguoi);
  }
  return { cu, moi: thucNhanMoi, chenh, email, pxkId: k.phieu_xuat_kho_id, soDuQuy: await soDuQuy(db, email) };
}

/**
 * HUY 1 khoan da duyet (Ke toan duyet nham). Rut lai phan phieu da duoc tra tu lan duyet do (da_thanh_toan ve muc
 * truoc duyet), tru so thuc nhan khoi quy, phieu ve "KTV da chuyen" (lai hang cho Ke toan, giu anh) de duyet lai so
 * dung hoac Tu choi. Chi khoan DUYET MOI NHAT cua phieu, phieu con "Dang tao phieu" (chua chot) hoac da huy (khi do
 * tien da hoan ve quy - chi tru quy). Quy khong du (phan du da tra phieu khac) -> chan, bao phieu da dung.
 */
export async function huyKhoanChuyen(
  db: D1Database,
  khoanId: number,
  lyDo: string,
  nguoi: string,
): Promise<LoiQuy | { thucNhan: number; rutPhieu: number; email: string; pxkId: string; phieuDaHuy: boolean; soDuQuy: number }> {
  const k = await docKhoan(db, khoanId);
  if (!k) return { error: "NOT_FOUND", status: 404 };
  if (k.trang_thai !== "Da duyet") return { error: "KHOAN_KHONG_HUY_DUOC", status: 409 };
  const sauDo = await db
    .prepare("SELECT 1 AS x FROM khoan_chuyen_tien WHERE phieu_xuat_kho_id = ? AND id > ? AND trang_thai = 'Da duyet'")
    .bind(k.phieu_xuat_kho_id, k.id)
    .first();
  if (sauDo) return { error: "KHOAN_KHONG_PHAI_MOI_NHAT", status: 409 };
  const pxk = await docPxkTien(db, k.phieu_xuat_kho_id);
  if (!pxk) return { error: "NOT_FOUND", status: 404 };
  const phieuDaHuy = pxk.trang_thai_hien_tai === "Ke toan huy";
  if (!phieuDaHuy) {
    if (pxk.trang_thai_hien_tai !== "Dang tao phieu") return { error: "PXK_DA_QUA_BUOC_TAO_PHIEU", status: 409 };
    if (pxk.trang_thai_chuyen_tien === "KTV da chuyen") return { error: "KTV_DANG_BAO_CHUYEN", status: 409 };
    if (pxk.trang_thai_chuyen_tien !== "TN da duyet" && pxk.trang_thai_chuyen_tien !== "Cho KTV chuyen") {
      return { error: "INVALID_STATE", status: 409 };
    }
  }
  const email = k.email_nguoi_chuyen;
  const thucNhan = k.so_tien_thuc_nhan ?? 0;
  const daTra = pxk.da_thanh_toan ?? 0;
  const daTraSau = phieuDaHuy ? daTra : Math.min(k.da_thanh_toan_truoc ?? 0, daTra);
  const rutPhieu = daTra - daTraSau;
  const soDu = await soDuQuy(db, email);
  if (soDu + rutPhieu < thucNhan) {
    return {
      error: "QUY_KHONG_DU",
      status: 409,
      so_du: soDu,
      message:
        `Không hủy được: cần trừ ${tien(thucNhan)} nhưng quỹ${rutPhieu ? ` (kể cả ${tien(rutPhieu)} rút lại từ phiếu này)` : ""} chỉ có ${tien(soDu + rutPhieu)} — phần dư đã được dùng trả phiếu khác.` +
        (await phieuDaDungQuy(db, email, k.duyet_luc, k.phieu_xuat_kho_id)) +
        " Có thể sửa giảm số thực nhận trong phạm vi quỹ còn, hoặc Điều chỉnh quỹ sau khi xử lý các phiếu đó.",
    };
  }
  const now = nowVN();
  const lenh: D1PreparedStatement[] = [
    lenhKhoaKhoan(db, k.id, k.so_tien_thuc_nhan),
    lenhKhoaDaThanhToan(db, pxk.id, daTra),
    ...(phieuDaHuy ? [] : [lenhKhoaTrangThaiChuyenTien(db, pxk.id, pxk.trang_thai_chuyen_tien ?? "")]),
  ];
  // Thu tu: cong (rut lai tu phieu) TRUOC khi tru so thuc nhan - CHECK so_du >= 0 kiem tung cau lenh.
  if (rutPhieu > 0) {
    lenh.push(
      ...lenhGhiQuy(db, {
        email, loai: "hoan_phieu", soTien: rutPhieu, pxkId: pxk.id, khoanId: k.id, nguoi, now,
        ghiChu: `Rút lại ${tien(rutPhieu)} đã trả phiếu ${pxk.id} do hủy khoản #${k.id}`,
      }),
      db.prepare("UPDATE phieu_xuat_kho SET da_thanh_toan = ? WHERE id = ?").bind(daTraSau, pxk.id),
    );
  }
  if (thucNhan > 0) {
    lenh.push(
      ...lenhGhiQuy(db, {
        email, loai: "dieu_chinh", soTien: -thucNhan, pxkId: pxk.id, khoanId: k.id, nguoi, now,
        ghiChu: `Hủy khoản #${k.id} phiếu ${pxk.id} (thực nhận ${tien(thucNhan)}) — ${lyDo}`,
      }),
    );
  }
  lenh.push(
    db.prepare("UPDATE khoan_chuyen_tien SET trang_thai = 'Da huy', huy_luc = ?, nguoi_huy = ?, ly_do_huy = ? WHERE id = ?").bind(now, nguoi, lyDo, k.id),
  );
  if (!phieuDaHuy) {
    lenh.push(
      db.prepare(
        `UPDATE phieu_xuat_kho SET trang_thai_chuyen_tien = 'KTV da chuyen', ngay_ktv_chuyen = COALESCE(ngay_ktv_chuyen, ?, ?),
           ly_do_tu_choi_chuyen_tien = NULL, tu_choi_chuyen_tien_luc = NULL WHERE id = ?`,
      ).bind(k.ktv_bao_chuyen_luc, now, pxk.id),
    );
  }
  lenh.push(
    db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      pxk.id, "Ke toan huy duyet chuyen tien", nguoi, now,
      `Hủy xác nhận đã nhận ${tien(thucNhan)}: ${lyDo}` +
        (phieuDaHuy ? " — phiếu đã hủy, trừ khỏi quỹ" : ` — ${rutPhieu ? `rút lại ${tien(rutPhieu)} đã trả, ` : ""}phiếu về chờ Kế toán duyệt lại`),
    ),
  );
  try {
    await db.batch(lenh);
  } catch {
    return { error: "STATE_CHANGED", status: 409 };
  }
  // Quy con tien cu (truoc lan duyet) -> tra phieu cho khac (phieu nay dang "KTV da chuyen" nen khong bi tru).
  await phanBoQuy(db, email, nguoi);
  return { thucNhan, rutPhieu, email, pxkId: pxk.id, phieuDaHuy, soDuQuy: await soDuQuy(db, email) };
}

/** Bao KTV nhan hang: phieu bi huy sau khi da tra tien -> tien da hoan ve quy (goi khi canBangPxk tra ve hoan > 0). */
export async function thongBaoHoanQuyPhieuHuy(env: Env, db: D1Database, pxkId: string, hoan: number): Promise<void> {
  if (hoan <= 0) return;
  const pxk = await docPxkTien(db, pxkId);
  if (!pxk?.nguoi_nhan_hang) return;
  const soDu = await soDuQuy(db, pxk.nguoi_nhan_hang);
  await notifyWorkflowTask(env, db, {
    cat1Emails: [pxk.nguoi_nhan_hang],
    otherRoles: [],
    emailGsList: await emailGsListForPxk(db, pxkId),
    pastActors: [],
    title: "Quỹ & chuyển tiền",
    body: `PXK ${pxkId} đã hủy — ${tien(hoan)} đã trả cho phiếu được hoàn về quỹ của bạn (quỹ hiện còn ${tien(soDu)}, tự trừ vào phiếu cần chuyển tiền tiếp theo)`,
    linkType: "phieu_xuat_kho",
    linkId: pxkId,
  });
}

/** Don dang MANG tien da thanh toan (dat_don_hang.tien_da_tra, migration 0056 - TN bo don khoi phieu da tra tien, chon
 * "Đã thanh toán") vao 1 phieu -> chuyen tien sang da_thanh_toan cua phieu, xoa o don + ghi log phieu. Them vao CUNG batch
 * voi INSERT phieu_xuat_kho_dong; taiTinhPxk/canBangPxk chay sau do lo phan thua/thieu (thua -> quy, du -> cho Ke toan). */
export function lenhNhanTienDaTraDon(db: D1Database, pxkId: string, donHangId: string, nguoi: string, now: string): D1PreparedStatement[] {
  return [
    db.prepare(
      `INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
       SELECT ?, 'Da them don vao phieu', ?, ?, 'Đơn ' || id || ' (' || COALESCE(ma_lk, '') || ') mang theo ' || replace(printf('%,d', tien_da_tra), ',', '.') || 'đ đã thanh toán'
         || COALESCE(' ở phiếu ' || tien_da_tra_pxk, '') || ' → cộng vào tiền đã trả của phiếu'
       FROM dat_don_hang WHERE id = ? AND tien_da_tra > 0`,
    ).bind(pxkId, nguoi, now, donHangId),
    db.prepare(
      "UPDATE phieu_xuat_kho SET da_thanh_toan = da_thanh_toan + COALESCE((SELECT tien_da_tra FROM dat_don_hang WHERE id = ?), 0) WHERE id = ?",
    ).bind(donHangId, pxkId),
    db.prepare("UPDATE dat_don_hang SET tien_da_tra = 0, tien_da_tra_email = NULL, tien_da_tra_pxk = NULL WHERE id = ? AND tien_da_tra > 0").bind(donHangId),
  ];
}
