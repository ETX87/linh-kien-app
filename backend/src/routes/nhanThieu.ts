// KTV BAO NHAN THIEU / KHONG NHAN DUOC HANG (chot 2026-10-12, migration 0075). Luong RIENG, khong dung ticket thieu_lk (bang
// do gan voi don "Cho hang"):
//   KTV (hoac TN/Admin bao ho) bao tren PXK "Dang gui KTV": SL thuc nhan tung dong + ly do + anh -> ticket "Cho kho kiem tra"
//   (PXK giu "Dang gui KTV", khong tu xac nhan, KTV khong bam "Da nhan" duoc).
//   Kho: Tu choi (ghi chu) -> ticket dong, PXK cho KTV xac nhan lai (han tu xac nhan +10 ngay) | Xac nhan thieu (chinh SL neu
//   can) + chon phuong an Gui bu / Hoan tien -> PXK "KTV da nhan", ticket "Cho ke toan".
//   Ke toan (da can doi phieu tren MISA theo SL thuc nhan): SL thuc xuat cua don goc = SL thuc nhan (file MISA/cong no/ton kho
//   KTV tu theo) roi: Hoan tien -> tong phieu giam phan thieu, canBangPxk hoan ve quy nguoi nhan hang (tu tru phieu dang cho);
//   Gui bu -> tao don gui bu (SL thieu, gia chot = don gia don goc, mang theo tien da tra) + phieu gui bu "Dang tao phieu" cho TN.
// Tu xac nhan sau 10 ngay + nhac hang ngay: tuXacNhanVaNhacPxk() (goi tu cron index.ts).
import { khoaQuy } from "../lib/quyKhoa";
import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { nowVN } from "../lib/vnTime";
import { nextSequentialId } from "../lib/idCounter";
import { bumpVersions } from "../lib/dataVersions";
import { nhanAnhTaiLen, laUrlAnhDrive } from "../lib/anhUpload";
import { scopePxkNguoiNhanHang } from "../lib/scopeDatMua";
import { notifyWorkflowTask, emailsForRoleOrQC, emailGsListForPxk } from "../lib/taskNotify";
import { laTruCongNo, tinhToanPxk, taiTinhPxk } from "../lib/pxkRecalculate";
import { canBangPxk, lenhKhoaDaThanhToan, lenhNhanTienDaTraDon } from "../lib/quyKtv";
import { sendPushToUser } from "../lib/webPush";

const nhanThieu = new Hono<{ Bindings: Env }>();
nhanThieu.use("*", verifySessionMiddleware, loadUser, requireDatMuaLkArea);

type C = Context<{ Bindings: Env }>;

export const LY_DO_NHAN_THIEU: Record<string, string> = {
  thieu_sl: "Thiếu số lượng",
  khong_nhan: "Không nhận được hàng",
  sai_hong: "Sai mã / hàng hỏng",
  khac: "Khác",
};
const TRANG_THAI_MO = ["Cho kho kiem tra", "Cho ke toan"];
const MAX_ANH = 5;
const SO_NGAY_TU_NHAN = 10;
const tien = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

const laAdmin = (c: C) => c.get("user").vai_tro === "Admin";
const canKho = (c: C) => !!c.get("user").la_kho || laAdmin(c);
const canKeToan = (c: C) => !!c.get("user").la_ke_toan || laAdmin(c);
const canTacNghiep = (c: C) => !!c.get("user").la_tac_nghiep || laAdmin(c);

interface PxkRow {
  id: string;
  trang_thai_hien_tai: string | null;
  nguoi_nhan_hang: string | null;
  loai_don: string | null;
  version: number;
  so_tien_can_chuyen: number | null;
  da_thanh_toan: number | null;
  mien_xuat: string | null;
  khu_vuc_chon: string | null;
  han_tu_nhan: string | null;
  quy_kh: number; // phieu KH chuyen khoan (migration 0111) - phieu gui bu + don gui bu giu CUNG quy
}
async function docPxk(db: D1Database, id: string): Promise<PxkRow | null> {
  return db
    .prepare(
      `SELECT id, trang_thai_hien_tai, nguoi_nhan_hang, loai_don, version, so_tien_can_chuyen, da_thanh_toan, mien_xuat, khu_vuc_chon, han_tu_nhan, COALESCE(quy_kh, 0) AS quy_kh
       FROM phieu_xuat_kho WHERE id = ?`,
    )
    .bind(id)
    .first<PxkRow>();
}

/** PXK co nam trong pham vi xem cua nguoi dung (cung scope danh sach PXK). */
async function xemDuocPxk(c: C, pxkId: string): Promise<boolean> {
  const scope = scopePxkNguoiNhanHang(c);
  const row = await c.env.DB.prepare(`SELECT 1 as ok FROM phieu_xuat_kho pxk WHERE pxk.id = ?${scope?.whereSql ?? ""}`)
    .bind(pxkId, ...(scope?.binds ?? []))
    .first<{ ok: number }>();
  return !!row;
}

interface DongPxk {
  id: string;
  ma_lk: string;
  ten_lk_snapshot: string | null;
  loai_don: string;
  loai_de_xuat: string | null;
  so_luong_de_xuat: number;
  so_luong_thuc_xuat: number | null;
  so_tien_cong_no: number | null;
  gia_chot: number | null;
}
async function docDongPxk(db: D1Database, pxkId: string): Promise<DongPxk[]> {
  const { results } = await db
    .prepare(
      `SELECT ddh.id, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.loai_don, ddh.loai_de_xuat, ddh.so_luong_de_xuat, ddh.so_luong_thuc_xuat,
              ddh.so_tien_cong_no, ddh.gia_chot
       FROM phieu_xuat_kho_dong d JOIN dat_don_hang ddh ON ddh.id = d.dat_don_hang_id
       WHERE d.phieu_xuat_kho_id = ? ORDER BY ddh.id`,
    )
    .bind(pxkId)
    .all<DongPxk>();
  return results;
}
const slXuat = (d: { so_luong_thuc_xuat: number | null; so_luong_de_xuat: number }) => d.so_luong_thuc_xuat ?? d.so_luong_de_xuat;

/** Dong co tien KTV da tra (Mua / TRU CONG NO trong phieu can chuyen tien). */
const laDongCoTien = (pxk: PxkRow, d: DongPxk) => pxk.so_tien_can_chuyen != null && (d.loai_don === "mua" || laTruCongNo(d.loai_de_xuat));

