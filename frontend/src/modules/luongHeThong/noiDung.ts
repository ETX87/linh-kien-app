// Noi dung TINH cua muc "Luong & logic he thong" (2026-11-11, v1.471 — "Thêm mục logic thể hiện toàn bộ luồng chức năng, logic chạy
// app 1 cách đẹp đẽ đầy đủ"). Lay tu code that + CLAUDE.md: ten trang thai = nhan hien thi o datMuaLinhKien/constants.ts, quy tac tu
// dong duyet = backend/src/lib/tuDongDuyet.ts (danhGiaPhieu). DOI LUONG O BACKEND THI SUA CAU O DAY (khong co API, khong tu dong khop).
// Khong dung t() cho noi dung nghiep vu dai (dich dan sau, xem i18n/README trong CLAUDE.md).

// Loai moc tren luong ngang - quyet dinh mau (LuongNgang.tsx): bat dau / he thong tu dong / cho nguoi xu ly / ket thuc tot / nhanh huy.
export type LoaiMoc = "bat_dau" | "tu_dong" | "cho" | "xong" | "huy";

export interface Moc {
  key: string;
  ten: string; // nhan hien thi tren app (dung nhu constants.ts)
  ma?: string; // ma trang thai luu DB (de doi chieu log)
  loai: LoaiMoc;
  ai: string; // ai lam / ai xu ly o buoc nay
  moTa: string;
  dieuKien?: string[]; // dieu kien vao / dieu kien thao tac
  tiepTheo?: string[]; // trang thai ke tiep (moi nhanh 1 dong)
  tuDong?: string[]; // he thong tu lam gi (ly do tu dong ghi vao log)
  luuY?: string[];
}

export interface Luong {
  key: string;
  ten: string;
  moTa: string;
  moc: Moc[];
  // Nhanh re khong nam tren truc chinh (tu choi, huy, day lui...) - hien duoi luong.
  nhanh?: { ten: string; loai: LoaiMoc; moTa: string }[];
}

export interface TheThongTin {
  tieuDe: string;
  bieuTuong: string; // emoji nho dau the
  dong: string[];
  luong?: Luong; // the co luong ngang rieng (vd huy don can dong y)
}

export interface Nhom {
  key: string;
  ten: string;
  gioiThieu: string;
  luong?: Luong[];
  the?: TheThongTin[];
}

