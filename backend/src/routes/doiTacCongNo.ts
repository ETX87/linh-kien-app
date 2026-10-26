// Tab "Công nợ đối tác" (Danh sach KTV) + nguon danh sach doi tac cho form dat don "MUA HÀNG CÔNG NỢ ĐỐI TÁC" (chot 2026-10-26, v1.403,
// migration 0099). So cong no tinh luc doc (lib/congNoDoiTac.ts docCongNoDoiTac).
// Quyen (chot nguoi dung): them/sua/bat-tat doi tac = TN (gom Ke toan lam thay) + Ke toan + Admin; ghi / huy khoan doi tac thanh toan = Ke toan
// + Admin; xem toan bo = nhan vien van phong (khong phai KTV/Ve tinh thuan); KTV chi thay doi tac trung Ma MISA cua chinh minh (GET /chon).
import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { docCongNoDoiTac, duocChonMoiDoiTac, maMisaCuaEmail, TIEN_DON_DOI_TAC_SQL, DON_DA_GHI_NO_SQL } from "../lib/congNoDoiTac";
import { bumpVersions } from "../lib/dataVersions";

const doiTacCongNo = new Hono<{ Bindings: Env }>();
doiTacCongNo.use("*", verifySessionMiddleware, loadUser);

type C = Context<{ Bindings: Env }>;
const duocSua = (c: C) => {
  const u = c.get("user");
  return u.vai_tro === "Admin" || !!u.la_tac_nghiep || !!u.la_ke_toan;
};
const duocGhiThanhToan = (c: C) => {
  const u = c.get("user");
  return u.vai_tro === "Admin" || !!u.la_ke_toan;
};
const xemToanBo = (c: C) => {
  const u = c.get("user");
  return duocChonMoiDoiTac(u) || !(u.la_ktv_dvbh || u.la_ve_tinh);
};

/** Doi tac nguoi dang nhap duoc dat don: TN/Ke toan/GS/Admin = moi doi tac dang bat; con lai = doi tac trung Ma MISA cua chinh minh. */
async function maDoiTacDuocDat(c: C): Promise<string[] | null> {
  const u = c.get("user");
  if (duocChonMoiDoiTac(u)) return null;
  return await maMisaCuaEmail(c.env.DB, u.email);
}

