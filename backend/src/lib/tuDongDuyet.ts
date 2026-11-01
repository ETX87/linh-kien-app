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
import { locEmailKhoTheoNhomLk } from "./nhomLk";
import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { gsPhuCuaKhuVuc } from "./scopeDatMua";
import { computeTonKhoChot } from "./tonKhoCongTy";
import { computeTonKtvConLai } from "./tonKhoKtv";
import { computeCongNoChot } from "./congNoKtv";
import { laTruCongNo, khongTinhCongNo, taiTinhPxkMoCuaKtv, laMuaCongNoDoiTac } from "./pxkRecalculate";
import { docCongNoDoiTac } from "./congNoDoiTac";
import { nextSequentialId } from "./idCounter";
import { bundleAutoApprovedIntoPxk } from "./pxkAutoBundle";
import { goDonKhoiPxk, pxkChuaDonChuaDuyet, TN_DOI_TRONG_PXK_SQL } from "./pxkTuHuy";
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
  // MUA HÀNG CÔNG NỢ ĐỐI TÁC (v1.403) = don MUA ghi no doi tac - truoc nhanh "CÔNG NỢ" ben duoi.
  if (laMuaCongNoDoiTac(loaiDeXuat)) return "mua";
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
  coMaMisa: boolean; // ma MISA: cua ma KTV dang hoat dong; KH le = ma MISA cua ma KTV nhom (2026-10-19 bo users.ma_misa)
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
          OR EXISTS (SELECT 1 FROM khach_le kl JOIN ktv_lien_he kn ON kn.ma_ktv = kl.nhom_ma
                     WHERE kl.email = ? AND TRIM(COALESCE(kn.ma_misa, '')) <> '')) AS co_misa,
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
  doi_tac_ma?: string | null; // MUA HÀNG CÔNG NỢ ĐỐI TÁC (v1.403)
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
  // Don doi tac vuot muc cong no toi da (v1.403) - ly do ghi vao log khoi tao thay cau "vượt trần công nợ" cua KTV.
  ghiChuDoiTac?: string;
  laDoiTac?: boolean;
  // Linh kien nhom B2B (linh_kien.nhom_lk = 'b2b') - BO QUA duyet tran cong no KTV (chot 2026-10-27, "linh kiện b2b bỏ việc duyệt trần
  // công nợ (log ghi rõ lý do)") - ghi ly do vao log khoi tao.
  boQuaTranB2b?: boolean;
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
  // LK nhom B2B khong xet tran cong no (chot 2026-10-27) - doc nhom 1 lan cho ca phieu.
  const maLks = [...new Set(dongs.map((d) => d.ma_lk))];
  const nhomRows = maLks.length
    ? (await db.prepare("SELECT ma_linh_kien, nhom_lk FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?))")
        .bind(JSON.stringify(maLks)).all<{ ma_linh_kien: string; nhom_lk: string | null }>()).results
    : [];
  const laB2b = new Set(nhomRows.filter((r) => r.nhom_lk === "b2b").map((r) => r.ma_linh_kien));
  const xetTran = (d: DongDanhGia) => canDoiChieuCongNo(deriveLoaiDon(d.loai_de_xuat), d.loai_de_xuat) && !laB2b.has(d.ma_lk);
  // Cong no: chot 1 LAN cho ca phieu (cong no chot hien tai + tong cong no tam tinh cac dong cong no thuc su) so voi tran.
  let tongMoiCongNo = 0;
  for (const d of dongs) {
    if (xetTran(d)) tongMoiCongNo += (d.gia_tri_cong_no ?? 0) * d.so_luong;
  }
  const coDongCongNo = !ctx.laGs && dongs.some(xetTran);
  const congNoChot = coDongCongNo && ctx.maKtv ? await computeCongNoChot(db, ctx.maKtv) : 0;
  // Chua gan tran (hoac khong phai KTV) = tran 0 (quy uoc 2026-09-04).
  const danhGiaCongNo: "Du" | "Khong du" | null = coDongCongNo ? (congNoChot + tongMoiCongNo <= (ctx.tranCongNo ?? 0) ? "Du" : "Khong du") : null;

  // Cong no doi tac (MUA HÀNG CÔNG NỢ ĐỐI TÁC, v1.403): doc 1 lan cho moi doi tac co trong phieu, cong don tien cac dong cung doi tac.
  const maDoiTac = [...new Set(dongs.filter((d) => laMuaCongNoDoiTac(d.loai_de_xuat) && d.doi_tac_ma?.trim()).map((d) => d.doi_tac_ma!.trim()))];
  const doiTacMap = new Map((maDoiTac.length ? await docCongNoDoiTac(db, maDoiTac) : []).map((r) => [r.ma_misa.toUpperCase(), r]));
  const daDungDoiTac = new Map<string, number>();

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
    const laDoiTac = laMuaCongNoDoiTac(lde);
    kq.laDoiTac = laDoiTac;
    // Don doi tac KHONG can chuyen tien (ghi no doi tac) -> khong bao gio "Cho thanh toan".
    kq.batBuocChuyenTien = coTien && !laDoiTac && (d.gia_ban ?? 0) * d.so_luong > 0;
    if (laDoiTac) {
      const dt = d.doi_tac_ma?.trim() ? doiTacMap.get(d.doi_tac_ma.trim().toUpperCase()) : undefined;
      if (!d.doi_tac_ma?.trim()) {
        kq.loi = { ma: "DOI_TAC_CHUA_CHON", thongDiep: `${d.ma_lk}: chưa chọn đối tác cho đơn mua hàng công nợ đối tác.` };
      } else if (!dt || dt.bat_tat !== 1) {
        kq.loi = { ma: "DOI_TAC_KHONG_HOP_LE", thongDiep: `${d.ma_lk}: đối tác ${d.doi_tac_ma} không có trong danh sách công nợ đối tác hoặc đang tắt.` };
      } else {
        const key = dt.ma_misa.toUpperCase();
        const tienDong = (d.gia_ban ?? 0) * d.so_luong;
        const daDung = (daDungDoiTac.get(key) ?? 0) + tienDong;
        daDungDoiTac.set(key, daDung);
        if (dt.hien_tai + daDung > dt.cong_no_toi_da) {
          kq.danhGiaCongNo = "Khong du";
          kq.ghiChuDoiTac = `vượt mốc công nợ đối tác ${dt.ten_misa}: công nợ hiện tại ${tienVnd(dt.hien_tai)} + đơn mới ${tienVnd(daDung)} > tối đa ${tienVnd(dt.cong_no_toi_da)}`;
        } else {
          kq.danhGiaCongNo = "Du";
        }
      }
    }
    if (loaiDon === "cong_no" && !laTruCongNo(lde)) {
      kq.soTienCongNo = khongTinhCongNo(lde) ? 0 : (d.gia_tri_cong_no ?? 0) * d.so_luong;
      kq.danhGiaCongNo = canDoiChieuCongNo(loaiDon, lde) && !ctx.laGs && !laB2b.has(ma) ? danhGiaCongNo : null;
      if (canDoiChieuCongNo(loaiDon, lde) && !ctx.laGs && laB2b.has(ma)) kq.boQuaTranB2b = true;
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

// Don vuot tran / vuot moc doi tac DA duoc duyet (co ma EO - GS / TBP) -> ly do vuot tran ghi o log khoi tao (cong no chot + don moi >
// tran). Dung o chi tiet don + dong don trong chi tiet PXK de Ke toan nhin nhanh (chot 2026-10-27). Don di qua Tram truoc khong co so
// tien trong log -> NULL (FE chi hien "duyet vuot tran" + ma EO).
export const VUOT_TRAN_GHI_CHU_SQL = (a: string) => `CASE WHEN ${a}.ma_eo IS NOT NULL THEN (
  SELECT vl.ghi_chu FROM dat_don_hang_log vl WHERE vl.dat_don_hang_id = ${a}.id
    AND (vl.ghi_chu LIKE '%ượt trần công nợ: công nợ chốt%' OR vl.ghi_chu LIKE '%ượt mốc công nợ đối tác%')
  ORDER BY vl.id LIMIT 1) END`;

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
    if ((canDoiChieuCongNo(d.loai_don, lde) || laMuaCongNoDoiTac(lde)) && d.danh_gia_cong_no === "Khong du" && !d.ma_eo) return { trangThai: "Cho GS duyet", ton: null };
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
  const daThanhToan = d.thanh_toan === "da_thanh_toan" || d.thanh_toan === "khong_can" || d.thanh_toan === "cong_no_doi_tac";
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
  // "Cho mua hang" (2026-10-27): Mua hang tu day don ve Cho hang -> ticket vao thang buoc Mua hang dat hang (khong qua Kho, khong bao Kho).
  opts: { choMuaHang?: { nguoi: string } } = {},
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
    opts.choMuaHang
      ? db.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho mua hang', ?, ?, ?)").bind(
          thieuLkId, opts.choMuaHang.nguoi, now, lyDo.slice(0, 1000),
        )
      : db.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho kho xu ly', ?, ?, ?)").bind(
          thieuLkId, nguoiTaoTicket, now, `Tự động: ${lyDo}`.slice(0, 1000),
        ),
  ]);
  if (opts.choMuaHang) return thieuLkId;
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
      // Kho chi xu ly 1 nhom LK (Karofi / B2B, 2026-10-16): chi bao Kho dung nhom LK cua don.
      cat1Emails: await locEmailKhoTheoNhomLk(db, await emailsForRoleOrQC(db, "la_kho", emailGsList), don.ma_lk),
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
    .prepare("SELECT email_gs, ten_lk_snapshot, so_luong_de_xuat, COALESCE(khu_vuc_chon, khu_vuc_ma) as khu_vuc_hl FROM dat_don_hang WHERE id = ?")
    .bind(donHangId)
    .first<{ email_gs: string | null; ten_lk_snapshot: string; so_luong_de_xuat: number; khu_vuc_hl: string | null }>();
  if (!d) return;
  // GS chinh + GS PHU cua khu vuc (chot 2026-11-01) deu duyet duoc -> bao ca hai.
  const nhan = [...new Set([...(d.email_gs ? [d.email_gs] : []), ...(await gsPhuCuaKhuVuc(db, d.khu_vuc_hl))])];
  if (!nhan.length) return;
  await notifyWorkflowTask(env, db, {
    cat1Emails: nhan,
    otherRoles: [],
    emailGsList: d.email_gs ? [d.email_gs] : nhan,
    pastActors: [],
    title: "Đặt mua linh kiện",
    body: `Đơn "${d.ten_lk_snapshot} (x${d.so_luong_de_xuat})" vượt trần công nợ, chờ bạn duyệt (nhập mã EO)`,
    linkType: "don_hang",
    linkId: donHangId,
  });
}

