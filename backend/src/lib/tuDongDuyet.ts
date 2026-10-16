// TU DONG DUYET 100% - bo Tac nghiep khoi khau duyet don (chot 2026-10-14, migration 0080). TN chi con len phieu/MISA.
// "Bo quyet dinh" DUNG CHUNG cho: tao don tay (POST /phieu-dat), Import Excel, kiem tra truoc tren form (POST /phieu-dat/kiem-tra)
// va cac buoc duyet sau (Tram/TBP/GS duyet xong, Ke toan xac nhan tien, Kho bao hang ve) - sua quy tac o DAY, khong o tung route.
//
// Quy tac (chot nguoi dung 2026-10-14):
//  - Ve tinh KHONG tao don (route chan).
//  - CHAN tao (bao ly do): don TRỪ CÔNG NỢ thieu ton kho CUA KTV; don phat sinh tien (MUA / TRỪ CÔNG NỢ) gia 0/chua co gia
//    (tru LK "Cho phép giá 0đ" o Bang gia); don cong no khi nguoi nhan chua co Ma MISA (chi duoc dat don mua).
//  - LK dac thu (tru loai MUA/HỖ TRỢ/TRỪ CÔNG NỢ) -> "Cho TBP xac nhan"; TBP duyet (vuot tran thi nhap ma EO) -> kiem tra ton.
//  - Don cong no / ho tro VUOT TRAN -> "Cho GS duyet" (GS khu vuc cua KTV = dat_don_hang.email_gs, nhap ma EO); khu vuc chua co
//    GS thi don nam cho toi khi co GS. TG12 (KH tra gop) khong tinh cong no.
//  - Kiem tra TON KHO CONG TY theo khu vuc cua don, TRU DAN theo thu tu tao (don truoc du, don sau thieu):
//      du -> "TN da duyet" (tu dong) + vao phieu;
//      thieu + don co tien -> "Cho thanh toan" (vao phieu, KTV chuyen tien; Ke toan xac nhan xong -> kiem tra lai: du thi duyet,
//                             van thieu thi roi phieu MANG THEO tien sang "Cho hang");
//      thieu + khong tien  -> "Cho hang" (mo ticket thieu hang - Kho tiep nhan hoac tu choi).
//  - Kho bao hang ve -> don tu duyet + vao phieu; Kho tu choi / ticket bi huy -> don tu huy (tien da tra ve quy, bao KTV).
import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { computeTonKhoChot } from "./tonKhoCongTy";
import { computeTonKtvConLai } from "./tonKhoKtv";
import { computeCongNoChot } from "./congNoKtv";
import { laTruCongNo, khongTinhCongNo, taiTinhPxkMoCuaKtv } from "./pxkRecalculate";
import { nextSequentialId } from "./idCounter";
import { bundleAutoApprovedIntoPxk } from "./pxkAutoBundle";
import { goDonKhoiPxk, pxkChuaDonChuaDuyet } from "./pxkTuHuy";
import { pushThieuLkToKhovan, buildWorkUrl } from "./khovanPushClient";
import { notifyWorkflowTask, emailsForRoleOrQC, MUA_CONG_NO_ROLES } from "./taskNotify";
import { sendPushToUser } from "./webPush";
import { phanBoQuy, thongBaoHoanQuyPhieuHuy } from "./quyKtv";
import { THANH_TOAN_DON_SQL } from "./trangThaiDonPxk";

export type LoaiDon = "mua" | "cong_no" | "tra_hang";

// Suy loai_don tu ten loai de xuat (dung chung tao tay / import / kiem tra truoc).
// So KHONG phan biet hoa/thuong (2026-10-15): file import tung ghi "Trả hàng công nợ"/"Trừ công nợ" chu thuong -> roi vao "mua",
// don tra hang di luong mua (tu duyet, cho chuyen tien). Ban sao FE: helpers.ts deriveLoaiDon.
export function deriveLoaiDon(loaiDeXuatGoc: string): LoaiDon {
  const loaiDeXuat = loaiDeXuatGoc.normalize("NFC").toUpperCase();
  if (loaiDeXuat.includes("TRẢ HÀNG")) return "tra_hang";
  if (loaiDeXuat.includes("CÔNG NỢ") || loaiDeXuat.includes("HỖ TRỢ") || loaiDeXuat.includes("TRỪ CÔNG NỢ") || loaiDeXuat.includes("THẺ BẢO HÀNH"))
    return "cong_no";
  return "mua";
}

// Loai de xuat chua "MUA" / "HỖ TRỢ" / "TRỪ CÔNG NỢ" bo qua buoc TBP du LK dac thu (chot 2026-09-13 + 2026-09-29).
export function boQuaTbpChoDacThu(loaiDeXuat: string): boolean {
  const upper = loaiDeXuat.toUpperCase();
  return upper.includes("MUA") || upper.includes("HỖ TRỢ") || laTruCongNo(loaiDeXuat);
}