// GET / - danh sach day du (tab Công nợ đối tác).
doiTacCongNo.get("/", async (c) => {
  if (!xemToanBo(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const rows = await docCongNoDoiTac(c.env.DB);
  // KTV co Ma MISA trung doi tac (duoc tu dat don cho minh) - hien o tab de nguoi sua biet.
  const { results: ktv } = await c.env.DB.prepare(
    `SELECT k.ma_ktv, COALESCE(NULLIF(TRIM(k.ten_hien_thi), ''), k.ma_ktv) AS ten, UPPER(TRIM(k.ma_misa)) AS ma_misa, k.email_dang_nhap
     FROM ktv_lien_he k WHERE COALESCE(k.ngung_hoat_dong, 0) = 0 AND TRIM(COALESCE(k.ma_misa, '')) <> ''
       AND UPPER(TRIM(k.ma_misa)) IN (SELECT UPPER(ma_misa) FROM doi_tac_cong_no)`,
  ).all<{ ma_ktv: string; ten: string; ma_misa: string; email_dang_nhap: string | null }>();
  return c.json({
    rows: rows.map((r) => ({ ...r, ktv: ktv.filter((k) => k.ma_misa === r.ma_misa.toUpperCase()) })),
    duoc_sua: duocSua(c),
    duoc_ghi_thanh_toan: duocGhiThanhToan(c),
  });
});

// GET /chon - doi tac DANG BAT nguoi dang nhap duoc dat don (form tao don): kem kha dung de canh bao.
// `tu_dat` = KTV chi duoc dat cho chinh minh (form an o chon doi tac khac, tu dien).
doiTacCongNo.get("/chon", async (c) => {
  const duoc = await maDoiTacDuocDat(c);
  if (duoc && duoc.length === 0) return c.json({ rows: [], tu_dat: true });
  const rows = (await docCongNoDoiTac(c.env.DB, duoc ?? undefined)).filter((r) => r.bat_tat === 1);
  // `emails` = Gmail dang nhap cua ma KTV dang hoat dong co CUNG Ma MISA doi tac (2026-10-26, v1.406 - "KTV đặt công nợ đối tác thì không cần chọn
  // đối tác, mặc định sẽ chính là ktv đó. chỉ có GS, TN, KT mới có quyền chọn lại đối tác") -> form tu dien doi tac = nguoi nhan hang.
  const { results: ktv } = await c.env.DB.prepare(
    `SELECT UPPER(TRIM(ma_misa)) AS ma, LOWER(TRIM(email_dang_nhap)) AS email FROM ktv_lien_he
     WHERE COALESCE(ngung_hoat_dong, 0) = 0 AND TRIM(COALESCE(email_dang_nhap, '')) <> '' AND TRIM(COALESCE(ma_misa, '')) <> ''
       AND UPPER(TRIM(ma_misa)) IN (SELECT UPPER(ma_misa) FROM doi_tac_cong_no WHERE bat_tat = 1)`,
  ).all<{ ma: string; email: string }>();
  return c.json({
    rows: rows.map((r) => ({
      ma_misa: r.ma_misa, ten_misa: r.ten_misa, hien_tai: r.hien_tai, toi_da: r.cong_no_toi_da, kha_dung: r.kha_dung,
      emails: ktv.filter((k) => k.ma === r.ma_misa.toUpperCase()).map((k) => k.email),
    })),
    tu_dat: duoc !== null,
  });
});

const so = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

// POST / {ma_misa, ten_misa, cong_no_ban_dau, cong_no_toi_da, bat_tat?, ghi_chu?} - them doi tac.
doiTacCongNo.post("/", async (c) => {
  if (!duocSua(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const b = await c.req.json<{ ma_misa?: string; ten_misa?: string; cong_no_ban_dau?: number; cong_no_toi_da?: number; bat_tat?: boolean; ghi_chu?: string }>();
  const ma = b.ma_misa?.trim() ?? "";
  const ten = b.ten_misa?.trim() ?? "";
  if (!ma || ma.length > 60) return c.json({ error: "THIEU_MA_MISA" }, 400);
  if (!ten) return c.json({ error: "THIEU_TEN_MISA" }, 400);
  const banDau = so(b.cong_no_ban_dau) ?? 0;
  const toiDa = so(b.cong_no_toi_da) ?? 0;
  if (Number.isNaN(banDau) || Number.isNaN(toiDa)) return c.json({ error: "SO_TIEN_KHONG_HOP_LE" }, 400);
  const daCo = await c.env.DB.prepare("SELECT ma_misa FROM doi_tac_cong_no WHERE ma_misa = ?").bind(ma).first();
  if (daCo) return c.json({ error: "DOI_TAC_DA_CO" }, 409);
  await c.env.DB.prepare(
    `INSERT INTO doi_tac_cong_no (ma_misa, ten_misa, cong_no_ban_dau, cong_no_toi_da, bat_tat, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(ma, ten, banDau, toiDa, b.bat_tat === false ? 0 : 1, b.ghi_chu?.trim() || null, c.get("user").email, nowVN()).run();
  return c.json({ ok: true }, 201);
});

// PATCH /:ma {ten_misa?, cong_no_ban_dau?, cong_no_toi_da?, bat_tat?, ghi_chu?} - Ma MISA khong doi duoc.
doiTacCongNo.patch("/:ma", async (c) => {
  if (!duocSua(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const ma = c.req.param("ma");
  const b = await c.req.json<{ ten_misa?: string; cong_no_ban_dau?: number; cong_no_toi_da?: number; bat_tat?: boolean; ghi_chu?: string | null }>();
  const cu = await c.env.DB.prepare("SELECT * FROM doi_tac_cong_no WHERE ma_misa = ?").bind(ma).first<{
    ma_misa: string; ten_misa: string; cong_no_ban_dau: number; cong_no_toi_da: number; bat_tat: number; ghi_chu: string | null;
  }>();
  if (!cu) return c.json({ error: "NOT_FOUND" }, 404);
  const ten = b.ten_misa !== undefined ? b.ten_misa.trim() : cu.ten_misa;
  if (!ten) return c.json({ error: "THIEU_TEN_MISA" }, 400);
  const banDau = b.cong_no_ban_dau !== undefined ? so(b.cong_no_ban_dau) ?? 0 : cu.cong_no_ban_dau;
  const toiDa = b.cong_no_toi_da !== undefined ? so(b.cong_no_toi_da) ?? 0 : cu.cong_no_toi_da;
  if (Number.isNaN(banDau) || Number.isNaN(toiDa)) return c.json({ error: "SO_TIEN_KHONG_HOP_LE" }, 400);
  await c.env.DB.prepare(
    `UPDATE doi_tac_cong_no SET ten_misa = ?, cong_no_ban_dau = ?, cong_no_toi_da = ?, bat_tat = ?, ghi_chu = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ?
     WHERE ma_misa = ?`,
  ).bind(
    ten, banDau, toiDa, b.bat_tat === undefined ? cu.bat_tat : b.bat_tat ? 1 : 0,
    b.ghi_chu !== undefined ? b.ghi_chu?.trim() || null : cu.ghi_chu, c.get("user").email, nowVN(), cu.ma_misa,
  ).run();
  return c.json({ ok: true });
});

// GET /:ma/chi-tiet - don doi tac (moi nhat 300) + khoan doi tac thanh toan.
doiTacCongNo.get("/:ma/chi-tiet", async (c) => {
  const ma = c.req.param("ma");
  const duoc = xemToanBo(c) ? null : await maDoiTacDuocDat(c);
  if (duoc && !duoc.some((m) => m.toUpperCase() === ma.toUpperCase())) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const [{ results: don }, { results: thanhToan }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT d.id, d.ngay_tao, d.ma_lk, d.ten_lk_snapshot, COALESCE(d.so_luong_thuc_xuat, d.so_luong_de_xuat) AS so_luong,
              ${TIEN_DON_DOI_TAC_SQL("d")} AS tien, d.trang_thai_hien_tai, d.nguoi_nhan_hang, d.nguoi_tao, d.ma_xuat_kho,
              (SELECT pd.phieu_xuat_kho_id FROM phieu_xuat_kho_dong pd WHERE pd.dat_don_hang_id = d.id LIMIT 1) AS pxk_id,
              CASE WHEN ${DON_DA_GHI_NO_SQL("d")} THEN 1 ELSE 0 END AS da_ghi_no
       FROM dat_don_hang d WHERE UPPER(d.doi_tac_ma) = UPPER(?) ORDER BY d.ngay_tao DESC, d.id DESC LIMIT 300`,
    ).bind(ma).all(),
    c.env.DB.prepare("SELECT * FROM doi_tac_thanh_toan WHERE UPPER(ma_doi_tac) = UPPER(?) ORDER BY tao_luc DESC, id DESC LIMIT 300").bind(ma).all(),
  ]);
  return c.json({ don, thanh_toan: thanhToan });
});

// POST /:ma/thanh-toan {so_tien, noi_dung, ngay_chung_tu?} - Ke toan ghi khoan doi tac da tra (giam cong no).
doiTacCongNo.post("/:ma/thanh-toan", async (c) => {
  if (!duocGhiThanhToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const dt = await c.env.DB.prepare("SELECT ma_misa FROM doi_tac_cong_no WHERE ma_misa = ?").bind(c.req.param("ma")).first<{ ma_misa: string }>();
  if (!dt) return c.json({ error: "NOT_FOUND" }, 404);
  const b = await c.req.json<{ so_tien?: number; noi_dung?: string; ngay_chung_tu?: string }>();
  const soTien = Math.round(Number(b.so_tien));
  if (!Number.isFinite(soTien) || soTien <= 0) return c.json({ error: "SO_TIEN_KHONG_HOP_LE" }, 400);
  if (!b.noi_dung?.trim()) return c.json({ error: "THIEU_NOI_DUNG" }, 400);
  const ngay = b.ngay_chung_tu?.trim() || null;
  if (ngay && !/^\d{4}-\d{2}-\d{2}$/.test(ngay)) return c.json({ error: "NGAY_KHONG_HOP_LE" }, 400);
  await c.env.DB.prepare(
    "INSERT INTO doi_tac_thanh_toan (ma_doi_tac, so_tien, ngay_chung_tu, noi_dung, nguoi_tao, tao_luc) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(dt.ma_misa, soTien, ngay, b.noi_dung.trim().slice(0, 500), c.get("user").email, nowVN()).run();
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true }, 201);
});

// GET /thanh-toan?q=&trang_thai=Da ghi|Da huy&tu=&den= - MOI khoan doi tac thanh toan (tab "Công nợ đối tác" o Quỹ & chuyển tiền, 2026-10-26
// v1.404 - "kế toán chỉ cần vào, add hoặc import số tiền đối tác đã thanh toán"). tu/den = ngay ghi (giờ VN), toi da 1000 dong moi nhat.
doiTacCongNo.get("/thanh-toan", async (c) => {
  if (!xemToanBo(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const q = c.req.query("q")?.trim() ?? "";
  const tt = c.req.query("trang_thai");
  const tu = c.req.query("tu");
  const den = c.req.query("den");
  const dk: string[] = [];
  const binds: unknown[] = [];
  if (tt === "Da ghi" || tt === "Da huy") {
    dk.push("t.trang_thai = ?");
    binds.push(tt);
  }
  if (tu && /^\d{4}-\d{2}-\d{2}$/.test(tu)) {
    dk.push("substr(t.tao_luc, 1, 10) >= ?");
    binds.push(tu);
  }
  if (den && /^\d{4}-\d{2}-\d{2}$/.test(den)) {
    dk.push("substr(t.tao_luc, 1, 10) <= ?");
    binds.push(den);
  }
  if (q) {
    dk.push("(t.ma_doi_tac LIKE ? OR d.ten_misa LIKE ? OR t.noi_dung LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, d.ten_misa FROM doi_tac_thanh_toan t LEFT JOIN doi_tac_cong_no d ON d.ma_misa = t.ma_doi_tac
     ${dk.length ? `WHERE ${dk.join(" AND ")}` : ""} ORDER BY t.tao_luc DESC, t.id DESC LIMIT 1000`,
  ).bind(...binds).all();
  return c.json({ rows: results, duoc_ghi_thanh_toan: duocGhiThanhToan(c) });
});

// POST /thanh-toan/import {items: [{ma_doi_tac, so_tien, noi_dung, ngay_chung_tu?}] <= 200} - ghi nhieu khoan 1 lan (them tay nhieu dong /
// import Excel). Kiem tra HET truoc khi ghi: co dong loi -> 400 `loi` [{dong, loi}] va KHONG ghi dong nao; hop le -> 1 batch.
doiTacCongNo.post("/thanh-toan/import", async (c) => {
  if (!duocGhiThanhToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const b = await c.req.json<{ items?: { ma_doi_tac?: string; so_tien?: number; noi_dung?: string; ngay_chung_tu?: string | null }[] }>();
  const items = Array.isArray(b.items) ? b.items : [];
  if (items.length === 0 || items.length > 200) return c.json({ error: "INVALID_BODY" }, 400);
  const { results: dsDt } = await c.env.DB.prepare("SELECT ma_misa FROM doi_tac_cong_no").all<{ ma_misa: string }>();
  const maChuan = new Map(dsDt.map((d) => [d.ma_misa.trim().toUpperCase(), d.ma_misa]));
  const loi: { dong: number; loi: string }[] = [];
  const hopLe: { ma: string; soTien: number; noiDung: string; ngay: string | null }[] = [];
  items.forEach((it, i) => {
    const ma = maChuan.get(String(it.ma_doi_tac ?? "").trim().toUpperCase());
    const soTien = Math.round(Number(it.so_tien));
    const noiDung = String(it.noi_dung ?? "").trim();
    const ngay = it.ngay_chung_tu?.trim() || null;
    if (!ma) loi.push({ dong: i + 1, loi: "DOI_TAC_KHONG_CO" });
    else if (!Number.isFinite(soTien) || soTien <= 0) loi.push({ dong: i + 1, loi: "SO_TIEN_KHONG_HOP_LE" });
    else if (!noiDung) loi.push({ dong: i + 1, loi: "THIEU_NOI_DUNG" });
    else if (ngay && !/^\d{4}-\d{2}-\d{2}$/.test(ngay)) loi.push({ dong: i + 1, loi: "NGAY_KHONG_HOP_LE" });
    else hopLe.push({ ma, soTien, noiDung: noiDung.slice(0, 500), ngay });
  });
  if (loi.length) return c.json({ error: "CO_DONG_LOI", loi }, 400);
  const email = c.get("user").email;
  const luc = nowVN();
  await c.env.DB.batch(
    hopLe.map((h) =>
      c.env.DB.prepare(
        "INSERT INTO doi_tac_thanh_toan (ma_doi_tac, so_tien, ngay_chung_tu, noi_dung, nguoi_tao, tao_luc) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(h.ma, h.soTien, h.ngay, h.noiDung, email, luc),
    ),
  );
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, ghi: hopLe.length, tong_tien: hopLe.reduce((s, h) => s + h.soTien, 0) }, 201);
});

// POST /thanh-toan/:id/huy {ly_do} - huy khoan ghi nham (cong no tang lai).
doiTacCongNo.post("/thanh-toan/:id/huy", async (c) => {
  if (!duocGhiThanhToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const b = await c.req.json<{ ly_do?: string }>();
  if (!b.ly_do?.trim()) return c.json({ error: "THIEU_LY_DO" }, 400);
  const kq = await c.env.DB.prepare(
    "UPDATE doi_tac_thanh_toan SET trang_thai = 'Da huy', huy_boi = ?, huy_luc = ?, ly_do_huy = ? WHERE id = ? AND trang_thai = 'Da ghi'",
  ).bind(c.get("user").email, nowVN(), b.ly_do.trim().slice(0, 500), Number(c.req.param("id"))).run();
  if (!kq.meta.changes) return c.json({ error: "TRANG_THAI_DA_DOI" }, 409);
  return c.json({ ok: true });
});

export default doiTacCongNo;
