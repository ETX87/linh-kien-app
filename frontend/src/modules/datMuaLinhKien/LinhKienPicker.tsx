import { useState, useEffect, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/x/Badge";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { DropdownPortal } from "../../components/ui/DropdownPortal";
import { KvRow } from "../../components/ui/KvRow";
import { api } from "../../api/client";
import { fmtVND } from "../../types";
import { usePublicSheetCache } from "../../lib/publicSheetCache";
import type { LkDanhMucRow } from "./types";
import { describeApiError, useLinhKienRankMap, formatLkLabel, boQuaTbpDacThu, camBanChoLoai, lkCamBanVoiLoai } from "./helpers";
import { Money } from "../../components/ui/Money";
import { timLk, sapTheoDiem, type ToDamSpec } from "../../lib/timLinhKien";
import { useBoTimLk, useLichSuLk, diemHayDat } from "../../lib/useTimLinhKien";
import { ToDam } from "../../components/ui/ToDam";
import { t } from "../../i18n";

// O chon "Ma linh kien" (autocomplete co anh/gia/xep hang) + cac component lien quan (thumbnail,
// modal xem chi tiet, goi y thay the) - tach tu DatMuaLinhKienModule.tsx (UI redesign Phase 3,
// phan hoi Codex 2026-08-19). Dung boi ca TaoDonTab va DonHangDetailModal (che do sua).

// Goi y ma LK cung nhom thay the - buoc 2 ke hoach "Luong tao don mua hang", ap dung cho MOI nguoi
// dung (khong rieng Kho/TN). GS/TN co them nut "Them vao nhom thay the" de bo sung nhanh tai day.
export function ThayTheGoiY({ maLk, canQuanLy, addToast }: { maLk: string; canQuanLy: boolean; addToast: (msg: string) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["lk-thay-the", maLk],
    queryFn: () => api.get<{ rows: LkDanhMucRow[] }>(`/lk-settings/thay-the/${encodeURIComponent(maLk)}`),
  });
  const { data: nhomData } = useQuery({
    queryKey: ["lk-nhom-thay-the"],
    queryFn: () => api.get<{ rows: { id: number; ten_nhom: string; ma_lk_list: string[] }[] }>("/lk-settings/nhom-thay-the"),
    enabled: canQuanLy,
  });

  const themVaoNhom = useMutation({
    mutationFn: (nhomId: number) => {
      const nhom = nhomData?.rows.find((n) => n.id === nhomId);
      const maLkList = Array.from(new Set([...(nhom?.ma_lk_list ?? []), maLk]));
      return api.patch(`/lk-settings/nhom-thay-the/${nhomId}`, { ma_lk_list: maLkList });
    },
    onSuccess: () => {
      addToast(t("Đã thêm {ma} vào nhóm thay thế", { ma: maLk }));
      qc.invalidateQueries({ queryKey: ["lk-nhom-thay-the"] });
      qc.invalidateQueries({ queryKey: ["lk-thay-the", maLk] });
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="col-span-2 sm:col-span-6 -mt-1 text-xs flex items-center gap-2 flex-wrap">
      {/* Style ".substitute-chip" cua concept 1 (vien+chu+nen indigo, bo tron full) - thay cho danh
          sach text thuan truoc day. Van la hien thi thuan tuy (khong them onClick chon thay the -
          ngoai pham vi restyle JSX/className cua dot nay). */}
      {rows.length > 0 && (
        <>
          <span className="text-[var(--ink-500)]">{t("Có thể thay thế bằng:")}</span>
          {rows.map((r) => (
            <span
              key={r.ma_linh_kien}
              className="inline-flex items-center gap-1 border border-[var(--ocean-800)] text-[var(--ocean-800)] bg-[var(--ocean-100)] rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
            >
              ↔ {formatLkLabel(r.ma_linh_kien, r.ten_linh_kien)}
            </span>
          ))}
        </>
      )}
      {canQuanLy && (nhomData?.rows.length ?? 0) > 0 && (
        <Select
          value=""
          onChange={(v) => v && themVaoNhom.mutate(Number(v))}
          options={[
            { value: "", label: t("+ Thêm vào nhóm thay thế") },
            ...(nhomData?.rows ?? []).map((n) => ({ value: String(n.id), label: n.ten_nhom })),
          ]}
        />
      )}
    </div>
  );
}


// SUA LAG + tach biet trang thai anh (phan hoi 2026-08-18): ap dung DUNG khuon mau AnhThumbnail cua
// DanhMucLinhKienModule.tsx (da giai dung bai toan nay) - 1 THE <img> DUY NHAT (khong dung lai lan 2
// khi chuyen trang thai), toggle opacity qua CSS thay vi mount/unmount, skeleton nhap nhay luc dang
// tai, icon rieng khi loi/khong co anh. Viec tai anh & viec hien danh sach hoan toan DOC LAP - danh
// sach da render xong text/gia ngay lap tuc, <img> tu no tai ngam ben duoi, khong lam cham hien thi.
const THAY_THE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ02aMyUHGYZC59csU07jfbzDX0M3vRPipKCN1ZAwhGU6p6JWElulY1GFn5aAAJuAJ3VegHivyEKsfN/pub?gid=1488773788&single=true&output=tsv";
const THAY_THE_SHEET_STORAGE_KEY = "dat-mua-lk-linh-kien-thay-the-cache-v1";

// Goi y linh kien thay the cho nhau TU GOOGLE SHEET CONG KHAI (yeu cau nguoi dung 2026-08-27) - nguon
// HOAN TOAN DOC LAP voi ThayTheGoiY o tren (doc tu bang lk_nhom_thay_the qua backend): rieng he thong
// nay CHUA TUNG co man Settings de tao/sua nhom trong DB (chi co nut "+ Thêm vào nhóm thay thế" gan
// vao nhom DA CO SAN, khong co cach nao tao nhom dau tien qua UI - xac nhan qua AskUserQuestion cung
// ngay: "dùng Google Sheet mới, không đụng DB cũ"), nen ThayTheGoiY thuc te gan nhu luon rong. Component
// nay dung publicSheetCache.ts (cache IndexedDB tren may, tu dong bo 1 lan/ngay, KHONG goi backend) -
// CHI hien thi thuan tuy, khong co nut ghi nao (du lieu nguon la Sheet, khong phai bang DB he thong).
export function ThayTheGoiYTuSheet({ maLk }: { maLk: string }) {
  const { rows } = usePublicSheetCache(THAY_THE_SHEET_STORAGE_KEY, THAY_THE_SHEET_URL);
  const suggestions = useMemo(() => {
    const q = maLk.trim();
    if (!q) return [];
    const nhoms = new Set(rows.filter((r) => (r["MÃ"] ?? "").trim() === q).map((r) => r["NHÓM"]));
    if (nhoms.size === 0) return [];
    const seen = new Set<string>([q]);
    const result: { ma: string; ten: string }[] = [];
    for (const r of rows) {
      if (!nhoms.has(r["NHÓM"])) continue;
      const ma = (r["MÃ"] ?? "").trim();
      if (!ma || seen.has(ma)) continue;
      seen.add(ma);
      result.push({ ma, ten: (r["TÊN"] ?? "").trim() });
    }
    return result;
  }, [rows, maLk]);

  if (suggestions.length === 0) return null;
  return (
    <div className="col-span-2 sm:col-span-6 -mt-1 text-xs flex items-center gap-2 flex-wrap">
      <span className="text-[var(--ink-500)]">{t("Có thể đặt thay thế bằng:")}</span>
      {suggestions.map((s) => (
        <span
          key={s.ma}
          className="inline-flex items-center gap-1 border border-[var(--ocean-800)] text-[var(--ocean-800)] bg-[var(--ocean-100)] rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
        >
          ↔ {formatLkLabel(s.ma, s.ten)}
        </span>
      ))}
    </div>
  );
}

export function LinhKienThumbMini({ url, size = 28 }: { url: string | null; size?: number }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(url ? "loading" : "error");
  useEffect(() => setStatus(url ? "loading" : "error"), [url]);
  return (
    <div className="relative rounded-md overflow-hidden shrink-0 bg-[var(--surface-200)]" style={{ width: size, height: size }}>
      {status === "loading" && <div className="img-skeleton absolute inset-0 bg-[var(--surface-200)]" />}
      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center text-[var(--ink-400)]" style={{ fontSize: size * 0.4 }}>
          🖼️
        </div>
      ) : (
        <img
          src={url ?? undefined}
          loading="lazy"
          decoding="async"
          alt=""
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`w-full h-full object-cover transition-opacity duration-300 ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}

export function LinhKienPickerRow({
  o, rank, selected, highlighted, onPick, toDam, soLanChon,
}: {
  o: LkDanhMucRow; rank: number | undefined; selected: boolean; highlighted: boolean; onPick: () => void;
  // Bo tim tren may (2026-10-04): to dam phan khop + so lan CHINH nguoi dung da chon (lich su tren may).
  toDam?: ToDamSpec | null; soLanChon?: number;
}) {
  return (
    <button
      type="button"
      // SUA HOI QUY TAB (phan hoi 2026-08-18): tabIndex=-1 - nut ket qua CHI bam duoc bang chuot/
      // Enter (xu ly rieng o input cha), KHONG con nam trong duong Tab tu nhien cua trinh duyet.
      // Truoc day thieu dong nay khien nguoi dung nhap lieu bang Tab tu o "Ma linh kien" se lac vao
      // hang chuc nut ket qua thay vi nhay thang sang "Loai de xuat" - hoi quy nang so voi Select cu.
      tabIndex={-1}
      title={formatLkLabel(o.ma_linh_kien, o.ten_linh_kien)}
      // onMouseDown (khong phai onClick) de chay TRUOC su kien blur cua input - dung pattern da co
      // san o SearchableSelect (components/ui/Select.tsx).
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-sm ${highlighted ? "bg-[var(--ocean-100)]/60" : selected ? "bg-[var(--ocean-100)]/40" : "hover:bg-[var(--surface-100)]"}`}
    >
      <LinhKienThumbMini url={o.anh_demo ?? null} />
      <span className="flex-1 min-w-0">
        {/* SUA (phan hoi 2026-08-19): bo tien to "mã - " lap - nhieu ten_linh_kien da tu chua san ma
            dang "[ma]" trong chuoi, ghep them tien to se hien ma 2 lan. Xem formatLkLabel (helpers.ts). */}
        <span className="block truncate font-medium text-[var(--ocean-800)]"><ToDam text={formatLkLabel(o.ma_linh_kien, o.ten_linh_kien)} spec={toDam} /></span>
        {!!soLanChon && soLanChon >= 2 && <span className="mr-1 text-[10px] font-semibold text-[var(--color-primary)]">{t("⭐ Bạn đã chọn {n} lần", { n: soLanChon })}</span>}
        {rank != null && rank <= 5 && <span className="text-[10px] font-semibold text-[var(--amber-700)]">{t("🔥 #{n} hay đặt (30 ngày)", { n: rank })}</span>}
        {/* LK moi tao trong app, Mua hang chua xac nhan ma chuan (migration 0053) - van dat duoc (chot nguoi dung). */}
        {o.trang_thai_ma === "Cho xet duyet" && <span className="ml-1 text-[10px] font-semibold text-[var(--amber-700)]">{t("Mã chờ xét duyệt")}</span>}
        {/* Combo (migration 0066) - gia hien = tong cac LK thanh phan. */}
        {o.combo && <span className="ml-1"><Badge tone="neutral">{t("🧩 Combo · {n} linh kiện", { n: o.combo.ct.length })}</Badge></span>}
        {!!o.cam_ban && <span className="ml-1"><Badge tone="danger">{t("Cấm bán")}</Badge></span>}
      </span>
      {o.gia_ban != null && <span className="shrink-0 text-[11px] text-[var(--green-700)] font-mono font-semibold"><Money>{fmtVND(o.gia_ban)}</Money></span>}
    </button>
  );
}

// So dong TOI DA render trong dropdown (phan hoi 2026-08-18: nguyen nhan LAG THAT SU) - truoc day
// khi o tim kiem trong (vua focus/vua xoa chu), "matched" = TOAN BO danh muc (~vai nghin linh kien) ->
// render hang nghin <button>+<img> cung luc gay giat. Gioi han cung ~60 dong la du dung cho 1 man
// hinh cuon, phan con lai chi can go them 1-2 ky tu la loc gon ngay.
const LINH_KIEN_PICKER_MAX_RESULTS = 60;

// CHOT (ra soat "Tao Don Linh Kien 2.0" #3): o chon "Ma linh kien" RIENG cho module nay (KHONG sua
// components/ui/Select.tsx dung chung o ~15 man hinh khac trong app, tranh anh huong noi khac) - moi
// dong ket qua co anh + gia, sap xep theo hang dat 30 ngay gan nhat (rank) truoc, linh kien chua co
// luot dat nao roi xuong duoi 1 dong ke "── Linh kiện khác ──". Khi go tu khoa, van uu tien sap theo
// hang trong nhom da khop, khong chi loc dung theo chuoi tim.
export function LinhKienPicker({
  value, onChange, options, disabled = false, className = "", autoFocus = false, loaiDeXuat, ghiLichSu = true,
}: {
  value: string; onChange: (v: string) => void; options: LkDanhMucRow[]; disabled?: boolean; className?: string; autoFocus?: boolean;
  // false = khong ghi lich su chon (vd soan Combo o Bang gia - khong phai dat hang, tranh lam lech "Bạn hay đặt").
  ghiLichSu?: boolean;
  // Loai de xuat dang chon - MUA/HỖ TRỢ/TRỪ CÔNG NỢ bo qua TBP nen khong hien canh bao "chờ TP DVBH" (2026-09-29).
  loaiDeXuat?: string;
}) {
  const rankMap = useLinhKienRankMap();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.ma_linh_kien === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Bo tim tren may (2026-10-04, lib/timLinhKien.ts - CUNG bo voi Bang gia): tach tu khoa roi rac, khong dau, bo qua gach
  // noi trong ma, tu dong nghia/tu khoa phu, go sai 1 ky tu; to dam phan khop. Uu tien: do sat > chinh minh hay chon (lich su
  // tren may) > hang dat 30 ngay toan he thong. O trong: "Chọn gần đây" -> "Hay đặt" -> con lai. Khong goi server khi go.
  const q = query.trim();
  const lichSu = useLichSuLk();
  // LK cam ban an khoi danh sach khi loai de xuat la MUA HÀNG / MUA HÀNG CÓ ID (2026-10-08); loai khac van chon duoc.
  const dsChon = useMemo(() => (camBanChoLoai(loaiDeXuat) ? options.filter((o) => !o.cam_ban) : options), [options, loaiDeXuat]);
  const rowsTim = useMemo(() => dsChon.map((o) => ({ ma: o.ma_linh_kien, ten: o.ten_linh_kien })), [dsChon]);
  const boTim = useBoTimLk(rowsTim);
  const kqTim = useMemo(() => timLk(boTim, q), [boTim, q]);
  const { nhom, totalMatched } = useMemo(() => {
    const MAX = LINH_KIEN_PICKER_MAX_RESULTS;
    if (kqTim.diem) {
      const ds = sapTheoDiem(dsChon, (o) => o.ma_linh_kien, kqTim.diem, (ma) => diemHayDat(ma, lichSu.soLanChon, rankMap));
      return { nhom: [{ tieuDe: null as string | null, items: ds.slice(0, MAX) }], totalMatched: ds.length };
    }
    const theoMa = new Map(dsChon.map((o) => [o.ma_linh_kien, o]));
    const ganDay = lichSu.ganDay.map((m) => theoMa.get(m)).filter((o): o is LkDanhMucRow => !!o).slice(0, 5);
    const daLay = new Set(ganDay.map((o) => o.ma_linh_kien));
    const hayDat = dsChon
      .filter((o) => !daLay.has(o.ma_linh_kien) && (lichSu.soLanChon.has(o.ma_linh_kien) || rankMap.has(o.ma_linh_kien)))
      .sort(
        (a, b) =>
          (lichSu.soLanChon.get(b.ma_linh_kien) ?? 0) - (lichSu.soLanChon.get(a.ma_linh_kien) ?? 0) ||
          (rankMap.get(a.ma_linh_kien) ?? 1e9) - (rankMap.get(b.ma_linh_kien) ?? 1e9),
      );
    for (const o of hayDat) daLay.add(o.ma_linh_kien);
    const khac = dsChon.filter((o) => !daLay.has(o.ma_linh_kien)).sort((a, b) => a.ten_linh_kien.localeCompare(b.ten_linh_kien));
    let conLai = MAX;
    const cat = (ds: LkDanhMucRow[]) => {
      const x = ds.slice(0, Math.max(0, conLai));
      conLai -= x.length;
      return x;
    };
    return {
      nhom: [
        { tieuDe: t("🕘 Chọn gần đây"), items: cat(ganDay) },
        { tieuDe: t("🔥 Hay đặt"), items: cat(hayDat) },
        { tieuDe: t("Linh kiện khác"), items: cat(khac) },
      ].filter((n) => n.items.length > 0),
      totalMatched: dsChon.length,
    };
  }, [dsChon, kqTim, rankMap, lichSu.soLanChon, lichSu.ganDay]);
  const flatResults = useMemo(() => nhom.flatMap((n) => n.items), [nhom]);
  const shownCount = flatResults.length;
  const truncatedCount = totalMatched - shownCount;

  useEffect(() => setHighlightIdx(0), [q, open]);

  function pick(maLinhKien: string) {
    if (ghiLichSu) {
      lichSu.ghiChon(maLinhKien);
      if (q) lichSu.ghiTim(q);
    }
    onChange(maLinhKien);
    setOpen(false);
    setQuery("");
  }

  // SUA HOI QUY TAB (phan hoi 2026-08-18): dieu huong ban phim day du - mui ten len/xuong doi dong
  // dang chon, Enter chon dong dang highlight, Escape dong khong chon. Tab KHONG bi chan o day - de
  // trinh duyet tu chuyen focus sang truong tiep theo nhu 1 input binh thuong (cac nut ket qua da
  // tabIndex=-1 nen khong con chen vao giua).
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || flatResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatResults[highlightIdx];
      if (target) pick(target.ma_linh_kien);
    } else if (e.key === "Escape") {
      // QA 2026-08-19 (phat hien khi ra soat sau khi them phim tat Esc cho Drawer o Phase 4): PHAI
      // stopPropagation - neu khong, Esc dong dropdown gia y O DAY xong VAN tiep tuc bubble len toi
      // Drawer.tsx (component nay dung ben trong DonHangDetailModal luc sua don), khien Esc dong
      // NHAM ca Drawer va mat du lieu dang sua dang do.
      e.stopPropagation();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className={className}>
    <div className="flex items-center gap-1.5">
      <div ref={containerRef} className="relative flex-1 min-w-0">
        <input
          type="text"
          disabled={disabled}
          // CHOT (phan hoi 2026-08-19 #6): autoFocus CHI dung boi dong "vua duoc them" (TaoDonTab
          // truyen justAdded) - chuyen thang trong tam man hinh vao o nhap ma LK, khoi nguoi dung phai
          // tu cuon/bam tim, nhung KHONG anh huong cac lan mo lai 1 dong da co san (se cuop focus
          // ngoai y muon khoi truong khac ho dang dinh sua).
          autoFocus={autoFocus}
          value={open ? query : selected ? formatLkLabel(selected.ma_linh_kien, selected.ten_linh_kien) : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            setQuery("");
          }}
          // SUA HOI QUY TAB: dong dropdown khi input mat focus (vd nguoi dung bam Tab roi di) - truoc
          // day CHI dong khi bam ra ngoai (mousedown), Tab roi khoi khong kich hoat gi nen dropdown
          // treo lai tren man hinh du focus da chuyen di noi khac. onMouseDown cua nut ket qua da
          // preventDefault() nen bam chon bang chuot van an toan, khong bi blur cuop truoc.
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder={t("Gõ để tìm…")}
          className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--ink-900)] disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <DropdownPortal anchorRef={containerRef} contentRef={dropdownRef} open={open} maxHeight={288} className="rounded-lg py-1">
          {flatResults.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--ink-400)]">
              <span className="italic">{t("Không tìm thấy.")}</span>
              {kqTim.goiY && (
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setQuery(kqTim.goiY!);
                  }}
                  className="ml-1 text-[var(--color-link)] hover:underline"
                >
                  {t("Có phải bạn muốn tìm")} “<b>{kqTim.goiY}</b>”?
                </button>
              )}
            </div>
          ) : (
            <>
              {(() => {
                let idx = 0;
                return nhom.map((n, ni) => (
                  <div key={ni}>
                    {n.tieuDe && (
                      <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-400)]">{n.tieuDe}</div>
                    )}
                    {n.items.map((o) => {
                      const i = idx++;
                      return (
                        <LinhKienPickerRow
                          key={o.ma_linh_kien}
                          o={o}
                          rank={rankMap.get(o.ma_linh_kien)}
                          selected={o.ma_linh_kien === value}
                          highlighted={i === highlightIdx}
                          onPick={() => pick(o.ma_linh_kien)}
                          toDam={kqTim.toDam}
                          soLanChon={lichSu.soLanChon.get(o.ma_linh_kien)}
                        />
                      );
                    })}
                  </div>
                ));
              })()}
              {truncatedCount > 0 && (
                <div className="px-3 py-1.5 text-[10px] text-[var(--ink-400)] text-center border-t border-[var(--line)] mt-1">
                  {t("Còn {n} kết quả khác — gõ thêm để thu hẹp", { n: truncatedCount })}
                </div>
              )}
            </>
          )}
        </DropdownPortal>
      </div>
      {/* CHOT (phan hoi 2026-08-18): nut xem chi tiet - chi hien khi DA CHON 1 linh kien, mo modal
          xem (va sua neu co quyen quan_ly_danh_muc_lk) - xem LinhKienDetailModal ben duoi. */}
      {selected && !selected.combo && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowDetail(true)}
          title={t("Xem chi tiết linh kiện")}
          className="focus-ring shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--line)] bg-white text-[var(--ink-500)] hover:text-[var(--ocean-600)] hover:border-[var(--ocean-400)]"
        >
          ℹ️
        </button>
      )}
    </div>
    {/* Note "linh kien dac thu" (them 2026-08-25, phan hoi "khi chọn 1 lk thuộc diện đặc thù, bên
        dưới sẽ hiện 1 note nhỏ màu nổi bật... nếu đặc thù = true thì thêm cảnh báo về việc linh kiện
        này sẽ phải chờ TBP duyệt") - 2 dong DOC LAP: dong "Phân loại đặc thù" CHI hien khi truong do
        co gia tri (bo trong thi khong hien dong nay); dong canh bao TBP LUON hien khi dac_thu, khong
        phu thuoc phan_loai_dac_thu co dien hay khong. */}
    {selected?.combo && <ComboThanhPhanNote combo={selected.combo} />}
    {lkCamBanVoiLoai(selected, loaiDeXuat) && (
      <div role="alert" className="mt-1.5 rounded-lg border border-[var(--coral-500)]/40 bg-[var(--coral-100)]/60 px-2.5 py-1.5 text-xs font-semibold text-[var(--coral-700)]">
        {t("⚠ Linh kiện cấm bán — không đặt được với loại MUA HÀNG / MUA HÀNG CÓ ID, chọn loại đề xuất khác hoặc linh kiện khác.")}
      </div>
    )}
    {selected?.dac_thu ? (
      <div className="mt-1.5 rounded-lg border border-[var(--amber-500)] bg-[var(--amber-100)] px-2.5 py-1.5 text-xs text-[var(--amber-700)] space-y-0.5">
        {selected.phan_loai_dac_thu?.trim() && <div className="font-semibold">{t("🔖 Phân loại đặc thù:")} {selected.phan_loai_dac_thu.trim()}</div>}
        {!boQuaTbpDacThu(loaiDeXuat) && <div>{t("⚠ Linh kiện đặc thù — đơn sẽ cần chờ TP DVBH xác nhận trước khi Tác nghiệp duyệt.")}</div>}
      </div>
    ) : selected?.phan_loai_dac_thu?.trim() ? (
      // Them (yeu cau nguoi dung 2026-08-27): mot so linh kien dac_thu=0 (KHONG can TP DVBH xac nhan,
      // luong duyet giu nguyen binh thuong) nhung van co gan phan_loai_dac_thu - chi hien note NHAC
      // NHO nhe hon (khong co cau "cần chờ TP DVBH xác nhận"), KHONG dung selected.dac_thu de tranh
      // dung nham logic cho luong duyet o backend.
      <div className="mt-1.5 rounded-lg border border-[var(--amber-500)] bg-[var(--amber-100)] px-2.5 py-1.5 text-xs text-[var(--amber-700)]">
        {t("(!) Linh kiện thuộc diện \"{loai}\"", { loai: selected.phan_loai_dac_thu.trim() })}
      </div>
    ) : null}
    {showDetail && selected && (
      <LinhKienDetailModal
        part={selected}
        rank={rankMap.get(selected.ma_linh_kien)}
        onClose={() => setShowDetail(false)}
      />
    )}
    </div>
  );
}

