import type { Tone } from "../../components/x/Badge";

// Hang so/dictionary dung chung cho module "Dat mua linh kien" (tach tu DatMuaLinhKienModule.tsx
// khi chia nho file - UI redesign Phase 3, phan hoi Codex 2026-08-19).

// Chuan hoa thong bao loi cho nguoi dung (UI redesign phan hoi Codex 2026-08-19, muc P1 "chuan hoa
// error message") - truoc do 14 onError deu chi lam addToast("Loi: " + err.message), nhung
// ApiError.message (xem api/client.ts) CHINH LA MA LOI KY THUAT THO (vd "FORBIDDEN_ROLE",
// "MA_LK_NOT_FOUND") vi ApiError ke thua Error va set super(code ?? ...) - khong phai cau tieng
// Viet. Uu tien ApiError.detail (backend co the tra rieng field "message" giai thich, xem comment
// request() trong api/client.ts) truoc, roi tra cuu dictionary theo ma, cuoi cung moi fallback hien
// ma tho kem tien to giai thich (van giu ma de ho tro/debug doi chieu duoc).
export const GENERIC_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN_ROLE: "Bạn không có quyền thực hiện thao tác này",
  // Combo linh kien (lkSettings.ts /combo)
  THIEU_MA_COMBO: "Chưa nhập mã combo",
  MA_COMBO_QUA_DAI: "Mã combo quá dài (tối đa 200 ký tự)",
  THIEU_TEN_COMBO: "Chưa nhập tên combo",
  THIEU_THANH_PHAN: "Combo cần ít nhất 1 linh kiện thành phần",
  SO_LUONG_KHONG_HOP_LE: "Số lượng mỗi linh kiện phải là số nguyên lớn hơn 0",
  TRUNG_THANH_PHAN: "Có linh kiện bị chọn 2 lần trong combo",
  MA_COMBO_DA_CO: "Mã combo này đã tồn tại",
  MA_TRUNG_LINH_KIEN: "Mã combo trùng mã 1 linh kiện đang bật trong Bảng giá — chọn mã khác",
  XEM_NHU_CHI_DOC: "Đang xem như người dùng khác (chỉ xem) — thoát chế độ này để thao tác",
  MODULE_NOT_ALLOWED: "Tài khoản của bạn không có quyền truy cập module này",
  NOT_FOUND: "Không tìm thấy dữ liệu (có thể đã bị xoá hoặc thay đổi)",
  STATE_CHANGED: "Trạng thái vừa bị người khác thay đổi — tải lại trang và thử lại",
  DA_DONG: "Dòng này đã đóng, không thể xử lý tiếp",
  DONG_DA_DONG: "Dòng này đã đóng, không thể xử lý tiếp",
  THIEU_LK_KHO_DANG_XU_LY: "Kho đã tiếp nhận ticket thiếu hàng và đang xử lý — chờ Kho xác nhận hàng về hoặc từ chối rồi mới thay đổi được đơn",
  PHIEU_DA_DONG: "Phiếu này đã đóng, không thể xử lý tiếp",
  INVALID_STATE: "Trạng thái hiện tại không cho phép thao tác này",
  INVALID_SO_TIEN_THUC_NHAN: "Số tiền thực nhận phải là số nguyên lớn hơn 0",
  QUY_KHONG_DU: "Quỹ không đủ để trừ số tiền này",
  KHOAN_KHONG_SUA_DUOC: "Chỉ sửa được khoản đang ở trạng thái Đã duyệt",
  CHUA_CHUYEN_TIEN_KHONG_CHO_HANG: "Đơn chưa chuyển tiền nên không thể chuyển sang trạng thái chờ hàng",
  DON_CHUA_DUYET: "Phiếu còn đơn chưa được TN duyệt — bỏ các đơn này khỏi phiếu rồi mới gửi kế toán",
  DON_DANG_TRONG_PHIEU: "Đơn đang nằm trong phiếu — quỹ dư tự động trừ cho phiếu, không trả riêng từng đơn",
  DON_DA_DU_TIEN: "Đơn đã được thanh toán đủ",
  DON_KHONG_CAN_CHUYEN_TIEN: "Đơn này không cần chuyển tiền",
  DA_CO_MA_MISA: "Kế toán đã bổ sung mã MISA cho phiếu này — không bỏ đơn khỏi phiếu được nữa",
  DU_LIEU_VUA_DOI: "Tiền của phiếu vừa thay đổi — tải lại rồi thử lại",
  KHOAN_KHONG_HUY_DUOC: "Chỉ hủy được khoản đang ở trạng thái Đã duyệt",
  KHOAN_KHONG_PHAI_MOI_NHAT: "Phiếu đã có lần duyệt mới hơn — chỉ hủy được lần duyệt mới nhất",
  KTV_DANG_BAO_CHUYEN: "KTV đang báo chuyển lần mới cho phiếu này — duyệt hoặc từ chối lần đó trước",
  KHONG_DOI: "Số tiền không thay đổi",
  PXK_DA_QUA_BUOC_TAO_PHIEU: "Phiếu đã qua bước tạo phiếu (đã gửi Kế toán / đã xuất) — không thao tác được",
  DON_DA_DONG_KHONG_DOI_LUONG: "Đơn đã từ chối/hủy — không chuyển sang loại Trả hàng được",
  TRA_HANG_DA_XU_LY_KHONG_DOI_LUONG: "Đơn trả hàng đã được xử lý qua bước Kế toán — không chuyển về loại mua được",
  INVALID_SO_TIEN: "Số tiền không hợp lệ",
  INVALID_LOAI: "Loại điều chỉnh không hợp lệ",
  MISSING_LY_DO: "Cần nhập lý do",
  INVALID_TRANG_THAI: "Trạng thái đích không hợp lệ",
  INVALID_HANH_DONG: "Hành động không hợp lệ",
  INVALID_BODY: "Dữ liệu gửi lên không hợp lệ",
  INVALID_DON_HANG: "Thông tin dòng đơn hàng chưa đầy đủ hoặc không hợp lệ",
  INVALID_CONTENT_TYPE: "Định dạng file không hợp lệ",
  EMPTY_FILE: "File rỗng, vui lòng chọn file khác",
  MA_LK_NOT_FOUND: "Không tìm thấy mã linh kiện này trong danh mục",
  MISSING_DON_HANG: "Cần chọn ít nhất 1 dòng đơn hàng",
  MISSING_NGUOI_NHAN_HANG: "Cần chọn người nhận hàng",
  MISSING_LOAI_DON: "Cần chọn loại đơn",
  MISSING_MA_XUAT_KHO: "Cần nhập mã đơn hàng",
  MISSING_MA_MISA: "Cần nhập mã MISA",
  MISSING_SO_TIEN: "Cần nhập số tiền",
  MISSING_BANG_CHUNG: "Cần nhập bằng chứng chuyển tiền",
  QUA_SO_ANH_BANG_CHUNG: "Tối đa 5 ảnh bằng chứng cho 1 phiếu",
  MISSING_LY_DO_CHAM: "Cần chọn lý do chậm",
  MISSING_GHI_CHU: "Cần nhập ghi chú/lý do",
  MISSING_GIAI_TRINH: "Cần nhập giải trình",
  DUYET_TREN_DON_GOC: "Đơn gốc đã quá hạn duyệt 24h — hãy duyệt trên đơn gốc để chọn lý do chậm (ticket sẽ tự đóng theo)",
  MISSING_IDS: "Chưa chọn dòng nào để xử lý",
  MISSING_CASE_ID: "Thiếu mã case",
  MISSING_CHUYEN_TIEN_APPROVED: "Cần Tác nghiệp xác nhận chuyển tiền trước",
  QUA_NHIEU_ID: "Chọn quá nhiều dòng cùng lúc, vui lòng chia nhỏ đợt xử lý",
  THIEU_CHINH_SACH_HOAC_MA_YCSC: "Thiếu Chính sách hoặc Mã ID liên quan (Mã YCSC / Mã Lada)",
  THIEU_MA_YCSC: "Cần nhập Mã YCSC hoặc Mã Lada liên quan",
  THIEU_LY_DO_HUY: "Cần nhập lý do huỷ",
  THIEU_LY_DO_CHAM: "Cần chọn lý do chậm",
  LY_DO_CHAM_KHONG_HOP_LE: "Lý do chậm không hợp lệ",
  NGUOI_NHAN_HANG_KHONG_HOP_LE: "Người nhận hàng không hợp lệ",
  NGUOI_NHAN_HANG_NGOAI_PHAM_VI: "Người nhận hàng này không thuộc phạm vi quản lý của bạn",
  NGOAI_PHAM_VI_GS: "KTV này không thuộc quyền phụ trách của bạn",
  VE_TINH_CHUA_GAN_TRAM: "Vệ tinh này chưa được gán Trạm phụ trách",
  NGUOI_NHAN_HANG_DA_TAT: "Tài khoản người nhận hàng (hoặc Trạm nhận thay) đang bị tắt",
  DON_HANG_KHONG_HOP_LE: "Một số dòng đơn hàng đã chọn không còn hợp lệ (đã bị đổi hoặc gán nơi khác)",
  MA_XUAT_KHO_DA_TON_TAI: "Mã đơn hàng này đã được dùng cho phiếu khác",
  MA_XUAT_KHO_CHUA_XAC_NHAN: "Cần nhập và xác nhận mã đơn hàng trước",
  CASE_NOT_FOUND: "Không tìm thấy case này",
  DA_CO_CA_THIEU_LK_DANG_MO: "Đã có ca thiếu linh kiện đang mở cho dòng này",
  USE_TRA_HANG_ROUTE: "Dòng trả hàng xử lý ở tab Trả hàng riêng",
  // Anh tra hang (them 2026-08-24, migration 0003_tra_hang_anh.sql).
  THIEU_ANH_TRA_HANG: "Cần 1-3 ảnh linh kiện cần trả",
  MISSING_ANH_QC: "Cần tải ít nhất 1 ảnh bằng chứng trước khi từ chối",
  QUA_NHIEU_ANH: "Đã đủ tối đa 3 ảnh",
};

