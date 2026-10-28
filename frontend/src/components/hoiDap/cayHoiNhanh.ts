// Cay + noi dung "Hỏi nhanh" (2026-10-28, docs/Phan_luong_hoi_dap_tu_dong.md - "mỗi lựa chọn phân nhánh tối đa 5
// lựa chọn ... hướng dẫn đúng trọng tâm vấn đề KTV thắc mắc (chia nhỏ đến từng vấn đề)").
// Nhanh 2 "Hướng dẫn dùng app" = Nhom (<= 5) -> Chu de (<= 5) -> Van de (<= 5); MOI van de = 1 cau tra loi ngan (<= 4 buoc, <= 1 anh).
// Moi van de nap thanh 1 dong huong_dan trong D1 (nut "Nạp bộ hướng dẫn", tu_khoa bat dau "#<ma>") - Mua hang sua trong app; may KTV
// giu ban sao (cache TINH_QUERY "huong-dan", chi tai lai khi noi dung doi). Kho chua nap thi dung noi dung file nay + anh /huong-dan-goi/*.
// Noi dung la du lieu nghiep vu (khong dich), nhan giao dien cua cay (nhanh 1/3/4) dich o HoiNhanh.tsx.

export interface VanDe {
  ma: string;
  hoi: string;
  buoc: string[];
  anh?: string[];
  xemThem?: string[];
  tuKhoa?: string;
}
export interface ChuDe { ma: string; ten: string; vanDe: VanDe[] }
export interface NhomHd { ma: string; ten: string; icon: string; chuDe: ChuDe[] }

