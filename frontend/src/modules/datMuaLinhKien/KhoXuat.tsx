import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/x/Badge";
import { Select } from "../../components/ui/Select";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { api, ApiError } from "../../api/client";
import { describeApiError } from "./helpers";
import { MIEN_XUAT_LABEL, MIEN_XUAT_NGAN, type MienXuat } from "./constants";
import type { PhieuXuatKhoRow } from "./types";
import { t } from "../../i18n";

// Kho xuat MB/MN cua phieu (chot 2026-10-07, backend/src/lib/mienXuat.ts, migration 0070): mac dinh theo khu vuc,
// TN/Ke toan chuyen duoc khi phieu chua gui Kho ("Dang tao phieu"/"Cho ke toan"). Phieu da chuyen hien cho CA khu vuc cu
// lan mien moi (2026-10-15), TN mien moi duoc bao viec, nguoi chuyen chiu trach nhiem theo doi; file MISA lay kho mien moi.
export const MIEN_XUAT_SUA_DUOC = ["Dang tao phieu", "Cho ke toan"];

type PxkMien = Pick<PhieuXuatKhoRow, "mien_xuat" | "mien_xuat_hieu_luc">;

export function KhoXuatBadge({ r }: { r: PxkMien }) {
  const m = r.mien_xuat_hieu_luc;
  if (!m) return <span className="text-[var(--ink-400)]" title={t("Khu vực không xác định được miền — file MISA để trống mã kho")}>—</span>;
  return r.mien_xuat ? (
    <Badge tone="purple">
      <span title={t("Đã chuyển kho xuất sang {a}", { a: t(MIEN_XUAT_LABEL[m]) })}>{t("Kho {a} · đã chuyển", { a: MIEN_XUAT_NGAN[m] })}</span>
    </Badge>
  ) : (
    <span className="text-xs text-[var(--color-text-body)]" title={t("Theo khu vực của phiếu")}>{t("Kho {a}", { a: MIEN_XUAT_NGAN[m] })}</span>
  );
}

