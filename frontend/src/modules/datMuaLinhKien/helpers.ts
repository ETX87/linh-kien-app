import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api/client";
import { getAllFromCache, getLastCacheTimestamp, mergeLinhKienToCache, ensureCacheSchemaVersion } from "../../lib/linhKienCache";
import { getAllLdeFromCache, clearLdeCache, mergeLdeToCache, type LdeEntry } from "../../lib/loaiDeXuatCache";
import type { Tone } from "../../components/x/Badge";
import type { LkDanhMucRow, NguoiNhanHangKhaDungRow, DonHangDraft, DonHangRow, KtvDisplayMap, XepHangLinhKienRow } from "./types";
import { YEU_CAU_HOA_DON_OPTIONS, GENERIC_ERROR_MESSAGES } from "./constants";

// Ham/hook thuan (khong JSX) dung chung nhieu tab, tach tu DatMuaLinhKienModule.tsx (UI redesign
// Phase 3, phan hoi Codex 2026-08-19).

export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.detail) return err.detail;
    const known = GENERIC_ERROR_MESSAGES[err.code ?? ""];
    if (known) return known;
    return `không xác định (mã: ${err.code ?? err.status})`;
  }
  return err instanceof Error ? err.message : String(err);
}

// Dot 3 gop y #7: hien ten KTV thay vi email tho khap module. Dung chung 1 nguon
// (GET /dat-mua-lk/nguoi-nhan-hang-kha-dung, da mo cho moi nguoi da dang nhap - xem backend) build
// Map email -> {ma_ktv, ten_hien_thi}, dung react-query cache mac dinh (khong can fetch lai nhieu lan
// vi cac component deu dung chung 1 queryKey).
export function useKtvDisplayMap(): KtvDisplayMap {
  const { data } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: { ma_ktv: string; ten_hien_thi: string | null; email_dang_nhap: string }[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
  });
  return new Map((data?.rows ?? []).map((r) => [r.email_dang_nhap, { ma_ktv: r.ma_ktv, ten_hien_thi: r.ten_hien_thi }]));
}

// SUA BUG (phan hoi 2026-08-18): "luồng quy trình" (PipelineFlow) + 3 nut sub-tab so luong dung 2
// query rieng (`dat-mua-lk-luong-quy-trinh`, `dat-mua-lk-loai-don-counts`) voi refetchInterval 5 phut
// - truoc day KHONG co mutation nao invalidate 2 query nay, nen sau khi nguoi dung thao tac xong 1
// buoc (duyet/tu choi/tao PXK/...) so dem tren pipeline VAN CU cho toi khi refetchInterval tu kich
// hoat hoac F5 thu cong. Goi ham nay trong onSuccess cua MOI mutation lam doi trang thai luong (tao
// don, sua don, duyet/tu choi/huy, thieu_lk, tra_hang, PXK) de so dem cap nhat NGAY, khong can F5.
export function invalidatePipelineCounts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["dat-mua-lk-luong-quy-trinh"] });
  qc.invalidateQueries({ queryKey: ["dat-mua-lk-loai-don-counts"] });
  // FIX (phan hoi QA 2026-08-31, muc #10): thieu key nay khien so "(x1)" canh 3 nut sub-tab Mua
  // hang/Cong no/Tra hang trong PhieuXuatKhoTab.tsx khong cap nhat ngay sau khi tao/doi trang thai 1
  // PXK - phai doi tab di roi quay lai (remount) moi thay dung.
  qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-loai-counts"] });
  // FIX (phan hoi QA 2026-08-31, muc #8): so "(x123)" canh 3 nut chon Loai phieu trong modal "Tao
  // phieu xuat kho" cung phai cap nhat ngay khi 1 don duoc duyet xong ("TN da duyet" - moi tro nen kha
  // dung tao PXK) hoac khi 1 PXK moi vua duoc tao (dong da chon khong con kha dung nua).
  qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung-counts"] });
  // Them (2026-09-01, doi TrangThaiChipFilter -> TrangThaiDropdownFilter co hien so "(N)" canh moi
  // trang thai) - 3 key nay dung prefix chung cho CA HO query (vd
  // ["dat-mua-lk-don-hang-status-counts", loaiDon] cho tung sub-tab), invalidateQueries voi CHI phan
  // dau mang se khop MOI bien the tham so, khong can liet ke tung loaiDon rieng.
  qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-status-counts"] });
  qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-status-counts"] });
  qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk-status-counts"] });
  // Badge Sidebar/BottomTabBar (vd "Thiếu linh kiện (x1)", them 2026-09-28) - cap nhat ngay sau thao tac.
  qc.invalidateQueries({ queryKey: ["notifications-count"] });
  // Tong dat Mua + TRỪ CÔNG NỢ trong ngay cua KTV (TongNgayKtv.tsx, them 2026-09-28).
  qc.invalidateQueries({ queryKey: ["dat-mua-lk-tong-ngay-ktv"] });
}

