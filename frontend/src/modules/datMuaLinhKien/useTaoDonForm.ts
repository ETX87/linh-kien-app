import { useState, useEffect, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { getOptionsForUser } from "../../lib/loaiDeXuatCache";
import type { DonHangDraft, KhachLeRow, NguoiNhanHangKhaDungRow } from "./types";
import { describeApiError, canNoRequired, maYcscRequired, coMaIdLienQuan, pickLdeQuick, emptyDraft, useLkAndLdeCache, invalidatePipelineCounts, deriveLoaiDon, laTruCongNo, laKhTraGop, useLkCombo, comboThanhLkRow, chinhSachMacDinh, lkCamBanVoiLoai } from "./helpers";
import { t } from "../../i18n";

// Tach tu TaoDonTab.tsx (them 2026-08-21, phan hoi "màn hình tạo đơn mobile bị đưa đưa, chiếm diện
// tích nhỏ") - toan bo STATE/LOGIC nghiep vu (validate, mutation, quan ly danh sach drafts...) chuyen
// vao 1 hook DUY NHAT dung CHUNG boi 2 lop trinh bay: Modal desktop hien co (TaoDonTab.tsx) va man
// full-screen rieng cho mobile (TaoDonMobileScreen.tsx) - tranh 2 noi cung giu 1 ban logic dat hang de
// roi lech nhau dan theo thoi gian. KHONG doi bat ky hanh vi nghiep vu nao khi tach, chi di chuyen code
// nguyen ven tu than ham TaoDonTab cu.
export function useTaoDonForm({
  addToast, qc, canQuanLy, onClose,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>; canQuanLy: boolean; onClose: () => void;
}) {
  const { danhMuc: danhMucLk, ldeEntries } = useLkAndLdeCache(true);
  // Combo LK (migration 0066) - them vao o chon LK nhu 1 muc (gia = tong thanh phan); server tach thanh tung don khi luu.
  const { data: comboData } = useLkCombo();
  const danhMuc = useMemo(() => [...danhMucLk, ...comboThanhLkRow(comboData?.rows, danhMucLk)], [danhMucLk, comboData]);

  const [nguoiNhanHang, setNguoiNhanHangState] = useState("");
  // SDT KH le (migration 0074) - chi dung khi nguoi nhan la tai khoan nhom KH le; doi nguoi nhan -> xoa.
  const [khLeSdt, setKhLeSdt] = useState("");
  const setNguoiNhanHang = (v: string) => {
    setNguoiNhanHangState(v);
    setKhLeSdt("");
  };
  const [drafts, setDrafts] = useState<DonHangDraft[]>([emptyDraft()]);
  const [infoExpandedIdx, setInfoExpandedIdx] = useState<Set<number>>(new Set());
  const [activeIdx, setActiveIdx] = useState(0);
  const [otherLdeIdx, setOtherLdeIdx] = useState<Set<number>>(new Set());
  const [addBlockedHint, setAddBlockedHint] = useState(false);
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIdx]);
  useEffect(() => {
    if (!justAdded) return;
    const hen = setTimeout(() => setJustAdded(false), 650);
    return () => clearTimeout(hen);
  }, [justAdded]);

  const auth = useAuth();
  const currentEmail = auth.status === "authenticated" ? auth.user.email : "";
  const loaiDeXuatOptions = getOptionsForUser(auth.status === "authenticated" ? auth.user : null, ldeEntries);

  useEffect(() => {
    if (loaiDeXuatOptions.length === 0) return;
    const matched = pickLdeQuick(loaiDeXuatOptions, "MUA HÀNG");
    if (!matched) return;
    setDrafts((prev) => (prev.length === 1 && !prev[0].loai_de_xuat ? [{ ...prev[0], loai_de_xuat: matched }] : prev));
  }, [loaiDeXuatOptions.length]);

  const { data: nguoiNhanHangData } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: NguoiNhanHangKhaDungRow[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
    // KTV bi tat tai khoan khong duoc chon lam nguoi nhan hang (backend cung chan NGUOI_NHAN_HANG_DA_TAT)
    select: (d) => ({ rows: d.rows.filter((r) => !r.bi_khoa) }),
    enabled: canQuanLy,
  });

  // Canh bao SONG vuot tran cong no ngay luc soan don (them 2026-09-04, phan hoi "ngay thời điểm
  // người dùng tạo đơn linh kiện chứa công nợ đã phải hiện cảnh báo rồi") - KHAC voi danh_gia_cong_no
  // (chot 1 LAN o backend SAU KHI da tao don, xem POST /phieu-dat): o day tinh LAI moi lan drafts/
  // nguoiNhanHang doi, dua tren du lieu "tran + cong no chot HIEN TAI" tu server (GET /dat-mua-lk/
  // cong-no-du-kien) + "cong no tam tinh" cua CHINH cac dong dang soan (tinh o client tu
  // danhMuc.gia_tri_cong_no, khong can goi server rieng cho phan nay).
  const targetNguoiNhanHang = nguoiNhanHang || currentEmail;
  const { data: congNoDuKien } = useQuery({
    queryKey: ["dat-mua-lk-cong-no-du-kien", targetNguoiNhanHang],
    queryFn: () => api.get<{ tran: number | null; cong_no_chot: number }>(`/dat-mua-lk/cong-no-du-kien?nguoi_nhan_hang=${encodeURIComponent(targetNguoiNhanHang)}`),
    enabled: !!targetNguoiNhanHang,
  });

  // KTV nhan hang (sau Ve tinh -> Tram) chua co Ma MISA -> canh bao + khoa nut gui (chot 2026-10-08; backend chan
  // KTV_CHUA_CO_MA_MISA o POST /phieu-dat + import Excel).
  const { data: kiemTraMaMisa } = useQuery({
    queryKey: ["dat-mua-lk-kiem-tra-ma-misa", targetNguoiNhanHang],
    queryFn: () => api.get<{ chua_co_ma_misa: boolean }>(`/dat-mua-lk/kiem-tra-ma-misa?nguoi_nhan_hang=${encodeURIComponent(targetNguoiNhanHang)}`),
    enabled: !!targetNguoiNhanHang,
  });
  const chuaCoMaMisa = !!kiemTraMaMisa?.chua_co_ma_misa;

  // Nguoi nhan la tai khoan nhom KH le -> nhap SDT KH (khong bat buoc - bo trong he thong cap ma KH tu dong). Tra cuu
  // KH da co theo SDT (debounce nhe theo so chu so) de TN biet dang dat tiep cho KH cu (quy du, don dang cho).
  const laNhomKhLe = !!nguoiNhanHangData?.rows.find((r) => r.email_dang_nhap === nguoiNhanHang)?.la_nhom_kh_le;
  const khLeSdtSo = khLeSdt.replace(/\D/g, "");
  const { data: khLeTraCuu, isFetching: khLeDangTraCuu } = useQuery({
    queryKey: ["khach-le-tra-cuu", nguoiNhanHang, khLeSdtSo],
    queryFn: () =>
      api.get<{ sdt: string | null; sai: boolean; kh: KhachLeRow | null }>(
        `/khach-le/tra-cuu?nhom=${encodeURIComponent(nguoiNhanHang)}&sdt=${encodeURIComponent(khLeSdtSo)}`,
      ),
    enabled: laNhomKhLe && khLeSdtSo.length >= 10,
    staleTime: 30_000,
  });
  // SDT sai dinh dang: co nhap nhung chua du 10 so, hoac server bao sai (vd khong bat dau bang 0).
  const khLeSdtSai = laNhomKhLe && khLeSdtSo.length > 0 && (khLeSdtSo.length < 10 || !!khLeTraCuu?.sai);

  // Canh bao SONG "mốc dự phòng còn khả dụng" ngay luc soan don MUA DỰ TRỮ (them 2026-09-13, phan hoi
  // "Nếu ktv chọn 'MUA DỰ TRỮ' hệ thống sẽ tự hiện cảnh báo số tiền chốt dữ trữ còn khả dụng, giống
  // như hiện tại đang cảnh báo đơn công nợ") - mirror DUNG cap query congNoDuKien o tren, chi doi
  // endpoint. CHI mang tinh THONG TIN (khong chan tao don/khong gan vao auto-duyet - khac cong no).
  const { data: duPhongDuKien } = useQuery({
    queryKey: ["dat-mua-lk-du-phong-du-kien", targetNguoiNhanHang],
    queryFn: () => api.get<{ tran: number | null; moc_hien_tai: number }>(`/dat-mua-lk/du-phong-du-kien?nguoi_nhan_hang=${encodeURIComponent(targetNguoiNhanHang)}`),
    enabled: !!targetNguoiNhanHang,
  });

  // Chong tao don trung (fix 2026-09-28, bug "KTV tao 1 don, he thong hien 5 don giong het"): 1 ma
  // ngau nhien cho MOI noi dung form - bam lai cung noi dung (sau loi mang/timeout ma server thuc ra
  // da luu) gui LAI dung ma cu -> backend tra ve phieu da tao thay vi tao them (migration 0034). Doi
  // noi dung (sua dong/them dong/doi nguoi nhan) hoac tao xong (reset form) -> ma moi.
  const noiDungKey = JSON.stringify({ nguoiNhanHang, khLeSdt: laNhomKhLe ? khLeSdtSo : "", drafts });
  const clientRequestId = useMemo(
    () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    [noiDungKey],
  );
  // Chot chan dong bo chong bam dup: create.isPending chi co hieu luc SAU lan render ke tiep, 2 cu cham
  // lien tiep trong cung 1 khung hinh van goi mutate() 2 lan.
  const dangGuiRef = useRef(false);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string; trung_lap?: boolean; kh_le?: { ma: string; sdt: string | null; moi: boolean } | null }>("/dat-mua-lk/phieu-dat", {
        client_request_id: clientRequestId,
        nguoi_nhan_hang: nguoiNhanHang || undefined,
        kh_le_sdt: laNhomKhLe && khLeSdtSo ? khLeSdtSo : undefined,
        don_hang: drafts.map((d) => ({
          ma_lk: d.ma_lk,
          loai_de_xuat: d.loai_de_xuat.trim(),
          so_luong_de_xuat: d.so_luong_de_xuat,
          ghi_chu: d.ghi_chu.trim() || undefined,
          yeu_cau_hoa_don: d.yeu_cau_hoa_don.trim() || undefined,
          tt_mail_duyet: d.tt_mail_duyet.trim() || undefined,
          tt_khach_hang: d.tt_khach_hang.trim() || undefined,
          chinh_sach: d.chinh_sach.trim() || undefined,
          ma_yeu_cau_su_co: d.ma_yeu_cau_su_co.trim() || undefined,
          ma_lada: d.ma_lada.trim().toUpperCase() || undefined,
          uu_tien: d.uu_tien || undefined,
          anh: deriveLoaiDon(d.loai_de_xuat.trim()) === "tra_hang" ? d.anh : undefined,
        })),
      }),
    onSuccess: (res) => {
      addToast(
        (res.trung_lap ? t("Đơn đặt hàng {id} đã được tạo từ lần bấm trước — không tạo thêm", { id: res.id }) : t("Đã tạo đơn đặt hàng {id}", { id: res.id })) +
          (res.kh_le ? " · " + (res.kh_le.moi ? t("KH lẻ mới {ma}", { ma: res.kh_le.ma }) : t("KH lẻ {ma}", { ma: res.kh_le.ma })) : ""),
      );
      qc.invalidateQueries({ queryKey: ["khach-le"] });
      qc.invalidateQueries({ queryKey: ["nguoi-directory"] });
      setNguoiNhanHang("");
      setDrafts([emptyDraft()]);
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-tom-tat"] });
      invalidatePipelineCounts(qc);
      onClose();
    },
    onError: (err) =>
      addToast(
        t("Không thể tạo đơn: ") + describeApiError(err) +
          (err instanceof TypeError ? t(" — kiểm tra mạng rồi bấm lại, hệ thống sẽ không tạo trùng đơn.") : ""),
      ),
    onSettled: () => {
      dangGuiRef.current = false;
    },
  });
  const create = {
    ...createMutation,
    mutate: () => {
      if (dangGuiRef.current) return;
      dangGuiRef.current = true;
      createMutation.mutate();
    },
  };

  function updateDraft(idx: number, patch: Partial<DonHangDraft>) {
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== idx) return d;
        const next = { ...d, ...patch };
        // Doi loai de xuat: chinh sach dang trong (hoac la gia tri tu dien cua loai cu) -> theo mac dinh cua loai moi.
        if (patch.loai_de_xuat !== undefined && patch.chinh_sach === undefined && (!d.chinh_sach.trim() || d.chinh_sach === chinhSachMacDinh(d.loai_de_xuat))) {
          next.chinh_sach = chinhSachMacDinh(patch.loai_de_xuat);
        }
        return next;
      }),
    );
  }

  function isLineComplete(d: DonHangDraft): boolean {
    return !!(
      d.ma_lk.trim() &&
      d.loai_de_xuat.trim() &&
      d.so_luong_de_xuat > 0 &&
      // LK cam ban khong dat duoc voi MUA HÀNG / MUA HÀNG CÓ ID / MUA DỰ TRỮ (canh bao hien ngay duoi o chon LK).
      !lkCamBanVoiLoai(danhMuc.find((m) => m.ma_linh_kien === d.ma_lk), d.loai_de_xuat) &&
      (!canNoRequired(d.loai_de_xuat) || d.chinh_sach.trim()) &&
      (!maYcscRequired(d.loai_de_xuat) || coMaIdLienQuan(d.ma_yeu_cau_su_co, d.ma_lada)) &&
      // CHOT (phan hoi 2026-08-24, muc 1): don tra hang bat buoc 1-3 anh linh kien can tra.
      (deriveLoaiDon(d.loai_de_xuat) !== "tra_hang" || (d.anh.length >= 1 && d.anh.length <= 3))
    );
  }

  const canSubmit = !chuaCoMaMisa && !khLeSdtSai && drafts.every(isLineComplete);
  const [showImport, setShowImport] = useState(false);

  function themDong() {
    if (!isLineComplete(drafts[activeIdx])) {
      setAddBlockedHint(true);
      return;
    }
    setAddBlockedHint(false);
    setDrafts((prev) => [...prev, { ...emptyDraft(), loai_de_xuat: prev[activeIdx]?.loai_de_xuat ?? "", chinh_sach: chinhSachMacDinh(prev[activeIdx]?.loai_de_xuat) }]);
    setActiveIdx(drafts.length);
    setJustAdded(true);
  }

  function deleteDraft(idx: number) {
    if (drafts.length === 1) return;
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
    setActiveIdx((cur) => (idx < cur ? cur - 1 : idx === cur ? Math.max(0, cur - 1) : cur));
  }

  const tongGiaUocTinh = drafts.reduce((sum, d) => {
    const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
    return sum + (lk?.gia_ban != null ? lk.gia_ban * d.so_luong_de_xuat : 0);
  }, 0);
  const tongSoLuong = drafts.reduce((sum, d) => sum + (d.so_luong_de_xuat || 0), 0);
  // Phan gia tri cac dong dang soan duoc CONG vao tong ngay tinh chiet khau (Mua + TRỪ CÔNG NỢ, gia ban x SL -
  // khop DON_TINH_TONG_NGAY_SQL o backend) - xem truoc muc chiet khau sau khi tao (TongNgayKtv.tsx).
  const giaTriTinhChietKhau = drafts.reduce((sum, d) => {
    const lde = d.loai_de_xuat.trim();
    if (!lde || (deriveLoaiDon(lde) !== "mua" && !laTruCongNo(lde))) return sum;
    const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
    return sum + (lk?.gia_ban != null ? lk.gia_ban * d.so_luong_de_xuat : 0);
  }, 0);

  // "Cong no tam tinh" cua RIENG cac dong loai_don='cong_no' dang soan - CUNG cong thuc voi backend
  // (gia_tri_cong_no x so_luong_de_xuat, xem POST /phieu-dat) nhung tinh tai client de canh bao SONG
  // (khong doi submit xong moi biet).
  const tongCongNoTamTinh = drafts.reduce((sum, d) => {
    // "TRỪ CÔNG NỢ" khong doi chieu cong no (chot 2026-09-28) - khop backend POST /phieu-dat.
    // + don KH tra gop (laKhTraGop) - gia tri CN = 0, khop backend.
    if (deriveLoaiDon(d.loai_de_xuat.trim()) !== "cong_no" || laTruCongNo(d.loai_de_xuat) || laKhTraGop(d.loai_de_xuat)) return sum;
    const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
    return sum + (lk?.gia_tri_cong_no ?? 0) * d.so_luong_de_xuat;
  }, 0);
  // null = khong the danh gia (chua co dong cong_no nao trong luc soan, HOAC chua tai xong du lieu
  // congNoDuKien) - KHAC voi false ("Khong du"). SUA 2026-09-04 (phan hoi "trường hợp ktv không có
  // trần công nợ, tạo cảnh báo tương tự với trần công nợ = 0"): nguoi nhan hang CHUA duoc gan tran
  // (congNoDuKien.tran === null) gio coi NHU tran = 0 (KHAC truoc day la bo qua/khong danh gia) -
  // khop dung quy uoc moi cua danhGiaCongNo3Muc o backend.
  const sePhepDuCongNo: boolean | null =
    tongCongNoTamTinh > 0 && congNoDuKien != null
      ? congNoDuKien.cong_no_chot + tongCongNoTamTinh <= (congNoDuKien.tran ?? 0)
      : null;

  // "Co dong MUA DỰ TRỮ dang soan" - dieu kien hien banner thong tin du phong (khac cong no: khong co
  // khai niem "du/khong du", chi hien SO CON KHA DUNG de KTV/TN tu can nhac, xem TaoDonTab.tsx).
  const coDongMuaDuTru = drafts.some((d) => d.loai_de_xuat.trim().toUpperCase() === "MUA DỰ TRỮ");

  return {
    danhMuc, nguoiNhanHang, setNguoiNhanHang, drafts, infoExpandedIdx, setInfoExpandedIdx,
    activeIdx, setActiveIdx, otherLdeIdx, setOtherLdeIdx, addBlockedHint, setAddBlockedHint,
    activeRowRef, justAdded, currentEmail, loaiDeXuatOptions, nguoiNhanHangData, create,
    updateDraft, isLineComplete, canSubmit, showImport, setShowImport, themDong, deleteDraft,
    tongGiaUocTinh, tongSoLuong, tongCongNoTamTinh, sePhepDuCongNo, congNoDuKien,
    duPhongDuKien, coDongMuaDuTru, targetNguoiNhanHang, giaTriTinhChietKhau, chuaCoMaMisa,
    laNhomKhLe, khLeSdt, setKhLeSdt, khLeSdtSai, khLeTraCuu, khLeDangTraCuu,
  };
}

export type TaoDonForm = ReturnType<typeof useTaoDonForm>;
