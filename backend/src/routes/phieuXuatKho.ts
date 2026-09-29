import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { nextSequentialId } from "../lib/idCounter";
import { nowVN } from "../lib/vnTime";
import { emailsTheoTen, orDonTrongPxk, orEmailIn } from "../lib/timTheoTen";
import { bumpVersions } from "../lib/dataVersions";
import { quaHanLyDoCham, mocTinhHanTn } from "../lib/hanLyDoCham";
import { autoClaimGs, scopePxkNguoiNhanHang, phuTrachGsSet, khuVucCuaToiSet, khuVucSetWhereSql } from "../lib/scopeDatMua";
import { uploadPublicImage } from "../lib/googleDrive";
import { sendPushToUser } from "../lib/webPush";
import { buildMisaExportSheets, resolveMisaTemplateDeXuat, MISA_TEMPLATES, type MisaTemplate } from "../lib/misaExport";
import { notifyWorkflowTask, emailsForRoleOrQC, pastActorsFor, emailGsListForPxk, PXK_ROLES } from "../lib/taskNotify";
import { pushPxkToKhovan, notifyPxkAdvancedViaApp, buildWorkUrl } from "../lib/khovanPushClient";
import { timLoaiChietKhauTheoTen, gonTenLoaiChietKhau, choPhepDoiLoaiChietKhau } from "../lib/loaiChietKhau";
import { taiTinhPxk, taiTinhPxkMoCuaKtv, tinhToanPxk, type PxkCalculation } from "../lib/pxkRecalculate";
import { laVanPhong, danhDauVanPhongTacDong, huyPxkNeuTrong } from "../lib/pxkTuHuy";
import { type CotLoc, docLocCot, sqlLocCot, sqlSapXep, tenNguoiSql, giaTriCot } from "../lib/locCot";
import { docAnhBangChung, MAX_ANH_BANG_CHUNG } from "../lib/bangChungChuyenTien";

// Phieu xuat kho/giao hang - xem migration 0058_phieu_xuat_kho.sql + 0066_pxk_gop_chuyen_tien.sql.
// Pattern header+log giong phieu_dat. TN tao (gom nhieu dong don hang da "TN da duyet" vao 1
// phieu), Ke toan xu ly AMIS, Kho dong goi/giao, KTV xac nhan nhan hang.
//
// 8 trang thai dung dung theo sheet "Settings" (cot "3. Phieu tra") cua file Excel goc, KHONG tu
// dat ten - xem comment migration 0066: Dang tao phieu -> Cho ke toan -> Da chot xong don xuat ->
// [Dang gui KTV -> KTV da nhan] hoac [Hang tru kho] hoac [Kho da ket thuc] (Kho tu dong khi KTV
// khong phan hoi), + nhanh huy "Ke toan huy" o 2 buoc dau. Ap dung cho loai_don='mua'/'cong_no'.
//
// SUA (phan hoi 2026-08-21, migration 0002_tra_hang_pxk.sql): mo rong them 1 nhanh CHO RIENG
// loai_don='tra_hang' (loai_don nay da duoc CHECK constraint cho phep tu migration 0001 nhung chua co
// code nao tao/xu ly duoc) - dung LAI dung 3 buoc dau (Dang tao phieu -> Cho ke toan -> Da chot xong
// don xuat), roi thay vi [Dang gui KTV -> KTV da nhan] (KTV nhan hang RA), tra hang di THANG toi 1
// trang thai MOI "Kho da nhan hang tra" (Kho xac nhan da nhan hang VE kho) - khong co buoc "dang gui"
// trung gian vi hang khong phai ship di dau (xem giai thich day du o traHang.ts).
//
// "Chuyen tien" (thay the bang phieu_so_tien cu) la 1 DIEU KIEN CHAN rieng tren chinh phieu_xuat_kho
// (cot so_tien_can_chuyen/trang_thai_chuyen_tien/...), khong phai 1 buoc trong chuoi trang_thai
// chinh - chan luc chuyen "Dang tao phieu" -> "Cho ke toan" (xem POST /:id/log). Khong ap dung thuc
// te cho tra_hang (khong co khai niem chuyen tien khi tra linh kien), nhung van la truong TUY CHON
// nen khong can chan them - TN chi don gian bo trong luc tao PXK tra hang.
const phieuXuatKho = new Hono<{ Bindings: Env }>();
phieuXuatKho.use("*", verifySessionMiddleware, loadUser, requireDatMuaLkArea);
// Moi thao tac GHI thanh cong cua van phong (TN/Kho/Ke toan/Admin) len 1 PXK cu the (/:id/...) -> danh dau
// "van phong da thao tac" -> KTV het quyen tu huy don tu duyet trong phieu (chot 2026-09-28, lib/pxkTuHuy.ts).
// Duong dan khong phai id PXK (vd /don-hang/:donHangId/..., /loai-chiet-khau/gan-lai) -> UPDATE khong khop dong nao.
phieuXuatKho.use("/:id/*", async (c, next) => {
  await next();
  if (c.req.method === "GET" || c.res.status >= 400) return;
  const user = c.get("user");
  if (user && laVanPhong(user)) await danhDauVanPhongTacDong(c.env.DB, c.req.param("id"), user.email);
});