export function formatNguoiDisplay(email: string, map: KtvDisplayMap): string {
  const entry = map.get(email);
  if (!entry) return email;
  // RA SOAT 2026-08-18: GS tu nhan hang khong co ma_ktv that (backend tra chuoi rong) - bo phan
  // "(ma_ktv)" thay vi hien "() Ten" xau.
  const ten = entry.ten_hien_thi ?? email;
  // FIX (phan hoi 2026-08-27): 1 so KTV "mo coi" duoc tao ma_ktv = chinh email luc sua du lieu (chua
  // co ma that) - neu ghep nguyen se ra "(email) Ten (email)" lap 2 lan xau. Bo phan "(ma_ktv)" khi no
  // trung voi email.
  // FIX (phan hoi 2026-09-10: "tên người dùng đang bị lặp" - vd "(Minhqdl.mb1) (Minhqdl.mb1) CTV...")
  // - thieu cung 1 dieu kien voi ktvOptionLabel() ben duoi: nhieu ten_hien_thi da TU chua san ma_ktv
  // trong chuoi (nguoi dung tu go luc sua), ghep them tien to "(ma_ktv)" truoc do khien ma hien LAP 2
  // LAN. Kiem tra chuoi con (khong phan biet hoa/thuong) truoc khi ghep, giong ktvOptionLabel.
  const base = entry.ma_ktv && entry.ma_ktv !== email && !ten.toLowerCase().includes(entry.ma_ktv.toLowerCase())
    ? `(${entry.ma_ktv}) ${ten}`
    : ten;
  // SUA (phan hoi 2026-09-12: "Tên user bỏ gmail phía sau (trường hợp không có tên mới hiện theo
  // mail)") - truoc day ghep them "(email)" o cuoi de dong nhat voi formatPersonDisplay toan he
  // thong, gio ca 2 ham cung doi sang KHONG ghep email sau ten that (base da tu fallback ve email khi
  // khong co ten_hien_thi, xem 2 dong tren).
  return `👤 ${base}`;
}

// CHOT (ra soat "Tao Don Linh Kien 2.0" #2): hien them "(GS: Ten GS)" sau ten KTV trong cac Select
// chon "nguoi nhan hang" - CHI khi danh sach dang xem gom NHIEU HON 1 GS khac nhau (TN chon giua
// nhieu GS quan ly). GS tu xem chi thay dung KTV cua minh (danh sach dong nhat 1 GS) nen tu dong bo
// qua, tranh hien thua "(GS: chinh minh)".
// SUA (phan hoi 2026-08-21: "nếu ID ktv có bên trong tên ktv thì không cần thêm tiền tố mã KTV") -
// cung y tuong voi formatLkLabel (kiem tra chuoi con truoc khi ghep tien to) - nhieu ten_hien_thi da
// TU chua san ma_ktv trong chuoi, ghep them "ma_ktv - " truoc do khien ma hien LAP 2 LAN thua thai.
export function ktvOptionLabel(r: NguoiNhanHangKhaDungRow, allRows: NguoiNhanHangKhaDungRow[]): string {
  const ten = r.ten_hien_thi ?? r.email_dang_nhap;
  // FIX (phan hoi 2026-08-27): ma_ktv "mo coi" = chinh email (xem formatNguoiDisplay) khong phai ma
  // that, khong nen hien nhu 1 tien to ma.
  const base = r.ma_ktv && r.ma_ktv !== r.email_dang_nhap && !ten.toLowerCase().includes(r.ma_ktv.toLowerCase()) ? `${r.ma_ktv} - ${ten}` : ten;
  const distinctGs = new Set(allRows.map((x) => x.ten_gs).filter((x): x is string => !!x));
  return distinctGs.size > 1 && r.ten_gs ? `${base} (GS: ${r.ten_gs})` : base;
}

