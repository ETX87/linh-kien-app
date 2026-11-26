import type { Env } from "../types";
import { nowVN } from "./vnTime";

// THIEU HANG BAO HANH (2026-11-04, migration 0106) - ticket do he "Sua chua bao hanh" (Worker suachua) gui sang khi don bao hanh bi
// cham vi "Khong co linh kien" / "Het hang ton kho". Kho / Mua hang xu ly o day; moi lan doi trang thai day nguoc ve suachua
// (pushThieuHangBhToSuachua), suachua con tu keo lai moi 15 phut (GET /api/suachua-partner/thieu-hang-bh?since=) phong khi lo ban tin.

// AI DUOC XEM ticket THB (chi doc) - NGUON DUY NHAT cho routes/thieuHangBh.ts (danh sach / chi tiet), Ctrl+K (/dat-mua-lk/search) va danh sach
// Thieu hang gop (xemThbGop). Kho / TN / Mua hang / Ke toan / View / Admin + GIAM SAT (2026-11-26 v1.569, "SC2611090581 ... vẫn không thấy, cả fix cho
// cả tài khoản thamnth1508" - GS tra ca bao hanh cua KTV nhung bi loai). Thao tac van chi Kho / TN / Mua hang / Admin.
export function xemThbDuoc(u: { vai_tro?: string | null; la_kho?: unknown; la_tac_nghiep?: unknown; la_mua_hang?: unknown; la_ke_toan?: unknown; la_view?: unknown }): boolean {
  return !!(u.la_kho || u.la_tac_nghiep || u.la_mua_hang || u.la_ke_toan || u.la_view || u.vai_tro === "Admin" || u.vai_tro === "Giam sat");
}

export const THB_MO = ["Cho kho xu ly", "Kho da tiep nhan", "Cho mua hang", "Mua hang da dat"] as const;
export const THB_DONG = ["Kho xac nhan hang da ve", "Kho tu choi", "Mua hang tu choi", "Da huy"] as const;
export const THB_TRANG_THAI = [...THB_MO, ...THB_DONG] as const;

export interface ThbRow {
  id: string;
  nguon_id: string;
  ma_lk: string;
  ten_lk: string | null;
  so_luong: number;
  ly_do: string | null;
  ghi_chu: string | null;
  mien: string | null;
  case_id: string | null;
  ktv_email: string | null;
  ktv_ten: string | null;
  nguoi_bao: string | null;
  nguoi_bao_ten: string | null;
  trang_thai: string;
  ngay_du_kien: string | null;
  ma_eo_mua: string | null;
  ghi_chu_xu_ly: string | null;
  nguoi_xu_ly: string | null;
  nguoi_xu_ly_ten?: string | null;
  ngay_tao: string;
  ngay_cap_nhat: string;
}

/** Ai duoc chuyen tu trang thai hien tai sang trang thai moi (Kho/TN lam viec cua Kho; Mua hang lam viec cua Mua hang; Admin ca 2). */
export function thbChuyenHopLe(tu: string, den: string, vai: { kho: boolean; muaHang: boolean }): boolean {
  const kho: Record<string, string[]> = {
    "Cho kho xu ly": ["Kho da tiep nhan", "Cho mua hang", "Kho xac nhan hang da ve", "Kho tu choi"],
    "Kho da tiep nhan": ["Kho da tiep nhan", "Cho mua hang", "Kho xac nhan hang da ve", "Kho tu choi"],
    "Cho mua hang": ["Kho xac nhan hang da ve"],
    "Mua hang da dat": ["Kho xac nhan hang da ve"],
  };
  const mua: Record<string, string[]> = {
    "Cho mua hang": ["Mua hang da dat", "Mua hang tu choi"],
    "Mua hang da dat": ["Mua hang da dat", "Mua hang tu choi"],
  };
  return (vai.kho && (kho[tu] ?? []).includes(den)) || (vai.muaHang && (mua[tu] ?? []).includes(den));
}

