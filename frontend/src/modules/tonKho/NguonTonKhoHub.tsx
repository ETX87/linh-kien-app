import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";

// Nguon ton kho (2026-10-30, backend lib/hubMisa.ts): app "Phan tich ton kho 3T" la KHO DU LIEU MISA GOC - Ke toan nhap file 1
// lan o do, app nay keo ve. 3 che do: file (nhu cu) | hub_thu (chay song song, keo vao bang bong de doi chieu) | hub.
export type NguonTonKho = "file" | "hub_thu" | "hub";
interface TrangThai {
  nguon: NguonTonKho;
  da_cau_hinh: boolean;
  hub: { phien_ban: string | null; ky_tu_ngay?: string; ky_den_ngay?: string; so_dong?: number; ten_file?: string | null; loi?: string } | null;
  lan_keo: { trang_thai: string; phien_ban?: string; so_dong?: number; che_do?: string; chua_khop?: number; loi?: string; luc: string } | null;
  ton_hien_tai: { updated_by: string; updated_at: string; nguon?: string; so_dong?: number } | null;
  doi_chieu: { tong: { dong_that: number; dong_bong: number; tong_that: number; tong_bong: number }; lech: { ma_kho: string; ma_hang: string; that: number | null; bong: number | null }[] } | null;
}

const NHAN: Record<NguonTonKho, string> = {
  file: "Nhập file tại đây (như cũ)",
  hub_thu: "Chạy song song — kéo từ app Phân tích tồn kho vào bảng đối chiếu",
  hub: "App Phân tích tồn kho (Kế toán nhập file bên đó)",
};
const TRANG_THAI_KEO: Record<string, string> = {
  xong: "đã kéo xong", khong_doi: "không có phiên mới", loi: "lỗi", phien_doi_giua_chung: "phiên đổi giữa chừng — sẽ kéo lại",
  chua_cau_hinh: "chưa cấu hình khoá", hub_chua_co_du_lieu: "bên đó chưa có dữ liệu", dang_keo: "đang kéo",
};
const so = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));

export function useNguonTonKho(bat: boolean) {
  return useQuery({ queryKey: ["hub-misa-trang-thai"], queryFn: () => api.get<TrangThai>("/hub-misa/trang-thai"), enabled: bat, staleTime: 30_000 });
}

export function NguonTonKhoHub({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const q = useNguonTonKho(true);
  const lamMoi = () => qc.invalidateQueries({ queryKey: ["hub-misa-trang-thai"] });
  const doiNguon = useMutation({ mutationFn: (nguon: NguonTonKho) => api.put("/hub-misa/nguon", { nguon }), onSuccess: lamMoi });
  const keo = useMutation({
    mutationFn: () => api.post<{ trang_thai: string; so_dong?: number; loi?: string }>("/hub-misa/keo-ngay", {}),
    onSuccess: (r) => {
      addToast(`Kéo tồn kho: ${TRANG_THAI_KEO[r.trang_thai] ?? r.trang_thai}${r.so_dong ? ` (${r.so_dong} dòng)` : ""}${r.loi ? ` — ${r.loi}` : ""}`);
      lamMoi();
      qc.invalidateQueries({ queryKey: ["ktv-ton-kho"] });
      qc.invalidateQueries({ queryKey: ["ktv-ton-kho-meta"] });
    },
  });
  const d = q.data;
  if (!d) return null;
  const lk = d.lan_keo;
  const dc = d.doi_chieu;
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <b>Nguồn tồn kho:</b>
        <Badge tone={d.nguon === "hub" ? "teal" : d.nguon === "hub_thu" ? "amber" : "gray"}>{NHAN[d.nguon]}</Badge>
        {isAdmin && (
          <select
            className="focus-ring border border-[var(--line)] rounded-lg px-2 py-1 text-xs ml-auto"
            value={d.nguon}
            disabled={doiNguon.isPending}
            onChange={(e) => {
              const v = e.target.value as NguonTonKho;
              if (confirm(`Đổi nguồn tồn kho thành: ${NHAN[v]}?`)) doiNguon.mutate(v);
            }}
          >
            {(Object.keys(NHAN) as NguonTonKho[]).map((k) => (
              <option key={k} value={k}>
                {NHAN[k]}
              </option>
            ))}
          </select>
        )}
      </div>
      {d.nguon !== "file" && (
        <>
          {!d.da_cau_hinh ? (
            <div className="text-[var(--coral-600)]">Chưa cấu hình kết nối (secret HUB_API_KEY + Service Binding HUB_SERVICE) — chưa kéo được.</div>
          ) : (
            <div className="text-[var(--ink-600)]">
              Bên app Phân tích tồn kho: phiên <b>{d.hub?.phien_ban ?? "chưa có"}</b>
              {d.hub?.ten_file ? ` (${d.hub.ten_file})` : ""}
              {d.hub?.loi ? <span className="text-[var(--coral-600)]"> — lỗi: {d.hub.loi}</span> : null}
              {lk && (
                <>
                  {" "}· Lần kéo cuối {lk.luc}: <b>{TRANG_THAI_KEO[lk.trang_thai] ?? lk.trang_thai}</b>
                  {lk.phien_ban && lk.phien_ban !== d.hub?.phien_ban ? <span className="text-[var(--amber-600)]"> (phiên {lk.phien_ban})</span> : null}
                  {lk.so_dong ? ` · ${lk.so_dong} dòng` : ""}
                  {lk.chua_khop ? ` · ${lk.chua_khop} mã kho chưa khớp` : ""}
                  {lk.loi ? <span className="text-[var(--coral-600)]"> — {lk.loi}</span> : null}
                </>
              )}
            </div>
          )}
          {d.ton_hien_tai && (
            <div className="text-xs text-[var(--ink-400)]">
              Tồn kho đang dùng cho đơn hàng: mốc {d.ton_hien_tai.updated_at} · {d.ton_hien_tai.nguon === "hub" ? "kéo từ app Phân tích tồn kho" : `file nhập bởi ${d.ton_hien_tai.updated_by ?? "—"}`}
            </div>
          )}
          {dc && (
            <div className={`rounded-lg px-3 py-2 ${dc.lech.length ? "bg-[var(--amber-100)]" : "bg-[var(--teal-100)]"}`}>
              <b>Đối chiếu (bảng kéo về so với file nhập tại đây):</b> {dc.lech.length ? `${dc.lech.length}${dc.lech.length >= 200 ? "+" : ""} dòng lệch` : "✓ khớp hoàn toàn"}
              <span className="text-xs text-[var(--ink-600)]">
                {" "}· dòng {so(dc.tong.dong_that)} / {so(dc.tong.dong_bong)} · tổng cuối kỳ {so(dc.tong.tong_that)} / {so(dc.tong.tong_bong)}
              </span>
              {dc.lech.length > 0 && (
                <div className="mt-1 max-h-40 overflow-auto text-xs">
                  {dc.lech.slice(0, 50).map((x) => (
                    <div key={x.ma_kho + x.ma_hang} className="font-mono">
                      {x.ma_kho} · {x.ma_hang}: file {so(x.that)} / kéo về {so(x.bong)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <Btn size="sm" variant="ghost" loading={keo.isPending} disabled={!d.da_cau_hinh} onClick={() => keo.mutate()}>
              ⟳ Kéo ngay
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}
