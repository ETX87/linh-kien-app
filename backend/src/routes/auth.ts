import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { signSession } from "../lib/jwt";
import { verifySessionMiddleware, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../middleware/session";
import { loadUser, VIEW_AS_COOKIE } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { isViewAsRole } from "../lib/viewAsPresets";
import { resyncKhuVucDerivedFieldsForEmail } from "../lib/khuVucSync";

const STATE_COOKIE = "dvbh_oauth_state";

const auth = new Hono<{ Bindings: Env }>();

auth.get("/login", async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 600,
    path: "/",
  });

  const redirectUri = c.env.GOOGLE_REDIRECT_URI;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

auth.get("/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });

  if (!code || !state || !savedState || state !== savedState) {
    return c.text("Xac thuc that bai: state khong hop le.", 400);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: c.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return c.text("Khong the doi ma xac thuc voi Google.", 502);
  }
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userInfoRes.ok) {
    return c.text("Khong the lay thong tin nguoi dung tu Google.", 502);
  }
  const userInfo = (await userInfoRes.json()) as { email: string; email_verified: boolean; name?: string };

  if (!userInfo.email_verified) {
    return c.text("Email Google chua duoc xac minh.", 403);
  }

  const isBootstrapAdmin = userInfo.email === c.env.BOOTSTRAP_ADMIN_EMAIL;

  // CHOT 2026-08-16 (dot 3 gop y #3): neu email khop 1 dong ktv_lien_he.email_dang_nhap, tu dong
  // KICH HOAT HOAN TOAN tai khoan ngay luc dang nhap (bo qua buoc Admin duyet) + gan san vai
  // tro/co - khop dung co che provisionPlaceholderUser da xay (settings.ts, vai_tro=NULL cho
  // KTV/Ve tinh, effectiveModules() da xu ly an toan gia tri nay). CHI ap dung khi tai khoan van
  // dang "Cho duyet" (tai khoan MOI hoac placeholder tao truoc do) - KHONG BAO GIO ghi de 1 tai
  // khoan da duyet/cau hinh thu cong truoc do (xem CASE WHEN trong cau UPSERT ben duoi).
  // "Giam sat quan ly" (yeu cau 2026-08-25, hang muc #3): users.giam_sat_quan_ly la NGUON DUY NHAT -
  // KHONG con tu dong copy tu ktv_lien_he.giam_sat_quan_ly o day nua (Admin gan rieng trong Users
  // module). ktv_lien_he.giam_sat_quan_ly gio chi la ghi chu danh ba, khong lien quan phan quyen.
  let ktvMatch: { laKtvDvbh: number; laVeTinh: number } | null = null;
  if (!isBootstrapAdmin) {
    const ktvRow = await c.env.DB.prepare("SELECT vai_tro_ktv FROM ktv_lien_he WHERE email_dang_nhap = ?")
      .bind(userInfo.email)
      .first<{ vai_tro_ktv: string | null }>();
    if (ktvRow) {
      ktvMatch = {
        laKtvDvbh: ktvRow.vai_tro_ktv === "Ve tinh" ? 0 : 1,
        laVeTinh: ktvRow.vai_tro_ktv === "Ve tinh" ? 1 : 0,
      };
    }
  }

  await c.env.DB.prepare("PRAGMA foreign_keys = ON").run();
  if (ktvMatch) {
    await c.env.DB.prepare(
      `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, la_ktv_dvbh, la_ve_tinh)
       VALUES (?, ?, NULL, 'Da duyet', ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         ten = excluded.ten,
         updated_at = ?,
         trang_thai_duyet = CASE WHEN trang_thai_duyet = 'Cho duyet' THEN 'Da duyet' ELSE trang_thai_duyet END,
         la_ktv_dvbh = CASE WHEN trang_thai_duyet = 'Cho duyet' THEN ? ELSE la_ktv_dvbh END,
         la_ve_tinh = CASE WHEN trang_thai_duyet = 'Cho duyet' THEN ? ELSE la_ve_tinh END`,
    )
      .bind(
        userInfo.email,
        userInfo.name ?? null,
        ktvMatch.laKtvDvbh,
        ktvMatch.laVeTinh,
        nowVN(),
        ktvMatch.laKtvDvbh,
        ktvMatch.laVeTinh,
      )
      .run();
    // Phase 4 (2026-08-26): dong bo giam_sat_quan_ly/tram_cha tu Khu vuc/KTV cap 1 phu trach ngay
    // sau khi tai khoan duoc tao/kich hoat lan dau - xem lib/khuVucSync.ts.
    await resyncKhuVucDerivedFieldsForEmail(c.env.DB, userInfo.email);
  } else {
    // Upsert ten hien thi (khong dong lai vai_tro/trang_thai_duyet o day - loadUser xu ly).
    await c.env.DB.prepare(
      `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET ten = excluded.ten, updated_at = ?`,
    )
      .bind(
        userInfo.email,
        userInfo.name ?? null,
        isBootstrapAdmin ? "Admin" : null,
        isBootstrapAdmin ? "Da duyet" : "Cho duyet",
        nowVN(),
      )
      .run();
  }

  // Ghi nhat ky dang nhap (bao mat noi bo - Admin tra cuu ai dang nhap luc nao tu dau).
  // CF-Connecting-IP la header Cloudflare tu dong gan, dang tin cay hon so voi client tu khai bao.
  await c.env.DB.prepare("INSERT INTO login_log (email, thoi_gian, ip, user_agent) VALUES (?, ?, ?, ?)")
    .bind(userInfo.email, nowVN(), c.req.header("CF-Connecting-IP") ?? null, c.req.header("User-Agent") ?? null)
    .run();

  const token = await signSession({ email: userInfo.email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });

  return c.redirect(c.env.FRONTEND_URL || "/");
});

