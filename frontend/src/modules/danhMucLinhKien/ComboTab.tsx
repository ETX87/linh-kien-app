import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Modal } from "../../components/ui/Modal";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { Badge } from "../../components/x/Badge";
import { Money } from "../../components/ui/Money";
import { useToast } from "../../components/ui/Toast";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { fmtVND, fmtDateTime } from "../../types";
import { khopTim } from "../../lib/boDau";
import { usePersonDirectory, formatPersonDisplay } from "../../lib/personDisplay";
import { LinhKienPicker } from "../datMuaLinhKien/LinhKienPicker";
import { describeApiError, formatLkLabel, useLkAndLdeCache, useLkCombo } from "../datMuaLinhKien/helpers";
import type { LkComboRow } from "../datMuaLinhKien/types";

// Tab "Combo" cua Bang gia (migration 0066, lib/lkCombo.ts o backend). Combo = 1 ma chon nhanh nhieu LK: o chon LK luc
// tao don hien combo, luu don thi server tach thanh tung don LK thanh phan (SL = SL combo x SL thanh phan) - moi don tinh
// gia/chiet khau/cong no nhu don thuong. Ghi: Quan ly danh muc LK / Mua hang / Admin.

interface DongSoan { ma_lk: string; so_luong: number }

export function ComboTab() {
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const canWrite = !!u?.quan_ly_danh_muc_lk || !!u?.la_mua_hang || u?.vai_tro === "Admin";
  // KTV/Ve tinh chi thay Gia NY o Bang gia (khop DanhMucTab chiGiaNiemYet).
  const chiGiaNiemYet = !!(u?.la_ktv_dvbh || u?.la_ve_tinh) && !canWrite;
  const { data, isLoading } = useLkCombo();
  const { danhMuc } = useLkAndLdeCache(true);
  const personDir = usePersonDirectory();
  const addToast = useToast();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [sua, setSua] = useState<LkComboRow | "moi" | null>(null);
  const [xoa, setXoa] = useState<LkComboRow | null>(null);

  const rows = useMemo(() => {
    const q = query.trim();
    const all = data?.rows ?? [];
    if (!q) return all;
    return all.filter((cb) => khopTim(`${cb.ma_combo} ${cb.ten_combo} ${cb.ct.map((t) => `${t.ma_lk} ${t.ten_lk ?? ""}`).join(" ")}`, q));
  }, [data, query]);

  const lamMoi = () => qc.invalidateQueries({ queryKey: ["lk-combo"] });
  const batTat = useMutation({
    mutationFn: (cb: LkComboRow) => api.patch(`/lk-settings/combo/${encodeURIComponent(cb.ma_combo)}`, { bat_tat: !cb.bat_tat }),
    onSuccess: lamMoi,
    onError: (e) => addToast("Lỗi: " + describeApiError(e)),
  });
  const xoaMut = useMutation({
    mutationFn: (cb: LkComboRow) => api.delete(`/lk-settings/combo/${encodeURIComponent(cb.ma_combo)}`),
    onSuccess: () => {
      addToast("Đã xoá combo");
      setXoa(null);
      lamMoi();
    },
    onError: (e) => addToast("Lỗi: " + describeApiError(e)),
  });

  const tong = (cb: LkComboRow, f: "gia_ban" | "gia_tri_cong_no") => cb.ct.reduce((s, t) => s + (t[f] ?? 0) * t.so_luong, 0);

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm mã/tên combo hoặc linh kiện thành phần…"
          className="focus-ring w-full max-w-lg bg-white border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        {canWrite && (
          <Btn variant="primary" size="sm" className="ml-auto" onClick={() => setSua("moi")}>
            ＋ Thêm combo
          </Btn>
        )}
      </div>
      <div className="text-[12px] text-[var(--color-text-secondary)] mb-2">
        Khi tạo đơn, chọn combo như 1 linh kiện — hệ thống tự tách thành từng đơn linh kiện thành phần (giá, chiết khấu, công nợ tính
        theo từng linh kiện). Combo chỉ hiện ở ô chọn khi đang bật và mọi linh kiện thành phần đang bật.
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-btn)] border border-[var(--color-border)]">
        <table className="tbl w-full border-collapse">
          <thead>
            <tr className="tbl-head">
              <th className="px-2.5 py-2 font-semibold">Mã combo</th>
              <th className="px-2.5 py-2 font-semibold">Tên combo</th>
              <th className="px-2.5 py-2 font-semibold">Thành phần</th>
              <th className="px-2.5 py-2 font-semibold text-right">Giá NY (tổng)</th>
              {!chiGiaNiemYet && <th className="px-2.5 py-2 font-semibold text-right">Giá KTV (tổng)</th>}
              <th className="px-2.5 py-2 font-semibold">Bật</th>
              <th className="px-2.5 py-2 font-semibold">Cập nhật</th>
              {canWrite && <th className="px-2.5 py-2 font-semibold" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-2.5 py-6 text-center text-[var(--color-text-secondary)]">Đang tải…</td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2.5 py-6 text-center text-[var(--color-text-secondary)]">Chưa có combo nào.</td>
              </tr>
            )}
            {rows.map((cb) => {
              const lkTat = cb.ct.filter((t) => !t.lk_bat_tat);
              const moTa = cb.ct.map((t) => `${formatLkLabel(t.ma_lk, t.ten_lk ?? t.ma_lk)} ×${t.so_luong}`).join("\n");
              return (
                <tr key={cb.ma_combo} className="border-t border-[var(--color-border)]">
                  <td className="px-2.5 py-1.5 font-mono text-xs max-w-[220px] truncate" title={cb.ma_combo}>{cb.ma_combo}</td>
                  <td className="px-2.5 py-1.5 font-medium max-w-[280px] truncate" title={cb.ten_combo}>{cb.ten_combo}</td>
                  <td className="px-2.5 py-1.5 max-w-[360px] truncate" title={moTa}>
                    <span className="font-semibold">{cb.ct.length} LK</span>
                    {lkTat.length > 0 && <span className="ml-1"><Badge tone="warning">{lkTat.length} LK đang tắt</Badge></span>}
                    <span className="ml-1.5 text-[var(--color-text-secondary)]">{cb.ct.map((t) => t.ten_lk ?? t.ma_lk).join(", ")}</span>
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono"><Money>{fmtVND(tong(cb, "gia_ban"))}</Money></td>
                  {!chiGiaNiemYet && <td className="px-2.5 py-1.5 text-right font-mono"><Money>{fmtVND(tong(cb, "gia_tri_cong_no"))}</Money></td>}
                  <td className="px-2.5 py-1.5">
                    {canWrite ? (
                      <ToggleSwitch checked={!!cb.bat_tat} onChange={() => batTat.mutate(cb)} />
                    ) : (
                      <Badge tone={cb.bat_tat ? "success" : "neutral"}>{cb.bat_tat ? "Bật" : "Tắt"}</Badge>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)]">
                    {fmtDateTime(cb.ngay_cap_nhat)}
                    {cb.nguoi_cap_nhat && cb.nguoi_cap_nhat !== "he-thong" ? ` · ${formatPersonDisplay(cb.nguoi_cap_nhat, personDir)}` : ""}
                  </td>
                  {canWrite && (
                    <td className="px-2.5 py-1.5 text-right">
                      <Btn size="sm" variant="ghost" onClick={() => setSua(cb)}>Sửa</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => setXoa(cb)}>Xoá</Btn>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sua && (
        <ComboModal
          combo={sua === "moi" ? null : sua}
          danhMuc={danhMuc}
          chiGiaNiemYet={chiGiaNiemYet}
          onClose={() => setSua(null)}
          onSaved={() => {
            setSua(null);
            lamMoi();
          }}
        />
      )}
      {xoa && (
        <Modal
          open
          title="Xoá combo"
          onClose={() => setXoa(null)}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setXoa(null)}>Huỷ</Btn>
              <Btn variant="danger" disabled={xoaMut.isPending} onClick={() => xoaMut.mutate(xoa)}>Xoá combo</Btn>
            </>
          }
        >
          <div className="text-sm">
            Xoá hẳn combo <b>{formatLkLabel(xoa.ma_combo, xoa.ten_combo)}</b>? Các đơn đã tạo từ combo giữ nguyên. Muốn tạm ẩn khỏi ô chọn
            linh kiện thì tắt công tắc "Bật" thay vì xoá.
          </div>
        </Modal>
      )}
    </div>
  );
}

