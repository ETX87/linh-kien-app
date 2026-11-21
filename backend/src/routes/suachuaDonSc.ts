import type { Context, Hono } from "hono";
import type { Env } from "../types";
import { taiAppUserTheoEmail } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { traDonBh } from "../lib/donBhClient";
import { laCongNoSuaChua, laTruCongNoSuaChua, laTraHangSuaChua, laDonSuaChua, laHoTroSuaChua0d, laMuaHangSuaChua, loaiDeXuatTheoDonBh, LDX_TRU_CONG_NO_SUA_CHUA, LDX_TRA_HANG_SUA_CHUA } from "../lib/pxkRecalculate";
import { goDonKhoiPxk } from "../lib/pxkTuHuy";
import { bundleAutoApprovedIntoPxk } from "../lib/pxkAutoBundle";
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

// 2026-11-16 (v1.507): "Tất cả bước trừ tự động tạo phiếu đẩy kế toán, không qua bước TN vì vai trò Tác nghiệp không xử lý bước này (trả
// hàng sửa chữa) cũng đi thẳng qua kế toán không cần đi theo luồng trả hàng công nợ". Phieu chua don vua tao (tu gom "Dang tao phieu")
// -> chuyen thang "Cho ke toan" (bo kiem tra ma xuat kho / giai trinh cua TN). Chi ap phieu CHI gom don TRỪ / TRẢ HÀNG - SỬA CHỮA.
async function dayPhieuSuaChuaSangKeToan(db: D1Database, donId: string, actor: string, ghiChu: string): Promise<string | null> {
  const p = await db.prepare(
    `SELECT p.id, p.version, p.trang_thai_hien_tai AS tt FROM phieu_xuat_kho_dong d JOIN phieu_xuat_kho p ON p.id = d.phieu_xuat_kho_id
     WHERE d.dat_don_hang_id = ? ORDER BY d.rowid DESC LIMIT 1`,
  ).bind(donId).first<{ id: string; version: number; tt: string | null }>();
  if (!p || (p.tt ?? "Dang tao phieu") !== "Dang tao phieu") return p?.id ?? null;
  const { results } = await db.prepare(
    "SELECT ddh.loai_de_xuat FROM phieu_xuat_kho_dong d JOIN dat_don_hang ddh ON ddh.id = d.dat_don_hang_id WHERE d.phieu_xuat_kho_id = ?",
  ).bind(p.id).all<{ loai_de_xuat: string | null }>();
  if (!results.length || !results.every((r) => laTruCongNoSuaChua(r.loai_de_xuat) || laTraHangSuaChua(r.loai_de_xuat))) return p.id;
  const cas = await db.prepare(
    "UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'Cho ke toan', ma_xuat_kho_xac_nhan = 1, version = version + 1 WHERE id = ? AND version = ?",
  ).bind(p.id, p.version).run();
  if (cas.meta.changes) {
    await db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho ke toan', ?, ?, ?)")
      .bind(p.id, actor, nowVN(), ghiChu).run();
  }
  return p.id;
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
  cho_kho_nhan_hang_tra: "Kế toán đã chốt — chờ Kho nhận hàng trả",
  kho_da_nhan_hang_tra: "Kho đã nhận hàng trả",
};
// 2026-11-16: don "TRẢ HÀNG CÔNG NỢ - SỬA CHỮA" (linh kien du NV tra kho) - cac buoc rieng cua luong tra hang.
const NHAN_TRA_HANG: Record<string, string> = {
  "Cho ke toan duyet mem": "Trả hàng — chờ Kế toán duyệt",
  "Cho kho xac nhan": "Trả hàng — chờ Kho nhận",
  "Cho QC xac nhan": "Trả hàng — chờ QC kiểm",
  "Cho TN duyet tong": "Trả hàng — chờ Tác nghiệp duyệt",
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
  if (NHAN_TRA_HANG[r.tt]) return { nhan: NHAN_TRA_HANG[r.tt], buoc: "xu_ly" };
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
    const buoc = ["ktv_da_nhan", "hang_tru_kho", "kho_da_ket_thuc", "kho_da_nhan_hang_tra"].includes(p) ? "xong" : ["cho_ke_toan_chot", "cho_kho_gui_hang", "cho_ktv_xac_nhan", "cho_kho_nhan_hang_tra"].includes(p) ? "xu_ly" : "cho";
    return { nhan: NHAN_PXK[p] ?? "Đã duyệt", buoc };
  }
  return { nhan: r.tt, buoc: "cho" };
}

