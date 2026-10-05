// Xuat du lieu Phieu xuat kho (PXK) sang cac mau import MISA AMIS Accounting.
// LICH SU: ban dau (2026-09-02) port tu 3 mau "Xuat kho bao hanh/Chuyen kho/Ban hang" trong file nguoi
// dung gui "Mau xuat nhap kho.xls" (44/31/51 cot rieng biet - van con trong lich su git). SUA LON
// 2026-09-09 (nguoi dung gui file THAT nguoi dung dang dung de nhap AMIS "File đẩy hàng lên amis - CHỐT
// CUỐI.xls", 12 sheet, xac nhan qua nhieu vong AskUserQuestion "File Excel moi la dung, DB can sua
// lai"): phat hien 12 sheet do THUC RA chi la 2 bo cot that (khong phai 3):
//   - "xuat_kho" VA "ban_hang" DUNG CHUNG 1 bo cot AMIS "Don dat hang" (38 cot: Ngay don hang/So don
//     hang/Trang thai/Tinh gia thanh/Ma khach hang/.../Truong mo rong 1-2) - phan biet nhau CHI boi cot
//     "Tinh gia thanh" trong file mau that (Khong = xuat kho bao hanh theo MYC/case, khong tinh tien;
//     Co = KTV mua that/tru cong no, co gia+thue GTGT 8%) - xem resolveTemplate() + DonDatHangRow.
//   - "chuyen_kho" GIU NGUYEN bo cot rieng (31 cot: TK No/TK Co, Don gia von...) - header FE
//     (misaExportTemplates.ts) da dung KHOP GAN NHU HOAN HAO voi file mau moi tu truoc (khong doi
//     header), CHI sua vai gia tri/them 3 truong con thieu (laDongGhiChu, donGiaVon, tienVon) - xem
//     ChuyenKhoRow.
// settings_loai_de_xuat.loai_file_xuat_misa (da sua lai gia tri qua migration 0024 cho khop dung bo cot
// that o tren) VAN quyet dinh template MAC DINH/uu tien cho tung loai de xuat - forceTemplate van cho
// phep TN/Ke toan ep sang mau khac neu muon (giu nguyen co che cu, xem resolveTemplate()).
// TK No/TK Co MOI mau CO DINH theo dung file mau (xac nhan "Cố định theo mẫu như file mẫu"), khong
// doc tu dau ra vi he thong khong co khai niem tai khoan ke toan rieng cho tung dong.
// Mien Bac/Nam suy tu ktv_lien_he.khu_vuc_ma cua nguoi_nhan_hang (chua "MB"=Bac, chua "MN"=Nam) de
// chon Ma kho/Ten kho mac dinh (settings admin tu dien, xem app_settings misa_ma_kho_mien_*). CHU Y:
// bo cot "Don dat hang" moi dung CHUNG 1 kho theo mien (misa_ma_kho_mien_*, giong ban_hang/chuyen_kho
// cu) cho CA xuat_kho lan ban_hang - KHONG con dung rieng misa_ma_kho_xk_mien_* nhu truoc (gia tri mau
// "Ma kho" trong file that ("6804-MB"/"6803") khop dung dinh dang misa_ma_kho_mien_*, KHONG khop dinh
// dang cu cua misa_ma_kho_xk_mien_* ("LKKGMB"/"LKKGMN") - xem loadKhoSettings, truong xuatKho GIU LAI
// trong ham nay vi Settings UI (SettingsModule.tsx) van con cho nhap, nhung KHONG con duoc doc o day).
// GHI CHU CHUA GIAI QUYET DUOC (can xac nhan sau, KHONG tu doan): 1 vai dong mau "Ma kho" trong file
// that la SNKMB/MMMB (khac han pattern mien Bac/Nam thuong thay) - co the phu thuoc nhom hang linh_kien,
// KHONG chi mien - CHUA co du du lieu de suy ra quy tac, dang FALLBACK ve dung 1 ma kho theo mien nhu
// truoc (co the SAI cho vai dong).
//
// SUA (phan hoi 2026-09-02 "mỗi pxk cho phép chọn cả 3 mẫu để tải về được không?"): ngoai template
// tu dong (resolveTemplate), them tham so forceTemplate cho buildMisaExportSheets - khi TN/Ke toan
// bam 1 trong 3 nut "Xuất kho/Chuyển kho/Bán hàng" o UI, TOAN BO dong cua PXK duoc EP vao DUNG 1
// mau da chon (bo qua resolveTemplate), theo dung xac nhan cua nguoi dung ("ép toàn bộ dòng theo
// mẫu đã chọn"). Khong truyen forceTemplate (vd goi truc tiep API) van giu hanh vi tu dong cu.
//
// "Mã đối tượng/Ma nguoi van chuyen/Ma khach hang/Ma nhan vien ban hang" PHAI la ktv.ma_misa (ma so
// MISA that, xac nhan lai 2026-09-09 khi doi chieu file moi - gia tri mau dang "TRAM0011"/"KTV0012" chi
// TRUNG dinh dang voi ma_ktv noi bo do quy uoc dat ma, KHONG duoc doc thang tu ma_ktv), "Ten doi
// tuong/Ten nguoi van chuyen/Ten khach hang/Nguoi nhan" PHAI la ktv.ten_misa - KHONG fallback ve
// ten_hien_thi/email (fallback che mat truong hop KTV chua khai bao ma_misa/ten_misa). buildMisaExportSheets
// tra THEM danh sach "canhBaoThieuMisa" (cac KTV dang xuat hien trong file nhung thieu ma_misa hoac
// ten_misa) de FE hien canh bao ro rang luc tai file.
import type { Env } from "../types";
import { tinhToanPxk, laTruCongNo, laKhTraGop } from "./pxkRecalculate";
import { tenNguoiNullSql } from "./tenNguoi";
import { ktvChinhCuaEmailSql } from "./ktvChinh";
import { boDau } from "./timTheoTen";

