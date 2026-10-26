import { Hono } from "hono";
import { maKtvDangDungEmail } from "../lib/ktvChinh";
import { chuanHoaGmail, emailChinhCuaGmail, kiemTraGmailPhu } from "../lib/gmailPhu";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { computeAndStoreHash, getOrComputeHash } from "../lib/contentHash";
import { nowVN } from "../lib/vnTime";
import { resyncKhuVucDerivedFieldsForAll, resyncKhuVucDerivedFieldsForEmail } from "../lib/khuVucSync";
import { relinkTonKhoForMaMisa } from "../lib/ktvTonKhoRelink";
import { setMocTinhDuPhong, getMocTinhDuPhong } from "../lib/duPhongKtv";
import { maKtvTheoTen } from "../lib/timTheoTen";

// Port rut gon tu backend/src/routes/settings.ts cua he DVBH goc (phan "Danh sach KTV") - danh ba
// ky thuat vien/Tram/CTV/Ve tinh dung de chon "nguoi nhan hang" trong module Dat mua linh kien.
// Schema GIU NGUYEN so voi he goc (bao gom sdt/ghi_chu du khong dung nhieu o he nay) de giam rui ro
// khi port - xem CLAUDE.md muc "Nguon goc tach he thong". Du lieu ban dau COPY 1 LAN tu he goc luc
// trien khai (xem DEPLOY.md), sau do 2 he KHONG dong bo tiep.
const settingsKtv = new Hono<{ Bindings: Env }>();
settingsKtv.use("*", verifySessionMiddleware, loadUser);
const adminOnly = requireRole("Admin");

async function refreshHash(db: D1Database) {
  const { results } = await db.prepare("SELECT * FROM ktv_lien_he ORDER BY ma_ktv").all();
  await computeAndStoreHash(db, "ktv_lien_he", results);
}

// "Giam sat quan ly" - users.giam_sat_quan_ly la NGUON DUY NHAT phan quyen thuc su (scopeDatMua.ts/
// datMuaLinhKien.ts/phieuXuatKho.ts van doc thang cot nay, khong doi) - LEFT JOIN sang users qua
// email_dang_nhap de tra them gia tri THAT dang ap dung (giam_sat_quan_ly_hien_tai), chi de HIEN THI
// (frontend hien read-only). Tu Phase 4 (2026-08-26) cot users.giam_sat_quan_ly nay KHONG con do
// Admin nhap tay o Users module nua - duoc TU DONG dong bo tu khu_vuc_ma cua chinh dong ktv_lien_he
// nay (xem lib/khuVucSync.ts, goi o cuoi PATCH .../dat-mua-lk ben duoi). Cot
// ktv_lien_he.giam_sat_quan_ly cu van giu nguyen trong DB/response nhung chi la ghi chu danh ba.
//
// GET /?search=&cap=1|2&khu_vuc_ma=&page=&pageSize= (loc/phan trang them 2026-08-26, muc 1-2: tach
// the "KTV hien truong" can tim kiem/loc tren danh sach co the rat dai - truoc day tra het khong loc
// gi ca). "cap=1" = KTV/CTV/Tram, "cap=2" = Ve tinh (dung dung tinh than "KTV cap 1 tuong duong
// nhau"/"Ve tinh la KTV cap 2" cua yeu cau). KHONG truyen page -> giu nguyen hanh vi cu (tra het).
settingsKtv.get("/", async (c) => {
  // .normalize("NFC") (fix bug 2026-09-12, cung goc voi Select.tsx frontend: "tìm 'khách hà' không
  // ra") - ky tu co dau go tu ban phim/IME co the toi server o dang to hop (NFD), khac dang NFC luu
  // san trong DB, khien LIKE so sanh BYTE khong khop du nhin giong het nhau.
  const search = c.req.query("search")?.trim().normalize("NFC");
  const cap = c.req.query("cap")?.trim();
  const khuVucMa = c.req.query("khu_vuc_ma")?.trim();
  const pageParam = c.req.query("page");

  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (search) {
    // + ten KHONG dau (2026-09-29, lib/timTheoTen.ts) - LOWER() cua SQLite khong ha chu co dau.
    conditions.push(
      "(LOWER(k.ma_ktv) LIKE LOWER(?) OR LOWER(COALESCE(k.ten_hien_thi,'')) LIKE LOWER(?) OR LOWER(COALESCE(k.sdt,'')) LIKE LOWER(?) OR LOWER(COALESCE(k.gmail,'')) LIKE LOWER(?) OR LOWER(COALESCE(k.email_dang_nhap,'')) LIKE LOWER(?) OR EXISTS (SELECT 1 FROM users_gmail_phu gp WHERE gp.email_chinh = k.email_dang_nhap AND gp.email_phu LIKE LOWER(?)) OR EXISTS (SELECT 1 FROM users un WHERE un.email = k.email_dang_nhap AND UPPER(COALESCE(un.ma_nhan_su, '')) LIKE UPPER(?)) OR k.ma_ktv IN (SELECT value FROM json_each(?)))",
    );
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, JSON.stringify(await maKtvTheoTen(c.env.DB, search)));
  }
  if (cap === "1") {
    conditions.push("COALESCE(k.vai_tro_ktv, 'KTV') != 'Ve tinh'");
  } else if (cap === "2") {
    conditions.push("k.vai_tro_ktv = 'Ve tinh'");
  }
  if (khuVucMa) {
    // Ho tro nhieu ma cach nhau boi dau phay (them 2026-08-27, khoi "KTV khu vực của tôi" o
    // TrangChuTab.tsx - 1 GS/TN/Kho/Ke toan co the phu trach NHIEU Khu vuc cung luc).
    const khuVucList = khuVucMa.split(",").map((s) => s.trim()).filter(Boolean);
    if (khuVucList.length === 1) {
      conditions.push("k.khu_vuc_ma = ?");
      binds.push(khuVucList[0]);
    } else if (khuVucList.length > 1) {
      conditions.push(`k.khu_vuc_ma IN (${khuVucList.map(() => "?").join(",")})`);
      binds.push(...khuVucList);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // "Han muc du phong phat sinh"/"Moc du phong hien tai" (them 2026-09-13, xem lib/duPhongKtv.ts) -
  // tinh gop qua 1 CTE thay vi N+1 query rieng tung KTV, giong dung pattern "phat_sinh" cua
  // ktvTonKho.ts GET / (cong no). KHAC cong no: khong loc theo trang_thai_hien_tai cu the (tinh CA
  // don dang cho xu ly), chi loai Tu choi/Da huy - xem computeDuPhongPhatSinh().
  const mocTinhDuPhong = await getMocTinhDuPhong(c.env.DB);
  const duPhongJoin = `LEFT JOIN (
       SELECT k3.ma_ktv, SUM(ddh.so_luong_de_xuat * COALESCE(lk.gia_du_phong, 0)) as gia_tri
       FROM dat_don_hang ddh
       JOIN ktv_lien_he k3 ON k3.email_dang_nhap = ddh.nguoi_nhan_hang
       LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
       WHERE ddh.loai_de_xuat = 'MUA DỰ TRỮ' AND ddh.trang_thai_hien_tai NOT IN ('Tu choi', 'Da huy')
         AND (? IS NULL OR ddh.updated_at > ?)
       GROUP BY k3.ma_ktv
     ) dp ON dp.ma_ktv = k.ma_ktv`;
  const selectCols = `k.*, u.ma_nhan_su as ma_nhan_su, u.giam_sat_quan_ly as giam_sat_quan_ly_hien_tai, u.bi_khoa as tk_bi_khoa, u.email as tk_email, (SELECT GROUP_CONCAT(k2.ma_ktv, ', ') FROM ktv_lien_he k2 WHERE k2.email_dang_nhap = k.email_dang_nhap AND k2.ma_ktv <> k.ma_ktv) as ma_cung_gmail, (SELECT GROUP_CONCAT(gp.email_phu, ', ') FROM users_gmail_phu gp WHERE gp.email_chinh = k.email_dang_nhap) as gmail_phu, COALESCE(dp.gia_tri, 0) as han_muc_du_phong_phat_sinh`;
  const baseSql = `FROM ktv_lien_he k LEFT JOIN users u ON u.email = k.email_dang_nhap ${duPhongJoin} ${where}`;
  const duPhongBinds = [mocTinhDuPhong, mocTinhDuPhong];
  const withMocHienTai = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({
      ...r,
      moc_du_phong_hien_tai: (Number(r.han_muc_du_phong) || 0) - (Number(r.han_muc_du_phong_hien_tai) || 0) - (Number(r.han_muc_du_phong_phat_sinh) || 0),
    }));
  if (!pageParam) {
    const { results } = await c.env.DB.prepare(`SELECT ${selectCols} ${baseSql} ORDER BY k.ma_ktv`)
      .bind(...duPhongBinds, ...binds)
      .all();
    return c.json({ rows: withMocHienTai(results as Record<string, unknown>[]) });
  }

  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(200, Math.max(1, (Math.trunc(Number(c.req.query("pageSize"))) || 50)));
  const offset = (page - 1) * pageSize;
  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total ${baseSql}`).bind(...duPhongBinds, ...binds).first<{ total: number }>();
  const { results } = await c.env.DB.prepare(`SELECT ${selectCols} ${baseSql} ORDER BY k.ma_ktv LIMIT ? OFFSET ?`)
    .bind(...duPhongBinds, ...binds, pageSize, offset)
    .all();
  return c.json({ rows: withMocHienTai(results as Record<string, unknown>[]), page, pageSize, total: countRow?.total ?? 0 });
});

settingsKtv.get("/version", async (c) => {
  const hash = await getOrComputeHash(c.env.DB, "ktv_lien_he", "ktv_lien_he", "ma_ktv");
  return c.json({ hash });
});

settingsKtv.post("/", adminOnly, async (c) => {
  const body = await c.req.json<{ ma_ktv: string; ten_hien_thi?: string; sdt?: string; ghi_chu?: string }>();
  if (!body.ma_ktv?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, sdt, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(ma_ktv) DO UPDATE SET
       ten_hien_thi = excluded.ten_hien_thi, sdt = excluded.sdt, ghi_chu = excluded.ghi_chu,
       nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat
     RETURNING *`,
  )
    .bind(body.ma_ktv.trim(), body.ten_hien_thi?.trim() || null, body.sdt?.trim() || null, body.ghi_chu?.trim() || null, user.email, nowVN())
    .first();

  await refreshHash(c.env.DB);
  return c.json(row, 201);
});

