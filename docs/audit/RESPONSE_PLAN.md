# Phản hồi + Runbook giám sát cho AUDIT_REPORT.md (2026-09-05)

Tài liệu này ghi lại: đã sửa gì, đã xác minh gì bằng thực nghiệm, và với các finding cố ý CHƯA sửa
code — ngưỡng cụ thể để coi là "vấn đề thật" + phương án xử lý ngay khi gặp, để không phải phân tích
lại từ đầu.

## Đã sửa

- **AUD-003** (`settingsDatMua.ts` dòng ~198, ~324): thêm `signal: AbortSignal.timeout(5000)` cho cả
  2 lệnh `fetch()` ảnh trong loop import — 1 URL treo không còn kéo dài toàn bộ Worker request, tự rơi
  vào nhánh `catch` sẵn có (`fetchFailed++`/`anhLoi = true`).
- **AUD-001** (`users.ts` `GET /`): xoá nhánh `SELECT *` không phân trang khi thiếu `page` — endpoint
  giờ LUÔN phân trang (`page` mặc định 1, `pageSize` mặc định 50, cap 200). Đồng bộ ở
  `UsersModule.tsx`: `UserListTab` và `PhuTrachGsTab` chuyển sang `PaginatedTable` (giống mẫu
  `VanPhongTab` đã có sẵn) thay vì bảng tự vẽ không phân trang. `PhuTrachGsTab` còn được thêm bộ lọc
  `nhom=van-phong` (loại tài khoản KTV/Vệ tinh ngay ở SQL, trước đây kéo về TẤT CẢ tài khoản đã duyệt
  chỉ để lọc lại ở client — đúng dạng lãng phí mà AUD-001 mô tả, nhưng audit gốc không phát hiện ra vì
  static review không thấy cách gọi thực tế của FE).
- **AUD-007** (`index.ts`): thêm middleware gắn `requestId` (`crypto.randomUUID()`) cho mọi request;
  `app.onError` giờ log kèm `[requestId]` và trả `{ error: "INTERNAL_ERROR", requestId }`. Đã test
  thực tế bằng 1 request cố ý gây lỗi 500 — response có `requestId`, log server có cùng giá trị.

## Đã xác minh, không sửa code

- **AUD-006** (atomicity khi duyệt đồng thời): code đã có CAS đầy đủ từ 2026-08-18 (migration 0087,
  `applyDonHangLog`/`applyTraHangLog`/PXK). Xác minh bằng replay test cục bộ 2026-09-05: bắn 2 request
  `POST /don-hang/DDH-000109/log {duyet}` gần như đồng thời trên `wrangler dev` local — kết quả 1
  request `200 OK` (ghi log `TN da duyet`, id log=39), request còn lại `409` (guard trạng thái đóng
  chặn trước khi tới bước CAS). Kiểm `dat_don_hang_log` chỉ có ĐÚNG 1 dòng log mới cho đơn này — xác
  nhận không có ghi trùng/xử lý 2 lần. Finding này coi như ĐÓNG, không cần sửa gì thêm.
- **AUD-004** (`publicSheetCache.ts` dùng `cache: "no-store"`): xác nhận đây là THIẾT KẾ CỐ Ý, không
  phải bug — đã có cache riêng ở tầng ứng dụng (IndexedDB, tự động đồng bộ lại tối đa 1 lần/ngày/máy),
  `no-store` chỉ áp dụng cho chính lần fetch chủ động đó (muốn dữ liệu mới nhất, không muốn HTTP cache
  của trình duyệt trả bản cũ). Không cần hành động. Ghi lại ở đây để lần audit sau không lặp lại.

## Runbook giám sát — các finding chấp nhận rủi ro, có log để phát hiện khi thành vấn đề thật

### AUD-002 — Bulk-log xử lý tuần tự từng ID

- **Log đã thêm**: `console.log("[bulk-log]", { route, count, durationMs })` sau khi xử lý xong toàn
  bộ batch, ở cả `POST /api/dat-mua-lk/don-hang/bulk-log` và `POST /api/tra-hang/bulk-log`.
- **Cách quan sát**: `wrangler tail` (hoặc Cloudflare Dashboard → Logs), lọc dòng có tag `[bulk-log]`.
- **Ngưỡng coi là vấn đề thật**: `durationMs > 3000` khi `count <= 100` (tức trung bình > 30ms/ID —
  cao hơn nhiều mức bình thường của D1 round-trip đơn giản), HOẶC người dùng phàn nàn thao tác hàng
  loạt bị treo/timeout.
- **Xử lý ngay khi gặp**: tách các ID KHÔNG chung 1 đơn cha (không tranh chấp version với nhau) ra
  chạy `Promise.all` thay vì vòng `for` tuần tự — `applyDonHangLog`/`applyTraHangLog` đã tự có CAS
  (AUD-006) nên chạy song song vẫn an toàn về mặt dữ liệu, chỉ cần đảm bảo Cloudflare Worker cho phép
  đủ subrequest đồng thời (giới hạn mặc định free/paid plan, kiểm tra trước khi đổi).

### AUD-005 — Correlated subquery `thieu_lk` (danh sách "Chờ LK")

- **Log đã thêm**: `console.log("[thieu-lk-query]", { durationMs, rowCount })` quanh câu query chính
  của `GET /api/dat-mua-lk/thieu-lk`.
- **Cách quan sát**: `wrangler tail`, lọc tag `[thieu-lk-query]`.
- **Ngưỡng coi là vấn đề thật**: `durationMs > 500` một cách LẶP LẠI (không phải 1 lần do cold start).
- **Xử lý ngay khi gặp**: áp dụng đúng pattern đã dùng cho `dat_don_hang`/`phieu_xuat_kho` (xem comment
  dòng 1016-1020 `datMuaLinhKien.ts`) — thêm cột mirror `trang_thai_hien_tai` vào bảng `thieu_lk`, cập
  nhật đồng thời với mỗi lần ghi `thieu_lk_log` (CAS y hệt `dat_don_hang`), đổi
  `latestThieuLkStatusExpr` sang đọc thẳng cột mirror thay vì correlated subquery. Không cần làm trước
  khi có bằng chứng log thật.

### AUD-004 phần còn lại / AUD-007 phần còn lại

Không cần giám sát thêm — AUD-004 đã xác nhận không phải bug; AUD-007 phần lõi (request-id) đã sửa,
phần còn lại (structured error classes/status mapping đầy đủ) chỉ đáng làm nếu quy mô người dùng tăng
đáng kể, không có ngưỡng cụ thể cần theo dõi ở quy mô hiện tại.

## Chưa/không cần sửa

- **AUD-002 hiệu năng**: chỉ thêm log giám sát, KHÔNG parallelize ngay — cần dữ liệu thật trước khi
  đổi (đổi vòng lặp tuần tự → song song mà không có bằng chứng dễ gây lỗi mới hơn là lợi ích).
- **AUD-005 hiệu năng**: chỉ thêm log giám sát, KHÔNG thêm cột mirror ngay — cùng lý do, và
  `thieu_lk_log`/`thieu_lk` đã có index composite `(thieu_lk_id, id)` (migration 0018) nên chi phí
  hiện tại nhiều khả năng đã chấp nhận được.
