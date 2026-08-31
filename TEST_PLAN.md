# Kế hoạch test thủ công theo vai trò — Đặt mua linh kiện

Dùng để tự test tay trên hệ thống (local `npm run dev:worker`/`dev:frontend`, hoặc production
`https://linhkien.dichvu3t.workers.dev`). Với tài khoản Admin, có thể dùng nút **"Xem thử vai trò"**
(góc trên bên phải) để đóng vai từng nhóm quyền mà không cần nhiều tài khoản Google thật — lưu ý danh
tính (email `nguoi_tao`) vẫn là Admin thật, chỉ quyền/giao diện đổi.

Đánh dấu ☐ → ☑ khi test xong; ghi chú ngay bên cạnh nếu kết quả khác mô tả "Kỳ vọng".

## 0. Chuẩn bị

- ☐ Đăng nhập, xác nhận thấy đúng menu bên trái theo vai trò hiện tại.
- ☐ Có sẵn ít nhất 1 mã linh kiện trong "Danh mục linh kiện" để dùng xuyên suốt các luồng dưới.
- ☐ (Nếu test luồng Trạm/TBP) Cần 1 KTV vai trò "Vệ tinh" có gán Trạm cha, và 1 linh kiện đánh dấu
  "đặc thù" trong danh mục — nếu chưa có, nhờ Admin tạo trước.

---

## 1. KTV / CTV (kỹ thuật viên hiện trường, vai trò cơ bản nhất)

**Mục tiêu**: tạo và theo dõi đơn của chính mình từ đầu đến cuối, không cần biết nghiệp vụ nội bộ
(Kế toán/Kho/TN).

- ☐ Vào "Trang chủ" — thấy đúng số liệu "Cần làm" của **riêng mình** (không lẫn số của KTV khác).
- ☐ Bấm "+ Tạo đơn" → chọn mã linh kiện → chọn loại đề xuất "MUA HÀNG" → nhập số lượng → ghi chú → Tạo
  đơn. Kỳ vọng: toast báo thành công, đơn xuất hiện trong tab "Đơn hàng > Mua hàng" ở trạng thái
  "Chờ TN duyệt" (hoặc "Chờ Trạm duyệt" nếu tài khoản là Vệ tinh).
- ☐ Thử tạo đơn loại "CÔNG NỢ" — kiểm tra có bắt nhập số tiền công nợ không, và trạng thái khởi tạo có
  đúng không.
- ☐ Bấm vào 1 dòng đơn đã tạo — Drawer chi tiết mở đúng, xem đủ: người tạo, người nhận hàng, ngày tạo,
  mã tham chiếu, lịch sử xử lý.
- ☐ Sau khi đơn được duyệt và có Phiếu xuất kho (nhờ TN/Admin xử lý trước, hoặc tự đóng vai TN) — mở
  lại chi tiết đơn, kiểm tra khối **"Phiếu xuất kho"** mới xuất hiện trong Drawer:
  - ☐ Nếu trạng thái "Chờ KTV chuyển" tiền: có nút chọn ảnh + ô ghi chú chuyển khoản + nút "Đã
    chuyển" — bấm thử, kỳ vọng chuyển sang "KTV đã chuyển".
  - ☐ Nếu trạng thái "Đang gửi KTV": có nút "Đã nhận hàng" — bấm thử, kỳ vọng đóng luồng PXK.
  - ☐ Với đơn KHÔNG có PXK: khối này không hiện gì thêm (không có ô trống/lỗi layout).
- ☐ Thử tạo đơn "TRẢ HÀNG KHÁC" (bấm "khác..." ở ô loại đề xuất): kiểm tra có bắt buộc tối thiểu 1 ảnh
  linh kiện cần trả không, thử bấm "+ Thêm ảnh" xem luồng chọn/tải ảnh lên có mượt không.
- ☐ Vào "Chờ LK" — nếu có đơn đang ở trạng thái "Chờ hàng" (thiếu linh kiện), kiểm tra thấy đúng
  thông tin ngày dự kiến có hàng do Kho cập nhật.
- ☐ Kiểm tra badge số "Cần làm" ở menu trái tự cập nhật đúng sau mỗi hành động (không cần load lại
  trang).

---

## 2. Vệ tinh (KTV cấp 2, phụ thuộc 1 Trạm)

**Mục tiêu**: giống KTV nhưng đơn phải qua Trạm duyệt trước khi tới TN.

