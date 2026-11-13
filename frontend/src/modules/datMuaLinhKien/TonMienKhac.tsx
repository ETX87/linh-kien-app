import type { KiemTraDong } from "./types";
import { t } from "../../i18n";

// TON KHO MIEN CON LAI KHI THIEU HANG (chot 2026-11-13, v1.488 - "khi GS, TN, tạo đơn hộ KTV nếu khu vực của KTV không có hàng, check luôn tồn
// kho tại khu vực miền còn lại và hiện cảnh báo đồng thời. nếu kv khác còn hàng thì hiện đề xuất khu vực còn hàng (có thể đổi lại khu vực sau
// khi xin đề xuất đặt hàng trái miền)"). Nguon: KiemTraDong.ton_mien_khac (POST /phieu-dat/kiem-tra -> tonKhoMienKhac o backend, chi GS / TN /
// Admin dat ho). Form tao don CHUA cho chon khu vuc -> chi canh bao + huong dan: tao don, roi doi "Khu vực xử lý" o chi tiet don sang khu vuc
// con hang (PATCH /don-hang/:id/khu-vuc -> xetLaiTonKhiDoiKhuVuc tu duyet neu du hang).

function tenMien(ds: { khu_vuc: string }[]): string {
  if (ds.length && ds.every((x) => x.khu_vuc.includes("MN"))) return t("miền Nam");
  if (ds.length && ds.every((x) => x.khu_vuc.includes("MB"))) return t("miền Bắc");
  return t("miền còn lại");
}

export function TonMienKhacHint({ ketQua, khuVuc }: { ketQua: KiemTraDong[] | undefined; khuVuc?: string | null }) {
  const dong = (ketQua ?? []).filter((r) => r.ton_mien_khac != null);
  if (!dong.length) return null;
  return (
    <div className="mt-1.5 space-y-1.5">
      {dong.map((r) => {
        const ds = r.ton_mien_khac ?? [];
        const kvNay = khuVuc ? t("khu vực {kv}", { kv: khuVuc }) : t("khu vực của KTV");
        if (!ds.length) {
          return (
            <div key={`${r.goc}-${r.ma_lk}`} className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-danger-strong)]" role="status">
              ⚠ {t("{ma}: kho {kv} thiếu hàng và kho miền còn lại cũng hết — đơn sẽ chờ hàng.", { ma: r.ma_lk, kv: kvNay })}
            </div>
          );
        }
        return (
          <div key={`${r.goc}-${r.ma_lk}`} className="rounded-lg border border-[var(--color-warning)]/50 bg-[var(--color-warning-soft)] px-2.5 py-2 text-[11.5px] space-y-1" role="status">
            <div className="font-semibold text-[var(--color-warning-strong)]">
              ⚠ {t("{ma}: kho {kv} thiếu hàng — kho {mien} còn hàng:", { ma: r.ma_lk, kv: kvNay, mien: tenMien(ds) })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ds.map((x) => (
                <span key={x.khu_vuc} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-success)]/50 bg-[var(--color-surface)] px-2 py-0.5 font-semibold text-[var(--color-success-strong)]">
                  {x.ten && x.ten !== x.khu_vuc ? `${x.khu_vuc} · ${x.ten}` : x.khu_vuc}
                  <span className="font-normal tabular">· {t("còn {n}", { n: x.ton })}</span>
                </span>
              ))}
            </div>
            <div className="text-[var(--color-text-secondary)]">
              {t("Đặt trái miền: tạo đơn như bình thường, sau khi được đồng ý thì mở chi tiết đơn và đổi “Khu vực xử lý” sang khu vực còn hàng — đơn tự duyệt nếu đủ hàng.")}
            </div>
          </div>
        );
      })}
    </div>
  );
}
