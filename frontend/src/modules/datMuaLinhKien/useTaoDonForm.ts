import { useState, useEffect, useRef, useMemo } from "react";
import { layHangChoTaoGiong, dangKyFormTaoDon, SU_KIEN_TAO_DON_GIONG } from "./taoDonGiong";
import { duocTichKhChuyenKhoan } from "./KhChuyenKhoan";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { getOptionsForUser } from "../../lib/loaiDeXuatCache";
import type { DonHangDraft, KhachLeRow, NguoiNhanHangKhaDungRow, KiemTraPhieuDat, KiemTraDong, KetQuaTaoDon } from "./types";
import { describeApiError, canNoRequired, maYcscRequired, coMaIdLienQuan, pickLdeQuick, emptyDraft, useLkAndLdeCache, invalidatePipelineCounts, deriveLoaiDon, laTruCongNo, laKhTraGop, khongTinhCongNo, useLkCombo, comboThanhLkRow, chinhSachMacDinh, laMuaCongNoDoiTac, laCongNoSuaChua, laDonSuaChua, chuanMaDonBh } from "./helpers";
import { t } from "../../i18n";
import { GENERIC_ERROR_MESSAGES } from "./constants";
import { coYeuCauHoaDon } from "./LoaiChietKhau";
import { useTongNgayKtv } from "./TongNgayKtv";

// Tach tu TaoDonTab.tsx (them 2026-08-21, phan hoi "màn hình tạo đơn mobile bị đưa đưa, chiếm diện
// tích nhỏ") - toan bo STATE/LOGIC nghiep vu (validate, mutation, quan ly danh sach drafts...) chuyen
// vao 1 hook DUY NHAT dung CHUNG boi 2 lop trinh bay: Modal desktop hien co (TaoDonTab.tsx) va man
// full-screen rieng cho mobile (TaoDonMobileScreen.tsx) - tranh 2 noi cung giu 1 ban logic dat hang de
// roi lech nhau dan theo thoi gian. KHONG doi bat ky hanh vi nghiep vu nao khi tach, chi di chuyen code
// nguyen ven tu than ham TaoDonTab cu.
// Luu don DANG SOAN tren may (2026-10-22, KTV bao "up anh bi bao loi khi dang lam do va bi van ra va mat cac don dang luu do"): tren
// dien thoai, mo camera chup anh tra hang co the khien trinh duyet TAI LAI trang -> form chi giu trong bo nho nen mat het (ca link anh
// DA tai len Drive -> KTV chup lai, het han muc 20 anh/ngay ma chua tao duoc don nao). Ghi localStorage theo tai khoan moi lan doi;
// mo lai form -> khoi phuc (giu 3 ngay). Tao don xong (form ve rong) / bam "Soạn mới" -> xoa.
export type DoiTacChon = { ma_misa: string; ten_misa: string; hien_tai: number; toi_da: number; kha_dung: number; emails?: string[] };
type NhapTaoDon = { luc: number; nguoiNhanHang: string; khLeSdt: string; drafts: DonHangDraft[]; activeIdx: number };
const NHAP_GIU_MS = 3 * 24 * 60 * 60 * 1000;
const khoaNhap = (email: string) => `tao-don-nhap:${email.toLowerCase()}`;
function coNoiDung(drafts: DonHangDraft[]): boolean {
  return drafts.some((d) => !!(d.ma_lk.trim() || d.anh.length || d.ghi_chu.trim() || d.ma_yeu_cau_su_co.trim() || d.ma_lada.trim()));
}
function docNhapTaoDon(email: string): NhapTaoDon | null {
  if (!email) return null;
  try {
    const raw = localStorage.getItem(khoaNhap(email));
    if (!raw) return null;
    const v = JSON.parse(raw) as NhapTaoDon;
    if (!Array.isArray(v.drafts) || !v.drafts.length || Date.now() - (v.luc ?? 0) > NHAP_GIU_MS || !coNoiDung(v.drafts)) return null;
    // Gop voi draft rong - nhap luu tu ban cu thieu truong moi van dung duoc.
    return { ...v, drafts: v.drafts.map((d) => ({ ...emptyDraft(), ...d, anh: Array.isArray(d.anh) ? d.anh : [] })) };
  } catch {
    return null;
  }
}
function luuNhapTaoDon(email: string, v: Omit<NhapTaoDon, "luc">) {
  if (!email) return;
  try {
    if (coNoiDung(v.drafts)) localStorage.setItem(khoaNhap(email), JSON.stringify({ ...v, luc: Date.now() }));
    else localStorage.removeItem(khoaNhap(email));
  } catch {
    // het bo nho / che do rieng tu - bo qua, form van chay binh thuong
  }
}

