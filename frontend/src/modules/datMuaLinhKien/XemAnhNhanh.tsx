import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, type Tone } from "../../components/x/Badge";
import { fmtDateTime, fmtVND } from "../../types";
import { docTienDocMap } from "./DocTienAnh";
import { BangChungAnhList, docAnhBangChung, type BangChungPxk } from "./BangChungChuyenTien";
import { CHUYEN_TIEN_OPTIONS, CHUYEN_TIEN_TONE } from "./constants";

// XEM ANH NHANH (2026-09-30, phan hoi "thêm chức năng xem ảnh nhanh, hiện thông tin bên phải ảnh đang xem như tiền đã đọc
// được bằng OCR, mã HĐ, mã PXK, ngày tháng, người chuyển, trạng thái xác nhận..., ấn trái phải để next ảnh tiếp theo").
// 1 trinh xem DUNG CHUNG: anh ben trai, thong tin ben phai (mobile: duoi anh); ‹ › / phim ← → / vuot de chuyen anh, Esc dong.
// Danh sach anh do NOI GOI dung (vd moi anh cua cac dong tren trang dang xem) -> chuyen anh chay xuyen qua cac dong.

export interface DongThongTin {
  nhan: string;
  giaTri: ReactNode;
}
export interface AnhXem {
  url: string;
  tieuDe: string; // vd ma HD / ma PXK - dong dam dau khung thong tin
  phu?: string; // vd "Ảnh 2/3 của phiếu"
  dong: DongThongTin[];
}

