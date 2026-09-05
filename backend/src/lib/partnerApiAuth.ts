import type { Context, Next } from "hono";
import type { Env } from "../types";
import { nowVN } from "./vnTime";

// Xac thuc cac he thong DOI TAC goi VAO API tra cuu (khac han verifySessionMiddleware dung cho
// nguoi dung that dang nhap Google qua cookie session) - doc header "X-API-Key", hash SHA-256 roi
// doi chieu partner_api_keys.key_hash. KHONG BAO GIO so sanh/luu plaintext, cung nguyen tac voi he
// DVBH goc (xem CLAUDE.md "Diem noi he DVBH goc").
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface PartnerApiKeyRow {
  id: number;
  ten_he_thong: string;
}

// Sinh 1 key moi (32 byte ngau nhien -> hex, 64 ky tu) - dung luc Admin tao key qua
// POST /api/settings/partner-api-keys (xem settingsDatMua.ts). Chi tra ve DUY NHAT 1 lan luc tao,
// khong the xem lai sau (chi luu hash).
export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashApiKey(key: string): Promise<string> {
  return sha256Hex(key);
}

// Middleware gan cho router /api/partner (partnerApi.ts) - KHONG dung chung voi
// verifySessionMiddleware/loadUser (2 co che xac thuc doc lap hoan toan, khong duoc tron 1 router).
export function partnerApiAuth() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const apiKey = c.req.header("X-API-Key");
    if (!apiKey) return c.json({ error: "MISSING_API_KEY" }, 401);

    const hash = await sha256Hex(apiKey);
    const row = await c.env.DB.prepare("SELECT id, ten_he_thong FROM partner_api_keys WHERE key_hash = ? AND bat_tat = 1")
      .bind(hash)
      .first<PartnerApiKeyRow>();
    if (!row) return c.json({ error: "INVALID_API_KEY" }, 401);

    c.set("partnerKey", row);
    // Best-effort, khong chan response - 1 key it dung/khong con dung se lo ra qua lan_dung_cuoi cu,
    // giup Admin quyet dinh thu hoi key khong con hoat dong.
    c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE partner_api_keys SET lan_dung_cuoi = ? WHERE id = ?").bind(nowVN(), row.id).run());
    await next();
  };
}
