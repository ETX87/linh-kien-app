# PRODUCTION SYSTEM AUDIT & CONTROL

Bạn đang được cấp quyền truy cập trực tiếp vào repository của hệ thống web đang triển khai production.

Mục tiêu của bạn là **kiểm tra toàn diện hệ thống hiện tại**, bao gồm source code, kiến trúc, database/data access, API, frontend, UX/UI, phân quyền, workflow nghiệp vụ, hiệu năng và các vấn đề phát sinh trong production.

## 1. NGUYÊN TẮC QUAN TRỌNG

### Giai đoạn 1 — AUDIT

Trong giai đoạn audit:

- KHÔNG tự ý sửa code.
- KHÔNG refactor.
- KHÔNG thay đổi database.
- KHÔNG thay đổi production configuration.
- KHÔNG deploy.
- KHÔNG xóa dữ liệu.
- KHÔNG thực hiện thao tác có khả năng ảnh hưởng production.

Chỉ được:

- đọc code
- phân tích
- kiểm tra cấu trúc
- kiểm tra API
- kiểm tra database access
- kiểm tra workflow
- kiểm tra production behavior nếu có quyền truy cập an toàn
- tạo báo cáo audit

Sau khi hoàn thành audit, tạo `AUDIT_REPORT.md`.

CHỈ được sửa hệ thống sau khi tôi xác nhận rõ ràng.

---

# 2. TỰ KHÁM PHÁ TOÀN BỘ REPOSITORY

Không giả định kiến trúc của project.

Hãy tự xác định:

- frontend framework
- backend framework
- API architecture
- database
- ORM/query builder
- authentication
- authorization
- middleware
- Cloudflare architecture
- Workers
- Pages
- Functions
- cache
- external services
- background jobs
- cron
- websocket/realtime nếu có
- storage
- logging
- monitoring

Đọc toàn bộ những file quan trọng trước khi kết luận.

Không chỉ kiểm tra các file có tên dễ đoán.

---

# 3. PRODUCTION SYSTEM

Nếu có thể truy cập production một cách an toàn, hãy kiểm tra:

- production URL
- API request
- API response
- network request
- request frequency
- duplicate request
- failed request
- response time
- payload size
- pagination
- caching
- database access
- error handling
- authentication
- authorization
- workflow thực tế

So sánh:

CODE
vs
PRODUCTION BEHAVIOR

Nếu phát hiện khác nhau, ghi rõ.

---

# 4. NGHIỆP VỤ CẦN AUDIT

Tập trung đặc biệt vào workflow:

## KTV

- tạo yêu cầu đặt mua
- xem hàng hóa
- chọn hàng
- thay đổi số lượng
- gửi yêu cầu
- chỉnh sửa
- hủy
- theo dõi trạng thái

## GIÁM SÁT KHU VỰC

- xem yêu cầu KTV
- lọc theo khu vực
- xem chi tiết
- duyệt
- từ chối
- chỉnh sửa nếu có quyền
- xử lý nhiều yêu cầu

## XUẤT HÀNG

- nhận yêu cầu đã duyệt
- kiểm tra tồn
- xuất hàng
- cập nhật trạng thái
- cập nhật số lượng
- xử lý thiếu hàng
- xử lý thay thế
- tránh xuất trùng

## KẾ TOÁN

- nhận dữ liệu
- kiểm tra
- xử lý
- xác nhận
- cập nhật trạng thái

## TÁC NGHIỆP

Kiểm tra toàn bộ các workflow nghiệp vụ khác đang tồn tại trong hệ thống.

---

# 5. KIỂM TRA BUG

Tìm:

- logic bug
- null/undefined
- race condition
- state sai
- trạng thái không đồng bộ
- xử lý lỗi thiếu
- edge case
- double submit
- double click
- duplicate transaction
- duplicate record
- mất dữ liệu
- ghi đè dữ liệu
- cập nhật sai trạng thái
- sai điều kiện
- sai quyền
- sai dữ liệu theo khu vực

Mỗi bug phải chỉ rõ:

- mức độ
- file
- function
- line
- nguyên nhân
- cách tái hiện
- hậu quả
- đề xuất sửa

---

# 6. DATABASE / DATA ACCESS AUDIT

Đây là phần đặc biệt quan trọng.

Hãy kiểm tra mọi nơi đọc/ghi database.

Tìm:

### Đọc quá nhiều

Ví dụ:

```text
SELECT *
```

hoặc lấy toàn bộ collection/table trong khi UI chỉ cần một phần dữ liệu.

### Không pagination

Ví dụ:

```text
SELECT * FROM orders
```

trong khi chỉ cần 20 record.

### Client-side filtering

Ví dụ:

```text
Database → 100.000 records
        ↓
Browser
        ↓
filter còn 20 records
```

Đánh dấu đây là vấn đề.

### Query lặp

Ví dụ:

```text
for each order:
    query user
```

### N+1 query

### Query trong loop

### Query trùng

### API gọi cùng dữ liệu nhiều lần

