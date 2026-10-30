// KTV TU NOP TIEN VAO QUY (chot 2026-10-30, migration 0104 - phuong an A). Luong:
//   KTV (chu quy; Ve tinh -> quy cua Tram) gui yeu cau: anh chuyen khoan (<= 5, Drive) + so tien (may tu doc anh, KTV sua duoc) + ghi chu
//   -> 'Cho ke toan' (bao moi Ke toan)
//   -> Ke toan DUYET voi so THUC NHAN: ghi 1 khoan_tien_ngoai (nguon 'ktv', lo_id 'ntq-<id>') + so quy 'dieu_chinh' gan khoan do (cung
//      co che "Tiền ngoài vào quỹ", huy duoc o tab do) -> phanBoQuy tu tra phieu dang cho chuyen tien -> 'Da duyet' (bao KTV)
//   -> hoac TU CHOI (bat buoc ly do) -> 'Tu choi' (bao KTV). Nguoi gui HUY duoc khi con 'Cho ke toan'.
// Truoc khi duyet tien CHUA vao quy. Chong bam 2 lan: CAS trang thai (quy_cas_guard) dau moi batch.
import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { lenhGhiQuy, phanBoQuy } from "./quyKtv";
import { sendPushToUser } from "./webPush";
import { tenNguoiMap } from "./tenNguoi";
import { laUrlAnhDrive } from "./anhUpload";
import { locTienDocAnh, MAX_ANH_BANG_CHUNG } from "./bangChungChuyenTien";

export type TrangThaiNopTien = "Cho ke toan" | "Da duyet" | "Tu choi" | "Da huy";
export const maNopTien = (id: number) => `NTQ-${id}`;
const tien = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

export interface NopTienRow {
  id: number;
  email: string;
  nguoi_gui: string;
  so_tien: number;
  anh: string | null;
  tien_doc_anh: string | null;
  ghi_chu: string | null;
  ngay_chuyen: string | null;
  trang_thai: TrangThaiNopTien;
  so_tien_thuc_nhan: number | null;
  nguoi_xu_ly: string | null;
  xu_ly_luc: string | null;
  ly_do: string | null;
  khoan_tien_ngoai_id: number | null;
  ngay_tao: string;
}

type U = { email: string; vai_tro?: string | null; la_ke_toan?: boolean | number | null; la_ve_tinh?: boolean | number | null; tram_cha?: string | null };
export const laKeToanNopTien = (u: U) => u.vai_tro === "Admin" || !!u.la_ke_toan;
/** Quy nhan tien cua nguoi gui: Ve tinh -> Tram (don Ve tinh ghi nguoi nhan = Tram), con lai = chinh minh. */
export const quyCuaNguoiGui = (u: U): string | null => (u.la_ve_tinh ? u.tram_cha ?? null : u.email);

export type HanhDongNopTien = "duyet" | "tu_choi" | "huy";
export function hanhDongNopTien(r: NopTienRow, u: U): HanhDongNopTien[] {
  if (r.trang_thai !== "Cho ke toan") return [];
  return [...(laKeToanNopTien(u) ? (["duyet", "tu_choi"] as const) : []), ...(r.nguoi_gui === u.email ? (["huy"] as const) : [])];
}

async function emailsKeToan(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT email FROM users WHERE la_ke_toan = 1 AND trang_thai_duyet = 'Da duyet' AND COALESCE(bi_khoa, 0) = 0")
    .all<{ email: string }>();
  return results.map((r) => r.email);
}

/** Chuong (loai/link_type 'nop_tien_quy') + Web Push mo thang yeu cau ("/?nop_tien=<id>"). */
async function bao(env: Env, nguoiNhan: string[], tru: string, id: number, tieuDe: string, noiDung: string): Promise<void> {
  const ds = [...new Set(nguoiNhan.filter((e) => e && e !== tru))];
  const now = nowVN();
  for (const email of ds) {
    await env.DB.prepare(
      "INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, 'nop_tien_quy', ?, 'nop_tien_quy', ?, ?)",
    )
      .bind(email, noiDung.slice(0, 500), String(id), now)
      .run()
      .catch(() => undefined);
    await sendPushToUser(env, email, { title: tieuDe, body: noiDung.slice(0, 200), url: `/?nop_tien=${id}` }).catch(() => undefined);
  }
}

