import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import { anhVuaGioiHan } from "../../lib/imageCompress";
import { Btn } from "../../components/ui/Btn";
import { FileButton } from "../../components/ui/FileButton";
import { Select } from "../../components/ui/Select";
import { ImageLink } from "./SharedUi";
import { describeApiError } from "./helpers";
import { fmtDateTime, fmtVND } from "../../types";
import { KvRow } from "../../components/ui/KvRow";
import { Money } from "../../components/ui/Money";
import { ghiNhoAnhCucBo } from "../../lib/docTienAnh";
import { TienDocTuAnh, docDsAnh, docTienDocMap, useDocTienAnh } from "./DocTienAnh";
import { t } from "../../i18n";
import { baoLoiTaiAnh, canhBaoHanMucAnh, type HanMucAnh } from "../../lib/hanMucAnh";

// Bang chung chuyen tien PXK NHIEU anh (toi da 5, chot 2026-09-29 - migration 0043, backend
// lib/bangChungChuyenTien.ts). Dung chung cho chi tiet PXK (PhieuXuatKhoTab) va khoi PXK trong chi tiet don cua KTV
// (DonCuaToiTab) - truoc day 2 noi chep tay cung 1 form 1 anh. Tong tien doi (gop them don / tinh lai chiet khau) thi
// phieu ve "Cho KTV chuyen" nhung GIU anh cu: form mo lai voi anh cu, KTV chuyen bo sung + them anh roi xac nhan lai.
export const MAX_ANH_BANG_CHUNG = 5;

export interface BangChungPxk {
  bang_chung_chuyen_tien_url?: string | null;
  bang_chung_chuyen_tien_anh?: string | null;
  bang_chung_chuyen_tien_ghi_chu?: string | null;
  // Ly do Ke toan tu choi GAN NHAT (migration 0046) - con gia tri toi khi KTV xac nhan chuyen lai.
  ly_do_tu_choi_chuyen_tien?: string | null;
  tu_choi_chuyen_tien_luc?: string | null;
  // Doi chieu so tien doc tu anh (migration 0051): so da doc luu kem tung anh + anh da nam trong khoan Ke toan DA DUYET
  // (anh giu qua cac lan chuyen bo sung - khong cong lai).
  bang_chung_tien_doc?: string | null;
  anh_da_ghi_nhan?: string | null;
  so_tien_can_chuyen?: number | null;
  da_thanh_toan?: number;
}

/** Anh cua lan chuyen DANG xet = anh dang dinh kem tru anh da duoc Ke toan duyet o khoan truoc. */
export function anhChuaGhiNhan(urls: string[], pxk: BangChungPxk): string[] {
  const da = new Set(docDsAnh(pxk.anh_da_ghi_nhan));
  return urls.filter((u) => !da.has(u));
}

/** Thong bao do "Kế toán từ chối bằng chứng" (hien khi phieu da bi day ve "Chờ KTV chuyển"). */
export function LyDoTuChoiChuyenTien({ pxk }: { pxk: BangChungPxk }) {
  if (!pxk.ly_do_tu_choi_chuyen_tien) return null;
  return (
    <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-danger-strong)]">
      <span className="font-bold">{pxk.ly_do_tu_choi_chuyen_tien.startsWith("(TN)") ? t("Tác nghiệp trả lại") : t("Kế toán từ chối")} {t("bằng chứng")}{pxk.tu_choi_chuyen_tien_luc ? ` (${fmtDateTime(pxk.tu_choi_chuyen_tien_luc)})` : ""}:</span>{" "}
      {pxk.ly_do_tu_choi_chuyen_tien}
      <div className="mt-0.5 font-medium">{t("Kiểm tra lại số tiền/bằng chứng, chuyển bổ sung nếu thiếu, thêm ảnh rồi bấm “Đã chuyển”.")}</div>
    </div>
  );
}

/**
 * Quy du KTV (2026-09-29, migration 0047): tien cua phieu sau khi tru quy/da tra. `so_tien_can_chuyen` = TONG gia tri
 * phieu; con phai chuyen = tong - da_thanh_toan. Dung chung chi tiet PXK + khoi PXK trong chi tiet don.
 */
