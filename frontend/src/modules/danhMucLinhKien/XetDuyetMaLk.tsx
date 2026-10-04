import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { Money } from "../../components/ui/Money";
import { useToast } from "../../components/ui/Toast";
import { api, ApiError } from "../../api/client";
import { fmtDateTime, fmtVND, type LinhKienLogRow, type LinhKienRow, type TrangThaiMaLk } from "../../types";
import { usePersonDirectory, formatPersonDisplay } from "../../lib/personDisplay";
import { timLk, sapTheoDiem } from "../../lib/timLinhKien";
import { useBoTimLk } from "../../lib/useTimLinhKien";

// Xet duyet ma chuan linh kien moi (2026-09-30, migration 0053 - backend lib/linhKienXetDuyet.ts + routes
// settingsDatMua.ts /linh-kien/:ma/xac-nhan|gop|tu-choi|gia-tam|xet-duyet). LK tao trong app vao "Chờ xét duyệt";
// nhan vien Mua hang (users.la_mua_hang) / Admin xac nhan (giu ma, sua ten), doi ma A -> B, gop vao ma co san, tu choi,
// nhap gia tam (LK chua co tren gia88). gia88 co dung ma dang cho -> "Tự động duyệt".

export const TRANG_THAI_MA: Record<TrangThaiMaLk, { label: string; tone: BadgeTone }> = {
  "Cho xet duyet": { label: "Chờ xét duyệt", tone: "amber" },
  "Da xac nhan": { label: "Đã xác nhận mã chuẩn", tone: "teal" },
  "Tu dong duyet": { label: "Tự động duyệt (gia88)", tone: "ocean" },
  "Tu choi": { label: "Từ chối", tone: "violet" },
  "Da doi ma": { label: "Đã đổi mã", tone: "gray" },
};

