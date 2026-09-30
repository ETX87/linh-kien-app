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
không liên quan mua hàng). Có **1 cron mỗi giờ** (`index.ts` `scheduled()`, `triggers.crons` trong `wrangler.jsonc`): đồng bộ danh bạ
KTV/danh mục LK sang hệ DVBH gốc mỗi giờ, kéo giá gia88 lúc 0h VN, kéo ETX nhân sự 0h thứ Hai. Báo cáo vẫn tính
trực tiếp hoặc qua `precomputedCache.ts`/`reportCache.ts` kiểu compute-on-miss.

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
- **Loại chiết khấu** (migration `0033_loai_chiet_khau.sql`, 2026-09-26): `dat_don_hang.loai_chiet_khau_id`
  (+ `loai_chiet_khau_thu_cong` = TN đã chọn tay) → `settings_loai_chiet_khau` (loại có `ma` = hệ thống tự
  gán, `ma` NULL = tự thêm). Gán tự động bằng `tinhToanPxk()` trong `lib/pxkRecalculate.ts` — **CÙNG hàm**
  tính tiền ước tính từng dòng + "Tiền cần chuyển" của PXK (backend là nguồn duy nhất, client không gửi/sửa
  tổng tiền nữa), nên sửa thuật toán giá là đổi cả nhãn, không có 2 bản logic. `taiTinhPxk()` được gọi lại
  mỗi khi tạo/thêm/bớt dòng PXK hoặc sửa mã LK/loại đề xuất/SL/SL thực xuất/giá chốt/tiền công nợ; tổng
  đổi → reset trạng thái chuyển tiền về "Cho KTV chuyen" + ghi log (chỉ khi PXK còn "Dang tao phieu").
  Chốt 2026-09-28: giá chốt LUÔN thắng giá theo chiết khấu; PXK `cong_no` mặc định tổng = 0, RIÊNG dòng
  loại đề xuất "TRỪ CÔNG NỢ…" (`laTruCongNo()`, có bản sao ở `frontend/.../helpers.ts`) tính giá như đơn
  mua và đi đủ quy trình chuyển tiền như PXK mua. Bậc thang (Đình tủ 85%; tổng giá bán cả phiếu <200k giá
  bán / 200-500k ×70% / ≥500k giá KTV, LK chưa có giá KTV giữ giá bán) áp cho MỌI dòng mua + "TRỪ CÔNG NỢ"
  (chốt 2026-09-28, trước chỉ "MUA DỰ TRỮ"). **Mốc 200k/500k KHÔNG theo tổng phiếu** mà theo TỔNG NGÀY: giá bán × SL
  thực xuất của mọi đơn nhóm Mua + TRỪ CÔNG NỢ mà KTV nhận, tạo CÙNG NGÀY (ngày tạo đơn, giờ VN) với dòng đó, trừ
  đơn từ chối/hủy (`tongDonTheoNgay()`); vì vậy tạo đơn mới / từ chối / hủy / sửa SL-mã LK / gỡ dòng / hủy PXK gọi
  `taiTinhPxkMoCuaKtv()` để tính lại MỌI PXK "Dang tao phieu" của KTV **trừ PXK Kế toán đã duyệt chuyển tiền**
  (`trang_thai_chuyen_tien='TN da duyet'` — khoá, chỉ bỏ qua lần tính lại TỰ ĐỘNG; TN sửa tay vẫn tính như cũ)
  + gán lại nhãn cho đơn CHƯA vào PXK (`ganLoaiChietKhauDonChuaPxk()` — nhãn có ngay từ lúc tạo đơn, lên/xuống
  theo tổng thực tế; Đình tủ luôn ×85%). Hiển thị tổng ngày + "Ước tính chuyển": `GET /api/dat-mua-lk/tong-ngay-ktv`
  (Vệ tinh tự quy về Trạm) → `datMuaLinhKien/TongNgayKtv.tsx` (Trang chủ KTV, chi tiết đơn, chi tiết PXK, màn
  tạo đơn, modal tạo PXK). Danh sách/chi tiết đơn: cột **"Giá niêm yết"** = giá bán danh mục, **"Giá đề xuất"** = đơn giá SAU chiết khấu
  (`tien_uoc_tinh` từ `tienUocTinhChoDon()` — dòng trong PXK tính theo cả PXK — chia SL; helper FE
  `donGiaSauChietKhau`/`tienSauChietKhau`/`giaNiemYet`). Cột DB `gia_de_xuat` giữ nguyên = giá bán lúc tạo đơn. Giá dự phòng CHỈ cho dòng MUA DỰ TRỮ, khi MỌI dòng dự trữ (trừ Đình
  tủ) có `gia_du_phong` > 0 VÀ dự phòng đã dùng (KHÔNG tính chính các dòng của phiếu) + giá trị dự phòng
  của phiếu ≤ hạn mức (`computeMocDuPhongHienTai(..., loaiTruDonIds)`). Sau khi đổi công thức: Admin bấm Settings › Loại chiết khấu › "Tính lại tiền
  phiếu đang tạo" (`POST /api/phieu-xuat-kho/tinh-lai-tien-dang-mo`). Chốt nghiệp vụ: đổi loại KHÔNG tự tính lại tiền — popup hỏi TN "có cập nhật
  giá thực tế không?" (gợi ý giá theo công thức loại mới; Có = lưu qua endpoint sẵn có `gia_chot`/
  `so-tien-cong-no`, Không = chỉ đổi nhãn); CHỈ đổi được khi PXK "Dang tao phieu" và chưa chốt chuyển tiền
  (`choPhepDoiLoaiChietKhau()` — không cần chuyển tiền hoặc Kế toán CHƯA duyệt chuyển tiền, tức khác "TN da duyet"; nới
2026-09-30, trước chỉ khi còn "Cho KTV chuyen"); gán lúc tạo PXK;
  thêm/bớt dòng PXK → tính lại TOÀN phiếu kể cả dòng TN đã chọn tay (`ganLoaiChietKhauChoPxk(..., true)`);
  dòng bị gỡ khỏi PXK → xoá loại. TN chọn lại/thêm loại mới qua `PATCH /api/phieu-xuat-kho/don-hang/:id/
  loai-chiet-khau`; so trùng tên ở JS (`lib/loaiChietKhau.ts`) vì `lower()` SQLite không hạ chữ có dấu.
- **Lọc cột kiểu Excel** (2026-09-28, `lib/locCot.ts` + `frontend/src/components/ui/LocCot.tsx`): danh sách đơn
  (`GET /dat-mua-lk/don-hang`, cột `DON_HANG_COT_LOC`) và PXK (`GET /phieu-xuat-kho`, `PXK_COT_LOC`) nhận thêm
  `cf` = JSON `{cot:{v:[...],not?:true}}` (1 bind `json_each`, không vướng giới hạn 100 tham số D1) + `cs`/`cd` sắp
  xếp — lọc ở SERVER, đúng cho mọi trang và cả "Tải danh sách chi tiết". Danh sách checkbox lấy từ
  `.../gia-tri-loc?cot=` với CÙNG điều kiện WHERE (`donHangListWhere()`/`pxkListWhere()` — sửa bộ lọc danh sách ở
  đó là đổi cả 2) trừ bộ lọc của chính cột. Đơn hàng: sắp xếp dòng TRONG từng nhóm KTV; sắp xếp cột "Người nhận
  hàng" = đổi thứ tự nhóm. Cột PXK `viec_can_lam` là bản SQL của `pxkViecCanLamTiep()` (FE) — đổi 1 bên phải đổi
  bên kia. Nút lọc cắm vào `Column.filter` (vẽ trong `ResizableHeaderCell`); mobile: toàn bộ chip `LocCotBar` nằm TRONG bảng "Bộ lọc" (mục "Lọc theo cột"), ngoài bảng chỉ hiện chip cột đang lọc; số cột đang lọc cộng vào "Bộ lọc (N)".
