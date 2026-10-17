// HỎI ĐÁP KTV ↔ MUA HÀNG (chot 2026-10-17, migration 0089) - "cần bổ sung thêm 1 công cụ trao đổi thắc mắc qua lại giữa KTV và nhân viên
// mua hàng. Nhân viên sẽ hỏi giá hoặc hỏi ngày hàng về => tạo 1 icon chat ở góc bên phải góc dưới ... Mỗi phiên chat sẽ tạo 1 ticket theo dõi
// và gửi cho nhân viên mua hàng tiếp nhận và giải đáp => kết quả là "Chờ tiếp nhận", Đang xử lý", "Đã xử lý", "Hủy bỏ", "Từ chối"".
//
// - Nguoi HOI: moi tai khoan da duyet (chu yeu KTV) - chi thay ticket cua minh.
// - Nguoi XU LY: Mua hang (users.la_mua_hang) + Admin - thay moi ticket. KHONG dung requireDatMuaLkArea (middleware do chan MOI request
//   ghi cua tai khoan chi co co Mua hang - o day Mua hang phai tra loi duoc).
// - Trang thai: Cho tiep nhan -> Dang xu ly (Mua hang "Tiếp nhận" hoac tra loi tin dau tien) -> Da xu ly; Tu choi (Mua hang, bat buoc ly do)
//   / Huy bo (nguoi hoi) tu 2 trang thai mo. 3 trang thai DONG khong nhan tin them (hoi tiep = tao ticket moi).
// - Tin chua doc: so tin_cuoi_luc/tin_cuoi_tu voi doc_hoi_luc / doc_xu_ly_luc (moc doc CHUNG cho phia Mua hang).
// - Thong bao: thong_bao_ktv (loai 'hoi_dap', link_type 'hoi_dap' -> chuong mo dung ticket) + Web Push cho phia ben kia.
import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { nextSequentialId } from "../lib/idCounter";
import { sendPushToUser } from "../lib/webPush";
import { tenNguoiMap } from "../lib/tenNguoi";

const hoiDap = new Hono<{ Bindings: Env }>();
hoiDap.use("*", verifySessionMiddleware, loadUser);

type C = Context<{ Bindings: Env }>;
type TrangThai = "Cho tiep nhan" | "Dang xu ly" | "Da xu ly" | "Huy bo" | "Tu choi";

const LOAI: Record<string, string> = { hoi_gia: "Hỏi giá", hoi_ngay_ve: "Hỏi ngày hàng về", khac: "Hỏi khác" };
const NHAN_TT: Record<TrangThai, string> = {
  "Cho tiep nhan": "Chờ tiếp nhận",
  "Dang xu ly": "Đang xử lý",
  "Da xu ly": "Đã xử lý",
  "Huy bo": "Hủy bỏ",
  "Tu choi": "Từ chối",
};
const TT_MO: TrangThai[] = ["Cho tiep nhan", "Dang xu ly"];
const MAX_TIN = 2000;

const laXuLy = (c: C) => !!c.get("user").la_mua_hang || c.get("user").vai_tro === "Admin";

interface HoiDapRow {
  id: string;
  nguoi_hoi: string;
  loai: string;
  ma_lk: string | null;
  ma_don: string | null;
  tieu_de: string;
  trang_thai: TrangThai;
  nguoi_xu_ly: string | null;
  ly_do: string | null;
  ngay_tao: string;
  cap_nhat_luc: string;
  tin_cuoi_luc: string;
  tin_cuoi_tu: "hoi" | "xu_ly";
  doc_hoi_luc: string | null;
  doc_xu_ly_luc: string | null;
}

/** Ticket co tin moi phia ben kia ma nguoi xem chua doc. */
function chuaDoc(r: HoiDapRow, phiaXem: "hoi" | "xu_ly"): boolean {
  if (phiaXem === "hoi") return r.tin_cuoi_tu === "xu_ly" && (!r.doc_hoi_luc || r.doc_hoi_luc < r.tin_cuoi_luc);
  return r.tin_cuoi_tu === "hoi" && (!r.doc_xu_ly_luc || r.doc_xu_ly_luc < r.tin_cuoi_luc) && TT_MO.includes(r.trang_thai);
}

