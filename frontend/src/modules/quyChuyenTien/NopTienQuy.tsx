import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../../components/ui/Btn";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { FileButton } from "../../components/ui/FileButton";
import { KvRow } from "../../components/ui/KvRow";
import { Modal } from "../../components/ui/Modal";
import { Money } from "../../components/ui/Money";
import { PaginatedTable, type Column } from "../../components/ui/PaginatedTable";
import { Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/Toast";
import { fmtDateTime, fmtVND } from "../../types";
import { anhVuaGioiHan } from "../../lib/imageCompress";
import { ghiNhoAnhCucBo } from "../../lib/docTienAnh";
import { baoLoiTaiAnh, canhBaoHanMucAnh, type HanMucAnh } from "../../lib/hanMucAnh";
import { describeApiError } from "../datMuaLinhKien/helpers";
import { AnhThumb, BangChungAnhList } from "../datMuaLinhKien/BangChungChuyenTien";
import { TienDocTuAnh, docDsAnh, docTienDocMap, useDocTienAnh, type TienDocMap } from "../datMuaLinhKien/DocTienAnh";
import { XemAnhNhanh, type AnhXem } from "../datMuaLinhKien/XemAnhNhanh";
import { t, dichSau } from "../../i18n";

// KTV TỰ NỘP TIỀN VÀO QUỸ (chot 2026-10-30, phuong an A - backend lib/nopTienQuy.ts, migration 0104). KTV (chu yeu tren dien thoai)
// chup / chon anh chuyen khoan -> app tu doc so tien (sua duoc) -> gui -> Ke toan doi chieu sao ke, duyet voi so THUC NHAN (thanh 1 khoan
// "Tiền ngoài vào quỹ", tu tru phieu dang cho chuyen tien) hoac tu choi (bat buoc ly do). Nut thao tac theo `hanh_dong` backend tra ve.

type TrangThai = "Cho ke toan" | "Da duyet" | "Tu choi" | "Da huy";
type HanhDong = "duyet" | "tu_choi" | "huy";
export interface NopTienRow {
  id: number;
  email: string;
  nguoi_gui: string;
  so_tien: number;
  anh: string | null;
  tien_doc_anh: string | null;
  ghi_chu: string | null;
  ngay_chuyen: string | null;
  trang_thai: TrangThai;
  so_tien_thuc_nhan: number | null;
  nguoi_xu_ly: string | null;
  xu_ly_luc: string | null;
  ly_do: string | null;
  ngay_tao: string;
  so_du_hien_tai: number | null;
  khoan_trang_thai: string | null;
  trung: string | null;
  hanh_dong: HanhDong[];
}

const TT: Record<TrangThai, { label: string; tone: BadgeTone }> = {
  "Cho ke toan": { label: dichSau("Chờ Kế toán xác nhận"), tone: "amber" },
  "Da duyet": { label: dichSau("Đã vào quỹ"), tone: "teal" },
  "Tu choi": { label: dichSau("Kế toán từ chối"), tone: "coral" },
  "Da huy": { label: dichSau("Đã hủy"), tone: "gray" },
};
const LOC: { v: string; label: string }[] = [
  { v: "Cho ke toan", label: dichSau("Chờ Kế toán") },
  { v: "Da duyet", label: dichSau("Đã vào quỹ") },
  { v: "Tu choi", label: dichSau("Từ chối") },
  { v: "Da huy", label: dichSau("Đã hủy") },
  { v: "", label: dichSau("Tất cả") },
];
const MAX_ANH = 5;
const ma = (id: number) => `NTQ-${id}`;
const nhanO = "text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]";
const oNhap = "focus-ring mt-1 w-full rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-base sm:text-sm";

export function NtBadge({ tt }: { tt: TrangThai }) {
  return <Badge tone={TT[tt]?.tone ?? "gray"}>{t(TT[tt]?.label ?? tt)}</Badge>;
}

// Anh chuyen khoan cua 1 yeu cau -> muc cho trinh "Xem ảnh nhanh" dung chung (XemAnhNhanh.tsx, 2026-10-31 - "sử dụng modul xem ảnh, đọc ảnh sẵn có ...
// tương tự các phần có ảnh chuyển khoản cũng tái sử dụng modul sẵn có này"): anh trai + khoi "Đối soát tiền" (OCR tung anh, tong OCR so voi
// so Ke toan xac nhan / so KTV khai). `soSanh` truyen rieng khi Ke toan dang nhap so thuc nhan (doi soat theo so dang go).
export function anhXemNopTien(r: NopTienRow, ten: (e: string | null | undefined) => string, soSanh?: { nhan: string; giaTri: number } | null): AnhXem[] {
  const urls = docDsAnh(r.anh);
  const tienDoc: TienDocMap = docTienDocMap(r.tien_doc_anh);
  const ss = soSanh !== undefined ? soSanh : r.so_tien_thuc_nhan != null
    ? { nhan: t("Kế toán xác nhận"), giaTri: r.so_tien_thuc_nhan }
    : { nhan: t("Số tiền khai"), giaTri: r.so_tien };
  return urls.map((url, i) => ({
    url,
    tieuDe: ma(r.id),
    phu: t("Ảnh {a}/{b} · Nộp tiền vào quỹ", { a: i + 1, b: urls.length }),
    trangThai: <NtBadge tt={r.trang_thai} />,
    urlsNhom: urls,
    urlsTinh: urls,
    tienDoc,
    tien: [
      { nhan: t("Số tiền khai"), giaTri: fmtVND(r.so_tien) },
      ...(r.so_tien_thuc_nhan != null ? [{ nhan: t("Kế toán xác nhận"), giaTri: fmtVND(r.so_tien_thuc_nhan) }] : []),
    ],
    soSanh: ss,
    chungTu: [
      { nhan: t("Người nộp"), giaTri: ten(r.nguoi_gui) || r.nguoi_gui },
      ...(r.email !== r.nguoi_gui ? [{ nhan: t("Quỹ của"), giaTri: ten(r.email) || r.email }] : []),
      ...(r.ngay_chuyen ? [{ nhan: t("Ngày chuyển"), giaTri: r.ngay_chuyen }] : []),
      { nhan: t("Gửi lúc"), giaTri: fmtDateTime(r.ngay_tao) },
      ...(r.nguoi_xu_ly ? [{ nhan: t("Xử lý"), giaTri: `${ten(r.nguoi_xu_ly)} · ${fmtDateTime(r.xu_ly_luc)}` }] : []),
    ],
    ghiChu: [
      ...(r.ghi_chu ? [{ nhan: t("Ghi chú"), giaTri: r.ghi_chu }] : []),
      ...(r.ly_do ? [{ nhan: r.trang_thai === "Tu choi" ? t("Lý do từ chối") : t("Ghi chú Kế toán"), giaTri: r.ly_do }] : []),
      ...(r.trung ? [{ nhan: t("Trùng số tiền"), giaTri: r.trung }] : []),
    ],
  }));
}

export function lamMoiNopTien(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ["quy-ktv-nop-tien", "quy-ktv-tong-quan", "quy-ktv-giao-dich", "quy-ktv-khoan", "notifications-count"]) void qc.invalidateQueries({ queryKey: [k] });
}

