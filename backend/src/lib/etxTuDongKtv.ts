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
