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
}

interface RawLine {
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
  tt_mail_duyet: string | null;
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

function resolveTemplate(loaiDon: RawLine["pxk_loai_don"], loaiFileXuatMisa: string | null): MisaTemplate {
  if (loaiDon === "cong_no" || loaiDon === "tra_hang") return "chuyen_kho";
  if (loaiFileXuatMisa === "chuyen_kho" || loaiFileXuatMisa === "xuat_kho") return loaiFileXuatMisa;
  return "ban_hang";
}

function mienFromKhuVuc(khuVucMa: string | null): "bac" | "nam" | null {
  if (!khuVucMa) return null;
  if (khuVucMa.includes("MB")) return "bac";
  if (khuVucMa.includes("MN")) return "nam";
  return null;
}

async function loadKhoSettings(db: Env["DB"]): Promise<Record<"bac" | "nam", { ma: string; ten: string }>> {
  const { results } = await db
    .prepare("SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?)")
    .bind("misa_ma_kho_mien_bac", "misa_ten_kho_mien_bac", "misa_ma_kho_mien_nam", "misa_ten_kho_mien_nam")
    .all<{ key: string; value: string }>();
  const map = new Map(results.map((r) => [r.key, r.value]));
  return {
    bac: { ma: map.get("misa_ma_kho_mien_bac") || "", ten: map.get("misa_ten_kho_mien_bac") || "" },
    nam: { ma: map.get("misa_ma_kho_mien_nam") || "", ten: map.get("misa_ten_kho_mien_nam") || "" },
  };
}

// Doc TAT CA dong dat_don_hang thuoc danh sach PXK (pxkIds) kem thong tin can de xuat MISA. Dung
// chung cho ca xuat 1 PXK va xuat gop nhieu PXK (bulk) - caller tu kiem tra quyen xem PXK truoc khi
// goi ham nay (khong tu kiem tra scope o day). forceTemplate: neu co, EP TOAN BO dong vao dung 1
// mau nay (bo qua resolveTemplate) - xem giai thich o comment dau file.
export async function buildMisaExportSheets(env: Env, pxkIds: string[], forceTemplate?: MisaTemplate): Promise<MisaExportResult> {
  const sheets: MisaExportSheets = { xuat_kho: [], chuyen_kho: [], ban_hang: [] };
  const canhBaoThieuMisaMap = new Map<string, { ma_ktv: string; ten_hien_thi: string | null }>();
  if (pxkIds.length === 0) return { sheets, canhBaoThieuMisa: [] };

  const db = env.DB;
  const khoBanHang = await loadKhoSettings(db);
  const placeholders = pxkIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT
         pxk.ma_xuat_kho as pxk_ma_xuat_kho, pxk.ngay_tao as pxk_ngay_tao, pxk.loai_don as pxk_loai_don,
         ddh.ma_lk, COALESCE(ddh.ten_lk_snapshot, lk.ten_linh_kien) as ten_lk, lk.don_vi,
         ddh.loai_de_xuat, COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) as so_luong,
         COALESCE(ddh.gia_chot, ddh.gia_de_xuat) as don_gia, ddh.ma_yeu_cau_su_co, ddh.tt_mail_duyet,
         sld.loai_file_xuat_misa,
         ktv.ma_ktv as ktv_ma_ktv, ktv.ten_hien_thi as ktv_ten, ktv.ma_misa as ktv_ma_misa, ktv.ten_misa as ktv_ten_misa, ktv.khu_vuc_ma as ktv_khu_vuc_ma,
         pxk.nguoi_nhan_hang
       FROM phieu_xuat_kho pxk
       JOIN phieu_xuat_kho_dong pxkd ON pxkd.phieu_xuat_kho_id = pxk.id
       JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
       LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
       LEFT JOIN settings_loai_de_xuat sld ON sld.ten_option = ddh.loai_de_xuat
       LEFT JOIN ktv_lien_he ktv ON ktv.email_dang_nhap = pxk.nguoi_nhan_hang
       WHERE pxk.id IN (${placeholders})
       ORDER BY pxk.ngay_tao, pxk.id, ddh.id`,
    )
    .bind(...pxkIds)
    .all<RawLine>();

  // Xac dinh template cho TUNG dong TRUOC (bo cot "Don dat hang" moi khong co cot Serial rieng nhu mau
  // "Xuat kho" cu - xem DonDatHangRow - nen KHONG con can goi lookupCases() o day).
  const lines = results.map((line) => ({
    line,
    template: forceTemplate ?? resolveTemplate(line.pxk_loai_don, line.loai_file_xuat_misa),
  }));

  for (const { line, template } of lines) {
    const mien = mienFromKhuVuc(line.ktv_khu_vuc_ma);
    const kho = mien ? khoBanHang[mien] : { ma: "", ten: "" };
    const ngayHachToan = fmtDateVN(line.pxk_ngay_tao);
    // KHONG con fallback ve ten_hien_thi/email (xem giai thich dau file) - de trong + canh bao neu thieu.
    const tenMisa = line.ktv_ten_misa || "";
    const maMisa = line.ktv_ma_misa || "";
    const tenHang = line.ten_lk || line.ma_lk;
    const soLuong = line.so_luong;
    const donGia = line.don_gia;
    const thanhTien = soLuong != null && donGia != null ? soLuong * donGia : null;

    if (line.nguoi_nhan_hang && (!maMisa || !tenMisa)) {
      const key = line.ktv_ma_ktv || line.nguoi_nhan_hang;
      if (!canhBaoThieuMisaMap.has(key)) {
        canhBaoThieuMisaMap.set(key, { ma_ktv: line.ktv_ma_ktv || line.nguoi_nhan_hang, ten_hien_thi: line.ktv_ten });
      }
    }

    if (template === "chuyen_kho") {
      // "Ve viec/Dien giai": giu nguyen cong thuc cu (chua co yeu cau doi rieng).
      const veViecDienGiai = `${tenHang} xuất ${line.loai_de_xuat ?? ""} cho KTV ${tenMisa || line.nguoi_nhan_hang || ""}${
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
        xuatTaiKho: maMisa,
        nhapTaiKho: kho.ma,
        tkNo: "157",
        tkCo: "156",
        dvt: line.don_vi || "",
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
      const dienGiai = tinhGiaThanhCo
        ? `${kho.ma} bán hàng ${tenMisa || line.nguoi_nhan_hang || ""}`.trim()
        : `${kho.ma} xuất ${line.loai_de_xuat ?? ""} cho ${tenMisa || line.nguoi_nhan_hang || ""}${
            line.ma_yeu_cau_su_co ? ` theo MYC ${line.ma_yeu_cau_su_co}` : ""
          }`.replace(/\s+/g, " ").trim();
      const phanTramThueGTGT = tinhGiaThanhCo ? 8 : 0;
      const row: DonDatHangRow = {
        ngayDonHang: ngayHachToan,
        soDonHang: line.pxk_ma_xuat_kho,
        tinhGiaThanh: tinhGiaThanhCo ? "Có" : "Không",
        maKhachHang: maMisa,
        tenKhachHang: tenMisa,
        nguoiNhanHang: tenMisa,
        dienGiai,
        maNhanVienBanHang: maMisa,
        maHang: line.ma_lk,
        tenHang,
        maKho: kho.ma,
        dvt: line.don_vi || "",
        soLuong,
        donGia: tinhGiaThanhCo ? donGia : null,
        thanhTien: tinhGiaThanhCo ? thanhTien : null,
        phanTramThueGTGT,
        tienThueGTGT: tinhGiaThanhCo && thanhTien != null ? Math.round(thanhTien * 0.08 * 100) / 100 : 0,
        truongMoRong1: line.ma_yeu_cau_su_co || "",
        truongMoRong2: line.tt_mail_duyet || "",
      };
      sheets[template].push(row);
    }
  }

  return { sheets, canhBaoThieuMisa: [...canhBaoThieuMisaMap.values()] };
}