// GET /api/auth/dev-login - cua sau CHI hoat dong khi LOCAL_DEV_BYPASS_AUTH=true (chi dat trong
// .dev.vars, khong bao gio co tren production - xem Env.LOCAL_DEV_BYPASS_AUTH o types.ts). Bo qua
// toan bo vong Google OAuth that (.dev.vars dung GOOGLE_CLIENT_ID gia, xem secrets.md), dang nhap
// thang vao tai khoan BOOTSTRAP_ADMIN_EMAIL voi vai_tro Admin de test giao dien local day du.
auth.get("/dev-login", async (c) => {
  if (c.env.LOCAL_DEV_BYPASS_AUTH !== "true") return c.text("Not found", 404);

  const email = c.env.BOOTSTRAP_ADMIN_EMAIL;
  await c.env.DB.prepare(
    `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet)
     VALUES (?, ?, 'Admin', 'Da duyet')
     ON CONFLICT(email) DO UPDATE SET updated_at = ?`,
  )
    .bind(email, "Dev Admin (local bypass)", nowVN())
    .run();

  const token = await signSession({ email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });

  return c.redirect(c.env.FRONTEND_URL || "/");
});

auth.post("/logout", async (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// GET /api/auth/me - hydrate phien dang nhap. Tien the: 1 UPDATE nguyen tu doi chieu ngay lich
// VN (+7h) de xac dinh day co phai lan mo app dau tien trong ngay khong (khong dua vao tan suat
// OAuth callback vi phien dang nhap keo dai 8h, co the dang nhap lai nhieu lan/ngay). meta.changes
// = 1 nghia la ngay luu khac ngay hom nay -> day la lan dau -> tra showDailyReport de FE ban toast.
auth.get("/me", verifySessionMiddleware, loadUser, async (c) => {
  const user = c.get("user");
  const viewAsRole = c.get("viewAsRole");
  const realIsAdmin = c.get("realIsAdmin");

  // GD4 (phan hoi Codex #16/#17, module Dat mua linh kien): "la_tram" TINH THAT (co it nhat 1 Ve
  // tinh voi tram_cha = email minh), cung dung 1 query voi notifications.ts (routes/notifications.ts
  // dong 170). Truoc day frontend tu suy "la Tram" qua heuristic `la_ktv_dvbh && !tram_cha` (tuc
  // "la KTV va KHONG phai Ve tinh cua ai") - dung SAI cho KTV thuong khong quan ly Ve tinh nao (ho
  // cung khong co tram_cha, nen bi nham la Tram, mac dinh sai vao bucket "Cho Tram duyet" luon rong
  // voi ho). Tra them field nay de FE dung truc tiep, khong tu suy dien nua.
  // Khi dang "xem thu vai tro" (viewAsRole != null), user.la_tram DA duoc applyViewAsOverride() dat
  // dung (force true cho preset "tram", false cho con lai) - BO QUA query EXISTS that o day, vi no
  // luon doi chieu theo email Admin THAT (gan nhu chac chan khong co Ve tinh nao) chu khong phai
  // vai tro dang gia lap, se ghi de sai ket qua da tinh dung tu override.
  let la_tram = user.la_tram;
  if (!viewAsRole) {
    const laTramRow = await c.env.DB.prepare("SELECT 1 as x FROM users WHERE tram_cha = ? LIMIT 1").bind(user.email).first();
    la_tram = !!laTramRow;
  }

  return c.json({ user: { ...user, la_tram }, realIsAdmin, viewAsRole });
});

// POST /api/auth/view-as - Admin-only "xem thu vai tro" (phan hoi 2026-08-20: test nhanh theo tung
// man hinh dung nhu 1 vai tro nghiep vu that, khong can tao tai khoan rac). body { role } la 1 trong
// VIEW_AS_ROLE_KEYS, hoac null/rong de thoat ve chinh Admin that. Chi doi 1 cookie httpOnly rieng -
// khong dung SESSION_COOKIE nen khong anh huong phien dang nhap that, va realIsAdmin luon doi chieu
// lai DB o loadUser.ts (khong tin gia tri cookie mu quang) nen khong the bi loi dung de leo thang
// quyen boi tai khoan khong phai Admin that.
auth.post("/view-as", verifySessionMiddleware, loadUser, async (c) => {
  if (!c.get("realIsAdmin")) return c.json({ error: "FORBIDDEN" }, 403);

  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const role = (body as { role?: unknown }).role;

  if (role === null || role === undefined || role === "") {
    deleteCookie(c, VIEW_AS_COOKIE, { path: "/" });
    return c.json({ ok: true });
  }
  if (!isViewAsRole(role)) return c.json({ error: "INVALID_ROLE" }, 400);

  setCookie(c, VIEW_AS_COOKIE, role, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return c.json({ ok: true });
});

// GET /api/auth/nguoi-directory - danh ba email -> ten HIEN THI, dung CHUNG toan he thong (moi
// route/module) de hien "Tên (mail)"/"Tên KTV (mail)" thay vi email tho khap noi (phan hoi
// 2026-08-19: "Toàn bộ hệ thống nếu tạo thông tin người dùng có tên => sẽ ưu tiên hiện tên dưới
// dạng Tên (mail)... KTV/Trạm/CTV sẽ hiện tên KTV (mail)"). CHI can dang nhap (khong gioi han theo
// vai_tro/module nhu GET /api/users hay GET /dat-mua-lk/nguoi-nhan-hang-kha-dung - 2 endpoint do bi
// khoa rieng Admin/khu vuc "Dat mua linh kien" nen KHONG dung chung duoc cho cac module khac). Tra
// rieng 2 danh sach (users/ktv) thay vi merge san o backend - frontend tu uu tien ten_hien_thi cua
// KTV (do CSKH/Admin bien tap rieng, thuong sat thuc te hon ten Google) truoc ten cua users.ten.
auth.get("/nguoi-directory", verifySessionMiddleware, loadUser, async (c) => {
  const [{ results: users }, { results: ktv }] = await Promise.all([
    c.env.DB.prepare("SELECT email, ten FROM users WHERE trang_thai_duyet = 'Da duyet' AND ten IS NOT NULL").all<{ email: string; ten: string }>(),
    c.env.DB.prepare("SELECT email_dang_nhap as email, ten_hien_thi FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL AND ten_hien_thi IS NOT NULL").all<{ email: string; ten_hien_thi: string }>(),
  ]);
  return c.json({ users, ktv });
});

export default auth;
