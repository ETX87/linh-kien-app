import { useState, useEffect } from "react";
import { api, buildQuery } from "../../api/client";
import { shortKhuVuc } from "../../lib/khuVucShortLabel";
import { laTruCongNo } from "./helpers";

// Canh bao SONG "don nay se tu dong duyet hay khong" ngay luc soan don (them 2026-09-11, phan hoi
// "linh kiện này tại khu vực MB đang hết/thiếu hàng... đơn của bạn sẽ cần phê duyệt / kho đủ hàng đơn
// sẽ tự động duyệt") - debounce 500ms giong het pattern MaYeuCauSuCoCheck.tsx, goi GET /dat-mua-lk/
// du-doan-duyet (chi tra thanh phan TON KHO, xem comment route do). Rieng phan CONG NO khong goi rieng
// nua - dung LAI sePhepDuCongNo da tinh san o useTaoDonForm.ts (tong TAT CA cac dong cong_no dang soan,
// dung cach nguoi dung dang danh gia that o POST /phieu-dat) truyen tu TaoDonTab.tsx xuong.
export function DuDoanDuyetHint({
  maLk, soLuong, loaiDeXuat, nguoiNhanHang, loaiDon, sePhepDuCongNo,
}: {
  maLk: string;
  soLuong: number;
  loaiDeXuat: string;
  nguoiNhanHang: string;
  loaiDon: "mua" | "cong_no" | "tra_hang";
  sePhepDuCongNo: boolean | null;
}) {
  const [result, setResult] = useState<{ ap_dung: boolean; du_ton: boolean | null; ton_chot: number | null; khu_vuc_ma: string | null } | null>(null);
  const ma = maLk.trim();
  const lde = loaiDeXuat.trim();

  useEffect(() => {
    setResult(null);
    if (loaiDon === "tra_hang" || !ma || !(soLuong > 0) || !lde) return;
    const t = setTimeout(() => {
      api
        .get<{ ap_dung: boolean; du_ton: boolean | null; ton_chot: number | null; khu_vuc_ma: string | null }>(
          `/dat-mua-lk/du-doan-duyet${buildQuery({ ma_lk: ma, so_luong: soLuong, loai_de_xuat: lde, nguoi_nhan_hang: nguoiNhanHang || undefined })}`,
        )
        .then(setResult)
        .catch(() => setResult(null));
    }, 500);
    return () => clearTimeout(t);
  }, [ma, soLuong, lde, nguoiNhanHang, loaiDon]);

  if (!result?.ap_dung || result.khu_vuc_ma == null || result.du_ton == null) return null;
  // Dong cong_no ma chua co du lieu tran/cong no chot (sePhepDuCongNo null) - CHUA ket luan duoc, im
  // lang cho thay vi hien nham 1 verdict roi doi lai ngay sau (giong cach footer "vuot tran cong no"
  // cung doi congNoDuKien load xong moi hien).
  // "TRỪ CÔNG NỢ" khong doi chieu cong no (chot 2026-09-28) - xu ly nhu don mua.
  const canDoiChieuCongNo = loaiDon === "cong_no" && !laTruCongNo(loaiDeXuat);
  if (canDoiChieuCongNo && sePhepDuCongNo == null) return null;

  const duCongNo = !canDoiChieuCongNo || sePhepDuCongNo === true;
  const seTuDongDuyet = result.du_ton && duCongNo;

  if (seTuDongDuyet) {
    return (
      <div className="mt-1.5 rounded-lg border border-[var(--teal-500)]/30 bg-[var(--teal-100)]/50 px-2.5 py-1.5 text-[11px] font-medium text-[var(--teal-700)]">
        ✅ Kho khu vực {shortKhuVuc(result.khu_vuc_ma)} còn đủ hàng — đơn này sẽ được tự động duyệt, chờ chuyển tiền.
      </div>
    );
  }

  return (
    <div className="mt-1.5 rounded-lg border border-[var(--amber-500)]/30 bg-[var(--amber-100)]/60 px-2.5 py-1.5 text-[11px] font-medium text-[var(--amber-700)]">
      {!result.du_ton
        ? `⚠ Linh kiện này tại khu vực ${shortKhuVuc(result.khu_vuc_ma)} đang hết/thiếu hàng (kho còn ${Math.max(0, result.ton_chot ?? 0)}/${soLuong}) — đơn sẽ cần Tác nghiệp phê duyệt.`
        : "⚠ Đủ hàng nhưng vượt trần công nợ dự kiến — đơn sẽ cần Tác nghiệp phê duyệt."}
    </div>
  );
}