// Don "phat sinh tien" (KTV phai chuyen tien): Mua + TRỪ CÔNG NỢ - cung tap voi bat_buoc_chuyen_tien (migration 0057).
export function laDonPhatSinhTien(loaiDon: string, loaiDeXuat: string): boolean {
  return loaiDon === "mua" || laTruCongNo(loaiDeXuat);
}

// Don can doi chieu TRAN CONG NO (cong no / ho tro thuc su): khong tinh TRỪ CÔNG NỢ (doi chieu ton KTV) va TG12 (KH tra gop).
export function canDoiChieuCongNo(loaiDon: string, loaiDeXuat: string): boolean {
  return loaiDon === "cong_no" && !laTruCongNo(loaiDeXuat) && !khongTinhCongNo(loaiDeXuat); // + HỖ TRỢ 0 ĐỒNG (2026-10-15)
}

// Khu vuc DU KIEN cua don sap tao - BAN SAO chuoi trigger trg_ddh_khu_vuc_i (migration 0055): KTV nhan -> khu vuc dat hang nguoi
// nhan -> KTV tao -> khu vuc dat hang nguoi tao -> GS phu trach (nhan, roi tao) -> 'CHUA_CO'. Doi trigger thi doi ca day.
export async function khuVucDonDuKien(db: D1Database, nguoiNhan: string, nguoiTao: string): Promise<string> {
  const r = await db
    .prepare(
      `SELECT COALESCE(
         CASE WHEN EXISTS (SELECT 1 FROM ktv_lien_he k WHERE k.email_dang_nhap = ?)
           THEN COALESCE((SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = ? AND k.khu_vuc_ma IS NOT NULL LIMIT 1), 'CHUA_CO') END,
         (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = ? AND u.khu_vuc_dat_hang IS NOT NULL),
         (SELECT k.khu_vuc_ma FROM ktv_lien_he k WHERE k.email_dang_nhap = ? AND k.khu_vuc_ma IS NOT NULL LIMIT 1),
         (SELECT u.khu_vuc_dat_hang FROM users u WHERE u.email = ? AND u.khu_vuc_dat_hang IS NOT NULL),
         (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = ? AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
         (SELECT kv.ma FROM khu_vuc kv WHERE kv.gs_email = ? AND kv.ma <> 'CHUA_CO' ORDER BY kv.stt, kv.ma LIMIT 1),
         'CHUA_CO') AS kv`,
    )
    .bind(nguoiNhan, nguoiNhan, nguoiNhan, nguoiTao, nguoiTao, nguoiNhan, nguoiTao)
    .first<{ kv: string }>();
  return r?.kv ?? "CHUA_CO";
}

// Ngu canh nguoi nhan hang de danh gia 1 phieu dat.
export interface NguCanhNhan {
  nguoiNhan: string;
  nguoiTao: string;
  maKtv: string | null; // ma KTV cua nguoi nhan (ton kho KTV, cong no) - null = khong phai KTV
  tranCongNo: number | null;
  coMaMisa: boolean; // ma MISA: cua ma KTV dang hoat dong, hoac users.ma_misa (tai khoan khong phai KTV / KH le)
  // Nguoi nhan la Giam sat (2026-10-16, chot "Không xét trần cho GS"): GS co ma nhan hang de quan ly ton kho/cong no (migration 0085)
  // nhung don cong no GS tu nhan KHONG doi chieu tran (tran trong = 0 -> moi don thanh "Cho GS duyet", GS tu duyet don minh).
  laGs: boolean;
  khuVuc: string;
}

export async function nguCanhNhan(db: D1Database, nguoiNhan: string, nguoiTao: string): Promise<NguCanhNhan> {
  const r = await db
    .prepare(
      `SELECT
         (SELECT k.ma_ktv FROM ktv_lien_he k WHERE k.email_dang_nhap = ? ORDER BY CASE WHEN TRIM(COALESCE(k.ma_misa, '')) <> '' THEN 0 ELSE 1 END,
            COALESCE(k.ngung_hoat_dong, 0), k.ma_ktv LIMIT 1) AS ma_ktv,
         (SELECT k.cong_no FROM ktv_lien_he k WHERE k.email_dang_nhap = ? ORDER BY CASE WHEN TRIM(COALESCE(k.ma_misa, '')) <> '' THEN 0 ELSE 1 END,
            COALESCE(k.ngung_hoat_dong, 0), k.ma_ktv LIMIT 1) AS cong_no,
         (EXISTS (SELECT 1 FROM ktv_lien_he k WHERE LOWER(TRIM(k.email_dang_nhap)) = LOWER(?) AND COALESCE(k.ngung_hoat_dong, 0) = 0
                    AND TRIM(COALESCE(k.ma_misa, '')) <> '')
          OR EXISTS (SELECT 1 FROM users u WHERE u.email = ? AND TRIM(COALESCE(u.ma_misa, '')) <> '')) AS co_misa,
         EXISTS (SELECT 1 FROM users u WHERE u.email = ? AND u.vai_tro = 'Giam sat') AS la_gs`,
    )
    .bind(nguoiNhan, nguoiNhan, nguoiNhan, nguoiNhan, nguoiNhan)
    .first<{ ma_ktv: string | null; cong_no: number | null; co_misa: number; la_gs: number }>();
  return {
    nguoiNhan,
    nguoiTao,
    maKtv: r?.ma_ktv ?? null,
    tranCongNo: r?.cong_no ?? null,
    coMaMisa: !!r?.co_misa,
    laGs: !!r?.la_gs,
    khuVuc: await khuVucDonDuKien(db, nguoiNhan, nguoiTao),
  };
}

