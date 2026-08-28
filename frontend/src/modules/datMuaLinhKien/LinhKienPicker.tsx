import { useState, useEffect, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { DropdownPortal } from "../../components/ui/DropdownPortal";
import { KvRow } from "../../components/ui/KvRow";
import { api } from "../../api/client";
import { fmtVND } from "../../types";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../auth/AuthContext";
import { usePublicSheetCache } from "../../lib/publicSheetCache";
import type { LkDanhMucRow } from "./types";
import { describeApiError, useLinhKienRankMap, formatLkLabel } from "./helpers";

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
      addToast(`Đã thêm ${maLk} vào nhóm thay thế`);
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
          <span className="text-[var(--ink-500)]">Có thể thay thế bằng:</span>
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
            { value: "", label: "+ Thêm vào nhóm thay thế" },
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
      <span className="text-[var(--ink-500)]">Có thể đặt thay thế bằng:</span>
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
  o, rank, selected, highlighted, onPick,
}: { o: LkDanhMucRow; rank: number | undefined; selected: boolean; highlighted: boolean; onPick: () => void }) {
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
        <span className="block truncate font-medium text-[var(--ocean-800)]">{formatLkLabel(o.ma_linh_kien, o.ten_linh_kien)}</span>
        {rank != null && rank <= 5 && <span className="text-[10px] font-semibold text-[var(--amber-700)]">🔥 #{rank} hay đặt (30 ngày)</span>}
      </span>
      {o.gia_ban != null && <span className="shrink-0 text-[11px] text-[var(--green-700)] font-mono font-semibold">{fmtVND(o.gia_ban)}</span>}
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
  value, onChange, options, disabled = false, className = "", autoFocus = false,
}: {
  value: string; onChange: (v: string) => void; options: LkDanhMucRow[]; disabled?: boolean; className?: string; autoFocus?: boolean;
}) {
  const rankMap = useLinhKienRankMap();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const addToast = useToast();
  const qc = useQueryClient();
  const auth = useAuth();
  const canEditDanhMuc = auth.status === "authenticated" && !!(auth.user.quan_ly_danh_muc_lk || auth.user.vai_tro === "Admin");

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

  const q = query.trim().toLowerCase();
  // SUA LAG: useMemo - chi tinh lai loc/sap xep/cap so dong khi options, tu khoa, hoac rankMap
  // THUC SU doi, khong phai moi lan component cha re-render vi ly do khac.
  const { ranked, unranked, totalMatched } = useMemo(() => {
    const matched = q ? options.filter((o) => `${o.ma_linh_kien} ${o.ten_linh_kien}`.toLowerCase().includes(q)) : options;
    const rankedFull = matched.filter((o) => rankMap.has(o.ma_linh_kien)).sort((a, b) => rankMap.get(a.ma_linh_kien)! - rankMap.get(b.ma_linh_kien)!);
    const unrankedFull = matched.filter((o) => !rankMap.has(o.ma_linh_kien)).sort((a, b) => a.ten_linh_kien.localeCompare(b.ten_linh_kien));
    const rankedShown = rankedFull.slice(0, LINH_KIEN_PICKER_MAX_RESULTS);
    const unrankedShown = unrankedFull.slice(0, Math.max(0, LINH_KIEN_PICKER_MAX_RESULTS - rankedShown.length));
    return { ranked: rankedShown, unranked: unrankedShown, totalMatched: rankedFull.length + unrankedFull.length };
  }, [options, q, rankMap]);
  const flatResults = useMemo(() => [...ranked, ...unranked], [ranked, unranked]);
  const shownCount = flatResults.length;
  const truncatedCount = totalMatched - shownCount;

  useEffect(() => setHighlightIdx(0), [q, open]);

  function pick(maLinhKien: string) {
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
          placeholder="Gõ để tìm…"
          className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--ink-900)] disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <DropdownPortal anchorRef={containerRef} contentRef={dropdownRef} open={open} maxHeight={288} className="rounded-lg py-1">
          {ranked.length === 0 && unranked.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--ink-400)] italic">Không tìm thấy.</div>
          ) : (
            <>
              {ranked.map((o, i) => (
                <LinhKienPickerRow
                  key={o.ma_linh_kien}
                  o={o}
                  rank={rankMap.get(o.ma_linh_kien)}
                  selected={o.ma_linh_kien === value}
                  highlighted={i === highlightIdx}
                  onPick={() => pick(o.ma_linh_kien)}
                />
              ))}
              {ranked.length > 0 && unranked.length > 0 && (
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-400)] text-center">── Linh kiện khác ──</div>
              )}
              {unranked.map((o, i) => (
                <LinhKienPickerRow
                  key={o.ma_linh_kien}
                  o={o}
                  rank={undefined}
                  selected={o.ma_linh_kien === value}
                  highlighted={ranked.length + i === highlightIdx}
                  onPick={() => pick(o.ma_linh_kien)}
                />
              ))}
              {truncatedCount > 0 && (
                <div className="px-3 py-1.5 text-[10px] text-[var(--ink-400)] text-center border-t border-[var(--line)] mt-1">
                  Còn {truncatedCount} kết quả khác — gõ thêm để thu hẹp
                </div>
              )}
            </>
          )}
        </DropdownPortal>
      </div>
      {/* CHOT (phan hoi 2026-08-18): nut xem chi tiet - chi hien khi DA CHON 1 linh kien, mo modal
          xem (va sua neu co quyen quan_ly_danh_muc_lk) - xem LinhKienDetailModal ben duoi. */}
      {selected && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowDetail(true)}
          title="Xem chi tiết linh kiện"
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
    {selected?.dac_thu ? (
      <div className="mt-1.5 rounded-lg border border-[var(--amber-500)] bg-[var(--amber-100)] px-2.5 py-1.5 text-xs text-[var(--amber-700)] space-y-0.5">
        {selected.phan_loai_dac_thu?.trim() && <div className="font-semibold">🔖 Phân loại đặc thù: {selected.phan_loai_dac_thu.trim()}</div>}
        <div>⚠ Linh kiện đặc thù — đơn sẽ cần chờ TP DVBH xác nhận trước khi Tác nghiệp duyệt.</div>
      </div>
    ) : selected?.phan_loai_dac_thu?.trim() ? (
      // Them (yeu cau nguoi dung 2026-08-27): mot so linh kien dac_thu=0 (KHONG can TP DVBH xac nhan,
      // luong duyet giu nguyen binh thuong) nhung van co gan phan_loai_dac_thu - chi hien note NHAC
      // NHO nhe hon (khong co cau "cần chờ TP DVBH xác nhận"), KHONG dung selected.dac_thu de tranh
      // dung nham logic cho luong duyet o backend.
      <div className="mt-1.5 rounded-lg border border-[var(--amber-500)] bg-[var(--amber-100)] px-2.5 py-1.5 text-xs text-[var(--amber-700)]">
        (!) Linh kiện thuộc diện "{selected.phan_loai_dac_thu.trim()}"
      </div>
    ) : null}
    {showDetail && selected && (
      <LinhKienDetailModal
        part={selected}
        rank={rankMap.get(selected.ma_linh_kien)}
        canEdit={canEditDanhMuc}
        onClose={() => setShowDetail(false)}
        addToast={addToast}
        qc={qc}
      />
    )}
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
          <span className="text-xs font-medium">{url ? "Không tải được ảnh" : "Chưa có ảnh minh hoạ"}</span>
        </div>
      )}
    </div>
  );
}