const THB_SELECT = `SELECT t.*, u.ten AS nguoi_xu_ly_ten FROM thieu_hang_bh t LEFT JOIN users u ON u.email = t.nguoi_xu_ly`;

export async function docThb(db: D1Database, ids: string[]): Promise<ThbRow[]> {
  if (!ids.length) return [];
  const { results } = await db.prepare(`${THB_SELECT} WHERE t.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<ThbRow>();
  return results;
}

/** Tin thay doi sau moc `since` (theo ngay_cap_nhat, roi id) - suachua keo lai dinh ky. */
export async function thbThayDoiSau(db: D1Database, since: string, afterId: string, limit: number): Promise<ThbRow[]> {
  const { results } = await db
    .prepare(`${THB_SELECT} WHERE (t.ngay_cap_nhat > ? OR (t.ngay_cap_nhat = ? AND t.id > ?)) ORDER BY t.ngay_cap_nhat, t.id LIMIT ?`)
    .bind(since, since, afterId, limit)
    .all<ThbRow>();
  return results;
}

/** Ghi 1 buoc xu ly (doi trang thai + log) - dung chung cho Kho/Mua hang (route phien) va suachua huy (partner). */
export async function thbGhiBuoc(
  db: D1Database,
  id: string,
  tu: string,
  den: string,
  nguoi: string,
  opts: { ghi_chu?: string | null; ngay_du_kien?: string | null; ma_eo_mua?: string | null },
): Promise<boolean> {
  const now = nowVN();
  const ghiChu = (opts.ghi_chu ?? "").trim() || null;
  const sets = ["trang_thai = ?", "nguoi_xu_ly = ?", "ngay_cap_nhat = ?", "ghi_chu_xu_ly = ?"];
  const binds: unknown[] = [den, nguoi, now, ghiChu];
  if (opts.ngay_du_kien !== undefined) {
    sets.push("ngay_du_kien = ?");
    binds.push(opts.ngay_du_kien || null);
  }
  if (opts.ma_eo_mua !== undefined) {
    sets.push("ma_eo_mua = ?");
    binds.push(opts.ma_eo_mua || null);
  }
  const ghiLog = [ghiChu, opts.ngay_du_kien ? `Dự kiến có hàng: ${opts.ngay_du_kien}` : null, opts.ma_eo_mua ? `Mã EO: ${opts.ma_eo_mua}` : null]
    .filter(Boolean)
    .join(" | ");
  // CAS theo trang thai cu: 2 nguoi bam cung luc thi chi 1 nguoi qua, nguoi kia nhan STATE_CHANGED.
  const upd = await db.prepare(`UPDATE thieu_hang_bh SET ${sets.join(", ")} WHERE id = ? AND trang_thai = ?`).bind(...binds, id, tu).run();
  if ((upd.meta?.changes ?? 0) === 0) return false;
  await db
    .prepare("INSERT INTO thieu_hang_bh_log (thieu_hang_bh_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(id, den, nguoi, now, ghiLog || null)
    .run();
  return true;
}

/** Day ban tin trang thai moi sang suachua (best-effort - loi thi cron 15 phut ben suachua tu keo lai). */
export async function pushThieuHangBhToSuachua(env: Env, ids: string[]): Promise<void> {
  if (!ids.length || !env.SUACHUA_SYNC_SERVICE || !env.SUACHUA_SYNC_API_KEY) return;
  try {
    const rows = await docThb(env.DB, ids);
    if (!rows.length) return;
    await env.SUACHUA_SYNC_SERVICE.fetch(`${env.SUACHUA_SYNC_BASE_URL}/api/partner/sync/thieu-hang`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sync-Key": env.SUACHUA_SYNC_API_KEY },
      body: JSON.stringify({ rows }),
    });
  } catch (e) {
    console.error("[thieuHangBh push]", e instanceof Error ? e.message : e);
  }
}
