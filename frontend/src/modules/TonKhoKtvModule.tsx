import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Btn } from "../components/ui/Btn";
import { Tooltip } from "../components/ui/Tooltip";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import type { KtvTonKhoSummaryRow, KtvTonKhoChiTietRow, KtvTonKhoImportMeta } from "../types";
import { fmtVND, fmtDateTime } from "../types";
import { parseTonKhoImportFile } from "../lib/tonKhoImport";

// Module RIENG (tach ra khoi Settings 2026-08-29, phan hoi nguoi dung: "Đẩy thẻ 'Tồn kho công nợ
// KTV' ra ngoài menu" - truoc day chi la 1 tab trong SettingsModule.tsx nen CHI Admin vao duoc, gio
// la 1 muc Sidebar rieng (xem navConfig.ts) mo cho MOI vai tro co lien quan, phan quyen DOC theo
// hang - xem scopeKtvTonKho() o backend/src/routes/ktvTonKho.ts:
//   - KTV/Ve tinh (la_ktv_dvbh/la_ve_tinh): CHI xem dong cua chinh minh.
//   - Giam sat (vai_tro='Giam sat'): xem cac KTV thuoc Khu vuc minh phu trach (qua
//     users.giam_sat_quan_ly, dong bo tu khu_vuc.gs_email - xem lib/khuVucSync.ts).
//   - la_view: xem theo Khu vuc duoc gan (giong quy uoc la_view o cac luong khac trong module Dat
//     mua linh kien - KHONG mac dinh xem het).
//   - Cac vai tro/co con lai (Admin/QC/la_kho/la_ke_toan/la_tac_nghiep/la_tp_dvbh): xem toan bo.
// Import (ghi) VAN CHI Admin (adminOnly o backend, khong doi) - nut "Import tồn kho MISA" o day chi
// hien khi user.vai_tro === "Admin".
export function TonKhoKtvModule() {
  return (
    <div className="anim-in">
      <TonKhoKtvContent />
    </div>
  );
}

