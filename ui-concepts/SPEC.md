# SPEC dùng chung cho 5 phương án giao diện "Đặt mua linh kiện"

Đây là đặc tả DUY NHẤT bạn cần đọc để dựng 1 file HTML prototype. Không đọc code frontend hiện có,
không tham khảo giao diện hiện có — chỉ dùng đặc tả nghiệp vụ/quyền dưới đây (đã trích xuất và RÚT
GỌN từ 2 tài liệu nguồn `Yeu_cau_tong_hop_du_an.md` và `Ma_tran_kiem_soat_he_thong.xlsx` trong repo,
đã xử lý mọi mâu thuẫn/lỗi phát hiện thành quyết định cuối cùng bên dưới).

**Đây là PROTOTYPE TĨNH** — không gọi API thật, không backend. Mọi hành động (duyệt/từ chối/tạo đơn...)
chỉ thao tác trên state JS trong bộ nhớ trình duyệt (mảng/object JS), re-render lại UI ngay. Mục đích:
để người xem duyệt/so sánh 5 hướng thiết kế trước khi chọn 1 hướng code thật.

---

## 1. Yêu cầu kỹ thuật bắt buộc (áp dụng cho CẢ 5 file)

- Đúng **1 file `.html`** duy nhất, tự chứa hoàn toàn: CSS inline trong `<style>`, JS inline trong
  `<script>`. KHÔNG dùng framework build (React/Vue qua CDN cũng KHÔNG — viết JS thuần/vanilla DOM).
  Được phép dùng `<link>` tới Google Fonts (fonts.googleapis.com/fonts.gstatic.com) vì file này chạy
  cục bộ có mạng, nhưng không phụ thuộc gì khác qua CDN — phải mở được khi offline (trừ web font).
- Có **bộ chuyển vai trò (persona switcher)** cố định luôn hiển thị (không phải màn hình đăng nhập) —
  dropdown chọn 1 trong 10 persona ở mục 2, cộng 2 checkbox độc lập (Quản lý DM LK / Xem DM LK) có thể
  bật thêm cho BẤT KỲ persona nào. Đổi persona → toàn bộ menu/nút/dữ liệu hiển thị lại đúng theo ma
  trận quyền ở mục 3-6.
- Có **nút chuyển "🖥️ Bản Web" / "📱 Bản Mobile"** cố định (góc trên). 2 chế độ là 2 THIẾT KẾ KHÁC
  NHAU thật sự (không chỉ responsive reflow):
  - **Bản Web**: layout đầy đủ chiều rộng trình duyệt, theo đúng layout pattern mô tả trong brief
    thiết kế của bạn (mục 8).
  - **Bản Mobile**: render bên trong 1 khung điện thoại giả lập cố định — khung rộng **390px, cao
    844px**, bo góc ~40px, có viền/bezel mỏng + shadow nhẹ để trông như khung máy, đặt giữa màn hình
    (nền xám nhạt xung quanh). Bên trong khung là UI mobile-pattern riêng của concept bạn (bottom
    nav/tab bar riêng, full-screen sheet thay vì drawer ngang, nút to ≥44px). Cuộn dọc xảy ra BÊN
    TRONG khung, không cuộn cả trang.
  - Cả 2 chế độ dùng CHUNG state dữ liệu (đổi persona ở chế độ Web rồi bấm sang Mobile phải giữ đúng
    persona đó).
- Dùng ĐÚNG bộ dữ liệu mẫu ở mục 7 (copy nguyên object JS đó vào file của bạn làm seed data) — để 5
  bản có thể so sánh ngang hàng cùng 1 bộ dữ liệu.
- Toàn bộ nhãn/text giao diện dùng **tiếng Việt** (giữ nguyên các từ nghiệp vụ như "PXK", "Tác nghiệp",
  "TP DVBH", "GS", "KTV/CTV", "Vệ tinh", mã trạng thái... như trong đặc tả).
- File đặt tên và ghi đúng đường dẫn được giao ở cuối brief riêng của bạn (thư mục
  `ui-concepts/`).

## 2. 10 persona dùng cho bộ chuyển vai trò + 2 cờ độc lập

| # | Persona (tên hiển thị) | email demo | vai_tro lõi | Ghi chú quan hệ |
|---|---|---|---|---|
| 1 | Admin | admin@3t.vn | Admin | Vượt qua gần như mọi kiểm tra quyền |
| 2 | QC | qc@3t.vn | QC | — |
| 3 | Giám sát (GS) | gs.mienbac@3t.vn | Giam sat | Phụ trách: Trạm Hà Đông, KTV Nguyễn Văn A, Vệ tinh Lê Thị B (xem mục 7) |
| 4 | Trạm | tram.hadong@3t.vn | KTV DVBH (là Trạm) | Quản lý Vệ tinh: vetinh.b@3t.vn, vetinh.d@3t.vn |
| 5 | KTV/CTV | ktv.a@3t.vn | KTV DVBH | Giám sát quản lý: gs.mienbac@3t.vn |
| 6 | Vệ tinh | vetinh.b@3t.vn | KTV DVBH (là Vệ tinh) | tram_cha = tram.hadong@3t.vn |
| 7 | Kho | kho.trungtam@3t.vn | Kho | — |
| 8 | Kế toán | ketoan.c@3t.vn | Kế toán | — |
| 9 | Tác nghiệp (TN) | tacnghiep.d@3t.vn | Tác nghiệp | Mặc định bật sẵn cờ "Quản lý DM LK" khi demo (để thấy ví dụ 1 vai trò khác Admin có cờ này) |
| 10 | TP DVBH | tpdvbh.e@3t.vn | TP DVBH | Mặc định bật sẵn cờ "Xem DM LK" khi demo |

