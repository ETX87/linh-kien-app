import { chuanNhomLk } from "../lib/nhomLk";
import { Hono } from "hono";
import { nhanAnhTaiLen, taiAnhTuUrl, laUrlAnhDrive, laUrlHttp } from "../lib/anhUpload";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { requireQuanLyDanhMucLk } from "../middleware/requireQuanLyDanhMucLk";
import { encryptSecret } from "../lib/secretBox";
import { computeAndStoreHash, getOrComputeHash } from "../lib/contentHash";
import { nowVN } from "../lib/vnTime";
import { resyncKhuVucDerivedFieldsForAll } from "../lib/khuVucSync";
import { generateApiKey, hashApiKey } from "../lib/partnerApiAuth";
import { timLoaiChietKhauTheoTen, gonTenLoaiChietKhau } from "../lib/loaiChietKhau";
import { TT_MA, docLk, logLk, demDonDungLk, chuyenMaLk, tinhLaiTienTheoLk } from "../lib/linhKienXetDuyet";
import { bumpVersions } from "../lib/dataVersions";
import { dsAnhLk, cotAnhLk, SO_ANH_LK_TOI_DA } from "../lib/anhLinhKien";
import { createMiddleware } from "hono/factory";
import { docLienQuanLk } from "../lib/linhKienLienQuan";
import { scopeDatMuaNguoiTao, scopeKtvTonKho } from "../lib/scopeDatMua";

// Port rut gon tu backend/src/routes/settings.ts cua he DVBH goc - CHI giu 4 khoi thuc su can cho
// mien nghiep vu "Dat mua linh kien" (xem CLAUDE.md muc "Nguon goc tach he thong"): danh muc linh
// kien (bang linh_kien - o he nay KHONG con chung voi module "giai trinh", la ban sao doc lap), Google
// Drive OAuth (uy quyen 1 tai khoan that de upload anh minh hoa linh kien), Ly do cham, Loai de xuat.
// Danh sach KTV (ktv_lien_he) nam o file rieng settingsKtv.ts. BO so voi he goc: settings_audit_log
// (khong can audit trail cho 1 he nho), "/linh-kien/sync-sheet" (khong co Google Sheet nguon o he
// nay - danh muc quan ly thang qua form + upload anh).

import { laKtvThuan } from "../lib/laKtvThuan";
const settingsDatMua = new Hono<{ Bindings: Env }>();
settingsDatMua.use("*", verifySessionMiddleware, loadUser);
const adminOnly = requireRole("Admin");
const linhKienWriteRoles = requireQuanLyDanhMucLk;
// "Mua hang" (2026-09-30, migration 0053): xet duyet ma LK moi + sua thong tin LK (khong tao/import LK moi).
const laMuaHangHoacAdmin = (u: { la_mua_hang: boolean; vai_tro: string | null }) => u.la_mua_hang || u.vai_tro === "Admin";
const muaHangRoles = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (!laMuaHangHoacAdmin(c.get("user"))) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});
// Xac nhan / gop / tu choi MA LK cho xet duyet: Mua hang + Admin + KHO (chot 2026-10-16 - Kho xac nhan ma LK cua don cho hang tu man
// Thieu hang). Gia tam van chi Mua hang/Admin (muaHangRoles).
const xetDuyetMaRoles = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const u = c.get("user");
  if (!laMuaHangHoacAdmin(u) && !u.la_kho) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});
// Sua thong tin LK (PATCH/anh) = Quan ly danh muc LK HOAC Mua hang.
const suaLinhKienRoles = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const u = c.get("user");
  if (!u.quan_ly_danh_muc_lk && !laMuaHangHoacAdmin(u)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});

async function refreshHash(db: D1Database, tenBang: string, table: string, orderBy: string) {
  const { results } = await db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
  await computeAndStoreHash(db, tenBang, results);
}

// ---------- Linh kien (danh muc rieng cua he nay) ----------

settingsDatMua.get("/linh-kien", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM linh_kien ORDER BY ma_linh_kien").all<Record<string, unknown>>();
  // KTV / Ve tinh chi xem Gia NY + Gia KTV (chot 2026-10-11) - bo gia noi bo khoi DU LIEU tra ve, khong chi an tren giao dien
  // (ra soat bao mat 2026-11-09). Version hash (/linh-kien/version) khong doi -> cache tren may van dung.
  if (laKtvThuan(c.get("user"))) {
    return c.json({ rows: results.map(({ gia_du_phong: _a, gia_eu: _b, cho_phep_gia_0_nguoi: _c, ...r }) => r) });
  }
  return c.json({ rows: results });
});

settingsDatMua.get("/linh-kien/version", async (c) => {
  const hash = await getOrComputeHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  // KTV nhan ban da bo cot gia noi bo -> hash rieng, cache tren may dung chung (KTV + van phong 1 may) khong lan 2 ban.
  return c.json({ hash: laKtvThuan(c.get("user")) ? `${hash}-ktv` : hash });
});

