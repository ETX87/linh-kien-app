# UI_SPEC.md — Hợp đồng thiết kế "Đặt hàng linh kiện 3T"

> **Đây là nguồn chân lý DUY NHẤT về thị giác của prototype `ui-prototype/`.**
> Mọi lần sửa UI phải bám file này. KHÔNG tự ý đổi token, kích thước, màu, bố cục, hành vi component
> nếu người dùng không yêu cầu rõ. Khi ảnh demo và file này mâu thuẫn → hỏi người dùng, không tự quyết.
> File này KHÁC `ui-concepts/SPEC.md` (đặc tả nghiệp vụ/quyền) — file này chỉ nói về **thị giác + tương tác**.

Nguồn: 3 screenshot 260910 + ảnh sidebar/topbar navy + ảnh KPI có màu (người dùng gửi 2026-09-10)
+ `Prompt Claude Code — Xây dựng UI QLBH 3T giống screenshot 260910.md`.
Phong cách: **Modern Enterprise SaaS / Premium Operations Dashboard** — chrome (menu + top banner)
tối màu navy, vùng nội dung sáng, mật độ dữ liệu cao, viền mảnh, gần như không shadow.

---

## 1. Design tokens (`src/styles/tokens.css` — `:root`)

Tất cả component **chỉ** dùng `var(--…)`. Không hardcode hex trong `.tsx` (ngoại lệ: gradient tính
bằng `color-mix()` inline cho StatCard / nhóm KPI theo vai trò — vẫn tham chiếu token).

### 1.1 Màu thương hiệu / nền / chữ / viền
| Token | Giá trị | Dùng cho |
|---|---|---|
| `--color-primary` | `#1467e8` | Nút chính, chip filter active, link, số pivot, viền focus |
| `--color-primary-hover` | `#0f56c4` | Hover nút primary |
| `--color-primary-dark` | `#071b3a` | (dự phòng) |
| `--color-primary-soft` | `#eaf2ff` | Nền nhạt của primary (badge active, tile icon) |
| `--color-background` | `#f4f7fb` | Nền toàn trang (vùng nội dung) |
| `--color-surface` | `#ffffff` | Nền card / bảng / drawer / modal |
| `--color-surface-soft` | `#fbfcfe` | Header bảng, panel "Lọc thêm" |
| `--color-surface-hover` | `#f2f6fc` | Hover hàng bảng / nút ghost |
| `--color-text` | `#17243a` | Chữ chính |
| `--color-text-secondary` | `#70809a` | Chữ phụ, nhãn |
| `--color-text-faint` | `#9aa8bd` | Chữ mờ, placeholder, icon "→" |
| `--color-border` | `#dce5f1` | Viền mặc định |
| `--color-border-strong` | `#c3d0e2` | Viền input, đường kẻ nhấn |

### 1.2 Màu ngữ nghĩa trạng thái (badge + nút hành động)
| Token | Giá trị | `-soft` | Nghĩa |
|---|---|---|---|
| `--color-success` | `#0ca678` | `#e3f7f0` | Nút **Duyệt** (xanh lá), trạng thái hoàn thành / đã duyệt / **"Chờ Trạm duyệt"** |
| `--color-info` | `#1467e8` | `#eaf2ff` | "Chờ TN duyệt", "Đang xử lý", "Chờ kho", "Chờ QC" |
| `--color-warning` | `#f59f00` | `#fef4e0` | "Chờ TBP xác nhận", "Chờ kế toán duyệt mềm", "Chờ hàng" (chữ hiển thị dùng `#b9770e`) |
| `--color-danger` | `#ef476f` | `#fde8ee` | **"Từ chối"**, **"Quá hạn"**, nút Từ chối / Huỷ |
| `--color-purple` | `#7357d9` | `#efeafb` | Badge "Công nợ" ở cột Loại; bước "Lên PXK" |
| `--color-neutral` | `#70809a` | `#eef1f6` | "Đã huỷ" |
| `--color-star` | `#f5a524` | — | Sao ⭐ đơn ưu tiên |

