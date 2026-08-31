import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { nextSequentialId } from "../lib/idCounter";
import { nowVN } from "../lib/vnTime";
import { scopeDatMuaNguoiTao, phuTrachGsSet, autoClaimGs, khuVucViewEmailInSql } from "../lib/scopeDatMua";
import { bumpVersions } from "../lib/dataVersions";
import { quaHanLyDoCham } from "../lib/hanLyDoCham";
import { getDatMuaLkBadge } from "./notifications";
import { csvTemplateResponse } from "../lib/csvTemplate";
import { getOrCompute } from "../lib/precomputedCache";
import { extractMaKtv } from "../lib/ktvCode";
import { lookupCase, lookupCases, type CaseLookupPreview } from "../lib/caseLookupClient";
import { sendPushToUser } from "../lib/webPush";

// Luong chinh "Dat mua linh kien" - phieu dat (header, chi de tong hop hien thi) + dong don hang -
// xem migration 0056_phieu_dat.sql + 0063_dat_don_hang_trang_thai_theo_dong.sql.
//
// CHOT 2026-08-14: duyet/tu choi chuyen xuong cap TUNG DONG don hang (dat_don_hang_log), khong con
// o cap ca phieu (phieu_dat_log da bi xoa) - 1 phieu 10 dong, TN co the tu choi 3, cho hang 2, duyet
// 5 dong con lai doc lap nhau. Trang thai 1 dong LUON suy tu dat_don_hang_log MOI NHAT (pattern
// header+log giong tranh_chap_tien_trinh). Phieu dat chi con vai tro khung tong hop (tong tien du
// kien, dem so dong theo tung trang thai) - xem lib/scopeDatMua.ts cho quy tac phan quyen xem.
//
// CHOT 2026-08-13: GS KHONG duyet - luong di thang "Cho Tram duyet" (neu nguoi tao dong la Ve tinh)
// hoac "Cho TN duyet" (neu nguoi tao la KTV/Tram) -> TN duyet/tu choi/cho hang tung dong.
//
// "Cho hang" dung chung co che voi nhanh "Thieu linh kien" (thieu_lk) - xem createThieuLk() +
// closeThieuLkAndResume() ben duoi: TN chon "cho hang" luc duyet = mo 1 ca thieu_lk cho dong do;
// Kho bao thieu sau nay (dong da "TN da duyet") cung di qua cung 1 co che. Khi ca thieu_lk dong lai
// (bat ke ket qua) thi dong tu dong quay ve "TN da duyet" - tiep tuc luong, dung y da chot truoc day
// "ca 3 nhanh re deu tiep tuc luong don hang".
const datMuaLinhKien = new Hono<{ Bindings: Env }>();
datMuaLinhKien.use("*", verifySessionMiddleware, loadUser, requireDatMuaLkArea);

// Trang thai "dong" tren 1 DONG don hang - khong the goi applyDonHangLog nua (Cho hang chi mo/dong
// qua thieu_lk, khong qua applyDonHangLog truc tiep).
const DON_HANG_TRANG_THAI_DONG = ["TN da duyet", "TN tu choi", "Da huy", "Cho hang"] as const;
// Cung dinh nghia voi TRANG_THAI_DONG trong traHang.ts (khong export/dung chung 1 file duoc vi 2
// router doc lap nhau, giong pattern latestStatusExpr moi noi tu dinh nghia rieng) - dung cho
// GET /loai-don-counts ben duoi. SUA (migration 0002_tra_hang_pxk.sql): "Da hoan thanh" khong con
// dat toi duoc tu applyTraHangLog nua - dong dat_don_hang dung o "TN da duyet" (dong/closed voi
// STATE MACHINE NAY, giong het DON_HANG_TRANG_THAI_DONG cua mua/cong_no), phan con lai theo doi qua
// phieu_xuat_kho rieng.
const TRA_HANG_TRANG_THAI_DONG_COUNTS = ["TN da duyet", "Tu choi", "Da huy"] as const;

// RA SOAT BAO MAT/CHI PHI D1 2026-08-18 (phan hoi Codex #9): cac endpoint bulk-log truoc day khong
// gioi han so luong id/request, xu ly tuan tu tung id (moi id vai luot doc/ghi D1 rieng) - 1 request
// voi hang nghin id se gay ton D1 rat lon. Gioi han o muc du dung cho 1 thao tac "chon 1 trang danh
// sach" (pageSize toi da hien co la 200) nhung van chan duoc lam dung/spam.
const MAX_BULK_IDS = 100;

function latestDonHangStatusExpr(donHangIdCol: string): string {
  return `(SELECT trang_thai FROM dat_don_hang_log WHERE dat_don_hang_id = ${donHangIdCol} ORDER BY id DESC LIMIT 1)`;
}

// Cung pattern voi latestDonHangStatusExpr - correlated subquery gioi han boi pageSize (toi da 200
// dong/trang) nen chi phi tuong duong 1 index seek/dong, dung cho GET /don-hang de tinh
// qua_han_ly_do_cham CHO CA DANH SACH (truoc day chi GET /don-hang/:id tinh duoc, xem hanLyDoCham.ts).
function choTnDuyetAtExpr(donHangIdCol: string): string {
  return `(SELECT ngay_xu_ly FROM dat_don_hang_log WHERE dat_don_hang_id = ${donHangIdCol} AND trang_thai = 'Cho TN duyet' ORDER BY id DESC LIMIT 1)`;
}

function canCreatePhieuDat(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!(user.la_ktv_dvbh || user.la_ve_tinh || canTacNghiep(c) || user.vai_tro === "Giam sat");
}

function canTacNghiep(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_tac_nghiep || user.vai_tro === "Admin";
}

// Xac nhan "linh kien dac thu" (buoc rieng ngay truoc Tac nghiep) - CHOT 2026-08-17, xem migration
// 0082_linh_kien_dac_thu_tp_dvbh.sql. la_tp_dvbh DOC LAP khoi vai_tro="TBP DVBH", giong pattern
// canTacNghiep() o tren.
function canTPDvbhXacNhan(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_tp_dvbh || user.vai_tro === "Admin";
}

// Trang thai KHOI TAO cua 1 dong don hang moi (dung o CA POST /phieu-dat va import Excel hang loat)
// - CHOT 2026-08-17: chen them "Cho TBP xac nhan" ngay TRUOC "Cho TN duyet" khi ma LK thuoc nhom
// "dac thu" (linh_kien.dac_thu=1), sau buoc Tram (neu nguoi tao la Ve tinh) - xem migration 0082.
function initialDonHangTrangThai(laVeTinh: boolean | number, dacThu: boolean | number | null | undefined): string {
  if (laVeTinh) return "Cho Tram duyet";
  if (dacThu) return "Cho TBP xac nhan";
  return "Cho TN duyet";
}

// TN hoac GS - duoc tao phieu HO nguoi khac + chon "nguoi nhan hang" khac chinh minh (Giai doan 4b).
function canQuanLyDonHo(c: Context<{ Bindings: Env }>): boolean {
  return canTacNghiep(c) || c.get("user").vai_tro === "Giam sat";
}

// Suy ra loai_don tu ten "loai_de_xuat" duoc chon - dung chung boi POST /phieu-dat (tao thu cong)
// va processDatDonHangImportRows (import Excel, them 2026-08-15) de tranh 2 noi lech logic.
function deriveLoaiDon(loaiDeXuat: string): "mua" | "cong_no" | "tra_hang" {
  if (loaiDeXuat.includes("TRẢ HÀNG")) return "tra_hang";
  if (loaiDeXuat.includes("CÔNG NỢ") || loaiDeXuat.includes("HỖ TRỢ") || loaiDeXuat.includes("TRỪ CÔNG NỢ") || loaiDeXuat.includes("THẺ BẢO HÀNH"))
    return "cong_no";
  return "mua";
}

// Chot phan hoi UX 2026-08-15 (#2): "Chinh sach" + "Ma yeu cau su co" bat buoc khi Loai de xuat la
// no CONG NO thuc su (khong tinh nhanh TRA HANG dung chung tu khoa "CONG NO", vd "TRU CONG NO" van
// tinh la CONG NO nhung "TRA HANG - HOAN CONG NO" (neu co) thi khong). Validate CA 2 PHIA (frontend
// da co ban sao, day la nguon that cho backend) - xem POST /phieu-dat va processDatDonHangImportRows.
function canNoRequired(loaiDeXuat: string): boolean {
  return loaiDeXuat.includes("CÔNG NỢ") && !loaiDeXuat.includes("TRẢ HÀNG");
}

// CHOT 2026-08-15: Ve tinh CHI la nguoi tao/de xuat don, KHONG phai nguoi nhan hang that su - Tram
// (tram_cha) moi la nguoi chiu trach nhiem nhan hang (vi luc tao Phieu xuat kho phai chon giao cho
// DUNG 1 nguoi). Dung ham nay o CA 2 noi resolve nguoi_nhan_hang: tao tay (POST /phieu-dat) va import
// Excel (processDatDonHangImportRows, logic tuong duong nhung gop chung 1 query vi chay trong vong
// lap - xem comment o do). Neu target la Ve tinh nhung chua duoc gan Tram (tram_cha null) thi khong
// xac dinh duoc nguoi nhan hang - tra loi.
async function resolveNguoiNhanHang(
  db: D1Database,
  target: { email: string; la_ve_tinh: number | boolean },
): Promise<{ email: string } | { error: "VE_TINH_CHUA_GAN_TRAM" }> {
  if (!target.la_ve_tinh) return { email: target.email };
  const row = await db.prepare("SELECT tram_cha FROM users WHERE email = ?").bind(target.email).first<{ tram_cha: string | null }>();
  if (!row?.tram_cha) return { error: "VE_TINH_CHUA_GAN_TRAM" };
  return { email: row.tram_cha };
}

// Tien to ID phieu_dat theo VAI TRO nguoi goi API luc tao (khong luu cot rieng) - chot buoc 1 ke
// hoach "Luong tao don mua hang": XH- (KTV/Ve tinh tu tao), TN- (Tac nghiep tao ho), AD- (GS tao
// ho). Uu tien TN/GS truoc vi 1 nguoi co the vua la_ktv_dvbh vua giu vai_tro khac.
function phieuDatPrefix(c: Context<{ Bindings: Env }>): "XH" | "TN" | "AD" {
  const user = c.get("user");
  if (canTacNghiep(c)) return "TN";
  if (user.vai_tro === "Giam sat") return "AD";
  return "XH";
}

// GET /api/dat-mua-lk/ve-tinh-cua-toi - danh sach Ve tinh (email + ten) co tram_cha = nguoi goi,
// dung cho dropdown filter "nguoi tao" o buoc 5 ke hoach (duyet hang loat cho Tram). Tram nao khong
// co Ve tinh nao thi tra rows rong (khong loi).
datMuaLinhKien.get("/ve-tinh-cua-toi", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare("SELECT email, ten FROM users WHERE tram_cha = ? ORDER BY ten").bind(user.email).all();
  return c.json({ rows: results });
});