function TonKhoKtvContent() {
  const auth = useAuth();
  const isAdmin = auth.status === "authenticated" && auth.user.vai_tro === "Admin";
  const qc = useQueryClient();
  const addToast = useToast();
  const [search, setSearch] = useState("");
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const { data, isLoading } = useQuery({
    queryKey: ["ktv-ton-kho", search],
    queryFn: () => api.get<{ rows: KtvTonKhoSummaryRow[] }>(`/settings/ktv-ton-kho${query}`),
  });
  const { data: meta } = useQuery({
    queryKey: ["ktv-ton-kho-meta"],
    queryFn: () => api.get<KtvTonKhoImportMeta | null>("/settings/ktv-ton-kho/import-meta"),
  });

  const [detailKtv, setDetailKtv] = useState<KtvTonKhoSummaryRow | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importRunning, setImportRunning] = useState(false);
  const [importTotal, setImportTotal] = useState(0);
  const [importProcessed, setImportProcessed] = useState(0);
  const [importSummary, setImportSummary] = useState<{ matched: number; unmatched: string[] } | null>(null);

  async function handleImport(file: File) {
    setImportRunning(true);
    setImportSummary(null);
    try {
      const parsed = await parseTonKhoImportFile(file);
      if (parsed.rows.length === 0) {
        addToast('Không đọc được dòng nào hợp lệ (kiểm tra lại file có cột "Mã kho"/"Mã hàng")');
        return;
      }
      setImportTotal(parsed.rows.length);
      setImportProcessed(0);
      let offset = 0;
      let matched = 0;
      const unmatched = new Set<string>();
      while (offset < parsed.rows.length) {
        const res = await api.post<{ done: boolean; nextOffset: number; matched: number; unmatched: string[] }>("/settings/ktv-ton-kho/import", {
          rows: parsed.rows,
          offset,
          ky_tu_ngay: parsed.ky_tu_ngay,
          ky_den_ngay: parsed.ky_den_ngay,
        });
        matched += res.matched;
        res.unmatched.forEach((m) => unmatched.add(m));
        offset = res.nextOffset;
        setImportProcessed(Math.min(offset, parsed.rows.length));
        if (res.done) break;
      }
      setImportSummary({ matched, unmatched: Array.from(unmatched) });
      await qc.invalidateQueries({ queryKey: ["ktv-ton-kho"] });
      await qc.invalidateQueries({ queryKey: ["ktv-ton-kho-meta"] });
      addToast(`Đã nhập xong: ${matched} dòng khớp KTV / ${parsed.rows.length} dòng đọc được`);
    } catch (err) {
      addToast("Lỗi nhập tồn kho: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImportRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)] flex items-center gap-1.5">
        Tồn kho linh kiện đang giữ tại từng KTV, đối chiếu cùng Trần công nợ - import hàng ngày từ báo cáo "Tổng hợp tồn kho" của MISA.
        <Tooltip text={`Ghép theo cột "Mã kho" trong file MISA với "Mã tài khoản MISA" đã gán cho từng KTV (thẻ "KTV hiện trường" › Quản lý User). KTV chưa có Mã MISA hoặc Mã MISA không khớp sẽ bị bỏ qua khi import - xem danh sách "không khớp" sau khi import xong.`} />
      </div>
      {meta && (
        <div className="text-xs text-[var(--ink-500)]">
          Cập nhật lần cuối theo kỳ báo cáo MISA: <b>{meta.ky_tu_ngay ?? "?"} → {meta.ky_den_ngay ?? "?"}</b> ({meta.so_dong} dòng đọc được)
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        {isAdmin && (
          <Btn size="sm" onClick={() => { setImportOpen(true); setImportSummary(null); setImportTotal(0); setImportProcessed(0); }}>
            📥 Import tồn kho MISA
          </Btn>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã/tên KTV, mã MISA…"
          className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-64"
        />
      </div>
      <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[var(--surface-soft)] border-b border-[var(--line)]">
                <th className="px-3 py-2">Mã KTV</th>
                <th className="px-3 py-2">Tên hiển thị</th>
                <th className="px-3 py-2">Mã MISA</th>
                <th className="px-3 py-2">Trần công nợ</th>
                <th className="px-3 py-2">Số mã hàng tồn</th>
                <th className="px-3 py-2">Tổng SL tồn</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--ink-400)]">Đang tải…</td>
                </tr>
              )}
              {!isLoading && (data?.rows.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--ink-400)]">Chưa có dữ liệu tồn kho{isAdmin ? ' - bấm "Import tồn kho MISA" để nhập.' : "."}</td>
                </tr>
              )}
              {(data?.rows ?? []).map((r) => (
                <tr key={r.ma_ktv} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => setDetailKtv(r)}>
                  <td className="px-3 py-2 font-mono text-xs">{r.ma_ktv}</td>
                  <td className="px-3 py-2">{r.ten_hien_thi ?? "—"}</td>
                  <td className="px-3 py-2">{r.ma_misa ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span title={r.cong_no_cap_nhat_luc ? `Cập nhật lúc ${fmtDateTime(r.cong_no_cap_nhat_luc)}` : undefined}>
                      {r.cong_no != null ? fmtVND(r.cong_no) : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.so_ma_hang}</td>
                  <td className="px-3 py-2">{r.tong_cuoi_ky?.toLocaleString("vi-VN") ?? 0}</td>
                  <td className="px-3 py-2">
                    <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={(e) => { e.stopPropagation(); setDetailKtv(r); }}>
                      Xem chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detailKtv && <TonKhoChiTietModal row={detailKtv} onClose={() => setDetailKtv(null)} />}

      {isAdmin && (
        <Modal open={importOpen} onClose={() => { if (!importRunning) setImportOpen(false); }} title="Import tồn kho MISA">
          <div className="space-y-3">
            <div className="text-xs text-[var(--ink-500)]">
              Chọn file Excel "Tổng hợp tồn kho" xuất từ MISA (báo cáo gồm tất cả kho/KTV trong 1 file). Import sẽ <b>GHI ĐÈ toàn bộ</b> dữ liệu tồn kho hiện có bằng dữ liệu trong file.
            </div>
            {!importRunning && !importSummary && (
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImport(f); e.target.value = ""; }}
                className="text-sm"
              />
            )}
            {importRunning && (
              <div className="text-sm">
                Đang xử lý... {importProcessed}/{importTotal} dòng
                <div className="w-full h-2 bg-[var(--surface-100)] rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-[var(--ocean-800)] transition-all"
                    style={{ width: `${importTotal ? Math.min(100, (importProcessed / importTotal) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}
            {importSummary && (
              <div className="text-sm space-y-2">
                <div>
                  ✅ Đã khớp KTV: <b>{importSummary.matched}</b> dòng
                  {importSummary.unmatched.length > 0 && <> · ⚠ Không khớp: <b>{importSummary.unmatched.length}</b> mã kho</>}
                </div>
                {importSummary.unmatched.length > 0 && (
                  <div className="rounded-lg border border-[var(--coral-500)] bg-[var(--coral-100)] px-3 py-2 text-xs text-[var(--coral-600)]">
                    <div className="font-semibold mb-1">Các mã kho sau không khớp Mã MISA của KTV nào (chưa được nhập):</div>
                    <div className="font-mono max-h-32 overflow-y-auto">{importSummary.unmatched.join(", ")}</div>
                    <div className="mt-1">Vào thẻ "KTV hiện trường" (Quản lý User) gán đúng "Mã tài khoản MISA" rồi import lại.</div>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setImportOpen(false)} disabled={importRunning}>
                {importSummary ? "Đóng" : "Huỷ"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TonKhoChiTietModal({ row, onClose }: { row: KtvTonKhoSummaryRow; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ktv-ton-kho-chi-tiet", row.ma_ktv],
    queryFn: () => api.get<{ rows: KtvTonKhoChiTietRow[] }>(`/settings/ktv-ton-kho/${encodeURIComponent(row.ma_ktv)}/chi-tiet`),
  });

  return (
    <Modal open onClose={onClose} title={`Tồn kho - ${row.ten_hien_thi ?? row.ma_ktv}`} width="max-w-2xl">
      <div className="space-y-3 text-sm">
        <div className="border border-[var(--line)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--surface-soft)]">
                <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider border-b border-[var(--line)]">
                  <th className="px-3 py-2">Mã hàng</th>
                  <th className="px-3 py-2">Tên hàng</th>
                  <th className="px-3 py-2">ĐVT</th>
                  <th className="px-3 py-2 text-right">Đầu kỳ</th>
                  <th className="px-3 py-2 text-right">Nhập kho</th>
                  <th className="px-3 py-2 text-right">Xuất kho</th>
                  <th className="px-3 py-2 text-right">Cuối kỳ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--ink-400)]">Đang tải…</td></tr>
                )}
                {(data?.rows ?? []).map((p) => (
                  <tr key={p.ma_hang} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-2 font-mono">{p.ma_hang}</td>
                    <td className="px-3 py-2">{p.ten_hang ?? "—"}</td>
                    <td className="px-3 py-2">{p.dvt ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{p.dau_ky ?? 0}</td>
                    <td className="px-3 py-2 text-right">{p.nhap_kho ?? 0}</td>
                    <td className="px-3 py-2 text-right">{p.xuat_kho ?? 0}</td>
                    <td className="px-3 py-2 text-right font-semibold">{p.cuoi_ky ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex justify-end">
          <Btn variant="ghost" size="sm" onClick={onClose}>Đóng</Btn>
        </div>
      </div>
    </Modal>
  );
}
