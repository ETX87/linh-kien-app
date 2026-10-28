// HỎI ĐÁP TỰ ĐỘNG - KHO HƯỚNG DẪN (chot 2026-10-28, migration 0102) - "xây dựng cơ chế hỏi, đáp thắc mắc tự động trên app, khi KTV click
// vào mục hỏi sẽ hiện các hướng dẫn, hình ảnh tự động đẩy lên drive và hiện ra trong câu trả lời".
//
// - Xem: moi tai khoan da dang nhap (KTV mo khung Hoi dap thay ngay danh sach huong dan dang bat).
// - Soan / sua / tat / xoa + tai anh: Mua hang + Admin (cung tap "phia xu ly" cua routes/hoiDap.ts). KHONG dung requireDatMuaLkArea
//   (middleware do chan moi request ghi cua tai khoan chi co co Mua hang).
// - Anh: POST /anh (body = file anh) -> nhanAnhTaiLen() dua len Google Drive, tra URL; client gui danh sach URL kem POST/PATCH.
//   Chi nhan link Drive (laUrlAnhDrive), toi da 10 anh / huong dan.
// - Goi y / tu tra loi: lib/huongDan.ts (ban sao FE frontend/src/lib/huongDan.ts).
import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { nhanAnhTaiLen, laUrlAnhDrive } from "../lib/anhUpload";
import { tenNguoiMap } from "../lib/tenNguoi";

const huongDan = new Hono<{ Bindings: Env }>();
huongDan.use("*", verifySessionMiddleware, loadUser);

type C = Context<{ Bindings: Env }>;
export const HD_ANH_TOI_DA = 10;

export const quanLyHuongDan = (c: C) => !!c.get("user").la_mua_hang || c.get("user").vai_tro === "Admin";

export interface HuongDanRow {
  id: number;
  tieu_de: string;
  noi_dung: string;
  anh: string | null;
  tu_khoa: string | null;
  nhom: string | null;
  stt: number;
  bat_tat: number;
  luot_xem: number;
  luot_huu_ich: number;
  nguoi_tao: string;
  ngay_tao: string;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
}

