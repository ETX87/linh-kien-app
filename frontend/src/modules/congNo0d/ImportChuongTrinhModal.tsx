import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../../components/ui/Btn";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/x/Badge";
import { fmtDate } from "../../types";
import { describeApiError, useLkAndLdeCache } from "../datMuaLinhKien/helpers";
import { COT_MAU, docFileChuongTrinh, type ChuongTrinhCo, type KetQuaDoc, type KtvImport } from "./importChuongTrinh";

// Modal "Import chương trình" (2026-10-22, v1.386) - chon file -> man KIEM TRA truoc khi tao (chuong trinh se tao, dong loi, canh bao) ->
// tao lan luot qua POST /settings/ktv-ton-kho/cong-no-0d (API san co, kiem tra lai moi thu). Con dong loi thi khong cho tao - sua file
// roi chon lai (tranh tao chuong trinh thieu dong). Loi giua chung: dung lai, bao chuong trinh da tao.

export function ImportChuongTrinhModal({ daCo, onClose, onDone }: { daCo: ChuongTrinhCo[]; onClose: () => void; onDone: () => void }) {
  const { danhMuc } = useLkAndLdeCache(true);
  const { data: ktvData } = useQuery({
    queryKey: ["cong-no-0d-ktv-options"],
    queryFn: () => api.get<{ rows: KtvImport[] }>("/settings/ktv-ton-kho/cong-no-0d/ktv-options"),
  });
  const ktvAll = ktvData?.rows ?? [];
  const tenKtv = useMemo(() => new Map(ktvAll.map((k) => [k.ma_ktv, k.ten_hien_thi ?? k.ma_ktv])), [ktvAll]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tenFile, setTenFile] = useState("");
  const [kq, setKq] = useState<KetQuaDoc | null>(null);
  const [dangTao, setDangTao] = useState(false);
  const [daTao, setDaTao] = useState<string[]>([]);
  const [loiTao, setLoiTao] = useState<string | null>(null);
  const sanSang = !!ktvAll.length && !!danhMuc.length;

  async function docFile(file: File) {
    setLoiTao(null);
    setDaTao([]);
    try {
      const XLSX = await import("xlsx");
      // CSV doc dang chuoi + raw: giu nguyen "01/10/2026" (khong de thu vien tu doi thang/ngay kieu My).
      const wb = /\.csv$/i.test(file.name)
        ? XLSX.read((await file.text()).replace(/^\uFEFF/, ""), { type: "string", raw: true })
        : XLSX.read(await file.arrayBuffer(), { type: "array" });
      const bang = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false }) as unknown[][];
      const maLk = new Map(danhMuc.map((r) => [r.ma_linh_kien.trim().toUpperCase(), r.ma_linh_kien]));
      setTenFile(file.name);
      setKq(docFileChuongTrinh(bang, ktvAll, maLk, daCo));
    } catch (e) {
      setTenFile(file.name);
      setKq(null);
      setLoiTao("Không đọc được file: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function taiFileMau() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      COT_MAU,
      ["Hỗ trợ bo nguồn T11", "01/11/2026", "30/11/2026", "kyhv.dvkh", "", "A041-049", "", "", 2, "Bật"],
      ["Hỗ trợ bo nguồn T11", "01/11/2026", "30/11/2026", "", "KTV0037", "A041-049", "", "", 2, "Bật"],
      ["Hỗ trợ lõi T11", "01/11/2026", "30/11/2026", "TẤT CẢ", "", "", "BH004", "", 1, "Bật"],
      [],
      ["Ghi chú: mỗi dòng = 1 KTV × 1 linh kiện. Mã KTV HOẶC Mã MISA (để trống cả 2 hoặc ghi TẤT CẢ = toàn bộ KTV). Mã LK HOẶC Từ khóa (1 trong 2; từ khóa ≥ 3 ký tự, Khớp cả tên = x để khớp cả tên LK). Ngày dạng dd/mm/yyyy. Bật: để trống = bật, ghi Tắt = tạo ở trạng thái tắt. Cùng Tên + Từ ngày + Đến ngày = 1 chương trình."],
    ]);
    ws["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Chương trình");
    XLSX.writeFile(wb, "mau-import-chuong-trinh-cong-no-0-dong.xlsx");
  }

  async function taoTatCa() {
    if (!kq) return;
    setDangTao(true);
    setLoiTao(null);
    const xong: string[] = [];
    for (const ct of kq.chuongTrinh) {
      try {
        await api.post("/settings/ktv-ton-kho/cong-no-0d", {
          ten: ct.ten,
          tu_ngay: ct.tu_ngay,
          den_ngay: ct.den_ngay,
          tat_ca_ktv: ct.tat_ca_ktv,
          ktv: ct.ktv,
          lk: ct.muc.filter((m) => m.loai === "lk").map((m) => ({ ma_linh_kien: m.ma, so_luong: m.sl })),
          tu_khoa: ct.muc.filter((m) => m.loai === "tu_khoa").map((m) => ({ tu_khoa: m.ma, so_luong: m.sl, khop_ten: m.khop_ten })),
          tat_ma: [],
          bat_tat: ct.bat_tat,
        });
        xong.push(ct.khoa);
        setDaTao([...xong]);
      } catch (e) {
        setLoiTao(`Dừng ở chương trình "${ct.ten}": ${describeApiError(e)}. Đã tạo ${xong.length}/${kq.chuongTrinh.length} chương trình trước đó.`);
        setDangTao(false);
        onDone();
        return;
      }
    }
    setDangTao(false);
    onDone();
    onClose();
  }

  const coLoi = !!kq && (kq.loi.length > 0 || kq.thieuCot.length > 0);
  const soCt = kq?.chuongTrinh.length ?? 0;
  const conLai = kq ? kq.chuongTrinh.filter((c) => !daTao.includes(c.khoa)) : [];

  return (
    <Modal
      open
      title="Import chương trình công nợ 0 đồng"
      onClose={dangTao ? () => {} : onClose}
      width="max-w-4xl"
      footer={
        <>
          <Btn variant="ghost" disabled={dangTao} onClick={onClose}>Đóng</Btn>
          <Btn variant="primary" disabled={!kq || coLoi || soCt === 0 || dangTao || daTao.length > 0} onClick={() => void taoTatCa()}>
            {dangTao ? `Đang tạo ${daTao.length}/${soCt}…` : `Tạo ${soCt} chương trình`}
          </Btn>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="text-xs text-[var(--color-text-secondary)]">
          File Excel/CSV, mỗi dòng = <b>1 KTV × 1 linh kiện</b>: <b>Mã KTV</b> hoặc <b>Mã MISA</b> (để trống cả 2 / ghi "TẤT CẢ" = toàn bộ
          KTV), <b>Mã LK</b> hoặc <b>Từ khóa</b> (1 trong 2), <b>SL hỗ trợ / KTV</b>, <b>Từ ngày</b>, <b>Đến ngày</b>, <b>Tên chương trình</b>;
          tuỳ chọn "Khớp cả tên" (từ khóa), "Bật". Các dòng cùng Tên + Từ ngày + Đến ngày gộp thành 1 chương trình; KTV có linh kiện / SL
          khác nhau được tách thành chương trình riêng để mỗi KTV hưởng đúng số trong file.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn size="sm" variant="primary" disabled={!sanSang || dangTao} onClick={() => fileRef.current?.click()}>⬆ Chọn file</Btn>
          <button type="button" className="text-xs text-[var(--color-primary)] underline underline-offset-2" onClick={() => void taiFileMau()}>Tải file mẫu</button>
          {!sanSang && <span className="text-xs text-[var(--color-text-secondary)]">Đang tải danh bạ KTV / danh mục linh kiện…</span>}
          {tenFile && <span className="text-xs text-[var(--color-text-secondary)]">File: <b>{tenFile}</b>{kq ? ` · ${kq.soDongDoc} dòng dữ liệu` : ""}</span>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const fi = e.target.files?.[0]; e.target.value = ""; if (fi) void docFile(fi); }} />
        </div>

        {loiTao && <div className="rounded-lg border border-[var(--color-danger)] px-3 py-2 text-xs text-[var(--color-danger-strong)]">{loiTao}</div>}

        {kq && kq.thieuCot.length > 0 && (
          <div className="rounded-lg border border-[var(--color-danger)] px-3 py-2 text-xs text-[var(--color-danger-strong)]">
            File thiếu cột: <b>{kq.thieuCot.join(", ")}</b>. Tải file mẫu để xem đúng tên cột.
          </div>
        )}

        {kq && kq.loi.length > 0 && (
          <div className="rounded-lg border border-[var(--color-danger)]">
            <div className="border-b border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-danger-strong)]">
              {kq.loi.length} dòng lỗi — sửa file rồi chọn lại (chưa tạo chương trình nào)
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-[var(--color-border)]">
              {kq.loi.map((l, i) => (
                <div key={i} className="px-3 py-1 text-xs"><b>Dòng {l.dong}:</b> {l.noiDung}</div>
              ))}
            </div>
          </div>
        )}

        {kq && kq.canhBao.length > 0 && (
          <details className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs">
            <summary className="cursor-pointer text-[var(--color-warning)]">⚠ {kq.canhBao.length} cảnh báo (vẫn tạo được)</summary>
            <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
              {kq.canhBao.map((l, i) => <div key={i}><b>Dòng {l.dong}:</b> {l.noiDung}</div>)}
            </div>
          </details>
        )}

        {kq && soCt > 0 && (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
            <table className="tbl w-full border-collapse">
              <thead>
                <tr className="tbl-head">
                  <th className="px-2.5 py-2">Chương trình sẽ tạo</th>
                  <th className="px-2.5 py-2">Thời gian</th>
                  <th className="px-2.5 py-2">Linh kiện (SL / KTV)</th>
                  <th className="px-2.5 py-2">KTV áp dụng</th>
                  <th className="px-2.5 py-2">Bật</th>
                </tr>
              </thead>
              <tbody>
                {kq.chuongTrinh.map((ct) => {
                  const xong = daTao.includes(ct.khoa);
                  const moTaLk = ct.muc.map((m) => (m.loai === "lk" ? `${m.ma} ×${m.sl}` : `🔎 ${m.ma}${m.khop_ten ? " (cả tên)" : ""} ×${m.sl}`)).join(", ");
                  const moTaKtv = ct.ktv.map((k) => tenKtv.get(k) ?? k).join(", ");
                  return (
                    <tr key={ct.khoa} className="border-t border-[var(--color-border)] align-top">
                      <td className="px-2.5 py-1.5 max-w-[240px]">
                        <div className="truncate font-medium" title={ct.ten}>{xong ? "✓ " : ""}{ct.ten}</div>
                        <div className="text-[11px] text-[var(--color-text-secondary)]">Dòng {ct.dong.join(", ")}</div>
                        {ct.canhBao.map((c, i) => <div key={i} className="text-[11px] text-[var(--color-warning)]">⚠ {c}</div>)}
                      </td>
                      <td className="px-2.5 py-1.5 text-xs">{fmtDate(ct.tu_ngay)} → {fmtDate(ct.den_ngay)}</td>
                      <td className="px-2.5 py-1.5 max-w-[280px] truncate text-xs" title={moTaLk}>
                        <b>{ct.muc.length}</b> mục · {moTaLk}
                      </td>
                      <td className="px-2.5 py-1.5 max-w-[240px] truncate text-xs" title={moTaKtv}>
                        {ct.tat_ca_ktv ? <Badge tone="info">Toàn bộ KTV</Badge> : <><b>{ct.ktv.length}</b> KTV · {moTaKtv}</>}
                      </td>
                      <td className="px-2.5 py-1.5 text-xs">{ct.bat_tat ? "Bật" : "Tắt"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {kq && !coLoi && soCt === 0 && <div className="text-xs text-[var(--color-text-secondary)]">File không có dòng dữ liệu nào.</div>}
        {daTao.length > 0 && conLai.length > 0 && loiTao && (
          <div className="text-xs text-[var(--color-text-secondary)]">Sửa lỗi rồi import file chỉ gồm {conLai.length} chương trình còn lại để tránh tạo trùng.</div>
        )}
      </div>
    </Modal>
  );
}
