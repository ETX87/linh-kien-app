import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../ui/Btn";
import { Modal } from "../ui/Modal";
import { FileButton } from "../ui/FileButton";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useToast } from "../ui/Toast";
import { pushOverlayClose } from "../../lib/overlayStack";
import { anhVuaGioiHan } from "../../lib/imageCompress";
import { baoLoiTaiAnh, canhBaoHanMucAnh, type HanMucAnh } from "../../lib/hanMucAnh";
import { linkAnToan } from "../../lib/linhAnToan";
import { goiYHuongDan } from "../../lib/huongDan";
import { khopTim } from "../../lib/boDau";
import { fmtDateTime } from "../../types";
import { t } from "../../i18n";
import { describeApiError } from "../../modules/datMuaLinhKien/helpers";
import { NapGoiHuongDan } from "./NapGoiHuongDan";

// HỎI ĐÁP TỰ ĐỘNG (2026-10-28, migration 0102, backend routes/huongDan.ts) - "khi KTV click vào mục hỏi sẽ hiện các hướng dẫn, hình ảnh
// tự động đẩy lên drive và hiện ra trong câu trả lời". Kho huong dan do Mua hang / Admin soan (anh tai len Google Drive qua
// POST /huong-dan/anh); KTV xem trong khung Hoi dap (HoiDapWidget), goi y khi go cau hoi (lib/huongDan.ts - ban sao bo cham diem
// backend dung de tu tra loi sau khi gui cau hoi). Quan ly o menu "Hỏi đáp" › tab "Hướng dẫn tự động" (HuongDanQuanLy).

export interface HuongDan {
  id: number;
  tieu_de: string;
  noi_dung: string;
  anh: string[];
  tu_khoa: string | null;
  nhom: string | null;
  stt: number;
  bat_tat: number;
  luot_xem: number;
  luot_huu_ich: number;
  ngay_cap_nhat: string;
  ten_nguoi_cap_nhat?: string | null;
}

export const HD_ANH_TOI_DA = 10;

export function useHuongDan(tatCa = false) {
  return useQuery({
    queryKey: ["huong-dan", tatCa],
    queryFn: () => api.get<{ quan_ly: boolean; rows: HuongDan[] }>(`/huong-dan${tatCa ? "?tat_ca=1" : ""}`),
    staleTime: 60_000,
  });
}

/** Tai nhieu anh len Drive qua 1 endpoint (POST body = file) - tra danh sach URL theo thu tu chon. Dung chung huong dan + tin nhan. */
export function useTaiAnh(endpoint: string) {
  const toast = useToast();
  const [dangTai, setDangTai] = useState(0);
  const tai = async (files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    setDangTai(files.length);
    try {
      for (const f of files) {
        try {
          const gui = await anhVuaGioiHan(f);
          const res = await api.postBinary<{ url: string; han_muc_anh?: HanMucAnh | null }>(endpoint, await gui.arrayBuffer(), gui.type || "image/jpeg");
          canhBaoHanMucAnh(res.han_muc_anh, toast);
          urls.push(res.url);
        } catch (err) {
          baoLoiTaiAnh(err, toast, describeApiError);
          break;
        }
      }
    } finally {
      setDangTai(0);
    }
    return urls;
  };
  return { tai, dangTai };
}

