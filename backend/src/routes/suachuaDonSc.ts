import type { Context, Hono } from "hono";
import type { Env } from "../types";
import { taiAppUserTheoEmail } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { traDonBh } from "../lib/donBhClient";
import { laCongNoSuaChua } from "../lib/pxkRecalculate";
import { TRANG_THAI_PXK_DON_SQL } from "../lib/trangThaiDonPxk";
import { latestThieuLkStatusExpr, phanLoaiHuyDon, taoPhieuDat, thucHienHuyDon, yeuCauHuyDon } from "./datMuaLinhKien";

// CÔNG NỢ SỬA CHỮA - cap linh kien tu CA 2 app (chot 2026-11-16, v1.498, migration 0121). Nguyen van: "đóng luồng hoạt động trên app đổi trả,
// chuyển hoàn toàn sang app đặt lk - nhưng vẫn cho tạo đơn trực tiếp trên app đổi trả, sửa 1 số thông tin cơ bản khi tạo linh kiện (nếu như
// kế toán chưa xử lý (app sửa chữa chỉ dùng để theo dõi thông tin và chuyển trạng thái theo API)" + "Cấp lk tạo được từ cả 2 bên: thông tin
// thống nhất đẩy hết về app linh kiện, kế toán duyệt trên app lk. app đổi trả chỉ còn bước tạo cấp lk (sửa lk, số lượng nếu cần trước khi kế
// toán duyệt xuất kho)".
// App doi tra (Worker suachua) goi qua Service Binding + X-Sync-Key (middleware cua suachuaPartner). Moi thao tac chay bang TAI KHOAN NV sua
// chua (nguoi nhan hang) tren app nay -> dung CHINH taoPhieuDat / yeuCauHuyDon (khong co ban logic thu 2): ton kho, cho hang, phieu, Ke toan,
// Kho y het don NV tu dat. Nguoi bam that ben doi tra (NV / Admin BH) ghi vao ghi chu + log.
//  - POST /don-sc            tao 1 don tu 1 de xuat DX (client_request_id "sc:<DX>:<lan>" chong tao trung khi goi lai).
//  - POST /don-sc/:id/sua    sua ma LK / SL / ghi chu - CHI don nguon 'doitra', CHI khi Ke toan chua xu ly (phanLoaiHuyDon huy ngay duoc):
//                            ghi chu = sua tai cho; ma LK / SL = huy don cu + tao don moi (danh gia lai ton kho / phieu tu dau).
//  - POST /don-sc/:id/huy    huy (cung luat yeu cau huy: chua xu ly -> huy ngay, Kho / Mua hang / Ke toan dang xu ly -> cho bo phan dong y).
//  - GET  /don-sc            trang thai hien tai cac don CÔNG NỢ SỬA CHỮA gan don bao hanh (?bh=<ma,..> | ?ids=<DDH,..> | mac dinh 120 ngay).

type Ctx = Context<{ Bindings: Env }>;
const LOAI_DE_XUAT = "CÔNG NỢ SỬA CHỮA";

const chuoi = (v: unknown, max = 500): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, max) : undefined;
};

// Gan tai khoan NV vao context nhu loadUser (giong partnerDatHang.ts ganTaiKhoanDatHang).
async function ganNv(c: Ctx, email: string): Promise<Response | null> {
  const user = await taiAppUserTheoEmail(c.env.DB, email.trim().toLowerCase());
  if ("error" in user) return c.json({ error: user.error, email }, 403);
  await c.env.DB.prepare("PRAGMA foreign_keys = ON").run();
  c.set("user", user);
  c.set("realIsAdmin", user.vai_tro === "Admin");
  c.set("realEmail", user.email);
  c.set("viewAsRole", null);
  c.set("viewAsUser", null);
  return null;
}