export function useTaoDonForm({
  addToast, qc, canQuanLy, onClose,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>; canQuanLy: boolean; onClose: () => void;
}) {
  const { danhMuc: danhMucLk, ldeEntries } = useLkAndLdeCache(true);
  // Combo LK (migration 0066) - them vao o chon LK nhu 1 muc (gia = tong thanh phan); server tach thanh tung don khi luu.
  const { data: comboData } = useLkCombo();
  const danhMuc = useMemo(() => [...danhMucLk, ...comboThanhLkRow(comboData?.rows, danhMucLk)], [danhMucLk, comboData]);

  const authNhap = useAuth();
  const emailNhap = authNhap.status === "authenticated" ? authNhap.user.email : "";
  // SUA 2026-10-27 ("khi tắt màn UI tạo đơn sẽ hiện popup hỏi người dùng có thông tin chưa lưu có muốn lưu lại cho lần sau không ... nếu
  // app bị tắt bất ngờ thì sẽ lưu lại - nhưng lần sau mở lại sẽ hiện popup hỏi ... có muốn mở lại thông tin đã tạo dở không"): KHONG tu
  // khoi phuc nua - co nhap cu thi form mo RONG + hoi (hoiKhoiPhuc); van ghi nhap moi lan doi (app tat bat ngo van con); dong form co noi
  // dung -> hoi luu (hoiLuuKhiDong): Luu = giu nhap, Khong luu = xoa.
  const [nhapCu] = useState(() => docNhapTaoDon(emailNhap));
  const [hoiKhoiPhuc, setHoiKhoiPhuc] = useState<NhapTaoDon | null>(nhapCu);
  const [khoiPhucLuc, setKhoiPhucLuc] = useState<number | null>(null);
  const [nguoiNhanHang, setNguoiNhanHangState] = useState("");
  // SDT KH le (migration 0074) - chi dung khi nguoi nhan la tai khoan nhom KH le; doi nguoi nhan -> xoa.
  const [khLeSdt, setKhLeSdt] = useState("");
  const setNguoiNhanHang = (v: string) => {
    setNguoiNhanHangState(v);
    setKhLeSdt("");
  };
  const [drafts, setDrafts] = useState<DonHangDraft[]>([emptyDraft()]);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [infoExpandedIdx, setInfoExpandedIdx] = useState<Set<number>>(new Set());
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    // Chua tra loi "mo lai don tao do?" -> khong ghi de nhap cu bang form rong.
    if (hoiKhoiPhuc) return;
    luuNhapTaoDon(emailNhap, { nguoiNhanHang, khLeSdt, drafts, activeIdx });
  }, [emailNhap, nguoiNhanHang, khLeSdt, drafts, activeIdx, hoiKhoiPhuc]);
  function moLaiNhap() {
    const n = hoiKhoiPhuc;
    if (!n) return;
    setNguoiNhanHangState(n.nguoiNhanHang ?? "");
    setKhLeSdt(n.khLeSdt ?? "");
    // Dong da them qua "Tạo đơn giống đơn này" trong luc dang hoi -> giu lai, noi sau nhap cu.
    // Ma LK trung voi nhap cu -> bo trong (cung quy tac "co trong danh sach dang tao thi bo trong").
    const maNhap = new Set(n.drafts.map((d) => d.ma_lk.trim().toUpperCase()).filter(Boolean));
    const themTuDonGiong = draftsRef.current
      .filter((d) => coNoiDung([d]))
      .map((d) => (maNhap.has(d.ma_lk.trim().toUpperCase()) ? { ...d, ma_lk: "" } : d));
    setDrafts([...n.drafts, ...themTuDonGiong]);
    setActiveIdx(themTuDonGiong.length ? n.drafts.length : Math.min(Math.max(0, n.activeIdx || 0), n.drafts.length - 1));
    setKhoiPhucLuc(n.luc);
    setHoiKhoiPhuc(null);
  }
  function boQuaNhapCu() {
    try {
      localStorage.removeItem(khoaNhap(emailNhap));
    } catch {
      // bo qua
    }
    setHoiKhoiPhuc(null);
  }
  // Dong form (✕ / Esc / Back) khi dang co noi dung chua tao -> NhapTaoDonHoi hoi luu lai cho lan sau (chan dong qua chanDong.tsx).
  const coNoiDungChuaTao = !hoiKhoiPhuc && coNoiDung(drafts);
  function luuNhapNgay() {
    luuNhapTaoDon(emailNhap, { nguoiNhanHang, khLeSdt, drafts, activeIdx });
  }
  function xoaNhap() {
    try {
      localStorage.removeItem(khoaNhap(emailNhap));
    } catch {
      // bo qua
    }
  }
  // "Soạn mới" - bo don dang soan da khoi phuc (localStorage tu xoa qua effect tren vi form ve rong).
  function boNhap() {
    setNguoiNhanHangState("");
    setKhLeSdt("");
    setDrafts([{ ...emptyDraft(), loai_de_xuat: pickLdeQuick(loaiDeXuatOptionsRef.current, "MUA HÀNG") ?? "" }]);
    setActiveIdx(0);
    setKhoiPhucLuc(null);
  }
  const loaiDeXuatOptionsRef = useRef<string[]>([]);
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
  // MUA HÀNG CÔNG NỢ ĐỐI TÁC (v1.403): doi tac nguoi dang nhap duoc dat (TN/Ke toan/GS/Admin = moi doi tac dang bat; KTV = doi tac trung Ma
  // MISA cua chinh minh, tu dat cho minh - `tu_dat`). Khong co doi tac nao -> AN lua chon nay khoi danh sach loai de xuat.
  const { data: doiTacChon } = useQuery({
    queryKey: ["doi-tac-cong-no-chon"],
    queryFn: () => api.get<{ rows: DoiTacChon[]; tu_dat: boolean }>("/doi-tac-cong-no/chon"),
    staleTime: 30_000,
  });
  const coDoiTac = (doiTacChon?.rows.length ?? 0) > 0;
  const { data: nguoiNhanHangData } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: NguoiNhanHangKhaDungRow[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
    // KTV bi tat tai khoan khong duoc chon lam nguoi nhan hang (backend cung chan NGUOI_NHAN_HANG_DA_TAT)
    select: (d) => ({ rows: d.rows.filter((r) => !r.bi_khoa) }),
    enabled: canQuanLy,
  });
  // CÔNG NỢ SỬA CHỮA theo NGUOI NHAN HANG (v1.498 - "tạo đơn cho nv sửa chữa hiện đề xuất "CÔNG NỢ SỬA CHỮA" hiện trong danh sách ưu
  // tiên"): nguoi nhan la NV sua chua -> luon co loai nay (ca khi TN / GS dat ho - nhom loai de xuat chi gan token la_nv_sua_chua) + dung
  // DAU hang nut chon nhanh (ldeNhanh); nguoi nhan khac -> an (backend chan NGUOI_NHAN_KHONG_PHAI_NV_SUA_CHUA).
  const nhanLaNvSuaChua = canQuanLy && nguoiNhanHang
    ? !!nguoiNhanHangData?.rows.find((r) => r.email_dang_nhap === nguoiNhanHang)?.la_nv_sua_chua
    : !!(auth.status === "authenticated" && auth.user.la_nv_sua_chua);
  // Ten nguoi nhan hang (v1.499) - "TT+Mail duyệt" tu dien "Xuất công nợ sửa chữa cho NV <tên>" khi chon don bao hanh.
  const tenNguoiNhan = canQuanLy && nguoiNhanHang
    ? (nguoiNhanHangData?.rows.find((r) => r.email_dang_nhap === nguoiNhanHang)?.ten_hien_thi ?? nguoiNhanHang)
    : (auth.status === "authenticated" ? auth.user.ten || auth.user.email : "");
  const ldeTheoQuyen = getOptionsForUser(auth.status === "authenticated" ? auth.user : null, ldeEntries).filter(
    (o) => (coDoiTac || !laMuaCongNoDoiTac(o)) && (nhanLaNvSuaChua || !laDonSuaChua(o)),
  );
  // v1.508: 3 loai cap linh kien sua chua (CÔNG NỢ / HỖ TRỢ SỬA CHỮA 0 ĐỒNG / MUA HÀNG SỬA CHỮA) - nguoi nhan la NV sua chua thi luon co du 3.
  const ldeSuaChua = nhanLaNvSuaChua
    ? ldeEntries.filter((e) => e.bat_tat && laDonSuaChua(e.ten_option) && !ldeTheoQuyen.includes(e.ten_option)).map((e) => e.ten_option)
    : [];
  const loaiDeXuatOptions = [...ldeSuaChua, ...ldeTheoQuyen];
  loaiDeXuatOptionsRef.current = loaiDeXuatOptions;
  // Doi tac MAC DINH = chinh nguoi nhan hang (2026-10-26, v1.406 - "KTV đặt công nợ đối tác thì không cần chọn đối tác, mặc định sẽ chính là ktv
  // đó. chỉ có GS, TN, KT mới có quyền chọn lại đối tác"): KTV tu dat -> doi tac cua chinh minh (khong doi duoc, co nhieu ma thi chon trong so
  // do); GS/TN/KT/Admin -> doi tac co Gmail = nguoi nhan hang (emails tu /chon), van chon lai duoc. Dong da CHON TAY (doi_tac_tu_dong=false)
  // khong bi ghi de; dong tu dien doi theo nguoi nhan hang.
  const emailNhanDoiTac = (nguoiNhanHang || currentEmail).trim().toLowerCase();
  useEffect(() => {
    if (!doiTacChon) return;
    const ds = doiTacChon.rows;
    const macDinh = doiTacChon.tu_dat
      ? ((ds.length === 1 ? ds[0] : ds.find((r) => r.emails?.includes(emailNhanDoiTac)))?.ma_misa ?? "")
      : (ds.find((r) => r.emails?.includes(emailNhanDoiTac))?.ma_misa ?? "");
    const canSua = (d: DonHangDraft) =>
      laMuaCongNoDoiTac(d.loai_de_xuat) && (!d.doi_tac_ma || d.doi_tac_tu_dong) && (d.doi_tac_ma ?? "") !== macDinh;
    setDrafts((prev) => (prev.some(canSua) ? prev.map((d) => (canSua(d) ? { ...d, doi_tac_ma: macDinh, doi_tac_tu_dong: !!macDinh } : d)) : prev));
  }, [doiTacChon, drafts, emailNhanDoiTac]);

  useEffect(() => {
    if (loaiDeXuatOptions.length === 0) return;
    const matched = pickLdeQuick(loaiDeXuatOptions, "MUA HÀNG");
    if (!matched) return;
    setDrafts((prev) => (prev.length === 1 && !prev[0].loai_de_xuat ? [{ ...prev[0], loai_de_xuat: matched }] : prev));
  }, [loaiDeXuatOptions.length]);


  // Canh bao SONG vuot tran cong no ngay luc soan don (them 2026-09-04, phan hoi "ngay thời điểm
  // người dùng tạo đơn linh kiện chứa công nợ đã phải hiện cảnh báo rồi") - KHAC voi danh_gia_cong_no
  // (chot 1 LAN o backend SAU KHI da tao don, xem POST /phieu-dat): o day tinh LAI moi lan drafts/
  // nguoiNhanHang doi, dua tren du lieu "tran + cong no chot HIEN TAI" tu server (GET /dat-mua-lk/
  // cong-no-du-kien) + "cong no tam tinh" cua CHINH cac dong dang soan (tinh o client tu
  // danhMuc.gia_tri_cong_no, khong can goi server rieng cho phan nay).
  const targetNguoiNhanHang = nguoiNhanHang || currentEmail;
  const { data: congNoDuKien } = useQuery({
    queryKey: ["dat-mua-lk-cong-no-du-kien", targetNguoiNhanHang],
    queryFn: () => api.get<{ tran: number | null; cong_no_chot: number; khong_xet_tran?: boolean }>(`/dat-mua-lk/cong-no-du-kien?nguoi_nhan_hang=${encodeURIComponent(targetNguoiNhanHang)}`),
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
      api.post<KetQuaTaoDon>("/dat-mua-lk/phieu-dat", {
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
          doi_tac_ma: laMuaCongNoDoiTac(d.loai_de_xuat) ? d.doi_tac_ma || undefined : undefined,
          kh_chuyen_khoan: d.kh_chuyen_khoan && duocTichKhChuyenKhoan(d) ? true : undefined,
          bh_don_vi_id: laDonSuaChua(d.loai_de_xuat) ? chuanMaDonBh(d.bh_don_vi_id) ?? undefined : undefined,
        })),
      }),
    onSuccess: (res) => {
      // Ket qua tung dong (2026-10-15): co dong CHUA duyet ngay -> mo "Kết quả đặt hàng" (ly do + ai xu ly tiep), form dong SAU khi
      // nguoi dat bam "Đã hiểu" (KetQuaTaoDonModal); tat ca tu duyet -> chi toast nhu cu.
      const dongKq = res.dong ?? [];
      const soTuDuyet = dongKq.filter((d) => d.trang_thai === "TN da duyet").length;
      addToast(
        (res.trung_lap ? t("Đơn đặt hàng {id} đã được tạo từ lần bấm trước — không tạo thêm", { id: res.id }) : t("Đã tạo đơn đặt hàng {id}", { id: res.id })) +
          (res.kh_le ? " · " + (res.kh_le.moi ? t("KH lẻ mới {ma}", { ma: res.kh_le.ma }) : t("KH lẻ {ma}", { ma: res.kh_le.ma })) : "") +
          (soTuDuyet > 0 ? " · " + t("{a} đơn tự động duyệt", { a: soTuDuyet }) : ""),
      );
      qc.invalidateQueries({ queryKey: ["khach-le"] });
      qc.invalidateQueries({ queryKey: ["nguoi-directory"] });
      setNguoiNhanHang("");
      setDrafts([emptyDraft()]);
      // Ve dong 1: form con 1 dong rong - activeIdx cu (vd dong 2) lam man mobile doc drafts[1] = undefined -> trang loi
      // sau khi bam "Đặt tiếp" (2026-10-28).
      setActiveIdx(0);
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-tom-tat"] });
      invalidatePipelineCounts(qc);
      // 2026-11-10: LUON mo hop "Đơn đặt hàng đã được ghi nhận" (don + phieu xuat + quy du) - tru khi bam lai trung (khong co du lieu moi).
      if (!res.trung_lap && dongKq.length > 0) setKetQuaTao(res);
      else onClose();
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
  // Tu dong duyet 100% (chot 2026-10-14): hoi server TRUOC (POST /phieu-dat/kiem-tra, khong ghi gi) ket qua tung dong - tu duyet /
  // cho hang / cho thanh toan / cho GS / cho TBP / bi chan + ly do. Chi gui dong da chon du Ma LK + Loai de xuat + SL (cac o con
  // lai server bo qua o che do kiem tra); debounce 600ms. KHONG chan tao don khi chua tra loi xong - POST /phieu-dat tu kiem tra lai.
  const dongKiemTra = drafts
    .map((d, idx) => ({ d, idx }))
    .filter(({ d }) => d.ma_lk.trim() && d.loai_de_xuat.trim() && d.so_luong_de_xuat > 0);
  const kiemTraKey = JSON.stringify({
    n: nguoiNhanHang,
    dong: dongKiemTra.map(({ d }) => [d.ma_lk.trim(), d.loai_de_xuat.trim(), d.so_luong_de_xuat, laMuaCongNoDoiTac(d.loai_de_xuat) ? d.doi_tac_ma : ""]),
  });
  const [kiemTraKeyTre, setKiemTraKeyTre] = useState(kiemTraKey);
  useEffect(() => {
    const hen = setTimeout(() => setKiemTraKeyTre(kiemTraKey), 600);
    return () => clearTimeout(hen);
  }, [kiemTraKey]);
  const { data: kiemTra, isFetching: dangKiemTra } = useQuery({
    queryKey: ["dat-mua-lk-phieu-dat-kiem-tra", kiemTraKeyTre],
    queryFn: () => {
      const k = JSON.parse(kiemTraKeyTre) as { n: string; dong: [string, string, number, string][] };
      return api.post<KiemTraPhieuDat>("/dat-mua-lk/phieu-dat/kiem-tra", {
        nguoi_nhan_hang: k.n || undefined,
        don_hang: k.dong.map(([ma_lk, loai_de_xuat, so_luong_de_xuat, doi_tac_ma]) => ({ ma_lk, loai_de_xuat, so_luong_de_xuat, doi_tac_ma: doi_tac_ma || undefined })),
      });
    },
    enabled: (JSON.parse(kiemTraKeyTre) as { dong: unknown[] }).dong.length > 0,
    staleTime: 15_000,
  });
  // Ket qua chi dung khi khop noi dung form HIEN TAI (tranh hien ket qua cu trong 600ms cho).
  const kiemTraHienTai = kiemTra && kiemTraKeyTre === kiemTraKey ? kiemTra : null;
  // Ket qua theo DONG FORM (dong combo -> nhieu dong ket qua, 1 cho moi LK thanh phan).
  const idxKiemTra = dongKiemTra.map((x) => x.idx).join(",");
  const ketQuaTheoDong = useMemo(() => {
    const m = new Map<number, KiemTraDong[]>();
    if (!kiemTraHienTai || kiemTraHienTai.loi_phieu) return m;
    const viTri = idxKiemTra.split(",").map(Number);
    for (const r of kiemTraHienTai.dong) {
      const formIdx = viTri[r.goc];
      if (formIdx == null || Number.isNaN(formIdx)) continue;
      m.set(formIdx, [...(m.get(formIdx) ?? []), r]);
    }
    return m;
  }, [kiemTraHienTai, idxKiemTra]);
  const coDongBiChan = [...ketQuaTheoDong.values()].some((ds) => ds.some((r) => r.loi));
  // Dong se KHONG tu duyet ngay - hoi lai truoc khi gui (2 lua chon: dat tiep / quay lai).
  const dongCanXacNhan = [...ketQuaTheoDong.entries()]
    .flatMap(([idx, ds]) => ds.map((r) => ({ idx, ...r })))
    // + "Cho TBP xac nhan" (2026-10-15): moi truong hop KHONG duyet ngay deu phai bao truoc cho nguoi dat.
    .filter((r) => !r.loi && (r.trang_thai === "Cho hang" || r.trang_thai === "Cho thanh toan" || r.trang_thai === "Cho GS duyet" || r.trang_thai === "Cho TBP xac nhan"));
  const [hoiXacNhan, setHoiXacNhan] = useState(false);
  // "Kết quả đặt hàng" sau khi tao (2026-10-15) - dong hop = dong luon form tao don.
  const [ketQuaTao, setKetQuaTao] = useState<KetQuaTaoDon | null>(null);
  const dongKetQuaTao = () => {
    setKetQuaTao(null);
    onClose();
  };
  // Loi cap phieu tu kiem tra truoc (vd Ve tinh khong tao don) - bo qua loi da co canh bao rieng tren form.
  const loiPhieuMa = kiemTraHienTai?.loi_phieu;
  const loiPhieuText =
    loiPhieuMa && !["KTV_CHUA_CO_MA_MISA", "INVALID_DON_HANG", "MISSING_DON_HANG", "MA_LK_NOT_FOUND"].includes(loiPhieuMa)
      ? t(GENERIC_ERROR_MESSAGES[loiPhieuMa] ?? loiPhieuMa)
      : null;

  const create = {
    ...createMutation,
    // daXacNhan = KTV da bam "Đặt tiếp" o hop xac nhan (don thieu hang / vuot tran).
    mutate: (daXacNhan?: boolean) => {
      if (dangGuiRef.current) return;
      if (!daXacNhan && dongCanXacNhan.length > 0) {
        setHoiXacNhan(true);
        return;
      }
      setHoiXacNhan(false);
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

  // Goi y LK tuong duong (v1.430, GoiYThayTheThieuHang.tsx): tach dong idx thanh nhieu dong theo phuong an nguoi dung chon - moi dong
  // giu nguyen moi o khac (loai de xuat, chinh sach, ma YCSC...), chi doi ma LK + SL. Form tu kiem tra lai sau khi doi.
  function apDungThayThe(idx: number, phan: { ma_lk: string; sl: number }[]) {
    if (!phan.length) return;
    setDrafts((prev) => {
      const goc = prev[idx];
      if (!goc) return prev;
      const moi = phan.map((p) => ({ ...goc, ma_lk: p.ma_lk, so_luong_de_xuat: p.sl }));
      return [...prev.slice(0, idx), ...moi, ...prev.slice(idx + 1)];
    });
    setActiveIdx(idx);
  }

  function isLineComplete(d: DonHangDraft): boolean {
    return !!(
      d.ma_lk.trim() &&
      d.loai_de_xuat.trim() &&
      d.so_luong_de_xuat > 0 &&
      (!canNoRequired(d.loai_de_xuat) || d.chinh_sach.trim()) &&
      (!maYcscRequired(d.loai_de_xuat) || coMaIdLienQuan(d.ma_yeu_cau_su_co, d.ma_lada)) &&
      // CHOT (phan hoi 2026-08-24, muc 1): don tra hang bat buoc 1-3 anh linh kien can tra.
      (deriveLoaiDon(d.loai_de_xuat) !== "tra_hang" || (d.anh.length >= 1 && d.anh.length <= 3)) &&
      // MUA HÀNG CÔNG NỢ ĐỐI TÁC (v1.403): bat buoc chon doi tac.
      (!laMuaCongNoDoiTac(d.loai_de_xuat) || !!d.doi_tac_ma) &&
      // CÔNG NỢ SỬA CHỮA (v1.495): bat buoc ma don bao hanh dung dang.
      (!laDonSuaChua(d.loai_de_xuat) || !!chuanMaDonBh(d.bh_don_vi_id))
    );
  }

  const canSubmit = !chuaCoMaMisa && !khLeSdtSai && !coDongBiChan && drafts.every(isLineComplete);
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

  // "⧉ Sao chép dòng" (chot 2026-11-14, v1.491 - "copy y nguyên nội dung đơn bên trên ngoại trừ bỏ trống linh kiện => tiết kiệm thời gian
  // nhập liệu lại thông tin mã phê duyệt, mã sự cố, loại đề xuất"): them 1 dong MOI cuoi danh sach = ban sao dong idx (mac dinh dong dang
  // mo), bo trong Ma LK + anh tra hang (anh gan voi LK). KHONG doi dong nguon hoan tat nhu "+ Thêm dòng" - muc dich la chep thong tin.
  function saoChepDong(idx: number = activeIdx) {
    const goc = drafts[idx];
    if (!goc) return;
    setAddBlockedHint(false);
    setDrafts((prev) => [...prev, { ...goc, ma_lk: "", anh: [] }]);
    setActiveIdx(drafts.length);
    setJustAdded(true);
  }

  // "Tạo đơn giống đơn này" tu chi tiet don (taoDonGiong.ts): lay hang cho -> them dong. Ma LK DA CO trong danh sach dang tao -> bo trong
  // (chot nguoi dung). Form dang chi co 1 dong rong -> thay dong do; TN/GS dang tao hop trong -> lay luon nguoi nhan hang cua don goc.
  const nhanTaoGiongRef = useRef<() => void>(() => {});
  nhanTaoGiongRef.current = () => {
    const ds = layHangChoTaoGiong();
    if (!ds.length) return;
    const truoc = draftsRef.current;
    const formTrong = truoc.length === 1 && !coNoiDung(truoc);
    const next = formTrong ? [] : [...truoc];
    const boTrong: string[] = [];
    for (const { draft } of ds) {
      const ma = draft.ma_lk.trim();
      const trung = !!ma && next.some((d) => d.ma_lk.trim().toUpperCase() === ma.toUpperCase());
      if (trung) boTrong.push(ma);
      next.push({ ...emptyDraft(), ...draft, ma_lk: trung ? "" : draft.ma_lk, anh: [] });
    }
    setDrafts(next);
    setActiveIdx(next.length - 1);
    setJustAdded(true);
    const nhan = ds[0].nguoiNhanHang?.trim();
    if (canQuanLy && formTrong && !nguoiNhanHang && nhan && nhan.toLowerCase() !== currentEmail.toLowerCase()) setNguoiNhanHang(nhan);
    addToast(
      boTrong.length
        ? t("Đã thêm dòng giống đơn — linh kiện {ma} đã có trong danh sách nên để trống, chọn linh kiện khác", { ma: boTrong.join(", ") })
        : t("Đã thêm dòng giống đơn đang xem — kiểm tra lại rồi bấm Tạo đơn"),
    );
  };
  useEffect(() => {
    const huyDangKy = dangKyFormTaoDon();
    const nghe = () => nhanTaoGiongRef.current();
    window.addEventListener(SU_KIEN_TAO_DON_GIONG, nghe);
    nghe();
    return () => {
      window.removeEventListener(SU_KIEN_TAO_DON_GIONG, nghe);
      huyDangKy();
    };
  }, []);

  function deleteDraft(idx: number) {
    if (drafts.length === 1) return;
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
    setActiveIdx((cur) => (idx < cur ? cur - 1 : idx === cur ? Math.max(0, cur - 1) : cur));
  }

  const tongSoLuong = drafts.reduce((sum, d) => sum + (d.so_luong_de_xuat || 0), 0);
  // Phan gia tri cac dong dang soan duoc CONG vao tong ngay tinh chiet khau (Mua + TRỪ CÔNG NỢ, gia ban x SL -
  // khop DON_TINH_TONG_NGAY_SQL o backend) - xem truoc muc chiet khau sau khi tao (TongNgayKtv.tsx).
  const giaTriTinhChietKhau = drafts.reduce((sum, d) => {
    const lde = d.loai_de_xuat.trim();
    if (!lde || (deriveLoaiDon(lde) !== "mua" && !laTruCongNo(lde)) || laMuaCongNoDoiTac(lde)) return sum;
    const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
    return sum + (lk?.gia_ban != null ? lk.gia_ban * d.so_luong_de_xuat : 0);
  }, 0);

  // Gia uoc tinh SAU CHIET KHAU tung dong (2026-10-12, phan hoi "giá 557 là giá niêm yết trong khi hiển thị được hưởng chiết
  // khấu >=500k"): CUNG quy tac tinhToanPxk (backend lib/pxkRecalculate.ts) cho dong Mua + TRỪ CÔNG NỢ - KH le / co yeu cau hoa
  // don = gia niem yet, Dinh tu x85%, con lai theo moc TONG NGAY (da tao hom nay + cac dong dang soan): <200k gia ban, 200-500k
  // x70%, >=500k gia KTV (LK chua co gia KTV giu gia ban). Khong tinh gia du phong (MUA DỰ TRỮ) - backend chot khi tao.
  // Dong khac (cong no/tra hang) giu gia niem yet x SL nhu truoc (chi de tham khao).
  const { data: tongNgayData } = useTongNgayKtv(targetNguoiNhanHang);
  // v1.434: + phieu dang mo cua KTV (chua Ke toan chot xong don xuat) - backend tong_tinh_ck, khop tinhToanPxk.
  const tongNgaySau = (tongNgayData?.rows[0]?.tong_tinh_ck ?? tongNgayData?.rows[0]?.tong_gia_tri ?? 0) + giaTriTinhChietKhau;
  // chuaCoGiaKtv (2026-10-30, "hiện cảnh báo cho ktv với các trường hợp đặt mua gặp phải trường hợp này" - DDH-003275): tong ngay >= 500k
  // (muc gia KTV) nhung LK chua khai bao Gia KTV -> backend giu GIA NIEM YET, khong chiet khau -> canh bao ngay o dong (CanhBaoChuaCoGiaKtv).
  function giaUocTinhDong(d: DonHangDraft): { gia: number | null; giaNiemYet: number | null; nhan: string | null; chuaCoGiaKtv?: boolean } {
    const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
    if (lk?.gia_ban == null) return { gia: null, giaNiemYet: null, nhan: null };
    const sl = d.so_luong_de_xuat || 0;
    const niemYet = lk.gia_ban * sl;
    const lde = d.loai_de_xuat.trim();
    if (!lde || (deriveLoaiDon(lde) !== "mua" && !laTruCongNo(lde))) return { gia: niemYet, giaNiemYet: niemYet, nhan: null };
    if (tongNgayData?.kh_le || coYeuCauHoaDon(d.yeu_cau_hoa_don) || laMuaCongNoDoiTac(lde)) return { gia: niemYet, giaNiemYet: niemYet, nhan: null };
    if (laDinhTuFe(lk.don_vi)) return { gia: Math.round(lk.gia_ban * 0.85) * sl, giaNiemYet: niemYet, nhan: t("Đình tủ −15%") };
    if (tongNgaySau < 200000) return { gia: niemYet, giaNiemYet: niemYet, nhan: null };
    if (tongNgaySau < 500000) return { gia: Math.round(lk.gia_ban * 0.7) * sl, giaNiemYet: niemYet, nhan: t("Tổng ngày 200–500k −30%") };
    if ((lk.gia_tri_cong_no ?? 0) > 0) return { gia: lk.gia_tri_cong_no! * sl, giaNiemYet: niemYet, nhan: t("Giá KTV") };
    return { gia: niemYet, giaNiemYet: niemYet, nhan: null, chuaCoGiaKtv: niemYet > 0 };
  }
  // Dong cong no doi tac tach rieng (ghi no doi tac, KTV khong tra - v1.408): tongGiaUocTinh = tien KTV, tongGhiNoDoiTac = phan doi tac.
  const tongGiaUocTinh = drafts.reduce((sum, d) => sum + (laMuaCongNoDoiTac(d.loai_de_xuat) ? 0 : giaUocTinhDong(d).gia ?? 0), 0);
  const tongGhiNoDoiTac = drafts.reduce((sum, d) => sum + (laMuaCongNoDoiTac(d.loai_de_xuat) ? giaUocTinhDong(d).gia ?? 0 : 0), 0);
  // Tong tien (gia niem yet x SL) cac dong dang soan cung 1 doi tac - so voi kha dung de canh bao vuot moc (DoiTacCongNoChon).
  function tienDoiTacTrenForm(ma: string): number {
    return drafts.reduce((sum, d) => {
      if (!laMuaCongNoDoiTac(d.loai_de_xuat) || d.doi_tac_ma !== ma) return sum;
      const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
      return sum + (lk?.gia_ban ?? 0) * (d.so_luong_de_xuat || 0);
    }, 0);
  }

  // "Cong no tam tinh" cua RIENG cac dong loai_don='cong_no' dang soan - CUNG cong thuc voi backend
  // (gia_tri_cong_no x so_luong_de_xuat, xem POST /phieu-dat) nhung tinh tai client de canh bao SONG
  // (khong doi submit xong moi biet).
  const tongCongNoTamTinh = drafts.reduce((sum, d) => {
    // "TRỪ CÔNG NỢ" khong doi chieu cong no (chot 2026-09-28) - khop backend POST /phieu-dat.
    // + don KH tra gop / HỖ TRỢ 0 ĐỒNG (khongTinhCongNo) - gia tri CN = 0, khop backend.
    // + CÔNG NỢ SỬA CHỮA (v1.504) khong xet tran - khop backend canDoiChieuCongNo (truoc day form van bao "Vượt trần công nợ dự kiến").
    if (deriveLoaiDon(d.loai_de_xuat.trim()) !== "cong_no" || laTruCongNo(d.loai_de_xuat) || khongTinhCongNo(d.loai_de_xuat) || laCongNoSuaChua(d.loai_de_xuat)) return sum;
    const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
    // LK nhom B2B khong xet tran cong no (2026-10-27) - khop backend danhGiaPhieu.
    if (lk?.nhom_lk === "b2b") return sum;
    return sum + (lk?.gia_tri_cong_no ?? 0) * d.so_luong_de_xuat;
  }, 0);
  // null = khong the danh gia (chua co dong cong_no nao trong luc soan, HOAC chua tai xong du lieu
  // congNoDuKien) - KHAC voi false ("Khong du"). SUA 2026-09-04 (phan hoi "trường hợp ktv không có
  // trần công nợ, tạo cảnh báo tương tự với trần công nợ = 0"): nguoi nhan hang CHUA duoc gan tran
  // (congNoDuKien.tran === null) gio coi NHU tran = 0 (KHAC truoc day la bo qua/khong danh gia) -
  // khop dung quy uoc moi cua danhGiaCongNo3Muc o backend.
  const sePhepDuCongNo: boolean | null =
    // khong_xet_tran: nguoi nhan la GS (2026-10-16) - don cong no GS khong doi chieu tran.
    tongCongNoTamTinh > 0 && congNoDuKien != null && !congNoDuKien.khong_xet_tran
      ? congNoDuKien.cong_no_chot + tongCongNoTamTinh <= (congNoDuKien.tran ?? 0)
      : null;

  // "Co dong MUA DỰ TRỮ dang soan" - dieu kien hien banner thong tin du phong (khac cong no: khong co
  // khai niem "du/khong du", chi hien SO CON KHA DUNG de KTV/TN tu can nhac, xem TaoDonTab.tsx).
  const coDongMuaDuTru = drafts.some((d) => d.loai_de_xuat.trim().toUpperCase() === "MUA DỰ TRỮ");

  return {
    danhMuc, nguoiNhanHang, setNguoiNhanHang, drafts, infoExpandedIdx, setInfoExpandedIdx,
    activeIdx, setActiveIdx, otherLdeIdx, setOtherLdeIdx, addBlockedHint, setAddBlockedHint,
    activeRowRef, justAdded, currentEmail, loaiDeXuatOptions, nguoiNhanHangData, create,
    updateDraft, apDungThayThe, isLineComplete, canSubmit, showImport, setShowImport, themDong, saoChepDong, deleteDraft,
    giaUocTinhDong, tongGiaUocTinh, tongGhiNoDoiTac, tongSoLuong, tongCongNoTamTinh, sePhepDuCongNo, congNoDuKien,
    duPhongDuKien, coDongMuaDuTru, targetNguoiNhanHang, giaTriTinhChietKhau, chuaCoMaMisa,
    laNhomKhLe, khLeSdt, setKhLeSdt, khLeSdtSai, khLeTraCuu, khLeDangTraCuu,
    kiemTra: kiemTraHienTai, dangKiemTra, loiPhieuText, ketQuaTheoDong, coDongBiChan, dongCanXacNhan, hoiXacNhan, setHoiXacNhan,
    ketQuaTao, dongKetQuaTao, khoiPhucLuc, boNhap, anKhoiPhuc: () => setKhoiPhucLuc(null),
    hoiKhoiPhuc, moLaiNhap, boQuaNhapCu, coNoiDungChuaTao, luuNhapNgay, xoaNhap,
    doiTacChon, tienDoiTacTrenForm, nhanLaNvSuaChua, tenNguoiNhan,
  };
}

export type TaoDonForm = ReturnType<typeof useTaoDonForm>;

// Ban sao laDinhTu() backend (lib/pxkRecalculate.ts) - so khong dau/hoa-thuong.
function laDinhTuFe(donVi: string | null | undefined): boolean {
  return (donVi ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/\s+/g, " ").trim() === "dinh tu";
}
