# 🎨 QUY TẮC THIẾT KẾ GIAO DIỆN CHUẨN (DESIGN SYSTEM) — CCDC 3T

Tài liệu này chuẩn hóa toàn bộ ngôn ngữ thiết kế (Design Language) được trích xuất từ giao diện mẫu **3T Asset Management**, áp dụng thống nhất cho tất cả các màn hình, module và tính năng trong hệ thống.

---

## 1. TRIẾT LÝ THIẾT KẾ (DESIGN PHILOSOPHY)
- **Modern Enterprise SaaS**: Tinh gọn, hiện đại, chuyên nghiệp, lấy trải nghiệm người dùng nghiệp vụ làm trọng tâm.
- **Data-Dense but Breathable**: Hiển thị mật độ thông tin cao nhưng không rối mắt nhờ khoảng cách (spacing), phân cấp thị giác và màu nền pastel.
- **Brand Signature (Deep Teal & Cyan)**: Sử dụng sắc thái xanh mòng két đậm sang trọng cho điều hướng (Sidebar), kết hợp xanh ngọc (Cyan/Mint) làm màu nhấn hành động, và nền pastel dịu mắt cho các thẻ nội dung.
- **Fit-to-Viewport**: Ưu tiên tối ưu bố cục vừa vặn trong tầm mắt trên màn hình tiêu chuẩn (16:9 / 1080p), hạn chế cuộn trang không cần thiết.

---

## 2. HỆ THỐNG MÀU SẮC (COLOR TOKENS)

### 2.1. Màu thương hiệu & Điều hướng (Brand & Navigation)
| Tên Token | Mã Hex | Ứng dụng |
| :--- | :--- | :--- |
| `--sidebar-gradient` | `linear-gradient(180deg, #0B6B7A 0%, #006573 45%, #005663 80%, #017280 100%)` | Nền Sidebar điều hướng bên trái |
| `--teal-primary` | `#009688` | Nút hành động chính, tab active, link điều hướng |
| `--teal-cyan` | `#00A2B4` | Đường line biểu đồ, điểm nhấn trực quan |
| `--teal-dark` | `#007482` | Tiêu đề khối pill, viền nổi bật |
| `--sidebar-active-item` | `rgba(255, 255, 255, 0.25)` | Nền menu item đang chọn (bo góc 8px) |
| `--sidebar-hover-item` | `rgba(255, 255, 255, 0.10)` | Nền menu item khi rê chuột |

### 2.2. Màu nền & Bề mặt (Background & Surfaces)
| Tên Token | Mã Hex | Ứng dụng |
| :--- | :--- | :--- |
| `--bg-main` | `#F7FBFE` | Nền toàn bộ trang web (xám trắng ánh xanh dịu mát) |
| `--bg-surface` | `#FFFFFF` | Nền thẻ (Card), Topbar, Modal, Dropdown |
| `--bg-subtle` | `#F1F5F9` | Nền thanh tìm kiếm, filter tab không chọn, header bảng |

### 2.3. Màu chữ (Typography Colors)
| Tên Token | Mã Hex | Ứng dụng |
| :--- | :--- | :--- |
| `--text-main` | `#0F172A` | Tiêu đề chính, số liệu KPI lớn, nội dung quan trọng |
| `--text-body` | `#334155` | Chữ nội dung thông thường, nhãn thẻ, dòng bảng |
| `--text-muted` | `#64748B` | Mô tả phụ, ngày giờ, header bảng, giá trị thứ cấp |
| `--text-light` | `#94A3B8` | Trục biểu đồ, placeholder, icon mũi tên, thời gian cập nhật |
| `--text-link` | `#0284C7` | Mã phiếu có thể bấm, đường dẫn tra cứu |

### 2.4. Bảng màu Pastel cho Thẻ KPI & Trạng thái (Pastel Semantic Tokens)
Mỗi nhóm dữ liệu trong hệ thống được gắn với 1 bộ màu nhận diện gồm: **[Nền Gradient thẻ - Màu Icon tròn - Màu chữ trạng thái]**:

