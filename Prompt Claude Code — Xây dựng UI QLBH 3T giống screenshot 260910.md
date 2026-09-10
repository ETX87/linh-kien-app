# NHIỆM VỤ: XÂY DỰNG GIAO DIỆN QLBH 3T — LINH KIỆN

Bạn đang làm việc trực tiếp trên repository hiện tại.

Mục tiêu của nhiệm vụ này là xây dựng lại giao diện web của module:

**QLBH 3T — Linh kiện / Đặt mua linh kiện / Trả hàng**

Giao diện phải bám sát screenshot/reference image tôi cung cấp, ưu tiên độ giống về:

- Layout
- Khoảng cách
- Kích thước
- Typography
- Màu sắc
- Border
- Border radius
- Shadow
- Icon
- Status badge
- Sidebar
- Topbar
- Table
- Card
- Drawer
- Modal
- Workflow stepper
- Responsive mobile

KHÔNG tự ý thiết kế lại theo phong cách khác.

---

# 1. NGUYÊN TẮC QUAN TRỌNG

## 1.1. Screenshot là nguồn tham chiếu UI chính

Hãy phân tích screenshot trước khi code.

Không chỉ nhìn tổng thể mà phải phân tích:

- chiều rộng sidebar
- chiều cao topbar
- vùng content
- grid
- kích thước card
- khoảng cách giữa các thành phần
- font size
- font weight
- màu nền
- màu chữ
- màu border
- màu trạng thái
- kích thước button
- table density
- drawer width
- modal width
- vị trí các thành phần
- hierarchy của thông tin

Sau đó chuyển các đặc điểm này thành design system/code.

Nếu có xung đột giữa mô tả bằng text và screenshot:

**Ưu tiên cấu trúc nghiệp vụ trong specification, nhưng ưu tiên screenshot cho visual/UI.**

---

# 2. PHONG CÁCH THIẾT KẾ

Phong cách:

**Modern Enterprise SaaS / Premium Operations Dashboard**

Màu chủ đạo:

- Dark Navy
- Deep Blue
- Royal Blue
- White
- Cool Gray

Không dùng giao diện quá màu mè.

Không dùng gradient quá mạnh.

Không dùng glassmorphism quá mức.

Không dùng card quá bo tròn.

Không dùng shadow nặng.

Cảm giác cần đạt:

> Một hệ thống quản lý vận hành nội bộ cao cấp, nhanh, rõ ràng, nhiều dữ liệu nhưng không gây rối.

Ưu tiên:

- information density cao
- dễ đọc
- thao tác nhanh
- trạng thái nhìn thấy ngay
- action 1 chạm
- responsive
- desktop-first nhưng mobile phải sử dụng tốt.

---

# 3. DESIGN SYSTEM

Tạo design tokens dùng chung.

Ví dụ:

```css
--color-primary: #1467E8;
--color-primary-dark: #071B3A;
--color-primary-soft: #EAF2FF;

--color-background: #F4F7FB;
--color-surface: #FFFFFF;

--color-text: #17243A;
--color-text-secondary: #70809A;

--color-border: #DCE5F1;

--color-success: #0CA678;
--color-warning: #F59F00;
--color-danger: #EF476F;
--color-purple: #7357D9;
```

Tất cả component phải sử dụng token.

Không hard-code màu lung tung trong từng component.

---

# 4. SHELL CHUNG

## Desktop

Layout:

```text
┌──────────────────────────────────────────────────────────┐
│                    TOPBAR                                │
├──────────────┬───────────────────────────────────────────┤
│              │                                           │
│   SIDEBAR    │             MAIN CONTENT                  │
│   240px      │                                           │
│              │                                           │
│              │                                           │
└──────────────┴───────────────────────────────────────────┘
```

Sidebar khoảng 240px.

Topbar mỏng khoảng 60–64px.

Sidebar:

Logo:

**QLBH 3T — Linh kiện**

Menu:

- Trang chủ
- Đặt mua linh kiện
- Trả hàng
- Danh mục linh kiện
- Tồn kho công nợ KTV
- Báo cáo tốc độ xử lý
- Cài đặt
- Quản lý người dùng