async function emailsXuLy(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT email FROM users WHERE la_mua_hang = 1 AND trang_thai_duyet = 'Da duyet' AND COALESCE(bi_khoa, 0) = 0")
    .all<{ email: string }>();
  return results.map((r) => r.email);
}

/** Bao chuong + push cho danh sach nguoi nhan (bo chinh nguoi gui). Loi push khong lam hong thao tac. */
async function baoTin(env: Env, nguoiNhan: string[], tru: string, hoiDapId: string, noiDung: string): Promise<void> {
  const ds = [...new Set(nguoiNhan.filter((e) => e && e !== tru))];
  const now = nowVN();
  for (const email of ds) {
    await env.DB.prepare("INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, 'hoi_dap', ?, 'hoi_dap', ?, ?)")
      .bind(email, noiDung.slice(0, 500), hoiDapId, now)
      .run()
      .catch(() => undefined);
    await sendPushToUser(env, email, { title: "Hỏi đáp mua hàng", body: noiDung.slice(0, 200), url: "/" }).catch(() => undefined);
  }
}

async function docTicket(db: D1Database, id: string): Promise<HoiDapRow | null> {
  return db.prepare("SELECT * FROM hoi_dap WHERE id = ?").bind(id).first<HoiDapRow>();
}

/** Quyen xem: nguoi hoi hoac phia xu ly. Tra phia cua nguoi xem hoac null. */
function phiaCua(c: C, t: HoiDapRow): "hoi" | "xu_ly" | null {
  const email = c.get("user").email;
  if (t.nguoi_hoi === email) return "hoi";
  if (laXuLy(c)) return "xu_ly";
  return null;
}

// GET /dem - so cho badge icon chat: chua_doc (tin moi phia ben kia) + cho_tiep_nhan (chi phia xu ly).
hoiDap.get("/dem", async (c) => {
  const email = c.get("user").email;
  const xuLy = laXuLy(c);
  const cuaToi = await c.env.DB.prepare(
    `SELECT COUNT(*) n FROM hoi_dap WHERE nguoi_hoi = ? AND tin_cuoi_tu = 'xu_ly' AND (doc_hoi_luc IS NULL OR doc_hoi_luc < tin_cuoi_luc)`,
  ).bind(email).first<{ n: number }>();
  let choTiepNhan = 0;
  let xuLyChuaDoc = 0;
  if (xuLy) {
    const r = await c.env.DB.prepare(
      `SELECT SUM(CASE WHEN trang_thai = 'Cho tiep nhan' THEN 1 ELSE 0 END) cho,
              SUM(CASE WHEN trang_thai = 'Dang xu ly' AND tin_cuoi_tu = 'hoi' AND (doc_xu_ly_luc IS NULL OR doc_xu_ly_luc < tin_cuoi_luc) THEN 1 ELSE 0 END) moi
       FROM hoi_dap WHERE nguoi_hoi != ?`,
    ).bind(email).first<{ cho: number | null; moi: number | null }>();
    choTiepNhan = r?.cho ?? 0;
    xuLyChuaDoc = r?.moi ?? 0;
  }
  return c.json({ la_xu_ly: xuLy, chua_doc: (cuaToi?.n ?? 0) + xuLyChuaDoc, cho_tiep_nhan: choTiepNhan });
});

