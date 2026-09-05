import { Hono } from "hono";
import type { Env } from "./types";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import notificationsRoutes from "./routes/notifications";
import lkSettingsRoutes from "./routes/lkSettings";
import settingsDatMuaRoutes from "./routes/settingsDatMua";
import settingsKtvRoutes from "./routes/settingsKtv";
import ktvTonKhoRoutes from "./routes/ktvTonKho";
import datMuaLinhKienRoutes from "./routes/datMuaLinhKien";
import phieuXuatKhoRoutes from "./routes/phieuXuatKho";
import traHangRoutes from "./routes/traHang";
import baoCaoTocDoXuLyRoutes from "./routes/baoCaoTocDoXuLy";
import pushRoutes from "./routes/push";
import dvbhSyncRoutes from "./routes/dvbhSync";
import partnerApiRoutes from "./routes/partnerApi";
import { runDvbhSync } from "./lib/dvbhSyncClient";

// He doc lap "Dat mua linh kien" - tach tu he DVBH goc (xem CLAUDE.md muc "Nguon goc tach he
// thong"). CO 1 cron job DUY NHAT (them 2026-08-28, xem `scheduled` o duoi) - dong bo danh ba KTV/
// danh muc linh kien sang he DVBH goc dinh ky moi gio (xem lib/dvbhSyncClient.ts), ngoai ra khong co
// snapshot/archive/sync-sheet nao khac nhu he goc - he nay nho, moi bao cao tinh truc tiep hoac qua
// cachedReport() compute-on-miss, khong can luoi an toan rieng.
const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", authRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/lk-settings", lkSettingsRoutes);
app.route("/api/settings/ktv-lien-he", settingsKtvRoutes);
app.route("/api/settings/ktv-ton-kho", ktvTonKhoRoutes);
app.route("/api/settings", settingsDatMuaRoutes);
app.route("/api/dat-mua-lk", datMuaLinhKienRoutes);
app.route("/api/phieu-xuat-kho", phieuXuatKhoRoutes);
app.route("/api/tra-hang", traHangRoutes);
app.route("/api/bao-cao-toc-do", baoCaoTocDoXuLyRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/dvbh-sync", dvbhSyncRoutes);
app.route("/api/partner", partnerApiRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "INTERNAL_ERROR" }, 500);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  // Cron Trigger (wrangler.jsonc "triggers.crons": "0 * * * *", moi dau gio) - day danh ba KTV/danh
  // muc linh kien thay doi tu lan dong bo truoc sang he DVBH goc. waitUntil() de Cloudflare khong
  // cat request truoc khi cac lenh goi HTTP (qua CASE_LOOKUP_SERVICE) hoan tat.
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runDvbhSync(env, env.DB));
  },
};
