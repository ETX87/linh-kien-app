import { demHoanTienCanXuLy } from "../lib/phieuHoanTien";
import { demNopTienCanXuLy } from "../lib/nopTienQuy";
import { khoNhomLkLoc, locNhomLkSql } from "../lib/nhomLk";
import { Hono } from "hono";
import type { Env, AppUser } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { phuTrachGsSet, khuVucCuaToiSet, khuVucSetWhereSql, khuVucPxkWhereSql } from "../lib/scopeDatMua";

// Port gan nguyen ban tu backend/src/routes/notifications.ts cua he DVBH goc - CHI giu phan
// "DatMuaLkBreakdown"/computeDatMuaLkBreakdown()/getDatMuaLkBadge() (badge rieng cho module "Dat
// mua linh kien"), bo toan bo phan con lai (canGiaiTrinh/choQc/caThieuLinhKien/khaoSat/caLap/
// danhGiaNapGas/tranhChap - deu thuoc cac module KHONG tach sang he nay).
const notifications = new Hono<{ Bindings: Env }>();
notifications.use("*", verifySessionMiddleware, loadUser);

export interface DatMuaLkBreakdown {
  total: number;
  choTnDuyet: number;
  choTnTraHang: number;
  // Them 2026-09-12 (fix "sao Đặt mua linh kiện = 15 trong khi Cần làm = 19") - phat hien qua doi
  // chieu SQL truc tiep voi GET /home-summay (canLam): truoc day breakdown nay KHONG CO truong nao
  // cho viec PXK cua CHINH TN (Dang tao phieu/Cho tien/Dang gui KTV cho xac nhan) - choKhoPxk/
  // choKeToanPxk chi cover 2/5 trang thai PXK con mo (Da chot xong don xuat/Cho ke toan), 3 trang
  // thai con lai la san choi rieng cua TN nhung khong co slot nao de cong vao total, khien badge
  // sidebar LUON thap hon "Cần làm" dung bang tong 3 trang thai nay (vd Admin: 8 PXK dang mo nhung
  // sidebar tinh dung 4). Dinh nghia GIONG HET cach GET /home-summay tinh "pxk_can_lam" (tru phan da
  // thuoc choKhoPxk/choKeToanPxk) de 2 con so khop nhau.
  choTnPxk: number;
  // v1.450 (ra soat Trang chu 2026-11-07): tach ro "viec ai" cua PXK - choTnPxk = choTnTaoPxk (phieu "Dang tao phieu" KHONG con tien
  // treo = TN/KT gui ke toan duoc). Truoc day choTnPxk = MOI phieu "Dang tao phieu" + "Dang gui KTV" (OR dieu kien va phu dinh cua no) -
  // dem ca viec cua KTV (chuyen tien, xac nhan nhan) vao hang cho cua TN.
  choTnTaoPxk: number;
  // Ke toan xac nhan tien KTV da chuyen (pxk.trang_thai_chuyen_tien = 'KTV da chuyen') - truoc day KHONG dem o dau ca.
  choKeToanTien: number;
  // Viec cua chinh nguoi nhan hang (KTV / GS / ai dat cho minh): phieu cho minh chuyen tien + phieu dang gui cho minh xac nhan nhan.
  choTienCuaToi: number;
  choNhanHangCuaToi: number;
  choKhoThieuLk: number;
  choKhoPxk: number;
  choKhoTraHang: number;
  choKeToanPxk: number;
  choKeToanTraHang: number;
  choQcTraHang: number;
  choTramDuyet: number;
  choTpXacNhan: number;
  // Don cong no / ho tro vuot tran cho GS khu vuc duyet + nhap ma EO (2026-10-14, tu dong duyet 100%) - CHI tai khoan GS, theo
  // dat_don_hang.email_gs = chinh GS.
  choGsDuyet: number;
  // Them 2026-08-26 (bao cao "lỗi không hiện số đơn hàng đang xử lý" - tai khoan test la KTV/Ve
  // tinh, cac muc con lai o tren CHI tinh cho vai tro XU LY (TN/Kho/Ke toan/QC/TP), nguoi TAO don
  // thuan tuy luon thay 0 du chinh don cua ho dang cho duyet) - so don CHINH nguoi dang dang nhap da
  // tao, dang o 1 trong 3 buoc cho duyet dau (Tram/TBP/TN), de badge co y nghia voi CA nhom nguoi
  // dung nay.
  choDonCuaToi: number;
  // FIX (ra soat "logic sai theo vai tro" 2026-08-29): don bi TN tu choi TRUOC DAY khong co mat o BAT
  // KY dem dai lau nao (chi co 1 thong bao chuong dung 1 lan, thong_bao_ktv) - neu KTV bo lo/xoa
  // thong bao, don bi tu choi bien mat khoi tam nhin hoan toan. Dem lai unread thong_bao_ktv loai
  // "tu_choi" cua CHINH nguoi dang dang nhap - tu het khi ho mo chi tiet don (xem GET
  // /dat-mua-lk/don-hang/:id, tu danh dau da_doc=1), dung y "hien den khi da xem chi tiet".
  choDonBiTuChoi: number;
  // Them 2026-09-28 (phan hoi "Mục thiếu linh kiện đang không hiện số lượng cần xử lý trên tên trong
  // menu") - badge RIENG cho muc Sidebar "Thiếu linh kiện" (countKey "thieuLk", navConfig.ts). Dem ve
  // thieu LK dang cho DUNG vai tro nguoi xem ra tay (khop nextStatesForThieuLk o ThieuLkTab.tsx): Kho =
  // "Cho kho xu ly" + "Kho da tiep nhan" (cho xac nhan hang ve), TN = "Kho xac nhan hang da ve" (cho
  // TN ket thuc). KHONG cong vao total (choKhoThieuLk da nam trong total - tranh dem trung).
  thieuLkCanXuLy: number;
  // So ticket "Báo nhận thiếu" cho vai tro nguoi xem (da cong vao thieuLkCanXuLy).
  nhanThieuCanXuLy: number;
  thieuHangBhCanXuLy: number;
  // Yeu cau huy don cho bo phan nguoi xem dong y (v1.455, migration 0109): Kho / Mua hang / Ke toan (Admin: tat ca). Cong vao total.
  yeuCauHuyCanXuLy: number;
}