// POST /linh-kien - CHI dung de tao MA HOAN TOAN MOI (chua tung xuat hien tren gia88) - Admin/quan ly
// danh muc van duoc tu dien gia_ban tam thoi cho ma moi nay; 1 khi gia88 biet den ma nay (dem sau),
// gia_ban se chuyen sang do gia88Sync.ts quan ly, sua tay qua PATCH /linh-kien/:ma se KHONG con tac
// dung (xem comment PATCH ben duoi - "chi xem", CHOT nguoi dung 2026-09-12).
settingsDatMua.post("/linh-kien", linhKienWriteRoles, async (c) => {
  const body = await c.req.json<{
    ma_linh_kien: string; ten_linh_kien: string; gia_ban?: number;
    don_vi?: string; ghi_chu?: string; anh_demo?: string; dac_thu?: boolean; chi_sua_chua?: boolean;
    // "Phân loại đặc thù" (them 2026-08-25) - listdown tu do (dung y het "don_vi"), chi co y nghia khi
    // dac_thu=true, frontend tu an o nhap khi chua tick dac_thu.
    phan_loai_dac_thu?: string;
    nhom_lk?: string; // "karofi" | "b2b" - BAT BUOC (2026-10-16, migration 0088)
  }>();
  if (body.anh_demo?.trim() && !laUrlHttp(body.anh_demo.trim())) return c.json({ error: "INVALID_URL" }, 400);
  if (!body.ma_linh_kien?.trim() || !body.ten_linh_kien?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  // Phan loai BAT BUOC (chot 2026-09-30 - "Máy" quyet dinh kho xuat trong file MISA).
  if (!body.don_vi?.trim()) return c.json({ error: "THIEU_PHAN_LOAI" }, 400);
  // Nhom LK Karofi / B2B BAT BUOC (2026-10-16) - Kho xu ly thieu hang theo nhom nay (lib/nhomLk.ts).
  const nhomLk = chuanNhomLk(body.nhom_lk);
  if (!nhomLk) return c.json({ error: "THIEU_NHOM_LK" }, 400);
  // Ma da co (ke ca ma da doi/gop sang ma khac - dong chuyen huong) -> bao ro thay vi loi ghi DB chung chung.
  const trung = await docLk(c.env.DB, body.ma_linh_kien.trim());
  if (trung) return c.json({ error: "MA_DA_TON_TAI", ma_linh_kien: trung.ma_linh_kien, ten_linh_kien: trung.ten_linh_kien, trang_thai_ma: trung.trang_thai_ma, ma_chuan: trung.ma_chuan }, 409);

  const user = c.get("user");
  // LK tao trong app vao "Cho xet duyet" (DEFAULT cot trang_thai_ma, migration 0053) - Mua hang xac nhan ma chuan.
  const row = await c.env.DB.prepare(
    `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, don_vi, ghi_chu, anh_demo, dac_thu, chi_sua_chua, phan_loai_dac_thu, nhom_lk, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      body.ma_linh_kien.trim(), body.ten_linh_kien.trim(), body.gia_ban ?? null,
      body.don_vi?.trim() || null, body.ghi_chu?.trim() || null, body.anh_demo?.trim() || null,
      body.dac_thu ? 1 : 0, body.chi_sua_chua ? 1 : 0, body.dac_thu ? body.phan_loai_dac_thu?.trim() || null : null,
      nhomLk, user.email, nowVN(),
    )
    .first();
  await logLk(c.env.DB, { ma: body.ma_linh_kien.trim(), hanhDong: "Tao moi", tenMoi: body.ten_linh_kien.trim(), nguoi: user.email }).run();

  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json(row, 201);
});

// PATCH /linh-kien/:ma - CHOT nguoi dung 2026-09-12 (tich hop gia88 lam nguon chinh danh muc): cac
// cot do gia88Sync.ts quan ly (ten_linh_kien, gia_ban, gia_tri_cong_no, gia_du_phong, gia_eu,
// don_vi_nhap, nhan_hang, thiet_bi, don_vi_tinh, ghi_chu_doi_tac, cam_ban) chuyen "chi xem" - route
// nay KHONG con nhan cac truong do trong body nua (frontend an luon input, o day chan them 1 lop -
// gui len cung khong co tac dung, PATCH khac se ghi de dung gia tri that vao dem tiep theo). Cac cot
// KHONG dong bo (bat_tat, don_vi, ghi_chu, anh_demo, dac_thu, chi_sua_chua, phan_loai_dac_thu) van sua
// tay binh thuong.
settingsDatMua.patch("/linh-kien/:ma", suaLinhKienRoles, async (c) => {
  const ma = c.req.param("ma");
  if (!ma) return c.json({ error: "INVALID_PARAM" }, 400);
  const body = await c.req.json<{
    bat_tat?: boolean; don_vi?: string; ghi_chu?: string;
    anh_demo?: string; dac_thu?: boolean; chi_sua_chua?: boolean; phan_loai_dac_thu?: string;
    nhom_lk?: string; // "karofi" | "b2b" (2026-10-16) - khong xoa duoc
  }>();
  if (body.nhom_lk !== undefined && !chuanNhomLk(body.nhom_lk)) return c.json({ error: "NHOM_LK_KHONG_HOP_LE" }, 400);
  if (body.anh_demo?.trim() && !laUrlHttp(body.anh_demo.trim())) return c.json({ error: "INVALID_URL" }, 400);
  const existing = await c.env.DB.prepare("SELECT * FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const user = c.get("user");
  const dacThuNext = body.dac_thu !== undefined ? (body.dac_thu ? 1 : 0) : existing.dac_thu;
  const next = {
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    // Phan loai bat buoc (2026-09-30): khong cho XOA phan loai da co (LK gia88 chua phan loai van sua truong khac duoc).
    don_vi: body.don_vi?.trim() ? body.don_vi.trim() : existing.don_vi,
    ghi_chu: body.ghi_chu !== undefined ? body.ghi_chu?.trim() || null : existing.ghi_chu,
    anh_demo: body.anh_demo !== undefined ? body.anh_demo?.trim() || null : existing.anh_demo,
    dac_thu: dacThuNext,
    chi_sua_chua: body.chi_sua_chua !== undefined ? (body.chi_sua_chua ? 1 : 0) : existing.chi_sua_chua,
    // "Phân loại đặc thù" chi giu gia tri khi dac_thu (sau khi ap gia tri moi) van true - bo tick
    // "Linh kien dac thu" thi xoa luon phan loai di kem, tranh du lieu "mo côi" khong con y nghia.
    phan_loai_dac_thu: !dacThuNext ? null : body.phan_loai_dac_thu !== undefined ? body.phan_loai_dac_thu?.trim() || null : existing.phan_loai_dac_thu,
    nhom_lk: chuanNhomLk(body.nhom_lk) ?? existing.nhom_lk,
  };
  await c.env.DB.prepare(
    "UPDATE linh_kien SET bat_tat = ?, don_vi = ?, ghi_chu = ?, anh_demo = ?, dac_thu = ?, chi_sua_chua = ?, phan_loai_dac_thu = ?, nhom_lk = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?",
  )
    .bind(next.bat_tat, next.don_vi, next.ghi_chu, next.anh_demo, next.dac_thu, next.chi_sua_chua, next.phan_loai_dac_thu, next.nhom_lk, user.email, nowVN(), ma)
    .run();

  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ ok: true });
});

// PATCH /linh-kien/:ma/dac-thu - { dac_thu: boolean } (2026-10-02, "bổ sung chức năng tắt bật linh kiện đặc thù trong Bảng giá
// cho TN và kế toán") - cong tac nhanh o cot "Đặc thù" cua Bang gia. Mo cho TN/Ke toan ngoai nhom sua LK (suaLinhKienRoles).
// Tat -> xoa "Phân loại đặc thù" (cung quy tac PATCH /linh-kien/:ma). Don da tao doc dac_thu song qua JOIN (tru don TN chon tay
// dat_don_hang.dac_thu_thu_cong) nen doi o day = doi luon don dang mo.
settingsDatMua.patch("/linh-kien/:ma/dac-thu", async (c) => {
  const u = c.get("user");
  if (!u.quan_ly_danh_muc_lk && !laMuaHangHoacAdmin(u) && !u.la_tac_nghiep && !u.la_ke_toan) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const ma = c.req.param("ma");
  const body = await c.req.json<{ dac_thu?: boolean }>();
  if (typeof body.dac_thu !== "boolean") return c.json({ error: "INVALID_BODY" }, 400);
  const r = await c.env.DB.prepare(
    `UPDATE linh_kien SET dac_thu = ?, phan_loai_dac_thu = CASE WHEN ? = 1 THEN phan_loai_dac_thu ELSE NULL END, nguoi_cap_nhat = ?, ngay_cap_nhat = ?
     WHERE ma_linh_kien = ?`,
  )
    .bind(body.dac_thu ? 1 : 0, body.dac_thu ? 1 : 0, u.email, nowVN(), ma)
    .run();
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// PATCH /linh-kien/:ma/gia-0 - { cho_phep_gia_0: boolean } (tu dong duyet 100%, chot 2026-10-14, migration 0080): LK duoc phep dat
// don phat sinh tien (MUA / TRỪ CÔNG NỢ) khi gia ban 0 / chua co gia - mac dinh CHAN (lib/tuDongDuyet.ts GIA_0_KHONG_DAT_DUOC).
// Cung nhom quyen nut "Đặc thù". KHONG cham ngay_cap_nhat (cot noi bo, khong day DVBH/Sua chua) - van refreshHash cho cache FE.
settingsDatMua.patch("/linh-kien/:ma/gia-0", async (c) => {
  const u = c.get("user");
  if (!u.quan_ly_danh_muc_lk && !laMuaHangHoacAdmin(u) && !u.la_tac_nghiep && !u.la_ke_toan) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const ma = c.req.param("ma");
  const body = await c.req.json<{ cho_phep_gia_0?: boolean }>();
  if (typeof body.cho_phep_gia_0 !== "boolean") return c.json({ error: "INVALID_BODY" }, 400);
  const r = await c.env.DB.prepare("UPDATE linh_kien SET cho_phep_gia_0 = ?, cho_phep_gia_0_nguoi = ?, cho_phep_gia_0_luc = ? WHERE ma_linh_kien = ?")
    .bind(body.cho_phep_gia_0 ? 1 : 0, u.email, nowVN(), ma)
    .run();
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ ok: true });
});

// PATCH /linh-kien/:ma/gia-tri-cong-no - { gia_tri_cong_no: number|null } - route RIENG (khong dung
// chung PATCH /linh-kien/:ma o tren) vi truong nay CO CHU DICH KHONG dong cham ngay_cap_nhat/
// nguoi_cap_nhat - theo yeu cau nguoi dung "cột này nội bộ app linh kiện, khi chỉnh sửa thay đổi
// không cần báo API cho các hệ thống liên kết" (dvbhSyncClient.ts coi ngay_cap_nhat > con tro la "co
// thay doi can day sang DVBH/suachua" - sua truong nay KHONG duoc lam dong linh_kien do bi coi la
// "thay doi" o lan dong bo ke tiep). VAN goi refreshHash() - do la content-hash CUC BO cua chinh app
// nay (xem lib/contentHash.ts, dung boi fetchWithHashCache o frontend de biet luc nao can tai lai
// danh muc) - KHAC HOAN TOAN voi ngay_cap_nhat/dvbh sync, bo qua se lam frontend ket qua cu vinh
// vien (IndexedDB cache khong bao gio thay doi vi hash server khong doi).
settingsDatMua.patch("/linh-kien/:ma/gia-tri-cong-no", linhKienWriteRoles, async (c) => {
  const ma = c.req.param("ma");
  if (!ma) return c.json({ error: "INVALID_PARAM" }, 400);
  const body = await c.req.json<{ gia_tri_cong_no: number | null }>();
  const result = await c.env.DB.prepare("UPDATE linh_kien SET gia_tri_cong_no = ? WHERE ma_linh_kien = ?")
    .bind(body.gia_tri_cong_no ?? null, ma)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND" }, 404);
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ ok: true });
});

// ---------- Xet duyet ma LK moi (2026-09-30, migration 0053 - lib/linhKienXetDuyet.ts) ----------

// GET /linh-kien/:ma/xet-duyet - lich su xet duyet (log cua chinh ma + log cac ma da doi/gop VAO ma nay) + so don dang
// dung ma. Mo cho moi nguoi xem duoc Bang gia (chi doc).
// GET /linh-kien/:ma/lien-quan (2026-10-16, "xem được các thông tin liên quan đến linh kiện ... lịch sử đặt hàng, tồn kho ở các kho") - du
// lieu cho drawer xem LK o Bang gia: ton kho cong ty tung kho (file MISA, ai cung xem), ton kho + cong no tung KTV (pham vi man Cong
// no - scopeKtvTonKho: KTV chi thay cua minh), don dat gan nhat + thong ke 30/90 ngay + ticket thieu hang dang mo (pham vi danh sach don -
// scopeDatMuaNguoiTao), nhom thay the + combo. Truy van ton kho/thay the/combo dung chung API doi tac (lib/linhKienLienQuan.ts).
settingsDatMua.get("/linh-kien/:ma/lien-quan", async (c) => {
  const ma = c.req.param("ma");
  const db = c.env.DB;
  const lk = await db.prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
  if (!lk) return c.json({ error: "NOT_FOUND" }, 404);
  const scopeDon = scopeDatMuaNguoiTao(c);
  const sDon = scopeDon?.whereSql ?? "";
  const bDon = scopeDon?.binds ?? [];
  const TT_LOAI = "('TN tu choi', 'Da huy')";
  const [lq, don, thongKe, thieuLk] = await Promise.all([
    docLienQuanLk(db, JSON.stringify([ma]), scopeKtvTonKho(c)),
    db.prepare(
      `SELECT ddh.id, ddh.ngay_tao, ddh.loai_de_xuat, ddh.trang_thai_hien_tai, COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) AS so_luong,
              ddh.nguoi_nhan_hang, ddh.nguoi_tao, COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) AS khu_vuc_ma,
              (SELECT pxk.id FROM phieu_xuat_kho_dong d JOIN phieu_xuat_kho pxk ON pxk.id = d.phieu_xuat_kho_id
               WHERE d.dat_don_hang_id = ddh.id AND pxk.trang_thai_hien_tai <> 'Ke toan huy' ORDER BY pxk.id DESC LIMIT 1) AS pxk_id
       FROM dat_don_hang ddh WHERE ddh.ma_lk = ? ${sDon} ORDER BY ddh.ngay_tao DESC, ddh.id DESC LIMIT 30`,
    ).bind(ma, ...bDon).all(),
    db.prepare(
      `SELECT
         SUM(CASE WHEN ddh.ngay_tao >= datetime('now', '+7 hours', '-30 days') THEN 1 ELSE 0 END) AS don_30,
         SUM(CASE WHEN ddh.ngay_tao >= datetime('now', '+7 hours', '-30 days') THEN COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) ELSE 0 END) AS sl_30,
         SUM(CASE WHEN ddh.ngay_tao >= datetime('now', '+7 hours', '-90 days') THEN 1 ELSE 0 END) AS don_90,
         SUM(CASE WHEN ddh.ngay_tao >= datetime('now', '+7 hours', '-90 days') THEN COALESCE(ddh.so_luong_thuc_xuat, ddh.so_luong_de_xuat) ELSE 0 END) AS sl_90,
         SUM(CASE WHEN ddh.trang_thai_hien_tai = 'Cho hang' THEN 1 ELSE 0 END) AS dang_cho_hang,
         COUNT(*) AS tong_don, MAX(ddh.ngay_tao) AS lan_cuoi
       FROM dat_don_hang ddh WHERE ddh.ma_lk = ? AND ddh.trang_thai_hien_tai NOT IN ${TT_LOAI} ${sDon}`,
    ).bind(ma, ...bDon).first(),
    db.prepare(
      `SELECT tlk.id, tlk.dat_don_hang_id, tlk.ngay_tao, tlk.ngay_du_kien_co_hang, ddh.nguoi_nhan_hang,
              (SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = tlk.id ORDER BY l.id DESC LIMIT 1) AS trang_thai
       FROM thieu_lk tlk JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id
       WHERE ddh.ma_lk = ? ${sDon}
         AND COALESCE((SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = tlk.id ORDER BY l.id DESC LIMIT 1), '') NOT IN ('Da huy bo', 'Da ket thuc')
       ORDER BY tlk.ngay_tao DESC LIMIT 20`,
    ).bind(ma, ...bDon).all(),
  ]);
  const so = (v: number | null | undefined) => Number(v ?? 0);
  const nhomTt = new Map<number, { nhom_id: number; ten_nhom: string; linh_kien: { ma_linh_kien: string; ten_linh_kien: string | null; bat_tat: number | null }[] }>();
  for (const r of lq.thayThe) {
    const g = nhomTt.get(r.nhom_id) ?? { nhom_id: r.nhom_id, ten_nhom: r.ten_nhom, linh_kien: [] };
    g.linh_kien.push({ ma_linh_kien: r.ma_thay_the, ten_linh_kien: r.ten_thay_the, bat_tat: r.bat_tat });
    nhomTt.set(r.nhom_id, g);
  }
  return c.json({
    phien_ban_ton_kho: lq.phienBanTonKho,
    ton_kho_cong_ty: lq.tonKho.map((r) => ({ ma_kho: r.ma_kho, ten_kho: r.ten_kho, sl_ton: so(r.cuoi_ky) })),
    ton_kho_ktv: lq.tonKtv
      .filter((r) => so(r.cuoi_ky) !== 0)
      .map((r) => ({ ma_kho: r.ma_kho, ma_ktv: r.ma_ktv, ten_ktv: r.ten_ktv, khu_vuc_ma: r.khu_vuc_ma, sl_ton: so(r.cuoi_ky), sl_ho_tro_0d: so(r.sl_ho_tro_0d), cong_no: so(r.cong_no) }))
      .sort((a, b) => b.sl_ton - a.sl_ton),
    thong_ke_dat_hang: thongKe,
    don_hang: don.results,
    thieu_lk_mo: thieuLk.results,
    thay_the: [...nhomTt.values()],
    combo: lq.combo.map(({ ma: _ma, thanh_phan, ...cb }) => ({ ...cb, thanh_phan: JSON.parse(thanh_phan) as { ma_linh_kien: string; so_luong: number }[] })),
  });
});

settingsDatMua.get("/linh-kien/:ma/xet-duyet", async (c) => {
  const ma = c.req.param("ma");
  const [{ results: log }, soDon] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM linh_kien_log WHERE ma_linh_kien = ? OR ma_linh_kien IN (SELECT ma_linh_kien FROM linh_kien WHERE ma_chuan = ?)
       ORDER BY id DESC LIMIT 100`,
    ).bind(ma, ma).all(),
    demDonDungLk(c.env.DB, ma),
  ]);
  return c.json({ log, so_don: soDon.tong, so_don_con_hieu_luc: soDon.con_hieu_luc });
});