const TRANG_THAI_DONG = ["KTV da nhan", "Ke toan huy", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"] as const;

// Tien to ID theo loai_don (phan hoi 2026-09-09: "ID tự sinh của PXK-000005 đang gây nhầm lẫn với mã
// PXK của misa") - truoc day CA 3 loai_don deu dung chung tien to "PXK", trung voi tien to ma MISA hay
// dung khi TN tu dat ma_xuat_kho dang "PXK-xxx" (2 nguon ID de lan nhau khi doi chieu). Dung LAI CHUNG
// 1 counter "phieu_xuat_kho" (giong cach phieu_dat dung chung 1 counter cho ca XH-/TN-/AD-, xem
// phieuDatPrefix trong datMuaLinhKien.ts) - CHI doi chu tien to hien thi, khong tach rieng tung day so
// theo loai (khong can migration them dong id_counters moi, so tiep tuc noi dai lien tuc tu PXK cu).
function pxkIdPrefix(loaiDon: "mua" | "cong_no" | "tra_hang"): "PMH" | "PCN" | "PTL" {
  if (loaiDon === "mua") return "PMH";
  if (loaiDon === "cong_no") return "PCN";
  return "PTL";
}

// SUA 2026-09-14 (phat hien khi thu tao PXK that de lam tai lieu huong dan TN): TRUOC DAY moi cho can
// biet "trang thai hien tai" cua 1 PXK de GATE chuyen buoc (PATCH /ma-xuat-kho, /ma-misa, /anh-bien-
// ban, /dong-goi, POST /log...) doc qua ham latestStatusExpr() - lay dong CUOI CUNG trong bang
// phieu_xuat_kho_log lam proxy, AN TOAN cho toi khi migration 0028 (2026-09-13) them 6 gia tri
// "log-only" (Da luu ma don hang/Da luu ma MISA/Da tai anh bien ban/Da yeu cau KTV chuyen tien/Da dinh
// bang chung chuyen tien/Ke toan da duyet bang chung chuyen tien) de "Lich su xu ly" tren UI khong con
// trung ten voi cac giai doan chinh. Migration do chi xac nhan notifications.ts an toan (so khop CHUOI
// DUNG voi 2 gia tri workflow) roi QUEN mat dung CHINH cac gate o file nay (va partnerKho.ts) van doc
// "dong log cuoi cung" lam trang thai that - ket qua: bat ky PXK nao da tung luu Ma don hang/Ma MISA/
// tai anh bien ban/yeu cau chuyen tien... deu VINH VIEN khong the chuyen buoc tiep (vd TN khong bao
// gio "Gui ke toan" duoc) DU trang_thai_hien_tai THAT van dung, vi dong log cuoi cung luc do la 1 gia
// tri log-only chu khong phai gia tri workflow. Fix: doc THANG cot trang_thai_hien_tai (mirror luon
// dung, chi doi qua UPDATE CAS o POST /:id/log) - bo han latestStatusExpr().

// Trang thai 1 DONG dat_don_hang (khac PXK o tren) - dung khi loc dong "TN da duyet" cho picker tao
// PXK. Cung cong thuc voi latestDonHangStatusExpr trong datMuaLinhKien.ts (khong dung chung 1 ham
// export - moi route file tu dinh nghia ham rieng cho log table minh doc). An toan vi PXK/dat_don_hang
// (loai_don != 'tra_hang') LUON nhan dong log dau tien ngay luc tao (khac tra_hang - xem bug/fix o
// traHang.ts GET / - tra_hang KHONG nhan log dau tien nen phai doc thang cot mirror thay vi qua day).
function latestDonHangLogStatusExpr(donHangIdCol: string): string {
  return `(SELECT trang_thai FROM dat_don_hang_log WHERE dat_don_hang_id = ${donHangIdCol} ORDER BY id DESC LIMIT 1)`;
}

function canTacNghiep(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_tac_nghiep || user.vai_tro === "Admin";
}

function canKeToan(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_ke_toan || user.vai_tro === "Admin";
}

function canKho(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_kho || user.vai_tro === "Admin";
}

// CHOT (phan hoi nguoi dung: "bỏ quyền tải file form misa" cho KTV/Trạm/CTV/Vệ tinh) - MISA la form
// ke toan noi bo, khong lien quan nghiep vu hien truong. KTV/Trạm/CTV (la_ktv_dvbh) va Vệ tinh
// (la_ve_tinh) KHONG con tai duoc, du van xem duoc tab "Phiếu xuất kho" cua chinh minh binh thuong.
// Giam sat van giu quyen nay (khong nam trong yeu cau thu hep).
function canDownloadMisa(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return canTacNghiep(c) || canKho(c) || canKeToan(c) || user.vai_tro === "Giam sat";
}

// GET /api/phieu-xuat-kho/mo-count - dung cho badge "(N)" o tab "Phiếu xuất kho" tren thanh tab.
// SUA (phan hoi QA 2026-08-31, muc #11: "TN đã chuyển kế toán rồi, sao vẫn đếm số PXK cần xử lý cho
// TN, chỉ đếm các đơn, phiếu đến bước của vai trò cần xử lý thôi") - truoc day dem TAT CA PXK dang mo
// (NOT IN TRANG_THAI_DONG) bat ke da toi luot ai xu ly tiep. Doi sang chi dem cac trang_thai THUC SU
// dang cho dung vai tro dang goi endpoint nay xu ly tiep - anh xa 1-1 voi cac nhanh FORBIDDEN_ROLE cua
// POST /:id/log ben duoi (khong tu bia them, chi doc lai dung logic da co san o do). "Dang gui KTV"
// tinh cho CA Kho (co the bam "Kho da ket thuc" khi KTV khong phan hoi) LAN chinh KTV/Ve tinh nhan
// hang (can xac nhan "KTV da nhan"). QC/Giam sat/la_view khong co hanh dong nao tren PXK (Giam sat/
// la_view chi xem, QC lam viec o tab Tra hang rieng) nen luon ra 0 (danh sach/list GET / KHONG bi anh
// huong - van xem duoc day du "neu bo filter thi van xem duoc" dung yeu cau).
phieuXuatKho.get("/mo-count", async (c) => {
  const user = c.get("user");
  const scope = scopePxkNguoiNhanHang(c);

  const trangThaiActionable = new Set<string>();
  if (canTacNghiep(c)) trangThaiActionable.add("Dang tao phieu");
  if (canKeToan(c)) trangThaiActionable.add("Cho ke toan");
  if (canKho(c)) {
    trangThaiActionable.add("Da chot xong don xuat");
    trangThaiActionable.add("Dang gui KTV");
  }
  if (user.la_ktv_dvbh || user.la_ve_tinh) trangThaiActionable.add("Dang gui KTV");

  if (trangThaiActionable.size === 0) return c.json({ count: 0 });

  const states = [...trangThaiActionable];
  const placeholders = states.map(() => "?").join(",");
  // KIEM TRA DONG BO TOAN HE THONG (2026-08-31, xem giai thich day du o GET /loai-don-counts trong
  // datMuaLinhKien.ts) - cung 2 lop scope THEM cho TN/Kho/Ke toan khi scope===null: (1) Khu vuc dia ly
  // qua pxk.nguoi_nhan_hang (phieu_xuat_kho khong co nguoi_tao la KTV nen chi 1 cot); (2) "Khu vuc phu
  // trach" GS qua EXISTS noi nguoc phieu_xuat_kho_dong -> dat_don_hang (pxk khong co email_gs truc
  // tiep, dung LAI dung pattern pxkScope cua GET /luong-quy-trinh).
  let extraScopeSql = "";
  const extraScopeBinds: string[] = [];
  if (scope === null) {
    const khuVucSet = await khuVucCuaToiSet(c.env.DB, user);
    if (khuVucSet) {
      const { sql, binds } = khuVucSetWhereSql(khuVucSet, ["pxk.nguoi_nhan_hang"]);
      extraScopeSql += sql;
      extraScopeBinds.push(...binds);
    }
    if (canTacNghiep(c) || canKho(c) || canKeToan(c)) {
      const gsSet = await phuTrachGsSet(c.env.DB, user.email);
      if (gsSet) {
        const placeholders2 = [...gsSet].map(() => "?").join(",");
        extraScopeSql += ` AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id AND ddh2.email_gs IN (${placeholders2}))`;
        extraScopeBinds.push(...gsSet);
      }
    }
  }
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM phieu_xuat_kho pxk WHERE pxk.trang_thai_hien_tai IN (${placeholders})${scope?.whereSql ?? ""}${extraScopeSql}`,
  )
    .bind(...states, ...(scope?.binds ?? []), ...extraScopeBinds)
    .first<{ n: number }>();
  return c.json({ count: row?.n ?? 0 });
});

// GET /api/phieu-xuat-kho?trang_thai= - danh sach. TN/Kho/Ke toan/QC/Admin xem toan bo (can theo doi
// giao hang toan he thong); KTV/Ve tinh/Giam sat bi gioi han qua scopePxkNguoiNhanHang (RA SOAT BAO
// MAT 2026-08-18, phan hoi Codex: truoc day KHONG gioi han cho AI ca, lo gia/cong no/ma MISA/bang
// chung chuyen tien toan he thong cho moi tai khoan trong module).
// Cot loc kieu Excel cua danh sach PXK (2026-09-28) - khoa = key cot o PhieuXuatKhoTab.tsx. "viec_can_lam"/
// "da_in_phieu" PHAI khop pxkViecCanLamTiep()/cot "In phiếu" o frontend (cung chuoi hien thi).
const PXK_DONG_TU = "FROM phieu_xuat_kho_dong lcx JOIN dat_don_hang lcd ON lcd.id = lcx.dat_don_hang_id WHERE lcx.phieu_xuat_kho_id = pxk.id";
const PXK_DONG_JOIN = "JOIN phieu_xuat_kho_dong lcx ON lcx.phieu_xuat_kho_id = pxk.id JOIN dat_don_hang lcd ON lcd.id = lcx.dat_don_hang_id";
const PXK_COT_LOC: Record<string, CotLoc> = {
  viec_can_lam: {
    kieu: "don",
    expr: `CASE
      WHEN pxk.trang_thai_hien_tai = 'Dang tao phieu' THEN
        CASE WHEN COALESCE(pxk.ma_xuat_kho_xac_nhan, 0) = 0 THEN 'Cần nhập Mã đơn hàng'
             WHEN pxk.so_tien_can_chuyen IS NOT NULL AND COALESCE(pxk.trang_thai_chuyen_tien, '') != 'TN da duyet' THEN 'Chờ xác nhận chuyển tiền'
             ELSE 'Sẵn sàng gửi Kế toán' END
      WHEN pxk.trang_thai_hien_tai = 'Cho ke toan' THEN CASE WHEN COALESCE(pxk.ma_misa, '') != '' THEN 'Sẵn sàng chốt xong' ELSE 'Cần nhập Mã MISA' END
      WHEN pxk.trang_thai_hien_tai = 'Da chot xong don xuat' THEN CASE WHEN pxk.loai_don = 'tra_hang' THEN 'Chờ Kho xác nhận nhận hàng' ELSE 'Chờ Kho gửi hàng' END
      WHEN pxk.trang_thai_hien_tai = 'Dang gui KTV' THEN 'Chờ KTV xác nhận đã nhận'
      ELSE '' END`,
  },
  da_in_phieu: {
    kieu: "don",
    expr: `CASE WHEN COALESCE(pxk.loai_don, '') != 'tra_hang' AND pxk.trang_thai_hien_tai IN ('Da chot xong don xuat', 'Dang gui KTV', 'KTV da nhan')
      THEN CASE WHEN pxk.da_in_phieu = 1 THEN 'Đã in' ELSE 'Chưa in' END ELSE '' END`,
  },
  trang_thai: { kieu: "don", expr: "pxk.trang_thai_hien_tai" },
  chuyen_tien: { kieu: "don", expr: "CASE WHEN pxk.so_tien_can_chuyen IS NULL THEN 'Khong can' ELSE pxk.trang_thai_chuyen_tien END" },
  nguoi_tao: { kieu: "don", expr: "pxk.nguoi_tao", sortExpr: tenNguoiSql("pxk.nguoi_tao") },
  nguoi_nhan_hang: { kieu: "don", expr: "pxk.nguoi_nhan_hang", sortExpr: tenNguoiSql("pxk.nguoi_nhan_hang") },
  khu_vuc: { kieu: "don", expr: "pxk.khu_vuc_ma", khuVuc: true }, // cot luu san, migration 0042
  loai_de_xuat: { kieu: "nhieu", tu: PXK_DONG_TU, join: PXK_DONG_JOIN, expr: "lcd.loai_de_xuat" },
  yeu_cau_hoa_don: { kieu: "nhieu", tu: PXK_DONG_TU, join: PXK_DONG_JOIN, expr: "lcd.yeu_cau_hoa_don" },
  // Loai chiet khau "cao nhat" cua phieu - cung cong thuc cot loai_chiet_khau_cao_nhat_id o SELECT danh sach.
  loai_chiet_khau: {
    kieu: "don",
    expr: `(SELECT lcs.id FROM phieu_xuat_kho_dong lcx2 JOIN dat_don_hang lcd2 ON lcd2.id = lcx2.dat_don_hang_id
      JOIN settings_loai_chiet_khau lcs ON lcs.id = lcd2.loai_chiet_khau_id
      WHERE lcx2.phieu_xuat_kho_id = pxk.id ORDER BY lcs.stt DESC, lcs.id DESC LIMIT 1)`,
  },
};

// Dieu kien WHERE cua GET /phieu-xuat-kho (tach ham 2026-09-28 de GET /gia-tri-loc dung lai y het).

async function pxkListWhere(c: Context<{ Bindings: Env }>, boQuaCot?: string): Promise<{ whereSql: string; binds: unknown[] }> {
  const user = c.get("user");
  const scope = scopePxkNguoiNhanHang(c);
  const trangThai = c.req.query("trang_thai");
  const nguoiNhanHang = c.req.query("nguoi_nhan_hang");
  const loaiDon = c.req.query("loai_don");
  // "khu_vuc" (them 2026-08-31, dong bo voi GET /dat-mua-lk/don-hang - xem CLAUDE.md muc kiem tra
  // toan he thong) - danh sach ma Khu vuc cach nhau boi dau phay, khop PXK co nguoi_nhan_hang (KTV
  // nhan PXK, "1 PXK = 1 KTV") thuoc 1 trong cac Khu vuc do. pxk.nguoi_tao la TN tao phieu, KHONG
  // phai KTV nen KHONG dua vao dieu kien nay (khac ddh.nguoi_tao/nguoi_nhan_hang cua GET /don-hang).
  const khuVuc = c.req.query("khu_vuc")?.trim();
  // Them 2026-08-21 (dong bo UI voi GET /dat-mua-lk/don-hang) - tim theo ma PXK/ma don hang/ma
  // MISA/ma van don/nguoi tao/nguoi nhan hang.
  // .normalize("NFC") - xem giai thich day du o settingsKtv.ts GET / (cung fix, cung ngay).
  const q = c.req.query("q")?.trim().normalize("NFC");
  // GD4 (phan hoi Codex #17): endpoint nay truoc day tra VE TOAN BO dong khop bo loc, frontend tu
  // slice 20 dong/trang o client - moi lan doi trang van tai lai het du lieu tu D1. Them phan trang
  // server-side, cung pattern voi GET /dat-mua-lk/don-hang.
  // KHONG truyen page -> tra HET (nut "Tải danh sách chi tiết", them 2026-09-13, mirror settingsKtv.ts).
  let whereSql = "1=1" + (scope?.whereSql ?? "");
  const binds: unknown[] = [...(scope?.binds ?? [])];
  // FIX (phan hoi nguoi dung: "đồng bộ danh sách theo badge" cho Khu vuc phu trach GS) - xem giai
  // thich day du o GET /dat-mua-lk/don-hang (cung 1 fix, cung ngay) - truoc day chi anh huong
  // /mo-count/status-counts, KHONG anh huong chinh danh sach nay.
  if (scope === null && (canTacNghiep(c) || canKho(c) || canKeToan(c))) {
    const gsSet = await phuTrachGsSet(c.env.DB, user.email);
    if (gsSet) {
      whereSql += ` AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id AND ddh2.email_gs IN (${[...gsSet].map(() => "?").join(",")}))`;
      binds.push(...gsSet);
    }
  }
  if (trangThai === "__OPEN__") {
    // Sentinel "con ton" (them 2026-09-23, phan hoi "tổng phiếu sẽ chỉ hiện phiếu tồn... ấn vào tổng
    // phiếu sẽ có sẵn filter, ấn tắt sẽ hiện cả phiếu huỷ") - dung 1 pattern voi __OPEN__ cua GET
    // /don-hang va GET /tra-hang (xem DON_HANG_TRANG_THAI_DONG/TRA_HANG_TRANG_THAI_DONG_COUNTS): loc
    // NOT IN 5 trang thai dong TRANG_THAI_DONG (khai bao dau file). Day la 1 CHIP LOC nguoi dung co the
    // tu tat (chon lai "Tất cả" tren dropdown) de xem lai CA phieu da huy/hoan tat, khong phai gioi han
    // cung nhu View.
    whereSql += ` AND pxk.trang_thai_hien_tai NOT IN (${TRANG_THAI_DONG.map(() => "?").join(",")})`;
    binds.push(...TRANG_THAI_DONG);
  } else if (trangThai === "CHO_TIEN") {
    // Sentinel rieng (phan hoi 2026-08-24: "2 thẻ chờ tiền và pxk hình như đang là 1... ấn giữa 2
    // button này không có phản hồi") - "cho tien" la 1 DIEU KIEN CHAN tren so_tien_can_chuyen/
    // trang_thai_chuyen_tien (xem comment dau file), KHONG phai 1 gia tri trang_thai_hien_tai that
    // nen KHONG the loc bang so sanh = nhu cac trang thai khac - truoc day nut "Chờ tiền" tren
    // pipeline tro TAM ve filter="Dang tao phieu" (trung voi nut "Tạo PXK" ben canh, khien 2 nut
    // nhu lam 1 viec). Gio loc DUNG dieu kien that, doc lap voi trang_thai_hien_tai.
    // FIX (phan hoi 2026-09-23 "vẫn đếm cả đơn đã hủy"): them "trang_thai_hien_tai = 'Dang tao phieu'"
    // - truoc day dieu kien nay dua vao bat bien "chi Dang tao phieu moi co the co tien chua duyet xong"
    // (dung khi viet, vi MISSING_CHUYEN_TIEN_APPROVED chan cung viec roi buoc nay khi con tien treo) -
    // nhung tinh nang "Huỷ (phiếu lỗi)"/"Huỷ (không còn nhu cầu)" (2026-09-22) cho huy PXK tu ca "Dang
    // tao phieu" lan "Cho ke toan" KHONG qua gate do, nen 1 PXK "Ke toan huy" van co the con mang
    // so_tien_can_chuyen chua duyet, bi dem nham la "Chờ tiền" that su.
    whereSql += " AND pxk.trang_thai_hien_tai = 'Dang tao phieu' AND pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet'";
  } else if (trangThai === "Dang tao phieu") {
    // CHOT (phan hoi 2026-08-24: "khi pxk đang chờ tiền, thì tính nó thành chờ tiền, khi cập nhật
    // tiền xong thì mới chuyển thành pxk") - loai tru PXK dang thoa dieu kien CHO_TIEN o tren khoi
    // chinh trang thai "Dang tao phieu", de 1 PXK CHI thuoc DUNG 1 trong 2 nhom tai 1 thoi diem. An
    // toan: PXK co tien CHUA chuyen xong khong bao gio roi khoi "Dang tao phieu" duoc (POST /:id/log
    // chan cung boi MISSING_CHUYEN_TIEN_APPROVED), nen dieu kien loai tru nay khong bao gio anh
    // huong cac trang_thai_hien_tai khac.
    whereSql += " AND pxk.trang_thai_hien_tai = ? AND NOT (pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet')";
    binds.push(trangThai);
  } else if (trangThai) {
    // RA SOAT CHI PHI D1 2026-08-18 (phan hoi Codex #11/#13, migration 0087+0088): doc thang cot
    // trang_thai_hien_tai (co index idx_pxk_trang_thai_nhan_hang) thay vi correlated subquery.
    whereSql += " AND pxk.trang_thai_hien_tai = ?";
    binds.push(trangThai);
  }
  if (nguoiNhanHang) {
    whereSql += " AND pxk.nguoi_nhan_hang = ?";
    binds.push(nguoiNhanHang);
  }
  if (loaiDon) {
    whereSql += " AND pxk.loai_don = ?";
    binds.push(loaiDon);
  }
  if (khuVuc) {
    const khuVucList = khuVuc.split(",").map((s) => s.trim()).filter(Boolean);
    if (khuVucList.length > 0) {
      const { sql, binds: khuVucBinds } = khuVucSetWhereSql(new Set(khuVucList), ["pxk.nguoi_nhan_hang"]);
      whereSql += sql;
      binds.push(...khuVucBinds);
    }
  }
  if (q) {
    // + tim theo TEN nguoi tao/nguoi nhan hang (2026-09-28, xem lib/timTheoTen.ts).
    const theoTen = orEmailIn(["pxk.nguoi_tao", "pxk.nguoi_nhan_hang"], await emailsTheoTen(c.env.DB, q));
    const theoDon = orDonTrongPxk(q); // + ma don / ma yeu cau su co chinh-bo sung cua dong trong phieu (2026-09-29)
    whereSql += ` AND (pxk.id LIKE ? OR pxk.ma_xuat_kho LIKE ? OR pxk.ma_misa LIKE ? OR pxk.ma_van_don LIKE ? OR pxk.nguoi_tao LIKE ? OR pxk.nguoi_nhan_hang LIKE ?${theoDon.sql}${theoTen.sql})`;
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, ...theoDon.binds, ...theoTen.binds);
  }

  // Loc cot kieu Excel (2026-09-28, lib/locCot.ts).
  const locCot = sqlLocCot(PXK_COT_LOC, docLocCot(c.req.query("cf"), PXK_COT_LOC), boQuaCot);
  whereSql += locCot.sql;
  binds.push(...locCot.binds);
  return { whereSql, binds };
}



// GET /api/phieu-xuat-kho/gia-tri-loc?cot=<cot>&<cung bo loc GET /> - gia tri + so phieu cua 1 cot cho o loc kieu
// Excel (2026-09-28). Dang ky TRUOC "/:id".
phieuXuatKho.get("/gia-tri-loc", async (c) => {
  const cot = c.req.query("cot") ?? "";
  const def = PXK_COT_LOC[cot];
  if (!def) return c.json({ error: "COT_KHONG_HOP_LE" }, 400);
  const { whereSql, binds } = await pxkListWhere(c, cot);
  return c.json({ rows: await giaTriCot(c.env.DB, def, "FROM phieu_xuat_kho pxk", "pxk.id", whereSql, binds) });
});

phieuXuatKho.get("/", async (c) => {
  const pageParam = c.req.query("page");
  const page = Math.max(1, Number(pageParam ?? 1));
  const pageSize = Math.min(1000, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;
  const { whereSql, binds } = await pxkListWhere(c);
  const sapXep = sqlSapXep(PXK_COT_LOC, c.req.query("cs"), c.req.query("cd"));
  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM phieu_xuat_kho pxk WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT pxk.id, pxk.ma_xuat_kho, pxk.ma_xuat_kho_xac_nhan, pxk.ma_misa, pxk.ma_van_don, pxk.anh_bien_ban_url,
       pxk.nguoi_tao, pxk.ngay_tao, pxk.ghi_chu, pxk.nguoi_nhan_hang, pxk.loai_don,
       pxk.so_tien_can_chuyen, pxk.trang_thai_chuyen_tien, pxk.da_in_phieu,
       pxk.trang_thai_hien_tai as trang_thai,
       (SELECT COUNT(*) FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = pxk.id) as so_dong,
       -- Loai chiet khau "dang duoc huong" cua CA phieu (phan hoi 2026-09-28 "theo loại chiết khấu cao
       -- nhất") = loai co stt LON NHAT trong cac dong (thu tu Settings > Loai chiet khau: Khong CK < Dinh
       -- tu < 200k-500k < Gia KTV < Gia du phong) - vd phieu co ca dong Dinh tu + Gia KTV -> Gia KTV.
       (SELECT slck.id FROM phieu_xuat_kho_dong pxkd
          JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
          JOIN settings_loai_chiet_khau slck ON slck.id = ddh.loai_chiet_khau_id
          WHERE pxkd.phieu_xuat_kho_id = pxk.id
          ORDER BY slck.stt DESC, slck.id DESC LIMIT 1) as loai_chiet_khau_cao_nhat_id,
       EXISTS(
         SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
         WHERE pxkd.phieu_xuat_kho_id = pxk.id AND ddh.uu_tien = 1
       ) as co_don_uu_tien
     FROM phieu_xuat_kho pxk WHERE ${whereSql} ORDER BY ${sapXep ? `${sapXep}, ` : ""}pxk.ngay_tao DESC
     ${pageParam ? "LIMIT ? OFFSET ?" : ""}`,
  )
    .bind(...binds, ...(pageParam ? [pageSize, offset] : []))
    .all();
  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/phieu-xuat-kho/misa-export?<cung bo loc voi GET /> - ban gop, xuat TOAN BO PXK dang khop
// bo loc hien tai cua thẻ "Phiếu xuất kho" (bo qua phan trang - khac GET / tra ve du lieu list). Sao
// chep dung logic dung whereSql/binds cua GET / (khong tach ham chung - dung quy uoc san co cua file
// nay, xem GET /status-counts cung lam vay) de tranh lech bo loc giua "xem" va "xuat".
phieuXuatKho.get("/misa-export", async (c) => {
  if (!canDownloadMisa(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const user = c.get("user");
  const scope = scopePxkNguoiNhanHang(c);
  const trangThai = c.req.query("trang_thai");
  const nguoiNhanHang = c.req.query("nguoi_nhan_hang");
  const loaiDon = c.req.query("loai_don");
  const khuVuc = c.req.query("khu_vuc")?.trim();
  // .normalize("NFC") - xem giai thich day du o settingsKtv.ts GET / (cung fix, cung ngay).
  const q = c.req.query("q")?.trim().normalize("NFC");
  let whereSql = "1=1" + (scope?.whereSql ?? "");
  const binds: unknown[] = [...(scope?.binds ?? [])];
  // FIX (phan hoi nguoi dung: "đồng bộ danh sách theo badge" cho Khu vuc phu trach GS) - xem GET /
  // (cung 1 fix, cung ngay) - ap dung o day de tranh xuat MISA nhieu hon nhung gi GET / that su cho
  // xem (khong lech "xem" vs "xuat" nhu comment dau file da noi ro).
  if (scope === null && (canTacNghiep(c) || canKho(c) || canKeToan(c))) {
    const gsSet = await phuTrachGsSet(c.env.DB, user.email);
    if (gsSet) {
      whereSql += ` AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id AND ddh2.email_gs IN (${[...gsSet].map(() => "?").join(",")}))`;
      binds.push(...gsSet);
    }
  }
  if (trangThai === "__OPEN__") {
    // Sentinel "con ton" (them 2026-09-23) - xem giai thich day du o GET / (cung 1 fix, cung ngay, giu
    // dong bo "xem" vs "xuat" theo dung comment dau file).
    whereSql += ` AND pxk.trang_thai_hien_tai NOT IN (${TRANG_THAI_DONG.map(() => "?").join(",")})`;
    binds.push(...TRANG_THAI_DONG);
  } else if (trangThai === "CHO_TIEN") {
    // FIX (phan hoi 2026-09-23 "vẫn đếm cả đơn đã hủy") - xem giai thich day du o GET / (cung 1 fix,
    // cung ngay, giu dong bo "xem" vs "xuat" theo dung comment dau file).
    whereSql += " AND pxk.trang_thai_hien_tai = 'Dang tao phieu' AND pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet'";
  } else if (trangThai === "Dang tao phieu") {
    whereSql += " AND pxk.trang_thai_hien_tai = ? AND NOT (pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet')";
    binds.push(trangThai);
  } else if (trangThai) {
    whereSql += " AND pxk.trang_thai_hien_tai = ?";
    binds.push(trangThai);
  }
  if (nguoiNhanHang) {
    whereSql += " AND pxk.nguoi_nhan_hang = ?";
    binds.push(nguoiNhanHang);
  }
  if (loaiDon) {
    whereSql += " AND pxk.loai_don = ?";
    binds.push(loaiDon);
  }
  if (khuVuc) {
    const khuVucList = khuVuc.split(",").map((s) => s.trim()).filter(Boolean);
    if (khuVucList.length > 0) {
      const { sql, binds: khuVucBinds } = khuVucSetWhereSql(new Set(khuVucList), ["pxk.nguoi_nhan_hang"]);
      whereSql += sql;
      binds.push(...khuVucBinds);
    }
  }
  if (q) {
    // + tim theo TEN nguoi tao/nguoi nhan hang (2026-09-28, xem lib/timTheoTen.ts).
    const theoTen = orEmailIn(["pxk.nguoi_tao", "pxk.nguoi_nhan_hang"], await emailsTheoTen(c.env.DB, q));
    const theoDon = orDonTrongPxk(q); // + ma don / ma yeu cau su co chinh-bo sung cua dong trong phieu (2026-09-29)
    whereSql += ` AND (pxk.id LIKE ? OR pxk.ma_xuat_kho LIKE ? OR pxk.ma_misa LIKE ? OR pxk.ma_van_don LIKE ? OR pxk.nguoi_tao LIKE ? OR pxk.nguoi_nhan_hang LIKE ?${theoDon.sql}${theoTen.sql})`;
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, ...theoDon.binds, ...theoTen.binds);
  }

  const { results } = await c.env.DB.prepare(`SELECT pxk.id FROM phieu_xuat_kho pxk WHERE ${whereSql} ORDER BY pxk.ngay_tao`)
    .bind(...binds)
    .all<{ id: string }>();
  const result = await buildMisaExportSheets(c.env, results.map((r) => r.id), parseMisaTemplate(c));
  return c.json(result);
});

// GET /api/phieu-xuat-kho/status-counts?loai_don= - dem tinh theo tung trang_thai (dropdown loc, xem
// comment tai GET /api/dat-mua-lk/don-hang-status-counts) - scope GIONG HET GET / (scopePxkNguoiNhanHang),
// khong cong them nguoi_nhan_hang/khu_vuc/q dang loc phu. RIENG "loai_don" VAN nhan (khac cac tab kia)
// vi PhieuXuatKhoTab.tsx LUON truyen xemLoaiDon khi goi GET / (khong co gia tri "rong/gop" nhu
// DonCuaToiTab) - day la truc dieu huong sub-tab, khong phai bo loc phu, bo qua se ra so SAI (dem gop
// ca mua/cong_no/tra_hang trong khi dang xem 1 sub-tab rieng). "CHO_TIEN" la 1 DIEU KIEN CHAN (khong
// phai gia tri trang_thai_hien_tai that, xem comment goc tai GET /) nen tach rieng - PXK dang thoa dieu
// kien nay LUON co trang_thai_hien_tai='Dang tao phieu' nen loai truoc khoi GROUP BY de "Dang tao
// phieu" khong bi dem trung voi "Chờ chuyển tiền".
phieuXuatKho.get("/status-counts", async (c) => {
  const user = c.get("user");
  const scope = scopePxkNguoiNhanHang(c);
  const loaiDon = c.req.query("loai_don");
  let whereSql = "1=1" + (scope?.whereSql ?? "");
  const binds: unknown[] = [...(scope?.binds ?? [])];
  if (loaiDon) {
    whereSql += " AND pxk.loai_don = ?";
    binds.push(loaiDon);
  }
  // FIX (phat hien qua ra soat QA "click StageMenu/StatCard hien it phieu hon so tren the") - comment
  // goc o tren ("khong cong them nguoi_nhan_hang/khu_vuc/q dang loc phu") gia dinh khu_vuc la 1 bo loc
  // PHU nguoi dung phai tu bam, nhung PhieuXuatKhoTab.tsx thuc te TU DONG ap dung Khu vuc cua chinh tai
  // khoan lam gia tri MAC DINH tu lan tai dau (khuVucDefaultAppliedRef) - voi TN/Kho/Ke toan DA duoc
  // gan Khu vuc rieng (user_khu_vuc, xac nhan co that tren production), so o day (khong loc khu_vuc)
  // LON HON so phieu thuc su hien ra o danh sach mac dinh. /mo-count (badge "(N)" tren tab, sua
  // 2026-08-31) DA co dung fix nay - /status-counts (them sau, 2026-09-11) bi sot, tai su dung LAI y het
  // pattern cua /mo-count o tren.
  if (scope === null) {
    const khuVucSet = await khuVucCuaToiSet(c.env.DB, user);
    if (khuVucSet) {
      const { sql, binds: kvBinds } = khuVucSetWhereSql(khuVucSet, ["pxk.nguoi_nhan_hang"]);
      whereSql += sql;
      binds.push(...kvBinds);
    }
    if (canTacNghiep(c) || canKho(c) || canKeToan(c)) {
      const gsSet = await phuTrachGsSet(c.env.DB, user.email);
      if (gsSet) {
        whereSql += ` AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id AND ddh2.email_gs IN (${[...gsSet].map(() => "?").join(",")}))`;
        binds.push(...gsSet);
      }
    }
  }
  // FIX (phan hoi 2026-09-23 "vẫn đếm cả đơn đã hủy", day chinh la nguon gay lech badge "Tổng phiếu
  // xuất") - them "trang_thai_hien_tai = 'Dang tao phieu'" - xem giai thich day du o GET / (cung 1 fix,
  // cung ngay). Neu khong co dieu kien nay, 1 PXK "Ke toan huy" con treo tien chua duyet se bi loai
  // khoi GROUP BY ben duoi (WHERE ... AND NOT choTienCond) va "nuot" vao rieng bucket CHO_TIEN thay vi
  // bucket "Ke toan huy" - khien badge dua tren pxkStatusCounts["Ke toan huy"] khong tru dung.
  const choTienCond = "pxk.trang_thai_hien_tai = 'Dang tao phieu' AND pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien != 'TN da duyet'";
  // "__OPEN__" (them 2026-09-23, phan hoi "tổng phiếu = tổng phiếu đang tồn") - dem PXK KHONG thuoc 5
  // trang thai dong TRANG_THAI_DONG, khop dung dieu kien cua GET /?trang_thai=__OPEN__ o tren - de
  // "Tổng phiếu xuất" (frontend) doc THANG tu day thay vi tu tinh bang cach tru tung bucket dong.
  const openCond = `pxk.trang_thai_hien_tai NOT IN (${TRANG_THAI_DONG.map(() => "?").join(",")})`;
  const scalarRow = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE ${whereSql}) as total,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE ${whereSql} AND ${openCond}) as mo,
       (SELECT COUNT(*) FROM phieu_xuat_kho pxk WHERE ${whereSql} AND ${choTienCond}) as cho_tien`,
  )
    .bind(...binds, ...binds, ...TRANG_THAI_DONG, ...binds)
    .first<{ total: number; mo: number; cho_tien: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT pxk.trang_thai_hien_tai as trang_thai, COUNT(*) as n FROM phieu_xuat_kho pxk WHERE ${whereSql} AND NOT (${choTienCond}) GROUP BY pxk.trang_thai_hien_tai`,
  )
    .bind(...binds)
    .all<{ trang_thai: string; n: number }>();
  const counts: Record<string, number> = { "": scalarRow?.total ?? 0, __OPEN__: scalarRow?.mo ?? 0, CHO_TIEN: scalarRow?.cho_tien ?? 0 };
  for (const r of results) counts[r.trang_thai ?? ""] = r.n;
  return c.json({ counts });
});

