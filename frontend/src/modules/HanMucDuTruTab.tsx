import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Btn } from "../components/ui/Btn";
import { Modal } from "../components/ui/Modal";
import { Money } from "../components/ui/Money";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { useToast } from "../components/ui/Toast";
import { fmtDateTime, fmtVND } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { boDau, khopTim } from "../lib/boDau";
import { describeApiError } from "./datMuaLinhKien/helpers";
import { t } from "../i18n";

// Tab "Hạn mức dự trữ" trong Danh sách KTV (chot 2026-10-26, migration 0098): Ke toan / Admin them, sua, import, tat/bat han muc theo ID Misa.
// Bang han_muc_du_tru la NGUON DUY NHAT cua 2 cot "Hạn mức dự phòng" / "Hạn mức dự phòng hiện tại" o danh sach KTV (trigger do sang moi ma
// KTV cung Ma MISA; dong tat = KTV khong co han muc) - o danh sach KTV 2 cot nay chi doc.
type KtvGan = { ma_ktv: string; ten: string; ngung: number };
type Dong = {
  ma_misa: string;
  han_muc_du_phong: number | null;
  han_muc_du_phong_hien_tai: number | null;
  bat_tat: number;
  ghi_chu: string | null;
  cap_nhat_luc: string | null;
  cap_nhat_boi: string | null;
  ktv: KtvGan[];
};
type DongGui = { ma_misa: string; han_muc_du_phong?: number | null; han_muc_du_phong_hien_tai?: number | null; bat_tat?: boolean; ghi_chu?: string | null };
type KetQuaGhi = { ghi: number; loi: { ma_misa: string; loi: string }[]; chua_khop_ktv: string[] };

const QK = ["han-muc-du-tru"];
const LO = 200;

