import { nowVN } from "./vnTime";
import { nextSequentialId } from "./idCounter";
import { bumpVersions } from "./dataVersions";

// ======================= DON "SỬA CHỮA TẠI KHO" (2026-11-12, v1.478, migration 0116) =======================
// App Sua chua bao hanh (suachua) gui sang moi khi 1 de xuat cap linh kien (DX-xxxxxx) da duoc Ke toan xac nhan / Kho in / Kho xuat
// (POST /api/suachua-partner/cap-lk). 1 DX = 1 phieu_dat (ma SK-xxxxxx) + 1 dat_don_hang (DDH-xxxxxx) CHI XEM:
//  - loai_de_xuat "SỬA CHỮA TẠI KHO" (KHONG co trong settings_loai_de_xuat -> khong ai chon duoc khi tao don), loai_don 'cong_no',
//    gia NULL (khong phat sinh tien), khu vuc NULL (khong tru ton kho cong ty - ton MISA import da tinh phieu xuat that).
//  - Trang thai rieng 'SC cho kho in' / 'SC kho da in' / 'SC kho da xuat' / 'Da huy' -> khong bi tu gom PXK, khong dem viec TN.
//  - Khoa cung bang trigger DB (migration 0116): moi UPDATE/DELETE cua code khac bi bo qua; chi ham nay tang ngoai_rev.
//  - Nguoi tao = nguoi nhan = NV sua chua cua don vi bao hanh (cung Gmail 2 he). Chua co tai khoan ben nay -> tao dong users
//    'Cho duyet' toi thieu (FK) - dang nhap lan dau van theo luong duyet binh thuong.
//  - Ma LK chua co trong danh muc -> tu them, danh dau chi_sua_chua = 1 ("set ở phân loại sửa chữa only").
//  - Chong trung: ban tin co cap_nhat_luc (updated_at ben suachua) <= ban da ap dung -> bo qua; nhat ky dat_don_ngoai_log co
//    UNIQUE (don, su_kien) -> gui lai cung ban tin khong ghi them dong nao.

export const LOAI_DE_XUAT_SUA_CHUA_KHO = "SỬA CHỮA TẠI KHO";
export const TRANG_THAI_SC = ["SC cho kho in", "SC kho da in", "SC kho da xuat"] as const;

export interface CapLkItem {
  nguon_id?: string;
  cap_nhat_luc?: string;
  trang_thai?: string; // trang thai de xuat ben suachua: da_cap | huy | tu_choi | ...
  kho_tt?: string | null; // cho_in | da_in | da_xuat
  ma_lk?: string;
  ten_lk?: string | null;
  phan_loai?: string | null;
  so_luong?: number;
  ma_misa?: string | null;
  ma_don_hang?: string | null;
  ghi_chu?: string | null;
  case_id?: string | null;
  don_vi_id?: string | null;
  don_cha_id?: string | null;
  ktv_email?: string | null;
  ktv_ten?: string | null;
  nv_email?: string | null;
  nv_ten?: string | null;
  mien?: string | null;
  nguoi_de_xuat?: string | null;
  nguoi_de_xuat_ten?: string | null;
  de_xuat_luc?: string | null;
  kt_boi?: string | null;
  kt_ten?: string | null;
  kt_luc?: string | null;
  kho_in_boi?: string | null;
  kho_in_ten?: string | null;
  kho_in_luc?: string | null;
  kho_xuat_boi?: string | null;
  kho_xuat_ten?: string | null;
  kho_xuat_luc?: string | null;
}

export interface CapLkKetQua {
  nguon_id: string;
  ddh_id?: string;
  ok: boolean;
  bo_qua?: boolean;
  loi?: string;
}

const s = (v: unknown, n = 500): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

export function trangThaiSc(it: CapLkItem): string {
  if (it.trang_thai !== "da_cap") return "Da huy";
  if (it.kho_tt === "da_xuat") return "SC kho da xuat";
  if (it.kho_tt === "da_in") return "SC kho da in";
  return "SC cho kho in";
}

