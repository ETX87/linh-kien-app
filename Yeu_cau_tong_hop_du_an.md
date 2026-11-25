# Tổng hợp yêu cầu dự án "Đặt mua linh kiện" — từ đầu đến hiện tại

Tài liệu này gom lại **toàn bộ yêu cầu** bạn đã đưa ra cho dự án này, từ bản phân tích đầu tiên
(trước khi có dòng code nào) đến phiên làm việc hôm nay. Mục đích: để bạn rà soát lại toàn bộ một
lượt, thấy rõ yêu cầu nào đã đổi ý theo thời gian, yêu cầu nào còn treo chưa chốt, và yêu cầu nào đã
làm/chưa làm — từ đó quyết định chỗ nào cần đập đi làm lại.

**Nguyên tắc xử lý mâu thuẫn**: khi 2 yêu cầu ở 2 thời điểm khác nhau trái ngược nhau, tài liệu này
lấy **yêu cầu đến SAU làm chốt cuối cùng**, và ghi rõ yêu cầu cũ đã bị thay thế (không xoá, để bạn
đối chiếu lại nếu thấy tôi hiểu sai thời điểm nào).

**Ký hiệu trạng thái** (đánh giá của tôi qua đọc code hôm nay 2026-08-22 — có thể lệch nếu có sửa ở
nơi khác tôi chưa biết):
✅ Đã làm đúng · 🟡 Làm 1 phần / có sai lệch · ⬜ Chưa làm · ❓ Chưa xác minh được qua code.

---

## 0. Nguồn tổng hợp (theo đúng thứ tự thời gian)

| # | Nguồn | Giai đoạn |
|---|---|---|
| 1 | `1. Luồng quy trình đặt hàng.md` | Phân tích dữ liệu thật + đề xuất luồng, **trước khi viết code** — nhiều câu hỏi mở |
| 2 | `2. Giải đáp và cải tiến.txt` | Bạn trả lời 11 nhóm câu hỏi + chốt 19 điểm — **văn bản chốt nghiệp vụ đầu tiên** |
| 3 | `3. Ke hoach trien khai theo buoc.md` | Kế hoạch triển khai 8 bước theo đúng 19 điểm trên (do AI soạn) |
| 4 | `nhat_ky_lam_viec.md` | Nhật ký tách hệ thống độc lập khỏi DVBH gốc (2026-08-19) |
| 5 | `Vấn đề do Codex ghi nhận.txt` | Codex audit bảo mật/kiến trúc sau khi đã có code chạy + kế hoạch khắc phục bạn giao cho tôi |
| 6 | `Tiêu chí hệ thống.txt` | 4 tiêu chí UX bạn chốt lưu riêng |
| 7 | `codex góp ý giao diện.txt` | Codex audit UI/UX toàn diện (workload-first, drawer, bulk, responsive...) + roadmap 4 phase |
| 8 | Phiên làm việc trực tiếp với tôi (gần nhất, đang tiếp diễn) | "Trả hàng → PXK" → batch 6 lỗi/tính năng → 3 lỗi phát sinh → audit ma trận quyền hôm nay |

---

## PHẦN A — Yêu cầu nghiệp vụ & luồng quy trình

### A1. Vai trò & tổ chức