// POST /tao-cho-van-phong - { email, ma_ktv, ten_hien_thi?, khu_vuc_ma, ma_misa, ten_misa? } (2026-10-14, phan hoi "vai trò đó vẫn
// là gs, thêm trực tiếp ở mục quản lý nhân viên văn phòng"): TN dat ho cho 1 GS -> NGUOI_NHAN_HANG_KHONG_HOP_LE vi nguoi nhan hop le
// = co KTV HOAC Gmail gan 1 ma KTV dang hoat dong (nguoiNhanHangHopLe). Tao 1 ma KTV moi gan THANG Gmail cua tai khoan van phong, KHONG
// bat co la_ktv_dvbh/la_ve_tinh (provisionPlaceholderUser khong dong vao tai khoan da duyet) -> tai khoan van o the "Nhân viên văn
// phòng", vai tro giu nguyen. Bat buoc Ma MISA (thieu thi dat don bi KTV_CHUA_CO_MA_MISA). Tat ca kiem tra TRUOC khi ghi (khong de
// lai ma KTV mo coi nhu khi goi rieng POST / + PATCH /:ma/dat-mua-lk).
settingsKtv.post("/tao-cho-van-phong", adminOnly, async (c) => {
  const body = await c.req
    .json<{ email?: string; ma_ktv?: string; ten_hien_thi?: string; khu_vuc_ma?: string; ma_misa?: string; ten_misa?: string }>()
    .catch(() => ({}) as Record<string, string | undefined>);
  const email = body.email?.trim();
  const maKtv = body.ma_ktv?.trim();
  const khuVucMa = body.khu_vuc_ma?.trim();
  const maMisa = body.ma_misa?.trim();
  if (!email || !maKtv || !khuVucMa || !maMisa) return c.json({ error: "MISSING_FIELDS" }, 400);
  const db = c.env.DB;
  const u = await db
    .prepare("SELECT email, ten, trang_thai_duyet, la_ktv_dvbh, la_ve_tinh FROM users WHERE email = ?")
    .bind(email)
    .first<{ email: string; ten: string | null; trang_thai_duyet: string; la_ktv_dvbh: number; la_ve_tinh: number }>();
  if (!u) return c.json({ error: "NOT_FOUND" }, 404);
  if (u.trang_thai_duyet !== "Da duyet") return c.json({ error: "TAI_KHOAN_CHUA_DUYET", message: "Tài khoản chưa được duyệt" }, 400);
  if (u.la_ktv_dvbh || u.la_ve_tinh) return c.json({ error: "KHONG_PHAI_VAN_PHONG", message: "Tài khoản đang là KTV — gắn mã ở thẻ KTV hiện trường" }, 400);
  const maKhac = await maKtvDangDungEmail(db, email);
  if (maKhac) return c.json({ error: "EMAIL_DA_GAN_MA_KHAC", message: `Gmail này đã gắn mã KTV ${maKhac}` }, 409);
  const chinhCuaPhu = await emailChinhCuaGmail(db, email);
  if (chinhCuaPhu) return c.json({ error: "LA_GMAIL_PHU", message: `Gmail này đang là Gmail đăng nhập phụ của ${chinhCuaPhu}` }, 409);
  const trungMa = await db.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE UPPER(ma_ktv) = UPPER(?)").bind(maKtv).first<{ ma_ktv: string }>();
  if (trungMa) return c.json({ error: "MA_KTV_DA_TON_TAI", message: `Mã KTV ${trungMa.ma_ktv} đã có trong danh bạ — dùng "Chọn mã có sẵn"` }, 409);
  const kv = await db.prepare("SELECT ma FROM khu_vuc WHERE ma = ?").bind(khuVucMa).first();
  if (!kv) return c.json({ error: "KHU_VUC_NOT_FOUND" }, 400);
  const trungMisa = await db.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE UPPER(TRIM(ma_misa)) = UPPER(?) LIMIT 1").bind(maMisa).first<{ ma_ktv: string }>();
  if (trungMisa) return c.json({ error: "MA_MISA_DA_DUNG", message: `Mã MISA ${maMisa} đang thuộc mã KTV ${trungMisa.ma_ktv}` }, 409);

  const tenHienThi = body.ten_hien_thi?.trim() || u.ten || email;
  await db
    .prepare(
      `INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, vai_tro_ktv, email_dang_nhap, khu_vuc_ma, ma_misa, ten_misa, nguoi_cap_nhat, ngay_cap_nhat,
                                khu_vuc_xac_nhan_luc, khu_vuc_xac_nhan_boi)
       VALUES (?, ?, 'KTV', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(maKtv, tenHienThi, email, khuVucMa, maMisa, body.ten_misa?.trim() || null, c.get("user").email, nowVN(), nowVN(), c.get("user").email)
    .run();
  await resyncKhuVucDerivedFieldsForEmail(db, email);
  await relinkTonKhoForMaMisa(db, maKtv, maMisa);
  await refreshHash(db);
  return c.json({ ok: true, ma_ktv: maKtv }, 201);
});

// Cap tai khoan "users" PLACEHOLDER cho 1 KTV da ghep email_dang_nhap nhung CHUA TUNG dang nhap
// Google that - can thiet vi dat_don_hang.nguoi_nhan_hang/phieu_xuat_kho.nguoi_nhan_hang la FK THAT
// toi users(email). Khong co placeholder nay, "Nguoi nhan hang (tao ho)" se rong voi KTV chua tung
// mo app. trang_thai_duyet = 'Da duyet' NGAY (yeu cau 2026-08-25, hang muc #2: Admin da chu dong gan
// email dang nhap + vai tro luc nay roi nen khong can duyet lai lan 2 o Users module - khac truoc day
// giu "Cho duyet" cho toi khi Admin duyet that hoac chinh KTV do tu dang nhap). KHONG con nhan/ghi
// giam_sat_quan_ly o day (hang muc #3: users.giam_sat_quan_ly la nguon duy nhat, Admin gan rieng sau
// trong Users module) - da bo luon filterValidGsEmails() vi khong con noi nao can nua.
// FIX 2026-08-26 (phat hien tu bao cao "chờ duyệt vẫn có hàng loạt ktv"): truoc day dung
// "ON CONFLICT DO NOTHING" nen KHONG BAO GIO tai kich hoat 1 dong users co san dang "Cho duyet" (vd
// tao tu dot copy du lieu ban dau hoac tu 1 lan import truoc khi co quy tac "Da duyet NGAY") - KTV do
// bi ket vinh vien o "Cho duyet" cho toi khi TU dang nhap that (chi auth.ts co logic tai kich hoat).
// Doi sang DO UPDATE voi CASE WHEN GIONG HET pattern da dung dung o auth.ts (dong 102-122) de dam bao
// ca 2 duong (Admin gan email_dang_nhap TRUOC, hoac KTV tu dang nhap TRUOC) deu kich hoat dung.
async function provisionPlaceholderUser(
  db: D1Database,
  args: { email: string; ten: string | null; vaiTroKtv: string | null },
): Promise<D1PreparedStatement> {
  const laVeTinh = args.vaiTroKtv === "Ve tinh";
  const laKtvDvbh = laVeTinh ? 0 : 1;
  return db
    .prepare(
      `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, la_ktv_dvbh, la_ve_tinh)
       VALUES (?, ?, NULL, 'Da duyet', ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         ten = CASE WHEN trang_thai_duyet = 'Cho duyet' THEN excluded.ten ELSE ten END,
         trang_thai_duyet = CASE WHEN trang_thai_duyet = 'Cho duyet' THEN 'Da duyet' ELSE trang_thai_duyet END,
         la_ktv_dvbh = CASE WHEN trang_thai_duyet = 'Cho duyet' THEN excluded.la_ktv_dvbh ELSE la_ktv_dvbh END,
         la_ve_tinh = CASE WHEN trang_thai_duyet = 'Cho duyet' THEN excluded.la_ve_tinh ELSE la_ve_tinh END`,
    )
    .bind(args.email, args.ten, laKtvDvbh, laVeTinh ? 1 : 0);
}

// POST /api/settings/ktv-lien-he/bulk-import - { rows: [{ma_ktv, ten_hien_thi?, sdt?, ghi_chu?,
// vai_tro_ktv?, gmail?, giam_sat_quan_ly?, email_dang_nhap?, ma_misa?}], offset } - nhap/cap nhat
// HANG LOAT danh ba KTV tu file Excel (vd export tu he bao hanh goc), UPSERT theo ma_ktv (chay lai
// nhieu lan an toan). Neu co email_dang_nhap, cap luon "users" placeholder qua provisionPlaceholderUser
// - GIONG HET logic PATCH /:ma/dat-mua-lk o tren, chi khac o cho lam theo tung chunk. Chunk 25 dong/
// lan (thuan ghi DB, khong goi ngoai).
//
// FIX (phan hoi 2026-08-28: "import theo số cột trong file, cột không có trong file để nguyên") -
// TRUOC DAY chi khu_vuc_ma/cong_no moi "giu nguyen neu khong truyen" (COALESCE/CASE WHEN), moi truong
// con lai (ten_hien_thi, sdt, ghi_chu, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap) OVERWRITE
// THANG bang excluded.X - neu file import chi co cot "Mã KTV"+"Tên hiển thị" (khong co cot SĐT/Ghi
// chú/...), pickKtvField() o frontend tra ve undefined cho cac cot thieu -> gui len day thanh
// null -> XOA MAT du lieu cu cua CA CAC TRUONG KHONG CO Y DINH SUA. Doi TOAN BO cac truong con lai
// sang cung 1 pattern COALESCE(excluded.X, ktv_lien_he.X) - dong bo voi khu_vuc_ma/cong_no da co san,
// dam bao "cot khong co trong file = giu nguyen gia tri cu" cho MOI truong, dung nhu yeu cau. Danh
// doi CHAP NHAN DUOC: khong the dung import de XOA TRANG 1 truong da co gia tri (vd muon xoa Ghi chú
// cu) - phai sua tay tung dong o Modal "Sửa KTV", giong han che da co san voi khu_vuc_ma/cong_no.
settingsKtv.post("/bulk-import", adminOnly, async (c) => {
  const body = await c.req.json<{
    rows: {
      ma_ktv: string; ten_hien_thi?: string; sdt?: string; ghi_chu?: string;
      vai_tro_ktv?: string; gmail?: string; giam_sat_quan_ly?: string; email_dang_nhap?: string;
      khu_vuc_ma?: string; cong_no?: number; ma_misa?: string; ten_misa?: string;
      han_muc_du_phong?: number; han_muc_du_phong_hien_tai?: number;
    }[];
    offset: number;
  }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  // Han muc du phong / hien tai CHI sua o tab "Han muc du tru" (2026-10-26, migration 0098 - bang han_muc_du_tru theo Ma MISA, trigger do sang ktv_lien_he) -> bo qua o day.
  for (const r of body.rows) {
    delete r.han_muc_du_phong;
    delete r.han_muc_du_phong_hien_tai;
  }

  const CHUNK_SIZE = 25;
  const offset = Math.max(0, body.offset ?? 0);
  // Kieu lo (2026-10-03): client moi gui `rows` = CHINH lo + `total` (truoc gui lai ca file moi request); thieu total = kieu cu.
  const kieuLo = typeof (body as { total?: unknown }).total === "number";
  const total = kieuLo ? (body as { total?: number }).total! : body.rows.length;
  if (kieuLo && (body.rows.length > CHUNK_SIZE * 4 || (body.rows.length === 0 && offset < total))) return c.json({ error: "LO_KHONG_HOP_LE" }, 400);
  const chunk = kieuLo ? body.rows : body.rows.slice(offset, offset + CHUNK_SIZE);
  const user = c.get("user");
  const now = nowVN();
  const VAI_TRO_KTV_VALUES = ["KTV", "CTV", "Tram", "Ve tinh"];

  let success = 0;
  let errorCount = 0;
  const details: { ma_ktv: string; status: string }[] = [];
  // (them 2026-09-13) true neu BAT KY dong nao trong CHUNK NAY co truyen han_muc_du_phong_hien_tai -
  // dung de biet co can bump moc dung chung "du_phong_ktv_import_meta" sau khi xong CHUNK nay khong
  // (giong tinh than ktv_ton_kho_import_meta - moi lan du lieu du phong THAT SU duoc cap nhat).
  let anyDuPhongHienTaiChanged = false;

  for (const row of chunk) {
    const ma = row.ma_ktv?.trim();
    if (!ma) {
      errorCount++;
      details.push({ ma_ktv: "(rỗng)", status: "thieu_ma" });
      continue;
    }
    const vaiTroKtv = row.vai_tro_ktv?.trim() || null;
    if (vaiTroKtv && !VAI_TRO_KTV_VALUES.includes(vaiTroKtv)) {
      errorCount++;
      details.push({ ma_ktv: ma, status: "vai_tro_khong_hop_le" });
      continue;
    }
    const tenHienThi = row.ten_hien_thi?.trim() || null;
    const giamSatQuanLy = row.giam_sat_quan_ly?.trim() || null;
    const emailDangNhap = row.email_dang_nhap?.trim() || null;
    // khu_vuc_ma/cong_no (them 2026-08-26) - CHI cap nhat khi co truyen trong dong Excel (undefined =
    // giu nguyen gia tri cu, khac cac truong khac o tren vi day la 2 truong MOI, file import cu chua
    // co cot nay se khong vo tinh xoa mat du lieu da gan tay truoc do qua PATCH /:ma/dat-mua-lk).
    const khuVucMa = row.khu_vuc_ma?.trim() || null;
    const maMisa = row.ma_misa?.trim() || null;
    const tenMisa = row.ten_misa?.trim() || null;
    if (emailDangNhap) {
      const maKhac = await maKtvDangDungEmail(c.env.DB, emailDangNhap, ma);
      if (maKhac) {
        errorCount++;
        details.push({ ma_ktv: ma, status: `email_da_gan_ma_khac:${maKhac}` });
        continue;
      }
      const chinhCuaPhu = await emailChinhCuaGmail(c.env.DB, emailDangNhap);
      if (chinhCuaPhu) {
        errorCount++;
        details.push({ ma_ktv: ma, status: `la_gmail_phu_cua:${chinhCuaPhu}` });
        continue;
      }
    }
    // Bo sung Ma MISA cho ma CO SAN chua co Ma MISA, khu vuc chua xac nhan, file khong co khu vuc -> bo qua dong (2026-10-16, 0087).
    if (maMisa && !khuVucMa) {
      const cu = await c.env.DB.prepare("SELECT ma_misa, khu_vuc_xac_nhan_luc FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).first<{ ma_misa: string | null; khu_vuc_xac_nhan_luc: string | null }>();
      if (cu && !(cu.ma_misa ?? "").trim() && !cu.khu_vuc_xac_nhan_luc) {
        errorCount++;
        details.push({ ma_ktv: ma, status: "can_xac_nhan_khu_vuc" });
        continue;
      }
    }
    if (row.han_muc_du_phong_hien_tai !== undefined) anyDuPhongHienTaiChanged = true;
    try {
      await c.env.DB.prepare(
        `INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, sdt, ghi_chu, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap, khu_vuc_ma, cong_no, cong_no_cap_nhat_luc, ma_misa, ten_misa, han_muc_du_phong, han_muc_du_phong_hien_tai, han_muc_du_phong_cap_nhat_luc, nguoi_cap_nhat, ngay_cap_nhat,
                                  khu_vuc_xac_nhan_luc, khu_vuc_xac_nhan_boi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ma_ktv) DO UPDATE SET
           ten_hien_thi = COALESCE(excluded.ten_hien_thi, ktv_lien_he.ten_hien_thi),
           sdt = COALESCE(excluded.sdt, ktv_lien_he.sdt),
           ghi_chu = COALESCE(excluded.ghi_chu, ktv_lien_he.ghi_chu),
           gmail = COALESCE(excluded.gmail, ktv_lien_he.gmail),
           vai_tro_ktv = COALESCE(excluded.vai_tro_ktv, ktv_lien_he.vai_tro_ktv),
           giam_sat_quan_ly = COALESCE(excluded.giam_sat_quan_ly, ktv_lien_he.giam_sat_quan_ly),
           email_dang_nhap = COALESCE(excluded.email_dang_nhap, ktv_lien_he.email_dang_nhap),
           khu_vuc_ma = COALESCE(excluded.khu_vuc_ma, ktv_lien_he.khu_vuc_ma),
           cong_no = CASE WHEN excluded.cong_no IS NOT NULL THEN excluded.cong_no ELSE ktv_lien_he.cong_no END,
           cong_no_cap_nhat_luc = CASE WHEN excluded.cong_no IS NOT NULL THEN excluded.cong_no_cap_nhat_luc ELSE ktv_lien_he.cong_no_cap_nhat_luc END,
           ma_misa = COALESCE(excluded.ma_misa, ktv_lien_he.ma_misa),
           ten_misa = COALESCE(excluded.ten_misa, ktv_lien_he.ten_misa),
           han_muc_du_phong = CASE WHEN excluded.han_muc_du_phong IS NOT NULL THEN excluded.han_muc_du_phong ELSE ktv_lien_he.han_muc_du_phong END,
           han_muc_du_phong_hien_tai = CASE WHEN excluded.han_muc_du_phong_hien_tai IS NOT NULL THEN excluded.han_muc_du_phong_hien_tai ELSE ktv_lien_he.han_muc_du_phong_hien_tai END,
           han_muc_du_phong_cap_nhat_luc = CASE WHEN excluded.han_muc_du_phong_hien_tai IS NOT NULL THEN excluded.han_muc_du_phong_cap_nhat_luc ELSE ktv_lien_he.han_muc_du_phong_cap_nhat_luc END,
           -- File co cot khu vuc = Admin chon tay (2026-10-16, migration 0087).
           khu_vuc_xac_nhan_luc = CASE WHEN excluded.khu_vuc_ma IS NOT NULL THEN excluded.ngay_cap_nhat ELSE ktv_lien_he.khu_vuc_xac_nhan_luc END,
           khu_vuc_xac_nhan_boi = CASE WHEN excluded.khu_vuc_ma IS NOT NULL THEN excluded.nguoi_cap_nhat ELSE ktv_lien_he.khu_vuc_xac_nhan_boi END,
           nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat`,
      )
        .bind(
          ma, tenHienThi, row.sdt?.trim() || null, row.ghi_chu?.trim() || null, row.gmail?.trim() || null, vaiTroKtv, giamSatQuanLy, emailDangNhap,
          khuVucMa, row.cong_no ?? null, row.cong_no !== undefined ? now : null, maMisa, tenMisa,
          row.han_muc_du_phong ?? null, row.han_muc_du_phong_hien_tai ?? null, row.han_muc_du_phong_hien_tai !== undefined ? now : null,
          user.email, now,
          // Ma MOI tao tu file co cot khu vuc = Admin chon tay (0087) - ma da co di nhanh ON CONFLICT o tren.
          khuVucMa ? now : null, khuVucMa ? user.email : null,
        )
        .run();

      if (emailDangNhap) {
        await provisionPlaceholderUser(c.env.DB, { email: emailDangNhap, ten: tenHienThi, vaiTroKtv }).then((stmt) => stmt.run());
      }
      if (maMisa) await relinkTonKhoForMaMisa(c.env.DB, ma, maMisa);
      success++;
      details.push({ ma_ktv: ma, status: "thanh_cong" });
    } catch {
      errorCount++;
      details.push({ ma_ktv: ma, status: "loi_ghi_db" });
    }
  }

  const nextOffset = offset + (kieuLo ? chunk.length : CHUNK_SIZE);
  const done = nextOffset >= total;
  if (anyDuPhongHienTaiChanged) await setMocTinhDuPhong(c.env.DB, user.email, now);
  if (done) {
    await refreshHash(c.env.DB);
    // Phase 4: 1 lan duy nhat sau khi CA file import xong (khong phai tung chunk) - du lieu khu_vuc_ma
    // co the anh huong nhieu dong cung luc, resyncKhuVucDerivedFieldsForAll re hon goi tung dong.
    await resyncKhuVucDerivedFieldsForAll(c.env.DB);
  }
  return c.json({ done, nextOffset, success, errorCount, details });
});

// PATCH /:ma/dat-mua-lk mo rong 2026-08-26 (muc 3+4+8): them khu_vuc_ma (Khu vuc gan truc tiep cho
// KTV nay), ktv_cap1_phu_trach (CHI y nghia khi vai_tro_ktv='Ve tinh' - tro toi ma_ktv cua 1 KTV cap 1
// phu trach truc tiep, xem migration 0009), cong_no (nhap tay/import - tu dong ghi
// cong_no_cap_nhat_luc = gio hien tai moi lan gia tri thay doi, KHONG co cron dong bo).
// ============ Tab "Han muc du tru" (chot 2026-10-26, migration 0098) ============
// "bổ sung thêm 1 tab 'Hạn mức dữ trữ' trong danh sách KTV cho phép kế toán import, chỉnh sửa, tắt/bật ... ID Misa, 'Hạn mức dự phòng hiện
// tại', 'Hạn mức dự phòng' ... kết nối đến danh sách KTV thay thế vào cột ... (2 cột này sẽ không cho chỉnh sửa)". Bang han_muc_du_tru (khoa
// = Ma MISA, so khong phan biet hoa/thuong) la NGUON DUY NHAT; trigger do sang ktv_lien_he.han_muc_du_phong/_hien_tai cua MOI ma KTV co
// cung Ma MISA (dong tat = NULL) nen duPhongKtv.ts / danh sach KTV doc nhu cu. Sua "hien tai" -> doi moc tinh du phong (setMocTinhDuPhong).
function duocSuaHanMucDuTru(user: { la_ke_toan?: boolean | number | null; vai_tro?: string | null }): boolean {
  return !!user.la_ke_toan || user.vai_tro === "Admin";
}

settingsKtv.get("/han-muc-du-tru", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT h.ma_misa, h.han_muc_du_phong, h.han_muc_du_phong_hien_tai, h.bat_tat, h.ghi_chu, h.ngay_tao, h.cap_nhat_luc, h.cap_nhat_boi,
            (SELECT json_group_array(json_object('ma_ktv', k.ma_ktv, 'ten', COALESCE(k.ten_hien_thi, k.ten_misa, k.ma_ktv), 'ngung', COALESCE(k.ngung_hoat_dong, 0)))
               FROM ktv_lien_he k WHERE UPPER(TRIM(k.ma_misa)) = UPPER(h.ma_misa)) AS ktv_json
       FROM han_muc_du_tru h ORDER BY h.ma_misa`,
  ).all<Record<string, unknown> & { ktv_json: string | null }>();
  const rows = (results ?? []).map(({ ktv_json, ...r }) => ({ ...r, ktv: ktv_json ? JSON.parse(ktv_json) : [] }));
  return c.json({ rows, duoc_sua: duocSuaHanMucDuTru(c.get("user")), moc_tinh_du_phong: await getMocTinhDuPhong(c.env.DB) });
});