// Ma loi tra ve tu applyDonHangLog (backend/src/routes/datMuaLinhKien.ts) khi 1 dong trong bulk-log
// khong hop le - dung de phan biet voi cac nextTrangThai hop le ("TN da duyet", "Cho TN duyet"...).
export const BULK_LOG_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "không tìm thấy dòng đơn hàng",
  DONG_DA_DONG: "dòng đã đóng",
  THIEU_LK_KHO_DANG_XU_LY: "Kho đang xử lý ticket thiếu hàng",
  FORBIDDEN_ROLE: "không đủ quyền xử lý",
  INVALID_STATE: "sai trạng thái hiện tại",
  USE_TRA_HANG_ROUTE: "dòng trả hàng dùng tab riêng",
  MISSING_LY_DO_CHAM: "thiếu lý do chậm",
  LY_DO_CHAM_KHONG_HOP_LE: "lý do chậm không hợp lệ",
  DA_CO_CA_THIEU_LK_DANG_MO: "đã có ca thiếu linh kiện đang mở cho dòng này",
  STATE_CHANGED: "trạng thái vừa bị người khác thay đổi, tải lại và thử lại",
  // 2 ma nay thuc te chi xay ra khi request khong den tu UI binh thuong (UI da chan truoc ca 2 truong
  // hop o phia client) - them vao day chi de PHONG THU: neu thieu, ma loi se KHONG khop bat ky key
  // nao trong dictionary nay, khien dong that bai bi dem NHAM thanh thanh cong trong toast bulk-log
  // (phat hien khi ra soat QA 2026-08-19, so sanh voi applyDonHangLog o backend).
  THIEU_LY_DO_HUY: "thiếu lý do huỷ",
  INVALID_HANH_DONG: "hành động không hợp lệ ở trạng thái hiện tại",
};

