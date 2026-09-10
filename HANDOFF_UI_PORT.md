# HANDOFF — Port giao diện mới vào hệ thật `frontend/`

> Tài liệu bàn giao cho người/AI tiếp theo. Đọc hết file này + `ui-prototype/UI_SPEC.md` + `CLAUDE.md`
> trước khi viết code. Cập nhật file này khi hoàn thành từng phase.

Ngày lập: 2026-09-10. Trạng thái: **P0 + P1 xong** (commit trên `master`), **P2–P5 chưa làm**.

---

## 0. Bối cảnh 30 giây

- Hệ `linh-kien-app` = Cloudflare Workers (Hono) + D1, tách độc lập từ module "Đặt mua linh kiện" của
  hệ DVBH gốc (xem `CLAUDE.md`). Backend đang chạy ổn định ở `v1.086`.
- Mục tiêu đợt này: **thay toàn bộ giao diện** sang hướng thị giác mới "**Đặt hàng linh kiện 3T**" —
  chrome (sidebar + top banner) **navy tối**, nút xanh `#1467E8`, KPI có màu theo vai trò, Drawer có
  tab, WorkflowStepper vòng tròn, bottom-nav 5 nút, bỏ tính năng đổi Theme.
- **Nguồn thiết kế chuẩn (SỰ THẬT DUY NHẤT về visual):**
  - `ui-prototype/` — app React **độc lập, mock data**, đã dựng **đủ 17 màn** theo hướng mới. Chạy:
    `npm --prefix ui-prototype install && npm --prefix ui-prototype run dev` (port 5175).
  - `ui-prototype/UI_SPEC.md` — **hợp đồng UI**: mọi design token, kích thước, màu, component,
    responsive. Không tự ý đổi thiết kế; chỗ nào lệch spec ↔ ảnh demo thì HỎI người dùng.
  - 4 ảnh tham chiếu người dùng gửi (đang untracked ở gốc repo — **nên `git add`**):
    `trang chu.png`, `Dat mua linh kien.png` (= màn Mua hàng), `Tra hang.png`, và 1 ảnh crop sidebar
    navy (mô tả trong lịch sử: sidebar dark navy, mục active tô xanh đặc, tag "Admin").
  - `Prompt Claude Code — Xây dựng UI QLBH 3T giống screenshot 260910.md` — brief gốc (một số phần
    như "mock data / Google Apps Script" KHÔNG áp dụng — hệ này có backend thật).
- Đặc tả nghiệp vụ/quyền: `Yeu_cau_tong_hop_du_an.md`, `Ma_tran_kiem_soat_he_thong.xlsx`,
  `ui-concepts/SPEC.md`.

---

## 1. RÀNG BUỘC CỨNG (đọc kỹ)

