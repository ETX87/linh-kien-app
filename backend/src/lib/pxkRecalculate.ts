import { computeMocDuPhongHienTai } from "./duPhongKtv";
import { nowVN } from "./vnTime";

export type MaChietKhau = "KHONG_CK" | "DINH_TU" | "TONG_200_500" | "GIA_KTV" | "GIA_DU_PHONG" | "CONG_NO";

export interface PxkCalculation {
  total: number;
  maTheoDong: Map<string, MaChietKhau | null>;
  tienUocTinhTheoDong: Map<string, number>;
}

interface CalculationRow {
  id: string;
  so_luong_de_xuat: number;
  so_luong_thuc_xuat: number | null;
  loai_de_xuat: string | null;
  loai_don: string | null;
  nguoi_nhan_hang: string | null;
  so_tien_cong_no: number | null;
  gia_de_xuat: number | null;
  gia_chot: number | null;
  gia_ban: number | null;
  gia_tri_cong_no: number | null;
  gia_du_phong: number | null;
  don_vi: string | null;
}

// Chot nguoi dung 2026-09-28: PXK cong_no mac dinh tien can chuyen = 0, RIENG dong loai de xuat "TRỪ CÔNG
// NỢ..." (TRỪ CÔNG NỢ / TG12-NSKX / TG12-NPP) van phai chuyen tien - tinh gia NHU DON MUA (gia chot ->
// gia de xuat -> gia ban x SL thuc xuat) va di du quy trinh chuyen tien/chan chuyen buoc nhu PXK mua.
// Cac dong cong_no con lai (CÔNG NỢ/HỖ TRỢ/THẺ BẢO HÀNH) chi hien so_tien_cong_no, khong cong vao tong.
export function laTruCongNo(loaiDeXuat: string | null | undefined): boolean {
  return (loaiDeXuat ?? "").toUpperCase().includes("TRỪ CÔNG NỢ");
}

// Nhan hien thi khop CHUYEN_TIEN_OPTIONS (frontend constants.ts) - "TN da duyet" hien la Ke toan da duyet.
const NHAN_CHUYEN_TIEN: Record<string, string> = { "KTV da chuyen": "KTV đã chuyển", "TN da duyet": "Kế toán đã duyệt" };

function soLuongTinhTien(row: CalculationRow): number {
  return row.so_luong_thuc_xuat ?? row.so_luong_de_xuat;
}