interface DonScRow {
  id: string; loai_de_xuat: string | null; nguon_tao: string | null; nguon_tao_id: string | null; bh_don_vi_id: string | null; bh_lien_ket: number;
  ma_lk: string; ten_lk: string | null; so_luong: number; ghi_chu: string | null; nguoi_tao: string; nguoi_nhan_hang: string | null;
  ngay_tao: string; tt: string; pxk_tt: string | null; pxk_id: string | null; ma_misa: string | null; ticket_tt: string | null;
  ngay_du_kien: string | null; yeu_cau_huy_bo_phan: string | null;
  loai_goi_y: string | null; loai_goi_y_ly_do: string | null; // v1.547 - app doi tra canh bao lan cap chon khac loai goi y
}

async function docDonSc(db: D1Database, where: string, binds: unknown[], chiCsc = true): Promise<Record<string, unknown>[]> {
  const { results } = await db.prepare(
    `SELECT ddh.id, ddh.loai_de_xuat, ddh.nguon_tao, ddh.nguon_tao_id, ddh.bh_don_vi_id, COALESCE(ddh.bh_lien_ket, 0) AS bh_lien_ket, ddh.ma_lk, ddh.loai_goi_y, ddh.loai_goi_y_ly_do,
       ddh.ten_lk_snapshot AS ten_lk, COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) AS so_luong, ddh.ghi_chu, ddh.nguoi_tao,
       ddh.nguoi_nhan_hang, ddh.ngay_tao, ddh.trang_thai_hien_tai AS tt, ${TRANG_THAI_PXK_DON_SQL("ddh")} AS pxk_tt,
       (SELECT pd.phieu_xuat_kho_id FROM phieu_xuat_kho_dong pd WHERE pd.dat_don_hang_id = ddh.id ORDER BY pd.rowid DESC LIMIT 1) AS pxk_id,
       (SELECT p.ma_misa FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id WHERE pd.dat_don_hang_id = ddh.id
          ORDER BY pd.rowid DESC LIMIT 1) AS ma_misa,
       (SELECT ${latestThieuLkStatusExpr("t.id")} FROM thieu_lk t WHERE t.dat_don_hang_id = ddh.id ORDER BY t.ngay_tao DESC, t.id DESC LIMIT 1) AS ticket_tt,
       (SELECT t.ngay_du_kien_co_hang FROM thieu_lk t WHERE t.dat_don_hang_id = ddh.id ORDER BY t.ngay_tao DESC, t.id DESC LIMIT 1) AS ngay_du_kien,
       (SELECT y.bo_phan FROM yeu_cau_huy_don y WHERE y.dat_don_hang_id = ddh.id AND y.trang_thai = 'Cho dong y') AS yeu_cau_huy_bo_phan
     FROM dat_don_hang ddh
     WHERE ${chiCsc ? "ddh.bh_don_vi_id IS NOT NULL AND " : ""}${where}
     ORDER BY ddh.ngay_tao DESC, ddh.id DESC LIMIT 2000`,
  ).bind(...binds).all<DonScRow>();
  const out: Record<string, unknown>[] = [];
  for (const r of results) {
    // loc loai de xuat o JS (SQLite UPPER khong ha chu co dau).
    // v1.508: ca 3 loai cap linh kien sua chua (CÔNG NỢ / HỖ TRỢ SỬA CHỮA 0 ĐỒNG / MUA HÀNG SỬA CHỮA).
    if (chiCsc && !laDonSuaChua(r.loai_de_xuat)) continue;
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
  b: { dx_id: string; lan: number; unit_id: string; nv_email: string; nguoi_thao_tac: string; ma_lk: string; so_luong: number; ghi_chu?: string; loai?: string },
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
  // v1.508: loai theo don bao hanh (Karofi con BH = HỖ TRỢ SỬA CHỮA 0 ĐỒNG, het BH = MUA HÀNG SỬA CHỮA, con lai CÔNG NỢ SỬA CHỮA). taoPhieuDat
  // cung tu chon lai theo don bao hanh - day chi de dien dung TT+Mail duyet.
  // v1.508/1.509: app doi tra gui san loai (b.loai) - uu tien, khong phu thuoc lan goi nguoc traDonBh (loi / cham thi tung roi ve CÔNG NỢ am tham).
  const lde = (b.loai && laDonSuaChua(b.loai) ? b.loai : null) ?? loaiDeXuatTheoDonBh(bh) ?? LOAI_DE_XUAT;
  const ttDuyet = laHoTroSuaChua0d(lde)
    ? `Xuất hỗ trợ sửa chữa 0 đồng${bh?.doi_tac ? ` (${bh.doi_tac}, trong BH)` : ""} cho NV ${tenNv}`
    : laMuaHangSuaChua(lde)
      ? `Mua hàng sửa chữa (hết bảo hành) cho NV ${tenNv}`
      : `Xuất công nợ sửa chữa cho NV ${tenNv}`;
  const res = await taoPhieuDat(c, {
    nguoi_nhan_hang: b.nv_email,
    client_request_id: `sc:${b.dx_id}:${b.lan}`,
    don_hang: [{
      ma_lk: b.ma_lk, loai_de_xuat: lde, so_luong_de_xuat: b.so_luong, ghi_chu: ghiChuTao, bh_don_vi_id: b.unit_id,
      ma_yeu_cau_su_co: bh?.case_id ?? undefined,
      tt_khach_hang: bh?.ten_khach_hang ?? undefined,
      tt_mail_duyet: ttDuyet,
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
      ghi_chu: chuoi(b.ghi_chu, 500), loai: chuoi(b.loai_de_xuat, 60),
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
      ghi_chu: ghiChu === undefined ? ghiGoc || undefined : ghiChu ?? undefined, loai: d.loai_de_xuat ?? undefined, // giu loai cua don cu
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
    if (!laDonSuaChua(d.loai_de_xuat) || !d.nguoi_nhan_hang) return c.json({ error: "KHONG_PHAI_DON_SUA_CHUA" }, 409);
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

  // ---- TRỪ CÔNG NỢ SỬA CHỮA (2026-11-16, app Bao hanh doi tra v1.139) ----
  // Nguyen van: "Admin bảo hành sẽ xác nhận lk theo các trạng thái xác khác nhau => Hệ thống tự tạo đơn trừ công nợ sửa chữa trên app lk =>
  // Kế toán duyệt và trừ công nợ" + "Diễn giải MISA tương tự đơn phân loại: trừ công nợ".
  // POST /tru-cong-no {ddh_goc, loai: 'tru' | 'tra', so_luong, nguoi_thao_tac, ghi_chu?, lan?}: 1 lan cap (don CÔNG NỢ SỬA CHỮA da giao xong cho
  // NV) -> tao don "TRỪ CÔNG NỢ - SỬA CHỮA" (SL da dung, 0đ, tru cong no ky gui) hoac "TRẢ HÀNG CÔNG NỢ - SỬA CHỮA" (SL du tra kho) bang tai khoan NV.
  // Tong SL tru + tra (don chua huy) <= SL da nhan cua lan cap -> khong tru 2 lan. Chong tao trung: client_request_id "tc:<loai>:<goc>:<lan>".
  // nguon_tao = 'doitra', nguon_tao_id = "<loai>:<DDH goc>".
  r.post("/tru-cong-no", async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const goc = chuoi(b.ddh_goc, 40);
    const loai = b.loai === "tra" ? "tra" : b.loai === "tru" ? "tru" : null;
    const sl = Number(b.so_luong);
    if (!goc || !loai || !Number.isInteger(sl) || sl < 1) return c.json({ error: "INVALID_BODY" }, 400);
    const d = await c.env.DB.prepare(
      `SELECT id, loai_de_xuat, nguoi_nhan_hang, ma_lk, bh_don_vi_id, ma_yeu_cau_su_co, ma_lada, tt_khach_hang, chinh_sach,
         COALESCE(so_luong_thuc_xuat, so_luong_de_xuat) AS sl_nhan, trang_thai_hien_tai AS tt FROM dat_don_hang WHERE id = ?`,
    ).bind(goc).first<{ id: string; loai_de_xuat: string | null; nguoi_nhan_hang: string | null; ma_lk: string; bh_don_vi_id: string | null;
      ma_yeu_cau_su_co: string | null; ma_lada: string | null; tt_khach_hang: string | null; chinh_sach: string | null; sl_nhan: number; tt: string }>();
    if (!d) return c.json({ error: "NOT_FOUND" }, 404);
    if (!laCongNoSuaChua(d.loai_de_xuat) || !d.nguoi_nhan_hang) return c.json({ error: "KHONG_PHAI_DON_SUA_CHUA" }, 409);
    const trangThai = (await docDonSc(c.env.DB, "ddh.id = ?", [goc]))[0] as { buoc?: string; nhan?: string } | undefined;
    if (trangThai?.buoc !== "xong") return c.json({ error: "NV_CHUA_NHAN_HANG", nhan: trangThai?.nhan ?? null }, 409);
    const lan = Math.max(1, Number(b.lan) || 1);
    // Goi lai cung lan -> tra don da tao (khong tinh vao gioi han SL).
    const daCo = await c.env.DB.prepare("SELECT dd.id FROM dat_don_hang dd JOIN phieu_dat pd ON pd.id = dd.phieu_dat_id WHERE pd.client_request_id = ? LIMIT 1")
      .bind(`tc:${loai}:${goc}:${lan}`).first<{ id: string }>();
    if (daCo) return c.json({ ok: true, trung_lap: true, don: (await docDonSc(c.env.DB, "ddh.id = ?", [daCo.id], false))[0] });
    const daDung = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(COALESCE(so_luong_thuc_xuat, so_luong_de_xuat)), 0) AS n FROM dat_don_hang
       WHERE nguon_tao = 'doitra' AND nguon_tao_id IN (?, ?) AND trang_thai_hien_tai NOT IN ('Da huy', 'TN tu choi')`,
    ).bind(`tru:${goc}`, `tra:${goc}`).first<{ n: number }>();
    const conLai = d.sl_nhan - (daDung?.n ?? 0);
    if (sl > conLai) return c.json({ error: "VUOT_SL_NHAN", sl_nhan: d.sl_nhan, con_lai: Math.max(0, conLai) }, 409);
    const loi = await ganNv(c, d.nguoi_nhan_hang);
    if (loi) return loi;
    const nguoi = chuoi(b.nguoi_thao_tac, 200)?.toLowerCase() ?? d.nguoi_nhan_hang;
    const ten = await c.env.DB.prepare(
      `SELECT COALESCE((SELECT k.ten_hien_thi FROM ktv_lien_he k WHERE LOWER(k.email_dang_nhap) = LOWER(u.email) LIMIT 1), u.ten, u.email) AS ten
       FROM users u WHERE u.email = ?`,
    ).bind(d.nguoi_nhan_hang).first<{ ten: string }>();
    const tenNv = (ten?.ten ?? d.nguoi_nhan_hang).split(/\s[-–]\s/).pop()!.trim();
    const nhan = loai === "tru" ? "Trừ công nợ sửa chữa" : "Trả kho linh kiện dư sau sửa chữa";
    const res = await taoPhieuDat(
      c,
      {
        nguoi_nhan_hang: d.nguoi_nhan_hang,
        client_request_id: `tc:${loai}:${goc}:${lan}`,
        don_hang: [{
          ma_lk: d.ma_lk,
          loai_de_xuat: loai === "tru" ? LDX_TRU_CONG_NO_SUA_CHUA : LDX_TRA_HANG_SUA_CHUA,
          so_luong_de_xuat: sl,
          ghi_chu: [`[App Bảo hành đổi trả — ${nguoi} xác nhận] ${nhan} — lần cấp ${goc}${d.bh_don_vi_id ? ` · đơn BH ${d.bh_don_vi_id}` : ""}`, chuoi(b.ghi_chu, 400)]
            .filter(Boolean).join(" "),
          ma_yeu_cau_su_co: d.ma_yeu_cau_su_co ?? undefined,
          ma_lada: d.ma_lada ?? (d.ma_yeu_cau_su_co ? undefined : d.bh_don_vi_id ?? goc),
          chinh_sach: d.chinh_sach ?? "Trong CSBH",
          tt_khach_hang: d.tt_khach_hang ?? undefined,
          tt_mail_duyet: `${nhan} cho NV ${tenNv}`,
        }],
      },
      { tuSuaChua: true },
    );
    const j = (await res.clone().json().catch(() => ({}))) as { id?: string; error?: string };
    if (res.status >= 400 || !j.id) return res;
    await c.env.DB.prepare("UPDATE dat_don_hang SET nguon_tao = 'doitra', nguon_tao_id = ?, bh_don_vi_id = ? WHERE phieu_dat_id = ?")
      .bind(`${loai}:${goc}`, d.bh_don_vi_id, j.id).run();
    const don = await c.env.DB.prepare("SELECT id, trang_thai_hien_tai AS tt, version, ma_xuat_kho FROM dat_don_hang WHERE phieu_dat_id = ? ORDER BY id LIMIT 1")
      .bind(j.id).first<{ id: string; tt: string; version: number; ma_xuat_kho: string | null }>();
    if (don) {
      const ghiPhieu = `Tự động từ app Bảo hành đổi trả (${nguoi} xác nhận tiêu hao) — ${nhan}, gửi thẳng Kế toán, không qua Tác nghiệp`;
      if (loai === "tra" && don.tt !== "TN da duyet" && don.tt !== "Da huy") {
        // Tra hang sua chua: bo cac buoc KT duyet mem / Kho / QC / TN cua luong tra hang cong no - linh kien du Admin BH da nhan lai.
        const cas = await c.env.DB.prepare("UPDATE dat_don_hang SET trang_thai_hien_tai = 'TN da duyet', version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
          .bind(nowVN(), don.id, don.version).run();
        if (cas.meta.changes) {
          await c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'TN da duyet', ?, ?, ?)")
            .bind(don.id, d.nguoi_nhan_hang, nowVN(), `Tự động — ${nhan}: Admin BH (${nguoi}) đã nhận lại linh kiện dư, không qua luồng trả hàng công nợ`).run();
          if (!don.ma_xuat_kho) await bundleAutoApprovedIntoPxk(c.env, c.env.DB, d.nguoi_nhan_hang, d.nguoi_nhan_hang, "tra_hang", [{ donHangId: don.id, soTien: 0 }]);
        }
      }
      await dayPhieuSuaChuaSangKeToan(c.env.DB, don.id, d.nguoi_nhan_hang, ghiPhieu);
    }
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
    return c.json({ ok: true, don: don ? (await docDonSc(c.env.DB, "ddh.id = ?", [don.id], false))[0] : null }, 201);
  });

  // POST /don-sc/:id/da-nhan {nguoi_thao_tac, tu_dong?}: NV sua chua xac nhan da nhan linh kien (2026-11-16, v1.507 - "YC phải xác nhận đã
  // nhận mới cho đóng đơn sửa chữa"). Phieu xuat chua don "Dang gui KTV" -> "KTV da nhan" (CAS + log, giong POST /phieu-xuat-kho/:id/log).
  // Ca phieu duoc xac nhan (1 phieu co the gom nhieu lan cap cua cung NV). Da qua buoc nay -> ok (da_nhan_truoc). Chua gui -> 409 CHUA_GUI_HANG.
  r.post("/don-sc/:id/da-nhan", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const d = await c.env.DB.prepare("SELECT id, loai_de_xuat, nguoi_nhan_hang FROM dat_don_hang WHERE id = ?").bind(id)
      .first<{ id: string; loai_de_xuat: string | null; nguoi_nhan_hang: string | null }>();
    if (!d) return c.json({ error: "NOT_FOUND" }, 404);
    if (!laDonSuaChua(d.loai_de_xuat) || !d.nguoi_nhan_hang) return c.json({ error: "KHONG_PHAI_DON_SUA_CHUA" }, 409);
    const tt = (await docDonSc(c.env.DB, "ddh.id = ?", [id]))[0] as { buoc?: string; nhan?: string; pxk_id?: string | null } | undefined;
    if (tt?.buoc === "xong") return c.json({ ok: true, da_nhan_truoc: true, don: tt });
    if (tt?.buoc === "dong") return c.json({ error: "DON_DA_DONG", nhan: tt.nhan }, 409);
    const p = tt?.pxk_id
      ? await c.env.DB.prepare("SELECT id, version, trang_thai_hien_tai AS tt FROM phieu_xuat_kho WHERE id = ?").bind(tt.pxk_id).first<{ id: string; version: number; tt: string | null }>()
      : null;
    if (!p || p.tt !== "Dang gui KTV") return c.json({ error: "CHUA_GUI_HANG", nhan: tt?.nhan ?? null }, 409);
    const moBaoThieu = await c.env.DB.prepare("SELECT id FROM nhan_thieu WHERE phieu_xuat_kho_id = ? AND trang_thai = 'Cho kho kiem tra' LIMIT 1").bind(p.id).first<{ id: string }>();
    if (moBaoThieu) return c.json({ error: "DANG_BAO_NHAN_THIEU", message: `Phiếu ${p.id} đang có báo nhận thiếu ${moBaoThieu.id} chờ Kho kiểm tra.` }, 409);
    const cas = await c.env.DB.prepare("UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'KTV da nhan', version = version + 1 WHERE id = ? AND version = ?")
      .bind(p.id, p.version).run();
    if (!cas.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);
    const nguoi = chuoi(b.nguoi_thao_tac, 200)?.toLowerCase() ?? d.nguoi_nhan_hang;
    const tuDong = b.tu_dong === true;
    await c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'KTV da nhan', ?, ?, ?)")
      .bind(p.id, d.nguoi_nhan_hang, nowVN(), tuDong
        ? `[App Bảo hành đổi trả — ${nguoi}] Tự động xác nhận đã nhận đủ khi đóng đơn sửa chữa (NV chưa bấm "Đã nhận")`
        : `[App Bảo hành đổi trả — ${nguoi}] Xác nhận đã nhận linh kiện`).run();
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
    return c.json({ ok: true, pxk_id: p.id, don: (await docDonSc(c.env.DB, "ddh.id = ?", [id]))[0] });
  });

  // POST /tru-cong-no/:id/huy {nguoi_thao_tac, ly_do} | {kiem_tra: true} (2026-11-16, v1.508 - app doi tra v1.142). Nguyen van: "Sau khi admin bh
  // xác nhận trừ xác => tạo tự động đơn trừ xác trên app linh kiện (có thể thay đổi trạng thái, hủy bỏ, chỉnh sửa trước khi kế toán duyệt chốt trừ
  // công nợ)". Chot: Admin BH sua / huy xac nhan tieu hao ben app doi tra -> don TRỪ / TRẢ HÀNG CÔNG NỢ - SỬA CHỮA o day huy theo (sua = huy + tao
  // lan gui moi). CHI khi Ke toan chua chot: don chua vao phieu, hoac phieu con "Dang tao phieu" / "Cho ke toan". Go don khoi phieu (phieu 1 don tu
  // huy) roi don -> "Da huy" (log). kiem_tra = chi tra { huy_duoc, ly_do } (app doi tra kiem tra ca 2 don truoc khi huy).
  r.post("/tru-cong-no/:id/huy", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const d = await c.env.DB.prepare(
      "SELECT id, loai_de_xuat, loai_don, nguoi_nhan_hang, nguon_tao, trang_thai_hien_tai AS tt, version FROM dat_don_hang WHERE id = ?",
    ).bind(id).first<{ id: string; loai_de_xuat: string | null; loai_don: string; nguoi_nhan_hang: string | null; nguon_tao: string | null; tt: string; version: number }>();
    if (!d) return c.json({ error: "NOT_FOUND" }, 404);
    if (!(laTruCongNoSuaChua(d.loai_de_xuat) || laTraHangSuaChua(d.loai_de_xuat)) || d.nguon_tao !== "doitra" || !d.nguoi_nhan_hang) {
      return c.json({ error: "KHONG_PHAI_DON_TRU_SUA_CHUA" }, 409);
    }
    const daDong = ["Da huy", "TN tu choi", "Tu choi"].includes(d.tt);
    const p = await c.env.DB.prepare(
      `SELECT p.id, p.trang_thai_hien_tai AS tt FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho p ON p.id = pd.phieu_xuat_kho_id
       WHERE pd.dat_don_hang_id = ? AND p.trang_thai_hien_tai <> 'Ke toan huy' ORDER BY pd.rowid DESC LIMIT 1`,
    ).bind(id).first<{ id: string; tt: string | null }>();
    const daChot = !!p && !["Dang tao phieu", "Cho ke toan"].includes(p.tt ?? "Dang tao phieu");
    if (b.kiem_tra === true) {
      return c.json({ huy_duoc: daDong || !daChot, da_huy: daDong, ly_do: daChot ? `Kế toán đã chốt phiếu ${p!.id} — không sửa / hủy được nữa` : null });
    }
    if (daDong) return c.json({ ok: true, da_huy_truoc: true });
    if (daChot) return c.json({ error: "KE_TOAN_DA_CHOT", message: `Kế toán đã chốt phiếu ${p!.id} — không sửa / hủy được nữa` }, 409);
    const nguoi = chuoi(b.nguoi_thao_tac, 200)?.toLowerCase() ?? d.nguoi_nhan_hang;
    const lyDo = chuoi(b.ly_do, 500) ?? "Hủy theo app Bảo hành đổi trả";
    const ghi = `[App Bảo hành đổi trả — ${nguoi}] ${lyDo}`;
    if (p) await goDonKhoiPxk(c.env.DB, p.id, id, d.nguoi_nhan_hang, "Hủy đơn trừ / trả công nợ sửa chữa", ghi, true, false);
    const now = nowVN();
    const cas = await c.env.DB.prepare("UPDATE dat_don_hang SET trang_thai_hien_tai = 'Da huy', version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .bind(now, id, d.version).run();
    if (!cas.meta.changes) {
      // Don vua bi doi o noi khac (CAS truot): doc lai roi CAS lan nua.
      const v = await c.env.DB.prepare("SELECT version, trang_thai_hien_tai AS tt FROM dat_don_hang WHERE id = ?").bind(id).first<{ version: number; tt: string }>();
      if (!v || v.tt === "Da huy") return c.json({ ok: true, da_huy_truoc: true });
      const cas2 = await c.env.DB.prepare("UPDATE dat_don_hang SET trang_thai_hien_tai = 'Da huy', version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(now, id, v.version).run();
      if (!cas2.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);
    }
    await c.env.DB.prepare(
      d.loai_don === "tra_hang"
        ? "INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Da huy', ?, ?, ?)"
        : "INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Da huy', ?, ?, ?)",
    ).bind(id, d.nguoi_nhan_hang, now, ghi).run();
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
    return c.json({ ok: true, pxk_id: p?.id ?? null });
  });

  // GET /tru-cong-no?ids=DDH-..,..  trang thai cac don tru cong no / tra hang sua chua (cung bo nhan / buoc voi /don-sc).
  r.get("/tru-cong-no", async (c) => {
    const ids = (c.req.query("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 500);
    if (!ids.length) return c.json({ rows: [] });
    return c.json({ rows: await docDonSc(c.env.DB, "ddh.id IN (SELECT value FROM json_each(?))", [JSON.stringify(ids)], false) });
  });
}