// POST /linh-kien/:ma/xac-nhan - { ma_moi?, ten_moi? } - Mua hang xac nhan ma chuan cho LK "Cho xet duyet". ma_moi
// trong/giong ma cu = giu ma (chi sua ten neu co); ma_moi khac = doi ma A -> B (B CHUA duoc ton tai - co roi thi 409
// MA_DA_TON_TAI, FE goi y "Gop vao ma nay" qua /gop).
settingsDatMua.post("/linh-kien/:ma/xac-nhan", xetDuyetMaRoles, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ ma_moi?: string; ten_moi?: string; phan_loai?: string }>();
  const user = c.get("user");
  const lk = await docLk(c.env.DB, ma);
  if (!lk) return c.json({ error: "NOT_FOUND" }, 404);
  if (lk.trang_thai_ma !== TT_MA.CHO) return c.json({ error: "KHONG_CON_CHO_DUYET", trang_thai_ma: lk.trang_thai_ma }, 409);
  // Phan loai BAT BUOC khi xac nhan (chot 2026-09-30): gui kem phan_loai (doi) hoac LK phai co san.
  const phanLoai = body.phan_loai?.trim() || lk.don_vi?.trim() || "";
  if (!phanLoai) return c.json({ error: "THIEU_PHAN_LOAI" }, 400);
  const maMoi = body.ma_moi?.trim() || ma;
  const tenMoi = body.ten_moi?.trim() || lk.ten_linh_kien;
  if (/\s/.test(maMoi)) return c.json({ error: "MA_KHONG_HOP_LE" }, 400);
  const soDon = (await demDonDungLk(c.env.DB, ma)).tong;

  if (maMoi === ma) {
    const now = nowVN();
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE linh_kien SET ten_linh_kien = ?, don_vi = ?, trang_thai_ma = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?")
        .bind(tenMoi, phanLoai, TT_MA.DA_XAC_NHAN, user.email, now, ma),
      ...(tenMoi !== lk.ten_linh_kien ? [c.env.DB.prepare("UPDATE dat_don_hang SET ten_lk_snapshot = ? WHERE ma_lk = ?").bind(tenMoi, ma)] : []),
      logLk(c.env.DB, { ma, hanhDong: "Xac nhan", tenCu: lk.ten_linh_kien, tenMoi: tenMoi !== lk.ten_linh_kien ? tenMoi : null, soDon, nguoi: user.email }),
    ]);
  } else {
    const trung = await docLk(c.env.DB, maMoi);
    if (trung) return c.json({ error: "MA_DA_TON_TAI", ma_linh_kien: trung.ma_linh_kien, ten_linh_kien: trung.ten_linh_kien, trang_thai_ma: trung.trang_thai_ma, ma_chuan: trung.ma_chuan }, 409);
    await chuyenMaLk(c.env.DB, { maNguon: ma, maDich: maMoi, tenNguon: lk.ten_linh_kien, taoMoi: { ten: tenMoi }, hanhDong: "Doi ma", soDon, nguoi: user.email });
    await c.env.DB.prepare("UPDATE linh_kien SET don_vi = ? WHERE ma_linh_kien = ?").bind(phanLoai, maMoi).run();
  }
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  if (soDon) c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, ma_linh_kien: maMoi, so_don: soDon });
});

// POST /linh-kien/:ma/cap-nhat-cho-duyet - { ma_moi?, ten_moi? } (2026-10-16, "linh kiện chưa xác nhận, vẫn cho phép nhân viên mua hàng cập
// nhật lại tên và mã hàng chuẩn"): sua ten va/hoac doi ma A -> B cho LK "Cho xet duyet" NHUNG VAN GIU "Cho xet duyet" (khac /xac-nhan: chot ma
// luon). Doi ma = cung co che /xac-nhan (chuyenMaLk: A thanh dong chuyen huong, don/BOM/nhom thay the/combo sang B) - B chua duoc ton tai. Khong
// bat buoc Phan loai (chua xac nhan). Log "Cap nhat".
settingsDatMua.post("/linh-kien/:ma/cap-nhat-cho-duyet", xetDuyetMaRoles, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ ma_moi?: string; ten_moi?: string }>();
  const user = c.get("user");
  const lk = await docLk(c.env.DB, ma);
  if (!lk) return c.json({ error: "NOT_FOUND" }, 404);
  if (lk.trang_thai_ma !== TT_MA.CHO) return c.json({ error: "KHONG_CON_CHO_DUYET", trang_thai_ma: lk.trang_thai_ma }, 409);
  const maMoi = body.ma_moi?.trim() || ma;
  const tenMoi = body.ten_moi?.trim() || lk.ten_linh_kien;
  if (/\s/.test(maMoi)) return c.json({ error: "MA_KHONG_HOP_LE" }, 400);
  if (maMoi === ma && tenMoi === lk.ten_linh_kien) return c.json({ error: "KHONG_CO_THAY_DOI" }, 400);
  const soDon = (await demDonDungLk(c.env.DB, ma)).tong;

  if (maMoi === ma) {
    const now = nowVN();
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE linh_kien SET ten_linh_kien = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ? AND trang_thai_ma = ?")
        .bind(tenMoi, user.email, now, ma, TT_MA.CHO),
      c.env.DB.prepare("UPDATE dat_don_hang SET ten_lk_snapshot = ? WHERE ma_lk = ?").bind(tenMoi, ma),
      logLk(c.env.DB, { ma, hanhDong: "Cap nhat", tenCu: lk.ten_linh_kien, tenMoi, soDon, nguoi: user.email }),
    ]);
  } else {
    const trung = await docLk(c.env.DB, maMoi);
    if (trung) return c.json({ error: "MA_DA_TON_TAI", ma_linh_kien: trung.ma_linh_kien, ten_linh_kien: trung.ten_linh_kien, trang_thai_ma: trung.trang_thai_ma, ma_chuan: trung.ma_chuan }, 409);
    await chuyenMaLk(c.env.DB, { maNguon: ma, maDich: maMoi, tenNguon: lk.ten_linh_kien, taoMoi: { ten: tenMoi, giuChoDuyet: true }, hanhDong: "Doi ma", soDon, nguoi: user.email });
  }
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  if (soDon) c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, ma_linh_kien: maMoi, so_don: soDon });
});

