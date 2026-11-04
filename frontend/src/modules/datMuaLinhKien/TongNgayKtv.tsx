import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { fmtDate, fmtVND } from "../../types";
import { Money } from "../../components/ui/Money";
import { LoaiChietKhauChip, useLoaiChietKhauList } from "./LoaiChietKhau";
import { t } from "../../i18n";
import { MaPhieuLink } from "./MaLienKet";

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
  // v1.434: phieu cua KTV chua duoc Ke toan chot xong don xuat (don khac ngay) - cong vao moc chiet khau cua don moi.
  phieu_mo?: { id: string; tong: number }[];
  tong_tinh_ck?: number;
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
  if (tong < MOC_1) return t("Thêm {tien} để được giảm 30%", { tien: fmtVND(MOC_1 - tong) });
  if (tong < MOC_2) return t("Thêm {tien} để hưởng Giá KTV", { tien: fmtVND(MOC_2 - tong) });
  return t("Đã đạt mức chiết khấu cao nhất");
}

/** `ngays` rong = hom nay (gio VN, backend tu tinh). */
export function useTongNgayKtv(email: string | null | undefined, ngays: string[] = []) {
  const key = [...new Set(ngays.filter(Boolean))].sort().join(",");
  return useQuery({
    queryKey: [TONG_NGAY_KTV_KEY, email ?? "", key],
    queryFn: () =>
      api.get<{ nguoi_nhan_hang: string | null; rows: TongNgayKtvRow[]; quy_du?: number; kh_le?: boolean }>(
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
  return <LoaiChietKhauChip loai={loai} title={t("Mức chiết khấu theo tổng ngày — {goiY}. Linh kiện Đình tủ luôn tính giá bán × 85%.", { goiY: goiYMucTiep(tong) })} />;
}

/**
 * 1 dong tong ngay. `themGiaTri` = gia tri cac dong dang soan (man tao don) - cong vao tong de xem truoc muc
 * chiet khau sau khi tao; "Ước tính chuyển" van la cua cac don DA tao (don dang soan chua tinh duoc chinh xac).
 */
// khLe: nguoi nhan la KH le (migration 0074) - tinh gia niem yet, khong co bac thang -> an muc/goi y chiet khau.
export function TongNgayKtvLine({ row, themGiaTri = 0, hienNgay = true, khLe = false }: { row: TongNgayKtvRow; themGiaTri?: number; hienNgay?: boolean; khLe?: boolean }) {
  const coSo = row.tong_tinh_ck ?? row.tong_gia_tri;
  const tongSau = coSo + themGiaTri;
  const phieuMo = row.phieu_mo ?? [];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-text-secondary)]">
      <span className="whitespace-nowrap">
        {hienNgay ? t("Tổng đặt ngày {ngay}", { ngay: fmtDate(row.ngay) }) : t("Tổng đặt trong ngày")}:{" "}
        <Money className="font-semibold text-[var(--color-text)]">{fmtVND(row.tong_gia_tri)}</Money>
        {row.so_don > 0 && <span> {t("({n} đơn)", { n: row.so_don })}</span>}
      </span>
      <span className="whitespace-nowrap">
        · {t("Ước tính chuyển:")} <Money className="font-semibold text-[var(--color-text)]">{fmtVND(row.tong_can_chuyen)}</Money>
      </span>
      {phieuMo.length > 0 && !khLe && (
        <span
          className="min-w-0"
          title={t("Các phiếu này chưa được Kế toán chốt xong đơn xuất nên giá trị được cộng vào mức chiết khấu của đơn đặt mới — đặt thêm trước khi Kế toán chốt để hưởng chiết khấu cao hơn.")}
        >
          · {t("+ phiếu đang mở")}{" "}
          {phieuMo.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <MaPhieuLink id={p.id} /> (<Money>{fmtVND(p.tong)}</Money>)
            </span>
          ))}{" "}
          = <Money className="font-semibold text-[var(--color-text)]">{fmtVND(coSo)}</Money>
        </span>
      )}
      {themGiaTri > 0 && (
        <span className="whitespace-nowrap">
          · {t("Sau đơn này:")} <Money className="font-semibold text-[var(--color-text)]">{fmtVND(tongSau)}</Money>
        </span>
      )}
      {khLe ? (
        <span className="whitespace-nowrap text-[var(--color-text-faint)]">· {t("KH lẻ: giá niêm yết, không chiết khấu")}</span>
      ) : (
        <>
          <MucChip tong={tongSau} />
          <span className="whitespace-nowrap text-[var(--color-text-faint)]">{goiYMucTiep(tongSau)}</span>
        </>
      )}
    </div>
  );
}

/** Tong ngay cua 1 KTV cho 1 hoac nhieu ngay (moi ngay 1 dong). `ngays` rong = hom nay. Kem dong "Quỹ dư" (quy tien
 * chuyen du cua nguoi nhan hang, migration 0047) tru khi `anQuy` (noi da hien quy rieng, vd khoi Chuyển tiền PXK). */
export function TongNgayKtvInfo({ email, ngays = [], themGiaTri = 0, anQuy = false }: { email: string | null | undefined; ngays?: string[]; themGiaTri?: number; anQuy?: boolean }) {
  const { data, isLoading } = useTongNgayKtv(email, ngays);
  if (!email) return null;
  if (isLoading) return <div className="text-xs text-[var(--color-text-faint)]">{t("Đang tính tổng đặt trong ngày…")}</div>;
  const rows = data?.rows ?? [];
  const quyDu = anQuy || !data?.nguoi_nhan_hang ? null : (data.quy_du ?? 0);
  if (rows.length === 0 && quyDu == null) return null;
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <TongNgayKtvLine key={r.ngay} row={r} themGiaTri={themGiaTri} hienNgay={ngays.length > 0} khLe={!!data?.kh_le} />
      ))}
      {quyDu != null && (
        <div className="text-xs text-[var(--color-text-secondary)]">
          {t("Quỹ dư hiện tại:")} <Money className="font-semibold text-[var(--color-text)]">{fmtVND(quyDu)}</Money>
          {quyDu > 0 && <span className="text-[var(--color-text-faint)]"> {t("— tự trừ vào phiếu cần chuyển tiền tiếp theo")}</span>}
        </div>
      )}
    </div>
  );
}

// Canh bao 1 dong tao don: tong ngay da dat muc gia KTV (>= 500k) nhung LK CHUA co Gia KTV -> dong nay tinh gia niem yet, khong chiet
// khau (quy tac tinhToanPxk o backend lib/pxkRecalculate.ts). Dung o TaoDonTab + TaoDonMobileScreen (co `chuaCoGiaKtv` cua giaUocTinhDong).
export function CanhBaoChuaCoGiaKtv() {
  return (
    <div className="mt-1.5 rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-2.5 py-1.5 text-xs text-[var(--color-warning-strong)]">
      {t("⚠ Linh kiện này chưa có Giá KTV — tổng đặt hôm nay đã từ 500k (mức giá KTV) nhưng dòng này vẫn tính giá niêm yết, không được chiết khấu. Hỏi Mua hàng cập nhật Giá KTV trước khi đặt nếu muốn hưởng chiết khấu.")}
    </div>
  );
}
