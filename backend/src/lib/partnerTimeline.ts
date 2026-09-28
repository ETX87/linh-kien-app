// Xay "timeline" chuan hoa cho API tra cuu doi tac (routes/partnerApi.ts, phan hoi 2026-09-05: "hệ
// thống đối tác gửi case_id sang, hệ mua hàng trả về các đơn hàng + toàn bộ log chính cua cac qua
// trinh lien quan"). 4 bang log nguon (dat_don_hang_log/thieu_lk_log/phieu_xuat_kho_log/tra_hang_log)
// co 4 SHAPE va tap trang_thai KHAC NHAU - neu tra thang ra ngoai, moi he doi tac phai tu hoc 4 schema
// + tu suy quan he join, va MOI LAN sua luong noi bo (da xay ra lien tuc) co nguy co vo hop dong API.
// Thay vao do, gop tat ca thanh 1 mang "event" PHANG, DA SAP THEO THOI GIAN, cung 1 shape - xem
// TimelineEvent. Ten `event` la 1 ENUM CO DINH, TU DAT TEN RIENG (khong phai ten cot/gia tri DB) - day
// moi la hop dong THAT voi doi tac, doi cau truc noi bo khong anh huong gi mien enum nay giu nguyen.
//
// Pattern "4 query rieng, IN (...) 1 lan, khong N+1 theo so don" tham khao dung y tuong voi
// lib/slaMetrics.ts (dang dung cho bao cao "Tốc độ xử lý") - khac o cho slaMetrics.ts GHEP CAP 2 dong
// lien tiep thanh 1 "stage instance" co gioCho (thoi gian cho), con o day chi can list PHANG tung su
// kien don le (khong ghep cap) vi muc dich la tra cuu lich su, khong phai do SLA.

export interface TimelineEvent {
  at: string; // ISO 8601 co offset, vd "2026-08-24T10:00:00+07:00" - xem toIsoVN()
  event: string; // ma su kien on dinh, xem cac *_EVENT map duoi
  actor: string | null;
  note: string | null;
  source: "mua_hang" | "thieu_lk" | "phieu_xuat_kho" | "tra_hang";
}

export interface OrderTimeline {
  order_id: string;
  ma_lk: string;
  ten_lk: string | null;
  loai_don: string;
  trang_thai_hien_tai: string | null;
  nguoi_tao: string;
  nguoi_nhan_hang: string | null;
  ngay_tao: string;
  phieu_xuat_kho: { id: string; ma_xuat_kho: string }[];
  timeline: TimelineEvent[];
}

export interface CaseTimelineResult {
  case_id: string;
  orders: OrderTimeline[];
}

// nowVN() (xem lib/vnTime.ts) luu "YYYY-MM-DD HH:MM:SS" - gio VN THAT nhung KHONG co offset trong
// chuoi. Doi sang ISO 8601 co offset +07:00 that su cho hop dong API doi tac (chuan quoc te, khong
// bat doi tac tu suy doan timezone tu 1 chuoi tho khong offset).
function toIsoVN(vnLocal: string): string {
  return `${vnLocal.replace(" ", "T")}+07:00`;
}

function inPlaceholders(n: number): string {
  return Array(n).fill("?").join(",");
}

// ---------- Enum su kien on dinh (hop dong THAT voi doi tac) ----------

const DON_HANG_EVENT: Record<string, string> = {
  "Cho Tram duyet": "cho_tram_duyet",
  "Cho TBP xac nhan": "cho_tbp_xac_nhan",
  "Cho TN duyet": "cho_tn_duyet",
  "TN da duyet": "tn_da_duyet",
  "TN tu choi": "tn_tu_choi",
  "Cho hang": "cho_hang",
  "Da huy": "da_huy",
};

