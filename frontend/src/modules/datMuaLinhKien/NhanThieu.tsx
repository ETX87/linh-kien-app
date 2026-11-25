// KTV BAO NHAN THIEU / KHONG NHAN DUOC HANG (chot 2026-10-12, backend routes/nhanThieu.ts, migration 0075).
// - BaoNhanThieuModal: KTV (hoac TN bao ho) bao tren PXK "Dang gui KTV" - SL thuc nhan tung dong + ly do + anh + ghi chu.
// - NhanThieuCard: khoi trong chi tiet PXK - han tu xac nhan + moi ticket cua phieu + thao tac Kho (tu choi / xac nhan thieu +
//   chon Gui bu / Hoan tien) va Ke toan (xac nhan da can doi MISA, so tien hoan).
// - NhanThieuList + ThieuHangTabs: muc rieng "KTV báo nhận thiếu" trong menu Thieu hang (tach biet ticket thieu hang dat mua).
import { lazy, Suspense, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { FileButton } from "../../components/ui/FileButton";
import { Badge, type Tone } from "../../components/x/Badge";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { api, buildQuery } from "../../api/client";
import { anhVuaGioiHan } from "../../lib/imageCompress";
import { baoLoiTaiAnh, canhBaoHanMucAnh, type HanMucAnh } from "../../lib/hanMucAnh";
import { fmtDateTime, fmtVND } from "../../types";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { t, dichSau } from "../../i18n";
import { BangChungAnhList } from "./BangChungChuyenTien";
import { describeApiError, invalidatePipelineCounts } from "./helpers";
import { useTenNguoiLog } from "./SharedUi";
import { useAuth } from "../../auth/AuthContext";
import { useThbCanXuLy } from "./ThieuHangBh";

const PxkDetailModalLazy = lazy(() => import("./PhieuXuatKhoTab").then((m) => ({ default: m.PxkDetailModal })));

export const LY_DO_NHAN_THIEU: Record<string, string> = {
  thieu_sl: dichSau("Thiếu số lượng"),
  khong_nhan: dichSau("Không nhận được hàng"),
  sai_hong: dichSau("Sai mã / hàng hỏng"),
  khac: dichSau("Khác"),
};
export const NHAN_THIEU_TRANG_THAI: Record<string, { label: string; tone: Tone }> = {
  "Cho kho kiem tra": { label: dichSau("Chờ Kho kiểm tra"), tone: "warning" },
  "Cho ke toan": { label: dichSau("Chờ Kế toán cân đối"), tone: "warning" },
  "Kho tu choi": { label: dichSau("Kho từ chối"), tone: "danger" },
  "Da hoan tien": { label: dichSau("Đã hoàn tiền về quỹ"), tone: "success" },
  "Da gui bu": { label: dichSau("Đã tạo phiếu gửi bù"), tone: "success" },
  "Da can doi": { label: dichSau("Đã điều chỉnh SL"), tone: "success" },
  "Da huy": { label: dichSau("Đã rút lại"), tone: "neutral" },
};
const PHUONG_AN: Record<string, string> = {
  gui_bu: dichSau("Gửi bù hàng cho KTV"),
  hoan_tien: dichSau("Không gửi bù — hoàn tiền về quỹ KTV / điều chỉnh SL"),
};
const MAX_ANH = 5;
const TBL = "tbl w-full [&_th]:px-2.5 [&_th]:py-2 [&_td]:px-2.5 [&_td]:py-1.5 [&_tbody>tr]:border-t [&_tbody>tr]:border-[var(--line)]";
const INPUT = "focus-ring bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm";

interface NhanThieuDong {
  dat_don_hang_id: string;
  so_luong_xuat: number;
  so_luong_ktv_bao: number;
  so_luong_xac_nhan: number | null;
  so_tien_thieu: number | null;
  don_gui_bu_id: string | null;
  ma_lk: string;
  ten_lk_snapshot: string | null;
  loai_don: string;
  loai_de_xuat: string | null;
}
interface NhanThieuTicket {
  id: string;
  phieu_xuat_kho_id: string;
  nguoi_nhan_hang: string | null;
  ly_do: string;
  ghi_chu: string | null;
  anh: string[];
  nguoi_bao: string;
  ngay_bao: string;
  trang_thai: string;
  phuong_an: string | null;
  so_tien_hoan: number | null;
  pxk_gui_bu_id: string | null;
  dong: NhanThieuDong[];
  log: { id: number; trang_thai: string; nguoi_xu_ly: string; ngay_xu_ly: string; ghi_chu: string | null }[];
}
interface NhanThieuPxkResp {
  tickets: NhanThieuTicket[];
  goi_y: { don_gia: Record<string, number>; tran_tien: number } | null;
  han_tu_nhan: string | null;
  co_ticket_mo: boolean;
}

export const nhanThieuPxkQuery = (pxkId: string) => ({
  queryKey: ["nhan-thieu-pxk", pxkId],
  queryFn: () => api.get<NhanThieuPxkResp>(`/nhan-thieu/pxk/${pxkId}`),
});

function useLamMoi(pxkId: string, onDone?: () => void) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["nhan-thieu-pxk", pxkId] });
    qc.invalidateQueries({ queryKey: ["nhan-thieu-list"] });
    invalidatePipelineCounts(qc);
    onDone?.();
  };
}