// POST /linh-kien/:ma/gop - { ma_dich, ghi_chu? } - LK cho duyet tao trung 1 LK da co -> chuyen moi don/BOM/nhom thay
// the sang ma_dich, A thanh dong chuyen huong. Gia theo ma_dich -> tinh lai tien PXK dang tao cua KTV lien quan.
settingsDatMua.post("/linh-kien/:ma/gop", xetDuyetMaRoles, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ ma_dich?: string; ghi_chu?: string }>();
  const user = c.get("user");
  const maDich = body.ma_dich?.trim();
  if (!maDich || maDich === ma) return c.json({ error: "MA_DICH_KHONG_HOP_LE" }, 400);
  const [lk, dich] = await Promise.all([docLk(c.env.DB, ma), docLk(c.env.DB, maDich)]);
  if (!lk) return c.json({ error: "NOT_FOUND" }, 404);
  if (lk.trang_thai_ma !== TT_MA.CHO) return c.json({ error: "KHONG_CON_CHO_DUYET", trang_thai_ma: lk.trang_thai_ma }, 409);
  if (!dich) return c.json({ error: "MA_DICH_KHONG_TON_TAI" }, 400);
  if (dich.trang_thai_ma === TT_MA.DA_DOI) return c.json({ error: "MA_DICH_DA_DOI_MA", ma_chuan: dich.ma_chuan }, 400);
  if (dich.trang_thai_ma === TT_MA.TU_CHOI) return c.json({ error: "MA_DICH_DA_TU_CHOI" }, 400);
  const soDon = (await demDonDungLk(c.env.DB, ma)).tong;
  await chuyenMaLk(c.env.DB, { maNguon: ma, maDich, tenNguon: lk.ten_linh_kien, taoMoi: null, hanhDong: "Gop ma", ghiChu: body.ghi_chu?.trim() || null, soDon, nguoi: user.email });
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  if (soDon) {
    await tinhLaiTienTheoLk(c.env.DB, maDich, user.email);
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  }
  return c.json({ ok: true, ma_linh_kien: maDich, so_don: soDon });
});

// POST /linh-kien/:ma/tu-choi - { ly_do } - chi khi KHONG con don dang hieu luc dung ma (con thi phai Gop). LK bi tu choi
// an khoi o chon tao don (bat_tat = 0).
settingsDatMua.post("/linh-kien/:ma/tu-choi", xetDuyetMaRoles, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ ly_do?: string }>();
  const user = c.get("user");
  const lyDo = body.ly_do?.trim();
  if (!lyDo) return c.json({ error: "THIEU_LY_DO" }, 400);
  const lk = await docLk(c.env.DB, ma);
  if (!lk) return c.json({ error: "NOT_FOUND" }, 404);
  if (lk.trang_thai_ma !== TT_MA.CHO) return c.json({ error: "KHONG_CON_CHO_DUYET", trang_thai_ma: lk.trang_thai_ma }, 409);
  const soDon = await demDonDungLk(c.env.DB, ma);
  if (soDon.con_hieu_luc > 0) return c.json({ error: "CON_DON_DANG_DUNG", so_don: soDon.con_hieu_luc }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE linh_kien SET trang_thai_ma = ?, bat_tat = 0, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?")
      .bind(TT_MA.TU_CHOI, user.email, nowVN(), ma),
    logLk(c.env.DB, { ma, hanhDong: "Tu choi", ghiChu: lyDo, soDon: soDon.tong, nguoi: user.email }),
  ]);
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ ok: true });
});

// POST /linh-kien/:ma/gia-tam - { gia_ban, gia_tri_cong_no } - Gia NY / Gia KTV tam cho LK CHUA co tren gia88
// (co_tren_gia88 = 0; gia88 co ma nay thi gia gia88 ghi de moi dem). Doi ngay_cap_nhat de cache o chon tao don nhan gia
// moi; tinh lai tien PXK dang tao cua KTV co don dung ma.
settingsDatMua.post("/linh-kien/:ma/gia-tam", muaHangRoles, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ gia_ban?: number | null; gia_tri_cong_no?: number | null }>();
  const user = c.get("user");
  const lk = await c.env.DB.prepare("SELECT trang_thai_ma, co_tren_gia88, gia_ban, gia_tri_cong_no FROM linh_kien WHERE ma_linh_kien = ?")
    .bind(ma)
    .first<{ trang_thai_ma: string; co_tren_gia88: number; gia_ban: number | null; gia_tri_cong_no: number | null }>();
  if (!lk) return c.json({ error: "NOT_FOUND" }, 404);
  if (lk.trang_thai_ma === TT_MA.DA_DOI || lk.trang_thai_ma === TT_MA.TU_CHOI) return c.json({ error: "LK_KHONG_CON_HIEU_LUC" }, 409);
  if (lk.co_tren_gia88) return c.json({ error: "GIA_DO_GIA88_QUAN_LY" }, 409);
  const so = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : NaN);
  const giaBan = so(body.gia_ban);
  const giaKtv = so(body.gia_tri_cong_no);
  if (Number.isNaN(giaBan) || Number.isNaN(giaKtv)) return c.json({ error: "GIA_KHONG_HOP_LE" }, 400);
  const fmt = (v: number | null) => (v == null ? "trống" : v.toLocaleString("vi-VN"));
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE linh_kien SET gia_ban = ?, gia_tri_cong_no = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?")
      .bind(giaBan, giaKtv, user.email, nowVN(), ma),
    logLk(c.env.DB, {
      ma, hanhDong: "Gia tam", nguoi: user.email,
      ghiChu: `Giá NY ${fmt(lk.gia_ban)} → ${fmt(giaBan)}; Giá KTV ${fmt(lk.gia_tri_cong_no)} → ${fmt(giaKtv)}`,
    }),
  ]);
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  await tinhLaiTienTheoLk(c.env.DB, ma, user.email);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// ?them=1 (2026-10-13, toi da 10 anh - migration 0077): THEM anh vao cuoi danh sach anh_ds. Khong co ?them (tab cu) = thay anh
// chinh (anh_demo) nhu truoc, trigger trg_linh_kien_anh_ds giu cac anh phu.
settingsDatMua.post("/linh-kien/:ma/anh", suaLinhKienRoles, async (c) => {
  const ma = c.req.param("ma");
  const them = c.req.query("them") === "1";
  const existing = await c.env.DB.prepare("SELECT anh_demo, anh_ds FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first<{ anh_demo: string | null; anh_ds: string | null }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  // Kiem tra TRUOC khi tai len de khong ton luot anh/ngay.
  if (them && dsAnhLk(existing).length >= SO_ANH_LK_TOI_DA) return c.json({ error: "QUA_SO_ANH_LK", toi_da: SO_ANH_LK_TOI_DA }, 409);

  // Dinh dang / <= 10MB / <= 20 anh/ngay/tai khoan + tai len Drive - xem lib/anhUpload.ts.
  const uploaded = await nhanAnhTaiLen(c, (ext) => `linh-kien-${ma}-${Date.now()}.${ext}`);
  if (uploaded instanceof Response) return uploaded;

  const user = c.get("user");
  if (!them) {
    await c.env.DB.prepare("UPDATE linh_kien SET anh_demo = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?")
      .bind(uploaded.thumbnailUrl, user.email, nowVN(), ma)
      .run();
  } else {
    // CAS theo (anh_demo, anh_ds) doc duoc - 2 anh tai song song khong de mat nhau; doi thi doc lai, thu toi 5 lan.
    let cur = existing;
    let ok = false;
    for (let lan = 0; lan < 5 && !ok; lan++) {
      const ds = dsAnhLk(cur);
      if (ds.length >= SO_ANH_LK_TOI_DA) return c.json({ error: "QUA_SO_ANH_LK", toi_da: SO_ANH_LK_TOI_DA }, 409);
      const moi = cotAnhLk([...ds, uploaded.thumbnailUrl]);
      const r = await c.env.DB.prepare(
        "UPDATE linh_kien SET anh_demo = ?, anh_ds = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ? AND anh_demo IS ? AND anh_ds IS ?",
      )
        .bind(moi.anh_demo, moi.anh_ds, user.email, nowVN(), ma, cur.anh_demo, cur.anh_ds)
        .run();
      ok = (r.meta.changes ?? 0) > 0;
      if (!ok) {
        const lai = await c.env.DB.prepare("SELECT anh_demo, anh_ds FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first<{ anh_demo: string | null; anh_ds: string | null }>();
        if (!lai) return c.json({ error: "NOT_FOUND" }, 404);
        cur = lai;
      }
    }
    if (!ok) return c.json({ error: "XUNG_DOT_GHI" }, 409);
  }
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ ok: true, url: uploaded.thumbnailUrl, han_muc_anh: uploaded.hanMucAnh });
});

// PUT /linh-kien/:ma/anh-ds {anh_ds: string[]} - sap xep lai / xoa anh (anh dau = anh chinh). CHI nhan URL dang co trong danh
// sach hien tai (khong chen link ngoai), khong trung; them anh moi di qua POST .../anh?them=1.
settingsDatMua.put("/linh-kien/:ma/anh-ds", suaLinhKienRoles, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ anh_ds?: unknown }>();
  if (!Array.isArray(body.anh_ds) || !body.anh_ds.every((x) => typeof x === "string")) return c.json({ error: "INVALID_BODY" }, 400);
  const existing = await c.env.DB.prepare("SELECT anh_demo, anh_ds FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first<{ anh_demo: string | null; anh_ds: string | null }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const hienTai = new Set(dsAnhLk(existing));
  const ds = body.anh_ds as string[];
  if (new Set(ds).size !== ds.length || ds.some((u) => !hienTai.has(u))) return c.json({ error: "DANH_SACH_ANH_DA_DOI" }, 409);
  const moi = cotAnhLk(ds);
  const user = c.get("user");
  const r = await c.env.DB.prepare(
    "UPDATE linh_kien SET anh_demo = ?, anh_ds = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ? AND anh_demo IS ? AND anh_ds IS ?",
  )
    .bind(moi.anh_demo, moi.anh_ds, user.email, nowVN(), ma, existing.anh_demo, existing.anh_ds)
    .run();
  if (!(r.meta.changes ?? 0)) return c.json({ error: "DANH_SACH_ANH_DA_DOI" }, 409);
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ ok: true });
});