// GET /api/phieu-xuat-kho/don-hang-kha-dung - danh sach dong dat_don_hang DA "TN da duyet" VA CHUA
// gan vao PXK nao (ma_xuat_kho IS NULL) - nguon cho picker chon dong luc "Tao phieu xuat kho".
// CHOT 2026-08-14 (ra soat UX toan dien): truoc day o nay la 1 o nhap tay/dan chuoi ID tu do, nhung
// khong noi nao trong UI tung hien dat_don_hang.id cho nguoi dung xem - TN khong co cach nao biet
// ID de go vao ngoai DevTools. Thay bang picker doc tu endpoint nay.
//
// SUA (migration 0002_tra_hang_pxk.sql): "TN da duyet" la trang thai san sang gom PXK cho CA 2
// nhanh, nhung NGUON DOC KHAC nhau - mua/cong_no qua dat_don_hang_log (latestDonHangLogStatusExpr,
// LUON co dong log dau tien), tra_hang qua THANG cot trang_thai_hien_tai (dong tra_hang KHONG dam
// bao co dong log dau tien - xem giai thich bug o traHang.ts GET /).
phieuXuatKho.get("/don-hang-kha-dung", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const loaiDon = c.req.query("loai_don");
  const isTraHang = loaiDon === "tra_hang";
  let whereSql = (isTraHang ? "ddh.loai_don = 'tra_hang'" : "ddh.loai_don != 'tra_hang'") + " AND ddh.ma_xuat_kho IS NULL";
  const binds: unknown[] = [];
  if (!isTraHang && loaiDon) {
    whereSql += " AND ddh.loai_don = ?";
    binds.push(loaiDon);
  }
  whereSql += isTraHang ? " AND ddh.trang_thai_hien_tai = 'TN da duyet'" : ` AND ${latestDonHangLogStatusExpr("ddh.id")} = 'TN da duyet'`;
  const { results } = await c.env.DB.prepare(
    `SELECT ddh.id, ddh.ma_lk, ddh.ten_lk_snapshot, ddh.so_luong_de_xuat, ddh.gia_chot, ddh.gia_de_xuat,
       ddh.updated_at, ddh.nguoi_nhan_hang, ddh.loai_don, ddh.loai_de_xuat, ddh.so_luong_thuc_xuat, ddh.so_tien_cong_no, ddh.ngay_tao
     FROM dat_don_hang ddh
     WHERE ${whereSql}
     ORDER BY ddh.nguoi_nhan_hang, ddh.updated_at`,
  )
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

// GET /api/phieu-xuat-kho/don-hang-kha-dung-counts - dem so dong kha dung tao PXK THEO tung loai_don
// (mua/cong_no/tra_hang) - dung cho nhan "(x123)" canh 3 nut chon Loai phieu trong modal "Tao phieu
// xuat kho" (phan hoi QA 2026-08-31, muc #8: "cho TN biet co bao nhieu KTV dang cho len PXK"). Dung
// CHUNG dieu kien hop le voi GET /don-hang-kha-dung ngay tren (cung 2 nguon doc khac nhau cho mua/
// cong_no vs tra_hang, xem comment o do) - chi khac la GROUP BY loai_don thay vi tra tung dong.
phieuXuatKho.get("/don-hang-kha-dung-counts", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const muaCongNo = await c.env.DB.prepare(
    `SELECT ddh.loai_don as loai_don, COUNT(*) as n FROM dat_don_hang ddh
     WHERE ddh.loai_don != 'tra_hang' AND ddh.ma_xuat_kho IS NULL AND ${latestDonHangLogStatusExpr("ddh.id")} = 'TN da duyet'
     GROUP BY ddh.loai_don`,
  ).all<{ loai_don: string; n: number }>();
  const traHang = await c.env.DB.prepare(
    "SELECT COUNT(*) as n FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang' AND ddh.ma_xuat_kho IS NULL AND ddh.trang_thai_hien_tai = 'TN da duyet'",
  ).first<{ n: number }>();
  const counts: Record<"mua" | "cong_no" | "tra_hang", number> = { mua: 0, cong_no: 0, tra_hang: traHang?.n ?? 0 };
  for (const r of muaCongNo.results as { loai_don: string; n: number }[]) {
    if (r.loai_don === "mua" || r.loai_don === "cong_no") counts[r.loai_don] = r.n;
  }
  return c.json({ counts });
});