export function dsAnh(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

export const raHuongDan = (r: HuongDanRow) => ({ ...r, anh: dsAnh(r.anh) });

/** Huong dan dang bat (dung cho goi y / tu tra loi / gui kem tin nhan). */
export async function huongDanDangBat(db: D1Database): Promise<HuongDanRow[]> {
  const { results } = await db.prepare("SELECT * FROM huong_dan WHERE bat_tat = 1 ORDER BY stt, id").all<HuongDanRow>();
  return results;
}

// GET / - danh sach. Nguoi quan ly + ?tat_ca=1 thay ca huong dan dang tat.
huongDan.get("/", async (c) => {
  const tatCa = quanLyHuongDan(c) && c.req.query("tat_ca") === "1";
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM huong_dan ${tatCa ? "" : "WHERE bat_tat = 1"} ORDER BY bat_tat DESC, stt, id`,
  ).all<HuongDanRow>();
  const ten = tatCa ? await tenNguoiMap(c.env.DB, [...new Set(results.flatMap((r) => [r.nguoi_tao, r.nguoi_cap_nhat ?? ""]).filter(Boolean))]) : null;
  return c.json({
    quan_ly: quanLyHuongDan(c),
    rows: results.map((r) => ({
      ...raHuongDan(r),
      ...(ten ? { ten_nguoi_tao: ten.get(r.nguoi_tao) ?? r.nguoi_tao, ten_nguoi_cap_nhat: r.nguoi_cap_nhat ? ten.get(r.nguoi_cap_nhat) ?? r.nguoi_cap_nhat : null } : {}),
    })),
  });
});

// POST /anh - tai 1 anh huong dan len Drive (body = file anh). Tra url de gui kem POST/PATCH.
huongDan.post("/anh", async (c) => {
  if (!quanLyHuongDan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const uploaded = await nhanAnhTaiLen(c, (ext) => `huong-dan-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`);
  if (uploaded instanceof Response) return uploaded;
  return c.json({ ok: true, url: uploaded.thumbnailUrl, han_muc_anh: uploaded.hanMucAnh });
});

interface BodyHd {
  tieu_de?: string;
  noi_dung?: string;
  anh?: unknown;
  tu_khoa?: string | null;
  nhom?: string | null;
  stt?: number;
  bat_tat?: boolean | number;
}

function chuanBody(b: BodyHd): { ok: true; v: { tieu_de: string; noi_dung: string; anh: string; tu_khoa: string | null; nhom: string | null; stt: number; bat_tat: number } } | { ok: false; error: string } {
  const tieuDe = b.tieu_de?.trim();
  if (!tieuDe) return { ok: false, error: "THIEU_TIEU_DE" };
  if (tieuDe.length > 200) return { ok: false, error: "TIEU_DE_QUA_DAI" };
  const noiDung = (b.noi_dung ?? "").trim();
  if (noiDung.length > 10000) return { ok: false, error: "NOI_DUNG_QUA_DAI" };
  const anh = Array.isArray(b.anh) ? b.anh : [];
  if (anh.length > HD_ANH_TOI_DA) return { ok: false, error: "QUA_SO_ANH" };
  if (!anh.every(laUrlAnhDrive)) return { ok: false, error: "ANH_KHONG_HOP_LE" };
  if (!noiDung && anh.length === 0) return { ok: false, error: "THIEU_NOI_DUNG" };
  return {
    ok: true,
    v: {
      tieu_de: tieuDe,
      noi_dung: noiDung,
      anh: JSON.stringify(anh),
      tu_khoa: b.tu_khoa?.trim().slice(0, 1000) || null,
      nhom: b.nhom?.trim().slice(0, 80) || null,
      stt: Number.isFinite(Number(b.stt)) ? Math.trunc(Number(b.stt)) : 0,
      bat_tat: b.bat_tat === false || b.bat_tat === 0 ? 0 : 1,
    },
  };
}

// POST / - tao huong dan.
huongDan.post("/", async (c) => {
  if (!quanLyHuongDan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const kq = chuanBody(await c.req.json<BodyHd>().catch(() => ({})));
  if (!kq.ok) return c.json({ error: kq.error }, 400);
  const v = kq.v;
  const now = nowVN();
  const email = c.get("user").email;
  const r = await c.env.DB.prepare(
    `INSERT INTO huong_dan (tieu_de, noi_dung, anh, tu_khoa, nhom, stt, bat_tat, nguoi_tao, ngay_tao, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(v.tieu_de, v.noi_dung, v.anh, v.tu_khoa, v.nhom, v.stt, v.bat_tat, email, now, email, now).first<{ id: number }>();
  return c.json({ ok: true, id: r?.id }, 201);
});

// PATCH /:id - sua toan bo noi dung (client gui du cac truong).
huongDan.patch("/:id", async (c) => {
  if (!quanLyHuongDan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const kq = chuanBody(await c.req.json<BodyHd>().catch(() => ({})));
  if (!kq.ok) return c.json({ error: kq.error }, 400);
  const v = kq.v;
  const r = await c.env.DB.prepare(
    `UPDATE huong_dan SET tieu_de = ?, noi_dung = ?, anh = ?, tu_khoa = ?, nhom = ?, stt = ?, bat_tat = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ?
     WHERE id = ?`,
  ).bind(v.tieu_de, v.noi_dung, v.anh, v.tu_khoa, v.nhom, v.stt, v.bat_tat, c.get("user").email, nowVN(), Number(c.req.param("id"))).run();
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// PATCH /:id/bat-tat - { bat_tat } bat/tat nhanh.
huongDan.patch("/:id/bat-tat", async (c) => {
  if (!quanLyHuongDan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const b = await c.req.json<{ bat_tat?: boolean }>().catch(() => ({}) as { bat_tat?: boolean });
  const r = await c.env.DB.prepare("UPDATE huong_dan SET bat_tat = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?")
    .bind(b.bat_tat ? 1 : 0, c.get("user").email, nowVN(), Number(c.req.param("id")))
    .run();
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// DELETE /:id - xoa han (tin nhan cu tham chieu id nay se hien "Hướng dẫn đã bị xoá").
huongDan.delete("/:id", async (c) => {
  if (!quanLyHuongDan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const r = await c.env.DB.prepare("DELETE FROM huong_dan WHERE id = ?").bind(Number(c.req.param("id"))).run();
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// POST /:id/xem - { huu_ich? } - dem luot xem (mo chi tiet) / luot "Đã giải đáp được". Khong can quyen gi them.
huongDan.post("/:id/xem", async (c) => {
  const b = await c.req.json<{ huu_ich?: boolean }>().catch(() => ({}) as { huu_ich?: boolean });
  await c.env.DB.prepare(`UPDATE huong_dan SET ${b.huu_ich ? "luot_huu_ich = luot_huu_ich + 1" : "luot_xem = luot_xem + 1"} WHERE id = ?`)
    .bind(Number(c.req.param("id")))
    .run();
  return c.json({ ok: true });
});

export default huongDan;