// POST /api/settings/linh-kien/bulk-import-anh - { rows: [{ma_linh_kien, source_url}], offset } - 1
// chunk 10 dong/lan (client tu lap goi den done:true), dung khi nhap hang loat "anh demo" tu file
// Excel co san. Loi tung dong khong lam hong ca chunk.
settingsDatMua.post("/linh-kien/bulk-import-anh", linhKienWriteRoles, async (c) => {
  const body = await c.req.json<{ rows: { ma_linh_kien: string; source_url: string }[]; offset: number }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const CHUNK_SIZE = 10;
  const offset = Math.max(0, body.offset ?? 0);
  // Kieu lo (2026-10-03): client moi gui `rows` = CHINH lo + `total` (truoc gui lai ca file moi request); thieu total = kieu cu.
  const kieuLo = typeof (body as { total?: unknown }).total === "number";
  const total = kieuLo ? (body as { total?: number }).total! : body.rows.length;
  if (kieuLo && (body.rows.length > CHUNK_SIZE * 4 || (body.rows.length === 0 && offset < total))) return c.json({ error: "LO_KHONG_HOP_LE" }, 400);
  const chunk = kieuLo ? body.rows : body.rows.slice(offset, offset + CHUNK_SIZE);
  const user = c.get("user");
  const now = nowVN();

  let success = 0;
  let notFound = 0;
  let fetchFailed = 0;
  let errorCount = 0;
  const details: { ma_linh_kien: string; status: string }[] = [];

  for (const row of chunk) {
    const ma = row.ma_linh_kien?.trim();
    const sourceUrl = row.source_url?.trim();
    if (!ma || !sourceUrl) {
      errorCount++;
      details.push({ ma_linh_kien: ma || "(rỗng)", status: "loi" });
      continue;
    }
    const exists = await c.env.DB.prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
    if (!exists) {
      notFound++;
      details.push({ ma_linh_kien: ma, status: "khong_tim_thay" });
      continue;
    }
    try {
      // Gioi han 5s/anh (phan hoi audit AUD-003: 1 URL treo khong duoc phep keo dai ca Worker
      // request) - AbortSignal.timeout tu nem TimeoutError, roi dung vao nhanh catch da co san.
      // + dinh dang / <= 10MB / han muc anh ngay (lib/anhUpload.ts).
      const uploaded = await taiAnhTuUrl(c, sourceUrl, (ext) => `linh-kien-${ma}-${Date.now()}.${ext}`);
      await c.env.DB.prepare("UPDATE linh_kien SET anh_demo = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?")
        .bind(uploaded.thumbnailUrl, user.email, now, ma)
        .run();
      success++;
      details.push({ ma_linh_kien: ma, status: "thanh_cong" });
    } catch (err) {
      fetchFailed++;
      const loi = err instanceof Error ? err.message : "";
      details.push({ ma_linh_kien: ma, status: loi === "QUA_SO_ANH_NGAY" ? "qua_so_anh_ngay" : loi === "ANH_QUA_LON" ? "anh_qua_lon" : "tai_anh_that_bai" });
    }
  }

  const nextOffset = offset + (kieuLo ? chunk.length : CHUNK_SIZE);
  const done = nextOffset >= total;
  if (done) await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  // het_han_muc_anh: frontend dung lo tiep theo + canh bao (lib/hanMucAnh.ts).
  return c.json({ done, nextOffset, success, notFound, fetchFailed, errorCount, details, het_han_muc_anh: details.some((d) => d.status === "qua_so_anh_ngay") });
});

// POST /api/settings/linh-kien/bulk-import - { rows: [{ma_linh_kien, ten_linh_kien?, don_vi?,
// ghi_chu?, dac_thu?, chi_sua_chua?, anh_url?, phan_loai_dac_thu?}], isLast? } - nhap/cap nhat HANG
// LOAT ca dong danh muc - dung khi mang danh sach linh kien tu he khac sang (vd he bao hanh goc) qua
// file Excel/CSV. UPSERT theo ma_linh_kien (ON CONFLICT DO UPDATE) - chay lai nhieu lan an toan,
// KHONG dong vao bat_tat (giu trang thai an/hien da chinh tay truoc do). Frontend tu chia "rows"
// thanh tung lo (chunk) TRUOC khi goi - moi request CHI mang dung 1 lo, xu ly HET tất ca dong nhan
// duoc (khong tu chia nho them o day).
//
// CHOT 2026-09-12 (tich hop gia88 lam nguon chinh gia): bo han "gia_ban"/"gia_tham_chieu"/
// "gia_tri_cong_no" khoi danh sach cot import nay - 3 cot gia do gia88Sync.ts quan ly, KHONG con
// duong nao khac (ke ca import file) duoc phep ghi de nua, tranh thanh 1 "cua sau" quanh quyet dinh
// "chi xem" o PATCH /linh-kien/:ma.
//
// FIX #1 (phan hoi 2026-09-04: "tốc độ import rất chậm") - TRUOC DAY frontend gui NGUYEN CA MANG
// "rows" (toan bo file) O MOI LAN goi, kem "offset" de backend tu cat 10 dong/lan roi lap lai - da doi
// sang frontend tu cat lo (xem handleBulkImportCatalog), moi request chi gui 1 lo.
//
// FIX #2 (phan hoi tiep theo: "test lại tốc độ còn chậm hơn ban đầu") - FIX #1 KHONG du, vi nguyen
// nhan CHINH khong phai o kich thuoc payload ma o SO LAN GOI D1: vong for cu await TUNG dong 1 (moi
// .prepare().bind().run() la 1 round-trip rieng toi D1, ~vai chuc ms/lan du ban than cau lenh rat
// don gian) - 1 lo 25 dong = 25 round-trip TUAN TU + 1 round-trip SELECT ton tai = 26 lan cho D1/lo,
// CHUA KE FIX #1 lam CHUNK tang tu 10 len 25 (van giu nguyen so dong/giay nhung it request HTTP hon -
// khong sai nhung khong cham vao nguyen nhan that). Doi sang dung D1Database.batch(): gom TOAN BO cau
// lenh INSERT cua ca lo thanh 1 mang, gui bang 1 LAN GOI DUY NHAT (D1 tu chay tuan tu trong 1
// transaction o phia server, khong qua lai network nhieu lan) - giam tu ~26 round-trip/lo xuong con 2
// (1 SELECT ton tai + 1 batch INSERT). Danh doi: batch() la all-or-nothing (1 dong loi se rollback CA
// LO) - da co fallback: neu batch() nem loi, chay lai lo do THEO TUNG DONG (cach cu) de van cach ly
// dung dong loi thay vi mat ca lo, chi cham hon o truong hop hiem gap loi thuc su (khong phai duong
// di thuong).
settingsDatMua.post("/linh-kien/bulk-import", linhKienWriteRoles, async (c) => {
  const body = await c.req.json<{
    rows: {
      ma_linh_kien: string; ten_linh_kien?: string;
      don_vi?: string; ghi_chu?: string; dac_thu?: boolean; chi_sua_chua?: boolean; anh_url?: string;
      phan_loai_dac_thu?: string;
      nhom_lk?: string; // "Linh kiện Karofi" / "Linh kiện B2B" (2026-10-16) - trong: ma moi tu doan (trigger), ma cu giu nguyen
    }[];
    isLast?: boolean;
  }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const chunk = body.rows;
  const user = c.get("user");
  const now = nowVN();

  let success = 0;
  let errorCount = 0;
  const details: { ma_linh_kien: string; status: string }[] = [];

  // Doc san 3 cot NOT NULL (ten_linh_kien, dac_thu, chi_sua_chua) cua cac ma DA CO trong chunk - CAN
  // THIET vi SQLite kiem tra rang buoc NOT NULL ngay tren "VALUES" cua INSERT du dang dung UPSERT (da
  // xac minh truc tiep: ON CONFLICT DO UPDATE SET x = COALESCE(excluded.x, table.x) VAN bao loi NOT
  // NULL neu excluded.x = NULL, COALESCE trong SET khong "cuu" duoc vi rang buoc bi kiem tra TRUOC khi
  // conflict resolution ap dung nhanh UPDATE) - khac hoan toan voi cong_no o ktv_lien_he/bulk-import
  // (cot đó nullable nen khong dinh loi nay). Vi vay 3 cot nay PHAI duoc "giu nguyen" bang cach tu doc
  // gia tri cu roi bind THANG gia tri that (khong con NULL) - khong the dua het cho COALESCE trong SQL.
  const masInChunk = [...new Set(chunk.map((r) => r.ma_linh_kien?.trim()).filter((m): m is string => !!m))];
  const existingMap = new Map<string, { ten_linh_kien: string; dac_thu: number; chi_sua_chua: number }>();
  if (masInChunk.length > 0) {
    const { results } = await c.env.DB.prepare(
      `SELECT ma_linh_kien, ten_linh_kien, dac_thu, chi_sua_chua FROM linh_kien WHERE ma_linh_kien IN (${masInChunk.map(() => "?").join(",")})`,
    )
      .bind(...masInChunk)
      .all<{ ma_linh_kien: string; ten_linh_kien: string; dac_thu: number; chi_sua_chua: number }>();
    for (const r of results) existingMap.set(r.ma_linh_kien, r);
  }

  const UPSERT_SQL = `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, don_vi, ghi_chu, anh_demo, dac_thu, chi_sua_chua, phan_loai_dac_thu, nhom_lk, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ma_linh_kien) DO UPDATE SET
       ten_linh_kien = excluded.ten_linh_kien,
       don_vi = COALESCE(excluded.don_vi, linh_kien.don_vi),
       ghi_chu = COALESCE(excluded.ghi_chu, linh_kien.ghi_chu),
       anh_demo = COALESCE(excluded.anh_demo, linh_kien.anh_demo),
       dac_thu = excluded.dac_thu,
       chi_sua_chua = excluded.chi_sua_chua,
       phan_loai_dac_thu = COALESCE(excluded.phan_loai_dac_thu, linh_kien.phan_loai_dac_thu),
       nhom_lk = COALESCE(excluded.nhom_lk, linh_kien.nhom_lk),
       nguoi_cap_nhat = excluded.nguoi_cap_nhat,
       ngay_cap_nhat = excluded.ngay_cap_nhat`;

  const statements: D1PreparedStatement[] = [];
  const rowMetas: { ma: string; anhLoi: boolean }[] = [];
  let hetHanMucAnh = false;

  for (const row of chunk) {
    const ma = row.ma_linh_kien?.trim();
    if (!ma) {
      errorCount++;
      details.push({ ma_linh_kien: "(rỗng)", status: "thieu_ma" });
      continue;
    }
    const existingRow = existingMap.get(ma);
    const tenMoi = row.ten_linh_kien?.trim() || null;
    if (!tenMoi && !existingRow) {
      errorCount++;
      details.push({ ma_linh_kien: ma, status: "ma_moi_thieu_ten" });
      continue;
    }
    // Phan loai BAT BUOC cho ma MOI (chot 2026-09-30 - vd "Máy" quyet dinh kho xuat trong file MISA, lib/misaExport.ts).
    if (!existingRow && !row.don_vi?.trim()) {
      errorCount++;
      details.push({ ma_linh_kien: ma, status: "ma_moi_thieu_phan_loai" });
      continue;
    }
    // Nhom LK Karofi / B2B (2026-10-16): co ghi thi phai dung 1 trong 2 nhom.
    const nhomLk = chuanNhomLk(row.nhom_lk);
    if (row.nhom_lk?.trim() && !nhomLk) {
      errorCount++;
      details.push({ ma_linh_kien: ma, status: "nhom_lk_khong_hop_le" });
      continue;
    }
    const ten = tenMoi ?? existingRow!.ten_linh_kien;

    let anhDemo: string | null = null;
    let anhLoi = false;
    const anhUrl = row.anh_url?.trim();
    if (anhUrl) {
      try {
        // Cung ly do AUD-003 nhu bulk-import-anh o tren.
        const uploaded = await taiAnhTuUrl(c, anhUrl, (ext) => `linh-kien-${ma}-${Date.now()}.${ext}`);
        anhDemo = uploaded.thumbnailUrl;
      } catch (err) {
        anhLoi = true;
        if (err instanceof Error && err.message === "QUA_SO_ANH_NGAY") hetHanMucAnh = true;
      }
    }

    // dac_thu/chi_sua_chua la NOT NULL DEFAULT 0 - cung ly do nhu ten_linh_kien o tren, khong the bind
    // NULL roi cho COALESCE trong SET "cuu" - dong nao khong truyen thi lay lai gia tri cu (ma da co)
    // hoac mac dinh 0 (ma moi).
    const dacThuVal = row.dac_thu !== undefined ? (row.dac_thu ? 1 : 0) : (existingRow?.dac_thu ?? 0);
    const chiSuaChuaVal = row.chi_sua_chua !== undefined ? (row.chi_sua_chua ? 1 : 0) : (existingRow?.chi_sua_chua ?? 0);

    statements.push(
      c.env.DB.prepare(UPSERT_SQL).bind(
        ma, ten, row.don_vi?.trim() || null, row.ghi_chu?.trim() || null,
        anhDemo, dacThuVal, chiSuaChuaVal,
        row.phan_loai_dac_thu?.trim() || null,
        nhomLk, user.email, now,
      ),
    );
    rowMetas.push({ ma, anhLoi });
  }

  if (statements.length > 0) {
    try {
      await c.env.DB.batch(statements);
      for (const meta of rowMetas) {
        success++;
        details.push({ ma_linh_kien: meta.ma, status: meta.anhLoi ? "thanh_cong_loi_anh" : "thanh_cong" });
      }
    } catch {
      // batch() la all-or-nothing - neu that bai, chay lai TUNG dong (cach cu) de cach ly dung dong
      // loi thay vi mat trang ca lo chi vi 1 dong.
      for (let i = 0; i < statements.length; i++) {
        try {
          await statements[i].run();
          success++;
          details.push({ ma_linh_kien: rowMetas[i].ma, status: rowMetas[i].anhLoi ? "thanh_cong_loi_anh" : "thanh_cong" });
        } catch {
          errorCount++;
          details.push({ ma_linh_kien: rowMetas[i].ma, status: "loi_ghi_db" });
        }
      }
    }
    // Ma MOI (chua co truoc lo nay) vao "Cho xet duyet" (DEFAULT trang_thai_ma) - ghi log "Tao moi" cho Mua hang biet
    // ai tao. Chi dong da ghi that (details thanh_cong*); loi log khong lam hong ket qua import.
    const daGhi = new Set(details.filter((d) => d.status.startsWith("thanh_cong")).map((d) => d.ma_linh_kien));
    const logMoi = rowMetas
      .filter((m) => !existingMap.has(m.ma) && daGhi.has(m.ma))
      .map((m) => logLk(c.env.DB, { ma: m.ma, hanhDong: "Tao moi", ghiChu: "Nhập danh mục hàng loạt", nguoi: user.email }));
    if (logMoi.length) await c.env.DB.batch(logMoi).catch(() => undefined);
  }

  if (body.isLast) await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ success, errorCount, details, het_han_muc_anh: hetHanMucAnh });
});