export const NHOM_HUONG_DAN: NhomHd[] = [
  {
    ma: "2.1", ten: "Đặt hàng", icon: "🛒",
    chuDe: [
      {
        ma: "2.1.1", ten: "Tạo đơn mới",
        vanDe: [
          { ma: "2.1.1a", hoi: "Mở màn tạo đơn ở đâu?", anh: ["nut-tao-don"], tuKhoa: "tạo đơn, đặt hàng, nút tạo đơn",
            buoc: ["Ở Trang chủ hoặc màn Đơn hàng, bấm nút xanh **＋ Tạo đơn** ở trên cùng.", "Trên điện thoại màn tạo đơn mở toàn màn hình; trên máy tính mở dạng hộp."], xemThem: ["2.1.1b", "2.1.1c"] },
          { ma: "2.1.1b", hoi: "Tìm và chọn linh kiện thế nào?", anh: ["tim-lk"], tuKhoa: "tìm linh kiện, chọn linh kiện, mã linh kiện",
            buoc: ["Bấm ô **Mã linh kiện**, gõ mã hoặc tên (không cần dấu, gõ sai 1 chữ vẫn ra gợi ý).", "Bấm vào linh kiện đúng trong danh sách gợi ý.", "Ô còn trống thì app hiện sẵn \"Chọn gần đây\" / \"Hay đặt\" để chọn nhanh."], xemThem: ["2.1.4e", "1.5"] },
          { ma: "2.1.1c", hoi: "Đặt nhiều linh kiện trong 1 lần?", anh: ["form-2-dong"], tuKhoa: "nhiều linh kiện, thêm dòng, tạo nhiều đơn",
            buoc: ["Điền xong dòng 1 (linh kiện, loại đề xuất, số lượng).", "Bấm **+ Thêm dòng** (hoặc **+ Dòng** ở trên cùng) rồi điền dòng tiếp theo.", "Các dòng đã điền thu gọn thành ô số 1 ✓, 2 ✓… bấm vào để sửa lại.", "Bấm **Tạo N đơn** — mỗi dòng thành 1 đơn riêng."], xemThem: ["2.1.1d"] },
          { ma: "2.1.1d", hoi: "Bấm Tạo đơn xong thì đơn đi đâu?", anh: ["ket-qua"], tuKhoa: "kết quả đặt hàng, tự động duyệt, đặt tiếp",
            buoc: ["Kho còn đủ hàng → đơn **tự động duyệt** và vào phiếu xuất.", "Kho thiếu hàng → app hỏi **Đặt tiếp / Quay lại**; đặt tiếp thì đơn \"Chờ thanh toán\" hoặc \"Chờ hàng\".", "Hộp **Kết quả đặt hàng** ghi rõ từng đơn đi đâu và vì sao — bấm **Đã hiểu** để đóng."], xemThem: ["2.2.2a", "2.2.2b"] },
          { ma: "2.1.1e", hoi: "Đơn đang soạn bị mất — mở lại thế nào?", tuKhoa: "mất đơn, nháp, tải lại trang, đơn tạo dở",
            buoc: ["App tự lưu đơn đang soạn trên máy 3 ngày (cả ảnh đã tải).", "Mở lại **＋ Tạo đơn** → app hỏi **Mở lại đơn tạo dở?** → chọn mở để soạn tiếp.", "Đóng form khi còn nội dung: chọn **Lưu lại cho lần sau** để giữ nháp."] },
        ],
      },
      {
        ma: "2.1.2", ten: "Chọn loại đề xuất",
        vanDe: [
          { ma: "2.1.2a", hoi: "Mua hàng khác Mua hàng có ID thế nào?", anh: ["chon-loai"], tuKhoa: "mua hàng, mua hàng có id, loại đề xuất",
            buoc: ["**MUA HÀNG**: mua linh kiện để sửa / bán, phải chuyển tiền.", "**MUA HÀNG CÓ ID**: như Mua hàng nhưng gắn với 1 ca — bắt buộc nhập Mã YCSC hoặc mã Lada."], xemThem: ["2.1.3a"] },
          { ma: "2.1.2b", hoi: "Khi nào chọn Công nợ / Hỗ trợ?", tuKhoa: "công nợ, hỗ trợ, ký gửi, bảo hành",
            buoc: ["**CÔNG NỢ**: lấy linh kiện ký gửi, ghi vào công nợ, không chuyển tiền.", "Loại có chữ **HỖ TRỢ** (bảo hành): bắt buộc **Mã YCSC**.", "Đơn công nợ vượt trần công nợ sẽ chờ Giám sát duyệt."], xemThem: ["2.5.2b", "2.1.4c"] },
          { ma: "2.1.2c", hoi: "Trừ công nợ dùng khi nào?", tuKhoa: "trừ công nợ, giảm công nợ",
            buoc: ["Dùng khi muốn **mua lại linh kiện đang giữ công nợ** để giảm công nợ.", "Chỉ đặt được khi **tồn kho của chính bạn** còn đủ linh kiện đó.", "Có chuyển tiền như đơn mua; Kế toán duyệt tiền xong thì công nợ giảm."], xemThem: ["2.1.4d"] },
          { ma: "2.1.2d", hoi: "Mua dự trữ là gì?", tuKhoa: "mua dự trữ, giá dự phòng, hạn mức",
            buoc: ["**MUA DỰ TRỮ**: mua linh kiện để dự trữ sẵn.", "Có thể được tính **giá dự phòng** nếu còn trong hạn mức dự trữ Kế toán cấp cho bạn.", "Vẫn chuyển tiền như đơn mua."] },
          { ma: "2.1.2e", hoi: "Mua hàng công nợ đối tác?", tuKhoa: "công nợ đối tác, đối tác, ghi nợ",
            buoc: ["Chỉ hiện với tài khoản được cấp (đối tác có trong danh sách).", "Đơn **ghi nợ cho đối tác**, tính giá niêm yết; KTV nhận hàng không phải chuyển tiền.", "KTV đặt cho chính mình: đối tác tự điền, không cần chọn."] },
        ],
      },
      {
        ma: "2.1.3", ten: "Thông tin thêm trên đơn",
        vanDe: [
          { ma: "2.1.3a", hoi: "Nhập Mã YCSC / mã Lada ở đâu?", tuKhoa: "mã ycsc, mã yêu cầu sự cố, mã lada, case",
            buoc: ["Trong dòng đơn, bấm **+ Thông tin bổ sung** để mở các ô thêm.", "Nhập **Mã yêu cầu sự cố** (mã case) hoặc **Mã Lada**.", "Gõ đúng mã thì app hiện thẻ thông tin ca để bạn kiểm tra."], xemThem: ["2.1.4c"] },
          { ma: "2.1.3b", hoi: "Khách cần hóa đơn thì chọn gì?", tuKhoa: "hóa đơn, yêu cầu hóa đơn, giá niêm yết",
            buoc: ["Mở **+ Thông tin bổ sung** → chọn ô **Yêu cầu hóa đơn**.", "Đơn có yêu cầu hóa đơn tính **giá niêm yết** (không chiết khấu), trừ loại \"Xuất cho Trạm\"."], xemThem: ["2.3.1c"] },
          { ma: "2.1.3c", hoi: "Đánh dấu đơn gấp (ưu tiên ⭐)?", tuKhoa: "ưu tiên, đơn gấp, vip",
            buoc: ["Tích ô **Ưu tiên** ở đầu dòng đơn.", "Khi hàng về, đơn ưu tiên được cấp hàng trước các đơn tạo cùng ngày."] },
          { ma: "2.1.3d", hoi: "Đặt cho khách lẻ?", tuKhoa: "khách lẻ, số điện thoại khách, kh lẻ",
            buoc: ["Ở ô **Người nhận hàng** chọn tài khoản **KH lẻ MB / KH lẻ MN**.", "Nhập **SĐT khách hàng lẻ** — mỗi số điện thoại là 1 khách riêng.", "Khách lẻ tính giá niêm yết."] },
          { ma: "2.1.3e", hoi: "Đặt combo linh kiện?", tuKhoa: "combo, bộ linh kiện",
            buoc: ["Gõ mã / tên combo ở ô Mã linh kiện, chọn như 1 linh kiện (có biểu tượng 🧩).", "Khi tạo đơn, hệ thống tách combo thành từng đơn linh kiện thành phần."] },
        ],
      },
      {
        ma: "2.1.4", ten: "Không tạo được đơn",
        vanDe: [
          { ma: "2.1.4a", hoi: "Báo \"chưa có Mã MISA\"?", tuKhoa: "chưa có mã misa, không tạo được đơn, khóa nút",
            buoc: ["KTV nhận hàng chưa được khai báo **Mã MISA** nên chưa đặt hàng được.", "Liên hệ Kế toán / văn phòng để bổ sung Mã MISA, rồi tạo lại đơn."] },
          { ma: "2.1.4b", hoi: "Linh kiện giá 0đ, không đặt được?", tuKhoa: "giá 0, chưa có giá, không đặt được",
            buoc: ["Linh kiện chưa có giá bán nên đơn mua bị chặn.", "Hỏi nhân viên Mua hàng cập nhật giá (chọn **💬 Vẫn cần hỏi Mua hàng** bên dưới)."] },
          { ma: "2.1.4c", hoi: "Báo thiếu Mã YCSC?", tuKhoa: "thiếu mã ycsc, hỗ trợ, mua hàng có id",
            buoc: ["Loại đề xuất có chữ **HỖ TRỢ** hoặc **MUA HÀNG CÓ ID** bắt buộc mã ca.", "Mở **+ Thông tin bổ sung** → nhập Mã YCSC (hoặc Mã Lada)."], xemThem: ["2.1.3a"] },
          { ma: "2.1.4d", hoi: "Trừ công nợ báo không đủ tồn?", tuKhoa: "trừ công nợ, không đủ tồn, tồn kho ktv",
            buoc: ["Đơn Trừ công nợ chỉ đặt được khi **tồn kho của bạn** (file MISA) còn đủ linh kiện đó.", "Kiểm tra tồn ở menu **Công nợ**; không đủ thì đặt loại Mua hàng."], xemThem: ["2.5.2a"] },
          { ma: "2.1.4e", hoi: "Linh kiện báo \"Cấm bán\"?", tuKhoa: "cấm bán, không bán",
            buoc: ["\"Cấm bán\" chỉ là **cảnh báo** — vẫn đặt được.", "Hãy kiểm tra lại đúng linh kiện cần đặt trước khi tạo đơn."] },
        ],
      },
      {
        ma: "2.1.5", ten: "Trả hàng",
        vanDe: [
          { ma: "2.1.5a", hoi: "Tạo đơn trả hàng thế nào?", anh: ["tra-hang"], tuKhoa: "trả hàng, trả linh kiện",
            buoc: ["Bấm **＋ Tạo đơn**, chọn linh kiện cần trả.", "Ở Loại đề xuất bấm **khác…** → chọn loại **TRẢ HÀNG …**.", "Nhập số lượng, tải ảnh, bấm **Tạo đơn**."], xemThem: ["2.1.5b", "2.1.5c"] },
          { ma: "2.1.5b", hoi: "Chụp / tải ảnh linh kiện trả?", anh: ["tra-hang"], tuKhoa: "ảnh trả hàng, chụp ảnh",
            buoc: ["Chọn loại TRẢ HÀNG thì hiện ô **Ảnh linh kiện cần trả \\***.", "Bấm **+ Thêm ảnh** — mỗi dòng cần **1–3 ảnh**.", "Mở camera mà app tải lại trang: đơn đang soạn vẫn được giữ (mở lại đơn tạo dở)."], xemThem: ["2.5.4b"] },
          { ma: "2.1.5c", hoi: "Đơn trả hàng qua những bước duyệt nào?", tuKhoa: "duyệt trả hàng, kế toán, kho, qc",
            buoc: ["Chờ Kế toán duyệt → Chờ Kho xác nhận → Chờ QC xác nhận.", "QC đồng ý: đơn được duyệt và gom vào **phiếu trả hàng**."], xemThem: ["2.1.5d"] },
          { ma: "2.1.5d", hoi: "Gửi hàng trả về kho?", tuKhoa: "gửi hàng trả, kho nhận hàng trả",
            buoc: ["Khi đơn đã vào phiếu trả hàng, gửi linh kiện về kho theo hướng dẫn của văn phòng.", "Kho nhận đủ thì bấm \"Kho đã nhận hàng trả\" — phiếu kết thúc.", "Kho có thể sửa **SL thực tế nhận về** nếu khác số bạn khai."] },
        ],
      },
    ],
  },
  {
    ma: "2.2", ten: "Theo dõi đơn & phiếu", icon: "🔎",
    chuDe: [
      {
        ma: "2.2.1", ten: "Tìm đơn",
        vanDe: [
          { ma: "2.2.1a", hoi: "Sao danh sách không thấy đơn đã duyệt?", anh: ["loc-con-ton"], tuKhoa: "không thấy đơn, còn tồn, lọc",
            buoc: ["Danh sách mặc định lọc **Còn tồn** = đơn còn đang chờ duyệt.", "Bấm **✕** ở chip **Còn tồn** để xem tất cả đơn (cả đã duyệt, chờ hàng)."], xemThem: ["2.2.1b"] },
          { ma: "2.2.1b", hoi: "Tìm theo mã đơn / mã linh kiện / Mã YCSC?", anh: ["tim-don"], tuKhoa: "tìm đơn, mã đơn, tìm kiếm",
            buoc: ["Vào **Đơn hàng**, gõ vào ô tìm (viền xanh).", "Gõ được: mã đơn DDH-…, mã / tên linh kiện, Mã YCSC, mã Lada, mã phiếu PMH-…", "Khi gõ, app tìm trên mọi trạng thái."] },
          { ma: "2.2.1c", hoi: "Lọc đơn theo trạng thái?", anh: ["muc-con-cho-hang"], tuKhoa: "lọc trạng thái, chờ hàng, chờ thanh toán",
            buoc: ["Bấm các mục ở hàng trên cùng: **Tổng · Chờ TBP · Chờ GS duyệt · Chờ thanh toán · Chờ hàng · Từ chối…**", "Số nhỏ cạnh mục là số đơn đang ở bước đó."] },
        ],
      },
      {
        ma: "2.2.2", ten: "Đơn đang ở trạng thái nào?",
        vanDe: [
          { ma: "2.2.2a", hoi: "\"Chờ thanh toán\" nghĩa là gì?", anh: ["don-cho-tt"], tuKhoa: "chờ thanh toán, thiếu hàng, chuyển tiền trước",
            buoc: ["Kho đang thiếu hàng và đơn phải trả tiền → cần **chuyển tiền trước**.", "Đơn đã vào phiếu: mở phiếu, chuyển khoản và bấm **Đã chuyển**.", "Kế toán xác nhận tiền xong: kho đủ thì tự duyệt, vẫn thiếu thì sang Chờ hàng (tiền đi theo đơn)."], xemThem: ["2.3.3b", "2.3.3c"] },
          { ma: "2.2.2b", hoi: "\"Chờ hàng\" nghĩa là gì?", anh: ["don-cho-hang"], tuKhoa: "chờ hàng, kho hết hàng",
            buoc: ["Kho chưa có hàng — Kho / Mua hàng đang xử lý.", "Hàng về: đơn **tự duyệt** và vào phiếu.", "Xem ngày dự kiến trong chi tiết đơn hoặc mục **Thiếu hàng**."], xemThem: ["2.2.5a", "2.2.5b"] },
          { ma: "2.2.2c", hoi: "\"Chờ GS duyệt\" / \"Chờ TBP\" là gì?", tuKhoa: "chờ gs duyệt, vượt trần, chờ tbp, đặc thù",
            buoc: ["**Chờ GS duyệt**: đơn công nợ vượt trần công nợ — chờ Giám sát khu vực duyệt.", "**Chờ TBP DVBH xác nhận**: linh kiện đặc thù — chờ Trưởng bộ phận xác nhận."], xemThem: ["2.5.2b"] },
          { ma: "2.2.2d", hoi: "Đơn đã duyệt mà chưa có phiếu?", tuKhoa: "chờ tạo phiếu, đã duyệt chưa có phiếu",
            buoc: ["Cột Phiếu xuất kho hiện **Chờ tạo phiếu**: đơn đang chờ gom vào phiếu (thường tự động ngay).", "Lâu chưa có phiếu: hỏi Tác nghiệp / văn phòng."] },
          { ma: "2.2.2e", hoi: "Đơn bị từ chối — xem lý do ở đâu?", tuKhoa: "từ chối, lý do từ chối, bị hủy",
            buoc: ["Mở chi tiết đơn → khung đầu ghi **Lý do** và người xử lý.", "Trang chủ có thẻ **Đơn bị từ chối** để xem nhanh.", "Bị từ chối nhầm: Tác nghiệp có thể **đẩy lại** đơn trong 24 giờ."] },
        ],
      },
      {
        ma: "2.2.3", ten: "Xem phiếu xuất",
        vanDe: [
          { ma: "2.2.3a", hoi: "Phiếu xuất là gì, đơn nằm ở phiếu nào?", tuKhoa: "phiếu xuất, pmh, đơn nằm phiếu nào",
            buoc: ["Đơn được tự gom vào **phiếu xuất kho** (mã PMH-…) của người nhận; 1 phiếu có nhiều đơn.", "Chuyển tiền, giao hàng, nhận hàng đều làm **theo phiếu**.", "Mã phiếu của đơn: xem dòng **Mã xuất kho** trong chi tiết đơn."], xemThem: ["2.2.3b"] },
          { ma: "2.2.3b", hoi: "Mở chi tiết phiếu?", anh: ["ds-phieu"], tuKhoa: "mở phiếu, chi tiết phiếu, danh sách phiếu",
            buoc: ["Vào **Phiếu xuất** (thanh dưới trên điện thoại).", "Chọn mục cần xem (Chờ chuyển tiền, Chờ KTV nhận…), bấm vào dòng phiếu.", "Bấm ▼ ở đầu dòng để xem nhanh các đơn trong phiếu."], xemThem: ["2.2.3c"] },
          { ma: "2.2.3c", hoi: "Đọc thanh tiến trình 5 bước?", anh: ["tien-trinh-phieu"], tuKhoa: "tiến trình phiếu, 5 bước",
            buoc: ["**1 Tạo phiếu** (lo tiền) → **2 Kế toán** → **3 Chốt xong** (kho soạn) → **4 Gửi KTV** → **5 KTV nhận**.", "Bước đã xong có dấu ✓, bước hiện tại tô xanh."], xemThem: ["2.2.4a", "2.2.4d"] },
        ],
      },
      {
        ma: "2.2.4", ten: "Phiếu đang ở bước nào?",
        vanDe: [
          { ma: "2.2.4a", hoi: "Đang tạo phiếu — chờ chuyển tiền?", anh: ["phieu-cho-tien"], tuKhoa: "đang tạo phiếu, chờ ktv chuyển",
            buoc: ["Phiếu còn tiền phải chuyển (trạng thái **Chờ KTV chuyển**).", "Chuyển khoản, tải ảnh, bấm **Đã chuyển** để Kế toán xác nhận."], xemThem: ["2.3.3b", "2.3.3c"] },
          { ma: "2.2.4b", hoi: "Chờ Kế toán / chờ mã MISA?", tuKhoa: "chờ kế toán, chờ mã misa",
            buoc: ["Tiền đã đủ; Kế toán đang làm chứng từ MISA.", "Bạn không cần làm gì — chờ phiếu sang bước Kho."] },
          { ma: "2.2.4c", hoi: "Kho đang soạn / in phiếu?", tuKhoa: "chốt xong đơn xuất, chờ kho in, kho đã in",
            buoc: ["Phiếu \"Đã chốt xong đơn xuất\" / \"Chờ kho in\" / \"Kho đã in\": Kho đang soạn và đóng hàng.", "Kho gửi đi thì phiếu sang **Đang gửi KTV**."] },
          { ma: "2.2.4d", hoi: "Đang gửi KTV?", anh: ["nhan-hang"], tuKhoa: "đang gửi ktv, hàng đang tới",
            buoc: ["Hàng đã gửi đi cho bạn.", "Nhận hàng, kiểm tra, rồi bấm **📥 KTV đã nhận** (hoặc **⚠ Báo nhận thiếu**)."], xemThem: ["2.4.1a", "2.4.2a"] },
          { ma: "2.2.4e", hoi: "Đã nhận / kết thúc / bị hủy?", tuKhoa: "ktv đã nhận, kho kết thúc, phiếu hủy, hàng trừ kho",
            buoc: ["**KTV đã nhận / Kho đã kết thúc / Hàng trừ kho**: phiếu đã xong.", "**Đã hủy**: tiền đã trả về quỹ dư hoặc đi theo đơn sang phiếu khác."], xemThem: ["2.5.1a"] },
        ],
      },
      {
        ma: "2.2.5", ten: "Đơn chờ hàng",
        vanDe: [
          { ma: "2.2.5a", hoi: "Xem ngày dự kiến có hàng?", anh: ["ticket"], tuKhoa: "ngày dự kiến, bao giờ có hàng, ngày về",
            buoc: ["Mở chi tiết đơn \"Chờ hàng\" → dòng **Dự kiến có hàng**.", "Hoặc vào mục **Thiếu hàng**, bấm vào ticket để xem ngày dự kiến và Kho xử lý tới đâu."], },
          { ma: "2.2.5b", hoi: "Hàng về thì đơn đi tiếp thế nào?", tuKhoa: "hàng về, tự duyệt",
            buoc: ["Kho xác nhận hàng về → đơn **tự duyệt** và vào phiếu xuất.", "Tiền đã trả của đơn đi theo đơn sang phiếu.", "Cấp hàng ưu tiên: ca khiếu nại → đơn cũ hơn → đơn ưu tiên ⭐."] },
          { ma: "2.2.5c", hoi: "Kho từ chối / Mua hàng không mua được?", tuKhoa: "kho từ chối, không mua được, đơn tự hủy",
            buoc: ["Đơn **tự hủy**, có ghi lý do trong chi tiết đơn.", "Tiền đã trả của đơn về **quỹ dư** của bạn."], xemThem: ["2.5.1a"] },
        ],
      },
    ],
  },
  {
    ma: "2.3", ten: "Tiền & thanh toán", icon: "💰",
    chuDe: [
      {
        ma: "2.3.1", ten: "Giá phải trả",
        vanDe: [
          { ma: "2.3.1a", hoi: "Chiết khấu theo tổng đặt trong ngày?", anh: ["trang-chu-tien"], tuKhoa: "chiết khấu, 200k, 500k, giá ktv, tổng ngày",
            buoc: ["Tính theo **tổng giá bán các đơn đặt trong ngày** của bạn:", "Dưới 200.000đ: giá bán · 200.000–500.000đ: 70% giá bán · Từ 500.000đ: **giá KTV**.", "Linh kiện \"Đình tủ\" luôn 85% giá bán.", "Mức đang đạt hiện ở khối **ĐẶT HÀNG HÔM NAY** (Trang chủ)."], xemThem: ["2.3.1b"] },
          { ma: "2.3.1b", hoi: "Sao tiền trên phiếu tự thay đổi?", tuKhoa: "tiền phiếu thay đổi, tính lại giá",
            buoc: ["Đặt thêm / hủy đơn trong ngày làm đổi mức chiết khấu → phiếu chưa được Kế toán duyệt tiền tự tính lại.", "Có đơn thêm vào / rời khỏi phiếu cũng làm tổng phiếu đổi.", "Phần đã trả thừa vào **quỹ dư**."], xemThem: ["2.5.1a"] },
          { ma: "2.3.1c", hoi: "Khi nào tính giá niêm yết (không chiết khấu)?", tuKhoa: "giá niêm yết, không chiết khấu",
            buoc: ["Đơn có **yêu cầu hóa đơn** (trừ loại Xuất cho Trạm).", "Đơn **khách lẻ** và đơn **công nợ đối tác**.", "Giá chốt tay của văn phòng (nếu có) luôn được ưu tiên."] },
        ],
      },
      {
        ma: "2.3.2", ten: "Xem số tiền cần chuyển",
        vanDe: [
          { ma: "2.3.2a", hoi: "Xem trong phiếu (khối Chuyển tiền)?", anh: ["phieu-cho-tien"], tuKhoa: "tiền cần chuyển, còn phải chuyển, khối chuyển tiền",
            buoc: ["Mở phiếu → khối **CHUYỂN TIỀN** (trên điện thoại nằm ngay đầu).", "**Còn phải chuyển** = số tiền bạn cần chuyển khoản.", "Có **Quỹ dư** thì app tự trừ vào phiếu trước."], xemThem: ["2.3.3a"] },
          { ma: "2.3.2b", hoi: "Xem nhanh ở Trang chủ?", anh: ["trang-chu-tien"], tuKhoa: "ước tính chuyển, trang chủ",
            buoc: ["Khối **ĐẶT HÀNG HÔM NAY**: Tổng đặt trong ngày · **Ước tính chuyển** · Quỹ dư.", "Thẻ **Chờ tiền**: bấm số để mở danh sách phiếu cần chuyển."] },
          { ma: "2.3.2c", hoi: "Đơn công nợ có phải chuyển tiền không?", tuKhoa: "công nợ có chuyển tiền không, không cần chuyển",
            buoc: ["Không. Đơn công nợ / hỗ trợ / trả hàng không phải chuyển tiền (cột Chuyển tiền ghi **Không cần chuyển**).", "Chỉ đơn Mua / Mua dự trữ / Trừ công nợ phải chuyển."] },
        ],
      },
      {
        ma: "2.3.3", ten: "Chuyển khoản & tải ảnh",
        vanDe: [
          { ma: "2.3.3a", hoi: "Chuyển khoản ghi nội dung gì?", tuKhoa: "nội dung chuyển khoản, số tài khoản",
            buoc: ["Chuyển đúng số **Còn phải chuyển** vào tài khoản công ty (theo thông tin công ty đã thông báo).", "Nội dung nên ghi **mã phiếu PMH-…** để Kế toán đối chiếu nhanh."], xemThem: ["2.3.3b"] },
          { ma: "2.3.3b", hoi: "Tải ảnh bằng chứng thế nào?", anh: ["phieu-da-tai-anh"], tuKhoa: "tải ảnh chuyển khoản, up ảnh, bằng chứng",
            buoc: ["Mở phiếu → khối CHUYỂN TIỀN → bấm **⬆ Chọn ảnh**.", "Chọn ảnh chụp màn hình chuyển khoản thành công (tối đa 5 ảnh/phiếu, ảnh sau bấm **+ Thêm ảnh**).", "Dòng **Đọc từ ảnh** là số tiền app đọc được — chỉ để kiểm tra."], xemThem: ["2.3.3c"] },
          { ma: "2.3.3c", hoi: "Bấm \"Đã chuyển\" để báo Kế toán?", anh: ["phieu-da-chuyen"], tuKhoa: "đã chuyển, xác nhận chuyển tiền",
            buoc: ["Sau khi tải ảnh, bấm **Đã chuyển**.", "Trạng thái đổi thành **KTV đã chuyển** — chờ Kế toán xác nhận.", "Chưa bấm thì Kế toán **không nhận được** yêu cầu; đóng phiếu app sẽ nhắc."], xemThem: ["2.3.4a", "2.3.5a"] },
          { ma: "2.3.3d", hoi: "Chuyển nhiều lần cho 1 phiếu?", tuKhoa: "chuyển bổ sung, chuyển nhiều lần",
            buoc: ["Chuyển thêm phần còn thiếu, thêm ảnh của lần chuyển mới.", "Bấm **Đã chuyển** lại — ảnh cũ vẫn giữ."] },
          { ma: "2.3.3e", hoi: "Người khác chuyển giúp được không?", tuKhoa: "chuyển giúp, đặt hộ, giám sát chuyển",
            buoc: ["Được. Người tạo đơn hộ hoặc Giám sát của đơn tải ảnh và bấm **Đã chuyển** thay KTV được."] },
        ],
      },
      {
        ma: "2.3.4", ten: "Sau khi chuyển tiền",
        vanDe: [
          { ma: "2.3.4a", hoi: "Kế toán xác nhận đủ tiền?", tuKhoa: "kế toán duyệt, đã thanh toán",
            buoc: ["Phiếu sang **Kế toán đã duyệt**, đơn hiện **Đã thanh toán**.", "Kết quả báo qua 🔔 chuông và xem ở **Quỹ & chuyển tiền**."] },
          { ma: "2.3.4b", hoi: "Chuyển thiếu thì sao?", tuKhoa: "chuyển thiếu, còn thiếu",
            buoc: ["Phiếu quay về **Chờ KTV chuyển** với số còn thiếu.", "Chuyển thêm, thêm ảnh, bấm **Đã chuyển** lại."], xemThem: ["2.3.3d"] },
          { ma: "2.3.4c", hoi: "Chuyển thừa thì tiền đi đâu?", tuKhoa: "chuyển thừa, dư tiền",
            buoc: ["Phần dư vào **quỹ dư** của bạn.", "Quỹ dư tự trừ cho phiếu chờ tiền cũ nhất lần sau."], xemThem: ["2.5.1a"] },
          { ma: "2.3.4d", hoi: "Bị từ chối ảnh bằng chứng?", tuKhoa: "từ chối bằng chứng, kế toán từ chối",
            buoc: ["Phiếu về **Chờ KTV chuyển**, **lý do** hiện ngay ở khối Chuyển tiền.", "Sửa theo lý do (thêm / đổi ảnh), bấm **Đã chuyển** lại."], xemThem: ["2.3.5a"] },
          { ma: "2.3.4e", hoi: "Đã chuyển mà phiếu vẫn \"Chờ KTV chuyển\"?", tuKhoa: "vẫn chờ ktv chuyển, chưa nhận tiền",
            buoc: ["Kiểm tra đã bấm **Đã chuyển** chưa.", "Đã bấm: có thể Kế toán xác nhận thiếu hoặc từ chối — xem lý do ở khối Chuyển tiền và Lịch sử xử lý."], xemThem: ["2.3.4b", "2.3.4d"] },
        ],
      },
      {
        ma: "2.3.5", ten: "Up nhầm ảnh",
        vanDe: [
          { ma: "2.3.5a", hoi: "Sửa / hủy ảnh khi Kế toán chưa duyệt?", anh: ["phieu-da-chuyen"], tuKhoa: "up nhầm ảnh, sửa ảnh, hủy ảnh",
            buoc: ["Mở phiếu → bấm **↩ Sửa / hủy ảnh bằng chứng**.", "Bấm ✕ trên ảnh sai, thêm ảnh đúng.", "Bấm **Đã chuyển** lại."] },
          { ma: "2.3.5b", hoi: "Kế toán đã duyệt rồi thì sao?", tuKhoa: "kế toán đã duyệt, sửa sau duyệt",
            buoc: ["Không tự sửa được nữa — liên hệ Kế toán để sửa / hủy khoản đã duyệt."] },
        ],
      },
    ],
  },
  {
    ma: "2.4", ten: "Nhận hàng & hủy đơn", icon: "📦",
    chuDe: [
      {
        ma: "2.4.1", ten: "Nhận hàng",
        vanDe: [
          { ma: "2.4.1a", hoi: "Xác nhận đã nhận hàng?", anh: ["nhan-hang"], tuKhoa: "nhận hàng, ktv đã nhận, xác nhận nhận hàng",
            buoc: ["Phiếu ở **Đang gửi KTV**: nhận hàng, kiểm tra đủ số lượng.", "Mở phiếu → bấm **📥 KTV đã nhận** ở chân phiếu."], xemThem: ["2.4.2a"] },
          { ma: "2.4.1b", hoi: "Không bấm thì hệ thống tự xác nhận khi nào?", tuKhoa: "tự xác nhận, 10 ngày",
            buoc: ["Sau **10 ngày** kể từ khi hàng gửi đi mà chưa xác nhận và không báo thiếu, hệ thống tự xác nhận đã nhận.", "Hạn ghi ở khối **NHẬN HÀNG** trong phiếu; app nhắc mỗi sáng."] },
        ],
      },
      {
        ma: "2.4.2", ten: "Nhận thiếu / sai / hỏng",
        vanDe: [
          { ma: "2.4.2a", hoi: "Báo nhận thiếu thế nào?", anh: ["bao-thieu"], tuKhoa: "nhận thiếu, thiếu hàng, hàng hỏng, sai hàng",
            buoc: ["Mở phiếu **Đang gửi KTV** → bấm **⚠ Báo nhận thiếu**.", "Chọn lý do, nhập **SL thực nhận** từng dòng, thêm ảnh và mô tả.", "Bấm **Gửi báo cáo**."], xemThem: ["2.4.2b"] },
          { ma: "2.4.2b", hoi: "Kho xử lý báo cáo ra sao?", tuKhoa: "kho kiểm tra, gửi bù, hoàn tiền",
            buoc: ["Kho kiểm tra: xác nhận thiếu → **gửi bù** hoặc **hoàn tiền về quỹ**.", "Kho từ chối (kèm ghi chú) → phiếu chờ bạn xác nhận nhận hàng lại."] },
          { ma: "2.4.2c", hoi: "Rút lại báo cáo gửi nhầm?", tuKhoa: "rút lại báo cáo",
            buoc: ["Khi Kho chưa xử lý: mở phiếu → khối Nhận hàng → bấm **Rút lại báo cáo**."] },
        ],
      },
      {
        ma: "2.4.3", ten: "Hủy đơn",
        vanDe: [
          { ma: "2.4.3a", hoi: "Cách hủy đơn?", anh: ["nut-huy"], tuKhoa: "hủy đơn, huỷ đơn, đặt nhầm",
            buoc: ["Mở **chi tiết đơn** (nút hủy không có ở danh sách).", "Bấm **✕ Hủy đơn** (viền đỏ, góc dưới).", "Nhập **lý do hủy** → bấm **Xác nhận hủy**."], xemThem: ["2.4.3b", "2.4.4a"] },
          { ma: "2.4.3b", hoi: "Tiền của đơn đã hủy đi đâu?", anh: ["da-huy"], tuKhoa: "tiền đơn hủy, hoàn tiền",
            buoc: ["Tiền đã trả của đơn tự về **quỹ dư** của người nhận hàng.", "Quỹ dư tự trừ cho phiếu chờ tiền sau."], xemThem: ["2.5.1a"] },
          { ma: "2.4.3c", hoi: "Hủy nhầm thì làm sao?", tuKhoa: "hủy nhầm, khôi phục đơn",
            buoc: ["Đơn bạn tự hủy: tạo lại đơn mới.", "Đơn bị người khác hủy / từ chối nhầm: Tác nghiệp có thể **đẩy lại** trong 24 giờ."] },
        ],
      },
      {
        ma: "2.4.4", ten: "Không hủy được đơn",
        vanDe: [
          { ma: "2.4.4a", hoi: "Không thấy nút Hủy?", tuKhoa: "không thấy nút hủy",
            buoc: ["Nút **✕ Hủy đơn** chỉ có trong **chi tiết đơn** — bấm vào đơn để mở.", "Vẫn không có: đơn đã qua bước được tự hủy (xem các trường hợp còn lại)."] },
          { ma: "2.4.4b", hoi: "Đơn chờ hàng, Kho đã tiếp nhận?", anh: ["don-cho-hang-khoa"], tuKhoa: "chờ hàng không hủy được, kho đã tiếp nhận",
            buoc: ["Kho / Mua hàng đang đặt hàng cho bạn nên KTV không tự hủy được.", "Nhắn Kho / Mua hàng để họ hủy (chọn **💬 Vẫn cần hỏi Mua hàng**)."] },
          { ma: "2.4.4c", hoi: "Phiếu đã được Kế toán duyệt tiền?", tuKhoa: "kế toán đã duyệt không hủy được",
            buoc: ["Tiền và chứng từ đã chốt — liên hệ Tác nghiệp / Kế toán để hủy."] },
          { ma: "2.4.4d", hoi: "Đơn do người khác đặt hộ?", tuKhoa: "đặt hộ không hủy được",
            buoc: ["Bạn là người nhận, không phải người tạo đơn.", "Nhờ người tạo đơn hoặc Giám sát khu vực hủy hộ."] },
          { ma: "2.4.4e", hoi: "Hàng đã gửi đi?", tuKhoa: "đã gửi hàng, không hủy được",
            buoc: ["Phiếu đang gửi / đã nhận thì không hủy đơn được.", "Hàng thiếu / sai: dùng **Báo nhận thiếu**; không dùng: tạo đơn **Trả hàng**."], xemThem: ["2.4.2a", "2.1.5a"] },
        ],
      },
    ],
  },
  {
    ma: "2.5", ten: "Quỹ, công nợ & tài khoản", icon: "👤",
    chuDe: [
      {
        ma: "2.5.1", ten: "Quỹ dư",
        vanDe: [
          { ma: "2.5.1a", hoi: "Quỹ dư là gì?", tuKhoa: "quỹ dư, tiền thừa",
            buoc: ["Là tiền bạn chuyển thừa, hoặc tiền hoàn lại khi đơn bị hủy / giảm giá.", "Quỹ dư **tự trừ** cho phiếu chờ tiền cũ nhất của bạn."], xemThem: ["2.5.1b", "2.5.1c"] },
          { ma: "2.5.1b", hoi: "Xem quỹ ở đâu?", anh: ["quy"], tuKhoa: "xem quỹ, quỹ chuyển tiền",
            buoc: ["Menu **Quỹ & chuyển tiền** (điện thoại: **Thêm** → Quỹ & chuyển tiền).", "Xem **Quỹ dư của tôi**, **Còn phải chuyển** và các khoản Kế toán đã xác nhận."] },
          { ma: "2.5.1c", hoi: "Muốn rút tiền quỹ?", tuKhoa: "rút tiền quỹ, hoàn tiền quỹ",
            buoc: ["Liên hệ Kế toán — Kế toán tạo **phiếu hoàn tiền**.", "Bạn nhận tiền rồi bấm **Đã nhận tiền** trong phiếu hoàn tiền (Quỹ & chuyển tiền › Hoàn tiền)."] },
        ],
      },
      {
        ma: "2.5.2", ten: "Công nợ",
        vanDe: [
          { ma: "2.5.2a", hoi: "Xem công nợ của tôi?", tuKhoa: "công nợ, tồn kho ktv",
            buoc: ["Menu **Công nợ**: tồn kho linh kiện của bạn theo file MISA, công nợ phát sinh và công nợ chốt."] },
          { ma: "2.5.2b", hoi: "Vượt trần công nợ thì sao?", tuKhoa: "vượt trần, trần công nợ",
            buoc: ["Đơn công nợ làm vượt trần sẽ **Chờ GS duyệt** (Giám sát nhập mã EO khi duyệt).", "Muốn đặt ngay: đặt loại Mua hàng (chuyển tiền)."] },
        ],
      },
      {
        ma: "2.5.3", ten: "Tài khoản",
        vanDe: [
          { ma: "2.5.3a", hoi: "Đăng nhập bằng Gmail nào?", anh: ["dang-nhap"], tuKhoa: "đăng nhập, gmail, tài khoản",
            buoc: ["Bấm **Đăng nhập bằng Google**, chọn đúng Gmail đã đăng ký với công ty.", "Có 2 Gmail hay nhầm: nhờ Admin khai báo Gmail còn lại là **Gmail phụ**."] },
          { ma: "2.5.3b", hoi: "Tài khoản bị khóa / không vào được?", tuKhoa: "bị khóa, không đăng nhập được, chờ duyệt",
            buoc: ["Mã KTV có thể đang bị tắt, hoặc Gmail chưa được gắn mã (màn hình báo chờ duyệt).", "Liên hệ Giám sát / văn phòng / Admin để kiểm tra."] },
          { ma: "2.5.3c", hoi: "Đổi ngôn ngữ app?", anh: ["ngon-ngu"], tuKhoa: "đổi ngôn ngữ, tiếng anh, tiếng indonesia",
            buoc: ["Bấm **VI / EN / ID** (máy tính: thanh trên cùng; điện thoại: menu **Thêm**)."] },
        ],
      },
      {
        ma: "2.5.4", ten: "Thông báo & ảnh",
        vanDe: [
          { ma: "2.5.4a", hoi: "Bật thông báo trên điện thoại?", anh: ["bat-thong-bao"], tuKhoa: "thông báo, push, chuông",
            buoc: ["Bấm 🔔 → **Bật thông báo đẩy trên thiết bị này** → cho phép khi trình duyệt hỏi.", "Nên cài app vào màn hình chính (menu **Thêm** → Cài đặt vào màn hình chính)."] },
          { ma: "2.5.4b", hoi: "Báo hết lượt tải ảnh?", tuKhoa: "hết lượt tải ảnh, giới hạn ảnh",
            buoc: ["Mỗi tài khoản KTV tải tối đa **50 ảnh/ngày**.", "Thử lại ngày mai, hoặc nhờ Giám sát / văn phòng tải hộ."] },
        ],
      },
    ],
  },
];