export type TrangThaiKhoiTao = "Cho TBP xac nhan" | "Cho GS duyet" | "TN da duyet" | "Cho thanh toan" | "Cho hang" | "Cho ke toan duyet mem";

export interface DongDanhGia {
  ma_lk: string;
  loai_de_xuat: string;
  so_luong: number;
  gia_ban: number | null;
  dac_thu: number | null;
  cho_phep_gia_0: number | null;
  gia_tri_cong_no: number | null;
}

export interface KetQuaDong {
  loi?: { ma: string; thongDiep: string };
  trangThai: TrangThaiKhoiTao;
  loaiDon: LoaiDon;
  batBuocChuyenTien: boolean;
  soTienCongNo: number | null; // gia tri cong no tam tinh (don cong no thuc su), null voi don khac
  danhGiaCongNo: "Du" | "Khong du" | null;
  ton: number | null; // ton con lai TRUOC dong nay (kho cong ty, hoac ton KTV voi TRỪ CÔNG NỢ)
  nguonTon: "kho" | "ktv" | null;
}

export interface KetQuaPhieu {
  dong: KetQuaDong[];
  coLoi: boolean;
  danhGiaCongNo: "Du" | "Khong du" | null;
  congNoChot: number;
  tongMoiCongNo: number;
  tranCongNo: number | null;
  khuVuc: string;
}

const tienVnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

