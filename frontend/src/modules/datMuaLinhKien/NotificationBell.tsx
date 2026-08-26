import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Drawer } from "../../components/ui/Drawer";
import { Tabs } from "../../components/ui/Tabs";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { fmtDateTime } from "../../types";

// Chuong thong bao KTV (them 2026-08-26, phan hoi "thêm 1 trạng danh sách thông báo cho KTV với log
// các trạng thái của đơn thay đổi... để trong màn hình Home, tạo icon góc trên cùng bên phải") - chi
// mount tren Home (forceView === "trang-chu", xem DatMuaLinhKienModule.tsx). Doc du lieu tu
// GET/POST /notifications/ktv-log* (backend/src/routes/notifications.ts, migration 0006).
interface ThongBaoKtvRow {
  id: number;
  loai: string;
  noi_dung: string;
  link_type: string | null;
  link_id: string | null;
  da_doc: number;
  ngay_tao: string;
}

// Mau rieng tung loai trang thai (phan hoi "Mỗi trạng thái lịch sử tô 1 màu khác nhau") - khop tinh
// than mau da dung cho trang_thai dat_don_hang o noi khac trong module (tu_choi/huy = coral vi la ket
// qua TIEU CUC, cho_hang = amber vi la CHO chu khong dut khoat, da_duyet/pxk_da_duyet/kho_da_gui =
// teal/ocean vi la tien trien TICH CUC).
const LOAI_TONE: Record<string, BadgeTone> = {
  tu_choi: "coral",
  huy: "coral",
  cho_hang: "amber",
  da_duyet: "teal",
  pxk_da_duyet: "teal",
  kho_da_gui: "ocean",
};
const LOAI_LABEL: Record<string, string> = {
  tu_choi: "Từ chối",
  huy: "Đã huỷ",
  cho_hang: "Chờ hàng",
  da_duyet: "Đã duyệt",
  pxk_da_duyet: "PXK đã duyệt",
  kho_da_gui: "Kho đã gửi",
};

export function NotificationBell({ unreadCount, onOpenDonHang }: { unreadCount: number; onOpenDonHang: (donHangId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ktv-log", filter],
    queryFn: () => api.get<{ rows: ThongBaoKtvRow[]; total: number }>(`/notifications/ktv-log?filter=${filter}&pageSize=50`),
    enabled: open,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["ktv-log"] });
    qc.invalidateQueries({ queryKey: ["notifications-count"] });
  }

  async function markAllRead() {
    await api.post("/notifications/ktv-log/mark-all-read");
    invalidate();
  }

  async function handleRowClick(row: ThongBaoKtvRow) {
    if (!row.da_doc) {
      await api.post(`/notifications/ktv-log/${row.id}/read`);
      invalidate();
    }
    if (row.link_type === "don_hang" && row.link_id) {
      setOpen(false);
      onOpenDonHang(row.link_id);
    }
  }

  const rows = data?.rows ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Thông báo"
        className="focus-ring relative w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-[var(--surface-100)] transition-colors"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 min-w-[16px] h-[16px] px-[3px] rounded-full bg-[var(--coral-600)] text-white text-[9px] font-bold leading-[16px] text-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Thông báo"
        footer={
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="focus-ring w-full text-center text-sm font-semibold text-[var(--ocean-800)] disabled:text-[var(--ink-400)] disabled:cursor-default py-1.5"
          >
            Đánh dấu đã đọc toàn bộ
          </button>
        }
      >
        <Tabs
          tabs={[
            { key: "all", label: "Tất cả" },
            { key: "unread", label: "Chưa đọc" },
            { key: "read", label: "Đã đọc" },
          ]}
          active={filter}
          onChange={(k) => setFilter(k as "all" | "unread" | "read")}
        />
        {isLoading ? (
          <div className="text-sm text-[var(--ink-500)] text-center py-6">Đang tải...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-[var(--ink-500)] text-center py-6">Không có thông báo</div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => handleRowClick(row)}
                className={`focus-ring text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  row.da_doc
                    ? "border-[var(--line)] bg-[var(--surface)] opacity-70"
                    : "border-[var(--coral-500)]/40 bg-[var(--coral-500)]/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Badge tone={LOAI_TONE[row.loai] ?? "gray"}>{LOAI_LABEL[row.loai] ?? row.loai}</Badge>
                  <span className="text-[11px] text-[var(--ink-400)] shrink-0">{fmtDateTime(row.ngay_tao)}</span>
                </div>
                <div className={`text-sm ${row.da_doc ? "text-[var(--ink-600)]" : "text-[var(--ink-900)] font-semibold"}`}>{row.noi_dung}</div>
              </button>
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}