- **Xét duyệt mã linh kiện mới** (2026-09-30, migration `0053`, `lib/linhKienXetDuyet.ts`): mọi LK tạo trong app (form,
  import Excel, `/lk-settings/danh-muc` — người có "Quản lý danh mục LK") vào `linh_kien.trang_thai_ma='Cho xet duyet'`
  (DEFAULT cột; gia88 INSERT ghi 'Da xac nhan'). Cờ mới `users.la_mua_hang` ("Mua hàng", Cờ nghiệp vụ) + Admin:
  `POST /settings/linh-kien/:ma/xac-nhan` (giữ mã/sửa tên, hoặc đổi mã A→B), `/gop` (gộp vào mã có sẵn), `/tu-choi`
  (chỉ khi không còn đơn hiệu lực), `/gia-tam` (Giá NY/KTV cho LK `co_tren_gia88=0`), log `linh_kien_log`
  (`GET /:ma/xet-duyet`). Đặt đơn bằng mã chờ duyệt KHÔNG chặn (chốt người dùng). **Đổi/gộp mã KHÔNG xoá dòng A** — A
  thành dòng chuyển hướng `'Da doi ma'` + `ma_chuan=B` + `bat_tat=0` + `ngay_cap_nhat` mới (cache ô chọn LK trên máy
  người dùng tải tăng dần theo `ngay_cap_nhat`, không biết dòng bị xoá); đơn/BOM/nhóm thay thế chuyển sang B trong 1
  batch; mã A gửi lên sau đó (form cũ, file import) được `quyVeMaChuan()` quy về B (POST `/phieu-dat`, import, PATCH
  đơn). Bảng mới có cột mã LK → thêm vào `chuyenMaLk()`. gia88 trả đúng mã đang chờ → lấy tên/giá gia88 +
  `'Tu dong duyet'`; `co_tren_gia88` đồng bộ theo danh sách gia88 đầy đủ mỗi đêm. DVBH/Sửa chữa chỉ nhận LK
  `LK_DONG_BO_DUOC_SQL` (đã xác nhận/tự động duyệt). Sidebar "Bảng giá" đếm LK chờ (`lkChoXetDuyet`, chỉ Mua hàng/Admin).
  UI: `modules/danhMucLinhKien/XetDuyetMaLk.tsx` (khối trong drawer chi tiết LK). **Mua hàng xem TOÀN BỘ, chỉ đọc**
  (đợt 2): `requireDatMuaLkArea` cho vào + chặn mọi request khác GET (`VIEW_READONLY`, giống View nhưng KHÔNG giới hạn
  Khu vực); `scopeDatMuaNguoiTao`/`scopePxkNguoiNhanHang`/`scopeKtvTonKho`/`phamViXem` (quỹ) trả null; 3 nhánh Thiếu LK
  có `else if (la_mua_hang)` trước `la_view`. FE: App.tsx cấp Trang chủ/Đơn hàng/Phiếu xuất/Thiếu hàng/Trả hàng/Công
  nợ/Quỹ (`laTaiKhoanMuaHangThuanTuy` gồm cả `la_mua_hang` — thiếu thì tài khoản chỉ có cờ này kẹt màn "chờ duyệt");
  `DatMuaLinhKienModule` `laMuaHang` mở tab (không có cờ xử lý nào nên không hiện nút thao tác; không tải file MISA).
  "Báo cáo tốc độ xử lý" KHÔNG mở cho Mua hàng (chỉ Admin + View — đánh giá nhân sự, cần người dùng chốt riêng).
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

- **Cache dữ liệu tĩnh trên máy người dùng** (2026-09-28, `lib/tinhCache.ts` + migration `0039`): các domain
  `md_linh_kien`/`md_loai_de_xuat`/`md_danh_ba`/`md_ly_do_cham`/`md_loai_chiet_khau` trong `data_versions` tăng
  **tự động bằng TRIGGER** trên bảng nguồn (mọi đường ghi, kể cả import/đồng bộ ban đêm — không cần nhớ gọi
  `bumpVersions`). `GET /api/auth/data-versions` trả cả bộ. Query React Query khai báo trong `TINH_QUERY` (theo
  `queryKey[0]`, KHÔNG sửa từng nơi gọi) được `staleTime: Infinity` + lưu IndexedDB kèm tag (APP_VERSION + phiên bản
  lúc BẮT ĐẦU tải), phạm vi email + vai trò "xem thử"; `CacheTinhGate` (App.tsx) nạp cache trước khi render. Kiểm tra
  lại phiên bản mỗi 5 phút/khi quay lại tab → chỉ query có domain đổi mới tải lại. `useLkAndLdeCache` (helpers.ts)
  bỏ qua gọi mạng khi tag `md_linh_kien`/`md_loai_de_xuat` không đổi. Thêm dữ liệu tĩnh mới: thêm key vào
  `TINH_QUERY`; bảng nguồn mới → thêm trigger `md_*`. Đừng đặt lại `staleTime` riêng ở nơi gọi các key này (ghi đè mặc định). Ngược lại, danh sách
  đơn khả dụng tạo PXK (`dat-mua-lk-pxk-don-hang-kha-dung`, cũng là nguồn dropdown "Chọn KTV") LUÔN tải mới mỗi lần mở
  modal (`staleTime: 0`, bỏ dữ liệu tải trước lúc mở — `moModalLuc`) và được `invalidatePipelineCounts()` làm mới
  (2026-09-29: trước đây giữ bản cũ 2 phút → hiện KTV không còn đơn đã duyệt cho tới khi F5) — nút mở modal
  `removeQueries` cache danh sách. Danh sách này + số "(x…)" CHỈ theo bộ lọc bên ngoài của tab PXK (chip Khu vực,
  Người nhận hàng, lọc cột khu_vuc/nguoi_nhan_hang — `khaDungLocNgoai()` ở `phieuXuatKho.ts`), modal có dòng báo đang lọc.

- **Trạng thái "Phiếu xuất kho" + "Chuyển tiền" THEO TỪNG ĐƠN** (2026-09-29, `backend/src/lib/trangThaiDonPxk.ts`): không
  lưu cột — 2 biểu thức SQL suy từ PXK chứa đơn (`phieu_xuat_kho_dong`) trả MÃ (`trang_thai_pxk`, `thanh_toan`) ở
  `GET /dat-mua-lk/don-hang`, dùng CHUNG cho lọc cột Excel (`DON_HANG_COT_LOC`); nhãn/màu ở `TRANG_THAI_PXK_DON_OPTIONS`/
  `THANH_TOAN_DON_OPTIONS` (`constants.ts`) — thêm/đổi mã phải sửa cả 2 nơi. PXK "Đang tạo phiếu" tách theo chuyển tiền
  (Chờ KTV chuyển tiền / Chờ xác nhận chuyển tiền / Chờ TN gửi kế toán); đơn chưa vào phiếu: "TN da duyet" → "Chờ tạo
  phiếu", còn lại trống. Chuyển tiền: đơn từ chối/hủy → Đã hủy bỏ; không phải Mua/TRỪ CÔNG NỢ → Không cần chuyển; chưa vào
  phiếu → Chờ thanh toán (chốt người dùng); trong phiếu theo `trang_thai_chuyen_tien` (Kế toán duyệt = Đã thanh toán; PXK
  `so_tien_can_chuyen` NULL = Không cần chuyển). Cột đặt sau "Trạng thái" ở danh sách đơn; mobile: dòng 3 của thẻ đơn.
- **Kế toán đẩy lùi PXK "Chờ mã MISA" → "Chờ mã HĐ"** (2026-09-29): `POST /phieu-xuat-kho/:id/log` `trang_thai='Dang tao
  phieu'` từ "Cho ke toan", CHỈ Kế toán/Admin, bắt buộc `ghi_chu` (log "Kế toán trả về chờ mã HĐ: …", báo việc mới cho TN);
  giữ nguyên mã đơn hàng/mã MISA/chuyển tiền đã duyệt. Nút "↩ Trả về chờ mã HĐ" ở footer chi tiết PXK.
- **Danh sách PXK dạng phiếu gốc xổ xuống** (2026-09-29): bấm 1 dòng PXK = xổ/thu các dòng đơn con ngay bên dưới
  (`PaginatedTable` prop `expandedContent` — 1 hàng `<td colSpan>`, nội dung rộng không kéo giãn cột cha; mobile: khối
  dưới thẻ), bấm ID phiếu (link màu, gạch chân — desktop + mobile) mới mở Drawer, không còn nút "Chi tiết", "Xổ tất cả dòng đơn" mở cả trang. Bảng dòng đơn + mọi thao
  tác từng dòng (sửa tiền, tiền công nợ, loại chiết khấu, lý do chậm, bỏ đơn, mở chi tiết đơn) là **1 component dùng
  chung** `datMuaLinhKien/PxkDongDonHangTable.tsx` cho CẢ Drawer chi tiết PXK lẫn dòng xổ xuống — sửa ở 1 chỗ. Dữ liệu tải
  lazy khi mở, chung cache `["pxk-detail", id]` (`pxkDetailQuery()`) với Drawer. Ở danh sách dùng kiểu `gon` (người dùng
  chọn "lưới cột chung"): không tiêu đề/khung riêng, dòng ~32px, mọi phiếu chung 1 bộ độ rộng cột cố định (`COT_GON`) nên
  thẳng hàng, nghĩa cột hiện khi rê chuột; Drawer giữ bản đầy đủ có tiêu đề. Bỏ đơn cuối từ danh sách
  (`giuPhieuTrong={false}`) → hủy phiếu ngay qua `/huy-neu-trong`; từ Drawer giữ phiếu trống như cũ.
