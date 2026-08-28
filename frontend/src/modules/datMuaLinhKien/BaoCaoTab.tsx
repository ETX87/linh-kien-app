import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, buildQuery } from "../../api/client";
import { fmtVND } from "../../types";
import { Btn } from "../../components/ui/Btn";
import { formatPersonDisplay, usePersonDirectory } from "../../lib/personDisplay";
import { useIsMobile } from "../../hooks/useMediaQuery";
import type { BaoCaoRow, JumpTarget } from "./types";

// Nhan "Tháng N/N-1/N-2" (them 2026-08-25, phan hoi "hạn chế theo tháng") - tinh CLIENT-SIDE bang gio
// trinh duyet (khong can round-trip server chi de lay nhan hien thi cho ca 3 tab, chi tab dang chon
// moi thuc su goi API).
function thangLabel(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
}

// Tab "Bao cao" (nang cap 2026-08-15 thanh tab rieng + bang theo KTV cho GS/TN/Kho/Ke toan, click 1
// con so nhay sang danh sach chi tiet kem san filter).
//
// SUA (2026-08-28, phan hoi "màn home, các mục card bỏ hết chuyển hết về dạng table"): bo han nhanh
// StatCard rieng cho view ca nhan (!isManagerView) - GOM 1 luoi duy nhat "3 bang" dung CHUNG cho ca ca
// nhan (rows.length===1, khong search/sort) lan quan ly (rows.length>1, co search + sap xep theo ton
// dong) - moi con so LUON la nut bam nhay tab/filter tuong ung, dung yeu cau "vẫn có thể click vào
// từng số để đến bảng chi tiết". 3 bang tach theo dung nhom cot nguoi dung yeu cau (Don hang / Xuat
// kho / Tien) thay vi 1 bang duy nhat 3 nhom cot nhu truoc.
//
// Ghi chu ve may diem KHONG the nhay-chinh-xac-tuyet-doi (backend GET /don-hang chi loc 1 gia tri
// trang_thai/loai_don MOI LAN, khong OR nhieu gia tri): "Tổng đơn"/"Đơn đang chờ"/"Tổng duyệt"/"Tiền
// chờ duyệt" gop CA mua+cong_no (jump khong truyen loaiDon, giu dung tien le cu cua "SL đơn"/"Tổng
// tiền đặt mua" truoc day) nen KHONG kem theo tra_hang trong DANH SACH nhay toi (dù con so hien thi DA
// gom tra_hang) - muon xem tra_hang rieng thi bam cot "Đơn trả"/"Duyệt trả". "Kho kết thúc" gop 2
// trang thai PXK ("Kho da ket thuc" + "Hang tru kho") nhung nhay chi loc duoc 1 ("Kho da ket thuc").
//
// Bo loc "Tháng N/N-1/N-2" + "Xem toàn hệ thống" (2026-08-25) - xem giai thich day du o GET
// /dat-mua-lk/bao-cao-tong-the backend.
export function BaoCaoTab({ onJump, isManagerView, canTraHangView }: { onJump: (t: JumpTarget) => void; isManagerView: boolean; canTraHangView: boolean }) {
  const personDir = usePersonDirectory();
  const isMobile = useIsMobile();
  const [thang, setThang] = useState(0);
  const [full, setFull] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["dat-mua-lk-bao-cao-tong-the", thang, full],
    queryFn: () => api.get<{ rows: BaoCaoRow[] }>("/dat-mua-lk/bao-cao-tong-the" + buildQuery({ thang, full: full ? 1 : undefined })),
  });
  const [search, setSearch] = useState("");
  // State mo/dong tung dong nguoi tren the mobile (muc A) - dat o COMPONENT CHA (khong phai trong
  // MobileTable) vi MobileTable la 1 ham dinh nghia lai MOI LAN BaoCaoTab render (giong Table/Num co
  // san) - neu useState nam TRONG do, React se coi no la 1 component type MOI moi lan cha render lai
  // (identity ham doi), gay unmount/remount mat het trang thai mo/dong ngay khi go chu vao o tim kiem.
  // Key dang "title:email" de phan biet cung 1 nguoi o 3 bang khac nhau (Don hang/Xuat kho/Tien).
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  function toggleExpandRow(key: string) {
    setExpandedRows((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  // SUA (phan hoi 2026-08-28, muc B "thu gọn bộ lọc") - tren mobile, bo loc Thang/Xem toan he thong an
  // sau nut "☰ Bộ lọc" (mac dinh dong) thay vi luon hien 1 hang rieng; desktop giu nguyen hien san
  // (khong ton dien tich dang ke tren man rong).
  const [showThangFilter, setShowThangFilter] = useState(false);

  const thangFilterRow = (
    <div className="flex items-center gap-1.5 flex-wrap">
      {[0, 1, 2].map((o) => (
        <Btn key={o} size="sm" variant={thang === o ? "primary" : "ghost"} onClick={() => setThang(o)}>
          {thangLabel(o)}
          {o === 0 ? " (đang xử lý)" : ""}
        </Btn>
      ))}
      {isManagerView && (
        <label className="flex items-center gap-1.5 text-xs text-[var(--ink-500)] ml-2 cursor-pointer select-none">
          <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
          Xem toàn hệ thống (bỏ qua khu vực phụ trách)
        </label>
      )}
    </div>
  );
  const thangFilterEl = isMobile ? (
    <div>
      <button
        type="button"
        onClick={() => setShowThangFilter((v) => !v)}
        className="focus-ring text-xs font-semibold text-[var(--ink-500)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 bg-[var(--surface)]"
      >
        {thangLabel(thang)}
        {thang === 0 ? " (đang xử lý)" : ""} · {showThangFilter ? "▲" : "☰ Đổi tháng ▾"}
      </button>
      {showThangFilter && <div className="mt-2">{thangFilterRow}</div>}
    </div>
  ) : (
    thangFilterRow
  );

  const rows = data?.rows ?? [];
  if (isLoading) return (
    <div className="mt-4 space-y-3">
      {thangFilterEl}
      <div className="text-sm text-[var(--ink-500)] py-6 text-center">Đang tải...</div>
    </div>
  );
  if (rows.length === 0) return (
    <div className="mt-4 space-y-3">
      {thangFilterEl}
      <div className="text-sm text-[var(--ink-400)] py-6 text-center">Chưa có dữ liệu.</div>
    </div>
  );

  // Ton dong = don chua xong (tru duyet/tu choi) + dong dang di qua PXK chua toi tay KTV. Sap xep
  // giam dan de day nguoi con nhieu viec len dau (chot voi chu he thong).
  function tonDong(r: BaoCaoRow) {
    return Math.max(0, r.slDon - r.slDuyet - r.slTuChoi) + r.slChoKeToan + r.slChoKhoGui + r.slDaGui;
  }
  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || (r.ten ?? "").toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  const sorted = rows.length > 1 ? [...filtered].sort((a, b) => tonDong(b) - tonDong(a) || (a.ten ?? a.email).localeCompare(b.ten ?? b.email)) : filtered;

  const tong = rows.reduce(
    (acc, r) => ({
      slDon: acc.slDon + r.slDon, slDonMua: acc.slDonMua + r.slDonMua, slDonCongNo: acc.slDonCongNo + r.slDonCongNo, slDonTraHang: acc.slDonTraHang + r.slDonTraHang,
      slDangCho: acc.slDangCho + r.slDangCho, slTuChoi: acc.slTuChoi + r.slTuChoi,
      slDuyet: acc.slDuyet + r.slDuyet, slDuyetMua: acc.slDuyetMua + r.slDuyetMua, slDuyetCongNo: acc.slDuyetCongNo + r.slDuyetCongNo, slDuyetTraHang: acc.slDuyetTraHang + r.slDuyetTraHang,
      tongPxk: acc.tongPxk + r.tongPxk, slChoKeToan: acc.slChoKeToan + r.slChoKeToan, slChoKhoGui: acc.slChoKhoGui + r.slChoKhoGui, slDaGui: acc.slDaGui + r.slDaGui,
      slDaXacNhan: acc.slDaXacNhan + r.slDaXacNhan, slKhoKetThuc: acc.slKhoKetThuc + r.slKhoKetThuc,
      tongTienThucTe: acc.tongTienThucTe + r.tongTienThucTe, tongTienDatMua: acc.tongTienDatMua + r.tongTienDatMua, tienChoDuyet: acc.tienChoDuyet + r.tienChoDuyet,
      tongChoChuyen: acc.tongChoChuyen + r.tongChoChuyen,
    }),
    { slDon: 0, slDonMua: 0, slDonCongNo: 0, slDonTraHang: 0, slDangCho: 0, slTuChoi: 0, slDuyet: 0, slDuyetMua: 0, slDuyetCongNo: 0, slDuyetTraHang: 0,
      tongPxk: 0, slChoKeToan: 0, slChoKhoGui: 0, slDaGui: 0, slDaXacNhan: 0, slKhoKetThuc: 0,
      tongTienThucTe: 0, tongTienDatMua: 0, tienChoDuyet: 0, tongChoChuyen: 0 },
  );
  // Muc A (phan hoi 2026-08-28 - "3 bảng chiếm quá nhiều diện tích/khó đọc trên mobile") - "tong" o
  // tren chi phuc vu dong Σ cua BANG DESKTOP (JSX <td> dung tay); tai su dung LAI dung cac ham
  // cols[].cell() cho MobileTable ben duoi can 1 BaoCaoRow day du - email="" khien cell.onClick nhay
  // KHONG kem nguoi_nhan_hang, dung y "tổng toàn hệ thống" (giong het jumpDon("", undefined) khong
  // truyen email cua tongRow desktop). slDeXuat/slThucDuyet khong duoc cols nao dung toi nen dien 0.
  const tongAsRow: BaoCaoRow = { ...tong, email: "", ten: null, slDeXuat: 0, slThucDuyet: 0 };

  function jumpDon(filter: string, loaiDon: "mua" | "cong_no" | undefined, email?: string) {
    onJump({ tab: "don-cua-toi", filter, loaiDon, nguoiNhanHang: email });
  }
  // "Đơn trả" that su la view co nut xu ly (TraHangTab) cho nguoi CO quyen xu ly, va view chi-de-xem
  // (DonCuaToiTab loc loaiDon=tra_hang) cho nguoi con lai - dung DUNG pattern jumpNum() da co san o
  // TrangChuTab.tsx, KHONG tu sang tao 1 to hop tab/loaiDon moi.
  function jumpTraHang(filter: string, email?: string) {
    if (canTraHangView) onJump({ tab: "tra-hang", filter, nguoiNhanHang: email });
    else onJump({ tab: "don-cua-toi", filter, loaiDon: "tra_hang", nguoiNhanHang: email });
  }
  function jumpPxk(filter: string, email?: string) {
    onJump({ tab: "phieu-xuat-kho", filter, nguoiNhanHang: email });
  }

  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #22): tham "alert" - to coral CHI khi gia tri > 0
  // (dung tinh than prop `muted` da co o StatCard cho view the ca nhan) - ap dung PER-CELL, khong to
  // ca cot, tranh nhuom coral toan cot du phan lon KTV khong co van de gi.
  function Num({ value, onClick, alert }: { value: number | string; onClick: () => void; alert?: boolean }) {
    return (
      <button
        onClick={onClick}
        className={`focus-ring font-semibold hover:underline tabular-nums ${alert ? "text-[var(--coral-600)] font-extrabold" : "text-[var(--ocean-600)]"}`}
      >
        {value}
      </button>
    );
  }

  function Table({ title, cols, rowsOf, tongRow }: { title: string; cols: { label: string; title?: string; cell: (r: BaoCaoRow) => React.ReactNode }[]; rowsOf: BaoCaoRow[]; tongRow?: React.ReactNode }) {
    return (
      <div>
        <div className="text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-1.5">{title}</div>
        <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--surface-100)] text-[var(--ink-600)]">
                <th className="sticky left-0 z-10 bg-[var(--surface-100)] px-3 py-2 text-left">Tên</th>
                {cols.map((c) => (
                  <th key={c.label} className="px-2 py-1.5 text-right border-l border-[var(--line)]" title={c.title}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsOf.map((r) => (
                <tr key={r.email} className="border-t border-[var(--line)] hover:bg-[var(--surface-100)]/60">
                  <td className="sticky left-0 z-10 bg-[var(--surface)] px-3 py-1.5 font-medium whitespace-nowrap">{formatPersonDisplay(r.email, personDir)}</td>
                  {cols.map((c) => (
                    <td key={c.label} className="px-2 py-1.5 text-right border-l border-[var(--line)]">{c.cell(r)}</td>
                  ))}
                </tr>
              ))}
              {tongRow && (
                <tr className="border-t-2 border-[var(--line)] bg-[var(--ocean-100)] font-semibold">
                  <td className="sticky left-0 z-10 bg-[var(--ocean-100)] px-3 py-1.5">Σ Tổng cộng</td>
                  {tongRow}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Muc A (phan hoi 2026-08-28) - luoi 2 cot "nhan/so" cho 1 nguoi, dung chung cho ca truong hop 1
  // dong (xem cua chinh minh) lan luc mo rong 1 dong trong danh sach nhieu nguoi. Thay the hoan toan
  // cho <table> cuon ngang tren mobile - moi con so van la 1 nut bam nhay dung (tai su dung y het
  // cols[].cell da co, khong viet lai logic jump).
  function MobileStatGrid({ cols, row }: { cols: { label: string; title?: string; cell: (r: BaoCaoRow) => React.ReactNode }[]; row: BaoCaoRow }) {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {cols.map((c) => (
          <div key={c.label} className="rounded-lg bg-[var(--surface-100)] px-2.5 py-1.5" title={c.title}>
            <div className="text-[9.5px] uppercase tracking-wide text-[var(--ink-400)] font-bold leading-tight">{c.label}</div>
            <div className="text-sm mt-0.5">{c.cell(row)}</div>
          </div>
        ))}
      </div>
    );
  }

  function MobileTable({
    title, cols, rowsOf, tongRow,
  }: { title: string; cols: { label: string; title?: string; cell: (r: BaoCaoRow) => React.ReactNode }[]; rowsOf: BaoCaoRow[]; tongRow: BaoCaoRow }) {
    const single = rowsOf.length <= 1;
    return (
      <div>
        <div className="text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-1.5">{title}</div>
        {single ? (
          <div className="rounded-xl border border-[var(--line)] p-2.5">
            <MobileStatGrid cols={cols} row={rowsOf[0] ?? tongRow} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-xl border border-[var(--ocean-500)]/40 bg-[var(--ocean-100)]/50 p-2.5">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--ocean-700)] mb-1.5">Σ Tổng cộng</div>
              <MobileStatGrid cols={cols} row={tongRow} />
            </div>
            <div className="border border-[var(--line)] rounded-xl divide-y divide-[var(--line)] overflow-hidden bg-[var(--surface)]">
              {rowsOf.map((r) => {
                const key = `${title}:${r.email}`;
                const isOpen = expandedRows.has(key);
                return (
                  <div key={r.email}>
                    <button
                      type="button"
                      onClick={() => toggleExpandRow(key)}
                      className="focus-ring w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-100)]/60"
                    >
                      <span className="text-[var(--ink-400)] text-xs w-3">{isOpen ? "▾" : "▸"}</span>
                      <span className="flex-1 truncate font-medium text-sm">{formatPersonDisplay(r.email, personDir)}</span>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-2.5">
                        <MobileStatGrid cols={cols} row={r} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Tach cols[] ra bien rieng (truoc day khai bao INLINE trong tung <Table>) - dung CHUNG cho ca
  // <Table> desktop lan <MobileTable> mobile, tranh khai bao trung 2 lan cung 1 danh sach cot.
  const donHangCols = [
    { label: "Tổng đơn", cell: (r: BaoCaoRow) => <Num value={r.slDon} onClick={() => jumpDon("", undefined, r.email)} /> },
    { label: "Đơn mua", cell: (r: BaoCaoRow) => <Num value={r.slDonMua} onClick={() => jumpDon("", "mua", r.email)} /> },
    { label: "Đơn CN", cell: (r: BaoCaoRow) => <Num value={r.slDonCongNo} onClick={() => jumpDon("", "cong_no", r.email)} /> },
    { label: "Đơn trả", cell: (r: BaoCaoRow) => <Num value={r.slDonTraHang} onClick={() => jumpTraHang("", r.email)} /> },
    { label: "Đơn đang chờ", title: "3-4 bước chờ duyệt đầu tiên, chưa tính 'Chờ hàng' (đã duyệt xong, đang chờ Kho tìm nguồn)", cell: (r: BaoCaoRow) => <Num value={r.slDangCho} onClick={() => jumpDon("__OPEN__", undefined, r.email)} /> },
    { label: "Bị từ chối/huỷ", cell: (r: BaoCaoRow) => <Num value={r.slTuChoi} alert={r.slTuChoi > 0} onClick={() => jumpDon("TN tu choi", undefined, r.email)} /> },
    { label: "Tổng duyệt", cell: (r: BaoCaoRow) => <Num value={r.slDuyet} onClick={() => jumpDon("TN da duyet", undefined, r.email)} /> },
    { label: "Duyệt mua", cell: (r: BaoCaoRow) => <Num value={r.slDuyetMua} onClick={() => jumpDon("TN da duyet", "mua", r.email)} /> },
    { label: "Duyệt CN", cell: (r: BaoCaoRow) => <Num value={r.slDuyetCongNo} onClick={() => jumpDon("TN da duyet", "cong_no", r.email)} /> },
    { label: "Duyệt trả", cell: (r: BaoCaoRow) => <Num value={r.slDuyetTraHang} onClick={() => jumpTraHang("TN da duyet", r.email)} /> },
  ];
  const xuatKhoCols = [
    { label: "Tổng PXK", cell: (r: BaoCaoRow) => <Num value={r.tongPxk} onClick={() => jumpPxk("", r.email)} /> },
    { label: "Tổng đang tồn", title: "Chờ kế toán + Chờ kho gửi + Chờ KTV nhận", cell: (r: BaoCaoRow) => <Num value={r.slChoKeToan + r.slChoKhoGui + r.slDaGui} onClick={() => jumpPxk("", r.email)} /> },
    { label: "Chờ kế toán", cell: (r: BaoCaoRow) => <Num value={r.slChoKeToan} onClick={() => jumpPxk("Cho ke toan", r.email)} /> },
    { label: "Chờ kho gửi", cell: (r: BaoCaoRow) => <Num value={r.slChoKhoGui} onClick={() => jumpPxk("Da chot xong don xuat", r.email)} /> },
    { label: "Chờ KTV nhận", cell: (r: BaoCaoRow) => <Num value={r.slDaGui} onClick={() => jumpPxk("Dang gui KTV", r.email)} /> },
    { label: "KTV đã nhận", cell: (r: BaoCaoRow) => <Num value={r.slDaXacNhan} onClick={() => jumpPxk("KTV da nhan", r.email)} /> },
    { label: "Kho kết thúc", title: "Kho đã kết thúc + Hàng trừ kho", cell: (r: BaoCaoRow) => <Num value={r.slKhoKetThuc} onClick={() => jumpPxk("Kho da ket thuc", r.email)} /> },
  ];
  const tienCols = [
    { label: "Tiền đang đặt mua (dự kiến)", cell: (r: BaoCaoRow) => <Num value={fmtVND(r.tongTienDatMua)} onClick={() => jumpDon("", undefined, r.email)} /> },
    { label: "Tiền chờ duyệt", cell: (r: BaoCaoRow) => <Num value={fmtVND(r.tienChoDuyet)} onClick={() => jumpDon("__OPEN__", undefined, r.email)} /> },
    { label: "Tổng thực tế đã mua", cell: (r: BaoCaoRow) => <Num value={fmtVND(r.tongTienThucTe)} onClick={() => jumpDon("TN da duyet", undefined, r.email)} /> },
    { label: "Tiền chờ chuyển", title: "PXK có yêu cầu chuyển khoản nhưng KTV/TN chưa xác nhận xong", cell: (r: BaoCaoRow) => <Num value={fmtVND(r.tongChoChuyen)} onClick={() => jumpPxk("", r.email)} /> },
  ];

  return (
    <div className="mt-4 space-y-4">
      {thangFilterEl}
      {rows.length > 1 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên/email KTV..."
          className="focus-ring w-full sm:w-72 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        />
      )}

      {isMobile ? (
        <MobileTable title="Đơn hàng" rowsOf={sorted} tongRow={tongAsRow} cols={donHangCols} />
      ) : (
        <Table
          title="Đơn hàng"
          rowsOf={sorted}
          cols={donHangCols}
          tongRow={
            <>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDon} onClick={() => jumpDon("", undefined)} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDonMua} onClick={() => jumpDon("", "mua")} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDonCongNo} onClick={() => jumpDon("", "cong_no")} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDonTraHang} onClick={() => jumpTraHang("")} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDangCho} onClick={() => jumpDon("__OPEN__", undefined)} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slTuChoi} alert={tong.slTuChoi > 0} onClick={() => jumpDon("TN tu choi", undefined)} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDuyet} onClick={() => jumpDon("TN da duyet", undefined)} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDuyetMua} onClick={() => jumpDon("TN da duyet", "mua")} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDuyetCongNo} onClick={() => jumpDon("TN da duyet", "cong_no")} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDuyetTraHang} onClick={() => jumpTraHang("TN da duyet")} /></td>
            </>
          }
        />
      )}

      {isMobile ? (
        <MobileTable title="Xuất kho" rowsOf={sorted} tongRow={tongAsRow} cols={xuatKhoCols} />
      ) : (
        <Table
          title="Xuất kho"
          rowsOf={sorted}
          cols={xuatKhoCols}
          tongRow={
            <>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.tongPxk} onClick={() => jumpPxk("")} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slChoKeToan + tong.slChoKhoGui + tong.slDaGui} onClick={() => jumpPxk("")} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slChoKeToan} onClick={() => jumpPxk("Cho ke toan")} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slChoKhoGui} onClick={() => jumpPxk("Da chot xong don xuat")} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDaGui} onClick={() => jumpPxk("Dang gui KTV")} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDaXacNhan} onClick={() => jumpPxk("KTV da nhan")} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slKhoKetThuc} onClick={() => jumpPxk("Kho da ket thuc")} /></td>
            </>
          }
        />
      )}

      {isMobile ? (
        <MobileTable title="Tiền" rowsOf={sorted} tongRow={tongAsRow} cols={tienCols} />
      ) : (
        <Table
          title="Tiền"
          rowsOf={sorted}
          cols={tienCols}
          tongRow={
            <>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={fmtVND(tong.tongTienDatMua)} onClick={() => jumpDon("", undefined)} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={fmtVND(tong.tienChoDuyet)} onClick={() => jumpDon("__OPEN__", undefined)} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={fmtVND(tong.tongTienThucTe)} onClick={() => jumpDon("TN da duyet", undefined)} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={fmtVND(tong.tongChoChuyen)} onClick={() => jumpPxk("")} /></td>
            </>
          }
        />
      )}
    </div>
  );
}
