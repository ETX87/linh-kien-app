# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong hệ thống này.

## Nguồn gốc tách hệ thống

Hệ này được **tách ra** từ module "Đặt mua linh kiện" của hệ DVBH gốc (repo `cloudflare smarttrade
base` riêng biệt — xem `CLAUDE.md` của repo đó nếu cần đối chiếu, đây KHÔNG phải thư mục con/thư mục
cha của repo này nữa, 2 repo hoàn toàn tách biệt kể từ 2026-08-19) vào 2026-08-19, theo yêu cầu tách
toàn bộ luồng mua/xuất kho/trả hàng linh kiện thành
**một hệ thống Cloudflare Workers + D1 hoàn toàn độc lập**: tự có Worker, D1, Google OAuth app, bảng
`users` riêng. Điểm nối DUY NHẤT với hệ gốc là một API tra cứu — xem "Điểm nối hệ DVBH gốc" bên dưới.
Đợt tách này KHÔNG di chuyển dữ liệu lịch sử (đơn hàng/PXK/trả hàng cũ ở lại hệ gốc, hệ mới bắt đầu
rỗng) — chỉ một số bảng tham chiếu/master data (`ktv_lien_he`, `linh_kien`, `settings_ly_do_cham`,
`settings_loai_de_xuat*`) được copy 1 lần lúc triển khai (xem `DEPLOY.md`).

Kế hoạch đầy đủ của lần tách này (bối cảnh, các quyết định, đánh đổi) không được lưu lại trong repo —
nếu cần tra lại lý do một quyết định thiết kế cụ thể, xem chú thích tại chỗ trong code (mỗi file port
đều có comment đầu file giải thích đã cắt/giữ gì) và `nhat_ky_lam_viec.md`.

## Commands

```bash
npm run dev:worker      # wrangler dev (backend), port 8788 (KHAC he goc 8787 de chay song song)
npm run dev:frontend    # vite dev server (frontend), port 5174 (KHAC he goc 5173)
npm run build           # tsc -b + vite build (frontend only)
npm run db:migrate:local   # ap dung migrations/ vao .wrangler/state (local, an toan)
npm run db:migrate:remote  # ap dung migrations/ vao D1 THAT tren Cloudflare
npm run deploy              # build + wrangler deploy (Worker THAT)
```

Typecheck (không có test suite):
```bash
npm run typecheck --workspace backend
npm run typecheck --workspace frontend
```

Khác hệ gốc: hệ này chỉ có **một** wrangler config (`wrangler.jsonc`) — không có phân biệt
default-vs-`smarttrade`, vì đây là hệ độc lập mới, chưa từng deploy production trước đó. `npm run
deploy`/`db:migrate:remote` LÀ đích thật duy nhất, không giống quy ước "luôn tránh script không hậu
tố" của hệ gốc.

**Trước khi deploy thật**: hoàn thành `DEPLOY.md` (tạo Worker/D1/OAuth Client thật, điền
`database_id`/domain vào `wrangler.jsonc`, đặt secrets) — `wrangler.jsonc` hiện có nhiều giá trị
PLACEHOLDER (`REPLACE_...`) chưa thể deploy được nếu chưa thay.

**Bump `APP_VERSION`** (`frontend/src/version.ts`) trước mỗi lần deploy, cùng quy ước như hệ gốc
(tăng `+0.001`, sửa tay chuỗi, không tính bằng số thập phân).

## Kiến trúc

Cùng stack với hệ gốc: Cloudflare Workers (Hono) phục vụ cả API lẫn frontend build tĩnh từ 1 Worker,
D1 (SQLite) là database duy nhất. **Không dùng R2** (hệ gốc dùng R2 chỉ cho snapshot "case đã đóng",
không liên quan mua hàng). **Không có cron job nào** (`index.ts` không export `scheduled()`) — hệ nhỏ,
mọi báo cáo tính trực tiếp hoặc qua `precomputedCache.ts`/`reportCache.ts` kiểu compute-on-miss, không
cần lưới an toàn dạng cron như hệ gốc.

