import type { Order, OrderStatus, LoaiDon, CaseInfo } from "../types";
import { PARTS } from "./catalog";
import { KTV_LIST, ktvOf, tenOf } from "./people";

function part(ma: string) {
  return PARTS.find((p) => p.ma === ma)!;
}

const CASES: CaseInfo[] = [
  { id: "CS-2026-001", khachHang: "KH ABC", khuVuc: "Hà Nội", tinh: "Hà Nội", quanHuyen: "Hà Đông", hang: "Samsung", sanPhamBaoHanh: "Galaxy A52", kyThuatVien: "Nguyễn Văn A", seri: "R58N90ABCDE", tienDo: "Đang xử lý" },
  { id: "CS-2026-002", khachHang: "KH XYZ", khuVuc: "Đà Nẵng", tinh: "Đà Nẵng", quanHuyen: "Hải Châu", hang: "Apple", sanPhamBaoHanh: "iPhone 13", kyThuatVien: "Hoàng Thị E", seri: "F2LXXABCX13", tienDo: "Chờ linh kiện" },
  { id: "CS-2026-003", khachHang: "KH 123", khuVuc: "TP.HCM", tinh: "TP.HCM", quanHuyen: "Quận 1", hang: "Xiaomi", sanPhamBaoHanh: "Redmi Note 11", kyThuatVien: "Vũ Văn F", seri: "XM11ABCDEF", tienDo: "Hoàn thành" },
];

interface Seed {
  n: number;
  loai: LoaiDon;
  nguoiTao: string;
  nguoiNhan: string;
  taoHo?: boolean;
  maLk: string;
  sl: number;
  tt: OrderStatus;
  uuTien?: boolean;
  quaHan?: boolean;
  lyDoCham?: string;
  ngay: string;
  cases?: number[];
  ghiChu?: string;
}

