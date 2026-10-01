import { boDau } from "./timTheoTen";
import { nowVN } from "./vnTime";
import { computeAndStoreHash } from "./contentHash";

// Tu dong TAO KTV + DUYET tai khoan tu danh ba ETX nhan su (chot nguoi dung 2026-09-29: "tự động duyệt các tài khoản
// từ ETX nhân sự với chức danh có chứa CTV, KTV, Kỹ thuật viên => nếu còn đang làm việc => nếu chưa kích hoạt tài khoản
// KTV duyệt tên mã KTV thành (Mã NV) Chức danh - Họ tên"). Chay SAU moi lan dong bo ETX (cron hang tuan + nut "Đồng bộ
// ngay"), TAO SAN cho moi nguoi du dieu kien (lua chon cua nguoi dung, thay vi chi khi ho dang nhap).
//
// Dieu kien: trang_thai_lam_viec = 'on' + chuc_danh chua CTV / KTV / Kỹ thuật viên (khong dau, khong phan biet hoa
// thuong) + co Gmail hop le. BO QUA (khong dong cham) neu: Gmail da la "Email đăng nhập" cua 1 KTV trong danh ba (da kich
// hoat), Ma NV da la ma_ktv cua KTV khac, hoac Gmail da co tai khoan "Da duyet"/"Tu choi" (vd nhan vien van phong - khong
// tu doi thanh KTV). Voi nguoi con lai:
//   - ktv_lien_he: ma_ktv = Ma NV, ten_hien_thi = "(Ma NV) Chuc danh - Ho ten", vai_tro_ktv = KTV neu chuc danh co
//     KTV/Kỹ thuật viên, con lai CTV; khu vuc de trong (Admin gan sau, don ve "Chưa có khu vực").
//   - users: tao moi hoac chuyen "Cho duyet" -> "Da duyet" + la_ktv_dvbh = 1 (dang nhap la vao duoc ngay).
//   - etx_nhan_su.ma_ktv = Ma NV (neu chua lien ket) -> nghi viec (ETX 'off') tu khoa tai khoan theo co che san co.

export interface EtxTuDongKtvResult {
  ktvTuTao: number;
  tkTuDuyet: number;
}

