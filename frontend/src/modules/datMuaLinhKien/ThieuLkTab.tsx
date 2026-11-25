import { ViPhamBanner } from "../viPham/ViPhamUi";
import { canhBaoNgayDuKien, homNayVN, ngayDuKienToiDa } from "../../lib/ngayDuKien";
import { Fragment, useState, useEffect, useRef } from "react";
import { NhomLkBadge } from "../danhMucLinhKien/NhomLk";
import { LoaiChietKhauText } from "./LoaiChietKhau";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/x/Badge";
import { Select } from "../../components/ui/Select";
import { Drawer, DrawerNavButtons, useDrawerArrowNav } from "../../components/ui/Drawer";
import type { Column } from "../../components/ui/PaginatedTable";
import { useColumnConfig } from "../../components/ui/useColumnConfig";
import { ColumnSettingsButton, ResizableHeaderCell } from "../../components/ui/ColumnHeader";
import { KvRow } from "../../components/ui/KvRow";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { Timeline } from "../../components/ui/Timeline";
import { api, buildQuery } from "../../api/client";
import { exportRowsToExcel } from "../../lib/exportExcel";
import { fmtDate, fmtDateTime } from "../../types";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import type { ThieuLkRow, LyDoChamRow, NguoiNhanHangKhaDungRow, DonHangRow } from "./types";
import { THIEU_LK_TRANG_THAI_TONE, THIEU_LK_TRANG_THAI_OPTIONS } from "./constants";
import { describeApiError, formatNguoiDisplay, useKtvDisplayMap, ktvOptionLabel, invalidatePipelineCounts, trangThaiLabel, formatLkLabel, LOAI_DON_TONE, dayLaiDuoc, nenKhieuNai } from "./helpers";
import { StatusBadge, LoaiDeXuatBadge, BulkConfirmButton, FilterSearchBar, ActiveFiltersBar, KhuVucChipFilter, LogTieuDe, timelineLogGop, useTenNguoiLog } from "./SharedUi";
import { ThieuLkStatusRail } from "./ThieuLkStatusRail";
// Lien ket 2 chieu voi don goc (phan hoi 2026-09-10: "đơn gốc cũng không có truy vấn đến đơn ticket
// đơn thiếu linh kiện") - import truc tiep component Drawer chi tiet don hang, tu quan ly state mo/dong
// CUC BO trong ThieuLkDetailModal (khong lifting len ThieuLkTab), tranh phai xuyen them props qua
// nhieu lop. Import vong (DonCuaToiTab.tsx cung import nguoc lai ThieuLkDetailModal tu file nay) an
// toan trong ESM vi ca 2 chi dung ben trong than ham component (luc render), khong dung o top-level.
import { DonHangDetailModal } from "./DonCuaToiTab";
import { NguoiNhan } from "../../components/ui/TenNguoi";
import { doiNguoiThanhTen, usePersonDirectory } from "../../lib/personDisplay";
import { t, dichSau } from "../../i18n";
import { useAuth } from "../../auth/AuthContext";
import { fetchWithHashCache } from "../../lib/staticListCache";
import type { LinhKienRow } from "../../types";
import { XetDuyetMaSection } from "../danhMucLinhKien/XetDuyetMaLk";
import { DanhGiaThieuLk } from "./DanhGiaThieuLk";
import { TachDonModal } from "./TachDon";
import { HuyDonKhoi, YeuCauHuyChip } from "./YeuCauHuy";
import { THB_TRANG_THAI, XemThieuHangBh } from "./ThieuHangBh";

// v1.565 - cot / bo loc "Nguồn tiếp nhận" (ban sao NGUON_TLK_SQL backend routes/datMuaLinhKien.ts). Ticket "bh" = Thieu hang bao hanh (THB)
// do app Bao hanh doi tra gui sang - xu ly o popup rieng (XemThieuHangBh), khong co nut nhanh / chon hang loat o danh sach.
const NGUON_TIEP_NHAN: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" }> = {
  app_lk: { label: dichSau("App đặt LK"), tone: "neutral" },
  doitra_cap: { label: dichSau("Đổi trả — cấp LK"), tone: "info" },
  api: { label: dichSau("API đối tác"), tone: "success" },
  bh: { label: dichSau("Đổi trả — thiếu hàng BH"), tone: "warning" },
};
function NguonTiepNhanBadge({ r }: { r: ThieuLkRow }) {
  const n = NGUON_TIEP_NHAN[r.nguon_tiep_nhan ?? "app_lk"] ?? NGUON_TIEP_NHAN.app_lk;
  return <Badge tone={n.tone}>{t(n.label)}</Badge>;
}
function TrangThaiDong({ r }: { r: ThieuLkRow }) {
  if (r.loai_ticket === "bh") {
    const s = THB_TRANG_THAI[r.thb_trang_thai ?? ""];
    return s ? <Badge tone={s.tone}>{t(s.label)}</Badge> : <span>{r.thb_trang_thai}</span>;
  }
  return <StatusBadge value={r.trang_thai} tones={THIEU_LK_TRANG_THAI_TONE} options={THIEU_LK_TRANG_THAI_OPTIONS} />;
}

// Nhan "Ưu tiên" (concept 1 "Structured Neutral" da duyet, 2026-08-24, pattern ".priority-tag") - thay
// cho ngoi sao "⭐" tho truoc day, presentational thuan tuy (khong doc/ghi state).
function PriorityTag() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[var(--orange-600)] font-extrabold text-xs" title={t("Đơn ưu tiên")}>
      <span aria-hidden>★</span>{t("Ưu tiên")}
    </span>
  );
}

// ---------- Tab "Thieu linh kien" ----------

// Nang len module-level (truoc o trong ThieuLkTab, dong closure qua canKho/canTacNghiep/currentEmail)
// - ThieuLkDetailModal (them 2026-08-21, bo sung nut hanh dong vao Drawer theo phan hoi "nút chức
// năng không hiện trong drawer") cung can dung, nhan ctx qua tham so thay vi dong qua closure.
function nextStatesForThieuLk(
  r: ThieuLkRow,
  ctx: { canKho: boolean; canTacNghiep: boolean; currentEmail: string; canMuaHang?: boolean },
): { trangThai: string; canDo: boolean }[] {
  const isCreator = r.nguoi_tao === ctx.currentEmail;
  // Buoc cua Kho: TN (gom Ke toan lam thay) thao tac ho Kho duoc (2026-10-20, "cũng hiện cho Tác nghiệp hỗ trợ xác nhận hộ") - backend
  // applyThieuLkLog ghi "TN thao tác thay Kho" vao lich su. Huy bo van chi nguoi tao / Kho nhu cu.
  const kho = ctx.canKho || ctx.canTacNghiep;
  if (r.trang_thai === "Cho kho xu ly")
    return [
      { trangThai: "Kho da tiep nhan", canDo: kho },
      // "Đã có hàng" (2026-10-16): tiep nhan + xac nhan hang da ve trong 1 lan bam (backend applyThieuLkLog "Da co hang").
      // TN (gom Ke toan) xac nhan thay Kho khi Kho chua tiep nhan (2026-10-19, hang ve trong ngay).
      { trangThai: "Da co hang", canDo: kho },
      // Chuyen Mua hang (2026-10-19): ma chua co ke hoach hang ve -> Mua hang dat hang.
      { trangThai: "Cho mua hang", canDo: kho },
      { trangThai: "Kho tu choi sai TT", canDo: kho },
      { trangThai: "Da huy bo", canDo: isCreator || ctx.canKho || !!ctx.canMuaHang },
    ];
  // "Kho da cap nhat" (2026-09-28): sau tiep nhan, Kho cap nhat lai ngay du kien/ghi chu (lap lai duoc).
  if (r.trang_thai === "Cho mua hang")
    return [
      { trangThai: "Mua hang da dat", canDo: !!ctx.canMuaHang },
      { trangThai: "Mua hang tu choi", canDo: !!ctx.canMuaHang },
      // Kho / Mua hang da xac nhan xu ly (2026-10-27): KTV (nguoi tao) khong huy duoc nua - chi Kho / Mua hang (backend applyThieuLkLog).
      { trangThai: "Da huy bo", canDo: ctx.canKho || !!ctx.canMuaHang },
    ];
  if (r.trang_thai === "Kho da tiep nhan" || r.trang_thai === "Kho da cap nhat" || r.trang_thai === "Mua hang da dat")
    return [
      { trangThai: "Kho da cap nhat", canDo: kho },
      ...(r.trang_thai !== "Mua hang da dat" ? [{ trangThai: "Cho mua hang", canDo: kho }] : []),
      { trangThai: "Kho xac nhan hang da ve", canDo: kho },
      { trangThai: "Da huy bo", canDo: ctx.canKho || !!ctx.canMuaHang },
    ];
  // Kho xong phan minh (hang ve / tu choi sai TT) -> don goc da quay ve "Cho TN duyet"; TN duyet o day = duyet luon
  // don goc (backend applyThieuLkLog), hoac duyet tren don goc thi ticket tu dong (2026-09-29).
  if (r.trang_thai === "Kho xac nhan hang da ve" || r.trang_thai === "Kho tu choi sai TT" || r.trang_thai === "Mua hang tu choi")
    return [{ trangThai: "Da ket thuc", canDo: ctx.canTacNghiep }];
  return [];
}

// SUA (phan hoi 2026-08-21: "button 'Đã hủy bỏ' => thành 'Hủy bỏ'") - THIEU_LK_TRANG_THAI_OPTIONS
// dung 1 nhan CHUNG "Đã huỷ bỏ" cho ca 2 vai tro khac nhau: hien trang thai DA XAY RA (StatusBadge,
// lich su xu ly - dung THI QUA KHU la dung) va nhan cho HANH DONG sap bam (nut/tieu de Modal/nut xac
// nhan bulk - can THE MENH LENH, khong phai qua khu). Ham nay CHI dung cho nhom hanh dong, tra ve
// nhan khac trangThaiLabel() dung cho nhom trang thai - hien chi "Da huy bo" can tach, cac gia tri
// khac giu nguyen (dung chung 1 nhan cho ca 2 vai tro).
// Buoc can nhap lieu truoc khi chuyen (mo khung nhap thay vi bam la chuyen ngay).
// + "Kho tu choi sai TT" (tu dong duyet 100%, 2026-10-14): Kho tu choi = DON GOC TU HUY -> bat buoc ly do (gui KTV).
// + 3 buoc Mua hang (2026-10-19): Chuyen (ghi chu tuy chon), Da dat (ma EO + ngay du kien bat buoc), Khong mua duoc (ly do bat buoc).
// + "Doi ma tuong duong" (2026-10-20): hanh dong gia (khong phai trang thai) - chon LK cung nhom thay the roi gui "Da co hang" /
//   "Kho xac nhan hang da ve" kem ma_lk_tuong_duong (backend applyThieuLkLog doi ma don goc trong cung batch).
const DOI_MA_TUONG_DUONG = "Doi ma tuong duong";
// + "Da huy bo" (sua 2026-10-30, v1.428 - Kho bam Huy bo bao "Cần nhập lý do huỷ"): tu v1.410 Kho / Mua hang huy ticket (= huy don goc) bat buoc
//   ly do (backend THIEU_LY_DO_HUY) nhung nut Huy bo gui thang khong mo khung nhap - khung da co san o "Lý do hủy *".
const CAN_NHAP_LIEU = ["Kho da tiep nhan", "Kho da cap nhat", "Kho tu choi sai TT", "Da huy bo", "Cho mua hang", "Mua hang da dat", "Mua hang tu choi", DOI_MA_TUONG_DUONG];
const CO_NGAY_DU_KIEN = ["Kho da tiep nhan", "Kho da cap nhat", "Mua hang da dat"];

// Nhan nut = DONG TU ngan (ra soat mobile 2026-09-29): truoc day dung lai ten trang thai ("Kho đã tiếp nhận…",
// "Kho xác nhận hàng đã về") - dai, khong vua 3 nut/hang tren dien thoai va doc nhu trang thai hon la hanh dong.
// Ten trang thai day du van o title/aria cua nut va o lich su xu ly.
const NHAN_HANH_DONG: Record<string, string> = {
  "Kho da tiep nhan": dichSau("Tiếp nhận"),
  "Kho da cap nhat": dichSau("Cập nhật"),
  "Kho tu choi sai TT": dichSau("Từ chối (sai TT)"),
  "Da huy bo": dichSau("Hủy bỏ"),
  "Kho xac nhan hang da ve": dichSau("Hàng đã về"),
  "Da co hang": dichSau("Đã có hàng"),
  "Da ket thuc": dichSau("TN duyệt"),
  "Cho mua hang": dichSau("Chuyển Mua hàng"),
  "Mua hang da dat": dichSau("Đã đặt hàng"),
  "Mua hang tu choi": dichSau("Không mua được"),
  [DOI_MA_TUONG_DUONG]: dichSau("Đổi LK tương đương"),
};
// Buoc "di tiep" cua luong (nut primary duy nhat o chan Drawer) - cac nut con lai la phu/nguy hiem.
const HANH_DONG_CHINH = new Set(["Kho da tiep nhan", "Kho xac nhan hang da ve", "Da ket thuc", "Mua hang da dat"]);
const HANH_DONG_NGUY_HIEM = new Set(["Kho tu choi sai TT", "Da huy bo", "Mua hang tu choi"]);

// Thu tu nut trong 1 hang: nguy hiem ben trai, phu o giua, buoc chinh ben phai (DESIGN_GUIDELINES §6.4).
function thuTuNut(trangThai: string): number {
  return HANH_DONG_NGUY_HIEM.has(trangThai) ? 0 : HANH_DONG_CHINH.has(trangThai) ? 2 : 1;
}