// Nhan trang thai hien thi ben app doi tra (ban rut gon cua nhanTrangThaiDon o FE LuongDon.tsx - doi luong o backend thi sua ca 2).
const NHAN_PXK: Record<string, string> = {
  cho_tao_phieu: "Đã duyệt — chờ vào phiếu xuất",
  cho_ktv_chuyen_tien: "Chờ chuyển tiền",
  cho_xac_nhan_chuyen_tien: "Chờ xác nhận chuyển tiền",
  cho_gui_ke_toan: "Đã duyệt — chờ gửi Kế toán",
  cho_ke_toan_chot: "Kế toán đang chốt phiếu",
  cho_kho_gui_hang: "Kho đang xuất hàng",
  cho_ktv_xac_nhan: "Đang giao — chờ NV xác nhận đã nhận",
  ktv_da_nhan: "NV đã nhận hàng",
  hang_tru_kho: "Đã trừ kho",
  kho_da_ket_thuc: "Kho đã kết thúc",
};
const NHAN_TICKET: Record<string, string> = {
  "Cho kho xu ly": "Chờ hàng — chờ Kho tiếp nhận",
  "Kho da tiep nhan": "Chờ hàng — Kho đã tiếp nhận",
  "Kho da cap nhat": "Chờ hàng — Kho đã cập nhật dự kiến",
  "Cho mua hang": "Chờ hàng — chờ Mua hàng đặt",
  "Mua hang da dat": "Chờ hàng — Mua hàng đã đặt",
};
// buoc: dong (huy / tu choi) | xong (NV da nhan / tru kho) | xu_ly (Ke toan / Kho dang lam) | cho (chua duyet / cho hang)
export function nhanDonSc(r: { tt: string; pxk_tt: string | null; ticket_tt: string | null; ngay_du_kien: string | null }): { nhan: string; buoc: string } {
  if (r.tt === "Da huy") return { nhan: "Đã hủy", buoc: "dong" };
  if (r.tt === "TN tu choi" || r.tt === "Tu choi") return { nhan: "Bị từ chối", buoc: "dong" };
  if (r.tt === "Cho hang") {
    const n = (r.ticket_tt && NHAN_TICKET[r.ticket_tt]) || "Chờ hàng về kho";
    return { nhan: r.ngay_du_kien ? `${n} (dự kiến ${r.ngay_du_kien.slice(8, 10)}/${r.ngay_du_kien.slice(5, 7)})` : n, buoc: "cho" };
  }
  if (r.tt === "Cho thanh toan") return { nhan: "Kho thiếu hàng", buoc: "cho" };
  if (r.tt === "Cho GS duyet") return { nhan: "Chờ Giám sát duyệt", buoc: "cho" };
  if (r.tt === "Cho TBP xac nhan") return { nhan: "Chờ TBP duyệt", buoc: "cho" };
  if (r.tt === "Cho TN duyet" || r.tt === "Cho Tram duyet") return { nhan: "Chờ duyệt đơn", buoc: "cho" };
  if (r.tt === "TN da duyet") {
    const p = r.pxk_tt ?? "cho_tao_phieu";
    const buoc = ["ktv_da_nhan", "hang_tru_kho", "kho_da_ket_thuc"].includes(p) ? "xong" : ["cho_ke_toan_chot", "cho_kho_gui_hang", "cho_ktv_xac_nhan"].includes(p) ? "xu_ly" : "cho";
    return { nhan: NHAN_PXK[p] ?? "Đã duyệt", buoc };
  }
  return { nhan: r.tt, buoc: "cho" };
}

interface DonScRow {
  id: string; loai_de_xuat: string | null; nguon_tao: string | null; nguon_tao_id: string | null; bh_don_vi_id: string | null; bh_lien_ket: number;
  ma_lk: string; ten_lk: string | null; so_luong: number; ghi_chu: string | null; nguoi_tao: string; nguoi_nhan_hang: string | null;
  ngay_tao: string; tt: string; pxk_tt: string | null; pxk_id: string | null; ma_misa: string | null; ticket_tt: string | null;
  ngay_du_kien: string | null; yeu_cau_huy_bo_phan: string | null;
}

