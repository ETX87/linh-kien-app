import { Hono } from "hono";
import type { Env } from "../types";
import { khoaKhop } from "../lib/baoVe";
import { nowVN } from "../lib/vnTime";

// He "Sua chua bao hanh" (Worker suachua) goi vao day qua Service Binding khi Admin BH sua tay "Phan
// loai" (cot don_vi) cua 1 linh kien dong bo (2026-10-11, yeu cau "phan loai cho phep dong bo nguoc ve
// danh sach linh kien app"). Xac thuc bang CHINH secret dong bo da dung chung giua 2 he (chieu
// linh-kien-app -> suachua gui X-Sync-Key = SUACHUA_SYNC_API_KEY), khong can tao key moi. Ghi
// ngay_cap_nhat moi de dot dong bo tiep theo day lai gia tri moi sang ca dvbh lan suachua (nhat quan).
const suachuaPartner = new Hono<{ Bindings: Env }>();

suachuaPartner.use("*", async (c, next) => {
  if (!(await khoaKhop(c.req.header("X-Sync-Key"), c.env.SUACHUA_SYNC_API_KEY))) return c.json({ error: "INVALID_KEY" }, 401);
  await next();
});

// POST /api/suachua-partner/phan-loai - { rows: [{ ma_linh_kien, don_vi }] } (toi da 500 dong/lan).
suachuaPartner.post("/phan-loai", async (c) => {
  const body = await c.req.json<{ rows?: { ma_linh_kien?: string; don_vi?: string | null }[] }>().catch(() => ({}) as { rows?: undefined });
  if (!Array.isArray(body.rows) || body.rows.length > 500) return c.json({ error: "INVALID_BODY" }, 400);
  const rows = body.rows.filter((r) => typeof r.ma_linh_kien === "string" && r.ma_linh_kien.trim());
  if (!rows.length) return c.json({ cap_nhat: 0, khong_thay: [] });
  const ma = rows.map((r) => r.ma_linh_kien!.trim());
  const { results } = await c.env.DB.prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ma))
    .all<{ ma_linh_kien: string }>();
  const co = new Set(results.map((r) => r.ma_linh_kien));
  const now = nowVN();
  const stmts = rows
    .filter((r) => co.has(r.ma_linh_kien!.trim()))
    .map((r) =>
      c.env.DB.prepare("UPDATE linh_kien SET don_vi = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ? AND COALESCE(don_vi, '') <> COALESCE(?, '')").bind(
        (r.don_vi ?? "").trim() || null,
        now,
        r.ma_linh_kien!.trim(),
        (r.don_vi ?? "").trim() || null,
      ),
    );
  // Chi dong co gia tri THUC SU khac moi bi ghi (dieu kien trong WHERE) - dem dung so dong doi.
  const res = stmts.length ? await c.env.DB.batch(stmts) : [];
  return c.json({ cap_nhat: res.reduce((n, r) => n + (r.meta?.changes ?? 0), 0), khong_thay: ma.filter((m) => !co.has(m)) });
});

// GET /api/suachua-partner/etx-nhan-su - danh ba "ETX nhan su" (2026-10-16, yeu cau suachua "tu duyet neu co tren ETX, tu
// khoa neu nghi viec"). suachua KHONG goi thang API ETX (khong can them secret ETX, khong tang tai doi tac) - doc lai bang
// etx_nhan_su ma he nay da PULL hang tuan. Chi tra cac cot can cho duyet/khoa tai khoan.
suachuaPartner.get("/etx-nhan-su", async (c) => {
  const [{ results }, state] = await Promise.all([
    c.env.DB.prepare("SELECT ma_nhan_su, ho_ten, chuc_danh, gmail, trang_thai_lam_viec, ma_ktv FROM etx_nhan_su").all(),
    c.env.DB.prepare("SELECT last_run_at, last_status FROM etx_nhan_su_sync_state WHERE id = 1").first<{ last_run_at: string | null; last_status: string | null }>(),
  ]);
  return c.json({ rows: results, etx_dong_bo_luc: state?.last_run_at ?? null, etx_trang_thai: state?.last_status ?? null });
});

export default suachuaPartner;
