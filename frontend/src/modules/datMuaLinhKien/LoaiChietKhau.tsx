import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/ui/Toast";
import { Btn } from "../../components/ui/Btn";
import { describeApiError } from "./helpers";

// Loai chiet khau duoc huong cua tung dong don hang (2026-09-26, migration 0033_loai_chiet_khau.sql).
// He thong TU GAN luc tao PXK theo dung nhanh cua thuat toan tinh tien PXK (va tinh lai CA phieu khi
// them/bo dong); TN chon lai khi sai hoac tu them loai moi. CHI LA NHAN - khong doi so tien.
// Danh sach loai: Settings › Loai chiet khau (Admin bat/tat/doi ten).

export interface LoaiChietKhauRow {
  id: number;
  ma: string | null;
  ten: string;
  bat_tat: number;
  stt: number;
}

export const LOAI_CHIET_KHAU_KEY = ["settings-loai-chiet-khau"] as const;

export function useLoaiChietKhauList() {
  return useQuery({
    queryKey: LOAI_CHIET_KHAU_KEY,
    queryFn: () => api.get<{ rows: LoaiChietKhauRow[] }>("/settings/loai-chiet-khau").then((r) => r.rows),
    staleTime: 5 * 60_000,
  });
}

/** Ten loai theo id (dung chung cho render + do do rong cot). */
export function tenLoaiChietKhau(list: LoaiChietKhauRow[] | undefined, id: number | null | undefined): string | null {
  if (id == null) return null;
  return list?.find((l) => l.id === id)?.ten ?? null;
}

const TIP_THU_CONG = "TN đã chọn lại loại chiết khấu này";
const TIP_TU_DONG = "Hệ thống tự gán theo phiếu xuất kho";

export function LoaiChietKhauText({ id, thuCong }: { id: number | null | undefined; thuCong?: number | null }) {
  const { data } = useLoaiChietKhauList();
  const ten = tenLoaiChietKhau(data, id);
  if (!ten) return <span className="text-[var(--color-text-muted)]">—</span>;
  return (
    <span title={thuCong ? TIP_THU_CONG : TIP_TU_DONG}>
      {ten}
      {!!thuCong && <span className="ml-1 text-[var(--color-text-muted)]">✎</span>}
    </span>
  );
}

const THEM_MOI = "__them_moi__";
const LOI: Record<string, string> = {
  LOAI_DANG_TAT: "Loại chiết khấu này đang bị tắt trong Settings.",
  LOAI_KHONG_HOP_LE: "Loại chiết khấu không còn hợp lệ, tải lại trang rồi thử lại.",
  TRA_HANG_KHONG_CO_CHIET_KHAU: "Đơn trả hàng không có chiết khấu.",
};

/**
 * O chon loai chiet khau cho TN: danh sach loai dang bat + "+ Thêm loại mới…" (TN tu go ten loai chua
 * co - trung ten co san thi dung lai). Doi xong danh dau "TN đã chọn lại" (✎).
 */
export function LoaiChietKhauPicker({ donHangId, value, thuCong }: { donHangId: string; value: number | null | undefined; thuCong?: number | null }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data: list } = useLoaiChietKhauList();
  const [themMoi, setThemMoi] = useState(false);
  const [tenMoi, setTenMoi] = useState("");

  const mut = useMutation({
    mutationFn: (body: { loai_chiet_khau_id?: number | null; ten_moi?: string }) =>
      api.patch(`/phieu-xuat-kho/don-hang/${encodeURIComponent(donHangId)}/loai-chiet-khau`, body),
    onSuccess: () => {
      setThemMoi(false);
      setTenMoi("");
      addToast("Đã cập nhật loại chiết khấu");
      qc.invalidateQueries({
        predicate: (q) => {
          const k = String(q.queryKey[0]);
          return k.startsWith("dat-mua-lk") || k === "pxk-detail" || k === LOAI_CHIET_KHAU_KEY[0];
        },
      });
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof ApiError && err.code && LOI[err.code] ? LOI[err.code] : describeApiError(err))),
  });

  const active = (list ?? []).filter((l) => l.bat_tat || l.id === value);

  if (themMoi) {
    return (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={tenMoi}
          onChange={(e) => setTenMoi(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tenMoi.trim()) mut.mutate({ ten_moi: tenMoi.trim() });
            if (e.key === "Escape") setThemMoi(false);
          }}
          placeholder="Tên loại chiết khấu mới"
          className="focus-ring h-[30px] w-52 rounded-lg border border-[var(--line)] bg-[var(--surface-100)] px-2 text-xs"
        />
        <Btn size="sm" disabled={!tenMoi.trim() || mut.isPending} onClick={() => mut.mutate({ ten_moi: tenMoi.trim() })}>
          Lưu
        </Btn>
        <Btn size="sm" variant="ghost" onClick={() => setThemMoi(false)}>
          Huỷ
        </Btn>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <select
        value={value != null ? String(value) : ""}
        disabled={mut.isPending}
        title={value == null ? undefined : thuCong ? TIP_THU_CONG : TIP_TU_DONG}
        onChange={(e) => {
          const v = e.target.value;
          if (v === THEM_MOI) return setThemMoi(true);
          mut.mutate({ loai_chiet_khau_id: v ? Number(v) : null });
        }}
        className="focus-ring h-[30px] max-w-[260px] rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 text-xs"
      >
        <option value="">— Chưa có —</option>
        {active.map((l) => (
          <option key={l.id} value={l.id}>
            {l.ten}
          </option>
        ))}
        <option value={THEM_MOI}>+ Thêm loại mới…</option>
      </select>
      {!!thuCong && <span className="text-xs text-[var(--color-text-muted)]" title={TIP_THU_CONG}>✎</span>}
    </span>
  );
}
