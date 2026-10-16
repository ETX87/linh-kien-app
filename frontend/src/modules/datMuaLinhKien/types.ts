// Cac interface/type dung chung cho module "Dat mua linh kien" (tach ra tu DatMuaLinhKienModule.tsx
// khi chia nho file - UI redesign Phase 3, phan hoi Codex 2026-08-19).

// Khop response cua POST /dat-mua-lk/don-hang/import/preview|commit (them 2026-08-15, tieu chi UX
// #4) - xem processDatDonHangImportRows o backend/src/routes/datMuaLinhKien.ts.
export interface DatDonHangImportSummary {
  thanhCong: number;
  loi: number;
  errors: string[];
  soPhieu: number;
  ktvList: string[];
  phieuIds?: string[];
}

export interface LkDanhMucRow {
  ma_linh_kien: string;
  ten_linh_kien: string;
  // CHOT 2026-08-16 (dot 3 gop y): "Gia de xuat" lay tu gia_ban (gia ban dang quan ly chu dong),
  // KHONG con dung gia_tham_chieu.
  gia_ban: number | null;
  don_vi: string | null;
  bat_tat: number;
  // "Only sua chua" - loai khoi picker chon linh kien khi tao don, xem migration 0083.
  chi_sua_chua?: number;
  // Da co san tren API (SELECT * FROM linh_kien) va trong cache IndexedDB (linhKienCache.ts) - chi
  // thieu trong TYPE nay, khong thieu trong DU LIEU THAT (ra soat "Tao Don Linh Kien 2.0" #3, dung
  // cho LinhKienPicker).
  anh_demo?: string | null;
  // Them cho LinhKienDetailModal (nut "xem chi tiet linh kien") - cung ly do nhu anh_demo, du lieu
  // da co san tu SELECT *, chi bo sung TYPE.
  ghi_chu?: string | null;
  // "dac_thu"/"phan_loai_dac_thu" (them 2026-08-25, phan hoi "khi chọn 1 lk thuộc diện đặc thù...
  // hiện 1 note") - CUNG ly do voi anh_demo/ghi_chu o tren: du lieu da co san tu SELECT * o backend,
  // chi thieu trong TYPE nay. Dung o LinhKienPicker.tsx de hien canh bao TBP duyet.
  dac_thu?: number | null;
  // Xet duyet ma chuan (migration 0053) - "Cho xet duyet" hien nhan o LinhKienPicker.
  trang_thai_ma?: string;
  phan_loai_dac_thu?: string | null;
  // "gia_tri_cong_no" (them 04/09/2026) - CUNG ly do voi anh_demo/ghi_chu o tren: du lieu da co san tu
  // SELECT * o backend, chi thieu trong TYPE nay. Dung o useTaoDonForm.ts tinh "Cong no tam tinh" song
  // ngay luc soan don (xem GET /dat-mua-lk/cong-no-du-kien).
  gia_tri_cong_no?: number | null;
  // "Cho phép giá 0đ" (migration 0080) - LK duoc dat don co tien (MUA / TRỪ CÔNG NỢ) khi gia ban 0 / chua co gia.
  cho_phep_gia_0?: number | null;
  // Cac truong moi tu gia88 (them 2026-09-12, xem types.ts LinhKienRow) - "cam_ban" BAT BUOC (dung
  // loc khoi picker o helpers.ts useLkAndLdeCache), cac truong con lai chi hien thi tham khao khi mo
  // LinhKienDetailModal.
  cam_ban?: number | null;
  gia_du_phong?: number | null;
  gia_eu?: number | null;
  don_vi_nhap?: string | null;
  nhan_hang?: string | null;
  thiet_bi?: string | null;
  don_vi_tinh?: string | null;
  ghi_chu_doi_tac?: string | null;
  // Muc combo trong o chon LK luc tao don (migration 0066) - KHONG phai LK that: gia = tong thanh phan, server tach thanh
  // tung don thanh phan khi luu (comboThanhLkRow o helpers.ts).
  combo?: LkComboRow;
}