// ---------- Google Drive OAuth (uy quyen 1 tai khoan Google THAT de upload anh linh kien) ----------
// Port nguyen ban tu he goc - Service Account (GOOGLE_DRIVE_SA_*, dung cho anh bien ban/bang chung
// chuyen tien cua module chinh) khong co storage quota rieng nen KHONG dung duoc cho tinh nang nay -
// xem lib/googleDrive.ts uploadPublicImage() + ghi chu chi tiet trong do.
const GOOGLE_DRIVE_STATE_COOKIE = "dat_mua_lk_drive_oauth_state";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";

settingsDatMua.get("/google-drive/status", adminOnly, async (c) => {
  const row = await c.env.DB.prepare("SELECT google_email, folder_id, authorized_by, authorized_at FROM google_drive_oauth WHERE id = 1").first<{
    google_email: string; folder_id: string; authorized_by: string; authorized_at: string;
  }>();
  if (!row) return c.json({ connected: false });
  return c.json({ connected: true, ...row });
});

settingsDatMua.get("/google-drive/authorize", adminOnly, async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, GOOGLE_DRIVE_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/" });

  const redirectUri = `${new URL(c.req.url).origin}/api/settings/google-drive/callback`;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPE,
    state,
    access_type: "offline",
    prompt: "consent select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

settingsDatMua.get("/google-drive/callback", adminOnly, async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(c, GOOGLE_DRIVE_STATE_COOKIE);
  deleteCookie(c, GOOGLE_DRIVE_STATE_COOKIE, { path: "/" });

  if (!code || !state || !savedState || state !== savedState) {
    return c.text("Xac thuc that bai: state khong hop le.", 400);
  }

  const redirectUri = `${url.origin}/api/settings/google-drive/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("Khong the doi ma xac thuc voi Google: " + (await tokenRes.text()), 502);
  const tokenJson = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
  if (!tokenJson.refresh_token) {
    return c.text(
      "Google khong tra ve refresh_token (co the tai khoan da tung uy quyen truoc do) - vao myaccount.google.com/permissions, go quyen truy cap cua app nay roi thu lai.",
      400,
    );
  }

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userInfoRes.ok) return c.text("Khong the lay thong tin nguoi dung tu Google.", 502);
  const userInfo = (await userInfoRes.json()) as { email: string };

  const folderRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Dat mua linh kien - Anh linh kien", mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!folderRes.ok) return c.text("Khong the tao folder Drive: " + (await folderRes.text()), 502);
  const { id: folderId } = (await folderRes.json()) as { id: string };

  const refreshTokenEnc = await encryptSecret(c.env, tokenJson.refresh_token);
  const user = c.get("user");
  await c.env.DB.prepare(
    `INSERT INTO google_drive_oauth (id, google_email, refresh_token_enc, folder_id, authorized_by, authorized_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc,
       folder_id = excluded.folder_id, authorized_by = excluded.authorized_by, authorized_at = excluded.authorized_at`,
  )
    .bind(userInfo.email, refreshTokenEnc, folderId, user.email, nowVN())
    .run();

  return c.redirect(c.env.FRONTEND_URL || "/");
});

// ---------- Ly do cham ----------

settingsDatMua.get("/ly-do-cham", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_ly_do_cham ORDER BY stt, id").all();
  return c.json({ rows: results });
});

settingsDatMua.post("/ly-do-cham", adminOnly, async (c) => {
  const body = await c.req.json<{ ten_ly_do: string; he_thong_su_dung: string; quan_ly_don_thieu_linh_kien?: boolean; bat_tat?: boolean; stt?: number }>();
  if (!body.ten_ly_do?.trim()) return c.json({ error: "MISSING_TEN_LY_DO" }, 400);
  if (!body.he_thong_su_dung?.trim()) return c.json({ error: "MISSING_HE_THONG_SU_DUNG" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO settings_ly_do_cham (ten_ly_do, he_thong_su_dung, quan_ly_don_thieu_linh_kien, bat_tat, stt, nguoi_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(body.ten_ly_do.trim(), body.he_thong_su_dung.trim(), body.quan_ly_don_thieu_linh_kien ? 1 : 0, body.bat_tat === false ? 0 : 1, body.stt ?? 0, user.email)
    .first();
  return c.json(row, 201);
});

settingsDatMua.patch("/ly-do-cham/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ ten_ly_do?: string; he_thong_su_dung?: string; quan_ly_don_thieu_linh_kien?: boolean; bat_tat?: boolean; stt?: number }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_ly_do_cham WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = {
    ten_ly_do: body.ten_ly_do !== undefined ? body.ten_ly_do.trim() : existing.ten_ly_do,
    he_thong_su_dung: body.he_thong_su_dung !== undefined ? body.he_thong_su_dung.trim() : existing.he_thong_su_dung,
    quan_ly_don_thieu_linh_kien: body.quan_ly_don_thieu_linh_kien !== undefined ? (body.quan_ly_don_thieu_linh_kien ? 1 : 0) : existing.quan_ly_don_thieu_linh_kien,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    stt: body.stt !== undefined ? body.stt : existing.stt,
  };
  const user = c.get("user");
  await c.env.DB.prepare(
    "UPDATE settings_ly_do_cham SET ten_ly_do = ?, he_thong_su_dung = ?, quan_ly_don_thieu_linh_kien = ?, bat_tat = ?, stt = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?",
  )
    .bind(next.ten_ly_do, next.he_thong_su_dung, next.quan_ly_don_thieu_linh_kien, next.bat_tat, next.stt, user.email, nowVN(), id)
    .run();
  return c.json({ ok: true });
});

// ---------- Loai chiet khau (migration 0033) ----------
// Danh sach loai chiet khau gan cho tung dong don hang. Loai co `ma` = he thong sinh ra (khop 1 nhanh cua
// thuat toan tinh tien PXK) - doi ten/tat duoc, KHONG doi `ma`. GET mo cho moi nguoi (TN can de chon lai,
// moi danh sach don can de hien ten); ghi CHI Admin - rieng TN tu them loai moi qua
// PATCH /api/phieu-xuat-kho/don-hang/:id/loai-chiet-khau (ten_moi).

settingsDatMua.get("/loai-chiet-khau", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_loai_chiet_khau ORDER BY stt, id").all();
  return c.json({ rows: results });
});

settingsDatMua.post("/loai-chiet-khau", adminOnly, async (c) => {
  const body = await c.req.json<{ ten: string; bat_tat?: boolean }>();
  const ten = body.ten ? gonTenLoaiChietKhau(body.ten) : "";
  if (!ten) return c.json({ error: "MISSING_TEN" }, 400);
  const trung = await timLoaiChietKhauTheoTen(c.env.DB, ten);
  if (trung) return c.json({ error: "TEN_DA_TON_TAI" }, 409);
  const row = await c.env.DB.prepare(
    `INSERT INTO settings_loai_chiet_khau (ten, bat_tat, stt, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, (SELECT COALESCE(MAX(stt), 0) + 1 FROM settings_loai_chiet_khau), ?, ?) RETURNING *`,
  )
    .bind(ten, body.bat_tat === false ? 0 : 1, c.get("user").email, nowVN())
    .first();
  return c.json(row, 201);
});

settingsDatMua.patch("/loai-chiet-khau/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ ten?: string; bat_tat?: boolean; stt?: number }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_loai_chiet_khau WHERE id = ?")
    .bind(id)
    .first<{ ten: string; bat_tat: number; stt: number }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const ten = body.ten !== undefined ? gonTenLoaiChietKhau(body.ten) : existing.ten;
  if (!ten) return c.json({ error: "MISSING_TEN" }, 400);
  if (await timLoaiChietKhauTheoTen(c.env.DB, ten, id)) return c.json({ error: "TEN_DA_TON_TAI" }, 409);
  await c.env.DB.prepare("UPDATE settings_loai_chiet_khau SET ten = ?, bat_tat = ?, stt = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?")
    .bind(ten, body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat, body.stt ?? existing.stt, c.get("user").email, nowVN(), id)
    .run();
  return c.json({ ok: true });
});

// ---------- Loai de xuat: nhom + options ----------

settingsDatMua.get("/loai-de-xuat/nhom", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_loai_de_xuat_nhom ORDER BY id").all();
  return c.json({ rows: results });
});

settingsDatMua.post("/loai-de-xuat/nhom", adminOnly, async (c) => {
  const body = await c.req.json<{ ten_nhom: string; vai_tro_json: string; bat_tat?: boolean }>();
  if (!body.ten_nhom?.trim()) return c.json({ error: "MISSING_TEN_NHOM" }, 400);
  const user = c.get("user");
  const vaiTroJson = typeof body.vai_tro_json === "string" ? body.vai_tro_json : JSON.stringify(body.vai_tro_json ?? []);
  const row = await c.env.DB.prepare(
    "INSERT INTO settings_loai_de_xuat_nhom (ten_nhom, vai_tro_json, bat_tat, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(body.ten_nhom.trim(), vaiTroJson, body.bat_tat !== false ? 1 : 0, user.email, nowVN())
    .first();
  return c.json(row, 201);
});

settingsDatMua.patch("/loai-de-xuat/nhom/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ ten_nhom?: string; vai_tro_json?: string; bat_tat?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_loai_de_xuat_nhom WHERE id = ?").bind(id).first<{ ten_nhom: string; vai_tro_json: string; bat_tat: number }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  const next = {
    ten_nhom: body.ten_nhom !== undefined ? body.ten_nhom.trim() : existing.ten_nhom,
    vai_tro_json: body.vai_tro_json !== undefined ? (typeof body.vai_tro_json === "string" ? body.vai_tro_json : JSON.stringify(body.vai_tro_json)) : existing.vai_tro_json,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
  };
  await c.env.DB.prepare(
    "UPDATE settings_loai_de_xuat_nhom SET ten_nhom = ?, vai_tro_json = ?, bat_tat = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?",
  )
    .bind(next.ten_nhom, next.vai_tro_json, next.bat_tat, user.email, nowVN(), id)
    .run();
  return c.json({ ok: true });
});

settingsDatMua.get("/loai-de-xuat", async (c) => {
  const since = c.req.query("since")?.trim();
  let query =
    "SELECT o.id, o.nhom_id, o.ten_option, o.bat_tat, o.stt, o.ngay_cap_nhat, o.loai_file_xuat_misa, n.ten_nhom, n.vai_tro_json " +
    "FROM settings_loai_de_xuat o JOIN settings_loai_de_xuat_nhom n ON n.id = o.nhom_id " +
    "WHERE n.bat_tat = 1";
  const binds: string[] = [];
  if (since) { query += " AND o.ngay_cap_nhat > ?"; binds.push(since); }
  query += " ORDER BY o.nhom_id, o.stt, o.id";
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json({ rows: results });
});

// "loai_file_xuat_misa" (them migration 0015_misa_export.sql) - null|'chuyen_kho'|'ban_hang'|'xuat_kho',
// validate o day (khong CHECK constraint duoc vi la ALTER TABLE ADD COLUMN) - CHI dung khi don
// dat_don_hang.loai_don='mua' luc xuat file MISA (xem lib/misaExport.ts), null = mac dinh 'ban_hang'.
const MISA_LOAI_FILE_XUAT_VALUES = ["chuyen_kho", "ban_hang", "xuat_kho"] as const;

settingsDatMua.post("/loai-de-xuat", adminOnly, async (c) => {
  const body = await c.req.json<{ nhom_id: number; ten_option: string; stt?: number }>();
  if (!body.nhom_id || !body.ten_option?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  const user = c.get("user");
  const row = await c.env.DB.prepare(
    "INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(body.nhom_id, body.ten_option.trim(), body.stt ?? 0, user.email, nowVN())
    .first();
  return c.json(row, 201);
});

settingsDatMua.patch("/loai-de-xuat/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ ten_option?: string; bat_tat?: boolean; stt?: number; loai_file_xuat_misa?: string | null }>();
  if (body.loai_file_xuat_misa !== undefined && body.loai_file_xuat_misa !== null && !MISA_LOAI_FILE_XUAT_VALUES.includes(body.loai_file_xuat_misa as (typeof MISA_LOAI_FILE_XUAT_VALUES)[number])) {
    return c.json({ error: "INVALID_LOAI_FILE_XUAT_MISA" }, 400);
  }
  const existing = await c.env.DB.prepare("SELECT * FROM settings_loai_de_xuat WHERE id = ?").bind(id).first<{ ten_option: string; bat_tat: number; stt: number; loai_file_xuat_misa: string | null }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  const next = {
    ten_option: body.ten_option !== undefined ? body.ten_option.trim() : existing.ten_option,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    stt: body.stt !== undefined ? body.stt : existing.stt,
    loai_file_xuat_misa: body.loai_file_xuat_misa !== undefined ? body.loai_file_xuat_misa : existing.loai_file_xuat_misa,
  };
  await c.env.DB.prepare(
    "UPDATE settings_loai_de_xuat SET ten_option = ?, bat_tat = ?, stt = ?, loai_file_xuat_misa = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?",
  )
    .bind(next.ten_option, next.bat_tat, next.stt, next.loai_file_xuat_misa, user.email, nowVN(), id)
    .run();
  return c.json({ ok: true });
});

settingsDatMua.delete("/loai-de-xuat/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM settings_loai_de_xuat WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ---------- Khu vuc (them 2026-08-26, xay lai quan ly tai khoan/vai tro - xem migration 0009) ----------
// 1 khu vuc chi 1 GS tai 1 thoi diem (ep boi schema: 1 cot gs_email/dong), 1 GS duoc phep phu trach
// nhieu khu vuc. Gan GS moi cho 1 khu vuc da co GS se ghi de - FE PHAI canh bao ro truoc khi goi PATCH
// /:ma/gs (xem Phase 3, UsersModule/SettingsModule).

settingsDatMua.get("/khu-vuc", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT k.*, u.ten as gs_ten FROM khu_vuc k LEFT JOIN users u ON u.email = k.gs_email ORDER BY k.stt, k.ma`,
  ).all();
  return c.json({ rows: results });
});

