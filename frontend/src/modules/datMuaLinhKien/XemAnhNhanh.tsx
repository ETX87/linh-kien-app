import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, type Tone } from "../../components/x/Badge";
import { fmtDateTime, fmtVND } from "../../types";
import { docDsAnh, docTienDocMap, useDocTienAnh, type TienDocMap } from "./DocTienAnh";
import { BangChungAnhList, docAnhBangChung, type BangChungPxk } from "./BangChungChuyenTien";
import { CHUYEN_TIEN_OPTIONS, CHUYEN_TIEN_TONE } from "./constants";
import { t } from "../../i18n";
import { linkAnToan } from "../../lib/linhAnToan";

// XEM ANH NHANH (2026-09-30, phan hoi "thêm chức năng xem ảnh nhanh, hiện thông tin bên phải ảnh đang xem như tiền đã đọc
// được bằng OCR, mã HĐ, mã PXK, ngày tháng, người chuyển, trạng thái xác nhận..., ấn trái phải để next ảnh tiếp theo").
// 1 trinh xem DUNG CHUNG: anh ben trai, thong tin ben phai (mobile: duoi anh); ‹ › / phim ← → / vuot de chuyen anh, Esc dong.
// Danh sach anh do NOI GOI dung (vd moi anh cua cac dong tren trang dang xem) -> chuyen anh chay xuyen qua cac dong.
// Khung thong tin (sap lai 2026-09-30, phan hoi "các thông tin tiền để gần nhau, tô màu dễ nhìn, so sánh nhanh tiền OCR đọc
// và tiền kế toán xác nhận, hiện cảnh báo nhắc nhở - đối soát trên máy người dùng"): 3 khoi Đối soát tiền / Chứng từ / Ghi
// chú. Doi soat chay HOAN TOAN tren may: anh chua co so (hoac da luu "không đọc được") duoc doc lai bang useDocTienAnh.

export interface DongThongTin {
  nhan: string;
  giaTri: ReactNode;
}
export interface AnhXem {
  url: string;
  tieuDe: string; // vd ma HD / ma PXK
  phu?: string; // vd "Ảnh 2/3 của phiếu"
  trangThai?: ReactNode; // badge trang thai xac nhan
  // Doi soat: moi anh cua CUNG 1 khoan/phieu (urlsNhom) + so OCR da luu; urlsTinh = anh tinh vao lan chuyen nay (bo anh
  // da ghi nhan o lan duyet truoc). soSanh = so dem doi chieu voi tong OCR (Ke toan xac nhan / con phai chuyen).
  urlsNhom: string[];
  urlsTinh: string[];
  tienDoc: TienDocMap;
  tien: DongThongTin[];
  soSanh: { nhan: string; giaTri: number } | null;
  chungTu: DongThongTin[];
  ghiChu: DongThongTin[];
}

