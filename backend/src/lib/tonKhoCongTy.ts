// "Ton kho Kho cong ty" (them 2026-09-11, phan hoi nguoi dung: tu dong duyet don mua/cong no khi
// kho con du hang) - dung CHUNG mot phan kien truc voi lib/congNoKtv.ts (Ton goc + Ton phat sinh =
// Ton chot), nhung khac o 2 diem CHOT theo nguoi dung:
//   - Ton phat sinh tinh CA don "dang ton" (chua xu ly xong) LAN "da duyet" (KHONG chi rieng da
//     duyet nhu cong no) - vi phai khoa (reserve) hang tu luc dat, tranh 2 don cung luc auto-duyet
//     de len cung 1 luong ton.
//   - Cong don theo TAT CA kho_cong_ty dang bat (bat_tat=1) cung phuc vu 1 Khu vuc (khong phan biet
//     kho theo hang/muc dich - CHOT nguoi dung "Cộng gộp tất cả kho cùng Miền", chap nhan rui ro neu
//     1 ma hang thuc te chi nam o kho rieng cua 1 hang).
// Moc tinh ton kho = luc import gan nhat (dung CHUNG app_settings key voi ktv_ton_kho vi CA 2 bang
// deu ghi de trong CUNG 1 lan import 1 file MISA - xem routes/ktvTonKho.ts POST /import).
export async function getMocTonKhoCongTy(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT updated_at FROM app_settings WHERE key = 'ktv_ton_kho_import_meta'").first<{ updated_at: string }>();
  return row?.updated_at ?? null;
}

// "Ton goc" = tong cuoi_ky cua MOI kho_cong_ty dang bat (bat_tat=1) duoc gan Khu vuc nay, cho dung
// 1 ma hang.
export async function computeTonKhoGoc(db: D1Database, khuVucMa: string, maLk: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(t.cuoi_ky), 0) as gia_tri
       FROM kho_cong_ty_ton_kho t
       JOIN kho_cong_ty k ON k.ma = t.kho_ma
       JOIN kho_cong_ty_khu_vuc kv ON kv.kho_ma = k.ma
       WHERE k.bat_tat = 1 AND kv.khu_vuc_ma = ? AND t.ma_hang = ?`,
    )
    .bind(khuVucMa, maLk)
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

// "Ton phat sinh" = tong so_luong_de_xuat cua cac dong dat_don_hang (loai_don mua/cong_no) CUNG ma hang, CUNG Khu vuc, tao SAU moc
// tinh ton kho, CHUA bi tu choi/huy (TAT CA trang thai con lai deu tinh, ke ca dang cho duyet / cho hang - xem giai thich dau file).
// SUA 2026-10-14 (tu dong duyet 100%, migration 0080): khu vuc = KHU VUC CUA DON (COALESCE(khu_vuc_chon, khu_vuc_ma)) thay vi
// ktv_lien_he cua nguoi nhan - tinh duoc ca don nguoi nhan khong phai KTV (GS/TN, KH le). `truocDon` co -> CHI tinh cac don tao
// TRUOC don do (ngay_tao, id) - uu tien don tao truoc (tru dan cung ma, chot nguoi dung: don truoc du hang, don sau thieu).
export async function computeTonKhoPhatSinh(
  db: D1Database, khuVucMa: string, maLk: string, mocTonKho: string | null, truocDon?: { id: string; ngay_tao: string },
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(ddh.so_luong_de_xuat), 0) as gia_tri
       FROM dat_don_hang ddh
       WHERE ddh.ma_lk = ? AND COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) = ? AND ddh.loai_don IN ('mua', 'cong_no')
         -- "TRỪ CÔNG NỢ" lay tu ton kho CUA KTV, khong giu hang kho cong ty (chot 2026-09-28, lib/tonKhoKtv.ts)
         AND instr(COALESCE(ddh.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') = 0
         AND ddh.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')
         AND (? IS NULL OR ddh.ngay_tao > ?)${truocDon ? " AND (ddh.ngay_tao < ? OR (ddh.ngay_tao = ? AND ddh.id < ?))" : ""}`,
    )
    .bind(maLk, khuVucMa, mocTonKho, mocTonKho, ...(truocDon ? [truocDon.ngay_tao, truocDon.ngay_tao, truocDon.id] : []))
    .first<{ gia_tri: number }>();
  return row?.gia_tri ?? 0;
}