export async function tinhToanPxk(db: D1Database, datDonHangIds: string[]): Promise<PxkCalculation> {
  const maTheoDong = new Map<string, MaChietKhau | null>();
  const tienUocTinhTheoDong = new Map<string, number>();
  if (datDonHangIds.length === 0) return { total: 0, maTheoDong, tienUocTinhTheoDong };

  const placeholders = datDonHangIds.map(() => "?").join(", ");
  const { results } = await db.prepare(
    `SELECT ddh.id, ddh.so_luong_de_xuat, ddh.so_luong_thuc_xuat, ddh.loai_de_xuat, ddh.loai_don,
            ddh.nguoi_nhan_hang, ddh.so_tien_cong_no, ddh.gia_de_xuat, ddh.gia_chot,
            lk.gia_ban, lk.gia_tri_cong_no, lk.gia_du_phong, lk.don_vi
     FROM dat_don_hang ddh LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
     WHERE ddh.id IN (${placeholders})`,
  ).bind(...datDonHangIds).all<CalculationRow>();

  const maTheoLoaiDon = (row: CalculationRow, ma: MaChietKhau): MaChietKhau | null =>
    row.loai_don === "tra_hang" ? null : row.loai_don === "cong_no" ? "CONG_NO" : ma;
  const setTien = (row: CalculationRow, amount: number): number => {
    const rounded = Math.round(amount);
    tienUocTinhTheoDong.set(row.id, rounded);
    return rounded;
  };

  let total = 0;
  const duTruByKtv = new Map<string, CalculationRow[]>();
  for (const row of results) {
    if (row.loai_don === "tra_hang") {
      maTheoDong.set(row.id, null);
      setTien(row, 0);
      continue;
    }
    if (row.loai_don === "cong_no" && laTruCongNo(row.loai_de_xuat)) {
      total += setTien(row, (row.gia_chot ?? row.gia_de_xuat ?? row.gia_ban ?? 0) * soLuongTinhTien(row));
      maTheoDong.set(row.id, "KHONG_CK");
      continue;
    }
    if (row.loai_don === "cong_no") {
      maTheoDong.set(row.id, "CONG_NO");
      setTien(row, row.so_tien_cong_no ?? 0);
      continue;
    }

    const isDuTru = (row.loai_de_xuat ?? "").trim().toUpperCase() === "MUA DỰ TRỮ";
    if (!isDuTru) {
      const amount = (row.gia_chot ?? row.gia_de_xuat ?? row.gia_ban ?? 0) * soLuongTinhTien(row);
      total += setTien(row, amount);
      maTheoDong.set(row.id, maTheoLoaiDon(row, "KHONG_CK"));
      continue;
    }
    const email = row.nguoi_nhan_hang ?? "";
    if (!duTruByKtv.has(email)) duTruByKtv.set(email, []);
    duTruByKtv.get(email)!.push(row);
  }

  for (const [email, duTruRows] of duTruByKtv) {
    const dinhTu = duTruRows.filter((row) => row.don_vi === "Đình tủ");
    const khac = duTruRows.filter((row) => row.don_vi !== "Đình tủ");
    const giaTriNhom = duTruRows.reduce((sum, row) => sum + (row.gia_ban ?? 0) * soLuongTinhTien(row), 0);

    for (const row of dinhTu) {
      const donGia = row.gia_chot ?? (row.gia_ban ?? 0) * 0.85;
      const amount = donGia * soLuongTinhTien(row);
      total += setTien(row, amount);
      maTheoDong.set(row.id, maTheoLoaiDon(row, "DINH_TU"));
    }
    if (khac.length === 0) continue;

    const giaKtvHieuLuc = (row: CalculationRow) =>
      giaTriNhom < 200000 ? (row.gia_ban ?? 0) : giaTriNhom < 500000 ? (row.gia_ban ?? 0) * 0.7 : (row.gia_tri_cong_no ?? 0);
    const maKtvHieuLuc: MaChietKhau = giaTriNhom < 200000 ? "KHONG_CK" : giaTriNhom < 500000 ? "TONG_200_500" : "GIA_KTV";
    const giaDuPhong = khac.reduce((sum, row) => sum + (row.gia_du_phong ?? 0) * soLuongTinhTien(row), 0);
    const ktvRow = email
      ? await db.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE email_dang_nhap = ?").bind(email).first<{ ma_ktv: string }>()
      : null;
    // Loai tru CHINH cac dong dang xet khoi "da dung" (tranh dem trung, xem computeMocDuPhongHienTai).
    // Dong Dinh tu cua phieu van tinh la "da dung" vi khong nam trong G_dp dem ra so sanh.
    const mocKhaDung = ktvRow ? await computeMocDuPhongHienTai(db, ktvRow.ma_ktv, khac.map((row) => row.id)) : 0;
    // FIX 2026-09-28: truoc day LK chua co gia du phong -> giaDuPhong = 0 <= moc -> "du du phong" -> tinh
    // 0d. Chi dung gia du phong khi MOI dong (tru Dinh tu) deu co gia du phong > 0 VA moc du; thieu 1 dong
    // -> ca nhom ve gia KTV/nguong 200k-500k (giu nguyen tac "theo ca phieu, khong chia tung dong").
    const duGiaDuPhong = khac.every((row) => (row.gia_du_phong ?? 0) > 0);
    const dungDuPhong = duGiaDuPhong && mocKhaDung >= giaDuPhong;

    for (const row of khac) {
      const donGia = row.gia_chot ?? (dungDuPhong ? (row.gia_du_phong ?? 0) : giaKtvHieuLuc(row));
      const amount = donGia * soLuongTinhTien(row);
      total += setTien(row, amount);
      maTheoDong.set(row.id, maTheoLoaiDon(row, dungDuPhong ? "GIA_DU_PHONG" : maKtvHieuLuc));
    }
  }

  return { total, maTheoDong, tienUocTinhTheoDong };
}