export function ChuyenKhoXuatCard({
  pxk, addToast, onDone,
}: {
  pxk: PxkMien & Pick<PhieuXuatKhoRow, "id" | "mien_khu_vuc">;
  addToast: (msg: string) => void;
  onDone: () => void;
}) {
  const hienTai = pxk.mien_xuat_hieu_luc ?? "";
  const [chon, setChon] = useState<string>(hienTai);
  const [lyDo, setLyDo] = useState("");
  useEffect(() => { setChon(hienTai); setLyDo(""); }, [pxk.id, hienTai]);

  const mutation = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${pxk.id}/mien-xuat`, { mien_xuat: chon || null, ghi_chu: lyDo.trim() || undefined }),
    onSuccess: () => { onDone(); addToast(t("Đã chuyển kho xuất: {a}", { a: chon ? t(MIEN_XUAT_LABEL[chon as MienXuat]) : t("theo khu vực") })); },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "DA_GUI_KHO") addToast(t("Phiếu đã gửi Kho — không chuyển kho xuất được nữa"));
      else if (code === "CONFLICT") addToast(t("Phiếu vừa được người khác cập nhật — tải lại rồi thử lại"));
      else addToast(t("Lỗi: ") + describeApiError(err));
    },
  });

  const mienKv = pxk.mien_khu_vuc;
  const options: { value: string; label: string }[] = (["bac", "nam"] as MienXuat[]).map((m) => ({
    value: m,
    label: `${t(MIEN_XUAT_LABEL[m])}${m === mienKv ? t(" (theo khu vực)") : ""}`,
  }));
  if (!mienKv && !pxk.mien_xuat) options.unshift({ value: "", label: t("Chưa xác định (theo khu vực)") });
  const doi = chon !== hienTai;

  return (
    <div className="border border-[var(--line)] rounded-lg p-3">
      <SectionTitle icon="🏭">{t("Kho xuất")}</SectionTitle>
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={chon} onChange={setChon} options={options} className="min-w-[180px]" />
        {doi && (
          <input
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            placeholder={t("Lý do chuyển (không bắt buộc)")}
            className="focus-ring flex-1 min-w-[160px] bg-[var(--surface)] border border-[var(--ink-400)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        )}
        <Btn size="sm" onClick={() => mutation.mutate()} disabled={!doi || mutation.isPending} loading={mutation.isPending}>{t("Lưu")}</Btn>
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--ink-500)]">
        {pxk.mien_xuat
          ? t("Đã chuyển từ {a} — Kho/TN cả 2 miền đều thấy phiếu, người chuyển chịu trách nhiệm theo dõi; file MISA dùng kho {c}.", { a: mienKv ? t(MIEN_XUAT_LABEL[mienKv]) : t("khu vực chưa rõ miền"), c: MIEN_XUAT_NGAN[pxk.mien_xuat] })
          : t("Mặc định theo khu vực của phiếu. Chuyển sang miền khác: phiếu hiện thêm cho Kho/TN miền mới (TN miền mới được báo việc), bạn vẫn chịu trách nhiệm theo dõi; file MISA dùng kho miền mới.")}
      </div>
    </div>
  );
}

// Kho chon lai khu vuc cho phieu SAI khu vuc (chot 2026-10-07, migration 0071, PATCH /phieu-xuat-kho/:id/khu-vuc): ghi cho
// CA phieu + moi don trong phieu -> Kho/Ke toan/TN khu vuc moi thay, khu vuc cu khong con thay mac dinh. Phieu chua dong.
export const PXK_TRANG_THAI_DONG = ["KTV da nhan", "Ke toan huy", "Hang tru kho", "Kho da ket thuc", "Kho da nhan hang tra"];

type PxkKhuVuc = Pick<PhieuXuatKhoRow, "id" | "khu_vuc_ma" | "khu_vuc_chon" | "khu_vuc_tu_dong_ten" | "khu_vuc_chon_ten">;

export function KhuVucPxkBadge({ pxk }: { pxk: PxkKhuVuc }) {
  if (!pxk.khu_vuc_chon) return null;
  return (
    <Badge tone="purple">
      <span title={t("Đã chuyển khu vực từ {a}", { a: pxk.khu_vuc_tu_dong_ten ?? pxk.khu_vuc_ma ?? "?" })}>{t("Khu vực {a} · đã chuyển", { a: pxk.khu_vuc_chon_ten ?? pxk.khu_vuc_chon })}</span>
    </Badge>
  );
}

export function ChuyenKhuVucCard({ pxk, addToast, onDone }: { pxk: PxkKhuVuc; addToast: (msg: string) => void; onDone: () => void }) {
  const hienTai = pxk.khu_vuc_chon ?? pxk.khu_vuc_ma ?? "";
  const [chon, setChon] = useState(hienTai);
  const [lyDo, setLyDo] = useState("");
  useEffect(() => { setChon(hienTai); setLyDo(""); }, [pxk.id, hienTai]);
  const { data: khuVucData } = useQuery({
    queryKey: ["settings-khu-vuc"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/settings/khu-vuc"),
  });
  const options = (khuVucData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ma === pxk.khu_vuc_ma ? t("{a} (tự động)", { a: k.ten }) : k.ten }));
  const mutation = useMutation({
    mutationFn: () => api.patch<{ so_don: number; tu_duyet?: string[]; cho_hang?: string[]; giu_nguyen?: string[] }>(`/phieu-xuat-kho/${pxk.id}/khu-vuc`, { khu_vuc_ma: chon, ghi_chu: lyDo.trim() || undefined }),
    onSuccess: (res) => {
      onDone();
      // Xet lai ton kho theo khu vuc moi (2026-10-22): bao so don tu duyet / chuyen cho hang / giu nguyen (phieu da gui Ke toan).
      const them = [
        res?.tu_duyet?.length ? t("{n} đơn đủ hàng — tự duyệt", { n: res.tu_duyet.length }) : "",
        res?.cho_hang?.length ? t("{n} đơn thiếu hàng — chuyển chờ hàng, rời phiếu: {ds}", { n: res.cho_hang.length, ds: res.cho_hang.join(", ") }) : "",
        res?.giu_nguyen?.length ? t("{n} đơn thiếu hàng ở khu vực mới nhưng phiếu đã chốt tiền / đã gửi Kế toán — giữ nguyên: {ds}", { n: res.giu_nguyen.length, ds: res.giu_nguyen.join(", ") }) : "",
      ].filter(Boolean).join("; ");
      addToast(t("Đã chuyển khu vực: {kv}{don}", { kv: options.find((o) => o.value === chon)?.label ?? chon, don: res?.so_don ? t(" (phiếu + {n} đơn)", { n: res.so_don }) : "" }) + (them ? ` — ${them}` : ""));
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "PHIEU_DA_DONG") addToast(t("Phiếu đã đóng — không chuyển khu vực được nữa"));
      else if (code === "CONFLICT") addToast(t("Phiếu vừa được người khác cập nhật — tải lại rồi thử lại"));
      else addToast(t("Lỗi: ") + describeApiError(err));
    },
  });
  const doi = !!chon && chon !== hienTai;
  return (
    <div className="border border-[var(--line)] rounded-lg p-3">
      <SectionTitle icon="📍">{t("Khu vực")}</SectionTitle>
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={chon} onChange={setChon} options={options} className="min-w-[180px]" />
        {doi && (
          <input
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            placeholder={t("Lý do chuyển (không bắt buộc)")}
            className="focus-ring flex-1 min-w-[160px] bg-[var(--surface)] border border-[var(--ink-400)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        )}
        <Btn size="sm" onClick={() => mutation.mutate()} disabled={!doi || mutation.isPending} loading={mutation.isPending}>{t("Lưu")}</Btn>
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--ink-500)]">
        {pxk.khu_vuc_chon
          ? t("Đã chuyển từ {a} — phiếu + đơn trong phiếu chỉ hiện cho Kho/Kế toán/TN khu vực {b}.", { a: pxk.khu_vuc_tu_dong_ten ?? pxk.khu_vuc_ma ?? "?", b: pxk.khu_vuc_chon_ten ?? pxk.khu_vuc_chon })
          : t("Phiếu sai khu vực: chọn lại để chuyển cả phiếu + đơn trong phiếu sang Kho/Kế toán/TN khu vực đúng (kho xuất MISA theo miền khu vực mới).")}
      </div>
    </div>
  );
}

// Doi KHU VUC XU LY cua RIENG 1 don (2026-10-15, PATCH /dat-mua-lk/don-hang/:id/khu-vuc) - TN/Ke toan/Kho/Admin (+ TBP / Giam sat / nguoi tao
// don ho tu 2026-10-22, theo co `duoc_doi_khu_vuc` backend tra). Chi khi don chua
// dong + chua vao phieu xuat (trong phieu -> Kho doi o chi tiet phieu, ChuyenKhuVucCard). Don vao phieu sau do: phieu mang theo
// khu vuc nay. Hien inline trong KvRow "Khu vực xử lý" (chi tiet don mua/cong no + chi tiet don tra hang).
export function DoiKhuVucDon({
  don, canSua, addToast, onDone,
}: {
  don: { id: string; khu_vuc_ma?: string | null; khu_vuc_chon?: string | null; trang_thai?: string | null };
  canSua: boolean;
  addToast: (msg: string) => void;
  onDone: () => void;
}) {
  const hienTai = don.khu_vuc_chon ?? don.khu_vuc_ma ?? "";
  const [chon, setChon] = useState(hienTai);
  useEffect(() => { setChon(hienTai); }, [don.id, hienTai]);
  const { data: khuVucData } = useQuery({
    queryKey: ["settings-khu-vuc"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/settings/khu-vuc"),
  });
  const ten = (ma: string | null | undefined) => (ma ? khuVucData?.rows.find((k) => k.ma === ma)?.ten ?? ma : "—");
  const options = (khuVucData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ma === don.khu_vuc_ma ? t("{a} (theo KTV)", { a: k.ten }) : k.ten }));
  const mutation = useMutation({
    mutationFn: () => api.patch<{ tu_duyet?: boolean; cho_hang?: boolean }>(`/dat-mua-lk/don-hang/${don.id}/khu-vuc`, { khu_vuc_ma: chon }),
    onSuccess: (res) => {
      onDone();
      addToast(res?.tu_duyet
        ? t("Đã đổi khu vực xử lý đơn: {a} — kho khu vực mới đủ hàng, đơn tự duyệt và vào phiếu", { a: ten(chon) })
        : res?.cho_hang
          ? t("Đã đổi khu vực xử lý đơn: {a} — kho khu vực mới thiếu hàng, đơn chuyển chờ hàng (mở ticket cho Kho)", { a: ten(chon) })
          : t("Đã đổi khu vực xử lý đơn: {a}", { a: ten(chon) }));
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "DON_TRONG_PHIEU") addToast(t("Đơn đã vào phiếu xuất — Kho đổi khu vực ở chi tiết phiếu"));
      else if (code === "DON_DA_DONG") addToast(t("Đơn đã từ chối/hủy — không đổi khu vực được"));
      else if (code === "STATE_CHANGED") addToast(t("Đơn vừa được người khác cập nhật — tải lại rồi thử lại"));
      else addToast(t("Lỗi: ") + describeApiError(err));
    },
  });
  const dong = ["TN tu choi", "Tu choi", "Da huy"].includes(don.trang_thai ?? "");
  const nhan = (
    <span className="inline-flex items-center gap-1.5">
      <span>{ten(hienTai)}</span>
      {don.khu_vuc_chon && <Badge tone="purple"><span title={t("Khu vực theo KTV: {a}", { a: ten(don.khu_vuc_ma) })}>{t("đã đổi")}</span></Badge>}
    </span>
  );
  if (!canSua || dong) return nhan;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Select value={chon} onChange={setChon} options={options} className="min-w-[180px]" />
      <Btn size="sm" onClick={() => mutation.mutate()} disabled={!chon || chon === hienTai || mutation.isPending} loading={mutation.isPending}>{t("Lưu")}</Btn>
      {don.khu_vuc_chon && <span className="text-[11px] text-[var(--color-text-faint)]">{t("(theo KTV: {a})", { a: ten(don.khu_vuc_ma) })}</span>}
    </span>
  );
}