Menu hiển thị theo role.

Đặt mua linh kiện có badge đỏ số lượng việc tồn.

Cuối sidebar:

**Thu gọn sidebar**

---

# 5. TOPBAR

Topbar gồm:

Bên trái:

Breadcrumb:

```text
Đặt mua linh kiện / Mua hàng
```

Ở giữa:

Search:

```text
Tìm kiếm hoặc gõ lệnh… (Ctrl K)
```

Bên phải:

- Notification bell
- badge số thông báo
- avatar
- tên user
- email
- role
- persona chips

Ví dụ:

```text
Nguyễn Văn An
an.nguyen@3t.com
Admin
```

Chips:

```text
KTV DVBH
Vệ tinh
Kho
Kế toán
TN
TP DVBH
View
```

---

# 6. TRANG ĐẶT MUA LINH KIỆN

Đây là màn hình quan trọng nhất.

Header:

```text
Mua hàng

Thứ Năm, 10/09/2026
```

Ngay dưới là KPI cards.

Ví dụ:

```text
┌─────────────┐
│ Chờ tôi duyệt│
│      8   →   │
└─────────────┘

┌─────────────┐
│ Ưu tiên      │
│      2   →   │
└─────────────┘

┌─────────────┐
│ Quá hạn      │
│      5   →   │
└─────────────┘

┌─────────────┐
│ Đã duyệt     │
│     32   →   │
└─────────────┘

┌─────────────┐
│ Tổng đơn     │
│     48   →   │
└─────────────┘
```

Card phải rất sạch.

Số lớn.

Font số sử dụng:

```css
font-variant-numeric: tabular-nums;
```

---

# 7. QUICK FILTER

Ngay dưới KPI:

```text
[Tất cả 48]
[Chờ tôi duyệt 12]
[⭐ Ưu tiên 6]
[🔴 Quá hạn 5]
```

Đây phải là segmented filter.

Active state dùng màu xanh.

---

# 8. TOOLBAR

Toolbar:

```text
[Tìm mã đơn / mã LK / tên KTV...]

[Lọc thêm]

[+ Tạo đơn]

[⇩ Nhập Excel]
```

Search chiếm phần lớn chiều ngang.

Button phải nhỏ gọn, enterprise.

---

# 9. BULK ACTION

Khi chọn checkbox:

```text
Đã chọn 3

[Duyệt hàng loạt]
[Từ chối hàng loạt]
[Bỏ chọn]
```

Chỉ hiển thị khi có item được chọn.

---

# 10. BẢNG MUA HÀNG

Bảng phải dense nhưng dễ đọc.

Columns:

```text
☐
Mã đơn
Loại
Linh kiện
SL đề xuất
Giá đề xuất
Người nhận hàng
Người tạo
Ngày tạo
Trạng thái
Hành động
```

Ví dụ:

```text
DH-2401 ★
Mua
LK001 — Bo mạch chủ Samsung A52
5
2.500.000₫
Nguyễn Văn A
GS: Trần Văn B
Lê Thị C
24/09 14:30
Chờ Trạm duyệt
[Duyệt] [Từ chối]
```

Mã đơn dùng monospace.

Giá dùng monospace/tabular number.

Status dùng pill nhỏ.

Không làm row quá cao.

Hover row nhẹ.

---

# 11. STATUS SYSTEM

Tạo component:

```text
StatusBadge
```

Các trạng thái:

```text
Chờ Trạm duyệt
Chờ TBP xác nhận
Chờ TN duyệt
TN đã duyệt
Từ chối
Đã huỷ
Đã duyệt
Quá hạn
```

Mỗi status có semantic color riêng.

Ví dụ:

- waiting → amber/blue
- success → teal/green
- danger → coral/red
- cancelled → gray

---

# 12. DRAWER CHI TIẾT ĐƠN

Khi click row:

Mở drawer bên phải.

Desktop:

```text
width: 480px
```

Drawer phải trượt từ phải vào.

Không chuyển sang trang mới.

Header:

```text
DH-2401 ★

[Chờ Trạm duyệt]

                         X
```

Bên dưới có các section card:

### Thông tin đơn