function ComboModal({
  combo, danhMuc, chiGiaNiemYet, onClose, onSaved,
}: {
  combo: LkComboRow | null;
  danhMuc: ReturnType<typeof useLkAndLdeCache>["danhMuc"];
  chiGiaNiemYet: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const addToast = useToast();
  const [ma, setMa] = useState(combo?.ma_combo ?? "");
  const [ten, setTen] = useState(combo?.ten_combo ?? "");
  const [ghiChu, setGhiChu] = useState(combo?.ghi_chu ?? "");
  const [dong, setDong] = useState<DongSoan[]>(combo ? combo.ct.map((t) => ({ ma_lk: t.ma_lk, so_luong: t.so_luong })) : [{ ma_lk: "", so_luong: 1 }]);
  // LK thanh phan dang tat van giu trong danh sach chon de sua combo cu (o chon chi co LK dang bat).
  const options = useMemo(() => {
    const coSan = new Set(danhMuc.map((r) => r.ma_linh_kien));
    const them = (combo?.ct ?? [])
      .filter((t) => !coSan.has(t.ma_lk))
      .map((t) => ({ ma_linh_kien: t.ma_lk, ten_linh_kien: `${t.ten_lk ?? t.ma_lk} (đang tắt)`, gia_ban: t.gia_ban, gia_tri_cong_no: t.gia_tri_cong_no, don_vi: null, bat_tat: 0 }));
    return [...danhMuc, ...them];
  }, [danhMuc, combo]);
  const lkMap = useMemo(() => new Map(options.map((r) => [r.ma_linh_kien, r])), [options]);
  const tongNy = dong.reduce((s, d) => s + (lkMap.get(d.ma_lk)?.gia_ban ?? 0) * (d.so_luong || 0), 0);
  const tongKtv = dong.reduce((s, d) => s + (lkMap.get(d.ma_lk)?.gia_tri_cong_no ?? 0) * (d.so_luong || 0), 0);
  const dongHopLe = dong.filter((d) => d.ma_lk);
  const trung = new Set(dongHopLe.map((d) => d.ma_lk)).size !== dongHopLe.length;
  const duLieu = !!ma.trim() && !!ten.trim() && dongHopLe.length > 0 && dongHopLe.every((d) => Number.isInteger(d.so_luong) && d.so_luong > 0) && !trung;

  const luu = useMutation({
    mutationFn: () => {
      const body = { ma_combo: ma.trim(), ten_combo: ten.trim(), ghi_chu: ghiChu.trim() || null, ct: dongHopLe };
      return combo ? api.patch(`/lk-settings/combo/${encodeURIComponent(combo.ma_combo)}`, body) : api.post("/lk-settings/combo", body);
    },
    onSuccess: () => {
      addToast(combo ? "Đã lưu combo" : "Đã tạo combo");
      onSaved();
    },
    onError: (e) => addToast("Không lưu được: " + describeApiError(e)),
  });

  const suaDong = (i: number, patch: Partial<DongSoan>) => setDong((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <Modal
      open
      title={combo ? "Sửa combo" : "Thêm combo"}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Huỷ</Btn>
          <Btn variant="primary" disabled={!duLieu || luu.isPending} onClick={() => luu.mutate()}>{luu.isPending ? "Đang lưu…" : "Lưu combo"}</Btn>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Mã combo *</span>
            <input
              value={ma}
              disabled={!!combo}
              onChange={(e) => setMa(e.target.value)}
              placeholder="VD: 3030CHIP"
              className="focus-ring w-full bg-white border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 font-mono disabled:opacity-60"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Tên combo *</span>
            <input
              value={ten}
              onChange={(e) => setTen(e.target.value)}
              placeholder="VD: Combo Bộ mạch 3030 Chip lạnh"
              className="focus-ring w-full bg-white border border-[var(--color-border)] rounded-lg px-2.5 py-1.5"
            />
          </label>
        </div>
        {combo && <div className="text-[11.5px] text-[var(--color-text-secondary)] -mt-1">Mã combo không đổi được (đơn đã tạo gắn nhãn theo mã).</div>}
        <div>
          <div className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Linh kiện thành phần * (số lượng cho 1 bộ)</div>
          <div className="space-y-2">
            {dong.map((d, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-5 pt-2 text-xs text-[var(--color-text-secondary)] text-right shrink-0">{i + 1}.</span>
                <LinhKienPicker className="flex-1 min-w-0" value={d.ma_lk} onChange={(v) => suaDong(i, { ma_lk: v })} options={options} ghiLichSu={false} />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={d.so_luong}
                  onChange={(e) => suaDong(i, { so_luong: Number(e.target.value) })}
                  className="focus-ring w-16 shrink-0 bg-white border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-right font-mono"
                  title="Số lượng / bộ"
                />
                <Btn size="sm" variant="ghost" disabled={dong.length === 1} onClick={() => setDong((prev) => prev.filter((_, j) => j !== i))}>✕</Btn>
              </div>
            ))}
          </div>
          {trung && <div className="mt-1 text-xs text-[var(--color-danger)]">Có linh kiện bị chọn 2 lần — tăng số lượng thay vì thêm dòng.</div>}
          <Btn size="sm" variant="ghost" className="mt-2" onClick={() => setDong((prev) => [...prev, { ma_lk: "", so_luong: 1 }])}>＋ Thêm linh kiện</Btn>
        </div>
        <label className="block">
          <span className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Ghi chú</span>
          <input
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            className="focus-ring w-full bg-white border border-[var(--color-border)] rounded-lg px-2.5 py-1.5"
          />
        </label>
        <div className="flex items-center gap-4 rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[12.5px]">
          <span>Giá NY 1 bộ: <b className="font-mono"><Money>{fmtVND(tongNy)}</Money></b></span>
          {!chiGiaNiemYet && <span>Giá KTV 1 bộ: <b className="font-mono"><Money>{fmtVND(tongKtv)}</Money></b></span>}
        </div>
      </div>
    </Modal>
  );
}
