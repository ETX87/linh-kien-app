import type {
  Pxk,
  ThieuLkTicket,
  TonKhoRow,
  SlaGiaiDoan,
  SlaRow,
  KhuVucRow,
  LoaiDeXuatRow,
  UserRow,
  PendingUserRow,
  LoginLogRow,
} from "../types";
import { KTV_LIST, tenOf } from "./people";
import { PARTS } from "./catalog";

const part = (ma: string) => PARTS.find((p) => p.ma === ma)!;
const now = "2026-09-10T09:00";

// ---------- S8 Phiếu xuất kho ----------
const PXK_STEPS = ["Đang tạo phiếu", "Chờ kế toán", "Đang gửi KTV", "Kho đã kết thúc"] as const;
function pxkLogs(step: Pxk["buoc"]) {
  const idx = PXK_STEPS.indexOf(step);
  const actors = ["Tác nghiệp D", "Kế toán C", "Kho Trung Tâm", "Kho Trung Tâm"];
  const stamps = ["2026-09-08T10:00", "2026-09-08T14:00", "2026-09-09T09:00", "2026-09-09T16:00"];
  const logs = [{ trangThai: "Tạo phiếu", nguoiXuLy: "Tác nghiệp D", ngayXuLy: "2026-09-08T09:30", ghiChu: null as string | null }];
  for (let i = 0; i < Math.max(idx, 0); i++) logs.push({ trangThai: PXK_STEPS[i], nguoiXuLy: actors[i], ngayXuLy: stamps[i], ghiChu: null });
  logs.push({ trangThai: step, nguoiXuLy: idx <= 0 ? "Tác nghiệp D" : "—", ngayXuLy: stamps[Math.min(idx, 3)], ghiChu: "Đang xử lý" });
  return logs;
}
interface PSeed { n: number; loai: Pxk["loai"]; nhan: string; buoc: Pxk["buoc"]; xk: string | null; misa: string | null; tien: number | null; tt: Pxk["ttChuyenTien"]; uu?: boolean; lk: [string, number][] }
const PSEED: PSeed[] = [
  { n: 501, loai: "mua", nhan: "ktv.a@3t.vn", buoc: "Đang tạo phiếu", xk: null, misa: null, tien: 700000, tt: "Chưa", lk: [["LK025", 2]] },
  { n: 502, loai: "mua", nhan: "vetinh.b@3t.vn", buoc: "Chờ kế toán", xk: "XK-99231", misa: null, tien: 350000, tt: "Chờ KTV chuyển", uu: true, lk: [["LK001", 1]] },
  { n: 503, loai: "cong_no", nhan: "ktv.e@3t.vn", buoc: "Đang gửi KTV", xk: "XK-99240", misa: "MS-10233", tien: 3120000, tt: "KTV đã chuyển", lk: [["LK030", 4]] },
  { n: 504, loai: "mua", nhan: "ktv.f@3t.vn", buoc: "Kho đã kết thúc", xk: "XK-99188", misa: "MS-10190", tien: 0, tt: "TN đã duyệt", lk: [["LK031", 1]] },
  { n: 505, loai: "tra_hang", nhan: "ktv.a@3t.vn", buoc: "Chờ kế toán", xk: "XK-TR-771", misa: null, tien: null, tt: null, lk: [["LK002", 2]] },
  { n: 506, loai: "cong_no", nhan: "vetinh.d@3t.vn", buoc: "Đang tạo phiếu", xk: null, misa: null, tien: 540000, tt: "Chưa", lk: [["LK020", 3], ["LK025", 1]] },
  { n: 507, loai: "tra_hang", nhan: "ktv.e@3t.vn", buoc: "Đang gửi KTV", xk: "XK-TR-772", misa: "MS-TR-88", tien: null, tt: null, uu: true, lk: [["LK011", 1]] },
];
export const PXK: Pxk[] = PSEED.map((s) => {
  const k = KTV_LIST.find((x) => x.email === s.nhan)!;
  return {
    id: `PXK-${s.n}`,
    loai: s.loai,
    nguoiNhanHang: s.nhan,
    nguoiNhanHangTen: k.ten,
    gsTen: k.gsTen,
    soDong: s.lk.length,
    maXuatKho: s.xk,
    maMisa: s.misa,
    maVanDon: s.buoc === "Kho đã kết thúc" ? "VD-" + s.n : null,
    soTienCanChuyen: s.tien,
    ttChuyenTien: s.tt,
    anhBienBan: s.buoc === "Kho đã kết thúc",
    buoc: s.buoc,
    coDonUuTien: !!s.uu,
    ngayTao: "2026-09-0" + (2 + (s.n % 7)) + "T09:30",
    dong: s.lk.map(([ma, sl], i) => ({ id: `${s.n}-${i}`, maLk: ma, tenLk: part(ma).ten, slDeXuat: sl, slThucXuat: sl, giaChot: (part(ma).giaBan ?? 0) * sl })),
    logs: pxkLogs(s.buoc),
  };
});