// POST /dat-mua-lk/phieu-dat/kiem-tra (tu dong duyet 100%, 2026-10-14) - ket qua du kien tung dong truoc khi tao don.
export interface KiemTraDong {
  goc: number; // vi tri dong trong danh sach GUI LEN (dong combo tach thanh nhieu ket qua cung goc)
  ma_lk: string;
  so_luong: number;
  combo_ma: string | null;
  trang_thai: "Cho TBP xac nhan" | "Cho GS duyet" | "TN da duyet" | "Cho thanh toan" | "Cho hang" | "Cho ke toan duyet mem";
  loi: string | null;
  thong_diep: string | null;
  ton: number | null;
  nguon_ton: "kho" | "ktv" | null;
  bat_buoc_chuyen_tien: boolean;
}
// Ket qua POST /dat-mua-lk/phieu-dat (2026-10-15): tung dong da tao + trang thai khoi tao + ly do (ghi chu log he thong).
export interface KetQuaTaoDonDong {
  id: string;
  ten: string; // "<ten LK> (xSL)"
  trang_thai: string;
  ly_do: string | null;
}
export interface KetQuaTaoDon {
  id: string;
  trung_lap?: boolean;
  kh_le?: { ma: string; sdt: string | null; moi: boolean } | null;
  dong?: KetQuaTaoDonDong[];
}
export interface KiemTraPhieuDat {
  loi_phieu: string | null;
  khu_vuc?: string;
  danh_gia_cong_no?: "Du" | "Khong du" | null;
  cong_no_chot?: number;
  tong_moi_cong_no?: number;
  tran_cong_no?: number | null;
  dong: KiemTraDong[];
}

// Combo linh kien (GET /lk-settings/combo, migration 0066).
export interface LkComboThanhPhan {
  ma_lk: string;
  so_luong: number;
  ten_lk: string | null;
  gia_ban: number | null;
  gia_tri_cong_no: number | null;
  lk_bat_tat: number | null;
}
export interface LkComboRow {
  ma_combo: string;
  ten_combo: string;
  bat_tat: number;
  ghi_chu: string | null;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
  ct: LkComboThanhPhan[];
}

// Trang thai 1 DONG don hang - null cho dong loai_don='tra_hang' (dung tra_hang_log rieng, xem
// TraHangTab). Log dinh kem la lich su rieng cua dong do (dat_don_hang_log).
export interface DonHangLogRow {
  id: number;
  dat_don_hang_id: string;
  trang_thai: string;
  nguoi_xu_ly: string;
  ngay_xu_ly: string;
  ghi_chu: string | null;
  // 1 = "Tự động duyệt đơn" (he thong tu duyet luc tao, migration 0037) - khac "TN đã duyệt" cua nguoi duyet.
  tu_dong?: number;
}

// Lich su "giai trinh ly do cham" (migration 0014, phan hoi QA 2026-08-31, muc #5) - 1 dong don hang
// co the co NHIEU lan giai trinh (moi lan qua han 24h lai can 1 lan moi), khac han ly_do_cham (cot cu
// tren DonHangRow, gio chi con la MIRROR noi dung lan giai trinh GAN NHAT, dung de hien nhanh).
export interface GiaiTrinhRow {
  id: number;
  dat_don_hang_id: string;
  noi_dung: string;
  nguoi_tao: string;
  ngay_tao: string;
}