```text
Loại đơn
Mã linh kiện
SL đề xuất / thực xuất
Giá đề xuất / giá chốt
Loại đề xuất
Người nhận hàng
GS phụ trách
Người tạo
Ngày tạo
```

### Thông tin bổ sung

```text
Ghi chú
Yêu cầu hoá đơn
TT mail duyệt
TT khách hàng
Chính sách
Mã case
```

### Case đính kèm

Hiển thị:

```text
CS-2026-001
KH ABC
Hà Nội
```

Có:

```text
[Gắn thêm case]
```

### Lịch sử xử lý

Timeline:

```text
Đơn tạo
   │
Chờ Trạm duyệt
   │
Trạm duyệt
   │
Chờ TN duyệt
```

Mỗi event:

- trạng thái
- người
- thời gian
- ghi chú

### Giải trình

Nếu quá hạn:

Hiện panel đỏ nhạt:

```text
Giải trình lý do chậm

[Nhập lý do giải trình...]

Lịch sử giải trình
```

---

# 13. DRAWER ACTION BAR

Cuối drawer sticky:

```text
[Duyệt]
[Từ chối]
[Huỷ đơn]
[Sửa đơn]
[Duyệt và tiếp theo →]
```

Button:

**Duyệt và tiếp theo**

phải là CTA chính.

---

# 14. TẠO ĐƠN

Desktop:

Modal.

Mobile:

Full-screen.

Form gồm:

```text
Người nhận hàng
Loại đề xuất
Chọn linh kiện
Số lượng
Giá đề xuất
Ưu tiên
Yêu cầu hoá đơn
Ghi chú
TT mail duyệt
TT khách hàng
Chính sách
Mã case
```

LinhKienPicker:

Search:

```text
Tìm mã / tên linh kiện…
```

Result:

```text
[ảnh]

LK001
Bo mạch chủ Samsung A52

Hãng: Samsung

2.500.000₫

[Đặc thù]
[Only sửa chữa]
```

Nếu có linh kiện thay thế:

```text
Có thể thay bằng LK001B
```

---

# 15. TRẢ HÀNG

Tạo màn hình riêng nhưng sử dụng cùng design system.

Header:

```text
Trả hàng
```

Phía trên bảng là workflow stepper:

```text
① Chờ kế toán duyệt mềm
        →
② Chờ kho xác nhận
        →
③ Chờ QC xác nhận
        →
④ Chờ TN duyệt tổng
        →
⑤ Đã duyệt
        →
⑥ Lên PXK
```

Nhánh:

```text
Từ chối
```

Bảng:

```text
Mã TH
Linh kiện
SL
Người tạo
GS
Ngày tạo
Bước hiện tại
Trạng thái
Hành động
```

Ví dụ:

```text
TH-701 ★
LK001 — Bo mạch chủ Samsung A52
2
Nguyễn Văn A
Trần Văn B
24/09 14:30
Chờ QC xác nhận
Đang xử lý
[Xem]
```

Drawer TH-701 phải có:

- thông tin trả hàng
- ảnh linh kiện
- lý do trả
- case
- công nợ
- timeline
- giải trình
- action

---

# 16. MOBILE

Mobile KHÔNG được chỉ shrink desktop.

Phải thiết kế responsive riêng.

Không sidebar.

Top app bar:

```text
‹   Trả hàng                 🔔
```

Bottom navigation:

```text
Trang chủ
Mua hàng
Trả hàng
Thiếu LK
Thêm
```

Mua hàng mobile:

Mỗi đơn là card:

```text
DH-2401 ★

Chờ Trạm duyệt

LK001 — Bo mạch chủ Samsung A52

SL: 5
Người nhận: Nguyễn Văn A
24/09 14:30

[Duyệt] [Từ chối]
```

Click card:

**Bottom Sheet full height**

Không dùng desktop drawer 480px trên mobile.

---

# 17. CÁC MÀN HÌNH CẦN XÂY

Triển khai architecture đủ để mở rộng:

```text
S0 Shell
S1 Login
S2 Dashboard
S3 Mua hàng
S4 Công nợ
S5 Tạo đơn
S6 Trả hàng
S7 Trả hàng read-only
S8 Phiếu xuất kho
S9 Thiếu linh kiện
S10 Báo cáo
S11 Danh mục linh kiện
S12 Tồn kho công nợ KTV
S13 SLA
S14 Settings
S15 User Management
S16 Import Excel
S17 Notification
```

Không copy-paste UI giữa các màn.

Tạo component dùng chung.

---

# 18. COMPONENT ARCHITECTURE

Tạo các component có khả năng tái sử dụng:

```text
AppShell
Sidebar
Topbar
Breadcrumb
PersonaSwitcher
NotificationPanel

PageHeader
StatCard
FilterChips
SearchBar
Toolbar
DataTable
StatusBadge
RoleBadge
ActionButton
BulkActionBar

Drawer
BottomSheet
Modal
FormField
Select
DateRangePicker
LinhKienPicker

Timeline
CaseList
UploadBox
Stepper
WorkflowStepper

EmptyState
LoadingState
ErrorState
Pagination
```

---

# 19. DATA

Hiện tại dùng mock data.

Nhưng architecture phải sẵn sàng để sau này kết nối:

**Google Apps Script / Google Sheets API / Cloudflare backend**

Không hard-code dữ liệu trực tiếp vào component.

Tách:

```text
mock/
services/
components/
pages/
hooks/
utils/
types/
```

Ví dụ:

```text
purchaseOrders.ts
returns.ts
users.ts
parts.ts
pxk.ts
```

---

# 20. ROLE / PERSONA

Phải chuẩn bị role-based UI.

Core role:

```text
Admin
QC
Giám sát
```

Business flags:

```text
KTV DVBH
Vệ tinh
Kho
Kế toán
TN
TP DVBH
View
```

Ví dụ:

```ts
type UserPermission = {
  coreRole: 'ADMIN' | 'QC' | 'GS' | null
  ktvDVBH: boolean
  veTinh: boolean
  kho: boolean
  keToan: boolean
  tn: boolean
  tpDVBH: boolean
  view: boolean
  manageParts: boolean
}
```

Không render button chỉ dựa trên tên role hard-code.

Tạo permission helper.

---

# 21. INTERACTION

Các interaction tối thiểu phải hoạt động:

### Sidebar

- active menu
- collapse
- responsive

### Search

- filter mock data realtime

### Filter

- Tất cả
- Chờ tôi duyệt
- Ưu tiên
- Quá hạn

### Table

- select row
- select all
- bulk action
- pagination
- row click

### Drawer

- open
- close
- switch record
- next record

### Create Order

- mở modal
- nhập dữ liệu
- add line
- remove line
- tính tổng tiền

### Notification

- dropdown
- unread badge
- mark read

### Workflow

- status thay đổi trên mock data
- timeline cập nhật

---

# 22. UX DETAILS

Phải có:

- loading skeleton
- empty state
- error state
- hover state
- active state
- focus state
- disabled state
- toast notification
- confirmation dialog khi thao tác nguy hiểm

Ví dụ:

Từ chối:

```text
Từ chối đơn DH-2401

Lý do từ chối *
[Chọn lý do]

Ghi chú
[................]

[Huỷ] [Xác nhận từ chối]
```

---

# 23. ACCESSIBILITY

Đảm bảo:

- keyboard navigation
- focus visible
- aria-label cho icon button
- contrast tốt
- button không chỉ có màu để biểu thị trạng thái

---

# 24. RESPONSIVE BREAKPOINT

Ưu tiên:

```text
Desktop >= 1200
Tablet 768–1199
Mobile < 768
```

Desktop screenshot phải là reference chính.

Mobile phải được thiết kế riêng chứ không chỉ thu nhỏ.

---

# 25. ICON

Dùng một icon library thống nhất.

Ưu tiên icon outline.

Không trộn nhiều phong cách icon.

Các icon quan trọng:

- Home
- Shopping cart
- Return
- Package
- Warehouse
- Report
- Settings
- Users
- Bell
- Search
- Filter
- Plus
- Download
- Chevron
- Check
- X
- Alert
- Star
- Clock
- File
- Upload

---

# 26. FONT

