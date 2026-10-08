import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Btn } from "../components/ui/Btn";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Money } from "../components/ui/Money";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { Select } from "../components/ui/Select";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../components/ui/Toast";
import { StatCard } from "../components/x/StatCard";
import { Icon } from "../components/ui/Icon";
import { fmtDateTime, fmtVND } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { formatPersonDisplay, usePersonDirectory } from "../lib/personDisplay";
import { khopTim } from "../lib/boDau";
import { describeApiError } from "./datMuaLinhKien/helpers";
import { BangChungAnhList, docAnhBangChung } from "./datMuaLinhKien/BangChungChuyenTien";
import { TienDocTuAnh, docDsAnh, docTienDocMap, useDocTienAnh } from "./datMuaLinhKien/DocTienAnh";
import { XemAnhNhanh, maHdCua, type AnhXem } from "./datMuaLinhKien/XemAnhNhanh";
import { t, dichSau } from "../i18n";

// "Quỹ & chuyển tiền" (2026-09-29, ban 2 quy du KTV - backend routes/quyKtv.ts, lib/quyKtv.ts, migration 0047):
//  - Khoản chuyển tiền: moi lan Ke toan duyet (so can / thuc nhan, du vao quy / thieu) hoac tu choi, kem anh bang chung.
//  - Số dư quỹ: quy du + con phai chuyen cua tung nguoi nhan hang; Ke toan/Admin "Điều chỉnh" / "Hoàn tiền cho KTV".
//  - Sổ quỹ: moi bien dong quy (chi ghi them).
// Pham vi: Admin/Ke toan/TN xem tat ca; KTV (Ve tinh = quy cua Tram) chi thay cua minh (backend loc).

interface TongQuanRow {
  email: string;
  so_du: number;
  cap_nhat_luc: string | null;
  tong_thuc_nhan: number;
  so_khoan_duyet: number;
  so_lan_tu_choi: number;
  lan_cuoi: string | null;
  con_phai_chuyen: number;
  so_phieu_cho: number;
}
interface KhoanRow {
  id: number;
  phieu_xuat_kho_id: string;
  ma_xuat_kho: string | null;
  email_nguoi_chuyen: string;
  trang_thai: "Da duyet" | "Tu choi" | "Da huy";
  tong_phieu: number | null;
  so_tien_can_chuyen: number | null;
  so_tien_thuc_nhan: number | null;
  anh: string | null;
  // So tien tu doc tren anh luc duyet + anh da ghi nhan o khoan duyet truoc cua cung phieu (migration 0051).
  tien_doc_anh: string | null;
  anh_truoc: string | null;
  ghi_chu_ktv: string | null;
  ktv_bao_chuyen_luc: string | null;
  ly_do_tu_choi: string | null;
  nguoi_duyet: string;
  duyet_luc: string;
  lich_su: number;
  // Sua / huy khoan (migration 0049).
  thuc_nhan_goc: number | null;
  sua_luc: string | null;
  nguoi_sua: string | null;
  ly_do_sua: string | null;
  huy_luc: string | null;
  nguoi_huy: string | null;
  ly_do_huy: string | null;
  trang_thai_phieu: string | null;
  huy_duoc: number; // backend KHOAN_HUY_DUOC_SQL (chua tinh quy du - chi biet luc bam)
}
interface GiaoDichRow {
  id: number;
  email: string;
  loai: string;
  so_tien: number;
  so_du_sau: number;
  phieu_xuat_kho_id: string | null;
  ma_xuat_kho: string | null;
  ghi_chu: string | null;
  nguoi_tao: string;
  ngay_tao: string;
}

const LOAI_GIAO_DICH: Record<string, { label: string; tone: BadgeTone }> = {
  nop_tien: { label: dichSau("Nộp tiền (KT xác nhận)"), tone: "teal" },
  tra_phieu: { label: dichSau("Trả phiếu"), tone: "ocean" },
  hoan_phieu: { label: dichSau("Hoàn từ phiếu"), tone: "violet" },
  dieu_chinh: { label: dichSau("Điều chỉnh"), tone: "amber" },
  hoan_tien_ktv: { label: dichSau("Hoàn tiền cho KTV"), tone: "coral" },
};

const anhCua = (k: KhoanRow) => docAnhBangChung({ bang_chung_chuyen_tien_anh: k.anh });
const chenhLech = (k: KhoanRow) => (k.trang_thai === "Da duyet" && !k.lich_su ? (k.so_tien_thuc_nhan ?? 0) - (k.so_tien_can_chuyen ?? 0) : 0);

const KET_QUA: Record<KhoanRow["trang_thai"], { label: string; tone: BadgeTone }> = {
  "Da duyet": { label: dichSau("Đã duyệt"), tone: "teal" },
  "Tu choi": { label: dichSau("Từ chối"), tone: "coral" },
  "Da huy": { label: dichSau("Đã hủy"), tone: "gray" },
};
const lyDoKhoan = (k: KhoanRow) => (k.trang_thai === "Tu choi" ? k.ly_do_tu_choi : k.trang_thai === "Da huy" ? k.ly_do_huy : k.ghi_chu_ktv);

function ChenhLech({ k }: { k: KhoanRow }) {
  const d = chenhLech(k);
  if (k.trang_thai !== "Da duyet") return <span className="text-[var(--color-text-faint)]">—</span>;
  if (d > 0) return <span className="text-[var(--color-success-strong)]">{t("Dư")} <Money>{fmtVND(d)}</Money> {t("vào quỹ")}</span>;
  if (d < 0) return <span className="text-[var(--color-warning-strong)]">{t("Thiếu")} <Money>{fmtVND(-d)}</Money></span>;
  return <span className="text-[var(--color-text-secondary)]">{t("Đủ")}</span>;
}