export interface DonHangRow {
  id: string;
  phieu_dat_id: string;
  loai_don: "mua" | "cong_no" | "tra_hang";
  ma_lk: string;
  ten_lk_snapshot: string | null;
  // Don sinh tu combo (migration 0066) - nhan hien thi.
  combo_ma?: string | null;
  loai_de_xuat: string | null;
  so_luong_de_xuat: number;
  so_luong_thuc_xuat: number | null;
  gia_de_xuat: number | null;
  gia_chot: number | null;
  ly_do_cham: string | null;
  ma_xuat_kho: string | null;
  ma_misa: string | null;
  so_tien_cong_no: number | null;
  // "Cong no tam tinh" da CHOT (them 04/09/2026) - "Du"/"Khong du" so voi Tran cong no cua nguoi nhan
  // hang tai thoi diem TAO don (khong tinh lai sau do) - null neu khong phai dong cong_no, hoac Tran
  // cong no chua duoc dat luc tao (khong the danh gia) - xem lib/congNoKtv.ts.
  danh_gia_cong_no: "Du" | "Khong du" | null;
  nguoi_tao: string;
  // Denormalize xuong tan dong (CHOT 2026-08-15, bo khai niem "phieu dat" - migration 0075).
  nguoi_nhan_hang: string | null;
  email_gs: string | null;
  ngay_tao: string;
  // 6 truong bo sung 2026-08-14 (doi chieu Excel goc, xem migration 0070) - nguoi tao dien luc tao.
  ghi_chu: string | null;
  yeu_cau_hoa_don: string | null;
  tt_mail_duyet: string | null;
  tt_khach_hang: string | null;
  chinh_sach: string | null;
  ma_yeu_cau_su_co: string | null;
  ma_lada?: string | null; // "Mã Lada liên quan" (migration 0054)
  tien_da_tra?: number; // tien da thanh toan don MANG THEO khi chua vao phieu (migration 0056)
  // Ticket thieu hang GAN NHAT cua don (GET /don-hang, 2026-09-30).
  tlk_ngay_du_kien?: string | null;
  tlk_ngay_hang_ve?: string | null;
  tlk_tiep_nhan_luc?: string | null;
  tlk_nguoi_tiep_nhan?: string | null;
  // GET /don-hang/:id (TN/Admin): don chua vao phieu con thieu tien -> so can tra + quy du hien tai cua nguoi nhan hang.
  tra_bang_quy?: { can_tra: number; quy: number } | null;
  // Tu dong duyet 100% (migration 0080): ma EO GS/TBP nhap khi duyet don vuot tran + canh bao cong no nguoi nhan (chi tiet don
  // "Cho TBP xac nhan"/"Cho GS duyet" - tran, cong no chot hien tai, gia tri cong no cua don).
  ma_eo?: string | null;
  ma_eo_nguoi?: string | null;
  cong_no_nhan?: { tran: number | null; chot: number; don: number | null } | null;
  tien_da_tra_pxk?: string | null;
  uu_tien: number;
  trang_thai?: string | null;
  // Cot goc "dat_don_hang.trang_thai_hien_tai" (khac "trang_thai" o tren - vai noi API tra ve qua
  // ddh.* thay vi alias) - dung de gate dung dieu kien "con dang Cho TN duyet" cho nut Luu ly do cham
  // trong PhieuXuatKhoTab.tsx (xem GET /phieu-xuat-kho/:id o backend).
  trang_thai_hien_tai?: string | null;
  // Tu linh_kien.dac_thu qua LEFT JOIN (khong luu tren dat_don_hang) - true khi can qua buoc "Cho TBP
  // xac nhan" truoc TN, xem migration 0082. Tu 2026-10-02 = gia tri HIEU LUC (TN chon tay tren don thang danh muc, 0064).
  dac_thu?: number | null;
  dac_thu_thu_cong?: number | null;
  dac_thu_nguoi_sua?: string | null;
  dac_thu_sua_luc?: string | null;
  lk_dac_thu?: number | null;
  logs?: DonHangLogRow[];
  cases?: { id: string; khach_hang: string | null; khu_vuc: string | null }[];
  // Chi co tren GET /phieu-dat/:id va GET /phieu-xuat-kho/:id (tinh server-side, khong luu DB) - true
  // khi dong ton qua 24h ke tu lan giai trinh GAN NHAT (hoac "Cho TN duyet" neu chua tung giai trinh
  // lan nao) ma chua giai trinh lai (xem lib/hanLyDoCham.ts).
  qua_han_ly_do_cham?: boolean;
  // Chi co tren GET /don-hang/:id va GET /phieu-xuat-kho/:id (migration 0014, muc #5) - toan bo lich
  // su giai trinh cua dong nay, moi nhat truoc.
  giaiTrinh?: GiaiTrinhRow[];
  // Cot "Ghi chú Admin" (Phase 2 StageMenu, them 2026-09-11) - dat_don_hang KHONG co cot ghi chu noi
  // bo rieng, lay tam ghi_chu cua dong dat_don_hang_log MOI NHAT (thuong la ly do TN/Kho/QC vua duyet/
  // tu choi/cho hang) lam gia tri hien thi gan nhat voi y nghia "ghi chu xu ly" - xem scalar subquery
  // trong GET /don-hang.
  ghi_chu_xu_ly_gan_nhat?: string | null;
  // Khu vuc CUA NGUOI NHAN HANG (them 2026-09-12, phan hoi "sắp xếp cột bảng danh sách đơn giống file
  // tham chiếu") - khong phai cot that tren dat_don_hang, server LEFT JOIN qua ktv_lien_he.khu_vuc_ma
  // cua chinh nguoi_nhan_hang (xem GET /don-hang) - null neu chua co nguoi_nhan_hang hoac KTV do chua
  // duoc gan Khu vuc.
  khu_vuc_ten?: string | null;
  // Khu vuc tu tinh (trigger) + khu vuc xu ly chon tay cho rieng don (2026-10-15, PATCH /don-hang/:id/khu-vuc) - chi tiet don (ddh.*).
  khu_vuc_ma?: string | null;
  khu_vuc_chon?: string | null;
  // Trang thai phieu xuat kho + chuyen tien THEO DON (2026-09-29) - MA do backend suy tu PXK chua don (lib/trangThaiDonPxk.ts),
  // nhan o TRANG_THAI_PXK_DON_OPTIONS / THANH_TOAN_DON_OPTIONS (constants.ts). Chi co o GET /don-hang (danh sach).
  trang_thai_pxk?: string | null;
  thanh_toan?: string | null;
  // Loai chiet khau duoc huong (migration 0033) - he thong gan luc tao PXK, TN chon lai duoc (thu_cong=1).
  // Ten lay tu danh sach settings (useLoaiChietKhauList), khong JOIN o tung API.
  loai_chiet_khau_id?: number | null;
  loai_chiet_khau_thu_cong?: number | null;
  // Gia danh muc (LEFT JOIN linh_kien) - GET /don-hang/:id va GET /phieu-xuat-kho/:id (du 3 cot, dung goi y
  // gia thuc te khi TN doi loai chiet khau - LoaiChietKhauPicker); GET /don-hang chi co lk_gia_ban (cot
  // "Giá niêm yết", 2026-09-28).
  lk_gia_ban?: number | null;
  lk_gia_tri_cong_no?: number | null;
  lk_gia_du_phong?: number | null;
  // Gia tri server tinh lai theo loai chiet khau va SL thuc xuat cua toan PXK. GET /don-hang (co phan trang)
  // va GET /don-hang/:id cung tra (lib/pxkRecalculate.ts tienUocTinhChoDon) - nguon cot "Giá đề xuất" sau CK.
  tien_uoc_tinh?: number | null;
  // 1 = don tu duyet da tu gom vao PXK, nguoi tao/KTV nhan hang con tu huy duoc (backend lib/pxkTuHuy.ts).
  tu_huy_duoc?: number | null;
  // 1 = don "TN da duyet" trong PXK con "Dang tao phieu", Ke toan chua duyet chuyen tien -> TN van Huy/Tu choi/
  // Cho hang duoc (don tu go khoi phieu) - backend TN_DOI_TRONG_PXK_SQL.
  tn_doi_trong_pxk?: number | null;
  // Han TN "đẩy lại" don da huy / tu choi (gio VN, = luc huy/tu choi + 24h); null = khong ap dung (2026-10-05).
  day_lai_han?: string | null;
  // 1 = don "Cho hang" ma Kho DA tiep nhan ticket thieu LK (dang xu ly) -> khoa thao tac, cho Kho (2026-09-30). Don
  // "Cho hang" con lai (Kho chua tiep nhan / ticket da dong) thao tac nhu "Cho TN duyet", ticket tu huy.
  kho_dang_xu_ly_thieu_lk?: number | null;
}

