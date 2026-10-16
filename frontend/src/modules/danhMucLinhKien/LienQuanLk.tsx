import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ui/Toast";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { Badge } from "../../components/ui/Badge";
import { Money } from "../../components/ui/Money";
import { fmtVND, fmtDate, fmtDateTime } from "../../types";
import { usePersonDirectory, formatPersonDisplay } from "../../lib/personDisplay";
import { StatusBadge } from "../datMuaLinhKien/SharedUi";
import {
  DON_HANG_TRANG_THAI_TONE_ALL, DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, THIEU_LK_TRANG_THAI_TONE, THIEU_LK_TRANG_THAI_OPTIONS,
} from "../datMuaLinhKien/constants";

// Thong tin LIEN QUAN cua 1 linh kien trong drawer Bang gia (2026-10-16, "xem được các thông tin liên quan đến linh kiện trong màn hình
// đó ví dụ lịch sử đặt hàng, tồn kho ở các kho"). Nguon: GET /settings/linh-kien/:ma/lien-quan - pham vi theo nguoi xem (KTV chi thay ton
// kho + don cua chinh minh, xem backend). Bam ma don = mo chi tiet don (DonHangDetailModal, tai luoi).
const DonHangDetailModal = lazy(() => import("../datMuaLinhKien/DonCuaToiTab").then((m) => ({ default: m.DonHangDetailModal })));

const TBL = "tbl w-full [&_th]:px-2.5 [&_th]:py-2 [&_td]:px-2.5 [&_td]:py-1.5 [&_tbody>tr]:border-t [&_tbody>tr]:border-[var(--line)]";

export interface LienQuanLk {
  phien_ban_ton_kho: string | null;
  ton_kho_cong_ty: { ma_kho: string; ten_kho: string | null; sl_ton: number }[];
  ton_kho_ktv: { ma_kho: string | null; ma_ktv: string | null; ten_ktv: string | null; khu_vuc_ma: string | null; sl_ton: number; sl_ho_tro_0d: number; cong_no: number }[];
  thong_ke_dat_hang: { don_30: number | null; sl_30: number | null; don_90: number | null; sl_90: number | null; dang_cho_hang: number | null; tong_don: number | null; lan_cuoi: string | null } | null;
  don_hang: { id: string; ngay_tao: string; loai_de_xuat: string | null; trang_thai_hien_tai: string; so_luong: number; nguoi_nhan_hang: string | null; nguoi_tao: string | null; khu_vuc_ma: string | null; pxk_id: string | null }[];
  thieu_lk_mo: { id: string; dat_don_hang_id: string; ngay_tao: string; ngay_du_kien_co_hang: string | null; nguoi_nhan_hang: string | null; trang_thai: string | null }[];
  thay_the: { nhom_id: number; ten_nhom: string; linh_kien: { ma_linh_kien: string; ten_linh_kien: string | null; bat_tat: number | null }[] }[];
  combo: { ma_combo: string; ten_combo: string; bat_tat: number; so_luong_trong_combo: number; thanh_phan: { ma_linh_kien: string; so_luong: number }[] }[];
}

export function useLienQuanLk(ma: string | null) {
  return useQuery({
    queryKey: ["lk-lien-quan", ma],
    queryFn: () => api.get<LienQuanLk>(`/settings/linh-kien/${encodeURIComponent(ma!)}/lien-quan`),
    enabled: !!ma,
    staleTime: 60_000,
  });
}

const so = (v: number | null | undefined) => Number(v ?? 0);
const fmtSl = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

export function tongTonCongTy(d: LienQuanLk | undefined) {
  return (d?.ton_kho_cong_ty ?? []).reduce((s, r) => s + r.sl_ton, 0);
}
export function tongTonKtv(d: LienQuanLk | undefined) {
  return (d?.ton_kho_ktv ?? []).reduce((s, r) => s + r.sl_ton, 0);
}

function TrangThaiTai({ isLoading, isError }: { isLoading: boolean; isError: boolean }) {
  if (isLoading) return <div className="text-sm text-[var(--ink-400)] py-6 text-center">Đang tải...</div>;
  if (isError) return <div className="text-sm text-[var(--color-danger)] py-6 text-center">Không tải được dữ liệu liên quan.</div>;
  return null;
}

function Trong({ children }: { children: ReactNode }) {
  return <div className="text-sm text-[var(--ink-400)] rounded-xl bg-[var(--surface-100)] px-3.5 py-2.5">{children}</div>;
}