- **Tách "Đặt mua linh kiện" thành 2 mục Sidebar** (2026-09-29): **"Đơn hàng"** (tên cũ "Đơn đặt hàng") (key `dat-mua-lk`, nhóm menu đơn +
  trả hàng) và **"Phiếu xuất"** (key `phieu-xuat`, nhóm "Xuất kho") — vẫn là CÙNG 1 `DatMuaLinhKienModule` (prop `section`
  chọn view mặc định: Phiếu xuất → `phieu-xuat-kho`, Đơn đặt hàng → đơn/trả hàng xem lần trước), mỗi mục có slot menu giai
  đoạn riêng (`stageMenuSlots.don/pxk`, Sidebar `stageMenuSlotRefs` — setter ổn định). Mọi lần điều hướng nội bộ gọi
  `onLeaveForceView(view)` → `mucChoView()` (App.tsx) đổi mục Sidebar theo view (PXK → Phiếu xuất). Quyền mục `phieu-xuat` =
  `canXemPxkTab` (TN/Kho/Kế toán/GS/KTV/Vệ tinh + Admin). Số trên mục: `navCount()` (navConfig.ts) — Phiếu xuất = choTnPxk +
  choKhoPxk + choKeToanPxk của badge, Đơn hàng = phần còn lại của `total` (= VIỆC CẦN LÀM theo vai trò, KHÁC "Tổng đơn hàng" = mọi
  đơn còn tồn trong phạm vi). Menu con CHỈ xổ dưới mục đang chọn (`section`). Tên menu: "Thiếu hàng" (thieu-lk), "Bảng giá",
  "Công nợ" (ton-kho-ktv).
- **Tạo phiếu xuất kho trên điện thoại** (2026-09-30, `PhieuXuatKhoTab.tsx`): CÙNG 1 form (`body`) cho 2 vỏ — desktop `Modal` +
  bảng như cũ; mobile `TaoPxkMobileShell` (toàn màn hình `100dvh`, đăng ký `overlayStack` cho nút Back, thanh CTA dính đáy: số dòng
  + "Cần chuyển" + "Tạo phiếu") + dòng đơn dạng THẺ bấm cả thẻ để chọn. Tiền/loại chiết khấu từng dòng dùng chung helper
  `oTienTaoPxk()`/`loaiCkTaoPxk()` cho cả bảng lẫn thẻ — sửa 1 chỗ. Danh sách PXK có cột "Bằng chứng" (ảnh thu nhỏ, `BangChungAnhList nho`).
- **Bảng giá — KTV/Vệ tinh chỉ thấy "Giá NY"** (2026-09-30, `DanhMucLinhKienModule.tsx` `chiGiaNiemYet` = KTV/Vệ tinh
  không `quan_ly_danh_muc_lk`): ẩn Giá KTV/dự phòng/EU ở bảng + drawer chi tiết (Excel đã chặn sẵn). CHỈ ẩn ở giao diện Bảng
  giá — API `/settings/linh-kien` vẫn trả đủ vì màn tạo đơn (LinhKienPicker, cảnh báo công nợ) dùng `gia_tri_cong_no`.
  Preset "xem thử" ktv/ve_tinh/tram bật `xem_danh_muc_lk` như tài khoản thật (`viewAsPresets.ts`).
- **Menu "Phiếu đã in"** (2026-09-29): nhóm Xuất kho — "Đã chốt xong đơn xuất" = sentinel `CHOT_CHUA_IN` (chốt + chưa in),
  "Phiếu đã in" = `DA_IN` (chốt + đã in) — `DA_IN_COND`/`CHOT_CHUA_IN_COND` ở `phieuXuatKho.ts` (danh sách, xuất MISA,
  `/status-counts`). Lọc thường "Da chot xong don xuat" GIỮ NGUYÊN (cả 2) cho pipeline "Kho"/thẻ "Kho chốt đơn xuất"/báo cáo
  "Chờ kho gửi". Dòng PXK đã in tô `--color-success-soft` (xanh lá), cột "In phiếu" đứng trước "Người tạo".
- **ErrorBoundary** (2026-09-29, `components/ui/ErrorBoundary.tsx`): bọc `<App/>` (main.tsx) + vùng tab của
  `DatMuaLinhKienModule` (key = tab đang xem). Tab là `React.lazy()`; sau deploy, tab trình duyệt cũ tải chunk đã bị xoá →
  Worker trả `index.html` (SPA fallback) → `import()` lỗi → trước đây TRẮNG màn hình. Giờ lỗi tải chunk (+ sự kiện
  `vite:preloadError`) tự tải lại trang 1 lần/30s; lỗi render khác hiện thông báo + nút Thử lại/Tải lại.
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

### Nguyên tắc giao diện xuyên suốt — BẮT BUỘC (`DESIGN_GUIDELINES.md`)

Mọi thay đổi UI (màn mới, sửa màn cũ, desktop lẫn mobile) PHẢI tuân theo `DESIGN_GUIDELINES.md` ở gốc
repo. File này giữ NGUYÊN VẸN ngôn ngữ thiết kế của `DESIGN_SYSTEM.md` (triết lý, bố cục sidebar 261px/
topbar 64px/gap 14px, typography, bo góc, viền, đổ bóng, cấu trúc KPI card/bảng/filter tab/modal) — CHỈ
thay gam màu thương hiệu Teal/Cyan bằng gam màu icon app (`frontend/public/icon-512.png`): gradient
`#2466E4 → #1285E7 → #0FC7F0`, primary `#1467E8`, sidebar gradient xanh hoàng gia `#0D4FB8 → #093B8F`.
Màu ngữ nghĩa (cam chờ/đỏ lỗi/xanh lá xong/tím) và thang chữ slate không đổi. `DESIGN_SYSTEM.md` chỉ
là tài liệu nguồn tham chiếu — khi hai file khác nhau về màu, `DESIGN_GUIDELINES.md` thắng.

Quy tắc cốt lõi khi code: không hard-code hex trong component (thêm token vào
`frontend/src/styles/tokens.css` trước), không tự chế biến thể badge/nút/tab mới khi đã có mẫu, mỗi
vùng tối đa 1 nút primary, màu ngữ nghĩa mang nghĩa cố định. Phân chia với concept 1 bên dưới:
`DESIGN_GUIDELINES.md` quyết định **màu/chữ/khoảng cách/bo góc/bóng/kiểu component**; concept 1 quyết
định **luồng nghiệp vụ, tab nào có, nhãn/nội dung hiển thị theo vai trò**. Đã chuyển đổi TOÀN BỘ app
2026-09-26 (`tokens.css`, `tailwind.config.js`, component dùng chung, Sidebar/TopBar trắng, manifest) —
bảng ánh xạ token/class/component ở `DESIGN_GUIDELINES.md` §7. Token tên cũ (`--ocean-*`, `--ink-*`,
`--line`…) chỉ còn là alias trỏ về palette mới; code mới dùng `--color-*`/`--kpi-*` và các class
`.tbl`/`.tbl-head`/`.filter-tab`/`.kpi-card`/`.code-link`. Biểu đồ báo cáo (2026-09-26): bộ SVG tự dựng
`frontend/src/components/charts/` + token `--chart-*` (đã qua validator dataviz) — quy tắc ở
`DESIGN_GUIDELINES.md` §9; endpoint chỉ-đọc `GET /api/dat-mua-lk/bao-cao-xu-huong` dùng CHUNG
`baoCaoScope()` với `/bao-cao-tong-the` (sửa scope 1 chỗ là đổi cả 2 — cố ý, để biểu đồ khớp bảng). Font: `tokens.css` khai báo
`"Plus Jakarta Sans"` (đã cài + import weight 400-800 đầu `tokens.css`), fallback `Be Vietnam Pro`.

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

