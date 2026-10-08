import { useState, useEffect } from "react";
import { api, buildQuery } from "../../api/client";
import type { MaLadaPreview } from "./types";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { boDau } from "../../lib/boDau";
import { t } from "../../i18n";

// "Mã Lada liên quan" (2026-09-30) - canh bao mem + the doi chieu, cung kieu MaYeuCauSuCoCheck: debounce 500ms sau
// khi ngung go, goi GET /dat-mua-lk/kiem-tra-ma-lada (backend tra cuu center.dichvu3t.com - lib/ladaLookupClient.ts,
// cung API App Khieu nai). KHONG chan tao don: API ngoai loi/chua cau hinh chi hien thong bao.
// Ban sao dieu kien isLikelyLadaId() cua backend (nguon that) - chi goi khi ma dung dang 1 chu cai + so (vd D1154680).
function isLikelyLadaId(id: string): boolean {
  return /^[A-Z]\d{5,}$/i.test(id);
}

type KetQua = { found: boolean; preview: MaLadaPreview | null; warning?: string | null };

// Mau badge trang thai don Lada: xong = xanh la, huy = do, con lai (dang xu ly...) = cam cho.
function toneTrangThai(tt: string): BadgeTone {
  const chuan = boDau(tt.toLowerCase());
  if (chuan.includes("huy")) return "coral";
  if (chuan.includes("thanh cong") || chuan.includes("hoan thanh") || chuan.includes("da chot")) return "teal";
  return "amber";
}


// 1 cap nhan-gia tri theo do dai that (xep flex-wrap, het cho thi xuong hang), gia tri 1 dong - qua dai
// hon ca hang thi cat "…" + tooltip (quy tac o luon 1 dong).
function Truong({ nhan, giaTri }: { nhan: string; giaTri: string | null }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0 max-w-full">
      <span className="shrink-0 text-[11px] text-[var(--color-text-secondary)]">{nhan}</span>
      <span className="text-[12px] font-medium text-[var(--color-text)] truncate" title={giaTri ?? undefined}>
        {giaTri ?? "—"}
      </span>
    </div>
  );
}

export function MaLadaCheck({ value }: { value: string }) {
  const [result, setResult] = useState<KetQua | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const id = value.trim().toUpperCase();

  useEffect(() => {
    setResult(null);
    setDangTai(false);
    if (!id || !isLikelyLadaId(id)) return;
    let huy = false;
    const hen = setTimeout(() => {
      setDangTai(true);
      api
        .get<KetQua>(`/dat-mua-lk/kiem-tra-ma-lada${buildQuery({ id })}`)
        .then((r) => !huy && setResult(r))
        .catch(() => !huy && setResult(null))
        .finally(() => !huy && setDangTai(false));
    }, 500);
    return () => {
      huy = true;
      clearTimeout(hen);
    };
  }, [id]);

  if (!id) return null;
  if (dangTai) return <div className="mt-1.5 text-[11px] text-[var(--color-text-secondary)]">{t("Đang tra cứu hệ thống Lada…")}</div>;
  if (!result) return null;

  if (!result.found) {
    const loiKetNoi = !!result.warning;
    return (
      <div className="mt-1.5 rounded-lg border border-[var(--amber-500)]/30 bg-[var(--amber-100)]/60 px-2.5 py-1.5 text-[11px] font-medium text-[var(--amber-700)]">
        {loiKetNoi
          ? t("⚠ Chưa tra cứu được hệ thống Lada lúc này — vẫn tạo đơn được, hãy chắc chắn mã chính xác.")
          : t("⚠ Không tìm thấy Mã Lada này — kiểm tra lại mã đã nhập.")}
      </div>
    );
  }

  const p = result.preview;
  const sanPham = [p?.hang, p?.model].filter(Boolean).join(" · ") || null;
  const khuVuc = [p?.tinh, p?.quan_huyen].filter(Boolean).join(" · ") || null;
  const ngayTao = p?.ngay_khoi_tao?.replace(/(\d{1,2}:\d{2}):\d{2}$/, "$1") ?? null; // bo giay
  return (
    <div className="mt-1.5 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-surface)] px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-[12px] font-bold text-[var(--color-success)]">✓</span>
        <span className="text-[11px] text-[var(--color-text-secondary)] shrink-0">{t("Đơn Lada")}</span>
        <span className="font-mono text-[12px] font-semibold text-[var(--color-text)] shrink-0">{id}</span>
        {p?.khach_hang && <span className="text-[13px] font-bold text-[var(--color-text)] truncate min-w-0" title={p.khach_hang}>· {p.khach_hang}</span>}
        {p?.trang_thai && (
          <span className="ml-auto">
            <Badge tone={toneTrangThai(p.trang_thai)}>{p.trang_thai}</Badge>
          </span>
        )}
      </div>
      {p && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--color-border-soft)] flex flex-wrap gap-x-6 gap-y-1">
          <Truong nhan={t("Sản phẩm")} giaTri={sanPham} />
          <Truong nhan={t("Khu vực")} giaTri={khuVuc} />
          <Truong nhan="KTV" giaTri={p.ky_thuat_vien} />
          <Truong nhan={t("Ngày tạo")} giaTri={ngayTao} />
        </div>
      )}
    </div>
  );
}