// Tinh lai loai chiet khau + tong tien can chuyen cua 1 PXK tu TOAN BO dong hien co.
// - datLaiThuCong: true CHI khi thanh phan phieu doi (them/bo dong) - ghi de ca loai TN da chon tay.
// - capNhatTongTien: false = chi gan nhan (backfill loai chiet khau), khong dung toi tien.
// - nguoiXuLy: co thi ghi 1 dong log "Da sua tong tien can chuyen" khi tong doi (de lai vet vi tong
//   doi se RESET chuyen tien ve "Cho KTV chuyen" + xoa bang chung - chot nguoi dung 2026-09-28).
// Tong tien CHI duoc sua khi PXK con "Dang tao phieu" - phieu da qua buoc khong bao gio doi tien.
export async function taiTinhPxk(
  db: D1Database,
  pxkId: string,
  datLaiThuCong = false,
  capNhatTongTien = true,
  nguoiXuLy?: string,
): Promise<PxkCalculation> {
  const pxk = await db.prepare(
    "SELECT loai_don, so_tien_can_chuyen, trang_thai_chuyen_tien, trang_thai_hien_tai FROM phieu_xuat_kho WHERE id = ?",
  ).bind(pxkId).first<{
    loai_don: string | null; so_tien_can_chuyen: number | null; trang_thai_chuyen_tien: string | null; trang_thai_hien_tai: string | null;
  }>();
  if (!pxk) return { total: 0, maTheoDong: new Map(), tienUocTinhTheoDong: new Map() };

  const { results: dong } = await db.prepare(
    "SELECT dat_don_hang_id FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?",
  ).bind(pxkId).all<{ dat_don_hang_id: string }>();
  const ids = dong.map((row) => row.dat_don_hang_id);
  const calculation = await tinhToanPxk(db, ids);

  if (ids.length > 0) {
    const { results: loai } = await db.prepare(
      "SELECT id, ma FROM settings_loai_chiet_khau WHERE ma IS NOT NULL AND bat_tat = 1",
    ).all<{ id: number; ma: string }>();
    const idTheoMa = new Map(loai.map((row) => [row.ma, row.id]));
    await db.batch(ids.map((id) => {
      const ma = calculation.maTheoDong.get(id) ?? null;
      return db.prepare(
        datLaiThuCong
          ? "UPDATE dat_don_hang SET loai_chiet_khau_id = ?, loai_chiet_khau_thu_cong = 0 WHERE id = ?"
          : "UPDATE dat_don_hang SET loai_chiet_khau_id = ? WHERE id = ? AND loai_chiet_khau_thu_cong = 0",
      ).bind(ma ? (idTheoMa.get(ma) ?? null) : null, id);
    }));
  }

  const totalCanChuyen = pxk.loai_don === "tra_hang" ? 0 : calculation.total;
  const soTienLuu = totalCanChuyen > 0 ? totalCanChuyen : null;
  if (capNhatTongTien && pxk.trang_thai_hien_tai === "Dang tao phieu" && pxk.so_tien_can_chuyen !== soTienLuu) {
    await db.prepare(
      `UPDATE phieu_xuat_kho
       SET so_tien_can_chuyen = ?,
           trang_thai_chuyen_tien = CASE WHEN ? IS NULL THEN NULL ELSE 'Cho KTV chuyen' END,
           bang_chung_chuyen_tien_url = NULL,
           bang_chung_chuyen_tien_ghi_chu = NULL,
           ngay_ktv_chuyen = NULL
       WHERE id = ?`,
    ).bind(soTienLuu, soTienLuu, pxkId).run();
    if (nguoiXuLy) {
      const datLaiChuyenTien = pxk.trang_thai_chuyen_tien != null && pxk.trang_thai_chuyen_tien !== "Cho KTV chuyen";
      const ghiChu = `Tự tính lại ${(pxk.so_tien_can_chuyen ?? 0).toLocaleString("vi-VN")}đ → ${totalCanChuyen.toLocaleString("vi-VN")}đ` +
        (datLaiChuyenTien ? ` — đặt lại chuyển tiền từ "${NHAN_CHUYEN_TIEN[pxk.trang_thai_chuyen_tien!] ?? pxk.trang_thai_chuyen_tien}" về "Chờ KTV chuyển", KTV cần chuyển/nộp lại bằng chứng` : "");
      await db.prepare(
        "INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)",
      ).bind(pxkId, "Da sua tong tien can chuyen", nguoiXuLy, nowVN(), ghiChu).run();
    }
  }

  return { ...calculation, total: totalCanChuyen };
}
