import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { getPendingSyncCounts, getLastSyncTimes, runDvbhSync } from "../lib/dvbhSyncClient";

// Dong bo danh ba KTV/danh muc linh kien/Khu vuc sang cac he ngoai (phan hoi 2026-08-28 + 04/09/2026,
// xem lib/dvbhSyncClient.ts) - Admin-only, dung cho tab "Đồng bộ DVBH" trong SettingsModule.tsx (hien
// so thay doi dang cho + nut "Đồng bộ ngay"). Cron trong index.ts (`scheduled()`) goi thang
// runDvbhSync() moi gio, khong qua route nay - route nay CHI phuc vu status/trigger-tay tu UI.
// "Pending"/"lastSync" o day gio phan anh CA 2 dich (dvbh + suachua) - xem comment
// getEffectiveSinceForPending()/getOldestSyncedAt() trong dvbhSyncClient.ts (bi quan nhat: con 1 dich
// chua nhan thi van tinh la "dang cho"/"chua tung dong bo").
const dvbhSync = new Hono<{ Bindings: Env }>();
dvbhSync.use("*", verifySessionMiddleware, loadUser, requireRole("Admin"));

dvbhSync.get("/", async (c) => {
  const [pending, lastRun] = await Promise.all([getPendingSyncCounts(c.env, c.env.DB), getLastSyncTimes(c.env, c.env.DB)]);
  return c.json({
    ktvPending: pending.ktv,
    linhKienPending: pending.linhKien,
    khuVucPending: pending.khuVuc,
    lastSyncKtv: lastRun.ktv,
    lastSyncLinhKien: lastRun.linhKien,
    lastSyncKhuVuc: lastRun.khuVuc,
  });
});

dvbhSync.post("/run", async (c) => {
  const result = await runDvbhSync(c.env, c.env.DB);
  return c.json(result);
});

export default dvbhSync;