// ─────────────────────────────── 1. Đặt hàng & tự động duyệt ───────────────────────────────
const LUONG_DAT_HANG: Luong = {
  key: "dat-hang",
  ten: "Đơn Mua / Công nợ — từ lúc tạo tới khi vào phiếu",
  moTa:
    "Mọi đơn đi qua 1 bộ quyết định duy nhất (danhGiaPhieu) dùng chung cho tạo tay, Import Excel, kiểm tra trước trên form và API đối tác. Tác nghiệp không còn duyệt tay — hệ thống tự duyệt 100%, chỉ dừng ở các bước cần người quyết định.",
  moc: [
    {
      key: "tao",
      ten: "Tạo đơn",
      loai: "bat_dau",
      ai: "KTV / Trạm tự đặt cho mình; TN, GS, Admin, người tạo hộ đặt cho KTV khác; QC đặt cho chính mình; API đối tác",
      moTa: "Chọn người nhận hàng, mã linh kiện (hoặc combo), loại đề xuất, SL, chính sách, Mã YCSC / Mã Lada, yêu cầu hóa đơn. Form kiểm tra trước từng dòng (POST /phieu-dat/kiem-tra) và hiện ngay kết quả dự kiến.",
      dieuKien: [
        "Vệ tinh KHÔNG tạo đơn (Trạm đặt thay).",
        "CÔNG NỢ SỬA CHỮA: chỉ cho tài khoản có cờ “NV sửa chữa” (NV tự đặt, TN / GS / Admin đặt hộ); mỗi dòng bắt buộc Mã đơn bảo hành: chọn trong danh sách đơn NV nhận hàng đang sửa (lấy thẳng từ app Bảo hành đổi trả, gõ mã / mã case để tìm) hoặc nhập tay mã bất kỳ (≤ 40 ký tự) cho đơn ngoài app; đơn ghi nhận có liên kết app đổi trả hay nhập tay; chưa hỗ trợ Import Excel. Cấp linh kiện tạo được ở CẢ app Bảo hành đổi trả (tự tạo đơn cùng loại ở đây qua API) — Kế toán / Kho xử lý duy nhất ở app này; nội dung đơn chỉ sửa ở app tạo ra nó (app đổi trả sửa linh kiện / số lượng khi Kế toán chưa xử lý); trạng thái tự cập nhật về app đổi trả.",
        "Người nhận là KTV phải có Mã MISA (KTV_CHUA_CO_MA_MISA), tài khoản không bị tắt (NGUOI_NHAN_HANG_DA_TAT).",
        "Loại đề xuất chứa “HỖ TRỢ” bắt buộc Mã YCSC (hoặc Mã Lada với công nợ/HỖ TRỢ).",
        "SL ≤ 10.000/dòng, giá chốt ≤ 1 tỷ, tiền công nợ ≤ 10 tỷ; tối đa 300 dòng/lần.",
        "Combo được tách thành từng đơn thành phần ngay khi gửi.",
      ],
      tiepTheo: ["Bị CHẶN (báo lý do từng dòng, không tạo)", "Chờ TBP DVBH xác nhận", "Chờ GS duyệt (vượt trần)", "Kiểm tra tồn kho công ty"],
      tuDong: ["Form lưu nháp trên máy, mở lại thì hỏi “Mở lại đơn tạo dở?”.", "Sau khi tạo luôn mở hộp “Kết quả đặt hàng” — từng dòng đã vào phiếu nào, trạng thái gì, vì sao."],
    },
    {
      key: "chan",
      ten: "Kiểm tra chặn",
      loai: "tu_dong",
      ai: "Hệ thống",
      moTa: "Những dòng sau bị chặn ngay, không tạo đơn:",
      dieuKien: [
        "Đơn có tiền (Mua / TRỪ CÔNG NỢ) mà giá bán 0đ — trừ LK bật “Cho phép giá 0đ” ở Bảng giá.",
        "Đơn công nợ mà người nhận chưa có Mã MISA (chỉ đặt được Mua).",
        "TRỪ CÔNG NỢ khi tồn kho của chính KTV không đủ, hoặc người nhận không phải KTV.",
        "Giá Bảng giá vô lý (> 1 tỷ).",
      ],
      tiepTheo: ["Không bị chặn → xét bước TBP"],
    },
    {
      key: "tbp",
      ten: "Chờ TBP DVBH xác nhận",
      ma: "Cho TBP xac nhan",
      loai: "cho",
      ai: "Trưởng bộ phận DVBH (la_tp_dvbh)",
      moTa: "Linh kiện ĐẶC THÙ cần TBP xác nhận trước.",
      dieuKien: [
        "Đặc thù hiệu lực của đơn = bật/tắt tay trên đơn, nếu không theo cờ “Đặc thù” của LK.",
        "BỎ QUA TBP khi loại đề xuất chứa MUA / HỖ TRỢ / TRỪ CÔNG NỢ.",
        "TBP duyệt đơn vượt trần phải nhập mã EO.",
      ],
      tiepTheo: ["Duyệt → xét trần công nợ", "Từ chối → Đã hủy"],
    },
    {
      key: "tran",
      ten: "Xét trần công nợ",
      loai: "tu_dong",
      ai: "Hệ thống",
      moTa: "Chỉ đơn công nợ thật: công nợ chốt + tiền công nợ của các dòng > trần công nợ của KTV thì cần GS duyệt.",
      dieuKien: [
        "Không xét: TRỪ CÔNG NỢ, KH trả góp TG12, HỖ TRỢ 0 ĐỒNG, CÔNG NỢ SỬA CHỮA, LK nhóm B2B, người nhận là Giám sát.",
        "Công nợ chốt = thực tế (file MISA, trừ SL “Công nợ 0 đồng”) + phát sinh − đã trừ.",
        "Công nợ đối tác: cộng dồn theo đối tác, vượt “Công nợ tối đa” cũng vào Chờ GS.",
      ],
      tiepTheo: ["Trong trần → kiểm tra tồn kho", "Vượt trần → Chờ GS duyệt"],
    },
    {
      key: "gs",
      ten: "Chờ GS duyệt (vượt trần)",
      ma: "Cho GS duyet",
      loai: "cho",
      ai: "GS chính của khu vực KTV (email_gs), GS phụ của khu vực, hoặc Admin",
      moTa: "GS quyết định cho đơn vượt trần đi tiếp.",
      dieuKien: ["Duyệt bắt buộc nhập mã EO (lưu dat_don_hang.ma_eo).", "Khu vực chưa có GS thì đơn nằm chờ."],
      tiepTheo: ["Duyệt → kiểm tra tồn kho", "Từ chối → Đã hủy"],
      tuDong: ["Đơn đã duyệt vượt trần hiện badge “✓ Duyệt vượt trần +X” ở chi tiết đơn và dòng trong phiếu."],
    },
    {
      key: "ton",
      ten: "Kiểm tra tồn kho công ty",
      loai: "tu_dong",
      ai: "Hệ thống",
      moTa: "Tồn kho công ty theo KHU VỰC CỦA ĐƠN (file MISA mới nhất − SL các đơn khác đang giữ hàng), trừ dần theo thứ tự tạo: đơn trước đủ, đơn sau thiếu.",
      tiepTheo: ["Đủ hàng → Đã duyệt (tự động) + vào phiếu", "Thiếu + đơn có tiền → Chờ thanh toán", "Thiếu + không có tiền → Chờ hàng + mở ticket"],
      tuDong: ["Lý do ghi vào lịch sử đơn kèm khu vực kho đã kiểm (vd “Kho MB1 còn 0, cần 2”).", "Form tạo đơn gợi ý LK tương đương còn hàng (chip “x123”) + phương án tách dòng."],
    },
    {
      key: "cho-tt",
      ten: "Chờ thanh toán (thiếu hàng)",
      ma: "Cho thanh toan",
      loai: "cho",
      ai: "KTV chuyển tiền → Kế toán xác nhận",
      moTa: "Kho thiếu nhưng đơn có tiền: đơn vào phiếu “chờ hàng” riêng để KTV chuyển tiền trước.",
      tiepTheo: ["Kế toán xác nhận tiền → xét lại tồn: đủ → Đã duyệt; vẫn thiếu → Chờ hàng (mang theo tiền)"],
      tuDong: [
        "Sửa mã / SL / giá về 0đ → đánh giá lại ngay; hết tiền phải chuyển mà vẫn thiếu → Chờ hàng.",
        "TN / Kế toán có nút “⏭ Cho phép thanh toán sau” (đi tiếp như đã trả, tiền vẫn thu ở phiếu).",
      ],
    },
    {
      key: "cho-hang",
      ten: "Chờ hàng",
      ma: "Cho hang",
      loai: "cho",
      ai: "Kho (và Mua hàng nếu Kho chuyển)",
      moTa: "Ticket Thiếu hàng tự mở (lý do “Kho hết hàng”). Đơn Chờ hàng do KHO quyết định — xem tab Thiếu hàng.",
      tiepTheo: ["Hàng đã về → Đã duyệt + vào phiếu", "Kho từ chối / hủy ticket → đơn Đã hủy, tiền về quỹ"],
      luuY: ["Kho chưa tiếp nhận: TN vẫn từ chối/hủy được, ticket tự hủy.", "Kho / Mua hàng đã tiếp nhận: khóa đơn, KTV không hủy được (phải gửi yêu cầu hủy)."],
    },
    {
      key: "duyet",
      ten: "Đã duyệt",
      ma: "TN da duyet",
      loai: "xong",
      ai: "Hệ thống (log “Tự động duyệt đơn”)",
      moTa: "Từ v1.494 nhãn trạng thái của đơn đã duyệt hiện THEO BƯỚC CỦA PHIẾU chứa đơn (Chờ KTV chuyển tiền / Chờ Kế toán xác nhận tiền / Kế toán đang chốt phiếu / Kho đang xuất hàng / Đang giao — chờ KTV xác nhận / KTV đã nhận hàng…), chi tiết đơn có luồng ngang Đặt đơn → Duyệt & kiểm kho → Chuyển tiền → Kế toán chốt → Kho xuất hàng → Giao KTV → KTV đã nhận. Đơn tự gom vào phiếu xuất kho đang tạo của người nhận (bundleAutoApprovedIntoPxk). Lịch sử phiếu ghi rõ lý do gom.",
      tuDong: [
        "Tách phiếu theo: người nhận, loại đơn, NHÓM loại đề xuất (MUA HÀNG + MUA HÀNG CÓ ID gộp chung), hình thức hóa đơn, cờ KH chuyển khoản, đối tác, khu vực chọn, phiếu chờ hàng.",
        "Đơn đã thanh toán ưu tiên phiếu riêng (chỉ gộp vào phiếu Kế toán đã duyệt tiền).",
      ],
      tiepTheo: ["→ Luồng Phiếu xuất kho"],
    },
  ],
  nhanh: [
    { ten: "Từ chối / Hủy", loai: "huy", moTa: "TBP, GS từ chối → Đã hủy. Người tạo / người nhận / GS khu vực hủy hộ khi đơn chưa có bộ phận xử lý; tiền đã trả tự về quỹ (trigger)." },
    { ten: "Đẩy lại trong 24h", loai: "cho", moTa: "Đơn bị NGƯỜI KHÁC hủy / từ chối: TN / Kế toán / Admin “↩ Đẩy lại chờ duyệt” trong 24h (đơn từ ticket thì phục hồi về Chờ hàng)." },
    { ten: "Mua hàng chuyển chờ hàng", loai: "cho", moTa: "Mua hàng / Kế toán “⏳ Chuyển chờ hàng” đơn chưa vào phiếu đã gửi Kế toán → Chờ hàng, ticket mở thẳng ở Chờ mua hàng." },
  ],
};