// PXK - "chuyen tien" la 1 dieu kien chan rieng tren chinh PXK (thay the bang phieu_so_tien cu, xem
// migration 0066), khong phai 1 buoc trong chuoi trang_thai chinh.
export interface PhieuXuatKhoRow {
  id: string;
  ma_xuat_kho: string;
  // Dot 2 (muc C/D/E/F, migration 0077).
  ma_xuat_kho_xac_nhan: number;
  ma_misa: string | null;
  ma_van_don: string | null;
  anh_bien_ban_url: string | null;
  nguoi_tao: string;
  nguoi_nhan_hang: string | null;
  // Dot 3 gop y #8 (migration 0079) - denormalize tu dong con, null cho PXK cu truoc khi chot quy tac.
  loai_don: "mua" | "cong_no" | "tra_hang" | null;
  ngay_tao: string;
  ghi_chu: string | null;
  trang_thai: string;
  so_dong: number;
  // Kho xuat (migration 0070): mien_xuat = TN/Ke toan chuyen tay (NULL = theo khu vuc), _hieu_luc = mien dang ap dung,
  // mien_khu_vuc = mien suy tu khu vuc cua phieu (chi chi tiet PXK tra).
  mien_xuat?: "bac" | "nam" | null;
  mien_xuat_hieu_luc?: "bac" | "nam" | null;
  mien_khu_vuc?: "bac" | "nam" | null;
  // Nguoi chuyen kho xuat gan nhat (chi chi tiet PXK, khi mien_xuat co) - chiu trach nhiem theo doi phieu (2026-10-15).
  mien_xuat_nguoi_chuyen?: string | null;
  // Khu vuc (0042) + Kho chon lai cho phieu sai khu vuc (0071) - ten chi chi tiet PXK tra.
  khu_vuc_ma?: string | null;
  khu_vuc_chon?: string | null;
  khu_vuc_tu_dong_ten?: string | null;
  khu_vuc_chon_ten?: string | null;
  // Id loai chiet khau co thu tu cao nhat trong cac dong cua phieu (GET /api/phieu-xuat-kho).
  loai_chiet_khau_cao_nhat_id?: number | null;
  so_tien_can_chuyen: number | null;
  trang_thai_chuyen_tien: string | null;
  bang_chung_chuyen_tien_url?: string | null;
  bang_chung_chuyen_tien_anh?: string | null; // JSON array URL, toi da 5 (migration 0043)
  // So tien tu doc tren anh (migration 0051, JSON {url: so|null}) + anh da nam trong khoan Ke toan da duyet (JSON array).
  bang_chung_tien_doc?: string | null;
  anh_da_ghi_nhan?: string | null;
  ly_do_tu_choi_chuyen_tien?: string | null; // Ke toan tu choi bang chung GAN NHAT (migration 0046)
  tu_choi_chuyen_tien_luc?: string | null;
  bang_chung_chuyen_tien_ghi_chu?: string | null;
  ngay_ktv_chuyen?: string | null;
  // Quy du KTV (migration 0047): da tra cho phieu (tien chuyen + quy da tru) va tong tien Ke toan xac nhan thuc nhan.
  da_thanh_toan?: number;
  tien_thuc_chuyen?: number;
  // Co PHU rieng cua Kho (migration 0032, phan hoi 2026-09-24: "chờ kho gửi hàng cho ktv, thêm 1 trạng
  // thái phụ là đã in phiếu/ chưa in phiếu") - theo doi thuan tuy, khong anh huong trang_thai_hien_tai.
  da_in_phieu: number;
  // "Loai phieu" (2026-09-30) - JSON mang loai de xuat khac nhau cua dong don trong phieu (GET /phieu-xuat-kho).
  loai_phieu?: string | null;
  // Co it nhat 1 dong dat_don_hang ben trong dang uu_tien=1 - danh dau ca PXK de nguoi xu ly biet
  // TRUOC KHI mo chi tiet (phan hoi 2026-08-19: "tất cả các phiếu... có liên quan đến đơn ưu tiên
  // bên trong, cũng tự động tô màu").
  co_don_uu_tien?: boolean;
}