async function docDonSc(db: D1Database, where: string, binds: unknown[]): Promise<Record<string, unknown>[]> {
  const { results } = await db.prepare(
    `SELECT ddh.id, ddh.loai_de_xuat, ddh.nguon_tao, ddh.nguon_tao_id, ddh.bh_don_vi_id, COALESCE(ddh.bh_lien_ket, 0) AS bh_lien_ket, ddh.ma_lk,
       ddh.ten_lk_snapshot AS ten_lk, COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) AS so_luong, ddh.ghi_chu, ddh.nguoi_tao,
       ddh.nguoi_nhan_hang, ddh.ngay_tao, ddh.trang_thai_hien_tai AS tt, ${TRANG_THAI_PXK_DON_SQL("ddh")} AS pxk_tt,
       (SELECT pd.phieu_xuat_kho_id FROM phieu_xuat_kho_dong pd WHERE pd.dat_don_hang_id = ddh.id ORDER BY pd.rowid DESC LIMIT 1) AS pxk_id,
       (SELECT p.ma_misa FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id WHERE pd.dat_don_hang_id = ddh.id
          ORDER BY pd.rowid DESC LIMIT 1) AS ma_misa,
       (SELECT ${latestThieuLkStatusExpr("t.id")} FROM thieu_lk t WHERE t.dat_don_hang_id = ddh.id ORDER BY t.ngay_tao DESC, t.id DESC LIMIT 1) AS ticket_tt,
       (SELECT t.ngay_du_kien_co_hang FROM thieu_lk t WHERE t.dat_don_hang_id = ddh.id ORDER BY t.ngay_tao DESC, t.id DESC LIMIT 1) AS ngay_du_kien,
       (SELECT y.bo_phan FROM yeu_cau_huy_don y WHERE y.dat_don_hang_id = ddh.id AND y.trang_thai = 'Cho dong y') AS yeu_cau_huy_bo_phan
     FROM dat_don_hang ddh
     WHERE ddh.bh_don_vi_id IS NOT NULL AND ${where}
     ORDER BY ddh.ngay_tao DESC, ddh.id DESC LIMIT 2000`,
  ).bind(...binds).all<DonScRow>();
  const out: Record<string, unknown>[] = [];
  for (const r of results) {
    // loc loai de xuat o JS (SQLite UPPER khong ha chu co dau).
    if (!laCongNoSuaChua(r.loai_de_xuat)) continue;
    const { nhan, buoc } = nhanDonSc(r);
    // "Sua / huy ngay" chi khi Ke toan chua xu ly (phanLoaiHuyDon: huy duoc + khong can bo phan dong y) - chi tinh cho don con mo.
    let suaDuoc = false;
    let giaiDoan: string | null = null;
    if (buoc !== "dong" && buoc !== "xong") {
      const pl = await phanLoaiHuyDon(db, r.id);
      suaDuoc = !!pl && pl.huy_duoc && !pl.bo_phan && !r.yeu_cau_huy_bo_phan;
      giaiDoan = pl?.giai_doan ?? null;
    }
    out.push({ ...r, nhan, buoc, sua_duoc: suaDuoc, giai_doan: giaiDoan });
  }
  return out;
}

// Tao 1 don tu de xuat (dung chung cho tao moi + sua ma LK / SL). Tra { id } hoac Response loi.
async function taoDonTuDeXuat(
  c: Ctx,
  b: { dx_id: string; lan: number; unit_id: string; nv_email: string; nguoi_thao_tac: string; ma_lk: string; so_luong: number; ghi_chu?: string },
): Promise<{ id: string; trang_thai: string; ly_do: string | null } | Response> {
  const ghiChuTao = [`[App Bảo hành đổi trả ${b.dx_id}${b.nguoi_thao_tac !== b.nv_email ? ` — ${b.nguoi_thao_tac} tạo hộ` : ""}]`, b.ghi_chu]
    .filter(Boolean).join(" ");
  // v1.504: dien san Mã YCSC (case) / TT khách hàng / TT+Mail duyệt nhu form app nay tu dien khi chon don bao hanh (v1.499) - lay tu app doi
  // tra (traDonBh); khong ket noi duoc thi bo trong (khong chan tao don).
  const bh = await traDonBh(c.env, b.unit_id);
  const ten = await c.env.DB.prepare(
    `SELECT COALESCE((SELECT k.ten_hien_thi FROM ktv_lien_he k WHERE LOWER(k.email_dang_nhap) = LOWER(u.email) LIMIT 1), u.ten, u.email) AS ten
     FROM users u WHERE u.email = ?`,
  ).bind(b.nv_email).first<{ ten: string }>();
  const tenNv = (ten?.ten ?? b.nv_email).split(/\s[-–]\s/).pop()!.trim();
  const res = await taoPhieuDat(c, {
    nguoi_nhan_hang: b.nv_email,
    client_request_id: `sc:${b.dx_id}:${b.lan}`,
    don_hang: [{
      ma_lk: b.ma_lk, loai_de_xuat: LOAI_DE_XUAT, so_luong_de_xuat: b.so_luong, ghi_chu: ghiChuTao, bh_don_vi_id: b.unit_id,
      ma_yeu_cau_su_co: bh?.case_id ?? undefined,
      tt_khach_hang: bh?.ten_khach_hang ?? undefined,
      tt_mail_duyet: `Xuất công nợ sửa chữa cho NV ${tenNv}`,
    }],
  });
  const j = (await res.clone().json().catch(() => ({}))) as { id?: string; error?: string };
  if (res.status >= 400 || !j.id) return res;
  const don = await c.env.DB.prepare("SELECT id, trang_thai_hien_tai AS tt FROM dat_don_hang WHERE phieu_dat_id = ? ORDER BY id LIMIT 1")
    .bind(j.id).first<{ id: string; tt: string }>();
  if (!don) return c.json({ error: "KHONG_TIM_THAY_DON_VUA_TAO", phieu_dat: j.id }, 500);
  await c.env.DB.prepare("UPDATE dat_don_hang SET nguon_tao = 'doitra', nguon_tao_id = ? WHERE phieu_dat_id = ?").bind(b.dx_id, j.id).run();
  const log = await c.env.DB.prepare(
    "SELECT ghi_chu FROM dat_don_hang_log WHERE dat_don_hang_id = ? ORDER BY id DESC LIMIT 1",
  ).bind(don.id).first<{ ghi_chu: string | null }>();
  return { id: don.id, trang_thai: don.tt, ly_do: log?.ghi_chu ?? null };
}