Khi sửa UI trong module này, đối chiếu lại `concept-1-structured-neutral.html` (nghiệp vụ/nhãn) và
`DESIGN_GUIDELINES.md` (màu/kiểu hiển thị) trước khi tự quyết định layout/nhãn/màu — tránh code lệch hướng đã chọn rồi phải sửa lại lần 2.

### Auth & vai trò

Google OAuth 2.0 độc lập (Client ID/Secret RIÊNG, không dùng chung với hệ gốc), session JWT
`dvbh_session` cookie (cùng cơ chế `lib/jwt.ts`/`middleware/session.ts` port từ hệ gốc).
`BOOTSTRAP_ADMIN_EMAIL` tự động promote thành Admin ở lần đăng nhập đầu.

Chỉ còn 3 giá trị `vai_tro` (`Admin | QC | Giam sat`, có thể NULL) — phần lớn phân quyền thực tế đến
từ 7 cờ boolean nghiệp vụ (`la_ktv_dvbh, la_ve_tinh, la_kho, la_ke_toan, la_tac_nghiep, la_tp_dvbh,
la_view`) + 2 cờ danh mục (`quan_ly_danh_muc_lk`, `xem_danh_muc_lk`), không còn hệ thống
`users.modules` JSON tuỳ biến theo từng người như hệ gốc — coi là đơn giản hoá có chủ đích cho 1 hệ
chỉ phục vụ 1 miền nghiệp vụ. `la_view` (thêm 2026-08-26) là vai trò **chỉ đọc, giới hạn theo Khu
vực** — quyết định cuối: "view thấy theo khu vực được set" (không phải xem tất cả). Đã wire vào
`middleware/requireDatMuaLkArea.ts` (cấp quyền vào module + chặn mọi request khác `GET` khi `la_view`
là con đường DUY NHẤT đưa tài khoản vào module — tài khoản có thêm cờ khác như `la_kho` vẫn ghi được
bình thường theo quyền của cờ đó) và `lib/scopeDatMua.ts` (`khuVucViewEmailInSql()` — phạm vi xem =
tập KTV/Vệ tinh có `khu_vuc_ma` nằm trong danh sách Khu vực được gán cho chính tài khoản View đó qua
`user_khu_vuc`; chưa gán Khu vực nào thì không thấy đơn nào, không phải mặc định thấy hết). `App.tsx`
tự cấp module `dat-mua-lk`/`thieu-lk`/`tra-hang` cho `la_view` giống các cờ nghiệp vụ khác.

### Khu vực (2026-08-26 — xây lại quản lý tài khoản/vai trò)

Thêm bảng `khu_vuc` (migration `0009_khu_vuc.sql`) — danh sách khu vực tổ chức (MB1/MB2/.../B2B MN,
mở rộng được qua Settings › Khu vực), mỗi khu vực có tối đa 1 GS phụ trách (`khu_vuc.gs_email`, 1 GS
được phép phụ trách nhiều khu vực cùng lúc). `ktv_lien_he` có thêm `khu_vuc_ma` (gán trực tiếp cho
MỌI KTV kể cả Vệ tinh), `ktv_cap1_phu_trach` (CHỈ ý nghĩa khi `vai_tro_ktv='Ve tinh'` — trỏ tới
`ma_ktv` của 1 KTV cấp 1 cụ thể phụ trách trực tiếp), `cong_no`/`cong_no_cap_nhat_luc` (nhập tay/
import Excel định kỳ qua bulk-import, **không có cron đồng bộ**).

**Quan trọng — scope GS/Trạm trong toàn bộ module Đặt mua linh kiện KHÔNG đọc trực tiếp Khu vực**:
`scopeDatMua.ts`/`datMuaLinhKien.ts`/`phieuXuatKho.ts` vẫn đọc nguyên `users.giam_sat_quan_ly`/
`users.tram_cha` như trước (không sửa dòng logic phân quyền nào ở các file đó — rủi ro cao, đụng tới
mua/công nợ/trả hàng đang chạy thật). Thay vào đó, `lib/khuVucSync.ts` biến 2 cột này thành
**derived/read-only**: `giam_sat_quan_ly` tự tính lại từ `ktv_lien_he.khu_vuc_ma` → `khu_vuc.gs_email`,
`tram_cha` tự tính lại từ `ktv_lien_he.ktv_cap1_phu_trach` — gọi lại mỗi khi dữ liệu nguồn đổi (xem
`routes/auth.ts` lúc đăng nhập lần đầu, `routes/settingsKtv.ts` PATCH/bulk-import/backfill,
`routes/settingsDatMua.ts` PATCH `/khu-vuc/:ma/gs`). `PATCH /api/users/:email` **không còn nhận**
`tram_cha`/`giam_sat_quan_ly` trong body nữa (Admin không còn sửa tay 2 cột này ở Users module — sửa
Khu vực/KTV cấp 1 phụ trách ở thẻ "KTV hiện trường" thay vì sửa trực tiếp). Bảng
`dat_mua_lk_phu_trach_gs` (Khu vực phụ trách MỀM cho TN/Kho/Kế toán, chỉ ảnh hưởng badge/thống kê)
**cố ý giữ nguyên, chưa thay bằng `user_khu_vuc`** — theo xác nhận người dùng, khu vực gán cho
TN/Kho/Kế toán hiện chỉ phục vụ tìm kiếm/lọc ở UsersModule, chưa phải cơ chế phân quyền. **"Khu vực là chuẩn"** (chốt
2026-09-29): tài khoản ĐÃ gán Khu vực (`user_khu_vuc`) thì `phuTrachGsSet()` trả null — lớp "Giám sát phụ trách" cũ bị bỏ
qua ở MỌI danh sách/badge/báo cáo (báo cáo tổng thể/xu hướng của họ lọc theo Khu vực trong `baoCaoScope`); lớp cũ chỉ còn
tác dụng với tài khoản chưa gán Khu vực nào. Trước đó 2 lớp AND nhau, Admin cấu hình lệch → TN không thấy đơn khu vực mình.
Thông báo việc mới (`emailsForRoleOrQC`, `lib/taskNotify.ts`) VẪN theo bảng cũ.

**`dat_don_hang.email_gs` = GS của khu vực HIỆN TẠI của KTV nhận hàng** (chốt 2026-09-28, migration
`0035_dong_bo_email_gs_don.sql`): trước đây là ảnh chụp lúc tạo đơn nên KTV đổi khu vực/khu vực đổi GS thì đơn cũ
vẫn tính cho GS cũ. Giờ `resyncKhuVucDerivedFieldsForEmail/ForAll()` (`lib/khuVucSync.ts`) đồng bộ luôn
`email_gs` của MỌI đơn (cả đơn cũ) có người nhận nằm trong danh bạ KTV — mọi scope đọc `email_gs` tự đúng mà
không sửa logic phân quyền. Báo cáo tổng thể/xu hướng của GS (`baoCaoScope`) = `email_gs = GS OR nguoi_tao = GS`
(đơn GS đặt hộ ngoài khu vực vẫn tính — chốt người dùng).