/** Ghi trang thai moi cho don (khong CAS - luong he thong tu dong noi tiep) + 1 dong log. */
export async function ghiTrangThaiDon(db: D1Database, donHangId: string, trangThai: string, nguoi: string, ghiChu: string, tuDong: boolean, tuTrangThai: string): Promise<boolean> {
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
  opts: { choMuaHang?: boolean } = {},
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
        const go = await goDonKhoiPxk(db, pxkId, donHangId, nguoi, opts.choMuaHang ? "Mua hàng chuyển chờ hàng đơn" : "Hệ thống chuyển chờ hàng đơn", lyDoChoHang, true, true);
        if (go.hoanQuy > 0) {
          const p = thongBaoHoanQuyPhieuHuy(env, db, pxkId, go.hoanQuy);
          if (waitUntil) waitUntil(p);
          else await p;
        }
      }
    }
    await moTicketChoHangTuDong(env, db, donHangId, d.nguoi_tao, lyDoChoHang, waitUntil, opts.choMuaHang ? { choMuaHang: { nguoi } } : {});
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
      await ghiTrangThaiDon(db, don.id, "TN da duyet", nguoi, `Tự động duyệt: phiếu ${pxkId} đã đủ tiền (Kế toán xác nhận / quỹ dư), ${moTaThieuTon(ton, don.so_luong_de_xuat, khuVuc)} — đủ hàng`, true, "Cho thanh toan");
      const p = baoNguoiTaoDon(env, db, don.nguoi_tao, "da_duyet", `Đơn hàng "${don.ten_lk_snapshot} (x${don.so_luong_de_xuat})" đã thanh toán và kho đủ hàng — tự động duyệt, chờ xuất kho`, don.id);
      if (waitUntil) waitUntil(p);
      else await p;
      continue;
    }
    const lyDo = `Phiếu ${pxkId} đã đủ tiền (Kế toán xác nhận / quỹ dư) nhưng ${moTaThieuTon(ton, don.so_luong_de_xuat, khuVuc)} — chuyển chờ hàng (đơn giữ tiền đã thanh toán)`;
    if (!(await ghiTrangThaiDon(db, don.id, "Cho hang", nguoi, `Tự động: ${lyDo}`, true, "Cho thanh toan"))) continue;
    await tacDongSauDinhTuyen(env, db, don.id, "Cho hang", nguoi, lyDo, waitUntil);
    const p = baoNguoiTaoDon(env, db, don.nguoi_tao, "cho_hang", `Đơn hàng "${don.ten_lk_snapshot} (x${don.so_luong_de_xuat})" đã thanh toán nhưng ${moTaThieuTon(ton, don.so_luong_de_xuat, khuVuc)} — chờ Kho xác nhận chờ hàng hoặc từ chối (từ chối thì tiền về quỹ dư)`, don.id);
    if (waitUntil) waitUntil(p);
    else await p;
  }
}

