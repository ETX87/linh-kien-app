import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/ui/Toast";
import { Btn } from "../../components/ui/Btn";
import { describeApiError, laTruCongNo } from "./helpers";
import { Modal } from "../../components/ui/Modal";
import { KvRow } from "../../components/ui/KvRow";
import { fmtVND } from "../../types";
import type { DonHangRow } from "./types";

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
  DA_CHOT_CHUYEN_TIEN: "Phiếu đã chốt chuyển tiền — không đổi được loại chiết khấu nữa.",
  KHONG_THUOC_PXK: "Đơn chưa nằm trong phiếu xuất kho nào.",
  INVALID_STATE: "Phiếu không còn ở bước Đang tạo phiếu.",
};
const loiText = (err: unknown) => (err instanceof ApiError && err.code && LOI[err.code] ? LOI[err.code] : describeApiError(err));

/**
 * Chi duoc doi loai chiet khau TRUOC KHI chot chuyen tien - khop `choPhepDoiLoaiChietKhau` o backend
 * (lib/loaiChietKhau.ts): PXK con "Dang tao phieu" VA (khong can chuyen tien HOAC KTV chua chuyen).
 */
export function duocDoiLoaiChietKhau(pxk: { trang_thai?: string | null; so_tien_can_chuyen?: number | null; trang_thai_chuyen_tien?: string | null } | null | undefined): boolean {
  return !!pxk && pxk.trang_thai === "Dang tao phieu" && (pxk.so_tien_can_chuyen == null || pxk.trang_thai_chuyen_tien === "Cho KTV chuyen");
}

/** Don gia goi y theo loai chiet khau HE THONG - cung cong thuc voi thuat toan tien PXK (lib/pxkRecalculate.ts). */
function giaGoiY(ma: string | null | undefined, d: DonHangRow): { gia: number; cachTinh: string } | null {
  const ban = d.lk_gia_ban;
  switch (ma) {
    case "KHONG_CK":
      return ban != null ? { gia: ban, cachTinh: "giá bán" } : null;
    case "DINH_TU":
      return ban != null ? { gia: Math.round(ban * 0.85), cachTinh: "giá bán × 85%" } : null;
    case "TONG_200_500":
      return ban != null ? { gia: Math.round(ban * 0.7), cachTinh: "giá bán × 70%" } : null;
    case "GIA_KTV":
    case "CONG_NO":
      return d.lk_gia_tri_cong_no != null ? { gia: d.lk_gia_tri_cong_no, cachTinh: "giá KTV" } : null;
    case "GIA_DU_PHONG":
      return d.lk_gia_du_phong != null ? { gia: d.lk_gia_du_phong, cachTinh: "giá dự phòng" } : null;
    default:
      return null;
  }
}

type LuaChon = { id: number; ten: string; ma: string | null } | { tenMoi: string };

/**
 * O chon loai chiet khau cho TN. Chon loai khac -> popup hoi "có cập nhật giá thực tế không?" (phan hoi
 * 2026-09-26): Không = chi doi nhan, giu nguyen gia; Có = doi nhan + luu gia thuc te moi (goi y san theo
 * cong thuc cua loai he thong, TN tu sua duoc). Gia luu qua DUNG endpoint san co cua cot "Tiền cần chuyển":
 * mua -> gia_chot (don gia thuc te), cong_no -> so_tien_cong_no. `duocDoi` = false -> chi hien chu + 🔒.
 */