export interface DonHangKhaDungRow {
  id: string;
  ma_lk: string;
  ma_yeu_cau_su_co?: string | null;
  ma_lada?: string | null;
  yeu_cau_hoa_don?: string | null;
  tien_da_tra?: number;
  tien_da_tra_pxk?: string | null;
  ten_lk_snapshot: string | null;
  so_luong_de_xuat: number;
  gia_chot: number | null;
  gia_de_xuat: number | null;
  updated_at: string;
  nguoi_nhan_hang: string | null;
  loai_don?: string | null;
  loai_de_xuat?: string | null;
  so_luong_thuc_xuat?: number | null;
  so_tien_cong_no?: number | null;
  // Ngay tao don (gio VN) - hien tong dat trong ngay cua KTV o modal tao PXK (2026-09-28).
  ngay_tao?: string | null;
}

export interface ThieuLkRow {
  id: string;
  dat_don_hang_id: string;
  ly_do_cham_id: number | null;
  ten_ly_do: string | null;
  ngay_du_kien_co_hang: string | null;
  /** Ngay (gio VN) Kho bam "Hàng đã về" - server tu dien (migration 0040). */
  ngay_hang_ve_thuc_te?: string | null;
  nguoi_tao: string;
  ngay_tao: string;
  trang_thai: string;
  // CHOT (ra soat module #11) - JOIN tu dat_don_hang, thong tin Kho can doc DAU TIEN de xu ly ticket.
  ma_lk?: string | null;
  ten_lk_snapshot?: string | null;
  // Them 2026-08-21 (phan hoi "các quy trình con của đơn ưu tiên cũng tô màu như đơn ưu tiên") - JOIN
  // tu dat_don_hang, dung to mau dong ⭐ giong DonCuaToiTab/PhieuXuatKhoTab.
  uu_tien?: number | null;
  // Them 2026-08-21 (phan hoi "format Thiếu LK khác Mua hàng/Công nợ") - JOIN tu dat_don_hang, dung
  // nhom danh sach theo KTV (nguoi_nhan_hang || ddh_nguoi_tao, KHONG PHAI "nguoi_tao" o tren - do la
  // nguoi BAO thieu, vd Kho) + hien Badge "Loại", dong bo kien truc voi DonHangGroupedList.
  nguoi_nhan_hang?: string | null;
  loai_don?: string | null;
  loai_de_xuat?: string | null;
  ddh_nguoi_tao?: string | null;
  loai_chiet_khau_id?: number | null;
  loai_chiet_khau_thu_cong?: number | null;
  /** SL cua dong don goc (JOIN dat_don_hang, 2026-09-29 - hien tren the mobile/Drawer). */
  so_luong_de_xuat?: number | null;
  /** Trang thai ma LK cua don goc (linh_kien.trang_thai_ma, 2026-10-16) - "Cho xet duyet" = ma cho Kho/Mua hang xac nhan. */
  lk_trang_thai_ma?: string | null;
}

