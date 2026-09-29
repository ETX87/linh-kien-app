import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/x/Badge";
import { Select } from "../../components/ui/Select";
import { Money } from "../../components/ui/Money";
import { api, ApiError } from "../../api/client";
import { fmtDateTime, fmtVND } from "../../types";
import type { DonHangRow, LyDoChamRow } from "./types";
import { LoaiChietKhauPicker, LoaiChietKhauText, duocDoiLoaiChietKhau } from "./LoaiChietKhau";
import { describeApiError, invalidatePipelineCounts, laTruCongNo } from "./helpers";
import { LoaiDeXuatBadge } from "./SharedUi";

// Bang "Dòng đơn hàng" cua 1 PXK - TACH component 2026-09-29 (phan hoi "trong danh sách phiếu xuất, tạo bảng danh sách
// dạng phiếu gốc, ấn xổ xuống sẽ có danh sách các dòng đơn hàng chi tiết bên trong, các chức năng sẽ tương tự các chức
// năng đang có trong 'dòng đơn hàng'") - dung CHUNG cho Drawer chi tiet PXK (PxkDetailModal) VA dong xo xuong trong danh
// sach PXK (PhieuXuatKhoTab), 1 ban logic duy nhat: sua tien (popup SuaTienDongModal - cha tu mo qua onSuaTien), sua tien
// cong no inline, doi loai chiet khau, nhap ly do cham, bo don khoi phieu, bam dong mo chi tiet don (onOpenDon).
//
// giuPhieuTrong: true = dang o Drawer chi tiet (bo don cuoi -> giu phieu trong, dong Drawer moi tu huy - xem roiPhieu
// trong PxkDetailModal); false = thao tac tu danh sach (khong co "dong man") -> bo don cuoi thi huy phieu NGAY qua
// POST /:id/huy-neu-trong (cung quy uoc "thao tác từ ngoài → hủy phiếu ngay" cua CLAUDE.md).
export function PxkDongDonHangTable({
  pxkId, pxk, donHang, canTacNghiep, canKeToan, addToast, onOpenDon, onSuaTien, giuPhieuTrong,
}: {
  pxkId: string;
  pxk: { loai_don?: "mua" | "cong_no" | "tra_hang" | null; trang_thai?: string | null; so_tien_can_chuyen?: number | null; trang_thai_chuyen_tien?: string | null };
  donHang: DonHangRow[];
  canTacNghiep: boolean;
  canKeToan: boolean;
  addToast: (msg: string) => void;
  onOpenDon: (donHangId: string) => void;
  onSuaTien: (donHangId: string) => void;
  giuPhieuTrong: boolean;
}) {
  const qc = useQueryClient();
  const trangThai = pxk.trang_thai ?? "";
  const dangTao = trangThai === "Dang tao phieu";
  // Nhap "Ly do cham" tung dong (CHOT 2026-08-14 - xem lib/hanLyDoCham.ts backend) - TN dien khi dong ton qua 24h ke tu
  // "Cho TN duyet" ma chua duoc dua vao PXK "Cho ke toan", bat buoc truoc khi bam "Gui ke toan".
  const [lyDoChamDraft, setLyDoChamDraft] = useState<Record<string, string>>({});
  const [soTienCongNoDraft, setSoTienCongNoDraft] = useState<Record<string, string>>({});
  // Goi y tu danh muc "Mua hang" (settings_ly_do_cham) - cung queryKey voi PxkDetailModal nen dung chung cache.
  const { data: lyDoChamGoiYData } = useQuery({
    queryKey: ["dat-mua-lk-ly-do-cham"],
    queryFn: () => api.get<{ rows: LyDoChamRow[] }>("/dat-mua-lk/ly-do-cham?he_thong=" + encodeURIComponent("Mua hàng")),
    enabled: canTacNghiep,
  });

  function lamMoi() {
    qc.invalidateQueries({ queryKey: ["pxk-detail", pxkId] });
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
  }

  // SUA (phan hoi QA 2026-08-31, muc #5): POST /don-hang/:id/giai-trinh (migration 0014) - giai trinh LAP LAI moi khi
  // qua han lai, lich su hien day du (giaiTrinh tren tung dong).
  const lyDoChamMutation = useMutation({
    mutationFn: ({ donHangId, ly_do_cham }: { donHangId: string; ly_do_cham: string }) =>
      api.post(`/dat-mua-lk/don-hang/${donHangId}/giai-trinh`, { noi_dung: ly_do_cham }),
    onSuccess: (_res, { donHangId }) => {
      setLyDoChamDraft((p) => { const n = { ...p }; delete n[donHangId]; return n; });
      lamMoi();
      addToast("Đã lưu lý do chậm");
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // PATCH /don-hang/:id/so-tien-cong-no (datMuaLinhKien.ts) - chi dong cong no thuan (khong phai TRỪ CÔNG NỢ).
  const soTienCongNoMutation = useMutation({
    mutationFn: ({ donHangId, so_tien_cong_no }: { donHangId: string; so_tien_cong_no: number }) =>
      api.patch(`/dat-mua-lk/don-hang/${donHangId}/so-tien-cong-no`, { so_tien_cong_no }),
    onSuccess: (_res, { donHangId }) => {
      setSoTienCongNoDraft((p) => { const n = { ...p }; delete n[donHangId]; return n; });
      lamMoi();
      addToast("Đã lưu tiền cần chuyển của đơn");
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const boDonMutation = useMutation({
    mutationFn: async ({ donHangId, laDonCuoi }: { donHangId: string; laDonCuoi: boolean }) => {
      await api.delete(`/phieu-xuat-kho/${pxkId}/dong/${donHangId}`);
      if (laDonCuoi && !giuPhieuTrong) {
        const r = await api.post<{ ok: true; da_huy: boolean }>(`/phieu-xuat-kho/${pxkId}/huy-neu-trong`, {});
        return r.da_huy;
      }
      return false;
    },
    onSuccess: (daHuyPhieu) => {
      lamMoi();
      invalidatePipelineCounts(qc);
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      addToast(daHuyPhieu ? "Đã bỏ đơn — phiếu không còn đơn nào nên đã tự hủy" : "Đã bỏ đơn khỏi phiếu");
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      addToast(code === "LAST_ORDER" ? "Không thể bỏ - đây là đơn cuối cùng trong phiếu" : "Lỗi: " + describeApiError(err));
    },
  });

  const coCotBo = (canTacNghiep || canKeToan) && dangTao;

  return (
    <table className="tbl min-w-full border-collapse">
      <thead>
        <tr className="tbl-head">
          <th className="px-2.5 py-2">Mã</th>
          <th className="px-2.5 py-2">Tên LK</th>
          <th className="px-2.5 py-2 whitespace-nowrap">Loại đề xuất</th>
          <th className="px-2.5 py-2 text-right whitespace-nowrap">SL đề xuất</th>
          <th className="px-2.5 py-2 text-right whitespace-nowrap">SL thực xuất</th>
          <th className="px-2.5 py-2 text-right">Tiền cần chuyển</th>
          {pxk.loai_don !== "tra_hang" && <th className="px-2.5 py-2">Loại chiết khấu</th>}
          <th className="px-2.5 py-2">Lý do chậm</th>
          {coCotBo && <th className="px-2.5 py-2"></th>}
        </tr>
      </thead>
      <tbody>
        {donHang.length === 0 && (
          <tr>
            <td colSpan={9} className="px-2.5 py-3 text-center text-xs text-[var(--ink-400)]">Phiếu không còn đơn nào.</td>
          </tr>
        )}
        {donHang.map((d) => (
          <tr
            key={d.id}
            onClick={() => onOpenDon(d.id)}
            className={`border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer ${d.uu_tien === 1 ? "bg-[var(--orange-100)] ring-1 ring-inset ring-[var(--orange-500)]" : ""}`}
          >
            <td className="px-2.5 py-2 font-mono">{d.ma_lk}</td>
            <td className="px-2.5 py-2">
              {d.uu_tien === 1 && <span title="Ưu tiên">⭐ </span>}
              {d.ten_lk_snapshot ?? d.ma_lk}
            </td>
            {/* Loai de xuat quyet dinh cach tinh tien (2026-09-28). */}
            <td className="px-2.5 py-2 whitespace-nowrap"><LoaiDeXuatBadge loaiDon={d.loai_don ?? pxk.loai_don ?? undefined} loaiDeXuat={d.loai_de_xuat} /></td>
            <td className="px-2.5 py-2 text-right">{d.so_luong_de_xuat}</td>
            <td className="px-2.5 py-2 text-right">
              {d.so_luong_thuc_xuat == null ? (
                <span className="text-[var(--ink-400)]">—</span>
              ) : d.so_luong_thuc_xuat !== d.so_luong_de_xuat ? (
                <span className="font-semibold text-[var(--amber-700)]" title="Khác SL đề xuất">{d.so_luong_thuc_xuat}</span>
              ) : (
                d.so_luong_thuc_xuat
              )}
            </td>
            <td className="px-2.5 py-2 text-right" onClick={(e) => e.stopPropagation()}>
              {/* Mua / TRỪ CÔNG NỢ: READ-ONLY = tien uoc tinh backend tinh (loai chiet khau, gia chot, SL thuc xuat) - TN bam
                  vao so tien de mo popup sua SL thuc xuat/Don gia (2026-09-22). Cong no thuan: GIU co che sua tay
                  so_tien_cong_no (nuoi cong no KTV qua computeCongNoPhatSinh). */}
              {pxk.loai_don === "mua" || laTruCongNo(d.loai_de_xuat) ? (
                (() => {
                  const donGia = d.gia_chot ?? d.gia_de_xuat;
                  const sl = d.so_luong_thuc_xuat ?? d.so_luong_de_xuat;
                  const noiDung = d.tien_uoc_tinh != null || donGia != null ? (
                    <span className="italic text-[var(--ink-400)]" title="Ước tính theo loại chiết khấu, giá chốt và SL thực xuất">
                      <Money>{fmtVND(d.tien_uoc_tinh ?? (donGia ?? 0) * sl)}</Money> (ước tính)
                    </span>
                  ) : (
                    <span className="text-[var(--ink-400)]">—</span>
                  );
                  return canTacNghiep && dangTao ? (
                    <button
                      type="button"
                      className="hover:underline decoration-dotted underline-offset-2"
                      title="Bấm để sửa SL thực xuất/Đơn giá thực tế"
                      onClick={() => onSuaTien(d.id)}
                    >
                      {noiDung}
                    </button>
                  ) : (
                    noiDung
                  );
                })()
              ) : soTienCongNoDraft[d.id] !== undefined ? (
                <span className="inline-flex gap-1 items-center">
                  <input
                    type="number"
                    autoFocus
                    value={soTienCongNoDraft[d.id]}
                    onChange={(e) => setSoTienCongNoDraft((p) => ({ ...p, [d.id]: e.target.value }))}
                    className="focus-ring w-24 bg-[var(--surface-100)] border border-[var(--line)] rounded px-1.5 py-0.5 text-xs text-right"
                  />
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => soTienCongNoMutation.mutate({ donHangId: d.id, so_tien_cong_no: Number(soTienCongNoDraft[d.id]) })}
                    disabled={!soTienCongNoDraft[d.id]?.trim() || soTienCongNoMutation.isPending}
                  >
                    Lưu
                  </Btn>
                  <button type="button" className="text-[var(--ink-400)] hover:underline" onClick={() => setSoTienCongNoDraft((p) => { const n = { ...p }; delete n[d.id]; return n; })}>✕</button>
                </span>
              ) : (
                <span className="inline-flex gap-1.5 items-center">
                  {/* Chua sua tay -> hien uoc tinh Gia de xuat × SL (in nghieng), dung lam gia tri khoi tao khi bam ✎. */}
                  {d.so_tien_cong_no != null ? (
                    <span title="Tiền công nợ ghi nhận cho KTV — không cộng vào tiền cần chuyển của phiếu">
                      <Money>{fmtVND(d.so_tien_cong_no)}</Money> <span className="text-[11px] text-[var(--ink-400)]">công nợ</span>
                    </span>
                  ) : d.gia_de_xuat != null ? (
                    <span className="italic text-[var(--ink-400)]" title="Ước tính = Giá đề xuất × SL, chưa được xác nhận/sửa tay">
                      <Money>{fmtVND(d.gia_de_xuat * d.so_luong_de_xuat)}</Money> (ước tính)
                    </span>
                  ) : (
                    <span className="text-[var(--ink-400)]">—</span>
                  )}
                  {(canTacNghiep || canKeToan) && dangTao && (
                    <button
                      type="button"
                      className="text-[var(--ocean-700)] hover:underline"
                      onClick={() =>
                        setSoTienCongNoDraft((p) => ({
                          ...p,
                          [d.id]: String(d.so_tien_cong_no ?? (d.gia_de_xuat != null ? d.gia_de_xuat * d.so_luong_de_xuat : "")),
                        }))
                      }
                    >
                      ✎
                    </button>
                  )}
                </span>
              )}
            </td>
            {/* Loai chiet khau (2026-09-26) - TN chon lai/them loai moi ngay tai day. */}
            {pxk.loai_don !== "tra_hang" && (
              <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                {canTacNghiep ? (
                  <LoaiChietKhauPicker don={d} duocDoi={duocDoiLoaiChietKhau(pxk)} />
                ) : (
                  <LoaiChietKhauText id={d.loai_chiet_khau_id} thuCong={d.loai_chiet_khau_thu_cong} />
                )}
              </td>
            )}
            <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
              {/* Lich su giai trinh day du + cho nhap lai moi khi qua han LAN NUA (ke ca dong da "TN da duyet" trong
                  PXK - backend POST /don-hang/:id/giai-trinh da noi long gate). Select BAT BUOC tu danh muc. */}
              <div className="flex flex-col gap-1">
                {d.giaiTrinh && d.giaiTrinh.length > 0 && (
                  <ul className="space-y-0.5">
                    {d.giaiTrinh.map((g) => (
                      <li key={g.id} className="text-xs">
                        {g.noi_dung}
                        <span className="text-[10.5px] text-[var(--ink-400)]"> — {fmtDateTime(g.ngay_tao)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {canTacNghiep && d.qua_han_ly_do_cham && (d.trang_thai_hien_tai === "Cho TN duyet" || d.trang_thai_hien_tai === "TN da duyet") ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1 items-center">
                      <Badge tone="danger">Quá hạn</Badge>
                      <Select
                        value={lyDoChamDraft[d.id] ?? ""}
                        onChange={(v) => setLyDoChamDraft((p) => ({ ...p, [d.id]: v }))}
                        options={[{ value: "", label: "-- Chọn lý do chậm --" }, ...(lyDoChamGoiYData?.rows ?? []).map((l) => ({ value: l.ten_ly_do, label: l.ten_ly_do }))]}
                        disabled={(lyDoChamGoiYData?.rows.length ?? 0) === 0}
                        className="flex-1"
                      />
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => lyDoChamMutation.mutate({ donHangId: d.id, ly_do_cham: lyDoChamDraft[d.id] ?? "" })}
                        disabled={!lyDoChamDraft[d.id]?.trim() || lyDoChamMutation.isPending}
                      >
                        Lưu
                      </Btn>
                    </div>
                    {(lyDoChamGoiYData?.rows.length ?? 0) === 0 && (
                      <div className="text-[10.5px] text-[var(--coral-600)]">Chưa có lý do chậm nào được cấu hình cho "Mua hàng" — vào Settings › Lý do chậm để thêm.</div>
                    )}
                  </div>
                ) : d.qua_han_ly_do_cham ? (
                  <Badge tone="danger">Quá hạn</Badge>
                ) : (!d.giaiTrinh || d.giaiTrinh.length === 0) ? (
                  <span className="text-[var(--ink-400)]">—</span>
                ) : null}
              </div>
            </td>
            {coCotBo && (
              <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                {/* Bo don khoi phieu (2026-09-21), bo DUOC ca don cuoi (chot 2026-09-28). */}
                <button
                  type="button"
                  className="text-[var(--coral-500)] hover:underline disabled:opacity-50"
                  disabled={boDonMutation.isPending}
                  onClick={() => {
                    const laDonCuoi = donHang.length === 1;
                    const canhBaoCuoi = laDonCuoi
                      ? giuPhieuTrong
                        ? "\n\nĐây là đơn cuối cùng — phiếu trống sẽ tự hủy khi bạn đóng màn phiếu."
                        : "\n\nĐây là đơn cuối cùng — phiếu sẽ bị hủy luôn."
                      : "";
                    if (window.confirm(`Bỏ đơn "${d.ma_lk}" khỏi phiếu này?\n\nĐơn sẽ quay lại danh sách "khả dụng" để gán vào 1 phiếu khác.${canhBaoCuoi}`)) {
                      boDonMutation.mutate({ donHangId: d.id, laDonCuoi });
                    }
                  }}
                >
                  ✕ Bỏ
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
