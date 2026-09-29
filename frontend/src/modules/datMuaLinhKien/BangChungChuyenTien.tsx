import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../../components/ui/Btn";
import { FileButton } from "../../components/ui/FileButton";
import { Select } from "../../components/ui/Select";
import { ImageLink } from "./SharedUi";
import { describeApiError } from "./helpers";

// Bang chung chuyen tien PXK NHIEU anh (toi da 5, chot 2026-09-29 - migration 0043, backend
// lib/bangChungChuyenTien.ts). Dung chung cho chi tiet PXK (PhieuXuatKhoTab) va khoi PXK trong chi tiet don cua KTV
// (DonCuaToiTab) - truoc day 2 noi chep tay cung 1 form 1 anh. Tong tien doi (gop them don / tinh lai chiet khau) thi
// phieu ve "Cho KTV chuyen" nhung GIU anh cu: form mo lai voi anh cu, KTV chuyen bo sung + them anh roi xac nhan lai.
export const MAX_ANH_BANG_CHUNG = 5;

export interface BangChungPxk {
  bang_chung_chuyen_tien_url?: string | null;
  bang_chung_chuyen_tien_anh?: string | null;
  bang_chung_chuyen_tien_ghi_chu?: string | null;
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

function AnhThumb({ url, stt, onXoa }: { url: string; stt: number; onXoa?: () => void }) {
  return (
    <div className="relative">
      <ImageLink url={url} className="focus-ring block overflow-hidden rounded-lg border border-[var(--color-border)]">
        <img src={url} alt={`Bằng chứng ${stt}`} loading="lazy" className="h-14 w-14 object-cover" />
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

/** Hien anh bang chung da luu (chi xem). */
export function BangChungAnhList({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
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
      {xacNhanLai && (
        <div className="rounded-lg border border-[var(--amber-500)]/30 bg-[var(--amber-100)]/60 px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--amber-700)]">
          Tổng tiền đã thay đổi sau lần xác nhận trước — chuyển bổ sung phần chênh lệch, thêm ảnh rồi bấm “Đã chuyển”.
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
