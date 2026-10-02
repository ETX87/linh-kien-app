import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/ui/Toast";
import { Btn } from "../../components/ui/Btn";
import { describeApiError, laTruCongNo } from "./helpers";
import { Modal } from "../../components/ui/Modal";
import { KvRow } from "../../components/ui/KvRow";
import { fmtVND } from "../../types";
import type { DonHangRow } from "./types";
import { Money } from "../../components/ui/Money";

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
  });
}

/** Ten loai theo id (dung chung cho render + do do rong cot). */
export function tenLoaiChietKhau(list: LoaiChietKhauRow[] | undefined, id: number | null | undefined): string | null {
  if (id == null) return null;
  return list?.find((l) => l.id === id)?.ten ?? null;
}

// Mau rieng cho TUNG loai (phan hoi 2026-09-28 "mỗi loại chiết khấu lại cho tôi 1 màu khác để dễ phân
// biệt, các màu sắc này theo tất cả các UI") - token --ck-* + class .ck-* o tokens.css. Loai he thong theo
// `ma`; loai tu them (ma NULL) xoay vong 5 mau phu theo id (on dinh, khong doi khi doi ten/thu tu).
const CK_CLASS_THEO_MA: Record<string, string> = {
  KHONG_CK: "ck-khong-ck",
  DINH_TU: "ck-dinh-tu",
  TONG_200_500: "ck-tong-200-500",
  GIA_KTV: "ck-gia-ktv",
  GIA_DU_PHONG: "ck-gia-du-phong",
  CONG_NO: "ck-cong-no",
};
export function ckClass(loai: Pick<LoaiChietKhauRow, "id" | "ma"> | null | undefined): string {
  if (!loai) return "";
  return (loai.ma && CK_CLASS_THEO_MA[loai.ma]) || `ck-tu-them-${Math.abs(loai.id) % 5}`;
}