/** SUA DON dang "Cho thanh toan" (doi ma LK / SL / khu vuc - 2026-10-16, DDH-002638 doi sang ma con hang van ket "kho con 0"): danh gia
 *  LAI ton kho cong ty ngay (FIFO cung computeTonKhoChot) - du -> tu duyet "TN da duyet" (van nam trong phieu, KTV van chuyen tien nhu
 *  don mua thuong). Van thieu -> giu "Cho thanh toan" (Ke toan xac nhan tien xong se xet lai - xuLyDonChoThanhToan). Tra true khi doi trang thai.
 *  SUA 2026-10-20 (bug DDH-002733 "đơn được sửa tiền = 0 nhưng vẫn ở trạng thái chờ chuyển tiền"): van thieu ma KHONG CON tien phai chuyen
 *  (gia chot 0 / doi sang loai khong phat sinh tien) -> phieu 0d khong bao gio co buoc Ke toan xac nhan tien nen don ket mai -> ap dung
 *  dung quy tac luc tao don "thieu + khong tien" = "Cho hang" + mo ticket (roi phieu mang theo tien da tra neu co). */
export async function danhGiaLaiDonChoThanhToan(env: Env, db: D1Database, donHangId: string, nguoi: string, lyDoSua: string): Promise<boolean> {
  const d = await db
    .prepare("SELECT trang_thai_hien_tai, nguoi_tao, ten_lk_snapshot, so_luong_de_xuat, so_luong_thuc_xuat, loai_don, loai_de_xuat, gia_chot, gia_de_xuat FROM dat_don_hang WHERE id = ?")
    .bind(donHangId)
    .first<{
      trang_thai_hien_tai: string | null; nguoi_tao: string; ten_lk_snapshot: string; so_luong_de_xuat: number; so_luong_thuc_xuat: number | null;
      loai_don: string; loai_de_xuat: string | null; gia_chot: number | null; gia_de_xuat: number | null;
    }>();
  if (d?.trang_thai_hien_tai !== "Cho thanh toan") return false;
  const { du, ton, khuVuc } = await donDuTonKhoCongTy(db, donHangId);
  if (!du) {
    const sl = d.so_luong_thuc_xuat ?? d.so_luong_de_xuat;
    const conTien = laDonPhatSinhTien(d.loai_don, d.loai_de_xuat ?? "") && (d.gia_chot ?? d.gia_de_xuat ?? 0) * sl > 0;
    if (conTien) return false;
    const lyDo = `Sửa đơn (${lyDoSua}): không còn tiền phải chuyển, ${moTaThieuTon(ton, d.so_luong_de_xuat, khuVuc)} — chuyển chờ hàng`;
    if (!(await ghiTrangThaiDon(db, donHangId, "Cho hang", nguoi, `Tự động: ${lyDo}`, true, "Cho thanh toan"))) return false;
    await tacDongSauDinhTuyen(env, db, donHangId, "Cho hang", nguoi, lyDo);
    if (d.nguoi_tao !== nguoi) await baoNguoiTaoDon(env, db, d.nguoi_tao, "cho_hang", `Đơn hàng "${d.ten_lk_snapshot} (x${d.so_luong_de_xuat})" không còn tiền phải chuyển nhưng ${moTaThieuTon(ton, d.so_luong_de_xuat, khuVuc)} — chờ Kho xử lý`, donHangId);
    return true;
  }
  if (!(await ghiTrangThaiDon(db, donHangId, "TN da duyet", nguoi, `Tự động duyệt sau khi sửa đơn (${lyDoSua}): ${moTaThieuTon(ton, d.so_luong_de_xuat, khuVuc)} — đủ hàng`, true, "Cho thanh toan"))) return false;
  await tacDongSauDinhTuyen(env, db, donHangId, "TN da duyet", nguoi, "");
  if (d.nguoi_tao !== nguoi) await baoNguoiTaoDon(env, db, d.nguoi_tao, "da_duyet", `Đơn hàng "${d.ten_lk_snapshot} (x${d.so_luong_de_xuat})" đã sửa và kho đủ hàng — tự động duyệt`, donHangId);
  return true;
}

