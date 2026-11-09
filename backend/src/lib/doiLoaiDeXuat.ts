// DOI LOAI DE XUAT cua 1 don (chot 2026-10-30, v1.424 - "nếu đơn hàng chưa được xử lý chuyển tiền, kế toán duyệt, kho tiếp nhận chờ hàng =>
// cho KTV, GS, KT, KHO đổi loại đề xuất (xác định đầy đủ các rủi ro nếu có), nếu loại đề xuất khác phiếu đang giữ thì tự đẩy ra add vào phiếu
// phù hợp hoặc tạo phiếu mới"). Route: POST /api/dat-mua-lk/don-hang/:id/doi-loai-de-xuat (validate truong bat buoc o route).
//
// DIEU KIEN (DOI_LDE_DUOC_SQL - dung chung cho co `duoc_doi_loai_de_xuat` o chi tiet don + chan o route):
//  - don Mua / Cong no (KHONG tra hang - doi luong dung form Sua cua TN; KHONG don gui bu nhan thieu; KHONG don cong no doi tac - gan doi tac
//    + phieu rieng), con mo (khong tu choi / huy);
//  - CHUA xu ly chuyen tien: don khong mang tien da tra (tien_da_tra = 0); phieu dang chua don (neu co) con "Dang tao phieu", chua Ma MISA,
//    chua co tien (da_thanh_toan = 0), KTV chua bao chuyen ("KTV da chuyen") va Ke toan chua duyet tien (KE_TOAN_DA_CHOT_TIEN_SQL);
//  - Kho CHUA tiep nhan cho hang: don "Cho hang" ma ticket dang o Kho da tiep nhan / Kho da cap nhat / Cho mua hang / Mua hang da dat -> chan.
// QUYEN (duocDoiLoaiDeXuat): KTV la nguoi tao / nguoi nhan hang, Giam sat (theo doiKhuVucDonSql - GS khu vuc / tao ho / khu vuc xem them),
//  Ke toan + TN (Ke toan lam thay TN), Kho, Admin.
//
// RUI RO da xu ly (danh gia lai dung bo quyet dinh luc tao don - danhGiaPhieu - roi DINH TUYEN lai):
//  1. Lach tran cong no: tao MUA roi doi sang CÔNG NỢ -> xet lai tran (tru phan cong no cua chinh don dang duoc tinh, tranh tinh 2 lan); vuot
//     tran + chua co ma EO -> "Cho GS duyet" (roi phieu).
//  2. Lach buoc TBP: LK dac thu doi tu loai bo qua TBP (MUA / HỖ TRỢ / TRỪ CÔNG NỢ) sang loai can TBP -> "Cho TBP xac nhan" (roi phieu).
//  3. Lach chuyen tien / gia 0: doi sang loai phat sinh tien (MUA / TRỪ CÔNG NỢ) -> bat_buoc_chuyen_tien tinh lai, LK gia 0 (khong bat "Cho
//     phép giá 0đ") -> chan; nguoi nhan chua co Ma MISA -> chan doi sang cong no.
//  4. Ton kho: sang TRỪ CÔNG NỢ -> doi chieu ton CUA KTV (thieu -> chan); roi TRỪ CÔNG NỢ / doi nhom -> xet lai ton kho cong ty FIFO
//     (donDuTonKhoCongTy): du -> "TN da duyet", thieu -> "Cho thanh toan" (co tien) / "Cho hang" (+ ticket); dang "Cho hang" van thieu -> giu.
//  5. Phieu: 1 phieu chi 1 loai_don + 1 nhom loai de xuat (nhomLoaiDeXuat) -> khac nhom phieu dang giu (hoac don roi khoi trang thai vao phieu)
//     -> go khoi phieu (phieu het don thi tu huy) roi tu gom vao phieu phu hop / tao phieu moi (bundleAutoApprovedIntoPxk). Cung nhom -> tinh
//     lai tien + loai chiet khau ca phieu. Tong ngay chiet khau cua KTV doi -> taiTinhPxkMoCuaKtv.
//  6. Truong bat buoc theo loai moi (Chinh sach + Ma YCSC/Lada voi cong no, Ma YCSC voi HỖ TRỢ / MUA HÀNG CÓ ID) - route bat gui kem.
//  7. Ticket thieu hang chua Kho tiep nhan: don roi "Cho hang" -> dong ticket ("Da ket thuc" neu duyet, "Da huy bo" neu sang buoc khac).
//  8. Bam 2 lan / nguoi khac vua doi: CAS theo version.
//  Cac buoc nguoi duyet con dang cho (Cho Tram duyet / Cho TN duyet) giu nguyen - buoc duyet sau se dinh tuyen theo loai moi.
import type { Env, AppUser } from "../types";
import { nowVN } from "./vnTime";
import { KE_TOAN_DA_CHOT_TIEN_SQL, thongBaoHoanQuyPhieuHuy } from "./quyKtv";
import { doiKhuVucDonSql } from "./scopeDatMua";
import { deriveLoaiDon, boQuaTbpChoDacThu, canDoiChieuCongNo, nguCanhNhan, danhGiaPhieu, donDuTonKhoCongTy, tacDongSauDinhTuyen, baoNguoiTaoDon, moTaThieuTon } from "./tuDongDuyet";
import { laTruCongNo, laMuaCongNoDoiTac, taiTinhPxk, taiTinhPxkMoCuaKtv } from "./pxkRecalculate";
import { getMocTinhCongNo } from "./congNoKtv";
import { goDonKhoiPxk, laVanPhong, danhDauVanPhongTacDong } from "./pxkTuHuy";
import { bundleAutoApprovedIntoPxk } from "./pxkAutoBundle";
import { nhomPhieu, nhomPhieuSql } from "./nhomLoaiDeXuat";
import { notifyWorkflowTask, emailsForRoleOrQC, MUA_CONG_NO_ROLES } from "./taskNotify";