export function TienPhieuVaQuy({ tong, daThanhToan, daDuyet, quyDu }: { tong: number; daThanhToan: number; daDuyet: boolean; quyDu?: number | null }) {
  const con = Math.max(0, tong - daThanhToan);
  return (
    <>
      <KvRow label={t("Tổng tiền phiếu")}><Money>{fmtVND(tong)}</Money></KvRow>
      {daThanhToan > 0 && (
        <KvRow label={t("Đã thanh toán")}>
          <Money>{fmtVND(Math.min(daThanhToan, tong))}</Money>
          <span className="text-[11px] text-[var(--color-text-secondary)]"> {t("(tiền đã chuyển + quỹ dư)")}</span>
        </KvRow>
      )}
      {!daDuyet && (
        <KvRow label={t("Còn phải chuyển")}>
          <span className="font-semibold text-[var(--color-success-strong)]"><Money>{fmtVND(con)}</Money></span>
        </KvRow>
      )}
      {quyDu != null && (
        <KvRow label={t("Quỹ dư hiện tại")}>
          <Money>{fmtVND(quyDu)}</Money>
          {quyDu > 0 && <span className="text-[11px] text-[var(--color-text-secondary)]"> {t("— tự trừ vào phiếu cần chuyển tiếp theo")}</span>}
        </KvRow>
      )}
    </>
  );
}

/**
 * Ke toan DUYET khoan chuyen voi SO TIEN THUC NHAN (quy du, migration 0047): mac dinh = so con phai chuyen. Du -> vao quy
 * cua nguoi nhan hang; thieu -> phieu ve "Chờ KTV chuyển" so con thieu. So khac so can chuyen thi phai xac nhan lan 2.
 */