// Ma loi tra ve tu applyTraHangLog (backend/src/routes/traHang.ts) khi 1 dong trong bulk-log khong
// hop le - dung de phan biet voi cac nextTrangThai hop le.
export const TRA_HANG_BULK_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "không tìm thấy dòng trả hàng",
  DA_DONG: "dòng đã đóng",
  FORBIDDEN_ROLE: "không đủ quyền xử lý",
  INVALID_STATE: "sai trạng thái hiện tại",
  // CHOT (ra soat module #13): dong dang "Cho TN duyet tong" tu choi bat buoc ghi_chu - dong nay
  // KHONG the xu ly qua "Tu choi tat ca" hang loat (khong nhap duoc ghi_chu rieng tung dong), phai
  // mo tung dong de nhap ly do that su.
  MISSING_GHI_CHU: "cần nhập lý do khi từ chối bước TN duyệt tổng — mở từng dòng để nhập",
  // Them 2026-08-24 (migration 0003_tra_hang_anh.sql) - QC tu choi hang loat se that bai o dong nao
  // chua co san anh bang chung (phai tai anh + tu choi tung dong rieng, khong the qua bulk).
  MISSING_ANH_QC: "cần ảnh bằng chứng — mở từng dòng để tải ảnh rồi từ chối",
  // Han 24h tung giai doan (2026-10-01) - TraHangTab bat ma nay, hoi ly do cham 1 lan cho ca nhom roi gui lai.
  MISSING_LY_DO_CHAM: "quá hạn 24h — cần chọn lý do chậm",
  LY_DO_CHAM_KHONG_HOP_LE: "lý do chậm không hợp lệ",
  // Phat hien khi ra soat QA 2026-08-19: THIEU key nay khien 1 dong that bai do 2 nguoi cung xu ly
  // dong thoi (optimistic-concurrency, xem applyTraHangLog o backend) bi dem NHAM thanh thanh cong
  // trong toast bulk-log - day la truong hop THUC SU xay ra trong dung thao tac binh thuong (khong
  // can request bat thuong), khac 2 ma o BULK_LOG_ERROR_MESSAGES ben tren.
  STATE_CHANGED: "trạng thái vừa bị người khác thay đổi, tải lại và thử lại",
};

// Trang thai cua 1 DONG don hang (dat_don_hang_log) - khong con o cap phieu.
// DOI SANG HE MAU UI_SPEC.md §1.2 (port giao dien "Dat hang linh kien 3T", 2026-09-10) - truoc day
// tung co giai doan gan 7 tone rieng biet cho 7 trang thai (phan hoi 2026-09-05 "mỗi trạng thái 1 màu
// để dễ phân biệt"), nhung UI_SPEC chi dinh nghia 6 tone ngu nghia (info/success/warning/danger/
// purple/neutral) va DA GOI DICH DANH "Chờ Trạm duyệt" = success (xanh la) - chap nhan "Cho Tram
// duyet" va "TN da duyet" cung mau success (ca 2 deu thuoc nhom "duyet/hoan thanh"), phan biet bang
// CHU trong badge (dung nguyen tac accessibility cua chinh UI_SPEC §6: "trạng thái không chỉ dựa
// màu"), khong tu y them tone thu 7 ngoai spec.
export const DON_HANG_TRANG_THAI_TONE: Record<string, Tone> = {
  "Cho Tram duyet": "success",
  "Cho TBP xac nhan": "warning",
  "Cho TN duyet": "info",
  "TN da duyet": "success",
  "TN tu choi": "danger",
  "Cho hang": "warning",
  "Da huy": "neutral",
};

// Phan hoi UX muc 2 (2026-08-15): to mau/gach ngang TEN LINH KIEN theo trang thai dong don hang -
// chi ap dung len phan ten (khong toan hang, tranh roi mat), StatusBadge canh ben van la diem neo
// chinh. DOI SANG token UI_SPEC (--color-danger/--color-warning/--color-text-secondary/--color-
// success), khop dung DON_HANG_TRANG_THAI_TONE o tren (2026-09-10).
export const DON_HANG_ROW_STYLE: Record<string, string> = {
  "Da huy": "line-through text-[var(--color-text-secondary)]",
  "TN tu choi": "line-through text-[var(--color-danger)]",
  "Cho Tram duyet": "text-[var(--color-success)]",
  "Cho TBP xac nhan": "text-[var(--color-warning-strong)]",
  "Cho TN duyet": "text-[var(--color-info)]",
  "Cho hang": "text-[var(--color-warning-strong)] font-medium",
  "TN da duyet": "text-[var(--color-success)]",
};

