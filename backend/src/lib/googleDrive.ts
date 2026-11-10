import type { Env } from "../types";
import { decryptSecret } from "./secretBox";

// Upload anh len Google Drive qua OAuth uy quyen 1 tai khoan Google THAT (khong dung Service
// Account - da bo hoan toan 2026-08-25, xem uploadPublicImage() ben duoi: he chi co tai khoan Gmail
// ca nhan, Service Account khong co storage quota rieng nen bi 403 tru khi dich la Shared Drive tra
// phi Google Workspace).

function buildMultipartBody(metadata: Record<string, unknown>, bytes: ArrayBuffer, mimeType: string, boundary: string): Uint8Array {
  // multipart/related thu cong (Drive KHONG chap nhan multipart/form-data cua FormData) - 2 phan:
  // JSON metadata roi den binary anh, ngan cach boundary theo dung chuan RFC 2387.
  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const closing = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(preamble.byteLength + bytes.byteLength + closing.byteLength);
  body.set(preamble, 0);
  body.set(new Uint8Array(bytes), preamble.byteLength);
  body.set(closing, preamble.byteLength + bytes.byteLength);
  return body;
}

/**
 * Upload anh (linh kien, bien ban/bang chung PXK, tra hang) qua OAuth uy quyen 1 tai khoan Google
 * THAT (xem routes/settingsDatMua.ts phan "Google Drive OAuth"). Dung cho MOI loai anh trong he
 * thong - da bo hoan toan Service Account 2026-08-25 (chi con 1 co che duy nhat, xem comment dau
 * file).
 *
 * Sau khi upload, chia se cong khai "anyone with link" (Drive API permissions.create) roi tra ve
 * link thumbnail nhung truc tiep (drive.google.com/thumbnail?id=...) de nhung <img> thang tren
 * list/modal, khong can nguoi xem dang nhap Google (CHOT 2026-08-17: anh linh kien khong nhay
 * cam, uu tien don gian/nhanh hon la proxy qua Worker).
 */
async function getUserAccessToken(env: Env, db: D1Database): Promise<{ accessToken: string; folderId: string }> {
  const row = await db
    .prepare("SELECT refresh_token_enc, folder_id FROM google_drive_oauth WHERE id = 1")
    .first<{ refresh_token_enc: string; folder_id: string }>();
  if (!row) throw new Error("GOOGLE_DRIVE_NOT_CONNECTED: chua ket noi tai khoan Google Drive - vao Cai dat de ket noi.");

  const refreshToken = await decryptSecret(env, row.refresh_token_enc);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google Drive token refresh failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return { accessToken: json.access_token, folderId: row.folder_id };
}

export async function uploadPublicImage(
  env: Env,
  db: D1Database,
  bytes: ArrayBuffer,
  mimeType: string,
  filename: string,
): Promise<{ id: string; thumbnailUrl: string }> {
  const { accessToken, folderId } = await getUserAccessToken(env, db);
  const metadata = { name: filename, parents: [folderId] };
  const boundary = `dvbh-${crypto.randomUUID()}`;
  const body = buildMultipartBody(metadata, bytes, mimeType, boundary);

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!uploadRes.ok) throw new Error(`Google Drive upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  const { id } = (await uploadRes.json()) as { id: string };

  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!permRes.ok) throw new Error(`Google Drive set-public failed: ${permRes.status} ${await permRes.text()}`);

  return { id, thumbnailUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w1000` };
}

// VIDEO bang chung (2026-11-10, toi da 100MB): Worker KHONG nhan body lon -> mo phien tai "resumable" tren Drive bang token cua app, tra URL
// phien cho trinh duyet PUT thang file len Google (kem header Origin luc mo phien de Google cho phep CORS tu dung origin do). Xong trinh duyet
// gui lai id file -> hoanTatVideo() kiem tra file nam trong thu muc app + dung luong / dinh dang roi chia se cong khai theo link.
export const VIDEO_TOI_DA_BYTE = 100 * 1024 * 1024;

export async function batDauTaiVideo(
  env: Env, db: D1Database, ten: string, mime: string, kichThuoc: number, origin: string | null,
): Promise<string> {
  const { accessToken, folderId } = await getUserAccessToken(env, db);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": mime,
    "X-Upload-Content-Length": String(kichThuoc),
  };
  if (origin) headers.Origin = origin;
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: ten, parents: [folderId], mimeType: mime }),
  });
  const loc = res.headers.get("Location");
  if (!res.ok || !loc) throw new Error(`Google Drive resumable init failed: ${res.status} ${await res.text()}`);
  return loc;
}

export async function hoanTatVideo(
  env: Env, db: D1Database, fileId: string,
): Promise<{ ok: true; ten: string; kichThuoc: number; mime: string } | { ok: false; error: string }> {
  const { accessToken, folderId } = await getUserAccessToken(env, db);
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,size,mimeType,parents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meta.ok) return { ok: false, error: "VIDEO_KHONG_TIM_THAY" };
  const f = (await meta.json()) as { name?: string; size?: string; mimeType?: string; parents?: string[] };
  const xoa = () => fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!(f.parents ?? []).includes(folderId)) return { ok: false, error: "VIDEO_KHONG_HOP_LE" };
  const size = Number(f.size ?? 0);
  if (!String(f.mimeType ?? "").startsWith("video/") || size <= 0 || size > VIDEO_TOI_DA_BYTE) {
    await xoa();
    return { ok: false, error: "VIDEO_KHONG_HOP_LE" };
  }
  const perm = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!perm.ok) throw new Error(`Google Drive set-public failed: ${perm.status} ${await perm.text()}`);
  return { ok: true, ten: f.name ?? "", kichThuoc: size, mime: f.mimeType ?? "" };
}
