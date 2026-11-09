import { computeMocDuPhongHienTai } from "./duPhongKtv";
import { laNguoiNhanKhLe } from "./khachLe";
import { nowVN } from "./vnTime";
import { canBangPxk, KE_TOAN_DA_CHOT_TIEN_SQL } from "./quyKtv";

// Phan loai "Đình tủ" (chiet khau 15%) - so KHONG dau/hoa-thuong (2026-10-01: tung co "Đỉnh tủ" go nham dau nen mat chiet
// khau; du lieu da gop ve "Đình tủ" + trigger o migration 0062, ham nay la lop chan thu 2).
export function laDinhTu(donVi: string | null | undefined): boolean {
  return (donVi ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/\s+/g, " ").trim() === "dinh tu";
}

export type MaChietKhau = "KHONG_CK" | "DINH_TU" | "TONG_200_500" | "GIA_KTV" | "GIA_DU_PHONG" | "CONG_NO" | "KH_TRA_GOP";

export interface PxkCalculation {
  total: number;
  maTheoDong: Map<string, MaChietKhau | null>;
  tienUocTinhTheoDong: Map<string, number>;
  // Co so chiet khau (v1.434) CHI cua dong tinh "song" (con tinh lai duoc) - ghi vao dat_don_hang.ck_co_so (taiTinhPxk /
  // ganLoaiChietKhauDonChuaPxk). Dong da khoa tien dung moc da luu, khong co trong map nay.
  coSoTheoDong: Map<string, CoSoChietKhau>;
}

// Giai thich vi sao 1 dong duoc muc gia (v1.434, "cần giải thích rõ lý do tại sao linh kiện này lại được giảm theo chiết khấu đó").
// moc = gia tri tinh moc 200k/500k = tong_ngay (don Mua + TRỪ CÔNG NỢ cung ngay tao) + tong cac phieu dang mo (phieu: don KHAC ngay nam
// trong phieu KTV chua duoc Ke toan chot xong don xuat luc don nay duoc tao - migration 0105). FE: datMuaLinhKien/CoSoChietKhau.tsx.
export interface CoSoChietKhau {
  ma: MaChietKhau | null;
  ly_do: "bac_thang" | "chua_gia_ktv" | "dinh_tu" | "hoa_don" | "du_phong" | "kh_le" | "gia_chot";
  moc?: number;
  ngay?: string;
  tong_ngay?: number;
  phieu?: { id: string; tong: number }[];
}

interface CalculationRow {
  id: string;
  ngay_tao: string | null;
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
  yeu_cau_hoa_don: string | null;
  doi_tac_ma: string | null;
  ck_co_so: string | null;
  khoa_ck: number | null; // 1 = dong nam trong phieu da khoa tien (Ke toan da duyet tien / phieu qua buoc tao phieu)
}

// Chot nguoi dung 2026-09-28: PXK cong_no mac dinh tien can chuyen = 0, RIENG dong loai de xuat "TRỪ CÔNG
// NỢ..." (TRỪ CÔNG NỢ / TG12-NSKX / TG12-NPP) van phai chuyen tien - tinh gia NHU DON MUA (gia chot ->
// bac thang, xem tinhToanPxk) va di du quy trinh chuyen tien/chan chuyen buoc nhu PXK mua.
// Cac dong cong_no con lai (CÔNG NỢ/HỖ TRỢ/THẺ BẢO HÀNH) chi hien so_tien_cong_no, khong cong vao tong.
export function laTruCongNo(loaiDeXuat: string | null | undefined): boolean {
  return (loaiDeXuat ?? "").toUpperCase().includes("TRỪ CÔNG NỢ");
}

// MUA HÀNG CÔNG NỢ ĐỐI TÁC (chot 2026-10-26, v1.403, migration 0099): don MUA (loai_don 'mua') ghi no cho 1 doi tac (dat_don_hang.doi_tac_ma)
// - gia niem yet, vao phieu RIENG khong can chuyen tien, cong vao so cong no doi tac (lib/congNoDoiTac.ts). Ten chua "CÔNG NỢ" nen MOI cho
// nhan dien "cong no" bang chuoi phai loai tru loai nay (deriveLoaiDon, canNoRequired, laXuatMayDoiBaoHanh...). Ban sao FE: helpers.ts.
export function laMuaCongNoDoiTac(loaiDeXuat: string | null | undefined): boolean {
  return (loaiDeXuat ?? "").normalize("NFC").toUpperCase().includes("CÔNG NỢ ĐỐI TÁC");
}