/** Don gia THUC TRA tung dong co tien = tien dong (tinhToanPxk) quy theo tong phieu that (so_tien_can_chuyen - phieu co the da
 * sua tong / gia da doi tu luc chot), chia SL thuc xuat, lam tron dong. */
async function donGiaThucTra(db: D1Database, pxk: PxkRow, dong: DongPxk[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (pxk.so_tien_can_chuyen == null) return out;
  const tinh = await tinhToanPxk(db, dong.map((d) => d.id));
  const tongTinh = dong.filter((d) => laDongCoTien(pxk, d)).reduce((s, d) => s + (tinh.tienUocTinhTheoDong.get(d.id) ?? 0), 0);
  const heSo = tongTinh > 0 ? Math.max(0, pxk.so_tien_can_chuyen) / tongTinh : 0;
  for (const d of dong) {
    if (!laDongCoTien(pxk, d) || slXuat(d) <= 0) continue;
    out.set(d.id, Math.round(((tinh.tienUocTinhTheoDong.get(d.id) ?? 0) * heSo) / slXuat(d)));
  }
  return out;
}

interface DongTicket {
  dat_don_hang_id: string;
  so_luong_xuat: number;
  so_luong_ktv_bao: number;
  so_luong_xac_nhan: number | null;
  so_tien_thieu: number | null;
  don_gui_bu_id: string | null;
}

async function chiTietTicket(db: D1Database, id: string) {
  const t = await db.prepare("SELECT * FROM nhan_thieu WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!t) return null;
  const { results: dong } = await db
    .prepare(
      `SELECT n.*, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.loai_don, ddh.loai_de_xuat
       FROM nhan_thieu_dong n JOIN dat_don_hang ddh ON ddh.id = n.dat_don_hang_id WHERE n.nhan_thieu_id = ? ORDER BY n.dat_don_hang_id`,
    )
    .bind(id)
    .all();
  const { results: log } = await db.prepare("SELECT * FROM nhan_thieu_log WHERE nhan_thieu_id = ? ORDER BY id DESC").bind(id).all();
  let anh: string[] = [];
  try {
    anh = JSON.parse(String(t.anh ?? "[]"));
  } catch {
    anh = [];
  }
  return { ...t, trang_thai: String(t.trang_thai), anh, dong, log };
}

// GET /api/nhan-thieu/pxk/:pxkId - moi ticket cua 1 PXK (moi nhat truoc) + goi y tien phan thieu cho ticket "Cho ke toan".
nhanThieu.get("/pxk/:pxkId", async (c) => {
  const pxkId = c.req.param("pxkId");
  if (!(await xemDuocPxk(c, pxkId))) return c.json({ error: "NOT_FOUND" }, 404);
  const pxk = (await docPxk(c.env.DB, pxkId))!;
  const { results: ids } = await c.env.DB.prepare("SELECT id FROM nhan_thieu WHERE phieu_xuat_kho_id = ? ORDER BY ngay_bao DESC, id DESC")
    .bind(pxkId)
    .all<{ id: string }>();
  const tickets = [];
  for (const { id } of ids) tickets.push(await chiTietTicket(c.env.DB, id));
  const choKeToan = tickets.find((t) => t && t.trang_thai === "Cho ke toan");
  let goiY: { don_gia: Record<string, number>; tran_tien: number } | null = null;
  if (choKeToan) {
    const donGia = await donGiaThucTra(c.env.DB, pxk, await docDongPxk(c.env.DB, pxkId));
    goiY = {
      don_gia: Object.fromEntries(donGia),
      tran_tien: Math.max(0, Math.min(pxk.da_thanh_toan ?? 0, pxk.so_tien_can_chuyen ?? 0)),
    };
  }
  return c.json({
    tickets,
    goi_y: goiY,
    han_tu_nhan: pxk.trang_thai_hien_tai === "Dang gui KTV" ? pxk.han_tu_nhan : null,
    co_ticket_mo: tickets.some((t) => t && TRANG_THAI_MO.includes(String(t.trang_thai))),
  });
});

// GET /api/nhan-thieu?trang_thai=can_xu_ly|<trang thai>|tat_ca&q=&page= - danh sach ticket (menu Thieu hang) + so dem.
nhanThieu.get("/", async (c) => {
  const scope = scopePxkNguoiNhanHang(c);
  const tt = c.req.query("trang_thai") || "can_xu_ly";
  const q = (c.req.query("q") || "").trim();
  const page = Math.max(1, Math.trunc(Number(c.req.query("page")) || 1));
  const pageSize = 50;
  const base = `FROM nhan_thieu nt JOIN phieu_xuat_kho pxk ON pxk.id = nt.phieu_xuat_kho_id WHERE 1=1${scope?.whereSql ?? ""}`;
  const baseBinds = scope?.binds ?? [];
  const qSql = q ? " AND (nt.id LIKE ? OR pxk.id LIKE ? OR pxk.ma_xuat_kho LIKE ? OR COALESCE(pxk.ma_misa, '') LIKE ?)" : "";
  const qBinds = q ? Array(4).fill(`%${q}%`) : [];
  const ttSql = tt === "tat_ca" ? "" : tt === "can_xu_ly" ? " AND nt.trang_thai IN ('Cho kho kiem tra', 'Cho ke toan')" : " AND nt.trang_thai = ?";
  const ttBinds = tt === "tat_ca" || tt === "can_xu_ly" ? [] : [tt];

  const { results: dem } = await c.env.DB.prepare(`SELECT nt.trang_thai, COUNT(*) as n ${base}${qSql} GROUP BY nt.trang_thai`)
    .bind(...baseBinds, ...qBinds)
    .all<{ trang_thai: string; n: number }>();
  const total = await c.env.DB.prepare(`SELECT COUNT(*) as n ${base}${qSql}${ttSql}`)
    .bind(...baseBinds, ...qBinds, ...ttBinds)
    .first<{ n: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT nt.id, nt.phieu_xuat_kho_id, nt.nguoi_nhan_hang, nt.ly_do, nt.ghi_chu, nt.nguoi_bao, nt.ngay_bao, nt.trang_thai, nt.phuong_an,
            nt.so_tien_hoan, nt.pxk_gui_bu_id, pxk.ma_xuat_kho, pxk.ma_misa, pxk.khu_vuc_ma,
            (SELECT COUNT(*) FROM nhan_thieu_dong d WHERE d.nhan_thieu_id = nt.id) as so_dong,
            (SELECT SUM(d.so_luong_xuat - COALESCE(d.so_luong_xac_nhan, d.so_luong_ktv_bao)) FROM nhan_thieu_dong d WHERE d.nhan_thieu_id = nt.id) as sl_thieu,
            (SELECT group_concat(ddh.ma_lk, ', ') FROM nhan_thieu_dong d JOIN dat_don_hang ddh ON ddh.id = d.dat_don_hang_id WHERE d.nhan_thieu_id = nt.id) as ma_lk
     ${base}${qSql}${ttSql} ORDER BY nt.ngay_bao DESC, nt.id DESC LIMIT ? OFFSET ?`,
  )
    .bind(...baseBinds, ...qBinds, ...ttBinds, pageSize, (page - 1) * pageSize)
    .all();
  return c.json({ data: results, total: total?.n ?? 0, page, pageSize, counts: Object.fromEntries(dem.map((r) => [r.trang_thai, r.n])) });
});

// POST /api/nhan-thieu/anh/:pxkId - tai 1 anh bang chung (body = file anh). Tra url Drive de gui kem POST /bao.
nhanThieu.post("/anh/:pxkId", async (c) => {
  const pxkId = c.req.param("pxkId");
  const user = c.get("user");
  const pxk = await docPxk(c.env.DB, pxkId);
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (user.email !== pxk.nguoi_nhan_hang && !canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  if (pxk.trang_thai_hien_tai !== "Dang gui KTV") return c.json({ error: "INVALID_STATE" }, 409);
  const uploaded = await nhanAnhTaiLen(c, (ext) => `nhan-thieu-${pxkId}-${Date.now()}.${ext}`);
  if (uploaded instanceof Response) return uploaded;
  return c.json({ ok: true, url: uploaded.thumbnailUrl, han_muc_anh: uploaded.hanMucAnh });
});

async function thongBao(
  env: Env, db: D1Database, pxkId: string, nguoiNhan: string[], vaiTro: ("la_kho" | "la_ke_toan" | "la_tac_nghiep")[], body: string,
  vaiTroKhac: ("la_kho" | "la_ke_toan" | "la_tac_nghiep")[] = [],
) {
  const gs = await emailGsListForPxk(db, pxkId);
  const theoVaiTro = (await Promise.all(vaiTro.map((r) => emailsForRoleOrQC(db, r, gs)))).flat();
  await notifyWorkflowTask(env, db, {
    cat1Emails: [...new Set([...nguoiNhan, ...theoVaiTro])],
    otherRoles: vaiTroKhac,
    emailGsList: gs,
    pastActors: [],
    title: "Báo nhận thiếu hàng",
    body,
    linkType: "phieu_xuat_kho",
    linkId: pxkId,
  });
}

/** CAS trong batch: dieu kien SQL `dieuKien` (tra 1 dong khi DUNG) sai -> INSERT vi pham CHECK -> rollback ca batch. */
const lenhKhoa = (db: D1Database, dieuKien: string, ...binds: unknown[]) =>
  db.prepare(`INSERT INTO quy_cas_guard (x) SELECT 1 WHERE NOT EXISTS (${dieuKien})`).bind(...binds);

// POST /api/nhan-thieu/bao - { pxk_id, ly_do, ghi_chu, anh?, dong: [{ dat_don_hang_id, so_luong_nhan }] } (dong khong gui = nhan du).
nhanThieu.post("/bao", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ pxk_id?: string; ly_do?: string; ghi_chu?: string; anh?: unknown; dong?: { dat_don_hang_id?: string; so_luong_nhan?: unknown }[] }>();
  const pxk = body.pxk_id ? await docPxk(c.env.DB, body.pxk_id) : null;
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (user.email !== pxk.nguoi_nhan_hang && !canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  if (pxk.trang_thai_hien_tai !== "Dang gui KTV" || pxk.loai_don === "tra_hang") return c.json({ error: "INVALID_STATE" }, 409);
  const lyDo = body.ly_do ?? "";
  if (!LY_DO_NHAN_THIEU[lyDo]) return c.json({ error: "MISSING_LY_DO" }, 400);
  const ghiChu = (body.ghi_chu ?? "").trim().slice(0, 1000);
  if (!ghiChu) return c.json({ error: "MISSING_GHI_CHU" }, 400);
  const anh = Array.isArray(body.anh) ? body.anh : [];
  if (anh.length > MAX_ANH || !anh.every(laUrlAnhDrive)) return c.json({ error: "ANH_KHONG_HOP_LE" }, 400);

  const dongPxk = await docDongPxk(c.env.DB, pxk.id);
  const nhap = new Map<string, unknown>((body.dong ?? []).map((d) => [String(d.dat_don_hang_id ?? ""), d.so_luong_nhan]));
  for (const id of nhap.keys()) if (!dongPxk.some((d) => d.id === id)) return c.json({ error: "DONG_KHONG_THUOC_PHIEU", id }, 400);
  const dongThieu: { id: string; xuat: number; nhan: number }[] = [];
  for (const d of dongPxk) {
    const xuat = slXuat(d);
    let nhan = xuat;
    if (lyDo === "khong_nhan") nhan = 0;
    else if (nhap.has(d.id)) {
      const v = Number(nhap.get(d.id));
      if (!Number.isInteger(v) || v < 0 || v > xuat) return c.json({ error: "SO_LUONG_KHONG_HOP_LE", id: d.id }, 400);
      nhan = v;
    }
    if (nhan < xuat) dongThieu.push({ id: d.id, xuat, nhan });
  }
  if (dongThieu.length === 0) return c.json({ error: "KHONG_CO_DONG_THIEU" }, 400);

  const dangMo = await c.env.DB.prepare("SELECT id FROM nhan_thieu WHERE phieu_xuat_kho_id = ? AND trang_thai IN ('Cho kho kiem tra', 'Cho ke toan') LIMIT 1")
    .bind(pxk.id)
    .first<{ id: string }>();
  if (dangMo) return c.json({ error: "DA_CO_BAO_NHAN_THIEU", message: `Phiếu đang có báo nhận thiếu ${dangMo.id}.` }, 409);
  const id = await nextSequentialId(c.env.DB, "nhan_thieu", "NTH", 6);
  const now = nowVN();
  const tomTat = dongThieu.map((d) => `${d.id}: nhận ${d.nhan}/${d.xuat}`).join("; ");
  try {
    await c.env.DB.batch([
      lenhKhoa(c.env.DB, "SELECT 1 FROM phieu_xuat_kho WHERE id = ? AND trang_thai_hien_tai = 'Dang gui KTV'", pxk.id),
      lenhKhoa(c.env.DB, "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM nhan_thieu WHERE phieu_xuat_kho_id = ? AND trang_thai IN ('Cho kho kiem tra', 'Cho ke toan'))", pxk.id),
      c.env.DB.prepare(
        `INSERT INTO nhan_thieu (id, phieu_xuat_kho_id, nguoi_nhan_hang, ly_do, ghi_chu, anh, nguoi_bao, ngay_bao, trang_thai)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Cho kho kiem tra')`,
      ).bind(id, pxk.id, pxk.nguoi_nhan_hang, lyDo, ghiChu, JSON.stringify(anh), user.email, now),
      ...dongThieu.map((d) =>
        c.env.DB.prepare("INSERT INTO nhan_thieu_dong (nhan_thieu_id, dat_don_hang_id, so_luong_xuat, so_luong_ktv_bao) VALUES (?, ?, ?, ?)").bind(id, d.id, d.xuat, d.nhan),
      ),
      c.env.DB.prepare("INSERT INTO nhan_thieu_log (nhan_thieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho kho kiem tra', ?, ?, ?)").bind(
        id, user.email, now, `${LY_DO_NHAN_THIEU[lyDo]} — ${tomTat}. ${ghiChu}`,
      ),
      c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'KTV bao nhan thieu', ?, ?, ?)").bind(
        pxk.id, user.email, now, `${id} — ${LY_DO_NHAN_THIEU[lyDo]}: ${tomTat}. ${ghiChu}`,
      ),
    ]);
  } catch {
    return c.json({ error: "STATE_CHANGED" }, 409);
  }
  c.executionCtx.waitUntil(
    thongBao(c.env, c.env.DB, pxk.id, [], ["la_kho"], `KTV báo ${LY_DO_NHAN_THIEU[lyDo].toLowerCase()} phiếu ${pxk.id} (${id}) — chờ Kho kiểm tra`, ["la_tac_nghiep"]),
  );
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, id });
});

