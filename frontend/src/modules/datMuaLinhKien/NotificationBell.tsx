import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Drawer } from "../../components/ui/Drawer";
import { Tabs } from "../../components/ui/Tabs";
import { Badge, type Tone } from "../../components/x/Badge";
import { useToast } from "../../components/ui/Toast";
import { fmtDateTime } from "../../types";
import { usePushNotifications } from "../../hooks/usePushNotifications";
import { useAuth, useRefreshUser } from "../../auth/AuthContext";
import { describeApiError } from "./helpers";
import { t, dichSau } from "../../i18n";

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

// Mau rieng tung loai trang thai (phan hoi "Mỗi trạng thái lịch sử tô 1 màu khác nhau") - khop UI_SPEC
// §1.2 (2026-09-10): "Từ chối"=danger (tach rieng khoi "Đã huỷ"=neutral, khac voi truoc day dung chung
// coral cho ca 2), cho_hang=warning (CHO chu khong dut khoat), da_duyet/pxk_da_duyet=success (tien
// trien TICH CUC), kho_da_gui=info (dang xu ly).
const LOAI_TONE: Record<string, Tone> = {
  tu_choi: "danger",
  huy: "neutral",
  cho_hang: "warning",
  da_duyet: "success",
  pxk_da_duyet: "success",
  kho_da_gui: "info",
  mo_lai: "info",
  // 2026-10-15: he thong chuyen don sang buoc cho nguoi khac duyet / cho chuyen tien (kem ly do trong noi dung).
  cho_duyet: "info",
  cho_thanh_toan: "warning",
  hoi_dap: "info", // Hoi dap KTV <-> Mua hang (2026-10-17)
  phieu_hoan_tien: "warning", // Phieu hoan tien quy (2026-10-19, migration 0090)
  // Them (phan hoi 2026-09-05: "khi đến các nhiệm vụ của mỗi vai trò + khu vực sẽ có thông báo đẩy về
  // cho người xử lý") - 3 loai DOC LAP nguoi dung tu bat/tat (xem cong tac o footer Drawer ben duoi):
  // "viec_moi" = nhiem vu TRUC TIEP phai xu ly, "lien_quan" = viec cung quy trinh/khu vuc nhung chua
  // den luot, "theo_doi" = viec minh tung xu ly nay cap nhat tiep.
  viec_moi: "warning",
  lien_quan: "info",
  theo_doi: "neutral",
};
const LOAI_LABEL: Record<string, string> = {
  tu_choi: dichSau("Từ chối"),
  huy: dichSau("Đã huỷ"),
  cho_hang: dichSau("Chờ hàng"),
  da_duyet: dichSau("Đã duyệt"),
  pxk_da_duyet: dichSau("PXK đã duyệt"),
  kho_da_gui: dichSau("Kho đã gửi"),
  mo_lai: dichSau("Mở lại"),
  cho_duyet: dichSau("Chờ duyệt"),
  cho_thanh_toan: dichSau("Chờ thanh toán"),
  hoi_dap: dichSau("Hỏi đáp"),
  phieu_hoan_tien: dichSau("Hoàn tiền quỹ"),
  viec_moi: dichSau("Việc mới"),
  lien_quan: dichSau("Liên quan"),
  theo_doi: dichSau("Theo dõi"),
};