const EMPTY_DAT_MUA_LK_BREAKDOWN: DatMuaLkBreakdown = {
  total: 0,
  choTnDuyet: 0,
  choTnTraHang: 0,
  choTnPxk: 0,
  choTnTaoPxk: 0,
  choKeToanTien: 0,
  choTienCuaToi: 0,
  choNhanHangCuaToi: 0,
  choKhoThieuLk: 0,
  choKhoPxk: 0,
  choKhoTraHang: 0,
  choKeToanPxk: 0,
  choKeToanTraHang: 0,
  choQcTraHang: 0,
  choTramDuyet: 0,
  choTpXacNhan: 0,
  choGsDuyet: 0,
  choDonCuaToi: 0,
  choDonBiTuChoi: 0,
  thieuLkCanXuLy: 0,
  nhanThieuCanXuLy: 0,
  thieuHangBhCanXuLy: 0,
  yeuCauHuyCanXuLy: 0,
};

export interface NotificationsCountPayload {
  datMuaLk: DatMuaLkBreakdown;
  // Them 2026-08-26 - so thong_bao_ktv CHUA DOC cua nguoi dang dang nhap, dung cho badge "Home (N)"
  // (nav muc trang-chu) - xem navConfig.ts/Sidebar.tsx/BottomTabBar.tsx.
  ktvLogChuaDoc: number;
  // So LK "Cho xet duyet" ma chuan (migration 0053) - badge muc "Bang gia", CHI cho Mua hang/Admin (nguoi khac = 0).
  lkChoXetDuyet: number;
  // Phieu hoan tien quy can minh xu ly (migration 0090) - badge muc "Quỹ & chuyển tiền": chu quy cho xac nhan + Ke toan cho xac nhan huy.
  hoanTienCanXuLy: number;
  // Vi pham qua han cho chinh bo phan minh giai trinh (migration 0125) - badge muc "Quá hạn & vi phạm".
  viPhamCanGiaiTrinh?: number;
  // KTV nop tien vao quy cho Ke toan xac nhan (migration 0104) - Sidebar cong vao so muc "Quỹ & chuyển tiền".
  nopTienCanXuLy: number;
}

function gsInClause(gsSet: Set<string> | null, ddhAlias: string): { sql: string; binds: string[] } | null {
  if (gsSet === null || gsSet.size === 0) return gsSet === null ? null : { sql: " AND 1=0", binds: [] };
  const emails = [...gsSet];
  return { sql: ` AND ${ddhAlias}.email_gs IN (SELECT value FROM json_each(?))`, binds: [JSON.stringify(emails)] };
}

