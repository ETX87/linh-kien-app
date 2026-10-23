/**
 * Bao cao "Toc do xu ly" (SLA theo tai khoan x giai doan quy trinh) - xem
 * routes/baoCaoTocDoXuLy.ts cho endpoint boc ngoai. File nay CHI la ham thuan tinh toan (khong dong
 * D1Database qua Context) - cung pattern voi congNoKtv.ts/misaExport.ts.
 *
 * THUAT TOAN CHUNG (14 giai doan, 4 bang log): moi bang log (dat_don_hang_log/thieu_lk_log/
 * tra_hang_log/phieu_xuat_kho_log) co RAT NHIEU dong INSERT chi de audit 1 hanh dong khac (sua don,
 * luu ma MISA, dinh bang chung chuyen tien...) VOI CUNG trang_thai nhu dong ngay truoc - khong phai
 * 1 lan chuyen trang thai that. Buoc 1 ("gop dong") duyet TOAN BO log cua 1 bang theo tung thuc the
 * (fk_id), giu lai CHI dong DAU TIEN cua moi trang_thai moi (so voi dong da giu truoc do) - ket qua
 * la day "chuyen trang thai THAT" cua thuc the do. Buoc 2 ghep tung CAP lien tiep trong day da gop
 * thanh 1 "khoang cho da dong" (tu luc vao trang_thai A den luc roi sang trang_thai B, quy cho
 * nguoi_xu_ly cua dong B). Buoc 3 doi chieu cap (A,B) voi STAGE_DEFS de biet no thuoc giai doan nao.
 *
 * NGOAI LE: "chuyen tien" trong luong phieu_xuat_kho (giai doan cho_chuyen_tien/
 * ke_toan_duyet_chuyen_tien) KHONG doi cot trang_thai chinh cua phieu_xuat_kho_log (van ghi nguyen
 * trang_thai_hien_tai hien co, chi doi ghi_chu - xem POST /:id/bang-chung-chuyen-tien, PATCH
 * /:id/chuyen-tien trong routes/phieuXuatKho.ts) nen thuat toan gop-dong o tren KHONG bat duoc -
 * phai xu ly rieng bang cach doi chieu 3 mau ghi_chu co dinh (xem computePxkChuyenTienInstances).
 */
import { nowVN } from "./vnTime";

export type Luong = "mua_cong_no" | "tra_hang" | "pxk" | "cho_ktv";
export type LogTable = "dat_don_hang_log" | "thieu_lk_log" | "tra_hang_log" | "phieu_xuat_kho_log" | "pxk_chuyen_tien";

export interface StageDef {
  key: string;
  label: string;
  luong: Luong;
  logTable: LogTable;
  fromStates: string[];
  toStates: string[];
  tuChoiStates: string[];
  noiBo: boolean; // false = "cho KTV hanh dong" - KHONG tinh vao SLA nhan vien
  ghiChu?: string;
}

