import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { tenNguoiMap } from "../lib/tenNguoi";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import {
  STAGE_DEFS,
  computeAllStageInstances,
  resolveKyRange,
  currentKy,
  aggregateByAccount,
  filterInstances,
  countDangCho,
  type StageFilter,
} from "../lib/slaMetrics";

// Bao cao "Toc do xu ly" (SLA theo tai khoan x giai doan quy trinh) - xem lib/slaMetrics.ts cho
// thuat toan tinh toan, plan da duyet cho quyet dinh pham vi/UI. KHAC MOI router khac cua module
// "Dat mua linh kien" - KHONG dung requireDatMuaLkArea (middleware do cho ca TN/Kho/Ke toan/QC/GS/
// KTV vao, nhung bao cao nay CHI danh cho Admin + View, xac nhan rieng voi nguoi dung 04/09/2026: "vì
// dữ liệu này ảnh hưởng đánh giá nhân sự, không mở cho các vai trò xử lý tự xem lẫn nhau") - tu gate
// rieng ngay duoi day.
const baoCaoTocDoXuLy = new Hono<{ Bindings: Env }>();
baoCaoTocDoXuLy.use("*", verifySessionMiddleware, loadUser);
baoCaoTocDoXuLy.use("*", async (c, next) => {
  const user = c.get("user");
  if (user.vai_tro !== "Admin" && !user.la_view) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});

baoCaoTocDoXuLy.get("/giai-doan", (c) => {
  return c.json({ giai_doan: STAGE_DEFS.map((s) => ({ key: s.key, label: s.label, luong: s.luong, noi_bo: s.noiBo, ghi_chu: s.ghiChu ?? null })) });
});

/** "View" chi xem theo Khu vuc duoc gan (user_khu_vuc) - dung y giong khuVucViewEmailInSql() nhung
 * tra ve 1 Set email de loc TRUC TIEP tren StageInstance.ktvEmail (da tinh san trong bo nho, khong
 * con Context/alias SQL nhu cac scope khac cua module nay nen khong tai su dung duoc thang ham co
 * san trong scopeDatMua.ts). Admin truyen "khu_vuc" (danh sach ma, phan cach dau phay) de LOC THEM
 * (khong bat buoc) - Admin khong truyen gi -> khong gioi han (tra null).
 */
async function resolveScopeEmails(
  db: D1Database,
  user: { email: string; vai_tro: string | null; la_view: boolean },
  khuVucParam: string | undefined,
): Promise<Set<string> | null> {
  let maSet: Set<string> | null = null;
  if (user.la_view && user.vai_tro !== "Admin") {
    const rows = await db.prepare("SELECT khu_vuc_ma FROM user_khu_vuc WHERE user_email = ?").bind(user.email).all<{ khu_vuc_ma: string }>();
    // Chua gan Khu vuc nao -> xem tat ca (chot 2026-10-15), nhu Admin.
    if ((rows.results ?? []).length > 0) maSet = new Set((rows.results ?? []).map((r) => r.khu_vuc_ma));
  }
  if (khuVucParam) {
    const requested = new Set(khuVucParam.split(",").map((s) => s.trim()).filter(Boolean));
    maSet = maSet ? new Set([...maSet].filter((m) => requested.has(m))) : requested;
  }
  if (maSet === null) return null;
  if (maSet.size === 0) return new Set();
  const placeholders = [...maSet].map(() => "?").join(",");
  const rows = await db
    .prepare(`SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL AND khu_vuc_ma IN (${placeholders})`)
    .bind(...maSet)
    .all<{ email_dang_nhap: string }>();
  return new Set((rows.results ?? []).map((r) => r.email_dang_nhap));
}

/** "loai_de_xuat" (option cu the) hoac "nhom_id" (ca nhom - resolve sang danh sach ten_option) - co
 * ca 2 thi giao (AND), khong truyen gi thi khong loc (null). */
async function resolveLoaiDeXuatOptions(db: D1Database, loaiDeXuat: string | undefined, nhomId: string | undefined): Promise<Set<string> | null> {
  if (!loaiDeXuat && !nhomId) return null;
  if (loaiDeXuat) return new Set([loaiDeXuat]);
  const rows = await db.prepare("SELECT ten_option FROM settings_loai_de_xuat WHERE nhom_id = ?").bind(Number(nhomId)).all<{ ten_option: string }>();
  return new Set((rows.results ?? []).map((r) => r.ten_option));
}

baoCaoTocDoXuLy.get("/xep-hang", async (c) => {
  const user = c.get("user");
  const giaiDoan = c.req.query("giai_doan");
  if (!giaiDoan || !STAGE_DEFS.some((s) => s.key === giaiDoan)) return c.json({ error: "INVALID_GIAI_DOAN" }, 400);
  const kyLoai = c.req.query("ky_loai") === "tuan" ? "tuan" : "thang";
  const ky = c.req.query("ky") || currentKy(kyLoai);
  const khuVuc = c.req.query("khu_vuc")?.trim() || undefined;
  const loaiDeXuat = c.req.query("loai_de_xuat")?.trim() || undefined;
  const nhomId = c.req.query("nhom_id")?.trim() || undefined;

  const scopeEmails = await resolveScopeEmails(c.env.DB, user, khuVuc);
  const loaiDeXuatOptions = await resolveLoaiDeXuatOptions(c.env.DB, loaiDeXuat, nhomId);
  const filter: StageFilter = { scopeEmails, loaiDeXuatOptions };

  const scopeKeyPart = scopeEmails === null ? "all" : [...scopeEmails].sort().join(",");
  const key = buildReportKey(
    "bao-cao-toc-do/xep-hang",
    { giai_doan: giaiDoan, ky_loai: kyLoai, ky, khu_vuc: khuVuc, loai_de_xuat: loaiDeXuat, nhom_id: nhomId },
    [scopeKeyPart],
  );

  const result = await cachedReport(c.env.DB, key, ["dat_mua_lk"], async () => {
    const range = resolveKyRange(kyLoai, ky);
    const prevRange = resolveKyRange(kyLoai, range.prevKy);
    const [all, dangCho] = await Promise.all([computeAllStageInstances(c.env.DB), countDangCho(c.env.DB, giaiDoan, filter)]);

    const inKy = filterInstances(all, giaiDoan, range, filter);
    const inPrevKy = filterInstances(all, giaiDoan, prevRange, filter);
    const rows = aggregateByAccount(inKy, inPrevKy);

    if (rows.length > 0) {
      // Ten theo thu tu chung (lib/tenNguoi.ts); 1 bind JSON thay vi 1 "?" moi nguoi (gioi han 100 tham so D1).
      const tenByEmail = await tenNguoiMap(c.env.DB, rows.map((r) => r.email));
      for (const r of rows) r.ten = tenByEmail.get(r.email) ?? null;
    }
    rows.sort((a, b) => (b.da_xu_ly + b.tu_choi) - (a.da_xu_ly + a.tu_choi));

    return { giai_doan: giaiDoan, ky_loai: kyLoai, ky, dang_cho: dangCho, rows };
  });

  return c.json(result);
});

export default baoCaoTocDoXuLy;
