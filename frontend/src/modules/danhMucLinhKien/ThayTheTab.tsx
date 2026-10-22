import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/x/Badge";
import { Money } from "../../components/ui/Money";
import { useToast } from "../../components/ui/Toast";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { coQuyenSuaThayThe } from "../../lib/quyenThayThe";
import { fmtVND, fmtDateTime } from "../../types";
import { khopTim } from "../../lib/boDau";
import { usePersonDirectory, formatPersonDisplay } from "../../lib/personDisplay";
import { LinhKienPicker } from "../datMuaLinhKien/LinhKienPicker";
import { describeApiError, formatLkLabel, useLkAndLdeCache } from "../datMuaLinhKien/helpers";

// Tab "Linh kiện thay thế" cua Bang gia (chot 2026-10-19, migration 0092 - "chuyển hẳn sang app, xây dựng chức năng thêm, bớt chỉnh sửa
// đầy đủ cho người dùng trên app (cho người có quyền chỉnh sửa linh kiện)"). Truoc day tab doc Google Sheet cong khai tren trinh duyet;
// nay doc/ghi bang lk_nhom_thay_the (backend routes/lkSettings.ts) - CUNG nguon voi goi y luc tao don (ThayTheGoiY, chung queryKey
// "lk-nhom-thay-the"), drawer LK "Liên quan" va API doi tac /v1/lk-thay-the. Ghi = Quan ly danh muc LK / Mua hang / Admin (backend suaThayThe).
// Ma nhap tu Sheet chua co trong danh muc van giu (nhan "Chưa có trong danh mục"), ma them moi chon tu danh muc.

export interface ThanhVienThayThe {
  ma_lk: string;
  ten_lk: string | null;
  ghi_chu: string | null;
  stt: number;
  co_trong_danh_muc: number;
  bat_tat: number | null;
  trang_thai_ma: string | null;
  ma_chuan: string | null;
  gia_ban: number | null;
}
export interface NhomThayTheRow {
  id: number;
  ten_nhom: string;
  ghi_chu: string | null;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
  thanh_vien: ThanhVienThayThe[];
  ma_lk_list: string[];
}