**Khu vực CỦA ĐƠN — cột `dat_don_hang.khu_vuc_ma` / `phieu_xuat_kho.khu_vuc_ma`** (chốt 2026-09-29, migration `0042`):
trước đây đơn chỉ "thuộc" khu vực qua email KTV (người tạo/người nhận trong `ktv_lien_he`) nên đơn GS/TN để "-- Chính
tôi --" nhận hàng hoặc KTV chưa gán khu vực bị bộ lọc khu vực mặc định của TN ẩn mất. Giờ lưu sẵn: KTV nhận hàng (KTV
CHƯA gán khu vực → `CHUA_CO`, không mượn khu vực người tạo — migration `0045`) → [người nhận không phải KTV:] KTV tạo đơn
→ GS (khu vực ĐẦU TIÊN theo `stt, ma` GS đó phụ trách) → `'CHUA_CO'` ("Chưa có khu vực" — 1 dòng THẬT trong
`khu_vuc`, không gán GS được `KHU_VUC_HE_THONG`; Admin gán TN xử lý qua `user_khu_vuc`). PXK: KTV nhận → GS → CHUA_CO.
**Khu vực đặt hàng** (chốt 2026-09-30, migration `0055`): `users.khu_vuc_dat_hang` cho MỌI tài khoản KHÔNG phải KTV (GS
quản trị chung không phụ trách khu vực nào, TN/Kho…) — chọn ở Quản lý người dùng › sửa tài khoản. Chèn vào chuỗi trên, THẮNG
khu vực GS phụ trách: đơn = KTV nhận → KĐH người nhận → KTV tạo → KĐH người tạo → GS nhận → GS tạo → CHUA_CO; PXK = KTV nhận
→ KĐH người nhận → GS → CHUA_CO. Đổi KĐH → trigger `trg_users_khu_vuc_dat_hang_u` tính lại đơn/PXK CŨ của người đó. Scope GS
thêm `OR ddh.nguoi_nhan_hang = GS` (đơn GS nhận có thể thuộc khu vực GS khác). Sửa chuỗi khu vực = sửa bản mới nhất ở `0055`.
Cập nhật bằng TRIGGER (tạo/đổi người nhận, đổi `ktv_lien_he.khu_vuc_ma/email_dang_nhap`, đổi `khu_vuc.gs_email/stt`) —
KHÔNG tự set trong code; cột không bao giờ NULL. `email_gs` = `giam_sat_quan_ly` của KTV nhận, fallback GS của khu vực
của đơn (trigger `trg_ddh_email_gs_theo_khu_vuc` + `DON_EMAIL_GS_MOI` ở `khuVucSync.ts` — cùng công thức) nên đơn GS tự
nhận hàng không còn `email_gs` NULL. Bộ lọc khu vực (`khuVucSetWhereSql()`, CTE `kv_ma` ở `/luong-quy-trinh`) = điều kiện email KTV
cũ **OR** cột này (không đơn nào mất); danh sách khu vực truyền 1 bind JSON (`json_each`). Cột "Khu vực" ở danh sách
đơn/PXK/trả hàng + lọc cột Excel đọc thẳng cột này. Chưa áp: scope `la_view` (`khuVucViewEmailInSql`) và báo cáo tốc độ
xử lý vẫn theo email KTV. Badge (`getDatMuaLkBadge`) cache theo version — đổi `user_khu_vuc` không làm mới ngay.

**Đơn "TRỪ CÔNG NỢ"** (chốt 2026-09-28): không đối chiếu công nợ (không cộng công nợ phát sinh) và không đối
chiếu/giữ tồn kho công ty — đối chiếu **tồn kho của chính KTV nhận hàng** (`lib/tonKhoKtv.ts`: cuối kỳ file MISA −
SL các đơn TRỪ CÔNG NỢ tạo sau mốc import, chưa từ chối/hủy; trừ ngay từ lúc tạo đơn). Đủ tồn → tự duyệt, thiếu →
giữ "Chờ TN duyệt". TN có Hủy/Từ chối/Chờ hàng cho mọi đơn chưa vào PXK ("Chờ TN duyệt" và "TN đã duyệt").
Chốt 2026-09-29: file MISA Bán hàng/Xuất kho của dòng TRỪ CÔNG NỢ trừ **kho của KTV** (mã kho = mã MISA KTV, `misaExport.ts`)
thay vì kho công ty theo miền (chốt 2026-09-30: dòng TRỪ CÔNG NỢ gợi ý mẫu **Bán hàng** theo `settings_loai_de_xuat.loai_file_xuat_misa`, KHÔNG theo quy tắc "PXK công nợ → Chuyển kho" — `resolveTemplate(..., loaiDeXuat)`; ép "MISA Chuyển kho" thì BỎ dòng TRỪ CÔNG NỢ khỏi file + cảnh báo `boQuaTruCongNo`, vì Chuyển kho sẽ chuyển ngược hàng KTV về kho công ty. Nghiệp vụ: KTV chuyển tiền mua LK đang giữ công nợ → Kế toán duyệt → giảm công nợ KTV đúng LK đó — Kế toán chỉ dùng file
Bán hàng; trên app: **Công nợ chốt = thực tế + phát sinh − đã trừ**, "đã trừ" = `gia_tri_cong_no` × SL của đơn TRỪ CÔNG NỢ tạo
sau mốc import mà PXK đã `trang_thai_chuyen_tien='TN da duyet'`, phiếu không hủy — `computeCongNoDaTru()`/`CONG_NO_DA_TRU_*_SQL`
ở `lib/congNoKtv.ts`, dùng chung cho `computeCongNoChot` (đánh giá công nợ lúc tạo đơn) + màn Công nợ `ktvTonKho.ts GET /`); PXK mà MỌI dòng đều TRỪ CÔNG NỢ → Kế toán "Đã chốt xong đơn xuất" xong hệ thống TỰ chuyển
"Hang tru kho" (không đẩy khovan, không báo việc cho Kho — `hangTruKhoTuDong` ở `POST /phieu-xuat-kho/:id/log`); phiếu lẫn dòng
khác đi như cũ. Đơn **có "Yêu cầu hóa đơn"** (khác trống/"Không", TRỪ "HĐ - Xuất cho trạm" = `Yêu cầu hóa đơn (xuất cho Trạm)` vẫn chiết khấu bình thường — `coYeuCauHoaDon()` ở `pxkRecalculate.ts`, bản sao FE `LoaiChietKhau.tsx`) tính GIÁ NIÊM YẾT,
nhãn `KHONG_CK`, không Đình tủ/bậc thang/giá KTV/dự phòng (vẫn cộng vào tổng ngày; giá chốt tay vẫn thắng). Loại đề xuất chứa
"HỖ TRỢ" bắt buộc Mã YCSC (`maYcscRequired()` — backend + bản sao FE).