### Fetch lại dữ liệu không cần thiết

### Polling quá thường xuyên

### Không debounce

### Không cache

### Không sử dụng dữ liệu đã có

### Ghi database nhiều lần

### Update từng record thay vì batch

### Transaction thiếu

### Race condition

### Không idempotent

---

# 7. ĐÁNH GIÁ DATA WASTE

Với mỗi API/query quan trọng, cố gắng xác định:

```text
Data requested
Data actually needed
Waste
Waste %
```

Ví dụ:

```text
API: GET /orders

Read:
100,000 records

Needed:
20 records

Waste:
99,980 records

Waste:
99.98%
```

Nếu không thể xác định chính xác thì ghi:

```text
UNKNOWN — cần production metrics
```

Không được tự đoán.

---

# 8. API AUDIT

Kiểm tra:

- GET
- POST
- PUT
- PATCH
- DELETE

Đặc biệt:

- duplicate API call
- API gọi tuần tự không cần thiết
- API gọi song song gây conflict
- payload quá lớn
- response quá lớn
- thiếu pagination
- thiếu filtering server-side
- thiếu sorting server-side
- thiếu validation
- thiếu authorization
- thiếu rate limiting
- thiếu idempotency
- retry sai
- timeout
- error handling

Tạo bảng:

| API | Purpose | Data Read | Data Needed | Waste | Calls | Risk |
|---|---|---:|---:|---:|---:|---|

---

# 9. FRONTEND AUDIT

Kiểm tra:

- loading
- skeleton
- empty state
- error state
- responsive
- mobile
- desktop
- table
- modal
- form
- button
- pagination
- filter
- search
- sorting
- state management
- unnecessary rerender
- unnecessary fetch
- duplicate fetch
- memory leak

Đặc biệt kiểm tra:

```text
Component render
      ↓
useEffect
      ↓
API
      ↓
state update
      ↓
render
      ↓
useEffect
      ↓
API
```

Nếu có vòng lặp hoặc fetch dư thừa phải báo cáo.

---

# 10. UX AUDIT

Đánh giá workflow thực tế của:

KTV → Giám sát → Xuất hàng → Kế toán → Hoàn tất

Tìm:

- thao tác dư thừa
- thông tin khó tìm
- trạng thái không rõ
- button khó hiểu
- thiếu confirmation
- confirmation quá nhiều
- thao tác dễ nhầm
- thiếu feedback
- loading không rõ
- lỗi không giải thích
- filter khó sử dụng
- mobile UX kém

Không chỉ đánh giá "đẹp/xấu".

Hãy đánh giá:

```text
Task
→ số bước
→ thời gian
→ khả năng nhầm
→ feedback
→ đề xuất cải thiện
```

---

# 11. SECURITY

Kiểm tra:

- authentication
- authorization
- role
- permission
- area restriction
- IDOR
- privilege escalation
- API authorization
- server-side permission
- client-side-only permission
- exposed sensitive data
- insecure API
- token handling
- session
- CORS
- CSRF nếu applicable
- rate limiting
- input validation
- injection

Đặc biệt:

Không được chỉ kiểm tra:

```text
Frontend hide button
```

mà phải kiểm tra:

```text
Server có thực sự chặn request không?
```

Ví dụ:

KTV A không được xem dữ liệu khu vực B.

Hãy kiểm tra cả frontend và backend.

---

# 12. CONCURRENCY / RACE CONDITION

Đặc biệt kiểm tra các nghiệp vụ:

- duyệt
- từ chối
- xuất hàng
- cập nhật tồn
- cập nhật trạng thái
- chỉnh sửa số lượng

Ví dụ:

```text
User A mở đơn
User B mở đơn

A approve
B approve

→ Có tạo duplicate không?
```

Hoặc:

```text
Tồn = 10

Request A xuất 8
Request B xuất 8

→ Database có thể xuất thành 16 không?
```

Tìm:

- optimistic locking
- transaction
- atomic update
- idempotency
- status validation

---

# 13. CLOUDFLARE AUDIT

Kiểm tra kiến trúc Cloudflare hiện tại:

- Pages
- Workers
- Functions
- routing
- cache
- CDN
- cache invalidation
- headers
- compression
- WAF
- rate limiting
- environment
- production/preview
- logs
- performance

Kiểm tra xem:

```text
Browser
 ↓
Cloudflare
 ↓
Worker
 ↓
API
 ↓
Database
```

có bước nào đang gây:

- request dư
- latency
- payload lớn
- cache miss
- query dư
- retry dư

hay không.

---

# 14. PERFORMANCE

Kiểm tra:

### Frontend

- bundle
- lazy loading
- code splitting
- image
- render
- network
- API

### Backend

- CPU
- memory
- query
- serialization
- response

### Database

- index
- full scan
- sorting
- filtering
- join
- pagination

### Network

- request count
- request size
- response size
- duplicate request

---

# 15. ERROR HANDLING

Kiểm tra:

- HTTP status
- frontend error
- backend error
- database error
- timeout
- retry
- fallback
- user message
- logging