type LogEv = { su_kien: string; trang_thai: string; nguoi: string | null; ten: string | null; luc: string; ghi_chu: string | null };

function suKien(it: CapLkItem, tt: string, cu: { trang_thai: string | null; ma_misa: string | null } | null): LogEv[] {
  const capNhat = s(it.cap_nhat_luc, 40)!;
  const ev: LogEv[] = [];
  const misa = s(it.ma_misa, 100);
  if (it.de_xuat_luc)
    ev.push({
      su_kien: "de_xuat", trang_thai: "SC de xuat", nguoi: s(it.nguoi_de_xuat, 200), ten: s(it.nguoi_de_xuat_ten, 200), luc: it.de_xuat_luc,
      ghi_chu: `Đề xuất ${it.nguon_id} cho đơn bảo hành ${it.don_vi_id ?? "?"}${it.case_id ? ` · case ${it.case_id}` : ""}${it.ghi_chu ? ` · ${it.ghi_chu}` : ""}`,
    });
  if (it.kt_luc)
    ev.push({
      su_kien: `kt:${it.kt_luc}`, trang_thai: "SC cho kho in", nguoi: s(it.kt_boi, 200), ten: s(it.kt_ten, 200), luc: it.kt_luc,
      ghi_chu: `Kế toán xác nhận cấp linh kiện${misa ? ` · mã PXK MISA ${misa}` : ""}${it.ma_don_hang ? ` · mã đơn hàng ${it.ma_don_hang}` : ""}`,
    });
  if (cu && (cu.ma_misa ?? "") !== (misa ?? ""))
    ev.push({
      su_kien: `misa:${misa ?? ""}:${capNhat}`, trang_thai: tt, nguoi: s(it.kt_boi, 200), ten: s(it.kt_ten, 200), luc: capNhat,
      ghi_chu: `Đổi mã PXK MISA: ${cu.ma_misa ?? "—"} → ${misa ?? "—"}`,
    });
  if (it.kho_in_luc)
    ev.push({ su_kien: `in:${it.kho_in_luc}`, trang_thai: "SC kho da in", nguoi: s(it.kho_in_boi, 200), ten: s(it.kho_in_ten, 200), luc: it.kho_in_luc, ghi_chu: "Kho đã in phiếu" });
  if (cu?.trang_thai === "SC kho da in" && tt === "SC cho kho in")
    ev.push({ su_kien: `chua_in:${capNhat}`, trang_thai: "SC cho kho in", nguoi: null, ten: null, luc: capNhat, ghi_chu: "Kho chuyển về: chờ in phiếu" });
  if (it.kho_xuat_luc)
    ev.push({ su_kien: `xuat:${it.kho_xuat_luc}`, trang_thai: "SC kho da xuat", nguoi: s(it.kho_xuat_boi, 200), ten: s(it.kho_xuat_ten, 200), luc: it.kho_xuat_luc, ghi_chu: `Kho đã xuất linh kiện × ${it.so_luong}` });
  if (tt === "Da huy" && cu?.trang_thai !== "Da huy")
    ev.push({ su_kien: `huy:${capNhat}`, trang_thai: "Da huy", nguoi: null, ten: null, luc: capNhat, ghi_chu: `Đề xuất bên app Sửa chữa không còn hiệu lực (${it.trang_thai ?? "?"})` });
  return ev;
}

export async function apDungCapLk(db: D1Database, items: CapLkItem[]): Promise<CapLkKetQua[]> {
  const kq: CapLkKetQua[] = [];
  let coDoi = false;
  for (const it of items) {
    const nguonId = s(it.nguon_id, 40);
    if (!nguonId) {
      kq.push({ nguon_id: "", ok: false, loi: "THIEU_NGUON_ID" });
      continue;
    }
    try {
      const r = await apDungMot(db, { ...it, nguon_id: nguonId });
      if (!r.bo_qua) coDoi = true;
      kq.push(r);
    } catch (e) {
      kq.push({ nguon_id: nguonId, ok: false, loi: String((e as Error)?.message ?? e).slice(0, 300) });
    }
  }
  if (coDoi) await bumpVersions(db, ["dat_mua_lk"]);
  return kq;
}