export function NopTienTab({ xemNhieuNguoi, nguoiOptions, ten, moId, moForm }: {
  xemNhieuNguoi: boolean;
  nguoiOptions: { value: string; label: string }[];
  ten: (e: string | null | undefined) => string;
  moId: { id: string; nonce: number } | null; // chuong / link push
  moForm?: number; // nonce: mo form nop tien (nut ngoai tab)
}) {
  const [loc, setLoc] = useState(xemNhieuNguoi ? "Cho ke toan" : "");
  const [emailLoc, setEmailLoc] = useState("");
  const [page, setPage] = useState(1);
  const [chiTiet, setChiTiet] = useState<number | null>(null);
  const [form, setForm] = useState(false);
  useEffect(() => {
    if (moId?.id) setChiTiet(Number(moId.id));
  }, [moId]);
  useEffect(() => {
    if (moForm) setForm(true);
  }, [moForm]);
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (loc) params.set("trang_thai", loc);
  if (emailLoc) params.set("email", emailLoc);
  const qs = params.toString();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["quy-ktv-nop-tien", qs],
    queryFn: () => api.get<{ rows: NopTienRow[]; total: number; dem: Record<string, number>; coTheGui: boolean }>(`/quy-ktv/nop-tien?${qs}`),
    refetchInterval: 60_000,
  });
  const rows = data?.rows ?? [];
  // "Xem ảnh nhanh" cot Anh: chuyen anh chay xuyen MOI yeu cau tren trang dang xem (giong Quỹ › Khoản chuyển tiền).
  const [xemAnh, setXemAnh] = useState<number | null>(null);
  const { anhDs, batDauAnh } = useMemo(() => {
    const ds: AnhXem[] = [];
    const batDau = new Map<number, number>();
    for (const r of rows) {
      batDau.set(r.id, ds.length);
      ds.push(...anhXemNopTien(r, ten));
    }
    return { anhDs: ds, batDauAnh: batDau };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const columns: Column<NopTienRow>[] = [
    { key: "id", header: t("Mã"), render: (r) => <span className="code-link font-mono">{ma(r.id)}</span>, mobile: "title" },
    ...(xemNhieuNguoi ? [{ key: "nguoi", header: t("Người nộp"), render: (r: NopTienRow) => <span className="font-semibold">{ten(r.nguoi_gui)}</span>, mobile: "sub" as const }] : []),
    {
      key: "tien", header: t("Số tiền"), className: "text-right", mobile: "meta",
      render: (r) => (
        <span className="whitespace-nowrap">
          <b><Money>{fmtVND(r.so_tien_thuc_nhan ?? r.so_tien)}</Money></b>
          {r.so_tien_thuc_nhan != null && r.so_tien_thuc_nhan !== r.so_tien && (
            <span className="ml-1 text-[11px] text-[var(--color-text-secondary)]">({t("khai")} <Money>{fmtVND(r.so_tien)}</Money>)</span>
          )}
        </span>
      ),
    },
    { key: "anh", header: t("Ảnh"), render: (r) => <span onClick={(e) => e.stopPropagation()}><BangChungAnhList urls={docDsAnh(r.anh)} nho onXem={(i) => setXemAnh((batDauAnh.get(r.id) ?? 0) + i)} /></span> },
    {
      key: "tt", header: t("Trạng thái"), mobile: "badge",
      render: (r) => (
        <span className="inline-flex items-center gap-1">
          <NtBadge tt={r.trang_thai} />
          {r.trung && <span title={t("Trùng số tiền: {a}", { a: r.trung })} className="text-[var(--color-warning-strong)]">⚠</span>}
          {r.khoan_trang_thai === "Da huy" && <Badge tone="gray">{t("Khoản đã hủy")}</Badge>}
        </span>
      ),
    },
    { key: "gc", header: t("Ghi chú"), render: (r) => (r.ly_do ?? r.ghi_chu ? <span className="block max-w-[260px] truncate" title={r.ly_do ?? r.ghi_chu ?? ""}>{r.ly_do ?? r.ghi_chu}</span> : <span className="text-[var(--color-text-faint)]">—</span>) },
    { key: "ngay", header: t("Gửi lúc"), render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.ngay_tao)}</span>, mobile: "meta" },
    { key: "can", header: "", mobileHint: "actions", render: (r) => (r.hanh_dong.length ? <Btn size="sm" variant="subtle" onClick={() => setChiTiet(r.id)}>{t("Xử lý")}</Btn> : null) },
  ];
  return (
    <div className="space-y-3">
      <div className="text-[13px] text-[var(--color-text-secondary)]">
        {xemNhieuNguoi
          ? t("KTV tự nộp tiền vào quỹ kèm ảnh chuyển khoản. Kế toán đối chiếu sao kê rồi xác nhận số thực nhận — tiền vào quỹ và tự trừ cho phiếu đang chờ chuyển tiền.")
          : t("Chuyển khoản cho công ty rồi gửi ảnh ở đây — Kế toán xác nhận xong, tiền vào quỹ của bạn và tự trừ cho phiếu cần chuyển tiền.")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {LOC.map((l) => (
            <button key={l.v} type="button" onClick={() => { setLoc(l.v); setPage(1); }} className={`filter-tab ${loc === l.v ? "active" : ""}`}>
              {t(l.label)} <span className="tabular opacity-70">({data?.dem?.[l.v] ?? 0})</span>
            </button>
          ))}
        </div>
        {xemNhieuNguoi && <Select value={emailLoc} onChange={(v) => { setEmailLoc(v); setPage(1); }} options={nguoiOptions} className="w-full sm:w-60" />}
        {data?.coTheGui && <Btn className="sm:ml-auto" onClick={() => setForm(true)}>{t("＋ Nộp tiền vào quỹ")}</Btn>}
      </div>
      <PaginatedTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        page={page}
        pageSize={20}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onRowClick={(r) => setChiTiet(r.id)}
        rowKey={(r) => String(r.id)}
        emptyText={t("Chưa có yêu cầu nộp tiền")}
      />
      {form && <NopTienForm onClose={() => setForm(false)} />}
      {xemAnh != null && <XemAnhNhanh items={anhDs} batDau={xemAnh} onClose={() => setXemAnh(null)} />}
      {chiTiet != null && <NopTienChiTiet id={chiTiet} row={rows.find((r) => r.id === chiTiet)} ten={ten} onClose={() => setChiTiet(null)} />}
    </div>
  );
}

