import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Modal } from "../components/ui/Modal";
import { khopTim } from "../lib/boDau";

// "Xem như người dùng" (2026-09-30, phan hoi "chon nhan vien A -> thay dung nhung gi he thong show va cap quyen cho A,
// de test va huong dan nguoi dung"). Admin-only, CHI DOC - backend doi han `user` sang tai khoan A (middleware/
// loadUser.ts, cookie dvbh_view_as_user) va chan moi request ghi (XEM_NHU_CHI_DOC). Khac "Xem thử vai trò" (chi doi bo
// co quyen, giu email Admin nen du lieu van theo Admin).

interface TaiKhoan {
  email: string;
  ten: string | null;
  vai_tro: string | null;
  la_ktv_dvbh: number;
  la_ve_tinh: number;
  la_kho: number;
  la_ke_toan: number;
  la_tac_nghiep: number;
  la_tp_dvbh: number;
  la_view: number;
  la_mua_hang: number;
  la_nv_sua_chua?: number;
}

const CO_VAI_TRO: [keyof TaiKhoan, string][] = [
  ["la_ktv_dvbh", "KTV"],
  ["la_ve_tinh", "Vệ tinh"],
  ["la_tac_nghiep", "TN"],
  ["la_kho", "Kho"],
  ["la_ke_toan", "Kế toán"],
  ["la_tp_dvbh", "TP DVBH"],
  ["la_mua_hang", "Mua hàng"],
  ["la_nv_sua_chua", "NV sửa chữa"],
  ["la_view", "View"],
];

function nhanVaiTro(t: TaiKhoan): string {
  const ds = CO_VAI_TRO.filter(([k]) => !!t[k]).map(([, nhan]) => nhan);
  if (t.vai_tro === "Giam sat") ds.unshift("Giám sát");
  else if (t.vai_tro) ds.unshift(t.vai_tro);
  return ds.join(" · ") || "Chưa có vai trò";
}

// Xoa filter trang thai luu localStorage phu thuoc vai tro truoc khi reload (cung ly do setViewAs o TopBarActions.tsx).
const FILTER_TRANG_THAI_KEYS = ["filters:dmlk-trang-thai", "filters:dmlk-tlk-tt", "filters:dmlk-pxk-tt", "filters:dmlk-th-tt"];

export async function doiXemNhu(email: string | null) {
  await api.post("/auth/view-as-user", { email });
  for (const k of FILTER_TRANG_THAI_KEYS) localStorage.removeItem(k);
  window.location.href = "/";
}

export function XemNhuNguoiDungModal({ open, onClose, dangXem }: { open: boolean; onClose: () => void; dangXem: string | null }) {
  const [q, setQ] = useState("");
  const [dangDoi, setDangDoi] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["view-as-user-options"],
    queryFn: () => api.get<{ rows: TaiKhoan[] }>("/auth/view-as-user/options").then((r) => r.rows),
    enabled: open,
    staleTime: 60_000,
  });
  const loc = useMemo(
    () => (data ?? []).filter((t) => !q.trim() || khopTim(t.ten, q) || khopTim(t.email, q) || khopTim(nhanVaiTro(t), q)).slice(0, 100),
    [data, q],
  );

  async function chon(email: string | null) {
    setDangDoi(email ?? "");
    try {
      await doiXemNhu(email);
    } catch {
      setDangDoi(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Xem như người dùng" width="max-w-xl">
      <div className="space-y-3 text-sm">
        <p className="text-[12px] text-[var(--color-text-secondary)]">
          Hiển thị đúng menu, dữ liệu và quyền của tài khoản được chọn. <b className="text-[var(--color-text)]">Chỉ xem</b> — mọi thao
          tác ghi (tạo, sửa, duyệt…) đều bị chặn để không ghi nhận dưới tên người khác.
        </p>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên, email, vai trò…"
          className="focus-ring w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm"
        />
        <div className="max-h-[52vh] overflow-y-auto rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border-soft)]">
          {isLoading && <div className="px-3 py-3 text-[12px] text-[var(--color-text-secondary)]">Đang tải danh sách…</div>}
          {!isLoading && loc.length === 0 && <div className="px-3 py-3 text-[12px] text-[var(--color-text-secondary)]">Không có tài khoản phù hợp.</div>}
          {loc.map((t) => (
            <button
              key={t.email}
              type="button"
              disabled={dangDoi !== null}
              onClick={() => chon(t.email)}
              className={`focus-ring flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-hover)] disabled:opacity-60 ${
                t.email === dangXem ? "bg-[var(--color-primary-soft)]" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-[var(--color-text)]">{t.ten ?? t.email}</div>
                <div className="truncate text-[11px] text-[var(--color-text-secondary)]">{t.email}</div>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-[var(--color-text-secondary)]">
                {dangDoi === t.email ? "Đang chuyển…" : nhanVaiTro(t)}
              </span>
            </button>
          ))}
        </div>
        {dangXem && (
          <button type="button" disabled={dangDoi !== null} onClick={() => chon(null)} className="focus-ring text-[12px] font-semibold text-[var(--color-primary)] underline underline-offset-2">
            Thoát, quay về tài khoản Admin
          </button>
        )}
      </div>
    </Modal>
  );
}