const TRANG_THAI_DOI_DUOC = ["Cho Tram duyet", "Cho TBP xac nhan", "Cho GS duyet", "Cho TN duyet", "Cho thanh toan", "TN da duyet", "Cho hang"];
// Ticket thieu hang da duoc Kho / Mua hang nhan xu ly (= THIEU_LK_KHO_DANG_XU_LY o routes/datMuaLinhKien.ts - doi 1 ben doi ca 2).
const TICKET_DA_TIEP_NHAN = ["Kho da tiep nhan", "Kho da cap nhat", "Cho mua hang", "Mua hang da dat"];

const sqlList = (xs: string[]) => xs.map((x) => `'${x}'`).join(", ");

/** Don `a` (dat_don_hang) con doi duoc loai de xuat (chua tinh quyen nguoi xem). Khong bind. */
export const DOI_LDE_DUOC_SQL = (a: string) => `(
  ${a}.loai_don IN ('mua', 'cong_no') AND ${a}.gui_bu_nhan_thieu_id IS NULL AND ${a}.doi_tac_ma IS NULL
  AND ${a}.trang_thai_hien_tai IN (${sqlList(TRANG_THAI_DOI_DUOC)})
  AND COALESCE(${a}.tien_da_tra, 0) = 0
  AND NOT (${a}.trang_thai_hien_tai = 'Cho hang' AND EXISTS (
    SELECT 1 FROM thieu_lk dl_t WHERE dl_t.dat_don_hang_id = ${a}.id
      AND (SELECT dl_l.trang_thai FROM thieu_lk_log dl_l WHERE dl_l.thieu_lk_id = dl_t.id ORDER BY dl_l.id DESC LIMIT 1) IN (${sqlList(TICKET_DA_TIEP_NHAN)})))
  AND NOT EXISTS (
    SELECT 1 FROM phieu_xuat_kho_dong dl_d JOIN phieu_xuat_kho dl_p ON dl_p.id = dl_d.phieu_xuat_kho_id
    WHERE dl_d.dat_don_hang_id = ${a}.id AND dl_p.trang_thai_hien_tai <> 'Ke toan huy'
      AND (dl_p.trang_thai_hien_tai <> 'Dang tao phieu' OR TRIM(COALESCE(dl_p.ma_misa, '')) <> '' OR COALESCE(dl_p.da_thanh_toan, 0) > 0
           OR COALESCE(dl_p.trang_thai_chuyen_tien, '') = 'KTV da chuyen' OR ${KE_TOAN_DA_CHOT_TIEN_SQL("dl_p")}))
)`;

