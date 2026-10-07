import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/x/Badge";
import { Select } from "../../components/ui/Select";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { api, ApiError } from "../../api/client";
import { describeApiError } from "./helpers";
import { MIEN_XUAT_LABEL, MIEN_XUAT_NGAN, type MienXuat } from "./constants";
import type { PhieuXuatKhoRow } from "./types";

// Kho xuat MB/MN cua phieu (chot 2026-10-07, backend/src/lib/mienXuat.ts, migration 0070): mac dinh theo khu vuc,
// TN/Ke toan chuyen duoc khi phieu chua gui Kho ("Dang tao phieu"/"Cho ke toan"). Phieu da chuyen chi hien mac dinh
// cho tai khoan co khu vuc thuoc mien moi + file MISA lay kho cua mien moi.
export const MIEN_XUAT_SUA_DUOC = ["Dang tao phieu", "Cho ke toan"];

type PxkMien = Pick<PhieuXuatKhoRow, "mien_xuat" | "mien_xuat_hieu_luc">;

export function KhoXuatBadge({ r }: { r: PxkMien }) {
  const m = r.mien_xuat_hieu_luc;
  if (!m) return <span className="text-[var(--ink-400)]" title="Khu vực không xác định được miền — file MISA để trống mã kho">—</span>;
  return r.mien_xuat ? (
    <Badge tone="purple">
      <span title={`Đã chuyển kho xuất sang ${MIEN_XUAT_LABEL[m]}`}>Kho {MIEN_XUAT_NGAN[m]} · đã chuyển</span>
    </Badge>
  ) : (
    <span className="text-xs text-[var(--color-text-body)]" title="Theo khu vực của phiếu">Kho {MIEN_XUAT_NGAN[m]}</span>
  );
}