// CHOT thuat toan tinh "so_tien_can_chuyen" GOI Y cho PXK (phan hoi nguoi dung 2026-09-13, muc 6a-e) -
// Ban dau CHI ap dung cho dong 'MUA DỰ TRỮ'; CHOT 2026-09-28: ap dung cho MOI dong mua (+ "TRỪ CÔNG NỢ"),
// rieng gia du phong (buoc 4-5) van chi cho dong MUA DỰ TRỮ - nguon that o lib/pxkRecalculate.ts. 6 buoc (CHOT qua nhieu vong AskUserQuestion, xem plan
// Task E):
//   1) Dong "Đình tủ" (linh_kien.don_vi, dung CHINH XAC chuoi nay - KHONG phai "Đỉnh tủ") luon tinh
//      gia_ban*0.85 (chiet khau 15% co dinh), doc lap voi cac buoc duoi.
//   2) D = tong gia_ban CUA TOAN BO dong mua cua KTV trong phieu (ke ca Dinh tu) - nguong xac dinh "gia KTV hieu luc"
//      o buoc 3.
//   3) Gia KTV hieu luc (cho dong KHONG phai Dinh tu): D<200k -> gia_ban; 200k<=D<500k -> gia_ban*0.7;
//      D>=500k -> gia_tri_cong_no.
//   4) G_dp = tong gia_du_phong cac dong MUA DỰ TRỮ KHONG phai Dinh tu.
//   5) So sanh G_dp voi "moc du phong con kha dung" cua KTV (computeMocDuPhongHienTai) - TAT CA hoac
//      KHONG (theo ca PXK, khong chia nho tung dong): moc >= G_dp -> tinh gia_du_phong; nguoc lai ->
//      tinh gia KTV hieu luc (buoc 3).
// Gom theo nguoi_nhan_hang (thuc te 1 PXK chi 1 KTV nen chi co 1 nhom, viet tong quat cho an toan).
// Logic tinh tien/loai chiet khau nam tai lib/pxkRecalculate.ts de route don hang, them/bo dong va
// luong tu dong gom PXK deu goi cung mot nguon.
async function computeGoiYSoTienChuyen(db: D1Database, datDonHangIds: string[]): Promise<number> {
  return (await tinhToanPxk(db, datDonHangIds)).total;
}

// Gan (lai) loai chiet khau he thong cho MOI dong cua 1 PXK (goi sau khi tao PXK / them / bo dong -
// nguong 200k/500k phu thuoc tap dong trong phieu nen phai tinh lai CA phieu). Bo qua dong TN da tu chon
// (loai_chiet_khau_thu_cong = 1) - TRU khi `datLaiThuCong`: phan hoi 2026-09-26 "tất cả các linh kiện
// trong PXK A được hưởng chiết khấu theo PXK đó... TN thêm hoặc bớt LK thì các đơn bên trong cũng thay đổi
// tương ứng" -> them/bo dong = thanh phan phieu doi = tinh lai TOAN BO, ke ca dong TN da chon tay truoc do
// (lua chon cu la cho thanh phan cu). Loai he thong dang TAT trong Settings -> de trong (khong gan).
export async function ganLoaiChietKhauChoPxk(
  db: D1Database,
  pxkId: string,
  datLaiThuCong = false,
  capNhatTongTien = true,
  nguoiXuLy?: string,
): Promise<PxkCalculation> {
  return taiTinhPxk(db, pxkId, datLaiThuCong, capNhatTongTien, nguoiXuLy);
}

/** Dong bi go khoi PXK -> khong con huong chiet khau cua phieu nao -> xoa han (ke ca loai TN da chon). */
function xoaLoaiChietKhauTuDong(db: D1Database, donHangId: string) {
  return db.prepare("UPDATE dat_don_hang SET loai_chiet_khau_id = NULL, loai_chiet_khau_thu_cong = 0 WHERE id = ?").bind(donHangId);
}

// PATCH /api/phieu-xuat-kho/don-hang/:donHangId/loai-chiet-khau - { loai_chiet_khau_id?: number | null,
// ten_moi?: string } - TN chon lai loai chiet khau khi he thong gan sai (2026-09-26). `ten_moi` = TN tu
// them 1 loai CHUA ton tai (trung ten khong phan biet hoa/thuong -> dung lai loai co san). Chi doi NHAN,
// khong dung toi so tien (chot voi nguoi dung). Danh dau thu_cong = 1 de lan tinh lai tu dong (vd KTV
// chuyen tien...) khong ghi de - chi bi tinh lai khi thanh phan PXK doi (xem ganLoaiChietKhauChoPxk).
phieuXuatKho.patch("/don-hang/:donHangId/loai-chiet-khau", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const donHangId = c.req.param("donHangId");
  const user = c.get("user");
  const body = await c.req.json<{ loai_chiet_khau_id?: number | null; ten_moi?: string }>();
  const don = await c.env.DB.prepare("SELECT loai_don FROM dat_don_hang WHERE id = ?").bind(donHangId).first<{ loai_don: string }>();
  if (!don) return c.json({ error: "NOT_FOUND" }, 404);
  if (don.loai_don === "tra_hang") return c.json({ error: "TRA_HANG_KHONG_CO_CHIET_KHAU" }, 400);
  const pxkCuaDon = await c.env.DB.prepare(
    `SELECT pxk.trang_thai_hien_tai as trang_thai, pxk.so_tien_can_chuyen, pxk.trang_thai_chuyen_tien
     FROM phieu_xuat_kho_dong pxkd JOIN phieu_xuat_kho pxk ON pxk.id = pxkd.phieu_xuat_kho_id WHERE pxkd.dat_don_hang_id = ?`,
  )
    .bind(donHangId)
    .first<{ trang_thai: string | null; so_tien_can_chuyen: number | null; trang_thai_chuyen_tien: string | null }>();
  if (!pxkCuaDon) return c.json({ error: "KHONG_THUOC_PXK" }, 400);
  if (!choPhepDoiLoaiChietKhau(pxkCuaDon)) return c.json({ error: "DA_CHOT_CHUYEN_TIEN" }, 409);

  let loaiId: number | null = null;
  const tenMoi = body.ten_moi ? gonTenLoaiChietKhau(body.ten_moi) : "";
  if (tenMoi) {
    const coSan = await timLoaiChietKhauTheoTen(c.env.DB, tenMoi);
    if (coSan && !coSan.bat_tat) return c.json({ error: "LOAI_DANG_TAT" }, 409);
    if (coSan) {
      loaiId = coSan.id;
    } else {
      const row = await c.env.DB.prepare(
        `INSERT INTO settings_loai_chiet_khau (ten, stt, nguoi_cap_nhat, ngay_cap_nhat)
         VALUES (?, (SELECT COALESCE(MAX(stt), 0) + 1 FROM settings_loai_chiet_khau), ?, ?) RETURNING id`,
      )
        .bind(tenMoi, user.email, nowVN())
        .first<{ id: number }>();
      loaiId = row?.id ?? null;
    }
  } else if (body.loai_chiet_khau_id != null) {
    const loai = await c.env.DB.prepare("SELECT id FROM settings_loai_chiet_khau WHERE id = ? AND bat_tat = 1")
      .bind(body.loai_chiet_khau_id)
      .first<{ id: number }>();
    if (!loai) return c.json({ error: "LOAI_KHONG_HOP_LE" }, 400);
    loaiId = loai.id;
  }
  await c.env.DB.prepare("UPDATE dat_don_hang SET loai_chiet_khau_id = ?, loai_chiet_khau_thu_cong = 1, updated_at = ? WHERE id = ?")
    .bind(loaiId, nowVN(), donHangId)
    .run();
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, loai_chiet_khau_id: loaiId });
});