function KhoiTieuDe({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">{children}</div>;
}

function DanhSachDong({ dong }: { dong: DongThongTin[] }) {
  return (
    <dl className="divide-y divide-[var(--color-border-soft)] px-4">
      {dong.map((d) => (
        <div key={d.nhan} className="flex items-start justify-between gap-3 py-1.5 text-[13px]">
          <dt className="shrink-0 text-[var(--color-text-secondary)]">{d.nhan}</dt>
          <dd className="min-w-0 break-words text-right font-medium text-[var(--color-text)]">{d.giaTri ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Khoi "Đối soát tiền": so OCR anh dang xem + tong OCR cac anh + cac so tien, ket luan Khop/Lech + nhac nho. */
function DoiSoatTien({ cur }: { cur: AnhXem }) {
  const doc = useDocTienAnh(cur.urlsNhom, cur.tienDoc);
  const soCua = (u: string) => doc.items.find((i) => i.url === u);
  const anhNay = soCua(cur.url);
  const tinh = cur.urlsTinh.map((u) => soCua(u)).filter((x): x is NonNullable<typeof x> => !!x);
  const dangDoc = tinh.filter((i) => !i.xong).length;
  const khongDoc = tinh.filter((i) => i.xong && i.soTien == null).length;
  const tongOcr = tinh.reduce((s, i) => s + (i.soTien ?? 0), 0);
  const duDuLieu = tinh.length > 0 && dangDoc === 0 && khongDoc === 0;
  const lech = duDuLieu && cur.soSanh ? tongOcr - cur.soSanh.giaTri : null;

  const nhacNho: { tone: "warning" | "danger" | "info"; text: string }[] = [];
  if (anhNay && anhNay.xong && anhNay.soTien == null) nhacNho.push({ tone: "warning", text: t("Không đọc được số tiền trên ảnh này — kiểm tra bằng mắt.") });
  if (dangDoc > 0) nhacNho.push({ tone: "info", text: t("Đang đọc {a} ảnh trên máy này…", { a: dangDoc }) });
  if (khongDoc > 0 && tinh.length > 1) nhacNho.push({ tone: "warning", text: t("{a}/{b} ảnh không đọc được số — tổng OCR chưa đủ, đối chiếu bằng mắt.", { a: khongDoc, b: tinh.length }) });
  if (lech != null && lech !== 0 && cur.soSanh) {
    nhacNho.push({
      tone: "danger",
      text: lech < 0
        ? t("Ảnh cho thấy chuyển THIẾU {a} so với {b}.", { a: fmtVND(-lech), b: cur.soSanh.nhan.toLowerCase() })
        : t("Ảnh cho thấy chuyển DƯ {a} so với {b}.", { a: fmtVND(lech), b: cur.soSanh.nhan.toLowerCase() }),
    });
  }
  if (!cur.urlsTinh.includes(cur.url)) nhacNho.push({ tone: "info", text: t("Ảnh này đã được ghi nhận ở lần duyệt trước — không cộng vào lần chuyển này.") });

  const oTien = (nhan: string, giaTri: ReactNode, mau: string) => (
    <div className={`rounded-lg px-2.5 py-2 ${mau}`}>
      <div className="text-[11px] font-semibold opacity-80">{nhan}</div>
      <div className="mt-0.5 text-[15px] font-bold tabular-nums">{giaTri}</div>
    </div>
  );
  const giaTriAnhNay = !anhNay || !anhNay.xong ? t("Đang đọc…") : anhNay.soTien == null ? t("Không đọc được") : fmtVND(anhNay.soTien);

  return (
    <>
      <KhoiTieuDe>{t("Đối soát tiền")}</KhoiTieuDe>
      <div className="grid grid-cols-2 gap-2 px-4">
        {oTien(
          t("OCR ảnh này"),
          giaTriAnhNay,
          anhNay?.xong && anhNay.soTien != null
            ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
            : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]",
        )}
        {oTien(
          tinh.length > 1 ? t("Tổng OCR {a} ảnh", { a: tinh.length }) : t("Tổng OCR"),
          dangDoc > 0 ? t("Đang đọc…") : fmtVND(tongOcr) + (khongDoc > 0 ? " *" : ""),
          "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]",
        )}
        {cur.tien.map((tien) => (
          <div key={tien.nhan}>{oTien(tien.nhan, tien.giaTri, "bg-[var(--color-surface-soft)] text-[var(--color-text)]")}</div>
        ))}
      </div>
      {cur.soSanh && (
        <div
          className={`mx-4 mt-2 rounded-lg px-3 py-2 text-[13px] font-semibold ${
            lech == null
              ? "bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)]"
              : lech === 0
                ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
                : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
          }`}
        >
          {lech == null
            ? t("So với {a} ({b}): chưa đủ dữ liệu OCR để kết luận", { a: cur.soSanh.nhan.toLowerCase(), b: fmtVND(cur.soSanh.giaTri) })
            : lech === 0
              ? t("✓ Khớp — tổng OCR bằng {a} ({b})", { a: cur.soSanh.nhan.toLowerCase(), b: fmtVND(cur.soSanh.giaTri) })
              : t("⚠ Lệch {a}{b} — OCR {c} / {d} {e}", { a: lech > 0 ? "+" : "−", b: fmtVND(Math.abs(lech)), c: fmtVND(tongOcr), d: cur.soSanh.nhan.toLowerCase(), e: fmtVND(cur.soSanh.giaTri) })}
        </div>
      )}
      {nhacNho.length > 0 && (
        <ul className="mx-4 mt-2 space-y-1">
          {nhacNho.map((n) => (
            <li
              key={n.text}
              className={`rounded-md px-2.5 py-1.5 text-[12px] ${
                n.tone === "danger"
                  ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
                  : n.tone === "warning"
                    ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
                    : "bg-[var(--color-info-soft)] text-[var(--color-info)]"
              }`}
            >
              {n.text}
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 pt-1 text-[11px] text-[var(--color-text-faint)]">{t("Số OCR tự đọc từ ảnh (đọc 1 lần, lưu dùng chung), chỉ để nhắc — có thể đọc sai, luôn đối chiếu ảnh.")}</div>
    </>
  );
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
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm anim-in md:flex-row" role="dialog" aria-label={t("Xem ảnh")}>
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
          <span className="text-sm text-white/70">{t("Không tải được ảnh")}</span>
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
          aria-label={t("Ảnh trước")}
          disabled={idx === 0}
          onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.max(0, i - 1)); }}
          className={`${nutDieuHuong} left-3`}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label={t("Ảnh sau")}
          disabled={idx >= tong - 1}
          onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.min(tong - 1, i + 1)); }}
          className={`${nutDieuHuong} right-3`}
        >
          ›
        </button>
      </div>

      <aside className="flex max-h-[48vh] w-full shrink-0 flex-col overflow-y-auto bg-[var(--color-surface)] md:max-h-none md:w-[360px]">
        <div className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold text-[var(--color-text)]">{cur.tieuDe}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-text-secondary)]">
              {cur.trangThai}
              {cur.phu && <span>{cur.phu}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Đóng")}
            className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 pb-3">
          <DoiSoatTien key={cur.url} cur={cur} />
          <KhoiTieuDe>{t("Chứng từ")}</KhoiTieuDe>
          <DanhSachDong dong={cur.chungTu} />
          {cur.ghiChu.length > 0 && (
            <>
              <KhoiTieuDe>{t("Ghi chú")}</KhoiTieuDe>
              <DanhSachDong dong={cur.ghiChu} />
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-2.5 text-[12px]">
          <span className="text-[var(--color-text-secondary)]">{t("← → để chuyển ảnh · Esc để đóng")}</span>
          <a href={linkAnToan(cur.url)} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-[var(--color-primary)] hover:underline">
            {t("Mở ảnh gốc ↗")}
          </a>
        </div>
      </aside>
    </div>
  );
}

/** Ma HD = ma_xuat_kho khi TN da nhap ma rieng (khac ID phieu). */
export function maHdCua(maXuatKho: string | null | undefined, pxkId: string): string {
  return maXuatKho && maXuatKho !== pxkId ? maXuatKho : t("Chưa có");
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
  const nhanTtGoc = CHUYEN_TIEN_OPTIONS.find((o) => o.value === tt)?.label;
  const nhanTt = nhanTtGoc ? t(nhanTtGoc) : tt || "—";
  const daDuyet = tt === "TN da duyet";
  const tong = pxk.so_tien_can_chuyen ?? 0;
  const daTra = pxk.da_thanh_toan ?? 0;
  // Da duyet: doi chieu TONG OCR moi anh voi tong Ke toan xac nhan thuc nhan. Chua duyet: chi anh CHUA ghi nhan (lan chuyen
  // nay) voi so con phai chuyen.
  const daGhiNhan = new Set(docDsAnh(pxk.anh_da_ghi_nhan));
  const urlsTinh = daDuyet ? urls : urls.filter((u) => !daGhiNhan.has(u));
  const soSanh = daDuyet
    ? pxk.tien_thuc_chuyen ? { nhan: t("Kế toán xác nhận"), giaTri: pxk.tien_thuc_chuyen } : null
    : tong - daTra > 0 ? { nhan: t("Còn phải chuyển"), giaTri: tong - daTra } : null;
  return urls.map((url, i) => ({
    url,
    tieuDe: pxk.ma_xuat_kho && pxk.ma_xuat_kho !== pxk.id ? `${pxk.ma_xuat_kho} · ${pxk.id}` : pxk.id,
    phu: t("Ảnh {a}/{b} của phiếu", { a: i + 1, b: urls.length }),
    trangThai: <Badge tone={(CHUYEN_TIEN_TONE[tt] ?? "neutral") as Tone}>{nhanTt}</Badge>,
    urlsNhom: urls,
    urlsTinh,
    tienDoc,
    tien: [
      { nhan: t("Tiền cần chuyển"), giaTri: fmtVND(tong) },
      { nhan: t("Đã trả cho phiếu"), giaTri: fmtVND(daTra) },
      ...(pxk.tien_thuc_chuyen ? [{ nhan: t("Kế toán xác nhận"), giaTri: fmtVND(pxk.tien_thuc_chuyen) }] : []),
    ],
    soSanh,
    chungTu: [
      { nhan: t("Mã HĐ"), giaTri: maHdCua(pxk.ma_xuat_kho, pxk.id) },
      { nhan: t("Mã PXK"), giaTri: pxk.id },
      { nhan: t("Người chuyển"), giaTri: ten(pxk.nguoi_nhan_hang) || "—" },
      { nhan: t("KTV báo chuyển lúc"), giaTri: pxk.ngay_ktv_chuyen ? fmtDateTime(pxk.ngay_ktv_chuyen) : "—" },
    ],
    ghiChu: [
      ...(pxk.bang_chung_chuyen_tien_ghi_chu ? [{ nhan: t("Ghi chú KTV"), giaTri: pxk.bang_chung_chuyen_tien_ghi_chu }] : []),
      ...(pxk.ly_do_tu_choi_chuyen_tien ? [{ nhan: t("Bị trả lại"), giaTri: pxk.ly_do_tu_choi_chuyen_tien }] : []),
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