export interface LyDoChamRow {
  id: number;
  ten_ly_do: string;
  he_thong_su_dung: string;
  quan_ly_don_thieu_linh_kien: number;
  bat_tat: number;
}

// Dong dat_don_hang (loai_don='tra_hang'), kem trang thai rieng luong tra hang - xem
// backend/src/routes/traHang.ts (buoc 3 ke hoach "Luong tao don mua hang").
export interface TraHangRow extends DonHangRow {
  trang_thai_tra_hang: string;
  // Han 24h tung giai doan (2026-10-01, GET /tra-hang): qua_han_ly_do_cham (ke thua DonHangRow) = da qua han buoc dang giu.
  han_giai_doan?: string | null;
}

export type KtvDisplayMap = Map<string, { ma_ktv: string; ten_hien_thi: string | null }>;

export interface NguoiNhanHangKhaDungRow {
  ma_ktv: string;
  ten_hien_thi: string | null;
  email_dang_nhap: string;
  ten_gs?: string | null;
  // 1 = tai khoan dang TAT (users.bi_khoa) - van tra ve de tra ten don cu, o chon nguoi nhan hang khi tao don tu loc bo
  bi_khoa?: number;
  // 1 = tai khoan nhom KH le (KH_LE_MB/KH_LE_MN, migration 0074) - tao don hien o nhap SDT KH
  la_nhom_kh_le?: number;
}
// KH le (bang khach_le, GET /khach-le/tra-cuu + GET /khach-le)
export interface KhachLeRow {
  ma: string;
  sdt: string | null;
  nhom_ma: string;
  email: string;
  ngay_tao: string;
  nguoi_tao: string | null;
  ten: string | null;
  quy_du: number;
  tien_giu_tren_don: number;
  so_don: number;
  so_don_cho_hang: number;
  so_don_mo: number;
}
export interface LuongQuyTrinhStep {
  key: string;
  label: string;
  count: number;
  // FIX (ra soat 2026-08-29): so rieng cua nguoi dang xem (chi co o "cho_tien"/"ktv") - xem giai thich
  // day du o LuongQuyTrinhStep backend (datMuaLinhKien.ts). Dung thay `count` khi hien thi "viec cua
  // toi" cho KTV/Ve tinh, KHONG dung cho bang dieu hanh chung.
  countCuaToi?: number;
  // Gan o FE khi dung countCuaToi (DatMuaLinhKienModule.tsx) - bam the thi loc PXK theo chinh nguoi xem cho khop so.
  nguoiNhanHang?: string;
  roleKeys: string[];
  tab: string;
  filter: string;
  // Them (migration 0002_tra_hang_pxk.sql) - CHI dung cho 3 buoc PXK tra hang, xem giai thich o
  // backend datMuaLinhKien.ts.
  loaiDon?: string;
}
// Them (2026-09-01, phan hoi "ấn vào đơn đang tồn 6... làm sao tôi biết 6 đơn này hiện ở đâu") -
// breakdown chi tiet cua "Đang tồn"/"Tồn đọng toàn hệ thống" (home-summary), moi dong la 1 trang thai
// cu the co the bam-nhay thang, GIONG HET LuongQuyTrinhStep nhung nguon so lieu la dinh nghia dangTon
// (rong hon canLam) thay vi "den luot xu ly".
export interface DangTonStep {
  key: string;
  label: string;
  count: number;
  roleKeys: string[];
  tab: string;
  filter: string;
  loaiDon?: string;
  nguoiNhanHang?: string;
  // Danh dau dong nao THAT SU nam trong tong canLam (subset cua dangTon) - xem giai thich o backend
  // DangTonStep (datMuaLinhKien.ts), dung o TrangChuTab.tsx lam nguon "Cần làm" thay the mySteps khi
  // luong-quy-trinh bi tat tren mobile.
  isCanLam?: boolean;
}
export interface JumpTarget {
  tab: string;
  filter: string;
  // Loc them theo "nguoi nhan hang" (KTV) khi nhay tu 1 dong trong tab "Bao cao" (phan hoi UX
  // 2026-08-15, dot nang cap tab rieng) - undefined = khong loc theo KTV.
  nguoiNhanHang?: string;
  // Them (migration 0002_tra_hang_pxk.sql) - dat truoc sub-tab loai_don cua tab "phieu-xuat-kho" khi
  // bam vao 1 trong 3 buoc PXK tra hang tren pipeline (man nay co 1 lop loc rieng "xemLoaiDon" khong
  // nam trong "filter").
  loaiDon?: string;
  // Mo thang Drawer chi tiet 1 dong (them 2026-08-26, tu danh sach thong bao KTV bam "xem chi tiet") -
  // chi co y nghia khi tab === "don-cua-toi", xem openDetailIdFor/DonCuaToiTab.initialDetailIdOverride.
  openDetailId?: string;
  // Them (phan hoi "bấm vào thẻ thì tab trên cùng lại không ở trạng thái đang lựa chọn") - StageMenu
  // (thanh "giai doan hoa" tren cung) chi to sang muc VUA duoc TU BAM qua chinh no (stageJump() trong
  // DatMuaLinhKienModule.tsx), khong biet gi ve cac jumpTo() khac (StatCard/pipeline/Bao cao...) nen
  // khi nhay tu noi khac toi DUNG 1 trang thai co mat trong StageMenu, muc do van khong sang - khop
  // key voi 1 muc trong stageMenuGroups (DatMuaLinhKienModule.tsx) de jumpTo() tu dong sang dung muc,
  // undefined = khong khop muc nao (StageMenu se tat het, khong giu sang muc CU tu lan bam truoc).
  stageKey?: string;
}
export interface BaoCaoRow {
  email: string;
  ten: string | null;
  slDon: number;
  slDonMua: number;
  slDonCongNo: number;
  slDonTraHang: number;
  slDeXuat: number;
  slTuChoi: number;
  slDangCho: number;
  slDuyet: number;
  slDuyetMua: number;
  slDuyetCongNo: number;
  slDuyetTraHang: number;
  slThucDuyet: number;
  tongTienThucTe: number;
  tongTienDatMua: number;
  tienChoDuyet: number;
  tongChoChuyen: number;
  tongPxk: number;
  slChoKeToan: number;
  slChoKhoGui: number;
  slDaGui: number;
  slDaXacNhan: number;
  slKhoKetThuc: number;
}

