// Xuat du lieu Phieu xuat kho (PXK) sang 3 mau import MISA AMIS Accounting (Xuat kho bao hanh/
// Chuyen kho/Ban hang - xem file mau nguoi dung gui "Mau xuat nhap kho.xls"). Quyet dinh thiet ke
// (xac nhan qua 2 vong AskUserQuestion 2026-09-02, KHONG tu doan):
//   - loai_don='cong_no' HOAC 'tra_hang' -> LUON mau "Chuyen kho".
//   - loai_don='mua' -> tra cuu settings_loai_de_xuat.loai_file_xuat_misa theo dung dong loai_de_xuat
//     cua TUNG DONG dat_don_hang (KHONG phai theo ca PXK - 1 PXK van co the gom nhieu dong khac
//     loai_de_xuat nhau nen co the phai tach ra nhieu sheet/mau trong CUNG 1 lan xuat) - null/chua cau
//     hinh -> mac dinh 'ban_hang'.
// TK No/TK Co MOI mau CO DINH theo dung file mau (xac nhan "Cố định theo mẫu như file mẫu"), khong
// doc tu dau ra vi he thong khong co khai niem tai khoan ke toan rieng cho tung dong.
// Mien Bac/Nam suy tu ktv_lien_he.khu_vuc_ma cua nguoi_nhan_hang (chua "MB"=Bac, chua "MN"=Nam) de
// chon Ma kho/Ten kho mac dinh (settings admin tu dien, xem app_settings misa_ma_kho_mien_*).
//
// SUA (phan hoi 2026-09-02 "mỗi pxk cho phép chọn cả 3 mẫu để tải về được không?"): ngoai template
// tu dong (resolveTemplate), them tham so forceTemplate cho buildMisaExportSheets - khi TN/Ke toan
// bam 1 trong 3 nut "Xuất kho/Chuyển kho/Bán hàng" o UI, TOAN BO dong cua PXK duoc EP vao DUNG 1
// mau da chon (bo qua resolveTemplate), theo dung xac nhan cua nguoi dung ("ép toàn bộ dòng theo
// mẫu đã chọn"). Khong truyen forceTemplate (vd goi truc tiep API) van giu hanh vi tu dong cu.
//
// SUA LON (phan hoi 2026-09-04, ra soat chi tiet tung cot ca 3 mau): nhieu cot truoc day dien SAI/de
// trong - xem tung diem sua ben duoi tai noi dung. Diem chung quan trong nhat: "Ma doi tuong/Ma nguoi
// van chuyen/Ma khach hang/Ma nhan vien ban hang" PHAI la ktv.ma_misa (ma so MISA that), "Ten doi
// tuong/Ten nguoi van chuyen/Ten khach hang/Nguoi nhan" PHAI la ktv.ten_misa (ten tren MISA) - KHONG
// con fallback ve ten_hien_thi/email nhu truoc (fallback che mat truong hop KTV chua khai bao ma_misa/
// ten_misa, ke toan se import nham "chinh email tho"/"ten noi bo" vao MISA ma khong biet). Thay vao
// do buildMisaExportSheets tra THEM danh sach "canhBaoThieuMisa" (cac KTV dang xuat hien trong file
// nhung thieu ma_misa hoac ten_misa) de FE hien canh bao ro rang luc tai file (xem
// routes/phieuXuatKho.ts + frontend PhieuXuatKhoTab.tsx).
import type { Env } from "../types";
import { lookupCases } from "./caseLookupClient";

export const MISA_TEMPLATES = ["xuat_kho", "chuyen_kho", "ban_hang"] as const;
export type MisaTemplate = (typeof MISA_TEMPLATES)[number];