// UI_SPEC §1.2: "Chờ kho"/"Chờ QC"/"Đang xử lý" -> info, cac buoc "cho ke toan xu ly/chot" -> warning
// (cung nhom voi "Chờ kế toán duyệt mềm" cua Tra hang), buoc hoan thanh/da nhan -> success, huy -> neutral.
export const PXK_TRANG_THAI_TONE: Record<string, Tone> = {
  "Dang tao phieu": "info",
  "Cho ke toan": "warning",
  "Da chot xong don xuat": "warning",
  "Dang gui KTV": "warning",
  "KTV da nhan": "success",
  "Ke toan huy": "neutral",
  "Hang tru kho": "success",
  "Kho da ket thuc": "success",
  // Them (migration 0002_tra_hang_pxk.sql) - buoc CUOI rieng cho PXK loai_don='tra_hang' (Kho xac
  // nhan da nhan hang VE kho), xem giai thich o phieuXuatKho.ts.
  "Kho da nhan hang tra": "success",
};

// Cac trang_thai LOG-ONLY moi (migration 0028, phan hoi nguoi dung 2026-09-13 "log đang bị trùng tên
// của các giai đoạn") - KHONG phai gia tri trang_thai_hien_tai THAT cua PXK (chi xuat hien trong
// phieu_xuat_kho_log de phan biet cac sub-action xay ra TRONG CUNG 1 giai doan chinh, vd "Dang tao
// phieu"/"Cho ke toan") - CO Y khong dua vao PXK_TRANG_THAI_OPTIONS/PXK_TRANG_THAI_TONE o duoi (se lam
// sai danh sach loc trang thai chinh cua TrangThaiDropdownFilter) - chi dung rieng cho nhan/mau cham
// tron Timeline "Lịch sử xử lý" (xem PhieuXuatKhoTab.tsx).
export const PXK_LOG_ONLY_OPTIONS = [
  { value: "Da luu ma don hang", label: "Đã lưu mã đơn hàng" },
  { value: "Da luu ma MISA", label: "Đã lưu Mã MISA" },
  { value: "Da tai anh bien ban", label: "Đã tải ảnh biên bản" },
  { value: "Da yeu cau KTV chuyen tien", label: "Yêu cầu KTV chuyển tiền" },
  { value: "Da dinh bang chung chuyen tien", label: "Đã đính bằng chứng chuyển tiền" },
  { value: "Ke toan da duyet bang chung chuyen tien", label: "Kế toán đã duyệt bằng chứng chuyển tiền" },
  { value: "Ke toan tu choi bang chung chuyen tien", label: "Kế toán từ chối bằng chứng chuyển tiền" },
  { value: "Tru quy du", label: "Trừ quỹ dư" },
  { value: "Hoan tien ve quy", label: "Hoàn tiền về quỹ" },
  { value: "Ke toan sua tien thuc nhan", label: "Kế toán sửa tiền thực nhận" },
  { value: "Ke toan huy duyet chuyen tien", label: "Kế toán hủy duyệt chuyển tiền" },
  { value: "Da sua tong tien can chuyen", label: "Đã sửa tổng tiền cần chuyển" },
  { value: "Da them don vao phieu", label: "Đã thêm đơn vào phiếu" },
  { value: "Da xoa don khoi phieu", label: "Đã xoá đơn khỏi phiếu" },
  { value: "Da chuyen kho xuat", label: "Đã chuyển kho xuất" },
  { value: "Da chuyen khu vuc", label: "Kho chuyển khu vực" },
];
export const PXK_LOG_ONLY_TONE: Record<string, Tone> = {
  "Da luu ma don hang": "info",
  "Da luu ma MISA": "info",
  "Da tai anh bien ban": "info",
  "Da yeu cau KTV chuyen tien": "warning",
  "Da dinh bang chung chuyen tien": "info",
  "Ke toan da duyet bang chung chuyen tien": "success",
  "Ke toan tu choi bang chung chuyen tien": "danger",
  "Tru quy du": "success",
  "Hoan tien ve quy": "info",
  "Ke toan sua tien thuc nhan": "warning",
  "Ke toan huy duyet chuyen tien": "danger",
  "Da sua tong tien can chuyen": "info",
  "Da them don vao phieu": "info",
  "Da xoa don khoi phieu": "info",
  "Da chuyen kho xuat": "purple",
  "Da chuyen khu vuc": "purple",
};

// Kho xuat theo mien cua PXK (migration 0070, backend lib/mienXuat.ts).
export type MienXuat = "bac" | "nam";
export const MIEN_XUAT_LABEL: Record<MienXuat, string> = { bac: "Miền Bắc", nam: "Miền Nam" };
export const MIEN_XUAT_NGAN: Record<MienXuat, string> = { bac: "MB", nam: "MN" };

