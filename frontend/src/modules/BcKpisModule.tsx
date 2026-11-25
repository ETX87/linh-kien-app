import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, buildQuery } from "../api/client";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { useToast } from "../components/ui/Toast";

// "BC KPIs" (2026-11-25, v1.562) — dung lai 3 chi so cua file "BC mua hang" thang cua chu he thong (xem backend/src/routes/baoCaoKpi.ts).
// KHONG tu tai khi mo man: chi goi API khi bam "Tải số liệu" (bao cao nang, khong can chay lien tuc). "Tải Excel" dung lai ket qua da tai.

interface ThieuRow { mien: string; tuan: string; b2b: number; khach_quan: number; thieu: number; binh_thuong: number; da_ve: number; so_don_thieu: number; so_don: number }
interface TocDoRow { mien: string; tuan: string; dat: number; khong_dat: number; dang_xu_ly: number; dat_lv: number; xet_lv: number; tong_gio: number; tong_gio_lv: number; so_da_xuat: number }
interface KpiResult {
  thang: string;
  gom_huy: boolean;
  cap_nhat_luc: string;
  muc_tieu: { thieu: Record<string, number>; toc_do_gio: number; toc_do_gio_lv: number };
  thieu_hang: ThieuRow[];
  toc_do_kho: TocDoRow[];
  chi_tiet_don: Record<string, unknown>[];
  chi_tiet_pxk: Record<string, unknown>[];
  ma_su_co: Record<string, unknown>[];
}