`assets.run_worker_first: ["/api/*"]` trong `wrangler.jsonc` là **load-bearing** (bài học port nguyên
từ hệ gốc) — thiếu nó thì request điều hướng thật (`Sec-Fetch-Mode: navigate`) bị Workers Static
Assets chặn trước khi tới Worker; `curl` không tái hiện được lỗi này. Đừng xoá.

### Backend (`backend/src/`)

- `index.ts` — mount 9 router: `/api/auth`, `/api/users`, `/api/notifications`, `/api/lk-settings`,
  `/api/settings/ktv-lien-he`, `/api/settings`, `/api/dat-mua-lk`, `/api/phieu-xuat-kho`,
  `/api/tra-hang`. Thứ tự mount có ý nghĩa: `/api/settings/ktv-lien-he` PHẢI mount trước
  `/api/settings` (Hono khớp theo thứ tự đăng ký).
- `routes/datMuaLinhKien.ts` — luồng chính (tạo đơn/duyệt/thiếu linh kiện/báo cáo/phụ trách GS), port
  gần nguyên bản từ hệ gốc. 3 điểm khác hệ gốc: dùng `lib/caseLookupClient.ts` thay vì query
  `case_dvbh` cục bộ (xem "Điểm nối hệ DVBH gốc").
- `routes/phieuXuatKho.ts`, `routes/traHang.ts`, `routes/lkSettings.ts` — port gần như nguyên bản,
  không có `case_dvbh` reference nào.