// Danh gia CA phieu dat (chua ghi gi) - thu tu dong = thu tu tru ton. Dung cho tao tay, import, kiem tra truoc.
export async function danhGiaPhieu(db: D1Database, ctx: NguCanhNhan, dongs: DongDanhGia[]): Promise<KetQuaPhieu> {
  // Cong no: chot 1 LAN cho ca phieu (cong no chot hien tai + tong cong no tam tinh cac dong cong no thuc su) so voi tran.
  let tongMoiCongNo = 0;
  for (const d of dongs) {
    const loaiDon = deriveLoaiDon(d.loai_de_xuat);
    if (canDoiChieuCongNo(loaiDon, d.loai_de_xuat)) tongMoiCongNo += (d.gia_tri_cong_no ?? 0) * d.so_luong;
  }
  const coDongCongNo = !ctx.laGs && dongs.some((d) => canDoiChieuCongNo(deriveLoaiDon(d.loai_de_xuat), d.loai_de_xuat));
  const congNoChot = coDongCongNo && ctx.maKtv ? await computeCongNoChot(db, ctx.maKtv) : 0;
  // Chua gan tran (hoac khong phai KTV) = tran 0 (quy uoc 2026-09-04).
  const danhGiaCongNo: "Du" | "Khong du" | null = coDongCongNo ? (congNoChot + tongMoiCongNo <= (ctx.tranCongNo ?? 0) ? "Du" : "Khong du") : null;

  const daDungKho = new Map<string, number>();
  const daDungKtv = new Map<string, number>();
  const tonKhoCache = new Map<string, number>();
  const tonKtvCache = new Map<string, number>();
  const ketQua: KetQuaDong[] = [];

  for (const d of dongs) {
    const lde = d.loai_de_xuat;
    const loaiDon = deriveLoaiDon(lde);
    const ma = d.ma_lk;
    const kq: KetQuaDong = {
      trangThai: "TN da duyet", loaiDon, batBuocChuyenTien: false, soTienCongNo: null, danhGiaCongNo: null, ton: null, nguonTon: null,
    };
    ketQua.push(kq);
    if (loaiDon === "tra_hang") {
      kq.trangThai = "Cho ke toan duyet mem";
      continue;
    }
    const coTien = laDonPhatSinhTien(loaiDon, lde);
    kq.batBuocChuyenTien = coTien && (d.gia_ban ?? 0) * d.so_luong > 0;
    if (loaiDon === "cong_no" && !laTruCongNo(lde)) {
      kq.soTienCongNo = khongTinhCongNo(lde) ? 0 : (d.gia_tri_cong_no ?? 0) * d.so_luong;
      kq.danhGiaCongNo = canDoiChieuCongNo(loaiDon, lde) && !ctx.laGs ? danhGiaCongNo : null;
    }

    // ---- Cac truong hop KHONG cho tao ----
    if (coTien && !((d.gia_ban ?? 0) > 0) && !d.cho_phep_gia_0) {
      kq.loi = { ma: "GIA_0_KHONG_DAT_DUOC", thongDiep: `${ma}: linh kiện chưa có giá bán (giá 0đ) — không đặt được đơn mua / trừ công nợ. Liên hệ Mua hàng cập nhật giá hoặc bật "Cho phép giá 0đ" ở Bảng giá.` };
    } else if (loaiDon === "cong_no" && !ctx.coMaMisa) {
      kq.loi = { ma: "CHUA_CO_MA_MISA_CONG_NO", thongDiep: `${ma}: người nhận hàng chưa có Mã MISA — chỉ được đặt đơn mua hàng, không đặt được đơn công nợ / hỗ trợ.` };
    }

    if (laTruCongNo(lde)) {
      // TRỪ CÔNG NỢ: ton kho CUA KTV nhan hang, tru dan cac dong cung ma trong phieu - thieu thi KHONG cho tao.
      kq.nguonTon = "ktv";
      if (!ctx.maKtv) {
        kq.loi ??= { ma: "TRU_CONG_NO_KHONG_PHAI_KTV", thongDiep: `${ma}: người nhận hàng không phải KTV (không có tồn kho công nợ) — không đặt được đơn trừ công nợ.` };
        continue;
      }
      if (!tonKtvCache.has(ma)) tonKtvCache.set(ma, await computeTonKtvConLai(db, ctx.maKtv, ma));
      const ton = tonKtvCache.get(ma)! - (daDungKtv.get(ma) ?? 0);
      kq.ton = ton;
      if (ton < d.so_luong) {
        kq.loi ??= { ma: "TRU_CONG_NO_THIEU_TON", thongDiep: `${ma}: tồn kho công nợ của KTV còn ${Math.max(0, ton)}, đặt ${d.so_luong} — không đủ để trừ công nợ.` };
      }
      // Dong bi chan khong giu ton (dong sau cung ma van duoc xet tren ton con lai that).
      if (!kq.loi) daDungKtv.set(ma, (daDungKtv.get(ma) ?? 0) + d.so_luong);
      kq.trangThai = d.dac_thu && !boQuaTbpChoDacThu(lde) ? "Cho TBP xac nhan" : "TN da duyet";
      continue;
    }

    // Ton kho cong ty (moi dong mua/cong no khac) - tru dan theo thu tu dong, ke ca dong sap di TBP/GS (giu hang tu luc dat).
    kq.nguonTon = "kho";
    if (!tonKhoCache.has(ma)) tonKhoCache.set(ma, await computeTonKhoChot(db, ctx.khuVuc, ma));
    const ton = tonKhoCache.get(ma)! - (daDungKho.get(ma) ?? 0);
    kq.ton = ton;
    if (!kq.loi) daDungKho.set(ma, (daDungKho.get(ma) ?? 0) + d.so_luong);

    if (d.dac_thu && !boQuaTbpChoDacThu(lde)) kq.trangThai = "Cho TBP xac nhan";
    else if (kq.danhGiaCongNo === "Khong du") kq.trangThai = "Cho GS duyet";
    else if (ton >= d.so_luong) kq.trangThai = "TN da duyet";
    else kq.trangThai = kq.batBuocChuyenTien ? "Cho thanh toan" : "Cho hang";
  }

  return {
    dong: ketQua,
    coLoi: ketQua.some((k) => !!k.loi),
    danhGiaCongNo,
    congNoChot,
    tongMoiCongNo,
    tranCongNo: ctx.tranCongNo,
    khuVuc: ctx.khuVuc,
  };
}

// Mo ta ngan ket qua 1 dong cho thong bao/log. Ghi ro KHU VUC kho da kiem tra (2026-10-15, "minh bạch cho người đặt hàng hiểu"
// - ton kho xet theo khu vuc cua don, KTV thay kho khac con hang se khong hieu vi sao thieu).
export function moTaThieuTon(ton: number | null, soLuong: number, khuVuc?: string | null): string {
  return `kho công ty${khuVuc ? ` khu vực ${khuVuc}` : ""} còn ${Math.max(0, ton ?? 0)}, đặt ${soLuong}`;
}

// ===================== Sau khi don da ton tai trong DB =====================

interface DonDinhTuyen {
  id: string;
  ngay_tao: string;
  loai_don: string;
  loai_de_xuat: string | null;
  ma_lk: string;
  so_luong_de_xuat: number;
  nguoi_nhan_hang: string | null;
  nguoi_tao: string;
  email_gs: string | null;
  khu_vuc: string | null;
  bat_buoc_chuyen_tien: number;
  ma_xuat_kho: string | null;
  danh_gia_cong_no: string | null;
  ma_eo: string | null;
  dac_thu: number;
  thanh_toan: string | null;
  ten_lk_snapshot: string;
}

