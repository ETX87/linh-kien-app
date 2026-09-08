import { Hono } from "hono";
import type { Env } from "../types";
import { nowVN } from "../lib/vnTime";
import { sendPushToUser } from "../lib/webPush";

// Nguyen tac "Kho chi thao tac qua app kho van" (chot 2026-09-07): nhan vien Kho khong
// con dang nhap/thao tac truc tiep trong app nay nua - cac buoc thuoc vai tro Kho trong
// phieu_xuat_kho (Dang gui KTV / Hang tru kho / Kho da ket thuc / Kho da nhan hang tra)
// duoc thuc hien TRONG khovan, khovan goi API sang day. Chi nhan DUNG 4 trang thai nay
// (khong dung chung route voi POST /:id/log session-based) - CHAN CUNG cac buoc Ke
// toan/TN (Cho ke toan, Da chot xong don xuat, Ke toan huy) du logic CAS/log giong het,
// vi cac buoc do KHONG thuoc vai tro Kho.
const partnerKho = new Hono<{ Bindings: Env }>();

partnerKho.use("*", async (c, next) => {
  const key = c.req.header("X-Khovan-Key");
  if (!key || !c.env.KHOVAN_PARTNER_API_KEY || key !== c.env.KHOVAN_PARTNER_API_KEY) {
    return c.json({ error: "INVALID_KEY" }, 401);
  }
  await next();
});

const TRANG_THAI_DONG = ["KTV da nhan", "Ke toan huy", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"] as const;
const KHO_TARGETS = ["Dang gui KTV", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"] as const;
type KhoTarget = (typeof KHO_TARGETS)[number];

function latestStatusExpr(idCol: string): string {
  return `(SELECT trang_thai FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = ${idCol} ORDER BY id DESC LIMIT 1)`;
}

partnerKho.post("/phieu-xuat-kho/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ trang_thai?: string; ghi_chu?: string; ma_van_don?: string; actor_label?: string }>().catch(
    () => ({}) as { trang_thai?: string; ghi_chu?: string; ma_van_don?: string; actor_label?: string },
  );
  const target = body.trang_thai;
  if (!target || !(KHO_TARGETS as readonly string[]).includes(target)) return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  const actor = body.actor_label?.trim() || "Kho (qua khovan)";

  const pxk = await c.env.DB.prepare(
    `SELECT loai_don, nguoi_nhan_hang, version, ${latestStatusExpr("phieu_xuat_kho.id")} as trang_thai FROM phieu_xuat_kho WHERE id = ?`,
  )
    .bind(id)
    .first<{ loai_don: string | null; nguoi_nhan_hang: string | null; version: number; trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  const hienTai = pxk.trang_thai ?? "Dang tao phieu";
  if ((TRANG_THAI_DONG as readonly string[]).includes(hienTai)) return c.json({ error: "PHIEU_DA_DONG" }, 409);

  const khoTarget = target as KhoTarget;
  if (khoTarget === "Dang gui KTV" || khoTarget === "Hang tru kho") {
    if (hienTai !== "Da chot xong don xuat") return c.json({ error: "INVALID_STATE" }, 409);
  } else if (khoTarget === "Kho da ket thuc") {
    if (hienTai !== "Dang gui KTV") return c.json({ error: "INVALID_STATE" }, 409);
  } else if (khoTarget === "Kho da nhan hang tra") {
    if (hienTai !== "Da chot xong don xuat") return c.json({ error: "INVALID_STATE" }, 409);
    if (pxk.loai_don !== "tra_hang") return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  }

  const casResult = await c.env.DB.prepare(
    "UPDATE phieu_xuat_kho SET trang_thai_hien_tai = ?, version = version + 1 WHERE id = ? AND version = ?",
  )
    .bind(khoTarget, id, pxk.version)
    .run();
  if (!casResult.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);

  await c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(id, khoTarget, actor, nowVN(), body.ghi_chu?.trim() || null)
    .run();

  if (khoTarget === "Dang gui KTV" && body.ma_van_don?.trim()) {
    await c.env.DB.prepare("UPDATE phieu_xuat_kho SET ma_van_don = ? WHERE id = ?").bind(body.ma_van_don.trim(), id).run();
  }

  // Thong bao KTV nhan hang khi Kho da gui (giu nguyen y nghia voi POST /:id/log session-based).
  if (khoTarget === "Dang gui KTV" && pxk.nguoi_nhan_hang) {
    const noiDung = `Phiếu xuất kho ${id} của bạn đã được Kho gửi hàng`;
    c.executionCtx.waitUntil(
      (async () => {
        await c.env.DB.prepare(
          "INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, 'kho_da_gui', ?, 'phieu_xuat_kho', ?, ?)",
        )
          .bind(pxk.nguoi_nhan_hang, noiDung, id, nowVN())
          .run();
        await sendPushToUser(c.env, pxk.nguoi_nhan_hang!, { title: "Phiếu xuất kho", body: noiDung, url: "/" });
      })(),
    );
  }

  return c.json({ ok: true });
});

export default partnerKho;
