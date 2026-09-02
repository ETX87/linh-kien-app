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
import type { Env } from "../types";

export type MisaTemplate = "xuat_kho" | "chuyen_kho" | "ban_hang";

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
  maHang: string;
  tenHang: string;
  maKho: string;
  tkNo: string;
  tkCo: string;
  dvt: string;
  soLuong: number | null;
  donGia: number | null;
  thanhTien: number | null;
}

export interface ChuyenKhoRow {
  hinhThucChuyenKho: string;
  ngayHachToan: string;
  ngayChungTu: string;
  soChungTu: string;
  veViecDienGiai: string;
  voiDaiLyMaDonViNhan: string;
  tenDaiLyTenDonViNhan: string;
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
}

export interface BanHangRow {
  hinhThucBanHang: string;
  phuongThucThanhToan: string;
  kiemPhieuXuatKho: string;
  lapKemHoaDon: string;
  ngayHachToan: string;
  ngayChungTu: string;
  soChungTu: string;
  maKhachHang: string;
  tenKhachHang: string;
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
  loai_file_xuat_misa: string | null;
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
// goi ham nay (khong tu kiem tra scope o day).
export async function buildMisaExportSheets(db: Env["DB"], pxkIds: string[]): Promise<MisaExportSheets> {
  const sheets: MisaExportSheets = { xuat_kho: [], chuyen_kho: [], ban_hang: [] };
  if (pxkIds.length === 0) return sheets;

  const khoSettings = await loadKhoSettings(db);
  const placeholders = pxkIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT
         pxk.ma_xuat_kho as pxk_ma_xuat_kho, pxk.ngay_tao as pxk_ngay_tao, pxk.loai_don as pxk_loai_don,
         ddh.ma_lk, COALESCE(ddh.ten_lk_snapshot, lk.ten_linh_kien) as ten_lk, lk.don_vi,
         ddh.loai_de_xuat, COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) as so_luong,
         COALESCE(ddh.gia_chot, ddh.gia_de_xuat) as don_gia, ddh.ma_yeu_cau_su_co,
         sld.loai_file_xuat_misa,
         ktv.ten_hien_thi as ktv_ten, ktv.ma_misa as ktv_ma_misa, ktv.ten_misa as ktv_ten_misa, ktv.khu_vuc_ma as ktv_khu_vuc_ma,
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

  let sttXuatKho = 0;
  for (const line of results) {
    const template = resolveTemplate(line.pxk_loai_don, line.loai_file_xuat_misa);
    const mien = mienFromKhuVuc(line.ktv_khu_vuc_ma);
    const kho = mien ? khoSettings[mien] : { ma: "", ten: "" };
    const ngayHachToan = fmtDateVN(line.pxk_ngay_tao);
    const tenDoiTuong = line.ktv_ten_misa || line.ktv_ten || line.nguoi_nhan_hang || "";
    const maDoiTuong = line.ktv_ma_misa || "";
    const tenHang = line.ten_lk || line.ma_lk;
    const soLuong = line.so_luong;
    const donGia = line.don_gia;
    const thanhTien = soLuong != null && donGia != null ? soLuong * donGia : null;
    const lyDoXuat = `${tenHang} xuất ${line.loai_de_xuat ?? ""} cho KTV ${line.ktv_ten || line.nguoi_nhan_hang || ""}${
      line.ma_yeu_cau_su_co ? ` - case ${line.ma_yeu_cau_su_co}` : ""
    }`.trim();

    if (template === "xuat_kho") {
      sttXuatKho += 1;
      sheets.xuat_kho.push({
        stt: sttXuatKho,
        loaiXuatKho: "Xuất kho bán hàng",
        ngayHachToan,
        ngayChungTu: ngayHachToan,
        soChungTu: line.pxk_ma_xuat_kho,
        maDoiTuong,
        tenDoiTuong,
        nguoiNhan: line.ktv_ten || "",
        lyDoXuat,
        maNhanVienBanHang: line.ktv_ten || "",
        maHang: line.ma_lk,
        tenHang,
        maKho: kho.ma,
        tkNo: "1541.02",
        tkCo: "157",
        dvt: line.don_vi || "",
        soLuong,
        donGia,
        thanhTien,
      });
    } else if (template === "chuyen_kho") {
      sheets.chuyen_kho.push({
        hinhThucChuyenKho: "Xuất kho kiêm vận chuyển nội bộ",
        ngayHachToan,
        ngayChungTu: ngayHachToan,
        soChungTu: line.pxk_ma_xuat_kho,
        veViecDienGiai: lyDoXuat,
        voiDaiLyMaDonViNhan: maDoiTuong,
        tenDaiLyTenDonViNhan: tenDoiTuong,
        maHang: line.ma_lk,
        tenHang,
        xuatTaiKho: kho.ma,
        nhapTaiKho: maDoiTuong,
        tkNo: "157",
        tkCo: "156",
        dvt: line.don_vi || "",
        soLuong,
        donGiaBan: donGia,
        thanhTien,
      });
    } else {
      sheets.ban_hang.push({
        hinhThucBanHang: "Bán hàng hóa trong nước",
        phuongThucThanhToan: "Chưa thu tiền",
        kiemPhieuXuatKho: "Có",
        lapKemHoaDon: "Có",
        ngayHachToan,
        ngayChungTu: ngayHachToan,
        soChungTu: line.pxk_ma_xuat_kho,
        maKhachHang: maDoiTuong,
        tenKhachHang: tenDoiTuong,
        lyDoXuat,
        maHang: line.ma_lk,
        tenHang,
        tkNo: "131",
        tkCo: "5111.01",
        dvt: line.don_vi || "",
        soLuong,
        donGia,
        thanhTien,
        maKho: kho.ma,
        tkGiaVon: "632",
        tkKho: "1561",
      });
    }
  }

  return sheets;
}