2 cờ độc lập (checkbox, tick được cho BẤT KỲ persona nào ở trên, kể cả Admin — dù Admin không cần):
- **Quản lý DM LK** — được Thêm/Sửa/Nhập hàng loạt/Xuất ảnh trong Danh mục linh kiện.
- **Xem DM LK** — chỉ xem Danh mục linh kiện (không có 2 cờ này + không đúng vai trò được liệt kê ở
  mục 4 module Danh mục LK thì KHÔNG thấy module này trong menu).

## 3. Nguyên tắc chung (bắt buộc thể hiện trong CẢ 5 concept, đây là phần "base" — không phải phần
thẩm mỹ khác nhau)

Đây là 4 tiêu chí UX gốc + 3 cải tiến giá trị cao nhất đã được chốt, PHẢI có ở cả 5 bản (chỉ khác nhau
về da/skin thị giác, không khác về hành vi):

1. **Mỗi vai trò vào module thấy ngay "Việc cần làm" của mình** — trang chủ/landing của module Đặt
   mua LK phải là 1 khu vực tổng quan số liệu tồn đọng phân theo loại, đúng theo phạm vi dữ liệu của
   persona đang chọn (không phải số liệu chung chung của cả hệ thống trừ khi persona đó có quyền xem
   toàn bộ).
2. **Số tồn đọng bấm được → nhảy thẳng tới đúng tab/filter** xử lý (không bắt tự tìm lại).
3. **Nút hành động "1 chạm"** cho thao tác phổ biến nhất ngay trên từng dòng danh sách (không bắt mở
   chi tiết mới thấy nút, với các hành động đơn giản như Duyệt/Từ chối 1 dòng).