export function NotificationBell({
  unreadCount,
  onOpenDonHang,
  onOpenPxk,
}: {
  unreadCount: number;
  onOpenDonHang: (donHangId: string) => void;
  onOpenPxk: (pxkId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const qc = useQueryClient();
  const push = usePushNotifications();
  const addToast = useToast();
  const authState = useAuth();
  const refreshUser = useRefreshUser();
  const authUser = authState.status === "authenticated" ? authState.user : null;
  // FIX (phan hoi 2026-09-05: "web đẩy thông báo mới, nhưng người dùng ấn vào chuông vẫn không load
  // thông báo mới") - staleTime MAC DINH toan app la 2 phut (main.tsx), nen mo lai chuong trong vong 2
  // phut ke tu lan mo truoc chi hien du lieu CACHE cu, bo lo thong bao vua day toi. Chuong la noi PHAI
  // luon dung nhat khi nguoi dung chu dong mo de kiem tra - ghi de staleTime: 0 rieng cho query nay de
  // MOI lan mo (enabled: false -> true) deu coi du lieu cu la stale va tu fetch lai.
  const { data, isLoading } = useQuery({
    queryKey: ["ktv-log", filter],
    queryFn: () => api.get<{ rows: ThongBaoKtvRow[]; total: number }>(`/notifications/ktv-log?filter=${filter}&pageSize=50`),
    enabled: open,
    staleTime: 0,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["ktv-log"] });
    qc.invalidateQueries({ queryKey: ["notifications-count"] });
  }

  // FIX (audit "check bug tinh nang push" 2026-08-27): 3 ham nay truoc day khong bat loi - that bai
  // mang/API (vd mat mang giua chung) chi im lang khong lam gi, nguoi dung tuong da danh dau doc/bam
  // khong an thua ma khong ro vi sao. Bao toast khi that bai, giong quy uoc addToast+describeApiError
  // dung khap noi khac trong module.
  async function markAllRead() {
    try {
      await api.post("/notifications/ktv-log/mark-all-read");
      invalidate();
    } catch (err) {
      addToast(t("Lỗi: ") + describeApiError(err));
    }
  }

  async function handleRowClick(row: ThongBaoKtvRow) {
    if (!row.da_doc) {
      try {
        await api.post(`/notifications/ktv-log/${row.id}/read`);
        invalidate();
      } catch (err) {
        addToast(t("Lỗi: ") + describeApiError(err));
      }
    }
    if (row.link_type === "don_hang" && row.link_id) {
      setOpen(false);
      onOpenDonHang(row.link_id);
    } else if (row.link_type === "phieu_xuat_kho" && row.link_id) {
      setOpen(false);
      onOpenPxk(row.link_id);
    } else if (row.link_type === "hoi_dap" && row.link_id) {
      // Mo dung ticket trong khung chat (HoiDapWidget nghe su kien nay).
      setOpen(false);
      window.dispatchEvent(new CustomEvent("mo-hoi-dap", { detail: row.link_id }));
    } else if (row.link_type === "phieu_hoan_tien" && row.link_id) {
      // App.tsx nghe su kien nay: mo "Quỹ & chuyển tiền" › tab Hoàn tiền + chi tiet phieu.
      setOpen(false);
      window.dispatchEvent(new CustomEvent("mo-phieu-hoan-tien", { detail: row.link_id }));
    }
  }

  async function handleTogglePush() {
    const wasSubscribed = push.subscribed;
    try {
      await (wasSubscribed ? push.unsubscribe() : push.subscribe());
      addToast(wasSubscribed ? t("Đã tắt thông báo đẩy trên thiết bị này") : t("Đã bật thông báo đẩy trên thiết bị này"));
    } catch (err) {
      addToast(t("Lỗi: ") + describeApiError(err));
    }
  }

  // Bat/tat rieng 3 loai thong bao "viec moi theo vai tro + khu vuc" (them 2026-09-05) - khac
  // handleTogglePush o tren (do la BAT/TAT PUSH cap THIET BI, con day la CHON LOAI thong bao cap TAI
  // KHOAN, van luon ghi vao chuong du tat - xem lib/taskNotify.ts). PATCH xong goi refreshUser() de
  // UI phan anh ngay, khong can reload trang.
  async function handleTogglePref(field: "nhan_tb_nhiem_vu" | "nhan_tb_lien_quan" | "nhan_tb_theo_doi", next: boolean) {
    try {
      await api.patch("/auth/me/thong-bao-prefs", { [field]: next });
      await refreshUser();
    } catch (err) {
      addToast(t("Lỗi: ") + describeApiError(err));
    }
  }

  const rows = data?.rows ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("Thông báo")}
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
        title={t("Thông báo")}
        footer={
          <div className="flex flex-col gap-1.5">
            {/* Chon loai thong bao muon NHAN (them 2026-09-05) - 3 loai doc lap, xem lib/taskNotify.ts.
                Tat 1 loai KHONG mat du lieu, chi khong day push cho loai do (van ghi vao chuong o tren). */}
            {authUser && (
              <div className="flex flex-col gap-1 text-xs text-[var(--ink-600)] pb-1 mb-1 border-b border-[var(--line)]">
                <span className="font-semibold text-[var(--ink-500)]">{t("Nhận thông báo")}</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[var(--ocean-600)]"
                    checked={authUser.nhan_tb_nhiem_vu}
                    onChange={(e) => handleTogglePref("nhan_tb_nhiem_vu", e.target.checked)}
                  />
                  {t("Nhiệm vụ cần làm của tôi")}
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[var(--ocean-600)]"
                    checked={authUser.nhan_tb_lien_quan}
                    onChange={(e) => handleTogglePref("nhan_tb_lien_quan", e.target.checked)}
                  />
                  {t("Công việc liên quan (chưa đến lượt)")}
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[var(--ocean-600)]"
                    checked={authUser.nhan_tb_theo_doi}
                    onChange={(e) => handleTogglePref("nhan_tb_theo_doi", e.target.checked)}
                  />
                  {t("Công việc tôi từng làm (theo dõi)")}
                </label>
              </div>
            )}
            {/* Bat/tat Web Push tren THIET BI NAY (phan hoi 2026-08-26) - an han neu trinh duyet
                khong ho tro (vd Safari iOS chua "Cài đặt vào màn hình chính", xem
                usePushNotifications.ts) thay vi hien nut roi bao loi kho hieu. */}
            {push.checked && push.supported && (
              <button
                type="button"
                onClick={handleTogglePush}
                disabled={push.busy}
                className={`focus-ring w-full text-center text-sm font-semibold py-1.5 rounded-lg border disabled:opacity-60 ${
                  push.subscribed
                    ? "border-[var(--line)] text-[var(--ink-600)]"
                    : "border-[var(--ocean-500)]/50 text-[var(--ocean-800)]"
                }`}
              >
                {push.subscribed ? t("✓ Đã bật thông báo trên thiết bị này") : t("🔔 Bật thông báo đẩy trên thiết bị này")}
              </button>
            )}
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="focus-ring w-full text-center text-sm font-semibold text-[var(--ocean-800)] disabled:text-[var(--ink-400)] disabled:cursor-default py-1.5"
            >
              {t("Đánh dấu đã đọc toàn bộ")}
            </button>
          </div>
        }
      >
        <Tabs
          tabs={[
            { key: "all", label: t("Tất cả") },
            { key: "unread", label: t("Chưa đọc") },
            { key: "read", label: t("Đã đọc") },
          ]}
          active={filter}
          onChange={(k) => setFilter(k as "all" | "unread" | "read")}
        />
        {isLoading ? (
          <div className="text-sm text-[var(--ink-500)] text-center py-6">{t("Đang tải...")}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-[var(--ink-500)] text-center py-6">{t("Không có thông báo")}</div>
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
                  <Badge tone={LOAI_TONE[row.loai] ?? "gray"}>{LOAI_LABEL[row.loai] ? t(LOAI_LABEL[row.loai]) : row.loai}</Badge>
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
