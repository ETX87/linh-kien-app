import { lazy, Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Btn } from "../components/ui/Btn";
import { Modal } from "../components/ui/Modal";
import { Money } from "../components/ui/Money";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { useToast } from "../components/ui/Toast";
import { fmtDate, fmtDateTime, fmtVND } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { khopTim } from "../lib/boDau";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";
import { describeApiError } from "./datMuaLinhKien/helpers";
import { StatusBadge } from "./datMuaLinhKien/SharedUi";
import { DON_HANG_TRANG_THAI_TONE_ALL, DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL } from "./datMuaLinhKien/constants";
import { t } from "../i18n";

const DonHangDetailModal = lazy(() => import("./datMuaLinhKien/DonCuaToiTab").then((m) => ({ default: m.DonHangDetailModal })));

// Tab "Công nợ đối tác" trong Danh sách KTV (chot 2026-10-26, v1.403, migration 0099) - danh sach doi tac cho don "MUA HÀNG CÔNG NỢ ĐỐI TÁC":
// Ma MISA, Ten MISA, cong no ban dau, moc toi da (TN / Ke toan / Admin sua). So cong no tinh luc doc (backend lib/congNoDoiTac.ts):
// Hien tai = Ban dau + Da ghi no (phieu Ke toan da chot) + Dang cho (don chua chot) - Da thanh toan; Kha dung = Toi da - Hien tai.
// Ke toan / Admin ghi khoan doi tac da tra (giam cong no) trong chi tiet doi tac. KTV co Ma MISA trung doi tac duoc tu dat don cho minh.
type KtvGan = { ma_ktv: string; ten: string; email_dang_nhap: string | null };
type Dong = {
  ma_misa: string;
  ten_misa: string;
  cong_no_ban_dau: number;
  cong_no_toi_da: number;
  bat_tat: number;
  ghi_chu: string | null;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string | null;
  da_ghi_no: number;
  dang_cho: number;
  da_thanh_toan: number;
  so_don: number;
  hien_tai: number;
  kha_dung: number;
  ktv: KtvGan[];
};
const QK = ["doi-tac-cong-no"];