export function LoaiChietKhauPicker({ don, duocDoi }: { don: DonHangRow; duocDoi: boolean }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data: list } = useLoaiChietKhauList();
  const [themMoi, setThemMoi] = useState(false);
  const [tenMoi, setTenMoi] = useState("");
  const [chon, setChon] = useState<LuaChon | null>(null);
  const [giaMoi, setGiaMoi] = useState("");

  // Dong "TRỪ CÔNG NỢ" tinh tien nhu don mua (gia chot) - chi dong cong_no con lai luu so_tien_cong_no.
  const isCongNo = don.loai_don === "cong_no" && !laTruCongNo(don.loai_de_xuat);
  const sl = don.so_luong_thuc_xuat ?? don.so_luong_de_xuat;
  const giaHienTai = isCongNo ? don.so_tien_cong_no : (don.gia_chot ?? don.gia_de_xuat);
  const tenHienTai = tenLoaiChietKhau(list, don.loai_chiet_khau_id) ?? "Chưa có";

  const lamMoi = () =>
    qc.invalidateQueries({
      predicate: (q) => {
        const k = String(q.queryKey[0]);
        return k.startsWith("dat-mua-lk") || k === "pxk-detail" || k === LOAI_CHIET_KHAU_KEY[0];
      },
    });

  const mut = useMutation({
    mutationFn: async ({ luaChon, gia }: { luaChon: LuaChon; gia: number | null }) => {
      await api.patch(
        `/phieu-xuat-kho/don-hang/${encodeURIComponent(don.id)}/loai-chiet-khau`,
        "tenMoi" in luaChon ? { ten_moi: luaChon.tenMoi } : { loai_chiet_khau_id: luaChon.id },
      );
      if (gia == null) return;
      try {
        if (isCongNo) await api.patch(`/dat-mua-lk/don-hang/${encodeURIComponent(don.id)}/so-tien-cong-no`, { so_tien_cong_no: gia });
        else await api.patch(`/dat-mua-lk/don-hang/${encodeURIComponent(don.id)}`, { gia_chot: gia });
      } catch (err) {
        throw new Error(`Đã đổi loại chiết khấu nhưng chưa lưu được giá: ${loiText(err)}`);
      }
    },
    onSuccess: (_r, v) => {
      addToast(v.gia == null ? "Đã đổi loại chiết khấu (giữ nguyên giá)" : "Đã đổi loại chiết khấu và cập nhật giá thực tế");
      setChon(null);
      setThemMoi(false);
      setTenMoi("");
    },
    onError: (err) => addToast(err instanceof ApiError ? "Lỗi: " + loiText(err) : String((err as Error).message)),
    onSettled: lamMoi,
  });

  function moPopup(luaChon: LuaChon) {
    const ma = "tenMoi" in luaChon ? null : luaChon.ma;
    const goiY = giaGoiY(ma, don);
    const donGia = goiY?.gia ?? (isCongNo ? null : giaHienTai);
    setGiaMoi(isCongNo ? String(goiY ? goiY.gia * sl : (giaHienTai ?? "")) : String(donGia ?? ""));
    setChon(luaChon);
  }

  if (!duocDoi) {
    return (
      <span title="Phiếu đã chốt chuyển tiền (hoặc đã qua bước Đang tạo phiếu) — không đổi được loại chiết khấu">
        <LoaiChietKhauText id={don.loai_chiet_khau_id} thuCong={don.loai_chiet_khau_thu_cong} /> <span className="text-xs">🔒</span>
      </span>
    );
  }

  const active = (list ?? []).filter((l) => l.bat_tat || l.id === don.loai_chiet_khau_id);
  const maChon = chon && !("tenMoi" in chon) ? chon.ma : null;
  const goiY = chon ? giaGoiY(maChon, don) : null;
  const giaSo = giaMoi.trim() === "" ? NaN : Number(giaMoi);
  const giaHopLe = Number.isFinite(giaSo) && giaSo >= 0;

  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {themMoi ? (
        <>
          <input
            autoFocus
            value={tenMoi}
            onChange={(e) => setTenMoi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tenMoi.trim()) moPopup({ tenMoi: tenMoi.trim() });
              if (e.key === "Escape") setThemMoi(false);
            }}
            placeholder="Tên loại chiết khấu mới"
            className="focus-ring h-[30px] w-52 rounded-lg border border-[var(--line)] bg-[var(--surface-100)] px-2 text-xs"
          />
          <Btn size="sm" disabled={!tenMoi.trim()} onClick={() => moPopup({ tenMoi: tenMoi.trim() })}>
            Tiếp
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => setThemMoi(false)}>
            Huỷ
          </Btn>
        </>
      ) : (
        <>
          <select
            value={don.loai_chiet_khau_id != null ? String(don.loai_chiet_khau_id) : ""}
            disabled={mut.isPending}
            title={don.loai_chiet_khau_id == null ? undefined : don.loai_chiet_khau_thu_cong ? TIP_THU_CONG : TIP_TU_DONG}
            onChange={(e) => {
              const v = e.target.value;
              if (v === THEM_MOI) return setThemMoi(true);
              const l = active.find((x) => String(x.id) === v);
              if (l) moPopup({ id: l.id, ten: l.ten, ma: l.ma });
            }}
            className="focus-ring h-[30px] max-w-[260px] rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 text-xs"
          >
            {don.loai_chiet_khau_id == null && <option value="">— Chưa có —</option>}
            {active.map((l) => (
              <option key={l.id} value={l.id}>
                {l.ten}
              </option>
            ))}
            <option value={THEM_MOI}>+ Thêm loại mới…</option>
          </select>
          {!!don.loai_chiet_khau_thu_cong && <span className="text-xs text-[var(--color-text-muted)]" title={TIP_THU_CONG}>✎</span>}
        </>
      )}
      {chon && (
        <Modal
          open
          onClose={() => !mut.isPending && setChon(null)}
          title="Đổi loại chiết khấu"
          width="max-w-md"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="ghost" size="sm" disabled={mut.isPending} onClick={() => setChon(null)}>
                Huỷ
              </Btn>
              <Btn variant="subtle" size="sm" disabled={mut.isPending} onClick={() => mut.mutate({ luaChon: chon, gia: null })}>
                Không, giữ nguyên giá
              </Btn>
              <Btn size="sm" disabled={mut.isPending || !giaHopLe} loading={mut.isPending} onClick={() => mut.mutate({ luaChon: chon, gia: Math.round(giaSo) })}>
                Có, cập nhật giá
              </Btn>
            </div>
          }
        >
          <div className="space-y-3 text-sm" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-[10px] bg-[var(--color-surface-soft)] px-3 py-2 text-[13px]">
              <div className="text-[var(--color-text-secondary)]">{don.ten_lk_snapshot ?? don.ma_lk}</div>
              <div className="mt-1">
                <span className="text-[var(--color-text-secondary)]">{tenHienTai}</span>
                <span className="mx-1.5">→</span>
                <b className="text-[var(--color-text)]">{"tenMoi" in chon ? chon.tenMoi : chon.ten}</b>
              </div>
            </div>
            <div>Có cập nhật giá thực tế theo loại chiết khấu mới không?</div>
            <KvRow label={isCongNo ? "Tiền công nợ hiện tại" : "Đơn giá thực tế hiện tại"}>
              {giaHienTai != null ? fmtVND(giaHienTai) : "—"}
              {!isCongNo && <span className="text-[var(--color-text-secondary)]"> × {sl} = {giaHienTai != null ? fmtVND(giaHienTai * sl) : "—"}</span>}
            </KvRow>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">
                {isCongNo ? "Tiền công nợ thực tế mới" : "Đơn giá thực tế mới"}
              </label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={giaMoi}
                onChange={(e) => setGiaMoi(e.target.value)}
                className="focus-ring mt-1 w-full rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm"
              />
              <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                {goiY ? (
                  <>
                    Gợi ý theo loại mới: {isCongNo ? `${fmtVND(goiY.gia)} × ${sl} = ${fmtVND(goiY.gia * sl)}` : fmtVND(goiY.gia)} ({goiY.cachTinh})
                  </>
                ) : (
                  "Loại tự thêm không có công thức — nhập giá thực tế nếu cần đổi."
                )}
                {!isCongNo && giaHopLe && <> · Thành tiền mới: <b className="text-[var(--color-text)]">{fmtVND(giaSo * sl)}</b></>}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </span>
  );
}
