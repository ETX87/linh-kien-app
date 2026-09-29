# 🎨 NGUYÊN TẮC GIAO DIỆN XUYÊN SUỐT — ĐẶT MUA LINH KIỆN 3T

Tài liệu này là **quy tắc giao diện bắt buộc** cho toàn bộ app (mọi màn hình, module, tính năng mới
hoặc sửa lại). Nó dựa **nguyên vẹn** trên `DESIGN_SYSTEM.md` (ngôn ngữ thiết kế "3T Asset
Management"): triết lý, bố cục, typography, bo góc, viền, đổ bóng, cấu trúc component đều GIỮ NGUYÊN —
**chỉ thay gam màu thương hiệu Teal/Cyan bằng gam màu của icon app** (`frontend/public/icon-512.png`):
gradient xanh hoàng gia → xanh da trời → cyan.

Màu ngữ nghĩa (cảnh báo cam, lỗi đỏ, hoàn thành xanh lá, tím) và thang màu chữ/xám trung tính
**không đổi** so với `DESIGN_SYSTEM.md` — chúng không thuộc bản sắc thương hiệu.

---

## 0. NGUỒN GỐC GAM MÀU (lấy mẫu từ icon)

| Vị trí trên icon | Mã Hex | Vai trò trong hệ |
| :--- | :--- | :--- |
| Góc trên-trái (đậm nhất) | `#2466E4` | Đầu gradient thương hiệu |
| Giữa icon | `#1285E7` | Giữa gradient, màu Azure |
| Góc dưới-phải (sáng nhất) | `#0FC7F0` | Cuối gradient, màu nhấn Cyan |
| Chữ "3T" mờ | `#9AC9FA` | Tông sáng dùng cho watermark/nền phụ |

Gradient thương hiệu chuẩn: `linear-gradient(135deg, #2466E4 0%, #1285E7 55%, #0FC7F0 100%)` — chỉ
dùng cho logo, màn đăng nhập, hero/banner nhỏ; **không** dùng cho nút bấm hay nền bảng.

---

## 1. TRIẾT LÝ THIẾT KẾ

- **Modern Enterprise SaaS**: Tinh gọn, hiện đại, chuyên nghiệp, lấy trải nghiệm người dùng nghiệp vụ làm trọng tâm.
- **Data-Dense but Breathable**: Mật độ thông tin cao nhưng không rối mắt nhờ spacing, phân cấp thị giác và nền pastel.
- **Brand Signature (Royal Blue & Cyan)**: Sidebar dùng sắc xanh hoàng gia đậm, màu hành động là xanh
  primary của icon, cyan làm điểm nhấn trực quan; thẻ nội dung dùng nền pastel dịu mắt.
- **Fit-to-Viewport**: Ưu tiên bố cục vừa khít màn hình tiêu chuẩn (16:9 / 1080p), hạn chế cuộn không cần thiết.
- **Nhất quán tuyệt đối**: Một loại thông tin = một kiểu hiển thị ở MỌI màn hình (cùng badge, cùng màu,
  cùng vị trí nút). Không tự chế biến thể mới khi đã có mẫu trong tài liệu này.

---

## 2. HỆ THỐNG MÀU SẮC (COLOR TOKENS)

### 2.1. Màu thương hiệu & Điều hướng
| Token | Giá trị | Ứng dụng | (Thay cho token teal gốc) |
| :--- | :--- | :--- | :--- |
| `--sidebar-gradient` | `linear-gradient(180deg, #0D4FB8 0%, #0B46A6 45%, #093B8F 80%, #0E5CC4 100%)` | Nền Sidebar | `#0B6B7A → #017280` |
| `--brand-primary` | `#1467E8` | Nút hành động chính, tab active, link điều hướng, focus | `--teal-primary #009688` |
| `--brand-primary-hover` | `#0F56C4` | Hover/pressed của nút chính | — |
| `--brand-cyan` | `#0FC7F0` | Line biểu đồ, điểm nhấn trực quan, chấm tiến độ | `--teal-cyan #00A2B4` |
| `--brand-dark` | `#0F4FB0` | Tiêu đề khối pill, viền nổi bật, chữ nhấn trên nền xanh nhạt | `--teal-dark #007482` |
| `--brand-soft` | `#EAF2FF` | Nền nhạt của vùng/nút liên quan thương hiệu (ghost button, hàng được chọn) | — |
| `--sidebar-active-item` | `rgba(255, 255, 255, 0.25)` | Nền menu item đang chọn (bo 8px) | giữ nguyên |
| `--sidebar-hover-item` | `rgba(255, 255, 255, 0.10)` | Nền menu item khi rê chuột | giữ nguyên |

### 2.2. Nền & Bề mặt
| Token | Mã Hex | Ứng dụng |
| :--- | :--- | :--- |
| `--bg-main` | `#F6F9FE` | Nền toàn trang (trắng ánh xanh dương dịu — thay `#F7FBFE` ánh teal) |
| `--bg-surface` | `#FFFFFF` | Card, Topbar, Modal, Dropdown |
| `--bg-subtle` | `#F1F5F9` | Ô tìm kiếm, filter tab không chọn, header bảng |

### 2.3. Màu chữ (giữ nguyên thang slate trung tính)
| Token | Mã Hex | Ứng dụng |
| :--- | :--- | :--- |
| `--text-main` | `#0F172A` | Tiêu đề chính, số KPI lớn, nội dung quan trọng |
| `--text-body` | `#334155` | Nội dung thường, nhãn thẻ, dòng bảng |
| `--text-muted` | `#64748B` | Mô tả phụ, ngày giờ, header bảng |
| `--text-light` | `#94A3B8` | Trục biểu đồ, placeholder, icon mũi tên |
| `--text-link` | `#0B63CE` | Mã đơn / mã PXK / mã phiếu bấm được (xanh đậm hơn primary để đạt tương phản ≥ 4.5:1 ở chữ 12px) |
| `--color-money` | `#166534` | **MỌI số tiền** hiển thị (giá, tiền cần chuyển, công nợ, dự phòng, tổng tiền…) — chữ đậm 700, số canh đều. Bắt buộc render qua `<Money>{fmtVND(x)}</Money>` (`components/ui/Money.tsx`, class `.money`), không tự tô màu tay. Giá trị trống "—" giữ màu chữ nhạt. Chuỗi văn bản (toast, placeholder, tooltip) không áp dụng. *(Chốt người dùng 2026-09-28: "tất cả UI số tiền tô màu xanh lá cây đậm để dễ phân biệt".)* |
| `--color-nguoi-tao` / `--color-nguoi-nhan` | `#be185d` / `#1e40af` | Tên **người tạo đơn** (hồng đậm) / **người nhận hàng** (xanh dương đậm) ở bảng, nhóm, thẻ mobile, chi tiết đơn/PXK/trả hàng. Render qua `<NguoiTao>`/`<NguoiNhan>` (`components/ui/TenNguoi.tsx`, class `.nguoi-tao`/`.nguoi-nhan`) — CHỈ đổi màu, giữ độ đậm chữ nơi gọi. Không áp dụng cho option của dropdown chọn người. *(Chốt người dùng 2026-09-28.)* |
| (badge Loại) | theo nhóm | Nhãn **Loại / Loại đề xuất** ở MỌI màn render qua `<LoaiDeXuatBadge>` (`modules/datMuaLinhKien/SharedUi.tsx`): pill mềm, chữ IN HOA, KHÔNG chấm tròn (chấm của tone warning chỉ dành cho badge trạng thái "cần xử lý"), màu theo nhóm Mua=info / Công nợ=purple / Trả hàng=warning. *(Chốt người dùng 2026-09-28.)* |
| `--ck-*-bg` / `--ck-*-fg` | 11 cặp màu | **Loại chiết khấu** — MỖI loại 1 màu cố định (Không CK xám, Đình tủ xanh ngọc, 200k–500k hổ phách, Giá KTV xanh dương, Giá dự phòng tím, Công nợ xanh lơ; loại tự thêm xoay vòng 5 màu phụ theo id). Mọi nơi hiện loại chiết khấu (bảng, chi tiết, ô chọn, Settings, danh sách PXK) dùng `<LoaiChietKhauChip>`/`<LoaiChietKhauText>`/`ckClass()` (`modules/datMuaLinhKien/LoaiChietKhau.tsx`). Màu phân loại, KHÔNG mang nghĩa trạng thái. *(Chốt người dùng 2026-09-28.)* |

### 2.4. Bảng Pastel cho Thẻ KPI & Nhóm nghiệp vụ
Mỗi nhóm dữ liệu gắn 1 bộ **[Nền gradient thẻ – Icon tròn nền đậm – Chữ nhấn]**:

```
┌─────────────────┬──────────────────────────┬──────────────────┬────────────┬──────────────────────────────────┐
│ Nhóm            │ Nền Thẻ (Card Gradient)  │ Icon Nền Đậm     │ Chữ Nhấn   │ Ứng dụng tiêu biểu               │
├─────────────────┼──────────────────────────┼──────────────────┼────────────┼──────────────────────────────────┤
│ Royal Blue      │ #EAF2FF → #DAE8FE        │ #1467E8 (Primary)│ #0F4FB0    │ Tổng đơn, Đơn mới  (thay Mint)   │
│ Sky Cyan        │ #E3F8FD → #CFF2FB        │ #12B5E5 (Cyan)   │ #0379A8    │ Trong kho, Đang gửi (thay L.Cyan)│
│ Indigo          │ #EEF0FE → #E0E4FD        │ #4F63E6 (Indigo) │ #3440B8    │ Nhân sự, KTV  (thay Ocean Blue)  │
│ Purple Lavender │ #F4EDFD → #EBE0FB        │ #7E57C2 (Tím)    │ #6B21A8    │ Tiêu hao, Trả hàng   (giữ)       │
│ Amber / Yellow  │ #FFF9E7 → #FEF3CE        │ #FF9800 (Cam)    │ #D97706    │ Chờ duyệt, Cần xử lý (giữ)       │
│ Success Green   │ #E8FAF0 → #DCFCE7        │ #16A34A (Xanh lá)│ #15803D    │ Hoàn thành, Đã nhận  (giữ)       │
│ Danger Red      │ #FEE2E2                  │ #EF4444 (Đỏ)     │ #DC2626    │ Thiếu LK, Quá hạn, Lỗi (giữ)     │
└─────────────────┴──────────────────────────┴──────────────────┴────────────┴──────────────────────────────────┘
```
> "Ocean Blue" gốc bị đổi sang **Indigo** vì trùng tông với màu primary mới — hai nhóm KPI cạnh nhau
> phải phân biệt được bằng mắt.

---

## 3. TYPOGRAPHY (giữ nguyên `DESIGN_SYSTEM.md`)

- **Phông chủ đạo**: `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  (hỗ trợ đầy đủ tiếng Việt). Số liệu/mã dùng `font-variant-numeric: tabular-nums`.

| Cấp bậc | Kích thước | Weight | Màu | Ứng dụng |
| :--- | :--- | :--- | :--- | :--- |
| **Hero KPI Value** | `27px - 30px` | 800 | `#0F172A` | Số liệu tổng thẻ KPI |
| **Page Title** | `21px - 22px` | 700 | `#0F172A` | Tiêu đề màn hình |
| **Brand Title** | `16px - 17px` | 700 | `#FFFFFF` | Tên hệ thống trên Sidebar |
| **Card / Box Title** | `13.5px - 14px` | 700 | `#0F172A` | Tiêu đề thẻ, bảng |
| **Sidebar Menu** | `13.5px` | 500 / 600 | `rgba(255,255,255,0.88)` | Menu dọc |
| **Table Body / Form** | `11.5px - 12px` | 400 / 500 | `#334155` | Ô bảng, input |
| **Table Header** | `11px - 11.5px` | 600 | `#64748B` | Tiêu đề cột |
| **Caption / Subtext** | `10.5px - 11px` | 400 | `#64748B` | Mô tả nhỏ, ngày giờ |
| **Badge / Tag** | `10px - 11px` | 600 / 700 | Theo trạng thái | Tag trạng thái, badge đếm |

> Mobile (KTV): giữ đúng thang trên nhưng **cỡ chữ tối thiểu 12px** cho nội dung đọc được và vùng chạm
> tối thiểu 40×40px.

---

## 4. BỐ CỤC KHUNG TRANG (giữ nguyên)

```
┌──────────────────┬────────────────────────────────────────────────────────────────────────┐
│                  │  TOPBAR: cao 64px, nền trắng, border-bottom #F1F5F9                     │
│                  │  [Tìm kiếm (360px)]                          [🔔 6] [Avatar Tên v]      │
│                  ├────────────────────────────────────────────────────────────────────────┤
│     SIDEBAR      │  SUB-HEADER: [Tiêu đề trang] [Bộ lọc ngày] [Khu vực v]   [🔄 Cập nhật]   │
│  rộng 261px      ├────────────────────────────────────────────────────────────────────────┤
│  Gradient Royal  │  ROW 1: KPI CARDS (grid 4–5 cột, gap 14px, bo 14px)                     │
│  Blue (100vh)    ├────────────────────────────────────────────────────────────────────────┤
│                  │  ROW 2: TRỰC QUAN / BIỂU ĐỒ (grid 2–3 cột, gap 14px)                    │
│  Chân trang:     ├────────────────────────────────────────────────────────────────────────┤
│  Sóng Cyan +     │  ROW 3: DANH SÁCH & THAO TÁC CHÍNH (grid 2 cột, gap 14px)               │
│  2 dòng slogan   │                                                                        │
└──────────────────┴────────────────────────────────────────────────────────────────────────┘
```

- **Sidebar**: rộng **261px**; menu item cao `40px`, padding `0 14px`, bo `8px`; badge thông báo tròn
  đỏ `#EF4444`, chữ trắng đậm `11px`, `18×18px`. Sóng trang trí chân sidebar dùng `#0FC7F0` (opacity thấp).
- **Topbar**: cao **64px**, padding `0 24px`; ô tìm kiếm bo `10px`, nền `#F1F5F9`, rộng `360px`, cao
  `40px`; nút tác vụ nhanh cao `38px`, viền `1px solid #E2E8F0`, bo `8px`.
- **Content**: padding `16px 24px 22px 24px`, gap giữa các hàng `14px`.
- **Mobile**: sidebar thu thành drawer/bottom-nav, nội dung 1 cột, padding ngang `12px - 16px`, giữ gap `14px`.

---

## 5. BO GÓC, VIỀN & ĐỔ BÓNG (giữ nguyên)

### 5.1. Bo góc
- Card / container lớn: `12px - 14px`
- Ô tìm kiếm, dropdown, nút bấm: `8px - 10px`
- Filter tab pill: `12px`
- Status badge: `10px - 11px`
- Icon tròn / avatar / badge số: `50%`

### 5.2. Viền
- Viền thẻ: `1px solid #F1F5F9`
- Viền input / dropdown: `1px solid #E2E8F0`
- Kẻ phân cách hàng bảng: `1px solid #F1F5F9`
- **TUYỆT ĐỐI KHÔNG** dùng viền đen đậm, viền xanh gắt hay viền đôi.

### 5.3. Đổ bóng
- Card thường: `0 1px 3px rgba(0, 0, 0, 0.025)`
- Dropdown / menu nổi: `0 4px 16px rgba(0, 0, 0, 0.08)`
- Logo / nút nổi bật: `0 2px 8px rgba(0, 0, 0, 0.20)`

---

## 6. CÁC COMPONENT TIÊU BIỂU

### 6.1. Thẻ KPI (KPI Summary Card)
Mỗi màn hình module mở đầu bằng 3–5 thẻ KPI:
1. Icon tròn góc trái trên `38–40px`, bo 50%, nền đậm theo bảng pastel §2.4.
2. Watermark mờ góc phải dưới (icon `48–54px`, opacity `0.12–0.15`).
3. Tên chỉ số `12px`, 600, `#334155`.
4. Số liệu chính `28–29px`, 800, `#0F172A`.
5. Xu hướng `↑ 12% so với kỳ trước` — xanh lá `#10B981` hoặc đỏ `#EF4444`.
6. Dòng phụ chú giá trị (`Giá trị: 8,42 tỷ đồng`) — `#64748B`.

### 6.2. Bảng dữ liệu
- **Header**: nền trắng hoặc `#F8FAFC`, chữ `#64748B`, `11.5px`, 600, viền dưới `1px solid #F1F5F9`.
- **Row**: padding dọc `8px`, chữ `#334155`, `12px`. Hover hàng: nền `#F6F9FE`; hàng đang chọn: nền `#EAF2FF`.
- **Mã định danh** (mã đơn, mã PXK, mã YCSC…): bắt buộc weight 600, màu `#0B63CE`.
- **Badge trạng thái**:
  - `Chờ duyệt` / trạng thái đang chạy trung tính: nền `#E3F8FD`, chữ `#0379A8`.
  - `Chờ kế toán duyệt` / cần xử lý: nền `#FEF3C7`, chữ `#D97706`, kèm chấm tròn cam `•` phía trước.
  - `Đã hoàn thành / Đã duyệt`: nền `#DCFCE7`, chữ `#16A34A`.
  - `Từ chối / Hỏng / Thiếu`: nền `#FEE2E2`, chữ `#DC2626`.
  - Thông tin/nhãn thương hiệu (vd. loại đơn): nền `#EAF2FF`, chữ `#0F4FB0`.
- **Chân bảng**: link mở rộng căn phải (`Xem tất cả … ➔`), màu `#1467E8`.

### 6.3. Bộ lọc nhanh (Filter Tabs)
- Đặt ngay trên đầu bảng.
- Active: nền `#1467E8`, chữ `#FFFFFF`, bo `12px`, padding `4px 11px`.
- Inactive: nền `#F1F5F9`, chữ `#64748B`, bo `12px`. Hover inactive: nền `#EAF2FF`, chữ `#0F4FB0`.
- Số đếm trong tab: cùng hàng với nhãn, dạng `(12)` hoặc badge tròn nhỏ — **đồng bộ 1 kiểu trong toàn app**.

### 6.4. Modal & Form
- Tiêu đề form `16px`, 700. Label `12px`, 600, `#334155`.
- Input / Select: cao `36px`, viền `1px solid #E2E8F0`, bo `8px`; focus đổi viền sang `#1467E8` kèm glow
  `0 0 0 3px rgba(20, 103, 232, 0.15)`.
- Nút chính (Submit): nền `#1467E8` (hover `#0F56C4`), chữ trắng, bo `8px`, cao `36px`.
- Nút phụ (Hủy): nền trắng, viền `#E2E8F0`, chữ `#334155`.
- Nút nguy hiểm (Từ chối, Xoá): nền `#EF4444` (hoặc viền + chữ `#DC2626` nếu là hành động phụ).
- Thứ tự nút: phụ bên trái, chính bên phải, căn phải chân modal.

---

## 7. ÁNH XẠ SANG CODE (đã triển khai 2026-09-26)

Toàn bộ token ở trên đã có trong `frontend/src/styles/tokens.css` và `tailwind.config.js`:

| Guideline | Biến CSS | Ghi chú |
| :--- | :--- | :--- |
| Primary / hover / dark / soft | `--color-primary` / `-hover` / `-dark` / `-soft`, glow `--color-primary-ring` | |
| Gradient thương hiệu, cyan | `--brand-gradient`, `--brand-cyan` | Logo, màn đăng nhập, sóng sidebar |
| Nền trang / thẻ / subtle | `--color-background` / `--color-surface` / `--color-subtle` | |
| Chữ main / body / muted / light / link | `--color-text` / `-text-body` / `-text-secondary` / `-text-faint` / `--color-link` | |
| Viền thẻ / input / đậm | `--color-border-soft` / `--color-border` / `--color-border-strong` | |
| Ngữ nghĩa | `--color-{success,info,warning,danger,purple,neutral}` + `-strong` (chữ) + `-soft` (nền) | |
| Bộ pastel KPI | `--kpi-{blue,cyan,indigo,purple,amber,green,red}-{from,to,icon,fg}` | |
| Sidebar / Topbar | `--sidebar-*` (có `--sidebar-gradient`), `--topbar-*` | |
| Kích thước / bo góc / bóng | `--sidebar-w` `--topbar-h` `--radius-{kpi,card,field,btn,pill,badge}` `--shadow-{card,pop,raise,drawer}` `--overlay` | |

Token tên cũ (`--ocean-*`, `--ink-*`, `--line`, `--teal-*` = xanh lá, `--coral-*` = đỏ, `--amber-*`…) vẫn
còn dạng **alias** trỏ về đúng palette mới để module cũ tự khớp màu — code MỚI dùng thẳng `--color-*`.

Class dùng lại (trong `tokens.css`): `.content-card`, `.card-title`, `.card-header-link`, `.page-title`,
`.code-link`, `.filter-tab` (+`.active`), `.kpi-card` + `.kpi-{blue|cyan|indigo|purple|amber|green|red|gray}`
(con: `.kpi-icon`, `.kpi-watermark`, `.kpi-accent`), bảng `.tbl` + `<tr className="tbl-head">`.

Component đã theo guideline: `Btn` (primary xanh, cao ≥36px), `Badge`/`StatusBadge` (nền pastel, cam có
chấm), `StatCard` (thẻ KPI pastel), `Tabs` (filter pill), `Card`, `Modal`/`Drawer`, `Select`,
`ToggleSwitch`, `Sidebar`, `TopBar` (nền trắng — `TopBarActions` có prop `tone="light|dark"`), màn đăng nhập.

---

## 8. QUY TẮC BẮT BUỘC KHI CODE

1. **Chỉ dùng token, không hard-code hex** trong component. Màu mới phải thêm vào
   `frontend/src/styles/tokens.css` (ánh xạ tên token ở §2 sang biến CSS/Tailwind của app) trước rồi mới dùng.
2. **Không tạo biến thể màu/kích thước mới** cho badge, nút, thẻ, tab khi tài liệu đã có mẫu — tái sử dụng component sẵn có.
3. **Primary chỉ dành cho hành động chính**: mỗi vùng/modal tối đa 1 nút nền primary; các nút còn lại dùng kiểu phụ/ghost.
4. **Màu mang ý nghĩa cố định**: cam = cần xử lý/chờ, đỏ = lỗi/từ chối/thiếu, xanh lá = hoàn thành,
   cyan = đang chạy/trung tính, xanh primary = thương hiệu/hành động. Không dùng màu ngữ nghĩa để trang trí.
5. **Tương phản**: chữ trên nền phải đạt ≥ 4.5:1 (chữ nhỏ). Không đặt chữ trắng trên `#0FC7F0`/`#12B5E5` cỡ < 14px bold.
6. **Theme PWA** (`manifest.webmanifest` `theme_color`/`background_color`, `<meta name="theme-color">`)
   phải khớp tông sidebar `#0D4FB8`.
7. Khi đổi giao diện 1 màn hình, **rà cả desktop lẫn mobile** (`TaoDonMobileScreen.tsx` và các màn
   KTV) để giữ đúng quy tắc trên cả hai.
8. **Dữ liệu dạng bảng luôn 1 dòng — không tự xuống dòng** (yêu cầu 2026-09-26, áp dụng TOÀN hệ thống).
   Đã ép sẵn ở `tokens.css` (`.tbl th, .tbl td { white-space: nowrap }`, cụm `flex-wrap` trong ô cũng bị ép
   1 hàng) — mọi `<table>` PHẢI dùng class `.tbl` và nằm trong khung `overflow-x-auto` (bảng rộng hơn khung
   thì cuộn ngang, không bóp cột). Mã đơn/mã phiếu dùng `.code-link` (cũng `nowrap`). Không thêm
   `whitespace-normal`/`break-words` vào ô bảng. Cột cần giới hạn độ rộng (tên dài, ghi chú) thì dùng
   `table-layout: fixed` + `useAutoColumnWidths` + cắt `…` kèm `title` (mẫu: `DonCuaToiTab.tsx`) — không
   cho xuống dòng. Thẻ mobile (không phải bảng) theo quy ước riêng: 1 dòng/ý, `truncate`, badge thừa gộp "+N".
9. **Danh sách trên mobile (< 640px) KHÔNG được dùng thẻ "nhãn: giá trị" mặc định cho bảng nhiều cột** (rà soát
   2026-09-27: Danh sách KTV 15 dòng/thẻ ≈ 400px). Với `PaginatedTable`: gắn `mobile` cho các cột quan trọng —
   `title` (dòng 1 đậm) · `badge` (góc phải dòng 1) · `sub` (dòng 2 chữ phụ) · `meta` (dòng 3 các cặp ngắn) ·
   `hide`; cột không gắn tự ẩn trên thẻ (vẫn có ở chi tiết/desktop). Cần bố cục riêng thì dùng `mobileCard`.
   Bảng tự dựng (`<table>`) nhiều cột: thêm khối thẻ `sm:hidden` + bọc bảng `hidden sm:block` (mẫu:
   `TonKhoKtvModule.tsx`). Bảng ít cột (Settings) thì ẩn cột phụ bằng `hidden sm:table-cell` + bấm cả dòng để
   sửa. Thanh công cụ: ô tìm `w-full sm:w-64`, bộ lọc chia đôi hàng `flex-1 sm:flex-none`, nút phụ gom vào menu
   "⋯" hoặc rút nhãn trên mobile — không để 1 hàng nút `shrink-0` làm trang giãn ngang.
10. **Mobile — thao tác & nhập liệu** (rà soát màn Thiếu LK 2026-09-29, mẫu: `ThieuLkTab.tsx`): nút hành động trên thẻ
   PHẢI có chữ (động từ ngắn: "Tiếp nhận", "Hàng đã về"), không dùng icon trơn — màn cảm ứng không có tooltip; cao
   ≥ 40px; thứ tự nguy hiểm trái → phụ → chính phải. Ô nhập/tìm kiếm dùng `text-base sm:text-sm` (chữ < 16px khiến iOS
   tự phóng to trang khi chạm). Bộ lọc trạng thái nhiều mục: 2 tầng (nhóm chia đều 1 hàng + chip con của nhóm đang
   chọn, `ThieuLkStatusRail.tsx`), không trộn nhóm và mục vào 1 hàng cuộn ngang. Hàng chip cuộn ngang dùng
   `.no-scrollbar`. Thanh thao tác hàng loạt nổi ở đáy (trên bottom-nav) khi đang chọn.

---

## 9. BIỂU ĐỒ & BÁO CÁO (thêm 2026-09-26)

**Bộ component** `frontend/src/components/charts/` (SVG tự dựng, không thư viện ngoài — nhẹ cho mobile,
ăn đúng token): `ChartCard`/`ChartLink`/`ChartLegend`, `TrendChart` (area/line nhiều chuỗi + crosshair),
`DonutChart` (tổng ở giữa + chú thích số & %), `VBarChart` (cột gradient bo 6px đỉnh), `HBarList`
(thanh ngang / Top N có vòng số hạng), `StackedBar` (phân bố 100%). Thẻ KPI dùng `x/StatCard`
(`color`, `iconType`, `sub`).

**Màu biểu đồ** — đã chạy `validate_palette.js` của skill dataviz, PASS đủ 5 check:
- Categorical (dùng ĐÚNG thứ tự, tối đa 5, thứ 6 trở đi gộp "Khác"): `--chart-1` `#1467E8` →
  `--chart-2` `#E5700A` → `--chart-3` `#0A93C4` → `--chart-4` `#7E57C2` → `--chart-5` `#15A04A`.
- Xu hướng: tạo mới `--chart-new` (xanh) · đã duyệt `--chart-ok` (xanh lá) · từ chối `--chart-reject`
  (tím, nét đứt — KHÔNG dùng đỏ cạnh xanh lá: trượt kiểm tra mù màu).
- Trạng thái: `--chart-good` / `--chart-warn` / `--chart-bad` — luôn kèm icon + chữ + số.

**Quy tắc bắt buộc:**
1. Biểu đồ đặt TRÊN, bảng chi tiết giữ DƯỚI (bảng là nơi tra từng dòng + là "table view" cho a11y).
2. Mọi cột/lát/thanh bấm được phải nhảy tới đúng tab/bộ lọc như con số tương ứng trong bảng.
3. Màu theo THỰC THỂ, không theo thứ hạng: xếp hạng người dùng 1 màu thương hiệu (chỉ tô nổi bật
   phần tử cần chú ý, vd giai đoạn chậm nhất = cam).
4. Một trục Y duy nhất; số đếm thì vạch chia luôn là số nguyên (`niceScale`).
5. Chữ/số dùng màu chữ, không tô theo màu series; chấm/vạch màu bên cạnh mang danh tính.
6. Mobile: KPI lưới 2 cột, biểu đồ co theo bề rộng thật (`useElementWidth`), nhãn trục thưa theo pixel,
   bảng số liệu dài thu gọn sau nút "Xem bảng số liệu".