// CHOT (phan hoi 2026-08-19: "trong tên linh kiện đã có mã linh kiện thì không cần thêm tiền tố") -
// nhieu ten_linh_kien trong danh muc da TU chua san ma o dang "[ma]"/"(ma)" trong chuoi (vd "Bóng đèn
// UV 6W (2 chân) [2014010043]") - ghep them tien to "ma - " nhu truoc day khien ma hien LAP 2 LAN.
// Kiem tra chuoi con (khong phan biet hoa/thuong) truoc: neu ten da chua ma thi GIU NGUYEN ten, nguoc
// lai moi them "(ma)" o CUOI thay vi tien to o dau.
export function formatLkLabel(maLinhKien: string, tenLinhKien: string): string {
  if (tenLinhKien.toLowerCase().includes(maLinhKien.toLowerCase())) return tenLinhKien;
  return `${tenLinhKien} (${maLinhKien})`;
}

export function trangThaiLabel(options: { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

// Co bat/tat "nen anh tra hang truoc khi upload" (them 2026-08-24, phan hoi "cơ chế nén ảnh này cho
// tôi bật tắt tuỳ chỉnh trong settings") - doc tu GET /settings/app-settings (Admin doi qua
// SettingsModule.tsx > tab Google Drive), dung o TraHangAnhPicker (SharedUi.tsx) va QcTuChoiModal
// (TraHangTab.tsx) truoc khi goi compressImage(). Mac dinh true (bat) khi chua tai xong/loi, khop
// dung fallback cua backend khi chua co dong nao trong app_settings.
export function useNenAnhTraHangEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => api.get<{ nen_anh_tra_hang: boolean }>("/settings/app-settings"),
    staleTime: 5 * 60_000,
  });
  return data?.nen_anh_tra_hang ?? true;
}

// CHOT (phan hoi 2026-08-24, muc 4): "Đơn ở thẻ công nợ do người khác tạo hộ (người tạo không phải
// người nhận) => khi Tác nghiệp duyệt sẽ hiện popup cảnh báo" - dung o DonCuaToiTab.tsx (ca Drawer
// DonHangDetailModal lan nut nhanh trong DonHangGroupedList) truoc khi goi mutation "duyet" that su.
export function isCongNoTaoHo(d: { loai_don: string; loai_de_xuat?: string | null; nguoi_tao: string; nguoi_nhan_hang: string | null }): boolean {
  // "TRỪ CÔNG NỢ" hoat dong nhu don mua (chot 2026-09-28) - khong canh bao "đơn công nợ tạo hộ".
  return d.loai_don === "cong_no" && !laTruCongNo(d.loai_de_xuat) && !!d.nguoi_nhan_hang && d.nguoi_tao !== d.nguoi_nhan_hang;
}

// Badge "Đơn tạo hộ" (yeu cau nguoi dung 2026-08-27) - MO RONG tu isCongNoTaoHo() o tren sang MOI
// loai_don (khong rieng cong_no): chi la 1 nhan hien thi thuan tuy gan chung voi cac badge trang
// thai/loai don khac ("Công nợ", "Chờ TN duyệt"...), KHONG kem popup canh bao nao (isCongNoTaoHo van
// giu nguyen rieng cho luong duyet cong_no o DonCuaToiTab.tsx, khong gop chung logic).
export function isDonTaoHo(d: { nguoi_tao: string; nguoi_nhan_hang: string | null }): boolean {
  return !!d.nguoi_nhan_hang && d.nguoi_tao !== d.nguoi_nhan_hang;
}

// ---------- Tab "Tao don" ----------

export function deriveLoaiDon(v: string): "mua" | "cong_no" | "tra_hang" {
  if (v.includes("TRẢ HÀNG")) return "tra_hang";
  if (v.includes("CÔNG NỢ") || v.includes("HỖ TRỢ") || v.includes("TRỪ CÔNG NỢ") || v.includes("THẺ BẢO HÀNH"))
    return "cong_no";
  return "mua";
}