async function docTicket(db: D1Database, id: string) {
  return db
    .prepare("SELECT id, phieu_xuat_kho_id, nguoi_bao, trang_thai, phuong_an, version FROM nhan_thieu WHERE id = ?")
    .bind(id)
    .first<{ id: string; phieu_xuat_kho_id: string; nguoi_bao: string; trang_thai: string; phuong_an: string | null; version: number }>();
}

// POST /api/nhan-thieu/:id/huy - nguoi bao / TN / Admin rut lai bao cao khi Kho chua xu ly.
nhanThieu.post("/:id/huy", async (c) => {
  const user = c.get("user");
  const t = await docTicket(c.env.DB, c.req.param("id"));
  if (!t) return c.json({ error: "NOT_FOUND" }, 404);
  const pxk = await docPxk(c.env.DB, t.phieu_xuat_kho_id);
  if (user.email !== t.nguoi_bao && user.email !== pxk?.nguoi_nhan_hang && !canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  if (t.trang_thai !== "Cho kho kiem tra") return c.json({ error: "INVALID_STATE" }, 409);
  const ghiChu = ((await c.req.json<{ ghi_chu?: string }>().catch(() => ({}) as { ghi_chu?: string })).ghi_chu ?? "").trim();
  const now = nowVN();
  const r = await c.env.DB.prepare("UPDATE nhan_thieu SET trang_thai = 'Da huy', version = version + 1 WHERE id = ? AND version = ?").bind(t.id, t.version).run();
  if (!r.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);
  await c.env.DB.prepare("INSERT INTO nhan_thieu_log (nhan_thieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Da huy', ?, ?, ?)")
    .bind(t.id, user.email, now, ghiChu || "Rút lại báo nhận thiếu")
    .run();
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// POST /api/nhan-thieu/:id/kho - { hanh_dong: 'tu_choi'|'dong_y', ghi_chu, phuong_an?, dong?: [{ dat_don_hang_id, so_luong_nhan }] }
nhanThieu.post("/:id/kho", async (c) => {
  const user = c.get("user");
  if (!canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const t = await docTicket(c.env.DB, c.req.param("id"));
  if (!t) return c.json({ error: "NOT_FOUND" }, 404);
  if (t.trang_thai !== "Cho kho kiem tra") return c.json({ error: "INVALID_STATE" }, 409);
  const body = await c.req.json<{ hanh_dong?: string; ghi_chu?: string; phuong_an?: string; dong?: { dat_don_hang_id?: string; so_luong_nhan?: unknown }[] }>();
  const ghiChu = (body.ghi_chu ?? "").trim().slice(0, 1000);
  const pxk = (await docPxk(c.env.DB, t.phieu_xuat_kho_id))!;
  const now = nowVN();
  const db = c.env.DB;
  const lenh: D1PreparedStatement[] = [
    lenhKhoa(db, "SELECT 1 FROM nhan_thieu WHERE id = ? AND version = ?", t.id, t.version),
  ];

  if (body.hanh_dong === "tu_choi") {
    if (!ghiChu) return c.json({ error: "MISSING_GHI_CHU" }, 400);
    lenh.push(
      db.prepare("UPDATE nhan_thieu SET trang_thai = 'Kho tu choi', version = version + 1 WHERE id = ?").bind(t.id),
      db.prepare("INSERT INTO nhan_thieu_log (nhan_thieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Kho tu choi', ?, ?, ?)").bind(t.id, user.email, now, ghiChu),
      // Phieu van cho KTV xac nhan -> dem lai han tu xac nhan tu bay gio.
      db.prepare(`UPDATE phieu_xuat_kho SET han_tu_nhan = datetime('now', '+7 hours', '+${SO_NGAY_TU_NHAN} days') WHERE id = ? AND trang_thai_hien_tai = 'Dang gui KTV'`).bind(pxk.id),
      db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Kho tu choi bao nhan thieu', ?, ?, ?)").bind(
        pxk.id, user.email, now, `${t.id}: ${ghiChu} — KTV xác nhận lại đã nhận hàng (hạn tự xác nhận thêm ${SO_NGAY_TU_NHAN} ngày)`,
      ),
    );
    try {
      await db.batch(lenh);
    } catch {
      return c.json({ error: "STATE_CHANGED" }, 409);
    }
    if (pxk.nguoi_nhan_hang) {
      c.executionCtx.waitUntil(
        thongBao(c.env, db, pxk.id, [pxk.nguoi_nhan_hang], [], `Kho kiểm tra phiếu ${pxk.id} không thiếu hàng (${t.id}): ${ghiChu}. Vui lòng xác nhận lại đã nhận hàng.`),
      );
    }
    c.executionCtx.waitUntil(bumpVersions(db, ["dat_mua_lk"]));
    return c.json({ ok: true });
  }

  if (body.hanh_dong !== "dong_y") return c.json({ error: "INVALID_HANH_DONG" }, 400);
  if (body.phuong_an !== "gui_bu" && body.phuong_an !== "hoan_tien") return c.json({ error: "MISSING_PHUONG_AN" }, 400);
  const { results: dong } = await db.prepare("SELECT * FROM nhan_thieu_dong WHERE nhan_thieu_id = ?").bind(t.id).all<DongTicket>();
  const nhap = new Map<string, unknown>((body.dong ?? []).map((d) => [String(d.dat_don_hang_id ?? ""), d.so_luong_nhan]));
  let conThieu = 0;
  const tomTat: string[] = [];
  for (const d of dong) {
    let xn = d.so_luong_ktv_bao;
    if (nhap.has(d.dat_don_hang_id)) {
      const v = Number(nhap.get(d.dat_don_hang_id));
      if (!Number.isInteger(v) || v < 0 || v > d.so_luong_xuat) return c.json({ error: "SO_LUONG_KHONG_HOP_LE", id: d.dat_don_hang_id }, 400);
      xn = v;
    }
    if (xn < d.so_luong_xuat) conThieu++;
    tomTat.push(`${d.dat_don_hang_id}: nhận ${xn}/${d.so_luong_xuat}${xn !== d.so_luong_ktv_bao ? ` (KTV báo ${d.so_luong_ktv_bao})` : ""}`);
    lenh.push(db.prepare("UPDATE nhan_thieu_dong SET so_luong_xac_nhan = ? WHERE nhan_thieu_id = ? AND dat_don_hang_id = ?").bind(xn, t.id, d.dat_don_hang_id));
  }
  if (conThieu === 0) return c.json({ error: "KHONG_CO_DONG_THIEU", message: "Mọi dòng đều nhận đủ — dùng Từ chối nếu KTV báo sai." }, 400);
  const paLabel = body.phuong_an === "gui_bu" ? "Gửi bù hàng" : "Không gửi bù — hoàn tiền / điều chỉnh SL";
  lenh.push(
    db.prepare("UPDATE nhan_thieu SET trang_thai = 'Cho ke toan', phuong_an = ?, version = version + 1 WHERE id = ?").bind(body.phuong_an, t.id),
    db.prepare("INSERT INTO nhan_thieu_log (nhan_thieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho ke toan', ?, ?, ?)").bind(
      t.id, user.email, now, `Kho xác nhận thiếu — ${paLabel}. ${tomTat.join("; ")}${ghiChu ? `. ${ghiChu}` : ""}`,
    ),
  );
  // Hang da toi KTV (du thieu) -> dong phieu "KTV da nhan"; phan thieu xu ly tiep tren ticket.
  if (pxk.trang_thai_hien_tai === "Dang gui KTV") {
    lenh.push(
      lenhKhoa(db, "SELECT 1 FROM phieu_xuat_kho WHERE id = ? AND version = ?", pxk.id, pxk.version),
      db.prepare("UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'KTV da nhan', version = version + 1 WHERE id = ?").bind(pxk.id),
      db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'KTV da nhan', ?, ?, ?)").bind(
        pxk.id, user.email, now, `KTV nhận thiếu — Kho xác nhận (${t.id}, ${paLabel}): ${tomTat.join("; ")}. Chờ Kế toán cân đối MISA`,
      ),
    );
  }
  try {
    await db.batch(lenh);
  } catch {
    return c.json({ error: "STATE_CHANGED" }, 409);
  }
  c.executionCtx.waitUntil(
    thongBao(c.env, db, pxk.id, pxk.nguoi_nhan_hang ? [pxk.nguoi_nhan_hang] : [], ["la_ke_toan"],
      `Kho xác nhận phiếu ${pxk.id} giao thiếu (${t.id}, ${paLabel}) — chờ Kế toán cân đối phiếu trên MISA theo SL thực nhận`, ["la_tac_nghiep"]),
  );
  c.executionCtx.waitUntil(bumpVersions(db, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// POST /api/nhan-thieu/:id/ke-toan - { ghi_chu?, so_tien_hoan? } Ke toan xac nhan DA can doi phieu tren MISA theo SL thuc nhan.
nhanThieu.post("/:id/ke-toan", async (c) => {
  const user = c.get("user");
  if (!canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const t = await docTicket(c.env.DB, c.req.param("id"));
  if (!t) return c.json({ error: "NOT_FOUND" }, 404);
  if (t.trang_thai !== "Cho ke toan") return c.json({ error: "INVALID_STATE" }, 409);
  const body = await c.req.json<{ ghi_chu?: string; so_tien_hoan?: unknown }>().catch(() => ({}) as { ghi_chu?: string; so_tien_hoan?: unknown });
  const ghiChu = (body.ghi_chu ?? "").trim().slice(0, 1000);
  const db = c.env.DB;
  const pxk = (await docPxk(db, t.phieu_xuat_kho_id))!;
  if (!pxk.nguoi_nhan_hang) return c.json({ error: "PHIEU_KHONG_CO_NGUOI_NHAN" }, 409);
  const dongPxk = await docDongPxk(db, pxk.id);
  const { results: dongTicket } = await db.prepare("SELECT * FROM nhan_thieu_dong WHERE nhan_thieu_id = ?").bind(t.id).all<DongTicket>();
  const donGia = await donGiaThucTra(db, pxk, dongPxk);
  const tran = Math.max(0, Math.min(pxk.da_thanh_toan ?? 0, pxk.so_tien_can_chuyen ?? 0));

  interface DongXuLy { t: DongTicket; d: DongPxk; nhan: number; thieu: number; tienThieu: number; cnMoi: number | null }
  const xuLy: DongXuLy[] = [];
  let conTran = tran;
  for (const dt of dongTicket) {
    const d = dongPxk.find((x) => x.id === dt.dat_don_hang_id);
    if (!d) return c.json({ error: "DONG_DA_ROI_PHIEU", id: dt.dat_don_hang_id }, 409);
    const xuat = slXuat(d);
    const nhan = Math.min(dt.so_luong_xac_nhan ?? dt.so_luong_ktv_bao, xuat);
    const thieu = xuat - nhan;
    if (thieu <= 0) continue;
    const tienThieu = Math.min(conTran, (donGia.get(d.id) ?? 0) * thieu);
    conTran -= tienThieu;
    const laCongNo = d.loai_don === "cong_no" && !laTruCongNo(d.loai_de_xuat) && d.so_tien_cong_no != null;
    xuLy.push({ t: dt, d, nhan, thieu, tienThieu, cnMoi: laCongNo ? Math.round(((d.so_tien_cong_no ?? 0) * nhan) / xuat) : null });
  }
  if (xuLy.length === 0) return c.json({ error: "KHONG_CO_DONG_THIEU" }, 409);
  const tongTienThieu = xuLy.reduce((s, x) => s + x.tienThieu, 0);

  let soTienHoan = 0;
  if (t.phuong_an === "hoan_tien") {
    soTienHoan = tongTienThieu;
    if (body.so_tien_hoan !== undefined && body.so_tien_hoan !== null && body.so_tien_hoan !== "") {
      const v = Number(body.so_tien_hoan);
      if (!Number.isInteger(v) || v < 0 || v > tran) return c.json({ error: "SO_TIEN_HOAN_KHONG_HOP_LE", tran }, 400);
      soTienHoan = v;
    }
  }

  const now = nowVN();
  const lenh: D1PreparedStatement[] = [
    lenhKhoa(db, "SELECT 1 FROM nhan_thieu WHERE id = ? AND version = ?", t.id, t.version),
    lenhKhoaDaThanhToan(db, pxk.id, pxk.da_thanh_toan ?? 0),
  ];
  const moTaDong: string[] = [];
  for (const x of xuLy) {
    // SL thuc xuat cua don goc = SL thuc nhan (khop MISA da can doi). KHONG doi updated_at (cong no phat sinh loc theo updated_at).
    lenh.push(
      db.prepare("UPDATE dat_don_hang SET so_luong_thuc_xuat = ?, so_tien_cong_no = COALESCE(?, so_tien_cong_no), version = version + 1 WHERE id = ?").bind(
        x.nhan, x.cnMoi, x.d.id,
      ),
      db.prepare("UPDATE nhan_thieu_dong SET so_tien_thieu = ? WHERE nhan_thieu_id = ? AND dat_don_hang_id = ?").bind(x.tienThieu, t.id, x.d.id),
    );
    moTaDong.push(`${x.d.id} (${x.d.ma_lk}) SL ${slXuat(x.d)} → ${x.nhan}`);
  }

  let pxkGuiBu: string | null = null;
  const donGuiBu: string[] = [];
  if (t.phuong_an === "gui_bu") {
    // Tien phan thieu RUT khoi phieu goc (tong + da tra cung giam) va di theo don gui bu (tien_da_tra) -> vao phieu gui bu.
    if (tongTienThieu > 0) {
      lenh.push(
        db.prepare("UPDATE phieu_xuat_kho SET so_tien_can_chuyen = so_tien_can_chuyen - ?, da_thanh_toan = da_thanh_toan - ? WHERE id = ?").bind(
          tongTienThieu, tongTienThieu, pxk.id,
        ),
      );
    }
    pxkGuiBu = await nextSequentialId(db, "phieu_xuat_kho", pxk.loai_don === "mua" ? "PMH" : "PCN", 6);
    lenh.push(
      db.prepare(
        `INSERT INTO phieu_xuat_kho (id, ma_xuat_kho, ma_xuat_kho_xac_nhan, nguoi_tao, ngay_tao, ghi_chu, so_tien_can_chuyen, trang_thai_chuyen_tien,
           nguoi_nhan_hang, loai_don, trang_thai_hien_tai, mien_xuat, khu_vuc_chon, quy_kh)
         VALUES (?, ?, 0, ?, ?, ?, NULL, NULL, ?, ?, 'Dang tao phieu', ?, ?, ?)`,
      ).bind(pxkGuiBu, pxkGuiBu, user.email, now, `Phiếu gửi bù thiếu hàng ${t.id} của phiếu ${pxk.id}`, pxk.nguoi_nhan_hang, pxk.loai_don, pxk.mien_xuat, pxk.khu_vuc_chon, pxk.quy_kh),
      db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Dang tao phieu', ?, ?, ?)").bind(
        pxkGuiBu, user.email, now, `Tạo phiếu gửi bù thiếu hàng ${t.id} (phiếu gốc ${pxk.id})`,
      ),
    );
    for (const x of xuLy) {
      const donId = await nextSequentialId(db, "dat_don_hang", "DDH", 6);
      donGuiBu.push(donId);
      const coTien = laDongCoTien(pxk, x.d);
      lenh.push(
        db.prepare(
          `INSERT INTO dat_don_hang
             (id, phieu_dat_id, loai_don, ma_lk, ten_lk_snapshot, loai_de_xuat, so_luong_de_xuat, gia_de_xuat, gia_chot, so_tien_cong_no, danh_gia_cong_no,
              ghi_chu, yeu_cau_hoa_don, tt_mail_duyet, tt_khach_hang, chinh_sach, ma_yeu_cau_su_co, ma_lada, nguoi_tao, ngay_tao, updated_at, email_gs,
              nguoi_nhan_hang, uu_tien, trang_thai_hien_tai, tien_da_tra, tien_da_tra_email, tien_da_tra_pxk, bat_buoc_chuyen_tien, dac_thu_thu_cong,
              combo_ma, khu_vuc_chon, gui_bu_nhan_thieu_id, kh_chuyen_khoan)
           SELECT ?, phieu_dat_id, loai_don, ma_lk, ten_lk_snapshot, loai_de_xuat, ?, gia_de_xuat, ?, ?, danh_gia_cong_no,
              ?, yeu_cau_hoa_don, tt_mail_duyet, tt_khach_hang, chinh_sach, ma_yeu_cau_su_co, ma_lada, nguoi_tao, ?, ?, email_gs,
              nguoi_nhan_hang, uu_tien, 'TN da duyet', ?, ?, ?, 0, dac_thu_thu_cong, combo_ma, khu_vuc_chon, ?, kh_chuyen_khoan
           FROM dat_don_hang WHERE id = ?`,
        ).bind(
          donId, x.thieu,
          coTien ? (donGia.get(x.d.id) ?? 0) : x.d.gia_chot,
          x.cnMoi != null ? Math.max(0, (x.d.so_tien_cong_no ?? 0) - x.cnMoi) : x.d.so_tien_cong_no,
          `Gửi bù thiếu hàng ${t.id} — đơn gốc ${x.d.id} (phiếu ${pxk.id})`,
          now, now,
          x.tienThieu, x.tienThieu > 0 && pxk.nguoi_nhan_hang ? khoaQuy(pxk.nguoi_nhan_hang, pxk.quy_kh) : null, x.tienThieu > 0 ? pxk.id : null,
          t.id, x.d.id,
        ),
        db.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu, tu_dong) VALUES (?, 'TN da duyet', ?, ?, ?, 1)").bind(
          donId, user.email, now, `Đơn gửi bù thiếu hàng ${t.id} (đơn gốc ${x.d.id}, phiếu ${pxk.id}) — tự duyệt`,
        ),
        db.prepare("UPDATE nhan_thieu_dong SET don_gui_bu_id = ? WHERE nhan_thieu_id = ? AND dat_don_hang_id = ?").bind(donId, t.id, x.d.id),
        db.prepare("INSERT INTO phieu_xuat_kho_dong (phieu_xuat_kho_id, dat_don_hang_id) VALUES (?, ?)").bind(pxkGuiBu, donId),
        db.prepare("UPDATE dat_don_hang SET ma_xuat_kho = ? WHERE id = ?").bind(pxkGuiBu, donId),
        ...lenhNhanTienDaTraDon(db, pxkGuiBu, donId, user.email, now),
      );
    }
  } else if (soTienHoan > 0) {
    // Tong phieu giam -> canBangPxk (sau batch) hoan phan tra thua ve quy nguoi nhan hang + tu tru phieu dang cho.
    lenh.push(db.prepare("UPDATE phieu_xuat_kho SET so_tien_can_chuyen = so_tien_can_chuyen - ? WHERE id = ?").bind(soTienHoan, pxk.id));
  }

  const coDongTien = xuLy.some((x) => laDongCoTien(pxk, x.d));
  const trangThaiMoi = t.phuong_an === "gui_bu" ? "Da gui bu" : coDongTien ? "Da hoan tien" : "Da can doi";
  const ketQua =
    t.phuong_an === "gui_bu"
      ? `tạo phiếu gửi bù ${pxkGuiBu} (${donGuiBu.join(", ")})${tongTienThieu > 0 ? `, chuyển ${tien(tongTienThieu)} đã thanh toán sang phiếu gửi bù` : ""}`
      : soTienHoan > 0
        ? `hoàn ${tien(soTienHoan)} về quỹ dư KTV`
        : "không phát sinh tiền hoàn";
  const ghiLog = `Kế toán đã cân đối MISA theo SL thực nhận: ${moTaDong.join("; ")} — ${ketQua}${ghiChu ? `. ${ghiChu}` : ""}`;
  lenh.push(
    db.prepare("UPDATE nhan_thieu SET trang_thai = ?, so_tien_hoan = ?, pxk_gui_bu_id = ?, version = version + 1 WHERE id = ?").bind(
      trangThaiMoi, t.phuong_an === "gui_bu" ? null : soTienHoan, pxkGuiBu, t.id,
    ),
    db.prepare("INSERT INTO nhan_thieu_log (nhan_thieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(t.id, trangThaiMoi, user.email, now, ghiLog),
    db.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Ke toan can doi nhan thieu', ?, ?, ?)").bind(
      pxk.id, user.email, now, `${t.id}: ${ghiLog}`,
    ),
  );
  try {
    await db.batch(lenh);
  } catch {
    return c.json({ error: "STATE_CHANGED" }, 409);
  }

  let daHoan = 0;
  if (t.phuong_an === "hoan_tien" && soTienHoan > 0) {
    daHoan = (await canBangPxk(db, pxk.id, user.email)).hoan;
  }
  if (pxkGuiBu) {
    await taiTinhPxk(db, pxkGuiBu, true, true, undefined, user.email);
    // Tien phieu gui bu da tra du bang tien KTV da chuyen o phieu goc (chinh Ke toan vua xac nhan) -> "Ke toan da duyet" luon,
    // khong bat Ke toan duyet lai; phieu da duyet tien cung khong bi tu gom don moi vao (pxkAutoBundle).
    await db
      .prepare(
        `UPDATE phieu_xuat_kho SET trang_thai_chuyen_tien = 'TN da duyet'
         WHERE id = ? AND so_tien_can_chuyen IS NOT NULL AND da_thanh_toan >= so_tien_can_chuyen AND trang_thai_chuyen_tien = 'KTV da chuyen'`,
      )
      .bind(pxkGuiBu)
      .run();
  }

  c.executionCtx.waitUntil(
    thongBao(c.env, db, pxk.id, [pxk.nguoi_nhan_hang], pxkGuiBu ? ["la_tac_nghiep"] : [],
      t.phuong_an === "gui_bu"
        ? `Phiếu ${pxk.id} thiếu hàng (${t.id}): đã tạo phiếu gửi bù ${pxkGuiBu} — chờ Tác nghiệp xử lý gửi hàng`
        : daHoan > 0
          ? `Phiếu ${pxk.id} thiếu hàng (${t.id}): đã hoàn ${tien(daHoan)} về quỹ dư của bạn`
          : `Phiếu ${pxk.id} thiếu hàng (${t.id}): Kế toán đã điều chỉnh SL theo thực nhận`),
  );
  c.executionCtx.waitUntil(bumpVersions(db, ["dat_mua_lk"]));
  return c.json({ ok: true, trang_thai: trangThaiMoi, so_tien_hoan: daHoan, pxk_gui_bu_id: pxkGuiBu, don_gui_bu: donGuiBu });
});

/** Cron 8h sang VN (index.ts): (1) PXK "Dang gui KTV" qua han_tu_nhan, khong co bao thieu dang mo -> tu "KTV da nhan";
 * (2) nhac moi KTV con phieu cho xac nhan (1 thong bao / nguoi / ngay, kem han tu xac nhan). */
export async function tuXacNhanVaNhacPxk(env: Env): Promise<{ tuDong: number; nhac: number }> {
  const db = env.DB;
  const now = nowVN();
  const moTicket = "EXISTS (SELECT 1 FROM nhan_thieu nt WHERE nt.phieu_xuat_kho_id = pxk.id AND nt.trang_thai IN ('Cho kho kiem tra', 'Cho ke toan'))";
  const { results: quaHan } = await db
    .prepare(
      `SELECT pxk.id, pxk.nguoi_nhan_hang, pxk.version FROM phieu_xuat_kho pxk
       WHERE pxk.trang_thai_hien_tai = 'Dang gui KTV' AND COALESCE(pxk.loai_don, '') != 'tra_hang' AND pxk.nguoi_nhan_hang IS NOT NULL
         AND pxk.han_tu_nhan IS NOT NULL AND pxk.han_tu_nhan <= ? AND NOT ${moTicket}`,
    )
    .bind(now)
    .all<{ id: string; nguoi_nhan_hang: string; version: number }>();
  let tuDong = 0;
  const daDongTheoNguoi = new Map<string, string[]>();
  for (const p of quaHan) {
    const r = await db
      .prepare("UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'KTV da nhan', version = version + 1 WHERE id = ? AND version = ? AND trang_thai_hien_tai = 'Dang gui KTV'")
      .bind(p.id, p.version)
      .run();
    if (!r.meta.changes) continue;
    await db
      .prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'KTV da nhan', ?, ?, ?)")
      .bind(p.id, p.nguoi_nhan_hang, now, `Hệ thống tự xác nhận đã nhận hàng — quá ${SO_NGAY_TU_NHAN} ngày kể từ khi Kho gửi, KTV không xác nhận / báo thiếu`)
      .run();
    tuDong++;
    daDongTheoNguoi.set(p.nguoi_nhan_hang, [...(daDongTheoNguoi.get(p.nguoi_nhan_hang) ?? []), p.id]);
  }

  const { results: cho } = await db
    .prepare(
      `SELECT pxk.id, pxk.nguoi_nhan_hang, pxk.han_tu_nhan FROM phieu_xuat_kho pxk
       WHERE pxk.trang_thai_hien_tai = 'Dang gui KTV' AND COALESCE(pxk.loai_don, '') != 'tra_hang' AND pxk.nguoi_nhan_hang IS NOT NULL AND NOT ${moTicket}
       ORDER BY pxk.han_tu_nhan, pxk.id`,
    )
    .all<{ id: string; nguoi_nhan_hang: string; han_tu_nhan: string | null }>();
  const choTheoNguoi = new Map<string, { id: string; han: string | null }[]>();
  for (const p of cho) choTheoNguoi.set(p.nguoi_nhan_hang, [...(choTheoNguoi.get(p.nguoi_nhan_hang) ?? []), { id: p.id, han: p.han_tu_nhan }]);

  const homNay = now.slice(0, 10);
  const conNgay = (han: string | null) =>
    han ? Math.max(0, Math.ceil((Date.parse(`${han.slice(0, 10)}T00:00:00Z`) - Date.parse(`${homNay}T00:00:00Z`)) / 86400000)) : null;
  const fmt = (han: string | null) => (han ? `${han.slice(8, 10)}/${han.slice(5, 7)}` : "");
  const nguois = new Set([...choTheoNguoi.keys(), ...daDongTheoNguoi.keys()]);
  if (nguois.size === 0) return { tuDong, nhac: 0 };
  const prefs = new Map<string, number>();
  const ds = [...nguois];
  for (let i = 0; i < ds.length; i += 90) {
    const lo = ds.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT email, nhan_tb_nhiem_vu as pref FROM users WHERE email IN (${lo.map(() => "?").join(",")})`).bind(...lo).all<{ email: string; pref: number }>();
    for (const r of results) prefs.set(r.email, r.pref);
  }
  let nhac = 0;
  for (const email of nguois) {
    if (!prefs.has(email)) continue;
    const dsCho = choTheoNguoi.get(email) ?? [];
    const dsDong = daDongTheoNguoi.get(email) ?? [];
    const phan: string[] = [];
    if (dsDong.length) phan.push(`Hệ thống đã tự xác nhận đã nhận hàng ${dsDong.length} phiếu quá ${SO_NGAY_TU_NHAN} ngày: ${dsDong.join(", ")}.`);
    if (dsCho.length) {
      const liet = dsCho.slice(0, 8).map((p) => `${p.id} (hạn ${fmt(p.han)}${conNgay(p.han) != null ? `, còn ${conNgay(p.han)} ngày` : ""})`).join(", ");
      phan.push(
        `Bạn có ${dsCho.length} phiếu chờ xác nhận nhận hàng: ${liet}${dsCho.length > 8 ? "…" : ""}. Quá hạn hệ thống tự tính là ĐÃ NHẬN HÀNG — nếu thiếu / không nhận được hàng, mở phiếu và bấm "Báo nhận thiếu".`,
      );
    }
    const noiDung = phan.join(" ");
    const linkId = dsCho[0]?.id ?? dsDong[0];
    await db
      .prepare("INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, 'viec_moi', ?, 'phieu_xuat_kho', ?, ?)")
      .bind(email, noiDung, linkId, now)
      .run();
    if (prefs.get(email)) await sendPushToUser(env, email, { title: "Xác nhận nhận hàng", body: noiDung, url: "/" }).catch(() => undefined);
    nhac++;
  }
  if (tuDong > 0 || nhac > 0) await bumpVersions(db, ["dat_mua_lk"]);
  return { tuDong, nhac };
}

export default nhanThieu;