const THIEU_LK_EVENT: Record<string, string> = {
  "Cho kho xu ly": "thieu_lk_cho_kho_xu_ly",
  "Kho da tiep nhan": "thieu_lk_kho_da_tiep_nhan",
  "Kho da cap nhat": "thieu_lk_kho_da_cap_nhat",
  "Kho xac nhan hang da ve": "thieu_lk_kho_xac_nhan_hang_ve",
  "Kho tu choi sai TT": "thieu_lk_kho_tu_choi",
  "Da huy bo": "thieu_lk_huy_bo",
  "Da ket thuc": "thieu_lk_ket_thuc",
};

const PXK_EVENT: Record<string, string> = {
  "Dang tao phieu": "pxk_dang_tao_phieu",
  "Cho ke toan": "pxk_cho_ke_toan",
  "Da chot xong don xuat": "pxk_da_chot_don_xuat",
  "Dang gui KTV": "pxk_dang_gui_ktv",
  "KTV da nhan": "pxk_ktv_da_nhan",
  "Ke toan huy": "pxk_ke_toan_huy",
  "Hang tru kho": "pxk_hang_tru_kho",
  "Kho da ket thuc": "pxk_kho_da_ket_thuc",
  "Kho da nhan hang tra": "pxk_kho_da_nhan_hang_tra",
};

const TRA_HANG_EVENT: Record<string, string> = {
  "Cho ke toan duyet mem": "tra_hang_cho_ke_toan_duyet_mem",
  "Cho kho xac nhan": "tra_hang_cho_kho_xac_nhan",
  "Cho QC xac nhan": "tra_hang_cho_qc_xac_nhan",
  "Cho TN duyet tong": "tra_hang_cho_tn_duyet_tong",
  "TN da duyet": "tra_hang_tn_da_duyet",
  "Tu choi": "tra_hang_tu_choi",
  "Da huy": "tra_hang_da_huy",
};

// "Chuyen tien" KHONG doi cot trang_thai chinh cua phieu_xuat_kho_log (xem giai thich trong
// lib/slaMetrics.ts) - nhan biet qua 3 mau ghi_chu CO DINH ghi tu routes/phieuXuatKho.ts. COUPLING:
// doi chu trong file do (nhanh "KTV da chuyen"/PATCH .../chuyen-tien) phai sua lai CA o day va CA
// slaMetrics.ts, khong co co che nao doi chieu tu dong 3 noi nay.
const CHUYEN_TIEN_REQUEST_PREFIX = "Yêu cầu KTV chuyển";
const CHUYEN_TIEN_CONFIRM_GHICHU = "Đã đính bằng chứng/ghi chú chuyển tiền";
const CHUYEN_TIEN_APPROVE_GHICHU = "Kế toán đã duyệt bằng chứng chuyển tiền";

function pxkEventFor(trangThai: string, ghiChu: string | null): string {
  const g = ghiChu ?? "";
  if (g.startsWith(CHUYEN_TIEN_REQUEST_PREFIX)) return "pxk_chuyen_tien_yeu_cau";
  if (g === CHUYEN_TIEN_CONFIRM_GHICHU) return "pxk_chuyen_tien_da_dinh_bang_chung";
  if (g === CHUYEN_TIEN_APPROVE_GHICHU) return "pxk_chuyen_tien_ke_toan_duyet";
  return PXK_EVENT[trangThai] ?? `pxk_${trangThai}`;
}

interface RawLogRow {
  order_id: string;
  trang_thai: string;
  nguoi_xu_ly: string;
  ngay_xu_ly: string;
  ghi_chu: string | null;
}