export interface XuatKhoRow {
  stt: number;
  loaiXuatKho: string;
  ngayHachToan: string;
  ngayChungTu: string;
  soChungTu: string;
  maDoiTuong: string;
  tenDoiTuong: string;
  nguoiNhan: string;
  lyDoXuat: string;
  maNhanVienBanHang: string;
  soChungTuKemTheo: number;
  maHang: string;
  tenHang: string;
  maKho: string;
  tkNo: string;
  tkCo: string;
  dvt: string;
  soLuong: number | null;
  donGia: number | null;
  thanhTien: number | null;
  truongMoRong: string;
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
  xuatTaiKho: string;
  nhapTaiKho: string;
  tkNo: string;
  tkCo: string;
  dvt: string;
  soLuong: number | null;
  donGiaBan: number | null;
  thanhTien: number | null;
  truongMoRong: string;
}

export interface BanHangRow {
  hinhThucBanHang: string;
  phuongThucThanhToan: string;
  kiemPhieuXuatKho: string;
  lapKemHoaDon: string;
  daLapHoaDon: string;
  ngayHachToan: string;
  ngayChungTu: string;
  soChungTu: string;
  maKhachHang: string;
  tenKhachHang: string;
  dienGiaiLyDoNop: string;
  lyDoXuat: string;
  maHang: string;
  tenHang: string;
  tkNo: string;
  tkCo: string;
  dvt: string;
  soLuong: number | null;
  donGia: number | null;
  thanhTien: number | null;
  maKho: string;
  tkGiaVon: string;
  tkKho: string;
}

export interface MisaExportSheets {
  xuat_kho: XuatKhoRow[];
  chuyen_kho: ChuyenKhoRow[];
  ban_hang: BanHangRow[];
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
  // "trang_thai_chuyen_tien" (them 2026-09-04) - dung de suy ra "Phuong thuc thanh toan" cua mau
  // Ban hang: 'TN da duyet' nghia la TN da xac nhan KTV chuyen tien xong (xem CLAUDE.md/PhieuXuatKhoTab).
  pxk_trang_thai_chuyen_tien: string | null;
  ma_lk: string;
  ten_lk: string | null;
  don_vi: string | null;
  loai_de_xuat: string | null;
  // "yeu_cau_hoa_don" (them 2026-09-04) - dung cho "Lap kem hoa don"/"Da lap hoa don" cua mau Ban hang.
  yeu_cau_hoa_don: string | null;
  so_luong: number | null;
  don_gia: number | null;
  ma_yeu_cau_su_co: string | null;
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

// SUA 2026-09-04: "Ma kho" cua mau Xuat kho la 1 he ma KHAC han (vd "LKKGMB"/"LKKGMN") voi "Ma kho"
// cua Ban hang/Chuyen kho (vd "6803"/"6804", dung chung 1 cap key cu) - tach rieng 2 cap key trong
// app_settings, KHONG dung chung nhu truoc (truoc day 1 cap key bi dung sai cho ca 3 mau).
async function loadKhoSettings(db: Env["DB"]): Promise<{
  banHang: Record<"bac" | "nam", { ma: string; ten: string }>;
  xuatKho: Record<"bac" | "nam", { ma: string }>;
}> {
  const { results } = await db
    .prepare("SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?, ?, ?)")
    .bind(
      "misa_ma_kho_mien_bac", "misa_ten_kho_mien_bac", "misa_ma_kho_mien_nam", "misa_ten_kho_mien_nam",
      "misa_ma_kho_xk_mien_bac", "misa_ma_kho_xk_mien_nam",
    )
    .all<{ key: string; value: string }>();
  const map = new Map(results.map((r) => [r.key, r.value]));
  return {
    banHang: {
      bac: { ma: map.get("misa_ma_kho_mien_bac") || "", ten: map.get("misa_ten_kho_mien_bac") || "" },
      nam: { ma: map.get("misa_ma_kho_mien_nam") || "", ten: map.get("misa_ten_kho_mien_nam") || "" },
    },
    xuatKho: {
      bac: { ma: map.get("misa_ma_kho_xk_mien_bac") || "" },
      nam: { ma: map.get("misa_ma_kho_xk_mien_nam") || "" },
    },
  };
}

// "Kiem phieu xuat kho" = "Khong" khi dong la Tra hang/Tru cong no (cung kieu kiem tra substring voi
// deriveLoaiDon o frontend/backend datMuaLinhKien.ts) - chi co the xay ra khi TN dung forceTemplate ep
// nguyen PXK ve mau Ban hang du co dong tra_hang/cong_no (binh thuong resolveTemplate da tu chuyen
// nhung dong nay sang Chuyen kho).
function laTraHangHoacTruCongNo(loaiDeXuat: string | null): boolean {
  const s = (loaiDeXuat ?? "").toUpperCase();
  return s.includes("TRẢ HÀNG") || s.includes("TRỪ CÔNG NỢ");
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
  const khoSettings = await loadKhoSettings(db);
  const placeholders = pxkIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT
         pxk.ma_xuat_kho as pxk_ma_xuat_kho, pxk.ngay_tao as pxk_ngay_tao, pxk.loai_don as pxk_loai_don,
         pxk.trang_thai_chuyen_tien as pxk_trang_thai_chuyen_tien,
         ddh.ma_lk, COALESCE(ddh.ten_lk_snapshot, lk.ten_linh_kien) as ten_lk, lk.don_vi,
         ddh.loai_de_xuat, ddh.yeu_cau_hoa_don, COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) as so_luong,
         COALESCE(ddh.gia_chot, ddh.gia_de_xuat) as don_gia, ddh.ma_yeu_cau_su_co,
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