async function apDungMot(db: D1Database, it: CapLkItem & { nguon_id: string }): Promise<CapLkKetQua> {
  const nguonId = it.nguon_id;
  const capNhat = s(it.cap_nhat_luc, 40);
  const maLk = s(it.ma_lk, 100);
  const soLuong = Number(it.so_luong);
  const email = (s(it.nv_email, 200) ?? s(it.nguoi_de_xuat, 200))?.toLowerCase() ?? null;
  if (!capNhat || !maLk || !Number.isInteger(soLuong) || soLuong <= 0 || !email) return { nguon_id: nguonId, ok: false, loi: "INVALID_ITEM" };

  const tt = trangThaiSc(it);
  const misa = s(it.ma_misa, 100);
  const now = nowVN();
  const info = JSON.stringify({
    don_vi_id: it.don_vi_id ?? null, don_cha_id: it.don_cha_id ?? null, ktv_email: it.ktv_email ?? null, ktv_ten: it.ktv_ten ?? null,
    nv_email: email, nv_ten: it.nv_ten ?? null, mien: it.mien ?? null, ma_don_hang: it.ma_don_hang ?? null, phan_loai: it.phan_loai ?? null,
    trang_thai_goc: it.trang_thai ?? null, kho_tt: it.kho_tt ?? null,
  });

  let cu = await db
    .prepare("SELECT id, trang_thai_hien_tai, ma_misa, ngoai_cap_nhat FROM dat_don_hang WHERE nguon_ngoai = 'suachua' AND nguon_ngoai_id = ?")
    .bind(nguonId)
    .first<{ id: string; trang_thai_hien_tai: string | null; ma_misa: string | null; ngoai_cap_nhat: string | null }>();
  if (cu && cu.ngoai_cap_nhat && cu.ngoai_cap_nhat >= capNhat) return { nguon_id: nguonId, ddh_id: cu.id, ok: true, bo_qua: true };

  if (!cu) {
    // Tai khoan NV + linh kien (FK). INSERT OR IGNORE: da co thi giu nguyen.
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO users (email, ten) VALUES (?, ?)").bind(email, s(it.nv_ten, 200)),
      db
        .prepare(
          `INSERT OR IGNORE INTO linh_kien (ma_linh_kien, ten_linh_kien, don_vi, chi_sua_chua, ghi_chu, ngay_cap_nhat)
           VALUES (?, ?, ?, 1, 'Tự thêm từ app Sửa chữa bảo hành (đơn sửa chữa tại kho)', ?)`,
        )
        .bind(maLk, s(it.ten_lk, 300) ?? maLk, s(it.phan_loai, 100), now),
    ]);
    const lk = await db.prepare("SELECT ten_linh_kien FROM linh_kien WHERE ma_linh_kien = ?").bind(maLk).first<{ ten_linh_kien: string }>();
    const phieuId = await nextSequentialId(db, "phieu_dat", "SK", 6);
    const ddhId = await nextSequentialId(db, "dat_don_hang", "DDH", 6);
    const ngayTao = s(it.kt_luc, 40) ?? s(it.de_xuat_luc, 40) ?? now;
    const ghiChu =
      `[Sửa chữa tại kho] ${nguonId} · Đơn BH ${it.don_vi_id ?? "?"}` +
      (it.ktv_ten || it.ktv_email ? ` · KTV gửi: ${it.ktv_ten ?? it.ktv_email}` : "") +
      (it.ghi_chu ? ` · ${String(it.ghi_chu).slice(0, 400)}` : "");
    const caseId = s(it.case_id, 50)?.toUpperCase() ?? null;
    try {
      await db.batch([
        db
          .prepare("INSERT INTO phieu_dat (id, nguoi_tao, ngay_tao, ghi_chu, updated_at, nguoi_nhan_hang, nguon_ngoai) VALUES (?, ?, ?, ?, ?, ?, 'suachua')")
          .bind(phieuId, email, ngayTao, ghiChu, now, email),
        db
          .prepare(
            `INSERT INTO dat_don_hang (id, phieu_dat_id, loai_don, ma_lk, ten_lk_snapshot, loai_de_xuat, so_luong_de_xuat, so_luong_thuc_xuat,
               ma_misa, nguoi_tao, ngay_tao, updated_at, ghi_chu, ma_yeu_cau_su_co, nguoi_nhan_hang, trang_thai_hien_tai,
               nguon_ngoai, nguon_ngoai_id, ngoai_rev, ngoai_cap_nhat, ngoai_info)
             VALUES (?, ?, 'cong_no', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'suachua', ?, 1, ?, ?)`,
          )
          .bind(
            ddhId, phieuId, maLk, lk?.ten_linh_kien ?? s(it.ten_lk, 300), LOAI_DE_XUAT_SUA_CHUA_KHO, soLuong,
            tt === "SC kho da xuat" ? soLuong : null, misa, email, ngayTao, now, ghiChu, caseId, email, tt, nguonId, capNhat, info,
          ),
        ...(caseId ? [db.prepare("INSERT OR IGNORE INTO dat_don_case (dat_don_hang_id, case_id) VALUES (?, ?)").bind(ddhId, caseId)] : []),
      ]);
      await ghiLog(db, ddhId, suKien(it, tt, null), now);
      return { nguon_id: nguonId, ddh_id: ddhId, ok: true };
    } catch (e) {
      // 2 lan day cung luc (waitUntil + cron) -> lan sau vuong UNIQUE nguon_ngoai -> doc lai don da tao va cap nhat nhu thuong.
      cu = await db
        .prepare("SELECT id, trang_thai_hien_tai, ma_misa, ngoai_cap_nhat FROM dat_don_hang WHERE nguon_ngoai = 'suachua' AND nguon_ngoai_id = ?")
        .bind(nguonId)
        .first();
      if (!cu) throw e;
      if (cu.ngoai_cap_nhat && cu.ngoai_cap_nhat >= capNhat) return { nguon_id: nguonId, ddh_id: cu.id, ok: true, bo_qua: true };
    }
  }

  const res = await db
    .prepare(
      `UPDATE dat_don_hang SET trang_thai_hien_tai = ?, ma_misa = ?, so_luong_de_xuat = ?, so_luong_thuc_xuat = ?, ngoai_info = ?,
         ngoai_cap_nhat = ?, ngoai_rev = ngoai_rev + 1, updated_at = ?, version = version + 1
       WHERE id = ? AND (ngoai_cap_nhat IS NULL OR ngoai_cap_nhat < ?)`,
    )
    .bind(tt, misa, soLuong, tt === "SC kho da xuat" ? soLuong : null, info, capNhat, now, cu!.id, capNhat)
    .run();
  if (!res.meta?.changes) return { nguon_id: nguonId, ddh_id: cu!.id, ok: true, bo_qua: true };
  await ghiLog(db, cu!.id, suKien(it, tt, { trang_thai: cu!.trang_thai_hien_tai, ma_misa: cu!.ma_misa }), now);
  return { nguon_id: nguonId, ddh_id: cu!.id, ok: true };
}

async function ghiLog(db: D1Database, ddhId: string, ev: LogEv[], now: string) {
  if (!ev.length) return;
  await db.batch(
    ev.map((e) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO dat_don_ngoai_log (dat_don_hang_id, su_kien, trang_thai, nguoi_xu_ly, nguoi_xu_ly_ten, ngay_xu_ly, ghi_chu, nhan_luc)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(ddhId, e.su_kien.slice(0, 200), e.trang_thai, e.nguoi, e.ten, e.luc, e.ghi_chu, now),
    ),
  );
}