export const MISA_TEMPLATES = ["xuat_kho", "chuyen_kho", "ban_hang"] as const;
export type MisaTemplate = (typeof MISA_TEMPLATES)[number];

// Dung CHUNG cho ca "xuat_kho" (Tinh gia thanh=Khong, xuat bao hanh theo MYC/case) va "ban_hang"
// (Tinh gia thanh=Co, KTV mua that/tru cong no) - 2 mau nay CHI khac gia tri cac truong ben duoi, KHONG
// khac cau truoc cot (xem giai thich dau file). Dung 38 cot dung theo file mau "CHỐT CUỐI" (mot so
// loai de xuat trong file mau chi co 1 cot "Trường mở rộng" thay vi 2 - chuan hoa ve 2 cot cho tat ca,
// dong nao khong can thi de trong).
export interface DonDatHangRow {
  ngayDonHang: string;
  soDonHang: string;
  tinhGiaThanh: "Có" | "Không";
  maKhachHang: string;
  tenKhachHang: string;
  nguoiNhanHang: string;
  dienGiai: string;
  maNhanVienBanHang: string;
  maHang: string;
  tenHang: string;
  maKho: string;
  dvt: string;
  soLuong: number | null;
  donGia: number | null;
  thanhTien: number | null;
  phanTramThueGTGT: number;
  tienThueGTGT: number | null;
  // "Trường mở rộng 1"/"2" = Ma YCSC lien quan / TT+Mail duyet (xac nhan nguoi dung 2026-09-09 cho
  // cac o truoc day tuong nham la text placeholder "mã phê duyệt"/"mã PD/ MYC" trong file mau).
  truongMoRong1: string;
  truongMoRong2: string;
}

export interface ChuyenKhoRow {
  hinhThucChuyenKho: string;
  ngayHachToan: string;
  ngayChungTu: string;
  soChungTu: string;
  veViecDienGiai: string;
  voiDaiLyMaDonViNhan: string;
  tenDaiLyTenDonViNhan: string;
  maNguoiVanChuyen: string;
  tenNguoiVanChuyen: string;
  maHang: string;
  tenHang: string;
  // them 2026-09-09 (co trong header FE tu truoc nhung chua duoc dien) - luon "Không".
  laDongGhiChu: string;
  xuatTaiKho: string;
  nhapTaiKho: string;
  tkNo: string;
  tkCo: string;
  dvt: string;
  soLuong: number | null;
  donGiaBan: number | null;
  thanhTien: number | null;
  // them 2026-09-09 (co trong header FE tu truoc nhung chua duoc dien) - he thong khong theo doi gia
  // von rieng cho tung dong dat_don_hang nen de trong, KHONG tu tinh.
  donGiaVon: number | null;
  tienVon: number | null;
  truongMoRong: string;
}

export interface MisaExportSheets {
  xuat_kho: DonDatHangRow[];
  chuyen_kho: ChuyenKhoRow[];
  ban_hang: DonDatHangRow[];
}

export interface MisaExportResult {
  sheets: MisaExportSheets;
  // KTV xuat hien trong file nhung thieu ma_misa/ten_misa (2 truong dung LAM DU LIEU CHINH cho moi
  // cot "doi tuong/khach hang/nguoi van chuyen" - xem giai thich dau file) - FE hien canh bao ro rang
  // thay vi de nguoi dung tu phat hien khi mo file MISA that.
  canhBaoThieuMisa: { ma_ktv: string; ten_hien_thi: string | null }[];
  // Dong "TRỪ CÔNG NỢ" bi BO khoi file khi ep mau Chuyen kho (chot 2026-09-30) - hang da o kho KTV, KTV tra tien de
  // giam cong no -> chi hach toan bang mau Ban hang (tru kho KTV); Chuyen kho se chuyen nguoc hang KTV ve kho cong ty.
  boQuaTruCongNo: { so_phieu: string; ma_lk: string }[];
}

interface RawLine {
  pxk_id: string;
  ddh_id: string;
  pxk_ma_xuat_kho: string;
  pxk_ngay_tao: string;
  pxk_loai_don: "mua" | "cong_no" | "tra_hang";
  ma_lk: string;
  ten_lk: string | null;
  don_vi: string | null;
  loai_de_xuat: string | null;
  so_luong: number | null;
  don_gia: number | null;
  ma_yeu_cau_su_co: string | null;
  ma_lada: string | null;
  chinh_sach: string | null;
  tt_mail_duyet: string | null;
  tt_khach_hang: string | null;
  loai_file_xuat_misa: string | null;
  ktv_ma_ktv: string | null;
  ktv_ten: string | null;
  ktv_ma_misa: string | null;
  ktv_ten_misa: string | null;
  ktv_khu_vuc_ma: string | null;
  nguoi_nhan_hang: string | null;
}