// POST /api/phieu-xuat-kho/loai-chiet-khau/gan-lai - Admin: gan loai chiet khau cho cac PXK tao TRUOC khi
// co tinh nang nay (migration 0033 khong chay duoc logic JS de backfill). Chi dong CHUA co loai va chua
// bi TN chon tay; bo qua PXK da huy.
phieuXuatKho.post("/loai-chiet-khau/gan-lai", async (c) => {
  if (c.get("user").vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT pxk.id FROM phieu_xuat_kho pxk
     JOIN phieu_xuat_kho_dong pxkd ON pxkd.phieu_xuat_kho_id = pxk.id
     JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
     WHERE pxk.trang_thai_hien_tai != 'Ke toan huy' AND ddh.loai_don != 'tra_hang'
       AND ddh.loai_chiet_khau_id IS NULL AND ddh.loai_chiet_khau_thu_cong = 0`,
  ).all<{ id: string }>();
  for (const r of results) await ganLoaiChietKhauChoPxk(c.env.DB, r.id, false, false);
  if (results.length) c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, so_phieu: results.length });
});

// POST /api/phieu-xuat-kho/tinh-lai-tien-dang-mo - Admin, chay 1 lan sau khi doi cong thuc tinh tien
// (2026-09-28: backend tu tinh tong, cong_no chi tinh dong "TRỪ CÔNG NỢ", uu tien gia chot, SL thuc xuat) -
// tinh lai MOI PXK con "Dang tao phieu". Phieu nao lech so -> reset chuyen tien ve "Cho KTV chuyen" +
// ghi log (chot nguoi dung). Giu loai chiet khau TN da chon tay. Phieu da qua buoc khong dung toi.
phieuXuatKho.post("/tinh-lai-tien-dang-mo", async (c) => {
  const user = c.get("user");
  if (user.vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const { results } = await c.env.DB.prepare(
    // Bo qua PXK da duoc Ke toan duyet chuyen tien - da khoa (chot 2026-09-28).
    "SELECT id, so_tien_can_chuyen FROM phieu_xuat_kho WHERE trang_thai_hien_tai = 'Dang tao phieu' AND loai_don != 'tra_hang' AND COALESCE(trang_thai_chuyen_tien, '') != 'TN da duyet'",
  ).all<{ id: string; so_tien_can_chuyen: number | null }>();
  const doi: string[] = [];
  for (const r of results) {
    const ketQua = await taiTinhPxk(c.env.DB, r.id, false, true, user.email);
    if ((ketQua.total > 0 ? ketQua.total : null) !== r.so_tien_can_chuyen) doi.push(r.id);
  }
  if (results.length) c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, so_phieu: results.length, so_phieu_doi: doi.length, phieu_doi: doi });
});

// GET /api/phieu-xuat-kho/goi-y-so-tien?ids=ID1,ID2,... - so tien chuyen khoan GOI Y (TN/Ke toan van
// sua tay duoc, khong khoa field) theo thuat toan gia du tru "MUA DỰ TRỮ" (xem computeGoiYSoTienChuyen
// o tren) - goi lai moi khi TN doi tich chon dong trong modal "Tao phieu xuat kho" (them 2026-09-13,
// mirror tinh than debounce cua GET /du-doan-duyet ben datMuaLinhKien.ts).
phieuXuatKho.get("/goi-y-so-tien", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const ids = (c.req.query("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // Them 2026-09-28 (modal tao PXK hien bang giong "Dòng đơn hàng"): tra THEM tien uoc tinh + loai chiet
  // khau DU KIEN tung dong (cung 1 lan tinh voi tong - tinhToanPxk, nguon duy nhat).
  const tinh = await tinhToanPxk(c.env.DB, ids);
  const dong = ids.map((id) => ({ id, tien_uoc_tinh: tinh.tienUocTinhTheoDong.get(id) ?? null, ma_chiet_khau: tinh.maTheoDong.get(id) ?? null }));
  return c.json({ goi_y: tinh.total, dong });
});

// POST /api/phieu-xuat-kho - TN tao, gan ma_xuat_kho vao tung dong don hang lien quan va tu tinh
// so_tien_can_chuyen tu toan bo thanh phan cua phieu. Truong tien client gui len chi duoc giu trong
// contract de tuong thich client cu, backend khong tin gia tri nay.
//
// CHOT 2026-08-15 (Dot 2, muc C): "Ma don hang" (ma_xuat_kho) gio la TUY CHON luc tao - luc nay
// thuong CHUA biet vi KTV chua chuyen tien xong. Neu khong truyen, he thong tu dien PLACEHOLDER
// bang chinh id PXK (luon duy nhat, thoa UNIQUE) va danh dau ma_xuat_kho_xac_nhan = 0; TN nhap ma
// that sau qua PATCH /:id/ma-xuat-kho, luc do moi duoc gui "Cho ke toan" (xem POST /:id/log).
phieuXuatKho.post("/", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{
    ma_xuat_kho?: string; ghi_chu?: string; dat_don_hang_ids: string[]; so_tien_can_chuyen?: number;
    nguoi_nhan_hang: string; loai_don: "mua" | "cong_no" | "tra_hang";
  }>();
  if (!Array.isArray(body.dat_don_hang_ids) || body.dat_don_hang_ids.length === 0) return c.json({ error: "MISSING_DON_HANG" }, 400);
  if (!body.nguoi_nhan_hang?.trim()) return c.json({ error: "MISSING_NGUOI_NHAN_HANG" }, 400);
  if (body.loai_don !== "mua" && body.loai_don !== "cong_no" && body.loai_don !== "tra_hang") return c.json({ error: "MISSING_LOAI_DON" }, 400);
  const nguoiNhanHang = body.nguoi_nhan_hang.trim();
  const isTraHang = body.loai_don === "tra_hang";

  // Xac nhan tung dong that su hop le (da "TN da duyet" + chua gan PXK nao) truoc khi ghi - tranh
  // gan nham dong dang "Cho TN duyet"/da co ma_xuat_kho tu 1 PXK khac (vd 2 tab cung mo, hoac ID cu
  // con luu trong bo nho trinh duyet). SUA (migration 0002_tra_hang_pxk.sql): tra_hang doc thang cot
  // trang_thai_hien_tai thay vi latestDonHangLogStatusExpr - xem giai thich o GET /don-hang-kha-dung.
  const placeholders = body.dat_don_hang_ids.map(() => "?").join(", ");
  const { results: hopLe } = await c.env.DB.prepare(
    isTraHang
      ? `SELECT id FROM dat_don_hang ddh WHERE ddh.id IN (${placeholders}) AND ddh.loai_don = 'tra_hang' AND ddh.ma_xuat_kho IS NULL
           AND ddh.trang_thai_hien_tai = 'TN da duyet'`
      : `SELECT id FROM dat_don_hang ddh WHERE ddh.id IN (${placeholders}) AND ddh.loai_don != 'tra_hang' AND ddh.ma_xuat_kho IS NULL
           AND ${latestDonHangLogStatusExpr("ddh.id")} = 'TN da duyet'`,
  )
    .bind(...body.dat_don_hang_ids)
    .all<{ id: string }>();
  const hopLeIds = new Set((hopLe as { id: string }[]).map((r) => r.id));
  const khongHopLe = body.dat_don_hang_ids.filter((id) => !hopLeIds.has(id));
  if (khongHopLe.length > 0) return c.json({ error: "DON_HANG_KHONG_HOP_LE", ids: khongHopLe }, 400);

  // Chot nghiep vu 2026-08-15: 1 PXK CHI duoc gan cho 1 KTV duy nhat - kiem tra moi dong chon deu
  // thuoc dung nguoi_nhan_hang da khai bao (xem migration 0074).
  const { results: ktvRows } = await c.env.DB.prepare(
    `SELECT DISTINCT ddh.nguoi_nhan_hang FROM dat_don_hang ddh WHERE ddh.id IN (${placeholders})`,
  )
    .bind(...body.dat_don_hang_ids)
    .all<{ nguoi_nhan_hang: string | null }>();
  const ktvSet = new Set((ktvRows as { nguoi_nhan_hang: string | null }[]).map((r) => r.nguoi_nhan_hang));
  if (ktvSet.size !== 1 || !ktvSet.has(nguoiNhanHang)) return c.json({ error: "NHIEU_KTV_TRONG_1_PXK" }, 400);

  // Chot 2026-08-16 (dot 3 gop y #8): 1 PXK CHI duoc gom dong CUNG 1 loai_don (mua/cong_no) - khong
  // bao gio tron 2 loai trong 1 phieu (tra_hang da bi loai o buoc kiem tra hopLe o tren).
  const { results: loaiDonRows } = await c.env.DB.prepare(
    `SELECT DISTINCT ddh.loai_don FROM dat_don_hang ddh WHERE ddh.id IN (${placeholders})`,
  )
    .bind(...body.dat_don_hang_ids)
    .all<{ loai_don: string }>();
  const loaiDonSet = new Set((loaiDonRows as { loai_don: string }[]).map((r) => r.loai_don));
  if (loaiDonSet.size !== 1 || !loaiDonSet.has(body.loai_don)) return c.json({ error: "NHIEU_LOAI_TRONG_1_PXK" }, 400);

  // Tong tien la du lieu dan xuat: backend tu tinh tu toan bo dong thay vi tin gia tri client gui len.
  // Tra hang khong co tien; cong_no chi tinh dong "TRỪ CÔNG NỢ" (xem laTruCongNo, lib/pxkRecalculate.ts).
  const soTienCanChuyen = body.loai_don === "tra_hang" ? 0 : await computeGoiYSoTienChuyen(c.env.DB, body.dat_don_hang_ids);

  const user = c.get("user");
  const now = nowVN();
  const id = await nextSequentialId(c.env.DB, "phieu_xuat_kho", pxkIdPrefix(body.loai_don), 6);
  const coChuyenTien = soTienCanChuyen > 0;
  const maXuatKhoNhap = body.ma_xuat_kho?.trim();
  const maXuatKho = maXuatKhoNhap || id;
  const maXacNhan = maXuatKhoNhap ? 1 : 0;

  const statements = [
    c.env.DB.prepare(
      "INSERT INTO phieu_xuat_kho (id, ma_xuat_kho, ma_xuat_kho_xac_nhan, nguoi_tao, ngay_tao, ghi_chu, so_tien_can_chuyen, trang_thai_chuyen_tien, nguoi_nhan_hang, loai_don, trang_thai_hien_tai) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, maXuatKho, maXacNhan, user.email, now, body.ghi_chu?.trim() || null, coChuyenTien ? soTienCanChuyen : null, coChuyenTien ? "Cho KTV chuyen" : null, nguoiNhanHang, body.loai_don, "Dang tao phieu"),
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly) VALUES (?, ?, ?, ?)").bind(
      id,
      "Dang tao phieu",
      user.email,
      now,
    ),
    ...body.dat_don_hang_ids.flatMap((donHangId) => [
      c.env.DB.prepare("INSERT INTO phieu_xuat_kho_dong (phieu_xuat_kho_id, dat_don_hang_id) VALUES (?, ?)").bind(id, donHangId),
      c.env.DB.prepare("UPDATE dat_don_hang SET ma_xuat_kho = ?, updated_at = ? WHERE id = ?").bind(maXuatKho, now, donHangId),
    ]),
  ];

  await c.env.DB.batch(statements);
  const ketQuaTaiTinh = await ganLoaiChietKhauChoPxk(c.env.DB, id);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  // Bao KTV "co tien can chuyen" (phan hoi 2026-09-05) - chi khi PXK nay THAT SU can chuyen tien luc
  // tao (coChuyenTien), nguoi phai xu ly la dung 1 KTV = nguoiNhanHang.
  if (ketQuaTaiTinh.total > 0) {
    c.executionCtx.waitUntil(
      (async () => {
        const emailGsList = await emailGsListForPxk(c.env.DB, id);
        await notifyWorkflowTask(c.env, c.env.DB, {
          cat1Emails: [nguoiNhanHang],
          otherRoles: PXK_ROLES,
          emailGsList,
          pastActors: [],
          title: "Phiếu xuất kho",
          body: `PXK ${id} cần bạn xác nhận thông tin chuyển tiền ${ketQuaTaiTinh.total.toLocaleString("vi-VN")}đ`,
          linkType: "phieu_xuat_kho",
          linkId: id,
        });
      })(),
    );
  }
  await danhDauVanPhongTacDong(c.env.DB, id, user.email);
  return c.json({ id }, 201);
});

// GET /api/phieu-xuat-kho/:id - chi tiet + dong don hang + log. Ap dung scopePxkNguoiNhanHang giong
// GET / (RA SOAT BAO MAT 2026-08-18) - tra 404 (khong phai 403) khi ngoai pham vi, tranh lo cho
// nguoi ngoai pham vi biet 1 ID PXK co that su ton tai hay khong.
phieuXuatKho.get("/:id", async (c) => {
  const id = c.req.param("id");
  const scope = scopePxkNguoiNhanHang(c);
  const whereSql = "pxk.id = ?" + (scope?.whereSql ?? "");
  const binds = [id, ...(scope?.binds ?? [])];
  const pxk = await c.env.DB.prepare(`SELECT pxk.*, pxk.trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho pxk WHERE ${whereSql}`)
    .bind(...binds)
    .first();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);

  // "Cho TN duyet" MOI NHAT tung dong dung de tinh han "Ly do cham" (xem lib/hanLyDoCham.ts) - hien
  // canh bao "qua han" ngay tren modal chi tiet PXK, truoc khi TN bam "Gui ke toan" bi chan cung o
  // POST /:id/log (xem duoi). SUA (phan hoi QA 2026-08-31, muc #5): them lan_giai_trinh_gan_nhat
  // (migration 0014) lam moc tinh han THAY vi "co ly_do_cham hay khong" (khoa vinh vien sau lan dau).
  const { results: donHang } = await c.env.DB.prepare(
    `SELECT ddh.*, lk.gia_ban as lk_gia_ban, lk.gia_tri_cong_no as lk_gia_tri_cong_no, lk.gia_du_phong as lk_gia_du_phong,
       (SELECT ngay_xu_ly FROM dat_don_hang_log WHERE dat_don_hang_id = ddh.id AND trang_thai = 'Cho TN duyet' ORDER BY id DESC LIMIT 1) as cho_tn_duyet_at,
       (SELECT MAX(ngay_tao) FROM dat_don_hang_giai_trinh WHERE dat_don_hang_id = ddh.id) as last_giai_trinh_at
     FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
     LEFT JOIN linh_kien lk ON lk.ma_linh_kien = ddh.ma_lk
     WHERE pxkd.phieu_xuat_kho_id = ?`,
  )
    .bind(id)
    .all<{ id: string; ly_do_cham: string | null; cho_tn_duyet_at: string | null; last_giai_trinh_at: string | null }>();
  // Muc #5: lich su giai trinh CHO CA CAC DONG trong phieu nay - phan hoi QA "hiện tại đang không thể
  // xem được lý do giải trình chậm của đơn trong PXK" - truoc day chi co field ly_do_cham don (1 dong
  // text moi nhat), gio tra ca lich su day du de FE hien theo tung dong don hang (nhom theo
  // dat_don_hang_id, xem cach dung o PhieuXuatKhoTab.tsx).
  const donHangIds = (donHang as { id: string }[]).map((d) => d.id);
  const tinhTien = await tinhToanPxk(c.env.DB, donHangIds);
  const giaiTrinhRows =
    donHangIds.length > 0
      ? (
          await c.env.DB.prepare(
            `SELECT id, dat_don_hang_id, noi_dung, nguoi_tao, ngay_tao FROM dat_don_hang_giai_trinh
             WHERE dat_don_hang_id IN (${donHangIds.map(() => "?").join(",")}) ORDER BY id DESC`,
          )
            .bind(...donHangIds)
            .all<{ id: number; dat_don_hang_id: string; noi_dung: string; nguoi_tao: string; ngay_tao: string }>()
        ).results
      : [];
  const { results: logs } = await c.env.DB.prepare("SELECT * FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = ? ORDER BY id DESC").bind(id).all();
  // "Mau MISA de xuat" (them 2026-09-10) - de FE to mau noi bat 1 trong 3 nut tai MISA - xem
  // lib/misaExport.ts resolveMisaTemplateDeXuat.
  const misaTemplateDeXuat = await resolveMisaTemplateDeXuat(c.env, id);

  const now = nowVN();
  const donHangWithFlag = (donHang as { id: string; ly_do_cham: string | null; cho_tn_duyet_at: string | null; last_giai_trinh_at: string | null }[]).map(
    (d) => {
      const mocThoiGian = mocTinhHanTn(d.last_giai_trinh_at, d.cho_tn_duyet_at);
      return {
        ...d,
        tien_uoc_tinh: tinhTien.tienUocTinhTheoDong.get(d.id) ?? 0,
        qua_han_ly_do_cham: !!mocThoiGian && quaHanLyDoCham(mocThoiGian, now),
        giaiTrinh: (giaiTrinhRows as { dat_don_hang_id: string }[]).filter((g) => g.dat_don_hang_id === d.id),
      };
    },
  );

  return c.json({ phieuXuatKho: pxk, donHang: donHangWithFlag, tongTienUocTinh: tinhTien.total, logs, misaTemplateDeXuat });
});

// "template" query param dung chung cho ca 2 endpoint misa-export ben duoi (them 2026-09-02, phan
// hoi "tạo 3 button, TN muốn tải mẫu nào thì tải") - TN/Ke toan bam 1 trong 3 nut mau tren UI, EP
// TOAN BO dong duoc xuat vao dung mau da chon (xem forceTemplate o lib/misaExport.ts). Khong truyen
// (hoac gia tri la) -> giu hanh vi tu dong resolveTemplate cu.
function parseMisaTemplate(c: Context<{ Bindings: Env }>): MisaTemplate | undefined {
  const raw = c.req.query("template");
  if (!raw) return undefined;
  return (MISA_TEMPLATES as readonly string[]).includes(raw) ? (raw as MisaTemplate) : undefined;
}

// GET /api/phieu-xuat-kho/:id/misa-export - du lieu de FE dung xay 1-3 sheet Excel (Xuat kho/Chuyen
// kho/Ban hang) import MISA CHO DUNG 1 PXK nay (nut o modal chi tiet PXK, canh o "Mã đơn hàng" - xem
// lib/misaExport.ts). Scope giong GET /:id (tra 404 khi ngoai pham vi).
phieuXuatKho.get("/:id/misa-export", async (c) => {
  if (!canDownloadMisa(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const scope = scopePxkNguoiNhanHang(c);
  const whereSql = "pxk.id = ?" + (scope?.whereSql ?? "");
  const binds = [id, ...(scope?.binds ?? [])];
  const pxk = await c.env.DB.prepare(`SELECT pxk.id FROM phieu_xuat_kho pxk WHERE ${whereSql}`).bind(...binds).first<{ id: string }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);

  const result = await buildMisaExportSheets(c.env, [pxk.id], parseMisaTemplate(c));
  return c.json(result);
});

// PATCH /api/phieu-xuat-kho/:id/ma-xuat-kho - { ma_xuat_kho } TN nhap MA DON HANG THAT sau khi KTV
// da chuyen tien xong (Dot 2, muc C) - chi khi PXK con "Dang tao phieu" (chua gui ke toan). Dong bo
// lai dat_don_hang.ma_xuat_kho cua moi dong trong phieu cho khop (tra cuu nguoc dung ma that).
phieuXuatKho.patch("/:id/ma-xuat-kho", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json<{ ma_xuat_kho: string }>();
  const maXuatKho = body.ma_xuat_kho?.trim();
  if (!maXuatKho) return c.json({ error: "MISSING_MA_XUAT_KHO" }, 400);

  // Doc thang cot mirror trang_thai_hien_tai - xem giai thich o comment "SUA 2026-09-14" dau file
  // (latestStatusExpr() da bi bo vi bi "log-only" pollution tu migration 0028 lam sai lech).
  const pxk = await c.env.DB.prepare("SELECT trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho WHERE id = ?").bind(id).first<{ trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if ((pxk.trang_thai ?? "Dang tao phieu") !== "Dang tao phieu") return c.json({ error: "INVALID_STATE" }, 409);

  const trung = await c.env.DB.prepare("SELECT id FROM phieu_xuat_kho WHERE ma_xuat_kho = ? AND id != ?").bind(maXuatKho, id).first();
  if (trung) return c.json({ error: "MA_XUAT_KHO_DA_TON_TAI" }, 409);

  const now = nowVN();
  const user = c.get("user");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE phieu_xuat_kho SET ma_xuat_kho = ?, ma_xuat_kho_xac_nhan = 1 WHERE id = ?").bind(maXuatKho, id),
    c.env.DB.prepare(
      "UPDATE dat_don_hang SET ma_xuat_kho = ?, updated_at = ? WHERE id IN (SELECT dat_don_hang_id FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?)",
    ).bind(maXuatKho, now, id),
    // FIX (phan hoi QA 2026-08-31, muc #6): truoc day khong ghi log khi luu Ma don hang.
    // SUA (phan hoi nguoi dung 2026-09-13, muc 6: "log đang bị trùng tên của các giai đoạn") - dung
    // trang_thai LOG-ONLY rieng thay vi tai su dung pxk.trang_thai (luon la "Dang tao phieu" luc nay) -
    // xem migration 0028.
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      id, "Da luu ma don hang", user.email, now, `Đã lưu mã đơn hàng: ${maXuatKho}`,
    ),
  ]);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// PATCH /api/phieu-xuat-kho/:id/ma-misa - { ma_misa } Ke toan dien tren CHINH PXK (Dot 2, muc D,
// thay the cho dien tung dong dat_don_hang.ma_misa cu) - chi khi PXK dang "Cho ke toan".
phieuXuatKho.patch("/:id/ma-misa", async (c) => {
  if (!canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json<{ ma_misa: string }>();
  const maMisa = body.ma_misa?.trim();
  if (!maMisa) return c.json({ error: "MISSING_MA_MISA" }, 400);

  const pxk = await c.env.DB.prepare("SELECT trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho WHERE id = ?").bind(id).first<{ trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (pxk.trang_thai !== "Cho ke toan") return c.json({ error: "INVALID_STATE" }, 409);

  const user = c.get("user");
  // FIX (phan hoi QA 2026-08-31, muc #6): truoc day khong ghi log khi luu Ma MISA.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE phieu_xuat_kho SET ma_misa = ? WHERE id = ?").bind(maMisa, id),
    // SUA 2026-09-13 (xem giai thich o PATCH /:id/ma-xuat-kho phia tren): trang_thai log-only rieng
    // thay vi tai su dung pxk.trang_thai ("Cho ke toan").
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      id, "Da luu ma MISA", user.email, nowVN(), `Đã lưu Mã MISA: ${maMisa}`,
    ),
  ]);
  return c.json({ ok: true });
});

// PATCH /api/phieu-xuat-kho/:id/da-in-phieu - { da_in_phieu } - co PHU rieng cua Kho de theo doi phieu
// nao da in/chua in luc chuan bi giao hang (phan hoi 2026-09-24: "ở giai đoạn chờ kho gửi hàng cho ktv,
// thêm 1 trạng thái phụ là đã in phiếu/ chưa in phiếu... chỉ là trạng thái phụ để theo dõi, không thay
// đổi luồng công việc") - KHONG gate theo trang_thai_hien_tai (chi la co theo doi, khong phai buoc
// workflow), KHONG ghi phieu_xuat_kho_log (qua nho/co the bam nham lai nhieu lan, khong phai 1 "lich su
// xu ly" dang luu).
phieuXuatKho.patch("/:id/da-in-phieu", async (c) => {
  if (!canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json<{ da_in_phieu: boolean }>();
  const pxk = await c.env.DB.prepare("SELECT id FROM phieu_xuat_kho WHERE id = ?").bind(id).first();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  await c.env.DB.prepare("UPDATE phieu_xuat_kho SET da_in_phieu = ? WHERE id = ?").bind(body.da_in_phieu ? 1 : 0, id).run();
  return c.json({ ok: true });
});

// POST /api/phieu-xuat-kho/:id/anh-bien-ban - upload BINARY THO (Content-Type = mime anh) len Google
// Drive (Dot 2, muc F) - CHI nguoi_nhan_hang duoc upload (khong tinh Admin - anh bien ban phai dung
// nguoi thuc te chup), chi khi PXK dang "Dang gui KTV". Khong bat buoc goi truoc "KTV da nhan".
phieuXuatKho.post("/:id/anh-bien-ban", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const pxk = await c.env.DB.prepare(
    "SELECT nguoi_nhan_hang, trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho WHERE id = ?",
  )
    .bind(id)
    .first<{ nguoi_nhan_hang: string | null; trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (user.email !== pxk.nguoi_nhan_hang) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  if (pxk.trang_thai !== "Dang gui KTV") return c.json({ error: "INVALID_STATE" }, 409);

  const contentType = c.req.header("Content-Type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return c.json({ error: "INVALID_CONTENT_TYPE" }, 400);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);

  const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const filename = `bien-ban-${id}-${Date.now()}.${ext}`;
  let uploaded: { id: string; thumbnailUrl: string };
  try {
    uploaded = await uploadPublicImage(c.env, c.env.DB, bytes, contentType, filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("GOOGLE_DRIVE_NOT_CONNECTED")) {
      return c.json({ error: "GOOGLE_DRIVE_NOT_CONNECTED", message: "Chưa kết nối tài khoản Google Drive - vào Cài đặt để kết nối." }, 400);
    }
    return c.json({ error: "UPLOAD_FAILED", message }, 502);
  }

  // FIX (phan hoi QA 2026-08-31, muc #6): truoc day khong ghi log khi tai anh bien ban.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE phieu_xuat_kho SET anh_bien_ban_url = ? WHERE id = ?").bind(uploaded.thumbnailUrl, id),
    // SUA 2026-09-13 (xem giai thich o PATCH /:id/ma-xuat-kho phia tren): trang_thai log-only rieng
    // thay vi tai su dung pxk.trang_thai ("Dang gui KTV").
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      id, "Da tai anh bien ban", user.email, nowVN(), "Đã tải ảnh biên bản giao nhận",
    ),
  ]);
  return c.json({ ok: true, url: uploaded.thumbnailUrl });
});

// POST /api/phieu-xuat-kho/:id/bang-chung-chuyen-tien - upload BINARY THO anh bang chung chuyen
// tien len Google Drive (phan hoi 2026-08-19: "cho phép upload ảnh") - CUNG dieu kien quyen/trang
// thai voi nhanh "KTV da chuyen" o PATCH /:id/chuyen-tien phia tren (chi nguoi_nhan_hang hoac Admin,
// chi khi dang "Cho KTV chuyen"), CHI upload anh va tra URL - client tu goi PATCH /:id/chuyen-tien
// sau do de thuc su chuyen trang thai (giong 2 buoc cua "Ma xuat kho"), tranh 1 endpoint lam 2 viec.
phieuXuatKho.post("/:id/bang-chung-chuyen-tien", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const pxk = await c.env.DB.prepare("SELECT trang_thai_chuyen_tien, nguoi_nhan_hang, bang_chung_chuyen_tien_anh FROM phieu_xuat_kho WHERE id = ?")
    .bind(id)
    .first<{ trang_thai_chuyen_tien: string | null; nguoi_nhan_hang: string | null; bang_chung_chuyen_tien_anh: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  // Toi da 5 anh / phieu (2026-09-29) - tinh tren anh DA LUU; anh vua tai chua xac nhan client tu gioi han.
  if (docAnhBangChung(pxk.bang_chung_chuyen_tien_anh).length >= MAX_ANH_BANG_CHUNG) return c.json({ error: "QUA_SO_ANH_BANG_CHUNG" }, 400);
  // FIX (bao cao 2026-08-26: "Vai trò TN thử up hình ảnh bằng chứng chuyển tiền thì bị báo lỗi") -
  // truoc day CHI KTV (nguoi_nhan_hang that su) hoac Admin upload duoc, nhung thuc te KTV thuong gui
  // anh chuyen khoan qua Zalo/tin nhan roi TN (nguoi xu ly PXK) up HO len he thong, khong tu dang
  // nhap upload. Them dieu kien canTacNghiep(c) (la_tac_nghiep hoac Admin, dung cung dinh nghia voi
  // moi noi khac trong file nay) vao truong hop duoc phep.
  // SUA (phan hoi nguoi dung 04/09/2026: "bước 1: KTV xác nhận thông tin chuyển tiền (hoặc TN/Kế
  // toán xác nhận hộ)") - them canKeToan(c) vao danh sach duoc phep xac nhan ho, giu nguyen TN/Admin/
  // chinh KTV nhu cu.
  if (user.email !== pxk.nguoi_nhan_hang && user.vai_tro !== "Admin" && !canTacNghiep(c) && !canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  if (pxk.trang_thai_chuyen_tien !== "Cho KTV chuyen") return c.json({ error: "INVALID_STATE" }, 409);

  const contentType = c.req.header("Content-Type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return c.json({ error: "INVALID_CONTENT_TYPE" }, 400);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);

  const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const filename = `bang-chung-chuyen-tien-${id}-${Date.now()}.${ext}`;
  let uploaded: { id: string; thumbnailUrl: string };
  try {
    uploaded = await uploadPublicImage(c.env, c.env.DB, bytes, contentType, filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("GOOGLE_DRIVE_NOT_CONNECTED")) {
      return c.json({ error: "GOOGLE_DRIVE_NOT_CONNECTED", message: "Chưa kết nối tài khoản Google Drive - vào Cài đặt để kết nối." }, 400);
    }
    return c.json({ error: "UPLOAD_FAILED", message }, 502);
  }
  return c.json({ ok: true, url: uploaded.thumbnailUrl });
});

// POST /api/phieu-xuat-kho/:id/chuyen-tien - { so_tien } TN (tao moi hoac dat lai) 1 khoan can KTV
// chuyen - dua PXK ve "Cho KTV chuyen", xoa bang chung/ngay cu (neu dang dat lai sau khi bi tu choi).
phieuXuatKho.post("/:id/chuyen-tien", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");

  const pxk = await c.env.DB.prepare("SELECT id FROM phieu_xuat_kho WHERE id = ?").bind(id).first<{ id: string }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);

  const ketQuaTaiTinh = await taiTinhPxk(c.env.DB, id);
  if (ketQuaTaiTinh.total <= 0) return c.json({ error: "MISSING_SO_TIEN" }, 400);

  // FIX (phan hoi QA 2026-08-31, muc #6): truoc day chi UPDATE, khong ghi log - "Lich su xu ly"
  // khong the hien duoc thoi diem TN yeu cau chuyen tien. trang_thai cua dong log dung LAI trang thai
  // CHINH hien tai cua phieu (CHECK constraint chi cho 8-9 gia tri workflow chinh, khong co "buoc con"
  // rieng cho chuyen tien) - ghi_chu la noi mo ta THAT SU hanh dong nay lam gi.
  const user = c.get("user");
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare(
      // GIU bang chung cu (2026-09-29) - KTV bo sung anh neu can roi xac nhan lai.
      "UPDATE phieu_xuat_kho SET so_tien_can_chuyen = ?, trang_thai_chuyen_tien = 'Cho KTV chuyen', ngay_ktv_chuyen = NULL WHERE id = ?",
    ).bind(ketQuaTaiTinh.total, id),
    // SUA 2026-09-13 (xem giai thich o PATCH /:id/ma-xuat-kho phia tren): trang_thai log-only rieng
    // thay vi tai su dung pxk.trang_thai.
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      id, "Da yeu cau KTV chuyen tien", user.email, now, `Yêu cầu KTV chuyển ${ketQuaTaiTinh.total.toLocaleString("vi-VN")}đ`,
    ),
  ]);
  // FIX (phat hien 04/09/2026 khi kiem thu bao cao Toc do xu ly): thieu bump version domain
  // "dat_mua_lk" - GET /bao-cao-toc-do/xep-hang (cachedReport) khong bao gio thay du lieu chuyen tien
  // moi neu khong co 1 ghi khac (vd duyet don) tinh co xay ra gan do de tu bump ho. Them dung pattern
  // 3 endpoint khac trong file nay da lam (POST /, PATCH /:id/ma-xuat-kho, POST /:id/log).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true }, 201);
});

// PATCH /api/phieu-xuat-kho/:id/chuyen-tien - { trang_thai: "KTV da chuyen" | "TN da duyet",
// bang_chung_chuyen_tien_url? } - KTV dinh bang chung (CHI DUNG nguoi_nhan_hang cua chinh PXK do,
// hoac Admin/TN/Ke toan xac nhan thay - RA SOAT BAO MAT 2026-08-18 phan hoi Codex: truoc day KHONG
// check gi ca, bat ky tai khoan da duyet nao cung PATCH duoc trang thai "da chuyen tien" kem link
// bang chung tuy y cho PXK cua nguoi khac), hoac Ke toan duyet lai bang chung da dinh (buoc nay CHUYEN
// TU TN SANG KE TOAN 04/09/2026 - xem nhanh "TN da duyet" ben duoi, gia tri DB giu nguyen ten cu).
phieuXuatKho.patch("/:id/chuyen-tien", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ trang_thai: string; bang_chung_chuyen_tien_url?: string; bang_chung_chuyen_tien_anh?: string[]; bang_chung_chuyen_tien_ghi_chu?: string }>();
  const pxk = await c.env.DB.prepare(
    "SELECT trang_thai_chuyen_tien, nguoi_nhan_hang FROM phieu_xuat_kho WHERE id = ?",
  ).bind(id).first<{ trang_thai_chuyen_tien: string | null; nguoi_nhan_hang: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  const now = nowVN();
  // FIX (phan hoi QA 2026-08-31, muc #6): 2 nhanh duoi day truoc chi UPDATE, khong ghi
  // phieu_xuat_kho_log - xem giai thich chung o POST /:id/chuyen-tien phia tren.

  if (body.trang_thai === "KTV da chuyen") {
    const user = c.get("user");
    // FIX (bao cao 2026-08-26, cung ly do voi POST /:id/bang-chung-chuyen-tien o duoi): cho phep TN
    // (canTacNghiep) xac nhan ho buoc nay - KTV thuong gui anh/tin nhan qua kenh khac, TN la nguoi
    // thao tac tren he thong thay vi tu KTV dang nhap.
    // SUA (phan hoi nguoi dung 04/09/2026): them canKeToan(c) - xem giai thich o POST
    // /:id/bang-chung-chuyen-tien phia tren.
    if (user.email !== pxk.nguoi_nhan_hang && user.vai_tro !== "Admin" && !canTacNghiep(c) && !canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    if (pxk.trang_thai_chuyen_tien !== "Cho KTV chuyen") return c.json({ error: "INVALID_STATE" }, 409);
    // migration 0091 (phan hoi 2026-08-19: "cho phép upload ảnh hoặc ghi chú thông tin chuyển
    // tiền") - bat buoc CO IT NHAT 1 trong 2 (anh that qua Drive HOAC ghi chu van ban), khong con
    // bat buoc rieng URL nhu truoc.
    // Nhieu anh (2026-09-29): `bang_chung_chuyen_tien_anh` = DANH SACH DAY DU sau khi KTV them/bo (anh cu + moi);
    // client cu chi gui 1 `bang_chung_chuyen_tien_url` -> coi la danh sach 1 anh.
    const anh = [...new Set((Array.isArray(body.bang_chung_chuyen_tien_anh) ? body.bang_chung_chuyen_tien_anh : [body.bang_chung_chuyen_tien_url ?? ""])
      .map((u) => (typeof u === "string" ? u.trim() : "")).filter(Boolean))];
    if (anh.length > MAX_ANH_BANG_CHUNG) return c.json({ error: "QUA_SO_ANH_BANG_CHUNG" }, 400);
    if (anh.some((u) => !/^https?:\/\//i.test(u))) return c.json({ error: "INVALID_URL" }, 400);
    if (anh.length === 0 && !body.bang_chung_chuyen_tien_ghi_chu?.trim()) {
      return c.json({ error: "MISSING_BANG_CHUNG" }, 400);
    }
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE phieu_xuat_kho SET trang_thai_chuyen_tien = 'KTV da chuyen', bang_chung_chuyen_tien_url = ?, bang_chung_chuyen_tien_anh = ?, bang_chung_chuyen_tien_ghi_chu = ?, ngay_ktv_chuyen = ? WHERE id = ?",
      ).bind(anh[0] ?? null, anh.length > 0 ? JSON.stringify(anh) : null, body.bang_chung_chuyen_tien_ghi_chu?.trim() || null, now, id),
      // SUA 2026-09-13 (xem giai thich o PATCH /:id/ma-xuat-kho phia tren): trang_thai log-only rieng
      // thay vi tai su dung logTrangThai (trang_thai chinh hien tai cua phieu).
      c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
        id, "Da dinh bang chung chuyen tien", user.email, now, anh.length > 0 ? `Đã đính ${anh.length} ảnh bằng chứng${body.bang_chung_chuyen_tien_ghi_chu?.trim() ? " + ghi chú" : ""} chuyển tiền` : "Đã đính ghi chú chuyển tiền",
      ),
    ]);
    // Bao Ke toan "cho duyet chuyen tien" (phan hoi 2026-09-05) - buoc 2 gio la Ke toan duyet (xem
    // nhanh "TN da duyet" ben duoi, ten bien giu nguyen theo gia tri DB cu).
    c.executionCtx.waitUntil(
      (async () => {
        const emailGsList = await emailGsListForPxk(c.env.DB, id);
        const [cat1Emails, pastActors] = await Promise.all([
          emailsForRoleOrQC(c.env.DB, "la_ke_toan", emailGsList),
          pastActorsFor(c.env.DB, "phieu_xuat_kho_log", "phieu_xuat_kho_id", id, user.email),
        ]);
        await notifyWorkflowTask(c.env, c.env.DB, {
          cat1Emails,
          otherRoles: PXK_ROLES.filter((r) => r !== "la_ke_toan"),
          emailGsList,
          pastActors,
          title: "Phiếu xuất kho",
          body: `PXK ${id} đang chờ bạn duyệt chuyển tiền`,
          linkType: "phieu_xuat_kho",
          linkId: id,
        });
      })(),
    );
  } else if (body.trang_thai === "TN da duyet") {
    // SUA (phan hoi nguoi dung 04/09/2026: "Bước 2: 'Kế toán duyệt chuyển tiền'") - nguoi duyet buoc
    // cuoi chuyen tu TN sang Ke toan (gate doi canTacNghiep -> canKeToan). GIU NGUYEN gia tri DB
    // "TN da duyet" (khong doi CHECK constraint/khong migration - xem cac noi doc gia tri nay:
    // MISSING_CHUYEN_TIEN_APPROVED phia tren, misaExport.ts phuong_thuc_thanh_toan, GET /bao-cao-tong-the),
    // chi doi AI duoc phep thuc hien hanh dong nay.
    if (!canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    if (pxk.trang_thai_chuyen_tien !== "KTV da chuyen") return c.json({ error: "INVALID_STATE" }, 409);
    const user = c.get("user");
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE phieu_xuat_kho SET trang_thai_chuyen_tien = 'TN da duyet' WHERE id = ?").bind(id),
      // SUA 2026-09-13 (xem giai thich o PATCH /:id/ma-xuat-kho phia tren): trang_thai log-only rieng
      // thay vi tai su dung logTrangThai.
      c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
        id, "Ke toan da duyet bang chung chuyen tien", user.email, now, "Kế toán đã duyệt bằng chứng chuyển tiền",
      ),
    ]);
  } else {
    return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  }

  // FIX (xem giai thich o POST /:id/chuyen-tien phia tren) - cung thieu bump version domain "dat_mua_lk".
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// Endpoint tuong thich cho client cu: tong tien nay khong con nhan gia tri nhap tay ma duoc tinh lai
// tu toan bo dong trong phieu, cung quy tac voi cac luong sua/them/bo don.
phieuXuatKho.patch("/:id/so-tien-can-chuyen", async (c) => {
  if (!canTacNghiep(c) && !canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const user = c.get("user");

  const pxk = await c.env.DB.prepare("SELECT trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho WHERE id = ?")
    .bind(id)
    .first<{ trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (pxk.trang_thai !== "Dang tao phieu") return c.json({ error: "INVALID_STATE" }, 409);

  const ketQua = await taiTinhPxk(c.env.DB, id, false, true, user.email);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, so_tien_can_chuyen: ketQua.total });
});

// POST /api/phieu-xuat-kho/:id/dong - them 2026-09-21 (phan hoi "cho phép thêm đơn vào phiếu đang
// xem") - truoc gio KHONG co route nao gan them 1 dong dat_don_hang vao 1 PXK DA TAO (chi gan luc
// POST / tao phieu). Dieu kien hop le GIONG HET buoc kiem tra o POST / (bien theo loai_don, xem
// comment o do) - CONG THEM phai dung nguoi_nhan_hang cua CHINH PXK nay (1 PXK chi 1 KTV, chot
// 2026-08-15). ma_xuat_kho gan cho don MOI la ma cua PXK (khong phai cua don) - dung chieu nhu POST /.
phieuXuatKho.post("/:id/dong", async (c) => {
  if (!canTacNghiep(c) && !canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<{ dat_don_hang_ids: string[] }>();
  if (!Array.isArray(body.dat_don_hang_ids) || body.dat_don_hang_ids.length === 0) {
    return c.json({ error: "MISSING_DON_HANG" }, 400);
  }

  const pxk = await c.env.DB.prepare(
    "SELECT ma_xuat_kho, nguoi_nhan_hang, loai_don, trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho WHERE id = ?",
  )
    .bind(id)
    .first<{ ma_xuat_kho: string; nguoi_nhan_hang: string | null; loai_don: string | null; trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (pxk.trang_thai !== "Dang tao phieu") return c.json({ error: "INVALID_STATE" }, 409);

  const isTraHang = pxk.loai_don === "tra_hang";
  const placeholders = body.dat_don_hang_ids.map(() => "?").join(", ");
  const { results: hopLe } = await c.env.DB.prepare(
    isTraHang
      ? `SELECT id FROM dat_don_hang ddh WHERE ddh.id IN (${placeholders}) AND ddh.loai_don = 'tra_hang' AND ddh.ma_xuat_kho IS NULL
           AND ddh.nguoi_nhan_hang = ? AND ddh.trang_thai_hien_tai = 'TN da duyet'`
      : `SELECT id FROM dat_don_hang ddh WHERE ddh.id IN (${placeholders}) AND ddh.loai_don = ? AND ddh.ma_xuat_kho IS NULL
           AND ddh.nguoi_nhan_hang = ? AND ${latestDonHangLogStatusExpr("ddh.id")} = 'TN da duyet'`,
  )
    .bind(...body.dat_don_hang_ids, isTraHang ? pxk.nguoi_nhan_hang : pxk.loai_don, ...(isTraHang ? [] : [pxk.nguoi_nhan_hang]))
    .all<{ id: string }>();
  const hopLeIds = new Set((hopLe as { id: string }[]).map((r) => r.id));
  const khongHopLe = body.dat_don_hang_ids.filter((did) => !hopLeIds.has(did));
  if (khongHopLe.length > 0) return c.json({ error: "DON_KHONG_HOP_LE", ids: khongHopLe }, 400);

  const { results: donRows } = await c.env.DB.prepare(
    `SELECT ma_lk FROM dat_don_hang WHERE id IN (${placeholders})`,
  )
    .bind(...body.dat_don_hang_ids)
    .all<{ ma_lk: string }>();
  const now = nowVN();
  const statements = body.dat_don_hang_ids.flatMap((donHangId) => [
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_dong (phieu_xuat_kho_id, dat_don_hang_id) VALUES (?, ?)").bind(id, donHangId),
    c.env.DB.prepare("UPDATE dat_don_hang SET ma_xuat_kho = ?, updated_at = ? WHERE id = ?").bind(pxk.ma_xuat_kho, now, donHangId),
  ]);
  statements.push(
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      id, "Da them don vao phieu", user.email, now, `Đã thêm ${body.dat_don_hang_ids.length} đơn: ${(donRows as { ma_lk: string }[]).map((r) => r.ma_lk).join(", ")}`,
    ),
  );
  await c.env.DB.batch(statements);
  await ganLoaiChietKhauChoPxk(c.env.DB, id, true, true, user.email);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, added: body.dat_don_hang_ids.length });
});

// DELETE /api/phieu-xuat-kho/:id/dong/:donHangId - them 2026-09-21 (phan hoi "cho phép bỏ đơn khỏi
// phiếu đang xem") - go 1 dong khoi phieu (khong xoa dat_don_hang, chi go lien ket + tra ma_xuat_kho
// ve NULL de don do quay lai danh sach "khả dụng" cho 1 PXK khac). Chan neu la dong CUOI CUNG con lai
// (mot PXK khong the rong - dung "Kế toán huỷ" qua POST /:id/log neu muon bo han ca phieu).
phieuXuatKho.delete("/:id/dong/:donHangId", async (c) => {
  if (!canTacNghiep(c) && !canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const donHangId = c.req.param("donHangId");
  const user = c.get("user");

  const pxk = await c.env.DB.prepare("SELECT trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho WHERE id = ?")
    .bind(id)
    .first<{ trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (pxk.trang_thai !== "Dang tao phieu") return c.json({ error: "INVALID_STATE" }, 409);

  const linked = await c.env.DB.prepare("SELECT 1 FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ? AND dat_don_hang_id = ?")
    .bind(id, donHangId)
    .first();
  if (!linked) return c.json({ error: "NOT_FOUND" }, 404);

  // Bo DUOC ca don cuoi cung (chot 2026-09-28, muc 3) - phieu trong, dong man phieu se tu huy (POST
  // /:id/huy-neu-trong); truoc day chan LAST_ORDER.

  const donRow = await c.env.DB.prepare("SELECT ma_lk FROM dat_don_hang WHERE id = ?").bind(donHangId).first<{ ma_lk: string }>();
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ? AND dat_don_hang_id = ?").bind(id, donHangId),
    c.env.DB.prepare("UPDATE dat_don_hang SET ma_xuat_kho = NULL, updated_at = ? WHERE id = ?").bind(now, donHangId),
    xoaLoaiChietKhauTuDong(c.env.DB, donHangId),
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      id, "Da xoa don khoi phieu", user.email, now, `Đã bỏ đơn ${donRow?.ma_lk ?? donHangId} khỏi phiếu`,
    ),
  ]);
  await ganLoaiChietKhauChoPxk(c.env.DB, id, true, true, user.email);
  // Dong vua go ra thanh "chua vao PXK" -> gan lai loai chiet khau theo tong ngay (chot 2026-09-28).
  const pxkNhan = await c.env.DB.prepare("SELECT nguoi_nhan_hang FROM phieu_xuat_kho WHERE id = ?").bind(id).first<{ nguoi_nhan_hang: string | null }>();
  await taiTinhPxkMoCuaKtv(c.env.DB, pxkNhan?.nguoi_nhan_hang, user.email, id);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

// POST /api/phieu-xuat-kho/:id/huy-neu-trong - dong man chi tiet 1 PXK "Dang tao phieu" khong con dong nao ->
// tu huy phieu (chot 2026-09-28, muc 3: "phiếu trống nếu người dùng tắt đi sẽ tự hủy bỏ"). Khong trong -> bo qua.
phieuXuatKho.post("/:id/huy-neu-trong", async (c) => {
  if (!canTacNghiep(c) && !canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const daHuy = await huyPxkNeuTrong(c.env.DB, c.req.param("id"), c.get("user").email);
  if (daHuy) c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, da_huy: daHuy });
});

// POST /api/phieu-xuat-kho/:id/dong-goi - { anh?: string[] } (chot 2026-09-08: chuan hoa hanh
// dong Kho "Dong goi" giua PXK-/TR- - mirror DUNG khuon phieuTra.ts::/:id/dong-goi ben suachua,
// chi luu anh bien ban vao phieu_xuat_kho_anh, KHONG doi trang_thai_hien_tai. Khac
// "/:id/anh-bien-ban" o tren (do la anh giao nhan CUA KTV nhan hang, sau khi da gui).
phieuXuatKho.post("/:id/dong-goi", async (c) => {
  if (!canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const user = c.get("user");
  const pxk = await c.env.DB.prepare(
    "SELECT trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho WHERE id = ?",
  )
    .bind(id)
    .first<{ trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (pxk.trang_thai !== "Da chot xong don xuat") return c.json({ error: "INVALID_STATE" }, 409);

  const body = await c.req.json<{ anh?: string[] }>().catch(() => ({}) as { anh?: string[] });
  const statements = (body.anh || []).map((url) =>
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_anh (phieu_xuat_kho_id, anh_url, nguoi_upload) VALUES (?, ?, ?)").bind(id, url, user.email),
  );
  if (statements.length) await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

// POST /api/phieu-xuat-kho/:id/log - { trang_thai, ghi_chu? } chuyen trang thai tiep theo, dung 8
// trang thai chuan (xem comment dau file):
//  - TN: "Dang tao phieu" -> "Cho ke toan" (chan boi chuyen tien neu co_tien_can_chuyen != null),
//    hoac "Ke toan huy" tu 2 buoc dau (TN tu huy don minh tao nham).
//  - Ke toan: "Cho ke toan" -> "Da chot xong don xuat" (xu ly xong AMIS) hoac "Ke toan huy".
//  - Kho: "Da chot xong don xuat" -> "Dang gui KTV" (can giao vat ly) hoac "Hang tru kho" (khong
//    can giao vat ly - vd tru thang vao ton kho KTV dang giu); tu "Dang gui KTV" -> "Kho da ket
//    thuc" (Kho tu dong thay KTV khi KTV khong phan hoi).
//  - KTV (nguoi nhan hang thuc te, khong gioi han vai tro): "Dang gui KTV" -> "KTV da nhan".
phieuXuatKho.post("/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ trang_thai: string; ghi_chu?: string; ma_van_don?: string; ly_do_huy_pxk?: "loi" | "khong_con_nhu_cau" }>();
  const pxk = await c.env.DB.prepare(
    "SELECT so_tien_can_chuyen, trang_thai_chuyen_tien, ma_xuat_kho_xac_nhan, ma_misa, nguoi_nhan_hang, loai_don, version, trang_thai_hien_tai as trang_thai FROM phieu_xuat_kho WHERE id = ?",
  )
    .bind(id)
    .first<{
      so_tien_can_chuyen: number | null;
      trang_thai_chuyen_tien: string | null;
      ma_xuat_kho_xac_nhan: number;
      ma_misa: string | null;
      nguoi_nhan_hang: string | null;
      loai_don: string | null;
      version: number;
      trang_thai: string | null;
    }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (pxk.trang_thai && (TRANG_THAI_DONG as readonly string[]).includes(pxk.trang_thai)) return c.json({ error: "PHIEU_DA_DONG" }, 409);

  const user = c.get("user");
  const hienTai = pxk.trang_thai ?? "Dang tao phieu";
  const target = body.trang_thai;

  if (target === "Cho ke toan") {
    if (hienTai !== "Dang tao phieu") return c.json({ error: "INVALID_STATE" }, 409);
    if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    if (!pxk.ma_xuat_kho_xac_nhan) return c.json({ error: "MA_XUAT_KHO_CHUA_XAC_NHAN" }, 409);
    const coDong = await c.env.DB.prepare("SELECT 1 FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ? LIMIT 1").bind(id).first();
    if (!coDong) return c.json({ error: "PHIEU_TRONG" }, 409);
    if (pxk.so_tien_can_chuyen != null && pxk.trang_thai_chuyen_tien !== "TN da duyet") return c.json({ error: "MISSING_CHUYEN_TIEN_APPROVED" }, 409);

    // CHOT 2026-08-14: chan cung neu co dong nao qua han "Ly do cham" (24h tu luc "Cho TN duyet",
    // cong T7/CN neu co - xem lib/hanLyDoCham.ts) ma van chua duoc TN giai trinh - bat buoc TN giai
    // trinh (qua POST /don-hang/:id/giai-trinh ben datMuaLinhKien.ts) truoc khi day don len ke toan.
    // SUA (phan hoi QA 2026-08-31, muc #5): moc tinh han GIO LA lan giai trinh GAN NHAT (migration
    // 0014) neu co, khong con "khoa vinh vien" sau lan giai trinh dau tien.
    const { results: dongTrongPxk } = await c.env.DB.prepare(
      `SELECT ddh.id,
         (SELECT ngay_xu_ly FROM dat_don_hang_log WHERE dat_don_hang_id = ddh.id AND trang_thai = 'Cho TN duyet' ORDER BY id DESC LIMIT 1) as cho_tn_duyet_at,
         (SELECT MAX(ngay_tao) FROM dat_don_hang_giai_trinh WHERE dat_don_hang_id = ddh.id) as last_giai_trinh_at
       FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
       WHERE pxkd.phieu_xuat_kho_id = ?`,
    )
      .bind(id)
      .all<{ id: string; cho_tn_duyet_at: string | null; last_giai_trinh_at: string | null }>();

    const now = nowVN();
    const quaHanIds = (dongTrongPxk as { id: string; cho_tn_duyet_at: string | null; last_giai_trinh_at: string | null }[])
      .filter((d) => {
        const mocThoiGian = mocTinhHanTn(d.last_giai_trinh_at, d.cho_tn_duyet_at);
        return !!mocThoiGian && quaHanLyDoCham(mocThoiGian, now);
      })
      .map((d) => d.id);
    if (quaHanIds.length > 0) return c.json({ error: "THIEU_LY_DO_CHAM", ids: quaHanIds }, 409);
  } else if (target === "Ke toan huy") {
    if (hienTai !== "Dang tao phieu" && hienTai !== "Cho ke toan") return c.json({ error: "INVALID_STATE" }, 409);
    if (!canKeToan(c) && !canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    // FIX (phan hoi 2026-08-25, hang muc #19): bat buoc ghi_chu khi huy PXK - truoc day khong bat
    // buoc gi.
    if (!body.ghi_chu?.trim()) return c.json({ error: "MISSING_GHI_CHU" }, 400);
    // MOI (2026-09-22, phan hoi "bổ sung việc cho hủy PXK bị lỗi hoặc không còn nhu cầu đặt hàng
    // nữa"): truoc day huy PXK KHONG dung gi toi cac don dang gom ben trong - dat_don_hang.ma_xuat_kho
    // van tro toi PXK da chet, khong bao gio quay lai duoc GET /don-hang-kha-dung (loc ma_xuat_kho IS
    // NULL) - don bi mac ket vinh vien. Bat buoc chon ro 1 trong 2 huong xu ly (xem khoi xu ly sau CAS
    // ben duoi): "loi" (giai phong don ve kha dung) hoac "khong_con_nhu_cau" (huy han don).
    if (body.ly_do_huy_pxk !== "loi" && body.ly_do_huy_pxk !== "khong_con_nhu_cau") {
      return c.json({ error: "MISSING_LY_DO_HUY_PXK" }, 400);
    }
  } else if (target === "Da chot xong don xuat") {
    if (hienTai !== "Cho ke toan") return c.json({ error: "INVALID_STATE" }, 409);
    if (!canKeToan(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    if (!pxk.ma_misa?.trim()) return c.json({ error: "MISSING_MA_MISA" }, 409);
  } else if (target === "Dang gui KTV" || target === "Hang tru kho") {
    if (hienTai !== "Da chot xong don xuat") return c.json({ error: "INVALID_STATE" }, 409);
    if (!canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  } else if (target === "KTV da nhan") {
    if (hienTai !== "Dang gui KTV") return c.json({ error: "INVALID_STATE" }, 409);
    // CHOT 2026-08-15 (Dot 2, muc F): bat buoc DUNG nguoi nhan hang xac nhan (hoac Admin) - truoc day
    // bat ky ai cung xac nhan duoc.
    if (user.email !== pxk.nguoi_nhan_hang && user.vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  } else if (target === "Kho da ket thuc") {
    if (hienTai !== "Dang gui KTV") return c.json({ error: "INVALID_STATE" }, 409);
    if (!canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  } else if (target === "Kho da nhan hang tra") {
    // SUA (migration 0002_tra_hang_pxk.sql): buoc CUOI rieng cho PXK tra hang (Kho xac nhan da nhan
    // hang VE kho) - thay the cho cap "Dang gui KTV"/"KTV da nhan" cua chieu xuat hang thuong, xem
    // giai thich o comment dau file.
    if (hienTai !== "Da chot xong don xuat") return c.json({ error: "INVALID_STATE" }, 409);
    if (pxk.loai_don !== "tra_hang") return c.json({ error: "INVALID_TRANG_THAI" }, 400);
    if (!canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  } else {
    return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  }

  // RA SOAT BAO MAT 2026-08-18 (phan hoi Codex #8, migration 0087) - CAS giong applyDonHangLog, xem
  // comment o do.
  const casResult = await c.env.DB.prepare(
    "UPDATE phieu_xuat_kho SET trang_thai_hien_tai = ?, version = version + 1 WHERE id = ? AND version = ?",
  )
    .bind(target, id, pxk.version)
    .run();
  if (!casResult.meta.changes) return c.json({ error: "STATE_CHANGED" }, 409);

  await c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(id, target, user.email, nowVN(), body.ghi_chu?.trim() || null)
    .run();

  // MOI (2026-09-22): huy PXK xong thi xu ly tiep cac don dang gom ben trong, theo dung ly_do_huy_pxk
  // da validate o tren - xem giai thich day du o nhanh "Ke toan huy" phia tren.
  if (target === "Ke toan huy") {
    const { results: dongRows } = await c.env.DB.prepare(
      "SELECT dat_don_hang_id FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?",
    )
      .bind(id)
      .all<{ dat_don_hang_id: string }>();
    const donIds = dongRows.map((r) => r.dat_don_hang_id);

    if (donIds.length > 0) {
      const nowHuy = nowVN();
      if (body.ly_do_huy_pxk === "loi") {
        // Giai phong don ve lai "kha dung" - GIU NGUYEN trang_thai_hien_tai ("TN da duyet"), chi xoa
        // lien ket voi PXK da huy (dung 2 buoc y het DELETE /:id/dong/:donHangId da co o tren).
        await c.env.DB.batch([
          c.env.DB.prepare("DELETE FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = ?").bind(id),
          ...donIds.flatMap((donId) => [
            c.env.DB.prepare("UPDATE dat_don_hang SET ma_xuat_kho = NULL, updated_at = ? WHERE id = ?").bind(nowHuy, donId),
            xoaLoaiChietKhauTuDong(c.env.DB, donId),
          ]),
        ]);
      } else {
        // Khong con nhu cau - huy han cac don. KHONG qua applyDonHangLog (datMuaLinhKien.ts) vi route
        // do da khoa DONG_DA_DONG cho don dang "TN da duyet" (dieu kien bat buoc de duoc gom vao PXK
        // tu dau) - tu lam CAS UPDATE + log truc tiep o day, dich luon la "Da huy" co dinh.
        await c.env.DB.batch([
          ...donIds.flatMap((donId) => [
            c.env.DB.prepare("UPDATE dat_don_hang SET trang_thai_hien_tai = 'Da huy', version = version + 1, updated_at = ? WHERE id = ?").bind(nowHuy, donId),
            c.env.DB.prepare("INSERT INTO dat_don_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Da huy', ?, ?, ?)").bind(
              donId, user.email, nowHuy, `Huỷ theo phiếu xuất kho ${id}: ${body.ghi_chu!.trim()}`,
            ),
          ]),
        ]);
      }
      // Don duoc giai phong (thanh "chua vao PXK") hoac bi huy -> tong ngay/loai chiet khau cua KTV doi.
      await taiTinhPxkMoCuaKtv(c.env.DB, pxk.nguoi_nhan_hang, user.email, id);
    }
  }

  // Bao NGUOC cho khovan khi 1 buoc Kho duoc xac nhan THANG tren linh-kien-app qua link (them
  // 2026-09-09, phan hoi "khi xác nhận bên hệ thống linh kiện xong => tự bắn api trạng thái mới về
  // cho app khovan") - route nay la duong session (Google OAuth) DUY NHAT xu ly 4 trang thai Kho nay,
  // khac han routes/partnerKho.ts (khovan tu goi vao, khong can bao nguoc vi chinh no la nguon). Best-
  // effort, khong chan thao tac cua Kho neu khovan dang loi/down.
  if (target === "Dang gui KTV" || target === "Hang tru kho" || target === "Kho da ket thuc" || target === "Kho da nhan hang tra") {
    c.executionCtx.waitUntil(notifyPxkAdvancedViaApp(c.env, id, `Đã xác nhận "${target}" trực tiếp trên hệ thống Đặt mua linh kiện`));
  }

  // "Da chot xong don xuat" la moc "san sang cho Kho xu ly" (nguyen tac "Kho chi thao
  // tac qua app kho van", chot 2026-09-07) - day "cho xu ly" sang khovan O DAY, ap dung
  // CA loai_don thuong (mua/cong_no) LAN 'tra_hang' (xem lib/khovanPushClient.ts).
  if (target === "Da chot xong don xuat") {
    // Luong C moi (chot 08/09/2026, xem Artifact "Ma tran luong Kho van"): neu PXK nay gom cac
    // dong tra_hang DA ve kho that qua ma "TRA-" (Kho da nhan vat ly, QC da kiem xong - xem
    // routes/traHang.ts), day CHI la thu tuc ke toan/MISA cho lo hang DA co san tai kho - KHONG
    // duoc day 1 luot "cho nhan" MOI sang khovan (se tao hieu lam co 1 lo hang thu 2 dang tren
    // duong ve, trong khi thuc te khong co lan vat ly thu 2 nao - da thong nhat voi nguoi dung
    // 2026-09-08). Thay vao do, tu dong xac nhan "Kho da nhan hang tra" ngay, khong qua khovan.
    let daNhanQuaTraHangBox = false;
    if (pxk.loai_don === "tra_hang") {
      const rows = await c.env.DB.prepare(
        `SELECT COUNT(*) as total, SUM(CASE WHEN ddh.ma_thung_tra IS NOT NULL THEN 1 ELSE 0 END) as with_box
         FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
         WHERE pxkd.phieu_xuat_kho_id = ?`,
      )
        .bind(id)
        .first<{ total: number; with_box: number }>();
      daNhanQuaTraHangBox = !!rows && rows.total > 0 && rows.with_box === rows.total;
    }

    if (daNhanQuaTraHangBox) {
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE phieu_xuat_kho SET trang_thai_hien_tai = 'Kho da nhan hang tra' WHERE id = ?").bind(id),
        c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
          id, "Kho da nhan hang tra", user.email, nowVN(), "Tự động — hàng đã về kho qua mã trả hàng (TRA-), không cần Kho xác nhận lại",
        ),
      ]);
    } else {
      // Hien thi ben khovan phai dung ma MISA (nguoi dung nhap, doi chieu ke toan) - KHONG
      // dung `id` (chi la ID tu sinh de quan ly noi bo, khong co nghia gi voi Ke toan/Kho).
      const displayCode = pxk.ma_misa?.trim() || id;
      const senderLabel = `Xuất kho ${displayCode}` + (pxk.nguoi_nhan_hang ? ` (giao ${pxk.nguoi_nhan_hang})` : "");
      const note = pxk.loai_don === "tra_hang" ? "Trả hàng - chờ Kho xác nhận nhận hàng" : "Xuất kho - chờ Kho gửi/hàng trữ kho";
      await pushPxkToKhovan(c.env, id, senderLabel, pxk.loai_don, note, pxk.ma_misa, buildWorkUrl(c.env, id));
    }
  }

  // Bao "viec moi" cho vai tro SAP xu ly buoc tiep theo (phan hoi 2026-09-05) - PXK khong co
  // email_gs rieng, suy tu cac dat_don_hang da gop vao (xem emailGsListForPxk).
  if (target === "Cho ke toan" || target === "Da chot xong don xuat") {
    const role = target === "Cho ke toan" ? "la_ke_toan" : "la_kho";
    const body_ = target === "Cho ke toan" ? `PXK ${id} đang chờ bạn chốt kế toán` : `PXK ${id} đã chốt kế toán, chờ bạn xử lý`;
    c.executionCtx.waitUntil(
      (async () => {
        const emailGsList = await emailGsListForPxk(c.env.DB, id);
        const [cat1Emails, pastActors] = await Promise.all([
          emailsForRoleOrQC(c.env.DB, role, emailGsList),
          pastActorsFor(c.env.DB, "phieu_xuat_kho_log", "phieu_xuat_kho_id", id, user.email),
        ]);
        await notifyWorkflowTask(c.env, c.env.DB, {
          cat1Emails,
          otherRoles: PXK_ROLES.filter((r) => r !== role),
          emailGsList,
          pastActors,
          title: "Phiếu xuất kho",
          body: body_,
          linkType: "phieu_xuat_kho",
          linkId: id,
        });
      })(),
    );
  }

  // Muc E (Dot 2): Kho tach rieng "Ma van don" khoi ghi_chu chung, chi ap dung luc chuyen "Dang gui KTV".
  if (target === "Dang gui KTV" && body.ma_van_don?.trim()) {
    await c.env.DB.prepare("UPDATE phieu_xuat_kho SET ma_van_don = ? WHERE id = ?").bind(body.ma_van_don.trim(), id).run();
  }

  // Thong bao "chung" cho KTV nhan hang (phan hoi 2026-08-26) - 2 moc PXK dang tien trien ma KTV quan
  // tam: Ke toan xu ly xong (sap toi luot Kho gui hang) va Kho da thuc su gui di. Bo qua neu nguoi
  // vua thao tac CHINH LA KTV nhan hang do (hiem, nhung tranh tu bao chinh minh).
  if ((target === "Da chot xong don xuat" || target === "Dang gui KTV") && pxk.nguoi_nhan_hang && pxk.nguoi_nhan_hang !== user.email) {
    const noiDung =
      target === "Da chot xong don xuat"
        ? `Phiếu xuất kho ${id} của bạn đã được Kế toán duyệt xong`
        : `Phiếu xuất kho ${id} của bạn đã được Kho gửi hàng`;
    c.executionCtx.waitUntil(
      (async () => {
        await c.env.DB.prepare(
          "INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, ?, ?, 'phieu_xuat_kho', ?, ?)",
        )
          .bind(pxk.nguoi_nhan_hang, target === "Da chot xong don xuat" ? "pxk_da_duyet" : "kho_da_gui", noiDung, id, nowVN())
          .run();
        // Day Web Push ngay (phan hoi 2026-08-26) - xem lib/webPush.ts.
        await sendPushToUser(c.env, pxk.nguoi_nhan_hang!, { title: "Phiếu xuất kho", body: noiDung, url: "/" });
      })(),
    );
  }

  // Auto-claim khu vuc phu trach (muc F) - chi khi nguoi xu ly THUC SU la Kho/Ke toan (khong tinh
  // Admin/TN dung quyen "canTacNghiep" bypass o nhanh "Ke toan huy"). 1 PXK co the gom dong tu nhieu
  // phieu_dat khac nhau (nguoi nhan hang khac nhau) - auto-claim TUNG email_gs lien quan.
  if (user.la_kho || user.la_ke_toan) {
    const { results: gsRows } = await c.env.DB.prepare(
      `SELECT DISTINCT ddh.email_gs FROM phieu_xuat_kho_dong pxkd
         JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
       WHERE pxkd.phieu_xuat_kho_id = ? AND ddh.email_gs IS NOT NULL`,
    )
      .bind(id)
      .all<{ email_gs: string }>();
    c.executionCtx.waitUntil(
      Promise.all((gsRows as { email_gs: string }[]).map((r) => autoClaimGs(c.env.DB, user.email, r.email_gs))).then(() => undefined),
    );
  }

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true });
});

export default phieuXuatKho;
