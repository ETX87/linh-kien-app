import type { ReturnOrder, ReturnStep, ReturnStatus, CaseInfo } from "../types";
import { PARTS } from "./catalog";
import { ktvOf, tenOf } from "./people";

const RETURN_STEPS: ReturnStep[] = [
  "Chờ kế toán duyệt mềm",
  "Chờ kho xác nhận",
  "Chờ QC xác nhận",
  "Chờ TN duyệt tổng",
  "Đã duyệt",
  "Lên PXK (trả hàng)",
];

const C: CaseInfo[] = [
  { id: "CS-2026-001", khachHang: "KH ABC", khuVuc: "Hà Nội", hang: "Samsung", sanPhamBaoHanh: "Galaxy A52" },
  { id: "CS-2026-002", khachHang: "KH XYZ", khuVuc: "Đà Nẵng", hang: "Apple", sanPhamBaoHanh: "iPhone 13" },
];

interface RSeed {
  n: number;
  nguoiTao: string;
  maLk: string;
  sl: number;
  buoc: ReturnStep;
  status: ReturnStatus;
  uuTien?: boolean;
  ngay: string;
  lyDo: string;
}

const RSEED: RSeed[] = [
  { n: 701, nguoiTao: "ktv.a@3t.vn", maLk: "LK001", sl: 2, buoc: "Chờ kế toán duyệt mềm", status: "Đang xử lý", ngay: "2026-09-08T14:30", lyDo: "Linh kiện bị lỗi, khách trả" },
  { n: 702, nguoiTao: "vetinh.b@3t.vn", maLk: "LK010", sl: 1, buoc: "Chờ kho xác nhận", status: "Đang xử lý", ngay: "2026-09-08T11:20", lyDo: "Sai model, cần đổi" },
  { n: 703, nguoiTao: "ktv.e@3t.vn", maLk: "LK025", sl: 3, buoc: "Chờ QC xác nhận", status: "Đang xử lý", uuTien: true, ngay: "2026-09-07T16:45", lyDo: "Pin phồng, lỗi nhà sản xuất" },
  { n: 704, nguoiTao: "tram.hadong@3t.vn", maLk: "LK030", sl: 1, buoc: "Chờ TN duyệt tổng", status: "Đang xử lý", ngay: "2026-09-07T10:20", lyDo: "Màn hình có điểm chết" },
  { n: 705, nguoiTao: "ktv.f@3t.vn", maLk: "LK002", sl: 2, buoc: "Đã duyệt", status: "Hoàn thành", ngay: "2026-09-05T15:10", lyDo: "Không dùng đến, hoàn kho" },
  { n: 706, nguoiTao: "vetinh.d@3t.vn", maLk: "LK040", sl: 4, buoc: "Chờ kế toán duyệt mềm", status: "Từ chối", ngay: "2026-09-04T09:05", lyDo: "Cáp sạc đứt ngầm" },
  { n: 707, nguoiTao: "ktv.a@3t.vn", maLk: "LK031", sl: 1, buoc: "Chờ kho xác nhận", status: "Đang xử lý", ngay: "2026-09-03T09:30", lyDo: "Bàn phím liệt phím" },
  { n: 708, nguoiTao: "ktv.e@3t.vn", maLk: "LK020", sl: 2, buoc: "Chờ kế toán duyệt mềm", status: "Đang xử lý", ngay: "2026-09-02T16:20", lyDo: "Loa rè" },
  { n: 709, nguoiTao: "vetinh.b@3t.vn", maLk: "LK011", sl: 1, buoc: "Đã duyệt", status: "Hoàn thành", ngay: "2026-09-01T10:15", lyDo: "Camera mờ, lỗi kỹ thuật" },
  { n: 710, nguoiTao: "ktv.f@3t.vn", maLk: "LK025", sl: 5, buoc: "Chờ QC xác nhận", status: "Đang xử lý", ngay: "2026-08-30T15:40", lyDo: "Lô pin lỗi hàng loạt" },
];

function buildLogs(s: RSeed) {
  const idx = RETURN_STEPS.indexOf(s.buoc);
  const stamps = ["2026-09-08T14:30", "2026-09-08T16:10", "2026-09-09T09:20", "2026-09-09T11:45", "2026-09-09T14:00", "2026-09-10T09:00"];
  const actors = ["Hệ thống", tenOf("ketoan.c@3t.vn"), tenOf("kho.trungtam@3t.vn"), tenOf("qc@3t.vn"), tenOf("tacnghiep.d@3t.vn"), tenOf("kho.trungtam@3t.vn")];
  const logs = [{ trangThai: "Tạo đơn", nguoiXuLy: tenOf(s.nguoiTao), ngayXuLy: s.ngay, ghiChu: null as string | null }];
  for (let i = 0; i < Math.max(idx, 0); i++) logs.push({ trangThai: RETURN_STEPS[i], nguoiXuLy: actors[i], ngayXuLy: stamps[i], ghiChu: null });
  if (s.status === "Từ chối") logs.push({ trangThai: "Từ chối", nguoiXuLy: tenOf("ketoan.c@3t.vn"), ngayXuLy: stamps[1], ghiChu: "Thiếu ảnh minh hoạ" });
  else logs.push({ trangThai: s.buoc, nguoiXuLy: idx <= 0 ? "Hệ thống" : "—", ngayXuLy: stamps[Math.min(idx, 5)], ghiChu: s.status === "Đang xử lý" ? "Đang xử lý" : null });
  return logs;
}

export const RETURNS: ReturnOrder[] = RSEED.map((s) => {
  const p = PARTS.find((x) => x.ma === s.maLk)!;
  const k = ktvOf(s.nguoiTao);
  const gia = p.giaBan ?? 0;
  return {
    id: `TH-${s.n}`,
    loai: "tra_hang",
    maLk: s.maLk,
    tenLk: p.ten,
    loaiDeXuat: "Trả hàng lỗi kỹ thuật",
    slDeXuat: s.sl,
    slThucXuat: s.sl,
    giaDeXuat: gia * s.sl,
    giaChot: gia * s.sl,
    soTienCongNo: null,
    danhGiaCongNo: null,
    nguoiTao: s.nguoiTao,
    nguoiTaoTen: tenOf(s.nguoiTao),
    taoHo: s.nguoiTao.startsWith("gs."),
    nguoiNhanHang: s.nguoiTao,
    nguoiNhanHangTen: tenOf(s.nguoiTao),
    emailGs: k?.giamSat ?? "gs.mienbac@3t.vn",
    gsTen: k?.gsTen ?? "Lê Thị C",
    tram: k?.tramCha ?? null,
    khuVuc: k?.khuVuc ?? "MB1",
    ngayTao: s.ngay,
    ghiChu: s.lyDo,
    yeuCauHoaDon: "Có",
    ttMailDuyet: "an.nguyen@3t.vn",
    ttKhachHang: "KH ABC",
    chinhSach: "Theo chính sách hiện hành",
    maYeuCauSuCo: "CS-2026-001",
    uuTien: !!s.uuTien,
    quaHan: false,
    lyDoCham: null,
    tranCongNo: 10_000_000,
    cases: C,
    logs: buildLogs(s),
    giaiTrinh:
      s.n === 701
        ? [
            { noiDung: "Chờ kế toán đối chiếu công nợ đợt trước.", nguoiTao: tenOf(s.nguoiTao), ngayTao: "2026-09-09T10:12", lanDau: true },
          ]
        : [],
    buoc: s.buoc,
    trangThaiTraHang: s.status,
    anhLinhKien: [],
    lyDoTra: s.lyDo,
  };
});

export { RETURN_STEPS };