export const CHUYEN_TIEN_TONE: Record<string, Tone> = {
  "Cho KTV chuyen": "warning",
  "KTV da chuyen": "info",
  "TN da duyet": "success",
};
// 2 trang thai SUY RA tren TUNG DON tu phieu xuat kho chua don (2026-09-29) - backend tra MA (lib/trangThaiDonPxk.ts,
// cot trang_thai_pxk / thanh_toan cua GET /dat-mua-lk/don-hang), them/doi ma phai sua ca 2 noi.
export const TRANG_THAI_PXK_DON_OPTIONS = [
  { value: "cho_tao_phieu", label: "Chờ tạo phiếu" },
  { value: "cho_ktv_chuyen_tien", label: "Chờ KTV chuyển tiền" },
  { value: "cho_xac_nhan_chuyen_tien", label: "Chờ xác nhận chuyển tiền" },
  { value: "cho_gui_ke_toan", label: "Chờ TN gửi kế toán" },
  { value: "cho_ke_toan_chot", label: "Chờ kế toán chốt" },
  { value: "cho_kho_gui_hang", label: "Chờ kho gửi hàng" },
  { value: "cho_kho_nhan_hang_tra", label: "Chờ kho nhận hàng trả" },
  { value: "cho_ktv_xac_nhan", label: "Chờ KTV xác nhận" },
  { value: "ktv_da_nhan", label: "KTV đã nhận" },
  { value: "hang_tru_kho", label: "Hàng trừ kho" },
  { value: "kho_da_ket_thuc", label: "Kho đã kết thúc" },
  { value: "kho_da_nhan_hang_tra", label: "Kho đã nhận hàng trả" },
  { value: "phieu_da_huy", label: "Phiếu đã hủy" },
  { value: "", label: "—" },
];
export const TRANG_THAI_PXK_DON_TONE: Record<string, Tone> = {
  cho_tao_phieu: "info",
  cho_ktv_chuyen_tien: "warning",
  cho_xac_nhan_chuyen_tien: "warning",
  cho_gui_ke_toan: "info",
  cho_ke_toan_chot: "warning",
  cho_kho_gui_hang: "warning",
  cho_kho_nhan_hang_tra: "warning",
  cho_ktv_xac_nhan: "warning",
  ktv_da_nhan: "success",
  hang_tru_kho: "success",
  kho_da_ket_thuc: "success",
  kho_da_nhan_hang_tra: "success",
  phieu_da_huy: "neutral",
};
export const THANH_TOAN_DON_OPTIONS = [
  { value: "khong_can", label: "Không cần chuyển" },
  { value: "cho_thanh_toan", label: "Chờ thanh toán" },
  { value: "cho_xac_nhan", label: "Chờ xác nhận tiền" },
  { value: "da_thanh_toan", label: "Đã thanh toán" },
  { value: "da_huy_bo", label: "Đã hủy bỏ" },
];
export const THANH_TOAN_DON_TONE: Record<string, Tone> = {
  khong_can: "neutral",
  cho_thanh_toan: "warning",
  cho_xac_nhan: "info",
  da_thanh_toan: "success",
  da_huy_bo: "neutral",
};

export const CHUYEN_TIEN_OPTIONS = [
  { value: "Cho KTV chuyen", label: "Chờ KTV chuyển" },
  { value: "KTV da chuyen", label: "KTV đã chuyển" },
  // Nhan hien thi doi tu "TN đã duyệt" -> "Kế toán đã duyệt" (phan hoi 04/09/2026: buoc duyet cuoi
  // chuyen tu TN sang Ke toan) - GIU NGUYEN gia tri "TN da duyet" (khop dung CHECK constraint DB).
  { value: "TN da duyet", label: "Kế toán đã duyệt" },
];

// SUA (migration 0002_tra_hang_pxk.sql, phan hoi "thiếu bước Tác nghiệp nhặt linh kiện vào PXK"):
// 2 buoc "nhap kho" cu ("Cho ke toan xac nhan nhap kho"/"Cho kho xac nhan nhap kho") bi xoa - dong
// dat_don_hang dung o "TN da duyet" (giong het "TN da duyet" cua mua/cong_no), TN sang tao PXK that
// (loai_don='tra_hang', xem PhieuXuatKhoTab.tsx) de di tiep phan con lai.
// Khop dung UI_SPEC §1.2 (spec neu ten tung trang thai nay lam vi du): "Chờ kế toán duyệt mềm" ->
// warning, "Chờ kho"/"Chờ QC"/"Chờ TN duyệt" -> info, hoan thanh -> success, tu choi -> danger, huy ->
// neutral.
export const TRA_HANG_TRANG_THAI_TONE: Record<string, Tone> = {
  "Cho ke toan duyet mem": "warning",
  "Cho kho xac nhan": "info",
  "Cho QC xac nhan": "info",
  "Cho TN duyet tong": "info",
  "TN da duyet": "success",
  "Tu choi": "danger",
  "Da huy": "neutral",
};

// CHOT vong 7 (2026-08-17): dong dat_don_hang loai_don='tra_hang' gio hien chung trong "Don cua
// toi/Danh sach" (truoc chi xem duoc qua tab rieng "Don tra hang" da bo, hoac luong quy trinh) - can
// map ca 2 bo trang thai (dat_don_hang_log + tra_hang_log) vao 1 tones dung chung cho StatusBadge.
export const DON_HANG_TRANG_THAI_TONE_ALL: Record<string, Tone> = { ...DON_HANG_TRANG_THAI_TONE, ...TRA_HANG_TRANG_THAI_TONE };

export const THIEU_LK_TRANG_THAI_TONE: Record<string, Tone> = {
  "Cho kho xu ly": "info",
  "Kho da tiep nhan": "info",
  "Kho da cap nhat": "info",
  "Kho xac nhan hang da ve": "success",
  "Kho tu choi sai TT": "danger",
  "Da huy bo": "neutral",
  "Da ket thuc": "success",
};

// Mau cham tron nho cho lich su xu ly (DonHangDetailModal, CHOT ra soat module #18) - dung dung
// bang mau UI_SPEC (Tone), khong them token mau moi.
export const TRANG_THAI_DOT_TONE: Record<Tone, string> = {
  info: "bg-[var(--color-info)]",
  success: "bg-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]",
  danger: "bg-[var(--color-danger)]",
  purple: "bg-[var(--color-purple)]",
  neutral: "bg-[var(--color-text-secondary)]",
};


