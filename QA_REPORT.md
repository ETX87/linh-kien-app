# Báo cáo QA toàn hệ thống "Đặt mua linh kiện" — 2026-08-31

Test thực hiện trực tiếp trên UI (không chỉ gọi API) bằng cơ chế "Xem thử vai trò" (Admin-only
`viewAsRole`) + tài khoản dev-login local, đóng vai từng nhóm quyền, thao tác y hệt người dùng thật:
click, gõ, chọn filter, đọc toast/nhãn/màu, theo dõi network request khi cần xác minh.

## 1. Phạm vi & giới hạn môi trường test

- Backend `wrangler dev` (port 8788) + frontend `vite dev` (5174), D1 local (`.wrangler/state`),
  `LOCAL_DEV_BYPASS_AUTH=true` (dev-login luôn vào bằng `smarttrade.vp@gmail.com`, Admin thật).
- **Giới hạn cố hữu của "Xem thử vai trò"**: đổi *quyền* (`vai_tro`/các cờ `la_*`) nhưng KHÔNG đổi
  *danh tính* — mọi `nguoi_tao`/hành động vẫn ghi bằng email Admin thật. Vì vậy không test được tình
  huống "người tạo khác người duyệt" (ví dụ: tự thông báo cho chính mình khi tự duyệt đơn của mình —
  đã xác nhận đây là hành vi cố ý, xem mục 4).
- **Google Drive OAuth chưa cấu hình ở local** (theo đúng `DEPLOY.md`, hệ chưa deploy production) →
  không tải được ảnh thật lên Drive. Đã xác minh mọi màn cần ảnh (bằng chứng chuyển tiền PXK, ảnh linh
  kiện cần trả) đều báo lỗi RÕ RÀNG, đúng hướng xử lý ("Chưa kết nối tài khoản Google Drive - vào Cài
  đặt để kết nối") thay vì lỗi mơ hồ hay treo — coi là đạt, nhưng bản thân bước upload ảnh thật (chọn
  file, nén, preview) chưa test được 100% trên local.
- Với 1 số luồng cần dữ liệu không có sẵn (KTV vai trò "Vệ tinh" có Trạm cha, linh kiện "đặc thù"),
  đã tạo fixture tạm thời qua SQL cục bộ (KHÔNG đụng dữ liệu người dùng thật, chỉ set cờ trên chính
  tài khoản Admin test + linh kiện test `TEST-UI-001`), test xong đã revert lại nguyên trạng.

## 2. Vai trò & luồng đã test end-to-end trên UI thật

| Vai trò | Luồng đã test | Cách xác minh |
|---|---|---|
| KTV/CTV | Tạo đơn mua hàng, xem "Cần làm", xem PXK + tự xác nhận chuyển tiền/nhận hàng ngay trong chi tiết đơn (tính năng mới) | Click thật, network request thật |
| Vệ tinh | Tạo đơn (khởi tạo "Chờ Trạm duyệt"), badge/pipeline cá nhân hoá | Click thật |
| Trạm | Duyệt đơn của Vệ tinh cấp dưới (kiểm tra permission thật qua `tram_cha`, không phải bypass Admin) | Click thật, xác nhận chuyển trạng thái đúng |
| TP DVBH (TBP) | Duyệt đơn linh kiện "đặc thù" | Click thật |
| Tác nghiệp (TN) | Duyệt/từ chối/chờ hàng đơn mua hàng; duyệt tổng trả hàng; tạo PXK trả hàng; gửi Kế toán | Click thật, theo dõi state machine |
| Kế toán | Duyệt mềm trả hàng; nhập Mã MISA + chốt xong đơn xuất PXK trả hàng; (từ phiên trước) xác nhận chuyển tiền PXK mua hàng | Click thật |
| Kho | Xác nhận trả hàng; xác nhận "đã nhận hàng trả" (đóng PXK trả hàng); (từ phiên trước) gửi hàng PXK mua hàng, xử lý ticket thiếu LK | Click thật |
| QC | Xác nhận trả hàng (**đây là màn "báo cáo" thật của QC** theo quyết định thiết kế đã chốt, không phải bug khi QC không thấy báo cáo pivot toàn hệ thống) | Click thật |
| Giám sát | Badge/pipeline cá nhân hoá theo cờ `giam_sat_quan_ly` | View-as + kiểm tra số liệu |
| Admin | Toàn quyền, bootstrap, xem thử vai trò | Xuyên suốt |