export type KetQua<T> = T | { error: string; status: 400 | 403 | 404 | 409 };

export async function guiNopTien(
  env: Env,
  u: U,
  body: { so_tien?: unknown; anh?: unknown; tien_doc_anh?: unknown; ghi_chu?: unknown; ngay_chuyen?: unknown },
  hen: (p: Promise<unknown>) => void,
): Promise<KetQua<{ id: number }>> {
  const db = env.DB;
  const email = quyCuaNguoiGui(u);
  if (!email) return { error: "VE_TINH_CHUA_CO_TRAM", status: 409 };
  const soTien = Number(body.so_tien);
  if (!Number.isInteger(soTien) || soTien <= 0 || soTien > 10_000_000_000) return { error: "INVALID_SO_TIEN", status: 400 };
  const anh = Array.isArray(body.anh) ? [...new Set(body.anh.filter(laUrlAnhDrive))].slice(0, MAX_ANH_BANG_CHUNG) : [];
  if (anh.length === 0) return { error: "MISSING_ANH", status: 400 };
  const ghiChu = typeof body.ghi_chu === "string" ? body.ghi_chu.trim().slice(0, 500) || null : null;
  const ngay = typeof body.ngay_chuyen === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.ngay_chuyen.trim()) ? body.ngay_chuyen.trim() : null;
  const now = nowVN();
  const r = await db
    .prepare(
      `INSERT INTO nop_tien_quy (email, nguoi_gui, so_tien, anh, tien_doc_anh, ghi_chu, ngay_chuyen, ngay_tao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(email, u.email, soTien, JSON.stringify(anh), locTienDocAnh(null, body.tien_doc_anh, anh), ghiChu, ngay, now)
    .first<{ id: number }>();
  const id = r!.id;
  const ten = (await tenNguoiMap(db, [u.email])).get(u.email) ?? u.email;
  hen(
    bao(env, await emailsKeToan(db), u.email, id, "💰 KTV nộp tiền vào quỹ",
      `${ten} nộp ${tien(soTien)} vào quỹ (${maNopTien(id)})${ghiChu ? ` — ${ghiChu}` : ""}. Vui lòng kiểm tra sao kê và xác nhận.`),
  );
  return { id };
}

export async function xuLyNopTien(
  env: Env,
  u: U,
  id: number,
  hanhDong: HanhDongNopTien,
  body: { so_tien_thuc_nhan?: unknown; ly_do?: unknown },
  hen: (p: Promise<unknown>) => void,
): Promise<KetQua<{ trang_thai: TrangThaiNopTien }>> {
  const db = env.DB;
  const r = await db.prepare("SELECT * FROM nop_tien_quy WHERE id = ?").bind(id).first<NopTienRow>();
  if (!r) return { error: "NOT_FOUND", status: 404 };
  if (!hanhDongNopTien(r, u).includes(hanhDong)) {
    return r.trang_thai !== "Cho ke toan" ? { error: "TRANG_THAI_DA_DOI", status: 409 } : { error: "FORBIDDEN_ROLE", status: 403 };
  }
  const lyDo = typeof body.ly_do === "string" ? body.ly_do.trim().slice(0, 500) || null : null;
  const now = nowVN();
  // CAS: yeu cau con 'Cho ke toan' -> khong thi CHECK x=0 vi pham, rollback ca batch.
  const cas = db.prepare("INSERT INTO quy_cas_guard (x) SELECT 1 WHERE (SELECT trang_thai FROM nop_tien_quy WHERE id = ?) IS NOT 'Cho ke toan'").bind(id);
  const ma = maNopTien(id);
  let trangThai: TrangThaiNopTien;
  let thucNhan = 0;
  if (hanhDong === "duyet") {
    thucNhan = Number(body.so_tien_thuc_nhan ?? r.so_tien);
    if (!Number.isInteger(thucNhan) || thucNhan <= 0 || thucNhan > 10_000_000_000) return { error: "INVALID_SO_TIEN", status: 400 };
    const noiDung = `KTV nộp tiền vào quỹ ${ma}${r.ghi_chu ? `: ${r.ghi_chu}` : ""}`.slice(0, 300);
    const loId = `ntq-${id}`;
    const [taoQuy, congQuy, ghiSo] = lenhGhiQuy(db, {
      email: r.email, loai: "dieu_chinh", soTien: thucNhan, nguoi: u.email, now,
      ghiChu: `Tiền ngoài vào quỹ: ${noiDung}`, khoanTienNgoaiSql: "last_insert_rowid()",
    });
    try {
      await db.batch([
        cas,
        taoQuy,
        congQuy,
        db.prepare(
          `INSERT INTO khoan_tien_ngoai (email, ma_ktv, ma_trong_file, so_tien, noi_dung, ngay_chung_tu, nguon, ten_file, lo_id, nguoi_tao, ngay_tao)
           VALUES (?, NULL, ?, ?, ?, ?, 'ktv', NULL, ?, ?, ?)`,
        ).bind(r.email, ma, thucNhan, noiDung, r.ngay_chuyen, loId, u.email, now),
        ghiSo, // ngay sau INSERT khoan -> last_insert_rowid() = id khoan
        db.prepare(
          `UPDATE nop_tien_quy SET trang_thai = 'Da duyet', so_tien_thuc_nhan = ?, nguoi_xu_ly = ?, xu_ly_luc = ?, ly_do = ?,
             khoan_tien_ngoai_id = (SELECT id FROM khoan_tien_ngoai WHERE lo_id = ? ORDER BY id DESC LIMIT 1) WHERE id = ?`,
        ).bind(thucNhan, u.email, now, lyDo, loId, id),
      ]);
    } catch {
      return { error: "TRANG_THAI_DA_DOI", status: 409 };
    }
    trangThai = "Da duyet";
    // Tien vao quy -> tu tra phieu dang cho chuyen tien cu nhat (nhu moi lan cong quy).
    await phanBoQuy(db, r.email, u.email);
  } else {
    if (hanhDong === "tu_choi" && !lyDo) return { error: "MISSING_LY_DO", status: 400 };
    trangThai = hanhDong === "tu_choi" ? "Tu choi" : "Da huy";
    try {
      await db.batch([
        cas,
        db.prepare("UPDATE nop_tien_quy SET trang_thai = ?, nguoi_xu_ly = ?, xu_ly_luc = ?, ly_do = ? WHERE id = ?").bind(trangThai, u.email, now, lyDo, id),
      ]);
    } catch {
      return { error: "TRANG_THAI_DA_DOI", status: 409 };
    }
  }
  if (hanhDong !== "huy") {
    const noiDung =
      hanhDong === "duyet"
        ? `Kế toán đã xác nhận ${ma}: ${tien(thucNhan)} vào quỹ của bạn${thucNhan !== r.so_tien ? ` (bạn khai ${tien(r.so_tien)})` : ""}${lyDo ? ` — ${lyDo}` : ""}.`
        : `Kế toán từ chối ${ma} (${tien(r.so_tien)}): ${lyDo}`;
    hen(bao(env, [r.nguoi_gui, r.email], u.email, id, "Nộp tiền vào quỹ", noiDung));
  }
  return { trang_thai: trangThai };
}

/** So yeu cau Ke toan can xac nhan (badge muc "Quỹ & chuyển tiền"). */
export async function demNopTienCanXuLy(db: D1Database, u: U): Promise<number> {
  if (!laKeToanNopTien(u)) return 0;
  const r = await db.prepare("SELECT COUNT(*) AS n FROM nop_tien_quy WHERE trang_thai = 'Cho ke toan'").first<{ n: number }>();
  return r?.n ?? 0;
}