// Nhan rut gon KHONG con so thu tu (CHOT 2026-08-17 vong 4: "Bỏ ký tự B1. B2, B3 đi" - da thu qua ky
// hieu "B{n}." o vong 2 nhung chu he thong thay thua).
// CHOT (ra soat module "Dat Mua Linh Kien 2.0" #16): 6 nhan "tra_hang_*" deu doi sang tien to
// "Trả·" (dau cham giua, khong phai khoang trang) - truoc day "Trả KT"/"Trả Kho"/"Trả TN" doc len
// gan nhu trung voi cac nhan bare "KT"/"Kho"/"TN" cua luong PXK/tac nghiep khi luot nhanh qua thanh
// cuon ngang; dau "·" bien moi nhan thanh 1 TU GHEP rieng biet thay vi 2 tu roi de nham voi nhan bare.
export const STEP_SHORT_LABEL: Record<string, string> = {
  tram: "Trạm",
  tp_dvbh: "TBP",
  tra_hang_kt: "Trả·KT",
  tra_hang_kho: "Trả·Kho",
  tra_hang_qc: "Trả·QC",
  tra_hang_tn: "Trả·TN",
  tra_hang_tao_pxk: "Trả·PXK",
  tra_hang_pxk_kt: "Trả·PXK KT",
  tra_hang_pxk_kho: "Trả·PXK Kho",
  tac_nghiep: "TN",
  cho_hang: "Chờ hàng",
  thieu_lk: "Thiếu LK",
  cho_tien: "Chờ tiền",
  tao_pxk: "PXK",
  ke_toan: "KT",
  kho: "Kho",
  ktv: "KTV",
};

// Mo ta chi tiet cho tooltip (CHOT vong 7: "hiện tooltip giải thích về số lượng đơn đang chờ là đơn
// gì? để người dùng hiểu được việc mình cần làm") - thay the viec chi hien LAI ten day du (khong giai
// thich them) bang 1 cau mo ta ro dung "the mid nao" va "can lam gi", khop dung dinh nghia da chot voi
// chu he thong luc thiet ke backend GET /dat-mua-lk/luong-quy-trinh. Van dung thuoc tinh title (native
// tooltip) - KHONG tu ve tooltip vi nam trong container overflow-x-auto, de bi cat mep khi cuon ngang.
export const STEP_DESCRIPTION: Record<string, string> = {
  tram: "Đơn đang chờ Trạm duyệt trước khi chuyển lên cấp tiếp theo.",
  tp_dvbh: "Đơn linh kiện đặc thù đang chờ TBP DVBH xác nhận.",
  tra_hang_kt: "Đơn trả hàng đang chờ Kế toán duyệt mềm.",
  tra_hang_kho: "Đơn trả hàng đang chờ Kho xác nhận.",
  tra_hang_qc: "Đơn trả hàng đang chờ QC xác nhận.",
  tra_hang_tn: "Đơn trả hàng đang chờ TN duyệt tổng.",
  tra_hang_tao_pxk: "Tác nghiệp đã duyệt tổng, đang gom vào phiếu xuất kho trả hàng nhưng chưa gửi Kế toán.",
  tra_hang_pxk_kt: "Phiếu xuất kho trả hàng đang chờ Kế toán xác nhận đúng đơn.",
  tra_hang_pxk_kho: "Phiếu xuất kho trả hàng đã chốt, đang chờ Kho xác nhận đã nhận hàng trả về kho.",
  tac_nghiep: "Đơn mua hàng/công nợ đang chờ Tác nghiệp duyệt.",
  cho_hang: "Đơn đã duyệt nhưng đang chờ hàng về kho.",
  thieu_lk: "Ticket báo thiếu linh kiện đang chờ Kho xử lý.",
  cho_tien: "Phiếu xuất kho có tiền cần chuyển nhưng chưa được xác nhận đã chuyển.",
  tao_pxk: "Phiếu xuất kho đã tạo nhưng chưa gửi Kế toán.",
  ke_toan: "Phiếu xuất kho đang chờ Kế toán chốt đơn xuất.",
  kho: "Phiếu xuất kho đã chốt, đang chờ Kho gửi hàng.",
  ktv: "Phiếu xuất kho đang chờ KTV xác nhận đã nhận hàng.",
};

