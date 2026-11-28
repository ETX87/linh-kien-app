import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { tenNguoiMap } from "../lib/tenNguoi";
import { buildReportKey, getVnDateStr } from "../lib/reportCache";
import { nowVN } from "../lib/vnTime";
import { docCauHinh } from "../lib/viPham";
import {
  STAGE_DEFS,
  STAGE_SLA_MA,
  computeAllStageInstances,
  resolveKyRange,
  currentKy,
  aggregateByAccount,
  filterInstances,
  countDangCho,
  type StageFilter,
  type AccountRow,
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
  // MO cho MOI nhan vien van phong (chot 2026-10-17, "show báo cáo tốc độ xử lý cho tất cả nhân viên văn phòng" - GHI DE chot
  // 04/09/2026 chi Admin + View): chan rieng KTV/Ve tinh. Pham vi: View theo Khu vuc duoc gan (resolveScopeEmails), con lai xem het.
  if (user.vai_tro !== "Admin" && (user.la_ktv_dvbh || user.la_ve_tinh)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});

// v1.579: kem SLA (gio lam viec) cua tung giai doan doc song tu sla_buoc (Admin sua o man Vi pham/SLA) - FE so TB gio voi SLA -> Dat / Khong dat.
baoCaoTocDoXuLy.get("/giai-doan", async (c) => {
  const cauHinh = await docCauHinh(c.env.DB);
  return c.json({
    giai_doan: STAGE_DEFS.map((s) => {
      const sla = STAGE_SLA_MA[s.key] ? cauHinh.get(STAGE_SLA_MA[s.key]) : undefined;
      return {
        key: s.key,
        label: s.label,
        luong: s.luong,
        noi_bo: s.noiBo,
        ghi_chu: s.ghiChu ?? null,
        sla_gio: sla ? sla.so_gio : null,
        sla_bat: sla ? sla.bat_tat === 1 : false,
        sla_gio_lich: sla ? sla.tinh_cuoi_tuan === 1 : false,
      };
    }),
  });
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
  const rows = await db
    .prepare("SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL AND khu_vuc_ma IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify([...maSet]))
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

// LUU 1 BAN / NGAY (chot 2026-11-07, v1.447 — "1 ngày chỉ load 1 lần lúc người đầu tiên xem và lưu vào D1, sau này ai xem thì trả về
// dữ liệu có sẵn. ai ấn đồng bộ thì mới load mới và thay thế cho dữ liệu cũ"): truoc day /xep-hang boc cachedReport theo version
// "dat_mua_lk" (doi moi lan co don thay doi) -> gan nhu MOI lan xem deu tinh lai, va moi giai doan 1 request = doc toan bo 4 bang log
// x 14 lan. Gio: 1 lan tinh cho CA 14 giai doan (doc log 1 lan), luu vao precomputed_cache theo bo loc + pham vi + NGAY VN; cung ngay
// thi tra ban da luu (1 SELECT theo khoa), ?dong_bo=1 thi tinh lai va ghi de.
interface TongHopGiaiDoan {
  dang_cho: number;
  rows: AccountRow[];
}
interface TongHop {
  ky_loai: "thang" | "tuan";
  ky: string;
  cap_nhat_luc: string;
  cap_nhat_boi: string;
  giai_doan: Record<string, TongHopGiaiDoan>;
}

async function docTongHop(c: Context<{ Bindings: Env }>, dongBo: boolean): Promise<TongHop> {
  const user = c.get("user");
  const kyLoai = c.req.query("ky_loai") === "tuan" ? "tuan" : "thang";
  const ky = c.req.query("ky") || currentKy(kyLoai);
  const khuVuc = c.req.query("khu_vuc")?.trim() || undefined;
  const loaiDeXuat = c.req.query("loai_de_xuat")?.trim() || undefined;
  const nhomId = c.req.query("nhom_id")?.trim() || undefined;

  const scopeEmails = await resolveScopeEmails(c.env.DB, user, khuVuc);
  const loaiDeXuatOptions = await resolveLoaiDeXuatOptions(c.env.DB, loaiDeXuat, nhomId);
  const filter: StageFilter = { scopeEmails, loaiDeXuatOptions };
  const scopeKeyPart = scopeEmails === null ? "all" : [...scopeEmails].sort().join(",");
  const key = buildReportKey("bao-cao-toc-do/tong-hop-v2" /* v1.551: gio lam viec */, { ky_loai: kyLoai, ky, khu_vuc: khuVuc, loai_de_xuat: loaiDeXuat, nhom_id: nhomId }, [scopeKeyPart]);
  const ngay = getVnDateStr();

  if (!dongBo) {
    const row = await c.env.DB.prepare("SELECT payload FROM precomputed_cache WHERE key = ?").bind(key).first<{ payload: string }>();
    if (row) {
      const env = JSON.parse(row.payload) as { ngay: string; data: TongHop };
      if (env.ngay === ngay) return env.data;
    }
  }

  const range = resolveKyRange(kyLoai, ky);
  const prevRange = resolveKyRange(kyLoai, range.prevKy);
  const all = await computeAllStageInstances(c.env.DB);
  const giaiDoan: Record<string, TongHopGiaiDoan> = {};
  const moiEmail = new Set<string>();
  for (const s of STAGE_DEFS) {
    const rows = aggregateByAccount(filterInstances(all, s.key, range, filter), filterInstances(all, s.key, prevRange, filter));
    rows.sort((a, b) => (b.da_xu_ly + b.tu_choi) - (a.da_xu_ly + a.tu_choi));
    for (const r of rows) moiEmail.add(r.email);
    giaiDoan[s.key] = { dang_cho: await countDangCho(c.env.DB, s.key, filter), rows };
  }
  if (moiEmail.size > 0) {
    // Ten theo thu tu chung (lib/tenNguoi.ts); 1 bind JSON thay vi 1 "?" moi nguoi (gioi han 100 tham so D1).
    const tenByEmail = await tenNguoiMap(c.env.DB, [...moiEmail]);
    for (const g of Object.values(giaiDoan)) for (const r of g.rows) r.ten = tenByEmail.get(r.email) ?? null;
  }
  const data: TongHop = { ky_loai: kyLoai, ky, cap_nhat_luc: nowVN(), cap_nhat_boi: user.email, giai_doan: giaiDoan };
  await c.env.DB.prepare(
    `INSERT INTO precomputed_cache (key, payload, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  )
    .bind(key, JSON.stringify({ ngay, data }))
    .run();
  return data;
}

// GET /tong-hop?ky_loai=&ky=&khu_vuc=&nhom_id=&dong_bo=1 — ca 14 giai doan trong 1 lan goi.
baoCaoTocDoXuLy.get("/tong-hop", async (c) => {
  return c.json(await docTongHop(c, c.req.query("dong_bo") === "1"));
});

// GET /xep-hang?giai_doan= — giu cho tab cu (truoc v1.447), doc tu CUNG ban luu theo ngay.
baoCaoTocDoXuLy.get("/xep-hang", async (c) => {
  const giaiDoan = c.req.query("giai_doan");
  if (!giaiDoan || !STAGE_DEFS.some((s) => s.key === giaiDoan)) return c.json({ error: "INVALID_GIAI_DOAN" }, 400);
  const th = await docTongHop(c, false);
  const g = th.giai_doan[giaiDoan] ?? { dang_cho: 0, rows: [] };
  return c.json({ giai_doan: giaiDoan, ky_loai: th.ky_loai, ky: th.ky, dang_cho: g.dang_cho, rows: g.rows });
});

export default baoCaoTocDoXuLy;
