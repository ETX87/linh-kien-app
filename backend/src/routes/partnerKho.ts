import { Hono } from "hono";
import type { Env } from "../types";
import { nowVN } from "../lib/vnTime";
import { sendPushToUser } from "../lib/webPush";
import { bumpVersions } from "../lib/dataVersions";

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

// SUA 2026-09-14 (xem giai thich day du trong phieuXuatKho.ts, comment "SUA 2026-09-14" dau file):
// latestStatusExpr() (doc dong log CUOI CUNG lam proxy trang thai that) bi migration 0028 (2026-09-13)
// lam sai lech - cac gia tri "log-only" moi (Da luu ma don hang/Da tai anh bien ban/...) do
// phieuXuatKho.ts ghi vao CHUNG bang phieu_xuat_kho_log khien 2 diem duoi day (dung chung bang do) gate
// sai theo. Bo ham nay, doc thang cot mirror trang_thai_hien_tai (luon dung, chi doi qua UPDATE CAS).

// Mirror POST /:id/dong-goi cua phieuXuatKho.ts (chi luu anh, khong doi trang_thai_hien_tai) -
// them 2026-09-08 de PXK- khop dung 4 hanh dong Kho chuan hoa voi TR- (xem Artifact "Ma tran
// luong Kho van"). actor_label la EMAIL nguoi xu ly ben khovan, cung quy uoc voi /log ben duoi -
// tao placeholder users truoc de tranh FOREIGN KEY constraint (xem giai thich chi tiet duoi).
partnerKho.post("/phieu-xuat-kho/:id/dong-goi", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ anh?: string[]; actor_label?: string }>().catch(() => ({}) as { anh?: string[]; actor_label?: string });
  const actor = body.actor_label?.trim() || "khovan-system@internal.local";
  await c.env.DB.prepare("INSERT INTO users (email, ten) VALUES (?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(actor, body.actor_label?.trim() ? null : "Kho (qua khovan, chưa rõ người)")
    .run();

  const pxk = await c.env.DB.prepare(
    "SELECT trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho WHERE id = ?",
  )
    .bind(id)
    .first<{ trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (pxk.trang_thai !== "Da chot xong don xuat") return c.json({ error: "INVALID_STATE" }, 409);

  const statements = (body.anh || []).map((url) =>
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_anh (phieu_xuat_kho_id, anh_url, nguoi_upload) VALUES (?, ?, ?)").bind(id, url, actor),
  );
  if (statements.length) await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

// Luong C moi (chot 08/09/2026, xem Artifact "Ma tran luong Kho van"): khovan goi vao day khi
// Kho quet ma thung "TRA-xxxxxx" va bam "Nhan hang" (dung khuon Luong A - 1 nut duy nhat, khovan
// tu nhan dien tien to). Tim theo ma_thung_tra (KHAC voi /phieu-xuat-kho/:id/log o duoi - id o do
// la chinh phieu_xuat_kho.id, con dat_don_hang.id ("DDH-xxxxxx") khac voi ma_thung_tra ("TRA-
// xxxxxx") vi day la 2 cot rieng, xem migrations/0023_tra_hang_box.sql). Chi chuyen dung 1 buoc
// "Cho kho xac nhan" -> "Cho QC xac nhan" - KHONG con qua nut bam noi bo (xem guard trong
// traHang.ts::applyTraHangLog).
partnerKho.post("/tra-hang/:maThung/kho-xac-nhan", async (c) => {
  const maThung = c.req.param("maThung");
  const body = await c.req.json<{ actor_label?: string }>().catch(() => ({}) as { actor_label?: string });
  const actor = body.actor_label?.trim() || "khovan-system@internal.local";
  await c.env.DB.prepare("INSERT INTO users (email, ten) VALUES (?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(actor, body.actor_label?.trim() ? null : "Kho (qua khovan, chưa rõ người)")
    .run();

  const ddh = await c.env.DB.prepare(
    "SELECT id, version, trang_thai_hien_tai as trang_thai FROM dat_don_hang WHERE ma_thung_tra = ? AND loai_don = 'tra_hang'",
  )
    .bind(maThung)
    .first<{ id: string; version: number; trang_thai: string | null }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);
  if (ddh.trang_thai !== "Cho kho xac nhan") return c.json({ error: "WRONG_STATE" }, 400);

  const casResult = await c.env.DB.prepare(
    "UPDATE dat_don_hang SET trang_thai_hien_tai = 'Cho QC xac nhan', version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
  )
    .bind(nowVN(), ddh.id, ddh.version)
    .run();
  if (!casResult.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);

  await c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(ddh.id, "Cho QC xac nhan", actor, nowVN(), "Kho xac nhan da nhan hang (qua khovan)")
    .run();

  // CHUA bao "viec moi" cho QC o day (roleForTraHangState/notifyWorkflowTask hien noi trong
  // traHang.ts, khong export) - QC van thay don trong GET /api/tra-hang?trang_thai=Cho QC xac
  // nhan binh thuong, chi thieu push chu dong. Co the bo sung sau neu can (tach 2 ham do ra 1
  // module dung chung).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

partnerKho.post("/phieu-xuat-kho/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ trang_thai?: string; ghi_chu?: string; ma_van_don?: string; actor_label?: string }>().catch(
    () => ({}) as { trang_thai?: string; ghi_chu?: string; ma_van_don?: string; actor_label?: string },
  );
  const target = body.trang_thai;
  if (!target || !(KHO_TARGETS as readonly string[]).includes(target)) return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  // actor_label ky vong la EMAIL nguoi xu ly ben khovan (xac nhan nguoi dung 2026-09-08: "chỉ cần
  // gửi email người xử lý", khong yeu cau linh-kien-app phai khai bao truoc - 2 he doc lap). Truoc
  // day dung thang lam nguoi_xu_ly (FK toi users(email)) - neu actor_label khong khop 1 email users
  // co san (rat co the xay ra vi Kho khong con tai khoan o day nua, xem comment dau file) thi INSERT
  // log ben duoi FAIL NGAY voi FOREIGN KEY constraint, khien toan bo request 500 nhung UPDATE CAS o
  // tren VAN DA COMMIT rieng (D1 khong tu bao 2 cau lenh trong 1 transaction) - trang_thai_hien_tai
  // bi lech voi trang thai tinh tu log (latestStatusExpr), day chinh la nguyen nhan that (da tai
  // hien qua curl). Sua: tu tao 1 dong users PLACEHOLDER cho email do neu chua ton tai (KHONG cap
  // quyen gi - moi co boolean mac dinh 0, ON CONFLICT DO NOTHING de khong dung cham 1 tai khoan that
  // dang dung neu email trung hop).
  const actor = body.actor_label?.trim() || "khovan-system@internal.local";
  await c.env.DB.prepare("INSERT INTO users (email, ten) VALUES (?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(actor, body.actor_label?.trim() ? null : "Kho (qua khovan, chưa rõ người)")
    .run();

  const pxk = await c.env.DB.prepare(
    "SELECT loai_don, nguoi_nhan_hang, version, trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho WHERE id = ?",
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

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

export default partnerKho;