// GET /?trang_thai=&q=&pham_vi=cua-toi - danh sach (nguoi hoi: cua minh; phia xu ly: tat ca, pham_vi=cua-toi = minh hoi).
hoiDap.get("/", async (c) => {
  const user = c.get("user");
  const xuLy = laXuLy(c) && c.req.query("pham_vi") !== "cua-toi";
  const tt = c.req.query("trang_thai");
  const q = c.req.query("q")?.trim().toUpperCase();
  const where: string[] = [];
  const binds: unknown[] = [];
  if (!xuLy) {
    where.push("nguoi_hoi = ?");
    binds.push(user.email);
  }
  if (tt === "__MO__") where.push("trang_thai IN ('Cho tiep nhan', 'Dang xu ly')");
  else if (tt && tt in NHAN_TT) {
    where.push("trang_thai = ?");
    binds.push(tt);
  }
  if (q) {
    where.push("(UPPER(id) LIKE '%' || ? || '%' OR UPPER(COALESCE(ma_lk, '')) LIKE '%' || ? || '%' OR UPPER(COALESCE(ma_don, '')) LIKE '%' || ? || '%' OR UPPER(tieu_de) LIKE '%' || ? || '%')");
    binds.push(q, q, q, q);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM hoi_dap ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY CASE WHEN trang_thai IN ('Cho tiep nhan', 'Dang xu ly') THEN 0 ELSE 1 END, tin_cuoi_luc DESC LIMIT 200`,
  ).bind(...binds).all<HoiDapRow>();
  const ten = await tenNguoiMap(c.env.DB, [...new Set(results.flatMap((r) => [r.nguoi_hoi, r.nguoi_xu_ly ?? ""]).filter(Boolean))]);
  return c.json({
    la_xu_ly: laXuLy(c),
    rows: results.map((r) => ({
      ...r,
      ten_nguoi_hoi: ten.get(r.nguoi_hoi) ?? r.nguoi_hoi,
      ten_nguoi_xu_ly: r.nguoi_xu_ly ? ten.get(r.nguoi_xu_ly) ?? r.nguoi_xu_ly : null,
      chua_doc: chuaDoc(r, r.nguoi_hoi === user.email ? "hoi" : "xu_ly"),
    })),
  });
});

// POST / - { loai, noi_dung, ma_lk?, ma_don? } - tao cau hoi (ticket "Cho tiep nhan") + bao Mua hang.
hoiDap.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ loai?: string; noi_dung?: string; ma_lk?: string; ma_don?: string }>().catch(() => ({}) as Record<string, string>);
  const loai = body.loai && body.loai in LOAI ? body.loai : null;
  const noiDung = body.noi_dung?.trim();
  if (!loai) return c.json({ error: "LOAI_KHONG_HOP_LE" }, 400);
  if (!noiDung) return c.json({ error: "THIEU_NOI_DUNG" }, 400);
  if (noiDung.length > MAX_TIN) return c.json({ error: "NOI_DUNG_QUA_DAI" }, 400);
  const maLk = body.ma_lk?.trim().slice(0, 60) || null;
  const maDon = body.ma_don?.trim().slice(0, 60) || null;
  const id = await nextSequentialId(c.env.DB, "hoi_dap", "HD", 6);
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO hoi_dap (id, nguoi_hoi, loai, ma_lk, ma_don, tieu_de, trang_thai, ngay_tao, cap_nhat_luc, tin_cuoi_luc, tin_cuoi_tu, doc_hoi_luc)
       VALUES (?, ?, ?, ?, ?, ?, 'Cho tiep nhan', ?, ?, ?, 'hoi', ?)`,
    ).bind(id, user.email, loai, maLk, maDon, noiDung.slice(0, 120), now, now, now, now),
    c.env.DB.prepare("INSERT INTO hoi_dap_tin (hoi_dap_id, nguoi_gui, phia, noi_dung, ngay_tao) VALUES (?, ?, 'hoi', ?, ?)").bind(id, user.email, noiDung, now),
  ]);
  const ten = (await tenNguoiMap(c.env.DB, [user.email])).get(user.email) ?? user.email;
  c.executionCtx.waitUntil(
    (async () => baoTin(c.env, await emailsXuLy(c.env.DB), user.email, id,
      `${ten} ${LOAI[loai].toLowerCase()} (${id}${maLk ? ` · ${maLk}` : ""}): ${noiDung}`))(),
  );
  return c.json({ ok: true, id }, 201);
});