Không để lỗi kiểu:

```text
Something went wrong
```

mà không có khả năng truy vết.

---

# 16. REPORT

Tạo:

```text
docs/audit/AUDIT_REPORT.md
docs/audit/API_MAP.md
docs/audit/DATA_ACCESS_REPORT.md
docs/audit/WORKFLOW_AUDIT.md
docs/audit/SECURITY_AUDIT.md
docs/audit/PERFORMANCE_AUDIT.md
docs/audit/UX_AUDIT.md
```

Nếu thư mục chưa tồn tại thì tạo.

---

# 17. PHÂN LOẠI MỨC ĐỘ

Mỗi issue phải có:

### P0 — Critical

Có khả năng:

- mất dữ liệu
- sai dữ liệu nghiêm trọng
- lộ dữ liệu
- bypass permission
- ảnh hưởng toàn hệ thống

### P1 — High

Ảnh hưởng workflow production hoặc gây chi phí/data waste lớn.

### P2 — Medium

Bug hoặc UX/performance đáng kể nhưng có workaround.

### P3 — Low

Minor bug, UI polish hoặc technical debt.

---

# 18. CONFIDENCE

Mỗi finding phải ghi:

```text
CONFIRMED
LIKELY
POTENTIAL
```

Không được biến giả thuyết thành bug chắc chắn.

---

# 19. FORMAT FINDING

Mỗi vấn đề dùng format:

```text
ID:
Severity:
Confidence:

Title:

Area:

Workflow:

File:

Function:

Line:

Current behavior:

Expected behavior:

Root cause:

Impact:

Evidence:

How to reproduce:

Recommended solution:

Estimated complexity:
```

---

# 20. ƯU TIÊN DATA ACCESS

Nếu phải lựa chọn giữa một lỗi UI nhỏ và một vấn đề:

```text
Database đọc 100.000 records
trong khi chỉ cần 20
```

hãy ưu tiên vấn đề data access/performance.

Đặc biệt tìm các lỗi có khả năng làm:

- tăng database cost
- tăng Cloudflare usage
- tăng API requests
- tăng bandwidth
- tăng CPU
- tăng latency
- giảm khả năng scale

---

# 21. KHÔNG CHỈ ĐỌC CODE

Nếu production access cho phép kiểm tra an toàn, hãy đối chiếu:

```text
Source code
+
Network behavior
+
API behavior
+
Database behavior
+
UI behavior
+
Business workflow
```

Mục tiêu là tìm các vấn đề mà static code review không phát hiện được.

---

# 22. SAU KHI AUDIT

Cuối `AUDIT_REPORT.md` phải có:

## TOP 10 ISSUES

Xếp theo:

```text
Business impact
+
Security
+
Data correctness
+
Performance
+
Cost
```

## QUICK WINS

Những vấn đề có thể sửa nhanh nhưng hiệu quả cao.

## MAJOR FIXES

Những vấn đề cần refactor hoặc thay đổi kiến trúc.

## PRODUCTION RISKS

Những rủi ro cần theo dõi.

## REQUIRED MONITORING

Những metric cần bổ sung để kiểm soát production.

---

# 23. SAU AUDIT — KHÔNG TỰ SỬA

Sau khi hoàn thành:

1. Dừng.
2. Không modify production code.
3. Không deploy.
4. Xuất `AUDIT_REPORT.md`.
5. Tóm tắt TOP 10 vấn đề.
6. Đề xuất thứ tự sửa.

Chờ tôi xác nhận.

---

# 24. GIAI ĐOẠN 2 — CONTROL

CHỈ bắt đầu giai đoạn này khi tôi nói rõ:

> APPROVE FIX

Khi đó:

1. sửa P0/P1 trước
2. test
3. kiểm tra regression
4. kiểm tra database
5. kiểm tra API
6. kiểm tra workflow
7. kiểm tra production impact
8. tạo changelog
9. báo cáo những gì đã sửa
10. chỉ deploy khi tôi cho phép

Không tự ý thay đổi phạm vi.

---

# 25. MỤC TIÊU CUỐI CÙNG

Tôi không muốn một báo cáo kiểu:

> "Code nhìn ổn."

Tôi muốn biết chính xác:

```text
Hệ thống đang làm gì?
        ↓
Đang đọc/ghi dữ liệu như thế nào?
        ↓
Có đọc thừa không?
        ↓
Có gọi API thừa không?
        ↓
Có bug không?
        ↓
Có sai workflow không?
        ↓
Có lỗi permission không?
        ↓
Có race condition không?
        ↓
Có vấn đề Cloudflare không?
        ↓
Có vấn đề UX không?
        ↓
Có vấn đề scale/cost không?
        ↓
Nên sửa cái gì trước?
```

Hãy ưu tiên **evidence và số liệu** thay vì nhận xét chung chung.

Nếu không đủ dữ liệu để kết luận, ghi rõ:

`NEED MORE EVIDENCE`

Không được tự suy đoán.