const LUONG_TRAM: Luong = {
  key: "tram",
  ten: "Đơn Vệ tinh → Trạm",
  moTa: "Vệ tinh là tài khoản riêng gắn 1 Trạm (KTV cấp 1). Mọi tiền, quỹ, phiếu đi theo người nhận cuối là Trạm.",
  moc: [
    { key: "vt", ten: "Trạm đặt cho Vệ tinh", loai: "bat_dau", ai: "Trạm (KTV cấp 1)", moTa: "Vệ tinh theo dõi đơn của mình; Trạm đặt và nhận hàng thay." },
    { key: "tram", ten: "Chờ Trạm duyệt", ma: "Cho Tram duyet", loai: "cho", ai: "Trạm", moTa: "Đơn cũ / đơn đặt hộ của Vệ tinh chờ Trạm duyệt (duyệt / từ chối hàng loạt).", tiepTheo: ["Duyệt → định tuyến lại như đơn thường (TBP → trần → tồn kho)", "Từ chối → Bị từ chối"] },
    { key: "tiep", ten: "Định tuyến lại", loai: "tu_dong", ai: "Hệ thống (trangThaiSauDuyet)", moTa: "Sau khi Trạm / TBP / GS duyệt, hệ thống chạy tiếp đúng bộ quy tắc tự duyệt." },
  ],
};

// ─────────────────────────────── 2. Thiếu hàng ───────────────────────────────
const LUONG_THIEU_LK: Luong = {
  key: "thieu-lk",
  ten: "Ticket Thiếu hàng đặt mua (thieu_lk)",
  moTa: "Mở tự động khi đơn vào Chờ hàng. Ticket và đơn gốc đồng bộ 2 chiều. Kho chỉ thấy nhóm LK được gán (Karofi / B2B).",
  moc: [
    { key: "cho-kho", ten: "Chờ kho xử lý", ma: "Cho kho xu ly", loai: "cho", ai: "Kho (TN thao tác hộ được)", moTa: "Kho đánh giá: tồn kho còn đặt được, ticket cùng mã đang mở, hàng về gần nhất (khung “Thông tin để Kho đánh giá”).", tiepTheo: ["Đã có hàng (1 bấm = tiếp nhận + hàng về)", "Kho đã tiếp nhận", "Chuyển Mua hàng", "Kho từ chối (sai TT) — bắt buộc lý do"] },
    { key: "tiep-nhan", ten: "Kho đã tiếp nhận", ma: "Kho da tiep nhan", loai: "cho", ai: "Kho", moTa: "Kho nhận xử lý, nhập ngày dự kiến có hàng. Từ đây đơn gốc bị KHÓA (không hủy thường được).", tiepTheo: ["Kho đã cập nhật (đổi dự kiến / ghi chú, lặp lại được)", "Hàng đã về", "Chuyển Mua hàng"], tuDong: ["Báo người tạo đơn mỗi lần Kho tiếp nhận / đổi dự kiến."] },
    { key: "mua", ten: "Chờ mua hàng", ma: "Cho mua hang", loai: "cho", ai: "Mua hàng (la_mua_hang) / Admin", moTa: "Mua hàng thấy TẤT CẢ ticket Chờ mua hàng (không giới hạn phạm vi).", tiepTheo: ["Đã đặt hàng (bắt buộc mã EO + ngày dự kiến) → Mua hàng đã đặt", "Không mua được (bắt buộc ghi chú) → ticket hủy, đơn gốc tự hủy, tiền về quỹ"] },
    { key: "da-dat", ten: "Mua hàng đã đặt", ma: "Mua hang da dat", loai: "cho", ai: "Kho theo dõi", moTa: "Lưu mã EO + dự kiến, báo người tạo. Kho cập nhật / xác nhận hàng về như thường." },
    { key: "ve", ten: "Hàng đã về", ma: "Kho xac nhan hang da ve", loai: "tu_dong", ai: "Kho / TN thay Kho", moTa: "Ghi ngày hàng về thực tế.", tuDong: ["Đơn gốc tự duyệt + vào phiếu (duyetDonKhiHangVe).", "Có thể “Đổi LK tương đương” cùng nhóm thay thế rồi xác nhận có hàng (đổi mã, giá theo mã mới).", "Kho chỉ có 1 phần: “✂ Tách đơn” — phần có hàng đi trước, phần còn lại giữ ticket."] },
    { key: "ket", ten: "Đã duyệt đơn gốc", ma: "Da ket thuc", loai: "xong", ai: "Hệ thống", moTa: "Ticket đóng khi đơn gốc đã duyệt." },
  ],
  nhanh: [
    { ten: "Kho từ chối (sai TT) / Đã huỷ bỏ", loai: "huy", moTa: "Đơn gốc tự hủy, tiền về quỹ, báo người tạo. Kho / Mua hàng hủy ticket bắt buộc lý do." },
    { ten: "Đẩy lại ticket trong 24h", loai: "cho", moTa: "TN / Kế toán / Kho / Admin “↩ Đẩy lại ticket”: ticket về trạng thái mở trước đó, đơn về Chờ hàng, rút lại tiền đã hoàn từ quỹ." },
    { ten: "📦 Rà soát hàng về", loai: "tu_dong", moTa: "Sau mỗi lần import tồn kho MISA (hoặc bấm tay): cấp tồn cho đơn Chờ hàng theo ưu tiên ca khiếu nại > ngày tạo cũ > ⭐ ưu tiên > giờ tạo; gặp đơn chỉ đủ 1 phần thì dừng mã đó để Kho quyết tách." },
  ],
};

const LUONG_THIEU_BH: Luong = {
  key: "thieu-bh",
  ten: "Thiếu hàng BẢO HÀNH (từ app Sửa chữa bảo hành)",
  moTa: "App Sửa chữa gửi sang khi đơn bảo hành có lý do chậm “Không có linh kiện” / “Hết hàng tồn kho”. Ticket THB-… riêng, mỗi bước đẩy ngược kết quả về đơn bảo hành gốc. Từ v1.565 hiện CHUNG danh sách Thiếu hàng với ticket đặt mua (cột / bộ lọc “Nguồn tiếp nhận” = Đổi trả — thiếu hàng BH), bấm dòng mở popup xử lý THB.",
  moc: [
    { key: "nhan", ten: "Nhận từ Sửa chữa", loai: "bat_dau", ai: "Hệ thống (POST /api/suachua-partner/thieu-hang-bh)", moTa: "Trùng đơn bảo hành + mã LK đang mở thì dùng lại ticket cũ." },
    { key: "kho", ten: "Chờ kho xử lý", loai: "cho", ai: "Kho / TN / Admin", moTa: "Tiếp nhận (ngày dự kiến), chuyển Mua hàng, xác nhận hàng về, hoặc từ chối (bắt buộc lý do)." },
    { key: "mua", ten: "Chờ mua hàng", loai: "cho", ai: "Mua hàng / Admin", moTa: "Đã đặt (mã EO + dự kiến) hoặc từ chối (ghi chú)." },
    { key: "ve", ten: "Hàng đã về", loai: "xong", ai: "Kho", moTa: "Bản tin đẩy ngay sang Sửa chữa; lỡ push thì bên đó tự kéo lại mỗi 15 phút." },
  ],
};