Sử dụng font UI hiện đại, ưu tiên:

```text
Inter
```

Fallback:

```text
Segoe UI
Arial
sans-serif
```

Các mã:

```text
DH-2401
TH-701
PXK-501
LK001
```

dùng monospace/tabular.

---

# 27. KHÔNG ĐƯỢC LÀM

Không:

- thiết kế lại theo ý riêng
- đổi sang gam tím/xanh lá chủ đạo
- làm sidebar quá rộng
- làm card quá lớn
- làm table quá thưa
- sử dụng gradient quá mạnh
- dùng icon 3D
- dùng ảnh stock
- tạo UI giống template dashboard phổ thông
- bỏ drawer
- bỏ workflow
- bỏ quick filter
- bỏ bulk action
- bỏ mobile layout

---

# 28. QUY TRÌNH THỰC HIỆN

Không code toàn bộ một lần.

Thực hiện theo các phase:

## Phase 1 — Audit repository

Đọc:

- package.json
- cấu trúc source
- routing
- styling
- existing components
- API/service
- authentication
- build configuration

Không phá vỡ architecture hiện tại nếu không cần.

---

## Phase 2 — Design system

Xây:

```text
tokens
typography
buttons
badges
cards
inputs
table
drawer
modal
```

---

## Phase 3 — App Shell

Hoàn thiện:

```text
Sidebar
Topbar
Breadcrumb
Persona
Notification
Responsive navigation
```

---

## Phase 4 — Mua hàng

Ưu tiên màn hình này đầu tiên.

Hoàn thiện:

```text
KPI
Filter
Toolbar
Table
Bulk action
Drawer
Create order modal
```

---

## Phase 5 — Trả hàng

Xây:

```text
Stepper
Return table
Return drawer
6-step workflow
```

---

## Phase 6 — Các module còn lại

Sau khi UI foundation ổn định mới triển khai:

```text
Công nợ
PXK
Thiếu LK
Báo cáo
Danh mục LK
Tồn kho
SLA
Settings
User
Import
Notification
```

---

# 29. SCREENSHOT COMPARISON

Đây là yêu cầu BẮT BUỘC.

Sau khi hoàn thành mỗi màn hình quan trọng:

1. chạy application
2. render ở kích thước tương đương screenshot reference
3. chụp screenshot
4. so sánh với reference
5. xác định sai lệch
6. sửa CSS/layout
7. chụp lại
8. lặp lại cho đến khi đạt mức giống cao

Đặc biệt kiểm tra:

```text
Sidebar width
Topbar height
Content width
Card spacing
Table density
Drawer width
Typography
Button dimensions
Status colors
Alignment
Vertical rhythm
```

Không tự đánh giá "đã giống" nếu chưa kiểm tra screenshot.

---

# 30. DEFINITION OF DONE

Màn hình chỉ được coi là hoàn thành khi:

- responsive
- không có console error
- không có broken component
- không có overflow ngoài ý muốn
- drawer hoạt động
- modal hoạt động
- filter hoạt động
- search hoạt động
- bulk selection hoạt động
- action button hoạt động
- mobile hoạt động
- visual gần screenshot reference
- component được tái sử dụng
- không duplicate CSS không cần thiết

---

# 31. QUY TẮC CUỐI CÙNG

Đừng chỉ tạo một mockup tĩnh.

Tôi cần **giao diện application thực sự có thể tương tác**.

Ưu tiên:

**Visual fidelity → UX → Component architecture → Responsive → Data integration readiness**

Nếu repository hiện tại đã có component tương đương:

**reuse trước, tạo mới sau.**

Nếu phát hiện architecture hiện tại không phù hợp:

không rewrite toàn bộ ngay.

Hãy báo cáo:

```text
Vấn đề
Ảnh hưởng
Phương án
File cần thay đổi
Rủi ro
```

sau đó mới thực hiện.

Sau mỗi phase hãy báo:

```text
DONE
Changed:
- ...

Tested:
- ...

Remaining:
- ...

Visual issues:
- ...
```

Bắt đầu bằng việc **audit repository + phân tích screenshot/reference**, sau đó lập implementation plan trước khi sửa code.