export interface DonHangDraft {
  ma_lk: string;
  loai_de_xuat: string;
  so_luong_de_xuat: number;
  // 6 truong bo sung 2026-08-14 (doi chieu Excel goc, xem migration 0070) - deu do nguoi tao dien
  // luc tao, khong sua duoc sau do. KHONG con ly_do_cham o day (chuyen sang TAC NGHIEP dien qua PATCH
  // /don-hang/:id khi dong ton qua 24h - xem PxkDetailModal). KHONG con so_tien_cong_no (chot
  // 2026-08-15: bo o nhap tay, thay bang "Gia de xuat uoc tinh" tu tinh tu gia_ban*so_luong,
  // xem cho render duoi).
  ghi_chu: string;
  yeu_cau_hoa_don: string;
  tt_mail_duyet: string;
  tt_khach_hang: string;
  chinh_sach: string;
  ma_yeu_cau_su_co: string;
  ma_lada: string;
  // Danh dau don uu tien (chot 2026-08-16, dot 3 gop y) - tich rieng TUNG dong, khong anh huong sap
  // xep, chi de hien thi/to mau noi bat.
  uu_tien: boolean;
  // Anh linh kien can tra (them 2026-08-24, migration 0003_tra_hang_anh.sql) - CHI y nghia khi
  // deriveLoaiDon(loai_de_xuat) === 'tra_hang' (bat buoc 1-3 anh, xem isLineComplete o
  // useTaoDonForm.ts). Da upload SAN len Drive qua POST /tra-hang/upload-anh (xem TraHangAnhPicker
  // trong SharedUi.tsx), chi con {driveFileId, url} de gui kem luc submit.
  anh: { driveFileId: string; url: string }[];
}