// ─────────────────────────────── 3. Phiếu xuất & tiền ───────────────────────────────
const LUONG_PXK: Luong = {
  key: "pxk",
  ten: "Phiếu xuất kho (PMH / PCN / PTL)",
  moTa: "1 phiếu = 1 người nhận + cùng nhóm loại đề xuất. Bấm dòng phiếu ở danh sách để mở chi tiết; ▼ xổ các đơn con.",
  moc: [
    { key: "tao", ten: "Đang tạo phiếu", ma: "Dang tao phieu", loai: "bat_dau", ai: "Hệ thống tự gom / TN tạo tay", moTa: "Còn sửa tự do: thêm / bỏ / chuyển / tách đơn, đổi loại chiết khấu, chuyển kho xuất MB/MN, chọn lại khu vực.", tiepTheo: ["Chờ chuyển tiền (nếu phiếu cần tiền)", "Chờ TN gửi kế toán (đủ tiền / không cần tiền)"], tuDong: ["Tiền mỗi dòng + “Tiền cần chuyển” do backend tính (tinhToanPxk) mỗi khi phiếu đổi.", "Tổng đổi → trạng thái tiền về “Chờ KTV chuyển” (giữ ảnh cũ) hoặc trừ quỹ dư."] },
    { key: "tien", ten: "Chờ chuyển tiền", loai: "cho", ai: "KTV nhận hàng (người tạo hộ / GS xác nhận thay được)", moTa: "Xem luồng Chuyển tiền & quỹ bên dưới." },
    { key: "gui", ten: "Chờ mã đơn hàng", loai: "cho", ai: "TN / Kế toán", moTa: "Nhập Mã đơn hàng (mã HĐ) rồi “Gửi kế toán”.", dieuKien: ["Chặn khi còn đơn chưa duyệt (DON_CHUA_DUYET), phiếu trống, chưa đủ tiền (Kế toán chưa duyệt chuyển tiền)."] },
    { key: "kt", ten: "Chờ mã MISA", ma: "Cho ke toan", loai: "cho", ai: "Kế toán", moTa: "Kế toán tải file MISA (Bán hàng / CN, hỗ trợ / Chuyển kho — mẫu đề xuất theo loại đề xuất), nhập Mã PXK MISA rồi chốt.", tiepTheo: ["Đã chốt xong đơn xuất → Kho", "📦 Hàng trừ kho (kết thúc luôn, không qua Kho)", "↩ Trả về chờ mã HĐ (bắt buộc ghi chú)", "Hủy phiếu"], tuDong: ["Vẫn thêm / bớt / tách đơn được tới khi chốt; tổng tăng mà thiếu tiền → phiếu tự về Chờ mã HĐ.", "⚡ Kế toán duyệt nhanh: Mã đơn hàng = ID phiếu, Mã PXK = PXK-<ID>, chọn nhiều phiếu 1 lần."] },
    { key: "chot", ten: "Đã chốt xong đơn xuất", ma: "Da chot xong don xuat", loai: "cho", ai: "Kho", moTa: "Đẩy sang khovan (kho vận). Menu chia “Đã chốt xong - chưa in” / “Phiếu đã in”.", tiepTheo: ["Đang gửi KTV (nhập mã vận đơn)", "↩ Đẩy lùi về chờ mã MISA"], tuDong: ["Phiếu mà MỌI dòng là TRỪ CÔNG NỢ → tự “Hàng trừ kho”."] },
    { key: "gui-ktv", ten: "Đang gửi KTV", ma: "Dang gui KTV", loai: "cho", ai: "KTV nhận hàng", moTa: "KTV xác nhận đã nhận hoặc ⚠ Báo nhận thiếu.", tiepTheo: ["KTV đã nhận", "Báo nhận thiếu → ticket NTH", "↩ Kho đẩy lùi về chờ gửi"], tuDong: ["Hạn tự xác nhận = 10 ngày kể từ lúc gửi; cron 8h VN tự “KTV đã nhận” nếu không có ticket mở, nhắc KTV mỗi ngày."] },
    { key: "nhan", ten: "KTV đã nhận", ma: "KTV da nhan", loai: "xong", ai: "KTV / hệ thống", moTa: "Kết thúc phiếu mua / công nợ. Phiếu trả hàng kết thúc bằng “Kho đã nhận hàng trả”." },
  ],
  nhanh: [
    { ten: "Đã huỷ (Ke toan huy)", loai: "huy", moTa: "Phiếu hủy / hết đơn tự hủy: tiền đã trả hoàn về quỹ người nhận, báo KTV. Mã đơn hàng của phiếu hủy được giải phóng để dùng lại." },
    { ten: "Hàng trừ kho", loai: "xong", moTa: "Kết thúc không cần Kho gửi (TRỪ CÔNG NỢ hoặc Kế toán chọn ở Chờ mã MISA)." },
    { ten: "Bỏ đơn khỏi phiếu", loai: "cho", moTa: "Phiếu nhiều đơn: Tách thành phiếu mới / Thêm vào phiếu có sẵn / Chỉ bỏ khỏi phiếu. Đơn đã thanh toán mang theo tiền (tien_da_tra)." },
  ],
};

const LUONG_TIEN: Luong = {
  key: "tien",
  ten: "Chuyển tiền & quỹ dư KTV",
  moTa: "Mọi tiền đi qua quỹ của NGƯỜI NHẬN HÀNG (Vệ tinh → quỹ Trạm). Sổ quỹ chỉ ghi thêm, số dư không bao giờ âm, mỗi thao tác khóa CAS chống bấm 2 lần.",
  moc: [
    { key: "cho", ten: "Chờ KTV chuyển", ma: "Cho KTV chuyen", loai: "cho", ai: "KTV nhận hàng / người tạo hộ / GS của đơn", moTa: "Chuyển khoản rồi tải ảnh bằng chứng (≤ 5 ảnh). Số tiền tự đọc từ ảnh (OCR trên trình duyệt) — chỉ cảnh báo, không chặn.", tuDong: ["Quỹ dư đủ → tự trừ quỹ trả phiếu; còn thiếu thì chỉ phải chuyển phần thiếu.", "Đóng form khi đã tải ảnh mà chưa bấm “Đã chuyển” → popup nhắc."] },
    { key: "da", ten: "KTV đã chuyển", ma: "KTV da chuyen", loai: "cho", ai: "Kế toán", moTa: "Kế toán đối soát ảnh (khung Đối soát tiền: OCR từng ảnh, tổng, Khớp / Lệch; cảnh báo khoản trùng 30 ngày), nhập SỐ THỰC NHẬN.", tiepTheo: ["Duyệt → Kế toán đã duyệt (đủ) hoặc về Chờ KTV chuyển số còn thiếu", "↩ Từ chối, đẩy lại (bắt buộc lý do — popup lớn báo KTV)", "KTV “↩ Sửa / hủy ảnh bằng chứng” khi chưa duyệt"] },
    { key: "duyet", ten: "Kế toán đã duyệt", ma: "TN da duyet", loai: "xong", ai: "Hệ thống", moTa: "Thực nhận vào quỹ → trừ quỹ trả phiếu. Dư nằm lại quỹ và tự trả phiếu chờ tiền CŨ NHẤT cùng người (phanBoQuy).", tuDong: ["Phiếu chứa đơn Chờ thanh toán → xét lại tồn kho từng đơn.", "Tiền cần chuyển = 0 (trả đủ bằng quỹ / tiền đơn mang theo, KTV chưa báo chuyển) → thẳng Kế toán đã duyệt, không cần Kế toán bấm."] },
  ],
  nhanh: [
    { ten: "Sửa / hủy khoản đã duyệt", loai: "cho", moTa: "Quỹ & chuyển tiền: sửa tăng = cộng quỹ phần chênh; sửa giảm chỉ khi quỹ đủ; hủy (duyệt nhầm) rút lại tiền đã trả phiếu, phiếu về KTV đã chuyển." },
    { ten: "Tổng phiếu giảm / phiếu hủy", loai: "tu_dong", moTa: "Phần đã trả thừa tự hoàn về quỹ (Hoàn tiền về quỹ), cảnh báo “tiền đã chuyển bị bớt” ở chi tiết phiếu." },
  ],
};