// Danh sach option trang thai dung CHUNG cho TrangThaiDropdownFilter (hien thi) VA ActiveFiltersBar (chip
// "Dang loc" - tra cuu label dep tu gia tri raw dang luu trong filterTrangThai, xem trangThaiLabel).
// SUA (kiem thu qua dev-login local 2026-08-19): truoc day 4 noi goi ActiveFiltersBar hien THANG gia
// tri raw filterTrangThai (vd "Cho kho xu ly" khong dau) lam nhan chip thay vi nhan dep co dau - phat
// hien khi test qua localhost:5173 that (khong phai chi doc code).
export const DON_CUA_TOI_TRANG_THAI_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  // Sentinel "con ton" (them 2026-08-27, phan hoi UI mobile "mặc định lọc các đơn còn tồn") - khop
  // dung GET /don-hang?trang_thai=__OPEN__ (loc NOT IN tap trang thai "dong", xem
  // DON_HANG_TRANG_THAI_DONG trong datMuaLinhKien.ts). Dat SAU "Tất cả" nhung la GIA TRI MAC DINH
  // thuc te (xem savedFilterTrangThai trong DonCuaToiTab.tsx).
  { value: "__OPEN__", label: "Còn tồn" },
  // Sentinel "duyet trong ngay" (them 2026-09-11, muc menu "StageMenu" giai doan hoa) - khop dung GET
  // /don-hang?trang_thai=__TODAY__ (loc theo ddh.updated_at = ngay VN hom nay).
  { value: "__TODAY__", label: "Duyệt trong ngày" },
  { value: "Cho Tram duyet", label: "Chờ Trạm duyệt" },
  { value: "Cho TBP xac nhan", label: "Chờ TBP DVBH xác nhận" },
  { value: "Cho TN duyet", label: "Chờ TN duyệt" },
  { value: "TN da duyet", label: "TN đã duyệt" },
  // Sentinel "Đơn chờ tạo xuất" (them 2026-09-11, muc menu StageMenu) - khac "TN da duyet" o tren (gom
  // CA dong da gan PXK) - sentinel nay CHI dong chua gan PXK nao (ma_xuat_kho IS NULL), xem GET
  // /don-hang?trang_thai=__CHO_TAO_PXK__.
  { value: "__CHO_TAO_PXK__", label: "Chờ tạo phiếu xuất" },
  { value: "TN tu choi", label: "TN từ chối" },
  // Sentinel the "Đơn bị từ chối" o Trang chu (2026-10-01) - don minh tao bi tu choi, chua mo xem (GET /don-hang).
  { value: "__TU_CHOI_CHUA_XEM__", label: "Bị từ chối – chưa xem" },
  { value: "Cho hang", label: "Chờ hàng" },
  { value: "Da huy", label: "Đã hủy" },
];
export const PXK_TRANG_THAI_OPTIONS = [
  { value: "", label: "Tất cả" },
  // Sentinel "con ton" (them 2026-09-23, phan hoi "tổng phiếu = tổng phiếu đang tồn... ấn vào tổng
  // phiếu sẽ có sẵn filter, ấn tắt sẽ hiện cả phiếu huỷ") - khop dung GET /phieu-xuat-kho?trang_thai=
  // __OPEN__ (loc NOT IN 5 trang thai dong TRANG_THAI_DONG), cung 1 pattern voi __OPEN__ cua
  // DON_CUA_TOI_TRANG_THAI_OPTIONS/TRA_HANG_TRANG_THAI_OPTIONS o duoi. La GIA TRI MAC DINH cua "Tổng
  // phiếu xuất" (xem DatMuaLinhKienModule.tsx) nhung nguoi dung tu chon lai "Tất cả" tren dropdown de
  // xem CA phieu da huy/hoan tat - khong phai gioi han cung nhu View.
  { value: "__OPEN__", label: "Còn tồn" },
  // Sentinel rieng (them 2026-08-24, xem GET /phieu-xuat-kho trong routes/phieuXuatKho.ts) - "Chờ
  // tiền" la 1 DIEU KIEN CHAN (so_tien_can_chuyen/trang_thai_chuyen_tien), khong phai gia tri
  // trang_thai_hien_tai that nen KHONG xuat hien trong StatusBadge cua tung dong (PXK_TRANG_THAI_TONE
  // khong co key nay) - chi dung o day de lam 1 CHIP LOC rieng biet voi "Đang tạo phiếu".
  { value: "CHO_TIEN", label: "Chờ chuyển tiền" },
  { value: "Dang tao phieu", label: "Đang tạo phiếu" },
  { value: "Cho ke toan", label: "Chờ kế toán" },
  { value: "Da chot xong don xuat", label: "Đã chốt xong đơn xuất" },
  // 2 sentinel cua menu "Đã chốt xong đơn xuất" (chi phieu CHUA in) / "Phiếu đã in" (2026-09-29, xem DA_IN_COND o
  // backend/src/routes/phieuXuatKho.ts) - khong phai trang_thai_hien_tai that, chi lam chip loc.
  { value: "CHOT_CHUA_IN", label: "Đã chốt xong - chưa in" },
  { value: "DA_IN", label: "Phiếu đã in" },
  { value: "Dang gui KTV", label: "Đang gửi KTV" },
  { value: "KTV da nhan", label: "KTV đã nhận" },
  // SUA (phan hoi 2026-09-22 "TN hủy phiếu nhưng đang hiện là kế toán hủy"): nhan HIEN THI doi thanh
  // trung tinh vai tro - gia tri enum DB "Ke toan huy" giu nguyen (dat ten tu thoi chi co 1 nut, truoc
  // khi tach 2 ly do huy cho phep CA TN lan Ke toan kich hoat, xem phieuXuatKho.ts POST /:id/log).
  { value: "Ke toan huy", label: "Đã huỷ" },
  { value: "Hang tru kho", label: "Hàng trừ kho" },
  { value: "Kho da ket thuc", label: "Kho đã kết thúc" },
  { value: "Kho da nhan hang tra", label: "Kho đã nhận hàng trả" },
];
// QA 2026-08-19: THIEU truoc day 2 trang thai "Kho tu choi sai TT"/"Da huy bo" - deu la trang thai
// HOP LE thuc su dat toi duoc (xem validNext o backend/src/routes/datMuaLinhKien.ts), nhung khong co
// trong danh sach loc nen nguoi dung khong the loc rieng cac ve da bi kho tu choi/huy bo, phai tu doc
// qua "Tat ca" - khac voi moi tab khac deu co day du option loc cho trang thai "huy/tu choi" cua no.
export const THIEU_LK_TRANG_THAI_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "Cho kho xu ly", label: "Chờ kho xử lý" },
  { value: "Kho da tiep nhan", label: "Kho đã tiếp nhận" },
  { value: "Kho da cap nhat", label: "Kho đã cập nhật" },
  { value: "Kho xac nhan hang da ve", label: "Hàng đã về" },
  { value: "Kho tu choi sai TT", label: "Kho từ chối (sai TT)" },
  { value: "Da huy bo", label: "Đã huỷ bỏ" },
  // Gia tri DB giu "Da ket thuc", nhan doi thanh "TN đã duyệt" (2026-09-29): ticket dong khi TN duyet don goc.
  { value: "Da ket thuc", label: "TN đã duyệt" },
];
export const TRA_HANG_TRANG_THAI_OPTIONS = [
  { value: "", label: "Tất cả" },
  // Sentinel "con ton" (them 2026-08-27) - xem giai thich o DON_CUA_TOI_TRANG_THAI_OPTIONS, backend
  // tu doi sang dung TRA_HANG_TRANG_THAI_DONG_COUNTS khi loai_don=tra_hang.
  { value: "__OPEN__", label: "Còn tồn" },
  // Sentinel muc "Hàng trả" (2026-09-30) - 3 buoc Ke toan/Kho/QC (backend traHang.ts GET /).
  { value: "__CHO_XAC_NHAN__", label: "Chờ xác nhận (KT/Kho/QC)" },
  { value: "Cho ke toan duyet mem", label: "Chờ kế toán duyệt mềm" },
  { value: "Cho kho xac nhan", label: "Chờ kho xác nhận" },
  { value: "Cho QC xac nhan", label: "Chờ QC xác nhận" },
  { value: "Cho TN duyet tong", label: "Chờ TN duyệt tổng" },
  { value: "TN da duyet", label: "TN đã duyệt (chờ tạo PXK)" },
  { value: "Tu choi", label: "Từ chối" },
  { value: "Da huy", label: "Đã huỷ" },
];
// Dung chung cho StatusBadge cua DonCuaToiTab (hien CA dong mua/cong_no LAN tra_hang trong 1 danh
// sach - xem DON_HANG_TRANG_THAI_TONE_ALL o tren) - can 1 danh sach { value, label } gop ca 2 nguon
// de dich dung nhan cho MOI dong, bat ke loai_don.
export const DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL = [...DON_CUA_TOI_TRANG_THAI_OPTIONS, ...TRA_HANG_TRANG_THAI_OPTIONS];
// Bo loc trang thai khi xem GOP CA 3 loai don (StageMenu "Tổng đơn hàng", loai_don=all) - hop 2 bo
// tren, bo trung gia tri (giu nhan xuat hien truoc: "Tất cả trạng thái", "Còn tồn", "TN đã duyệt"...).
export const TAT_CA_LOAI_TRANG_THAI_OPTIONS = [
  ...DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL.filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i),
  // Sentinel muc "Chờ tác nghiệp" (2026-09-30) - "Cho TN duyet" + tra hang "Cho TN duyet tong" (backend donHangListWhere).
  { value: "__CHO_TN__", label: "Chờ tác nghiệp (gồm hàng trả)" },
];