// GET /api/dat-mua-lk/nguoi-nhan-hang-kha-dung - danh sach KTV co the chon lam "nguoi nhan hang"
// khi TN/GS tao phieu ho (Giai doan 4b) - lay tu ktv_lien_he (danh ba KTV, migration 0067) JOIN
// users qua email_dang_nhap (Admin tu ghep tay o Settings > Danh sach KTV) - chi liet ke KTV DA
// ghep tai khoan dang nhap that (chua ghep thi chua the la nguoi_nhan_hang, vi can loc "don cua toi"
// theo email that). Mo cho MOI nguoi da dang nhap (khong con gate FORBIDDEN_ROLE - chi la danh ba
// ten/ma KTV, khong nhay cam; mo rong 2026-08-16 de moi man hinh cua module deu tra cuu duoc
// email -> ten hien thi, xem DatMuaLinhKienModule.tsx useKtvDisplayMap), rieng GS van chi thay KTV
// do chinh minh phu trach (users.giam_sat_quan_ly = email GS - VAN la nguon that phan quyen,
// ktv_lien_he.giam_sat_quan_ly chi la danh ba/tra cuu - xem comment scopeDatMua.ts).
// CHOT (ra soat "Tao Don Linh Kien 2.0" #2): tra them ten_gs (LEFT JOIN users qua
// u.giam_sat_quan_ly) de frontend hien "MaKTV - Ten KTV (GS: Ten GS)" khi TN chon "nguoi nhan hang"
// giua nhieu GS khac nhau - GS goi API nay chi thay dung KTV cua minh (where da loc san) nen frontend
// tu bo qua hien thi ten_gs trong truong hop do (du thua).
// RA SOAT BAO MAT/NGHIEP VU 2026-08-18 (phan hoi Codex #7, chu he thong xac nhan GS DUOC phep tu
// nhan hang/chuyen tien nhu KTV): UNION them chinh cac tai khoan vai_tro='Giam sat' (ma_ktv rong vi
// GS khong co ma KTV that - xem formatNguoiDisplay o frontend da xu ly rieng truong hop nay) - neu
// khong lam vay, moi noi trong module hien ten qua ktvDisplayMap (bang/chi tiet PXK, chi tiet don...)
// se hien THANG EMAIL THO cho don ma nguoi_nhan_hang la 1 GS tu nhan. GS goi API nay chi thay chinh
// minh (khong thay GS khac) - giu dung tinh than "GS chi thay pham vi cua minh" nhu nhanh KTV; nguoi
// khac (TN/Kho/Ke toan/Admin) thay TAT CA GS de tra cuu ten duoc cho moi don, khop cach ho da thay
// TOAN BO KTV khong loc.
datMuaLinhKien.get("/nguoi-nhan-hang-kha-dung", async (c) => {
  const user = c.get("user");
  let ktvWhereSql = "dsk.email_dang_nhap IS NOT NULL";
  const ktvBinds: unknown[] = [];
  let gsWhereSql = "u2.vai_tro = 'Giam sat'";
  const gsBinds: unknown[] = [];
  if (user.vai_tro === "Giam sat") {
    ktvWhereSql += " AND u.giam_sat_quan_ly = ?";
    ktvBinds.push(user.email);
    gsWhereSql += " AND u2.email = ?";
    gsBinds.push(user.email);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT dsk.ma_ktv, dsk.ten_hien_thi, dsk.email_dang_nhap, gs.ten AS ten_gs
     FROM ktv_lien_he dsk
     JOIN users u ON u.email = dsk.email_dang_nhap
     LEFT JOIN users gs ON gs.email = u.giam_sat_quan_ly
     WHERE ${ktvWhereSql}
     UNION ALL
     SELECT '' as ma_ktv, u2.ten as ten_hien_thi, u2.email as email_dang_nhap, NULL as ten_gs
     FROM users u2
     WHERE ${gsWhereSql}
     ORDER BY ten_hien_thi`,
  )
    .bind(...ktvBinds, ...gsBinds)
    .all();
  return c.json({ rows: results });
});

// GET /api/dat-mua-lk/khu-vuc-cua-toi (them 2026-08-27, phan hoi "GS test không thấy đơn của KTV khu
// vực mình" + yeu cau "filter theo khu vực... GS tự lọc mặc định theo khu vực mình được set") - tra
// danh sach Khu vuc GAN VOI CHINH tai khoan dang goi, dung lam gia tri MAC DINH cho bo loc Khu vuc o
// DonCuaToiTab + khoi "KTV khu vực của tôi" o TrangChuTab. GS: qua khu_vuc.gs_email (nguon that phan
// cong GS - Settings > Khu vực). TN/Kho/Ke toan: qua user_khu_vuc (Admin gan o UsersModule, xem
// CLAUDE.md - bang nay truoc gio la "MEM" chi phuc vu tim kiem/thong ke, nay THEM 1 cong dung nua la
// gia tri mac dinh cho bo loc nay, KHONG doi thanh gioi han cung nhu la_view). Vai tro khac (KTV/Ve
// tinh/Admin thuan/QC) tra mang rong - khong co khai niem "khu vuc cua toi" o day.
datMuaLinhKien.get("/khu-vuc-cua-toi", async (c) => {
  const user = c.get("user");
  if (user.vai_tro === "Giam sat") {
    const { results } = await c.env.DB.prepare("SELECT ma, ten FROM khu_vuc WHERE gs_email = ? ORDER BY stt, ma")
      .bind(user.email)
      .all<{ ma: string; ten: string }>();
    return c.json({ rows: results });
  }
  if (user.la_tac_nghiep || user.la_kho || user.la_ke_toan) {
    const { results } = await c.env.DB.prepare(
      `SELECT kv.ma, kv.ten FROM user_khu_vuc uk JOIN khu_vuc kv ON kv.ma = uk.khu_vuc_ma WHERE uk.user_email = ? ORDER BY kv.stt, kv.ma`,
    )
      .bind(user.email)
      .all<{ ma: string; ten: string }>();
    return c.json({ rows: results });
  }
  return c.json({ rows: [] });
});

// GET /api/dat-mua-lk/ton-dong-theo-ktv (them 2026-08-27, phan hoi "cái tôi cần là 1 báo cáo nhanh để
// xem còn bao nhiêu đơn đặt hàng đang tồn theo từng ktv... để nhắc nhở ktv/tn/kế toán/kho hỗ trợ đáp
// ứng... cái nhìn nhanh trong 5s") - thay the khoi "KTV khu vực của tôi" (chi liet ke danh ba, khong
// tra loi duoc "con ton bao nhieu don"). Chi rieng Giam sat/TN/Kho/Ke toan/Admin duoc goi (giong dieu
// kien isManagerView o frontend) - KTV/Ve tinh xem TIEN DO CUA HO qua StatCard/pipeline san co, khong
// can bao cao "theo tung KTV" nay.
//
// "Con ton" = 1 dong dat_don_hang (mua/cong_no, GIONG dung bien loai_don != 'tra_hang' cua moi bao cao
// khac trong file nay) CHUA cham 1 trong cac trang thai KET THUC that su - dung LAI chinh xac dieu
// kien "ket_thuc_luc" da chot voi nguoi dung o GET /bao-cao-tong-the (CTE ddh_kt phia tren) thay vi
// tu nghi dieu kien moi: dong huy ('TN tu choi'/'Da huy') HOAC PXK da toi 1 trong 4 trang thai dong
// ('Ke toan huy','Kho da ket thuc','Hang tru kho','KTV da nhan'). "Cho hang" KHONG nam trong dieu kien
// dong (dung y: con cho hang ve la con ton that, day chinh la thu GS/TN can thay).
//
// KHONG ap dung scope cung theo email_gs/phuTrachGsSet (khac bao-cao-tong-the) - day la 1 bao cao MO,
// nguoi xem tu chon Khu vuc/KTV muon kiem soat qua 2 query param duoi day (khop dung mo hinh "bo loc
// Khu vuc" vua them o GET /don-hang: mac dinh FE tu dien theo GET /khu-vuc-cua-toi nhung nguoi dung co
// the tu mo rong "Toan quoc" - xem CLAUDE.md "TN/Kho/Ke toan xem duoc toan quoc").
datMuaLinhKien.get("/ton-dong-theo-ktv", async (c) => {
  const user = c.get("user");
  if (!(user.vai_tro === "Giam sat" || user.vai_tro === "Admin" || canTacNghiep(c) || user.la_kho || user.la_ke_toan)) {
    return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  }
  const khuVucMa = c.req.query("khu_vuc")?.trim();
  const nguoiNhanHang = c.req.query("nguoi_nhan_hang")?.trim();
  const khuVucList = khuVucMa ? khuVucMa.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (khuVucList.length > 0) {
    conditions.push(`k.khu_vuc_ma IN (${khuVucList.map(() => "?").join(",")})`);
    binds.push(...khuVucList);
  }
  if (nguoiNhanHang) {
    conditions.push("o.nguoi_nhan_hang = ?");
    binds.push(nguoiNhanHang);
  }
  const whereExtra = conditions.length > 0 ? ` AND ${conditions.join(" AND ")}` : "";

  const { results } = await c.env.DB.prepare(
    `WITH ddh_open AS (
       SELECT ddh.id, ddh.loai_don, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat,
         ddh.nguoi_nhan_hang, ddh.ngay_tao, ddh.trang_thai_hien_tai as ddh_trang_thai,
         pxk.trang_thai_hien_tai as pxk_trang_thai,
         pxk.so_tien_can_chuyen, pxk.trang_thai_chuyen_tien
       FROM dat_don_hang ddh
       LEFT JOIN phieu_xuat_kho_dong pxkd ON pxkd.dat_don_hang_id = ddh.id
       LEFT JOIN phieu_xuat_kho pxk ON pxk.id = pxkd.phieu_xuat_kho_id
       WHERE ddh.loai_don != 'tra_hang'
         AND ddh.trang_thai_hien_tai NOT IN ('TN tu choi', 'Da huy')
         AND (pxk.trang_thai_hien_tai IS NULL OR pxk.trang_thai_hien_tai NOT IN ('Ke toan huy', 'Kho da ket thuc', 'Hang tru kho', 'KTV da nhan'))
     )
     SELECT o.id, o.loai_don, o.ma_lk, o.ten_lk_snapshot, o.so_luong_de_xuat, o.nguoi_nhan_hang,
       o.ngay_tao, o.ddh_trang_thai, o.pxk_trang_thai, o.so_tien_can_chuyen, o.trang_thai_chuyen_tien,
       k.ten_hien_thi, k.khu_vuc_ma, k.vai_tro_ktv, kv.ten as khu_vuc_ten,
       (SELECT ngay_du_kien_co_hang FROM thieu_lk WHERE dat_don_hang_id = o.id ORDER BY ngay_tao DESC LIMIT 1) as ngay_du_kien_co_hang
     FROM ddh_open o
     LEFT JOIN ktv_lien_he k ON k.email_dang_nhap = o.nguoi_nhan_hang
     LEFT JOIN khu_vuc kv ON kv.ma = k.khu_vuc_ma
     WHERE 1=1${whereExtra}
     ORDER BY o.ngay_tao ASC`,
  )
    .bind(...binds)
    .all();

  return c.json({ rows: results, now: nowVN() });
});

// GET/PUT /api/dat-mua-lk/phu-trach-gs - quan ly "khu vuc phu trach" (Giam sat) cho 1 nguoi TN/Kho/Ke
// toan (Admin gan tay) - CHOT 2026-08-15: scope MEM, chi anh huong badge/thong ke (xem
// phuTrachGsSet/autoClaimGs trong scopeDatMua.ts, migration 0073), KHONG gioi han danh sach/tim
// kiem. Chi Admin duoc xem/sua (Admin quan ly toan bo phan quyen nguoi dung, khop UsersModule.tsx).
datMuaLinhKien.get("/phu-trach-gs", async (c) => {
  if (c.get("user").vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const nguoiPhuTrach = c.req.query("nguoi_phu_trach")?.trim();
  if (!nguoiPhuTrach) return c.json({ error: "MISSING_NGUOI_PHU_TRACH" }, 400);
  const { results } = await c.env.DB.prepare("SELECT giam_sat_email FROM dat_mua_lk_phu_trach_gs WHERE nguoi_phu_trach = ? ORDER BY giam_sat_email")
    .bind(nguoiPhuTrach)
    .all<{ giam_sat_email: string }>();
  return c.json({ emails: (results as { giam_sat_email: string }[]).map((r) => r.giam_sat_email) });
});

datMuaLinhKien.put("/phu-trach-gs", async (c) => {
  if (c.get("user").vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ nguoi_phu_trach?: string; giam_sat_emails?: string[] }>();
  const nguoiPhuTrach = body.nguoi_phu_trach?.trim();
  if (!nguoiPhuTrach || !Array.isArray(body.giam_sat_emails)) return c.json({ error: "INVALID_BODY" }, 400);

  const statements = [c.env.DB.prepare("DELETE FROM dat_mua_lk_phu_trach_gs WHERE nguoi_phu_trach = ?").bind(nguoiPhuTrach)];
  for (const email of new Set(body.giam_sat_emails.map((e) => e.trim()).filter(Boolean))) {
    statements.push(
      c.env.DB.prepare("INSERT INTO dat_mua_lk_phu_trach_gs (nguoi_phu_trach, giam_sat_email, tu_dong_gan) VALUES (?, ?, 0)").bind(nguoiPhuTrach, email),
    );
  }
  await c.env.DB.batch(statements);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// GET /api/dat-mua-lk/luong-quy-trinh - 13 buoc CHOT 2026-08-17 theo yeu cau "thanh dieu huong dang
// pipeline" thay cho SummaryStrip cu (danh sach pill dai dong loi). KHAC HAN computeDatMuaLkBreakdown
// (badge/notifications.ts): so nay LUON tinh TOAN BO he thong (khong scope theo phuTrachGsSet/vai tro
// nguoi goi) vi muc dich la "ai cung thay CA luong quy trinh" (chu he thong chot: "hiện toàn bộ
// pipeline cho mọi người, chỉ tô màu/phóng to bước của riêng mình") - FE tu quyet dinh to mau buoc nao
// theo vai tro cua nguoi dang xem qua field "roleKeys" tra ve, khong an/hien buoc nao ca. Khong cache
// (giong /bao-cao-tong-the canh no - du lieu nho, chi chay luc mo module).
//
// 4 buoc KHONG co san truoc do (cho_hang/cho_tien/tao_pxk/ktv) - da hoi ro nguon du lieu voi chu he
// thong truoc khi viet (2026-08-17):
//  - cho_hang: dat_don_hang dang o trang thai dong "Cho hang" (TN cho hang ve, tu dong sinh ticket
//    thieu_lk rieng - "thieu_lk" o duoi la SO TICKET dang o buoc dau "Cho kho xu ly", KHAC voi so nay
//    la SO DON dang treo o "Cho hang" noi chung, co the > so ticket vi ticket co the da qua buoc dau).
//  - cho_tien: PXK co so_tien_can_chuyen (khac null) NHUNG trang_thai_chuyen_tien CHUA phai 'TN da
//    duyet' (con o 'Cho KTV chuyen' hoac 'KTV da chuyen') - day la 1 DIEU KIEN CHAN rieng tren PXK
//    (xem migration 0066), khong phai 1 gia tri trang_thai chinh nen KHONG the loc bang
//    GET /phieu-xuat-kho?trang_thai=... - bam vao buoc nay dong vai "Tao PXK" (cung nam trong tap PXK
//    dang "Dang tao phieu", chua the gui Ke toan vi chua giai quyet xong tien).
//  - tao_pxk: PXK dang o trang thai dau "Dang tao phieu" (da tao, CHUA bam gui Ke toan).
//  - ktv: PXK dang o trang thai "Dang gui KTV" (da gui, cho KTV bam xac nhan da nhan).
// Ca 4 buoc PXK (cho_tien/tao_pxk/ke_toan/kho/ktv) VA cho_hang/tram/tp_dvbh/tac_nghiep (nhanh mua
// hang/cong no) deu loai tru loai_don='tra_hang' (chu he thong chot: "tổng cả 2 phân loại đơn mua
// hàng và đơn công nợ cho toàn bộ luồng") - tra_hang di theo cac buoc rieng cua no (tra_hang_kt/kho/
// qc/tn o dau pipeline + tra_hang_tao_pxk/pxk_kt/pxk_kho rieng cho PXK tra hang, migration
// 0002_tra_hang_pxk.sql), khong dem lai o cac buoc PXK chung ben duoi de tranh dem trung.
export interface LuongQuyTrinhStep {
  key: string;
  label: string;
  count: number;
  // FIX (ra soat 2026-08-29): so RIENG cua nguoi dang goi API (loc nguoi_nhan_hang = user.email) - CHI
  // co o 2 buoc "cho_tien"/"ktv" (von la viec CA NHAN cua tung KTV, khac han "kho"/"ke_toan"/
  // "tac_nghiep" la hang cho CHUNG toan he thong). FE phai dung field nay thay cho `count` khi hien thi
  // "viec cua toi" cho nguoi xem co roleKey "ktv", vi `count` van la so TOAN HE THONG (dung cho bang
  // dieu hanh chung/Tac nghiep, KHONG duoc doi y nghia).
  countCuaToi?: number;
  // Vai tro nao thi buoc nay la "viec cua ho" - FE dung de to mau/phong to khi nguoi xem thuoc 1
  // trong cac vai tro nay. Mang rong ([]) = buoc mang tinh thong tin chung, khong gan rieng ai.
  roleKeys: string[];
  tab: string;
  filter: string;
  // Them (migration 0002_tra_hang_pxk.sql) - CHI dung cho 3 buoc PXK tra hang (tab="phieu-xuat-kho")
  // de bam vao dung sub-tab loai_don, vi tab do co THEM 1 lop loc rieng (xemLoaiDon) khong nam trong
  // "filter" (filter chi mang trang_thai_hien_tai) - xem loaiDonFor() trong DatMuaLinhKienModule.tsx.
  // Them sentinel "all" (2026-08-21, sua bug "ấn TN 2 chỉ hiện 1"): dung cho cac buoc tab="don-cua-toi"
  // co so dem GOP ca "mua" lan "cong_no" (tram/tp_dvbh/tac_nghiep/cho_hang) - bao DonCuaToiTab bo qua
  // xemLoaiDon (sub-tab dang mo) va truy van GOP ca 2 loai cho khop dung so tren pipeline, xem
  // initialLoaiDonOverride trong DonCuaToiTab.tsx.
  loaiDon?: string;
}

datMuaLinhKien.get("/luong-quy-trinh", async (c) => {
  const user = c.get("user");
  // RA SOAT CHI PHI D1 2026-08-18 (phan hoi Codex #10, migration 0087+0088): 16 SELECT COUNT(*) nay
  // chay refetchInterval 5 phut/client + sau MOI mutation (xem invalidatePipelineCounts o frontend) -
  // truoc day moi dong deu can 1 correlated subquery rieng (khong index duoc) de suy trang thai. Gio
  // doc thang cot trang_thai_hien_tai (co index idx_ddh_loai_don_trang_thai/idx_pxk_trang_thai_nhan_hang)
  // - giu nguyen thieu_lk (ngoai pham vi ra soat, van dung correlated subquery nhu cu).
  const row = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho Tram duyet') as tram,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho TBP xac nhan') as tp_dvbh,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho ke toan duyet mem') as tra_hang_kt,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho kho xac nhan') as tra_hang_kho,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho QC xac nhan') as tra_hang_qc,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho TN duyet') as tac_nghiep,
       -- CHOT (ra soat module "Dat Mua Linh Kien 2.0" #12): tach rieng 3 buoc con thieu cua luong tra
       -- hang (truoc day "Cho TN duyet tong" bi GOP CHUNG vao dem cua "tac_nghiep" nhung KHONG co
       -- buoc rieng de bam vao dung tab "tra-hang" - bam vao "Tac nghiep" se nhay sai sang "don-cua-toi"
       -- khong khop dong tra_hang; "Cho ke toan xac nhan nhap kho"/"Cho kho xac nhan nhap kho" truoc do
       -- hoan toan khong co mat trong pipeline). Du 6/6 trang thai cua luong tra hang gio co bam duoc.
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho TN duyet tong') as tra_hang_tn,
       -- SUA (migration 0002_tra_hang_pxk.sql): thay 2 buoc "nhap kho" cu (khong con dat toi duoc, da
       -- xoa khoi tra_hang_log CHECK) bang 3 buoc PXK tra hang that (loai_don='tra_hang') - dung dung
       -- pattern tach rieng PXK tra hang khoi PXK mua/cong_no chung, giong het tra_hang_kt/kho/qc/tn
       -- o tren dang tach rieng khoi buoc mua/cong_no chung.
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don = 'tra_hang' AND pxk.trang_thai_hien_tai = 'Dang tao phieu') as tra_hang_tao_pxk,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don = 'tra_hang' AND pxk.trang_thai_hien_tai = 'Cho ke toan') as tra_hang_pxk_kt,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don = 'tra_hang' AND pxk.trang_thai_hien_tai = 'Da chot xong don xuat') as tra_hang_pxk_kho,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don != 'tra_hang' AND ddh.trang_thai_hien_tai = 'Cho hang') as cho_hang,
       (SELECT COUNT(*) FROM thieu_lk tlk WHERE (SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = tlk.id ORDER BY id DESC LIMIT 1) = 'Cho kho xu ly') as thieu_lk,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet') as cho_tien,
       -- CHOT (phan hoi 2026-08-24: "khi pxk đang chờ tiền thì tính nó thành chờ tiền, khi cập nhật
       -- tiền xong thì mới chuyển thành pxk") - loai tru PXK dang thoa dieu kien cho_tien o tren, khop
       -- dung exclusion o GET /phieu-xuat-kho (routes/phieuXuatKho.ts) de badge/danh sach nhay toi
       -- luon khop so.
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.trang_thai_hien_tai = 'Dang tao phieu' AND NOT (pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet')) as tao_pxk,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.trang_thai_hien_tai = 'Cho ke toan') as ke_toan,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.trang_thai_hien_tai = 'Da chot xong don xuat') as kho,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.trang_thai_hien_tai = 'Dang gui KTV') as ktv,
       -- FIX (ra soat "logic sai theo vai tro" 2026-08-29): "cho_tien"/"ktv" o tren la SO TOAN HE THONG
       -- (dung lam so cho Tac nghiep/bang dieu hanh chung), KHONG duoc dung lam "viec cua toi" cho TUNG
       -- KTV/Ve tinh ca nhan - truoc day FE lay thang s.count nen MOI KTV deu thay CUNG 1 so voi TOAN BO
       -- PXK dang cho tien/dang gui cua TAT CA KTV khac, khong rieng cua minh. Them 2 cot rieng loc theo
       -- dung nguoi_nhan_hang = nguoi dang goi de FE tu chon nguon hien thi phu hop tung doi tuong xem
       -- (xem countCuaToi o types.ts / DatMuaLinhKienModule.tsx).
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.nguoi_nhan_hang = ? AND pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet') as cho_tien_cua_toi,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE pxk.loai_don != 'tra_hang' AND pxk.nguoi_nhan_hang = ? AND pxk.trang_thai_hien_tai = 'Dang gui KTV') as ktv_cua_toi`,
  )
    .bind(user.email, user.email)
    .first<Record<string, number>>();
  const n = (key: string) => row?.[key] ?? 0;

  // "all" (sentinel rieng, xem comment tren LuongQuyTrinhStep.loaiDon o types.ts) - 4 buoc duoi day
  // (tram/tp_dvbh/tac_nghiep/cho_hang) DEM GOP ca "mua" lan "cong_no" (dieu kien "loai_don !=
  // 'tra_hang'" trong truy van dem o tren) - phai bao frontend bo qua sub-tab dang mo (xemLoaiDon) va
  // GOP ca 2 loai khi hien danh sach, neu khong so tren pipeline va so dong hien ra se lech nhau tuy
  // sub-tab nao dang mo luc bam (bug da bao cao 2026-08-21: "ấn TN 2 chỉ hiện 1").
  const steps: LuongQuyTrinhStep[] = [
    { key: "tram", label: "Trạm duyệt", count: n("tram"), roleKeys: ["tram"], tab: "don-cua-toi", filter: "Cho Tram duyet", loaiDon: "all" },
    { key: "tp_dvbh", label: "TBP duyệt LK đặc thù", count: n("tp_dvbh"), roleKeys: ["tp_dvbh"], tab: "don-cua-toi", filter: "Cho TBP xac nhan", loaiDon: "all" },
    { key: "tra_hang_kt", label: "Trả hàng KT", count: n("tra_hang_kt"), roleKeys: ["ke_toan"], tab: "tra-hang", filter: "Cho ke toan duyet mem" },
    { key: "tra_hang_kho", label: "Trả hàng Kho", count: n("tra_hang_kho"), roleKeys: ["kho"], tab: "tra-hang", filter: "Cho kho xac nhan" },
    { key: "tra_hang_qc", label: "Trả hàng QC", count: n("tra_hang_qc"), roleKeys: ["qc"], tab: "tra-hang", filter: "Cho QC xac nhan" },
    { key: "tra_hang_tn", label: "Trả hàng TN", count: n("tra_hang_tn"), roleKeys: ["tac_nghiep"], tab: "tra-hang", filter: "Cho TN duyet tong" },
    { key: "tra_hang_tao_pxk", label: "Trả hàng - Tạo PXK", count: n("tra_hang_tao_pxk"), roleKeys: ["tac_nghiep"], tab: "phieu-xuat-kho", filter: "Dang tao phieu", loaiDon: "tra_hang" },
    { key: "tra_hang_pxk_kt", label: "Trả hàng - KT xác nhận", count: n("tra_hang_pxk_kt"), roleKeys: ["ke_toan"], tab: "phieu-xuat-kho", filter: "Cho ke toan", loaiDon: "tra_hang" },
    { key: "tra_hang_pxk_kho", label: "Trả hàng - Kho nhận hàng", count: n("tra_hang_pxk_kho"), roleKeys: ["kho"], tab: "phieu-xuat-kho", filter: "Da chot xong don xuat", loaiDon: "tra_hang" },
    { key: "tac_nghiep", label: "Tác nghiệp", count: n("tac_nghiep"), roleKeys: ["tac_nghiep"], tab: "don-cua-toi", filter: "Cho TN duyet", loaiDon: "all" },
    { key: "cho_hang", label: "Chờ hàng", count: n("cho_hang"), roleKeys: [], tab: "don-cua-toi", filter: "Cho hang", loaiDon: "all" },
    { key: "thieu_lk", label: "Thiếu LK", count: n("thieu_lk"), roleKeys: ["kho"], tab: "thieu-lk", filter: "Cho kho xu ly" },
    // SUA (phan hoi 2026-08-24: "2 thẻ chờ tiền và pxk hình như đang là 1") - truoc day filter trung
    // voi "tao_pxk" ben duoi ("Dang tao phieu") vi khong co cach loc rieng dieu kien "cho tien" (xem
    // comment dieu kien cho_tien o dau file GET /luong-quy-trinh). Gio dung sentinel "CHO_TIEN" duoc
    // GET /phieu-xuat-kho nhan dien rieng (xem routes/phieuXuatKho.ts).
    { key: "cho_tien", label: "Chờ tiền", count: n("cho_tien"), countCuaToi: n("cho_tien_cua_toi"), roleKeys: ["ktv", "tac_nghiep"], tab: "phieu-xuat-kho", filter: "CHO_TIEN" },
    { key: "tao_pxk", label: "Tạo PXK", count: n("tao_pxk"), roleKeys: ["tac_nghiep"], tab: "phieu-xuat-kho", filter: "Dang tao phieu" },
    { key: "ke_toan", label: "Kế toán", count: n("ke_toan"), roleKeys: ["ke_toan"], tab: "phieu-xuat-kho", filter: "Cho ke toan" },
    { key: "kho", label: "Kho", count: n("kho"), roleKeys: ["kho"], tab: "phieu-xuat-kho", filter: "Da chot xong don xuat" },
    { key: "ktv", label: "KTV", count: n("ktv"), countCuaToi: n("ktv_cua_toi"), roleKeys: ["ktv"], tab: "phieu-xuat-kho", filter: "Dang gui KTV" },
  ];

  return c.json({ steps });
});

// GET /api/dat-mua-lk/bao-cao-tong-the - 12 chi so, TRA VE DANH SACH THEO TUNG KTV (phan hoi UX muc
// 6, nang cap 2026-08-15: truoc la 1 object tong hop, gio tach theo nguoi_nhan_hang de Giam
// sat/TN/Kho/Ke toan xem duoc tung KTV rieng, KTV/Ve tinh tu xem chi co 1 dong = chinh minh). Scope
// GIU NGUYEN tu ban dau: KTV/Ve tinh chi tinh don CA NHAN (nguoi_tao=minh HOAC nguoi_nhan_hang=minh -
// CO Y khong gom don cua Ve tinh thuoc Tram minh, khac scopeDatMuaNguoiTao dung cho DANH SACH); Giam
// sat tinh MOI don cua KTV minh phu trach (pd.email_gs = minh); TN/Kho/Ke toan tai dung
// phuTrachGsSet (muc F, dot truoc) - da duoc Admin gan khu vuc thi CHI tinh theo khu vuc, chua gan
// gi thi tinh toan he thong. Vi scope KHONG DOI, chi doi tu 1 SELECT tong hop sang GROUP BY
// nguoi_nhan_hang la du, khong can logic scope moi. Loai tru MOI dong "Da huy" va loai_don='tra_hang'
// khoi TAT CA chi so. Nho chot nghiep vu "1 PXK = 1 KTV" (migration 0074), nhom "Xuat kho" (gom ca
// "Tong cho chuyen" - truoc day KHONG gan duoc theo KTV vi 1 PXK co the gop nhieu KTV, gio gan duoc
// thang qua cot pxk.nguoi_nhan_hang) gio doc TRUC TIEP tren phieu_xuat_kho, khong can join qua
// phieu_xuat_kho_dong nua. Khong cache - chi chay khi mo module, khong phai moi keystroke; so dong
// luon nho (so KTV trong pham vi) nen khong can phan trang server-side.
interface BaoCaoRow {
  email: string;
  ten: string | null;
  slDon: number;
  slDonMua: number;
  slDonCongNo: number;
  slDonTraHang: number;
  slDeXuat: number;
  slTuChoi: number;
  slDangCho: number;
  slDuyet: number;
  slDuyetMua: number;
  slDuyetCongNo: number;
  slDuyetTraHang: number;
  slThucDuyet: number;
  tongTienThucTe: number;
  tongTienDatMua: number;
  tienChoDuyet: number;
  tongChoChuyen: number;
  tongPxk: number;
  slChoKeToan: number;
  slChoKhoGui: number;
  slDaGui: number;
  slDaXacNhan: number;
  slKhoKetThuc: number;
}

