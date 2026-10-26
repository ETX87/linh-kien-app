import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api/client";
import { Btn } from "../../components/ui/Btn";
import { Modal } from "../../components/ui/Modal";
import { Money } from "../../components/ui/Money";
import { useToast } from "../../components/ui/Toast";
import { fmtDate, fmtDateTime, fmtVND } from "../../types";
import { exportRowsToExcel } from "../../lib/exportExcel";
import { boDau, khopTim } from "../../lib/boDau";
import { usePersonDirectory, formatPersonDisplay } from "../../lib/personDisplay";
import { describeApiError } from "../datMuaLinhKien/helpers";
import { t, dichSau } from "../../i18n";

// Tab "Công nợ đối tác" o Quỹ & chuyển tiền (chot 2026-10-26, v1.404 - "mục thanh toán 'Công nợ đối tác' hiện chung trong menu Quỹ và chuyển
// tiền ... kế toán chỉ cần vào, add hoặc import số tiền đối tác đã thanh toán"). Man CHI cho viec ghi tien doi tac tra: tom tat cong no tung doi
// tac + danh sach MOI khoan thanh toan + Ghi thanh toan / Import (POST /doi-tac-cong-no/thanh-toan/import, kiem tra het truoc khi ghi). Quan ly
// doi tac (them, sua moc, bat/tat) van o Danh sach KTV › "Công nợ đối tác" (DoiTacCongNoTab).
type DoiTac = { ma_misa: string; ten_misa: string; bat_tat: number; hien_tai: number; kha_dung: number; cong_no_toi_da: number; da_thanh_toan: number };
type KhoanTt = {
  id: number; ma_doi_tac: string; ten_misa: string | null; so_tien: number; ngay_chung_tu: string | null; noi_dung: string;
  trang_thai: "Da ghi" | "Da huy"; nguoi_tao: string; tao_luc: string; huy_boi: string | null; huy_luc: string | null; ly_do_huy: string | null;
};
type DongNhap = { dong: number; ma: string; ma_chuan: string | null; so_tien: number | null; noi_dung: string; ngay: string | null; loi: string | null };

const LO = 200;