export async function computeDatMuaLkBreakdown(db: D1Database, user: AppUser): Promise<DatMuaLkBreakdown> {
  const isTacNghiep = !!user.la_tac_nghiep || user.vai_tro === "Admin";
  const isKho = !!user.la_kho || user.vai_tro === "Admin";
  const isKeToan = !!user.la_ke_toan || user.vai_tro === "Admin";
  const isQC = user.vai_tro === "QC" || user.vai_tro === "Admin";
  const isTPDvbh = !!user.la_tp_dvbh || user.vai_tro === "Admin";

  const out: DatMuaLkBreakdown = { ...EMPTY_DAT_MUA_LK_BREAKDOWN };
  const gsSet = await phuTrachGsSet(db, user.email);
  // Them 2026-09-12 (fix lech badge sidebar 18 vs "Can lam" 19): lop Khu vuc moi (user_khu_vuc),
  // ap dung SONG SONG voi lop GS cu (dat_mua_lk_phu_trach_gs) - dung y het cach GET /luong-quy-trinh
  // (datMuaLinhKien.ts) da lam tu 2026-08-31. Khong thay the gsSet, chi la dieu kien AND bo sung.
  const khuVucSet = await khuVucCuaToiSet(db, user);
  const kvClauseFor = (emailCols: string[]) => (khuVucSet ? khuVucSetWhereSql(khuVucSet, emailCols) : null);

  // SUA 2026-08-21: 4 dong "tra_hang" ben duoi (cho_tn_tra_hang/cho_kho_tra_hang/cho_ke_toan_tra_hang/
  // QC) doi tu subquery tuong quan tra_hang_log sang doc thang ddh.trang_thai_hien_tai - dong tra_hang
  // vua tao KHONG co dong log dau tien (xem datMuaLinhKien.ts POST /phieu-dat), nen subquery cu tra
  // NULL cho buoc "Cho ke toan duyet mem", khien badge/danh sach thieu dung nhung dong moi tao nhat.
  // Giai thich day du o backend/src/routes/traHang.ts (GET /).
  if (isTacNghiep) {
    const clause = gsInClause(gsSet, "ddh");
    const kvClause = kvClauseFor(["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]);
    // PXK con "mo" thuoc rieng san choi cua TN (khong dam nhiem boi Kho/Ke toan) - Dang tao phieu
    // (tru dieu kien cho tien, xem comment goc o phieuXuatKho.ts GET /status-counts), cho tien, va
    // Dang gui KTV (cho KTV xac nhan da nhan). Scope GIONG HET pattern cho_kho_pxk ben duoi (GS qua
    // EXISTS join phieu_xuat_kho_dong/dat_don_hang, Khu vuc THANG tren pxk.nguoi_nhan_hang).
    const pxkClause = gsInClause(gsSet, "ddh2");
    const pxkKvClause = (khuVucSet ? khuVucPxkWhereSql(khuVucSet) : null);
    const row = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM dat_don_hang ddh
              WHERE ddh.loai_don != 'tra_hang'
              AND ddh.trang_thai_hien_tai = 'Cho TN duyet'${clause?.sql ?? ""}${kvClause?.sql ?? ""}) as cho_tn_duyet,
           (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang'
              AND ddh.trang_thai_hien_tai = 'Cho TN duyet tong') as cho_tn_tra_hang,
           (SELECT COUNT(*) FROM phieu_xuat_kho pxk
              -- v1.450: chi phieu san sang gui ke toan (khong con tien treo) - phieu cho tien la viec cua KTV / Ke toan, "Dang gui KTV" la viec cua KTV.
              WHERE pxk.trang_thai_hien_tai = 'Dang tao phieu' AND NOT (pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet')
              ${pxkClause ? `AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id${pxkClause.sql})` : ""}${pxkKvClause?.sql ?? ""}) as cho_tn_pxk`,
      )
      .bind(...(clause?.binds ?? []), ...(kvClause?.binds ?? []), ...(pxkClause?.binds ?? []), ...(pxkKvClause?.binds ?? []))
      .first<{ cho_tn_duyet: number; cho_tn_tra_hang: number; cho_tn_pxk: number }>();
    out.choTnDuyet = row?.cho_tn_duyet ?? 0;
    out.choTnTraHang = row?.cho_tn_tra_hang ?? 0;
    out.choTnTaoPxk = row?.cho_tn_pxk ?? 0;
    out.choTnPxk = out.choTnTaoPxk;
  }

  if (isKho) {
    const thieuLkClause = gsInClause(gsSet, "ddh");
    const pxkClause = gsInClause(gsSet, "ddh2");
    const traHangClause = gsInClause(gsSet, "ddh");
    const thieuLkKvClause = kvClauseFor(["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]);
    // Kho chi xu ly 1 nhom LK (Karofi / B2B, 2026-10-16 - lib/nhomLk.ts): gia tri da chuan hoa, noi chuoi an toan.
    const nhomKho = khoNhomLkLoc(user);
    const thieuLkNhomSql = nhomKho ? locNhomLkSql("ddh", nhomKho) : "";
    const pxkKvClause = (khuVucSet ? khuVucPxkWhereSql(khuVucSet, "pxk", true) : null);
    const traHangKvClause = kvClauseFor(["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]);
    const row = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM thieu_lk tlk JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id
              WHERE (SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = tlk.id ORDER BY id DESC LIMIT 1) = 'Cho kho xu ly'${thieuLkClause?.sql ?? ""}${thieuLkKvClause?.sql ?? ""}${thieuLkNhomSql}) as cho_kho_thieu_lk,
           (SELECT COUNT(*) FROM phieu_xuat_kho pxk
              WHERE pxk.trang_thai_hien_tai = 'Da chot xong don xuat'
              ${pxkClause ? `AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id${pxkClause.sql})` : ""}${pxkKvClause?.sql ?? ""}) as cho_kho_pxk,
           -- SUA (migration 0002_tra_hang_pxk.sql): "Cho kho xac nhan nhap kho" khong con dat toi
           -- duoc (da xoa khoi tra_hang_log CHECK) - viec Kho lien quan tra hang o giai doan PXK gio
           -- da nam SAN trong cho_kho_pxk o tren (query do khong loc loai_don nen tu dong gom ca PXK
           -- tra_hang, khong can dem lai o day tranh trung).
           (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang'
              AND ddh.trang_thai_hien_tai = 'Cho kho xac nhan'
              ${traHangClause?.sql ?? ""}${traHangKvClause?.sql ?? ""}) as cho_kho_tra_hang`,
      )
      .bind(
        ...(thieuLkClause?.binds ?? []),
        ...(thieuLkKvClause?.binds ?? []),
        ...(pxkClause?.binds ?? []),
        ...(pxkKvClause?.binds ?? []),
        ...(traHangClause?.binds ?? []),
        ...(traHangKvClause?.binds ?? []),
      )
      .first<{ cho_kho_thieu_lk: number; cho_kho_pxk: number; cho_kho_tra_hang: number }>();
    out.choKhoThieuLk = row?.cho_kho_thieu_lk ?? 0;
    out.choKhoPxk = row?.cho_kho_pxk ?? 0;
    out.choKhoTraHang = row?.cho_kho_tra_hang ?? 0;
  }

  if (isKeToan) {
    const pxkClause = gsInClause(gsSet, "ddh2");
    const traHangClause = gsInClause(gsSet, "ddh");
    const pxkKvClause = (khuVucSet ? khuVucPxkWhereSql(khuVucSet) : null);
    const traHangKvClause = kvClauseFor(["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]);
    const row = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM phieu_xuat_kho pxk
              WHERE pxk.trang_thai_hien_tai = 'Cho ke toan'
              ${pxkClause ? `AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id${pxkClause.sql})` : ""}${pxkKvClause?.sql ?? ""}) as cho_ke_toan_pxk,
           (SELECT COUNT(*) FROM phieu_xuat_kho pxk
              WHERE pxk.trang_thai_hien_tai IN ('Dang tao phieu', 'Cho ke toan') AND pxk.trang_thai_chuyen_tien = 'KTV da chuyen'
              ${pxkClause ? `AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id${pxkClause.sql})` : ""}${pxkKvClause?.sql ?? ""}) as cho_ke_toan_tien,
           -- SUA (migration 0002_tra_hang_pxk.sql): "Cho ke toan xac nhan nhap kho" khong con dat toi
           -- duoc - viec KT lien quan tra hang o giai doan PXK gio da nam SAN trong cho_ke_toan_pxk o
           -- tren (query do khong loc loai_don nen tu dong gom ca PXK tra_hang).
           (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang'
              AND ddh.trang_thai_hien_tai = 'Cho ke toan duyet mem'
              ${traHangClause?.sql ?? ""}${traHangKvClause?.sql ?? ""}) as cho_ke_toan_tra_hang`,
      )
      .bind(
        ...(pxkClause?.binds ?? []),
        ...(pxkKvClause?.binds ?? []),
        ...(pxkClause?.binds ?? []),
        ...(pxkKvClause?.binds ?? []),
        ...(traHangClause?.binds ?? []),
        ...(traHangKvClause?.binds ?? []),
      )
      .first<{ cho_ke_toan_pxk: number; cho_ke_toan_tien: number; cho_ke_toan_tra_hang: number }>();
    out.choKeToanPxk = row?.cho_ke_toan_pxk ?? 0;
    out.choKeToanTien = row?.cho_ke_toan_tien ?? 0;
    out.choKeToanTraHang = row?.cho_ke_toan_tra_hang ?? 0;
  }

  if (isQC) {
    const row = await db
      .prepare(
        `SELECT COUNT(*) as n FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang'
           AND ddh.trang_thai_hien_tai = 'Cho QC xac nhan'`,
      )
      .first<{ n: number }>();
    out.choQcTraHang = row?.n ?? 0;
  }

  if (isTPDvbh) {
    const clause = gsInClause(gsSet, "ddh");
    const row = await db
      .prepare(
        `SELECT COUNT(*) as n FROM dat_don_hang ddh
           WHERE ddh.loai_don != 'tra_hang'
           AND ddh.trang_thai_hien_tai = 'Cho TBP xac nhan'${clause?.sql ?? ""}`,
      )
      .bind(...(clause?.binds ?? []))
      .first<{ n: number }>();
    out.choTpXacNhan = row?.n ?? 0;
  }

  if (user.vai_tro === "Giam sat") {
    const row = await db
      // + don thuoc khu vuc GS PHU trach (user_khu_vuc, chot 2026-11-01).
      .prepare(
        `SELECT COUNT(*) as n FROM dat_don_hang ddh WHERE ddh.trang_thai_hien_tai = 'Cho GS duyet'
           AND (ddh.email_gs = ? OR COALESCE(ddh.khu_vuc_chon, ddh.khu_vuc_ma) IN (SELECT khu_vuc_ma FROM user_khu_vuc WHERE user_email = ?))`,
      )
      .bind(user.email, user.email)
      .first<{ n: number }>();
    out.choGsDuyet = row?.n ?? 0;
  }

  if (user.la_ktv_dvbh) {
    const isTram = await db.prepare("SELECT 1 as x FROM users WHERE tram_cha = ? LIMIT 1").bind(user.email).first();
    if (isTram) {
      const row = await db
        .prepare(
          `SELECT COUNT(*) as n FROM dat_don_hang ddh JOIN users u ON u.email = ddh.nguoi_tao
             WHERE u.tram_cha = ? AND ddh.loai_don != 'tra_hang'
               AND ddh.trang_thai_hien_tai = 'Cho Tram duyet'`,
        )
        .bind(user.email)
        .first<{ n: number }>();
      out.choTramDuyet = row?.n ?? 0;
    }
  }

  // Them 2026-08-26 - xem giai thich day du o field choDonCuaToi (interface DatMuaLkBreakdown tren
  // dau file). Ap dung CHUNG cho MOI tai khoan (khong rieng KTV/Ve tinh) - staff tu tao don cung nen
  // thay don cua chinh ho o day, khong chi hang cho xu ly cua nguoi khac.
  const rowOwn = await db
    .prepare(
      `SELECT COUNT(*) as n FROM dat_don_hang ddh
         WHERE ddh.nguoi_tao = ? AND ddh.loai_don != 'tra_hang'
         AND ddh.trang_thai_hien_tai IN ('Cho Tram duyet', 'Cho TBP xac nhan', 'Cho TN duyet', 'Cho GS duyet')`,
    )
    .bind(user.email)
    .first<{ n: number }>();
  out.choDonCuaToi = rowOwn?.n ?? 0;

  // Viec cua chinh nguoi nhan hang (v1.450): chuyen tien phieu cua minh (Ke toan chua nhan bang chung) + xac nhan da nhan hang.
  const rowNhan = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM phieu_xuat_kho WHERE nguoi_nhan_hang = ? AND loai_don != 'tra_hang' AND trang_thai_hien_tai = 'Dang tao phieu'
            AND so_tien_can_chuyen IS NOT NULL AND trang_thai_chuyen_tien = 'Cho KTV chuyen') AS cho_tien,
         (SELECT COUNT(*) FROM phieu_xuat_kho WHERE nguoi_nhan_hang = ? AND loai_don != 'tra_hang' AND trang_thai_hien_tai = 'Dang gui KTV') AS cho_nhan`,
    )
    .bind(user.email, user.email)
    .first<{ cho_tien: number; cho_nhan: number }>();
  out.choTienCuaToi = rowNhan?.cho_tien ?? 0;
  out.choNhanHangCuaToi = rowNhan?.cho_nhan ?? 0;

  const rowTuChoi = await db
    .prepare("SELECT COUNT(*) as n FROM thong_bao_ktv WHERE nguoi_nhan = ? AND loai = 'tu_choi' AND da_doc = 0")
    .bind(user.email)
    .first<{ n: number }>();
  out.choDonBiTuChoi = rowTuChoi?.n ?? 0;

  const thieuLkTrangThaiCho = [
    ...(isKho ? ["Cho kho xu ly", "Kho da tiep nhan"] : []),
    // TN: ticket Kho da xong phan minh, cho TN duyet (THIEU_LK_CHO_TN o datMuaLinhKien.ts - 2026-09-29 them "Kho tu choi sai TT").
    ...(isTacNghiep ? ["Kho xac nhan hang da ve", "Kho tu choi sai TT", "Mua hang tu choi"] : []),
  ];
  if (thieuLkTrangThaiCho.length > 0) {
    // Scope GIONG HET cho_kho_thieu_lk o tren (GS + Khu vuc tren ddh).
    const clause = gsInClause(gsSet, "ddh");
    const kvClause = kvClauseFor(["ddh.nguoi_tao", "ddh.nguoi_nhan_hang"]);
    const nhomKhoTlk = khoNhomLkLoc(user); // Kho THUAN (khong TN) nen chi co trang thai cua Kho - loc ca truy van.
    const row = await db
      .prepare(
        `SELECT COUNT(*) as n FROM thieu_lk tlk JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id
           WHERE (SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = tlk.id ORDER BY id DESC LIMIT 1)
             IN (${thieuLkTrangThaiCho.map(() => "?").join(",")})${clause?.sql ?? ""}${kvClause?.sql ?? ""}${nhomKhoTlk ? locNhomLkSql("ddh", nhomKhoTlk) : ""}`,
      )
      .bind(...thieuLkTrangThaiCho, ...(clause?.binds ?? []), ...(kvClause?.binds ?? []))
      .first<{ n: number }>();
    out.thieuLkCanXuLy = row?.n ?? 0;
  }
  // Mua hang (2026-10-19, migration 0093): ticket Kho chuyen sang cho dat hang - dem TOAN BO, khong theo pham vi Kho/khu vuc (2026-10-29,
  // khop thieuLkListWhere: Mua hang thay tat ca ticket "Cho mua hang").
  if (user.la_mua_hang || user.vai_tro === "Admin") {
    const row = await db
      .prepare("SELECT COUNT(*) as n FROM thieu_lk tlk WHERE (SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = tlk.id ORDER BY id DESC LIMIT 1) = 'Cho mua hang'")
      .first<{ n: number }>();
    out.thieuLkCanXuLy += row?.n ?? 0;
  }
  // Bao nhan thieu (migration 0075) - cung muc "Thiếu hàng": Kho = cho kiem tra, Ke toan = cho can doi MISA. Khong cong vao total.
  const nhanThieuCho = [...(isKho ? ["Cho kho kiem tra"] : []), ...(isKeToan ? ["Cho ke toan"] : [])];
  if (nhanThieuCho.length > 0) {
    const row = await db
      .prepare(`SELECT COUNT(*) as n FROM nhan_thieu WHERE trang_thai IN (${nhanThieuCho.map(() => "?").join(",")})`)
      .bind(...nhanThieuCho)
      .first<{ n: number }>();
    out.nhanThieuCanXuLy = row?.n ?? 0;
    out.thieuLkCanXuLy += out.nhanThieuCanXuLy;
  }

  // Thieu hang bao hanh tu app suachua (2026-11-04, migration 0106) - Kho: cho kho xu ly; Mua hang: cho mua hang. Khong cong vao total.
  // 2026-11-10 ("vai trò mua hàng không có đơn cần xử lý nhưng vẫn đếm"): TN (gom Ke toan lam thay TN) chi duoc THAO TAC HO Kho, khong tinh la viec
  // cua minh (giong Thieu hang dat mua - ticket cho Kho nam o "Đang chờ" cua TN) -> chi Kho THAT / Admin dem "Cho kho xu ly".
  const thbCho = [...(isKho || user.vai_tro === "Admin" ? ["Cho kho xu ly"] : []), ...(user.la_mua_hang || user.vai_tro === "Admin" ? ["Cho mua hang"] : [])];
  if (thbCho.length > 0) {
    const row = await db
      .prepare(`SELECT COUNT(*) as n FROM thieu_hang_bh WHERE trang_thai IN (${thbCho.map(() => "?").join(",")})`)
      .bind(...thbCho)
      .first<{ n: number }>()
      .catch(() => null);
    out.thieuHangBhCanXuLy = row?.n ?? 0;
    out.thieuLkCanXuLy += out.thieuHangBhCanXuLy;
  }

  {
    const boPhan = user.vai_tro === "Admin"
      ? ["kho", "mua_hang", "ke_toan"]
      : [user.la_kho ? "kho" : "", user.la_mua_hang ? "mua_hang" : "", user.la_ke_toan ? "ke_toan" : ""].filter(Boolean);
    if (boPhan.length) {
      const row = await db
        .prepare("SELECT COUNT(*) AS n FROM yeu_cau_huy_don WHERE trang_thai = 'Cho dong y' AND bo_phan IN (SELECT value FROM json_each(?))")
        .bind(JSON.stringify(boPhan))
        .first<{ n: number }>()
        .catch(() => null);
      out.yeuCauHuyCanXuLy = row?.n ?? 0;
    }
  }

  out.total =
    out.yeuCauHuyCanXuLy +
    out.choTnDuyet + out.choTnTraHang + out.choTnPxk + out.choKhoThieuLk + out.choKhoPxk + out.choKhoTraHang +
    out.choKeToanPxk + out.choKeToanTien + out.choKeToanTraHang + out.choQcTraHang + out.choTramDuyet + out.choTpXacNhan + out.choGsDuyet +
    out.choDonCuaToi + out.choDonBiTuChoi + out.choTienCuaToi + out.choNhanHangCuaToi;

  return out;
}

export async function getDatMuaLkBadge(db: D1Database, user: AppUser): Promise<DatMuaLkBreakdown> {
  // FIX (ra soat "logic sai theo vai tro" 2026-08-29): thieu la_ve_tinh/"Giam sat" - 2 nhom nay CO
  // choDonCuaToi/choDonBiTuChoi cua rieng ho (tu tao don, xem canDatHo o DatMuaLinhKienModule.tsx) nhung
  // truoc day capDung=false nen luon nhan EMPTY_DAT_MUA_LK_BREAKDOWN (badge sidebar/bottom-tab VA tong
  // "viec cua toi" tren mobile luon = 0 du co don dang cho/bi tu choi that).
  const capDung = !!(
    user.la_ktv_dvbh ||
    user.la_ve_tinh ||
    user.la_kho ||
    user.la_ke_toan ||
    user.la_tac_nghiep ||
    user.la_tp_dvbh ||
    user.vai_tro === "Admin" ||
    user.vai_tro === "QC" ||
    user.vai_tro === "Giam sat" ||
    // v1.450: Mua hang thuan (chi co co nay) truoc day nhan EMPTY -> khong bao gio thay so ticket "Cho mua hang".
    user.la_mua_hang
  );
  if (!capDung) return EMPTY_DAT_MUA_LK_BREAKDOWN;

  const key = buildReportKey(
    "notifications/count-dat-mua-lk-v3",
    {
      email: user.email,
      vai_tro: user.vai_tro ?? "",
      la_ktv_dvbh: user.la_ktv_dvbh ? "1" : "",
      la_kho: user.la_kho ? "1" : "",
      la_ke_toan: user.la_ke_toan ? "1" : "",
      la_tac_nghiep: user.la_tac_nghiep ? "1" : "",
      la_tp_dvbh: user.la_tp_dvbh ? "1" : "",
      kho_nhom_lk: user.kho_nhom_lk ?? "",
      la_mua_hang: user.la_mua_hang ? "1" : "",
    },
    null,
  );
  return cachedReport(db, key, ["dat_mua_lk", "users"], () => computeDatMuaLkBreakdown(db, user));
}

// GET /api/notifications/count - dung cho badge sidebar (Sidebar.tsx) + thanh tom tat trong chinh
// module (PipelineFlow.tsx). He nay CHI co 1 mien nghiep vu nen response chi con field "datMuaLk".
notifications.get("/count", async (c) => {
  const user = c.get("user");
  const datMuaLk = await getDatMuaLkBadge(c.env.DB, user);
  // ktvLogChuaDoc KHONG di qua cachedReport (khong can cache - 1 SELECT COUNT theo index, va can
  // phan anh NGAY lap tuc sau khi nguoi dung bam "Danh dau da doc", khong the cho version-tag/ngay VN
  // doi nhu cachedReport - xem bai hoc "badge dung nguyen 0" o computeDatMuaLkBreakdown lien quan cache
  // cu khi vua them field moi).
  const row = await c.env.DB.prepare("SELECT COUNT(*) as n FROM thong_bao_ktv WHERE nguoi_nhan = ? AND da_doc = 0").bind(user.email).first<{ n: number }>();
  const lkRow = user.la_mua_hang || user.vai_tro === "Admin"
    ? await c.env.DB.prepare("SELECT COUNT(*) as n FROM linh_kien WHERE trang_thai_ma = 'Cho xet duyet'").first<{ n: number }>()
    : null;
  const hoanTienCanXuLy = await demHoanTienCanXuLy(c.env.DB, user);
  const nopTienCanXuLy = await demNopTienCanXuLy(c.env.DB, user);
  // Chi ca MINH la nguoi phu trach (vi_pham.nguoi_phu_trach, migration 0126).
  const vpRow = !user.la_ktv_dvbh && !user.la_ve_tinh
    ? await c.env.DB.prepare(
        "SELECT COUNT(*) as n FROM vi_pham v WHERE v.trang_thai = 'Cho giai trinh' AND EXISTS (SELECT 1 FROM json_each(COALESCE(v.nguoi_phu_trach, '[]')) j WHERE j.value = ?)",
      ).bind(user.email).first<{ n: number }>()
    : null;
  const data: NotificationsCountPayload = {
    datMuaLk, ktvLogChuaDoc: row?.n ?? 0, lkChoXetDuyet: lkRow?.n ?? 0, hoanTienCanXuLy, nopTienCanXuLy, viPhamCanGiaiTrinh: vpRow?.n ?? 0,
  };
  return c.json(data);
});

export interface ThongBaoKtvRow {
  id: number;
  loai: string;
  noi_dung: string;
  link_type: string | null;
  link_id: string | null;
  da_doc: number;
  ngay_tao: string;
}

// GET /api/notifications/ktv-log?filter=unread|read|all&page=&pageSize= - danh sach thong bao thay
// doi trang thai don CUA CHINH nguoi dang dang nhap (phan hoi 2026-08-26). Moi nguoi CHI xem duoc
// thong bao cua chinh minh (loc cung nguoi_nhan = user.email, khong co tham so nao khac de doc thay
// nguoi khac).
notifications.get("/ktv-log", async (c) => {
  const user = c.get("user");
  const filter = c.req.query("filter") ?? "all";
  const page = Math.max(1, (Math.trunc(Number(c.req.query("page"))) || 1));
  const pageSize = Math.min(100, Math.max(1, (Math.trunc(Number(c.req.query("pageSize"))) || 20)));
  const offset = (page - 1) * pageSize;
  const daDocClause = filter === "unread" ? " AND da_doc = 0" : filter === "read" ? " AND da_doc = 1" : "";

  const { results } = await c.env.DB.prepare(
    `SELECT id, loai, noi_dung, link_type, link_id, da_doc, ngay_tao FROM thong_bao_ktv
       WHERE nguoi_nhan = ?${daDocClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
  )
    .bind(user.email, pageSize, offset)
    .all<ThongBaoKtvRow>();
  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM thong_bao_ktv WHERE nguoi_nhan = ?${daDocClause}`)
    .bind(user.email)
    .first<{ total: number }>();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// POST /api/notifications/ktv-log/mark-all-read - danh dau TOAN BO thong bao cua nguoi dang dang
// nhap la da doc (nut "Đánh dấu đã đọc toàn bộ").
notifications.post("/ktv-log/mark-all-read", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare("UPDATE thong_bao_ktv SET da_doc = 1 WHERE nguoi_nhan = ? AND da_doc = 0").bind(user.email).run();
  return c.json({ ok: true });
});

// POST /api/notifications/ktv-log/:id/read - danh dau 1 thong bao la da doc (goi khi nguoi dung bam
// vao 1 dong de xem chi tiet don). Chi cho phep danh dau thong bao CUA CHINH MINH.
notifications.post("/ktv-log/:id/read", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE thong_bao_ktv SET da_doc = 1 WHERE id = ? AND nguoi_nhan = ?").bind(id, user.email).run();
  return c.json({ ok: true });
});

export default notifications;