/** Han tu xac nhan da nhan hang (ngay VN) + so ngay con lai. */
function HanTuNhan({ han }: { han: string }) {
  const homNay = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const con = Math.ceil((Date.parse(`${han.slice(0, 10)}T00:00:00Z`) - Date.parse(`${homNay}T00:00:00Z`)) / 86400000);
  return (
    <div className={`rounded-lg px-3 py-2 text-xs ${con <= 2 ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" : "bg-[var(--color-info-soft)] text-[var(--color-info)]"}`}>
      ⏳ {t("Hệ thống tự tính KTV ĐÃ NHẬN HÀNG lúc {a} ({b}) nếu KTV không xác nhận hoặc báo nhận thiếu.", {
        a: fmtDateTime(han),
        b: con > 0 ? t("còn {n} ngày", { n: con }) : t("hôm nay"),
      })}
    </div>
  );
}

export interface DongPxkBao {
  id: string;
  ma_lk: string;
  ten_lk_snapshot?: string | null;
  so_luong_de_xuat: number;
  so_luong_thuc_xuat?: number | null;
}

export function BaoNhanThieuModal({
  pxkId, dong, onClose, onDone, addToast,
}: { pxkId: string; dong: DongPxkBao[]; onClose: () => void; onDone: () => void; addToast: (msg: string) => void }) {
  const [lyDo, setLyDo] = useState("thieu_sl");
  const [ghiChu, setGhiChu] = useState("");
  const [sl, setSl] = useState<Record<string, string>>({});
  const [anh, setAnh] = useState<string[]>([]);
  const [dangTai, setDangTai] = useState(0);
  const lamMoi = useLamMoi(pxkId, onDone);
  const xuat = (d: DongPxkBao) => d.so_luong_thuc_xuat ?? d.so_luong_de_xuat;
  const nhanCua = (d: DongPxkBao) => (lyDo === "khong_nhan" ? 0 : sl[d.id] === undefined ? xuat(d) : Number(sl[d.id]));
  const loiSl = dong.some((d) => {
    const v = nhanCua(d);
    return !Number.isInteger(v) || v < 0 || v > xuat(d);
  });
  const coThieu = dong.some((d) => nhanCua(d) < xuat(d));

  async function taiAnh(files: File[]) {
    const chon = files.slice(0, Math.max(0, MAX_ANH - anh.length));
    for (const f of chon) {
      setDangTai((n) => n + 1);
      try {
        const gui = await anhVuaGioiHan(f);
        const res = await api.postBinary<{ ok: true; url: string; han_muc_anh?: HanMucAnh | null }>(`/nhan-thieu/anh/${pxkId}`, await gui.arrayBuffer(), gui.type || "image/jpeg");
        canhBaoHanMucAnh(res.han_muc_anh, addToast);
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
      api.post<{ ok: true; id: string }>("/nhan-thieu/bao", {
        pxk_id: pxkId,
        ly_do: lyDo,
        ghi_chu: ghiChu.trim(),
        anh,
        dong: dong.filter((d) => nhanCua(d) < xuat(d)).map((d) => ({ dat_don_hang_id: d.id, so_luong_nhan: nhanCua(d) })),
      }),
    onSuccess: (r) => {
      addToast(t("Đã gửi báo nhận thiếu {a} — chờ Kho kiểm tra", { a: r.id }));
      lamMoi();
      onClose();
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t("Báo nhận thiếu / không nhận được hàng — {a}", { a: pxkId })}
      width="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>{t("Hủy")}</Btn>
          <Btn
            onClick={() => gui.mutate()}
            loading={gui.isPending}
            disabled={!ghiChu.trim() || loiSl || !coThieu || dangTai > 0}
            title={!coThieu ? t("Nhập SL thực nhận nhỏ hơn SL xuất ở dòng bị thiếu") : !ghiChu.trim() ? t("Nhập mô tả sự cố") : undefined}
          >
            {t("Gửi báo cáo")}
          </Btn>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[var(--ink-500)] text-xs">{t("Lý do")}</span>
          <div className="w-60">
            <Select value={lyDo} onChange={setLyDo} options={Object.entries(LY_DO_NHAN_THIEU).map(([value, label]) => ({ value, label: t(label) }))} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className={TBL}>
            <thead className="tbl-head">
              <tr>
                <th className="text-left">{t("Mã LK")}</th>
                <th className="text-left">{t("Tên linh kiện")}</th>
                <th className="text-right">{t("SL xuất")}</th>
                <th className="text-right">{t("SL thực nhận")}</th>
              </tr>
            </thead>
            <tbody>
              {dong.map((d) => {
                const v = nhanCua(d);
                const sai = !Number.isInteger(v) || v < 0 || v > xuat(d);
                return (
                  <tr key={d.id} className={v < xuat(d) ? "bg-[var(--color-warning-soft)]" : ""}>
                    <td className="font-mono">{d.ma_lk}</td>
                    <td className="max-w-[260px] truncate" title={d.ten_lk_snapshot ?? ""}>{d.ten_lk_snapshot}</td>
                    <td className="text-right">{xuat(d)}</td>
                    <td className="text-right">
                      <input
                        type="number"
                        min={0}
                        max={xuat(d)}
                        disabled={lyDo === "khong_nhan"}
                        value={lyDo === "khong_nhan" ? 0 : sl[d.id] ?? String(xuat(d))}
                        onChange={(e) => setSl((s) => ({ ...s, [d.id]: e.target.value }))}
                        className={`${INPUT} w-20 text-right ${sai ? "border-[var(--color-danger)]" : ""}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <div className="text-xs text-[var(--ink-500)] mb-1">{t("Ảnh hiện trạng hàng nhận được / vận đơn (tối đa {n} ảnh)", { n: MAX_ANH })}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <BangChungAnhList urls={anh} nho />
            {anh.length < MAX_ANH && (
              <FileButton accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" multiple onFilesSelected={(fs: File[]) => taiAnh(fs)} disabled={dangTai > 0}>
                {dangTai > 0 ? t("Đang tải ảnh...") : t("📷 Thêm ảnh")}
              </FileButton>
            )}
            {anh.length > 0 && (
              <Btn size="sm" variant="ghost" onClick={() => setAnh([])}>{t("Xóa ảnh")}</Btn>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--ink-500)] mb-1">{t("Mô tả sự cố")} <span className="text-[var(--coral-600)]">*</span></div>
          <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={3} className={`${INPUT} w-full`} placeholder={t("VD: thùng hàng chỉ có 1/2 cái, vỏ thùng bị rách...")} />
        </div>
        <div className="text-xs text-[var(--ink-500)]">
          {t("Kho sẽ kiểm tra: nếu đúng thiếu hàng, Kho chọn gửi bù hoặc hoàn tiền về quỹ của bạn; nếu không thiếu, phiếu quay lại chờ bạn xác nhận đã nhận hàng.")}
        </div>
      </div>
    </Modal>
  );
}

function BangDong({ tk, slKho, setSlKho, goiY, choKeToan }: {
  tk: NhanThieuTicket;
  slKho?: Record<string, string>;
  setSlKho?: (f: (s: Record<string, string>) => Record<string, string>) => void;
  goiY?: Record<string, number>;
  choKeToan?: boolean;
}) {
  const daChot = tk.dong.some((d) => d.so_tien_thieu != null);
  return (
    <div className="overflow-x-auto">
      <table className={TBL}>
        <thead className="tbl-head">
          <tr>
            <th className="text-left">{t("Đơn")}</th>
            <th className="text-left">{t("Mã LK")}</th>
            <th className="text-right">{t("SL xuất")}</th>
            <th className="text-right">{t("KTV báo nhận")}</th>
            <th className="text-right">{t("Kho xác nhận")}</th>
            <th className="text-right">{t("Thiếu")}</th>
            {(choKeToan || daChot) && <th className="text-right">{t("Tiền phần thiếu")}</th>}
            {tk.dong.some((d) => d.don_gui_bu_id) && <th className="text-left">{t("Đơn gửi bù")}</th>}
          </tr>
        </thead>
        <tbody>
          {tk.dong.map((d) => {
            const xn = slKho && slKho[d.dat_don_hang_id] !== undefined ? Number(slKho[d.dat_don_hang_id]) : d.so_luong_xac_nhan ?? d.so_luong_ktv_bao;
            const thieu = d.so_luong_xuat - (Number.isFinite(xn) ? xn : 0);
            const tienGoiY = goiY && goiY[d.dat_don_hang_id] != null ? goiY[d.dat_don_hang_id] * Math.max(0, thieu) : null;
            return (
              <tr key={d.dat_don_hang_id}>
                <td className="font-mono">{d.dat_don_hang_id}</td>
                <td className="font-mono" title={d.ten_lk_snapshot ?? ""}>{d.ma_lk}</td>
                <td className="text-right">{d.so_luong_xuat}</td>
                <td className="text-right">{d.so_luong_ktv_bao}</td>
                <td className="text-right">
                  {setSlKho ? (
                    <input
                      type="number"
                      min={0}
                      max={d.so_luong_xuat}
                      value={slKho?.[d.dat_don_hang_id] ?? String(d.so_luong_ktv_bao)}
                      onChange={(e) => setSlKho((s) => ({ ...s, [d.dat_don_hang_id]: e.target.value }))}
                      className={`${INPUT} w-20 text-right`}
                    />
                  ) : (
                    d.so_luong_xac_nhan ?? "—"
                  )}
                </td>
                <td className="text-right font-semibold text-[var(--color-danger-strong)]">{Math.max(0, thieu)}</td>
                {(choKeToan || daChot) && (
                  <td className="text-right">{d.so_tien_thieu != null ? fmtVND(d.so_tien_thieu) : tienGoiY != null ? fmtVND(tienGoiY) : "—"}</td>
                )}
                {tk.dong.some((x) => x.don_gui_bu_id) && <td className="font-mono">{d.don_gui_bu_id ?? ""}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TicketNhanThieu({
  tk, goiY, pxkId, nguoiNhanHang, canKho, canKeToan, canTacNghiep, currentEmail, addToast, onDone,
}: {
  tk: NhanThieuTicket; goiY: NhanThieuPxkResp["goi_y"]; pxkId: string; nguoiNhanHang: string | null;
  canKho: boolean; canKeToan: boolean; canTacNghiep: boolean; currentEmail: string; addToast: (msg: string) => void; onDone?: () => void;
}) {
  const ten = useTenNguoiLog();
  const lamMoi = useLamMoi(pxkId, onDone);
  const [ghiChu, setGhiChu] = useState("");
  const [phuongAn, setPhuongAn] = useState("");
  const [slKho, setSlKho] = useState<Record<string, string>>({});
  const [soTienHoan, setSoTienHoan] = useState("");
  // v1.537: Ke toan chon co tao don + phieu gui bu tren app khong (false = Kho gui bu ngoai he thong).
  const [taoPhieuGuiBu, setTaoPhieuGuiBu] = useState(true);
  const [moLog, setMoLog] = useState(false);
  const tt = NHAN_THIEU_TRANG_THAI[tk.trang_thai];
  const choKho = tk.trang_thai === "Cho kho kiem tra";
  const choKeToan = tk.trang_thai === "Cho ke toan";
  const coTheRut = choKho && (currentEmail === tk.nguoi_bao || currentEmail === nguoiNhanHang || canTacNghiep);

  const tongGoiY = choKeToan && goiY
    ? Math.min(
        goiY.tran_tien,
        tk.dong.reduce((s, d) => s + (goiY.don_gia[d.dat_don_hang_id] ?? 0) * Math.max(0, d.so_luong_xuat - (d.so_luong_xac_nhan ?? d.so_luong_ktv_bao)), 0),
      )
    : 0;

  const goi = useMutation({
    mutationFn: (v: { path: string; body: Record<string, unknown> }) => api.post<{ ok: true; pxk_gui_bu_id?: string | null; so_tien_hoan?: number; gui_bu_ngoai?: boolean }>(`/nhan-thieu/${tk.id}/${v.path}`, v.body),
    onSuccess: (r, v) => {
      if (v.path === "ke-toan") {
        addToast(r.gui_bu_ngoai ? t("Đã xác nhận Kho gửi bù ngoài hệ thống") : r.pxk_gui_bu_id ? t("Đã tạo phiếu gửi bù {a}", { a: r.pxk_gui_bu_id }) : (r.so_tien_hoan ?? 0) > 0 ? t("Đã hoàn {a} về quỹ KTV", { a: fmtVND(r.so_tien_hoan ?? 0) }) : t("Đã cập nhật"));
      } else addToast(t("Đã cập nhật"));
      setGhiChu("");
      lamMoi();
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });
  const slKhoGui = () => tk.dong.map((d) => ({ dat_don_hang_id: d.dat_don_hang_id, so_luong_nhan: slKho[d.dat_don_hang_id] === undefined ? d.so_luong_ktv_bao : Number(slKho[d.dat_don_hang_id]) }));

  return (
    <div className="border border-[var(--line)] rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono font-bold">{tk.id}</span>
        {tt && <Badge tone={tt.tone}>{t(tt.label)}</Badge>}
        <Badge tone="neutral" dot={false}>{t(LY_DO_NHAN_THIEU[tk.ly_do] ?? tk.ly_do)}</Badge>
        {tk.phuong_an && <span className="text-xs text-[var(--ink-500)]">· {t(PHUONG_AN[tk.phuong_an] ?? tk.phuong_an)}</span>}
        <span className="ml-auto text-xs text-[var(--ink-500)]">{ten(tk.nguoi_bao)} · {fmtDateTime(tk.ngay_bao)}</span>
      </div>
      {tk.ghi_chu && <div className="text-xs whitespace-pre-wrap">{tk.ghi_chu}</div>}
      {tk.anh.length > 0 && <BangChungAnhList urls={tk.anh} nho />}
      <BangDong tk={tk} slKho={choKho && canKho ? slKho : undefined} setSlKho={choKho && canKho ? setSlKho : undefined} goiY={choKeToan ? goiY?.don_gia : undefined} choKeToan={choKeToan} />
      {tk.so_tien_hoan != null && tk.so_tien_hoan > 0 && <div className="text-xs">{t("Đã hoàn về quỹ KTV")}: <b>{fmtVND(tk.so_tien_hoan)}</b></div>}
      {tk.pxk_gui_bu_id && <div className="text-xs">{t("Phiếu gửi bù")}: <b className="font-mono">{tk.pxk_gui_bu_id}</b></div>}
      {tk.trang_thai === "Da gui bu" && !tk.pxk_gui_bu_id && <div className="text-xs">{t("Kho gửi bù ngoài hệ thống — không tạo phiếu gửi bù")}</div>}

      {choKho && canKho && (
        <div className="space-y-2 border-t border-[var(--line)] pt-2">
          <div className="text-xs font-semibold">{t("Kho kiểm tra")}</div>
          <div className="flex flex-col gap-1">
            {Object.entries(PHUONG_AN).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" name={`pa-${tk.id}`} checked={phuongAn === k} onChange={() => setPhuongAn(k)} />
                {t(label)}
              </label>
            ))}
          </div>
          <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2} className={`${INPUT} w-full`} placeholder={t("Ghi chú kiểm tra (bắt buộc khi từ chối)")} />
          <div className="flex gap-2 flex-wrap justify-end">
            <Btn
              variant="danger"
              disabled={!ghiChu.trim() || goi.isPending}
              title={!ghiChu.trim() ? t("Nhập lý do từ chối vào ô ghi chú") : undefined}
              onClick={() => goi.mutate({ path: "kho", body: { hanh_dong: "tu_choi", ghi_chu: ghiChu.trim() } })}
            >
              {t("↩ Từ chối — KTV xác nhận lại")}
            </Btn>
            <Btn
              disabled={!phuongAn || goi.isPending}
              loading={goi.isPending}
              title={!phuongAn ? t("Chọn phương án xử lý") : undefined}
              onClick={() => goi.mutate({ path: "kho", body: { hanh_dong: "dong_y", phuong_an: phuongAn, ghi_chu: ghiChu.trim() || undefined, dong: slKhoGui() } })}
            >
              {t("✓ Xác nhận thiếu hàng")}
            </Btn>
          </div>
        </div>
      )}

      {choKeToan && canKeToan && (
        <div className="space-y-2 border-t border-[var(--line)] pt-2">
          <div className="text-xs font-semibold">{t("Kế toán cân đối phiếu trên MISA theo SL thực nhận")}</div>
          {tk.phuong_an === "gui_bu" && (
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" name={`gb-${tk.id}`} checked={taoPhieuGuiBu} onChange={() => setTaoPhieuGuiBu(true)} />
                {t("Tạo đơn + phiếu gửi bù trên app (Kho xuất lại theo phiếu mới)")}
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" name={`gb-${tk.id}`} checked={!taoPhieuGuiBu} onChange={() => setTaoPhieuGuiBu(false)} />
                {t("Không tạo đơn xuất bù — Kho tự gửi bù ngoài hệ thống")}
              </label>
            </div>
          )}
          <div className="text-xs text-[var(--ink-500)]">
            {tk.phuong_an === "gui_bu" && !taoPhieuGuiBu
              ? t("Xác nhận xong: giữ nguyên SL và tiền của phiếu gốc, không tạo đơn / phiếu mới. Kho tự gửi phần thiếu cho KTV.")
              : tk.phuong_an === "gui_bu"
              ? t("Xác nhận xong: SL thực xuất của đơn gốc = SL thực nhận, hệ thống tạo đơn + phiếu gửi bù phần thiếu{a}.", {
                  a: tongGoiY > 0 ? t(" và chuyển {b} đã thanh toán sang phiếu gửi bù (KTV không phải chuyển lại)", { b: fmtVND(tongGoiY) }) : "",
                })
              : t("Xác nhận xong: SL thực xuất của đơn gốc = SL thực nhận; tiền phần thiếu (nếu có) hoàn về quỹ dư của KTV.")}
          </div>
          {tk.phuong_an === "hoan_tien" && goiY && goiY.tran_tien > 0 && (
            <label className="flex items-center gap-2 text-xs flex-wrap">
              {t("Số tiền hoàn về quỹ KTV")}
              <input
                type="number"
                min={0}
                max={goiY.tran_tien}
                value={soTienHoan === "" ? String(tongGoiY) : soTienHoan}
                onChange={(e) => setSoTienHoan(e.target.value)}
                className={`${INPUT} w-36 text-right`}
              />
              <span className="text-[var(--ink-500)]">{t("(gợi ý {a}, tối đa {b})", { a: fmtVND(tongGoiY), b: fmtVND(goiY.tran_tien) })}</span>
            </label>
          )}
          <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2} className={`${INPUT} w-full`} placeholder={t("Ghi chú (số chứng từ MISA điều chỉnh...)")} />
          <div className="flex justify-end">
            <Btn
              loading={goi.isPending}
              onClick={() =>
                goi.mutate({
                  path: "ke-toan",
                  body: {
                    ghi_chu: ghiChu.trim() || undefined,
                    so_tien_hoan: tk.phuong_an === "hoan_tien" && soTienHoan !== "" ? Number(soTienHoan) : undefined,
                    gui_bu_ngoai: tk.phuong_an === "gui_bu" && !taoPhieuGuiBu ? true : undefined,
                  },
                })
              }
            >
              {t("✓ Đã cân đối MISA — xác nhận")}
            </Btn>
          </div>
        </div>
      )}

      {coTheRut && (
        <div className="flex justify-end">
          <Btn size="sm" variant="ghost" disabled={goi.isPending} onClick={() => goi.mutate({ path: "huy", body: {} })}>{t("Rút lại báo cáo")}</Btn>
        </div>
      )}

      <button type="button" className="text-xs text-[var(--color-primary)]" onClick={() => setMoLog((v) => !v)}>
        {moLog ? t("Ẩn lịch sử") : t("Lịch sử xử lý ({n})", { n: tk.log.length })}
      </button>
      {moLog && (
        <ul className="space-y-1 text-xs">
          {tk.log.map((l) => (
            <li key={l.id} className="border-l-2 border-[var(--line)] pl-2">
              <b>{ten(l.nguoi_xu_ly)}</b> · {t(NHAN_THIEU_TRANG_THAI[l.trang_thai]?.label ?? l.trang_thai)} · <span className="text-[var(--ink-500)]">{fmtDateTime(l.ngay_xu_ly)}</span>
              {l.ghi_chu && <div className="text-[var(--ink-500)] whitespace-pre-wrap">{l.ghi_chu}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Khoi "Nhận hàng" trong chi tiet PXK: han tu xac nhan + ticket bao nhan thieu (an khi khong co gi de hien). */
export function NhanThieuCard({
  pxkId, nguoiNhanHang, canKho, canKeToan, canTacNghiep, currentEmail, addToast, onDone,
}: {
  pxkId: string; nguoiNhanHang: string | null; canKho: boolean; canKeToan: boolean; canTacNghiep: boolean;
  currentEmail: string; addToast: (msg: string) => void; onDone?: () => void;
}) {
  const { data } = useQuery(nhanThieuPxkQuery(pxkId));
  if (!data || (!data.han_tu_nhan && data.tickets.length === 0)) return null;
  return (
    <div className="border border-[var(--line)] rounded-lg p-3 space-y-2">
      <SectionTitle icon="📦">{t("Nhận hàng")}</SectionTitle>
      {data.han_tu_nhan && !data.co_ticket_mo && <HanTuNhan han={data.han_tu_nhan} />}
      {data.tickets.map((tk) => (
        <TicketNhanThieu
          key={tk.id}
          tk={tk}
          goiY={data.goi_y}
          pxkId={pxkId}
          nguoiNhanHang={nguoiNhanHang}
          canKho={canKho}
          canKeToan={canKeToan}
          canTacNghiep={canTacNghiep}
          currentEmail={currentEmail}
          addToast={addToast}
          onDone={onDone}
        />
      ))}
    </div>
  );
}

interface NhanThieuListRow {
  id: string;
  phieu_xuat_kho_id: string;
  nguoi_nhan_hang: string | null;
  ly_do: string;
  nguoi_bao: string;
  ngay_bao: string;
  trang_thai: string;
  phuong_an: string | null;
  so_tien_hoan: number | null;
  pxk_gui_bu_id: string | null;
  ma_xuat_kho: string | null;
  ma_misa: string | null;
  khu_vuc_ma: string | null;
  so_dong: number;
  sl_thieu: number | null;
  ma_lk: string | null;
}

const LOC_TRANG_THAI: { value: string; label: string }[] = [
  { value: "can_xu_ly", label: dichSau("Cần xử lý") },
  { value: "Cho kho kiem tra", label: dichSau("Chờ Kho kiểm tra") },
  { value: "Cho ke toan", label: dichSau("Chờ Kế toán cân đối") },
  { value: "Da gui bu", label: dichSau("Đã tạo phiếu gửi bù") },
  { value: "Da hoan tien", label: dichSau("Đã hoàn tiền về quỹ") },
  { value: "Da can doi", label: dichSau("Đã điều chỉnh SL") },
  { value: "Kho tu choi", label: dichSau("Kho từ chối") },
  { value: "Da huy", label: dichSau("Đã rút lại") },
  { value: "tat_ca", label: dichSau("Tất cả") },
];

export function NhanThieuList({
  addToast, canKho, canKeToan, canTacNghiep, currentEmail, isAdmin,
}: { addToast: (msg: string) => void; canKho: boolean; canKeToan: boolean; canTacNghiep: boolean; currentEmail: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const ten = useTenNguoiLog();
  const [tt, setTt] = useLocalStorageState("nhan-thieu-loc", "can_xu_ly");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [moPxk, setMoPxk] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["nhan-thieu-list", tt, q, page],
    queryFn: () => api.get<{ data: NhanThieuListRow[]; total: number; page: number; pageSize: number; counts: Record<string, number> }>(`/nhan-thieu${buildQuery({ trang_thai: tt, q: q.trim() || undefined, page })}`),
  });
  const counts = data?.counts ?? {};
  const dem = (v: string) =>
    v === "tat_ca" ? Object.values(counts).reduce((s, n) => s + n, 0) : v === "can_xu_ly" ? (counts["Cho kho kiem tra"] ?? 0) + (counts["Cho ke toan"] ?? 0) : counts[v] ?? 0;
  const soTrang = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {LOC_TRANG_THAI.map((o) => (
          <button key={o.value} type="button" className={`filter-tab ${tt === o.value ? "active" : ""}`} onClick={() => { setTt(o.value); setPage(1); }}>
            {t(o.label)} <span className="opacity-70">({dem(o.value)})</span>
          </button>
        ))}
      </div>
      <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Tìm mã báo / mã phiếu / mã MISA")} className={`o-tim ${INPUT} w-full sm:w-80`} />
      <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-white">
        <table className={TBL}>
          <thead className="tbl-head">
            <tr>
              <th className="text-left">{t("Mã báo")}</th>
              <th className="text-left">{t("Phiếu xuất kho")}</th>
              <th className="text-left">{t("Mã LK")}</th>
              <th className="text-right">{t("SL thiếu")}</th>
              <th className="text-left">{t("Lý do")}</th>
              <th className="text-left">{t("Trạng thái")}</th>
              <th className="text-left">{t("Phương án")}</th>
              <th className="text-left">{t("Người nhận hàng")}</th>
              <th className="text-left">{t("Khu vực")}</th>
              <th className="text-left">{t("Ngày báo")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="text-center text-[var(--ink-500)] py-4">{t("Đang tải...")}</td></tr>
            )}
            {!isLoading && (data?.data.length ?? 0) === 0 && (
              <tr><td colSpan={10} className="text-center text-[var(--ink-500)] py-4">{t("Không có báo nhận thiếu nào")}</td></tr>
            )}
            {data?.data.map((r) => {
              const s = NHAN_THIEU_TRANG_THAI[r.trang_thai];
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-[var(--color-surface-hover)]" onClick={() => setMoPxk(r.phieu_xuat_kho_id)}>
                  <td className="font-mono font-semibold">{r.id}</td>
                  <td><span className="code-link">{r.phieu_xuat_kho_id}</span>{r.ma_misa ? <span className="text-[var(--ink-500)]"> · {r.ma_misa}</span> : null}</td>
                  <td className="font-mono max-w-[200px] truncate" title={r.ma_lk ?? ""}>{r.ma_lk}</td>
                  <td className="text-right font-semibold text-[var(--color-danger-strong)]">{r.sl_thieu ?? 0}</td>
                  <td>{t(LY_DO_NHAN_THIEU[r.ly_do] ?? r.ly_do)}</td>
                  <td>{s ? <Badge tone={s.tone}>{t(s.label)}</Badge> : r.trang_thai}</td>
                  <td>{r.phuong_an === "gui_bu" ? t("Gửi bù") + (r.pxk_gui_bu_id ? ` · ${r.pxk_gui_bu_id}` : "") : r.phuong_an === "hoan_tien" ? t("Hoàn tiền") + (r.so_tien_hoan ? ` · ${fmtVND(r.so_tien_hoan)}` : "") : ""}</td>
                  <td className="max-w-[200px] truncate">{ten(r.nguoi_nhan_hang)}</td>
                  <td>{r.khu_vuc_ma}</td>
                  <td>{fmtDateTime(r.ngay_bao)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {soTrang > 1 && (
        <div className="flex items-center gap-2 justify-end text-xs">
          <Btn size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Btn>
          <span>{page}/{soTrang}</span>
          <Btn size="sm" variant="ghost" disabled={page >= soTrang} onClick={() => setPage((p) => p + 1)}>›</Btn>
        </div>
      )}
      {moPxk && (
        <Suspense fallback={null}>
          <PxkDetailModalLazy
            id={moPxk}
            onClose={() => setMoPxk(null)}
            addToast={addToast}
            qc={qc}
            canTacNghiep={canTacNghiep}
            canKho={canKho}
            canKeToan={canKeToan}
            canDownloadMisa={false}
            currentEmail={currentEmail}
            isAdmin={isAdmin}
          />
        </Suspense>
      )}
    </div>
  );
}

/** Menu Thieu hang: 2 muc tach biet - ticket thieu hang dat mua (children) va "KTV báo nhận thiếu". */
// v1.565 ("gộp thiếu hàng lk đặt mua với đổi trả vào cùng 1 tab"): ticket "Thiếu hàng bảo hành" nam CHUNG muc dau (ThieuLkTab, cot "Nguồn tiếp nhận")
// - bo tab rieng; coBaoHanh = nguoi xem thay ticket THB (hien so can xu ly THB tren tab gop).
export function ThieuHangTabs({ children, list, coBaoHanh }: { children: ReactNode; list: ReactNode; coBaoHanh?: boolean }) {
  const [mucLuu, setMuc] = useLocalStorageState<"dat-mua" | "nhan-thieu" | "bao-hanh">("thieu-hang-muc", "dat-mua");
  const muc = mucLuu === "bao-hanh" ? "dat-mua" : mucLuu;
  // Thieu hang bao hanh (2026-11-04) - ticket tu app Sua chua bao hanh; so can xu ly theo vai tro (Kho / Mua hang).
  const soBh = useThbCanXuLy(!!coBaoHanh);
  const { data } = useQuery({
    queryKey: ["nhan-thieu-list", "can_xu_ly", "", 1],
    queryFn: () => api.get<{ counts: Record<string, number> }>(`/nhan-thieu${buildQuery({ trang_thai: "can_xu_ly", page: 1 })}`),
  });
  // So ticket CHO XU LY theo vai tro (2026-10-16): Kho = cho kiem tra, Ke toan = cho can doi, Admin/khac = ca 2.
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const laAdmin = u?.vai_tro === "Admin";
  const choKho = data?.counts["Cho kho kiem tra"] ?? 0;
  const choKeToan = data?.counts["Cho ke toan"] ?? 0;
  // "Chờ duyệt hủy" (v1.480): don KTV / GS yeu cau huy cho Kho / Mua hang dong y -> cham DO tren tab "Thiếu hàng đặt mua" (Kho / Mua hang / TN / Admin).
  const xemChoHuy = !!(u && (u.la_kho || u.la_mua_hang || u.la_tac_nghiep || laAdmin));
  const { data: choHuyData } = useQuery({
    queryKey: ["dat-mua-lk-thieu-lk-status-counts", "tab-cho-huy"],
    queryFn: () => api.get<{ counts: Record<string, number> }>("/dat-mua-lk/thieu-lk-status-counts"),
    enabled: xemChoHuy,
    staleTime: 30_000,
  });
  const choHuy = choHuyData?.counts["__CHO_HUY__"] ?? 0;
  const canXuLy = laAdmin ? choKho + choKeToan : (u?.la_kho ? choKho : 0) + (u?.la_ke_toan ? choKeToan : 0) || (u?.la_kho || u?.la_ke_toan ? 0 : choKho + choKeToan);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={`filter-tab ${muc === "dat-mua" ? "active" : ""}`} onClick={() => setMuc("dat-mua")}>
          {coBaoHanh ? t("Thiếu hàng (đặt mua + bảo hành)") : t("Thiếu hàng đặt mua")}
          {soBh > 0 && (
            <span
              title={t("{n} ticket thiếu hàng bảo hành chờ bạn xử lý", { n: soBh })}
              className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-warning)] text-white text-[10px] font-bold leading-none"
            >
              {t("BH {n}", { n: soBh > 99 ? "99+" : soBh })}
            </span>
          )}
          {choHuy > 0 && (
            <span
              title={t("{n} đơn chờ duyệt hủy", { n: choHuy })}
              className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold leading-none text-white"
            >
              {t("{n} chờ hủy", { n: choHuy > 99 ? "99+" : choHuy })}
            </span>
          )}
        </button>
        <button type="button" className={`filter-tab ${muc === "nhan-thieu" ? "active" : ""}`} onClick={() => setMuc("nhan-thieu")}>
          {t("KTV báo nhận thiếu")}
          {canXuLy > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-warning)] text-white text-[10px] font-bold leading-none">
              {canXuLy > 99 ? "99+" : canXuLy}
            </span>
          )}
        </button>
      </div>
      {muc === "dat-mua" ? children : list}
    </div>
  );
}