- **Luồng "Trả hàng" chỉ nằm 1 phần trong `traHang.ts`** (migration 0002_tra_hang_pxk.sql, thêm sau
  đợt tách ban đầu): `traHang.ts` xử lý đúng 5 bước đầu qua `tra_hang_log` riêng (Cho ke toan duyet
  mem → Cho kho xac nhan → Cho QC xac nhan → Cho TN duyet tong → **TN da duyet**, là trạng thái ĐÓNG
  của state machine này — xem `TRANG_THAI_DONG`/`THU_TU_BUOC` đầu file). Từ "TN da duyet" trở đi, đơn
  `loai_don='tra_hang'` chuyển hẳn sang dùng chung route/bảng `phieu_xuat_kho` với mua hàng/công nợ
  (TN qua tab "Phiếu xuất kho" tự tạo PXK) — `phieuXuatKho.ts` có nhiều nhánh rẽ riêng theo
  `loai_don==='tra_hang'` (chọn dòng đủ điều kiện gom PXK, và bước đóng riêng "Kho xác nhận đã nhận
  hàng trả" thay vì "KTV đã nhận" như PXK thường). Sửa 1 trong 2 route này liên quan tới trả hàng
  thường phải đối chiếu route kia.
- `routes/settingsDatMua.ts` — CRUD `linh_kien` (danh mục riêng, KHÔNG chung với module "giải trình"
  như hệ gốc), Google Drive OAuth (uỷ quyền tài khoản thật để upload ảnh minh hoạ linh kiện),
  `settings_ly_do_cham`, `settings_loai_de_xuat`/`_nhom`. Mount tại `/api/settings`.
- `routes/settingsKtv.ts` — CRUD `ktv_lien_he` (danh bạ KTV/CTV/Trạm/Vệ tinh), mount riêng tại
  `/api/settings/ktv-lien-he` để giữ nguyên đường dẫn phía frontend. Có cơ chế
  `provisionPlaceholderUser()` tạo dòng `users` placeholder (`trang_thai_duyet='Cho duyet'`) khi Admin
  gán `email_dang_nhap` cho 1 KTV — cần thiết vì `dat_don_hang.nguoi_nhan_hang`/
  `phieu_xuat_kho.nguoi_nhan_hang` là FK thật tới `users(email)`.
- `routes/notifications.ts` — chỉ còn 1 khối duy nhất: `computeDatMuaLkBreakdown` (badge "việc cần
  làm" cho Đặt mua linh kiện), port verbatim từ hệ gốc.
- `routes/users.ts` — CRUD người dùng rút gọn (không còn `khu_vuc_phu_trach`/`modules`/
  `la_ksnb_doi_tac` như hệ gốc — xem `types.ts`).
- `routes/auth.ts` — OAuth2 + session độc lập hoàn toàn với hệ gốc (Google Client ID/Secret riêng,
  `SESSION_SECRET` riêng, bảng `users` riêng). Giữ nguyên cơ chế tự động kích hoạt tài khoản khi email
  khớp `ktv_lien_he.email_dang_nhap` lúc đăng nhập lần đầu (bỏ qua bước Admin duyệt).
- `lib/caseLookupClient.ts` — **điểm nối hệ gốc DUY NHẤT**, xem mục riêng bên dưới.
- `lib/dataVersions.ts`/`reportCache.ts` — hệ cache theo version-tag, rút gọn còn 2 domain:
  `dat_mua_lk`, `users` (hệ gốc có 11 domain).
- `lib/googleDrive.ts` — **1 cơ chế duy nhất**: `uploadPublicImage()` dùng OAuth uỷ quyền tài khoản
  Google thật lưu trong `google_drive_oauth`, dùng cho MỌI ảnh trong hệ (ảnh minh hoạ linh kiện, ảnh
  trả hàng, ảnh biên bản/bằng chứng chuyển tiền PXK). Khác hệ gốc: hệ gốc port ban đầu có thêm
  `uploadToDrive()` dùng Service Account riêng cho ảnh PXK — đã **bỏ hẳn 2026-08-25** (yêu cầu: hệ chỉ
  có tài khoản Gmail cá nhân, không có Google Workspace nên Service Account bị chặn 403 "no storage
  quota"; và không cần cơ chế xoá ảnh sau 30 ngày vì lưu trên Drive không giới hạn). Không còn biến
  env `GOOGLE_DRIVE_SA_EMAIL`/`GOOGLE_DRIVE_SA_PRIVATE_KEY`/`GOOGLE_DRIVE_FOLDER_ID` — Drive OAuth
  dùng chung `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` sẵn có, folder tự tạo qua Drive API lúc kết
  nối (lưu trong cột `google_drive_oauth.folder_id`, không phụ thuộc env var nào).
- `lib/idCounter.ts` — `nextSequentialId()` sinh ID tuần tự qua `UPDATE ... RETURNING`. **KHÔNG tự
  seed** dòng còn thiếu trong `id_counters` — nếu thêm 1 bảng mới dùng cơ chế này, phải tự thêm dòng
  seed vào migration, nếu không mọi lần gọi sẽ trả về `1` mà không bao giờ lưu lại.

### Frontend (`frontend/src/`)

- `App.tsx` — shell RÚT GỌN so với hệ gốc: không `CaseDetail`/`caseStack`/`openCase` (không có
  `case_dvbh` cục bộ), không `GreetingPopup`, không toast báo cáo hằng ngày, không tìm kiếm case
  toàn cục. Chỉ mount 5 module: Đặt mua linh kiện, Trả hàng (forceView), Danh mục linh kiện, Settings,
  Users.
- `modules/DatMuaLinhKienModule.tsx` + `modules/datMuaLinhKien/*` (16 file) — lúc tách ban đầu là port
  GẦN NHƯ NGUYÊN BẢN từ hệ gốc, nhưng đã có nhiều đợt sửa/viết mới riêng cho hệ này từ đó tới nay
  (KHÔNG còn "0 chỉnh sửa" như lúc mới tách) — đáng chú ý: `ThieuLkTab.tsx` viết lại theo kiểu nhóm-
  theo-KTV giống `DonCuaToiTab.tsx` (trước đó dùng `PaginatedTable` phẳng, khác format phần còn lại
  của module); `TaoDonTab.tsx` tách state/logic dùng chung ra `useTaoDonForm.ts`, trên mobile mặc định
  chuyển sang `TaoDonMobileScreen.tsx` (full-screen, `100dvh`) thay vì `Modal` — người dùng có thể tự
  bấm quay lại giao diện Modal cũ và ngược lại (`useLocalStorageState`). `MaYcscCell` trong
  `SharedUi.tsx` mất khả năng bấm-mở-popup-case (vì không truyền `openCase`) — tự động hiển thị dạng
  text thường, đây là hành vi CHẤP NHẬN ĐƯỢC do tách hệ thống, không phải lỗi.
- `modules/SettingsModule.tsx`, `modules/UsersModule.tsx` — viết MỚI (rút gọn), khớp đúng shape các
  route rút gọn ở backend (`settingsDatMua.ts`/`settingsKtv.ts`/`users.ts`).
- `layout/navConfig.ts` — `ROLE_MODULES` chỉ áp dụng cho Admin/QC/"Giam sat"; `dat-mua-lk`/`tra-hang`
  tự động thêm cho 6 cờ vai trò nghiệp vụ, `danh-muc-lk` tự động thêm cho `xem_danh_muc_lk`/
  `quan_ly_danh_muc_lk` — logic này lặp lại (không sinh tự động) ở CẢ `App.tsx`, phải đồng bộ tay khi
  đổi 1 bên, giống quy ước `navConfig.ts` ↔ `moduleAccess.ts` của hệ gốc.

### Thiết kế UI — "concept 1" đang được triển khai dần vào app thật

Repo có thư mục `ui-concepts/` (5 file `.html` prototype tĩnh, tự chứa, không gọi API thật — xem
`ui-concepts/SPEC.md`) do 5 hướng thiết kế khác nhau được dựng để so sánh, đặc tả nghiệp vụ/quyền lấy
từ đúng 2 file nguồn `Yeu_cau_tong_hop_du_an.md` (tổng hợp toàn bộ yêu cầu dự án qua các giai đoạn,
đã xử lý mâu thuẫn) và `Ma_tran_kiem_soat_he_thong.xlsx` (ma trận quyền vai trò × giao diện/luồng/dữ
liệu) — cả 2 file cũng nằm ở gốc repo, nên tra cứu lại khi cần biết QUYẾT ĐỊNH NGHIỆP VỤ CUỐI CÙNG cho
1 vai trò/luồng cụ thể thay vì suy đoán từ code. **`concept-1-structured-neutral.html` đã được chọn**
và đang được đưa dần vào code React thật (không phải "rewrite 1 lần" — từng phần được chuyển hoá theo
từng đợt phản hồi, xem comment `khop concept-1-structured-neutral.html`/`khop concept 1` rải trong
code). 2 thay đổi lớn nhất đã áp dụng từ hướng này vào `DatMuaLinhKienModule.tsx`:
- Tab **"Trang chủ"** (`TrangChuTab.tsx`) là view mặc định cho MỌI vai trò khi mở module (thay cho
  logic rẽ nhánh `defaultView` theo `canKho`/`canKeToan`/`canQC` cũ) — gộp cả nội dung "Báo cáo" cũ
  vào bên trong nó (tab "Báo cáo" riêng đã bỏ).
- QC (không phải Admin) bị **chặn xem báo cáo pivot toàn hệ thống** (`GET /bao-cao-tong-the` trả 403
  cho QC thuần) — đây là khắc phục trực tiếp 1 phát hiện trong `Ma_tran_kiem_soat_he_thong.xlsx`
  (sheet "5. Vấn đề phát hiện"), màn "báo cáo" thật của QC là tab Trả hàng ở bước "Cho QC xác nhận".

Khi sửa UI trong module này, đối chiếu lại `concept-1-structured-neutral.html` trước khi tự quyết định
layout/nhãn/màu — tránh code lệch hướng đã chọn rồi phải sửa lại lần 2.

### Auth & vai trò

Google OAuth 2.0 độc lập (Client ID/Secret RIÊNG, không dùng chung với hệ gốc), session JWT
`dvbh_session` cookie (cùng cơ chế `lib/jwt.ts`/`middleware/session.ts` port từ hệ gốc).
`BOOTSTRAP_ADMIN_EMAIL` tự động promote thành Admin ở lần đăng nhập đầu.

Chỉ còn 3 giá trị `vai_tro` (`Admin | QC | Giam sat`, có thể NULL) — phần lớn phân quyền thực tế đến
từ 6 cờ boolean nghiệp vụ (`la_ktv_dvbh, la_ve_tinh, la_kho, la_ke_toan, la_tac_nghiep, la_tp_dvbh`) +
2 cờ danh mục (`quan_ly_danh_muc_lk`, `xem_danh_muc_lk`), không còn hệ thống `users.modules` JSON
tuỳ biến theo từng người như hệ gốc — coi là đơn giản hoá có chủ đích cho 1 hệ chỉ phục vụ 1 miền
nghiệp vụ.

## Điểm nối hệ DVBH gốc (quan trọng)

Hệ này gọi **đúng một** endpoint bên hệ gốc: `GET /api/partner/case-lookup?id=<case_id>`
(`backend/src/routes/partnerApi.ts` của hệ gốc), xác thực bằng header `X-API-Key` (cùng cơ chế
`partnerApiAuth.ts` sẵn có của hệ gốc — hash SHA-256 trong `partner_api_keys`). Trả về một tập nhỏ đã
chọn lọc, KHÔNG có dữ liệu tài chính/nhạy cảm: `ky_thuat_vien, khach_hang, seri_san_pham, khu_vuc,
tinh, quan_huyen, hang, san_pham_bao_hanh, tien_do_hoan_thanh`.

`lib/caseLookupClient.ts` (`lookupCase`/`lookupCases`) gọi endpoint này qua
`env.CASE_LOOKUP_BASE_URL` + `env.CASE_LOOKUP_API_KEY`, dùng ở 3 chỗ trong
`routes/datMuaLinhKien.ts`: kiểm tra mã yêu cầu sự cố lúc tạo đơn, hiển thị thông tin case ở màn chi
tiết đơn, và kiểm tra tồn tại case lúc gắn thêm case vào đơn.

**Lưu ý khi sửa endpoint phía hệ gốc**: route `case-lookup` KHÔNG áp dụng rate-limit 30
lần/ngày+60s/lần của các API partner khác (thiết kế cho export định kỳ) — nó chỉ dựa vào throttle
chung 60 req/phút/IP qua Cache API của router `/api/partner`, vì được gọi trực tiếp/tương tác (debounce
lúc gõ, mỗi lần xem chi tiết đơn). Nếu thêm rate-limit nghiêm hơn vào route này ở hệ gốc, module tạo
đơn ở hệ này sẽ bị chặn ngầm — kiểm tra kỹ trước khi đổi.

## Việc CHƯA làm ở lần tách này (xem `DEPLOY.md`)

Repo hiện có đầy đủ mã nguồn NHƯNG CHƯA có tài nguyên Cloudflare/Google thật: chưa tạo Google OAuth
Client, chưa `wrangler d1 create`, chưa deploy Worker thật, chưa có API key thật cho
`CASE_LOOKUP_API_KEY`. `wrangler.jsonc` có nhiều giá trị `REPLACE_...` placeholder. Không tự ý chạy
các lệnh tạo tài nguyên/deploy khi chưa xác nhận với người yêu cầu — làm theo checklist trong
`DEPLOY.md`.