/** Tra van de theo ma (gom ca 1.5 o nhanh linh kien). */
export const VAN_DE_THEO_MA: Map<string, { vd: VanDe; nhom: NhomHd; chuDe: ChuDe }> = new Map(
  NHOM_HUONG_DAN.flatMap((nhom) => nhom.chuDe.flatMap((chuDe) => chuDe.vanDe.map((vd) => [vd.ma, { vd, nhom, chuDe }] as const))),
);

/** Van de 1.5 (nhanh linh kien) - cung la 1 huong dan trong goi. */
export const VD_KHONG_TIM_THAY_LK: VanDe = {
  ma: "1.5", hoi: "Không tìm thấy linh kiện cần đặt?", anh: ["tim-lk"], tuKhoa: "không tìm thấy linh kiện, mã mới, chưa có mã",
  buoc: ["Gõ một phần mã hoặc tên, không cần dấu (vd \"loi ro\", \"bom 24\").", "Xem gợi ý \"Có phải bạn muốn tìm…\" và danh sách linh kiện thay thế.", "Vẫn không có: nhờ Mua hàng tạo mã mới (bấm **💬 Vẫn cần hỏi Mua hàng**)."],
};

/** Noi dung chu cua 1 van de (dung khi nap + khi chua nap). */
export function noiDungVanDe(vd: VanDe): string {
  return vd.buoc.map((b, i) => `${i + 1}. ${b.replace(/\*\*/g, "")}`).join("\n");
}

