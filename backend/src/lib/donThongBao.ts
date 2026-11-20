import type { D1Database } from "@cloudflare/workers-types";
import { nowVN } from "./vnTime";

/**
 * Tu xoa thong bao chuong (thong_bao_ktv) qua 10 ngay (2026-11-20, v1.534 - "thêm nguyên tắc các thông báo sau 10 ngày tự clear để giảm tải
 * áp lực cho hệ thống lưu trữ"; luc lam: 149.555 dong, 117.411 dong qua 10 ngay). XOA HAN (ca da doc lan chua doc) - goi o cron 0h VN.
 * Xoa theo lo 5.000 dong (theo id tang dan) de 1 lenh khong qua nang. Thay quy tac cu "chua doc qua 30 ngay -> danh dau da doc" (v1.450).
 * Anh huong da biet: the "Đơn bị từ chối" (sentinel __TU_CHOI_CHUA_XEM__) chi con dem don bi tu choi trong 10 ngay gan nhat.
 */
export const SO_NGAY_GIU_THONG_BAO = 10;

export async function xoaThongBaoCu(db: D1Database): Promise<number> {
  const moc = new Date(Date.parse(nowVN().replace(" ", "T") + "Z") - SO_NGAY_GIU_THONG_BAO * 86400_000).toISOString().replace("T", " ").slice(0, 19);
  let tong = 0;
  for (let i = 0; i < 60; i++) {
    const r = await db
      .prepare("DELETE FROM thong_bao_ktv WHERE id IN (SELECT id FROM thong_bao_ktv WHERE ngay_tao < ? ORDER BY id LIMIT 5000)")
      .bind(moc)
      .run();
    const n = r.meta.changes ?? 0;
    tong += n;
    if (n < 5000) break;
  }
  return tong;
}