/** Chip mau cua 1 loai chiet khau - dung o MOI noi hien loai chiet khau (bang, chi tiet, Settings). */
export function LoaiChietKhauChip({ loai, title, children }: { loai: Pick<LoaiChietKhauRow, "id" | "ma" | "ten">; title?: string; children?: ReactNode }) {
  return (
    <span
      title={title ?? loai.ten}
      className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-[var(--radius-badge)] px-2 py-[3px] text-[11px] font-semibold leading-none ${ckClass(loai)}`}
    >
      <span className="truncate">{loai.ten}</span>
      {children}
    </span>
  );
}

// Ban sao coYeuCauHoaDon() cua backend lib/pxkRecalculate.ts (nguon that, chot 2026-09-29): "Yêu cầu hóa đơn" khac
// trong / khac "Không" -> dong tinh GIA NIEM YET, khong huong chiet khau nao.
// 2026-09-30: "Yêu cầu hóa đơn (xuất cho Trạm)" (nut "HĐ - Xuất cho trạm") VAN tinh chiet khau nhu binh thuong.
export function coYeuCauHoaDon(v: string | null | undefined): boolean {
  const t = (v ?? "").trim().normalize("NFC").toLowerCase();
  return t !== "" && t !== "không" && t !== "khong" && !t.includes("xuất cho trạm") && !t.includes("xuat cho tram");
}

// Ly do dong khong duoc chiet khau (2026-09-30, phan hoi PMH-000106 "sao MUA HÀNG CÓ ID không được tính chiết khấu"):
// hien canh loai chiet khau khi dong co yeu cau hoa don. Chi dong tinh tien nhu don mua (mua + TRỪ CÔNG NỢ) va
// CHUA co gia chot tay (gia chot thang moi cong thuc). Rê chuot xem giai thich day du.
export function HoaDonGiaNiemYet({ don }: {
  don: { yeu_cau_hoa_don?: string | null; loai_don?: string | null; loai_de_xuat?: string | null; gia_chot?: number | null };
}) {
  const tinhNhuMua = don.loai_don === "mua" || laTruCongNo(don.loai_de_xuat);
  if (!tinhNhuMua || don.gia_chot != null || !coYeuCauHoaDon(don.yeu_cau_hoa_don)) return null;
  return (
    <span
      title={`Đơn có yêu cầu hóa đơn ("${don.yeu_cau_hoa_don}") → tính giá niêm yết, không hưởng chiết khấu (Đình tủ, bậc thang, giá KTV, dự phòng).`}
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-[var(--radius-badge)] bg-[var(--color-neutral-soft)] px-2 py-[3px] text-[11px] font-semibold leading-none text-[var(--color-text-secondary)]"
    >
      HĐ · giá niêm yết
    </span>
  );
}

// Don CHUA vao phieu nhung mang tien da thanh toan (TN bo khoi phieu da tra, chon "Đã thanh toán" - migration 0056):
// vao phieu moi thi so nay cong vao tien da tra cua phieu do.
export function TienDaTraDon({ don }: { don: { tien_da_tra?: number | null; tien_da_tra_pxk?: string | null } }) {
  if (!don.tien_da_tra || don.tien_da_tra <= 0) return null;
  return (
    <span
      title={`Đơn đã thanh toán ${don.tien_da_tra.toLocaleString("vi-VN")}đ${don.tien_da_tra_pxk ? ` ở phiếu ${don.tien_da_tra_pxk}` : ""} — vào phiếu mới sẽ được trừ vào số tiền cần chuyển`}
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-[var(--radius-badge)] bg-[var(--color-success-soft)] px-2 py-[3px] text-[11px] font-semibold leading-none text-[var(--color-success-strong)]"
    >
      Đã trả {don.tien_da_tra.toLocaleString("vi-VN")}đ
    </span>
  );
}

const TIP_THU_CONG = "TN đã chọn lại loại chiết khấu này";
const TIP_TU_DONG = "Hệ thống tự gán theo phiếu xuất kho";

export function LoaiChietKhauText({ id, thuCong, title }: { id: number | null | undefined; thuCong?: number | null; title?: string }) {
  const { data } = useLoaiChietKhauList();
  const loai = id == null ? undefined : data?.find((l) => l.id === id);
  if (!loai) return <span className="text-[var(--color-text-faint)]">—</span>;
  return (
    <LoaiChietKhauChip loai={loai} title={title ?? `${loai.ten} — ${thuCong ? TIP_THU_CONG : TIP_TU_DONG}`}>
      {!!thuCong && <span aria-hidden>✎</span>}
    </LoaiChietKhauChip>
  );
}

const THEM_MOI = "__them_moi__";
const LOI: Record<string, string> = {
  LOAI_DANG_TAT: "Loại chiết khấu này đang bị tắt trong Settings.",
  LOAI_KHONG_HOP_LE: "Loại chiết khấu không còn hợp lệ, tải lại trang rồi thử lại.",
  TRA_HANG_KHONG_CO_CHIET_KHAU: "Đơn trả hàng không có chiết khấu.",
  DA_CHOT_CHUYEN_TIEN: "Kế toán đã chốt tiền phiếu này — không đổi được loại chiết khấu nữa.",
  KHONG_THUOC_PXK: "Đơn chưa nằm trong phiếu xuất kho nào.",
  INVALID_STATE: "Phiếu không còn ở bước Đang tạo phiếu.",
};
const loiText = (err: unknown) => (err instanceof ApiError && err.code && LOI[err.code] ? LOI[err.code] : describeApiError(err));

/**
 * Chi duoc doi loai chiet khau TRUOC KHI Ke toan chot tien - khop `choPhepDoiLoaiChietKhau` o backend
 * (lib/loaiChietKhau.ts): PXK con "Dang tao phieu" VA Ke toan chua duyet chuyen tien (sua 2026-09-30).
 */
export function duocDoiLoaiChietKhau(pxk: { trang_thai?: string | null; so_tien_can_chuyen?: number | null; trang_thai_chuyen_tien?: string | null } | null | undefined): boolean {
  return !!pxk && pxk.trang_thai === "Dang tao phieu" && (pxk.so_tien_can_chuyen == null || pxk.trang_thai_chuyen_tien !== "TN da duyet");
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
    case "KH_TRA_GOP":
      return { gia: 0, cachTinh: "đơn KH trả góp — không tính công nợ" };
    case "GIA_DU_PHONG":
      return d.lk_gia_du_phong != null ? { gia: d.lk_gia_du_phong, cachTinh: "giá dự phòng" } : null;
    default:
      return null;
  }
}

type LuaChon = { id: number; ten: string; ma: string | null } | { tenMoi: string };

/** Doi loai chiet khau cho NHIEU don (2026-09-30, phan hoi "cho phép lựa chọn nhiều đơn trong phiếu và sửa chiết khấu 1 lần
 * cho tất cả") - goi TUAN TU endpoint 1 don san co (backend tinh lai tien phieu moi lan). capNhatGia: dat gia thuc te theo
 * cong thuc cua loai moi (giaGoiY); don khong co goi y (loai tu them) giu nguyen gia. Tra ve danh sach loi tung don. */
export async function doiLoaiChietKhauCacDon(dons: DonHangRow[], luaChon: LuaChon, capNhatGia: boolean): Promise<string[]> {
  const loi: string[] = [];
  const ma = "tenMoi" in luaChon ? null : luaChon.ma;
  for (const d of dons) {
    try {
      await api.patch(
        `/phieu-xuat-kho/don-hang/${encodeURIComponent(d.id)}/loai-chiet-khau`,
        "tenMoi" in luaChon ? { ten_moi: luaChon.tenMoi } : { loai_chiet_khau_id: luaChon.id },
      );
      const g = capNhatGia ? giaGoiY(ma, d) : null;
      if (g) {
        const congNo = d.loai_don === "cong_no" && !laTruCongNo(d.loai_de_xuat);
        const sl = d.so_luong_thuc_xuat ?? d.so_luong_de_xuat;
        if (congNo) await api.patch(`/dat-mua-lk/don-hang/${encodeURIComponent(d.id)}/so-tien-cong-no`, { so_tien_cong_no: g.gia * sl });
        else await api.patch(`/dat-mua-lk/don-hang/${encodeURIComponent(d.id)}`, { gia_chot: g.gia });
      }
    } catch (err) {
      loi.push(`${d.ma_lk}: ${loiText(err)}`);
    }
  }
  return loi;
}

const lamMoiSauDoiLoai = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({
    predicate: (q) => {
      const k = String(q.queryKey[0]);
      return k.startsWith("dat-mua-lk") || k === "pxk-detail" || k === LOAI_CHIET_KHAU_KEY[0];
    },
  });

/** Popup doi loai chiet khau 1 lan cho cac don DA CHON trong 1 phieu (PxkDongDonHangTable). */
export function DoiLoaiChietKhauNhieuDon({ dons, onClose, onDone }: { dons: DonHangRow[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data: list } = useLoaiChietKhauList();
  const [loaiId, setLoaiId] = useState("");
  const active = (list ?? []).filter((l) => l.bat_tat);
  const loai = active.find((l) => String(l.id) === loaiId) ?? null;
  const mut = useMutation({
    mutationFn: (capNhatGia: boolean) => doiLoaiChietKhauCacDon(dons, { id: loai!.id, ten: loai!.ten, ma: loai!.ma }, capNhatGia),
    onSuccess: (loi, capNhatGia) => {
      if (loi.length > 0) addToast(`Đã đổi ${dons.length - loi.length}/${dons.length} đơn. Lỗi: ${loi.join("; ")}`);
      else addToast(`Đã đổi loại chiết khấu cho ${dons.length} đơn${capNhatGia ? " và cập nhật giá theo công thức" : " (giữ nguyên giá)"}`);
      onDone();
    },
    onSettled: () => lamMoiSauDoiLoai(qc),
  });
  return (
    <Modal
      open
      onClose={() => !mut.isPending && onClose()}
      title={`Đổi loại chiết khấu cho ${dons.length} đơn`}
      width="max-w-lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Btn variant="ghost" size="sm" disabled={mut.isPending} onClick={onClose}>Huỷ</Btn>
          <Btn variant="subtle" size="sm" disabled={!loai || mut.isPending} onClick={() => mut.mutate(false)}>Đổi, giữ nguyên giá</Btn>
          <Btn size="sm" disabled={!loai || mut.isPending} loading={mut.isPending} onClick={() => mut.mutate(true)}>Đổi + cập nhật giá theo công thức</Btn>
        </div>
      }
    >
      <div className="space-y-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Loại chiết khấu mới</span>
          <select
            autoFocus
            value={loaiId}
            onChange={(e) => setLoaiId(e.target.value)}
            className="focus-ring mt-1 h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-sm"
          >
            <option value="">— Chọn loại —</option>
            {active.map((l) => (
              <option key={l.id} value={l.id}>{l.ten}</option>
            ))}
          </select>
        </label>
        <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-[var(--color-border)]">
          <table className="tbl w-full text-[12px]">
            <thead>
              <tr className="tbl-head">
                <th className="px-2 py-1.5 text-left">Mã LK</th>
                <th className="px-2 py-1.5 text-left">Loại hiện tại</th>
                <th className="px-2 py-1.5 text-right">Giá theo loại mới</th>
              </tr>
            </thead>
            <tbody>
              {dons.map((d) => {
                const g = loai ? giaGoiY(loai.ma, d) : null;
                return (
                  <tr key={d.id} className="border-t border-[var(--color-border-soft)]">
                    <td className="px-2 py-1 font-mono">{d.ma_lk}</td>
                    <td className="px-2 py-1">{tenLoaiChietKhau(list, d.loai_chiet_khau_id) ?? "—"}</td>
                    <td className="px-2 py-1 text-right">{g ? <><Money>{fmtVND(g.gia)}</Money> <span className="text-[var(--color-text-secondary)]">({g.cachTinh})</span></> : "giữ giá"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-[var(--color-text-secondary)]">
          "Cập nhật giá theo công thức" đặt giá thực tế từng đơn theo loại mới (cột bên phải); loại tự thêm không có công thức thì giữ giá.
        </p>
      </div>
    </Modal>
  );
}

/**
 * O chon loai chiet khau cho TN. Chon loai khac -> popup hoi "có cập nhật giá thực tế không?" (phan hoi
 * 2026-09-26): Không = chi doi nhan, giu nguyen gia; Có = doi nhan + luu gia thuc te moi (goi y san theo
 * cong thuc cua loai he thong, TN tu sua duoc). Gia luu qua DUNG endpoint san co cua cot "Tiền cần chuyển":
 * mua -> gia_chot (don gia thuc te), cong_no -> so_tien_cong_no. `duocDoi` = false -> chi hien chu + 🔒.
 */
export function LoaiChietKhauPicker({ don, duocDoi, dongKhac }: { don: DonHangRow; duocDoi: boolean; dongKhac?: DonHangRow[] }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data: list } = useLoaiChietKhauList();
  const [themMoi, setThemMoi] = useState(false);
  const [tenMoi, setTenMoi] = useState("");
  const [chon, setChon] = useState<LuaChon | null>(null);
  const [giaMoi, setGiaMoi] = useState("");
  // "Áp dụng cho cả các đơn khác trong phiếu" (2026-09-30) - chi co khi goi tu bang dong don cua PXK (dongKhac).
  const [apDungTatCa, setApDungTatCa] = useState(false);
  const soDongKhac = dongKhac?.length ?? 0;

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
      if (gia != null) {
        try {
          if (isCongNo) await api.patch(`/dat-mua-lk/don-hang/${encodeURIComponent(don.id)}/so-tien-cong-no`, { so_tien_cong_no: gia });
          else await api.patch(`/dat-mua-lk/don-hang/${encodeURIComponent(don.id)}`, { gia_chot: gia });
        } catch (err) {
          throw new Error(`Đã đổi loại chiết khấu nhưng chưa lưu được giá: ${loiText(err)}`);
        }
      }
      if (apDungTatCa && dongKhac && dongKhac.length > 0) {
        const loi = await doiLoaiChietKhauCacDon(dongKhac, luaChon, gia != null);
        if (loi.length > 0) throw new Error(`Đã đổi đơn này nhưng lỗi ở ${loi.length} đơn khác: ${loi.join("; ")}`);
      }
    },
    onSuccess: (_r, v) => {
      addToast(
        (v.gia == null ? "Đã đổi loại chiết khấu (giữ nguyên giá)" : "Đã đổi loại chiết khấu và cập nhật giá thực tế") +
          (apDungTatCa && soDongKhac > 0 ? ` — áp dụng cho cả ${soDongKhac + 1} đơn trong phiếu` : ""),
      );
      setChon(null);
      setApDungTatCa(false);
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
            // To mau o chon theo loai DANG chon (cung mau chip) - moi option cung mang mau rieng cua no.
            className={`focus-ring h-[30px] max-w-[260px] rounded-lg border border-[var(--line)] px-1.5 text-xs font-semibold ${ckClass(active.find((l) => l.id === don.loai_chiet_khau_id)) || "bg-[var(--surface)]"}`}
          >
            {don.loai_chiet_khau_id == null && <option value="">— Chưa có —</option>}
            {active.map((l) => (
              <option key={l.id} value={l.id} className={ckClass(l)}>
                {l.ten}
              </option>
            ))}
            <option value={THEM_MOI} className="bg-[var(--surface)] text-[var(--color-text)]">+ Thêm loại mới…</option>
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
            {soDongKhac > 0 && (
              <label className="flex items-start gap-2 rounded-[10px] border border-[var(--color-border)] px-3 py-2 text-[13px]">
                <input type="checkbox" className="mt-0.5" checked={apDungTatCa} onChange={(e) => setApDungTatCa(e.target.checked)} />
                <span>
                  Áp dụng loại này cho <b>cả {soDongKhac} đơn khác</b> trong phiếu
                  <span className="block text-[12px] text-[var(--color-text-secondary)]">Chọn "Có" thì giá các đơn khác tính theo công thức của loại mới (loại tự thêm giữ giá).</span>
                </span>
              </label>
            )}
            <div>Có cập nhật giá thực tế theo loại chiết khấu mới không?</div>
            <KvRow label={isCongNo ? "Tiền công nợ hiện tại" : "Đơn giá thực tế hiện tại"}>
              {giaHienTai != null ? <Money>{fmtVND(giaHienTai)}</Money> : "—"}
              {!isCongNo && <span className="text-[var(--color-text-secondary)]"> × {sl} = {giaHienTai != null ? <Money>{fmtVND(giaHienTai * sl)}</Money> : "—"}</span>}
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
                    Gợi ý theo loại mới: {isCongNo ? <><Money>{fmtVND(goiY.gia)}</Money> × {sl} = <Money>{fmtVND(goiY.gia * sl)}</Money></> : <Money>{fmtVND(goiY.gia)}</Money>} ({goiY.cachTinh})
                  </>
                ) : (
                  "Loại tự thêm không có công thức — nhập giá thực tế nếu cần đổi."
                )}
                {!isCongNo && giaHopLe && <> · Thành tiền mới: <b className="text-[var(--color-text)]"><Money>{fmtVND(giaSo * sl)}</Money></b></>}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </span>
  );
}