function fmtDateVN(dt: string | null): string {
  if (!dt) return "";
  const datePart = dt.split(" ")[0];
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

// Xuat rieng (2026-09-10, phan hoi "nút tải nào được đề xuất sẽ tô màu nổi bật") de routes/phieuXuatKho.ts
// GET /:id dung LAI DUNG 1 cong thuc nay tinh "mau de xuat" hien thi cho PXK, tranh code trung logic.
// Dong "TRỪ CÔNG NỢ" (chot 2026-09-30): KHONG theo quy tac "PXK cong no -> Chuyen kho" - theo cai dat cua loai de xuat
// (dang la Ban hang), chi nhan Ban hang/Xuat kho (2 mau nay tru kho KTV, xem maKhoDong ben duoi).
// SUA 2026-10-05 (file "Diễn giải hệ thống misa.xlsx", cot FOM): BO quy tac "phieu cong no LUON Chuyen kho" - don CÔNG NỢ /
// HỖ TRỢ dung mau "MISA CN, hỗ trợ" (xuat_kho) theo cai dat loai de xuat (migration 0068). Loai de xuat CHUA cai mau: phieu
// cong no van Chuyen kho, phieu mua Ban hang (nhu cu). Phieu tra hang LUON Chuyen kho.
export function resolveTemplate(loaiDon: RawLine["pxk_loai_don"], loaiFileXuatMisa: string | null, loaiDeXuat?: string | null): MisaTemplate {
  if (laTruCongNo(loaiDeXuat)) return loaiFileXuatMisa === "xuat_kho" ? "xuat_kho" : "ban_hang";
  if (loaiDon === "tra_hang") return "chuyen_kho";
  if (loaiFileXuatMisa === "chuyen_kho" || loaiFileXuatMisa === "xuat_kho" || loaiFileXuatMisa === "ban_hang") return loaiFileXuatMisa;
  return loaiDon === "cong_no" ? "chuyen_kho" : "ban_hang";
}

// Dien giai rieng theo loai de xuat cho 2 mau Ban hang / "CN, hỗ trợ" (chot 2026-10-05, file "Diễn giải hệ thống misa.xlsx").
// So khong dau (boDau) - tranh lech chuan Unicode giua cac ten option.
const laMuaDuTru = (ldx: string | null) => boDau(ldx ?? "").includes("mua du tru");
// "CÔNG NỢ", "CÔNG NỢ - ĐƠN ĐANG XỬ LÝ"... (khong gom HỖ TRỢ CÔNG NỢ / TRỪ CÔNG NỢ / TRẢ HÀNG CÔNG NỢ - bat dau bang chu khac).
const laDonCongNo = (ldx: string | null) => boDau(ldx ?? "").startsWith("cong no");
function loaiHoTro0Dong(ldx: string | null): "kenh_mt" | "thuong" | null {
  const s = boDau(ldx ?? "");
  if (!s.includes("ho tro 0 dong")) return null;
  return s.includes("kenh mt") ? "kenh_mt" : "thuong";
}
// "Chính sách" cua don: "Trong CSBH" -> "trong BH", "Ngoài CSBH" -> "ngoài BH", trong -> bo qua.
function baoHanhTheoChinhSach(chinhSach: string | null): string {
  const s = boDau(chinhSach ?? "");
  return s.startsWith("trong") ? "trong BH" : s.startsWith("ngoai") ? "ngoài BH" : "";
}

// DONG TRA HANG (chot 2026-10-01): KTV tra LK ve kho cong ty -> "Xuất tại kho" = kho nhan lai theo mien (NTMN/NTMB, thay
// ma MISA KTV), Dien giai co dinh theo mien; rieng "TRẢ HÀNG CÔNG NỢ" moi cot tien = 0. Nhan dien theo loai don cua phieu
// HOAC ten loai de xuat chua "TRẢ HÀNG" (khong dau - tranh lech chuan Unicode NFC/NFD giua cac ten option).
const KHO_NHAN_TRA: Record<"bac" | "nam", { ma: string; dienGiai: string }> = {
  nam: { ma: "NTMN", dienGiai: "6803 NTMN -Nhận lại linh kiện ký gửi của" },
  bac: { ma: "NTMB", dienGiai: "6804-MB NTMB -Nhận lại linh kiện ký gửi của" },
};
function laDongTraHang(line: Pick<RawLine, "pxk_loai_don" | "loai_de_xuat">): boolean {
  return line.pxk_loai_don === "tra_hang" || boDau(line.loai_de_xuat ?? "").includes("tra hang");
}
function laTraHangCongNo(loaiDeXuat: string | null): boolean {
  return boDau(loaiDeXuat ?? "").includes("tra hang cong no");
}

// Don xuat MAY (phan loai "Máy") loai de xuat chua "CÔNG NỢ"/"HỖ TRỢ" (chot 2026-10-01): Dien giai = "Kho <ten kho MISA cua KTV
// nhan hang> xuất máy mới đổi bảo hành cho khách hàng <TT khách hàng> <TT+Mail duyệt>" o MOI mau. Khong ap cho dong tra hang
// (cau rieng KHO_NHAN_TRA) va "TRỪ CÔNG NỢ" (KTV mua lai hang dang giu, khong phai doi bao hanh).
function laXuatMayDoiBaoHanh(line: Pick<RawLine, "pxk_loai_don" | "loai_de_xuat" | "don_vi">): boolean {
  if (!laPhanLoaiMay(line.don_vi) || laDongTraHang(line) || laTruCongNo(line.loai_de_xuat)) return false;
  const ldx = boDau(line.loai_de_xuat ?? "");
  return ldx.includes("cong no") || ldx.includes("ho tro");
}
const motDong = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
function dienGiaiXuatMay(tenKhoKtv: string, line: Pick<RawLine, "tt_khach_hang" | "tt_mail_duyet">): string {
  return [`Kho ${tenKhoKtv} xuất máy mới đổi bảo hành cho khách hàng`, motDong(line.tt_khach_hang), motDong(line.tt_mail_duyet)]
    .filter(Boolean)
    .join(" ");
}

function mienFromKhuVuc(khuVucMa: string | null): "bac" | "nam" | null {
  if (!khuVucMa) return null;
  if (khuVucMa.includes("MB")) return "bac";
  if (khuVucMa.includes("MN")) return "nam";
  return null;
}

type KhoTheoMien = Record<"bac" | "nam", { ma: string; ten: string }>;

// `prefix` "misa_ma_kho_" = kho cong ty theo mien; "misa_ma_kho_may_" = kho ky gui hang moi KRF cho LK phan loai "Máy"
// (migration 0059, chot 2026-09-30).
async function loadKhoSettings(db: Env["DB"], loai: "" | "may_" = ""): Promise<KhoTheoMien> {
  const k = (x: "ma" | "ten", mien: "bac" | "nam") => `misa_${x}_kho_${loai}mien_${mien}`;
  const { results } = await db
    .prepare("SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?)")
    .bind(k("ma", "bac"), k("ten", "bac"), k("ma", "nam"), k("ten", "nam"))
    .all<{ key: string; value: string }>();
  const map = new Map(results.map((r) => [r.key, r.value]));
  return {
    bac: { ma: map.get(k("ma", "bac")) || "", ten: map.get(k("ten", "bac")) || "" },
    nam: { ma: map.get(k("ma", "nam")) || "", ten: map.get(k("ten", "nam")) || "" },
  };
}

// LK phan loai "Máy" (linh_kien.don_vi - cot "Phân loại") xuat tu kho ky gui KRF theo mien thay kho cong ty (chot
// 2026-09-30); dong "TRỪ CÔNG NỢ" KHONG ap (van tru kho cua KTV).
export const laPhanLoaiMay = (phanLoai: string | null | undefined) => (phanLoai ?? "").normalize("NFC").trim().toLowerCase() === "máy";

// Doc TAT CA dong dat_don_hang thuoc danh sach PXK (pxkIds) kem thong tin can de xuat MISA. Dung
// chung cho ca xuat 1 PXK va xuat gop nhieu PXK (bulk) - caller tu kiem tra quyen xem PXK truoc khi
// goi ham nay (khong tu kiem tra scope o day). forceTemplate: neu co, EP TOAN BO dong vao dung 1
// mau nay (bo qua resolveTemplate) - xem giai thich o comment dau file.
// FIX (2026-09-22, phan hoi "phiếu xuất tải về bị lỗi x2 dòng"): settings_loai_de_xuat.ten_option
// KHONG co UNIQUE - cung 1 ten option (vd "MUA HÀNG") ton tai o CA 2 nhom "KTV/CTV/TRẠM" va "Tác
// nghiệp + Giám sát" (dropdown rieng theo vai tro nguoi tao don, xem settingsDatMua.ts) nen truoc day
// `LEFT JOIN settings_loai_de_xuat sld ON sld.ten_option = ddh.loai_de_xuat` fan-out ra 2 dong cho MOI
// dong dat_don_hang co loai_de_xuat trung 1 trong 11 ten option dung chung nay - nhan DOI TOAN BO dong
// xuat ra file. Doi sang subquery scalar (chi lay loai_file_xuat_misa, KHONG can gi khac tu sld) -
// an toan vi da xac nhan qua du lieu that: moi cap trung ten_option luon co CUNG 1 gia tri
// loai_file_xuat_misa, LIMIT 1 chon dong nao cung ra ket qua giong nhau.
// Don KH tra gop ("HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX/-NPP", chot 2026-10-02): gom MOI dong cung phieu + cung KTV nhan + cung
// ma LK + cung loai de xuat + cung mau file thanh 1 dong - SL cong lai, Ma YCSC / TT+Mail duyet / TT khach hang noi bang ", "
// (bo trung, bo trong), tien (mau Ban hang) cong theo tung dong goc. Dong khac giu nguyen thu tu.
type DongMisa = { line: RawLine; template: MisaTemplate };
function gopDongKhTraGop(lines: DongMisa[], tienTheoDong: Map<string, number>): DongMisa[] {
  const out: DongMisa[] = [];
  const nhom = new Map<string, { dong: DongMisa; ids: string[] }>();
  const noi = (a: string | null, b: string | null) => {
    const ds = [...(a ?? "").split(", "), ...(b ?? "").split(", ")].map((x) => x.trim()).filter(Boolean);
    return ds.length ? [...new Set(ds)].join(", ") : null;
  };
  for (const d of lines) {
    if (!laKhTraGop(d.line.loai_de_xuat)) {
      out.push(d);
      continue;
    }
    const key = [d.template, d.line.pxk_id, d.line.nguoi_nhan_hang ?? "", d.line.ma_lk, d.line.loai_de_xuat ?? ""].join("|");
    const g = nhom.get(key);
    if (!g) {
      const dong = { template: d.template, line: { ...d.line } };
      nhom.set(key, { dong, ids: [d.line.ddh_id] });
      out.push(dong);
      continue;
    }
    const l = g.dong.line;
    l.so_luong = l.so_luong == null && d.line.so_luong == null ? null : (l.so_luong ?? 0) + (d.line.so_luong ?? 0);
    l.ma_yeu_cau_su_co = noi(l.ma_yeu_cau_su_co, d.line.ma_yeu_cau_su_co);
    l.tt_mail_duyet = noi(l.tt_mail_duyet, d.line.tt_mail_duyet);
    l.tt_khach_hang = noi(l.tt_khach_hang, d.line.tt_khach_hang);
    g.ids.push(d.line.ddh_id);
  }
  // Tien dong gop = tong tien cac dong goc, gan vao id dong dai dien (buildMisaExportSheets tra theo line.ddh_id).
  for (const { dong, ids } of nhom.values()) {
    if (ids.length < 2 || !ids.some((id) => tienTheoDong.has(id))) continue;
    tienTheoDong.set(dong.line.ddh_id, ids.reduce((t, id) => t + (tienTheoDong.get(id) ?? 0), 0));
  }
  return out;
}

export async function buildMisaExportSheets(env: Env, pxkIds: string[], forceTemplate?: MisaTemplate): Promise<MisaExportResult> {
  const sheets: MisaExportSheets = { xuat_kho: [], chuyen_kho: [], ban_hang: [] };
  const canhBaoThieuMisaMap = new Map<string, { ma_ktv: string; ten_hien_thi: string | null }>();
  const boQuaTruCongNo: MisaExportResult["boQuaTruCongNo"] = [];
  if (pxkIds.length === 0) return { sheets, canhBaoThieuMisa: [], boQuaTruCongNo };

  const db = env.DB;
  const khoBanHang = await loadKhoSettings(db);
  const khoMay = await loadKhoSettings(db, "may_");
  const placeholders = pxkIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT
         pxk.id as pxk_id, ddh.id as ddh_id,
         pxk.ma_xuat_kho as pxk_ma_xuat_kho, pxk.ngay_tao as pxk_ngay_tao, pxk.loai_don as pxk_loai_don,
         ddh.ma_lk, COALESCE(ddh.ten_lk_snapshot, lk.ten_linh_kien) as ten_lk, lk.don_vi,
         ddh.loai_de_xuat, COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) as so_luong,
         COALESCE(ddh.gia_chot, ddh.gia_de_xuat) as don_gia, ddh.ma_yeu_cau_su_co, ddh.ma_lada, ddh.chinh_sach, ddh.tt_mail_duyet, ddh.tt_khach_hang,
         (SELECT loai_file_xuat_misa FROM settings_loai_de_xuat WHERE ten_option = ddh.loai_de_xuat LIMIT 1) as loai_file_xuat_misa,
         -- Ma/ten MISA: danh ba KTV truoc, khong co thi lay tu TAI KHOAN (users.ma_misa/ten_misa - GS/van phong tu
         -- nhan hang khong nam trong danh ba KTV, ma MISA khai o Users; phan hoi 2026-09-29 GS nguyenquantb "có khai báo
         -- mã misa nhưng khi tải file về lại không điền"). Khu vuc (chon kho theo mien): KTV, khong co thi khu vuc cua
         -- PHIEU (migration 0042 - GS nhan hang -> khu vuc dau tien GS phu trach).
         ktv.ma_ktv as ktv_ma_ktv, ${tenNguoiNullSql("pxk.nguoi_nhan_hang")} as ktv_ten,
         COALESCE(NULLIF(TRIM(ktv.ma_misa), ''), NULLIF(TRIM(u.ma_misa), '')) as ktv_ma_misa,
         COALESCE(NULLIF(TRIM(ktv.ten_misa), ''), NULLIF(TRIM(u.ten_misa), '')) as ktv_ten_misa,
         COALESCE(ktv.khu_vuc_ma, pxk.khu_vuc_ma) as ktv_khu_vuc_ma,
         pxk.nguoi_nhan_hang
       FROM phieu_xuat_kho pxk
       JOIN phieu_xuat_kho_dong pxkd ON pxkd.phieu_xuat_kho_id = pxk.id
       JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
       LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
       LEFT JOIN ktv_lien_he ktv ON ktv.ma_ktv = ${ktvChinhCuaEmailSql("pxk.nguoi_nhan_hang")}
       LEFT JOIN users u ON u.email = pxk.nguoi_nhan_hang
       WHERE pxk.id IN (${placeholders})
       ORDER BY pxk.ngay_tao, pxk.id, ddh.id`,
    )
    .bind(...pxkIds)
    .all<RawLine>();

  // Xac dinh template cho TUNG dong TRUOC (bo cot "Don dat hang" moi khong co cot Serial rieng nhu mau
  // "Xuat kho" cu - xem DonDatHangRow - nen KHONG con can goi lookupCases() o day).
  const lines = results
    .map((line) => ({
      line,
      template: forceTemplate ?? resolveTemplate(line.pxk_loai_don, line.loai_file_xuat_misa, line.loai_de_xuat),
    }))
    .filter(({ line, template }) => {
      if (template !== "chuyen_kho" || !laTruCongNo(line.loai_de_xuat)) return true;
      boQuaTruCongNo.push({ so_phieu: line.pxk_ma_xuat_kho || line.pxk_id, ma_lk: line.ma_lk });
      return false;
    });

  // Mau "Ban hang" (phan hoi 2026-09-28 "cột Đơn giá sẽ điền đơn giá chưa tính 8% => đơn giá = (đơn giá
  // thực tế/108)*100"): "don gia thuc te" = tien dong do backend tinh (tinhToanPxk - CUNG nguon voi "Tiền
  // cần chuyển"/tien uoc tinh tung dong o man chi tiet PXK: gia chot neu co, khong thi gia theo loai chiet
  // khau) / SL. Truoc day lay COALESCE(gia_chot, gia_de_xuat) = GIA BAN GOC khi chua chot gia -> lech voi
  // tien KTV thuc chuyen. Chi tinh cho PXK co dong di mau ban_hang.
  const tienTheoDong = new Map<string, number>();
  const pxkBanHang = new Set(lines.filter((l) => l.template === "ban_hang").map((l) => l.line.pxk_id));
  for (const pxkId of pxkBanHang) {
    const dongIds = [...new Set(results.filter((r) => r.pxk_id === pxkId).map((r) => r.ddh_id))];
    const { tienUocTinhTheoDong } = await tinhToanPxk(db, dongIds);
    for (const [id, tien] of tienUocTinhTheoDong) tienTheoDong.set(id, tien);
  }
  const lam2 = (x: number) => Math.round(x * 100) / 100;

  for (const { line, template } of gopDongKhTraGop(lines, tienTheoDong)) {
    const mien = mienFromKhuVuc(line.ktv_khu_vuc_ma);
    // Kho phia CONG TY cua dong (Ban hang/Xuat kho: "Mã kho"; Chuyen kho: "Nhập tại kho"). LK "Máy" -> kho ky gui KRF
    // (Admin chua dien thi quay ve kho cong ty).
    const khoMayMien = mien && laPhanLoaiMay(line.don_vi) && !laTruCongNo(line.loai_de_xuat) ? khoMay[mien] : null;
    const kho = khoMayMien?.ma ? khoMayMien : mien ? khoBanHang[mien] : { ma: "", ten: "" };
    const ngayHachToan = fmtDateVN(line.pxk_ngay_tao);
    // KHONG con fallback ve ten_hien_thi/email (xem giai thich dau file) - de trong + canh bao neu thieu.
    const tenMisa = line.ktv_ten_misa || "";
    const maMisa = line.ktv_ma_misa || "";
    const tenHang = line.ten_lk || line.ma_lk;
    const soLuong = line.so_luong;
    // "TRẢ HÀNG CÔNG NỢ": moi cot tien = 0 (chot 2026-10-01).
    const tienBang0 = laTraHangCongNo(line.loai_de_xuat);
    const donGia = tienBang0 ? 0 : line.don_gia;
    const thanhTien = soLuong != null && donGia != null ? soLuong * donGia : null;
    const traHang = laDongTraHang(line) && mien ? KHO_NHAN_TRA[mien] : null;
    const dienGiaiCoDinh = traHang
      ? `${traHang.dienGiai} ${tenMisa || line.nguoi_nhan_hang || ""}`.trim()
      : laXuatMayDoiBaoHanh(line)
        ? dienGiaiXuatMay(tenMisa || maMisa || line.nguoi_nhan_hang || "", line)
        : null;

    if (line.nguoi_nhan_hang && (!maMisa || !tenMisa)) {
      const key = line.ktv_ma_ktv || line.nguoi_nhan_hang;
      if (!canhBaoThieuMisaMap.has(key)) {
        canhBaoThieuMisaMap.set(key, { ma_ktv: line.ktv_ma_ktv || line.nguoi_nhan_hang, ten_hien_thi: line.ktv_ten });
      }
    }

    if (template === "chuyen_kho") {
      // "Ve viec/Dien giai": dong tra hang dung cau co dinh theo mien (KHO_NHAN_TRA), con lai giu cong thuc cu.
      const veViecDienGiai = dienGiaiCoDinh ?? `${tenHang} xuất ${line.loai_de_xuat ?? ""} cho KTV ${tenMisa || line.nguoi_nhan_hang || ""}${
        line.ma_yeu_cau_su_co ? ` - case ${line.ma_yeu_cau_su_co}` : ""
      }`.trim();
      sheets.chuyen_kho.push({
        // SUA 2026-09-09: gia tri that trong file mau la "Xuất chuyển kho nội bộ" (truoc day sai thanh
        // "Xuất kho kiêm vận chuyển nội bộ").
        hinhThucChuyenKho: "Xuất chuyển kho nội bộ",
        ngayHachToan,
        ngayChungTu: ngayHachToan,
        soChungTu: line.pxk_ma_xuat_kho,
        veViecDienGiai,
        // SUA 2026-09-09: file mau de trong ca 2 cot nay (truoc day dien nham maMisa vao "Voi dai
        // ly/Ma don vi nhan").
        voiDaiLyMaDonViNhan: "",
        tenDaiLyTenDonViNhan: "",
        maNguoiVanChuyen: maMisa,
        tenNguoiVanChuyen: tenMisa,
        maHang: line.ma_lk,
        tenHang,
        laDongGhiChu: "Không",
        // SUA 2026-09-09 (dao lai huong, xac nhan nguoi dung "Đảo lại đúng theo mẫu"): "Xuất tại kho" =
        // kho ca nhan cua KTV/dai ly dang giu hang truoc khi tra (dung ma_misa lam proxy - he thong
        // KHONG theo doi ma kho vat ly rieng cho tung don vi ben ngoai nhu "NTMN" trong file mau that,
        // day la GAN DUNG TOT NHAT co the voi du lieu hien co), "Nhap tai kho" = kho cong ty theo mien.
        xuatTaiKho: traHang ? traHang.ma : maMisa,
        nhapTaiKho: kho.ma,
        tkNo: "157",
        tkCo: "156",
        dvt: "", // bo trong (chot 2026-10-01)
        soLuong,
        donGiaBan: donGia,
        thanhTien,
        donGiaVon: null,
        tienVon: null,
        truongMoRong: line.ma_yeu_cau_su_co || "",
      });
    } else {
      // template === "xuat_kho" | "ban_hang" - dung chung 1 bo cot "Don dat hang" (xem giai thich dau
      // file), chi khac cong thuc theo "Tinh gia thanh".
      const tinhGiaThanhCo = template === "ban_hang";
      // Dong "TRỪ CÔNG NỢ" (chot 2026-09-29): hang da nam o KHO CUA KTV -> tru tu kho KTV, khong tru kho cong ty theo
      // mien. Ma kho KTV tren MISA = ma MISA cua KTV (cung quy uoc "Xuất tại kho" cua mau Chuyen kho + ton kho KTV).
      const maKhoDong = traHang ? traHang.ma : laTruCongNo(line.loai_de_xuat) ? maMisa : kho.ma;
      // Dien giai theo loai de xuat (chot 2026-10-05, file "Diễn giải hệ thống misa.xlsx"); dong tra hang / xuat may doi bao
      // hanh (dienGiaiCoDinh) giu cau rieng. Ma MYC: Ma YCSC, khong co thi Ma Lada (don HỖ TRỢ bat buoc 1 trong 2).
      const ldx = line.loai_de_xuat;
      const tenNguoi = tenMisa || line.nguoi_nhan_hang || "";
      const maMyc = line.ma_yeu_cau_su_co || line.ma_lada;
      const theoMyc = maMyc ? `theo MYC ${maMyc}` : "";
      const hoTro0d = loaiHoTro0Dong(ldx);
      const ttKhachHang = motDong(line.tt_khach_hang);
      const maDuyet = motDong(line.tt_mail_duyet);
      const ghep = (...phan: string[]) => phan.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const dienGiai =
        dienGiaiCoDinh ??
        (laTruCongNo(ldx)
          ? // TRỪ CÔNG NỢ: "<ma kho KTV> xuất trừ kho kí gửi cho KTV <Tên MISA>"
            ghep(maKhoDong, "xuất trừ kho kí gửi cho KTV", tenNguoi)
          : tinhGiaThanhCo
            ? // Ban hang: "<kho> bán hàng <Tên MISA>" (+ " MDT" CHI don MUA DỰ TRỮ)
              ghep(maKhoDong, "bán hàng", tenNguoi, laMuaDuTru(ldx) ? "MDT" : "")
            : hoTro0d
              ? // HỖ TRỢ 0 ĐỒNG: "<kho> xuất hỗ trợ <trong/ngoài BH> <Tên MISA> theo MYC <mã> <TT KH> - <mã duyệt (TT+Mail duyệt)>";
                // KÊNH MT: "xuất hỗ trợ KINH DOANH KRF" thay cho trong/ngoai BH.
                ghep(maKhoDong, "xuất hỗ trợ", hoTro0d === "kenh_mt" ? "KINH DOANH KRF" : baoHanhTheoChinhSach(line.chinh_sach), tenNguoi, theoMyc, ttKhachHang, maDuyet ? `- ${maDuyet}` : "")
              : laDonCongNo(ldx)
                ? // ĐƠN CÔNG NỢ: "<kho> xuất ký gửi <Tên MISA> theo MYC <mã>"
                  ghep(maKhoDong, "xuất ký gửi", tenNguoi, theoMyc)
                : ghep(maKhoDong, "xuất", ldx ?? "", "cho", tenNguoi, line.ma_yeu_cau_su_co ? `theo MYC ${line.ma_yeu_cau_su_co}` : ""));
      // Cot "Người nhận hàng" don HỖ TRỢ 0 ĐỒNG (+ KÊNH MT): them TT khách hàng phia sau Ten MISA (chot 2026-10-05).
      const nguoiNhanHangCot = hoTro0d && ttKhachHang ? ghep(tenMisa, `(${ttKhachHang})`) : tenMisa;
      const phanTramThueGTGT = tinhGiaThanhCo ? 8 : 0;
      // Don gia CHUA thue 8% = don gia thuc te * 100 / 108 (lam tron 2 so le - cung do chinh xac voi Tien
      // thue GTGT); Thanh tien/Tien thue tinh lai tu don gia nay.
      const tienDong = tienTheoDong.get(line.ddh_id);
      const donGiaThucTe = tienBang0 ? 0 : tienDong != null && soLuong ? tienDong / soLuong : donGia;
      const donGiaChuaThue = donGiaThucTe != null ? lam2((donGiaThucTe * 100) / 108) : null;
      const thanhTienChuaThue = soLuong != null && donGiaChuaThue != null ? lam2(soLuong * donGiaChuaThue) : null;
      const row: DonDatHangRow = {
        ngayDonHang: ngayHachToan,
        soDonHang: line.pxk_ma_xuat_kho,
        tinhGiaThanh: tinhGiaThanhCo ? "Có" : "Không",
        maKhachHang: maMisa,
        tenKhachHang: tenMisa,
        nguoiNhanHang: nguoiNhanHangCot,
        dienGiai,
        maNhanVienBanHang: maMisa,
        maHang: line.ma_lk,
        tenHang,
        maKho: maKhoDong,
        dvt: "", // bo trong (chot 2026-10-01)
        soLuong,
        donGia: tinhGiaThanhCo ? donGiaChuaThue : null,
        thanhTien: tinhGiaThanhCo ? thanhTienChuaThue : null,
        phanTramThueGTGT,
        tienThueGTGT: tinhGiaThanhCo && thanhTienChuaThue != null ? lam2(thanhTienChuaThue * 0.08) : 0,
        truongMoRong1: line.ma_yeu_cau_su_co || "",
        truongMoRong2: line.tt_mail_duyet || "",
      };
      sheets[template].push(row);
    }
  }

  return { sheets, canhBaoThieuMisa: [...canhBaoThieuMisaMap.values()], boQuaTruCongNo };
}

// Tinh "mau MISA de xuat" cho 1 PXK de FE to mau noi bat dung 1 trong 3 nut tai (phan hoi 2026-09-10
// "nút tải nào được đề xuất sẽ tô màu nổi bật lên để người dùng biết nên tải file nào") - dung
// resolveTemplate() cho TUNG dong dat_don_hang trong PXK (giong dung logic buildMisaExportSheets dung
// khi KHONG forceTemplate), roi lay mau xuat hien NHIEU NHAT (1 PXK thuong chi gom cac dong CUNG loai
// de xuat/loai don nen hiem khi lech nhau, nhung van xu ly truong hop hiem gap mixed). Tra null neu PXK
// khong co dong nao (khong nen xay ra trong thuc te).
export async function resolveMisaTemplateDeXuat(env: Env, pxkId: string): Promise<MisaTemplate | null> {
  // FIX (2026-09-22): cung 1 fan-out do ten_option khong UNIQUE, xem giai thich day du o
  // buildMisaExportSheets - o day khong doi ket qua cuoi (dem nhan doi deu nhau khong doi thu tu max),
  // nhung sua theo cung 1 pattern subquery de tranh lap lai anti-pattern nay noi khac.
  const { results } = await env.DB.prepare(
    `SELECT pxk.loai_don as pxk_loai_don, ddh.loai_de_xuat,
       (SELECT loai_file_xuat_misa FROM settings_loai_de_xuat WHERE ten_option = ddh.loai_de_xuat LIMIT 1) as loai_file_xuat_misa
       FROM phieu_xuat_kho pxk
       JOIN phieu_xuat_kho_dong pxkd ON pxkd.phieu_xuat_kho_id = pxk.id
       JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
      WHERE pxk.id = ?`,
  )
    .bind(pxkId)
    .all<{ pxk_loai_don: RawLine["pxk_loai_don"]; loai_de_xuat: string | null; loai_file_xuat_misa: string | null }>();
  if (results.length === 0) return null;

  const counts = new Map<MisaTemplate, number>();
  for (const r of results) {
    const tpl = resolveTemplate(r.pxk_loai_don, r.loai_file_xuat_misa, r.loai_de_xuat);
    counts.set(tpl, (counts.get(tpl) ?? 0) + 1);
  }
  let best: MisaTemplate = "ban_hang";
  let bestCount = -1;
  for (const [tpl, count] of counts) {
    if (count > bestCount) {
      best = tpl;
      bestCount = count;
    }
  }
  return best;
}