// Danh sach 14 giai doan - xem bang "ma tran thoi gian xu ly" trong plan (da doi chieu tung dong
// voi CHECK constraint that cua tung bang log, migrations/0001_init.sql + 0002_tra_hang_pxk.sql, va
// logic re nhanh that trong routes/datMuaLinhKien.ts, routes/traHang.ts, routes/phieuXuatKho.ts).
export const STAGE_DEFS: StageDef[] = [
  {
    key: "tram_duyet",
    label: "Trạm duyệt đơn",
    luong: "mua_cong_no",
    logTable: "dat_don_hang_log",
    fromStates: ["Cho Tram duyet"],
    toStates: ["Cho TBP xac nhan", "Cho TN duyet", "Da huy", "TN da duyet", "Cho thanh toan", "Cho hang", "Cho GS duyet"],
    tuChoiStates: ["Da huy"],
    noiBo: true,
  },
  {
    key: "tbp_xac_nhan",
    label: "TBP xác nhận LK đặc thù",
    luong: "mua_cong_no",
    logTable: "dat_don_hang_log",
    fromStates: ["Cho TBP xac nhan"],
    toStates: ["Cho TN duyet", "Da huy", "TN da duyet", "Cho thanh toan", "Cho hang", "Cho GS duyet"],
    tuChoiStates: ["Da huy"],
    noiBo: true,
  },
  {
    // Tu dong duyet 100% (2026-10-14): don cong no vuot tran cho GS khu vuc duyet (nhap ma EO).
    key: "gs_duyet_vuot_tran",
    label: "GS duyệt đơn vượt trần",
    luong: "mua_cong_no",
    logTable: "dat_don_hang_log",
    fromStates: ["Cho GS duyet"],
    toStates: ["TN da duyet", "Cho thanh toan", "Cho hang", "Da huy"],
    tuChoiStates: ["Da huy"],
    noiBo: true,
  },
  {
    key: "tn_duyet_don",
    label: "TN duyệt đơn",
    luong: "mua_cong_no",
    logTable: "dat_don_hang_log",
    fromStates: ["Cho TN duyet"],
    toStates: ["TN da duyet", "TN tu choi", "Cho hang"],
    tuChoiStates: ["TN tu choi"],
    noiBo: true,
  },
  {
    key: "kho_xu_ly_thieu",
    label: "Kho xử lý thiếu linh kiện",
    luong: "mua_cong_no",
    logTable: "thieu_lk_log",
    fromStates: ["Cho kho xu ly"],
    toStates: ["Kho da tiep nhan", "Kho xac nhan hang da ve", "Kho tu choi sai TT", "Da huy bo"],
    tuChoiStates: ["Kho tu choi sai TT", "Da huy bo"],
    noiBo: true,
    ghiChu: "Một phần phản ánh điều kiện khách quan (hàng có về kho hay không), không thuần tốc độ xử lý của Kho.",
  },
  {
    key: "th_ke_toan_duyet_mem",
    label: "Kế toán duyệt mềm (trả hàng)",
    luong: "tra_hang",
    logTable: "tra_hang_log",
    fromStates: ["Cho ke toan duyet mem"],
    toStates: ["Cho kho xac nhan", "Tu choi"],
    tuChoiStates: ["Tu choi"],
    noiBo: true,
  },
  {
    key: "th_kho_xac_nhan",
    label: "Kho xác nhận (trả hàng)",
    luong: "tra_hang",
    logTable: "tra_hang_log",
    fromStates: ["Cho kho xac nhan"],
    toStates: ["Cho QC xac nhan", "Tu choi"],
    tuChoiStates: ["Tu choi"],
    noiBo: true,
  },
  {
    key: "th_qc_xac_nhan",
    label: "QC xác nhận (trả hàng)",
    luong: "tra_hang",
    logTable: "tra_hang_log",
    fromStates: ["Cho QC xac nhan"],
    toStates: ["Cho TN duyet tong", "Tu choi"],
    tuChoiStates: ["Tu choi"],
    noiBo: true,
  },
  {
    key: "th_tn_duyet_tong",
    label: "TN duyệt tổng (trả hàng)",
    luong: "tra_hang",
    logTable: "tra_hang_log",
    fromStates: ["Cho TN duyet tong"],
    toStates: ["TN da duyet", "Tu choi"],
    tuChoiStates: ["Tu choi"],
    noiBo: true,
  },
  {
    key: "cho_chuyen_tien",
    label: "Chờ chuyển tiền",
    luong: "cho_ktv",
    logTable: "pxk_chuyen_tien",
    fromStates: [],
    toStates: [],
    tuChoiStates: [],
    noiBo: false,
  },
  {
    // SUA (phan hoi nguoi dung 04/09/2026: "bước 'TN duyệt chuyển tiền' chuyển thành 2 bước") - buoc
    // duyet cuoi cung CHUYEN TU TN SANG KE TOAN (xem PATCH /:id/chuyen-tien nhanh "TN da duyet" trong
    // routes/phieuXuatKho.ts, gate doi tu canTacNghiep sang canKeToan) - GIU NGUYEN gia tri DB
    // "TN da duyet" (khong doi CHECK constraint, tranh migration/anh huong cac noi doc gia tri nay nhu
    // misaExport.ts/bao-cao-tong-the), chi doi ten khoa/nhan hien thi cho dung nghiep vu moi.
    key: "ke_toan_duyet_chuyen_tien",
    label: "Kế toán duyệt chuyển tiền",
    luong: "pxk",
    logTable: "pxk_chuyen_tien",
    fromStates: [],
    toStates: [],
    tuChoiStates: [],
    noiBo: true,
  },
  {
    key: "tn_tao_pxk",
    label: "TN tạo phiếu xuất kho",
    luong: "pxk",
    logTable: "phieu_xuat_kho_log",
    fromStates: ["Dang tao phieu"],
    toStates: ["Cho ke toan", "Ke toan huy"],
    tuChoiStates: ["Ke toan huy"],
    noiBo: true,
  },
  {
    key: "ke_toan_chot_pxk",
    label: "Kế toán chốt phiếu xuất kho",
    luong: "pxk",
    logTable: "phieu_xuat_kho_log",
    fromStates: ["Cho ke toan"],
    toStates: ["Da chot xong don xuat", "Ke toan huy"],
    tuChoiStates: ["Ke toan huy"],
    noiBo: true,
  },
  {
    key: "kho_xu_ly_pxk",
    label: "Kho xử lý PXK sau chốt",
    luong: "pxk",
    logTable: "phieu_xuat_kho_log",
    fromStates: ["Da chot xong don xuat"],
    toStates: ["Dang gui KTV", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"],
    tuChoiStates: [],
    noiBo: true,
  },
  {
    key: "cho_ktv_nhan_hang",
    label: "Chờ KTV nhận hàng",
    luong: "cho_ktv",
    logTable: "phieu_xuat_kho_log",
    fromStates: ["Dang gui KTV"],
    toStates: ["KTV da nhan"],
    tuChoiStates: [],
    noiBo: false,
  },
];

export const STAGE_BY_KEY = new Map(STAGE_DEFS.map((s) => [s.key, s]));

export interface StageInstance {
  stageKey: string;
  fromState: string;
  toState: string;
  nguoiXuLy: string;
  ngayXuLy: string; // moc dong giai doan (VN local "YYYY-MM-DD HH:MM:SS") - dung de loc theo ky
  gioCho: number;
  ktvEmail: string | null;
  loaiDeXuat: string | null;
}

interface RawLogRow {
  id: number;
  fk_id: string;
  trang_thai: string;
  nguoi_xu_ly: string;
  ngay_xu_ly: string;
  ghi_chu: string | null;
  ktv_email: string | null;
  loai_de_xuat: string | null;
}

/** Parse "YYYY-MM-DD HH:MM:SS" (quy uoc gio VN cua toan he thong, xem lib/vnTime.ts) thanh epoch ms
 * - CHI dung de tinh HIEU giua 2 moc (lech mui gio tu huy nhau), khong dung de hien thi. */
function toEpochMs(vnDatetime: string): number {
  return new Date(vnDatetime.replace(" ", "T") + "Z").getTime();
}

function hoursBetween(startVn: string, endVn: string): number {
  return (toEpochMs(endVn) - toEpochMs(startVn)) / 3_600_000;
}

/** Gop N dong log lien tiep cung 1 fk_id thanh day "chuyen trang thai THAT" (bo dong audit-only) roi
 * ghep tung cap lien tiep thanh 1 StageInstance neu cap (from,to) khop dung 1 StageDef co logTable
 * tuong ung. `rows` PHAI da ORDER BY fk_id, id (dung index moi them o migration 0018). */
function collapseAndMatch(rows: RawLogRow[], logTable: LogTable, stageDefs: StageDef[]): StageInstance[] {
  const relevantStages = stageDefs.filter((s) => s.logTable === logTable);
  if (relevantStages.length === 0) return [];
  const instances: StageInstance[] = [];

  let curFk: string | null = null;
  let prevReal: RawLogRow | null = null;
  for (const row of rows) {
    if (row.fk_id !== curFk) {
      curFk = row.fk_id;
      prevReal = null;
    }
    if (prevReal === null || row.trang_thai !== prevReal.trang_thai) {
      if (prevReal !== null) {
        const stage = relevantStages.find((s) => s.fromStates.includes(prevReal!.trang_thai) && s.toStates.includes(row.trang_thai));
        if (stage) {
          instances.push({
            stageKey: stage.key,
            fromState: prevReal.trang_thai,
            toState: row.trang_thai,
            nguoiXuLy: row.nguoi_xu_ly,
            ngayXuLy: row.ngay_xu_ly,
            gioCho: hoursBetween(prevReal.ngay_xu_ly, row.ngay_xu_ly),
            ktvEmail: row.ktv_email,
            loaiDeXuat: row.loai_de_xuat,
          });
        }
      }
      prevReal = row;
    }
  }
  return instances;
}

// 3 mau ghi_chu CO DINH ghi tu routes/phieuXuatKho.ts - COUPLING: doi chu trong file do (nhanh "KTV
// da chuyen"/"TN da duyet" cua PATCH /:id/chuyen-tien, va POST /:id/chuyen-tien) phai sua lai CA o
// day, khong co co che nao khac de doi chieu 2 noi tu dong.
const CHUYEN_TIEN_REQUEST_PREFIX = "Yêu cầu KTV chuyển";
const CHUYEN_TIEN_CONFIRM_GHICHU = "Đã đính bằng chứng/ghi chú chuyển tiền";
// SUA (phan hoi nguoi dung 04/09/2026): nguoi duyet buoc cuoi doi tu TN sang Ke toan - chu ghi_chu
// cap nhat theo dung (xem routes/phieuXuatKho.ts).
const CHUYEN_TIEN_APPROVE_GHICHU = "Kế toán đã duyệt bằng chứng chuyển tiền";

/**
 * "Chuyen tien" KHONG doi cot trang_thai chinh cua phieu_xuat_kho_log (xem giai thich dau file) nen
 * khong the dung collapseAndMatch - doi chieu truc tiep 3 mau ghi_chu theo THU TU trong tung thuc
 * the (fk_id) de tim 2 khoang: "cho_chuyen_tien" (yeu cau -> KTV/TN/Ke toan dinh bang chung) va
 * "ke_toan_duyet_chuyen_tien" (dinh bang chung -> Ke toan duyet). Dong "Dang tao phieu" DAU TIEN cua moi
 * PXK duoc coi la 1 "yeu cau" ngam dinh (PXK co the duoc tao voi so_tien_can_chuyen ngay tu dau,
 * KHONG co dong ghi_chu "Yêu cầu KTV chuyển" rieng cho lan dau - xem POST / tao PXK) - neu PXK do
 * khong thuc su can chuyen tien thi "yeu cau ngam dinh" nay khong bao gio duoc tieu thu (khong co
 * dong xac nhan tiep theo), vo hai.
 */
function computePxkChuyenTienInstances(rows: RawLogRow[]): StageInstance[] {
  const instances: StageInstance[] = [];
  let curFk: string | null = null;
  let pendingRequest: RawLogRow | null = null;
  let pendingConfirm: RawLogRow | null = null;

  for (const row of rows) {
    if (row.fk_id !== curFk) {
      curFk = row.fk_id;
      pendingRequest = row; // dong dau tien cua thuc the (thuong la "Dang tao phieu") = yeu cau ngam dinh
      pendingConfirm = null;
    }
    const ghiChu = row.ghi_chu ?? "";
    if (ghiChu.startsWith(CHUYEN_TIEN_REQUEST_PREFIX)) {
      pendingRequest = row;
      pendingConfirm = null;
    } else if (ghiChu === CHUYEN_TIEN_CONFIRM_GHICHU) {
      if (pendingRequest) {
        instances.push({
          stageKey: "cho_chuyen_tien",
          fromState: "Cho KTV chuyen",
          toState: "KTV da chuyen",
          nguoiXuLy: row.nguoi_xu_ly,
          ngayXuLy: row.ngay_xu_ly,
          gioCho: hoursBetween(pendingRequest.ngay_xu_ly, row.ngay_xu_ly),
          ktvEmail: row.ktv_email,
          loaiDeXuat: row.loai_de_xuat,
        });
      }
      pendingConfirm = row;
      pendingRequest = null;
    } else if (ghiChu === CHUYEN_TIEN_APPROVE_GHICHU) {
      if (pendingConfirm) {
        instances.push({
          stageKey: "ke_toan_duyet_chuyen_tien",
          fromState: "KTV da chuyen",
          toState: "TN da duyet",
          nguoiXuLy: row.nguoi_xu_ly,
          ngayXuLy: row.ngay_xu_ly,
          gioCho: hoursBetween(pendingConfirm.ngay_xu_ly, row.ngay_xu_ly),
          ktvEmail: row.ktv_email,
          loaiDeXuat: row.loai_de_xuat,
        });
      }
      pendingConfirm = null;
    }
  }
  return instances;
}

async function fetchRaw(db: D1Database, logTable: Exclude<LogTable, "pxk_chuyen_tien">): Promise<RawLogRow[]> {
  let sql: string;
  if (logTable === "dat_don_hang_log") {
    sql = `SELECT l.id, l.dat_don_hang_id as fk_id, l.trang_thai, l.nguoi_xu_ly, l.ngay_xu_ly, NULL as ghi_chu,
             ddh.nguoi_nhan_hang as ktv_email, ddh.loai_de_xuat as loai_de_xuat
           FROM dat_don_hang_log l JOIN dat_don_hang ddh ON ddh.id = l.dat_don_hang_id
           ORDER BY l.dat_don_hang_id, l.id`;
  } else if (logTable === "tra_hang_log") {
    sql = `SELECT l.id, l.dat_don_hang_id as fk_id, l.trang_thai, l.nguoi_xu_ly, l.ngay_xu_ly, NULL as ghi_chu,
             ddh.nguoi_nhan_hang as ktv_email, ddh.loai_de_xuat as loai_de_xuat
           FROM tra_hang_log l JOIN dat_don_hang ddh ON ddh.id = l.dat_don_hang_id
           ORDER BY l.dat_don_hang_id, l.id`;
  } else if (logTable === "thieu_lk_log") {
    sql = `SELECT l.id, l.thieu_lk_id as fk_id, l.trang_thai, l.nguoi_xu_ly, l.ngay_xu_ly, NULL as ghi_chu,
             ddh.nguoi_nhan_hang as ktv_email, ddh.loai_de_xuat as loai_de_xuat
           FROM thieu_lk_log l
           JOIN thieu_lk t ON t.id = l.thieu_lk_id
           JOIN dat_don_hang ddh ON ddh.id = t.dat_don_hang_id
           ORDER BY l.thieu_lk_id, l.id`;
  } else {
    sql = `SELECT l.id, l.phieu_xuat_kho_id as fk_id, l.trang_thai, l.nguoi_xu_ly, l.ngay_xu_ly, l.ghi_chu,
             pxk.nguoi_nhan_hang as ktv_email,
             (SELECT ddh.loai_de_xuat FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
              WHERE pxkd.phieu_xuat_kho_id = pxk.id LIMIT 1) as loai_de_xuat
           FROM phieu_xuat_kho_log l JOIN phieu_xuat_kho pxk ON pxk.id = l.phieu_xuat_kho_id
           ORDER BY l.phieu_xuat_kho_id, l.id`;
  }
  const { results } = await db.prepare(sql).all<RawLogRow>();
  return results ?? [];
}

/** Tinh TOAN BO StageInstance cua ca 14 giai doan (khong loc theo ky/scope - loc lam o
 * routes/baoCaoTocDoXuLy.ts sau khi co ket qua, de tai su dung 1 lan tinh cho ca ky hien tai lan ky
 * truoc khi tinh xu huong). */
export async function computeAllStageInstances(db: D1Database): Promise<StageInstance[]> {
  const [ddhRows, tlkRows, thRows, pxkRows] = await Promise.all([
    fetchRaw(db, "dat_don_hang_log"),
    fetchRaw(db, "thieu_lk_log"),
    fetchRaw(db, "tra_hang_log"),
    fetchRaw(db, "phieu_xuat_kho_log"),
  ]);
  return [
    ...collapseAndMatch(ddhRows, "dat_don_hang_log", STAGE_DEFS),
    ...collapseAndMatch(tlkRows, "thieu_lk_log", STAGE_DEFS),
    ...collapseAndMatch(thRows, "tra_hang_log", STAGE_DEFS),
    ...collapseAndMatch(pxkRows, "phieu_xuat_kho_log", STAGE_DEFS),
    ...computePxkChuyenTienInstances(pxkRows),
  ];
}

export interface KyRange {
  start: string; // "YYYY-MM-DD HH:MM:SS", inclusive
  end: string; // exclusive
  prevKy: string; // gia tri "ky" cua ky truoc, cung do dai, dung tinh xu huong
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "thang" -> khoang [dau thang, dau thang sau) theo gio VN. */
export function monthRange(yyyyMm: string): KyRange {
  const [y, m] = yyyyMm.split("-").map(Number);
  const start = `${yyyyMm}-01 00:00:00`;
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const end = `${next.y}-${pad2(next.m)}-01 00:00:00`;
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return { start, end, prevKy: `${prev.y}-${pad2(prev.m)}` };
}

/** ISO-8601 week number cua 1 ngay (UTC-arithmetic tren cac thanh phan Y/M/D, khong quy doi timezone
 * that - dung de sinh nhan "YYYY-Www" on dinh, KHONG dung de hien thi gio). */
function isoWeekLabel(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad2(weekNo)}`;
}

/** "tuan" (dang "YYYY-Www") -> khoang [thu 2, thu 2 tuan sau) theo gio VN. */
export function weekRange(yyyyWww: string): KyRange {
  const [yStr, wStr] = yyyyWww.split("-W");
  const y = Number(yStr);
  const w = Number(wStr);
  // Thu 5 cua tuan ISO w (moc chuan de tra ve dung nam ISO) - lui ve Thu 2 cung tuan.
  const thursday = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
  const dow = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() - dow + 4);
  const monday = new Date(thursday);
  monday.setUTCDate(thursday.getUTCDate() - 3);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  const prevMonday = new Date(monday);
  prevMonday.setUTCDate(monday.getUTCDate() - 7);

  const start = `${monday.toISOString().slice(0, 10)} 00:00:00`;
  const end = `${nextMonday.toISOString().slice(0, 10)} 00:00:00`;
  const prevKy = isoWeekLabel(prevMonday.getUTCFullYear(), prevMonday.getUTCMonth() + 1, prevMonday.getUTCDate());
  return { start, end, prevKy };
}

/** "Thang/Tuan hien tai" theo gio VN - dung lam gia tri mac dinh cua bo loc ky o frontend. */
export function currentKy(kyLoai: "thang" | "tuan"): string {
  const now = nowVN();
  if (kyLoai === "thang") return now.slice(0, 7);
  const [y, m, d] = now.slice(0, 10).split("-").map(Number);
  return isoWeekLabel(y, m, d);
}

export function resolveKyRange(kyLoai: "thang" | "tuan", ky: string): KyRange {
  return kyLoai === "thang" ? monthRange(ky) : weekRange(ky);
}

export interface AccountRow {
  email: string;
  ten: string | null;
  da_xu_ly: number;
  tu_choi: number;
  tb_gio: number | null;
  tb_gio_ky_truoc: number | null;
  xu_huong_phan_tram: number | null;
}

export interface StageFilter {
  scopeEmails: Set<string> | null; // null = khong gioi han (Admin khong loc Khu vuc)
  loaiDeXuatOptions: Set<string> | null; // null = khong loc
}

function matchFilter(inst: StageInstance, filter: StageFilter): boolean {
  if (filter.scopeEmails !== null) {
    if (!inst.ktvEmail || !filter.scopeEmails.has(inst.ktvEmail)) return false;
  }
  if (filter.loaiDeXuatOptions !== null) {
    if (!inst.loaiDeXuat || !filter.loaiDeXuatOptions.has(inst.loaiDeXuat)) return false;
  }
  return true;
}

/** Gop 1 danh sach StageInstance (da loc theo 1 ky + scope) thanh bang xep hang theo tai khoan
 * (nguoiXuLy). TB gio tinh tren CA "da xu ly" LAN "tu choi" (ca 2 deu la 1 lan phan hoi that su cua
 * tai khoan do, khong chi rieng luong xu ly thanh cong). */
export function aggregateByAccount(instancesInKy: StageInstance[], instancesInPrevKy: StageInstance[]): AccountRow[] {
  interface Acc {
    daXuLy: number;
    tuChoi: number;
    tongGio: number;
    soLan: number;
  }
  function build(list: StageInstance[]): Map<string, Acc> {
    const m = new Map<string, Acc>();
    for (const inst of list) {
      const stage = STAGE_BY_KEY.get(inst.stageKey);
      const isTuChoi = !!stage?.tuChoiStates.includes(inst.toState);
      const acc = m.get(inst.nguoiXuLy) ?? { daXuLy: 0, tuChoi: 0, tongGio: 0, soLan: 0 };
      if (isTuChoi) acc.tuChoi += 1;
      else acc.daXuLy += 1;
      acc.tongGio += inst.gioCho;
      acc.soLan += 1;
      m.set(inst.nguoiXuLy, acc);
    }
    return m;
  }
  const cur = build(instancesInKy);
  const prev = build(instancesInPrevKy);
  const emails = new Set([...cur.keys(), ...prev.keys()]);
  const rows: AccountRow[] = [];
  for (const email of emails) {
    const c = cur.get(email);
    const p = prev.get(email);
    const tbGio = c && c.soLan > 0 ? c.tongGio / c.soLan : null;
    const tbGioKyTruoc = p && p.soLan > 0 ? p.tongGio / p.soLan : null;
    const xuHuong = tbGio != null && tbGioKyTruoc != null && tbGioKyTruoc > 0 ? ((tbGio - tbGioKyTruoc) / tbGioKyTruoc) * 100 : null;
    rows.push({
      email,
      ten: null,
      da_xu_ly: c?.daXuLy ?? 0,
      tu_choi: c?.tuChoi ?? 0,
      tb_gio: tbGio,
      tb_gio_ky_truoc: tbGioKyTruoc,
      xu_huong_phan_tram: xuHuong,
    });
  }
  return rows;
}

export function filterInstances(all: StageInstance[], stageKey: string, range: KyRange, filter: StageFilter): StageInstance[] {
  return all.filter((inst) => inst.stageKey === stageKey && inst.ngayXuLy >= range.start && inst.ngayXuLy < range.end && matchFilter(inst, filter));
}

/** So don/phieu dang "dang cho" o dung giai doan nay TAI THOI DIEM HIEN TAI (khong phan theo tai
 * khoan - cac buoc nay la HANG CHO DUNG CHUNG cho ca nhom vai tro, vd bat ky TN nao cung xu ly duoc
 * BAT KY don nao dang cho TN duyet, khong co khai niem "hang cho rieng cua 1 tai khoan" - xem
 * quyet dinh UI trong plan). Doc truc tiep cot trang_thai_hien_tai (nguon that, KHONG suy tu log) cho
 * dat_don_hang/phieu_xuat_kho; thieu_lk khong co cot rieng nen phai doc dong log moi nhat. */
export async function countDangCho(db: D1Database, stageKey: string, filter: StageFilter): Promise<number> {
  const stage = STAGE_BY_KEY.get(stageKey);
  if (!stage) return 0;

  function scopeClause(emailCol: string): { sql: string; binds: unknown[] } {
    const binds: unknown[] = [];
    let sql = "";
    if (filter.scopeEmails !== null) {
      if (filter.scopeEmails.size === 0) return { sql: " AND 1=0", binds: [] };
      // 1 bind JSON (json_each) thay vi 1 "?" moi email - khu vuc dong KTV (MB3 > 120) vuot gioi han 100 tham so D1 -> INTERNAL_ERROR (sua 2026-10-23).
      sql += ` AND ${emailCol} IN (SELECT value FROM json_each(?))`;
      binds.push(JSON.stringify([...filter.scopeEmails]));
    }
    return { sql, binds };
  }
  function loaiDeXuatClause(col: string): { sql: string; binds: unknown[] } {
    if (filter.loaiDeXuatOptions === null) return { sql: "", binds: [] };
    if (filter.loaiDeXuatOptions.size === 0) return { sql: " AND 1=0", binds: [] };
    return { sql: ` AND ${col} IN (SELECT value FROM json_each(?))`, binds: [JSON.stringify([...filter.loaiDeXuatOptions])] };
  }

  if (stage.logTable === "dat_don_hang_log" || stage.logTable === "tra_hang_log") {
    const scope = scopeClause("ddh.nguoi_nhan_hang");
    const loai = loaiDeXuatClause("ddh.loai_de_xuat");
    const row = await db
      .prepare(`SELECT COUNT(*) as n FROM dat_don_hang ddh WHERE ddh.trang_thai_hien_tai = ?${scope.sql}${loai.sql}`)
      .bind(stage.fromStates[0], ...scope.binds, ...loai.binds)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }
  if (stage.logTable === "thieu_lk_log") {
    const scope = scopeClause("ddh.nguoi_nhan_hang");
    const loai = loaiDeXuatClause("ddh.loai_de_xuat");
    const row = await db
      .prepare(
        `SELECT COUNT(*) as n FROM thieu_lk t JOIN dat_don_hang ddh ON ddh.id = t.dat_don_hang_id
         WHERE (SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = t.id ORDER BY id DESC LIMIT 1) = ?${scope.sql}${loai.sql}`,
      )
      .bind(stage.fromStates[0], ...scope.binds, ...loai.binds)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }
  if (stage.logTable === "phieu_xuat_kho_log") {
    const scope = scopeClause("pxk.nguoi_nhan_hang");
    const loai = loaiDeXuatClause(
      "(SELECT ddh.loai_de_xuat FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id LIMIT 1)",
    );
    const row = await db
      .prepare(`SELECT COUNT(*) as n FROM phieu_xuat_kho pxk WHERE pxk.trang_thai_hien_tai = ?${scope.sql}${loai.sql}`)
      .bind(stage.fromStates[0], ...scope.binds, ...loai.binds)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }
  // pxk_chuyen_tien: "dang cho" = pxk.trang_thai_chuyen_tien dang o dung trang thai bat dau giai
  // doan nay (khong doc tu log vi khong co cot rieng cho "dang o giai doan nao" - trang_thai_chuyen_tien
  // CHINH LA trang thai hien tai, khong can gop qua log).
  const chuyenTienTrangThai = stageKey === "cho_chuyen_tien" ? "Cho KTV chuyen" : "KTV da chuyen";
  const scope = scopeClause("pxk.nguoi_nhan_hang");
  const loai = loaiDeXuatClause(
    "(SELECT ddh.loai_de_xuat FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id LIMIT 1)",
  );
  const row = await db
    .prepare(`SELECT COUNT(*) as n FROM phieu_xuat_kho pxk WHERE pxk.so_tien_can_chuyen IS NOT NULL AND pxk.trang_thai_chuyen_tien = ?${scope.sql}${loai.sql}`)
    .bind(chuyenTienTrangThai, ...scope.binds, ...loai.binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
