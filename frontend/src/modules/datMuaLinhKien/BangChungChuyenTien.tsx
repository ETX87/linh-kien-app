import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../../components/ui/Btn";
import { FileButton } from "../../components/ui/FileButton";
import { Select } from "../../components/ui/Select";
import { ImageLink } from "./SharedUi";
import { describeApiError } from "./helpers";
import { fmtDateTime, fmtVND } from "../../types";
import { KvRow } from "../../components/ui/KvRow";
import { Money } from "../../components/ui/Money";

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
}

/** Thong bao do "Kế toán từ chối bằng chứng" (hien khi phieu da bi day ve "Chờ KTV chuyển"). */
export function LyDoTuChoiChuyenTien({ pxk }: { pxk: BangChungPxk }) {
  if (!pxk.ly_do_tu_choi_chuyen_tien) return null;
  return (
    <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-danger-strong)]">
      <span className="font-bold">Kế toán từ chối bằng chứng{pxk.tu_choi_chuyen_tien_luc ? ` (${fmtDateTime(pxk.tu_choi_chuyen_tien_luc)})` : ""}:</span>{" "}
      {pxk.ly_do_tu_choi_chuyen_tien}
      <div className="mt-0.5 font-medium">Kiểm tra lại số tiền/bằng chứng, chuyển bổ sung nếu thiếu, thêm ảnh rồi bấm “Đã chuyển”.</div>
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
      <KvRow label="Tổng tiền phiếu"><Money>{fmtVND(tong)}</Money></KvRow>
      {daThanhToan > 0 && (
        <KvRow label="Đã thanh toán">
          <Money>{fmtVND(Math.min(daThanhToan, tong))}</Money>
          <span className="text-[11px] text-[var(--color-text-secondary)]"> (tiền đã chuyển + quỹ dư)</span>
        </KvRow>
      )}
      {!daDuyet && (
        <KvRow label="Còn phải chuyển">
          <span className="font-semibold text-[var(--color-success-strong)]"><Money>{fmtVND(con)}</Money></span>
        </KvRow>
      )}
      {quyDu != null && (
        <KvRow label="Quỹ dư hiện tại">
          <Money>{fmtVND(quyDu)}</Money>
          {quyDu > 0 && <span className="text-[11px] text-[var(--color-text-secondary)]"> — tự trừ vào phiếu cần chuyển tiếp theo</span>}
        </KvRow>
      )}
    </>
  );
}

/**
 * Ke toan DUYET khoan chuyen voi SO TIEN THUC NHAN (quy du, migration 0047): mac dinh = so con phai chuyen. Du -> vao quy
 * cua nguoi nhan hang; thieu -> phieu ve "Chờ KTV chuyển" so con thieu. So khac so can chuyen thi phai xac nhan lan 2.
 */