export function HanMucDuTruTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QK,
    queryFn: () => api.get<{ rows: Dong[]; duoc_sua: boolean; moc_tinh_du_phong: string | null }>("/settings/ktv-lien-he/han-muc-du-tru"),
  });
  const duocSua = !!data?.duoc_sua;
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState<"tat_ca" | "bat" | "tat" | "chua_khop">("tat_ca");
  const [sua, setSua] = useState<Dong | "moi" | null>(null);
  const [nhap, setNhap] = useState<{ ten: string; rows: DongGui[]; loi: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const lamMoi = () => {
    void qc.invalidateQueries({ queryKey: QK });
    void qc.invalidateQueries({ queryKey: ["settings-ktv"] });
  };
  const rows = data?.rows ?? [];
  const dem = useMemo(
    () => ({
      tat_ca: rows.length,
      bat: rows.filter((r) => r.bat_tat === 1).length,
      tat: rows.filter((r) => r.bat_tat !== 1).length,
      chua_khop: rows.filter((r) => r.ktv.length === 0).length,
    }),
    [rows],
  );
  const hien = rows.filter((r) => {
    if (loc === "bat" && r.bat_tat !== 1) return false;
    if (loc === "tat" && r.bat_tat === 1) return false;
    if (loc === "chua_khop" && r.ktv.length > 0) return false;
    if (!q.trim()) return true;
    return khopTim(`${r.ma_misa} ${r.ktv.map((k) => `${k.ma_ktv} ${k.ten}`).join(" ")} ${r.ghi_chu ?? ""}`, q);
  });

  const batTat = useMutation({
    mutationFn: (r: Dong) => api.patch(`/settings/ktv-lien-he/han-muc-du-tru/${encodeURIComponent(r.ma_misa)}/bat-tat`, { bat_tat: r.bat_tat !== 1 }),
    onSuccess: lamMoi,
    onError: (e) => addToast(t("Lỗi: ") + describeApiError(e)),
  });
  const xoa = useMutation({
    mutationFn: (r: Dong) => api.delete(`/settings/ktv-lien-he/han-muc-du-tru/${encodeURIComponent(r.ma_misa)}`),
    onSuccess: () => {
      addToast(t("Đã xoá"));
      lamMoi();
    },
    onError: (e) => addToast(t("Lỗi: ") + describeApiError(e)),
  });

  const taiDanhSach = () =>
    void exportRowsToExcel(
      hien.map((r) => ({
        ma_misa: r.ma_misa,
        hien_tai: r.han_muc_du_phong_hien_tai,
        han_muc: r.han_muc_du_phong,
        trang_thai: r.bat_tat === 1 ? "Bật" : "Tắt",
        ktv: r.ktv.map((k) => `${k.ma_ktv} - ${k.ten}`).join("; "),
        ghi_chu: r.ghi_chu ?? "",
        cap_nhat_luc: r.cap_nhat_luc ?? "",
      })),
      "han-muc-du-tru.xlsx",
      "Han muc du tru",
      { ma_misa: "ID Misa", hien_tai: "Hạn mức dự phòng hiện tại", han_muc: "Hạn mức dự phòng", trang_thai: "Trạng thái", ktv: "KTV", ghi_chu: "Ghi chú", cap_nhat_luc: "Cập nhật lúc" },
    );
  const taiMau = () =>
    void exportRowsToExcel(
      [{ ma_misa: "KTV0001", hien_tai: 0, han_muc: 20000000, trang_thai: "Bật" }],
      "mau-han-muc-du-tru.xlsx",
      "Han muc du tru",
      { ma_misa: "ID Misa", hien_tai: "Hạn mức dự phòng hiện tại", han_muc: "Hạn mức dự phòng", trang_thai: "Trạng thái" },
    );

  const docFile = async (f: File) => {
    try {
      const kq = await docFileHanMuc(f);
      if (kq.rows.length === 0 && kq.loi.length === 0) {
        addToast(t("File không có dòng dữ liệu nào"));
        return;
      }
      setNhap({ ten: f.name, ...kq });
    } catch (e) {
      addToast(e instanceof Error ? e.message : t("Không đọc được file"));
    }
  };

  const loc1 = (k: typeof loc, nhan: string) => (
    <button key={k} onClick={() => setLoc(k)} className={`focus-ring filter-tab ${loc === k ? "active" : ""}`}>
      {nhan} ({dem[k]})
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="text-[12px] text-[var(--color-text-secondary)]">
        {t("Hạn mức theo ID Misa — tự áp vào cột \"Hạn mức dự phòng\" / \"Hạn mức dự phòng hiện tại\" của mọi KTV có cùng Mã MISA. Dòng tắt = KTV không có hạn mức dự phòng.")}
        {data?.moc_tinh_du_phong && <> {t("Mốc tính dự phòng phát sinh: {a}", { a: fmtDateTime(data.moc_tinh_du_phong) })}.</>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Tìm ID Misa, mã / tên KTV…")}
          className="focus-ring w-64 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {loc1("tat_ca", t("Tất cả"))}
          {loc1("bat", t("Đang bật"))}
          {loc1("tat", t("Đang tắt"))}
          {loc1("chua_khop", t("Chưa khớp KTV"))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn variant="ghost" size="sm" onClick={taiDanhSach} disabled={hien.length === 0}>{t("⬇ Tải danh sách")}</Btn>
          {duocSua && (
            <>
              <Btn variant="ghost" size="sm" onClick={taiMau}>{t("Tải file mẫu")}</Btn>
              <Btn variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>{t("⬆ Import")}</Btn>
              <Btn size="sm" onClick={() => setSua("moi")}>{t("+ Thêm")}</Btn>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void docFile(f); }} />
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="tbl w-full whitespace-nowrap [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
          <thead className="tbl-head">
            <tr>
              <th>{t("ID Misa")}</th>
              <th>{t("KTV")}</th>
              <th className="text-right">{t("Hạn mức dự phòng hiện tại")}</th>
              <th className="text-right">{t("Hạn mức dự phòng")}</th>
              <th>{t("Trạng thái")}</th>
              <th>{t("Ghi chú")}</th>
              <th>{t("Cập nhật")}</th>
              {duocSua && <th></th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="py-6 text-center text-[var(--color-text-secondary)]">{t("Đang tải…")}</td></tr>
            ) : isError ? (
              <tr><td colSpan={8} className="py-6 text-center"><Btn variant="ghost" size="sm" onClick={() => void refetch()}>{t("Thử lại")}</Btn></td></tr>
            ) : hien.length === 0 ? (
              <tr><td colSpan={8} className="py-6 text-center text-[var(--color-text-secondary)]">{t("Chưa có dòng nào")}</td></tr>
            ) : (
              hien.map((r) => (
                <tr key={r.ma_misa} className={r.bat_tat === 1 ? "" : "opacity-60"}>
                  <td className="font-semibold">{r.ma_misa}</td>
                  <td className="max-w-[320px] truncate" title={r.ktv.map((k) => `${k.ma_ktv} - ${k.ten}`).join("\n")}>
                    {r.ktv.length === 0 ? (
                      <span className="text-[var(--color-warning)]">{t("Chưa khớp KTV")}</span>
                    ) : (
                      r.ktv.map((k) => k.ten).join(", ")
                    )}
                  </td>
                  <td className="text-right">{r.han_muc_du_phong_hien_tai != null ? <Money>{fmtVND(r.han_muc_du_phong_hien_tai)}</Money> : "—"}</td>
                  <td className="text-right">{r.han_muc_du_phong != null ? <Money>{fmtVND(r.han_muc_du_phong)}</Money> : "—"}</td>
                  <td>
                    {duocSua ? (
                      <ToggleSwitch checked={r.bat_tat === 1} onChange={() => !batTat.isPending && batTat.mutate(r)} />
                    ) : r.bat_tat === 1 ? t("Bật") : t("Tắt")}
                  </td>
                  <td className="max-w-[220px] truncate" title={r.ghi_chu ?? ""}>{r.ghi_chu ?? ""}</td>
                  <td className="text-[12px] text-[var(--color-text-secondary)]">{r.cap_nhat_luc ? fmtDateTime(r.cap_nhat_luc) : ""}</td>
                  {duocSua && (
                    <td className="whitespace-nowrap">
                      <Btn variant="ghost" size="sm" onClick={() => setSua(r)}>{t("Sửa")}</Btn>
                      <Btn
                        variant="ghost"
                        size="sm"
                        disabled={xoa.isPending}
                        onClick={() => window.confirm(t("Xoá hạn mức của ID Misa {a}? KTV cùng Mã MISA sẽ không còn hạn mức dự phòng.", { a: r.ma_misa })) && xoa.mutate(r)}
                      >
                        {t("Xoá")}
                      </Btn>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {sua && <SuaHanMucModal dong={sua === "moi" ? null : sua} onClose={() => setSua(null)} onXong={() => { setSua(null); lamMoi(); }} />}
      {nhap && <ImportHanMucModal ten={nhap.ten} rows={nhap.rows} loiDoc={nhap.loi} onClose={() => setNhap(null)} onXong={lamMoi} />}
    </div>
  );
}

function baoKetQua(kq: KetQuaGhi): string {
  let s = t("Đã lưu {a} dòng", { a: kq.ghi });
  if (kq.loi.length) s += ` · ${t("{a} dòng lỗi", { a: kq.loi.length })}`;
  if (kq.chua_khop_ktv.length) s += ` · ${t("Chưa khớp KTV: {a}", { a: kq.chua_khop_ktv.slice(0, 5).join(", ") + (kq.chua_khop_ktv.length > 5 ? "…" : "") })}`;
  return s;
}

function SuaHanMucModal({ dong, onClose, onXong }: { dong: Dong | null; onClose: () => void; onXong: () => void }) {
  const addToast = useToast();
  const [maMisa, setMaMisa] = useState(dong?.ma_misa ?? "");
  const [hienTai, setHienTai] = useState(dong?.han_muc_du_phong_hien_tai != null ? String(dong.han_muc_du_phong_hien_tai) : "");
  const [hanMuc, setHanMuc] = useState(dong?.han_muc_du_phong != null ? String(dong.han_muc_du_phong) : "");
  const [bat, setBat] = useState(dong ? dong.bat_tat === 1 : true);
  const [ghiChu, setGhiChu] = useState(dong?.ghi_chu ?? "");
  const so = (v: string) => (v.trim() === "" ? null : Number(v));
  const hopLe = maMisa.trim() !== "" && [hienTai, hanMuc].every((v) => v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) >= 0));
  const luu = useMutation({
    mutationFn: () =>
      api.post<KetQuaGhi>("/settings/ktv-lien-he/han-muc-du-tru", {
        rows: [{ ma_misa: maMisa.trim(), han_muc_du_phong: so(hanMuc), han_muc_du_phong_hien_tai: so(hienTai), bat_tat: bat, ghi_chu: ghiChu.trim() || null }],
      }),
    onSuccess: (kq) => {
      addToast(kq.chua_khop_ktv.length ? t("Đã lưu — ID Misa này chưa khớp KTV nào") : t("Đã lưu"));
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
      title={dong ? t("Sửa hạn mức — {a}", { a: dong.ma_misa }) : t("Thêm hạn mức dự trữ")}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" disabled={luu.isPending} onClick={onClose}>{t("Đóng")}</Btn>
          <Btn loading={luu.isPending} disabled={!hopLe} onClick={() => luu.mutate()}>{t("Lưu")}</Btn>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={nhan}>{t("ID Misa")}</label>
          <input className={o} value={maMisa} disabled={!!dong} onChange={(e) => setMaMisa(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={nhan}>{t("Hạn mức dự phòng hiện tại")}</label>
            <input className={o} type="number" min={0} value={hienTai} onChange={(e) => setHienTai(e.target.value)} />
          </div>
          <div>
            <label className={nhan}>{t("Hạn mức dự phòng")}</label>
            <input className={o} type="number" min={0} value={hanMuc} onChange={(e) => setHanMuc(e.target.value)} />
          </div>
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

function ImportHanMucModal({ ten, rows, loiDoc, onClose, onXong }: { ten: string; rows: DongGui[]; loiDoc: string[]; onClose: () => void; onXong: () => void }) {
  const addToast = useToast();
  const [dangGui, setDangGui] = useState(false);
  const gui = async () => {
    setDangGui(true);
    const tong: KetQuaGhi = { ghi: 0, loi: [], chua_khop_ktv: [] };
    try {
      for (let i = 0; i < rows.length; i += LO) {
        const kq = await api.post<KetQuaGhi>("/settings/ktv-lien-he/han-muc-du-tru", { rows: rows.slice(i, i + LO) });
        tong.ghi += kq.ghi;
        tong.loi.push(...kq.loi);
        tong.chua_khop_ktv.push(...kq.chua_khop_ktv);
      }
      addToast(baoKetQua(tong));
      onXong();
      onClose();
    } catch (e) {
      addToast(t("Lỗi: ") + describeApiError(e) + (tong.ghi ? ` (${t("Đã lưu {a} dòng", { a: tong.ghi })})` : ""));
      onXong();
    } finally {
      setDangGui(false);
    }
  };
  return (
    <Modal
      open
      onClose={() => !dangGui && onClose()}
      title={t("Import hạn mức dự trữ — {a}", { a: ten })}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" disabled={dangGui} onClick={onClose}>{t("Đóng")}</Btn>
          <Btn loading={dangGui} disabled={rows.length === 0} onClick={() => void gui()}>{t("Import {a} dòng", { a: rows.length })}</Btn>
        </div>
      }
    >
      <div className="space-y-2 text-[13px]">
        <div>{t("Ô số để trống = giữ giá trị cũ. Cột \"Trạng thái\" (Bật/Tắt) không bắt buộc — dòng mới mặc định bật.")}</div>
        {loiDoc.length > 0 && (
          <div className="rounded-lg border border-[var(--color-danger)] p-2 text-[var(--color-danger)]">
            <b>{t("{a} dòng bị bỏ qua:", { a: loiDoc.length })}</b>
            <ul className="ml-4 list-disc">{loiDoc.slice(0, 10).map((l) => <li key={l}>{l}</li>)}</ul>
            {loiDoc.length > 10 && <div>…</div>}
          </div>
        )}
        <div className="max-h-[50vh] overflow-auto rounded-lg border border-[var(--line)]">
          <table className="tbl w-full whitespace-nowrap [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
            <thead className="tbl-head">
              <tr><th>{t("ID Misa")}</th><th className="text-right">{t("Hạn mức dự phòng hiện tại")}</th><th className="text-right">{t("Hạn mức dự phòng")}</th><th>{t("Trạng thái")}</th></tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map((r) => (
                <tr key={r.ma_misa}>
                  <td>{r.ma_misa}</td>
                  <td className="text-right">{r.han_muc_du_phong_hien_tai != null ? fmtVND(r.han_muc_du_phong_hien_tai) : t("(giữ cũ)")}</td>
                  <td className="text-right">{r.han_muc_du_phong != null ? fmtVND(r.han_muc_du_phong) : t("(giữ cũ)")}</td>
                  <td>{r.bat_tat === undefined ? t("(giữ cũ)") : r.bat_tat ? t("Bật") : t("Tắt")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 300 && <div className="p-2 text-[12px] text-[var(--color-text-secondary)]">{t("… và {a} dòng nữa", { a: rows.length - 300 })}</div>}
        </div>
      </div>
    </Modal>
  );
}

// Doc file Excel/CSV: tim cot theo tieu de bo dau ("ID Misa"/"Mã MISA", "... hiện tại", "Hạn mức dự phòng", "Trạng thái" tuy chon).
async function docFileHanMuc(f: File): Promise<{ rows: DongGui[]; loi: string[] }> {
  const XLSX = await import("xlsx");
  const wb = /\.csv$/i.test(f.name)
    ? XLSX.read((await f.text()).replace(/^﻿/, ""), { type: "string" })
    : XLSX.read(await f.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
  const chuan = (v: unknown) => boDau(String(v ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
  let hang = -1;
  let cMa = -1, cHt = -1, cHm = -1, cTt = -1;
  for (let i = 0; i < Math.min(raw.length, 10) && hang < 0; i++) {
    const h = (raw[i] ?? []).map(chuan);
    const ma = h.findIndex((x) => x.includes("misa"));
    if (ma < 0) continue;
    hang = i;
    cMa = ma;
    cHt = h.findIndex((x) => x.includes("hien tai"));
    cHm = h.findIndex((x, j) => j !== cHt && x.includes("han muc"));
    cTt = h.findIndex((x) => x.includes("trang thai") || x === "bat/tat" || x === "bat tat");
  }
  if (hang < 0) throw new Error(t("Không tìm thấy cột \"ID Misa\" trong file"));
  if (cHt < 0 && cHm < 0 && cTt < 0) throw new Error(t("File cần ít nhất 1 cột \"Hạn mức dự phòng hiện tại\" / \"Hạn mức dự phòng\" / \"Trạng thái\""));
  const so = (v: unknown): number | undefined | "loi" => {
    if (v === "" || v == null) return undefined;
    if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : "loi";
    const s = String(v).replace(/[\s.,đ₫]/gi, "");
    if (!s) return undefined;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : "loi";
  };
  const rows: DongGui[] = [];
  const loi: string[] = [];
  const daGap = new Set<string>();
  for (let i = hang + 1; i < raw.length; i++) {
    const r = raw[i] ?? [];
    const ma = String(r[cMa] ?? "").trim();
    if (!ma) continue;
    const dong = i + 1;
    if (daGap.has(ma.toUpperCase())) {
      loi.push(t("Dòng {a}: ID Misa {b} lặp lại trong file", { a: dong, b: ma }));
      continue;
    }
    const ht = cHt >= 0 ? so(r[cHt]) : undefined;
    const hm = cHm >= 0 ? so(r[cHm]) : undefined;
    if (ht === "loi" || hm === "loi") {
      loi.push(t("Dòng {a}: số tiền không hợp lệ", { a: dong }));
      continue;
    }
    let bat: boolean | undefined;
    if (cTt >= 0) {
      const v = chuan(r[cTt]);
      if (v) bat = !["tat", "off", "0", "khong", "ngung"].includes(v);
    }
    if (ht === undefined && hm === undefined && bat === undefined) continue;
    daGap.add(ma.toUpperCase());
    rows.push({ ma_misa: ma, han_muc_du_phong_hien_tai: ht, han_muc_du_phong: hm, bat_tat: bat });
  }
  return { rows, loi };
}
