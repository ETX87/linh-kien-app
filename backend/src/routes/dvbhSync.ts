import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { getPendingSyncCounts, getLastSyncTimes, runDvbhSync } from "../lib/dvbhSyncClient";

// Dong bo danh ba KTV/danh muc linh kien sang he DVBH goc (phan hoi 2026-08-28, xem
// lib/dvbhSyncClient.ts) - Admin-only, dung cho tab "Đồng bộ DVBH" trong SettingsModule.tsx (hien so
// thay doi dang cho + nut "Đồng bộ ngay"). Cron trong index.ts (`scheduled()`) goi thang runDvbhSync()
// moi gio, khong qua route nay - route nay CHI phuc vu status/trigger-tay tu UI.
const dvbhSync = new Hono<{ Bindings: Env }>();
dvbhSync.use("*", verifySessionMiddleware, loadUser, requireRole("Admin"));

dvbhSync.get("/", async (c) => {
  const [pending, lastRun] = await Promise.all([getPendingSyncCounts(c.env.DB), getLastSyncTimes(c.env.DB)]);
  return c.json({
    ktvPending: pending.ktv,
    linhKienPending: pending.linhKien,
    lastSyncKtv: lastRun.ktv,
    lastSyncLinhKien: lastRun.linhKien,
  });
});

dvbhSync.post("/run", async (c) => {
  const result = await runDvbhSync(c.env, c.env.DB);
  return c.json(result);
});

export default dvbhSync;