// ---------- S9 Thiếu linh kiện ----------
const TLK_STEPS = ["Chờ kho tiếp nhận", "Kho đã tiếp nhận", "Chờ kho xác nhận", "Đã về kho", "Đã kết thúc"] as const;
function tlkLogs(tt: ThieuLkTicket["trangThai"]) {
  const idx = TLK_STEPS.indexOf(tt as (typeof TLK_STEPS)[number]);
  const logs = [{ trangThai: "Tạo ticket", nguoiXuLy: "Kho Trung Tâm", ngayXuLy: "2026-09-06T08:00", ghiChu: null as string | null }];
  for (let i = 0; i < Math.max(idx, 0); i++) logs.push({ trangThai: TLK_STEPS[i], nguoiXuLy: i < 3 ? "Kho Trung Tâm" : "Tác nghiệp D", ngayXuLy: "2026-09-0" + (7 + i) + "T10:00", ghiChu: null });
  logs.push({ trangThai: tt, nguoiXuLy: "—", ngayXuLy: now, ghiChu: idx >= 0 && idx < 4 ? "Đang xử lý" : null });
  return logs;
}
interface TSeed { n: number; donGoc: string; nhan: string; lk: string; loai: "mua" | "cong_no"; tt: ThieuLkTicket["trangThai"]; uu?: boolean; duKien?: string | null }
const TSEED: TSeed[] = [
  { n: 1, donGoc: "DH-2390", nhan: "ktv.a@3t.vn", lk: "LK025", loai: "mua", tt: "Kho đã tiếp nhận", duKien: "2026-09-14", uu: false },
  { n: 2, donGoc: "DH-2405", nhan: "tram.hadong@3t.vn", lk: "LK002", loai: "mua", tt: "Chờ kho xác nhận", duKien: "2026-09-12", uu: true },
  { n: 3, donGoc: "DH-2406", nhan: "ktv.e@3t.vn", lk: "LK030", loai: "mua", tt: "Đã kết thúc", duKien: "2026-09-09" },
  { n: 4, donGoc: "DH-2404", nhan: "ktv.a@3t.vn", lk: "LK020", loai: "cong_no", tt: "Chờ kho tiếp nhận", duKien: null },
  { n: 5, donGoc: "DH-2407", nhan: "ktv.f@3t.vn", lk: "LK025", loai: "cong_no", tt: "Chờ kho tiếp nhận", duKien: null, uu: false },
  { n: 6, donGoc: "DH-2350", nhan: "vetinh.b@3t.vn", lk: "LK001", loai: "mua", tt: "Kho đã tiếp nhận", duKien: "2026-09-15" },
  { n: 7, donGoc: "DH-2348", nhan: "ktv.e@3t.vn", lk: "LK011", loai: "mua", tt: "Từ chối sai thông tin", duKien: null },
];
export const THIEU_LK: ThieuLkTicket[] = TSEED.map((s) => {
  const k = KTV_LIST.find((x) => x.email === s.nhan)!;
  return {
    id: `TLK-${String(s.n).padStart(2, "0")}`,
    donGoc: s.donGoc,
    maLk: s.lk,
    tenLk: part(s.lk).ten,
    loaiDon: s.loai,
    lyDoCham: "Chờ hàng nhập kho",
    ngayDuKien: s.duKien ?? null,
    nguoiTaoTicket: "kho.trungtam@3t.vn",
    nguoiNhanHang: s.nhan,
    nguoiNhanHangTen: k.ten,
    gsTen: k.gsTen,
    ngayTao: "2026-09-0" + (5 + (s.n % 4)) + "T08:15",
    trangThai: s.tt,
    uuTien: !!s.uu,
    logs: tlkLogs(s.tt),
  };
});

// ---------- S12 Tồn kho công nợ KTV ----------
export const TON_KHO: TonKhoRow[] = KTV_LIST.map((k, i) => {
  const dg = i % 3 === 0 ? "Vượt trần" : i % 3 === 1 ? "Cảnh báo" : "Bình thường";
  const chiTiet = PARTS.slice(0, 3 + (i % 4)).map((p, j) => {
    const dau = (i + j) % 4;
    const nhap = (j + 1) * 2;
    const xuat = j + 1;
    return { maHang: p.ma, tenHang: p.ten, dvt: p.donVi ?? "Cái", dauKy: dau, nhap, xuat, cuoiKy: dau + nhap - xuat };
  });
  return {
    maKho: k.email.split("@")[0],
    tenKtv: k.ten,
    soMatHang: chiTiet.length,
    tongCuoiKy: chiTiet.reduce((a, c) => a + c.cuoiKy, 0),
    congNo: [12_500_000, 7_800_000, 2_100_000][i % 3],
    danhGiaCongNo: dg as TonKhoRow["danhGiaCongNo"],
    capNhatLuc: "2026-09-09T18:30",
    chiTiet,
  };
});