async function docDon(db: D1Database, donHangId: string): Promise<DonDinhTuyen | null> {
  return await db
    .prepare(
      `SELECT ddh.id, ddh.ngay_tao, ddh.loai_don, ddh.loai_de_xuat, ddh.ma_lk, ddh.so_luong_de_xuat, ddh.nguoi_nhan_hang, ddh.nguoi_tao,
              ddh.email_gs, COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) AS khu_vuc, ddh.bat_buoc_chuyen_tien, ddh.ma_xuat_kho,
              ddh.danh_gia_cong_no, ddh.ma_eo, COALESCE(ddh.dac_thu_thu_cong, lk.dac_thu, 0) AS dac_thu, ddh.ten_lk_snapshot,
              ${THANH_TOAN_DON_SQL("ddh")} AS thanh_toan
       FROM dat_don_hang ddh LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk WHERE ddh.id = ?`,
    )
    .bind(donHangId)
    .first<DonDinhTuyen>();
}

// Don DA ton tai con du ton kho cong ty khong (uu tien don tao truoc - khong tinh don tao sau).
export async function donDuTonKhoCongTy(db: D1Database, donHangId: string): Promise<{ du: boolean; ton: number; khuVuc: string | null }> {
  const d = await docDon(db, donHangId);
  if (!d) return { du: false, ton: 0, khuVuc: null };
  const ton = await computeTonKhoChot(db, d.khu_vuc, d.ma_lk, { id: d.id, ngay_tao: d.ngay_tao });
  return { du: ton >= d.so_luong_de_xuat, ton, khuVuc: d.khu_vuc };
}

/** Trang thai TIEP THEO sau khi 1 buoc duyet truoc (Tram / TBP / GS) dong y - CHUA ghi gi. `tuBuoc`:
 *  "tram" -> con xet TBP (dac thu) va GS (vuot tran chua co ma EO);  "tbp" -> TBP da xu ly cong no (ma EO neu vuot tran) -> chi
 *  con ton kho;  "gs" -> chi con ton kho. TRỪ CÔNG NỢ thieu ton KTV (hiem - da chan luc tao) -> "Cho TN duyet" (ngoai le). */
export async function trangThaiSauDuyet(
  db: D1Database, donHangId: string, tuBuoc: "tram" | "tbp" | "gs",
): Promise<{ trangThai: string; ton: number | null; khuVuc?: string | null }> {
  const d = await docDon(db, donHangId);
  if (!d) return { trangThai: "Cho TN duyet", ton: null };
  const lde = d.loai_de_xuat ?? "";
  if (tuBuoc === "tram") {
    if (d.dac_thu && !boQuaTbpChoDacThu(lde)) return { trangThai: "Cho TBP xac nhan", ton: null };
    if (canDoiChieuCongNo(d.loai_don, lde) && d.danh_gia_cong_no === "Khong du" && !d.ma_eo) return { trangThai: "Cho GS duyet", ton: null };
  }
  if (laTruCongNo(lde)) {
    // computeTonKtvConLai da tru CA don nay (moi don TRỪ CÔNG NỢ chua huy) -> du khi con >= 0.
    const kt = d.nguoi_nhan_hang
      ? await db.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE email_dang_nhap = ? LIMIT 1").bind(d.nguoi_nhan_hang).first<{ ma_ktv: string }>()
      : null;
    if (!kt) return { trangThai: "Cho TN duyet", ton: null };
    const conLai = await computeTonKtvConLai(db, kt.ma_ktv, d.ma_lk);
    return { trangThai: conLai >= 0 ? "TN da duyet" : "Cho TN duyet", ton: conLai };
  }
  const { du, ton, khuVuc } = await donDuTonKhoCongTy(db, donHangId);
  if (du) return { trangThai: "TN da duyet", ton, khuVuc };
  // Thieu hang: don co tien chua thanh toan -> cho KTV chuyen tien truoc (nam trong phieu); da thanh toan / khong tien -> cho hang.
  const daThanhToan = d.thanh_toan === "da_thanh_toan" || d.thanh_toan === "khong_can";
  return { trangThai: d.bat_buoc_chuyen_tien && !daThanhToan ? "Cho thanh toan" : "Cho hang", ton, khuVuc };
}

// ID ly do "Kho het hang" (co quan_ly_don_thieu_linh_kien) gan cho ticket tu dong - lay ly do dau tien dang bat co co do.
async function lyDoTicketTuDong(db: D1Database): Promise<number | null> {
  const r = await db
    .prepare(
      `SELECT id FROM settings_ly_do_cham WHERE bat_tat = 1 AND quan_ly_don_thieu_linh_kien = 1 AND he_thong_su_dung LIKE '%Mua hàng%'
       ORDER BY CASE WHEN ten_ly_do LIKE '%Kho hết hàng%' THEN 0 ELSE 1 END, stt LIMIT 1`,
    )
    .first<{ id: number }>();
  return r?.id ?? null;
}

/** Mo ticket thieu hang TU DONG cho 1 don vua sang "Cho hang" (khong kiem tra/doi trang thai don - ben goi da ghi). nguoiTao ticket =
 *  `nguoiTaoTicket` (nguoi tao don - de KTV tu huy ticket = huy don). Dong ticket cu con mo truoc. Bao Kho + khovan. */
