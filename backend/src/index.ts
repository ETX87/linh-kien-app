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
import quyKtvRoutes from "./routes/quyKtv";
import khachLeRoutes from "./routes/khachLe";
import baoCaoTocDoXuLyRoutes from "./routes/baoCaoTocDoXuLy";
import pushRoutes from "./routes/push";
import dvbhSyncRoutes from "./routes/dvbhSync";
import gia88SyncRoutes from "./routes/gia88Sync";
import etxNhanSuSyncRoutes from "./routes/etxNhanSuSync";
import partnerApiRoutes from "./routes/partnerApi";
import khovanLookupRoutes from "./routes/khovanLookup";
import partnerKhoRoutes from "./routes/partnerKho";
import { runDvbhSync } from "./lib/dvbhSyncClient";
import { runGia88SyncWithState } from "./lib/gia88Sync";
import { runEtxNhanSuSyncWithState } from "./lib/etxNhanSuSync";
import { chanGhiTuSiteKhac, gioiHanTanSuat, headerBaoMatApi } from "./lib/baoVe";

// He doc lap "Dat mua linh kien" - tach tu he DVBH goc (xem CLAUDE.md muc "Nguon goc tach he
// thong"). CO 1 cron job DUY NHAT (them 2026-08-28, xem `scheduled` o duoi) - dong bo danh ba KTV/
// danh muc linh kien sang he DVBH goc dinh ky moi gio (xem lib/dvbhSyncClient.ts), ngoai ra khong co
// snapshot/archive/sync-sheet nao khac nhu he goc - he nay nho, moi bao cao tinh truc tiep hoac qua
// cachedReport() compute-on-miss, khong can luoi an toan rieng.
const app = new Hono<{ Bindings: Env }>();

// Request ID nhe (phan hoi audit AUD-007: loi generic khong the truy vet) - gan 1 id ngau nhien cho
// MOI request, dinh kem vao ca log server (console.error) lan response loi generic, de doi chieu 2
// ben khi nguoi dung bao loi. KHONG dung cho cac response loi da co ma ro nghia rieng (NOT_FOUND,
// FORBIDDEN_ROLE...) - chi bo sung cho nhanh catch-all onError ben duoi.
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

// Lop bao ve chung cho moi API (2026-10-08) - header bao mat, gioi han tan suat, chan request ghi tu site khac. Xem
// lib/baoVe.ts. Dat TRUOC moi router de chan som, truoc moi truy van D1.
app.use("/api/*", headerBaoMatApi);
app.use("/api/*", gioiHanTanSuat);
app.use("/api/*", chanGhiTuSiteKhac);

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
app.route("/api/quy-ktv", quyKtvRoutes);
app.route("/api/khach-le", khachLeRoutes);
app.route("/api/bao-cao-toc-do", baoCaoTocDoXuLyRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/dvbh-sync", dvbhSyncRoutes);
app.route("/api/gia88-sync", gia88SyncRoutes);
app.route("/api/etx-nhan-su", etxNhanSuSyncRoutes);
app.route("/api/partner", partnerApiRoutes);
// KHONG mount duoi "/api/partner/*" - partnerApiRoutes o tren da co san 1 middleware
// "*" xac thuc rieng (X-API-Key, xem lib/partnerApiAuth.ts) khop CA cac duong dan con
// nay (Hono chay middleware theo pattern, khong quan tam sub-app nao dinh nghia route
// cuoi cung) - phat hien qua smoke test that (401 "MISSING_API_KEY" du dung dung
// "X-Khovan-Key" va key hop le). Dung tien to rieng de tranh dung do.
app.route("/api/khovan-partner/box-lookup", khovanLookupRoutes);
app.route("/api/khovan-partner/kho-action", partnerKhoRoutes);

app.onError((err, c) => {
  const requestId = c.get("requestId") ?? "unknown";
  console.error(`[${requestId}]`, err);
  return c.json({ error: "INTERNAL_ERROR", requestId }, 500);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  // Cron Trigger (wrangler.jsonc "triggers.crons": "0 * * * *", moi dau gio) - day danh ba KTV/danh
  // muc linh kien thay doi tu lan dong bo truoc sang he DVBH goc. waitUntil() de Cloudflare khong
  // cat request truoc khi cac lenh goi HTTP (qua CASE_LOOKUP_SERVICE) hoan tat.
  scheduled: async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runDvbhSync(env, env.DB));
    // Them 2026-09-12: PULL bang gia tu doi tac gia88 1 lan/dem luc 0h GIO VN = 17h UTC (xem
    // lib/gia88Sync.ts) - tai dung DUNG cron hang gio co san thay vi them 1 entry cron rieng, chi gate
    // theo gio de tranh chay 24 lan/ngay khong can thiet (doi tac chi khuyen nghi "moi ngay/moi ca").
    if (new Date(event.scheduledTime).getUTCHours() === 17) {
      ctx.waitUntil(runGia88SyncWithState(env, env.DB));
      // Don so dem anh tai len cu (lib/anhUpload.ts) - chi can ngay hom nay, giu 30 ngay de tra cuu.
      ctx.waitUntil(env.DB.prepare("DELETE FROM anh_upload_ngay WHERE ngay < date('now', '+7 hours', '-30 days')").run().then(() => undefined));
    }
    // Them 2026-09-17: PULL danh ba "ETX nhan su" 1 lan/7 ngay luc 0h thu Hai GIO VN = 17h UTC thu
    // Chu nhat (getUTCDay()===0) - tai dung DUNG cron hang gio co san, gate them theo thu de chi chay
    // 1 lan/tuan (xem lib/etxNhanSuSync.ts).
    if (new Date(event.scheduledTime).getUTCDay() === 0 && new Date(event.scheduledTime).getUTCHours() === 17) {
      ctx.waitUntil(runEtxNhanSuSyncWithState(env, env.DB));
    }
  },
};