**Tự hủy đơn tự duyệt đã vào PXK** (chốt 2026-09-28, `lib/pxkTuHuy.ts`, migration `0036`): người tạo HOẶC KTV nhận
hàng được Hủy đơn tự duyệt (log đầu tiên đã là "TN da duyet") đã tự gom vào PXK khi PXK còn "Dang tao phieu", Kế
toán chưa duyệt chuyển tiền (KTV đã báo chuyển vẫn hủy được) và văn phòng CHƯA thao tác tay
(`phieu_xuat_kho.van_phong_tac_dong_luc` IS NULL — ghi bởi middleware `/:id/*` của `phieuXuatKho.ts` cho mọi request
ghi thành công của TN/Kho/Kế toán/Admin + tạo PXK tay + PATCH đơn trong PXK; tính lại tiền tự động không ghi). Đơn
duy nhất của phiếu → hủy luôn phiếu ("Ke toan huy"); còn dòng khác → gỡ dòng + tính lại cả phiếu. Cột
`tu_huy_duoc` (`TU_HUY_DUOC_SQL`) trả ở danh sách/chi tiết đơn → `actionsFor()` hiện nút Hủy. TN cũng Hủy/Từ chối/Chờ
hàng được đơn "TN da duyet" ĐÃ trong PXK khi phiếu còn "Dang tao phieu" + Kế toán chưa duyệt chuyển tiền
(`TN_DOI_TRONG_PXK_SQL` → cột `tn_doi_trong_pxk`); rời "TN da duyet" → `goDonKhoiPxk()` gỡ đơn khỏi phiếu. Phiếu
thành trống: thao tác từ màn chi tiết PXK (`giu_phieu_trong`) → giữ phiếu trống, đóng/chuyển màn phiếu mới tự hủy
(`POST /phieu-xuat-kho/:id/huy-neu-trong`); thao tác từ ngoài → hủy phiếu ngay. TN bỏ được cả đơn cuối của phiếu
(không còn chặn `LAST_ORDER`); "Gửi kế toán" chặn phiếu trống (`PHIEU_TRONG`). Log tự duyệt lúc tạo đơn có
`dat_don_hang_log.tu_dong = 1` (migration `0037`, `trang_thai` vẫn 'TN da duyet') → hiển thị "Tự động duyệt đơn".
**Bằng chứng chuyển tiền nhiều ảnh** (chốt 2026-09-29, migration `0043`): `phieu_xuat_kho.bang_chung_chuyen_tien_anh` =
JSON array URL, tối đa 5 (`lib/bangChungChuyenTien.ts`; cột cũ `bang_chung_chuyen_tien_url` giữ = ảnh đầu). KHÔNG tách
phiếu: đơn tự duyệt vẫn gộp vào phiếu đã có bằng chứng; tổng đổi (`taiTinhPxk`, `POST /:id/chuyen-tien`) → về "Cho KTV
chuyen" nhưng GIỮ ảnh + ghi chú, KTV chuyển bổ sung, thêm ảnh rồi xác nhận lại. `PATCH /:id/chuyen-tien` "KTV da
chuyen" nhận `bang_chung_chuyen_tien_anh` = DANH SÁCH ĐẦY ĐỦ (cũ + mới). UI dùng chung
`datMuaLinhKien/BangChungChuyenTien.tsx` (chi tiết PXK + khối PXK trong chi tiết đơn của KTV).
**Đổi loại đề xuất Mua/Công nợ ↔ TRẢ HÀNG = đổi luồng** (2026-09-29, `PATCH /dat-mua-lk/don-hang/:id`, migration `0048`
sửa 16 đơn kẹt): trước chỉ đổi `loai_don`, đơn kẹt "Cho TN duyet" trong luồng Trả hàng. Giờ Mua → Trả hàng đặt
`trang_thai_hien_tai='Cho ke toan duyet mem'` + `tra_hang_log` + báo Kế toán (không bắt ảnh; đơn đã từ chối/hủy →
`DON_DA_DONG_KHONG_DOI_LUONG`; "Cho hang" → đóng ticket Thiếu LK); Trả hàng → Mua CHỈ khi còn "Cho ke toan duyet mem" →
"Cho TN duyet" (log `dat_don_hang_log` mang trạng thái mới), else `TRA_HANG_DA_XU_LY_KHONG_DOI_LUONG`. CAS `quy_cas_guard`.
**Kế toán từ chối bằng chứng** (2026-09-29, migration `0046`): nút "↩ Từ chối, đẩy lại" cạnh "Duyệt bằng chứng" →
`PATCH /:id/chuyen-tien` `{trang_thai:"Cho KTV chuyen", ly_do_tu_choi}` (chỉ Kế toán/Admin, từ "KTV da chuyen", phiếu chưa
hủy, bắt buộc lý do) → lưu `ly_do_tu_choi_chuyen_tien`/`tu_choi_chuyen_tien_luc`, log 'Ke toan tu choi bang chung chuyen
tien', báo việc mới cho KTV nhận hàng + TN; GIỮ ảnh/ghi chú. Lý do hiện ở form KTV tới khi KTV "Đã chuyển" lại (xoá lý do).
**Quỹ tiền dư KTV** (chốt 2026-09-29, `lib/quyKtv.ts`, migration `0047`): MỌI tiền chuyển đi qua quỹ của NGƯỜI NHẬN HÀNG
(Vệ tinh → Trạm). Kế toán duyệt = nhập **số thực nhận** (`PATCH /:id/chuyen-tien` `so_tien_thuc_nhan`, `duyetKhoanChuyen()`):
quỹ +T (`nop_tien`) → `canBangPxk()` trừ quỹ trả phiếu (`tra_phieu`, tối đa số còn thiếu) → đủ thì "TN da duyet", thiếu thì
về "Cho KTV chuyen" số còn thiếu; dư nằm lại quỹ và `phanBoQuy()` tự trừ cho phiếu "Cho KTV chuyen" CŨ NHẤT của cùng người.
Quỹ đủ trả hết → phiếu sang "KTV da chuyen" CHỜ Kế toán xác nhận (log 'Tru quy du'; thực nhận 0đ hợp lệ khi đã đủ) — sửa
2026-09-30, trước đó tự "TN da duyet"; chỉ khi chính Kế toán duyệt/sửa khoản của phiếu đó mới đóng thẳng (`canBangPxk(..., {
khiTraDu })`: "ke-toan" | "cho-ke-toan" mặc định | "giu" khi Kế toán từ chối). Tổng giảm/phiếu hủy sau khi đã trả → hoàn
về quỹ (`hoan_phieu`, log 'Hoan tien ve quy'). `so_tien_can_chuyen` GIỮ nghĩa = tổng phiếu; `phieu_xuat_kho.da_thanh_toan` =
đã trả; còn phải chuyển = hiệu. `canBangPxk()` idempotent, gọi ở `taiTinhPxk` (mọi thay đổi tổng), POST `/:id/chuyen-tien`,
từ chối, mọi đường hủy PXK (`/:id/log` Ke toan huy, `goDonKhoiPxk`, `huyPxkNeuTrong`) — thêm đường hủy/đổi tiền mới phải
gọi nó. Sổ quỹ `quy_ktv_giao_dich` chỉ ghi thêm; `quy_ktv.so_du` CHECK ≥ 0; mỗi batch mở đầu bằng CAS (`quy_cas_guard` —
INSERT vi phạm CHECK khi `da_thanh_toan`/trạng thái đã đổi → rollback cả batch). `khoan_chuyen_tien` = sổ mọi lần Kế toán
duyệt/từ chối (ảnh, số cần/thực nhận; `lich_su=1` = dữ liệu trước quỹ, coi như trả đủ). Khoá "Kế toán đã chốt tiền"
(tự hủy, TN đổi đơn trong PXK, tự tính lại tổng ngày) dùng `KE_TOAN_DA_CHOT_TIEN_SQL` = 'TN da duyet' + CÓ khoản đã duyệt
— phiếu trả HẾT bằng quỹ vẫn mở như chưa chốt (hủy/giảm tự hoàn quỹ). UI: `TienPhieuVaQuy`/`DuyetChuyenTienForm`/
`LichSuKhoanChuyen` (`BangChungChuyenTien.tsx`), dòng "Quỹ dư hiện tại" trong `TongNgayKtvInfo`; file "Tải danh sách chi
tiết" PXK thêm Mã HĐ/Người chuyển/cần-thực chuyển/quỹ/link ảnh (`exportRowsToExcel` `linkFields`). Menu **"Quỹ & chuyển
tiền"** (`modules/QuyChuyenTienModule.tsx` + `routes/quyKtv.ts` tại `/api/quy-ktv`): tab Khoản chuyển tiền (lọc/Excel kèm link
ảnh), Số dư quỹ, Sổ quỹ; Kế toán/Admin "Điều chỉnh" (+/− `dieu_chinh`) hoặc "Hoàn tiền cho KTV" (`hoan_tien_ktv`), bắt buộc
lý do, quỹ không đủ → `QUY_KHONG_DU`, cộng quỹ → `phanBoQuy()`. **Sửa / hủy khoản đã duyệt** (2026-09-29, migration `0049`,
`suaThucNhanKhoan()`/`huyKhoanChuyen()`, `POST /api/quy-ktv/khoan-chuyen/:id/sua|huy`, Kế toán/Admin, bắt buộc lý do): sửa TĂNG = cộng
quỹ phần chênh (`dieu_chinh` gắn `khoan_chuyen_tien_id`) → trả phiếu còn thiếu; sửa GIẢM chỉ khi quỹ đủ (chốt người dùng — không tự rút
tiền đã trả phiếu). HỦY (duyệt nhầm) = `trang_thai='Da huy'`: rút lại phần phiếu đã được trả (`da_thanh_toan` về `min(da_thanh_toan_truoc,
hiện tại)`, `hoan_phieu`) + trừ số thực nhận khỏi quỹ + phiếu về "KTV da chuyen" (giữ ảnh) chờ Kế toán duyệt lại; chỉ khoản duyệt MỚI NHẤT
của phiếu, phiếu "Dang tao phieu" (tiền "TN da duyet"/"Cho KTV chuyen") hoặc đã hủy (chỉ trừ quỹ) — `KHOAN_HUY_DUOC_SQL` (cờ `huy_duoc`);
quỹ không đủ (dư đã trả phiếu khác) → chặn kèm danh sách phiếu. Mọi tổng/khóa chỉ đếm `'Da duyet'` nên khoản hủy tự bị loại. Phiếu đã trả
tiền bị hủy → `thongBaoHoanQuyPhieuHuy()` báo KTV (3 đường hủy: `/:id/log` Ke toan huy, `goDonKhoiPxk`, `huyPxkNeuTrong` — thêm đường hủy
mới phải gọi); tab Khoản chuyển tiền gắn nhãn "Phiếu đã hủy · tiền về quỹ". Phạm vi `phamViXem()`: Admin/Kế toán/TN xem tất cả, KTV xem
của mình, Vệ tinh xem quỹ của Trạm — khớp điều kiện cấp menu ở `App.tsx`.
**Bỏ đơn khỏi phiếu đã có tiền — tiền theo đơn** (2026-09-30, migration `0056`): `DELETE /phieu-xuat-kho/:id/dong/:donHangId`
CHẶN khi phiếu đã có `ma_misa` (`DA_CO_MA_MISA`). Phiếu `da_thanh_toan > 0` → FE (`PxkDongDonHangTable`) hỏi TN: "Đơn chưa
thanh toán" (như cũ: tổng giảm, trả thừa hoàn quỹ) / "Đơn đã thanh toán" (`?giu_tien=1`): tiền của dòng (`tienUocTinhTheoDong`,
tối đa phiếu đã trả) RÚT khỏi `da_thanh_toan` của phiếu, nằm ở `dat_don_hang.tien_da_tra` (+ `_email` chủ quỹ, `_pxk`), đơn về
"Chờ tạo phiếu" (cột chuyển tiền theo đơn = Đã thanh toán). Đơn vào phiếu mới (tạo tay, thêm dòng, tự gom) → `lenhNhanTienDaTraDon()`
cộng vào `da_thanh_toan` phiếu mới trong CÙNG batch với INSERT dòng — thêm đường đưa đơn vào phiếu mới phải gọi nó. Đơn mang tiền bị
từ chối/hủy, đổi người nhận hoặc sang Trả hàng → TRIGGER `trg_ddh_hoan_tien_da_tra` hoàn về quỹ (mọi đường ghi).
**Chuyển tiền TRƯỚC khi duyệt** (chốt 2026-09-30, migration `0057`): đơn Mua / TRỪ CÔNG NỢ TẠO MỚI có giá bán × SL > 0 vào phiếu
NGAY lúc tạo dù chưa tự duyệt (`bundleAutoApprovedIntoPxk`), cột `dat_don_hang.bat_buoc_chuyen_tien = 1` (đơn cũ = 0, giữ quy
tắc cũ). Không gộp vào phiếu Kế toán đã duyệt tiền ('TN da duyet') hay đã có mã MISA → tạo phiếu mới. "Gửi kế toán" chặn
`DON_CHUA_DUYET` khi phiếu còn đơn khác 'TN da duyet' — TN tự bỏ ra (chọn "Đơn đã thanh toán" để giữ tiền), đơn giữ trạng thái
thật. Đơn chưa duyệt trong phiếu bị hủy/từ chối (TN/KTV/Trạm/TBP) → tự rời phiếu (`pxkChuaDonChuaDuyet` + `goDonKhoiPxk`); chuyển
"Chờ hàng" → rời phiếu MANG THEO tiền (`goDonKhoiPxk(..., giuTien)`/`lenhMangTienDon`). Đơn cờ này CHỈ "Chờ hàng" được khi đã
chuyển tiền = `THANH_TOAN_DON_SQL` 'da_thanh_toan' (Kế toán xác nhận tiền phiếu chứa đơn, hoặc đơn mang tiền) — else
`CHUA_CHUYEN_TIEN_KHONG_CHO_HANG` (`chuaChuyenTienChoHang`). PATCH đổi `loai_don` khi đơn trong phiếu "Dang tao phieu" → gỡ khỏi phiếu.
Phiếu Kế toán ĐÃ duyệt tiền mà tổng mới ≤ `da_thanh_toan` (đơn rời phiếu) → GIỮ "Kế toán đã duyệt", thừa hoàn quỹ (`taiTinhPxk`
`giuDaDuyet` — Kế toán xác nhận = xác nhận bằng chứng khớp số tiền, tiền thật không đổi). TN/Admin **"Trả bằng quỹ dư"** cho đơn
CHƯA vào phiếu còn thiếu tiền (`POST /dat-mua-lk/don-hang/:id/tra-bang-quy`, `thongTinTraBangQuy`; chi tiết đơn trả `tra_bang_quy`
{can_tra, quy}): quỹ người nhận − (tiền ước tính − `tien_da_tra`) → cộng vào `tien_da_tra` (giao dịch `tra_phieu`, pxk NULL).
**Tự đọc số tiền trên ảnh chuyển khoản** (2026-09-30, migration `0051`): OCR chạy HOÀN TOÀN trên trình duyệt
(`frontend/src/lib/docTienAnh.ts`, tesseract.js v7 + dữ liệu `vie`, web worker, tải lười khi có ảnh) — file thư viện tự host ở
`/ocr/*`, do plugin `ocrAssets()` trong `frontend/vite.config.ts` chép từ `node_modules` lúc build (`frontend/public/ocr/` bị
gitignore — đừng commit). CHỈ cảnh báo, không bao giờ chặn/tính tiền. KTV tải ảnh → đọc ngay từ file trên máy → gửi kèm
`bang_chung_tien_doc` (JSON `{url: số|null}`) lúc "Đã chuyển" (`locTienDocAnh()` gộp số cũ, chỉ giữ ảnh còn đính kèm); máy Kế toán
dùng lại, chỉ đọc bù ảnh chưa có số; lúc duyệt/từ chối chụp vào `khoan_chuyen_tien.tien_doc_anh` cho modal "Sửa tiền". Chỉ cộng ảnh
CHƯA nằm trong khoản đã duyệt trước (`ANH_DA_GHI_NHAN_SQL` → `anh_da_ghi_nhan`; list Quỹ: `anh_truoc`). Dòng số tiền cao >34px
(Tesseract hay đọc sai số to đậm) được cắt riêng đọc lại ở 32px/24px, lấy số khớp 2/3 lần, lệch → null ("kiểm tra bằng mắt").
Ảnh Drive đọc qua `lh3.googleusercontent.com/d/<id>=w1600` (link thumbnail 302 không có CORS). Đưa ảnh vào tesseract dạng Blob,
KHÔNG dạng canvas (canvas chậm ~1s/lần). UI chung `datMuaLinhKien/DocTienAnh.tsx` (`useDocTienAnh`/`TienDocTuAnh`).