export function ThayTheTab() {
  const auth = useAuth();
  const u = auth.status === "authenticated" ? auth.user : null;
  const canWrite = coQuyenSuaThayThe(u);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lk-nhom-thay-the"],
    queryFn: () => api.get<{ rows: NhomThayTheRow[] }>("/lk-settings/nhom-thay-the"),
  });
  const { danhMuc } = useLkAndLdeCache(canWrite);
  const personDir = usePersonDirectory();
  const addToast = useToast();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [sua, setSua] = useState<NhomThayTheRow | "moi" | null>(null);
  const [xoa, setXoa] = useState<NhomThayTheRow | null>(null);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const q = query.trim();
    if (!q) return all;
    return all.filter((n) =>
      khopTim(`${n.ten_nhom} ${n.ghi_chu ?? ""} ${n.thanh_vien.map((t) => `${t.ma_lk} ${t.ten_lk ?? ""} ${t.ghi_chu ?? ""}`).join(" ")}`, q),
    );
  }, [data, query]);

  const lamMoi = () => {
    void qc.invalidateQueries({ queryKey: ["lk-nhom-thay-the"] });
    void qc.invalidateQueries({ queryKey: ["lk-thay-the"] });
  };
  const xoaMut = useMutation({
    mutationFn: (n: NhomThayTheRow) => api.delete(`/lk-settings/nhom-thay-the/${n.id}`),
    onSuccess: () => {
      addToast("Đã xoá nhóm thay thế");
      setXoa(null);
      lamMoi();
    },
    onError: (e) => addToast("Lỗi: " + describeApiError(e)),
  });

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nhập mã/tên linh kiện, hoặc tên nhóm..."
          className="focus-ring w-full max-w-lg bg-white border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        <span className="text-xs text-[var(--color-text-secondary)]">
          {rows.length}/{data?.rows.length ?? 0} nhóm
        </span>
        {canWrite && (
          <Btn variant="primary" size="sm" className="ml-auto" onClick={() => setSua("moi")}>
            ＋ Thêm nhóm
          </Btn>
        )}
      </div>
      <div className="text-[12px] text-[var(--color-text-secondary)] mb-3">
        Các mã trong cùng 1 nhóm dùng thay thế cho nhau được khi thiếu hàng — hiện thành gợi ý "Có thể thay thế bằng" lúc tạo đơn.
      </div>

      {isLoading && <div className="text-sm text-[var(--color-text-secondary)] py-6 text-center">Đang tải…</div>}
      {isError && (
        <div className="text-sm text-[var(--color-danger)] py-6 text-center">
          Không tải được danh sách nhóm. <button type="button" className="underline" onClick={() => void refetch()}>Thử lại</button>
        </div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="text-sm text-[var(--color-text-secondary)] py-6 text-center">
          {query.trim() ? "Không tìm thấy nhóm linh kiện phù hợp." : "Chưa có nhóm linh kiện thay thế nào."}
        </div>
      )}

      <div className="space-y-4">
        {rows.map((n) => {
          const chuaCo = n.thanh_vien.filter((t) => !t.co_trong_danh_muc).length;
          return (
            <div key={n.id} className="border border-[var(--color-border)] rounded-xl overflow-hidden bg-white">
              <div className="bg-[var(--color-surface-hover)] px-3 py-2 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[var(--color-text)]">{n.ten_nhom}</span>
                <span className="text-xs text-[var(--color-text-secondary)]">({n.thanh_vien.length} mã có thể thay thế cho nhau)</span>
                {chuaCo > 0 && <Badge tone="warning">{chuaCo} mã chưa có trong danh mục</Badge>}
                <span className="ml-auto text-[11px] text-[var(--color-text-secondary)]">
                  {fmtDateTime(n.ngay_cap_nhat)}
                  {n.nguoi_cap_nhat ? ` · ${formatPersonDisplay(n.nguoi_cap_nhat, personDir)}` : " · nhập từ Google Sheet"}
                </span>
                {canWrite && (
                  <span className="flex gap-1">
                    <Btn size="sm" variant="ghost" onClick={() => setSua(n)}>Sửa</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setXoa(n)}>Xoá</Btn>
                  </span>
                )}
              </div>
              {n.ghi_chu && <div className="px-3 py-1.5 text-[12.5px] text-[var(--color-text-body)] border-b border-[var(--color-border)]">{n.ghi_chu}</div>}
              <div className="overflow-x-auto">
                <table className="tbl w-full">
                  <thead>
                    <tr className="tbl-head">
                      <th className="px-3 py-1.5 font-medium">Mã</th>
                      <th className="px-3 py-1.5 font-medium">Tên</th>
                      <th className="px-3 py-1.5 font-medium text-right">Giá NY</th>
                      <th className="px-3 py-1.5 font-medium">Ghi chú</th>
                      <th className="px-3 py-1.5 font-medium">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {n.thanh_vien.map((t) => (
                      <tr key={t.ma_lk} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="px-3 py-1.5 font-mono text-xs">{t.ma_lk}</td>
                        <td className="px-3 py-1.5 max-w-[360px] truncate" title={t.ten_lk ?? ""}>{t.ten_lk ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{t.gia_ban != null ? <Money>{fmtVND(t.gia_ban)}</Money> : "—"}</td>
                        <td className="px-3 py-1.5 text-xs text-[var(--color-text-body)] max-w-[320px] truncate" title={t.ghi_chu ?? ""}>{t.ghi_chu || "—"}</td>
                        <td className="px-3 py-1.5"><TrangThaiThanhVien t={t} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {sua && (
        <NhomThayTheModal
          nhom={sua === "moi" ? null : sua}
          danhMuc={danhMuc}
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
          title="Xoá nhóm thay thế"
          onClose={() => setXoa(null)}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setXoa(null)}>Huỷ</Btn>
              <Btn variant="danger" disabled={xoaMut.isPending} onClick={() => xoaMut.mutate(xoa)}>Xoá nhóm</Btn>
            </>
          }
        >
          <div className="text-sm">
            Xoá hẳn nhóm <b>{xoa.ten_nhom}</b> ({xoa.thanh_vien.length} mã)? Các linh kiện và đơn hàng không bị ảnh hưởng — chỉ mất gợi ý thay
            thế giữa các mã này.
          </div>
        </Modal>
      )}
    </div>
  );
}

function TrangThaiThanhVien({ t }: { t: ThanhVienThayThe }) {
  if (!t.co_trong_danh_muc) return <Badge tone="warning">Chưa có trong danh mục</Badge>;
  if (t.trang_thai_ma === "Da doi ma") return <Badge tone="info">Đã đổi mã{t.ma_chuan ? ` → ${t.ma_chuan}` : ""}</Badge>;
  if (!t.bat_tat) return <Badge tone="neutral">Đang tắt</Badge>;
  return <span className="text-xs text-[var(--color-text-secondary)]">—</span>;
}

// Dong soan trong modal: `co` = thanh vien da co trong nhom (hien co dinh, chi sua ghi chu / bo ra); dong moi chon ma tu danh muc.
interface DongSoan {
  key: number;
  ma_lk: string;
  ghi_chu: string;
  co: ThanhVienThayThe | null;
}

function NhomThayTheModal({
  nhom, danhMuc, onClose, onSaved,
}: {
  nhom: NhomThayTheRow | null;
  danhMuc: ReturnType<typeof useLkAndLdeCache>["danhMuc"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const addToast = useToast();
  const [ten, setTen] = useState(nhom?.ten_nhom ?? "");
  const [ghiChu, setGhiChu] = useState(nhom?.ghi_chu ?? "");
  const [dong, setDong] = useState<DongSoan[]>(() =>
    nhom
      ? nhom.thanh_vien.map((t, i) => ({ key: i, ma_lk: t.ma_lk, ghi_chu: t.ghi_chu ?? "", co: t }))
      : [{ key: 0, ma_lk: "", ghi_chu: "", co: null }, { key: 1, ma_lk: "", ghi_chu: "", co: null }],
  );
  const [keyTiep, setKeyTiep] = useState(1000);
  const dongHopLe = dong.filter((d) => d.ma_lk.trim());
  const trung = new Set(dongHopLe.map((d) => d.ma_lk.trim())).size !== dongHopLe.length;
  const duLieu = !!ten.trim() && dongHopLe.length >= 2 && !trung;

  const luu = useMutation({
    mutationFn: () => {
      const body = {
        ten_nhom: ten.trim(),
        ghi_chu: ghiChu.trim() || null,
        thanh_vien: dongHopLe.map((d) => ({ ma_lk: d.ma_lk.trim(), ghi_chu: d.ghi_chu.trim() || null })),
      };
      return nhom ? api.patch(`/lk-settings/nhom-thay-the/${nhom.id}`, body) : api.post("/lk-settings/nhom-thay-the", body);
    },
    onSuccess: () => {
      addToast(nhom ? "Đã lưu nhóm thay thế" : "Đã tạo nhóm thay thế");
      onSaved();
    },
    onError: (e) => {
      const ma = (e as { body?: { ma?: string[] } })?.body?.ma;
      addToast("Không lưu được: " + describeApiError(e) + (ma?.length ? ` (${ma.join(", ")})` : ""));
    },
  });

  const suaDong = (key: number, patch: Partial<DongSoan>) => setDong((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const themDong = () => {
    setDong((prev) => [...prev, { key: keyTiep, ma_lk: "", ghi_chu: "", co: null }]);
    setKeyTiep((k) => k + 1);
  };

  return (
    <Modal
      open
      title={nhom ? "Sửa nhóm thay thế" : "Thêm nhóm thay thế"}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Huỷ</Btn>
          <Btn variant="primary" disabled={!duLieu || luu.isPending} onClick={() => luu.mutate()}>{luu.isPending ? "Đang lưu…" : "Lưu nhóm"}</Btn>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Tên nhóm *</span>
            <input
              value={ten}
              onChange={(e) => setTen(e.target.value)}
              placeholder="VD: Bơm đẩy 24V 8369"
              className="focus-ring w-full bg-white border border-[var(--color-border)] rounded-lg px-2.5 py-1.5"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Ghi chú nhóm</span>
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lưu ý chung khi thay thế (không bắt buộc)"
              className="focus-ring w-full bg-white border border-[var(--color-border)] rounded-lg px-2.5 py-1.5"
            />
          </label>
        </div>
        <div>
          <div className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Các mã thay thế cho nhau * (ít nhất 2 mã)</div>
          <div className="space-y-2">
            {dong.map((d, i) => (
              <div key={d.key} className="flex items-start gap-2">
                <span className="w-5 pt-2 text-xs text-[var(--color-text-secondary)] text-right shrink-0">{i + 1}.</span>
                {d.co ? (
                  <div className="flex-1 min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-2.5 py-1.5">
                    <div className="truncate" title={d.co.ten_lk ?? ""}>
                      <span className="font-mono text-xs">{d.co.ma_lk}</span> · {d.co.ten_lk ?? "—"}
                    </div>
                    {!d.co.co_trong_danh_muc && <div className="text-[11px] text-[var(--color-warning-strong)]">Chưa có trong danh mục — giữ lại từ dữ liệu cũ</div>}
                  </div>
                ) : (
                  <LinhKienPicker className="flex-1 min-w-0" value={d.ma_lk} onChange={(v) => suaDong(d.key, { ma_lk: v })} options={danhMuc} ghiLichSu={false} />
                )}
                <input
                  value={d.ghi_chu}
                  onChange={(e) => suaDong(d.key, { ghi_chu: e.target.value })}
                  placeholder="Ghi chú mã này"
                  className="focus-ring w-44 sm:w-56 shrink-0 bg-white border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[13px]"
                />
                <Btn size="sm" variant="ghost" title="Bỏ mã này khỏi nhóm" onClick={() => setDong((prev) => prev.filter((x) => x.key !== d.key))}>✕</Btn>
              </div>
            ))}
          </div>
          {trung && <div className="mt-1 text-xs text-[var(--color-danger)]">Có mã bị chọn 2 lần trong nhóm.</div>}
          {dongHopLe.length < 2 && <div className="mt-1 text-xs text-[var(--color-text-secondary)]">Nhóm cần ít nhất 2 mã.</div>}
          <Btn size="sm" variant="ghost" className="mt-2" onClick={themDong}>＋ Thêm mã</Btn>
        </div>
        {nhom && (
          <div className="text-[11.5px] text-[var(--color-text-secondary)]">
            Mã mới chỉ chọn được trong danh mục linh kiện. Mã đã đổi sang mã khác được tự quy về mã mới khi lưu.
          </div>
        )}
        {dongHopLe.length > 0 && (
          <div className="text-[11.5px] text-[var(--color-text-secondary)] truncate">
            Xem trước: {dongHopLe.map((d) => formatLkLabel(d.ma_lk, d.co?.ten_lk ?? danhMuc.find((r) => r.ma_linh_kien === d.ma_lk)?.ten_linh_kien ?? d.ma_lk)).join(" ↔ ")}
          </div>
        )}
      </div>
    </Modal>
  );
}