// Mau/nhan theo loai don - khop DUNG UI_SPEC.md §2.8 (DataTable, 2026-09-10): "Loại (Badge Mua=info /
// Công nợ=purple)" o cot Mua hang, "Loại (Badge 'Trả hàng'=warning)" o cot Tra hang.
export const LOAI_DON_TONE: Record<ReturnType<typeof deriveLoaiDon>, { tone: Tone; label: string; border: string }> = {
  mua: { tone: "info", label: "Mua hàng", border: "border-l-[var(--color-info)]" },
  cong_no: { tone: "purple", label: "Công nợ", border: "border-l-[var(--color-purple)]" },
  tra_hang: { tone: "warning", label: "Trả hàng", border: "border-l-[var(--color-warning)]" },
};

// SUA (phan hoi 2026-09-24, kem anh chup DonCuaToiTab: "loại trả hàng đang không hiện rõ theo đúng
// loại đề xuất") - badge "Loại" truoc day CHI hien 1 trong 3 nhan gop chung (Mua hang/Cong no/Tra
// hang) du he thong co nhieu loai_de_xuat CU THE hon trong cung 1 nhom (vd "TRẢ HÀNG CÔNG NỢ"/"TRẢ
// HÀNG LK TỈNH"/"TRẢ HÀNG LK ĐẶC THÙ"/"TRẢ HÀNG DỮ TRỮ"/"TRẢ HÀNG LK KHÁC" deu gop chung ve "Trả
// hàng"). Mau badge (tone) van giu theo nhom (LOAI_DON_TONE), chi doi PHAN CHU sang dung gia tri
// loai_de_xuat nguoi dung da chon, fallback ve nhan gop khi thieu du lieu (vd dong import cu).
// Dong cong_no loai "TRỪ CÔNG NỢ..." van phai chuyen tien, tinh gia nhu don mua - khop laTruCongNo o
// backend (lib/pxkRecalculate.ts, chot 2026-09-28).
// "Giá đề xuất" = gia SAU chiet khau (phan hoi 2026-09-28: "giá đề xuất là giá thực cần chuyển tiền, giá niêm
// yết mới là 638k") - don Mua / TRỪ CÔNG NỢ lay tu tien uoc tinh server tinh (tinhToanPxk, gia chot neu co) chia SL
// tinh tien; don khac (cong no thuong/tra hang) hoac chua co so server giu gia_de_xuat (= gia ban luc tao don).
type DongTinhGia = {
  loai_don: string; loai_de_xuat: string | null; gia_de_xuat: number | null; so_luong_de_xuat: number;
  so_luong_thuc_xuat?: number | null; tien_uoc_tinh?: number | null; lk_gia_ban?: number | null;
};
const coGiaSauCk = (d: DongTinhGia) => (d.loai_don === "mua" || laTruCongNo(d.loai_de_xuat)) && d.tien_uoc_tinh != null;
export function donGiaSauChietKhau(d: DongTinhGia): number | null {
  const sl = d.so_luong_thuc_xuat ?? d.so_luong_de_xuat;
  if (coGiaSauCk(d) && sl > 0) return Math.round(d.tien_uoc_tinh! / sl);
  return d.gia_de_xuat;
}
export function tienSauChietKhau(d: DongTinhGia): number {
  return coGiaSauCk(d) ? d.tien_uoc_tinh! : (d.gia_de_xuat ?? 0) * d.so_luong_de_xuat;
}
/** Gia niem yet = gia ban hien tai trong danh muc (LK khong con trong danh muc -> gia_de_xuat luc tao don). */
export function giaNiemYet(d: DongTinhGia): number | null {
  return d.lk_gia_ban ?? d.gia_de_xuat;
}

export function laTruCongNo(loaiDeXuat: string | null | undefined): boolean {
  return (loaiDeXuat ?? "").toUpperCase().includes("TRỪ CÔNG NỢ");
}

export function loaiDonLabel(loaiDon: ReturnType<typeof deriveLoaiDon>, loaiDeXuat?: string | null): string {
  return loaiDeXuat?.trim() || LOAI_DON_TONE[loaiDon].label;
}