1. **KHÔNG chạy được app local để kiểm thử.** `npm run dev:worker` fail vì `wrangler.jsonc` có 3
   service binding `"remote": true` (`CASE_LOOKUP_SERVICE=dvbh`, `SUACHUA_SYNC_SERVICE=suachua`,
   `KHOVAN_SYNC_SERVICE=khovan`) → `wrangler dev` bắt buộc auth Cloudflare, và phiên `wrangler login`
   hiện hết hạn/không đăng nhập được trên máy này. `.dev.vars` + `.wrangler/state` (D1 local) đã có sẵn.
   ⇒ **Verify chỉ bằng:** `npm run typecheck --workspace frontend` (phải sạch) + `npm run build`
   (`tsc -b && vite build`, phải pass) + đọc code + đối chiếu `ui-prototype` (localhost:5175).
   Nếu người tiếp theo `wrangler login` được thì dựng local theo `DEPLOY.md §142` (nút "🔧 Đăng nhập
   DEV" cần `LOCAL_DEV_BYPASS_AUTH=true`).
2. **KHÔNG cần sửa backend.** Đã rà toàn bộ `backend/src/routes/*` — mọi endpoint cho 17 màn đã có
   (danh sách ở §5). Nếu muốn: có thể thêm 1 endpoint gộp `GET /dat-mua-lk/dashboard` để giảm số
   call — KHÔNG bắt buộc.
3. **Commit thẳng `master`** (nhánh hiện tại), **bump `frontend/src/version.ts` `APP_VERSION`** mỗi
   phase (+0.001, sửa tay chuỗi). **Chưa deploy** — người dùng tự deploy trên tài khoản Cloudflare khác.
4. `assets.run_worker_first: ["/api/*"]` trong `wrangler.jsonc` là **load-bearing** — đừng xoá.
5. Kết thúc commit message: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## 2. ĐÃ LÀM

### Prototype (`ui-prototype/`) — commit `992dcdc`
17 màn đủ, mock data, `UI_SPEC.md`. Đây là bản mẫu để "bê" sang `frontend/`.

### P0 — Shell + Tokens + bỏ Theme — commit `992dcdc` (`v1.088`)
| File | Thay đổi |
|---|---|
| `frontend/src/styles/tokens.css` | **Viết lại**: palette mới (`--color-primary #1467e8`, `--color-*`, `--role-*`, `--chip-*`, `--sidebar-* / --topbar-*` navy, kích thước) + **KHỐI ALIAS** `--ocean-*/--ink-*/--line/--bg/--surface/--teal-*/--amber-*/--coral-*/--orange-*/--violet-*/--green-*/--indigo-*` trỏ về palette mới ⇒ module CŨ chưa port vẫn hiển thị hợp lý. Giữ mọi `@keyframes`/util class module cũ dùng (`.anim-in`, `.drawer-in`, `.bell-shake`, `.pipeline-urgent-ring`, `.dat-mua-lk-module input…`, `.ripple-bg`, `.sidebar-scroll`, …). |
| `frontend/tailwind.config.js` | Thêm `colors` (`primary/surface/ink/line/success/…` → `var(--color-*)`), `borderRadius.card/btn`, `boxShadow.drawer/pop`. |
| `frontend/index.html` | Xoá `<script>` inline theme + `theme-color` → `#0b2149`; `<title>` → "Đặt hàng linh kiện 3T". |
| `frontend/src/theme/**` | **XOÁ hết** (6 file: presets/colorRamp/fonts/useThemeSettings/ThemeMenuButton/ThemeSettingsModal). |
| `frontend/src/layout/Sidebar.tsx` | **Viết lại navy** — logo "Đặt hàng linh kiện / 3T", nhãn menu đầy đủ, mục active = ô bo tròn tô đặc `--sidebar-active-bg`, tag "Admin", icon SVG. **GIỮ NGUYÊN prop contract** (`active,setActive,allowedModules,collapsed,setCollapsed,mobileOpen,onMobileClose,role,user,realIsAdmin,viewAsRole`) + off-canvas mobile + `TopBarActions`/`InstallAppButton` trên mobile. Bỏ `ThemeMenuButton`. |
| `frontend/src/layout/TopBar.tsx` | **Viết lại navy** — thêm nút ☰ (thu gọn sidebar), breadcrumb `[📅] [gốc] › [title]`, ô tìm kiếm mờ (mở CommandPalette), `notificationBell` + `TopBarActions`. Thêm prop `active` + `onToggleSidebar` (App.tsx đã truyền). |
| `frontend/src/layout/TopBarActions.tsx` | Bỏ `ThemeSettingsModal` + nút "🎨 Giao diện"; đổi màu trigger sang dark (nền navy). Giữ "Xem thử vai trò" (`POST /auth/view-as`) + Đăng xuất. |
| `frontend/src/layout/BottomTabBar.tsx` | Restyle + icon SVG; 4 mục + "Thêm" (mở Sidebar off-canvas). Prop contract giữ nguyên. |
| `frontend/src/layout/navConfig.ts` | Nhãn đầy đủ tiếng Việt; `icon` giờ là khoá `Icon` (SVG) hoặc emoji (link ngoài); thêm `BREADCRUMB_ROOT`. **GIỮ NGUYÊN** `NAV_GROUPS` cấu trúc/khoá/`href`/`countKey`, `ROLE_MODULES`, `MODULE_TITLES` (đã đổi label) ⇒ logic `allowedModules` trong `App.tsx` KHÔNG đụng. |
| `frontend/src/components/ui/Icon.tsx` | **MỚI** — bộ icon outline SVG (copy từ prototype), `Icon.home/cart/return/catalog/…`. |
| `frontend/src/App.tsx` | Bỏ `useThemeSettings()`; truyền `active`/`onToggleSidebar` cho `<TopBar>`; `<main>` padding `p-4 sm:p-6`. **Toàn bộ plumbing khác GIỮ NGUYÊN** (xem §4). |

Kết quả P0: chrome navy + palette xanh, tính năng Theme biến mất, **mọi module cũ vẫn chạy y hệt**
(nội dung bên trong vẫn layout cũ, chỉ đổi màu).

### P1 — Component library mới — commit `7df04b5`
`frontend/src/components/x/` (**thư mục RIÊNG**, để không đụng `components/ui/*` cũ mà ~30 file module
đang import). Nội dung (copy + chỉnh từ `ui-prototype/src/components/ui/`):
`Btn, Badge (Badge/StatusBadge/RoleChip + statusTone), Card (Card/KvRow/SectionTitle/KvGrid),
StatCard (nền gradient theo tone), FilterChips, SearchBar, Tabs, DataTable (min-width → cuộn ngang),
BulkActionBar, Drawer (+ BottomSheet mobile), Modal (+ full-screen mobile), Timeline, WorkflowStepper
(vòng tròn + nhánh "Từ chối"), Misc (CaseList/Pagination/EmptyState), Form (FormField/TextInput/
TextArea/Select/Checkbox), ConfirmDialog, ImportExcelDialog (viết lại PROPS-DRIVEN), NotificationPanel
(viết lại PROPS-DRIVEN), Toast.tsx (adapter cho `useToast` thật — nuốt tham số `kind`),
Icon.tsx (re-export `../ui/Icon`), types.ts (type prototype: Order/ReturnOrder/Pxk/… — nguồn TẠM,
đối chiếu shape API thật khi port).`
`frontend/src/lib/format.ts` — `fmtVND/fmtDateTime/fmtDateLong`.
**Chưa file nào import `components/x/`** — nằm chờ P2.

---

## 3. CÒN LẠI — P2 → P5

> **CHỌN CHIẾN LƯỢC TRƯỚC** (người dùng chưa chốt lại sau khi biết ràng buộc "không chạy thử được"):
>
> - **(A) Re-skin module cũ tại chỗ** — giữ nguyên logic + data layer + mọi edge-case đã kiểm chứng
>   của module cũ; chỉ đổi `components/ui` → `x/`, sắp xếp lại layout (KPI theo vai trò, Drawer tab,
>   stepper, màu). **An toàn hơn nhiều** khi không verify được runtime. Ra đúng giao diện prototype.
> - **(B) Thay bằng code prototype** (kế hoạch ban đầu người dùng chọn) — viết lại 7 module theo page
>   prototype + rewire toàn bộ data sang API thật; xoá module cũ. Nhanh có giao diện đồng bộ nhưng
>   **rủi ro regression cao** (mất edge-case, không test được).
>
> Gợi ý: hỏi người dùng chốt A hay B. Phần dưới mô tả theo hướng (B); nếu chọn (A) thì bỏ qua phần
> "viết service/hook + page mới", thay bằng "sửa file module cũ".

### Cấu trúc dữ liệu (nếu hướng B)
- `frontend/src/services/<domain>.ts` — hàm mỏng gọi `api.get/post/patch` (từ `api/client.ts`).
- `frontend/src/hooks/data/<domain>.ts` — `useQuery`/`useMutation` + `queryClient.invalidateQueries`.
- Shape response API: đọc `frontend/src/modules/datMuaLinhKien/types.ts` (`DonHangRow`, `TraHangRow`,
  `PhieuXuatKhoRow`, `ThieuLkRow`, `LkDanhMucRow`, `LuongQuyTrinhStep`, `DangTonStep`, `BaoCaoRow`,
  `JumpTarget`, …) — **đây là contract chính xác, có comment giải thích từng field**. Chuyển file này
  ra khỏi `modules/datMuaLinhKien/` (vd `frontend/src/types/datmua.ts`) khi xoá module cũ.
- `constants.ts` / `helpers.ts` trong `modules/datMuaLinhKien/` chứa `BadgeTone` map trạng thái,
  `LOAI_DON_TONE`, `deriveLoaiDon`, `isLineComplete`, cache linh kiện… — tái dùng có chọn lọc.
- Persona: `hooks/usePersona.ts` mới map `useAuth()` (`AppUser`) → `Persona` của prototype:
  `coreRole←vai_tro`, `ktvDVBH←la_ktv_dvbh`, `veTinh←la_ve_tinh`, `kho←la_kho`, `keToan←la_ke_toan`,
  `tn←la_tac_nghiep`, `tpDVBH←la_tp_dvbh`, `view←la_view`, `manageParts←quan_ly_danh_muc_lk`,
  `viewParts←xem_danh_muc_lk`, `tramCha←tram_cha`, `giamSat←giam_sat_quan_ly`, `+la_tram`.
  **Bỏ persona switcher của prototype** (thiết bị demo) — dùng user thật + "Xem thử vai trò" sẵn có.
  `ui-prototype/src/lib/{permissions,scope,workflow}.ts`: `permissions.ts` giữ (đối chiếu
  `navConfig.ROLE_MODULES` + `App.tsx allowedModules` + `backend/src/middleware/requireDatMuaLkArea.ts`
  cho khỏi lệch quyền). `scope.ts` (lọc GS/Trạm client) — **hầu như bỏ**: backend list endpoint đã
  lọc sẵn; client chỉ ẩn nút khi `la_view`. `workflow.buildWorkflowSteps` — **bỏ gọi scopeOrders**,
  thay bằng consume thẳng `GET /dat-mua-lk/luong-quy-trinh` + `/home-summary` (đã có `roleKeys`,
  `tab`, `filter`, `loaiDon` từng step; chỉ cần group client theo `roleKeys` cho KPI-nhóm-vai-trò).

### P2 — Module "Đặt mua linh kiện" (LỚN NHẤT)
Tương ứng: `ui-prototype/src/pages/{DashboardPage, PurchasePage, PxkPage, ThieuLkPage, BaoCaoPage}.tsx`
+ `pages/shared/{OrdersView, OrderDrawer, CreateOrderModal}.tsx`.
Module thật hiện gộp `active ∈ {trang-chu, dat-mua-lk, thieu-lk, tra-hang}` vào **1 lần render**
`<DatMuaLinhKienModule forceView={...}>` (xem `App.tsx` §334-363, comment giải thích tại sao gộp — để
không mất state nội bộ `jumpTarget/navigatedAway`). Module mới phải giữ tính chất này: nhận `forceView`
+ `externalDetailOpen` + `onLeaveForceView` + `headerExtra`.

**Nghiệp vụ BẮT BUỘC giữ** (đọc `modules/datMuaLinhKien/{DonCuaToiTab,PhieuXuatKhoTab,ThieuLkTab,
BaoCaoTab,TrangChuTab,TaoDonTab,useTaoDonForm}.tsx`):
- Giải trình lý do chậm quá hạn 24h: field `qua_han_ly_do_cham`, `giaiTrinh[]` trên `/don-hang/:id`;
  danh sách cũng có cờ `qua_han_ly_do_cham` (mốc = `last_giai_trinh_at ?? cho_tn_duyet_at`).
- "Duyệt quá hạn" → phải chọn 1 lý do trước khi duyệt (`ActionTarget.action = "duyet_qua_han"`).
- "Từ chối" (bước Chờ TN) → **bắt buộc chọn lý do chậm**; nếu lý do có cờ "quản lý đơn thiếu LK"
  (`quan_ly_don_thieu_linh_kien`) → backend tự tạo ticket thiếu LK thay vì từ chối hẳn.
- "Tạo hộ": TN/GS tạo đơn hộ người khác; GS chỉ hộ KTV/VT mình phụ trách; cảnh báo riêng khi duyệt
  đơn công nợ tạo hộ (`ActionTarget.action = "duyet_tao_ho"`, `isCongNoTaoHo`).
- Sửa đơn: người tạo chỉ sửa khi đơn còn ≤ 3 bước chờ đầu; TN sửa mở rộng (`gia_chot`,
  `so_luong_thuc_xuat`, `ly_do_cham`) bất kỳ lúc nào — `PATCH /don-hang/:id`.
- Huỷ đơn: người tạo (đơn của mình) hoặc Trạm (đơn mình/VT cấp dưới); huỷ CẦN nhập lý do tự do.
- Gắn/gỡ case: `POST/DELETE /don-hang/:id/case[/:caseId]`; người tạo chỉ được khi đơn chưa vào PXK
  và chưa đóng; TN luôn được. Kiểm tra case lúc tạo: `GET /dat-mua-lk/kiem-tra-ma-yeu-cau`,
  `GET /dat-mua-lk/case-detail/:id`.
- Tạo đơn: `POST /dat-mua-lk/phieu-dat`; picker linh kiện dùng cache (`lib/linhKienCache.ts`); gợi ý
  LK thay thế; "Công nợ tạm tính" `GET /dat-mua-lk/cong-no-du-kien`; badge "Đặc thù" → cần TBP duyệt;
  đơn trả hàng bắt buộc 1-3 ảnh (`POST /tra-hang/upload-anh`).
- Import: `GET /don-hang/import/template`, `POST /don-hang/import/preview` + `/commit` (trả
  `DatDonHangImportSummary`).
- Phân trang **server-side** (`page`, `pageSize` — mặc định 20, max 200); response `{rows,page,pageSize,total}`.
- Filter list: `trang_thai` (hoặc `__OPEN__`), `nguoi_tao`, `nguoi_nhan_hang`, `tu_ngay`, `den_ngay`,
  `loai_don`, `khu_vuc` (csv), `q`. Đếm badge: `GET /don-hang-status-counts?loai_don=`,
  `GET /loai-don-counts`.
- **PXK** (`PhieuXuatKhoTab`, `routes/phieuXuatKho.ts`): state `Dang tao phieu → Cho ke toan →
  Dang gui KTV → Kho da ket thuc`; nhánh tiền `Cho KTV chuyen tien → KTV da chuyen → TN da duyet tien`.
  Gán mã xuất kho: chỉ TN (`PATCH /:id/ma-xuat-kho`). Gán MISA: chỉ Kế toán (`PATCH /:id/ma-misa`).
  **Upload ảnh biên bản**: chỉ đúng người nhận hàng — **Admin KHÔNG được miễn** (chủ đích);
  `POST /:id/anh-bien-ban` (dùng `api.postBinary`). Xác nhận chuyển tiền + bằng chứng: đúng người nhận
  (Admin ĐƯỢC miễn ở bước này). Xuất MISA: `GET /phieu-xuat-kho/misa-export` + `/:id/misa-export`,
  template ở `lib/misaExportTemplates.ts`. Nhánh `loai_don === 'tra_hang'` trong PXK: chọn dòng đủ
  điều kiện gom khác, bước đóng = "Kho xác nhận đã nhận hàng trả". `co_don_uu_tien` → tô màu lan cả PXK.
- **Thiếu LK** (`ThieuLkTab`): nhóm theo KTV (`nguoi_nhan_hang || ddh_nguoi_tao`, KHÔNG phải
  `nguoi_tao` = người báo thiếu). State `Cho kho tiep nhan → Kho da tiep nhan → Cho kho xac nhan →
  Da ve kho / Tu choi sai thong tin → Da ket thuc` (+ `Da huy bo`). Nút: Kho (tiếp nhận/xác nhận/
  từ chối/huỷ ticket-tự-tạo) + TN (đóng ticket). GS thấy ticket theo GS phụ trách của **đơn gốc**
  (`emailGsDonGoc`), không phải người tạo ticket.
- **Báo cáo**: `GET /dat-mua-lk/bao-cao-tong-the` → pivot `BaoCaoRow[]` (nhiều KTV × ~20 cột số).
  **QC bị chặn 403** endpoint này → hiện danh sách "việc QC cần xác nhận" (đơn trả hàng bước
  `Cho QC xac nhan`) thay vì pivot. Vai trò thực thi (KTV/Trạm/VT/TBP) → thẻ cá nhân. Filter khoảng
  ngày + khu vực (chip) + loại đơn. `GET /dat-mua-lk/tom-tat`, `/xep-hang-linh-kien`.
- **3 CỔNG VÀO DRAWER CHI TIẾT** (phải hoạt động sau P2 — xem `App.tsx`):
  1. Chuông thông báo (`NotificationBell` → `openDonHangFromBell` / `openPxkFromBell`).
  2. Deep-link URL `/<id>/` (`lib/pxkDeepLink.ts` + `consumePendingPxkDeepLinkId()` trong `App.tsx`;
     tiền tố `PMH/PCN/PTL/PXK` = mở thẳng, `TRA-` = resolve qua `GET /tra-hang/resolve-ma-thung/:ma`,
     `TLK-` = mở thiếu LK).
  3. CommandPalette (`GET /dat-mua-lk/search` → `openSearchResult`).
  Cả 3 đổ về `pendingDetailOpen = {tab: "don-cua-toi"|"phieu-xuat-kho"|"tra-hang"|"thieu-lk", id, nonce}`
  → module nhận qua prop `externalDetailOpen` → mở đúng Drawer.

Cuối P2: xoá `modules/DatMuaLinhKienModule.tsx` + `modules/datMuaLinhKien/*` (giữ `NotificationBell`
logic hoặc thay bằng `x/NotificationPanel` wired vào `/notifications/{count,ktv-log}` +
`POST /notifications/ktv-log/{mark-all-read,:id/read}` + 3 toggle `nhan_tb_*` qua
`PATCH /auth/me/thong-bao-prefs`). Bump version. `tsc` + `build` sạch. Commit.

### P3 — Trả hàng
`ui-prototype/src/pages/ReturnPage.tsx` + `pages/shared/ReturnDrawer.tsx` + `WorkflowStepper`.
Endpoint: `GET /tra-hang/` (list), `/tra-hang/:donHangId` (detail), `POST /:donHangId/log` (duyệt
từng bước), `/bulk-log`, `/:donHangId/log-lui` ("Lùi bước" — Kế toán/Kho), `/upload-anh` +
`/:donHangId/anh`.
Nghiệp vụ (`modules/datMuaLinhKien/TraHangTab.tsx` + `routes/traHang.ts`):
state `Cho ke toan duyet mem → Cho kho xac nhan → Cho QC xac nhan → Cho TN duyet tong → TN da duyet`
(**= trạng thái ĐÓNG** của state machine này). Từ chối bắt buộc ghi lý do. Huỷ: người tạo / TN.
**Sau "TN da duyet"** đơn `loai_don='tra_hang'` chuyển sang dùng chung route/bảng `phieu_xuat_kho`
(PXK loại `tra_hang`) — bước 6 stepper "Lên PXK (trả hàng)" trỏ sang tab PXK. Trạm/KTV/VT/TBP =
**read-only, xem TOÀN BỘ** (không giới hạn scope — chủ đích). Bump version. Commit.

### P4 — Danh mục LK / Tồn kho KTV / SLA / Cài đặt / Người dùng
`ui-prototype/src/pages/{DanhMucPage, TonKhoPage, SlaPage, SettingsPage, UsersPage}.tsx`.
- **Danh mục LK**: `GET /settings/linh-kien` (+ `/version` cache), POST/PATCH, `POST /linh-kien/:ma/anh`
  (`postBinary`, `lib/imageCompress`), `PATCH /linh-kien/:ma/gia-tri-cong-no`,
  `POST /linh-kien/{bulk-import,bulk-import-anh}`, `GET/POST /lk-settings/{danh-muc,nhom-thay-the,
  thay-the/:ma_lk,bom/lookup}` + `POST /lk-settings/bom/import`. Gate nút Thêm/Sửa/Nhập/Xuất-ảnh theo
  `quan_ly_danh_muc_lk || Admin`. Sub-tab BOM + Linh kiện thay thế: dựng thật (đọc
  `modules/danhMucLinhKien/{BomHangTab,ThayTheTab,SheetSyncBar}.tsx`).
- **Tồn kho KTV**: `GET /ktv-ton-kho/` (scope theo vai trò do backend lo), `/import-meta`,
  `/:ma_ktv/chi-tiet`, `/ma-kho-chua-khop`, `POST /import` (chỉ Admin, `lib/tonKhoImport`). Badge đánh
  giá công nợ 3 mức (Vượt trần / Cảnh báo / Bình thường).
- **SLA**: `GET /bao-cao-toc-do/{giai-doan,xep-hang}`. **Chỉ Admin + `la_view`** (không thì màn chặn).
- **Cài đặt** (chỉ Admin): `GET/POST/PATCH /settings/{khu-vuc, khu-vuc/:ma/gs, ly-do-cham,
  loai-de-xuat, loai-de-xuat/nhom}` + `google-drive/{status,authorize}` + `app-settings` +
  `partner-api-keys`.
- **Người dùng** (chỉ Admin): `GET /users/`, `/users/login-log`, `PATCH /users/:email`,
  `POST /users/:email/chuyen-nhom-vai-tro`, `GET/PUT /users/:email/khu-vuc`, `GET /settings/ktv-lien-he`
  + `POST /settings/ktv-lien-he/{bulk-import}` + `PATCH /:ma/{dat-mua-lk,cong-no-misa}` +
  `DELETE /:ma` + `POST /backfill-users`. 5 tab: Chờ duyệt · KTV hiện trường · Nhân viên văn phòng ·
  Giám sát phụ trách · Lịch sử đăng nhập. Cảnh báo khi Admin tự sửa dòng chính mình. Gộp "Danh sách
  KTV" (module riêng cho vai trò văn phòng — `DanhSachKtvModule.tsx`) thành 1 tab / giữ nav item tuỳ
  `visibleModules`.
Cuối P4: xoá `modules/{DanhMucLinhKienModule,TonKhoKtvModule,BaoCaoTocDoXuLyModule,SettingsModule,
UsersModule,DanhSachKtvModule}.tsx` + `modules/danhMucLinhKien/*`. Bump version. Commit.

### P5 — Dọn dẹp
- Xoá `components/ui/*` không còn ai import; `mv components/x/* components/ui/` + sửa import; xoá khối
  ALIAS trong `tokens.css` khi không còn `var(--ocean-*)`… nào.
- `tsc` cả 2 workspace sạch; `npm run build` (frontend) pass.
- Cập nhật `CLAUDE.md` phần "Frontend (`frontend/src/`)"; `nhat_ky_lam_viec.md`.
- `ui-prototype/` + `UI_SPEC.md`: giữ.

---

## 4. `App.tsx` — plumbing PHẢI GIỮ (đừng xoá khi refactor shell)

- `allowedModules` (role + 9 cờ → khoá module) — **nguồn phân quyền client**, đồng bộ tay với
  `backend/src/middleware/requireDatMuaLkArea.ts` + `requireQuanLyDanhMucLk.ts`.
- `active` state + `localStorage("dat_mua_lk_active_module")` + reset khi đổi role.
- `pendingDetailOpen` + `openDonHangFromBell/openPxkFromBell/openTraHangFromBell/openSearchResult` +
  `handleCommandSelect` — 3 cổng deep-link (§P2).
- `consumePendingPxkDeepLinkId()` useEffect (permalink `/<id>/`).
- `CommandPalette` (Ctrl/Cmd+K) — items = `allowedModules` (không tạo nguồn quyền thứ 2).
- `useExitConfirm(isMobile)` + `pushOverlayClose` (nút Back mobile: đóng overlay → về rootModule → hỏi
  thoát). `overlayStack.ts` dùng chung Drawer/Modal.
- `headerExtraEl` ref — module portal "pipeline flow + nút Việc của tôi/+ Tạo đơn" lên cạnh tiêu đề.
- Mobile-preview iframe (Admin) — `mobilePreviewOpen`.
- Banner "🔍 Admin đang xem thử vai trò …" khi `viewAsRole != null` (nền `--amber-500`).
- `roleDisplayLabel(user)` — hiện đúng cờ vai trò khi `vai_tro = null`.
- `main.tsx`: `QueryClient` (staleTime 2', retry 1, no refetchOnFocus) + `AuthProvider` +
  `ToastProvider` + `capturePxkDeepLinkFromUrl()` — không đụng.

---

## 5. Danh mục endpoint (đã rà — dùng cho service layer)

**dat-mua-lk** (`routes/datMuaLinhKien.ts`): `GET ve-tinh-cua-toi, nguoi-nhan-hang-kha-dung,
cong-no-du-kien, khu-vuc-cua-toi, ton-dong-theo-ktv, phu-trach-gs` `PUT phu-trach-gs`
`GET luong-quy-trinh, home-summary, bao-cao-tong-the, tom-tat, xep-hang-linh-kien, kiem-tra-ma-yeu-cau`
`GET case-detail/:id` `POST case-detail/:id/sync` `GET don-hang, don-hang-status-counts,
loai-don-counts` `POST phieu-dat` `GET don-hang/import/template` `POST don-hang/import/{preview,commit}`
`GET search` `GET don-hang/:id` `POST don-hang/:id/log, don-hang/bulk-log` `PATCH don-hang/:id`
`POST don-hang/:id/giai-trinh, don-hang/:id/case` `DELETE don-hang/:id/case/:caseId` `GET ly-do-cham,
thieu-lk, thieu-lk-status-counts, thieu-lk/:id` `POST thieu-lk/:id/log, thieu-lk/bulk-log`
**phieu-xuat-kho** (`routes/phieuXuatKho.ts`): `GET mo-count, /, misa-export, status-counts,
don-hang-kha-dung, don-hang-kha-dung-counts` `POST /` `GET :id, :id/misa-export`
`PATCH :id/ma-xuat-kho, :id/ma-misa` `POST :id/{anh-bien-ban, bang-chung-chuyen-tien, chuyen-tien,
dong-goi, log}` `PATCH :id/chuyen-tien`
**tra-hang** (`routes/traHang.ts`): `GET /, :donHangId, resolve-ma-thung/:maThung` `POST upload-anh,
:donHangId/anh, :donHangId/log, bulk-log, :donHangId/log-lui`
**ktv-ton-kho**: `GET /, import-meta, ma-kho-chua-khop, :ma_ktv/chi-tiet` `POST import`
**bao-cao-toc-do**: `GET giai-doan, xep-hang`
**lk-settings**: `GET danh-muc` `POST danh-muc` `PATCH danh-muc/:ma` `GET nhom-thay-the` `POST
nhom-thay-the` `PATCH nhom-thay-the/:id` `GET thay-the/:ma_lk` `GET bom/lookup` `POST bom/import`
**settings** (`routes/settingsDatMua.ts`): `GET linh-kien, linh-kien/version` `POST linh-kien`
`PATCH linh-kien/:ma, linh-kien/:ma/gia-tri-cong-no` `POST linh-kien/:ma/anh, linh-kien/bulk-import-anh,
linh-kien/bulk-import` `GET google-drive/{status,authorize,callback}` `GET/POST/PATCH ly-do-cham[/:id]`
`GET/POST/PATCH loai-de-xuat[/:id] + /nhom[/:id]` `DELETE loai-de-xuat/:id` `GET/POST/PATCH
khu-vuc[/:ma] + khu-vuc/:ma/gs` `GET/PATCH app-settings` `GET/POST/PATCH partner-api-keys[/:id]`
**settings/ktv-lien-he** (`routes/settingsKtv.ts`): `GET /, version` `POST /, bulk-import`
`PATCH :ma/dat-mua-lk, :ma/cong-no-misa` `POST backfill-users` `DELETE :ma`
**users**: `GET /, login-log` `PATCH :email` `POST :email/chuyen-nhom-vai-tro` `GET/PUT :email/khu-vuc`
**notifications**: `GET count, ktv-log` `POST ktv-log/mark-all-read, ktv-log/:id/read`
**auth**: `GET me` `PATCH me/thong-bao-prefs` `POST view-as` `GET nguoi-directory` `POST logout`

---

## 6. Verify & deploy

```bash
npm run typecheck --workspace frontend   # phải sạch
npm run build --workspace frontend       # tsc -b && vite build — phải pass
# đối chiếu thị giác:
npm --prefix ui-prototype run dev         # localhost:5175
```
Deploy (người dùng, tài khoản Cloudflare có quyền):
```bash
npx wrangler login
npm run deploy    # = build + wrangler deploy. Bump APP_VERSION trước.
```

## 7. Gotchas nhanh
- `components/x/` là tạm — sẽ thành `components/ui/` ở P5.
- Khối ALIAS trong `tokens.css` là tạm — gỡ khi hết `var(--ocean-*)`…
- Banner "xem thử vai trò" vẫn dùng `--amber-500` (vàng) — cân nhắc đổi tông.
- `NotificationBell.tsx` (cũ) còn nghiệp vụ thật (deep-link + 3 toggle `nhan_tb_*`) — đừng xoá trước
  khi `x/NotificationPanel` wired đủ.
- `run_worker_first` load-bearing. `wrangler.jsonc` còn placeholder deploy (`DEPLOY.md`).
- Không có test suite. Kiểm tra bằng typecheck + đọc code + prototype.