**Luồng trả hàng đã đi hết 9 bước thật trên UI** (không dùng SQL để nhảy cóc trạng thái, trừ bước tạo
đơn ban đầu phải né bước upload ảnh do giới hạn Drive OAuth cục bộ nêu ở mục 1):
`Tạo đơn (KTV)` → `Chờ kế toán duyệt mềm` → `Chờ kho xác nhận` → `Chờ QC xác nhận` → `Chờ TN duyệt
tổng` → `TN đã duyệt (chờ tạo PXK)` → `TN tạo PXK trả hàng` → `Gửi kế toán` → `Kế toán chốt xong đơn
xuất` → `Kho đã nhận hàng trả` (đóng). Toàn bộ 9 bước chuyển trạng thái đúng, đúng vai trò được phép
thao tác, đúng dữ liệu hiển thị.

## 3. Bug đã phát hiện và SỬA trong phiên làm việc này

1. **"Đơn bị từ chối" không có badge nhắc việc bền vững** — KTV bị từ chối đơn không có cách nào biết
   trừ khi tự vào xem lại danh sách. Đã thêm đếm `choDonBiTuChoi` (`thong_bao_ktv` chưa đọc, loại
   `tu_choi`) vào badge tổng.
2. **Vệ tinh/Giám sát bị thiếu `roleKey: "ktv"`** trong bảng đối chiếu vai trò → 1 số StatCard cá nhân
   hoá không nhận diện đúng 2 vai trò này là "của tôi".
3. **"Chờ tiền"/"KTV" (2 bước cuối PXK) đếm TOÀN HỆ THỐNG thay vì đếm CÁ NHÂN** cho KTV — 1 KTV nhìn
   thấy số đơn chờ chuyển tiền của TẤT CẢ KTV khác, gây hiểu lầm "tôi có N việc cần làm" trong khi
   thực tế không phải việc của họ. Đã tách `countCuaToi` riêng theo `nguoi_nhan_hang`.
