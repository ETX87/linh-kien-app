import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Btn } from "../components/ui/Btn";
import { Modal } from "../components/ui/Modal";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { Badge } from "../components/x/Badge";
import { useToast } from "../components/ui/Toast";
import { fmtDate, fmtDateTime } from "../types";
import { khopTim } from "../lib/boDau";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";
import { LinhKienPicker } from "./datMuaLinhKien/LinhKienPicker";
import { describeApiError, formatLkLabel, useLkAndLdeCache } from "./datMuaLinhKien/helpers";

// Tab "Công nợ 0 đồng" (2026-10-05, migration 0069) - Ke toan/Admin khai bao chuong trinh ho tro: ma LK + SL ho tro (cho MOI
// KTV ap dung) + khoang ngay + KTV ap dung (1 / nhieu / toan bo, loc nhanh theo Khu vuc). Trong khoang ngay, KTV co ton LK do thi
// MIN(ton, SL ho tro) chiec tinh cong no = 0 - backend tinh truc tiep moi lan doc (SL_HO_TRO_0D_SQL o backend/src/lib/congNoKtv.ts)
// nen bat/tat/sua la cot "Công nợ thực tế" cua tab Tồn kho KTV doi ngay.

interface CongNo0dRow {
  id: number;
  ten: string | null;
  tu_ngay: string;
  den_ngay: string;
  tat_ca_ktv: number;
  bat_tat: number;
  hom_nay: string;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string | null;
  // tu_khoa_id != null = dong do tu khoa tu lap (migration 0079); bat_tat = 0 = ma bi tat (khop sai).
  lk: { ma_linh_kien: string; so_luong: number; ten_linh_kien: string | null; gia_tri_cong_no: number | null; tu_khoa_id: number | null; bat_tat: number }[];
  ktv: { ma_ktv: string; ten_hien_thi: string | null; khu_vuc_ma: string | null }[];
  tu_khoa: { id: number; tu_khoa: string; khop_ten: number; so_luong: number }[];
}
interface TuKhoaSoan { tu_khoa: string; so_luong: number; khop_ten: boolean }
interface LkKhopRow { ma_linh_kien: string; ten_linh_kien: string | null; gia_tri_cong_no: number | null; bat_tat: number; khop_ma: number }
interface KtvOption {
  ma_ktv: string;
  ten_hien_thi: string | null;
  ma_misa?: string | null;
  ten_misa: string | null;
  khu_vuc_ma: string | null;
  ngung_hoat_dong: number;
}
interface DongSoan { ma_lk: string; so_luong: number }

const QK = ["cong-no-0d"];

function trangThai(r: CongNo0dRow): { label: string; tone: "success" | "neutral" | "warning" | "info" } {
  if (!r.bat_tat) return { label: "Đang tắt", tone: "neutral" };
  if (r.hom_nay < r.tu_ngay) return { label: "Chưa tới ngày", tone: "info" };
  if (r.hom_nay > r.den_ngay) return { label: "Hết hạn", tone: "warning" };
  return { label: "Đang áp dụng", tone: "success" };
}