// Tap trang thai "dang cho duyet" dung chung cho ca 3 loai_don (them 2026-08-28, phan hoi "Đơn đang
// chờ/Tiền chờ duyệt" trong redesign man Trang chu tu card sang table) - mua/cong_no la 3 buoc dau
// (Cho Tram duyet/Cho TBP xac nhan/Cho TN duyet, KHONG gom "Cho hang" - da chot voi nguoi dung la buoc
// do la "da duyet xong, dang thieu hang" chu khong phai "dang cho duyet"), tra_hang la 4 buoc dau cua
// THU_TU_BUOC trong traHang.ts (Cho ke toan duyet mem/Cho kho xac nhan/Cho QC xac nhan/Cho TN duyet
// tong) - mo rong TRUC TIEP tu dinh nghia da chot cho mua/cong_no sang tra_hang (cung 1 khai niem "cac
// buoc duyet truoc khi dong dat_don_hang cham toi trang thai dong"), khong phai 1 quyet dinh nghiep vu
// moi rieng biet.
const DANG_CHO_DUYET_STATES = [
  "Cho Tram duyet", "Cho TBP xac nhan", "Cho TN duyet",
  "Cho ke toan duyet mem", "Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong",
] as const;
const DANG_CHO_DUYET_SQL_IN = DANG_CHO_DUYET_STATES.map(() => "?").join(",");

