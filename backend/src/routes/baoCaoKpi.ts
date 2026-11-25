import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { tenNguoiMap } from "../lib/tenNguoi";
import { gioLamViecGiua, parseGioVn } from "../lib/gioLamViec";

// "BC KPIs" (2026-11-25, v1.562 — chu he thong gui file "BC mua hang 2610.xlsx": "xây dựng trên app mục BC KPIs cho phép tải về (bc này
// không cần chạy liên tục, chỉ cần thêm nút load bc, thì mới load số liệu khi cần)"). Dung lai 3 chi so cua file Excel:
//   1) Ty le thieu hang theo Mien x Tuan (thang theo ngay tao DON): SL = so_luong_thuc_xuat ?? so_luong_de_xuat, phan loai don:
//      B2B (LK nhom b2b, KHONG tinh ty le) | Khach quan (ly do "Do nhà máy hết hàng", KHONG tinh) | Co don thieu (chua ve) |
//      Co don thieu - Da ve hang | Binh thuong. Ty le = Thieu / (Thieu + Binh thuong + Da ve). Muc tieu MB 1,5%, MN 2%.
//   2) Toc do Kho xu ly PXK (thang theo ngay tao PHIEU): gio tu Ke toan chot (chot_ke_toan_luc) -> Kho xuat (log dau tien sang
//      Dang gui KTV / Hang tru kho / Kho da ket thuc / Kho da nhan hang tra). Dat = <= 24 gio lich (muc tieu file Excel) — kem
//      cot <= 8 gio lam viec (luat SLA he thong tu v1.527). File Excel cu tru NGUOC (chot - kho) nen gan nhu phieu nao cung "dat".
//   3) "Ms Hang": don co Ma yeu cau su co / Ma Lada (bo don huy) + tong thoi gian xu ly (tao don -> KTV nhan / hoan tat).
// KHONG luu cache, KHONG chay nen: chi tinh khi nguoi dung bam "Tải số liệu" (GET). Mo cho moi nhan vien van phong (chan KTV / Ve tinh),
// cung tap voi "Báo cáo tốc độ xử lý".
const baoCaoKpi = new Hono<{ Bindings: Env }>();
baoCaoKpi.use("*", verifySessionMiddleware, loadUser);
baoCaoKpi.use("*", async (c, next) => {
  const user = c.get("user");
  if (user.vai_tro !== "Admin" && (user.la_ktv_dvbh || user.la_ve_tinh)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});

export const MUC_TIEU_THIEU: Record<string, number> = { MB: 0.015, MN: 0.02 };
export const MUC_TIEU_TOC_DO_GIO = 24;
export const MUC_TIEU_TOC_DO_GIO_LV = 8;
const TRANG_THAI_HUY = ["Da huy", "TN tu choi", "Tu choi"];
const KHO_XUAT_STATES = ["Dang gui KTV", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"];
const HOAN_TAT_STATES = ["KTV da nhan", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"];

type LoaiThieu = "B2B" | "Khách quan" | "Có đơn thiếu" | "Có đơn thiếu - Đã về hàng" | "Bình thường";

/** Tuan kieu Excel WEEKNUM(ngay) mac dinh (tuan bat dau Chu nhat, tuan 1 chua ngay 1/1) — khop file bao cao cu ("w44"). */
export function tuanExcel(ngay: string): string {
  const d = new Date(ngay.slice(0, 10) + "T00:00:00Z");
  const dau = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const doy = Math.round((d.getTime() - dau.getTime()) / 86_400_000);
  return "w" + String(Math.floor((doy + dau.getUTCDay()) / 7) + 1).padStart(2, "0");
}

function mienCuaKhuVuc(kv: string | null): string {
  if (!kv) return "Khác";
  if (kv.includes("MB")) return "MB";
  if (kv.includes("MN")) return "MN";
  return "Khác";
}

function gioGiua(tu: string | null, den: string | null): number | null {
  if (!tu || !den) return null;
  return Math.round(((parseGioVn(den).getTime() - parseGioVn(tu).getTime()) / 3_600_000) * 100) / 100;
}
function gioLv(tu: string | null, den: string | null): number | null {
  if (!tu || !den) return null;
  return Math.round(gioLamViecGiua(parseGioVn(tu), parseGioVn(den)) * 100) / 100;
}

function thangRange(thang: string): { tu: string; den: string } {
  const [y, m] = thang.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { tu: `${thang}-01`, den: `${next}-01` };
}

interface DonRaw {
  id: string;
  phieu_dat_id: string;
  loai_don: string;
  ma_lk: string;
  ten_lk: string | null;
  loai_de_xuat: string | null;
  sl: number;
  nguoi_tao: string;
  ngay_tao: string;
  khu_vuc: string | null;
  trang_thai: string | null;
  ma_xuat_kho: string | null;
  ma_yeu_cau_su_co: string | null;
  ma_lada: string | null;
  nhom_lk: string | null;
  tlk_id: string | null;
  tlk_trang_thai: string | null;
  tlk_ly_do: string | null;
  tlk_hang_ve: string | null;
  pxk_ngay_tao: string | null;
  pxk_kho_xuat: string | null;
  pxk_hoan_tat: string | null;
}

interface PxkRaw {
  id: string;
  ma_xuat_kho: string;
  nguoi_tao: string;
  ngay_tao: string;
  khu_vuc: string | null;
  mien_xuat: string | null;
  loai_don: string | null;
  trang_thai: string | null;
  chot: string | null;
  kho_xuat: string | null;
}

// GET /?thang=YYYY-MM&gom_huy=1 — gom_huy=1: tinh ca don huy / tu choi vao ty le thieu hang (giong file Excel cu).
baoCaoKpi.get("/", async (c) => {
  const thang = /^\d{4}-\d{2}$/.test(c.req.query("thang") ?? "") ? c.req.query("thang")! : nowVN().slice(0, 7);
  const gomHuy = c.req.query("gom_huy") === "1";
  const { tu, den } = thangRange(thang);
  const now = nowVN();
  const db = c.env.DB;
  const khoJson = JSON.stringify(KHO_XUAT_STATES);
  const xongJson = JSON.stringify(HOAN_TAT_STATES);

  // Don mua / cong no tao trong thang (khong tinh don tra hang). Ticket thieu LK = ticket MOI NHAT cua don (khop VLOOKUP file cu).
  const donRows = (
    await db
      .prepare(
        `WITH d AS (
           SELECT d.id, d.phieu_dat_id, d.loai_don, d.ma_lk, d.ten_lk_snapshot AS ten_lk, d.loai_de_xuat,
                  COALESCE(d.so_luong_thuc_xuat, d.so_luong_de_xuat) AS sl, d.nguoi_tao, d.ngay_tao,
                  COALESCE(d.khu_vuc_chon, d.khu_vuc_ma) AS khu_vuc, d.trang_thai_hien_tai AS trang_thai, d.ma_xuat_kho,
                  d.ma_yeu_cau_su_co, d.ma_lada, lk.nhom_lk,
                  (SELECT t.id FROM thieu_lk t WHERE t.dat_don_hang_id = d.id ORDER BY t.ngay_tao DESC, t.id DESC LIMIT 1) AS tlk_id
           FROM dat_don_hang d LEFT JOIN linh_kien lk ON lk.ma_linh_kien = d.ma_lk
           WHERE d.ngay_tao >= ? AND d.ngay_tao < ? AND d.loai_don IN ('mua', 'cong_no')
         )
         SELECT d.*,
           (SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = d.tlk_id ORDER BY l.id DESC LIMIT 1) AS tlk_trang_thai,
           (SELECT s.ten_ly_do FROM thieu_lk t JOIN settings_ly_do_cham s ON s.id = t.ly_do_cham_id WHERE t.id = d.tlk_id) AS tlk_ly_do,
           (SELECT t.ngay_hang_ve_thuc_te FROM thieu_lk t WHERE t.id = d.tlk_id) AS tlk_hang_ve,
           p.ngay_tao AS pxk_ngay_tao,
           (SELECT MIN(l.ngay_xu_ly) FROM phieu_xuat_kho_log l WHERE l.phieu_xuat_kho_id = p.id AND l.trang_thai IN (SELECT value FROM json_each(?))) AS pxk_kho_xuat,
           (SELECT MIN(l.ngay_xu_ly) FROM phieu_xuat_kho_log l WHERE l.phieu_xuat_kho_id = p.id AND l.trang_thai IN (SELECT value FROM json_each(?))) AS pxk_hoan_tat
         FROM d LEFT JOIN phieu_xuat_kho p ON p.ma_xuat_kho = d.ma_xuat_kho
         ORDER BY d.ngay_tao`,
      )
      .bind(tu, den, khoJson, xongJson)
      .all<DonRaw>()
  ).results ?? [];

  const pxkRows = (
    await db
      .prepare(
        `SELECT p.id, p.ma_xuat_kho, p.nguoi_tao, p.ngay_tao, COALESCE(p.khu_vuc_chon, p.khu_vuc_ma) AS khu_vuc, p.mien_xuat,
                p.loai_don, p.trang_thai_hien_tai AS trang_thai, p.chot_ke_toan_luc AS chot,
                (SELECT MIN(l.ngay_xu_ly) FROM phieu_xuat_kho_log l WHERE l.phieu_xuat_kho_id = p.id AND l.trang_thai IN (SELECT value FROM json_each(?))) AS kho_xuat
         FROM phieu_xuat_kho p WHERE p.ngay_tao >= ? AND p.ngay_tao < ? ORDER BY p.ngay_tao`,
      )
      .bind(khoJson, tu, den)
      .all<PxkRaw>()
  ).results ?? [];

  const ten = await tenNguoiMap(db, [...new Set([...donRows.map((r) => r.nguoi_tao), ...pxkRows.map((r) => r.nguoi_tao)])]);

  // ---- 1) Ty le thieu hang ----
  const chiTietDon = donRows.map((r) => {
    const huy = TRANG_THAI_HUY.includes(r.trang_thai ?? "");
    let loai: LoaiThieu;
    if (!r.tlk_id) loai = "Bình thường";
    else if ((r.nhom_lk ?? "").toLowerCase() === "b2b") loai = "B2B";
    else if (r.tlk_ly_do === "Do nhà máy hết hàng") loai = "Khách quan";
    else if (r.tlk_trang_thai === "Da ket thuc" || r.tlk_trang_thai === "Kho xac nhan hang da ve" || r.tlk_hang_ve || r.ma_xuat_kho) loai = "Có đơn thiếu - Đã về hàng";
    else loai = "Có đơn thiếu";
    const mocCuoi = huy ? null : (r.pxk_hoan_tat ?? null);
    return {
      id: r.id,
      phieu_dat_id: r.phieu_dat_id,
      tuan: tuanExcel(r.ngay_tao),
      mien: mienCuaKhuVuc(r.khu_vuc),
      khu_vuc: r.khu_vuc,
      loai_don: r.loai_don,
      ma_lk: r.ma_lk,
      ten_lk: r.ten_lk,
      nhom_lk: r.nhom_lk,
      loai_de_xuat: r.loai_de_xuat,
      sl: r.sl ?? 0,
      nguoi_tao: ten.get(r.nguoi_tao) ?? r.nguoi_tao,
      ngay_tao: r.ngay_tao,
      trang_thai: r.trang_thai,
      da_huy: huy,
      loai_thieu: loai,
      tlk_id: r.tlk_id,
      tlk_trang_thai: r.tlk_trang_thai,
      tlk_ly_do: r.tlk_ly_do,
      ma_xuat_kho: r.ma_xuat_kho,
      ma_yeu_cau_su_co: r.ma_yeu_cau_su_co,
      ma_lada: r.ma_lada,
      pxk_ngay_tao: r.pxk_ngay_tao,
      kho_xuat_luc: r.pxk_kho_xuat,
      hoan_tat_luc: mocCuoi,
      gio_den_kho_xuat: huy ? null : gioGiua(r.ngay_tao, r.pxk_kho_xuat),
      gio_xu_ly: huy ? null : gioGiua(r.ngay_tao, mocCuoi ?? now),
    };
  });

  type ThieuAgg = { mien: string; tuan: string; b2b: number; khach_quan: number; thieu: number; binh_thuong: number; da_ve: number; so_don_thieu: number; so_don: number };
  const thieuMap = new Map<string, ThieuAgg>();
  for (const r of chiTietDon) {
    if (r.da_huy && !gomHuy) continue;
    const k = `${r.mien}|${r.tuan}`;
    const a = thieuMap.get(k) ?? { mien: r.mien, tuan: r.tuan, b2b: 0, khach_quan: 0, thieu: 0, binh_thuong: 0, da_ve: 0, so_don_thieu: 0, so_don: 0 };
    a.so_don++;
    if (r.loai_thieu === "B2B") a.b2b += r.sl;
    else if (r.loai_thieu === "Khách quan") a.khach_quan += r.sl;
    else if (r.loai_thieu === "Có đơn thiếu") { a.thieu += r.sl; a.so_don_thieu++; }
    else if (r.loai_thieu === "Có đơn thiếu - Đã về hàng") a.da_ve += r.sl;
    else a.binh_thuong += r.sl;
    thieuMap.set(k, a);
  }
  const thieuHang = [...thieuMap.values()].sort((a, b) => a.mien.localeCompare(b.mien) || a.tuan.localeCompare(b.tuan));

  // ---- 2) Toc do Kho xu ly PXK ----
  const chiTietPxk = pxkRows.map((p) => {
    const mien = p.mien_xuat === "bac" ? "MB" : p.mien_xuat === "nam" ? "MN" : mienCuaKhuVuc(p.khu_vuc);
    const gio = gioGiua(p.chot, p.kho_xuat ?? (p.chot ? now : null));
    const gioLamViec = gioLv(p.chot, p.kho_xuat ?? (p.chot ? now : null));
    // Chua chot -> khong xet. Da chot, chua xuat, con trong 24h -> "Đang xử lý" (khong tinh mau so). Qua 24h chua xuat -> khong dat.
    let ket_qua: "Đạt" | "Không đạt" | "Đang xử lý" | "Chưa chốt";
    if (!p.chot) ket_qua = "Chưa chốt";
    else if (!p.kho_xuat && (gio ?? 0) <= MUC_TIEU_TOC_DO_GIO) ket_qua = "Đang xử lý";
    else ket_qua = (gio ?? 0) <= MUC_TIEU_TOC_DO_GIO ? "Đạt" : "Không đạt";
    const dat_lv = p.chot && (p.kho_xuat || (gioLamViec ?? 0) > MUC_TIEU_TOC_DO_GIO_LV) ? (gioLamViec ?? 0) <= MUC_TIEU_TOC_DO_GIO_LV : null;
    return {
      ma_xuat_kho: p.ma_xuat_kho,
      tuan: tuanExcel(p.ngay_tao),
      mien,
      khu_vuc: p.khu_vuc,
      loai_don: p.loai_don,
      nguoi_tao: ten.get(p.nguoi_tao) ?? p.nguoi_tao,
      ngay_tao: p.ngay_tao,
      trang_thai: p.trang_thai,
      chot_ke_toan_luc: p.chot,
      kho_xuat_luc: p.kho_xuat,
      gio_kho_xu_ly: gio,
      gio_lam_viec: gioLamViec,
      ket_qua,
      dat_8h_lv: dat_lv,
    };
  });

  type TocDoAgg = { mien: string; tuan: string; dat: number; khong_dat: number; dang_xu_ly: number; dat_lv: number; xet_lv: number; tong_gio: number; tong_gio_lv: number; so_da_xuat: number };
  const tocDoMap = new Map<string, TocDoAgg>();
  for (const p of chiTietPxk) {
    if (p.ket_qua === "Chưa chốt") continue;
    const k = `${p.mien}|${p.tuan}`;
    const a = tocDoMap.get(k) ?? { mien: p.mien, tuan: p.tuan, dat: 0, khong_dat: 0, dang_xu_ly: 0, dat_lv: 0, xet_lv: 0, tong_gio: 0, tong_gio_lv: 0, so_da_xuat: 0 };
    if (p.ket_qua === "Đạt") a.dat++;
    else if (p.ket_qua === "Không đạt") a.khong_dat++;
    else a.dang_xu_ly++;
    if (p.dat_8h_lv !== null) { a.xet_lv++; if (p.dat_8h_lv) a.dat_lv++; }
    if (p.kho_xuat_luc) { a.so_da_xuat++; a.tong_gio += p.gio_kho_xu_ly ?? 0; a.tong_gio_lv += p.gio_lam_viec ?? 0; }
    tocDoMap.set(k, a);
  }
  const tocDoKho = [...tocDoMap.values()].sort((a, b) => a.mien.localeCompare(b.mien) || a.tuan.localeCompare(b.tuan));

  // ---- 3) Don co Ma yeu cau su co / Ma Lada (bo don huy) ----
  // Gia tri rac nguoi dung go cho co ("Ko", "k", "0", "-", "không"...) coi nhu KHONG co ma.
  const coMa = (v: string | null) => {
    const s = (v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
    return s.length > 0 && !/^(k|ko|khong|kco|0|-+|\.+|x|n\/?a|none|chua co)$/.test(s);
  };
  const maSuCo = chiTietDon.filter((r) => !r.da_huy && (coMa(r.ma_yeu_cau_su_co) || coMa(r.ma_lada)));

  return c.json({
    thang,
    gom_huy: gomHuy,
    cap_nhat_luc: now,
    muc_tieu: { thieu: MUC_TIEU_THIEU, toc_do_gio: MUC_TIEU_TOC_DO_GIO, toc_do_gio_lv: MUC_TIEU_TOC_DO_GIO_LV },
    thieu_hang: thieuHang,
    toc_do_kho: tocDoKho,
    chi_tiet_don: chiTietDon,
    chi_tiet_pxk: chiTietPxk,
    ma_su_co: maSuCo,
  });
});

export default baoCaoKpi;