function actionLabel(trangThai: string): string {
  return NHAN_HANH_DONG[trangThai] ? t(NHAN_HANH_DONG[trangThai]) : trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, trangThai);
}

// Trang thai MA LK cua don goc (2026-10-16): "Chờ xác nhận" = ma dang cho xet duyet (Kho/Mua hang vao xac nhan ma o chi tiet ticket).
function MaLkXacNhanBadge({ tt, chiKhiCho = false }: { tt: string | null | undefined; chiKhiCho?: boolean }) {
  if (tt === "Cho xet duyet") return <Badge tone="warning">{t("Mã chờ xác nhận")}</Badge>;
  if (chiKhiCho) return null;
  return <Badge variant="dot" tone="success">{t("Mã đã xác nhận")}</Badge>;
}

// "Kho công ty" (2026-10-16): don cho hang da du ton kho cong ty (file ton kho moi nhat, don cho lau nhat duoc xet truoc) -> nhac Kho
// bam "Đã có hàng" / "Hàng đã về".
function KhoDuHangBadge({ du }: { du: number | undefined }) {
  return du ? <Badge tone="success">{t("Đã có đủ hàng tồn trong kho")}</Badge> : null;
}

// "Kho có x/y" (v1.434): kho cong ty chi du MOT PHAN cho don uu tien cao nhat cua ma -> he thong DUNG tu duyet hang ve (ca don xep sau),
// cho Kho / Ke toan / TN chon phuong an (tach don giao truoc phan da co, hoac doi them hang).
function KhoMotPhanBadge({ co, sl }: { co: number | null | undefined; sl: number | null | undefined }) {
  if (!co) return null;
  return (
    <span title={t("Kho công ty chỉ đủ một phần — hệ thống dừng tự duyệt hàng về cho mã này, chờ Kho / Kế toán chọn phương án (tách đơn hoặc chờ đủ).")}>
      <Badge tone="warning">{t("Kho có {a}/{b}", { a: co, b: sl ?? "?" })}</Badge>
    </span>
  );
}

// Hoi xac nhan truoc "Đã có hàng" (2026-10-16) - 1 lan bam la tiep nhan + hang ve + don goc tu duyet, vao phieu.
// (Xu ly hang loat da co BulkConfirmButton hoi xac nhan rieng.)
function xacNhanDaCoHang(trangThai: string): boolean {
  if (trangThai !== "Da co hang") return true;
  return window.confirm(t("Xác nhận Kho đã có hàng? Hệ thống sẽ ghi Kho tiếp nhận + hàng đã về, đơn gốc tự duyệt và vào phiếu xuất kho."));
}

