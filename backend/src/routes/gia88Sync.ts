import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { runGia88SyncWithState } from "../lib/gia88Sync";

// Trang thai + trigger thu cong cho dong bo PULL tu API doi tac gia88 (xem lib/gia88Sync.ts). Admin-
// only, dung cho tab "Đồng bộ Gia88" trong SettingsModule.tsx. Cron trong index.ts (scheduled(), gate
// theo gio UTC=17 tuc 0h VN) goi thang runGia88SyncWithState() moi dem, khong qua route nay - route
// nay CHI phuc vu status/trigger-tay tu UI, giong het pattern routes/dvbhSync.ts.
const gia88Sync = new Hono<{ Bindings: Env }>();
gia88Sync.use("*", verifySessionMiddleware, loadUser, requireRole("Admin"));

interface Gia88SyncStateRow {
  last_run_at: string | null;
  last_status: string | null;
  changed_count: number;
  last_error: string | null;
}

gia88Sync.get("/", async (c) => {
  const row = await c.env.DB.prepare("SELECT last_run_at, last_status, changed_count, last_error FROM gia88_sync_state WHERE id = 1").first<Gia88SyncStateRow>();
  return c.json(row ?? { last_run_at: null, last_status: null, changed_count: 0, last_error: null });
});

gia88Sync.post("/run", async (c) => {
  await runGia88SyncWithState(c.env, c.env.DB);
  const row = await c.env.DB.prepare("SELECT last_run_at, last_status, changed_count, last_error FROM gia88_sync_state WHERE id = 1").first<Gia88SyncStateRow>();
  return c.json(row);
});

export default gia88Sync;