// ---------- S13 SLA ----------
function slaRows(base: number): SlaRow[] {
  return KTV_LIST.slice(0, 5).map((k, i) => ({
    email: k.email,
    ten: k.ten,
    daXuLy: base + i * 3,
    tuChoi: i % 3,
    tbGio: +(6 + i * 1.7).toFixed(1),
    tbGioKyTruoc: +(6 + i * 1.7 + (i % 2 ? 1.4 : -0.9)).toFixed(1),
  }));
}
export const SLA: SlaGiaiDoan[] = [
  { key: "tao-duyet", label: "Tạo đơn → Trạm/TN duyệt", luong: "mua_cong_no", dangCho: 12, rows: slaRows(18) },
  { key: "tn-duyet", label: "Chờ TN duyệt", luong: "mua_cong_no", dangCho: 8, rows: slaRows(22) },
  { key: "th-tong", label: "Trả hàng: các bước duyệt", luong: "tra_hang", dangCho: 5, rows: slaRows(9) },
  { key: "pxk-ketoan", label: "PXK: gán mã & MISA", luong: "pxk", dangCho: 6, rows: slaRows(14) },
  { key: "ktv-nhan", label: "Chờ KTV xác nhận nhận hàng", luong: "cho_ktv", dangCho: 15, rows: slaRows(20) },
];

// ---------- S14 Settings ----------
export const KHU_VUC: KhuVucRow[] = [
  { ma: "MB1", ten: "Miền Bắc 1", gsEmail: "gs.mienbac@3t.vn", gsTen: "Lê Thị C", soKtv: 4 },
  { ma: "MB2", ten: "Miền Bắc 2", gsEmail: "gs.mienbac@3t.vn", gsTen: "Lê Thị C", soKtv: 1 },
  { ma: "MN1", ten: "Miền Nam 1", gsEmail: "gs.miennam@3t.vn", gsTen: "Ngô Văn H", soKtv: 0 },
  { ma: "MN2", ten: "Miền Nam 2", gsEmail: "gs.miennam@3t.vn", gsTen: "Ngô Văn H", soKtv: 2 },
  { ma: "B2B-MN", ten: "B2B Miền Nam", gsEmail: null, gsTen: null, soKtv: 0 },
];
export const LOAI_DE_XUAT_ROWS: LoaiDeXuatRow[] = [
  { ten: "Đề xuất mua mới", nhom: "Mua hàng", batTat: true },
  { ten: "Đề xuất mua (công nợ)", nhom: "Công nợ", batTat: true },
  { ten: "Đổi linh kiện lỗi", nhom: "Mua hàng", batTat: true },
  { ten: "Bổ sung tồn kho", nhom: "Mua hàng", batTat: true },
  { ten: "Trả hàng lỗi kỹ thuật", nhom: "Trả hàng", batTat: true },
  { ten: "Trả hàng thừa", nhom: "Trả hàng", batTat: false },
];

// ---------- S15 Users ----------
export const USERS_OFFICE: UserRow[] = [
  { email: "admin@3t.vn", ten: "Nguyễn Văn An", vaiTro: "Admin", co: ["KTV DVBH", "Kho", "Kế toán", "TN"], khuVuc: [], trangThai: "Hoạt động" },
  { email: "qc@3t.vn", ten: "Trần Thị QC", vaiTro: "QC", co: [], khuVuc: [], trangThai: "Hoạt động" },
  { email: "tacnghiep.d@3t.vn", ten: "Tác nghiệp D", vaiTro: "—", co: ["TN", "Quản lý DM LK"], khuVuc: ["MB1", "MB2"], trangThai: "Hoạt động" },
  { email: "kho.trungtam@3t.vn", ten: "Kho Trung Tâm", vaiTro: "—", co: ["Kho"], khuVuc: ["MB1", "MB2", "MN2"], trangThai: "Hoạt động" },
  { email: "ketoan.c@3t.vn", ten: "Kế toán C", vaiTro: "—", co: ["Kế toán"], khuVuc: ["MB1"], trangThai: "Hoạt động" },
  { email: "tpdvbh.e@3t.vn", ten: "TP DVBH E", vaiTro: "—", co: ["TP DVBH", "Xem DM LK"], khuVuc: [], trangThai: "Khoá" },
];
export const USERS_PENDING: PendingUserRow[] = [
  { email: "khach.moi@3t.vn", ten: "Trần Văn Mới", ngayDangKy: "2026-09-09T14:20" },
  { email: "ctv.moi@3t.vn", ten: "Phạm Thị Tân", ngayDangKy: "2026-09-10T08:05" },
];
export const LOGIN_LOG: LoginLogRow[] = [
  { email: "admin@3t.vn", thoiGian: "2026-09-10T08:41", ip: "113.161.20.4", ua: "Chrome 128 · Windows" },
  { email: "tacnghiep.d@3t.vn", thoiGian: "2026-09-10T08:12", ip: "171.224.5.90", ua: "Safari 17 · iPhone" },
  { email: "kho.trungtam@3t.vn", thoiGian: "2026-09-09T17:55", ip: "113.161.20.7", ua: "Chrome 128 · Windows" },
  { email: "ktv.a@3t.vn", thoiGian: "2026-09-09T09:30", ip: "42.116.8.201", ua: "Chrome 127 · Android" },
];

export { tenOf };
