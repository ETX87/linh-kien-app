import type { Context } from "hono";
import type { Env } from "../types";
import { uploadPublicImage } from "./googleDrive";
import { nowVN } from "./vnTime";

// Gioi han anh tai len (chot 2026-10-08, danh gia bao mat): moi anh <= 10MB, moi tai khoan <= 20 anh/ngay (ngay VN);
// Ke toan / Tac nghiep / Giam sat <= 100 anh/ngay (chot 2026-10-09 - tai ho anh bang chung/bien ban cho nhieu KTV);
// Admin khong gioi han so anh. Upload thanh cong tra kem `han_muc_anh` {da_dung, han_muc} de frontend canh bao khi
// dat han muc (lib/hanMucAnh.ts), het luot tra 429 QUA_SO_ANH_NGAY kem `han_muc`. Truoc day khong gioi han gi - 1 tai khoan bi lo co the day hang nghin anh lam day
// Google Drive. Dung CHUNG cho moi duong tai anh len Drive (5 endpoint nhan file + 2 duong import tai anh tu URL) -
// them duong tai anh moi thi goi nhanAnhTaiLen()/taiAnhTuUrl(), dung goi thang uploadPublicImage().
export const ANH_TOI_DA_BYTE = 10 * 1024 * 1024;
export const ANH_NGAY_MAC_DINH = 20;
export const ANH_NGAY_VAN_PHONG = 100;

// Khong nhan SVG (co the chua script) - chi anh raster.
const LOAI_ANH = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);

export function loaiAnhHopLe(contentType: string | null | undefined): string | null {
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return LOAI_ANH.has(t) ? t : null;
}

// Doc body theo luong, dung ngay khi vuot gioi han (khong doc het 1 file khong lo vao bo nho Worker roi moi kiem tra).
async function docGioiHan(body: ReadableStream<Uint8Array> | null, max: number): Promise<ArrayBuffer | "qua_lon"> {
  if (!body) return new ArrayBuffer(0);
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let tong = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    tong += value.byteLength;
    if (tong > max) {
      await reader.cancel().catch(() => {});
      return "qua_lon";
    }
    parts.push(value);
  }
  const out = new Uint8Array(tong);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.byteLength;
  }
  return out.buffer;
}

// Giu 1 luot trong han muc ngay (nguyen tu - 2 request song song khong vuot duoc). Tra so anh da dung SAU luot nay,
// null = da het han muc hom nay.
async function giuLuot(db: D1Database, email: string, ngay: string, hanMuc: number): Promise<number | null> {
  const r = await db
    .prepare(
      `INSERT INTO anh_upload_ngay (email, ngay, so_luong) VALUES (?, ?, 1)
       ON CONFLICT(email, ngay) DO UPDATE SET so_luong = so_luong + 1 WHERE so_luong < ?
       RETURNING so_luong`,
    )
    .bind(email, ngay, hanMuc)
    .first<{ so_luong: number }>();
  return r?.so_luong ?? null;
}

async function traLuot(db: D1Database, email: string, ngay: string): Promise<void> {
  await db
    .prepare("UPDATE anh_upload_ngay SET so_luong = so_luong - 1 WHERE email = ? AND ngay = ? AND so_luong > 0")
    .bind(email, ngay)
    .run()
    .catch(() => {});
}

type Ctx = Context<{ Bindings: Env }>;
export interface HanMucAnh {
  da_dung: number;
  han_muc: number;
}
export interface AnhDaTai {
  id: string;
  thumbnailUrl: string;
  // null = Admin (khong gioi han).
  hanMucAnh: HanMucAnh | null;
}

// Han muc anh/ngay cua tai khoan dang thao tac; null = khong gioi han (Admin THAT, ke ca luc "xem thu vai tro").
function hanMucAnhNgay(c: Ctx): number | null {
  if (c.get("realIsAdmin")) return null;
  const u = c.get("user");
  return u.la_ke_toan || u.la_tac_nghiep || u.vai_tro === "Giam sat" ? ANH_NGAY_VAN_PHONG : ANH_NGAY_MAC_DINH;
}