export function QuyChuyenTienModule() {
  const auth = useAuth();
  const addToast = useToast();
  const qc = useQueryClient();
  const dir = usePersonDirectory();
  const ten = (e: string | null | undefined) => (e ? formatPersonDisplay(e, dir) : "");
  const user = auth.status === "authenticated" ? auth.user : null;
  const xemTatCa = !!user && (user.vai_tro === "Admin" || !!user.la_ke_toan || !!user.la_tac_nghiep || !!user.la_mua_hang); // Mua hang: xem, khong dieu chinh

  const [tab, setTab] = useState<"khoan" | "so-du" | "so-quy">("khoan");
  const [emailLoc, setEmailLoc] = useState("");

  const tongQuan = useQuery({
    queryKey: ["quy-ktv-tong-quan"],
    queryFn: () => api.get<{ rows: TongQuanRow[]; coTheDieuChinh: boolean }>("/quy-ktv/tong-quan"),
  });
  const tqRows = tongQuan.data?.rows ?? [];
  const coTheDieuChinh = !!tongQuan.data?.coTheDieuChinh;
  const tongQuy = tqRows.reduce((s, r) => s + r.so_du, 0);
  const tongConPhai = tqRows.reduce((s, r) => s + r.con_phai_chuyen, 0);
  const tongDaNhan = tqRows.reduce((s, r) => s + r.tong_thuc_nhan, 0);
  const nguoiOptions = useMemo(
    () => [{ value: "", label: t("Tất cả người chuyển") }, ...tqRows.map((r) => ({ value: r.email, label: ten(r.email) || r.email }))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tqRows, dir],
  );

  const [dieuChinh, setDieuChinh] = useState<TongQuanRow | null>(null);
  const lamMoi = () => {
    void qc.invalidateQueries({ queryKey: ["quy-ktv-tong-quan"] });
    void qc.invalidateQueries({ queryKey: ["quy-ktv-khoan"] });
    void qc.invalidateQueries({ queryKey: ["quy-ktv-giao-dich"] });
  };

  const tabs = [
    { key: "khoan", label: t("Khoản chuyển tiền") },
    ...(xemTatCa ? [{ key: "so-du", label: t("Số dư quỹ"), count: tqRows.filter((r) => r.so_du > 0).length }] : []),
    { key: "so-quy", label: t("Sổ quỹ") },
  ];

  return (
    <div className="anim-in space-y-4">
      {/* Mobile 1 cot (so tien day du khong bi cat), desktop 3 cot - cung khuon grid cua TonKhoKtvModule. */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-[14px]">
        <div className="flex min-w-0">
          <StatCard label={xemTatCa ? t("Tổng quỹ dư") : t("Quỹ dư của tôi")} value={fmtVND(tongQuy)} color="green" iconType={Icon.wallet}
            sub={xemTatCa ? t("{a} người có quỹ dư", { a: tqRows.filter((r) => r.so_du > 0).length }) : t("Tự trừ vào phiếu cần chuyển tiếp theo")} />
        </div>
        <div className="flex min-w-0">
          <StatCard label={t("Còn phải chuyển")} value={fmtVND(tongConPhai)} color="amber" iconType={Icon.clock}
            sub={t("{a} phiếu đang chờ tiền", { a: tqRows.reduce((s, r) => s + r.so_phieu_cho, 0) })} />
        </div>
        <div className="flex min-w-0">
          <StatCard label={t("Kế toán đã xác nhận nhận")} value={fmtVND(tongDaNhan)} color="blue" iconType={Icon.check}
            sub={t("{a} khoản", { a: tqRows.reduce((s, r) => s + r.so_khoan_duyet, 0) })} />
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={(k) => setTab(k as typeof tab)} />

      {tab === "khoan" && (
        <KhoanChuyenTab
          xemTatCa={xemTatCa}
          nguoiOptions={nguoiOptions}
          emailLoc={emailLoc}
          setEmailLoc={setEmailLoc}
          ten={ten}
          coTheDieuChinh={coTheDieuChinh}
          soDuCua={(email) => tqRows.find((r) => r.email === email)?.so_du ?? 0}
          onChanged={lamMoi}
        />
      )}
      {tab === "so-du" && xemTatCa && (
        <SoDuTab
          rows={tqRows}
          isLoading={tongQuan.isLoading}
          isError={tongQuan.isError}
          ten={ten}
          coTheDieuChinh={coTheDieuChinh}
          onXemSoQuy={(email) => { setEmailLoc(email); setTab("so-quy"); }}
          onDieuChinh={setDieuChinh}
        />
      )}
      {tab === "so-quy" && <SoQuyTab xemTatCa={xemTatCa} nguoiOptions={nguoiOptions} emailLoc={emailLoc} setEmailLoc={setEmailLoc} ten={ten} />}

      {dieuChinh && (
        <DieuChinhModal
          row={dieuChinh}
          ten={ten}
          onClose={() => setDieuChinh(null)}
          onDone={(soDu) => { addToast(t("Đã ghi — quỹ còn {a}", { a: fmtVND(soDu) })); setDieuChinh(null); lamMoi(); }}
        />
      )}
    </div>
  );
}

function KhoanChuyenTab({ xemTatCa, nguoiOptions, emailLoc, setEmailLoc, ten, coTheDieuChinh, soDuCua, onChanged }: {
  xemTatCa: boolean;
  nguoiOptions: { value: string; label: string }[];
  emailLoc: string;
  setEmailLoc: (v: string) => void;
  ten: (e: string | null | undefined) => string;
  coTheDieuChinh: boolean;
  soDuCua: (email: string) => number;
  onChanged: () => void;
}) {
  const addToast = useToast();
  const [suaKhoan, setSuaKhoan] = useState<KhoanRow | null>(null);
  const [huyKhoan, setHuyKhoan] = useState<KhoanRow | null>(null);
  const [page, setPage] = useState(1);
  const [loc, setLoc] = useState("");
  const [q, setQ] = useState("");
  const [tu, setTu] = useState("");
  const [den, setDen] = useState("");
  const params = new URLSearchParams();
  if (emailLoc) params.set("email", emailLoc);
  if (loc === "Da duyet" || loc === "Tu choi" || loc === "Da huy") params.set("trang_thai", loc);
  if (loc === "du" || loc === "thieu") params.set("loai", loc);
  if (q.trim()) params.set("q", q.trim());
  if (tu) params.set("tu", tu);
  if (den) params.set("den", den);
  const qs = params.toString();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["quy-ktv-khoan", qs, page],
    queryFn: () => api.get<{ rows: KhoanRow[]; total: number; tongThucNhan: number; tongDu: number }>(`/quy-ktv/khoan-chuyen?${qs}${qs ? "&" : ""}page=${page}&pageSize=20`),
  });
  // "Xem ảnh nhanh" (2026-09-30): moi anh cua cac khoan tren trang dang xem, chuyen anh xuyen qua cac khoan.
  const [xemAnh, setXemAnh] = useState<number | null>(null);
  const anhDs: AnhXem[] = [];
  const batDauAnh = new Map<number, number>();
  for (const k of data?.rows ?? []) {
    batDauAnh.set(k.id, anhDs.length);
    const urls = anhCua(k);
    const tienDoc = docTienDocMap(k.tien_doc_anh);
    const anhTruoc = new Set(docDsAnh(k.anh_truoc));
    const kq = KET_QUA[k.trang_thai];
    // Doi soat (2026-09-30): anh tinh vao khoan nay = bo anh da ghi nhan o lan duyet truoc; so doi chieu = Ke toan xac nhan
    // thuc nhan (khoan da duyet/huy) hoac so can chuyen (khoan tu choi).
    const urlsTinh = urls.filter((u) => !anhTruoc.has(u));
    const soSanh =
      k.trang_thai !== "Tu choi" && k.so_tien_thuc_nhan != null
        ? { nhan: t("Kế toán xác nhận"), giaTri: k.so_tien_thuc_nhan }
        : k.so_tien_can_chuyen != null
          ? { nhan: t("Cần chuyển"), giaTri: k.so_tien_can_chuyen }
          : null;
    urls.forEach((url, i) => {
      anhDs.push({
        url,
        tieuDe: k.ma_xuat_kho && k.ma_xuat_kho !== k.phieu_xuat_kho_id ? `${k.ma_xuat_kho} · ${k.phieu_xuat_kho_id}` : k.phieu_xuat_kho_id,
        phu: t("Ảnh {a}/{b} · khoản #{c}", { a: i + 1, b: urls.length, c: k.id }),
        trangThai: (
          <>
            <Badge tone={kq?.tone ?? "gray"}>{kq ? t(kq.label) : k.trang_thai}</Badge>
            {k.trang_thai_phieu === "Ke toan huy" && <Badge tone="gray">{t("Phiếu đã hủy")}</Badge>}
          </>
        ),
        urlsNhom: urls,
        urlsTinh,
        tienDoc,
        tien: [
          { nhan: t("Cần chuyển"), giaTri: fmtVND(k.so_tien_can_chuyen) },
          {
            nhan: k.thuc_nhan_goc != null ? t("Kế toán xác nhận (đã sửa)") : t("Kế toán xác nhận"),
            giaTri: k.so_tien_thuc_nhan == null ? "—" : fmtVND(k.so_tien_thuc_nhan),
          },
        ],
        soSanh,
        chungTu: [
          { nhan: t("Mã HĐ"), giaTri: maHdCua(k.ma_xuat_kho, k.phieu_xuat_kho_id) },
          { nhan: t("Mã PXK"), giaTri: k.phieu_xuat_kho_id },
          { nhan: t("Người chuyển"), giaTri: ten(k.email_nguoi_chuyen) || "—" },
          { nhan: t("KTV báo chuyển lúc"), giaTri: k.ktv_bao_chuyen_luc ? fmtDateTime(k.ktv_bao_chuyen_luc) : "—" },
          { nhan: t("Kế toán xử lý"), giaTri: `${ten(k.nguoi_huy ?? k.nguoi_duyet)} · ${fmtDateTime(k.huy_luc ?? k.duyet_luc)}` },
        ],
        ghiChu: [
          ...(k.ghi_chu_ktv ? [{ nhan: t("Ghi chú KTV"), giaTri: k.ghi_chu_ktv }] : []),
          ...(k.trang_thai !== "Da duyet" && lyDoKhoan(k) ? [{ nhan: k.trang_thai === "Tu choi" ? t("Lý do từ chối") : t("Lý do hủy"), giaTri: lyDoKhoan(k) }] : []),
          ...(k.thuc_nhan_goc != null ? [{ nhan: t("Thực nhận trước khi sửa"), giaTri: fmtVND(k.thuc_nhan_goc) }] : []),
          ...(k.ly_do_sua ? [{ nhan: t("Lý do sửa tiền"), giaTri: k.ly_do_sua }] : []),
        ],
      });
    });
  }

  const [dangTai, setDangTai] = useState(false);
  async function taiExcel() {
    setDangTai(true);
    try {
      const res = await api.get<{ rows: KhoanRow[] }>(`/quy-ktv/khoan-chuyen?${qs}`);
      const rows = res.rows.map((k) => {
        const anh = anhCua(k);
        return {
          "Thời gian Kế toán xử lý": k.duyet_luc,
          "Mã HĐ": k.ma_xuat_kho ?? k.phieu_xuat_kho_id,
          "Người chuyển tiền": ten(k.email_nguoi_chuyen),
          "Kết quả": KET_QUA[k.trang_thai]?.label ?? k.trang_thai,
          "Phiếu đã hủy": k.trang_thai_phieu === "Ke toan huy" ? "Có" : "",
          "Tổng tiền phiếu": k.tong_phieu,
          "Tiền cần chuyển": k.so_tien_can_chuyen,
          "Tiền thực chuyển": k.so_tien_thuc_nhan,
          "Thực nhận lúc duyệt (trước khi sửa)": k.thuc_nhan_goc ?? "",
          "Lý do sửa": k.ly_do_sua ?? "",
          "Dư vào quỹ": Math.max(0, chenhLech(k)),
          "Thiếu": Math.max(0, -chenhLech(k)),
          "Ghi chú KTV": k.ghi_chu_ktv ?? "",
          "KTV báo chuyển lúc": k.ktv_bao_chuyen_luc ?? "",
          "Lý do từ chối": k.ly_do_tu_choi ?? "",
          "Kế toán": ten(k.nguoi_duyet),
          "Hủy lúc": k.huy_luc ?? "",
          "Người hủy": ten(k.nguoi_huy),
          "Lý do hủy": k.ly_do_huy ?? "",
          "Dữ liệu trước khi có quỹ": k.lich_su ? "Có" : "",
          ...Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`Ảnh ${i + 1}`, anh[i] ?? ""])),
        };
      });
      await exportRowsToExcel(rows, "khoan_chuyen_tien.xlsx", "Khoản chuyển tiền", undefined, {
        linkFields: [0, 1, 2, 3, 4].map((i) => `Ảnh ${i + 1}`),
      });
    } catch (err) {
      addToast(t("Không tải được file: ") + describeApiError(err));
    } finally {
      setDangTai(false);
    }
  }

  const columns: Column<KhoanRow>[] = [
    { key: "duyet_luc", header: t("Thời gian"), render: (k) => fmtDateTime(k.duyet_luc), mobile: "meta" },
    {
      key: "ma", header: t("Mã HĐ / PXK"), mobile: "title",
      render: (k) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-semibold">{k.ma_xuat_kho ?? k.phieu_xuat_kho_id}</span>
          {/* Phieu huy SAU khi da tra tien -> tien da tu hoan ve quy (lib/quyKtv.ts canBangPxk) - khoan van "Da duyet". */}
          {k.trang_thai_phieu === "Ke toan huy" && k.trang_thai === "Da duyet" && (
            <span title={t("Phiếu đã hủy — tiền đã trả cho phiếu được tự hoàn về quỹ dư của người nhận hàng")}>
              <Badge tone="gray">{t("Phiếu đã hủy · tiền về quỹ")}</Badge>
            </span>
          )}
        </span>
      ),
    },
    ...(xemTatCa ? [{ key: "nguoi", header: t("Người chuyển"), render: (k: KhoanRow) => ten(k.email_nguoi_chuyen), mobile: "sub" as const }] : []),
    {
      key: "kq", header: t("Kết quả"), mobile: "badge",
      render: (k) => <Badge tone={KET_QUA[k.trang_thai]?.tone ?? "gray"}>{KET_QUA[k.trang_thai] ? t(KET_QUA[k.trang_thai].label) : k.trang_thai}</Badge>,
    },
    { key: "can", header: t("Cần chuyển"), className: "text-right", render: (k) => <Money>{fmtVND(k.so_tien_can_chuyen)}</Money> },
    {
      key: "thuc", header: t("Thực nhận"), className: "text-right",
      render: (k) =>
        k.so_tien_thuc_nhan == null ? "—" : (
          <span title={k.thuc_nhan_goc != null ? t("Sửa từ {a}{b}", { a: fmtVND(k.thuc_nhan_goc), b: k.ly_do_sua ? " — " + k.ly_do_sua : "" }) : undefined}>
            {k.trang_thai === "Da huy" ? <s><Money>{fmtVND(k.so_tien_thuc_nhan)}</Money></s> : <b><Money>{fmtVND(k.so_tien_thuc_nhan)}</Money></b>}
            {k.thuc_nhan_goc != null && <span className="ml-1 text-[11px] text-[var(--color-warning-strong)]">{t("(đã sửa)")}</span>}
          </span>
        ),
    },
    { key: "chenh", header: t("Chênh lệch"), render: (k) => (k.lich_su ? <span className="text-[var(--color-text-faint)]" title={t("Duyệt trước khi có quỹ — coi như nhận đủ")}>{t("Trước khi có quỹ")}</span> : <ChenhLech k={k} />) },
    { key: "anh", header: t("Ảnh"), render: (k) => <BangChungAnhList urls={anhCua(k)} onXem={(i) => setXemAnh((batDauAnh.get(k.id) ?? 0) + i)} /> },
    {
      key: "ghi_chu", header: t("Ghi chú / lý do"),
      render: (k) => <span className="block max-w-[260px] truncate" title={lyDoKhoan(k) ?? ""}>{lyDoKhoan(k)}</span>,
    },
    { key: "ke_toan", header: t("Kế toán"), render: (k) => ten(k.nguoi_huy ?? k.nguoi_duyet) },
    ...(coTheDieuChinh
      ? [{
          key: "tt", header: "", mobileHint: "actions" as const,
          render: (k: KhoanRow) =>
            k.trang_thai !== "Da duyet" ? null : (
              <div className="flex gap-1.5">
                <Btn size="sm" variant="ghost" onClick={() => setSuaKhoan(k)}>{t("Sửa tiền")}</Btn>
                {!!k.huy_duoc && <Btn size="sm" variant="danger" onClick={() => setHuyKhoan(k)}>{t("Hủy khoản")}</Btn>}
              </div>
            ),
        }]
      : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {xemTatCa && <Select value={emailLoc} onChange={(v) => { setEmailLoc(v); setPage(1); }} options={nguoiOptions} className="w-full sm:w-60" />}
        <Select
          value={loc}
          onChange={(v) => { setLoc(v); setPage(1); }}
          options={[
            { value: "", label: t("Tất cả kết quả") },
            { value: "Da duyet", label: t("Đã duyệt") },
            { value: "du", label: t("Đã duyệt — dư vào quỹ") },
            { value: "thieu", label: t("Đã duyệt — thiếu") },
            { value: "Tu choi", label: t("Từ chối") },
            { value: "Da huy", label: t("Đã hủy (duyệt nhầm)") },
          ]}
          className="w-full sm:w-52"
        />
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Tìm mã HĐ / PXK")} className="focus-ring w-44 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-base sm:text-sm" />
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">{t("Từ||ngày")}
          <input type="date" value={tu} onChange={(e) => { setTu(e.target.value); setPage(1); }} className="focus-ring rounded-lg border border-[var(--color-border)] px-2 py-1 text-base sm:text-sm" />
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">{t("đến||ngày")}
          <input type="date" value={den} onChange={(e) => { setDen(e.target.value); setPage(1); }} className="focus-ring rounded-lg border border-[var(--color-border)] px-2 py-1 text-base sm:text-sm" />
        </label>
        <Btn variant="ghost" size="sm" onClick={() => void taiExcel()} disabled={dangTai}>{dangTai ? t("Đang tải...") : t("⬇ Tải Excel")}</Btn>
      </div>
      {data && (
        <div className="text-xs text-[var(--color-text-secondary)]">
          {t("{a} khoản · Thực nhận", { a: data.total })} <b className="text-[var(--color-text)]"><Money>{fmtVND(data.tongThucNhan)}</Money></b>
          {data.tongDu > 0 && <> {t("· Dư vào quỹ")} <b className="text-[var(--color-success-strong)]"><Money>{fmtVND(data.tongDu)}</Money></b></>}
        </div>
      )}
      {xemAnh != null && <XemAnhNhanh items={anhDs} batDau={xemAnh} onClose={() => setXemAnh(null)} />}
      <PaginatedTable
        columns={columns}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        page={page}
        pageSize={20}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(k) => k.id}
        emptyText={t("Chưa có khoản chuyển tiền nào")}
      />
      {suaKhoan && (
        <SuaThucNhanModal
          k={suaKhoan}
          soDu={soDuCua(suaKhoan.email_nguoi_chuyen)}
          ten={ten}
          onClose={() => setSuaKhoan(null)}
          onDone={(soDu) => { addToast(t("Đã sửa số thực nhận — quỹ còn {a}", { a: fmtVND(soDu) })); setSuaKhoan(null); onChanged(); }}
        />
      )}
      {huyKhoan && (
        <HuyKhoanModal
          k={huyKhoan}
          ten={ten}
          onClose={() => setHuyKhoan(null)}
          onDone={(phieuDaHuy) => {
            addToast(phieuDaHuy ? t("Đã hủy khoản — đã trừ khỏi quỹ") : t("Đã hủy khoản — phiếu về chờ Kế toán duyệt lại"));
            setHuyKhoan(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

const nhanO = "text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]";
const oNhap = "focus-ring mt-1 w-full rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-base sm:text-sm";

/** Ke toan sua so THUC NHAN cua 1 khoan da duyet (POST /quy-ktv/khoan-chuyen/:id/sua). Tang: cong quy + tu tru phieu con
 * thieu. Giam: tru quy, chi khi quy con du (backend kiem lai + bao ly do). */
function SuaThucNhanModal({ k, soDu, ten, onClose, onDone }: {
  k: KhoanRow;
  soDu: number;
  ten: (e: string | null | undefined) => string;
  onClose: () => void;
  onDone: (soDu: number) => void;
}) {
  const addToast = useToast();
  const cu = k.so_tien_thuc_nhan ?? 0;
  const [soTien, setSoTien] = useState(String(cu));
  const [lyDo, setLyDo] = useState("");
  const moi = Number(soTien);
  const chenh = moi - cu;
  const hopLe = Number.isInteger(moi) && moi > 0 && chenh !== 0 && !!lyDo.trim();
  const khongDu = chenh < 0 && soDu < -chenh;
  const tatCaAnh = anhCua(k);
  const daCo = new Set(docDsAnh(k.anh_truoc));
  const doc = useDocTienAnh(tatCaAnh.filter((u) => !daCo.has(u)), docTienDocMap(k.tien_doc_anh));
  const mut = useMutation({
    mutationFn: () => api.post<{ soDuQuy: number }>(`/quy-ktv/khoan-chuyen/${k.id}/sua`, { so_tien_thuc_nhan: moi, ly_do: lyDo.trim() }),
    onSuccess: (r) => onDone(r.soDuQuy),
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });
  return (
    <Modal open onClose={onClose} title={t("Sửa tiền thực nhận — {a}", { a: k.ma_xuat_kho ?? k.phieu_xuat_kho_id })}>
      <div className="space-y-3 text-sm">
        <div className="text-[var(--color-text-secondary)]">
          {ten(k.email_nguoi_chuyen)} · {t("duyệt {a} · cần chuyển", { a: fmtDateTime(k.duyet_luc) })} <Money>{fmtVND(k.so_tien_can_chuyen)}</Money>
        </div>
        <div>
          {t("Thực nhận đang ghi:")} <b><Money>{fmtVND(cu)}</Money></b>
          {k.thuc_nhan_goc != null && <span className="text-[var(--color-text-secondary)]"> {t("(lúc duyệt:")} <Money>{fmtVND(k.thuc_nhan_goc)}</Money>)</span>}
        </div>
        <div>
          <label className={nhanO}>{t("Số thực nhận đúng")}</label>
          <input type="number" min={1} inputMode="numeric" value={soTien} onChange={(e) => setSoTien(e.target.value)} className={oNhap} />
          <div className="mt-1">
            <TienDocTuAnh doc={doc} soSoSanh={moi > 0 ? moi : null} nhan={t("số thực nhận")} sttCua={(u) => tatCaAnh.indexOf(u) + 1} />
          </div>
          {moi > 0 && chenh !== 0 && (
            <div className={`mt-1 text-xs ${khongDu ? "text-[var(--color-danger-strong)]" : "text-[var(--color-text-secondary)]"}`}>
              {chenh > 0 ? (
                <>{t("Cộng thêm")} <Money>{fmtVND(chenh)}</Money> {t("vào quỹ — tự trừ cho phiếu này nếu còn thiếu, dư trừ tiếp phiếu đang chờ tiền.")}</>
              ) : khongDu ? (
                <>{t("Cần trừ")} <Money>{fmtVND(-chenh)}</Money> {t("nhưng quỹ chỉ còn")} <Money>{fmtVND(soDu)}</Money> {t("(tiền đã dùng trả phiếu) — không sửa được. Nếu duyệt nhầm, dùng \"Hủy khoản\" rồi duyệt lại.")}</>
              ) : (
                <>{t("Trừ")} <Money>{fmtVND(-chenh)}</Money> {t("khỏi quỹ — quỹ còn")} <Money>{fmtVND(soDu + chenh)}</Money>.</>
              )}
            </div>
          )}
        </div>
        <div>
          <label className={nhanO}>{t("Lý do sửa (bắt buộc)")}</label>
          <textarea value={lyDo} onChange={(e) => setLyDo(e.target.value)} rows={2} placeholder={t("Vd: Nhập nhầm, sao kê thực nhận 250.000đ")} className={oNhap} />
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose} disabled={mut.isPending}>{t("Đóng")}</Btn>
          <Btn onClick={() => mut.mutate()} disabled={!hopLe || khongDu || mut.isPending} loading={mut.isPending}>{t("Lưu số thực nhận")}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/** Ke toan HUY 1 khoan da duyet nham (POST /quy-ktv/khoan-chuyen/:id/huy) - bam 2 lan de xac nhan. */
function HuyKhoanModal({ k, ten, onClose, onDone }: {
  k: KhoanRow;
  ten: (e: string | null | undefined) => string;
  onClose: () => void;
  onDone: (phieuDaHuy: boolean) => void;
}) {
  const addToast = useToast();
  const [lyDo, setLyDo] = useState("");
  const [xacNhan, setXacNhan] = useState(false);
  const phieuDaHuy = k.trang_thai_phieu === "Ke toan huy";
  const mut = useMutation({
    mutationFn: () => api.post<{ phieuDaHuy: boolean }>(`/quy-ktv/khoan-chuyen/${k.id}/huy`, { ly_do: lyDo.trim() }),
    onSuccess: (r) => onDone(r.phieuDaHuy),
    onError: (err) => { setXacNhan(false); addToast(t("Lỗi: ") + describeApiError(err)); },
  });
  return (
    <Modal open onClose={onClose} title={t("Hủy khoản chuyển tiền — {a}", { a: k.ma_xuat_kho ?? k.phieu_xuat_kho_id })}>
      <div className="space-y-3 text-sm">
        <div className="text-[var(--color-text-secondary)]">
          {t("{a} · duyệt {b} · thực nhận", { a: ten(k.email_nguoi_chuyen), b: fmtDateTime(k.duyet_luc) })}
          <b className="text-[var(--color-text)]"><Money>{fmtVND(k.so_tien_thuc_nhan)}</Money></b>
        </div>
        <div className="rounded-lg bg-[var(--color-warning-soft)] px-3 py-2 text-[13px] text-[var(--color-text-body)]">
          {phieuDaHuy ? (
            <>{t("Phiếu đã hủy, tiền đã về quỹ — hủy khoản sẽ")} <b>{t("trừ")} <Money>{fmtVND(k.so_tien_thuc_nhan)}</Money> {t("khỏi quỹ")}</b> {t("của người nhận hàng.")}</>
          ) : (
            <>
              {t("Hệ thống")} <b>{t("rút lại phần tiền phiếu đã được trả")}</b> {t("từ lần duyệt này, trừ")} <Money>{fmtVND(k.so_tien_thuc_nhan)}</Money>{" "}
              {t("khỏi quỹ và đưa phiếu về")} <b>{t("\"KTV đã chuyển\"")}</b>{" "}
              {t("(giữ ảnh bằng chứng) để Kế toán duyệt lại số đúng hoặc Từ chối. Không hủy được nếu phần dư đã dùng trả phiếu khác.")}
            </>
          )}
        </div>
        <div>
          <label className={nhanO}>{t("Lý do hủy (bắt buộc)")}</label>
          <textarea value={lyDo} onChange={(e) => { setLyDo(e.target.value); setXacNhan(false); }} rows={2} placeholder={t("Vd: Duyệt nhầm, sao kê chưa có tiền")} className={oNhap} />
        </div>
        <div className="flex items-center justify-end gap-2">
          {xacNhan && <span className="text-[11px] font-medium text-[var(--color-danger-strong)]">{t("Bấm lần nữa để xác nhận hủy")}</span>}
          <Btn variant="ghost" onClick={onClose} disabled={mut.isPending}>{t("Đóng")}</Btn>
          <Btn variant="danger" onClick={() => (xacNhan ? mut.mutate() : setXacNhan(true))} disabled={!lyDo.trim() || mut.isPending} loading={mut.isPending}>
            {xacNhan ? t("Xác nhận hủy khoản") : t("Hủy khoản")}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function SoDuTab({ rows, isLoading, isError, ten, coTheDieuChinh, onXemSoQuy, onDieuChinh }: {
  rows: TongQuanRow[];
  isLoading: boolean;
  isError: boolean;
  ten: (e: string | null | undefined) => string;
  coTheDieuChinh: boolean;
  onXemSoQuy: (email: string) => void;
  onDieuChinh: (r: TongQuanRow) => void;
}) {
  const [q, setQ] = useState("");
  const [chiCoQuy, setChiCoQuy] = useState(false);
  const [page, setPage] = useState(1);
  const loc = rows.filter((r) => (!chiCoQuy || r.so_du > 0) && (!q.trim() || khopTim(`${ten(r.email)} ${r.email}`, q)));
  const trang = loc.slice((page - 1) * 20, page * 20);
  const columns: Column<TongQuanRow>[] = [
    { key: "nguoi", header: t("Người nhận hàng"), render: (r) => <span className="font-semibold">{ten(r.email) || r.email}</span>, mobile: "title" },
    { key: "so_du", header: t("Quỹ dư"), className: "text-right", render: (r) => <b className={r.so_du > 0 ? "text-[var(--color-success-strong)]" : "text-[var(--color-text-faint)]"}><Money>{fmtVND(r.so_du)}</Money></b>, mobile: "badge" },
    { key: "con", header: t("Còn phải chuyển"), className: "text-right", render: (r) => (r.con_phai_chuyen > 0 ? <span><Money>{fmtVND(r.con_phai_chuyen)}</Money> <span className="text-[var(--color-text-faint)]">{t("({a} phiếu)", { a: r.so_phieu_cho })}</span></span> : "—") },
    { key: "nhan", header: t("Đã xác nhận nhận"), className: "text-right", render: (r) => <Money>{fmtVND(r.tong_thuc_nhan)}</Money> },
    { key: "khoan", header: t("Số khoản"), render: (r) => `${r.so_khoan_duyet}${r.so_lan_tu_choi ? t(" (+{a} từ chối)", { a: r.so_lan_tu_choi }) : ""}` },
    { key: "lan_cuoi", header: t("Lần cuối"), render: (r) => (r.lan_cuoi ? fmtDateTime(r.lan_cuoi) : "—"), mobile: "meta" },
    {
      key: "tt", header: "", mobileHint: "actions",
      render: (r) => (
        <div className="flex gap-1.5">
          <Btn size="sm" variant="ghost" onClick={() => onXemSoQuy(r.email)}>{t("Sổ quỹ")}</Btn>
          {coTheDieuChinh && <Btn size="sm" variant="subtle" onClick={() => onDieuChinh(r)}>{t("Điều chỉnh")}</Btn>}
        </div>
      ),
    },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Tìm theo tên / email")} className="focus-ring w-56 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-base sm:text-sm" />
        <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-body)]">
          <input type="checkbox" checked={chiCoQuy} onChange={(e) => { setChiCoQuy(e.target.checked); setPage(1); }} /> {t("Chỉ người có quỹ dư")}
        </label>
      </div>
      <PaginatedTable
        columns={columns}
        rows={trang}
        isLoading={isLoading}
        isError={isError}
        page={page}
        pageSize={20}
        total={loc.length}
        onPageChange={setPage}
        rowKey={(r) => r.email}
        emptyText={t("Chưa có ai có quỹ / khoản chuyển tiền")}
      />
    </div>
  );
}

function SoQuyTab({ xemTatCa, nguoiOptions, emailLoc, setEmailLoc, ten }: {
  xemTatCa: boolean;
  nguoiOptions: { value: string; label: string }[];
  emailLoc: string;
  setEmailLoc: (v: string) => void;
  ten: (e: string | null | undefined) => string;
}) {
  const [page, setPage] = useState(1);
  const [loai, setLoai] = useState("");
  const params = new URLSearchParams();
  if (emailLoc) params.set("email", emailLoc);
  if (loai) params.set("loai", loai);
  const qs = params.toString();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["quy-ktv-giao-dich", qs, page],
    queryFn: () => api.get<{ rows: GiaoDichRow[]; total: number }>(`/quy-ktv/giao-dich?${qs}${qs ? "&" : ""}page=${page}&pageSize=20`),
  });
  const columns: Column<GiaoDichRow>[] = [
    { key: "ngay", header: t("Thời gian"), render: (g) => fmtDateTime(g.ngay_tao), mobile: "meta" },
    ...(xemTatCa ? [{ key: "nguoi", header: t("Người nhận hàng"), render: (g: GiaoDichRow) => ten(g.email), mobile: "title" as const }] : []),
    { key: "loai", header: t("Loại"), render: (g) => <Badge tone={LOAI_GIAO_DICH[g.loai]?.tone ?? "gray"}>{LOAI_GIAO_DICH[g.loai] ? t(LOAI_GIAO_DICH[g.loai].label) : g.loai}</Badge>, mobile: "badge" },
    {
      key: "tien", header: t("Biến động"), className: "text-right",
      render: (g) => <b className={g.so_tien > 0 ? "text-[var(--color-success-strong)]" : "text-[var(--color-danger-strong)]"}>{g.so_tien > 0 ? "+" : "−"}<Money>{fmtVND(Math.abs(g.so_tien))}</Money></b>,
    },
    { key: "sau", header: t("Số dư sau"), className: "text-right", render: (g) => <Money>{fmtVND(g.so_du_sau)}</Money> },
    { key: "pxk", header: t("Phiếu||cột"), render: (g) => g.ma_xuat_kho ?? g.phieu_xuat_kho_id ?? "—" },
    { key: "ghi_chu", header: t("Ghi chú"), render: (g) => <span className="block max-w-[300px] truncate" title={g.ghi_chu ?? ""}>{g.ghi_chu}</span> },
    { key: "nguoi_tao", header: t("Người thực hiện"), render: (g) => (g.nguoi_tao === "he-thong" ? t("Hệ thống") : ten(g.nguoi_tao)) },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {xemTatCa && <Select value={emailLoc} onChange={(v) => { setEmailLoc(v); setPage(1); }} options={nguoiOptions} className="w-full sm:w-60" />}
        <Select
          value={loai}
          onChange={(v) => { setLoai(v); setPage(1); }}
          options={[{ value: "", label: t("Tất cả loại") }, ...Object.entries(LOAI_GIAO_DICH).map(([value, v]) => ({ value, label: t(v.label) }))]}
          className="w-full sm:w-52"
        />
      </div>
      <PaginatedTable
        columns={columns}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        page={page}
        pageSize={20}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(g) => g.id}
        emptyText={t("Chưa có biến động quỹ")}
      />
    </div>
  );
}

function DieuChinhModal({ row, ten, onClose, onDone }: {
  row: TongQuanRow;
  ten: (e: string | null | undefined) => string;
  onClose: () => void;
  onDone: (soDu: number) => void;
}) {
  const addToast = useToast();
  const [loai, setLoai] = useState<"hoan_tien_ktv" | "cong" | "tru">("hoan_tien_ktv");
  const [soTien, setSoTien] = useState("");
  const [lyDo, setLyDo] = useState("");
  const so = Number(soTien);
  const hopLe = Number.isInteger(so) && so > 0 && !!lyDo.trim();
  const tru = loai !== "cong";
  const sauDieuChinh = row.so_du + (tru ? -so : so);
  const mut = useMutation({
    mutationFn: () =>
      api.post<{ so_du: number }>("/quy-ktv/dieu-chinh", {
        email: row.email,
        loai: loai === "hoan_tien_ktv" ? "hoan_tien_ktv" : "dieu_chinh",
        so_tien: loai === "tru" ? -so : so,
        ghi_chu: lyDo.trim(),
      }),
    onSuccess: (r) => onDone(r.so_du),
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });
  return (
    <Modal open onClose={onClose} title={t("Điều chỉnh quỹ — {a}", { a: ten(row.email) || row.email })}>
      <div className="space-y-3 text-sm">
        <div>{t("Quỹ hiện tại:")} <b><Money>{fmtVND(row.so_du)}</Money></b></div>
        <div className="flex flex-col gap-1.5">
          {([
            ["hoan_tien_ktv", t("Hoàn tiền cho KTV (Kế toán đã trả lại tiền dư) — trừ quỹ")],
            ["cong", t("Điều chỉnh cộng quỹ (vd nhập thiếu số thực nhận)")],
            ["tru", t("Điều chỉnh trừ quỹ (vd nhập thừa số thực nhận)")],
          ] as const).map(([v, label]) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="loai-dieu-chinh" checked={loai === v} onChange={() => setLoai(v)} /> {label}
            </label>
          ))}
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">{t("Số tiền")}</label>
          <input type="number" min={1} inputMode="numeric" value={soTien} onChange={(e) => setSoTien(e.target.value)} className="focus-ring mt-1 w-full rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-base sm:text-sm" />
          {so > 0 && (
            <div className={`mt-1 text-xs ${sauDieuChinh < 0 ? "text-[var(--color-danger-strong)]" : "text-[var(--color-text-secondary)]"}`}>
              {t("Quỹ sau khi ghi:")} <Money>{fmtVND(sauDieuChinh)}</Money>{sauDieuChinh < 0 && t(" — vượt số dư, không ghi được")}
              {!tru && t(" (tự trừ vào phiếu đang chờ tiền của người này nếu có)")}
            </div>
          )}
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">{t("Lý do (bắt buộc)")}</label>
          <textarea value={lyDo} onChange={(e) => setLyDo(e.target.value)} rows={2} placeholder={t("Vd: Đã chuyển trả KTV 80.000đ ngày 29/09, UNC số ...")} className="focus-ring mt-1 w-full rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-base sm:text-sm" />
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose} disabled={mut.isPending}>{t("Huỷ")}</Btn>
          <Btn onClick={() => mut.mutate()} disabled={!hopLe || sauDieuChinh < 0 || mut.isPending} loading={mut.isPending}>{t("Ghi vào sổ quỹ")}</Btn>
        </div>
      </div>
    </Modal>
  );
}