/** Form KTV nop tien (dung tot tren dien thoai): anh truoc -> so tien tu doc -> ghi chu -> Gui. */
export function NopTienForm({ onClose }: { onClose: () => void }) {
  const addToast = useToast();
  const qc = useQueryClient();
  const [anh, setAnh] = useState<string[]>([]);
  const [dangTai, setDangTai] = useState(0);
  const [soTien, setSoTien] = useState("");
  const [goTay, setGoTay] = useState(false);
  const [ghiChu, setGhiChu] = useState("");
  // Ngay chuyen mac dinh = HOM NAY gio VN (2026-10-30, "ngày chuyển mặc định = hôm nay"), sua duoc.
  const homNay = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const [ngay, setNgay] = useState(homNay);
  const doc = useDocTienAnh(anh, {});
  const tuDoc = !goTay && doc.xongHet && doc.tong > 0 && soTien === String(doc.tong);
  // Tu dien so tien = tong doc duoc tu anh (khi nguoi dung chua tu go).
  useEffect(() => {
    if (!goTay && doc.xongHet && doc.tong > 0) setSoTien(String(doc.tong));
  }, [goTay, doc.xongHet, doc.tong]);
  const so = Number(soTien);
  const hopLe = anh.length > 0 && Number.isInteger(so) && so > 0 && dangTai === 0;
  // Xem lai anh vua tai bang trinh xem dung chung (doi soat OCR tung anh voi so dang nhap).
  const [xemAnh, setXemAnh] = useState<number | null>(null);
  const anhXem: AnhXem[] = anh.map((url, i) => ({
    url, tieuDe: t("Nộp tiền vào quỹ"), phu: t("Ảnh {a}/{b}", { a: i + 1, b: anh.length }), urlsNhom: anh, urlsTinh: anh, tienDoc: doc.ketQua,
    tien: [], soSanh: hopLe ? { nhan: t("Số tiền nộp"), giaTri: so } : null, chungTu: ngay ? [{ nhan: t("Ngày chuyển"), giaTri: ngay }] : [], ghiChu: [],
  }));

  async function taiAnh(files: File[]) {
    const chon = files.slice(0, Math.max(0, MAX_ANH - anh.length));
    if (files.length > chon.length) addToast(t("Tối đa {a} ảnh", { a: MAX_ANH }));
    for (const f of chon) {
      setDangTai((n) => n + 1);
      try {
        const gui = await anhVuaGioiHan(f);
        const res = await api.postBinary<{ ok: true; url: string; han_muc_anh?: HanMucAnh | null }>("/quy-ktv/nop-tien/anh", await gui.arrayBuffer(), gui.type || "image/jpeg");
        canhBaoHanMucAnh(res.han_muc_anh, addToast);
        ghiNhoAnhCucBo(res.url, f);
        setAnh((a) => (a.includes(res.url) || a.length >= MAX_ANH ? a : [...a, res.url]));
      } catch (err) {
        baoLoiTaiAnh(err, addToast, describeApiError);
      } finally {
        setDangTai((n) => n - 1);
      }
    }
  }

  const gui = useMutation({
    mutationFn: () =>
      api.post<{ ok: true; id: number }>("/quy-ktv/nop-tien", {
        so_tien: so, anh, tien_doc_anh: doc.ketQua, ghi_chu: ghiChu.trim() || undefined, ngay_chuyen: ngay || undefined,
      }),
    onSuccess: (r) => {
      addToast(t("Đã gửi {a} — chờ Kế toán xác nhận", { a: ma(r.id) }));
      lamMoiNopTien(qc);
      onClose();
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t("Nộp tiền vào quỹ")}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose} disabled={gui.isPending}>{t("Hủy")}</Btn>
          <Btn onClick={() => gui.mutate()} disabled={!hopLe || gui.isPending} loading={gui.isPending}>{t("Gửi Kế toán xác nhận")}</Btn>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <div className={nhanO}>{t("1. Ảnh chuyển khoản")} *</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {anh.map((u, i) => (
              <AnhThumb key={u} url={u} stt={i + 1} onXem={() => setXemAnh(i)} onXoa={() => setAnh((a) => a.filter((x) => x !== u))} />
            ))}
            {anh.length < MAX_ANH && (
              <FileButton accept="image/*" multiple variant={anh.length ? "subtle" : "primary"} disabled={dangTai > 0} onFilesSelected={(fs) => void taiAnh(fs)}>
                {dangTai > 0 ? t("Đang tải...") : anh.length === 0 ? t("📷 Chụp / chọn ảnh") : t("+ Thêm ảnh")}
              </FileButton>
            )}
          </div>
          {anh.length > 0 && <div className="mt-1.5"><TienDocTuAnh doc={doc} soSoSanh={hopLe ? so : null} nhan={t("số tiền nộp")} sttCua={(u) => anh.indexOf(u) + 1} /></div>}
        </div>
        <label className="block">
          <span className={nhanO}>{t("2. Số tiền đã chuyển")} *</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={soTien}
            onChange={(e) => { setSoTien(e.target.value); setGoTay(true); }}
            placeholder={
              anh.length === 0 ? t("Chụp ảnh — số tiền tự đọc từ ảnh") : !doc.xongHet ? t("Đang đọc số tiền từ ảnh…") : t("Không đọc được — nhập số tiền")
            }
            className={oNhap}
          />
          {so > 0 && (
            <span className="mt-0.5 block text-[12px] text-[var(--color-text-secondary)]">
              <Money>{fmtVND(so)}</Money>
              {tuDoc && <span className="ml-1.5 text-[var(--color-success-strong)]">· {t("tự đọc từ ảnh, sửa nếu sai")}</span>}
            </span>
          )}
          {anh.length > 0 && !doc.xongHet && dangTai === 0 && !goTay && (
            <span className="mt-0.5 block text-[12px] text-[var(--color-text-secondary)]">{t("Đang đọc số tiền từ ảnh…")}</span>
          )}
        </label>
        <label className="block">
          <span className={nhanO}>{t("Ngày chuyển")}</span>
          <input type="date" value={ngay} max={homNay} onChange={(e) => setNgay(e.target.value)} className={oNhap} />
        </label>
        <label className="block">
          <span className={nhanO}>{t("Ghi chú")}</span>
          <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2} maxLength={500} className={oNhap} placeholder={t("VD: nộp trước cho đơn tuần này")} />
        </label>
        <div className="rounded-lg bg-[var(--color-info-soft)] px-2.5 py-1.5 text-[12px] text-[var(--color-text)]">
          {t("Tiền chỉ vào quỹ sau khi Kế toán đối chiếu sao kê và xác nhận. Bạn sẽ nhận thông báo kết quả.")}
        </div>
      </div>
      {xemAnh != null && anhXem.length > 0 && <XemAnhNhanh items={anhXem} batDau={xemAnh} onClose={() => setXemAnh(null)} />}
    </Modal>
  );
}