> **Quy tắc màu trạng thái (chốt theo screenshot):** `Từ chối` = ĐỎ (không tím). `Chờ Trạm duyệt` = XANH LÁ.
> `Quá hạn` = ĐỎ. `Đã huỷ` = XÁM. Map ở `components/ui/Badge.tsx → statusTone()`.

### 1.3 Màu theo vai trò — nền nhóm KPI trên Trang chủ
| Vai trò | `--role-*` | `--role-*-soft` |
|---|---|---|
| TN (Tác nghiệp) | `#0e9f8f` | `#dbf4f0` |
| Kho | `#16a34a` | `#e2f6e9` |
| Kế toán | `#1467e8` | `#e6f0ff` |
| QC | `#6366f1` | `#ecebfe` |
| GS (Giám sát) | `#db2777` | `#fce7f1` |

### 1.4 Chrome tối — Sidebar + Top banner (DARK NAVY)
| Token | Giá trị | Dùng cho |
|---|---|---|
| `--sidebar-bg-from` / `--sidebar-bg-to` | `#0d2a54` → `#0a1c3b` | Nền sidebar (gradient dọc 55%) |
| `--sidebar-fg` | `#e6edf8` | Chữ/icon mục menu |
| `--sidebar-fg-dim` | `#93a6c6` | Nhóm header ("VẬN HÀNH"/"HỆ THỐNG"), subtitle logo |
| `--sidebar-hover-bg` | `rgba(255,255,255,.06)` | Hover mục menu |
| `--sidebar-active-bg` | `#1668e3` | **Mục menu đang chọn — ô bo tròn tô đặc xanh** |
| `--sidebar-active-fg` | `#ffffff` | Chữ mục đang chọn |
| `--sidebar-border` | `rgba(255,255,255,.08)` | Đường kẻ trong sidebar |
| `--sidebar-tag-bg` / `--sidebar-tag-fg` | `#1d3a63` / `#b6c8e6` | Pill "Admin" cạnh mục hệ thống |
| `--topbar-bg` | `#0b2149` | Nền top banner (đặc, không gradient) |
| `--topbar-fg` / `--topbar-fg-dim` | `#e6edf8` / `#93a6c6` | Chữ/icon top banner |
| `--topbar-field-bg` / `--topbar-field-border` | `rgba(255,255,255,.08)` / `rgba(255,255,255,.16)` | Ô tìm kiếm trên top banner |
| `--topbar-border` | `rgba(255,255,255,.1)` | Kẻ dưới top banner |

### 1.5 Chip vai trò trên top banner
`--chip-bg` `#e2f2f6` · `--chip-fg` `#0f6f86` (pill xanh ngọc nhạt, đọc tốt trên nền navy).

### 1.6 Kích thước (đo từ screenshot — KHÔNG đổi tuỳ tiện)
| Token | Giá trị |
|---|---|
| `--sidebar-w` / `--sidebar-w-collapsed` | `240px` / `68px` |
| `--topbar-h` | `56px` |
| `--content-pad` | `24px` (desktop) · `16px 14px 20px` (mobile) |
| `--drawer-w` | `500px` |
| `--row-h` | `54px` (chiều cao hàng bảng) |
| `--radius-card` | `10px` (card / drawer / modal / dropdown) |
| `--radius-btn` | `8px` (nút / input) · pill = `999px` |

### 1.7 Bóng đổ (dùng rất tiết chế)
`--shadow-drawer` `0 8px 30px rgba(9,30,66,.12)` — chỉ Drawer / Modal / dropdown lớn.
`--shadow-pop` `0 4px 16px rgba(9,30,66,.10)` — popover nhỏ, toast, nút nổi.
**Card / bảng / KPI KHÔNG dùng shadow** — phân tách bằng viền 1px + nền.

### 1.8 Typography
- Body: **Inter** (`--font-body`), fallback `"Segoe UI", Arial, sans-serif`. Cỡ gốc `14px`.
- Mã (ID đơn, mã LK, giá tiền, số liệu): **IBM Plex Mono** (`--font-mono`) + `font-variant-numeric: tabular-nums`
  (class `.font-mono` hoặc `.tabular`).