**Thứ tự tên hiển thị người dùng** (chốt 2026-09-30, `lib/tenNguoi.ts`): Tên hiển thị KTV (danh bạ) → Tên MISA (KTV, rồi
`users.ten_misa`) → tên Google (`users.ten`) → email. `/api/auth/nguoi-directory` trả sẵn theo thứ tự này (FE
`formatPersonDisplay` giữ `ktv ?? users ?? email`); SQL dùng `tenNguoiSql`/`tenNguoiNullSql` (sắp xếp cột người `locCot`,
Ctrl+K, người nhận khả dụng, Vệ tinh của tôi, tồn đọng/báo cáo tổng thể, MISA cảnh báo, log thiếu LK), JS dùng `tenNguoiMap`
(báo cáo tốc độ, thông báo). Chỗ mới hiển thị tên người: dùng lại các helper này, không tự `COALESCE(u.ten, …)`. Migration
`0050`: trigger `md_danh_ba` theo dõi thêm `users.ten_misa`.

**Tìm theo tên KTV** (`lib/timTheoTen.ts`, không dấu, không phân biệt hoa/thường — `LOWER()`/`LIKE` của SQLite không
làm được): danh sách đơn/PXK/Thiếu LK/Trả hàng (`emailsTheoTen` + `orEmailIn` — danh sách email là 1 bind JSON
`json_each`, KHÔNG dùng 1 `?` mỗi người vì họ phổ biến vượt giới hạn 100 tham số D1), danh bạ KTV + tồn kho KTV
(`maKtvTheoTen`), Users, Ctrl+K (`GET /dat-mua-lk/search` — thêm đơn/PXK gần nhất của KTV khớp tên, cùng scope với
tìm theo mã). Lọc phía client (`Select`, ô tìm trong lọc cột, Ctrl+K, báo cáo) dùng `frontend/src/lib/boDau.ts`
`khopTim()` — cùng quy tắc với backend (bản sao `khopTim` trong `timTheoTen.ts`, đổi 1 bên đổi cả 2): ký tự KHÔNG dấu trong từ khóa khớp mọi biến thể có dấu, ký tự CÓ dấu phải khớp đúng dấu (2026-09-30: gõ "lẻ" trước đây ra cả "Telesale"/"Lê"). Mã yêu cầu sự cố (chính + BỔ SUNG trong `dat_don_case`): `orMaYcsc()`
(đơn/Thiếu LK/Trả hàng/Ctrl+K), `orDonTrongPxk()` (PXK — theo mã đơn/mã YCSC của dòng trong phiếu). File tải về 4 danh
sách đổi cột người (`nguoi_*`) sang tên: `doiNguoiThanhTen()` (`lib/personDisplay.ts`).