function thangTruoc(): string {
  const d = new Date(Date.now() + 7 * 3_600_000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(2)}%`);
const tyLeThieu = (r: Pick<ThieuRow, "thieu" | "binh_thuong" | "da_ve">) => {
  const mau = r.thieu + r.binh_thuong + r.da_ve;
  return mau > 0 ? r.thieu / mau : null;
};
const tyLePhatSinh = (r: Pick<ThieuRow, "thieu" | "binh_thuong" | "da_ve">) => {
  const mau = r.thieu + r.binh_thuong + r.da_ve;
  return mau > 0 ? (r.thieu + r.da_ve) / mau : null;
};
const tyLeTocDo = (r: Pick<TocDoRow, "dat" | "khong_dat">) => (r.dat + r.khong_dat > 0 ? r.dat / (r.dat + r.khong_dat) : null);
const tyLeTocDoLv = (r: Pick<TocDoRow, "dat_lv" | "xet_lv">) => (r.xet_lv > 0 ? r.dat_lv / r.xet_lv : null);

/** Gom theo mien: tung tuan + 1 dong "Tổng" moi mien (giong pivot file Excel). */
function nhomTheoMien<T extends { mien: string; tuan: string }>(rows: T[], cong: (a: T, b: T) => T): { mien: string; rows: T[]; tong: T }[] {
  const out: { mien: string; rows: T[]; tong: T }[] = [];
  for (const r of rows) {
    const g = out.find((x) => x.mien === r.mien);
    if (g) { g.rows.push(r); g.tong = cong(g.tong, r); } else out.push({ mien: r.mien, rows: [r], tong: { ...r, tuan: "Tổng" } });
  }
  const thuTu = (m: string) => (m === "MB" ? 0 : m === "MN" ? 1 : 2);
  return out.sort((a, b) => thuTu(a.mien) - thuTu(b.mien));
}
const congThieu = (a: ThieuRow, b: ThieuRow): ThieuRow => ({
  ...a, b2b: a.b2b + b.b2b, khach_quan: a.khach_quan + b.khach_quan, thieu: a.thieu + b.thieu, binh_thuong: a.binh_thuong + b.binh_thuong,
  da_ve: a.da_ve + b.da_ve, so_don_thieu: a.so_don_thieu + b.so_don_thieu, so_don: a.so_don + b.so_don,
});
const congTocDo = (a: TocDoRow, b: TocDoRow): TocDoRow => ({
  ...a, dat: a.dat + b.dat, khong_dat: a.khong_dat + b.khong_dat, dang_xu_ly: a.dang_xu_ly + b.dang_xu_ly, dat_lv: a.dat_lv + b.dat_lv,
  xet_lv: a.xet_lv + b.xet_lv, tong_gio: a.tong_gio + b.tong_gio, tong_gio_lv: a.tong_gio_lv + b.tong_gio_lv, so_da_xuat: a.so_da_xuat + b.so_da_xuat,
});
const tongTatCa = <T extends { mien: string; tuan: string }>(groups: { tong: T }[], cong: (a: T, b: T) => T): T | null =>
  groups.length ? groups.slice(1).reduce((s, g) => cong(s, g.tong), { ...groups[0].tong, mien: "Toàn quốc", tuan: "" }) : null;

function KpiTile({ label, value, sub, dat }: { label: string; value: string; sub: string; dat: boolean | null }) {
  const mau = dat === null ? "var(--ink-700)" : dat ? "var(--color-success-strong)" : "var(--color-danger-strong)";
  return (
    <Card className="p-3">
      <div className="text-xs text-[var(--ink-500)]">{label}</div>
      <div className="font-display text-xl font-bold" style={{ color: mau }}>{value}</div>
      <div className="text-xs text-[var(--ink-500)]">{sub}</div>
    </Card>
  );
}

function BangThieu({ data }: { data: KpiResult }) {
  const groups = nhomTheoMien(data.thieu_hang, congThieu);
  const tong = tongTatCa(groups, congThieu);
  const mucTieu = (m: string) => data.muc_tieu.thieu[m] ?? null;
  const Dong = ({ r, mien, dam }: { r: ThieuRow; mien: string; dam?: boolean }) => {
    const tl = tyLeThieu(r);
    const mt = mucTieu(mien);
    const dat = tl === null || mt === null ? null : tl <= mt;
    return (
      <tr className={dam ? "font-semibold bg-[var(--color-surface-soft)]" : ""}>
        <td>{r.mien}</td>
        <td>{r.tuan}</td>
        <td className="text-right">{r.b2b || ""}</td>
        <td className="text-right">{r.khach_quan || ""}</td>
        <td className="text-right">{r.thieu || ""}</td>
        <td className="text-right">{r.binh_thuong || ""}</td>
        <td className="text-right">{r.da_ve || ""}</td>
        <td className="text-right" style={{ color: dat === null ? undefined : dat ? "var(--color-success-strong)" : "var(--color-danger-strong)" }}>{pct(tl)}</td>
        <td className="text-right">{pct(tyLePhatSinh(r))}</td>
        <td className="text-right">{mt === null ? "—" : pct(mt)}</td>
      </tr>
    );
  };
  return (
    <Card className="p-3 space-y-2">
      <div className="font-semibold text-sm">1. Tỷ lệ thiếu hàng (theo SL xuất, tháng tạo đơn)</div>
      <div className="text-xs text-[var(--ink-500)]">
        Tỷ lệ = Có đơn thiếu ÷ (Có đơn thiếu + Bình thường + Đã về hàng). B2B và "Do nhà máy hết hàng" (khách quan) không tính. "Tỷ lệ phát sinh" = (thiếu + đã về) ÷ cùng mẫu số — không đổi theo ngày chạy báo cáo.
      </div>
      <div className="overflow-x-auto">
        <table className="tbl w-full text-sm">
          <thead>
            <tr><th>Miền</th><th>Tuần</th><th className="text-right">B2B</th><th className="text-right">Khách quan</th><th className="text-right">Có đơn thiếu</th><th className="text-right">Bình thường</th><th className="text-right">Đã về hàng</th><th className="text-right">Tỷ lệ thiếu</th><th className="text-right">Tỷ lệ phát sinh</th><th className="text-right">Mục tiêu</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              ...g.rows.map((r) => <Dong key={g.mien + r.tuan} r={r} mien={g.mien} />),
              <Dong key={g.mien + "tong"} r={g.tong} mien={g.mien} dam />,
            ])}
            {tong && <Dong r={tong} mien="" dam />}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function BangTocDo({ data }: { data: KpiResult }) {
  const groups = nhomTheoMien(data.toc_do_kho, congTocDo);
  const tong = tongTatCa(groups, congTocDo);
  const Dong = ({ r, dam }: { r: TocDoRow; dam?: boolean }) => {
    const tl = tyLeTocDo(r);
    return (
      <tr className={dam ? "font-semibold bg-[var(--color-surface-soft)]" : ""}>
        <td>{r.mien}</td>
        <td>{r.tuan}</td>
        <td className="text-right">{r.dat}</td>
        <td className="text-right">{r.khong_dat || ""}</td>
        <td className="text-right">{r.dang_xu_ly || ""}</td>
        <td className="text-right font-semibold">{pct(tl)}</td>
        <td className="text-right">{pct(tyLeTocDoLv(r))}</td>
        <td className="text-right">{r.so_da_xuat ? (r.tong_gio / r.so_da_xuat).toFixed(1) : "—"}</td>
        <td className="text-right">{r.so_da_xuat ? (r.tong_gio_lv / r.so_da_xuat).toFixed(1) : "—"}</td>
      </tr>
    );
  };
  return (
    <Card className="p-3 space-y-2">
      <div className="font-semibold text-sm">2. Tốc độ Kho xử lý phiếu xuất (tháng tạo phiếu)</div>
      <div className="text-xs text-[var(--ink-500)]">
        Giờ từ lúc Kế toán chốt phiếu → Kho xuất (gửi KTV / trừ kho / kết thúc). Đạt = ≤ {data.muc_tieu.toc_do_gio} giờ lịch (như file Excel); cột bên cạnh theo luật SLA hệ thống ≤ {data.muc_tieu.toc_do_gio_lv} giờ làm việc. Phiếu đã chốt nhưng chưa xuất, còn trong hạn = "Đang xử lý" (không tính tỷ lệ).
      </div>
      <div className="overflow-x-auto">
        <table className="tbl w-full text-sm">
          <thead>
            <tr><th>Miền</th><th>Tuần</th><th className="text-right">Đạt</th><th className="text-right">Không đạt</th><th className="text-right">Đang xử lý</th><th className="text-right">Tỷ lệ ≤{data.muc_tieu.toc_do_gio}h</th><th className="text-right">Tỷ lệ ≤{data.muc_tieu.toc_do_gio_lv}h làm việc</th><th className="text-right">TB giờ</th><th className="text-right">TB giờ làm việc</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => [...g.rows.map((r) => <Dong key={g.mien + r.tuan} r={r} />), <Dong key={g.mien + "tong"} r={g.tong} dam />])}
            {tong && <Dong r={tong} dam />}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const NHAN_DON: Record<string, string> = {
  id: "Mã đơn", phieu_dat_id: "Phiếu đặt", tuan: "Tuần", mien: "Miền", khu_vuc: "Khu vực", loai_don: "Loại đơn", ma_lk: "Mã LK", ten_lk: "Tên LK",
  nhom_lk: "Nhóm LK", loai_de_xuat: "Loại đề xuất", sl: "SL xuất", nguoi_tao: "Người tạo", ngay_tao: "Ngày tạo", trang_thai: "Trạng thái đơn",
  da_huy: "Đơn hủy/từ chối", loai_thieu: "Phân loại thiếu LK", tlk_id: "Mã thiếu LK", tlk_trang_thai: "Trạng thái thiếu LK", tlk_ly_do: "Lý do thiếu",
  ma_xuat_kho: "Mã PXK", ma_yeu_cau_su_co: "Mã yêu cầu sự cố", ma_lada: "Mã Lada", pxk_ngay_tao: "Tạo phiếu lúc", kho_xuat_luc: "Kho xuất lúc",
  hoan_tat_luc: "Hoàn tất lúc", gio_den_kho_xuat: "Giờ tạo đơn → Kho xuất", gio_xu_ly: "Tổng giờ xử lý (đến hoàn tất / hiện tại)",
};
const NHAN_PXK: Record<string, string> = {
  ma_xuat_kho: "Mã PXK", tuan: "Tuần", mien: "Miền", khu_vuc: "Khu vực", loai_don: "Loại phiếu", nguoi_tao: "Người tạo", ngay_tao: "Ngày tạo",
  trang_thai: "Trạng thái", chot_ke_toan_luc: "Kế toán chốt lúc", kho_xuat_luc: "Kho xuất lúc", gio_kho_xu_ly: "Giờ Kho xử lý",
  gio_lam_viec: "Giờ làm việc Kho xử lý", ket_qua: "Kết quả ≤24h", dat_8h_lv: "Đạt ≤8h làm việc",
};

async function taiExcel(data: KpiResult) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const doiNhan = (rows: Record<string, unknown>[], nhan: Record<string, string>) =>
    rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [nhan[k] ?? k, typeof v === "boolean" ? (v ? "Có" : "Không") : v])));

  const thieu = nhomTheoMien(data.thieu_hang, congThieu);
  const tongThieu = tongTatCa(thieu, congThieu);
  const dongThieu = (r: ThieuRow, mien: string) => ({
    "Miền": r.mien, "Tuần": r.tuan, "B2B": r.b2b, "Khách quan": r.khach_quan, "Có đơn thiếu": r.thieu, "Bình thường": r.binh_thuong,
    "Có đơn thiếu - Đã về hàng": r.da_ve, "Tỷ lệ thiếu hàng": tyLeThieu(r), "Tỷ lệ phát sinh thiếu": tyLePhatSinh(r),
    "Mục tiêu": data.muc_tieu.thieu[mien] ?? null, "Số đơn": r.so_don,
  });
  const sheetThieu = [
    ...thieu.flatMap((g) => [...g.rows.map((r) => dongThieu(r, g.mien)), dongThieu(g.tong, g.mien)]),
    ...(tongThieu ? [dongThieu(tongThieu, "")] : []),
  ];
  const tocDo = nhomTheoMien(data.toc_do_kho, congTocDo);
  const tongTocDo = tongTatCa(tocDo, congTocDo);
  const dongTocDo = (r: TocDoRow) => ({
    "Miền": r.mien, "Tuần": r.tuan, "Đạt ≤24h": r.dat, "Không đạt": r.khong_dat, "Đang xử lý": r.dang_xu_ly, "Tỷ lệ tốc độ xử lý": tyLeTocDo(r),
    "Tỷ lệ ≤8h làm việc": tyLeTocDoLv(r), "TB giờ": r.so_da_xuat ? r.tong_gio / r.so_da_xuat : null,
    "TB giờ làm việc": r.so_da_xuat ? r.tong_gio_lv / r.so_da_xuat : null,
  });
  const sheetTocDo = [...tocDo.flatMap((g) => [...g.rows.map(dongTocDo), dongTocDo(g.tong)]), ...(tongTocDo ? [dongTocDo(tongTocDo)] : [])];

  const ghiChu = [
    { "Mục": "Tháng", "Giá trị": data.thang },
    { "Mục": "Dữ liệu lúc", "Giá trị": data.cap_nhat_luc },
    { "Mục": "Tính cả đơn hủy / từ chối vào tỷ lệ thiếu", "Giá trị": data.gom_huy ? "Có" : "Không" },
    { "Mục": "Tỷ lệ thiếu hàng", "Giá trị": "Có đơn thiếu ÷ (Có đơn thiếu + Bình thường + Đã về hàng); B2B và khách quan không tính" },
    { "Mục": "Tốc độ Kho", "Giá trị": "Giờ từ Kế toán chốt PXK → Kho xuất; đạt ≤24h lịch, kèm ≤8h làm việc" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ghiChu), "Ghi chu");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetThieu), "1. Ty le thieu hang");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetTocDo), "2. Toc do Kho");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(doiNhan(data.ma_su_co, NHAN_DON)), "3. Ma su co - Lada");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(doiNhan(data.chi_tiet_don, NHAN_DON)), "DON");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(doiNhan(data.chi_tiet_pxk, NHAN_PXK)), "PHIEU");
  XLSX.writeFile(wb, `BC_KPIs_${data.thang}.xlsx`);
}

export function BcKpisModule() {
  const addToast = useToast();
  const [thang, setThang] = useState(thangTruoc());
  const [gomHuy, setGomHuy] = useState(false);
  const [data, setData] = useState<KpiResult | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const load = useMutation({
    mutationFn: () => api.get<KpiResult>(`/bao-cao-kpi${buildQuery({ thang, gom_huy: gomHuy ? "1" : undefined })}`),
    onSuccess: (d) => setData(d),
    onError: (err) => addToast("Lỗi tải số liệu: " + (err instanceof Error ? err.message : String(err))),
  });

  async function handleExcel() {
    if (!data) return;
    setDangTai(true);
    try {
      await taiExcel(data);
    } catch (err) {
      addToast("Lỗi tạo file Excel: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDangTai(false);
    }
  }

  const thieuGroups = data ? nhomTheoMien(data.thieu_hang, congThieu) : [];
  const tocDoGroups = data ? nhomTheoMien(data.toc_do_kho, congTocDo) : [];
  const maSuCoXong = data ? data.ma_su_co.filter((r) => r.hoan_tat_luc) : [];
  const tbNgay = maSuCoXong.length ? maSuCoXong.reduce((s, r) => s + Number(r.gio_xu_ly ?? 0), 0) / maSuCoXong.length / 24 : null;

  return (
    <div className="anim-in space-y-3">
      <Card className="p-3 flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide mb-1">Tháng</div>
          <input type="month" value={thang} onChange={(e) => setThang(e.target.value)} className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-[var(--ink-700)] pb-1.5" title="File Excel cũ cộng cả đơn hủy / từ chối vào mẫu số">
          <input type="checkbox" checked={gomHuy} onChange={(e) => setGomHuy(e.target.checked)} /> Tính cả đơn hủy / từ chối
        </label>
        <Btn size="sm" onClick={() => load.mutate()} loading={load.isPending} disabled={!thang}>⟳ Tải số liệu</Btn>
        <Btn size="sm" variant="ghost" onClick={() => void handleExcel()} loading={dangTai} disabled={!data}>⬇ Tải Excel</Btn>
        {data && (
          <span className="text-xs text-[var(--ink-500)] pb-1.5">
            Tháng {data.thang.slice(5)}/{data.thang.slice(0, 4)} · dữ liệu lúc {data.cap_nhat_luc.slice(11, 16)} {data.cap_nhat_luc.slice(8, 10)}/{data.cap_nhat_luc.slice(5, 7)}
          </span>
        )}
      </Card>

      {!data && !load.isPending && (
        <div className="text-sm text-[var(--ink-500)] p-4">
          Báo cáo không tự chạy. Chọn tháng rồi bấm <b>Tải số liệu</b> để tính tỷ lệ thiếu hàng, tốc độ Kho xử lý và thời gian xử lý đơn có mã sự cố / Lada; sau đó bấm <b>Tải Excel</b> để lấy file (kèm sheet chi tiết DON, PHIEU).
        </div>
      )}
      {load.isPending && <div className="text-sm text-[var(--ink-500)] p-4">Đang tính số liệu…</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {thieuGroups.filter((g) => g.mien !== "Khác").map((g) => {
              const tl = tyLeThieu(g.tong);
              const mt = data.muc_tieu.thieu[g.mien] ?? null;
              return <KpiTile key={"t" + g.mien} label={`Tỷ lệ thiếu hàng ${g.mien}`} value={pct(tl)} sub={`Mục tiêu ≤ ${pct(mt)}`} dat={tl === null || mt === null ? null : tl <= mt} />;
            })}
            {tocDoGroups.filter((g) => g.mien !== "Khác").map((g) => (
              <KpiTile key={"k" + g.mien} label={`Kho xuất ≤${data.muc_tieu.toc_do_gio}h ${g.mien}`} value={pct(tyLeTocDo(g.tong))} sub={`${g.tong.dat}/${g.tong.dat + g.tong.khong_dat} phiếu`} dat={null} />
            ))}
            <KpiTile label="Đơn có mã sự cố / Lada" value={tbNgay === null ? "—" : `${tbNgay.toFixed(1)} ngày`} sub={`TB tạo đơn → hoàn tất · ${maSuCoXong.length}/${data.ma_su_co.length} đơn xong`} dat={null} />
          </div>
          <BangThieu data={data} />
          <BangTocDo data={data} />
        </>
      )}
    </div>
  );
}