export interface XepHangLinhKienRow {
  ma_lk: string;
  so_lan: number;
}

// The doi chieu "Mã Lada liên quan" - khop ladaPreview() o backend/src/lib/ladaLookupClient.ts.
export interface MaLadaPreview {
  khach_hang: string | null;
  ky_thuat_vien: string | null;
  trang_thai: string | null;
  model: string | null;
  hang: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  ngay_khoi_tao: string | null;
  ngay_chot_don: string | null;
}

export interface MaYeuCauSuCoPreview {
  khach_hang: string | null;
  seri_san_pham: string | null;
  khu_vuc: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  hang: string | null;
  san_pham_bao_hanh: string | null;
  tien_do_hoan_thanh: string | null;
  ky_thuat_vien: string | null;
}

// Khop CaseLookupPreview day du (29 field) ben backend/src/lib/caseLookupClient.ts, dung cho man
// "Xem chi tiet case" (CaseDetailModal.tsx, them 2026-08-26) - khac MaYeuCauSuCoPreview o tren (chi 9
// field, dung cho o kiem tra nhanh luc tao don).
export interface CaseDetailData {
  ky_thuat_vien: string | null;
  khach_hang: string | null;
  seri_san_pham: string | null;
  khu_vuc: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  hang: string | null;
  san_pham_bao_hanh: string | null;
  tien_do_hoan_thanh: string | null;
  mo_ta_loi: string | null;
  nhom_san_pham: string | null;
  nhom_yeu_cau: string | null;
  loai_yeu_cau: string | null;
  hinh_thuc_bao_hanh: string | null;
  ngay_mua: string | null;
  thoi_gian_cskh_tiep_nhan: string | null;
  thoi_gian_hen_xu_ly: string | null;
  thoi_gian_hoan_thanh: string | null;
  doi_tac: string | null;
  link_crm: string | null;
  noi_dung_xu_ly: string | null;
  luu_y_loi_linh_kien: string | null;
  cach_thuc_xu_ly: string | null;
  nganh: string | null;
  loai_nganh: string | null;
  nhom_kh: string | null;
  dt_san_pham: number | null;
  dt_linh_kien: number | null;
  dt_dich_vu: number | null;
  ly_do_qua_han: string | null;
  ngay_import: string | null;
  ngay_cap_nhat_gan_nhat: string | null;
  dung_han: string | null;
  xu_ly_24h_bucket: string | null;
  ly_do_huy: string | null;
  link_hinh_anh: string[];
}

// Lich su giai trinh cham tre cua case (them 2026-09-11, khop CaseLookupGiaiTrinh o backend) - dung
// trong CaseDetailModal, KHONG lien quan giai trinh "ly do cham" cua don hang mua linh kien.
export interface CaseGiaiTrinh {
  case_id: string;
  ly_do_cham: string;
  noi_dung: string | null;
  ngay_giai_trinh: string;
}

// Muc tieu chung cho panel "can nhap truoc khi xac nhan" (tu choi CAN chon Ly do cham, huy CAN nhap
// ly do tu do - phan hoi UX muc 1, 2026-08-15) - dung chung cho PhieuDatDetailModal va
// DonCuaToiTab/PhieuDongBang. id = "bulk" khi ap dung cho ca tap `selected` dang chon.
// "duyet_tao_ho" (them 2026-08-24, muc 4) - CHI dung id 1 dong cu the (khong co "bulk"), xem
// isCongNoTaoHo o helpers.ts.
// "duyet_qua_han" (hang muc #17/#18, 2026-08-25): dong da qua han 24h "Cho TN duyet" - bam "Duyệt"
// phai chon 1 ly do (tai dung modal/danh sach ly do cua tu_choi/cho_hang) truoc khi thuc su duyet.
export type ActionTarget = { id: string | "bulk"; action: "tu_choi" | "cho_hang" | "huy" | "duyet_tao_ho" | "duyet_qua_han" };