// Danh sach LK thanh phan duoi o chon khi chon 1 combo - bao truoc la khi tao don se tach thanh tung don (SL = SL combo x SL).
function ComboThanhPhanNote({ combo }: { combo: NonNullable<LkDanhMucRow["combo"]> }) {
  return (
    <div className="mt-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-100)] px-2.5 py-1.5 text-xs text-[var(--ink-700)]">
      <div className="font-semibold text-[var(--ink-900)] mb-0.5">{t("🧩 Combo gồm {n} linh kiện — khi tạo đơn hệ thống tự tách thành {n} đơn:", { n: combo.ct.length })}</div>
      <ul className="space-y-0.5">
        {combo.ct.map((tp) => (
          <li key={tp.ma_lk} className="flex items-center gap-2 min-w-0">
            <span className="truncate flex-1 min-w-0">• {formatLkLabel(tp.ma_lk, tp.ten_lk ?? tp.ma_lk)}</span>
            <span className="shrink-0 font-mono text-[var(--ink-500)]">×{tp.so_luong}/{t("bộ")}</span>
            {tp.gia_ban != null && <span className="shrink-0 font-mono font-semibold text-[var(--green-700)]"><Money>{fmtVND(tp.gia_ban)}</Money></span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// SUA (phan hoi 2026-08-18 lan 2: "hinh anh dang bi qua nho") - LinhKienThumbMini (28-56px) chi hop
// lam thumbnail trong danh sach/dong ket qua, KHONG hop cho man hinh "xem chi tiet" noi nguoi dung
// muon nhin ro anh that su. Component rieng nay dung khung TY LE CO DINH 4:3 + object-contain (thay
// vi object-cover cat vuong nhu thumbnail) - phong theo DUNG khuon mau PartHeroImage cua
// DanhMucLinhKienModule.tsx (da giai dung bai toan "anh chi tiet") nhung KHONG import cheo module (giu
// nguyen tinh than da chot o LinhKienThumbMini), tu viet lai rieng cho modal nay.
export function LinhKienHeroImage({ url, alt }: { url: string | null; alt: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(url ? "loading" : "error");
  useEffect(() => setStatus(url ? "loading" : "error"), [url]);
  return (
    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-[var(--line)] bg-[var(--surface-100)]">
      {status === "loading" && <div className="img-skeleton absolute inset-0 bg-[var(--surface-200)]" />}
      {url && status !== "error" && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`w-full h-full object-contain transition-opacity duration-300 ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[var(--ink-400)]">
          <span className="text-3xl">🖼️</span>
          <span className="text-xs font-medium">{url ? t("Không tải được ảnh") : t("Chưa có ảnh minh hoạ")}</span>
        </div>
      )}
    </div>
  );
}

// Modal XEM (chi doc) gon cho 1 linh kien, mo tu LinhKienPicker (phan hoi 2026-08-18: "bổ sung nút
// xem chi tiết"). CO Y XAY MOI thay vi tai dung PartDetailDrawer cua DanhMucLinhKienModule.tsx - xem
// comment cu (tranh ghep noi cheo 2 module khong lien quan). CHOT 2026-09-12 (tich hop gia88 lam
// nguon chinh gia): BO HAN nut "Sửa thông tin" - moi truong modal nay tung cho sua (ten_linh_kien/
// gia_ban/gia_tham_chieu) deu chuyen "chi xem" (dong bo tu doi tac), sua don_vi/ghi_chu (khong dong
// bo) gio lam qua DanhMucLinhKienModule.tsx nhu binh thuong, khong can 1 form rieng o day nua.
export function LinhKienDetailModal({
  part, rank, onClose,
}: {
  part: LkDanhMucRow; rank: number | undefined; onClose: () => void;
}) {
  // QA 2026-08-19 (phat hien khi ra soat sau Phase 4): modal nay co the mo TREN 1 Drawer dang sua don
  // (DonHangDetailModal -> LinhKienPicker -> nut "i" -> modal nay). Modal.tsx KHONG tu dong Esc (co
  // chu dinh, xem Modal.tsx), nen neu khong chan o day, Esc se xuyen thang qua toi Drawer.tsx ben
  // duoi va dong NHAM ca phien sua dang do. Bat o CAPTURE phase (chay TRUOC moi listener bubble khac,
  // ke ca listener cua Drawer) de chan tan goc, khong phu thuoc vao phan tu nao dang focus.
  useEffect(() => {
    function onKeyDownCapture(e: KeyboardEvent) {
      if (e.key === "Escape") e.stopPropagation();
    }
    window.addEventListener("keydown", onKeyDownCapture, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDownCapture, { capture: true });
  }, []);

  return (
    <Modal open title={t("🔍 Chi tiết linh kiện")} onClose={onClose} width="max-w-md">
      <div className="space-y-4 text-sm">
        <LinhKienHeroImage url={part.anh_demo ?? null} alt={part.ten_linh_kien} />
        {/* SUA BUG GIAO DIEN (phan hoi 2026-09-12, kem anh chup "2014010043" hien 2 lan - 1 lan rieng o
            day, 1 lan lap lai trong chinh ten_linh_kien dang "[2014010043]") - truoc day hien rieng
            ma_linh_kien o dong tren, KHONG dung formatLkLabel() nhu moi noi khac trong CUNG file nay
            (option rows/o tim kiem, xem cac dong goi formatLkLabel ben tren) - doi ve dung 1 ham chung,
            ma chi con xuat hien 1 LAN duy nhat: ghep sau ten (neu ten CHUA chua san ma) hoac giu
            nguyen ten (neu ten DA chua san ma, tranh lap 2 lan). */}
        <div className="min-w-0">
          <div className="font-display font-bold text-base text-[var(--ocean-800)] leading-snug">{formatLkLabel(part.ma_linh_kien, part.ten_linh_kien)}</div>
        </div>
        {rank != null && <Badge tone="warning">{t("🔥 Hạng #{n} trong 30 ngày gần nhất", { n: rank })}</Badge>}

        <div>
          <KvRow label={t("Giá NY")}>
            <span className="font-semibold font-mono text-[var(--green-700)]"><Money>{fmtVND(part.gia_ban)}</Money></span>
          </KvRow>
          <KvRow label={t("Giá KTV")}>
            <span className="font-semibold font-mono text-[var(--green-700)]"><Money>{fmtVND(part.gia_tri_cong_no ?? null)}</Money></span>
          </KvRow>
          <KvRow label={t("Phân loại")}>
            <span className="font-semibold">{part.don_vi ?? "—"}</span>
          </KvRow>
          {!!part.cam_ban && (
            <KvRow label={t("Cấm bán")}>
              <Badge tone="danger">{t("Cấm bán (đối tác)")}</Badge>
            </KvRow>
          )}
          {!!part.dac_thu && (
            <KvRow label={t("Phân loại đặc thù")}>
              <span className="font-semibold">{part.phan_loai_dac_thu?.trim() || "—"}</span>
            </KvRow>
          )}
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[var(--ink-400)] uppercase tracking-wide mb-1">{t("Ghi chú")}</div>
          <div className="text-[var(--ink-700)] whitespace-pre-wrap">{part.ghi_chu?.trim() || <span className="text-[var(--ink-400)]">{t("Không có ghi chú.")}</span>}</div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" size="sm" onClick={onClose}>{t("Đóng")}</Btn>
      </div>
    </Modal>
  );
}
