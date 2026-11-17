import { ganEnvToanCuc } from "./lib/envToanCuc";
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
import viPhamRoutes from "./routes/viPham";
import { quetViPham } from "./lib/viPham";
import pushRoutes from "./routes/push";
import dvbhSyncRoutes from "./routes/dvbhSync";
import gia88SyncRoutes from "./routes/gia88Sync";
import etxNhanSuSyncRoutes from "./routes/etxNhanSuSync";
import partnerApiRoutes from "./routes/partnerApi";
import khovanLookupRoutes from "./routes/khovanLookup";
import suachuaPartnerRoutes from "./routes/suachuaPartner";
import doiTacCongNoRoutes from "./routes/doiTacCongNo";
import partnerKhoRoutes from "./routes/partnerKho";
import thieuHangBhRoutes from "./routes/thieuHangBh";
import nhanThieuRoutes, { tuXacNhanVaNhacPxk } from "./routes/nhanThieu";
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
  ganEnvToanCuc(c.env); // lib/envToanCuc.ts (2026-10-27)
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
app.route("/api/nhan-thieu", nhanThieuRoutes);
app.route("/api/thieu-hang-bh", thieuHangBhRoutes); // Thieu hang bao hanh tu app suachua (2026-11-04, migration 0106)
// "/api/hoi-dap" + "/api/huong-dan" (Hoi dap KTV <-> Mua hang, migration 0089/0102/0103) DA XOA 2026-11-17 (v1.516, chu he thong: "xóa bỏ luôn
// tính năng hỏi đáp"). Bang hoi_dap*, huong_dan con nguyen du lieu tren D1 - chua xoa.
app.route("/api/khach-le", khachLeRoutes);
app.route("/api/doi-tac-cong-no", doiTacCongNoRoutes); // MUA HÀNG CÔNG NỢ ĐỐI TÁC (2026-10-26, migration 0099)
app.route("/api/bao-cao-toc-do", baoCaoTocDoXuLyRoutes);
app.route("/api/vi-pham", viPhamRoutes); // Qua han SLA / giai trinh / gan the vi pham (2026-11-17, migration 0125)
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
app.route("/api/suachua-partner", suachuaPartnerRoutes);

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
    ganEnvToanCuc(env);
    ctx.waitUntil(runDvbhSync(env, env.DB));
    // Qua han SLA tung buoc -> ghi nhan vi pham + gan the khi het han giai trinh (lib/viPham.ts) - moi gio.
    ctx.waitUntil(quetViPham(env).then(() => undefined).catch((err) => console.error("[quetViPham]", err)));
    // Them 2026-09-12: PULL bang gia tu doi tac gia88 1 lan/dem luc 0h GIO VN = 17h UTC (xem
    // lib/gia88Sync.ts) - tai dung DUNG cron hang gio co san thay vi them 1 entry cron rieng, chi gate
    // theo gio de tranh chay 24 lan/ngay khong can thiet (doi tac chi khuyen nghi "moi ngay/moi ca").
    if (new Date(event.scheduledTime).getUTCHours() === 17) {
      ctx.waitUntil(runGia88SyncWithState(env, env.DB));
      // Don so dem anh tai len cu (lib/anhUpload.ts) - chi can ngay hom nay, giu 30 ngay de tra cuu.
      ctx.waitUntil(env.DB.prepare("DELETE FROM anh_upload_ngay WHERE ngay < date('now', '+7 hours', '-30 days')").run().then(() => undefined));
      // v1.450: thong bao chua doc qua 30 ngay -> danh dau da doc (1 tai khoan tung giu 8.571 thong bao chua doc, moi lan dem chuong
      // doc hang nghin dong). Khong xoa - lich su thong bao van xem duoc.
      ctx.waitUntil(env.DB.prepare("UPDATE thong_bao_ktv SET da_doc = 1 WHERE da_doc = 0 AND ngay_tao < datetime('now', '-30 days')").run().then(() => undefined));
    }
    // Them 2026-09-17: PULL danh ba "ETX nhan su" 1 lan/7 ngay luc 0h thu Hai GIO VN = 17h UTC thu
    // Chu nhat (getUTCDay()===0) - tai dung DUNG cron hang gio co san, gate them theo thu de chi chay
    // 1 lan/tuan (xem lib/etxNhanSuSync.ts).
    if (new Date(event.scheduledTime).getUTCDay() === 0 && new Date(event.scheduledTime).getUTCHours() === 17) {
      ctx.waitUntil(runEtxNhanSuSyncWithState(env, env.DB));
    }
    // 8h sang VN (1h UTC, migration 0075): PXK "Dang gui KTV" qua 10 ngay -> tu "KTV da nhan" + nhac KTV phieu con cho xac nhan.
    if (new Date(event.scheduledTime).getUTCHours() === 1) {
      ctx.waitUntil(tuXacNhanVaNhacPxk(env).then(() => undefined).catch((err) => console.error("[tuXacNhanVaNhacPxk]", err)));
    }
  },
};