// "Thang lech N thang so voi thang hien tai (VN local)" - dung nowVN() (gio VN da luu san tren MOI
// cot timestamp he thong, xem lib/vnTime.ts) lam moc, KHONG dung SQLite 'now' (UTC, se lech mui gio
// so voi du lieu). Tra "YYYY-MM" de so sanh truc tiep voi strftime('%Y-%m', ...).
function thangYYYYMM(offset: number): string {
  const [y, m] = nowVN().slice(0, 7).split("-").map(Number);
  const total = y * 12 + (m - 1) - offset;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

datMuaLinhKien.get("/bao-cao-tong-the", async (c) => {
  const user = c.get("user");
  // FIX (ma tran kiem soat he thong, Van de #1 sheet "5. Van de phat hien", xac nhan 2026-08-24): QC
  // khong khop bat ky nhanh scope nao ben duoi (Giam sat / TN|Kho|Ke toan / KTV|Ve tinh) nen scopeCond
  // giu null = KHONG GIOI HAN - QC goi thang endpoint nay (vd qua devtools) van lay duoc toan bo du
  // lieu tai chinh toan he thong, du frontend co an tab "Bao cao" hay khong. Chan tuong minh o day
  // (khong dua vao frontend an nut) - QC dung y chi can xem dung buoc minh xu ly (Tra hang o buoc "Cho
  // QC xac nhan", da co san man TraHangTab), khong can/khong duoc xem bao cao tong hop toan he thong.
  if (user.vai_tro === "QC") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  // "full=1" (them 2026-08-25, phan hoi "mặc định load theo khu vực phụ trách => thêm lựa chọn để lọc
  // full") - bo qua scope MEM (phuTrachGsSet/email_gs) khi nguoi xem la Giam sat/TN/Kho/Ke toan. KHONG
  // ap dung cho nhanh KTV/Ve tinh (co dinh, khong doc query nay - dung y "ngoại trừ KTV/Trạm/CTV/Vệ
  // tinh" da chot voi nguoi dung) - nhanh do van luon gioi han theo chinh minh du co truyen full=1.
  const wantFull = c.req.query("full") === "1";
  // CHOT 2026-08-15: bo khai niem phieu_dat (migration 0075) - scope gio la 1 HAM sinh dieu kien
  // theo alias truyen vao (thay vi 1 chuoi co dinh) vi ham nay dung LAI CHINH dieu kien do o 2 noi
  // voi 2 alias khac nhau (ddh cho query don hang, ddh2 cho subquery EXISTS cua query PXK ben duoi).
  let scopeCond: ((alias: string) => string) | null = null;
  let scopeBinds: string[] = [];
  if (user.vai_tro === "Giam sat") {
    if (!wantFull) {
      scopeCond = (alias) => ` AND ${alias}.email_gs = ?`;
      scopeBinds = [user.email];
    }
  } else if (canTacNghiep(c) || user.la_kho || user.la_ke_toan) {
    if (!wantFull) {
      const gsSet = await phuTrachGsSet(c.env.DB, user.email);
      if (gsSet) {
        scopeCond = (alias) => ` AND ${alias}.email_gs IN (${[...gsSet].map(() => "?").join(",")})`;
        scopeBinds = [...gsSet];
      }
    }
  } else if (user.la_ktv_dvbh || user.la_ve_tinh) {
    scopeCond = (alias) => ` AND (${alias}.nguoi_tao = ? OR ${alias}.nguoi_nhan_hang = ?)`;
    scopeBinds = [user.email, user.email];
  }

  // Bo loc "Tháng N/N-1/N-2" (them 2026-08-25, phan hoi "hạn chế theo tháng... tính theo thời điểm
  // kết thúc cuối cùng của từng luồng quy trình") - "thang" query param: 0 = thang hien tai + TAT CA
  // dong dang xu ly (chua co "ket_thuc_luc"), 1/2 = thang N-1/N-2 (CHI dong da dong trong dung thang
  // do). 4 diem "ket thuc" da chot voi nguoi dung:
  //   - "đơn hủy": dat_don_hang o 'TN tu choi'/'Da huy' (chua tung ra PXK) - moc thoi gian = updated_at
  //     (duoc CAS ghi CUNG LUC voi trang_thai_hien_tai, xem applyDonHangLog).
  //   - "kế toán/kho/ktv kết thúc": PXK o 'Ke toan huy'/'Kho da ket thuc'+'Hang tru kho'/'KTV da nhan' -
  //     PXK KHONG co cot updated_at rieng nen phai lay tu phieu_xuat_kho_log (dong MOI NHAT khop dung
  //     trang_thai hien tai cua no).
  // Dong con "dang xu ly" (chua roi vao bat ky nhanh nao o tren) LUON hien o "thang 0", bat ke tao tu
  // bao gio - dung y "cả đang xử lý" nguoi dung da chot.
  const thangParam = Math.max(0, Math.min(2, Number(c.req.query("thang") ?? 0)));
  const thangWhere =
    thangParam === 0
      ? "(ket_thuc_luc IS NULL OR strftime('%Y-%m', ket_thuc_luc) = ?)"
      : "(ket_thuc_luc IS NOT NULL AND strftime('%Y-%m', ket_thuc_luc) = ?)";
  const thangBind = thangYYYYMM(thangParam);

  // TOI UU (kiem toan tai nguyen D1 quy mo 2-3 nam, 2026-08-24): truoc day dung
  // latestDonHangStatusExpr("ddh.id") (subquery tuong quan doc dat_don_hang_log ORDER BY id DESC
  // LIMIT 1) - lap lai 2 LAN MOI DONG cua toan bo dat_don_hang trong pham vi (khong gioi han thoi
  // gian). Cot ddh.trang_thai_hien_tai da la NGUON THAT tuong duong (duoc ghi CUNG LUC voi dong log
  // moi nhat qua co che CAS applyDonHangLog - moi endpoint khac nhu GET /don-hang, /luong-quy-trinh
  // deu doc thang cot nay) - doi sang doc thang cot, bo han correlated subquery, giam manh chi phi
  // dung dan luong endpoint nay gio chay THUONG XUYEN HON (nhung vao man "Trang chu" mac dinh).
  //
  // SUA (2026-08-25, cung dot voi bo loc thang): BO exclusion cung "trang_thai_hien_tai != 'Da huy'"
  // truoc day (dong "Da huy" bi AN VINH VIEN khoi MOI chi so) - gio dong huy la 1 nhanh "ket_thuc_luc"
  // that su (xem CTE ddh_kt), chi hien khi dung thang no bi huy duoc chon, khop dung yeu cau "đơn hủy"
  // la 1 trong 4 diem ket thuc can loc duoc.
  // SUA (2026-08-28, redesign man Trang chu "cards -> table"): bo han loai tru "ddh.loai_don !=
  // 'tra_hang'" - tra hang gio duoc GOM VAO cung bang nay (cot "Đơn trả"/"Duyệt trả" rieng) thay vi bi
  // an hoan toan khoi bao cao tong the nhu truoc. dat_don_hang.trang_thai_hien_tai cua tra_hang dung
  // CHUNG chuoi "TN da duyet" lam trang thai dong voi mua/cong_no (xem TRANG_THAI_DONG trong
  // traHang.ts) nen "sl_duyet"/join qua phieu_xuat_kho ben duoi tu dong dung, chi can them "Tu choi"
  // (tra hang) canh "TN tu choi" (mua/cong_no) o nhanh ket_thuc_luc dau tien.
  const { results: donRows } = await c.env.DB.prepare(
    `WITH ddh_kt AS (
       SELECT ddh.id, ddh.nguoi_nhan_hang, ddh.loai_don, ddh.so_luong_de_xuat, ddh.gia_de_xuat, ddh.gia_chot,
         ddh.so_luong_thuc_xuat, ddh.trang_thai_hien_tai,
         CASE
           WHEN ddh.trang_thai_hien_tai IN ('TN tu choi', 'Tu choi', 'Da huy') THEN ddh.updated_at
           WHEN pxk.trang_thai_hien_tai IN ('Ke toan huy', 'Kho da ket thuc', 'Hang tru kho', 'KTV da nhan')
             THEN (SELECT ngay_xu_ly FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = pxk.id AND trang_thai = pxk.trang_thai_hien_tai ORDER BY id DESC LIMIT 1)
           ELSE NULL
         END as ket_thuc_luc
       FROM dat_don_hang ddh
       LEFT JOIN phieu_xuat_kho_dong pxkd ON pxkd.dat_don_hang_id = ddh.id
       LEFT JOIN phieu_xuat_kho pxk ON pxk.id = pxkd.phieu_xuat_kho_id
       WHERE 1=1${scopeCond ? scopeCond("ddh") : ""}
     )
     SELECT ddh.nguoi_nhan_hang as email, u.ten as ten,
       COUNT(*) as sl_don,
       COALESCE(SUM(CASE WHEN ddh.loai_don = 'mua' THEN 1 ELSE 0 END), 0) as sl_don_mua,
       COALESCE(SUM(CASE WHEN ddh.loai_don = 'cong_no' THEN 1 ELSE 0 END), 0) as sl_don_cong_no,
       COALESCE(SUM(CASE WHEN ddh.loai_don = 'tra_hang' THEN 1 ELSE 0 END), 0) as sl_don_tra_hang,
       COALESCE(SUM(ddh.so_luong_de_xuat), 0) as sl_de_xuat,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai IN ('TN tu choi', 'Tu choi', 'Da huy') THEN 1 ELSE 0 END), 0) as sl_tu_choi,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai IN (${DANG_CHO_DUYET_SQL_IN}) THEN 1 ELSE 0 END), 0) as sl_dang_cho,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai = 'TN da duyet' THEN 1 ELSE 0 END), 0) as sl_duyet,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.loai_don = 'mua' THEN 1 ELSE 0 END), 0) as sl_duyet_mua,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.loai_don = 'cong_no' THEN 1 ELSE 0 END), 0) as sl_duyet_cong_no,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai = 'TN da duyet' AND ddh.loai_don = 'tra_hang' THEN 1 ELSE 0 END), 0) as sl_duyet_tra_hang,
       COALESCE(SUM(CASE WHEN ddh.so_luong_thuc_xuat IS NOT NULL THEN ddh.so_luong_thuc_xuat ELSE 0 END), 0) as sl_thuc_duyet,
       COALESCE(SUM(CASE WHEN ddh.gia_chot IS NOT NULL AND ddh.so_luong_thuc_xuat IS NOT NULL THEN ddh.gia_chot * ddh.so_luong_thuc_xuat ELSE 0 END), 0) as tong_tien_thuc_te,
       COALESCE(SUM(ddh.gia_de_xuat * ddh.so_luong_de_xuat), 0) as tong_tien_dat_mua,
       COALESCE(SUM(CASE WHEN ddh.trang_thai_hien_tai IN (${DANG_CHO_DUYET_SQL_IN}) THEN ddh.gia_de_xuat * ddh.so_luong_de_xuat ELSE 0 END), 0) as tien_cho_duyet
     FROM ddh_kt ddh LEFT JOIN users u ON u.email = ddh.nguoi_nhan_hang
     WHERE ${thangWhere}
     GROUP BY ddh.nguoi_nhan_hang`,
  )
    .bind(...scopeBinds, ...DANG_CHO_DUYET_STATES, ...DANG_CHO_DUYET_STATES, thangBind)
    .all<{
      email: string; ten: string | null; sl_don: number; sl_don_mua: number; sl_don_cong_no: number; sl_don_tra_hang: number;
      sl_de_xuat: number; sl_tu_choi: number; sl_dang_cho: number; sl_duyet: number; sl_duyet_mua: number; sl_duyet_cong_no: number; sl_duyet_tra_hang: number;
      sl_thuc_duyet: number; tong_tien_thuc_te: number; tong_tien_dat_mua: number; tien_cho_duyet: number;
    }>();

  const pxkScopeExists = scopeCond
    ? ` AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id${scopeCond("ddh2")})`
    : "";
  // 4 cot "tong_cho_chuyen/sl_cho_ke_toan/sl_cho_kho_gui/sl_da_gui" la snapshot "dang cho xu ly NGAY
  // BAY GIO" (chua toi buoc dong) - CHI co nghia cho thang HIEN TAI (thangParam===0), thang qua khu
  // khong con khai niem "dang cho" nua nen luon ve 0.
  //
  // SUA (2026-08-25, phat hien khi tu kiem thu bo loc thang moi them): "sl_da_xac_nhan" (KTV da nhan)
  // KHAC 4 cot tren - day la 1 trang thai DONG that su (nam trong TRANG_THAI_DONG cua phieuXuatKho.ts,
  // cung 1 trong "4 điểm kết thúc" da chot voi nguoi dung o CTE ddh_kt phia tren) nen PHAI bucket theo
  // thang giong het cach ddh_kt lam, KHONG the giu nguyen dang "snapshot khong doi theo thang" nhu 4
  // cot con lai - neu khong se tiep tuc cong don TOAN BO lich su "KTV da nhan" tu truoc toi gio vao
  // MOI lan xem thang hien tai, di nguoc lai chinh muc dich "hạn chế hao tốn dữ liệu theo tháng".
  // "tong_pxk" (them 2026-08-28) - dung PATTERN snapshot giong 4 cot con lai (chi co nghia thang hien
  // tai, "tổng PXK" cho thang qua khong ro nghia vi PXK khong co 1 moc "tao luc nao" duoc bucket rieng
  // - danh cho thang qua trong truong hop nay).
  const pxkSnapshotCols =
    thangParam === 0
      ? `COUNT(*) as tong_pxk,
         COALESCE(SUM(CASE WHEN pxk.so_tien_can_chuyen IS NOT NULL AND (pxk.trang_thai_chuyen_tien IS NULL OR pxk.trang_thai_chuyen_tien != 'TN da duyet') THEN pxk.so_tien_can_chuyen ELSE 0 END), 0) as tong_cho_chuyen,
         COALESCE(SUM(CASE WHEN pxk.trang_thai_hien_tai = 'Cho ke toan' THEN 1 ELSE 0 END), 0) as sl_cho_ke_toan,
         COALESCE(SUM(CASE WHEN pxk.trang_thai_hien_tai = 'Da chot xong don xuat' THEN 1 ELSE 0 END), 0) as sl_cho_kho_gui,
         COALESCE(SUM(CASE WHEN pxk.trang_thai_hien_tai = 'Dang gui KTV' THEN 1 ELSE 0 END), 0) as sl_da_gui,`
      : `0 as tong_pxk, 0 as tong_cho_chuyen, 0 as sl_cho_ke_toan, 0 as sl_cho_kho_gui, 0 as sl_da_gui,`;
  // "sl_kho_ket_thuc" (them 2026-08-28, dinh nghia da chot voi nguoi dung: "Kho da ket thuc" +
  // "Hang tru kho") - bucket theo thang giong het "sl_da_xac_nhan" (KTV da nhan) o duoi, vi day cung la
  // 1 trong "4 điểm kết thúc" da chot (xem CTE ddh_kt) chu khong phai snapshot "dang cho" nhu 4 cot
  // tren. Dung pxk.trang_thai_hien_tai lam dieu kien loc CHO CHINH subquery log (khop dung trang thai
  // hien tai, khong lay nham log cu cua 1 trong 2 trang thai neu PXK da di qua ca 2 - vi du khong xay
  // ra thuc te nhung giu an toan).
  const { results: pxkRows } = await c.env.DB
    .prepare(
      `SELECT pxk.nguoi_nhan_hang as email,
         ${pxkSnapshotCols}
         COALESCE(SUM(
           CASE WHEN pxk.trang_thai_hien_tai = 'KTV da nhan'
             AND strftime('%Y-%m', (SELECT ngay_xu_ly FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = pxk.id AND trang_thai = 'KTV da nhan' ORDER BY id DESC LIMIT 1)) = ?
           THEN 1 ELSE 0 END
         ), 0) as sl_da_xac_nhan,
         COALESCE(SUM(
           CASE WHEN pxk.trang_thai_hien_tai IN ('Kho da ket thuc', 'Hang tru kho')
             AND strftime('%Y-%m', (SELECT ngay_xu_ly FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = pxk.id AND trang_thai = pxk.trang_thai_hien_tai ORDER BY id DESC LIMIT 1)) = ?
           THEN 1 ELSE 0 END
         ), 0) as sl_kho_ket_thuc
       FROM phieu_xuat_kho pxk
       WHERE pxk.nguoi_nhan_hang IS NOT NULL${pxkScopeExists}
       GROUP BY pxk.nguoi_nhan_hang`,
    )
    .bind(thangBind, thangBind, ...scopeBinds)
    .all<{
      email: string; tong_pxk: number; tong_cho_chuyen: number; sl_cho_ke_toan: number; sl_cho_kho_gui: number; sl_da_gui: number;
      sl_da_xac_nhan: number; sl_kho_ket_thuc: number;
    }>();

  const byEmail = new Map<string, BaoCaoRow>();
  for (const d of donRows as {
    email: string; ten: string | null; sl_don: number; sl_don_mua: number; sl_don_cong_no: number; sl_don_tra_hang: number;
    sl_de_xuat: number; sl_tu_choi: number; sl_dang_cho: number; sl_duyet: number; sl_duyet_mua: number; sl_duyet_cong_no: number; sl_duyet_tra_hang: number;
    sl_thuc_duyet: number; tong_tien_thuc_te: number; tong_tien_dat_mua: number; tien_cho_duyet: number;
  }[]) {
    byEmail.set(d.email, {
      email: d.email, ten: d.ten,
      slDon: d.sl_don, slDonMua: d.sl_don_mua, slDonCongNo: d.sl_don_cong_no, slDonTraHang: d.sl_don_tra_hang,
      slDeXuat: d.sl_de_xuat, slTuChoi: d.sl_tu_choi, slDangCho: d.sl_dang_cho,
      slDuyet: d.sl_duyet, slDuyetMua: d.sl_duyet_mua, slDuyetCongNo: d.sl_duyet_cong_no, slDuyetTraHang: d.sl_duyet_tra_hang,
      slThucDuyet: d.sl_thuc_duyet, tongTienThucTe: d.tong_tien_thuc_te, tongTienDatMua: d.tong_tien_dat_mua, tienChoDuyet: d.tien_cho_duyet,
      tongChoChuyen: 0, tongPxk: 0, slChoKeToan: 0, slChoKhoGui: 0, slDaGui: 0, slDaXacNhan: 0, slKhoKetThuc: 0,
    });
  }
  for (const p of pxkRows as {
    email: string; tong_pxk: number; tong_cho_chuyen: number; sl_cho_ke_toan: number; sl_cho_kho_gui: number; sl_da_gui: number;
    sl_da_xac_nhan: number; sl_kho_ket_thuc: number;
  }[]) {
    const existing = byEmail.get(p.email);
    if (existing) {
      existing.tongPxk = p.tong_pxk;
      existing.tongChoChuyen = p.tong_cho_chuyen;
      existing.slChoKeToan = p.sl_cho_ke_toan;
      existing.slChoKhoGui = p.sl_cho_kho_gui;
      existing.slDaGui = p.sl_da_gui;
      existing.slDaXacNhan = p.sl_da_xac_nhan;
      existing.slKhoKetThuc = p.sl_kho_ket_thuc;
    } else {
      byEmail.set(p.email, {
        email: p.email, ten: null,
        slDon: 0, slDonMua: 0, slDonCongNo: 0, slDonTraHang: 0, slDeXuat: 0, slTuChoi: 0, slDangCho: 0,
        slDuyet: 0, slDuyetMua: 0, slDuyetCongNo: 0, slDuyetTraHang: 0, slThucDuyet: 0,
        tongTienThucTe: 0, tongTienDatMua: 0, tienChoDuyet: 0,
        tongPxk: p.tong_pxk, tongChoChuyen: p.tong_cho_chuyen, slChoKeToan: p.sl_cho_ke_toan,
        slChoKhoGui: p.sl_cho_kho_gui, slDaGui: p.sl_da_gui, slDaXacNhan: p.sl_da_xac_nhan, slKhoKetThuc: p.sl_kho_ket_thuc,
      });
    }
  }

  return c.json({ rows: [...byEmail.values()] });
});

// GET /api/dat-mua-lk/tom-tat - breakdown "viec can xu ly" theo tung loai cho nguoi dang nhap (tieu
// chi UX #1, them 2026-08-15). Tai dung nguyen ham/cache cua badge sidebar (getDatMuaLkBadge trong
// notifications.ts) de dam bao 2 noi LUON hien cung 1 con so - module tu ve "thanh tom tat" o day,
// moi pill bam vao se nhay dung tab+filter (xu ly o frontend, xem DatMuaLinhKienModule.tsx).
datMuaLinhKien.get("/tom-tat", async (c) => {
  const user = c.get("user");
  const breakdown = await getDatMuaLkBadge(c.env.DB, user);
  return c.json(breakdown);
});

// BO (phan hoi 2026-08-18): endpoint "top-linh-kien" (goi y toan he thong, khong doi theo thoi
// gian) da bi go khoi frontend - trung lap voi /xep-hang-linh-kien (xep hang 30 ngay gan nhat, tich
// hop san trong LinhKienPicker). Nguoi dung yeu cau bo ban cu, chi giu 1 nguon xep hang duy nhat.

// GET /api/dat-mua-lk/xep-hang-linh-kien - CHOT (ra soat "Tao Don Linh Kien 2.0" #3): danh sach ma_lk
// xep hang theo LUOT DUOC TN DUYET THANH CONG trong 30 ngay gan nhat (khac /top-linh-kien la moi
// thoi gian, dung cho dai "Goi y nhanh") - dung cho o chon "Ma linh kien" tu sap xep ket qua theo
// "hang dat gan day" thay vi chi theo tu khop chuoi. Key cache theo NGAY VN (khong phai 1 key co
// dinh) - request DAU TIEN trong ngay tu tinh lai (compute-on-miss cua getOrCompute), CA NGAY con
// lai chi doc 1 dong co san; KHONG can cron rieng (tranh dung nguyen tac "khong them cron/trigger
// ghi moi neu khong can" - xem CLAUDE.md muc R2/cron), va khong tinh lai neu khong co ai mo man hinh
// hom do.
interface XepHangLinhKienRow {
  ma_lk: string;
  so_lan: number;
}

function ngayVNCachDay(soNgay: number): string {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  vnNow.setUTCDate(vnNow.getUTCDate() - soNgay);
  return vnNow.toISOString().slice(0, 19).replace("T", " ");
}

async function computeXepHangLinhKien(db: D1Database): Promise<XepHangLinhKienRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ddh.ma_lk as ma_lk, COUNT(*) as so_lan
       FROM dat_don_hang ddh
       WHERE ddh.loai_don != 'tra_hang'
         AND ${latestDonHangStatusExpr("ddh.id")} = 'TN da duyet'
         AND ddh.ngay_tao >= ?
       GROUP BY ddh.ma_lk
       ORDER BY so_lan DESC`,
    )
    .bind(ngayVNCachDay(30))
    .all<XepHangLinhKienRow>();
  return results;
}

datMuaLinhKien.get("/xep-hang-linh-kien", async (c) => {
  const ngayVN = nowVN().slice(0, 10);
  const rows = await getOrCompute(c.env.DB, `linh-kien-rank:${ngayVN}`, () => computeXepHangLinhKien(c.env.DB));
  return c.json({ rows });
});

// GET /api/dat-mua-lk/kiem-tra-ma-yeu-cau?id=&nguoi_nhan_hang= - canh bao MEM khi nhap "Ma yeu cau
// su co lien quan" (phan hoi UX #5, 2026-08-15). CO Y THIET KE endpoint RIENG thay vi tai dung GET
// /api/cases/:id: route do bi chan boi scopeByKhuVuc (Giam sat ngoai khu vuc se nhan 403 va frontend
// se hien sai thanh "khong tim thay"), trong khi o day KHONG gioi han theo khu vuc. Chi phi D1:
// WHERE id = ? la index-seek theo PRIMARY KEY, khong dang ke du goi moi lan nguoi dung go xong
// (frontend debounce 500ms).
//
// CHOT 2026-08-16 (phan hoi: "phai hien thong tin co ban de nguoi tao tu doi chieu"): tra them
// `preview` (khach_hang/seri_san_pham/khu_vuc/tinh/quan_huyen/hang/san_pham_bao_hanh/
// tien_do_hoan_thanh/ky_thuat_vien) khi tim thay - CO Y CHON tap nho, KHONG tra nguyen dong case
// (bo qua mo_ta_loi, dia chi chi tiet, so tien...) de nguoi tao doi chieu dung ca ma khong lo du
// lieu nhay cam/tai chinh cua case.
// SUA 2026-08-26: truoc day route nay "tra nguyen" ca object tu lookupCase() lam `preview` - vo hai
// luc CaseLookupPreview chi khai 9 field, nhung tu khi mo rong interface do len du 29 field (phuc vu
// GET /case-detail/:id ben duoi) thi phai LOC TAY lai dung 9 field da CHOT 2026-08-16, neu khong se
// vo tinh gui ca du lieu tai chinh (dt_san_pham/dt_linh_kien/dt_dich_vu) ve trinh duyet luc go ma.
function miniCasePreview(p: CaseLookupPreview) {
  const { khach_hang, seri_san_pham, khu_vuc, tinh, quan_huyen, hang, san_pham_bao_hanh, tien_do_hoan_thanh, ky_thuat_vien } = p;
  return { khach_hang, seri_san_pham, khu_vuc, tinh, quan_huyen, hang, san_pham_bao_hanh, tien_do_hoan_thanh, ky_thuat_vien };
}

datMuaLinhKien.get("/kiem-tra-ma-yeu-cau", async (c) => {
  const id = c.req.query("id")?.trim();
  const nguoiNhanHang = c.req.query("nguoi_nhan_hang")?.trim();
  if (!id) return c.json({ found: false, khopKtv: null, preview: null });

  // SUA (tach he doc lap): case_dvbh khong con trong DB cuc bo - tra cuu qua API he cu, xem
  // lib/caseLookupClient.ts + CLAUDE.md muc "Nguon goc tach he thong".
  const full = await lookupCase(id, c.env);
  if (!full) return c.json({ found: false, khopKtv: null, preview: null });

  const maKtvCase = extractMaKtv(full.ky_thuat_vien);
  const preview = miniCasePreview(full);
  if (!maKtvCase || !nguoiNhanHang) return c.json({ found: true, khopKtv: null, preview });

  const ktvRow = await c.env.DB.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE email_dang_nhap = ?")
    .bind(nguoiNhanHang)
    .first<{ ma_ktv: string }>();
  if (!ktvRow) return c.json({ found: true, khopKtv: null, preview });

  const khopKtv = ktvRow.ma_ktv === maKtvCase;

  // CHOT 2026-08-26 (phan hoi: "KTV/Tram/CTV go ma case khong phai cua minh xu ly thi bao loi, khong
  // gui thong tin ve"): CHI chan khi chinh nguoi dang nhap la KTV/Tram/CTV (la_ktv_dvbh) VA dang tu
  // chon MINH la nguoi nhan hang - Ve tinh/TN/Admin/Ke toan/QC/GS tao don HO 1 KTV khac (chon
  // nguoi_nhan_hang khac chinh minh) van xem duoc preview binh thuong, vi ho co the hop le biet/xu ly
  // case thay nguoi do. Khong chan khi khopKtv=null (khong tach duoc ma KTV tu chuoi case, hoac nguoi
  // dang nhap chua co dong ktv_lien_he) - du lieu khong du de ket luan chac chan la "khong phai cua
  // ho", chan nham se can tro luong hop le.
  const user = c.get("user");
  const tuChonMinhNhanHang = user.la_ktv_dvbh && nguoiNhanHang === user.email;
  if (tuChonMinhNhanHang && khopKtv === false) {
    return c.json({ found: true, khopKtv: false, preview: null, blocked: true });
  }

  return c.json({ found: true, khopKtv, preview });
});

// Khoang cach toi thieu giua 2 lan bam "Dong bo lai" tren 1 case (phan hoi 2026-08-26) - tranh spam
// API doi tac khi nguoi dung bam lien tuc; kiem tra dua tren cot synced_at da luu (nowVN(), giay).
const CASE_DETAIL_MIN_SYNC_MS = 5000;

function msSinceVN(ts: string): number {
  return Date.now() - Date.parse(ts.replace(" ", "T") + "Z");
}

// GET /api/dat-mua-lk/case-detail/:id - man "Xem chi tiet case" moi (mo tu icon canh o kiem tra ma
// yeu cau su co luc tao don, hoac bam vao 1 ID case bat ky dang hien trong don hang - xem migration
// 0008). CHOT 2026-08-26: KHONG chan them theo quyen so huu case o day (khac GET /kiem-tra-ma-yeu-cau
// o tren) - ID case chi lo ra duoc tu 1 don hang nguoi dung DA duoc phep xem (scopeDatMuaNguoiTao),
// nen phan quyen xem don hang hien co la du. Chi keo API doi tac 1 LAN dau (cache vao
// case_lookup_snapshot), nhung lan mo sau doc lai cache - nguoi dung tu bam dong bo lai khi can moi.
datMuaLinhKien.get("/case-detail/:id", async (c) => {
  const id = c.req.param("id").trim();
  const cached = await c.env.DB.prepare("SELECT data, synced_at FROM case_lookup_snapshot WHERE case_id = ?")
    .bind(id)
    .first<{ data: string; synced_at: string }>();
  if (cached) return c.json({ found: true, data: JSON.parse(cached.data) as CaseLookupPreview, syncedAt: cached.synced_at });

  const full = await lookupCase(id, c.env);
  if (!full) return c.json({ found: false, data: null, syncedAt: null });

  const syncedAt = nowVN();
  await c.env.DB.prepare(
    "INSERT INTO case_lookup_snapshot (case_id, data, synced_at) VALUES (?, ?, ?) ON CONFLICT(case_id) DO UPDATE SET data = excluded.data, synced_at = excluded.synced_at",
  )
    .bind(id, JSON.stringify(full), syncedAt)
    .run();
  return c.json({ found: true, data: full, syncedAt });
});

// POST /api/dat-mua-lk/case-detail/:id/sync - lam moi cache tren, gioi han CASE_DETAIL_MIN_SYNC_MS
// giua 2 lan (theo case_id, khong theo nguoi bam - nhieu nguoi cung xem 1 case dung chung 1 dong ho).
datMuaLinhKien.post("/case-detail/:id/sync", async (c) => {
  const id = c.req.param("id").trim();
  const cached = await c.env.DB.prepare("SELECT data, synced_at FROM case_lookup_snapshot WHERE case_id = ?")
    .bind(id)
    .first<{ data: string; synced_at: string }>();
  if (cached && msSinceVN(cached.synced_at) < CASE_DETAIL_MIN_SYNC_MS) {
    return c.json({ error: "TOO_SOON", retryAfterMs: CASE_DETAIL_MIN_SYNC_MS - msSinceVN(cached.synced_at) }, 429);
  }

  const full = await lookupCase(id, c.env);
  if (!full) {
    // Dong bo that bai (API doi tac loi/timeout) KHAC voi "case khong ton tai" - id nay DA tung tim
    // thay truoc do (co dong cache) nen giu nguyen du lieu cu + co `syncFailed`, KHONG xoa sach thanh
    // "khong tim thay" (se lam mat du lieu dang xem chi vi 1 loi tam thoi cua API doi tac).
    if (cached) return c.json({ found: true, data: JSON.parse(cached.data) as CaseLookupPreview, syncedAt: cached.synced_at, syncFailed: true });
    return c.json({ found: false, data: null, syncedAt: null });
  }

  const syncedAt = nowVN();
  await c.env.DB.prepare(
    "INSERT INTO case_lookup_snapshot (case_id, data, synced_at) VALUES (?, ?, ?) ON CONFLICT(case_id) DO UPDATE SET data = excluded.data, synced_at = excluded.synced_at",
  )
    .bind(id, JSON.stringify(full), syncedAt)
    .run();
  return c.json({ found: true, data: full, syncedAt });
});

// GET /api/dat-mua-lk/don-hang?trang_thai=&nguoi_tao=&nguoi_nhan_hang=&tu_ngay=&den_ngay=&page=&pageSize
// - danh sach DONG don hang (CHOT 2026-08-15: bo khai niem "phieu dat" khoi trai nghiem nguoi dung -
// xem migration 0075, thay the GET /phieu-dat cu). Scope theo quan he nguoi dung
// (scopeDatMuaNguoiTao, doc thang tren dat_don_hang - khong con join qua phieu_dat). loai_don='tra_hang'
// (CHOT vong 7, 2026-08-17: dong dat_don_hang cua tra hang van sinh binh thuong qua cung API tao don
// nhu mua/cong no, xem POST tao don o duoi - chi khac la KHONG insert dat_don_hang_log ban dau vi
// dung tra_hang_log rieng - xem traHang.ts) chi hien khi FE loc tuong minh loai_don=tra_hang; khong
// truyen loai_don thi mac dinh loai tru de giu hanh vi cu cho cac noi goi khac (an toan nguoc).
// Sap xep theo nguoi_nhan_hang TRUOC de Frontend gom cum hien thi theo KTV ngay tren 1 trang (giong
// dung pattern da dung o GET /phieu-xuat-kho/don-hang-kha-dung).
datMuaLinhKien.get("/don-hang", async (c) => {
  const scope = scopeDatMuaNguoiTao(c);
  const trangThai = c.req.query("trang_thai");
  const nguoiTao = c.req.query("nguoi_tao");
  const nguoiNhanHang = c.req.query("nguoi_nhan_hang");
  const tuNgay = c.req.query("tu_ngay");
  const denNgay = c.req.query("den_ngay");
  const loaiDon = c.req.query("loai_don");
  // "khu_vuc" (them 2026-08-27, filter Khu vuc cho nhan vien van phong - xem GET /khu-vuc-cua-toi) -
  // danh sach ma Khu vuc cach nhau boi dau phay, khop don co NGUOI TAO hoac NGUOI NHAN HANG la 1 KTV
  // thuoc 1 trong cac Khu vuc do (giong cau truc OR cua khuVucViewEmailInSql nhung nhan NHIEU khu vuc
  // tuong minh tu FE thay vi tu tra cuu user_khu_vuc cua chinh nguoi goi - bo loc UI thuan, KHONG phai
  // gioi han bao mat nhu la_view).
  const khuVuc = c.req.query("khu_vuc")?.trim();
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #8): tim theo ma LK/ten LK/ma dong - ap TRUOC khi
  // phan trang (server-side), khac voi lam client-side chi loc duoc trong 20 dong dang tai cua 1
  // trang - tranh cam giac "tim khong ra" du du lieu ton tai o trang khac.
  const q = c.req.query("q")?.trim();
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  let whereSql = (loaiDon ? "1=1" : "ddh.loai_don != 'tra_hang'") + (scope?.whereSql ?? "");
  const binds: unknown[] = [...(scope?.binds ?? [])];
  if (loaiDon) {
    whereSql += " AND ddh.loai_don = ?";
    binds.push(loaiDon);
  }
  if (trangThai === "__OPEN__") {
    // Sentinel "con ton" (them 2026-08-27, phan hoi UI mobile "mặc định lọc các đơn còn tồn") - tai
    // dung DUNG 2 dinh nghia "dong" da co san cho GET /loai-don-counts o tren (khong bia tieu chi
    // moi): mua/cong no dung DON_HANG_TRANG_THAI_DONG (gom ca "Cho hang" - da duyet xong, chi con
    // cho hang ve, khong can ai xu ly them), tra_hang dung TRA_HANG_TRANG_THAI_DONG_COUNTS.
    const dongSet = loaiDon === "tra_hang" ? TRA_HANG_TRANG_THAI_DONG_COUNTS : DON_HANG_TRANG_THAI_DONG;
    whereSql += ` AND ddh.trang_thai_hien_tai NOT IN (${dongSet.map(() => "?").join(",")})`;
    binds.push(...dongSet);
  } else if (trangThai) {
    // RA SOAT CHI PHI D1 2026-08-18 (phan hoi Codex #11/#13, migration 0087+0088): doc truc tiep cot
    // trang_thai_hien_tai (co index idx_ddh_loai_don_trang_thai) thay vi correlated subquery - cot
    // nay LUON dung/moi (moi write site da duoc cap nhat dong bo, ke ca dong loai_don='tra_hang'
    // dung tra_hang_log rieng), khong con can phan biet CASE theo loai_don nhu truoc.
    whereSql += " AND ddh.trang_thai_hien_tai = ?";
    binds.push(trangThai);
  }
  if (nguoiTao) {
    whereSql += " AND ddh.nguoi_tao = ?";
    binds.push(nguoiTao);
  }
  // Giai doan 4b - TN/GS loc/nhom hang doi theo "nguoi nhan hang" (diem 5 yeu cau: "danh sach don se
  // sap xep theo don hang do se mua cho KTV nao").
  if (nguoiNhanHang) {
    whereSql += " AND ddh.nguoi_nhan_hang = ?";
    binds.push(nguoiNhanHang);
  }
  if (khuVuc) {
    const khuVucList = khuVuc.split(",").map((s) => s.trim()).filter(Boolean);
    if (khuVucList.length > 0) {
      const emailInKhuVuc = `(SELECT email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL AND khu_vuc_ma IN (${khuVucList.map(() => "?").join(",")}))`;
      whereSql += ` AND (ddh.nguoi_tao IN ${emailInKhuVuc} OR ddh.nguoi_nhan_hang IN ${emailInKhuVuc})`;
      binds.push(...khuVucList, ...khuVucList);
    }
  }
  if (tuNgay) {
    whereSql += " AND ddh.ngay_tao >= ?";
    binds.push(tuNgay);
  }
  if (denNgay) {
    whereSql += " AND ddh.ngay_tao <= ?";
    binds.push(denNgay + " 23:59:59");
  }
  if (q) {
    // UI redesign (phan hoi Codex 2026-08-19, muc P2 "mo rong search") - truoc day chi tim ma_lk/
    // ten_lk_snapshot/id, TN/GS thuong can tim theo nguoi tao/nguoi nhan hang/ma yeu cau su co (deu
    // la cot THAT tren dat_don_hang, khong can JOIN them).
    whereSql += " AND (ddh.ma_lk LIKE ? OR ddh.ten_lk_snapshot LIKE ? OR ddh.id LIKE ? OR ddh.nguoi_tao LIKE ? OR ddh.nguoi_nhan_hang LIKE ? OR ddh.ma_yeu_cau_su_co LIKE ?)";
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM dat_don_hang ddh WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT ddh.*, ddh.trang_thai_hien_tai as trang_thai, lk.dac_thu, ${choTnDuyetAtExpr("ddh.id")} as cho_tn_duyet_at
     FROM dat_don_hang ddh
     LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
     WHERE ${whereSql}
     ORDER BY ddh.nguoi_nhan_hang, ddh.ngay_tao DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all<{ ly_do_cham: string | null; cho_tn_duyet_at: string | null }>();

  // "Quá hạn - cần lý do chậm" (cung cong thuc voi GET /don-hang/:id, xem hanLyDoCham.ts) - truoc day
  // CHI tinh duoc o man chi tiet tung dong, danh sach hoan toan khong co canh bao (phan hoi chu he
  // thong: "danh sách chờ TN duyệt đang không có nơi để nhập lý do quá hạn... thiếu cảnh báo").
  const now = nowVN();
  const rows = results.map(({ cho_tn_duyet_at, ...row }) => ({
    ...row,
    qua_han_ly_do_cham: !row.ly_do_cham && !!cho_tn_duyet_at && quaHanLyDoCham(cho_tn_duyet_at, now),
  }));

  return c.json({ rows, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/dat-mua-lk/loai-don-counts - so dong DANG MO (chua xu ly xong) theo tung loai_don (mua/
// cong_no/tra_hang) - theo yeu cau bo sung sau ra soat: "3 nut filter Mua hang/Cong no/Tra hang thêm
// bộ đếm số lượng đơn theo từng thẻ", dung dung 1 SCOPE voi danh sach chinh (scopeDatMuaNguoiTao) de
// con so khop dung pham vi nguoi dang xem thay vi luon la toan he thong. "Dang mo" tai dung dung 2
// dinh nghia "dong" da co san trong code (DON_HANG_TRANG_THAI_DONG cho mua/cong_no, cung bo trang
// thai dong cua tra_hang.ts cho tra_hang), khong tu dat rieng 1 tieu chi moi.
datMuaLinhKien.get("/loai-don-counts", async (c) => {
  const scope = scopeDatMuaNguoiTao(c);
  const scopeSql = scope?.whereSql ?? "";
  const scopeBinds = scope?.binds ?? [];
  const donHangDongPlaceholders = DON_HANG_TRANG_THAI_DONG.map(() => "?").join(",");
  const traHangDongPlaceholders = TRA_HANG_TRANG_THAI_DONG_COUNTS.map(() => "?").join(",");

  // RA SOAT CHI PHI D1 2026-08-18 (phan hoi Codex #11, migration 0087+0088) - doc thang cot
  // trang_thai_hien_tai thay vi correlated subquery, xem giai thich o GET /luong-quy-trinh.
  const row = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'mua' AND ddh.trang_thai_hien_tai NOT IN (${donHangDongPlaceholders})${scopeSql}) as mua,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'cong_no' AND ddh.trang_thai_hien_tai NOT IN (${donHangDongPlaceholders})${scopeSql}) as cong_no,
       (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.trang_thai_hien_tai NOT IN (${traHangDongPlaceholders})${scopeSql}) as tra_hang`,
  )
    .bind(
      ...DON_HANG_TRANG_THAI_DONG, ...scopeBinds,
      ...DON_HANG_TRANG_THAI_DONG, ...scopeBinds,
      ...TRA_HANG_TRANG_THAI_DONG_COUNTS, ...scopeBinds,
    )
    .first<{ mua: number; cong_no: number; tra_hang: number }>();

  return c.json(row ?? { mua: 0, cong_no: 0, tra_hang: 0 });
});