export interface MucGoi { ma: string; tieu_de: string; noi_dung: string; anh: string[]; tu_khoa: string; nhom: string; stt: number }

/** Goi "Nạp bộ hướng dẫn": moi van de = 1 huong dan. tu_khoa bat dau "#<ma>" (de cay tim theo ma). */
export function goiHuongDan(): MucGoi[] {
  const ds: MucGoi[] = [];
  let stt = 100;
  const them = (vd: VanDe, nhom: string) => {
    ds.push({ ma: vd.ma, tieu_de: vd.hoi, noi_dung: noiDungVanDe(vd), anh: vd.anh ?? [], tu_khoa: [`#${vd.ma}`, vd.tuKhoa].filter(Boolean).join(", "), nhom, stt: stt++ });
  };
  them(VD_KHONG_TIM_THAY_LK, "Linh kiện");
  for (const n of NHOM_HUONG_DAN) for (const c of n.chuDe) for (const v of c.vanDe) them(v, `${n.ten} › ${c.ten}`);
  return ds;
}

/** Ma van de ghi trong tu_khoa ("#2.1.1a, ...") -> "2.1.1a". */
export function maTuTuKhoa(tuKhoa: string | null | undefined): string | null {
  const m = /(?:^|[\s,])#(\d+(?:\.\d+)*[a-z]?)/.exec(tuKhoa ?? "");
  return m ? m[1] : null;
}