4. **Phát hiện lớn nhất của cả đợt QA: KTV/CTV/Vệ tinh hoàn toàn không có đường dẫn UI tới hành động
   PXK của chính mình** (xác nhận đã chuyển tiền, xác nhận đã nhận hàng) dù backend đã cho phép từ
   trước. Bấm StatCard "Chờ tiền" bị điều hướng SAI, im lặng rơi về tab mặc định (không báo lỗi) do
   `isValidView` fallback không có cảnh báo. Theo xác nhận người dùng ("Vệ tinh không cần xem PXK
   riêng, mọi thông tin PXK xem trong chi tiết đơn"), đã **không** sửa điều hướng cũ mà bổ sung hẳn
   khối "Phiếu xuất kho" (trạng thái, số tiền, upload/ghi chú chuyển tiền, nút "Đã nhận hàng") ngay
   trong Drawer chi tiết đơn hiện có của KTV — đã verify sống cả 2 nhánh (chờ chuyển tiền / chờ xác
   nhận nhận hàng) và nhánh không có PXK (không hiện gì thêm, không phá layout cũ).

## 4. Đã rà soát, XÁC NHẬN LÀ ĐÚNG THIẾT KẾ (không phải bug)

- **Tự thông báo khi tự duyệt/từ chối đơn của chính mình bị chặn có chủ đích**
  (`applyDonHangLog`: `if (ddh.nguoi_tao !== user.email)`) — hợp lý cho người dùng thật (1 người không
  cần tự thông báo cho mình), chỉ gây "trông giống bug" khi test bằng View-As vì danh tính không đổi.
- **Nút "Từ chối" và "⏳ Chờ hàng" tách riêng 2 danh sách lý do** (`quan_ly_don_thieu_linh_kien`) thay
  vì gộp 1 dropdown — tránh nhầm giữa "từ chối thật" và "hết hàng tạm thời", đây là thiết kế tốt hơn
  dropdown gộp, nên giữ nguyên.
- **QC không thấy báo cáo pivot toàn hệ thống, màn hình chính của QC là tab Trả hàng bước "Chờ QC xác
  nhận"** — đúng như khắc phục đã ghi trong `Ma_tran_kiem_soat_he_thong.xlsx` (mục "Vấn đề phát hiện"),
  không phải thiếu chức năng.

## 5. Vấn đề UX ghi nhận, CHƯA sửa (đề xuất, mức độ thấp/trung bình)

1. **Toast tạo đơn hiển thị mã `phieu_dat_id` (vd "XH-000105") nhưng đơn thật để quản lý về sau lại
   mang mã `dat_don_hang.id` khác hẳn (vd "DDH-000107")** — người dùng ghi nhớ/tìm lại theo mã trên
   toast sẽ không tìm thấy trong danh sách. `phieu_dat_id` không được hiển thị ở bất kỳ đâu khác trong
   UI (chỉ tồn tại trong `types.ts`). Đề xuất: đổi toast hiển thị `dat_don_hang.id` của dòng vừa tạo
   (nếu 1 dòng) hoặc số lượng dòng + liên kết xem ngay, thay vì mã nội bộ người dùng không dùng lại
   được.
2. **Trường bắt buộc "Mã đơn hàng" trên PXK trả hàng dùng chữ của luồng mua hàng** — placeholder "Nhập
   mã đơn hàng sau khi KTV đã chuyển tiền" hiện y hệt cho cả PXK trả hàng, dù trả hàng không có bước
   "KTV chuyển tiền" nào cả (trường `Chuyển tiền` bên cạnh còn hiện sẵn "Không cần chuyển tiền"). Chữ
   này khiến Tác nghiệp/Kế toán xử lý trả hàng bối rối không hiểu vì sao phải điền "mã đơn hàng sau
   khi KTV chuyển tiền" cho 1 phiếu không liên quan chuyển tiền. Đề xuất: tách nhãn/placeholder theo
   `loai_don` (mua hàng vs trả hàng), ví dụ trả hàng ghi "Mã đơn hàng xác nhận (nội bộ Kế toán)".
3. **Bộ lọc trạng thái trong "Đơn hàng"/"Phiếu xuất kho" không tự đổi theo vai trò đang xem** — khi
   chuyển từ vai trò A (đang lọc "Chờ kế toán duyệt mềm") sang vai trò B, bộ lọc vẫn giữ nguyên lựa
   chọn cũ dù B không có việc ở bước đó (0 dòng, dễ hiểu lầm "không có việc gì"). Đề xuất: khi vào tab
   theo StatCard/lần đầu mở trong phiên, tự chọn bước phù hợp nhất với vai trò hiện tại (đã có sẵn
   logic tương tự cho tab mặc định `canTacNghiep ? "Cho TN duyet" : ...` ở dòng 987
   `DonCuaToiTab.tsx` — có thể mở rộng áp dụng luôn cho `Trả hàng`/`Phiếu xuất kho` mỗi khi đổi vai
   trò xem thử, hiện chỉ áp dụng lúc mount lần đầu).
4. **`isValidView` fallback về tab đầu tiên hoàn toàn im lặng** (không toast/không log) khi 1 vai trò
   bấm StatCard trỏ tới tab họ không có quyền xem — đã né bằng cách gắn PXK vào chi tiết đơn cho
   riêng trường hợp KTV, nhưng cơ chế fallback im lặng này vẫn còn nguyên cho các trường hợp tương tự
   trong tương lai (thêm 1 StatCard/tab mới mà quên gate quyền đúng sẽ tái diễn lỗi y hệt mà không ai
   biết). Đề xuất: khi fallback xảy ra, ít nhất log console.warn ở dev để dev tự phát hiện sớm hơn khi
   thêm luồng mới, không cần đợi QA thủ công phát hiện lại.

## 6. Đối chiếu hệ tương tự (ERP mua hàng/duyệt đa cấp) — gợi ý

- Các hệ mua hàng/PO-approval phổ biến (SAP MM, Zoho Purchase, Odoo Purchase) đều có 1 **"trạng thái +
  ai đang giữ bóng" hiển thị ngay trên list** — hệ hiện tại đã làm khá tốt điều này (cột "Trạng thái"
  + badge màu theo bước), nhưng thiếu 1 điểm các hệ đó thường có: **hover/click vào badge trạng thái
  hiện luôn "đang chờ ai xử lý"** (tên người/nhóm cụ thể, không chỉ tên bước) — hữu ích nhất ở các
  bước có nhiều người cùng quyền duyệt (TN, Kế toán) để người tạo đơn biết đang chờ ai.