// Ham chinh - id trong ham nay LUON la dat_don_hang.id (1 "don hang" trong "hop dong" API, khac voi
// "case_id" la khai niem cua he DVBH goc). Tra { case_id, orders: [] } (200, KHONG phai 404) khi
// khong co don nao khop - case_id hop le ve mat cu phap, chi la chua/khong con don noi bo nao gan
// voi no, don gian hoa xu ly phia doi tac (khong phai phan biet 404 vs 200-rong).
export async function buildCaseTimeline(db: D1Database, caseId: string): Promise<CaseTimelineResult> {
  // 1) Tim toan bo dat_don_hang_id gan voi case nay - UNION ca cot don ma_yeu_cau_su_co (legacy, 1-1,
  // xem migrations/0001_init.sql:185) LAN bang dat_don_case (many-to-many that su, migration
  // 0001_init.sql:214) de khong bo sot du lieu cu chi gan qua duong legacy.
  const { results: idRows } = await db
    .prepare(
      `SELECT id FROM dat_don_hang WHERE ma_yeu_cau_su_co = ?
       UNION
       SELECT dat_don_hang_id as id FROM dat_don_case WHERE case_id = ?`,
    )
    .bind(caseId, caseId)
    .all<{ id: string }>();
  const orderIds = idRows.map((r) => r.id);
  if (orderIds.length === 0) return { case_id: caseId, orders: [] };

  const idPh = inPlaceholders(orderIds.length);

  // 2) Thong tin goc cua tung don - trang_thai_hien_tai la cot MIRROR duoc app code tu bump moi lan
  // ghi log (xem comment migration 0087 trong datMuaLinhKien.ts) nen doc thang duoc, khong can
  // correlated subquery rieng.
  const { results: orderRows } = await db
    .prepare(
      `SELECT id, ma_lk, ten_lk_snapshot, loai_don, trang_thai_hien_tai, nguoi_tao, nguoi_nhan_hang, ngay_tao
       FROM dat_don_hang WHERE id IN (${idPh})`,
    )
    .bind(...orderIds)
    .all<{
      id: string; ma_lk: string; ten_lk_snapshot: string | null; loai_don: string; trang_thai_hien_tai: string | null;
      nguoi_tao: string; nguoi_nhan_hang: string | null; ngay_tao: string;
    }>();

  // 3) Lien ket PXK - 1 PXK co the gom nhieu dong dat_don_hang (join table phieu_xuat_kho_dong,
  // migration 0001_init.sql:270) nen 1 su kien PXK (vd "Kho da ket thuc"/chuyen tien) can duoc gan
  // cho MOI don cung thuoc PXK do, khong chi 1 don.
  const { results: dongRows } = await db
    .prepare(`SELECT phieu_xuat_kho_id, dat_don_hang_id FROM phieu_xuat_kho_dong WHERE dat_don_hang_id IN (${idPh})`)
    .bind(...orderIds)
    .all<{ phieu_xuat_kho_id: string; dat_don_hang_id: string }>();
  const pxkIdToOrderIds = new Map<string, string[]>();
  for (const r of dongRows) {
    if (!pxkIdToOrderIds.has(r.phieu_xuat_kho_id)) pxkIdToOrderIds.set(r.phieu_xuat_kho_id, []);
    pxkIdToOrderIds.get(r.phieu_xuat_kho_id)!.push(r.dat_don_hang_id);
  }
  const pxkIds = [...pxkIdToOrderIds.keys()];

  const pxkBaseRows =
    pxkIds.length === 0
      ? []
      : (
          await db
            .prepare(`SELECT id, ma_xuat_kho FROM phieu_xuat_kho WHERE id IN (${inPlaceholders(pxkIds.length)})`)
            .bind(...pxkIds)
            .all<{ id: string; ma_xuat_kho: string }>()
        ).results;

  // 4) 4 truy van log SONG SONG, MOI truy van 1 lan IN (...) tren toan bo tap id lien quan - hang so
  // (4 query) KHONG NHAN theo so don/PXK, tranh N+1.
  const [ddhLog, thieuLkLog, pxkLog, traHangLog] = await Promise.all([
    db
      .prepare(
        `SELECT dat_don_hang_id as order_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu
         FROM dat_don_hang_log WHERE dat_don_hang_id IN (${idPh}) ORDER BY dat_don_hang_id, id`,
      )
      .bind(...orderIds)
      .all<RawLogRow>(),
    db
      .prepare(
        `SELECT t.dat_don_hang_id as order_id, l.trang_thai, l.nguoi_xu_ly, l.ngay_xu_ly, l.ghi_chu
         FROM thieu_lk_log l JOIN thieu_lk t ON t.id = l.thieu_lk_id
         WHERE t.dat_don_hang_id IN (${idPh}) ORDER BY t.dat_don_hang_id, l.id`,
      )
      .bind(...orderIds)
      .all<RawLogRow>(),
    pxkIds.length === 0
      ? Promise.resolve({ results: [] as (RawLogRow & { phieu_xuat_kho_id: string })[] })
      : db
          .prepare(
            `SELECT phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu
             FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id IN (${inPlaceholders(pxkIds.length)}) ORDER BY phieu_xuat_kho_id, id`,
          )
          .bind(...pxkIds)
          .all<RawLogRow & { phieu_xuat_kho_id: string }>(),
    db
      .prepare(
        `SELECT dat_don_hang_id as order_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu
         FROM tra_hang_log WHERE dat_don_hang_id IN (${idPh}) ORDER BY dat_don_hang_id, id`,
      )
      .bind(...orderIds)
      .all<RawLogRow>(),
  ]);

  const timelineByOrder = new Map<string, TimelineEvent[]>();
  for (const id of orderIds) timelineByOrder.set(id, []);

  for (const r of ddhLog.results) {
    timelineByOrder.get(r.order_id)?.push({
      at: toIsoVN(r.ngay_xu_ly),
      event: DON_HANG_EVENT[r.trang_thai] ?? r.trang_thai,
      actor: r.nguoi_xu_ly,
      note: r.ghi_chu,
      source: "mua_hang",
    });
  }
  for (const r of thieuLkLog.results) {
    timelineByOrder.get(r.order_id)?.push({
      at: toIsoVN(r.ngay_xu_ly),
      event: THIEU_LK_EVENT[r.trang_thai] ?? `thieu_lk_${r.trang_thai}`,
      actor: r.nguoi_xu_ly,
      note: r.ghi_chu,
      source: "thieu_lk",
    });
  }
  for (const r of pxkLog.results) {
    const orderIdsForPxk = pxkIdToOrderIds.get(r.phieu_xuat_kho_id) ?? [];
    const event: TimelineEvent = {
      at: toIsoVN(r.ngay_xu_ly),
      event: pxkEventFor(r.trang_thai, r.ghi_chu),
      actor: r.nguoi_xu_ly,
      note: r.ghi_chu,
      source: "phieu_xuat_kho",
    };
    for (const oid of orderIdsForPxk) timelineByOrder.get(oid)?.push(event);
  }
  for (const r of traHangLog.results) {
    timelineByOrder.get(r.order_id)?.push({
      at: toIsoVN(r.ngay_xu_ly),
      event: TRA_HANG_EVENT[r.trang_thai] ?? `tra_hang_${r.trang_thai}`,
      actor: r.nguoi_xu_ly,
      note: r.ghi_chu,
      source: "tra_hang",
    });
  }

  const orders: OrderTimeline[] = orderRows.map((o) => {
    const timeline = (timelineByOrder.get(o.id) ?? []).slice().sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const pxkForOrder = [...pxkIdToOrderIds.entries()]
      .filter(([, oids]) => oids.includes(o.id))
      .map(([pxkId]) => pxkBaseRows.find((p) => p.id === pxkId))
      .filter((p): p is { id: string; ma_xuat_kho: string } => !!p);
    return {
      order_id: o.id,
      ma_lk: o.ma_lk,
      ten_lk: o.ten_lk_snapshot,
      loai_don: o.loai_don,
      trang_thai_hien_tai: o.trang_thai_hien_tai,
      nguoi_tao: o.nguoi_tao,
      nguoi_nhan_hang: o.nguoi_nhan_hang,
      ngay_tao: toIsoVN(o.ngay_tao),
      phieu_xuat_kho: pxkForOrder,
      timeline,
    };
  });

  return { case_id: caseId, orders };
}