// "Ton chot" = Ton goc - Ton phat sinh (co the am neu da dat vuot ton thuc te ghi nhan luc import -
// khong clamp ve 0, ben goi chi can so sanh >= so_luong_de_xuat cua dong DANG xet).
// LK "Không kiểm tra tồn kho" (chot 2026-11-13, v1.489, migration 0118 - "1 số link kiện thuộc dạng không cần kiểm tra tồn kho, ví dụ
// như phí dịch vụ. mặc định đặt là có hàng"): computeTonKhoChot tra so nay -> moi noi so ton >= SL deu coi la du (tao don, doi loai de
// xuat, xet lai khi doi khu vuc / thanh toan, goi y thay the). Hien thi: moTaThieuTon (tuDongDuyet.ts) + FE lib/tonKhongKiem.ts doi so nay
// thanh "không kiểm tra tồn kho". 2 truy van SQL (donChoHangDuTonKho, tuDongHangVe.ts) dung KHONG_KIEM_TON_SQL cho cung ket qua.
export const TON_KHONG_KIEM = 1_000_000_000;
export const KHONG_KIEM_TON_SQL = (maLk: string) =>
  `EXISTS (SELECT 1 FROM linh_kien lkt WHERE lkt.ma_linh_kien = ${maLk} AND lkt.khong_kiem_ton = 1)`;

export async function laLkKhongKiemTon(db: D1Database, maLk: string): Promise<boolean> {
  const r = await db.prepare("SELECT khong_kiem_ton FROM linh_kien WHERE ma_linh_kien = ?").bind(maLk).first<{ khong_kiem_ton: number }>();
  return !!r?.khong_kiem_ton;
}

export async function computeTonKhoChot(
  db: D1Database, khuVucMa: string | null, maLk: string, truocDon?: { id: string; ngay_tao: string },
): Promise<number> {
  if (await laLkKhongKiemTon(db, maLk)) return TON_KHONG_KIEM;
  if (!khuVucMa) return 0;
  const moc = await getMocTonKhoCongTy(db);
  const [tonGoc, tonPhatSinh] = await Promise.all([
    computeTonKhoGoc(db, khuVucMa, maLk),
    computeTonKhoPhatSinh(db, khuVucMa, maLk, moc, truocDon),
  ]);
  return tonGoc - tonPhatSinh;
}

// DON "CHO HANG" DA CO DU TON KHO CONG TY (chot 2026-10-16: "sau khi kế toán import tồn kho (hoặc đồng bộ tồn kho mới) => đánh giá
// cho các đơn tồn lâu nhất về gần => nếu sl tồn kho >= số lượng cần => nhắc Kho có thể xác nhận"). Tinh LUC DOC (khong luu) nen luon
// theo file ton kho moi nhat. Theo tung (ma LK, khu vuc cua don): ton kha dung = ton goc (computeTonKhoGoc) - SL cac don KHAC "Cho hang"
// dang giu hang sau moc import (cung dieu kien computeTonKhoPhatSinh); cac don "Cho hang" xep CU NHAT truoc (ngay_tao, id), cong don
// SL - don nao luy ke <= ton kha dung = du hang. Chi xet nhom Mua/Cong no, khong TRỪ CÔNG NỢ (lay ton KTV, khong lay kho cong ty).
export async function donChoHangDuTonKho(db: D1Database): Promise<Set<string>> {
  const moc = await getMocTonKhoCongTy(db);
  const { results } = await db
    .prepare(
      `WITH cho AS (
         SELECT ddh.id, ddh.ma_lk, COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) AS kv, ddh.so_luong_de_xuat AS sl, ddh.ngay_tao
         FROM dat_don_hang ddh
         WHERE ddh.trang_thai_hien_tai = 'Cho hang' AND ddh.loai_don IN ('mua', 'cong_no')
           AND instr(COALESCE(ddh.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') = 0
       ),
       cap AS (SELECT DISTINCT ma_lk, kv FROM cho),
       ton AS (
         SELECT c.ma_lk, c.kv, CASE WHEN ${KHONG_KIEM_TON_SQL("c.ma_lk")} THEN ${TON_KHONG_KIEM} ELSE
           COALESCE((SELECT SUM(t.cuoi_ky) FROM kho_cong_ty_ton_kho t JOIN kho_cong_ty k ON k.ma = t.kho_ma
                     JOIN kho_cong_ty_khu_vuc x ON x.kho_ma = k.ma
                     WHERE k.bat_tat = 1 AND x.khu_vuc_ma = c.kv AND t.ma_hang = c.ma_lk), 0)
           - COALESCE((SELECT SUM(d.so_luong_de_xuat) FROM dat_don_hang d
                       WHERE d.ma_lk = c.ma_lk AND COALESCE(d.khu_vuc_chon, d.khu_vuc_ma) = c.kv AND d.loai_don IN ('mua', 'cong_no')
                         AND instr(COALESCE(d.loai_de_xuat, ''), 'TRỪ CÔNG NỢ') = 0
                         AND d.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy', 'Cho hang')
                         AND (? IS NULL OR d.ngay_tao > ?)), 0) END AS kha_dung
         FROM cap c
       ),
       luy_ke AS (
         SELECT id, ma_lk, kv, SUM(sl) OVER (PARTITION BY ma_lk, kv ORDER BY ngay_tao, id ROWS UNBOUNDED PRECEDING) AS lk FROM cho
       )
       SELECT l.id FROM luy_ke l JOIN ton USING (ma_lk, kv) WHERE l.lk <= ton.kha_dung`,
    )
    .bind(moc, moc)
    .all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}