export function CongNo0dTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const personDir = usePersonDirectory();
  const { data, isLoading } = useQuery({ queryKey: QK, queryFn: () => api.get<{ rows: CongNo0dRow[] }>("/settings/ktv-ton-kho/cong-no-0d") });
  const [query, setQuery] = useState("");
  const [sua, setSua] = useState<CongNo0dRow | "moi" | null>(null);
  const [xoa, setXoa] = useState<CongNo0dRow | null>(null);

  const lamMoi = () => {
    void qc.invalidateQueries({ queryKey: QK });
    // Cong no thuc te tinh lai ngay khi doc - lam moi bang cong no + chi tiet.
    void qc.invalidateQueries({ queryKey: ["ktv-ton-kho"] });
    void qc.invalidateQueries({ queryKey: ["ktv-ton-kho-chi-tiet"] });
  };
  const batTat = useMutation({
    mutationFn: (r: CongNo0dRow) => api.patch(`/settings/ktv-ton-kho/cong-no-0d/${r.id}`, { bat_tat: !r.bat_tat }),
    onSuccess: lamMoi,
    onError: (e) => addToast("Lỗi: " + describeApiError(e)),
  });
  const xoaMut = useMutation({
    mutationFn: (r: CongNo0dRow) => api.delete(`/settings/ktv-ton-kho/cong-no-0d/${r.id}`),
    onSuccess: () => {
      addToast("Đã xoá chương trình");
      setXoa(null);
      lamMoi();
    },
    onError: (e) => addToast("Lỗi: " + describeApiError(e)),
  });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const q = query.trim();
    if (!q) return all;
    return all.filter((r) =>
      khopTim(
        `${r.ten ?? ""} ${r.lk.map((l) => `${l.ma_linh_kien} ${l.ten_linh_kien ?? ""}`).join(" ")} ${r.ktv.map((k) => `${k.ma_ktv} ${k.ten_hien_thi ?? ""}`).join(" ")}`,
        q,
      ),
    );
  }, [data, query]);

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--color-text-secondary)]">
        Trong khoảng ngày áp dụng, KTV được chọn đang tồn linh kiện trong danh sách thì tối đa <b>số lượng hỗ trợ</b> chiếc được tính công
        nợ = 0đ, phần tồn vượt tính công nợ bình thường. Bật/tắt hoặc sửa là "Công nợ thực tế" tính lại ngay. Nhiều chương trình cùng mã
        LK cho cùng KTV thì cộng dồn số lượng hỗ trợ. Chương trình có <b>từ khóa</b> (🔎) tự thêm mọi linh kiện có mã chứa từ khóa, kể cả
        linh kiện mới thêm sau.
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm tên chương trình, mã/tên LK, KTV…"
          className="focus-ring w-full sm:max-w-md bg-white border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        <Btn variant="primary" size="sm" className="ml-auto" onClick={() => setSua("moi")}>
          ＋ Thêm chương trình
        </Btn>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--surface)]">
        <table className="tbl w-full border-collapse">
          <thead>
            <tr className="tbl-head">
              <th className="px-2.5 py-2">Chương trình</th>
              <th className="px-2.5 py-2">Thời gian</th>
              <th className="px-2.5 py-2">Linh kiện (SL hỗ trợ / KTV)</th>
              <th className="px-2.5 py-2">KTV áp dụng</th>
              <th className="px-2.5 py-2">Trạng thái</th>
              <th className="px-2.5 py-2">Bật</th>
              <th className="px-2.5 py-2">Cập nhật</th>
              <th className="px-2.5 py-2" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="px-2.5 py-6 text-center text-[var(--color-text-secondary)]">Đang tải…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-2.5 py-6 text-center text-[var(--color-text-secondary)]">Chưa có chương trình công nợ 0 đồng nào.</td></tr>
            )}
            {rows.map((r) => {
              const tt = trangThai(r);
              const lkBat = r.lk.filter((l) => l.bat_tat);
              const soTat = r.lk.length - lkBat.length;
              const moTaLk = lkBat.map((l) => `${formatLkLabel(l.ma_linh_kien, l.ten_linh_kien ?? l.ma_linh_kien)} ×${l.so_luong}`).join("\n");
              const moTaKtv = r.ktv.map((k) => k.ten_hien_thi ?? k.ma_ktv).join("\n");
              return (
                <tr key={r.id} className="border-t border-[var(--color-border)]">
                  <td className="px-2.5 py-1.5 font-medium max-w-[220px] truncate" title={r.ten ?? undefined}>{r.ten ?? <span className="text-[var(--color-text-muted)]">#{r.id}</span>}</td>
                  <td className="px-2.5 py-1.5 text-xs">{fmtDate(r.tu_ngay)} → {fmtDate(r.den_ngay)}</td>
                  <td className="px-2.5 py-1.5 max-w-[360px] truncate" title={moTaLk}>
                    <span className="font-semibold">{lkBat.length} LK</span>
                    {r.tu_khoa.map((k) => (
                      <span key={k.id} className="ml-1.5"><Badge tone="info">🔎 {k.tu_khoa} ×{k.so_luong}</Badge></span>
                    ))}
                    {soTat > 0 && <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">({soTat} mã tắt)</span>}
                    <span className="ml-1.5 text-[var(--color-text-secondary)]">{lkBat.map((l) => `${l.ma_linh_kien} ×${l.so_luong}`).join(", ")}</span>
                  </td>
                  <td className="px-2.5 py-1.5 max-w-[260px] truncate" title={r.tat_ca_ktv ? undefined : moTaKtv}>
                    {r.tat_ca_ktv ? <Badge tone="info">Toàn bộ KTV</Badge> : (
                      <>
                        <span className="font-semibold">{r.ktv.length} KTV</span>
                        <span className="ml-1.5 text-[var(--color-text-secondary)]">{r.ktv.map((k) => k.ten_hien_thi ?? k.ma_ktv).join(", ")}</span>
                      </>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5"><Badge tone={tt.tone}>{tt.label}</Badge></td>
                  <td className="px-2.5 py-1.5"><ToggleSwitch checked={!!r.bat_tat} onChange={() => batTat.mutate(r)} /></td>
                  <td className="px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)]">
                    {fmtDateTime(r.ngay_cap_nhat)}
                    {r.nguoi_cap_nhat ? ` · ${formatPersonDisplay(r.nguoi_cap_nhat, personDir)}` : ""}
                  </td>
                  <td className="px-2.5 py-1.5 text-right">
                    <Btn size="sm" variant="ghost" onClick={() => setSua(r)}>Sửa</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setXoa(r)}>Xoá</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sua && (
        <CongNo0dModal
          row={sua === "moi" ? null : sua}
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
          title="Xoá chương trình công nợ 0 đồng"
          onClose={() => setXoa(null)}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setXoa(null)}>Huỷ</Btn>
              <Btn variant="danger" disabled={xoaMut.isPending} onClick={() => xoaMut.mutate(xoa)}>Xoá</Btn>
            </>
          }
        >
          <div className="text-sm">
            Xoá hẳn chương trình <b>{xoa.ten ?? `#${xoa.id}`}</b>? Công nợ thực tế của các KTV liên quan tính lại bình thường ngay. Muốn
            tạm dừng thì tắt công tắc "Bật" thay vì xoá.
          </div>
        </Modal>
      )}
    </div>
  );
}

function homNayVN(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
function cuoiThangVN(): string {
  const d = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

const CHUA_CO_KV = "__none__";

function CongNo0dModal({ row, onClose, onSaved }: { row: CongNo0dRow | null; onClose: () => void; onSaved: () => void }) {
  const addToast = useToast();
  const { danhMuc } = useLkAndLdeCache(true);
  const { data: ktvData } = useQuery({
    queryKey: ["cong-no-0d-ktv-options"],
    queryFn: () => api.get<{ rows: KtvOption[] }>("/settings/ktv-ton-kho/cong-no-0d/ktv-options"),
  });
  const { data: khuVucData } = useQuery({
    queryKey: ["settings-khu-vuc"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/settings/khu-vuc"),
  });
  const [ten, setTen] = useState(row?.ten ?? "");
  const [tuNgay, setTuNgay] = useState(row?.tu_ngay ?? homNayVN());
  const [denNgay, setDenNgay] = useState(row?.den_ngay ?? cuoiThangVN());
  const [tatCa, setTatCa] = useState(!!row?.tat_ca_ktv);
  const [chon, setChon] = useState<Set<string>>(() => new Set(row?.ktv.map((k) => k.ma_ktv) ?? []));
  // Dong nhap tay = dong khong do tu khoa sinh ra (tu_khoa_id null).
  const lkTay = row ? row.lk.filter((l) => l.tu_khoa_id == null) : [];
  const [dong, setDong] = useState<DongSoan[]>(
    lkTay.length ? lkTay.map((l) => ({ ma_lk: l.ma_linh_kien, so_luong: l.so_luong })) : [{ ma_lk: "", so_luong: 1 }],
  );
  const [tuKhoa, setTuKhoa] = useState<TuKhoaSoan[]>(() => (row?.tu_khoa ?? []).map((k) => ({ tu_khoa: k.tu_khoa, so_luong: k.so_luong, khop_ten: !!k.khop_ten })));
  const [tatMa, setTatMa] = useState<Set<string>>(() => new Set((row?.lk ?? []).filter((l) => l.tu_khoa_id != null && !l.bat_tat).map((l) => l.ma_linh_kien)));
  const doiTatMa = (ma: string) =>
    setTatMa((prev) => {
      const next = new Set(prev);
      if (next.has(ma)) next.delete(ma);
      else next.add(ma);
      return next;
    });
  const [locKv, setLocKv] = useState("");
  const [timKtv, setTimKtv] = useState("");
  const [chiDaChon, setChiDaChon] = useState(false);

  // LK dang tat (vd da doi ma) van giu trong o chon khi sua chuong trinh cu.
  const options = useMemo(() => {
    const coSan = new Set(danhMuc.map((r) => r.ma_linh_kien));
    const them = (row?.lk ?? [])
      .filter((l) => !coSan.has(l.ma_linh_kien))
      .map((l) => ({ ma_linh_kien: l.ma_linh_kien, ten_linh_kien: `${l.ten_linh_kien ?? l.ma_linh_kien} (đang tắt)`, gia_ban: null, gia_tri_cong_no: l.gia_tri_cong_no, don_vi: null, bat_tat: 0 }));
    return [...danhMuc, ...them];
  }, [danhMuc, row]);

  const ktvAll = ktvData?.rows ?? [];
  const khuVucTen = useMemo(() => new Map((khuVucData?.rows ?? []).map((k) => [k.ma, k.ten])), [khuVucData]);
  const ktvLoc = useMemo(
    () =>
      ktvAll.filter((k) => {
        if (chiDaChon && !chon.has(k.ma_ktv)) return false;
        if (!chiDaChon && k.ngung_hoat_dong && !chon.has(k.ma_ktv)) return false;
        if (locKv && (locKv === CHUA_CO_KV ? !!k.khu_vuc_ma : k.khu_vuc_ma !== locKv)) return false;
        const q = timKtv.trim();
        return !q || khopTim(`${k.ma_ktv} ${k.ten_hien_thi ?? ""} ${k.ten_misa ?? ""} ${k.ma_misa ?? ""}`, q);
      }),
    [ktvAll, chon, chiDaChon, locKv, timKtv],
  );
  const tatCaDangLocDaChon = ktvLoc.length > 0 && ktvLoc.every((k) => chon.has(k.ma_ktv));
  const doiChonLoc = () =>
    setChon((prev) => {
      const next = new Set(prev);
      if (tatCaDangLocDaChon) ktvLoc.forEach((k) => next.delete(k.ma_ktv));
      else ktvLoc.forEach((k) => next.add(k.ma_ktv));
      return next;
    });
  // CHON KTV TU FILE EXCEL (2026-10-22, "thêm chức năng import KTV mã ID KTV hoặc mã misa từ file excel => tự động sẽ chọn các KTV có
  // trong danh sách đó thay vì phải tích chọn từng ktv"): doc MOI o trong sheet dau, o nao trung Ma KTV hoac Ma MISA (khong phan biet
  // hoa/thuong) thi chon KTV do (CONG THEM vao danh sach dang chon). Ma khong khop chi bao o cac COT co it nhat 1 o khop (bo dong tieu de).
  const [ketQuaFile, setKetQuaFile] = useState<{ ten: string; chon: number; daCo: number; khongThay: string[] } | null>(null);
  const fileKtvRef = useRef<HTMLInputElement>(null);
  async function chonKtvTuFile(file: File) {
    try {
      const XLSX = await import("xlsx");
      const wb = /\.csv$/i.test(file.name)
        ? XLSX.read((await file.text()).replace(/^\uFEFF/, ""), { type: "string" })
        : XLSX.read(await file.arrayBuffer(), { type: "array" });
      const bang = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false });
      const chuan = (v: unknown) => String(v ?? "").trim().toUpperCase();
      const theoMa = new Map<string, string[]>();
      const them = (k: string, ma: string) => theoMa.set(k, [...(theoMa.get(k) ?? []), ma]);
      for (const k of ktvAll) {
        them(chuan(k.ma_ktv), k.ma_ktv);
        if (k.ma_misa?.trim()) them(chuan(k.ma_misa), k.ma_ktv);
      }
      const tim = new Set<string>();
      const cotCoKhop = new Set<number>();
      bang.forEach((dong) => (dong as unknown[]).forEach((o, c) => {
        const ds = theoMa.get(chuan(o));
        if (!ds) return;
        cotCoKhop.add(c);
        // 1 Ma MISA gan nhieu ma KTV: chi lay ma dang hoat dong (het thi lay tat ca).
        const dangBat = ds.filter((ma) => !ktvAll.find((k) => k.ma_ktv === ma)?.ngung_hoat_dong);
        (dangBat.length ? dangBat : ds).forEach((ma) => tim.add(ma));
      }));
      const khongThay = [...new Set(bang.slice(1).flatMap((dong) =>
        (dong as unknown[]).filter((o, c) => cotCoKhop.has(c) && chuan(o) && !theoMa.has(chuan(o))).map((o) => String(o).trim())))];
      const daCo = [...tim].filter((ma) => chon.has(ma)).length;
      setChon((prev) => new Set([...prev, ...tim]));
      setKetQuaFile({ ten: file.name, chon: tim.size, daCo, khongThay });
      if (tim.size) { setChiDaChon(true); setLocKv(""); setTimKtv(""); }
    } catch (e) {
      addToast("Không đọc được file: " + (e instanceof Error ? e.message : String(e)));
    }
  }
  // NHAP LINH KIEN HANG LOAT TU FILE (2026-10-22, v1.385 - "trong mục thêm chương trình hỗ trợ 0 đồng, thêm chức năng import hàng loạt"):
  // doc tren trinh duyet (Excel/CSV, sheet dau). Cot ma = tieu de chua "ma" (Mã LK / Mã linh kiện / Mã hàng), cot SL = tieu de chua "sl" /
  // "so luong"; khong co dong tieu de -> cot 1 = ma, cot 2 = SL (trong -> 1). Ma khop danh muc (khong phan biet hoa/thuong) moi lay; ma
  // lap trong file -> cong SL. Gop vao danh sach dang soan: ma da co -> THAY SL bang so trong file, ma moi -> them dong. Chi luu khi bam "Lưu".
  const [ketQuaLkFile, setKetQuaLkFile] = useState<{ ten: string; them: number; capNhat: number; khongThay: string[]; slSai: string[] } | null>(null);
  const fileLkRef = useRef<HTMLInputElement>(null);
  async function nhapLkTuFile(file: File) {
    try {
      const XLSX = await import("xlsx");
      const wb = /\.csv$/i.test(file.name)
        ? XLSX.read((await file.text()).replace(/^\uFEFF/, ""), { type: "string" })
        : XLSX.read(await file.arrayBuffer(), { type: "array" });
      const bang = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false }) as unknown[][];
      const boDauTieuDe = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
      const theoMa = new Map(options.map((o) => [o.ma_linh_kien.trim().toUpperCase(), o.ma_linh_kien]));
      // Dong tieu de: dong dau co o "ma ..." hoac "sl"/"so luong".
      const dau = (bang[0] ?? []).map(boDauTieuDe);
      let cotMa = dau.findIndex((h) => /^ma\b|ma linh kien|ma lk|ma hang/.test(h));
      let cotSl = dau.findIndex((h) => /^sl\b|so luong/.test(h));
      const coTieuDe = cotMa >= 0 || cotSl >= 0;
      if (cotMa < 0) cotMa = 0;
      if (cotSl < 0) cotSl = cotMa === 0 ? 1 : 0;
      const gop = new Map<string, number>();
      const khongThay: string[] = [];
      const slSai: string[] = [];
      for (const dongFile of coTieuDe ? bang.slice(1) : bang) {
        const maGo = String(dongFile[cotMa] ?? "").trim();
        if (!maGo) continue;
        const ma = theoMa.get(maGo.toUpperCase());
        if (!ma) { if (!khongThay.includes(maGo)) khongThay.push(maGo); continue; }
        const slRaw = String(dongFile[cotSl] ?? "").trim();
        const sl = slRaw === "" ? 1 : Number(slRaw.replace(/[.,\s]/g, ""));
        if (!Number.isInteger(sl) || sl <= 0) { slSai.push(`${maGo} (${slRaw})`); continue; }
        gop.set(ma, (gop.get(ma) ?? 0) + sl);
      }
      let them = 0;
      let capNhat = 0;
      const ketQua = dong.filter((d) => d.ma_lk);
      for (const [ma, sl] of gop) {
        const i = ketQua.findIndex((d) => d.ma_lk === ma);
        if (i >= 0) { ketQua[i] = { ...ketQua[i], so_luong: sl }; capNhat++; } else { ketQua.push({ ma_lk: ma, so_luong: sl }); them++; }
      }
      setDong(ketQua.length ? ketQua : [{ ma_lk: "", so_luong: 1 }]);
      setKetQuaLkFile({ ten: file.name, them, capNhat, khongThay, slSai });
    } catch (e) {
      addToast("Không đọc được file: " + (e instanceof Error ? e.message : String(e)));
    }
  }
  async function taiFileMauLk() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["Mã LK", "SL hỗ trợ / KTV"], ["VD-MA-001", 2], ["VD-MA-002", 1]]);
    ws["!cols"] = [{ wch: 22 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Linh kiện");
    XLSX.writeFile(wb, "mau-import-lk-cong-no-0-dong.xlsx");
  }

  const doiChon = (ma: string) =>
    setChon((prev) => {
      const next = new Set(prev);
      if (next.has(ma)) next.delete(ma);
      else next.add(ma);
      return next;
    });

  const dongHopLe = dong.filter((d) => d.ma_lk);
  const trung = new Set(dongHopLe.map((d) => d.ma_lk)).size !== dongHopLe.length;
  const ngaySai = !tuNgay || !denNgay || tuNgay > denNgay;
  const tuKhoaDung = tuKhoa.filter((k) => k.tu_khoa.trim());
  const tuKhoaSai =
    tuKhoaDung.some((k) => k.tu_khoa.trim().length < 3 || !Number.isInteger(k.so_luong) || k.so_luong <= 0) ||
    new Set(tuKhoaDung.map((k) => k.tu_khoa.trim().toUpperCase())).size !== tuKhoaDung.length;
  const duLieu =
    !ngaySai &&
    dongHopLe.length + tuKhoaDung.length > 0 &&
    dongHopLe.every((d) => Number.isInteger(d.so_luong) && d.so_luong > 0) &&
    !trung &&
    !tuKhoaSai &&
    (tatCa || chon.size > 0);
  const maTay = useMemo(() => new Set(dongHopLe.map((d) => d.ma_lk)), [dongHopLe]);

  const luu = useMutation({
    mutationFn: () => {
      const body = {
        ten: ten.trim() || null,
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        tat_ca_ktv: tatCa,
        ktv: tatCa ? [] : [...chon],
        lk: dongHopLe.map((d) => ({ ma_linh_kien: d.ma_lk, so_luong: d.so_luong })),
        tu_khoa: tuKhoaDung.map((k) => ({ tu_khoa: k.tu_khoa.trim(), so_luong: k.so_luong, khop_ten: k.khop_ten })),
        tat_ma: [...tatMa],
      };
      return row ? api.patch(`/settings/ktv-ton-kho/cong-no-0d/${row.id}`, body) : api.post("/settings/ktv-ton-kho/cong-no-0d", body);
    },
    onSuccess: () => {
      addToast(row ? "Đã lưu chương trình — công nợ thực tế đã tính lại" : "Đã thêm chương trình — công nợ thực tế đã tính lại");
      onSaved();
    },
    onError: (e) => addToast("Không lưu được: " + describeApiError(e)),
  });

  const suaDong = (i: number, patch: Partial<DongSoan>) => setDong((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const nhan = "block text-xs font-semibold text-[var(--color-text-secondary)] mb-1";
  const oNhap = "focus-ring w-full bg-white border border-[var(--color-border)] rounded-lg px-2.5 py-1.5";

  return (
    <Modal
      open
      title={row ? "Sửa chương trình công nợ 0 đồng" : "Thêm chương trình công nợ 0 đồng"}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Huỷ</Btn>
          <Btn variant="primary" disabled={!duLieu || luu.isPending} onClick={() => luu.mutate()}>{luu.isPending ? "Đang lưu…" : "Lưu"}</Btn>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="block sm:col-span-2">
            <span className={nhan}>Tên chương trình</span>
            <input value={ten} onChange={(e) => setTen(e.target.value)} placeholder="VD: Hỗ trợ bo nguồn tháng 10" className={oNhap} />
          </label>
          <label className="block">
            <span className={nhan}>Từ ngày *</span>
            <input type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} className={oNhap} />
          </label>
          <label className="block">
            <span className={nhan}>Đến ngày *</span>
            <input type="date" value={denNgay} onChange={(e) => setDenNgay(e.target.value)} className={oNhap} />
          </label>
        </div>
        {ngaySai && tuNgay && denNgay && <div className="-mt-2 text-xs text-[var(--color-danger)]">"Từ ngày" phải trước hoặc bằng "Đến ngày".</div>}

        <div>
          <div className={nhan}>Linh kiện * (số lượng hỗ trợ 0đ cho MỖI KTV)</div>
          <div className="space-y-2">
            {dong.map((d, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-5 pt-2 text-xs text-[var(--color-text-secondary)] text-right shrink-0">{i + 1}.</span>
                <LinhKienPicker className="flex-1 min-w-0" value={d.ma_lk} onChange={(v) => suaDong(i, { ma_lk: v })} options={options} ghiLichSu={false} />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={d.so_luong}
                  onChange={(e) => suaDong(i, { so_luong: Number(e.target.value) })}
                  className="focus-ring w-20 shrink-0 bg-white border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-right font-mono"
                  title="Số lượng hỗ trợ / KTV"
                />
                <Btn size="sm" variant="ghost" disabled={dong.length === 1} onClick={() => setDong((prev) => prev.filter((_, j) => j !== i))}>✕</Btn>
              </div>
            ))}
          </div>
          {trung && <div className="mt-1 text-xs text-[var(--color-danger)]">Có linh kiện bị chọn 2 lần — tăng số lượng thay vì thêm dòng.</div>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Btn size="sm" variant="ghost" onClick={() => setDong((prev) => [...prev, { ma_lk: "", so_luong: 1 }])}>＋ Thêm linh kiện</Btn>
            <Btn size="sm" variant="subtle" disabled={!options.length} onClick={() => fileLkRef.current?.click()}
              title="File Excel/CSV: cột Mã LK + cột SL hỗ trợ / KTV (SL trống = 1). Mã đã có trong danh sách sẽ lấy SL theo file.">
              ⬆ Nhập linh kiện từ file
            </Btn>
            <button type="button" className="text-xs text-[var(--color-primary)] underline underline-offset-2" onClick={() => void taiFileMauLk()}>
              Tải file mẫu
            </button>
            <input ref={fileLkRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const fi = e.target.files?.[0]; e.target.value = ""; if (fi) void nhapLkTuFile(fi); }} />
          </div>
          {ketQuaLkFile && (
            <div className={`mt-2 flex items-start gap-2 rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-xs ${ketQuaLkFile.them + ketQuaLkFile.capNhat ? "text-[var(--color-text-body)]" : "text-[var(--color-danger-strong)]"}`}>
              <div className="min-w-0 flex-1">
                {ketQuaLkFile.them + ketQuaLkFile.capNhat
                  ? <>Từ file <b>{ketQuaLkFile.ten}</b>: thêm <b>{ketQuaLkFile.them}</b> linh kiện{ketQuaLkFile.capNhat ? <>, cập nhật số lượng <b>{ketQuaLkFile.capNhat}</b> linh kiện đã có</> : null} — bấm "Lưu" để áp dụng.</>
                  : <>File <b>{ketQuaLkFile.ten}</b> không có mã linh kiện nào khớp danh mục.</>}
                {ketQuaLkFile.khongThay.length > 0 && (
                  <div className="mt-0.5 text-[var(--color-warning)]" title={ketQuaLkFile.khongThay.join(", ")}>
                    ⚠ {ketQuaLkFile.khongThay.length} mã không có trong danh mục: {ketQuaLkFile.khongThay.slice(0, 15).join(", ")}{ketQuaLkFile.khongThay.length > 15 ? "…" : ""}
                  </div>
                )}
                {ketQuaLkFile.slSai.length > 0 && (
                  <div className="mt-0.5 text-[var(--color-warning)]" title={ketQuaLkFile.slSai.join(", ")}>
                    ⚠ {ketQuaLkFile.slSai.length} dòng số lượng không hợp lệ (bỏ qua): {ketQuaLkFile.slSai.slice(0, 10).join(", ")}{ketQuaLkFile.slSai.length > 10 ? "…" : ""}
                  </div>
                )}
              </div>
              <button type="button" className="shrink-0 text-[var(--color-text-secondary)]" onClick={() => setKetQuaLkFile(null)} aria-label="Đóng">✕</button>
            </div>
          )}
        </div>

        <div>
          <div className={nhan}>Chọn hàng loạt theo từ khóa (tự thêm cả linh kiện mới sau này)</div>
          <div className="text-xs text-[var(--color-text-secondary)] mb-2">
            Mọi linh kiện có <b>mã</b> chứa từ khóa (vd "BH004") vào chương trình với số lượng hỗ trợ của từ khóa. Linh kiện thêm sau có mã phù
            hợp tự được bổ sung. Tắt từng mã khớp sai ở danh sách bên dưới — mã đã tắt không tự bật lại. Mã đã nhập tay ở trên dùng số lượng nhập tay.
          </div>
          <div className="space-y-3">
            {tuKhoa.map((k, i) => (
              <TuKhoaDong
                key={i}
                k={k}
                stt={i + 1}
                maTay={maTay}
                tatMa={tatMa}
                doiTatMa={doiTatMa}
                onChange={(patch) => setTuKhoa((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                onXoa={() => setTuKhoa((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>
          {tuKhoaSai && <div className="mt-1 text-xs text-[var(--color-danger)]">Từ khóa cần ít nhất 3 ký tự, không trùng nhau, số lượng ≥ 1.</div>}
          <Btn size="sm" variant="ghost" className="mt-2" onClick={() => setTuKhoa((prev) => [...prev, { tu_khoa: "", so_luong: 1, khop_ten: false }])}>
            ＋ Thêm từ khóa
          </Btn>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">KTV áp dụng *</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={tatCa} onChange={(e) => setTatCa(e.target.checked)} />
              <span>Toàn bộ KTV (kể cả KTV thêm sau)</span>
            </label>
            {!tatCa && <span className="ml-auto text-xs text-[var(--color-text-secondary)]">Đã chọn <b>{chon.size}</b> KTV</span>}
          </div>
          {!tatCa && (
            <div className="rounded-lg border border-[var(--color-border)]">
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-2">
                <select value={locKv} onChange={(e) => setLocKv(e.target.value)} className="focus-ring bg-white border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm">
                  <option value="">Mọi khu vực</option>
                  {(khuVucData?.rows ?? []).map((k) => (
                    <option key={k.ma} value={k.ma}>{k.ten}</option>
                  ))}
                  <option value={CHUA_CO_KV}>Chưa gán khu vực</option>
                </select>
                <input
                  value={timKtv}
                  onChange={(e) => setTimKtv(e.target.value)}
                  placeholder="Tìm mã/tên KTV…"
                  className="focus-ring flex-1 min-w-[160px] bg-white border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm"
                />
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={chiDaChon} onChange={(e) => setChiDaChon(e.target.checked)} />
                  Chỉ KTV đã chọn
                </label>
                <Btn size="sm" variant="ghost" disabled={ktvLoc.length === 0} onClick={doiChonLoc}>
                  {tatCaDangLocDaChon ? `Bỏ chọn ${ktvLoc.length} KTV đang lọc` : `Chọn ${ktvLoc.length} KTV đang lọc`}
                </Btn>
                <Btn size="sm" variant="subtle" disabled={!ktvAll.length} onClick={() => fileKtvRef.current?.click()}
                  title="File Excel/CSV có cột Mã KTV hoặc Mã MISA — mọi KTV có mã trong file được chọn thêm">
                  ⬆ Chọn KTV từ file
                </Btn>
                <input ref={fileKtvRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={(e) => { const fi = e.target.files?.[0]; e.target.value = ""; if (fi) void chonKtvTuFile(fi); }} />
              </div>
              {ketQuaFile && (
                <div className={`flex items-start gap-2 border-b border-[var(--color-border)] px-2.5 py-2 text-xs ${ketQuaFile.chon ? "text-[var(--color-text-body)]" : "text-[var(--color-danger-strong)]"}`}>
                  <div className="min-w-0 flex-1">
                    {ketQuaFile.chon
                      ? <>Từ file <b>{ketQuaFile.ten}</b>: chọn <b>{ketQuaFile.chon}</b> KTV{ketQuaFile.daCo ? ` (${ketQuaFile.daCo} KTV đã chọn từ trước)` : ""} — đang lọc "Chỉ KTV đã chọn" để kiểm tra lại.</>
                      : <>File <b>{ketQuaFile.ten}</b> không có mã nào khớp Mã KTV / Mã MISA.</>}
                    {ketQuaFile.khongThay.length > 0 && (
                      <div className="mt-0.5 text-[var(--color-warning)]" title={ketQuaFile.khongThay.join(", ")}>
                        ⚠ {ketQuaFile.khongThay.length} mã không tìm thấy: {ketQuaFile.khongThay.slice(0, 15).join(", ")}{ketQuaFile.khongThay.length > 15 ? "…" : ""}
                      </div>
                    )}
                  </div>
                  <button type="button" className="shrink-0 text-[var(--color-text-secondary)]" onClick={() => setKetQuaFile(null)} aria-label="Đóng">✕</button>
                </div>
              )}
              <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border)]">
                {ktvLoc.length === 0 && <div className="px-3 py-4 text-center text-xs text-[var(--color-text-secondary)]">Không có KTV phù hợp.</div>}
                {ktvLoc.map((k) => (
                  <label key={k.ma_ktv} className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-[var(--color-surface-soft)]">
                    <input type="checkbox" checked={chon.has(k.ma_ktv)} onChange={() => doiChon(k.ma_ktv)} />
                    <span className="min-w-0 flex-1 truncate">{k.ten_hien_thi ?? k.ma_ktv}</span>
                    <span className="shrink-0 font-mono text-xs text-[var(--color-text-secondary)]">{k.ma_ktv}</span>
                    <span className="shrink-0 w-24 truncate text-right text-xs text-[var(--color-text-secondary)]">
                      {k.khu_vuc_ma ? khuVucTen.get(k.khu_vuc_ma) ?? k.khu_vuc_ma : "—"}
                    </span>
                    {!!k.ngung_hoat_dong && <Badge tone="neutral">Ngừng</Badge>}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// 1 dong tu khoa trong form + danh sach LK khop (xem truoc tu server, cung dieu kien luc luu - GET /cong-no-0d/khop) kem cong tac
// tat/bat tung ma. Tat/bat chi luu khi bam "Lưu" (gui tat_ma).
function TuKhoaDong({
  k, stt, maTay, tatMa, doiTatMa, onChange, onXoa,
}: {
  k: TuKhoaSoan; stt: number; maTay: Set<string>; tatMa: Set<string>; doiTatMa: (ma: string) => void;
  onChange: (patch: Partial<TuKhoaSoan>) => void; onXoa: () => void;
}) {
  const [tk, setTk] = useState(k.tu_khoa.trim());
  useEffect(() => {
    const t = setTimeout(() => setTk(k.tu_khoa.trim()), 400);
    return () => clearTimeout(t);
  }, [k.tu_khoa]);
  const [mo, setMo] = useState(false);
  const [loc, setLoc] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["cong-no-0d-khop", tk.toUpperCase(), k.khop_ten],
    queryFn: () => api.get<{ rows: LkKhopRow[] }>(`/settings/ktv-ton-kho/cong-no-0d/khop?tu_khoa=${encodeURIComponent(tk)}&khop_ten=${k.khop_ten ? 1 : 0}`),
    enabled: tk.length >= 3,
  });
  const rows = data?.rows ?? [];
  const soTat = rows.filter((r) => tatMa.has(r.ma_linh_kien)).length;
  const hien = rows.filter((r) => !loc.trim() || khopTim(`${r.ma_linh_kien} ${r.ten_linh_kien ?? ""}`, loc.trim()));
  return (
    <div className="rounded-lg border border-[var(--color-border)]">
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
        <span className="w-5 text-xs text-[var(--color-text-secondary)] text-right shrink-0">{stt}.</span>
        <input
          value={k.tu_khoa}
          onChange={(e) => onChange({ tu_khoa: e.target.value })}
          placeholder="Từ khóa, vd BH004"
          className="focus-ring w-40 bg-white border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 font-mono"
        />
        <input
          type="number"
          min={1}
          step={1}
          value={k.so_luong}
          onChange={(e) => onChange({ so_luong: Number(e.target.value) })}
          className="focus-ring w-20 bg-white border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-right font-mono"
          title="Số lượng hỗ trợ / KTV cho mỗi linh kiện khớp"
        />
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={k.khop_ten} onChange={(e) => onChange({ khop_ten: e.target.checked })} />
          Khớp cả tên linh kiện
        </label>
        <span className="ml-auto text-xs text-[var(--color-text-secondary)]">
          {tk.length < 3 ? "Nhập ≥ 3 ký tự" : isFetching && !data ? "Đang tìm…" : (
            <>
              <b>{rows.length - soTat}</b> mã áp dụng{soTat > 0 ? ` · ${soTat} tắt` : ""}
              {rows.length >= 2000 ? " (hiện 2.000 mã đầu)" : ""}
            </>
          )}
        </span>
        <Btn size="sm" variant="ghost" disabled={rows.length === 0} onClick={() => setMo((v) => !v)}>{mo ? "Thu gọn" : "Xem / tắt mã"}</Btn>
        <Btn size="sm" variant="ghost" onClick={onXoa}>✕</Btn>
      </div>
      {mo && rows.length > 0 && (
        <div className="border-t border-[var(--color-border)]">
          <div className="px-2.5 py-2 bg-[var(--color-surface-soft)]">
            <input
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              placeholder="Lọc trong danh sách khớp…"
              className="focus-ring w-full bg-white border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border)]">
            {hien.map((r) => {
              const tay = maTay.has(r.ma_linh_kien);
              const bat = !tatMa.has(r.ma_linh_kien);
              return (
                <div key={r.ma_linh_kien} className={`flex items-center gap-2 px-2.5 py-1.5 ${bat ? "" : "opacity-60"}`}>
                  {tay ? <span className="w-10 shrink-0" /> : <ToggleSwitch checked={bat} onChange={() => doiTatMa(r.ma_linh_kien)} />}
                  <span className="shrink-0 font-mono text-xs">{r.ma_linh_kien}</span>
                  <span className="min-w-0 flex-1 truncate" title={r.ten_linh_kien ?? undefined}>{r.ten_linh_kien ?? "—"}</span>
                  {!r.khop_ma && <Badge tone="warning">Khớp theo tên</Badge>}
                  {tay && <Badge tone="neutral">Đã nhập tay</Badge>}
                  {!r.bat_tat && <Badge tone="neutral">LK đang tắt</Badge>}
                </div>
              );
            })}
            {hien.length === 0 && <div className="px-3 py-3 text-center text-xs text-[var(--color-text-secondary)]">Không có mã phù hợp.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