const SEED: Seed[] = [
  { n: 2401, loai: "mua", nguoiTao: "vetinh.b@3t.vn", nguoiNhan: "vetinh.b@3t.vn", maLk: "LK001", sl: 5, tt: "Chờ Trạm duyệt", ngay: "2026-09-08T14:30", cases: [0, 1], ghiChu: "Cần giao sớm" },
  { n: 2402, loai: "cong_no", nguoiTao: "gs.mienbac@3t.vn", nguoiNhan: "vetinh.d@3t.vn", taoHo: true, maLk: "LK002", sl: 3, tt: "Chờ Trạm duyệt", uuTien: true, ngay: "2026-09-08T11:20" },
  { n: 2403, loai: "mua", nguoiTao: "ktv.a@3t.vn", nguoiNhan: "ktv.a@3t.vn", maLk: "LK010", sl: 1, tt: "Chờ TBP xác nhận", ngay: "2026-09-07T16:45", cases: [1] },
  { n: 2404, loai: "cong_no", nguoiTao: "ktv.a@3t.vn", nguoiNhan: "ktv.a@3t.vn", maLk: "LK020", sl: 3, tt: "Chờ TN duyệt", ngay: "2026-09-07T10:20" },
  { n: 2405, loai: "mua", nguoiTao: "tram.hadong@3t.vn", nguoiNhan: "tram.hadong@3t.vn", maLk: "LK002", sl: 5, tt: "Chờ TN duyệt", uuTien: true, quaHan: true, ngay: "2026-09-05T09:10", ghiChu: "Đơn tồn quá 24h" },
  { n: 2406, loai: "mua", nguoiTao: "ktv.e@3t.vn", nguoiNhan: "ktv.e@3t.vn", maLk: "LK030", sl: 1, tt: "Chờ TN duyệt", ngay: "2026-09-06T13:05" },
  { n: 2407, loai: "cong_no", nguoiTao: "ktv.f@3t.vn", nguoiNhan: "ktv.f@3t.vn", maLk: "LK025", sl: 2, tt: "Chờ TN duyệt", quaHan: true, ngay: "2026-09-04T08:40", cases: [2] },
  { n: 2408, loai: "mua", nguoiTao: "vetinh.g@3t.vn", nguoiNhan: "vetinh.g@3t.vn", maLk: "LK031", sl: 1, tt: "Chờ Trạm duyệt", ngay: "2026-09-08T17:22" },
  { n: 2390, loai: "mua", nguoiTao: "ktv.a@3t.vn", nguoiNhan: "ktv.a@3t.vn", maLk: "LK025", sl: 2, tt: "TN đã duyệt", ngay: "2026-09-03T09:15" },
  { n: 2391, loai: "mua", nguoiTao: "vetinh.b@3t.vn", nguoiNhan: "vetinh.b@3t.vn", maLk: "LK001", sl: 1, tt: "TN đã duyệt", ngay: "2026-09-02T15:40" },
  { n: 2392, loai: "cong_no", nguoiTao: "ktv.e@3t.vn", nguoiNhan: "ktv.e@3t.vn", maLk: "LK030", sl: 4, tt: "TN đã duyệt", ngay: "2026-09-02T10:12" },
  { n: 2380, loai: "mua", nguoiTao: "ktv.e@3t.vn", nguoiNhan: "ktv.e@3t.vn", maLk: "LK011", sl: 1, tt: "Từ chối", lyDoCham: "Sai thông tin đơn hàng", ngay: "2026-09-01T11:30" },
  { n: 2381, loai: "cong_no", nguoiTao: "ktv.a@3t.vn", nguoiNhan: "ktv.a@3t.vn", maLk: "LK020", sl: 2, tt: "Đã huỷ", ngay: "2026-08-31T14:02" },
  { n: 2382, loai: "mua", nguoiTao: "vetinh.d@3t.vn", nguoiNhan: "vetinh.d@3t.vn", maLk: "LK002", sl: 6, tt: "Từ chối", lyDoCham: "Vượt hạn mức duyệt", ngay: "2026-08-30T09:20" },
  { n: 2409, loai: "mua", nguoiTao: "gs.mienbac@3t.vn", nguoiNhan: "ktv.a@3t.vn", taoHo: true, maLk: "LK001", sl: 2, tt: "Chờ TN duyệt", ngay: "2026-09-09T08:05", cases: [0] },
  { n: 2410, loai: "cong_no", nguoiTao: "vetinh.b@3t.vn", nguoiNhan: "vetinh.b@3t.vn", maLk: "LK025", sl: 8, tt: "Chờ Trạm duyệt", ngay: "2026-09-09T10:41" },
];

// Pad them ~14 don de bang/phan trang co du du lieu.
const PAD_TT: OrderStatus[] = ["Chờ TN duyệt", "TN đã duyệt", "Chờ Trạm duyệt", "Từ chối", "TN đã duyệt", "Chờ TN duyệt"];
const PAD_LK = ["LK001", "LK002", "LK020", "LK025", "LK030", "LK031"];
for (let i = 0; i < 14; i++) {
  const k = KTV_LIST[i % KTV_LIST.length];
  SEED.push({
    n: 2350 - i,
    loai: i % 3 === 0 ? "cong_no" : "mua",
    nguoiTao: k.email,
    nguoiNhan: k.email,
    maLk: PAD_LK[i % PAD_LK.length],
    sl: 1 + (i % 5),
    tt: PAD_TT[i % PAD_TT.length],
    uuTien: i % 7 === 0,
    quaHan: i % 9 === 0,
    ngay: `2026-08-${String(28 - (i % 20)).padStart(2, "0")}T${String(8 + (i % 9)).padStart(2, "0")}:15`,
  });
}