const LUONG_NHAN_THIEU: Luong = {
  key: "nhan-thieu",
  ten: "KTV báo nhận thiếu / không nhận được hàng (NTH-…)",
  moTa: "Chỉ khi phiếu đang “Đang gửi KTV”. Trong lúc ticket mở, phiếu không tự xác nhận và KTV không bấm “Đã nhận” được.",
  moc: [
    { key: "bao", ten: "KTV báo nhận thiếu", loai: "bat_dau", ai: "KTV nhận hàng (TN báo hộ)", moTa: "SL thực nhận từng dòng + lý do (thiếu SL / không nhận / sai hỏng / khác) + ảnh ≤ 5 + mô tả. Người báo rút lại được." },
    { key: "kho", ten: "Chờ kho kiểm tra", loai: "cho", ai: "Kho", moTa: "Từ chối (bắt buộc ghi chú, hạn tự nhận +10 ngày) hoặc Xác nhận thiếu + chọn Gửi bù / Hoàn tiền.", tiepTheo: ["Từ chối → phiếu chờ KTV xác nhận lại", "Xác nhận thiếu → KTV đã nhận + Chờ kế toán cân đối"] },
    { key: "kt", ten: "Chờ kế toán cân đối", loai: "cho", ai: "Kế toán (sau khi cân đối MISA)", moTa: "SL thực xuất đơn gốc = SL thực nhận; tiền phần thiếu = đơn giá thực trả × SL thiếu.", tiepTheo: ["Hoàn tiền → hoàn về quỹ (Đã hoàn tiền)", "Gửi bù → tạo đơn gửi bù + phiếu gửi bù đã có tiền"] },
    { key: "xong", ten: "Đã hoàn tiền / Đã cân đối", loai: "xong", ai: "Hệ thống", moTa: "Đơn gửi bù không tính vào tổng ngày chiết khấu; TN xử lý phiếu gửi bù như phiếu thường." },
  ],
};

// ─────────────────────────────── 4. Hàng trả ───────────────────────────────
const LUONG_TRA_HANG: Luong = {
  key: "tra-hang",
  ten: "Đơn trả hàng (loại đề xuất TRẢ HÀNG …)",
  moTa: "4 bước duyệt riêng (tra_hang_log), mỗi bước có hạn 8 giờ làm việc (T2–T6 8h, T7 sáng 4h, CN nghỉ) tính từ mốc xử lý cuối của bước trước. Quá hạn mà Duyệt / Từ chối phải chọn lý do chậm.",
  moc: [
    { key: "tao", ten: "Tạo đơn trả hàng", loai: "bat_dau", ai: "KTV / người đặt hộ", moTa: "Mỗi dòng 1–3 ảnh (Drive). KTV hạn mức 50 ảnh/ngày; form lưu nháp nếu trình duyệt tải lại khi mở camera.", dieuKien: ["Đổi qua lại Mua ↔ Trả hàng chỉ ở form Sửa của TN khi còn Chờ kế toán duyệt mềm."] },
    { key: "kt", ten: "Chờ kế toán duyệt mềm", ma: "Cho ke toan duyet mem", loai: "cho", ai: "Kế toán", moTa: "Duyệt / từ chối về mặt chứng từ, công nợ." },
    { key: "kho", ten: "Chờ kho xác nhận", ma: "Cho kho xac nhan", loai: "cho", ai: "Kho (hoặc qua khovan)", moTa: "Xác nhận đã nhận hàng; sửa “SL thực tế nhận về” (ghi vào SL thực xuất → file MISA theo số mới)." },
    { key: "qc", ten: "Chờ QC xác nhận", ma: "Cho QC xac nhan", loai: "cho", ai: "QC", moTa: "Popup xác nhận SL đạt. Đạt ít hơn SL đang nhận → TÁCH: phần đạt đi tiếp, phần còn lại thành đơn mới chờ QC.", tiepTheo: ["Đạt → Đã duyệt + tự gom phiếu PTL", "Từ chối: lý do + ghi chú + ≥ 1 ảnh + video ≤ 100MB"] },
    { key: "xong", ten: "QC đã duyệt", ma: "TN da duyet", loai: "xong", ai: "Hệ thống", moTa: "Từ đây đi chung luồng Phiếu xuất (PTL): Kế toán chốt Chuyển kho (NTMB / NTMN) → Kho xác nhận đã nhận hàng trả.", luuY: ["Đơn cũ còn bước “Chờ TN duyệt tổng”.", "QC xác nhận nhầm: QC / Kế toán / Kho đẩy lùi về Chờ QC khi phiếu PTL chưa qua Chờ mã MISA.", "TRẢ HÀNG DỮ TRỮ đã chốt trả lại hạn mức dự phòng của KTV."] },
  ],
};

