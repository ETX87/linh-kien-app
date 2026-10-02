import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/x/Badge";
import { Select } from "../../components/ui/Select";
import { Money } from "../../components/ui/Money";
import { api, ApiError } from "../../api/client";
import { fmtDateTime, fmtVND } from "../../types";
import type { DonHangRow, LyDoChamRow } from "./types";
import { LoaiChietKhauPicker, LoaiChietKhauText, HoaDonGiaNiemYet, duocDoiLoaiChietKhau, DoiLoaiChietKhauNhieuDon, tenLoaiChietKhau, useLoaiChietKhauList } from "./LoaiChietKhau";
import { describeApiError, invalidatePipelineCounts, laTruCongNo } from "./helpers";
import { LoaiDeXuatBadge } from "./SharedUi";
import { DON_CUA_TOI_TRANG_THAI_OPTIONS } from "./constants";

// Bang "Dòng đơn hàng" cua 1 PXK - TACH component 2026-09-29 (phan hoi "trong danh sách phiếu xuất, tạo bảng danh sách
// dạng phiếu gốc, ấn xổ xuống sẽ có danh sách các dòng đơn hàng chi tiết bên trong, các chức năng sẽ tương tự các chức
// năng đang có trong 'dòng đơn hàng'") - dung CHUNG cho Drawer chi tiet PXK (PxkDetailModal) VA dong xo xuong trong danh
// sach PXK (PhieuXuatKhoTab), 1 ban logic duy nhat: sua tien (popup SuaTienDongModal - cha tu mo qua onSuaTien), sua tien
// cong no inline, doi loai chiet khau, nhap ly do cham, bo don khoi phieu, bam dong mo chi tiet don (onOpenDon).
//
// giuPhieuTrong: true = dang o Drawer chi tiet (bo don cuoi -> giu phieu trong, dong Drawer moi tu huy - xem roiPhieu
// trong PxkDetailModal); false = thao tac tu danh sach (khong co "dong man") -> bo don cuoi thi huy phieu NGAY qua
// POST /:id/huy-neu-trong (cung quy uoc "thao tác từ ngoài → hủy phiếu ngay" cua CLAUDE.md).
//
// gon (2026-09-29, phan hoi "cách hiển thị này đang xấu và chiếm diện tích nhiều quá... bỏ tiêu đề được không? tất cả
// các đơn chung 1 khoảng cách cột", nguoi dung chon phuong an "Lưới cột chung"): KHONG tieu de cot, dong thap (~32px),
// chu 12px, cot do rong CO DINH (COT_GON, table-layout fixed) -> dong don cua MOI phieu xo xuong thang hang tu tren
// xuong; y nghia tung o hien khi re chuot (title). Drawer chi tiet van dung ban day du co tieu de.
const COT_GON = [
  { w: 112, tip: "Mã linh kiện" },
  { w: 250, tip: "Tên linh kiện" },
  { w: 124, tip: "Loại đề xuất" },
  { w: 84, tip: "SL đề xuất → SL thực xuất" },
  { w: 140, tip: "Tiền cần chuyển" },
  { w: 230, tip: "Loại chiết khấu" },
  { w: 250, tip: "Lý do chậm" },
  { w: 40, tip: "" },
];
const RONG_GON = COT_GON.reduce((s, c) => s + c.w, 0);