export function laChucDanhKtv(chucDanh: string | null | undefined): "KTV" | "CTV" | null {
  const k = boDau(chucDanh ?? "");
  if (!k) return null;
  if (k.includes("ktv") || k.includes("ky thuat vien")) return "KTV";
  if (k.includes("ctv")) return "CTV";
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHUNK_SIZE = 300;

export async function tuDongTaoKtvTuEtx(db: D1Database): Promise<EtxTuDongKtvResult> {
  const [{ results: etx }, { results: ktv }, { results: users }] = await Promise.all([
    db
      .prepare("SELECT ma_nhan_su, ho_ten, chuc_danh, gmail FROM etx_nhan_su WHERE trang_thai_lam_viec = 'on' AND gmail IS NOT NULL AND TRIM(gmail) != '' ORDER BY ma_nhan_su")
      .all<{ ma_nhan_su: string; ho_ten: string; chuc_danh: string | null; gmail: string }>(),
    db.prepare("SELECT ma_ktv, email_dang_nhap FROM ktv_lien_he").all<{ ma_ktv: string; email_dang_nhap: string | null }>(),
    db.prepare("SELECT email, trang_thai_duyet FROM users").all<{ email: string; trang_thai_duyet: string }>(),
  ]);
  const emailKtv = new Set(ktv.map((r) => (r.email_dang_nhap ?? "").trim().toLowerCase()).filter(Boolean));
  const maKtv = new Set(ktv.map((r) => r.ma_ktv.trim().toUpperCase()));
  const trangThaiUser = new Map(users.map((u) => [u.email.trim().toLowerCase(), u.trang_thai_duyet]));

  const now = nowVN();
  const stmts: D1PreparedStatement[] = [];
  let ktvTuTao = 0;
  let tkTuDuyet = 0;
  const daXuLy = new Set<string>();

  for (const r of etx) {
    const vaiTro = laChucDanhKtv(r.chuc_danh);
    if (!vaiTro) continue;
    const email = r.gmail.trim().toLowerCase();
    const ma = r.ma_nhan_su.trim();
    if (!EMAIL_RE.test(email) || !ma) continue;
    if (emailKtv.has(email) || maKtv.has(ma.toUpperCase()) || daXuLy.has(email)) continue;
    const tt = trangThaiUser.get(email);
    if (tt && tt !== "Cho duyet") continue;
    daXuLy.add(email);

    const hoTen = r.ho_ten.trim();
    const tenHienThi = `(${ma}) ${(r.chuc_danh ?? "").trim()} - ${hoTen}`;
    stmts.push(
      db
        .prepare(
          `INSERT INTO users (email, ten, trang_thai_duyet, la_ktv_dvbh, la_ve_tinh)
           VALUES (?, ?, 'Da duyet', 1, 0)
           ON CONFLICT(email) DO UPDATE SET trang_thai_duyet = 'Da duyet', la_ktv_dvbh = 1, la_ve_tinh = 0, updated_at = ?
           WHERE users.trang_thai_duyet = 'Cho duyet'`,
        )
        .bind(email, hoTen, now),
      db
        .prepare("INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, gmail, vai_tro_ktv, email_dang_nhap, ngay_cap_nhat) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(ma, tenHienThi, r.gmail.trim(), vaiTro, email, now),
      db.prepare("UPDATE etx_nhan_su SET ma_ktv = ?, updated_at = ? WHERE ma_nhan_su = ? AND ma_ktv IS NULL").bind(ma, now, r.ma_nhan_su),
    );
    ktvTuTao++;
    if (tt === "Cho duyet") tkTuDuyet++;
  }

  for (let i = 0; i < stmts.length; i += CHUNK_SIZE) await db.batch(stmts.slice(i, i + CHUNK_SIZE));

  if (ktvTuTao > 0) {
    // Cung buoc voi moi luong ghi danh ba khac (settingsKtv.ts refreshHash) - hash doi thi cron dong bo danh ba sang
    // he DVBH goc nhan ban moi.
    const { results } = await db.prepare("SELECT * FROM ktv_lien_he ORDER BY ma_ktv").all();
    await computeAndStoreHash(db, "ktv_lien_he", results);
  }
  return { ktvTuTao, tkTuDuyet };
}

// TAO TAI KHOAN DAT HANG THU CONG cho 1 nhan su ETX (2026-10-01, nut "Tạo tài khoản" o Quan ly nguoi dung > ETX nhan su):
// cung ket qua voi buoc tu dong o tren (KTV ma = Ma NV + users "Da duyet"/la_ktv_dvbh) nhung KHONG doi chuc danh co CTV/KTV
// (Admin tu quyet) - chuc danh khong nhan ra thi vai tro KTV. Gmail da la Email dang nhap cua KTV -> chi lien ket + duyet.
// Ma NV da la ma_ktv cua KTV khac: KTV do chua co email dang nhap thi gan Gmail vao, co email khac -> MA_KTV_CUA_NGUOI_KHAC.
export type TaoTaiKhoanEtxLoi = "NOT_FOUND" | "DA_NGHI" | "THIEU_GMAIL" | "MA_KTV_CUA_NGUOI_KHAC";

export async function taoTaiKhoanTuEtx(db: D1Database, maNhanSu: string): Promise<{ ok: true; ma_ktv: string; email: string } | { ok: false; error: TaoTaiKhoanEtxLoi }> {
  const r = await db
    .prepare("SELECT ma_nhan_su, ho_ten, chuc_danh, gmail, trang_thai_lam_viec, ma_ktv FROM etx_nhan_su WHERE ma_nhan_su = ?")
    .bind(maNhanSu)
    .first<{ ma_nhan_su: string; ho_ten: string; chuc_danh: string | null; gmail: string | null; trang_thai_lam_viec: string; ma_ktv: string | null }>();
  if (!r) return { ok: false, error: "NOT_FOUND" };
  if (r.trang_thai_lam_viec !== "on") return { ok: false, error: "DA_NGHI" };
  const email = (r.gmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "THIEU_GMAIL" };
  const ma = r.ma_nhan_su.trim();
  const now = nowVN();

  const [ktvTheoEmail, ktvTheoMa] = await Promise.all([
    db.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE LOWER(TRIM(email_dang_nhap)) = ? LIMIT 1").bind(email).first<{ ma_ktv: string }>(),
    db.prepare("SELECT ma_ktv, email_dang_nhap FROM ktv_lien_he WHERE UPPER(TRIM(ma_ktv)) = ? LIMIT 1").bind(ma.toUpperCase()).first<{ ma_ktv: string; email_dang_nhap: string | null }>(),
  ]);

  const stmts: D1PreparedStatement[] = [];
  let maKtv: string;
  let doiDanhBa = false;
  if (ktvTheoEmail) {
    maKtv = ktvTheoEmail.ma_ktv;
  } else if (ktvTheoMa) {
    const emailCu = (ktvTheoMa.email_dang_nhap ?? "").trim().toLowerCase();
    if (emailCu && emailCu !== email) return { ok: false, error: "MA_KTV_CUA_NGUOI_KHAC" };
    maKtv = ktvTheoMa.ma_ktv;
    stmts.push(db.prepare("UPDATE ktv_lien_he SET email_dang_nhap = ?, ngay_cap_nhat = ? WHERE ma_ktv = ?").bind(email, now, maKtv));
    doiDanhBa = true;
  } else {
    maKtv = ma;
    const tenHienThi = `(${ma}) ${(r.chuc_danh ?? "").trim()} - ${r.ho_ten.trim()}`;
    stmts.push(
      db
        .prepare("INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, gmail, vai_tro_ktv, email_dang_nhap, ngay_cap_nhat) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(ma, tenHienThi, (r.gmail ?? "").trim(), laChucDanhKtv(r.chuc_danh) ?? "KTV", email, now),
    );
    doiDanhBa = true;
  }
  stmts.push(
    db
      .prepare(
        `INSERT INTO users (email, ten, trang_thai_duyet, la_ktv_dvbh, la_ve_tinh)
         VALUES (?, ?, 'Da duyet', 1, 0)
         ON CONFLICT(email) DO UPDATE SET trang_thai_duyet = 'Da duyet', la_ktv_dvbh = 1, bi_khoa = 0, updated_at = ?`,
      )
      .bind(email, r.ho_ten.trim(), now),
    db.prepare("UPDATE etx_nhan_su SET ma_ktv = ?, updated_at = ? WHERE ma_nhan_su = ? AND (ma_ktv IS NULL OR ma_ktv = '')").bind(maKtv, now, r.ma_nhan_su),
  );
  await db.batch(stmts);

  if (doiDanhBa) {
    const { results } = await db.prepare("SELECT * FROM ktv_lien_he ORDER BY ma_ktv").all();
    await computeAndStoreHash(db, "ktv_lien_he", results);
  }
  return { ok: true, ma_ktv: maKtv, email };
}