// ─────────────────────────────── Nhóm tab ───────────────────────────────
export const NHOM: Nhom[] = [
  {
    key: "dat-hang",
    ten: "Đặt hàng & tự duyệt",
    gioiThieu: "Từ lúc KTV bấm “Tạo đơn” tới khi đơn nằm trong phiếu xuất kho. Bấm từng mốc để xem ai xử lý, điều kiện và hệ thống tự làm gì.",
    luong: [LUONG_DAT_HANG, LUONG_TRAM],
    the: [
      {
        tieuDe: "Thứ tự quyết định của hệ thống",
        bieuTuong: "🧭",
        dong: [
          "1. Chặn: giá 0đ, chưa Mã MISA (công nợ), TRỪ CÔNG NỢ thiếu tồn KTV.",
          "2. Đặc thù (trừ loại bỏ qua TBP) → Chờ TBP DVBH xác nhận.",
          "3. Công nợ thật vượt trần → Chờ GS duyệt (mã EO).",
          "4. Tồn kho công ty theo khu vực của đơn: đủ → tự duyệt; thiếu + có tiền → Chờ thanh toán; thiếu + không tiền → Chờ hàng.",
          "Nguồn: backend/src/lib/tuDongDuyet.ts — sửa quy tắc ở đó, không ở từng route.",
        ],
      },
      {
        tieuDe: "Khu vực của đơn",
        bieuTuong: "📍",
        dong: [
          "Thứ tự: KTV nhận hàng → Khu vực đặt hàng người nhận → KTV tạo → KĐH người tạo → GS nhận → GS tạo → “Chưa có khu vực”.",
          "TN / Kho / Kế toán / TBP / GS / người tạo hộ chọn lại được khu vực xử lý (khu_vuc_chon) → xét lại tồn kho cả 2 chiều.",
          "GS của đơn (email_gs) = GS khu vực HIỆN TẠI của KTV nhận, tự đồng bộ khi KTV đổi khu vực.",
        ],
      },
      {
        tieuDe: "Đổi loại đề xuất",
        bieuTuong: "🔁",
        dong: [
          "KTV, GS, Kế toán, TN, Kho, Admin đổi được khi đơn chưa chuyển tiền / chưa Kế toán duyệt / Kho chưa tiếp nhận chờ hàng.",
          "Đánh giá lại bằng chính bộ tự duyệt; khác nhóm phiếu → tự rời phiếu và gom vào phiếu phù hợp hoặc phiếu mới.",
          "Đổi qua lại TRẢ HÀNG chỉ ở form Sửa của TN.",
        ],
      },
    ],
  },
  {
    key: "thieu-hang",
    ten: "Thiếu hàng",
    gioiThieu: "Kho quyết định đơn Chờ hàng; Mua hàng đặt hàng khi Kho chuyển. Menu Thiếu hàng có 3 mục: Thiếu hàng đặt mua · KTV báo nhận thiếu · Thiếu hàng bảo hành.",
    luong: [LUONG_THIEU_LK, LUONG_THIEU_BH],
  },
  {
    key: "phieu-tien",
    ten: "Phiếu xuất & tiền",
    gioiThieu: "Phiếu xuất kho đi song song 2 trục: trục phiếu (TN → Kế toán → Kho → KTV) và trục tiền (KTV chuyển → Kế toán duyệt → quỹ).",
    luong: [LUONG_PXK, LUONG_TIEN, LUONG_NHAN_THIEU],
    the: [
      {
        tieuDe: "Quỹ & chuyển tiền",
        bieuTuong: "💰",
        dong: [
          "Tab: Khoản chuyển tiền · Số dư quỹ · Sổ quỹ · Hoàn tiền · Tiền ngoài vào quỹ · Nộp tiền vào quỹ · Quỹ KH chuyển khoản · Công nợ đối tác · KH lẻ.",
          "Phiếu hoàn tiền HT-…: Kế toán tạo → tiền TẠM GIỮ khỏi quỹ → KTV “Đã nhận tiền” (trừ hẳn) hoặc từ chối → Kế toán hủy (trả lại) / đẩy lại KTV.",
          "Nộp tiền vào quỹ: KTV / GS gửi ảnh chuyển khoản (nút tròn “Nạp quỹ”) → Kế toán duyệt số thực nhận → tự trả phiếu chờ tiền.",
          "Tiền ngoài vào quỹ: Kế toán thêm tay hoặc import theo Mã MISA / Mã KTV (vd trừ lương đầu tháng).",
          "Trả bằng quỹ dư: TN trả trước cho đơn chưa vào phiếu còn thiếu tiền.",
        ],
      },
      {
        tieuDe: "Phiếu xuất — thao tác đáng nhớ",
        bieuTuong: "📄",
        dong: [
          "Tách phiếu chờ hàng (“✂ Tách đơn chờ hàng”), tách 1 đơn ngay trong phiếu (xuất trước 1 phần), bỏ nhiều đơn 1 lần.",
          "Chuyển kho xuất MB ↔ MN theo phiếu (báo TN miền mới); Kho thuần chỉ thấy phiếu ở miền xuất mới.",
          "Ghép phiếu 1 đơn vào phiếu có sẵn (kể cả phiếu đã có Mã MISA — có cảnh báo Kế toán sửa chứng từ).",
          "Ca khiếu nại tô nền đỏ nhạt ở mọi danh sách; phiếu xuất hóa đơn tô nền tím nhạt.",
        ],
      },
    ],
  },
  {
    key: "tra-hang",
    ten: "Hàng trả",
    gioiThieu: "Đơn trả hàng có 4 bước duyệt riêng, sau đó chuyển sang phiếu PTL dùng chung luồng phiếu xuất.",
    luong: [LUONG_TRA_HANG],
  },
  {
    key: "gia-cong-no",
    ten: "Giá, công nợ & đặc biệt",
    gioiThieu: "Các quy tắc tính tiền và các loại đơn đặc biệt. Backend là nguồn duy nhất tính tiền (lib/pxkRecalculate.ts — tinhToanPxk).",
    the: [
      {
        tieuDe: "Chiết khấu",
        bieuTuong: "🏷️",
        dong: [
          "Giá chốt tay LUÔN thắng.",
          "LK phân loại “Đình tủ”: luôn × 85%.",
          "Bậc thang theo TỔNG NGÀY của KTV (giá bán × SL các đơn Mua + TRỪ CÔNG NỢ tạo cùng ngày, trừ đơn hủy/từ chối) + đơn khác ngày trong phiếu Kế toán chưa chốt: < 200k giá bán · 200–500k × 70% · ≥ 500k giá KTV (LK chưa có giá KTV giữ giá bán).",
          "Có yêu cầu hóa đơn (trừ “HĐ - Xuất cho trạm”), KH lẻ, công nợ đối tác → GIÁ NIÊM YẾT, nhãn Không chiết khấu.",
          "Giá dự phòng chỉ cho MUA DỰ TRỮ khi đủ hạn mức dự phòng (tab Hạn mức dự trữ).",
          "Phiếu Kế toán đã duyệt tiền giữ mốc chiết khấu đã lưu (ck_co_so) — xem nút ⓘ ở dòng đơn.",
        ],
      },
      {
        tieuDe: "Công nợ KTV",
        bieuTuong: "📒",
        dong: [
          "Công nợ chốt = thực tế (file MISA) + phát sinh (đơn công nợ sau mốc import) − đã trừ (TRỪ CÔNG NỢ Kế toán đã duyệt tiền).",
          "Công nợ 0 đồng: chương trình theo mã LK / từ khóa × KTV × thời gian → SL hỗ trợ tính 0đ.",
          "Không tính công nợ: KH trả góp TG12, HỖ TRỢ 0 ĐỒNG, LK B2B (bỏ duyệt trần).",
          "TRỪ CÔNG NỢ: đối chiếu tồn kho CỦA KTV, file MISA trừ kho KTV, đủ tồn tự duyệt.",
        ],
      },
      {
        tieuDe: "Mua hàng công nợ đối tác",
        bieuTuong: "🤝",
        dong: [
          "Đơn Mua gắn Mã MISA đối tác (mặc định = đối tác của người nhận; GS / TN / Kế toán chọn lại được).",
          "Giá niêm yết, phiếu RIÊNG theo đối tác, KHÔNG cần chuyển tiền, KTV không bị tính tiền / công nợ.",
          "Vượt công nợ tối đa → Chờ GS duyệt (mã EO). Kế toán chốt phiếu = ghi nợ; thanh toán ghi ở Quỹ › Công nợ đối tác.",
        ],
      },
      {
        tieuDe: "KH lẻ & KH chuyển khoản",
        bieuTuong: "🧾",
        dong: [
          "Đặt cho tài khoản nhóm KH lẻ → nhập SĐT khách → mỗi khách 1 người nhận riêng (KL<MB|MN>-…), quỹ / phiếu / chuyển tiền như KTV, giá niêm yết.",
          "“Khách hàng đã chuyển khoản về công ty” (đơn mua, có hoặc không xuất HĐ — tính giá niêm yết): tiền vào “Quỹ KH chuyển khoản” gắn theo KTV, tách hẳn quỹ KTV, phiếu riêng.",
        ],
      },
      {
        tieuDe: "Hủy đơn cần bộ phận đồng ý",
        bieuTuong: "🛑",
        dong: [
          "Người gửi: người tạo / người nhận / GS / Admin. Hủy NGAY khi chưa có bộ phận xử lý (kể cả Kế toán đã duyệt tiền — tiền về quỹ).",
          "Cần đồng ý: Kho (đã tiếp nhận chờ hàng) · Mua hàng (chờ / đã đặt mua) · Kế toán (phiếu Chờ mã MISA hoặc đã có mã).",
          "Không hủy được: đơn trả hàng, đơn đã đóng, phiếu đã qua bước Kế toán chốt.",
        ],
        luong: {
          key: "huy",
          ten: "Yêu cầu hủy đơn",
          moTa: "",
          moc: [
            { key: "gui", ten: "Gửi yêu cầu hủy", loai: "bat_dau", ai: "Người tạo / người nhận / GS / Admin", moTa: "Bắt buộc lý do; tối đa 1 yêu cầu mở / đơn." },
            { key: "cho", ten: "Chờ X đồng ý hủy", loai: "cho", ai: "Kho / Mua hàng / Kế toán theo giai đoạn", moTa: "Chip “⏳ Chờ X đồng ý hủy” ở mọi danh sách; nằm trong “Cần làm” của bộ phận.", tiepTheo: ["Đồng ý", "Từ chối (bắt buộc ghi chú)", "Người gửi rút lại"] },
            { key: "huy", ten: "Đã hủy", loai: "huy", ai: "Hệ thống", moTa: "Phân loại lại trước khi hủy; ticket khóa → hủy ticket; trong phiếu → gỡ khỏi phiếu, tiền thừa về quỹ." },
          ],
        },
      },
      {
        tieuDe: "Linh kiện & Bảng giá",
        bieuTuong: "🔧",
        dong: [
          "Mã mới tạo trong app vào “Chờ xét duyệt”; Mua hàng / Kho / Admin xác nhận, gộp, đổi mã A→B (mã cũ thành chuyển hướng), từ chối. Đặt đơn bằng mã chờ không bị chặn.",
          "Bắt buộc Phân loại + Nhóm LK (Karofi / B2B). Phân loại “Máy” xuất kho ký gửi KRF.",
          "Combo, nhóm LK thay thế (Kho / Kế toán / GS sửa được), từ khóa tìm kiếm, ảnh ≤ 10, LK “Cấm bán” chỉ cảnh báo.",
          "Giá NY / giá KTV đồng bộ gia88 lúc 0h VN.",
        ],
      },
    ],
  },
];