export function ChuyenKhoXuatCard({
  pxk, addToast, onDone,
}: {
  pxk: PxkMien & Pick<PhieuXuatKhoRow, "id" | "mien_khu_vuc">;
  addToast: (msg: string) => void;
  onDone: () => void;
}) {
  const hienTai = pxk.mien_xuat_hieu_luc ?? "";
  const [chon, setChon] = useState<string>(hienTai);
  const [lyDo, setLyDo] = useState("");
  useEffect(() => { setChon(hienTai); setLyDo(""); }, [pxk.id, hienTai]);

  const mutation = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${pxk.id}/mien-xuat`, { mien_xuat: chon || null, ghi_chu: lyDo.trim() || undefined }),
    onSuccess: () => { onDone(); addToast(`Đã chuyển kho xuất: ${chon ? MIEN_XUAT_LABEL[chon as MienXuat] : "theo khu vực"}`); },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "DA_GUI_KHO") addToast("Phiếu đã gửi Kho — không chuyển kho xuất được nữa");
      else if (code === "CONFLICT") addToast("Phiếu vừa được người khác cập nhật — tải lại rồi thử lại");
      else addToast("Lỗi: " + describeApiError(err));
    },
  });

  const mienKv = pxk.mien_khu_vuc;
  const options: { value: string; label: string }[] = (["bac", "nam"] as MienXuat[]).map((m) => ({
    value: m,
    label: `${MIEN_XUAT_LABEL[m]}${m === mienKv ? " (theo khu vực)" : ""}`,
  }));
  if (!mienKv && !pxk.mien_xuat) options.unshift({ value: "", label: "Chưa xác định (theo khu vực)" });
  const doi = chon !== hienTai;

  return (
    <div className="border border-[var(--line)] rounded-lg p-3">
      <SectionTitle icon="🏭">Kho xuất</SectionTitle>
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={chon} onChange={setChon} options={options} className="min-w-[180px]" />
        {doi && (
          <input
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            placeholder="Lý do chuyển (không bắt buộc)"
            className="focus-ring flex-1 min-w-[160px] bg-[var(--surface)] border border-[var(--ink-400)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        )}
        <Btn size="sm" onClick={() => mutation.mutate()} disabled={!doi || mutation.isPending} loading={mutation.isPending}>Lưu</Btn>
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--ink-500)]">
        {pxk.mien_xuat
          ? `Đã chuyển từ ${mienKv ? MIEN_XUAT_LABEL[mienKv] : "khu vực chưa rõ miền"} — chỉ Kho/TN ${MIEN_XUAT_LABEL[pxk.mien_xuat]} thấy mặc định, file MISA dùng kho ${MIEN_XUAT_NGAN[pxk.mien_xuat]}.`
          : "Mặc định theo khu vực của phiếu. Chuyển sang miền khác: phiếu hiện cho Kho/TN miền mới, file MISA dùng kho miền mới."}
      </div>
    </div>
  );
}

// Kho chon lai khu vuc cho phieu SAI khu vuc (chot 2026-10-07, migration 0071, PATCH /phieu-xuat-kho/:id/khu-vuc): ghi cho
// CA phieu + moi don trong phieu -> Kho/Ke toan/TN khu vuc moi thay, khu vuc cu khong con thay mac dinh. Phieu chua dong.
export const PXK_TRANG_THAI_DONG = ["KTV da nhan", "Ke toan huy", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"];

type PxkKhuVuc = Pick<PhieuXuatKhoRow, "id" | "khu_vuc_ma" | "khu_vuc_chon" | "khu_vuc_tu_dong_ten" | "khu_vuc_chon_ten">;

export function KhuVucPxkBadge({ pxk }: { pxk: PxkKhuVuc }) {
  if (!pxk.khu_vuc_chon) return null;
  return (
    <Badge tone="purple">
      <span title={`Kho đã chuyển từ ${pxk.khu_vuc_tu_dong_ten ?? pxk.khu_vuc_ma ?? "?"}`}>Khu vực {pxk.khu_vuc_chon_ten ?? pxk.khu_vuc_chon} · Kho đã chuyển</span>
    </Badge>
  );
}

export function ChuyenKhuVucCard({ pxk, addToast, onDone }: { pxk: PxkKhuVuc; addToast: (msg: string) => void; onDone: () => void }) {
  const hienTai = pxk.khu_vuc_chon ?? pxk.khu_vuc_ma ?? "";
  const [chon, setChon] = useState(hienTai);
  const [lyDo, setLyDo] = useState("");
  useEffect(() => { setChon(hienTai); setLyDo(""); }, [pxk.id, hienTai]);
  const { data: khuVucData } = useQuery({
    queryKey: ["settings-khu-vuc"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/settings/khu-vuc"),
  });
  const options = (khuVucData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ma === pxk.khu_vuc_ma ? `${k.ten} (tự động)` : k.ten }));
  const mutation = useMutation({
    mutationFn: () => api.patch<{ so_don: number }>(`/phieu-xuat-kho/${pxk.id}/khu-vuc`, { khu_vuc_ma: chon, ghi_chu: lyDo.trim() || undefined }),
    onSuccess: (res) => {
      onDone();
      addToast(`Đã chuyển khu vực: ${options.find((o) => o.value === chon)?.label ?? chon}${res?.so_don ? ` (phiếu + ${res.so_don} đơn)` : ""}`);
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "PHIEU_DA_DONG") addToast("Phiếu đã đóng — không chuyển khu vực được nữa");
      else if (code === "CONFLICT") addToast("Phiếu vừa được người khác cập nhật — tải lại rồi thử lại");
      else addToast("Lỗi: " + describeApiError(err));
    },
  });
  const doi = !!chon && chon !== hienTai;
  return (
    <div className="border border-[var(--line)] rounded-lg p-3">
      <SectionTitle icon="📍">Khu vực</SectionTitle>
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={chon} onChange={setChon} options={options} className="min-w-[180px]" />
        {doi && (
          <input
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            placeholder="Lý do chuyển (không bắt buộc)"
            className="focus-ring flex-1 min-w-[160px] bg-[var(--surface)] border border-[var(--ink-400)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        )}
        <Btn size="sm" onClick={() => mutation.mutate()} disabled={!doi || mutation.isPending} loading={mutation.isPending}>Lưu</Btn>
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--ink-500)]">
        {pxk.khu_vuc_chon
          ? `Kho đã chuyển từ ${pxk.khu_vuc_tu_dong_ten ?? pxk.khu_vuc_ma ?? "?"} — phiếu + đơn trong phiếu chỉ hiện cho Kho/Kế toán/TN khu vực ${pxk.khu_vuc_chon_ten ?? pxk.khu_vuc_chon}.`
          : "Phiếu sai khu vực: chọn lại để chuyển cả phiếu + đơn trong phiếu sang Kho/Kế toán/TN khu vực đúng (kho xuất MISA theo miền khu vực mới)."}
      </div>
    </div>
  );
}