// Chinh sach + Ma yeu cau su co bat buoc khi Loai de xuat la cong no THAT (chua "CONG NO") nhung
// khong phai luong tra hang (da co "TRA HANG") - chot 2026-08-15, doi xung voi validate phia server
// (POST /phieu-dat, processDatDonHangImportRows trong datMuaLinhKien.ts).
export function canNoRequired(loaiDeXuat: string): boolean {
  return loaiDeXuat.includes("CÔNG NỢ") && !loaiDeXuat.includes("TRẢ HÀNG");
}

// Them 2026-09-09 (phan hoi "loại đề xuất MUA HÀNG CÓ ID bắt buộc Mã YCSC liên quan") - RIENG voi
// canNoRequired: loai nay CHI bat buoc Mã yêu cầu sự cố, KHONG bat buoc Chính sách (khac cong no bat
// buoc CA 2). Validate CA 2 PHIA, day la nguon that cho backend (xem datMuaLinhKien.ts).
export function maYcscRequired(loaiDeXuat: string): boolean {
  return canNoRequired(loaiDeXuat) || loaiDeXuat.includes("MUA HÀNG CÓ ID");
}

// To mau nhat quan cho nhan cac truong BAT BUOC (dot 3 gop y tong the: "to mau/noi bat gia tri bat
// buoc") - dung 1 kieu nhan duy nhat (mau coral khi con trong) thay vi chi 2 truong cu (Chinh sach/
// Ma yeu cau su co) co ma "*" con cac truong bat buoc khac (Ma LK/Loai de xuat/So luong) khong co.
export function reqLabelClass(missing: boolean): string {
  return `block text-[11px] font-semibold mb-1 ${missing ? "text-[var(--coral-600)]" : "text-[var(--ink-600)]"}`;
}

// Tim option Loai de xuat khop 3 nut bam nhanh pho bien nhat (MUA HANG/CONG NO/TRU CONG NO) - khop
// ca bien the co tien to ngoac nhu "(TBP DONG Y) MUA HANG" cho TN/Admin lan chuoi thuan cho KTV
// (xem migration 0061_loai_de_xuat_settings.sql).
export function pickLdeQuick(options: string[], keyword: string): string | undefined {
  return options.find((o) => o.replace(/^\([^)]*\)\s*/, "").trim() === keyword);
}


export function emptyDraft(): DonHangDraft {
  return {
    ma_lk: "", loai_de_xuat: "", so_luong_de_xuat: 1,
    ghi_chu: "", yeu_cau_hoa_don: YEU_CAU_HOA_DON_OPTIONS[0], tt_mail_duyet: "", tt_khach_hang: "", chinh_sach: "", ma_yeu_cau_su_co: "",
    uu_tien: false, anh: [],
  };
}

// Dung chung boi TaoDonTab (luon tai) va DonHangDetailModal (chi tai khi nguoi tao mo che do sua -
// tach thanh hook rieng de khong lap logic dong bo cache 2 noi, tranh lech neu sua sau nay).
export function useLkAndLdeCache(enabled: boolean) {
  const [danhMuc, setDanhMuc] = useState<LkDanhMucRow[]>([]);
  const [ldeEntries, setLdeEntries] = useState<LdeEntry[]>([]);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!enabled || syncedRef.current) return;
    syncedRef.current = true;

    (async () => {
      // Ep 1 lan full-refetch neu cache cu thieu cot moi them (xem giai thich o linhKienCache.ts).
      await ensureCacheSchemaVersion();
      // LK cache - "chi_sua_chua" (Only sua chua) loai khoi picker tao don, xem migration 0083.
      // "cam_ban" (them 2026-09-12, tich hop gia88) loai TUONG TU - van xem/tim duoc o noi khac, chi
      // khong duoc chon de tao dong don moi (CHOT nguoi dung: chi an o UI, khong chan them o backend).
      const cached = await getAllFromCache();
      if (cached.length > 0) {
        setDanhMuc(cached.filter((r) => r.bat_tat && !r.chi_sua_chua && !r.cam_ban) as unknown as LkDanhMucRow[]);
      }
      const since = await getLastCacheTimestamp();
      const url = since ? `/lk-settings/danh-muc?since=${encodeURIComponent(since)}` : "/lk-settings/danh-muc";
      const { rows } = await api.get<{ rows: LkDanhMucRow[] }>(url);
      if (rows.length > 0) {
        await mergeLinhKienToCache(rows as unknown as import("../../types").LinhKienRow[]);
        setDanhMuc((prev) => {
          const map = new Map(prev.map((r) => [r.ma_linh_kien, r]));
          for (const r of rows) map.set(r.ma_linh_kien, r);
          return Array.from(map.values()).filter((r) => r.bat_tat && !r.chi_sua_chua && !r.cam_ban);
        });
      }

      // LDE cache - full sync moi lan (dataset nho, tranh stale cache khi admin hard-delete option -
      // incremental ?since= khong biet den xoa nen cache giu row cu mai mai).
      const ldeCached = await getAllLdeFromCache();
      if (ldeCached.length > 0) setLdeEntries(ldeCached.filter((e) => e.bat_tat));
      const { rows: ldeRows } = await api.get<{ rows: LdeEntry[] }>("/settings/loai-de-xuat");
      await clearLdeCache();
      if (ldeRows.length > 0) await mergeLdeToCache(ldeRows);
      setLdeEntries(ldeRows.filter((e) => e.bat_tat));
    })();
  }, [enabled]);

  return { danhMuc, ldeEntries };
}

