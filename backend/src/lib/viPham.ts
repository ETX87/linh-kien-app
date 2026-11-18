/**
 * QUA HAN / GIAI TRINH / GAN THE VI PHAM theo SLA tung buoc (2026-11-17, v1.517, migration 0125).
 *
 * Yeu cau quan ly: "Trả hàng - Các ca quá hạn - giải trình liên quan; Đặt linh kiện - Các ca quá hạn; Các ca bị gắn thẻ vi phạm",
 * "Đặt SLA từng bước", "Bổ sung các ca quá hạn - Giải trình - thiếu giải trình gắn thẻ vi phạm" + chot "đối tác tự kéo, chúng ta cung
 * cấp api là đc" (KHONG day sang he khac - doi tac doc GET /api/partner/v1/vi-pham).
 *
 * Luong 1 vi pham:
 *   thuc the vao buoc (moc_vao) -> qua han (moc_vao + so_gio, T7/CN day sang thu 2) -> dong vi_pham "Cho giai trinh"
 *   -> bo phan giai trinh truoc han_giai_trinh -> "Da giai trinh"  |  het han_giai_trinh -> "Gan the"  |  Admin go -> "Da go the".
 * Thuc the roi buoc (ke ca sau khi da ghi nhan) -> ghi ket_thuc_luc / nguoi_xu_ly / trang_thai_sau (vi pham van giu).
 *
 * Quet (quetViPham) chay moi gio trong cron + nut "Quét ngay" (Admin). Moi lan chi doc:
 *   - thuc the DANG o 1 buoc duoc theo doi (bang chinh, co index trang thai),
 *   - thuc the co log MOI tu lan quet truoc (moc id trong vi_pham_quet - quet theo khoa chinh, khong quet ca bang log),
 * roi doc log cua dung cac thuc the do, gop dong audit cung trang thai -> cac "khoang cho" -> so voi han.
 * Lan dau (chua co moc) chi lay moc hien tai: KHONG ghi nhan nguoc lich su cu.
 *
 * Giai trinh TU DONG (khong bat nhap lai o man vi pham):
 *   - Tra hang: bo phan xu ly qua han da BAT BUOC chon ly do cham (routes/traHang.ts ghi "Chậm quá hạn 24h … - lý do: …" vao log).
 *   - Don cho duyet (tn_duyet): giai trinh ly do cham da co o dat_don_hang_giai_trinh trong khoang cho.
 */
import { nowVN } from "./vnTime";
import type { Env } from "../types";
import { sendPushToUser } from "./webPush";

export type BoPhan = "tbp" | "gs" | "tn" | "kho" | "mua_hang" | "ke_toan" | "qc";
type Nguon = "dat_don_hang_log" | "tra_hang_log" | "thieu_lk_log" | "phieu_xuat_kho_log" | "khoan_chuyen_tien";

export interface BuocViPham {
  ma: string;
  ten: string;
  /** null = theo loai cua phieu (phieu tra hang -> tra_hang). */
  loai: "dat_hang" | "tra_hang" | null;
  nguon: Nguon;
  trangThai: string;
  boPhan: BoPhan;
  doiTuong: "don" | "ticket" | "phieu";
}

// Thu tu = thu tu hien thi. Them buoc: them dong o day + dong seed trong sla_buoc (migration moi).
export const BUOC_VI_PHAM: BuocViPham[] = [
  { ma: "tbp_xac_nhan", ten: "TBP xác nhận LK đặc thù", loai: "dat_hang", nguon: "dat_don_hang_log", trangThai: "Cho TBP xac nhan", boPhan: "tbp", doiTuong: "don" },
  { ma: "gs_duyet", ten: "GS duyệt đơn vượt trần", loai: "dat_hang", nguon: "dat_don_hang_log", trangThai: "Cho GS duyet", boPhan: "gs", doiTuong: "don" },
  { ma: "tn_duyet", ten: "Duyệt đơn (Tác nghiệp)", loai: "dat_hang", nguon: "dat_don_hang_log", trangThai: "Cho TN duyet", boPhan: "tn", doiTuong: "don" },
  { ma: "kho_thieu", ten: "Kho tiếp nhận thiếu hàng", loai: "dat_hang", nguon: "thieu_lk_log", trangThai: "Cho kho xu ly", boPhan: "kho", doiTuong: "ticket" },
  { ma: "mua_hang_dat", ten: "Mua hàng đặt hàng", loai: "dat_hang", nguon: "thieu_lk_log", trangThai: "Cho mua hang", boPhan: "mua_hang", doiTuong: "ticket" },
  { ma: "kt_duyet_tien", ten: "Kế toán xác nhận chuyển tiền", loai: null, nguon: "khoan_chuyen_tien", trangThai: "KTV da chuyen", boPhan: "ke_toan", doiTuong: "phieu" },
  { ma: "kt_chot_phieu", ten: "Kế toán chốt phiếu xuất", loai: null, nguon: "phieu_xuat_kho_log", trangThai: "Cho ke toan", boPhan: "ke_toan", doiTuong: "phieu" },
  { ma: "kho_xuat", ten: "Kho xuất hàng", loai: null, nguon: "phieu_xuat_kho_log", trangThai: "Da chot xong don xuat", boPhan: "kho", doiTuong: "phieu" },
  { ma: "th_ke_toan", ten: "Kế toán duyệt (trả hàng)", loai: "tra_hang", nguon: "tra_hang_log", trangThai: "Cho ke toan duyet mem", boPhan: "ke_toan", doiTuong: "don" },
  { ma: "th_kho", ten: "Kho xác nhận (trả hàng)", loai: "tra_hang", nguon: "tra_hang_log", trangThai: "Cho kho xac nhan", boPhan: "kho", doiTuong: "don" },
  { ma: "th_qc", ten: "QC xác nhận (trả hàng)", loai: "tra_hang", nguon: "tra_hang_log", trangThai: "Cho QC xac nhan", boPhan: "qc", doiTuong: "don" },
  { ma: "th_tn", ten: "TN duyệt tổng (trả hàng)", loai: "tra_hang", nguon: "tra_hang_log", trangThai: "Cho TN duyet tong", boPhan: "tn", doiTuong: "don" },
];
export const BUOC_THEO_MA = new Map(BUOC_VI_PHAM.map((b) => [b.ma, b]));