async function docDon(db: D1Database, id: string) {
  return db.prepare(
    `SELECT id, nguon_tao, nguon_tao_id, loai_de_xuat, bh_don_vi_id, ma_lk, so_luong_de_xuat, ghi_chu, nguoi_nhan_hang, trang_thai_hien_tai AS tt
     FROM dat_don_hang WHERE id = ?`,
  ).bind(id).first<{
    id: string; nguon_tao: string | null; nguon_tao_id: string | null; loai_de_xuat: string | null; bh_don_vi_id: string | null; ma_lk: string;
    so_luong_de_xuat: number; ghi_chu: string | null; nguoi_nhan_hang: string | null; tt: string;
  }>();
}

export function ganRouteDonSc(r: Hono<{ Bindings: Env }>) {
  r.get("/don-sc", async (c) => {
    const bh = (c.req.query("bh") ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 200);
    const ids = (c.req.query("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 500);
    const rows = bh.length
      ? await docDonSc(c.env.DB, "(ddh.bh_don_vi_id IN (SELECT value FROM json_each(?)) OR ddh.bh_don_vi_id IN (SELECT substr(value, 1, 9) FROM json_each(?)))", [JSON.stringify(bh), JSON.stringify(bh)])
      : ids.length
        ? await docDonSc(c.env.DB, "ddh.id IN (SELECT value FROM json_each(?))", [JSON.stringify(ids)])
        : await docDonSc(c.env.DB, "ddh.ngay_tao >= datetime('now', '+7 hours', '-120 days')", []);
    return c.json({ rows });
  });

  // POST /don-sc {dx_id, unit_id, nv_email, nguoi_thao_tac, ma_lk, so_luong, ghi_chu?}
  r.post("/don-sc", async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const dxId = chuoi(b.dx_id, 40);
    const unitId = chuoi(b.unit_id, 40)?.toUpperCase();
    const nv = chuoi(b.nv_email, 200)?.toLowerCase();
    const maLk = chuoi(b.ma_lk, 100);
    const sl = Number(b.so_luong);
    if (!dxId || !unitId || !nv || !maLk || !Number.isInteger(sl) || sl < 1) return c.json({ error: "INVALID_BODY" }, 400);
    const loi = await ganNv(c, nv);
    if (loi) return loi;
    const kq = await taoDonTuDeXuat(c, {
      dx_id: dxId, lan: 1, unit_id: unitId, nv_email: nv, nguoi_thao_tac: chuoi(b.nguoi_thao_tac, 200)?.toLowerCase() ?? nv, ma_lk: maLk, so_luong: sl,
      ghi_chu: chuoi(b.ghi_chu, 500),
    });
    if (kq instanceof Response) return kq;
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
    return c.json({ ok: true, don: (await docDonSc(c.env.DB, "ddh.id = ?", [kq.id]))[0] ?? kq, ly_do: kq.ly_do }, 201);
  });

  // POST /don-sc/:id/sua {nguoi_thao_tac, ma_lk?, so_luong?, ghi_chu?, lan}
  r.post("/don-sc/:id/sua", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const d = await docDon(c.env.DB, id);
    if (!d) return c.json({ error: "NOT_FOUND" }, 404);
    if (d.nguon_tao !== "doitra") return c.json({ error: "DON_TAO_TREN_APP_LINH_KIEN" }, 409);
    if (!d.nguoi_nhan_hang || !d.bh_don_vi_id || !d.nguon_tao_id) return c.json({ error: "DON_THIEU_THONG_TIN" }, 409);
    const nguoi = chuoi(b.nguoi_thao_tac, 200)?.toLowerCase() ?? d.nguoi_nhan_hang;
    const maLk = chuoi(b.ma_lk, 100) ?? d.ma_lk;
    const sl = b.so_luong !== undefined ? Number(b.so_luong) : d.so_luong_de_xuat;
    if (!Number.isInteger(sl) || sl < 1 || sl > 10000) return c.json({ error: "INVALID_SO_LUONG" }, 400);
    const ghiChu = b.ghi_chu !== undefined ? chuoi(b.ghi_chu, 500) ?? null : undefined;
    const pl = await phanLoaiHuyDon(c.env.DB, id);
    if (!pl || !pl.huy_duoc || pl.bo_phan) return c.json({ error: "KE_TOAN_DA_XU_LY", giai_doan: pl?.giai_doan ?? null }, 409);
    const loi = await ganNv(c, d.nguoi_nhan_hang);
    if (loi) return loi;
    const now = nowVN();
    if (maLk === d.ma_lk && sl === d.so_luong_de_xuat) {
      // Chi doi ghi chu -> sua tai cho (giu nguyen don, khong anh huong ton kho / phieu).
      if (ghiChu === undefined) return c.json({ ok: true, don: (await docDonSc(c.env.DB, "ddh.id = ?", [id]))[0] });
      const giuNhan = (d.ghi_chu ?? "").match(/^\[App Bảo hành đổi trả [^\]]*\]/)?.[0];
      const moi = [giuNhan, ghiChu].filter(Boolean).join(" ") || null;
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE dat_don_hang SET ghi_chu = ? WHERE id = ?").bind(moi, id),
        c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
          .bind(id, d.tt, d.nguoi_nhan_hang, now, `Sửa ghi chú trên app Bảo hành đổi trả (${nguoi})`),
      ]);
      return c.json({ ok: true, don: (await docDonSc(c.env.DB, "ddh.id = ?", [id]))[0] });
    }
    // Doi ma LK / SL: kiem tra ma truoc (loi re nhat) roi HUY don cu (tra lai ton kho dang giu) -> TAO don moi danh gia lai tu dau.
    const lk = await c.env.DB.prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien = ?").bind(maLk).first();
    if (!lk) return c.json({ error: "MA_LK_NOT_FOUND", ma_lk: maLk }, 400);
    const lan = Math.max(2, Number(b.lan) || 2);
    const huy = await thucHienHuyDon(c, id, `Sửa trên app Bảo hành đổi trả (${nguoi}): ${d.ma_lk} ×${d.so_luong_de_xuat} → ${maLk} ×${sl} — thay bằng đơn mới`, pl);
    if ("error" in huy) return c.json({ error: huy.error }, huy.status);
    const ghiGoc = (d.ghi_chu ?? "").replace(/^\[App Bảo hành đổi trả [^\]]*\]\s*/, "");
    const kq = await taoDonTuDeXuat(c, {
      dx_id: d.nguon_tao_id, lan, unit_id: d.bh_don_vi_id, nv_email: d.nguoi_nhan_hang, nguoi_thao_tac: nguoi, ma_lk: maLk, so_luong: sl,
      ghi_chu: ghiChu === undefined ? ghiGoc || undefined : ghiChu ?? undefined,
    });
    if (kq instanceof Response) {
      const j = (await kq.clone().json().catch(() => ({}))) as Record<string, unknown>;
      return c.json({ ...j, error: String(j.error ?? "TAO_DON_MOI_LOI"), don_cu_da_huy: id }, 409);
    }
    await c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Da huy', ?, ?, ?)")
      .bind(id, d.nguoi_nhan_hang, now, `Đã thay bằng đơn ${kq.id}`).run().catch(() => undefined);
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
    return c.json({ ok: true, thay_bang: kq.id, don: (await docDonSc(c.env.DB, "ddh.id = ?", [kq.id]))[0], ly_do: kq.ly_do });
  });

  // POST /don-sc/:id/huy {nguoi_thao_tac, ly_do}
  r.post("/don-sc/:id/huy", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const d = await docDon(c.env.DB, id);
    if (!d) return c.json({ error: "NOT_FOUND" }, 404);
    if (!laCongNoSuaChua(d.loai_de_xuat) || !d.nguoi_nhan_hang) return c.json({ error: "KHONG_PHAI_DON_SUA_CHUA" }, 409);
    const lyDo = chuoi(b.ly_do, 900);
    if (!lyDo) return c.json({ error: "THIEU_LY_DO_HUY" }, 400);
    const loi = await ganNv(c, d.nguoi_nhan_hang);
    if (loi) return loi;
    const nguoi = chuoi(b.nguoi_thao_tac, 200)?.toLowerCase() ?? d.nguoi_nhan_hang;
    const res = await yeuCauHuyDon(c, id, `[App Bảo hành đổi trả — ${nguoi}] ${lyDo}`);
    if (res.status >= 400) return res;
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return c.json({ ...j, don: (await docDonSc(c.env.DB, "ddh.id = ?", [id]))[0] });
  });
}