- Cỡ chữ hay dùng: tiêu đề trang `22px/800`; tiêu đề section `12px/700 uppercase`; nhãn KPI `12px/600`;
  số KPI `25px/800`; text bảng `12.5–13px`; badge `11px/600`; nhãn form `11px/700 uppercase`.

---

## 2. Component contract (`src/components/ui/`, `src/components/layout/`)

### 2.1 `Btn`
- Biến thể: `primary` (nền `--color-primary`, chữ trắng) · `ghost` (nền surface, viền, hover surface-hover)
  · `success` (nền `--color-success`) · `danger` (nền `--color-danger`) · `danger-line` (viền đỏ, chữ đỏ,
  hover `--color-danger-soft`) · `subtle` (nền `--color-primary-soft`).
- Cỡ: `xs` (h28) · `sm` (h32) · `md` (h36). Bo `--radius-btn`. `loading` → spinner + disable.
- **Nhãn nút = thể mệnh lệnh** ("Duyệt", "Từ chối", "Huỷ đơn"). Badge trạng thái = thể quá khứ.
- Nút **"Duyệt"** luôn `success` (xanh lá). Nút **"Duyệt và tiếp theo →"** luôn `primary` (xanh dương, CTA).
  Nút "Từ chối" trong footer Drawer có caret `▾`.

### 2.2 `Badge` / `StatusBadge` / `RoleChip`
- `Badge`: pill bo tròn `11px/600`, mặc định **viền mảnh + chữ màu** (`variant="line"`); `variant="soft"`
  = nền nhạt + chữ đậm cùng tông. Tone: info/success/warning/danger/purple/neutral.
- `StatusBadge`: bọc `Badge` + `statusTone(status)` — map ở §1.2.
- `RoleChip`: pill `--chip-bg/--chip-fg`, `10.5px/600`, `whitespace-nowrap`. Dùng trên top banner.

### 2.3 `StatCard` (thẻ KPI)
- Layout: `[tile icon 36×36 bo 8px]  [nhãn 12px/600 secondary] + [số 25px/800 tone] + [→ faint]`, ngang.
- **Nền = gradient nhạt theo tone**: `linear-gradient(140deg, <tone-soft> 0%, var(--color-surface) 60%)`,
  viền = `color-mix(in srgb, <tone-edge> 32%, var(--color-border))`. (Yêu cầu "các khu vực đều có màu khác nhau".)
- `muted` (số = 0) → số màu `--color-text-faint`. `active` → viền primary + ring `--color-primary-soft`.
- Bấm được → `cursor-pointer`, hover `brightness .985`, mũi tên `→` dịch phải nhẹ.