// GET /:id - chi tiet + tin nhan.
hoiDap.get("/:id", async (c) => {
  const t = await docTicket(c.env.DB, c.req.param("id"));
  if (!t) return c.json({ error: "NOT_FOUND" }, 404);
  const phia = phiaCua(c, t);
  if (!phia) return c.json({ error: "NOT_FOUND" }, 404);
  const { results: tin } = await c.env.DB.prepare("SELECT * FROM hoi_dap_tin WHERE hoi_dap_id = ? ORDER BY id").bind(t.id).all<{
    id: number; nguoi_gui: string; phia: string; noi_dung: string; ngay_tao: string;
  }>();
  const ten = await tenNguoiMap(c.env.DB, [...new Set([t.nguoi_hoi, t.nguoi_xu_ly ?? "", ...tin.map((m) => m.nguoi_gui)].filter(Boolean))]);
  const mo = TT_MO.includes(t.trang_thai);
  return c.json({
    ticket: { ...t, ten_nguoi_hoi: ten.get(t.nguoi_hoi) ?? t.nguoi_hoi, ten_nguoi_xu_ly: t.nguoi_xu_ly ? ten.get(t.nguoi_xu_ly) ?? t.nguoi_xu_ly : null },
    tin: tin.map((m) => ({ ...m, ten_nguoi_gui: ten.get(m.nguoi_gui) ?? m.nguoi_gui })),
    phia,
    quyen: {
      gui_tin: mo,
      tiep_nhan: phia === "xu_ly" && t.trang_thai === "Cho tiep nhan",
      da_xu_ly: phia === "xu_ly" && mo,
      tu_choi: phia === "xu_ly" && mo,
      huy_bo: phia === "hoi" && mo,
    },
  });
});

// POST /:id/doc - danh dau da doc phia nguoi xem.
hoiDap.post("/:id/doc", async (c) => {
  const t = await docTicket(c.env.DB, c.req.param("id"));
  if (!t) return c.json({ error: "NOT_FOUND" }, 404);
  const phia = phiaCua(c, t);
  if (!phia) return c.json({ error: "NOT_FOUND" }, 404);
  await c.env.DB.prepare(`UPDATE hoi_dap SET ${phia === "hoi" ? "doc_hoi_luc" : "doc_xu_ly_luc"} = ? WHERE id = ?`).bind(nowVN(), t.id).run();
  return c.json({ ok: true });
});

// POST /:id/tin - { noi_dung } - nhan tin. Phia xu ly tra loi ticket "Cho tiep nhan" = tu tiep nhan (Dang xu ly).
hoiDap.post("/:id/tin", async (c) => {
  const user = c.get("user");
  const t = await docTicket(c.env.DB, c.req.param("id"));
  if (!t) return c.json({ error: "NOT_FOUND" }, 404);
  const phia = phiaCua(c, t);
  if (!phia) return c.json({ error: "NOT_FOUND" }, 404);
  if (!TT_MO.includes(t.trang_thai)) return c.json({ error: "TICKET_DA_DONG", trang_thai: t.trang_thai }, 409);
  const body = await c.req.json<{ noi_dung?: string }>().catch(() => ({}) as { noi_dung?: string });
  const noiDung = body.noi_dung?.trim();
  if (!noiDung) return c.json({ error: "THIEU_NOI_DUNG" }, 400);
  if (noiDung.length > MAX_TIN) return c.json({ error: "NOI_DUNG_QUA_DAI" }, 400);
  const now = nowVN();
  const tuTiepNhan = phia === "xu_ly" && t.trang_thai === "Cho tiep nhan";
  const stmts = [
    // CAS theo cap_nhat_luc + trang thai: ticket vua bi dong / doi -> khong ghi.
    c.env.DB.prepare(
      `UPDATE hoi_dap SET tin_cuoi_luc = ?, tin_cuoi_tu = ?, cap_nhat_luc = ?, ${phia === "hoi" ? "doc_hoi_luc" : "doc_xu_ly_luc"} = ?
         ${tuTiepNhan ? ", trang_thai = 'Dang xu ly', nguoi_xu_ly = ?" : ""}
       WHERE id = ? AND trang_thai IN ('Cho tiep nhan', 'Dang xu ly')`,
    ).bind(...[now, phia, now, now, ...(tuTiepNhan ? [user.email] : []), t.id]),
    ...(tuTiepNhan
      ? [c.env.DB.prepare("INSERT INTO hoi_dap_tin (hoi_dap_id, nguoi_gui, phia, noi_dung, ngay_tao) VALUES (?, ?, 'he_thong', 'Đã tiếp nhận câu hỏi', ?)").bind(t.id, user.email, now)]
      : []),
    c.env.DB.prepare("INSERT INTO hoi_dap_tin (hoi_dap_id, nguoi_gui, phia, noi_dung, ngay_tao) VALUES (?, ?, ?, ?, ?)").bind(t.id, user.email, phia, noiDung, now),
  ];
  const kq = await c.env.DB.batch(stmts);
  if (!kq[0].meta.changes) return c.json({ error: "TICKET_DA_DONG" }, 409);
  const ten = (await tenNguoiMap(c.env.DB, [user.email])).get(user.email) ?? user.email;
  c.executionCtx.waitUntil(
    (async () => {
      const nhan = phia === "xu_ly" ? [t.nguoi_hoi] : t.nguoi_xu_ly ? [t.nguoi_xu_ly] : await emailsXuLy(c.env.DB);
      await baoTin(c.env, nhan, user.email, t.id, `${ten} (${t.id}): ${noiDung}`);
    })(),
  );
  return c.json({ ok: true, trang_thai: tuTiepNhan ? "Dang xu ly" : t.trang_thai });
});