// POST /han-muc-du-tru {rows: [{ma_misa, han_muc_du_phong?, han_muc_du_phong_hien_tai?, bat_tat?, ghi_chu?}]} - them/sua 1 dong (form) va
// import theo lo (<= 200 dong/lan). Truong KHONG gui (undefined) = giu gia tri cu; null = xoa. Dong moi mac dinh bat.
settingsKtv.post("/han-muc-du-tru", async (c) => {
  const user = c.get("user");
  if (!duocSuaHanMucDuTru(user)) return c.json({ error: "FORBIDDEN" }, 403);
  const body = await c.req.json<{
    rows: { ma_misa: string; han_muc_du_phong?: number | null; han_muc_du_phong_hien_tai?: number | null; bat_tat?: boolean | number; ghi_chu?: string | null }[];
  }>();
  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 200) return c.json({ error: "INVALID_BODY" }, 400);
  const soHopLe = (v: unknown) => v === undefined || v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
  const now = nowVN();
  const loi: { ma_misa: string; loi: string }[] = [];
  const stmts: D1PreparedStatement[] = [];
  const daGap = new Set<string>();
  let doiHienTai = false;
  for (const r of body.rows) {
    const ma = String(r.ma_misa ?? "").trim();
    if (!ma) {
      loi.push({ ma_misa: "", loi: "THIEU_MA_MISA" });
      continue;
    }
    if (daGap.has(ma.toUpperCase())) {
      loi.push({ ma_misa: ma, loi: "TRUNG_TRONG_LO" });
      continue;
    }
    daGap.add(ma.toUpperCase());
    if (!soHopLe(r.han_muc_du_phong) || !soHopLe(r.han_muc_du_phong_hien_tai)) {
      loi.push({ ma_misa: ma, loi: "SO_TIEN_KHONG_HOP_LE" });
      continue;
    }
    if (r.han_muc_du_phong_hien_tai !== undefined) doiHienTai = true;
    const coHm = r.han_muc_du_phong !== undefined ? 1 : 0;
    const coHt = r.han_muc_du_phong_hien_tai !== undefined ? 1 : 0;
    const coBat = r.bat_tat !== undefined ? 1 : 0;
    const coGc = r.ghi_chu !== undefined ? 1 : 0;
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO han_muc_du_tru (ma_misa, han_muc_du_phong, han_muc_du_phong_hien_tai, bat_tat, ghi_chu, ngay_tao, cap_nhat_luc, cap_nhat_boi)
         VALUES (COALESCE((SELECT TRIM(k.ma_misa) FROM ktv_lien_he k WHERE UPPER(TRIM(k.ma_misa)) = UPPER(?1) LIMIT 1), ?1), ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ma_misa) DO UPDATE SET
           han_muc_du_phong = CASE WHEN ? THEN excluded.han_muc_du_phong ELSE han_muc_du_tru.han_muc_du_phong END,
           han_muc_du_phong_hien_tai = CASE WHEN ? THEN excluded.han_muc_du_phong_hien_tai ELSE han_muc_du_tru.han_muc_du_phong_hien_tai END,
           bat_tat = CASE WHEN ? THEN excluded.bat_tat ELSE han_muc_du_tru.bat_tat END,
           ghi_chu = CASE WHEN ? THEN excluded.ghi_chu ELSE han_muc_du_tru.ghi_chu END,
           cap_nhat_luc = excluded.cap_nhat_luc, cap_nhat_boi = excluded.cap_nhat_boi`,
      ).bind(
        ma, r.han_muc_du_phong ?? null, r.han_muc_du_phong_hien_tai ?? null, r.bat_tat === undefined ? 1 : r.bat_tat ? 1 : 0,
        r.ghi_chu?.trim() || null, now, now, user.email, coHm, coHt, coBat, coGc,
      ),
    );
  }
  if (stmts.length > 0) await c.env.DB.batch(stmts);
  if (doiHienTai) await setMocTinhDuPhong(c.env.DB, user.email, now);
  if (stmts.length > 0) await refreshHash(c.env.DB);
  // Ma MISA trong lo chua khop KTV nao (van luu - KTV them Ma MISA sau se tu nhan qua trigger) -> bao de Ke toan kiem tra.
  const maDaGhi = [...daGap].filter((m) => !loi.some((l) => l.ma_misa.toUpperCase() === m));
  let chuaKhop: string[] = [];
  if (maDaGhi.length > 0) {
    const { results } = await c.env.DB.prepare(
      `SELECT value AS ma FROM json_each(?) WHERE NOT EXISTS (SELECT 1 FROM ktv_lien_he k WHERE UPPER(TRIM(k.ma_misa)) = value)`,
    ).bind(JSON.stringify(maDaGhi)).all<{ ma: string }>();
    chuaKhop = (results ?? []).map((x) => x.ma);
  }
  return c.json({ ok: true, ghi: stmts.length, loi, chua_khop_ktv: chuaKhop });
});

settingsKtv.patch("/han-muc-du-tru/:ma/bat-tat", async (c) => {
  const user = c.get("user");
  if (!duocSuaHanMucDuTru(user)) return c.json({ error: "FORBIDDEN" }, 403);
  const { bat_tat } = await c.req.json<{ bat_tat: boolean }>();
  const r = await c.env.DB.prepare("UPDATE han_muc_du_tru SET bat_tat = ?, cap_nhat_luc = ?, cap_nhat_boi = ? WHERE ma_misa = ?")
    .bind(bat_tat ? 1 : 0, nowVN(), user.email, c.req.param("ma").trim())
    .run();
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  await refreshHash(c.env.DB);
  return c.json({ ok: true });
});

settingsKtv.delete("/han-muc-du-tru/:ma", async (c) => {
  const user = c.get("user");
  if (!duocSuaHanMucDuTru(user)) return c.json({ error: "FORBIDDEN" }, 403);
  const r = await c.env.DB.prepare("DELETE FROM han_muc_du_tru WHERE ma_misa = ?").bind(c.req.param("ma").trim()).run();
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  await refreshHash(c.env.DB);
  return c.json({ ok: true });
});

settingsKtv.patch("/:ma/dat-mua-lk", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{
    gmail?: string | null; vai_tro_ktv?: string | null; giam_sat_quan_ly?: string | null; email_dang_nhap?: string | null;
    khu_vuc_ma?: string | null; ktv_cap1_phu_trach?: string | null; cong_no?: number | null; ma_misa?: string | null; ten_misa?: string | null;
    han_muc_du_phong?: number | null; han_muc_du_phong_hien_tai?: number | null; xac_nhan_khu_vuc?: boolean;
  }>();
  // Han muc du phong / hien tai CHI sua o tab "Han muc du tru" (2026-10-26, migration 0098 - bang han_muc_du_tru theo Ma MISA, trigger do sang ktv_lien_he) -> bo qua o day.
  delete body.han_muc_du_phong;
  delete body.han_muc_du_phong_hien_tai;
  const existing = await c.env.DB.prepare(
    "SELECT ten_hien_thi, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap, khu_vuc_ma, ktv_cap1_phu_trach, cong_no, ma_misa, ten_misa, han_muc_du_phong, han_muc_du_phong_hien_tai, khu_vuc_xac_nhan_luc FROM ktv_lien_he WHERE ma_ktv = ?",
  )
    .bind(ma)
    .first<{
      ten_hien_thi: string | null; gmail: string | null; vai_tro_ktv: string | null; giam_sat_quan_ly: string | null; email_dang_nhap: string | null;
      khu_vuc_ma: string | null; ktv_cap1_phu_trach: string | null; cong_no: number | null; ma_misa: string | null; ten_misa: string | null;
      han_muc_du_phong: number | null; han_muc_du_phong_hien_tai: number | null; khu_vuc_xac_nhan_luc: string | null;
    }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  // Admin CHON TAY khu vuc = khu vuc khac gia tri cu, hoac tick xac nhan (2026-10-16, migration 0087). Form luon gui khu_vuc_ma nen
  // gui lai dung gia tri cu KHONG tinh la xac nhan.
  const khuVucGui = body.khu_vuc_ma !== undefined ? body.khu_vuc_ma?.trim() || null : undefined;
  const chonTayKhuVuc = khuVucGui !== undefined && khuVucGui !== null && (khuVucGui !== existing.khu_vuc_ma || !!body.xac_nhan_khu_vuc);
  const xn = await kiemTraXacNhanKhuVuc(c.env.DB, existing, body.ma_misa, chonTayKhuVuc ? khuVucGui : undefined);
  if (xn instanceof Response) return xn;

  if (body.vai_tro_ktv !== undefined && body.vai_tro_ktv !== null && !["KTV", "CTV", "Tram", "Ve tinh"].includes(body.vai_tro_ktv)) {
    return c.json({ error: "INVALID_VAI_TRO_KTV" }, 400);
  }

  const next = {
    gmail: body.gmail !== undefined ? body.gmail?.trim() || null : existing.gmail,
    vai_tro_ktv: body.vai_tro_ktv !== undefined ? body.vai_tro_ktv : existing.vai_tro_ktv,
    giam_sat_quan_ly: body.giam_sat_quan_ly !== undefined ? body.giam_sat_quan_ly?.trim() || null : existing.giam_sat_quan_ly,
    email_dang_nhap: body.email_dang_nhap !== undefined ? body.email_dang_nhap?.trim() || null : existing.email_dang_nhap,
    khu_vuc_ma: body.khu_vuc_ma !== undefined ? body.khu_vuc_ma?.trim() || null : existing.khu_vuc_ma,
    ktv_cap1_phu_trach: body.ktv_cap1_phu_trach !== undefined ? body.ktv_cap1_phu_trach?.trim() || null : existing.ktv_cap1_phu_trach,
    cong_no: body.cong_no !== undefined ? body.cong_no : existing.cong_no,
    ma_misa: body.ma_misa !== undefined ? body.ma_misa?.trim() || null : existing.ma_misa,
    ten_misa: body.ten_misa !== undefined ? body.ten_misa?.trim() || null : existing.ten_misa,
    han_muc_du_phong: body.han_muc_du_phong !== undefined ? body.han_muc_du_phong : existing.han_muc_du_phong,
    han_muc_du_phong_hien_tai: body.han_muc_du_phong_hien_tai !== undefined ? body.han_muc_du_phong_hien_tai : existing.han_muc_du_phong_hien_tai,
  };

  if (next.email_dang_nhap && next.email_dang_nhap !== existing.email_dang_nhap) {
    const maKhac = await maKtvDangDungEmail(c.env.DB, next.email_dang_nhap, ma);
    if (maKhac) return c.json({ error: "EMAIL_DA_GAN_MA_KHAC", message: `Gmail này đang là email đăng nhập của mã KTV ${maKhac} — 1 Gmail chỉ gắn 1 mã KTV` }, 409);
    const chinhCuaPhu = await emailChinhCuaGmail(c.env.DB, next.email_dang_nhap);
    if (chinhCuaPhu) return c.json({ error: "LA_GMAIL_PHU", message: `Gmail này đang là Gmail đăng nhập phụ của ${chinhCuaPhu} — gỡ ở tài khoản đó trước` }, 409);
  }
  if (next.khu_vuc_ma) {
    const khuVuc = await c.env.DB.prepare("SELECT ma FROM khu_vuc WHERE ma = ?").bind(next.khu_vuc_ma).first();
    if (!khuVuc) return c.json({ error: "KHU_VUC_NOT_FOUND" }, 400);
  }
  if (next.ktv_cap1_phu_trach) {
    if (next.ktv_cap1_phu_trach === ma) return c.json({ error: "INVALID_KTV_CAP1_PHU_TRACH" }, 400);
    const cap1 = await c.env.DB.prepare("SELECT vai_tro_ktv FROM ktv_lien_he WHERE ma_ktv = ?")
      .bind(next.ktv_cap1_phu_trach)
      .first<{ vai_tro_ktv: string | null }>();
    if (!cap1 || cap1.vai_tro_ktv === "Ve tinh") return c.json({ error: "INVALID_KTV_CAP1_PHU_TRACH" }, 400);
  }
  const congNoChanged = next.cong_no !== existing.cong_no;
  const congNoCapNhatLuc = congNoChanged ? nowVN() : undefined;
  const duPhongHienTaiChanged = next.han_muc_du_phong_hien_tai !== existing.han_muc_du_phong_hien_tai;
  const duPhongCapNhatLuc = duPhongHienTaiChanged ? nowVN() : undefined;

  await c.env.DB.prepare(
    `UPDATE ktv_lien_he SET gmail = ?, vai_tro_ktv = ?, giam_sat_quan_ly = ?, email_dang_nhap = ?, khu_vuc_ma = ?, ktv_cap1_phu_trach = ?, cong_no = ?, ma_misa = ?, ten_misa = ?, han_muc_du_phong = ?, han_muc_du_phong_hien_tai = ?${congNoChanged ? ", cong_no_cap_nhat_luc = ?" : ""}${duPhongHienTaiChanged ? ", han_muc_du_phong_cap_nhat_luc = ?" : ""}${xn ? ", khu_vuc_xac_nhan_luc = ?, khu_vuc_xac_nhan_boi = ?" : ""} WHERE ma_ktv = ?`,
  )
    .bind(
      ...[
        next.gmail, next.vai_tro_ktv, next.giam_sat_quan_ly, next.email_dang_nhap, next.khu_vuc_ma, next.ktv_cap1_phu_trach,
        next.cong_no ?? null, next.ma_misa, next.ten_misa, next.han_muc_du_phong ?? null, next.han_muc_du_phong_hien_tai ?? null,
      ],
      ...(congNoChanged ? [congNoCapNhatLuc] : []),
      ...(duPhongHienTaiChanged ? [duPhongCapNhatLuc] : []),
      ...(xn ? [nowVN(), c.get("user").email] : []),
      ma,
    )
    .run();
  if (duPhongHienTaiChanged) await setMocTinhDuPhong(c.env.DB, c.get("user").email, duPhongCapNhatLuc!);

  if (next.email_dang_nhap) {
    await provisionPlaceholderUser(c.env.DB, { email: next.email_dang_nhap, ten: existing.ten_hien_thi, vaiTroKtv: next.vai_tro_ktv }).then((stmt) => stmt.run());
    // Phase 4: khu_vuc_ma/ktv_cap1_phu_trach vua doi (hoac tai khoan vua duoc provision) - dong bo
    // ngay giam_sat_quan_ly/tram_cha cua chinh tai khoan nay - xem lib/khuVucSync.ts.
    await resyncKhuVucDerivedFieldsForEmail(c.env.DB, next.email_dang_nhap);
  }
  // Ghep lai email_dang_nhap khac (hiem gap) - dong bo not "email cu" de xoa gia tri con sot lai
  // (email cu khong con ktv_lien_he nao tro toi nua nen resync se tra ve NULL, dung y nghia).
  if (existing.email_dang_nhap && existing.email_dang_nhap !== next.email_dang_nhap) {
    await resyncKhuVucDerivedFieldsForEmail(c.env.DB, existing.email_dang_nhap);
  }
  if (next.ma_misa) await relinkTonKhoForMaMisa(c.env.DB, ma, next.ma_misa);

  await refreshHash(c.env.DB);
  return c.json({ ok: true });
});

// PATCH /:ma/cong-no-misa (them 2026-09-05, phan hoi "đẩy ra menu để các vai trò nhân viên văn phòng
// có thể xem được thông tin (cấp quyền cho kế toán quyền sửa trần công nợ, mã misa, tên misa của
// KTV)") - uy quyen RIENG cho Ke toan sua DUNG 3 truong nay, KHONG dung chung PATCH /:ma/dat-mua-lk o
// tren (route do van Admin-only, giu nguyen khong doi de tranh rui ro cho luong da chay that). Replicate
// dung cach stamp cong_no_cap_nhat_luc chi khi gia tri THAY DOI (giong het logic /:ma/dat-mua-lk).
// TN (2026-09-30, "cho phép tn sửa mã misa + tên misa của ktv"): CHI 2 truong ma_misa/ten_misa - cong no/han muc
// gui len bi bo qua (van chi Ke toan/Admin sua duoc).
// Bo sung Ma MISA (truoc trong -> co gia tri) cho KTV co khu vuc CHUA TUNG duoc chon tay/xac nhan (khu_vuc_xac_nhan_luc NULL - tao
// tu ETX, he thong tu gan) -> bat buoc nguoi bo sung xac nhan / chon lai khu vuc (chot 2026-10-16, migration 0087). Tra:
//  - Response 409 CAN_XAC_NHAN_KHU_VUC (kem khu vuc hien tai) khi can ma chua gui khuVucXacNhan;
//  - { khuVucMa } khi co khuVucXacNhan hop le (ghi khu vuc + danh dau da xac nhan); null khi khong lien quan.
async function kiemTraXacNhanKhuVuc(
  db: D1Database,
  ktv: { ma_misa: string | null; khu_vuc_ma: string | null; khu_vuc_xac_nhan_luc: string | null },
  maMisaGui: string | null | undefined,
  khuVucXacNhan: string | null | undefined,
): Promise<Response | { khuVucMa: string } | null> {
  if (khuVucXacNhan !== undefined) {
    const ma = khuVucXacNhan?.trim();
    if (!ma) return Response.json({ error: "THIEU_KHU_VUC", message: "Chọn khu vực của KTV" }, { status: 400 });
    const kv = await db.prepare("SELECT ma FROM khu_vuc WHERE ma = ?").bind(ma).first();
    if (!kv) return Response.json({ error: "KHU_VUC_NOT_FOUND" }, { status: 400 });
    return { khuVucMa: ma };
  }
  const boSungMisa = !(ktv.ma_misa ?? "").trim() && !!maMisaGui?.trim();
  if (boSungMisa && !ktv.khu_vuc_xac_nhan_luc) {
    return Response.json(
      { error: "CAN_XAC_NHAN_KHU_VUC", message: "Khu vực của KTV chưa được chọn tay lần nào — xác nhận hoặc chọn lại khu vực trước khi lưu Mã MISA", khu_vuc_ma: ktv.khu_vuc_ma },
      { status: 409 },
    );
  }
  return null;
}

settingsKtv.patch("/:ma/cong-no-misa", async (c) => {
  const user = c.get("user");
  const duocSuaTien = !!user.la_ke_toan || user.vai_tro === "Admin";
  if (!duocSuaTien && !user.la_tac_nghiep) return c.json({ error: "FORBIDDEN" }, 403);

  const ma = c.req.param("ma");
  const body = await c.req.json<{
    cong_no?: number | null; ma_misa?: string | null; ten_misa?: string | null;
    han_muc_du_phong?: number | null; han_muc_du_phong_hien_tai?: number | null;
    // Xac nhan khu vuc (2026-10-16, migration 0087) - BAT BUOC khi bo sung Ma MISA cho KTV co khu vuc chua tung duoc chon tay.
    khu_vuc_ma?: string | null; xac_nhan_khu_vuc?: boolean;
  }>();
  if (!duocSuaTien) delete body.cong_no;
  // Han muc du phong / hien tai CHI sua o tab "Han muc du tru" (2026-10-26, migration 0098 - bang han_muc_du_tru theo Ma MISA, trigger do sang ktv_lien_he) -> bo qua o day.
  delete body.han_muc_du_phong;
  delete body.han_muc_du_phong_hien_tai;
  const existing = await c.env.DB.prepare(
    "SELECT cong_no, ma_misa, ten_misa, han_muc_du_phong, han_muc_du_phong_hien_tai, khu_vuc_ma, khu_vuc_xac_nhan_luc, email_dang_nhap FROM ktv_lien_he WHERE ma_ktv = ?",
  )
    .bind(ma)
    .first<{
      cong_no: number | null; ma_misa: string | null; ten_misa: string | null; han_muc_du_phong: number | null; han_muc_du_phong_hien_tai: number | null;
      khu_vuc_ma: string | null; khu_vuc_xac_nhan_luc: string | null; email_dang_nhap: string | null;
    }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const xn = await kiemTraXacNhanKhuVuc(c.env.DB, existing, body.ma_misa, body.xac_nhan_khu_vuc ? body.khu_vuc_ma : undefined);
  if (xn instanceof Response) return xn;

  const next = {
    cong_no: body.cong_no !== undefined ? body.cong_no : existing.cong_no,
    ma_misa: body.ma_misa !== undefined ? body.ma_misa?.trim() || null : existing.ma_misa,
    ten_misa: body.ten_misa !== undefined ? body.ten_misa?.trim() || null : existing.ten_misa,
    han_muc_du_phong: body.han_muc_du_phong !== undefined ? body.han_muc_du_phong : existing.han_muc_du_phong,
    han_muc_du_phong_hien_tai: body.han_muc_du_phong_hien_tai !== undefined ? body.han_muc_du_phong_hien_tai : existing.han_muc_du_phong_hien_tai,
  };
  const congNoChanged = next.cong_no !== existing.cong_no;
  const congNoCapNhatLuc = congNoChanged ? nowVN() : undefined;
  const duPhongHienTaiChanged = next.han_muc_du_phong_hien_tai !== existing.han_muc_du_phong_hien_tai;
  const duPhongCapNhatLuc = duPhongHienTaiChanged ? nowVN() : undefined;

  await c.env.DB.prepare(
    `UPDATE ktv_lien_he SET cong_no = ?, ma_misa = ?, ten_misa = ?, han_muc_du_phong = ?, han_muc_du_phong_hien_tai = ?${congNoChanged ? ", cong_no_cap_nhat_luc = ?" : ""}${duPhongHienTaiChanged ? ", han_muc_du_phong_cap_nhat_luc = ?" : ""}${xn ? ", khu_vuc_ma = ?, khu_vuc_xac_nhan_luc = ?, khu_vuc_xac_nhan_boi = ?" : ""} WHERE ma_ktv = ?`,
  )
    .bind(
      ...[next.cong_no ?? null, next.ma_misa, next.ten_misa, next.han_muc_du_phong ?? null, next.han_muc_du_phong_hien_tai ?? null],
      ...(congNoChanged ? [congNoCapNhatLuc] : []),
      ...(duPhongHienTaiChanged ? [duPhongCapNhatLuc] : []),
      ...(xn ? [xn.khuVucMa, nowVN(), user.email] : []),
      ma,
    )
    .run();
  // Khu vuc doi -> dong bo GS phu trach / email_gs don (khu vuc don/PXK do trigger trg_ktv_khu_vuc_don_u tu tinh lai).
  if (xn && xn.khuVucMa !== existing.khu_vuc_ma && existing.email_dang_nhap) await resyncKhuVucDerivedFieldsForEmail(c.env.DB, existing.email_dang_nhap);
  if (next.ma_misa) await relinkTonKhoForMaMisa(c.env.DB, ma, next.ma_misa);
  if (duPhongHienTaiChanged) await setMocTinhDuPhong(c.env.DB, c.get("user").email, duPhongCapNhatLuc!);

  await refreshHash(c.env.DB);
  return c.json({ ok: true });
});

// POST /bulk-import-cong-no-misa (2026-09-29, "Bổ sung thêm chức năng import ở Danh sách KTV cho vai trò kế toán,
// họ có thể import trần công nợ... dựa theo Mã tài khoản MISA") - Ke toan (+ Admin) import HANG LOAT dung cac truong
// da uy quyen o PATCH /:ma/cong-no-misa (tran cong no, han muc du phong, han muc du phong hien tai, ten tren MISA),
// KHOP DONG theo `ma_misa` (khong theo ma_ktv nhu /bulk-import cua Admin, khong tao KTV moi). O trong/khong co cot =
// giu nguyen gia tri cu; 0 la gia tri hop le. Ma MISA khong khop KTV nao / khop >1 KTV -> bo qua dong do, bao loi.
// Chia chunk 25 dong/lan (offset) giong /bulk-import.
settingsKtv.post("/bulk-import-cong-no-misa", async (c) => {
  const user = c.get("user");
  if (!user.la_ke_toan && user.vai_tro !== "Admin") return c.json({ error: "FORBIDDEN" }, 403);
  const body = await c.req.json<{
    // ma_ktv (2026-09-30): co thi KHOP THEO MA KTV va GAN/DOI ma_misa = ma_misa cua dong (KTV chua co ma MISA); khong
    // co thi khop theo ma_misa nhu cu.
    rows: { ma_misa: string; ma_ktv?: string | null; cong_no?: number | null; han_muc_du_phong?: number | null; han_muc_du_phong_hien_tai?: number | null; ten_misa?: string | null }[];
    offset: number;
  }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  // Han muc du phong / hien tai CHI sua o tab "Han muc du tru" (2026-10-26, migration 0098 - bang han_muc_du_tru theo Ma MISA, trigger do sang ktv_lien_he) -> bo qua o day.
  for (const r of body.rows) {
    delete r.han_muc_du_phong;
    delete r.han_muc_du_phong_hien_tai;
  }

  const CHUNK_SIZE = 25;
  const offset = Math.max(0, body.offset ?? 0);
  // Kieu lo (2026-10-03): client moi gui `rows` = CHINH lo + `total` (truoc gui lai ca file moi request); thieu total = kieu cu.
  const kieuLo = typeof (body as { total?: unknown }).total === "number";
  const total = kieuLo ? (body as { total?: number }).total! : body.rows.length;
  if (kieuLo && (body.rows.length > CHUNK_SIZE * 4 || (body.rows.length === 0 && offset < total))) return c.json({ error: "LO_KHONG_HOP_LE" }, 400);
  const chunk = kieuLo ? body.rows : body.rows.slice(offset, offset + CHUNK_SIZE);
  const now = nowVN();
  const soHopLe = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

  let success = 0;
  let errorCount = 0;
  let anyDuPhongHienTaiChanged = false;
  const details: { ma_misa: string; status: string; ma_ktv?: string }[] = [];

  for (const row of chunk) {
    const maMisa = typeof row.ma_misa === "string" ? row.ma_misa.trim() : String(row.ma_misa ?? "").trim();
    if (!maMisa) {
      errorCount++;
      details.push({ ma_misa: "(rỗng)", status: "thieu_ma_misa" });
      continue;
    }
    const maKtv = typeof row.ma_ktv === "string" ? row.ma_ktv.trim() : String(row.ma_ktv ?? "").trim();
    let ganMaMisa = false;
    let ktvs: { ma_ktv: string; ma_misa: string | null; cong_no: number | null; han_muc_du_phong: number | null; han_muc_du_phong_hien_tai: number | null; khu_vuc_xac_nhan_luc?: string | null }[];
    if (maKtv) {
      const k = await c.env.DB.prepare(
        "SELECT ma_ktv, ma_misa, cong_no, han_muc_du_phong, han_muc_du_phong_hien_tai, khu_vuc_xac_nhan_luc FROM ktv_lien_he WHERE UPPER(TRIM(ma_ktv)) = UPPER(?)",
      )
        .bind(maKtv)
        .first<(typeof ktvs)[number]>();
      if (!k) {
        errorCount++;
        details.push({ ma_misa: maMisa, status: "khong_tim_thay_ma_ktv", ma_ktv: maKtv });
        continue;
      }
      // Ma MISA dang thuoc KTV KHAC -> khong gan (tranh 2 KTV cung ma, import sau khong khop duoc).
      const khac = await c.env.DB.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE UPPER(TRIM(ma_misa)) = UPPER(?) AND ma_ktv <> ? LIMIT 1")
        .bind(maMisa, k.ma_ktv)
        .first<{ ma_ktv: string }>();
      if (khac) {
        errorCount++;
        details.push({ ma_misa: maMisa, status: "ma_misa_cua_ktv_khac", ma_ktv: `${k.ma_ktv} ≠ ${khac.ma_ktv}` });
        continue;
      }
      ganMaMisa = (k.ma_misa ?? "").trim() !== maMisa;
      // Bo sung Ma MISA (truoc trong) cho KTV khu vuc chua xac nhan -> phai sua tung KTV de xac nhan khu vuc (2026-10-16, 0087).
      if (ganMaMisa && !(k.ma_misa ?? "").trim() && !k.khu_vuc_xac_nhan_luc) {
        errorCount++;
        details.push({ ma_misa: maMisa, status: "can_xac_nhan_khu_vuc", ma_ktv: k.ma_ktv });
        continue;
      }
      ktvs = [k];
    } else {
      ktvs = (
        await c.env.DB.prepare(
          "SELECT ma_ktv, ma_misa, cong_no, han_muc_du_phong, han_muc_du_phong_hien_tai FROM ktv_lien_he WHERE UPPER(TRIM(ma_misa)) = UPPER(?)",
        )
          .bind(maMisa)
          .all<(typeof ktvs)[number]>()
      ).results;
    }
    if (ktvs.length === 0) {
      errorCount++;
      details.push({ ma_misa: maMisa, status: "khong_tim_thay" });
      continue;
    }
    if (ktvs.length > 1) {
      errorCount++;
      details.push({ ma_misa: maMisa, status: "trung_ma_misa", ma_ktv: ktvs.map((k) => k.ma_ktv).join(", ") });
      continue;
    }
    const k = ktvs[0];
    const sets: string[] = [];
    const binds: unknown[] = [];
    if (soHopLe(row.cong_no)) {
      sets.push("cong_no = ?");
      binds.push(row.cong_no);
      if (row.cong_no !== k.cong_no) {
        sets.push("cong_no_cap_nhat_luc = ?");
        binds.push(now);
      }
    }
    if (soHopLe(row.han_muc_du_phong)) {
      sets.push("han_muc_du_phong = ?");
      binds.push(row.han_muc_du_phong);
    }
    if (soHopLe(row.han_muc_du_phong_hien_tai)) {
      sets.push("han_muc_du_phong_hien_tai = ?");
      binds.push(row.han_muc_du_phong_hien_tai);
      if (row.han_muc_du_phong_hien_tai !== k.han_muc_du_phong_hien_tai) {
        sets.push("han_muc_du_phong_cap_nhat_luc = ?");
        binds.push(now);
        anyDuPhongHienTaiChanged = true;
      }
    }
    if (typeof row.ten_misa === "string" && row.ten_misa.trim()) {
      sets.push("ten_misa = ?");
      binds.push(row.ten_misa.trim());
    }
    if (ganMaMisa) {
      sets.push("ma_misa = ?");
      binds.push(maMisa);
    }
    if (sets.length === 0 && maKtv) {
      // Khop theo Ma KTV, ma MISA da dung san, khong cot nao khac -> khong can ghi, tinh la thanh cong.
      success++;
      details.push({ ma_misa: maMisa, status: "thanh_cong", ma_ktv: k.ma_ktv });
      continue;
    }
    if (sets.length === 0) {
      errorCount++;
      details.push({ ma_misa: maMisa, status: "khong_co_du_lieu", ma_ktv: k.ma_ktv });
      continue;
    }
    try {
      await c.env.DB.prepare(`UPDATE ktv_lien_he SET ${sets.join(", ")}, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_ktv = ?`)
        .bind(...binds, user.email, now, k.ma_ktv)
        .run();
      if (ganMaMisa) await relinkTonKhoForMaMisa(c.env.DB, k.ma_ktv, maMisa);
      success++;
      details.push({ ma_misa: maMisa, status: "thanh_cong", ma_ktv: k.ma_ktv });
    } catch {
      errorCount++;
      details.push({ ma_misa: maMisa, status: "loi_ghi_db", ma_ktv: k.ma_ktv });
    }
  }

  const nextOffset = offset + (kieuLo ? chunk.length : CHUNK_SIZE);
  const done = nextOffset >= total;
  if (anyDuPhongHienTaiChanged) await setMocTinhDuPhong(c.env.DB, user.email, now);
  if (done) await refreshHash(c.env.DB);
  return c.json({ done, nextOffset, success, errorCount, details });
});

settingsKtv.post("/backfill-users", adminOnly, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT ten_hien_thi, vai_tro_ktv, email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL",
  ).all<{ ten_hien_thi: string | null; vai_tro_ktv: string | null; email_dang_nhap: string }>();
  const rows = results as { ten_hien_thi: string | null; vai_tro_ktv: string | null; email_dang_nhap: string }[];
  if (rows.length === 0) return c.json({ ok: true, checked: 0 });

  const statements = await Promise.all(
    rows.map((r) => provisionPlaceholderUser(c.env.DB, { email: r.email_dang_nhap, ten: r.ten_hien_thi, vaiTroKtv: r.vai_tro_ktv })),
  );
  await c.env.DB.batch(statements);
  await resyncKhuVucDerivedFieldsForAll(c.env.DB);
  return c.json({ ok: true, checked: rows.length });
});

// PATCH /:ma/bat-tat {bat} - Admin BAT/TAT tai khoan KTV (2026-10-01): tat = users.bi_khoa = 1 cua email dang nhap -> khong
// dang nhap duoc (loadUser tra DISABLED), khong tao don, khong hien trong o chon "Nguoi nhan hang" va API tao don/import chan
// (resolveNguoiNhanHang NGUOI_NHAN_HANG_DA_TAT). Don cu giu nguyen. Trigger md_danh_ba tu lam moi cache danh ba tren may.
settingsKtv.patch("/:ma/bat-tat", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ bat?: boolean }>();
  if (typeof body.bat !== "boolean") return c.json({ error: "MISSING_BAT" }, 400);
  const ktv = await c.env.DB.prepare("SELECT email_dang_nhap FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).first<{ email_dang_nhap: string | null }>();
  if (!ktv) return c.json({ error: "NOT_FOUND" }, 404);
  if (!ktv.email_dang_nhap) return c.json({ error: "CHUA_CO_TAI_KHOAN" }, 400);
  const coTaiKhoan = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(ktv.email_dang_nhap).first();
  if (!coTaiKhoan) return c.json({ error: "CHUA_CO_TAI_KHOAN" }, 400);
  // SUA 2026-10-01 (migration 0060): tat THEO MA (ktv_lien_he.ngung_hoat_dong) - nhieu ma co the dung CHUNG 1 Gmail. Bat 1 ma =
  // mo khoa Gmail; tat 1 ma chi khoa Gmail khi KHONG con ma nao khac cung Gmail dang bat.
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE ktv_lien_he SET ngung_hoat_dong = ? WHERE ma_ktv = ?").bind(body.bat ? 0 : 1, ma),
    body.bat
      ? c.env.DB.prepare("UPDATE users SET bi_khoa = 0, updated_at = ? WHERE email = ?").bind(now, ktv.email_dang_nhap)
      : c.env.DB.prepare(
          `UPDATE users SET bi_khoa = 1, updated_at = ? WHERE email = ?
             AND NOT EXISTS (SELECT 1 FROM ktv_lien_he WHERE email_dang_nhap = ? AND ngung_hoat_dong = 0)`,
        ).bind(now, ktv.email_dang_nhap, ktv.email_dang_nhap),
  ]);
  const conMaKhac = await c.env.DB.prepare(
    "SELECT GROUP_CONCAT(ma_ktv, ', ') AS mas FROM ktv_lien_he WHERE email_dang_nhap = ? AND ma_ktv <> ? AND ngung_hoat_dong = 0",
  )
    .bind(ktv.email_dang_nhap, ma)
    .first<{ mas: string | null }>();
  return c.json({ ok: true, ma_khac_dang_bat: conMaKhac?.mas ?? null });
});

// GMAIL DANG NHAP PHU (chot 2026-10-19, v1.367, migration 0091, lib/gmailPhu.ts) - KTV co nhieu Gmail hay dang nhap nham:
// Admin gan Gmail con lai lam Gmail phu cua tai khoan (= Email dang nhap cua ma KTV nay). Dang nhap bang Gmail phu = vao dung
// tai khoan chinh (routes/auth.ts). Gan xong: phien dang mo cua Gmail phu bi thu hoi (phien_ban_phien + 1) de lan sau dang
// nhap la vao tai khoan chinh; ma KTV DA TAT con giu Gmail phu lam Email dang nhap thi go ra (1 Gmail chi 1 vai tro).
settingsKtv.post("/:ma/gmail-phu", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ email?: string; ghi_chu?: string }>();
  const emailPhu = chuanHoaGmail(body.email ?? "");
  const ktv = await c.env.DB.prepare("SELECT email_dang_nhap FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).first<{ email_dang_nhap: string | null }>();
  if (!ktv) return c.json({ error: "NOT_FOUND" }, 404);
  if (!ktv.email_dang_nhap) return c.json({ error: "CHUA_CO_TAI_KHOAN" }, 400);
  const coTaiKhoan = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(ktv.email_dang_nhap).first();
  if (!coTaiKhoan) return c.json({ error: "CHUA_CO_TAI_KHOAN" }, 400);
  const kt = await kiemTraGmailPhu(c.env.DB, ktv.email_dang_nhap, emailPhu);
  if (!kt.ok) return c.json({ error: kt.error, chi_tiet: kt.chi_tiet ?? null }, 409);
  const now = nowVN();
  const ghiChu = body.ghi_chu?.trim() || null;
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO users_gmail_phu (email_phu, email_chinh, nguoi_them, ngay_them, ghi_chu) VALUES (?, ?, ?, ?, ?)")
      .bind(emailPhu, ktv.email_dang_nhap, c.get("realEmail") ?? null, now, ghiChu),
    c.env.DB.prepare("UPDATE ktv_lien_he SET email_dang_nhap = NULL, ngay_cap_nhat = ? WHERE LOWER(TRIM(email_dang_nhap)) = ? AND COALESCE(ngung_hoat_dong, 0) = 1")
      .bind(now, emailPhu),
    c.env.DB.prepare("UPDATE users SET phien_ban_phien = phien_ban_phien + 1, updated_at = ? WHERE LOWER(email) = ?").bind(now, emailPhu),
  ]);
  await refreshHash(c.env.DB);
  return c.json({ ok: true });
});

// DELETE /:ma/gmail-phu?email= - go Gmail phu. Phien dang mo bang Gmail do (da ky = email chinh) VAN con toi khi het han -
// Admin muon chan ngay thi dung "Đăng xuất mọi thiết bị" cua tai khoan chinh.
settingsKtv.delete("/:ma/gmail-phu", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const emailPhu = chuanHoaGmail(c.req.query("email") ?? "");
  const ktv = await c.env.DB.prepare("SELECT email_dang_nhap FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).first<{ email_dang_nhap: string | null }>();
  if (!ktv?.email_dang_nhap) return c.json({ error: "NOT_FOUND" }, 404);
  const r = await c.env.DB.prepare("DELETE FROM users_gmail_phu WHERE email_phu = ? AND email_chinh = ?").bind(emailPhu, ktv.email_dang_nhap).run();
  if (!r.meta.changes) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// POST /:ma/doi-ma { ma_moi, ten_hien_thi?, xac_nhan_gop? } (chot 2026-10-08, phan hoi "danh sach KTV dong bo tu dong va tao tai
// khoan tu ETX tuy nhien 1 so KTV se phai sua lai ma KTV va sua ten") - Admin doi ma KTV (vd ma tu tao tu ETX = Ma NV) sang ma
// dung, kem sua ten. Ma CU XOA HAN (chot nguoi dung) - luu y dong bo sang DVBH/khovan/vipham chi upsert, khong dong bo xoa, nen
// ben do van con dong ma cu.
//   - Ma moi CHUA co: doi ten ma (giu nguyen moi cot). PK co FK tu ktv_cap1_phu_trach (Ve tinh) -> defer_foreign_keys trong batch.
//   - Ma moi DA co (vd ma cu trong danh ba chua gan Gmail): GOP - ma moi nhan Gmail dang nhap + trang thai bat/tat cua ma cu, cac
//     cot con lai GIU gia tri cua ma moi, cot nao trong thi lay tu ma cu. Ma moi da gan Gmail KHAC -> MA_MOI_DA_GAN_GMAIL_KHAC.
//     Lan dau tra 409 CAN_XAC_NHAN_GOP (kem thong tin ma moi) de FE hoi lai; gui lai voi xac_nhan_gop = true moi gop.
// Bang co cot ma KTV: ktv_lien_he.ktv_cap1_phu_trach, ktv_ton_kho(_tam), etx_nhan_su, cong_no_0d_ktv - them bang moi co ma KTV
// thi them vao day. Don/PXK luu theo EMAIL nen khong doi.
settingsKtv.post("/:ma/doi-ma", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ ma_moi?: string; ten_hien_thi?: string; xac_nhan_gop?: boolean }>().catch(() => ({}) as { ma_moi?: string; ten_hien_thi?: string; xac_nhan_gop?: boolean });
  const maMoi = (body.ma_moi ?? "").trim();
  const tenMoi = body.ten_hien_thi?.trim() || null;
  if (!maMoi) return c.json({ error: "THIEU_MA_MOI" }, 400);
  const db = c.env.DB;
  type Ktv = { ma_ktv: string; ten_hien_thi: string | null; email_dang_nhap: string | null; ma_misa: string | null; khu_vuc_ma: string | null; ghi_chu: string | null };
  const cu = await db.prepare("SELECT ma_ktv, ten_hien_thi, email_dang_nhap, ma_misa, khu_vuc_ma, ghi_chu FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).first<Ktv>();
  if (!cu) return c.json({ error: "NOT_FOUND" }, 404);
  const dich = await db
    .prepare("SELECT ma_ktv, ten_hien_thi, email_dang_nhap, ma_misa, khu_vuc_ma, ghi_chu FROM ktv_lien_he WHERE UPPER(ma_ktv) = UPPER(?) AND ma_ktv <> ?")
    .bind(maMoi, ma)
    .first<Ktv>();
  if (!dich && maMoi === ma) {
    if (!tenMoi || tenMoi === cu.ten_hien_thi) return c.json({ error: "KHONG_CO_THAY_DOI" }, 400);
    await db.prepare("UPDATE ktv_lien_he SET ten_hien_thi = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_ktv = ?").bind(tenMoi, c.get("user").email, nowVN(), ma).run();
    await refreshHash(db);
    return c.json({ ok: true, ma_ktv: ma, gop: false });
  }
  const now = nowVN();
  const user = c.get("user");
  const ghiChu = (truoc: string | null, noiDung: string) => [truoc?.trim(), `${noiDung} (${now.slice(0, 10)}, ${user.email})`].filter(Boolean).join(" | ");
  const veTinh = await db
    .prepare("SELECT email_dang_nhap FROM ktv_lien_he WHERE ktv_cap1_phu_trach = ? AND email_dang_nhap IS NOT NULL")
    .bind(ma)
    .all<{ email_dang_nhap: string }>();
  const maDich = dich?.ma_ktv ?? maMoi;
  // Chuyen cot ma KTV o cac bang lien quan (dung chung cho doi ten + gop).
  const chuyenThamChieu = [
    db.prepare("UPDATE ktv_lien_he SET ktv_cap1_phu_trach = CASE WHEN ma_ktv = ? THEN NULL ELSE ? END WHERE ktv_cap1_phu_trach = ?").bind(maDich, maDich, ma),
    db.prepare("UPDATE ktv_ton_kho SET ma_ktv = ? WHERE ma_ktv = ?").bind(maDich, ma),
    db.prepare("UPDATE ktv_ton_kho_tam SET ma_ktv = ? WHERE ma_ktv = ?").bind(maDich, ma),
    db.prepare("UPDATE etx_nhan_su SET ma_ktv = ?, updated_at = ? WHERE ma_ktv = ?").bind(maDich, now, ma),
    db.prepare("UPDATE OR IGNORE cong_no_0d_ktv SET ma_ktv = ? WHERE ma_ktv = ?").bind(maDich, ma),
    db.prepare("DELETE FROM cong_no_0d_ktv WHERE ma_ktv = ?").bind(ma),
    // Nhom KH le (migration 0074) - ma nhom doi theo.
    db.prepare("UPDATE OR IGNORE khach_le_nhom SET ma_ktv = ? WHERE ma_ktv = ?").bind(maDich, ma),
    db.prepare("DELETE FROM khach_le_nhom WHERE ma_ktv = ?").bind(ma),
    db.prepare("UPDATE khach_le SET nhom_ma = ? WHERE nhom_ma = ?").bind(maDich, ma),
  ];

  if (!dich) {
    // Doi ten ma (ma moi chua co, hoac chi doi hoa/thuong).
    await db.batch([
      db.prepare("PRAGMA defer_foreign_keys = ON"),
      db
        .prepare("UPDATE ktv_lien_he SET ma_ktv = ?, ten_hien_thi = COALESCE(?, ten_hien_thi), ghi_chu = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_ktv = ?")
        .bind(maMoi, tenMoi, ghiChu(cu.ghi_chu, `Đổi mã từ ${ma}`), user.email, now, ma),
      ...chuyenThamChieu,
    ]);
  } else {
    if (dich.email_dang_nhap && cu.email_dang_nhap && dich.email_dang_nhap.trim().toLowerCase() !== cu.email_dang_nhap.trim().toLowerCase()) {
      return c.json({ error: "MA_MOI_DA_GAN_GMAIL_KHAC", message: `Mã ${dich.ma_ktv} đang gắn Gmail ${dich.email_dang_nhap} — không gộp được` }, 409);
    }
    if (!body.xac_nhan_gop) {
      const tt = [
        `Tên: ${dich.ten_hien_thi || "—"}`,
        `Khu vực: ${dich.khu_vuc_ma || "—"}`,
        `Mã MISA: ${dich.ma_misa || "—"}`,
        `Gmail đăng nhập: ${dich.email_dang_nhap || "chưa gắn"}`,
      ].join(" · ");
      return c.json({ error: "CAN_XAC_NHAN_GOP", message: tt, ma_moi: { ma_ktv: dich.ma_ktv, ten_hien_thi: dich.ten_hien_thi, email_dang_nhap: dich.email_dang_nhap, ma_misa: dich.ma_misa, khu_vuc_ma: dich.khu_vuc_ma } }, 409);
    }
    // Cot chu: giu cua ma moi, trong thi lay ma cu. Cot so: NULL thi lay ma cu.
    const o = (cot: string) => `(SELECT o.${cot} FROM ktv_lien_he o WHERE o.ma_ktv = ?1)`;
    const chu = ["sdt", "gmail", "vai_tro_ktv", "giam_sat_quan_ly", "khu_vuc_ma", "ma_misa", "ten_misa"].map((k) => `${k} = COALESCE(NULLIF(TRIM(${k}), ''), ${o(k)})`);
    const so = ["cong_no", "cong_no_cap_nhat_luc", "han_muc_du_phong", "han_muc_du_phong_hien_tai", "han_muc_du_phong_cap_nhat_luc"].map((k) => `${k} = COALESCE(${k}, ${o(k)})`);
    await db.batch([
      db.prepare("PRAGMA defer_foreign_keys = ON"),
      // Go Gmail khoi ma cu truoc (chi muc DUY NHAT Gmail - migration 0061) roi gan cho ma moi.
      db.prepare("UPDATE ktv_lien_he SET email_dang_nhap = NULL WHERE ma_ktv = ?").bind(ma),
      db
        .prepare(
          `UPDATE ktv_lien_he SET ${[...chu, ...so].join(", ")},
             ktv_cap1_phu_trach = COALESCE(ktv_cap1_phu_trach, NULLIF(${o("ktv_cap1_phu_trach")}, ?2)),
             ngung_hoat_dong = ${o("ngung_hoat_dong")},
             email_dang_nhap = COALESCE(?3, email_dang_nhap),
             ten_hien_thi = COALESCE(?4, ten_hien_thi, ${o("ten_hien_thi")}),
             ghi_chu = ?5, nguoi_cap_nhat = ?6, ngay_cap_nhat = ?7
           WHERE ma_ktv = ?2`,
        )
        .bind(ma, dich.ma_ktv, cu.email_dang_nhap, tenMoi, ghiChu(dich.ghi_chu, `Gộp từ mã ${ma}`), user.email, now),
      ...chuyenThamChieu,
      db.prepare("DELETE FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma),
    ]);
  }

  const email = cu.email_dang_nhap;
  if (email) await resyncKhuVucDerivedFieldsForEmail(db, email);
  for (const v of veTinh.results) await resyncKhuVucDerivedFieldsForEmail(db, v.email_dang_nhap);
  const sau = await db.prepare("SELECT ma_misa FROM ktv_lien_he WHERE ma_ktv = ?").bind(maDich).first<{ ma_misa: string | null }>();
  if (sau?.ma_misa) await relinkTonKhoForMaMisa(db, maDich, sau.ma_misa);
  await refreshHash(db);
  return c.json({ ok: true, ma_ktv: maDich, gop: !!dich });
});

settingsKtv.delete("/:ma", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const existing = await c.env.DB.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  await c.env.DB.prepare("DELETE FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).run();
  await refreshHash(c.env.DB);
  return c.json({ ok: true });
});

export default settingsKtv;
