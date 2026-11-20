import { khoNhomLkLoc, locNhomLkSql, locEmailKhoTheoNhomLk } from "../lib/nhomLk";
import { tienBiBotPxk } from "../lib/tienBiBot";
import { lenhGhiQuy, phanBoQuyNguoi, soDuQuy, thongBaoHoanQuyPhieuHuy } from "../lib/quyKtv";
import { khoaQuy } from "../lib/quyKhoa";
import { nhomHoaDon, coChonHoaDon, nhomPhieu, phieuCungNhomSql } from "../lib/nhomLoaiDeXuat";
import { dayLaiTicketThieuLk, hanDayLaiTicketSql, trangThaiTruocTicketSql, ticketDayLaiCuaDon } from "../lib/dayLaiThieuLk";
import { ktvChinhCuaEmailSql } from "../lib/ktvChinh";
import { Hono } from "hono";
import { chuanHoaSdt, laNguoiNhanKhLe, nhomKhLeTheoEmail, timHoacTaoKhachLe } from "../lib/khachLe";
import { laUrlAnhDrive } from "../lib/anhUpload";
import type { Context } from "hono";
import type { Env, AppUser } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { nextSequentialId, reserveSequentialIds } from "../lib/idCounter";
import { nowVN } from "../lib/vnTime";
import { emailsTheoTen, orEmailIn, orMaYcsc, orPxkCuaDon, tenLkKhopSql } from "../lib/timTheoTen";
import { scopeDatMuaNguoiTao, phuTrachGsSet, autoClaimGs, viewDonScopeSql, khuVucCuaToiSet, khuVucSetWhereSql, khuVucPxkWhereSql, laKhoThuan, scopePxkNguoiNhanHang, gsKhuVucXemThemSql, duocDoiKhuVucDon, laGsCuaKhuVuc } from "../lib/scopeDatMua";
import { pxkKhopMienXuatSql } from "../lib/mienXuat";
import { bumpVersions } from "../lib/dataVersions";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { quaHanLyDoCham, mocTinhHanTn, traHangTuHuySql } from "../lib/hanLyDoCham";
import { getDatMuaLkBadge } from "./notifications";
import { csvTemplateResponse } from "../lib/csvTemplate";
import { getOrCompute } from "../lib/precomputedCache";
import { extractMaKtv } from "../lib/ktvCode";
import { lookupCase, lookupCases, lookupCaseFull, type CaseLookupPreview, type CaseLookupGiaiTrinh } from "../lib/caseLookupClient";
import { lookupLada, ladaPreview, isLikelyLadaId, type LadaPreview } from "../lib/ladaLookupClient";
import { sendPushToUser } from "../lib/webPush";
import { computeCongNoChot } from "../lib/congNoKtv";
import { computeMocDuPhongHienTai } from "../lib/duPhongKtv";
import { computeTonKhoChot, donChoHangDuTonKho, getMocTonKhoCongTy } from "../lib/tonKhoCongTy";
import { tachDonChoHang } from "../lib/tachDon";
import { bundleAutoApprovedIntoPxk } from "../lib/pxkAutoBundle";
import { taiTinhPxk, taiTinhPxkMoCuaKtv, laTruCongNo, tongNgayKtv, tienUocTinhChoDon, laKhTraGop, khongTinhCongNo, laMuaCongNoDoiTac, laCongNoSuaChua, chuanMaDonBh, laMaDonBhApp, laTruCongNoSuaChua, laTraHangSuaChua, laDonSuaChua, laMuaHangSuaChua, loaiDeXuatTheoDonBh } from "../lib/pxkRecalculate";
import { goiYDonBh, traDonBh } from "../lib/donBhClient";
import { duocChonMoiDoiTac, maMisaCuaEmail } from "../lib/congNoDoiTac";
import { computeTonKtvConLai } from "../lib/tonKhoKtv";
import { type CotLoc, docLocCot, sqlLocCot, sqlSapXep, tenNguoiSql, giaTriCot } from "../lib/locCot";
import { tenNguoiSql as tenNguoiDaySql, tenNguoiNullSql, tenNguoiMap } from "../lib/tenNguoi";
import { TRANG_THAI_PXK_DON_SQL, THANH_TOAN_DON_SQL } from "../lib/trangThaiDonPxk";
import { TU_HUY_DUOC_SQL, TN_DOI_TRONG_PXK_SQL, GS_HUY_TRONG_PXK_SQL, MUA_HANG_CHO_HANG_DUOC_SQL, pxkGsHuyDuoc, pxkDuocTuHuy, pxkTnDoiDuoc, pxkChuaDonChuaDuyet, goDonKhoiPxk, laVanPhong, danhDauVanPhongTacDong } from "../lib/pxkTuHuy";
import { notifyWorkflowTask, emailsForRoleOrQC, pastActorsFor, MUA_CONG_NO_ROLES, TRA_HANG_ROLES, type ViecMoiRoleCol } from "../lib/taskNotify";
import { pushThieuLkToKhovan, buildWorkUrl } from "../lib/khovanPushClient";
import { ANH_DA_GHI_NHAN_SQL } from "../lib/bangChungChuyenTien";
import { quyVeMaChuan } from "../lib/linhKienXetDuyet";
import { tachComboDong } from "../lib/lkCombo";
import { tuDongXacNhanHangVe, donHangVeMotPhan } from "../lib/tuDongHangVe";
import { doiLoaiDeXuatDon, duocDoiLoaiDeXuat, lyDoKhongDoiDuoc, DOI_LDE_DUOC_SQL } from "../lib/doiLoaiDeXuat";

// Gioi han so hop ly (chot 2026-11-10, "tổng tiền đang bị lỗi" - Σ Tổng cộng bao cao ra 11.111.111…đ vi 1 don go nham SL/gia khong bi chan).
// SL 1 dong <= 10.000 chiec, gia 1 chiec <= 1 ty, tien cong no 1 don <= 10 ty.
const SL_TOI_DA = 10_000;
const GIA_TOI_DA = 1_000_000_000;
const CONG_NO_TOI_DA = 10_000_000_000;
function loiGioiHan(b: { so_luong_de_xuat?: unknown; so_luong_thuc_xuat?: unknown; gia_chot?: unknown }): string | null {
  const sl = (v: unknown, min: number) => v == null || (Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= SL_TOI_DA);
  if (!sl(b.so_luong_de_xuat, 1) || !sl(b.so_luong_thuc_xuat, 0)) return "SO_LUONG_QUA_LON";
  if (b.gia_chot != null && !(Number.isFinite(Number(b.gia_chot)) && Number(b.gia_chot) >= 0 && Number(b.gia_chot) <= GIA_TOI_DA)) return "GIA_QUA_LON";
  return null;
}
import {
  deriveLoaiDon, boQuaTbpChoDacThu, canDoiChieuCongNo, nguCanhNhan, danhGiaPhieu, trangThaiSauDuyet, tacDongSauDinhTuyen, duyetDonKhiHangVe, danhGiaLaiDonChoThanhToan, choPhepThanhToanSau,
  huyDonChoHangTuDong, baoNguoiTaoDon, moTaThieuTon, moTicketChoHangTuDong, xetLaiTonKhiDoiKhuVuc, baoGsChoDuyet, ghiTrangThaiDon, VUOT_TRAN_GHI_CHU_SQL, type DongDanhGia, type KetQuaDong, type KetQuaPhieu,
} from "../lib/tuDongDuyet";

// Luong chinh "Dat mua linh kien" - phieu dat (header, chi de tong hop hien thi) + dong don hang -
// xem migration 0056_phieu_dat.sql + 0063_dat_don_hang_trang_thai_theo_dong.sql.
//
// CHOT 2026-08-14: duyet/tu choi chuyen xuong cap TUNG DONG don hang (dat_don_hang_log), khong con
// o cap ca phieu (phieu_dat_log da bi xoa) - 1 phieu 10 dong, TN co the tu choi 3, cho hang 2, duyet
// 5 dong con lai doc lap nhau. Trang thai 1 dong LUON suy tu dat_don_hang_log MOI NHAT (pattern
// header+log giong tranh_chap_tien_trinh). Phieu dat chi con vai tro khung tong hop (tong tien du
// kien, dem so dong theo tung trang thai) - xem lib/scopeDatMua.ts cho quy tac phan quyen xem.
//
// CHOT 2026-08-13: GS KHONG duyet - luong di thang "Cho Tram duyet" (neu nguoi tao dong la Ve tinh)
// hoac "Cho TN duyet" (neu nguoi tao la KTV/Tram) -> TN duyet/tu choi/cho hang tung dong.
//
// "Cho hang" dung chung co che voi nhanh "Thieu linh kien" (thieu_lk) - xem createThieuLk() +
// closeThieuLkAndResume() ben duoi: TN chon "cho hang" luc duyet = mo 1 ca thieu_lk cho dong do;
// Kho bao thieu sau nay (dong da "TN da duyet") cung di qua cung 1 co che. Khi ca thieu_lk dong lai
// (bat ke ket qua) thi dong tu dong quay ve "TN da duyet" - tiep tuc luong, dung y da chot truoc day
// "ca 3 nhanh re deu tiep tuc luong don hang".
const datMuaLinhKien = new Hono<{ Bindings: Env }>();
datMuaLinhKien.use("*", verifySessionMiddleware, loadUser, requireDatMuaLkArea);

// Trang thai "dong" tren 1 DONG don hang - khong the goi applyDonHangLog nua (Cho hang chi mo/dong
// qua thieu_lk, khong qua applyDonHangLog truc tiep).
// + 3 trang thai don "SỬA CHỮA TẠI KHO" dong bo tu app Sua chua (v1.478, lib/donSuaChuaKho.ts) - don chi xem, khong phai viec cua ai ben nay.
const DON_HANG_TRANG_THAI_DONG = ["TN da duyet", "TN tu choi", "Da huy", "Cho hang", "SC cho kho in", "SC kho da in", "SC kho da xuat"] as const;
// Cung dinh nghia voi TRANG_THAI_DONG trong traHang.ts (khong export/dung chung 1 file duoc vi 2
// router doc lap nhau, giong pattern latestStatusExpr moi noi tu dinh nghia rieng) - dung cho
// GET /loai-don-counts ben duoi. SUA (migration 0002_tra_hang_pxk.sql): "Da hoan thanh" khong con
// dat toi duoc tu applyTraHangLog nua - dong dat_don_hang dung o "TN da duyet" (dong/closed voi
// STATE MACHINE NAY, giong het DON_HANG_TRANG_THAI_DONG cua mua/cong_no), phan con lai theo doi qua
// phieu_xuat_kho rieng.
const TRA_HANG_TRANG_THAI_DONG_COUNTS = ["TN da duyet", "Tu choi", "Da huy"] as const;

// RA SOAT BAO MAT/CHI PHI D1 2026-08-18 (phan hoi Codex #9): cac endpoint bulk-log truoc day khong
// gioi han so luong id/request, xu ly tuan tu tung id (moi id vai luot doc/ghi D1 rieng) - 1 request
// voi hang nghin id se gay ton D1 rat lon. Gioi han o muc du dung cho 1 thao tac "chon 1 trang danh
// sach" (pageSize toi da hien co la 200) nhung van chan duoc lam dung/spam.
const MAX_BULK_IDS = 100;

function latestDonHangStatusExpr(donHangIdCol: string): string {
  return `(SELECT trang_thai FROM dat_don_hang_log WHERE dat_don_hang_id = ${donHangIdCol} ORDER BY id DESC LIMIT 1)`;
}

// Cung pattern voi latestDonHangStatusExpr - correlated subquery gioi han boi pageSize (toi da 200
// dong/trang) nen chi phi tuong duong 1 index seek/dong, dung cho GET /don-hang de tinh
// qua_han_ly_do_cham CHO CA DANH SACH (truoc day chi GET /don-hang/:id tinh duoc, xem hanLyDoCham.ts).
// Don TRA HANG (2026-10-01): KHONG ap han "Ly do cham" cua don mua - han tung giai doan tra hang tinh rieng o traHang.ts
// (mocGiaiDoanTraHangSql). Truoc day don Mua -> Tra hang van giu log "Cho TN duyet" cu nen bi bao "Qua han" sai trong PXK.
function laTraHangSql(donHangIdCol: string): string {
  return `${donHangIdCol.replace(/\.id$/, ".loai_don")} = 'tra_hang'`;
}
function choTnDuyetAtExpr(donHangIdCol: string): string {
  return `(CASE WHEN ${laTraHangSql(donHangIdCol)} THEN NULL ELSE (SELECT ngay_xu_ly FROM dat_don_hang_log WHERE dat_don_hang_id = ${donHangIdCol} AND trang_thai = 'Cho TN duyet' ORDER BY id DESC LIMIT 1) END)`;
}

// TN "đẩy lại" don da huy / da tu choi (chot 2026-10-05): han = luc don bi huy/tu choi (log moi nhat) + 24h; NULL = khong
// day lai duoc. CHI don do TAC NGHIEP huy/tu choi (chot cung ngay: "chỉ xử lý đơn do tn hủy hoặc từ chối"): nguoi ghi log
// huy/tu choi la TN (la_tac_nghiep; Ke toan lam thay TN tu 2026-10-15) hoac Admin, VA voi "Da huy" thi don dang o buoc cua TN (log truoc do la "Cho TN duyet" /
// "TN da duyet" / "Cho hang") - loai don nguoi tao/KTV tu huy, Tram/TBP tu choi (cung ra "Da huy"), he thong tu huy.
// MO RONG 2026-10-16 ("thêm chức năng đẩy đơn bị từ chối lại. ví dụ đơn: DDH-002653 bị từ chối nhầm" - don do KHO tu choi ticket
// thieu hang -> don tu huy): moi lan huy/tu choi do NGUOI KHAC lam (Kho tu choi ticket, TBP/GS/Tram tu choi, TN/Ke toan/Admin huy...)
// deu day lai duoc; CHI loai don do chinh nguoi tao / nguoi nhan hang tu huy (tru khi ho la TN/Ke toan/Admin).
// Don tra hang khong ap dung. Dung CHUNG cho cot day_lai_han (danh sach/chi tiet) va POST /day-lai.
const DAY_LAI_TRANG_THAI = ["TN tu choi", "Da huy"] as const;
function dayLaiHanSql(a: string): string {
  const logCuoi = `(SELECT MAX(id) FROM dat_don_hang_log WHERE dat_don_hang_id = ${a}.id)`;
  return `(CASE WHEN ${a}.loai_don != 'tra_hang' AND ${a}.trang_thai_hien_tai IN ('TN tu choi', 'Da huy') AND EXISTS (
      SELECT 1 FROM dat_don_hang_log l JOIN users u ON u.email = l.nguoi_xu_ly
      WHERE l.id = ${logCuoi}
        AND (u.la_tac_nghiep = 1 OR u.la_ke_toan = 1 OR u.vai_tro = 'Admin'
             OR (u.email != ${a}.nguoi_tao AND u.email != COALESCE(${a}.nguoi_nhan_hang, ''))))
    THEN datetime((SELECT ngay_xu_ly FROM dat_don_hang_log WHERE id = ${logCuoi}), '+24 hours') END)`;
}

// FIX (phan hoi QA 2026-08-31, muc #5): moc "gan nhat" de tinh han qua_han_ly_do_cham GIO LA lan giai
// trinh gan nhat (migration 0014) neu co, KHONG con dua vao cho_tn_duyet_at co dinh mai mai sau lan
// giai trinh dau tien - xem cach dung ket hop 2 ham nay o GET /don-hang, /don-hang/:id, applyDonHangLog.
function lastGiaiTrinhAtExpr(donHangIdCol: string): string {
  return `(CASE WHEN ${laTraHangSql(donHangIdCol)} THEN NULL ELSE (SELECT MAX(ngay_tao) FROM dat_don_hang_giai_trinh WHERE dat_don_hang_id = ${donHangIdCol}) END)`;
}

// Tat luong Ve tinh tao don (chot 2026-10-14, tu dong duyet 100%): tai khoan Ve tinh KHONG tao don nua (TN/GS van dat ho duoc).
function canCreatePhieuDat(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  if (canTacNghiep(c) || user.vai_tro === "Giam sat") return true;
  // QC dat hang nhu 1 KTV cho CHINH MINH (chot 2026-11-07, v1.451 — "vai trò QC cấp quyền bổ sung như 1 KTV, có thể đặt hàng, theo dõi
  // và xác nhận hàng về"). Khong dat ho (canQuanLyDonHo khong gom QC); nguoi nhan phai co Ma nhan hang kem Ma MISA (nguoiNhanChuaCoMaMisa).
  if (user.vai_tro === "QC") return true;
  if (user.la_ve_tinh) return false;
  // NV sua chua (v1.498): dat CÔNG NỢ SỬA CHỮA cho chinh minh (tren app nay hoac qua app Bao hanh doi tra) du khong co co KTV.
  return !!user.la_ktv_dvbh || !!user.la_nv_sua_chua;
}

function canTacNghiep(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_tac_nghiep || user.vai_tro === "Admin";
}

// Xac nhan "linh kien dac thu" (buoc rieng ngay truoc Tac nghiep) - CHOT 2026-08-17, xem migration
// 0082_linh_kien_dac_thu_tp_dvbh.sql. la_tp_dvbh DOC LAP khoi vai_tro="TBP DVBH", giong pattern
// canTacNghiep() o tren.
function canTPDvbhXacNhan(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_tp_dvbh || user.vai_tro === "Admin";
}

// boQuaTbpChoDacThu / deriveLoaiDon: lib/tuDongDuyet.ts (dung chung tao tay / import / kiem tra truoc / duyet sau).

// "Linh kiện đặc thù" HIEU LUC cua 1 don (2026-10-02, migration 0064): TN chon tay tren don (dac_thu_thu_cong 0/1) thang
// danh muc; NULL = theo linh_kien.dac_thu. Can alias "lk" = linh_kien JOIN theo ddh.ma_lk.
const DAC_THU_DON_SQL = (a: string) => `COALESCE(${a}.dac_thu_thu_cong, lk.dac_thu, 0)`;

// TN hoac GS - duoc tao phieu HO nguoi khac + chon "nguoi nhan hang" khac chinh minh (Giai doan 4b).
function canQuanLyDonHo(c: Context<{ Bindings: Env }>): boolean {
  return canTacNghiep(c) || c.get("user").vai_tro === "Giam sat";
}

// Chot phan hoi UX 2026-08-15 (#2): "Chinh sach" + "Ma yeu cau su co" bat buoc khi Loai de xuat la
// no CONG NO thuc su (khong tinh nhanh TRA HANG dung chung tu khoa "CONG NO", vd "TRU CONG NO" van
// tinh la CONG NO nhung "TRA HANG - HOAN CONG NO" (neu co) thi khong). Validate CA 2 PHIA (frontend
// da co ban sao, day la nguon that cho backend) - xem POST /phieu-dat va processDatDonHangImportRows.
function canNoRequired(loaiDeXuat: string): boolean {
  // MUA HÀNG CÔNG NỢ ĐỐI TÁC (v1.403) la don MUA - khong bat Chinh sach / Ma YCSC.
  // CÔNG NỢ SỬA CHỮA (v1.495): thay Chinh sach + Ma YCSC bang MA DON BAO HANH bat buoc (xem chuanBiPhieuDat).
  return loaiDeXuat.includes("CÔNG NỢ") && !loaiDeXuat.includes("TRẢ HÀNG") && !laMuaCongNoDoiTac(loaiDeXuat) && !laCongNoSuaChua(loaiDeXuat);
}

// Them 2026-09-09 (phan hoi "loại đề xuất MUA HÀNG CÓ ID bắt buộc Mã YCSC liên quan") - RIENG voi
// canNoRequired: loai nay CHI bat buoc Mã yêu cầu sự cố, KHONG bat buoc Chính sách (khac cong no bat
// buoc CA 2 truong). 2 tap loai_de_xuat nay khong giao nhau (1 ben chua "CÔNG NỢ", ben kia chua "MUA
// HÀNG") nen validate tach rieng khong bi chong cheo - xem 3 noi goi ben duoi.
function maYcscRequired(loaiDeXuat: string): boolean {
  // + moi loai chua "HỖ TRỢ" (chot 2026-09-29) - "HỖ TRỢ CÔNG NỢ" da nam trong canNoRequired (bat buoc ca Chinh sach).
  // v1.508: HỖ TRỢ SỬA CHỮA 0 ĐỒNG (va 2 loai sua chua khac) dung MA DON BAO HANH thay Ma YCSC.
  if (laDonSuaChua(loaiDeXuat)) return false;
  return canNoRequired(loaiDeXuat) || loaiDeXuat.includes("MUA HÀNG CÓ ID") || loaiDeXuat.toUpperCase().includes("HỖ TRỢ");
}

// LK "Cấm bán" (cot linh_kien.cam_ban tu gia88): KHONG chan dat hang voi bat ky loai de xuat nao (chot 2026-10-10 - v1.309/1.310 tung
// chan MUA HÀNG / MUA HÀNG CÓ ID / MUA DỰ TRỮ). FE LinhKienPicker chi canh bao "Linh kiện thuộc dạng không bán..." khi chon.

// Chinh sach mac dinh (chot 2026-10-08): don "TRỪ CÔNG NỢ" bo trong -> "Trong CSBH" (tao tay + import Excel). Ban sao FE:
// chinhSachMacDinh() helpers.ts.
function chinhSachMacDinh(loaiDeXuat: string | null | undefined): string | null {
  if (laMuaHangSuaChua(loaiDeXuat)) return "Ngoài CSBH"; // v1.508: het bao hanh
  return laTruCongNo(loaiDeXuat) || laDonSuaChua(loaiDeXuat) ? "Trong CSBH" : null;
}

// Ma ID lien quan (2026-09-30): noi nao "bat buoc Mã YCSC" thi chi can 1 trong 2 - Mã YCSC (case DVBH) HOAC
// Mã Lada (don Ecolada, tra cuu center.dichvu3t.com - lib/ladaLookupClient.ts). Ban sao FE: coMaIdLienQuan() helpers.ts.
function coMaIdLienQuan(maYcsc: string | null | undefined, maLada: string | null | undefined): boolean {
  return !!maYcsc?.trim() || !!maLada?.trim();
}

// CHOT 2026-08-15: Ve tinh CHI la nguoi tao/de xuat don, KHONG phai nguoi nhan hang that su - Tram
// (tram_cha) moi la nguoi chiu trach nhiem nhan hang (vi luc tao Phieu xuat kho phai chon giao cho
// DUNG 1 nguoi). Dung ham nay o CA 2 noi resolve nguoi_nhan_hang: tao tay (POST /phieu-dat) va import
// Excel (processDatDonHangImportRows, logic tuong duong nhung gop chung 1 query vi chay trong vong
// lap - xem comment o do). Neu target la Ve tinh nhung chua duoc gan Tram (tram_cha null) thi khong
// xac dinh duoc nguoi nhan hang - tra loi.
async function resolveNguoiNhanHang(
  db: D1Database,
  target: { email: string; la_ve_tinh: number | boolean },
): Promise<{ email: string } | { error: "VE_TINH_CHUA_GAN_TRAM" | "NGUOI_NHAN_HANG_DA_TAT" }> {
  // Tai khoan KTV bi TAT (users.bi_khoa - cong tac o Quan ly nguoi dung > KTV hien truong, 2026-10-01) khong duoc la nguoi
  // nhan hang: chan ca KTV/Ve tinh duoc chon lan Tram nhan thay.
  const row = await db
    .prepare("SELECT u.bi_khoa, u.tram_cha, t.bi_khoa AS tram_bi_khoa FROM users u LEFT JOIN users t ON t.email = u.tram_cha WHERE u.email = ?")
    .bind(target.email)
    .first<{ bi_khoa: number | null; tram_cha: string | null; tram_bi_khoa: number | null }>();
  if (row?.bi_khoa) return { error: "NGUOI_NHAN_HANG_DA_TAT" };
  if (!target.la_ve_tinh) return { email: target.email };
  if (!row?.tram_cha) return { error: "VE_TINH_CHUA_GAN_TRAM" };
  if (row.tram_bi_khoa) return { error: "NGUOI_NHAN_HANG_DA_TAT" };
  return { email: row.tram_cha };
}

// Nguoi nhan hang hop le khi TN/GS chon nguoi khac (2026-10-03): tai khoan co co KTV DVBH/Ve tinh HOAC Gmail dang gan 1 ma KTV
// con hoat dong trong danh ba (co KTV chi la QUYEN - tai khoan thuoc "KTV hien truong" khi co ma; vd ma khuongnv.ttbh gan Gmail
// cua tai khoan vai tro QC khong bat co KTV -> o chon van hien nhung tao don bao "Người nhận hàng không hợp lệ"). Ma "Ve tinh" =
// Ve tinh (di qua Tram). Cung tap voi /nguoi-nhan-hang-kha-dung + import Excel (theo ktv_lien_he).
async function nguoiNhanHangHopLe(db: D1Database, email: string): Promise<{ email: string; la_ve_tinh: number } | null> {
  const r = await db
    .prepare(
      `SELECT u.email, u.la_ktv_dvbh, u.la_ve_tinh,
              EXISTS(SELECT 1 FROM ktv_lien_he k WHERE LOWER(TRIM(k.email_dang_nhap)) = LOWER(u.email) AND COALESCE(k.ngung_hoat_dong, 0) = 0) AS co_ma,
              EXISTS(SELECT 1 FROM ktv_lien_he k WHERE LOWER(TRIM(k.email_dang_nhap)) = LOWER(u.email) AND COALESCE(k.ngung_hoat_dong, 0) = 0
                     AND k.vai_tro_ktv = 'Ve tinh') AS ma_ve_tinh
       FROM users u WHERE u.email = ?`,
    )
    .bind(email)
    .first<{ email: string; la_ktv_dvbh: number; la_ve_tinh: number; co_ma: number; ma_ve_tinh: number }>();
  if (!r || !(r.la_ktv_dvbh || r.la_ve_tinh || r.co_ma)) return null;
  return { email: r.email, la_ve_tinh: r.la_ve_tinh || (!r.la_ktv_dvbh && r.ma_ve_tinh) ? 1 : 0 };
}

// Chan KTV chua co Ma MISA dat hang (chot 2026-10-08): nguoi NHAN HANG cuoi cung (sau Ve tinh -> Tram) la KTV (co KTV DVBH/Ve
// tinh hoac Gmail gan 1 ma KTV dang hoat dong) ma KHONG ma nao dang hoat dong cua Gmail do co ma_misa -> khong tao duoc don (moi
// loai don, ca KTV tu dat lan TN/GS dat ho, tao tay + import Excel). Nguoi nhan khong phai KTV (GS/TN "Chinh toi") khong bi chan.
async function nguoiNhanChuaCoMaMisa(db: D1Database, email: string): Promise<boolean> {
  const r = await db
    .prepare(
      `SELECT u.la_ktv_dvbh, u.la_ve_tinh, u.vai_tro,
              EXISTS(SELECT 1 FROM ktv_lien_he k WHERE LOWER(TRIM(k.email_dang_nhap)) = LOWER(u.email) AND COALESCE(k.ngung_hoat_dong, 0) = 0) AS co_ma,
              EXISTS(SELECT 1 FROM ktv_lien_he k WHERE LOWER(TRIM(k.email_dang_nhap)) = LOWER(u.email) AND COALESCE(k.ngung_hoat_dong, 0) = 0
                     AND TRIM(COALESCE(k.ma_misa, '')) <> '') AS co_misa
       FROM users u WHERE u.email = ?`,
    )
    .bind(email)
    .first<{ la_ktv_dvbh: number; la_ve_tinh: number; vai_tro: string | null; co_ma: number; co_misa: number }>();
  if (!r) return false;
  // QC (v1.451) dat hang nhu KTV -> cung bat buoc Ma nhan hang kem Ma MISA (file MISA lay ma kho / ten MISA tu ma KTV).
  return !!(r.la_ktv_dvbh || r.la_ve_tinh || r.co_ma || r.vai_tro === "QC") && !r.co_misa;
}

// GET /api/dat-mua-lk/kiem-tra-ma-misa?nguoi_nhan_hang=<email> - FE hoi truoc khi soan don de hien canh bao + khoa nut gui
// (cung cach resolve nguoi nhan nhu POST /phieu-dat). Bo trong = chinh nguoi goi.
datMuaLinhKien.get("/kiem-tra-ma-misa", async (c) => {
  const user = c.get("user");
  const q = c.req.query("nguoi_nhan_hang")?.trim();
  let targetUser: { email: string; la_ve_tinh: number | boolean } = { email: user.email, la_ve_tinh: user.la_ve_tinh };
  if (q && q !== user.email) {
    const target = await nguoiNhanHangHopLe(c.env.DB, q);
    if (!target) return c.json({ chua_co_ma_misa: false });
    targetUser = target;
  }
  const resolved = await resolveNguoiNhanHang(c.env.DB, targetUser);
  if ("error" in resolved) return c.json({ chua_co_ma_misa: false });
  return c.json({ chua_co_ma_misa: await nguoiNhanChuaCoMaMisa(c.env.DB, resolved.email), nguoi_nhan_hang: resolved.email });
});

// Tien to ID phieu_dat theo VAI TRO nguoi goi API luc tao (khong luu cot rieng) - chot buoc 1 ke
// hoach "Luong tao don mua hang": XH- (KTV/Ve tinh tu tao), TN- (Tac nghiep tao ho), AD- (GS tao
// ho). Uu tien TN/GS truoc vi 1 nguoi co the vua la_ktv_dvbh vua giu vai_tro khac.
function phieuDatPrefix(c: Context<{ Bindings: Env }>): "XH" | "TN" | "AD" {
  const user = c.get("user");
  if (canTacNghiep(c)) return "TN";
  if (user.vai_tro === "Giam sat") return "AD";
  return "XH";
}

// GET /api/dat-mua-lk/ve-tinh-cua-toi - danh sach Ve tinh (email + ten) co tram_cha = nguoi goi,
// dung cho dropdown filter "nguoi tao" o buoc 5 ke hoach (duyet hang loat cho Tram). Tram nao khong
// co Ve tinh nao thi tra rows rong (khong loi).
datMuaLinhKien.get("/ve-tinh-cua-toi", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(`SELECT email, ${tenNguoiDaySql("users.email")} AS ten FROM users WHERE tram_cha = ? ORDER BY ten`).bind(user.email).all();
  return c.json({ rows: results });
});

// GET /api/dat-mua-lk/nguoi-nhan-hang-kha-dung - danh sach KTV co the chon lam "nguoi nhan hang"
// khi TN/GS tao phieu ho (Giai doan 4b) - lay tu ktv_lien_he (danh ba KTV, migration 0067) JOIN
// users qua email_dang_nhap (Admin tu ghep tay o Settings > Danh sach KTV) - chi liet ke KTV DA
// ghep tai khoan dang nhap that (chua ghep thi chua the la nguoi_nhan_hang, vi can loc "don cua toi"
// theo email that). Mo cho MOI nguoi da dang nhap (khong con gate FORBIDDEN_ROLE - chi la danh ba
// ten/ma KTV, khong nhay cam; mo rong 2026-08-16 de moi man hinh cua module deu tra cuu duoc
// email -> ten hien thi, xem DatMuaLinhKienModule.tsx useKtvDisplayMap), rieng GS van chi thay KTV
// do chinh minh phu trach (users.giam_sat_quan_ly = email GS - VAN la nguon that phan quyen,
// ktv_lien_he.giam_sat_quan_ly chi la danh ba/tra cuu - xem comment scopeDatMua.ts).
// CHOT (ra soat "Tao Don Linh Kien 2.0" #2): tra them ten_gs (LEFT JOIN users qua
// u.giam_sat_quan_ly) de frontend hien "MaKTV - Ten KTV (GS: Ten GS)" khi TN chon "nguoi nhan hang"
// giua nhieu GS khac nhau - GS goi API nay chi thay dung KTV cua minh (where da loc san) nen frontend
// tu bo qua hien thi ten_gs trong truong hop do (du thua).
// RA SOAT BAO MAT/NGHIEP VU 2026-08-18 (phan hoi Codex #7, chu he thong xac nhan GS DUOC phep tu
// nhan hang/chuyen tien nhu KTV): UNION them chinh cac tai khoan vai_tro='Giam sat' (ma_ktv rong vi
// GS khong co ma KTV that - xem formatNguoiDisplay o frontend da xu ly rieng truong hop nay) - neu
// khong lam vay, moi noi trong module hien ten qua ktvDisplayMap (bang/chi tiet PXK, chi tiet don...)
// se hien THANG EMAIL THO cho don ma nguoi_nhan_hang la 1 GS tu nhan. GS goi API nay chi thay chinh
// minh (khong thay GS khac) - giu dung tinh than "GS chi thay pham vi cua minh" nhu nhanh KTV; nguoi
// khac (TN/Kho/Ke toan/Admin) thay TAT CA GS de tra cuu ten duoc cho moi don, khop cach ho da thay
// TOAN BO KTV khong loc.
datMuaLinhKien.get("/nguoi-nhan-hang-kha-dung", async (c) => {
  const user = c.get("user");
  let ktvWhereSql = "dsk.email_dang_nhap IS NOT NULL";
  const ktvBinds: unknown[] = [];
  let gsWhereSql = "u2.vai_tro = 'Giam sat'";
  const gsBinds: unknown[] = [];
  // SUA (phan hoi 2026-09-28 "Cho phép GS đặt linh kiện cho cả KTV không thuộc khu vực của mình =>
  // danh sách KTV sẽ hiện toàn bộ KTV trên hệ thống"): bo loc u.giam_sat_quan_ly = GS - GS thay MOI KTV
  // (kem ten_gs de biet KTV thuoc GS nao). Van chi thay CHINH MINH trong nhanh tai khoan GS.
  if (user.vai_tro === "Giam sat") {
    gsWhereSql += " AND u2.email = ?";
    gsBinds.push(user.email);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT dsk.ma_ktv, ${tenNguoiDaySql("dsk.email_dang_nhap")} AS ten_hien_thi, dsk.email_dang_nhap, ${tenNguoiNullSql("gs.email")} AS ten_gs,
            MAX(COALESCE(u.bi_khoa, 0), dsk.ngung_hoat_dong) AS bi_khoa, -- tat theo MA (0060) hoac ca Gmail
            EXISTS(SELECT 1 FROM khach_le_nhom kn WHERE kn.ma_ktv = dsk.ma_ktv) AS la_nhom_kh_le, -- chon nhom -> nhap SDT KH le (0074)
            COALESCE(u.la_nv_sua_chua, 0) AS la_nv_sua_chua -- v1.498: form dua "CÔNG NỢ SỬA CHỮA" len dau hang chon nhanh
     FROM ktv_lien_he dsk
     JOIN users u ON u.email = dsk.email_dang_nhap
     LEFT JOIN users gs ON gs.email = u.giam_sat_quan_ly
     WHERE ${ktvWhereSql}
     UNION ALL
     SELECT '' as ma_ktv, ${tenNguoiDaySql("u2.email")} as ten_hien_thi, u2.email as email_dang_nhap, NULL as ten_gs, COALESCE(u2.bi_khoa, 0) AS bi_khoa,
            0 AS la_nhom_kh_le, COALESCE(u2.la_nv_sua_chua, 0) AS la_nv_sua_chua
     FROM users u2
     WHERE ${gsWhereSql}
     ORDER BY ten_hien_thi`,
  )
    .bind(...ktvBinds, ...gsBinds)
    .all();
  return c.json({ rows: results });
});

// GET /api/dat-mua-lk/cong-no-du-kien?nguoi_nhan_hang=<email> - tra { tran, cong_no_chot } cua 1 KTV -
// dung de CANH BAO SONG ngay trong luc dang soan don (them 2026-09-04, phan hoi "ngay thời điểm người
// dùng tạo đơn linh kiện chứa công nợ đã phải hiện cảnh báo rồi", khac voi danh_gia_cong_no da co san
// - cai do CHOT 1 LAN SAU KHI da tao don, khong giup nguoi dung biet TRUOC luc dang gop dong). Khong
// nhan tu client "tong cong no tam tinh" (frontend tu tinh lay tu danhMuc.gia_tri_cong_no da co san,
// endpoint nay chi tra 2 con so nen tang: tran + cong no chot HIEN TAI, frontend tu cong them tam tinh
// cua cac dong dang soan de so sanh - xem useTaoDonForm.ts). Quyen han/logic resolve nguoi_nhan_hang
// GIONG HET POST /phieu-dat (chi TN/GS duoc xem KTV khac, GS chi xem KTV minh phu trach) - COPY co
// chu y (khong tach ham dung chung) vi 2 noi khac nhau ve output (route nay chi doc, khong tao don).
datMuaLinhKien.get("/cong-no-du-kien", async (c) => {
  if (!canCreatePhieuDat(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const user = c.get("user");
  const q = c.req.query("nguoi_nhan_hang")?.trim();
  let targetUser: { email: string; la_ve_tinh: number | boolean };
  if (q && q !== user.email) {
    if (!canQuanLyDonHo(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    const target = await nguoiNhanHangHopLe(c.env.DB, q);
    if (!target) return c.json({ error: "NGUOI_NHAN_HANG_KHONG_HOP_LE" }, 400);
    targetUser = target;
  } else {
    targetUser = { email: user.email, la_ve_tinh: user.la_ve_tinh };
  }
  const resolved = await resolveNguoiNhanHang(c.env.DB, targetUser);
  if ("error" in resolved) return c.json({ error: resolved.error }, 400);
  const nguoiNhanHang = resolved.email;

  // (Bo 2026-09-28) GS duoc dat/tra cuu cho MOI KTV, khong con gioi han KTV minh phu trach.

  // Nguoi nhan la GS -> khong doi chieu tran (2026-10-16, cung quy tac nguCanhNhan().laGs o lib/tuDongDuyet.ts) - FE an canh bao.
  const laGs = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ? AND vai_tro = 'Giam sat'").bind(nguoiNhanHang).first();
  if (laGs) return c.json({ tran: null, cong_no_chot: 0, khong_xet_tran: true });
  const ktvRow = await c.env.DB.prepare("SELECT ma_ktv, cong_no, khong_tran_cong_no FROM ktv_lien_he WHERE email_dang_nhap = ?")
    .bind(nguoiNhanHang)
    .first<{ ma_ktv: string; cong_no: number | null; khong_tran_cong_no: number | null }>();
  if (!ktvRow) return c.json({ tran: null, cong_no_chot: 0 });
  // KTV "Khong co tran cong no" (migration 0117) - khong xet tran, FE an canh bao nhu GS.
  if (ktvRow.khong_tran_cong_no) return c.json({ tran: null, cong_no_chot: 0, khong_xet_tran: true });
  const congNoChot = await computeCongNoChot(c.env.DB, ktvRow.ma_ktv);
  return c.json({ tran: ktvRow.cong_no, cong_no_chot: congNoChot });
});

// GET /api/dat-mua-lk/du-phong-du-kien?nguoi_nhan_hang=<email> - tra { tran, moc_hien_tai} cua 1 KTV -
// mirror DUNG /cong-no-du-kien o tren (them 2026-09-13, phan hoi "Nếu ktv chọn 'MUA DỰ TRỮ' hệ thống
// sẽ tự hiện cảnh báo số tiền chốt dữ trữ còn khả dụng, giống như hiện tại đang cảnh báo đơn công nợ")
// - CHI dung de HIEN THI banner thong tin luc soan don MUA DỰ TRỮ (khong chan tao don/khong gan vao
// auto-duyet - xem DuDoanDuyetHint.tsx/useTaoDonForm.ts frontend).
datMuaLinhKien.get("/du-phong-du-kien", async (c) => {
  if (!canCreatePhieuDat(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const user = c.get("user");
  const q = c.req.query("nguoi_nhan_hang")?.trim();
  let targetUser: { email: string; la_ve_tinh: number | boolean };
  if (q && q !== user.email) {
    if (!canQuanLyDonHo(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    const target = await nguoiNhanHangHopLe(c.env.DB, q);
    if (!target) return c.json({ error: "NGUOI_NHAN_HANG_KHONG_HOP_LE" }, 400);
    targetUser = target;
  } else {
    targetUser = { email: user.email, la_ve_tinh: user.la_ve_tinh };
  }
  const resolved = await resolveNguoiNhanHang(c.env.DB, targetUser);
  if ("error" in resolved) return c.json({ error: resolved.error }, 400);
  const nguoiNhanHang = resolved.email;

  // (Bo 2026-09-28) GS duoc dat/tra cuu cho MOI KTV, khong con gioi han KTV minh phu trach.

  const ktvRow = await c.env.DB.prepare("SELECT ma_ktv, han_muc_du_phong FROM ktv_lien_he WHERE email_dang_nhap = ?")
    .bind(nguoiNhanHang)
    .first<{ ma_ktv: string; han_muc_du_phong: number | null }>();
  if (!ktvRow) return c.json({ tran: null, moc_hien_tai: 0 });
  const mocHienTai = await computeMocDuPhongHienTai(c.env.DB, ktvRow.ma_ktv);
  return c.json({ tran: ktvRow.han_muc_du_phong, moc_hien_tai: mocHienTai });
});

// (Bo 2026-10-14) GET /du-doan-duyet - thay bang POST /phieu-dat/kiem-tra (danh gia CA phieu bang CUNG bo quyet dinh voi luc tao).

// GET /api/dat-mua-lk/tong-ngay-ktv?nguoi_nhan_hang=<email>&ngay=YYYY-MM-DD[,YYYY-MM-DD...] (them 2026-09-28,
// phan hoi "tổng tiền ktv đặt mua + trừ công nợ trong ngày hiện ở đâu?" + "hiện tổng tiền ước tính cần chuyển
// khoản bên cạnh") - tong gia tri dat hang (gia ban x SL - nen tinh moc chiet khau 200k/500k) + tong tien uoc
// tinh can chuyen cua KTV trong tung ngay. Mac dinh: chinh minh, hom nay (gio VN). KTV/Ve tinh chi xem duoc
// chinh minh hoac Tram cua minh; vai tro van phong/GS/Admin xem moi KTV.
datMuaLinhKien.get("/tong-ngay-ktv", async (c) => {
  const user = c.get("user");
  const email = c.req.query("nguoi_nhan_hang")?.trim() || user.email;
  const laVanPhong = !!(canTacNghiep(c) || user.la_kho || user.la_ke_toan || user.la_tp_dvbh || user.la_view || user.la_mua_hang
    || user.vai_tro === "Admin" || user.vai_tro === "QC" || user.vai_tro === "Giam sat");
  if (email !== user.email && email !== user.tram_cha && !laVanPhong) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  // Ve tinh khong phai nguoi nhan hang - don cua Ve tinh ghi nguoi_nhan_hang = Tram (resolveNguoiNhanHang),
  // nen tong ngay/chiet khau tinh theo Tram. Chua gan Tram -> khong co don nao.
  const target = await c.env.DB.prepare("SELECT la_ve_tinh FROM users WHERE email = ?").bind(email).first<{ la_ve_tinh: number }>();
  const resolved = await resolveNguoiNhanHang(c.env.DB, { email, la_ve_tinh: target?.la_ve_tinh ?? 0 });
  if ("error" in resolved) return c.json({ nguoi_nhan_hang: null, rows: [] });
  const ngays = (c.req.query("ngay") || nowVN().slice(0, 10))
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
    .slice(0, 31);
  const rows = await tongNgayKtv(c.env.DB, resolved.email, [...new Set(ngays)]);
  // Quy du (migration 0047) - tien chuyen du tinh cho NGUOI NHAN HANG (Ve tinh -> Tram).
  // kh_le: KH le / nhom KH le tinh gia niem yet (0074) - FE khong hien bac thang chiet khau.
  return c.json({ nguoi_nhan_hang: resolved.email, rows, quy_du: await soDuQuy(c.env.DB, resolved.email), kh_le: await laNguoiNhanKhLe(c.env.DB, resolved.email) });
});

// GET /api/dat-mua-lk/khu-vuc-cua-toi (them 2026-08-27, phan hoi "GS test không thấy đơn của KTV khu
// vực mình" + yeu cau "filter theo khu vực... GS tự lọc mặc định theo khu vực mình được set") - tra
// danh sach Khu vuc GAN VOI CHINH tai khoan dang goi, dung lam gia tri MAC DINH cho bo loc Khu vuc o
// DonCuaToiTab + khoi "KTV khu vực của tôi" o TrangChuTab. GS: qua khu_vuc.gs_email (nguon that phan
// cong GS - Settings > Khu vực). TN/Kho/Ke toan: qua user_khu_vuc (Admin gan o UsersModule, xem
// CLAUDE.md - bang nay truoc gio la "MEM" chi phuc vu tim kiem/thong ke, nay THEM 1 cong dung nua la
// gia tri mac dinh cho bo loc nay, KHONG doi thanh gioi han cung nhu la_view). Vai tro khac (KTV/Ve
// tinh/Admin thuan/QC) tra mang rong - khong co khai niem "khu vuc cua toi" o day.
datMuaLinhKien.get("/khu-vuc-cua-toi", async (c) => {
  const user = c.get("user");
  if (user.vai_tro === "Giam sat") {
    // + Khu vuc xem them (user_khu_vuc, 2026-10-02) - khop khuVucCuaToiSet().
    const { results } = await c.env.DB.prepare(
      "SELECT ma, ten FROM khu_vuc WHERE gs_email = ? OR ma IN (SELECT khu_vuc_ma FROM user_khu_vuc WHERE user_email = ?) ORDER BY stt, ma",
    )
      .bind(user.email, user.email)
      .all<{ ma: string; ten: string }>();
    return c.json({ rows: results });
  }
  if (user.la_tac_nghiep || user.la_kho || user.la_ke_toan) {
    const { results } = await c.env.DB.prepare(
      `SELECT kv.ma, kv.ten FROM user_khu_vuc uk JOIN khu_vuc kv ON kv.ma = uk.khu_vuc_ma WHERE uk.user_email = ? ORDER BY kv.stt, kv.ma`,
    )
      .bind(user.email)
      .all<{ ma: string; ten: string }>();
    return c.json({ rows: results });
  }
  return c.json({ rows: [] });
});

// GET /api/dat-mua-lk/ton-dong-theo-ktv (them 2026-08-27, phan hoi "cái tôi cần là 1 báo cáo nhanh để
// xem còn bao nhiêu đơn đặt hàng đang tồn theo từng ktv... để nhắc nhở ktv/tn/kế toán/kho hỗ trợ đáp
// ứng... cái nhìn nhanh trong 5s") - thay the khoi "KTV khu vực của tôi" (chi liet ke danh ba, khong
// tra loi duoc "con ton bao nhieu don"). Chi rieng Giam sat/TN/Kho/Ke toan/Admin duoc goi (giong dieu
// kien isManagerView o frontend) - KTV/Ve tinh xem TIEN DO CUA HO qua StatCard/pipeline san co, khong
// can bao cao "theo tung KTV" nay.
//
// "Con ton" = 1 dong dat_don_hang (mua/cong_no, GIONG dung bien loai_don != 'tra_hang' cua moi bao cao
// khac trong file nay) CHUA cham 1 trong cac trang thai KET THUC that su - dung LAI chinh xac dieu
// kien "ket_thuc_luc" da chot voi nguoi dung o GET /bao-cao-tong-the (CTE ddh_kt phia tren) thay vi
// tu nghi dieu kien moi: dong huy ('TN tu choi'/'Da huy') HOAC PXK da toi 1 trong 4 trang thai dong
// ('Ke toan huy','Kho da ket thuc','Hang tru kho','KTV da nhan'). "Cho hang" KHONG nam trong dieu kien
// dong (dung y: con cho hang ve la con ton that, day chinh la thu GS/TN can thay).
//
// KHONG ap dung scope cung theo email_gs/phuTrachGsSet (khac bao-cao-tong-the) - day la 1 bao cao MO,
// nguoi xem tu chon Khu vuc/KTV muon kiem soat qua 2 query param duoi day (khop dung mo hinh "bo loc
// Khu vuc" vua them o GET /don-hang: mac dinh FE tu dien theo GET /khu-vuc-cua-toi nhung nguoi dung co
// the tu mo rong "Toan quoc" - xem CLAUDE.md "TN/Kho/Ke toan xem duoc toan quoc").
datMuaLinhKien.get("/ton-dong-theo-ktv", async (c) => {
  const user = c.get("user");
  if (!(user.vai_tro === "Giam sat" || user.vai_tro === "Admin" || canTacNghiep(c) || user.la_kho || user.la_ke_toan || user.la_mua_hang)) {
    return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  }
  const khuVucMa = c.req.query("khu_vuc")?.trim();
  const nguoiNhanHang = c.req.query("nguoi_nhan_hang")?.trim();
  const khuVucList = khuVucMa ? khuVucMa.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const conditions: string[] = [];
  const binds: unknown[] = [];
  // v1.450: loc theo KHU VUC CUA DON (COALESCE(khu_vuc_chon, khu_vuc_ma) - nhu moi danh sach khac) thay vi khu vuc cua KTV; 1 bind JSON.
  if (khuVucList.length > 0) {
    conditions.push(`o.khu_vuc_don IN (SELECT value FROM json_each(?))`);
    binds.push(JSON.stringify(khuVucList));
  }
  if (nguoiNhanHang) {
    conditions.push("o.nguoi_nhan_hang = ?");
    binds.push(nguoiNhanHang);
  }
  const whereExtra = conditions.length > 0 ? ` AND ${conditions.join(" AND ")}` : "";

  // Cache (them 2026-09-21, phan hoi kiem toan chi phi D1 quy mo 2-3 nam): ket qua CHI phu thuoc 2
  // query param (khu_vuc/nguoi_nhan_hang), khong phu thuoc danh tinh nguoi goi (dung y "bao cao MO"
  // da ghi o comment dau route) nen scope truyen null - toi da hoa chia se cache giua nhieu nguoi
  // dung khac nhau cung xem cung bo loc. "now" PHAI tinh SAU khi lay cache (khong duoc loc vao trong
  // compute()) de khong bi "dong bang" theo thoi diem tinh cache lan dau.
  // v1.450: ap PHAM VI XEM cua nguoi goi (scopeDatMuaNguoiTao) - truoc day "bao cao mo": GS bo chon khu vuc la thay don MOI khu vuc.
  const scope = scopeDatMuaNguoiTao(c);
  const key = buildReportKey("ton-dong-theo-ktv-v2", { khu_vuc: khuVucMa, nguoi_nhan_hang: nguoiNhanHang }, scope ? [user.email] : null);
  const rows = await cachedReport(c.env.DB, key, ["dat_mua_lk"], async () => {
    const { results } = await c.env.DB.prepare(
      `WITH ddh_open AS (
         SELECT ddh.id, ddh.loai_don, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat,
           ddh.nguoi_nhan_hang, ddh.ngay_tao, ddh.trang_thai_hien_tai as ddh_trang_thai,
           pxk.trang_thai_hien_tai as pxk_trang_thai,
           pxk.so_tien_can_chuyen, pxk.trang_thai_chuyen_tien,
           COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) AS khu_vuc_don
         FROM dat_don_hang ddh
         LEFT JOIN phieu_xuat_kho_dong pxkd ON pxkd.dat_don_hang_id = ddh.id
         LEFT JOIN phieu_xuat_kho pxk ON pxk.id = pxkd.phieu_xuat_kho_id
         WHERE ddh.loai_don != 'tra_hang'
           AND ddh.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')
           AND (pxk.trang_thai_hien_tai IS NULL OR pxk.trang_thai_hien_tai NOT IN ('Ke toan huy', 'Kho da ket thuc', 'Hang tru kho', 'KTV da nhan'))${scope?.whereSql ?? ""}
       )
       SELECT o.id, o.loai_don, o.ma_lk, o.ten_lk_snapshot, o.so_luong_de_xuat, o.nguoi_nhan_hang,
         o.ngay_tao, o.ddh_trang_thai, o.pxk_trang_thai, o.so_tien_can_chuyen, o.trang_thai_chuyen_tien,
         ${tenNguoiNullSql("o.nguoi_nhan_hang")} AS ten_hien_thi, k.khu_vuc_ma, k.vai_tro_ktv, kv.ten as khu_vuc_ten,
         (SELECT ngay_du_kien_co_hang FROM thieu_lk WHERE dat_don_hang_id = o.id ORDER BY ngay_tao DESC LIMIT 1) as ngay_du_kien_co_hang
       FROM ddh_open o
       LEFT JOIN ktv_lien_he k ON k.ma_ktv = ${ktvChinhCuaEmailSql("o.nguoi_nhan_hang")}
       LEFT JOIN khu_vuc kv ON kv.ma = k.khu_vuc_ma
       WHERE 1=1${whereExtra}
       ORDER BY o.ngay_tao ASC`,
    )
      .bind(...(scope?.binds ?? []), ...binds)
      .all();
    return results;
  });

  return c.json({ rows, now: nowVN() });
});

// GET/PUT /api/dat-mua-lk/phu-trach-gs - quan ly "khu vuc phu trach" (Giam sat) cho 1 nguoi TN/Kho/Ke
// toan (Admin gan tay) - CHOT 2026-08-15: scope MEM, chi anh huong badge/thong ke (xem
// phuTrachGsSet/autoClaimGs trong scopeDatMua.ts, migration 0073), KHONG gioi han danh sach/tim
// kiem. Chi Admin duoc xem/sua (Admin quan ly toan bo phan quyen nguoi dung, khop UsersModule.tsx).
datMuaLinhKien.get("/phu-trach-gs", async (c) => {
  if (c.get("user").vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const nguoiPhuTrach = c.req.query("nguoi_phu_trach")?.trim();
  if (!nguoiPhuTrach) return c.json({ error: "MISSING_NGUOI_PHU_TRACH" }, 400);
  const { results } = await c.env.DB.prepare("SELECT giam_sat_email FROM dat_mua_lk_phu_trach_gs WHERE nguoi_phu_trach = ? ORDER BY giam_sat_email")
    .bind(nguoiPhuTrach)
    .all<{ giam_sat_email: string }>();
  return c.json({ emails: (results as { giam_sat_email: string }[]).map((r) => r.giam_sat_email) });
});

datMuaLinhKien.put("/phu-trach-gs", async (c) => {
  if (c.get("user").vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ nguoi_phu_trach?: string; giam_sat_emails?: string[] }>();
  const nguoiPhuTrach = body.nguoi_phu_trach?.trim();
  if (!nguoiPhuTrach || !Array.isArray(body.giam_sat_emails)) return c.json({ error: "INVALID_BODY" }, 400);

  const statements = [c.env.DB.prepare("DELETE FROM dat_mua_lk_phu_trach_gs WHERE nguoi_phu_trach = ?").bind(nguoiPhuTrach)];
  for (const email of new Set(body.giam_sat_emails.map((e) => e.trim()).filter(Boolean))) {
    statements.push(
      c.env.DB.prepare("INSERT INTO dat_mua_lk_phu_trach_gs (nguoi_phu_trach, giam_sat_email, tu_dong_gan) VALUES (?, ?, 0)").bind(nguoiPhuTrach, email),
    );
  }
  await c.env.DB.batch(statements);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// GET /api/dat-mua-lk/luong-quy-trinh - 13 buoc CHOT 2026-08-17 theo yeu cau "thanh dieu huong dang
// pipeline" thay cho SummaryStrip cu (danh sach pill dai dong loi). FE tu quyet dinh to mau buoc nao
// theo vai tro cua nguoi dang xem qua field "roleKeys" tra ve, khong an/hien buoc nao ca. Khong cache
// (giong /bao-cao-tong-the canh no - du lieu nho, chi chay luc mo module).
//
// SUA (phan hoi QA 2026-08-31, muc #3): TRUOC DAY so nay LUON tinh TOAN BO he thong (khong scope theo
// phuTrachGsSet/vai tro nguoi goi), chu dich ban dau la "ai cung thay CA luong quy trinh, chi to mau/
// phong to buoc cua rieng minh" - DA DAO NGUOC theo xac nhan moi cua nguoi dung (AskUserQuestion
// 2026-08-31): TN/Kho/Ke toan chi duoc thay dung so viec cua khu vuc minh phu trach (xem scopeCond/
// phuTrachGsSet ngay duoi). Cac cot khong gan rieng vai tro nao (tram/tp_dvbh/tra_hang_qc/cho_hang/
// ktv) VAN giu nguyen khong scope.
//
// 4 buoc KHONG co san truoc do (cho_hang/cho_tien/tao_pxk/ktv) - da hoi ro nguon du lieu voi chu he
// thong truoc khi viet (2026-08-17):
//  - cho_hang: dat_don_hang dang o trang thai dong "Cho hang" (TN cho hang ve, tu dong sinh ticket
//    thieu_lk rieng - "thieu_lk" o duoi la SO TICKET dang o buoc dau "Cho kho xu ly", KHAC voi so nay
//    la SO DON dang treo o "Cho hang" noi chung, co the > so ticket vi ticket co the da qua buoc dau).
//  - cho_tien: PXK co so_tien_can_chuyen (khac null) NHUNG trang_thai_chuyen_tien CHUA phai 'TN da
//    duyet' (con o 'Cho KTV chuyen' hoac 'KTV da chuyen') - day la 1 DIEU KIEN CHAN rieng tren PXK
//    (xem migration 0066), khong phai 1 gia tri trang_thai chinh nen KHONG the loc bang
//    GET /phieu-xuat-kho?trang_thai=... - bam vao buoc nay dong vai "Tao PXK" (cung nam trong tap PXK
//    dang "Dang tao phieu", chua the gui Ke toan vi chua giai quyet xong tien).
//  - tao_pxk: PXK dang o trang thai dau "Dang tao phieu" (da tao, CHUA bam gui Ke toan).
//  - ktv: PXK dang o trang thai "Dang gui KTV" (da gui, cho KTV bam xac nhan da nhan).
// Ca 4 buoc PXK (cho_tien/tao_pxk/ke_toan/kho/ktv) VA cho_hang/tram/tp_dvbh/tac_nghiep (nhanh mua
// hang/cong no) deu loai tru loai_don='tra_hang' (chu he thong chot: "tổng cả 2 phân loại đơn mua
// hàng và đơn công nợ cho toàn bộ luồng") - tra_hang di theo cac buoc rieng cua no (tra_hang_kt/kho/
// qc/tn o dau pipeline + tra_hang_tao_pxk/pxk_kt/pxk_kho rieng cho PXK tra hang, migration
// 0002_tra_hang_pxk.sql), khong dem lai o cac buoc PXK chung ben duoi de tranh dem trung.
export interface LuongQuyTrinhStep {
  key: string;
  label: string;
  count: number;
  // FIX (ra soat 2026-08-29): so RIENG cua nguoi dang goi API (loc nguoi_nhan_hang = user.email) - CHI
  // co o 2 buoc "cho_tien"/"ktv" (von la viec CA NHAN cua tung KTV, khac han "kho"/"ke_toan"/
  // "tac_nghiep" la hang cho CHUNG toan he thong). FE phai dung field nay thay cho `count` khi hien thi
  // "viec cua toi" cho nguoi xem co roleKey "ktv", vi `count` van la so TOAN HE THONG (dung cho bang
  // dieu hanh chung/Tac nghiep, KHONG duoc doi y nghia).
  countCuaToi?: number;
  // Vai tro nao thi buoc nay la "viec cua ho" - FE dung de to mau/phong to khi nguoi xem thuoc 1
  // trong cac vai tro nay. Mang rong ([]) = buoc mang tinh thong tin chung, khong gan rieng ai.
  roleKeys: string[];
  tab: string;
  filter: string;
  // Them (migration 0002_tra_hang_pxk.sql) - CHI dung cho 3 buoc PXK tra hang (tab="phieu-xuat-kho")
  // de bam vao dung sub-tab loai_don, vi tab do co THEM 1 lop loc rieng (xemLoaiDon) khong nam trong
  // "filter" (filter chi mang trang_thai_hien_tai) - xem loaiDonFor() trong DatMuaLinhKienModule.tsx.
  // Them sentinel "all" (2026-08-21, sua bug "ấn TN 2 chỉ hiện 1"): dung cho cac buoc tab="don-cua-toi"
  // co so dem GOP ca "mua" lan "cong_no" (tram/tp_dvbh/tac_nghiep/cho_hang) - bao DonCuaToiTab bo qua
  // xemLoaiDon (sub-tab dang mo) va truy van GOP ca 2 loai cho khop dung so tren pipeline, xem
  // initialLoaiDonOverride trong DonCuaToiTab.tsx.
  loaiDon?: string;
}
// Them (2026-09-01, phan hoi "ấn vào đơn đang tồn 6... làm sao tôi biết 6 đơn này hiện ở đâu") -
// breakdown chi tiet cua "Đang tồn"/"Tồn đọng toàn hệ thống" o GET /home-summary, cung hinh dang voi
// LuongQuyTrinhStep (tru countCuaToi, khong can vi day da la so RIENG cua tung buoc, khong phai dem
// gop toan he thong nhu luong-quy-trinh) de tai su dung dung tab/filter/loaiDon o FE.
export interface DangTonStep {
  key: string;
  label: string;
  count: number;
  roleKeys: string[];
  tab: string;
  filter: string;
  loaiDon?: string;
  // Buoc chi dem viec CUA CHINH nguoi xem (vd PXK nguoi_nhan_hang = minh) -> FE loc danh sach theo nguoi nhan nay khi bam.
  nguoiNhanHang?: string;
  // Them (fix "bấm 'Việc cần làm' trên mobile nhảy sai tab/filter") - danh dau dong nao trong so cac
  // dong dangTonSteps THAT SU nam trong tong canLam (subset, xem cong thuc canLam += ... o duoi) de FE
  // dung LAM NGUON thay the mySteps (luong-quy-trinh, bi tat tren mobile qua "enabled: !isMobile") khi
  // hien "Cần làm" o TrangChuTab.tsx - tranh remap ve 1 the gop chung bam-nhay sai tab/filter.
  isCanLam?: boolean;
}

datMuaLinhKien.get("/luong-quy-trinh", async (c) => {
  const user = c.get("user");
  // SUA (phan hoi QA 2026-08-31, muc #3: "KTV cua khu vuc MB1 tao don, nhung TN cua cac khu vuc <>
  // MB1 van thay so 'Viec can lam hom nay' cua khu vuc khac") - DAO NGUOC quyet dinh cu ("LUON tinh
  // TOAN BO he thong, khong scope" - xem ly do cu da xoa). Nguoi dung xac nhan (AskUserQuestion
  // 2026-08-31) muon TN/Kho/Ke toan CHI thay dung so viec cua khu vuc minh phu trach, dung LAI CHINH
  // co che phuTrachGsSet + "full=1" override da chung minh o GET /bao-cao-tong-the (xem comment o do,
  // cung 1 dinh nghia). CHI scope cac cot roleKeys gan cho tac_nghiep/ke_toan/kho (thuoc "viec cua ho"
  // that su) - tram/tp_dvbh/tra_hang_qc/cho_hang/ktv GIU NGUYEN khong scope (khong gan rieng vai tro
  // nao, hoac ngoai pham vi yeu cau lan nay - QC/KTV khong nam trong quyet dinh #3).
  const wantFull = c.req.query("full") === "1";
  let scopeCond: ((alias: string) => string) | null = null;
  let scopeBinds: string[] = [];
  // KIEM TRA DONG BO TOAN HE THONG (2026-08-31, xem giai thich day du o GET /loai-don-counts) - them
  // LOP THU 2 (Khu vuc dia ly, khuVucCuaToiSet) canh lop GS phu trach co san o tren, cung 1 dieu kien
  // kich hoat (canTacNghiep/kho/ke_toan, khong ap dung khi "full=1"). Truoc day thieu lop nay khien
  // StatCard "Viec can lam hom nay" (dung so tu day) khong khop voi danh sach that (da bi loc them
  // theo Khu vuc o GET /don-hang, /phieu-xuat-kho, /thieu-lk) - vd hien "6 don/2 PXK" nhung danh sach
  // that chi con 3 don/1 PXK sau khi loc Khu vuc.
  let khuVucSet: Set<string> | null = null;
  if ((canTacNghiep(c) || user.la_kho || user.la_ke_toan) && !wantFull) {
    const gsSet = await phuTrachGsSet(c.env.DB, user.email);
    if (gsSet) {
      scopeCond = (alias) => ` AND ${alias}.email_gs IN (${[...gsSet].map(() => "?").join(",")})`;
      scopeBinds = [...gsSet];
    }
    khuVucSet = await khuVucCuaToiSet(c.env.DB, user);
  }
  // ddh: cong dieu kien Khu vuc TRUC TIEP tren chinh dong dang dem (khong can EXISTS join).
  let ddhScope = scopeCond ? scopeCond("ddh") : "";
  let ddhScopeBinds = scopeCond ? [...scopeBinds] : [];
  if (khuVucSet) {
    const { sql, binds } = khuVucSetWhereSql(khuVucSet, ["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]);
    ddhScope += sql;
    ddhScopeBinds.push(...binds);
  }
  // pxk: GS phai EXISTS join qua phieu_xuat_kho_dong -> dat_don_hang (khong co email_gs truc tiep,
  // pattern giong het pxkScopeExists o GET /bao-cao-tong-the); Khu vuc dung TRUC TIEP pxk.nguoi_nhan_hang
  // (da la KTV that, khong can join gi them).
  let pxkScope = scopeCond
    ? ` AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id${scopeCond("ddh2")})`
    : "";
  let pxkScopeBinds = scopeCond ? [...scopeBinds] : [];
  if (khuVucSet) {
    const { sql, binds } = khuVucPxkWhereSql(khuVucSet, "pxk", laKhoThuan(user));
    pxkScope += sql;
    pxkScopeBinds.push(...binds);
  }
  // thieu_lk: ca 2 lop deu can EXISTS join qua dat_don_hang (thieu_lk khong co email_gs/nguoi_tao/
  // nguoi_nhan_hang truc tiep) - gop chung 1 EXISTS, khong tao 2 EXISTS rieng cho tung lop.
  let thieuLkInnerConds = "";
  const thieuLkScopeBinds: string[] = [];
  if (scopeCond) {
    thieuLkInnerConds += scopeCond("ddh3");
    thieuLkScopeBinds.push(...scopeBinds);
  }
  if (khuVucSet) {
    const { sql, binds } = khuVucSetWhereSql(khuVucSet, ["ddh3.nguoi_tao", "ddh3.nguoi_nhan_hang"]);
    thieuLkInnerConds += sql;
    thieuLkScopeBinds.push(...binds);
  }
  // Kho chi xu ly 1 nhom LK (Karofi / B2B, 2026-10-16 - lib/nhomLk.ts).
  const nhomKhoLqt = khoNhomLkLoc(user);
  if (nhomKhoLqt) thieuLkInnerConds += locNhomLkSql("ddh3", nhomKhoLqt);
  const thieuLkScope = thieuLkInnerConds ? ` AND EXISTS (SELECT 1 FROM dat_don_hang ddh3 WHERE ddh3.id = tlk.dat_don_hang_id${thieuLkInnerConds})` : "";
  const sbDdh = () => [...ddhScopeBinds];
  const sbPxk = () => [...pxkScopeBinds];
  const sbThieuLk = () => [...thieuLkScopeBinds];

  // RA SOAT CHI PHI D1 2026-08-18 (phan hoi Codex #10, migration 0087+0088): 16 SELECT COUNT(*) nay
  // chay refetchInterval 5 phut/client + sau MOI mutation (xem invalidatePipelineCounts o frontend) -
  // truoc day moi dong deu can 1 correlated subquery rieng (khong index duoc) de suy trang thai. Gio
  // doc thang cot trang_thai_hien_tai (co index idx_ddh_loai_don_trang_thai/idx_pxk_trang_thai_nhan_hang)
  // - giu nguyen thieu_lk (ngoai pham vi ra soat, van dung correlated subquery nhu cu).
  // FIX (phat hien qua ra soat QA "số hiển thị phải là số thực họ cần xử lý") - "tram" (duoi day)
  // TRUOC DAY dem TOAN HE THONG (moi Tram deu thay CUNG 1 so gom ca don cua Tram khac), trong khi
  // GET /don-hang (danh sach that khi bam vao) lai loc theo QUAN HE tram_cha (scopeDatMuaNguoiTao,
  // xem scopeDatMua.ts) - Tram bam vao "Chờ Trạm duyệt" chi thay don cua CHINH Ve tinh minh, khong
  // khop voi so hien tren the. Them dieu kien tram_cha = nguoi dang goi, dung DUNG 1 quan he voi
  // scopeDatMuaNguoiTao (khong dung khuVucCuaToiSet/phuTrachGsSet - 2 co che do CHI danh cho
  // TN/Kho/Ke toan, Tram dung quan he tram_cha rieng).
  const row = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho Tram duyet' AND ddh.nguoi_tao IN (SELECT email FROM users WHERE tram_cha = ?)) as tram,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho TBP xac nhan') as tp_dvbh,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho ke toan duyet mem'${ddhScope}) as tra_hang_kt,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho kho xac nhan' AND NOT ${traHangTuHuySql("ddh")}${ddhScope}) as tra_hang_kho,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho QC xac nhan') as tra_hang_qc,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho TN duyet'${ddhScope}) as tac_nghiep,
       -- CHOT (ra soat module "Dat Mua Linh Kien 2.0" #12): tach rieng 3 buoc con thieu cua luong tra
       -- hang (truoc day "Cho TN duyet tong" bi GOP CHUNG vao dem cua "tac_nghiep" nhung KHONG co
       -- buoc rieng de bam vao dung tab "tra-hang" - bam vao "Tac nghiep" se nhay sai sang "don-cua-toi"
       -- khong khop dong tra_hang; "Cho ke toan xac nhan nhap kho"/"Cho kho xac nhan nhap kho" truoc do
       -- hoan toan khong co mat trong pipeline). Du 6/6 trang thai cua luong tra hang gio co bam duoc.
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho TN duyet tong'${ddhScope}) as tra_hang_tn,
       -- SUA (migration 0002_tra_hang_pxk.sql): thay 2 buoc "nhap kho" cu (khong con dat toi duoc, da
       -- xoa khoi tra_hang_log CHECK) bang 3 buoc PXK tra hang that (loai_don='tra_hang') - dung dung
       -- pattern tach rieng PXK tra hang khoi PXK mua/cong_no chung, giong het tra_hang_kt/kho/qc/tn
       -- o tren dang tach rieng khoi buoc mua/cong_no chung.
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don = 'tra_hang' AND pxk.trang_thai_hien_tai = 'Dang tao phieu'${pxkScope}) as tra_hang_tao_pxk,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don = 'tra_hang' AND pxk.trang_thai_hien_tai = 'Cho ke toan'${pxkScope}) as tra_hang_pxk_kt,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don = 'tra_hang' AND pxk.trang_thai_hien_tai = 'Da chot xong don xuat'${pxkScope}) as tra_hang_pxk_kho,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho hang') as cho_hang,
       (SELECT COUNT(*) FROM thieu_lk tlk WHERE (SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = tlk.id ORDER BY id DESC LIMIT 1) = 'Cho kho xu ly'${thieuLkScope}) as thieu_lk,
       -- FIX (phan hoi 2026-09-23 "vẫn đếm cả đơn đã hủy") - them dieu kien trang_thai_hien_tai='Dang
       -- tao phieu' vao "cho_tien" (va "cho_tien_cua_toi" ben duoi) - xem giai thich day du o
       -- phieuXuatKho.ts GET / (cung 1 fix, cung ngay): tinh nang Huy PXK (2026-09-22) pha vo bat bien
       -- "chi Dang tao phieu moi co tien chua duyet", PXK "Ke toan huy" con treo tien truoc day bi dem
       -- nham vao day.
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.trang_thai_hien_tai = 'Dang tao phieu' AND pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet'${pxkScope}) as cho_tien,
       -- CHOT (phan hoi 2026-08-24: "khi pxk đang chờ tiền thì tính nó thành chờ tiền, khi cập nhật
       -- tiền xong thì mới chuyển thành pxk") - loai tru PXK dang thoa dieu kien cho_tien o tren, khop
       -- dung exclusion o GET /phieu-xuat-kho (routes/phieuXuatKho.ts) de badge/danh sach nhay toi
       -- luon khop so.
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.trang_thai_hien_tai = 'Dang tao phieu' AND NOT (pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet')${pxkScope}) as tao_pxk,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.trang_thai_hien_tai = 'Cho ke toan'${pxkScope}) as ke_toan,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.trang_thai_hien_tai = 'Da chot xong don xuat'${pxkScope}) as kho,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.trang_thai_hien_tai = 'Dang gui KTV') as ktv,
       -- FIX (ra soat "logic sai theo vai tro" 2026-08-29): "cho_tien"/"ktv" o tren la SO TOAN HE THONG
       -- (dung lam so cho Tac nghiep/bang dieu hanh chung), KHONG duoc dung lam "viec cua toi" cho TUNG
       -- KTV/Ve tinh ca nhan - truoc day FE lay thang s.count nen MOI KTV deu thay CUNG 1 so voi TOAN BO
       -- PXK dang cho tien/dang gui cua TAT CA KTV khac, khong rieng cua minh. Them 2 cot rieng loc theo
       -- dung nguoi_nhan_hang = nguoi dang goi de FE tu chon nguon hien thi phu hop tung doi tuong xem
       -- (xem countCuaToi o types.ts / DatMuaLinhKienModule.tsx).
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.nguoi_nhan_hang = ? AND pxk.trang_thai_hien_tai = 'Dang tao phieu' AND pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet') as cho_tien_cua_toi,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.nguoi_nhan_hang = ? AND pxk.trang_thai_hien_tai = 'Dang gui KTV') as ktv_cua_toi`,
  )
    .bind(
      user.email,
      ...sbDdh(), ...sbDdh(), ...sbDdh(), ...sbDdh(),
      ...sbPxk(), ...sbPxk(), ...sbPxk(),
      ...sbThieuLk(),
      ...sbPxk(), ...sbPxk(), ...sbPxk(), ...sbPxk(),
      user.email, user.email,
    )
    .first<Record<string, number>>();
  const n = (key: string) => row?.[key] ?? 0;

  // "all" (sentinel rieng, xem comment tren LuongQuyTrinhStep.loaiDon o types.ts) - 4 buoc duoi day
  // (tram/tp_dvbh/tac_nghiep/cho_hang) DEM GOP ca "mua" lan "cong_no" (dieu kien "loai_don !=
  // 'tra_hang'" trong truy van dem o tren) - phai bao frontend bo qua sub-tab dang mo (xemLoaiDon) va
  // GOP ca 2 loai khi hien danh sach, neu khong so tren pipeline va so dong hien ra se lech nhau tuy
  // sub-tab nao dang mo luc bam (bug da bao cao 2026-08-21: "ấn TN 2 chỉ hiện 1").
  const steps: LuongQuyTrinhStep[] = [
    { key: "tram", label: "Trạm duyệt", count: n("tram"), roleKeys: ["tram"], tab: "don-cua-toi", filter: "Cho Tram duyet", loaiDon: "all" },
    { key: "tp_dvbh", label: "TBP duyệt LK đặc thù", count: n("tp_dvbh"), roleKeys: ["tp_dvbh"], tab: "don-cua-toi", filter: "Cho TBP xac nhan", loaiDon: "all" },
    { key: "tra_hang_kt", label: "Trả hàng KT", count: n("tra_hang_kt"), roleKeys: ["ke_toan"], tab: "tra-hang", filter: "Cho ke toan duyet mem" },
    { key: "tra_hang_kho", label: "Trả hàng Kho", count: n("tra_hang_kho"), roleKeys: ["kho"], tab: "tra-hang", filter: "Cho kho xac nhan" },
    { key: "tra_hang_qc", label: "Trả hàng QC", count: n("tra_hang_qc"), roleKeys: ["qc"], tab: "tra-hang", filter: "Cho QC xac nhan" },
    { key: "tra_hang_tn", label: "Trả hàng TN", count: n("tra_hang_tn"), roleKeys: ["tac_nghiep"], tab: "tra-hang", filter: "Cho TN duyet tong" },
    { key: "tra_hang_tao_pxk", label: "Trả hàng - Tạo PXK", count: n("tra_hang_tao_pxk"), roleKeys: ["tac_nghiep"], tab: "phieu-xuat-kho", filter: "Dang tao phieu", loaiDon: "tra_hang" },
    { key: "tra_hang_pxk_kt", label: "Trả hàng - KT xác nhận", count: n("tra_hang_pxk_kt"), roleKeys: ["ke_toan"], tab: "phieu-xuat-kho", filter: "Cho ke toan", loaiDon: "tra_hang" },
    { key: "tra_hang_pxk_kho", label: "Trả hàng - Kho nhận hàng", count: n("tra_hang_pxk_kho"), roleKeys: ["kho"], tab: "phieu-xuat-kho", filter: "Da chot xong don xuat", loaiDon: "tra_hang" },
    { key: "tac_nghiep", label: "Tác nghiệp", count: n("tac_nghiep"), roleKeys: ["tac_nghiep"], tab: "don-cua-toi", filter: "Cho TN duyet", loaiDon: "all" },
    { key: "cho_hang", label: "Chờ hàng", count: n("cho_hang"), roleKeys: [], tab: "don-cua-toi", filter: "Cho hang", loaiDon: "all" },
    { key: "thieu_lk", label: "Thiếu LK", count: n("thieu_lk"), roleKeys: ["kho"], tab: "thieu-lk", filter: "Cho kho xu ly" },
    // SUA (phan hoi 2026-08-24: "2 thẻ chờ tiền và pxk hình như đang là 1") - truoc day filter trung
    // voi "tao_pxk" ben duoi ("Dang tao phieu") vi khong co cach loc rieng dieu kien "cho tien" (xem
    // comment dieu kien cho_tien o dau file GET /luong-quy-trinh). Gio dung sentinel "CHO_TIEN" duoc
    // GET /phieu-xuat-kho nhan dien rieng (xem routes/phieuXuatKho.ts).
    // loaiDon: "" o ca 5 dong PXK duoi (cung loi "ấn TN 2 chỉ hiện 1" nhu 4 dong tren, chi khac tab
    // dich - PhieuXuatKhoTab.tsx mac dinh sub-tab "mua" khi thieu loaiDon, xem comment isCanLam o duoi
    // file) - dieu kien dem deu "pxk.loai_don != 'tra_hang'" (gom ca mua/cong_no), khong ep 1 loai.
    { key: "cho_tien", label: "Chờ tiền", count: n("cho_tien"), countCuaToi: n("cho_tien_cua_toi"), roleKeys: ["ktv", "tac_nghiep"], tab: "phieu-xuat-kho", filter: "CHO_TIEN", loaiDon: "" },
    { key: "tao_pxk", label: "Tạo PXK", count: n("tao_pxk"), roleKeys: ["tac_nghiep"], tab: "phieu-xuat-kho", filter: "Dang tao phieu", loaiDon: "" },
    { key: "ke_toan", label: "Kế toán", count: n("ke_toan"), roleKeys: ["ke_toan"], tab: "phieu-xuat-kho", filter: "Cho ke toan", loaiDon: "" },
    { key: "kho", label: "Kho", count: n("kho"), roleKeys: ["kho"], tab: "phieu-xuat-kho", filter: "Da chot xong don xuat", loaiDon: "" },
    { key: "ktv", label: "KTV", count: n("ktv"), countCuaToi: n("ktv_cua_toi"), roleKeys: ["ktv"], tab: "phieu-xuat-kho", filter: "Dang gui KTV", loaiDon: "" },
  ];

  return c.json({ steps });
});

// PXK "dong" (toan bo, khong phan biet loai_don) - PHAI KHOP voi TRANG_THAI_DONG rieng trong
// phieuXuatKho.ts (duplicate co chu dich, cung quy uoc voi TRA_HANG_TRANG_THAI_DONG_COUNTS o tren).
const PXK_TRANG_THAI_DONG_ALL = ["KTV da nhan", "Ke toan huy", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"] as const;

// 4 trang thai "mo" cua rieng buoc dau tra hang (nguoc voi TRA_HANG_TRANG_THAI_DONG_COUNTS o tren, chi
// gom dung 4 buoc dang cho duyet cua THU_TU_BUOC trong traHang.ts) - dung cho GET /home-summary, xem
// comment "dangTon cua TN (tra hang)" o duoi.
const TRA_HANG_MO_STATES = ["Cho ke toan duyet mem", "Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong"] as const;

// GET /api/dat-mua-lk/home-summary - phan hoi 2026-08-31 "trên app cho ktv, việc cần làm đang không
// đúng việc chờ ktv... tách ra Cần làm và Đang tồn" + "tương tự tách ra cho tất cả các vai trò" + "TN,
// KT, Kho thêm 1 ô tồn đọng chung toàn hệ thống". Nguon DUY NHAT, NHE (an toan dung tren ca mobile,
// khong nhu luong-quy-trinh 16 subquery dang bi tat tren mobile) cho man Home:
// - canLam: dung DUNG dinh nghia "den luot xu ly" da dung o loai-don-counts/mo-count (TN/Kho/Ke
//   toan/TBP/QC, scope theo Khu vuc/Khu vuc phu trach), rieng KTV/Ve tinh/Giam sat ("dat ho don nhu
//   ktv") la chi tien + xac nhan da nhan hang cua CHINH ho + Tram duyet (neu la Tram) + don bi tu choi
//   chua xem - truoc day cac muc nay CHI hien tren desktop (mySteps), mobile dung nham choDonCuaToi
//   (khong phai viec can lam that) lam "Viec can lam", nay dong nhat 1 nguon cho ca 2.
// - dangTon: dong/PXK/thieu_lk con "ton" (chua dong ho so that su - dinh nghia RONG HON "mo" o tren,
//   KHONG coi "Cho hang" la dong, khac DON_HANG_TRANG_THAI_DONG) NHUNG khong phai luot cua nguoi dang
//   xem - vd don TN dang o buoc Kho, hoac don cua chinh KTV dang cho Tram/TBP/TN duyet hoac cho hang
//   ve.
// - tonDongToanHeThong: CHI tra cho TN/Kho/Ke toan/Admin - tong so dong con ton TREN TOAN HE THONG
//   (khong loc Khu vuc/Khu vuc phu trach cua rieng ho) - con so "suc khoe" chung, giong nhau du dang
//   xem tu Khu vuc nao.
datMuaLinhKien.get("/home-summary", async (c) => {
  const user = c.get("user");
  const isKtvLike = user.la_ktv_dvbh || user.la_ve_tinh || user.vai_tro === "Giam sat";
  const isStaff = canTacNghiep(c) || canKho(c) || user.la_ke_toan || canTPDvbhXacNhan(c) || user.vai_tro === "QC" || user.vai_tro === "Admin";

  let canLam = 0;
  let dangTon = 0;
  let tonDongToanHeThong: number | null = null;
  const dangTonSteps: DangTonStep[] = [];
  let tonDongToanHeThongSteps: DangTonStep[] | null = null;
  let coToanHeThong = false;

  if (isKtvLike) {
    const scope = scopeDatMuaNguoiTao(c); // KTV/Ve tinh: quan he (nguoi_tao/nguoi_nhan_hang/Ve tinh); GS: email_gs = minh
    const row = await c.env.DB.prepare(
      `SELECT
         -- FIX (phan hoi 2026-09-23 "vẫn đếm cả đơn đã hủy") - them trang_thai_hien_tai='Dang tao
         -- phieu', xem giai thich day du o GET /luong-quy-trinh phia tren (cung 1 fix, cung ngay).
         (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.nguoi_nhan_hang = ? AND pxk.loai_don != 'tra_hang' AND pxk.trang_thai_hien_tai = 'Dang tao phieu' AND pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet') as cho_tien,
         (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.nguoi_nhan_hang = ? AND pxk.loai_don != 'tra_hang' AND pxk.trang_thai_hien_tai = 'Dang gui KTV') as xac_nhan_nhan,
         (SELECT COUNT(*) FROM dat_don_hang ddh JOIN users u ON u.email = ddh.nguoi_tao WHERE u.tram_cha = ? AND ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho Tram duyet') as cho_tram_duyet,
         (SELECT COUNT(*) FROM thong_bao_ktv WHERE nguoi_nhan = ? AND loai = 'tu_choi' AND da_doc = 0) as tu_choi,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai IN ('Cho Tram duyet','Cho TBP xac nhan','Cho TN duyet')${scope?.whereSql ?? ""}) as dang_xu_ly,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho hang'${scope?.whereSql ?? ""}) as cho_hang`,
    )
      .bind(user.email, user.email, user.email, user.email, ...(scope?.binds ?? []), ...(scope?.binds ?? []))
      .first<Record<string, number>>();
    // FIX (phan hoi 2026-09-01, cung loi nhu nhanh isStaff o duoi): "cho_tram_duyet" truoc day tinh
    // KHONG DIEU KIEN cho MOI isKtvLike (KTV/Ve tinh/Giam sat) qua join tho "users.tram_cha = minh" -
    // voi 1 Giam sat/KTV thuong (khong phai Tram that), gia tri nay VAN co the ra >0 (du lieu
    // tram_cha trung ngau nhien) nhung lai KHONG nam trong scope cua "dang_xu_ly" (scopeDatMuaNguoiTao
    // cua Giam sat la email_gs=minh, khac han quan he tram_cha) -> canLam > dangTon. Chi tinh
    // cho_tram_duyet khi la Tram THAT.
    // SUA (phat hien qua ra soat QA "số hiển thị phải là số thực họ cần xử lý") - fix tren dua vao
    // user.la_tram, NHUNG loadUser.ts (middleware chay cho MOI request, xem middleware/loadUser.ts)
    // LUON gan cung "la_tram: false" (gia tri THAT chi duoc GET /api/auth/me tinh rieng qua 1 query
    // EXISTS, khong lan sang cac route khac vi ly do hieu nang - khong muon them 1 query cho MOI
    // request). Ket qua: dieu kien tren LUON false, "Chờ Trạm duyệt" LUON hien 0 cho MOI Tram that tu
    // luc fix 2026-09-01 duoc viet toi gio. Tinh THAT o day (dung 1 query EXISTS re, CHI o nhanh
    // isKtvLike, khong anh huong cac request khac) - mirror dung cach GET /api/auth/me lam.
    const laTramRow = await c.env.DB.prepare("SELECT 1 as x FROM users WHERE tram_cha = ? LIMIT 1").bind(user.email).first();
    const choTramDuyet = laTramRow ? (row?.cho_tram_duyet ?? 0) : 0;
    canLam += (row?.cho_tien ?? 0) + (row?.xac_nhan_nhan ?? 0) + choTramDuyet + (row?.tu_choi ?? 0);
    // dangTon PHAI la TAP CHA cua canLam (phan hoi 2026-09-01: "sao cần làm lại > đang tồn được?") -
    // cong THANG toan bo cac thanh phan canLam vao day (dam bao dungTon >= canLam bang phep cong, khong
    // dua vao gia dinh 2 scope trung khop) roi cong them "dang_xu_ly"/"cho_hang" (rong hon, don khac).
    dangTon += (row?.cho_tien ?? 0) + (row?.xac_nhan_nhan ?? 0) + choTramDuyet + (row?.tu_choi ?? 0) + (row?.dang_xu_ly ?? 0) + (row?.cho_hang ?? 0);
    // Breakdown (phan hoi 2026-09-01, xem giai thich o dinh nghia DangTonStep) - nguoiNhanHang: "" vi
    // GET /don-hang da TU SCOPE ve dung don cua nguoi xem cho vai tro KTV/Ve tinh/Tram (khong phai
    // "quan ly"), khong can truyen them dieu kien nao khac.
    dangTonSteps.push(
      // loaiDon: "" (them sau bao cao "bấm vào jump sang PXK nhưng hiện phiếu đã xác nhận") - PXK
      // "Chờ tiền"/"Đang gửi KTV" co the thuoc CA mua/cong_no/tra_hang, khong ep "mua" (mac dinh cua
      // PhieuXuatKhoTab.tsx khi khong truyen loaiDon) khien PXK thuoc loai khac (vd cong_no) bi LOC
      // MAT khoi danh sach - nguoi dung thay "trong"/hoac phai tu xoa bo loc trang thai de tim thay,
      // lo ra CA cac PXK loai khac da dong (vd "mua" da xac nhan) truoc do.
      { key: "s_cho_tien", label: "Chờ tiền", count: row?.cho_tien ?? 0, roleKeys: ["ktv"], tab: "phieu-xuat-kho", filter: "CHO_TIEN", loaiDon: "", nguoiNhanHang: user.email, isCanLam: true },
      { key: "s_xac_nhan_nhan", label: "Chờ xác nhận đã nhận hàng", count: row?.xac_nhan_nhan ?? 0, roleKeys: ["ktv"], tab: "phieu-xuat-kho", filter: "Dang gui KTV", loaiDon: "", nguoiNhanHang: user.email, isCanLam: true },
      { key: "s_cho_tram_duyet", label: "Chờ Trạm duyệt", count: choTramDuyet, roleKeys: ["tram"], tab: "don-cua-toi", filter: "Cho Tram duyet", loaiDon: "all", isCanLam: true },
      // loaiDon: "all" o ca 3 dong duoi (them sau bao cao "Đơn đang xử lý (2) => click vào chỉ hiện 1
      // đơn" - cung loi voi "Chờ tiền"/"Đang gửi KTV" o tren, khac tab don-cua-toi thay vi phieu-xuat-
      // kho): "dang_xu_ly"/"cho_hang" tren deu gom CA mua/cong_no (chi loai tru tra_hang, xem SQL
      // "ddh.loai_don != 'tra_hang'" o dau file), "tu_choi" (thong_bao_ktv) cung khong phan biet loai
      // don - thieu loaiDon khien DonCuaToiTab.tsx mac dinh sub-tab "mua" (xemLoaiDon luu localStorage,
      // xem DatMuaLinhKienModule.tsx) khi nhay toi, loc mat don thuoc loai khac (vd cong_no) khoi danh
      // sach hien ra du count o the van dung.
      { key: "s_tu_choi", label: "Đơn bị từ chối chưa xem", count: row?.tu_choi ?? 0, roleKeys: ["ktv"], tab: "don-cua-toi", filter: "__TU_CHOI_CHUA_XEM__", loaiDon: "all", isCanLam: true },
      { key: "s_dang_xu_ly", label: "Đơn đang xử lý (Trạm/TBP/TN)", count: row?.dang_xu_ly ?? 0, roleKeys: ["ktv"], tab: "don-cua-toi", filter: "__OPEN__", loaiDon: "all" },
      { key: "s_cho_hang_ktv", label: "Chờ hàng", count: row?.cho_hang ?? 0, roleKeys: ["ktv"], tab: "don-cua-toi", filter: "Cho hang", loaiDon: "all" },
    );
  }

  if (isStaff) {
    const khuVucSet = await khuVucCuaToiSet(c.env.DB, user);
    const gsSet = (canTacNghiep(c) || user.la_kho || user.la_ke_toan) ? await phuTrachGsSet(c.env.DB, user.email) : null;

    const muaCongNoStates: string[] = [];
    if (canTPDvbhXacNhan(c)) muaCongNoStates.push("Cho TBP xac nhan");
    if (canTacNghiep(c)) muaCongNoStates.push("Cho TN duyet");
    const traHangStates: string[] = [];
    if (user.la_ke_toan || user.vai_tro === "Admin") traHangStates.push("Cho ke toan duyet mem");
    if (canKho(c)) traHangStates.push("Cho kho xac nhan");
    if (user.vai_tro === "QC" || user.vai_tro === "Admin") traHangStates.push("Cho QC xac nhan");
    if (canTacNghiep(c)) traHangStates.push("Cho TN duyet tong");
    const pxkSimpleStates: string[] = [];
    if (user.la_ke_toan || user.vai_tro === "Admin") pxkSimpleStates.push("Cho ke toan");
    if (canKho(c)) pxkSimpleStates.push("Da chot xong don xuat", "Dang gui KTV");
    // "Dang tao phieu" (TN) - loai tru dieu kien "cho tien" de 1 PXK CHI thuoc 1 trong 2 nhom (giong
    // het GET /phieu-xuat-kho): TN co ca 2 muc "Tao PXK" (tao_pxk) va "Cho tien" (cho_tien) rieng.
    const pxkOtherConds: string[] = [];
    if (canTacNghiep(c)) {
      pxkOtherConds.push("(pxk.trang_thai_hien_tai = 'Dang tao phieu' AND NOT (pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet'))");
      // FIX (phan hoi 2026-09-23 "vẫn đếm cả đơn đã hủy") - them dieu kien trang_thai_hien_tai o day
      // (truoc day thieu, khac nhanh tren) - xem giai thich day du o GET /luong-quy-trinh phia tren.
      pxkOtherConds.push("(pxk.trang_thai_hien_tai = 'Dang tao phieu' AND pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet')");
    }

    // FIX (phan hoi 2026-09-01: "sao cần làm lại > đang tồn được?... đang tồn phải là TAP CHA cua cần
    // làm, khong loai tru nhau") - dangTon TRUOC DAY = "mo AND NOT canLam" (sai, loai het chinh cac
    // dong dang la luot cua nguoi xem ra khoi dangTon). Da hoi lai va chot 4 diem:
    //  1) TN KHONG tinh dangTon cho don con o Tram/TBP (chua tung toi tay TN).
    //  2) TN HET tinh dangTon ngay khi PXK chuyen qua Ke toan (khong tinh tiep toi luc dong han).
    //  3) "Cho hang" (TN tu choi vi thieu LK, tu dong mo thieu_lk cho Kho tim nguon) tinh CA TN
    //     (van "can thay" - dung y da chot san o GET /ton-dong-theo-ktv) LAN Kho (dang xu ly that).
    //  4) Ke toan/Kho CHI tinh dangTon dung luc dang o buoc cua chinh ho (khong tinh truoc/sau) - vi
    //     vay dangTon(Ke toan/Kho) == canLam(Ke toan/Kho) cho moi bucket ho THAM GIA 1 buoc duy nhat.
    // Rieng TN o TRA HANG (4 buoc Ke toan->Kho->QC->TN, TU chinh vi du goc cua nguoi dung) la NGOAI LE:
    // TN la buoc CUOI CUNG truoc khi dong nen dangTon(TN) BAO GOM CA 3 buoc truoc (KT/Kho/QC dang xu
    // ly) - vi TN CHAC CHAN se toi luot sau, khac voi Mua/Cong no (Tram/TBP co the tu choi/huy truoc
    // khi toi TN). KT/Kho/QC trong tra hang van ap dung nguyen tac 4 (chi dung buoc cua ho).
    const muaCongNoDangTonConds: string[] = [];
    if (canTPDvbhXacNhan(c)) muaCongNoDangTonConds.push("ddh.trang_thai_hien_tai = 'Cho TBP xac nhan'");
    if (canTacNghiep(c)) {
      muaCongNoDangTonConds.push("ddh.trang_thai_hien_tai = 'Cho TN duyet'");
      // "TN da duyet" nhung CHUA gom vao PXK nao (ma_xuat_kho IS NULL) - van la viec TN can lam (tao
      // PXK), chi la chua duoc tinh o canLam (xem GET /don-hang-kha-dung, phieuXuatKho.ts) - van thuoc
      // "cua so" cua TN (diem 2: chua chuyen qua Ke toan vi PXK chua ton tai).
      muaCongNoDangTonConds.push("(ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.ma_xuat_kho IS NULL)");
    }
    if (canTacNghiep(c) || canKho(c)) muaCongNoDangTonConds.push("ddh.trang_thai_hien_tai = 'Cho hang'"); // diem 3
    const traHangDangTonConds: string[] = [];
    if (user.la_ke_toan || user.vai_tro === "Admin") traHangDangTonConds.push("ddh.trang_thai_hien_tai = 'Cho ke toan duyet mem'");
    if (canKho(c)) traHangDangTonConds.push(`(ddh.trang_thai_hien_tai = 'Cho kho xac nhan' AND NOT ${traHangTuHuySql("ddh")})`);
    if (user.vai_tro === "QC" || user.vai_tro === "Admin") traHangDangTonConds.push("ddh.trang_thai_hien_tai = 'Cho QC xac nhan'");
    if (canTacNghiep(c)) traHangDangTonConds.push(`ddh.trang_thai_hien_tai IN (${TRA_HANG_MO_STATES.map((s) => `'${s}'`).join(",")})`);

    // FIX (2026-09-01, phan hoi "sao bây giờ đang tồn lại trông rỗng rồi") - ban truoc goi
    // ddhScope()/pxkScope()/thieuLkScope() rieng biet o MOI cot (22 cot tong hop + granular), MOI lan
    // goi PUSH LAI dung 1 bo binds khuVucSet/gsSet (kieu "builder an toan" cu). Voi 1 TN/Kho/Ke toan
    // duoc gan NHIEU Khu vuc (vd 3 Khu vuc), tong so bind cua 1 cau query nay vuot 100 (D1 gioi han
    // "too many SQL variables") -> ca query LOI 500, FE fallback dangTon=0/dangTonSteps=[] hien "Không
    // có đơn nào đang tồn" DU DU LIEU THAT KHONG RONG (da xac minh true bang wrangler d1 execute
    // --remote tren du lieu that cua 1 TN co gan 3 Khu vuc: dangTon dung ra phai la 6, khong phai 0).
    // Sua bang 2 CTE (kv_email/gs_list) dinh nghia DUNG 1 LAN o dau cau lenh - cac ham scope() gio CHI
    // THAM CHIEU ten CTE (khong con push them bind nao), giam tong bind cua ca query tu ~113 xuong con
    // vai chuc, khong con phu thuoc so luong cot granular.
    const cteParts: string[] = [];
    const cteBinds: unknown[] = [];
    if (khuVucSet) {
      const list = [...khuVucSet];
      cteParts.push(
        // SUA 2026-11-04 (v1.438): D1 chi cho TOI DA 5 ve UNION trong 1 SELECT ("too many terms in compound SELECT") -
        // truoc day kv_ma/gs_list dung "SELECT ? UNION ALL SELECT ?..." -> tai khoan gan >= 6 khu vuc loi Trang chu. Gio 1 bind JSON.
        `kv_email(email) AS (SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL AND khu_vuc_ma IN (SELECT value FROM json_each(?)))`,
        // Ma khu vuc de so voi cot khu_vuc_ma luu san tren don/PXK (migration 0042).
        `kv_ma(ma) AS (SELECT value FROM json_each(?))`,
      );
      cteBinds.push(JSON.stringify(list), JSON.stringify(list));
    }
    if (gsSet) {
      const list = [...gsSet];
      cteParts.push(`gs_list(email) AS (SELECT value FROM json_each(?))`);
      cteBinds.push(JSON.stringify(list));
    }
    const withClause = cteParts.length > 0 ? `WITH ${cteParts.join(", ")} ` : "";

    const binds: unknown[] = [];
    const inCond = (col: string, values: string[]): string => {
      if (values.length === 0) return "1=0";
      binds.push(...values);
      return `${col} IN (${values.map(() => "?").join(",")})`;
    };
    const orCond = (conds: string[]): string => (conds.length > 0 ? `(${conds.join(" OR ")})` : "1=0");
    const ddhScope = (): string => {
      let s = "";
      // khu_vuc_chon (Kho chon lai, migration 0071) thang - cung quy tac khuVucSetWhereSql().
      if (khuVucSet) s += ` AND ((ddh.khu_vuc_chon IS NULL AND (ddh.nguoi_tao IN (SELECT email FROM kv_email) OR ddh.nguoi_nhan_hang IN (SELECT email FROM kv_email) OR ddh.khu_vuc_ma IN (SELECT ma FROM kv_ma))) OR ddh.khu_vuc_chon IN (SELECT ma FROM kv_ma))`;
      if (gsSet) s += ` AND ddh.email_gs IN (SELECT email FROM gs_list)`;
      return s;
    };
    const pxkScope = (): string => {
      let s = "";
      // Phieu da chuyen kho xuat (mien_xuat): khop CA khu vuc cu lan mien moi, Kho thuan chi mien moi - cung quy tac khuVucPxkWhereSql().
      if (khuVucSet) s += ` AND ((${laKhoThuan(user) ? "pxk.mien_xuat IS NULL" : "1 = 1"} AND ((pxk.khu_vuc_chon IS NULL AND (pxk.nguoi_nhan_hang IN (SELECT email FROM kv_email) OR pxk.khu_vuc_ma IN (SELECT ma FROM kv_ma))) OR pxk.khu_vuc_chon IN (SELECT ma FROM kv_ma))) OR ${pxkKhopMienXuatSql("pxk", "kv_ma")})`;
      if (gsSet) {
        s += ` AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id AND ddh2.email_gs IN (SELECT email FROM gs_list))`;
      }
      return s;
    };
    const thieuLkScope = (): string => {
      let inner = "";
      if (khuVucSet) inner += ` AND ((ddh3.khu_vuc_chon IS NULL AND (ddh3.nguoi_tao IN (SELECT email FROM kv_email) OR ddh3.nguoi_nhan_hang IN (SELECT email FROM kv_email) OR ddh3.khu_vuc_ma IN (SELECT ma FROM kv_ma))) OR ddh3.khu_vuc_chon IN (SELECT ma FROM kv_ma))`;
      if (gsSet) inner += ` AND ddh3.email_gs IN (SELECT email FROM gs_list)`;
      const nhomKho = khoNhomLkLoc(user); // Kho chi xu ly 1 nhom LK (Karofi / B2B, 2026-10-16)
      if (nhomKho) inner += locNhomLkSql("ddh3", nhomKho);
      return inner ? ` AND EXISTS (SELECT 1 FROM dat_don_hang ddh3 WHERE ddh3.id = tlk.dat_don_hang_id${inner})` : "";
    };
    const thieuLkTrangThaiExpr = "(SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = tlk.id ORDER BY id DESC LIMIT 1)";

    // Cot rieng cho TUNG trang thai (phan hoi 2026-09-01: "ấn vào đơn đang tồn 6... làm sao tôi biết 6
    // đơn này hiện ở đâu để click vào xem") - dung CHUNG 1 round-trip voi cac cot tong hop o tren, tra
    // KHONG DIEU KIEN theo vai tro (giong dung tinh than GET /luong-quy-trinh tra ca 16 buoc cho MOI
    // nguoi roi FE tu loc theo roleKeys) de dung lam nguon cho dangTonSteps duoi day.
    const row = await c.env.DB.prepare(
      `${withClause}SELECT
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ${inCond("ddh.trang_thai_hien_tai", muaCongNoStates)}${ddhScope()}) as mua_cong_no_can_lam,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ${orCond(muaCongNoDangTonConds)}${ddhScope()}) as mua_cong_no_dang_ton,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ${inCond("ddh.trang_thai_hien_tai", traHangStates)}${ddhScope()}) as tra_hang_can_lam,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ${orCond(traHangDangTonConds)}${ddhScope()}) as tra_hang_dang_ton,
         (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE ${orCond([inCond("pxk.trang_thai_hien_tai", pxkSimpleStates), ...pxkOtherConds])}${pxkScope()}) as pxk_can_lam,
         (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE ${orCond([inCond("pxk.trang_thai_hien_tai", pxkSimpleStates), ...pxkOtherConds])}${pxkScope()}) as pxk_dang_ton,
         (SELECT COUNT(*) FROM thieu_lk tlk WHERE ${canKho(c) ? `${thieuLkTrangThaiExpr} = 'Cho kho xu ly'` : "1=0"}${thieuLkScope()}) as thieu_lk_can_lam,
         (SELECT COUNT(*) FROM thieu_lk tlk WHERE ${canKho(c) ? `${thieuLkTrangThaiExpr} = 'Cho kho xu ly'` : "1=0"}${thieuLkScope()}) as thieu_lk_dang_ton,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho TBP xac nhan'${ddhScope()}) as g_tbp,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho TN duyet'${ddhScope()}) as g_tn_cho_duyet,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.ma_xuat_kho IS NULL${ddhScope()}) as g_tn_da_duyet_chua_pxk,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho hang'${ddhScope()}) as g_cho_hang,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho ke toan duyet mem'${ddhScope()}) as g_tra_hang_kt,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho kho xac nhan' AND NOT ${traHangTuHuySql("ddh")}${ddhScope()}) as g_tra_hang_kho,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho QC xac nhan'${ddhScope()}) as g_tra_hang_qc,
         (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho TN duyet tong'${ddhScope()}) as g_tra_hang_tn,
         (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.trang_thai_hien_tai = 'Dang tao phieu' AND NOT (pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet')${pxkScope()}) as g_pxk_tao_pxk,
         -- FIX (phan hoi 2026-09-23 "vẫn đếm cả đơn đã hủy") - them dieu kien trang_thai_hien_tai, xem
         -- giai thich day du o GET /luong-quy-trinh phia tren (cung 1 fix, cung ngay).
         (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.trang_thai_hien_tai = 'Dang tao phieu' AND pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet'${pxkScope()}) as g_pxk_cho_tien,
         (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.trang_thai_hien_tai = 'Cho ke toan'${pxkScope()}) as g_pxk_ke_toan,
         (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.trang_thai_hien_tai = 'Da chot xong don xuat'${pxkScope()}) as g_pxk_kho,
         (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.trang_thai_hien_tai = 'Dang gui KTV'${pxkScope()}) as g_pxk_ktv,
         (SELECT COUNT(*) FROM thieu_lk tlk WHERE ${thieuLkTrangThaiExpr} = 'Cho kho xu ly'${thieuLkScope()}) as g_thieu_lk`,
    )
      .bind(...cteBinds, ...binds)
      .first<Record<string, number>>();
    canLam += (row?.mua_cong_no_can_lam ?? 0) + (row?.tra_hang_can_lam ?? 0) + (row?.pxk_can_lam ?? 0) + (row?.thieu_lk_can_lam ?? 0);
    dangTon += (row?.mua_cong_no_dang_ton ?? 0) + (row?.tra_hang_dang_ton ?? 0) + (row?.pxk_dang_ton ?? 0) + (row?.thieu_lk_dang_ton ?? 0);

    const g = (key: string) => row?.[key] ?? 0;
    dangTonSteps.push(
      { key: "s_tbp", label: "TBP duyệt LK đặc thù", count: g("g_tbp"), roleKeys: ["tp_dvbh"], tab: "don-cua-toi", filter: "Cho TBP xac nhan", loaiDon: "all", isCanLam: true },
      { key: "s_tn_cho_duyet", label: "Chờ TN duyệt", count: g("g_tn_cho_duyet"), roleKeys: ["tac_nghiep"], tab: "don-cua-toi", filter: "Cho TN duyet", loaiDon: "all", isCanLam: true },
      { key: "s_tn_da_duyet_chua_pxk", label: "Đã duyệt, chưa vào phiếu", count: g("g_tn_da_duyet_chua_pxk"), roleKeys: ["tac_nghiep"], tab: "don-cua-toi", filter: "TN da duyet", loaiDon: "all" },
      // "Cho hang" tinh CA TN lan Kho (phan hoi 2026-09-01 truoc do, xem comment "diem 3" o tren).
      { key: "s_cho_hang", label: "Chờ hàng", count: g("g_cho_hang"), roleKeys: ["tac_nghiep", "kho"], tab: "don-cua-toi", filter: "Cho hang", loaiDon: "all" },
      // 4 dong tra hang: THEM "tac_nghiep" vao roleKeys cua CA 3 dong KT/Kho/QC (khong chi dong TN cua
      // chinh no) - vi dangTon(TN) o tra hang BAO GOM CA 4 buoc (xem comment "diem ngoai le" o tren),
      // tai su dung DUNG 4 dong nay thay vi tao 1 dong gop rieng can sentinel filter moi.
      { key: "s_tra_hang_kt", label: "Trả hàng · KT", count: g("g_tra_hang_kt"), roleKeys: ["ke_toan", "tac_nghiep"], tab: "tra-hang", filter: "Cho ke toan duyet mem", isCanLam: true },
      { key: "s_tra_hang_kho", label: "Trả hàng · Kho", count: g("g_tra_hang_kho"), roleKeys: ["kho", "tac_nghiep"], tab: "tra-hang", filter: "Cho kho xac nhan", isCanLam: true },
      { key: "s_tra_hang_qc", label: "Trả hàng · QC", count: g("g_tra_hang_qc"), roleKeys: ["qc", "tac_nghiep"], tab: "tra-hang", filter: "Cho QC xac nhan", isCanLam: true },
      { key: "s_tra_hang_tn", label: "Trả hàng · TN", count: g("g_tra_hang_tn"), roleKeys: ["tac_nghiep"], tab: "tra-hang", filter: "Cho TN duyet tong", isCanLam: true },
      // loaiDon: "" o ca 5 dong PXK duoi (cung ly do voi s_cho_tien/s_xac_nhan_nhan o nhanh isKtvLike
      // phia tren) - PXK thuoc CA 3 loai, khong ep "mua" (mac dinh khi PhieuXuatKhoTab.tsx khong nhan
      // loaiDon).
      { key: "s_pxk_tao_pxk", label: "Phiếu chờ gửi kế toán", count: g("g_pxk_tao_pxk"), roleKeys: ["tac_nghiep"], tab: "phieu-xuat-kho", filter: "Dang tao phieu", loaiDon: "", isCanLam: true },
      { key: "s_pxk_cho_tien", label: "Chờ KTV chuyển tiền", count: g("g_pxk_cho_tien"), roleKeys: ["tac_nghiep"], tab: "phieu-xuat-kho", filter: "CHO_TIEN", loaiDon: "", isCanLam: true },
      { key: "s_pxk_ke_toan", label: "Chờ mã MISA", count: g("g_pxk_ke_toan"), roleKeys: ["ke_toan"], tab: "phieu-xuat-kho", filter: "Cho ke toan", loaiDon: "", isCanLam: true },
      { key: "s_pxk_kho", label: "Kho chốt đơn xuất", count: g("g_pxk_kho"), roleKeys: ["kho"], tab: "phieu-xuat-kho", filter: "Da chot xong don xuat", loaiDon: "", isCanLam: true },
      { key: "s_pxk_ktv", label: "Chờ KTV xác nhận nhận", count: g("g_pxk_ktv"), roleKeys: ["kho"], tab: "phieu-xuat-kho", filter: "Dang gui KTV", loaiDon: "", isCanLam: true },
      { key: "s_thieu_lk", label: "Thiếu hàng chờ Kho", count: g("g_thieu_lk"), roleKeys: ["kho"], tab: "thieu-lk", filter: "Cho kho xu ly", isCanLam: true },
    );

    // v1.450: "Tồn đọng toàn hệ thống" tach sang GET /home-summary/toan-he-thong - chi tai khi nguoi dung bam mo (truoc day ~47.000 dong
    // doc moi lan, tu chay lai 5 phut/lan cho moi TN/Kho/Ke toan du khong ai mo). Day chi bao co quyen xem.
    coToanHeThong = true;
  }

  return c.json({ canLam, dangTon, tonDongToanHeThong, dangTonSteps, tonDongToanHeThongSteps, coToanHeThong });
});

// GET /home-summary/toan-he-thong (v1.450) - "Tồn đọng toàn hệ thống" (toan quoc, khong loc khu vuc) cho TN/Kho/Ke toan/TBP/QC/Admin,
// CHI goi khi bam mo the tren Trang chu. 3 truy van GROUP BY (don / phieu / ticket) thay cho ~20 COUNT con; them cac buoc cua quy
// trinh tu dong duyet (Cho thanh toan, Cho GS duyet, Ke toan xac nhan tien, Cho mua hang) - bo buoc = 0.
datMuaLinhKien.get("/home-summary/toan-he-thong", async (c) => {
  const user = c.get("user");
  const isStaff = canTacNghiep(c) || canKho(c) || user.la_ke_toan || canTPDvbhXacNhan(c) || user.vai_tro === "QC" || user.vai_tro === "Admin";
  if (!isStaff) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const [ddh, pxk, tlk] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT CASE WHEN loai_don = 'tra_hang' THEN 'tra_hang' ELSE 'mua' END AS nhom, trang_thai_hien_tai AS tt,
         CASE WHEN trang_thai_hien_tai = 'TN da duyet' AND ma_xuat_kho IS NULL THEN 1 ELSE 0 END AS chua_pxk, COUNT(*) AS n
       FROM dat_don_hang WHERE trang_thai_hien_tai NOT IN ('TN tu choi', 'Tu choi', 'Da huy')
         AND NOT (trang_thai_hien_tai = 'TN da duyet' AND ma_xuat_kho IS NOT NULL)
         AND NOT ${traHangTuHuySql("dat_don_hang")}
       GROUP BY 1, 2, 3`,
    ),
    c.env.DB.prepare(
      `SELECT trang_thai_hien_tai AS tt, CASE WHEN so_tien_can_chuyen IS NOT NULL AND trang_thai_chuyen_tien != 'TN da duyet' THEN trang_thai_chuyen_tien ELSE '' END AS tien, COUNT(*) AS n
       FROM phieu_xuat_kho WHERE trang_thai_hien_tai NOT IN (${PXK_TRANG_THAI_DONG_ALL.map(() => "?").join(",")}) GROUP BY 1, 2`,
    ).bind(...PXK_TRANG_THAI_DONG_ALL),
    c.env.DB.prepare(
      `SELECT (SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = tlk.id ORDER BY id DESC LIMIT 1) AS tt, COUNT(*) AS n
       FROM thieu_lk tlk GROUP BY 1`,
    ),
  ]);
  type R = { nhom?: string; tt: string; chua_pxk?: number; tien?: string; n: number };
  const rd = (ddh.results ?? []) as R[];
  const rp = (pxk.results ?? []) as R[];
  const rt = ((tlk.results ?? []) as R[]).filter((r) => !(THIEU_LK_TRANG_THAI_DONG as readonly string[]).includes(r.tt));
  const don = (nhom: string, tt: string) => rd.filter((r) => r.nhom === nhom && r.tt === tt && !r.chua_pxk).reduce((x, r) => x + r.n, 0);
  const phieu = (f: (r: R) => boolean) => rp.filter(f).reduce((x, r) => x + r.n, 0);
  const ticket = (tts: string[]) => rt.filter((r) => tts.includes(r.tt)).reduce((x, r) => x + r.n, 0);
  const steps: DangTonStep[] = [
    { key: "t_gs", label: "GS duyệt vượt trần", count: don("mua", "Cho GS duyet"), roleKeys: [], tab: "don-cua-toi", filter: "Cho GS duyet", loaiDon: "all" },
    { key: "t_tram", label: "Trạm duyệt", count: don("mua", "Cho Tram duyet"), roleKeys: [], tab: "don-cua-toi", filter: "Cho Tram duyet", loaiDon: "all" },
    { key: "t_tbp", label: "TBP duyệt LK đặc thù", count: don("mua", "Cho TBP xac nhan"), roleKeys: [], tab: "don-cua-toi", filter: "Cho TBP xac nhan", loaiDon: "all" },
    { key: "t_tn_cho_duyet", label: "Chờ TN duyệt", count: don("mua", "Cho TN duyet"), roleKeys: [], tab: "don-cua-toi", filter: "Cho TN duyet", loaiDon: "all" },
    { key: "t_cho_tt", label: "Chờ thanh toán", count: don("mua", "Cho thanh toan"), roleKeys: [], tab: "don-cua-toi", filter: "Cho thanh toan", loaiDon: "all" },
    { key: "t_cho_hang", label: "Chờ hàng", count: don("mua", "Cho hang"), roleKeys: [], tab: "don-cua-toi", filter: "Cho hang", loaiDon: "all" },
    { key: "t_chua_pxk", label: "Đã duyệt, chưa vào phiếu", count: rd.filter((r) => r.chua_pxk).reduce((x, r) => x + r.n, 0), roleKeys: [], tab: "don-cua-toi", filter: "__CHO_TAO_PXK__", loaiDon: "all" },
    { key: "t_tra_hang_kt", label: "Trả hàng · KT", count: don("tra_hang", "Cho ke toan duyet mem"), roleKeys: [], tab: "tra-hang", filter: "Cho ke toan duyet mem" },
    { key: "t_tra_hang_kho", label: "Trả hàng · Kho", count: don("tra_hang", "Cho kho xac nhan"), roleKeys: [], tab: "tra-hang", filter: "Cho kho xac nhan" },
    { key: "t_tra_hang_qc", label: "Trả hàng · QC", count: don("tra_hang", "Cho QC xac nhan"), roleKeys: [], tab: "tra-hang", filter: "Cho QC xac nhan" },
    { key: "t_tra_hang_tn", label: "Trả hàng · TN", count: don("tra_hang", "Cho TN duyet tong"), roleKeys: [], tab: "tra-hang", filter: "Cho TN duyet tong" },
    { key: "t_pxk_cho_tien", label: "Chờ KTV chuyển tiền", count: phieu((r) => r.tt === "Dang tao phieu" && r.tien === "Cho KTV chuyen"), roleKeys: [], tab: "phieu-xuat-kho", filter: "CHO_TIEN", loaiDon: "" },
    { key: "t_pxk_kt_tien", label: "Chờ KT xác nhận tiền", count: phieu((r) => r.tien === "KTV da chuyen"), roleKeys: [], tab: "phieu-xuat-kho", filter: "CHO_KT_TIEN", loaiDon: "" },
    { key: "t_pxk_tao_pxk", label: "Phiếu chờ gửi kế toán", count: phieu((r) => r.tt === "Dang tao phieu" && r.tien === ""), roleKeys: [], tab: "phieu-xuat-kho", filter: "Dang tao phieu", loaiDon: "" },
    { key: "t_pxk_ke_toan", label: "Chờ mã MISA", count: phieu((r) => r.tt === "Cho ke toan"), roleKeys: [], tab: "phieu-xuat-kho", filter: "Cho ke toan", loaiDon: "" },
    { key: "t_pxk_kho", label: "Kho chốt đơn xuất", count: phieu((r) => r.tt === "Da chot xong don xuat"), roleKeys: [], tab: "phieu-xuat-kho", filter: "Da chot xong don xuat", loaiDon: "" },
    { key: "t_pxk_ktv", label: "Chờ KTV xác nhận nhận", count: phieu((r) => r.tt === "Dang gui KTV"), roleKeys: [], tab: "phieu-xuat-kho", filter: "Dang gui KTV", loaiDon: "" },
    { key: "t_thieu_lk", label: "Thiếu hàng chờ Kho", count: ticket(["Cho kho xu ly"]), roleKeys: [], tab: "thieu-lk", filter: "Cho kho xu ly" },
    { key: "t_thieu_mua", label: "Thiếu hàng chờ Mua hàng", count: ticket(["Cho mua hang"]), roleKeys: [], tab: "thieu-lk", filter: "Cho mua hang" },
  ].filter((x) => x.count > 0);
  const tong = rd.reduce((x, r) => x + r.n, 0) + rp.reduce((x, r) => x + r.n, 0) + rt.reduce((x, r) => x + r.n, 0);
  return c.json({ tong, steps });
});

// GET /api/dat-mua-lk/bao-cao-tong-the - 12 chi so, TRA VE DANH SACH THEO TUNG KTV (phan hoi UX muc
// 6, nang cap 2026-08-15: truoc la 1 object tong hop, gio tach theo nguoi_nhan_hang de Giam
// sat/TN/Kho/Ke toan xem duoc tung KTV rieng, KTV/Ve tinh tu xem chi co 1 dong = chinh minh). Scope
// GIU NGUYEN tu ban dau: KTV/Ve tinh chi tinh don CA NHAN (nguoi_tao=minh HOAC nguoi_nhan_hang=minh -
// CO Y khong gom don cua Ve tinh thuoc Tram minh, khac scopeDatMuaNguoiTao dung cho DANH SACH); Giam
// sat tinh MOI don cua KTV minh phu trach (pd.email_gs = minh); TN/Kho/Ke toan tai dung
// phuTrachGsSet (muc F, dot truoc) - da duoc Admin gan khu vuc thi CHI tinh theo khu vuc, chua gan
// gi thi tinh toan he thong. Vi scope KHONG DOI, chi doi tu 1 SELECT tong hop sang GROUP BY
// nguoi_nhan_hang la du, khong can logic scope moi. Loai tru MOI dong "Da huy" va loai_don='tra_hang'
// khoi TAT CA chi so. Nho chot nghiep vu "1 PXK = 1 KTV" (migration 0074), nhom "Xuat kho" (gom ca
// "Tong cho chuyen" - truoc day KHONG gan duoc theo KTV vi 1 PXK co the gop nhieu KTV, gio gan duoc
// thang qua cot pxk.nguoi_nhan_hang) gio doc TRUC TIEP tren phieu_xuat_kho, khong can join qua
// phieu_xuat_kho_dong nua. Khong cache - chi chay khi mo module, khong phai moi keystroke; so dong
// luon nho (so KTV trong pham vi) nen khong can phan trang server-side.
interface BaoCaoRow {
  email: string;
  ten: string | null;
  slDon: number;
  slDonMua: number;
  slDonCongNo: number;
  slDonTraHang: number;
  slDeXuat: number;
  slTuChoi: number;
  slDangCho: number;
  slDuyet: number;
  slDuyetMua: number;
  slDuyetCongNo: number;
  slDuyetTraHang: number;
  slThucDuyet: number;
  tongTienThucTe: number;
  tongTienDatMua: number;
  tienChoDuyet: number;
  tongChoChuyen: number;
  tongPxk: number;
  slChoKeToan: number;
  slChoKhoGui: number;
  slDaGui: number;
  slDaXacNhan: number;
  slKhoKetThuc: number;
}

// Tap trang thai "dang cho duyet" dung chung cho ca 3 loai_don (them 2026-08-28, phan hoi "Đơn đang
// chờ/Tiền chờ duyệt" trong redesign man Trang chu tu card sang table) - mua/cong_no la 3 buoc dau
// (Cho Tram duyet/Cho TBP xac nhan/Cho TN duyet, KHONG gom "Cho hang" - da chot voi nguoi dung la buoc
// do la "da duyet xong, dang thieu hang" chu khong phai "dang cho duyet"), tra_hang la 4 buoc dau cua
// THU_TU_BUOC trong traHang.ts (Cho ke toan duyet mem/Cho kho xac nhan/Cho QC xac nhan/Cho TN duyet
// tong) - mo rong TRUC TIEP tu dinh nghia da chot cho mua/cong_no sang tra_hang (cung 1 khai niem "cac
// buoc duyet truoc khi dong dat_don_hang cham toi trang thai dong"), khong phai 1 quyet dinh nghiep vu
// moi rieng biet.
// v1.450: + "Cho GS duyet" / "Cho thanh toan" - 2 buoc cho THAT cua quy trinh tu dong duyet (truoc day "Đơn đang chờ" bo sot).
const DANG_CHO_DUYET_STATES = [
  "Cho Tram duyet", "Cho TBP xac nhan", "Cho TN duyet", "Cho GS duyet", "Cho thanh toan",
  "Cho ke toan duyet mem", "Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong",
] as const;
const DANG_CHO_DUYET_SQL_IN = DANG_CHO_DUYET_STATES.map(() => "?").join(",");

// "Thang lech N thang so voi thang hien tai (VN local)" - dung nowVN() (gio VN da luu san tren MOI
// cot timestamp he thong, xem lib/vnTime.ts) lam moc, KHONG dung SQLite 'now' (UTC, se lech mui gio
// so voi du lieu). Tra "YYYY-MM" de so sanh truc tiep voi strftime('%Y-%m', ...).
function thangYYYYMM(offset: number): string {
  const [y, m] = nowVN().slice(0, 7).split("-").map(Number);
  const total = y * 12 + (m - 1) - offset;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// Scope dung CHUNG cho GET /bao-cao-tong-the va GET /bao-cao-xu-huong (tach ra 2026-09-26 khi them bieu
// do xu huong - logic GIU NGUYEN 100% nhu truoc, chi doi cho dat) - 2 bao cao phai thay CUNG 1 pham vi
// du lieu cho cung 1 nguoi xem, neu khong so tren bieu do se lech voi bang ngay ben duoi.
async function baoCaoScope(c: Context<{ Bindings: Env }>, wantFull: boolean): Promise<{ scopeCond: ((alias: string) => string) | null; scopeBinds: string[] }> {
  const user = c.get("user");
  // CHOT 2026-08-15: bo khai niem phieu_dat (migration 0075) - scope gio la 1 HAM sinh dieu kien
  // theo alias truyen vao (thay vi 1 chuoi co dinh) vi ham nay dung LAI CHINH dieu kien do o 2 noi
  // voi 2 alias khac nhau (ddh cho query don hang, ddh2 cho subquery EXISTS cua query PXK ben duoi).
  let scopeCond: ((alias: string) => string) | null = null;
  let scopeBinds: string[] = [];
  if (user.vai_tro === "Giam sat") {
    if (!wantFull) {
      // email_gs = GS phu trach khu vuc HIEN TAI cua KTV nhan hang (dong bo o lib/khuVucSync.ts) + don CHINH GS
      // dat ho (chot 2026-09-28 "Có tính", khop scopeDatMuaNguoiTao).
      scopeCond = (alias) => ` AND (${alias}.email_gs = ? OR ${alias}.nguoi_tao = ? OR ${gsKhuVucXemThemSql(`${alias}.khu_vuc_ma`)})`;
      scopeBinds = [user.email, user.email, user.email];
    }
  } else if (canTacNghiep(c) || user.la_kho || user.la_ke_toan) {
    if (!wantFull) {
      const gsSet = await phuTrachGsSet(c.env.DB, user.email);
      if (gsSet) {
        scopeCond = (alias) => ` AND ${alias}.email_gs IN (${[...gsSet].map(() => "?").join(",")})`;
        scopeBinds = [...gsSet];
      } else {
        // Da gan Khu vuc -> phuTrachGsSet bo qua lop GS cu (2026-09-29 "Khu vực là chuẩn") - bao cao theo Khu vuc.
        const khuVucSet = await khuVucCuaToiSet(c.env.DB, user);
        if (khuVucSet) {
          scopeCond = (alias) => khuVucSetWhereSql(khuVucSet, [`${alias}.nguoi_tao`, `${alias}.nguoi_nhan_hang`]).sql;
          scopeBinds = khuVucSetWhereSql(khuVucSet, ["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]).binds;
        }
      }
    }
  } else if (user.la_ktv_dvbh || user.la_ve_tinh) {
    scopeCond = (alias) => ` AND (${alias}.nguoi_tao = ? OR ${alias}.nguoi_nhan_hang = ?)`;
    scopeBinds = [user.email, user.email];
  }
  return { scopeCond, scopeBinds };
}

datMuaLinhKien.get("/bao-cao-tong-the", async (c) => {
  const user = c.get("user");
  // FIX (ma tran kiem soat he thong, Van de #1 sheet "5. Van de phat hien", xac nhan 2026-08-24): QC
  // khong khop bat ky nhanh scope nao ben duoi (Giam sat / TN|Kho|Ke toan / KTV|Ve tinh) nen scopeCond
  // giu null = KHONG GIOI HAN - QC goi thang endpoint nay (vd qua devtools) van lay duoc toan bo du
  // lieu tai chinh toan he thong, du frontend co an tab "Bao cao" hay khong. Chan tuong minh o day
  // (khong dua vao frontend an nut) - QC dung y chi can xem dung buoc minh xu ly (Tra hang o buoc "Cho
  // QC xac nhan", da co san man TraHangTab), khong can/khong duoc xem bao cao tong hop toan he thong.
  if (user.vai_tro === "QC") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  // "full=1" (them 2026-08-25, phan hoi "mặc định load theo khu vực phụ trách => thêm lựa chọn để lọc
  // full") - bo qua scope MEM (phuTrachGsSet/email_gs) khi nguoi xem la Giam sat/TN/Kho/Ke toan. KHONG
  // ap dung cho nhanh KTV/Ve tinh (co dinh, khong doc query nay - dung y "ngoại trừ KTV/Trạm/CTV/Vệ
  // tinh" da chot voi nguoi dung) - nhanh do van luon gioi han theo chinh minh du co truyen full=1.
  const wantFull = c.req.query("full") === "1";
  const { scopeCond, scopeBinds } = await baoCaoScope(c, wantFull);

  // Bo loc "Tháng N/N-1/N-2" (them 2026-08-25, phan hoi "hạn chế theo tháng... tính theo thời điểm
  // kết thúc cuối cùng của từng luồng quy trình") - "thang" query param: 0 = thang hien tai + TAT CA
  // dong dang xu ly (chua co "ket_thuc_luc"), 1/2 = thang N-1/N-2 (CHI dong da dong trong dung thang
  // do). 4 diem "ket thuc" da chot voi nguoi dung:
  //   - "đơn hủy": dat_don_hang o 'TN tu choi'/'Da huy' (chua tung ra PXK) - moc thoi gian = updated_at
  //     (duoc CAS ghi CUNG LUC voi trang_thai_hien_tai, xem applyDonHangLog).
  //   - "kế toán/kho/ktv kết thúc": PXK o 'Ke toan huy'/'Kho da ket thuc'+'Hang tru kho'/'KTV da nhan' -
  //     PXK KHONG co cot updated_at rieng nen phai lay tu phieu_xuat_kho_log (dong MOI NHAT khop dung
  //     trang_thai hien tai cua no).
  // Dong con "dang xu ly" (chua roi vao bat ky nhanh nao o tren) LUON hien o "thang 0", bat ke tao tu
  // bao gio - dung y "cả đang xử lý" nguoi dung da chot.
  const thangParam = Math.max(0, Math.min(2, Number(c.req.query("thang") ?? 0)));
  const thangWhere =
    thangParam === 0
      ? "(ket_thuc_luc IS NULL OR strftime('%Y-%m', ket_thuc_luc) = ?)"
      : "(ket_thuc_luc IS NOT NULL AND strftime('%Y-%m', ket_thuc_luc) = ?)";
  const thangBind = thangYYYYMM(thangParam);

  // TOI UU (kiem toan tai nguyen D1 quy mo 2-3 nam, 2026-08-24): truoc day dung
  // latestDonHangStatusExpr("ddh.id") (subquery tuong quan doc dat_don_hang_log ORDER BY id DESC
  // LIMIT 1) - lap lai 2 LAN MOI DONG cua toan bo dat_don_hang trong pham vi (khong gioi han thoi
  // gian). Cot ddh.trang_thai_hien_tai da la NGUON THAT tuong duong (duoc ghi CUNG LUC voi dong log
  // moi nhat qua co che CAS applyDonHangLog - moi endpoint khac nhu GET /don-hang, /luong-quy-trinh
  // deu doc thang cot nay) - doi sang doc thang cot, bo han correlated subquery, giam manh chi phi
  // dung dan luong endpoint nay gio chay THUONG XUYEN HON (nhung vao man "Trang chu" mac dinh).
  //
  // SUA (2026-08-25, cung dot voi bo loc thang): BO exclusion cung "trang_thai_hien_tai != 'Da huy'"
  // truoc day (dong "Da huy" bi AN VINH VIEN khoi MOI chi so) - gio dong huy la 1 nhanh "ket_thuc_luc"
  // that su (xem CTE ddh_kt), chi hien khi dung thang no bi huy duoc chon, khop dung yeu cau "đơn hủy"
  // la 1 trong 4 diem ket thuc can loc duoc.
  // SUA (2026-08-28, redesign man Trang chu "cards -> table"): bo han loai tru "ddh.loai_don !=
  // 'tra_hang'" - tra hang gio duoc GOM VAO cung bang nay (cot "Đơn trả"/"Duyệt trả" rieng) thay vi bi
  // an hoan toan khoi bao cao tong the nhu truoc. dat_don_hang.trang_thai_hien_tai cua tra_hang dung
  // CHUNG chuoi "TN da duyet" lam trang thai dong voi mua/cong_no (xem TRANG_THAI_DONG trong
  // traHang.ts) nen "sl_duyet"/join qua phieu_xuat_kho ben duoi tu dong dung, chi can them "Tu choi"
  // (tra hang) canh "TN tu choi" (mua/cong_no) o nhanh ket_thuc_luc dau tien.
  // Cache (them 2026-09-21, phan hoi kiem toan chi phi D1 quy mo 2-3 nam): dung thang scopeBinds da
  // resolve (email GS cu the / tap phuTrachGsSet / email chinh KTV-Ve tinh) lam phan "scope" cua cache
  // key - dung nguyen tac buildReportKey da ghi: khac pham vi xem ra khac key, khong tra nham du lieu
  // ngoai pham vi. scopeCond null (Admin, hoac wantFull) => scope null ("khong gioi han").
  const scopeKeyPart = scopeCond ? scopeBinds : null;
  const reportKey = buildReportKey("bao-cao-tong-the-v5", { /* -v5 2026-11-16 (v1.509): bo don TRU CONG NO - SUA CHUA khoi "Tổng thực tế đã mua" */ thang: String(thangParam), full: wantFull ? "1" : undefined }, scopeKeyPart);
  const rows = await cachedReport(c.env.DB, reportKey, ["dat_mua_lk"], async () => {
  const { results: donRows } = await c.env.DB.prepare(
    `WITH ddh_kt AS (
       SELECT ddh.id, ddh.nguoi_nhan_hang, ddh.loai_don, ddh.so_luong_de_xuat, ddh.gia_de_xuat, ddh.gia_chot,
         ddh.so_luong_thuc_xuat, ddh.trang_thai_hien_tai,
         -- "Tổng thực tế đã mua" (SUA 2026-10-15, phan hoi "lại = 0 1 loạt vậy, rõ ràng là họ đã mua rồi"): truoc day CHI cong don
         -- co CA gia_chot (TN chot tay) LAN so_luong_thuc_xuat -> tu khi gia tinh tu dong (tinhToanPxk) gan nhu khong don nao co
         -- gia_chot nen ra 0. Gio: don CO TIEN (nhom Mua + TRỪ CÔNG NỢ, giong DON_TINH_TONG_NGAY_SQL o pxkRecalculate.ts; bo don gui
         -- bu thieu hang - da tinh o don goc) co trong so w = gia (gia_chot neu co) x SL thuc xuat (chua co = SL de xuat). Don trong
         -- PXK con hieu luc -> chia "Tiền cần chuyển" THAT cua phieu (sau chiet khau) theo ti le w (xem ddh_tt); chua vao phieu -> w.
         -- + bo don MUA HÀNG CÔNG NỢ ĐỐI TÁC (2026-10-26, v1.408 - "gán nợ cho đối tác, KTV nhận hàng sẽ không bị tính công nợ hay tiền cần mua").
         -- + bo don TRỪ CÔNG NỢ - SỬA CHỮA (v1.509, 0đ - chung tu tru xac, khong phai tien mua).
         CASE WHEN (ddh.loai_don = 'mua' OR (ddh.loai_don = 'cong_no' AND instr(COALESCE(ddh.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') > 0
                  AND instr(COALESCE(ddh.loai_de_xuat, ''), 'TRỪ CÔNG NỢ - SỬA CHỮA') = 0))
                AND ddh.gui_bu_nhan_thieu_id IS NULL AND ddh.doi_tac_ma IS NULL
           THEN COALESCE(ddh.gia_chot, ddh.gia_de_xuat, 0) * COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat)
           ELSE 0 END as w_tien,
         CASE WHEN pxk.trang_thai_hien_tai != 'Ke toan huy' THEN pxk.id END as pxk_hl,
         CASE WHEN pxk.trang_thai_hien_tai != 'Ke toan huy' THEN pxk.so_tien_can_chuyen END as pxk_tien,
         CASE
           WHEN ddh.trang_thai_hien_tai IN ('TN tu choi', 'Tu choi', 'Da huy') THEN ddh.updated_at
           WHEN pxk.trang_thai_hien_tai IN ('Ke toan huy', 'Kho da ket thuc', 'Hang tru kho', 'KTV da nhan')
             THEN (SELECT ngay_xu_ly FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = pxk.id AND trang_thai = pxk.trang_thai_hien_tai ORDER BY id DESC LIMIT 1)
           ELSE NULL
         END as ket_thuc_luc
       FROM dat_don_hang ddh
       LEFT JOIN phieu_xuat_kho_dong pxkd ON pxkd.dat_don_hang_id = ddh.id
       LEFT JOIN phieu_xuat_kho pxk ON pxk.id = pxkd.phieu_xuat_kho_id
       WHERE 1=1${scopeCond ? scopeCond("ddh") : ""}
     ),
     ddh_tt AS (
       -- Tong trong so cua MOI dong co tien trong cung phieu (moi trang thai - "Tiền cần chuyển" cua phieu tinh tren ca phieu).
       SELECT ddh_kt.*, CASE WHEN pxk_hl IS NULL THEN NULL ELSE SUM(w_tien) OVER (PARTITION BY pxk_hl) END as pxk_w
       FROM ddh_kt
     )
     SELECT ddh.nguoi_nhan_hang as email, ${tenNguoiNullSql("ddh.nguoi_nhan_hang")} as ten,
       COUNT(*) as sl_don,
       COALESCE(SUM(CASE WHEN ddh.loai_don = 'mua' THEN 1 ELSE 0 END), 0) as sl_don_mua,
       COALESCE(SUM(CASE WHEN ddh.loai_don = 'cong_no' THEN 1 ELSE 0 END), 0) as sl_don_cong_no,
       COALESCE(SUM(CASE WHEN ddh.loai_don = 'tra_hang' THEN 1 ELSE 0 END), 0) as sl_don_tra_hang,
       COALESCE(SUM(ddh.so_luong_de_xuat), 0) as sl_de_xuat,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai IN ('TN tu choi', 'Tu choi', 'Da huy') THEN 1 ELSE 0 END), 0) as sl_tu_choi,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai IN (${DANG_CHO_DUYET_SQL_IN}) THEN 1 ELSE 0 END), 0) as sl_dang_cho,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai = 'TN da duyet' THEN 1 ELSE 0 END), 0) as sl_duyet,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.loai_don = 'mua' THEN 1 ELSE 0 END), 0) as sl_duyet_mua,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.loai_don = 'cong_no' THEN 1 ELSE 0 END), 0) as sl_duyet_cong_no,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.loai_don = 'tra_hang' THEN 1 ELSE 0 END), 0) as sl_duyet_tra_hang,
       COALESCE(SUM(CASE WHEN ddh.so_luong_thuc_xuat IS NOT NULL THEN ddh.so_luong_thuc_xuat ELSE 0 END), 0) as sl_thuc_duyet,
       ROUND(COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.w_tien > 0 THEN
         CASE WHEN ddh.pxk_tien IS NOT NULL AND ddh.pxk_w > 0 THEN ddh.pxk_tien * ddh.w_tien / ddh.pxk_w ELSE ddh.w_tien END
       ELSE 0 END), 0)) as tong_tien_thuc_te,
       -- 2026-11-10: theo gia + SL HIEN TAI (gia chot neu co, SL thuc xuat neu co) - truoc dung gia niem yet luc tao x SL de xuat ban dau nen
       -- sua tien don (gia chot / SL thuc xuat) bao cao khong doi.
       COALESCE(SUM(COALESCE(ddh.gia_chot, ddh.gia_de_xuat, 0) * COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat)), 0) as tong_tien_dat_mua,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai IN (${DANG_CHO_DUYET_SQL_IN}) THEN COALESCE(ddh.gia_chot, ddh.gia_de_xuat, 0) * COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) ELSE 0 END), 0) as tien_cho_duyet
     FROM ddh_tt ddh
     WHERE ${thangWhere}
     GROUP BY ddh.nguoi_nhan_hang`,
  )
    .bind(...scopeBinds, ...DANG_CHO_DUYET_STATES, ...DANG_CHO_DUYET_STATES, thangBind)
    .all<{
      email: string; ten: string | null; sl_don: number; sl_don_mua: number; sl_don_cong_no: number; sl_don_tra_hang: number;
      sl_de_xuat: number; sl_tu_choi: number; sl_dang_cho: number; sl_duyet: number; sl_duyet_mua: number; sl_duyet_cong_no: number; sl_duyet_tra_hang: number;
      sl_thuc_duyet: number; tong_tien_thuc_te: number; tong_tien_dat_mua: number; tien_cho_duyet: number;
    }>();

  const pxkScopeExists = scopeCond
    ? ` AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id${scopeCond("ddh2")})`
    : "";
  // 4 cot "tong_cho_chuyen/sl_cho_ke_toan/sl_cho_kho_gui/sl_da_gui" la snapshot "dang cho xu ly NGAY
  // BAY GIO" (chua toi buoc dong) - CHI co nghia cho thang HIEN TAI (thangParam===0), thang qua khu
  // khong con khai niem "dang cho" nua nen luon ve 0.
  //
  // SUA (2026-08-25, phat hien khi tu kiem thu bo loc thang moi them): "sl_da_xac_nhan" (KTV da nhan)
  // KHAC 4 cot tren - day la 1 trang thai DONG that su (nam trong TRANG_THAI_DONG cua phieuXuatKho.ts,
  // cung 1 trong "4 điểm kết thúc" da chot voi nguoi dung o CTE ddh_kt phia tren) nen PHAI bucket theo
  // thang giong het cach ddh_kt lam, KHONG the giu nguyen dang "snapshot khong doi theo thang" nhu 4
  // cot con lai - neu khong se tiep tuc cong don TOAN BO lich su "KTV da nhan" tu truoc toi gio vao
  // MOI lan xem thang hien tai, di nguoc lai chinh muc dich "hạn chế hao tốn dữ liệu theo tháng".
  // "tong_pxk" (them 2026-08-28) - dung PATTERN snapshot giong 4 cot con lai (chi co nghia thang hien
  // tai, "tổng PXK" cho thang qua khong ro nghia vi PXK khong co 1 moc "tao luc nao" duoc bucket rieng
  // - danh cho thang qua trong truong hop nay).
  const pxkSnapshotCols =
    thangParam === 0
      ? `COUNT(*) as tong_pxk,
         -- FIX (phan hoi 2026-09-23 "vẫn đếm cả đơn đã hủy") - them dieu kien trang_thai_hien_tai='Dang
         -- tao phieu' - xem giai thich day du o GET /luong-quy-trinh phia tren (cung 1 fix, cung ngay):
         -- neu khong, 1 PXK da "Ke toan huy" con treo tien se cong nham vao "Tiền chờ chuyển" cua KTV.
         COALESCE(SUM(CASE WHEN pxk.trang_thai_hien_tai = 'Dang tao phieu' AND pxk.so_tien_can_chuyen IS NOT NULL AND (pxk.trang_thai_chuyen_tien IS NULL OR pxk.trang_thai_chuyen_tien != 'TN da duyet') THEN pxk.so_tien_can_chuyen ELSE 0 END), 0) as tong_cho_chuyen,
         COALESCE(SUM(CASE WHEN pxk.trang_thai_hien_tai = 'Cho ke toan' THEN 1 ELSE 0 END), 0) as sl_cho_ke_toan,
         COALESCE(SUM(CASE WHEN pxk.trang_thai_hien_tai = 'Da chot xong don xuat' THEN 1 ELSE 0 END), 0) as sl_cho_kho_gui,
         COALESCE(SUM(CASE WHEN pxk.trang_thai_hien_tai = 'Dang gui KTV' THEN 1 ELSE 0 END), 0) as sl_da_gui,`
      : `0 as tong_pxk, 0 as tong_cho_chuyen, 0 as sl_cho_ke_toan, 0 as sl_cho_kho_gui, 0 as sl_da_gui,`;
  // "sl_kho_ket_thuc" (them 2026-08-28, dinh nghia da chot voi nguoi dung: "Kho da ket thuc" +
  // "Hang tru kho") - bucket theo thang giong het "sl_da_xac_nhan" (KTV da nhan) o duoi, vi day cung la
  // 1 trong "4 điểm kết thúc" da chot (xem CTE ddh_kt) chu khong phai snapshot "dang cho" nhu 4 cot
  // tren. Dung pxk.trang_thai_hien_tai lam dieu kien loc CHO CHINH subquery log (khop dung trang thai
  // hien tai, khong lay nham log cu cua 1 trong 2 trang thai neu PXK da di qua ca 2 - vi du khong xay
  // ra thuc te nhung giu an toan).
  const { results: pxkRows } = await c.env.DB
    .prepare(
      `SELECT pxk.nguoi_nhan_hang as email,
         ${pxkSnapshotCols}
         COALESCE(SUM(
           CASE WHEN pxk.trang_thai_hien_tai = 'KTV da nhan'
             AND strftime('%Y-%m', (SELECT ngay_xu_ly FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = pxk.id AND trang_thai = 'KTV da nhan' ORDER BY id DESC LIMIT 1)) = ?
           THEN 1 ELSE 0 END
         ), 0) as sl_da_xac_nhan,
         COALESCE(SUM(
           CASE WHEN pxk.trang_thai_hien_tai IN ('Kho da ket thuc', 'Hang tru kho')
             AND strftime('%Y-%m', (SELECT ngay_xu_ly FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = pxk.id AND trang_thai = pxk.trang_thai_hien_tai ORDER BY id DESC LIMIT 1)) = ?
           THEN 1 ELSE 0 END
         ), 0) as sl_kho_ket_thuc
       FROM phieu_xuat_kho pxk
       WHERE pxk.nguoi_nhan_hang IS NOT NULL${pxkScopeExists}
       GROUP BY pxk.nguoi_nhan_hang`,
    )
    .bind(thangBind, thangBind, ...scopeBinds)
    .all<{
      email: string; tong_pxk: number; tong_cho_chuyen: number; sl_cho_ke_toan: number; sl_cho_kho_gui: number; sl_da_gui: number;
      sl_da_xac_nhan: number; sl_kho_ket_thuc: number;
    }>();

  const byEmail = new Map<string, BaoCaoRow>();
  for (const d of donRows as {
    email: string; ten: string | null; sl_don: number; sl_don_mua: number; sl_don_cong_no: number; sl_don_tra_hang: number;
    sl_de_xuat: number; sl_tu_choi: number; sl_dang_cho: number; sl_duyet: number; sl_duyet_mua: number; sl_duyet_cong_no: number; sl_duyet_tra_hang: number;
    sl_thuc_duyet: number; tong_tien_thuc_te: number; tong_tien_dat_mua: number; tien_cho_duyet: number;
  }[]) {
    byEmail.set(d.email, {
      email: d.email, ten: d.ten,
      slDon: d.sl_don, slDonMua: d.sl_don_mua, slDonCongNo: d.sl_don_cong_no, slDonTraHang: d.sl_don_tra_hang,
      slDeXuat: d.sl_de_xuat, slTuChoi: d.sl_tu_choi, slDangCho: d.sl_dang_cho,
      slDuyet: d.sl_duyet, slDuyetMua: d.sl_duyet_mua, slDuyetCongNo: d.sl_duyet_cong_no, slDuyetTraHang: d.sl_duyet_tra_hang,
      slThucDuyet: d.sl_thuc_duyet, tongTienThucTe: d.tong_tien_thuc_te, tongTienDatMua: d.tong_tien_dat_mua, tienChoDuyet: d.tien_cho_duyet,
      tongChoChuyen: 0, tongPxk: 0, slChoKeToan: 0, slChoKhoGui: 0, slDaGui: 0, slDaXacNhan: 0, slKhoKetThuc: 0,
    });
  }
  for (const p of pxkRows as {
    email: string; tong_pxk: number; tong_cho_chuyen: number; sl_cho_ke_toan: number; sl_cho_kho_gui: number; sl_da_gui: number;
    sl_da_xac_nhan: number; sl_kho_ket_thuc: number;
  }[]) {
    const existing = byEmail.get(p.email);
    if (existing) {
      existing.tongPxk = p.tong_pxk;
      existing.tongChoChuyen = p.tong_cho_chuyen;
      existing.slChoKeToan = p.sl_cho_ke_toan;
      existing.slChoKhoGui = p.sl_cho_kho_gui;
      existing.slDaGui = p.sl_da_gui;
      existing.slDaXacNhan = p.sl_da_xac_nhan;
      existing.slKhoKetThuc = p.sl_kho_ket_thuc;
    } else {
      byEmail.set(p.email, {
        email: p.email, ten: null,
        slDon: 0, slDonMua: 0, slDonCongNo: 0, slDonTraHang: 0, slDeXuat: 0, slTuChoi: 0, slDangCho: 0,
        slDuyet: 0, slDuyetMua: 0, slDuyetCongNo: 0, slDuyetTraHang: 0, slThucDuyet: 0,
        tongTienThucTe: 0, tongTienDatMua: 0, tienChoDuyet: 0,
        tongPxk: p.tong_pxk, tongChoChuyen: p.tong_cho_chuyen, slChoKeToan: p.sl_cho_ke_toan,
        slChoKhoGui: p.sl_cho_kho_gui, slDaGui: p.sl_da_gui, slDaXacNhan: p.sl_da_xac_nhan, slKhoKetThuc: p.sl_kho_ket_thuc,
      });
    }
  }

  return [...byEmail.values()];
  });

  return c.json({ rows });
});

// Bieu do "Xu huong don hang theo ngay" (them 2026-09-26, yeu cau "bo sung chart cho bao cao sinh dong")
// - CHI DOC, 3 chuoi theo ngay trong 1 thang: tao moi (dat_don_hang.ngay_tao), da duyet (log 'TN da duyet'
// - DISTINCT don de 1 don duyet lai khong dem 2 lan), bi tu choi/huy (updated_at cua don dang o trang thai
// dong 'TN tu choi'/'Tu choi'/'Da huy' - CUNG moc thoi gian voi nhanh "don huy" cua ket_thuc_luc o
// /bao-cao-tong-the). Scope/chan QC/"full" dung CHUNG baoCaoScope() de bieu do khop pham vi voi bang ben
// duoi. Thang 0 = tu dau thang toi hom nay, 1/2 = tron thang N-1/N-2. Moi moc thoi gian deu la gio VN
// (ghi qua nowVN()) nen substr(...,1,10) la dung ngay VN.
datMuaLinhKien.get("/bao-cao-xu-huong", async (c) => {
  const user = c.get("user");
  if (user.vai_tro === "QC") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const wantFull = c.req.query("full") === "1";
  const { scopeCond, scopeBinds } = await baoCaoScope(c, wantFull);
  const thangParam = Math.max(0, Math.min(2, Number(c.req.query("thang") ?? 0)));
  const ym = thangYYYYMM(thangParam);
  const reportKey = buildReportKey("bao-cao-xu-huong", { thang: String(thangParam), full: wantFull ? "1" : undefined }, scopeCond ? scopeBinds : null);
  const result = await cachedReport(c.env.DB, reportKey, ["dat_mua_lk"], async () => {
    const scope = scopeCond ? scopeCond("ddh") : "";
    const [taoMoi, daDuyet, tuChoi] = await Promise.all([
      c.env.DB.prepare(
        `SELECT substr(ddh.ngay_tao, 1, 10) as d, COUNT(*) as n FROM dat_don_hang ddh
         WHERE substr(ddh.ngay_tao, 1, 7) = ?${scope} GROUP BY d`,
      ).bind(ym, ...scopeBinds).all<{ d: string; n: number }>(),
      c.env.DB.prepare(
        `SELECT substr(l.ngay_xu_ly, 1, 10) as d, COUNT(DISTINCT l.dat_don_hang_id) as n
         FROM dat_don_hang_log l JOIN dat_don_hang ddh ON ddh.id = l.dat_don_hang_id
         WHERE l.trang_thai = 'TN da duyet' AND substr(l.ngay_xu_ly, 1, 7) = ?${scope} GROUP BY d`,
      ).bind(ym, ...scopeBinds).all<{ d: string; n: number }>(),
      c.env.DB.prepare(
        `SELECT substr(ddh.updated_at, 1, 10) as d, COUNT(*) as n FROM dat_don_hang ddh
         WHERE ddh.trang_thai_hien_tai IN ('TN tu choi', 'Tu choi', 'Da huy') AND substr(ddh.updated_at, 1, 7) = ?${scope} GROUP BY d`,
      ).bind(ym, ...scopeBinds).all<{ d: string; n: number }>(),
    ]);
    const [y, m] = ym.split("-").map(Number);
    const soNgayTrongThang = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const soNgay = thangParam === 0 ? Number(nowVN().slice(8, 10)) : soNgayTrongThang;
    const ngay = Array.from({ length: soNgay }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
    const toSeries = (rows: { d: string; n: number }[]) => {
      const byDay = new Map(rows.map((r) => [r.d, r.n]));
      return ngay.map((d) => byDay.get(d) ?? 0);
    };
    return { ngay, tao_moi: toSeries(taoMoi.results), da_duyet: toSeries(daDuyet.results), tu_choi: toSeries(tuChoi.results) };
  });
  return c.json(result);
});

// GET /api/dat-mua-lk/tom-tat - breakdown "viec can xu ly" theo tung loai cho nguoi dang nhap (tieu
// chi UX #1, them 2026-08-15). Tai dung nguyen ham/cache cua badge sidebar (getDatMuaLkBadge trong
// notifications.ts) de dam bao 2 noi LUON hien cung 1 con so - module tu ve "thanh tom tat" o day,
// moi pill bam vao se nhay dung tab+filter (xu ly o frontend, xem DatMuaLinhKienModule.tsx).
datMuaLinhKien.get("/tom-tat", async (c) => {
  const user = c.get("user");
  const breakdown = await getDatMuaLkBadge(c.env.DB, user);
  return c.json(breakdown);
});

// BO (phan hoi 2026-08-18): endpoint "top-linh-kien" (goi y toan he thong, khong doi theo thoi
// gian) da bi go khoi frontend - trung lap voi /xep-hang-linh-kien (xep hang 30 ngay gan nhat, tich
// hop san trong LinhKienPicker). Nguoi dung yeu cau bo ban cu, chi giu 1 nguon xep hang duy nhat.

// GET /api/dat-mua-lk/xep-hang-linh-kien - CHOT (ra soat "Tao Don Linh Kien 2.0" #3): danh sach ma_lk
// xep hang theo LUOT DUOC TN DUYET THANH CONG trong 30 ngay gan nhat (khac /top-linh-kien la moi
// thoi gian, dung cho dai "Goi y nhanh") - dung cho o chon "Ma linh kien" tu sap xep ket qua theo
// "hang dat gan day" thay vi chi theo tu khop chuoi. Key cache theo NGAY VN (khong phai 1 key co
// dinh) - request DAU TIEN trong ngay tu tinh lai (compute-on-miss cua getOrCompute), CA NGAY con
// lai chi doc 1 dong co san; KHONG can cron rieng (tranh dung nguyen tac "khong them cron/trigger
// ghi moi neu khong can" - xem CLAUDE.md muc R2/cron), va khong tinh lai neu khong co ai mo man hinh
// hom do.
interface XepHangLinhKienRow {
  ma_lk: string;
  so_lan: number;
}

function ngayVNCachDay(soNgay: number): string {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  vnNow.setUTCDate(vnNow.getUTCDate() - soNgay);
  return vnNow.toISOString().slice(0, 19).replace("T", " ");
}

async function computeXepHangLinhKien(db: D1Database): Promise<XepHangLinhKienRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ddh.ma_lk as ma_lk, COUNT(*) as so_lan
       FROM dat_don_hang ddh
       WHERE ddh.loai_don != 'tra_hang'
         AND ${latestDonHangStatusExpr("ddh.id")} = 'TN da duyet'
         AND ddh.ngay_tao >= ?
       GROUP BY ddh.ma_lk
       ORDER BY so_lan DESC`,
    )
    .bind(ngayVNCachDay(30))
    .all<XepHangLinhKienRow>();
  return results;
}

datMuaLinhKien.get("/xep-hang-linh-kien", async (c) => {
  const ngayVN = nowVN().slice(0, 10);
  const rows = await getOrCompute(c.env.DB, `linh-kien-rank:${ngayVN}`, () => computeXepHangLinhKien(c.env.DB));
  return c.json({ rows });
});

// GET /api/dat-mua-lk/kiem-tra-ma-yeu-cau?id=&nguoi_nhan_hang= - canh bao MEM khi nhap "Ma yeu cau
// su co lien quan" (phan hoi UX #5, 2026-08-15). CO Y THIET KE endpoint RIENG thay vi tai dung GET
// /api/cases/:id: route do bi chan boi scopeByKhuVuc (Giam sat ngoai khu vuc se nhan 403 va frontend
// se hien sai thanh "khong tim thay"), trong khi o day KHONG gioi han theo khu vuc. Chi phi D1:
// WHERE id = ? la index-seek theo PRIMARY KEY, khong dang ke du goi moi lan nguoi dung go xong
// (frontend debounce 500ms).
//
// CHOT 2026-08-16 (phan hoi: "phai hien thong tin co ban de nguoi tao tu doi chieu"): tra them
// `preview` (khach_hang/seri_san_pham/khu_vuc/tinh/quan_huyen/hang/san_pham_bao_hanh/
// tien_do_hoan_thanh/ky_thuat_vien) khi tim thay - CO Y CHON tap nho, KHONG tra nguyen dong case
// (bo qua mo_ta_loi, dia chi chi tiet, so tien...) de nguoi tao doi chieu dung ca ma khong lo du
// lieu nhay cam/tai chinh cua case.
// SUA 2026-08-26: truoc day route nay "tra nguyen" ca object tu lookupCase() lam `preview` - vo hai
// luc CaseLookupPreview chi khai 9 field, nhung tu khi mo rong interface do len du 29 field (phuc vu
// GET /case-detail/:id ben duoi) thi phai LOC TAY lai dung 9 field da CHOT 2026-08-16, neu khong se
// vo tinh gui ca du lieu tai chinh (dt_san_pham/dt_linh_kien/dt_dich_vu) ve trinh duyet luc go ma.
function miniCasePreview(p: CaseLookupPreview) {
  const { khach_hang, seri_san_pham, khu_vuc, tinh, quan_huyen, hang, san_pham_bao_hanh, tien_do_hoan_thanh, ky_thuat_vien } = p;
  return { khach_hang, seri_san_pham, khu_vuc, tinh, quan_huyen, hang, san_pham_bao_hanh, tien_do_hoan_thanh, ky_thuat_vien };
}

// Dinh dang ID hop le de dang xin tra cuu (phan hoi 2026-09-09: "chỉ khi ID có số ký tự >5, format
// 100% là số hoặc T + số thì mới gửi API xin thông tin sang bên web dvbh, để tránh spam API") - ID
// case DVBH goc luon la 1 trong 2 dang nay, ID ngan hon hoac khac dang gan nhu chac chan la chuoi
// dang go do (chua go xong) - loc som TRUOC khi goi lookupCase() de khong ton 1 request sang he ngoai
// cho moi ky tu go dot ngot khop 500ms debounce cua FE (xem MaYeuCauSuCoCheck.tsx).
function isLikelyCaseId(id: string): boolean {
  // + dang "SC" + so (2026-10-07: DVBH co ~4.600 case "SC26100799"/"SC261003300" - truoc day bi loc bo, go ma SC khong ra gi).
  return id.length > 5 && (/^\d+$/.test(id) || /^(T|SC)\d+$/i.test(id));
}

// Gian cach toi thieu giua 2 lan tra cuu "Mã yêu cầu sự cố" tren CUNG 1 tai khoan (phan hoi 2026-09-09:
// "tránh lỗi ddos liên tục" - truoc do CHUA co gioi han nao o phia server, chi co debounce 500ms O
// PHIA CLIENT khong chan duoc client loi/co y goi thang API). Dung Cache API lam bo dem NHE (khong
// can migration D1 rieng, KHAC CASE_DETAIL_MIN_SYNC_MS o /case-detail/:id/sync dung cot DB vi do la
// khoa theo case_id dung CHUNG nhieu nguoi xem cung luc - o day khoa theo TUNG TAI KHOAN, ghi D1 moi
// lan go phim se qua tai khong can thiet).
const KIEM_TRA_MA_YCSC_MIN_INTERVAL_MS = 2000;
async function isThrottledKiemTraMaYcsc(email: string): Promise<boolean> {
  const cache = caches.default;
  const key = new Request(`https://ratelimit.internal/kiem-tra-ma-yeu-cau?email=${encodeURIComponent(email)}`);
  if (await cache.match(key)) return true;
  await cache.put(key, new Response("1", { headers: { "Cache-Control": `max-age=${Math.ceil(KIEM_TRA_MA_YCSC_MIN_INTERVAL_MS / 1000)}` } }));
  return false;
}

datMuaLinhKien.get("/kiem-tra-ma-yeu-cau", async (c) => {
  const id = c.req.query("id")?.trim();
  const nguoiNhanHang = c.req.query("nguoi_nhan_hang")?.trim();
  if (!id || !isLikelyCaseId(id)) return c.json({ found: false, khopKtv: null, preview: null });

  const user = c.get("user");
  if (await isThrottledKiemTraMaYcsc(user.email)) {
    return c.json({ error: "TOO_SOON", retryAfterMs: KIEM_TRA_MA_YCSC_MIN_INTERVAL_MS }, 429);
  }

  // SUA (tach he doc lap): case_dvbh khong con trong DB cuc bo - tra cuu qua API he cu, xem
  // lib/caseLookupClient.ts + CLAUDE.md muc "Nguon goc tach he thong".
  const full = await lookupCase(id, c.env);
  if (!full) return c.json({ found: false, khopKtv: null, preview: null });

  const maKtvCase = extractMaKtv(full.ky_thuat_vien);
  const preview = miniCasePreview(full);
  if (!maKtvCase || !nguoiNhanHang) return c.json({ found: true, khopKtv: null, preview });
  // v1.503 - "nhân viên sửa chữa văn phòng tạo đơn sửa chữa không bị cảnh báo không phải đơn của bạn": case bao hanh LUON do KTV hien truong
  // xu ly (KTV gui san pham ve), NV sua chua van phong chi sua tai kho -> nguoi nhan la NV sua chua thi KHONG so khop KTV (khong chan, khong to do).
  const nhanLaNvSc = await c.env.DB.prepare("SELECT la_nv_sua_chua FROM users WHERE email = ?").bind(nguoiNhanHang).first<{ la_nv_sua_chua: number }>();
  if (nhanLaNvSc?.la_nv_sua_chua) return c.json({ found: true, khopKtv: null, preview });

  const ktvRow = await c.env.DB.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE email_dang_nhap = ?")
    .bind(nguoiNhanHang)
    .first<{ ma_ktv: string }>();
  if (!ktvRow) return c.json({ found: true, khopKtv: null, preview });

  const khopKtv = ktvRow.ma_ktv === maKtvCase;

  // CHOT 2026-08-26 (phan hoi: "KTV/Tram/CTV go ma case khong phai cua minh xu ly thi bao loi, khong
  // gui thong tin ve"): CHI chan khi chinh nguoi dang nhap la KTV/Tram/CTV (la_ktv_dvbh) VA dang tu
  // chon MINH la nguoi nhan hang - Ve tinh/TN/Admin/Ke toan/QC/GS tao don HO 1 KTV khac (chon
  // nguoi_nhan_hang khac chinh minh) van xem duoc preview binh thuong, vi ho co the hop le biet/xu ly
  // case thay nguoi do. Khong chan khi khopKtv=null (khong tach duoc ma KTV tu chuoi case, hoac nguoi
  // dang nhap chua co dong ktv_lien_he) - du lieu khong du de ket luan chac chan la "khong phai cua
  // ho", chan nham se can tro luong hop le.
  const tuChonMinhNhanHang = user.la_ktv_dvbh && nguoiNhanHang === user.email;
  if (tuChonMinhNhanHang && khopKtv === false) {
    return c.json({ found: true, khopKtv: false, preview: null, blocked: true });
  }

  return c.json({ found: true, khopKtv, preview });
});

// GET /api/dat-mua-lk/kiem-tra-ma-lada?id= - tra cuu "Mã Lada liên quan" (2026-09-30) qua center.dichvu3t.com
// (lib/ladaLookupClient.ts, cung API App Khieu nai). CHI canh bao mem + the doi chieu, KHONG chan tao don (API ngoai
// loi/chua cau hinh token van tao duoc). Gian cach 2s/tai khoan (bo dem rieng voi Ma YCSC) + cache ket qua TIM THAY
// 10 phut theo ID (go lai / mo lai form khong goi API ngoai lan nua - API do la export Excel, nang).
const LADA_CACHE_S = 600;
datMuaLinhKien.get("/kiem-tra-ma-lada", async (c) => {
  const id = c.req.query("id")?.trim().toUpperCase();
  if (!id || !isLikelyLadaId(id)) return c.json({ found: false, preview: null });

  const cache = caches.default;
  const cacheKey = new Request(`https://lada-lookup.internal/${encodeURIComponent(id)}`);
  const hit = await cache.match(cacheKey);
  if (hit) return c.json({ found: true, preview: (await hit.json()) as LadaPreview });

  const user = c.get("user");
  const throttleKey = new Request(`https://ratelimit.internal/kiem-tra-ma-lada?email=${encodeURIComponent(user.email)}`);
  if (await cache.match(throttleKey)) return c.json({ error: "TOO_SOON", retryAfterMs: KIEM_TRA_MA_YCSC_MIN_INTERVAL_MS }, 429);
  await cache.put(throttleKey, new Response("1", { headers: { "Cache-Control": `max-age=${Math.ceil(KIEM_TRA_MA_YCSC_MIN_INTERVAL_MS / 1000)}` } }));

  const kq = await lookupLada(c.env, id);
  if (!kq.found || !kq.row) return c.json({ found: false, preview: null, warning: kq.warning ?? null });
  const preview = ladaPreview(kq.row);
  c.executionCtx.waitUntil(
    cache.put(cacheKey, new Response(JSON.stringify(preview), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${LADA_CACHE_S}` } })),
  );
  return c.json({ found: true, preview });
});

// Khoang cach toi thieu giua 2 lan bam "Dong bo lai" tren 1 case (phan hoi 2026-08-26) - tranh spam
// API doi tac khi nguoi dung bam lien tuc; kiem tra dua tren cot synced_at da luu (nowVN(), giay).
const CASE_DETAIL_MIN_SYNC_MS = 5000;

function msSinceVN(ts: string): number {
  return Date.now() - Date.parse(ts.replace(" ", "T") + "Z");
}

// Cot "data" cua case_lookup_snapshot luu CA preview LAN giaiTrinh gop chung 1 object (them
// 2026-09-11: "{...preview, giaiTrinh}") de KHONG can migration D1 doi schema bang. Doc lai: cac dong
// cache TU TRUOC lan doi nay se thieu CA key "giaiTrinh" LAN "link_hinh_anh" (2 truong moi nhat) -
// mac dinh ve []/[] de tuong thich nguoc, khong can xoa cache cu.
// FIX (phan hoi 2026-09-11: "ấn Xem chi tiết web trắng xóa") - thieu dong nay lam `data.link_hinh_anh`
// = undefined tren cache cu, frontend goi `.length` truc tiep (khong optional chaining) lam crash
// toan bo React tree (khong co error boundary o day) -> trang trang xoa.
function parseCachedSnapshot(raw: string): { data: CaseLookupPreview; giaiTrinh: CaseLookupGiaiTrinh[] } {
  const parsed = JSON.parse(raw) as CaseLookupPreview & { giaiTrinh?: CaseLookupGiaiTrinh[] };
  const { giaiTrinh, ...data } = parsed;
  return { data: { ...data, link_hinh_anh: data.link_hinh_anh ?? [] } as CaseLookupPreview, giaiTrinh: giaiTrinh ?? [] };
}

// GET /api/dat-mua-lk/case-detail/:id - man "Xem chi tiet case" moi (mo tu icon canh o kiem tra ma
// yeu cau su co luc tao don, hoac bam vao 1 ID case bat ky dang hien trong don hang - xem migration
// 0008). CHOT 2026-08-26: KHONG chan them theo quyen so huu case o day (khac GET /kiem-tra-ma-yeu-cau
// o tren) - ID case chi lo ra duoc tu 1 don hang nguoi dung DA duoc phep xem (scopeDatMuaNguoiTao),
// nen phan quyen xem don hang hien co la du. Chi keo API doi tac 1 LAN dau (cache vao
// case_lookup_snapshot), nhung lan mo sau doc lai cache - nguoi dung tu bam dong bo lai khi can moi.
datMuaLinhKien.get("/case-detail/:id", async (c) => {
  const id = c.req.param("id").trim();
  const cached = await c.env.DB.prepare("SELECT data, synced_at FROM case_lookup_snapshot WHERE case_id = ?")
    .bind(id)
    .first<{ data: string; synced_at: string }>();
  if (cached) {
    const { data, giaiTrinh } = parseCachedSnapshot(cached.data);
    return c.json({ found: true, data, giaiTrinh, syncedAt: cached.synced_at });
  }

  const full = await lookupCaseFull(id, c.env);
  if (!full) return c.json({ found: false, data: null, giaiTrinh: [], syncedAt: null });

  const syncedAt = nowVN();
  await c.env.DB.prepare(
    "INSERT INTO case_lookup_snapshot (case_id, data, synced_at) VALUES (?, ?, ?) ON CONFLICT(case_id) DO UPDATE SET data = excluded.data, synced_at = excluded.synced_at",
  )
    .bind(id, JSON.stringify({ ...full.preview, giaiTrinh: full.giaiTrinh }), syncedAt)
    .run();
  return c.json({ found: true, data: full.preview, giaiTrinh: full.giaiTrinh, syncedAt });
});

// POST /api/dat-mua-lk/case-detail/:id/sync - lam moi cache tren, gioi han CASE_DETAIL_MIN_SYNC_MS
// giua 2 lan (theo case_id, khong theo nguoi bam - nhieu nguoi cung xem 1 case dung chung 1 dong ho).
datMuaLinhKien.post("/case-detail/:id/sync", async (c) => {
  const id = c.req.param("id").trim();
  const cached = await c.env.DB.prepare("SELECT data, synced_at FROM case_lookup_snapshot WHERE case_id = ?")
    .bind(id)
    .first<{ data: string; synced_at: string }>();
  if (cached && msSinceVN(cached.synced_at) < CASE_DETAIL_MIN_SYNC_MS) {
    return c.json({ error: "TOO_SOON", retryAfterMs: CASE_DETAIL_MIN_SYNC_MS - msSinceVN(cached.synced_at) }, 429);
  }

  const full = await lookupCaseFull(id, c.env);
  if (!full) {
    // Dong bo that bai (API doi tac loi/timeout) KHAC voi "case khong ton tai" - id nay DA tung tim
    // thay truoc do (co dong cache) nen giu nguyen du lieu cu + co `syncFailed`, KHONG xoa sach thanh
    // "khong tim thay" (se lam mat du lieu dang xem chi vi 1 loi tam thoi cua API doi tac).
    if (cached) {
      const { data, giaiTrinh } = parseCachedSnapshot(cached.data);
      return c.json({ found: true, data, giaiTrinh, syncedAt: cached.synced_at, syncFailed: true });
    }
    return c.json({ found: false, data: null, giaiTrinh: [], syncedAt: null });
  }

  const syncedAt = nowVN();
  await c.env.DB.prepare(
    "INSERT INTO case_lookup_snapshot (case_id, data, synced_at) VALUES (?, ?, ?) ON CONFLICT(case_id) DO UPDATE SET data = excluded.data, synced_at = excluded.synced_at",
  )
    .bind(id, JSON.stringify({ ...full.preview, giaiTrinh: full.giaiTrinh }), syncedAt)
    .run();
  return c.json({ found: true, data: full.preview, giaiTrinh: full.giaiTrinh, syncedAt });
});

// GET /api/dat-mua-lk/don-hang?trang_thai=&nguoi_tao=&nguoi_nhan_hang=&tu_ngay=&den_ngay=&page=&pageSize
// - danh sach DONG don hang (CHOT 2026-08-15: bo khai niem "phieu dat" khoi trai nghiem nguoi dung -
// xem migration 0075, thay the GET /phieu-dat cu). Scope theo quan he nguoi dung
// (scopeDatMuaNguoiTao, doc thang tren dat_don_hang - khong con join qua phieu_dat). loai_don='tra_hang'
// (CHOT vong 7, 2026-08-17: dong dat_don_hang cua tra hang van sinh binh thuong qua cung API tao don
// nhu mua/cong no, xem POST tao don o duoi - chi khac la KHONG insert dat_don_hang_log ban dau vi
// dung tra_hang_log rieng - xem traHang.ts) chi hien khi FE loc tuong minh loai_don=tra_hang; khong
// truyen loai_don thi mac dinh loai tru de giu hanh vi cu cho cac noi goi khac (an toan nguoc).
// Sap xep theo nguoi_nhan_hang TRUOC de Frontend gom cum hien thi theo KTV ngay tren 1 trang (giong
// dung pattern da dung o GET /phieu-xuat-kho/don-hang-kha-dung).
// "Tổng đơn hàng" (StageMenu, phan hoi 2026-09-28: "tổng đơn hàng đang tồn dưới mọi hình thức theo vai
// trò") - loai_don=all = GOP CA 3 loai (mua/cong_no/tra_hang) trong 1 danh sach. "Con ton" khi gop phai
// dung DUNG tap trang thai dong cua TUNG loai (tra hang co bo trang thai rieng), khong dung chung 1 tap.
const TAT_CA_LOAI_DON = "all";
// "Con ton" gom ca don DA duyet nhung CHUA nam trong phieu nao ("Chờ tạo phiếu") - sua 2026-10-29: don bi TN bo khoi phieu
// (mang theo tien) nam o "TN da duyet" khong phieu bien mat khoi "Còn tồn" cua KTV (DDH-003687 / PMH-001393).
const CHO_TAO_PHIEU_SQL = "(ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.ma_xuat_kho IS NULL)";
function donConTonSql(loaiDon: string | undefined): { sql: string; binds: string[] } {
  const ph = (arr: readonly string[]) => arr.map(() => "?").join(",");
  if (loaiDon === TAT_CA_LOAI_DON) {
    return {
      sql: `((ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai NOT IN (${ph(TRA_HANG_TRANG_THAI_DONG_COUNTS)}))
        OR (ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai NOT IN (${ph(DON_HANG_TRANG_THAI_DONG)})) OR ${CHO_TAO_PHIEU_SQL})
        AND NOT ${traHangTuHuySql("ddh")}`,
      binds: [...TRA_HANG_TRANG_THAI_DONG_COUNTS, ...DON_HANG_TRANG_THAI_DONG],
    };
  }
  const dongSet = loaiDon === "tra_hang" ? TRA_HANG_TRANG_THAI_DONG_COUNTS : DON_HANG_TRANG_THAI_DONG;
  // Don tra hang tu huy (cho Kho qua 10 ngay, v1.524) khong tinh "con ton".
  return { sql: `((ddh.trang_thai_hien_tai NOT IN (${ph(dongSet)}) OR ${CHO_TAO_PHIEU_SQL}) AND NOT ${traHangTuHuySql("ddh")})`, binds: [...dongSet] };
}

// Cot loc kieu Excel cua danh sach don (2026-09-28) - khoa = key cot o DonCuaToiTab.tsx (LocCotButton).
const DON_HANG_COT_LOC: Record<string, CotLoc> = {
  loai_de_xuat: { kieu: "don", expr: "ddh.loai_de_xuat" },
  nguoi_tao: { kieu: "don", expr: "ddh.nguoi_tao", sortExpr: tenNguoiSql("ddh.nguoi_tao") },
  nguoi_nhan_hang: { kieu: "don", expr: "ddh.nguoi_nhan_hang", sortExpr: tenNguoiSql("ddh.nguoi_nhan_hang") },
  trang_thai: { kieu: "don", expr: "ddh.trang_thai_hien_tai" },
  yeu_cau_hoa_don: { kieu: "don", expr: "ddh.yeu_cau_hoa_don" },
  // Cot luu san (migration 0042) - thay subquery ktv_lien_he: co ca khu vuc GS va "Chưa có khu vực".
  khu_vuc: { kieu: "don", expr: "COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma)", khuVuc: true }, // + Kho chon lai (0071)
  // Trang thai phieu xuat kho + chuyen tien THEO DON (2026-09-29, lib/trangThaiDonPxk.ts) - bieu thuc suy tu PXK chua don.
  trang_thai_pxk: { kieu: "don", expr: TRANG_THAI_PXK_DON_SQL("ddh") },
  thanh_toan: { kieu: "don", expr: THANH_TOAN_DON_SQL("ddh") },
};

// Dieu kien WHERE cua GET /don-hang (tach ham 2026-09-28 de GET /don-hang/gia-tri-loc dung lai y het).

async function donHangListWhere(c: Context<{ Bindings: Env }>, boQuaCot?: string): Promise<{ whereSql: string; binds: unknown[] }> {
  const user = c.get("user");
  const scope = scopeDatMuaNguoiTao(c);
  const trangThai = c.req.query("trang_thai");
  const nguoiTao = c.req.query("nguoi_tao");
  const nguoiNhanHang = c.req.query("nguoi_nhan_hang");
  const tuNgay = c.req.query("tu_ngay");
  const denNgay = c.req.query("den_ngay");
  const loaiDon = c.req.query("loai_don");
  // "khu_vuc" (them 2026-08-27, filter Khu vuc cho nhan vien van phong - xem GET /khu-vuc-cua-toi) -
  // danh sach ma Khu vuc cach nhau boi dau phay, khop don co NGUOI TAO hoac NGUOI NHAN HANG la 1 KTV
  // thuoc 1 trong cac Khu vuc do (giong cau truc OR cua khuVucViewEmailInSql nhung nhan NHIEU khu vuc
  // tuong minh tu FE thay vi tu tra cuu user_khu_vuc cua chinh nguoi goi - bo loc UI thuan, KHONG phai
  // gioi han bao mat nhu la_view).
  const khuVuc = c.req.query("khu_vuc")?.trim();
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #8): tim theo ma LK/ten LK/ma dong - ap TRUOC khi
  // phan trang (server-side), khac voi lam client-side chi loc duoc trong 20 dong dang tai cua 1
  // trang - tranh cam giac "tim khong ra" du du lieu ton tai o trang khac.
  // .normalize("NFC") - xem giai thich day du o settingsKtv.ts GET / (cung fix, cung ngay).
  const q = c.req.query("q")?.trim().normalize("NFC");
  // KHONG truyen page -> tra HET (khong phan trang) - dung cho nut "Tải danh sách chi tiết" (them
  // 2026-09-13, mirror pattern settingsKtv.ts GET / "KHÔNG truyền page -> giữ nguyên hành vi cũ").
  let whereSql = (loaiDon ? "1=1" : "ddh.loai_don != 'tra_hang'") + (scope?.whereSql ?? "");
  const binds: unknown[] = [...(scope?.binds ?? [])];
  // FIX (phan hoi nguoi dung: "đồng bộ danh sách theo badge" cho Khu vuc phu trach GS) - truoc day
  // phuTrachGsSet CHI anh huong badge (/loai-don-counts, /don-hang-status-counts, dangTonSteps...),
  // KHONG anh huong danh sach nay - TN/Kho/Ke toan da duoc gan "phụ trách" 1 vai GS cu the (bang
  // dat_mua_lk_phu_trach_gs) van thay TOAN BO don he thong khi bam vao danh sach, du badge da bao dung
  // so nho hon. Them dieu kien CUNG mot Set, ap dung THANG len danh sach - khop hoan toan voi badge,
  // dung tinh than "không thuộc phạm vi của họ thì họ không cần quan tâm".
  // "pxk_id" (2026-10-02, nut "Tải danh sách chi tiết" trong chi tiet PXK) - chi cac don dang nam trong phieu do. Bo lop
  // "Giám sát phụ trách" mem (nguoi xem phieu da thay du dong); scope bao mat (scopeDatMuaNguoiTao) van ap.
  const pxkId = c.req.query("pxk_id")?.trim();
  if (pxkId) {
    whereSql += " AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pd WHERE pd.dat_don_hang_id = ddh.id AND pd.phieu_xuat_kho_id = ?)";
    binds.push(pxkId);
  }
  // "pxk_ids" (2026-10-19, nut "Tải chi tiết đơn" o danh sach PXK) - JSON array ma phieu (<= 200/lan, FE chia lo), 1 bind json_each.
  // Cung quy tac voi pxk_id: bo lop GS phu trach mem, scope bao mat van ap.
  let pxkIds: string[] | null = null;
  const pxkIdsRaw = c.req.query("pxk_ids");
  if (pxkIdsRaw) {
    try {
      const v: unknown = JSON.parse(pxkIdsRaw);
      if (Array.isArray(v)) pxkIds = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 200);
    } catch { /* tham so hong -> bo qua */ }
    if (!pxkIds) pxkIds = []; // tham so hong -> khong khop don nao
    whereSql += " AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pd WHERE pd.dat_don_hang_id = ddh.id AND pd.phieu_xuat_kho_id IN (SELECT value FROM json_each(?)))";
    binds.push(JSON.stringify(pxkIds));
  }
  if (!pxkId && !pxkIds && scope === null && (canTacNghiep(c) || user.la_kho || user.la_ke_toan)) {
    const gsSet = await phuTrachGsSet(c.env.DB, user.email);
    if (gsSet) {
      whereSql += ` AND ddh.email_gs IN (${[...gsSet].map(() => "?").join(",")})`;
      binds.push(...gsSet);
    }
  }
  if (loaiDon && loaiDon !== TAT_CA_LOAI_DON) {
    whereSql += " AND ddh.loai_don = ?";
    binds.push(loaiDon);
  }
  if (trangThai === "__OPEN__") {
    // Sentinel "con ton" (them 2026-08-27, phan hoi UI mobile "mặc định lọc các đơn còn tồn") - tai
    // dung DUNG 2 dinh nghia "dong" da co san cho GET /loai-don-counts o tren (khong bia tieu chi
    // moi): mua/cong no dung DON_HANG_TRANG_THAI_DONG (gom ca "Cho hang" - da duyet xong, chi con
    // cho hang ve, khong can ai xu ly them), tra_hang dung TRA_HANG_TRANG_THAI_DONG_COUNTS.
    const conTon = donConTonSql(loaiDon);
    whereSql += ` AND ${conTon.sql}`;
    binds.push(...conTon.binds);
  } else if (trangThai === "__TODAY__") {
    // Sentinel "duyet trong ngay" (them 2026-09-11, muc menu giai doan hoa) - "cac don duoc xu ly
    // trong ngay hom nay": loc theo ddh.updated_at (cot nay duoc cap nhat MOI LAN trang_thai_hien_tai
    // doi, xem cac UPDATE dat_don_hang o duoi file), so sanh phan ngay (10 ky tu dau) voi ngay VN hien
    // tai qua nowVN() - cot nay LUON luu gio VN (khong phai UTC, xem CLAUDE.md/memory mui gio VN).
    whereSql += " AND substr(ddh.updated_at, 1, 10) = ?";
    binds.push(nowVN().slice(0, 10));
  } else if (trangThai === "__CHO_TAO_PXK__") {
    // Sentinel "Đơn chờ tạo xuất" (them 2026-09-11, phan hoi "không phải tự động mở UI tạo phiếu...
    // hiện danh sách đơn mua hoặc công nợ, trả hàng đang chờ tạo phiếu") - dong da "TN da duyet" VA
    // CHUA duoc gan vao PXK nao (ma_xuat_kho IS NULL). Dung DUNG dieu kien voi GET
    // /phieu-xuat-kho/don-hang-kha-dung (nguon cho picker chon dong trong Modal tao PXK) nhung doc
    // truc tiep ddh.trang_thai_hien_tai (khong can phan biet mua/cong_no dung log-based expr vs
    // tra_hang dung cot thang nhu o do - cot nay da LUON dong bo cho MOI loai_don, xem comment nhanh
    // "RA SOAT CHI PHI D1" o duoi).
    whereSql += " AND ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.ma_xuat_kho IS NULL";
  } else if (trangThai === "__TU_CHOI_CHUA_XEM__") {
    // The "Đơn bị từ chối" o Trang chu (2026-10-01): CUNG tap voi so dem (thong_bao_ktv 'tu_choi' chua doc cua chinh nguoi
    // xem = don ho TAO bi tu choi, chua mo chi tiet) - truoc day nhay sang "TN tu choi" toan pham vi nen so lech danh sach.
    whereSql += " AND ddh.trang_thai_hien_tai = 'TN tu choi' AND EXISTS (SELECT 1 FROM thong_bao_ktv tb WHERE tb.nguoi_nhan = ? AND tb.loai = 'tu_choi' AND tb.da_doc = 0 AND tb.link_id = ddh.id)";
    binds.push(user.email);
  } else if (trangThai === "__YEU_CAU_HUY__") {
    // "Yêu cầu hủy chờ tôi đồng ý" (v1.455): don co yeu cau huy dang mo cua bo phan nguoi xem (Admin: moi bo phan) - CUNG tap voi
    // yeuCauHuyCanXuLy o notifications.ts.
    const boPhan = user.vai_tro === "Admin"
      ? ["kho", "mua_hang", "ke_toan"]
      : [user.la_kho ? "kho" : "", user.la_mua_hang ? "mua_hang" : "", user.la_ke_toan ? "ke_toan" : ""].filter(Boolean);
    whereSql += " AND EXISTS (SELECT 1 FROM yeu_cau_huy_don y WHERE y.dat_don_hang_id = ddh.id AND y.trang_thai = 'Cho dong y' AND y.bo_phan IN (SELECT value FROM json_each(?)))";
    binds.push(JSON.stringify(boPhan));
  } else if (trangThai === "__CHO_TT__") {
    // Muc "Chờ thanh toán" (sua 2026-10-27, "khi filter đơn hàng chờ thanh toán, nó đang chỉ hiện đơn chờ thành toán (thiếu hàng) (đơn
    // được duyệt nhưng đang chờ chuyển tiền lại không hiện)"): don "Cho thanh toan" (thieu hang) + don DA duyet ma tien chua duoc Ke toan
    // xac nhan (cot Chuyen tien = Cho thanh toan / Cho xac nhan tien).
    whereSql += ` AND ${CHO_THANH_TOAN_GOP_SQL}`;
  } else if (trangThai === "__CHO_TN__") {
    // Muc "Chờ tác nghiệp" (2026-09-30, phan hoi "đơn sau khi KT/Kho/QC xác nhận nhảy sang trạng thái chung với
    // Chờ TN duyệt để TN không bị miss đơn"): don mua/cong no "Cho TN duyet" + don tra hang "Cho TN duyet tong".
    whereSql += " AND (ddh.trang_thai_hien_tai = 'Cho TN duyet' OR (ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho TN duyet tong'))";
  } else if (trangThai === "__TU_HUY_KHO__") {
    whereSql += ` AND ${traHangTuHuySql("ddh")}`; // don tra hang tu huy - cho Kho qua 10 ngay (v1.524)
  } else if (trangThai === "Cho kho xac nhan") {
    whereSql += ` AND ddh.trang_thai_hien_tai = 'Cho kho xac nhan' AND NOT ${traHangTuHuySql("ddh")}`;
  } else if (trangThai) {
    // RA SOAT CHI PHI D1 2026-08-18 (phan hoi Codex #11/#13, migration 0087+0088): doc truc tiep cot
    // trang_thai_hien_tai (co index idx_ddh_loai_don_trang_thai) thay vi correlated subquery - cot
    // nay LUON dung/moi (moi write site da duoc cap nhat dong bo, ke ca dong loai_don='tra_hang'
    // dung tra_hang_log rieng), khong con can phan biet CASE theo loai_don nhu truoc.
    whereSql += " AND ddh.trang_thai_hien_tai = ?";
    binds.push(trangThai);
  }
  if (nguoiTao) {
    whereSql += " AND ddh.nguoi_tao = ?";
    binds.push(nguoiTao);
  }
  // Giai doan 4b - TN/GS loc/nhom hang doi theo "nguoi nhan hang" (diem 5 yeu cau: "danh sach don se
  // sap xep theo don hang do se mua cho KTV nao").
  if (nguoiNhanHang) {
    whereSql += " AND ddh.nguoi_nhan_hang = ?";
    binds.push(nguoiNhanHang);
  }
  if (khuVuc) {
    const khuVucList = khuVuc.split(",").map((s) => s.trim()).filter(Boolean);
    if (khuVucList.length > 0) {
      // Cung khuVucSetWhereSql() - gom ca cot ddh.khu_vuc_ma (migration 0042: don GS tu nhan / "Chưa có khu vực").
      const { sql, binds: khuVucBinds } = khuVucSetWhereSql(new Set(khuVucList), ["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]);
      whereSql += sql;
      binds.push(...khuVucBinds);
    }
  }
  if (tuNgay) {
    whereSql += " AND ddh.ngay_tao >= ?";
    binds.push(tuNgay);
  }
  if (denNgay) {
    whereSql += " AND ddh.ngay_tao <= ?";
    binds.push(denNgay + " 23:59:59");
  }
  if (q) {
    // UI redesign (phan hoi Codex 2026-08-19, muc P2 "mo rong search") - truoc day chi tim ma_lk/
    // ten_lk_snapshot/id, TN/GS thuong can tim theo nguoi tao/nguoi nhan hang/ma yeu cau su co (deu
    // la cot THAT tren dat_don_hang, khong can JOIN them).
    // + tim theo TEN nguoi tao/nguoi nhan hang (2026-09-28, xem lib/timTheoTen.ts).
    const theoTen = orEmailIn(["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"], await emailsTheoTen(c.env.DB, q));
    const theoMa = orMaYcsc("ddh", q); // + ma yeu cau su co BO SUNG (2026-09-29)
    const theoPxk = orPxkCuaDon("ddh", q); // + ma phieu / ma don hang / ma PXK MISA / ma van don cua phieu chua don (2026-10-03)
    const tenLk = tenLkKhopSql("ddh.ten_lk_snapshot", q); // ten LK khong phan biet hoa/thuong (v1.377)
    whereSql += ` AND (ddh.ma_lk LIKE ? OR ${tenLk.sql} OR ddh.id LIKE ? OR ddh.nguoi_tao LIKE ? OR ddh.nguoi_nhan_hang LIKE ?${theoMa.sql}${theoPxk.sql}${theoTen.sql})`;
    binds.push(`%${q}%`, ...tenLk.binds, `%${q}%`, `%${q}%`, `%${q}%`, ...theoMa.binds, ...theoPxk.binds, ...theoTen.binds);
  }

  // Loc cot kieu Excel (2026-09-28, lib/locCot.ts).
  const locCot = sqlLocCot(DON_HANG_COT_LOC, docLocCot(c.req.query("cf"), DON_HANG_COT_LOC), boQuaCot);
  whereSql += locCot.sql;
  binds.push(...locCot.binds);
  return { whereSql, binds };
}

datMuaLinhKien.get("/don-hang", async (c) => {
  const pageParam = c.req.query("page");
  const page = Math.max(1, (Math.trunc(Number(pageParam)) || 1));
  const pageSize = Math.min(200, Math.max(1, (Math.trunc(Number(c.req.query("pageSize"))) || 20)));
  const offset = (page - 1) * pageSize;
  const { whereSql, binds } = await donHangListWhere(c);
  // Sap xep theo cot (2026-09-28): giu nhom theo KTV nhan hang (UI nhom theo cot nay) - sort TRONG tung nhom; rieng
  // sort cot "Người nhận hàng" thi xep thu tu CAC nhom.
  const cotSapXep = c.req.query("cs");
  const sapXep = sqlSapXep(DON_HANG_COT_LOC, cotSapXep, c.req.query("cd"));
  const orderSql = !sapXep
    ? "ddh.nguoi_nhan_hang, ddh.ngay_tao DESC"
    : cotSapXep === "nguoi_nhan_hang"
      ? `${sapXep}, ddh.nguoi_nhan_hang, ddh.ngay_tao DESC`
      : `ddh.nguoi_nhan_hang, ${sapXep}, ddh.ngay_tao DESC`;
  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM dat_don_hang ddh WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT ddh.*, ddh.trang_thai_hien_tai as trang_thai, ${DAC_THU_DON_SQL("ddh")} as dac_thu, lk.dac_thu as lk_dac_thu, lk.gia_ban as lk_gia_ban, ${TU_HUY_DUOC_SQL("ddh")} as tu_huy_duoc, (SELECT u_gs.giam_sat_quan_ly FROM users u_gs WHERE u_gs.email = ddh.nguoi_tao) as gs_nguoi_tao, ${TN_DOI_TRONG_PXK_SQL("ddh")} as tn_doi_trong_pxk, ${GS_HUY_TRONG_PXK_SQL("ddh")} as gs_huy_trong_pxk, ${MUA_HANG_CHO_HANG_DUOC_SQL("ddh")} as mua_hang_cho_hang_duoc, ${dayLaiHanSql("ddh")} as day_lai_han, ${choTnDuyetAtExpr("ddh.id")} as cho_tn_duyet_at,
       ${khoDangXuLyThieuLkSql("ddh")} as kho_dang_xu_ly_thieu_lk,
       (SELECT y.bo_phan FROM yeu_cau_huy_don y WHERE y.dat_don_hang_id = ddh.id AND y.trang_thai = 'Cho dong y') as yeu_cau_huy_bo_phan,
       ${lastGiaiTrinhAtExpr("ddh.id")} as last_giai_trinh_at,
       (SELECT ghi_chu FROM dat_don_hang_log WHERE dat_don_hang_id = ddh.id ORDER BY id DESC LIMIT 1) as ghi_chu_xu_ly_gan_nhat,${THIEU_LK_DON_COT("ddh")},
       kv.ten as khu_vuc_ten,
       ${TRANG_THAI_PXK_DON_SQL("ddh")} as trang_thai_pxk, ${THANH_TOAN_DON_SQL("ddh")} as thanh_toan
     FROM dat_don_hang ddh
     LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
     -- "Khu vực" = cot ddh.khu_vuc_ma (migration 0042: KTV nhan hang -> KTV tao -> GS -> "Chưa có khu vực"),
     -- truoc day JOIN ktv_lien_he cua nguoi nhan (don GS tu nhan hien trong).
     LEFT JOIN khu_vuc kv ON kv.ma = COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) -- + Kho chon lai (0071)
     WHERE ${whereSql}
     ORDER BY ${orderSql}
     ${pageParam ? "LIMIT ? OFFSET ?" : ""}`,
  )
    .bind(...binds, ...(pageParam ? [pageSize, offset] : []))
    .all<{ id: string; ly_do_cham: string | null; cho_tn_duyet_at: string | null; last_giai_trinh_at: string | null; ghi_chu_xu_ly_gan_nhat: string | null }>();

  // "Quá hạn - cần lý do chậm" (cung cong thuc voi GET /don-hang/:id, xem hanLyDoCham.ts) - truoc day
  // CHI tinh duoc o man chi tiet tung dong, danh sach hoan toan khong co canh bao (phan hoi chu he
  // thong: "danh sách chờ TN duyệt đang không có nơi để nhập lý do quá hạn... thiếu cảnh báo").
  // SUA (muc #5): moc tinh han GIO LA last_giai_trinh_at (lan giai trinh gan nhat) neu co, khong con
  // dua vao "co ly_do_cham hay khong" (khoa vinh vien) - xem lastGiaiTrinhAtExpr.
  const now = nowVN();
  // "Giá đề xuất" = gia SAU chiet khau (phan hoi 2026-09-28) - tien uoc tinh tung dong, CHI tinh khi co phan
  // trang (danh sach UI); "Tải danh sách chi tiết" (khong phan trang) bo qua de tranh vuot gioi han truy van D1.
  const tienTheoDon = pageParam ? await tienUocTinhChoDon(c.env.DB, results.map((r) => r.id)) : null;
  const rows = results.map(({ cho_tn_duyet_at, last_giai_trinh_at, ...row }) => {
    const mocThoiGian = mocTinhHanTn(last_giai_trinh_at, cho_tn_duyet_at);
    return {
      ...row,
      qua_han_ly_do_cham: !!mocThoiGian && quaHanLyDoCham(mocThoiGian, now),
      ...(tienTheoDon ? { tien_uoc_tinh: tienTheoDon.get(row.id) ?? null } : {}),
    };
  });

  return c.json({ rows, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/dat-mua-lk/don-hang/gia-tri-loc?cot=<cot>&<cung bo loc GET /don-hang> - danh sach gia tri + so dong cua 1
// cot cho o loc kieu Excel (2026-09-28). Dat TRUOC /don-hang/:id (Hono khop theo thu tu dang ky).
datMuaLinhKien.get("/don-hang/gia-tri-loc", async (c) => {
  const cot = c.req.query("cot") ?? "";
  const def = Object.hasOwn(DON_HANG_COT_LOC, cot) ? DON_HANG_COT_LOC[cot] : undefined;
  if (!def) return c.json({ error: "COT_KHONG_HOP_LE" }, 400);
  const { whereSql, binds } = await donHangListWhere(c, cot);
  return c.json({ rows: await giaTriCot(c.env.DB, def, "FROM dat_don_hang ddh", "ddh.id", whereSql, binds) });
});

// GET /api/dat-mua-lk/don-hang-status-counts?loai_don= - dem SO DONG THEO TUNG trang_thai_hien_tai
// (phan hoi 2026-09-01: "danh sách nút filter quá nhiều... đổi thành filter dropdown, hiện số cạnh
// mỗi trạng thái") - dung cho TrangThaiDropdownFilter o CA DonCuaToiTab (mua/cong_no/tra_hang) LAN
// TraHangTab (loai_don=tra_hang cho ra CUNG whereSql/scope voi GET /tra-hang trong traHang.ts - ca 2
// deu dung scopeDatMuaNguoiTao() + "ddh.loai_don = 'tra_hang'", chi khac cach viet literal-vs-bind,
// nen KHONG can 1 endpoint rieng cho TraHangTab). "Dem tinh" (da xac nhan voi nguoi dung: bo qua cac
// bo loc PHU dang bat - nguoi_tao/nguoi_nhan_hang/khu_vuc/ngay/q - CHI ap dung scope + loai_don, giong
// het GET /don-hang/GET /tra-hang khi chua ai bam them bo loc nao).
datMuaLinhKien.get("/don-hang-status-counts", async (c) => {
  const user = c.get("user");
  const scope = scopeDatMuaNguoiTao(c);
  const loaiDon = c.req.query("loai_don");
  let whereSql = (loaiDon ? "1=1" : "ddh.loai_don != 'tra_hang'") + (scope?.whereSql ?? "");
  const binds: unknown[] = [...(scope?.binds ?? [])];
  if (loaiDon && loaiDon !== TAT_CA_LOAI_DON) {
    whereSql += " AND ddh.loai_don = ?";
    binds.push(loaiDon);
  }
  // FIX (phat hien qua ra soat QA "click StatCard hien it don hon so tren the" - cung loi voi
  // /loai-don-counts, dangTonSteps isStaff) - comment goc o tren gia dinh GET /don-hang "khi chua ai
  // bam them bo loc nao" KHONG bi loc khu_vuc, nhung DonCuaToiTab.tsx/PhieuXuatKhoTab.tsx thuc te TU
  // DONG ap dung Khu vuc cua chinh tai khoan lam gia tri MAC DINH ngay tu lan tai dau (khuVucDefaultAppliedRef),
  // khong doi nguoi dung tu bam - voi TN/Kho/Ke toan DA duoc gan Khu vuc rieng (bang user_khu_vuc, xac
  // nhan co that tren production: ngatran12302@gmail.com/vuhongthai3101@gmail.com), so o day (dem
  // KHONG loc khu_vuc) LON HON so dong thuc su hien ra o danh sach mac dinh (co loc). Them dung
  // khuVucCuaToiSet/phuTrachGsSet, dung 1 pattern voi /loai-don-counts (xem giai thich day du o do).
  if (scope === null) {
    const khuVucSet = await khuVucCuaToiSet(c.env.DB, user);
    if (khuVucSet) {
      const { sql, binds: kvBinds } = khuVucSetWhereSql(khuVucSet, ["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]);
      whereSql += sql;
      binds.push(...kvBinds);
    }
    if (canTacNghiep(c) || user.la_kho || user.la_ke_toan) {
      const gsSet = await phuTrachGsSet(c.env.DB, user.email);
      if (gsSet) {
        whereSql += ` AND ddh.email_gs IN (${[...gsSet].map(() => "?").join(",")})`;
        binds.push(...gsSet);
      }
    }
  }
  // "__OPEN__" (sentinel "con ton") - dung DUNG 2 dinh nghia "dong" da co san (xem GET /don-hang).
  const conTon = donConTonSql(loaiDon);
  // v1.450 (ra soat Trang chu): 1 lan quet bang thay vi 5 (4 COUNT con + 1 GROUP BY, moi cai lap lai ca WHERE pham vi) - truoc day
  // ~35.000 dong doc/lan, chay ~2.000 lan/ngay (badge menu tu tai lai 5 phut). Cac so tong suy tu dong GROUP BY.
  const { results } = await c.env.DB.prepare(
    `SELECT ddh.trang_thai_hien_tai as trang_thai, COUNT(*) as n,
       SUM(CASE WHEN ${conTon.sql} THEN 1 ELSE 0 END) as mo,
       SUM(CASE WHEN ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.ma_xuat_kho IS NULL THEN 1 ELSE 0 END) as cho_tao_pxk,
       SUM(CASE WHEN ${CHO_THANH_TOAN_GOP_SQL} THEN 1 ELSE 0 END) as cho_tt,
       SUM(CASE WHEN ${traHangTuHuySql("ddh")} THEN 1 ELSE 0 END) as tu_huy
     FROM dat_don_hang ddh WHERE ${whereSql} GROUP BY ddh.trang_thai_hien_tai`,
  )
    .bind(...conTon.binds, ...binds)
    .all<{ trang_thai: string; n: number; mo: number; cho_tao_pxk: number; cho_tt: number; tu_huy: number }>();
  const tong = (k: "n" | "mo" | "cho_tao_pxk" | "cho_tt" | "tu_huy") => results.reduce((x, r) => x + (r[k] ?? 0), 0);
  const counts: Record<string, number> = { "": tong("n"), __OPEN__: tong("mo"), __CHO_TAO_PXK__: tong("cho_tao_pxk") };
  for (const r of results) counts[r.trang_thai ?? ""] = r.n;
  // Don tra hang tu huy (cho Kho qua 10 ngay, v1.524): tach khoi "Cho kho xac nhan" -> tab rieng "Đơn tự hủy".
  counts.__TU_HUY_KHO__ = tong("tu_huy");
  if (counts["Cho kho xac nhan"] != null) counts["Cho kho xac nhan"] -= counts.__TU_HUY_KHO__;
  // 2 sentinel 2026-09-30: "Chờ tác nghiệp" (Cho TN duyet + tra hang Cho TN duyet tong - trang thai chi co o tra hang)
  // va "Hàng trả" chờ KT/Kho/QC (trang thai chi co o tra hang) - cong tu cac nhom tren, khop dung dieu kien loc.
  counts.__CHO_TN__ = (counts["Cho TN duyet"] ?? 0) + (counts["Cho TN duyet tong"] ?? 0);
  counts.__CHO_TT__ = tong("cho_tt");
  counts.__CHO_XAC_NHAN__ = (counts["Cho ke toan duyet mem"] ?? 0) + (counts["Cho kho xac nhan"] ?? 0) + (counts["Cho QC xac nhan"] ?? 0);
  return c.json({ counts });
});

// GET /api/dat-mua-lk/loai-don-counts - so dong DANG MO (chua xu ly xong) theo tung loai_don (mua/
// cong_no/tra_hang) - theo yeu cau bo sung sau ra soat: "3 nut filter Mua hang/Cong no/Tra hang thêm
// bộ đếm số lượng đơn theo từng thẻ", dung dung 1 SCOPE voi danh sach chinh (scopeDatMuaNguoiTao) de
// con so khop dung pham vi nguoi dang xem thay vi luon la toan he thong. "Dang mo" tai dung dung 2
// dinh nghia "dong" da co san trong code (DON_HANG_TRANG_THAI_DONG cho mua/cong_no, cung bo trang
// thai dong cua tra_hang.ts cho tra_hang), khong tu dat rieng 1 tieu chi moi.
//
// SUA (phan hoi QA 2026-08-31, "TN dang hien Tra hang (x2) mac du don can xu ly cua TN = 0") - cung 1
// loai bug voi muc #11 (GET /phieu-xuat-kho/mo-count): truoc day dem TAT CA dong dang mo trong pham
// vi nhin thay, bat ke da toi luot ai xu ly tiep - TN nhin thay ca dong dang o buoc Ke toan/Kho/QC (vi
// scopeDatMuaNguoiTao tra null = KHONG GIOI HAN cho TN/Kho/Ke toan/QC/TBP/Admin, ho thay TOAN BO). CHI
// ap dung loc theo luot vai tro (giong FORBIDDEN_ROLE cua applyDonHangLog/applyTraHangLog) khi scope
// la null (cac vai tro NHAN VIEN xem toan he thong) - KTV/Ve tinh/Giam sat/View van giu nguyen "dem
// het dong dang mo trong pham vi cua ho" (theo doi don CUA HO/nhom ho quan ly, khong phai "den luot
// xu ly", nen KHONG ap dung loc nay).
datMuaLinhKien.get("/loai-don-counts", async (c) => {
  const user = c.get("user");
  const scope = scopeDatMuaNguoiTao(c);
  const scopeSql = scope?.whereSql ?? "";
  const scopeBinds = scope?.binds ?? [];
  const donHangDongPlaceholders = DON_HANG_TRANG_THAI_DONG.map(() => "?").join(",");
  const traHangDongPlaceholders = TRA_HANG_TRANG_THAI_DONG_COUNTS.map(() => "?").join(",");

  let muaCongNoSql = `ddh.trang_thai_hien_tai NOT IN (${donHangDongPlaceholders})`;
  let muaCongNoBinds: unknown[] = [...DON_HANG_TRANG_THAI_DONG];
  let traHangSql = `ddh.trang_thai_hien_tai NOT IN (${traHangDongPlaceholders})`;
  let traHangBinds: unknown[] = [...TRA_HANG_TRANG_THAI_DONG_COUNTS];
  // KIEM TRA DONG BO TOAN HE THONG (2026-08-31, phan hoi "check lại toàn bộ hệ thống đã bổ sung filter
  // mặc định theo khu vực cho các vai trò chưa?") - 2 lop scope THEM cho TN/Kho/Ke toan/TBP/QC/Admin
  // (scope===null), CA HAI deu tuy chon (Set null = khong gioi han, giu "toan quoc" nhu truoc):
  // (1) Khu vuc dia ly cua chinh tai khoan (khuVucCuaToiSet, ANH HUONG CA badge lan list mac dinh -
  //     xac nhan nguoi dung "auto-chọn cho tất cả vai trò"); (2) "Khu vuc phu trach" = nhom GS
  //     (phuTrachGsSet, CHI anh huong badge/thong ke, KHONG anh huong list - CHOT 2026-08-15, dung
  //     LAI dung co che da ap dung cho GET /luong-quy-trinh). Ca 2 ket hop AND neu ca 2 cung duoc gan.
  let extraScopeSql = "";
  const extraScopeBinds: string[] = [];
  if (scope === null) {
    const khuVucSet = await khuVucCuaToiSet(c.env.DB, user);
    if (khuVucSet) {
      const { sql, binds } = khuVucSetWhereSql(khuVucSet, ["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]);
      extraScopeSql += sql;
      extraScopeBinds.push(...binds);
    }
    if (canTacNghiep(c) || user.la_kho || user.la_ke_toan) {
      const gsSet = await phuTrachGsSet(c.env.DB, user.email);
      if (gsSet) {
        extraScopeSql += ` AND ddh.email_gs IN (${[...gsSet].map(() => "?").join(",")})`;
        extraScopeBinds.push(...gsSet);
      }
    }

    const muaCongNoStates: string[] = [];
    if (canTPDvbhXacNhan(c)) muaCongNoStates.push("Cho TBP xac nhan");
    if (canTacNghiep(c)) muaCongNoStates.push("Cho TN duyet");
    const traHangStates: string[] = [];
    if (user.la_ke_toan || user.vai_tro === "Admin") traHangStates.push("Cho ke toan duyet mem");
    if (canKho(c)) traHangStates.push("Cho kho xac nhan");
    if (user.vai_tro === "QC" || user.vai_tro === "Admin") traHangStates.push("Cho QC xac nhan");
    if (canTacNghiep(c)) traHangStates.push("Cho TN duyet tong");

    muaCongNoSql = muaCongNoStates.length > 0 ? `ddh.trang_thai_hien_tai IN (${muaCongNoStates.map(() => "?").join(",")})` : "1=0";
    muaCongNoBinds = muaCongNoStates;
    traHangSql = traHangStates.length > 0 ? `ddh.trang_thai_hien_tai IN (${traHangStates.map(() => "?").join(",")})` : "1=0";
    traHangBinds = traHangStates;
  }

  // RA SOAT CHI PHI D1 2026-08-18 (phan hoi Codex #11, migration 0087+0088) - doc thang cot
  // trang_thai_hien_tai thay vi correlated subquery, xem giai thich o GET /luong-quy-trinh.
  const row = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'mua' AND ${muaCongNoSql}${scopeSql}${extraScopeSql}) as mua,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'cong_no' AND ${muaCongNoSql}${scopeSql}${extraScopeSql}) as cong_no,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ${traHangSql} AND NOT ${traHangTuHuySql("ddh")}${scopeSql}${extraScopeSql}) as tra_hang`,
  )
    .bind(
      ...muaCongNoBinds, ...scopeBinds, ...extraScopeBinds,
      ...muaCongNoBinds, ...scopeBinds, ...extraScopeBinds,
      ...traHangBinds, ...scopeBinds, ...extraScopeBinds,
    )
    .first<{ mua: number; cong_no: number; tra_hang: number }>();

  return c.json(row ?? { mua: 0, cong_no: 0, tra_hang: 0 });
});

// POST /api/dat-mua-lk/phieu-dat - { ghi_chu?, nguoi_nhan_hang?, don_hang: [{ ma_lk, loai_de_xuat,
// so_luong_de_xuat, ly_do_cham?, so_tien_cong_no? }] } - KTV/Tram/Ve tinh tao phieu + >=1 dong don
// hang trong 1 lan. "nguoi_nhan_hang" (Giai doan 4b, migration 0068) - chi TN/GS (canQuanLyDonHo)
// duoc chon nguoi khac; nguoc lai/khong truyen -> mac dinh chinh nguoi tao. email_gs tu dien tu
// giam_sat_quan_ly cua NGUOI NHAN HANG (khong phai nguoi tao - sua 2026-08-14: truoc day lay theo
// nguoi tao nen khi TN/GS tao ho, GS that su phu trach KTV do se khong theo doi duoc vi TN/GS
// thuong khong co giam_sat_quan_ly rieng). Trang thai dau tien cua TUNG DONG (khong phai ca phieu -
// xem comment dau file): "Cho Tram duyet" neu NGUOI TAO la Ve tinh (Tram phai duyet/day len truoc
// khi den TN), nguoc lai "Cho TN duyet" luon (KTV/Tram di thang TN, KHONG qua GS - chot
// 2026-08-13). Dong loai_don='tra_hang' KHONG nhan log o day - dung tra_hang_log rieng, mac dinh
// suy ngam "Cho ke toan duyet mem" khi chua co log nao (xem traHang.ts).
export interface PhieuDatBody {
  ghi_chu?: string;
  nguoi_nhan_hang?: string;
  // SDT KH le (migration 0074) - CHI khi nguoi nhan la tai khoan nhom KH le; bo trong = cap ma KH tu dong.
  kh_le_sdt?: string;
  // Ma chong tao trung (migration 0034) - xem nhanh kiem tra o POST /phieu-dat.
  client_request_id?: string;
  // v1.538: true = don can chuyen tien GOP vao phieu dang tao Ke toan DA duyet tien (giao 1 lan, KTV chuyen bo sung); mac dinh tach phieu moi.
  gop_phieu_da_du_tien?: boolean;
  don_hang: {
    // KHONG con nhan so_tien_cong_no tu client (them 04/09/2026) - server tu tinh gia_tri_cong_no x so_luong_de_xuat.
    ma_lk: string; loai_de_xuat: string; so_luong_de_xuat: number;
    ghi_chu?: string; yeu_cau_hoa_don?: string; tt_mail_duyet?: string; tt_khach_hang?: string;
    chinh_sach?: string; ma_yeu_cau_su_co?: string; ma_lada?: string; uu_tien?: boolean;
    // Anh linh kien can tra (CHI don tra hang, 1-3 anh) - da upload TRUOC qua POST /tra-hang/upload-anh.
    anh?: { driveFileId: string; url: string }[];
    // MUA HÀNG CÔNG NỢ ĐỐI TÁC (v1.403): Ma MISA doi tac ghi no (doi_tac_cong_no). KTV duoc phep (trung Ma MISA) bo trong = tu dien.
    doi_tac_ma?: string;
    // "Khách hàng đã chuyển khoản về công ty" (migration 0111) - CHI khi da chon 1 hinh thuc xuat hoa don; tien Ke toan xac nhan vao
    // "Quỹ KH chuyển khoản" cua nguoi nhan hang (khong vao quy du KTV), don chi tieu tien trong quy do.
    kh_chuyen_khoan?: boolean;
    // CÔNG NỢ SỬA CHỮA (v1.495): ma don bao hanh app Bao hanh doi tra ("DH-000123" / "DH-000123-1") - BAT BUOC voi loai nay.
    bh_don_vi_id?: string;
  }[];
}

type LkDongPhieu = {
  ma_linh_kien: string; ten_lk: string; gia_ban: number | null; dac_thu: number; gia_tri_cong_no: number | null; cam_ban: number | null;
  cho_phep_gia_0: number | null;
};

interface PhieuDatDaChuanBi {
  body: PhieuDatBody;
  nguoiNhanHang: string; // nguoi nhan da resolve (Ve tinh -> Tram); KH le: tai khoan NHOM (doi sang email KH luc ghi)
  nhomKhLe: Awaited<ReturnType<typeof nhomKhLeTheoEmail>>;
  sdtKhLe: string | null;
  emailGs: string | null;
  lkMap: Map<string, LkDongPhieu>;
  comboMaCuaDong: (string | null)[];
  gocCuaDong: number[]; // vi tri dong goc tren form (dong combo tach thanh nhieu don)
  danhGia: KetQuaPhieu;
}

// Chuan bi + danh gia 1 phieu dat - DUNG CHUNG cho POST /phieu-dat (tao that) va POST /phieu-dat/kiem-tra (form hoi truoc khi
// gui): validate, resolve nguoi nhan, tach combo, quy ma chuan, roi chay bo quyet dinh lib/tuDongDuyet.ts danhGiaPhieu() - KHONG ghi gi.
async function chuanBiPhieuDat(
  c: Context<{ Bindings: Env }>,
  body: PhieuDatBody,
  // false = kiem tra truoc tren form (POST /phieu-dat/kiem-tra): bo qua kiem tra thong tin chua dien xong (chinh sach, ma YCSC,
  // anh tra hang) - form tu chan rieng, chi can ket qua dinh tuyen tung dong.
  kiemTraThongTin = true,
): Promise<{ error: string; status: 400 | 403 | 409; extra?: Record<string, unknown> } | PhieuDatDaChuanBi> {
  if (!Array.isArray(body.don_hang) || body.don_hang.length === 0) return { error: "MISSING_DON_HANG", status: 400 };
  // Chan body khong lo (2026-10-08, danh gia bao mat) - form tao don thuc te vai chuc dong; nhieu hon dung Import Excel.
  if (body.don_hang.length > 300) return { error: "QUA_NHIEU_DONG", status: 400 };
  // Anh tra hang: CHI nhan link Drive do chinh /tra-hang/upload-anh tra ve (lib/anhUpload.ts laUrlAnhDrive).
  for (const dh of body.don_hang) {
    if ((dh.anh ?? []).some((a) => !laUrlAnhDrive(a?.url))) return { error: "ANH_KHONG_HOP_LE", status: 400, extra: { ma_lk: dh.ma_lk } };
  }
  // Combo linh kien (migration 0066): dong ma combo -> tung don LK thanh phan TRUOC moi kiem tra ben duoi.
  const tachDon = await tachComboDong(
    c.env.DB,
    body.don_hang,
    (dh) => dh?.ma_lk,
    (dh) => Number(dh?.so_luong_de_xuat),
    (dh, maLk, soLuong) => ({ ...dh, ma_lk: maLk, so_luong_de_xuat: soLuong }),
  );
  body.don_hang = tachDon.map((t) => t.dong);
  for (const dh of body.don_hang) {
    if (!dh.kh_chuyen_khoan) continue;
    // v1.521 (2026-11-18): BO dieu kien phai chon hinh thuc hoa don - KH chuyen khoan khong xuat hoa don van tich duoc (tinh gia niem yet).
    const lde = String(dh.loai_de_xuat ?? "");
    if (laMuaCongNoDoiTac(lde) || !(deriveLoaiDon(lde) === "mua" || laTruCongNo(lde))) {
      return { error: "KH_CHUYEN_KHOAN_CHI_DON_MUA", status: 400, extra: { ma_lk: dh.ma_lk } };
    }
  }

  const user = c.get("user");
  // Tat luong Ve tinh tao don (chot 2026-10-14).
  if (user.la_ve_tinh && !canQuanLyDonHo(c)) return { error: "VE_TINH_KHONG_TAO_DON", status: 403 };
  let targetUser: { email: string; la_ve_tinh: number | boolean };
  if (body.nguoi_nhan_hang?.trim() && body.nguoi_nhan_hang.trim() !== user.email) {
    if (!canQuanLyDonHo(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    const target = await nguoiNhanHangHopLe(c.env.DB, body.nguoi_nhan_hang.trim());
    if (!target) return { error: "NGUOI_NHAN_HANG_KHONG_HOP_LE", status: 400 };
    targetUser = target;
  } else {
    targetUser = { email: user.email, la_ve_tinh: user.la_ve_tinh };
  }
  const resolved = await resolveNguoiNhanHang(c.env.DB, targetUser);
  if ("error" in resolved) return { error: resolved.error, status: 400 };
  const nguoiNhanHang = resolved.email;
  if (await nguoiNhanChuaCoMaMisa(c.env.DB, nguoiNhanHang)) return { error: "KTV_CHUA_CO_MA_MISA", status: 409 };
  // Nguoi nhan la tai khoan NHOM KH le (migration 0074) -> don ghi cho 1 KH le rieng (tim theo SDT / ma tu dong), tao ho so KH
  // SAU khi kiem tra xong (POST). Moi kiem tra/danh gia dung tai khoan nhom (khu vuc ton kho cong ty, GS).
  const nhomKhLe = await nhomKhLeTheoEmail(c.env.DB, nguoiNhanHang);
  const sdtKhLe = nhomKhLe ? chuanHoaSdt(body.kh_le_sdt) : null;
  if (sdtKhLe === "sai") return { error: "SDT_KHONG_HOP_LE", status: 400 };
  // MUA HÀNG CÔNG NỢ ĐỐI TÁC (chot 2026-10-26, v1.403): chi TN (gom Ke toan) / GS / Admin dat cho moi doi tac; KTV CHI dat cho CHINH MINH khi
  // Ma MISA cua minh co trong danh sach doi tac ("trường hợp KTV mà có trong danh sách CÔNG NỢ ĐỐI TÁC (dựa vào mã misa) thì mới được đặt").
  // Ma doi tac quy ve dung cach viet trong danh sach; dong khong phai doi tac -> bo ma.
  if (body.don_hang.some((dh) => laMuaCongNoDoiTac(dh.loai_de_xuat))) {
    const moi = duocChonMoiDoiTac(user);
    const { results: dsDt } = await c.env.DB.prepare("SELECT ma_misa FROM doi_tac_cong_no WHERE bat_tat = 1").all<{ ma_misa: string }>();
    const theoMa = new Map(dsDt.map((r) => [r.ma_misa.toUpperCase(), r.ma_misa]));
    const cuaMinh = moi ? [] : (await maMisaCuaEmail(c.env.DB, user.email)).map((m) => theoMa.get(m.toUpperCase())).filter((m): m is string => !!m);
    for (const dh of body.don_hang) {
      if (!laMuaCongNoDoiTac(dh.loai_de_xuat)) {
        dh.doi_tac_ma = undefined;
        continue;
      }
      if (!moi) {
        if (cuaMinh.length === 0 || nguoiNhanHang !== user.email) return { error: "KHONG_DUOC_DAT_CONG_NO_DOI_TAC", status: 403 };
        if (!dh.doi_tac_ma?.trim()) dh.doi_tac_ma = cuaMinh[0];
        if (!cuaMinh.some((m) => m.toUpperCase() === dh.doi_tac_ma!.trim().toUpperCase())) return { error: "KHONG_DUOC_DAT_CONG_NO_DOI_TAC", status: 403 };
      }
      if (dh.doi_tac_ma?.trim()) dh.doi_tac_ma = theoMa.get(dh.doi_tac_ma.trim().toUpperCase()) ?? dh.doi_tac_ma.trim();
    }
  } else {
    for (const dh of body.don_hang) dh.doi_tac_ma = undefined;
  }
  // CÔNG NỢ SỬA CHỮA (chot 2026-11-16, v1.495): CHI dat cho nguoi nhan la "NV sửa chữa" (users.la_nv_sua_chua) - NV tu dat cho minh, TN /
  // GS / Admin dat ho. Moi dong BAT BUOC ma don bao hanh (de giai doan sau tu tru cong no theo xu ly xac). Dong loai khac -> bo ma.
  // v1.508: ap cho ca 3 loai cap linh kien sua chua (CÔNG NỢ / HỖ TRỢ SỬA CHỮA 0 ĐỒNG / MUA HÀNG SỬA CHỮA - laDonSuaChua).
  if (body.don_hang.some((dh) => laDonSuaChua(dh.loai_de_xuat))) {
    const nv = await c.env.DB.prepare("SELECT la_nv_sua_chua FROM users WHERE email = ?").bind(nguoiNhanHang).first<{ la_nv_sua_chua: number }>();
    if (!nv?.la_nv_sua_chua) return { error: "NGUOI_NHAN_KHONG_PHAI_NV_SUA_CHUA", status: 403 };
  }
  // v1.508 (app doi tra v1.142): "Đơn của đối tác Karofi => mặc định xuất sang đơn "HỖ TRỢ SỬA CHỮA 0 ĐỒNG" (nếu còn bảo hành), các đối tác khác
  // sẽ xuất "CÔNG NỢ SỬA CHỮA". Trường hợp hết bảo hành => "MUA HÀNG SỬA CHỮA"" - ma don bao hanh co tren app doi tra va du Hang / Doi tac /
  // bao hanh -> HE THONG chon loai (ghi de lua chon tren form); don nhap tay ngoai app / chua du thong tin -> giu loai nguoi dat chon.
  const bhCache = new Map<string, Awaited<ReturnType<typeof traDonBh>>>();
  for (const dh of body.don_hang) {
    if (!laDonSuaChua(dh.loai_de_xuat)) {
      dh.bh_don_vi_id = undefined;
      continue;
    }
    const ma = chuanMaDonBh(dh.bh_don_vi_id);
    if (ma) dh.bh_don_vi_id = ma;
    else if (kiemTraThongTin) return { error: dh.bh_don_vi_id?.trim() ? "MA_DON_BH_KHONG_HOP_LE" : "THIEU_MA_DON_BH", status: 400, extra: { ma_lk: dh.ma_lk } };
    else dh.bh_don_vi_id = undefined;
    if (ma && laMaDonBhApp(ma)) {
      if (!bhCache.has(ma)) bhCache.set(ma, await traDonBh(c.env, ma));
      const theoBh = loaiDeXuatTheoDonBh(bhCache.get(ma));
      if (theoBh && theoBh !== dh.loai_de_xuat.trim()) {
        dh.loai_de_xuat = theoBh;
        if (laMuaHangSuaChua(theoBh)) dh.chinh_sach = "Ngoài CSBH";
      }
    }
  }
  const recipientRow = await c.env.DB.prepare("SELECT giam_sat_quan_ly FROM users WHERE email = ?")
    .bind(nguoiNhanHang)
    .first<{ giam_sat_quan_ly: string | null }>();

  // Validate TOAN BO dong truoc khi cap BAT KY id nao (nextSequentialId commit ngay, khong rollback duoc - Codex #14).
  for (const dh of body.don_hang) {
    if (!dh.ma_lk?.trim() || !dh.loai_de_xuat?.trim() || !dh.so_luong_de_xuat || dh.so_luong_de_xuat <= 0)
      return { error: "INVALID_DON_HANG", status: 400 };
    if (loiGioiHan({ so_luong_de_xuat: dh.so_luong_de_xuat })) return { error: "SO_LUONG_QUA_LON", status: 400, extra: { ma_lk: dh.ma_lk, toi_da: SL_TOI_DA } };
    const lde = dh.loai_de_xuat.trim();
    if (!kiemTraThongTin) continue;
    if (canNoRequired(lde) && (!dh.chinh_sach?.trim() || !coMaIdLienQuan(dh.ma_yeu_cau_su_co, dh.ma_lada)))
      return { error: "THIEU_CHINH_SACH_HOAC_MA_YCSC", status: 400, extra: { ma_lk: dh.ma_lk } };
    if (!canNoRequired(lde) && maYcscRequired(lde) && !coMaIdLienQuan(dh.ma_yeu_cau_su_co, dh.ma_lada))
      return { error: "THIEU_MA_YCSC", status: 400, extra: { ma_lk: dh.ma_lk } };
    // Dong tra hang BAT BUOC 1-3 anh linh kien can tra (phan hoi 2026-08-24, muc 1).
    // TRẢ HÀNG CÔNG NỢ - SỬA CHỮA (tao tu app Bao hanh doi tra khi Admin BH xac nhan linh kien du) - khong bat anh.
    if (deriveLoaiDon(lde) === "tra_hang" && !laTraHangSuaChua(lde)) {
      const soAnh = dh.anh?.length ?? 0;
      if (soAnh < 1 || soAnh > 3) return { error: "THIEU_ANH_TRA_HANG", status: 400, extra: { ma_lk: dh.ma_lk } };
    }
  }

  // "Gia de xuat" = linh_kien.gia_ban (chot 2026-08-16). Ma LK da doi/gop -> quy ve ma chuan (migration 0053).
  const maChuanMap = await quyVeMaChuan(c.env.DB, body.don_hang.map((dh) => dh.ma_lk));
  for (const dh of body.don_hang) dh.ma_lk = maChuanMap.get(dh.ma_lk.trim()) ?? dh.ma_lk;
  const maLkList = [...new Set(body.don_hang.map((dh) => dh.ma_lk.trim()))];
  const { results: lkRows } = await c.env.DB.prepare(
    `SELECT ma_linh_kien, ten_linh_kien as ten_lk, gia_ban, dac_thu, gia_tri_cong_no, cam_ban, cho_phep_gia_0
     FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?))`,
  ).bind(JSON.stringify(maLkList)).all<LkDongPhieu>();
  const lkMap = new Map(lkRows.map((r) => [r.ma_linh_kien, r]));
  for (const dh of body.don_hang) {
    if (!lkMap.get(dh.ma_lk.trim())) return { error: "MA_LK_NOT_FOUND", status: 400, extra: { ma_lk: dh.ma_lk } };
  }

  // Bo quyet dinh dung chung (lib/tuDongDuyet.ts): chan / TBP / GS (vuot tran) / tu duyet / cho thanh toan / cho hang.
  const ctx = await nguCanhNhan(c.env.DB, nguoiNhanHang, user.email);
  const dongs: DongDanhGia[] = body.don_hang.map((dh) => {
    const lk = lkMap.get(dh.ma_lk.trim())!;
    return {
      ma_lk: dh.ma_lk.trim(), loai_de_xuat: dh.loai_de_xuat.trim(), so_luong: dh.so_luong_de_xuat, gia_ban: lk.gia_ban, dac_thu: lk.dac_thu,
      cho_phep_gia_0: lk.cho_phep_gia_0, gia_tri_cong_no: lk.gia_tri_cong_no, doi_tac_ma: dh.doi_tac_ma ?? null,
    };
  });
  const danhGia = await danhGiaPhieu(c.env.DB, ctx, dongs);

  return {
    body, nguoiNhanHang, nhomKhLe, sdtKhLe, emailGs: recipientRow?.giam_sat_quan_ly ?? null, lkMap,
    comboMaCuaDong: tachDon.map((t) => t.comboMa), gocCuaDong: tachDon.map((t) => t.goc), danhGia,
  };
}

// Ghi chu log khoi tao theo ket qua danh gia (giai thich vi sao don di nhanh do).
// SUA 2026-10-15 ("minh bạch cho mọi thao tác xử lý cho người đặt hàng hiểu"): MOI trang thai khoi tao deu co ly do (truoc chi 3
// trang thai) - FE LyDoTrangThaiDon doc dong log nay de giai thich cho nguoi dat.
function ghiChuKhoiTao(kq: KetQuaDong, soLuong: number, phieu: KetQuaPhieu): string | null {
  const goc = ghiChuKhoiTaoGoc(kq, soLuong, phieu);
  // LK B2B (2026-10-27): ghi ro ly do khong xet tran cong no.
  const them = kq.boQuaTranSuaChua
    ? "Công nợ sửa chữa — không xét trần công nợ"
    : kq.boQuaTranB2b ? "Linh kiện B2B — bỏ qua duyệt trần công nợ" : kq.boQuaTranKtv ? "KTV không có trần công nợ — bỏ qua duyệt trần" : "";
  if (!them) return goc;
  return goc ? `${goc} | ${them}` : them;
}
function ghiChuKhoiTaoGoc(kq: KetQuaDong, soLuong: number, phieu: KetQuaPhieu): string | null {
  const tien = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
  const vuotTran = kq.danhGiaCongNo === "Khong du"
    ? `vượt trần công nợ: công nợ chốt ${tien(phieu.congNoChot)} + đơn mới ${tien(phieu.tongMoiCongNo)} > trần ${tien(phieu.tranCongNo ?? 0)}`
    : "";
  const ton = kq.nguonTon === "ktv"
    ? `tồn kho công nợ của KTV còn ${Math.max(0, kq.ton ?? 0)}, đặt ${soLuong}`
    : moTaThieuTon(kq.ton, soLuong, phieu.khuVuc);
  switch (kq.trangThai) {
    case "TN da duyet":
      return `Tự động duyệt: ${ton} — đủ hàng${kq.batBuocChuyenTien ? ", vào phiếu chờ chuyển tiền" : kq.laDoiTac ? ", vào phiếu công nợ đối tác (không cần chuyển tiền)" : ", vào phiếu xuất kho"}`;
    case "Cho thanh toan":
      return `Tự động: ${ton} — thiếu hàng, cần chuyển tiền trước`;
    case "Cho hang":
      return `Tự động: ${ton} — thiếu hàng, chờ hàng`;
    case "Cho GS duyet": {
      const ly = kq.ghiChuDoiTac ?? vuotTran;
      return `${ly.charAt(0).toUpperCase()}${ly.slice(1)} — chờ Giám sát khu vực duyệt (nhập mã EO)`;
    }
    case "Cho TBP xac nhan":
      return `Linh kiện đặc thù — chờ TBP DVBH xác nhận${vuotTran ? ` (${vuotTran}: TBP duyệt phải nhập mã EO)` : ""}`;
    default:
      return null;
  }
}

// POST /api/dat-mua-lk/phieu-dat/kiem-tra - CUNG body voi POST /phieu-dat, KHONG ghi gi (chot 2026-10-14): form tao don hoi truoc
// ket qua tung dong (tu duyet / cho hang / cho thanh toan / cho GS / cho TBP / bi chan + ly do) de canh bao + hoi KTV truoc khi gui.
// Loi cap phieu (nguoi nhan khong hop le, chua co ma MISA...) tra 200 { loi_phieu } de form hien canh bao, khong nem loi.
// GET /api/dat-mua-lk/don-bh-goi-y?nguoi_nhan_hang=&q= (v1.496) - goi y "Mã đơn bảo hành" cho don CÔNG NỢ SỬA CHỮA tu app Bao hanh doi tra:
// khong co q = don vi NV nhan hang dang sua; q >= 2 ky tu = tim moi don vi theo ma / ma case. ket_noi=false khi app kia khong tra loi.
datMuaLinhKien.get("/don-bh-goi-y", async (c) => {
  const user = c.get("user");
  if (!canCreatePhieuDat(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const nhan = (c.req.query("nguoi_nhan_hang") ?? "").trim() || user.email;
  // Chi TN / GS / Admin xem goi y cua nguoi khac (dat ho); con lai luon la chinh minh.
  const email = nhan !== user.email && !canQuanLyDonHo(c) ? user.email : nhan;
  const rows = await goiYDonBh(c.env, email, c.req.query("q") ?? "");
  return c.json({ rows: rows ?? [], ket_noi: rows !== null });
});

datMuaLinhKien.post("/phieu-dat/kiem-tra", async (c) => kiemTraPhieuDat(c, await c.req.json<PhieuDatBody>()));

// Than POST /phieu-dat/kiem-tra - export de API doi tac (routes/partnerApi.ts POST /v1/dat-hang/kiem-tra) dung CHUNG (c.get("user") =
// tai khoan dat hang gan voi API key).
export async function kiemTraPhieuDat(c: Context<{ Bindings: Env }>, body: PhieuDatBody): Promise<Response> {
  if (!canCreatePhieuDat(c)) return c.json({ loi_phieu: "FORBIDDEN_ROLE", dong: [] });
  const kq = await chuanBiPhieuDat(c, body, false);
  if ("error" in kq) return c.json({ loi_phieu: kq.error, dong: [], ...(kq.extra ?? {}) });
  const ds = kq.danhGia;
  const thayThe = await goiYThayTheThieuHang(c.env.DB, ds.khuVuc, kq.body.don_hang, ds.dong, kq.comboMaCuaDong);
  // Ton kho mien con lai (v1.488) - chi GS / TN (gom Ke toan) / Admin dat ho moi can, KTV tu dat khong doi duoc khu vuc xu ly.
  const mienKhac = canQuanLyDonHo(c) ? await tonKhoMienKhac(c.env.DB, ds.khuVuc, kq.body.don_hang, ds.dong, kq.comboMaCuaDong) : null;
  const phieuDaDuTien = kq.nhomKhLe ? [] : await phieuDaDuTienCoTheGop(c.env.DB, kq.nguoiNhanHang, kq.body.don_hang, ds.dong);
  return c.json({
    loi_phieu: null,
    phieu_da_du_tien: phieuDaDuTien,
    khu_vuc: ds.khuVuc,
    danh_gia_cong_no: ds.danhGiaCongNo,
    cong_no_chot: ds.congNoChot,
    tong_moi_cong_no: ds.tongMoiCongNo,
    tran_cong_no: ds.tranCongNo,
    dong: ds.dong.map((d, i) => ({
      goc: kq.gocCuaDong[i],
      ma_lk: kq.body.don_hang[i].ma_lk,
      so_luong: kq.body.don_hang[i].so_luong_de_xuat,
      combo_ma: kq.comboMaCuaDong[i],
      trang_thai: d.trangThai,
      loi: d.loi?.ma ?? null,
      thong_diep: d.loi?.thongDiep ?? null,
      ton: d.ton,
      nguon_ton: d.nguonTon,
      bat_buoc_chuyen_tien: d.batBuocChuyenTien,
      thay_the: thayThe.get(i) ?? [],
      // null = khong kiem (dong du hang / nguoi dat khong phai GS-TN); [] = da kiem, mien con lai cung het hang.
      ton_mien_khac: mienKhac ? mienKhac.get(i) ?? null : null,
    })),
  });
}

// PHIEU DA DU TIEN CO THE GOP (v1.538, chot 2026-11-20 - "thêm lựa chọn cho người tạo (có muốn tách thành phiếu chờ chuyển/ phiếu đã có đủ tiền
// không - vì có ktv muốn được chuyển về trong cùng 1 lần)"). Mac dinh bundleAutoApprovedIntoPxk KHONG gop don moi vao phieu dang tao Ke toan DA
// duyet tien (tao phieu moi cho chuyen tien). Tra danh sach phieu "Dang tao phieu" Ke toan da duyet tien (chua Ma MISA, khong cho hang / doi tac /
// khu vuc chon) CUNG nhom phieu voi it nhat 1 dong se vao phieu co tien (cung dieu kien gomMotNhom khi gop_phieu_da_du_tien) -> form hoi nguoi tao.
async function phieuDaDuTienCoTheGop(
  db: D1Database,
  nguoiNhanHang: string,
  dongs: PhieuDatDaChuanBi["body"]["don_hang"],
  ketQua: PhieuDatDaChuanBi["danhGia"]["dong"],
): Promise<{ id: string; loai_don: string; tong: number; da_thanh_toan: number; so_don: number; dong: number[] }[]> {
  const nhom = new Map<string, { loaiDon: string; dong: number[] }>();
  ketQua.forEach((k, i) => {
    if (k.loi || !k.batBuocChuyenTien || k.trangThai === "Cho thanh toan" || (k.loaiDon !== "mua" && k.loaiDon !== "cong_no") || dongs[i].doi_tac_ma) return;
    const key = JSON.stringify([k.loaiDon, nhomPhieu({ loai_de_xuat: dongs[i].loai_de_xuat, yeu_cau_hoa_don: dongs[i].yeu_cau_hoa_don, kh_chuyen_khoan: dongs[i].kh_chuyen_khoan })]);
    if (!nhom.has(key)) nhom.set(key, { loaiDon: k.loaiDon, dong: [] });
    nhom.get(key)!.dong.push(i);
  });
  const out: { id: string; loai_don: string; tong: number; da_thanh_toan: number; so_don: number; dong: number[] }[] = [];
  for (const [key, g] of nhom) {
    const nhomLde = JSON.parse(key)[1] as string;
    const quyKh = nhomLde.split("|")[2] === "1" ? 1 : 0;
    const p = await db
      .prepare(
        `SELECT id, COALESCE(so_tien_can_chuyen, 0) AS tong, COALESCE(da_thanh_toan, 0) AS da_thanh_toan,
           (SELECT COUNT(*) FROM phieu_xuat_kho_dong x WHERE x.phieu_xuat_kho_id = phieu_xuat_kho.id) AS so_don
         FROM phieu_xuat_kho
         WHERE nguoi_nhan_hang = ? AND loai_don = ? AND trang_thai_hien_tai = 'Dang tao phieu' AND trang_thai_chuyen_tien = 'TN da duyet'
           AND COALESCE(TRIM(ma_misa), '') = '' AND khu_vuc_chon IS NULL AND doi_tac_ma IS NULL
           AND COALESCE(quy_kh, 0) = ? AND COALESCE(cho_hang, 0) = 0 AND ${phieuCungNhomSql("phieu_xuat_kho.id", "?")}
         ORDER BY ngay_tao DESC LIMIT 1`,
      )
      .bind(nguoiNhanHang, g.loaiDon, quyKh, nhomLde)
      .first<{ id: string; tong: number; da_thanh_toan: number; so_don: number }>();
    if (!p) continue;
    out.push({ id: p.id, loai_don: g.loaiDon, tong: p.tong, da_thanh_toan: p.da_thanh_toan, so_don: p.so_don, dong: g.dong });
  }
  return out;
}

// TON KHO MIEN CON LAI KHI KHU VUC CUA DON THIEU HANG (chot 2026-11-13, v1.488 - "khi GS, TN, tạo đơn hộ KTV nếu khu vực của KTV không có hàng, check
// luôn tồn kho tại khu vực miền còn lại và hiện cảnh báo đồng thời. nếu kv khác còn hàng thì hiện đề xuất khu vực còn hàng (có thể đổi lại khu vực sau
// khi xin đề xuất đặt hàng trái miền)"). "Mien con lai" = khu vuc dang bat co bo kho cong ty dang bat KHONG chung kho nao voi khu vuc cua don (MB <-> MN;
// khong dua vao ten ma). Ton moi (khu vuc, ma) = CUNG cong thuc computeTonKhoChot (ton goc kho cua khu vuc - don dang giu cua chinh khu vuc do sau moc
// import) -> dung la so ma xetLaiTonKhiDoiKhuVuc dung khi doi "Khu vuc xu ly" cua don sang khu vuc do. 1 truy van cho moi dong thieu. Chi dong lay ton
// kho cong ty dang thieu (cung dieu kien goiYThayTheThieuHang). Tra Map dong -> [{khu_vuc, ten, ton}] (ton > 0, nhieu truoc; rong = mien kia cung het).
async function tonKhoMienKhac(
  db: D1Database,
  khuVuc: string,
  dongs: PhieuDatDaChuanBi["body"]["don_hang"],
  ketQua: PhieuDatDaChuanBi["danhGia"]["dong"],
  comboMa: (string | null)[],
): Promise<Map<number, { khu_vuc: string; ten: string | null; ton: number }[]>> {
  const out = new Map<number, { khu_vuc: string; ten: string | null; ton: number }[]>();
  const thieu = ketQua
    .map((k, i) => ({ k, i }))
    .filter(({ k, i }) => !k.loi && !comboMa[i] && k.nguonTon === "kho" && (k.ton ?? 0) < Number(dongs[i].so_luong_de_xuat)
      && ["Cho hang", "Cho thanh toan", "Cho GS duyet", "Cho TBP xac nhan"].includes(k.trangThai ?? ""));
  if (!thieu.length || !khuVuc) return out;
  const maThieu = [...new Set(thieu.map(({ i }) => dongs[i].ma_lk))];
  const moc = await getMocTonKhoCongTy(db);
  const { results } = await db
    .prepare(
      `SELECT kv.ma AS khu_vuc, kv.ten, m.value AS ma_lk,
         (SELECT COALESCE(SUM(t.cuoi_ky), 0) FROM kho_cong_ty_ton_kho t JOIN kho_cong_ty k ON k.ma = t.kho_ma
            JOIN kho_cong_ty_khu_vuc x ON x.kho_ma = k.ma WHERE k.bat_tat = 1 AND x.khu_vuc_ma = kv.ma AND t.ma_hang = m.value)
         - (SELECT COALESCE(SUM(d.so_luong_de_xuat), 0) FROM dat_don_hang d
            WHERE d.ma_lk = m.value AND COALESCE(d.khu_vuc_chon, d.khu_vuc_ma) = kv.ma AND d.loai_don IN ('mua', 'cong_no')
              AND instr(COALESCE(d.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') = 0 AND d.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')
              AND (?2 IS NULL OR d.ngay_tao > ?2)) AS ton
       FROM khu_vuc kv, json_each(?1) m
       WHERE kv.ma != ?3 AND COALESCE(kv.bat_tat, 1) = 1
         AND EXISTS (SELECT 1 FROM kho_cong_ty_khu_vuc a JOIN kho_cong_ty ka ON ka.ma = a.kho_ma WHERE ka.bat_tat = 1 AND a.khu_vuc_ma = kv.ma)
         AND NOT EXISTS (SELECT 1 FROM kho_cong_ty_khu_vuc a JOIN kho_cong_ty ka ON ka.ma = a.kho_ma AND ka.bat_tat = 1
                         JOIN kho_cong_ty_khu_vuc b ON b.kho_ma = a.kho_ma WHERE a.khu_vuc_ma = kv.ma AND b.khu_vuc_ma = ?3)
       ORDER BY kv.stt, kv.ma`,
    )
    .bind(JSON.stringify(maThieu), moc, khuVuc)
    .all<{ khu_vuc: string; ten: string | null; ma_lk: string; ton: number }>();
  for (const { i } of thieu) {
    const ma = dongs[i].ma_lk;
    out.set(i, results.filter((r) => r.ma_lk === ma && r.ton > 0)
      .map((r) => ({ khu_vuc: r.khu_vuc, ten: r.ten, ton: r.ton }))
      .sort((a, b) => b.ton - a.ton)
      .slice(0, 5));
  }
  return out;
}

// GOI Y LK TUONG DUONG CON HANG cho dong thieu hang (chot 2026-11-01, v1.430 - "linh kiện họ đặt thiếu hàng và có mã tương đương đủ hàng,
// hiện 1 nhắc nhở ... đưa ra các đề xuất cho người dùng chọn"). Chi dong lay ton kho CONG TY (nguon_ton 'kho', khong combo, khong loi) dang
// thieu (Cho hang / Cho thanh toan): ma cung nhom lk_nhom_thay_the_ct, dang bat trong danh muc (khong 'Da doi ma', khong Only sua chua), ton
// chot CUNG khu vuc cua don (computeTonKhoChot - cung cong thuc danhGiaPhieu) TRU SL cac dong khac trong phieu da dat chinh ma do. Chi tra ma
// con ton > 0, nhieu ton truoc, toi da 5 ma. FE (GoiYThayTheThieuHang.tsx) tu dung cac phuong an chia SL.
async function goiYThayTheThieuHang(
  db: D1Database,
  khuVuc: string,
  dongs: PhieuDatDaChuanBi["body"]["don_hang"],
  ketQua: PhieuDatDaChuanBi["danhGia"]["dong"],
  comboMa: (string | null)[],
): Promise<Map<number, { ma_lk: string; ten_lk: string; gia_ban: number | null; ton: number }[]>> {
  const out = new Map<number, { ma_lk: string; ten_lk: string; gia_ban: number | null; ton: number }[]>();
  const thieu = ketQua
    .map((k, i) => ({ k, i }))
    // + don "Cho GS duyet" / "Cho TBP xac nhan" ma kho thieu (v1.455): duyet xong van ket o thieu hang -> goi y luon.
    .filter(({ k, i }) => !k.loi && !comboMa[i] && k.nguonTon === "kho" && (k.trangThai === "Cho hang" || k.trangThai === "Cho thanh toan"
      || ((k.trangThai === "Cho GS duyet" || k.trangThai === "Cho TBP xac nhan") && (k.ton ?? 0) < dongs[i].so_luong_de_xuat)));
  if (!thieu.length || !khuVuc) return out;
  const maThieu = [...new Set(thieu.map(({ i }) => dongs[i].ma_lk))];
  const { results } = await db
    .prepare(
      `SELECT DISTINCT ct.ma_lk AS goc, dm.ma_linh_kien, dm.ten_linh_kien, dm.gia_ban
       FROM lk_nhom_thay_the_ct ct
       JOIN lk_nhom_thay_the_ct ct2 ON ct2.nhom_id = ct.nhom_id AND ct2.ma_lk <> ct.ma_lk
       JOIN linh_kien dm ON dm.ma_linh_kien = ct2.ma_lk
       WHERE ct.ma_lk IN (SELECT value FROM json_each(?))
         AND dm.bat_tat = 1 AND COALESCE(dm.trang_thai_ma, '') <> 'Da doi ma' AND COALESCE(dm.chi_sua_chua, 0) = 0`,
    )
    .bind(JSON.stringify(maThieu))
    .all<{ goc: string; ma_linh_kien: string; ten_linh_kien: string; gia_ban: number | null }>();
  if (!results.length) return out;
  // SL cac dong trong phieu dang lay ton kho cong ty theo tung ma (dong khong loi) - dong dang xet KHONG dung ma thay the nen tru het.
  const daDat = new Map<string, number>();
  ketQua.forEach((k, i) => {
    if (!k.loi && k.nguonTon === "kho") daDat.set(dongs[i].ma_lk, (daDat.get(dongs[i].ma_lk) ?? 0) + Number(dongs[i].so_luong_de_xuat));
  });
  const tonCache = new Map<string, number>();
  for (const ma of new Set(results.map((r) => r.ma_linh_kien)).values()) {
    tonCache.set(ma, (await computeTonKhoChot(db, khuVuc, ma)) - (daDat.get(ma) ?? 0));
  }
  for (const { i } of thieu) {
    const ma = dongs[i].ma_lk;
    const ds = results
      .filter((r) => r.goc === ma)
      .map((r) => ({ ma_lk: r.ma_linh_kien, ten_lk: r.ten_linh_kien, gia_ban: r.gia_ban, ton: tonCache.get(r.ma_linh_kien) ?? 0 }))
      .filter((r) => r.ton > 0)
      .sort((a, b) => b.ton - a.ton || a.ma_lk.localeCompare(b.ma_lk))
      .slice(0, 5);
    if (ds.length) out.set(i, ds);
  }
  return out;
}

datMuaLinhKien.post("/phieu-dat", async (c) => taoPhieuDat(c, await c.req.json<PhieuDatBody>()));

// Than POST /phieu-dat - export de API doi tac (routes/partnerApi.ts POST /v1/dat-hang) tao don bang CUNG logic (gia, chiet khau, ton kho,
// tran cong no, tu duyet, gom phieu, thong bao). opts.partnerKeyId -> ghi phieu_dat.partner_key_id (migration 0114) de doi tac tra cuu lai.
export async function taoPhieuDat(c: Context<{ Bindings: Env }>, bodyGoc: PhieuDatBody, opts: { partnerKeyId?: number; tuSuaChua?: boolean } = {}): Promise<Response> {
  if (!canCreatePhieuDat(c)) return c.json({ error: c.get("user").la_ve_tinh ? "VE_TINH_KHONG_TAO_DON" : "FORBIDDEN_ROLE" }, 403);
  // 2026-11-16: 2 loai tru cong no / tra hang SỬA CHỮA chi tao qua API app Bao hanh doi tra (Admin BH xac nhan tieu hao).
  if (!opts.tuSuaChua && (bodyGoc.don_hang ?? []).some((d) => laTruCongNoSuaChua(d.loai_de_xuat) || laTraHangSuaChua(d.loai_de_xuat)))
    return c.json({ error: "LOAI_CHI_TAO_TU_APP_DOI_TRA" }, 403);
  const user = c.get("user");
  // FIX 2026-09-28 (bug "KTV tao 1 don, he thong hien 5 don giong het"): lan bam truoc da luu thanh cong nhung phan hoi khong ve
  // toi may -> KTV bam lai. Gap lai ma cu -> tra ve phieu da tao, KHONG tao them.
  const clientRequestId = bodyGoc.client_request_id?.trim().slice(0, 64) || null;
  const phieuDaTao = async () =>
    clientRequestId
      ? await c.env.DB.prepare("SELECT id FROM phieu_dat WHERE client_request_id = ? AND nguoi_tao = ?")
          .bind(clientRequestId, user.email)
          .first<{ id: string }>()
      : null;
  const trungTruoc = await phieuDaTao();
  if (trungTruoc) return c.json({ id: trungTruoc.id, trung_lap: true }, 200);

  const kq = await chuanBiPhieuDat(c, bodyGoc);
  if ("error" in kq) return c.json({ error: kq.error, ...(kq.extra ?? {}) }, kq.status);
  const { body, nhomKhLe, sdtKhLe, lkMap, comboMaCuaDong, danhGia } = kq;
  // Dong bi chan (TRỪ CÔNG NỢ thieu ton KTV, gia 0, cong no khi chua co ma MISA) -> khong tao gi, tra ly do tung dong.
  if (danhGia.coLoi) {
    const loi = danhGia.dong.filter((d) => d.loi).map((d) => d.loi!);
    return c.json({ error: loi[0].ma, message: loi.map((l) => l.thongDiep).join(" · "), loi }, 409);
  }

  let nguoiNhanHang = kq.nguoiNhanHang;
  const khLe = nhomKhLe ? await timHoacTaoKhachLe(c.env.DB, nhomKhLe, sdtKhLe, user.email) : null;
  if (khLe) nguoiNhanHang = khLe.email;

  const now = nowVN();
  const phieuDatId = await nextSequentialId(c.env.DB, "phieu_dat", phieuDatPrefix(c), 6);
  const statements = [
    c.env.DB.prepare("INSERT INTO phieu_dat (id, nguoi_tao, ngay_tao, email_gs, ghi_chu, nguoi_nhan_hang, updated_at, client_request_id, partner_key_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      phieuDatId, user.email, now, kq.emailGs, body.ghi_chu?.trim() || null, nguoiNhanHang, now, clientRequestId, opts.partnerKeyId ?? null,
    ),
  ];

  // Bao "viec moi" cho vai tro xu ly buoc DAU TIEN cua tung dong - chi ban sau khi batch() thanh cong.
  const notifyQueue: { donHangId: string; trangThai: string; tenLkNoiDung: string; lyDo: string | null }[] = [];
  // Dong vao phieu ngay: tu duyet + don co tien (KTV chuyen tien truoc - ke ca "Cho thanh toan").
  const vaoPhieu: Record<"mua" | "cong_no", { donHangId: string; soTien: number }[]> = { mua: [], cong_no: [] };

  // CÔNG NỢ SỬA CHỮA (v1.496): ma don bao hanh co tren app Bao hanh doi tra -> bh_lien_ket = 1 (giai doan tu tru cong no chi tu dong voi don
  // lien ket). Ma go tay ngoai app / khong ket noi duoc -> 0, KHONG chan dat hang.
  const lienKetBh = new Map<string, boolean>();
  for (const ma of new Set(body.don_hang.map((dh) => dh.bh_don_vi_id).filter((m): m is string => !!m && laMaDonBhApp(m)))) {
    lienKetBh.set(ma, !!(await traDonBh(c.env, ma)));
  }
  for (const [i, dh] of body.don_hang.entries()) {
    const lde = dh.loai_de_xuat.trim();
    const kqDong = danhGia.dong[i];
    const loai_don = kqDong.loaiDon;
    const lk = lkMap.get(dh.ma_lk.trim())!;
    const donHangId = await nextSequentialId(c.env.DB, "dat_don_hang", "DDH", 6);
    const trangThaiKhoiTao = kqDong.trangThai;
    if ((trangThaiKhoiTao === "TN da duyet" || kqDong.batBuocChuyenTien) && (loai_don === "mua" || loai_don === "cong_no")) {
      vaoPhieu[loai_don].push({ donHangId, soTien: (lk.gia_ban ?? 0) * dh.so_luong_de_xuat });
    }
    const ghiChuLog = ghiChuKhoiTao(kqDong, dh.so_luong_de_xuat, danhGia);
    notifyQueue.push({ donHangId, trangThai: trangThaiKhoiTao, tenLkNoiDung: `"${lk.ten_lk} (x${dh.so_luong_de_xuat})"`, lyDo: ghiChuLog });
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO dat_don_hang
           (id, phieu_dat_id, loai_don, ma_lk, ten_lk_snapshot, loai_de_xuat, so_luong_de_xuat, gia_de_xuat,
            so_tien_cong_no, danh_gia_cong_no, ghi_chu, yeu_cau_hoa_don, tt_mail_duyet, tt_khach_hang, chinh_sach, ma_yeu_cau_su_co, ma_lada,
            nguoi_tao, ngay_tao, updated_at, email_gs, nguoi_nhan_hang, uu_tien, trang_thai_hien_tai, bat_buoc_chuyen_tien, combo_ma, doi_tac_ma,
            kh_chuyen_khoan, bh_don_vi_id, bh_lien_ket)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        donHangId, phieuDatId, loai_don, dh.ma_lk.trim(), lk.ten_lk, lde, dh.so_luong_de_xuat, lk.gia_ban,
        kqDong.soTienCongNo, kqDong.danhGiaCongNo,
        dh.ghi_chu?.trim() || null, dh.yeu_cau_hoa_don?.trim() || null, dh.tt_mail_duyet?.trim() || null, dh.tt_khach_hang?.trim() || null,
        dh.chinh_sach?.trim() || chinhSachMacDinh(lde), dh.ma_yeu_cau_su_co?.trim() || null, dh.ma_lada?.trim().toUpperCase() || null,
        user.email, now, now, kq.emailGs, nguoiNhanHang, dh.uu_tien ? 1 : 0, trangThaiKhoiTao, kqDong.batBuocChuyenTien ? 1 : 0,
        comboMaCuaDong[i] ?? null, dh.doi_tac_ma ?? null, dh.kh_chuyen_khoan ? 1 : 0, dh.bh_don_vi_id ?? null,
        dh.bh_don_vi_id && lienKetBh.get(dh.bh_don_vi_id) ? 1 : 0,
      ),
    );
    if (loai_don !== "tra_hang") {
      // tu_dong = 1: "Tự động duyệt đơn" (he thong tu duyet luc tao) - tach khoi "TN đã duyệt" o Lich su xu ly (migration 0037).
      statements.push(
        c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong) VALUES (?, ?, ?, ?, ?, ?)").bind(
          donHangId, trangThaiKhoiTao, user.email, now, ghiChuLog, trangThaiKhoiTao === "TN da duyet" ? 1 : 0,
        ),
      );
    } else {
      // Gan anh linh kien can tra vao dong VUA sinh (migration 0003_tra_hang_anh.sql).
      for (const a of dh.anh ?? []) {
        statements.push(
          c.env.DB.prepare("INSERT INTO tra_hang_anh (dat_don_hang_id, loai, drive_file_id, url, nguoi_upload) VALUES (?, 'tao_moi', ?, ?, ?)").bind(
            donHangId, a.driveFileId, a.url, user.email,
          ),
        );
      }
    }
  }

  try {
    await c.env.DB.batch(statements);
  } catch (err) {
    // 2 request cung ma chay song song: batch thu 2 vuong unique index (migration 0034) -> rollback ca batch -> tra phieu thang.
    const trungSau = await phieuDaTao();
    if (trungSau) return c.json({ id: trungSau.id, trung_lap: true }, 200);
    throw err;
  }
  // Gom dong tu duyet / can chuyen tien vao 1 PXK ngay (dong bo, TRUOC khi tra ve - mo lai chi tiet thay du lieu nhat quan).
  for (const loaiDon of ["mua", "cong_no"] as const) {
    if (vaoPhieu[loaiDon].length > 0) {
      await bundleAutoApprovedIntoPxk(c.env, c.env.DB, user.email, nguoiNhanHang, loaiDon, vaoPhieu[loaiDon], { gopPhieuDaDuTien: bodyGoc.gop_phieu_da_du_tien === true });
    }
  }
  // Dong thieu hang khong tien -> mo ticket cho hang (Kho xac nhan / tu choi). Nguoi tao ticket = nguoi tao don.
  const waitUntil = (p: Promise<unknown>) => c.executionCtx.waitUntil(p);
  for (const item of notifyQueue) {
    if (item.trangThai === "Cho hang") await moTicketChoHangTuDong(c.env, c.env.DB, item.donHangId, user.email, item.lyDo ?? "Kho công ty không đủ hàng", waitUntil);
  }
  // Chiet khau tinh theo TONG don trong ngay cua KTV (chot 2026-09-28) - don moi -> tinh lai moi PXK "Dang tao phieu" cua KTV.
  await taiTinhPxkMoCuaKtv(c.env.DB, nguoiNhanHang, user.email);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  const emailGsList = kq.emailGs ? [kq.emailGs] : [];
  for (const item of notifyQueue) {
    if (item.trangThai === "Cho TBP xac nhan") {
      c.executionCtx.waitUntil(
        (async () => {
          await notifyWorkflowTask(c.env, c.env.DB, {
            cat1Emails: await emailsForRoleOrQC(c.env.DB, "la_tp_dvbh", emailGsList),
            otherRoles: MUA_CONG_NO_ROLES.filter((r) => r !== "la_tp_dvbh"),
            emailGsList,
            pastActors: [],
            title: "Đặt mua linh kiện",
            body: `Đơn ${item.tenLkNoiDung} cần bạn xác nhận linh kiện đặc thù`,
            linkType: "don_hang",
            linkId: item.donHangId,
          });
        })(),
      );
    } else if (item.trangThai === "Cho GS duyet") {
      c.executionCtx.waitUntil(baoGsChoDuyet(c.env, c.env.DB, item.donHangId));
    } else if (item.trangThai === "Cho ke toan duyet mem") {
      c.executionCtx.waitUntil(
        (async () => {
          await notifyWorkflowTask(c.env, c.env.DB, {
            cat1Emails: await emailsForRoleOrQC(c.env.DB, "la_ke_toan", emailGsList),
            otherRoles: TRA_HANG_ROLES.filter((r) => r !== "la_ke_toan"),
            emailGsList,
            pastActors: [],
            title: "Trả hàng",
            body: `Đơn trả hàng ${item.tenLkNoiDung} đang chờ bạn duyệt`,
            linkType: "don_hang",
            linkId: item.donHangId,
          });
        })(),
      );
    }
  }
  const demTrangThai: Record<string, number> = {};
  for (const item of notifyQueue) demTrangThai[item.trangThai] = (demTrangThai[item.trangThai] ?? 0) + 1;
  // Ket qua TUNG dong (2026-10-15) - FE hien "Kết quả đặt hàng" (dong nao tu duyet / vi sao chua duyet / ai xu ly tiep).
  const dongKq = notifyQueue.map((i) => ({ id: i.donHangId, ten: i.tenLkNoiDung, trang_thai: i.trangThai, ly_do: i.lyDo ?? null }));
  // Phieu xuat kho cac don vua tao da vao + quy du con lai (chot 2026-11-10, "Sau khi tạo đơn hàng thành công => ... tạo thành yy phiếu đặt (liệt kê) ...
  // phiếu PMH-xxx (3 đơn chờ hàng) đang chờ chuyển tiền ... PMH-yyy (3 đơn (1.000.000) đã tự thanh toán từ quỹ dư) - cuối cùng ghi quỹ dư còn 0 đồng").
  // Doc SAU khi tu gom + tinh lai tien (bundleAutoApprovedIntoPxk / taiTinhPxkMoCuaKtv o tren) -> dung trang thai that.
  const idsMoi = dongKq.map((d) => d.id);
  const { results: donPhieu } = await c.env.DB.prepare(
    `SELECT d.id, (SELECT pd.phieu_xuat_kho_id FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id
        WHERE pd.dat_don_hang_id = d.id AND p.trang_thai_hien_tai <> 'Ke toan huy' LIMIT 1) AS pxk
     FROM dat_don_hang d WHERE d.id IN (SELECT value FROM json_each(?))`,
  ).bind(JSON.stringify(idsMoi)).all<{ id: string; pxk: string | null }>();
  const pxkCuaDon = new Map(donPhieu.map((r) => [r.id, r.pxk]));
  const pxkIds = [...new Set(donPhieu.map((r) => r.pxk).filter((x): x is string => !!x))];
  const { results: phieuKq } = pxkIds.length
    ? await c.env.DB.prepare(
        `SELECT p.id, p.trang_thai_hien_tai AS trang_thai, p.trang_thai_chuyen_tien, p.so_tien_can_chuyen, COALESCE(p.da_thanh_toan, 0) AS da_thanh_toan,
           COALESCE(p.cho_hang, 0) AS cho_hang, COALESCE(p.quy_kh, 0) AS quy_kh, p.doi_tac_ma,
           (SELECT COUNT(*) FROM phieu_xuat_kho_dong x WHERE x.phieu_xuat_kho_id = p.id) AS so_don,
           (SELECT COALESCE(SUM(ABS(g.so_tien)), 0) FROM quy_ktv_giao_dich g WHERE g.phieu_xuat_kho_id = p.id AND g.loai = 'tra_phieu')
             - (SELECT COALESCE(SUM(ABS(g.so_tien)), 0) FROM quy_ktv_giao_dich g WHERE g.phieu_xuat_kho_id = p.id AND g.loai = 'hoan_phieu') AS tra_tu_quy,
           (SELECT COUNT(*) FROM khoan_chuyen_tien k WHERE k.phieu_xuat_kho_id = p.id AND k.trang_thai = 'Da duyet') AS so_khoan_duyet
         FROM phieu_xuat_kho p WHERE p.id IN (SELECT value FROM json_each(?)) ORDER BY p.id`,
      ).bind(JSON.stringify(pxkIds)).all()
    : { results: [] as unknown[] };
  const coQuyKh = (phieuKq as { quy_kh: number }[]).some((p) => p.quy_kh === 1);
  const quyDu = {
    ktv: await soDuQuy(c.env.DB, khoaQuy(nguoiNhanHang, 0)),
    kh: coQuyKh ? await soDuQuy(c.env.DB, khoaQuy(nguoiNhanHang, 1)) : null,
  };
  return c.json({
    id: phieuDatId, kh_le: khLe ? { ma: khLe.ma, sdt: khLe.sdt, moi: khLe.moi } : null, ket_qua: demTrangThai,
    dong: dongKq.map((d) => ({ ...d, pxk: pxkCuaDon.get(d.id) ?? null })), phieu: phieuKq, quy_du: quyDu, nguoi_nhan_hang: nguoiNhanHang,
  }, 201);
}

// Import Excel tao hang loat don mua linh kien (tieu chi UX #4, them 2026-08-15) - CHOT voi chu he
// thong: cac dong CUNG 1 KTV (cot NGUOI NHAN HANG = ma_ktv, khop ktv_lien_he.ma_ktv) gop thanh 1
// phieu_dat, vd import 100 dong 10 KTV khac nhau -> tao 10 phieu doc lap. Chi TN/GS
// (canQuanLyDonHo) duoc dung - dung y "tao ho hang loat", lap lai chinh xac logic tao 1 phieu thu
// cong (POST /phieu-dat o tren) cho tung nhom KTV thay vi 1 lan goi. preview/commit 2 buoc giong
// het pattern import KTV o settings.ts (processKtvImportRows) - frontend dung chung component
// ImportUploader.
interface DatDonHangImportRow {
  nguoi_nhan_hang?: string; // ma_ktv trong Danh sach KTV (Settings), KHONG phai email
  ma_lk?: string;
  loai_de_xuat?: string;
  so_luong_de_xuat?: number | string;
  ghi_chu?: string;
  yeu_cau_hoa_don?: string;
  tt_mail_duyet?: string;
  tt_khach_hang?: string;
  chinh_sach?: string;
  ma_yeu_cau_su_co?: string;
  ma_lada?: string;
}

interface DatDonHangImportValidRow {
  maKtv: string;
  emailNhanHang: string;
  maLk: string;
  tenLk: string;
  giaBan: number | null;
  loaiDeXuat: string;
  loaiDon: "mua" | "cong_no" | "tra_hang";
  soLuong: number;
  ghiChu: string | null;
  yeuCauHoaDon: string | null;
  ttMailDuyet: string | null;
  ttKhachHang: string | null;
  chinhSach: string | null;
  maYeuCauSuCo: string | null;
  maLada: string | null;
  dacThu: number;
  choPhepGia0: number | null;
  giaTriCongNo: number | null;
  // "Cong no tam tinh" cua dong nay (them 04/09/2026, xem lib/congNoKtv.ts) - gia_tri_cong_no cua LK
  // x soLuong, chi > 0 khi loaiDon==='cong_no'. danhGiaCongNo chot cho CA nhom (1 KTV) sau khi gom.
  soTienCongNo: number;
  // Dong sinh tu combo (migration 0066) - nhan hien thi. idx = vi tri trong mang da tach combo.
  comboMa: string | null;
  idx: number;
}

async function processDatDonHangImportRows(
  c: Context<{ Bindings: Env }>,
  rowsGoc: DatDonHangImportRow[],
  commit: boolean,
  // Import theo LO (v1.457): FE gui tung lo <= 80 dong (file lon 1 request vuot gioi han truy van D1 / CPU cua Worker -> loi giua chung,
  // don tao 1 nua, phieu gom dang do). dongBatDau = so dong cua lo truoc -> "Dòng N" trong bao loi van dung so dong trong file.
  dongBatDau = 0,
): Promise<{ thanhCong: number; loi: number; errors: string[]; soPhieu: number; ktvList: string[]; phieuIds?: string[]; loiHeThong?: number; canhBao?: string[] }> {
  // Thu vien doc Excel o trinh duyet giu o SO la number (vd Ma yeu cau su co / TT mail duyet toan chu so) -> `.trim()` tren
  // number nem TypeError = 500 "INTERNAL_ERROR" cho CA file (bao loi 2026-10-02). Chuan hoa moi o ve chuoi truoc.
  const rowsChuan = rowsGoc.map((r) =>
    Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, v == null ? v : typeof v === "string" ? v : String(v)])),
  ) as DatDonHangImportRow[];
  // Combo linh kien (migration 0066): dong ghi ma combo -> tung dong LK thanh phan; bao loi van theo so dong trong file.
  const tachDong = await tachComboDong(
    c.env.DB,
    rowsChuan,
    (r) => r.ma_lk,
    (r) => Number(r.so_luong_de_xuat),
    (r, maLk, soLuong) => ({ ...r, ma_lk: maLk, so_luong_de_xuat: String(soLuong) }),
  );
  const rows = tachDong.map((t) => t.dong);
  const user = c.get("user");
  const db = c.env.DB;
  const errors: string[] = [];
  const valid: DatDonHangImportValidRow[] = [];

  // Cache tra cuu KTV/LK trong 1 lan import - tranh query lap lai cung 1 ma nhieu lan qua nhieu dong.
  // ktvCache: email da RESOLVE (Ve tinh -> tram_cha, xem resolveNguoiNhanHang o tren - gop chung 1
  // query o day thay vi goi lai ham do vi chay trong vong lap nhieu dong).
  const ktvCache = new Map<string, { email: string } | { error: string }>();
  const lkCache = new Map<string, { ten: string; gia: number | null; dacThu: number; giaTriCongNo: number | null; camBan: number | null; choPhepGia0: number | null } | null>();
  const maChuanImport = await quyVeMaChuan(db, rows.map((r) => String(r.ma_lk ?? "")));
  // Loai de xuat trong file quy ve DUNG ten trong danh muc (settings_loai_de_xuat, khong phan biet hoa/thuong/khoang trang -
  // 2026-10-15: file ghi "Trả hàng công nợ" chu thuong lot qua chan tra hang, thanh don mua). Khong co trong danh muc -> bao loi.
  const khoaLde = (v: string) => v.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
  const { results: dsLde } = await db.prepare("SELECT ten_option FROM settings_loai_de_xuat ORDER BY bat_tat DESC").all<{ ten_option: string }>();
  const ldeChuan = new Map<string, string>();
  for (const r of dsLde) if (!ldeChuan.has(khoaLde(r.ten_option))) ldeChuan.set(khoaLde(r.ten_option), r.ten_option);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dong = tachDong[i].goc + 1 + dongBatDau;
    const maKtv = String(row.nguoi_nhan_hang ?? "").trim();
    const maLkGoc = String(row.ma_lk ?? "").trim();
    // File import cu con ma LK da doi/gop -> quy ve ma chuan (migration 0053).
    const maLk = maChuanImport.get(maLkGoc) ?? maLkGoc;
    const loaiDeXuatFile = String(row.loai_de_xuat ?? "").trim();
    const loaiDeXuat = ldeChuan.get(khoaLde(loaiDeXuatFile)) ?? loaiDeXuatFile;
    const soLuong = Number(row.so_luong_de_xuat);

    if (!maKtv) {
      errors.push(`Dòng ${dong}: thiếu NGƯỜI NHẬN HÀNG (mã KTV)`);
      continue;
    }
    if (!maLk) {
      errors.push(`Dòng ${dong}: thiếu LINH KIỆN MÃ`);
      continue;
    }
    if (!loaiDeXuat) {
      errors.push(`Dòng ${dong}: thiếu LOẠI ĐỀ XUẤT`);
      continue;
    }
    if (!ldeChuan.has(khoaLde(loaiDeXuat))) {
      errors.push(`Dòng ${dong}: LOẠI ĐỀ XUẤT "${loaiDeXuatFile}" không có trong danh mục`);
      continue;
    }
    // MUA HÀNG CÔNG NỢ ĐỐI TÁC (v1.403): can chon doi tac + canh bao kha dung -> chi tao tren form, chua ho tro import.
    if (laMuaCongNoDoiTac(loaiDeXuat)) {
      errors.push(`Dòng ${dong}: đơn "${loaiDeXuat}" chưa hỗ trợ import — tạo trên form đặt hàng (chọn đối tác)`);
      continue;
    }
    // CÔNG NỢ SỬA CHỮA (v1.495) + HỖ TRỢ SỬA CHỮA 0 ĐỒNG / MUA HÀNG SỬA CHỮA (v1.508): can ma don bao hanh tung dong -> chi tao tren form.
    if (laDonSuaChua(loaiDeXuat)) {
      errors.push(`Dòng ${dong}: đơn "${loaiDeXuat}" chưa hỗ trợ import — tạo trên form đặt hàng (nhập mã đơn bảo hành)`);
      continue;
    }
    if (!soLuong || soLuong <= 0 || !Number.isInteger(soLuong) || soLuong > SL_TOI_DA) {
      errors.push(`Dòng ${dong}: SỐ LƯỢNG ĐỀ XUẤT không hợp lệ`);
      continue;
    }

    if (!ktvCache.has(maKtv)) {
      const ktvRow = await db
        .prepare(
          `SELECT dsk.email_dang_nhap as email, u.la_ve_tinh, u.tram_cha, MAX(COALESCE(u.bi_khoa, 0), dsk.ngung_hoat_dong) AS bi_khoa, t.bi_khoa AS tram_bi_khoa
           FROM ktv_lien_he dsk JOIN users u ON u.email = dsk.email_dang_nhap LEFT JOIN users t ON t.email = u.tram_cha
           WHERE dsk.ma_ktv = ? AND dsk.email_dang_nhap IS NOT NULL`,
        )
        .bind(maKtv)
        .first<{ email: string; la_ve_tinh: number; tram_cha: string | null; bi_khoa: number | null; tram_bi_khoa: number | null }>();
      if (!ktvRow) {
        ktvCache.set(maKtv, { error: "NOT_FOUND" });
      } else if (ktvRow.bi_khoa || (ktvRow.la_ve_tinh && ktvRow.tram_bi_khoa)) {
        ktvCache.set(maKtv, { error: "DA_TAT" });
      } else if (ktvRow.la_ve_tinh && !ktvRow.tram_cha) {
        ktvCache.set(maKtv, { error: "VE_TINH_CHUA_GAN_TRAM" });
      } else {
        const resolvedEmail = ktvRow.la_ve_tinh ? ktvRow.tram_cha! : ktvRow.email;
        // (Bo 2026-09-28) GS import ho duoc cho MOI KTV - khong con chan NGOAI_PHAM_VI_GS.
        if (await nguoiNhanChuaCoMaMisa(db, resolvedEmail)) ktvCache.set(maKtv, { error: "CHUA_CO_MA_MISA" });
        else ktvCache.set(maKtv, { email: resolvedEmail });
      }
    }
    const ktv = ktvCache.get(maKtv)!;
    if ("error" in ktv) {
      errors.push(
        ktv.error === "VE_TINH_CHUA_GAN_TRAM"
          ? `Dòng ${dong}: KTV "${maKtv}" là Vệ tinh nhưng chưa được gán Trạm - không xác định được người nhận hàng`
          : ktv.error === "DA_TAT"
            ? `Dòng ${dong}: tài khoản KTV "${maKtv}" (hoặc Trạm nhận hàng thay) đang bị tắt - không nhận hàng được`
          : ktv.error === "CHUA_CO_MA_MISA"
            ? `Dòng ${dong}: tài khoản KTV "${maKtv}" (hoặc Trạm nhận hàng thay) chưa cài đặt mã MISA nên không thể đặt hàng - vui lòng liên hệ giám sát khu vực`
          : ktv.error === "NGOAI_PHAM_VI_GS"
            ? `Dòng ${dong}: KTV "${maKtv}" không thuộc quyền phụ trách của Giám sát này`
            : `Dòng ${dong}: KTV "${maKtv}" không tồn tại trong Danh sách KTV hoặc chưa ghép tài khoản đăng nhập`,
      );
      continue;
    }

    if (!lkCache.has(maLk)) {
      // CHOT 2026-08-16: gia lay tu linh_kien.gia_ban (khong con gia_tham_chieu), khop dung
      // POST /phieu-dat o tren.
      const lkRow = await db.prepare("SELECT ten_linh_kien as ten, gia_ban as gia, dac_thu, gia_tri_cong_no, cam_ban, cho_phep_gia_0 FROM linh_kien WHERE ma_linh_kien = ?").bind(maLk).first<{ ten: string; gia: number | null; dac_thu: number; gia_tri_cong_no: number | null; cam_ban: number | null; cho_phep_gia_0: number | null }>();
      lkCache.set(maLk, lkRow ? { ten: lkRow.ten, gia: lkRow.gia, dacThu: lkRow.dac_thu, giaTriCongNo: lkRow.gia_tri_cong_no, camBan: lkRow.cam_ban, choPhepGia0: lkRow.cho_phep_gia_0 } : null);
    }
    const lk = lkCache.get(maLk);
    if (!lk) {
      errors.push(`Dòng ${dong}: mã LK "${maLk}" không tồn tại`);
      continue;
    }

    if (canNoRequired(loaiDeXuat) && (!row.chinh_sach?.trim() || !coMaIdLienQuan(row.ma_yeu_cau_su_co, row.ma_lada))) {
      errors.push(`Dòng ${dong}: Loại đề xuất "${loaiDeXuat}" yêu cầu điền CHÍNH SÁCH và MÃ YÊU CẦU SỰ CỐ hoặc MÃ LADA`);
      continue;
    }
    if (!canNoRequired(loaiDeXuat) && maYcscRequired(loaiDeXuat) && !coMaIdLienQuan(row.ma_yeu_cau_su_co, row.ma_lada)) {
      errors.push(`Dòng ${dong}: Loại đề xuất "${loaiDeXuat}" yêu cầu điền MÃ YÊU CẦU SỰ CỐ hoặc MÃ LADA`);
      continue;
    }
    // CHOT (phan hoi 2026-08-24): don Tra hang bat buoc anh linh kien can tra - Excel khong the kem
    // anh, nen KHONG ho tro tao qua Nhap Excel, phai tao thu cong tung dong qua POST /phieu-dat.
    if (deriveLoaiDon(loaiDeXuat) === "tra_hang") {
      errors.push(`Dòng ${dong}: đơn Trả hàng cần ảnh linh kiện - không hỗ trợ tạo qua Nhập Excel, vui lòng tạo thủ công`);
      continue;
    }

    const loaiDonRow = deriveLoaiDon(loaiDeXuat);
    valid.push({
      maKtv,
      emailNhanHang: ktv.email,
      maLk,
      tenLk: lk.ten,
      giaBan: lk.gia,
      loaiDeXuat,
      loaiDon: loaiDonRow,
      soLuong,
      ghiChu: row.ghi_chu?.trim() || null,
      yeuCauHoaDon: row.yeu_cau_hoa_don?.trim() || null,
      ttMailDuyet: row.tt_mail_duyet?.trim() || null,
      ttKhachHang: row.tt_khach_hang?.trim() || null,
      chinhSach: row.chinh_sach?.trim() || chinhSachMacDinh(loaiDeXuat),
      maYeuCauSuCo: row.ma_yeu_cau_su_co?.trim() || null,
      maLada: row.ma_lada?.trim().toUpperCase() || null,
      dacThu: lk.dacThu,
      choPhepGia0: lk.choPhepGia0,
      giaTriCongNo: lk.giaTriCongNo,
      // "TRỪ CÔNG NỢ" khong doi chieu cong no (chot 2026-09-28) - soTienCongNo = 0 nhu don mua.
      // Don KH tra gop (laKhTraGop) - gia tri CN = 0 (chot 2026-10-02).
      soTienCongNo: loaiDonRow === "cong_no" && !laTruCongNo(loaiDeXuat) && !khongTinhCongNo(loaiDeXuat) ? (lk.giaTriCongNo ?? 0) * soLuong : 0,
      comboMa: tachDong[i].comboMa,
      idx: i,
    });
  }

  // Combo tao DU BO hoac khong tao: 1 thanh phan loi -> bo ca cac thanh phan con lai cua dong combo do.
  const idxHopLe = new Set(valid.map((v) => v.idx));
  const gocLoi = new Set(tachDong.filter((t, i) => t.comboMa && !idxHopLe.has(i)).map((t) => t.goc));
  if (gocLoi.size > 0) {
    const gocDaBo = new Set<number>();
    for (let k = valid.length - 1; k >= 0; k--) {
      const g = tachDong[valid[k].idx].goc;
      if (gocLoi.has(g)) {
        valid.splice(k, 1);
        gocDaBo.add(g);
      }
    }
    for (const g of gocDaBo) errors.push(`Dòng ${g + 1 + dongBatDau}: combo "${tachDong.find((t) => t.goc === g)!.comboMa}" không tạo vì có linh kiện thành phần lỗi (xem lỗi phía trên)`);
  }

  // Canh bao DAT TRUNG (v1.457 - "check với hệ thống ID đó đã có đặt mã lk đó chưa, hiện cảnh báo tại thời điểm người dùng import => tránh
  // việc người dùng không biết lại import nhiều lần"): chi o buoc XEM TRUOC (preview) - commit theo lo se tu thay don lo truoc vua tao.
  const canhBao = commit ? [] : await canhBaoDatTrungImport(db, valid.map((v) => ({
    dong: tachDong[v.idx].goc + 1 + dongBatDau, maLk: v.maLk, maYcsc: v.maYeuCauSuCo, maLada: v.maLada,
  })));

  // Gom theo KTV nhan hang - moi nhom = 1 phieu_dat (chot voi chu he thong 2026-08-15).
  const groups = new Map<string, DatDonHangImportValidRow[]>();
  for (const v of valid) {
    if (!groups.has(v.emailNhanHang)) groups.set(v.emailNhanHang, []);
    groups.get(v.emailNhanHang)!.push(v);
  }

  // Bo quyet dinh dung chung voi tao tay (lib/tuDongDuyet.ts, chot 2026-10-14 "Đơn Import => áp dụng logic như đơn tạo bình
  // thường"): dong bi CHAN (TRỪ CÔNG NỢ thieu ton KTV, gia 0, cong no khi chua co ma MISA) -> bao loi dong + bo khoi nhom (combo bo
  // ca bo), danh gia lai nhom con lai (ton tru dan / cong no tong phieu doi). Thieu ton kho cong ty KHONG loi - tu vao cho hang /
  // cho thanh toan (Kho xac nhan lai), vuot tran -> cho GS duyet.
  const danhGiaNhom = new Map<string, KetQuaPhieu>();
  for (const [emailNhanHang, groupRows] of [...groups]) {
    const ctx = await nguCanhNhan(db, emailNhanHang, user.email);
    let rowsNhom = groupRows;
    for (let lan = 0; lan < 5 && rowsNhom.length > 0; lan++) {
      const dg = await danhGiaPhieu(
        db,
        ctx,
        rowsNhom.map((v) => ({
          ma_lk: v.maLk, loai_de_xuat: v.loaiDeXuat, so_luong: v.soLuong, gia_ban: v.giaBan, dac_thu: v.dacThu,
          cho_phep_gia_0: v.choPhepGia0, gia_tri_cong_no: v.giaTriCongNo,
        })),
      );
      if (!dg.coLoi) {
        danhGiaNhom.set(emailNhanHang, dg);
        break;
      }
      const gocLoiNhom = new Set<number>();
      dg.dong.forEach((d, k) => {
        if (!d.loi) return;
        const goc = tachDong[rowsNhom[k].idx].goc;
        errors.push(`Dòng ${goc + 1 + dongBatDau}: ${d.loi.thongDiep}`);
        gocLoiNhom.add(goc);
      });
      for (const g of gocLoiNhom) {
        const comboMa = tachDong.find((t) => t.goc === g)?.comboMa;
        if (comboMa) errors.push(`Dòng ${g + 1 + dongBatDau}: combo "${comboMa}" không tạo vì có linh kiện thành phần bị chặn (xem lỗi phía trên)`);
      }
      rowsNhom = rowsNhom.filter((v) => !gocLoiNhom.has(tachDong[v.idx].goc));
    }
    if (rowsNhom.length === 0 || !danhGiaNhom.has(emailNhanHang)) {
      groups.delete(emailNhanHang);
      danhGiaNhom.delete(emailNhanHang);
    } else {
      groups.set(emailNhanHang, rowsNhom);
    }
  }
  const validConLai = [...groups.values()].flat();

  const phieuIds: string[] = [];
  // Loi he thong khi GHI (v1.457 - "khi import bị lỗi cũng không báo lỗi gì"): truoc day 1 loi giua chung nem ra ngoai = 500 cho CA
  // file, nguoi dung khong biet KTV nao da tao don. Gio bat loi THEO TUNG KTV: chua ghi duoc -> bao "không tạo"; da ghi don nhung buoc
  // sau (gom phieu xuat, mo ticket, tinh lai tien) loi -> bao "đã tạo, cần kiểm tra" de khong import lai trung.
  let loiHeThong = 0;
  let soNhomDaTao = 0;
  // Chi tiet loi ky thuat (cau SQL, ten bang) KHONG tra cho nguoi dung (ra soat bao mat 2026-11-09) - chi ma tra cuu log server.
  const thongDiepLoi = (_e: unknown) => `lỗi hệ thống, mã tra cứu ${c.get("requestId") ?? "?"}`;
  if (commit && groups.size > 0) {
    const now = nowVN();
    const waitUntil = (p: Promise<unknown>) => c.executionCtx.waitUntil(p);
    for (const [emailNhanHang, groupRows] of groups) {
      const maKtvNhom = groupRows[0]?.maKtv ?? emailNhanHang;
      const dongNhom = [...new Set(groupRows.map((v) => tachDong[v.idx].goc + 1 + dongBatDau))];
      const moTaDong = dongNhom.length > 8 ? `${dongNhom.slice(0, 8).join(", ")}… (${dongNhom.length} dòng)` : dongNhom.join(", ");
      let daGhi = false;
      try {
        const dg = danhGiaNhom.get(emailNhanHang)!;
        const phieuDatId = await nextSequentialId(db, "phieu_dat", phieuDatPrefix(c), 6);
        // Giu truoc ma don cho ca nhom 1 lan (truoc 1 truy van / don).
        const maDon = await reserveSequentialIds(db, "dat_don_hang", "DDH", 6, groupRows.length);
        const giamSatRow = await db.prepare("SELECT giam_sat_quan_ly FROM users WHERE email = ?").bind(emailNhanHang).first<{ giam_sat_quan_ly: string | null }>();
        const emailGs = giamSatRow?.giam_sat_quan_ly ?? null;

        const statements = [
          db.prepare("INSERT INTO phieu_dat (id, nguoi_tao, ngay_tao, email_gs, ghi_chu, nguoi_nhan_hang, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
            phieuDatId, user.email, now, emailGs, null, emailNhanHang, now,
          ),
        ];
        const vaoPhieu: Record<"mua" | "cong_no", { donHangId: string; soTien: number }[]> = { mua: [], cong_no: [] };
        const sauTao: { donHangId: string; trangThai: string; lyDo: string | null; tenLk: string }[] = [];
        for (const [k, v] of groupRows.entries()) {
          const kqDong = dg.dong[k];
          const donHangId = maDon[k];
          const trangThaiKhoiTao = kqDong.trangThai;
          if ((trangThaiKhoiTao === "TN da duyet" || kqDong.batBuocChuyenTien) && (v.loaiDon === "mua" || v.loaiDon === "cong_no")) {
            vaoPhieu[v.loaiDon].push({ donHangId, soTien: (v.giaBan ?? 0) * v.soLuong });
          }
          const ghiChuLog = ghiChuKhoiTao(kqDong, v.soLuong, dg);
          sauTao.push({ donHangId, trangThai: trangThaiKhoiTao, lyDo: ghiChuLog, tenLk: `"${v.tenLk} (x${v.soLuong})"` });
          statements.push(
            db
              .prepare(
                `INSERT INTO dat_don_hang
                   (id, phieu_dat_id, loai_don, ma_lk, ten_lk_snapshot, loai_de_xuat, so_luong_de_xuat, gia_de_xuat,
                    so_tien_cong_no, danh_gia_cong_no, ghi_chu, yeu_cau_hoa_don, tt_mail_duyet, tt_khach_hang, chinh_sach, ma_yeu_cau_su_co, ma_lada,
                    nguoi_tao, ngay_tao, updated_at, email_gs, nguoi_nhan_hang, trang_thai_hien_tai, bat_buoc_chuyen_tien, combo_ma)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                donHangId, phieuDatId, v.loaiDon, v.maLk, v.tenLk, v.loaiDeXuat, v.soLuong, v.giaBan,
                kqDong.soTienCongNo, kqDong.danhGiaCongNo,
                v.ghiChu, v.yeuCauHoaDon, v.ttMailDuyet, v.ttKhachHang, v.chinhSach, v.maYeuCauSuCo, v.maLada,
                user.email, now, now, emailGs, emailNhanHang, trangThaiKhoiTao, kqDong.batBuocChuyenTien ? 1 : 0, v.comboMa,
              ),
          );
          if (v.loaiDon !== "tra_hang") {
            statements.push(
              db.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong) VALUES (?, ?, ?, ?, ?, ?)").bind(
                donHangId, trangThaiKhoiTao, user.email, now, ghiChuLog, trangThaiKhoiTao === "TN da duyet" ? 1 : 0,
              ),
            );
          }
        }
        await db.batch(statements);
        daGhi = true;
        soNhomDaTao++;
        phieuIds.push(phieuDatId);
        for (const loaiDon of ["mua", "cong_no"] as const) {
          if (vaoPhieu[loaiDon].length > 0) await bundleAutoApprovedIntoPxk(c.env, db, user.email, emailNhanHang, loaiDon, vaoPhieu[loaiDon]);
        }
        const emailGsList = emailGs ? [emailGs] : [];
        for (const item of sauTao) {
          if (item.trangThai === "Cho hang") {
            await moTicketChoHangTuDong(c.env, db, item.donHangId, user.email, item.lyDo ?? "Kho công ty không đủ hàng", waitUntil);
          } else if (item.trangThai === "Cho GS duyet") {
            waitUntil(baoGsChoDuyet(c.env, db, item.donHangId));
          } else if (item.trangThai === "Cho TBP xac nhan") {
            waitUntil(
              (async () => {
                await notifyWorkflowTask(c.env, db, {
                  cat1Emails: await emailsForRoleOrQC(db, "la_tp_dvbh", emailGsList),
                  otherRoles: MUA_CONG_NO_ROLES.filter((r) => r !== "la_tp_dvbh"),
                  emailGsList,
                  pastActors: [],
                  title: "Đặt mua linh kiện",
                  body: `Đơn ${item.tenLk} cần bạn xác nhận linh kiện đặc thù`,
                  linkType: "don_hang",
                  linkId: item.donHangId,
                });
              })(),
            );
          }
        }
        // Don moi lam doi tong don trong ngay cua KTV (chiet khau, chot 2026-09-28).
        await taiTinhPxkMoCuaKtv(db, emailNhanHang, user.email);
      } catch (e) {
        loiHeThong++;
        console.error(`[${c.get("requestId")}] import don hang loi`, maKtvNhom, e);
        errors.push(
          daGhi
            ? `KTV "${maKtvNhom}" (dòng ${moTaDong}): ĐÃ TẠO ${groupRows.length} đơn nhưng lỗi ở bước gom phiếu xuất / mở ticket / tính lại tiền (${thongDiepLoi(e)}) — kiểm tra lại đơn của KTV này ở danh sách Đơn hàng, KHÔNG import lại các dòng này`
            : `KTV "${maKtvNhom}" (dòng ${moTaDong}): KHÔNG tạo được đơn nào do lỗi hệ thống (${thongDiepLoi(e)}) — có thể import lại các dòng này`,
        );
        if (!daGhi) groups.delete(emailNhanHang);
      }
    }
  }

  // Dong combo loi -> cung 1 loi lap lai theo tung thanh phan, chi giu 1.
  const errorsGon = [...new Set(errors)];
  const validDaTao = commit ? [...groups.values()].flat() : validConLai;
  return {
    thanhCong: validDaTao.length,
    loi: errorsGon.length,
    errors: errorsGon,
    soPhieu: commit ? soNhomDaTao : groups.size,
    ktvList: [...new Set(validDaTao.map((v) => v.maKtv))],
    ...(commit ? { phieuIds, loiHeThong } : { canhBao }),
  };
}

const NHAN_TRANG_THAI_TRUNG: Record<string, string> = {
  "TN da duyet": "đã duyệt", "Cho TN duyet": "chờ TN duyệt", "Cho hang": "chờ hàng", "Cho thanh toan": "chờ thanh toán",
  "Cho GS duyet": "chờ GS duyệt", "Cho TBP xac nhan": "chờ TBP", "Cho tram duyet": "chờ Trạm",
};

/** Dong import trung (ma LK + Ma YCSC / ID Lada) voi don CON HIEU LUC da co trong he thong hoac voi dong khac trong cung file.
 * Ma YCSC khop ca ma chinh cua don lan ma bo sung (dat_don_case). So khong phan biet hoa/thuong. Chi canh bao, khong chan. */
async function canhBaoDatTrungImport(
  db: D1Database,
  dongs: { dong: number; maLk: string; maYcsc: string | null; maLada: string | null }[],
): Promise<string[]> {
  const chuan = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();
  const coMa = dongs.filter((d) => chuan(d.maYcsc) || chuan(d.maLada));
  if (coMa.length === 0) return [];
  const out: string[] = [];
  // 1) Trung trong chinh file.
  const daGap = new Map<string, number>();
  for (const d of coMa) {
    for (const [loai, ma] of [["Mã YCSC", chuan(d.maYcsc)], ["ID Lada", chuan(d.maLada)]] as const) {
      if (!ma) continue;
      const khoa = `${d.maLk.toUpperCase()}|${ma}`;
      const truoc = daGap.get(khoa);
      if (truoc !== undefined && truoc !== d.dong) out.push(`Dòng ${d.dong}: trùng dòng ${truoc} trong file — cùng mã LK ${d.maLk} và ${loai} ${ma}`);
      else daGap.set(khoa, d.dong);
    }
  }
  // 2) Trung voi don da co (con hieu luc). Loc theo ma LK (co index idx_ddh_ma_lk) - danh sach truyen 1 bind JSON (D1 <= 100 tham so).
  const maLks = [...new Set(coMa.map((d) => d.maLk))];
  const maIds = [...new Set(coMa.flatMap((d) => [chuan(d.maYcsc), chuan(d.maLada)]).filter(Boolean))];
  const daCo: { id: string; ma_lk: string; ycsc: string | null; lada: string | null; ca: string | null; trang_thai_hien_tai: string | null; ngay_tao: string; nguoi_nhan: string | null }[] = [];
  for (let i = 0; i < maLks.length; i += 200) {
    const { results } = await db
      .prepare(
        `SELECT ddh.id, ddh.ma_lk, UPPER(TRIM(ddh.ma_yeu_cau_su_co)) AS ycsc, UPPER(TRIM(ddh.ma_lada)) AS lada,
                (SELECT GROUP_CONCAT(UPPER(TRIM(dc.case_id)), ' ') FROM dat_don_case dc WHERE dc.dat_don_hang_id = ddh.id) AS ca,
                ddh.trang_thai_hien_tai, ddh.ngay_tao, ${tenNguoiDaySql("ddh.nguoi_nhan_hang")} AS nguoi_nhan
         FROM dat_don_hang ddh
         WHERE ddh.ma_lk IN (SELECT value FROM json_each(?1))
           AND COALESCE(ddh.trang_thai_hien_tai, '') NOT IN ('TN tu choi', 'Da huy', 'Tu choi')
           AND (UPPER(TRIM(ddh.ma_yeu_cau_su_co)) IN (SELECT value FROM json_each(?2))
             OR UPPER(TRIM(ddh.ma_lada)) IN (SELECT value FROM json_each(?2))
             OR EXISTS (SELECT 1 FROM dat_don_case dc WHERE dc.dat_don_hang_id = ddh.id AND UPPER(TRIM(dc.case_id)) IN (SELECT value FROM json_each(?2))))
         ORDER BY ddh.ngay_tao DESC
         LIMIT 500`,
      )
      .bind(JSON.stringify(maLks.slice(i, i + 200)), JSON.stringify(maIds))
      .all<(typeof daCo)[number]>();
    daCo.push(...results);
  }
  if (daCo.length === 0) return out;
  for (const d of coMa) {
    const ycsc = chuan(d.maYcsc);
    const lada = chuan(d.maLada);
    const khop = daCo.filter((r) => r.ma_lk.toUpperCase() === d.maLk.toUpperCase() && (
      (ycsc && (r.ycsc === ycsc || r.lada === ycsc || (r.ca ?? "").split(" ").includes(ycsc))) ||
      (lada && (r.lada === lada || r.ycsc === lada || (r.ca ?? "").split(" ").includes(lada)))
    ));
    if (khop.length === 0) continue;
    const ma = [ycsc && `Mã YCSC ${ycsc}`, lada && `ID Lada ${lada}`].filter(Boolean).join(" / ");
    const chiTiet = khop.slice(0, 3).map((r) =>
      `${r.id} (${NHAN_TRANG_THAI_TRUNG[r.trang_thai_hien_tai ?? ""] ?? r.trang_thai_hien_tai ?? "?"}, ${r.ngay_tao.slice(0, 10)}${r.nguoi_nhan ? `, ${r.nguoi_nhan}` : ""})`,
    ).join("; ");
    out.push(`Dòng ${d.dong}: ${ma} đã có ${khop.length} đơn mã LK ${d.maLk}: ${chiTiet}${khop.length > 3 ? "…" : ""} — kiểm tra để tránh đặt trùng`);
  }
  return out;
}

const DAT_DON_HANG_IMPORT_TEMPLATE_CSV =
  "nguoi_nhan_hang,ma_lk,loai_de_xuat,so_luong_de_xuat,ghi_chu,yeu_cau_hoa_don,tt_mail_duyet,tt_khach_hang,chinh_sach,ma_yeu_cau_su_co,ma_lada\n" +
  "huannt.mb,LK-000123,MUA DỰ TRỮ,2,,Không,,,Trong CSBH,,\n";

// GET /api/dat-mua-lk/don-hang/import/template - file mau Excel/CSV cho import hang loat (tieu chi
// UX #4). "nguoi_nhan_hang" la MA KTV (khop ktv_lien_he.ma_ktv, xem Settings > Danh sach KTV),
// KHONG phai email - cac dong cung 1 ma se gop thanh 1 phieu dat.
datMuaLinhKien.get("/don-hang/import/template", (c) => csvTemplateResponse(c, DAT_DON_HANG_IMPORT_TEMPLATE_CSV, "mau_import_dat_don_hang.csv"));

datMuaLinhKien.post("/don-hang/import/preview", async (c) => {
  if (!canQuanLyDonHo(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ rows: DatDonHangImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processDatDonHangImportRows(c, body.rows, false);
  return c.json(summary);
});

datMuaLinhKien.post("/don-hang/import/commit", async (c) => {
  if (!canQuanLyDonHo(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ rows: DatDonHangImportRow[]; dong_bat_dau?: number }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  // Moi lan ghi toi da 150 dong (FE gui lo 80) - file lon hon phai chia lo (gioi han truy van D1 / CPU moi request).
  if (body.rows.length > 150) return c.json({ error: "QUA_NHIEU_DONG_MOT_LAN", toi_da: 150 }, 400);
  const dongBatDau = Math.max(0, Math.floor(Number(body.dong_bat_dau) || 0));
  const summary = await processDatDonHangImportRows(c, body.rows, true, dongBatDau);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json(summary);
});

// GET /api/dat-mua-lk/don-hang/:id - chi tiet 1 DONG don hang: thong tin dong + lich su (logs) + case
// lien ket. CHOT 2026-08-15: thay the GET /phieu-dat/:id (chi tiet ca phieu) va GET /don-hang/by-phieu
// (lay dong con theo danh sach phieu) - khong con khai niem "phieu" nua, moi dong tu dung doc lap
// (xem migration 0075). Ap dung scopeDatMuaNguoiTao (alias ddh) de khong lo du lieu ngoai pham vi.
// Tim kiem thuc su theo ma (phan hoi 2026-09-10: "mục tìm kiếm tổng đang bug không tìm được ví dụ
// DDH-000004") - truoc day o Ctrl+K (CommandPalette.tsx) CHI dieu huong module, KHONG tra cuu du lieu
// don hang that (thiet ke co y luc tach he). Endpoint nay tim theo TIEN TO ma (DDH.../PMH.../TLK...)
// tren CA 3 bang chinh cua module, MOI bang ap dung DUNG scope xem cua nguoi goi (giong het GET/:id
// tuong ung) de khong lo du lieu ngoai quyen - khong tim rong hon (vd theo ten linh kien) de tranh
// ro ri thong tin qua 1 o goi la "command palette".
datMuaLinhKien.get("/search", async (c) => {
  const user = c.get("user");
  const q = (c.req.query("q") ?? "").trim().toUpperCase();
  if (q.length < 3) return c.json({ results: [] });
  const results: { type: "don_hang" | "phieu_xuat_kho" | "thieu_lk" | "thieu_hang_bh"; id: string; label: string }[] = [];

  {
    const scope = scopeDatMuaNguoiTao(c);
    const whereSql = "UPPER(ddh.id) LIKE ? || '%'" + (scope?.whereSql ?? "");
    const binds = [q, ...(scope?.binds ?? [])];
    const { results: rows } = await c.env.DB.prepare(
      `SELECT ddh.id, ddh.ma_lk, ddh.ten_lk_snapshot FROM dat_don_hang ddh WHERE ${whereSql} ORDER BY ddh.id LIMIT 5`,
    )
      .bind(...binds)
      .all<{ id: string; ma_lk: string | null; ten_lk_snapshot: string | null }>();
    for (const r of rows) results.push({ type: "don_hang", id: r.id, label: `${r.id} — ${r.ten_lk_snapshot ?? r.ma_lk ?? ""}` });
  }

  {
    const scope = scopePxkNguoiNhanHang(c);
    const whereSql = "UPPER(pxk.id) LIKE ? || '%'" + (scope?.whereSql ?? "");
    const binds = [q, ...(scope?.binds ?? [])];
    const { results: rows } = await c.env.DB.prepare(
      `SELECT pxk.id, pxk.ma_xuat_kho FROM phieu_xuat_kho pxk WHERE ${whereSql} ORDER BY pxk.id LIMIT 5`,
    )
      .bind(...binds)
      .all<{ id: string; ma_xuat_kho: string | null }>();
    for (const r of rows) results.push({ type: "phieu_xuat_kho", id: r.id, label: r.ma_xuat_kho ? `${r.id} (${r.ma_xuat_kho})` : r.id });
  }

  {
    // Scope GIONG HET GET /thieu-lk/:id ben duoi (khong tach ham dung chung vi 1 ben la WHERE tren id
    // that, 1 ben la LIKE tien to - de nguyen inline cho de doi chieu).
    let whereSql = "UPPER(tlk.id) LIKE ? || '%'";
    const binds: unknown[] = [q];
    if (canKho(c) || canTacNghiep(c)) {
      // khong gioi han - chi loc nhom LK Kho duoc gan (Karofi / B2B, 2026-10-16)
      const nhomKho = khoNhomLkLoc(user);
      if (nhomKho) whereSql += locNhomLkSql("ddh", nhomKho);
    } else if (user.vai_tro === "Giam sat") {
      whereSql += ` AND (ddh.email_gs = ? OR ddh.nguoi_tao = ? OR ddh.nguoi_nhan_hang = ? OR ${gsKhuVucXemThemSql("ddh.khu_vuc_ma")})`; // + don chinh GS tao (2026-09-28) / GS nhan hang (2026-09-30) / khu vuc xem them (2026-10-02)
      binds.push(user.email, user.email, user.email, user.email);
    } else if (user.la_mua_hang) {
      // "Mua hang" (2026-09-30) - xem toan bo, chi doc.
    } else if (user.la_view) {
      const v = viewDonScopeSql(user.email);
      whereSql += v.whereSql;
      binds.push(...v.binds);
    } else {
      whereSql += " AND tlk.nguoi_tao = ?";
      binds.push(user.email);
    }
    const { results: rows } = await c.env.DB.prepare(
      `SELECT tlk.id, ddh.ma_lk, ddh.ten_lk_snapshot FROM thieu_lk tlk LEFT JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id WHERE ${whereSql} ORDER BY tlk.id LIMIT 5`,
    )
      .bind(...binds)
      .all<{ id: string; ma_lk: string | null; ten_lk_snapshot: string | null }>();
    for (const r of rows) results.push({ type: "thieu_lk", id: r.id, label: `${r.id} — ${r.ten_lk_snapshot ?? r.ma_lk ?? ""}` });
  }

  // + tim theo MA YEU CAU SU CO chinh/bo sung (2026-09-29) + MA LADA (2026-09-30) - cung scope xem don nhu tren.
  {
    const scope = scopeDatMuaNguoiTao(c);
    const daCo = new Set(results.map((r) => r.id));
    const theoMa = orMaYcsc("ddh", q);
    // + ma don bao hanh cua don sua chua (DH-006691 / DH-006691-1, 2026-11-20 - tim tien to).
    const { results: rows } = await c.env.DB.prepare(
      `SELECT ddh.id, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.ma_yeu_cau_su_co, ddh.ma_lada, ddh.bh_don_vi_id FROM dat_don_hang ddh
       WHERE (0${theoMa.sql} OR UPPER(ddh.bh_don_vi_id) LIKE ? || '%')${scope?.whereSql ?? ""} ORDER BY ddh.ngay_tao DESC LIMIT 5`,
    )
      .bind(...theoMa.binds, q, ...(scope?.binds ?? []))
      .all<{ id: string; ma_lk: string | null; ten_lk_snapshot: string | null; ma_yeu_cau_su_co: string | null; ma_lada: string | null; bh_don_vi_id: string | null }>();
    for (const r of rows) {
      if (daCo.has(r.id)) continue;
      // Nhan theo ma THUC SU khop tu khoa (Ma Lada / ma don BH / Ma YCSC chinh/bo sung).
      const maKhop = r.ma_lada?.toUpperCase().includes(q)
        ? `Lada ${r.ma_lada}`
        : r.bh_don_vi_id?.toUpperCase().startsWith(q)
          ? `Đơn BH ${r.bh_don_vi_id}`
          : `YCSC ${r.ma_yeu_cau_su_co ?? q}`;
      results.push({ type: "don_hang", id: r.id, label: `${r.id} — ${maKhop} — ${r.ten_lk_snapshot ?? r.ma_lk ?? ""}` });
    }
  }

  // + ticket THIEU HANG BAO HANH (THB-..., app Sua chua bao hanh gui sang) theo ma ticket / ma case / ma don BH
  // (2026-11-20 - "SC2611120758 công cụ tìm kiếm không tìm thấy": case chi co ticket THB, chua co don). Quyen xem
  // = CUNG xemDuoc() o routes/thieuHangBh.ts (Kho / TN / Mua hang / Ke toan / View / Admin) - doi 1 ben doi ca 2.
  if (user.la_kho || user.la_tac_nghiep || user.la_mua_hang || user.la_ke_toan || user.la_view || user.vai_tro === "Admin") {
    const { results: rows } = await c.env.DB.prepare(
      `SELECT id, ma_lk, ten_lk, case_id, nguon_id FROM thieu_hang_bh
       WHERE UPPER(id) LIKE ? || '%' OR UPPER(case_id) LIKE ? || '%' OR UPPER(nguon_id) LIKE ? || '%'
       ORDER BY ngay_tao DESC LIMIT 5`,
    )
      .bind(q, q, q)
      .all<{ id: string; ma_lk: string | null; ten_lk: string | null; case_id: string | null; nguon_id: string | null }>();
    for (const r of rows)
      results.push({ type: "thieu_hang_bh", id: r.id, label: `${r.id} — ${r.nguon_id ?? ""}${r.case_id ? ` · ${r.case_id}` : ""} — ${r.ten_lk ?? r.ma_lk ?? ""}` });
  }

  // + tim theo MA LINH KIEN (2026-10-29, "muốn tìm mã linh kiện không tìm được"): don gan nhat co ma LK bat dau bang tu
  // khoa, cung scope xem don. Bo qua khi tu khoa la tien to ma he thong (DDH-/PMH-/...) de khong lap ket qua.
  if (!/^(DDH|PMH|PCN|PTL|PXK|TLK|TRA|THB)-/.test(q)) {
    const scope = scopeDatMuaNguoiTao(c);
    const daCo = new Set(results.map((r) => r.id));
    const { results: rows } = await c.env.DB.prepare(
      `SELECT ddh.id, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.trang_thai_hien_tai AS tt FROM dat_don_hang ddh
       WHERE UPPER(ddh.ma_lk) LIKE ? || '%'${scope?.whereSql ?? ""} ORDER BY ddh.ngay_tao DESC LIMIT 5`,
    )
      .bind(q, ...(scope?.binds ?? []))
      .all<{ id: string; ma_lk: string | null; ten_lk_snapshot: string | null; tt: string | null }>();
    for (const r of rows) if (!daCo.has(r.id)) results.push({ type: "don_hang", id: r.id, label: `${r.id} — ${r.ma_lk ?? ""} ${r.ten_lk_snapshot ?? ""}`.trim() });
  }

  // + tim theo TEN KTV (2026-09-29, "các công cụ tìm kiếm cho phép tìm theo tên ktv"): go ten (khong dau) ->
  // don/PXK gan nhat ma KTV do nhan hang hoac tao, CUNG scope xem nhu tim theo ma o tren (khong rong hon).
  const emails = await emailsTheoTen(c.env.DB, c.req.query("q") ?? "");
  if (emails.length > 0) {
    const json = JSON.stringify(emails);
    const daCo = new Set(results.map((r) => r.id));
    const tenSql = tenNguoiDaySql;
    {
      const scope = scopeDatMuaNguoiTao(c);
      const { results: rows } = await c.env.DB.prepare(
        `SELECT ddh.id, ddh.ma_lk, ddh.ten_lk_snapshot, ${tenSql("ddh.nguoi_nhan_hang")} AS ten
         FROM dat_don_hang ddh
         WHERE (ddh.nguoi_nhan_hang IN (SELECT value FROM json_each(?)) OR ddh.nguoi_tao IN (SELECT value FROM json_each(?)))${scope?.whereSql ?? ""}
         ORDER BY ddh.ngay_tao DESC LIMIT 5`,
      )
        .bind(json, json, ...(scope?.binds ?? []))
        .all<{ id: string; ma_lk: string | null; ten_lk_snapshot: string | null; ten: string | null }>();
      for (const r of rows) if (!daCo.has(r.id)) results.push({ type: "don_hang", id: r.id, label: `${r.id} — ${r.ten ?? ""} — ${r.ten_lk_snapshot ?? r.ma_lk ?? ""}` });
    }
    {
      const scope = scopePxkNguoiNhanHang(c);
      const { results: rows } = await c.env.DB.prepare(
        `SELECT pxk.id, ${tenSql("pxk.nguoi_nhan_hang")} AS ten FROM phieu_xuat_kho pxk
         WHERE pxk.nguoi_nhan_hang IN (SELECT value FROM json_each(?))${scope?.whereSql ?? ""}
         ORDER BY pxk.ngay_tao DESC LIMIT 3`,
      )
        .bind(json, ...(scope?.binds ?? []))
        .all<{ id: string; ten: string | null }>();
      for (const r of rows) if (!daCo.has(r.id)) results.push({ type: "phieu_xuat_kho", id: r.id, label: `${r.id} — ${r.ten ?? ""}` });
    }
  }

  return c.json({ results: results.slice(0, 12) });
});

datMuaLinhKien.get("/don-hang/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const scope = scopeDatMuaNguoiTao(c);
  const whereSql = "ddh.id = ?" + (scope?.whereSql ?? "");
  const binds = [id, ...(scope?.binds ?? [])];

  const ddh = await c.env.DB.prepare(
    `SELECT ddh.*, ddh.trang_thai_hien_tai as trang_thai, ${DAC_THU_DON_SQL("ddh")} as dac_thu, lk.dac_thu as lk_dac_thu, ${TU_HUY_DUOC_SQL("ddh")} as tu_huy_duoc, (SELECT u_gs.giam_sat_quan_ly FROM users u_gs WHERE u_gs.email = ddh.nguoi_tao) as gs_nguoi_tao, ${TN_DOI_TRONG_PXK_SQL("ddh")} as tn_doi_trong_pxk, ${dayLaiHanSql("ddh")} as day_lai_han,
       ${GS_HUY_TRONG_PXK_SQL("ddh")} as gs_huy_trong_pxk, ${MUA_HANG_CHO_HANG_DUOC_SQL("ddh")} as mua_hang_cho_hang_duoc, ${VUOT_TRAN_GHI_CHU_SQL("ddh")} as vuot_tran_ghi_chu,
       ${khoDangXuLyThieuLkSql("ddh")} as kho_dang_xu_ly_thieu_lk,
       (SELECT y.bo_phan FROM yeu_cau_huy_don y WHERE y.dat_don_hang_id = ddh.id AND y.trang_thai = 'Cho dong y') as yeu_cau_huy_bo_phan,
       lk.gia_ban as lk_gia_ban, lk.gia_tri_cong_no as lk_gia_tri_cong_no, lk.gia_du_phong as lk_gia_du_phong,
       -- Buoc hien tai cua don trong phieu (v1.494 - luong quy trinh + nhan trang thai theo buoc o chi tiet don, CUNG bieu thuc danh sach).
       ${TRANG_THAI_PXK_DON_SQL("ddh")} as trang_thai_pxk, ${THANH_TOAN_DON_SQL("ddh")} as thanh_toan
     FROM dat_don_hang ddh
     LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
     WHERE ${whereSql}`,
  )
    .bind(...binds)
    .first<{ id: string; ly_do_cham: string | null; dac_thu: number | null; nguoi_tao: string; trang_thai: string; loai_don: string | null }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);

  // FIX (ra soat "logic sai theo vai tro" 2026-08-29, cung dot voi choDonBiTuChoi o notifications.ts):
  // "hien den khi da xem chi tiet" - mo chi tiet don bi tu choi BANG BAT KY DUONG NAO (khong chi qua
  // chuong thong bao, xem NotificationBell.tsx) deu tu danh dau thong_bao_ktv da_doc=1, dong bo voi
  // dem choDonBiTuChoi. Fire-and-forget (waitUntil) - khong lam cham response chinh.
  if (ddh.trang_thai === "TN tu choi" && ddh.nguoi_tao === user.email) {
    c.executionCtx.waitUntil(
      (async () => {
        await c.env.DB.prepare(
          "UPDATE thong_bao_ktv SET da_doc = 1 WHERE nguoi_nhan = ? AND link_type = 'don_hang' AND link_id = ? AND loai = 'tu_choi' AND da_doc = 0",
        )
          .bind(user.email, id)
          .run();
        await bumpVersions(c.env.DB, ["dat_mua_lk"]);
      })(),
    );
  }

  // SUA (tach he doc lap): dat_don_case chi con luu case_id dang text (khong FK sang case_dvbh nua -
  // bang do khong con trong DB cuc bo), phai tra cuu khach_hang/khu_vuc qua API he cu cho tung ID.
  const [{ results: caseLinks }, { results: logs }, { results: giaiTrinh }] = await Promise.all([
    c.env.DB.prepare("SELECT dat_don_hang_id, case_id FROM dat_don_case WHERE dat_don_hang_id = ?")
      .bind(id)
      .all<{ dat_don_hang_id: string; case_id: string }>(),
    c.env.DB.prepare("SELECT * FROM dat_don_hang_log WHERE dat_don_hang_id = ? ORDER BY id DESC").bind(id).all<{ trang_thai: string; ngay_xu_ly: string }>(),
    // Muc #5: lich su giai trinh (migration 0014) - moi vao dot nay, PXK/detail Drawer deu doc CHUNG
    // danh sach nay de hien "hien tai dang khong the xem duoc ly do giai trinh cham cua don trong PXK"
    // (phan hoi QA) khong con dung nua.
    c.env.DB.prepare("SELECT id, noi_dung, nguoi_tao, ngay_tao FROM dat_don_hang_giai_trinh WHERE dat_don_hang_id = ? ORDER BY id DESC").bind(id).all<{
      id: number; noi_dung: string; nguoi_tao: string; ngay_tao: string;
    }>(),
  ]);
  const casePreviews = await lookupCases(
    (caseLinks as { dat_don_hang_id: string; case_id: string }[]).map((r) => r.case_id),
    c.env,
  );
  const cases = (caseLinks as { dat_don_hang_id: string; case_id: string }[]).map((r) => ({
    dat_don_hang_id: r.dat_don_hang_id,
    id: r.case_id,
    khach_hang: casePreviews.get(r.case_id)?.khach_hang ?? null,
    khu_vuc: casePreviews.get(r.case_id)?.khu_vuc ?? null,
  }));

  // Co "qua han Ly do cham" (xem lib/hanLyDoCham.ts) - SUA (muc #5): moc tinh han GIO LA lan giai
  // trinh GAN NHAT (migration 0014) neu co, khong con "khoa vinh vien" sau lan giai trinh dau tien -
  // chua tung giai trinh lan nao thi fallback ve ban ghi log "Cho TN duyet" MOI NHAT nhu truoc.
  const now = nowVN();
  const choTnDuyetLog = (logs as { trang_thai: string; ngay_xu_ly: string }[]).find((l) => l.trang_thai === "Cho TN duyet");
  const lastGiaiTrinh = (giaiTrinh as { ngay_tao: string }[])[0];
  const mocThoiGian = mocTinhHanTn(lastGiaiTrinh?.ngay_tao, choTnDuyetLog?.ngay_xu_ly); // moc MUON hon (2026-09-29)
  // Don tra hang: han rieng tung giai doan (traHang.ts) - khong dung han "Cho TN duyet" cua don mua.
  const quaHan = ddh.loai_don !== "tra_hang" && !!mocThoiGian && quaHanLyDoCham(mocThoiGian, now);
  // Lich su xu ly don tra hang (2026-10-01): gop ca tra_hang_log (Ke toan duyet mem -> Kho -> QC -> TN duyet tong) vao
  // timeline chi tiet don - truoc day chi doc dat_don_hang_log nen khong thay cac buoc KT/Kho/QC.
  const traHangLogs =
    ddh.loai_don === "tra_hang"
      ? (await c.env.DB.prepare("SELECT * FROM tra_hang_log WHERE dat_don_hang_id = ? ORDER BY id DESC").bind(id).all<{ ngay_xu_ly: string }>()).results
      : [];
  // Don "SỬA CHỮA TẠI KHO" (v1.478): lich su = nhat ky nhan qua API tu app Sua chua (dat_don_ngoai_log), khong co dat_don_hang_log.
  const ngoaiLogs = (ddh as { nguon_ngoai?: string | null }).nguon_ngoai
    ? (
        await c.env.DB.prepare(
          `SELECT id, trang_thai, COALESCE(nguoi_xu_ly_ten, nguoi_xu_ly, 'App Sửa chữa') AS nguoi_xu_ly, ngay_xu_ly, ghi_chu
           FROM dat_don_ngoai_log WHERE dat_don_hang_id = ? ORDER BY ngay_xu_ly DESC, id DESC`,
        ).bind(id).all<{ ngay_xu_ly: string }>()
      ).results
    : [];
  const logsHienThi = traHangLogs.length || ngoaiLogs.length
    ? [...(logs as { ngay_xu_ly: string }[]), ...traHangLogs, ...ngoaiLogs].sort((a, b) => (a.ngay_xu_ly < b.ngay_xu_ly ? 1 : a.ngay_xu_ly > b.ngay_xu_ly ? -1 : 0))
    : logs;

  // FIX (ra soat "logic sai theo vai tro" 2026-08-31, phan hoi "Vệ tinh không cần quan tâm đến PXK...
  // toàn bộ thông tin PXK có thể xem được ở đơn chi tiết"): KTV/Ve tinh KHONG co tab "Phieu xuat kho"
  // rieng (xem canXemPxkTab o DatMuaLinhKienModule.tsx - chi Tac nghiep/Kho/Ke toan/Giam sat moi thay
  // tab do) nen day la NOI DUY NHAT ho xem duoc trang thai PXK cua chinh dong minh + hanh dong "da
  // chuyen tien"/"da nhan hang" (backend GET/PATCH /phieu-xuat-kho/:id da cho phep nguoi_nhan_hang tu
  // lam tu truoc, chi thieu duong dan o FE). 1 dong chi thuoc toi da 1 PXK (migration 0074 "1 PXK = 1
  // KTV").
  const pxk = await c.env.DB.prepare(
    `SELECT pxk.id, pxk.trang_thai_hien_tai as trang_thai, pxk.so_tien_can_chuyen, pxk.trang_thai_chuyen_tien,
            pxk.bang_chung_chuyen_tien_url, pxk.bang_chung_chuyen_tien_anh, pxk.bang_chung_chuyen_tien_ghi_chu, pxk.nguoi_nhan_hang, pxk.ma_xuat_kho,
            pxk.ly_do_tu_choi_chuyen_tien, pxk.tu_choi_chuyen_tien_luc, pxk.da_thanh_toan, pxk.bang_chung_tien_doc,
            pxk.ma_xuat_kho_xac_nhan, pxk.ma_misa, pxk.ma_van_don, pxk.ngay_tao, pxk.nguoi_tao, pxk.loai_don,
            (SELECT COUNT(*) FROM phieu_xuat_kho_dong d2 WHERE d2.phieu_xuat_kho_id = pxk.id) as so_dong,
            ${ANH_DA_GHI_NHAN_SQL("pxk")} as anh_da_ghi_nhan,
            (SELECT so_du FROM quy_ktv WHERE email = pxk.nguoi_nhan_hang) as quy_du,
            -- Luong quy trinh o chi tiet don (v1.494): lan GAN NHAT phieu vao tung buoc + Ke toan duyet tien -> gio cua tung moc.
            (SELECT json_group_object(trang_thai, t) FROM (
               SELECT trang_thai, MAX(ngay_xu_ly) as t FROM phieu_xuat_kho_log
               WHERE phieu_xuat_kho_id = pxk.id
                 AND trang_thai IN ('Dang tao phieu', 'Cho ke toan', 'Da chot xong don xuat', 'Dang gui KTV', 'KTV da nhan', 'Ke toan huy',
                                    'Hang tru kho', 'Kho da ket thuc', 'Kho da nhan hang tra', 'Da dinh bang chung chuyen tien',
                                    'Ke toan da duyet bang chung chuyen tien', 'Tru quy du')
               GROUP BY trang_thai)) as moc_log
     FROM phieu_xuat_kho_dong pxkd JOIN phieu_xuat_kho pxk ON pxk.id = pxkd.phieu_xuat_kho_id
     WHERE pxkd.dat_don_hang_id = ?`,
  )
    .bind(id)
    .first<Record<string, unknown> & { id: string }>();
  // Canh bao "tien da chuyen bi bot" (2026-10-29, lib/tienBiBot.ts) - KTV xem phieu o day.
  if (pxk) pxk.tien_bi_bot = await tienBiBotPxk(c.env.DB, pxk.id);

  // Them (phan hoi 2026-09-10: "đơn gốc cũng không có truy vấn đến đơn ticket đơn thiếu linh kiện") -
  // dat_don_hang khong the co qua 1 ticket thieu_lk dang mo cung luc (xem openThieuLkForDonHang), nen
  // chi lay ban ghi MOI NHAT la du de dan link 2 chieu; frontend dung id nay de mo Drawer ThieuLkTab.
  const thieuLk = await c.env.DB.prepare(
    `SELECT tlk.id, ${latestThieuLkStatusExpr("tlk.id")} as trang_thai, tlk.ngay_du_kien_co_hang, tlk.ngay_hang_ve_thuc_te,
       (SELECT l.ngay_xu_ly FROM thieu_lk_log l WHERE l.thieu_lk_id = tlk.id AND l.trang_thai = 'Kho da tiep nhan' ORDER BY l.id DESC LIMIT 1) as tiep_nhan_luc,
       (SELECT l.nguoi_xu_ly FROM thieu_lk_log l WHERE l.thieu_lk_id = tlk.id AND l.trang_thai = 'Kho da tiep nhan' ORDER BY l.id DESC LIMIT 1) as nguoi_tiep_nhan
     FROM thieu_lk tlk WHERE tlk.dat_don_hang_id = ? ORDER BY tlk.ngay_tao DESC, tlk.id DESC LIMIT 1`,
  )
    .bind(id)
    .first<{ id: string; trang_thai: string }>();

  // "Giá đề xuất" sau chiet khau (2026-09-28) - cung nguon voi danh sach (tienUocTinhChoDon).
  const tienUocTinh = (await tienUocTinhChoDon(c.env.DB, [ddh.id])).get(ddh.id) ?? null;
  // Nut "Trả bằng quỹ dư" (TN/Admin, don chua vao phieu con thieu tien - chot 2026-09-30).
  const tq = canTacNghiep(c) && !pxk ? await thongTinTraBangQuy(c.env.DB, id) : null;
  const traBangQuy = tq && !("error" in tq) ? { can_tra: tq.canTra, quy: tq.quy } : null;
  // Canh bao cong no cho TBP / GS khi duyet (tu dong duyet 100%, 2026-10-14): tran + cong no chot hien tai cua nguoi nhan.
  const ddhX = ddh as unknown as { loai_de_xuat: string | null; nguoi_nhan_hang: string | null; so_tien_cong_no: number | null };
  let congNoNhan: { tran: number | null; chot: number; don: number | null } | null = null;
  if (
    (ddh.trang_thai === "Cho TBP xac nhan" || ddh.trang_thai === "Cho GS duyet") &&
    canDoiChieuCongNo(ddh.loai_don ?? "", ddhX.loai_de_xuat ?? "") && ddhX.nguoi_nhan_hang
  ) {
    const ng = await nguCanhNhan(c.env.DB, ddhX.nguoi_nhan_hang, ddh.nguoi_tao);
    if (ng.maKtv) congNoNhan = { tran: ng.tranCongNo, chot: await computeCongNoChot(c.env.DB, ng.maKtv), don: ddhX.so_tien_cong_no };
  }
  return c.json({
    donHang: { ...ddh, cases, logs: logsHienThi, giaiTrinh, qua_han_ly_do_cham: quaHan, tien_uoc_tinh: tienUocTinh, tra_bang_quy: traBangQuy, cong_no_nhan: congNoNhan, duoc_doi_khu_vuc: await duocDoiKhuVucDon(c.env.DB, user, id),
      duoc_doi_loai_de_xuat: await duocDoiLoaiDeXuatChiTiet(c.env.DB, user, id) },
    pxk: pxk ?? null, thieuLk: thieuLk ?? null,
  });
});

// Mo 1 ca thieu_lk cho 1 DONG don hang khi TN tu choi bang 1 "Ly do cham" co co
// quan_ly_don_thieu_linh_kien=true (xem applyDonHangLog nhanh "tu_choi" ben duoi) - CHOT 2026-08-14:
// chi TN tao duoc ticket nay (khong phai Kho, khac thiet ke ban dau), Kho chi xu ly/giai trinh sau
// khi ticket da "ban" sang. Chi cho phep khi CHUA co ca thieu_lk nao dang mo cho dong nay (tranh 2
// ca song song lam sai logic tu dong quay ve "TN da duyet" khi 1 ca dong).
async function openThieuLkForDonHang(
  c: Context<{ Bindings: Env }>,
  donHangId: string,
  lyDoChamId: number,
): Promise<{ error: string; status: 409 } | { id: string }> {
  // BUG THAT (phat hien 2026-08-18 cung dot voi ma-misa PXK): "id" khong qualify se bi cot "id" cua
  // CHINH thieu_lk_log (PK cua bang do) SHADOW trong subquery tuong quan, thay vi tro ve thieu_lk.id
  // cua bang ngoai - pha vo tuong quan, luon tra NULL. Phai qualify "thieu_lk.id".
  const dangMo = await c.env.DB.prepare(
    `SELECT id FROM thieu_lk WHERE dat_don_hang_id = ? AND ${latestThieuLkStatusExpr("thieu_lk.id")} NOT IN ('Da huy bo', 'Da ket thuc') LIMIT 1`,
  )
    .bind(donHangId)
    .first();
  if (dangMo) return { error: "DA_CO_CA_THIEU_LK_DANG_MO", status: 409 };

  const user = c.get("user");
  const now = nowVN();
  const thieuLkId = await nextSequentialId(c.env.DB, "thieu_lk", "TLK", 6);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO thieu_lk (id, dat_don_hang_id, ly_do_cham_id, nguoi_tao, ngay_tao) VALUES (?, ?, ?, ?, ?)").bind(
      thieuLkId,
      donHangId,
      lyDoChamId,
      user.email,
      now,
    ),
    c.env.DB.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly) VALUES (?, ?, ?, ?)").bind(
      thieuLkId,
      "Cho kho xu ly",
      user.email,
      now,
    ),
  ]);

  // Bao khovan (he Quan ly hang ve kho) biet ngay - xem giai thich day du o pushThieuLkToKhovan()
  // trong lib/khovanPushClient.ts. Best-effort (waitUntil), khong chan tao ticket neu khovan loi/down.
  const ddhRow = await c.env.DB.prepare("SELECT ma_lk, ten_lk_snapshot, nguoi_tao FROM dat_don_hang WHERE id = ?")
    .bind(donHangId)
    .first<{ ma_lk: string; ten_lk_snapshot: string | null; nguoi_tao: string }>();
  if (ddhRow) {
    const senderLabel = `Thiếu LK ${ddhRow.ten_lk_snapshot ?? ddhRow.ma_lk} (báo bởi ${user.email}, của ${ddhRow.nguoi_tao})`;
    c.executionCtx.waitUntil(pushThieuLkToKhovan(c.env, thieuLkId, senderLabel, "Thiếu linh kiện - chờ Kho tìm nguồn hàng", buildWorkUrl(c.env, thieuLkId)));
  }

  return { id: thieuLkId };
}

// Logic dung chung cho 1 DONG don hang - tach ra de route bulk-log tai su dung dung 1 cho, khong
// copy lai role-check. Tra { error, status } khi khong hop le, hoac { nextTrangThai } khi thanh cong.
// "tu_choi" BAT BUOC ly_do_cham_id (tu danh sach settings_ly_do_cham, loc he_thong_su_dung chua
// "Mua hang", bat_tat=1) - CHOT 2026-08-14: he thong tu quyet dinh ket qua la "TN tu choi" (tu choi
// thuong) hay "Cho hang" (tu dong mo ticket thieu_lk gui Kho giai trinh) dua vao co
// quan_ly_don_thieu_linh_kien cua ly do do, KHONG con hanh_dong "cho_hang" rieng nua.
// Thong bao cho NGUOI TAO don khi dong cua ho toi 1 trong 4 moc quan trong (phan hoi 2026-08-26: bo
// qua cac buoc trung gian noi bo nhu "Cho Tram duyet"/"Cho TBP xac nhan" - nguoi tao khong can biet
// tung buoc, chi can biet ket qua cuoi). "Da huy" dung chung cho ca Tram/TBP tu choi LAN tu huy that
// su (hanhDong khac nhau) nen phai phan biet qua hanhDong de chon dung tu "từ chối" hay "huỷ".
// SUA 2026-10-15 ("cần có cảnh báo rõ ràng cho từng trường hợp để người đặt hàng biết lý do"): thong bao KEM ly do (ghi chu cua
// dong log vua ghi - ly do tu choi/huy, ly do cho hang, ket qua kiem tra kho...) + bao them cac buoc he thong tu chuyen (cho thanh
// toan / cho GS / cho TBP) ma truoc day nguoi dat khong biet.
function thongBaoChoNguoiTao(
  hanhDong: "duyet" | "tu_choi" | "huy",
  nextTrangThai: string,
  tenLk: string,
  soLuong: number,
  lyDo?: string | null,
): { loai: string; noiDung: string } | null {
  const ten = `"${tenLk} (x${soLuong})"`;
  const vi = lyDo?.trim() ? ` — Lý do: ${lyDo.trim().slice(0, 300)}` : "";
  if (nextTrangThai === "Da huy") {
    return hanhDong === "huy"
      ? { loai: "huy", noiDung: `Đơn hàng ${ten} của bạn đã bị huỷ${vi}` }
      : { loai: "tu_choi", noiDung: `Đơn hàng ${ten} của bạn đã bị từ chối${vi}` };
  }
  if (nextTrangThai === "TN tu choi") return { loai: "tu_choi", noiDung: `Đơn hàng ${ten} của bạn đã bị từ chối${vi}` };
  if (nextTrangThai === "Cho hang") return { loai: "cho_hang", noiDung: `Đơn hàng ${ten} của bạn chuyển sang chờ hàng${vi}` };
  if (nextTrangThai === "Cho thanh toan") return { loai: "cho_thanh_toan", noiDung: `Đơn hàng ${ten} của bạn thiếu hàng — cần chuyển tiền trước${vi}` };
  if (nextTrangThai === "Cho GS duyet") return { loai: "cho_duyet", noiDung: `Đơn hàng ${ten} của bạn đang chờ Giám sát khu vực duyệt${vi}` };
  if (nextTrangThai === "Cho TBP xac nhan") return { loai: "cho_duyet", noiDung: `Đơn hàng ${ten} của bạn đang chờ TBP DVBH xác nhận linh kiện đặc thù` };
  if (nextTrangThai === "TN da duyet") return { loai: "da_duyet", noiDung: `Đơn hàng ${ten} của bạn đã được duyệt${vi}` };
  return null;
}

// Thong tin ticket thieu hang GAN NHAT cua don dua ra don goc (2026-09-30, phan hoi "đẩy thông tin từ ticket thiếu hàng ra
// đơn gốc: ngày tiếp nhận, thời gian dự kiến có hàng, người tiếp nhận") - dung cho danh sach + chi tiet don.
const tlkCuaDon = (a: string) =>
  `(SELECT t.id FROM thieu_lk t WHERE t.dat_don_hang_id = ${a}.id ORDER BY t.ngay_tao DESC, t.id DESC LIMIT 1)`;
const THIEU_LK_DON_COT = (a: string) => `
       (SELECT t.ngay_du_kien_co_hang FROM thieu_lk t WHERE t.id = ${tlkCuaDon(a)}) as tlk_ngay_du_kien,
       (SELECT t.ngay_hang_ve_thuc_te FROM thieu_lk t WHERE t.id = ${tlkCuaDon(a)}) as tlk_ngay_hang_ve,
       (SELECT l.ngay_xu_ly FROM thieu_lk_log l WHERE l.thieu_lk_id = ${tlkCuaDon(a)} AND l.trang_thai = 'Kho da tiep nhan' ORDER BY l.id DESC LIMIT 1) as tlk_tiep_nhan_luc,
       (SELECT l.nguoi_xu_ly FROM thieu_lk_log l WHERE l.thieu_lk_id = ${tlkCuaDon(a)} AND l.trang_thai = 'Kho da tiep nhan' ORDER BY l.id DESC LIMIT 1) as tlk_nguoi_tiep_nhan`;

// "Chờ thanh toán" gop (sentinel __CHO_TT__, 2026-10-27): don thieu hang cho chuyen tien + don DA duyet ma tien chua duoc Ke toan
// xac nhan. Dung CHUNG THANH_TOAN_DON_SQL voi cot "Chuyển tiền" cua danh sach.
const CHO_THANH_TOAN_GOP_SQL = `(ddh.trang_thai_hien_tai = 'Cho thanh toan' OR (ddh.trang_thai_hien_tai = 'TN da duyet'
  AND ${THANH_TOAN_DON_SQL("ddh")} IN ('cho_thanh_toan', 'cho_xac_nhan')))`;

// Don bat buoc chuyen tien truoc (migration 0057) ma CHUA "Đã thanh toán" (Ke toan chua xac nhan tien phieu chua don va don
// khong mang tien da tra) -> chua duoc chuyen "Cho hang" (chot 2026-09-30). Dung CHUNG dinh nghia THANH_TOAN_DON_SQL.
// Chot 2026-10-02: CHI chan don LINH KIEN DAC THU (hieu luc, DAC_THU_DON_SQL) - don thuong chua tien van "Cho hang" duoc.
async function chuaChuyenTienChoHang(db: D1Database, donHangId: string): Promise<boolean> {
  const r = await db
    .prepare(
      `SELECT ddh.bat_buoc_chuyen_tien as bb, ${DAC_THU_DON_SQL("ddh")} as dt, ${THANH_TOAN_DON_SQL("ddh")} as tt, ddh.thanh_toan_sau_luc as tsl
       FROM dat_don_hang ddh LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk WHERE ddh.id = ?`,
    )
    .bind(donHangId)
    .first<{ bb: number; dt: number; tt: string; tsl: string | null }>();
  if (r && r.tsl) return false; // TN/Ke toan da cho phep thanh toan sau (migration 0094)
  return !!r?.bb && !!r.dt && r.tt !== "da_thanh_toan" && r.tt !== "khong_can" && r.tt !== "cong_no_doi_tac";
}

async function applyDonHangLog(
  c: Context<{ Bindings: Env }>,
  donHangId: string,
  hanhDong: "duyet" | "tu_choi" | "huy",
  lyDoChamId: number | undefined,
  ghiChu: string | undefined,
  // FIX (phan hoi QA 2026-08-31, muc #4): TN sua "SL thuc xuat" NGAY LUC DUYET (khong phai qua PATCH
  // /don-hang/:id tuy y truoc do, von khong bat buoc ghi chu/khong ghi log) - 2 tham so MOI, CHI co
  // nghia khi hanhDong==="duyet" (xem kiem tra ben duoi).
  soLuongThucXuat: number | undefined,
  ghiChuSoLuong: string | undefined,
  // true = TN thao tac tu TRONG man phieu xuat kho -> don cuoi roi phieu thi GIU phieu trong (dong man phieu moi
  // tu huy), false = huy phieu ngay (chot 2026-09-28, muc 5).
  giuPhieuTrong = false,
  // Ghi chu cho dong log "TN da duyet" cua ticket thieu LK khi TN duyet tu CHINH ticket (applyThieuLkLog).
  // maEo: ma EO GS / TBP nhap khi duyet don vuot tran cong no (chot 2026-10-14, migration 0080).
  // boQuaQuyenHuy (v1.455): huy THEO YEU CAU HUY DON da duoc phan loai / bo phan dong y (lib yeu cau huy o cuoi file) - bo qua kiem
  // tra "ai duoc huy" (nguoi yeu cau la KTV / GS, nguoi bam co the la Kho / Ke toan), cac kiem tra trang thai giu nguyen.
  opts: { ghiChuTicket?: string; maEo?: string; boQuaQuyenHuy?: boolean } = {},
): Promise<{ error: string; status: 404 | 409 | 403 | 400 } | { nextTrangThai: string }> {
  const ddh = await c.env.DB.prepare(
    `SELECT ddh.loai_don, ddh.loai_de_xuat, ddh.nguoi_tao, ddh.nguoi_nhan_hang, ddh.email_gs, ddh.version, (SELECT u_gs.giam_sat_quan_ly FROM users u_gs WHERE u_gs.email = ddh.nguoi_tao) as gs_nguoi_tao, ddh.ly_do_cham, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat,
            COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) as khu_vuc_hl,
            ddh.ma_xuat_kho, ddh.danh_gia_cong_no, ddh.ma_eo, ddh.ma_lk, ${DAC_THU_DON_SQL("ddh")} as dac_thu, ${latestDonHangStatusExpr("ddh.id")} as trang_thai, ${choTnDuyetAtExpr("ddh.id")} as cho_tn_duyet_at,
            ${lastGiaiTrinhAtExpr("ddh.id")} as last_giai_trinh_at
     FROM dat_don_hang ddh LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk WHERE ddh.id = ?`,
  )
    .bind(donHangId)
    .first<{
      loai_don: string; loai_de_xuat: string | null; nguoi_tao: string; nguoi_nhan_hang: string | null; email_gs: string | null; version: number; ly_do_cham: string | null; gs_nguoi_tao: string | null;
      khu_vuc_hl: string | null;
      ten_lk_snapshot: string; so_luong_de_xuat: number; ma_xuat_kho: string | null; dac_thu: number | null; trang_thai: string | null;
      cho_tn_duyet_at: string | null; last_giai_trinh_at: string | null; danh_gia_cong_no: string | null; ma_eo: string | null; ma_lk: string | null;
    }>();
  if (!ddh) return { error: "NOT_FOUND", status: 404 };
  if (ddh.loai_don === "tra_hang") return { error: "USE_TRA_HANG_ROUTE", status: 400 };
  // FIX (phan hoi 2026-09-24: "Đơn đã duyệt chờ tạo xuất bổ sung thêm nút từ chối cho TN") - "TN da
  // duyet" von la 1 trong 4 trang thai DONG cua state machine nay (khong cho tiep tuc duyet/tu choi/
  // huy SAU KHI da duyet), nhung TN can 1 duong thoat rieng de HUY QUYET DINH DUYET cua chinh minh
  // TRUOC KHI dong duoc gom vao 1 PXK nao (ma_xuat_kho con NULL - dong bo gom vao PXK roi thi theo doi
  // qua chinh PXK do, khong con y nghia "tu choi don" nua). Cho phep NGOAI LE DUY NHAT: hanhDong===
  // "tu_choi" tu dung "TN da duyet" + chua gan PXK, xu ly o nhanh rieng ben duoi (KHONG dung chung
  // nhanh "Cho TN duyet" vi khong can chon Ly do cham - xem xac nhan nguoi dung).
  // MO RONG (phan hoi 2026-09-28 "Đơn hàng đang trong trạng thái chưa thêm vào phiếu xk => cho phép các
  // thao tác hủy/từ chối/chờ hàng cho TN"): tu "TN da duyet" + chua vao PXK, TN duoc Tu choi (ly do tu do),
  // Cho hang (chon ly do "quan ly thieu linh kien" -> mo ticket thieu_lk) VA Huy.
  // MO RONG (chot 2026-09-28, muc 5): don "TN da duyet" DA vao PXK nhung phieu con "Dang tao phieu" + Ke toan
  // chua duyet chuyen tien -> TN van Huy/Tu choi/Cho hang duoc, don tu go khoi phieu (goDonKhoiPxk o duoi).
  const user = c.get("user");
  // GS khu vuc HUY HO don cho KTV khu vuc minh (chot 2026-10-23, v1.399 - "cho phép giám sát khu vực hủy hộ đơn cho ktv khu vực
  // mình"; v1.400 "cho phép hủy hộ đơn hàng do KTV thuộc khu vực của giám sát đặt hàng"): GS = email_gs cua don (GS khu vuc hien tai
  // cua KTV nhan hang) HOAC GS cua KTV TAO don (users.giam_sat_quan_ly cua nguoi_tao) duoc huy NHU CHINH KTV dat don (cung cac buoc
  // nguoi tao huy duoc + tu huy don tu duyet trong phieu chua thao tac); bat buoc ly do, log "GS hủy hộ KTV". Ban sao FE: actionsFor.
  // v1.410 (2026-10-27): GS huy duoc ca don "TN da duyet" trong phieu Ke toan chua chot tien / phieu khong tien chua chot (pxkGsHuyDuoc).
  // + GS PHU cua khu vuc hieu luc cua don (user_khu_vuc, chot 2026-11-01 - quyen nhu GS chinh, xem laGsCuaKhuVuc).
  const gsHuyHo =
    hanhDong === "huy" && user.vai_tro === "Giam sat" && ddh.nguoi_tao !== user.email &&
    (ddh.email_gs === user.email || ddh.gs_nguoi_tao === user.email || (await laGsCuaKhuVuc(c.env.DB, user.email, ddh.khu_vuc_hl)));
  const tnTrongPxkId =
    ddh.trang_thai === "TN da duyet" && ddh.ma_xuat_kho != null && (hanhDong === "tu_choi" || hanhDong === "huy")
      ? canTacNghiep(c)
        ? await pxkTnDoiDuoc(c.env.DB, donHangId)
        : gsHuyHo
          ? await pxkGsHuyDuoc(c.env.DB, donHangId)
          : null
      : null;
  const chuaVaoPxkSauDuyet = ddh.trang_thai === "TN da duyet" && (ddh.ma_xuat_kho == null || !!tnTrongPxkId);
  const laTuChoiSauDuyet = hanhDong === "tu_choi" && chuaVaoPxkSauDuyet;
  const laHuySauDuyet = hanhDong === "huy" && chuaVaoPxkSauDuyet;
  // KTV/nguoi tao TU HUY don tu duyet da tu gom vao PXK (chot 2026-09-28, lib/pxkTuHuy.ts) - chi khi PXK con
  // "Dang tao phieu", Ke toan chua duyet chuyen tien, van phong chua thao tac tay. Don duy nhat -> huy ca phieu.
  const tuHuyPxkId =
    hanhDong === "huy" && ddh.trang_thai === "TN da duyet" && ddh.ma_xuat_kho != null &&
    (user.email === ddh.nguoi_tao || user.email === ddh.nguoi_nhan_hang || gsHuyHo)
      ? await pxkDuocTuHuy(c.env.DB, donHangId)
      : null;
  // Don "Cho hang" (chot 2026-09-30): ticket thieu LK Kho CHUA tiep nhan (hoac da dong/khong con) -> thao tac nhu don
  // "Cho TN duyet" (duyet/tu choi/cho hang lai/huy), ticket dang cho tu huy; Kho DA tiep nhan (dang xu ly) -> khoa, cho Kho.
  let laChoHangMoKhoa = false;
  if (ddh.trang_thai === "Cho hang") {
    const khoa = await c.env.DB.prepare(`SELECT ${khoDangXuLyThieuLkSql("dat_don_hang")} as khoa FROM dat_don_hang WHERE id = ?`)
      .bind(donHangId)
      .first<{ khoa: number }>();
    if (khoa?.khoa) {
      // Kho / Mua hang DA xac nhan xu ly ticket -> KTV / nguoi tao khong huy duoc nua; CHI Kho / Mua hang / Admin huy (chot 2026-10-27,
      // "Đơn chờ linh kiện không cho phép KTV hủy đơn nếu kho hoặc nhân viên mua hàng đã xác nhận xử lý (kho hoặc nhân viên mua hàng
      // hủy được)") = huy ticket -> don goc tu huy (applyThieuLkLog "Da huy bo" -> huyDonChoHangTuDong, tien ve quy).
      if (hanhDong === "huy" && (canKho(c) || laMuaHangXuLy(c))) {
        if (!ghiChu?.trim()) return { error: "THIEU_LY_DO_HUY", status: 400 };
        const tk = await c.env.DB.prepare(
          `SELECT id FROM thieu_lk WHERE dat_don_hang_id = ? AND ${latestThieuLkStatusExpr("thieu_lk.id")} NOT IN ('Da huy bo', 'Da ket thuc')
           ORDER BY ngay_tao DESC, id DESC LIMIT 1`,
        ).bind(donHangId).first<{ id: string }>();
        if (!tk) return { error: "STATE_CHANGED", status: 409 };
        const r = await applyThieuLkLog(c, tk.id, "Da huy bo", ghiChu, undefined);
        if ("error" in r) return r;
        return { nextTrangThai: "Da huy" };
      }
      return { error: "THIEU_LK_KHO_DANG_XU_LY", status: 409 };
    }
    laChoHangMoKhoa = true;
  }
  if (ddh.trang_thai && (DON_HANG_TRANG_THAI_DONG as readonly string[]).includes(ddh.trang_thai) && !laTuChoiSauDuyet && !laHuySauDuyet && !tuHuyPxkId && !laChoHangMoKhoa) {
    return { error: "DONG_DA_DONG", status: 409 };
  }

  let nextTrangThai: string;
  let tnDaXuLy = false; // TN vua xu ly dong nay - dung de auto-claim khu vuc phu trach (xem duoi)
  // Tu dong duyet 100% (chot 2026-10-14): Tram/TBP/GS duyet xong -> he thong tu dinh tuyen (TBP / GS / tu duyet / cho thanh toan /
  // cho hang) qua lib/tuDongDuyet.ts trangThaiSauDuyet - tac dong phu (vao phieu, mo ticket, bao GS) chay sau CAS.
  let dinhTuyenTuDong = false;
  let lyDoDinhTuyen = "";
  const maEo = opts.maEo?.trim().slice(0, 100) || null;
  const dinhTuyen = async (tuBuoc: "tram" | "tbp" | "gs") => {
    const kq = await trangThaiSauDuyet(c.env.DB, donHangId, tuBuoc);
    dinhTuyenTuDong = true;
    lyDoDinhTuyen = kq.ton != null ? moTaThieuTon(kq.ton, ddh.so_luong_de_xuat, kq.khuVuc) : "";
    return kq.trangThai;
  };

  if (hanhDong === "huy") {
    // FIX (phan hoi 2026-09-05, muc #4: "Ngoài người tạo và admin hệ thống không ai có quyền hủy đơn
    // hàng (TN chỉ có quyền từ chối)") - truoc day CHO PHEP CA Tram cua nguoi tao huy don, gio CHI
    // dung nguoi tao that su hoac Admin (khop dung actionsFor() o frontend, xem helpers.ts).
    // MO RONG 2026-09-28: TN huy duoc don "Cho TN duyet" va "TN da duyet" chua vao PXK (don da duyet
    // CHI TN/Admin huy duoc - nguoi tao khong tu huy sau khi TN da duyet).
    // + "Cho GS duyet" / "Cho thanh toan" (chot 2026-10-14).
    const tnDuocHuy = canTacNghiep(c) && (ddh.trang_thai === "Cho TN duyet" || ddh.trang_thai === "Cho GS duyet" || ddh.trang_thai === "Cho thanh toan" || laChoHangMoKhoa || chuaVaoPxkSauDuyet);
    if (laHuySauDuyet && !tnDuocHuy && !gsHuyHo && user.vai_tro !== "Admin" && !opts.boQuaQuyenHuy) return { error: "FORBIDDEN_ROLE", status: 403 };
    if (ddh.nguoi_tao !== user.email && user.vai_tro !== "Admin" && !tnDuocHuy && !tuHuyPxkId && !gsHuyHo && !opts.boQuaQuyenHuy) return { error: "FORBIDDEN_ROLE", status: 403 };
    // Chot phan hoi UX 2026-08-15 (muc 1): bat buoc nguoi huy nhap ly do (tu do, khong dung danh muc
    // Ly do cham cua TN vi khong hop nghia voi tu huy).
    if (!ghiChu?.trim()) return { error: "THIEU_LY_DO_HUY", status: 400 };
    if (gsHuyHo && !tnDuocHuy && user.vai_tro !== "Admin" && !opts.boQuaQuyenHuy) ghiChu = `GS hủy hộ KTV: ${ghiChu.trim()}`;
    nextTrangThai = "Da huy";
  } else if (ddh.trang_thai === "Cho Tram duyet") {
    const nguoiTaoRow = await c.env.DB.prepare("SELECT tram_cha FROM users WHERE email = ?").bind(ddh.nguoi_tao).first<{ tram_cha: string | null }>();
    if (nguoiTaoRow?.tram_cha !== user.email && user.vai_tro !== "Admin") return { error: "FORBIDDEN_ROLE", status: 403 };
    // Tram tu choi = huy han (khong phai "TN tu choi") - giu nguyen hanh vi da co truoc khi tach
    // xuong cap dong. CHOT 2026-08-17: Tram duyet xong -> "Cho TBP xac nhan" truoc neu ma LK dac
    // thu (migration 0082), khong di thang "Cho TN duyet" nhu truoc.
    // FIX (phan hoi 2026-08-25, hang muc #19): bat buoc ghi_chu khi tu choi - dao nguoc quyet dinh cu
    // "ghi chu tuy chon" (moi buoc huy/tu choi deu phai nhap ly do, khong chi buoc cuoi cung).
    if (hanhDong !== "duyet" && !ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 400 };
    // Tu dong duyet 100% (2026-10-14): Tram duyet -> TBP (dac thu) / GS (vuot tran) / ton kho - khong con ve "Cho TN duyet".
    nextTrangThai = hanhDong === "duyet" ? await dinhTuyen("tram") : "Da huy";
  } else if (ddh.trang_thai === "Cho TBP xac nhan") {
    if (!canTPDvbhXacNhan(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    if (hanhDong !== "duyet" && hanhDong !== "tu_choi") return { error: "INVALID_HANH_DONG", status: 400 };
    // Chot 2026-10-14: TBP duyet = cho phep vuot cong no, nhung don VUOT TRAN bat buoc nhap ma EO (FE canh bao truoc). Duyet xong -> he
    // thong kiem tra ton kho (du -> tu duyet + vao phieu, thieu -> cho hang / cho thanh toan) thay vi ve "Cho TN duyet".
    if (hanhDong === "duyet" && canDoiChieuCongNo(ddh.loai_don, ddh.loai_de_xuat ?? "") && ddh.danh_gia_cong_no === "Khong du" && !maEo && !ddh.ma_eo) {
      return { error: "MISSING_MA_EO", status: 400 };
    }
    nextTrangThai = hanhDong === "duyet" ? await dinhTuyen("tbp") : "Da huy";
    // FIX (phan hoi 2026-08-25, hang muc #19): bat buoc ghi_chu khi tu choi (truoc day "tuy chon" -
    // xem comment cu da xoa, dao nguoc quyet dinh CHOT 2026-08-17).
    if (hanhDong === "tu_choi" && !ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 400 };
  } else if (ddh.trang_thai === "Cho GS duyet") {
    // Don cong no / ho tro VUOT TRAN (chot 2026-10-14): CHI GS khu vuc cua KTV (dat_don_hang.email_gs) hoac Admin. Duyet bat buoc ma
    // EO (nhap tu do) -> kiem tra ton kho; tu choi bat buoc ly do -> "Da huy".
    // + GS PHU cua khu vuc (chot 2026-11-01).
    if (user.email !== ddh.email_gs && user.vai_tro !== "Admin" && !(user.vai_tro === "Giam sat" && (await laGsCuaKhuVuc(c.env.DB, user.email, ddh.khu_vuc_hl)))) {
      return { error: "KHONG_PHAI_GS_KHU_VUC", status: 403 };
    }
    if (hanhDong === "duyet") {
      if (!maEo) return { error: "MISSING_MA_EO", status: 400 };
      nextTrangThai = await dinhTuyen("gs");
    } else if (hanhDong === "tu_choi") {
      if (!ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 400 };
      nextTrangThai = "Da huy";
    } else {
      return { error: "INVALID_HANH_DONG", status: 400 };
    }
  } else if (ddh.trang_thai === "Cho TN duyet" || laChoHangMoKhoa) {
    if (!canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    tnDaXuLy = true;
    // Tu dong duyet 100% (chot 2026-10-14): don "Cho hang" (thieu hang thuc te) KHONG duyet tay duoc - Kho quyet dinh (hang ve ->
    // tu duyet, tu choi -> huy); TN chi con Tu choi / Huy.
    if (laChoHangMoKhoa && hanhDong === "duyet") return { error: "CHO_HANG_KHO_QUYET_DINH", status: 409 };
    if (hanhDong === "duyet") {
      // FIX (phan hoi 2026-08-25, hang muc #17/#18): don da qua han 24h "Cho TN duyet" (chua co
      // ly_do_cham) bat buoc chon 1 ly do (dung LAI danh sach settings_ly_do_cham dang dung cho
      // "Tu choi/Cho hang" - khong tao khai niem "ly do qua han" rieng) truoc khi duoc Duyet. Don
      // chua qua han giu hanh vi cu: Duyet ngay, khong hoi gi.
      // SUA (phan hoi QA 2026-08-31, muc #5): moc tinh han GIO LA lan giai trinh GAN NHAT (migration
      // 0014, dat_don_hang_giai_trinh) neu co, thay vi "co ly_do_cham hay khong" (khoa vinh vien sau
      // lan giai trinh dau tien - dao nguoc quyet dinh cu da xoa). Fallback ve cho_tn_duyet_at khi
      // chua tung giai trinh lan nao - PHAI khop CHINH XAC cong thuc dung o GET /don-hang (danh sach)
      // va GET /don-hang/:id, tranh FE/BE lech nhau (bai hoc tu doan audit 2026-08-26 truoc do).
      const mocThoiGianTn = mocTinhHanTn(ddh.last_giai_trinh_at, ddh.cho_tn_duyet_at);
      if (mocThoiGianTn && quaHanLyDoCham(mocThoiGianTn, nowVN())) {
        if (!lyDoChamId) return { error: "MISSING_LY_DO_CHAM", status: 400 };
        const lyDo = await c.env.DB.prepare(
          "SELECT id, ten_ly_do FROM settings_ly_do_cham WHERE id = ? AND bat_tat = 1 AND he_thong_su_dung LIKE '%Mua hàng%'",
        )
          .bind(lyDoChamId)
          .first<{ id: number; ten_ly_do: string }>();
        if (!lyDo) return { error: "LY_DO_CHAM_KHONG_HOP_LE", status: 400 };
        ghiChu = lyDo.ten_ly_do + (ghiChu?.trim() ? ` - ${ghiChu.trim()}` : "");
      }
      // FIX (phan hoi QA 2026-08-31, muc #4): "SL thuc xuat" khac "SL de xuat" luc duyet bat buoc
      // ghi_chu_so_luong (chan o day, khong tin FE) - noi vao CUNG dong log "TN da duyet" (thay vi
      // tao 1 dong log rieng - trang_thai cua dat_don_hang_log la CHECK constraint co dinh, khong the
      // them gia tri moi, xem migration 0001_init.sql).
      if (soLuongThucXuat != null && soLuongThucXuat !== ddh.so_luong_de_xuat) {
        if (!ghiChuSoLuong?.trim()) return { error: "MISSING_GHI_CHU_SO_LUONG", status: 400 };
        const ghiChuDoiSl = `Đổi SL thực xuất ${ddh.so_luong_de_xuat} → ${soLuongThucXuat}: ${ghiChuSoLuong.trim()}`;
        ghiChu = ghiChu?.trim() ? `${ghiChu.trim()} | ${ghiChuDoiSl}` : ghiChuDoiSl;
      }
      nextTrangThai = "TN da duyet";
    } else if (hanhDong === "tu_choi") {
      if (!lyDoChamId) return { error: "MISSING_LY_DO_CHAM", status: 400 };
      const lyDo = await c.env.DB.prepare(
        "SELECT id, ten_ly_do, quan_ly_don_thieu_linh_kien FROM settings_ly_do_cham WHERE id = ? AND bat_tat = 1 AND he_thong_su_dung LIKE '%Mua hàng%'",
      )
        .bind(lyDoChamId)
        .first<{ id: number; ten_ly_do: string; quan_ly_don_thieu_linh_kien: number }>();
      if (!lyDo) return { error: "LY_DO_CHAM_KHONG_HOP_LE", status: 400 };

      if (lyDo.quan_ly_don_thieu_linh_kien) {
        // Chot 2026-09-30: don bat buoc chuyen tien truoc (migration 0057) CHUA chuyen tien -> khong cho "Cho hang".
        if (await chuaChuyenTienChoHang(c.env.DB, donHangId)) return { error: "CHUA_CHUYEN_TIEN_KHONG_CHO_HANG", status: 409 };
        // Ticket cu con mo (vd Kho da bao hang ve, don quay lai "Cho TN duyet") -> dong truoc khi mo ticket MOI.
        await dongThieuLkMoCuaDon(c.env.DB, donHangId, "Da huy bo", user.email, "Tự động đóng: TN chuyển đơn gốc sang Chờ hàng (mở ticket mới)");
        const opened = await openThieuLkForDonHang(c, donHangId, lyDo.id);
        if ("error" in opened) return opened;
        nextTrangThai = "Cho hang";
      } else {
        nextTrangThai = "TN tu choi";
      }
      ghiChu = lyDo.ten_ly_do + (ghiChu?.trim() ? ` - ${ghiChu.trim()}` : "");
    } else {
      return { error: "INVALID_HANH_DONG", status: 400 };
    }
  } else if (laTuChoiSauDuyet) {
    // Tu choi SAU KHI da duyet, truoc khi gom vao PXK (phan hoi 2026-09-24) - CHI TN (khong qua Tram/
    // TBP, don da qua het 2 buoc do roi), ly do TU DO bat buoc (giong pattern "Huỷ", KHONG chon tu
    // danh muc settings_ly_do_cham nhu tu_choi thuong - danh muc do gan voi ngu canh TRUOC duyet).
    if (!canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    tnDaXuLy = true;
    if (lyDoChamId) {
      // "Cho hang" tu don da duyet (2026-09-28) - cung co che voi "Cho TN duyet": ly do co co
      // quan_ly_don_thieu_linh_kien -> mo ticket thieu_lk + "Cho hang"; ly do khac -> "TN tu choi".
      const lyDo = await c.env.DB.prepare(
        "SELECT id, ten_ly_do, quan_ly_don_thieu_linh_kien FROM settings_ly_do_cham WHERE id = ? AND bat_tat = 1 AND he_thong_su_dung LIKE '%Mua hàng%'",
      )
        .bind(lyDoChamId)
        .first<{ id: number; ten_ly_do: string; quan_ly_don_thieu_linh_kien: number }>();
      if (!lyDo) return { error: "LY_DO_CHAM_KHONG_HOP_LE", status: 400 };
      if (lyDo.quan_ly_don_thieu_linh_kien) {
        // Chot 2026-09-30: don bat buoc chuyen tien truoc (migration 0057) CHUA chuyen tien -> khong cho "Cho hang".
        if (await chuaChuyenTienChoHang(c.env.DB, donHangId)) return { error: "CHUA_CHUYEN_TIEN_KHONG_CHO_HANG", status: 409 };
        // Ticket cu con mo (vd Kho da bao hang ve, don quay lai "Cho TN duyet") -> dong truoc khi mo ticket MOI.
        await dongThieuLkMoCuaDon(c.env.DB, donHangId, "Da huy bo", user.email, "Tự động đóng: TN chuyển đơn gốc sang Chờ hàng (mở ticket mới)");
        const opened = await openThieuLkForDonHang(c, donHangId, lyDo.id);
        if ("error" in opened) return opened;
        nextTrangThai = "Cho hang";
      } else {
        nextTrangThai = "TN tu choi";
      }
      ghiChu = lyDo.ten_ly_do + (ghiChu?.trim() ? ` - ${ghiChu.trim()}` : "");
    } else {
      if (!ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 400 };
      nextTrangThai = "TN tu choi";
    }
  } else {
    return { error: "INVALID_STATE", status: 409 };
  }

  // RA SOAT BAO MAT 2026-08-18 (phan hoi Codex #8, migration 0087): UPDATE co dieu kien tren
  // version/trang_thai_hien_tai TRUOC khi ghi log - 2 request chuyen trang thai dong thoi cho CUNG 1
  // dong (vd 2 tab TN cung bam duyet/tu choi) truoc day deu doc thay trang thai cu (correlated
  // subquery) va deu ghi duoc 1 dong log, co the tao 2 quyet dinh mau thuan. Gio chi request nao
  // "thang" duoc UPDATE (khop dung version da doc luc dau ham) moi duoc ghi log; request thua nhan
  // 409 STATE_CHANGED, KHONG ghi log (tranh log rac/mau thuan).
  // Muc #4: chi ghi so_luong_thuc_xuat KEM trong CUNG 1 UPDATE khi thuc su o nhanh "duyet" va co gia
  // tri truyen len - tranh ghi de NULL len dong khong lien quan (tu_choi/huy khong co khai niem nay).
  const capNhatSoLuong = nextTrangThai === "TN da duyet" && soLuongThucXuat != null;
  // Don "Cho hang" mo khoa: chan luon trong CUNG cau UPDATE neu Kho vua tiep nhan ticket (Kho tiep nhan khong doi version don).
  const chanKhoTiepNhan = laChoHangMoKhoa ? ` AND NOT ${khoDangXuLyThieuLkSql("dat_don_hang")}` : "";
  const casResult = await c.env.DB.prepare(
    (capNhatSoLuong
      ? "UPDATE dat_don_hang SET trang_thai_hien_tai = ?, so_luong_thuc_xuat = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?"
      : "UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?") + chanKhoTiepNhan,
  )
    .bind(...(capNhatSoLuong ? [nextTrangThai, soLuongThucXuat, nowVN(), donHangId, ddh.version] : [nextTrangThai, nowVN(), donHangId, ddh.version]))
    .run();
  if (!casResult.meta.changes) return { error: "STATE_CHANGED", status: 409 };

  // Ma EO (GS / TBP duyet don vuot tran) + ghi chu dinh tuyen tu dong vao CUNG dong log.
  if (maEo && hanhDong === "duyet") {
    await c.env.DB.prepare("UPDATE dat_don_hang SET ma_eo = ?, ma_eo_nguoi = ?, ma_eo_luc = ? WHERE id = ?").bind(maEo, user.email, nowVN(), donHangId).run();
  }
  const ghiChuLog = [
    maEo && hanhDong === "duyet" ? `Mã EO: ${maEo}` : "",
    ghiChu?.trim() ?? "",
    dinhTuyenTuDong && nextTrangThai === "TN da duyet" ? `Tự động duyệt: ${lyDoDinhTuyen || "kho đủ hàng"} — vào phiếu xuất kho` : "",
    dinhTuyenTuDong && nextTrangThai === "Cho hang" ? `Tự động: ${lyDoDinhTuyen} — thiếu hàng, chờ hàng` : "",
    dinhTuyenTuDong && nextTrangThai === "Cho thanh toan" ? `Tự động: ${lyDoDinhTuyen} — thiếu hàng, cần chuyển tiền trước` : "",
    dinhTuyenTuDong && nextTrangThai === "Cho GS duyet" ? "Vượt trần công nợ — chờ Giám sát khu vực duyệt (nhập mã EO)" : "",
    dinhTuyenTuDong && nextTrangThai === "Cho TBP xac nhan" ? "Linh kiện đặc thù — chờ TBP DVBH xác nhận" : "",
  ].filter(Boolean).join(" | ");
  await c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(donHangId, nextTrangThai, user.email, nowVN(), ghiChuLog || null, dinhTuyenTuDong && nextTrangThai === "TN da duyet" ? 1 : 0)
    .run();

  // Dong bo ticket thieu LK cua don (2026-09-29): TN duyet don goc -> ticket "TN da duyet"; don bi tu choi/huy ->
  // ticket tu dong (ghi ro ly do). Chi cham ticket CON MO (1 cau INSERT...SELECT).
  if (ddh.trang_thai === "Cho TN duyet" && nextTrangThai === "TN da duyet") {
    await dongThieuLkMoCuaDon(c.env.DB, donHangId, "Da ket thuc", user.email, opts.ghiChuTicket ?? `Tự động: TN duyệt đơn gốc ${donHangId}`);
  } else if (laChoHangMoKhoa && nextTrangThai === "TN da duyet") {
    await dongThieuLkMoCuaDon(c.env.DB, donHangId, "Da huy bo", user.email, `Tự động hủy: TN duyệt thẳng đơn gốc ${donHangId} khi Kho chưa tiếp nhận ticket`);
  } else if (nextTrangThai === "TN tu choi" || nextTrangThai === "Da huy") {
    const lyDo = ghiChu?.trim() ? `: ${ghiChu.trim()}` : "";
    await dongThieuLkMoCuaDon(c.env.DB, donHangId, "Da huy bo", user.email, `Tự động đóng: ${nextTrangThai === "Da huy" ? "đơn gốc bị hủy" : "TN từ chối đơn gốc"}${lyDo}`);
  }
  // Don dang mang tien da thanh toan (migration 0056) bi tu choi/huy -> trigger trg_ddh_hoan_tien_da_tra da hoan ve quy
  // -> phan bo tiep cho phieu "Cho KTV chuyen" cu nhat cua cung nguoi (giu bat bien quy).
  if ((nextTrangThai === "TN tu choi" || nextTrangThai === "Da huy") && ddh.nguoi_nhan_hang) {
    await phanBoQuyNguoi(c.env.DB, ddh.nguoi_nhan_hang, user.email); // ca 2 quy (don KH chuyen khoan hoan ve quy KH)
  }

  // Roi "TN da duyet" khi dang nam trong PXK -> go khoi phieu (KTV tu huy: luon huy phieu neu trong; TN: theo
  // noi thao tac - giuPhieuTrong).
  // Chot 2026-09-30: don CHUA TN duyet nam trong phieu (vao phieu tu luc tao de chuyen tien truoc) bi huy/tu choi/chuyen
  // "Cho hang" (boi TN, KTV, Tram, TBP) -> cung go khoi phieu. "Cho hang" -> don MANG THEO tien da tra (chot nguoi dung).
  const pxkChuaDuyetId =
    !tuHuyPxkId && !tnTrongPxkId && ddh.trang_thai !== "TN da duyet" && ddh.ma_xuat_kho != null &&
    (nextTrangThai === "Da huy" || nextTrangThai === "TN tu choi" || nextTrangThai === "Cho hang")
      ? await pxkChuaDonChuaDuyet(c.env.DB, donHangId)
      : null;
  const pxkCanGo = tuHuyPxkId ?? tnTrongPxkId ?? pxkChuaDuyetId;
  if (pxkCanGo && nextTrangThai !== "TN da duyet") {
    const laTn = !tuHuyPxkId && canTacNghiep(c);
    const hanhDongMoTa = nextTrangThai === "Da huy" ? "hủy đơn" : nextTrangThai === "Cho hang" ? "chuyển chờ hàng đơn" : "từ chối đơn";
    const moTa = tuHuyPxkId ? "KTV tự hủy đơn" : laTn ? `TN ${hanhDongMoTa}` : hanhDongMoTa.charAt(0).toUpperCase() + hanhDongMoTa.slice(1);
    const go = await goDonKhoiPxk(
      c.env.DB, pxkCanGo, donHangId, user.email, moTa, ghiChu?.trim() ?? "", laTn ? !giuPhieuTrong : true, nextTrangThai === "Cho hang",
    );
    if (go.hoanQuy > 0) c.executionCtx.waitUntil(thongBaoHoanQuyPhieuHuy(c.env, c.env.DB, pxkCanGo, go.hoanQuy));
    if (laTn) await danhDauVanPhongTacDong(c.env.DB, pxkCanGo, user.email);
  }

  // TN duyet don DANG nam trong phieu (vao phieu tu luc tao, 2026-09-30) va doi SL thuc xuat -> tinh lai tien phieu.
  if (nextTrangThai === "TN da duyet" && capNhatSoLuong && ddh.ma_xuat_kho != null) {
    const pxkDangChua = await pxkChuaDonChuaDuyet(c.env.DB, donHangId);
    if (pxkDangChua) await taiTinhPxk(c.env.DB, pxkDangChua, false, true, user.email);
  }

  // Tu dong duyet 100% (chot 2026-10-14): don vua vao "TN da duyet" (TN duyet tay - muc 10, hoac he thong) / "Cho thanh toan" ma
  // CHUA trong phieu -> tu gom vao phieu; he thong dinh tuyen "Cho hang" -> mo ticket cho hang (Kho xac nhan / tu choi), "Cho GS
  // duyet" -> bao GS khu vuc.
  if (nextTrangThai === "TN da duyet" || nextTrangThai === "Cho thanh toan" || (dinhTuyenTuDong && (nextTrangThai === "Cho hang" || nextTrangThai === "Cho GS duyet"))) {
    await tacDongSauDinhTuyen(
      c.env, c.env.DB, donHangId, nextTrangThai, user.email, lyDoDinhTuyen ? `${lyDoDinhTuyen} — chờ hàng` : "Kho công ty không đủ hàng",
      (p) => c.executionCtx.waitUntil(p),
    );
  }

  // Don bi tu choi/huy -> ra khoi tong don trong ngay (chiet khau) + tra lai ton kho KTV (TRỪ CÔNG NỢ,
  // tinh dong tu du lieu don) - tinh lai moi PXK "Dang tao phieu" cua KTV nhan hang (chot 2026-09-28).
  if (nextTrangThai === "TN tu choi" || nextTrangThai === "Da huy") {
    await taiTinhPxkMoCuaKtv(c.env.DB, ddh.nguoi_nhan_hang, user.email);
  }

  // Thong bao cho nguoi tao (phan hoi 2026-08-26) - bo qua neu chinh nguoi tao la nguoi vua thao tac
  // (vd tu huy don cua minh, da biet ket qua ngay tren man hinh, khong can bao lai).
  if (ddh.nguoi_tao !== user.email) {
    const thongBao = thongBaoChoNguoiTao(hanhDong, nextTrangThai, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat, ghiChuLog);
    if (thongBao) {
      c.executionCtx.waitUntil(
        (async () => {
          await c.env.DB.prepare(
            "INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, ?, ?, 'don_hang', ?, ?)",
          )
            .bind(ddh.nguoi_tao, thongBao.loai, thongBao.noiDung, donHangId, nowVN())
            .run();
          // Day Web Push ngay (phan hoi 2026-08-26) - xem lib/webPush.ts.
          await sendPushToUser(c.env, ddh.nguoi_tao, { title: "Đặt mua linh kiện", body: thongBao.noiDung, url: "/" });
        })(),
      );
    }
  }

  // Auto-claim khu vuc phu trach (muc F) - chi khi TN thuc su vua xu ly (duyet/tu choi) 1 dong o
  // trang thai "Cho TN duyet", khong chan response (waitUntil).
  if (tnDaXuLy) {
    c.executionCtx.waitUntil(autoClaimGs(c.env.DB, user.email, ddh.email_gs));
  }

  // Bao "viec moi" cho vai tro SAP xu ly buoc tiep theo (phan hoi 2026-09-05) - dat SAU khi CAS UPDATE
  // + log da ghi thanh cong (tranh bao nham khi thua race CAS o dau ham).
  const tenLkNoiDung = `"${ddh.ten_lk_snapshot} (x${ddh.so_luong_de_xuat})"`;
  const emailGsList = ddh.email_gs ? [ddh.email_gs] : [];
  let cat1Role: ViecMoiRoleCol | null = null;
  if (nextTrangThai === "Cho hang" && !dinhTuyenTuDong) cat1Role = "la_kho"; // tu dong: moTicketChoHangTuDong da bao Kho
  else if (nextTrangThai === "Cho TBP xac nhan") cat1Role = "la_tp_dvbh";
  else if (nextTrangThai === "Cho TN duyet") cat1Role = "la_tac_nghiep";
  if (cat1Role) {
    const role = cat1Role;
    const body =
      role === "la_kho"
        ? `Đơn ${tenLkNoiDung} báo thiếu hàng, cần bạn xử lý`
        : role === "la_tp_dvbh"
          ? `Đơn ${tenLkNoiDung} cần bạn xác nhận linh kiện đặc thù`
          : `Đơn ${tenLkNoiDung} đang chờ bạn duyệt`;
    c.executionCtx.waitUntil(
      (async () => {
        const [cat1Raw, pastActors] = await Promise.all([
          emailsForRoleOrQC(c.env.DB, role, emailGsList),
          pastActorsFor(c.env.DB, "dat_don_hang_log", "dat_don_hang_id", donHangId, user.email),
        ]);
        // Kho chi xu ly 1 nhom LK (Karofi / B2B, 2026-10-16): chi bao Kho dung nhom LK cua don.
        const cat1Emails = role === "la_kho" ? await locEmailKhoTheoNhomLk(c.env.DB, cat1Raw, ddh.ma_lk) : cat1Raw;
        await notifyWorkflowTask(c.env, c.env.DB, {
          cat1Emails,
          otherRoles: MUA_CONG_NO_ROLES.filter((r) => r !== role),
          emailGsList,
          pastActors,
          title: "Đặt mua linh kiện",
          body,
          linkType: "don_hang",
          linkId: donHangId,
        });
      })(),
    );
  }

  return { nextTrangThai };
}

// POST /api/dat-mua-lk/don-hang/:id/log - chuyen trang thai 1 DONG don hang (Tram duyet/day len TBP
// hoac TN, TBP xac nhan/day len TN, TN duyet/tu choi, huy). Chi cho phep dung buoc hop le tiep theo
// tuy vao ai goi:
//  - Tram (la_ktv_dvbh + co Ve tinh thuoc minh) tren dong dang "Cho Tram duyet" cua chinh Ve tinh
//    minh quan ly: chuyen sang "Cho TBP xac nhan" (neu ma LK dac_thu) hoac "Cho TN duyet" (duyet),
//    hoac "Da huy" (tu choi).
//  - TBP (canTPDvbhXacNhan - la_tp_dvbh/Admin, CHOT 2026-08-17, migration 0082) tren dong dang "Cho
//    TBP xac nhan": chuyen "Cho TN duyet" (duyet) hoac "Da huy" (tu choi, ghi chu tuy chon, khong
//    can ly_do_cham_id - giong pattern Tram).
//  - TN (canTacNghiep - la_tac_nghiep/Admin) tren dong dang "Cho TN duyet": chuyen "TN da duyet", hoac tu choi kem
//    ly_do_cham_id bat buoc (he thong tu quyet dinh "TN tu choi" hay tu dong mo ticket "Cho hang").
//    "Duyet" 1 dong DA QUA HAN 24h (chua co ly_do_cham) cung bat buoc ly_do_cham_id (hang muc #17/#18,
//    2026-08-25) - dung LAI danh sach ly do o tren, khong phai truong rieng.
//  - Nguoi tao (hoac Tram cua nguoi tao): huy dong khi con dang mo (chua vao trang thai dong).
datMuaLinhKien.post("/don-hang/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    hanh_dong: "duyet" | "tu_choi" | "huy"; ly_do_cham_id?: number; ghi_chu?: string;
    so_luong_thuc_xuat?: number; ghi_chu_so_luong?: string; giu_phieu_trong?: boolean;
    ma_eo?: string; // GS / TBP duyet don vuot tran cong no (2026-10-14)
  }>();
  if (loiGioiHan({ so_luong_thuc_xuat: body.so_luong_thuc_xuat })) return c.json({ error: "SO_LUONG_QUA_LON", toi_da: SL_TOI_DA }, 400);
  const result = await applyDonHangLog(c, id, body.hanh_dong, body.ly_do_cham_id, body.ghi_chu, body.so_luong_thuc_xuat, body.ghi_chu_so_luong, !!body.giu_phieu_trong, {
    maEo: typeof body.ma_eo === "string" ? body.ma_eo : undefined,
  });
  if ("error" in result) return c.json({ error: result.error }, result.status);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, trang_thai: result.nextTrangThai });
});

// POST /api/dat-mua-lk/don-hang/:id/day-lai - { ghi_chu? } (chot 2026-10-05, "cho phép tác nghiệp đẩy lại đơn đặt hàng đã hủy,
// đã từ chối trong vòng 24h" + "chỉ xử lý đơn do tn hủy hoặc từ chối"): TN/Admin dua don "Da huy"/"TN tu choi" DO TN huy/tu choi
// (khong phai tra hang) ve "Cho TN duyet" de duyet lai, trong 24h tu luc bi huy/tu choi (dayLaiHanSql). Hau qua cua lan huy/tu choi KHONG khoi phuc: ticket thieu LK da dong giu nguyen, tien da tra cua don
// da hoan ve quy (trigger 0056) - don "chuyen tien truoc" (bat_buoc_chuyen_tien) duoc gom LAI vao phieu dang tao nhu luc tao
// don moi; chiet khau tong ngay + ton kho KTV (tinh dong) tu tinh lai.
datMuaLinhKien.post("/don-hang/:id/day-lai", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ ghi_chu?: string }>().catch(() => ({}) as { ghi_chu?: string });
  // Don bi huy theo TICKET thieu hang (Kho tu choi / huy ticket khi don dang Cho hang) -> phuc hoi THEO TICKET (2026-10-16): ticket ve
  // trang thai truoc khi bi tu choi, don ve "Cho hang" (khong ve "Cho TN duyet") - lib/dayLaiThieuLk.ts.
  const ticketPhucHoi = await ticketDayLaiCuaDon(c.env.DB, id);
  if (ticketPhucHoi) {
    const kq = await dayLaiTicketThieuLk(c.env, c.env.DB, ticketPhucHoi, user.email, body.ghi_chu);
    if ("error" in kq) return c.json({ error: kq.error, han: kq.han, pxk: kq.pxk }, kq.status);
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
    return c.json({ ok: true, trang_thai: "Cho hang", ticket: ticketPhucHoi, trang_thai_ticket: kq.trangThaiTicket, tien_lay_lai: kq.tienLayLai });
  }
  const ddh = await c.env.DB.prepare(
    `SELECT ddh.version, ddh.loai_don, ddh.trang_thai_hien_tai as trang_thai, ddh.nguoi_tao, ddh.nguoi_nhan_hang, ddh.ma_xuat_kho,
            ddh.bat_buoc_chuyen_tien, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat, ${dayLaiHanSql("ddh")} as han, ? as bay_gio,
            (SELECT bi_khoa FROM users WHERE email = ddh.nguoi_nhan_hang) as nhan_bi_khoa
     FROM dat_don_hang ddh WHERE ddh.id = ?`,
  )
    .bind(nowVN(), id)
    .first<{
      version: number; loai_don: string; trang_thai: string; nguoi_tao: string; nguoi_nhan_hang: string | null; ma_xuat_kho: string | null;
      bat_buoc_chuyen_tien: number; ten_lk_snapshot: string; so_luong_de_xuat: number; han: string | null; bay_gio: string; nhan_bi_khoa: number | null;
    }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);
  if (ddh.loai_don === "tra_hang") return c.json({ error: "TRA_HANG_KHONG_AP_DUNG" }, 409);
  if (!(DAY_LAI_TRANG_THAI as readonly string[]).includes(ddh.trang_thai)) return c.json({ error: "DON_KHONG_DAY_LAI_DUOC" }, 409);
  // han NULL = don do chinh nguoi tao / nguoi nhan hang tu huy - xem dayLaiHanSql.
  if (!ddh.han) return c.json({ error: "KHONG_PHAI_TN_HUY_TU_CHOI" }, 409);
  if (ddh.han < ddh.bay_gio) return c.json({ error: "QUA_24H_KHONG_DAY_LAI", han: ddh.han }, 409);
  if (ddh.nhan_bi_khoa) return c.json({ error: "NGUOI_NHAN_HANG_DA_TAT" }, 409);

  // Lien ket phieu cu: phieu da huy ("Ke toan huy" - don van giu ma_xuat_kho) -> bo lien ket de don di lai tu dau; phieu con
  // "Dang tao phieu" -> don van nam trong phieu (nhu don chuyen tien truoc chua duyet); phieu da qua buoc tao -> khong cho.
  let maXuatKhoMoi = ddh.ma_xuat_kho;
  let pxkDangChua: string | null = null;
  if (ddh.ma_xuat_kho != null) {
    pxkDangChua = await pxkChuaDonChuaDuyet(c.env.DB, id);
    if (!pxkDangChua) {
      const conHieuLuc = await c.env.DB.prepare(
        `SELECT p.id FROM phieu_xuat_kho_dong d JOIN phieu_xuat_kho p ON p.id = d.phieu_xuat_kho_id
         WHERE d.dat_don_hang_id = ? AND p.trang_thai_hien_tai != 'Ke toan huy' LIMIT 1`,
      ).bind(id).first<{ id: string }>();
      if (conHieuLuc) return c.json({ error: "DON_CON_TRONG_PHIEU", pxk: conHieuLuc.id }, 409);
      maXuatKhoMoi = null;
    }
  }

  const now = nowVN();
  const cas = await c.env.DB.prepare(
    `UPDATE dat_don_hang SET trang_thai_hien_tai = 'Cho TN duyet', ma_xuat_kho = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND version = ? AND trang_thai_hien_tai = ?`,
  )
    .bind(maXuatKhoMoi, now, id, ddh.version, ddh.trang_thai)
    .run();
  if (!cas.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);
  const tuTrangThai = ddh.trang_thai === "Da huy" ? "đã hủy" : "đã từ chối";
  const ghiChu = `Đẩy lại đơn ${tuTrangThai} về chờ duyệt${body.ghi_chu?.trim() ? `: ${body.ghi_chu.trim()}` : ""}`;
  await c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho TN duyet', ?, ?, ?)")
    .bind(id, user.email, now, ghiChu)
    .run();

  // Don "chuyen tien truoc" (0057) chua nam trong phieu nao -> gom lai vao phieu dang tao cua nguoi nhan (nhu luc tao don).
  if (ddh.bat_buoc_chuyen_tien && !pxkDangChua && ddh.nguoi_nhan_hang && (ddh.loai_don === "mua" || ddh.loai_don === "cong_no")) {
    await bundleAutoApprovedIntoPxk(c.env, c.env.DB, user.email, ddh.nguoi_nhan_hang, ddh.loai_don, [{ donHangId: id, soTien: 0 }]);
  }
  // Don quay lai tong don trong ngay (chiet khau) + ton kho KTV (TRỪ CÔNG NỢ) -> tinh lai PXK dang tao cua KTV nhan hang.
  await taiTinhPxkMoCuaKtv(c.env.DB, ddh.nguoi_nhan_hang, user.email);

  if (ddh.nguoi_tao !== user.email) {
    const noiDung = `Đơn hàng "${ddh.ten_lk_snapshot} (x${ddh.so_luong_de_xuat})" của bạn đã được Tác nghiệp mở lại, đang chờ duyệt`;
    c.executionCtx.waitUntil(
      (async () => {
        await c.env.DB.prepare("INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, 'mo_lai', ?, 'don_hang', ?, ?)")
          .bind(ddh.nguoi_tao, noiDung, id, now)
          .run();
        await sendPushToUser(c.env, ddh.nguoi_tao, { title: "Đặt mua linh kiện", body: noiDung, url: "/" });
      })(),
    );
  }
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, trang_thai: "Cho TN duyet" });
});

// POST /api/dat-mua-lk/don-hang/:id/vao-phieu - { ghi_chu? } (2026-10-20, v1.371 - "DDH-002838 tôi muốn add nó lại vào phiếu để chờ
// thanh toán thì lại không có chức năng để add"): don "Cho thanh toan" (Mua/Cong no) da RA KHOI phieu (TN bo don, doi khu vuc...)
// thi khong con duong nao vao lai phieu - chi luc tao don moi tu gom. TN/Ke toan/Admin dua lai: CUNG logic gom luc tao don
// (bundleAutoApprovedIntoPxk - vao phieu "Dang tao phieu" cua nguoi nhan, khong co thi tao phieu moi). Don con lien ket phieu da
// huy ("Ke toan huy") -> bo lien ket truoc; con trong phieu hieu luc -> DON_CON_TRONG_PHIEU.
// POST /api/dat-mua-lk/don-hang/:id/thanh-toan-sau - { ghi_chu? } (2026-10-20, migration 0094) - TN (gom Ke toan lam thay) / Admin cho don
// "Cho thanh toan" di tiep khong cho tien (lib/tuDongDuyet.ts choPhepThanhToanSau).
datMuaLinhKien.post("/don-hang/:id/thanh-toan-sau", async (c) => {
  if (!canTacNghiep(c) && !c.get("user").la_ke_toan && c.get("user").vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ ghi_chu?: string }>().catch(() => ({}) as { ghi_chu?: string });
  const kq = await choPhepThanhToanSau(c.env, c.env.DB, c.req.param("id"), c.get("user").email, body.ghi_chu?.trim().slice(0, 300) || null);
  if ("error" in kq) return c.json({ error: kq.error }, kq.error === "NOT_FOUND" ? 404 : 409);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, trang_thai: kq.trangThai });
});

// POST /api/dat-mua-lk/don-hang/:id/tach-don - { so_luong, duyet?, ghi_chu? } (chot 2026-11-03, v1.434 - "đặt 2, nhưng về có 1 linh kiện =>
// thêm cho kế toán và kho, TN khả năng tách đơn"): Kho / Ke toan / TN / Admin tach don "Cho hang" thanh 2 don - `so_luong` chiec sang don MOI
// (duyet = true, mac dinh: phan hang da ve -> duyet + vao phieu, sang Ke toan), don goc con lai tiep tuc cho Kho. Tien da tra + gia tri cong
// no chia theo SL. Xem lib/tachDon.ts.
datMuaLinhKien.post("/don-hang/:id/tach-don", async (c) => {
  const user = c.get("user");
  if (!(canKho(c) || canTacNghiep(c) || user.la_ke_toan)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ so_luong?: number; duyet?: boolean; ghi_chu?: string }>().catch(() => ({}) as { so_luong?: number; duyet?: boolean; ghi_chu?: string });
  const kq = await tachDonChoHang(c.env, c.env.DB, c.req.param("id"), Number(body.so_luong), user.email, {
    duyet: body.duyet !== false,
    ghiChu: body.ghi_chu?.slice(0, 300),
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  });
  if (!kq.ok) return c.json({ error: kq.error }, kq.status);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, don_moi: kq.donMoi, trang_thai_moi: kq.trangThaiMoi });
});

// POST /api/dat-mua-lk/don-hang/:id/cho-hang - { ghi_chu } (chot 2026-10-27, "bổ sung nút chờ hàng cho vai trò mua hàng" + "đẩy đơn lại
// trạng thái chờ hàng cho nhân viên mua hàng (nếu đơn chưa được kế toán duyệt phiếu)"): Mua hang (+ Admin) chuyen don Mua / Cong no dang
// "Cho TN duyet" / "Cho thanh toan" / "TN da duyet" (chua nam trong phieu da gui Ke toan - MUA_HANG_CHO_HANG_DUOC_SQL) ve "Cho hang":
// don dang trong phieu "Dang tao phieu" roi phieu MANG THEO tien da tra, ticket thieu hang mo thang o buoc "Cho mua hang" (Mua hang nhap
// ma EO + ngay du kien, Kho bao hang ve nhu thuong) - don bi khoa voi KTV (chi Kho / Mua hang huy).
datMuaLinhKien.post("/don-hang/:id/cho-hang", async (c) => {
  if (!laMuaHangXuLy(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ ghi_chu?: string }>().catch(() => ({}) as { ghi_chu?: string });
  const ghiChu = body.ghi_chu?.trim().slice(0, 500);
  if (!ghiChu) return c.json({ error: "MISSING_GHI_CHU" }, 400);
  const ddh = await c.env.DB.prepare(
    `SELECT trang_thai_hien_tai as trang_thai, nguoi_tao, nguoi_nhan_hang, ten_lk_snapshot, so_luong_de_xuat,
       ${MUA_HANG_CHO_HANG_DUOC_SQL("dat_don_hang")} as duoc FROM dat_don_hang WHERE id = ?`,
  ).bind(id).first<{ trang_thai: string; nguoi_tao: string; nguoi_nhan_hang: string | null; ten_lk_snapshot: string; so_luong_de_xuat: number; duoc: number }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);
  if (!ddh.duoc) return c.json({ error: "MUA_HANG_KHONG_CHO_HANG_DUOC" }, 409);
  const lyDo = `Mua hàng chuyển chờ hàng: ${ghiChu}`;
  if (!(await ghiTrangThaiDon(c.env.DB, id, "Cho hang", user.email, lyDo, false, ddh.trang_thai))) return c.json({ error: "STATE_CHANGED" }, 409);
  await tacDongSauDinhTuyen(c.env, c.env.DB, id, "Cho hang", user.email, lyDo, (p) => c.executionCtx.waitUntil(p), { choMuaHang: true });
  if (ddh.nguoi_tao !== user.email) {
    c.executionCtx.waitUntil(
      baoNguoiTaoDon(c.env, c.env.DB, ddh.nguoi_tao, "cho_hang", `Đơn hàng "${ddh.ten_lk_snapshot} (x${ddh.so_luong_de_xuat})" chuyển Chờ hàng — ${lyDo}`, id),
    );
  }
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, trang_thai: "Cho hang" });
});

datMuaLinhKien.post("/don-hang/:id/vao-phieu", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ ghi_chu?: string }>().catch(() => ({}) as { ghi_chu?: string });
  const ddh = await c.env.DB.prepare(
    "SELECT loai_don, trang_thai_hien_tai as trang_thai, nguoi_nhan_hang, ma_xuat_kho FROM dat_don_hang WHERE id = ?",
  ).bind(id).first<{ loai_don: string; trang_thai: string; nguoi_nhan_hang: string | null; ma_xuat_kho: string | null }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);
  if (ddh.trang_thai !== "Cho thanh toan") return c.json({ error: "CHI_DON_CHO_THANH_TOAN" }, 409);
  if ((ddh.loai_don !== "mua" && ddh.loai_don !== "cong_no") || !ddh.nguoi_nhan_hang) return c.json({ error: "LOAI_DON_KHONG_HOP_LE" }, 409);
  const conHieuLuc = await c.env.DB.prepare(
    `SELECT p.id FROM phieu_xuat_kho_dong d JOIN phieu_xuat_kho p ON p.id = d.phieu_xuat_kho_id
     WHERE d.dat_don_hang_id = ? AND p.trang_thai_hien_tai != 'Ke toan huy' LIMIT 1`,
  ).bind(id).first<{ id: string }>();
  if (conHieuLuc) return c.json({ error: "DON_CON_TRONG_PHIEU", pxk: conHieuLuc.id }, 409);
  const now = nowVN();
  if (ddh.ma_xuat_kho != null) {
    const bo = await c.env.DB.prepare("UPDATE dat_don_hang SET ma_xuat_kho = NULL, updated_at = ? WHERE id = ? AND ma_xuat_kho = ?")
      .bind(now, id, ddh.ma_xuat_kho).run();
    if (!bo.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);
  }
  // Xet lai truoc (2026-10-20, bug DDH-002733): kho da du -> tu duyet + vao phieu; het tien phai chuyen (gia chot 0...) -> "Cho hang" +
  // ticket. Dua don 0d vao phieu 0d se ket mai (phieu khong co buoc Ke toan xac nhan tien).
  if (await danhGiaLaiDonChoThanhToan(c.env, c.env.DB, id, user.email, "đưa lại vào phiếu")) {
    const sau = await c.env.DB.prepare("SELECT trang_thai_hien_tai FROM dat_don_hang WHERE id = ?").bind(id).first<{ trang_thai_hien_tai: string }>();
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
    return c.json({ ok: true, pxk: null, trang_thai: sau?.trang_thai_hien_tai ?? null });
  }
  const pxkId = await bundleAutoApprovedIntoPxk(c.env, c.env.DB, user.email, ddh.nguoi_nhan_hang, ddh.loai_don, [{ donHangId: id, soTien: 0 }]);
  await c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho thanh toan', ?, ?, ?)")
    .bind(id, user.email, now, `Đưa lại vào phiếu ${pxkId ?? ""} chờ thanh toán${body.ghi_chu?.trim() ? `: ${body.ghi_chu.trim()}` : ""}`)
    .run();
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, pxk: pxkId });
});

// PATCH /api/dat-mua-lk/don-hang/:id/dac-thu - { dac_thu: boolean } (2026-10-02, migration 0064) - TN/Admin bat/tat "Linh kiện
// đặc thù" CUA RIENG don nay (thang danh muc). Doi luong theo gia tri moi:
//  - TAT khi don "Cho TBP xac nhan" -> "Cho TN duyet" (thoat buoc TBP); TAT -> khong con bat buoc thanh toan moi "Cho hang".
//  - BAT khi don "Cho TN duyet" (loai de xuat khong bo qua TBP - boQuaTbpChoDacThu) -> "Cho TBP xac nhan".
// Chi ghi dat_don_hang_log khi trang thai DOI (log cung trang thai "Cho TN duyet" se reset moc han 24h - choTnDuyetAtExpr);
// nguoi/luc sua luu o dac_thu_nguoi_sua/dac_thu_sua_luc.
// PATCH /api/dat-mua-lk/don-hang/:id/khieu-nai - { khieu_nai: boolean, ghi_chu? } (chot 2026-10-28, v1.411, migration 0101 - "box tích ca
// khiếu nại cho GS, Kho, TN, KT có thể tích cho 1 đơn bất kỳ"): GS / Kho / TN (gom Ke toan) / Admin danh dau / bo danh dau. Don khieu nai to
// do nhat o moi danh sach + uu tien 1 khi tu xac nhan hang ve (lib/tuDongHangVe.ts). Khong ghi dat_don_hang_log (log cung trang thai lam
// reset han 24h) - luu nguoi / luc / ghi chu tren chinh don.
datMuaLinhKien.patch("/don-hang/:id/khieu-nai", async (c) => {
  const user = c.get("user");
  if (!(canTacNghiep(c) || user.la_ke_toan || user.la_kho || user.vai_tro === "Giam sat" || user.vai_tro === "Admin")) {
    return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  }
  const body = await c.req.json<{ khieu_nai?: boolean; ghi_chu?: string }>().catch(() => ({}) as { khieu_nai?: boolean; ghi_chu?: string });
  const bat = !!body.khieu_nai;
  const r = await c.env.DB.prepare(
    `UPDATE dat_don_hang SET khieu_nai = ?, khieu_nai_luc = ?, khieu_nai_boi = ?, khieu_nai_ghi_chu = ? WHERE id = ?`,
  ).bind(bat ? 1 : 0, nowVN(), user.email, body.ghi_chu?.trim().slice(0, 500) || null, c.req.param("id")).run();
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, khieu_nai: bat });
});

// POST /api/dat-mua-lk/thieu-lk/tu-dong-hang-ve - "Rà soát hàng về" (2026-10-28): chay ngay lib/tuDongHangVe.ts (Kho / Ke toan / TN / Admin) -
// cung ham tu goi sau khi import ton kho. Tra danh sach don vua tu xac nhan.
datMuaLinhKien.post("/thieu-lk/tu-dong-hang-ve", async (c) => {
  const user = c.get("user");
  if (!(canKho(c) || canTacNghiep(c) || user.la_ke_toan)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const kq = await tuDongXacNhanHangVe(c.env, c.env.DB, user.email, "rà soát thủ công");
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, da_xac_nhan: kq.daXacNhan, bo_qua: kq.boQua, cho_phuong_an: kq.choPhuongAn });
});

datMuaLinhKien.patch("/don-hang/:id/dac-thu", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ dac_thu?: boolean }>();
  if (typeof body.dac_thu !== "boolean") return c.json({ error: "INVALID_BODY" }, 400);
  const ddh = await c.env.DB.prepare(
    `SELECT ddh.version, ddh.loai_don, ddh.loai_de_xuat, ddh.email_gs, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat,
            ddh.trang_thai_hien_tai as trang_thai, ${DAC_THU_DON_SQL("ddh")} as dac_thu
     FROM dat_don_hang ddh LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk WHERE ddh.id = ?`,
  )
    .bind(id)
    .first<{ version: number; loai_don: string; loai_de_xuat: string | null; email_gs: string | null; ten_lk_snapshot: string; so_luong_de_xuat: number; trang_thai: string; dac_thu: number }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);
  if (ddh.loai_don === "tra_hang") return c.json({ error: "TRA_HANG_KHONG_AP_DUNG" }, 409);
  if (["TN tu choi", "Tu choi", "Da huy"].includes(ddh.trang_thai)) return c.json({ error: "DON_DA_DONG" }, 409);

  const bat = body.dac_thu;
  let nextTrangThai = ddh.trang_thai;
  if (!bat && ddh.trang_thai === "Cho TBP xac nhan") nextTrangThai = "Cho TN duyet";
  else if (bat && ddh.trang_thai === "Cho TN duyet" && !boQuaTbpChoDacThu(ddh.loai_de_xuat ?? "")) nextTrangThai = "Cho TBP xac nhan";
  const doiTrangThai = nextTrangThai !== ddh.trang_thai;
  const now = nowVN();
  const cas = await c.env.DB.prepare(
    `UPDATE dat_don_hang SET dac_thu_thu_cong = ?, dac_thu_nguoi_sua = ?, dac_thu_sua_luc = ?, trang_thai_hien_tai = ?, version = version + 1${doiTrangThai ? ", updated_at = ?" : ""}
     WHERE id = ? AND version = ?`,
  )
    .bind(...[bat ? 1 : 0, user.email, now, nextTrangThai, ...(doiTrangThai ? [now] : []), id, ddh.version])
    .run();
  if (!cas.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);
  if (doiTrangThai) {
    await c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
      .bind(id, nextTrangThai, user.email, now, bat ? "TN bật linh kiện đặc thù cho đơn → chờ TBP xác nhận" : "TN tắt linh kiện đặc thù cho đơn → bỏ bước TBP")
      .run();
    if (nextTrangThai === "Cho TBP xac nhan") {
      const emailGsList = ddh.email_gs ? [ddh.email_gs] : [];
      c.executionCtx.waitUntil(
        (async () => {
          const cat1Emails = await emailsForRoleOrQC(c.env.DB, "la_tp_dvbh", emailGsList);
          await notifyWorkflowTask(c.env, c.env.DB, {
            cat1Emails,
            otherRoles: MUA_CONG_NO_ROLES.filter((r) => r !== "la_tp_dvbh"),
            emailGsList,
            pastActors: [],
            title: "Đặt mua linh kiện",
            body: `Đơn "${ddh.ten_lk_snapshot} (x${ddh.so_luong_de_xuat})" cần bạn xác nhận linh kiện đặc thù`,
            linkType: "don_hang",
            linkId: id,
          });
        })(),
      );
    }
  }
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, dac_thu: bat, trang_thai: nextTrangThai });
});

// PATCH /api/dat-mua-lk/don-hang/:id/khu-vuc - { khu_vuc_ma, ghi_chu? } (chot 2026-10-15: "mấy đơn này lại cần khu vực MB xử lý
// => bổ sung thêm việc thay đổi khu vực trên đơn") - TN/Ke toan/Kho/Admin chon khu vuc xu ly cho RIENG 1 don (KTV van giu khu vuc
// cua minh). Ghi dat_don_hang.khu_vuc_chon (migration 0071 - chon dung khu vuc tu tinh = bo chon, NULL) -> bo loc khu vuc
// (khuVucSetWhereSql) chi con khop khu vuc chon. CHI khi don chua dong va CHUA nam trong phieu xuat con hieu luc (dang trong phieu
// -> doi o phieu, PATCH /phieu-xuat-kho/:id/khu-vuc, de phieu + moi don cung khu vuc). Don vao phieu SAU do: phieu mang theo khu vuc
// chon (pxkAutoBundle / tao phieu tay). Log vao tra_hang_log (don tra hang - log cung trang thai khong reset han) hoac
// dat_don_hang_log (cung trang thai, giong PATCH sua don).
datMuaLinhKien.patch("/don-hang/:id/khu-vuc", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  // + TBP / Giam sat / nguoi tao don ho (chot 2026-10-22) - xem doiKhuVucDonSql.
  if (!(await duocDoiKhuVucDon(c.env.DB, user, id))) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ khu_vuc_ma?: string; ghi_chu?: string }>().catch(() => null);
  const ma = body?.khu_vuc_ma?.trim();
  if (!ma) return c.json({ error: "MISSING_KHU_VUC" }, 400);
  const kv = await c.env.DB.prepare("SELECT ma, ten FROM khu_vuc WHERE ma = ?").bind(ma).first<{ ma: string; ten: string }>();
  if (!kv) return c.json({ error: "KHU_VUC_KHONG_TON_TAI" }, 400);
  const ddh = await c.env.DB.prepare(
    `SELECT ddh.loai_don, ddh.trang_thai_hien_tai as trang_thai, ddh.khu_vuc_ma, ddh.khu_vuc_chon,
       (SELECT ten FROM khu_vuc WHERE ma = COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma)) as ten_cu,
       EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id
               WHERE pd.dat_don_hang_id = ddh.id AND COALESCE(p.trang_thai_hien_tai, '') != 'Ke toan huy') as trong_phieu
     FROM dat_don_hang ddh WHERE ddh.id = ?`,
  )
    .bind(id)
    .first<{ loai_don: string; trang_thai: string | null; khu_vuc_ma: string | null; khu_vuc_chon: string | null; ten_cu: string | null; trong_phieu: number }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);
  if (["TN tu choi", "Tu choi", "Da huy"].includes(ddh.trang_thai ?? "")) return c.json({ error: "DON_DA_DONG" }, 409);
  if (ddh.trong_phieu) return c.json({ error: "DON_TRONG_PHIEU" }, 409);

  const moi = ma === ddh.khu_vuc_ma ? null : ma;
  if (moi === ddh.khu_vuc_chon) return c.json({ ok: true, khu_vuc_chon: moi, khong_doi: true });
  const now = nowVN();
  const upd = await c.env.DB.prepare("UPDATE dat_don_hang SET khu_vuc_chon = ?, updated_at = ? WHERE id = ? AND khu_vuc_chon IS ? AND trang_thai_hien_tai IS ?")
    .bind(moi, now, id, ddh.khu_vuc_chon, ddh.trang_thai)
    .run();
  if (!upd.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);
  const lyDo = body?.ghi_chu?.trim();
  const ghiChu = `Đổi khu vực xử lý đơn: ${ddh.ten_cu ?? ddh.khu_vuc_chon ?? ddh.khu_vuc_ma ?? "?"} → ${kv.ten}${moi === null ? " (theo KTV)" : ""}${lyDo ? ` — ${lyDo}` : ""}`;
  const bangLog = ddh.loai_don === "tra_hang" ? "tra_hang_log" : "dat_don_hang_log";
  await c.env.DB.prepare(`INSERT INTO ${bangLog} (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, ddh.trang_thai, user.email, now, ghiChu)
    .run();

  // Xet lai ton kho CA 2 CHIEU theo khu vuc moi (chot 2026-10-22, xetLaiTonKhiDoiKhuVuc): "Cho hang" du -> tu duyet + dong ticket;
  // "Cho thanh toan" du -> tu duyet; "TN da duyet" thieu -> "Cho hang" + ticket (don nay chua vao phieu - PATCH chan don trong phieu).
  const xet = await xetLaiTonKhiDoiKhuVuc(c.env, c.env.DB, [id], user.email,
    `đơn chuyển khu vực ${ddh.ten_cu ?? ddh.khu_vuc_chon ?? ddh.khu_vuc_ma ?? "?"} → ${kv.ten}`, (p) => c.executionCtx.waitUntil(p));
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, khu_vuc_chon: moi, tu_duyet: xet.tuDuyet.length > 0, cho_hang: xet.choHang.length > 0 });
});

// POST /api/dat-mua-lk/don-hang/bulk-log - { ids, hanh_dong, ly_do_cham_id?, ghi_chu? } xu ly hang
// loat nhieu DONG don hang cung luc (luon la dat_don_hang id - CHOT 2026-08-15: bo nhanh mo rong
// "phieu_dat id -> toan bo dong con", khong con khai niem phieu de truyen vao nua, xem migration
// 0075). Tai su dung applyDonHangLog, khong copy lai role-check. Tiep tuc xu ly cac id con lai ngay
// ca khi 1 id loi - tra ve ket qua tung dong de UI hien day du thanh cong/that bai.
datMuaLinhKien.post("/don-hang/bulk-log", async (c) => {
  const body = await c.req.json<{ ids: string[]; hanh_dong: "duyet" | "tu_choi" | "huy"; ly_do_cham_id?: number; ghi_chu?: string }>();
  if (!Array.isArray(body.ids) || body.ids.length === 0) return c.json({ error: "MISSING_IDS" }, 400);
  const ids = [...new Set(body.ids)];
  if (ids.length > MAX_BULK_IDS) return c.json({ error: "QUA_NHIEU_ID", max: MAX_BULK_IDS }, 400);

  const results: Record<string, string> = {};
  let coThanhCong = false;
  // Do thoi gian ca batch (giam sat AUD-002 - xu ly tuan tu tung ID, xem docs/audit/RESPONSE_PLAN.md
  // de biet nguong/phuong an xu ly khi log nay cho thay cham that).
  const bulkStartedAt = Date.now();
  for (const donHangId of ids) {
    // Muc #4: SL thuc xuat KHONG ap dung o day - 1 gia tri chung cho nhieu dong khac nhau la vo nghia,
    // UI sua SL chi co o Drawer 1 dong rieng (DonHangDetailModal), khong co o thao tac hang loat.
    const result = await applyDonHangLog(c, donHangId, body.hanh_dong, body.ly_do_cham_id, body.ghi_chu, undefined, undefined);
    results[donHangId] = "error" in result ? result.error : result.nextTrangThai;
    if (!("error" in result)) coThanhCong = true;
  }
  console.log("[bulk-log]", { route: "don-hang/bulk-log", count: ids.length, durationMs: Date.now() - bulkStartedAt });

  if (coThanhCong) c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ results });
});

// PATCH /api/dat-mua-lk/don-hang/:id - 2 nhanh quyen sua rieng biet (CHOT 2026-08-16, dot 3 gop y
// #6 - DAO NGUOC CO CHU Y quy tac "6 truong phu bat bien sau khi tao" cua migration 0070):
//  - Nguoi tao dong, CHI khi dong con dang mo ("Cho Tram duyet"/"Cho TBP xac nhan"/"Cho TN duyet" -
//    chua toi TN xu ly xong): sua duoc TOAN BO thong tin dong (ma_lk, loai_de_xuat, so_luong_de_xuat, ghi_chu,
//    yeu_cau_hoa_don, tt_mail_duyet, tt_khach_hang, chinh_sach, ma_yeu_cau_su_co, uu_tien). Doi
//    ma_lk thi re-snapshot ten_lk_snapshot/gia_de_xuat (gia lay tu gia_ban, khop POST /phieu-dat).
//    Ap lai dung validate canNoRequired tren gia tri SAU khi sua.
//  - TN (canTacNghiep): giu nguyen 4 truong cu (so_luong_thuc_xuat/gia_chot/ma_xuat_kho/ma_misa - gan
//    ma_xuat_kho CHINH THUC van la qua POST /phieu-xuat-kho, o day chi de TN sua lai 1 dong rieng
//    le), THEM 4 truong phu (ma_yeu_cau_su_co/yeu_cau_hoa_don/tt_khach_hang/tt_mail_duyet) de TN ho
//    tro nguoi tao sua khi dang xu ly, khong gioi han trang thai.
//
// SUA (phan hoi QA 2026-08-31, muc #5): "ly_do_cham" DA BO khoi endpoint nay (truoc day la 1 truong
// PATCH tuy y, khong bat buoc trang thai/khong ghi log/khoa vinh vien sau lan dau) - thay bang
// POST /don-hang/:id/giai-trinh rieng (migration 0014, dat_don_hang_giai_trinh) cho phep NHIEU lan
// giai trinh lap lai, moi lan RESET han 24h - xem comment endpoint do.
datMuaLinhKien.patch("/don-hang/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<{
    so_luong_thuc_xuat?: number; gia_chot?: number; ma_xuat_kho?: string; ma_misa?: string;
    ma_yeu_cau_su_co?: string; ma_lada?: string; yeu_cau_hoa_don?: string; tt_khach_hang?: string; tt_mail_duyet?: string;
    ma_lk?: string; loai_de_xuat?: string; so_luong_de_xuat?: number; ghi_chu?: string; chinh_sach?: string; uu_tien?: boolean;
    ghi_chu_so_luong?: string;
    // v1.538 ("khi tôi sửa đơn, thiếu nút tích KH đã thanh toán"): "Khách hàng đã chuyển khoản về công ty" sua duoc khi don chua giu tien.
    kh_chuyen_khoan?: boolean;
  }>();
  const loiSo = loiGioiHan(body);
  if (loiSo) return c.json({ error: loiSo, toi_da: loiSo === "GIA_QUA_LON" ? GIA_TOI_DA : SL_TOI_DA }, 400);
  // BUG THAT (phat hien 2026-08-18 cung dot voi ma-misa PXK): "id" khong qualify bi cot "id" cua
  // CHINH dat_don_hang_log (PK) SHADOW trong subquery tuong quan -> trang_thai luon ra NULL ->
  // isCreatorEditWindow ben duoi LUON false (khong khop bat ky trang thai nao trong 3 gia tri so
  // sanh) -> nguoi tao KHONG BAO GIO sua duoc toan bo don qua nhanh nay, roi vao nhanh TN (bi
  // FORBIDDEN_ROLE neu khong phai TN, hoac am tham chi ap dung 5+4 truong TN neu la TN). Phai
  // qualify "dat_don_hang.id".
  const existing = await c.env.DB.prepare(
    `SELECT nguoi_tao, nguoi_nhan_hang, ma_xuat_kho, so_luong_thuc_xuat, gia_chot, ma_misa, ly_do_cham,
       ma_lk, ten_lk_snapshot, loai_de_xuat, so_luong_de_xuat, gia_de_xuat, ghi_chu, chinh_sach,
       ma_yeu_cau_su_co, ma_lada, yeu_cau_hoa_don, tt_khach_hang, tt_mail_duyet, uu_tien, loai_don, trang_thai_hien_tai, email_gs,
       COALESCE(kh_chuyen_khoan, 0) AS kh_chuyen_khoan, nguon_tao, nguon_tao_id, COALESCE(tien_da_tra, 0) AS tien_da_tra,
       ${latestDonHangStatusExpr("dat_don_hang.id")} as trang_thai,
       (SELECT COALESCE(pxk.da_thanh_toan, 0) FROM phieu_xuat_kho_dong pxkd JOIN phieu_xuat_kho pxk ON pxk.id = pxkd.phieu_xuat_kho_id
        WHERE pxkd.dat_don_hang_id = dat_don_hang.id) as pxk_da_tt,
       (SELECT pxk.trang_thai_hien_tai FROM phieu_xuat_kho_dong pxkd JOIN phieu_xuat_kho pxk ON pxk.id = pxkd.phieu_xuat_kho_id
        WHERE pxkd.dat_don_hang_id = dat_don_hang.id) as pxk_trang_thai,
       (SELECT pxkd.phieu_xuat_kho_id FROM phieu_xuat_kho_dong pxkd
        WHERE pxkd.dat_don_hang_id = dat_don_hang.id) as pxk_id
     FROM dat_don_hang WHERE id = ?`,
  )
    .bind(id)
    .first<{
      nguoi_tao: string; nguoi_nhan_hang: string | null; ma_xuat_kho: string | null; so_luong_thuc_xuat: number | null; gia_chot: number | null;
      ma_misa: string | null; ly_do_cham: string | null; ma_lk: string; ten_lk_snapshot: string | null;
      loai_de_xuat: string | null; so_luong_de_xuat: number; gia_de_xuat: number | null; ghi_chu: string | null;
      chinh_sach: string | null; ma_yeu_cau_su_co: string | null; ma_lada: string | null; yeu_cau_hoa_don: string | null;
      tt_khach_hang: string | null; tt_mail_duyet: string | null; uu_tien: number; trang_thai: string | null;
      loai_don: string; trang_thai_hien_tai: string; email_gs: string | null; kh_chuyen_khoan: number;
      nguon_tao: string | null; nguon_tao_id: string | null; tien_da_tra: number; pxk_da_tt: number | null;
      pxk_trang_thai: string | null; pxk_id: string | null;
    }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  // Don CONG NO SUA CHUA tao tu app Bao hanh doi tra (v1.498, migration 0121): "Nếu tạo trên hệ thống nào thì khóa chỉ cho chỉnh sửa thông
  // tin từ hệ thống đó" -> noi dung don (ma LK / SL / loai de xuat / ghi chu) chi sua tren app doi tra; xu ly (Ke toan, Kho) van o day.
  if (existing.nguon_tao === "doitra") {
    const doi = (v: unknown, cu: unknown) => v !== undefined && String(v ?? "").trim() !== String(cu ?? "").trim();
    if (doi(body.ma_lk, existing.ma_lk) || doi(body.so_luong_de_xuat, existing.so_luong_de_xuat) || doi(body.loai_de_xuat, existing.loai_de_xuat) || doi(body.ghi_chu, existing.ghi_chu)) {
      return c.json({ error: "DON_TAO_TU_APP_DOI_TRA", de_xuat: existing.nguon_tao_id }, 409);
    }
  }

  const isCreatorEditWindow =
    user.email === existing.nguoi_tao &&
    // Don tra hang (ke ca don TN vua chuyen tu don mua - log mua cu van la "Cho TN duyet") khong thuoc cua so sua nay.
    existing.loai_don !== "tra_hang" &&
    (existing.trang_thai === "Cho Tram duyet" || existing.trang_thai === "Cho TBP xac nhan" || existing.trang_thai === "Cho TN duyet");
  // MOI (2026-09-21, phan hoi "cho phep TN sua thong tin don ngay ca khi da len PXK"): TN sua duoc
  // TOAN BO thong tin don BAT KY LUC NAO, mien PXK (neu co) dang dung buoc "Dang tao phieu" (= "ke
  // toan chua duyet xong chuyen tien", dung KHOP dieu kien da dung cho 3 route sua/them/bo don o PXK,
  // migration 0030) HOAC don CHUA len PXK nao. Gop chung voi "thong tin goc" (truoc day CHI nguoi tao
  // sua duoc) de tranh nghich ly sua duoc SAU khi len PXK nhung khong sua duoc TRUOC do. Tac dung phu:
  // 4 truong phu (nhanh TN cu) truoc day "khong gioi han trang thai" nay bi SIET lai theo cung gate -
  // chap nhan duoc vi frontend chua tung co UI khai thac truong hop cu (xem DonCuaToiTab.tsx).
  const tnEditWindow = canTacNghiep(c) && (existing.pxk_trang_thai === null || existing.pxk_trang_thai === "Dang tao phieu");

  if (isCreatorEditWindow || tnEditWindow) {
    // 4 truong loi rieng cua TN (so_luong_thuc_xuat/gia_chot/ma_xuat_kho/ma_misa) - CHI xu ly khi
    // nguoi goi THAT SU la TN (canTacNghiep), khong anh huong nguoi tao thuan tuy dang o cua so sua
    // rieng cua ho. Dat O DAU nhanh (truoc khi build "next" cua thong tin goc) de fail-fast dung guard
    // MISSING_GHI_CHU_SO_LUONG da co tu truoc.
    let nextTn: { so_luong_thuc_xuat: number | null; gia_chot: number | null; ma_xuat_kho: string | null; ma_misa: string | null } | null = null;
    if (canTacNghiep(c)) {
      let nextSlThucXuat = body.so_luong_thuc_xuat !== undefined ? body.so_luong_thuc_xuat : existing.so_luong_thuc_xuat;
      // FIX 2026-09-28 (bug "TN không thay đổi được linh kiện khác, báo MISSING_GHI_CHU_SO_LUONG"): don CHUA co SL
      // thuc xuat (NULL = theo SL de xuat) - form TN gui kem SL thuc xuat = SL de xuat cu (khong doi) nhung truoc
      // day so voi NULL nen bi coi la "doi SL" -> bat ly do. Gia tri gui len = SL dang hieu luc -> coi nhu khong
      // doi, giu NULL (de SL thuc xuat van theo SL de xuat neu TN sua SL de xuat trong cung lan luu).
      if (existing.so_luong_thuc_xuat == null && nextSlThucXuat === existing.so_luong_de_xuat) nextSlThucXuat = null;
      if (nextSlThucXuat !== existing.so_luong_thuc_xuat && !body.ghi_chu_so_luong?.trim()) {
        return c.json({ error: "MISSING_GHI_CHU_SO_LUONG" }, 400);
      }
      // Ma xuat kho: CHI cho sua khi don CHUA thuoc PXK nao - da co PXK thi day la ban copy mã PXK
      // that (gan qua POST /phieu-xuat-kho/:id/dong), sua tay o day se lam LECH khoi PXK dang quan ly
      // dong nay, co the khien GET /don-hang-kha-dung hieu nham don dang "kha dung" va gan dup vao 1
      // PXK khac - im lang bo qua gia tri body gui len trong truong hop do, du frontend co gui gi.
      const nextMaXuatKho = existing.pxk_trang_thai === null && body.ma_xuat_kho !== undefined ? body.ma_xuat_kho?.trim() || null : existing.ma_xuat_kho;
      nextTn = {
        so_luong_thuc_xuat: nextSlThucXuat,
        gia_chot: body.gia_chot !== undefined ? body.gia_chot : existing.gia_chot,
        ma_xuat_kho: nextMaXuatKho,
        ma_misa: body.ma_misa !== undefined ? body.ma_misa?.trim() || null : existing.ma_misa,
      };
    }

    // FIX (phan hoi 2026-09-22 "'Loại đề xuất · Số lượng' không cho sửa khi đã lên phiếu xuất kho, vì
    // nó liên quan đến các đơn khác chung trong phiếu"): cung nguyen tac voi ma_xuat_kho o tren - da co
    // PXK quan ly (pxk_trang_thai != null) thi im lang bo qua 2 truong nay du body gui gi, khong dua
    // hoan toan vao frontend khoa disabled.
    const daCoPxk = existing.pxk_trang_thai !== null;
    const nextLde = !daCoPxk && body.loai_de_xuat !== undefined ? body.loai_de_xuat.trim() : (existing.loai_de_xuat ?? "");
    // MUA HÀNG CÔNG NỢ ĐỐI TÁC (v1.403): don gan voi 1 doi tac + phieu rieng -> khong doi qua lai voi loai khac (huy, dat lai).
    if (laMuaCongNoDoiTac(nextLde) !== laMuaCongNoDoiTac(existing.loai_de_xuat ?? "")) return c.json({ error: "DOI_LOAI_CONG_NO_DOI_TAC" }, 409);
    // v1.508: 3 loai cap linh kien sua chua do HE THONG chon theo don bao hanh -> khong doi qua lai (ke ca giua 3 loai).
    if ((laDonSuaChua(nextLde) || laDonSuaChua(existing.loai_de_xuat)) && nextLde !== (existing.loai_de_xuat ?? "")) return c.json({ error: "DOI_LOAI_CONG_NO_SUA_CHUA" }, 409);
    const nextChinhSach = body.chinh_sach !== undefined ? body.chinh_sach?.trim() || null : existing.chinh_sach;
    const nextMaYeuCauSuCo = body.ma_yeu_cau_su_co !== undefined ? body.ma_yeu_cau_su_co?.trim() || null : existing.ma_yeu_cau_su_co;
    const nextMaLada = body.ma_lada !== undefined ? body.ma_lada?.trim().toUpperCase() || null : existing.ma_lada;
    if (canNoRequired(nextLde) && (!nextChinhSach || !coMaIdLienQuan(nextMaYeuCauSuCo, nextMaLada))) {
      return c.json({ error: "THIEU_CHINH_SACH_HOAC_MA_YCSC" }, 400);
    }
    if (!canNoRequired(nextLde) && maYcscRequired(nextLde) && !coMaIdLienQuan(nextMaYeuCauSuCo, nextMaLada)) {
      return c.json({ error: "THIEU_MA_YCSC" }, 400);
    }

    let tenLkSnapshot = existing.ten_lk_snapshot;
    let giaDeXuat = existing.gia_de_xuat;
    const maLkGui = body.ma_lk !== undefined ? body.ma_lk.trim() : existing.ma_lk;
    // Ma LK da doi/gop (migration 0053) -> quy ve ma chuan.
    const nextMaLk = body.ma_lk !== undefined ? (await quyVeMaChuan(c.env.DB, [maLkGui])).get(maLkGui) ?? maLkGui : maLkGui;
    if (!nextMaLk) return c.json({ error: "INVALID_DON_HANG" }, 400);
    if (nextMaLk !== existing.ma_lk) {
      const lk = await c.env.DB.prepare("SELECT ten_linh_kien as ten_lk, gia_ban FROM linh_kien WHERE ma_linh_kien = ?")
        .bind(nextMaLk)
        .first<{ ten_lk: string; gia_ban: number | null }>();
      if (!lk) return c.json({ error: "MA_LK_NOT_FOUND", ma_lk: nextMaLk }, 400);
      tenLkSnapshot = lk.ten_lk;
      giaDeXuat = lk.gia_ban;
    }

    const nextSoLuong = !daCoPxk && body.so_luong_de_xuat !== undefined ? body.so_luong_de_xuat : existing.so_luong_de_xuat;
    if (!nextSoLuong || nextSoLuong <= 0) return c.json({ error: "INVALID_DON_HANG" }, 400);

    const next = {
      ma_lk: nextMaLk,
      ten_lk_snapshot: tenLkSnapshot,
      gia_de_xuat: giaDeXuat,
      loai_don: deriveLoaiDon(nextLde),
      loai_de_xuat: nextLde,
      so_luong_de_xuat: nextSoLuong,
      ghi_chu: body.ghi_chu !== undefined ? body.ghi_chu?.trim() || null : existing.ghi_chu,
      yeu_cau_hoa_don: body.yeu_cau_hoa_don !== undefined ? body.yeu_cau_hoa_don?.trim() || null : existing.yeu_cau_hoa_don,
      tt_khach_hang: body.tt_khach_hang !== undefined ? body.tt_khach_hang?.trim() || null : existing.tt_khach_hang,
      tt_mail_duyet: body.tt_mail_duyet !== undefined ? body.tt_mail_duyet?.trim() || null : existing.tt_mail_duyet,
      chinh_sach: nextChinhSach,
      ma_yeu_cau_su_co: nextMaYeuCauSuCo,
      ma_lada: nextMaLada,
      uu_tien: body.uu_tien !== undefined ? (body.uu_tien ? 1 : 0) : existing.uu_tien,
      // 4 truong loi TN (them 2026-09-21) - null khi khong phai TN (canTacNghiep false), giu nguyen
      // existing.* trong cau UPDATE ben duoi trong TH do (xem nextTn ?? existing.* o binds).
      so_luong_thuc_xuat: nextTn?.so_luong_thuc_xuat ?? existing.so_luong_thuc_xuat,
      gia_chot: nextTn?.gia_chot ?? existing.gia_chot,
      ma_xuat_kho: nextTn?.ma_xuat_kho ?? existing.ma_xuat_kho,
      ma_misa: nextTn?.ma_misa ?? existing.ma_misa,
    };

    // FIX (phan hoi QA 2026-08-31, muc #14): truoc day khong ghi log khi nguoi tao sua lai dong trong
    // "cua so" con mo - reuse dung trang_thai HIEN TAI lam gia tri trang_thai (fallback "Cho Tram
    // duyet" cho TH hiem latestDonHangStatusExpr ra null - dung PATTERN da co o nhanh TN cu), mo ta
    // thay doi qua ghi_chu (gop CA "thong tin goc" LAN "4 truong loi TN" - xem nextTn - vao 1 dong log
    // duy nhat cho 1 lan PATCH, them 2026-09-21).
    const thayDoiTao: string[] = [];
    if (next.ma_lk !== existing.ma_lk) thayDoiTao.push(`Mã LK ${existing.ma_lk} → ${next.ma_lk}`);
    if (next.so_luong_de_xuat !== existing.so_luong_de_xuat) thayDoiTao.push(`SL đề xuất ${existing.so_luong_de_xuat} → ${next.so_luong_de_xuat}`);
    if (next.loai_de_xuat !== existing.loai_de_xuat) thayDoiTao.push(`Loại đề xuất ${existing.loai_de_xuat ?? "—"} → ${next.loai_de_xuat}`);
    if (next.uu_tien !== existing.uu_tien) thayDoiTao.push(next.uu_tien ? "Đánh dấu ưu tiên" : "Bỏ đánh dấu ưu tiên");
    if (nextTn && next.so_luong_thuc_xuat !== existing.so_luong_thuc_xuat) {
      thayDoiTao.push(`SL thực xuất ${existing.so_luong_thuc_xuat ?? "—"} → ${next.so_luong_thuc_xuat ?? "—"}: ${body.ghi_chu_so_luong?.trim()}`);
    }
    if (nextTn && next.gia_chot !== existing.gia_chot) thayDoiTao.push(`Giá chốt ${existing.gia_chot ?? "—"} → ${next.gia_chot ?? "—"}`);
    if (nextTn && next.ma_xuat_kho !== existing.ma_xuat_kho) thayDoiTao.push(`Mã đơn hàng ${existing.ma_xuat_kho ?? "—"} → ${next.ma_xuat_kho ?? "—"}`);
    if (nextTn && next.ma_misa !== existing.ma_misa) thayDoiTao.push(`Mã MISA ${existing.ma_misa ?? "—"} → ${next.ma_misa ?? "—"}`);
    // Hinh thuc hoa don (2026-11-09; v1.521 bo bat buoc giu hoa don voi don "KH đã chuyển khoản về công ty"): doi hinh thuc = doi
    // nhom phieu -> chi khi phieu con "Dang tao phieu" (go ra + gom lai dung nhom ben duoi), phieu da gui Ke toan thi khong doi duoc.
    const doiNhomHd = nhomHoaDon(next.yeu_cau_hoa_don) !== nhomHoaDon(existing.yeu_cau_hoa_don);
    if (doiNhomHd && existing.pxk_id && existing.pxk_trang_thai && !["Dang tao phieu", "Ke toan huy"].includes(existing.pxk_trang_thai)) {
      return c.json({ error: "DON_TRONG_PHIEU_KHONG_DOI_HOA_DON", pxk: existing.pxk_id }, 409);
    }
    // KH chuyen khoan (v1.538): doi co = doi QUY tien (quy KTV <-> "Quỹ KH chuyển khoản") + gia niem yet + nhom phieu. Chi khi don CHUA giu tien
    // (trigger trg_ddh_kh_chuyen_khoan_khoa) va phieu chua co tien / chua gui Ke toan: go don khoi phieu "Dang tao phieu" TRUOC khi ghi roi gom lai.
    const nextKh = body.kh_chuyen_khoan !== undefined ? (body.kh_chuyen_khoan ? 1 : 0) : existing.kh_chuyen_khoan;
    const doiKh = nextKh !== existing.kh_chuyen_khoan;
    if (doiKh) {
      if (nextKh && (laMuaCongNoDoiTac(next.loai_de_xuat) || !(next.loai_don === "mua" || laTruCongNo(next.loai_de_xuat)))) {
        return c.json({ error: "KH_CHUYEN_KHOAN_CHI_DON_MUA" }, 400);
      }
      // v1.539 ("không tích được" - phieu da co tien): phieu con "Dang tao phieu" / "Cho ke toan" (Ke toan chua chot) -> don tu roi phieu nhu
      // DON CHUA THANH TOAN (tong phieu giam, phan tra thua hoan ve quy cu - canBangPxk), roi gom vao phieu dung quy moi. Chi chan khi phieu da
      // chot xuat, hoac don dang MANG tien rieng (tien_da_tra - tien thuoc quy cu, chua co duong chuyen quy).
      const trongPhieu = !!existing.pxk_id && existing.pxk_trang_thai !== "Ke toan huy";
      if (existing.tien_da_tra > 0 || (trongPhieu && !["Dang tao phieu", "Cho ke toan"].includes(existing.pxk_trang_thai ?? ""))) {
        return c.json({ error: "KH_CHUYEN_KHOAN_KHONG_DOI_DUOC", pxk: existing.pxk_id }, 409);
      }
      thayDoiTao.push(nextKh ? "Tích \"KH đã chuyển khoản về công ty\"" : "Bỏ \"KH đã chuyển khoản về công ty\"");
    }
    const goTruocDoiKh = doiKh && !!existing.pxk_id && ["Dang tao phieu", "Cho ke toan"].includes(existing.pxk_trang_thai ?? "");
    const thayDoiTinhTien = doiKh ||
      next.ma_lk !== existing.ma_lk ||
      next.loai_de_xuat !== existing.loai_de_xuat ||
      next.so_luong_de_xuat !== existing.so_luong_de_xuat ||
      next.so_luong_thuc_xuat !== existing.so_luong_thuc_xuat ||
      next.gia_chot !== existing.gia_chot ||
      next.yeu_cau_hoa_don !== existing.yeu_cau_hoa_don; // co/khong yeu cau hoa don doi gia (chot 2026-09-29)

    // FIX 2026-09-29 (bug "TN chuyển đơn sai loại đề xuất sang loại TRẢ HÀNG, đơn vẫn nằm Chờ TN duyệt"): doi loai de
    // xuat qua lai giua nhom Mua/Cong no va nhom TRA HANG = doi LUONG quy trinh - truoc day chi doi cot loai_don, giu
    // nguyen trang_thai_hien_tai cua luong cu nen don ket o trang thai khong ton tai trong luong moi. Gio dat lai
    // trang thai dau cua luong moi: Mua -> Tra hang = "Cho ke toan duyet mem" (khong bat anh - anh chi bat luc KTV
    // tao don tra hang); Tra hang -> Mua = "Cho TN duyet" (TN dang sua chinh la nguoi duyet tiep) va CHI khi don tra
    // hang chua ai xu ly (con "Cho ke toan duyet mem"). Don da dong (tu choi/huy) khong doi luong duoc.
    const laTraCu = existing.loai_don === "tra_hang";
    const laTraMoi = next.loai_don === "tra_hang";
    let trangThaiLuongMoi: string | null = null;
    if (laTraCu !== laTraMoi) {
      if (laTraMoi) {
        if (["TN tu choi", "Da huy"].includes(existing.trang_thai_hien_tai)) return c.json({ error: "DON_DA_DONG_KHONG_DOI_LUONG" }, 409);
        trangThaiLuongMoi = "Cho ke toan duyet mem";
        thayDoiTao.push("Chuyển sang luồng Trả hàng (chờ Kế toán duyệt mềm)");
      } else {
        if (existing.trang_thai_hien_tai !== "Cho ke toan duyet mem") return c.json({ error: "TRA_HANG_DA_XU_LY_KHONG_DOI_LUONG" }, 409);
        trangThaiLuongMoi = "Cho TN duyet";
        thayDoiTao.push("Chuyển từ luồng Trả hàng về đơn đặt hàng (chờ TN duyệt)");
      }
    }

    if (goTruocDoiKh) {
      const go = await goDonKhoiPxk(c.env.DB, existing.pxk_id!, id, user.email, "Đổi KH chuyển khoản, gỡ đơn",
        (nextKh ? "KH đã chuyển khoản về công ty" : "Bỏ KH chuyển khoản") + ((existing.pxk_da_tt ?? 0) > 0 ? " — tính là đơn chưa thanh toán (đổi quỹ tiền)" : ""), true, false);
      if (go.hoanQuy > 0) c.executionCtx.waitUntil(thongBaoHoanQuyPhieuHuy(c.env, c.env.DB, existing.pxk_id!, go.hoanQuy));
    }
    const nowSua = nowVN();
    const statementsSua = [
      c.env.DB.prepare(
        `UPDATE dat_don_hang SET ma_lk = ?, ten_lk_snapshot = ?, gia_de_xuat = ?, loai_don = ?, loai_de_xuat = ?,
           so_luong_de_xuat = ?, ghi_chu = ?, yeu_cau_hoa_don = ?, tt_khach_hang = ?, tt_mail_duyet = ?,
           chinh_sach = ?, ma_yeu_cau_su_co = ?, ma_lada = ?, uu_tien = ?,
           so_luong_thuc_xuat = ?, gia_chot = ?, ma_xuat_kho = ?, ma_misa = ?, kh_chuyen_khoan = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(
        next.ma_lk, next.ten_lk_snapshot, next.gia_de_xuat, next.loai_don, next.loai_de_xuat,
        next.so_luong_de_xuat, next.ghi_chu, next.yeu_cau_hoa_don, next.tt_khach_hang, next.tt_mail_duyet,
        next.chinh_sach, next.ma_yeu_cau_su_co, next.ma_lada, next.uu_tien,
        next.so_luong_thuc_xuat, next.gia_chot, next.ma_xuat_kho, next.ma_misa, nextKh, nowSua, id,
      ),
    ];
    if (trangThaiLuongMoi) {
      // CAS: trang thai da bi nguoi khac doi giua luc doc va luc ghi -> INSERT vi pham CHECK x=0 -> rollback ca batch.
      statementsSua.unshift(
        c.env.DB.prepare("INSERT INTO quy_cas_guard (x) SELECT 1 WHERE (SELECT trang_thai_hien_tai FROM dat_don_hang WHERE id = ?) IS NOT ?").bind(
          id, existing.trang_thai_hien_tai,
        ),
      );
      statementsSua.push(
        c.env.DB.prepare("UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1 WHERE id = ?").bind(trangThaiLuongMoi, id),
      );
    }
    if (thayDoiTao.length > 0) {
      // Tra hang -> Mua: log mang trang thai MOI ("Cho TN duyet") vi trang thai luong mua doc tu log cuoi cung
      // (latestDonHangStatusExpr) va moc han 24h cua TN tinh tu log "Cho TN duyet" nay.
      const trangThaiLog = trangThaiLuongMoi && !laTraMoi ? trangThaiLuongMoi : (existing.trang_thai ?? "Cho Tram duyet");
      statementsSua.push(
        c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
          id, trangThaiLog, user.email, nowSua, `Sửa: ${thayDoiTao.join(" | ")}`,
        ),
      );
    }
    if (trangThaiLuongMoi && laTraMoi) {
      // Lich su man Tra hang doc tra_hang_log - ghi moc vao luong kem ly do.
      statementsSua.push(
        c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
          id, trangThaiLuongMoi, user.email, nowSua, `Chuyển từ đơn đặt hàng: loại đề xuất ${existing.loai_de_xuat ?? "—"} → ${next.loai_de_xuat}`,
        ),
      );
    }
    try {
      await c.env.DB.batch(statementsSua);
    } catch (e) {
      if (trangThaiLuongMoi && String(e).includes("CHECK")) return c.json({ error: "STATE_CHANGED" }, 409);
      throw e;
    }
    if (trangThaiLuongMoi) {
      // Don dang "Cho hang" co ticket Thieu LK mo -> dong ticket (don khong con la don mua).
      if (laTraMoi && existing.trang_thai_hien_tai === "Cho hang") {
        await dongThieuLkMoCuaDon(c.env.DB, id, "Da huy bo", user.email, `Đơn chuyển sang luồng Trả hàng (loại đề xuất ${next.loai_de_xuat})`);
      }
      const tenLkNoiDung = `"${next.ten_lk_snapshot ?? next.ma_lk} (x${next.so_luong_de_xuat})"`;
      const emailGsList = existing.email_gs ? [existing.email_gs] : [];
      c.executionCtx.waitUntil(
        laTraMoi
          ? (async () =>
              notifyWorkflowTask(c.env, c.env.DB, {
                cat1Emails: await emailsForRoleOrQC(c.env.DB, "la_ke_toan", emailGsList),
                otherRoles: TRA_HANG_ROLES.filter((r) => r !== "la_ke_toan"),
                emailGsList,
                pastActors: [],
                title: "Trả hàng",
                body: `Đơn trả hàng ${tenLkNoiDung} (TN chuyển từ đơn đặt hàng) đang chờ bạn duyệt`,
                linkType: "don_hang",
                linkId: id,
              }))()
          : (async () =>
              notifyWorkflowTask(c.env, c.env.DB, {
                cat1Emails: await emailsForRoleOrQC(c.env.DB, "la_tac_nghiep", emailGsList),
                otherRoles: MUA_CONG_NO_ROLES.filter((r) => r !== "la_tac_nghiep"),
                emailGsList,
                pastActors: [],
                title: "Đặt mua linh kiện",
                body: `Đơn ${tenLkNoiDung} (chuyển từ trả hàng) đang chờ bạn duyệt`,
                linkType: "don_hang",
                linkId: id,
              }))(),
      );
    }
    // Van phong sua tay dong trong PXK -> KTV het quyen tu huy don tu duyet cua phieu (lib/pxkTuHuy.ts).
    if (existing.pxk_id && laVanPhong(user)) await danhDauVanPhongTacDong(c.env.DB, existing.pxk_id, user.email);
    // Doi loai don (Mua <-> Cong no <-> Tra hang) khi don dang nam trong phieu "Dang tao phieu" (vd don chua duyet vao phieu
    // tu luc tao, 2026-09-30) -> phieu khac loai, go don khoi phieu (tien thua ve quy).
    const goVinhDoiLoai = !!existing.pxk_id && existing.pxk_trang_thai === "Dang tao phieu" && next.loai_don !== existing.loai_don;
    if (goTruocDoiKh) {
      // Da go khoi phieu cu truoc khi ghi co KH -> gom lai vao phieu dung quy / nhom.
      const ttSau = await c.env.DB.prepare("SELECT trang_thai_hien_tai AS tt, loai_don FROM dat_don_hang WHERE id = ?").bind(id).first<{ tt: string; loai_don: string }>();
      if (existing.nguoi_nhan_hang && (ttSau?.tt === "TN da duyet" || ttSau?.tt === "Cho thanh toan") && (ttSau.loai_don === "mua" || ttSau.loai_don === "cong_no")) {
        await bundleAutoApprovedIntoPxk(c.env, c.env.DB, user.email, existing.nguoi_nhan_hang, ttSau.loai_don, [{ donHangId: id, soTien: 0 }], { boQuaPxk: existing.pxk_id! });
      }
    } else if (goVinhDoiLoai) {
      const go = await goDonKhoiPxk(c.env.DB, existing.pxk_id!, id, user.email, "Đổi loại đề xuất, gỡ đơn", `${existing.loai_de_xuat ?? ""} → ${next.loai_de_xuat ?? ""}`, true);
      if (go.hoanQuy > 0) c.executionCtx.waitUntil(thongBaoHoanQuyPhieuHuy(c.env, c.env.DB, existing.pxk_id!, go.hoanQuy));
    } else if (doiNhomHd && existing.pxk_id && existing.pxk_trang_thai === "Dang tao phieu") {
      // Doi hinh thuc hoa don -> roi phieu cu MANG THEO tien da tra, gom lai vao phieu dung nhom (phieu rieng theo hinh thuc hoa don).
      const go = await goDonKhoiPxk(
        c.env.DB, existing.pxk_id, id, user.email, "Đổi hình thức hóa đơn, gỡ đơn",
        `${existing.yeu_cau_hoa_don ?? "Không"} → ${next.yeu_cau_hoa_don ?? "Không"}`, true, true,
      );
      if (go.hoanQuy > 0) c.executionCtx.waitUntil(thongBaoHoanQuyPhieuHuy(c.env, c.env.DB, existing.pxk_id, go.hoanQuy));
      const ttSau = await c.env.DB.prepare("SELECT trang_thai_hien_tai AS tt, loai_don FROM dat_don_hang WHERE id = ?").bind(id).first<{ tt: string; loai_don: string }>();
      if (existing.nguoi_nhan_hang && (ttSau?.tt === "TN da duyet" || ttSau?.tt === "Cho thanh toan") && (ttSau.loai_don === "mua" || ttSau.loai_don === "cong_no")) {
        await bundleAutoApprovedIntoPxk(c.env, c.env.DB, user.email, existing.nguoi_nhan_hang, ttSau.loai_don, [{ donHangId: id, soTien: 0 }], { boQuaPxk: existing.pxk_id });
      }
    } else if (existing.pxk_id && thayDoiTinhTien) await taiTinhPxk(c.env.DB, existing.pxk_id, false, true, user.email);
    // Doi ma LK/SL/SL thuc xuat lam doi tong don trong ngay cua KTV (chiet khau, chot 2026-09-28) -> tinh
    // lai CAC PXK dang tao KHAC cua KTV (PXK chua dong nay vua tinh o tren).
    if (thayDoiTinhTien) await taiTinhPxkMoCuaKtv(c.env.DB, existing.nguoi_nhan_hang, user.email, existing.pxk_id ?? undefined);
    // Don "Cho thanh toan" (thieu ton luc tao) doi ma LK / SL -> danh gia lai ton kho ngay, du thi tu duyet (2026-10-16); + doi gia chot / SL
    // thuc xuat / loai de xuat (2026-10-20, bug DDH-002733 gia chot -> 0): het tien phai chuyen ma van thieu -> "Cho hang" + ticket.
    if (!trangThaiLuongMoi) {
      const lyDoSua =
        next.ma_lk !== existing.ma_lk ? `đổi mã LK ${existing.ma_lk} → ${next.ma_lk}`
        : next.so_luong_de_xuat !== existing.so_luong_de_xuat ? `đổi SL ${existing.so_luong_de_xuat} → ${next.so_luong_de_xuat}`
        : next.gia_chot !== existing.gia_chot ? `đổi giá chốt ${existing.gia_chot ?? "—"} → ${next.gia_chot ?? "—"}`
        : next.so_luong_thuc_xuat !== existing.so_luong_thuc_xuat ? `đổi SL thực xuất ${existing.so_luong_thuc_xuat ?? "—"} → ${next.so_luong_thuc_xuat ?? "—"}`
        : next.loai_de_xuat !== existing.loai_de_xuat ? `đổi loại đề xuất ${existing.loai_de_xuat ?? "—"} → ${next.loai_de_xuat ?? "—"}`
        : null;
      if (lyDoSua) await danhGiaLaiDonChoThanhToan(c.env, c.env.DB, id, user.email, lyDoSua);
    }
    if (trangThaiLuongMoi) {
      c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
      return c.json({ ok: true, chuyen_luong: laTraMoi ? "tra_hang" : "dat_hang", trang_thai: trangThaiLuongMoi });
    }
  } else if (canTacNghiep(c)) {
    return c.json({ error: "PXK_DA_QUA_BUOC_TAO_PHIEU" }, 409);
  } else {
    return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  }

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// Co `duoc_doi_loai_de_xuat` o chi tiet don: dung quyen + don con doi duoc (DOI_LDE_DUOC_SQL).
async function duocDoiLoaiDeXuatChiTiet(db: D1Database, user: AppUser, id: string): Promise<boolean> {
  if (!(await duocDoiLoaiDeXuat(db, user, id))) return false;
  return !!(await db.prepare(`SELECT 1 FROM dat_don_hang d WHERE d.id = ? AND ${DOI_LDE_DUOC_SQL("d")}`).bind(id).first());
}

// POST /api/dat-mua-lk/don-hang/:id/doi-loai-de-xuat - { loai_de_xuat, chinh_sach?, ma_yeu_cau_su_co?, ma_lada?, ghi_chu? } (chot 2026-10-30,
// v1.424): KTV (nguoi tao / nhan) / GS / Ke toan + TN / Kho / Admin doi loai de xuat khi don CHUA xu ly chuyen tien, Ke toan chua duyet, Kho chua
// tiep nhan cho hang -> danh gia lai (tran cong no, TBP, ton kho, tien) + tu chuyen phieu theo nhom loai de xuat. Logic + danh sach rui ro:
// lib/doiLoaiDeXuat.ts. Route chi chuan hoa ten loai theo danh muc + truong bat buoc theo loai moi.
datMuaLinhKien.post("/don-hang/:id/doi-loai-de-xuat", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<{ loai_de_xuat?: string; chinh_sach?: string | null; ma_yeu_cau_su_co?: string | null; ma_lada?: string | null; ghi_chu?: string | null }>();
  const khoa = (v: string) => v.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
  const gui = khoa(body.loai_de_xuat ?? "");
  if (!gui) return c.json({ error: "INVALID_BODY" }, 400);
  // Quyen + dieu kien don TRUOC (bao dung ly do khong doi duoc, khong bat nhap truong bat buoc vo ich).
  if (!(await duocDoiLoaiDeXuat(c.env.DB, user, id))) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const khongDuoc = await lyDoKhongDoiDuoc(c.env.DB, id);
  if (khongDuoc) return c.json({ error: khongDuoc }, khongDuoc === "NOT_FOUND" ? 404 : 409);
  const { results: dsLde } = await c.env.DB.prepare("SELECT ten_option FROM settings_loai_de_xuat WHERE bat_tat = 1").all<{ ten_option: string }>();
  const lde = dsLde.find((r) => khoa(r.ten_option) === gui)?.ten_option;
  if (!lde) return c.json({ error: "LOAI_DE_XUAT_KHONG_HOP_LE" }, 400);
  const cu = await c.env.DB.prepare("SELECT chinh_sach, ma_yeu_cau_su_co, ma_lada FROM dat_don_hang WHERE id = ?")
    .bind(id)
    .first<{ chinh_sach: string | null; ma_yeu_cau_su_co: string | null; ma_lada: string | null }>();
  if (!cu) return c.json({ error: "NOT_FOUND" }, 404);
  const chinhSach = body.chinh_sach !== undefined ? body.chinh_sach?.trim() || null : cu.chinh_sach;
  const maYcsc = body.ma_yeu_cau_su_co !== undefined ? body.ma_yeu_cau_su_co?.trim() || null : cu.ma_yeu_cau_su_co;
  const maLada = body.ma_lada !== undefined ? body.ma_lada?.trim().toUpperCase() || null : cu.ma_lada;
  if (canNoRequired(lde) && (!(chinhSach ?? chinhSachMacDinh(lde)) || !coMaIdLienQuan(maYcsc, maLada))) return c.json({ error: "THIEU_CHINH_SACH_HOAC_MA_YCSC" }, 400);
  if (!canNoRequired(lde) && maYcscRequired(lde) && !coMaIdLienQuan(maYcsc, maLada)) return c.json({ error: "THIEU_MA_YCSC" }, 400);
  const kq = await doiLoaiDeXuatDon(c.env, c.env.DB, user, id, {
    loaiDeXuat: lde, chinhSach: chinhSach ?? chinhSachMacDinh(lde), maYcsc, maLada, ghiChu: body.ghi_chu?.trim().slice(0, 500) || null,
  }, (p) => c.executionCtx.waitUntil(p));
  if ("error" in kq) return c.json({ error: kq.error, ...(kq.message ? { message: kq.message } : {}) }, kq.status);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, loai_de_xuat: lde, trang_thai: kq.trangThai, trang_thai_cu: kq.trangThaiCu, pxk_moi: kq.pxkMoi, pxk_cu: kq.pxkCu, doi_phieu: kq.doiPhieu });
});

// PATCH /api/dat-mua-lk/don-hang/:id/so-tien-cong-no - them 2026-09-21 (phan hoi "ở bước chờ KTV
// chuyển tiền, cho phép Kế toán/TN sửa tiền cần chuyển thủ công từng đơn") - so_tien_cong_no CHI ghi
// luc tao don (chot 2026-08-15 "bỏ ở nhập tay, thay bằng Gía đề xuất ước tính"), route nay CO CHU Y
// mo lai kha nang sua tay, nhung GIOI HAN CHAT: chi khi don da nam trong 1 PXK dang o dung buoc "Dang
// tao phieu" (buoc "chờ KTV chuyển tiền" thuc chat la dieu kien chan tren PXK, PXK khong the vuot qua
// "Dang tao phieu" khi tien chua duoc Ke toan duyet xong - xem phieuXuatKho.ts). Dung lai dung ky
// thuat latestDonHangStatusExpr + reuse trang_thai HIEN TAI lam gia tri log (pattern da co o nhanh TN
// cua PATCH /don-hang/:id ngay tren) - khong can migration moi cho dat_don_hang_log.
datMuaLinhKien.patch("/don-hang/:id/so-tien-cong-no", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  if (!canTacNghiep(c) && !user.la_ke_toan && user.vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);

  const body = await c.req.json<{ so_tien_cong_no: number; ghi_chu?: string }>();
  if (body.so_tien_cong_no == null || Number.isNaN(body.so_tien_cong_no) || body.so_tien_cong_no < 0 || body.so_tien_cong_no > CONG_NO_TOI_DA) {
    return c.json({ error: "INVALID_SO_TIEN" }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT dat_don_hang.so_tien_cong_no, ${latestDonHangStatusExpr("dat_don_hang.id")} as trang_thai,
       (SELECT pxk.trang_thai_hien_tai FROM phieu_xuat_kho_dong pxkd JOIN phieu_xuat_kho pxk ON pxk.id = pxkd.phieu_xuat_kho_id
        WHERE pxkd.dat_don_hang_id = dat_don_hang.id) as pxk_trang_thai,
       (SELECT pxkd.phieu_xuat_kho_id FROM phieu_xuat_kho_dong pxkd
        WHERE pxkd.dat_don_hang_id = dat_don_hang.id) as pxk_id
     FROM dat_don_hang WHERE id = ?`,
  )
    .bind(id)
    .first<{ so_tien_cong_no: number | null; trang_thai: string | null; pxk_trang_thai: string | null; pxk_id: string | null }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  if (existing.pxk_trang_thai == null) return c.json({ error: "KHONG_THUOC_PXK" }, 400);
  if (existing.pxk_trang_thai !== "Dang tao phieu") return c.json({ error: "INVALID_STATE" }, 409);

  const now = nowVN();
  const ghiChu = `Công nợ ${existing.so_tien_cong_no ?? "—"} → ${body.so_tien_cong_no}${body.ghi_chu?.trim() ? " | " + body.ghi_chu.trim() : ""}`;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE dat_don_hang SET so_tien_cong_no = ?, updated_at = ? WHERE id = ?").bind(body.so_tien_cong_no, now, id),
    c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      id, existing.trang_thai ?? "TN da duyet", user.email, now, ghiChu,
    ),
  ]);
  if (existing.pxk_id && laVanPhong(user)) await danhDauVanPhongTacDong(c.env.DB, existing.pxk_id, user.email);
  if (existing.pxk_id) await taiTinhPxk(c.env.DB, existing.pxk_id, false, true, user.email);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// TRA TIEN DON BANG QUY DU (chot 2026-09-30, phan hoi "nếu quỹ của KTV có tiền >= đơn hàng chưa chuyển tiền, TN xác nhận
// trực tiếp đơn đó đã chuyển tiền bằng tiền quỹ hiện tại (quỹ giảm bằng số tiền cần chuyển)"). CHI don CHUA nam trong phieu
// nao (don trong phieu "Cho KTV chuyen" da duoc quy tu tru qua canBangPxk). So can tra = tien uoc tinh cua don (sau chiet
// khau) - tien don dang mang (tien_da_tra). Tien vao dat_don_hang.tien_da_tra (migration 0056) -> don "Đã thanh toán", vao
// phieu moi thi cong vao phieu; don bi huy -> trigger hoan lai quy.
async function thongTinTraBangQuy(
  db: D1Database, donHangId: string,
): Promise<{ canTra: number; quy: number; email: string; tienDaTra: number; maLk: string } | { error: string }> {
  const d = await db.prepare(
    `SELECT id, ma_lk, loai_don, loai_de_xuat, nguoi_nhan_hang, trang_thai_hien_tai, tien_da_tra, doi_tac_ma, COALESCE(kh_chuyen_khoan, 0) AS kh_chuyen_khoan,
            EXISTS (SELECT 1 FROM phieu_xuat_kho_dong WHERE dat_don_hang_id = dat_don_hang.id) as trong_phieu
     FROM dat_don_hang WHERE id = ?`,
  ).bind(donHangId).first<{
    id: string; ma_lk: string; loai_don: string; loai_de_xuat: string | null; nguoi_nhan_hang: string | null;
    trang_thai_hien_tai: string; tien_da_tra: number; trong_phieu: number; doi_tac_ma: string | null; kh_chuyen_khoan: number;
  }>();
  if (!d) return { error: "NOT_FOUND" };
  // MUA HÀNG CÔNG NỢ ĐỐI TÁC (2026-10-26, v1.408 - "gán nợ cho đối tác, KTV nhận hàng sẽ không bị tính công nợ hay tiền cần mua") - ghi no doi tac, KTV khong tra.
  if (d.doi_tac_ma) return { error: "DON_KHONG_CAN_CHUYEN_TIEN" };
  if (["TN tu choi", "Tu choi", "Da huy"].includes(d.trang_thai_hien_tai)) return { error: "DONG_DA_DONG" };
  if (!(d.loai_don === "mua" || laTruCongNo(d.loai_de_xuat ?? ""))) return { error: "DON_KHONG_CAN_CHUYEN_TIEN" };
  if (d.trong_phieu) return { error: "DON_DANG_TRONG_PHIEU" };
  if (!d.nguoi_nhan_hang) return { error: "DON_KHONG_CAN_CHUYEN_TIEN" };
  const tien = (await tienUocTinhChoDon(db, [donHangId])).get(donHangId) ?? 0;
  const canTra = Math.max(0, tien - (d.tien_da_tra ?? 0));
  if (canTra <= 0) return { error: "DON_DA_DU_TIEN" };
  // Don KH chuyen khoan chi tieu "Quỹ KH chuyển khoản" (migration 0111), don thuong chi tieu quy du KTV.
  const quy = khoaQuy(d.nguoi_nhan_hang, d.kh_chuyen_khoan);
  return { canTra, quy: await soDuQuy(db, quy), email: quy, tienDaTra: d.tien_da_tra ?? 0, maLk: d.ma_lk };
}

// POST /api/dat-mua-lk/don-hang/:id/tra-bang-quy - TN/Admin xac nhan don da thanh toan bang quy du cua nguoi nhan hang.
datMuaLinhKien.post("/don-hang/:id/tra-bang-quy", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const user = c.get("user");
  const t = await thongTinTraBangQuy(c.env.DB, id);
  if ("error" in t) return c.json({ error: t.error }, t.error === "NOT_FOUND" ? 404 : 409);
  if (t.quy < t.canTra) return c.json({ error: "QUY_KHONG_DU", so_du: t.quy }, 409);
  const now = nowVN();
  try {
    await c.env.DB.batch([
      // CAS: don vua duoc tra/vao phieu boi thao tac khac -> INSERT vi pham CHECK -> rollback ca batch.
      c.env.DB.prepare(
        `INSERT INTO quy_cas_guard (x) SELECT 1 WHERE (SELECT tien_da_tra FROM dat_don_hang WHERE id = ?) IS NOT ?
           OR EXISTS (SELECT 1 FROM phieu_xuat_kho_dong WHERE dat_don_hang_id = ?)`,
      ).bind(id, t.tienDaTra, id),
      ...lenhGhiQuy(c.env.DB, {
        email: t.email, loai: "tra_phieu", soTien: -t.canTra, pxkId: null, nguoi: user.email, now,
        ghiChu: `TN xác nhận đơn ${id} (${t.maLk}) đã thanh toán bằng quỹ dư`,
      }),
      c.env.DB.prepare("UPDATE dat_don_hang SET tien_da_tra = tien_da_tra + ?, tien_da_tra_email = ?, updated_at = ? WHERE id = ?")
        .bind(t.canTra, t.email, now, id),
    ]);
  } catch {
    return c.json({ error: "DU_LIEU_VUA_DOI" }, 409); // quy vua giam (CHECK so_du >= 0) hoac don vua doi
  }
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, so_tien: t.canTra });
});

// POST /api/dat-mua-lk/don-hang/:id/giai-trinh - { noi_dung } TN nop 1 LAN GIAI TRINH ly do cham moi
// (phan hoi QA 2026-08-31, muc #5, migration 0014 dat_don_hang_giai_trinh) - thay the co che PATCH
// { ly_do_cham } cu (1 cot duy nhat, khoa vinh vien sau lan dau). Co the nop TRUOC han (chu dong giai
// trinh som, giu dung hanh vi cu "khong gate o day, chi gate luc chuyen trang thai") hoac SAU khi qua
// han - MOI lan nop deu la 1 dong LICH SU moi (khong ghi de), va RESET dong ho 24h ke tu chinh thoi
// diem nop nay (xem lastGiaiTrinhAtExpr dung o GET /don-hang, /don-hang/:id, applyDonHangLog). Chi TN
// (canTacNghiep) nop duoc.
// FIX (phan hoi 2026-09-10: "PXK lỗi không nhập được lý do quá hạn" - PXK bi ket vinh vien) - gate CU
// chi cho nop khi dong CON "Cho TN duyet" dua tren gia dinh "het y nghia sau khi da duyet", nhung
// POST /phieu-xuat-kho/:id/log (target "Cho ke toan") lai KIEM TRA LAI qua_han_ly_do_cham cho MOI dong
// da o trong PXK (da chac chan "TN da duyet" tu truoc) MOI LAN TN co gui len ke toan - quaHanLyDoCham()
// so sanh "now" voi moc co dinh (lan giai trinh gan nhat hoac cho_tn_duyet_at), nen chi can PXK nam
// yen (cho KTV chuyen tien, gom them dong...) qua 24h la lai bi coi "qua han" MAI MAI ma khong con cach
// nao nop giai trinh moi de reset dong ho - PXK ket cung, khong bao gio gui duoc ke toan. Nay MO RONG:
// van cho nop khi dong da "TN da duyet" NEU dong ho qua_han_ly_do_cham dang thuc su qua han (dung
// chinh dieu kien ma phieuXuatKho.ts dang doi hoi) - khong cho voi cac trang thai khac (Cho Tram
// duyet/Cho TBP xac nhan: chua toi luot TN; TN tu choi/Da huy/Cho hang: da ket thuc/tam dung luong TN
// duyet, khai niem nay khong ap dung).
datMuaLinhKien.post("/don-hang/:id/giai-trinh", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json<{ noi_dung: string }>();
  if (!body.noi_dung?.trim()) return c.json({ error: "MISSING_NOI_DUNG" }, 400);

  // BUG THAT (phat hien 2026-09-05, phan hoi "vẫn bug không cho lưu lý do quá hạn DDH-000018") - cung
  // dang bug voi PATCH /don-hang/:id da sua truoc do (xem comment "BUG THAT" o duoi): truyen "id"
  // KHONG qualify cho latestDonHangStatusExpr() trong khi bang goc la "dat_don_hang" khong alias - cot
  // "id" trong subquery tuong quan bi cot "id" cua CHINH dat_don_hang_log (PK) SHADOW, luon ra trang
  // thai NULL -> INVALID_STATE gia (dong VAN DANG "Cho TN duyet" that, chi la truy van doc sai). Phai
  // qualify "dat_don_hang.id".
  const ddh = await c.env.DB.prepare(
    `SELECT ${latestDonHangStatusExpr("dat_don_hang.id")} as trang_thai,
       ${choTnDuyetAtExpr("dat_don_hang.id")} as cho_tn_duyet_at,
       ${lastGiaiTrinhAtExpr("dat_don_hang.id")} as last_giai_trinh_at
     FROM dat_don_hang WHERE id = ?`,
  )
    .bind(id)
    .first<{ trang_thai: string | null; cho_tn_duyet_at: string | null; last_giai_trinh_at: string | null }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  const now = nowVN();
  const mocThoiGian = mocTinhHanTn(ddh.last_giai_trinh_at, ddh.cho_tn_duyet_at);
  const dangQuaHan = !!mocThoiGian && quaHanLyDoCham(mocThoiGian, now);
  const hopLe = ddh.trang_thai === "Cho TN duyet" || (ddh.trang_thai === "TN da duyet" && dangQuaHan);
  if (!hopLe) return c.json({ error: "INVALID_STATE" }, 409);

  const noiDung = body.noi_dung.trim();
  // ly_do_cham (cot cu tren dat_don_hang) GIU LAM MIRROR noi dung LAN GIAI TRINH GAN NHAT - cho cac
  // noi con hien thi nhanh khong can join sang bang lich su (xem migration 0014).
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO dat_don_hang_giai_trinh (dat_don_hang_id, noi_dung, nguoi_tao, ngay_tao) VALUES (?, ?, ?, ?)").bind(id, noiDung, user.email, now),
    c.env.DB.prepare("UPDATE dat_don_hang SET ly_do_cham = ?, updated_at = ? WHERE id = ?").bind(noiDung, now, id),
  ]);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// BO (ra soat bao mat 2026-08-18, phan hoi Codex): DELETE /api/dat-mua-lk/don-hang/:id xoa cung
// dat_don_hang_log (mat dau audit) va KHONG kiem tra nguoi goi la ai - bat ky tai khoan da duyet nao
// biet ID cung xoa duoc don cua nguoi khac. Frontend chua tung goi endpoint nay (khong co
// api.delete(".../don-hang/...") o dau trong module) - co san 1 co che "huy" MEM tuong duong, DA
// DUOC BAO VE DUNG (chi nguoi tao/Tram cua nguoi tao/Admin, bat buoc ghi_chu ly do, khong xoa lich
// su) qua POST /don-hang/:id/log { hanh_dong: "huy" } - xem nhanh "huy" trong applyDonHangLog o duoi.
// Xoa han endpoint thay vi vá lai vi da co duong thay the an toan hon, tranh duy tri 2 co che song
// song lam cung 1 viec.

// Quyen gan/go "Ma yeu cau su co lien quan" (dat_don_case) cua 1 dong don hang - RA SOAT BAO MAT
// 2026-08-18 (phan hoi Codex): truoc day 2 route duoi hoan toan khong kiem tra ai goi, chi kiem tra
// record ton tai - bat ky tai khoan da duyet nao cung gan/go duoc lien ket cua don nguoi khac. Dung
// chung 1 helper: nguoi tao dong (khi dong con dang mo, CHUA vao PXK nao) hoac Tac nghiep/Admin (moi
// luc, ke ca don da vao PXK/hoan thanh) - khop dung nguyen tac "nguoi tao chi sua duoc trong cua so
// dang mo" da dung o PATCH /don-hang/:id (isCreatorEditWindow) + "da vao PXK thi chi TN/Admin duoc
// dong vao du lieu" (tranh lech du lieu voi PXK da chot).
async function canManageDonHangCaseLink(
  c: Context<{ Bindings: Env }>,
  donHangId: string,
): Promise<{ error: string; status: 404 | 403 } | { ok: true }> {
  const ddh = await c.env.DB.prepare(
    `SELECT nguoi_tao, ma_xuat_kho, ${latestDonHangStatusExpr("dat_don_hang.id")} as trang_thai FROM dat_don_hang WHERE id = ?`,
  )
    .bind(donHangId)
    .first<{ nguoi_tao: string; ma_xuat_kho: string | null; trang_thai: string | null }>();
  if (!ddh) return { error: "NOT_FOUND", status: 404 };
  if (canTacNghiep(c)) return { ok: true };

  const user = c.get("user");
  const daVaoPxk = !!ddh.ma_xuat_kho;
  const daDong = !!ddh.trang_thai && (DON_HANG_TRANG_THAI_DONG as readonly string[]).includes(ddh.trang_thai);
  if (daVaoPxk || daDong || ddh.nguoi_tao !== user.email) return { error: "FORBIDDEN_ROLE", status: 403 };
  return { ok: true };
}

// POST /api/dat-mua-lk/don-hang/:id/case - { case_id } gan 1 case_dvbh vao dong don hang.
datMuaLinhKien.post("/don-hang/:id/case", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ case_id: string }>();
  if (!body.case_id?.trim()) return c.json({ error: "MISSING_CASE_ID" }, 400);

  const perm = await canManageDonHangCaseLink(c, id);
  if ("error" in perm) return c.json({ error: perm.error }, perm.status);
  // SUA (tach he doc lap): xac nhan case ton tai qua API he cu thay vi truy van case_dvbh cuc bo.
  const caseRow = await lookupCase(body.case_id.trim(), c.env);
  if (!caseRow) return c.json({ error: "CASE_NOT_FOUND" }, 404);

  await c.env.DB.prepare("INSERT OR IGNORE INTO dat_don_case (dat_don_hang_id, case_id) VALUES (?, ?)").bind(id, body.case_id.trim()).run();
  return c.json({ ok: true }, 201);
});

datMuaLinhKien.delete("/don-hang/:id/case/:caseId", async (c) => {
  const id = c.req.param("id");
  const caseId = c.req.param("caseId");
  const perm = await canManageDonHangCaseLink(c, id);
  if ("error" in perm) return c.json({ error: perm.error }, perm.status);

  await c.env.DB.prepare("DELETE FROM dat_don_case WHERE dat_don_hang_id = ? AND case_id = ?").bind(id, caseId).run();
  return c.json({ ok: true });
});

// ---------- Nhanh "thieu linh kien" (xem migration 0057 + 0065_ly_do_cham_va_thieu_lk.sql) --------
// CHOT 2026-08-14: ticket CHI duoc he thong tu tao khi TN tu choi 1 dong bang 1 "Ly do cham" co co
// quan_ly_don_thieu_linh_kien=true (xem openThieuLkForDonHang + applyDonHangLog o tren) - khong con
// endpoint tao truc tiep rieng nua. Kho chi xu ly (tiep nhan/giai trinh/xac nhan hang ve) qua
// POST /thieu-lk/:id/log ben duoi; buoc cuoi "Da ket thuc" la cua TN (khop cot "Admin xu ly" trong
// du lieu Excel goc - "Admin" trong file cu = Tac nghiep trong he thong moi).

const THIEU_LK_TRANG_THAI_DONG = ["Da huy bo", "Da ket thuc"] as const;
// Kho DA tiep nhan ticket va dang xu ly (tim hang/cap nhat tien do) -> don goc "Cho hang" bi KHOA, phai cho Kho xac nhan
// hang ve / tu choi (chot 2026-09-30). Ticket "Cho kho xu ly" (Kho chua tiep nhan) hoac da dong -> don mo, thao tac nhu
// "Cho TN duyet", ticket tu huy (applyDonHangLog). Tra 0/1; alias = bang dat_don_hang. FE: kho_dang_xu_ly_thieu_lk.
// + "Cho mua hang" / "Mua hang da dat" (2026-10-19, migration 0093): ticket dang o tay Mua hang / cho EO ve - cung khoa don goc.
const THIEU_LK_KHO_DANG_XU_LY = ["Kho da tiep nhan", "Kho da cap nhat", "Cho mua hang", "Mua hang da dat"] as const;
function khoDangXuLyThieuLkSql(alias: string): string {
  return `(CASE WHEN ${alias}.trang_thai_hien_tai = 'Cho hang' AND EXISTS (
      SELECT 1 FROM thieu_lk kxl WHERE kxl.dat_don_hang_id = ${alias}.id
        AND ${latestThieuLkStatusExpr("kxl.id")} IN (${THIEU_LK_KHO_DANG_XU_LY.map((t) => `'${t}'`).join(", ")})
    ) THEN 1 ELSE 0 END)`;
}

// 3 nhanh "tiep tuc luong don hang": ghi 1 trong 3 trang thai nay -> don goc dang "Cho hang" quay ve "Cho TN duyet"
// (DOI 2026-09-29, truoc day tu nhay thang "TN da duyet") kem 1 dong log tom tat TOAN BO qua trinh Kho xu ly ticket.
// TN duyet don goc -> ticket tu sang "Da ket thuc" (nhan hien thi "TN đã duyệt"); TN duyet tren ticket -> don goc
// duyet theo (applyThieuLkLog). TN tu choi/huy/cho hang don goc -> ticket tu dong (dongThieuLkMoCuaDon).
const THIEU_LK_TIEP_TUC_LUONG = ["Kho xac nhan hang da ve", "Kho tu choi sai TT", "Mua hang tu choi", "Da huy bo"] as const;
// Ticket da xong phan Kho, CHO TN quyet dinh (duyet don goc) - buoc "Da ket thuc" chi hop le tu day.
const THIEU_LK_CHO_TN = ["Kho xac nhan hang da ve", "Kho tu choi sai TT", "Mua hang tu choi"] as const;
const THIEU_LK_NHAN: Record<string, string> = {
  "Cho kho xu ly": "Chờ kho xử lý",
  "Kho da tiep nhan": "Kho đã tiếp nhận",
  "Kho da cap nhat": "Kho đã cập nhật",
  "Cho mua hang": "Chờ mua hàng",
  "Mua hang da dat": "Mua hàng đã đặt",
  "Mua hang tu choi": "Mua hàng từ chối",
  "Kho xac nhan hang da ve": "Kho xác nhận hàng đã về",
  "Kho tu choi sai TT": "Kho từ chối (sai thông tin)",
  "Da huy bo": "Đã hủy bỏ",
  "Da ket thuc": "TN đã duyệt",
};
// "YYYY-MM-DD HH:MM[:SS]" -> "dd/mm HH:MM" (gio VN da luu san).
function ngayGioNgan(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : d;
}

// Dong MOI ticket thieu LK con mo cua 1 don goc (1 cau INSERT...SELECT, khong doc truoc) - goi khi don goc duoc TN
// duyet / tu choi / huy / chuyen "Cho hang" lan nua (2026-09-29).
async function dongThieuLkMoCuaDon(db: D1Database, donHangId: string, trangThai: "Da ket thuc" | "Da huy bo", email: string, ghiChu: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
       SELECT thieu_lk.id, ?, ?, ?, ? FROM thieu_lk
       WHERE thieu_lk.dat_don_hang_id = ? AND COALESCE(${latestThieuLkStatusExpr("thieu_lk.id")}, '') NOT IN ('Da huy bo', 'Da ket thuc')`,
    )
    .bind(trangThai, email, nowVN(), ghiChu.slice(0, 1000), donHangId)
    .run();
}

// Tom tat qua trinh xu ly 1 ticket (moi buoc: gio, trang thai, nguoi, ghi chu) + buoc SAP ghi (chua vao log) - ghi
// vao dat_don_hang_log luc don goc quay ve "Cho TN duyet" de TN doc duoc ngay tren don ma khong phai mo ticket.
async function tomTatThieuLk(
  db: D1Database,
  thieuLkId: string,
  buocMoi: { trangThai: string; email: string; ngay: string; ghiChu: string | null },
  ketQua = "chờ TN duyệt lại",
): Promise<string> {
  const { results } = await db
    .prepare(
      `SELECT l.trang_thai, l.ngay_xu_ly, l.ghi_chu, ${tenNguoiDaySql("l.nguoi_xu_ly")} AS ten
       FROM thieu_lk_log l WHERE l.thieu_lk_id = ? ORDER BY l.id`,
    )
    .bind(thieuLkId)
    .all<{ trang_thai: string; ngay_xu_ly: string; ghi_chu: string | null; ten: string }>();
  const nguoiMoi = { ten: (await tenNguoiMap(db, [buocMoi.email])).get(buocMoi.email) };
  const dong = [
    ...results.map((r) => ({ ...r })),
    { trang_thai: buocMoi.trangThai, ngay_xu_ly: buocMoi.ngay, ghi_chu: buocMoi.ghiChu, ten: nguoiMoi?.ten || buocMoi.email },
  ].map((r) => `• ${ngayGioNgan(r.ngay_xu_ly)} ${THIEU_LK_NHAN[r.trang_thai] ?? r.trang_thai} – ${r.ten}${r.ghi_chu ? `: ${r.ghi_chu}` : ""}`);
  return `Tự động: ${THIEU_LK_NHAN[buocMoi.trangThai] ?? buocMoi.trangThai} (ticket ${thieuLkId}) → ${ketQua}.\nQuá trình xử lý thiếu LK:\n${dong.join("\n")}`.slice(0, 2000);
}

export function latestThieuLkStatusExpr(thieuLkIdCol: string): string {
  return `(SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = ${thieuLkIdCol} ORDER BY id DESC LIMIT 1)`;
}

function canKho(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_kho || user.vai_tro === "Admin";
}

// Bo loc "Việc cần xử lý" cua tab Thieu LK (fix 2026-09-28: badge Sidebar "Thiếu linh kiện (1)" cua Kho dem CA
// "Kho da tiep nhan" nhung tab mo mac dinh loc "Cho kho xu ly" -> bam vao khong thay don nao). Cung tap trang thai
// voi thieuLkCanXuLy trong routes/notifications.ts - doi 1 ben phai doi ben kia.
const THIEU_LK_VIEC = "__VIEC__";
// "Chờ duyệt hủy" (v1.480): ticket con mo ma don goc co yeu cau huy (KTV / GS gui) dang cho Kho / Mua hang dong y - muc rieng o cot trang thai.
const THIEU_LK_CHO_HUY = "__CHO_HUY__";
const THIEU_LK_CHO_HUY_SQL = `EXISTS (SELECT 1 FROM yeu_cau_huy_don ych WHERE ych.dat_don_hang_id = ddh.id AND ych.trang_thai = 'Cho dong y' AND ych.bo_phan IN ('kho', 'mua_hang'))
  AND ${latestThieuLkStatusExpr("tlk.id")} NOT IN ('Da huy bo', 'Da ket thuc')`;
// Nguoi xu ly ticket "Cho mua hang" (2026-10-19): Mua hang + Admin.
function laMuaHangXuLy(c: Context<{ Bindings: Env }>): boolean {
  const u = c.get("user");
  return !!u.la_mua_hang || u.vai_tro === "Admin";
}

function thieuLkTrangThaiViec(c: Context<{ Bindings: Env }>): string[] {
  return [
    ...(canKho(c) ? ["Cho kho xu ly", "Kho da tiep nhan"] : []),
    ...(canTacNghiep(c) ? [...THIEU_LK_CHO_TN] : []),
    // Mua hang (2026-10-19): ticket Kho chuyen sang cho dat hang.
    ...(laMuaHangXuLy(c) ? ["Cho mua hang"] : []),
  ];
}

// GET /api/dat-mua-lk/ly-do-cham?he_thong= - danh sach ly do cham dang bat, loc theo he thong su
// dung (vd "Mua hàng") - dung cho dropdown TN chon luc tu choi 1 dong. Mo cho moi user da dang nhap
// (chi TN moi thuc su dung duoc luc tu choi, nhung liet ke thi khong nhay cam).
datMuaLinhKien.get("/ly-do-cham", async (c) => {
  const heThong = c.req.query("he_thong");
  let whereSql = "bat_tat = 1";
  const binds: unknown[] = [];
  if (heThong) {
    whereSql += " AND he_thong_su_dung LIKE ?";
    binds.push(`%${heThong}%`);
  }
  const { results } = await c.env.DB.prepare(`SELECT * FROM settings_ly_do_cham WHERE ${whereSql} ORDER BY stt`).bind(...binds).all();
  return c.json({ rows: results });
});

// GET /api/dat-mua-lk/thieu-lk?dat_don_hang_id=&trang_thai= - danh sach, Kho/TN xem toan bo, nguoi
// khac chi xem thieu-lk cua dong don hang minh tao.
// Dieu kien WHERE cua GET /thieu-lk (tach ham 2026-09-28) - dung CHUNG cho /thieu-lk-status-counts de so dem o cot
// trang thai ben trai man Thieu LK luon KHOP dung danh sach dang xem (cung pham vi + khu vuc + nguoi nhan + tim kiem).
// boQuaTrangThai = true: bo dieu kien trang thai (dem theo tung trang thai).
// Trang thai MA LINH KIEN cua don goc ticket thieu hang (chot 2026-10-16): "cho" = ma dang "Cho xet duyet" (Kho vao xac nhan ma), "da" =
// con lai (da xac nhan / tu dong duyet / doi ma...). LK khong con trong danh muc -> coi nhu da xac nhan.
const LK_TRANG_THAI_MA_SQL = "COALESCE((SELECT lkx.trang_thai_ma FROM linh_kien lkx WHERE lkx.ma_linh_kien = ddh.ma_lk), 'Da xac nhan')";
// Nhom LK Karofi / B2B cua don goc (2026-10-16, migration 0088) - hien cot "Nhóm LK" o man Thieu hang.
const LK_NHOM_SQL = "(SELECT lkn.nhom_lk FROM linh_kien lkn WHERE lkn.ma_linh_kien = ddh.ma_lk)";

async function thieuLkListWhere(c: Context<{ Bindings: Env }>, boQuaTrangThai = false, boQuaMaLk = false, boQuaDuHang = false): Promise<{ whereSql: string; binds: unknown[] }> {
  const user = c.get("user");
  const donHangId = c.req.query("dat_don_hang_id");
  const trangThai = boQuaTrangThai ? undefined : c.req.query("trang_thai");
  const khuVuc = c.req.query("khu_vuc")?.trim();
  const nguoiNhanHang = c.req.query("nguoi_nhan_hang")?.trim();
  const q = c.req.query("q")?.trim().normalize("NFC");
  let whereSql = "1=1";
  const binds: unknown[] = [];
  const truocPhamVi = whereSql.length;
  // FIX (ma tran kiem soat he thong, Van de #4 sheet "5. Van de phat hien", xac nhan 2026-08-24): truoc
  // day MOI vai tro khong phai Kho/TN deu bi loc theo tlk.nguoi_tao (nguoi TAO TICKET, thuong la CHINH
  // Kho bao thieu chu khong phai KTV/GS) - Giam sat gan nhu khong bao gio la nguoi tao ticket nen luon
  // thay danh sach RONG, du KTV minh phu trach co ticket that. Them nhanh rieng cho GS: loc theo
  // ddh.email_gs cua DON HANG GOC sinh ra ticket (dung ten cot giong scopeDatMuaNguoiTao() trong
  // scopeDatMua.ts) - ddh da duoc LEFT JOIN san o ca 2 query nay nen khong can them JOIN. Cac vai tro
  // khac (KTV/Ve tinh/Tram/Ke toan/TP DVBH...) GIU NGUYEN hanh vi cu (chi thay ticket tu tao).
  if (canKho(c) || canTacNghiep(c)) {
    // khong gioi han - giu nguyen
    // FIX (phan hoi nguoi dung: "đồng bộ danh sách theo badge" cho Khu vuc phu trach GS) - xem giai
    // thich day du o GET /dat-mua-lk/don-hang (cung 1 fix, cung ngay) - truoc day chi anh huong
    // /thieu-lk-status-counts, KHONG anh huong chinh danh sach nay.
    const gsSet = await phuTrachGsSet(c.env.DB, user.email);
    if (gsSet) {
      whereSql += ` AND ddh.email_gs IN (${[...gsSet].map(() => "?").join(",")})`;
      binds.push(...gsSet);
    }
  } else if (user.vai_tro === "Giam sat") {
    whereSql += ` AND (ddh.email_gs = ? OR ddh.nguoi_tao = ? OR ddh.nguoi_nhan_hang = ? OR ${gsKhuVucXemThemSql("ddh.khu_vuc_ma")})`; // + don chinh GS tao (2026-09-28) / GS nhan hang (2026-09-30) / khu vuc xem them (2026-10-02)
    binds.push(user.email, user.email, user.email, user.email);
  } else if (user.la_mua_hang) {
    // "Mua hang" (2026-09-30) - xem toan bo, chi doc.
  } else if (user.la_view) {
    // "View" (them 2026-08-26) - loc theo Khu vuc gan cho tai khoan nay, giong scopeDatMuaNguoiTao -
    // xem comment khuVucViewEmailInSql() trong scopeDatMua.ts.
    const v = viewDonScopeSql(user.email);
    whereSql += v.whereSql;
    binds.push(...v.binds);
  } else {
    whereSql += " AND tlk.nguoi_tao = ?";
    binds.push(user.email);
  }
  // Kho chi xu ly 1 nhom LK (Karofi / B2B - 2026-10-16, migration 0088, lib/nhomLk.ts): ap cho danh sach + so dem + tai Excel.
  const nhomKho = khoNhomLkLoc(user);
  if (nhomKho) whereSql += locNhomLkSql("ddh", nhomKho);
  // Mua hang thay TAT CA ticket "Cho mua hang" (2026-10-29, "vai trò mua hàng nhìn thây tất cả các ticket 'Chờ mua hàng'"): tai khoan
  // Mua hang kiem Kho/TN di nhanh pham vi cua Kho (GS phu trach / nhom LK) - ticket cho Mua hang bo qua pham vi do. Cac dieu kien tren
  // chi them SQL, binds giu nguyen thu tu.
  if (laMuaHangXuLy(c) && whereSql.length > truocPhamVi) {
    whereSql = `${whereSql.slice(0, truocPhamVi)} AND ((1=1${whereSql.slice(truocPhamVi)}) OR ${latestThieuLkStatusExpr("tlk.id")} = 'Cho mua hang')`;
  }
  if (donHangId) {
    whereSql += " AND tlk.dat_don_hang_id = ?";
    binds.push(donHangId);
  }
  // Loc theo trang thai ma LK (2026-10-16): ma_lk_tt=cho | da.
  const maLkTt = boQuaMaLk ? undefined : c.req.query("ma_lk_tt");
  if (maLkTt === "cho") whereSql += ` AND ${LK_TRANG_THAI_MA_SQL} = 'Cho xet duyet'`;
  else if (maLkTt === "da") whereSql += ` AND ${LK_TRANG_THAI_MA_SQL} != 'Cho xet duyet'`;
  // Loc "Kho đã có đủ hàng" (2026-10-16): ticket con mo + don goc "Cho hang" du ton kho cong ty (donChoHangDuTonKho).
  if (!boQuaDuHang && c.req.query("du_hang") === "1") {
    const ds = await donChoHangDuTonKho(c.env.DB);
    whereSql += ` AND ddh.id IN (SELECT value FROM json_each(?)) AND ${latestThieuLkStatusExpr("tlk.id")} NOT IN ('Da huy bo', 'Da ket thuc')`;
    binds.push(JSON.stringify([...ds]));
  }
  if (trangThai === THIEU_LK_CHO_HUY) {
    whereSql += ` AND ${THIEU_LK_CHO_HUY_SQL}`;
  } else if (trangThai === THIEU_LK_VIEC) {
    const ds = thieuLkTrangThaiViec(c);
    whereSql += ds.length ? ` AND ${latestThieuLkStatusExpr("tlk.id")} IN (${ds.map(() => "?").join(",")})` : " AND 1=0";
    binds.push(...ds);
  } else if (trangThai?.includes(",")) {
    // Nhieu trang thai (bam tieu de nhom o cot trang thai ben trai man Thieu LK, 2026-09-28).
    const ds = trangThai.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
    whereSql += ` AND ${latestThieuLkStatusExpr("tlk.id")} IN (${ds.map(() => "?").join(",")})`;
    binds.push(...ds);
  } else if (trangThai) {
    whereSql += ` AND ${latestThieuLkStatusExpr("tlk.id")} = ?`;
    binds.push(trangThai);
  }
  if (khuVuc) {
    const khuVucList = khuVuc.split(",").map((s) => s.trim()).filter(Boolean);
    if (khuVucList.length > 0) {
      const { sql, binds: khuVucBinds } = khuVucSetWhereSql(new Set(khuVucList), ["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]);
      whereSql += sql;
      binds.push(...khuVucBinds);
    }
  }
  if (nguoiNhanHang) {
    whereSql += " AND ddh.nguoi_nhan_hang = ?";
    binds.push(nguoiNhanHang);
  }
  if (q) {
    const theoTen = orEmailIn(["tlk.nguoi_tao", "ddh.nguoi_nhan_hang", "ddh.nguoi_tao"], await emailsTheoTen(c.env.DB, q));
    const theoMa = orMaYcsc("ddh", q); // + ma don goc, ma yeu cau su co chinh/bo sung (2026-09-29)
    const theoPxk = orPxkCuaDon("ddh", q); // + ma phieu / ma don hang / ma PXK MISA cua don goc (2026-10-03)
    const tenLk = tenLkKhopSql("ddh.ten_lk_snapshot", q); // ten LK khong phan biet hoa/thuong (v1.377)
    whereSql += ` AND (ddh.ma_lk LIKE ? OR ${tenLk.sql} OR tlk.id LIKE ? OR tlk.nguoi_tao LIKE ? OR ddh.id LIKE ?${theoMa.sql}${theoPxk.sql}${theoTen.sql})`;
    binds.push(`%${q}%`, ...tenLk.binds, `%${q}%`, `%${q}%`, `%${q}%`, ...theoMa.binds, ...theoPxk.binds, ...theoTen.binds);
  }
  return { whereSql, binds };
}

datMuaLinhKien.get("/thieu-lk", async (c) => {
  // "khu_vuc" (them 2026-08-31, dong bo voi GET /don-hang - xem CLAUDE.md muc kiem tra toan he
  // thong) - ddh da duoc LEFT JOIN san o ca 2 query duoi nen dung lai duoc dung dieu kien.
  // "nguoi_nhan_hang" (them 2026-09-05, phan hoi "'Chờ LK' chức năng filter vẫn thiếu bộ lọc theo khu
  // vực, theo người nhận hàng") - loc theo dung KTV nhan hang cua DON HANG GOC (ddh.nguoi_nhan_hang),
  // khop dung cot da dung san cho khu_vuc o tren, dong bo voi GET /don-hang/GET /phieu-xuat-kho.
  // Them 2026-08-21 (dong bo UI voi GET /don-hang) - tim theo ma LK/ten LK/ma TLK/nguoi bao.
  // .normalize("NFC") - xem giai thich day du o settingsKtv.ts GET / (cung fix, cung ngay).
  // GD4 (phan hoi Codex #17): truoc day tra ve TOAN BO dong khop bo loc, frontend tu slice o client.
  // Them phan trang server-side, cung pattern voi GET /don-hang.
  // KHONG truyen page -> tra HET (nut "Tải danh sách chi tiết", them 2026-09-13, mirror settingsKtv.ts).
  const pageParam = c.req.query("page");
  const page = Math.max(1, (Math.trunc(Number(pageParam)) || 1));
  const pageSize = Math.min(1000, Math.max(1, (Math.trunc(Number(c.req.query("pageSize"))) || 20)));
  const offset = (page - 1) * pageSize;

  const { whereSql, binds } = await thieuLkListWhere(c);

  // SUA 2026-08-21: count query gio can JOIN ddh giong query chinh ben duoi vi whereSql (nhanh "q")
  // co the tham chieu ddh.ma_lk/ddh.ten_lk_snapshot - truoc do count khong JOIN vi whereSql chua bao
  // gio dung toi cot nao ngoai tlk.
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM thieu_lk tlk LEFT JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id WHERE ${whereSql}`,
  )
    .bind(...binds)
    .first<{ total: number }>();
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #11): them ma_lk/ten_lk_snapshot qua 1 JOIN DUY
  // NHAT toi dat_don_hang (khong N+1 query) - day la thong tin Kho can doc DAU TIEN de xu ly ticket,
  // truoc do bang nay hoan toan khong co, phai tu tra dat_don_hang_id o tab khac.
  // Them ddh.nguoi_nhan_hang/ddh.loai_don (2026-08-21, phan hoi "format Thiếu LK khác Mua hàng/Công
  // nợ") - dung nhom danh sach theo KTV (nguoi_nhan_hang || nguoi_tao cua DON HANG, KHONG PHAI
  // tlk.nguoi_tao la nguoi BAO thieu, thuong la Kho chu khong phai KTV) va hien Badge "Loại" giong
  // DonHangGroupedList, dong bo dung kien truc voi Mua hang/Cong no.
  // Do thoi gian query chinh (giam sat AUD-005 - dung correlated subquery latestThieuLkStatusExpr,
  // xem docs/audit/RESPONSE_PLAN.md de biet nguong/phuong an xu ly khi log nay cho thay cham that).
  const queryStartedAt = Date.now();
  const { results } = await c.env.DB.prepare(
    `SELECT tlk.*, sldc.ten_ly_do, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.uu_tien, ddh.khieu_nai as ddh_khieu_nai, (SELECT y.bo_phan FROM yeu_cau_huy_don y WHERE y.dat_don_hang_id = ddh.id AND y.trang_thai = 'Cho dong y') as ddh_yeu_cau_huy, ddh.nguoi_nhan_hang, ddh.loai_don, ddh.loai_de_xuat, ddh.nguoi_tao as ddh_nguoi_tao, ddh.loai_chiet_khau_id, ddh.loai_chiet_khau_thu_cong, ddh.so_luong_de_xuat, ${latestThieuLkStatusExpr("tlk.id")} as trang_thai,
       ${LK_TRANG_THAI_MA_SQL} as lk_trang_thai_ma, ${LK_NHOM_SQL} as lk_nhom_lk
     FROM thieu_lk tlk
     LEFT JOIN settings_ly_do_cham sldc ON sldc.id = tlk.ly_do_cham_id
     LEFT JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id
     WHERE ${whereSql} ORDER BY tlk.ngay_tao DESC
     ${pageParam ? "LIMIT ? OFFSET ?" : ""}`,
  )
    .bind(...binds, ...(pageParam ? [pageSize, offset] : []))
    .all();
  console.log("[thieu-lk-query]", { durationMs: Date.now() - queryStartedAt, rowCount: results.length });
  // Cot "Kho công ty" (2026-10-16): don goc "Cho hang" da du ton kho cong ty -> nhac Kho xac nhan (ticket con mo).
  const duTon = await donChoHangDuTonKho(c.env.DB);
  // "Kho có x/y" (v1.434): don uu tien cao nhat cua (ma, khu vuc) chi du MOT PHAN -> dung tu duyet, cho Kho / Ke toan tach don.
  const motPhan = await donHangVeMotPhan(c.env.DB);
  const rows = (results as Array<Record<string, unknown>>).map((r) => {
    const mo = !(THIEU_LK_TRANG_THAI_DONG as readonly string[]).includes(String(r.trang_thai));
    return {
      ...r,
      kho_du_hang: duTon.has(String(r.dat_don_hang_id)) && mo ? 1 : 0,
      kho_mot_phan: mo ? (motPhan.get(String(r.dat_don_hang_id))?.co ?? null) : null,
    };
  });
  return c.json({ rows, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/dat-mua-lk/thieu-lk-status-counts - dem tinh theo tung trang_thai (dropdown loc, xem
// comment tai GET /don-hang-status-counts) - scope GIONG HET GET /thieu-lk (khong cong them
// dat_don_hang_id/khu_vuc/q dang loc phu).
datMuaLinhKien.get("/thieu-lk-status-counts", async (c) => {
  // SUA 2026-09-28: nhan CUNG bo loc voi danh sach (khu_vuc/nguoi_nhan_hang/q) - so o cot trang thai = so dong that.
  // Cung dieu kien voi danh sach (tru trang thai) - xem thieuLkListWhere().
  const { whereSql, binds } = await thieuLkListWhere(c, true);
  // 1 truy van GROUP BY duy nhat (2026-09-28, tiet kiem D1 - truoc day them 1 COUNT(*) rieng quet lai cung tap
  // dong); tong "" = cong cac nhom. Cot trang thai ben trai man Thieu LK doc so tu CHINH endpoint nay.
  const { results } = await c.env.DB.prepare(
    `SELECT ${latestThieuLkStatusExpr("tlk.id")} as trang_thai, COUNT(*) as n
     FROM thieu_lk tlk LEFT JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id WHERE ${whereSql}
     GROUP BY ${latestThieuLkStatusExpr("tlk.id")}`,
  )
    .bind(...binds)
    .all<{ trang_thai: string; n: number }>();
  const counts: Record<string, number> = { "": results.reduce((s, r) => s + r.n, 0) };
  for (const r of results) if (r.trang_thai) counts[r.trang_thai] = r.n;
  const viec = thieuLkTrangThaiViec(c);
  counts[THIEU_LK_VIEC] = viec.reduce((s, t) => s + (counts[t] ?? 0), 0);
  const choHuy = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM thieu_lk tlk LEFT JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id WHERE ${whereSql} AND ${THIEU_LK_CHO_HUY_SQL}`,
  ).bind(...binds).first<{ n: number }>();
  counts[THIEU_LK_CHO_HUY] = choHuy?.n ?? 0;
  // So ticket theo trang thai ma LK (chip loc "Mã chờ xác nhận"/"Mã đã xác nhận", 2026-10-16) - CUNG bo loc danh sach (ke ca trang
  // thai ticket dang chon), tru chinh bo loc ma LK.
  const kq = await thieuLkListWhere(c, false, true);
  const maLk = await c.env.DB.prepare(
    `SELECT SUM(CASE WHEN ${LK_TRANG_THAI_MA_SQL} = 'Cho xet duyet' THEN 1 ELSE 0 END) as cho, COUNT(*) as tong
     FROM thieu_lk tlk LEFT JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id WHERE ${kq.whereSql}`,
  )
    .bind(...kq.binds)
    .first<{ cho: number | null; tong: number }>();
  const cho = maLk?.cho ?? 0;
  // So ticket "Kho đã có đủ hàng" (chip loc, 2026-10-16) - cung bo loc danh sach, tru chinh bo loc nay.
  const kqDu = await thieuLkListWhere(c, false, false, true);
  const dsDu = await donChoHangDuTonKho(c.env.DB);
  const duRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM thieu_lk tlk LEFT JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id
     WHERE ${kqDu.whereSql} AND ddh.id IN (SELECT value FROM json_each(?)) AND ${latestThieuLkStatusExpr("tlk.id")} NOT IN ('Da huy bo', 'Da ket thuc')`,
  )
    .bind(...kqDu.binds, JSON.stringify([...dsDu]))
    .first<{ n: number }>();
  return c.json({ counts, ma_lk: { cho, da: (maLk?.tong ?? 0) - cho }, du_hang: duRow?.n ?? 0 });
});

// GET /api/dat-mua-lk/thieu-lk/:id - chi tiet 1 ticket + lich su xu ly (them 2026-08-21, phan hoi
// "hợp nhất phong cách giao diện" - ThieuLkTab truoc day khong co man chi tiet rieng, gio them Drawer
// giong PXK/Mua hang nen can endpoint tra ca logs). Ap dung CUNG scope voi GET /thieu-lk (Kho/TN xem
// toan bo, con lai chi xem duoc ticket cua chinh minh) - tra 404 khi ngoai pham vi thay vi 403 de
// khong lo thong tin ticket ton tai hay khong.
// GET /thieu-lk/:id/danh-gia (2026-10-19, "hiện thông tin nhắc nhở với đầy đủ các thông tin để kho đánh giá" - tiếp nhận chờ hàng về hay
// chuyển Mua hàng đặt hàng): tồn kho công ty còn đặt được theo khu vực của đơn, các ticket CÙNG MÃ đang chờ hàng (ngày dự kiến / mã EO),
// lần hàng về gần nhất, số đơn đang chờ mã này + gợi ý. EO mua hàng (app muahang) CHƯA kết nối API -> eo.ket_noi = false.
datMuaLinhKien.get("/thieu-lk/:id/danh-gia", async (c) => {
  if (!canKho(c) && !canTacNghiep(c) && !laMuaHangXuLy(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const db = c.env.DB;
  const tk = await db
    .prepare(
      `SELECT ddh.ma_lk, ddh.ten_lk_snapshot, ddh.id AS don_id, COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) AS sl,
              COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) AS khu_vuc
       FROM thieu_lk tlk JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id WHERE tlk.id = ?`,
    )
    .bind(id)
    .first<{ ma_lk: string; ten_lk_snapshot: string; don_id: string; sl: number; khu_vuc: string | null }>();
  if (!tk) return c.json({ error: "NOT_FOUND" }, 404);
  const ttExpr = latestThieuLkStatusExpr("t2.id");
  const [tonConDat, cungMa, veGanNhat, donCho] = await Promise.all([
    computeTonKhoChot(db, tk.khu_vuc, tk.ma_lk),
    db.prepare(
      `SELECT * FROM (
         SELECT t2.id, ${ttExpr} AS trang_thai, t2.ngay_du_kien_co_hang, t2.ma_eo_mua, t2.ngay_tao, d2.id AS don_id,
                COALESCE(d2.so_luong_thuc_xuat, d2.so_luong_de_xuat) AS sl, COALESCE(d2.khu_vuc_chon, d2.khu_vuc_ma) AS khu_vuc
         FROM thieu_lk t2 JOIN dat_don_hang d2 ON d2.id = t2.dat_don_hang_id
         WHERE d2.ma_lk = ? AND t2.id <> ?
       ) x WHERE COALESCE(x.trang_thai, '') NOT IN ('Da huy bo', 'Da ket thuc', 'Kho xac nhan hang da ve', 'Kho tu choi sai TT', 'Mua hang tu choi')
       ORDER BY COALESCE(x.ngay_du_kien_co_hang, '9999') , x.ngay_tao LIMIT 30`,
    ).bind(tk.ma_lk, id).all<{ id: string; trang_thai: string; ngay_du_kien_co_hang: string | null; ma_eo_mua: string | null; ngay_tao: string; don_id: string; sl: number; khu_vuc: string | null }>(),
    db.prepare(
      `SELECT MAX(t2.ngay_hang_ve_thuc_te) AS ngay FROM thieu_lk t2 JOIN dat_don_hang d2 ON d2.id = t2.dat_don_hang_id WHERE d2.ma_lk = ?`,
    ).bind(tk.ma_lk).first<{ ngay: string | null }>(),
    db.prepare(
      `SELECT COUNT(*) AS so_don, COALESCE(SUM(COALESCE(so_luong_thuc_xuat, so_luong_de_xuat)), 0) AS tong_sl
       FROM dat_don_hang WHERE ma_lk = ? AND trang_thai_hien_tai = 'Cho hang'`,
    ).bind(tk.ma_lk).first<{ so_don: number; tong_sl: number }>(),
  ]);
  const homNay = nowVN().slice(0, 10);
  const dangVe = cungMa.results.filter(
    (r) => ["Kho da tiep nhan", "Kho da cap nhat", "Mua hang da dat"].includes(r.trang_thai) && (r.ngay_du_kien_co_hang ?? "") >= homNay,
  );
  const choMua = cungMa.results.filter((r) => r.trang_thai === "Cho mua hang");
  const goiY = tonConDat >= tk.sl ? "co_ton" : dangVe.length > 0 ? "dang_ve" : choMua.length > 0 ? "dang_cho_mua" : "can_dat";
  return c.json({
    ma_lk: tk.ma_lk, ten_lk: tk.ten_lk_snapshot, sl: tk.sl, khu_vuc: tk.khu_vuc,
    ton_con_dat: tonConDat,
    ticket_cung_ma: cungMa.results,
    ngay_hang_ve_gan_nhat: veGanNhat?.ngay ?? null,
    don_cho_cung_ma: { so_don: donCho?.so_don ?? 0, tong_sl: donCho?.tong_sl ?? 0 },
    ngay_du_kien_gan_nhat: dangVe.map((r) => r.ngay_du_kien_co_hang!).sort()[0] ?? null,
    eo: { ket_noi: false },
    goi_y: goiY,
  });
});

datMuaLinhKien.get("/thieu-lk/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  let whereSql = "tlk.id = ?";
  const binds: unknown[] = [id];
  // FIX (dong bo voi GET /thieu-lk o tren, cung Van de #4) - them nhanh GS theo ddh.email_gs.
  if (canKho(c) || canTacNghiep(c)) {
    // khong gioi han - chi loc nhom LK Kho duoc gan (Karofi / B2B, 2026-10-16) giong danh sach.
    const nhomKho = khoNhomLkLoc(user);
    // Mua hang kiem Kho van mo duoc ticket "Cho mua hang" nhom khac (2026-10-29, khop thieuLkListWhere).
    if (nhomKho) whereSql += laMuaHangXuLy(c) ? ` AND (1=1${locNhomLkSql("ddh", nhomKho)} OR ${latestThieuLkStatusExpr("tlk.id")} = 'Cho mua hang')` : locNhomLkSql("ddh", nhomKho);
  } else if (user.vai_tro === "Giam sat") {
    whereSql += ` AND (ddh.email_gs = ? OR ddh.nguoi_tao = ? OR ddh.nguoi_nhan_hang = ? OR ${gsKhuVucXemThemSql("ddh.khu_vuc_ma")})`; // + don chinh GS tao (2026-09-28) / GS nhan hang (2026-09-30) / khu vuc xem them (2026-10-02)
    binds.push(user.email, user.email, user.email, user.email);
  } else if (user.la_mua_hang) {
    // "Mua hang" (2026-09-30) - xem toan bo, chi doc.
  } else if (user.la_view) {
    // "View" (them 2026-08-26) - loc theo Khu vuc gan cho tai khoan nay, giong scopeDatMuaNguoiTao -
    // xem comment khuVucViewEmailInSql() trong scopeDatMua.ts.
    const v = viewDonScopeSql(user.email);
    whereSql += v.whereSql;
    binds.push(...v.binds);
  } else {
    whereSql += " AND tlk.nguoi_tao = ?";
    binds.push(user.email);
  }
  const tlk = await c.env.DB.prepare(
    `SELECT tlk.*, sldc.ten_ly_do, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.uu_tien, ddh.khieu_nai as ddh_khieu_nai, (SELECT y.bo_phan FROM yeu_cau_huy_don y WHERE y.dat_don_hang_id = ddh.id AND y.trang_thai = 'Cho dong y') as ddh_yeu_cau_huy, ddh.nguoi_nhan_hang, ddh.loai_don, ddh.loai_de_xuat, ddh.nguoi_tao as ddh_nguoi_tao, ddh.so_luong_de_xuat, ${latestThieuLkStatusExpr("tlk.id")} as trang_thai, ${LK_TRANG_THAI_MA_SQL} as lk_trang_thai_ma, ${LK_NHOM_SQL} as lk_nhom_lk,
            -- Nut "Đẩy lại đơn gốc" tren ticket (2026-10-16): trang thai + han day lai cua DON GOC (cung dayLaiHanSql voi danh sach don).
            ddh.trang_thai_hien_tai as ddh_trang_thai, ${dayLaiHanSql("ddh")} as ddh_day_lai_han,
            -- "Đẩy lại ticket" (2026-10-16, lib/dayLaiThieuLk.ts): han + trang thai ticket se phuc hoi.
            ${hanDayLaiTicketSql("tlk")} as day_lai_ticket_han, ${trangThaiTruocTicketSql("tlk")} as day_lai_ticket_ve
     FROM thieu_lk tlk
     LEFT JOIN settings_ly_do_cham sldc ON sldc.id = tlk.ly_do_cham_id
     LEFT JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id
     WHERE ${whereSql}`,
  )
    .bind(...binds)
    .first();
  if (!tlk) return c.json({ error: "NOT_FOUND" }, 404);
  const { results: logs } = await c.env.DB.prepare("SELECT * FROM thieu_lk_log WHERE thieu_lk_id = ? ORDER BY id DESC").bind(id).all();
  const duTonCt = await donChoHangDuTonKho(c.env.DB);
  const tlkRow = tlk as Record<string, unknown>;
  const moTk = !(THIEU_LK_TRANG_THAI_DONG as readonly string[]).includes(String(tlkRow.trang_thai));
  const khoDuHang = duTonCt.has(String(tlkRow.dat_don_hang_id)) && moTk ? 1 : 0;
  const khoMotPhan = moTk ? ((await donHangVeMotPhan(c.env.DB)).get(String(tlkRow.dat_don_hang_id))?.co ?? null) : null;
  return c.json({ thieuLk: { ...tlkRow, kho_du_hang: khoDuHang, kho_mot_phan: khoMotPhan }, logs });
});

// POST /api/dat-mua-lk/thieu-lk/:id/day-lai - { ghi_chu? } (2026-10-16, "đẩy ticket lại trạng thái trước khi bị từ chối => đơn gốc cũng
// đẩy ngược lại theo ticket"): ticket ve trang thai mo truoc khi bi tu choi / huy, don goc 'Da huy' -> 'Cho hang' + lay lai tien da hoan
// ve quy. TN (gom Ke toan lam thay) / Kho / Admin. Toan bo dieu kien + ghi o lib/dayLaiThieuLk.ts.
datMuaLinhKien.post("/thieu-lk/:id/day-lai", async (c) => {
  if (!canTacNghiep(c) && !canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ ghi_chu?: string }>().catch(() => ({}) as { ghi_chu?: string });
  const kq = await dayLaiTicketThieuLk(c.env, c.env.DB, c.req.param("id"), c.get("user").email, body.ghi_chu);
  if ("error" in kq) return c.json({ error: kq.error, han: kq.han, pxk: kq.pxk }, kq.status);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, don_hang_id: kq.donHangId, trang_thai_ticket: kq.trangThaiTicket, tien_lay_lai: kq.tienLayLai, tien_hoan: kq.tienHoan });
});

// Logic dung chung cho 1 ticket thieu_lk - tach ra de route bulk-log tai su dung dung 1 cho (them
// 2026-08-15, tieu chi UX #4), khong copy lai role-check/validate. Tra { error, status } khi khong
// hop le, hoac { ok: true } khi thanh cong.
async function applyThieuLkLog(
  c: Context<{ Bindings: Env }>,
  id: string,
  trangThai: string,
  ghiChu: string | undefined,
  ngayDuKienCoHang: string | undefined,
  maEo?: string,
  maLkTuongDuong?: string,
): Promise<{ error: string; status: 404 | 409 | 403 | 400 } | { ok: true }> {
  // BUG THAT (cung dot ma-misa PXK) - phai qualify "thieu_lk.id", xem giai thich o openThieuLkForDonHang.
  const tlk = await c.env.DB.prepare(`SELECT nguoi_tao, dat_don_hang_id, ${latestThieuLkStatusExpr("thieu_lk.id")} as trang_thai FROM thieu_lk WHERE id = ?`)
    .bind(id)
    .first<{ nguoi_tao: string; dat_don_hang_id: string; trang_thai: string | null }>();
  if (!tlk) return { error: "NOT_FOUND", status: 404 };
  if (tlk.trang_thai && (THIEU_LK_TRANG_THAI_DONG as readonly string[]).includes(tlk.trang_thai)) return { error: "DA_DONG", status: 409 };

  const user = c.get("user");
  // "Da co hang" (chot 2026-10-16): Kho bam 1 lan o buoc "Cho kho xu ly" = TIEP NHAN + XAC NHAN HANG DA VE luon, ly do "Kho đã có
  // hàng" -> ghi 2 log lien tiep, phan con lai di dung luong "Kho xac nhan hang da ve" (don goc tu duyet + vao phieu, ticket dong).
  let daCoHang = false;
  // TN (gom Ke toan lam thay) cung bam duoc khi Kho CHUA tiep nhan (2026-10-19, "hàng đã có trong kho - hàng về trong ngày").
  let tnThayKho = false;
  if (trangThai === "Da co hang") {
    if (!canKho(c) && !canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    if (tlk.trang_thai !== "Cho kho xu ly") return { error: "INVALID_TRANG_THAI", status: 400 };
    daCoHang = true;
    tnThayKho = !canKho(c);
    trangThai = "Kho xac nhan hang da ve";
    const macDinh = tnThayKho ? "TN xác nhận thay Kho: đã có hàng" : "Kho đã có hàng";
    ghiChu = ghiChu?.trim() ? (tnThayKho ? `${macDinh} — ${ghiChu.trim()}` : ghiChu.trim()) : macDinh;
  }
  // Kho tu choi (sai TT) LUON bat buoc ly do (chot 2026-10-20, "bắt buộc lý do từ chối khi kho từ chối đơn thiếu hàng") - ke ca xu
  // ly hang loat va ticket ma don goc da roi "Cho hang"; kiem tra TRUOC khi them tien to "TN thao tác thay Kho" vao ghi chu.
  if (trangThai === "Kho tu choi sai TT" && !ghiChu?.trim()) return { error: "MISSING_LY_DO_TU_CHOI", status: 400 };
  const isCancel = trangThai === "Da huy bo";
  // "Da ket thuc" la cua TN (khop cot "Admin xu ly" trong du lieu Excel goc), con lai la Kho.
  if (isCancel) {
    // Kho / Mua hang da xac nhan xu ly (2026-10-27): nguoi tao (KTV) KHONG huy duoc nua - chi Kho / Mua hang / Admin (bat buoc ly do).
    const nhanVienXuLy = canKho(c) || laMuaHangXuLy(c);
    const dangXuLy = (THIEU_LK_KHO_DANG_XU_LY as readonly string[]).includes(tlk.trang_thai ?? "");
    if (dangXuLy && !nhanVienXuLy) return { error: "THIEU_LK_KHO_DANG_XU_LY", status: 409 };
    if (tlk.nguoi_tao !== user.email && !nhanVienXuLy) return { error: "FORBIDDEN_ROLE", status: 403 };
    if (tlk.nguoi_tao !== user.email && !ghiChu?.trim()) return { error: "THIEU_LY_DO_HUY", status: 400 };
  } else if (trangThai === "Da ket thuc") {
    if (!canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
  } else if (trangThai === "Mua hang da dat" || trangThai === "Mua hang tu choi") {
    if (!laMuaHangXuLy(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
  } else if (!canKho(c) && !canTacNghiep(c)) {
    // Buoc cua Kho (Tiep nhan / Cap nhat / Hang da ve / Tu choi sai TT / Chuyen Mua hang): TN (gom Ke toan lam thay) thao tac HO
    // Kho duoc (chot 2026-10-20, "Các nút thao tác ở mục chờ hàng của kho cũng hiện cho Tác nghiệp hỗ trợ xác nhận hộ").
    return { error: "FORBIDDEN_ROLE", status: 403 };
  } else if (!canKho(c) && !daCoHang) {
    // Ghi ro trong lich su la TN lam thay (nguoi ghi log van la TN).
    tnThayKho = true;
    ghiChu = ghiChu?.trim() ? `TN thao tác thay Kho — ${ghiChu.trim()}` : "TN thao tác thay Kho";
  }

  const validNext = [
    "Kho da tiep nhan", "Kho da cap nhat", "Kho xac nhan hang da ve", "Kho tu choi sai TT", "Da huy bo", "Da ket thuc",
    "Cho mua hang", "Mua hang da dat", "Mua hang tu choi",
  ];
  if (!validNext.includes(trangThai)) return { error: "INVALID_TRANG_THAI", status: 400 };
  // CHUYEN MUA HANG (2026-10-19, migration 0093): Kho chuyen ticket chua co ke hoach hang ve sang Mua hang dat hang.
  if (trangThai === "Cho mua hang" && !["Cho kho xu ly", "Kho da tiep nhan", "Kho da cap nhat"].includes(tlk.trang_thai ?? "")) {
    return { error: "INVALID_TRANG_THAI", status: 400 };
  }
  // Mua hang: chi xu ly ticket dang "Cho mua hang". Da dat = bat buoc ma EO + ngay du kien; tu choi = bat buoc ly do.
  if ((trangThai === "Mua hang da dat" || trangThai === "Mua hang tu choi") && tlk.trang_thai !== "Cho mua hang") {
    return { error: "INVALID_TRANG_THAI", status: 400 };
  }
  if (trangThai === "Mua hang da dat") {
    if (!maEo?.trim()) return { error: "THIEU_MA_EO", status: 400 };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ngayDuKienCoHang?.trim() ?? "")) return { error: "THIEU_NGAY_DU_KIEN", status: 400 };
  }
  if (trangThai === "Mua hang tu choi" && !ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 400 };
  // "Kho da cap nhat" (2026-09-28): Kho cap nhat lai ngay du kien/ghi chu SAU khi da tiep nhan (lap lai duoc) - phai
  // co it nhat 1 thong tin moi, khong thi chi la 1 dong log rong.
  if (trangThai === "Kho da cap nhat") {
    if (!["Kho da tiep nhan", "Kho da cap nhat", "Mua hang da dat"].includes(tlk.trang_thai ?? "")) return { error: "INVALID_TRANG_THAI", status: 400 };
    if (!ngayDuKienCoHang?.trim() && !ghiChu?.trim()) return { error: "MISSING_THONG_TIN_CAP_NHAT", status: 400 };
  }
  // "Kho da tiep nhan" = buoc Kho giai trinh ly do thieu hang that su (cot "Giai thich ly do thieu
  // hang" trong Excel goc) - bat buoc ghi_chu, khong duoc de trong.
  if (trangThai === "Kho da tiep nhan" && !ghiChu?.trim()) return { error: "MISSING_GIAI_TRINH", status: 400 };

  // "Da ket thuc" (nhan "TN đã duyệt", 2026-09-29): chi sau khi Kho xong phan minh. Don goc dang "Cho TN duyet" ->
  // DUYET LUON don goc qua chinh applyDonHangLog (cung kiem tra/tac dong phu nhu TN duyet tren don); ticket duoc
  // dong trong do (dongThieuLkMoCuaDon) - khong ghi them dong log o day.
  if (trangThai === "Da ket thuc") {
    if (!(THIEU_LK_CHO_TN as readonly string[]).includes(tlk.trang_thai ?? "")) return { error: "INVALID_TRANG_THAI", status: 400 };
    const trangThaiDon = await c.env.DB.prepare(`SELECT ${latestDonHangStatusExpr("?")} as tt`).bind(tlk.dat_don_hang_id).first<{ tt: string | null }>();
    if (trangThaiDon?.tt === "Cho TN duyet") {
      const kq = await applyDonHangLog(c, tlk.dat_don_hang_id, "duyet", undefined, `Duyệt từ ticket thiếu LK ${id}${ghiChu?.trim() ? ` - ${ghiChu.trim()}` : ""}`, undefined, undefined, false, {
        ghiChuTicket: `TN duyệt trên ticket${ghiChu?.trim() ? ` - ${ghiChu.trim()}` : ""}`,
      });
      if ("error" in kq) {
        // Don qua han 24h can chon "Ly do cham" -> chi lam duoc tren man don goc.
        if (kq.error === "MISSING_LY_DO_CHAM") return { error: "DUYET_TREN_DON_GOC", status: 400 };
        return kq;
      }
      return { ok: true };
    }
  }
  // Ngay du kien di kem vao ghi chu log (2026-09-29) - lich su ticket va dong tom tat tren don goc doc duoc ngay
  // du kien TUNG LAN Kho bao, khong chi gia tri moi nhat tren thieu_lk.
  if ((trangThai === "Kho da tiep nhan" || trangThai === "Kho da cap nhat" || trangThai === "Mua hang da dat") && ngayDuKienCoHang?.trim()) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ngayDuKienCoHang.trim());
    const nhanNgay = `Dự kiến có hàng ${m ? `${m[3]}/${m[2]}/${m[1]}` : ngayDuKienCoHang.trim()}`;
    ghiChu = ghiChu?.trim() ? `${ghiChu.trim()} · ${nhanNgay}` : nhanNgay;
  }
  if (trangThai === "Mua hang da dat") ghiChu = `EO ${maEo!.trim().slice(0, 60)} · ${ghiChu ?? ""}`.replace(/ · $/, "");

  const now = nowVN();
  const statements = [
    ...(daCoHang
      ? [c.env.DB.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Kho da tiep nhan', ?, ?, ?)").bind(id, user.email, now, tnThayKho ? "TN xác nhận thay Kho: đã có hàng" : "Kho đã có hàng")]
      : []),
    c.env.DB.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      id,
      trangThai,
      user.email,
      now,
      ghiChu?.trim() || null,
    ),
  ];
  const viTriLogChinh = statements.length - 1; // dong log ticket chinh (doi ma LK tuong duong ghi lai ghi chu o day)
  if (ngayDuKienCoHang !== undefined && (trangThai !== "Kho da cap nhat" || ngayDuKienCoHang.trim())) {
    statements.push(c.env.DB.prepare("UPDATE thieu_lk SET ngay_du_kien_co_hang = ? WHERE id = ?").bind(ngayDuKienCoHang?.trim() || null, id));
  }
  if (trangThai === "Mua hang da dat") {
    statements.push(c.env.DB.prepare("UPDATE thieu_lk SET ma_eo_mua = ? WHERE id = ?").bind(maEo!.trim().slice(0, 60), id));
  }
  // Ngay hang ve thuc te = ngay Kho bam "Hàng đã về" (gio VN) - tu dien, khong can nhap.
  if (trangThai === "Kho xac nhan hang da ve") {
    statements.push(c.env.DB.prepare("UPDATE thieu_lk SET ngay_hang_ve_thuc_te = ? WHERE id = ?").bind(now.slice(0, 10), id));
  }

  // TU DONG DUYET 100% (chot 2026-10-14, thay 2026-09-29 "quay ve Cho TN duyet"): don goc dang "Cho hang" ->
  //   Kho xac nhan HANG DA VE           -> don TU DUYET + vao phieu (mang theo tien da tra), ticket dong "Da ket thuc";
  //   Kho TU CHOI (sai TT) / ticket HUY -> don TU HUY (tien da tra ve quy du, bao KTV), ticket dong.
  // Log don ghi tom tat TOAN BO qua trinh Kho xu ly ticket.
  let donGoc: { trang_thai: string | null; nguoi_tao: string; ten_lk_snapshot: string; so_luong_de_xuat: number; ma_lk: string; nguoi_nhan_hang: string | null; gia_chot: number | null } | null = null;
  if ((THIEU_LK_TIEP_TUC_LUONG as readonly string[]).includes(trangThai)) {
    donGoc = await c.env.DB
      .prepare("SELECT trang_thai_hien_tai as trang_thai, nguoi_tao, ten_lk_snapshot, so_luong_de_xuat, ma_lk, nguoi_nhan_hang, gia_chot FROM dat_don_hang WHERE id = ?")
      .bind(tlk.dat_don_hang_id)
      .first<{ trang_thai: string | null; nguoi_tao: string; ten_lk_snapshot: string; so_luong_de_xuat: number; ma_lk: string; nguoi_nhan_hang: string | null; gia_chot: number | null }>();
    if (donGoc?.trang_thai !== "Cho hang") donGoc = null;
  }
  // DOI SANG LK TUONG DUONG roi xac nhan co hang (chot 2026-10-20, "cho phép kho có quyền sửa lại linh kiện chờ hàng sang linh kiện
  // tương đương rồi xác nhận đã có hàng"): chi kem "Đã có hàng" / "Hàng đã về", ma moi phai CUNG nhom thay the (lk_nhom_thay_the_ct)
  // voi ma dang dat. Doi ma LK + ten + gia ban cua don goc trong CUNG batch voi log ticket (CAS theo ma cu), roi don tu duyet + vao
  // phieu nhu thuong (tien phieu tinh lai theo gia ma moi).
  let doiMa: { cu: string; moi: string } | null = null;
  if (maLkTuongDuong?.trim()) {
    if (trangThai !== "Kho xac nhan hang da ve" || !donGoc) return { error: "DOI_MA_CHI_KHI_CO_HANG", status: 400 };
    const gui = maLkTuongDuong.trim();
    const maMoi = (await quyVeMaChuan(c.env.DB, [gui])).get(gui) ?? gui;
    if (maMoi !== donGoc.ma_lk) {
      const lk = await c.env.DB.prepare("SELECT ten_linh_kien, gia_ban, trang_thai_ma FROM linh_kien WHERE ma_linh_kien = ?").bind(maMoi)
        .first<{ ten_linh_kien: string; gia_ban: number | null; trang_thai_ma: string | null }>();
      if (!lk || lk.trang_thai_ma === "Da doi ma") return { error: "MA_LK_NOT_FOUND", status: 400 };
      const cungNhom = await c.env.DB.prepare(
        "SELECT 1 FROM lk_nhom_thay_the_ct a JOIN lk_nhom_thay_the_ct b ON b.nhom_id = a.nhom_id WHERE a.ma_lk = ? AND b.ma_lk = ? LIMIT 1",
      ).bind(donGoc.ma_lk, maMoi).first();
      if (!cungNhom) return { error: "KHONG_PHAI_LK_TUONG_DUONG", status: 400 };
      doiMa = { cu: donGoc.ma_lk, moi: maMoi };
      // Gia chot nhap tay la gia cua MA CU -> bo khi doi ma (sua 2026-11-19, v1.528: DDH-007748 doi 2003030346 -> 2003030291 van giu
      // gia chot 425.000 = gia du phong ma cu, trong khi gia du phong ma moi 515.000 -> phieu thieu tien). Gia tinh lai theo ma moi.
      const boGiaChot = donGoc.gia_chot != null
        ? ` (bỏ giá chốt ${donGoc.gia_chot.toLocaleString("vi-VN")}đ của mã cũ — giá tính lại theo mã mới)`
        : "";
      const nhanDoi = `Đổi sang LK tương đương ${donGoc.ma_lk} → ${maMoi}${boGiaChot}`;
      ghiChu = ghiChu?.trim() ? `${nhanDoi} — ${ghiChu.trim()}` : nhanDoi;
      statements[viTriLogChinh] = c.env.DB.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
        .bind(id, trangThai, user.email, now, ghiChu);
      statements.unshift(
        // CAS: don da doi ma / roi "Cho hang" giua luc doc va luc ghi -> CHECK x=0 vi pham -> rollback ca batch.
        c.env.DB.prepare("INSERT INTO quy_cas_guard (x) SELECT 1 WHERE (SELECT ma_lk || '|' || trang_thai_hien_tai FROM dat_don_hang WHERE id = ?) IS NOT ?")
          .bind(tlk.dat_don_hang_id, `${donGoc.ma_lk}|Cho hang`),
        c.env.DB.prepare("UPDATE dat_don_hang SET ma_lk = ?, ten_lk_snapshot = ?, gia_de_xuat = ?, gia_chot = NULL, updated_at = ? WHERE id = ?")
          .bind(maMoi, lk.ten_linh_kien, lk.gia_ban, now, tlk.dat_don_hang_id),
      );
      donGoc.ten_lk_snapshot = lk.ten_linh_kien;
    }
  }
  // Kho tu choi = huy don -> bat buoc ly do (hien cho KTV).
  if (donGoc && (trangThai === "Kho tu choi sai TT" || trangThai === "Mua hang tu choi") && !ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 400 };
  const tomTat = donGoc
    ? await tomTatThieuLk(c.env.DB, id, { trangThai, email: user.email, ngay: now, ghiChu: ghiChu?.trim() || null },
        trangThai === "Kho xac nhan hang da ve" ? "tự động duyệt đơn, vào phiếu xuất kho" : "đơn tự hủy")
    : "";
  if (donGoc && trangThai !== "Da huy bo") {
    // Dong luon ticket (Kho da xong phan minh, khong con cho TN quyet dinh).
    statements.push(
      c.env.DB.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
        id, trangThai === "Kho xac nhan hang da ve" ? "Da ket thuc" : "Da huy bo", user.email, now,
        trangThai === "Kho xac nhan hang da ve"
          ? "Tự động: hàng về → duyệt đơn gốc, vào phiếu"
          : trangThai === "Mua hang tu choi" ? "Tự động: Mua hàng từ chối → hủy đơn gốc" : "Tự động: Kho từ chối → hủy đơn gốc",
      ),
    );
  }

  try {
    await c.env.DB.batch(statements);
  } catch (e) {
    if (doiMa && String(e).includes("CHECK")) return { error: "STATE_CHANGED", status: 409 };
    throw e;
  }
  // Kho TIEP NHAN / CAP NHAT ticket cho hang -> bao nguoi dat (2026-10-15, "minh bạch cho mọi thao tác xử lý"): ly do thieu Kho
  // giai trinh + ngay du kien co hang. Khong bao chinh nguoi vua thao tac.
  // Chuyen Mua hang (2026-10-19): bao chuong + push cho moi tai khoan Mua hang (viec moi).
  if (trangThai === "Cho mua hang") {
    const ds = await c.env.DB
      .prepare("SELECT email FROM users WHERE la_mua_hang = 1 AND trang_thai_duyet = 'Da duyet' AND COALESCE(bi_khoa, 0) = 0 AND email != ?")
      .bind(user.email)
      .all<{ email: string }>();
    const don = await c.env.DB.prepare("SELECT ma_lk, ten_lk_snapshot, so_luong_de_xuat FROM dat_don_hang WHERE id = ?").bind(tlk.dat_don_hang_id)
      .first<{ ma_lk: string; ten_lk_snapshot: string; so_luong_de_xuat: number }>();
    if (ds.results.length && don) {
      c.executionCtx.waitUntil(
        notifyWorkflowTask(c.env, c.env.DB, {
          cat1Emails: ds.results.map((r) => r.email), otherRoles: [], emailGsList: [], pastActors: [],
          title: "Ticket thiếu hàng cần đặt mua",
          body: `Kho chuyển ticket ${id} — ${don.ma_lk} ${don.ten_lk_snapshot} (x${don.so_luong_de_xuat}) sang Mua hàng đặt hàng${ghiChu?.trim() ? `: ${ghiChu.trim().slice(0, 200)}` : ""}`,
          linkType: "don_hang", linkId: tlk.dat_don_hang_id,
        }),
      );
    }
  }
  if (trangThai === "Kho da tiep nhan" || trangThai === "Kho da cap nhat" || trangThai === "Mua hang da dat") {
    const don = await c.env.DB
      .prepare("SELECT nguoi_tao, ten_lk_snapshot, so_luong_de_xuat FROM dat_don_hang WHERE id = ?")
      .bind(tlk.dat_don_hang_id)
      .first<{ nguoi_tao: string; ten_lk_snapshot: string; so_luong_de_xuat: number }>();
    if (don && don.nguoi_tao !== user.email) {
      const hanhDong = trangThai === "Kho da tiep nhan" ? "Kho đã tiếp nhận" : trangThai === "Mua hang da dat" ? "Mua hàng đã đặt hàng cho" : "Kho cập nhật tiến độ";
      c.executionCtx.waitUntil(
        baoNguoiTaoDon(
          c.env, c.env.DB, don.nguoi_tao, "cho_hang",
          `${hanhDong} đơn chờ hàng "${don.ten_lk_snapshot} (x${don.so_luong_de_xuat})"${ghiChu?.trim() ? `: ${ghiChu.trim().slice(0, 300)}` : ""}`,
          tlk.dat_don_hang_id,
        ),
      );
    }
  }
  if (donGoc) {
    const tenDon = `"${donGoc.ten_lk_snapshot} (x${donGoc.so_luong_de_xuat})"`;
    if (trangThai === "Kho xac nhan hang da ve") {
      const daDuyet = await duyetDonKhiHangVe(c.env, c.env.DB, tlk.dat_don_hang_id, user.email, tomTat);
      // Doi ma -> gia ban doi -> tong ngay cua KTV doi (bac chiet khau) -> tinh lai cac phieu dang tao + nhan don chua vao phieu.
      if (doiMa) await taiTinhPxkMoCuaKtv(c.env.DB, donGoc.nguoi_nhan_hang, user.email);
      if (daDuyet) {
        c.executionCtx.waitUntil(baoNguoiTaoDon(c.env, c.env.DB, donGoc.nguoi_tao, "da_duyet", `Đơn hàng ${tenDon} đã có hàng — đã duyệt và vào phiếu xuất kho`, tlk.dat_don_hang_id));
      }
    } else if (await huyDonChoHangTuDong(c.env, c.env.DB, tlk.dat_don_hang_id, user.email, tomTat)) {
      const lyDo = ghiChu?.trim() ? `: ${ghiChu.trim()}` : "";
      // Don da huy -> yeu cau huy dang cho bo phan dong y (KTV / GS gui truoc do) tu dong "Da dong y" (v1.479 - Kho huy thang tren
      // ticket hoac don goc thay vi bam "Đồng ý hủy"); bao nguoi gui neu khac nguoi tao (nguoi tao duoc bao ngay duoi).
      const ycMo = await c.env.DB.prepare(
        "UPDATE yeu_cau_huy_don SET trang_thai = 'Da dong y', nguoi_xu_ly = ?, ngay_xu_ly = ?, ghi_chu_xu_ly = ? WHERE dat_don_hang_id = ? AND trang_thai = 'Cho dong y' RETURNING nguoi_yeu_cau",
      ).bind(user.email, nowVN(), `Tự đóng: ${trangThai === "Da huy bo" ? "ticket chờ hàng đã hủy" : "đơn đã hủy"}${lyDo}`, tlk.dat_don_hang_id)
        .all<{ nguoi_yeu_cau: string }>();
      const nguoiGui = ycMo.results.map((r) => r.nguoi_yeu_cau).filter((e) => e !== donGoc!.nguoi_tao && e !== user.email);
      if (nguoiGui.length) {
        c.executionCtx.waitUntil(baoNguoiVeYeuCauHuy(c, nguoiGui, `Đơn ${tlk.dat_don_hang_id} ${tenDon} đã hủy theo yêu cầu${lyDo}`, tlk.dat_don_hang_id));
      }
      c.executionCtx.waitUntil(
        baoNguoiTaoDon(
          c.env, c.env.DB, donGoc.nguoi_tao, "huy",
          trangThai === "Kho tu choi sai TT"
            ? `Đơn hàng ${tenDon} bị hủy — Kho từ chối chờ hàng${lyDo}`
            : trangThai === "Mua hang tu choi"
              ? `Đơn hàng ${tenDon} bị hủy — Mua hàng không mua được linh kiện${lyDo}`
              : `Đơn hàng ${tenDon} bị hủy — ticket chờ hàng đã hủy${lyDo}`,
          tlk.dat_don_hang_id,
        ),
      );
    }
  }
  return { ok: true };
}

// POST /api/dat-mua-lk/thieu-lk/:id/log - Kho (hoac Admin) cap nhat trang thai xu ly. Nguoi tao co
// the "Da huy bo" khi con dang mo.
datMuaLinhKien.post("/thieu-lk/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ trang_thai: string; ghi_chu?: string; ngay_du_kien_co_hang?: string; ma_eo?: string; ma_lk_tuong_duong?: string }>();
  const result = await applyThieuLkLog(c, id, body.trang_thai, body.ghi_chu, body.ngay_du_kien_co_hang, body.ma_eo, body.ma_lk_tuong_duong);
  if ("error" in result) return c.json({ error: result.error }, result.status);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// POST /api/dat-mua-lk/thieu-lk/bulk-log - { ids, trang_thai, ghi_chu?, ngay_du_kien_co_hang? } xu
// ly hang loat nhieu ticket thieu_lk cung luc (them 2026-08-15, tieu chi UX #4). Tai su dung
// applyThieuLkLog, tiep tuc xu ly cac id con lai ngay ca khi 1 id loi - tra ket qua tung id.
datMuaLinhKien.post("/thieu-lk/bulk-log", async (c) => {
  const body = await c.req.json<{ ids: string[]; trang_thai: string; ghi_chu?: string; ngay_du_kien_co_hang?: string; ma_eo?: string }>();
  if (!Array.isArray(body.ids) || body.ids.length === 0) return c.json({ error: "MISSING_IDS" }, 400);
  const ids = [...new Set(body.ids)];
  if (ids.length > MAX_BULK_IDS) return c.json({ error: "QUA_NHIEU_ID", max: MAX_BULK_IDS }, 400);

  const results: Record<string, string> = {};
  let coThanhCong = false;
  for (const id of ids) {
    const result = await applyThieuLkLog(c, id, body.trang_thai, body.ghi_chu, body.ngay_du_kien_co_hang, body.ma_eo);
    results[id] = "error" in result ? result.error : "ok";
    if (!("error" in result)) coThanhCong = true;
  }

  if (coThanhCong) c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ results });
});

// ================= YEU CAU HUY DON (chot 2026-11-07, v1.455, migration 0109) =================
// "Cho phép KTV, GS hủy bỏ đơn chưa xuất tuy nhiên sẽ cần sự đồng ý từ bộ phận đang xử lý đơn đó (KHO nếu kho đã xác nhận chờ hàng,
// mua hàng nếu mua hàng đã xác nhận đặt hàng, kế toán nếu kế toán đã lên mã đơn hàng hoặc misa), nếu kế toán duyệt tiền thì KTV vẫn
// hủy được, tiền trả về quỹ". phanLoaiHuyDon() = 1 nguon quyet dinh giai doan (FE chi hien thi ket qua):
//  - Khong huy duoc: don tra hang (luong Hang tra), don da dong, phieu chua don da qua buoc Ke toan chot (Kho da nhan lenh xuat).
//  - Huy NGAY (khong anh huong bo phan nao): don chua vao phieu (tru Cho hang Kho/Mua hang da nhan), don trong phieu "Dang tao phieu"
//    ma Ke toan CHUA nhap Ma don hang / Ma MISA - KE CA phieu Ke toan da duyet tien (tien cua don tu hoan ve quy qua taiTinhPxk).
//  - Can dong y: Kho (ticket cho hang "Kho da tiep nhan" / "Kho da cap nhat"), Mua hang ("Cho mua hang" / "Mua hang da dat"),
//    Ke toan (phieu "Cho ke toan" hoac da co Ma don hang xac nhan / Ma MISA).
// Thuc hien huy (huy ngay hoac bo phan dong y): go don khoi phieu (tien thua ve quy, phieu trong tu huy) roi applyDonHangLog "huy"
// boQuaQuyenHuy; don "Cho hang" dang khoa -> bo phan huy ticket (applyThieuLkLog "Da huy bo" -> don tu huy, tien ve quy).
type BoPhanHuy = "kho" | "mua_hang" | "ke_toan";
const TEN_BO_PHAN_HUY: Record<BoPhanHuy, string> = { kho: "Kho", mua_hang: "Mua hàng", ke_toan: "Kế toán" };
export interface PhanLoaiHuy {
  huy_duoc: boolean;
  bo_phan: BoPhanHuy | null;
  giai_doan: string;
  pxk_id: string | null;
  ticket_id: string | null;
  ticket_khoa: boolean;
}

export async function phanLoaiHuyDon(db: D1Database, donHangId: string): Promise<PhanLoaiHuy | null> {
  const r = await db.prepare(
    `SELECT ddh.loai_don, ddh.trang_thai_hien_tai AS tt,
       p.id AS pxk_id, p.trang_thai_hien_tai AS pxk_tt, COALESCE(p.ma_xuat_kho_xac_nhan, 0) AS ma_hd, TRIM(COALESCE(p.ma_misa, '')) AS ma_misa,
       p.ma_xuat_kho, p.trang_thai_chuyen_tien AS tien_tt,
       (SELECT t.id FROM thieu_lk t WHERE t.dat_don_hang_id = ddh.id AND ${latestThieuLkStatusExpr("t.id")} NOT IN ('Da huy bo', 'Da ket thuc')
          ORDER BY t.ngay_tao DESC, t.id DESC LIMIT 1) AS ticket_id
     FROM dat_don_hang ddh
     LEFT JOIN phieu_xuat_kho_dong pd ON pd.dat_don_hang_id = ddh.id
     LEFT JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id AND p.trang_thai_hien_tai <> 'Ke toan huy'
     WHERE ddh.id = ? ORDER BY p.id IS NULL LIMIT 1`,
  ).bind(donHangId).first<{
    loai_don: string; tt: string | null; pxk_id: string | null; pxk_tt: string | null; ma_hd: number; ma_misa: string; ma_xuat_kho: string | null;
    tien_tt: string | null; ticket_id: string | null;
  }>();
  if (!r) return null;
  const kq = (huy_duoc: boolean, bo_phan: BoPhanHuy | null, giai_doan: string, ticket_khoa = false): PhanLoaiHuy =>
    ({ huy_duoc, bo_phan, giai_doan, pxk_id: r.pxk_id, ticket_id: r.ticket_id, ticket_khoa });
  if (r.loai_don === "tra_hang") return kq(false, null, "Đơn trả hàng — hủy theo luồng Hàng trả");
  if (r.tt === "TN tu choi" || r.tt === "Da huy") return kq(false, null, "Đơn đã đóng");
  if (r.pxk_id) {
    if (r.pxk_tt !== "Dang tao phieu" && r.pxk_tt !== "Cho ke toan") {
      return kq(false, null, `Phiếu ${r.ma_xuat_kho ?? r.pxk_id} đã được Kế toán chốt xuất kho — không hủy được nữa`);
    }
    if (r.pxk_tt === "Cho ke toan" || r.ma_hd || r.ma_misa) {
      const ma = [r.ma_hd ? `Mã đơn hàng ${r.ma_xuat_kho}` : "", r.ma_misa ? `Mã MISA ${r.ma_misa}` : ""].filter(Boolean).join(", ");
      return kq(true, "ke_toan", `Kế toán đang xử lý phiếu ${r.pxk_id}${ma ? ` (đã có ${ma})` : " (chờ mã MISA)"}`);
    }
    const tien = r.tien_tt === "TN da duyet" ? " — Kế toán đã duyệt tiền, tiền của đơn trả về quỹ dư" : "";
    return kq(true, null, `Đơn trong phiếu ${r.pxk_id} đang tạo${tien}`);
  }
  if (r.tt === "Cho hang" && r.ticket_id) {
    const tk = await db.prepare(`SELECT ${latestThieuLkStatusExpr("thieu_lk.id")} AS tt FROM thieu_lk WHERE id = ?`).bind(r.ticket_id).first<{ tt: string | null }>();
    if (tk?.tt === "Kho da tiep nhan" || tk?.tt === "Kho da cap nhat") return kq(true, "kho", `Kho đã xác nhận chờ hàng (ticket ${r.ticket_id})`, true);
    if (tk?.tt === "Cho mua hang" || tk?.tt === "Mua hang da dat") {
      return kq(true, "mua_hang", tk.tt === "Mua hang da dat" ? `Mua hàng đã đặt hàng (ticket ${r.ticket_id})` : `Đang chờ Mua hàng đặt hàng (ticket ${r.ticket_id})`, true);
    }
  }
  return kq(true, null, "Đơn chưa vào phiếu xuất — hủy được ngay");
}

// Ai duoc YEU CAU huy: nguoi tao / nguoi nhan hang / GS khu vuc (chinh, GS cua KTV tao, GS phu) / Admin.
async function duocYeuCauHuy(c: Context<{ Bindings: Env }>, donHangId: string): Promise<boolean> {
  const user = c.get("user");
  if (user.vai_tro === "Admin") return true;
  const d = await c.env.DB.prepare(
    `SELECT ddh.nguoi_tao, ddh.nguoi_nhan_hang, ddh.email_gs, COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) AS kv,
       (SELECT u.giam_sat_quan_ly FROM users u WHERE u.email = ddh.nguoi_tao) AS gs_nguoi_tao
     FROM dat_don_hang ddh WHERE ddh.id = ?`,
  ).bind(donHangId).first<{ nguoi_tao: string; nguoi_nhan_hang: string | null; email_gs: string | null; kv: string | null; gs_nguoi_tao: string | null }>();
  if (!d) return false;
  if (d.nguoi_tao === user.email || d.nguoi_nhan_hang === user.email) return true;
  if (user.vai_tro !== "Giam sat") return false;
  return d.email_gs === user.email || d.gs_nguoi_tao === user.email || (await laGsCuaKhuVuc(c.env.DB, user.email, d.kv));
}

function laNguoiDuyetHuy(c: Context<{ Bindings: Env }>, boPhan: BoPhanHuy): boolean {
  const u = c.get("user");
  if (u.vai_tro === "Admin") return true;
  if (boPhan === "kho") return !!u.la_kho;
  if (boPhan === "mua_hang") return !!u.la_mua_hang;
  return !!u.la_ke_toan;
}

// Thuc hien huy that (huy ngay / bo phan dong y).
export async function thucHienHuyDon(
  c: Context<{ Bindings: Env }>, donHangId: string, lyDo: string, pl: PhanLoaiHuy,
): Promise<{ error: string; status: 404 | 409 | 403 | 400 } | { ok: true }> {
  const user = c.get("user");
  if (pl.ticket_khoa && pl.ticket_id) {
    // Cho hang Kho / Mua hang dang xu ly: huy ticket -> don goc tu huy (tien ve quy) - nguoi bam la bo phan (co quyen huy ticket).
    const r = await applyThieuLkLog(c, pl.ticket_id, "Da huy bo", lyDo, undefined);
    return "error" in r ? r : { ok: true };
  }
  if (pl.pxk_id) {
    const go = await goDonKhoiPxk(c.env.DB, pl.pxk_id, donHangId, user.email, "Hủy đơn theo yêu cầu", lyDo, true, false);
    if (go.hoanQuy > 0) c.executionCtx.waitUntil(thongBaoHoanQuyPhieuHuy(c.env, c.env.DB, pl.pxk_id, go.hoanQuy));
  }
  const r = await applyDonHangLog(c, donHangId, "huy", undefined, lyDo, undefined, undefined, false, { boQuaQuyenHuy: true });
  return "error" in r ? r : { ok: true };
}

async function baoNguoiVeYeuCauHuy(c: Context<{ Bindings: Env }>, emails: string[], noiDung: string, donHangId: string) {
  const ds = [...new Set(emails.filter(Boolean))];
  if (ds.length === 0) return;
  const now = nowVN();
  await c.env.DB.batch(ds.map((e) =>
    c.env.DB.prepare("INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, 'yeu_cau_huy', ?, 'don_hang', ?, ?)")
      .bind(e, noiDung, donHangId, now),
  ));
  await Promise.all(ds.map((e) => sendPushToUser(c.env, e, { title: "Yêu cầu hủy đơn", body: noiDung, url: "/" }).catch(() => undefined)));
}

async function emailsBoPhanHuy(db: D1Database, boPhan: BoPhanHuy, maLk: string | null): Promise<string[]> {
  if (boPhan === "mua_hang") {
    const { results } = await db.prepare("SELECT email FROM users WHERE la_mua_hang = 1 AND COALESCE(bi_khoa, 0) = 0").all<{ email: string }>();
    return results.map((r) => r.email);
  }
  const ds = await emailsForRoleOrQC(db, boPhan === "kho" ? "la_kho" : "la_ke_toan", []);
  return boPhan === "kho" ? locEmailKhoTheoNhomLk(db, ds, maLk) : ds;
}

// GET /api/dat-mua-lk/don-hang/:id/huy-don - giai doan huy + yeu cau dang mo + quyen nguoi xem (FE: khoi "Hủy đơn" o chi tiet don).
datMuaLinhKien.get("/don-hang/:id/huy-don", async (c) => {
  const id = c.req.param("id");
  const pl = await phanLoaiHuyDon(c.env.DB, id);
  if (!pl) return c.json({ error: "NOT_FOUND" }, 404);
  const mo = await c.env.DB.prepare("SELECT * FROM yeu_cau_huy_don WHERE dat_don_hang_id = ? AND trang_thai = 'Cho dong y'").bind(id).first<Record<string, unknown>>();
  const { results: lichSu } = await c.env.DB.prepare(
    "SELECT * FROM yeu_cau_huy_don WHERE dat_don_hang_id = ? AND trang_thai <> 'Cho dong y' ORDER BY id DESC LIMIT 5",
  ).bind(id).all();
  const boPhanMo = (mo?.bo_phan as BoPhanHuy | undefined) ?? null;
  return c.json({
    phan_loai: pl,
    yeu_cau: mo ?? null,
    lich_su: lichSu,
    duoc_yeu_cau: pl.huy_duoc && (await duocYeuCauHuy(c, id)),
    duoc_duyet: !!boPhanMo && laNguoiDuyetHuy(c, boPhanMo),
  });
});

// POST /api/dat-mua-lk/don-hang/:id/yeu-cau-huy {ly_do} - KTV / GS huy don: giai doan khong anh huong ai -> huy ngay; can bo phan
// dong y -> tao yeu cau "Cho dong y" + bao bo phan. Tra { da_huy } hoac { bo_phan }.
datMuaLinhKien.post("/don-hang/:id/yeu-cau-huy", async (c) => {
  const body = await c.req.json<{ ly_do?: string }>().catch(() => ({}) as { ly_do?: string });
  return yeuCauHuyDon(c, c.req.param("id"), body.ly_do);
});

// Than cua POST /don-hang/:id/yeu-cau-huy - dung chung voi app Bao hanh doi tra huy don CONG NO SUA CHUA no tao (suachuaPartner.ts, v1.498):
// nguoi goi = tai khoan da gan vao c.get("user").
export async function yeuCauHuyDon(c: Context<{ Bindings: Env }>, id: string, lyDoGui: string | undefined): Promise<Response> {
  const user = c.get("user");
  const lyDo = lyDoGui?.trim().slice(0, 1000);
  if (!lyDo) return c.json({ error: "THIEU_LY_DO_HUY" }, 400);
  if (!(await duocYeuCauHuy(c, id))) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const pl = await phanLoaiHuyDon(c.env.DB, id);
  if (!pl) return c.json({ error: "NOT_FOUND" }, 404);
  if (!pl.huy_duoc) return c.json({ error: "KHONG_HUY_DUOC", giai_doan: pl.giai_doan }, 409);
  const daCo = await c.env.DB.prepare("SELECT id FROM yeu_cau_huy_don WHERE dat_don_hang_id = ? AND trang_thai = 'Cho dong y'").bind(id).first();
  if (daCo) return c.json({ error: "DA_CO_YEU_CAU_HUY" }, 409);
  if (!pl.bo_phan) {
    const r = await thucHienHuyDon(c, id, lyDo, pl);
    if ("error" in r) return c.json({ error: r.error }, r.status);
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
    return c.json({ ok: true, da_huy: true });
  }
  const now = nowVN();
  try {
    await c.env.DB.prepare(
      "INSERT INTO yeu_cau_huy_don (dat_don_hang_id, nguoi_yeu_cau, ly_do, bo_phan, giai_doan, pxk_id, ngay_tao) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, user.email, lyDo, pl.bo_phan, pl.giai_doan, pl.pxk_id, now).run();
  } catch {
    return c.json({ error: "DA_CO_YEU_CAU_HUY" }, 409);
  }
  const d = await c.env.DB.prepare("SELECT ma_lk, ten_lk_snapshot, so_luong_de_xuat FROM dat_don_hang WHERE id = ?").bind(id)
    .first<{ ma_lk: string | null; ten_lk_snapshot: string; so_luong_de_xuat: number }>();
  const boPhan = pl.bo_phan;
  c.executionCtx.waitUntil((async () => {
    const ds = (await emailsBoPhanHuy(c.env.DB, boPhan, d?.ma_lk ?? null)).filter((e) => e !== user.email);
    await baoNguoiVeYeuCauHuy(c, ds, `Yêu cầu hủy đơn ${id} "${d?.ten_lk_snapshot ?? ""} (x${d?.so_luong_de_xuat ?? ""})" — cần ${TEN_BO_PHAN_HUY[boPhan]} đồng ý. Lý do: ${lyDo}`, id);
  })());
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, da_huy: false, bo_phan: boPhan });
}

// POST /api/dat-mua-lk/yeu-cau-huy/:id/xu-ly {hanh_dong: "dong_y" | "tu_choi" | "rut", ghi_chu?} - bo phan dong y (he thong huy that) /
// tu choi (bat buoc ghi chu); nguoi yeu cau rut lai. CAS theo trang thai "Cho dong y".
datMuaLinhKien.post("/yeu-cau-huy/:id/xu-ly", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json<{ hanh_dong?: string; ghi_chu?: string }>().catch(() => ({}) as { hanh_dong?: string; ghi_chu?: string });
  const ghiChu = body.ghi_chu?.trim().slice(0, 1000) || null;
  const yc = await c.env.DB.prepare("SELECT * FROM yeu_cau_huy_don WHERE id = ?").bind(id)
    .first<{ id: number; dat_don_hang_id: string; nguoi_yeu_cau: string; ly_do: string; bo_phan: BoPhanHuy; trang_thai: string }>();
  if (!yc) return c.json({ error: "NOT_FOUND" }, 404);
  if (yc.trang_thai !== "Cho dong y") return c.json({ error: "TRANG_THAI_DA_DOI" }, 409);
  const now = nowVN();
  const ghi = (tt: string) =>
    c.env.DB.prepare("UPDATE yeu_cau_huy_don SET trang_thai = ?, nguoi_xu_ly = ?, ngay_xu_ly = ?, ghi_chu_xu_ly = ? WHERE id = ? AND trang_thai = 'Cho dong y'")
      .bind(tt, user.email, now, ghiChu, id).run();
  if (body.hanh_dong === "rut") {
    if (yc.nguoi_yeu_cau !== user.email && user.vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    if (!(await ghi("Da rut")).meta.changes) return c.json({ error: "TRANG_THAI_DA_DOI" }, 409);
    return c.json({ ok: true });
  }
  if (!laNguoiDuyetHuy(c, yc.bo_phan)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  if (body.hanh_dong === "tu_choi") {
    if (!ghiChu) return c.json({ error: "MISSING_GHI_CHU" }, 400);
    if (!(await ghi("Tu choi")).meta.changes) return c.json({ error: "TRANG_THAI_DA_DOI" }, 409);
    c.executionCtx.waitUntil(baoNguoiVeYeuCauHuy(c, [yc.nguoi_yeu_cau], `${TEN_BO_PHAN_HUY[yc.bo_phan]} từ chối yêu cầu hủy đơn ${yc.dat_don_hang_id}: ${ghiChu}`, yc.dat_don_hang_id));
    return c.json({ ok: true });
  }
  if (body.hanh_dong !== "dong_y") return c.json({ error: "INVALID_HANH_DONG" }, 400);
  // Phan loai lai luc dong y: don da dong / da qua buoc chot -> khong huy duoc (dong yeu cau); giai doan doi sang bo phan khac -> chi
  // nguoi co quyen bo phan MOI huy duoc.
  const pl = await phanLoaiHuyDon(c.env.DB, yc.dat_don_hang_id);
  if (!pl || !pl.huy_duoc) {
    await ghi("Tu choi");
    return c.json({ error: "KHONG_HUY_DUOC", giai_doan: pl?.giai_doan ?? null }, 409);
  }
  if (pl.bo_phan && pl.bo_phan !== yc.bo_phan && !laNguoiDuyetHuy(c, pl.bo_phan)) {
    return c.json({ error: "BO_PHAN_XU_LY_DA_DOI", bo_phan: pl.bo_phan }, 409);
  }
  // Khoa yeu cau truoc (tranh 2 nguoi bam cung luc huy 2 lan) - huy loi thi mo lai.
  if (!(await ghi("Da dong y")).meta.changes) return c.json({ error: "TRANG_THAI_DA_DOI" }, 409);
  const lyDo = `Hủy theo yêu cầu của ${yc.nguoi_yeu_cau} (${TEN_BO_PHAN_HUY[yc.bo_phan]} đồng ý): ${yc.ly_do}${ghiChu ? ` — ${ghiChu}` : ""}`;
  const r = await thucHienHuyDon(c, yc.dat_don_hang_id, lyDo, pl);
  if ("error" in r) {
    await c.env.DB.prepare("UPDATE yeu_cau_huy_don SET trang_thai = 'Cho dong y', nguoi_xu_ly = NULL, ngay_xu_ly = NULL, ghi_chu_xu_ly = NULL WHERE id = ?").bind(id).run();
    return c.json({ error: r.error }, r.status);
  }
  c.executionCtx.waitUntil(baoNguoiVeYeuCauHuy(c, [yc.nguoi_yeu_cau], `${TEN_BO_PHAN_HUY[yc.bo_phan]} đã đồng ý — đơn ${yc.dat_don_hang_id} đã hủy`, yc.dat_don_hang_id));
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

export default datMuaLinhKien;