settingsDatMua.post("/khu-vuc", adminOnly, async (c) => {
  const body = await c.req.json<{ ma: string; ten: string; stt?: number }>();
  if (!body.ma?.trim() || !body.ten?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO khu_vuc (ma, ten, stt, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ma) DO UPDATE SET
       ten = excluded.ten, stt = excluded.stt, nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat
     RETURNING *`,
  )
    .bind(body.ma.trim(), body.ten.trim(), body.stt ?? 0, user.email, nowVN())
    .first();
  return c.json(row, 201);
});

settingsDatMua.patch("/khu-vuc/:ma", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ ten?: string; bat_tat?: boolean; stt?: number }>();
  const existing = await c.env.DB.prepare("SELECT * FROM khu_vuc WHERE ma = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = {
    ten: body.ten !== undefined ? body.ten.trim() : existing.ten,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    stt: body.stt !== undefined ? body.stt : existing.stt,
  };
  const user = c.get("user");
  await c.env.DB.prepare("UPDATE khu_vuc SET ten = ?, bat_tat = ?, stt = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma = ?")
    .bind(next.ten, next.bat_tat, next.stt, user.email, nowVN(), ma)
    .run();
  return c.json({ ok: true });
});

// PATCH /api/settings/khu-vuc/:ma/gs - gan/go GS phu trach 1 khu vuc. { gs_email: string | null }.
// Validate gs_email (neu co) phai la 1 user vai_tro="Giam sat" - tranh gan nham 1 tai khoan khong
// phai GS. Ghi de truc tiep (khong can xoa "khu vuc cu" cua GS do - 1 GS duoc phep nhieu khu vuc).
settingsDatMua.patch("/khu-vuc/:ma/gs", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const existing = await c.env.DB.prepare("SELECT ma FROM khu_vuc WHERE ma = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<{ gs_email?: string | null }>();
  const gsEmail = body.gs_email?.trim() || null;
  // "Chưa có khu vực" (CHUA_CO, migration 0042) la khu vuc he thong gom don khong xac dinh duoc khu vuc - khong co GS.
  if (ma === "CHUA_CO" && gsEmail) return c.json({ error: "KHU_VUC_HE_THONG" }, 400);
  if (gsEmail) {
    const gsUser = await c.env.DB.prepare("SELECT vai_tro FROM users WHERE email = ?").bind(gsEmail).first<{ vai_tro: string | null }>();
    if (!gsUser || gsUser.vai_tro !== "Giam sat") return c.json({ error: "NOT_A_GIAM_SAT" }, 400);
  }

  const user = c.get("user");
  await c.env.DB.prepare("UPDATE khu_vuc SET gs_email = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma = ?")
    .bind(gsEmail, user.email, nowVN(), ma)
    .run();
  // Phase 4 (2026-08-26): GS cua khu vuc nay vua doi - dong bo lai giam_sat_quan_ly cho MOI KTV
  // thuoc khu vuc nay (co the nhieu dong cung luc) - xem lib/khuVucSync.ts.
  await resyncKhuVucDerivedFieldsForAll(c.env.DB);
  return c.json({ ok: true });
});

// ---------- App settings (key-value chung, migration 0004_app_settings.sql) ----------
// GET mo cho MOI nguoi dung da dang nhap (khong rieng Admin) - "nen_anh_tra_hang" duoc doc boi client
// luc chon anh tai TraHangAnhPicker/QcTuChoiModal (module Dat mua linh kien), khong phai man quan tri.
// 4 khoa "Ma kho/Ten kho mac dinh theo mien" (them migration 0015_misa_export.sql) - dung de dien cot
// "Mã kho" khi xuat file MISA mau Ban hang/Chuyen kho (xem lib/misaExport.ts), doc CHUNG 1 lan voi
// nen_anh_tra_hang de khong them round-trip rieng. 2 khoa "misa_ma_kho_xk_*" (them 2026-09-04, ra soat
// chi tiet cot "Mã kho" - phat hien mau Xuat kho dung 1 he ma KHAC han, vd "LKKGMB"/"LKKGMN", voi Ban
// hang/Chuyen kho vd "6803"/"6804" - truoc day ca 3 mau dung CHUNG SAI 1 cap key).
const MISA_KHO_KEYS = [
  "misa_ma_kho_mien_bac", "misa_ten_kho_mien_bac", "misa_ma_kho_mien_nam", "misa_ten_kho_mien_nam",
  "misa_ma_kho_xk_mien_bac", "misa_ma_kho_xk_mien_nam",
  // Kho ky gui hang moi KRF cho LK phan loai "Máy" (migration 0059, chot 2026-09-30).
  "misa_ma_kho_may_mien_bac", "misa_ten_kho_may_mien_bac", "misa_ma_kho_may_mien_nam", "misa_ten_kho_may_mien_nam",
] as const;

settingsDatMua.get("/app-settings", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT key, value FROM app_settings WHERE key IN ('nen_anh_tra_hang', ${MISA_KHO_KEYS.map(() => "?").join(",")})`,
  )
    .bind(...MISA_KHO_KEYS)
    .all<{ key: string; value: string }>();
  const byKey = new Map(results.map((r) => [r.key, r.value]));
  return c.json({
    nen_anh_tra_hang: byKey.has("nen_anh_tra_hang") ? byKey.get("nen_anh_tra_hang") === "1" : true,
    misa_ma_kho_mien_bac: byKey.get("misa_ma_kho_mien_bac") ?? "",
    misa_ten_kho_mien_bac: byKey.get("misa_ten_kho_mien_bac") ?? "",
    misa_ma_kho_mien_nam: byKey.get("misa_ma_kho_mien_nam") ?? "",
    misa_ten_kho_mien_nam: byKey.get("misa_ten_kho_mien_nam") ?? "",
    misa_ma_kho_xk_mien_bac: byKey.get("misa_ma_kho_xk_mien_bac") ?? "",
    misa_ma_kho_xk_mien_nam: byKey.get("misa_ma_kho_xk_mien_nam") ?? "",
    misa_ma_kho_may_mien_bac: byKey.get("misa_ma_kho_may_mien_bac") ?? "",
    misa_ten_kho_may_mien_bac: byKey.get("misa_ten_kho_may_mien_bac") ?? "",
    misa_ma_kho_may_mien_nam: byKey.get("misa_ma_kho_may_mien_nam") ?? "",
    misa_ten_kho_may_mien_nam: byKey.get("misa_ten_kho_may_mien_nam") ?? "",
  });
});