export async function moTicketChoHangTuDong(
  env: Env, db: D1Database, donHangId: string, nguoiTaoTicket: string, lyDo: string, waitUntil?: (p: Promise<unknown>) => void,
): Promise<string> {
  const now = nowVN();
  await db
    .prepare(
      `INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
       SELECT t.id, 'Da huy bo', ?, ?, 'Tự động đóng: mở ticket chờ hàng mới cho đơn' FROM thieu_lk t
       WHERE t.dat_don_hang_id = ? AND COALESCE((SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1), '') NOT IN ('Da huy bo', 'Da ket thuc')`,
    )
    .bind(nguoiTaoTicket, now, donHangId)
    .run();
  const thieuLkId = await nextSequentialId(db, "thieu_lk", "TLK", 6);
  await db.batch([
    db.prepare("INSERT INTO thieu_lk (id, dat_don_hang_id, ly_do, ly_do_cham_id, nguoi_tao, ngay_tao) VALUES (?, ?, ?, ?, ?, ?)").bind(
      thieuLkId, donHangId, lyDo.slice(0, 500), await lyDoTicketTuDong(db), nguoiTaoTicket, now,
    ),
    db.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho kho xu ly', ?, ?, ?)").bind(
      thieuLkId, nguoiTaoTicket, now, `Tự động: ${lyDo}`.slice(0, 1000),
    ),
  ]);
  const don = await db
    .prepare("SELECT ma_lk, ten_lk_snapshot, so_luong_de_xuat, nguoi_tao, email_gs FROM dat_don_hang WHERE id = ?")
    .bind(donHangId)
    .first<{ ma_lk: string; ten_lk_snapshot: string | null; so_luong_de_xuat: number; nguoi_tao: string; email_gs: string | null }>();
  const viec = (async () => {
    if (!don) return;
    await pushThieuLkToKhovan(
      env, thieuLkId, `Thiếu LK ${don.ten_lk_snapshot ?? don.ma_lk} (tự động, của ${don.nguoi_tao})`, "Thiếu linh kiện - chờ Kho tìm nguồn hàng",
      buildWorkUrl(env, thieuLkId),
    );
    const emailGsList = don.email_gs ? [don.email_gs] : [];
    await notifyWorkflowTask(env, db, {
      cat1Emails: await emailsForRoleOrQC(db, "la_kho", emailGsList),
      otherRoles: MUA_CONG_NO_ROLES.filter((r) => r !== "la_kho"),
      emailGsList,
      pastActors: [],
      title: "Đặt mua linh kiện",
      body: `Đơn "${don.ten_lk_snapshot ?? don.ma_lk} (x${don.so_luong_de_xuat})" thiếu hàng, cần Kho xác nhận chờ hàng hoặc từ chối`,
      linkType: "don_hang",
      linkId: donHangId,
    });
  })().catch((e) => console.error("[moTicketChoHangTuDong]", e));
  if (waitUntil) waitUntil(viec);
  else await viec;
  return thieuLkId;
}

/** Thong bao cho NGUOI TAO don (bang thong_bao_ktv + Web Push). */
export async function baoNguoiTaoDon(
  env: Env, db: D1Database, nguoiTao: string, loai: string, noiDung: string, donHangId: string,
): Promise<void> {
  await db
    .prepare("INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, ?, ?, 'don_hang', ?, ?)")
    .bind(nguoiTao, loai, noiDung, donHangId, nowVN())
    .run();
  await sendPushToUser(env, nguoiTao, { title: "Đặt mua linh kiện", body: noiDung, url: "/" });
}

/** Bao GS khu vuc (email_gs cua don) co don vuot tran cho duyet. Khu vuc chua co GS -> khong bao (don cho toi khi co GS). */
export async function baoGsChoDuyet(env: Env, db: D1Database, donHangId: string): Promise<void> {
  const d = await db
    .prepare("SELECT email_gs, ten_lk_snapshot, so_luong_de_xuat FROM dat_don_hang WHERE id = ?")
    .bind(donHangId)
    .first<{ email_gs: string | null; ten_lk_snapshot: string; so_luong_de_xuat: number }>();
  if (!d?.email_gs) return;
  await notifyWorkflowTask(env, db, {
    cat1Emails: [d.email_gs],
    otherRoles: [],
    emailGsList: [d.email_gs],
    pastActors: [],
    title: "Đặt mua linh kiện",
    body: `Đơn "${d.ten_lk_snapshot} (x${d.so_luong_de_xuat})" vượt trần công nợ, chờ bạn duyệt (nhập mã EO)`,
    linkType: "don_hang",
    linkId: donHangId,
  });
}

/** Ghi trang thai moi cho don (khong CAS - luong he thong tu dong noi tiep) + 1 dong log. */
async function ghiTrangThaiDon(db: D1Database, donHangId: string, trangThai: string, nguoi: string, ghiChu: string, tuDong: boolean, tuTrangThai: string): Promise<boolean> {
  const now = nowVN();
  const r = await db
    .prepare("UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1, updated_at = ? WHERE id = ? AND trang_thai_hien_tai = ?")
    .bind(trangThai, now, donHangId, tuTrangThai)
    .run();
  if (!r.meta.changes) return false;
  await db
    .prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(donHangId, trangThai, nguoi, now, ghiChu.slice(0, 2000), tuDong ? 1 : 0)
    .run();
  return true;
}