export function DuyetChuyenTienForm({ pxkId, conPhaiChuyen, pxk, onDone, addToast }: {
  pxkId: string;
  conPhaiChuyen: number;
  pxk?: BangChungPxk;
  onDone: () => void;
  addToast: (msg: string) => void;
}) {
  const [soTien, setSoTien] = useState(String(conPhaiChuyen));
  const [xacNhan, setXacNhan] = useState(false);
  const so = Number(soTien);
  // Phieu da duoc tra DU bang quy du (2026-09-30): Ke toan chi xac nhan, thuc nhan 0d hop le (khop backend).
  const traDuBangQuy = conPhaiChuyen === 0;
  const hopLe = soTien.trim() !== "" && Number.isInteger(so) && (so > 0 || (so === 0 && traDuBangQuy));
  // Tu doc so tien tren anh (2026-09-30): dung so KTV da doc luc tai anh, anh chua co so thi doc tren may Ke toan.
  const tatCaAnh = pxk ? docAnhBangChung(pxk) : [];
  const doc = useDocTienAnh(pxk ? anhChuaGhiNhan(tatCaAnh, pxk) : [], docTienDocMap(pxk?.bang_chung_tien_doc));
  const chenh = hopLe ? so - conPhaiChuyen : 0;
  const duyet = useMutation({
    mutationFn: () => api.patch<{ conThieu: number; soDuQuy: number }>(`/phieu-xuat-kho/${pxkId}/chuyen-tien`, { trang_thai: "TN da duyet", so_tien_thuc_nhan: so }),
    onSuccess: (r) => {
      addToast(r.conThieu > 0 ? t("Đã ghi nhận — còn thiếu {a}, phiếu về Chờ KTV chuyển", { a: fmtVND(r.conThieu) }) : chenh > 0 ? t("Đã duyệt — dư {a} vào quỹ", { a: fmtVND(chenh) }) : t("Đã duyệt chuyển tiền"));
      setXacNhan(false);
      onDone();
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11.5px] font-semibold text-[var(--color-text-secondary)]" htmlFor={`thuc-nhan-${pxkId}`}>{t("Số tiền thực nhận")}</label>
        <input
          id={`thuc-nhan-${pxkId}`}
          type="number"
          min={traDuBangQuy ? 0 : 1}
          inputMode="numeric"
          value={soTien}
          onChange={(e) => { setSoTien(e.target.value); setXacNhan(false); }}
          className="focus-ring w-36 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-base sm:text-sm"
        />
        <Btn
          size="sm"
          onClick={() => (chenh !== 0 && !xacNhan ? setXacNhan(true) : duyet.mutate())}
          disabled={!hopLe || duyet.isPending || xacNhan}
          loading={duyet.isPending}
        >
          {traDuBangQuy ? t("Xác nhận đã đủ tiền") : t("Duyệt bằng chứng")}
        </Btn>
      </div>
      {traDuBangQuy && (
        <div className="rounded-lg border border-[var(--color-info)]/30 bg-[var(--color-info-soft)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text)]">
          {t("Phiếu đã được trừ đủ từ")} <b>{t("quỹ dư")}</b> {t("của người nhận hàng (tiền Kế toán đã xác nhận ở phiếu trước) — KTV không cần chuyển thêm.")}
          {t("Kiểm tra lịch sử quỹ rồi xác nhận với số thực nhận")} <b>{t("0đ")}</b> {t("(hoặc nhập số KTV đã chuyển thêm nếu có — phần dư vào quỹ).")}
        </div>
      )}
      <TienDocTuAnh doc={doc} soSoSanh={hopLe ? so : null} nhan={t("số thực nhận")} sttCua={(u) => tatCaAnh.indexOf(u) + 1} />
      {hopLe && chenh !== 0 && (
        <div className={`rounded-lg border px-2.5 py-1.5 text-[11.5px] ${chenh > 0 ? "border-[var(--color-info)]/30 bg-[var(--color-info-soft)] text-[var(--color-text)]" : "border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"}`}>
          {chenh > 0 ? (
            <>{t("Cần chuyển")} <Money>{fmtVND(conPhaiChuyen)}</Money> {t("— nhận")} <Money>{fmtVND(so)}</Money> → <b>{t("dư")} <Money>{fmtVND(chenh)}</Money> {t("vào quỹ")}</b> {t("của người nhận hàng (tự trừ cho phiếu sau).")}</>
          ) : (
            <>{t("Cần chuyển")} <Money>{fmtVND(conPhaiChuyen)}</Money> {t("— nhận")} <Money>{fmtVND(so)}</Money> → <b>{t("còn thiếu")} <Money>{fmtVND(-chenh)}</Money></b> {t("(trừ quỹ dư nếu có), phiếu về “Chờ KTV chuyển” số còn thiếu.")}</>
          )}
          {xacNhan && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="font-semibold">{t("Số thực nhận khác số cần chuyển — kiểm tra lại sao kê trước khi xác nhận.")}</span>
              <Btn size="sm" onClick={() => duyet.mutate()} disabled={duyet.isPending} loading={duyet.isPending}>{t("Xác nhận nhận")} <Money>{fmtVND(so)}</Money></Btn>
              <Btn size="sm" variant="ghost" onClick={() => setXacNhan(false)} disabled={duyet.isPending}>{t("Sửa lại")}</Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface KhoanChuyenTien {
  id: number;
  trang_thai: "Da duyet" | "Tu choi" | "Da huy";
  tong_phieu: number | null;
  da_thanh_toan_truoc: number;
  so_tien_can_chuyen: number | null;
  so_tien_thuc_nhan: number | null;
  ly_do_tu_choi: string | null;
  nguoi_duyet: string;
  duyet_luc: string;
  lich_su: number;
  // Ke toan sua so thuc nhan / huy khoan duyet nham (migration 0049).
  thuc_nhan_goc?: number | null;
  ly_do_sua?: string | null;
  huy_luc?: string | null;
  ly_do_huy?: string | null;
}

/** Cac lan Ke toan duyet / tu choi khoan chuyen cua 1 phieu (moi nhat truoc). */
export function LichSuKhoanChuyen({ rows }: { rows: KhoanChuyenTien[] }) {
  return (
    <div className="mt-2 border-t border-[var(--color-border)] pt-2">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">{t("Các lần Kế toán xác nhận")}</div>
      <ul className="space-y-1">
        {rows.map((k) => {
          const chenh = (k.so_tien_thuc_nhan ?? 0) - (k.so_tien_can_chuyen ?? 0);
          return (
            <li key={k.id} className="text-[11.5px] text-[var(--color-text-body)]">
              <span className="text-[var(--color-text-secondary)]">{fmtDateTime(k.duyet_luc)}</span>{" "}
              {k.trang_thai === "Tu choi" ? (
                <span className="text-[var(--color-danger-strong)]">{t("Từ chối — {a}", { a: k.ly_do_tu_choi })}</span>
              ) : k.trang_thai === "Da huy" ? (
                <span className="text-[var(--color-text-secondary)]">
                  <s>{t("Nhận")} <Money>{fmtVND(k.so_tien_thuc_nhan)}</Money></s> — <span className="text-[var(--color-danger-strong)]">{t("Kế toán đã hủy")}{k.huy_luc ? t(" lúc {a}", { a: fmtDateTime(k.huy_luc) }) : ""}: {k.ly_do_huy}</span>
                </span>
              ) : (
                <>
                  {t("Nhận")} <b><Money>{fmtVND(k.so_tien_thuc_nhan)}</Money></b> {t("/ cần")} <Money>{fmtVND(k.so_tien_can_chuyen)}</Money>
                  {!k.lich_su && chenh > 0 && <span className="text-[var(--color-success-strong)]"> {t("· dư")} <Money>{fmtVND(chenh)}</Money> {t("vào quỹ")}</span>}
                  {!k.lich_su && chenh < 0 && <span className="text-[var(--color-warning-strong)]"> {t("· thiếu")} <Money>{fmtVND(-chenh)}</Money></span>}
                  {!!k.lich_su && <span className="text-[var(--color-text-secondary)]"> {t("(trước khi có quỹ)")}</span>}
                  {k.thuc_nhan_goc != null && (
                    <span className="text-[var(--color-warning-strong)]" title={k.ly_do_sua ?? ""}> {t("· đã sửa từ")} <Money>{fmtVND(k.thuc_nhan_goc)}</Money></span>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Goi y nhanh ly do tu choi (Ke toan van sua/go tu do).
const GOI_Y_TU_CHOI = ["Sai số tiền chuyển", "Thiếu bằng chứng chuyển tiền", "Ảnh bằng chứng không rõ", "Chưa nhận được tiền trên sao kê"];

/**
 * Ke toan TU CHOI / DAY LAI bang chung (2026-09-29, migration 0046): "KTV đã chuyển" -> "Chờ KTV chuyển", bat buoc ly do
 * (PATCH /phieu-xuat-kho/:id/chuyen-tien trang_thai="Cho KTV chuyen"). Dat canh nut "Duyệt bằng chứng".
 */
// Rut lai xac nhan "Đã chuyển" de sua / huy anh bang chung up nham (2026-10-21) - CHI khi Ke toan chua duyet ("KTV da chuyen").
// Phieu ve "Chờ KTV chuyển", GIU anh + ghi chu -> form hien lai, bam ✕ bo anh sai, them anh dung roi "Đã chuyển" lai.
// Backend PATCH /:id/chuyen-tien {rut_lai: true} (nguoi nhan hang / nguoi tao ho / GS cua don / TN / Ke toan / Admin).
export function RutLaiBangChungButton({ pxkId, onDone, addToast }: { pxkId: string; onDone: () => void; addToast: (msg: string) => void }) {
  const rutLai = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${pxkId}/chuyen-tien`, { trang_thai: "Cho KTV chuyen", rut_lai: true }),
    onSuccess: () => {
      addToast(t("Đã rút lại xác nhận — bỏ ảnh sai (✕), thêm ảnh đúng rồi bấm \"Đã chuyển\" lại"));
      onDone();
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });
  return (
    <Btn
      size="sm"
      variant="ghost"
      onClick={() => {
        if (window.confirm(t("Rút lại xác nhận \"Đã chuyển\" để sửa / hủy ảnh bằng chứng? Phiếu về \"Chờ KTV chuyển\" cho tới khi bấm \"Đã chuyển\" lại."))) rutLai.mutate();
      }}
      loading={rutLai.isPending}
      title={t("Up nhầm ảnh — rút lại để sửa / hủy ảnh bằng chứng (trước khi Kế toán duyệt)")}
    >
      {t("↩ Sửa / hủy ảnh bằng chứng")}
    </Btn>
  );
}

export function TuChoiChuyenTienButton({ pxkId, onDone, addToast, laTn }: { pxkId: string; onDone: () => void; addToast: (msg: string) => void; laTn?: boolean }) {
  const [mo, setMo] = useState(false);
  const [lyDo, setLyDo] = useState("");
  const tuChoi = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${pxkId}/chuyen-tien`, { trang_thai: "Cho KTV chuyen", ly_do_tu_choi: lyDo.trim() }),
    onSuccess: () => {
      addToast(t("Đã đẩy lại về Chờ KTV chuyển tiền"));
      setMo(false);
      setLyDo("");
      onDone();
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });
  if (!mo) {
    return (
      <Btn
        size="sm"
        variant="danger"
        onClick={() => setMo(true)}
        title={laTn ? t("KTV xác nhận nhầm / thiếu tiền - đẩy về Chờ KTV chuyển kèm lý do") : t("Sai tiền, thiếu bằng chứng... - đẩy về Chờ KTV chuyển kèm lý do")}
      >
        {laTn ? t("↩ Đẩy lại cho KTV chuyển") : t("↩ Từ chối, đẩy lại")}
      </Btn>
    );
  }
  return (
    <div className="mt-2 w-full space-y-1.5 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] p-2">
      <div className="text-[11.5px] font-semibold text-[var(--color-danger-strong)]">{laTn ? t("Lý do đẩy lại (KTV sẽ thấy lý do này)") : t("Lý do từ chối (KTV và Tác nghiệp sẽ thấy lý do này)")}</div>
      <textarea
        autoFocus
        value={lyDo}
        onChange={(e) => setLyDo(e.target.value)}
        rows={2}
        placeholder={t("Vd: Số tiền chuyển 3.200.000đ, thiếu 39.300đ")}
        className="focus-ring w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-base sm:text-sm"
      />
      <div className="flex flex-wrap gap-1">
        {GOI_Y_TU_CHOI.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setLyDo((v) => (v.trim() ? `${v.trim()}; ${g}` : g))}
            className="focus-ring rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-subtle)]"
          >
            + {g}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Btn size="sm" variant="danger" onClick={() => tuChoi.mutate()} disabled={!lyDo.trim() || tuChoi.isPending} loading={tuChoi.isPending}>
          {t("Xác nhận đẩy lại")}
        </Btn>
        <Btn size="sm" variant="ghost" onClick={() => { setMo(false); setLyDo(""); }} disabled={tuChoi.isPending}>
          {t("Huỷ")}
        </Btn>
      </div>
    </div>
  );
}

export function docAnhBangChung(pxk: BangChungPxk): string[] {
  if (pxk.bang_chung_chuyen_tien_anh) {
    try {
      const v = JSON.parse(pxk.bang_chung_chuyen_tien_anh);
      if (Array.isArray(v)) return v.filter((u): u is string => typeof u === "string" && u.length > 0);
    } catch {
      /* roi ve cot cu */
    }
  }
  return pxk.bang_chung_chuyen_tien_url ? [pxk.bang_chung_chuyen_tien_url] : [];
}

function AnhThumb({ url, stt, onXoa, nho, onXem }: { url: string; stt: number; onXoa?: () => void; nho?: boolean; onXem?: () => void }) {
  const img = <img src={url} alt={t("Bằng chứng {a}", { a: stt })} loading="lazy" className={nho ? "h-9 w-9 object-cover" : "h-14 w-14 object-cover"} />;
  const khung = "focus-ring block overflow-hidden rounded-lg border border-[var(--color-border)]";
  return (
    <div className="relative">
      {/* onXem: mo trinh "Xem ảnh nhanh" (XemAnhNhanh.tsx - anh + thong tin, chuyen anh trai/phai) thay cho lightbox 1 anh. */}
      {onXem ? (
        <button type="button" onClick={onXem} className={khung} title="Xem nhanh">{img}</button>
      ) : (
        <ImageLink url={url} className={khung}>{img}</ImageLink>
      )}
      {onXoa && (
        <button
          type="button"
          onClick={onXoa}
          aria-label={t("Bỏ ảnh {a}", { a: stt })}
          className="focus-ring absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-secondary)] shadow-sm"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** Hien anh bang chung da luu (chi xem). `nho` = kieu gon cho o bang (1 hang, anh 36px, toi da 3 anh + "+N"). */
export function BangChungAnhList({ urls, nho, onXem }: { urls: string[]; nho?: boolean; onXem?: (i: number) => void }) {
  if (urls.length === 0) return null;
  if (nho) {
    const hien = urls.slice(0, 3);
    return (
      // Chan click lan len dong bang (dong PXK bam = xo/thu) - bam anh chi mo xem anh.
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {hien.map((u, i) => (
          <AnhThumb key={u} url={u} stt={i + 1} nho onXem={onXem ? () => onXem(i) : undefined} />
        ))}
        {urls.length > hien.length && <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">+{urls.length - hien.length}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {urls.map((u, i) => (
        <AnhThumb key={u} url={u} stt={i + 1} onXem={onXem ? () => onXem(i) : undefined} />
      ))}
    </div>
  );
}

/**
 * Form KTV (hoac TN/Ke toan xac nhan ho) nop bang chung khi phieu "Cho KTV chuyen": nhieu anh + ghi chu, gui DANH
 * SACH DAY DU (anh cu con giu + anh moi) qua PATCH /phieu-xuat-kho/:id/chuyen-tien.
 */
export function BangChungChuyenTienForm({
  pxkId,
  pxk,
  goiYGhiChu,
  onDone,
  addToast,
}: {
  pxkId: string;
  pxk: BangChungPxk;
  goiYGhiChu?: string[];
  onDone: () => void;
  addToast: (msg: string) => void;
}) {
  const daLuu = docAnhBangChung(pxk);
  const [anh, setAnh] = useState<string[]>(daLuu);
  // Tu doc so tien anh MOI (chua duoc Ke toan duyet o khoan truoc) ngay tren may KTV - chay nen, KHONG chan "Đã chuyển";
  // ket qua gui kem de Ke toan khong phai doc lai (migration 0051). Chi canh bao.
  const tienDaLuu = docTienDocMap(pxk.bang_chung_tien_doc);
  const doc = useDocTienAnh(anhChuaGhiNhan(anh, pxk), tienDaLuu);
  const conPhaiChuyen = pxk.so_tien_can_chuyen != null ? Math.max(0, pxk.so_tien_can_chuyen - (pxk.da_thanh_toan ?? 0)) : null;
  const [ghiChu, setGhiChu] = useState(pxk.bang_chung_chuyen_tien_ghi_chu ?? "");
  const [dangTai, setDangTai] = useState(0);
  const conLai = MAX_ANH_BANG_CHUNG - anh.length;
  const xacNhanLai = daLuu.length > 0 || !!pxk.bang_chung_chuyen_tien_ghi_chu;

  async function taiAnh(files: File[]) {
    const chon = files.slice(0, Math.max(0, conLai));
    if (files.length > chon.length) addToast(t("Chỉ tải thêm được {a} ảnh (tối đa {b} ảnh/phiếu)", { a: Math.max(0, conLai), b: MAX_ANH_BANG_CHUNG }));
    for (const f of chon) {
      setDangTai((n) => n + 1);
      try {
        const gui = await anhVuaGioiHan(f);
        const res = await api.postBinary<{ ok: true; url: string; han_muc_anh?: HanMucAnh | null }>(`/phieu-xuat-kho/${pxkId}/bang-chung-chuyen-tien`, await gui.arrayBuffer(), gui.type || "image/jpeg");
        canhBaoHanMucAnh(res.han_muc_anh, addToast);
        ghiNhoAnhCucBo(res.url, f); // doc tu file tren may, khong tai lai anh tu Drive
        setAnh((a) => (a.includes(res.url) || a.length >= MAX_ANH_BANG_CHUNG ? a : [...a, res.url]));
      } catch (err) {
        baoLoiTaiAnh(err, addToast, describeApiError);
      } finally {
        setDangTai((n) => n - 1);
      }
    }
  }

  const xacNhan = useMutation({
    mutationFn: () =>
      api.patch(`/phieu-xuat-kho/${pxkId}/chuyen-tien`, {
        trang_thai: "KTV da chuyen",
        bang_chung_chuyen_tien_anh: anh,
        bang_chung_chuyen_tien_ghi_chu: ghiChu.trim() || undefined,
        bang_chung_tien_doc: { ...tienDaLuu, ...doc.ketQua },
      }),
    onSuccess: () => {
      addToast(t("Đã xác nhận chuyển tiền"));
      onDone();
    },
    onError: (err) => addToast(t("Lỗi: ") + describeApiError(err)),
  });

  return (
    <div className="mt-2 space-y-2">
      <LyDoTuChoiChuyenTien pxk={pxk} />
      {xacNhanLai && !pxk.ly_do_tu_choi_chuyen_tien && (
        <div className="rounded-lg border border-[var(--amber-500)]/30 bg-[var(--amber-100)]/60 px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--amber-700)]">
          {t("Phiếu còn thiếu tiền sau lần xác nhận trước (tổng tiền đổi hoặc Kế toán nhận chưa đủ) — chuyển bổ sung đúng số “Còn phải chuyển”, thêm ảnh rồi bấm “Đã chuyển”.")}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {anh.map((u, i) => (
          <AnhThumb key={u} url={u} stt={i + 1} onXoa={() => setAnh((a) => a.filter((x) => x !== u))} />
        ))}
        {/* Khong dat capture: bang chung thuong la anh chup man hinh app ngan hang -> can mo thu vien (chon nhieu). */}
        <FileButton accept="image/*" multiple variant="subtle" disabled={dangTai > 0 || conLai <= 0} onFilesSelected={(fs) => void taiAnh(fs)}>
          {dangTai > 0 ? t("Đang tải...") : anh.length === 0 ? t("⬆ Chọn ảnh") : t("+ Thêm ảnh")}
        </FileButton>
        <span className="text-[11px] text-[var(--ink-400)] tabular-nums">
          {t("{a}/{b} ảnh", { a: anh.length, b: MAX_ANH_BANG_CHUNG })}
        </span>
      </div>
      <TienDocTuAnh
        doc={doc}
        soSoSanh={conPhaiChuyen}
        nhan={t("số còn phải chuyển")}
        sttCua={(u) => anh.indexOf(u) + 1}
        thongDiepLech={(tong, so) =>
          tong < so ? (
            <>{t("⚠ Tổng đọc từ ảnh")} <Money>{fmtVND(tong)}</Money> {t("ít hơn số còn phải chuyển")} <Money>{fmtVND(so)}</Money> {t("(thiếu")} <Money>{fmtVND(so - tong)}</Money>{t(") — kiểm tra lại số tiền đã chuyển / ảnh trước khi bấm “Đã chuyển”.")}</>
          ) : (
            <>{t("Tổng đọc từ ảnh")} <Money>{fmtVND(tong)}</Money> {t("nhiều hơn số còn phải chuyển")} <Money>{fmtVND(so)}</Money> {t("— phần dư")} <Money>{fmtVND(tong - so)}</Money> {t("vào quỹ sau khi Kế toán xác nhận.")}</>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          placeholder={t("Hoặc ghi chú thông tin chuyển khoản (vd: đã chuyển qua Momo, mã GD...)")}
          className="focus-ring min-w-[200px] flex-1 rounded-lg border border-[var(--ink-400)] bg-[var(--surface)] px-2.5 py-1.5 text-base sm:text-sm"
        />
        {goiYGhiChu && goiYGhiChu.length > 0 && (
          <Select
            value=""
            onChange={(v) => v && setGhiChu(v)}
            options={[{ value: "", label: t("+ Chọn nhanh lý do") }, ...goiYGhiChu.map((l) => ({ value: l, label: l }))]}
            className="text-xs"
          />
        )}
      </div>
      <Btn
        size="sm"
        onClick={() => xacNhan.mutate()}
        disabled={(anh.length === 0 && !ghiChu.trim()) || dangTai > 0 || xacNhan.isPending}
        loading={xacNhan.isPending}
      >
        {t("Đã chuyển")}
      </Btn>
    </div>
  );
}