// Nhan 1 anh tu body request (binary tho, Content-Type = mime anh) -> tai len Drive. Tra Response loi neu khong hop le,
// nguoc lai tra anh da tai. tenFile(ext) dat ten file tren Drive.
export async function nhanAnhTaiLen(c: Ctx, tenFile: (ext: string) => string): Promise<AnhDaTai | Response> {
  const contentType = loaiAnhHopLe(c.req.header("Content-Type") || "image/jpeg");
  if (!contentType) {
    return c.json({ error: "DINH_DANG_ANH_KHONG_HO_TRO" }, 400);
  }
  const khaiBao = Number(c.req.header("Content-Length") ?? 0);
  if (khaiBao > ANH_TOI_DA_BYTE) return c.json({ error: "ANH_QUA_LON" }, 413);

  const bytes = await docGioiHan(c.req.raw.body, ANH_TOI_DA_BYTE);
  if (bytes === "qua_lon") return c.json({ error: "ANH_QUA_LON" }, 413);
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);

  const email = c.get("user").email;
  const ngay = nowVN().slice(0, 10);
  const hanMuc = hanMucAnhNgay(c);
  const daDung = hanMuc === null ? null : await giuLuot(c.env.DB, email, ngay, hanMuc);
  // Thong bao hien thi: frontend tra theo ma + han_muc (lib/hanMucAnh.ts) de dich duoc VI/EN/ID.
  if (hanMuc !== null && daDung === null) return c.json({ error: "QUA_SO_ANH_NGAY", han_muc: hanMuc }, 429);

  const ext = contentType.split("/")[1] || "jpg";
  try {
    const anh = await uploadPublicImage(c.env, c.env.DB, bytes, contentType, tenFile(ext));
    return { ...anh, hanMucAnh: hanMuc === null ? null : { da_dung: daDung!, han_muc: hanMuc } };
  } catch (err) {
    if (hanMuc !== null) await traLuot(c.env.DB, email, ngay);
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("GOOGLE_DRIVE_NOT_CONNECTED")) {
      return c.json({ error: "GOOGLE_DRIVE_NOT_CONNECTED", message: "Chưa kết nối tài khoản Google Drive - vào Cài đặt để kết nối." }, 400);
    }
    return c.json({ error: "UPLOAD_FAILED", message }, 502);
  }
}

// Tai anh tu 1 URL (import Excel co cot link anh) roi dua len Drive - NEM loi neu khong hop le (noi goi da co nhanh
// catch "tai_anh_that_bai"). Loi het han muc ngay nem Error("QUA_SO_ANH_NGAY") de noi goi bao rieng neu can.
export async function taiAnhTuUrl(c: Ctx, url: string, tenFile: (ext: string) => string): Promise<AnhDaTai> {
  if (!laUrlHttp(url)) throw new Error("URL_KHONG_HOP_LE");
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!imgRes.ok) throw new Error(`fetch ${imgRes.status}`);
  const contentType = loaiAnhHopLe(imgRes.headers.get("Content-Type"));
  if (!contentType) throw new Error("DINH_DANG_ANH_KHONG_HO_TRO");
  if (Number(imgRes.headers.get("Content-Length") ?? 0) > ANH_TOI_DA_BYTE) throw new Error("ANH_QUA_LON");
  const bytes = await docGioiHan(imgRes.body, ANH_TOI_DA_BYTE);
  if (bytes === "qua_lon") throw new Error("ANH_QUA_LON");
  if (bytes.byteLength === 0) throw new Error("EMPTY_FILE");

  const email = c.get("user").email;
  const ngay = nowVN().slice(0, 10);
  const hanMuc = hanMucAnhNgay(c);
  const daDung = hanMuc === null ? null : await giuLuot(c.env.DB, email, ngay, hanMuc);
  if (hanMuc !== null && daDung === null) throw new Error("QUA_SO_ANH_NGAY");
  try {
    const anh = await uploadPublicImage(c.env, c.env.DB, bytes, contentType, tenFile(contentType.split("/")[1] || "jpg"));
    return { ...anh, hanMucAnh: hanMuc === null ? null : { da_dung: daDung!, han_muc: hanMuc } };
  } catch (err) {
    if (hanMuc !== null) await traLuot(c.env.DB, email, ngay);
    throw err;
  }
}

// URL anh luu vao DB do client gui len (bang chung chuyen tien, anh tra hang luc tao don, anh dong goi): CHI nhan link
// Google Drive ma chinh he thong tra ve sau khi tai anh (uploadPublicImage). Chan link ngoai (javascript:, trang lua
// dao, anh ngoai doi duoc noi dung sau khi Ke toan da duyet...).
const HOST_ANH_DRIVE = new Set(["drive.google.com", "lh3.googleusercontent.com", "docs.google.com"]);
export function laUrlAnhDrive(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 1000) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOST_ANH_DRIVE.has(u.hostname);
  } catch {
    return false;
  }
}

// Link nhap tay (anh minh hoa LK, anh tu khovan): chi http(s) - chan javascript:/data: hien thanh link bam duoc.
export function laUrlHttp(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2000) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