**Thiếu LK — trạng thái "Kho da cap nhat" + cột trạng thái bên trái** (2026-09-28, migration `0040`/`0041`): sau
"Kho da tiep nhan", Kho bấm "Cập nhật thông tin" (lặp lại được) để đổi ngày dự kiến và/hoặc ghi chú tiến độ (bắt
buộc 1 trong 2, `MISSING_THONG_TIN_CAP_NHAT`); "Kho xac nhan hang da ve" tự ghi `thieu_lk.ngay_hang_ve_thuc_te` (ngày
VN). `0041` rebuild `thieu_lk_log` chỉ để mở CHECK — thêm trạng thái mới phải rebuild tiếp. "Kho da cap nhat" KHÔNG
tính vào badge/`__VIEC__` (nhóm "Đang chờ"). Màn Thiếu LK lọc trạng thái bằng `ThieuLkStatusRail.tsx` (desktop: cột
232px nhóm Cần xử lý/Đang chờ/Đã đóng/Tất cả; mobile: chip `.filter-tab`); nhóm Cần xử lý = `__VIEC__` = CÙNG tập với
`thieuLkTrangThaiViec()` + badge `thieuLkCanXuLy` (`routes/notifications.ts`) — đổi 1 chỗ phải đổi cả 3. Số đếm lấy từ
`/thieu-lk-status-counts` (1 truy vấn GROUP BY) dùng CHUNG `thieuLkListWhere()` với `GET /thieu-lk` nên luôn khớp danh
sách (cùng phạm vi/khu vực/người nhận/tìm kiếm) — không thêm truy vấn D1 nào cho cột trạng thái. Thiết kế lại mobile
2026-09-29 (quy tắc ở `DESIGN_GUIDELINES.md` §8.10): nút cần nhập liệu (Tiếp nhận/Cập nhật) ở danh sách mở Drawer chi
tiết với form sẵn (`initialAction`, xong thì đóng về danh sách) — KHÔNG còn Modal riêng; form dùng chung
`ThieuLkActionForm`. Drawer nhận `initialRow` từ danh sách để hiện ngay (chỉ lịch sử tải thêm).

**Thiếu LK ↔ đơn gốc đồng bộ 2 chiều** (chốt 2026-09-29, `applyThieuLkLog`/`applyDonHangLog` trong
`datMuaLinhKien.ts`): Kho "xác nhận hàng đã về" / "từ chối (sai TT)" / Hủy bỏ → đơn gốc "Cho hang" về **"Cho TN
duyet"** (KHÔNG còn tự duyệt), log đơn ghi tóm tắt toàn bộ quá trình xử lý ticket (`tomTatThieuLk()`). "Da ket thuc"
hiển thị là **"TN đã duyệt"**, chỉ đi được từ `THIEU_LK_CHO_TN` (hàng về / Kho từ chối — hàng đợi TN, cùng tập với
badge + `__VIEC__`): TN duyệt trên ticket = duyệt luôn đơn gốc (đơn cần lý do chậm → `DUYET_TREN_DON_GOC`); TN duyệt
đơn gốc từ "Cho TN duyet" → ticket mở tự "Da ket thuc"; TN từ chối/hủy đơn → ticket tự "Da huy bo" kèm lý do; TN
chuyển lại "Chờ hàng" → đóng ticket cũ, mở ticket mới (`dongThieuLkMoCuaDon()`). Hạn 24h của TN tính từ mốc MUỘN
hơn giữa giải trình và lúc vào "Cho TN duyet" (`mocTinhHanTn()` trong `lib/hanLyDoCham.ts`).
**Đơn "Cho hang" mở/khóa theo ticket** (chốt 2026-09-30): Kho CHƯA tiếp nhận ticket ("Cho kho xu ly") hoặc ticket đã đóng →
đơn thao tác như "Cho TN duyet" (TN duyệt/từ chối/chờ hàng lại/hủy, người tạo/Admin hủy), ticket đang chờ TỰ HỦY
(`laChoHangMoKhoa` trong `applyDonHangLog`; duyệt thẳng → ticket "Da huy bo"); Kho ĐÃ tiếp nhận ("Kho da tiep nhan"/"Kho da cap
nhat") → khóa `THIEU_LK_KHO_DANG_XU_LY` + ghi chú chờ Kho. Điều kiện chung `khoDangXuLyThieuLkSql()` → cột `kho_dang_xu_ly_thieu_lk`
(danh sách + chi tiết đơn, FE `laChoHangMoKhoa`/`laChoHangBiKhoa` ở `helpers.ts`), gắn luôn vào CAS UPDATE (Kho tiếp nhận không
đổi version đơn). Đóng ticket từ app KHÔNG báo sang khovan (như mọi đường đóng ticket khác).

**Kế toán ở "Danh sách KTV"** (`KtvTab mode="ke-toan"`): sửa tay Trần công nợ/Hạn mức dự phòng (+ hiện tại)/Mã MISA/Tên
MISA (`PATCH /:ma/cong-no-misa`) + import hàng loạt KHỚP THEO MÃ MISA (`POST /settings/ktv-lien-he/bulk-import-cong-no-misa`,
`modules/ImportCongNoMisaModal.tsx` — không tạo KTV, ô trống giữ cũ, mã trùng nhiều KTV thì bỏ qua + báo lỗi).
2026-09-30: đọc file xong có bước **chọn cột** import (chỉ cột có dữ liệu; bỏ chọn = không gửi = giữ cũ); cột tuỳ chọn
**Mã KTV** → dòng đó khớp theo Mã KTV và GÁN/ĐỔI Mã MISA (mã đang thuộc KTV khác → lỗi `ma_misa_cua_ktv_khac`, gán xong
`relinkTonKhoForMaMisa`). **TN** (`KtvTab mode="tn"`) sửa được Mã/Tên MISA qua cùng PATCH — backend bỏ qua công nợ/hạn
mức nếu không phải Kế toán/Admin; TN không có Import. `GET /ktv-ton-kho/ma-kho-chua-khop` mở thêm cho TN.

**Tự tạo KTV + duyệt tài khoản từ ETX nhân sự** (chốt 2026-09-29, `lib/etxTuDongKtv.ts`, migration `0044`): chạy CUỐI mỗi
lần đồng bộ ETX (cron 0h thứ Hai VN + nút "Đồng bộ ngay"; riêng bước này: `POST /api/etx-nhan-su/tu-dong-ktv/run`). Nhân
sự `on` + chức danh chứa CTV/KTV/Kỹ thuật viên (không dấu) + Gmail hợp lệ, CHƯA có trong danh bạ KTV → TẠO SẴN
`ktv_lien_he` (ma_ktv = Mã NV, tên "(Mã NV) Chức danh - Họ tên", vai trò KTV nếu có KTV/Kỹ thuật viên còn lại CTV, chưa
khu vực) + `users` "Da duyet"/`la_ktv_dvbh=1` (tài khoản "Cho duyet" có sẵn cũng được duyệt) + liên kết
`etx_nhan_su.ma_ktv` (nghỉ việc → tự khoá). Bỏ qua: Gmail đã là email đăng nhập KTV, Mã NV trùng ma_ktv, Gmail đã có tài
khoản Da duyet/Tu choi (không biến nhân viên văn phòng thành KTV). Chạy lặp lại an toàn (lần 2 tạo 0).

**Bỏ bước TBP** cho LK đặc thù khi loại đề xuất chứa MUA / HỖ TRỢ / **TRỪ CÔNG NỢ** (`boQuaTbpChoDacThu()` backend,
bản sao `boQuaTbpDacThu()` FE cho cảnh báo ở `LinhKienPicker`).

**GS đặt hộ cho MỌI KTV** (chốt 2026-09-28): `/nguoi-nhan-hang-kha-dung` trả toàn bộ KTV cho GS, bỏ chặn
`NGUOI_NHAN_HANG_NGOAI_PHAM_VI`/`NGOAI_PHAM_VI_GS` (tạo đơn, import, cảnh báo công nợ/dự phòng/dự đoán duyệt).
Scope xem của GS = `ddh.email_gs = GS` **HOẶC `ddh.nguoi_tao = GS`** (để thấy lại đơn mình đặt ngoài khu vực);
báo cáo tổng thể/PXK của GS vẫn theo khu vực.

Quản lý tài khoản tách 2 thẻ ở `UsersModule.tsx`: **"KTV hiện trường"** (chuyển từ
`SettingsModule.tsx`/"Danh sách KTV" sang đây — CRUD/tìm kiếm/lọc cấp 1-2/khu vực/bulk-import/công
nợ) và **"Nhân viên văn phòng"** (lọc `nhom=van-phong`, gán nhiều Khu vực cho TN/Kho/Kế toán qua
`user_khu_vuc`). `SettingsModule.tsx` chỉ còn tab "Khu vực" cho phần Khu vực (CRUD + gán GS).

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