export function ThanhToanDoiTacTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const personDir = usePersonDirectory();
  const [q, setQ] = useState("");
  const [tt, setTt] = useState<"" | "Da ghi" | "Da huy">("Da ghi");
  const [tu, setTu] = useState("");
  const [den, setDen] = useState("");
  const [locDt, setLocDt] = useState("");
  const [ghi, setGhi] = useState<string | null>(null); // ma doi tac chon san ("" = chua chon)
  const [nhap, setNhap] = useState<{ ten: string; rows: DongNhap[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: dt } = useQuery({
    queryKey: ["doi-tac-cong-no"],
    queryFn: () => api.get<{ rows: DoiTac[]; duoc_ghi_thanh_toan: boolean }>("/doi-tac-cong-no"),
  });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["doi-tac-thanh-toan", tt, tu, den],
    queryFn: () => {
      const p = new URLSearchParams();
      if (tt) p.set("trang_thai", tt);
      if (tu) p.set("tu", tu);
      if (den) p.set("den", den);
      return api.get<{ rows: KhoanTt[]; duoc_ghi_thanh_toan: boolean }>(`/doi-tac-cong-no/thanh-toan?${p}`);
    },
  });
  const duocGhi = !!data?.duoc_ghi_thanh_toan;
  const doiTac = dt?.rows ?? [];
  const lamMoi = () => {
    void qc.invalidateQueries({ queryKey: ["doi-tac-thanh-toan"] });
    void qc.invalidateQueries({ queryKey: ["doi-tac-cong-no"] });
    void qc.invalidateQueries({ queryKey: ["doi-tac-cong-no-chon"] });
    void qc.invalidateQueries({ queryKey: ["doi-tac-cong-no-chi-tiet"] });
  };
  const hien = (data?.rows ?? []).filter(
    (r) => (!locDt || r.ma_doi_tac.toUpperCase() === locDt.toUpperCase()) && (!q.trim() || khopTim(`${r.ma_doi_tac} ${r.ten_misa ?? ""} ${r.noi_dung}`, q)),
  );
  const tongHien = hien.filter((r) => r.trang_thai === "Da ghi").reduce((s, r) => s + r.so_tien, 0);

  const huy = useMutation({
    mutationFn: ({ id, lyDo }: { id: number; lyDo: string }) => api.post(`/doi-tac-cong-no/thanh-toan/${id}/huy`, { ly_do: lyDo }),
    onSuccess: () => {
      addToast(t("Đã hủy khoản thanh toán"));
      lamMoi();
    },
    onError: (e) => addToast(t("Lỗi: ") + describeApiError(e)),
  });

  const taiDanhSach = () =>
    void exportRowsToExcel(
      hien.map((r) => ({
        tao_luc: r.tao_luc, ma: r.ma_doi_tac, ten: r.ten_misa ?? "", so_tien: r.so_tien, ngay: r.ngay_chung_tu ?? "", noi_dung: r.noi_dung,
        nguoi: formatPersonDisplay(r.nguoi_tao, personDir), trang_thai: r.trang_thai === "Da huy" ? `Đã hủy: ${r.ly_do_huy ?? ""}` : "Đã ghi",
      })),
      "thanh-toan-doi-tac.xlsx",
      "Thanh toan doi tac",
      { tao_luc: "Ngày ghi", ma: "Mã MISA đối tác", ten: "Tên MISA đối tác", so_tien: "Số tiền", ngay: "Ngày chứng từ", noi_dung: "Nội dung", nguoi: "Người ghi", trang_thai: "Trạng thái" },
    );
  const taiMau = () =>
    void exportRowsToExcel(
      [{ ma: doiTac[0]?.ma_misa ?? "DT0001", so_tien: 5000000, ngay: "26/10/2026", noi_dung: "Đối tác chuyển khoản thanh toán công nợ" }],
      "mau-thanh-toan-doi-tac.xlsx",
      "Thanh toan doi tac",
      { ma: "Mã MISA đối tác", so_tien: "Số tiền", ngay: "Ngày chứng từ", noi_dung: "Nội dung" },
    );
  const docFile = async (f: File) => {
    try {
      const rows = await docFileThanhToan(f, doiTac);
      if (rows.length === 0) {
        addToast(t("File không có dòng dữ liệu nào"));
        return;
      }
      setNhap({ ten: f.name, rows });
    } catch (e) {
      addToast(e instanceof Error ? e.message : t("Không đọc được file"));
    }
  };

  const tien = (n: number, canhBao = false) => (
    <span className={canhBao && n < 0 ? "font-semibold text-[var(--color-danger)]" : ""}><Money>{fmtVND(n)}</Money></span>
  );
  const o = "focus-ring rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="text-[12px] text-[var(--color-text-secondary)]">
        {t("Ghi các khoản đối tác đã thanh toán cho đơn \"MUA HÀNG CÔNG NỢ ĐỐI TÁC\" — mỗi khoản làm giảm công nợ hiện tại của đối tác. Thêm / sửa đối tác ở Danh sách KTV › Công nợ đối tác.")}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="tbl w-full whitespace-nowrap [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
          <thead className="tbl-head">
            <tr>
              <th>{t("Mã MISA đối tác")}</th>
              <th>{t("Tên MISA đối tác")}</th>
              <th className="text-right">{t("Công nợ hiện tại")}</th>
              <th className="text-right">{t("Đã thanh toán")}</th>
              <th className="text-right">{t("Mốc tối đa")}</th>
              <th className="text-right">{t("Khả dụng")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {doiTac.length === 0 ? (
              <tr><td colSpan={7} className="py-4 text-center text-[var(--color-text-secondary)]">{t("Chưa có đối tác nào")}</td></tr>
            ) : (
              doiTac.map((r) => (
                <tr key={r.ma_misa} className={r.bat_tat === 1 ? "" : "opacity-60"}>
                  <td>
                    <button
                      type="button"
                      className={`code-link font-mono ${locDt === r.ma_misa ? "font-bold" : ""}`}
                      title={t("Lọc khoản thanh toán của đối tác này")}
                      onClick={() => setLocDt(locDt === r.ma_misa ? "" : r.ma_misa)}
                    >
                      {r.ma_misa}
                    </button>
                  </td>
                  <td className="max-w-[260px] truncate" title={r.ten_misa}>{r.ten_misa}</td>
                  <td className="text-right font-semibold">{tien(r.hien_tai)}</td>
                  <td className="text-right">{tien(r.da_thanh_toan)}</td>
                  <td className="text-right">{tien(r.cong_no_toi_da)}</td>
                  <td className="text-right">{tien(r.kha_dung, true)}</td>
                  <td>{duocGhi && <Btn variant="ghost" size="sm" onClick={() => setGhi(r.ma_misa)}>{t("Ghi thanh toán")}</Btn>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Tìm mã / tên đối tác, nội dung…")} className={`${o} w-60`} />
        <select value={tt} onChange={(e) => setTt(e.target.value as typeof tt)} className={o}>
          <option value="Da ghi">{t("Đã ghi")}</option>
          <option value="Da huy">{t("Đã hủy")}</option>
          <option value="">{t("Tất cả")}</option>
        </select>
        <input type="date" value={tu} onChange={(e) => setTu(e.target.value)} className={o} title={t("Từ ngày ghi")} />
        <input type="date" value={den} onChange={(e) => setDen(e.target.value)} className={o} title={t("Đến ngày ghi")} />
        {locDt && (
          <button type="button" className="filter-tab active" onClick={() => setLocDt("")}>
            {locDt} ✕
          </button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn variant="ghost" size="sm" onClick={taiDanhSach} disabled={hien.length === 0}>{t("⬇ Tải danh sách")}</Btn>
          {duocGhi && (
            <>
              <Btn variant="ghost" size="sm" onClick={taiMau}>{t("Tải file mẫu")}</Btn>
              <Btn variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>{t("⬆ Import")}</Btn>
              <Btn size="sm" onClick={() => setGhi(locDt || "")}>{t("+ Ghi thanh toán")}</Btn>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void docFile(f); }} />
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="tbl w-full whitespace-nowrap [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
          <thead className="tbl-head">
            <tr>
              <th>{t("Ngày ghi")}</th>
              <th>{t("Đối tác")}</th>
              <th className="text-right">{t("Số tiền")}</th>
              <th>{t("Ngày chứng từ")}</th>
              <th>{t("Nội dung")}</th>
              <th>{t("Người ghi")}</th>
              <th>{t("Trạng thái")}</th>
              {duocGhi && <th></th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="py-6 text-center text-[var(--color-text-secondary)]">{t("Đang tải…")}</td></tr>
            ) : isError ? (
              <tr><td colSpan={8} className="py-6 text-center"><Btn variant="ghost" size="sm" onClick={() => void refetch()}>{t("Thử lại")}</Btn></td></tr>
            ) : hien.length === 0 ? (
              <tr><td colSpan={8} className="py-6 text-center text-[var(--color-text-secondary)]">{t("Chưa có khoản nào")}</td></tr>
            ) : (
              hien.map((r) => (
                <tr key={r.id} className={r.trang_thai === "Da huy" ? "opacity-60" : ""}>
                  <td>{fmtDateTime(r.tao_luc)}</td>
                  <td className="max-w-[240px] truncate" title={r.ten_misa ?? ""}><span className="font-mono">{r.ma_doi_tac}</span> · {r.ten_misa ?? ""}</td>
                  <td className={`text-right ${r.trang_thai === "Da huy" ? "line-through" : "font-semibold"}`}><Money>{fmtVND(r.so_tien)}</Money></td>
                  <td>{r.ngay_chung_tu ? fmtDate(r.ngay_chung_tu) : "—"}</td>
                  <td className="max-w-[280px] truncate" title={r.noi_dung}>{r.noi_dung}</td>
                  <td className="max-w-[160px] truncate">{formatPersonDisplay(r.nguoi_tao, personDir)}</td>
                  <td title={r.ly_do_huy ? `${r.ly_do_huy} — ${formatPersonDisplay(r.huy_boi ?? "", personDir)}` : ""}>
                    {r.trang_thai === "Da huy" ? t("Đã hủy") : t("Đã ghi")}
                  </td>
                  {duocGhi && (
                    <td>
                      {r.trang_thai === "Da ghi" && (
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
                  )}
                </tr>
              ))
            )}
          </tbody>
          {hien.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2} className="font-semibold">{t("Tổng đã ghi ({a} khoản đang xem)", { a: hien.filter((r) => r.trang_thai === "Da ghi").length })}</td>
                <td className="text-right font-semibold"><Money>{fmtVND(tongHien)}</Money></td>
                <td colSpan={duocGhi ? 5 : 4}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {ghi !== null && <GhiThanhToanModal doiTac={doiTac} maChon={ghi} onClose={() => setGhi(null)} onXong={() => { setGhi(null); lamMoi(); }} />}
      {nhap && <ImportThanhToanModal ten={nhap.ten} rows={nhap.rows} onClose={() => setNhap(null)} onXong={lamMoi} />}
    </div>
  );
}

function GhiThanhToanModal({ doiTac, maChon, onClose, onXong }: { doiTac: DoiTac[]; maChon: string; onClose: () => void; onXong: () => void }) {
  const addToast = useToast();
  const [ma, setMa] = useState(maChon);
  const [soTien, setSoTien] = useState("");
  const [ngay, setNgay] = useState("");
  const [noiDung, setNoiDung] = useState("");
  const dt = doiTac.find((d) => d.ma_misa === ma);
  const luu = useMutation({
    mutationFn: () =>
      api.post(`/doi-tac-cong-no/${encodeURIComponent(ma)}/thanh-toan`, { so_tien: Number(soTien), noi_dung: noiDung.trim(), ngay_chung_tu: ngay || undefined }),
    onSuccess: () => {
      addToast(t("Đã ghi khoản thanh toán"));
      onXong();
    },
    onError: (e) => addToast(t("Lỗi: ") + describeApiError(e)),
  });
  const o = "focus-ring w-full rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm mt-1";
  const nhan = "text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]";
  return (
    <Modal
      open
      onClose={() => !luu.isPending && onClose()}
      title={t("Ghi khoản đối tác đã thanh toán")}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" disabled={luu.isPending} onClick={onClose}>{t("Đóng")}</Btn>
          <Btn loading={luu.isPending} disabled={!ma || !(Number(soTien) > 0) || !noiDung.trim()} onClick={() => luu.mutate()}>{t("Ghi thanh toán")}</Btn>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={nhan}>{t("Đối tác")}</label>
          <select className={o} value={ma} onChange={(e) => setMa(e.target.value)}>
            <option value="">{t("— Chọn đối tác —")}</option>
            {doiTac.map((d) => (
              <option key={d.ma_misa} value={d.ma_misa}>{d.ma_misa} · {d.ten_misa}</option>
            ))}
          </select>
          {dt && (
            <div className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
              {t("Công nợ hiện tại")}: <b><Money>{fmtVND(dt.hien_tai)}</Money></b>
              {Number(soTien) > 0 && <> → <b><Money>{fmtVND(dt.hien_tai - Number(soTien))}</Money></b></>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={nhan}>{t("Số tiền")}</label>
            <input className={o} type="number" min={1} value={soTien} onChange={(e) => setSoTien(e.target.value)} />
          </div>
          <div>
            <label className={nhan}>{t("Ngày chứng từ")}</label>
            <input className={o} type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={nhan}>{t("Nội dung")}</label>
          <input className={o} value={noiDung} placeholder={t("Nội dung (bắt buộc)")} onChange={(e) => setNoiDung(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

const NHAN_LOI: Record<string, string> = {
  DOI_TAC_KHONG_CO: dichSau("Mã MISA không có trong danh sách đối tác"),
  SO_TIEN_KHONG_HOP_LE: dichSau("Số tiền không hợp lệ"),
  THIEU_NOI_DUNG: dichSau("Thiếu nội dung"),
  NGAY_KHONG_HOP_LE: dichSau("Ngày chứng từ không hợp lệ"),
};

function ImportThanhToanModal({ ten, rows, onClose, onXong }: { ten: string; rows: DongNhap[]; onClose: () => void; onXong: () => void }) {
  const addToast = useToast();
  const [noiDungChung, setNoiDungChung] = useState("");
  const [dangGui, setDangGui] = useState(false);
  // Noi dung chung dien cho dong trong; dong con thieu noi dung sau khi dien = loi.
  const dong = useMemo(
    () =>
      rows.map((r) => {
        const noiDung = r.noi_dung || noiDungChung.trim();
        return { ...r, noi_dung: noiDung, loi: r.loi ?? (noiDung ? null : "THIEU_NOI_DUNG") };
      }),
    [rows, noiDungChung],
  );
  const loi = dong.filter((r) => r.loi);
  const tong = dong.reduce((s, r) => s + (r.loi ? 0 : r.so_tien ?? 0), 0);
  const gui = async () => {
    setDangGui(true);
    let daGhi = 0;
    try {
      for (let i = 0; i < dong.length; i += LO) {
        const lo = dong.slice(i, i + LO);
        await api.post("/doi-tac-cong-no/thanh-toan/import", {
          items: lo.map((r) => ({ ma_doi_tac: r.ma_chuan, so_tien: r.so_tien, noi_dung: r.noi_dung, ngay_chung_tu: r.ngay })),
        });
        daGhi += lo.length;
      }
      addToast(t("Đã ghi {a} khoản thanh toán", { a: daGhi }));
      onXong();
      onClose();
    } catch (e) {
      const ct = e instanceof ApiError ? (e.body as { loi?: { dong: number; loi: string }[] } | undefined)?.loi : undefined;
      addToast(
        t("Lỗi: ") + (ct?.length ? t("dòng {a}", { a: ct.map((x) => x.dong + daGhi).join(", ") }) : describeApiError(e)) +
          (daGhi ? ` (${t("Đã ghi {a} khoản thanh toán", { a: daGhi })})` : ""),
      );
      onXong();
    } finally {
      setDangGui(false);
    }
  };
  return (
    <Modal
      open
      onClose={() => !dangGui && onClose()}
      title={t("Import thanh toán đối tác — {a}", { a: ten })}
      width="max-w-4xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          {loi.length > 0 && <span className="mr-auto text-[12px] text-[var(--color-danger)]">{t("Còn {a} dòng lỗi — sửa file hoặc điền nội dung chung rồi import", { a: loi.length })}</span>}
          <Btn variant="ghost" disabled={dangGui} onClick={onClose}>{t("Đóng")}</Btn>
          <Btn loading={dangGui} disabled={loi.length > 0 || dong.length === 0} onClick={() => void gui()}>
            {t("Ghi {a} khoản · {b}", { a: dong.length, b: fmtVND(tong) })}
          </Btn>
        </div>
      }
    >
      <div className="space-y-2 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <span>{t("Nội dung chung cho dòng trống:")}</span>
          <input
            className="focus-ring min-w-[260px] flex-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm"
            value={noiDungChung}
            onChange={(e) => setNoiDungChung(e.target.value)}
            placeholder={t("vd Đối tác thanh toán công nợ tháng 10")}
          />
        </div>
        <div className="max-h-[55vh] overflow-auto rounded-lg border border-[var(--line)]">
          <table className="tbl w-full whitespace-nowrap [&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-1.5">
            <thead className="tbl-head sticky top-0 bg-white">
              <tr><th>{t("Dòng")}</th><th>{t("Mã MISA đối tác")}</th><th className="text-right">{t("Số tiền")}</th><th>{t("Ngày chứng từ")}</th><th>{t("Nội dung")}</th><th>{t("Kiểm tra")}</th></tr>
            </thead>
            <tbody>
              {dong.map((r) => (
                <tr key={r.dong} className={r.loi ? "text-[var(--color-danger)]" : ""}>
                  <td>{r.dong}</td>
                  <td className="font-mono">{r.ma_chuan ?? r.ma}</td>
                  <td className="text-right">{r.so_tien != null ? fmtVND(r.so_tien) : "—"}</td>
                  <td>{r.ngay ? fmtDate(r.ngay) : "—"}</td>
                  <td className="max-w-[300px] truncate" title={r.noi_dung}>{r.noi_dung || "—"}</td>
                  <td>{r.loi ? t(NHAN_LOI[r.loi] ?? r.loi) : t("Sẵn sàng")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

// Doc file Excel/CSV: cot tim theo tieu de bo dau - "Ma MISA doi tac" / "Ma MISA" / "Ma doi tac", "So tien", "Ngay chung tu" / "Ngay", "Noi dung" /
// "Dien giai". Ngay nhan serial Excel / dd/mm/yyyy / yyyy-mm-dd. Doi chieu ma voi danh sach doi tac (khong phan biet hoa/thuong).
async function docFileThanhToan(f: File, doiTac: DoiTac[]): Promise<DongNhap[]> {
  const XLSX = await import("xlsx");
  const wb = /\.csv$/i.test(f.name)
    ? XLSX.read((await f.text()).replace(/^﻿/, ""), { type: "string", raw: true })
    : XLSX.read(await f.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false, raw: true });
  const chuan = (v: unknown) => boDau(String(v ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
  let hang = -1;
  let cMa = -1, cTien = -1, cNgay = -1, cNd = -1;
  for (let i = 0; i < Math.min(raw.length, 10) && hang < 0; i++) {
    const h = (raw[i] ?? []).map(chuan);
    const tien = h.findIndex((x) => x.includes("so tien") || x === "tien" || x.includes("thanh toan"));
    const laCotMa = (x: string, j: number) => j !== tien && (x.includes("misa") || x.includes("doi tac") || x === "ma");
    const uuTien = h.findIndex((x, j) => laCotMa(x, j) && (x === "ma" || x.startsWith("ma ")));
    const ma = uuTien >= 0 ? uuTien : h.findIndex(laCotMa);
    if (ma < 0 || tien < 0) continue;
    hang = i;
    cMa = ma;
    cTien = tien;
    cNgay = h.findIndex((x) => x.includes("ngay"));
    cNd = h.findIndex((x) => x.includes("noi dung") || x.includes("dien giai") || x.includes("ghi chu"));
  }
  if (hang < 0) throw new Error(t("File cần cột \"Mã MISA đối tác\" và \"Số tiền\""));
  const maChuan = new Map(doiTac.map((d) => [d.ma_misa.trim().toUpperCase(), d.ma_misa]));
  const out: DongNhap[] = [];
  for (let i = hang + 1; i < raw.length; i++) {
    const r = raw[i] ?? [];
    const ma = String(r[cMa] ?? "").trim();
    const tienRaw = r[cTien];
    if (!ma && (tienRaw === "" || tienRaw == null)) continue;
    const soTien = docSo(tienRaw);
    const ngay = cNgay >= 0 ? docNgay(r[cNgay]) : null;
    const mc = maChuan.get(ma.toUpperCase()) ?? null;
    let loi: string | null = null;
    if (!mc) loi = "DOI_TAC_KHONG_CO";
    else if (soTien == null || soTien <= 0) loi = "SO_TIEN_KHONG_HOP_LE";
    else if (ngay === "loi") loi = "NGAY_KHONG_HOP_LE";
    out.push({
      dong: i + 1, ma, ma_chuan: mc, so_tien: soTien, noi_dung: cNd >= 0 ? String(r[cNd] ?? "").trim() : "",
      ngay: ngay === "loi" ? null : ngay, loi,
    });
  }
  return out;
}

function docSo(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  const s = String(v ?? "").replace(/[\s.,đ₫]|vnd/gi, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function docNgay(v: unknown): string | null | "loi" {
  if (v === "" || v == null) return null;
  const hai = (n: number) => String(n).padStart(2, "0");
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${hai(d.getUTCMonth() + 1)}-${hai(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${hai(+m[2])}-${hai(+m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${m[3]}-${hai(+m[2])}-${hai(+m[1])}`;
  return "loi";
}