- **Mỗi KTV/Trạm do đúng 1 Giám sát (GS) phụ trách**, khai báo qua danh sách KTV trong Settings (cột
  "Giám sát quản lý" gắn email GS) — thay vì duyệt theo khu vực/tỉnh như đề xuất ban đầu, vì lúc lên
  đơn không xác định được tỉnh của KTV. *(Nguồn #2, điểm 1 — thay thế hẳn ý tưởng "duyệt theo khu vực"
  ở tài liệu #1).* → ✅ Đã làm (`ktv_lien_he.giam_sat_quan_ly`, `dat_mua_lk_phu_trach_gs`).
- **Vệ tinh là tài khoản đăng nhập riêng** (không phải danh sách nội bộ do Trạm tự quản lý), gán vào
  1 Trạm cụ thể. Bổ sung vai trò "KTV DVBH" dùng chung cho KTV/CTV/Trạm, đều có thể được gán Vệ tinh
  dưới trướng. *(Nguồn #2, điểm 10 — chốt câu hỏi B1)* → ✅ Đã làm (`la_ve_tinh`, `tram_cha`).
- **Trạm duyệt hàng loạt hoặc từ chối hàng loạt** đơn của Vệ tinh, có giao diện filter theo người
  tạo/trạng thái/thời gian tạo. *(Nguồn #2, điểm 11 — chốt câu hỏi B2, không bắt buộc duyệt tay từng
  đơn)* → ✅ Đã làm (`DonCuaToiTab` bulk theo `canBulkTram`).
- **Vệ tinh theo dõi được đơn của chính mình sau khi Trạm đẩy lên TN (Tác nghiệp); Trạm theo dõi đơn của bản thân +
  đơn được GS/Tác nghiệp tạo hộ + toàn bộ đơn của Vệ tinh dưới quyền.** *(Nguồn #2, điểm 12 — chốt câu
  hỏi B3)* → ✅ Đã làm (`scopeDatMuaNguoiTao`).
- Backend phải trả cờ **`la_tram` tính thật** (EXISTS user khác có `tram_cha` = mình), không được suy
  luận "không có `tram_cha`" = Trạm — vì như vậy KTV thường sẽ bị nhận nhầm thành Trạm và thấy trang
  rỗng. *(Nguồn #5, mục 17 — phát hiện lỗi + yêu cầu sửa)* → ✅ Đã làm (theo comment "GD4" trong code
  hiện tại, dùng `user.la_tram` thật).

### A2. Phân loại đơn hàng

- **Chia đơn thành 3 loại xử lý riêng: Mua hàng / Công nợ / Trả hàng**, để tránh nhầm lẫn. *(Nguồn #2,
  điểm 3)* → ✅ Đã làm (`loai_don` + 3 tab riêng).
- **ai là người tạo đơn** (KTV tự tạo / Tác nghiệp tạo hộ / GS tạo hộ)
- Các loại đề xuất khác nhau xử lý độc lập, lên PXK riêng không lẫn lộn chung các loại đề xuất khác nhau vào chung 1 PXK hoặc luồng xử lý ( Mua hàng / Công nợ / Trả hàng)
### A3. Luồng chính (Mua hàng / Công nợ)

- KTV/Trạm/Vệ tinh/GS lên đơn (chọn mã LK theo Danh mục linh kiện + loại đề xuất + số lượng + ghi
  chú) → **Tác nghiệp duyệt** → tạo mã phiếu xuất kho → gửi Kế toán tạo mã MISA. *(Nguồn #2, điểm 2)*
  → ✅ Đã làm, có thêm bước "TBP xác nhận LK đặc thù" chen giữa Trạm duyệt và TN duyệt (bổ sung sau,
  migration 0082 hệ gốc — không thấy nhắc trong văn bản chốt gốc, nhưng đã thành 1 phần luồng chính
  hiện tại, ghi nhận ở đây để không bị hiểu nhầm là lệch yêu cầu).
- Bulk action **phải hỗ trợ cả import Excel**, không chỉ phê duyệt/từ chối hàng loạt. *(Nguồn #6, tiêu
  chí 4)* → ✅ Đã làm (import hàng loạt đơn, KTV, linh kiện — nhiều nơi).

### A4. Luồng "Đơn trả hàng"

**Phiên bản 1 (Nguồn #2, điểm 4 — bản gốc, chi tiết nhất):**
GS/KTV lên đơn trả hàng → Kế toán duyệt mềm (KTV có đủ hàng trong kho để trả không) → Kho xác nhận
(hàng đã về kho) → QC xác nhận (hàng đủ điều kiện — không hư hỏng/cũ bẩn/rách, tem mác còn nguyên,
vẫn hoạt động) → Tác nghiệp duyệt tổng (đồng ý/từ chối) → **lên đơn hàng PXK** (gộp nhiều đơn trả hàng của cùng 1 ktv) → Kế toán xác nhận đồng ý duyệt, điền mã misa → **Kho xác nhận nhập kho** → kết thúc.

**Các điểm khác của luồng trả hàng đã chốt và không đổi qua các phiên bản:**
- Trong mọi bước xử lý (Kế toán/Kho/QC/TN), **Kế toán hoặc Kho đều có quyền đẩy phiếu lùi lại bước
  trước hoặc từ chối thẳng/hủy đơn**. *(Nguồn #2, điểm 19)* → ✅ Đã làm (`POST /tra-hang/:id/log-lui`).

### A5. Danh mục linh kiện, BOM, linh kiện thay thế

- **Không dùng giá nhập tay mỗi đơn** — dựng danh mục linh kiện chuẩn (mã + tên + giá bán),
  hiện **tổng giá đề xuất** ngay lúc lên đơn dựa vào danh mục; **Tác nghiệp là người chốt và sửa lại
  số tiền cho chuẩn**, lập phiếu số tiền cần chuyển cho KTV **trước** bước tạo mã xuất kho. *(Nguồn
  #2, điểm 18 — chốt câu hỏi F2)* → ✅ Đã làm (`linh_kien.gia_ban`, `gia_chot` do TN sửa, phiếu chuyển
  tiền trước PXK).
- **BOM chỉ dùng để tra cứu mã linh kiện** theo Model (module tra cứu riêng, Admin import định
  kỳ từ Excel) — **không** dùng BOM để giới hạn danh sách lựa chọn khi lên đơn; danh sách chọn vẫn là
  toàn bộ "Danh mục linh kiện" trong Settings. *(Nguồn #2, điểm 15 — chốt câu hỏi E1, ngược lại với
  đề xuất ban đầu ở tài liệu #1)* → ❓ chưa xác minh module tra cứu BOM riêng có tồn tại đúng như mô tả.
- **Gợi ý linh kiện thay thế hiện cho TOÀN BỘ người dùng** khi mã họ chọn có nhóm thay thế tương ứng
  (không chỉ riêng Kho/Tác nghiệp lúc xử lý đơn thiếu hàng như đề xuất ban đầu); GS/TN có thể bổ sung
  thêm vào nhóm thay thế ngay tại đó. *(Nguồn #2, điểm 16 — chốt câu hỏi E2, mở rộng hơn đề xuất gốc)*
  → ✅ Đã làm (`ThayTheGoiY` trong `TaoDonTab`/`TaoDonMobileScreen`, xem `3. Ke hoach trien khai...`
  bước 2).

### A6. Liên kết với hệ DVBH gốc (case sự cố)

- Mọi đơn linh kiện **có thể tuỳ chọn gắn 1 mã yêu cầu sự cố (case)** liên quan (không bắt
  buộc). *(Nguồn #2, điểm 14 — chốt câu hỏi D1)* → ✅ Đã làm (`dat_don_case`), nhưng xem cảnh báo bảo
  mật liên quan ở mục B2 bên dưới (quyền gắn/gỡ case).
- **Phạm vi kéo dữ liệu từ hệ gốc tra cứu case theo ID** => sẽ kéo 1 số thông tin cơ bản, tạo 1 button bên cạnh để người dùng click vào xem nếu cần.
- Hệ mới **không di chuyển dữ liệu lịch sử** — bắt đầu rỗng; chỉ copy 1 lần các bảng tham chiếu
  (`ktv_lien_he`, `linh_kien`, settings) lúc triển khai. *(Nguồn #4)* → ✅ Đã làm. => bỏ

### A7. Phạm vi kỹ thuật & công nợ

- **Công nợ/hạn mức tín dụng xử lý ở ngoài hệ thống (AMIS)** — module mới **chưa cần** tự quản lý số
  dư/hạn mức ở giai đoạn này. *(Nguồn #2, điểm 13 — chốt câu hỏi C1)* → ✅ Đúng theo yêu cầu (chưa có
  tính năng này, không phải thiếu sót).

### A8. SLA từng bước, quá hạn, giải trình, gắn thẻ vi phạm (2026-11-17, v1.517)

- Nguyên văn quản lý: *"API: Bổ sung: Trả hàng - Các ca quá hạn - giải trình liên quan; Đặt linh kiện - Các ca quá hạn; Các ca bị gắn thẻ
  vi phạm"*, *"Cải tiến đặt hàng: Trạng thái ghi rõ thuộc bước nào; Đặt SLA từng bước; Các ca quá hạn xử lý"*. Chốt: *"app vi phạm là 1 app
  bên ngoài … triển khai theo hướng mở để đối tác tự kéo, chúng ta cung cấp api là đc"*.
- Mỗi bước có SLA (giờ) do Admin cấu hình; quá hạn → bộ phận phụ trách giải trình trong hạn giải trình; hết hạn chưa giải trình → gắn thẻ
  vi phạm; Admin gỡ thẻ kèm lý do. Màn "Quá hạn & vi phạm" cho nhân viên văn phòng. Đối tác đọc `GET /api/partner/v1/vi-pham`. → ✅ Đã làm.
- Mặc định (chưa có số chốt từ quản lý): 24h mỗi bước (Mua hàng 48h), hạn giải trình 24h, không tính cuối tuần. Bước "KTV xác nhận đã
  nhận hàng" / "KTV chuyển tiền" CHƯA tính (đã có tự xác nhận sau 10 ngày; KTV chưa có màn giải trình).
- v1.527 (2026-11-19) chốt: *"các logic quá hạn SLA trên toàn bộ hệ thống từ 24h =>8h, 48h => 16h làm việc (loại trừ 8h chủ nhật và 4h
  chiều thứ 7)"* → mọi hạn SLA (Lý do chậm TN, 4 giai đoạn trả hàng, 12 bước SLA, hạn giải trình) tính theo giờ làm việc: T2–T6 08–12 + 13–17,
  T7 08–12, CN nghỉ; 24h → 8, 48h → 16. → ✅ Đã làm.
- v1.518: người phải giải trình cụ thể theo khu vực / GS của đơn; thông báo ca mới / sắp hết hạn / gắn thẻ; thanh cảnh báo trong chi tiết
  đơn / phiếu / ticket; giải trình bắt buộc chọn lý do; "Báo không đúng" → Admin xem xét; tab "Tổng hợp theo dõi"; tài liệu
  `docs/Huong_dan_giai_trinh_qua_han_theo_vai_tro.html`. → ✅ Đã làm.
- Chốt 2026-11-18 (ĐÈ "Báo không đúng → Admin xem xét" của v1.518): *"việc giải trình không đúng cũng chỉ tính là giải trình thôi, không cần
  phải thêm vai trò của admin. admin không thực hiện công việc xác nhận bỏ thẻ trên hệ thống này"*; *"KTV không cần giải trình, BO tham gia
  việc giải trình là được"* → ghi nhận sai = giải trình với lý do "Ghi nhận không đúng / không thuộc trách nhiệm"; không có gỡ thẻ; chỉ BO
  giải trình. → ✅ v1.519.
- Chưa làm: "Trả key API cũ" (key chỉ lưu dạng băm — không lấy lại được bản gốc, cần quản lý nói rõ là cấp lại hay thu hồi); luồng
  chuyển kho nội bộ thật.

---

- **Kết quả Mua hàng (EO) theo ID** (2026-11-20, v1.543): "dựa vào ID case và ID đơn hàng để trả kết quả về bên app linh kiện" — chi tiết đơn
  và ticket thiếu hàng hiện PO bên app EO Mua hàng (mã 3TDO, trạng thái, SL đặt / về / thiếu, ngày dự kiến) khớp theo mã đơn / ticket / case.

## PHẦN B — Yêu cầu bảo mật, phân quyền & kiến trúc dữ liệu

*(Nguồn: "Vấn đề do Codex ghi nhận.txt" — audit sau khi đã có code chạy thật, phát hiện lỗ hổng +
kế hoạch khắc phục giao thẳng cho tôi. Đối chiếu trạng thái với audit ma trận quyền tôi vừa làm hôm
nay.)*

**Nguyên tắc phân quyền được chốt lúc đó** (áp dụng cho mọi mục bên dưới):
Phải tách rõ 3 khái niệm — (1) quyền MỞ module, (2) PHẠM VI dữ liệu được xem, (3) quyền THỰC HIỆN 1
bước nghiệp vụ cụ thể — không được trộn lẫn 3 khái niệm này như trước, và **backend phải tự kiểm
tra lại mọi quyền/phạm vi, không được chỉ dựa vào việc frontend có ẩn nút hay không**.

| # | Yêu cầu khắc phục | Trạng thái hôm nay |
|---|---|---|
| 1 | Bỏ hẳn `DELETE /don-hang/:id`, thay bằng transition "hủy" có audit (chỉ người tạo/Tác nghiệp/Admin, bắt buộc lý do, không xoá log) | ❓ Chưa xác minh endpoint DELETE còn tồn tại hay đã bỏ hẳn — **cần kiểm tra riêng** |
| 2 | Quyền gắn/gỡ case: chỉ người tạo (khi đơn còn mở) + Tác nghiệp + Admin, có audit log | 🟡 Audit ma trận quyền hôm nay xác nhận: **đã có** kiểm tra người tạo/Tác nghiệp/Admin ở `canManageDonHangCaseLink` (`datMuaLinhKien.ts:1491-1508`) — có vẻ đã khắc phục, nhưng chưa xác nhận có audit log riêng cho hành động này |
| 3 | Xác nhận "KTV đã chuyển tiền" chỉ được thực hiện bởi đúng người nhận hàng (hoặc Tác nghiệp xác nhận thay có audit rõ) | ✅ Đã khắc phục — audit hôm nay xác nhận `POST /:id/bang-chung-chuyen-tien` và bước "KTV da chuyen" đều kiểm tra đúng `nguoi_nhan_hang` (`phieuXuatKho.ts:375, 421`) |
| 4 | Quyền module phải được backend enforce thật (`requireModuleAccess`), không chỉ ẩn UI | ❓ Chưa xác minh có middleware `requireModuleAccess` cấp module hay chưa — audit hôm nay mới xác nhận từng route có role-check riêng (`requireDatMuaLkArea`), chưa rõ có tách lớp "quyền mở module" độc lập như yêu cầu |
| 5 | Danh sách/chi tiết PXK và Trả hàng phải giới hạn theo vai trò/phạm vi, không rò rỉ toàn bộ | ✅ Đã khắc phục — audit hôm nay xác nhận `scopePxkNguoiNhanHang`/`scopeDatMuaNguoiTao` đã áp dụng đầy đủ cho các endpoint này |
| 6 | GS tạo đơn hộ phải kiểm tra `target.giam_sat_quan_ly = GS đang gọi`, không chỉ lọc dropdown frontend | ✅ Đã khắc phục — audit hôm nay xác nhận `NGUOI_NHAN_HANG_NGOAI_PHAM_VI` check tại `datMuaLinhKien.ts:724-725` |
| 7 | Làm rõ trường hợp GS tạo đơn không chọn người nhận (mặc định về chính GS) — xác nhận GS có hợp lệ là người nhận hàng thật không | ❓ Cần xác nhận lại nghiệp vụ — chưa rõ trạng thái code |
| 8 | Chuyển trạng thái phải dùng CAS (`trang_thai_hien_tai` + `version`, `UPDATE ... WHERE version = ?`) để tránh 2 request duyệt đồng thời ghi đè nhau | ✅ Đã khắc phục — đây là nền tảng đã áp dụng xuyên suốt `dat_don_hang`/`phieu_xuat_kho` (cột `trang_thai_hien_tai`/`version` + CAS, đã xác nhận nhiều lần qua audit hôm nay) |
| 9 | Giới hạn số lượng ID trong API bulk (đề xuất 50–100/request), loại trùng, xử lý theo batch | ✅ Đã khắc phục — `MAX_BULK_IDS = 100` đã áp dụng cho `bulk-log` ở cả `datMuaLinhKien.ts`/`traHang.ts` |
| 10 | Pipeline nên dùng bảng đếm tăng/giảm theo transition (`pipeline_counts`) thay vì 16 subquery đếm mỗi 5 phút | ❓ Chưa xác minh — cách hiện tại (theo trao đổi trong phiên hôm nay) vẫn có vẻ là tính trực tiếp lúc gọi API, không chắc đã có bảng đếm riêng như đề xuất. **Khả năng cao vẫn CHƯA làm** phần kiến trúc này (chi phí lớn, thường để sau) |
| 11 | Danh sách đơn hàng tránh quét COUNT(*) + SELECT riêng biệt 2 lần, cân nhắc cursor pagination | ❓ Chưa xác minh |
| 12 | PXK/Thiếu LK/Trả hàng phải phân trang ở BACKEND, không lấy hết rồi `.slice()` ở frontend | ✅ Đã khắc phục — audit hôm nay xác nhận cả 2 tab đều dùng `page`/`pageSize` gọi API phân trang thật (đã tự tay xác minh khi sửa `ThieuLkTab`/`DonCuaToiTab` trong phiên này) |
| 13 | Thêm composite index theo mẫu truy vấn thật (`loai_don, trang_thai_hien_tai, email_gs, ngay_tao`...) | ❓ Chưa xác minh — cần xem migrations |
| 14 | Validate toàn bộ dòng trước khi cấp ID (tránh mất khoảng trống ID khi có dòng lỗi ở cuối) | ❓ Chưa xác minh |
| 15 | Đổi filter phải reset về trang 1 + xoá selection | ✅ Đã khắc phục — pattern này đã thấy dùng nhất quán trong các tab đã sửa ở phiên này |
| 16 | Selection không được giữ qua khi đổi trang/filter (tránh bulk nhầm đơn không còn hiển thị) | ✅ Đã khắc phục — cùng pattern với mục 15 |
| 17 | Backend phải trả cờ `la_tram` tính thật, không suy luận qua `!tram_cha` | ✅ Đã khắc phục (trùng với mục A1 ở trên) |
| 18 | Pipeline và danh sách đích phải dùng CHUNG 1 định nghĩa phạm vi (scope), tránh số đếm không khớp khi bấm vào | 🟡 Đây **chính là loại lỗi** tôi vừa sửa trong phiên làm việc gần đây nhất (mục "Pipeline filter mismatch" — bấm số trên pipeline ra danh sách khác số) — đã sửa 1 trường hợp cụ thể (`loai_don`), nhưng theo nguyên tắc rộng của yêu cầu này thì cần rà soát toàn bộ, không chỉ 1 điểm đã gặp |

**Kế hoạch khắc phục tổng thể đã giao (Nguồn #5, "Kế hoạch giao Claude")** — vẫn còn giá trị tham
chiếu cho các hạng mục ❓/⬜ ở trên: viết ma trận quyền cho từng endpoint trước khi sửa (✅ **chính là
việc tôi vừa làm xong hôm nay** — 3 ma trận quyền), thêm middleware `requireModuleAccess`, chuyển
pipeline sang bảng đếm + reconciliation định kỳ, viết test cho ma trận quyền/transition đồng
thời/scope/bulk.

---

## PHẦN C — Yêu cầu giao diện & trải nghiệm (UI/UX)

### C1. 4 tiêu chí UX gốc (Nguồn #6 — `Tiêu chí hệ thống.txt`, chốt sớm nhất trong nhóm UI)

1. **Mỗi vai trò vào module thấy ngay việc cần xử lý + số tồn đọng rõ theo từng loại** (không phải
   số liệu chung chung).
2. **Số tồn đọng phải bấm được → nhảy thẳng đến đúng màn hình/tab/filter xử lý**, không bắt tự đi
   tìm lại.
3. **Nút hành động "1 chạm"** cho thao tác phổ biến nhất trên các màn hình xử lý.
4. **Hỗ trợ xử lý hàng loạt đúng nhu cầu từng vai trò — kể cả import Excel**, không chỉ phê
   duyệt/từ chối hàng loạt.

→ Trạng thái: 🟡 **Làm 1 phần, không đồng đều** — pipeline có số đếm bấm-nhảy-tab (tiêu chí 1+2) đã
có ở hầu hết các bước, nhưng như audit ma trận quyền hôm nay chỉ ra (Vấn đề #2, #5), một số vai trò
(QC, TP DVBH ở khu vực Trả hàng) đang thấy số/dữ liệu SAI theo scope thật của họ — vi phạm đúng tinh
thần tiêu chí 1. Bulk + import (tiêu chí 4) đã có nhưng không đồng nhất giữa các tab (đúng như Codex
UI audit bên dưới cũng chỉ ra).

### C2. Codex UI/UX Audit toàn diện (Nguồn #7 — đến SAU 4 tiêu chí gốc, mở rộng/chi tiết hoá rất
nhiều so với 4 tiêu chí, coi là bản cập nhật/bổ sung, không mâu thuẫn)

Bản audit này chấm **UX hiện trạng 6.4/10**, mục tiêu 9/10, và đề xuất kiến trúc lại toàn bộ theo
hướng **"workload-first"** thay vì "cấu trúc theo loại dữ liệu". 3 thay đổi giá trị cao nhất theo bản
audit này:

1. **Role-based work queue ngay khi mở module** (mặc định vào đúng hàng đợi việc của vai trò, không
   phải màn hình chung).
2. **Detail dùng drawer bên phải (không dùng Modal) + nút "Duyệt và tiếp"** để xử lý liên tiếp nhiều
   dòng mà không mất ngữ cảnh danh sách.
3. **Quick filter (chip/segmented) tách khỏi Advanced filter (drawer)**, và bulk workflow thống nhất
   giữa các tab (chọn dòng → xem trước → xác nhận → kết quả thành công/lỗi rõ ràng).

**Roadmap 4 phase đề xuất** (Quick Wins → UX Improvement → Structural → Advanced) — xem nguyên văn
đầy đủ trong `codex góp ý giao diện.txt` mục 25. Trạng thái tổng quan:

- ✅ Đã làm phần lớn "Phase 1" theo tinh thần: pipeline hiển thị workload theo vai trò, mặc định mở
  đúng tab của vai trò (`defaultView` theo `canKho`/`canKeToan`/`canQC`), giữ filter qua
  `useLocalStorageState`, chuẩn hoá 1 số error message, loading state rõ trong `Btn` (`loading`
  prop).
- 🟡 **Chưa làm phần lớn "Phase 2/3"**: vẫn dùng **Modal cho chi tiết** (chưa chuyển sang
  **drawer bên phải** như đề xuất), chưa có "Duyệt và tiếp" (Next item) xuyên suốt, filter vẫn là
  Select lớn ở một số tab (chưa tách hẳn quick/advanced dạng chip), bulk action vẫn implement riêng
  lẻ theo từng tab (`ThieuLkTab`/`TraHangTab`/`DonCuaToiTab` đều có phiên bản bulk-confirm riêng, chưa
  dùng 1 component chung).
- ✅ Trên **mobile riêng** (phiên làm việc gần nhất), đã áp dụng đúng tinh thần "workload-first +
  không mất ngữ cảnh" cho MÀN HÌNH TẠO ĐƠN cụ thể (full-screen, chip điều hướng dòng, không phải
  wizard tuyến tính) — nhưng đây mới là 1 màn hình, chưa áp dụng cho toàn bộ luồng xử lý (duyệt/PXK/
  thiếu LK) như audit đề xuất.
- ⬜ Chưa làm: encoding UTF-8 (audit ghi "Critical" — nhưng đây có thể là vấn đề CỦA MÔI TRƯỜNG ĐỌC
  FILE lúc audit, không chắc còn đúng ở code hiện tại, cần tự kiểm tra lại), keyboard shortcut, saved
  views, virtualized list, notification/polling thời gian thực.

### C3. Yêu cầu UI phát sinh trong phiên làm việc gần nhất (đến SAU cùng, mới nhất — ưu tiên áp dụng
nếu có khác biệt với C1/C2 ở trên)

- "Đã hủy bỏ" (hiển thị quá khứ) đổi thành "Hủy bỏ" (mệnh lệnh) trên **nút hành động** — phân biệt rõ
  nhãn trạng thái (quá khứ) và nhãn nút bấm (mệnh lệnh), áp dụng cho mọi nút tương tự, không chỉ 1 chỗ.
  → ✅ Đã làm.
- **Tô màu ưu tiên (⭐ cam) phải lan xuống mọi quy trình con** của 1 đơn ưu tiên (Thiếu LK, Trả hàng),
  không chỉ ở đơn gốc. → ✅ Đã làm.
- **Format hiển thị của "Thiếu linh kiện" phải đồng nhất với "Mua hàng"/"Công nợ"** (cùng kiểu nhóm
  theo KTV, cùng kiểu nút icon, cùng kiểu chọn hàng loạt) — không được để 1 màn hình có "giao diện
  khác lạ" so với phần còn lại của module. → ✅ Đã làm (viết lại `ThieuLkGroupedList`).
- **Giao diện tạo đơn trên mobile phải full màn hình**, tránh vùng bị bàn phím che khuất (`100dvh`
  thay vì `100vh`), có phương án dự phòng quay lại giao diện cũ và ngược lại (2 chiều), nút +/- số
  lượng ≥44px trên mobile. → ✅ Đã làm, đã qua 1 vòng tranh luận thiết kế 2 vai trò trước khi code
  theo đúng yêu cầu quy trình bạn đặt ra lúc giao việc này.
- **Mỗi vai trò chỉ nên thấy màn hình/tab thực sự phục vụ công việc của mình** — đây là yêu cầu bạn
  nêu tường minh nhất trong batch gần đây ("kho chỉc có chức năng khi duyệt trả hàng hoặc đóng hàng
  gửi ktv") → tôi đã áp dụng cho trường hợp cụ thể (ẩn Mua hàng/Công nợ khỏi Kho/Kế toán thuần), và
  **audit ma trận quyền hôm nay cho thấy đây là 1 NGUYÊN TẮC CHUNG cần rà soát thêm** ở các chỗ khác
  (QC/TP DVBH ở màn Báo cáo và Trả hàng chỉ-xem — xem Vấn đề #2, #5 trong `Ma_tran_kiem_soat_he_thong.xlsx`,
  sheet "5. Vấn đề phát hiện").
- **Phí dịch vụ do KTV nhập số tiền thực tế** (25/11/2026): "với mã linh kiện phí dịch vụ (đang để 150.000) cho phép ktv sửa lại số tiền thực tế. (khi ktv chọn mã phí dịch vụ, hiện cảnh báo là phí có thể thay đổi và hiện số tiền để ktv nhập hoặc giữ nguyên)" → ✅ Đã làm (v1.561): chọn mã có tên
  "phí dịch vụ" → cảnh báo + ô số tiền điền sẵn giá danh mục, giữ nguyên hoặc sửa; số khác ghi làm giá chốt của đơn.

---

## PHẦN D — Bảng tổng hợp các mâu thuẫn đã phát hiện (yêu cầu sau đè yêu cầu trước)

| Chủ đề | Yêu cầu cũ | Yêu cầu mới hơn (chốt theo nguyên tắc "sau đè trước") | Cần bạn xác nhận lại? |
|---|---|---|---|
| Duyệt đơn theo khu vực/tỉnh | Đề xuất ban đầu (`1. Luồng...md`) | Bỏ hẳn, chuyển sang gán trực tiếp GS↔KTV (`2. Giải đáp...`, điểm 1) | Không — đã rõ ràng |
| Vệ tinh có phải tài khoản riêng | Để ngỏ, nghi vấn "chỉ là danh sách nội bộ" | Có — tài khoản đăng nhập riêng (`2. Giải đáp...`, điểm 10) | Không — đã rõ ràng |
| BOM dùng để lọc danh sách chọn LK | Đề xuất ban đầu: có thể dùng BOM lọc sẵn theo Model | Không — BOM chỉ để tra cứu, danh sách chọn vẫn là toàn bộ Danh mục (`2. Giải đáp...`, điểm 15) | Không — đã rõ ràng |
| **Kết thúc luồng Trả hàng** | V1: Kế toán xác nhận + **Kho xác nhận nhập kho** mới hết (`2. Giải đáp...`, điểm 4) | V2: chỉ cần Kế toán xác nhận "kết thúc" là đủ, bỏ bước Kho (`2. Giải đáp...`, điểm 8) | **CÓ — xem thêm V3** |
| **Kết thúc luồng Trả hàng (bản mới nhất)** | V2 ở trên | V3: đã code thành tạo PXK thật (`loai_don='tra_hang'`), **Kho vẫn có bước xác nhận nhận hàng trả về** (phiên làm việc trước, "Trả hàng → PXK") | **CÓ — đề nghị xác nhận V3 có đúng ý muốn, hay quay lại V2** |
| Đồng bộ song song với Sheet/AppSheet cũ | Cần chạy song song 2 chiều giai đoạn đầu (`2. Giải đáp...`, điểm 17) | Hệ mới độc lập hoàn toàn, không thấy cơ chế đồng bộ 2 chiều nào trong code (`nhat_ky_lam_viec.md`) | **CÓ — xem mục A7** |
| Duyệt Trạm | Đề xuất ban đầu: có thể cần luật tự-duyệt theo điều kiện | Chốt: Trạm duyệt tay nhưng có công cụ duyệt HÀNG LOẠT (không phải luật tự động) (`2. Giải đáp...`, điểm 11) | Không — đã rõ ràng |

---

## PHẦN E — Câu hỏi/quyết định còn treo, chưa từng được chốt dứt điểm

Những điểm này xuất hiện trong tài liệu nguồn nhưng **không thấy câu trả lời rõ ràng** ở bất kỳ tài
liệu nào sau đó — liệt kê lại để bạn quyết định, tôi không tự suy đoán thay:

1. **Mã "3T-6A5V2W"/"mã EO"** trong ghi chú Tác nghiệp — đã xác nhận là hệ thống riêng, "không cần
   quan tâm" (`2. Giải đáp...`, điểm 9) — coi như đã chốt là **bỏ qua**, không phải câu hỏi treo, ghi
   lại ở đây để tránh ai đó sau này nhầm là còn thiếu.
2. **GS tạo đơn không chọn người nhận → mặc định chính GS là người nhận hàng** — Codex đặt câu hỏi
   nghiệp vụ (`Nguồn #5`, mục 7): GS có thực sự có thể đóng vai người nhận hàng, tự thực hiện các
   bước như KTV (chuyển tiền, xác nhận nhận hàng) hay không? Chưa thấy câu trả lời trực tiếp ở tài
   liệu nào sau đó. => GS có quyền đặt hàng cho bản thân. triển khai như ktv.
3. **Module tra cứu BOM riêng** (Admin import định kỳ từ Excel) — đã chốt là cần có (`2. Giải
   đáp...`, điểm 15), nhưng tôi chưa xác minh module này có tồn tại đúng như mô tả trong code hiện
   tại hay chưa. => hiện tại chưa xây
4. **`requireModuleAccess` ở tầng backend** (tách bạch quyền mở module ra khỏi quyền xử lý bước) —
   Codex yêu cầu rõ (`Nguồn #5`, mục 4) nhưng chưa xác minh được đã làm hay chưa. => không rõ
5. **Kiến trúc bảng đếm pipeline riêng** (`pipeline_counts` + reconciliation định kỳ) — đề xuất kỹ
   thuật khá lớn (`Nguồn #5`, mục 10), nhiều khả năng vẫn chưa triển khai vì chi phí cao, cần bạn xác
   nhận có còn cần thiết không hay hiện trạng (tính trực tiếp lúc gọi API) đã đủ dùng.
6. **QC nên thấy Báo cáo tổng thể ở dạng nào** — audit ma trận quyền hôm nay phát hiện QC bị hiển thị
   sai (thẻ cá nhân thay vì bảng đầy đủ dù backend cấp quyền không giới hạn) — đây là phát hiện MỚI
   hôm nay, chưa từng được bạn chốt theo hướng nào, cần quyết định. => chỉ nhìn thấy cái mình cần xử lý

---

## Cách dùng tài liệu này tiếp theo

Đề nghị bạn đọc theo thứ tự: **Phần D (mâu thuẫn) → Phần E (câu hỏi treo) → Phần A/B/C** (chi tiết
từng mảng) — 2 phần đầu là nơi có khả năng cao nhất cần "đập đi làm lại", vì đó là chỗ yêu cầu đã đổi
ý nhiều lần hoặc chưa từng có câu trả lời dứt khoát.