/** CHO PHEP THANH TOAN SAU (2026-10-20, migration 0094): TN / Ke toan xac nhan don "Cho thanh toan" (thieu hang, phai chuyen tien truoc)
 *  di tiep KHONG cho tien - du ton -> "TN da duyet" (o lai / vao phieu), thieu -> "Cho hang" + ticket (roi phieu, mang tien da tra neu co).
 *  Tien van thu nhu don thuong o phieu xuat: "Gửi kế toán" chan toi khi Ke toan duyet du tien (MISSING_CHUYEN_TIEN_APPROVED). */
export async function choPhepThanhToanSau(
  env: Env, db: D1Database, donHangId: string, nguoi: string, ghiChu: string | null,
): Promise<{ ok: true; trangThai: string } | { error: string }> {
  const d = await db.prepare("SELECT trang_thai_hien_tai, nguoi_tao, ten_lk_snapshot, so_luong_de_xuat FROM dat_don_hang WHERE id = ?")
    .bind(donHangId)
    .first<{ trang_thai_hien_tai: string | null; nguoi_tao: string; ten_lk_snapshot: string; so_luong_de_xuat: number }>();
  if (!d) return { error: "NOT_FOUND" };
  if (d.trang_thai_hien_tai !== "Cho thanh toan") return { error: "CHI_DON_CHO_THANH_TOAN" };
  const { du, ton, khuVuc } = await donDuTonKhoCongTy(db, donHangId);
  const kem = ghiChu ? ` (${ghiChu})` : "";
  const trangThai = du ? "TN da duyet" : "Cho hang";
  const lyDo = du
    ? `Cho phép thanh toán sau${kem}: ${moTaThieuTon(ton, d.so_luong_de_xuat, khuVuc)} — đủ hàng, duyệt (tiền chuyển ở phiếu xuất trước khi gửi Kế toán)`
    : `Cho phép thanh toán sau${kem}: ${moTaThieuTon(ton, d.so_luong_de_xuat, khuVuc)} — chuyển chờ hàng (tiền chuyển ở phiếu xuất khi hàng về)`;
  if (!(await ghiTrangThaiDon(db, donHangId, trangThai, nguoi, lyDo, false, "Cho thanh toan"))) return { error: "STATE_CHANGED" };
  await db.prepare("UPDATE dat_don_hang SET thanh_toan_sau_luc = ?, thanh_toan_sau_boi = ? WHERE id = ?").bind(nowVN(), nguoi, donHangId).run();
  await tacDongSauDinhTuyen(env, db, donHangId, trangThai, nguoi, lyDo);
  if (d.nguoi_tao !== nguoi) {
    await baoNguoiTaoDon(env, db, d.nguoi_tao, du ? "da_duyet" : "cho_hang",
      `Đơn hàng "${d.ten_lk_snapshot} (x${d.so_luong_de_xuat})" được cho phép thanh toán sau — ${du ? "kho đủ hàng, đã duyệt" : "chuyển chờ hàng"}; tiền vẫn chuyển ở phiếu xuất`, donHangId);
  }
  return { ok: true, trangThai };
}