// CHOT (ra soat "Tao Don Linh Kien 2.0" #3): danh sach xep hang theo luot duyet thanh cong 30 ngay
// gan nhat, tinh san 1 lan/ngay o backend (xem GET /dat-mua-lk/xep-hang-linh-kien) - dung react-query
// cache mac dinh nen chi 1 request du dung o nhieu noi (TaoDonTab + DonHangDetailModal).
//
// SUA LAG (phan hoi 2026-08-18): Map duoc dung lai (useMemo) thay vi dung lai MOI LAN RENDER - truoc
// day ham nay build lai Map tu dau moi khi component cha re-render (vd nguoi dung go 1 ky tu o
// truong Ghi chu KHAC cung dang mo), khong lien quan gi den du lieu xep hang nhung van ton chi phi.
export function useLinhKienRankMap(): Map<string, number> {
  const { data } = useQuery({
    queryKey: ["dat-mua-lk-xep-hang-linh-kien"],
    queryFn: () => api.get<{ rows: XepHangLinhKienRow[] }>("/dat-mua-lk/xep-hang-linh-kien"),
  });
  return useMemo(() => {
    const map = new Map<string, number>();
    (data?.rows ?? []).forEach((r, i) => map.set(r.ma_lk, i + 1));
    return map;
  }, [data]);
}

