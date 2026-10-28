# Phân luồng Hỏi đáp tự động (chat nhanh) — bản đề xuất

Cập nhật 2026-10-28. Khung của màn "💬 Hỏi nhanh" trong khung chat. Mỗi vấn đề là 1 hướng dẫn lưu trong D1 (nạp bằng nút "Nạp bộ hướng dẫn", Mua hàng sửa trong app); máy KTV giữ bản sao trong cache và chỉ tải lại khi nội dung đổi — hỏi / xem hướng dẫn không tốn lượt đọc D1.

## Nguyên tắc

- Mỗi cấp **tối đa 5 lựa chọn**.
- **Mỗi câu trả lời = đúng 1 vấn đề**: tiêu đề là chính câu hỏi của KTV, tối đa 4 bước ngắn, tối đa 1 ảnh đã cắt đúng vùng
  cần nhìn trên điện thoại. Không dồn nhiều nội dung vào 1 lần trả lời.
- Dưới mỗi câu trả lời:
  - **✓ Đã rõ**.
  - **Xem thêm**: tối đa 2 vấn đề liên quan.
  - **↩ Hỏi việc khác**.
  - **💬 Vẫn cần hỏi Mua hàng**: form điền sẵn.
- Mã vấn đề (vd `2.1.1a`) ghi trong từ khóa của hướng dẫn, nên Mua hàng sửa tiêu đề hay nội dung thì cây vẫn trỏ đúng.
  Hướng dẫn bị xoá / tắt thì nhánh đó hiện "Chưa có hướng dẫn — hỏi Mua hàng". Hội thoại đang dở lưu trên trình duyệt 7 ngày.
- KTV vẫn gõ tự do bất cứ lúc nào (gợi ý hướng dẫn + tự nhận diện mã linh kiện như hiện nay).

Ký hiệu câu trả lời:
- 📘 = hướng dẫn ngắn (kho hướng dẫn, đọc từ cache trên máy).
- 📊 = dữ liệu thật của KTV.
- 💬 = chuyển sang hỏi Mua hàng.

## Cấp 1 — "Bạn cần hỗ trợ gì?"

1. 🔩 Thắc mắc về linh kiện
2. 📘 Hướng dẫn dùng app
3. 📦 Đơn & phiếu của tôi
4. 💬 Vấn đề khác

## 1. 🔩 Thắc mắc về linh kiện (chọn mục → chọn/gõ linh kiện → 📊)

| | Lựa chọn | Trả lời |
|---|---|---|
| 1.1 | Giá linh kiện | Giá niêm yết, giá KTV, mức chiết khấu đang đạt hôm nay + Xem thêm `2.3.1a` |
| 1.2 | Còn hàng không | Tồn kho công ty từng kho (ngày file MISA), tồn kho của bạn |
| 1.3 | Bao giờ có hàng | Đơn chờ hàng của bạn với mã này + ngày dự kiến + Kho đang xử lý tới đâu; không có đơn → "Đặt đơn" / 💬 |
| 1.4 | Linh kiện thay thế | Nhóm linh kiện tương đương, giá + tồn từng mã |
| 1.5 | Không tìm thấy linh kiện | 📘 mẹo tìm → 💬 nhờ Mua hàng tạo mã |

## 2. 📘 Hướng dẫn dùng app — Nhóm → Chủ đề → Vấn đề

### 2.1 Đặt hàng

**2.1.1 Tạo đơn mới**
- a. Mở màn tạo đơn ở đâu?
- b. Tìm và chọn linh kiện thế nào?
- c. Đặt nhiều linh kiện trong 1 lần?
- d. Bấm Tạo đơn xong thì đơn đi đâu?
- e. Đơn đang soạn bị mất — mở lại thế nào?

**2.1.2 Chọn loại đề xuất**
- a. Mua hàng khác Mua hàng có ID thế nào?
- b. Khi nào chọn Công nợ / Hỗ trợ?
- c. Trừ công nợ dùng khi nào?
- d. Mua dự trữ là gì?
- e. Mua hàng công nợ đối tác?

**2.1.3 Thông tin thêm trên đơn**
- a. Nhập Mã YCSC / mã Lada ở đâu?
- b. Khách cần hóa đơn thì chọn gì?
- c. Đánh dấu đơn gấp (ưu tiên ⭐)?
- d. Đặt cho khách lẻ?
- e. Đặt combo linh kiện?

**2.1.4 Không tạo được đơn**
- a. Báo "chưa có Mã MISA"?
- b. Linh kiện giá 0đ, không đặt được?
- c. Báo thiếu Mã YCSC?
- d. Trừ công nợ báo không đủ tồn?
- e. Linh kiện báo "Cấm bán"?

**2.1.5 Trả hàng**
- a. Tạo đơn trả hàng thế nào?
- b. Chụp / tải ảnh linh kiện trả?
- c. Đơn trả hàng qua những bước duyệt nào?
- d. Gửi hàng trả về kho?

### 2.2 Theo dõi đơn & phiếu

**2.2.1 Tìm đơn**
- a. Sao danh sách không thấy đơn đã duyệt? (bỏ lọc "Còn tồn")
- b. Tìm theo mã đơn / mã linh kiện / Mã YCSC?
- c. Lọc đơn theo trạng thái?