/** Kho bao HANG DA VE (ticket thieu hang) cho don "Cho hang" -> don tu duyet + vao phieu (mang theo tien da tra). */
export async function duyetDonKhiHangVe(env: Env, db: D1Database, donHangId: string, nguoi: string, ghiChu: string): Promise<boolean> {
  if (!(await ghiTrangThaiDon(db, donHangId, "TN da duyet", nguoi, ghiChu, true, "Cho hang"))) return false;
  await tacDongSauDinhTuyen(env, db, donHangId, "TN da duyet", nguoi, "");
  const d = await db.prepare("SELECT nguoi_nhan_hang FROM dat_don_hang WHERE id = ?").bind(donHangId).first<{ nguoi_nhan_hang: string | null }>();
  await taiTinhPxkMoCuaKtv(db, d?.nguoi_nhan_hang, nguoi);
  return true;
}

/** DOI KHU VUC -> XET LAI TON KHO CA 2 CHIEU (chot 2026-10-22, "chuyển sang khu vực khác có hàng, nhưng tiket vẫn tồn và bị chờ hàng => tự
 *  động xác định lại ticket..." + "xử lý cả 2 chiều"). Goi SAU KHI da ghi khu_vuc_chon moi cho don (PATCH don) hoac moi don trong phieu (PATCH
 *  phieu). Ton kho = kho cong ty theo KHU VUC MOI, cung FIFO donDuTonKhoCongTy nhu luc tao don. Chi don Mua / Cong no (khong TRỪ CÔNG NỢ - doi
 *  chieu ton KTV; khong don gui bu nhan thieu):
 *  - "Cho hang" + du  -> tu duyet + vao phieu nhu Kho "Hàng đã về" (duyetDonKhiHangVe, mang tien da tra) + dong ticket con mo "Da ket thuc".
 *  - "Cho thanh toan" -> danhGiaLaiDonChoThanhToan (du -> tu duyet, o lai phieu; thieu ma het tien -> cho hang).
 *  - "TN da duyet" + THIEU -> "Cho hang" + mo ticket, roi phieu "Dang tao phieu" MANG THEO tien (tacDongSauDinhTuyen) - CHI khi don chua vao
 *    phieu hoac phieu con "Dang tao phieu" + Ke toan chua chot tien (TN_DOI_TRONG_PXK_SQL, cung dieu kien TN doi don trong phieu); phieu da
 *    gui Ke toan / Kho -> giu nguyen (`giuNguyen`, de nguoi doi biet ma xu ly tay). */