/** Luoi anh thu nho, bam = xem lon (‹ › / vuot qua lai, Esc dong). */
export function AnhLuoi({ anh, nho, onXoa }: { anh: string[]; nho?: boolean; onXoa?: (i: number) => void }) {
  const [xem, setXem] = useState<number | null>(null);
  if (anh.length === 0) return null;
  const co = nho ? "h-16 w-16" : "h-24 w-24";
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {anh.map((u, i) => (
          <div key={u + i} className={`relative ${co} shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)]`}>
            <button type="button" onClick={() => setXem(i)} className="focus-ring block h-full w-full" title={t("Xem ảnh")}>
              <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            </button>
            {onXoa && (
              <button
                type="button"
                onClick={() => onXoa(i)}
                aria-label={t("Xoá ảnh")}
                className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-[11px] text-white hover:bg-black/80"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {xem !== null && <XemAnhLon anh={anh} batDau={xem} onDong={() => setXem(null)} />}
    </>
  );
}

export function XemAnhLon({ anh, batDau, onDong }: { anh: string[]; batDau: number; onDong: () => void }) {
  const [i, setI] = useState(batDau);
  const [x0, setX0] = useState<number | null>(null);
  useEffect(() => pushOverlayClose(onDong), [onDong]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setI((v) => (v - 1 + anh.length) % anh.length);
      if (e.key === "ArrowRight") setI((v) => (v + 1) % anh.length);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [anh.length]);
  // Anh Drive: link thumbnail -> ban lon hon (sz=w1600) de doc chu trong anh huong dan.
  const lon = anh[i].replace(/([?&]sz=)w\d+/, "$1w1600");
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/90"
      onTouchStart={(e) => setX0(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (x0 === null) return;
        const d = e.changedTouches[0].clientX - x0;
        if (Math.abs(d) > 50) setI((v) => (v + (d < 0 ? 1 : -1) + anh.length) % anh.length);
        setX0(null);
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-sm text-white">
        <span className="tabular">{i + 1} / {anh.length}</span>
        <div className="flex items-center gap-3">
          <a href={linkAnToan(anh[i])} target="_blank" rel="noreferrer" className="underline opacity-80 hover:opacity-100">{t("Mở ảnh gốc")}</a>
          <button type="button" onClick={onDong} aria-label={t("Đóng")} className="grid h-9 w-9 place-items-center rounded-full text-lg hover:bg-white/15">✕</button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4" onClick={onDong}>
        <img src={lon} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        {anh.length > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); setI((v) => (v - 1 + anh.length) % anh.length); }} className="absolute left-2 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/30" aria-label={t("Ảnh trước")}>‹</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setI((v) => (v + 1) % anh.length); }} className="absolute right-2 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/30" aria-label={t("Ảnh sau")}>›</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Noi dung 1 huong dan (chu + anh) - dung trong man chi tiet + the huong dan trong tin nhan. */
export function HuongDanNoiDung({ hd }: { hd: HuongDan }) {
  return (
    <div className="space-y-2.5">
      {hd.noi_dung && <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[var(--color-text)]">{hd.noi_dung}</div>}
      <AnhLuoi anh={hd.anh} />
    </div>
  );
}

/** The huong dan gon (tieu de + doan dau), bam = mo/thu noi dung ngay tai cho. */
export function HuongDanThe({ hd, moSan }: { hd: HuongDan | undefined; moSan?: boolean }) {
  const [mo, setMo] = useState(!!moSan);
  if (!hd) return <div className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-[12px] text-[var(--color-text-faint)]">{t("Hướng dẫn đã bị xoá")}</div>;
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={() => {
          if (!mo) void api.post(`/huong-dan/${hd.id}/xem`, {}).catch(() => undefined);
          setMo((v) => !v);
        }}
        className="focus-ring flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-soft)]"
      >
        <span aria-hidden>📘</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-[var(--color-text)]">{hd.tieu_de}</span>
          {!mo && (
            <span className="mt-0.5 block truncate text-[11.5px] text-[var(--color-text-secondary)]">
              {hd.noi_dung.split("\n")[0] || t("{n} ảnh hướng dẫn", { n: hd.anh.length })}
              {hd.anh.length > 0 && hd.noi_dung ? ` · 🖼 ${hd.anh.length}` : ""}
            </span>
          )}
        </span>
        <span className="shrink-0 text-[var(--color-text-faint)]">{mo ? "▲" : "▼"}</span>
      </button>
      {mo && (
        <div className="border-t border-[var(--color-border-soft)] px-3 py-2.5">
          <HuongDanNoiDung hd={hd} />
        </div>
      )}
    </div>
  );
}

/** Danh sach huong dan cho nguoi hoi trong khung chat: o tim + nhom + the. Go cau hoi -> xep theo do khop (cung bo cham diem tu tra loi). */
export function HuongDanDanhSach({ onMo }: { onMo: (hd: HuongDan) => void }) {
  const { data, isLoading } = useHuongDan();
  const [q, setQ] = useState("");
  const [nhom, setNhom] = useState("");
  const ds = useMemo(() => data?.rows ?? [], [data]);
  const cacNhom = useMemo(() => [...new Set(ds.map((h) => h.nhom).filter((x): x is string => !!x))], [ds]);
  const hien = useMemo(() => {
    const theoNhom = nhom ? ds.filter((h) => h.nhom === nhom) : ds;
    if (!q.trim()) return theoNhom;
    const khop = goiYHuongDan(theoNhom, q, 50);
    // Them huong dan chua tu go o tieu de / tu khoa (go 1 phan tu, tu ngan) ma bo cham diem bo qua.
    const them = theoNhom.filter((h) => !khop.includes(h) && (khopTim(h.tieu_de, q) || khopTim(h.tu_khoa, q)));
    return [...khop, ...them];
  }, [ds, nhom, q]);
  if (isLoading) return <div className="py-6 text-center text-sm text-[var(--color-text-secondary)]">{t("Đang tải...")}</div>;
  if (ds.length === 0) return null;
  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Tìm hướng dẫn: đặt hàng, chuyển tiền, trả hàng…")} className="o-tim focus-ring w-full rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-base sm:text-sm" />
      {cacNhom.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <button type="button" onClick={() => setNhom("")} className={`filter-tab shrink-0 ${nhom === "" ? "active" : ""}`}>{t("Tất cả")}</button>
          {cacNhom.map((n) => (
            <button key={n} type="button" onClick={() => setNhom(n)} className={`filter-tab shrink-0 ${nhom === n ? "active" : ""}`}>{n}</button>
          ))}
        </div>
      )}
      {hien.length === 0 ? (
        <div className="py-4 text-center text-[12.5px] text-[var(--color-text-secondary)]">{t("Không thấy hướng dẫn phù hợp — bấm \"Câu hỏi mới\" để hỏi nhân viên mua hàng.")}</div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
          {hien.map((h) => (
            <button key={h.id} type="button" onClick={() => onMo(h)} className="focus-ring flex w-full items-start gap-2 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)] px-3 py-2.5 text-left last:border-b-0 hover:bg-[var(--color-surface-soft)]">
              <span aria-hidden>📘</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-[var(--color-text)]">{h.tieu_de}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-[var(--color-text-secondary)]">
                  {[h.nhom, h.noi_dung.split("\n")[0], h.anh.length ? `🖼 ${h.anh.length}` : ""].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-[var(--color-text-faint)]">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Goi y huong dan khi dang go cau hoi (form Câu hỏi mới). */
export function GoiYKhiGo({ cauHoi, onMo }: { cauHoi: string; onMo: (hd: HuongDan) => void }) {
  const { data } = useHuongDan();
  const [qTre, setQTre] = useState(cauHoi);
  useEffect(() => {
    const h = setTimeout(() => setQTre(cauHoi), 300);
    return () => clearTimeout(h);
  }, [cauHoi]);
  const goiY = useMemo(() => goiYHuongDan(data?.rows ?? [], qTre, 3), [data, qTre]);
  if (goiY.length === 0) return null;
  return (
    <div className="rounded-[var(--radius-btn)] border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)] p-2.5">
      <div className="mb-1.5 text-[12px] font-semibold text-[var(--color-primary-dark)]">{t("💡 Có thể bạn đang hỏi — xem hướng dẫn trước khi gửi:")}</div>
      <div className="space-y-1">
        {goiY.map((h) => (
          <button key={h.id} type="button" onClick={() => onMo(h)} className="focus-ring block w-full truncate rounded-md bg-[var(--color-surface)] px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-soft)]">
            📘 {h.tieu_de}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Man chi tiet 1 huong dan trong khung chat (nguoi hoi). */
export function HuongDanChiTiet({ hd, onDaGiaiDap, onVanHoi }: { hd: HuongDan; onDaGiaiDap: () => void; onVanHoi: () => void }) {
  useEffect(() => {
    void api.post(`/huong-dan/${hd.id}/xem`, {}).catch(() => undefined);
  }, [hd.id]);
  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <div className="text-[15px] font-bold text-[var(--color-text)]">{hd.tieu_de}</div>
        {hd.nhom && <div className="text-[11.5px] text-[var(--color-text-secondary)]">{hd.nhom}</div>}
        <HuongDanNoiDung hd={hd} />
      </div>
      <div className="flex shrink-0 gap-2 border-t border-[var(--color-border)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Btn variant="ghost" className="min-h-10 flex-1" onClick={onVanHoi}>{t("Vẫn cần hỏi")}</Btn>
        <Btn
          variant="success"
          className="min-h-10 flex-1"
          onClick={() => {
            void api.post(`/huong-dan/${hd.id}/xem`, { huu_ich: true }).catch(() => undefined);
            onDaGiaiDap();
          }}
        >
          {t("✓ Đã giải đáp được")}
        </Btn>
      </div>
    </>
  );
}

/** Mua hang chon huong dan gui kem cau tra loi. */
export function ChonHuongDanModal({ open, onClose, goiYTu, onChon }: { open: boolean; onClose: () => void; goiYTu: string; onChon: (ids: number[]) => void }) {
  const { data } = useHuongDan();
  const [q, setQ] = useState("");
  const [chon, setChon] = useState<number[]>([]);
  useEffect(() => {
    if (open) {
      setQ("");
      setChon([]);
    }
  }, [open]);
  const ds = useMemo(() => data?.rows ?? [], [data]);
  const goiY = useMemo(() => goiYHuongDan(ds, goiYTu, 5), [ds, goiYTu]);
  const hien = useMemo(() => {
    if (q.trim()) return ds.filter((h) => khopTim(h.tieu_de, q) || khopTim(h.tu_khoa, q) || khopTim(h.nhom, q));
    return [...goiY, ...ds.filter((h) => !goiY.includes(h))];
  }, [ds, goiY, q]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("Gửi hướng dẫn kèm câu trả lời")}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>{t("Huỷ")}</Btn>
          <Btn disabled={chon.length === 0} onClick={() => onChon(chon)}>{t("Gửi {n} hướng dẫn", { n: chon.length })}</Btn>
        </div>
      }
    >
      <div className="space-y-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Tìm hướng dẫn…")} className="o-tim focus-ring w-full rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-base sm:text-sm" autoFocus />
        {ds.length === 0 && <div className="py-4 text-center text-sm text-[var(--color-text-secondary)]">{t("Chưa có hướng dẫn nào — thêm ở menu Hỏi đáp › Hướng dẫn tự động.")}</div>}
        {hien.map((h) => {
          const da = chon.includes(h.id);
          return (
            <label key={h.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${da ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border)]"}`}>
              <input
                type="checkbox"
                checked={da}
                disabled={!da && chon.length >= 5}
                onChange={() => setChon((v) => (da ? v.filter((x) => x !== h.id) : [...v, h.id]))}
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-[var(--color-text)]">
                  {h.tieu_de}
                  {!q.trim() && goiY.includes(h) && <span className="ml-1.5 text-[11px] font-semibold text-[var(--color-success)]">{t("· gợi ý")}</span>}
                </span>
                <span className="block truncate text-[11.5px] text-[var(--color-text-secondary)]">{[h.nhom, h.noi_dung.split("\n")[0], h.anh.length ? `🖼 ${h.anh.length}` : ""].filter(Boolean).join(" · ")}</span>
              </span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}

const O_NHAP = "focus-ring w-full rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-base sm:text-sm";

export interface HuongDanNhap {
  tieu_de: string;
  noi_dung: string;
  anh: string[];
  tu_khoa: string;
  nhom: string;
  stt: number;
  bat_tat: boolean;
}

/** Form them / sua huong dan (Mua hang / Admin). `macDinh` dung cho "Lưu thành hướng dẫn" tu 1 phien hoi dap. */
export function HuongDanForm({ open, onClose, sua, macDinh }: { open: boolean; onClose: () => void; sua?: HuongDan | null; macDinh?: Partial<HuongDanNhap> }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useHuongDan(true);
  const { tai, dangTai } = useTaiAnh("/huong-dan/anh");
  const [v, setV] = useState<HuongDanNhap>({ tieu_de: "", noi_dung: "", anh: [], tu_khoa: "", nhom: "", stt: 0, bat_tat: true });
  useEffect(() => {
    if (!open) return;
    setV(
      sua
        ? { tieu_de: sua.tieu_de, noi_dung: sua.noi_dung, anh: sua.anh, tu_khoa: sua.tu_khoa ?? "", nhom: sua.nhom ?? "", stt: sua.stt, bat_tat: !!sua.bat_tat }
        : { tieu_de: "", noi_dung: "", anh: [], tu_khoa: "", nhom: "", stt: 0, bat_tat: true, ...macDinh },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sua?.id]);
  const cacNhom = useMemo(() => [...new Set((data?.rows ?? []).map((h) => h.nhom).filter((x): x is string => !!x))], [data]);
  const luu = useMutation({
    mutationFn: () => (sua ? api.patch(`/huong-dan/${sua.id}`, v) : api.post("/huong-dan", v)),
    onSuccess: () => {
      toast(sua ? t("Đã lưu hướng dẫn") : t("Đã thêm hướng dẫn"));
      qc.invalidateQueries({ queryKey: ["huong-dan"] });
      onClose();
    },
    onError: (e) => toast(t("Lỗi: ") + describeApiError(e)),
  });
  const conAnh = HD_ANH_TOI_DA - v.anh.length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={sua ? t("Sửa hướng dẫn") : t("Thêm hướng dẫn")}
      width="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[13px] text-[var(--color-text-body)]">
            <ToggleSwitch checked={v.bat_tat} onChange={() => setV({ ...v, bat_tat: !v.bat_tat })} />
            {v.bat_tat ? t("Đang hiện cho KTV") : t("Đang ẩn")}
          </label>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={onClose}>{t("Huỷ")}</Btn>
            <Btn loading={luu.isPending} disabled={!v.tieu_de.trim() || (!v.noi_dung.trim() && v.anh.length === 0) || dangTai > 0} onClick={() => luu.mutate()}>
              {t("Lưu")}
            </Btn>
          </div>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Câu hỏi / tiêu đề *")}</span>
          <input value={v.tieu_de} onChange={(e) => setV({ ...v, tieu_de: e.target.value })} maxLength={200} placeholder={t("VD: Cách chuyển tiền và tải ảnh bằng chứng")} className={O_NHAP} />
        </label>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Nhóm")}</span>
            <input value={v.nhom} onChange={(e) => setV({ ...v, nhom: e.target.value })} list="huong-dan-nhom" maxLength={80} placeholder={t("VD: Đặt hàng, Chuyển tiền, Trả hàng")} className={O_NHAP} />
            <datalist id="huong-dan-nhom">{cacNhom.map((n) => <option key={n} value={n} />)}</datalist>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Thứ tự")}</span>
            <input type="number" value={v.stt} onChange={(e) => setV({ ...v, stt: Number(e.target.value) || 0 })} className={O_NHAP} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Nội dung hướng dẫn")}</span>
          <textarea rows={8} value={v.noi_dung} onChange={(e) => setV({ ...v, noi_dung: e.target.value })} maxLength={10000} placeholder={t("Các bước thực hiện, lưu ý…")} className={`${O_NHAP} resize-y`} />
        </label>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--color-text-body)]">{t("Hình ảnh minh hoạ ({n}/{m}) — tự tải lên Google Drive", { n: v.anh.length, m: HD_ANH_TOI_DA })}</span>
            <FileButton
              multiple
              accept="image/*"
              disabled={conAnh <= 0 || dangTai > 0}
              onFilesSelected={async (files) => {
                const urls = await tai(files.slice(0, conAnh));
                if (urls.length) setV((x) => ({ ...x, anh: [...x.anh, ...urls].slice(0, HD_ANH_TOI_DA) }));
              }}
            >
              {dangTai > 0 ? t("Đang tải {n} ảnh…", { n: dangTai }) : t("＋ Thêm ảnh")}
            </FileButton>
          </div>
          {v.anh.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-[12px] text-[var(--color-text-faint)]">{t("Chưa có ảnh")}</div>
          ) : (
            <AnhLuoi anh={v.anh} onXoa={(i) => setV((x) => ({ ...x, anh: x.anh.filter((_, j) => j !== i) }))} />
          )}
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-body)]">{t("Từ khóa / cách hỏi khác")}</span>
          <input value={v.tu_khoa} onChange={(e) => setV({ ...v, tu_khoa: e.target.value })} maxLength={1000} placeholder={t("VD: chuyển khoản, bằng chứng, ảnh CK, thanh toán")} className={O_NHAP} />
          <span className="mt-1 block text-[11.5px] text-[var(--color-text-secondary)]">{t("Từ KTV hay dùng khi hỏi — giúp app tự gợi ý và tự trả lời đúng hướng dẫn này.")}</span>
        </label>
      </div>
    </Modal>
  );
}

/** Tab quan ly huong dan o menu "Hỏi đáp" (Mua hang / Admin). */
export function HuongDanQuanLy() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useHuongDan(true);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<{ sua: HuongDan | null } | null>(null);
  const ds = useMemo(() => {
    const rows = data?.rows ?? [];
    return q.trim() ? rows.filter((h) => khopTim(h.tieu_de, q) || khopTim(h.tu_khoa, q) || khopTim(h.nhom, q) || khopTim(h.noi_dung, q)) : rows;
  }, [data, q]);
  const doi = useMutation({
    mutationFn: (a: { id: number; bat_tat?: boolean; xoa?: boolean }) =>
      a.xoa ? api.delete(`/huong-dan/${a.id}`) : api.patch(`/huong-dan/${a.id}/bat-tat`, { bat_tat: a.bat_tat }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["huong-dan"] }),
    onError: (e) => toast(t("Lỗi: ") + describeApiError(e)),
  });
  return (
    <div className="space-y-3">
      <div className="text-[13px] text-[var(--color-text-secondary)]">
        {t("Hướng dẫn hiện ngay khi KTV mở khung Hỏi đáp; khi KTV gõ câu hỏi app tự gợi ý, gửi câu hỏi thì hệ thống tự trả lời bằng hướng dẫn khớp nhất. Ảnh tự tải lên Google Drive.")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Tìm hướng dẫn…")} className="o-tim focus-ring w-full rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-base sm:w-72 sm:text-sm" />
        <span className="ml-auto" />
        <NapGoiHuongDan dangCo={data?.rows ?? []} />
        <Btn onClick={() => setForm({ sua: null })}>{t("＋ Thêm hướng dẫn")}</Btn>
      </div>
      {isLoading ? (
        <div className="py-8 text-center text-sm text-[var(--color-text-secondary)]">{t("Đang tải...")}</div>
      ) : ds.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-text-secondary)]">
          {t("Chưa có hướng dẫn nào. Bấm \"Thêm hướng dẫn\" để soạn câu trả lời mẫu cho các thắc mắc KTV hay hỏi.")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)]">
          <table className="tbl w-full">
            <thead className="tbl-head">
              <tr>
                <th className="text-left">{t("Hướng dẫn")}</th>
                <th className="text-left">{t("Nhóm")}</th>
                <th className="text-right">{t("Ảnh")}</th>
                <th className="text-right">{t("Lượt xem")}</th>
                <th className="text-right">{t("Đã giải đáp")}</th>
                <th className="text-left">{t("Cập nhật")}</th>
                <th className="text-center">{t("Hiện")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ds.map((h) => (
                <tr key={h.id} className={h.bat_tat ? "" : "opacity-60"}>
                  <td>
                    <button type="button" onClick={() => setForm({ sua: h })} className="block max-w-[420px] truncate text-left font-semibold text-[var(--color-primary-dark)] hover:underline" title={h.tieu_de}>
                      {h.tieu_de}
                    </button>
                    {h.tu_khoa && <span className="block max-w-[420px] truncate text-[11.5px] text-[var(--color-text-secondary)]" title={h.tu_khoa}>{h.tu_khoa}</span>}
                  </td>
                  <td>{h.nhom ?? <span className="text-[var(--color-text-faint)]">—</span>}</td>
                  <td className="tabular text-right">{h.anh.length}</td>
                  <td className="tabular text-right">{h.luot_xem}</td>
                  <td className="tabular text-right">{h.luot_huu_ich}</td>
                  <td className="whitespace-nowrap">{fmtDateTime(h.ngay_cap_nhat)}{h.ten_nguoi_cap_nhat ? ` · ${h.ten_nguoi_cap_nhat}` : ""}</td>
                  <td className="text-center"><ToggleSwitch checked={!!h.bat_tat} onChange={() => doi.mutate({ id: h.id, bat_tat: !h.bat_tat })} /></td>
                  <td className="whitespace-nowrap text-right">
                    <Btn size="sm" variant="ghost" onClick={() => setForm({ sua: h })}>{t("Sửa")}</Btn>
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(t("Xoá hướng dẫn \"{a}\"?", { a: h.tieu_de }))) doi.mutate({ id: h.id, xoa: true });
                      }}
                    >
                      {t("Xoá")}
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <HuongDanForm open={!!form} onClose={() => setForm(null)} sua={form?.sua} />
    </div>
  );
}