// POST /api/dat-mua-lk/phieu-dat - { ghi_chu?, nguoi_nhan_hang?, don_hang: [{ ma_lk, loai_de_xuat,
// so_luong_de_xuat, ly_do_cham?, so_tien_cong_no? }] } - KTV/Tram/Ve tinh tao phieu + >=1 dong don
// hang trong 1 lan. "nguoi_nhan_hang" (Giai doan 4b, migration 0068) - chi TN/GS (canQuanLyDonHo)
// duoc chon nguoi khac; nguoc lai/khong truyen -> mac dinh chinh nguoi tao. email_gs tu dien tu
// giam_sat_quan_ly cua NGUOI NHAN HANG (khong phai nguoi tao - sua 2026-08-14: truoc day lay theo
// nguoi tao nen khi TN/GS tao ho, GS that su phu trach KTV do se khong theo doi duoc vi TN/GS
// thuong khong co giam_sat_quan_ly rieng). Trang thai dau tien cua TUNG DONG (khong phai ca phieu -
// xem comment dau file): "Cho Tram duyet" neu NGUOI TAO la Ve tinh (Tram phai duyet/day len truoc
// khi den TN), nguoc lai "Cho TN duyet" luon (KTV/Tram di thang TN, KHONG qua GS - chot
// 2026-08-13). Dong loai_don='tra_hang' KHONG nhan log o day - dung tra_hang_log rieng, mac dinh
// suy ngam "Cho ke toan duyet mem" khi chua co log nao (xem traHang.ts).
datMuaLinhKien.post("/phieu-dat", async (c) => {
  if (!canCreatePhieuDat(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{
    ghi_chu?: string;
    nguoi_nhan_hang?: string;
    don_hang: {
      ma_lk: string; loai_de_xuat: string; so_luong_de_xuat: number; so_tien_cong_no?: number;
      // 6 cot bo sung 2026-08-14 (doi chieu Excel goc) - deu do nguoi tao dien luc tao, khong sua
      // duoc sau do (xem migration 0070). KHONG con ly_do_cham o day - cot do doi y nghia sang
      // TAC NGHIEP giai trinh SLA, dien qua PATCH /don-hang/:id (xem duoi).
      ghi_chu?: string; yeu_cau_hoa_don?: string; tt_mail_duyet?: string; tt_khach_hang?: string;
      chinh_sach?: string; ma_yeu_cau_su_co?: string; uu_tien?: boolean;
      // Anh linh kien can tra (phan hoi 2026-08-24, muc 1 "bắt buộc phải có ảnh... tối đa 3 ảnh") -
      // CHI ap dung khi deriveLoaiDon(loai_de_xuat) === 'tra_hang'. Da upload TRUOC qua
      // POST /tra-hang/upload-anh (id dong don hang luc do CHUA sinh - xem lib/googleDrive.ts), gui
      // kem {driveFileId, url} de gan vao dong VUA sinh trong CUNG vong lap ben duoi.
      anh?: { driveFileId: string; url: string }[];
    }[];
  }>();
  if (!Array.isArray(body.don_hang) || body.don_hang.length === 0) return c.json({ error: "MISSING_DON_HANG" }, 400);

  const user = c.get("user");
  let targetUser: { email: string; la_ve_tinh: number | boolean };
  if (body.nguoi_nhan_hang?.trim() && body.nguoi_nhan_hang.trim() !== user.email) {
    if (!canQuanLyDonHo(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    const target = await c.env.DB.prepare("SELECT email, la_ktv_dvbh, la_ve_tinh FROM users WHERE email = ?")
      .bind(body.nguoi_nhan_hang.trim())
      .first<{ email: string; la_ktv_dvbh: number; la_ve_tinh: number }>();
    if (!target || !(target.la_ktv_dvbh || target.la_ve_tinh)) return c.json({ error: "NGUOI_NHAN_HANG_KHONG_HOP_LE" }, 400);
    targetUser = target;
  } else {
    targetUser = { email: user.email, la_ve_tinh: user.la_ve_tinh };
  }
  const resolved = await resolveNguoiNhanHang(c.env.DB, targetUser);
  if ("error" in resolved) return c.json({ error: resolved.error }, 400);
  const nguoiNhanHang = resolved.email;
  const recipientRow = await c.env.DB.prepare("SELECT giam_sat_quan_ly FROM users WHERE email = ?")
    .bind(nguoiNhanHang)
    .first<{ giam_sat_quan_ly: string | null }>();

  // RA SOAT BAO MAT 2026-08-18 (phan hoi Codex #6): GS "thuan" (khong dong thoi la Tac nghiep - TN co
  // quyen tao ho khong gioi han) CHI duoc tao don ho 1 nguoi nhan hang thuc su thuoc quyen phu trach
  // cua minh - truoc day chi kiem tra target la KTV/Ve tinh HOP LE (co ton tai) chu khong kiem tra co
  // THUOC GS nay khong, nen 1 tai khoan GS goi thang API co the tao don cho BAT KY KTV nao he thong.
  // Dung DUNG nguoiNhanHang da resolve (neu target la Ve tinh thi day la email TRAM cua Ve tinh do,
  // dung nguon that "ai chiu trach nhiem nhan hang" - khop yeu cau Codex "kiem tra Tram cha cua Ve
  // tinh co thuoc Giam sat do khong"). Nhanh GS tu nhan hang cho chinh minh (khong truyen
  // nguoi_nhan_hang) van giu nguyen - chu he thong xac nhan GS duoc phep tu nhan hang/chuyen tien
  // nhu KTV.
  if (user.vai_tro === "Giam sat" && !canTacNghiep(c) && nguoiNhanHang !== user.email) {
    if (recipientRow?.giam_sat_quan_ly !== user.email) return c.json({ error: "NGUOI_NHAN_HANG_NGOAI_PHAM_VI" }, 403);
  }

  // RA SOAT BAO MAT 2026-08-18 (phan hoi Codex #14): validate TOAN BO body.don_hang truoc khi cap
  // BAT KY id nao - nextSequentialId() la UPDATE...RETURNING commit NGAY LAP TUC, doc lap voi
  // batch() ben duoi (khong ro-lback duoc), nen goi no giua vong lap roi return loi o dong sau se
  // lam "mat" vinh vien so da cap (gap trong day ID). Doc het ma_lk can dung trong 1 lan IN(...)
  // truoc, validate xong moi bat dau cap id.
  for (const dh of body.don_hang) {
    if (!dh.ma_lk?.trim() || !dh.loai_de_xuat?.trim() || !dh.so_luong_de_xuat || dh.so_luong_de_xuat <= 0)
      return c.json({ error: "INVALID_DON_HANG" }, 400);
    const lde = dh.loai_de_xuat.trim();
    if (canNoRequired(lde) && (!dh.chinh_sach?.trim() || !dh.ma_yeu_cau_su_co?.trim()))
      return c.json({ error: "THIEU_CHINH_SACH_HOAC_MA_YCSC", ma_lk: dh.ma_lk }, 400);
    // CHOT (phan hoi 2026-08-24, muc 1): dong tra hang BAT BUOC 1-3 anh linh kien can tra, da upload
    // truoc qua POST /tra-hang/upload-anh (xem khai bao "anh" o tren).
    if (deriveLoaiDon(lde) === "tra_hang") {
      const soAnh = dh.anh?.length ?? 0;
      if (soAnh < 1 || soAnh > 3) return c.json({ error: "THIEU_ANH_TRA_HANG", ma_lk: dh.ma_lk }, 400);
    }
  }

  // CHOT 2026-08-16 (dot 3 gop y): "Gia de xuat" lay tu linh_kien.gia_ban (gia ban dang duoc quan
  // ly/dong bo chu dong qua lkSettings.ts/linhKienSync.ts), KHONG con lay tu gia_tham_chieu nua -
  // chu he thong khong yeu cau cot gia_tham_chieu, cot do tam thoi bo qua o module nay.
  const maLkList = [...new Set(body.don_hang.map((dh) => dh.ma_lk.trim()))];
  const lkPlaceholders = maLkList.map(() => "?").join(",");
  const { results: lkRows } = await c.env.DB.prepare(
    `SELECT ma_linh_kien, ten_linh_kien as ten_lk, gia_ban, dac_thu FROM linh_kien WHERE ma_linh_kien IN (${lkPlaceholders})`,
  ).bind(...maLkList).all<{ ma_linh_kien: string; ten_lk: string; gia_ban: number | null; dac_thu: number }>();
  const lkMap = new Map(lkRows.map((r) => [r.ma_linh_kien, r]));
  for (const dh of body.don_hang) {
    if (!lkMap.has(dh.ma_lk.trim())) return c.json({ error: "MA_LK_NOT_FOUND", ma_lk: dh.ma_lk }, 400);
  }

  const now = nowVN();
  const phieuDatId = await nextSequentialId(c.env.DB, "phieu_dat", phieuDatPrefix(c), 6);

  const statements = [
    c.env.DB.prepare("INSERT INTO phieu_dat (id, nguoi_tao, ngay_tao, email_gs, ghi_chu, nguoi_nhan_hang, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
      phieuDatId,
      user.email,
      now,
      recipientRow?.giam_sat_quan_ly ?? null,
      body.ghi_chu?.trim() || null,
      nguoiNhanHang,
      now,
    ),
  ];

  for (const dh of body.don_hang) {
    const lde = dh.loai_de_xuat.trim();
    const loai_don = deriveLoaiDon(lde);
    const lk = lkMap.get(dh.ma_lk.trim())!;

    const donHangId = await nextSequentialId(c.env.DB, "dat_don_hang", "DDH", 6);
    // trang_thai_hien_tai (migration 0087, phan hoi Codex #8) - mirror TRUC TIEP trang thai khoi tao
    // ngay tren dong cha, dung lam token CAS cho applyDonHangLog/applyTraHangLog ve sau (version mac
    // dinh 1 theo schema).
    const trangThaiKhoiTao = loai_don !== "tra_hang" ? initialDonHangTrangThai(user.la_ve_tinh, lk.dac_thu) : "Cho ke toan duyet mem";
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO dat_don_hang
           (id, phieu_dat_id, loai_don, ma_lk, ten_lk_snapshot, loai_de_xuat, so_luong_de_xuat, gia_de_xuat,
            so_tien_cong_no, ghi_chu, yeu_cau_hoa_don, tt_mail_duyet, tt_khach_hang, chinh_sach, ma_yeu_cau_su_co,
            nguoi_tao, ngay_tao, updated_at, email_gs, nguoi_nhan_hang, uu_tien, trang_thai_hien_tai)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        donHangId,
        phieuDatId,
        loai_don,
        dh.ma_lk.trim(),
        lk.ten_lk,
        lde,
        dh.so_luong_de_xuat,
        lk.gia_ban,
        loai_don === "cong_no" ? dh.so_tien_cong_no ?? null : null,
        dh.ghi_chu?.trim() || null,
        dh.yeu_cau_hoa_don?.trim() || null,
        dh.tt_mail_duyet?.trim() || null,
        dh.tt_khach_hang?.trim() || null,
        dh.chinh_sach?.trim() || null,
        dh.ma_yeu_cau_su_co?.trim() || null,
        user.email,
        now,
        now,
        recipientRow?.giam_sat_quan_ly ?? null,
        nguoiNhanHang,
        dh.uu_tien ? 1 : 0,
        trangThaiKhoiTao,
      ),
    );

    if (loai_don !== "tra_hang") {
      statements.push(
        c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly) VALUES (?, ?, ?, ?)").bind(
          donHangId,
          initialDonHangTrangThai(user.la_ve_tinh, lk.dac_thu),
          user.email,
          now,
        ),
      );
    } else {
      // Gan anh linh kien can tra vao dong VUA sinh (da validate 1-3 anh o vong lap tren) - xem
      // migration 0003_tra_hang_anh.sql.
      for (const a of dh.anh ?? []) {
        statements.push(
          c.env.DB.prepare("INSERT INTO tra_hang_anh (dat_don_hang_id, loai, drive_file_id, url, nguoi_upload) VALUES (?, 'tao_moi', ?, ?, ?)").bind(
            donHangId,
            a.driveFileId,
            a.url,
            user.email,
          ),
        );
      }
    }
  }

  await c.env.DB.batch(statements);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ id: phieuDatId }, 201);
});

// Import Excel tao hang loat don mua linh kien (tieu chi UX #4, them 2026-08-15) - CHOT voi chu he
// thong: cac dong CUNG 1 KTV (cot NGUOI NHAN HANG = ma_ktv, khop ktv_lien_he.ma_ktv) gop thanh 1
// phieu_dat, vd import 100 dong 10 KTV khac nhau -> tao 10 phieu doc lap. Chi TN/GS
// (canQuanLyDonHo) duoc dung - dung y "tao ho hang loat", lap lai chinh xac logic tao 1 phieu thu
// cong (POST /phieu-dat o tren) cho tung nhom KTV thay vi 1 lan goi. preview/commit 2 buoc giong
// het pattern import KTV o settings.ts (processKtvImportRows) - frontend dung chung component
// ImportUploader.
interface DatDonHangImportRow {
  nguoi_nhan_hang?: string; // ma_ktv trong Danh sach KTV (Settings), KHONG phai email
  ma_lk?: string;
  loai_de_xuat?: string;
  so_luong_de_xuat?: number | string;
  ghi_chu?: string;
  yeu_cau_hoa_don?: string;
  tt_mail_duyet?: string;
  tt_khach_hang?: string;
  chinh_sach?: string;
  ma_yeu_cau_su_co?: string;
}

interface DatDonHangImportValidRow {
  maKtv: string;
  emailNhanHang: string;
  maLk: string;
  tenLk: string;
  giaBan: number | null;
  loaiDeXuat: string;
  loaiDon: "mua" | "cong_no" | "tra_hang";
  soLuong: number;
  ghiChu: string | null;
  yeuCauHoaDon: string | null;
  ttMailDuyet: string | null;
  ttKhachHang: string | null;
  chinhSach: string | null;
  maYeuCauSuCo: string | null;
  dacThu: number;
}

