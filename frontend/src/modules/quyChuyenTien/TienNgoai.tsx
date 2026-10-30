import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../../components/ui/Btn";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Money } from "../../components/ui/Money";
import { PaginatedTable, type Column } from "../../components/ui/PaginatedTable";
import { Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/Toast";
import { fmtDateTime, fmtVND } from "../../types";
import { exportRowsToExcel } from "../../lib/exportExcel";
import { boDau, khopTim } from "../../lib/boDau";
import { describeApiError } from "../datMuaLinhKien/helpers";
import { t } from "../../i18n";

// KHOẢN TIỀN NGOÀI VÀO QUỸ (chot 2026-10-22, backend routes/quyKtv.ts "/tien-ngoai", migration 0095) - "cho phép kế toán tự thêm khoản
// tiền chuyển ngoài cho KTV (tạo thủ công hoặc import hàng loạt - import sẽ theo mã misa hoặc ID KTV làm chuẩn - khi import sẽ ra 1 danh
// sách để người import kiểm tra lại các thông tin và kết nối tài khoản đã đúng chưa, trường hợp chưa đúng có thể chọn lại cho đúng KTV ...
// rồi mới ấn xác nhận import". Doi chieu ma -> KTV lam TREN MAY (danh ba GET /tien-ngoai/ktv): Ma MISA truoc, khong khop thi Ma KTV; nguoi
// import xem tung dong, chon lai KTV, bo chon dong sai roi moi gui. Gui theo LO 50 dong (moi lo 1 batch nguyen ven o server, lo_id chong ghi trung).

export interface KtvDanhBa {
  ma_ktv: string;
  ten_hien_thi: string | null;
  ma_misa: string | null;
  ten_misa: string | null;
  email: string | null;
  khu_vuc_ma: string | null;
  vai_tro_ktv: string | null;
  ngung: number;
  bi_khoa: number;
  quy_email: string | null;
  tram_ten: string | null;
  so_du: number | null;
}
interface KhoanTienNgoaiRow {
  id: number;
  email: string;
  ma_ktv: string | null;
  ma_trong_file: string | null;
  so_tien: number;
  noi_dung: string;
  ngay_chung_tu: string | null;
  nguon: "thu_cong" | "import" | "ktv"; // ktv = KTV tu nop, Ke toan da duyet (migration 0104)
  ten_file: string | null;
  lo_id: string;
  trang_thai: "Da ghi" | "Da huy";
  nguoi_tao: string;
  ngay_tao: string;
  huy_boi: string | null;
  huy_luc: string | null;
  ly_do_huy: string | null;
  so_du_hien_tai: number | null;
}

const LO_TOI_DA = 50; // khop TIEN_NGOAI_TOI_DA_LO o backend

function useDanhBaKtv(enabled = true) {
  return useQuery({
    queryKey: ["quy-ktv-tien-ngoai-ktv"],
    queryFn: () => api.get<{ rows: KtvDanhBa[] }>("/quy-ktv/tien-ngoai/ktv"),
    enabled,
    staleTime: 60_000,
  });
}
const tenKtv = (k: KtvDanhBa) => k.ten_hien_thi || k.ten_misa || k.ma_ktv;
const nhanKtv = (k: KtvDanhBa) =>
  `${k.ma_ktv} · ${tenKtv(k)}${k.ma_misa ? ` · MISA ${k.ma_misa}` : ""}${k.khu_vuc_ma ? ` · ${k.khu_vuc_ma}` : ""}${k.ngung ? ` · ${t("đã tắt")}` : ""}`;
const loId = () => `tn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const chuan = (s: string) => s.trim().toUpperCase();

// Canh bao / loi CHAN cua 1 KTV da chon (khong co Gmail = khong co quy de ghi).
function vanDeKtv(k: KtvDanhBa | undefined): { chan: string[]; canh: string[] } {
  const chan: string[] = [];
  const canh: string[] = [];
  if (!k) return { chan: [t("Chưa khớp KTV — chọn KTV")], canh };
  if (!k.quy_email) chan.push(k.vai_tro_ktv === "Ve tinh" ? t("Vệ tinh chưa có Trạm / Trạm chưa gắn Gmail") : t("KTV chưa gắn Gmail đăng nhập — chưa có quỹ"));
  if (k.vai_tro_ktv === "Ve tinh" && k.quy_email) canh.push(t("Vệ tinh → tiền vào quỹ của Trạm {a}", { a: k.tram_ten ?? "" }));
  if (k.ngung || k.bi_khoa) canh.push(t("Tài khoản đang tắt"));
  return { chan, canh };
}

// ---------- Tab danh sach ----------

export function TienNgoaiTab({ ten }: { ten: (e: string | null | undefined) => string }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const [q, setQ] = useState("");
  const [tu, setTu] = useState("");
  const [den, setDen] = useState("");
  const [tt, setTt] = useState("");
  const [nguon, setNguon] = useState("");
  const [page, setPage] = useState(1);
  const [moThuCong, setMoThuCong] = useState(false);
  const [importRows, setImportRows] = useState<{ ten: string; rows: DongFile[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const danhBa = useDanhBaKtv();

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (q.trim()) params.set("q", q.trim());
  if (tu) params.set("tu", tu);
  if (den) params.set("den", den);
  if (tt) params.set("trang_thai", tt);
  if (nguon) params.set("nguon", nguon);
  const qs = params.toString();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["quy-ktv-tien-ngoai", qs],
    queryFn: () => api.get<{ rows: KhoanTienNgoaiRow[]; total: number; tong_tien: number }>(`/quy-ktv/tien-ngoai?${qs}`),
  });
  const lamMoi = () => {
    void qc.invalidateQueries({ queryKey: ["quy-ktv-tien-ngoai"] });
    void qc.invalidateQueries({ queryKey: ["quy-ktv-tien-ngoai-ktv"] });
    void qc.invalidateQueries({ queryKey: ["quy-ktv-tong-quan"] });
    void qc.invalidateQueries({ queryKey: ["quy-ktv-giao-dich"] });
  };
  const huy = useMutation({
    mutationFn: (a: { id: number; lyDo: string }) => api.post<{ so_du: number }>(`/quy-ktv/tien-ngoai/${a.id}/huy`, { ly_do: a.lyDo }),
    onSuccess: (r) => { addToast(t("Đã hủy khoản — quỹ còn {a}", { a: fmtVND(r.so_du) })); lamMoi(); },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  async function docFile(f: File) {
    try {
      const rows = await docFileTienNgoai(f);
      if (!rows.length) { addToast(t("File không có dòng dữ liệu nào")); return; }
      setImportRows({ ten: f.name, rows });
    } catch (e) {
      addToast(t("Không đọc được file: ") + (e instanceof Error ? e.message : String(e)));
    }
  }
  async function taiDanhSach() {
    const all = await api.get<{ rows: KhoanTienNgoaiRow[] }>(`/quy-ktv/tien-ngoai?${new URLSearchParams({ ...Object.fromEntries(params), page: "1", pageSize: "500" })}`);
    await exportRowsToExcel(
      all.rows.map((r) => ({
        id: r.id, ngay_tao: r.ngay_tao, ktv: ten(r.email), ma_ktv: r.ma_ktv ?? "", ma_trong_file: r.ma_trong_file ?? "", so_tien: r.so_tien,
        noi_dung: r.noi_dung, ngay_chung_tu: r.ngay_chung_tu ?? "", nguon: r.nguon === "import" ? `Import ${r.ten_file ?? ""}` : r.nguon === "ktv" ? `KTV nộp ${r.ma_trong_file ?? ""}` : "Thủ công",
        trang_thai: r.trang_thai === "Da ghi" ? "Đã ghi vào quỹ" : `Đã hủy: ${r.ly_do_huy ?? ""}`, nguoi_tao: ten(r.nguoi_tao),
      })),
      "tien-ngoai-vao-quy.xlsx", "Tiền ngoài",
      { id: "ID", ngay_tao: "Ngày ghi", ktv: "KTV (chủ quỹ)", ma_ktv: "Mã KTV", ma_trong_file: "Mã trong file", so_tien: "Số tiền", noi_dung: "Nội dung",
        ngay_chung_tu: "Ngày chứng từ", nguon: "Nguồn", trang_thai: "Trạng thái", nguoi_tao: "Người ghi" },
    );
  }

  const columns: Column<KhoanTienNgoaiRow>[] = [
    { key: "ngay", header: t("Ngày ghi"), render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.ngay_tao)}</span>, mobile: "meta" },
    { key: "ktv", header: t("KTV (chủ quỹ)"), render: (r) => <span className="font-semibold">{ten(r.email)}</span>, mobile: "title" },
    { key: "ma", header: t("Mã KTV / mã trong file"), render: (r) => <span className="font-mono text-xs">{r.ma_ktv ?? "—"}{r.ma_trong_file && r.ma_trong_file !== r.ma_ktv ? ` · ${r.ma_trong_file}` : ""}</span> },
    { key: "tien", header: t("Số tiền"), className: "text-right", render: (r) => <b className={r.trang_thai === "Da huy" ? "line-through opacity-60" : ""}><Money>{fmtVND(r.so_tien)}</Money></b>, mobile: "meta" },
    { key: "nd", header: t("Nội dung"), render: (r) => <span className="block max-w-[280px] truncate" title={r.noi_dung}>{r.noi_dung}{r.ngay_chung_tu ? ` · ${r.ngay_chung_tu}` : ""}</span>, mobile: "sub" },
    { key: "nguon", header: t("Nguồn"), render: (r) => <span className="block max-w-[200px] truncate" title={r.ten_file ?? undefined}>{r.nguon === "import" ? t("Import {a}", { a: r.ten_file ?? "" }) : r.nguon === "ktv" ? t("KTV nộp {a}", { a: r.ma_trong_file ?? "" }) : t("Thủ công")}</span> },
    {
      key: "tt", header: t("Trạng thái"), mobile: "badge",
      render: (r) => r.trang_thai === "Da ghi"
        ? <Badge tone="teal">{t("Đã ghi vào quỹ")}</Badge>
        : <span title={r.ly_do_huy ?? undefined}><Badge tone="gray">{t("Đã hủy")}</Badge></span>,
    },
    { key: "nguoi", header: t("Người ghi"), render: (r) => <span className="whitespace-nowrap">{ten(r.nguoi_tao)}</span> },
    {
      key: "huy", header: "", mobileHint: "actions",
      render: (r) => r.trang_thai === "Da ghi" ? (
        <Btn size="sm" variant="ghost" disabled={huy.isPending} onClick={() => {
          const lyDo = window.prompt(t("Hủy khoản {a} của {b}? Số tiền bị trừ lại khỏi quỹ (quỹ phải còn đủ). Lý do hủy (bắt buộc):", { a: fmtVND(r.so_tien), b: ten(r.email) }))?.trim();
          if (lyDo) huy.mutate({ id: r.id, lyDo });
        }}>{t("Hủy")}</Btn>
      ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="text-[13px] text-[var(--color-text-secondary)]">
        {t("Kế toán ghi khoản tiền ngoài (vd trừ lương) vào quỹ dư của KTV — tiền tự trừ cho các phiếu đang chờ chuyển tiền và dùng cho đơn sau. Import đối chiếu theo Mã MISA hoặc Mã KTV, kiểm tra từng dòng trước khi ghi.")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Tìm mã KTV / MISA / tên / nội dung / tên file…")}
          className="o-tim focus-ring h-9 w-full rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[13px] sm:w-72" />
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">{t("Từ||ngày")}
          <input type="date" value={tu} onChange={(e) => { setTu(e.target.value); setPage(1); }} className="focus-ring h-9 rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[13px]" />
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">{t("Đến")}
          <input type="date" value={den} onChange={(e) => { setDen(e.target.value); setPage(1); }} className="focus-ring h-9 rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[13px]" />
        </label>
        <Select value={tt} onChange={(v) => { setTt(v); setPage(1); }} options={[{ value: "", label: t("Mọi trạng thái") }, { value: "Da ghi", label: t("Đã ghi vào quỹ") }, { value: "Da huy", label: t("Đã hủy") }]} />
        <Select value={nguon} onChange={(v) => { setNguon(v); setPage(1); }} options={[{ value: "", label: t("Mọi nguồn") }, { value: "import", label: t("Import") }, { value: "thu_cong", label: t("Thủ công") }, { value: "ktv", label: t("KTV tự nộp") }]} />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Btn variant="ghost" onClick={() => void taiFileMau()}>{t("⬇ File mẫu")}</Btn>
          <Btn variant="ghost" onClick={() => void taiDanhSach()}>{t("⬇ Tải danh sách")}</Btn>
          <Btn variant="subtle" onClick={() => setMoThuCong(true)}>{t("+ Thêm thủ công")}</Btn>
          <Btn onClick={() => fileRef.current?.click()}>{t("⬆ Import Excel")}</Btn>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void docFile(f); }} />
        </div>
      </div>
      <div className="text-[13px] text-[var(--color-text-body)]">
        {t("{a} khoản · tổng đã ghi {b}", { a: data?.total ?? 0, b: fmtVND(data?.tong_tien ?? 0) })}
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
        rowKey={(r) => String(r.id)}
        emptyText={t("Chưa có khoản tiền ngoài nào")}
      />
      {moThuCong && (
        <ThemThuCongModal danhBa={danhBa.data?.rows ?? []} onClose={() => setMoThuCong(false)} onDone={() => { setMoThuCong(false); lamMoi(); }} />
      )}
      {importRows && (
        <DuyetImportModal
          tenFile={importRows.ten}
          dongFile={importRows.rows}
          danhBa={danhBa.data?.rows ?? []}
          dangTaiDanhBa={danhBa.isLoading}
          onClose={() => { setImportRows(null); lamMoi(); }}
          onDone={() => { setImportRows(null); lamMoi(); }}
        />
      )}
    </div>
  );
}

// ---------- Them thu cong ----------

function ThemThuCongModal({ danhBa, onClose, onDone }: { danhBa: KtvDanhBa[]; onClose: () => void; onDone: () => void }) {
  const addToast = useToast();
  const [maKtv, setMaKtv] = useState("");
  const [soTien, setSoTien] = useState("");
  const [noiDung, setNoiDung] = useState("");
  const [ngay, setNgay] = useState("");
  const [lo] = useState(loId);
  const ktv = danhBa.find((k) => k.ma_ktv === maKtv);
  const vd = vanDeKtv(maKtv ? ktv : undefined);
  const so = docSoTien(soTien);
  const ghi = useMutation({
    mutationFn: () => api.post<{ so_dong: number; tong_tien: number }>("/quy-ktv/tien-ngoai", {
      lo_id: lo, nguon: "thu_cong",
      items: [{ email: ktv?.quy_email, ma_ktv: ktv?.ma_ktv, so_tien: so, noi_dung: noiDung.trim(), ngay_chung_tu: ngay || undefined }],
    }),
    onSuccess: (r) => { addToast(t("Đã ghi {a} vào quỹ", { a: fmtVND(r.tong_tien) })); onDone(); },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });
  const oNhap = "focus-ring w-full rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-base sm:text-sm";
  const duoc = !!ktv && vd.chan.length === 0 && so != null && so > 0 && !!noiDung.trim();
  return (
    <Modal open onClose={onClose} title={t("Thêm khoản tiền ngoài vào quỹ")}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>{t("Đóng")}</Btn>
          <Btn disabled={!duoc} loading={ghi.isPending} onClick={() => {
            if (window.confirm(t("Ghi {a} vào quỹ của {b}?", { a: fmtVND(so ?? 0), b: ktv ? tenKtv(ktv) : "" }))) ghi.mutate();
          }}>{t("Ghi vào quỹ")}</Btn>
        </div>
      }>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("KTV *")}</span>
          <Select value={maKtv} onChange={setMaKtv} className="w-full"
            options={[{ value: "", label: t("— Chọn KTV (gõ mã / tên / Mã MISA) —") }, ...danhBa.map((k) => ({ value: k.ma_ktv, label: nhanKtv(k) }))]} />
          {ktv && (
            <div className="mt-1 text-[11.5px] text-[var(--color-text-secondary)]">
              {t("Quỹ hiện tại: {a}", { a: fmtVND(ktv.so_du ?? 0) })}
              {[...vd.chan, ...vd.canh].map((m) => <div key={m} className={vd.chan.includes(m) ? "text-[var(--color-danger-strong)]" : "text-[var(--amber-700)]"}>⚠ {m}</div>)}
            </div>
          )}
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Số tiền (đ) *")}</span>
          <input inputMode="numeric" value={soTien} onChange={(e) => setSoTien(e.target.value)} placeholder="500.000" className={oNhap} />
          {so != null && so > 0 && <span className="mt-0.5 block text-[11.5px] text-[var(--color-text-secondary)]">= {fmtVND(so)}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Nội dung *")}</span>
          <input value={noiDung} onChange={(e) => setNoiDung(e.target.value)} placeholder={t("VD: Trừ lương T10/2026")} className={oNhap} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Ngày chứng từ (tuỳ chọn)")}</span>
          <input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} className={oNhap} />
        </label>
      </div>
    </Modal>
  );
}

// ---------- Doc file import ----------

export interface DongFile {
  stt: number; // so dong trong file (dong 2 = du lieu dau tien)
  maMisa: string;
  maKtv: string;
  maChung: string; // cot "Mã" chung (khong ro MISA hay KTV)
  ten: string;
  soTienRaw: string;
  noiDung: string;
  ngay: string;
}

function docSoTien(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && Number.isInteger(v) ? v : Number.isFinite(v) ? Math.round(v) : null;
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/-/.test(s)) return null;
  const so = s.replace(/[^\d]/g, "");
  return so ? Number(so) : null;
}
function docNgay(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const d = new Date(v.getTime() + 7 * 3600_000); // xlsx tra Date UTC luc 0h gio may -> quy ve ngay VN
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

export async function docFileTienNgoai(f: File): Promise<DongFile[]> {
  const XLSX = await import("xlsx");
  // CSV doc dang chuoi (UTF-8) - doc dang mang byte thi XLSX hieu la latin1, vo dau tieng Viet (khong thay cot "Số tiền").
  const wb = /\.csv$/i.test(f.name)
    ? XLSX.read((await f.text()).replace(/^﻿/, ""), { type: "string", cellDates: true })
    : XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
  if (raw.length < 2) return [];
  const header = (raw[0] ?? []).map((h) => boDau(String(h ?? "")).toLowerCase().trim());
  const tim = (dk: (h: string) => boolean) => header.findIndex(dk);
  const cMisa = tim((h) => h.includes("misa"));
  const cKtv = tim((h) => !h.includes("misa") && (h.includes("ma ktv") || h === "id" || h.includes("id ktv") || h.includes("ma nhan")));
  const cMa = tim((h) => h.startsWith("ma") && !h.includes("misa") && !h.includes("ktv"));
  const cTen = tim((h) => h.includes("ten"));
  const cTien = tim((h) => h.includes("so tien") || h === "tien" || h.includes("so tien"));
  const cTien2 = cTien >= 0 ? cTien : tim((h) => h.includes("tien"));
  const cNd = tim((h) => h.includes("noi dung") || h.includes("ghi chu") || h.includes("ly do") || h.includes("dien giai"));
  const cNgay = tim((h) => h.includes("ngay"));
  if (cMisa < 0 && cKtv < 0 && cMa < 0) throw new Error(t("không thấy cột Mã MISA / Mã KTV — dùng file mẫu"));
  if (cTien2 < 0) throw new Error(t("không thấy cột Số tiền — dùng file mẫu"));
  const lay = (r: unknown[], c: number) => (c >= 0 ? r[c] : "");
  return raw.slice(1).map((r, i) => ({
    stt: i + 2,
    maMisa: String(lay(r, cMisa) ?? "").trim(),
    maKtv: String(lay(r, cKtv) ?? "").trim(),
    maChung: String(lay(r, cMa) ?? "").trim(),
    ten: String(lay(r, cTen) ?? "").trim(),
    soTienRaw: (() => { const v = lay(r, cTien2); return typeof v === "number" ? String(v) : String(v ?? "").trim(); })(),
    noiDung: String(lay(r, cNd) ?? "").trim(),
    ngay: docNgay(lay(r, cNgay)),
  })).filter((d) => d.maMisa || d.maKtv || d.maChung || d.soTienRaw);
}

async function taiFileMau() {
  await exportRowsToExcel(
    [
      { ma_misa: "VD: KTV001", ma_ktv: "", ten: "Nguyễn Văn A", so_tien: 500000, noi_dung: "Trừ lương T10/2026", ngay: "2026-10-01" },
      { ma_misa: "", ma_ktv: "VD: anv.dvbh-hn", ten: "", so_tien: 300000, noi_dung: "Trừ lương T10/2026", ngay: "" },
    ],
    "mau-import-tien-ngoai-vao-quy.xlsx", "Tiền ngoài",
    { ma_misa: "Mã MISA", ma_ktv: "Mã KTV", ten: "Tên KTV (để đối chiếu)", so_tien: "Số tiền", noi_dung: "Nội dung", ngay: "Ngày chứng từ" },
  );
}

// ---------- Man kiem tra truoc khi import ----------

type CachKhop = "ma_misa" | "ma_ktv" | "chon_tay" | null;
interface DongDuyet extends DongFile {
  maKtvChon: string; // ma_ktv dang gan ("" = chua khop)
  cach: CachKhop;
  nhieuKhop: boolean; // ma trong file khop > 1 KTV -> bat chon tay
  soTien: number | null;
  chon: boolean;
}

function khopDong(d: DongFile, danhBa: KtvDanhBa[]): { ma: string; cach: CachKhop; nhieu: boolean } {
  const theoMisa = (ma: string) => danhBa.filter((k) => k.ma_misa && chuan(k.ma_misa) === chuan(ma));
  const theoKtv = (ma: string) => danhBa.filter((k) => chuan(k.ma_ktv) === chuan(ma));
  const thu: [string, "ma_misa" | "ma_ktv"][] = [];
  if (d.maMisa) thu.push([d.maMisa, "ma_misa"]);
  if (d.maKtv) thu.push([d.maKtv, "ma_ktv"]);
  if (d.maChung) { thu.push([d.maChung, "ma_misa"]); thu.push([d.maChung, "ma_ktv"]); }
  for (const [ma, cach] of thu) {
    const ds = cach === "ma_misa" ? theoMisa(ma) : theoKtv(ma);
    // Nhieu ma KTV cung Ma MISA: uu tien ma dang bat + co Gmail.
    const tot = ds.filter((k) => !k.ngung && k.quy_email);
    if (tot.length === 1) return { ma: tot[0].ma_ktv, cach, nhieu: false };
    if (ds.length === 1) return { ma: ds[0].ma_ktv, cach, nhieu: false };
    if (ds.length > 1) return { ma: "", cach: null, nhieu: true };
  }
  return { ma: "", cach: null, nhieu: false };
}

const NHAN_CACH: Record<string, { label: string; tone: BadgeTone }> = {
  ma_misa: { label: "Khớp Mã MISA", tone: "teal" },
  ma_ktv: { label: "Khớp Mã KTV", tone: "ocean" },
  chon_tay: { label: "Chọn tay", tone: "violet" },
};

type LocDuyet = "tat_ca" | "san_sang" | "canh_bao" | "loi" | "bo_chon";

function DuyetImportModal({ tenFile, dongFile, danhBa, dangTaiDanhBa, onClose, onDone }: {
  tenFile: string;
  dongFile: DongFile[];
  danhBa: KtvDanhBa[];
  dangTaiDanhBa: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const addToast = useToast();
  const [noiDungChung, setNoiDungChung] = useState("");
  const [dong, setDong] = useState<DongDuyet[] | null>(null);
  // Doi chieu 1 lan khi danh ba tai xong (sau do nguoi dung tu sua).
  if (!dong && !dangTaiDanhBa && danhBa.length) {
    setDong(dongFile.map((d) => {
      const k = khopDong(d, danhBa);
      return { ...d, maKtvChon: k.ma, cach: k.cach, nhieuKhop: k.nhieu, soTien: docSoTien(d.soTienRaw), chon: true };
    }));
  }
  const [loc, setLoc] = useState<LocDuyet>("tat_ca");
  const [tim, setTim] = useState("");
  const [khuVuc, setKhuVuc] = useState("");
  const [dangGui, setDangGui] = useState(false);
  const [daGui, setDaGui] = useState<Set<number>>(new Set()); // stt dong da ghi thanh cong (lo truoc khi loi)
  const theoMa = useMemo(() => new Map(danhBa.map((k) => [k.ma_ktv, k])), [danhBa]);
  const ktvOptions = useMemo(() => [{ value: "", label: t("— Chưa khớp: chọn KTV —") }, ...danhBa.map((k) => ({ value: k.ma_ktv, label: nhanKtv(k) }))], [danhBa]);

  const ds = dong ?? [];
  const demKtv = new Map<string, number>();
  for (const d of ds) if (d.chon && d.maKtvChon) demKtv.set(d.maKtvChon, (demKtv.get(d.maKtvChon) ?? 0) + 1);
  const danhGia = (d: DongDuyet) => {
    const k = d.maKtvChon ? theoMa.get(d.maKtvChon) : undefined;
    const vd = vanDeKtv(k);
    const chan = [...vd.chan];
    const canh = [...vd.canh];
    if (d.nhieuKhop && !d.maKtvChon) chan.splice(0, chan.length, t("Mã khớp nhiều KTV — chọn đúng KTV"));
    if (d.soTien == null || d.soTien <= 0) chan.push(t("Số tiền không hợp lệ"));
    if (!(d.noiDung || noiDungChung.trim())) chan.push(t("Thiếu nội dung"));
    if (d.maKtvChon && (demKtv.get(d.maKtvChon) ?? 0) > 1) canh.push(t("KTV xuất hiện nhiều dòng trong file"));
    if (k && d.ten && !khopTim(`${tenKtv(k)} ${k.ten_misa ?? ""} ${k.ten_hien_thi ?? ""}`, d.ten) && !khopTim(d.ten, tenKtv(k))) canh.push(t("Tên trong file khác tên KTV"));
    if (d.cach === "chon_tay") canh.push(t("KTV chọn tay — kiểm tra lại"));
    return { k, chan, canh };
  };
  const dsDanhGia = ds.map((d) => ({ d, ...danhGia(d) }));
  const nhom = (x: (typeof dsDanhGia)[number]): LocDuyet => (daGui.has(x.d.stt) ? "san_sang" : !x.d.chon ? "bo_chon" : x.chan.length ? "loi" : x.canh.length ? "canh_bao" : "san_sang");
  const dem: Record<LocDuyet, number> = { tat_ca: ds.length, san_sang: 0, canh_bao: 0, loi: 0, bo_chon: 0 };
  for (const x of dsDanhGia) dem[nhom(x)]++;
  const khuVucOptions = [...new Set(danhBa.map((k) => k.khu_vuc_ma).filter(Boolean) as string[])].sort();
  const hien = dsDanhGia.filter((x) => {
    if (loc !== "tat_ca" && nhom(x) !== loc) return false;
    if (khuVuc && x.k?.khu_vuc_ma !== khuVuc) return false;
    if (tim.trim()) {
      const chuoi = [x.d.maMisa, x.d.maKtv, x.d.maChung, x.d.ten, x.d.noiDung, x.k?.ma_ktv, x.k ? tenKtv(x.k) : "", x.k?.ma_misa].join(" ");
      if (!khopTim(chuoi, tim.trim())) return false;
    }
    return true;
  });
  const sapGui = dsDanhGia.filter((x) => x.d.chon && !daGui.has(x.d.stt));
  const coLoi = sapGui.some((x) => x.chan.length > 0);
  const tongTien = sapGui.reduce((s, x) => s + (x.d.soTien ?? 0), 0);
  const soKtv = new Set(sapGui.map((x) => x.d.maKtvChon).filter(Boolean)).size;

  const sua = (stt: number, p: Partial<DongDuyet>) => setDong((cu) => (cu ?? []).map((d) => (d.stt === stt ? { ...d, ...p } : d)));

  async function gui() {
    if (coLoi || !sapGui.length) return;
    if (!window.confirm(t("Ghi {a} dòng · {b} KTV · tổng {c} vào quỹ? Kiểm tra kỹ — tiền vào quỹ sẽ tự trừ cho phiếu đang chờ chuyển tiền.", { a: sapGui.length, b: soKtv, c: fmtVND(tongTien) }))) return;
    setDangGui(true);
    const goc = loId();
    let xong = 0;
    try {
      for (let i = 0; i < sapGui.length; i += LO_TOI_DA) {
        const lo = sapGui.slice(i, i + LO_TOI_DA);
        await api.post("/quy-ktv/tien-ngoai", {
          lo_id: `${goc}-${i / LO_TOI_DA}`, nguon: "import", ten_file: tenFile,
          items: lo.map((x) => ({
            email: x.k!.quy_email, ma_ktv: x.k!.ma_ktv, ma_trong_file: x.d.maMisa || x.d.maKtv || x.d.maChung || undefined,
            so_tien: x.d.soTien, noi_dung: x.d.noiDung || noiDungChung.trim(), ngay_chung_tu: x.d.ngay || undefined,
          })),
        });
        xong += lo.length;
        setDaGui((cu) => new Set([...cu, ...lo.map((x) => x.d.stt)]));
      }
      addToast(t("Đã ghi {a} dòng · tổng {b} vào quỹ", { a: xong, b: fmtVND(tongTien) }));
      onDone();
    } catch (err) {
      addToast(t("Dừng ở lô lỗi — đã ghi {a}/{b} dòng (các dòng đã ghi được đánh dấu, KHÔNG gửi lại). Lỗi: ", { a: xong, b: sapGui.length }) + describeApiError(err));
    } finally {
      setDangGui(false);
    }
  }

  const LOC: { v: LocDuyet; label: string }[] = [
    { v: "tat_ca", label: "Tất cả" },
    { v: "san_sang", label: "Sẵn sàng" },
    { v: "canh_bao", label: "Cần kiểm tra" },
    { v: "loi", label: "Lỗi — phải sửa" },
    { v: "bo_chon", label: "Đã bỏ chọn" },
  ];
  const oNhap = "focus-ring h-9 rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[13px]";

  return (
    <Modal open onClose={dangGui ? () => undefined : onClose} title={t("Kiểm tra trước khi import — {a}", { a: tenFile })} width="max-w-7xl"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[13px] text-[var(--color-text-body)]">
            {t("Sẽ ghi {a} dòng · {b} KTV · tổng", { a: sapGui.length, b: soKtv })} <b><Money>{fmtVND(tongTien)}</Money></b>
            {daGui.size > 0 && <span className="ml-2 text-[var(--color-success)]">{t("(đã ghi {a} dòng)", { a: daGui.size })}</span>}
            {coLoi && <span className="ml-2 text-[var(--color-danger-strong)]">{t("— còn dòng lỗi đang chọn: sửa hoặc bỏ chọn")}</span>}
          </div>
          <div className="ml-auto flex gap-2">
            <Btn variant="ghost" onClick={onClose} disabled={dangGui}>{t("Đóng")}</Btn>
            <Btn onClick={() => void gui()} disabled={coLoi || !sapGui.length} loading={dangGui}>{t("Xác nhận import {a} dòng", { a: sapGui.length })}</Btn>
          </div>
        </div>
      }>
      {!dong ? (
        <div className="py-6 text-center text-sm text-[var(--color-text-secondary)]">{t("Đang tải danh bạ KTV để đối chiếu…")}</div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {LOC.map((l) => (
              <button key={l.v} type="button" onClick={() => setLoc(l.v)} className={`filter-tab ${loc === l.v ? "active" : ""}`}>
                {t(l.label)} <span className="tabular opacity-70">({dem[l.v]})</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={tim} onChange={(e) => setTim(e.target.value)} placeholder={t("Tìm mã / tên / nội dung…")} className={`o-tim ${oNhap} w-full sm:w-64`} />
            <Select value={khuVuc} onChange={setKhuVuc} options={[{ value: "", label: t("Mọi khu vực") }, ...khuVucOptions.map((k) => ({ value: k, label: k }))]} />
            <input value={noiDungChung} onChange={(e) => setNoiDungChung(e.target.value)} placeholder={t("Nội dung chung cho dòng trống (vd Trừ lương T10/2026)")} className={`${oNhap} w-full sm:w-80`} />
            <Btn size="sm" variant="ghost" onClick={() => setDong((cu) => (cu ?? []).map((d) => (hien.some((x) => x.d.stt === d.stt) && !daGui.has(d.stt) ? { ...d, chon: true } : d)))}>{t("Chọn các dòng đang lọc")}</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setDong((cu) => (cu ?? []).map((d) => (hien.some((x) => x.d.stt === d.stt) && !daGui.has(d.stt) ? { ...d, chon: false } : d)))}>{t("Bỏ chọn các dòng đang lọc")}</Btn>
          </div>
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--color-border)]">
            <table className="tbl w-full">
              <thead className="tbl-head sticky top-0 z-10">
                <tr>
                  <th className="w-8"></th>
                  <th>{t("Dòng")}</th>
                  <th>{t("Mã trong file")}</th>
                  <th>{t("Tên trong file")}</th>
                  <th className="min-w-[340px]">{t("KTV sẽ ghi quỹ")}</th>
                  <th>{t("Cách khớp")}</th>
                  <th className="text-right">{t("Số tiền")}</th>
                  <th>{t("Nội dung")}</th>
                  <th>{t("Kiểm tra")}</th>
                </tr>
              </thead>
              <tbody>
                {hien.map((x) => {
                  const da = daGui.has(x.d.stt);
                  const n = x.d.cach ? NHAN_CACH[x.d.cach] : null;
                  return (
                    <tr key={x.d.stt} className={da || !x.d.chon ? "opacity-55" : ""}>
                      <td><input type="checkbox" checked={da || x.d.chon} disabled={da || dangGui} onChange={(e) => sua(x.d.stt, { chon: e.target.checked })} /></td>
                      <td className="tabular text-xs">{x.d.stt}</td>
                      <td className="font-mono text-xs whitespace-nowrap">
                        {x.d.maMisa && <div>MISA: {x.d.maMisa}</div>}
                        {x.d.maKtv && <div>KTV: {x.d.maKtv}</div>}
                        {x.d.maChung && <div>{x.d.maChung}</div>}
                      </td>
                      <td className="text-xs"><span className="block max-w-[160px] truncate" title={x.d.ten}>{x.d.ten || "—"}</span></td>
                      <td>
                        {da ? (
                          <span className="text-xs">{x.k ? nhanKtv(x.k) : ""}</span>
                        ) : (
                          <Select value={x.d.maKtvChon} className="w-full" options={ktvOptions}
                            onChange={(v) => sua(x.d.stt, { maKtvChon: v, cach: v ? "chon_tay" : null })} />
                        )}
                        {x.k && <div className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">{t("Quỹ hiện tại: {a}", { a: fmtVND(x.k.so_du ?? 0) })}</div>}
                      </td>
                      <td>{n ? <Badge tone={n.tone}>{t(n.label)}</Badge> : <Badge tone="coral">{t("Chưa khớp")}</Badge>}</td>
                      <td className="text-right">
                        {da ? <Money>{fmtVND(x.d.soTien ?? 0)}</Money> : (
                          <input inputMode="numeric" defaultValue={x.d.soTien != null ? String(x.d.soTien) : x.d.soTienRaw}
                            onBlur={(e) => sua(x.d.stt, { soTien: docSoTien(e.target.value) })}
                            className="focus-ring h-8 w-28 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-right text-[13px] tabular" />
                        )}
                        {x.d.soTien != null && <div className="text-[11px] text-[var(--color-text-secondary)]">{fmtVND(x.d.soTien)}</div>}
                      </td>
                      <td className="text-xs">
                        <span className="block max-w-[220px] truncate" title={x.d.noiDung || noiDungChung}>
                          {x.d.noiDung || (noiDungChung ? <i>{noiDungChung}</i> : "—")}{x.d.ngay ? ` · ${x.d.ngay}` : ""}
                        </span>
                      </td>
                      <td className="text-[11.5px]">
                        {da ? <span className="text-[var(--color-success)]">✓ {t("Đã ghi")}</span> : (
                          <>
                            {x.chan.map((m) => <div key={m} className="text-[var(--color-danger-strong)] whitespace-nowrap">✕ {m}</div>)}
                            {x.canh.map((m) => <div key={m} className="text-[var(--amber-700)] whitespace-nowrap">⚠ {m}</div>)}
                            {!x.chan.length && !x.canh.length && <span className="text-[var(--color-success)]">✓ {t("OK")}</span>}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!hien.length && (
                  <tr><td colSpan={9} className="py-6 text-center text-sm text-[var(--color-text-secondary)]">{t("Không có dòng nào ở mục đang lọc")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
