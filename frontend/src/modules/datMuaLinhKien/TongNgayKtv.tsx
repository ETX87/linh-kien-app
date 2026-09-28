import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { fmtDate, fmtVND } from "../../types";
import { Money } from "../../components/ui/Money";
import { LoaiChietKhauChip, useLoaiChietKhauList } from "./LoaiChietKhau";

// "Tổng tiền KTV đặt Mua + Trừ công nợ trong ngày" (them 2026-09-28) - moc chiet khau 200k/500k cua MOI dong
// don tinh theo tong nay (lib/pxkRecalculate.ts tinhToanPxk), kem "Ước tính chuyển" (tong tien uoc tinh can
// chuyen cua cac don do theo cung thuat toan tien PXK). Nguon: GET /api/dat-mua-lk/tong-ngay-ktv (backend tu
// quy Ve tinh -> Tram vi don cua Ve tinh ghi nguoi nhan hang = Tram). Hien o: Trang chu KTV, chi tiet don,
// chi tiet PXK, man tao don, modal tao PXK.

export const TONG_NGAY_KTV_KEY = "dat-mua-lk-tong-ngay-ktv";

export interface TongNgayKtvRow {
  ngay: string;
  tong_gia_tri: number;
  tong_can_chuyen: number;
  so_don: number;
}

const MOC_1 = 200000;
const MOC_2 = 500000;

/** Muc bac thang theo tong ngay - khop giaBacThang() o backend (GIA_KTV chi ap dung dong co gia KTV). */
export function maMucTheoTong(tong: number): "KHONG_CK" | "TONG_200_500" | "GIA_KTV" {
  if (tong < MOC_1) return "KHONG_CK";
  if (tong < MOC_2) return "TONG_200_500";
  return "GIA_KTV";
}

function goiYMucTiep(tong: number): string {
  if (tong < MOC_1) return `Thêm ${fmtVND(MOC_1 - tong)} để được giảm 30%`;
  if (tong < MOC_2) return `Thêm ${fmtVND(MOC_2 - tong)} để hưởng Giá KTV`;
  return "Đã đạt mức chiết khấu cao nhất";
}

/** `ngays` rong = hom nay (gio VN, backend tu tinh). */
export function useTongNgayKtv(email: string | null | undefined, ngays: string[] = []) {
  const key = [...new Set(ngays.filter(Boolean))].sort().join(",");
  return useQuery({
    queryKey: [TONG_NGAY_KTV_KEY, email ?? "", key],
    queryFn: () =>
      api.get<{ nguoi_nhan_hang: string | null; rows: TongNgayKtvRow[] }>(
        `/dat-mua-lk/tong-ngay-ktv?nguoi_nhan_hang=${encodeURIComponent(email ?? "")}${key ? `&ngay=${key}` : ""}`,
      ),
    enabled: !!email,
    staleTime: 30_000,
  });
}

function MucChip({ tong }: { tong: number }) {
  const { data: list } = useLoaiChietKhauList();
  const loai = list?.find((l) => l.ma === maMucTheoTong(tong));
  if (!loai) return null;
  return <LoaiChietKhauChip loai={loai} title={`Mức chiết khấu theo tổng ngày — ${goiYMucTiep(tong)}. Linh kiện Đình tủ luôn tính giá bán × 85%.`} />;
}

/**
 * 1 dong tong ngay. `themGiaTri` = gia tri cac dong dang soan (man tao don) - cong vao tong de xem truoc muc
 * chiet khau sau khi tao; "Ước tính chuyển" van la cua cac don DA tao (don dang soan chua tinh duoc chinh xac).
 */
export function TongNgayKtvLine({ row, themGiaTri = 0, hienNgay = true }: { row: TongNgayKtvRow; themGiaTri?: number; hienNgay?: boolean }) {
  const tongSau = row.tong_gia_tri + themGiaTri;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-text-secondary)]">
      <span className="whitespace-nowrap">
        {hienNgay ? `Tổng đặt ngày ${fmtDate(row.ngay)}` : "Tổng đặt trong ngày"}:{" "}
        <Money className="font-semibold text-[var(--color-text)]">{fmtVND(row.tong_gia_tri)}</Money>
        {row.so_don > 0 && <span> ({row.so_don} đơn)</span>}
      </span>
      <span className="whitespace-nowrap">
        · Ước tính chuyển: <Money className="font-semibold text-[var(--color-text)]">{fmtVND(row.tong_can_chuyen)}</Money>
      </span>
      {themGiaTri > 0 && (
        <span className="whitespace-nowrap">
          · Sau đơn này: <Money className="font-semibold text-[var(--color-text)]">{fmtVND(tongSau)}</Money>
        </span>
      )}
      <MucChip tong={tongSau} />
      <span className="whitespace-nowrap text-[var(--color-text-faint)]">{goiYMucTiep(tongSau)}</span>
    </div>
  );
}

/** Tong ngay cua 1 KTV cho 1 hoac nhieu ngay (moi ngay 1 dong). `ngays` rong = hom nay. */
export function TongNgayKtvInfo({ email, ngays = [], themGiaTri = 0 }: { email: string | null | undefined; ngays?: string[]; themGiaTri?: number }) {
  const { data, isLoading } = useTongNgayKtv(email, ngays);
  if (!email) return null;
  if (isLoading) return <div className="text-xs text-[var(--color-text-faint)]">Đang tính tổng đặt trong ngày…</div>;
  const rows = data?.rows ?? [];
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <TongNgayKtvLine key={r.ngay} row={r} themGiaTri={themGiaTri} hienNgay={ngays.length > 0} />
      ))}
    </div>
  );
}