// Ngay "YYYY-MM-DD" -> "dd/mm" (nam hien tai) hoac "dd/mm/yy" - gon cho the mobile.
function ngayNgan(d: string | null | undefined): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return m[1] === String(new Date().getFullYear()) ? `${m[3]}/${m[2]}` : `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

// Form nhap lieu truoc khi chuyen buoc (Tiep nhan = giai trinh bat buoc; Cap nhat = doi ngay du kien hoac ghi chu).
// DUNG CHUNG cho chan Drawer chi tiet - truoc day chep 2 ban (Modal o danh sach + chan Drawer), gio nut can nhap
// lieu o danh sach mo thang Drawer cua ticket do (thay Modal khong co ngu canh ticket nao).
function ThieuLkActionForm({
  trangThai, ngayDuKien, setNgayDuKien, ghiChu, setGhiChu, goiY, pending, onCancel, onSubmit, maEo = "", setMaEo,
  maLkHienTai, maLkMoi = "", setMaLkMoi,
}: {
  trangThai: string;
  maLkHienTai?: string | null;
  maLkMoi?: string;
  setMaLkMoi?: (v: string) => void;
  maEo?: string;
  setMaEo?: (v: string) => void;
  ngayDuKien: string;
  setNgayDuKien: (v: string) => void;
  ghiChu: string;
  setGhiChu: (v: string) => void;
  goiY: LyDoChamRow[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const isGiaiTrinh = trangThai === "Kho da tiep nhan";
  const isCapNhat = trangThai === "Kho da cap nhat";
  const isTuChoi = trangThai === "Kho tu choi sai TT" || trangThai === "Mua hang tu choi";
  const isDatHang = trangThai === "Mua hang da dat";
  // Huy bo ticket = huy don goc (2026-10-27: Kho / Mua hang huy ho -> bat buoc ly do, hien cho KTV).
  const isHuyBo = trangThai === "Da huy bo";
  const isChuyenMua = trangThai === "Cho mua hang";
  const isDoiMa = trangThai === DOI_MA_TUONG_DUONG;
  // LK cung nhom thay the voi ma dang dat (chi ma co trong danh muc) - nguon chung voi goi y luc tao don.
  const { data: tuongDuong, isLoading: dangTaiTuongDuong } = useQuery({
    queryKey: ["lk-thay-the", maLkHienTai ?? ""],
    queryFn: () => api.get<{ rows: { ma_linh_kien: string; ten_linh_kien: string; gia_ban: number | null }[] }>(`/lk-settings/thay-the/${encodeURIComponent(maLkHienTai ?? "")}`),
    enabled: isDoiMa && !!maLkHienTai,
  });
  const thieuThongTin =
    ((isGiaiTrinh || isTuChoi || isHuyBo) && !ghiChu.trim()) || (isCapNhat && !ghiChu.trim() && !ngayDuKien) || (isDatHang && !maEo.trim()) ||
    (isDoiMa && !maLkMoi) || ((isGiaiTrinh || isCapNhat || isDatHang) && !!canhBaoNgayDuKien(ngayDuKien));
  // text-base tren mobile: o nhap < 16px lam iOS tu phong to trang khi cham vao.
  const oNhap = "focus-ring w-full rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-base sm:text-sm";
  return (
    <div className="space-y-2.5">
      <div className="text-[13px] font-bold text-[var(--color-text)]">{actionLabel(trangThai)}</div>
      {isDoiMa && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-[var(--color-text-secondary)]">
            {t("Đơn gốc đang đặt {ma}. Chọn linh kiện tương đương (cùng nhóm thay thế) Kho đang có — đơn đổi sang mã mới (giá theo mã mới), ticket ghi hàng đã về, đơn tự duyệt và vào phiếu xuất kho.", { ma: maLkHienTai ?? "" })}
          </div>
          {dangTaiTuongDuong ? (
            <div className="text-[12px] text-[var(--color-text-secondary)]">{t("Đang tải…")}</div>
          ) : (tuongDuong?.rows ?? []).length === 0 ? (
            <div className="rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-subtle)] px-2.5 py-2 text-[12px] text-[var(--color-text-body)]">
              {t("Mã này chưa có linh kiện tương đương nào trong nhóm thay thế (Bảng giá › Linh kiện thay thế).")}
            </div>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {(tuongDuong?.rows ?? []).map((r) => (
                <label
                  key={r.ma_linh_kien}
                  className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-btn)] border px-2.5 py-1.5 ${maLkMoi === r.ma_linh_kien ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}
                >
                  <input type="radio" name="ma-lk-tuong-duong" checked={maLkMoi === r.ma_linh_kien} onChange={() => setMaLkMoi?.(r.ma_linh_kien)} />
                  <span className="shrink-0 font-mono text-[12px] font-semibold text-[var(--color-text)]">{r.ma_linh_kien}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text-body)]" title={r.ten_linh_kien}>{r.ten_linh_kien}</span>
                  {r.gia_ban != null && <span className="shrink-0 text-[12px] tabular-nums text-[var(--color-text-secondary)]">{r.gia_ban.toLocaleString("vi-VN")}đ</span>}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {isDatHang && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Mã EO mua hàng *")}</span>
          <input value={maEo} onChange={(e) => setMaEo?.(e.target.value)} placeholder={t("VD: 3TDO-001234")} className={oNhap} />
        </label>
      )}
      {(isGiaiTrinh || isCapNhat || isDatHang) && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{isDatHang ? t("Ngày dự kiến có hàng (bỏ trống nếu chưa rõ)") : t("Ngày dự kiến có hàng")}</span>
          <input type="date" value={ngayDuKien} min={homNayVN()} max={ngayDuKienToiDa()} onChange={(e) => setNgayDuKien(e.target.value)} className={oNhap} />
          {canhBaoNgayDuKien(ngayDuKien) && <span className="mt-0.5 block text-xs text-[var(--color-danger)]">{t(canhBaoNgayDuKien(ngayDuKien)!)}</span>}
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">
          {isGiaiTrinh ? t("Lý do thiếu hàng *") : isCapNhat ? t("Ghi chú tiến độ") : isTuChoi ? t("Lý do từ chối *") : isHuyBo ? t("Lý do hủy *") : t("Ghi chú (tuỳ chọn)")}
        </span>
        <textarea
          rows={2}
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          placeholder={isGiaiTrinh ? t("Giải thích thực tế vì sao thiếu hàng") : isCapNhat ? t("VD: NCC báo lùi ngày giao") : ""}
          className={`${oNhap} resize-none`}
        />
      </label>
      {isCapNhat && <div className="text-[11px] text-[var(--color-text-secondary)]">{t("Cần đổi ngày dự kiến hoặc nhập ghi chú.")}</div>}
      {isTuChoi && <div className="text-[11px] text-[var(--color-danger-strong)]">{t("Đơn gốc đang chờ hàng sẽ tự hủy (tiền đã trả về quỹ của KTV) và KTV nhận được lý do này.")}</div>}
      {isHuyBo && <div className="text-[11px] text-[var(--color-danger-strong)]">{t("Hủy ticket = hủy luôn đơn gốc đang chờ hàng (tiền đã trả về quỹ của KTV); KTV nhận được lý do này.")}</div>}
      {isChuyenMua && <div className="text-[11px] text-[var(--color-text-secondary)]">{t("Ticket chuyển sang Mua hàng đặt hàng (Mua hàng nhận thông báo). Khi Mua hàng báo đã đặt, ticket về chờ hàng về như sau khi Kho tiếp nhận; Kho vẫn xác nhận \"Hàng đã về\".")}</div>}
      {isDatHang && <div className="text-[11px] text-[var(--color-text-secondary)]">{t("Người đặt đơn được báo mã EO + ngày dự kiến. Hàng về: Kho bấm \"Hàng đã về\" như thường lệ.")}</div>}
      {isGiaiTrinh && goiY.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {goiY.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setGhiChu(l.ten_ly_do)}
              className="focus-ring min-h-8 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-subtle)] px-2.5 text-xs font-medium text-[var(--color-text-body)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary-dark)]"
            >
              {l.ten_ly_do}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 sm:justify-end">
        <Btn variant="ghost" className="min-h-10 flex-1 sm:min-h-9 sm:flex-none" onClick={onCancel}>{t("Quay lại")}</Btn>
        <Btn className="min-h-10 flex-1 sm:min-h-9 sm:flex-none" onClick={onSubmit} disabled={thieuThongTin} loading={pending}>
          {t("Xác nhận")}
        </Btn>
      </div>
    </div>
  );
}

export function ThieuLkTab({
  addToast, qc, canKho, canTacNghiep, canKeToan, isGiamSat, currentEmail, initialFilterOverride, initialNguoiNhanHangOverride,
  initialDetailIdOverride, onDetailIdConsumed, onJumpConsumed, coTaiExcel = true,
}: {
  coTaiExcel?: boolean;
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>; canKho: boolean; canTacNghiep: boolean;
  // Them 2026-09-05 (phan hoi "'Chờ LK' chức năng filter vẫn thiếu bộ lọc theo khu vực, theo người
  // nhận hàng") - chi dung de MO RONG dieu kien hien bo loc Khu vuc/Nguoi nhan hang (showKhuVucFilter
  // ben duoi, khop dung cong thuc DonCuaToiTab.tsx), KHONG dung cho quyen hanh dong (nextStatesForThieuLk
  // khong doi, Ke toan/GS van khong co nut xu ly nao o tab nay).
  canKeToan: boolean; isGiamSat: boolean;
  currentEmail: string;
  initialFilterOverride?: string;
  initialNguoiNhanHangOverride?: string;
  // Them (phan hoi 2026-09-10, tim kiem that o CommandPalette) - mo thang Drawer chi tiet 1 ticket TLK
  // khi nhay toi, cung pattern voi DonCuaToiTab.initialDetailIdOverride (xem openDetailIdFor trong
  // DatMuaLinhKienModule.tsx).
  initialDetailIdOverride?: string;
  onDetailIdConsumed?: () => void;
  // FIX (phan hoi 2026-09-24: "click vào việc cần làm/starbar thường phải click 2 lần" - xem giai thich
  // day du o jumpTarget/consumeJumpTarget trong DatMuaLinhKienModule.tsx) - cung co che "tu tieu thu"
  // nhu onDetailIdConsumed o tren, ap dung cho initialFilterOverride/initialNguoiNhanHangOverride thay
  // vi timer mu.
  onJumpConsumed?: () => void;
}) {
  // Nhom LK Kho duoc gan (Karofi / B2B, 2026-10-16) - chi tai khoan CHI lam Kho (khong TN/Ke toan/Admin), cung quy tac laKhoThuan backend.
  const authNhom = useAuth();
  const userNhom = authNhom.status === "authenticated" ? authNhom.user : null;
  const nhomKhoXuLy =
    userNhom?.la_kho && !userNhom.la_tac_nghiep && !userNhom.la_ke_toan && userNhom.vai_tro !== "Admin" ? userNhom.kho_nhom_lk ?? null : null;
  // FIX (ra soat bug mua hang 2026-08-26, BUG-002): tach lop luu-lau-dai (localStorage) khoi lop
  // hien-thi/query - jump tu Home/Pipeline CHI doi lop hien thi, khong ghi de vinh vien filter da luu
  // (dung y "giữ filter đã lưu gần nhất" cua chu he thong). Xem giai thich day du o DonCuaToiTab.tsx.
  // Kho/TN mac dinh loc "Việc cần xử lý" (__VIEC__ - CUNG tap trang thai voi badge Sidebar, fix 2026-09-28: truoc
  // day Kho mac dinh "Cho kho xu ly" nen badge dem ca "Kho da tiep nhan" ma bam vao khong thay). Doi key localStorage
  // (-v2) de moi tai khoan dang luu "Cho kho xu ly" tu dong sang mac dinh moi 1 lan.
  const coViec = canKho || canTacNghiep;
  const [savedFilterTrangThai, setSavedFilterTrangThai] = useLocalStorageState("filters:dmlk-tlk-tt-v2", coViec ? "__VIEC__" : "");
  // FIX (phan hoi 2026-08-28: nhay tu Trang chu lan dau hien danh sach trong, bam lai moi dung) - khoi
  // tao TRUC TIEP tu initialFilterOverride khi co, xem giai thich day du o PhieuXuatKhoTab.tsx.
  const [filterTrangThai, setFilterTrangThaiDisplay] = useState(initialFilterOverride ?? savedFilterTrangThai);
  function setFilterTrangThai(v: string) {
    setFilterTrangThaiDisplay(v);
    setSavedFilterTrangThai(v);
  }
  useEffect(() => {
    if (initialFilterOverride !== undefined) { setFilterTrangThaiDisplay(initialFilterOverride); onJumpConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilterOverride]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ktvDisplayMap = useKtvDisplayMap();
  // Them 2026-08-21 (dong bo giao dien voi Mua hang/Cong no - "hợp nhất phong cách giao diện"): o
  // tim kiem tu do + nut thu gon "☰ Bộ lọc ▾" + Drawer chi tiet (xem ThieuLkDetailModal).
  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const hen = setTimeout(() => setDebouncedQ(filterQ.trim()), 500);
    return () => clearTimeout(hen);
  }, [filterQ]);
  const [showFilters, setShowFilters] = useState(false);
  const [detailId, setDetailIdRaw] = useState<string | null>(null);
  // Buoc can nhap lieu (Tiep nhan/Cap nhat) bam tu danh sach -> mo Drawer cua ticket do voi form mo san (2026-09-29,
  // thay Modal cu khong hien ticket nao). Xoa khi chuyen sang ticket khac bang ‹ ›.
  const [detailAction, setDetailAction] = useState<string | null>(null);
  function setDetailId(id: string | null) {
    setDetailAction(null);
    setDetailIdRaw(id);
  }
  useEffect(() => {
    if (initialDetailIdOverride) {
      setDetailId(initialDetailIdOverride);
      onDetailIdConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDetailIdOverride]);
  // Bo loc Khu vuc (them 2026-08-31, MO RONG 2026-09-05 phan hoi "'Chờ LK' chức năng filter vẫn thiếu
  // bộ lọc theo khu vực, theo người nhận hàng" - truoc chi Kho (canKho) can, gio khop dung cong thuc
  // showKhuVucFilter cua DonCuaToiTab.tsx: moi "nhan vien van phong" lien quan xem toan canh theo Khu
  // vuc, khong chi rieng Kho hanh dong duoc).
  const showKhuVucFilter = canTacNghiep || canKho || canKeToan || isGiamSat;
  const laMuaHangTk = !!userNhom?.la_mua_hang;
  const [filterKhuVuc, setFilterKhuVuc] = useState<Set<string>>(new Set());
  const khuVucDefaultAppliedRef = useRef(false);
  const { data: khuVucAllData } = useQuery({
    queryKey: ["settings-khu-vuc"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/settings/khu-vuc"),
    enabled: showKhuVucFilter,
  });
  const { data: khuVucCuaToiData } = useQuery({
    queryKey: ["dat-mua-lk-khu-vuc-cua-toi"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/dat-mua-lk/khu-vuc-cua-toi"),
    enabled: showKhuVucFilter,
  });
  // FIX (phat hien qua test 2026-08-31): "enabled: showKhuVucFilter" o 2 query tren KHONG du de chan
  // du lieu - React Query dung CHUNG cache theo queryKey xuyen suot app, ["dat-mua-lk-khu-vuc-cua-toi"]
  // da duoc DonCuaToiTab.tsx/PhieuXuatKhoTab.tsx/TraHangTab.tsx fetch san (enabled rong hon) nen
  // component nay van "thay" duoc du lieu cache du chinh no khong tu fetch - phai chan tuong minh
  // bang showKhuVucFilter ngay trong effect/bien duoi, khong dua vao enabled/query rong hay co du lieu.
  useEffect(() => {
    if (!showKhuVucFilter) return;
    if (khuVucDefaultAppliedRef.current) return;
    if (!khuVucCuaToiData) return;
    khuVucDefaultAppliedRef.current = true;
    // Mua hang (kiem Kho) KHONG ap khu vuc mac dinh - thay tat ca ticket "Chờ mua hàng" (2026-10-29).
    if (laMuaHangTk) return;
    if (khuVucCuaToiData.rows.length > 0) setFilterKhuVuc(new Set(khuVucCuaToiData.rows.map((r) => r.ma)));
  }, [khuVucCuaToiData, showKhuVucFilter, laMuaHangTk]);
  const khuVucOptions = showKhuVucFilter ? (khuVucAllData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ten })) : [];
  const khuVucParam = showKhuVucFilter && filterKhuVuc.size > 0 ? [...filterKhuVuc].sort().join(",") : "";

  // Bo loc "Nguoi nhan hang" (KTV chu don goc sinh ra ticket) - them 2026-09-05, cung phan hoi tren.
  // Tai dung dung endpoint/component da co san o DonCuaToiTab.tsx/PhieuXuatKhoTab.tsx (React Query
  // cache chung theo queryKey nen khong ton them request neu tab kia da fetch).
  const [filterNguoiNhanHang, setFilterNguoiNhanHangDisplay] = useState(initialNguoiNhanHangOverride ?? "");
  function setFilterNguoiNhanHang(v: string) {
    setFilterNguoiNhanHangDisplay(v);
  }
  useEffect(() => {
    if (initialNguoiNhanHangOverride !== undefined) { setFilterNguoiNhanHangDisplay(initialNguoiNhanHangOverride); onJumpConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNguoiNhanHangOverride]);
  const { data: nguoiNhanHangData } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: NguoiNhanHangKhaDungRow[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
    enabled: showKhuVucFilter,
  });

  // Loc "Nguồn tiếp nhận" (v1.565) - chon nhieu, khong chon = tat ca.
  const [filterNguon, setFilterNguon] = useState<Set<string>>(new Set());
  const nguonParam = [...filterNguon].sort().join(",");
  const nguonOptions = Object.entries(NGUON_TIEP_NHAN).map(([value, n]) => ({ value, label: t(n.label) }));
  // Ticket THB dang mo (popup xu ly rieng cua THB).
  const [moThb, setMoThb] = useState<string | null>(null);
  // Loc nhanh theo trang thai MA LK cua don goc (2026-10-16): "" | "cho" | "da".
  const [filterMaLk, setFilterMaLk] = useState<"" | "cho" | "da">("");
  // Loc "Kho đã có đủ hàng" (2026-10-16).
  const [filterDuHang, setFilterDuHang] = useState(false);
  // GD4 (phan hoi Codex #16): ve trang 1 + xoa selection dang chon khi doi bo loc trang thai.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [filterTrangThai, debouncedQ, khuVucParam, filterNguoiNhanHang, filterMaLk, filterDuHang, nguonParam]);

  // GD4 (phan hoi Codex #17): phan trang server-side - truoc day tai het toan bo dong khop bo loc
  // roi tu slice o client, moi lan doi trang van doc lai het du lieu tu D1.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-thieu-lk", filterTrangThai, debouncedQ, khuVucParam, filterNguoiNhanHang, filterMaLk, filterDuHang, nguonParam, page],
    queryFn: () =>
      api.get<{ rows: ThieuLkRow[]; total: number }>(
        "/dat-mua-lk/thieu-lk" +
          buildQuery({
            trang_thai: filterTrangThai || undefined,
            ma_lk_tt: filterMaLk || undefined,
            du_hang: filterDuHang ? 1 : undefined,
            q: debouncedQ || undefined,
            khu_vuc: khuVucParam || undefined,
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            nguon: nguonParam || undefined,
            page,
            pageSize: 20,
          }),
      ),
  });
  // So "(N)" canh moi trang thai trong TrangThaiDropdownFilter (them 2026-09-01) - dem TINH theo dung
  // scope cua tab, bo qua cac bo loc phu (khu_vuc/q) - xem GET /dat-mua-lk/thieu-lk-status-counts.
  // SUA 2026-09-28 (cot trang thai ben trai): gui CUNG bo loc voi danh sach (tru trang thai) de so moi muc = so dong
  // that khi bam vao. 1 truy van GROUP BY o server; chi tai lai khi doi khu vuc/nguoi nhan/tim kiem hoac sau thao tac.
  const { data: statusCountsData } = useQuery({
    queryKey: ["dat-mua-lk-thieu-lk-status-counts", khuVucParam, filterNguoiNhanHang, debouncedQ, filterMaLk, filterTrangThai, filterDuHang, nguonParam],
    queryFn: () =>
      api.get<{ counts: Record<string, number>; ma_lk?: { cho: number; da: number }; du_hang?: number }>(
        "/dat-mua-lk/thieu-lk-status-counts" +
          buildQuery({
            khu_vuc: khuVucParam || undefined, nguoi_nhan_hang: filterNguoiNhanHang || undefined, q: debouncedQ || undefined,
            ma_lk_tt: filterMaLk || undefined, trang_thai: filterTrangThai || undefined, du_hang: filterDuHang ? 1 : undefined,
            nguon: nguonParam || undefined,
          }),
      ),
  });

  // "Tải danh sách chi tiết" (them 2026-09-13) - mirror handleDownloadFullList() cua UsersModule.tsx,
  // goi lai GET /dat-mua-lk/thieu-lk VOI CUNG bo loc dang xem nhung KHONG truyen page (BE tra HET).
  const personDir = usePersonDirectory(); // ten nguoi trong file tai ve (2026-09-29)
  const [downloadingFull, setDownloadingFull] = useState(false);
  async function handleDownloadFullList() {
    setDownloadingFull(true);
    try {
      const res = await api.get<{ rows: ThieuLkRow[] }>(
        "/dat-mua-lk/thieu-lk" +
          buildQuery({
            trang_thai: filterTrangThai || undefined,
            ma_lk_tt: filterMaLk || undefined,
            du_hang: filterDuHang ? 1 : undefined,
            q: debouncedQ || undefined,
            khu_vuc: khuVucParam || undefined,
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            nguon: nguonParam || undefined,
          }),
      );
      await exportRowsToExcel(doiNguoiThanhTen(res.rows, personDir), "thieu_lk_chi_tiet.xlsx", "Thiếu LK");
    } catch (err) {
      addToast(t("Không tải được danh sách chi tiết: ") + describeApiError(err));
    } finally {
      setDownloadingFull(false);
    }
  }

  // Nut KHONG can nhap lieu ban thang mutate() (tieu chi UX #3, sua 2026-08-15); nut can nhap lieu (Tiep nhan/Cap
  // nhat) mo Drawer chi tiet voi form san (detailAction) - form + chip goi y ly do nam o ThieuLkActionForm.
  const logMutation = useMutation({
    mutationFn: (args: { id: string; trangThai: string; ghiChu?: string; ngayDuKien?: string }) =>
      api.post(`/dat-mua-lk/thieu-lk/${args.id}/log`, {
        trang_thai: args.trangThai,
        ghi_chu: args.ghiChu?.trim() || undefined,
        ngay_du_kien_co_hang: args.ngayDuKien || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      // Don goc doi trang thai theo ticket (Cho hang -> Cho TN duyet, TN duyet ticket -> duyet don) - 2026-09-29.
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail"] });
      invalidatePipelineCounts(qc);
      addToast(t("Đã cập nhật trạng thái thiếu LK"));
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  // "Da ket thuc" la cua TN (khop cot "Admin xu ly" trong Excel goc), con lai la Kho. "Da huy bo"
  // cung mo cho chinh TN da tao ticket (nguoi_tao), khong chi Kho - khop quyen da co san o backend
  // (POST /thieu-lk/:id/log: isCancel cho phep nguoi_tao huy bat ky luc nao con dang mo).
  const canMuaHang = !!userNhom?.la_mua_hang || userNhom?.vai_tro === "Admin";
  // "Rà soát hàng về" (2026-10-28): xac nhan hang ve tu dong theo ton kho cong ty hien tai, uu tien ca khieu nai > ton lau > don uu tien
  // (backend lib/tuDongHangVe.ts - cung chay tu dong sau moi lan Ke toan import ton kho).
  const raSoatHangVe = useMutation({
    mutationFn: () =>
      api.post<{ ok: true; da_xac_nhan: string[]; bo_qua: string[]; cho_phuong_an?: { id: string; co: number; can: number }[] }>("/dat-mua-lk/thieu-lk/tu-dong-hang-ve", {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      invalidatePipelineCounts(qc);
      const cho = r.cho_phuong_an ?? [];
      addToast(
        (r.da_xac_nhan.length
          ? t("Đã tự xác nhận hàng về {n} đơn: {a}", { n: r.da_xac_nhan.length, a: r.da_xac_nhan.slice(0, 8).join(", ") + (r.da_xac_nhan.length > 8 ? "…" : "") })
          : t("Không có đơn chờ hàng nào đủ tồn kho công ty")) +
          (cho.length
            ? " · " + t("{n} đơn ưu tiên chỉ đủ một phần — dừng tự duyệt, chờ chọn phương án (tách đơn): {a}", {
                n: cho.length, a: cho.slice(0, 5).map((d) => `${d.id} (${d.co}/${d.can})`).join(", "),
              })
            : ""),
      );
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });
  // Ticket THB: xu ly trong popup rieng (XemThieuHangBh) - khong nut nhanh / chon hang loat o danh sach.
  const NEXT_STATES = (r: ThieuLkRow) => (r.loai_ticket === "bh" ? [] : nextStatesForThieuLk(r, { canKho, canTacNghiep, currentEmail, canMuaHang }));

  // Bulk-log (tieu chi UX #4, them 2026-08-15) - chi ap dung cho cac buoc KHONG can nhap lieu bat
  // buoc ("Kho da tiep nhan" can giai trinh rieng tung dong nen loai khoi bulk). Thanh hanh dong chi
  // hien cac trang thai dich CHUNG cho toan bo dong da chon (giao cua tap NEXT_STATES tung dong).
  const BULK_ELIGIBLE_STATES = ["Kho xac nhan hang da ve", "Da co hang", "Kho tu choi sai TT", "Da huy bo", "Da ket thuc"];
  const eligibleBulkStates = (r: ThieuLkRow) => NEXT_STATES(r).filter((s) => s.canDo && BULK_ELIGIBLE_STATES.includes(s.trangThai)).map((s) => s.trangThai);
  const rowsCoTheChon = (data?.rows ?? []).filter((r) => eligibleBulkStates(r).length > 0);
  const selectedRows = (data?.rows ?? []).filter((r) => selected.has(r.id));
  const commonBulkStates =
    selectedRows.length === 0
      ? []
      : selectedRows.reduce<string[]>((acc, r, i) => (i === 0 ? eligibleBulkStates(r) : acc.filter((s) => eligibleBulkStates(r).includes(s))), []);

  function toggleSelectAll() {
    setSelected((s) => (s.size === rowsCoTheChon.length && rowsCoTheChon.length > 0 ? new Set() : new Set(rowsCoTheChon.map((r) => r.id))));
  }
  function toggleSelectOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const bulkMutation = useMutation({
    mutationFn: (args: { trangThai: string; ghiChu?: string }) =>
      api.post<{ results: Record<string, string> }>("/dat-mua-lk/thieu-lk/bulk-log", { ids: [...selected], trang_thai: args.trangThai, ghi_chu: args.ghiChu }),
    onSuccess: (res) => {
      const entries = Object.entries(res.results);
      const failed = entries.filter(([, v]) => v !== "ok");
      // Phase 4 (bulk retry): giu lai dung cac dong loi trong `selected` khi that bai 1 phan, xem
      // comment day du o DonCuaToiTab.tsx (cung pattern).
      setSelected(new Set(failed.map(([lineId]) => lineId)));
      addToast(
        failed.length === 0
          ? t("Đã xử lý thành công {a} dòng", { a: entries.length })
          : t("Thành công {a}/{b} dòng — đã giữ lại các dòng lỗi, bấm lại để thử lại", { a: entries.length - failed.length, b: entries.length }),
      );
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      // Don goc doi trang thai theo ticket (Cho hang -> Cho TN duyet, TN duyet ticket -> duyet don) - 2026-09-29.
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail"] });
      invalidatePipelineCounts(qc);
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  // FIX (ra soat bug mua hang 2026-08-26, BUG-003): thieu filterTrangThai trong bo dem - nut "☰ Bộ
  // lọc" khong bao gio hien "(N)" du dang loc theo trang thai (mac dinh Kho la "Cho kho xu ly"), va
  // panel loc mac dinh THU GON (showFilters=false) nen nguoi dung khong thay duoc dang loc gi ca. Khop
  // dung pattern da co san o DonCuaToiTab.tsx (activeFilterCount co filterTrangThai). KHONG them chip
  // rieng vao ActiveFiltersBar - gia tri dang chon da hien SAN trong o TrangThaiDropdownFilter (doi tu
  // chip/nut sang dropdown 2026-09-01), them chip nua se TRUNG LAP (xem comment tuong tu o
  // DonCuaToiTab.tsx/PhieuXuatKhoTab.tsx).
  // Trang thai da hien o cot ben trai (ThieuLkStatusRail) nen khong dem vao "Bộ lọc (N)" nua (2026-09-28).
  const activeFilterCount = [filterQ, khuVucParam, filterNguoiNhanHang, nguonParam].filter(Boolean).length;
  // "⚙ Tuỳ chỉnh cột" (phan hoi 2026-09-05: "button 'Tùy chỉnh cột' vẫn đang ở bên ngoài" so voi Mua
  // hàng/Công nợ) - truoc day 1 hang rieng LUON hien phia tren danh sach (xem ThieuLkGroupedList).
  // Doi sang Portal vao trong bang loc (mac dinh AN theo showFilters), khop DUNG pattern DonCuaToiTab.tsx
  // (xem comment "hang muc #2 dot 2" o do) - nut/panel that su van do ThieuLkGroupedList tu ve (can
  // effectiveColumns/toggleColumn cua chinh no), o trong (callback ref) chi la dich portal.
  const [columnSettingsSlot, setColumnSettingsSlot] = useState<HTMLDivElement | null>(null);

  return (
    <div className="mt-4 md:flex md:items-start md:gap-[14px]">
      <ThieuLkStatusRail value={filterTrangThai} onChange={setFilterTrangThai} counts={statusCountsData?.counts} canKho={canKho} canTacNghiep={canTacNghiep} canMuaHang={canMuaHang} />
      <div className="min-w-0 flex-1">
      <FilterSearchBar
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((v) => !v)}
        activeFilterCount={activeFilterCount}
        searchValue={filterQ}
        onSearchChange={setFilterQ}
        searchPlaceholder={t("Tìm theo mã TLK / THB, mã đơn, mã đơn BH, mã YCSC / case, mã Lada, mã LK, tên LK, tên KTV...")}
        trailing={
          // Tai Excel (2026-10-02): LUON hien canh o tim (truoc nam trong khoi Bo loc thu gon) - moi vai tro tru KTV/Ve tinh thuan.
          coTaiExcel || canKho || canTacNghiep || canKeToan ? (
            <div className="flex items-center gap-2">
              {(canKho || canTacNghiep || canKeToan) && (
                <Btn
                  size="sm"
                  variant="ghost"
                  loading={raSoatHangVe.isPending}
                  disabled={raSoatHangVe.isPending}
                  title={t("Tự xác nhận hàng về cho đơn chờ hàng theo tồn kho công ty hiện tại — ưu tiên ca khiếu nại > đơn tồn lâu > đơn ưu tiên")}
                  onClick={() => {
                    if (window.confirm(t("Rà soát tồn kho công ty và tự xác nhận hàng về cho các đơn chờ hàng đủ hàng (ưu tiên ca khiếu nại > đơn tồn lâu > đơn ưu tiên)?"))) raSoatHangVe.mutate();
                  }}
                >
                  {t("📦 Rà soát hàng về")}
                </Btn>
              )}
              {coTaiExcel && (
                <Btn size="sm" variant="ghost" onClick={handleDownloadFullList} disabled={downloadingFull}>
                  {downloadingFull ? t("Đang tải...") : t("⬇ Tải Excel")}
                </Btn>
              )}
            </div>
          ) : undefined
        }
      >
        {/* Bo loc Khu vuc (them 2026-08-31, MO RONG 2026-09-05 dong bo voi DonCuaToiTab.tsx - xem
            showKhuVucFilter phia tren, khong chi rieng Kho nua). SUA BUG GIAO DIEN (phan hoi 2026-09-12):
            bo nhan "Khu vực" rieng ben ngoai (gay lech chieu cao so voi cac o loc khac cung hang) -
            nhan da gop vao THANG nut trigger (xem triggerLabel trong SharedUi.tsx). */}
        {showKhuVucFilter && khuVucOptions.length > 0 && <KhuVucChipFilter value={filterKhuVuc} onChange={setFilterKhuVuc} options={khuVucOptions} />}
        <KhuVucChipFilter value={filterNguon} onChange={setFilterNguon} options={nguonOptions} tieuDe={t("Nguồn tiếp nhận")} />
        {/* Bo loc "Nguoi nhan hang" (them 2026-09-05, cung phan hoi tren). */}
        {(nguoiNhanHangData?.rows.length ?? 0) > 0 && (
          <Select
            value={filterNguoiNhanHang}
            onChange={setFilterNguoiNhanHang}
            options={[{ value: "", label: t("Tất cả người nhận hàng") }, ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: ktvOptionLabel(r, nguoiNhanHangData?.rows ?? []) }))]}
          />
        )}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] mb-1">{t("Cột hiển thị")}</div>
          <div ref={setColumnSettingsSlot} />
        </div>
      </FilterSearchBar>
      {/* Loc nhanh trang thai ma LK cua don goc (2026-10-16) - "Mã chờ xác nhận" = Kho vao chi tiet ticket xac nhan ma. */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {nhomKhoXuLy && (
          // Kho THUAN duoc Admin gan 1 nhom LK (2026-10-16, backend lib/nhomLk.ts khoNhomLkLoc) - server da loc san danh sach.
          <span className="mr-1 inline-flex items-center gap-1 text-xs text-[var(--color-text-secondary)]" title={t("Admin đã gán tài khoản này chỉ xử lý thiếu hàng của nhóm linh kiện này")}>
            {t("Đang xử lý:")} <NhomLkBadge value={nhomKhoXuLy} />
          </span>
        )}
        {([
          ["", t("Tất cả mã LK")],
          ["cho", t("Mã chờ xác nhận ({n})", { n: statusCountsData?.ma_lk?.cho ?? 0 })],
          ["da", t("Mã đã xác nhận ({n})", { n: statusCountsData?.ma_lk?.da ?? 0 })],
        ] as const).map(([v, nhan]) => (
          <button key={v} type="button" className={`filter-tab ${filterMaLk === v ? "active" : ""}`} onClick={() => setFilterMaLk(v)}>
            {nhan}
          </button>
        ))}
        <button type="button" className={`filter-tab ${filterDuHang ? "active" : ""}`} onClick={() => setFilterDuHang((v) => !v)} title={t("Đơn chờ hàng đã có đủ tồn kho công ty (xét đơn chờ lâu nhất trước) — Kho có thể xác nhận")}>
          {t("Kho đã có đủ hàng ({n})", { n: statusCountsData?.du_hang ?? 0 })}
        </button>
      </div>
      <ActiveFiltersBar
        chips={[
          ...(khuVucParam ? [{ label: t("Khu vực: {a}", { a: [...filterKhuVuc].map((ma) => khuVucOptions.find((o) => o.value === ma)?.label ?? ma).join(", ") }), onClear: () => setFilterKhuVuc(new Set()) }] : []),
          ...(filterNguoiNhanHang ? [{ label: t("Người nhận hàng đã lọc"), onClear: () => setFilterNguoiNhanHang("") }] : []),
          ...(nguonParam ? [{ label: t("Nguồn: {a}", { a: [...filterNguon].map((v) => nguonOptions.find((o) => o.value === v)?.label ?? v).join(", ") }), onClear: () => setFilterNguon(new Set()) }] : []),
          ...(filterQ ? [{ label: t("Tìm: \"{a}\"", { a: filterQ }), onClear: () => setFilterQ("") }] : []),
        ]}
      />
      {/* Dong bo pattern "Chọn tất cả" voi DonHangGroupedList (DonCuaToiTab.tsx) - dat O DAY (thanh phan
          cha), KHONG trong ThieuLkGroupedList, vi ap dung xuyen suot MOI nhom KTV tren trang, khong
          rieng 1 nhom. */}
      {rowsCoTheChon.length > 0 && (
        // Ca nhan la vung cham (min-h-10) - truoc day chi o checkbox 13px bam duoc, cau chu 2 dong tren mobile.
        <label className="mb-1 flex min-h-10 cursor-pointer items-center gap-2 text-xs sm:min-h-0 sm:mb-2">
          <input type="checkbox" className="h-4 w-4" checked={selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />
          <span className="truncate text-[var(--ink-500)]">
            {t("Chọn tất cả {a} ticket xử lý được", { a: rowsCoTheChon.length })}<span className="hidden sm:inline"> {t("(trên mọi nhóm KTV ở trang này)")}</span>
          </span>
        </label>
      )}
      {selected.size > 0 && (
        // Mobile: thanh thao tac hang loat NOI o day man hinh (tren thanh dieu huong 56px) de luon thay khi cuon
        // danh sach dai; desktop giu vi tri cu phia tren danh sach.
        <div className="fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 flex-wrap rounded-lg border border-[var(--ocean-800)]/30 bg-[var(--ocean-100)] px-3 py-2 shadow-[var(--shadow-pop)] sm:static sm:mb-3 sm:shadow-none">
          <span className="text-sm font-bold text-[var(--ocean-900)]">{t("Đã chọn {a} dòng", { a: selected.size })}</span>
          {commonBulkStates.length === 0 ? (
            <span className="text-xs text-[var(--ocean-900)]">{t("Các dòng đã chọn không có bước xử lý chung — chọn lại theo cùng trạng thái")}</span>
          ) : (
            commonBulkStates.map((s) => (
              <BulkConfirmButton
                key={s}
                label={actionLabel(s)}
                confirmLabel={t("Xác nhận chuyển {a} dòng sang \"{b}\"?", { a: selected.size, b: actionLabel(s) })}
                count={selected.size}
                onConfirm={() => {
                  // Kho tu choi (sai TT) bat buoc ly do (2026-10-20) - hang loat dung chung 1 ly do cho moi dong da chon.
                  // + Huy bo hang loat (2026-10-30): Kho / Mua hang huy = huy don goc, bat buoc ly do.
                  if (s === "Kho tu choi sai TT" || s === "Da huy bo") {
                    const huy = s === "Da huy bo";
                    const lyDo = window.prompt(
                      huy
                        ? t("Lý do hủy (bắt buộc, áp dụng cho {a} dòng đã chọn — đơn gốc bị hủy, KTV nhận được lý do này):", { a: selected.size })
                        : t("Lý do từ chối (bắt buộc, áp dụng cho {a} dòng đã chọn — KTV nhận được lý do này):", { a: selected.size }),
                    )?.trim();
                    if (!lyDo) {
                      if (lyDo !== undefined) addToast(huy ? t("Hủy bỏ bắt buộc nhập lý do") : t("Kho từ chối bắt buộc nhập lý do"));
                      return;
                    }
                    bulkMutation.mutate({ trangThai: s, ghiChu: lyDo });
                  } else bulkMutation.mutate({ trangThai: s });
                }}
                disabled={bulkMutation.isPending}
                loading={bulkMutation.isPending}
              />
            ))
          )}
        </div>
      )}
      {/* SUA (phan hoi 2026-08-21: "format Thiếu LK khác Mua hàng/Công nợ") - doi tu 1 bang PHANG
          (PaginatedTable) sang danh sach NHOM THEO KTV + nut hanh dong dang ICON, dung KIEN TRUC
          giong het DonHangGroupedList (xem ThieuLkGroupedList duoi day) thay vi tu xay 1 kieu rieng. */}
      <ThieuLkGroupedList
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        page={page}
        pageSize={20}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onDetail={(id) => (data?.rows.find((r) => r.id === id)?.loai_ticket === "bh" ? setMoThb(id) : setDetailId(id))}
        ktvDisplayMap={ktvDisplayMap}
        nextStates={NEXT_STATES}
        onGiaiTrinh={(r, tt) => { setDetailIdRaw(r.id); setDetailAction(tt); }}
        onQuickAction={(r, trangThai) => { if (xacNhanDaCoHang(trangThai)) logMutation.mutate({ id: r.id, trangThai }); }}
        quickActionPending={logMutation.isPending}
        selected={selected}
        toggleSelectOne={toggleSelectOne}
        rowsCoTheChon={rowsCoTheChon}
        columnSettingsSlot={columnSettingsSlot}
        filterTrangThai={filterTrangThai}
        onXemTatCa={() => setFilterTrangThai("")}
      />
      {/* Chua cho thanh hang loat noi (fixed) tren mobile khong che the cuoi danh sach. */}
      {selected.size > 0 && <div className="h-16 sm:hidden" />}
      {moThb && <XemThieuHangBh id={moThb} onClose={() => setMoThb(null)} addToast={addToast} />}
      {detailId && (
        <ThieuLkDetailModal
          key={detailId}
          id={detailId}
          initialAction={detailAction ?? undefined}
          initialRow={data?.rows.find((r) => r.id === detailId)}
          onClose={() => setDetailId(null)}
          addToast={addToast}
          qc={qc}
          canKho={canKho}
          canTacNghiep={canTacNghiep}
          currentEmail={currentEmail}
          navRows={data?.rows.filter((r) => r.loai_ticket !== "bh")}
          onNavigate={setDetailId}
        />
      )}
      </div>
    </div>
  );
}

// SUA (phan hoi 2026-08-21: "format Thiếu LK khác Mua hàng/Công nợ") - danh sach NHOM THEO KTV, dung
// kien truc GIONG HET DonHangGroupedList (DonCuaToiTab.tsx): 1 <table> rieng/nhom tren desktop, the
// doc tren mobile, nut hanh dong dang ICON tron thay vi nut co chu, "⚙ Tuy chinh cot" dat 1 hang rieng
// TRUOC cac nhom (khong phai trong header cot dau). Nhom theo `nguoi_nhan_hang || ddh_nguoi_tao` (KTV
// chu don, LAY TU dat_don_hang qua JOIN) - KHAC voi `nguoi_tao` cua rieng ticket thieu_lk (nguoi BAO
// thieu, thuong la Kho, khong phai KTV) nen van giu "TN báo" la 1 COT rieng trong bang, khong dung lam
// nhan nhom.
function ThieuLkGroupedList({
  rows, isLoading, isError, page, pageSize, total, onPageChange, onDetail, ktvDisplayMap,
  nextStates, onGiaiTrinh, onQuickAction, quickActionPending, selected, toggleSelectOne, rowsCoTheChon, columnSettingsSlot,
  filterTrangThai, onXemTatCa,
}: {
  filterTrangThai: string;
  onXemTatCa: () => void;
  rows: ThieuLkRow[];
  isLoading: boolean;
  isError: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onDetail: (id: string) => void;
  ktvDisplayMap: ReturnType<typeof useKtvDisplayMap>;
  nextStates: (r: ThieuLkRow) => { trangThai: string; canDo: boolean }[];
  onGiaiTrinh: (r: ThieuLkRow, trangThai: string) => void;
  onQuickAction: (r: ThieuLkRow, trangThai: string) => void;
  quickActionPending: boolean;
  selected: Set<string>;
  toggleSelectOne: (id: string) => void;
  rowsCoTheChon: ThieuLkRow[];
  // Dich Portal cho nut/panel "⚙ Tuỳ chỉnh cột" (phan hoi 2026-09-05, khop dung
  // DonHangGroupedList/DonCuaToiTab.tsx) - null khi bang loc dang an (showFilters=false o component
  // cha), portal tu khong render gi ca.
  columnSettingsSlot: HTMLDivElement | null;
}) {
  // Icon rieng cho tung trang thai dich (thay the nhan chu "Kho đã tiếp nhận…"/"Hủy bỏ"... o dang
  // PaginatedTable cu) - giu title/aria-label bang dung actionLabel() de khong mat thong tin cho
  // nguoi dung dung trinh doc man hinh/hover, chi phan hien thi la icon.
  const ACTION_ICON: Record<string, string> = {
    "Kho da tiep nhan": "📝",
    "Kho da cap nhat": "🗓",
    "Kho tu choi sai TT": "✕",
    "Da huy bo": "🚫",
    "Kho xac nhan hang da ve": "✓",
    "Da co hang": "📦",
    "Da ket thuc": "✅",
    "Cho mua hang": "🛒",
    "Mua hang da dat": "🧾",
    "Mua hang tu choi": "✕",
  };
  const ACTION_DANGER = new Set(["Kho tu choi sai TT", "Da huy bo", "Mua hang tu choi"]);

  const cols: Column<ThieuLkRow>[] = [
    ...(rowsCoTheChon.length > 0
      ? [
          {
            key: "chon",
            header: "",
            render: (r: ThieuLkRow) =>
              rowsCoTheChon.some((x) => x.id === r.id) ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelectOne(r.id)} />
                </span>
              ) : null,
          } as Column<ThieuLkRow>,
        ]
      : []),
    {
      key: "linh_kien", header: t("Linh kiện"),
      // SUA BUG GIAO DIEN (phan hoi 2026-09-12, kem anh chup ma LK lap 2 lan trong cung 1 dong don) -
      // truoc day hien ma_lk RIENG 1 dong tren, gay lap voi ten_lk_snapshot da TU chua san ma trong
      // chuoi - gop ve DUNG 1 dong bang formatLkLabel() (dong bo voi LinhKienPicker.tsx).
      render: (r) => (
        <div className="font-medium truncate">
          {r.uu_tien === 1 && <PriorityTag />}{" "}
          <YeuCauHuyChip boPhan={r.ddh_yeu_cau_huy} />{" "}
          {r.ma_lk ? formatLkLabel(r.ma_lk, r.ten_lk_snapshot ?? r.ma_lk) : (r.ten_lk_snapshot ?? r.id)}
        </div>
      ),
    },
    { key: "nguon_tiep_nhan", header: t("Nguồn tiếp nhận"), render: (r) => <NguonTiepNhanBadge r={r} /> },
    { key: "ma_lk_tt", header: t("Mã LK"), render: (r) => (r.loai_ticket === "bh" ? <span className="text-[var(--ink-400)]">—</span> : <MaLkXacNhanBadge tt={r.lk_trang_thai_ma} />) },
    // Nhom LK Karofi / B2B (2026-10-16, migration 0088) - Kho duoc gan 1 nhom chi thay ticket cua nhom do.
    { key: "nhom_lk", header: t("Nhóm LK"), render: (r) => <NhomLkBadge value={r.lk_nhom_lk} /> },
    { key: "kho_du_hang", header: t("Kho công ty"), render: (r) => (r.kho_du_hang ? <KhoDuHangBadge du={r.kho_du_hang} /> : r.kho_mot_phan ? <KhoMotPhanBadge co={r.kho_mot_phan} sl={r.so_luong_de_xuat} /> : <span className="text-[var(--ink-400)]">—</span>) },
    {
      key: "loai", header: t("Loại"),
      render: (r) =>
        r.loai_ticket === "bh" ? (
          <span className="whitespace-nowrap text-xs" title={t("Đơn bảo hành {a}", { a: r.dat_don_hang_id })}>
            {t("Đơn BH")} <span className="font-mono">{r.dat_don_hang_id}</span>{r.case_id ? ` · ${r.case_id}` : ""}
          </span>
        ) : (
          <LoaiDeXuatBadge loaiDon={r.loai_don} loaiDeXuat={r.loai_de_xuat} />
        ),
    },
    { key: "loai_chiet_khau", header: t("Loại chiết khấu"), render: (r) => <LoaiChietKhauText id={r.loai_chiet_khau_id} thuCong={r.loai_chiet_khau_thu_cong} /> },
    { key: "nguoi_tao", header: t("TN báo"), render: (r) => (r.loai_ticket === "bh" ? (r.nguoi_tao ?? t("App Bảo hành đổi trả")) : formatNguoiDisplay(r.nguoi_tao, ktvDisplayMap)) },
    { key: "ngay_tao", header: t("Ngày báo"), render: (r) => fmtDateTime(r.ngay_tao) },
    // fmtDate: truoc day in thang chuoi ISO "2026-10-05" (lech dinh dang dd/mm/yyyy cua moi cot ngay khac).
    { key: "ngay_du_kien_co_hang", header: t("Ngày dự kiến có hàng"), render: (r) => fmtDate(r.ngay_du_kien_co_hang) },
    { key: "ngay_hang_ve_thuc_te", header: t("Ngày hàng về"), render: (r) => fmtDate(r.ngay_hang_ve_thuc_te) },
    {
      key: "trang_thai", header: t("Trạng thái"),
      render: (r) => (
        <div className="flex flex-col gap-0.5 items-start">
          <TrangThaiDong r={r} />
        </div>
      ),
    },
    {
      key: "hanh_dong", header: "", mobileHint: "actions",
      render: (r) => {
        // FIX (phan hoi 2026-09-05: "nút hủy đơn của tất cả các giao diện đều bỏ ở màn hình ngoài, chỉ
        // hiện ở màn hình UI chi tiết để tránh bấm nhầm") - loai "Da huy bo" khoi danh sach quick-action
        // o day (danh sach ngoai), chi giu lai trong ThieuLkDetailModal (nexts o do tinh RIENG, khong
        // dung chung bien nay) de tranh bam nham. Cac trang thai khac (Kho da tiep nhan/Tu choi sai TT/
        // Kho xac nhan hang da ve/Da ket thuc) VAN giu nguyen o day.
        const nexts = nextStates(r).filter((s) => s.canDo && s.trangThai !== "Da huy bo");
        if (nexts.length === 0) return null;
        return (
          <div className="flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {nexts.map((s) => (
              <Btn
                key={s.trangThai}
                size="sm"
                variant={ACTION_DANGER.has(s.trangThai) ? "danger" : "ghost"}
                className="px-2"
                title={`${s.trangThai === "Da ket thuc" ? "TN: " : ""}${actionLabel(s.trangThai)}`}
                aria-label={actionLabel(s.trangThai)}
                disabled={quickActionPending}
                onClick={() => (CAN_NHAP_LIEU.includes(s.trangThai) ? onGiaiTrinh(r, s.trangThai) : onQuickAction(r, s.trangThai))}
              >
                {ACTION_ICON[s.trangThai] ?? actionLabel(s.trangThai)}
              </Btn>
            ))}
          </div>
        );
      },
    },
  ];
  const optionalCols: Column<ThieuLkRow>[] = [
    { key: "dat_don_hang_id", header: t("Đơn hàng"), render: (r) => <span className="font-mono text-xs">{r.dat_don_hang_id}</span> },
    { key: "ten_ly_do", header: t("Lý do TN báo"), render: (r) => r.ten_ly_do ?? "—" },
  ];
  const {
    effectiveColumns, toggleableColumns, resolvedOrder, colWidths,
    settingsOpen, setSettingsOpen, dragOverKey, setDragOverKey, draggedColKey,
    toggleColumn, handleColumnDrop, handleResizeStart,
  } = useColumnConfig(cols, optionalCols, [], "dmlk-thieu-lk-list");
  const settingsButtonEl = (
    <ColumnSettingsButton
      toggleableColumns={toggleableColumns}
      resolvedOrder={resolvedOrder}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      toggleColumn={toggleColumn}
    />
  );

  if (isLoading) return <div className="text-sm text-[var(--ink-500)] py-6 text-center">{t("Đang tải...")}</div>;
  if (isError) return <div className="text-sm text-[var(--coral-500)] py-6 text-center">{t("Lỗi tải dữ liệu.")}</div>;
  if (rows.length === 0)
    return (
      <div className="py-8 text-center text-sm text-[var(--ink-400)]">
        {filterTrangThai ? t("Không có ticket nào ở mục đang chọn.") : t("Không có ticket thiếu linh kiện nào.")}
        {filterTrangThai && (
          <div className="mt-2">
            <Btn variant="ghost" size="sm" className="min-h-10 sm:min-h-[30px]" onClick={onXemTatCa}>{t("Xem tất cả ticket")}</Btn>
          </div>
        )}
      </div>
    );

  const groups = new Map<string, ThieuLkRow[]>();
  for (const r of rows) {
    const key = r.nguoi_nhan_hang || r.ddh_nguoi_tao || r.nguoi_tao;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  // FIX (phan hoi 2026-09-05: "danh sách đơn chờ linh kiện giao diện UI đang không gộp chung 1 table
  // tiêu đề" + "xây dựng lại giao diện theo mẫu giao diện đơn mua") - tinh san banner-stats cho MOI
  // nhom 1 LAN (khop dung pattern groupEntries cua DonHangGroupedList, DonCuaToiTab.tsx), dung CHUNG
  // cho ca bang desktop hop nhat lan the mobile ben duoi, tranh tinh lai 2 lan.
  const groupEntries = [...groups.entries()].map(([nguoiNhan, dongCon]) => ({
    nguoiNhan,
    dongCon,
    choXuLy: dongCon.filter((r) => r.trang_thai === "Cho kho xu ly").length,
    dangXuLy: dongCon.filter((r) => r.trang_thai === "Kho da tiep nhan" || r.trang_thai === "Kho da cap nhat").length,
    hoanTat: dongCon.filter((r) => r.trang_thai === "Kho xac nhan hang da ve" || r.trang_thai === "Da ket thuc").length,
    huyBo: dongCon.filter((r) => r.trang_thai === "Da huy bo" || r.trang_thai === "Kho tu choi sai TT").length,
  }));

  return (
    <div className="space-y-2">
      {/* FIX (phan hoi 2026-09-05: "button 'Tùy chỉnh cột' vẫn đang ở bên ngoài") - truoc day 1 hang
          rieng LUON hien (`hidden sm:flex justify-end`), gio Portal vao trong bang loc cua component
          cha (xem columnSettingsSlot/ThieuLkTab.tsx), khop dung DonHangGroupedList. */}
      {columnSettingsSlot && createPortal(settingsButtonEl, columnSettingsSlot)}
      {/* FIX (phan hoi 2026-09-05, xem comment groupEntries o tren): truoc day MOI nhom KTV la 1
          <table> doc lap kem <thead> rieng (lap lai header N lan) - gio GOP thanh 1 <table> DUY NHAT
          cho toan bo danh sach, giong het DonHangGroupedList (DonCuaToiTab.tsx): 1 <thead> chung tren
          cung, <tbody> noi tiep tung nhom (1 hang banner <td colSpan> + cac hang du lieu). */}
      <div className="hidden sm:block overflow-x-auto border-t border-[var(--line)]">
        <table className="tbl w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="tbl-head">
              {effectiveColumns.map((col, idx) => (
                <ResizableHeaderCell
                  key={col.key}
                  col={col}
                  idx={idx}
                  isPinned={idx === 0}
                  width={colWidths[col.key]}
                  storageKey="dmlk-thieu-lk-list"
                  dragOverKey={dragOverKey}
                  setDragOverKey={setDragOverKey}
                  draggedColKey={draggedColKey}
                  handleColumnDrop={handleColumnDrop}
                  handleResizeStart={handleResizeStart}
                  sortable={false}
                  isActive={false}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {groupEntries.map((g) => (
              <Fragment key={g.nguoiNhan}>
                <tr className="bg-[var(--color-surface-soft)] border-t border-[var(--color-border)]">
                  <td colSpan={effectiveColumns.length} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="font-bold text-[var(--ink-900)] text-sm truncate">
                        <NguoiNhan>{formatNguoiDisplay(g.nguoiNhan, ktvDisplayMap)}</NguoiNhan>
                      </span>
                      {/* Rut gon banner nhom (Phase 4 StageMenu, them 2026-09-11) - gop 4 badge rieng
                          (chờ xử lý/đang xử lý/hoàn tất/huỷ) thanh 1 dong toi thieu "tên + so luong",
                          khop dung tinh than da ap dung o DonHangGroupedList (DonCuaToiTab.tsx). */}
                      {g.choXuLy + g.dangXuLy > 0 ? (
                        <Badge tone="warning">{t("Chờ {a}/{b} đơn", { a: g.choXuLy + g.dangXuLy, b: g.dongCon.length })}</Badge>
                      ) : (
                        <Badge tone="success">{t("Đã xong {a} đơn", { a: g.dongCon.length })}</Badge>
                      )}
                    </div>
                  </td>
                </tr>
                {g.dongCon.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => onDetail(r.id)}
                    className={`cursor-pointer transition-colors border-b border-[var(--line)] last:border-0 ${
                      r.uu_tien === 1 ? "shadow-[inset_3px_0_0_var(--color-warning)] [&>td:first-child]:shadow-[inset_3px_0_0_var(--color-warning)] hover:bg-[var(--color-surface-soft)]" : "hover:bg-[var(--color-surface-soft)]"
                    } ${nenKhieuNai(r.ddh_khieu_nai)}`}
                  >
                    {effectiveColumns.map((col) => {
                      const width = colWidths[col.key];
                      return (
                        <td key={col.key} style={width ? { width, maxWidth: width, overflow: "hidden" } : undefined} className={`px-3 py-1.5 ${col.className ?? ""}`}>
                          {col.render(r)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {/* The mobile (<640px) - THIET KE LAI 2026-09-29 (ra soat giao dien mobile): moi the tra loi ngay 3 cau Kho/TN
          can: LK nao (dong 1), dang o buoc nao (badge trang thai DAU dong 2), bao gio co hang (dong 3 - ngay du
          kien/ngay hang ve, truoc day the khong hien ngay nao, chi "TN báo <email>" chiem 2 dong). Nut hanh dong
          co CHU (icon tron truoc day khong co tooltip tren man cham), cao 40px, nguy hiem ben trai - chinh ben phai. */}
      <div className="sm:hidden space-y-3">
        {groupEntries.map((g) => (
          <div key={g.nguoiNhan} className="overflow-hidden rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface)]">
            <div className="flex items-center justify-between gap-2 bg-[var(--color-surface-soft)] border-t border-[var(--color-border)] px-3 py-2">
              <span className="truncate text-[13px] font-bold text-[var(--ink-900)]"><NguoiNhan>{formatNguoiDisplay(g.nguoiNhan, ktvDisplayMap)}</NguoiNhan></span>
              {g.choXuLy + g.dangXuLy > 0 ? (
                <Badge tone="warning">{t("Chờ {a}/{b}", { a: g.choXuLy + g.dangXuLy, b: g.dongCon.length })}</Badge>
              ) : (
                <Badge tone="success">{t("Xong {a}", { a: g.dongCon.length })}</Badge>
              )}
            </div>
            <div className="divide-y divide-[var(--color-border-soft)]">
              {g.dongCon.map((r) => {
                // "Da huy bo" chi co trong Drawer chi tiet (phan hoi 2026-09-05: tranh bam nham o danh sach ngoai).
                const nexts = nextStates(r)
                  .filter((s) => s.canDo && s.trangThai !== "Da huy bo")
                  .sort((a, b) => thuTuNut(a.trangThai) - thuTuNut(b.trangThai));
                const coChon = rowsCoTheChon.some((x) => x.id === r.id);
                const dangMo = !["Da ket thuc", "Da huy bo", "Kho tu choi sai TT", "Kho xac nhan hang da ve"].includes(r.trang_thai);
                return (
                  <div
                    key={r.id}
                    onClick={() => onDetail(r.id)}
                    className={`flex cursor-pointer gap-2 px-3 py-3 ${r.uu_tien === 1 ? "shadow-[inset_3px_0_0_var(--color-warning)] [&>td:first-child]:shadow-[inset_3px_0_0_var(--color-warning)]" : "active:bg-[var(--color-surface-hover)]"} ${nenKhieuNai(r.ddh_khieu_nai)}`}
                  >
                    {coChon && (
                      // Vung cham 32x40 quanh checkbox - bam lech khong mo nham Drawer.
                      <label onClick={(e) => e.stopPropagation()} className="-my-1 -ml-1 flex h-10 w-8 shrink-0 cursor-pointer items-start justify-center pt-0.5">
                        <input type="checkbox" className="h-[18px] w-[18px]" checked={selected.has(r.id)} onChange={() => toggleSelectOne(r.id)} />
                      </label>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[var(--color-text)]">
                        {r.uu_tien === 1 && <PriorityTag />}{" "}
                        {r.ma_lk ? formatLkLabel(r.ma_lk, r.ten_lk_snapshot ?? r.ma_lk) : (r.ten_lk_snapshot ?? r.id)}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
                        <TrangThaiDong r={r} />
                        {r.nguon_tiep_nhan && r.nguon_tiep_nhan !== "app_lk" && <NguonTiepNhanBadge r={r} />}
                        {r.loai_ticket === "bh" ? (
                          <span className="shrink-0 truncate text-xs text-[var(--color-text-secondary)]">{t("Đơn BH")} {r.dat_don_hang_id}</span>
                        ) : (
                          <LoaiDeXuatBadge loaiDon={r.loai_don} loaiDeXuat={r.loai_de_xuat} />
                        )}
                        <MaLkXacNhanBadge tt={r.lk_trang_thai_ma} chiKhiCho />
                        <YeuCauHuyChip boPhan={r.ddh_yeu_cau_huy} />
                        <KhoDuHangBadge du={r.kho_du_hang} />
                        <KhoMotPhanBadge co={r.kho_mot_phan} sl={r.so_luong_de_xuat} />
                        {r.so_luong_de_xuat != null && <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">{t("SL {a}", { a: r.so_luong_de_xuat })}</span>}
                      </div>
                      <div className="mt-1 truncate text-xs text-[var(--color-text-secondary)]">
                        {r.ngay_hang_ve_thuc_te ? (
                          <span className="font-semibold text-[var(--color-success-strong)]">{t("Hàng về {a}", { a: ngayNgan(r.ngay_hang_ve_thuc_te) })}</span>
                        ) : r.ngay_du_kien_co_hang ? (
                          <span className="font-semibold text-[var(--color-text-body)]">{t("Dự kiến có hàng {a}", { a: ngayNgan(r.ngay_du_kien_co_hang) })}</span>
                        ) : dangMo ? (
                          <span>{t("Chưa có ngày dự kiến")}</span>
                        ) : null}
                        {(r.ngay_hang_ve_thuc_te || r.ngay_du_kien_co_hang || dangMo) && " · "}
                        {t("Báo {a}", { a: ngayNgan(r.ngay_tao) })}
                      </div>
                      {nexts.length > 0 && (
                        // Chi chan bubble khi bam TRUNG nut (phan hoi 2026-08-28: bam khoang trong van mo chi tiet).
                        <div
                          className="mt-2.5 flex gap-2"
                          onClick={(e) => {
                            if (e.target !== e.currentTarget) e.stopPropagation();
                          }}
                        >
                          {nexts.map((s) => (
                            <Btn
                              key={s.trangThai}
                              variant={HANH_DONG_NGUY_HIEM.has(s.trangThai) ? "danger" : HANH_DONG_CHINH.has(s.trangThai) ? "subtle" : "ghost"}
                              className="min-h-10 flex-1"
                              title={s.trangThai === "Da co hang" ? actionLabel(s.trangThai) : trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, s.trangThai)}
                              disabled={quickActionPending}
                              onClick={() => (CAN_NHAP_LIEU.includes(s.trangThai) ? onGiaiTrinh(r, s.trangThai) : onQuickAction(r, s.trangThai))}
                            >
                              {actionLabel(s.trangThai)}
                              {CAN_NHAP_LIEU.includes(s.trangThai) ? "…" : ""}
                            </Btn>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-1 py-2 text-xs text-[var(--ink-400)]">
        <span>{t("{a} ticket", { a: total })}</span>
        <div className="flex items-center gap-1">
          <Btn variant="ghost" size="sm" className="min-h-10 min-w-10 sm:min-h-[30px] sm:min-w-0" aria-label={t("Trang trước")} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</Btn>
          <span className="px-2">{page}/{Math.max(1, Math.ceil(total / pageSize))}</span>
          <Btn variant="ghost" size="sm" className="min-h-10 min-w-10 sm:min-h-[30px] sm:min-w-0" aria-label="Trang sau" disabled={page * pageSize >= total} onClick={() => onPageChange(page + 1)}>›</Btn>
        </div>
      </div>
    </div>
  );
}

// Them 2026-08-21 ("hợp nhất phong cách giao diện" - dong bo voi PXK/Mua hang) - man chi tiet + lich
// su xu ly 1 ticket thieu LK, dung API MOI GET /dat-mua-lk/thieu-lk/:id (chua tung co truoc do, ticket
// nay truoc chi xem duoc qua dong bang, khong co lich su ai xu ly buoc nao/luc nao).
//
// SUA (phan hoi 2026-08-21: "nút chức năng không hiện trong drawer") - truoc day Drawer nay CHI de
// xem (dung y CHOT #19: tranh 2 noi cung sua trang thai). Doi lai theo dung pattern TraHangDetailModal
// (da co san nut hanh dong LAN nut o dong bang, khong lech - ca 2 cung goi CHUNG 1 mutation/API, CUNG
// 1 react-query queryKey duoc invalidate nen khong co rui ro lech UI/CAS nhu lo ngai ban dau).
export function ThieuLkDetailModal({
  id, onClose, addToast, qc, canKho, canTacNghiep, currentEmail, navRows, onNavigate, initialAction, initialRow,
}: {
  id: string;
  onClose: () => void;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canKho: boolean;
  canTacNghiep: boolean;
  currentEmail: string;
  navRows?: ThieuLkRow[];
  onNavigate?: (id: string) => void;
  // Mo tu nut "Tiếp nhận…"/"Cập nhật…" o danh sach (2026-09-29): form nhap lieu mo san; xu ly xong thi DONG Drawer
  // quay ve danh sach (nguoi dung dang thao tac nhanh tung dong) thay vi tu nhay sang ticket ke.
  initialAction?: string;
  // Dong san co o danh sach - hien ngay khi mo, khong cho GET chi tiet (lich su van tai rieng).
  initialRow?: ThieuLkRow;
}) {
  const [actionTrangThai, setActionTrangThai] = useState<string | null>(initialAction ?? null);
  const [ghiChu, setGhiChu] = useState("");
  const [ngayDuKien, setNgayDuKien] = useState(initialAction === "Kho da cap nhat" ? initialRow?.ngay_du_kien_co_hang ?? "" : "");
  const [maEo, setMaEo] = useState("");
  const [maLkMoi, setMaLkMoi] = useState("");
  const [showDonGoc, setShowDonGoc] = useState(false);
  const [moDayLai, setMoDayLai] = useState(false);
  const [moTachDon, setMoTachDon] = useState(false);
  const [ghiChuDayLai, setGhiChuDayLai] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["thieu-lk-detail", id],
    queryFn: () =>
      api.get<{
        thieuLk: ThieuLkRow;
        logs: Array<{ id: number; trang_thai: string; nguoi_xu_ly: string; ngay_xu_ly: string; ghi_chu: string | null }>;
      }>(`/dat-mua-lk/thieu-lk/${id}`),
  });
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #20): chip goi y ly do cho buoc giai trinh bat buoc - KHONG bulk
  // hoa buoc nay (moi ticket co ly do thuc te khac nhau), chip chi giup dien nhanh ly do hay gap.
  const { data: giaiTrinhGoiYData } = useQuery({
    queryKey: ["dat-mua-lk-ly-do-cham"],
    queryFn: () => api.get<{ rows: LyDoChamRow[] }>("/dat-mua-lk/ly-do-cham?he_thong=" + encodeURIComponent("Mua hàng")),
    enabled: (canKho || canTacNghiep) && actionTrangThai === "Kho da tiep nhan",
  });

  const logMutation = useMutation({
    mutationFn: (args: { trangThai: string; ghiChu?: string; ngayDuKien?: string; maEo?: string; maLkTuongDuong?: string }) =>
      api.post(`/dat-mua-lk/thieu-lk/${id}/log`, {
        trang_thai: args.trangThai,
        ghi_chu: args.ghiChu?.trim() || undefined,
        ngay_du_kien_co_hang: args.ngayDuKien || undefined,
        ma_eo: args.maEo?.trim() || undefined,
        ma_lk_tuong_duong: args.maLkTuongDuong || undefined,
      }),
    onSuccess: (_res, args) => {
      setActionTrangThai(null);
      setGhiChu("");
      setNgayDuKien("");
      setMaEo("");
      setMaLkMoi("");
      qc.invalidateQueries({ queryKey: ["thieu-lk-danh-gia"] });
      qc.invalidateQueries({ queryKey: ["thieu-lk-detail", id] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      // Don goc doi trang thai theo ticket (Cho hang -> Cho TN duyet, TN duyet ticket -> duyet don) - 2026-09-29.
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-huy-don"] });
      invalidatePipelineCounts(qc);
      // 2026-10-02 (phan hoi Kho "xác nhận hàng đã về... tự động next phiếu tiếp theo làm nhân viên kho dễ nhầm lẫn là
      // chưa bấm thành công"): BO "Duyet va tiep theo" - xu ly xong GIU NGUYEN ticket vua thao tac (chi tiet tai lai,
      // thay trang thai moi), muon sang ticket khac thi tu bam ‹ ›. Mo tu nut thao tac nhanh o danh sach (initialAction)
      // van dong ve danh sach nhu cu.
      addToast(t("Đã cập nhật {a} → {b}", { a: id, b: args.trangThai === "Da co hang" ? actionLabel(args.trangThai) : trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, args.trangThai) }));
      if (initialAction) onClose();
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  const ktvDisplayMap = useKtvDisplayMap();
  const tenLog = useTenNguoiLog();
  const tk = data?.thieuLk ?? initialRow;
  // "↩ Đẩy lại đơn gốc" ngay tren ticket (2026-10-16, phan hoi "thêm nút đẩy lại ở ticket" - vd TLK-000317: Kho tu choi nham -> don goc
  // DDH-002653 tu huy). Han do server tinh (ddh_day_lai_han = dayLaiHanSql cua don goc) - CUNG dieu kien/API voi nut o danh sach don.
  // "↩ Đẩy lại ticket" (2026-10-16, "đẩy ticket lại trạng thái trước khi bị từ chối => đơn gốc cũng đẩy ngược lại theo ticket"): UU TIEN
  // phuc hoi THEO TICKET (ticket ve trang thai mo truoc do, don goc ve Cho hang, lay lai tien da hoan - lib/dayLaiThieuLk.ts, TN/Ke toan/
  // Kho/Admin); khong phuc hoi duoc theo ticket ma don goc van day lai duoc -> nut cu dua don ve "Chờ TN duyệt".
  const tkDonGoc = tk as (ThieuLkRow & {
    ddh_trang_thai?: string | null; ddh_day_lai_han?: string | null; day_lai_ticket_han?: string | null; day_lai_ticket_ve?: string | null;
  }) | undefined;
  const authDayLai = useAuth();
  const laAdminDayLai = authDayLai.status === "authenticated" && authDayLai.user.vai_tro === "Admin";
  const dayLaiTicket = !!tkDonGoc?.day_lai_ticket_ve && dayLaiDuoc({ day_lai_han: tkDonGoc.day_lai_ticket_han ?? null } as DonHangRow, canTacNghiep || canKho, laAdminDayLai);
  const dayLaiDonGoc = !dayLaiTicket && !!tkDonGoc?.dat_don_hang_id && dayLaiDuoc({ day_lai_han: tkDonGoc.ddh_day_lai_han ?? null } as DonHangRow, canTacNghiep, laAdminDayLai);
  const nhanTicketVe = tkDonGoc?.day_lai_ticket_ve ? trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, tkDonGoc.day_lai_ticket_ve) : "";
  const dayLaiMutation = useMutation({
    mutationFn: () =>
      dayLaiTicket
        ? api.post(`/dat-mua-lk/thieu-lk/${id}/day-lai`, { ghi_chu: ghiChuDayLai.trim() || undefined })
        : api.post(`/dat-mua-lk/don-hang/${tkDonGoc?.dat_don_hang_id}/day-lai`, { ghi_chu: ghiChuDayLai.trim() || undefined }),
    onSuccess: () => {
      setMoDayLai(false);
      setGhiChuDayLai("");
      qc.invalidateQueries({ queryKey: ["thieu-lk-detail", id] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail"] });
      invalidatePipelineCounts(qc);
      addToast(
        dayLaiTicket
          ? t("Đã đẩy lại ticket {a} về \"{b}\" — đơn {c} về Chờ hàng", { a: id, b: nhanTicketVe, c: tkDonGoc?.dat_don_hang_id ?? "" })
          : t("Đã đẩy lại đơn {a} về Chờ TN duyệt", { a: tkDonGoc?.dat_don_hang_id ?? "" }),
      );
    },
    onError: (err) => addToast(t("Không đẩy lại được đơn: ") + describeApiError(err)),
  });
  // Xac nhan MA LK cua don goc ngay tren ticket (2026-10-16): Kho (vai tro hien co) + Mua hang + Admin. Danh muc LK day du dung chung cache
  // voi Bang gia ("settings-linh-kien"); chi tai khi ma cua ticket dang cho xet duyet.
  const authState = useAuth();
  const authUser = authState.status === "authenticated" ? authState.user : null;
  const laMuaHangHoacAdmin = !!authUser?.la_mua_hang || authUser?.vai_tro === "Admin";
  const canXetDuyetMa = canKho || laMuaHangHoacAdmin;
  const canMaChoDuyet = tk?.lk_trang_thai_ma === "Cho xet duyet" && !!tk?.ma_lk;
  const { data: partsData } = useQuery({
    queryKey: ["settings-linh-kien"],
    queryFn: () => fetchWithHashCache<{ rows: LinhKienRow[] }>("settings-linh-kien", "/settings/linh-kien/version", "/settings/linh-kien"),
    enabled: canMaChoDuyet,
  });
  const partLk = partsData?.rows.find((p) => p.ma_linh_kien === tk?.ma_lk);
  // Ma vua duoc xac nhan / gop / tu choi (danh muc doi) -> tai lai ticket + danh sach de cot "Mã LK" cap nhat.
  const ttMaTruoc = useRef(partLk?.trang_thai_ma);
  useEffect(() => {
    if (ttMaTruoc.current && partLk?.trang_thai_ma && partLk.trang_thai_ma !== ttMaTruoc.current) {
      qc.invalidateQueries({ queryKey: ["thieu-lk-detail", id] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk-status-counts"] });
    }
    ttMaTruoc.current = partLk?.trang_thai_ma;
  }, [partLk?.trang_thai_ma, id, qc]);
  const nexts = tk
    ? nextStatesForThieuLk(tk, { canKho, canTacNghiep, currentEmail, canMuaHang: laMuaHangHoacAdmin })
        .filter((s) => s.canDo)
        .sort((a, b) => thuTuNut(a.trangThai) - thuTuNut(b.trangThai))
    : [];
  // "Đổi LK tương đương" (2026-10-20, "cho phép kho có quyền sửa lại linh kiện chờ hàng sang linh kiện tương đương rồi xác nhận đã có
  // hàng"): chi trong Drawer (khong them nut o danh sach - da chat), khi nguoi xem bam duoc "Đã có hàng" / "Hàng đã về".
  const buocCoHang = nexts.find((s) => s.trangThai === "Da co hang" || s.trangThai === "Kho xac nhan hang da ve")?.trangThai;
  if (buocCoHang && tk?.ma_lk) nexts.splice(nexts.length - 1, 0, { trangThai: DOI_MA_TUONG_DUONG, canDo: true });

  const navIndex = navRows?.findIndex((r) => r.id === id) ?? -1;
  const navPrevId = navRows && navIndex > 0 ? navRows[navIndex - 1]?.id : undefined;
  const navNextId = navRows && navIndex >= 0 && navIndex < navRows.length - 1 ? navRows[navIndex + 1]?.id : undefined;
  useDrawerArrowNav({
    hasPrev: !!(onNavigate && navRows && navPrevId),
    hasNext: !!(onNavigate && navRows && navNextId),
    onPrev: () => navPrevId && onNavigate?.(navPrevId),
    onNext: () => navNextId && onNavigate?.(navNextId),
  });

  function batDauHanhDong(trangThai: string) {
    if (CAN_NHAP_LIEU.includes(trangThai)) {
      setActionTrangThai(trangThai);
      setGhiChu("");
      setNgayDuKien(trangThai === "Kho da cap nhat" ? tk?.ngay_du_kien_co_hang ?? "" : "");
    } else if (xacNhanDaCoHang(trangThai)) logMutation.mutate({ trangThai });
  }

  // Chan Drawer (thiet ke lai 2026-09-29): truoc day moi nut deu ghost 30px cung 1 hang, nhan dai ("Kho đã tiếp
  // nhận…", "Kho từ chối (sai TT)") - khong phan biet buoc chinh/nguy hiem, 3 nut tran hang tren mobile. Gio:
  // nhan dong tu ngan, cao 40px (mobile), nguy hiem (vien do) trai -> phu -> 1 nut primary (buoc di tiep) phai.
  const footer = tk ? (
    actionTrangThai ? (
      <ThieuLkActionForm
        trangThai={actionTrangThai}
        ngayDuKien={ngayDuKien}
        setNgayDuKien={setNgayDuKien}
        ghiChu={ghiChu}
        setGhiChu={setGhiChu}
        maEo={maEo}
        setMaEo={setMaEo}
        maLkHienTai={tk.ma_lk}
        maLkMoi={maLkMoi}
        setMaLkMoi={setMaLkMoi}
        goiY={giaiTrinhGoiYData?.rows ?? []}
        pending={logMutation.isPending}
        onCancel={() => {
          setActionTrangThai(null);
          setGhiChu("");
          setNgayDuKien("");
          setMaLkMoi("");
        }}
        onSubmit={() =>
          logMutation.mutate({
            trangThai: actionTrangThai === DOI_MA_TUONG_DUONG ? buocCoHang ?? "Kho xac nhan hang da ve" : actionTrangThai,
            maLkTuongDuong: actionTrangThai === DOI_MA_TUONG_DUONG ? maLkMoi : undefined,
            ghiChu,
            ngayDuKien: CO_NGAY_DU_KIEN.includes(actionTrangThai) ? ngayDuKien : undefined,
            maEo: actionTrangThai === "Mua hang da dat" ? maEo : undefined,
          })
        }
      />
    ) : moDayLai ? (
      <div className="space-y-2.5">
        <div className="text-[13px] font-bold text-[var(--color-text)]">
          {dayLaiTicket
            ? t("Đẩy lại ticket về \"{a}\"", { a: nhanTicketVe })
            : t("Đẩy lại đơn gốc {a} về Chờ TN duyệt", { a: tk.dat_don_hang_id })}
        </div>
        <div className="text-[11px] text-[var(--color-text-secondary)]">
          {dayLaiTicket
            ? t("Ticket quay lại trạng thái trước khi bị từ chối / hủy để Kho xử lý tiếp; đơn gốc {a} về lại Chờ hàng. Tiền đã hoàn về quỹ lúc hủy được lấy lại gắn vào đơn (trong phạm vi số dư quỹ hiện có).", { a: tk.dat_don_hang_id })
            : t("Đơn quay lại hàng chờ duyệt của Tác nghiệp để xử lý lại (duyệt / từ chối / chờ hàng). Ticket thiếu hàng đã đóng không mở lại; đơn cần chuyển tiền trước sẽ được gom lại vào phiếu đang tạo của người nhận.")}
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Ghi chú (tuỳ chọn)")}</span>
          <textarea
            rows={2}
            value={ghiChuDayLai}
            onChange={(e) => setGhiChuDayLai(e.target.value)}
            placeholder={t("VD: Kho từ chối nhầm")}
            className="focus-ring w-full resize-none rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-base sm:text-sm"
          />
        </label>
        <div className="flex gap-2 sm:justify-end">
          <Btn variant="ghost" className="min-h-10 flex-1 sm:min-h-9 sm:flex-none" onClick={() => setMoDayLai(false)}>{t("Quay lại")}</Btn>
          <Btn className="min-h-10 flex-1 sm:min-h-9 sm:flex-none" onClick={() => dayLaiMutation.mutate()} loading={dayLaiMutation.isPending}>
            {t("Xác nhận")}
          </Btn>
        </div>
      </div>
    ) : nexts.length > 0 || dayLaiTicket || dayLaiDonGoc ? (
      // flex-wrap: nhieu nut (Kho/TN co toi 6 nut) khong tran ra ngoai Drawer ben trai.
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {(dayLaiTicket || dayLaiDonGoc) && (
          <Btn
            variant={nexts.length > 0 ? "ghost" : "primary"}
            className="min-h-10 min-w-0 flex-1 px-2 sm:min-h-9 sm:flex-none sm:px-3.5"
            title={
              dayLaiTicket
                ? t("Ticket về \"{a}\", đơn gốc {b} về Chờ hàng (trong 24h)", { a: nhanTicketVe, b: tk.dat_don_hang_id })
                : t("Đơn gốc {a} bị hủy / từ chối — đẩy lại về Chờ TN duyệt (trong 24h)", { a: tk.dat_don_hang_id })
            }
            onClick={() => setMoDayLai(true)}
          >
            <span className="truncate">{dayLaiTicket ? t("↩ Đẩy lại ticket") : t("↩ Đẩy lại đơn gốc")}</span>
          </Btn>
        )}
        {nexts.map((s) => (
          <Btn
            key={s.trangThai}
            variant={HANH_DONG_NGUY_HIEM.has(s.trangThai) ? "danger" : HANH_DONG_CHINH.has(s.trangThai) ? "primary" : "ghost"}
            className="min-h-10 min-w-0 flex-1 px-2 sm:min-h-9 sm:flex-none sm:px-3.5"
            title={trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, s.trangThai)}
            disabled={logMutation.isPending}
            onClick={() => batDauHanhDong(s.trangThai)}
          >
            <span className="truncate">
              {actionLabel(s.trangThai)}
              {CAN_NHAP_LIEU.includes(s.trangThai) ? "…" : ""}
            </span>
          </Btn>
        ))}
      </div>
    ) : null
  ) : null;

  const nguoiNhanHang = tk?.nguoi_nhan_hang || tk?.ddh_nguoi_tao;

  return (
    <Drawer
      open
      // Chi ma ticket (ma da co tien to "TLK") - "Ticket thiếu LK <ma>" bi cat "…" tren mobile, mat dung phan ma.
      title={id}
      onClose={onClose}
      // Rong hon mac dinh 492px: khoi Xet duyet ma + hang nut thao tac (toi 6 nut) can cho.
      width="max-w-[760px]"
      footer={footer}
      headerExtra={
        onNavigate && navRows ? (
          <DrawerNavButtons
            hasPrev={!!navPrevId}
            hasNext={!!navNextId}
            onPrev={() => navPrevId && onNavigate(navPrevId)}
            onNext={() => navNextId && onNavigate(navNextId)}
          />
        ) : undefined
      }
    >
      {!tk ? (
        <div className="py-4 text-center text-sm text-[var(--ink-500)]">{isLoading ? t("Đang tải...") : t("Không tìm thấy ticket.")}</div>
      ) : (
        <div className="text-sm">
          <ViPhamBanner ids={[id]} />
          {/* Khoi tom tat dau Drawer (2026-09-29): LK + trang thai + loai + SL doc duoc ngay, khong phai do tung dong
              "nhan: gia tri" nhu truoc (Ma LK nam dong thu 4, trang thai dong thu 3). */}
          <div className="mb-4 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-subtle)] p-3">
            {tk.uu_tien === 1 && <div className="mb-1"><PriorityTag /></div>}
            <div className="text-[15px] font-bold leading-snug text-[var(--color-text)]">{tk.ten_lk_snapshot ?? tk.ma_lk ?? tk.id}</div>
            {tk.ma_lk && <div className="mt-0.5 font-mono text-xs text-[var(--color-text-secondary)]">{tk.ma_lk}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge value={tk.trang_thai} tones={THIEU_LK_TRANG_THAI_TONE} options={THIEU_LK_TRANG_THAI_OPTIONS} />
              {(tk.loai_don || tk.loai_de_xuat) && <LoaiDeXuatBadge loaiDon={tk.loai_don} loaiDeXuat={tk.loai_de_xuat} />}
              <MaLkXacNhanBadge tt={tk.lk_trang_thai_ma} />
              {tk.lk_nhom_lk && <NhomLkBadge value={tk.lk_nhom_lk} />}
              <KhoDuHangBadge du={tk.kho_du_hang} />
              <KhoMotPhanBadge co={tk.kho_mot_phan} sl={tk.so_luong_de_xuat} />
              <YeuCauHuyChip boPhan={tk.ddh_yeu_cau_huy} />
              {tk.so_luong_de_xuat != null && <span className="text-xs font-semibold text-[var(--color-text-body)]">{t("SL {a}", { a: tk.so_luong_de_xuat })}</span>}
            </div>
          </div>

          {/* Yeu cau huy don goc dang cho bo phan dong y (v1.479): Kho / Mua hang dong y ngay tren ticket = huy ca ticket lan don goc
              (cung API voi khoi o chi tiet don goc - POST /dat-mua-lk/yeu-cau-huy/:id/xu-ly). */}
          {tk.ddh_yeu_cau_huy && tk.dat_don_hang_id && (
            <div className="mb-4">
              <HuyDonKhoi
                donId={tk.dat_don_hang_id}
                coNutHuyCu
                dongDon={false}
                currentEmail={currentEmail}
                addToast={addToast}
                onDone={() => {
                  qc.invalidateQueries({ queryKey: ["thieu-lk-detail", id] });
                  qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
                  qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail"] });
                }}
              />
            </div>
          )}

          {/* Hang ve MOT PHAN -> tach don (v1.434): Kho / Ke toan / TN tach phan da ve sang don moi (duyet vao phieu), don goc con lai tiep tuc cho. */}
          {(canKho || canTacNghiep) && tkDonGoc?.ddh_trang_thai === "Cho hang" && (tk.so_luong_de_xuat ?? 0) >= 2 &&
            !["Da huy bo", "Da ket thuc"].includes(tk.trang_thai) && (
            <div className={`mb-4 rounded-xl border p-3 text-xs ${tk.kho_mot_phan ? "border-[var(--color-warning)] bg-[var(--color-warning-soft)]" : "border-[var(--color-border)]"}`}>
              {tk.kho_mot_phan ? (
                <div className="mb-2 text-[var(--color-warning-strong)]">
                  {t("Kho công ty hiện có {a}/{b} chiếc cho đơn này. Đơn đang được ưu tiên nên hệ thống DỪNG tự duyệt hàng về cho mã này (kể cả đơn xếp sau) — chọn phương án: tách phần đã có để giao trước, hoặc giữ chờ đủ hàng.", { a: tk.kho_mot_phan, b: tk.so_luong_de_xuat ?? "?" })}
                </div>
              ) : (
                <div className="mb-2 text-[var(--color-text-secondary)]">{t("Hàng về ít hơn số lượng đặt? Tách phần đã về sang đơn mới (duyệt vào phiếu, chuyển Kế toán), phần còn thiếu tiếp tục chờ Kho.")}</div>
              )}
              <Btn size="sm" variant="subtle" onClick={() => setMoTachDon(true)}>{t("✂ Hàng về một phần — tách đơn")}</Btn>
            </div>
          )}
          {moTachDon && tk?.dat_don_hang_id && (
            <TachDonModal
              donId={tk.dat_don_hang_id}
              soLuong={tk.so_luong_de_xuat ?? 0}
              goiY={tk.kho_mot_phan}
              onClose={() => setMoTachDon(false)}
              onDone={(msg) => {
                setMoTachDon(false);
                addToast(msg);
                qc.invalidateQueries({ queryKey: ["thieu-lk-detail", id] });
              }}
            />
          )}

          {/* Khung danh gia (2026-10-19): ticket con o buoc Kho/Mua hang quyet dinh - tiep nhan cho hang ve hay chuyen Mua hang. */}
          {["Cho kho xu ly", "Kho da tiep nhan", "Kho da cap nhat", "Cho mua hang"].includes(tk.trang_thai) && (canKho || canTacNghiep || laMuaHangHoacAdmin) && (
            <DanhGiaThieuLk id={id} />
          )}

          {canMaChoDuyet && (
            <div className="mb-4 rounded-xl border border-[var(--color-warning)]/40 p-3">
              {partLk ? (
                <XetDuyetMaSection
                  part={partLk}
                  parts={partsData?.rows ?? []}
                  canXetDuyet={canXetDuyetMa}
                  choPhepGiaTam={laMuaHangHoacAdmin}
                  onDoiMa={() => {
                    qc.invalidateQueries({ queryKey: ["thieu-lk-detail", id] });
                    qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
                  }}
                />
              ) : (
                <div className="text-xs text-[var(--ink-500)]">{t("Mã linh kiện đang chờ xác nhận — đang tải…")}</div>
              )}
            </div>
          )}
          <SectionTitle>{t("Thông tin ticket")}</SectionTitle>
          {nguoiNhanHang && <KvRow label={t("KTV nhận hàng")}><NguoiNhan>{formatNguoiDisplay(nguoiNhanHang, ktvDisplayMap)}</NguoiNhan></KvRow>}
          <KvRow label={t("Dự kiến có hàng")}>
            {tk.ngay_du_kien_co_hang ? <span className="font-semibold">{fmtDate(tk.ngay_du_kien_co_hang)}</span> : "—"}
          </KvRow>
          <KvRow label={t("Hàng về thực tế")}>
            {tk.ngay_hang_ve_thuc_te ? <span className="font-semibold text-[var(--color-success-strong)]">{fmtDate(tk.ngay_hang_ve_thuc_te)}</span> : "—"}
          </KvRow>
          <KvRow label={t("Đơn hàng||1 đơn")}>
            <button type="button" onClick={() => setShowDonGoc(true)} className="code-link -my-1 inline-flex min-h-8 items-center">
              {tk.dat_don_hang_id} ↗
            </button>
          </KvRow>
          <KvRow label={t("TN báo")}>{formatNguoiDisplay(tk.nguoi_tao, ktvDisplayMap)}</KvRow>
          <KvRow label={t("Ngày báo")}>{fmtDateTime(tk.ngay_tao)}</KvRow>
          {tk.ten_ly_do && <KvRow label={t("Lý do TN báo")}>{tk.ten_ly_do}</KvRow>}

          <SectionTitle>{t("Lịch sử xử lý")}</SectionTitle>
          {!data ? (
            <div className="text-xs text-[var(--ink-400)]">{t("Đang tải lịch sử...")}</div>
          ) : (
            <Timeline
              items={timelineLogGop(data.logs, (l, i, phu) => ({
                // Nguoi thao tac -> hanh dong -> trang thai (LogTieuDe, 2026-09-30) - dong cuoi = luc bao thieu hang.
                title: (
                  <LogTieuDe
                    nguoi={phu ? "↳" : tenLog(l.nguoi_xu_ly)}
                    hanhDong={i === data.logs.length - 1 ? t("báo thiếu hàng →") : t("chuyển ticket sang")}
                    trangThai={trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, l.trang_thai)}
                    ghiChu={l.ghi_chu}
                  />
                ),
              }))}
            />
          )}
        </div>
      )}
      {showDonGoc && tk && (
        <DonHangDetailModal
          id={tk.dat_don_hang_id}
          onClose={() => setShowDonGoc(false)}
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          canTPDvbhXacNhan={false}
          canActAsTram={false}
          currentEmail={currentEmail}
          isAdmin={false}
          canXemChiTietCa={false}
          canKho={canKho}
        />
      )}
    </Drawer>
  );
}