// Modal xem + sua gon cho 1 linh kien, mo tu LinhKienPicker (phan hoi 2026-08-18: "bổ sung nút xem
// chi tiết"). CO Y XAY MOI thay vi tai dung PartDetailDrawer cua DanhMucLinhKienModule.tsx - component
// do gan chat voi state/mutation rieng cua module quan ly danh muc (form them/sua, upload anh hang
// loat...), khong tach roi duoc ma khong keo theo ca mo hinh du lieu cua module do (dung tinh than
// "tranh ghep noi cheo 2 module khong lien quan" da chot khi viet LinhKienThumbMini). Modal nay gon
// hon nhieu (khong drawer/lightbox/upload hang loat) vi ngu canh la "tra cuu nhanh luc dang tao don",
// khong phai man hinh quan tri danh muc. Doc du lieu tu CHINH `options` da co san trong bo nho (khong
// goi API moi), chi ghi qua dung API PATCH /lk-settings/danh-muc/:ma ma DanhMucLinhKienModule dang
// dung, gioi han sua theo dung quyen quan_ly_danh_muc_lk.
export function LinhKienDetailModal({
  part, rank, canEdit, onClose, addToast, qc,
}: {
  part: LkDanhMucRow; rank: number | undefined; canEdit: boolean;
  onClose: () => void; addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>;
}) {
  const [isEdit, setIsEdit] = useState(false);
  const [draft, setDraft] = useState({
    ten_linh_kien: part.ten_linh_kien,
    gia_ban: part.gia_ban != null ? String(part.gia_ban) : "",
    gia_tham_chieu: part.gia_tham_chieu != null ? String(part.gia_tham_chieu) : "",
    don_vi: part.don_vi ?? "",
    ghi_chu: part.ghi_chu ?? "",
  });

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

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/lk-settings/danh-muc/${part.ma_linh_kien}`, {
        ten_linh_kien: draft.ten_linh_kien.trim(),
        gia_ban: draft.gia_ban.trim() ? Number(draft.gia_ban) : null,
        gia_tham_chieu: draft.gia_tham_chieu.trim() ? Number(draft.gia_tham_chieu) : null,
        don_vi: draft.don_vi.trim() || null,
        ghi_chu: draft.ghi_chu.trim() || null,
      }),
    onSuccess: () => {
      addToast("Đã cập nhật thông tin linh kiện");
      setIsEdit(false);
      // Cache rieng cua module "Dat mua linh kien" (linhKienCache.ts, IndexedDB) tu cap nhat o lan
      // dong bo incremental ke tiep (useLkAndLdeCache doc theo ngay_cap_nhat) - khong force refetch
      // toan bo danh muc o day de tranh 1 lan doc lai ~vai nghin dong chi vi sua 1 linh kien.
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  return (
    <Modal open title="🔍 Chi tiết linh kiện" onClose={onClose} width="max-w-md">
      <div className="space-y-4 text-sm">
        <LinhKienHeroImage url={part.anh_demo ?? null} alt={part.ten_linh_kien} />
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-[var(--ocean-600)]">{part.ma_linh_kien}</div>
          <div className="font-display font-bold text-base text-[var(--ocean-800)] leading-snug">{part.ten_linh_kien}</div>
        </div>
        {rank != null && <Badge tone="amber">🔥 Hạng #{rank} trong 30 ngày gần nhất</Badge>}

        {isEdit ? (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Tên linh kiện</label>
              <input value={draft.ten_linh_kien} onChange={(e) => setDraft((d) => ({ ...d, ten_linh_kien: e.target.value }))} className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Giá bán</label>
                <input type="number" value={draft.gia_ban} onChange={(e) => setDraft((d) => ({ ...d, gia_ban: e.target.value }))} className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Giá tham chiếu</label>
                <input type="number" value={draft.gia_tham_chieu} onChange={(e) => setDraft((d) => ({ ...d, gia_tham_chieu: e.target.value }))} className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Phân loại</label>
              <input value={draft.don_vi} onChange={(e) => setDraft((d) => ({ ...d, don_vi: e.target.value }))} className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Ghi chú</label>
              <input value={draft.ghi_chu} onChange={(e) => setDraft((d) => ({ ...d, ghi_chu: e.target.value }))} className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
          </div>
        ) : (
          <>
            <div>
              <KvRow label="Giá bán">
                <span className="font-semibold font-mono text-[var(--green-700)]">{fmtVND(part.gia_ban)}</span>
              </KvRow>
              <KvRow label="Giá tham chiếu">
                <span className="font-semibold font-mono text-[var(--green-700)]">{fmtVND(part.gia_tham_chieu ?? null)}</span>
              </KvRow>
              <KvRow label="Phân loại">
                <span className="font-semibold">{part.don_vi ?? "—"}</span>
              </KvRow>
              {!!part.dac_thu && (
                <KvRow label="Phân loại đặc thù">
                  <span className="font-semibold">{part.phan_loai_dac_thu?.trim() || "—"}</span>
                </KvRow>
              )}
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[var(--ink-400)] uppercase tracking-wide mb-1">Ghi chú</div>
              <div className="text-[var(--ink-700)] whitespace-pre-wrap">{part.ghi_chu?.trim() || <span className="text-[var(--ink-400)]">Không có ghi chú.</span>}</div>
            </div>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        {isEdit ? (
          <>
            <Btn variant="ghost" size="sm" onClick={() => setIsEdit(false)} disabled={saveMutation.isPending}>Huỷ</Btn>
            <Btn size="sm" onClick={() => saveMutation.mutate()} disabled={!draft.ten_linh_kien.trim() || saveMutation.isPending}>Lưu</Btn>
          </>
        ) : (
          <>
            <Btn variant="ghost" size="sm" onClick={onClose}>Đóng</Btn>
            {canEdit && <Btn size="sm" onClick={() => setIsEdit(true)}>✎ Sửa thông tin</Btn>}
          </>
        )}
      </div>
    </Modal>
  );
}
