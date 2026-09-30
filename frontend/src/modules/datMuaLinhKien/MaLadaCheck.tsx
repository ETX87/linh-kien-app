import { useState, useEffect } from "react";
import { api, buildQuery } from "../../api/client";
import type { MaLadaPreview } from "./types";

// "Mã Lada liên quan" (2026-09-30) - canh bao mem + the doi chieu, cung kieu MaYeuCauSuCoCheck: debounce 500ms sau
// khi ngung go, goi GET /dat-mua-lk/kiem-tra-ma-lada (backend tra cuu center.dichvu3t.com - lib/ladaLookupClient.ts,
// cung API App Khieu nai). KHONG chan tao don: API ngoai loi/chua cau hinh chi hien thong bao.
// Ban sao dieu kien isLikelyLadaId() cua backend (nguon that) - chi goi khi ma dung dang 1 chu cai + so (vd D1154680).
function isLikelyLadaId(id: string): boolean {
  return /^[A-Z]\d{5,}$/i.test(id);
}

type KetQua = { found: boolean; preview: MaLadaPreview | null; warning?: string | null };

export function MaLadaCheck({ value }: { value: string }) {
  const [result, setResult] = useState<KetQua | null>(null);
  const id = value.trim().toUpperCase();

  useEffect(() => {
    setResult(null);
    if (!id || !isLikelyLadaId(id)) return;
    const t = setTimeout(() => {
      api
        .get<KetQua>(`/dat-mua-lk/kiem-tra-ma-lada${buildQuery({ id })}`)
        .then(setResult)
        .catch(() => setResult(null));
    }, 500);
    return () => clearTimeout(t);
  }, [id]);

  if (!id || !result) return null;

  if (!result.found) {
    const loiKetNoi = !!result.warning;
    return (
      <div className="mt-1.5 rounded-lg border border-[var(--amber-500)]/30 bg-[var(--amber-100)]/60 px-2.5 py-1.5 text-[11px] font-medium text-[var(--amber-700)]">
        {loiKetNoi
          ? "⚠ Chưa tra cứu được hệ thống Lada lúc này — vẫn tạo đơn được, hãy chắc chắn mã chính xác."
          : "⚠ Không tìm thấy Mã Lada này — kiểm tra lại mã đã nhập."}
      </div>
    );
  }

  const p = result.preview;
  return (
    <div className="mt-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-100)] px-2.5 py-2">
      <div className="text-[11px] font-bold mb-1.5 text-[var(--ink-600)]">Đã tìm thấy đơn Lada — đối chiếu thông tin dưới đây</div>
      {p && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--ink-700)]">
          <div className="col-span-2">
            <span className="text-[var(--ink-500)]">Khách hàng: </span>
            <span className="font-semibold">{p.khach_hang ?? "—"}</span>
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Hãng: </span>
            {p.hang ?? "—"}
            {p.model ? ` · ${p.model}` : ""}
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Khu vực: </span>
            {[p.tinh, p.quan_huyen].filter(Boolean).join(" · ") || "—"}
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Trạng thái: </span>
            {p.trang_thai ?? "—"}
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Ngày tạo: </span>
            {p.ngay_khoi_tao ?? "—"}
          </div>
          <div className="col-span-2">
            <span className="text-[var(--ink-500)]">KTV: </span>
            {p.ky_thuat_vien ?? "—"}
          </div>
        </div>
      )}
    </div>
  );
}