export function TrangThaiMaBadge({ tt }: { tt: TrangThaiMaLk | undefined }) {
  const m = TRANG_THAI_MA[tt ?? "Da xac nhan"] ?? TRANG_THAI_MA["Da xac nhan"];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const LOI: Record<string, string> = {
  KHONG_CON_CHO_DUYET: "Linh kiện này không còn ở trạng thái chờ xét duyệt (có thể người khác vừa xử lý).",
  MA_DA_TON_TAI: "Mã này đã có trong danh mục - dùng \"Gộp vào mã có sẵn\".",
  MA_KHONG_HOP_LE: "Mã linh kiện không được chứa khoảng trắng.",
  THIEU_PHAN_LOAI: "Bắt buộc chọn Phân loại linh kiện trước khi xác nhận.",
  MA_DICH_KHONG_HOP_LE: "Chọn mã linh kiện cần gộp vào.",
  MA_DICH_KHONG_TON_TAI: "Mã cần gộp vào không có trong danh mục.",
  MA_DICH_DA_DOI_MA: "Mã cần gộp vào đã bị đổi sang mã khác.",
  MA_DICH_DA_TU_CHOI: "Mã cần gộp vào đã bị từ chối.",
  CON_DON_DANG_DUNG: "Còn đơn hàng đang dùng mã này - hãy gộp vào mã chuẩn thay vì từ chối.",
  THIEU_LY_DO: "Nhập lý do từ chối.",
  GIA_DO_GIA88_QUAN_LY: "Mã này đã có trên bảng giá gia88 - giá do gia88 quản lý.",
  LK_KHONG_CON_HIEU_LUC: "Linh kiện đã bị từ chối/đổi mã.",
  GIA_KHONG_HOP_LE: "Giá không hợp lệ.",
  FORBIDDEN_ROLE: "Bạn không có quyền xét duyệt mã linh kiện.",
};
function moTaLoi(err: unknown): string {
  if (err instanceof ApiError) return LOI[err.code ?? ""] ?? `Lỗi (mã: ${err.code ?? err.status})`;
  return err instanceof Error ? err.message : String(err);
}

const INPUT = "focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm";

function moTaLog(l: LinhKienLogRow): string {
  switch (l.hanh_dong) {
    case "Tao moi":
      return `Tạo mới${l.ten_moi ? `: ${l.ten_moi}` : ""}`;
    case "Xac nhan":
      return l.ma_cu && l.ma_moi && l.ma_cu !== l.ma_moi
        ? `Xác nhận mã chuẩn ${l.ma_moi} (mã tạo ban đầu ${l.ma_cu})${l.ten_moi ? ` - tên: ${l.ten_moi}` : ""}`
        : `Xác nhận mã chuẩn${l.ten_moi ? ` - sửa tên thành: ${l.ten_moi}` : ""}`;
    case "Doi ma":
      return `Đổi mã ${l.ma_cu} → ${l.ma_moi}${l.ten_moi ? ` - tên: ${l.ten_moi}` : ""}`;
    case "Gop ma":
      return `Gộp ${l.ma_cu} vào ${l.ma_moi}${l.ghi_chu ? ` - ${l.ghi_chu}` : ""}`;
    case "Tu choi":
      return `Từ chối: ${l.ghi_chu ?? ""}`;
    case "Gia tam":
      return `Giá tạm: ${l.ghi_chu ?? ""}`;
    case "Tu dong duyet":
      return `Tự động duyệt - mã có trên gia88${l.ten_moi ? `, tên theo gia88: ${l.ten_moi}` : ""}`;
    default:
      return l.hanh_dong;
  }
}

/** Khoi "Xét duyệt mã" trong drawer chi tiet LK: trang thai, nguoi tao, nut thao tac (Mua hang/Admin), lich su. */
export function XetDuyetMaSection({
  part, parts, canXetDuyet, onDoiMa,
}: { part: LinhKienRow; parts: LinhKienRow[]; canXetDuyet: boolean; onDoiMa: (maMoi: string) => void }) {
  const personDir = usePersonDirectory();
  const [moModal, setMoModal] = useState<"xac-nhan" | "gop" | "tu-choi" | "gia-tam" | null>(null);
  const { data } = useQuery({
    queryKey: ["lk-xet-duyet", part.ma_linh_kien],
    queryFn: () => api.get<{ log: LinhKienLogRow[]; so_don: number; so_don_con_hieu_luc: number }>(`/settings/linh-kien/${encodeURIComponent(part.ma_linh_kien)}/xet-duyet`),
  });
  const tt = part.trang_thai_ma ?? "Da xac nhan";
  const choDuyet = tt === "Cho xet duyet";
  const nguoiTao = data?.log.find((l) => l.hanh_dong === "Tao moi" && l.ma_linh_kien === part.ma_linh_kien)?.nguoi_thuc_hien;
  const giaTamDuoc = canXetDuyet && !part.co_tren_gia88 && tt !== "Tu choi" && tt !== "Da doi ma";

  return (
    <div>
      <SectionTitle>Xét duyệt mã</SectionTitle>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <TrangThaiMaBadge tt={tt} />
          {tt === "Da doi ma" && part.ma_chuan && (
            <button className="code-link text-xs" onClick={() => onDoiMa(part.ma_chuan!)}>
              → mã chuẩn {part.ma_chuan}
            </button>
          )}
          {!part.co_tren_gia88 && tt !== "Da doi ma" && <span className="text-xs text-[var(--ink-400)]">Chưa có trên bảng giá gia88</span>}
        </div>
        {nguoiTao && (
          <div className="text-xs text-[var(--ink-500)]">
            Người tạo: <span className="font-medium">{formatPersonDisplay(nguoiTao, personDir)}</span>
          </div>
        )}
        {data && data.so_don > 0 && (
          <div className="text-xs text-[var(--ink-500)]">
            Đang có <span className="font-semibold">{data.so_don}</span> dòng đơn dùng mã này ({data.so_don_con_hieu_luc} còn hiệu lực)
          </div>
        )}
        {canXetDuyet && (choDuyet || giaTamDuoc) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {choDuyet && <Btn size="sm" onClick={() => setMoModal("xac-nhan")}>Xác nhận mã chuẩn</Btn>}
            {choDuyet && <Btn size="sm" variant="ghost" onClick={() => setMoModal("gop")}>Gộp vào mã có sẵn</Btn>}
            {giaTamDuoc && <Btn size="sm" variant="ghost" onClick={() => setMoModal("gia-tam")}>Nhập giá tạm</Btn>}
            {choDuyet && <Btn size="sm" variant="ghost" onClick={() => setMoModal("tu-choi")}>Từ chối</Btn>}
          </div>
        )}
        {!!data?.log.length && (
          <div className="rounded-xl bg-[var(--surface-100)] px-3 py-2 space-y-1.5">
            {data.log.map((l) => (
              <div key={l.id} className="text-xs">
                <div className="text-[var(--ink-700)]">{moTaLog(l)}</div>
                <div className="text-[var(--ink-400)]">
                  {l.nguoi_thuc_hien ? formatPersonDisplay(l.nguoi_thuc_hien, personDir) : "Hệ thống"} · {fmtDateTime(l.thoi_gian)}
                  {l.ma_linh_kien !== part.ma_linh_kien && ` · mã ${l.ma_linh_kien}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {moModal === "xac-nhan" && <XacNhanModal part={part} parts={parts} soDon={data?.so_don ?? 0} onClose={() => setMoModal(null)} onGop={() => setMoModal("gop")} onDone={onDoiMa} />}
      {moModal === "gop" && <GopModal part={part} parts={parts} soDon={data?.so_don ?? 0} onClose={() => setMoModal(null)} onDone={onDoiMa} />}
      {moModal === "tu-choi" && <TuChoiModal part={part} onClose={() => setMoModal(null)} />}
      {moModal === "gia-tam" && <GiaTamModal part={part} onClose={() => setMoModal(null)} />}
    </div>
  );
}

function useSauXetDuyet() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    qc.invalidateQueries({ queryKey: ["lk-xet-duyet"] });
    qc.invalidateQueries({ queryKey: ["notifications-count"] });
  };
}

function CanhBaoDon({ soDon }: { soDon: number }) {
  if (!soDon) return null;
  return (
    <div className="rounded-lg bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)] text-xs px-3 py-2">
      {soDon} dòng đơn đang dùng mã này sẽ tự chuyển sang mã mới. Đơn đã lên file MISA trước đó vẫn giữ mã cũ trong MISA.
    </div>
  );
}

function XacNhanModal({
  part, parts, soDon, onClose, onGop, onDone,
}: { part: LinhKienRow; parts: LinhKienRow[]; soDon: number; onClose: () => void; onGop: () => void; onDone: (ma: string) => void }) {
  const toast = useToast();
  const sau = useSauXetDuyet();
  const [ma, setMa] = useState(part.ma_linh_kien);
  const [ten, setTen] = useState(part.ten_linh_kien);
  // Phan loai BAT BUOC khi xac nhan (chot 2026-09-30 - "Máy" quyet dinh kho xuat file MISA).
  const [phanLoai, setPhanLoai] = useState(part.don_vi ?? "");
  const phanLoaiOptions = useMemo(
    () => Array.from(new Set(parts.map((p) => p.don_vi?.trim()).filter((v): v is string => !!v))).sort(),
    [parts],
  );
  const maMoi = ma.trim();
  const doiMa = maMoi !== "" && maMoi !== part.ma_linh_kien;
  const trung = doiMa ? parts.find((p) => p.ma_linh_kien === maMoi) : undefined;
  const m = useMutation({
    mutationFn: () => api.post<{ ma_linh_kien: string }>(`/settings/linh-kien/${encodeURIComponent(part.ma_linh_kien)}/xac-nhan`, { ma_moi: maMoi, ten_moi: ten.trim(), phan_loai: phanLoai.trim() }),
    onSuccess: (r) => {
      toast(doiMa ? `Đã đổi mã ${part.ma_linh_kien} → ${r.ma_linh_kien} và xác nhận mã chuẩn` : "Đã xác nhận mã chuẩn");
      sau();
      onClose();
      if (doiMa) onDone(r.ma_linh_kien);
    },
    onError: (e) => toast(moTaLoi(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Xác nhận mã chuẩn - ${part.ma_linh_kien}`}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Hủy</Btn>
          <Btn onClick={() => m.mutate()} loading={m.isPending} disabled={!maMoi || !ten.trim() || !phanLoai.trim() || !!trung || /\s/.test(maMoi)}>
            {doiMa ? "Đổi mã & xác nhận" : "Xác nhận"}
          </Btn>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="text-xs text-[var(--ink-500)]">Mã đúng thì bấm Xác nhận. Mã sai thì sửa lại mã và tên cho chuẩn rồi xác nhận.</div>
        <label className="block">
          <span className="text-xs font-semibold text-[var(--ink-500)]">Mã linh kiện chuẩn</span>
          <input className={`${INPUT} font-mono`} value={ma} onChange={(e) => setMa(e.target.value)} autoFocus />
        </label>
        {trung && (
          <div className="rounded-lg bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)] text-xs px-3 py-2">
            Mã {trung.ma_linh_kien} đã có: {trung.ten_linh_kien}.{" "}
            <button className="underline font-semibold" onClick={onGop}>Gộp vào mã này</button>
          </div>
        )}
        <label className="block">
          <span className="text-xs font-semibold text-[var(--ink-500)]">Tên linh kiện chuẩn</span>
          <input className={INPUT} value={ten} onChange={(e) => setTen(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-[var(--ink-500)]">
            Phân loại <span className="text-[var(--color-danger)]">*</span>
          </span>
          <input className={INPUT} value={phanLoai} onChange={(e) => setPhanLoai(e.target.value)} list="xac-nhan-lk-phan-loai" placeholder="Chọn phân loại..." />
          <datalist id="xac-nhan-lk-phan-loai">
            {phanLoaiOptions.map((v) => <option key={v} value={v} />)}
          </datalist>
          {!phanLoai.trim() && <span className="text-[11px] text-[var(--color-danger)]">Bắt buộc chọn phân loại trước khi xác nhận.</span>}
        </label>
        {doiMa && <CanhBaoDon soDon={soDon} />}
      </div>
    </Modal>
  );
}

function GopModal({
  part, parts, soDon, onClose, onDone,
}: { part: LinhKienRow; parts: LinhKienRow[]; soDon: number; onClose: () => void; onDone: (ma: string) => void }) {
  const toast = useToast();
  const sau = useSauXetDuyet();
  const [q, setQ] = useState("");
  const [maDich, setMaDich] = useState<string | null>(null);
  const [ghiChu, setGhiChu] = useState("");
  const ungVien = useMemo(
    () => parts.filter((p) => p.ma_linh_kien !== part.ma_linh_kien && p.trang_thai_ma !== "Da doi ma" && p.trang_thai_ma !== "Tu choi"),
    [parts, part.ma_linh_kien],
  );
  // Bo tim chung (lib/timLinhKien.ts) - ma go dung len dau, tu dong nghia/go sai nhu o tim Bang gia.
  const boTim = useBoTimLk(useMemo(() => ungVien.map((p) => ({ ma: p.ma_linh_kien, ten: p.ten_linh_kien })), [ungVien]));
  const goiY = useMemo(() => {
    const kq = timLk(boTim, q);
    return kq.diem ? sapTheoDiem(ungVien, (p) => p.ma_linh_kien, kq.diem).slice(0, 8) : [];
  }, [boTim, ungVien, q]);
  const dich = maDich ? parts.find((p) => p.ma_linh_kien === maDich) : undefined;
  const m = useMutation({
    mutationFn: () => api.post(`/settings/linh-kien/${encodeURIComponent(part.ma_linh_kien)}/gop`, { ma_dich: maDich, ghi_chu: ghiChu.trim() || undefined }),
    onSuccess: () => {
      toast(`Đã gộp ${part.ma_linh_kien} vào ${maDich}`);
      sau();
      onClose();
      if (maDich) onDone(maDich);
    },
    onError: (e) => toast(moTaLoi(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Gộp ${part.ma_linh_kien} vào mã có sẵn`}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Hủy</Btn>
          <Btn onClick={() => m.mutate()} loading={m.isPending} disabled={!maDich}>Gộp mã</Btn>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="text-xs text-[var(--ink-500)]">
          Dùng khi linh kiện này trùng với 1 mã đã có. Mọi đơn/BOM/nhóm thay thế chuyển sang mã được chọn, giá tính theo mã đó; mã {part.ma_linh_kien} bị ẩn.
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-[var(--ink-500)]">Tìm mã / tên linh kiện</span>
          <input className={INPUT} value={q} onChange={(e) => { setQ(e.target.value); setMaDich(null); }} placeholder="vd: lõi ro" autoFocus />
        </label>
        {!dich && goiY.length > 0 && (
          <div className="border border-[var(--line)] rounded-lg divide-y divide-[var(--line)] max-h-64 overflow-y-auto">
            {goiY.map((p) => (
              <button key={p.ma_linh_kien} className="w-full text-left px-3 py-2 hover:bg-[var(--surface-100)]" onClick={() => setMaDich(p.ma_linh_kien)}>
                <div className="font-medium text-[var(--ocean-800)] truncate">{p.ten_linh_kien}</div>
                <div className="text-xs text-[var(--ink-500)] flex gap-2">
                  <span className="font-mono">{p.ma_linh_kien}</span>
                  <Money>{fmtVND(p.gia_ban)}</Money>
                </div>
              </button>
            ))}
          </div>
        )}
        {dich && (
          <div className="rounded-lg border border-[var(--line)] px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate">{dich.ten_linh_kien}</div>
              <div className="text-xs font-mono text-[var(--ink-500)]">{dich.ma_linh_kien} · <Money>{fmtVND(dich.gia_ban)}</Money></div>
            </div>
            <button className="text-xs underline shrink-0" onClick={() => setMaDich(null)}>Đổi</button>
          </div>
        )}
        <label className="block">
          <span className="text-xs font-semibold text-[var(--ink-500)]">Ghi chú (không bắt buộc)</span>
          <input className={INPUT} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
        </label>
        <CanhBaoDon soDon={soDon} />
      </div>
    </Modal>
  );
}

function TuChoiModal({ part, onClose }: { part: LinhKienRow; onClose: () => void }) {
  const toast = useToast();
  const sau = useSauXetDuyet();
  const [lyDo, setLyDo] = useState("");
  const m = useMutation({
    mutationFn: () => api.post(`/settings/linh-kien/${encodeURIComponent(part.ma_linh_kien)}/tu-choi`, { ly_do: lyDo.trim() }),
    onSuccess: () => {
      toast(`Đã từ chối linh kiện ${part.ma_linh_kien}`);
      sau();
      onClose();
    },
    onError: (e) => toast(moTaLoi(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Từ chối linh kiện ${part.ma_linh_kien}`}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Hủy</Btn>
          <Btn variant="danger" onClick={() => m.mutate()} loading={m.isPending} disabled={!lyDo.trim()}>Từ chối</Btn>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="text-xs text-[var(--ink-500)]">Linh kiện bị từ chối sẽ ẩn khỏi ô chọn khi tạo đơn. Chỉ từ chối được khi không còn đơn đang dùng mã này.</div>
        <label className="block">
          <span className="text-xs font-semibold text-[var(--ink-500)]">Lý do</span>
          <textarea className={INPUT} rows={3} value={lyDo} onChange={(e) => setLyDo(e.target.value)} autoFocus />
        </label>
      </div>
    </Modal>
  );
}

function GiaTamModal({ part, onClose }: { part: LinhKienRow; onClose: () => void }) {
  const toast = useToast();
  const sau = useSauXetDuyet();
  const qc = useQueryClient();
  const [giaBan, setGiaBan] = useState(part.gia_ban?.toString() ?? "");
  const [giaKtv, setGiaKtv] = useState(part.gia_tri_cong_no?.toString() ?? "");
  const so = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[.,\s]/g, "")));
  const hopLe = [so(giaBan), so(giaKtv)].every((v) => v === null || (Number.isFinite(v) && v >= 0));
  const m = useMutation({
    mutationFn: () => api.post(`/settings/linh-kien/${encodeURIComponent(part.ma_linh_kien)}/gia-tam`, { gia_ban: so(giaBan), gia_tri_cong_no: so(giaKtv) }),
    onSuccess: () => {
      toast("Đã lưu giá tạm - đã tính lại tiền các phiếu xuất đang tạo liên quan");
      sau();
      qc.invalidateQueries({ queryKey: ["pxk-detail"] });
      onClose();
    },
    onError: (e) => toast(moTaLoi(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Giá tạm - ${part.ma_linh_kien}`}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Hủy</Btn>
          <Btn onClick={() => m.mutate()} loading={m.isPending} disabled={!hopLe}>Lưu giá tạm</Btn>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="text-xs text-[var(--ink-500)]">Dùng cho linh kiện chưa có trên bảng giá gia88. Khi gia88 có mã này, giá gia88 sẽ tự ghi đè.</div>
        <label className="block">
          <span className="text-xs font-semibold text-[var(--ink-500)]">Giá NY (giá bán)</span>
          <input className={`${INPUT} font-mono`} inputMode="numeric" value={giaBan} onChange={(e) => setGiaBan(e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-[var(--ink-500)]">Giá KTV</span>
          <input className={`${INPUT} font-mono`} inputMode="numeric" value={giaKtv} onChange={(e) => setGiaKtv(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