export function XemAnhNhanh({ items, batDau, onClose }: { items: AnhXem[]; batDau: number; onClose: () => void }) {
  const [idx, setIdx] = useState(Math.min(Math.max(0, batDau), Math.max(0, items.length - 1)));
  const [loiAnh, setLoiAnh] = useState(false);
  const cham = useRef<number | null>(null);
  const tong = items.length;
  const cur = items[idx];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(tong - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, tong]);

  // Tai truoc anh ke ben -> bam next hien ngay.
  useEffect(() => {
    setLoiAnh(false);
    for (const j of [idx - 1, idx + 1]) {
      if (items[j]) new Image().src = items[j].url;
    }
  }, [idx, items]);

  if (!cur) return null;
  const nutDieuHuong = "focus-ring absolute top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/30 disabled:opacity-25 disabled:cursor-default";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm anim-in md:flex-row" role="dialog" aria-label="Xem ảnh">
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-4 md:p-8"
        onClick={onClose}
        onTouchStart={(e) => { cham.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const x0 = cham.current;
          const x1 = e.changedTouches[0]?.clientX;
          cham.current = null;
          if (x0 == null || x1 == null || Math.abs(x1 - x0) < 50) return;
          setIdx((i) => (x1 < x0 ? Math.min(tong - 1, i + 1) : Math.max(0, i - 1)));
        }}
      >
        <span className="absolute left-4 top-4 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white">
          {idx + 1} / {tong}
        </span>
        {loiAnh ? (
          <span className="text-sm text-white/70">Không tải được ảnh</span>
        ) : (
          <img
            key={cur.url}
            src={cur.url}
            alt={cur.tieuDe}
            onError={() => setLoiAnh(true)}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        )}
        <button
          type="button"
          aria-label="Ảnh trước"
          disabled={idx === 0}
          onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.max(0, i - 1)); }}
          className={`${nutDieuHuong} left-3`}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Ảnh sau"
          disabled={idx >= tong - 1}
          onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.min(tong - 1, i + 1)); }}
          className={`${nutDieuHuong} right-3`}
        >
          ›
        </button>
      </div>

      <aside className="flex max-h-[42vh] w-full shrink-0 flex-col overflow-y-auto bg-[var(--color-surface)] md:max-h-none md:w-[340px]">
        <div className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold text-[var(--color-text)]">{cur.tieuDe}</div>
            {cur.phu && <div className="text-[12px] text-[var(--color-text-secondary)]">{cur.phu}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            ✕
          </button>
        </div>
        <dl className="flex-1 divide-y divide-[var(--color-border-soft)] px-4">
          {cur.dong.map((d) => (
            <div key={d.nhan} className="flex items-start justify-between gap-3 py-2 text-[13px]">
              <dt className="shrink-0 text-[var(--color-text-secondary)]">{d.nhan}</dt>
              <dd className="min-w-0 text-right font-medium text-[var(--color-text)] break-words">{d.giaTri ?? "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-2.5 text-[12px]">
          <span className="text-[var(--color-text-secondary)]">← → để chuyển ảnh · Esc để đóng</span>
          <a href={cur.url} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-[var(--color-primary)] hover:underline">
            Mở ảnh gốc ↗
          </a>
        </div>
      </aside>
    </div>
  );
}

/** O "Tiền đọc từ ảnh (OCR)": so / khong doc duoc / chua doc. */
export function tienOcrNode(tienDoc: Record<string, number | null | undefined>, url: string): ReactNode {
  if (!(url in tienDoc)) return <span className="text-[var(--color-text-faint)]">Chưa đọc</span>;
  const v = tienDoc[url];
  return v == null ? (
    <span className="text-[var(--color-warning-strong)]">Không đọc được — kiểm tra bằng mắt</span>
  ) : (
    <span className="text-[var(--color-success-strong)]">{fmtVND(v)}</span>
  );
}

/** Ma HD = ma_xuat_kho khi TN da nhap ma rieng (khac ID phieu). */
export function maHdCua(maXuatKho: string | null | undefined, pxkId: string): string {
  return maXuatKho && maXuatKho !== pxkId ? maXuatKho : "Chưa có";
}

export interface PxkAnhXem extends BangChungPxk {
  id: string;
  ma_xuat_kho?: string | null;
  nguoi_nhan_hang?: string | null;
  so_tien_can_chuyen?: number | null;
  da_thanh_toan?: number;
  tien_thuc_chuyen?: number | null;
  trang_thai_chuyen_tien?: string | null;
  ngay_ktv_chuyen?: string | null;
}

/** Danh sach anh bang chung chuyen tien cua 1 PXK + thong tin (dung cho danh sach PXK, chi tiet PXK, chi tiet don). */
export function anhXemCuaPxk(pxk: PxkAnhXem, ten: (email: string | null | undefined) => string): AnhXem[] {
  const urls = docAnhBangChung(pxk);
  const tienDoc = docTienDocMap(pxk.bang_chung_tien_doc);
  const tt = pxk.trang_thai_chuyen_tien ?? "";
  const nhanTt = CHUYEN_TIEN_OPTIONS.find((o) => o.value === tt)?.label ?? (tt || "—");
  return urls.map((url, i) => ({
    url,
    tieuDe: pxk.ma_xuat_kho && pxk.ma_xuat_kho !== pxk.id ? `${pxk.ma_xuat_kho} · ${pxk.id}` : pxk.id,
    phu: `Ảnh ${i + 1}/${urls.length} của phiếu`,
    dong: [
      { nhan: "Tiền đọc từ ảnh (OCR)", giaTri: tienOcrNode(tienDoc, url) },
      { nhan: "Mã HĐ", giaTri: maHdCua(pxk.ma_xuat_kho, pxk.id) },
      { nhan: "Mã PXK", giaTri: pxk.id },
      { nhan: "Người chuyển", giaTri: ten(pxk.nguoi_nhan_hang) || "—" },
      { nhan: "KTV báo chuyển lúc", giaTri: pxk.ngay_ktv_chuyen ? fmtDateTime(pxk.ngay_ktv_chuyen) : "—" },
      { nhan: "Trạng thái xác nhận", giaTri: <Badge tone={(CHUYEN_TIEN_TONE[tt] ?? "neutral") as Tone}>{nhanTt}</Badge> },
      { nhan: "Tiền cần chuyển", giaTri: fmtVND(pxk.so_tien_can_chuyen) },
      { nhan: "Đã trả cho phiếu", giaTri: fmtVND(pxk.da_thanh_toan ?? 0) },
      ...(pxk.tien_thuc_chuyen ? [{ nhan: "Kế toán xác nhận thực nhận", giaTri: fmtVND(pxk.tien_thuc_chuyen) }] : []),
      ...(pxk.bang_chung_chuyen_tien_ghi_chu ? [{ nhan: "Ghi chú KTV", giaTri: pxk.bang_chung_chuyen_tien_ghi_chu }] : []),
      ...(pxk.ly_do_tu_choi_chuyen_tien ? [{ nhan: "Kế toán từ chối", giaTri: pxk.ly_do_tu_choi_chuyen_tien }] : []),
    ],
  }));
}

/** Anh bang chung cua 1 PXK (chi tiet PXK / chi tiet don) - bam anh mo "Xem ảnh nhanh" trong pham vi anh cua phieu do. */
export function BangChungAnhPxk({ pxk, ten, nho }: { pxk: PxkAnhXem; ten: (email: string | null | undefined) => string; nho?: boolean }) {
  const [xem, setXem] = useState<number | null>(null);
  const urls = docAnhBangChung(pxk);
  if (urls.length === 0) return null;
  return (
    <>
      <BangChungAnhList urls={urls} nho={nho} onXem={setXem} />
      {xem != null && <XemAnhNhanh items={anhXemCuaPxk(pxk, ten)} batDau={xem} onClose={() => setXem(null)} />}
    </>
  );
}