- ☐ Tạo đơn mới — kỳ vọng trạng thái khởi tạo là **"Chờ Trạm duyệt"** (khác KTV thường là "Chờ TN
  duyệt" thẳng).
- ☐ Lặp lại các bước kiểm tra Drawer chi tiết/PXK/badge giống mục KTV ở trên.
- ☐ Xác nhận KHÔNG thấy tab "Phiếu xuất kho" riêng trong menu — toàn bộ thông tin PXK chỉ xem được
  trong chi tiết đơn (đây là thiết kế cố ý, không phải thiếu sót).

---

## 3. Trạm (KTV cấp 1, phụ trách 1+ Vệ tinh)

**Mục tiêu**: duyệt hộ đơn của Vệ tinh mình quản lý trước khi đơn lên TN.

- ☐ Vào "Đơn hàng > Mua hàng", lọc "Chờ Trạm duyệt" — chỉ thấy đơn của (các) Vệ tinh mình phụ trách,
  KHÔNG thấy đơn của Vệ tinh thuộc Trạm khác.
- ☐ Bấm ✓ Duyệt 1 đơn — kỳ vọng chuyển sang "Chờ TBP xác nhận" (nếu linh kiện đặc thù) hoặc thẳng
  "Chờ TN duyệt".
- ☐ Bấm ✕ Từ chối 1 đơn — kiểm tra có yêu cầu nhập ghi chú lý do không, và đơn có báo về đúng cho
  người tạo (Vệ tinh) không (StatCard "Đơn bị từ chối").
- ☐ Thử chọn nhiều dòng (checkbox) rồi duyệt hàng loạt — kiểm tra tất cả dòng chọn đều chuyển trạng
  thái đúng.

---

## 4. TP DVBH / TBP (duyệt linh kiện đặc thù)

**Mục tiêu**: chốt thêm 1 lớp duyệt cho các mã linh kiện được đánh dấu "đặc thù" trong danh mục.

- ☐ Vào "Đơn hàng > Mua hàng", lọc "Chờ TBP xác nhận" — chỉ thấy đơn có linh kiện đặc thù.
- ☐ Duyệt/Từ chối 1 đơn — kiểm tra chuyển đúng sang "Chờ TN duyệt" hoặc bị huỷ.
- ☐ Kiểm tra icon 🔒 (hoặc dấu hiệu tương tự) hiện đúng trên các dòng linh kiện đặc thù trong danh sách
  chung, để phân biệt với đơn thường.

---

## 5. Tác nghiệp (TN) — vai trò xử lý nhiều nhất

**Mục tiêu**: duyệt đơn mua hàng/công nợ, xử lý PXK, và chốt luồng trả hàng.

### 5.1 Duyệt đơn mua hàng/công nợ
- ☐ Lọc "Chờ TN duyệt" — bấm "Duyệt" 1 đơn, kiểm tra chuyển "TN đã duyệt".
- ☐ Bấm "✕ Từ chối" 1 đơn — kiểm tra BẮT BUỘC chọn 1 lý do chậm (danh sách lý do "từ chối thật",
  không lẫn lý do "chờ hàng").
- ☐ Bấm "⏳ Chờ hàng" 1 đơn khác — kiểm tra dùng danh sách lý do KHÁC (loại "thiếu hàng trong kho"),
  và đơn chuyển sang "Cho hang" + tự sinh 1 ticket trong "Chờ LK" cho Kho xử lý.
- ☐ Thử chọn nhiều dòng cùng lúc rồi duyệt hàng loạt.

### 5.2 Tạo và quản lý Phiếu xuất kho (mua hàng)
- ☐ Vào tab "Phiếu xuất kho > Mua hàng", bấm "+ Tạo phiếu xuất kho", chọn KTV nhận hàng, chọn các
  dòng đơn "TN đã duyệt" của KTV đó, đặt số tiền cần chuyển (nếu có công nợ cần thu) → Tạo.
- ☐ Mở phiếu vừa tạo, thử gửi Kế toán, kiểm tra các bước tiếp theo (Kế toán chốt xong → Kho gửi hàng →
  KTV xác nhận) hiển thị đúng tiến trình theo step tracker trên đầu Drawer.
- ☐ Kiểm tra ô "Lý do chậm" trên từng dòng đơn trong PXK hoạt động đúng khi cần khai báo trễ hạn.

### 5.3 Trả hàng — bước cuối (duyệt tổng + tạo PXK trả hàng)
- ☐ Lọc "Trả hàng > Chờ TN duyệt tổng" — Duyệt 1 đơn, kỳ vọng chuyển "TN đã duyệt (chờ tạo PXK)".
- ☐ Vào "Phiếu xuất kho > Trả hàng", bấm "+ Tạo phiếu xuất kho" (loại phiếu tự chọn "Trả hàng"), chọn
  KTV, chọn dòng đơn đã "TN đã duyệt" → Tạo.
- ☐ Mở phiếu vừa tạo, nhập "Mã đơn hàng" (bắt buộc), bấm "Gửi kế toán" → kiểm tra chuyển "Chờ kế
  toán".
  - **Lưu ý khi test**: ô "Mã đơn hàng" hiện dùng chữ "Nhập mã đơn hàng sau khi KTV đã chuyển tiền" —
    với PXK trả hàng câu này không đúng ngữ cảnh (không có bước KTV chuyển tiền); đã ghi nhận trong
    `QA_REPORT.md` mục 5.2, chưa sửa — chỉ cần xác nhận lại có gây khó hiểu khi tự test không.

---

## 6. Kế toán

**Mục tiêu**: xử lý dòng tiền (mua hàng) và duyệt/đối chiếu trả hàng.

### 6.1 Mua hàng / PXK
- ☐ Vào "Phiếu xuất kho > Mua hàng", lọc "Chờ kế toán" — mở phiếu, xác nhận bằng chứng chuyển tiền
  KTV đã tải lên (nếu có), bấm chốt "Đã chốt xong đơn xuất".
- ☐ Kiểm tra nếu KTV CHƯA tải bằng chứng/ghi chú chuyển khoản, hệ thống có chặn chốt đơn không (nút
  vô hiệu hoá + tooltip giải thích lý do).

### 6.2 Trả hàng
- ☐ Vào "Trả hàng", lọc "Chờ kế toán duyệt mềm" — Duyệt/Từ chối 1 đơn.
- ☐ Vào "Phiếu xuất kho > Trả hàng", lọc "Chờ kế toán" — mở phiếu, nhập "Mã MISA" (bắt buộc), bấm
  "Đã chốt xong đơn xuất" → kiểm tra chuyển đúng bước kế tiếp (chờ Kho xác nhận).

---

## 7. Kho

**Mục tiêu**: xác nhận vật lý hàng hoá — cả chiều xuất (mua hàng) và chiều nhận lại (trả hàng).

- ☐ Vào "Phiếu xuất kho > Mua hàng", lọc "Đã chốt xong đơn xuất" — bấm gửi hàng cho KTV, kiểm tra
  chuyển "Đang gửi KTV".
- ☐ Vào "Chờ LK" — xử lý 1 ticket thiếu hàng: nhập ngày dự kiến có hàng + giải thích, kiểm tra thông
  tin này hiện đúng bên phía KTV (mục "Chờ hàng" ở KTV).
- ☐ Vào "Trả hàng", lọc "Chờ kho xác nhận" — Duyệt/Đẩy lui/Từ chối 1 đơn, kiểm tra cả 3 nút hoạt động
  đúng (đặc biệt "Đẩy lui" quay lại đúng bước trước).
- ☐ Vào "Phiếu xuất kho > Trả hàng", lọc "Đã chốt xong đơn xuất" — bấm "Kho đã nhận hàng trả" → kiểm
  tra đơn ĐÓNG hoàn toàn (không còn xuất hiện ở bất kỳ bộ lọc "cần xử lý" nào nữa).

---

## 8. QC

**Mục tiêu**: xác nhận chất lượng hàng trả — đây là màn hình DUY NHẤT và cũng là "báo cáo" chính của
QC trong hệ này (QC không xem được báo cáo pivot toàn hệ thống, chỉ Admin xem được — đã xác nhận là
thiết kế cố ý, không phải thiếu quyền).

- ☐ Đăng nhập/xem thử vai trò QC — xác nhận menu CHỈ có "Trả hàng" (không có "Đơn hàng" chung).
- ☐ Lọc "Chờ QC xác nhận" — Duyệt 1 đơn, kiểm tra chuyển "Chờ TN duyệt tổng".
- ☐ Thử Từ chối 1 đơn — theo comment trong code, bước này có thể **bắt buộc đính kèm ảnh bằng chứng**
  khi từ chối; kiểm tra UI có yêu cầu đúng không.

---

## 9. Giám sát

**Mục tiêu**: theo dõi số liệu của các KTV/Vệ tinh mình phụ trách (`giam_sat_quan_ly`), không thao
tác nghiệp vụ trực tiếp.

- ☐ Vào "Trang chủ" — StatCard/pipeline chỉ đếm đơn của KTV thuộc phạm vi phụ trách, KHÔNG đếm toàn hệ
  thống.
- ☐ Kiểm tra có xem được báo cáo pivot toàn hệ thống không (kỳ vọng: **không** — chỉ Admin có quyền
  này theo thiết kế đã chốt).

---

## 10. View (chỉ đọc theo Khu vực)

**Mục tiêu**: xem dữ liệu read-only, giới hạn theo (các) Khu vực được Admin gán.

- ☐ Gán tài khoản test 1 Khu vực cụ thể (qua Users > Nhân viên văn phòng) — đăng nhập, kiểm tra CHỈ
  thấy đơn của KTV/Vệ tinh thuộc khu vực đó.
- ☐ Thử bấm bất kỳ nút hành động nào (Duyệt/Từ chối/Tạo đơn...) — kỳ vọng KHÔNG thấy nút, hoặc bị chặn
  403 nếu gọi thẳng API.
- ☐ Gỡ hết Khu vực khỏi tài khoản — kỳ vọng không thấy đơn nào (không mặc định "thấy hết").

---

## 11. Admin

**Mục tiêu**: toàn quyền + các chức năng quản trị riêng.

- ☐ Test "Xem thử vai trò" — chuyển qua từng vai trò ở trên rồi "Thoát về Admin thật", xác nhận quay
  lại đúng danh tính/quyền Admin ban đầu.
- ☐ Users > "KTV hiện trường": tạo/sửa 1 KTV, gán Khu vực + KTV cấp 1 phụ trách, kiểm tra
  `giam_sat_quan_ly`/`tram_cha` tự cập nhật đúng (xem lại ở tab "Nhân viên văn phòng" hoặc qua hành vi
  Trạm/Giám sát tương ứng).
- ☐ Users > "Nhân viên văn phòng": gán nhiều Khu vực cho 1 tài khoản TN/Kho/Kế toán.
- ☐ Settings > "Khu vực": tạo Khu vực mới, gán GS phụ trách.
- ☐ Settings > Danh mục linh kiện: thêm/sửa 1 mã, đánh dấu "đặc thù", tải ảnh minh hoạ (kiểm tra luồng
  Google Drive OAuth nếu đã kết nối).
- ☐ Xem báo cáo pivot toàn hệ thống ("Trang chủ" hoặc mục báo cáo riêng) — kiểm tra số liệu khớp với
  tổng các vai trò đã test ở trên.

---

## 12. Test xuyên vai trò (integration) — khuyến nghị làm ít nhất 1 lần trọn vẹn

Đi hết 1 đơn từ đầu đến cuối, đổi vai trò ở mỗi bước, xác nhận KHÔNG có bước nào bị "mất tích" hoặc
badge đếm sai:

**Mua hàng thường**: KTV tạo → TN duyệt → TN tạo PXK → Kế toán xác nhận chuyển tiền (nếu có) → Kho gửi
hàng → KTV xác nhận nhận hàng (trong Drawer chi tiết đơn) → đóng.

**Mua hàng qua Vệ tinh + linh kiện đặc thù**: Vệ tinh tạo → Trạm duyệt → TBP duyệt → TN duyệt → (tiếp
tục như trên).

**Trả hàng đầy đủ**: KTV tạo (kèm ảnh) → Kế toán duyệt mềm → Kho xác nhận → QC xác nhận → TN duyệt
tổng → TN tạo PXK trả hàng → gửi Kế toán → Kế toán chốt (Mã MISA) → Kho xác nhận đã nhận hàng trả →
đóng.

Ở mỗi bước, kiểm tra thêm:
- ☐ Badge "Cần làm" của vai trò kế tiếp tăng đúng 1 ngay sau khi vai trò trước đó thao tác xong (không
  cần tải lại trang).
- ☐ Badge của vai trò VỪA xử lý xong giảm đúng 1.
- ☐ Lịch sử xử lý trong Drawer chi tiết ghi đủ từng bước, đúng người, đúng thời gian (múi giờ VN +7).

---

## 13. Ghi chú khi test trên production thật (khác local)

- Ảnh (bằng chứng chuyển tiền, ảnh trả hàng, ảnh minh hoạ linh kiện) sẽ upload thật lên Google Drive
  (khác local — local hiện chưa kết nối OAuth) — nhớ kiểm tra ảnh hiển thị lại đúng sau khi tải lên.
- Thông báo qua `thong_bao_ktv` là ghi nhận thật, không phải giả lập — nếu test bằng "Xem thử vai
  trò", nhớ rằng người tạo/người xử lý luôn là CÙNG 1 email Admin thật, nên thông báo "đơn bị từ chối"
  sẽ KHÔNG bắn ra (hệ thống cố ý không tự thông báo cho chính mình) — muốn test riêng phần thông báo
  cần 2 tài khoản Google thật khác nhau.