export function NopTienChiTiet({ id, row, ten, onClose }: { id: number; row?: NopTienRow; ten: (e: string | null | undefined) => string; onClose: () => void }) {
  const addToast = useToast();
  const qc = useQueryClient();
  // Mo tu chuong / link push khi dong khong nam trong trang dang xem -> tai rieng (loc theo trang thai rong, tim dung id).
  const { data } = useQuery({
    queryKey: ["quy-ktv-nop-tien", "ct", id],
    queryFn: () => api.get<{ rows: NopTienRow[] }>(`/quy-ktv/nop-tien?pageSize=200`),
    enabled: !row,
  });
  const r = row ?? data?.rows.find((x) => x.id === id);
  const urls = docDsAnh(r?.anh ?? null);
  const doc = useDocTienAnh(urls, docTienDocMap(r?.tien_doc_anh));
  const [thucNhan, setThucNhan] = useState("");
  const [goTay, setGoTay] = useState(false);
  const [lyDo, setLyDo] = useState("");
  const [xacNhan, setXacNhan] = useState(false);
  const [xemAnh, setXemAnh] = useState<number | null>(null);
  // So thuc nhan tu dien (2026-10-31, "điền giá trị đã đọc được"): doc DU moi anh -> tong OCR; chua doc xong / co anh khong doc duoc -> so KTV
  // khai. Ke toan go tay thi giu so da go.
  const ocrDu = doc.docDuHet && doc.tong > 0;
  useEffect(() => {
    if (!r || goTay) return;
    setThucNhan(String(ocrDu ? doc.tong : r.so_tien));
  }, [r, goTay, ocrDu, doc.tong]);
  const xuLy = useMutation({
    mutationFn: (hd: HanhDong) => api.post(`/quy-ktv/nop-tien/${id}/xu-ly`, { hanh_dong: hd, so_tien_thuc_nhan: Number(thucNhan), ly_do: lyDo.trim() || undefined }),
    onSuccess: (_d, hd) => {
      addToast(hd === "duyet" ? t("Đã xác nhận — tiền đã vào quỹ") : hd === "tu_choi" ? t("Đã từ chối") : t("Đã hủy yêu cầu"));
      lamMoiNopTien(qc);
      onClose();
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });
  if (!r) {
    return <Modal open onClose={onClose} title={ma(id)}><div className="text-sm text-[var(--color-text-secondary)]">{t("Đang tải…")}</div></Modal>;
  }
  const so = Number(thucNhan);
  const soHopLe = Number.isInteger(so) && so > 0;
  const lech = soHopLe && so !== r.so_tien;
  const coDuyet = r.hanh_dong.includes("duyet");
  return (
    <Modal open onClose={onClose} title={`${ma(r.id)} · ${t("Nộp tiền vào quỹ")}`} width="max-w-xl">
      <div className="space-y-2 text-sm">
        <KvRow label={t("Trạng thái")}><NtBadge tt={r.trang_thai} /></KvRow>
        <KvRow label={t("Người nộp")}>{ten(r.nguoi_gui)}{r.email !== r.nguoi_gui && <span className="text-[12px] text-[var(--color-text-secondary)]"> → {t("quỹ của")} {ten(r.email)}</span>}</KvRow>
        <KvRow label={t("Số tiền khai")}><b><Money>{fmtVND(r.so_tien)}</Money></b></KvRow>
        {r.so_tien_thuc_nhan != null && <KvRow label={t("Kế toán xác nhận")}><b><Money>{fmtVND(r.so_tien_thuc_nhan)}</Money></b></KvRow>}
        {r.ngay_chuyen && <KvRow label={t("Ngày chuyển")}>{r.ngay_chuyen}</KvRow>}
        <KvRow label={t("Gửi lúc")}>{fmtDateTime(r.ngay_tao)}</KvRow>
        {r.ghi_chu && <KvRow label={t("Ghi chú")}><span className="whitespace-pre-line">{r.ghi_chu}</span></KvRow>}
        {r.nguoi_xu_ly && <KvRow label={t("Xử lý")}>{ten(r.nguoi_xu_ly)} · {fmtDateTime(r.xu_ly_luc)}</KvRow>}
        {r.ly_do && <KvRow label={r.trang_thai === "Tu choi" ? t("Lý do từ chối") : t("Ghi chú Kế toán")}><span className="whitespace-pre-line">{r.ly_do}</span></KvRow>}
        {r.khoan_trang_thai === "Da huy" && (
          <div className="rounded-lg bg-[var(--color-warning-soft)] px-2.5 py-1.5 text-[12px]">{t("Kế toán đã hủy khoản tiền này ở “Tiền ngoài vào quỹ” — tiền đã trừ lại khỏi quỹ.")}</div>
        )}
        <KvRow label={t("Ảnh")}><BangChungAnhList urls={urls} onXem={setXemAnh} /></KvRow>
        <TienDocTuAnh doc={doc} soSoSanh={coDuyet ? (soHopLe ? so : null) : r.so_tien} nhan={coDuyet ? t("số thực nhận") : t("số tiền khai")} sttCua={(u) => urls.indexOf(u) + 1} />
        {r.trung && (
          <div className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)] px-2.5 py-1.5 text-[12px]">
            ⚠ {t("Trùng số tiền với khoản gần đây của cùng quỹ (30 ngày): {a} — kiểm tra sao kê, tránh ghi 1 lần chuyển 2 lần.", { a: r.trung })}
          </div>
        )}
        {r.hanh_dong.length > 0 && (
          <div className="space-y-2 border-t border-[var(--color-border)] pt-2">
            {coDuyet && (
              <label className="block">
                <span className={nhanO}>{t("Số tiền thực nhận (theo sao kê)")}</span>
                <input type="number" inputMode="numeric" min={1} value={thucNhan} onChange={(e) => { setThucNhan(e.target.value); setGoTay(true); setXacNhan(false); }} className={oNhap} />
                {!goTay && (
                  <span className="mt-0.5 block text-[12px] text-[var(--color-text-secondary)]">
                    {ocrDu ? t("Đã điền theo số đọc từ ảnh — đối chiếu sao kê, sửa nếu sai.") : doc.xongHet ? t("Ảnh chưa đọc được đủ số tiền — đang điền số KTV khai.") : t("Đang đọc số tiền từ ảnh…")}
                  </span>
                )}
              </label>
            )}
            {(coDuyet || r.hanh_dong.includes("tu_choi")) && (
              <label className="block">
                <span className={nhanO}>{t("Ghi chú / lý do từ chối")}</span>
                <textarea value={lyDo} onChange={(e) => setLyDo(e.target.value)} rows={2} maxLength={500} className={oNhap} />
              </label>
            )}
            {lech && coDuyet && (
              <div className="rounded-lg bg-[var(--color-warning-soft)] px-2.5 py-1.5 text-[12px]">
                {t("Số thực nhận khác số KTV khai")} (<Money>{fmtVND(r.so_tien)}</Money>) — {t("kiểm tra lại sao kê trước khi xác nhận.")}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {r.hanh_dong.includes("huy") && <Btn variant="danger" onClick={() => xuLy.mutate("huy")} disabled={xuLy.isPending}>{t("Hủy yêu cầu")}</Btn>}
              {r.hanh_dong.includes("tu_choi") && (
                <Btn variant="danger" onClick={() => (lyDo.trim() ? xuLy.mutate("tu_choi") : addToast(t("Nhập lý do từ chối")))} disabled={xuLy.isPending}>{t("Từ chối")}</Btn>
              )}
              {coDuyet && (
                <Btn
                  onClick={() => (lech && !xacNhan ? setXacNhan(true) : xuLy.mutate("duyet"))}
                  disabled={!soHopLe || xuLy.isPending}
                  loading={xuLy.isPending}
                >
                  {lech && xacNhan ? <>{t("Xác nhận nhận")} <Money>{fmtVND(so)}</Money></> : t("✓ Xác nhận vào quỹ")}
                </Btn>
              )}
            </div>
          </div>
        )}
      </div>
      {xemAnh != null && urls.length > 0 && (
        <XemAnhNhanh items={anhXemNopTien(r, ten, coDuyet && soHopLe ? { nhan: t("Số thực nhận đang nhập"), giaTri: so } : undefined)} batDau={xemAnh} onClose={() => setXemAnh(null)} />
      )}
    </Modal>
  );
}