export function DuyetChuyenTienForm({ pxkId, conPhaiChuyen, onDone, addToast }: { pxkId: string; conPhaiChuyen: number; onDone: () => void; addToast: (msg: string) => void }) {
  const [soTien, setSoTien] = useState(String(conPhaiChuyen));
  const [xacNhan, setXacNhan] = useState(false);
  const so = Number(soTien);
  const hopLe = soTien.trim() !== "" && Number.isInteger(so) && so > 0;
  const chenh = hopLe ? so - conPhaiChuyen : 0;
  const duyet = useMutation({
    mutationFn: () => api.patch<{ conThieu: number; soDuQuy: number }>(`/phieu-xuat-kho/${pxkId}/chuyen-tien`, { trang_thai: "TN da duyet", so_tien_thuc_nhan: so }),
    onSuccess: (r) => {
      addToast(r.conThieu > 0 ? `Đã ghi nhận — còn thiếu ${fmtVND(r.conThieu)}, phiếu về Chờ KTV chuyển` : chenh > 0 ? `Đã duyệt — dư ${fmtVND(chenh)} vào quỹ` : "Đã duyệt chuyển tiền");
      setXacNhan(false);
      onDone();
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11.5px] font-semibold text-[var(--color-text-secondary)]" htmlFor={`thuc-nhan-${pxkId}`}>Số tiền thực nhận</label>
        <input
          id={`thuc-nhan-${pxkId}`}
          type="number"
          min={1}
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
          Duyệt bằng chứng
        </Btn>
      </div>
      {hopLe && chenh !== 0 && (
        <div className={`rounded-lg border px-2.5 py-1.5 text-[11.5px] ${chenh > 0 ? "border-[var(--color-info)]/30 bg-[var(--color-info-soft)] text-[var(--color-text)]" : "border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"}`}>
          {chenh > 0 ? (
            <>Cần chuyển <Money>{fmtVND(conPhaiChuyen)}</Money> — nhận <Money>{fmtVND(so)}</Money> → <b>dư <Money>{fmtVND(chenh)}</Money> vào quỹ</b> của người nhận hàng (tự trừ cho phiếu sau).</>
          ) : (
            <>Cần chuyển <Money>{fmtVND(conPhaiChuyen)}</Money> — nhận <Money>{fmtVND(so)}</Money> → <b>còn thiếu <Money>{fmtVND(-chenh)}</Money></b> (trừ quỹ dư nếu có), phiếu về “Chờ KTV chuyển” số còn thiếu.</>
          )}
          {xacNhan && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="font-semibold">Số thực nhận khác số cần chuyển — kiểm tra lại sao kê trước khi xác nhận.</span>
              <Btn size="sm" onClick={() => duyet.mutate()} disabled={duyet.isPending} loading={duyet.isPending}>Xác nhận nhận <Money>{fmtVND(so)}</Money></Btn>
              <Btn size="sm" variant="ghost" onClick={() => setXacNhan(false)} disabled={duyet.isPending}>Sửa lại</Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface KhoanChuyenTien {
  id: number;
  trang_thai: "Da duyet" | "Tu choi";
  tong_phieu: number | null;
  da_thanh_toan_truoc: number;
  so_tien_can_chuyen: number | null;
  so_tien_thuc_nhan: number | null;
  ly_do_tu_choi: string | null;
  nguoi_duyet: string;
  duyet_luc: string;
  lich_su: number;
}

/** Cac lan Ke toan duyet / tu choi khoan chuyen cua 1 phieu (moi nhat truoc). */
export function LichSuKhoanChuyen({ rows }: { rows: KhoanChuyenTien[] }) {
  return (
    <div className="mt-2 border-t border-[var(--color-border)] pt-2">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Các lần Kế toán xác nhận</div>
      <ul className="space-y-1">
        {rows.map((k) => {
          const chenh = (k.so_tien_thuc_nhan ?? 0) - (k.so_tien_can_chuyen ?? 0);
          return (
            <li key={k.id} className="text-[11.5px] text-[var(--color-text-body)]">
              <span className="text-[var(--color-text-secondary)]">{fmtDateTime(k.duyet_luc)}</span>{" "}
              {k.trang_thai === "Tu choi" ? (
                <span className="text-[var(--color-danger-strong)]">Từ chối — {k.ly_do_tu_choi}</span>
              ) : (
                <>
                  Nhận <b><Money>{fmtVND(k.so_tien_thuc_nhan)}</Money></b> / cần <Money>{fmtVND(k.so_tien_can_chuyen)}</Money>
                  {!k.lich_su && chenh > 0 && <span className="text-[var(--color-success-strong)]"> · dư <Money>{fmtVND(chenh)}</Money> vào quỹ</span>}
                  {!k.lich_su && chenh < 0 && <span className="text-[var(--color-warning-strong)]"> · thiếu <Money>{fmtVND(-chenh)}</Money></span>}
                  {!!k.lich_su && <span className="text-[var(--color-text-secondary)]"> (trước khi có quỹ)</span>}
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
export function TuChoiChuyenTienButton({ pxkId, onDone, addToast }: { pxkId: string; onDone: () => void; addToast: (msg: string) => void }) {
  const [mo, setMo] = useState(false);
  const [lyDo, setLyDo] = useState("");
  const tuChoi = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${pxkId}/chuyen-tien`, { trang_thai: "Cho KTV chuyen", ly_do_tu_choi: lyDo.trim() }),
    onSuccess: () => {
      addToast("Đã đẩy lại về Chờ KTV chuyển tiền");
      setMo(false);
      setLyDo("");
      onDone();
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });
  if (!mo) {
    return (
      <Btn size="sm" variant="danger" onClick={() => setMo(true)} title="Sai tiền, thiếu bằng chứng... - đẩy về Chờ KTV chuyển kèm lý do">
        ↩ Từ chối, đẩy lại
      </Btn>
    );
  }
  return (
    <div className="mt-2 w-full space-y-1.5 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] p-2">
      <div className="text-[11.5px] font-semibold text-[var(--color-danger-strong)]">Lý do từ chối (KTV và Tác nghiệp sẽ thấy lý do này)</div>
      <textarea
        autoFocus
        value={lyDo}
        onChange={(e) => setLyDo(e.target.value)}
        rows={2}
        placeholder="Vd: Số tiền chuyển 3.200.000đ, thiếu 39.300đ"
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
          Xác nhận đẩy lại
        </Btn>
        <Btn size="sm" variant="ghost" onClick={() => { setMo(false); setLyDo(""); }} disabled={tuChoi.isPending}>
          Huỷ
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

function AnhThumb({ url, stt, onXoa, nho }: { url: string; stt: number; onXoa?: () => void; nho?: boolean }) {
  return (
    <div className="relative">
      <ImageLink url={url} className="focus-ring block overflow-hidden rounded-lg border border-[var(--color-border)]">
        <img src={url} alt={`Bằng chứng ${stt}`} loading="lazy" className={nho ? "h-9 w-9 object-cover" : "h-14 w-14 object-cover"} />
      </ImageLink>
      {onXoa && (
        <button
          type="button"
          onClick={onXoa}
          aria-label={`Bỏ ảnh ${stt}`}
          className="focus-ring absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-secondary)] shadow-sm"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** Hien anh bang chung da luu (chi xem). `nho` = kieu gon cho o bang (1 hang, anh 36px, toi da 3 anh + "+N"). */
export function BangChungAnhList({ urls, nho }: { urls: string[]; nho?: boolean }) {
  if (urls.length === 0) return null;
  if (nho) {
    const hien = urls.slice(0, 3);
    return (
      // Chan click lan len dong bang (dong PXK bam = xo/thu) - bam anh chi mo xem anh.
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {hien.map((u, i) => (
          <AnhThumb key={u} url={u} stt={i + 1} nho />
        ))}
        {urls.length > hien.length && <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">+{urls.length - hien.length}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {urls.map((u, i) => (
        <AnhThumb key={u} url={u} stt={i + 1} />
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
  const [ghiChu, setGhiChu] = useState(pxk.bang_chung_chuyen_tien_ghi_chu ?? "");
  const [dangTai, setDangTai] = useState(0);
  const conLai = MAX_ANH_BANG_CHUNG - anh.length;
  const xacNhanLai = daLuu.length > 0 || !!pxk.bang_chung_chuyen_tien_ghi_chu;

  async function taiAnh(files: File[]) {
    const chon = files.slice(0, Math.max(0, conLai));
    if (files.length > chon.length) addToast(`Chỉ tải thêm được ${Math.max(0, conLai)} ảnh (tối đa ${MAX_ANH_BANG_CHUNG} ảnh/phiếu)`);
    for (const f of chon) {
      setDangTai((n) => n + 1);
      try {
        const res = await api.postBinary<{ ok: true; url: string }>(`/phieu-xuat-kho/${pxkId}/bang-chung-chuyen-tien`, await f.arrayBuffer(), f.type || "image/jpeg");
        setAnh((a) => (a.includes(res.url) || a.length >= MAX_ANH_BANG_CHUNG ? a : [...a, res.url]));
      } catch (err) {
        addToast("Lỗi tải ảnh: " + describeApiError(err));
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
      }),
    onSuccess: () => {
      addToast("Đã xác nhận chuyển tiền");
      onDone();
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  return (
    <div className="mt-2 space-y-2">
      <LyDoTuChoiChuyenTien pxk={pxk} />
      {xacNhanLai && !pxk.ly_do_tu_choi_chuyen_tien && (
        <div className="rounded-lg border border-[var(--amber-500)]/30 bg-[var(--amber-100)]/60 px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--amber-700)]">
          Phiếu còn thiếu tiền sau lần xác nhận trước (tổng tiền đổi hoặc Kế toán nhận chưa đủ) — chuyển bổ sung đúng số “Còn phải chuyển”, thêm ảnh rồi bấm “Đã chuyển”.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {anh.map((u, i) => (
          <AnhThumb key={u} url={u} stt={i + 1} onXoa={() => setAnh((a) => a.filter((x) => x !== u))} />
        ))}
        {/* Khong dat capture: bang chung thuong la anh chup man hinh app ngan hang -> can mo thu vien (chon nhieu). */}
        <FileButton accept="image/*" multiple variant="subtle" disabled={dangTai > 0 || conLai <= 0} onFilesSelected={(fs) => void taiAnh(fs)}>
          {dangTai > 0 ? "Đang tải..." : anh.length === 0 ? "⬆ Chọn ảnh" : "+ Thêm ảnh"}
        </FileButton>
        <span className="text-[11px] text-[var(--ink-400)] tabular-nums">
          {anh.length}/{MAX_ANH_BANG_CHUNG} ảnh
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          placeholder="Hoặc ghi chú thông tin chuyển khoản (vd: đã chuyển qua Momo, mã GD...)"
          className="focus-ring min-w-[200px] flex-1 rounded-lg border border-[var(--ink-400)] bg-[var(--surface)] px-2.5 py-1.5 text-base sm:text-sm"
        />
        {goiYGhiChu && goiYGhiChu.length > 0 && (
          <Select
            value=""
            onChange={(v) => v && setGhiChu(v)}
            options={[{ value: "", label: "+ Chọn nhanh lý do" }, ...goiYGhiChu.map((l) => ({ value: l, label: l }))]}
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
        Đã chuyển
      </Btn>
    </div>
  );
}