export function DoiTacCongNoTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QK,
    queryFn: () => api.get<{ rows: Dong[]; duoc_sua: boolean; duoc_ghi_thanh_toan: boolean }>("/doi-tac-cong-no"),
  });
  const duocSua = !!data?.duoc_sua;
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState<"tat_ca" | "bat" | "tat" | "vuot">("tat_ca");
  const [sua, setSua] = useState<Dong | "moi" | null>(null);
  const [xem, setXem] = useState<Dong | null>(null);
  const lamMoi = () => {
    void qc.invalidateQueries({ queryKey: QK });
    void qc.invalidateQueries({ queryKey: ["doi-tac-cong-no-chon"] });
  };
  const rows = data?.rows ?? [];
  const dem = useMemo(
    () => ({
      tat_ca: rows.length,
      bat: rows.filter((r) => r.bat_tat === 1).length,
      tat: rows.filter((r) => r.bat_tat !== 1).length,
      vuot: rows.filter((r) => r.kha_dung < 0).length,
    }),
    [rows],
  );
  const hien = rows.filter((r) => {
    if (loc === "bat" && r.bat_tat !== 1) return false;
    if (loc === "tat" && r.bat_tat === 1) return false;
    if (loc === "vuot" && r.kha_dung >= 0) return false;
    return !q.trim() || khopTim(`${r.ma_misa} ${r.ten_misa} ${r.ktv.map((k) => `${k.ma_ktv} ${k.ten}`).join(" ")} ${r.ghi_chu ?? ""}`, q);
  });
  const batTat = useMutation({
    mutationFn: (r: Dong) => api.patch(`/doi-tac-cong-no/${encodeURIComponent(r.ma_misa)}`, { bat_tat: r.bat_tat !== 1 }),
    onSuccess: lamMoi,
    onError: (e) => addToast(t("Lỗi: ") + describeApiError(e)),
  });
  const taiDanhSach = () =>
    void exportRowsToExcel(
      hien.map((r) => ({
        ma_misa: r.ma_misa, ten_misa: r.ten_misa, ban_dau: r.cong_no_ban_dau, da_ghi_no: r.da_ghi_no, dang_cho: r.dang_cho,
        da_thanh_toan: r.da_thanh_toan, hien_tai: r.hien_tai, toi_da: r.cong_no_toi_da, kha_dung: r.kha_dung,
        trang_thai: r.bat_tat === 1 ? "Bật" : "Tắt", ktv: r.ktv.map((k) => `${k.ma_ktv} - ${k.ten}`).join("; "), ghi_chu: r.ghi_chu ?? "",
      })),
      "cong-no-doi-tac.xlsx",
      "Cong no doi tac",
      {
        ma_misa: "Mã MISA đối tác", ten_misa: "Tên MISA đối tác", ban_dau: "Công nợ ban đầu", da_ghi_no: "Đã ghi nợ", dang_cho: "Đơn đang chờ",
        da_thanh_toan: "Đã thanh toán", hien_tai: "Công nợ hiện tại", toi_da: "Mốc công nợ tối đa", kha_dung: "Khả dụng", trang_thai: "Trạng thái",
        ktv: "KTV tự đặt được", ghi_chu: "Ghi chú",
      },
    );
  const loc1 = (k: typeof loc, nhan: string) => (
    <button key={k} onClick={() => setLoc(k)} className={`focus-ring filter-tab ${loc === k ? "active" : ""}`}>
      {nhan} ({dem[k]})
    </button>
  );
  const tien = (n: number, canhBao = false) => (
    <span className={canhBao && n < 0 ? "text-[var(--color-danger)] font-semibold" : ""}><Money>{fmtVND(n)}</Money></span>
  );

  return (
    <div className="space-y-3">
      <div className="text-[12px] text-[var(--color-text-secondary)]">
        {t("Đối tác cho đơn \"MUA HÀNG CÔNG NỢ ĐỐI TÁC\" — giá niêm yết, không cần chuyển khoản. Công nợ hiện tại = Ban đầu + Đã ghi nợ (phiếu Kế toán đã chốt) + Đơn đang chờ − Đã thanh toán; vượt mốc tối đa thì đơn chờ Giám sát duyệt. KTV có Mã MISA trùng đối tác được tự đặt cho chính mình.")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Tìm Mã / Tên MISA, KTV…")}
          className="o-tim focus-ring w-64 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {loc1("tat_ca", t("Tất cả"))}
          {loc1("bat", t("Đang bật"))}
          {loc1("tat", t("Đang tắt"))}
          {loc1("vuot", t("Vượt mốc"))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn variant="ghost" size="sm" onClick={taiDanhSach} disabled={hien.length === 0}>{t("⬇ Tải danh sách")}</Btn>
          {duocSua && <Btn size="sm" onClick={() => setSua("moi")}>{t("+ Thêm đối tác")}</Btn>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="tbl w-full whitespace-nowrap [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
          <thead className="tbl-head">
            <tr>
              <th>{t("Mã MISA đối tác")}</th>
              <th>{t("Tên MISA đối tác")}</th>
              <th className="text-right">{t("Ban đầu")}</th>
              <th className="text-right">{t("Đã ghi nợ")}</th>
              <th className="text-right">{t("Đơn đang chờ")}</th>
              <th className="text-right">{t("Đã thanh toán")}</th>
              <th className="text-right">{t("Công nợ hiện tại")}</th>
              <th className="text-right">{t("Mốc tối đa")}</th>
              <th className="text-right">{t("Khả dụng")}</th>
              <th>{t("KTV tự đặt được")}</th>
              <th>{t("Trạng thái")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={12} className="py-6 text-center text-[var(--color-text-secondary)]">{t("Đang tải…")}</td></tr>
            ) : isError ? (
              <tr><td colSpan={12} className="py-6 text-center"><Btn variant="ghost" size="sm" onClick={() => void refetch()}>{t("Thử lại")}</Btn></td></tr>
            ) : hien.length === 0 ? (
              <tr><td colSpan={12} className="py-6 text-center text-[var(--color-text-secondary)]">{t("Chưa có đối tác nào")}</td></tr>
            ) : (
              hien.map((r) => (
                <tr key={r.ma_misa} className={r.bat_tat === 1 ? "" : "opacity-60"}>
                  <td><button type="button" className="code-link font-mono" onClick={() => setXem(r)}>{r.ma_misa}</button></td>
                  <td className="max-w-[240px] truncate" title={r.ten_misa}>{r.ten_misa}</td>
                  <td className="text-right">{tien(r.cong_no_ban_dau)}</td>
                  <td className="text-right">{tien(r.da_ghi_no)}</td>
                  <td className="text-right">{tien(r.dang_cho)}</td>
                  <td className="text-right">{tien(r.da_thanh_toan)}</td>
                  <td className="text-right font-semibold">{tien(r.hien_tai)}</td>
                  <td className="text-right">{tien(r.cong_no_toi_da)}</td>
                  <td className="text-right">{tien(r.kha_dung, true)}</td>
                  <td className="max-w-[200px] truncate" title={r.ktv.map((k) => `${k.ma_ktv} - ${k.ten}`).join("\n")}>
                    {r.ktv.length ? r.ktv.map((k) => k.ma_ktv).join(", ") : <span className="text-[var(--ink-400)]">—</span>}
                  </td>
                  <td>
                    {duocSua ? <ToggleSwitch checked={r.bat_tat === 1} onChange={() => !batTat.isPending && batTat.mutate(r)} /> : r.bat_tat === 1 ? t("Bật") : t("Tắt")}
                  </td>
                  <td className="whitespace-nowrap">
                    <Btn variant="ghost" size="sm" onClick={() => setXem(r)}>{t("Chi tiết")}</Btn>
                    {duocSua && <Btn variant="ghost" size="sm" onClick={() => setSua(r)}>{t("Sửa")}</Btn>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {sua && <SuaDoiTacModal dong={sua === "moi" ? null : sua} onClose={() => setSua(null)} onXong={() => { setSua(null); lamMoi(); }} />}
      {xem && <ChiTietDoiTacModal dong={rows.find((r) => r.ma_misa === xem.ma_misa) ?? xem} duocGhi={!!data?.duoc_ghi_thanh_toan} onClose={() => setXem(null)} onDoi={lamMoi} />}
    </div>
  );
}

function SuaDoiTacModal({ dong, onClose, onXong }: { dong: Dong | null; onClose: () => void; onXong: () => void }) {
  const addToast = useToast();
  const [ma, setMa] = useState(dong?.ma_misa ?? "");
  const [ten, setTen] = useState(dong?.ten_misa ?? "");
  const [banDau, setBanDau] = useState(String(dong?.cong_no_ban_dau ?? 0));
  const [toiDa, setToiDa] = useState(String(dong?.cong_no_toi_da ?? ""));
  const [bat, setBat] = useState(dong ? dong.bat_tat === 1 : true);
  const [ghiChu, setGhiChu] = useState(dong?.ghi_chu ?? "");
  const soHopLe = (v: string) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;
  const hopLe = ma.trim() !== "" && ten.trim() !== "" && soHopLe(banDau) && soHopLe(toiDa);
  const luu = useMutation({
    mutationFn: () => {
      const body = { ten_misa: ten.trim(), cong_no_ban_dau: Number(banDau), cong_no_toi_da: Number(toiDa), bat_tat: bat, ghi_chu: ghiChu.trim() || null };
      return dong ? api.patch(`/doi-tac-cong-no/${encodeURIComponent(dong.ma_misa)}`, body) : api.post("/doi-tac-cong-no", { ma_misa: ma.trim(), ...body });
    },
    onSuccess: () => {
      addToast(t("Đã lưu"));
      onXong();
    },
    onError: (e) => addToast(t("Lỗi: ") + describeApiError(e)),
  });
  const o = "focus-ring w-full rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60";
  const nhan = "text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]";
  return (
    <Modal
      open
      onClose={() => !luu.isPending && onClose()}
      title={dong ? t("Sửa đối tác — {a}", { a: dong.ma_misa }) : t("Thêm đối tác công nợ")}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" disabled={luu.isPending} onClick={onClose}>{t("Đóng")}</Btn>
          <Btn loading={luu.isPending} disabled={!hopLe} onClick={() => luu.mutate()}>{t("Lưu")}</Btn>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={nhan}>{t("Mã MISA đối tác *")}</label>
            <input className={o} value={ma} disabled={!!dong} onChange={(e) => setMa(e.target.value)} />
          </div>
          <div>
            <label className={nhan}>{t("Tên MISA đối tác *")}</label>
            <input className={o} value={ten} onChange={(e) => setTen(e.target.value)} />
          </div>
          <div>
            <label className={nhan}>{t("Công nợ ban đầu *")}</label>
            <input className={o} type="number" min={0} value={banDau} onChange={(e) => setBanDau(e.target.value)} />
          </div>
          <div>
            <label className={nhan}>{t("Mốc công nợ tối đa *")}</label>
            <input className={o} type="number" min={0} value={toiDa} onChange={(e) => setToiDa(e.target.value)} />
          </div>
        </div>
        <div className="text-[11px] text-[var(--color-text-secondary)]">
          {t("Mã MISA trùng Mã MISA của 1 KTV → KTV đó được tự đặt đơn công nợ đối tác cho chính mình.")}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <ToggleSwitch checked={bat} onChange={() => setBat(!bat)} /> {bat ? t("Đang bật") : t("Đang tắt")}
        </label>
        <div>
          <label className={nhan}>{t("Ghi chú")}</label>
          <input className={o} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

type DonDoiTac = {
  id: string; ngay_tao: string; ma_lk: string; ten_lk_snapshot: string | null; so_luong: number; tien: number; trang_thai_hien_tai: string;
  nguoi_nhan_hang: string | null; nguoi_tao: string; pxk_id: string | null; da_ghi_no: number;
};
type ThanhToan = {
  id: number; so_tien: number; ngay_chung_tu: string | null; noi_dung: string; trang_thai: "Da ghi" | "Da huy"; nguoi_tao: string; tao_luc: string;
  huy_boi: string | null; huy_luc: string | null; ly_do_huy: string | null;
};

function ChiTietDoiTacModal({ dong, duocGhi, onClose, onDoi }: { dong: Dong; duocGhi: boolean; onClose: () => void; onDoi: () => void }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const personDir = usePersonDirectory();
  const nguoi = (e: string | null) => (e ? formatPersonDisplay(e, personDir) : "—");
  const qk = ["doi-tac-cong-no-chi-tiet", dong.ma_misa];
  const { data, isLoading } = useQuery({
    queryKey: qk,
    queryFn: () => api.get<{ don: DonDoiTac[]; thanh_toan: ThanhToan[] }>(`/doi-tac-cong-no/${encodeURIComponent(dong.ma_misa)}/chi-tiet`),
  });
  const [moDon, setMoDon] = useState<string | null>(null);
  const [soTien, setSoTien] = useState("");
  const [noiDung, setNoiDung] = useState("");
  const [ngay, setNgay] = useState("");
  const xong = () => {
    void qc.invalidateQueries({ queryKey: qk });
    onDoi();
  };
  const ghi = useMutation({
    mutationFn: () => api.post(`/doi-tac-cong-no/${encodeURIComponent(dong.ma_misa)}/thanh-toan`, { so_tien: Number(soTien), noi_dung: noiDung.trim(), ngay_chung_tu: ngay || undefined }),
    onSuccess: () => {
      addToast(t("Đã ghi khoản thanh toán"));
      setSoTien("");
      setNoiDung("");
      setNgay("");
      xong();
    },
    onError: (e) => addToast(t("Lỗi: ") + describeApiError(e)),
  });
  const huy = useMutation({
    mutationFn: ({ id, lyDo }: { id: number; lyDo: string }) => api.post(`/doi-tac-cong-no/thanh-toan/${id}/huy`, { ly_do: lyDo }),
    onSuccess: () => {
      addToast(t("Đã hủy khoản thanh toán"));
      xong();
    },
    onError: (e) => addToast(t("Lỗi: ") + describeApiError(e)),
  });
  const o = "focus-ring rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm";
  return (
    <Modal open onClose={onClose} title={`${dong.ten_misa} (${dong.ma_misa})`} width="max-w-4xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          {[
            [t("Công nợ hiện tại"), dong.hien_tai],
            [t("Mốc tối đa"), dong.cong_no_toi_da],
            [t("Khả dụng"), dong.kha_dung],
            [t("Đã thanh toán"), dong.da_thanh_toan],
          ].map(([nhan, so]) => (
            <div key={nhan as string} className="rounded-xl border border-[var(--line)] px-3 py-2">
              <div className="text-[11px] text-[var(--ink-400)]">{nhan}</div>
              <div className={`font-semibold ${(so as number) < 0 ? "text-[var(--color-danger)]" : ""}`}><Money>{fmtVND(so as number)}</Money></div>
            </div>
          ))}
        </div>
        <div className="text-[12px] text-[var(--color-text-secondary)]">
          {t("Ban đầu {a} + Đã ghi nợ {b} + Đơn đang chờ {c} − Đã thanh toán {d}", {
            a: fmtVND(dong.cong_no_ban_dau), b: fmtVND(dong.da_ghi_no), c: fmtVND(dong.dang_cho), d: fmtVND(dong.da_thanh_toan),
          })}
        </div>

        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">{t("Khoản đối tác đã thanh toán (giảm công nợ)")}</div>
          {duocGhi && (
            <div className="mb-2 flex flex-wrap items-end gap-2">
              <input className={`${o} w-36`} type="number" min={1} placeholder={t("Số tiền")} value={soTien} onChange={(e) => setSoTien(e.target.value)} />
              <input className={`${o} w-40`} type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} title={t("Ngày chứng từ")} />
              <input className={`${o} flex-1 min-w-[200px]`} placeholder={t("Nội dung (bắt buộc)")} value={noiDung} onChange={(e) => setNoiDung(e.target.value)} />
              <Btn size="sm" loading={ghi.isPending} disabled={!(Number(soTien) > 0) || !noiDung.trim()} onClick={() => ghi.mutate()}>{t("Ghi thanh toán")}</Btn>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-[var(--line)] max-h-60 overflow-y-auto">
            <table className="tbl w-full whitespace-nowrap text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-1.5">
              <thead className="tbl-head sticky top-0 bg-white">
                <tr><th>{t("Ngày ghi")}</th><th>{t("Ngày chứng từ")}</th><th className="text-right">{t("Số tiền")}</th><th>{t("Nội dung")}</th><th>{t("Người ghi")}</th><th>{t("Trạng thái")}</th><th></th></tr>
              </thead>
              <tbody>
                {(data?.thanh_toan ?? []).length === 0 ? (
                  <tr><td colSpan={7} className="py-4 text-center text-[var(--color-text-secondary)]">{isLoading ? t("Đang tải…") : t("Chưa có khoản nào")}</td></tr>
                ) : (
                  data!.thanh_toan.map((r) => (
                    <tr key={r.id} className={r.trang_thai === "Da huy" ? "opacity-60" : ""}>
                      <td>{fmtDateTime(r.tao_luc)}</td>
                      <td>{r.ngay_chung_tu ? fmtDate(r.ngay_chung_tu) : "—"}</td>
                      <td className={`text-right ${r.trang_thai === "Da huy" ? "line-through" : "font-semibold"}`}><Money>{fmtVND(r.so_tien)}</Money></td>
                      <td className="max-w-[260px] truncate" title={r.noi_dung}>{r.noi_dung}</td>
                      <td className="max-w-[160px] truncate">{nguoi(r.nguoi_tao)}</td>
                      <td title={r.ly_do_huy ?? ""}>{r.trang_thai === "Da huy" ? t("Đã hủy") : t("Đã ghi")}</td>
                      <td>
                        {duocGhi && r.trang_thai === "Da ghi" && (
                          <Btn
                            variant="ghost"
                            size="sm"
                            disabled={huy.isPending}
                            onClick={() => {
                              const lyDo = window.prompt(t("Lý do hủy khoản thanh toán này?"));
                              if (lyDo?.trim()) huy.mutate({ id: r.id, lyDo: lyDo.trim() });
                            }}
                          >
                            {t("Hủy")}
                          </Btn>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">{t("Đơn mua hàng công nợ đối tác")}</div>
          <div className="overflow-x-auto rounded-xl border border-[var(--line)] max-h-80 overflow-y-auto">
            <table className="tbl w-full whitespace-nowrap text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-1.5">
              <thead className="tbl-head sticky top-0 bg-white">
                <tr><th>{t("Mã đơn")}</th><th>{t("Ngày")}</th><th>{t("Linh kiện")}</th><th className="text-right">{t("SL")}</th><th className="text-right">{t("Tiền")}</th><th>{t("Trạng thái")}</th><th>{t("Phiếu")}</th><th>{t("Ghi nợ")}</th><th>{t("Người nhận")}</th></tr>
              </thead>
              <tbody>
                {(data?.don ?? []).length === 0 ? (
                  <tr><td colSpan={9} className="py-4 text-center text-[var(--color-text-secondary)]">{isLoading ? t("Đang tải…") : t("Chưa có đơn nào")}</td></tr>
                ) : (
                  data!.don.map((r) => (
                    <tr key={r.id}>
                      <td><button type="button" className="code-link" onClick={() => setMoDon(r.id)}>{r.id}</button></td>
                      <td>{fmtDate(r.ngay_tao)}</td>
                      <td className="max-w-[220px] truncate" title={`${r.ma_lk} · ${r.ten_lk_snapshot ?? ""}`}>{r.ma_lk} · {r.ten_lk_snapshot ?? ""}</td>
                      <td className="text-right">{r.so_luong}</td>
                      <td className="text-right"><Money>{fmtVND(r.tien)}</Money></td>
                      <td><StatusBadge value={r.trang_thai_hien_tai} tones={DON_HANG_TRANG_THAI_TONE_ALL} options={DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL} phu /></td>
                      <td className="font-mono text-xs">{r.pxk_id ?? "—"}</td>
                      <td>{["TN tu choi", "Da huy"].includes(r.trang_thai_hien_tai) ? "—" : r.da_ghi_no ? t("Đã ghi nợ") : t("Đang chờ")}</td>
                      <td className="max-w-[160px] truncate">{nguoi(r.nguoi_nhan_hang)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
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
    </Modal>
  );
}