/** Tac dong phu SAU KHI don vua vao trang thai `trangThai` (da ghi DB) do he thong dinh tuyen:
 *  "TN da duyet" / "Cho thanh toan" -> gom vao phieu (neu chua trong phieu); "Cho hang" -> roi phieu "Dang tao phieu" mang theo tien
 *  (neu dang trong phieu) + mo ticket; "Cho GS duyet" -> bao GS. */
export async function tacDongSauDinhTuyen(
  env: Env, db: D1Database, donHangId: string, trangThai: string, nguoi: string, lyDoChoHang: string,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<void> {
  const d = await docDon(db, donHangId);
  if (!d || d.loai_don === "tra_hang") return;
  const loaiDon = d.loai_don as "mua" | "cong_no";
  if ((trangThai === "TN da duyet" || trangThai === "Cho thanh toan") && d.ma_xuat_kho == null && d.nguoi_nhan_hang) {
    await bundleAutoApprovedIntoPxk(env, db, nguoi, d.nguoi_nhan_hang, loaiDon, [{ donHangId, soTien: 0 }]);
  } else if (trangThai === "Cho hang") {
    if (d.ma_xuat_kho != null) {
      const pxkId = await pxkChuaDonChuaDuyet(db, donHangId);
      if (pxkId) {
        const go = await goDonKhoiPxk(db, pxkId, donHangId, nguoi, "Hệ thống chuyển chờ hàng đơn", lyDoChoHang, true, true);
        if (go.hoanQuy > 0) {
          const p = thongBaoHoanQuyPhieuHuy(env, db, pxkId, go.hoanQuy);
          if (waitUntil) waitUntil(p);
          else await p;
        }
      }
    }
    await moTicketChoHangTuDong(env, db, donHangId, d.nguoi_tao, lyDoChoHang, waitUntil);
  } else if (trangThai === "Cho GS duyet") {
    const p = baoGsChoDuyet(env, db, donHangId);
    if (waitUntil) waitUntil(p);
    else await p;
  }
}

/** Ke toan vua XAC NHAN tien phieu (trang_thai_chuyen_tien = 'TN da duyet'): cac don "Cho thanh toan" (thieu hang) trong phieu ->
 *  kiem tra ton lai (uu tien don tao truoc): du -> tu duyet (o lai phieu); van thieu -> roi phieu MANG THEO tien, sang "Cho hang"
 *  + mo ticket. Goi lap lai an toan (khong con don "Cho thanh toan" thi khong lam gi). */
export async function xuLyDonChoThanhToan(env: Env, db: D1Database, pxkId: string, nguoi: string, waitUntil?: (p: Promise<unknown>) => void): Promise<void> {
  const pxk = await db
    .prepare("SELECT trang_thai_hien_tai, trang_thai_chuyen_tien, so_tien_can_chuyen, da_thanh_toan FROM phieu_xuat_kho WHERE id = ?")
    .bind(pxkId)
    .first<{ trang_thai_hien_tai: string; trang_thai_chuyen_tien: string | null; so_tien_can_chuyen: number | null; da_thanh_toan: number | null }>();
  if (!pxk || pxk.trang_thai_hien_tai !== "Dang tao phieu" || pxk.trang_thai_chuyen_tien !== "TN da duyet") return;
  const { results } = await db
    .prepare(
      `SELECT ddh.id, ddh.nguoi_tao, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat FROM phieu_xuat_kho_dong d JOIN dat_don_hang ddh ON ddh.id = d.dat_don_hang_id
       WHERE d.phieu_xuat_kho_id = ? AND ddh.trang_thai_hien_tai = 'Cho thanh toan' ORDER BY ddh.ngay_tao, ddh.id`,
    )
    .bind(pxkId)
    .all<{ id: string; nguoi_tao: string; ten_lk_snapshot: string; so_luong_de_xuat: number }>();
  for (const don of results) {
    const { du, ton, khuVuc } = await donDuTonKhoCongTy(db, don.id);
    if (du) {
      await ghiTrangThaiDon(db, don.id, "TN da duyet", nguoi, `Tự động duyệt: Kế toán đã xác nhận tiền phiếu ${pxkId}, ${moTaThieuTon(ton, don.so_luong_de_xuat, khuVuc)} — đủ hàng`, true, "Cho thanh toan");
      const p = baoNguoiTaoDon(env, db, don.nguoi_tao, "da_duyet", `Đơn hàng "${don.ten_lk_snapshot} (x${don.so_luong_de_xuat})" đã thanh toán và kho đủ hàng — tự động duyệt, chờ xuất kho`, don.id);
      if (waitUntil) waitUntil(p);
      else await p;
      continue;
    }
    const lyDo = `Kế toán đã xác nhận tiền phiếu ${pxkId} nhưng ${moTaThieuTon(ton, don.so_luong_de_xuat, khuVuc)} — chuyển chờ hàng (đơn giữ tiền đã thanh toán)`;
    if (!(await ghiTrangThaiDon(db, don.id, "Cho hang", nguoi, `Tự động: ${lyDo}`, true, "Cho thanh toan"))) continue;
    await tacDongSauDinhTuyen(env, db, don.id, "Cho hang", nguoi, lyDo, waitUntil);
    const p = baoNguoiTaoDon(env, db, don.nguoi_tao, "cho_hang", `Đơn hàng "${don.ten_lk_snapshot} (x${don.so_luong_de_xuat})" đã thanh toán nhưng ${moTaThieuTon(ton, don.so_luong_de_xuat, khuVuc)} — chờ Kho xác nhận chờ hàng hoặc từ chối (từ chối thì tiền về quỹ dư)`, don.id);
    if (waitUntil) waitUntil(p);
    else await p;
  }
}

/** SUA DON dang "Cho thanh toan" (doi ma LK / SL / khu vuc - 2026-10-16, DDH-002638 doi sang ma con hang van ket "kho con 0"): danh gia
 *  LAI ton kho cong ty ngay (FIFO cung computeTonKhoChot) - du -> tu duyet "TN da duyet" (van nam trong phieu, KTV van chuyen tien nhu
 *  don mua thuong). Van thieu -> giu "Cho thanh toan" (Ke toan xac nhan tien xong se xet lai - xuLyDonChoThanhToan). Tra true khi da duyet. */
export async function danhGiaLaiDonChoThanhToan(env: Env, db: D1Database, donHangId: string, nguoi: string, lyDoSua: string): Promise<boolean> {
  const d = await db.prepare("SELECT trang_thai_hien_tai, nguoi_tao, ten_lk_snapshot, so_luong_de_xuat FROM dat_don_hang WHERE id = ?")
    .bind(donHangId)
    .first<{ trang_thai_hien_tai: string | null; nguoi_tao: string; ten_lk_snapshot: string; so_luong_de_xuat: number }>();
  if (d?.trang_thai_hien_tai !== "Cho thanh toan") return false;
  const { du, ton, khuVuc } = await donDuTonKhoCongTy(db, donHangId);
  if (!du) return false;
  if (!(await ghiTrangThaiDon(db, donHangId, "TN da duyet", nguoi, `Tự động duyệt sau khi sửa đơn (${lyDoSua}): ${moTaThieuTon(ton, d.so_luong_de_xuat, khuVuc)} — đủ hàng`, true, "Cho thanh toan"))) return false;
  await tacDongSauDinhTuyen(env, db, donHangId, "TN da duyet", nguoi, "");
  if (d.nguoi_tao !== nguoi) await baoNguoiTaoDon(env, db, d.nguoi_tao, "da_duyet", `Đơn hàng "${d.ten_lk_snapshot} (x${d.so_luong_de_xuat})" đã sửa và kho đủ hàng — tự động duyệt`, donHangId);
  return true;
}

/** Kho bao HANG DA VE (ticket thieu hang) cho don "Cho hang" -> don tu duyet + vao phieu (mang theo tien da tra). */
export async function duyetDonKhiHangVe(env: Env, db: D1Database, donHangId: string, nguoi: string, ghiChu: string): Promise<boolean> {
  if (!(await ghiTrangThaiDon(db, donHangId, "TN da duyet", nguoi, ghiChu, true, "Cho hang"))) return false;
  await tacDongSauDinhTuyen(env, db, donHangId, "TN da duyet", nguoi, "");
  const d = await db.prepare("SELECT nguoi_nhan_hang FROM dat_don_hang WHERE id = ?").bind(donHangId).first<{ nguoi_nhan_hang: string | null }>();
  await taiTinhPxkMoCuaKtv(db, d?.nguoi_nhan_hang, nguoi);
  return true;
}

/** Kho TU CHOI / ticket bi HUY cho don "Cho hang" -> don tu huy ("Da huy"): tien da tra cua don ve quy (trigger 0056) + phan bo
 *  quy + tinh lai chiet khau tong ngay. */
export async function huyDonChoHangTuDong(env: Env, db: D1Database, donHangId: string, nguoi: string, ghiChu: string): Promise<boolean> {
  if (!(await ghiTrangThaiDon(db, donHangId, "Da huy", nguoi, ghiChu, false, "Cho hang"))) return false;
  const d = await db.prepare("SELECT nguoi_nhan_hang FROM dat_don_hang WHERE id = ?").bind(donHangId).first<{ nguoi_nhan_hang: string | null }>();
  if (d?.nguoi_nhan_hang) {
    await phanBoQuy(db, d.nguoi_nhan_hang, nguoi);
    await taiTinhPxkMoCuaKtv(db, d.nguoi_nhan_hang, nguoi);
  }
  return true;
}

export { tienVnd };