function buildLogs(s: Seed) {
  const logs = [{ trangThai: "Đơn tạo", nguoiXuLy: tenOf(s.nguoiTao), ngayXuLy: s.ngay, ghiChu: null as string | null }];
  const order: OrderStatus[] = ["Chờ Trạm duyệt", "Chờ TBP xác nhận", "Chờ TN duyệt", "TN đã duyệt"];
  const idx = order.indexOf(s.tt);
  const stamps = ["2026-09-08T14:50", "2026-09-08T15:20", "2026-09-08T16:10", "2026-09-09T09:00"];
  if (idx >= 0) {
    for (let i = 0; i < idx; i++) logs.push({ trangThai: order[i] === "Chờ Trạm duyệt" ? "Trạm duyệt" : order[i], nguoiXuLy: i === 0 ? "Hệ thống" : tenOf("gs.mienbac@3t.vn"), ngayXuLy: stamps[i], ghiChu: null });
    logs.push({ trangThai: s.tt, nguoiXuLy: idx === 0 ? "Hệ thống" : "—", ngayXuLy: stamps[Math.min(idx, 3)], ghiChu: idx === 3 ? "Đang xử lý" : null });
  } else if (s.tt === "Từ chối") {
    logs.push({ trangThai: "Từ chối", nguoiXuLy: tenOf("tacnghiep.d@3t.vn"), ngayXuLy: "2026-09-01T12:00", ghiChu: s.lyDoCham ?? null });
  } else if (s.tt === "Đã huỷ") {
    logs.push({ trangThai: "Đã huỷ", nguoiXuLy: tenOf(s.nguoiTao), ngayXuLy: "2026-08-31T14:30", ghiChu: "Người tạo huỷ" });
  }
  return logs;
}

export const ORDERS: Order[] = SEED.map((s) => {
  const p = part(s.maLk);
  const k = ktvOf(s.nguoiNhan);
  const gia = p.giaBan ?? 0;
  const isCongNo = s.loai === "cong_no";
  const tran = isCongNo ? 10_000_000 : null;
  const tien = gia * s.sl;
  return {
    id: `DH-${s.n}`,
    loai: s.loai,
    maLk: s.maLk,
    tenLk: p.ten,
    loaiDeXuat: isCongNo ? "Đề xuất mua (công nợ)" : "Đề xuất mua mới",
    slDeXuat: s.sl,
    slThucXuat: s.tt === "TN đã duyệt" ? s.sl : null,
    giaDeXuat: tien,
    giaChot: s.tt === "TN đã duyệt" ? tien : null,
    soTienCongNo: isCongNo ? tien : null,
    danhGiaCongNo: isCongNo ? (tran && tien <= tran ? "Đủ" : "Không đủ") : null,
    nguoiTao: s.nguoiTao,
    nguoiTaoTen: tenOf(s.nguoiTao),
    taoHo: s.taoHo,
    nguoiNhanHang: s.nguoiNhan,
    nguoiNhanHangTen: tenOf(s.nguoiNhan),
    emailGs: k?.giamSat ?? "gs.mienbac@3t.vn",
    gsTen: k?.gsTen ?? "Lê Thị C",
    tram: k?.tramCha ?? null,
    khuVuc: k?.khuVuc ?? "MB1",
    ngayTao: s.ngay,
    ghiChu: s.ghiChu ?? null,
    yeuCauHoaDon: "Có",
    ttMailDuyet: "an.nguyen@3t.vn",
    ttKhachHang: s.cases ? CASES[s.cases[0]].khachHang : "KH ABC",
    chinhSach: "Theo chính sách hiện hành",
    maYeuCauSuCo: s.cases ? CASES[s.cases[0]].id : null,
    uuTien: !!s.uuTien,
    trangThai: s.tt,
    quaHan: !!s.quaHan,
    lyDoCham: s.lyDoCham ?? null,
    tranCongNo: tran,
    cases: (s.cases ?? []).map((i) => CASES[i]),
    logs: buildLogs(s),
    giaiTrinh: s.quaHan
      ? [
          { noiDung: "Đang chờ phản hồi từ khách về lịch hẹn.", nguoiTao: tenOf(s.nguoiTao), ngayTao: "2026-09-08T10:12", lanDau: false },
          { noiDung: "Khách yêu cầu dời lịch, chưa chốt được ngày.", nguoiTao: tenOf(s.nguoiTao), ngayTao: "2026-09-07T09:30", lanDau: true },
        ]
      : [],
  };
});