/** Quyen doi loai de xuat (chua tinh trang thai don). */
export async function duocDoiLoaiDeXuat(db: D1Database, user: AppUser, donId: string): Promise<boolean> {
  if (user.vai_tro === "Admin" || user.la_tac_nghiep || user.la_ke_toan || user.la_kho) return true;
  const d = await db.prepare("SELECT nguoi_tao, nguoi_nhan_hang FROM dat_don_hang WHERE id = ?").bind(donId).first<{ nguoi_tao: string; nguoi_nhan_hang: string | null }>();
  if (!d) return false;
  if (d.nguoi_tao === user.email || d.nguoi_nhan_hang === user.email) return true;
  if (user.vai_tro !== "Giam sat") return false;
  const q = doiKhuVucDonSql("d", user);
  return !!(await db.prepare(`SELECT 1 FROM dat_don_hang d WHERE d.id = ? AND ${q.sql}`).bind(donId, ...q.binds).first());
}

/** Ly do don KHONG doi duoc (de bao loi ro cho nguoi dung) - null = doi duoc. */
export async function lyDoKhongDoiDuoc(db: D1Database, donId: string): Promise<string | null> {
  const r = await db
    .prepare(
      `SELECT d.loai_don, d.gui_bu_nhan_thieu_id, d.doi_tac_ma, d.trang_thai_hien_tai, COALESCE(d.tien_da_tra, 0) AS tien_da_tra, ${DOI_LDE_DUOC_SQL("d")} AS duoc,
              (SELECT p.trang_thai_hien_tai FROM phieu_xuat_kho_dong x JOIN phieu_xuat_kho p ON p.id = x.phieu_xuat_kho_id
               WHERE x.dat_don_hang_id = d.id AND p.trang_thai_hien_tai <> 'Ke toan huy' LIMIT 1) AS pxk_tt
       FROM dat_don_hang d WHERE d.id = ?`,
    )
    .bind(donId)
    .first<{ loai_don: string; gui_bu_nhan_thieu_id: string | null; doi_tac_ma: string | null; trang_thai_hien_tai: string; tien_da_tra: number; duoc: number; pxk_tt: string | null }>();
  if (!r) return "NOT_FOUND";
  if (r.duoc) return null;
  if (r.loai_don === "tra_hang") return "DOI_LUONG_TRA_HANG";
  if (r.doi_tac_ma) return "DOI_LOAI_CONG_NO_DOI_TAC";
  if (r.gui_bu_nhan_thieu_id) return "DON_GUI_BU";
  if (!TRANG_THAI_DOI_DUOC.includes(r.trang_thai_hien_tai)) return "DON_DA_DONG";
  if (r.tien_da_tra > 0) return "DON_DA_THANH_TOAN";
  if (r.trang_thai_hien_tai === "Cho hang" && !r.pxk_tt) return "DOI_LDE_KHO_DA_TIEP_NHAN";
  if (r.pxk_tt && r.pxk_tt !== "Dang tao phieu") return "PXK_DA_GUI_KE_TOAN";
  return "PXK_DA_XU_LY_CHUYEN_TIEN";
}

export interface DoiLdeInput {
  loaiDeXuat: string; // da chuan hoa theo danh muc
  chinhSach: string | null;
  maYcsc: string | null;
  maLada: string | null;
  ghiChu: string | null;
}

export type DoiLdeKetQua =
  | { ok: true; trangThai: string; trangThaiCu: string; pxkMoi: string | null; pxkCu: string | null; doiPhieu: boolean }
  | { error: string; status: 400 | 403 | 404 | 409; message?: string };

const tbpCan = (dacThu: number, lde: string) => !!dacThu && !boQuaTbpChoDacThu(lde);