4. **Hỗ trợ xử lý hàng loạt + import Excel** — chọn nhiều dòng → duyệt/từ chối hàng loạt; và có nút
   "Nhập Excel" (bấm ra 1 dialog giả lập chọn file → hiển thị bảng preview dữ liệu mẫu → nút "Nhập
   ngay" thêm các dòng mẫu vào danh sách) ở các màn: Tạo đơn hàng loạt, Nhập KTV hàng loạt, Nhập Danh
   mục LK hàng loạt.
5. **Chi tiết 1 đơn/phiếu dùng Drawer trượt từ bên phải (desktop) / Bottom sheet full-height
   (mobile) — KHÔNG dùng modal popup giữa màn hình.** Trong Drawer/Sheet có nút **"Duyệt và tiếp theo →"**
   để xử lý xong 1 dòng thì tự nhảy sang dòng tiếp theo trong danh sách hiện tại mà không phải đóng
   rồi mở lại.
6. **Bộ lọc tách 2 lớp**: Quick filter dạng chip/segmented luôn hiện trên đầu danh sách (ví dụ:
   "Tất cả · Chờ tôi duyệt · Ưu tiên · Quá hạn"), và Advanced filter (nhiều điều kiện: theo KTV, theo
   GS, khoảng ngày, mã LK...) gói trong 1 drawer/panel riêng mở khi bấm "Lọc thêm".
7. Đơn có `uu_tien = true` (ưu tiên) phải có dấu hiệu thị giác nổi bật riêng (ví dụ ⭐ + màu cam) và
   dấu hiệu này LAN xuống mọi màn liên quan tới đơn đó (nếu đơn ưu tiên bị thiếu LK → dòng ticket
   Thiếu LK tương ứng cũng phải có cùng dấu hiệu; nếu vào PXK → dòng PXK cũng vậy).
8. Nút hành động dùng **thể mệnh lệnh** ("Hủy đơn", "Duyệt", "Từ chối") — KHÔNG dùng thể quá khứ/trạng
   thái ("Đã hủy") làm nhãn nút. Nhãn trạng thái (quá khứ, dùng cho badge/tag hiển thị) và nhãn nút
   (mệnh lệnh, dùng cho action) phải phân biệt rõ ràng, nhất quán toàn bộ file.

## 4. Ma trận 1 — Vai trò × Màn hình/Tab (module nào, tab nào persona thấy trong menu)

Ký hiệu: **C** = Có (đầy đủ), **X** = Xem (chỉ đọc, có thể có menu riêng), **1P** = 1 phần (đầy đủ
nhưng có điều kiện giới hạn — xem ghi chú), **K** = Không (ẩn hẳn khỏi menu).

Cột theo thứ tự: Admin · QC · GS · Trạm · KTV/CTV · Vệ tinh · Kho · Kế toán · TN · TP DVBH

| Màn hình | Admin | QC | GS | Trạm | KTV | VT | Kho | KT | TN | TBP | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Mua hàng (tab) | C | K | C | C | C | C | K | K | C | C | — |
| Công nợ (tab) | C | K | C | C | C | C | K | K | C | C | — |
| Trả hàng — đầy đủ (có nút duyệt từng bước) | C | C | C | K | K | K | C | C | C | K | Trạm/KTV/VT/TBP không có nút, rơi vào dòng dưới |
| Trả hàng — chỉ theo dõi (không nút, chỉ xem) | K | K | K | C | C | C | K | K | K | C | Trạm/KTV/VT xem **toàn bộ** đơn trả hàng hệ thống (không giới hạn phạm vi ở đây — xác nhận là chủ đích); TBP cũng vào đây, xem toàn bộ, không có nút — chủ đích, không phải lỗi |
| Phiếu xuất kho | C | K | C(theo dõi) | K | K | K | C | C | C | K | — |
| Thiếu linh kiện | C | K | C | C | C | C | C | C | C | C | Tab luôn hiện cho mọi vai trò có mặt trong module này; nút xử lý (tiếp nhận/xác nhận/đóng) chỉ Kho + TN có |
| Báo cáo | C(pivot toàn bộ) | **đặc biệt — xem ghi chú** | C(pivot, theo GS phụ trách) | X(thẻ cá nhân) | X(thẻ cá nhân) | X(thẻ cá nhân) | C(pivot toàn bộ) | C(pivot toàn bộ) | C(pivot toàn bộ) | X(thẻ cá nhân) | **QC: KHÔNG cho vào Báo cáo dạng bảng pivot đầy đủ** (đây là 1 lỗi đã sửa theo quyết định của chủ dự án) — thay vào đó, mục "Báo cáo" của QC hiển thị **"Việc QC cần xác nhận"**: danh sách đơn Trả hàng đang ở bước chờ QC xác nhận (D3), KHÔNG phải bảng thống kê toàn hệ thống |
| Nút "+ Tạo đơn" | C | K | C | C | C | C | K | K | C | K | — |
| Danh mục linh kiện — Xem | C | C | C | C | C | C | C | C | C | C | Mọi vai trò đã đăng nhập đều xem được (kể cả không có 2 cờ) |
| Danh mục linh kiện — Thêm/Sửa/Nhập hàng loạt/Xuất ảnh | C | K* | K* | K | K | K | K* | K* | K* | K* | **K\*** = ẨN HẲN nút này trừ khi persona có cờ "Quản lý DM LK" hoặc là Admin — đây là 1 lỗi đã sửa: bản cũ hiện nút cho mọi người rồi báo lỗi 403 khi bấm, bản mới PHẢI ẩn nút thay vì hiện-rồi-báo-lỗi |
| Settings (Lý do chậm/Loại đề xuất/Danh sách KTV/Google Drive) | C | K | K | K | K | K | K | K | K | K | Chỉ Admin vào được module này |
| Quản lý User | C | K | K | K | K | K | K | K | K | K | Chỉ Admin |

## 5. Ma trận 2 — Vai trò × Bước quy trình (ai được bấm nút gì ở mỗi bước) — rút gọn còn hành động
chính, Admin luôn được coi là có mọi quyền nên không liệt kê lại ở từng dòng trừ khi có ngoại lệ.

**LUỒNG A — Mua hàng/Công nợ** (trạng thái: `Cho Tram duyet` → *(nếu có LK đặc thù)* `Cho TBP xac nhan`
→ `Cho TN duyet` → `TN da duyet` / `Tu choi` / mở ticket Thiếu LK; đơn của Trạm/TN/GS/KTV/VT không qua
Trạm có thể bỏ qua bước `Cho Tram duyet` nếu người tạo không phải Vệ tinh dưới quyền 1 Trạm)
- **Tạo đơn**: GS · Trạm · KTV · VT · TN (TN/GS được "tạo hộ" người khác; GS chỉ tạo hộ đúng KTV/VT
  mình phụ trách).
- **Trạm duyệt/từ chối** (bước `Cho Tram duyet`): chỉ Trạm, và chỉ đơn của Vệ tinh **do chính Trạm đó
  quản lý**.
- **TBP xác nhận LK đặc thù** (bước `Cho TBP xac nhan`, chỉ áp dụng khi mã LK có cờ "đặc thù"): chỉ
  TP DVBH.
- **TN duyệt/từ chối/chuyển ticket Thiếu LK** (bước `Cho TN duyet`): chỉ TN. Từ chối bắt buộc chọn 1
  lý do chậm; nếu lý do đó có cờ "mở ticket thiếu LK" thì hệ thống tự tạo 1 ticket Thiếu LK thay vì từ
  chối hẳn đơn.
- **Sửa đơn khi đang chờ duyệt**: người tạo được sửa đơn CỦA MÌNH nhưng chỉ khi đơn còn ở 1 trong 3
  bước chờ duyệt đầu; TN được sửa mở rộng hơn (thêm được `gia_chot`, `so_luong_thuc_xuat`, `ly_do_cham`)
  ở bất kỳ lúc nào.
- **Hủy đơn**: người tạo (đơn của mình) hoặc Trạm (đơn của mình/của Vệ tinh cấp dưới). TN KHÔNG có
  quyền hủy phổ quát (trừ khi cũng là người tạo).
- **Gắn/gỡ mã yêu cầu sự cố (case)**: TN luôn được; người tạo chỉ được khi đơn CHƯA vào PXK và CHƯA
  đóng.

**LUỒNG B — Thiếu linh kiện** (trạng thái ticket: `Cho kho tiep nhan` → `Kho da tiep nhan` →
`Cho kho xac nhan` → `Da ve kho`/`Tu choi sai thong tin` → `Da ket thuc`, hoặc `Da huy bo` bất kỳ lúc
nào trước khi đóng)
- **Kho tiếp nhận xử lý / xác nhận hàng về / từ chối sai thông tin**: chỉ Kho.
- **Hủy ticket**: chỉ Kho, và chỉ ticket do **chính Kho đó tạo** (người tạo ticket thường là Kho báo
  thiếu, không phải chủ đơn gốc).
- **Đóng ticket ("Đã kết thúc")**: chỉ TN.

**LUỒNG C — Phiếu xuất kho (PXK)** (trạng thái: `Dang tao phieu` → `Cho ke toan` → `Dang gui KTV` →
`Kho da ket thuc`, song song có nhánh chuyển tiền `Cho KTV chuyen tien` → `KTV da chuyen` → `TN da
duyet tien`)
- **Tạo PXK** (gộp nhiều đơn cùng 1 KTV, cùng loại đơn, đang `TN da duyet`, chưa có PXK nào): chỉ TN.
- **Gán mã xuất kho thật**: chỉ TN, khi đang `Dang tao phieu`.
- **Gán mã MISA**: chỉ Kế toán, khi đang `Cho ke toan`.
- **Upload ảnh biên bản nhận hàng**: chỉ đúng người nhận hàng (Trạm/KTV/VT của phiếu đó) — **Admin
  KHÔNG được miễn trừ ở bước này** (chủ đích thiết kế, giữ nguyên).
- **Yêu cầu chuyển tiền / duyệt tiền cuối cùng**: chỉ TN.
- **Xác nhận đã chuyển tiền + đính kèm bằng chứng**: chỉ đúng người nhận hàng của phiếu (Admin ĐƯỢC
  miễn trừ ở bước này, khác bước upload ảnh biên bản).
- **Chuyển "Cho kế toán" (TN chốt xong)**: chỉ TN, cần đã có mã xuất kho + tiền xử lý xong.
- **Kế toán hủy phiếu**: Kế toán hoặc TN.
- **"Đã chốt xong đơn xuất"**: chỉ Kế toán, cần đã có mã MISA.
- **Gửi hàng cho KTV / Kho kết thúc**: chỉ Kho.
- **KTV xác nhận đã nhận hàng**: chỉ đúng người nhận hàng của phiếu.

**LUỒNG D — Trả hàng** (trạng thái: `Cho ke toan duyet mem` → `Cho kho xac nhan` → `Cho QC xac nhan`
→ `Cho TN duyet tong` → `Da duyet` *(sau đó có thể lên PXK loại `tra_hang` riêng, Kho xác nhận nhận
hàng trả về)* / `Tu choi`)
- **D1 Kế toán duyệt mềm**: chỉ Kế toán.
- **D2 Kho xác nhận**: chỉ Kho.
- **D3 QC xác nhận**: chỉ QC.
- **D4 TN duyệt tổng (bước cuối)**: chỉ TN, từ chối bắt buộc ghi chú lý do.
- **D5 "Lùi bước"** (đẩy phiếu lùi lại bước trước, ở bất kỳ bước nào Kế toán/Kho đang xử lý): Kế toán
  hoặc Kho.
- **D6 Hủy yêu cầu trả hàng**: người tạo (đơn của mình) hoặc TN.

**LUỒNG E — Quản trị hệ thống**: toàn bộ (duyệt/khoá/đổi vai trò user, CRUD danh bạ KTV, CRUD danh mục
LK-cấu-hình, cấu hình Lý do chậm/Loại đề xuất, gán Giám sát phụ trách, kết nối Google Drive) — **chỉ
Admin**, không vai trò nào khác động vào được kể cả xem.

## 6. Ma trận 4 — Phạm vi dữ liệu (trong CÙNG 1 danh sách, persona thấy toàn bộ hay chỉ 1 phần)

| Danh sách | Admin | QC | GS | Trạm | KTV | VT | Kho | KT | TN | TBP |
|---|---|---|---|---|---|---|---|---|---|---|
| Mua hàng / Công nợ / Trả hàng-theo dõi | Toàn bộ | (không vào — xem ma trận 1) | Chỉ đơn của KTV/VT/Trạm **mình phụ trách** (`giam_sat_quan_ly`) | Đơn của mình + đơn của Vệ tinh mình quản lý | Chỉ đơn của mình | Chỉ đơn của mình | Toàn bộ | Toàn bộ | Toàn bộ | Toàn bộ (chủ đích, xem mục 4) |
| Thiếu linh kiện | Toàn bộ | (không vào) | **Ticket phát sinh từ đơn của KTV/VT/Trạm mình phụ trách** (đã sửa: trước đây lọc sai theo người TẠO ticket, giờ phải lọc theo GS phụ trách của ĐƠN GỐC sinh ra ticket đó) | Ticket tự tạo (hiếm) | Ticket tự tạo (hiếm) | Ticket tự tạo (hiếm) | Toàn bộ | Ticket tự tạo | Toàn bộ | Ticket tự tạo |
| Phiếu xuất kho | Toàn bộ | (không vào) | PXK của KTV/VT/Trạm mình phụ trách | PXK của mình + của Vệ tinh mình | PXK của mình | PXK của mình | Toàn bộ | Toàn bộ | Toàn bộ | (không vào) |
| Báo cáo (pivot nhiều KTV) | Toàn bộ | Xem mục 4 (không phải pivot) | Theo GS phụ trách | (không vào — chỉ thẻ cá nhân) | (thẻ cá nhân) | (thẻ cá nhân) | Toàn bộ | Toàn bộ | Toàn bộ | (thẻ cá nhân) |

Với prototype tĩnh, bạn chỉ cần **lọc đúng theo nguyên tắc trên bằng dữ liệu mẫu ở mục 7** (dữ liệu mẫu
đã gắn sẵn `nguoi_tao`, `email_gs`, `tram_cha` phù hợp để việc lọc ra kết quả khác nhau giữa các
persona là rõ ràng, chứng minh được — không cần chính xác tuyệt đối từng edge-case).

## 7. Bộ dữ liệu mẫu DÙNG CHUNG (copy nguyên vào file của bạn, dùng làm seed)

```js
const SEED = {
  ktvList: [
    { email: "tram.hadong@3t.vn", ten: "Trạm Hà Đông", vaiTro: "Trạm", tramCha: null, giamSat: "gs.mienbac@3t.vn" },
    { email: "ktv.a@3t.vn", ten: "Nguyễn Văn A", vaiTro: "KTV/CTV", tramCha: null, giamSat: "gs.mienbac@3t.vn" },
    { email: "vetinh.b@3t.vn", ten: "Lê Thị B (Vệ tinh)", vaiTro: "Vệ tinh", tramCha: "tram.hadong@3t.vn", giamSat: "gs.mienbac@3t.vn" },
    { email: "vetinh.d@3t.vn", ten: "Phạm Văn D (Vệ tinh)", vaiTro: "Vệ tinh", tramCha: "tram.hadong@3t.vn", giamSat: "gs.mienbac@3t.vn" },
    { email: "ktv.e@3t.vn", ten: "Hoàng Thị E", vaiTro: "KTV/CTV", tramCha: null, giamSat: "gs.miennam@3t.vn" },
  ],
  linhKien: [
    { ma: "LK001", ten: "Bo mạch chủ Samsung A52", hang: "Samsung", gia: 350000, dacThu: false, thayThe: ["LK001B"] },
    { ma: "LK001B", ten: "Bo mạch chủ Samsung A52 (hàng thay thế)", hang: "Samsung", gia: 340000, dacThu: false, thayThe: [] },
    { ma: "LK002", ten: "Pin Samsung A52", hang: "Samsung", gia: 220000, dacThu: false, thayThe: [] },
    { ma: "LK010", ten: "Màn hình iPhone 13", hang: "Apple", gia: 1850000, dacThu: true, thayThe: [] },
    { ma: "LK011", ten: "Camera sau iPhone 13", hang: "Apple", gia: 620000, dacThu: true, thayThe: [] },
    { ma: "LK020", ten: "Loa ngoài Xiaomi Redmi Note 11", hang: "Xiaomi", gia: 95000, dacThu: false, thayThe: [] },
    { ma: "LK025", ten: "Pin Xiaomi Redmi Note 11", hang: "Xiaomi", gia: 180000, dacThu: false, thayThe: [] },
    { ma: "LK030", ten: "Màn hình Oppo A96", hang: "Oppo", gia: 780000, dacThu: false, thayThe: [] },
  ],
  lyDoCham: [
    { ma: "LDC1", ten: "Chờ hàng nhập kho", moTicketThieuLk: true },
    { ma: "LDC2", ten: "Sai thông tin đơn hàng", moTicketThieuLk: false },
    { ma: "LDC3", ten: "KTV yêu cầu huỷ", moTicketThieuLk: false },
    { ma: "LDC4", ten: "Vượt hạn mức duyệt", moTicketThieuLk: false },
  ],
  donHang: [
    { id: "DH-2401", loai: "mua", nguoiTao: "vetinh.b@3t.vn", emailGs: "gs.mienbac@3t.vn", tram: "tram.hadong@3t.vn", maLk: "LK001", soLuong: 2, trangThai: "Cho Tram duyet", uuTien: false },
    { id: "DH-2402", loai: "mua", nguoiTao: "vetinh.d@3t.vn", emailGs: "gs.mienbac@3t.vn", tram: "tram.hadong@3t.vn", maLk: "LK002", soLuong: 1, trangThai: "Cho Tram duyet", uuTien: true },
    { id: "DH-2403", loai: "mua", nguoiTao: "ktv.a@3t.vn", emailGs: "gs.mienbac@3t.vn", tram: null, maLk: "LK010", soLuong: 1, trangThai: "Cho TBP xac nhan", uuTien: false },
    { id: "DH-2404", loai: "cong_no", nguoiTao: "ktv.a@3t.vn", emailGs: "gs.mienbac@3t.vn", tram: null, maLk: "LK020", soLuong: 3, trangThai: "Cho TN duyet", uuTien: false },
    { id: "DH-2405", loai: "mua", nguoiTao: "tram.hadong@3t.vn", emailGs: "gs.mienbac@3t.vn", tram: null, maLk: "LK002", soLuong: 5, trangThai: "Cho TN duyet", uuTien: true },
    { id: "DH-2406", loai: "cong_no", nguoiTao: "ktv.e@3t.vn", emailGs: "gs.miennam@3t.vn", tram: null, maLk: "LK030", soLuong: 1, trangThai: "Cho TN duyet", uuTien: false },
    { id: "DH-2390", loai: "mua", nguoiTao: "ktv.a@3t.vn", emailGs: "gs.mienbac@3t.vn", tram: null, maLk: "LK025", soLuong: 2, trangThai: "TN da duyet", uuTien: false },
    { id: "DH-2391", loai: "mua", nguoiTao: "vetinh.b@3t.vn", emailGs: "gs.mienbac@3t.vn", tram: "tram.hadong@3t.vn", maLk: "LK001", soLuong: 1, trangThai: "TN da duyet", uuTien: false },
    { id: "DH-2380", loai: "mua", nguoiTao: "ktv.e@3t.vn", emailGs: "gs.miennam@3t.vn", tram: null, maLk: "LK011", soLuong: 1, trangThai: "Tu choi", lyDoCham: "LDC2", uuTien: false },
    { id: "DH-2381", loai: "cong_no", nguoiTao: "ktv.a@3t.vn", emailGs: "gs.mienbac@3t.vn", tram: null, maLk: "LK020", soLuong: 2, trangThai: "Da huy", uuTien: false },
  ],
  thieuLk: [
    { id: "TLK-01", donGoc: "DH-2390", nguoiTaoTicket: "kho.trungtam@3t.vn", emailGsDonGoc: "gs.mienbac@3t.vn", maLk: "LK025", trangThai: "Kho da tiep nhan", uuTien: false },
    { id: "TLK-02", donGoc: "DH-2405", nguoiTaoTicket: "kho.trungtam@3t.vn", emailGsDonGoc: "gs.mienbac@3t.vn", maLk: "LK002", trangThai: "Cho kho xac nhan", uuTien: true },
    { id: "TLK-03", donGoc: "DH-2406", nguoiTaoTicket: "kho.trungtam@3t.vn", emailGsDonGoc: "gs.miennam@3t.vn", maLk: "LK030", trangThai: "Da ket thuc", uuTien: false },
  ],
  pxk: [
    { id: "PXK-501", nguoiNhanHang: "ktv.a@3t.vn", emailGs: "gs.mienbac@3t.vn", donHang: ["DH-2390"], trangThai: "Dang tao phieu", maXuatKho: null, maMisa: null },
    { id: "PXK-502", nguoiNhanHang: "vetinh.b@3t.vn", emailGs: "gs.mienbac@3t.vn", donHang: ["DH-2391"], trangThai: "Cho ke toan", maXuatKho: "XK-99231", maMisa: null },
  ],
  traHang: [
    { id: "TH-701", nguoiTao: "ktv.a@3t.vn", emailGs: "gs.mienbac@3t.vn", maLk: "LK002", trangThai: "Cho ke toan duyet mem", uuTien: false },
    { id: "TH-702", nguoiTao: "vetinh.b@3t.vn", emailGs: "gs.mienbac@3t.vn", maLk: "LK001", trangThai: "Cho kho xac nhan", uuTien: false },
    { id: "TH-703", nguoiTao: "ktv.e@3t.vn", emailGs: "gs.miennam@3t.vn", maLk: "LK011", trangThai: "Cho QC xac nhan", uuTien: true },
    { id: "TH-704", nguoiTao: "tram.hadong@3t.vn", emailGs: "gs.mienbac@3t.vn", maLk: "LK030", trangThai: "Cho TN duyet tong", uuTien: false },
    { id: "TH-699", nguoiTao: "ktv.a@3t.vn", emailGs: "gs.mienbac@3t.vn", maLk: "LK020", trangThai: "Da duyet", uuTien: false },
  ],
  users: [
    { email: "khach.moi@3t.vn", ten: "Trần Văn Mới", trangThaiDuyet: "Cho duyet", vaiTro: null },
  ],
};
```

## 8. Việc phải sửa so với hệ cũ (áp dụng ở CẢ 5 concept, đã được xác nhận, không phải tự suy đoán)

1. **QC**: bỏ hẳn màn "Báo cáo" dạng bảng pivot toàn hệ thống. Thay bằng 1 khu vực "Việc QC cần xác
   nhận" — danh sách các đơn Trả hàng đang ở bước `Cho QC xac nhan`, có nút xử lý ngay.
2. **Danh mục linh kiện**: ẨN nút Thêm/Sửa/Nhập hàng loạt/Xuất ảnh với mọi persona KHÔNG có cờ "Quản
   lý DM LK" và không phải Admin — không được hiện nút rồi báo lỗi khi bấm.
3. **Thiếu linh kiện, phạm vi của GS**: lọc theo GS phụ trách của **đơn gốc sinh ra ticket** (field
   `emailGsDonGoc` trong dữ liệu mẫu), KHÔNG lọc theo người tạo ticket.
4. **Quản lý User — Admin tự sửa dòng của chính mình**: khi Admin đang sửa dòng user mà email trùng
   với email đang đăng nhập (persona Admin hiện tại), phải hiện 1 cảnh báo rõ ràng trước khi lưu (ví
   dụ: banner đỏ "Bạn đang tự sửa tài khoản của chính mình — có thể tự khoá quyền Admin của bạn." +
   yêu cầu tick xác nhận hoặc gõ lại email để xác nhận) — không chặn cứng, nhưng phải cảnh báo rõ.
5. Trạm/KTV/Vệ tinh/TP DVBH ở màn "Trả hàng — chỉ theo dõi" xem **toàn bộ** đơn trả hàng hệ thống (đây
   KHÔNG phải lỗi, giữ nguyên vì đã xác nhận là chủ đích).

## 9. Cấu trúc màn hình cần có (đủ cho cả Web lẫn Mobile, mỗi concept tự quyết định layout/thẩm mỹ)

1. Trang chủ / Việc cần làm — landing khi mở module Đặt mua LK, số liệu theo mục 3 điểm 1-2.
2. Mua hàng (list + drawer chi tiết + bulk + import Excel giả lập).
3. Công nợ (giống Mua hàng, lọc `loai='cong_no'`).
4. Trả hàng — đầy đủ (chuỗi 6 bước D1-D6, có nút "Lùi bước").
5. Trả hàng — chỉ theo dõi (read-only).
6. Phiếu xuất kho (danh sách + chi tiết nhiều bước: mã xuất kho, mã MISA, ảnh biên bản, chuyển tiền,
   gửi hàng, KTV xác nhận nhận).
7. Thiếu linh kiện (nhóm theo KTV, cùng kiểu hiển thị/nút/bulk như Mua hàng).
8. Báo cáo (pivot nhiều KTV cho vai trò quản lý / thẻ cá nhân cho vai trò thực thi / view riêng cho QC).
9. Tạo đơn mới (chọn LK từ Danh mục + hiện gợi ý linh kiện thay thế nếu có + tổng giá đề xuất tự tính).
10. Danh mục linh kiện (list + Thêm/Sửa/Nhập hàng loạt/Xuất ảnh có gate theo mục 8 điểm 2).
11. Settings — 4 tab: Lý do chậm, Loại đề xuất, Danh sách KTV (gán Giám sát phụ trách), Google Drive.
12. Quản lý User (danh sách + duyệt tài khoản `Cho duyet` + khoá/mở khoá + đổi vai trò/cờ + cảnh báo
    tự sửa theo mục 8 điểm 4).

---

# PHẦN RIÊNG THEO TỪNG CONCEPT

Bạn CHỈ cần đọc phần của CONCEPT được giao (số thứ tự nêu trong yêu cầu giao việc), không cần dựng cả
5.

## CONCEPT 1 — "Structured Neutral" (tham khảo: shadcn/ui, Linear, Vercel Dashboard)

- **File xuất**: `ui-concepts/concept-1-structured-neutral.html`
- **Font**: "Inter" (Google Fonts) cho chữ thường; `ui-monospace, SFMono-Regular, Menlo, monospace`
  cho mã (ID đơn, mã LK, mã xuất kho...).
- **Màu**: nền trắng/xám rất nhạt (#FAFAFA), chữ gần đen (#18181B), 1 màu nhấn duy nhất (indigo
  #4F46E5), badge trạng thái dạng viền mảnh + chữ màu (không tô nền đặc), border 1px màu xám nhạt
  everywhere, hầu như không dùng shadow (shadow cực nhẹ nếu cần cho drawer).
- **Web layout**: sidebar trái thu gọn được (icon+label, ~240px), top bar mỏng có breadcrumb + ô tìm
  kiếm kiểu "command palette" (placeholder "Tìm kiếm hoặc gõ lệnh... (Ctrl K)") + persona switcher bên
  phải. Bảng dữ liệu dày, dòng kẻ ngang mảnh, hover row nhẹ. Drawer chi tiết trượt từ phải, rộng ~480px.
- **Mobile (khung 390×844)**: top app bar mỏng + bottom tab bar 5 mục (icon outline), danh sách dạng
  card viền mảnh xếp dọc, bottom sheet full-height cho chi tiết/form, nút hành động dạng pill nhỏ gọn.
- Tinh thần chung: tối giản, mật độ thông tin cao nhưng gọn gàng, giống công cụ cho dân kỹ thuật.

## CONCEPT 2 — "Material 3 Expressive" (tham khảo: Material Design 3 / m3.material.io, Google
Workspace)

- **File xuất**: `ui-concepts/concept-2-material3.html`
- **Font**: "Google Sans Text" nếu tải được qua Google Fonts (nếu không có, dùng "Roboto" làm chính,
  khai báo fallback `Roboto, "Segoe UI", sans-serif`).
- **Màu**: hệ màu tonal Material 3 — nền surface be nhạt (#FEF7FF hoặc tương đương), primary container
  tím/xanh nhạt, mỗi trạng thái đơn có 1 "tonal color" riêng (container nhạt + chữ đậm cùng tông,
  không phải nền trắng + chữ màu).
- **Web layout**: navigation rail bên trái (chỉ icon, mở rộng thành drawer đầy đủ khi bấm), top app
  bar có search pill bo tròn to, thẻ (card) bo góc lớn (16-24px), elevation bằng shadow mềm nhiều lớp.
  FAB (nút tròn nổi góc dưới phải) cho hành động "+ Tạo đơn".
  Filter dùng chip có thể chọn nhiều (Material chips).
- **Mobile (khung 390×844)**: bottom navigation bar kiểu Material 3 (pill indicator sau icon được
  chọn), FAB nổi phía trên bottom nav, bottom sheet Material (kéo lên/xuống bằng handle bar), dialog
  Material cho xác nhận hành động.
- Tinh thần chung: mềm mại, nhiều màu tonal, cảm giác Google, bo tròn nhiều.

## CONCEPT 3 — "Enterprise Command Center" (tham khảo: Ant Design Pro, IBM Carbon Design System)

- **File xuất**: `ui-concepts/concept-3-enterprise-carbon.html`
- **Font**: "IBM Plex Sans" (Google Fonts) — cảm giác doanh nghiệp/dữ liệu dày.
- **Màu**: nền trắng/xám xanh rất nhạt, viền vuông góc (bo góc tối thiểu 2-4px, KHÔNG bo tròn nhiều),
  tag trạng thái hình chữ nhật nhỏ có icon (✓ ✕ ⏳) đặt trước chữ, palette xanh dương IBM + xám trung
  tính, KPI card viền trái dày màu (accent border-left 4px).
- **Web layout**: sidebar trái CỐ ĐỊNH không thu gọn, có nhóm menu lồng nhau (module > sub-tab thụt
  vào); ngay dưới top bar là 1 hàng thẻ KPI (số liệu tồn đọng) bấm được; toolbar lọc dày đặc phía trên
  bảng (segmented control + multi-select dropdown + date range + nút "Lọc thêm"); bảng có header sort
  icon, checkbox cột đầu để bulk, phân trang dạng số trang ở chân bảng. Chi tiết mở bằng drawer PHẢI có
  tab con bên trong (Thông tin / Lịch sử xử lý / Hành động).
- **Mobile (khung 390×844)**: vì đây là phong cách "desktop-first", trên mobile ưu tiên vẫn giữ MẬT ĐỘ
  thông tin cao hơn bình thường (không tối giản hoá quá) — top bar có nút hamburger mở sidebar dạng
  drawer trượt từ trái đè lên toàn màn hình; danh sách chuyển thành card nhưng mỗi card vẫn hiện đủ
  3-4 field quan trọng (không chỉ 1 dòng tóm tắt); bộ lọc mở bằng bottom drawer riêng; có bottom bar
  "Thao tác" hiện ra khi chọn ≥1 dòng (bulk).
- Tinh thần chung: nặng về dữ liệu, chuyên nghiệp, giống phần mềm quản trị doanh nghiệp lớn.

## CONCEPT 4 — "Native Touch" (tham khảo: Apple Human Interface Guidelines, Ionic Framework)

- **File xuất**: `ui-concepts/concept-4-native-touch.html`
- **Font**: `-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif`.
- **Màu**: nền trắng/xám rất nhạt kiểu iOS (#F2F2F7), accent xanh dương iOS (#007AFF), status dùng màu
  pastel mềm (đỏ/cam/xanh lá/xám iOS system colors), bo góc 14-20px mọi nơi, shadow rất mềm/mỏng.
- **Web layout ở đây LÀ 1 khung app rộng vừa phải căn giữa** (max-width ~1000px, không full-width),
  mô phỏng kiểu "iPad split view": danh sách bên trái (~360px) + panel chi tiết bên phải, top có
  "Large Title" kiểu iOS (chữ tiêu đề rất to, đậm, căn trái, thu nhỏ khi cuộn). Thanh chuyển tab nằm
  ngang dạng segmented control (không phải sidebar menu dọc).
- **Mobile (khung 390×844) — đây là trọng tâm chính của concept này**: bottom tab bar 5 mục kiểu iOS
  (icon + label nhỏ, nền mờ/blur), mỗi màn có "Large Title" co lại khi cuộn xuống, danh sách dạng
  "grouped inset list" (card bo góc, có separator mảnh giữa các dòng, cả nhóm có nền trắng nổi trên
  nền xám F2F2F7), vuốt 1 dòng sang trái hiện nút hành động nhanh (swipe action màu đỏ/xanh, có thể mô
  phỏng bằng nút lộ ra khi hover/click vì đây là desktop browser, không cần touch event thật), xác
  nhận hành động dùng Action Sheet trượt từ dưới lên (không phải dialog giữa màn hình), pull-to-refresh
  có thể mô phỏng bằng 1 hàng "↓ Kéo để làm mới" tĩnh phía trên danh sách.
- Tinh thần chung: cảm giác app di động thật (không phải web thu nhỏ), rộng rãi, dễ chạm.

## CONCEPT 5 — "Warm Workspace" (tham khảo: Stripe Dashboard, Notion)

- **File xuất**: `ui-concepts/concept-5-warm-workspace.html`
- **Font**: "Plus Jakarta Sans" (Google Fonts) — sans-serif hình học, thân thiện.
- **Màu**: nền kem ấm (#FAF7F2, KHÔNG dùng trắng thuần), mỗi MODULE có 1 màu nhấn riêng để dễ phân biệt
  bằng mắt (ví dụ Mua hàng=xanh dương, Công nợ=tím, Trả hàng=cam, PXK=xanh lá, Thiếu LK=đỏ hồng), badge
  trạng thái tô nền màu nhạt + chữ đậm cùng tông (soft-filled, không viền), card bo góc 12-14px, rất ít
  đường viền cứng — dùng khoảng trắng/nền để phân tách khu vực thay vì kẻ line.
- **Web layout**: sidebar trái có icon màu theo module; NGAY ĐẦU trang chủ module là 1 khối "hero" lớn
  "Việc cần làm hôm nay" — hiển thị vài con số tồn đọng lớn, bấm vào nhảy tab (đúng tiêu chí UX #1+#2
  ở mục 3), bên dưới mới tới các tab/bảng. Danh sách có thể chuyển đổi giữa "dạng bảng" và "dạng cột
  Kanban theo trạng thái" bằng 1 nút gạt ở góc trên bảng (Kanban optional nhưng khuyến khích có ít
  nhất ở 1 màn, ví dụ PXK hoặc Trả hàng, để thể hiện sự khác biệt).
- **Mobile (khung 390×844)**: khối "hero việc cần làm" co lại thành 1 card lớn bo góc đặt trên cùng,
  bên dưới là dải chip lọc nhanh cuộn ngang, bottom nav 4 mục + 1 nút tròn (+) nổi giữa (giống nút "+"
  nổi trung tâm của nhiều app hiện đại) để tạo đơn nhanh.
- Tinh thần chung: ấm áp, thân thiện, workload-first rõ ràng nhất trong 5 concept, nhiều màu nhưng có
  hệ thống.