- Nhiều hệ ticket/approval (Jira Service Management, Freshservice) dùng **SLA đếm ngược hiển thị ngay
  trên từng dòng** (không chỉ "Quá hạn - cần lý do" như hệ hiện tại) — vd "còn 4h", đổi màu dần trước
  khi quá hạn thay vì chỉ báo đỏ SAU khi đã quá hạn. Hệ hiện tại (`Quá hạn - cần lý do`, xem
  `qua_han_ly_do_cham`) mới xử lý được trạng thái quá hạn, chưa có cảnh báo sớm (vd "sắp quá hạn"),
  vốn giúp TN/Kho chủ động xử lý trước khi phát sinh badge đỏ.
- Có thể cân nhắc thêm 1 "audit trail xuất Excel" cho luồng trả hàng/PXK trả hàng tương tự cách các hệ
  kế toán (MISA, Fast) luôn cho xuất chứng từ ra file để đối chiếu ngoại tuyến — hệ hiện tại lưu đủ
  lịch sử xử lý (`LỊCH SỬ XỬ LÝ` trong Drawer) nhưng chưa có nút xuất, có thể là nhu cầu thật của Kế
  toán khi đối chiếu MISA cuối tháng (đã thấy trường `Mã MISA` được nhập tay từng phiếu — gợi ý dấu
  hiệu đối chiếu thủ công đang diễn ra ngoài hệ thống).

## 7. Đánh giá tổng thể mức độ hoàn thiện

- **State machine nghiệp vụ (mua hàng, công nợ, trả hàng, PXK cả 2 loại) đúng và nhất quán** — đã đi
  hết toàn bộ các bước bằng UI thật, không phát hiện trạng thái nào bị kẹt/nhảy sai/thiếu quyền chặn.
- **Phân quyền theo vai trò đúng ở tầng backend** (đã verify KHÔNG dùng bypass Admin cho Trạm/TBP mà
  test đúng điều kiện quan hệ dữ liệu thật) — điểm mạnh, không có lỗ hổng leo quyền phát hiện được.
- **Điểm yếu lớn nhất đã tìm thấy và sửa xong trong phiên này**: khoảng trống hoàn toàn giữa
  backend-đã-hỗ-trợ và frontend-chưa-có-đường-dẫn cho vai trò KTV/Vệ tinh với PXK — dạng lỗi này (tính
  năng có ở API nhưng "mất tích" trên UI cho 1 vai trò cụ thể) là loại khó phát hiện nhất bằng test
  API/unit test, chỉ lộ ra khi đóng vai người dùng thật click từng bước — đúng như cách đợt QA này đã
  làm.
- **UX nhìn chung rõ ràng, tốc độ thao tác nhanh** (ít bước, filter/StatCard bấm là nhảy đúng chỗ), 3
  vấn đề UX còn lại ở mục 5 đều ở mức thấp/trung bình, không chặn nghiệp vụ, phù hợp làm cải tiến đợt
  sau chứ không cấp bách.

## 8. Việc chưa test được / cần môi trường thật hoặc dữ liệu thật

- Upload ảnh thật lên Google Drive (bằng chứng chuyển tiền, ảnh trả hàng) — cần deploy thật hoặc cấu
  hình Drive OAuth ở local theo `DEPLOY.md`.
- Luồng "người tạo khác người xử lý" hoàn toàn (thông báo, tự động gán, v.v.) — cần nhiều tài khoản
  Google thật đăng nhập song song, View-As không mô phỏng được vì giữ nguyên danh tính thật.
- Import Excel hàng loạt (`ktv_lien_he` bulk-import, đặt đơn hàng loạt) — chưa test trên UI trong đợt
  này (đã đọc code, chưa click thật qua file mẫu).