  // Xac dinh template cho TUNG dong TRUOC (can biet dong nao roi vao "xuat_kho" de gom ma_yeu_cau_su_co
  // can tra Serial - xem lib/caseLookupClient.ts) - tranh goi lookupCases() thua cho cac dong khong
  // dung sheet Xuat kho.
  const lines = results.map((line) => ({
    line,
    template: forceTemplate ?? resolveTemplate(line.pxk_loai_don, line.loai_file_xuat_misa),
  }));
  const caseIdsCanTraSerial = [...new Set(
    lines.filter((x) => x.template === "xuat_kho" && x.line.ma_yeu_cau_su_co).map((x) => x.line.ma_yeu_cau_su_co!),
  )];
  const serialMap = caseIdsCanTraSerial.length > 0 ? await lookupCases(caseIdsCanTraSerial, env) : new Map();

  let sttXuatKho = 0;
  for (const { line, template } of lines) {
    const mien = mienFromKhuVuc(line.ktv_khu_vuc_ma);
    const khoBanHang = mien ? khoSettings.banHang[mien] : { ma: "", ten: "" };
    const khoXuatKho = mien ? khoSettings.xuatKho[mien] : { ma: "" };
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

    if (template === "xuat_kho") {
      sttXuatKho += 1;
      const serial = line.ma_yeu_cau_su_co ? serialMap.get(line.ma_yeu_cau_su_co)?.seri_san_pham || "" : "";
      // "Ly do xuat" mau Xuat kho (SUA 2026-09-04, cong thuc RIENG khac han Chuyen kho/Ban hang):
      // "Ma kho" + "xuất kho bảo hành" + "Tên hàng" + "cho KTV" + "tên misa ktv" + Serial (tu case).
      const lyDoXuatKho = [khoXuatKho.ma, "xuất kho bảo hành", tenHang, "cho KTV", tenMisa, serial]
        .filter((s) => s)
        .join(" ");
      sheets.xuat_kho.push({
        stt: sttXuatKho,
        loaiXuatKho: "Xuất kho bán hàng",
        ngayHachToan,
        ngayChungTu: ngayHachToan,
        soChungTu: line.pxk_ma_xuat_kho,
        maDoiTuong: maMisa,
        tenDoiTuong: tenMisa,
        nguoiNhan: tenMisa,
        lyDoXuat: lyDoXuatKho,
        maNhanVienBanHang: maMisa,
        soChungTuKemTheo: 1,
        maHang: line.ma_lk,
        tenHang,
        maKho: khoXuatKho.ma,
        tkNo: "1541.02",
        tkCo: "157",
        dvt: line.don_vi || "",
        soLuong,
        donGia,
        thanhTien,
        truongMoRong: serial,
      });
    } else if (template === "chuyen_kho") {
      // "Ve viec/Dien giai" mau Chuyen kho: GIU NGUYEN cong thuc cu (chua co yeu cau doi rieng) -
      // khac "Ly do xuat" cua Xuat kho o tren.
      const veViecDienGiai = `${tenHang} xuất ${line.loai_de_xuat ?? ""} cho KTV ${tenMisa || line.nguoi_nhan_hang || ""}${
        line.ma_yeu_cau_su_co ? ` - case ${line.ma_yeu_cau_su_co}` : ""
      }`.trim();
      sheets.chuyen_kho.push({
        hinhThucChuyenKho: "Xuất kho kiêm vận chuyển nội bộ",
        ngayHachToan,
        ngayChungTu: ngayHachToan,
        soChungTu: line.pxk_ma_xuat_kho,
        veViecDienGiai,
        voiDaiLyMaDonViNhan: maMisa,
        // "Ten dai ly/ Ten don vi nhan" = "" (SUA 2026-09-04, truoc day dien nham tenMisa).
        tenDaiLyTenDonViNhan: "",
        maNguoiVanChuyen: maMisa,
        tenNguoiVanChuyen: tenMisa,
        maHang: line.ma_lk,
        tenHang,
        xuatTaiKho: khoBanHang.ma,
        nhapTaiKho: maMisa,
        tkNo: "157",
        tkCo: "156",
        dvt: line.don_vi || "",
        soLuong,
        donGiaBan: donGia,
        thanhTien,
        truongMoRong: line.ma_yeu_cau_su_co || "",
      });
    } else {
      // "Phuong thuc thanh toan" (SUA 2026-09-04): 'TN da duyet' = TN da xac nhan KTV chuyen tien xong.
      const phuongThucThanhToan = line.pxk_trang_thai_chuyen_tien === "TN da duyet" ? "Thu tiền ngay - Chuyển khoản" : "Chưa thu tiền";
      // "Kiem phieu xuat kho" (SUA 2026-09-04): "Khong" cho dong Tra hang/Tru cong no (chi xay ra khi
      // TN ep template Ban hang cho ca PXK - xem laTraHangHoacTruCongNo).
      const kiemPhieuXuatKho = laTraHangHoacTruCongNo(line.loai_de_xuat) ? "Không" : "Có";
      // "Lap kem hoa don"/"Da lap hoa don" (SUA 2026-09-04): dua theo "Yeu cau hoa don" KTV chon luc
      // tao don (xem YEU_CAU_HOA_DON_OPTIONS[0] = "Không" o frontend).
      const coHoaDon = !!line.yeu_cau_hoa_don && line.yeu_cau_hoa_don !== "Không";
      // "Dien giai/Ly do nop" VA "Ly do xuat" cua Ban hang (SUA 2026-09-04, xac nhan nguoi dung: CA 2
      // cot cung 1 gia tri moi, thay the hoan toan cong thuc cu) = "Ma kho" + "bán hàng cho" + tenMisa.
      const lyDoBanHang = [khoBanHang.ma, "bán hàng cho", tenMisa].filter((s) => s).join(" ");
      sheets.ban_hang.push({
        hinhThucBanHang: "Bán hàng hóa trong nước",
        phuongThucThanhToan,
        kiemPhieuXuatKho,
        lapKemHoaDon: coHoaDon ? "Có" : "Không",
        daLapHoaDon: coHoaDon ? "Đã lập" : "Chưa lập",
        ngayHachToan,
        ngayChungTu: ngayHachToan,
        soChungTu: line.pxk_ma_xuat_kho,
        maKhachHang: maMisa,
        tenKhachHang: tenMisa,
        dienGiaiLyDoNop: lyDoBanHang,
        lyDoXuat: lyDoBanHang,
        maHang: line.ma_lk,
        tenHang,
        tkNo: "131",
        tkCo: "5111.01",
        dvt: line.don_vi || "",
        soLuong,
        donGia,
        thanhTien,
        maKho: khoBanHang.ma,
        tkGiaVon: "632",
        tkKho: "1561",
      });
    }
  }

  return { sheets, canhBaoThieuMisa: [...canhBaoThieuMisaMap.values()] };
}