// POST /:id/trang-thai - { trang_thai, ly_do? } - phia xu ly: Dang xu ly (tiep nhan) / Da xu ly / Tu choi (bat buoc ly do);
// nguoi hoi: Huy bo. Chi tu 2 trang thai mo.
hoiDap.post("/:id/trang-thai", async (c) => {
  const user = c.get("user");
  const t = await docTicket(c.env.DB, c.req.param("id"));
  if (!t) return c.json({ error: "NOT_FOUND" }, 404);
  const phia = phiaCua(c, t);
  if (!phia) return c.json({ error: "NOT_FOUND" }, 404);
  const body = await c.req.json<{ trang_thai?: string; ly_do?: string }>().catch(() => ({}) as { trang_thai?: string; ly_do?: string });
  const moi = body.trang_thai as TrangThai;
  const lyDo = body.ly_do?.trim().slice(0, 500) || null;
  if (!TT_MO.includes(t.trang_thai)) return c.json({ error: "TICKET_DA_DONG", trang_thai: t.trang_thai }, 409);
  const hopLe =
    (phia === "xu_ly" && moi === "Dang xu ly" && t.trang_thai === "Cho tiep nhan") ||
    (phia === "xu_ly" && (moi === "Da xu ly" || moi === "Tu choi")) ||
    (phia === "hoi" && moi === "Huy bo");
  if (!hopLe) return c.json({ error: "KHONG_DUOC_CHUYEN", trang_thai: t.trang_thai }, 409);
  if (moi === "Tu choi" && !lyDo) return c.json({ error: "THIEU_LY_DO" }, 400);
  const now = nowVN();
  const ganXuLy = phia === "xu_ly" && !t.nguoi_xu_ly;
  const ghiChu = `${NHAN_TT[moi]}${lyDo ? `: ${lyDo}` : ""}`;
  const kq = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE hoi_dap SET trang_thai = ?, cap_nhat_luc = ?, tin_cuoi_luc = ?, tin_cuoi_tu = ?, ly_do = COALESCE(?, ly_do)
         ${ganXuLy ? ", nguoi_xu_ly = ?" : ""}, ${phia === "hoi" ? "doc_hoi_luc" : "doc_xu_ly_luc"} = ?
       WHERE id = ? AND trang_thai = ?`,
    ).bind(...[moi, now, now, phia, moi === "Tu choi" || moi === "Huy bo" ? lyDo : null, ...(ganXuLy ? [user.email] : []), now, t.id, t.trang_thai]),
    c.env.DB.prepare("INSERT INTO hoi_dap_tin (hoi_dap_id, nguoi_gui, phia, noi_dung, ngay_tao) VALUES (?, ?, 'he_thong', ?, ?)").bind(t.id, user.email, ghiChu, now),
  ]);
  if (!kq[0].meta.changes) return c.json({ error: "DU_LIEU_VUA_DOI" }, 409);
  const ten = (await tenNguoiMap(c.env.DB, [user.email])).get(user.email) ?? user.email;
  c.executionCtx.waitUntil(
    (async () => {
      const nhan = phia === "xu_ly" ? [t.nguoi_hoi] : t.nguoi_xu_ly ? [t.nguoi_xu_ly] : await emailsXuLy(c.env.DB);
      await baoTin(c.env, nhan, user.email, t.id, `${t.id} — ${ghiChu} (${ten})`);
    })(),
  );
  return c.json({ ok: true, trang_thai: moi });
});

export default hoiDap;
