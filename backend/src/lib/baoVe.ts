import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";
import { verifySession } from "./jwt";

// Lop bao ve chung cho /api/* (2026-10-08, danh gia bao mat - app chay tren *.workers.dev nen KHONG bat duoc WAF/Rate
// Limiting cua Cloudflare, moi lop bao ve phai nam trong Worker):
//   1) gioiHanTanSuat - Workers Rate Limiting binding: theo TAI KHOAN (phien hop le), theo IP (chua dang nhap), theo
//      KHOA (API doi tac). Chan som truoc moi truy van D1. Luu y: binding dem theo tung diem Cloudflare (khong tuyet doi
//      chinh xac) va KHONG chan duoc tan cong phan tan nhieu IP - chi han che 1 nguon spam.
//   2) chanGhiTuSiteKhac - request GHI (khong phai GET/HEAD/OPTIONS) tu trinh duyet phai den tu CHINH app (Sec-Fetch-Site
//      = same-origin/none, hoac Origin trung). Cac app anh em *.dichvu3t.workers.dev duoc trinh duyet coi la "cung site"
//      nen SameSite=Lax cua cookie khong chan duoc - day la lop chan CSRF thu 2. API doi tac (goi tu server) bo qua.
//   3) headerBaoMatApi - header bao mat cho moi phan hoi API (trang tinh dung frontend/public/_headers).

const LA_API_DOI_TAC = (path: string) =>
  path.startsWith("/api/partner") || path.startsWith("/api/khovan-partner") || path.startsWith("/api/suachua-partner") || path === "/api/hub-misa/thong-bao";

async function sha256Ngan(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function gioiHanTanSuat(c: Context<{ Bindings: Env }>, next: Next) {
  let rl: RateLimit | undefined;
  let key: string;
  if (LA_API_DOI_TAC(c.req.path)) {
    rl = c.env.RL_DOI_TAC;
    key = "dt:" + (await sha256Ngan(c.req.header("X-API-Key") ?? c.req.header("X-Khovan-Key") ?? ""));
  } else {
    const token = getCookie(c, "dvbh_session");
    const phien = token ? await verifySession(token, c.env.SESSION_SECRET) : null;
    if (phien) {
      rl = c.env.RL_NGUOI_DUNG;
      key = "nd:" + phien.email;
    } else {
      rl = c.env.RL_KHACH;
      key = "ip:" + (c.req.header("CF-Connecting-IP") ?? "khong-ro");
    }
  }
  if (rl) {
    const { success } = await rl.limit({ key });
    if (!success) {
      console.warn("[rate-limit]", { key: key.slice(0, 40), path: c.req.path });
      return c.json({ error: "QUA_NHIEU_YEU_CAU" }, 429, { "Retry-After": "60" });
    }
  }
  await next();
}

const PHUONG_THUC_DOC = new Set(["GET", "HEAD", "OPTIONS"]);

export async function chanGhiTuSiteKhac(c: Context<{ Bindings: Env }>, next: Next) {
  if (!PHUONG_THUC_DOC.has(c.req.method) && !LA_API_DOI_TAC(c.req.path)) {
    // Trinh duyet moi (Chrome 76+, Firefox 90+, Safari 16.4+) gui Sec-Fetch-Site - tin cay nhat (khong JS nao sua duoc).
    const site = c.req.header("Sec-Fetch-Site");
    if (site && site !== "same-origin" && site !== "none") return c.json({ error: "YEU_CAU_TU_SITE_KHAC" }, 403);
    // Trinh duyet cu khong co Sec-Fetch-Site: doi chieu Origin (request ghi tu trinh duyet luon co Origin).
    if (!site) {
      const origin = c.req.header("Origin");
      if (origin && origin !== new URL(c.req.url).origin && origin !== c.env.FRONTEND_URL) {
        return c.json({ error: "YEU_CAU_TU_SITE_KHAC" }, 403);
      }
    }
  }
  await next();
}

export async function headerBaoMatApi(c: Context<{ Bindings: Env }>, next: Next) {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  // Du lieu nghiep vu/ca nhan - khong cho trinh duyet/proxy luu lai (tru khi route da tu dat Cache-Control).
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
}

// So sanh khoa bi mat theo thoi gian co dinh (chong do khoa qua thoi gian phan hoi) - dung cho khoa khovan. Bam SHA-256
// ca 2 ben roi XOR tung byte: thoi gian khong phu thuoc vi tri ky tu sai dau tien, cung khong lo do dai khoa.
export async function khoaKhop(gui: string | undefined, dung: string | undefined): Promise<boolean> {
  if (!gui || !dung) return false;
  const [a, b] = await Promise.all(
    [gui, dung].map(async (x) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)))),
  );
  let khac = 0;
  for (let i = 0; i < a.length; i++) khac |= a[i] ^ b[i];
  return khac === 0;
}
