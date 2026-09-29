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
}

// Chot nguoi dung 2026-09-28: PXK cong_no mac dinh tien can chuyen = 0, RIENG dong loai de xuat "TRỪ CÔNG
// NỢ..." (TRỪ CÔNG NỢ / TG12-NSKX / TG12-NPP) van phai chuyen tien - tinh gia NHU DON MUA (gia chot ->
// bac thang, xem tinhToanPxk) va di du quy trinh chuyen tien/chan chuyen buoc nhu PXK mua.
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
    `SELECT ddh.id, ddh.ngay_tao, ddh.so_luong_de_xuat, ddh.so_luong_thuc_xuat, ddh.loai_de_xuat, ddh.loai_don,
            ddh.nguoi_nhan_hang, ddh.so_tien_cong_no, ddh.gia_de_xuat, ddh.gia_chot,
            lk.gia_ban, lk.gia_tri_cong_no, lk.gia_du_phong, lk.don_vi
     FROM dat_don_hang ddh LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
     WHERE ddh.id IN (${placeholders})`,
  ).bind(...datDonHangIds).all<CalculationRow>();

  const maTheoLoaiDon = (row: CalculationRow, ma: MaChietKhau): MaChietKhau | null =>
    row.loai_don === "tra_hang" ? null : row.loai_don === "cong_no" && !laTruCongNo(row.loai_de_xuat) ? "CONG_NO" : ma;
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
      maTheoDong.set(row.id, "CONG_NO");
      setTien(row, row.so_tien_cong_no ?? 0);
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
    // CHOT 2026-09-28 ("Tổng tiền tính chiết khấu ... dựa vào tổng tiền đặt hàng MUA HÀNG + TRỪ CÔNG NỢ
    // trong ngày của KTV"): moc 200k/500k cua TUNG dong = tong gia ban x SL thuc xuat (chua co thi de xuat)
    // cua MOI don nhom Mua + TRỪ CÔNG NỢ ma KTV nay nhan, tao CUNG NGAY (gio VN, ngay_tao) voi dong do, KHONG
    // tinh don bi tu choi/huy - bat ke don da vao PXK nao. PXK gom don nhieu ngay -> moi dong theo ngay cua no.
    const tongTheoNgay = await tongDonTheoNgay(db, email, [...new Set(rows.map(ngayCua).filter(Boolean))]);
    const giaBacThang = (row: CalculationRow): { donGia: number; ma: MaChietKhau } => {
      const giaTriNhom = tongTheoNgay.get(ngayCua(row)) ?? giaBan(row) * soLuongTinhTien(row);
      if (giaTriNhom < 200000) return { donGia: giaBan(row), ma: "KHONG_CK" };
      if (giaTriNhom < 500000) return { donGia: giaBan(row) * 0.7, ma: "TONG_200_500" };
      // LK chua khai bao gia KTV (NULL/0) -> giu gia ban thay vi tinh 0d (cung loai loi voi gia du phong).
      if ((row.gia_tri_cong_no ?? 0) > 0) return { donGia: row.gia_tri_cong_no!, ma: "GIA_KTV" };
      return { donGia: giaBan(row), ma: "KHONG_CK" };
    };

    // Gia du phong: CHI cac dong MUA DỰ TRỮ (tru Dinh tu), tat-ca-hoac-khong.
    const duTru = rows.filter((row) => row.don_vi !== "Đình tủ" && laDuTru(row));
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
      const { donGia, ma } =
        row.don_vi === "Đình tủ"
          ? { donGia: giaBan(row) * 0.85, ma: "DINH_TU" as MaChietKhau }
          : dungDuPhong && laDuTru(row)
            ? { donGia: row.gia_du_phong ?? 0, ma: "GIA_DU_PHONG" as MaChietKhau }
            : giaBacThang(row);
      // Gia chot LUON thang (chot 2026-09-28); nhan loai chiet khau van theo cong thuc.
      total += setTien(row, (row.gia_chot ?? donGia) * soLuongTinhTien(row));
      maTheoDong.set(row.id, maTheoLoaiDon(row, ma));
    }
  }

  return { total, maTheoDong, tienUocTinhTheoDong };
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
         AND ddh.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')`;

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
       WHERE ddh.nguoi_nhan_hang = ? AND substr(ddh.ngay_tao, 1, 10) IN (${ngays.map(() => "?").join(",")})
         AND ${DON_TINH_TONG_NGAY_SQL}
       GROUP BY substr(ddh.ngay_tao, 1, 10)`,
    )
    .bind(email, ...ngays)
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
      `SELECT id FROM phieu_xuat_kho WHERE nguoi_nhan_hang = ? AND trang_thai_hien_tai = 'Dang tao phieu'
         AND COALESCE(trang_thai_chuyen_tien, '') != 'TN da duyet'`,
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
      return db
        .prepare("UPDATE dat_don_hang SET loai_chiet_khau_id = ? WHERE id = ? AND loai_chiet_khau_thu_cong = 0")
        .bind(ma ? (idTheoMa.get(ma) ?? null) : null, id);
    }),
  );
}

// Tong ngay cua KTV de HIEN THI (chot 2026-09-28): gia tri dat hang (gia ban x SL) + tien uoc tinh can chuyen
// (tinhToanPxk - gia chot neu co, khong thi gia theo chiet khau) cua cac don Mua + TRỪ CÔNG NỢ trong ngay.
export async function tongNgayKtv(
  db: D1Database,
  email: string,
  ngays: string[],
): Promise<{ ngay: string; tong_gia_tri: number; tong_can_chuyen: number; so_don: number }[]> {
  if (!email || ngays.length === 0) return [];
  const [giaTri, { results }] = await Promise.all([
    tongDonTheoNgay(db, email, ngays),
    db
      .prepare(
        `SELECT ddh.id, substr(ddh.ngay_tao, 1, 10) as ngay FROM dat_don_hang ddh
         WHERE ddh.nguoi_nhan_hang = ? AND substr(ddh.ngay_tao, 1, 10) IN (${ngays.map(() => "?").join(",")})
           AND ${DON_TINH_TONG_NGAY_SQL}`,
      )
      .bind(email, ...ngays)
      .all<{ id: string; ngay: string }>(),
  ]);
  const calculation = results.length ? await tinhToanPxk(db, results.map((r) => r.id)) : null;
  return ngays.map((ngay) => {
    const dong = results.filter((r) => r.ngay === ngay);
    return {
      ngay,
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
           ngay_ktv_chuyen = NULL
       WHERE id = ?`,
    ).bind(soTienLuu, soTienLuu, pxkId).run();
    if (nguoiXuLy) {
      const datLaiChuyenTien = pxk.trang_thai_chuyen_tien != null && pxk.trang_thai_chuyen_tien !== "Cho KTV chuyen";
      const ghiChu = `Tự tính lại ${(pxk.so_tien_can_chuyen ?? 0).toLocaleString("vi-VN")}đ → ${totalCanChuyen.toLocaleString("vi-VN")}đ` +
        (datLaiChuyenTien ? ` — đặt lại chuyển tiền từ "${NHAN_CHUYEN_TIEN[pxk.trang_thai_chuyen_tien!] ?? pxk.trang_thai_chuyen_tien}" về "Chờ KTV chuyển" — giữ bằng chứng cũ, KTV chuyển bổ sung/tải thêm ảnh rồi xác nhận lại` : "");
      await db.prepare(
        "INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)",
      ).bind(pxkId, "Da sua tong tien can chuyen", nguoiXuLy, nowVN(), ghiChu).run();
    }
  }

  return { ...calculation, total: totalCanChuyen };
}