async function processDatDonHangImportRows(
  c: Context<{ Bindings: Env }>,
  rows: DatDonHangImportRow[],
  commit: boolean,
): Promise<{ thanhCong: number; loi: number; errors: string[]; soPhieu: number; ktvList: string[]; phieuIds?: string[] }> {
  const user = c.get("user");
  const db = c.env.DB;
  const errors: string[] = [];
  const valid: DatDonHangImportValidRow[] = [];
  // RA SOAT BAO MAT 2026-08-18 (phan hoi Codex #6, ap dung tuong tu nhanh tao tay o POST /phieu-dat):
  // GS thuan (khong dong thoi la Tac nghiep) chi duoc import ho cho KTV thuoc quyen phu trach minh.
  const isPureGs = user.vai_tro === "Giam sat" && !canTacNghiep(c);

  // Cache tra cuu KTV/LK trong 1 lan import - tranh query lap lai cung 1 ma nhieu lan qua nhieu dong.
  // ktvCache: email da RESOLVE (Ve tinh -> tram_cha, xem resolveNguoiNhanHang o tren - gop chung 1
  // query o day thay vi goi lai ham do vi chay trong vong lap nhieu dong).
  const ktvCache = new Map<string, { email: string } | { error: string }>();
  const lkCache = new Map<string, { ten: string; gia: number | null; dacThu: number } | null>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dong = i + 1;
    const maKtv = String(row.nguoi_nhan_hang ?? "").trim();
    const maLk = String(row.ma_lk ?? "").trim();
    const loaiDeXuat = String(row.loai_de_xuat ?? "").trim();
    const soLuong = Number(row.so_luong_de_xuat);

    if (!maKtv) {
      errors.push(`Dòng ${dong}: thiếu NGƯỜI NHẬN HÀNG (mã KTV)`);
      continue;
    }
    if (!maLk) {
      errors.push(`Dòng ${dong}: thiếu LINH KIỆN MÃ`);
      continue;
    }
    if (!loaiDeXuat) {
      errors.push(`Dòng ${dong}: thiếu LOẠI ĐỀ XUẤT`);
      continue;
    }
    if (!soLuong || soLuong <= 0) {
      errors.push(`Dòng ${dong}: SỐ LƯỢNG ĐỀ XUẤT không hợp lệ`);
      continue;
    }

    if (!ktvCache.has(maKtv)) {
      const ktvRow = await db
        .prepare(
          `SELECT dsk.email_dang_nhap as email, u.la_ve_tinh, u.tram_cha
           FROM ktv_lien_he dsk JOIN users u ON u.email = dsk.email_dang_nhap
           WHERE dsk.ma_ktv = ? AND dsk.email_dang_nhap IS NOT NULL`,
        )
        .bind(maKtv)
        .first<{ email: string; la_ve_tinh: number; tram_cha: string | null }>();
      if (!ktvRow) {
        ktvCache.set(maKtv, { error: "NOT_FOUND" });
      } else if (ktvRow.la_ve_tinh && !ktvRow.tram_cha) {
        ktvCache.set(maKtv, { error: "VE_TINH_CHUA_GAN_TRAM" });
      } else {
        const resolvedEmail = ktvRow.la_ve_tinh ? ktvRow.tram_cha! : ktvRow.email;
        if (isPureGs && resolvedEmail !== user.email) {
          const gsRow = await db.prepare("SELECT giam_sat_quan_ly FROM users WHERE email = ?").bind(resolvedEmail).first<{ giam_sat_quan_ly: string | null }>();
          ktvCache.set(maKtv, gsRow?.giam_sat_quan_ly === user.email ? { email: resolvedEmail } : { error: "NGOAI_PHAM_VI_GS" });
        } else {
          ktvCache.set(maKtv, { email: resolvedEmail });
        }
      }
    }
    const ktv = ktvCache.get(maKtv)!;
    if ("error" in ktv) {
      errors.push(
        ktv.error === "VE_TINH_CHUA_GAN_TRAM"
          ? `Dòng ${dong}: KTV "${maKtv}" là Vệ tinh nhưng chưa được gán Trạm - không xác định được người nhận hàng`
          : ktv.error === "NGOAI_PHAM_VI_GS"
            ? `Dòng ${dong}: KTV "${maKtv}" không thuộc quyền phụ trách của Giám sát này`
            : `Dòng ${dong}: KTV "${maKtv}" không tồn tại trong Danh sách KTV hoặc chưa ghép tài khoản đăng nhập`,
      );
      continue;
    }

    if (!lkCache.has(maLk)) {
      // CHOT 2026-08-16: gia lay tu linh_kien.gia_ban (khong con gia_tham_chieu), khop dung
      // POST /phieu-dat o tren.
      const lkRow = await db.prepare("SELECT ten_linh_kien as ten, gia_ban as gia, dac_thu FROM linh_kien WHERE ma_linh_kien = ?").bind(maLk).first<{ ten: string; gia: number | null; dac_thu: number }>();
      lkCache.set(maLk, lkRow ? { ten: lkRow.ten, gia: lkRow.gia, dacThu: lkRow.dac_thu } : null);
    }
    const lk = lkCache.get(maLk);
    if (!lk) {
      errors.push(`Dòng ${dong}: mã LK "${maLk}" không tồn tại`);
      continue;
    }

    if (canNoRequired(loaiDeXuat) && (!row.chinh_sach?.trim() || !row.ma_yeu_cau_su_co?.trim())) {
      errors.push(`Dòng ${dong}: Loại đề xuất "${loaiDeXuat}" yêu cầu điền CHÍNH SÁCH và MÃ YÊU CẦU SỰ CỐ`);
      continue;
    }
    // CHOT (phan hoi 2026-08-24): don Tra hang bat buoc anh linh kien can tra - Excel khong the kem
    // anh, nen KHONG ho tro tao qua Nhap Excel, phai tao thu cong tung dong qua POST /phieu-dat.
    if (deriveLoaiDon(loaiDeXuat) === "tra_hang") {
      errors.push(`Dòng ${dong}: đơn Trả hàng cần ảnh linh kiện - không hỗ trợ tạo qua Nhập Excel, vui lòng tạo thủ công`);
      continue;
    }

    valid.push({
      maKtv,
      emailNhanHang: ktv.email,
      maLk,
      tenLk: lk.ten,
      giaBan: lk.gia,
      loaiDeXuat,
      loaiDon: deriveLoaiDon(loaiDeXuat),
      soLuong,
      ghiChu: row.ghi_chu?.trim() || null,
      yeuCauHoaDon: row.yeu_cau_hoa_don?.trim() || null,
      ttMailDuyet: row.tt_mail_duyet?.trim() || null,
      ttKhachHang: row.tt_khach_hang?.trim() || null,
      chinhSach: row.chinh_sach?.trim() || null,
      maYeuCauSuCo: row.ma_yeu_cau_su_co?.trim() || null,
      dacThu: lk.dacThu,
    });
  }

  // Gom theo KTV nhan hang - moi nhom = 1 phieu_dat (chot voi chu he thong 2026-08-15).
  const groups = new Map<string, DatDonHangImportValidRow[]>();
  for (const v of valid) {
    if (!groups.has(v.emailNhanHang)) groups.set(v.emailNhanHang, []);
    groups.get(v.emailNhanHang)!.push(v);
  }

  const phieuIds: string[] = [];
  if (commit && groups.size > 0) {
    const now = nowVN();
    for (const [emailNhanHang, groupRows] of groups) {
      const phieuDatId = await nextSequentialId(db, "phieu_dat", phieuDatPrefix(c), 6);
      const giamSatRow = await db.prepare("SELECT giam_sat_quan_ly FROM users WHERE email = ?").bind(emailNhanHang).first<{ giam_sat_quan_ly: string | null }>();
      const statements = [
        db.prepare("INSERT INTO phieu_dat (id, nguoi_tao, ngay_tao, email_gs, ghi_chu, nguoi_nhan_hang, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
          phieuDatId,
          user.email,
          now,
          giamSatRow?.giam_sat_quan_ly ?? null,
          null,
          emailNhanHang,
          now,
        ),
      ];
      for (const v of groupRows) {
        const donHangId = await nextSequentialId(db, "dat_don_hang", "DDH", 6);
        // trang_thai_hien_tai (migration 0087) - khop dung nhanh tao tay o POST /phieu-dat phia tren.
        const trangThaiKhoiTao = v.loaiDon !== "tra_hang" ? initialDonHangTrangThai(user.la_ve_tinh, v.dacThu) : "Cho ke toan duyet mem";
        statements.push(
          db
            .prepare(
              `INSERT INTO dat_don_hang
                 (id, phieu_dat_id, loai_don, ma_lk, ten_lk_snapshot, loai_de_xuat, so_luong_de_xuat, gia_de_xuat,
                  so_tien_cong_no, ghi_chu, yeu_cau_hoa_don, tt_mail_duyet, tt_khach_hang, chinh_sach, ma_yeu_cau_su_co,
                  nguoi_tao, ngay_tao, updated_at, email_gs, nguoi_nhan_hang, trang_thai_hien_tai)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              donHangId,
              phieuDatId,
              v.loaiDon,
              v.maLk,
              v.tenLk,
              v.loaiDeXuat,
              v.soLuong,
              v.giaBan,
              null,
              v.ghiChu,
              v.yeuCauHoaDon,
              v.ttMailDuyet,
              v.ttKhachHang,
              v.chinhSach,
              v.maYeuCauSuCo,
              user.email,
              now,
              now,
              giamSatRow?.giam_sat_quan_ly ?? null,
              emailNhanHang,
              trangThaiKhoiTao,
            ),
        );
        if (v.loaiDon !== "tra_hang") {
          statements.push(
            db.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly) VALUES (?, ?, ?, ?)").bind(
              donHangId,
              initialDonHangTrangThai(user.la_ve_tinh, v.dacThu),
              user.email,
              now,
            ),
          );
        }
      }
      await db.batch(statements);
      phieuIds.push(phieuDatId);
    }
  }

  return {
    thanhCong: valid.length,
    loi: errors.length,
    errors,
    soPhieu: groups.size,
    ktvList: [...new Set(valid.map((v) => v.maKtv))],
    ...(commit ? { phieuIds } : {}),
  };
}

const DAT_DON_HANG_IMPORT_TEMPLATE_CSV =
  "nguoi_nhan_hang,ma_lk,loai_de_xuat,so_luong_de_xuat,ghi_chu,yeu_cau_hoa_don,tt_mail_duyet,tt_khach_hang,chinh_sach,ma_yeu_cau_su_co\n" +
  "huannt.mb,LK-000123,MUA DỰ TRỮ,2,,Không,,,Trong CSBH,\n";

// GET /api/dat-mua-lk/don-hang/import/template - file mau Excel/CSV cho import hang loat (tieu chi
// UX #4). "nguoi_nhan_hang" la MA KTV (khop ktv_lien_he.ma_ktv, xem Settings > Danh sach KTV),
// KHONG phai email - cac dong cung 1 ma se gop thanh 1 phieu dat.
datMuaLinhKien.get("/don-hang/import/template", (c) => csvTemplateResponse(c, DAT_DON_HANG_IMPORT_TEMPLATE_CSV, "mau_import_dat_don_hang.csv"));

datMuaLinhKien.post("/don-hang/import/preview", async (c) => {
  if (!canQuanLyDonHo(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ rows: DatDonHangImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processDatDonHangImportRows(c, body.rows, false);
  return c.json(summary);
});

datMuaLinhKien.post("/don-hang/import/commit", async (c) => {
  if (!canQuanLyDonHo(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ rows: DatDonHangImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processDatDonHangImportRows(c, body.rows, true);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json(summary);
});

// GET /api/dat-mua-lk/don-hang/:id - chi tiet 1 DONG don hang: thong tin dong + lich su (logs) + case
// lien ket. CHOT 2026-08-15: thay the GET /phieu-dat/:id (chi tiet ca phieu) va GET /don-hang/by-phieu
// (lay dong con theo danh sach phieu) - khong con khai niem "phieu" nua, moi dong tu dung doc lap
// (xem migration 0075). Ap dung scopeDatMuaNguoiTao (alias ddh) de khong lo du lieu ngoai pham vi.
datMuaLinhKien.get("/don-hang/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const scope = scopeDatMuaNguoiTao(c);
  const whereSql = "ddh.id = ?" + (scope?.whereSql ?? "");
  const binds = [id, ...(scope?.binds ?? [])];

  const ddh = await c.env.DB.prepare(
    `SELECT ddh.*, ddh.trang_thai_hien_tai as trang_thai, lk.dac_thu
     FROM dat_don_hang ddh
     LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
     WHERE ${whereSql}`,
  )
    .bind(...binds)
    .first<{ id: string; ly_do_cham: string | null; dac_thu: number | null; nguoi_tao: string; trang_thai: string }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);

  // FIX (ra soat "logic sai theo vai tro" 2026-08-29, cung dot voi choDonBiTuChoi o notifications.ts):
  // "hien den khi da xem chi tiet" - mo chi tiet don bi tu choi BANG BAT KY DUONG NAO (khong chi qua
  // chuong thong bao, xem NotificationBell.tsx) deu tu danh dau thong_bao_ktv da_doc=1, dong bo voi
  // dem choDonBiTuChoi. Fire-and-forget (waitUntil) - khong lam cham response chinh.
  if (ddh.trang_thai === "TN tu choi" && ddh.nguoi_tao === user.email) {
    c.executionCtx.waitUntil(
      (async () => {
        await c.env.DB.prepare(
          "UPDATE thong_bao_ktv SET da_doc = 1 WHERE nguoi_nhan = ? AND link_type = 'don_hang' AND link_id = ? AND loai = 'tu_choi' AND da_doc = 0",
        )
          .bind(user.email, id)
          .run();
        await bumpVersions(c.env.DB, ["dat_mua_lk"]);
      })(),
    );
  }

  // SUA (tach he doc lap): dat_don_case chi con luu case_id dang text (khong FK sang case_dvbh nua -
  // bang do khong con trong DB cuc bo), phai tra cuu khach_hang/khu_vuc qua API he cu cho tung ID.
  const [{ results: caseLinks }, { results: logs }] = await Promise.all([
    c.env.DB.prepare("SELECT dat_don_hang_id, case_id FROM dat_don_case WHERE dat_don_hang_id = ?")
      .bind(id)
      .all<{ dat_don_hang_id: string; case_id: string }>(),
    c.env.DB.prepare("SELECT * FROM dat_don_hang_log WHERE dat_don_hang_id = ? ORDER BY id DESC").bind(id).all<{ trang_thai: string; ngay_xu_ly: string }>(),
  ]);
  const casePreviews = await lookupCases(
    (caseLinks as { dat_don_hang_id: string; case_id: string }[]).map((r) => r.case_id),
    c.env,
  );
  const cases = (caseLinks as { dat_don_hang_id: string; case_id: string }[]).map((r) => ({
    dat_don_hang_id: r.dat_don_hang_id,
    id: r.case_id,
    khach_hang: casePreviews.get(r.case_id)?.khach_hang ?? null,
    khu_vuc: casePreviews.get(r.case_id)?.khu_vuc ?? null,
  }));

  // Co "qua han Ly do cham" (xem lib/hanLyDoCham.ts) - tinh tu ban ghi log "Cho TN duyet" MOI NHAT,
  // chi bao dong khi dong CHUA duoc TN dien ly_do_cham.
  const now = nowVN();
  const choTnDuyetLog = (logs as { trang_thai: string; ngay_xu_ly: string }[]).find((l) => l.trang_thai === "Cho TN duyet");
  const quaHan = !ddh.ly_do_cham && !!choTnDuyetLog && quaHanLyDoCham(choTnDuyetLog.ngay_xu_ly, now);

  // FIX (ra soat "logic sai theo vai tro" 2026-08-31, phan hoi "Vệ tinh không cần quan tâm đến PXK...
  // toàn bộ thông tin PXK có thể xem được ở đơn chi tiết"): KTV/Ve tinh KHONG co tab "Phieu xuat kho"
  // rieng (xem canXemPxkTab o DatMuaLinhKienModule.tsx - chi Tac nghiep/Kho/Ke toan/Giam sat moi thay
  // tab do) nen day la NOI DUY NHAT ho xem duoc trang thai PXK cua chinh dong minh + hanh dong "da
  // chuyen tien"/"da nhan hang" (backend GET/PATCH /phieu-xuat-kho/:id da cho phep nguoi_nhan_hang tu
  // lam tu truoc, chi thieu duong dan o FE). 1 dong chi thuoc toi da 1 PXK (migration 0074 "1 PXK = 1
  // KTV").
  const pxk = await c.env.DB.prepare(
    `SELECT pxk.id, pxk.trang_thai_hien_tai as trang_thai, pxk.so_tien_can_chuyen, pxk.trang_thai_chuyen_tien,
            pxk.bang_chung_chuyen_tien_url, pxk.bang_chung_chuyen_tien_ghi_chu, pxk.nguoi_nhan_hang, pxk.ma_xuat_kho
     FROM phieu_xuat_kho_dong pxkd JOIN phieu_xuat_kho pxk ON pxk.id = pxkd.phieu_xuat_kho_id
     WHERE pxkd.dat_don_hang_id = ?`,
  )
    .bind(id)
    .first();

  return c.json({ donHang: { ...ddh, cases, logs, qua_han_ly_do_cham: quaHan }, pxk: pxk ?? null });
});

// Mo 1 ca thieu_lk cho 1 DONG don hang khi TN tu choi bang 1 "Ly do cham" co co
// quan_ly_don_thieu_linh_kien=true (xem applyDonHangLog nhanh "tu_choi" ben duoi) - CHOT 2026-08-14:
// chi TN tao duoc ticket nay (khong phai Kho, khac thiet ke ban dau), Kho chi xu ly/giai trinh sau
// khi ticket da "ban" sang. Chi cho phep khi CHUA co ca thieu_lk nao dang mo cho dong nay (tranh 2
// ca song song lam sai logic tu dong quay ve "TN da duyet" khi 1 ca dong).
async function openThieuLkForDonHang(
  c: Context<{ Bindings: Env }>,
  donHangId: string,
  lyDoChamId: number,
): Promise<{ error: string; status: 409 } | { id: string }> {
  // BUG THAT (phat hien 2026-08-18 cung dot voi ma-misa PXK): "id" khong qualify se bi cot "id" cua
  // CHINH thieu_lk_log (PK cua bang do) SHADOW trong subquery tuong quan, thay vi tro ve thieu_lk.id
  // cua bang ngoai - pha vo tuong quan, luon tra NULL. Phai qualify "thieu_lk.id".
  const dangMo = await c.env.DB.prepare(
    `SELECT id FROM thieu_lk WHERE dat_don_hang_id = ? AND ${latestThieuLkStatusExpr("thieu_lk.id")} NOT IN ('Da huy bo', 'Da ket thuc') LIMIT 1`,
  )
    .bind(donHangId)
    .first();
  if (dangMo) return { error: "DA_CO_CA_THIEU_LK_DANG_MO", status: 409 };

  const user = c.get("user");
  const now = nowVN();
  const thieuLkId = await nextSequentialId(c.env.DB, "thieu_lk", "TLK", 6);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO thieu_lk (id, dat_don_hang_id, ly_do_cham_id, nguoi_tao, ngay_tao) VALUES (?, ?, ?, ?, ?)").bind(
      thieuLkId,
      donHangId,
      lyDoChamId,
      user.email,
      now,
    ),
    c.env.DB.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly) VALUES (?, ?, ?, ?)").bind(
      thieuLkId,
      "Cho kho xu ly",
      user.email,
      now,
    ),
  ]);
  return { id: thieuLkId };
}

// Logic dung chung cho 1 DONG don hang - tach ra de route bulk-log tai su dung dung 1 cho, khong
// copy lai role-check. Tra { error, status } khi khong hop le, hoac { nextTrangThai } khi thanh cong.
// "tu_choi" BAT BUOC ly_do_cham_id (tu danh sach settings_ly_do_cham, loc he_thong_su_dung chua
// "Mua hang", bat_tat=1) - CHOT 2026-08-14: he thong tu quyet dinh ket qua la "TN tu choi" (tu choi
// thuong) hay "Cho hang" (tu dong mo ticket thieu_lk gui Kho giai trinh) dua vao co
// quan_ly_don_thieu_linh_kien cua ly do do, KHONG con hanh_dong "cho_hang" rieng nua.
// Thong bao cho NGUOI TAO don khi dong cua ho toi 1 trong 4 moc quan trong (phan hoi 2026-08-26: bo
// qua cac buoc trung gian noi bo nhu "Cho Tram duyet"/"Cho TBP xac nhan" - nguoi tao khong can biet
// tung buoc, chi can biet ket qua cuoi). "Da huy" dung chung cho ca Tram/TBP tu choi LAN tu huy that
// su (hanhDong khac nhau) nen phai phan biet qua hanhDong de chon dung tu "từ chối" hay "huỷ".
function thongBaoChoNguoiTao(
  hanhDong: "duyet" | "tu_choi" | "huy",
  nextTrangThai: string,
  tenLk: string,
  soLuong: number,
): { loai: string; noiDung: string } | null {
  const ten = `"${tenLk} (x${soLuong})"`;
  if (nextTrangThai === "Da huy") {
    return hanhDong === "huy"
      ? { loai: "huy", noiDung: `Đơn hàng ${ten} của bạn đã bị huỷ` }
      : { loai: "tu_choi", noiDung: `Đơn hàng ${ten} của bạn đã bị từ chối` };
  }
  if (nextTrangThai === "TN tu choi") return { loai: "tu_choi", noiDung: `Đơn hàng ${ten} của bạn đã bị từ chối` };
  if (nextTrangThai === "Cho hang") return { loai: "cho_hang", noiDung: `Đơn hàng ${ten} của bạn bị báo chờ hàng` };
  if (nextTrangThai === "TN da duyet") return { loai: "da_duyet", noiDung: `Đơn hàng ${ten} của bạn đã được duyệt` };
  return null;
}

async function applyDonHangLog(
  c: Context<{ Bindings: Env }>,
  donHangId: string,
  hanhDong: "duyet" | "tu_choi" | "huy",
  lyDoChamId: number | undefined,
  ghiChu: string | undefined,
): Promise<{ error: string; status: 404 | 409 | 403 | 400 } | { nextTrangThai: string }> {
  const ddh = await c.env.DB.prepare(
    `SELECT ddh.loai_don, ddh.nguoi_tao, ddh.email_gs, ddh.version, ddh.ly_do_cham, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat,
            lk.dac_thu, ${latestDonHangStatusExpr("ddh.id")} as trang_thai, ${choTnDuyetAtExpr("ddh.id")} as cho_tn_duyet_at
     FROM dat_don_hang ddh LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk WHERE ddh.id = ?`,
  )
    .bind(donHangId)
    .first<{
      loai_don: string; nguoi_tao: string; email_gs: string | null; version: number; ly_do_cham: string | null;
      ten_lk_snapshot: string; so_luong_de_xuat: number; dac_thu: number | null; trang_thai: string | null; cho_tn_duyet_at: string | null;
    }>();
  if (!ddh) return { error: "NOT_FOUND", status: 404 };
  if (ddh.loai_don === "tra_hang") return { error: "USE_TRA_HANG_ROUTE", status: 400 };
  if (ddh.trang_thai && (DON_HANG_TRANG_THAI_DONG as readonly string[]).includes(ddh.trang_thai)) return { error: "DONG_DA_DONG", status: 409 };

  const user = c.get("user");
  let nextTrangThai: string;
  let tnDaXuLy = false; // TN vua xu ly dong nay - dung de auto-claim khu vuc phu trach (xem duoi)

  if (hanhDong === "huy") {
    const nguoiTaoRow = await c.env.DB.prepare("SELECT tram_cha FROM users WHERE email = ?").bind(ddh.nguoi_tao).first<{ tram_cha: string | null }>();
    const isOwnerOrTram = ddh.nguoi_tao === user.email || nguoiTaoRow?.tram_cha === user.email;
    if (!isOwnerOrTram && user.vai_tro !== "Admin") return { error: "FORBIDDEN_ROLE", status: 403 };
    // Chot phan hoi UX 2026-08-15 (muc 1): bat buoc nguoi huy nhap ly do (tu do, khong dung danh muc
    // Ly do cham cua TN vi khong hop nghia voi tu huy).
    if (!ghiChu?.trim()) return { error: "THIEU_LY_DO_HUY", status: 400 };
    nextTrangThai = "Da huy";
  } else if (ddh.trang_thai === "Cho Tram duyet") {
    const nguoiTaoRow = await c.env.DB.prepare("SELECT tram_cha FROM users WHERE email = ?").bind(ddh.nguoi_tao).first<{ tram_cha: string | null }>();
    if (nguoiTaoRow?.tram_cha !== user.email && user.vai_tro !== "Admin") return { error: "FORBIDDEN_ROLE", status: 403 };
    // Tram tu choi = huy han (khong phai "TN tu choi") - giu nguyen hanh vi da co truoc khi tach
    // xuong cap dong. CHOT 2026-08-17: Tram duyet xong -> "Cho TBP xac nhan" truoc neu ma LK dac
    // thu (migration 0082), khong di thang "Cho TN duyet" nhu truoc.
    // FIX (phan hoi 2026-08-25, hang muc #19): bat buoc ghi_chu khi tu choi - dao nguoc quyet dinh cu
    // "ghi chu tuy chon" (moi buoc huy/tu choi deu phai nhap ly do, khong chi buoc cuoi cung).
    if (hanhDong !== "duyet" && !ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 400 };
    nextTrangThai = hanhDong === "duyet" ? (ddh.dac_thu ? "Cho TBP xac nhan" : "Cho TN duyet") : "Da huy";
  } else if (ddh.trang_thai === "Cho TBP xac nhan") {
    if (!canTPDvbhXacNhan(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = hanhDong === "duyet" ? "Cho TN duyet" : hanhDong === "tu_choi" ? "Da huy" : "";
    if (!nextTrangThai) return { error: "INVALID_HANH_DONG", status: 400 };
    // FIX (phan hoi 2026-08-25, hang muc #19): bat buoc ghi_chu khi tu choi (truoc day "tuy chon" -
    // xem comment cu da xoa, dao nguoc quyet dinh CHOT 2026-08-17).
    if (hanhDong === "tu_choi" && !ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 400 };
  } else if (ddh.trang_thai === "Cho TN duyet") {
    if (!canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    tnDaXuLy = true;
    if (hanhDong === "duyet") {
      // FIX (phan hoi 2026-08-25, hang muc #17/#18): don da qua han 24h "Cho TN duyet" (chua co
      // ly_do_cham) bat buoc chon 1 ly do (dung LAI danh sach settings_ly_do_cham dang dung cho
      // "Tu choi/Cho hang" - khong tao khai niem "ly do qua han" rieng) truoc khi duoc Duyet. Don
      // chua qua han giu hanh vi cu: Duyet ngay, khong hoi gi.
      // FIX (audit 2026-08-26): PHAI check them "!ddh.ly_do_cham" giong het field qua_han_ly_do_cham
      // o danh sach (dong 727) - thieu dieu kien nay se lech voi FE: don da tung co ly_do_cham (vd tu
      // 1 lan "Cho hang" truoc do) roi quay lai "Cho TN duyet" va qua han LAN NUA se bi FE coi la
      // "khong qua han" (khong mo modal) nhung BE van tu choi -> ket, khong co duong nhap ly do.
      if (!ddh.ly_do_cham && ddh.cho_tn_duyet_at && quaHanLyDoCham(ddh.cho_tn_duyet_at, nowVN())) {
        if (!lyDoChamId) return { error: "MISSING_LY_DO_CHAM", status: 400 };
        const lyDo = await c.env.DB.prepare(
          "SELECT id, ten_ly_do FROM settings_ly_do_cham WHERE id = ? AND bat_tat = 1 AND he_thong_su_dung LIKE '%Mua hàng%'",
        )
          .bind(lyDoChamId)
          .first<{ id: number; ten_ly_do: string }>();
        if (!lyDo) return { error: "LY_DO_CHAM_KHONG_HOP_LE", status: 400 };
        ghiChu = lyDo.ten_ly_do + (ghiChu?.trim() ? ` - ${ghiChu.trim()}` : "");
      }
      nextTrangThai = "TN da duyet";
    } else if (hanhDong === "tu_choi") {
      if (!lyDoChamId) return { error: "MISSING_LY_DO_CHAM", status: 400 };
      const lyDo = await c.env.DB.prepare(
        "SELECT id, ten_ly_do, quan_ly_don_thieu_linh_kien FROM settings_ly_do_cham WHERE id = ? AND bat_tat = 1 AND he_thong_su_dung LIKE '%Mua hàng%'",
      )
        .bind(lyDoChamId)
        .first<{ id: number; ten_ly_do: string; quan_ly_don_thieu_linh_kien: number }>();
      if (!lyDo) return { error: "LY_DO_CHAM_KHONG_HOP_LE", status: 400 };

      if (lyDo.quan_ly_don_thieu_linh_kien) {
        const opened = await openThieuLkForDonHang(c, donHangId, lyDo.id);
        if ("error" in opened) return opened;
        nextTrangThai = "Cho hang";
      } else {
        nextTrangThai = "TN tu choi";
      }
      ghiChu = lyDo.ten_ly_do + (ghiChu?.trim() ? ` - ${ghiChu.trim()}` : "");
    } else {
      return { error: "INVALID_HANH_DONG", status: 400 };
    }
  } else {
    return { error: "INVALID_STATE", status: 409 };
  }

  // RA SOAT BAO MAT 2026-08-18 (phan hoi Codex #8, migration 0087): UPDATE co dieu kien tren
  // version/trang_thai_hien_tai TRUOC khi ghi log - 2 request chuyen trang thai dong thoi cho CUNG 1
  // dong (vd 2 tab TN cung bam duyet/tu choi) truoc day deu doc thay trang thai cu (correlated
  // subquery) va deu ghi duoc 1 dong log, co the tao 2 quyet dinh mau thuan. Gio chi request nao
  // "thang" duoc UPDATE (khop dung version da doc luc dau ham) moi duoc ghi log; request thua nhan
  // 409 STATE_CHANGED, KHONG ghi log (tranh log rac/mau thuan).
  const casResult = await c.env.DB.prepare(
    "UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
  )
    .bind(nextTrangThai, nowVN(), donHangId, ddh.version)
    .run();
  if (!casResult.meta.changes) return { error: "STATE_CHANGED", status: 409 };

  await c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(donHangId, nextTrangThai, user.email, nowVN(), ghiChu?.trim() || null)
    .run();

  // Thong bao cho nguoi tao (phan hoi 2026-08-26) - bo qua neu chinh nguoi tao la nguoi vua thao tac
  // (vd tu huy don cua minh, da biet ket qua ngay tren man hinh, khong can bao lai).
  if (ddh.nguoi_tao !== user.email) {
    const thongBao = thongBaoChoNguoiTao(hanhDong, nextTrangThai, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat);
    if (thongBao) {
      c.executionCtx.waitUntil(
        (async () => {
          await c.env.DB.prepare(
            "INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, ?, ?, 'don_hang', ?, ?)",
          )
            .bind(ddh.nguoi_tao, thongBao.loai, thongBao.noiDung, donHangId, nowVN())
            .run();
          // Day Web Push ngay (phan hoi 2026-08-26) - xem lib/webPush.ts.
          await sendPushToUser(c.env, ddh.nguoi_tao, { title: "Đặt mua linh kiện", body: thongBao.noiDung, url: "/" });
        })(),
      );
    }
  }

  // Auto-claim khu vuc phu trach (muc F) - chi khi TN thuc su vua xu ly (duyet/tu choi) 1 dong o
  // trang thai "Cho TN duyet", khong chan response (waitUntil).
  if (tnDaXuLy) {
    c.executionCtx.waitUntil(autoClaimGs(c.env.DB, user.email, ddh.email_gs));
  }

  return { nextTrangThai };
}

// POST /api/dat-mua-lk/don-hang/:id/log - chuyen trang thai 1 DONG don hang (Tram duyet/day len TBP
// hoac TN, TBP xac nhan/day len TN, TN duyet/tu choi, huy). Chi cho phep dung buoc hop le tiep theo
// tuy vao ai goi:
//  - Tram (la_ktv_dvbh + co Ve tinh thuoc minh) tren dong dang "Cho Tram duyet" cua chinh Ve tinh
//    minh quan ly: chuyen sang "Cho TBP xac nhan" (neu ma LK dac_thu) hoac "Cho TN duyet" (duyet),
//    hoac "Da huy" (tu choi).
//  - TBP (canTPDvbhXacNhan - la_tp_dvbh/Admin, CHOT 2026-08-17, migration 0082) tren dong dang "Cho
//    TBP xac nhan": chuyen "Cho TN duyet" (duyet) hoac "Da huy" (tu choi, ghi chu tuy chon, khong
//    can ly_do_cham_id - giong pattern Tram).
//  - TN (canTacNghiep - la_tac_nghiep/Admin) tren dong dang "Cho TN duyet": chuyen "TN da duyet", hoac tu choi kem
//    ly_do_cham_id bat buoc (he thong tu quyet dinh "TN tu choi" hay tu dong mo ticket "Cho hang").
//    "Duyet" 1 dong DA QUA HAN 24h (chua co ly_do_cham) cung bat buoc ly_do_cham_id (hang muc #17/#18,
//    2026-08-25) - dung LAI danh sach ly do o tren, khong phai truong rieng.
//  - Nguoi tao (hoac Tram cua nguoi tao): huy dong khi con dang mo (chua vao trang thai dong).
datMuaLinhKien.post("/don-hang/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ hanh_dong: "duyet" | "tu_choi" | "huy"; ly_do_cham_id?: number; ghi_chu?: string }>();
  const result = await applyDonHangLog(c, id, body.hanh_dong, body.ly_do_cham_id, body.ghi_chu);
  if ("error" in result) return c.json({ error: result.error }, result.status);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, trang_thai: result.nextTrangThai });
});

// POST /api/dat-mua-lk/don-hang/bulk-log - { ids, hanh_dong, ly_do_cham_id?, ghi_chu? } xu ly hang
// loat nhieu DONG don hang cung luc (luon la dat_don_hang id - CHOT 2026-08-15: bo nhanh mo rong
// "phieu_dat id -> toan bo dong con", khong con khai niem phieu de truyen vao nua, xem migration
// 0075). Tai su dung applyDonHangLog, khong copy lai role-check. Tiep tuc xu ly cac id con lai ngay
// ca khi 1 id loi - tra ve ket qua tung dong de UI hien day du thanh cong/that bai.
datMuaLinhKien.post("/don-hang/bulk-log", async (c) => {
  const body = await c.req.json<{ ids: string[]; hanh_dong: "duyet" | "tu_choi" | "huy"; ly_do_cham_id?: number; ghi_chu?: string }>();
  if (!Array.isArray(body.ids) || body.ids.length === 0) return c.json({ error: "MISSING_IDS" }, 400);
  const ids = [...new Set(body.ids)];
  if (ids.length > MAX_BULK_IDS) return c.json({ error: "QUA_NHIEU_ID", max: MAX_BULK_IDS }, 400);

  const results: Record<string, string> = {};
  let coThanhCong = false;
  for (const donHangId of ids) {
    const result = await applyDonHangLog(c, donHangId, body.hanh_dong, body.ly_do_cham_id, body.ghi_chu);
    results[donHangId] = "error" in result ? result.error : result.nextTrangThai;
    if (!("error" in result)) coThanhCong = true;
  }

  if (coThanhCong) c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ results });
});

// PATCH /api/dat-mua-lk/don-hang/:id - 2 nhanh quyen sua rieng biet (CHOT 2026-08-16, dot 3 gop y
// #6 - DAO NGUOC CO CHU Y quy tac "6 truong phu bat bien sau khi tao" cua migration 0070):
//  - Nguoi tao dong, CHI khi dong con dang mo ("Cho Tram duyet"/"Cho TBP xac nhan"/"Cho TN duyet" -
//    chua toi TN xu ly xong): sua duoc TOAN BO thong tin dong (ma_lk, loai_de_xuat, so_luong_de_xuat, ghi_chu,
//    yeu_cau_hoa_don, tt_mail_duyet, tt_khach_hang, chinh_sach, ma_yeu_cau_su_co, uu_tien). Doi
//    ma_lk thi re-snapshot ten_lk_snapshot/gia_de_xuat (gia lay tu gia_ban, khop POST /phieu-dat).
//    Ap lai dung validate canNoRequired tren gia tri SAU khi sua.
//  - TN (canTacNghiep): giu nguyen 5 truong cu (so_luong_thuc_xuat/gia_chot/ma_xuat_kho/ma_misa/
//    ly_do_cham - gan ma_xuat_kho CHINH THUC van la qua POST /phieu-xuat-kho, o day chi de TN sua
//    lai 1 dong rieng le), THEM 4 truong phu (ma_yeu_cau_su_co/yeu_cau_hoa_don/tt_khach_hang/
//    tt_mail_duyet) de TN ho tro nguoi tao sua khi dang xu ly, khong gioi han trang thai.
//
// ly_do_cham (CHOT 2026-08-14, xem migration 0070): TN giai trinh khi dong ton qua 24h ke tu "Cho TN
// duyet" ma chua duoc dua vao PXK "Cho ke toan" - bat buoc dien TRUOC khi POST
// /phieu-xuat-kho/:id/log chan chuyen sang "Cho ke toan" (xem phieuXuatKho.ts). TN co the dien truoc
// han (chu dong giai trinh som) - khong gate o day, chi gate o buoc chuyen trang thai PXK.
datMuaLinhKien.patch("/don-hang/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<{
    so_luong_thuc_xuat?: number; gia_chot?: number; ma_xuat_kho?: string; ma_misa?: string; ly_do_cham?: string;
    ma_yeu_cau_su_co?: string; yeu_cau_hoa_don?: string; tt_khach_hang?: string; tt_mail_duyet?: string;
    ma_lk?: string; loai_de_xuat?: string; so_luong_de_xuat?: number; ghi_chu?: string; chinh_sach?: string; uu_tien?: boolean;
  }>();
  // BUG THAT (phat hien 2026-08-18 cung dot voi ma-misa PXK): "id" khong qualify bi cot "id" cua
  // CHINH dat_don_hang_log (PK) SHADOW trong subquery tuong quan -> trang_thai luon ra NULL ->
  // isCreatorEditWindow ben duoi LUON false (khong khop bat ky trang thai nao trong 3 gia tri so
  // sanh) -> nguoi tao KHONG BAO GIO sua duoc toan bo don qua nhanh nay, roi vao nhanh TN (bi
  // FORBIDDEN_ROLE neu khong phai TN, hoac am tham chi ap dung 5+4 truong TN neu la TN). Phai
  // qualify "dat_don_hang.id".
  const existing = await c.env.DB.prepare(
    `SELECT nguoi_tao, ma_xuat_kho, so_luong_thuc_xuat, gia_chot, ma_misa, ly_do_cham,
       ma_lk, ten_lk_snapshot, loai_de_xuat, so_luong_de_xuat, gia_de_xuat, ghi_chu, chinh_sach,
       ma_yeu_cau_su_co, yeu_cau_hoa_don, tt_khach_hang, tt_mail_duyet, uu_tien,
       ${latestDonHangStatusExpr("dat_don_hang.id")} as trang_thai
     FROM dat_don_hang WHERE id = ?`,
  )
    .bind(id)
    .first<{
      nguoi_tao: string; ma_xuat_kho: string | null; so_luong_thuc_xuat: number | null; gia_chot: number | null;
      ma_misa: string | null; ly_do_cham: string | null; ma_lk: string; ten_lk_snapshot: string | null;
      loai_de_xuat: string | null; so_luong_de_xuat: number; gia_de_xuat: number | null; ghi_chu: string | null;
      chinh_sach: string | null; ma_yeu_cau_su_co: string | null; yeu_cau_hoa_don: string | null;
      tt_khach_hang: string | null; tt_mail_duyet: string | null; uu_tien: number; trang_thai: string | null;
    }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const isCreatorEditWindow =
    user.email === existing.nguoi_tao &&
    (existing.trang_thai === "Cho Tram duyet" || existing.trang_thai === "Cho TBP xac nhan" || existing.trang_thai === "Cho TN duyet");

  if (isCreatorEditWindow) {
    const nextLde = body.loai_de_xuat !== undefined ? body.loai_de_xuat.trim() : (existing.loai_de_xuat ?? "");
    const nextChinhSach = body.chinh_sach !== undefined ? body.chinh_sach?.trim() || null : existing.chinh_sach;
    const nextMaYeuCauSuCo = body.ma_yeu_cau_su_co !== undefined ? body.ma_yeu_cau_su_co?.trim() || null : existing.ma_yeu_cau_su_co;
    if (canNoRequired(nextLde) && (!nextChinhSach || !nextMaYeuCauSuCo)) {
      return c.json({ error: "THIEU_CHINH_SACH_HOAC_MA_YCSC" }, 400);
    }

    let tenLkSnapshot = existing.ten_lk_snapshot;
    let giaDeXuat = existing.gia_de_xuat;
    const nextMaLk = body.ma_lk !== undefined ? body.ma_lk.trim() : existing.ma_lk;
    if (!nextMaLk) return c.json({ error: "INVALID_DON_HANG" }, 400);
    if (nextMaLk !== existing.ma_lk) {
      const lk = await c.env.DB.prepare("SELECT ten_linh_kien as ten_lk, gia_ban FROM linh_kien WHERE ma_linh_kien = ?")
        .bind(nextMaLk)
        .first<{ ten_lk: string; gia_ban: number | null }>();
      if (!lk) return c.json({ error: "MA_LK_NOT_FOUND", ma_lk: nextMaLk }, 400);
      tenLkSnapshot = lk.ten_lk;
      giaDeXuat = lk.gia_ban;
    }

    const nextSoLuong = body.so_luong_de_xuat !== undefined ? body.so_luong_de_xuat : existing.so_luong_de_xuat;
    if (!nextSoLuong || nextSoLuong <= 0) return c.json({ error: "INVALID_DON_HANG" }, 400);

    const next = {
      ma_lk: nextMaLk,
      ten_lk_snapshot: tenLkSnapshot,
      gia_de_xuat: giaDeXuat,
      loai_don: deriveLoaiDon(nextLde),
      loai_de_xuat: nextLde,
      so_luong_de_xuat: nextSoLuong,
      ghi_chu: body.ghi_chu !== undefined ? body.ghi_chu?.trim() || null : existing.ghi_chu,
      yeu_cau_hoa_don: body.yeu_cau_hoa_don !== undefined ? body.yeu_cau_hoa_don?.trim() || null : existing.yeu_cau_hoa_don,
      tt_khach_hang: body.tt_khach_hang !== undefined ? body.tt_khach_hang?.trim() || null : existing.tt_khach_hang,
      tt_mail_duyet: body.tt_mail_duyet !== undefined ? body.tt_mail_duyet?.trim() || null : existing.tt_mail_duyet,
      chinh_sach: nextChinhSach,
      ma_yeu_cau_su_co: nextMaYeuCauSuCo,
      uu_tien: body.uu_tien !== undefined ? (body.uu_tien ? 1 : 0) : existing.uu_tien,
      // BUG THAT (phat hien 2026-08-19 luc kiem thu tinh nang "nhap ly do cham cho dong Cho TN
      // duyet"): nhanh isCreatorEditWindow/canTacNghiep la if/else LOAI TRU nhau - 1 nguoi VUA la
      // nguoi tao VUA la TN (vd TN tu tao don cho chinh minh, canCreatePhieuDat cho phep dieu nay)
      // luon roi vao nhanh nay truoc, PATCH { ly_do_cham } cua ho bi am tham bo qua khong luu. Chi
      // cho phep sua ly_do_cham O DAY khi nguoi goi THUC SU la TN (canTacNghiep) - tranh nguoi tao
      // thuong (khong phai TN) smuggle gia tri qua nhanh nay.
      ly_do_cham: canTacNghiep(c) && body.ly_do_cham !== undefined ? body.ly_do_cham?.trim() || null : existing.ly_do_cham,
    };

    await c.env.DB.prepare(
      `UPDATE dat_don_hang SET ma_lk = ?, ten_lk_snapshot = ?, gia_de_xuat = ?, loai_don = ?, loai_de_xuat = ?,
         so_luong_de_xuat = ?, ghi_chu = ?, yeu_cau_hoa_don = ?, tt_khach_hang = ?, tt_mail_duyet = ?,
         chinh_sach = ?, ma_yeu_cau_su_co = ?, uu_tien = ?, ly_do_cham = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        next.ma_lk, next.ten_lk_snapshot, next.gia_de_xuat, next.loai_don, next.loai_de_xuat,
        next.so_luong_de_xuat, next.ghi_chu, next.yeu_cau_hoa_don, next.tt_khach_hang, next.tt_mail_duyet,
        next.chinh_sach, next.ma_yeu_cau_su_co, next.uu_tien, next.ly_do_cham, nowVN(), id,
      )
      .run();
  } else if (canTacNghiep(c)) {
    const newMaXuatKho = body.ma_xuat_kho !== undefined ? body.ma_xuat_kho?.trim() || null : existing.ma_xuat_kho;

    const next = {
      so_luong_thuc_xuat: body.so_luong_thuc_xuat !== undefined ? body.so_luong_thuc_xuat : existing.so_luong_thuc_xuat,
      gia_chot: body.gia_chot !== undefined ? body.gia_chot : existing.gia_chot,
      ma_xuat_kho: newMaXuatKho,
      ma_misa: body.ma_misa !== undefined ? body.ma_misa?.trim() || null : existing.ma_misa,
      ly_do_cham: body.ly_do_cham !== undefined ? body.ly_do_cham?.trim() || null : existing.ly_do_cham,
      ma_yeu_cau_su_co: body.ma_yeu_cau_su_co !== undefined ? body.ma_yeu_cau_su_co?.trim() || null : existing.ma_yeu_cau_su_co,
      yeu_cau_hoa_don: body.yeu_cau_hoa_don !== undefined ? body.yeu_cau_hoa_don?.trim() || null : existing.yeu_cau_hoa_don,
      tt_khach_hang: body.tt_khach_hang !== undefined ? body.tt_khach_hang?.trim() || null : existing.tt_khach_hang,
      tt_mail_duyet: body.tt_mail_duyet !== undefined ? body.tt_mail_duyet?.trim() || null : existing.tt_mail_duyet,
    };

    await c.env.DB.prepare(
      `UPDATE dat_don_hang SET so_luong_thuc_xuat = ?, gia_chot = ?, ma_xuat_kho = ?, ma_misa = ?, ly_do_cham = ?,
         ma_yeu_cau_su_co = ?, yeu_cau_hoa_don = ?, tt_khach_hang = ?, tt_mail_duyet = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        next.so_luong_thuc_xuat, next.gia_chot, next.ma_xuat_kho, next.ma_misa, next.ly_do_cham,
        next.ma_yeu_cau_su_co, next.yeu_cau_hoa_don, next.tt_khach_hang, next.tt_mail_duyet, nowVN(), id,
      )
      .run();
  } else {
    return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  }

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// BO (ra soat bao mat 2026-08-18, phan hoi Codex): DELETE /api/dat-mua-lk/don-hang/:id xoa cung
// dat_don_hang_log (mat dau audit) va KHONG kiem tra nguoi goi la ai - bat ky tai khoan da duyet nao
// biet ID cung xoa duoc don cua nguoi khac. Frontend chua tung goi endpoint nay (khong co
// api.delete(".../don-hang/...") o dau trong module) - co san 1 co che "huy" MEM tuong duong, DA
// DUOC BAO VE DUNG (chi nguoi tao/Tram cua nguoi tao/Admin, bat buoc ghi_chu ly do, khong xoa lich
// su) qua POST /don-hang/:id/log { hanh_dong: "huy" } - xem nhanh "huy" trong applyDonHangLog o duoi.
// Xoa han endpoint thay vi vá lai vi da co duong thay the an toan hon, tranh duy tri 2 co che song
// song lam cung 1 viec.

// Quyen gan/go "Ma yeu cau su co lien quan" (dat_don_case) cua 1 dong don hang - RA SOAT BAO MAT
// 2026-08-18 (phan hoi Codex): truoc day 2 route duoi hoan toan khong kiem tra ai goi, chi kiem tra
// record ton tai - bat ky tai khoan da duyet nao cung gan/go duoc lien ket cua don nguoi khac. Dung
// chung 1 helper: nguoi tao dong (khi dong con dang mo, CHUA vao PXK nao) hoac Tac nghiep/Admin (moi
// luc, ke ca don da vao PXK/hoan thanh) - khop dung nguyen tac "nguoi tao chi sua duoc trong cua so
// dang mo" da dung o PATCH /don-hang/:id (isCreatorEditWindow) + "da vao PXK thi chi TN/Admin duoc
// dong vao du lieu" (tranh lech du lieu voi PXK da chot).
async function canManageDonHangCaseLink(
  c: Context<{ Bindings: Env }>,
  donHangId: string,
): Promise<{ error: string; status: 404 | 403 } | { ok: true }> {
  const ddh = await c.env.DB.prepare(
    `SELECT nguoi_tao, ma_xuat_kho, ${latestDonHangStatusExpr("dat_don_hang.id")} as trang_thai FROM dat_don_hang WHERE id = ?`,
  )
    .bind(donHangId)
    .first<{ nguoi_tao: string; ma_xuat_kho: string | null; trang_thai: string | null }>();
  if (!ddh) return { error: "NOT_FOUND", status: 404 };
  if (canTacNghiep(c)) return { ok: true };

  const user = c.get("user");
  const daVaoPxk = !!ddh.ma_xuat_kho;
  const daDong = !!ddh.trang_thai && (DON_HANG_TRANG_THAI_DONG as readonly string[]).includes(ddh.trang_thai);
  if (daVaoPxk || daDong || ddh.nguoi_tao !== user.email) return { error: "FORBIDDEN_ROLE", status: 403 };
  return { ok: true };
}

// POST /api/dat-mua-lk/don-hang/:id/case - { case_id } gan 1 case_dvbh vao dong don hang.
datMuaLinhKien.post("/don-hang/:id/case", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ case_id: string }>();
  if (!body.case_id?.trim()) return c.json({ error: "MISSING_CASE_ID" }, 400);

  const perm = await canManageDonHangCaseLink(c, id);
  if ("error" in perm) return c.json({ error: perm.error }, perm.status);
  // SUA (tach he doc lap): xac nhan case ton tai qua API he cu thay vi truy van case_dvbh cuc bo.
  const caseRow = await lookupCase(body.case_id.trim(), c.env);
  if (!caseRow) return c.json({ error: "CASE_NOT_FOUND" }, 404);

  await c.env.DB.prepare("INSERT OR IGNORE INTO dat_don_case (dat_don_hang_id, case_id) VALUES (?, ?)").bind(id, body.case_id.trim()).run();
  return c.json({ ok: true }, 201);
});

datMuaLinhKien.delete("/don-hang/:id/case/:caseId", async (c) => {
  const id = c.req.param("id");
  const caseId = c.req.param("caseId");
  const perm = await canManageDonHangCaseLink(c, id);
  if ("error" in perm) return c.json({ error: perm.error }, perm.status);

  await c.env.DB.prepare("DELETE FROM dat_don_case WHERE dat_don_hang_id = ? AND case_id = ?").bind(id, caseId).run();
  return c.json({ ok: true });
});

// ---------- Nhanh "thieu linh kien" (xem migration 0057 + 0065_ly_do_cham_va_thieu_lk.sql) --------
// CHOT 2026-08-14: ticket CHI duoc he thong tu tao khi TN tu choi 1 dong bang 1 "Ly do cham" co co
// quan_ly_don_thieu_linh_kien=true (xem openThieuLkForDonHang + applyDonHangLog o tren) - khong con
// endpoint tao truc tiep rieng nua. Kho chi xu ly (tiep nhan/giai trinh/xac nhan hang ve) qua
// POST /thieu-lk/:id/log ben duoi; buoc cuoi "Da ket thuc" la cua TN (khop cot "Admin xu ly" trong
// du lieu Excel goc - "Admin" trong file cu = Tac nghiep trong he thong moi).

const THIEU_LK_TRANG_THAI_DONG = ["Da huy bo", "Da ket thuc"] as const;

// 3 nhanh re "tiep tuc luong don hang" da chot truoc day (xem comment migration 0063) - dong don
// hang tu dong quay ve "TN da duyet" ngay khi 1 trong 3 trang thai nay duoc ghi, KHONG doi den
// "Da ket thuc" (buoc do chi la dong ho so hanh chinh sau khi da tiep tuc luong tu truoc).
const THIEU_LK_TIEP_TUC_LUONG = ["Kho xac nhan hang da ve", "Kho tu choi sai TT", "Da huy bo"] as const;

function latestThieuLkStatusExpr(thieuLkIdCol: string): string {
  return `(SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = ${thieuLkIdCol} ORDER BY id DESC LIMIT 1)`;
}

function canKho(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_kho || user.vai_tro === "Admin";
}

// GET /api/dat-mua-lk/ly-do-cham?he_thong= - danh sach ly do cham dang bat, loc theo he thong su
// dung (vd "Mua hàng") - dung cho dropdown TN chon luc tu choi 1 dong. Mo cho moi user da dang nhap
// (chi TN moi thuc su dung duoc luc tu choi, nhung liet ke thi khong nhay cam).
datMuaLinhKien.get("/ly-do-cham", async (c) => {
  const heThong = c.req.query("he_thong");
  let whereSql = "bat_tat = 1";
  const binds: unknown[] = [];
  if (heThong) {
    whereSql += " AND he_thong_su_dung LIKE ?";
    binds.push(`%${heThong}%`);
  }
  const { results } = await c.env.DB.prepare(`SELECT * FROM settings_ly_do_cham WHERE ${whereSql} ORDER BY stt`).bind(...binds).all();
  return c.json({ rows: results });
});

// GET /api/dat-mua-lk/thieu-lk?dat_don_hang_id=&trang_thai= - danh sach, Kho/TN xem toan bo, nguoi
// khac chi xem thieu-lk cua dong don hang minh tao.
datMuaLinhKien.get("/thieu-lk", async (c) => {
  const user = c.get("user");
  const donHangId = c.req.query("dat_don_hang_id");
  const trangThai = c.req.query("trang_thai");
  // Them 2026-08-21 (dong bo UI voi GET /don-hang) - tim theo ma LK/ten LK/ma TLK/nguoi bao.
  const q = c.req.query("q")?.trim();
  // GD4 (phan hoi Codex #17): truoc day tra ve TOAN BO dong khop bo loc, frontend tu slice o client.
  // Them phan trang server-side, cung pattern voi GET /don-hang.
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(1000, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  let whereSql = "1=1";
  const binds: unknown[] = [];
  // FIX (ma tran kiem soat he thong, Van de #4 sheet "5. Van de phat hien", xac nhan 2026-08-24): truoc
  // day MOI vai tro khong phai Kho/TN deu bi loc theo tlk.nguoi_tao (nguoi TAO TICKET, thuong la CHINH
  // Kho bao thieu chu khong phai KTV/GS) - Giam sat gan nhu khong bao gio la nguoi tao ticket nen luon
  // thay danh sach RONG, du KTV minh phu trach co ticket that. Them nhanh rieng cho GS: loc theo
  // ddh.email_gs cua DON HANG GOC sinh ra ticket (dung ten cot giong scopeDatMuaNguoiTao() trong
  // scopeDatMua.ts) - ddh da duoc LEFT JOIN san o ca 2 query nay nen khong can them JOIN. Cac vai tro
  // khac (KTV/Ve tinh/Tram/Ke toan/TP DVBH...) GIU NGUYEN hanh vi cu (chi thay ticket tu tao).
  if (canKho(c) || canTacNghiep(c)) {
    // khong gioi han - giu nguyen
  } else if (user.vai_tro === "Giam sat") {
    whereSql += " AND ddh.email_gs = ?";
    binds.push(user.email);
  } else if (user.la_view) {
    // "View" (them 2026-08-26) - loc theo Khu vuc gan cho tai khoan nay, giong scopeDatMuaNguoiTao -
    // xem comment khuVucViewEmailInSql() trong scopeDatMua.ts.
    const emailIn = khuVucViewEmailInSql();
    whereSql += ` AND (ddh.nguoi_tao IN ${emailIn} OR ddh.nguoi_nhan_hang IN ${emailIn})`;
    binds.push(user.email, user.email);
  } else {
    whereSql += " AND tlk.nguoi_tao = ?";
    binds.push(user.email);
  }
  if (donHangId) {
    whereSql += " AND tlk.dat_don_hang_id = ?";
    binds.push(donHangId);
  }
  if (trangThai) {
    whereSql += ` AND ${latestThieuLkStatusExpr("tlk.id")} = ?`;
    binds.push(trangThai);
  }
  if (q) {
    whereSql += " AND (ddh.ma_lk LIKE ? OR ddh.ten_lk_snapshot LIKE ? OR tlk.id LIKE ? OR tlk.nguoi_tao LIKE ?)";
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  // SUA 2026-08-21: count query gio can JOIN ddh giong query chinh ben duoi vi whereSql (nhanh "q")
  // co the tham chieu ddh.ma_lk/ddh.ten_lk_snapshot - truoc do count khong JOIN vi whereSql chua bao
  // gio dung toi cot nao ngoai tlk.
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM thieu_lk tlk LEFT JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id WHERE ${whereSql}`,
  )
    .bind(...binds)
    .first<{ total: number }>();
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #11): them ma_lk/ten_lk_snapshot qua 1 JOIN DUY
  // NHAT toi dat_don_hang (khong N+1 query) - day la thong tin Kho can doc DAU TIEN de xu ly ticket,
  // truoc do bang nay hoan toan khong co, phai tu tra dat_don_hang_id o tab khac.
  // Them ddh.nguoi_nhan_hang/ddh.loai_don (2026-08-21, phan hoi "format Thiếu LK khác Mua hàng/Công
  // nợ") - dung nhom danh sach theo KTV (nguoi_nhan_hang || nguoi_tao cua DON HANG, KHONG PHAI
  // tlk.nguoi_tao la nguoi BAO thieu, thuong la Kho chu khong phai KTV) va hien Badge "Loại" giong
  // DonHangGroupedList, dong bo dung kien truc voi Mua hang/Cong no.
  const { results } = await c.env.DB.prepare(
    `SELECT tlk.*, sldc.ten_ly_do, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.uu_tien, ddh.nguoi_nhan_hang, ddh.loai_don, ddh.nguoi_tao as ddh_nguoi_tao, ${latestThieuLkStatusExpr("tlk.id")} as trang_thai
     FROM thieu_lk tlk
     LEFT JOIN settings_ly_do_cham sldc ON sldc.id = tlk.ly_do_cham_id
     LEFT JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id
     WHERE ${whereSql} ORDER BY tlk.ngay_tao DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/dat-mua-lk/thieu-lk/:id - chi tiet 1 ticket + lich su xu ly (them 2026-08-21, phan hoi
// "hợp nhất phong cách giao diện" - ThieuLkTab truoc day khong co man chi tiet rieng, gio them Drawer
// giong PXK/Mua hang nen can endpoint tra ca logs). Ap dung CUNG scope voi GET /thieu-lk (Kho/TN xem
// toan bo, con lai chi xem duoc ticket cua chinh minh) - tra 404 khi ngoai pham vi thay vi 403 de
// khong lo thong tin ticket ton tai hay khong.
datMuaLinhKien.get("/thieu-lk/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  let whereSql = "tlk.id = ?";
  const binds: unknown[] = [id];
  // FIX (dong bo voi GET /thieu-lk o tren, cung Van de #4) - them nhanh GS theo ddh.email_gs.
  if (canKho(c) || canTacNghiep(c)) {
    // khong gioi han - giu nguyen
  } else if (user.vai_tro === "Giam sat") {
    whereSql += " AND ddh.email_gs = ?";
    binds.push(user.email);
  } else if (user.la_view) {
    // "View" (them 2026-08-26) - loc theo Khu vuc gan cho tai khoan nay, giong scopeDatMuaNguoiTao -
    // xem comment khuVucViewEmailInSql() trong scopeDatMua.ts.
    const emailIn = khuVucViewEmailInSql();
    whereSql += ` AND (ddh.nguoi_tao IN ${emailIn} OR ddh.nguoi_nhan_hang IN ${emailIn})`;
    binds.push(user.email, user.email);
  } else {
    whereSql += " AND tlk.nguoi_tao = ?";
    binds.push(user.email);
  }
  const tlk = await c.env.DB.prepare(
    `SELECT tlk.*, sldc.ten_ly_do, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.uu_tien, ${latestThieuLkStatusExpr("tlk.id")} as trang_thai
     FROM thieu_lk tlk
     LEFT JOIN settings_ly_do_cham sldc ON sldc.id = tlk.ly_do_cham_id
     LEFT JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id
     WHERE ${whereSql}`,
  )
    .bind(...binds)
    .first();
  if (!tlk) return c.json({ error: "NOT_FOUND" }, 404);
  const { results: logs } = await c.env.DB.prepare("SELECT * FROM thieu_lk_log WHERE thieu_lk_id = ? ORDER BY id DESC").bind(id).all();
  return c.json({ thieuLk: tlk, logs });
});

// Logic dung chung cho 1 ticket thieu_lk - tach ra de route bulk-log tai su dung dung 1 cho (them
// 2026-08-15, tieu chi UX #4), khong copy lai role-check/validate. Tra { error, status } khi khong
// hop le, hoac { ok: true } khi thanh cong.
async function applyThieuLkLog(
  c: Context<{ Bindings: Env }>,
  id: string,
  trangThai: string,
  ghiChu: string | undefined,
  ngayDuKienCoHang: string | undefined,
): Promise<{ error: string; status: 404 | 409 | 403 | 400 } | { ok: true }> {
  // BUG THAT (cung dot ma-misa PXK) - phai qualify "thieu_lk.id", xem giai thich o openThieuLkForDonHang.
  const tlk = await c.env.DB.prepare(`SELECT nguoi_tao, dat_don_hang_id, ${latestThieuLkStatusExpr("thieu_lk.id")} as trang_thai FROM thieu_lk WHERE id = ?`)
    .bind(id)
    .first<{ nguoi_tao: string; dat_don_hang_id: string; trang_thai: string | null }>();
  if (!tlk) return { error: "NOT_FOUND", status: 404 };
  if (tlk.trang_thai && (THIEU_LK_TRANG_THAI_DONG as readonly string[]).includes(tlk.trang_thai)) return { error: "DA_DONG", status: 409 };

  const user = c.get("user");
  const isCancel = trangThai === "Da huy bo";
  // "Da ket thuc" la cua TN (khop cot "Admin xu ly" trong du lieu Excel goc), con lai la Kho.
  if (isCancel) {
    if (tlk.nguoi_tao !== user.email && user.vai_tro !== "Admin") return { error: "FORBIDDEN_ROLE", status: 403 };
  } else if (trangThai === "Da ket thuc") {
    if (!canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
  } else if (!canKho(c)) {
    return { error: "FORBIDDEN_ROLE", status: 403 };
  }

  const validNext = ["Kho da tiep nhan", "Kho xac nhan hang da ve", "Kho tu choi sai TT", "Da huy bo", "Da ket thuc"];
  if (!validNext.includes(trangThai)) return { error: "INVALID_TRANG_THAI", status: 400 };
  // "Kho da tiep nhan" = buoc Kho giai trinh ly do thieu hang that su (cot "Giai thich ly do thieu
  // hang" trong Excel goc) - bat buoc ghi_chu, khong duoc de trong.
  if (trangThai === "Kho da tiep nhan" && !ghiChu?.trim()) return { error: "MISSING_GIAI_TRINH", status: 400 };

  const now = nowVN();
  const statements = [
    c.env.DB.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      id,
      trangThai,
      user.email,
      now,
      ghiChu?.trim() || null,
    ),
  ];
  if (ngayDuKienCoHang !== undefined) {
    statements.push(c.env.DB.prepare("UPDATE thieu_lk SET ngay_du_kien_co_hang = ? WHERE id = ?").bind(ngayDuKienCoHang?.trim() || null, id));
  }

  // 3 nhanh "tiep tuc luong don hang" da chot - dong quay ve "TN da duyet" ngay, chi khi dong dang
  // thuc su o "Cho hang" (tranh ghi trung neu vi ly do nao do da khong con o "Cho hang" nua). Cung
  // bump trang_thai_hien_tai/version (migration 0087) de giu cot mirror dung - khong CAS vi day la
  // luong he thong tu dong noi tiep, khong co actor thu 2 tranh chap.
  if ((THIEU_LK_TIEP_TUC_LUONG as readonly string[]).includes(trangThai)) {
    const donHangTrangThai = await c.env.DB.prepare(`SELECT ${latestDonHangStatusExpr("?")} as trang_thai`).bind(tlk.dat_don_hang_id).first<{ trang_thai: string | null }>();
    if (donHangTrangThai?.trang_thai === "Cho hang") {
      statements.push(
        c.env.DB.prepare("UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1, updated_at = ? WHERE id = ?").bind(
          "TN da duyet",
          now,
          tlk.dat_don_hang_id,
        ),
        c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
          tlk.dat_don_hang_id,
          "TN da duyet",
          user.email,
          now,
          `Tu dong: tiep tuc luong sau khi xu ly thieu LK (${trangThai})`,
        ),
      );
    }
  }

  await c.env.DB.batch(statements);
  return { ok: true };
}

// POST /api/dat-mua-lk/thieu-lk/:id/log - Kho (hoac Admin) cap nhat trang thai xu ly. Nguoi tao co
// the "Da huy bo" khi con dang mo.
datMuaLinhKien.post("/thieu-lk/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ trang_thai: string; ghi_chu?: string; ngay_du_kien_co_hang?: string }>();
  const result = await applyThieuLkLog(c, id, body.trang_thai, body.ghi_chu, body.ngay_du_kien_co_hang);
  if ("error" in result) return c.json({ error: result.error }, result.status);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// POST /api/dat-mua-lk/thieu-lk/bulk-log - { ids, trang_thai, ghi_chu?, ngay_du_kien_co_hang? } xu
// ly hang loat nhieu ticket thieu_lk cung luc (them 2026-08-15, tieu chi UX #4). Tai su dung
// applyThieuLkLog, tiep tuc xu ly cac id con lai ngay ca khi 1 id loi - tra ket qua tung id.
datMuaLinhKien.post("/thieu-lk/bulk-log", async (c) => {
  const body = await c.req.json<{ ids: string[]; trang_thai: string; ghi_chu?: string; ngay_du_kien_co_hang?: string }>();
  if (!Array.isArray(body.ids) || body.ids.length === 0) return c.json({ error: "MISSING_IDS" }, 400);
  const ids = [...new Set(body.ids)];
  if (ids.length > MAX_BULK_IDS) return c.json({ error: "QUA_NHIEU_ID", max: MAX_BULK_IDS }, 400);

  const results: Record<string, string> = {};
  let coThanhCong = false;
  for (const id of ids) {
    const result = await applyThieuLkLog(c, id, body.trang_thai, body.ghi_chu, body.ngay_du_kien_co_hang);
    results[id] = "error" in result ? result.error : "ok";
    if (!("error" in result)) coThanhCong = true;
  }

  if (coThanhCong) c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ results });
});

export default datMuaLinhKien;