export const TEN_BO_PHAN: Record<BoPhan, string> = {
  tbp: "Trưởng bộ phận DVBH",
  gs: "Giám sát",
  tn: "Tác nghiệp",
  kho: "Kho",
  mua_hang: "Mua hàng",
  ke_toan: "Kế toán",
  qc: "QC",
};

// 'Cho xem xet' / 'Da go the' con trong CHECK (migration 0126) nhung KHONG dung (chot 2026-11-18: khong co buoc Admin xem xet / go the).
export const TRANG_THAI_VI_PHAM = ["Cho giai trinh", "Da giai trinh", "Gan the"] as const;
/** Ca ghi nhan sai (khong thuoc trach nhiem bo phan) -> giai trinh voi ly do nay, tinh la "Da giai trinh" nhu moi giai trinh khac. */
export const LY_DO_KHONG_DUNG = "Ghi nhận không đúng / không thuộc trách nhiệm";

// Trang thai THAT cua tung bang log (log chi-audit cua phieu - "Da luu ma MISA", "Da them don vao phieu"… - khong phai roi buoc).
const TRANG_THAI_THAT: Record<Exclude<Nguon, "khoan_chuyen_tien">, Set<string>> = {
  dat_don_hang_log: new Set(["Cho Tram duyet", "Cho TN duyet", "Cho TBP xac nhan", "TN da duyet", "TN tu choi", "Cho hang", "Da huy", "Cho GS duyet", "Cho thanh toan"]),
  tra_hang_log: new Set(["Cho ke toan duyet mem", "Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong", "TN da duyet", "Tu choi", "Da huy"]),
  thieu_lk_log: new Set(["Cho kho xu ly", "Kho da tiep nhan", "Kho da cap nhat", "Cho mua hang", "Mua hang da dat", "Mua hang tu choi", "Kho xac nhan hang da ve", "Kho tu choi sai TT", "Da huy bo", "Da ket thuc"]),
  phieu_xuat_kho_log: new Set(["Dang tao phieu", "Cho ke toan", "Da chot xong don xuat", "Dang gui KTV", "KTV da nhan", "Ke toan huy", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"]),
};

// ---------- Gio ----------

function parseVn(s: string): Date {
  return new Date(s.replace(" ", "T").slice(0, 19) + "Z");
}
function fmtVn(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** Han = moc + so gio; khong tinh cuoi tuan -> han roi vao T7/CN thi day tung ngay sang thu 2 (cung quy tac tinhHanLyDoCham). */
export function tinhHan(moc: string, soGio: number, tinhCuoiTuan: boolean): string {
  let d = new Date(parseVn(moc).getTime() + soGio * 3_600_000);
  if (!tinhCuoiTuan) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 86_400_000);
  }
  return fmtVn(d);
}

export function soGioGiua(tu: string, den: string): number {
  return Math.round(((parseVn(den).getTime() - parseVn(tu).getTime()) / 3_600_000) * 10) / 10;
}

// ---------- Cau hinh ----------

export interface CauHinhBuoc {
  ma: string;
  so_gio: number;
  gio_giai_trinh: number;
  tinh_cuoi_tuan: number;
  bat_tat: number;
  cap_nhat_luc: string | null;
  cap_nhat_boi: string | null;
}

export async function docCauHinh(db: D1Database): Promise<Map<string, CauHinhBuoc>> {
  const { results } = await db.prepare("SELECT * FROM sla_buoc").all<CauHinhBuoc>();
  return new Map((results ?? []).map((r) => [r.ma, r]));
}

// ---------- Quet ----------

interface LogRow {
  fk: string;
  id: number;
  trang_thai: string;
  nguoi_xu_ly: string | null;
  ngay_xu_ly: string;
  ghi_chu: string | null;
}

interface ThucThe {
  id: string;
  dat_don_hang_id: string | null;
  phieu_xuat_kho_id: string | null;
  khu_vuc_ma: string | null;
  nguoi_nhan_hang: string | null;
  loai_don: string | null;
  ngay_tao: string | null;
  email_gs: string | null;
  nhom_lk: string | null;
}

interface Khoang {
  fk: string;
  trangThai: string;
  moc: string;
  ketThuc: string | null;
  trangThaiSau: string | null;
  nguoiXuLy: string | null;
  ghiChuKetThuc: string | null;
}

interface UngVien extends Khoang {
  buoc: BuocViPham;
  cfg: CauHinhBuoc;
  thucThe: ThucThe;
}

const KHOI = 400; // so id / 1 truy van json_each

function chiaKhoi<T>(arr: T[], n = KHOI): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Bang log -> (cot khoa ngoai, cau truy van thuc the dang o trang thai, cau doc thong tin thuc the). */
const NGUON_LOG = {
  dat_don_hang_log: {
    fk: "dat_don_hang_id",
    dangO: "SELECT id FROM dat_don_hang WHERE trang_thai_hien_tai IN (SELECT value FROM json_each(?)) AND COALESCE(loai_don, '') <> 'tra_hang'",
    thucThe: `SELECT d.id, d.id AS dat_don_hang_id, NULL AS phieu_xuat_kho_id, COALESCE(d.khu_vuc_chon, d.khu_vuc_ma) AS khu_vuc_ma,
                d.nguoi_nhan_hang, d.loai_don, d.ngay_tao, d.email_gs, (SELECT lk.nhom_lk FROM linh_kien lk WHERE lk.ma_linh_kien = d.ma_lk) AS nhom_lk
                FROM dat_don_hang d WHERE d.id IN (SELECT value FROM json_each(?))`,
  },
  tra_hang_log: {
    fk: "dat_don_hang_id",
    dangO: "SELECT id FROM dat_don_hang WHERE trang_thai_hien_tai IN (SELECT value FROM json_each(?)) AND loai_don = 'tra_hang'",
    thucThe: `SELECT d.id, d.id AS dat_don_hang_id, NULL AS phieu_xuat_kho_id, COALESCE(d.khu_vuc_chon, d.khu_vuc_ma) AS khu_vuc_ma,
                d.nguoi_nhan_hang, d.loai_don, d.ngay_tao, d.email_gs, (SELECT lk.nhom_lk FROM linh_kien lk WHERE lk.ma_linh_kien = d.ma_lk) AS nhom_lk
                FROM dat_don_hang d WHERE d.id IN (SELECT value FROM json_each(?))`,
  },
  thieu_lk_log: {
    fk: "thieu_lk_id",
    dangO: `SELECT t.id FROM thieu_lk t
            WHERE (SELECT l.trang_thai FROM thieu_lk_log l WHERE l.thieu_lk_id = t.id ORDER BY l.id DESC LIMIT 1) IN (SELECT value FROM json_each(?))`,
    thucThe: `SELECT t.id, t.dat_don_hang_id, NULL AS phieu_xuat_kho_id, COALESCE(d.khu_vuc_chon, d.khu_vuc_ma) AS khu_vuc_ma,
                d.nguoi_nhan_hang, d.loai_don, t.ngay_tao, d.email_gs, (SELECT lk.nhom_lk FROM linh_kien lk WHERE lk.ma_linh_kien = d.ma_lk) AS nhom_lk
              FROM thieu_lk t JOIN dat_don_hang d ON d.id = t.dat_don_hang_id WHERE t.id IN (SELECT value FROM json_each(?))`,
  },
  phieu_xuat_kho_log: {
    fk: "phieu_xuat_kho_id",
    dangO: "SELECT id FROM phieu_xuat_kho WHERE trang_thai_hien_tai IN (SELECT value FROM json_each(?))",
    thucThe: `SELECT p.id, NULL AS dat_don_hang_id, p.id AS phieu_xuat_kho_id, COALESCE(p.khu_vuc_chon, p.khu_vuc_ma) AS khu_vuc_ma,
                p.nguoi_nhan_hang, p.loai_don, p.ngay_tao, NULL AS email_gs, NULL AS nhom_lk FROM phieu_xuat_kho p WHERE p.id IN (SELECT value FROM json_each(?))`,
  },
} as const;

async function docMoc(db: D1Database, nguon: Nguon): Promise<number | null> {
  const r = await db.prepare("SELECT id_cuoi FROM vi_pham_quet WHERE nguon = ?").bind(nguon).first<{ id_cuoi: number | null }>();
  return r?.id_cuoi ?? null;
}
function lenhGhiMoc(db: D1Database, nguon: Nguon, idCuoi: number, now: string): D1PreparedStatement {
  return db
    .prepare("INSERT INTO vi_pham_quet (nguon, id_cuoi, quet_luc) VALUES (?, ?, ?) ON CONFLICT(nguon) DO UPDATE SET id_cuoi = excluded.id_cuoi, quet_luc = excluded.quet_luc")
    .bind(nguon, idCuoi, now);
}

/** Gop log 1 thuc the thanh cac khoang "dang o trang thai X" (bo dong audit cung trang thai / trang thai chi-audit). */
function tachKhoang(fk: string, rows: LogRow[], that: Set<string>, mocDau: { trangThai: string; luc: string } | null): Khoang[] {
  const ds: Khoang[] = [];
  let hienTai: Khoang | null = null;
  if (mocDau) hienTai = { fk, trangThai: mocDau.trangThai, moc: mocDau.luc, ketThuc: null, trangThaiSau: null, nguoiXuLy: null, ghiChuKetThuc: null };
  for (const r of rows) {
    if (!that.has(r.trang_thai)) continue;
    if (hienTai && hienTai.trangThai === r.trang_thai) continue;
    if (hienTai) {
      hienTai.ketThuc = r.ngay_xu_ly;
      hienTai.trangThaiSau = r.trang_thai;
      hienTai.nguoiXuLy = r.nguoi_xu_ly;
      hienTai.ghiChuKetThuc = r.ghi_chu;
      ds.push(hienTai);
    }
    hienTai = { fk, trangThai: r.trang_thai, moc: r.ngay_xu_ly, ketThuc: null, trangThaiSau: null, nguoiXuLy: null, ghiChuKetThuc: null };
  }
  if (hienTai) ds.push(hienTai);
  return ds;
}

async function quetNguonLog(
  db: D1Database,
  nguon: Exclude<Nguon, "khoan_chuyen_tien">,
  buocs: BuocViPham[],
  cfg: Map<string, CauHinhBuoc>,
  now: string,
): Promise<{ ungVien: UngVien[]; ghiMoc: D1PreparedStatement | null }> {
  const n = NGUON_LOG[nguon];
  const trangThais = buocs.map((b) => b.trangThai);
  const mocCu = await docMoc(db, nguon);
  const maxRow = await db.prepare(`SELECT MAX(id) AS m FROM ${nguon}`).first<{ m: number | null }>();
  const maxId = maxRow?.m ?? 0;

  const ids = new Set<string>();
  const { results: dangO } = await db.prepare(n.dangO).bind(JSON.stringify(trangThais)).all<{ id: string }>();
  for (const r of dangO ?? []) ids.add(r.id);
  if (mocCu !== null && maxId > mocCu) {
    const { results: moi } = await db
      .prepare(`SELECT DISTINCT ${n.fk} AS fk FROM ${nguon} WHERE id > ? AND id <= ?`)
      .bind(mocCu, maxId)
      .all<{ fk: string }>();
    for (const r of moi ?? []) ids.add(r.fk);
  }
  const ghiMoc = lenhGhiMoc(db, nguon, maxId, now);
  if (ids.size === 0) return { ungVien: [], ghiMoc };

  const thucThe = new Map<string, ThucThe>();
  const logs = new Map<string, LogRow[]>();
  for (const khoi of chiaKhoi([...ids])) {
    const ds = JSON.stringify(khoi);
    const [tt, lg] = await Promise.all([
      db.prepare(n.thucThe).bind(ds).all<ThucThe>(),
      db
        .prepare(
          `SELECT ${n.fk} AS fk, id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu FROM ${nguon}
           WHERE ${n.fk} IN (SELECT value FROM json_each(?)) ORDER BY ${n.fk}, id`,
        )
        .bind(ds)
        .all<LogRow>(),
    ]);
    for (const r of tt.results ?? []) thucThe.set(r.id, r);
    for (const r of lg.results ?? []) {
      const a = logs.get(r.fk) ?? [];
      a.push(r);
      logs.set(r.fk, a);
    }
  }

  const theoTrangThai = new Map(buocs.map((b) => [b.trangThai, b]));
  const ungVien: UngVien[] = [];
  for (const id of ids) {
    const tt = thucThe.get(id);
    if (!tt) continue;
    const rows = logs.get(id) ?? [];
    // Don tra hang tao thang (khong co log buoc dau) -> buoc "Cho ke toan duyet mem" bat dau tu ngay_tao (cung quy tac mocGiaiDoanTraHangSql).
    let mocDau: { trangThai: string; luc: string } | null = null;
    if (nguon === "tra_hang_log" && tt.ngay_tao) {
      const dau = rows.find((r) => TRANG_THAI_THAT.tra_hang_log.has(r.trang_thai));
      if (!dau || dau.trang_thai !== "Cho ke toan duyet mem") mocDau = { trangThai: "Cho ke toan duyet mem", luc: tt.ngay_tao };
    }
    for (const k of tachKhoang(id, rows, TRANG_THAI_THAT[nguon], mocDau)) {
      const b = theoTrangThai.get(k.trangThai);
      if (!b) continue;
      const c = cfg.get(b.ma);
      if (!c || !c.bat_tat) continue;
      const han = tinhHan(k.moc, c.so_gio, !!c.tinh_cuoi_tuan);
      if ((k.ketThuc ?? now) <= han) continue;
      ungVien.push({ ...k, buoc: b, cfg: c, thucThe: tt });
    }
  }
  return { ungVien, ghiMoc };
}

/** Ke toan xac nhan chuyen tien: khoang = KTV bao da chuyen -> Ke toan duyet / tu choi (so khoan_chuyen_tien) + phieu dang cho. */
async function quetChuyenTien(
  db: D1Database,
  buoc: BuocViPham,
  cfg: CauHinhBuoc,
  now: string,
): Promise<{ ungVien: UngVien[]; ghiMoc: D1PreparedStatement | null; dongMo: D1PreparedStatement[] }> {
  const mocCu = await docMoc(db, "khoan_chuyen_tien");
  const maxId = (await db.prepare("SELECT MAX(id) AS m FROM khoan_chuyen_tien").first<{ m: number | null }>())?.m ?? 0;
  const khoangs: Khoang[] = [];
  const { results: dangCho } = await db
    .prepare(
      `SELECT id, ngay_ktv_chuyen FROM phieu_xuat_kho
       WHERE trang_thai_chuyen_tien = 'KTV da chuyen' AND ngay_ktv_chuyen IS NOT NULL AND trang_thai_hien_tai <> 'Ke toan huy'`,
    )
    .all<{ id: string; ngay_ktv_chuyen: string }>();
  for (const r of dangCho ?? []) {
    khoangs.push({ fk: r.id, trangThai: buoc.trangThai, moc: r.ngay_ktv_chuyen, ketThuc: null, trangThaiSau: null, nguoiXuLy: null, ghiChuKetThuc: null });
  }
  if (mocCu !== null && maxId > mocCu) {
    const { results: daXuLy } = await db
      .prepare(
        `SELECT phieu_xuat_kho_id, ktv_bao_chuyen_luc, duyet_luc, nguoi_duyet, trang_thai, ly_do_tu_choi FROM khoan_chuyen_tien
         WHERE id > ? AND id <= ? AND lich_su = 0 AND ktv_bao_chuyen_luc IS NOT NULL AND trang_thai IN ('Da duyet', 'Tu choi')`,
      )
      .bind(mocCu, maxId)
      .all<{ phieu_xuat_kho_id: string; ktv_bao_chuyen_luc: string; duyet_luc: string; nguoi_duyet: string; trang_thai: string; ly_do_tu_choi: string | null }>();
    for (const r of daXuLy ?? []) {
      khoangs.push({
        fk: r.phieu_xuat_kho_id,
        trangThai: buoc.trangThai,
        moc: r.ktv_bao_chuyen_luc,
        ketThuc: r.duyet_luc,
        trangThaiSau: r.trang_thai === "Da duyet" ? "Ke toan da duyet tien" : "Ke toan tu choi bang chung",
        nguoiXuLy: r.nguoi_duyet,
        ghiChuKetThuc: r.ly_do_tu_choi,
      });
    }
  }
  const ghiMoc = lenhGhiMoc(db, "khoan_chuyen_tien", maxId, now);
  // Vi pham dang mo ma phieu KHONG con cho Ke toan voi dung moc do (TN tra lai, KTV rut lai, phieu huy…) -> dong o thoi diem quet.
  const conCho = new Set((dangCho ?? []).map((r) => `${r.id}|${r.ngay_ktv_chuyen}`));
  const { results: moTien } = await db
    .prepare("SELECT id, doi_tuong_id, moc_vao FROM vi_pham WHERE buoc = ? AND ket_thuc_luc IS NULL")
    .bind(buoc.ma)
    .all<{ id: number; doi_tuong_id: string; moc_vao: string }>();
  const daDongBoiKhoan = new Set(khoangs.filter((k) => k.ketThuc).map((k) => `${k.fk}|${k.moc}`));
  const dongMo = (moTien ?? [])
    .filter((v) => !conCho.has(`${v.doi_tuong_id}|${v.moc_vao}`) && !daDongBoiKhoan.has(`${v.doi_tuong_id}|${v.moc_vao}`))
    .map((v) =>
      db
        .prepare("UPDATE vi_pham SET ket_thuc_luc = ?, trang_thai_sau = 'Khong con cho Ke toan', cap_nhat_luc = ? WHERE id = ? AND ket_thuc_luc IS NULL")
        .bind(now, now, v.id),
    );

  const ungVien: UngVien[] = [];
  const canPhieu = [...new Set(khoangs.map((k) => k.fk))];
  const thucThe = new Map<string, ThucThe>();
  for (const khoi of chiaKhoi(canPhieu)) {
    const { results } = await db.prepare(NGUON_LOG.phieu_xuat_kho_log.thucThe).bind(JSON.stringify(khoi)).all<ThucThe>();
    for (const r of results ?? []) thucThe.set(r.id, r);
  }
  for (const k of khoangs) {
    const tt = thucThe.get(k.fk);
    if (!tt) continue;
    const han = tinhHan(k.moc, cfg.so_gio, !!cfg.tinh_cuoi_tuan);
    if ((k.ketThuc ?? now) <= han) continue;
    ungVien.push({ ...k, buoc, cfg, thucThe: tt });
  }
  return { ungVien, ghiMoc, dongMo };
}

// ---------- Nguoi phu trach CU THE (v1.518) ----------

interface NguoiBoPhan {
  email: string;
  vai_tro: string | null;
  la_tac_nghiep: number;
  la_kho: number;
  la_ke_toan: number;
  la_mua_hang: number;
  la_tp_dvbh: number;
  kho_nhom_lk: string | null;
}

export interface DanhBaPhuTrach {
  nguoi: NguoiBoPhan[];
  khuVuc: Map<string, Set<string>>; // email -> tap khu vuc duoc gan (user_khu_vuc)
  gsKhuVuc: Map<string, string>; // khu vuc -> GS chinh
}

export async function docDanhBaPhuTrach(db: D1Database): Promise<DanhBaPhuTrach> {
  const [u, kv, gs] = await Promise.all([
    db
      .prepare(
        `SELECT email, vai_tro, la_tac_nghiep, la_kho, la_ke_toan, la_mua_hang, la_tp_dvbh, kho_nhom_lk FROM users
         WHERE trang_thai_duyet = 'Da duyet' AND COALESCE(bi_khoa, 0) = 0
           AND (la_tac_nghiep = 1 OR la_kho = 1 OR la_ke_toan = 1 OR la_mua_hang = 1 OR la_tp_dvbh = 1 OR vai_tro IN ('QC', 'Giam sat'))`,
      )
      .all<NguoiBoPhan>(),
    db.prepare("SELECT user_email, khu_vuc_ma FROM user_khu_vuc").all<{ user_email: string; khu_vuc_ma: string }>(),
    db.prepare("SELECT ma, gs_email FROM khu_vuc WHERE gs_email IS NOT NULL").all<{ ma: string; gs_email: string }>(),
  ]);
  const khuVuc = new Map<string, Set<string>>();
  for (const r of kv.results ?? []) {
    const s = khuVuc.get(r.user_email) ?? new Set<string>();
    s.add(r.khu_vuc_ma);
    khuVuc.set(r.user_email, s);
  }
  return { nguoi: u.results ?? [], khuVuc, gsKhuVuc: new Map((gs.results ?? []).map((r) => [r.ma, r.gs_email])) };
}

function thuocBoPhan(n: NguoiBoPhan, bp: BoPhan): boolean {
  switch (bp) {
    case "tbp": return !!n.la_tp_dvbh;
    case "gs": return n.vai_tro === "Giam sat";
    case "tn": return !!n.la_tac_nghiep;
    case "kho": return !!n.la_kho;
    case "mua_hang": return !!n.la_mua_hang;
    case "ke_toan": return !!n.la_ke_toan;
    case "qc": return n.vai_tro === "QC";
  }
}

/**
 * Nguoi PHAI giai trinh 1 ca (cung nguyen tac "Khu vuc la chuan" cua module):
 *  - GS: GS cua don (email_gs = GS khu vuc hien tai cua KTV nhan) + GS chinh / GS phu cua khu vuc cua don.
 *  - Bo phan khac: nguoi cua bo phan DUOC GAN khu vuc cua don; khong ai duoc gan -> nguoi KHONG gan khu vuc nao (phu trach chung);
 *    van khong co -> ca bo phan. Kho thuan co "Xu ly thieu hang cho nhom LK" -> chi nhom LK cua don (khong con ai thi bo loc nay).
 *  - TN khong co ai -> Ke toan (Ke toan lam thay TN).
 */
export function nguoiPhuTrach(db: DanhBaPhuTrach, bp: BoPhan, khuVuc: string | null, emailGs: string | null, nhomLk: string | null): string[] {
  let thanhVien = db.nguoi.filter((n) => thuocBoPhan(n, bp));
  if (bp === "tn" && thanhVien.length === 0) thanhVien = db.nguoi.filter((n) => n.la_ke_toan);
  if (bp === "gs") {
    const out = new Set<string>();
    const laGs = new Set(thanhVien.map((n) => n.email));
    if (emailGs && laGs.has(emailGs)) out.add(emailGs);
    if (khuVuc) {
      const chinh = db.gsKhuVuc.get(khuVuc);
      if (chinh && laGs.has(chinh)) out.add(chinh);
      for (const n of thanhVien) if (db.khuVuc.get(n.email)?.has(khuVuc)) out.add(n.email);
    }
    return [...out];
  }
  let chon = khuVuc ? thanhVien.filter((n) => db.khuVuc.get(n.email)?.has(khuVuc)) : [];
  if (chon.length === 0) chon = thanhVien.filter((n) => !db.khuVuc.get(n.email)?.size);
  if (chon.length === 0) chon = thanhVien;
  if (bp === "kho" && nhomLk) {
    const theoNhom = chon.filter((n) => !n.kho_nhom_lk || n.kho_nhom_lk === nhomLk);
    if (theoNhom.length) chon = theoNhom;
  }
  return chon.map((n) => n.email).sort();
}

function loaiCua(u: UngVien): "dat_hang" | "tra_hang" {
  if (u.buoc.loai) return u.buoc.loai;
  return u.thucThe.loai_don === "tra_hang" ? "tra_hang" : "dat_hang";
}

function lenhGhiUngVien(db: D1Database, u: UngVien, now: string, phuTrach: string): D1PreparedStatement {
  const han = tinhHan(u.moc, u.cfg.so_gio, !!u.cfg.tinh_cuoi_tuan);
  // Han giai trinh tinh tu luc QUA HAN, nhung khong som hon luc he thong ghi nhan (lan quet dau / quet tre van du thoi gian giai trinh).
  const hanGiaiTrinh = tinhHan(han > now ? han : now, u.cfg.gio_giai_trinh, !!u.cfg.tinh_cuoi_tuan);
  return db
    .prepare(
      `INSERT INTO vi_pham (buoc, loai, bo_phan, doi_tuong, doi_tuong_id, dat_don_hang_id, phieu_xuat_kho_id, khu_vuc_ma, nguoi_nhan_hang,
         moc_vao, so_gio_sla, han, ket_thuc_luc, trang_thai_sau, nguoi_xu_ly, han_giai_trinh, nguoi_phu_trach, tao_luc, cap_nhat_luc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(buoc, doi_tuong_id, moc_vao) DO UPDATE SET
         ket_thuc_luc = COALESCE(vi_pham.ket_thuc_luc, excluded.ket_thuc_luc),
         trang_thai_sau = COALESCE(vi_pham.trang_thai_sau, excluded.trang_thai_sau),
         nguoi_xu_ly = COALESCE(vi_pham.nguoi_xu_ly, excluded.nguoi_xu_ly),
         nguoi_phu_trach = CASE WHEN vi_pham.trang_thai = 'Cho giai trinh' THEN excluded.nguoi_phu_trach ELSE vi_pham.nguoi_phu_trach END,
         -- doi nguoi phu trach -> bao lai (nguoi moi chua tung duoc bao)
         bao_luc = CASE WHEN vi_pham.trang_thai = 'Cho giai trinh' AND COALESCE(vi_pham.nguoi_phu_trach, '') <> COALESCE(excluded.nguoi_phu_trach, '')
                        AND vi_pham.nguoi_phu_trach IS NOT NULL THEN NULL ELSE vi_pham.bao_luc END,
         cap_nhat_luc = excluded.cap_nhat_luc
       WHERE (vi_pham.ket_thuc_luc IS NULL AND excluded.ket_thuc_luc IS NOT NULL)
          OR (vi_pham.trang_thai = 'Cho giai trinh' AND COALESCE(vi_pham.nguoi_phu_trach, '') <> COALESCE(excluded.nguoi_phu_trach, ''))`,
    )
    .bind(
      u.buoc.ma, loaiCua(u), u.buoc.boPhan, u.buoc.doiTuong, u.fk, u.thucThe.dat_don_hang_id, u.thucThe.phieu_xuat_kho_id,
      u.thucThe.khu_vuc_ma, u.thucThe.nguoi_nhan_hang, u.moc, u.cfg.so_gio, han, u.ketThuc, u.trangThaiSau, u.nguoiXuLy, hanGiaiTrinh, phuTrach, now, now,
    );
}

/** Giai trinh tu dong tu du lieu co san (chi khi vi pham con "Cho giai trinh"). */
function lenhGiaiTrinhTuDong(db: D1Database, u: UngVien, now: string): D1PreparedStatement | null {
  if (u.buoc.nguon === "tra_hang_log" && u.ghiChuKetThuc?.startsWith("Chậm quá hạn") && u.nguoiXuLy) {
    return db
      .prepare(
        `UPDATE vi_pham SET trang_thai = 'Da giai trinh', ly_do = ?, giai_trinh = ?, nguoi_giai_trinh = ?, giai_trinh_luc = ?, giai_trinh_tu_dong = 1, cap_nhat_luc = ?
         WHERE buoc = ? AND doi_tuong_id = ? AND moc_vao = ? AND trang_thai = 'Cho giai trinh'`,
      )
      .bind(/lý do: ([^|]+)/.exec(u.ghiChuKetThuc)?.[1]?.trim() ?? null, u.ghiChuKetThuc, u.nguoiXuLy, u.ketThuc, now, u.buoc.ma, u.fk, u.moc);
  }
  if (u.buoc.ma === "tn_duyet") {
    // Giai trinh ly do cham da nhap o chi tiet don trong khoang cho -> lay lan gan nhat.
    return db
      .prepare(
        `UPDATE vi_pham SET trang_thai = 'Da giai trinh', giai_trinh_tu_dong = 1, cap_nhat_luc = ?,
           giai_trinh = (SELECT g.noi_dung FROM dat_don_hang_giai_trinh g WHERE g.dat_don_hang_id = vi_pham.dat_don_hang_id
                           AND g.ngay_tao >= vi_pham.moc_vao AND g.ngay_tao <= COALESCE(vi_pham.ket_thuc_luc, ?) ORDER BY g.id DESC LIMIT 1),
           nguoi_giai_trinh = (SELECT g.nguoi_tao FROM dat_don_hang_giai_trinh g WHERE g.dat_don_hang_id = vi_pham.dat_don_hang_id
                           AND g.ngay_tao >= vi_pham.moc_vao AND g.ngay_tao <= COALESCE(vi_pham.ket_thuc_luc, ?) ORDER BY g.id DESC LIMIT 1),
           giai_trinh_luc = (SELECT g.ngay_tao FROM dat_don_hang_giai_trinh g WHERE g.dat_don_hang_id = vi_pham.dat_don_hang_id
                           AND g.ngay_tao >= vi_pham.moc_vao AND g.ngay_tao <= COALESCE(vi_pham.ket_thuc_luc, ?) ORDER BY g.id DESC LIMIT 1)
         WHERE buoc = 'tn_duyet' AND doi_tuong_id = ? AND moc_vao = ? AND trang_thai = 'Cho giai trinh'
           AND EXISTS (SELECT 1 FROM dat_don_hang_giai_trinh g WHERE g.dat_don_hang_id = vi_pham.dat_don_hang_id
                         AND g.ngay_tao >= vi_pham.moc_vao AND g.ngay_tao <= COALESCE(vi_pham.ket_thuc_luc, ?))`,
      )
      .bind(now, now, now, now, u.fk, u.moc, now);
  }
  return null;
}

export interface KetQuaQuet {
  ung_vien: number;
  ghi_moi: number;
  gan_the: number;
}

/** Quet toan bo buoc dang bat. An toan khi chay lap / chay song song (khoa tu nhien + UPSERT co dieu kien). */
export async function quetViPham(env: Env): Promise<KetQuaQuet> {
  const db = env.DB;
  const now = nowVN();
  const cfg = await docCauHinh(db);
  const dangBat = BUOC_VI_PHAM.filter((b) => cfg.get(b.ma)?.bat_tat);
  const ungVien: UngVien[] = [];
  const lenhPhu: D1PreparedStatement[] = [];

  for (const nguon of ["dat_don_hang_log", "tra_hang_log", "thieu_lk_log", "phieu_xuat_kho_log"] as const) {
    const buocs = dangBat.filter((b) => b.nguon === nguon);
    if (buocs.length === 0) continue;
    const kq = await quetNguonLog(db, nguon, buocs, cfg, now);
    ungVien.push(...kq.ungVien);
    if (kq.ghiMoc) lenhPhu.push(kq.ghiMoc);
  }
  const buocTien = dangBat.find((b) => b.nguon === "khoan_chuyen_tien");
  if (buocTien) {
    const kq = await quetChuyenTien(db, buocTien, cfg.get(buocTien.ma)!, now);
    ungVien.push(...kq.ungVien);
    if (kq.ghiMoc) lenhPhu.push(kq.ghiMoc);
    lenhPhu.push(...kq.dongMo);
  }

  const truoc = (await db.prepare("SELECT COUNT(*) AS n FROM vi_pham").first<{ n: number }>())?.n ?? 0;
  const danhBa = await docDanhBaPhuTrach(db);
  const lenh: D1PreparedStatement[] = [];
  for (const u of ungVien) {
    const pt = nguoiPhuTrach(danhBa, u.buoc.boPhan, u.thucThe.khu_vuc_ma, u.thucThe.email_gs, u.thucThe.nhom_lk);
    lenh.push(lenhGhiUngVien(db, u, now, JSON.stringify(pt)));
    const gt = lenhGiaiTrinhTuDong(db, u, now);
    if (gt) lenh.push(gt);
  }
  for (const khoi of chiaKhoi(lenh, 80)) await db.batch(khoi);

  // Het han giai trinh -> gan the.
  const ganThe = await db
    .prepare("UPDATE vi_pham SET trang_thai = 'Gan the', gan_the_luc = ?, cap_nhat_luc = ? WHERE trang_thai = 'Cho giai trinh' AND han_giai_trinh < ?")
    .bind(now, now, now)
    .run();
  // Sap het han giai trinh (con <= GIO_NHAC gio) -> nhac 1 lan.
  const sapHet = tinhHan(now, GIO_NHAC, true);
  const nhac = await db
    .prepare("UPDATE vi_pham SET nhac_luc = ? WHERE trang_thai = 'Cho giai trinh' AND nhac_luc IS NULL AND han_giai_trinh <= ? AND tao_luc < ?")
    .bind(now, sapHet, now)
    .run();
  await guiThongBaoQuet(env, now, { nhac: (nhac.meta.changes ?? 0) > 0 });
  // Ghi moc SAU cung: loi giua chung thi lan sau quet lai tu moc cu (UPSERT khong sinh trung).
  for (const khoi of chiaKhoi(lenhPhu, 80)) await db.batch(khoi);
  const sau = (await db.prepare("SELECT COUNT(*) AS n FROM vi_pham").first<{ n: number }>())?.n ?? 0;
  return { ung_vien: ungVien.length, ghi_moi: sau - truoc, gan_the: ganThe.meta.changes ?? 0 };
}

// ---------- Thong bao (gop theo nguoi, 1 lan quet toi da 3 thong bao / nguoi) ----------

const GIO_NHAC = 6;

async function guiThongBaoQuet(env: Env, now: string, opts: { nhac: boolean }): Promise<void> {
  const db = env.DB;
  const docNhom = async (dk: string) =>
    (
      await db
        .prepare(`SELECT j.value AS email, COUNT(*) AS n, MIN(v.han_giai_trinh) AS han FROM vi_pham v, json_each(COALESCE(v.nguoi_phu_trach, '[]')) j
                  WHERE ${dk} GROUP BY j.value`)
        .bind(now)
        .all<{ email: string; n: number; han: string }>()
    ).results ?? [];
  // Ca chua bao lan nao (gom ca ghi truoc khi co thong bao) -> bao 1 lan.
  await db.prepare("UPDATE vi_pham SET bao_luc = ? WHERE bao_luc IS NULL AND trang_thai = 'Cho giai trinh' AND COALESCE(nguoi_phu_trach, '[]') <> '[]'").bind(now).run();
  const moi = await docNhom("v.bao_luc = ? AND v.trang_thai = 'Cho giai trinh'");
  const sapHet = opts.nhac ? await docNhom("v.nhac_luc = ? AND v.trang_thai = 'Cho giai trinh'") : [];
  const biGan = await docNhom("v.gan_the_luc = ?");
  const tin: { email: string; loai: string; tieuDe: string; noiDung: string }[] = [];
  const hh = (s: string) => `${s.slice(11, 16)} ${s.slice(8, 10)}/${s.slice(5, 7)}`;
  for (const r of moi) {
    tin.push({ email: r.email, loai: "vi_pham", tieuDe: "⏰ Ca quá hạn cần giải trình",
      noiDung: `Bạn có ${r.n} ca quá hạn mới cần giải trình — hạn sớm nhất ${hh(r.han)}. Mở menu "Quá hạn & vi phạm" › "Cần tôi giải trình".` });
  }
  for (const r of sapHet) {
    tin.push({ email: r.email, loai: "vi_pham", tieuDe: "⚠ Sắp hết hạn giải trình",
      noiDung: `${r.n} ca sắp hết hạn giải trình (sớm nhất ${hh(r.han)}). Quá hạn mà chưa giải trình sẽ bị gắn thẻ vi phạm. Ca không thuộc trách nhiệm của bạn: giải trình, chọn lý do "Ghi nhận không đúng".` });
  }
  for (const r of biGan) {
    tin.push({ email: r.email, loai: "vi_pham_gan_the", tieuDe: "🚩 Bị gắn thẻ vi phạm",
      noiDung: `${r.n} ca đã bị gắn thẻ vi phạm vì chưa giải trình đúng hạn.` });
  }
  if (!tin.length) return;
  for (const khoi of chiaKhoi(tin, 80)) {
    await db.batch(
      khoi.map((t) =>
        db
          .prepare("INSERT INTO thong_bao_ktv (nguoi_nhan, loai, noi_dung, link_type, link_id, ngay_tao) VALUES (?, ?, ?, 'vi_pham', 'can_toi', ?)")
          .bind(t.email, t.loai, t.noiDung, now),
      ),
    );
  }
  await Promise.all(tin.map((t) => sendPushToUser(env, t.email, { title: t.tieuDe, body: t.noiDung, url: "/?vi_pham=can_toi" }).catch(() => undefined)));
}

// ---------- Quyen ----------

interface NguoiDung {
  email: string;
  vai_tro: string | null;
  la_tp_dvbh: boolean;
  la_tac_nghiep: boolean;
  la_kho: boolean;
  la_mua_hang: boolean;
  la_ke_toan: boolean;
}

/** Bo phan nguoi nay giai trinh duoc (Admin = tat ca). */
export function boPhanCua(u: NguoiDung): BoPhan[] {
  if (u.vai_tro === "Admin") return Object.keys(TEN_BO_PHAN) as BoPhan[];
  const ds: BoPhan[] = [];
  if (u.la_tp_dvbh) ds.push("tbp");
  if (u.vai_tro === "Giam sat") ds.push("gs");
  if (u.la_tac_nghiep) ds.push("tn");
  if (u.la_kho) ds.push("kho");
  if (u.la_mua_hang) ds.push("mua_hang");
  if (u.la_ke_toan) ds.push("ke_toan");
  if (u.vai_tro === "QC") ds.push("qc");
  return ds;
}