// ─────────────────────────────── Vai trò ───────────────────────────────
export interface VaiTroInfo {
  ten: string;
  co: string; // co / vai_tro trong he thong
  bieuTuong: string;
  lam: string[];
  xem: string;
}

export const VAI_TRO: VaiTroInfo[] = [
  { ten: "KTV / CTV / Trạm", co: "la_ktv_dvbh", bieuTuong: "🧑‍🔧", lam: ["Tạo đơn cho mình (Trạm đặt thay Vệ tinh)", "Chuyển tiền, tải bằng chứng, nộp tiền vào quỹ", "Xác nhận đã nhận / báo nhận thiếu", "Gửi yêu cầu hủy đơn"], xem: "Đơn / phiếu / quỹ / công nợ của chính mình (Trạm thêm Vệ tinh dưới quyền)." },
  { ten: "Vệ tinh", co: "la_ve_tinh", bieuTuong: "🛰️", lam: ["Theo dõi đơn Trạm đặt cho mình", "Không tự tạo đơn"], xem: "Đơn của mình; quỹ = quỹ của Trạm." },
  { ten: "Giám sát (GS chính / GS phụ)", co: "vai_tro = Giam sat", bieuTuong: "🧭", lam: ["Đặt hộ cho MỌI KTV", "Duyệt đơn vượt trần (mã EO)", "Hủy hộ đơn KTV khu vực mình", "Chọn lại khu vực, xác nhận chuyển tiền thay KTV", "Sửa nhóm LK thay thế"], xem: "Khu vực phụ trách + khu vực GS phụ + đơn mình tạo / nhận. Không xét trần cho đơn GS tự nhận." },
  { ten: "Trưởng bộ phận DVBH (TBP)", co: "la_tp_dvbh", bieuTuong: "🎖️", lam: ["Xác nhận đơn LK đặc thù", "Chọn lại khu vực đơn"], xem: "Đơn trong phạm vi; không có tab Phiếu xuất." },
  { ten: "Tác nghiệp (TN)", co: "la_tac_nghiep", bieuTuong: "⚙️", lam: ["Đặt hộ, sửa đơn, đổi loại đề xuất / khu vực / đặc thù", "Tạo / sửa phiếu, nhập Mã đơn hàng, Gửi kế toán", "Đẩy lại đơn / ticket trong 24h", "Thao tác hộ mọi bước của Kho ở Thiếu hàng", "Trả bằng quỹ dư, cho phép thanh toán sau"], xem: "Theo Khu vực được gán (lọc mặc định), không gán = theo bảng phụ trách cũ." },
  { ten: "Kế toán (KT)", co: "la_ke_toan", bieuTuong: "📊", lam: ["Làm thay MỌI việc của TN", "Duyệt / từ chối / sửa / hủy khoản chuyển tiền", "Mã MISA, file MISA, chốt xuất, Hàng trừ kho, duyệt nhanh", "Duyệt mềm hàng trả, cân đối nhận thiếu", "Quỹ: điều chỉnh, phiếu hoàn tiền, tiền ngoài, công nợ đối tác, Công nợ 0 đồng, hạn mức dự trữ"], xem: "Toàn bộ." },
  { ten: "Kho", co: "la_kho", bieuTuong: "📦", lam: ["Xử lý ticket Thiếu hàng (tiếp nhận / có hàng / tách đơn / đổi LK tương đương / chuyển Mua hàng / từ chối)", "Chốt in, gửi KTV, đẩy lùi", "Xác nhận hàng trả + SL thực tế", "Kiểm tra báo nhận thiếu", "Xét duyệt mã LK, sửa nhóm thay thế"], xem: "Phiếu theo khu vực / miền xuất; ở Thiếu hàng, Kho thuần chỉ thấy nhóm LK được gán (Karofi / B2B)." },
  { ten: "Mua hàng", co: "la_mua_hang", bieuTuong: "🛒", lam: ["Đặt hàng cho ticket Chờ mua hàng (mã EO)", "Chuyển đơn sang Chờ hàng", "Xét duyệt mã LK, giá tạm"], xem: "Toàn bộ, chỉ đọc (trừ các thao tác riêng ở trên)." },
  { ten: "QC", co: "vai_tro = QC", bieuTuong: "🔍", lam: ["Xác nhận SL đạt / từ chối hàng trả (ảnh + video)", "Đẩy lùi đơn QC duyệt nhầm", "Đặt hàng cho chính mình như 1 KTV"], xem: "Toàn bộ đơn / phiếu; không xem báo cáo tổng thể." },
  { ten: "View", co: "la_view", bieuTuong: "👁️", lam: ["Chỉ đọc mọi menu"], xem: "Theo Khu vực được gán; không gán = tất cả." },
  { ten: "Admin", co: "vai_tro = Admin", bieuTuong: "🛡️", lam: ["Mọi thao tác + Cài đặt, Quản lý người dùng, API đối tác", "Đăng xuất mọi thiết bị của tài khoản", "Xem thử dưới vai trò khác"], xem: "Toàn bộ." },
];