// Hanh dong ap dung duoc cho 1 DONG don hang, tuy vao trang thai hien tai + vai tro nguoi dang xem -
// nang len module-level (truoc day chi nam trong PhieuDatDetailModal) de dung chung cho ca bang dong
// con trong che do xem "phieu + dong" o DonCuaToiTab (phan hoi UX 2026-08-15).
// "choHang" (phan hoi 2026-08-19: "tac nghiep khong co chuc nang chuyen don sang cho hang") - truoc
// day chi la 1 nhanh AN trong "Tu choi" (chon Ly do co quan_ly_don_thieu_linh_kien=1 se tu dong ra
// "Cho hang" thay vi "TN tu choi", xem migration 0065) - TN khong biet ly do nao dan toi ket qua nao
// nen tuong nhu khong co chuc nang. Tach thanh 1 nut rieng NGAY CANH "Tu choi", chi khac o cho danh
// sach Ly do hien ra da LOC SAN theo quan_ly_don_thieu_linh_kien (xem 2 noi goi actionsFor.choHang o
// duoi) - KHONG doi API/hanh_dong backend (van la "tu_choi", he thong van tu quyet dinh ket qua dua
// vao ly_do_cham_id da chon, dung y CHOT 2026-08-14). Chi ap dung o buoc "Cho TN duyet" (buoc duy
// nhat co the ra "Cho hang" - xem applyDonHangLog backend), Tram/TBP khong co.
export function actionsFor(
  d: DonHangRow,
  ctx: { canTacNghiep: boolean; canTPDvbhXacNhan?: boolean; canActAsTram: boolean; currentEmail: string; isAdmin?: boolean },
): { duyet: boolean; tuChoi: boolean; choHang: boolean; huy: boolean } {
  if (d.loai_don === "tra_hang" || !d.trang_thai) return { duyet: false, tuChoi: false, choHang: false, huy: false };
  // FIX (phan hoi 2026-09-05, muc #4: "Ngoài người tạo và admin hệ thống không ai có quyền hủy đơn
  // hàng (TN chỉ có quyền từ chối)") - truoc day "isOwnerOrTram" (currentEmail===nguoi_tao HOAC
  // canActAsTram) cho phep CA Tram huy don cua Ve tinh minh quan ly, khong chi nguoi tao/Admin. Tach
  // rieng dieu kien huy khoi canActAsTram (canActAsTram VAN dung cho duyet/tu choi o buoc "Cho Tram
  // duyet" nhu cu, khong doi).
  const canHuy = ctx.currentEmail === d.nguoi_tao || !!ctx.isAdmin;
  if (d.trang_thai === "Cho Tram duyet") {
    return { duyet: ctx.canActAsTram, tuChoi: ctx.canActAsTram, choHang: false, huy: canHuy };
  }
  // CHOT 2026-08-17 (migration 0082): buoc "TP DVBH xac nhan linh kien dac thu" - ngay truoc Tac
  // nghiep, chi ap dung khi ma LK cua dong dang duoc tao/duyet thuoc nhom "dac thu".
  if (d.trang_thai === "Cho TBP xac nhan") {
    return { duyet: !!ctx.canTPDvbhXacNhan, tuChoi: !!ctx.canTPDvbhXacNhan, choHang: false, huy: canHuy };
  }
  // MO RONG (phan hoi 2026-09-28): TN co them quyen Huy o "Cho TN duyet" (truoc chi nguoi tao/Admin).
  if (d.trang_thai === "Cho TN duyet") {
    return { duyet: ctx.canTacNghiep, tuChoi: ctx.canTacNghiep, choHang: ctx.canTacNghiep, huy: canHuy || ctx.canTacNghiep };
  }
  // FIX (phan hoi 2026-09-24: "Đơn đã duyệt chờ tạo xuất bổ sung thêm nút từ chối cho TN") - cho phep
  // TN tu huy quyet dinh duyet cua chinh minh khi don CHUA duoc gom vao PXK nao (ma_xuat_kho con NULL -
  // dong bo gom vao PXK roi thi theo doi qua chinh PXK do, khong con y nghia "tu choi don"). Khac cac
  // nhanh tu_choi khac o tren (khong co choHang/huy - dung 1 duong thoat duy nhat, backend
  // (applyDonHangLog, nhanh laTuChoiSauDuyet) chi chap nhan hanh_dong "tu_choi" tu trang thai nay).
  // MO RONG (phan hoi 2026-09-28 "chưa thêm vào phiếu xk => cho phép hủy/từ chối/chờ hàng cho TN"):
  // them Cho hang + Huy (backend applyDonHangLog: chuaVaoPxkSauDuyet).
  // Tu huy don TU DUYET da tu gom vao PXK (chot 2026-09-28) - nguoi tao HOAC KTV nhan hang, khi PXK con
  // "Dang tao phieu", Ke toan chua duyet chuyen tien, van phong chua thao tac tay (backend tinh tu_huy_duoc).
  const tuHuy =
    d.trang_thai === "TN da duyet" && d.ma_xuat_kho != null && !!d.tu_huy_duoc &&
    (ctx.currentEmail === d.nguoi_tao || ctx.currentEmail === d.nguoi_nhan_hang);
  // MO RONG (chot 2026-09-28, muc 5): don da vao PXK nhung phieu con "Dang tao phieu" + Ke toan chua duyet chuyen
  // tien (tn_doi_trong_pxk) -> TN van Huy/Tu choi/Cho hang, don tu go khoi phieu.
  if (d.trang_thai === "TN da duyet" && (d.ma_xuat_kho == null || !!d.tn_doi_trong_pxk)) {
    return { duyet: false, tuChoi: ctx.canTacNghiep, choHang: ctx.canTacNghiep, huy: ctx.canTacNghiep || !!ctx.isAdmin || tuHuy };
  }
  if (tuHuy) return { duyet: false, tuChoi: false, choHang: false, huy: true };
  return { duyet: false, tuChoi: false, choHang: false, huy: false };
}