**2.2.2 Đơn đang ở trạng thái nào?**
- a. "Chờ thanh toán" nghĩa là gì?
- b. "Chờ hàng" nghĩa là gì?
- c. "Chờ GS duyệt" / "Chờ TBP" là gì?
- d. Đơn đã duyệt mà chưa có phiếu?
- e. Đơn bị từ chối — xem lý do ở đâu?

**2.2.3 Xem phiếu xuất**
- a. Phiếu xuất là gì, đơn nằm ở phiếu nào?
- b. Mở chi tiết phiếu?
- c. Đọc thanh tiến trình 5 bước?

**2.2.4 Phiếu đang ở bước nào?**
- a. Đang tạo phiếu — chờ chuyển tiền?
- b. Chờ Kế toán / chờ mã MISA?
- c. Kho đang soạn / in phiếu?
- d. Đang gửi KTV?
- e. Đã nhận / kết thúc / bị hủy?

**2.2.5 Đơn chờ hàng**
- a. Xem ngày dự kiến có hàng?
- b. Hàng về thì đơn đi tiếp thế nào?
- c. Kho từ chối / Mua hàng không mua được?

### 2.3 Tiền & thanh toán

**2.3.1 Giá phải trả**
- a. Chiết khấu theo tổng đặt trong ngày (200k / 500k)?
- b. Sao tiền trên phiếu tự thay đổi?
- c. Khi nào tính giá niêm yết (không chiết khấu)?

**2.3.2 Xem số tiền cần chuyển**
- a. Xem trong phiếu (khối Chuyển tiền)?
- b. Xem nhanh ở Trang chủ?
- c. Đơn công nợ có phải chuyển tiền không?

**2.3.3 Chuyển khoản & tải ảnh**
- a. Chuyển khoản ghi nội dung gì?
- b. Tải ảnh bằng chứng thế nào?
- c. Bấm "Đã chuyển" để báo Kế toán?
- d. Chuyển nhiều lần cho 1 phiếu?
- e. Người khác chuyển giúp được không?

**2.3.4 Sau khi chuyển tiền**
- a. Kế toán xác nhận đủ tiền?
- b. Chuyển thiếu thì sao?
- c. Chuyển thừa thì tiền đi đâu?
- d. Bị từ chối ảnh bằng chứng?
- e. Đã chuyển mà phiếu vẫn "Chờ KTV chuyển"?

**2.3.5 Up nhầm ảnh**
- a. Sửa / hủy ảnh khi Kế toán chưa duyệt?
- b. Kế toán đã duyệt rồi thì sao?

### 2.4 Nhận hàng & hủy đơn

**2.4.1 Nhận hàng**
- a. Xác nhận đã nhận hàng?
- b. Không bấm thì hệ thống tự xác nhận khi nào?

**2.4.2 Nhận thiếu / sai / hỏng**
- a. Báo nhận thiếu thế nào?
- b. Kho xử lý báo cáo ra sao?
- c. Rút lại báo cáo gửi nhầm?

**2.4.3 Hủy đơn**
- a. Cách hủy đơn?
- b. Tiền của đơn đã hủy đi đâu?
- c. Hủy nhầm thì làm sao?

**2.4.4 Không hủy được đơn**
- a. Không thấy nút Hủy?
- b. Đơn chờ hàng, Kho đã tiếp nhận?
- c. Phiếu đã được Kế toán duyệt tiền?
- d. Đơn do người khác đặt hộ?
- e. Hàng đã gửi đi?

### 2.5 Quỹ, công nợ & tài khoản

**2.5.1 Quỹ dư**
- a. Quỹ dư là gì?
- b. Xem quỹ ở đâu?
- c. Muốn rút tiền quỹ?

**2.5.2 Công nợ**
- a. Xem công nợ của tôi?
- b. Vượt trần công nợ thì sao?

**2.5.3 Tài khoản**
- a. Đăng nhập bằng Gmail nào?
- b. Tài khoản bị khóa / không vào được?
- c. Đổi ngôn ngữ app?

**2.5.4 Thông báo & ảnh**
- a. Bật thông báo trên điện thoại?
- b. Báo hết lượt tải ảnh?

Tổng: 5 nhóm · 21 chủ đề · 84 vấn đề (2.1: 24 · 2.2: 19 · 2.3: 18 · 2.4: 13 · 2.5: 10).

## 3. 📦 Đơn & phiếu của tôi (📊, tối đa 5 dòng mới nhất, bấm = mở chi tiết)

| | Lựa chọn | Hiện |
|---|---|---|
| 3.1 | Đơn đang chờ xử lý | Trạng thái + lý do (vì sao chờ, ai xử lý tiếp) |
| 3.2 | Phiếu cần chuyển tiền | Số còn phải chuyển, nút mở phiếu để tải ảnh |
| 3.3 | Phiếu chờ tôi nhận hàng | Hạn tự xác nhận, nút mở phiếu |
| 3.4 | Đơn bị từ chối / hủy gần đây | Lý do + người xử lý |

## 4. 💬 Vấn đề khác

| | Lựa chọn | Kết quả |
|---|---|---|
| 4.1 | Hỏi nhân viên Mua hàng | Form câu hỏi (loại "Khác") |
| 4.2 | Báo lỗi / góp ý về app | Form câu hỏi, nội dung có sẵn "[Báo lỗi app]" |
| 4.3 | Xem câu hỏi tôi đã gửi | Tab "Câu hỏi của tôi" |