### 2.4 `FilterChips` (quick filter)
- Hàng pill h32 bo tròn. Active = nền `--color-primary` chữ trắng; thường = viền + chữ secondary.
- Kèm `count` (pill số nhỏ) và `icon` tuỳ chọn (⭐ / 🔴).
- **Mua hàng**: `Tất cả · Chờ tôi duyệt · ⭐ Ưu tiên · 🔴 Quá hạn`.
- **Sub-filter (#4)**: khi chọn "Chờ tôi duyệt" → hiện HÀNG PHỤ ngay dưới: viền đứt, nhãn "LOẠI ĐỀ XUẤT"
  + pill "Tất cả" + 1 pill / mỗi Loại đề xuất có trong tập. Đổi chip chính → reset sub-filter.

### 2.5 `Toolbar` (không phải component — quy ước bố cục)
`[SearchBar co giãn]  [Lọc thêm (ghost, icon phễu)]  [+ Tạo đơn (primary)]  [Nhập Excel (ghost)]`.
"+ Tạo đơn" / "Nhập Excel" chỉ hiện khi có quyền tạo đơn (hoặc `showCreateActions` với bảng nhúng).

### 2.6 Panel "Lọc thêm"
- Bọc trong khối `--color-surface-soft` viền `--radius-card`, lưới 1→2→3 cột.
- **TẤT CẢ điều kiện là `<Select>` dropdown** (#3): Người nhận (KTV) · Giám sát (GS) · Khoảng ngày
  (Tất cả / 7 / 30 / 90 ngày) · Mã linh kiện · Loại đề xuất · Trạng thái. Mỗi cái có `— Tất cả —`.
  Kèm nút "Xoá lọc" (ghost) góc phải.

### 2.7 `BulkActionBar`
Chỉ hiện khi chọn ≥1 dòng. Nền `--color-primary-soft`, viền primary/25. `"Đã chọn N"` +
`Duyệt hàng loạt` (success) + `Từ chối hàng loạt` (danger-line) + `Bỏ chọn` (ghost). **Nhãn: "Bỏ chọn"** (không phải "Bù chọn").

### 2.8 `DataTable`
- Bọc `overflow-x-auto` + `<table>` có `min-width: 1060px` → **cuộn ngang** khi khung hẹp, không bóp cột.
- Mọi ô `white-space: nowrap`. Header: nền `--color-surface-soft`, `12px/600 uppercase`, kẻ dưới 1px.
- Hàng cao `--row-h` (54px), hover `--color-surface-hover`, kẻ dưới 1px. Bấm hàng = mở Drawer.
- Cột đầu = checkbox (`selectable`). `rowAccent` = đơn ⭐ → nền `#fff8ec`.
- **Cột chuẩn Mua hàng**: ☐ · Mã đơn (mono + ⭐) · Loại (Badge Mua=info / Công nợ=purple) · Linh kiện
  (`LK### — tên`) · SL đề xuất (phải) · Giá đề xuất (mono, phải) · [Công nợ (chỉ tab công nợ)] ·
  Người nhận (+ "GS: …" dòng phụ) · Người tạo (+ "(tạo hộ)") · Ngày tạo (`dd/MM HH:mm`) · Trạng thái
  (StatusBadge) · Hành động.
- **Cột chuẩn Trả hàng**: ☐ · Mã đơn (mono + ⭐) · Loại (Badge "Trả hàng"=warning) · Linh kiện · SL ·
  Người tạo (chỉ tên) · **GS (cột riêng)** · Ngày tạo · **Bước hiện tại** (Badge soft + icon theo bước,
  `RETURN_STEP_META`) · Trạng thái (Đang xử lý=info / Hoàn thành=success / Từ chối=danger) · Hành động = **chỉ "Xem"**.
- Hành động 1-chạm: **Mua hàng** có `Duyệt`(success xs) + `Từ chối`(danger-line xs) hoặc `Xem`(ghost xs)
  tuỳ quyền+bước. **Trả hàng KHÔNG có** nút bước ở bảng (xử lý trong Drawer).

### 2.9 `Drawer` (chi tiết đơn) — trượt từ phải
- Rộng `--drawer-w` (500px) trên desktop; **mobile → BottomSheet full-height** (`inset top-6`).
- Header h52: `[Mã đơn mono/700] [⭐] [StatusBadge]` … `[‹ ›] [✕]`. Esc / ‹ › điều hướng dòng.
- **Tabs (bắt buộc)**: `Thông tin đơn · Case (n) · Lịch sử xử lý · Giải trình (n)`.
- Tab "Thông tin": `SectionTitle` có chevron; **OrderDrawer = grid 1 cột** key-value (khớp screenshot 3);
  **ReturnDrawer = grid 2 cột** (khớp screenshot 1). `KvRow` = `[nhãn 136px secondary] [giá trị 500]`, kẻ dưới mảnh.
  Có mục gập "Thông tin bổ sung" + khối "Công nợ tạm tính" (Đủ/Không đủ + thanh %).
- Tab "Case": `CaseList` — dòng `mã case mono/primary` + KH + khu vực + ✕; nút "Gắn thêm case".
- Tab "Lịch sử": `Timeline` — chấm tròn, `[trạng thái] [thời gian phải]` + `người · ghi chú`. Link "Xem tất cả".
- Tab "Giải trình": panel nền `--color-danger-soft/50` viền đỏ nhạt + `TextArea` + nút "Lưu giải trình" +
  danh sách lịch sử (nội dung · người · thời gian · "Lần đầu").
- **Footer sticky** (thể mệnh lệnh): `Duyệt`(success) · `Từ chối ▾`(danger) · `Huỷ đơn`(ghost) ·
  `Sửa đơn`(ghost) · `Duyệt và tiếp theo →`(primary, đẩy phải). ReturnDrawer thêm `Lùi bước`(ghost) cho Kế toán/Kho.

### 2.10 `Modal` — "Tạo đơn" / "Nhập Excel"
- Giữa màn, `--radius-card`, `--shadow-drawer`. **Mobile → full-screen** (`fullScreenMobile`).
- **Tạo đơn**: form theo luồng tab bàn phím: Người nhận → Loại đề xuất → LinhKienPicker (search →
  kết quả: ảnh + `LK### — tên` + hãng + giá + badge Đặc thù/Only sửa chữa + gợi ý "Có thể thay bằng …")
  → Số lượng + ⭐ Ưu tiên → bảng dòng đã thêm + Tổng giá đề xuất → Ghi chú / Yêu cầu hoá đơn /
  **Mã yêu cầu sự cố (case)** + nút "Kiểm tra".
  - **#5: KHÔNG có checkbox "Đính kèm case này vào đơn"** — nhập mã hợp lệ là case **mặc định đính kèm**.
    Sau "Kiểm tra" hiện khối xác nhận nền `--color-success-soft`.
- Footer: `Nhập Excel`(ghost) · `Huỷ`(ghost) · `Tạo đơn`(primary).
- **Nhập Excel**: vùng kéo-thả → bảng preview mock + "✓ N hợp lệ · ✕ M lỗi" + list lỗi + `Tải file mẫu` / `Huỷ` / `Nhập ngay`.

### 2.11 `WorkflowStepper` (Trả hàng)
- Dải ngang cuộn được, viền `--radius-card`: 6 vòng tròn đánh số nối bằng `›`:
  `1 Chờ kế toán duyệt mềm · 2 Chờ kho xác nhận · 3 Chờ QC xác nhận · 4 Chờ TN duyệt tổng · 5 Đã duyệt · 6 Lên PXK (trả hàng)`.
  Sau đó divider đứt đỏ + nhánh `✕ Từ chối` (đỏ).
- Vòng: active = nền `--color-primary` chữ trắng; đã qua = viền primary + ✓ + nền `--color-primary-soft`;
  chưa tới = viền `--color-border-strong` + số mờ. **KHÔNG hiện badge số đếm trên bước.**
- Bấm 1 bước = lọc bảng theo bước; bấm nhánh = lọc "Từ chối".

### 2.12 `Timeline`, `Pagination`, `EmptyState`, `Toast`, `ConfirmDialog`
- `Timeline`: viền trái + chấm; chấm cuối = primary đặc.
- `Pagination`: `‹ 1 2 … N ›`, trang hiện tại nền primary. Ẩn khi ≤1 trang.
- `Toast`: góc dưới phải, `--shadow-pop`, tự ẩn ~2.8s, kind success/info/danger.
- `ConfirmDialog`: Modal nhỏ (440px); `reasons` → bắt buộc chọn 1 lý do (Select) trước khi xác nhận;
  luôn có ô "Ghi chú". Dùng cho Từ chối / Huỷ đơn.

---

## 3. Layout / Shell

### 3.1 Sidebar (`components/layout/Sidebar.tsx`)
- Rộng `--sidebar-w`, **nền DARK NAVY** (gradient `--sidebar-bg-from → --sidebar-bg-to`).
- Trên cùng h`--topbar-h`: `[tile "3T" gradient xanh 32px]  "Đặt hàng linh kiện" (13px/800 trắng) / "3T" (11px dim)`.
- Nhóm: `VẬN HÀNH` { Trang chủ · Đặt mua linh kiện *(badge đỏ số việc)* · Trả hàng · Danh mục linh kiện ·
  Tồn kho công nợ KTV } · `HỆ THỐNG` { Báo cáo tốc độ xử lý · Cài đặt · Quản lý người dùng } — 3 mục sau
  có pill **"Admin"** (`--sidebar-tag-bg/fg`).
- Mục menu: chữ `--sidebar-fg` + icon outline 18px; **active = ô bo `--radius-btn` tô đặc `--sidebar-active-bg`,
  chữ trắng** (KHÔNG dùng border-left). Hover = `--sidebar-hover-bg`.
- Chân: nút "‹ Thu gọn sidebar" (`--sidebar-fg-dim`). Thu gọn → chỉ icon, rộng `--sidebar-w-collapsed`.

### 3.2 Top banner (`components/layout/Topbar.tsx`) — **DARK NAVY**
- Cao `--topbar-h`, nền `--topbar-bg`, kẻ dưới `--topbar-border`.
- Trái: nút `☰` (toggle thu gọn sidebar) → breadcrumb `[📅 icon] [gốc dim] › [trang hiện tại trắng/600]`.
  Gốc: "Mua hàng/Công nợ/PXK/Thiếu LK/Báo cáo" → **"Đặt mua linh kiện"**; còn lại → **"Trang chủ"**.
- Giữa: ô "Tìm kiếm hoặc gõ lệnh… (Ctrl K)" — nền `--topbar-field-bg`, viền `--topbar-field-border`,
  `flex-1` max `380px`.
- Phải: `NotificationPanel` (chuông + badge đỏ số chưa đọc) + `PersonaSwitcher` (avatar tròn + tên trắng +
  email dim + "Admin ▾") + hàng `RoleChip` (từ `xl`). NotificationPanel & PersonaSwitcher nhận prop `onDark`.
- Dropdown của chuông / persona **vẫn nền sáng** (`--color-surface`).

### 3.3 Mobile (khung giả lập 390×844)
- **KHÔNG sidebar, KHÔNG hamburger, KHÔNG drawer trái.**
- Top app bar: `[tile "3T"] [tên trang] … [chuông]` — nền navy như desktop.
- **Bottom nav — tối đa 5 nút**: `Trang chủ · Mua hàng · Trả hàng · Danh mục · Thêm`. Nút thứ 5 **"Thêm"**
  mở panel menu đầy đủ (component `Sidebar` bản mobile, **nền dark navy**) trượt từ dưới lên, kèm
  `PersonaSwitcher` (onDark) ở chân. Active tab = chữ `--color-primary`.
- Danh sách → cân nhắc dạng card (đợt sau); hiện tại bảng cuộn ngang trong khung.
- Drawer → BottomSheet full-height. Modal "Tạo đơn" → full-screen.
- Nút nổi "🖥️ Bản Web / 📱 Bản Mobile" cố định góc **dưới trái** (chỉ prototype).

### 3.4 Trang chủ ("Việc cần làm") — `pages/DashboardPage.tsx`
1. `PageHeader` "Việc cần làm" + `[📅] Hôm nay, <thứ, dd/MM/yyyy>`.
2. **4 thẻ KPI lớn** (mỗi thẻ 1 tone + gradient nền riêng, §2.3): *Đơn của tôi đang chờ duyệt* (warning) ·
   *Đơn bị từ chối* (danger) · *PXK chờ tôi xác nhận nhận hàng* (info) · *PXK chờ tôi chuyển tiền* (**purple**).
   Lưới `grid-cols-2` (mobile) / `lg:grid-cols-4`.
3. **Nhóm KPI theo vai trò** — lưới `md:2 / xl:3`. Mỗi nhóm = 1 khối **nền gradient theo `--role-*`**
   (`linear-gradient(160deg, <role-soft> 0%, surface 46%)`, viền `color-mix(<role> 26%, border)`),
   header `[tile icon nền trắng, chữ role-color] [tên role bold role-color]`, bên trong là các ô con
   **nền trắng** viền `--color-border` (nhãn 11px + số 19px/800). GS = 1 ô; QC = 1 ô "Việc QC cần xác nhận".
4. **"Đang tồn"** (Card): list `nhãn — số ›` bấm nhảy tab.
5. **"Báo cáo"** (Card): hàng Tabs `Tổng quan · Doanh thu · Hiệu suất · SLA`; hiện **cả 2 khối**:
   *Thẻ cá nhân* (Đơn của tôi / Tổng tiền / Đã duyệt + line chart) **và** *Pivot nhanh*
   (Tổng đơn / Tổng tiền thực tế / Chờ duyệt + %↑↓ + bar chart).
6. Section "Mua hàng" — nhúng `OrdersView` (compact + toolbar đủ).

### 3.5 Mua hàng / Công nợ — `pages/PurchasePage.tsx` + `OrdersView`
`PageHeader` (title + nút "Nhập Excel" ghost + "Tạo đơn" primary) → 5 StatCard
(*Chờ tôi duyệt* warning · *Ưu tiên* warning · *Quá hạn* danger · *Đã duyệt* success · *Tổng đơn* info)
→ FilterChips (+ sub-filter khi "Chờ tôi duyệt") → Toolbar → panel "Lọc thêm" (6 dropdown) →
BulkActionBar → DataTable → dòng "Hiển thị N / M đơn" + Pagination → Drawer.
Công nợ = cùng trang, thêm cột "Công nợ" + badge Đủ/Không đủ.

### 3.6 Trả hàng — `pages/ReturnPage.tsx`
`PageHeader` "Trả hàng" (subtitle "Chế độ theo dõi…" nếu read-only) → `WorkflowStepper` →
FilterChips (`Tất cả · ⭐ Ưu tiên · 🔴 Từ chối`) + SearchBar → DataTable (cột §2.8) →
"Hiển thị N / M đơn" → **2 card dưới bảng**: *Thống kê nhanh* (Tổng đơn / Đã duyệt / Đang xử lý / Từ chối)
+ *Báo cáo (thẻ cá nhân)* (Đơn của tôi / Tổng tiền / Đã duyệt) → Drawer.

---

## 4. Responsive

| Breakpoint | Bề rộng | Bố cục |
|---|---|---|
| Desktop | ≥ 1200px | Sidebar cố định 240px + top banner + nội dung. KPI hàng ngang (4–5). Nhóm vai trò 3 cột. Drawer 500px. |
| Tablet | 768–1199px | Sidebar vẫn hiện (có thể thu gọn). KPI 2 cột. Nhóm vai trò 2 cột. Bảng cuộn ngang. |
| Mobile | < 768px (khung 390) | Không sidebar; bottom nav 5 nút. KPI 2 cột. Nhóm vai trò 1 cột. Drawer/Modal → sheet/full-screen. |

- Lưới responsive dùng tiền tố Tailwind `md:` / `lg:` / `xl:` **theo viewport**. Ở "Bản Mobile" (khung
  giả lập trong viewport rộng) phải truyền prop `mobile` xuống page để chọn nhánh layout — KHÔNG dựa `sm:`.
- Bảng luôn `overflow-x-auto` + `min-width` (§2.8) — không bao giờ bóp cột / xuống dòng lộn xộn.
- Nút chạm ≥ 44px trên mobile (bottom nav, sheet).

---

## 5. Tương tác tối thiểu (phải chạy trên mock)
Đổi persona → menu/nút/dữ liệu re-render theo quyền · FilterChips + sub-filter · search realtime ·
Lọc thêm (6 dropdown) · chọn dòng/tất cả + BulkActionBar · mở/đóng Drawer + ‹ › + "Duyệt và tiếp theo" ·
Tạo đơn (thêm/xoá dòng + tổng tiền + kiểm tra case) · NotificationPanel (mark read → nhảy Drawer) ·
Stepper Trả hàng đổi bước → Timeline cập nhật · toggle Web/Mobile.

## 6. Accessibility
`focus-ring` (outline 2px `--color-primary`) trên mọi phần tử tương tác · `aria-label` cho nút chỉ-icon ·
trạng thái không chỉ dựa màu (badge luôn có chữ) · tương phản chữ/nền ≥ 4.5:1 (đã chọn token theo mức này).

## 7. KHÔNG được làm
Đổi gam chủ đạo sang tím/xanh lá · sidebar/top banner sang nền sáng · bỏ Drawer/Stepper/quick-filter/bulk ·
card bo tròn quá `12px` · shadow nặng lên card/bảng · gradient mạnh · icon 3D · trộn nhiều bộ icon ·
table thưa (row > 56px) · nhãn nút ở thể quá khứ · dựng lại layout khác §3.
