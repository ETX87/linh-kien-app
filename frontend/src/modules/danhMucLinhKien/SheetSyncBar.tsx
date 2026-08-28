import { Btn } from "../../components/ui/Btn";
import { fmtSyncedAt } from "../../lib/publicSheetCache";

// Thanh trang thai dung chung cho 2 tab tra cuu tu Google Sheet cong khai (BomHangTab/ThayTheTab) -
// hien lan dong bo gan nhat + nut dong bo tay, va bao loi NHE (khong chan giao dien) khi lan dong bo
// gan nhat that bai - xem lib/publicSheetCache.ts.
export function SheetSyncBar({
  syncedAt,
  syncing,
  error,
  onSync,
}: {
  syncedAt: number | null;
  syncing: boolean;
  error: string | null;
  onSync: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-3 text-xs text-[var(--ink-500)]">
      <span>
        Dữ liệu tải trực tiếp từ Google Sheet (không qua máy chủ hệ thống) — cập nhật lần cuối: <b>{fmtSyncedAt(syncedAt)}</b>.
      </span>
      <Btn variant="ghost" size="sm" onClick={onSync} disabled={syncing}>
        {syncing ? "Đang đồng bộ…" : "🔄 Đồng bộ lại"}
      </Btn>
      {error && (
        <span className="text-[var(--coral-600)]">
          ⚠ Đồng bộ lỗi ({error}) — đang dùng bản đã lưu trên máy{syncedAt ? "" : ", chưa có dữ liệu nào"}.
        </span>
      )}
    </div>
  );
}