// ─────────────────────────────── Kết nối hệ khác ───────────────────────────────
export interface KetNoi {
  ten: string;
  bieuTuong: string;
  chieu: "vao" | "ra" | "hai_chieu";
  dong: string[];
}

export const KET_NOI: KetNoi[] = [
  { ten: "Hệ DVBH gốc", bieuTuong: "🏢", chieu: "hai_chieu", dong: ["Tra cứu ca sự cố khi nhập Mã YCSC (GET /api/partner/case-lookup) — điểm nối DUY NHẤT để đọc ca.", "Mỗi giờ đẩy danh bạ KTV + danh mục LK sang DVBH.", "DVBH kéo tồn kho (8h–18h), lịch sử LK, timeline ca, đơn lỗi lọc TG12 (menu QL NSKX).", "Link /DDH-xxxxxx mở thẳng 1 đơn."] },
  { ten: "khovan (kho vận)", bieuTuong: "🚚", chieu: "hai_chieu", dong: ["Kế toán chốt xuất → đẩy phiếu sang khovan.", "Kho xác nhận hàng trả qua khovan (không bị chặn hạn 8h làm việc).", "khovan không có trạng thái rút lại — đẩy lùi chỉ đổi phía app."] },
  { ten: "App Sửa chữa bảo hành", bieuTuong: "🛠️", chieu: "hai_chieu", dong: ["Nhận ticket Thiếu hàng bảo hành, đẩy kết quả từng bước về đơn bảo hành gốc.", "Nhận Phân loại LK đồng bộ ngược (chỉ dòng có thay đổi).", "Cung cấp khu vực + GS phụ cho app sửa chữa (mỗi giờ)."] },
  { ten: "API đối tác (X-API-Key)", bieuTuong: "🔑", chieu: "vao", dong: ["Tra cứu: tồn kho, danh mục LK chi tiết, thay thế, combo, từ khóa, công nợ KTV, thiếu hàng, tồn khả dụng, danh bạ kho.", "Đặt linh kiện: POST /v1/dat-hang (+ kiểm tra, trạng thái) — dùng CHÍNH logic tạo đơn, mỗi key gắn 1 tài khoản đặt hàng.", "Tài liệu: docs/HUONG_DAN_API_DOI_TAC_LINH_KIEN_APP.md."] },
  { ten: "gia88 / cổng Lada", bieuTuong: "💲", chieu: "vao", dong: ["0h VN kéo giá NY / giá KTV + danh sách LK; mã chờ xét duyệt có trên gia88 → “Tự động duyệt”.", "Tra cứu đơn Lada theo Mã Lada."] },
  { ten: "ETX nhân sự", bieuTuong: "👥", chieu: "vao", dong: ["0h thứ Hai VN đồng bộ nhân sự: tự tạo mã KTV + duyệt tài khoản cho CTV/KTV có Gmail, khu vực đoán theo quản lý trực tiếp.", "Nghỉ việc → tự khóa tài khoản; tự điền Mã nhân sự NS-…"] },
  { ten: "Google Drive (OAuth)", bieuTuong: "🖼️", chieu: "ra", dong: ["Mọi ảnh (LK, trả hàng, bằng chứng chuyển tiền, nộp quỹ, QC) + video QC tải lên Drive tài khoản đã ủy quyền, công khai theo link.", "Hạn mức ảnh / ngày: 20 (KTV 50, KT / TN / GS 100, Admin không giới hạn)."] },
  { ten: "MISA (file)", bieuTuong: "📑", chieu: "hai_chieu", dong: ["Kế toán import tồn kho / công nợ MISA (theo lô, bảng tạm, không mất dữ liệu cũ khi dừng giữa chừng).", "Tải file Bán hàng / CN, hỗ trợ / Chuyển kho theo phiếu — diễn giải theo loại đề xuất."] },
];

export interface LichChay {
  gio: string;
  viec: string;
}
export const LICH_CHAY: LichChay[] = [
  { gio: "Mỗi giờ", viec: "Đồng bộ danh bạ KTV + danh mục LK sang DVBH / Sửa chữa." },
  { gio: "0h VN hằng ngày", viec: "Kéo giá gia88, đánh dấu đã đọc thông báo quá 30 ngày, xoá bộ đếm ảnh > 30 ngày." },
  { gio: "0h VN thứ Hai", viec: "Đồng bộ ETX nhân sự + tự tạo KTV / tài khoản." },
  { gio: "8h VN hằng ngày", viec: "Tự xác nhận phiếu “Đang gửi KTV” quá hạn 10 ngày + nhắc KTV phiếu chờ nhận." },
  { gio: "Sau import tồn kho", viec: "Rà soát hàng về: tự duyệt đơn Chờ hàng đã đủ tồn theo thứ tự ưu tiên." },
];

// Tong quan: chuoi giai doan lon - bam = mo tab tuong ung.
export const TONG_QUAN: { ten: string; ai: string; nhom: string; loai: LoaiMoc }[] = [
  { ten: "Tạo đơn", ai: "KTV / TN / GS", nhom: "dat-hang", loai: "bat_dau" },
  { ten: "Tự động duyệt", ai: "Hệ thống", nhom: "dat-hang", loai: "tu_dong" },
  { ten: "Thiếu hàng", ai: "Kho / Mua hàng", nhom: "thieu-hang", loai: "cho" },
  { ten: "Phiếu xuất kho", ai: "Hệ thống / TN", nhom: "phieu-tien", loai: "tu_dong" },
  { ten: "Chuyển tiền", ai: "KTV → Kế toán", nhom: "phieu-tien", loai: "cho" },
  { ten: "Mã HĐ + Mã MISA", ai: "Kế toán", nhom: "phieu-tien", loai: "cho" },
  { ten: "Kho gửi hàng", ai: "Kho", nhom: "phieu-tien", loai: "cho" },
  { ten: "KTV nhận hàng", ai: "KTV", nhom: "phieu-tien", loai: "xong" },
];