// PATCH /api/settings/app-settings - { nen_anh_tra_hang?: boolean, misa_*?: string } - CHI Admin duoc
// doi (phan hoi 2026-08-24 cho nen_anh_tra_hang; 4 khoa misa_* them 2026-09-02; 2 khoa misa_ma_kho_xk_*
// them 2026-09-04).
settingsDatMua.patch("/app-settings", adminOnly, async (c) => {
  const body = await c.req.json<{
    nen_anh_tra_hang?: boolean; misa_ma_kho_mien_bac?: string; misa_ten_kho_mien_bac?: string;
    misa_ma_kho_mien_nam?: string; misa_ten_kho_mien_nam?: string;
    misa_ma_kho_xk_mien_bac?: string; misa_ma_kho_xk_mien_nam?: string;
    misa_ma_kho_may_mien_bac?: string; misa_ten_kho_may_mien_bac?: string;
    misa_ma_kho_may_mien_nam?: string; misa_ten_kho_may_mien_nam?: string;
  }>();
  const user = c.get("user");
  const updates: Array<[string, string]> = [];
  if (body.nen_anh_tra_hang !== undefined) updates.push(["nen_anh_tra_hang", body.nen_anh_tra_hang ? "1" : "0"]);
  for (const key of MISA_KHO_KEYS) {
    if (body[key] !== undefined) updates.push([key, body[key]!.trim()]);
  }
  if (updates.length === 0) return c.json({ error: "INVALID_BODY" }, 400);
  for (const [key, value] of updates) {
    await c.env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
      .bind(key, value, user.email, nowVN())
      .run();
  }
  return c.json({ ok: true });
});

// ---------- Partner API keys (them 2026-09-05, "cơ chế sẵn sàng cho các hệ thống gọi API tra cứu") -
// quan ly key cho router /api/partner (xem routes/partnerApi.ts, lib/partnerApiAuth.ts). Khong bao
// gio tra ve key_hash hay plaintext sau lan tao dau (chi luc POST moi thay 1 lan duy nhat) - dung
// nguyen tac "chi hien plaintext 1 lan" giong moi he thong quan ly secret khac.

settingsDatMua.get("/partner-api-keys", adminOnly, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, ten_he_thong, bat_tat, ghi_chu, tao_luc, lan_dung_cuoi FROM partner_api_keys ORDER BY tao_luc DESC",
  ).all();
  return c.json({ rows: results });
});

settingsDatMua.post("/partner-api-keys", adminOnly, async (c) => {
  const body = await c.req.json<{ ten_he_thong?: string; ghi_chu?: string }>();
  const tenHeThong = body.ten_he_thong?.trim();
  if (!tenHeThong) return c.json({ error: "MISSING_TEN_HE_THONG" }, 400);

  const apiKey = generateApiKey();
  const hash = await hashApiKey(apiKey);
  const row = await c.env.DB.prepare(
    "INSERT INTO partner_api_keys (ten_he_thong, key_hash, ghi_chu, tao_luc) VALUES (?, ?, ?, ?) RETURNING id",
  )
    .bind(tenHeThong, hash, body.ghi_chu?.trim() || null, nowVN())
    .first<{ id: number }>();

  // CHI lan nay tra plaintext - khong luu lai, khong the xem lai qua GET sau nay.
  return c.json({ id: row?.id, ten_he_thong: tenHeThong, api_key: apiKey });
});

settingsDatMua.patch("/partner-api-keys/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ bat_tat?: boolean }>();
  if (body.bat_tat === undefined) return c.json({ error: "INVALID_BODY" }, 400);
  await c.env.DB.prepare("UPDATE partner_api_keys SET bat_tat = ? WHERE id = ?").bind(body.bat_tat ? 1 : 0, id).run();
  return c.json({ ok: true });
});

export default settingsDatMua;