export function PxkDongDonHangTable({
  pxkId, pxk, donHang, canTacNghiep, canKeToan, addToast, onOpenDon, onSuaTien, giuPhieuTrong, gon = false,
}: {
  pxkId: string;
  pxk: {
    loai_don?: "mua" | "cong_no" | "tra_hang" | null; trang_thai?: string | null; so_tien_can_chuyen?: number | null;
    trang_thai_chuyen_tien?: string | null; da_thanh_toan?: number | null; ma_misa?: string | null;
  };
  donHang: DonHangRow[];
  canTacNghiep: boolean;
  canKeToan: boolean;
  addToast: (msg: string) => void;
  onOpenDon: (donHangId: string) => void;
  onSuaTien: (donHangId: string) => void;
  giuPhieuTrong: boolean;
  gon?: boolean;
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

  // Phieu DA CO TIEN tra (chot 2026-09-30): bo don -> hoi TN don do "Chưa thanh toán" (tien cua don = 0, phan thua hoan
  // ve quy) hay "Đã thanh toán" (don mang theo tien cua dong, ve "Chờ tạo phiếu" - vao phieu moi duoc tru tien).
  const [boDonCho, setBoDonCho] = useState<DonHangRow | null>(null);
  const daTraPhieu = pxk.da_thanh_toan ?? 0;
  const coMaMisa = !!pxk.ma_misa?.trim();
  const boDonMutation = useMutation({
    mutationFn: async ({ donHangId, laDonCuoi, giuTien = false }: { donHangId: string; laDonCuoi: boolean; giuTien?: boolean }) => {
      await api.delete(`/phieu-xuat-kho/${pxkId}/dong/${donHangId}${giuTien ? "?giu_tien=1" : ""}`);
      if (laDonCuoi && !giuPhieuTrong) {
        const r = await api.post<{ ok: true; da_huy: boolean }>(`/phieu-xuat-kho/${pxkId}/huy-neu-trong`, {});
        return r.da_huy;
      }
      return false;
    },
    onSuccess: (daHuyPhieu) => {
      setBoDonCho(null);
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

  // Chon NHIEU dong de doi loai chiet khau 1 lan (2026-09-30, phan hoi "cho phép lựa chọn nhiều đơn trong phiếu và sửa
  // chiết khấu 1 lần cho tất cả"). Chi khi TN doi duoc loai chiet khau cua phieu (duocDoiLoaiChietKhau) va phieu co tien.
  const coChonCk = canTacNghiep && pxk.loai_don !== "tra_hang" && duocDoiLoaiChietKhau(pxk) && donHang.length > 1;
  const [chonCk, setChonCk] = useState<Set<string>>(new Set());
  const [moDoiNhieu, setMoDoiNhieu] = useState(false);
  const { data: dsLoaiCk } = useLoaiChietKhauList();
  const chonDs = donHang.filter((d) => chonCk.has(d.id));
  const batChon = (id: string) => setChonCk((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Nhom theo loai chiet khau hien tai -> nut "Chọn cùng loại".
  const nhomLoai = new Map<number | null, string[]>();
  for (const d of donHang) nhomLoai.set(d.loai_chiet_khau_id ?? null, [...(nhomLoai.get(d.loai_chiet_khau_id ?? null) ?? []), d.id]);
  const oChon = (d: DonHangRow) => (
    <input
      type="checkbox"
      aria-label={`Chọn đơn ${d.ma_lk}`}
      checked={chonCk.has(d.id)}
      onChange={() => batChon(d.id)}
      onClick={(e) => e.stopPropagation()}
      className="mr-1.5 align-middle"
    />
  );
  const thanhChon = coChonCk && (!gon || chonCk.size > 0) ? (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12px]" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="focus-ring rounded-[var(--radius-pill)] border border-[var(--color-border)] px-2 py-0.5 font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
        onClick={() => setChonCk(chonCk.size === donHang.length ? new Set() : new Set(donHang.map((d) => d.id)))}
      >
        {chonCk.size === donHang.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
      </button>
      {nhomLoai.size > 1 &&
        [...nhomLoai.entries()].map(([id, ids]) => (
          <button
            key={String(id)}
            type="button"
            title="Chọn các đơn đang cùng loại chiết khấu này"
            className="focus-ring rounded-[var(--radius-pill)] border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            onClick={() => setChonCk(new Set(ids))}
          >
            {tenLoaiChietKhau(dsLoaiCk, id) ?? "Chưa có loại"} ({ids.length})
          </button>
        ))}
      {chonCk.size > 0 && (
        <>
          <span className="ml-1 text-[var(--color-text-secondary)]">Đã chọn <b className="text-[var(--color-text)]">{chonCk.size}</b> đơn</span>
          <Btn size="sm" variant="subtle" onClick={() => setMoDoiNhieu(true)}>Đổi loại chiết khấu…</Btn>
        </>
      )}
      {moDoiNhieu && chonDs.length > 0 && (
        <DoiLoaiChietKhauNhieuDon dons={chonDs} onClose={() => setMoDoiNhieu(false)} onDone={() => { setMoDoiNhieu(false); setChonCk(new Set()); }} />
      )}
    </div>
  ) : null;
  const huyCongNoDraft = (id: string) => setSoTienCongNoDraft((p) => { const n = { ...p }; delete n[id]; return n; });

  // ---- Noi dung tung o - DUNG CHUNG cho 2 kieu hien thi (day du / gon) ----

  // Mua / TRỪ CÔNG NỢ: READ-ONLY = tien uoc tinh backend tinh (loai chiet khau, gia chot, SL thuc xuat) - TN bam vao so
  // tien de mo popup sua SL thuc xuat/Don gia (2026-09-22). Cong no thuan: GIU co che sua tay so_tien_cong_no (nuoi cong
  // no KTV qua computeCongNoPhatSinh).
  function oTien(d: DonHangRow): ReactNode {
    if (pxk.loai_don === "mua" || laTruCongNo(d.loai_de_xuat)) {
      const donGia = d.gia_chot ?? d.gia_de_xuat;
      const sl = d.so_luong_thuc_xuat ?? d.so_luong_de_xuat;
      const noiDung =
        d.tien_uoc_tinh != null || donGia != null ? (
          <span className="italic text-[var(--ink-400)]" title="Ước tính theo loại chiết khấu, giá chốt và SL thực xuất">
            <Money>{fmtVND(d.tien_uoc_tinh ?? (donGia ?? 0) * sl)}</Money>
            {!gon && " (ước tính)"}
          </span>
        ) : (
          <span className="text-[var(--ink-400)]">—</span>
        );
      return canTacNghiep && dangTao ? (
        <button type="button" className="hover:underline decoration-dotted underline-offset-2" title="Bấm để sửa SL thực xuất/Đơn giá thực tế" onClick={() => onSuaTien(d.id)}>
          {noiDung}
        </button>
      ) : (
        noiDung
      );
    }
    if (soTienCongNoDraft[d.id] !== undefined) {
      return (
        <span className="inline-flex gap-1 items-center">
          <input
            type="number"
            autoFocus
            value={soTienCongNoDraft[d.id]}
            onChange={(e) => setSoTienCongNoDraft((p) => ({ ...p, [d.id]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && soTienCongNoDraft[d.id]?.trim()) soTienCongNoMutation.mutate({ donHangId: d.id, so_tien_cong_no: Number(soTienCongNoDraft[d.id]) });
              if (e.key === "Escape") huyCongNoDraft(d.id);
            }}
            className={`focus-ring ${gon ? "w-20 h-[24px]" : "w-24"} bg-[var(--surface-100)] border border-[var(--line)] rounded px-1.5 py-0.5 text-xs text-right`}
          />
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => soTienCongNoMutation.mutate({ donHangId: d.id, so_tien_cong_no: Number(soTienCongNoDraft[d.id]) })}
            disabled={!soTienCongNoDraft[d.id]?.trim() || soTienCongNoMutation.isPending}
          >
            Lưu
          </Btn>
          <button type="button" className="text-[var(--ink-400)] hover:underline" onClick={() => huyCongNoDraft(d.id)}>✕</button>
        </span>
      );
    }
    return (
      <span className="inline-flex gap-1.5 items-center">
        {/* Chua sua tay -> hien uoc tinh Gia de xuat × SL (in nghieng), dung lam gia tri khoi tao khi bam ✎. */}
        {d.so_tien_cong_no != null ? (
          <span title="Tiền công nợ ghi nhận cho KTV — không cộng vào tiền cần chuyển của phiếu">
            <Money>{fmtVND(d.so_tien_cong_no)}</Money> <span className="text-[11px] text-[var(--ink-400)]">công nợ</span>
          </span>
        ) : d.gia_de_xuat != null ? (
          <span className="italic text-[var(--ink-400)]" title="Ước tính = Giá đề xuất × SL, chưa được xác nhận/sửa tay">
            <Money>{fmtVND(d.gia_de_xuat * d.so_luong_de_xuat)}</Money>
            {!gon && " (ước tính)"}
          </span>
        ) : (
          <span className="text-[var(--ink-400)]">—</span>
        )}
        {(canTacNghiep || canKeToan) && dangTao && (
          <button
            type="button"
            className="text-[var(--ocean-700)] hover:underline"
            title="Sửa tiền công nợ"
            onClick={() =>
              setSoTienCongNoDraft((p) => ({ ...p, [d.id]: String(d.so_tien_cong_no ?? (d.gia_de_xuat != null ? d.gia_de_xuat * d.so_luong_de_xuat : "")) }))
            }
          >
            ✎
          </button>
        )}
      </span>
    );
  }

  // So tien THUC TE tung dong = dung so dang hien o cot "Tien can chuyen" (oTien) - dung cho dong Tong cuoi bang (2026-10-02).
  function tienThucTe(d: DonHangRow): number {
    if (pxk.loai_don === "mua" || laTruCongNo(d.loai_de_xuat)) {
      return d.tien_uoc_tinh ?? (d.gia_chot ?? d.gia_de_xuat ?? 0) * (d.so_luong_thuc_xuat ?? d.so_luong_de_xuat);
    }
    return d.so_tien_cong_no ?? (d.gia_de_xuat ?? 0) * d.so_luong_de_xuat;
  }

  // Loai chiet khau (2026-09-26) - TN chon lai/them loai moi ngay tai day.
  function oLoaiChietKhau(d: DonHangRow): ReactNode {
    return (
      <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
        {canTacNghiep ? (
          <LoaiChietKhauPicker don={d} duocDoi={duocDoiLoaiChietKhau(pxk)} dongKhac={donHang.filter((x) => x.id !== d.id)} />
        ) : (
          <LoaiChietKhauText id={d.loai_chiet_khau_id} thuCong={d.loai_chiet_khau_thu_cong} />
        )}
        <HoaDonGiaNiemYet don={d} />
      </span>
    );
  }

  // Lich su giai trinh + cho nhap lai moi khi qua han LAN NUA (ke ca dong da "TN da duyet" trong PXK - backend POST
  // /don-hang/:id/giai-trinh da noi long gate). Chon BAT BUOC tu danh muc. Ban gon: chi hien giai trinh MOI NHAT (re
  // chuot xem het) + o chon thap.
  function oLyDoCham(d: DonHangRow): ReactNode {
    const giaiTrinh = d.giaiTrinh ?? [];
    const choNhap = canTacNghiep && d.qua_han_ly_do_cham && (d.trang_thai_hien_tai === "Cho TN duyet" || d.trang_thai_hien_tai === "TN da duyet");
    const dsLyDo = lyDoChamGoiYData?.rows ?? [];
    const luu = () => lyDoChamMutation.mutate({ donHangId: d.id, ly_do_cham: lyDoChamDraft[d.id] ?? "" });
    if (gon) {
      const moiNhat = giaiTrinh[giaiTrinh.length - 1];
      const tatCa = giaiTrinh.map((g) => `${g.noi_dung} — ${fmtDateTime(g.ngay_tao)}`).join("\n");
      if (choNhap) {
        return (
          <span className="inline-flex max-w-full items-center gap-1">
            <Badge tone="danger">Quá hạn</Badge>
            <select
              value={lyDoChamDraft[d.id] ?? ""}
              onChange={(e) => setLyDoChamDraft((p) => ({ ...p, [d.id]: e.target.value }))}
              disabled={dsLyDo.length === 0}
              title={dsLyDo.length === 0 ? 'Chưa có lý do chậm nào cho "Mua hàng" — vào Settings › Lý do chậm để thêm' : tatCa || "Chọn lý do chậm"}
              className="focus-ring h-[24px] min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--surface)] px-1 text-xs disabled:opacity-40"
            >
              <option value="">-- Chọn lý do --</option>
              {dsLyDo.map((l) => (
                <option key={l.ten_ly_do} value={l.ten_ly_do}>{l.ten_ly_do}</option>
              ))}
            </select>
            <button
              type="button"
              className="shrink-0 text-xs font-semibold text-[var(--color-link)] hover:underline disabled:text-[var(--ink-400)] disabled:no-underline"
              disabled={!lyDoChamDraft[d.id]?.trim() || lyDoChamMutation.isPending}
              onClick={luu}
            >
              Lưu
            </button>
          </span>
        );
      }
      if (moiNhat) {
        return (
          <span title={tatCa}>
            {d.qua_han_ly_do_cham && <Badge tone="danger">Quá hạn</Badge>} {moiNhat.noi_dung}
            {giaiTrinh.length > 1 && <span className="text-[var(--ink-400)]"> (+{giaiTrinh.length - 1})</span>}
          </span>
        );
      }
      return d.qua_han_ly_do_cham ? <Badge tone="danger">Quá hạn</Badge> : <span className="text-[var(--ink-400)]">—</span>;
    }
    return (
      <div className="flex flex-col gap-1">
        {giaiTrinh.length > 0 && (
          <ul className="space-y-0.5">
            {giaiTrinh.map((g) => (
              <li key={g.id} className="text-xs">
                {g.noi_dung}
                <span className="text-[10.5px] text-[var(--ink-400)]"> — {fmtDateTime(g.ngay_tao)}</span>
              </li>
            ))}
          </ul>
        )}
        {choNhap ? (
          <div className="flex flex-col gap-1">
            <div className="flex gap-1 items-center">
              <Badge tone="danger">Quá hạn</Badge>
              <Select
                value={lyDoChamDraft[d.id] ?? ""}
                onChange={(v) => setLyDoChamDraft((p) => ({ ...p, [d.id]: v }))}
                options={[{ value: "", label: "-- Chọn lý do chậm --" }, ...dsLyDo.map((l) => ({ value: l.ten_ly_do, label: l.ten_ly_do }))]}
                disabled={dsLyDo.length === 0}
                className="flex-1"
              />
              <Btn size="sm" variant="ghost" onClick={luu} disabled={!lyDoChamDraft[d.id]?.trim() || lyDoChamMutation.isPending}>
                Lưu
              </Btn>
            </div>
            {dsLyDo.length === 0 && (
              <div className="text-[10.5px] text-[var(--coral-600)]">Chưa có lý do chậm nào được cấu hình cho "Mua hàng" — vào Settings › Lý do chậm để thêm.</div>
            )}
          </div>
        ) : d.qua_han_ly_do_cham ? (
          <Badge tone="danger">Quá hạn</Badge>
        ) : giaiTrinh.length === 0 ? (
          <span className="text-[var(--ink-400)]">—</span>
        ) : null}
      </div>
    );
  }

  // Bo don khoi phieu (2026-09-21), bo DUOC ca don cuoi (chot 2026-09-28).
  function nutBo(d: DonHangRow): ReactNode {
    return (
      <button
        type="button"
        className="text-[var(--coral-500)] hover:underline disabled:opacity-50"
        title={coMaMisa ? "Kế toán đã bổ sung mã MISA — không bỏ đơn khỏi phiếu được nữa" : "Bỏ đơn khỏi phiếu"}
        disabled={boDonMutation.isPending || coMaMisa}
        onClick={() => {
          const laDonCuoi = donHang.length === 1;
          if (daTraPhieu > 0 && pxk.loai_don !== "tra_hang") {
            setBoDonCho(d);
            return;
          }
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
        {gon ? "✕" : "✕ Bỏ"}
      </button>
    );
  }

  // Don CHUA TN duyet nam trong phieu (don can chuyen tien truoc vao phieu tu luc tao - chot 2026-09-30): danh dau, TN phai
  // bo ra truoc khi "Gửi kế toán" (backend chan DON_CHUA_DUYET).
  function chipChuaDuyet(d: DonHangRow): ReactNode {
    const tt = d.trang_thai_hien_tai ?? d.trang_thai;
    if (!tt || tt === "TN da duyet") return null;
    const nhan = DON_CUA_TOI_TRANG_THAI_OPTIONS.find((o) => o.value === tt)?.label ?? tt;
    return (
      <span title={`Đơn chưa được TN duyệt (${nhan}) — bỏ khỏi phiếu trước khi gửi kế toán`}>
        <Badge tone="warning">{nhan}</Badge>
      </span>
    );
  }

  const nenUuTien = (d: DonHangRow) => (d.uu_tien === 1 ? "bg-[var(--orange-100)] ring-1 ring-inset ring-[var(--orange-500)]" : "");
  const slThucXuat = (d: DonHangRow) =>
    d.so_luong_thuc_xuat == null ? null : d.so_luong_thuc_xuat !== d.so_luong_de_xuat ? (
      <span className="font-semibold text-[var(--amber-700)]" title="Khác SL đề xuất">{d.so_luong_thuc_xuat}</span>
    ) : (
      d.so_luong_thuc_xuat
    );

  const tienDong = boDonCho?.tien_uoc_tinh ?? 0;
  const hopThoaiBo = (
    <Modal
      open={!!boDonCho}
      onClose={() => !boDonMutation.isPending && setBoDonCho(null)}
      title={`Bỏ đơn ${boDonCho?.ma_lk ?? ""} khỏi phiếu đã có tiền`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Btn variant="ghost" disabled={boDonMutation.isPending} onClick={() => setBoDonCho(null)}>Đóng</Btn>
          <Btn
            variant="ghost"
            disabled={boDonMutation.isPending}
            onClick={() => boDonCho && boDonMutation.mutate({ donHangId: boDonCho.id, laDonCuoi: donHang.length === 1 })}
          >
            Đơn chưa thanh toán
          </Btn>
          <Btn
            loading={boDonMutation.isPending}
            disabled={boDonMutation.isPending || tienDong <= 0}
            onClick={() => boDonCho && boDonMutation.mutate({ donHangId: boDonCho.id, laDonCuoi: donHang.length === 1, giuTien: true })}
          >
            Đơn đã thanh toán
          </Btn>
        </div>
      }
    >
      <div className="space-y-3 text-[13px] text-[var(--color-text-body)]">
        <p>
          Phiếu đã được trả <b><Money>{fmtVND(daTraPhieu)}</Money></b>. Tiền của đơn này trong phiếu: <b><Money>{fmtVND(tienDong)}</Money></b>.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <b>Đơn chưa thanh toán</b> — tiền đã thanh toán của đơn = 0. Tổng phiếu giảm, phần đã trả thừa hoàn về quỹ dư của KTV.
          </li>
          <li>
            <b>Đơn đã thanh toán</b> — đơn giữ <b><Money>{fmtVND(Math.min(tienDong, daTraPhieu))}</Money></b> đã trả và về trạng thái "Chờ tạo
            phiếu". Khi vào phiếu mới, số tiền này được trừ vào tiền cần chuyển của phiếu đó. Đơn bị từ chối/hủy thì tiền tự về quỹ.
          </li>
        </ul>
        {donHang.length === 1 && (
          <p className="text-[12px] text-[var(--color-text-secondary)]">
            {giuPhieuTrong ? "Đây là đơn cuối cùng — phiếu trống sẽ tự hủy khi bạn đóng màn phiếu." : "Đây là đơn cuối cùng — phiếu sẽ bị hủy luôn."}
          </p>
        )}
      </div>
    </Modal>
  );

  if (gon) {
    // Moi o: 1 dong, cat "…" (quy tac bang 1 dong); o co nut/o chon (tien, loai CK, ly do cham) khong cat de khong mat nut.
    const o = "px-2 py-1 align-middle whitespace-nowrap overflow-hidden text-ellipsis";
    const oNut = "px-2 py-1 align-middle whitespace-nowrap";
    return (
      <>
      {hopThoaiBo}
      {thanhChon}
      <table className="border-collapse text-[12px] text-[var(--color-text-body)]" style={{ tableLayout: "fixed", width: RONG_GON }}>
        <colgroup>
          {COT_GON.map((c, i) => (
            <col key={i} style={{ width: c.w }} />
          ))}
        </colgroup>
        <tbody>
          {donHang.length === 0 && (
            <tr>
              <td colSpan={COT_GON.length} className="px-2 py-1.5 text-xs text-[var(--ink-400)]">Phiếu không còn đơn nào.</td>
            </tr>
          )}
          {donHang.map((d) => (
            <tr
              key={d.id}
              onClick={() => onOpenDon(d.id)}
              className={`h-8 cursor-pointer border-b border-[var(--color-border-soft)] last:border-0 hover:bg-[var(--color-surface-hover)] ${nenUuTien(d)}`}
            >
              <td className={`${o} font-mono text-[11.5px] text-[var(--color-text-secondary)]`} title={`${COT_GON[0].tip}: ${d.ma_lk}`}>{coChonCk && oChon(d)}{d.ma_lk}</td>
              <td className={o} title={d.ten_lk_snapshot ?? d.ma_lk}>
                {chipChuaDuyet(d)} {d.uu_tien === 1 && <span title="Ưu tiên">⭐ </span>}
                {d.ten_lk_snapshot ?? d.ma_lk}
              </td>
              <td className={o} title={COT_GON[2].tip}>
                <LoaiDeXuatBadge loaiDon={d.loai_don ?? pxk.loai_don ?? undefined} loaiDeXuat={d.loai_de_xuat} />
              </td>
              <td className={`${o} text-right`} title={COT_GON[3].tip}>
                SL {d.so_luong_de_xuat}
                {slThucXuat(d) != null && d.so_luong_thuc_xuat !== d.so_luong_de_xuat && <> → {slThucXuat(d)}</>}
              </td>
              <td className={`${oNut} text-right`} title={COT_GON[4].tip} onClick={(e) => e.stopPropagation()}>{oTien(d)}</td>
              <td className={`${oNut} [&_select]:h-[24px] [&_select]:max-w-[200px]`} onClick={(e) => e.stopPropagation()}>
                {pxk.loai_don !== "tra_hang" && oLoaiChietKhau(d)}
              </td>
              <td className={o} onClick={(e) => e.stopPropagation()}>{oLyDoCham(d)}</td>
              <td className={`${oNut} text-center`} onClick={(e) => e.stopPropagation()}>{coCotBo && nutBo(d)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </>
    );
  }

  return (
    <>
    {hopThoaiBo}
    {thanhChon}
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
          <tr key={d.id} onClick={() => onOpenDon(d.id)} className={`border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer ${nenUuTien(d)}`}>
            <td className="px-2.5 py-2 font-mono whitespace-nowrap">{coChonCk && oChon(d)}{d.ma_lk}</td>
            <td className="px-2.5 py-2">
              {chipChuaDuyet(d)} {d.uu_tien === 1 && <span title="Ưu tiên">⭐ </span>}
              {d.ten_lk_snapshot ?? d.ma_lk}
            </td>
            {/* Loai de xuat quyet dinh cach tinh tien (2026-09-28). */}
            <td className="px-2.5 py-2 whitespace-nowrap"><LoaiDeXuatBadge loaiDon={d.loai_don ?? pxk.loai_don ?? undefined} loaiDeXuat={d.loai_de_xuat} /></td>
            <td className="px-2.5 py-2 text-right">{d.so_luong_de_xuat}</td>
            <td className="px-2.5 py-2 text-right">{slThucXuat(d) ?? <span className="text-[var(--ink-400)]">—</span>}</td>
            <td className="px-2.5 py-2 text-right" onClick={(e) => e.stopPropagation()}>{oTien(d)}</td>
            {pxk.loai_don !== "tra_hang" && (
              <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>{oLoaiChietKhau(d)}</td>
            )}
            <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>{oLyDoCham(d)}</td>
            {coCotBo && (
              <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>{nutBo(d)}</td>
            )}
          </tr>
        ))}
      </tbody>
      {donHang.length > 0 && (
        <tfoot>
          <tr className="border-t-2 border-[var(--line)] bg-[var(--surface-100)] font-semibold text-[var(--color-text-body)]">
            <td className="px-2.5 py-2 whitespace-nowrap" colSpan={3}>Tổng: {donHang.length} dòng</td>
            <td className="px-2.5 py-2 text-right">{donHang.reduce((t, d) => t + d.so_luong_de_xuat, 0)}</td>
            <td className="px-2.5 py-2 text-right">
              {donHang.some((d) => d.so_luong_thuc_xuat != null) ? donHang.reduce((t, d) => t + (d.so_luong_thuc_xuat ?? d.so_luong_de_xuat), 0) : <span className="text-[var(--ink-400)]">—</span>}
            </td>
            <td className="px-2.5 py-2 text-right whitespace-nowrap" title="Tổng số tiền thực tế các dòng (theo cột Tiền cần chuyển)">
              <Money>{fmtVND(donHang.reduce((t, d) => t + tienThucTe(d), 0))}</Money>
            </td>
            <td colSpan={(pxk.loai_don !== "tra_hang" ? 2 : 1) + (coCotBo ? 1 : 0)}></td>
          </tr>
        </tfoot>
      )}
    </table>
    </>
  );
}