export async function doiLoaiDeXuatDon(
  env: Env, db: D1Database, user: AppUser, donId: string, input: DoiLdeInput, waitUntil: (p: Promise<unknown>) => void,
): Promise<DoiLdeKetQua> {
  if (!(await duocDoiLoaiDeXuat(db, user, donId))) return { error: "FORBIDDEN_ROLE", status: 403 };
  const lyDo = await lyDoKhongDoiDuoc(db, donId);
  if (lyDo === "NOT_FOUND") return { error: lyDo, status: 404 };
  if (lyDo) return { error: lyDo, status: 409 };

  const d = await db
    .prepare(
      `SELECT ddh.version, ddh.loai_don, ddh.loai_de_xuat, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat, ddh.so_luong_thuc_xuat,
              ddh.gia_chot, ddh.gia_de_xuat, ddh.nguoi_tao, ddh.nguoi_nhan_hang, ddh.email_gs, ddh.ma_eo, ddh.so_tien_cong_no, ddh.updated_at,
              ddh.trang_thai_hien_tai AS trang_thai, ddh.chinh_sach, ddh.ma_yeu_cau_su_co, ddh.ma_lada, ddh.yeu_cau_hoa_don, COALESCE(ddh.kh_chuyen_khoan, 0) AS kh_chuyen_khoan,
              COALESCE(ddh.dac_thu_thu_cong, lk.dac_thu, 0) AS dac_thu, lk.cho_phep_gia_0, lk.gia_tri_cong_no,
              (SELECT x.phieu_xuat_kho_id FROM phieu_xuat_kho_dong x JOIN phieu_xuat_kho p ON p.id = x.phieu_xuat_kho_id
               WHERE x.dat_don_hang_id = ddh.id AND p.trang_thai_hien_tai <> 'Ke toan huy' LIMIT 1) AS pxk_id
       FROM dat_don_hang ddh LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk WHERE ddh.id = ?`,
    )
    .bind(donId)
    .first<{
      version: number; loai_don: string; loai_de_xuat: string | null; ma_lk: string; ten_lk_snapshot: string | null; so_luong_de_xuat: number;
      so_luong_thuc_xuat: number | null; gia_chot: number | null; gia_de_xuat: number | null; nguoi_tao: string; nguoi_nhan_hang: string | null;
      email_gs: string | null; ma_eo: string | null; so_tien_cong_no: number | null; updated_at: string | null; trang_thai: string;
      chinh_sach: string | null; ma_yeu_cau_su_co: string | null; ma_lada: string | null; yeu_cau_hoa_don: string | null; kh_chuyen_khoan: number;
      dac_thu: number; cho_phep_gia_0: number | null; gia_tri_cong_no: number | null; pxk_id: string | null;
    }>();
  if (!d) return { error: "NOT_FOUND", status: 404 };
  const ldeCu = d.loai_de_xuat ?? "";
  const ldeMoi = input.loaiDeXuat;
  if (ldeMoi === ldeCu) return { error: "LOAI_DE_XUAT_KHONG_DOI", status: 400 };
  const loaiDonMoi = deriveLoaiDon(ldeMoi);
  if (loaiDonMoi === "tra_hang") return { error: "DOI_LUONG_TRA_HANG", status: 409 };
  if (laMuaCongNoDoiTac(ldeMoi)) return { error: "DOI_LOAI_CONG_NO_DOI_TAC", status: 409 };
  // Don "KH đã chuyển khoản về công ty" (migration 0111) chi co nghia voi don phat sinh tien (mua / TRỪ CÔNG NỢ).
  if (d.kh_chuyen_khoan && !(loaiDonMoi === "mua" || laTruCongNo(ldeMoi))) return { error: "KH_CHUYEN_KHOAN_CHI_DON_MUA", status: 409 };
  if (!d.nguoi_nhan_hang) return { error: "NOT_FOUND", status: 404 };

  // ---- Danh gia lai bang CUNG bo quyet dinh luc tao don ----
  const ctx = await nguCanhNhan(db, d.nguoi_nhan_hang, d.nguoi_tao);
  const kv = await db.prepare("SELECT COALESCE(khu_vuc_chon, khu_vuc_ma) AS kv FROM dat_don_hang WHERE id = ?").bind(donId).first<{ kv: string | null }>();
  if (kv?.kv) ctx.khuVuc = kv.kv;
  const sl = d.so_luong_de_xuat;
  const phieu = await danhGiaPhieu(db, ctx, [{
    ma_lk: d.ma_lk, loai_de_xuat: ldeMoi, so_luong: sl, gia_ban: d.gia_de_xuat, dac_thu: d.dac_thu,
    cho_phep_gia_0: d.cho_phep_gia_0, gia_tri_cong_no: d.gia_tri_cong_no,
  }]);
  const kq = phieu.dong[0];
  // Gia chot tay (TN) thang gia ban: gia chot 0 -> khong con tien phai chuyen.
  const batBuocChuyenTien = kq.batBuocChuyenTien && (d.gia_chot ?? d.gia_de_xuat ?? 0) * sl > 0;
  // Ton KTV: computeTonKtvConLai da tru chinh don nay khi don CU cung la TRỪ CÔNG NỢ -> khong chan lai.
  if (kq.loi && !(kq.loi.ma === "TRU_CONG_NO_THIEU_TON" && laTruCongNo(ldeCu))) return { error: kq.loi.ma, status: 409, message: kq.loi.thongDiep };

  // Tran cong no: cong no chot da gom phan cong no cua CHINH don (don cong no "TN da duyet" sau moc) -> tru ra truoc khi cong gia tri moi.
  let danhGiaCongNo: "Du" | "Khong du" | null = null;
  if (kq.danhGiaCongNo != null && canDoiChieuCongNo(loaiDonMoi, ldeMoi)) {
    const moc = await getMocTinhCongNo(db);
    const dangTinh =
      d.loai_don === "cong_no" && !laTruCongNo(ldeCu) && d.trang_thai === "TN da duyet" && (moc == null || (d.updated_at ?? "") > moc) ? d.so_tien_cong_no ?? 0 : 0;
    danhGiaCongNo = phieu.congNoChot - dangTinh + phieu.tongMoiCongNo <= (ctx.tranCongNo ?? 0) ? "Du" : "Khong du";
  }

  // ---- Dinh tuyen trang thai moi ----
  const ttCu = d.trang_thai;
  let ttMoi = ttCu;
  let lyDoDinhTuyen = "";
  const canGs = danhGiaCongNo === "Khong du" && !d.ma_eo;
  if (ttCu === "Cho Tram duyet" || ttCu === "Cho TN duyet") {
    // Buoc nguoi duyet dang cho - giu, duyet xong se dinh tuyen theo loai moi.
  } else if (tbpCan(d.dac_thu, ldeMoi) && (!tbpCan(d.dac_thu, ldeCu) || ttCu === "Cho TBP xac nhan")) {
    ttMoi = "Cho TBP xac nhan";
    lyDoDinhTuyen = "linh kiện đặc thù, loại mới cần TBP DVBH xác nhận";
  } else if (canGs) {
    ttMoi = "Cho GS duyet";
    lyDoDinhTuyen = `vượt trần công nợ: công nợ chốt + đơn > trần ${Math.round(ctx.tranCongNo ?? 0).toLocaleString("vi-VN")}đ — chờ Giám sát khu vực duyệt (nhập mã EO)`;
  } else if (laTruCongNo(ldeMoi)) {
    ttMoi = "TN da duyet";
    lyDoDinhTuyen = `tồn kho công nợ của KTV còn ${Math.max(0, kq.ton ?? 0)}, đặt ${sl} — đủ`;
  }
  // Ton kho cong ty: tinh SAU khi ghi loai moi (FIFO theo thu tu tao don - khong tinh don tao sau).
  const canXetTonKho = !(ttCu === "Cho Tram duyet" || ttCu === "Cho TN duyet") && ttMoi === ttCu && !laTruCongNo(ldeMoi) && !(ttCu === "Cho TBP xac nhan" && tbpCan(d.dac_thu, ldeMoi)) && !(ttCu === "Cho GS duyet" && canGs);

  const now = nowVN();
  const chinhSach = input.chinhSach ?? (laTruCongNo(ldeMoi) ? d.chinh_sach ?? "Trong CSBH" : d.chinh_sach);
  const thayDoi = `Đổi loại đề xuất ${ldeCu || "—"} → ${ldeMoi}${input.ghiChu ? `: ${input.ghiChu}` : ""}`;
  const r = await db
    .prepare(
      `UPDATE dat_don_hang SET loai_don = ?, loai_de_xuat = ?, so_tien_cong_no = ?, danh_gia_cong_no = ?, bat_buoc_chuyen_tien = ?,
         chinh_sach = ?, ma_yeu_cau_su_co = ?, ma_lada = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    )
    .bind(
      loaiDonMoi, ldeMoi, kq.soTienCongNo, danhGiaCongNo, batBuocChuyenTien ? 1 : 0,
      chinhSach, input.maYcsc ?? d.ma_yeu_cau_su_co, input.maLada ?? d.ma_lada, now, donId, d.version,
    )
    .run();
  if (!r.meta.changes) return { error: "STATE_CHANGED", status: 409 };

  if (canXetTonKho) {
    const ton = await donDuTonKhoCongTy(db, donId);
    const moTa = moTaThieuTon(ton.ton, sl, ton.khuVuc);
    if (ton.du) { ttMoi = "TN da duyet"; lyDoDinhTuyen = `${moTa} — đủ hàng`; }
    else if (ttCu === "Cho hang") { lyDoDinhTuyen = `${moTa} — vẫn chờ hàng`; }
    else if (batBuocChuyenTien) { ttMoi = "Cho thanh toan"; lyDoDinhTuyen = `${moTa} — thiếu hàng, cần chuyển tiền trước`; }
    else { ttMoi = "Cho hang"; lyDoDinhTuyen = `${moTa} — thiếu hàng, chờ hàng`; }
  }
  const doiTrangThai = ttMoi !== ttCu;
  await db.batch([
    ...(doiTrangThai ? [db.prepare("UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1 WHERE id = ? AND trang_thai_hien_tai = ?").bind(ttMoi, donId, ttCu)] : []),
    db.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong) VALUES (?, ?, ?, ?, ?, 0)").bind(
      donId, ttMoi, user.email, now, `${thayDoi}${lyDoDinhTuyen ? ` | ${lyDoDinhTuyen}` : ""}`.slice(0, 2000),
    ),
  ]);

  // ---- Phieu xuat kho ----
  let doiPhieu = false;
  const pxkCu = d.pxk_id;
  // Trang thai duoc nam trong phieu: da duyet / cho thanh toan, hoac buoc duyet cu (Cho Tram / TN duyet) cua don chuyen tien truoc.
  const vaoPhieuDuoc = ttMoi === "TN da duyet" || ttMoi === "Cho thanh toan" || (!doiTrangThai && batBuocChuyenTien && (ttMoi === "Cho TN duyet" || ttMoi === "Cho Tram duyet"));
  if (pxkCu) {
    const p = await db
      .prepare(
        `SELECT p.loai_don, EXISTS (SELECT 1 FROM phieu_xuat_kho_dong x JOIN dat_don_hang o ON o.id = x.dat_don_hang_id
           WHERE x.phieu_xuat_kho_id = p.id AND o.id <> ? AND ${nhomPhieuSql("o")} <> ?) AS khac_nhom
         FROM phieu_xuat_kho p WHERE p.id = ?`,
      )
      .bind(donId, nhomPhieu({ loai_de_xuat: ldeMoi, yeu_cau_hoa_don: d.yeu_cau_hoa_don, kh_chuyen_khoan: d.kh_chuyen_khoan }), pxkCu)
      .first<{ loai_don: string | null; khac_nhom: number }>();
    doiPhieu = !vaoPhieuDuoc || p?.loai_don !== loaiDonMoi || !!p?.khac_nhom;
    if (doiPhieu) {
      const go = await goDonKhoiPxk(db, pxkCu, donId, user.email, "Đổi loại đề xuất, chuyển đơn", `${ldeCu || "—"} → ${ldeMoi}`, true, false);
      if (go.hoanQuy > 0) waitUntil(thongBaoHoanQuyPhieuHuy(env, db, pxkCu, go.hoanQuy));
    } else {
      await taiTinhPxk(db, pxkCu, false, true, user.email);
    }
    if (laVanPhong(user)) await danhDauVanPhongTacDong(db, pxkCu, user.email);
  }
  // Ticket thieu hang (chua Kho tiep nhan - da chan o tren) cua don vua roi "Cho hang".
  if (ttCu === "Cho hang" && doiTrangThai) {
    await db
      .prepare(
        `INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
         SELECT t.id, ?, ?, ?, ? FROM thieu_lk t
         WHERE t.dat_don_hang_id = ? AND COALESCE((SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1), '') NOT IN ('Da huy bo', 'Da ket thuc')`,
      )
      .bind(ttMoi === "TN da duyet" ? "Da ket thuc" : "Da huy bo", user.email, now, `${thayDoi} — đơn gốc chuyển ${ttMoi}`.slice(0, 1000), donId)
      .run();
  }
  if (doiTrangThai) {
    // Vao phieu (TN da duyet / Cho thanh toan, don chua trong phieu) | Cho hang -> mo ticket | Cho GS -> bao GS.
    await tacDongSauDinhTuyen(env, db, donId, ttMoi, user.email, `${thayDoi}: ${lyDoDinhTuyen}`, waitUntil);
    if (ttMoi === "Cho TBP xac nhan") {
      const emailGsList = d.email_gs ? [d.email_gs] : [];
      waitUntil(
        (async () =>
          notifyWorkflowTask(env, db, {
            cat1Emails: await emailsForRoleOrQC(db, "la_tp_dvbh", emailGsList),
            otherRoles: MUA_CONG_NO_ROLES.filter((x) => x !== "la_tp_dvbh"),
            emailGsList,
            pastActors: [],
            title: "Đặt mua linh kiện",
            body: `Đơn "${d.ten_lk_snapshot ?? d.ma_lk} (x${sl})" đổi loại đề xuất sang ${ldeMoi}, cần bạn xác nhận linh kiện đặc thù`,
            linkType: "don_hang",
            linkId: donId,
          }))(),
      );
    }
  } else if (doiPhieu && vaoPhieuDuoc) {
    await bundleAutoApprovedIntoPxk(env, db, user.email, d.nguoi_nhan_hang, loaiDonMoi, [{ donHangId: donId, soTien: 0 }], { boQuaPxk: pxkCu ?? undefined });
  }
  await taiTinhPxkMoCuaKtv(db, d.nguoi_nhan_hang, user.email);

  const sau = await db
    .prepare(
      `SELECT (SELECT x.phieu_xuat_kho_id FROM phieu_xuat_kho_dong x JOIN phieu_xuat_kho p ON p.id = x.phieu_xuat_kho_id
               WHERE x.dat_don_hang_id = ? AND p.trang_thai_hien_tai <> 'Ke toan huy' LIMIT 1) AS pxk_id`,
    )
    .bind(donId)
    .first<{ pxk_id: string | null }>();
  const pxkMoi = sau?.pxk_id ?? null;
  if (d.nguoi_tao !== user.email) {
    const phieuTxt = pxkMoi && pxkMoi !== pxkCu ? `, đơn chuyển sang phiếu ${pxkMoi}` : pxkCu && !pxkMoi ? `, đơn rời phiếu ${pxkCu}` : "";
    waitUntil(baoNguoiTaoDon(env, db, d.nguoi_tao, "mo_lai", `Đơn hàng "${d.ten_lk_snapshot ?? d.ma_lk} (x${sl})" được đổi loại đề xuất ${ldeCu || "—"} → ${ldeMoi}${doiTrangThai ? ` — ${lyDoDinhTuyen}` : ""}${phieuTxt}`, donId));
  }
  return { ok: true, trangThai: ttMoi, trangThaiCu: ttCu, pxkMoi, pxkCu, doiPhieu: pxkMoi !== pxkCu };
}