// DON KH TRA GOP (chot 2026-10-02): loai de xuat "HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX" / "...TG12-NPP" (nhom cong_no vi chua "HỖ TRỢ")
// KHONG tinh cong no - gia tri CN = 0 (so_tien_cong_no 0, khong danh gia Du/Khong du, khong cong vao cong no tam tinh) va
// loai chiet khau "Chiết khấu đơn KH trả góp" (ma KH_TRA_GOP, migration 0063 - trigger trg_ddh_kh_tra_gop_* giu dung cho moi
// duong ghi). So KHONG dau (lech chuan Unicode NFC/NFD giua cac ten option). Ban sao FE: helpers.ts laKhTraGop.
export function laKhTraGop(loaiDeXuat: string | null | undefined): boolean {
  return (loaiDeXuat ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .includes("ho tro ngoai bao hanh tg12");
}

// DON "HỖ TRỢ 0 ĐỒNG" (+ "(KÊNH MT)") (chot 2026-10-15): khong tinh gia tri cong no - nhu don KH tra gop (so_tien_cong_no 0, khong
// danh gia Du/Khong du, KHONG BAO GIO vao "Cho GS duyet" vuot tran). Gia/chiet khau giu nguyen. Trigger trg_ddh_ho_tro_0d_* (migration
// 0082) giu dung cho moi duong ghi. Ban sao FE: helpers.ts laHoTro0Dong.
export function laHoTro0Dong(loaiDeXuat: string | null | undefined): boolean {
  return (loaiDeXuat ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .includes("ho tro 0 dong");
}

// Loai de xuat nhom cong_no nhung KHONG tinh gia tri cong no / khong doi chieu tran: KH tra gop + HỖ TRỢ 0 ĐỒNG.
export function khongTinhCongNo(loaiDeXuat: string | null | undefined): boolean {
  return laKhTraGop(loaiDeXuat) || laHoTro0Dong(loaiDeXuat);
}

// Chot 2026-09-29: don CO yeu cau xuat hoa don (cot "Yêu cầu hóa đơn" khac trong / khac "Không") tinh theo GIA NIEM YET,
// KHONG huong chinh sach chiet khau nao (Dinh tu/bac thang/gia KTV/du phong) - nhan KHONG_CK. Gia chot TN nhap tay van thang.
// 2026-09-30: "Yêu cầu hóa đơn (xuất cho Trạm)" (nut "HĐ - Xuất cho trạm") VAN tinh chiet khau nhu binh thuong.
export function coYeuCauHoaDon(v: string | null | undefined): boolean {
  const t = (v ?? "").trim().normalize("NFC").toLowerCase();
  return t !== "" && t !== "không" && t !== "khong" && !t.includes("xuất cho trạm") && !t.includes("xuat cho tram");
}

// Nhan hien thi khop CHUYEN_TIEN_OPTIONS (frontend constants.ts) - "TN da duyet" hien la Ke toan da duyet.
const NHAN_CHUYEN_TIEN: Record<string, string> = { "KTV da chuyen": "KTV đã chuyển", "TN da duyet": "Kế toán đã duyệt" };

function soLuongTinhTien(row: CalculationRow): number {
  return row.so_luong_thuc_xuat ?? row.so_luong_de_xuat;
}

export async function tinhToanPxk(db: D1Database, datDonHangIds: string[]): Promise<PxkCalculation> {
  const maTheoDong = new Map<string, MaChietKhau | null>();
  const tienUocTinhTheoDong = new Map<string, number>();
  const coSoTheoDong = new Map<string, CoSoChietKhau>();
  if (datDonHangIds.length === 0) return { total: 0, maTheoDong, tienUocTinhTheoDong, coSoTheoDong };

  const placeholders = "SELECT value FROM json_each(?)";
  const { results } = await db.prepare(
    `SELECT ddh.id, ddh.ngay_tao, ddh.so_luong_de_xuat, ddh.so_luong_thuc_xuat, ddh.loai_de_xuat, ddh.loai_don,
            ddh.nguoi_nhan_hang, ddh.so_tien_cong_no, ddh.gia_de_xuat, ddh.gia_chot,
            lk.gia_ban, lk.gia_tri_cong_no, lk.gia_du_phong, lk.don_vi, ddh.yeu_cau_hoa_don, ddh.doi_tac_ma, ddh.ck_co_so,
            (SELECT CASE WHEN p.trang_thai_hien_tai = 'Dang tao phieu' AND NOT ${KE_TOAN_DA_CHOT_TIEN_SQL("p")} THEN 0 ELSE 1 END
             FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id
             WHERE pd.dat_don_hang_id = ddh.id AND p.trang_thai_hien_tai <> 'Ke toan huy'
             ORDER BY p.ngay_tao DESC LIMIT 1) AS khoa_ck
     FROM dat_don_hang ddh LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
     WHERE ddh.id IN (${placeholders})`,
  ).bind(JSON.stringify([...new Set(datDonHangIds)])).all<CalculationRow>();

  const maTheoLoaiDon = (row: CalculationRow, ma: MaChietKhau): MaChietKhau | null =>
    row.loai_don === "tra_hang"
      ? null
      : row.loai_don === "cong_no" && !laTruCongNo(row.loai_de_xuat)
        ? laKhTraGop(row.loai_de_xuat) ? "KH_TRA_GOP" : "CONG_NO"
        : ma;
  const setTien = (row: CalculationRow, amount: number): number => {
    const rounded = Math.round(amount);
    tienUocTinhTheoDong.set(row.id, rounded);
    return rounded;
  };

  let total = 0;
  // Chot nguoi dung 2026-09-28 ("Mọi đơn MUA đều tính bậc thang", sau PMH-000025 tong 35tr van tinh gia
  // ban): truoc day CHI dong "MUA DỰ TRỮ" vao nhom bac thang, moi loai mua khac tinh gia ban (KHONG_CK).
  // Gio MOI dong mua + dong "TRỪ CÔNG NỢ" (da chot tinh "như đơn mua") gom 1 nhom theo KTV: Dinh tu 85%,
  // con lai theo moc tong gia ban ca nhom. Gia du phong van CHI danh cho dong MUA DỰ TRỮ.
  const nhomTheoKtv = new Map<string, CalculationRow[]>();
  for (const row of results) {
    if (row.loai_don === "tra_hang") {
      maTheoDong.set(row.id, null);
      setTien(row, 0);
      continue;
    }
    if (row.loai_don === "cong_no" && !laTruCongNo(row.loai_de_xuat)) {
      maTheoDong.set(row.id, laKhTraGop(row.loai_de_xuat) ? "KH_TRA_GOP" : "CONG_NO");
      setTien(row, row.so_tien_cong_no ?? 0);
      continue;
    }
    // MUA HÀNG CÔNG NỢ ĐỐI TÁC (v1.403): GIA NIEM YET luc tao (gia_de_xuat; gia chot TN nhap van thang), khong chiet khau, khong tinh vao
    // tong ngay cua KTV - CUNG cong thuc TIEN_DON_DOI_TAC_SQL (lib/congNoDoiTac.ts) de so ghi no khop tien hien o phieu.
    if (row.doi_tac_ma) {
      maTheoDong.set(row.id, "KHONG_CK");
      total += setTien(row, (row.gia_chot ?? row.gia_de_xuat ?? row.gia_ban ?? 0) * soLuongTinhTien(row));
      continue;
    }
    const email = row.nguoi_nhan_hang ?? "";
    if (!nhomTheoKtv.has(email)) nhomTheoKtv.set(email, []);
    nhomTheoKtv.get(email)!.push(row);
  }

  // gia_de_xuat = anh chup gia_ban luc tao don - chi dung du phong khi LK khong con trong danh muc.
  const giaBan = (row: CalculationRow) => row.gia_ban ?? row.gia_de_xuat ?? 0;
  const laDuTru = (row: CalculationRow) => (row.loai_de_xuat ?? "").trim().toUpperCase() === "MUA DỰ TRỮ";

  for (const [email, rows] of nhomTheoKtv) {
    // KH le (migration 0074, chot 2026-10-09): KH le + tai khoan nhom KH le tinh GIA NIEM YET, khong chiet khau nao (khong
    // Dinh tu/bac thang/gia KTV/du phong). Gia chot TN nhap tay van thang.
    if (await laNguoiNhanKhLe(db, email)) {
      for (const row of rows) {
        total += setTien(row, (row.gia_chot ?? giaBan(row)) * soLuongTinhTien(row));
        maTheoDong.set(row.id, maTheoLoaiDon(row, "KHONG_CK"));
        if (!row.khoa_ck) coSoTheoDong.set(row.id, { ma: maTheoLoaiDon(row, "KHONG_CK"), ly_do: "kh_le" });
      }
      continue;
    }
    // CHOT 2026-09-28 ("Tổng tiền tính chiết khấu ... dựa vào tổng tiền đặt hàng MUA HÀNG + TRỪ CÔNG NỢ
    // trong ngày của KTV"): moc 200k/500k cua TUNG dong = tong gia ban x SL thuc xuat (chua co thi de xuat)
    // cua MOI don nhom Mua + TRỪ CÔNG NỢ ma KTV nay nhan, tao CUNG NGAY (gio VN, ngay_tao) voi dong do, KHONG
    // tinh don bi tu choi/huy - bat ke don da vao PXK nao. PXK gom don nhieu ngay -> moi dong theo ngay cua no.
    // + PHIEU DANG MO (chot 2026-11-03, v1.434 - "chỉ cần KTV lên đơn trước khi kế toán tạo phiếu trên hệ thống kế toán, thì công ty khuyến
    // khích KTV đặt nhiều đơn hàng và được hưởng chiết khấu"): moc cua dong = tong ngay cua dong + gia tri (gia ban x SL) cac don KHAC ngay
    // nam trong phieu cua KTV CHUA duoc Ke toan chot xong don xuat TAI THOI DIEM don nay duoc tao (phieu_xuat_kho.chot_ke_toan_luc NULL hoac
    // sau ngay_tao don). Dong nam trong phieu da khoa tien (khoa_ck) dung moc da luu (ck_co_so) - khong doi gia theo don phat sinh sau; dong
    // khoa chua tung luu co so = quy tac cu (chi tong ngay).
    const tongTheoNgay = await tongDonTheoNgay(db, email, [...new Set(rows.map(ngayCua).filter(Boolean))]);
    const tuLuc = rows.filter((r) => !r.khoa_ck).reduce<string | null>((m, r) => (r.ngay_tao && (!m || r.ngay_tao < m) ? r.ngay_tao : m), null);
    const phieuMo = tuLuc ? await donTrongPhieuMo(db, email, tuLuc) : [];
    const coSoBacThang = (row: CalculationRow): { moc: number; ngay: string; tong_ngay: number; phieu: { id: string; tong: number }[] } => {
      const ngay = ngayCua(row);
      if (row.khoa_ck) {
        const luu = docCoSo(row.ck_co_so);
        if (luu?.moc != null) return { moc: luu.moc, ngay: luu.ngay ?? ngay, tong_ngay: luu.tong_ngay ?? luu.moc, phieu: luu.phieu ?? [] };
      }
      const tongNgay = tongTheoNgay.get(ngay) ?? giaBan(row) * soLuongTinhTien(row);
      const theoPhieu = new Map<string, number>();
      if (!row.khoa_ck) {
        for (const o of phieuMo) {
          if (o.ngay === ngay || (o.chot_luc && row.ngay_tao && o.chot_luc <= row.ngay_tao)) continue;
          theoPhieu.set(o.pxk_id, (theoPhieu.get(o.pxk_id) ?? 0) + o.gia_tri);
        }
      }
      const phieu = [...theoPhieu].map(([id, tong]) => ({ id, tong })).sort((a, b) => a.id.localeCompare(b.id));
      return { moc: tongNgay + phieu.reduce((s, p) => s + p.tong, 0), ngay, tong_ngay: tongNgay, phieu };
    };
    const giaBacThang = (row: CalculationRow): { donGia: number; ma: MaChietKhau; coSo: CoSoChietKhau } => {
      const cs = coSoBacThang(row);
      if (cs.moc < 200000) return { donGia: giaBan(row), ma: "KHONG_CK", coSo: { ma: "KHONG_CK", ly_do: "bac_thang", ...cs } };
      if (cs.moc < 500000) return { donGia: giaBan(row) * 0.7, ma: "TONG_200_500", coSo: { ma: "TONG_200_500", ly_do: "bac_thang", ...cs } };
      // LK chua khai bao gia KTV (NULL/0) -> giu gia ban thay vi tinh 0d (cung loai loi voi gia du phong).
      if ((row.gia_tri_cong_no ?? 0) > 0) return { donGia: row.gia_tri_cong_no!, ma: "GIA_KTV", coSo: { ma: "GIA_KTV", ly_do: "bac_thang", ...cs } };
      return { donGia: giaBan(row), ma: "KHONG_CK", coSo: { ma: "KHONG_CK", ly_do: "chua_gia_ktv", ...cs } };
    };

    // Gia du phong: CHI cac dong MUA DỰ TRỮ (tru Dinh tu), tat-ca-hoac-khong.
    const duTru = rows.filter((row) => !laDinhTu(row.don_vi) && laDuTru(row) && !coYeuCauHoaDon(row.yeu_cau_hoa_don));
    let dungDuPhong = false;
    if (duTru.length > 0) {
      const giaDuPhong = duTru.reduce((sum, row) => sum + (row.gia_du_phong ?? 0) * soLuongTinhTien(row), 0);
      const ktvRow = email
        ? await db.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE email_dang_nhap = ?").bind(email).first<{ ma_ktv: string }>()
        : null;
      // Loai tru CHINH cac dong dang xet khoi "da dung" (tranh dem trung, xem computeMocDuPhongHienTai).
      // Dong Dinh tu cua phieu van tinh la "da dung" vi khong nam trong G_dp dem ra so sanh.
      const mocKhaDung = ktvRow ? await computeMocDuPhongHienTai(db, ktvRow.ma_ktv, duTru.map((row) => row.id)) : 0;
      // FIX 2026-09-28: truoc day LK chua co gia du phong -> giaDuPhong = 0 <= moc -> "du du phong" -> tinh
      // 0d. Chi dung gia du phong khi MOI dong du tru deu co gia du phong > 0 VA moc du; thieu 1 dong -> ca
      // nhom du tru ve gia bac thang (giu nguyen tac "theo ca phieu, khong chia tung dong").
      const duGiaDuPhong = duTru.every((row) => (row.gia_du_phong ?? 0) > 0);
      dungDuPhong = duGiaDuPhong && mocKhaDung >= giaDuPhong;
    }

    for (const row of rows) {
      const { donGia, ma, coSo } =
        coYeuCauHoaDon(row.yeu_cau_hoa_don)
          ? { donGia: giaBan(row), ma: "KHONG_CK" as MaChietKhau, coSo: { ma: "KHONG_CK", ly_do: "hoa_don" } as CoSoChietKhau }
          : laDinhTu(row.don_vi)
            ? { donGia: giaBan(row) * 0.85, ma: "DINH_TU" as MaChietKhau, coSo: { ma: "DINH_TU", ly_do: "dinh_tu" } as CoSoChietKhau }
            : dungDuPhong && laDuTru(row)
              ? { donGia: row.gia_du_phong ?? 0, ma: "GIA_DU_PHONG" as MaChietKhau, coSo: { ma: "GIA_DU_PHONG", ly_do: "du_phong" } as CoSoChietKhau }
              : giaBacThang(row);
      // Gia chot LUON thang (chot 2026-09-28); nhan loai chiet khau van theo cong thuc.
      total += setTien(row, (row.gia_chot ?? donGia) * soLuongTinhTien(row));
      maTheoDong.set(row.id, maTheoLoaiDon(row, ma));
      if (!row.khoa_ck) coSoTheoDong.set(row.id, row.gia_chot != null ? { ...coSo, ly_do: "gia_chot" } : coSo);
    }
  }

  return { total, maTheoDong, tienUocTinhTheoDong, coSoTheoDong };
}

function docCoSo(json: string | null): CoSoChietKhau | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as CoSoChietKhau;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

// Don nhom Mua + TRỪ CÔNG NỢ cua KTV nam trong phieu CHUA duoc Ke toan chot xong don xuat (chot_ke_toan_luc NULL) hoac chot SAU `tuLuc`
// (ngay_tao som nhat cua cac dong dang xet) - nguon cong them vao moc chiet khau (v1.434). Phieu huy / tra hang / doi tac khong tinh.
export async function donTrongPhieuMo(
  db: D1Database, email: string, tuLuc: string,
): Promise<{ id: string; ngay: string; gia_tri: number; pxk_id: string; chot_luc: string | null }[]> {
  if (!email) return [];
  const { results } = await db
    .prepare(
      `SELECT ddh.id, substr(ddh.ngay_tao, 1, 10) AS ngay, p.id AS pxk_id, p.chot_ke_toan_luc AS chot_luc,
              COALESCE(lk.gia_ban, ddh.gia_de_xuat, 0) * COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) AS gia_tri
       FROM phieu_xuat_kho p
       JOIN phieu_xuat_kho_dong pd ON pd.phieu_xuat_kho_id = p.id
       JOIN dat_don_hang ddh ON ddh.id = pd.dat_don_hang_id
       LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
       WHERE p.nguoi_nhan_hang = ? AND (p.chot_ke_toan_luc IS NULL OR p.chot_ke_toan_luc > ?)
         AND p.trang_thai_hien_tai <> 'Ke toan huy' AND COALESCE(p.loai_don, '') <> 'tra_hang' AND p.doi_tac_ma IS NULL
         AND ddh.nguoi_nhan_hang = ? AND ${DON_TINH_TONG_NGAY_SQL}`,
    )
    .bind(email, tuLuc, email)
    .all<{ id: string; ngay: string; gia_tri: number; pxk_id: string; chot_luc: string | null }>();
  const seen = new Set<string>();
  return results.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

const ngayCua = (row: CalculationRow) => (row.ngay_tao ?? "").slice(0, 10);

// Tien uoc tinh SAU CHIET KHAU tung dong cho danh sach/chi tiet don (them 2026-09-28, phan hoi "giá đề xuất
// là giá thực cần chuyển tiền, giá niêm yết mới là 638k") - CUNG tinhToanPxk voi PXK: dong da vao PXK tinh
// theo TOAN BO dong cua PXK do (khop "Tiền cần chuyển" o chi tiet PXK), dong chua vao PXK tinh chung 1 nhom.
// Chia lo 90 id/cau lenh (D1 gioi han 100 tham so).
export async function tienUocTinhChoDon(db: D1Database, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const idSet = new Set(ids);
  const lo = <T>(arr: T[]) => Array.from({ length: Math.ceil(arr.length / 90) }, (_, i) => arr.slice(i * 90, i * 90 + 90));
  const theoPxk = new Map<string, Set<string>>();
  const coPxk = new Set<string>();
  for (const chunk of lo(ids)) {
    const { results } = await db
      .prepare(
        `SELECT phieu_xuat_kho_id as pxk_id, dat_don_hang_id as id FROM phieu_xuat_kho_dong
         WHERE phieu_xuat_kho_id IN (SELECT phieu_xuat_kho_id FROM phieu_xuat_kho_dong WHERE dat_don_hang_id IN (${chunk.map(() => "?").join(",")}))`,
      )
      .bind(...chunk)
      .all<{ pxk_id: string; id: string }>();
    for (const r of results) {
      if (!theoPxk.has(r.pxk_id)) theoPxk.set(r.pxk_id, new Set());
      theoPxk.get(r.pxk_id)!.add(r.id);
      coPxk.add(r.id);
    }
  }
  const nhom = [...theoPxk.values()].flatMap((set) => lo([...set]));
  nhom.push(...lo(ids.filter((id) => !coPxk.has(id))));
  for (const g of nhom) {
    const tinh = await tinhToanPxk(db, g);
    for (const [id, tien] of tinh.tienUocTinhTheoDong) if (idSet.has(id)) out.set(id, tien);
  }
  return out;
}

// Dieu kien "don tinh vao tong ngay" (chot 2026-09-28): nhom Mua + TRỪ CÔNG NỢ, chua tu choi/huy.
const DON_TINH_TONG_NGAY_SQL = `(ddh.loai_don = 'mua' OR (ddh.loai_don = 'cong_no' AND instr(COALESCE(ddh.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') > 0))
         AND ddh.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')
         AND ddh.gui_bu_nhan_thieu_id IS NULL
         AND ddh.doi_tac_ma IS NULL`; // don MUA HÀNG CÔNG NỢ ĐỐI TÁC (v1.403) gia niem yet, khong tinh vao tong ngay KTV // don gui bu thieu hang (migration 0075) da tinh o don goc

// Tong gia tri don trong ngay cua 1 KTV (nguoi nhan hang) theo tung ngay (YYYY-MM-DD, gio VN) - xem CHOT
// 2026-09-28 o tinhToanPxk. Gia ban = linh_kien.gia_ban (LK khong con trong danh muc -> gia_de_xuat).
export async function tongDonTheoNgay(db: D1Database, email: string, ngays: string[]): Promise<Map<string, number>> {
  if (!email || ngays.length === 0) return new Map();
  const { results } = await db
    .prepare(
      `SELECT substr(ddh.ngay_tao, 1, 10) as ngay,
              COALESCE(SUM(COALESCE(lk.gia_ban, ddh.gia_de_xuat, 0) * COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat)), 0) as tong
       FROM dat_don_hang ddh
       LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
       WHERE ddh.nguoi_nhan_hang = ? AND substr(ddh.ngay_tao, 1, 10) IN (SELECT value FROM json_each(?))
         AND ${DON_TINH_TONG_NGAY_SQL}
       GROUP BY substr(ddh.ngay_tao, 1, 10)`,
    )
    .bind(email, JSON.stringify(ngays))
    .all<{ ngay: string; tong: number }>();
  return new Map(results.map((r) => [r.ngay, r.tong]));
}

// Tinh lai MOI PXK "Dang tao phieu" cua 1 KTV (nguoi nhan hang) - goi khi tong don trong ngay cua KTV co the
// doi (tao don moi, don bi tu choi/huy, doi SL/ma LK) vi moc chiet khau phu thuoc tong ngay, khong chi thanh
// phan PXK (chot 2026-09-28). PXK da qua buoc tao phieu khong doi tien (taiTinhPxk tu bo qua).
export async function taiTinhPxkMoCuaKtv(db: D1Database, nguoiNhanHang: string | null | undefined, nguoiXuLy?: string, boQuaPxkId?: string): Promise<void> {
  if (!nguoiNhanHang) return;
  // KHOA (chot 2026-09-28 "Đơn đã duyệt chuyển tiền sẽ bị khóa không đổi loại chiết khấu"): PXK da duoc Ke
  // toan duyet chuyen tien ("TN da duyet") KHONG tu tinh lai theo tong ngay nua (ca loai chiet khau lan tien).
  const { results } = await db
    .prepare(
      `SELECT id FROM phieu_xuat_kho p WHERE p.nguoi_nhan_hang = ? AND p.trang_thai_hien_tai = 'Dang tao phieu'
         AND NOT ${KE_TOAN_DA_CHOT_TIEN_SQL("p")}`, // tra het bang quy du van tinh lai (quy tu hoan/tru)
    )
    .bind(nguoiNhanHang)
    .all<{ id: string }>();
  for (const { id } of results) {
    if (id === boQuaPxkId) continue;
    await taiTinhPxk(db, id, false, true, nguoiXuLy);
  }
  await ganLoaiChietKhauDonChuaPxk(db, nguoiNhanHang);
}

// Don CHUA vao PXK nao cung duoc gan loai chiet khau theo tong ngay ngay tu luc tao (chot 2026-09-28) - tu
// doi moi khi tong ngay doi (goi trong taiTinhPxkMoCuaKtv). Chi nhom Mua + TRỪ CÔNG NỢ con hieu luc; loai
// chinh thuc van duoc tinh lai khi don vao PXK (taiTinhPxk).
async function ganLoaiChietKhauDonChuaPxk(db: D1Database, nguoiNhanHang: string): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT ddh.id FROM dat_don_hang ddh
       WHERE ddh.nguoi_nhan_hang = ? AND ${DON_TINH_TONG_NGAY_SQL}
         AND NOT EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd WHERE pxkd.dat_don_hang_id = ddh.id)`,
    )
    .bind(nguoiNhanHang)
    .all<{ id: string }>();
  const ids = results.map((r) => r.id);
  if (ids.length === 0) return;
  const calculation = await tinhToanPxk(db, ids);
  const { results: loai } = await db
    .prepare("SELECT id, ma FROM settings_loai_chiet_khau WHERE ma IS NOT NULL AND bat_tat = 1")
    .all<{ id: number; ma: string }>();
  const idTheoMa = new Map(loai.map((row) => [row.ma, row.id]));
  await db.batch(
    ids.map((id) => {
      const ma = calculation.maTheoDong.get(id) ?? null;
      const coSo = calculation.coSoTheoDong.get(id);
      return db
        .prepare(
          `UPDATE dat_don_hang SET loai_chiet_khau_id = CASE WHEN loai_chiet_khau_thu_cong = 0 THEN ? ELSE loai_chiet_khau_id END,
             ck_co_so = COALESCE(?, ck_co_so) WHERE id = ?`,
        )
        .bind(ma ? (idTheoMa.get(ma) ?? null) : null, coSo ? JSON.stringify(coSo) : null, id);
    }),
  );
}

// Tong ngay cua KTV de HIEN THI (chot 2026-09-28): gia tri dat hang (gia ban x SL) + tien uoc tinh can chuyen
// (tinhToanPxk - gia chot neu co, khong thi gia theo chiet khau) cua cac don Mua + TRỪ CÔNG NỢ trong ngay.
export async function tongNgayKtv(
  db: D1Database,
  email: string,
  ngays: string[],
): Promise<{
  ngay: string; tong_gia_tri: number; tong_can_chuyen: number; so_don: number;
  phieu_mo: { id: string; tong: number }[]; tong_tinh_ck: number;
}[]> {
  if (!email || ngays.length === 0) return [];
  // v1.434: phieu dang mo (chua Ke toan chot xong don xuat) cong vao moc chiet khau cua don MOI tao (tong_tinh_ck) - don khac ngay.
  const phieuMo = await donTrongPhieuMo(db, email, nowVN());
  const [giaTri, { results }] = await Promise.all([
    tongDonTheoNgay(db, email, ngays),
    db
      .prepare(
        `SELECT ddh.id, substr(ddh.ngay_tao, 1, 10) as ngay FROM dat_don_hang ddh
         WHERE ddh.nguoi_nhan_hang = ? AND substr(ddh.ngay_tao, 1, 10) IN (SELECT value FROM json_each(?))
           AND ${DON_TINH_TONG_NGAY_SQL}`,
      )
      .bind(email, JSON.stringify(ngays))
      .all<{ id: string; ngay: string }>(),
  ]);
  const calculation = results.length ? await tinhToanPxk(db, results.map((r) => r.id)) : null;
  return ngays.map((ngay) => {
    const dong = results.filter((r) => r.ngay === ngay);
    const theoPhieu = new Map<string, number>();
    for (const o of phieuMo) if (o.ngay !== ngay) theoPhieu.set(o.pxk_id, (theoPhieu.get(o.pxk_id) ?? 0) + o.gia_tri);
    const phieu_mo = [...theoPhieu].map(([id, tong]) => ({ id, tong })).sort((a, b) => a.id.localeCompare(b.id));
    return {
      ngay,
      phieu_mo,
      tong_tinh_ck: (giaTri.get(ngay) ?? 0) + phieu_mo.reduce((s, p) => s + p.tong, 0),
      tong_gia_tri: giaTri.get(ngay) ?? 0,
      tong_can_chuyen: dong.reduce((s, r) => s + (calculation?.tienUocTinhTheoDong.get(r.id) ?? 0), 0),
      so_don: dong.length,
    };
  });
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
  nguoiCanBangQuy: string | undefined = nguoiXuLy, // ghi log "Trừ quỹ dư"/"Hoàn tiền về quỹ" (tao phieu moi: co, du khong log sua tong)
): Promise<PxkCalculation> {
  const pxk = await db.prepare(
    "SELECT loai_don, so_tien_can_chuyen, trang_thai_chuyen_tien, trang_thai_hien_tai, da_thanh_toan, doi_tac_ma FROM phieu_xuat_kho WHERE id = ?",
  ).bind(pxkId).first<{
    loai_don: string | null; so_tien_can_chuyen: number | null; trang_thai_chuyen_tien: string | null; trang_thai_hien_tai: string | null;
    da_thanh_toan: number | null; doi_tac_ma: string | null;
  }>();
  if (!pxk) return { total: 0, maTheoDong: new Map(), tienUocTinhTheoDong: new Map(), coSoTheoDong: new Map() };

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
      const coSo = calculation.coSoTheoDong.get(id);
      return db.prepare(
        datLaiThuCong
          ? "UPDATE dat_don_hang SET loai_chiet_khau_id = ?, loai_chiet_khau_thu_cong = 0, ck_co_so = COALESCE(?, ck_co_so) WHERE id = ?"
          : `UPDATE dat_don_hang SET loai_chiet_khau_id = CASE WHEN loai_chiet_khau_thu_cong = 0 THEN ? ELSE loai_chiet_khau_id END,
               ck_co_so = COALESCE(?, ck_co_so) WHERE id = ?`,
      ).bind(ma ? (idTheoMa.get(ma) ?? null) : null, coSo ? JSON.stringify(coSo) : null, id);
    }));
  }

  // Phieu doi tac (v1.403): khong can chuyen tien - tien cac dong ghi no doi tac (so_tien_can_chuyen NULL = "Không cần chuyển").
  const totalCanChuyen = pxk.loai_don === "tra_hang" || pxk.doi_tac_ma ? 0 : calculation.total;
  const soTienLuu = totalCanChuyen > 0 ? totalCanChuyen : null;
  // Them / bot dong o buoc "Cho ke toan" (chot 2026-11-05, v1.442 - "nếu kế toán chưa xác nhận chốt xong phiếu (gửi sang kho) thì vẫn có thể thêm
  // bớt linh kiện như ở bước trước khi nhập mã misa"): tinh lai tien NHU "Dang tao phieu". Du tien -> giu "Ke toan da duyet" + o lai "Cho ke toan"
  // (thua hoan quy); thieu tien -> phieu tu ve "Dang tao phieu" (Cho ma HD), chuyen tien "Cho KTV chuyen" - giu Ma don hang / Ma MISA, KTV chuyen bo
  // sung, Ke toan duyet roi "Gửi kế toán" lai.
  const moTien = pxk.trang_thai_hien_tai === "Dang tao phieu" || pxk.trang_thai_hien_tai === "Cho ke toan";
  if (capNhatTongTien && moTien && pxk.so_tien_can_chuyen !== soTienLuu) {
    // Chot 2026-09-30: Ke toan xac nhan = xac nhan bang chung chuyen tien khop so tien. Phieu DA duoc Ke toan duyet ma tong
    // moi KHONG vuot so da tra (vd don roi phieu) -> KTV khong phai chuyen them, tien that khong doi -> GIU "Ke toan da
    // duyet", phan tra thua hoan ve quy (canBangPxk ben duoi). Tong tang vuot so da tra -> "Cho KTV chuyen" nhu cu.
    // + "KTV da chuyen" (sua 2026-10-23, PMH-001168 "sao tiền lại cứ tự động sửa giá tiền"): them don MANG SAN tien da tra (bo khoi phieu
    // khac voi "Đơn đã thanh toán") -> tong + da tra cung tang, van du tien -> GIU trang thai (truoc day ve "Cho KTV chuyen" + log "KTV
    // chuyen bo sung" roi ngay lap tuc canBangPxk lai dua len "KTV da chuyen" = 2 dong log gay hieu nham moi lan them 1 don).
    const duTien = soTienLuu != null && soTienLuu <= (pxk.da_thanh_toan ?? 0);
    const giuDaDuyet = pxk.trang_thai_chuyen_tien === "TN da duyet" && duTien;
    const giuChoKeToan = pxk.trang_thai_chuyen_tien === "KTV da chuyen" && duTien;
    const giuTrangThai = giuDaDuyet || giuChoKeToan;
    await db.prepare(
      `UPDATE phieu_xuat_kho
       SET so_tien_can_chuyen = ?,
           trang_thai_chuyen_tien = CASE WHEN ? IS NULL THEN NULL WHEN ? = 1 THEN trang_thai_chuyen_tien ELSE 'Cho KTV chuyen' END,
           ngay_ktv_chuyen = CASE WHEN ? = 1 THEN ngay_ktv_chuyen ELSE NULL END
       WHERE id = ?`,
    ).bind(soTienLuu, soTienLuu, giuTrangThai ? 1 : 0, giuTrangThai ? 1 : 0, pxkId).run();
    if (nguoiXuLy) {
      const datLaiChuyenTien = !giuTrangThai && pxk.trang_thai_chuyen_tien != null && pxk.trang_thai_chuyen_tien !== "Cho KTV chuyen";
      const ghiChu = `Tự tính lại ${(pxk.so_tien_can_chuyen ?? 0).toLocaleString("vi-VN")}đ → ${totalCanChuyen.toLocaleString("vi-VN")}đ` +
        (datLaiChuyenTien ? ` — đặt lại chuyển tiền từ "${NHAN_CHUYEN_TIEN[pxk.trang_thai_chuyen_tien!] ?? pxk.trang_thai_chuyen_tien}" về "Chờ KTV chuyển" — giữ bằng chứng cũ, KTV chuyển bổ sung/tải thêm ảnh rồi xác nhận lại` : "") +
        (giuDaDuyet ? ` — tiền KTV đã chuyển không đổi, giữ "Kế toán đã duyệt" (không cần xác nhận lại)` : "") +
        (giuChoKeToan ? ` — phiếu đã thanh toán ${(pxk.da_thanh_toan ?? 0).toLocaleString("vi-VN")}đ, đủ tiền, KTV không cần chuyển thêm` : "");
      await db.prepare(
        "INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)",
      ).bind(pxkId, "Da sua tong tien can chuyen", nguoiXuLy, nowVN(), ghiChu).run();
    }
  }
  // Quy du KTV (migration 0047): tong doi / phieu dang cho tien -> tru quy (du thi "KTV da chuyen" cho Ke toan xac nhan), tong giam
  // duoi so da tra -> hoan phan thua ve quy. Khong lech thi khong ghi gi.
  if (capNhatTongTien && (pxk.trang_thai_hien_tai === "Dang tao phieu" || pxk.trang_thai_hien_tai === "Cho ke toan")) await canBangPxk(db, pxkId, nguoiCanBangQuy);
  // "Cho ke toan" sau khi da tru quy du ma tien chua con "Ke toan da duyet" (tong tang vuot so da tra) -> tu ve "Cho ma HD" cho KTV chuyen bo sung.
  if (capNhatTongTien && pxk.trang_thai_hien_tai === "Cho ke toan" && soTienLuu != null && pxk.so_tien_can_chuyen !== soTienLuu) {
    const sau = await db.prepare("SELECT trang_thai_chuyen_tien, da_thanh_toan FROM phieu_xuat_kho WHERE id = ?").bind(pxkId)
      .first<{ trang_thai_chuyen_tien: string | null; da_thanh_toan: number | null }>();
    if (sau && sau.trang_thai_chuyen_tien !== "TN da duyet") {
      await db.batch([
        db.prepare("UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'Dang tao phieu', version = version + 1 WHERE id = ? AND trang_thai_hien_tai = 'Cho ke toan'").bind(pxkId),
        db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Dang tao phieu', ?, ?, ?)").bind(
          pxkId, nguoiXuLy ?? "he-thong", nowVN(),
          `Sửa dòng ở bước chờ kế toán: tổng tiền ${totalCanChuyen.toLocaleString("vi-VN")}đ, đã thanh toán ${(sau.da_thanh_toan ?? 0).toLocaleString("vi-VN")}đ — tự trả về chờ mã HĐ, chờ KTV chuyển bổ sung / Kế toán duyệt tiền rồi gửi kế toán lại`,
        ),
      ]);
    }
  }

  return { ...calculation, total: totalCanChuyen };
}