// O so lieu nhanh o tab Tong quan - bam de chuyen tab.
function OSo({ nhan, gia, phu, onClick }: { nhan: string; gia: ReactNode; phu?: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="focus-ring text-left rounded-xl border border-[var(--line)] px-3 py-2 hover:border-[var(--color-primary)] transition-colors">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-400)]">{nhan}</div>
      <div className="text-lg font-bold text-[var(--ink-800)] leading-tight mt-0.5">{gia}</div>
      {phu && <div className="text-[11px] text-[var(--ink-500)] mt-0.5 truncate">{phu}</div>}
    </button>
  );
}

export function TomTatLienQuan({ ma, onTab }: { ma: string; onTab: (tab: "ton-kho" | "dat-hang" | "lien-quan") => void }) {
  const { data } = useLienQuanLk(ma);
  const tk = data?.thong_ke_dat_hang;
  const soLienQuan = (data?.thay_the.reduce((s, g) => s + g.linh_kien.length, 0) ?? 0) + (data?.combo.length ?? 0);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <OSo nhan="Tồn kho công ty" gia={data ? fmtSl(tongTonCongTy(data)) : "…"} phu={data ? `${data.ton_kho_cong_ty.length} kho` : undefined} onClick={() => onTab("ton-kho")} />
      <OSo nhan="Tồn kho KTV" gia={data ? fmtSl(tongTonKtv(data)) : "…"} phu={data ? `${data.ton_kho_ktv.length} KTV` : undefined} onClick={() => onTab("ton-kho")} />
      <OSo nhan="Đặt 30 ngày" gia={tk ? `${so(tk.don_30)} đơn` : "…"} phu={tk ? `SL ${fmtSl(so(tk.sl_30))}${so(tk.dang_cho_hang) ? ` · ${so(tk.dang_cho_hang)} chờ hàng` : ""}` : undefined} onClick={() => onTab("dat-hang")} />
      <OSo nhan="Thay thế / combo" gia={data ? soLienQuan : "…"} phu={data ? `${data.thay_the.length} nhóm · ${data.combo.length} combo` : undefined} onClick={() => onTab("lien-quan")} />
    </div>
  );
}