export const PIPELINE_NOTCH = 10;
// Thu nho tu 80 (phan hoi 2026-08-19: "mặc định bị thu nhỏ, giảm kích thước để luôn mở không tràn
// dòng") - giam chieu rong moi buoc de thanh pipeline day du (khong collapsed) it can cuon ngang hon,
// danh doi bang nhan/so co the xuong 2 dong o cac nhan dai (vd "Trả·Kho NK") - da co san whitespace
// wrap (xem PipelineFlow.tsx vong 7), khong vo bo cuc.
export const PIPELINE_SEG_WIDTH = 64;

export const PXK_MINI_STEPS = ["Dang tao phieu", "Cho ke toan", "Da chot xong don xuat", "Dang gui KTV", "KTV da nhan"] as const;
export const PXK_MINI_LABEL: Record<string, string> = {
  "Dang tao phieu": "Tạo phiếu",
  "Cho ke toan": "Kế toán",
  "Da chot xong don xuat": "Chốt xong",
  "Dang gui KTV": "Gửi KTV",
  "KTV da nhan": "KTV nhận",
};
export const PXK_MINI_NHANH_RE = new Set(["Ke toan huy", "Hang tru kho", "Kho da ket thuc"]);

// YEU_CAU_HOA_DON_OPTIONS/CHINH_SACH_OPTIONS: gia tri co dinh theo sheet "Settings" file Excel goc
// (khong doi duoc qua Settings module - khac loai_de_xuat, danh sach nay it thay doi va gan chat voi
// logic nghiep vu chinh_sach/yeu_cau_hoa_don, khong can quan ly dong nhu loai_de_xuat).
export const YEU_CAU_HOA_DON_OPTIONS = ["Không", "Yêu cầu hóa đơn (KTV không thu phí dịch vụ)", "Yêu cầu hóa đơn (KTV có thu phí dịch vụ)", "Yêu cầu hóa đơn (xuất cho Trạm)"];
export const CHINH_SACH_OPTIONS = ["Trong CSBH", "Ngoài CSBH"];
// Nhan rut gon cho 3 nut tich chon YCHD (dot 3 gop y #4) - gia tri luu DB VAN la chuoi day du o
// YEU_CAU_HOA_DON_OPTIONS, chi doi nhan HIEN THI cho gon.
export const YEU_CAU_HOA_DON_SHORT_LABELS: Record<string, string> = {
  "Không": "Không",
  "Yêu cầu hóa đơn (KTV không thu phí dịch vụ)": "HĐ - Không thu phí",
  "Yêu cầu hóa đơn (KTV có thu phí dịch vụ)": "HĐ - Có thu phí",
  // 2026-09-30: HD xuat cho Tram - VAN tinh chiet khau binh thuong (coYeuCauHoaDon() tra false).
  "Yêu cầu hóa đơn (xuất cho Trạm)": "HĐ - Xuất cho trạm",
};


// Cac trang thai 1 dong con "dang mo" - moi cho phep chon checkbox/hanh dong don le.
export const DON_HANG_DANG_MO = ["Cho Tram duyet", "Cho TBP xac nhan", "Cho TN duyet"];