export async function xetLaiTonKhiDoiKhuVuc(
  env: Env, db: D1Database, donIds: string[], nguoi: string, moTaDoi: string, waitUntil?: (p: Promise<unknown>) => void,
): Promise<{ tuDuyet: string[]; choHang: string[]; giuNguyen: string[] }> {
  const kq = { tuDuyet: [] as string[], choHang: [] as string[], giuNguyen: [] as string[] };
  if (!donIds.length) return kq;
  const { results } = await db
    .prepare(
      `SELECT ddh.id, ddh.trang_thai_hien_tai AS trang_thai, ddh.loai_de_xuat, ddh.nguoi_tao, ddh.nguoi_nhan_hang, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat,
              EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id
                      WHERE pd.dat_don_hang_id = ddh.id AND COALESCE(p.trang_thai_hien_tai, '') != 'Ke toan huy') AS trong_phieu,
              ${TN_DOI_TRONG_PXK_SQL("ddh")} AS doi_trong_pxk
       FROM dat_don_hang ddh
       WHERE ddh.id IN (SELECT value FROM json_each(?)) AND ddh.loai_don IN ('mua', 'cong_no') AND ddh.gui_bu_nhan_thieu_id IS NULL
         AND ddh.trang_thai_hien_tai IN ('Cho hang', 'Cho thanh toan', 'TN da duyet')
       ORDER BY ddh.ngay_tao, ddh.id`,
    )
    .bind(JSON.stringify(donIds))
    .all<{
      id: string; trang_thai: string; loai_de_xuat: string | null; nguoi_tao: string; nguoi_nhan_hang: string | null; ten_lk_snapshot: string;
      so_luong_de_xuat: number; trong_phieu: number; doi_trong_pxk: number;
    }>();
  const bao = (p: Promise<unknown>) => (waitUntil ? waitUntil(p) : p);
  for (const d of results) {
    if (laTruCongNo(d.loai_de_xuat)) continue;
    const tenDon = `"${d.ten_lk_snapshot} (x${d.so_luong_de_xuat})"`;
    if (d.trang_thai === "Cho thanh toan") {
      if (await danhGiaLaiDonChoThanhToan(env, db, d.id, nguoi, moTaDoi)) {
        const sau = await db.prepare("SELECT trang_thai_hien_tai AS tt FROM dat_don_hang WHERE id = ?").bind(d.id).first<{ tt: string }>();
        (sau?.tt === "TN da duyet" ? kq.tuDuyet : kq.choHang).push(d.id);
      }
      continue;
    }
    const { du, ton, khuVuc } = await donDuTonKhoCongTy(db, d.id);
    const moTaTon = moTaThieuTon(ton, d.so_luong_de_xuat, khuVuc);
    if (d.trang_thai === "Cho hang") {
      if (!du) continue;
      const lyDo = `Tự động: ${moTaDoi}, ${moTaTon} — đủ hàng, duyệt đơn + vào phiếu`;
      if (!(await duyetDonKhiHangVe(env, db, d.id, nguoi, lyDo))) continue;
      await db
        .prepare(
          `INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
           SELECT t.id, 'Da ket thuc', ?, ?, ? FROM thieu_lk t
           WHERE t.dat_don_hang_id = ? AND COALESCE((SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1), '')
                 NOT IN ('Da huy bo', 'Da ket thuc')`,
        )
        .bind(nguoi, nowVN(), lyDo.slice(0, 1000), d.id)
        .run();
      kq.tuDuyet.push(d.id);
      if (d.nguoi_tao !== nguoi) await bao(baoNguoiTaoDon(env, db, d.nguoi_tao, "da_duyet", `Đơn hàng ${tenDon} — ${moTaDoi}: kho đủ hàng, đã duyệt và vào phiếu xuất kho`, d.id));
      continue;
    }
    // "TN da duyet"
    if (du) continue;
    if (d.trong_phieu && !d.doi_trong_pxk) { kq.giuNguyen.push(d.id); continue; }
    const lyDo = `${moTaDoi}, ${moTaTon} — chuyển chờ hàng (đơn giữ tiền đã thanh toán)`;
    if (!(await ghiTrangThaiDon(db, d.id, "Cho hang", nguoi, `Tự động: ${lyDo}`, true, "TN da duyet"))) continue;
    await tacDongSauDinhTuyen(env, db, d.id, "Cho hang", nguoi, lyDo, waitUntil);
    await taiTinhPxkMoCuaKtv(db, d.nguoi_nhan_hang, nguoi);
    kq.choHang.push(d.id);
    if (d.nguoi_tao !== nguoi) await bao(baoNguoiTaoDon(env, db, d.nguoi_tao, "cho_hang", `Đơn hàng ${tenDon} — ${moTaDoi}: ${moTaTon}, chuyển chờ hàng (chờ Kho xử lý)`, d.id));
  }
  return kq;
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