```
┌─────────────────┬──────────────────────────┬────────────────┬────────────────┬───────────────────────────┐
│ Nhóm Nghiệp Vụ  │ Nền Thẻ (Card Gradient)  │ Icon Nền Đậm   │ Chữ Nhấn       │ Ứng dụng tiêu biểu        │
├─────────────────┼──────────────────────────┼────────────────┼────────────────┼───────────────────────────┤
│ Mint / Cyan     │ #E4FAFB → #D5F7F8        │ #009688 (Teal) │ #007482        │ Tổng tài sản, Nhập kho    │
│ Light Cyan      │ #E1F7FB → #CFF1F7        │ #00BCD4 (Cyan) │ #00838F        │ Tồn kho HCNS, Trong kho   │
│ Ocean Blue      │ #E9F3FD → #D8ECFC        │ #2196F3 (Blue) │ #1D70B8        │ Đang sử dụng, Nhân sự     │
│ Purple Lavender │ #F4EDFD → #EBE0FB        │ #7E57C2 (Tím)  │ #6B21A8        │ Tiêu hao, Cấp phát        │
│ Amber / Yellow  │ #FFF9E7 → #FEF3CE        │ #FF9800 (Cam)  │ #D97706        │ Chờ duyệt, Cần xử lý      │
│ Danger Red      │ #FEE2E2                  │ #EF4444 (Đỏ)   │ #DC2626        │ Báo hỏng, Quá hạn, Lỗi    │
└─────────────────┴──────────────────────────┴────────────────┴────────────────┴───────────────────────────┘
```

---

## 3. TYPOGRAPHY (FONT CHỮ & CẤP BẬC HIỂN THỊ)

- **Phông chữ chủ đạo**: `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

| Cấp bậc | Kích thước | Độ đậm (Weight) | Màu sắc | Ứng dụng thực tế |
| :--- | :--- | :--- | :--- | :--- |
| **Hero KPI Value** | `27px - 30px` | Bold 800 | `#0F172A` | Số liệu tổng thẻ KPI (`1.286`, `932`...) |
| **Page Title** | `21px - 22px` | Bold 700 | `#0F172A` | Tiêu đề màn hình ("Tổng quan tài sản") |
| **Brand Title** | `16px - 17px` | Bold 700 | `#FFFFFF` | Tên hệ thống trên Sidebar ("3T Asset") |
| **Card / Box Title**| `13.5px - 14px`| Bold 700 | `#0F172A` | Tiêu đề thẻ chức năng, bảng biểu |
| **Sidebar Menu** | `13.5px` | Medium 500 / Semi 600| `rgba(255,255,255,0.88)` | Danh sách menu điều hướng dọc |
| **Table Body / Form**| `11.5px - 12px`| Regular 400 / Medium 500| `#334155` | Nội dung ô trong bảng, input form |
| **Table Header** | `11px - 11.5px`| Semi 600 | `#64748B` | Tiêu đề các cột dữ liệu |
| **Caption / Subtext**| `10.5px - 11px`| Regular 400 | `#64748B` | Dòng mô tả nhỏ, ngày giờ chi tiết |
| **Badge / Tag** | `10px - 11px` | Semi 600 / Bold 700 | Theo trạng thái | Tag trạng thái, huy hiệu đếm số |

---

## 4. BỐ CỤC KHUNG TRANG (LAYOUT & STRUCTURAL GRID)

