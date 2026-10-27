import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DropdownPortal } from "../../components/ui/DropdownPortal";
import { Btn } from "../../components/ui/Btn";
import { Money } from "../../components/ui/Money";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { ToDam } from "../../components/ui/ToDam";
import { useToast } from "../../components/ui/Toast";
import { api, ApiError } from "../../api/client";
import { fmtVND, type LinhKienRow } from "../../types";
import type { ToDamSpec } from "../../lib/timLinhKien";
import { useLkTuKhoa } from "../../lib/useTimLinhKien";
import { LinhKienThumbMini } from "../datMuaLinhKien/LinhKienPicker";

// O tim Bang gia co goi y xo xuong (2026-10-04, bo tim tren may lib/timLinhKien.ts): go -> 8 ket qua sat nhat (to dam phan
// khop), mui ten len/xuong + Enter mo chi tiet; o trong -> tu khoa da tim gan day (luu tren may). Khong co ket qua -> "Có phải
// bạn muốn tìm …". Danh sach/bang ben duoi van loc theo cung tu khoa (nguoi goi truyen ket qua da sap xep).
export function TimLkBox({
  value, onChange, ketQua, tong, toDam, goiY, timGanDay, onChonMa, onGhiTim, onXoaTim,
}: {
  value: string;
  onChange: (v: string) => void;
  ketQua: LinhKienRow[];
  tong: number;
  toDam: ToDamSpec | null;
  goiY: string | null;
  timGanDay: string[];
  onChonMa: (ma: string) => void;
  onGhiTim: (q: string) => void;
  onXoaTim: () => void;
}) {
  const [mo, setMo] = useState(false);
  const [chon, setChon] = useState(-1);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const q = value.trim();
  const goiYList = q ? ketQua.slice(0, 8) : [];
  useEffect(() => setChon(-1), [q]);

  const dong = () => {
    setMo(false);
    setChon(-1);
  };
  const xemChiTiet = (ma: string) => {
    onGhiTim(q);
    onChonMa(ma);
    dong();
  };
  const xemTatCa = () => {
    onGhiTim(q);
    dong();
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMo(true);
      setChon((i) => Math.min(i + 1, goiYList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setChon((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (chon >= 0 && goiYList[chon]) xemChiTiet(goiYList[chon].ma_linh_kien);
      else xemTatCa();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      dong();
    }
  }

  const hienRong = !q && timGanDay.length > 0;
  return (
    <div ref={anchorRef} className="relative w-full sm:w-80">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setMo(true);
        }}
        onFocus={() => setMo(true)}
        onBlur={dong}
        onKeyDown={onKeyDown}
        placeholder="Tìm mã/tên, vd: lõi ro, bơm 24, cpf1102…"
        // 16px tren dien thoai - tranh iOS tu phong to khi cham vao o.
        className="o-tim focus-ring w-full bg-white border border-[var(--line)] rounded-lg pl-2.5 pr-8 py-1.5 text-base sm:text-sm"
      />
      {value && (
        <button
          type="button"
          aria-label="Xóa tìm kiếm"
          onMouseDown={(e) => {
            e.preventDefault();
            onChange("");
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-[var(--ink-400)] hover:text-[var(--ink-700)] hover:bg-[var(--surface-100)]"
        >
          ✕
        </button>
      )}
      <DropdownPortal anchorRef={anchorRef} contentRef={dropRef} open={mo && (hienRong || !!q)} maxHeight={420} minWidth={Math.min(520, window.innerWidth - 16)} className="rounded-lg py-1">
        {hienRong ? (
          <div>
            <div className="flex items-center justify-between px-3 pt-1.5 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-400)]">🕘 Tìm gần đây</span>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onXoaTim();
                }}
                className="text-[11px] text-[var(--color-link)] hover:underline"
              >
                Xóa lịch sử
              </button>
            </div>
            {timGanDay.map((t) => (
              <button
                key={t}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(t);
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--surface-100)]"
              >
                🔍 {t}
              </button>
            ))}
          </div>
        ) : goiYList.length === 0 ? (
          <div className="px-3 py-2 text-xs text-[var(--ink-400)]">
            <span className="italic">Không tìm thấy.</span>
            {goiY && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(goiY);
                }}
                className="ml-1 text-[var(--color-link)] hover:underline"
              >
                Có phải bạn muốn tìm “<b>{goiY}</b>”?
              </button>
            )}
          </div>
        ) : (
          <>
            {goiYList.map((p, i) => (
              <button
                key={p.ma_linh_kien}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  xemChiTiet(p.ma_linh_kien);
                }}
                onMouseEnter={() => setChon(i)}
                className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-sm ${i === chon ? "bg-[var(--ocean-100)]/60" : "hover:bg-[var(--surface-100)]"}`}
              >
                <LinhKienThumbMini url={p.anh_demo ?? null} />
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium text-[var(--ocean-800)]"><ToDam text={p.ten_linh_kien} spec={toDam} /></span>
                  <span className="block truncate font-mono text-[11px] text-[var(--ink-500)]"><ToDam text={p.ma_linh_kien} spec={toDam} /></span>
                </span>
                {p.gia_ban != null && (
                  <span className="shrink-0 text-[11px] text-[var(--green-700)] font-mono font-semibold"><Money>{fmtVND(p.gia_ban)}</Money></span>
                )}
              </button>
            ))}
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                xemTatCa();
              }}
              className="w-full px-3 py-1.5 mt-1 text-center text-[11px] text-[var(--color-link)] border-t border-[var(--line)] hover:bg-[var(--surface-100)]"
            >
              Xem tất cả {tong} kết quả trong bảng ↵
            </button>
          </>
        )}
      </DropdownPortal>
    </div>
  );
}

// ---------- Tu khoa phu cua 1 linh kien (drawer chi tiet) ----------

export function TuKhoaLkSection({ ma, canSua }: { ma: string; canSua: boolean }) {
  const addToast = useToast();
  const qc = useQueryClient();
  const { data } = useLkTuKhoa();
  const hienTai = data?.tu_khoa.find((r) => r.ma_linh_kien === ma)?.tu_khoa ?? "";
  const [sua, setSua] = useState<string | null>(null);
  useEffect(() => setSua(null), [ma]);
  const luu = useMutation({
    mutationFn: (tu_khoa: string) => api.put(`/lk-settings/tu-khoa/${encodeURIComponent(ma)}`, { tu_khoa }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["lk-tu-khoa"] });
      setSua(null);
      addToast("Đã lưu từ khóa tìm kiếm");
    },
    onError: (e) => addToast("Lỗi: " + (e instanceof ApiError ? e.message : String(e))),
  });
  if (!canSua && !hienTai) return null;
  return (
    <div>
      <SectionTitle>Từ khóa tìm kiếm</SectionTitle>
      {sua === null ? (
        <div className="flex items-start gap-2">
          <div className="flex-1 text-sm text-[var(--ink-700)] rounded-xl bg-[var(--surface-100)] px-3.5 py-2.5 min-h-[2.5rem]">
            {hienTai || <span className="text-[var(--ink-400)]">Chưa có — thêm tên cũ / tên gọi thường dùng để dễ tìm.</span>}
          </div>
          {canSua && (
            <Btn variant="ghost" size="sm" onClick={() => setSua(hienTai)}>
              Sửa
            </Btn>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            autoFocus
            value={sua}
            onChange={(e) => setSua(e.target.value)}
            placeholder="vd: lõi số 4, màng 100gpd, lõi RO karofi"
            className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-base sm:text-sm"
          />
          <div className="text-[11px] text-[var(--ink-400)]">Các từ cách nhau dấu phẩy. Gõ bất kỳ từ nào ở ô tìm cũng ra linh kiện này.</div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" size="sm" onClick={() => setSua(null)}>
              Hủy
            </Btn>
            <Btn size="sm" loading={luu.isPending} onClick={() => luu.mutate(sua)}>
              Lưu
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Tab "Từ khóa tìm kiếm" - nhom tu dong nghia ----------

export function DongNghiaTab({ canSua }: { canSua: boolean }) {
  const addToast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useLkTuKhoa();
  const [moi, setMoi] = useState("");
  const [dangSua, setDangSua] = useState<{ id: number; nhom: string } | null>(null);
  const lamMoi = () => qc.invalidateQueries({ queryKey: ["lk-tu-khoa"] });
  const loi = (e: unknown) =>
    addToast(e instanceof ApiError && e.message.includes("NHOM_IT_NHAT_2_TU") ? "Nhóm cần ít nhất 2 từ, cách nhau dấu phẩy" : "Lỗi: " + String(e));
  const them = useMutation({
    mutationFn: () => api.post("/lk-settings/dong-nghia", { nhom: moi }),
    onSuccess: async () => {
      setMoi("");
      await lamMoi();
    },
    onError: loi,
  });
  const luu = useMutation({
    mutationFn: (x: { id: number; nhom: string }) => api.patch(`/lk-settings/dong-nghia/${x.id}`, { nhom: x.nhom }),
    onSuccess: async () => {
      setDangSua(null);
      await lamMoi();
    },
    onError: loi,
  });
  const xoa = useMutation({
    mutationFn: (id: number) => api.delete(`/lk-settings/dong-nghia/${id}`),
    onSuccess: lamMoi,
    onError: loi,
  });
  const soTuKhoaLk = data?.tu_khoa.length ?? 0;

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="text-sm text-[var(--color-text-secondary)] space-y-1">
        <div>
          <b>Từ đồng nghĩa</b>: gõ 1 từ trong nhóm, ô tìm (Bảng giá + chọn linh kiện lúc tạo đơn) ra cả linh kiện có các từ còn lại — vd
          gõ “board” ra “Bo mạch…”.
        </div>
        <div>
          Từ khóa riêng cho từng linh kiện: mở chi tiết linh kiện › “Từ khóa tìm kiếm” (đang có {soTuKhoaLk} linh kiện có từ khóa).
          Mọi tìm kiếm chạy trên máy người dùng, không tốn lượt đọc server.
        </div>
      </div>
      {canSua && (
        <div className="flex gap-2">
          <input
            value={moi}
            onChange={(e) => setMoi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && moi.trim()) them.mutate();
            }}
            placeholder="Nhóm mới, vd: bơm, pump, máy bơm"
            className="focus-ring flex-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-base sm:text-sm"
          />
          <Btn size="sm" disabled={!moi.trim()} loading={them.isPending} onClick={() => them.mutate()}>
            + Thêm nhóm
          </Btn>
        </div>
      )}
      <div className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-xl bg-[var(--surface)]">
        {isLoading && <div className="px-3 py-3 text-sm text-[var(--ink-400)]">Đang tải…</div>}
        {!isLoading && (data?.dong_nghia ?? []).length === 0 && <div className="px-3 py-3 text-sm text-[var(--ink-400)]">Chưa có nhóm nào.</div>}
        {(data?.dong_nghia ?? []).map((r) => (
          <div key={r.id} className="flex items-center gap-2 px-3 py-2">
            {dangSua?.id === r.id ? (
              <>
                <input
                  autoFocus
                  value={dangSua.nhom}
                  onChange={(e) => setDangSua({ id: r.id, nhom: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") luu.mutate(dangSua);
                    if (e.key === "Escape") setDangSua(null);
                  }}
                  className="focus-ring flex-1 border border-[var(--line)] rounded-lg px-2.5 py-1 text-base sm:text-sm"
                />
                <Btn size="sm" loading={luu.isPending} onClick={() => luu.mutate(dangSua)}>
                  Lưu
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => setDangSua(null)}>
                  Hủy
                </Btn>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0 flex flex-wrap gap-1">
                  {r.nhom.split(",").map((t) => (
                    <span key={t} className="rounded-full bg-[var(--surface-100)] px-2 py-0.5 text-xs text-[var(--ink-700)]">
                      {t.trim()}
                    </span>
                  ))}
                </div>
                {canSua && (
                  <>
                    <button className="text-xs text-[var(--color-link)] hover:underline" onClick={() => setDangSua({ id: r.id, nhom: r.nhom })}>
                      Sửa
                    </button>
                    <button
                      className="text-xs text-[var(--color-danger)] hover:underline"
                      onClick={() => {
                        if (window.confirm(`Xóa nhóm “${r.nhom}”?`)) xoa.mutate(r.id);
                      }}
                    >
                      Xóa
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
