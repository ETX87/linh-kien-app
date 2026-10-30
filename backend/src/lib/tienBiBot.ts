// "Tiền đã chuyển bị bớt" (2026-10-29, phan hoi "KTV chuyển đủ tiền, nhưng TN hoặc KT bỏ bớt đơn khỏi phiếu, KTV nhìn vào thấy tổng
// tiền của phiếu ít hơn thực tế họ chuyển, gây hiểu lầm => thêm 1 cảnh báo số tiền thực tế đã chuyển sau đó bị bớt đi do lý do gì"):
// cac lan BO DON khoi phieu / HOAN TIEN ve quy xay ra SAU lan dau tien vao phieu (KTV dinh bang chung, Ke toan duyet khoan, tru quy
// du). Doc tu log san co (khong luu them) -> dung chung chi tiet PXK (GET /phieu-xuat-kho/:id) + khoi PXK trong chi tiet don cua KTV.

export interface TienBiBot {
  ngay_xu_ly: string;
  nguoi_xu_ly: string | null;
  trang_thai: string;
  ghi_chu: string | null;
}

export async function tienBiBotPxk(db: D1Database, pxkId: string): Promise<TienBiBot[]> {
  const { results } = await db
    .prepare(
      `WITH moc AS (
         SELECT MIN(t) AS t FROM (
           SELECT MIN(ngay_xu_ly) AS t FROM phieu_xuat_kho_log
             WHERE phieu_xuat_kho_id = ?1 AND trang_thai IN ('Da dinh bang chung chuyen tien', 'Tru quy du')
           UNION ALL
           SELECT MIN(duyet_luc) FROM khoan_chuyen_tien WHERE phieu_xuat_kho_id = ?1 AND trang_thai = 'Da duyet'
         )
       )
       SELECT l.ngay_xu_ly, l.nguoi_xu_ly, l.trang_thai, l.ghi_chu
       FROM phieu_xuat_kho_log l, moc
       WHERE l.phieu_xuat_kho_id = ?1 AND moc.t IS NOT NULL AND l.ngay_xu_ly > moc.t
         AND l.trang_thai IN ('Da xoa don khoi phieu', 'Hoan tien ve quy')
       ORDER BY l.id`,
    )
    .bind(pxkId)
    .all<TienBiBot>();
  return results;
}