```
┌──────────────────┬────────────────────────────────────────────────────────────────────────┐
│                  │  TOPBAR: Chiều cao 64px, Nền Trắng, Border-bottom: #F1F5F9             │
│                  │  [Tìm kiếm (360px)]                [Quét QR] [🔔 6] [Avatar Tên v]    │
│                  ├────────────────────────────────────────────────────────────────────────┤
│     SIDEBAR      │  SUB-HEADER: [Tiêu đề trang] [Bộ lọc ngày] [Đơn vị v]   [🔄 Cập nhật]   │
│                  ├────────────────────────────────────────────────────────────────────────┤
│  Chiều rộng:     │  ROW 1: KPI CARDS (Grid 4 hoặc 5 cột, gap: 14px, Bo góc: 14px)        │
│  261px cố định   │  [ Thẻ 1 ]     [ Thẻ 2 ]     [ Thẻ 3 ]     [ Thẻ 4 ]     [ Thẻ 5 ]    │
│  Gradient Teal   ├────────────────────────────────────────────────────────────────────────┤
│  (100vh)         │  ROW 2: TRỰC QUAN / BIỂU ĐỒ (Grid 2 hoặc 3 cột, gap: 14px)             │
│                  │  [ Biểu đồ tháng (38%) ]    [ Biểu đồ tròn (34%) ]    [ Luồng (28%) ]   │
│  Chân trang:     ├────────────────────────────────────────────────────────────────────────┤
│  Sóng Cyan +     │  ROW 3: DANH SÁCH & THAO TÁC CHÍNH (Grid 2 cột, gap: 14px)             │
│  2 dòng slogan   │  [ Bảng công việc chính (60%) ]             [ Cảnh báo / Tiến trình ]  │
└──────────────────┴────────────────────────────────────────────────────────────────────────┘
```

- **Sidebar**:
  - Rộng chính xác **261px**.
  - Khoảng cách các menu items: `height: 40px`, padding: `0 14px`, bo góc `8px`.
  - Huy hiệu thông báo góc phải menu: Tròn màu đỏ `#EF4444`, text trắng đậm `11px`, kích thước `18x18px`.
- **Topbar**:
  - Cao **64px**, padding `0 24px`.
  - Thanh tìm kiếm: Bo góc `10px`, màu nền `#F1F5F9`, chiều rộng `360px`, cao `40px`.
  - Nút tác vụ nhanh (Quét QR...): Cao `38px`, viền `1px solid #E2E8F0`, bo góc `8px`.
- **Khung nội dung chính (Content)**:
  - Padding: `16px 24px 22px 24px`.
  - Khoảng cách giữa các hàng (`gap`): `14px`.

---

## 5. BO GÓC, VIỀN & ĐỔ BÓNG (RADIUS, BORDER & SHADOW)

### 5.1. Quy chuẩn Bo góc (Border Radius)
- **Thẻ Card / Container lớn**: `12px - 14px` (tạo cảm giác mềm mại, hiện đại).
- **Thanh tìm kiếm, Dropdown, Nút bấm**: `8px - 10px`.
- **Bộ lọc con (Filter tab pills)**: `12px` (dạng viên nang nhỏ).
- **Status Badges**: `10px - 11px`.
- **Icon tròn / Avatar / Badge số**: `50%` (Circle hoàn toàn).

### 5.2. Quy chuẩn Viền (Borders)
- **Viền thẻ nội dung**: `1px solid #F1F5F9` (cực mờ, chỉ đủ tách khối nhẹ).
- **Viền ô nhập liệu / Dropdown**: `1px solid #E2E8F0`.
- **Đường kẻ phân cách hàng trong bảng**: `1px solid #F1F5F9`.
- **TUYỆT ĐỐI KHÔNG** dùng viền đen đậm, viền xanh gắt hay viền đôi.

### 5.3. Quy chuẩn Đổ bóng (Shadows)
- **Card thông thường**: `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.025);` (độ nổi siêu nhẹ).
- **Dropdown / Menu nổi**: `box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);`.
- **Logo / Nút nổi bật**: `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.20);`.

---

## 6. HƯỚNG DẪN XÂY DỰNG CÁC MODULE TIÊU BIỂU

### 6.1. Thẻ Tóm tắt Thống kê (KPI Summary Card)
Mỗi màn hình module (Tài sản, Kho, Cấp phát, Kiểm kê...) nên mở đầu bằng 3 đến 5 thẻ KPI tóm tắt:
- **Cấu trúc**:
  1. Icon tròn góc trái trên (kích thước `38x38px` - `40x40px`, bo tròn 50%, màu nền đậm theo bảng pastel).
  2. Watermark mờ góc phải dưới (icon lớn `48px - 54px`, opacity `0.12 - 0.15`).
  3. Tên chỉ số (font `12px`, weight 600, màu `#334155`).
  4. Số liệu chính (font `28px - 29px`, weight 800, màu `#0F172A`).
  5. Xu hướng tăng/giảm (`↑ 12% so với kỳ trước` - màu xanh lá `#10B981` hoặc đỏ `#EF4444`).
  6. Dòng phụ chú giá trị tiền tệ (`Giá trị: 8,42 tỷ đồng` - màu `#64748B`).