export function TonKhoLkTab({ ma, ktvXem }: { ma: string; ktvXem: boolean }) {
  const { data, isLoading, isError } = useLienQuanLk(ma);
  if (!data) return <TrangThaiTai isLoading={isLoading} isError={isError} />;
  return (
    <div className="space-y-5">
      <div className="text-xs text-[var(--ink-500)]">
        Theo file tồn kho MISA Kế toán import lúc <b>{data.phien_ban_ton_kho ? fmtDateTime(data.phien_ban_ton_kho) : "—"}</b> — chưa trừ các đơn tạo sau thời điểm này.
      </div>
      <div>
        <SectionTitle>Kho công ty · tổng {fmtSl(tongTonCongTy(data))}</SectionTitle>
        {data.ton_kho_cong_ty.length === 0 ? (
          <Trong>Không kho công ty nào còn tồn mã này.</Trong>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
            <table className={TBL}>
              <thead className="tbl-head"><tr><th>Kho</th><th className="text-right">Tồn</th></tr></thead>
              <tbody>
                {data.ton_kho_cong_ty.map((r) => (
                  <tr key={r.ma_kho}>
                    <td className="whitespace-nowrap"><span className="font-mono text-xs text-[var(--ink-500)] mr-1.5">{r.ma_kho}</span>{r.ten_kho ?? ""}</td>
                    <td className="text-right font-semibold whitespace-nowrap">{fmtSl(r.sl_ton)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <SectionTitle>{ktvXem ? "Kho của tôi" : `Kho KTV · ${data.ton_kho_ktv.length} KTV · tổng ${fmtSl(tongTonKtv(data))}`}</SectionTitle>
        {data.ton_kho_ktv.length === 0 ? (
          <Trong>{ktvXem ? "Bạn không giữ linh kiện này." : "Không KTV nào (trong phạm vi bạn xem) đang giữ mã này."}</Trong>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--line)] max-h-80 overflow-y-auto">
            <table className={TBL}>
              <thead className="tbl-head sticky top-0 bg-[var(--surface)]">
                <tr><th>KTV</th><th>Khu vực</th><th className="text-right">Tồn</th><th className="text-right">Công nợ</th></tr>
              </thead>
              <tbody>
                {data.ton_kho_ktv.map((r, i) => (
                  <tr key={`${r.ma_kho}-${i}`}>
                    <td className="whitespace-nowrap max-w-[260px] truncate" title={r.ten_ktv ?? r.ma_kho ?? ""}>
                      {r.ma_ktv ? r.ten_ktv ?? r.ma_ktv : <span className="text-[var(--ink-400)]">{r.ma_kho} (chưa khớp KTV)</span>}
                    </td>
                    <td className="whitespace-nowrap text-[var(--ink-500)]">{r.khu_vuc_ma ?? "—"}</td>
                    <td className="text-right font-semibold whitespace-nowrap">
                      {fmtSl(r.sl_ton)}
                      {r.sl_ho_tro_0d > 0 && <span className="ml-1 text-[11px] font-normal text-[var(--ink-400)]" title="Số lượng được tính công nợ 0 đồng">({fmtSl(r.sl_ho_tro_0d)} 0đ)</span>}
                    </td>
                    <td className="text-right whitespace-nowrap"><Money>{fmtVND(r.cong_no)}</Money></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// onMoDon: bao drawer dang mo chi tiet don (drawer bo qua phim Esc - tranh Esc dong ca 2 lop).
export function DatHangLkTab({ ma, onMoDon }: { ma: string; onMoDon?: (dangMo: boolean) => void }) {
  const { data, isLoading, isError } = useLienQuanLk(ma);
  const personDir = usePersonDirectory();
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const addToast = useToast();
  const qc = useQueryClient();
  const [moDon, setMoDon] = useState<string | null>(null);
  useEffect(() => {
    onMoDon?.(!!moDon);
    return () => onMoDon?.(false);
  }, [moDon, onMoDon]);
  if (!data) return <TrangThaiTai isLoading={isLoading} isError={isError} />;
  const tk = data.thong_ke_dat_hang;
  const nguoi = (e: string | null) => (e ? formatPersonDisplay(e, personDir) : "—");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <OSo nhan="30 ngày" gia={`${so(tk?.don_30)} đơn`} phu={`SL ${fmtSl(so(tk?.sl_30))}`} />
        <OSo nhan="90 ngày" gia={`${so(tk?.don_90)} đơn`} phu={`SL ${fmtSl(so(tk?.sl_90))}`} />
        <OSo nhan="Đang chờ hàng" gia={`${so(tk?.dang_cho_hang)} đơn`} phu={`${data.thieu_lk_mo.length} ticket thiếu hàng mở`} />
        <OSo nhan="Đặt lần cuối" gia={tk?.lan_cuoi ? fmtDate(tk.lan_cuoi) : "—"} phu={`Tổng ${so(tk?.tong_don)} đơn hiệu lực`} />
      </div>

      {data.thieu_lk_mo.length > 0 && (
        <div>
          <SectionTitle>Ticket thiếu hàng đang mở</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
            <table className={TBL}>
              <thead className="tbl-head"><tr><th>Ticket</th><th>Đơn</th><th>Người nhận</th><th>Dự kiến có hàng</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {data.thieu_lk_mo.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs whitespace-nowrap">{r.id}</td>
                    <td className="whitespace-nowrap"><button type="button" className="code-link" onClick={() => setMoDon(r.dat_don_hang_id)}>{r.dat_don_hang_id}</button></td>
                    <td className="whitespace-nowrap max-w-[180px] truncate">{nguoi(r.nguoi_nhan_hang)}</td>
                    <td className="whitespace-nowrap">{r.ngay_du_kien_co_hang ? fmtDate(r.ngay_du_kien_co_hang) : "—"}</td>
                    <td className="whitespace-nowrap">{r.trang_thai && <StatusBadge value={r.trang_thai} tones={THIEU_LK_TRANG_THAI_TONE} options={THIEU_LK_TRANG_THAI_OPTIONS} phu />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Đơn đặt gần nhất{data.don_hang.length >= 30 ? " (30 đơn)" : ""}</SectionTitle>
        {data.don_hang.length === 0 ? (
          <Trong>Chưa có đơn đặt mã này (trong phạm vi bạn xem).</Trong>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--line)] max-h-[26rem] overflow-y-auto">
            <table className={TBL}>
              <thead className="tbl-head sticky top-0 bg-[var(--surface)]">
                <tr><th>Mã đơn</th><th>Ngày</th><th>Người nhận</th><th>Loại</th><th className="text-right">SL</th><th>Trạng thái</th><th>Phiếu</th></tr>
              </thead>
              <tbody>
                {data.don_hang.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap"><button type="button" className="code-link" onClick={() => setMoDon(r.id)}>{r.id}</button></td>
                    <td className="whitespace-nowrap text-[var(--ink-500)]">{fmtDate(r.ngay_tao)}</td>
                    <td className="whitespace-nowrap max-w-[180px] truncate" title={nguoi(r.nguoi_nhan_hang)}>{nguoi(r.nguoi_nhan_hang)}</td>
                    <td className="whitespace-nowrap max-w-[140px] truncate text-xs text-[var(--ink-600)]" title={r.loai_de_xuat ?? ""}>{r.loai_de_xuat ?? "—"}</td>
                    <td className="text-right font-semibold whitespace-nowrap">{fmtSl(so(r.so_luong))}</td>
                    <td className="whitespace-nowrap"><StatusBadge value={r.trang_thai_hien_tai} tones={DON_HANG_TRANG_THAI_TONE_ALL} options={DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL} phu /></td>
                    <td className="whitespace-nowrap font-mono text-xs text-[var(--ink-500)]">{r.pxk_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {moDon && u && (
        <Suspense fallback={null}>
          <DonHangDetailModal
            id={moDon}
            onClose={() => setMoDon(null)}
            addToast={addToast}
            qc={qc}
            canTacNghiep={!!u.la_tac_nghiep}
            canTPDvbhXacNhan={false}
            canActAsTram={false}
            currentEmail={u.email}
            isAdmin={u.vai_tro === "Admin"}
            canXemChiTietCa={false}
            canKho={!!u.la_kho}
          />
        </Suspense>
      )}
    </div>
  );
}

export function LienQuanLkTab({ ma, onXemLk }: { ma: string; onXemLk: (ma: string) => void }) {
  const { data, isLoading, isError } = useLienQuanLk(ma);
  if (!data) return <TrangThaiTai isLoading={isLoading} isError={isError} />;
  const MaLk = ({ m, ten, tat }: { m: string; ten?: string | null; tat?: boolean }) => (
    <button type="button" onClick={() => onXemLk(m)} className="focus-ring text-left max-w-full">
      <span className="code-link font-mono text-xs">{m}</span>
      {ten && <span className="ml-1.5 text-sm text-[var(--ink-700)]">{ten}</span>}
      {tat && <span className="ml-1.5"><Badge tone="gray">Đang ẩn</Badge></span>}
    </button>
  );
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Linh kiện thay thế</SectionTitle>
        {data.thay_the.length === 0 ? (
          <Trong>Mã này chưa thuộc nhóm thay thế nào (quản lý ở tab "Linh kiện thay thế").</Trong>
        ) : (
          <div className="space-y-2">
            {data.thay_the.map((g) => (
              <div key={g.nhom_id} className="rounded-xl border border-[var(--line)] px-3.5 py-2.5">
                <div className="text-xs font-semibold text-[var(--ink-500)] mb-1">{g.ten_nhom}</div>
                <div className="space-y-1">
                  {g.linh_kien.map((l) => <div key={l.ma_linh_kien}><MaLk m={l.ma_linh_kien} ten={l.ten_linh_kien} tat={l.bat_tat === 0} /></div>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <SectionTitle>Combo có chứa linh kiện này</SectionTitle>
        {data.combo.length === 0 ? (
          <Trong>Không combo nào chứa mã này.</Trong>
        ) : (
          <div className="space-y-2">
            {data.combo.map((cb) => (
              <div key={cb.ma_combo} className="rounded-xl border border-[var(--line)] px-3.5 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-semibold">🧩 {cb.ma_combo}</span>
                  <span className="text-sm text-[var(--ink-700)]">{cb.ten_combo}</span>
                  {!cb.bat_tat && <Badge tone="gray">Đang tắt</Badge>}
                  <span className="text-xs text-[var(--ink-500)]">· mã này ×{cb.so_luong_trong_combo}/bộ</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {cb.thanh_phan.map((t) => (
                    <span key={t.ma_linh_kien} className="text-xs">
                      {t.ma_linh_kien === ma ? <b className="font-mono">{t.ma_linh_kien}</b> : <MaLk m={t.ma_linh_kien} />} ×{t.so_luong}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
