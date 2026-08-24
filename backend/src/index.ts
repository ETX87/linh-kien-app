import { Hono } from "hono";
import type { Env } from "./types";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import notificationsRoutes from "./routes/notifications";
import lkSettingsRoutes from "./routes/lkSettings";
import settingsDatMuaRoutes from "./routes/settingsDatMua";
import settingsKtvRoutes from "./routes/settingsKtv";
import datMuaLinhKienRoutes from "./routes/datMuaLinhKien";
import phieuXuatKhoRoutes from "./routes/phieuXuatKho";
import traHangRoutes from "./routes/traHang";

// He doc lap "Dat mua linh kien" - tach tu he DVBH goc (xem CLAUDE.md muc "Nguon goc tach he
// thong"). KHONG co cron job nao (khong co snapshot/archive/sync-sheet nhu he goc - he nay nho, moi
// bao cao tinh truc tiep hoac qua cachedReport() compute-on-miss, khong can luoi an toan rieng).
const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", authRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/lk-settings", lkSettingsRoutes);
app.route("/api/settings/ktv-lien-he", settingsKtvRoutes);
app.route("/api/settings", settingsDatMuaRoutes);
app.route("/api/dat-mua-lk", datMuaLinhKienRoutes);
app.route("/api/phieu-xuat-kho", phieuXuatKhoRoutes);
app.route("/api/tra-hang", traHangRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "INTERNAL_ERROR" }, 500);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
};