### 6.2. Bảng dữ liệu danh sách (Data Tables)
- **Header**: Nền trắng hoặc `#F8FAFC`, chữ xám `#64748B`, font-size `11.5px`, font-weight 600, viền dưới `1px solid #F1F5F9`.
- **Row**: Padding dọc `8px`, chữ `#334155`, font-size `12px`.
- **Mã định danh (Mã phiếu / Mã tài sản)**: Bắt buộc dùng font-weight 600, màu link `#0284C7`.
- **Badge Trạng thái**:
  - `Chờ duyệt`: Nền `#E0F7FA`, chữ `#00838F`.
  - `Chờ kế toán duyệt`: Nền `#FEF3C7`, chữ `#D97706`, kèm chấm tròn màu cam phía trước (`•`).
  - `Đã hoàn thành / Đã duyệt`: Nền `#DCFCE7`, chữ `#16A34A`.
  - `Từ chối / Hỏng`: Nền `#FEE2E2`, chữ `#DC2626`.
- **Chân bảng**: Link tác vụ mở rộng căn phải (`Xem tất cả ... ➔`, màu `#009688`).

### 6.3. Bộ lọc nhanh (Filter Tabs)
- Bố trí ngay trên đầu bảng dữ liệu.
- Tab đang kích hoạt: Nền xanh teal `#009688`, chữ trắng `#FFFFFF`, bo góc `12px`, padding `4px 11px`.
- Tab không kích hoạt: Nền xám `#F1F5F9`, chữ `#64748B`, bo góc `12px`.

### 6.4. Hộp thoại & Form nhập liệu (Modal & Forms)
- Tiêu đề Form: Font `16px`, bold 700.
- Label trường nhập liệu: Font `12px`, weight 600, màu `#334155`.
- Ô Input / Select: Cao `36px`, viền `1px solid #E2E8F0`, bo góc `8px`, focus đổi viền sang `#009688` kèm glow `0 0 0 3px rgba(0, 150, 136, 0.15)`.
- Nút bấm chính (Submit): Nền `#009688`, chữ trắng, bo góc `8px`, height `36px`.
- Nút bấm phụ (Hủy): Nền trắng, viền `#E2E8F0`, chữ `#334155`.

---

## 7. MẪU CSS CLASS REUSABLE SẴN CÓ TRONG DỰ ÁN

Các module mới có thể tái sử dụng ngay lập tức các class đã được viết sẵn trong `styles.css`:

```css
/* Khung chứa màn hình */
.dashboard-container { display: flex; flex-direction: column; gap: 14px; }

/* Thẻ trắng tiêu chuẩn */
.content-card { background: #ffffff; border-radius: 12px; border: 1px solid #f1f5f9; padding: 14px 18px; }

/* Tiêu đề thẻ */
.card-header { display: flex; align-items: center; justify-content: space-between; }
.card-title { font-size: 14px; font-weight: 700; color: #0f172a; }
.card-header-link { font-size: 11.5px; font-weight: 600; color: #009688; }

/* 5 Bộ thẻ KPI pastel */
.kpi-card.card-cyan       /* Nền Xanh mint */
.kpi-card.card-blue-light  /* Nền Cyan ngọc */
.kpi-card.card-blue        /* Nền Xanh dương */
.kpi-card.card-purple      /* Nền Tím */
.kpi-card.card-yellow      /* Nền Vàng cam */

/* Bộ lọc Tabs */
.task-tab-btn             /* Nút tab inactive */
.task-tab-btn.active      /* Nút tab active xanh teal */

/* Bảng dữ liệu */
.task-table               /* Bảng phẳng tinh tế */
.code-link                /* Link mã phiếu màu #0284c7 */
.status-badge             /* Huy hiệu trạng thái bo tròn */
.badge-warning-dot        /* Trạng thái cam có chấm */
.badge-cyan-solid         /* Trạng thái xanh cyan */
```
