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
  thường phải đối chiếu route kia. **Hạn 24h từng giai đoạn** (chốt 2026-10-01): Kế toán duyệt mềm / Kho / QC / TN duyệt
  tổng mỗi bước có 24h (cùng quy tắc đẩy qua T7/CN của `tinhHanLyDoCham`) tính từ MỐC XỬ LÝ CUỐI của giai đoạn trước = lần
  đầu đơn vào trạng thái hiện tại sau lần đổi trạng thái gần nhất (`mocGiaiDoanTraHangSql()` ở `lib/hanLyDoCham.ts`; log cùng
  trạng thái như QC tải ảnh KHÔNG reset; bước đầu chưa có log → `ngay_tao`). Quá hạn mà Duyệt/Từ chối → `MISSING_LY_DO_CHAM`,
  bắt chọn lý do từ `settings_ly_do_cham` "Mua hàng" (ghi vào `tra_hang_log.ghi_chu`); Hủy không bắt. GET `/tra-hang` + `/:id`
  trả `qua_han_ly_do_cham`/`han_giai_doan`; FE `TraHangTab.tsx` badge "Quá hạn 24h" + `LyDoChamTraHangModal` (đơn lẻ, chi
  tiết, hàng loạt). Kho xác nhận qua khovan (`partnerKho.ts`) KHÔNG bị chặn. Đơn `loai_don='tra_hang'` KHÔNG áp hạn "Lý do
  chậm" 24h-từ-"Cho TN duyet" của đơn mua (`choTnDuyetAtExpr`/`lastGiaiTrinhAtExpr` trả NULL, 2 truy vấn PXK cũng vậy) — đơn
  đổi Mua→Trả hàng từng bị báo "Quá hạn" sai trong PXK + chặn "Gửi kế toán". Chi tiết đơn trả hàng gộp `tra_hang_log` vào "Lịch sử xử lý".
  **Kho sửa SL thực tế nhận về** (2026-10-05): ở bước "Cho kho xac nhan", chi tiết đơn trả hàng có ô "SL thực tế nhận về" → gửi
  `so_luong_thuc_te` kèm `POST /tra-hang/:id/log` duyệt (`applyTraHangLog`, số nguyên ≥ 1; bước/hành động khác →
  `SO_LUONG_CHI_SUA_O_BUOC_KHO`), ghi vào `so_luong_thuc_xuat` trong CÙNG CAS (bằng SL đề xuất → NULL) + log "Kho sửa SL thực tế
  nhận: A → B". PXK/file MISA đọc `COALESCE(so_luong_thuc_xuat, so_luong_de_xuat)` nên tự theo số mới. Duyệt nhanh ở danh sách /
  hàng loạt / qua khovan giữ nguyên SL.
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
  theo tổng thực tế; Đình tủ luôn ×85%). Màn tạo đơn: "Giá ước tính" từng dòng + tổng dưới chân = giá SAU chiết khấu (`giaUocTinhDong()` ở `useTaoDonForm.ts`, v1.320 — bản sao FE của quy tắc `tinhToanPxk`: KH lẻ/có yêu cầu hóa đơn = niêm yết, Đình tủ ×85%, mốc theo tổng ngày đã tạo + dòng đang soạn; không tính giá dự phòng; dòng công nợ/trả hàng giữ niêm yết) kèm nhãn mức + giá niêm yết gạch ngang — đổi quy tắc giá ở backend phải sửa cả đây. Hiển thị tổng ngày + "Ước tính chuyển": `GET /api/dat-mua-lk/tong-ngay-ktv`
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
  (`GET /:ma/xet-duyet`). Đặt đơn bằng mã chờ duyệt KHÔNG chặn (chốt người dùng). **Sửa tên / mã khi CHƯA xác nhận** (chốt 2026-10-16, v1.357 — "linh kiện chưa xác nhận, vẫn cho phép nhân viên mua hàng cập nhật lại tên và mã hàng chuẩn"): `POST /settings/linh-kien/:ma/cap-nhat-cho-duyet` {ma_moi?, ten_moi?} (cùng quyền `xetDuyetMaRoles`) — sửa tên và/hoặc đổi mã A→B mà mã VẪN "Cho xet duyet" (`chuyenMaLk` `taoMoi.giuChoDuyet`), log "Cap nhat"; không bắt Phân loại. UI: nút "Sửa tên / mã" trong khối Xét duyệt mã (`CapNhatModal`). **Đổi/gộp mã KHÔNG xoá dòng A** — A
  thành dòng chuyển hướng `'Da doi ma'` + `ma_chuan=B` + `bat_tat=0` + `ngay_cap_nhat` mới (cache ô chọn LK trên máy
  người dùng tải tăng dần theo `ngay_cap_nhat`, không biết dòng bị xoá); đơn/BOM/nhóm thay thế chuyển sang B trong 1
  batch; mã A gửi lên sau đó (form cũ, file import) được `quyVeMaChuan()` quy về B (POST `/phieu-dat`, import, PATCH
  đơn). Bảng mới có cột mã LK → thêm vào `chuyenMaLk()`. gia88 trả đúng mã đang chờ → lấy tên/giá gia88 +
  `'Tu dong duyet'`; `co_tren_gia88` đồng bộ theo danh sách gia88 đầy đủ mỗi đêm. DVBH/Sửa chữa nhận LK ở MỌI
  trạng thái (từ 2026-10-12, migration 0076; trước đó chỉ đã xác nhận/tự động duyệt) — mã chờ duyệt sang ngay, từ chối/đổi mã
  sang với `bat_tat = 0`. Sidebar "Bảng giá" đếm LK chờ (`lkChoXetDuyet`, chỉ Mua hàng/Admin).
  **Ngày tạo mã** (2026-10-15, v1.335, migration `0081`): `linh_kien.ngay_tao` (giờ VN) do TRIGGER `trg_linh_kien_ngay_tao` ghi
  cho MỌI đường tạo LK (INSERT mang sẵn `ngay_tao` thì giữ — đổi mã A→B chép ngày tạo của A qua `COT_CHEP`); LK cũ lấy log đầu
  tiên trong `linh_kien_log`, trước đó NULL ("—"). Bảng giá: cột "Ngày tạo" sau "Trạng thái mã", mã chờ xét duyệt hiện số ngày
  chờ (cam khi > 3 ngày); lọc "Chờ xét duyệt" xếp mã cũ nhất lên đầu (khi không gõ tìm).
  UI: `modules/danhMucLinhKien/XetDuyetMaLk.tsx` (khối trong drawer chi tiết LK). **Mua hàng xem TOÀN BỘ, chỉ đọc**
  (đợt 2): `requireDatMuaLkArea` cho vào + chặn mọi request khác GET (`VIEW_READONLY`, giống View nhưng KHÔNG giới hạn
  Khu vực); `scopeDatMuaNguoiTao`/`scopePxkNguoiNhanHang`/`scopeKtvTonKho`/`phamViXem` (quỹ) trả null; 3 nhánh Thiếu LK
  có `else if (la_mua_hang)` trước `la_view`. FE: App.tsx cấp Trang chủ/Đơn hàng/Phiếu xuất/Thiếu hàng/Trả hàng/Công
  nợ/Quỹ (`laTaiKhoanMuaHangThuanTuy` gồm cả `la_mua_hang` — thiếu thì tài khoản chỉ có cờ này kẹt màn "chờ duyệt");
  `DatMuaLinhKienModule` `laMuaHang` mở tab (không có cờ xử lý nào nên không hiện nút thao tác; không tải file MISA).
  **"Báo cáo tốc độ xử lý" mở cho MỌI nhân viên văn phòng** (chốt 2026-10-17, v1.360 — ghi đè "chỉ Admin + View"): gate backend
  `routes/baoCaoTocDoXuLy.ts` chỉ chặn KTV/Vệ tinh (`la_ktv_dvbh`/`la_ve_tinh`), FE `App.tsx` cấp module `bao-cao-toc-do` cho cùng tập; phạm vi:
  View theo Khu vực được gán (`resolveScopeEmails`), còn lại xem toàn bộ. **Lọc theo Khu vực / nhóm loại đề xuất truyền 1 bind JSON** (sửa 2026-10-23, v1.396 — "vào báo cáo tốc độ tải bị báo lỗi" INTERNAL_ERROR): `countDangCho` (`lib/slaMetrics.ts`) + `resolveScopeEmails` từng đặt 1 `?` mỗi email KTV → khu vực đông KTV (MB3 ~122) vượt giới hạn 100 tham số D1; giờ `IN (SELECT value FROM json_each(?))`.
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
  `so_tien_can_chuyen` NULL = Không cần chuyển). Danh sách đơn: 3 cột Trạng thái / Phiếu xuất kho / Chuyển tiền đứng NGAY SAU "Linh kiện" (2026-10-03), tiếp theo Loại / Ghi chú người đặt hàng / Mã yêu cầu sự cố / Mã Lada (2026-10-04; 2026-10-15 gọn còn ~9 cột chính `COT_CHINH`, cột còn lại ẩn trong "Tùy chỉnh cột", key cấu hình cột `dmlk-don-hang-list-v5` — đổi thứ tự/cột mặc định thì tăng key để bỏ cấu hình đã lưu); mobile: dòng 3 của thẻ đơn.
- **Kế toán đẩy lùi PXK "Chờ mã MISA" → "Chờ mã HĐ"** (2026-09-29): `POST /phieu-xuat-kho/:id/log` `trang_thai='Dang tao
  phieu'` từ "Cho ke toan", CHỈ Kế toán/Admin, bắt buộc `ghi_chu` (log "Kế toán trả về chờ mã HĐ: …", báo việc mới cho TN);
  giữ nguyên mã đơn hàng/mã MISA/chuyển tiền đã duyệt. Nút "↩ Trả về chờ mã HĐ" ở footer chi tiết PXK.
  **Kho đẩy lùi "Đã chốt xong đơn xuất" → "Chờ mã MISA"** (2026-10-07): cùng `POST /:id/log` `trang_thai='Cho ke toan'` khi phiếu
  đang "Da chot xong don xuat" (`dayLuiTuKho`) — Kho/Kế toán/Admin, bắt buộc `ghi_chu` (log "Trả về chờ mã MISA: …", báo việc Kế
  toán), bỏ qua mọi kiểm tra của "Gửi kế toán", reset `da_in_phieu = 0`. Bên khovan dòng "chờ xử lý" cũ vẫn còn (khovan không có
  trạng thái rút lại; Kế toán chốt lại thì push cùng `order_code`, khovan trả dòng có sẵn — không trùng). Nút "↩ Đẩy lùi về chờ mã
  MISA" ở footer chi tiết PXK.
  **Kho đẩy lùi "Đang gửi KTV" → "Đã chốt xong đơn xuất"** (2026-10-22, v1.394 — "đơn đã ấn gửi ktv cho phép kho đẩy ngược lại bước trước"): cùng `POST /:id/log`
  `trang_thai='Da chot xong don xuat'` khi phiếu "Dang gui KTV" (`dayLuiGuiKtv`) — Kho/Admin, bắt buộc `ghi_chu` (log "Kho đẩy lùi về chờ gửi KTV: …"), chặn
  `DANG_BAO_NHAN_THIEU` khi có ticket nhận thiếu mở; giữ mã vận đơn + cờ đã in; KHÔNG lặp tác dụng phụ của bước chốt (đẩy khovan, báo việc Kho, báo KTV
  "Kế toán duyệt xong") — chỉ báo KTV nhận "đưa về chờ gửi". Khovan không có trạng thái rút lại (dòng bên đó giữ nguyên). Nút "↩ Đẩy lùi về chờ gửi" ở footer chi tiết PXK.
- **Chuyển kho xuất MB/MN theo phiếu** (chốt 2026-10-07, migration `0070`, `lib/mienXuat.ts`): `phieu_xuat_kho.mien_xuat`
  (`bac`/`nam`, NULL = theo khu vực — "MB"/"MN" trong mã khu vực, như MISA trước nay). TN/Kế toán/Kho (Kho từ v1.340)/Admin đổi qua `PATCH
  /phieu-xuat-kho/:id/mien-xuat` {mien_xuat, ghi_chu?} khi phiếu còn "Dang tao phieu"/"Cho ke toan" (`DA_GUI_KHO`); chọn đúng miền
  của khu vực = lưu NULL; log 'Da chuyen kho xuat'. Ảnh hưởng: (1) file MISA `mien = pxk.mien_xuat ?? miền khu vực` (mọi cột kho:
  kho công ty, kho Máy KRF, NTMB/NTMN trả hàng; dòng TRỪ CÔNG NỢ vẫn kho KTV); (2) bộ lọc khu vực của PXK — **mọi chỗ lọc PXK theo
  khu vực dùng `khuVucPxkWhereSql()`** (`scopeDatMua.ts`; danh sách/status-counts/mo-count/misa-export gộp/badge
  `notifications.ts`/`/luong-quy-trinh`, `/home-summary` CTE dùng `pxkKhopMienXuatSql`): phiếu đã chuyển khớp CẢ khu vực cũ LẪN tập
  khu vực có khu vực thuộc miền MỚI (chốt 2026-10-15, v1.333 — trước đó chỉ miền mới; người chuyển vẫn chịu trách nhiệm theo dõi,
  chi tiết PXK hiện "Người chuyển kho" = log 'Da chuyen kho xuat' mới nhất, cột `mien_xuat_nguoi_chuyen`; **RIÊNG Kho thuần** (`laKhoThuan()` — `la_kho` mà không TN/Kế toán/Admin, chốt 2026-10-15 v1.337 "kho chỉ cần nhìn thấy đơn theo khu vực họ phụ trách") chỉ thấy phiếu đã chuyển ở MIỀN XUẤT MỚI: tham số `chiMienMoi` của `khuVucPxkWhereSql()` + CTE `/home-summary`; badge Kho ở `notifications.ts` luôn `true`); (3) đẩy khovan kèm
  `sender_info.mien_xuat` (khovan chưa dùng). Chuyển sang miền khác → báo việc (`viec_moi`) cho TN có `user_khu_vuc` thuộc miền mới
  (trừ người chuyển); bỏ chuyển về theo khu vực thì không báo. Thông báo việc khác vẫn theo bảng cũ. UI: cột "Kho xuất" + lọc cột `mien_xuat` ở danh sách PXK, badge + thẻ "Kho xuất"
  ở chi tiết PXK (`datMuaLinhKien/KhoXuat.tsx`).
- **Kho chọn lại khu vực cho phiếu sai khu vực** (chốt 2026-10-07, migration `0071`): cột `khu_vuc_chon` trên CẢ
  `phieu_xuat_kho` lẫn `dat_don_hang` (NULL = theo `khu_vuc_ma` do trigger tự tính — KHÔNG ghi đè `khu_vuc_ma` vì trigger sẽ tính
  lại). Kho/Admin (+ TN/Kế toán từ v1.341, + TBP / GS / người tạo đơn hộ từ v1.387 — xem dưới) `PATCH /phieu-xuat-kho/:id/khu-vuc` {khu_vuc_ma, ghi_chu?} khi phiếu chưa đóng → ghi phiếu + MỌI đơn trong phiếu,
  xoá `mien_xuat` (miền theo khu vực mới), log 'Da chuyen khu vuc'; chọn đúng khu vực tự tính = bỏ chọn. `khuVucSetWhereSql()`
  (dùng chung đơn/PXK/thiếu LK/trả hàng/badge) = `khu_vuc_chon` có thì CHỈ khớp khu vực chọn, không thì điều kiện cũ (CTE
  `/home-summary` viết tay cùng quy tắc). Khu vực hiển thị/lọc cột/MISA/miền kho xuất = `COALESCE(khu_vuc_chon, khu_vuc_ma)`
  (`khuVucHieuLucSql()` ở `lib/mienXuat.ts`). Đơn thêm vào phiếu SAU khi chọn không tự nhận khu vực chọn; đơn rời phiếu giữ khu
  vực chọn. Chưa áp: scope GS/View. UI: thẻ "Khu vực" + badge ở chi tiết PXK (`ChuyenKhuVucCard` trong `KhoXuat.tsx`).
  **Đổi khu vực xử lý trên TỪNG ĐƠN** (chốt 2026-10-15, v1.339 — KTV đúng khu vực nhưng đơn cần khu vực khác xử lý): `PATCH
  /dat-mua-lk/don-hang/:id/khu-vuc` {khu_vuc_ma, ghi_chu?} (TN — gồm Kế toán làm thay —/Kho/Admin) ghi `dat_don_hang.khu_vuc_chon` (chọn đúng
  khu vực tự tính = bỏ chọn), CHỈ khi đơn chưa từ chối/hủy và CHƯA trong phiếu còn hiệu lực (`DON_TRONG_PHIEU` → Kho đổi ở phiếu); log vào
  `tra_hang_log` (đơn trả hàng) / `dat_don_hang_log` (cùng trạng thái). Đơn vào phiếu SAU đó: phiếu MANG THEO khu vực chọn —
  `bundleAutoApprovedIntoPxk` tách nhóm theo `khu_vuc_chon` của đơn và chỉ gộp vào phiếu đang tạo có CÙNG `khu_vuc_chon` (phiếu Kho đã chọn
  khu vực không còn nhận đơn mới khu vực tự động), tạo phiếu tay = khu vực chọn chung nếu MỌI đơn cùng 1 giá trị. UI: dòng "Khu vực xử lý"
  (`DoiKhuVucDon` ở `KhoXuat.tsx`) trong chi tiết đơn + chi tiết đơn trả hàng.
  **GS / TBP / người tạo đơn hộ chọn lại khu vực** (chốt 2026-10-22, v1.387 — "Cho phép giám sát, TBP hoặc người tạo đơn hộ chọn lại khu vực cho đơn
  hàng hoặc phiếu hàng"): ngoài TN/Kế toán/Kho/Admin, `duocDoiKhuVucDon()` (`lib/scopeDatMua.ts`, PATCH đơn) + `duocDoiKhuVucPxk()` (`phieuXuatKho.ts`) cho
  TBP (`la_tp_dvbh`, mọi đơn/phiếu) và theo `doiKhuVucDonSql()`: NGƯỜI TẠO HỘ (`nguoi_tao` = mình, người nhận khác mình) + GS (đơn có `email_gs` / người tạo /
  người nhận = GS hoặc khu vực hiệu lực thuộc "Khu vực xem thêm"); phiếu = có ≥ 1 đơn trong phiếu thoả. Chi tiết đơn (`GET /don-hang/:id`, `GET /tra-hang/:id`)
  và chi tiết PXK trả cờ `duoc_doi_khu_vuc` → FE hiện ô chọn (`DoiKhuVucDon`/`ChuyenKhuVucCard`). Vẫn theo phạm vi XEM: TBP không có tab Phiếu xuất
  (`canXemPxkTab`) và KTV tạo hộ không mở được phiếu của người khác nhận → chỉ đổi được ở chi tiết đơn khi đơn chưa vào phiếu.
  **Đổi khu vực → xét lại tồn kho CẢ 2 CHIỀU** (chốt 2026-10-22, v1.388 chiều thuận + v1.389 "xử lý cả 2 chiều"): `xetLaiTonKhiDoiKhuVuc()`
  (`lib/tuDongDuyet.ts`) gọi SAU khi ghi khu vực mới ở PATCH `/don-hang/:id/khu-vuc` (1 đơn) và PATCH `/phieu-xuat-kho/:id/khu-vuc` (mọi đơn trong
  phiếu). Chỉ đơn Mua/Công nợ (không TRỪ CÔNG NỢ — tồn KTV; không đơn gửi bù), tồn = kho công ty theo khu vực MỚI (FIFO `donDuTonKhoCongTy`):
  "Cho hang" đủ → `duyetDonKhiHangVe` (tự duyệt + vào phiếu, mang tiền đã trả) + đóng ticket mở "Da ket thuc"; "Cho thanh toan" →
  `danhGiaLaiDonChoThanhToan` (đủ → tự duyệt); "TN da duyet" THIẾU → "Cho hang" + ticket, rời phiếu MANG THEO tiền (`tacDongSauDinhTuyen`)
  CHỈ khi đơn chưa vào phiếu hoặc phiếu "Dang tao phieu" + Kế toán chưa chốt tiền (`TN_DOI_TRONG_PXK_SQL`) — còn lại giữ nguyên (`giu_nguyen`).
  Mỗi đơn đổi trạng thái báo người tạo. API trả `tu_duyet`/`cho_hang` (đơn: boolean; phiếu: danh sách mã + `giu_nguyen`) → toast ở
  `DoiKhuVucDon`/`ChuyenKhuVucCard`. Phiếu mà mọi đơn rời đi → tự hủy như bỏ đơn cuối (`goDonKhoiPxk`).
- **Danh sách PXK dạng phiếu gốc xổ xuống** (2026-09-29): bấm 1 dòng PXK = xổ/thu các dòng đơn con ngay bên dưới
  (`PaginatedTable` prop `expandedContent` — 1 hàng `<td colSpan>`, nội dung rộng không kéo giãn cột cha; mobile: khối
  dưới thẻ), bấm ID phiếu (link màu, gạch chân — desktop + mobile) mới mở Drawer, không còn nút "Chi tiết", "Xổ tất cả dòng đơn" mở cả trang. Bảng dòng đơn + mọi thao
  tác từng dòng (sửa tiền, tiền công nợ, loại chiết khấu, lý do chậm, bỏ đơn, mở chi tiết đơn) là **1 component dùng
  chung** `datMuaLinhKien/PxkDongDonHangTable.tsx` cho CẢ Drawer chi tiết PXK lẫn dòng xổ xuống — sửa ở 1 chỗ. Dữ liệu tải
  lazy khi mở, chung cache `["pxk-detail", id]` (`pxkDetailQuery()`) với Drawer. Ở danh sách dùng kiểu `gon` (người dùng
  chọn "lưới cột chung"): không tiêu đề/khung riêng, dòng ~32px, mọi phiếu chung 1 bộ độ rộng cột cố định (`COT_GON`) nên
  thẳng hàng, nghĩa cột hiện khi rê chuột; Drawer giữ bản đầy đủ có tiêu đề. Drawer có nút "⬇ Tải danh sách chi tiết" (2026-10-02) = file y hệt nút ở danh sách Đơn hàng, chỉ các đơn của phiếu (`GET /dat-mua-lk/don-hang?pxk_id=&loai_don=all` — `pxk_id` bỏ lớp GS phụ trách mềm, scope vẫn áp). Danh sách PXK có 2 nút tải (2026-10-19, v1.366): "⬇ Tải chi tiết phiếu" (mỗi dòng 1 phiếu, như cũ) và "⬇ Tải chi tiết đơn" = MỌI đơn trong các phiếu đang xem theo bộ lọc, cùng format file danh sách Đơn hàng (`GET /dat-mua-lk/don-hang?pxk_ids=<JSON>&loai_don=all`, 1 bind `json_each`, ≤ 200 mã/lần — FE chia lô 100, bỏ trùng đơn; `pxk_ids` cùng quy tắc `pxk_id`). Bỏ đơn cuối từ danh sách
  (`giuPhieuTrong={false}`) → hủy phiếu ngay qua `/huy-neu-trong`; từ Drawer giữ phiếu trống như cũ. **Bỏ nhiều đơn 1 lần** (2026-10-19, v1.368): ô chọn đơn bật cả khi được bỏ đơn (TN/Kế toán, phiếu "Dang tao phieu", chưa Mã MISA,
  ≥ 2 đơn — `coBoNhieu`), nút "✕ Bỏ N đơn khỏi phiếu" gọi LẦN LƯỢT `DELETE /:id/dong/:donHangId` (dừng ở lỗi đầu, báo số đã bỏ); phiếu đã có
  tiền hỏi 1 lần "Đơn chưa/đã thanh toán" áp cho cả nhóm; bỏ hết đơn = như bỏ đơn cuối.
  **Nút "Bỏ" ở phiếu NHIỀU đơn = hộp 3 lựa chọn** (chốt 2026-10-23, v1.401 — "tách thành phiếu mới / Chỉ bỏ khỏi phiếu / Thêm vào 1 phiếu có sẵn"):
  `ChuyenDonModal` (`PxkDongDonHangTable.tsx`, hiện khi `duoc_chuyen_don` + "Dang tao phieu" + chưa Mã MISA + ≥ 2 đơn; phiếu 1 đơn giữ như cũ).
  "Tách thành phiếu mới" / "Thêm vào 1 phiếu có sẵn" = `POST /phieu-xuat-kho/:id/dong/:donHangId/chuyen` {dich: "moi" | id phiếu, giu_tien?} — quyền
  `duocChuyenDonPxk()` (TN/Kế toán/Kho/Admin + GS theo `doiKhuVucDonSql`, ≥ 1 đơn trong phiếu thoả); phiếu đích hợp lệ = `PHIEU_NHAN_DUOC_SQL` (cùng người
  nhận + loại đơn, "Dang tao phieu", chưa Mã MISA, Kế toán CHƯA duyệt tiền — else 409 `PHIEU_DICH_KHONG_HOP_LE`), danh sách ở `GET /:id/phieu-nhan-duoc`.
  1 batch: (giu_tien → `lenhMangTienDon`) xoá dòng nguồn + log 2 phiếu + (phiếu mới: INSERT mang `khu_vuc_chon` của đơn, `mien_xuat` phiếu nguồn) + INSERT
  dòng đích + `ma_xuat_kho` đơn + `lenhNhanTienDaTraDon`; sau đó `ganLoaiChietKhauChoPxk` cả 2 phiếu (tính lại tiền, cân bằng quỹ). Phiếu đã có tiền bắt chọn
  "Đơn đã/chưa thanh toán". "Chỉ bỏ khỏi phiếu" (đơn về "Chờ tạo phiếu") = `DELETE` cũ, CHỈ TN/Kế toán.
- **Tách "Đặt mua linh kiện" thành 2 mục Sidebar** (2026-09-29): **"Đơn hàng"** (tên cũ "Đơn đặt hàng") (key `dat-mua-lk`, nhóm menu đơn +
  trả hàng) và **"Phiếu xuất"** (key `phieu-xuat`, nhóm "Xuất kho") — vẫn là CÙNG 1 `DatMuaLinhKienModule` (prop `section`
  chọn view mặc định: Phiếu xuất → `phieu-xuat-kho`, Đơn đặt hàng → đơn/trả hàng xem lần trước), mỗi mục có slot menu giai
  đoạn riêng (`stageMenuSlots.don/pxk`, Sidebar `stageMenuSlotRefs` — setter ổn định). Mọi lần điều hướng nội bộ gọi
  `onLeaveForceView(view)` → `mucChoView()` (App.tsx) đổi mục Sidebar theo view (PXK → Phiếu xuất). Quyền mục `phieu-xuat` =
  `canXemPxkTab` (TN/Kho/Kế toán/GS/KTV/Vệ tinh + Admin). Số trên mục: `navCount()` (navConfig.ts) — Phiếu xuất = choTnPxk +
  choKhoPxk + choKeToanPxk của badge, Đơn hàng = phần còn lại của `total` (= VIỆC CẦN LÀM theo vai trò, KHÁC "Tổng đơn hàng" = mọi
  đơn còn tồn trong phạm vi). Menu con CHỈ xổ dưới mục đang chọn (`section`). Tên menu: "Thiếu hàng" (thieu-lk), "Bảng giá",
  "Công nợ" (ton-kho-ktv).
- **Mục "Hàng trả" + tên menu rút gọn** (2026-09-30): desktop có mục Sidebar **"Hàng trả"** (key `tra-hang`, `desktopOnly`,
  sau "Thiếu hàng") = CÙNG `DatMuaLinhKienModule` `section="tra-hang"` (portal `stageMenuSlots.tra`), số = tổng đơn trả hàng chờ
  Kế toán/Kho/QC (Sidebar tự đếm từ `/don-hang-status-counts?loai_don=tra_hang`), 3 mục con Chờ kế toán/Chờ Kho/Chờ QC; bấm mục mẹ
  = lọc sentinel `__CHO_XAC_NHAN__` (`traHang.ts`). Mobile: không có mục riêng — cụm "Hàng trả" + 3 mục con nằm trong menu "Đơn
  hàng"; số "Đơn hàng" desktop trừ phần việc trả hàng KT/Kho/QC (`navCount(..., tachHangTra)`). Bước "Cho TN duyet tong" gộp vào
  **"Chờ tác nghiệp"** cùng đơn mua (sentinel `__CHO_TN__` ở `donHangListWhere` + counts); DonCuaToiTab mở `TraHangDetailModal` cho
  dòng trả hàng còn trong 4 bước duyệt riêng. Dòng trả hàng "Cho TN duyet tong" có nút Duyệt/Từ chối + chọn hàng loạt ngay trong danh sách
  (`laTraHangChoTn` ở `helpers.ts`; `bulkMutation` tách id trả hàng gửi `/tra-hang/bulk-log`, quá hạn 24h → hộp lý do chậm). Tên menu: Tổng / Chờ TBP / Chờ tác nghiệp / Chờ hàng / Chờ tạo phiếu / Từ chối /
  Duyệt trong ngày; Phiếu: Tổng phiếu / Chờ chuyển tiền / Chờ mã đơn hàng / Chờ mã MISA / Chờ kho in / Kho đã in / Chờ KTV nhận /
  KTV đã nhận / Hàng trừ kho / Kho đã kết thúc.
- **Tạo phiếu xuất kho trên điện thoại** (2026-09-30, `PhieuXuatKhoTab.tsx`): CÙNG 1 form (`body`) cho 2 vỏ — desktop `Modal` +
  bảng như cũ; mobile `TaoPxkMobileShell` (toàn màn hình `100dvh`, đăng ký `overlayStack` cho nút Back, thanh CTA dính đáy: số dòng
  + "Cần chuyển" + "Tạo phiếu") + dòng đơn dạng THẺ bấm cả thẻ để chọn. Tiền/loại chiết khấu từng dòng dùng chung helper
  `oTienTaoPxk()`/`loaiCkTaoPxk()` cho cả bảng lẫn thẻ — sửa 1 chỗ. Danh sách PXK có cột "Bằng chứng" (ảnh thu nhỏ, `BangChungAnhList nho`).
- **Bảng giá — KTV/Vệ tinh xem gọn: Giá NY + Giá KTV** (2026-10-11, v1.316, `DanhMucLinhKienModule.tsx` `ktvXem` = KTV/Vệ tinh
  không có quyền sửa/đặc thù). Nguyên văn: *"với tài khoản KTV, bảng giá không cần hiện thị các thông tin phức tạm như linh kiện
  chưa đánh giá, chỉ cần hiện danh sách linh kiện và các công cụ tìm kiếm => hiện giá KTV + giá niêm yết"* — GHI ĐÈ chốt
  2026-09-30 ("KTV chỉ thấy Giá NY"). Bảng chỉ còn Ảnh/Mã/Tên/Phân loại/Giá NY/Giá KTV; chỉ giữ ô tìm + lọc Phân loại; ẩn LK
  đang tắt, mã chờ xét duyệt/đã đổi mã, cảnh báo "chưa phân loại", các bộ lọc quản trị (Đặc thù/Only sửa chữa/Hiển thị/Cấm
  bán/Trạng thái mã) và tab "Từ khóa tìm kiếm"; drawer chỉ còn Mã/Giá NY/Giá KTV/Phân loại/ghi chú (ẩn Giá dự phòng/EU, xét
  duyệt mã, từ khóa, người cập nhật). Thẻ mobile hiện "NY … · KTV …". Cấu hình cột lưu khóa riêng `danh-muc-lk-ktv`. Excel vẫn
  chặn với KTV như cũ. API `/settings/linh-kien` không đổi. Preset "xem thử" ktv/ve_tinh/tram bật `xem_danh_muc_lk` như tài
  khoản thật (`viewAsPresets.ts`).
- **Nhận "Phân loại" đồng bộ ngược từ hệ Sửa chữa bảo hành** (2026-10-11, v1.317, `routes/suachuaPartner.ts`). Yêu cầu bên
  `gui-bao-hanh-linh-kien`: *"phân loại cho phép đồng bộ ngược về danh sách linh kiện app"* + *"chỉ đồng bộ ngược về với thông
  tin có thay đổi"*. `POST /api/suachua-partner/phan-loai {rows:[{ma_linh_kien, don_vi}]}` (≤500 dòng), xác thực `X-Sync-Key` =
  CHÍNH secret đồng bộ đã dùng chung `SUACHUA_SYNC_API_KEY` (không tạo key mới), gọi qua Service Binding `LINHKIEN_SERVICE` bên
  suachua. Chỉ UPDATE dòng có `don_vi` khác thật (điều kiện trong WHERE) + đặt `ngay_cap_nhat` mới → cron đồng bộ đẩy lại giá trị
  mới cho cả dvbh/suachua (nhất quán). Trả `cap_nhat` (số dòng đổi thật) + `khong_thay`. Thêm `/api/suachua-partner` vào
  `LA_API_DOI_TAC` (`lib/baoVe.ts`). Test local 2 Worker nối service binding: sai key → 401; dòng không đổi không bị ghi.
- **Menu "Phiếu đã in"** (2026-09-29): nhóm Xuất kho — "Đã chốt xong đơn xuất" = sentinel `CHOT_CHUA_IN` (chốt + chưa in),
  "Phiếu đã in" = `DA_IN` (chốt + đã in) — `DA_IN_COND`/`CHOT_CHUA_IN_COND` ở `phieuXuatKho.ts` (danh sách, xuất MISA,
  `/status-counts`). Lọc thường "Da chot xong don xuat" GIỮ NGUYÊN (cả 2) cho pipeline "Kho"/thẻ "Kho chốt đơn xuất"/báo cáo
  "Chờ kho gửi". Dòng PXK đã in KHÔNG còn tô nền (2026-10-15, §10 `DESIGN_GUIDELINES.md` — cột "In phiếu" chấm Đã in/Chưa in), cột "In phiếu" đứng trước "Người tạo".
- **API tồn kho cho DVBH** (2026-10-08, v1.304, `routes/partnerApi.ts`, X-API-Key như `case-timeline`): `GET /api/partner/v1/ton-kho/meta`
  (`phien_ban` = `updated_at` của `app_settings 'ktv_ton_kho_import_meta'`, giờ VN — chỉ đổi khi Kế toán import file MISA mới) và
  `GET /api/partner/v1/ton-kho?nguon=kho|ktv&after_id=&limit=` (con trỏ theo `id`, kèm `phien_ban` mỗi trang để bên kéo phát hiện import
  giữa chừng; `kho` = `kho_cong_ty_ton_kho` + tên kho, `ktv` = `ktv_ton_kho` + tên/khu vực KTV, `ma_ktv` NULL = mã kho chưa khớp KTV).
  DVBH kéo về theo giờ 8h–18h T2–T7 (module Ca thiếu linh kiện → cột "Tồn kho MB/MN"). Chỉ ĐỌC, không đổi dữ liệu.
  v1.305: thêm `GET /api/partner/v1/linh-kien/lich-su?ma=&limit=` (đơn gần nhất của 1 mã + ca gắn kèm + ticket thiếu hàng, trạng
  thái = log mới nhất) cho "Hồ sơ linh kiện" bên DVBH; index `idx_ddh_ma_lk` (migration 0072).
  v1.322: `GET /api/partner/v1/linh-kien/chi-tiet?after_ma=&limit=` (≤ 200, con trỏ theo mã) hoặc `?ma=A,B` (≤ 200 mã) — "API danh
  sách linh kiện chi tiết": mỗi LK kèm `anh` (≤ 10, `dsAnhLk`), `thay_the` (nhóm `lk_nhom_thay_the`), `combo` (combo chứa LK + thành phần),
  `tu_khoa` (`lk_tu_khoa`), `cong_no` (Giá KTV + từng KTV: tồn × giá KTV trừ SL "Công nợ 0 đồng" — CÙNG `SL_HO_TRO_0D_SQL` với màn Công nợ),
  `ton_kho` (kho công ty + kho KTV theo file MISA, `phien_ban_ton_kho`; KHÔNG trừ đơn TRỪ CÔNG NỢ sau mốc import). 7 truy vấn/trang, danh
  sách mã 1 bind JSON; index `idx_ktv_ton_kho_ma_hang` (migration 0078).
  v1.352: truy vấn tồn kho/thay thế/combo/từ khóa tách ra `lib/linhKienLienQuan.ts` (`docLienQuanLk`) — dùng CHUNG với drawer xem LK ở Bảng
  giá: `GET /api/settings/linh-kien/:ma/lien-quan` (tồn kho công ty tất cả xem; tồn KTV + công nợ theo `scopeKtvTonKho` — đã chuyển sang
  `lib/scopeDatMua.ts`, KTV chỉ thấy của mình; 30 đơn gần nhất + thống kê 30/90 ngày + ticket thiếu hàng mở theo `scopeDatMuaNguoiTao`).
  **Bấm "Mã LK" ở chi tiết đơn** (2026-10-22, v1.391 — "mở giao diện UI thông tin linh kiện giống trong bảng giá") mở CÙNG drawer này qua `XemLinhKienDrawer` (export ở `DanhMucLinhKienModule.tsx`, tự tải danh mục + tự tính quyền, không nút Sửa; `DonCuaToiTab` tải lazy) thay cho `LinhKienDetailModal` cũ.
  FE `danhMucLinhKien/LienQuanLk.tsx`: drawer rộng `max-w-2xl`, tab Tổng quan (ô số liệu nhanh + ảnh trái/thông tin phải) | Tồn kho | Đặt hàng
  (bấm mã đơn = `DonHangDetailModal`, drawer bỏ qua Esc khi đang mở) | Liên quan (bấm mã thay thế/thành phần combo = chuyển sang xem LK đó).
  v1.358 (2026-10-17, đối tác báo thiếu): 4 API DANH SÁCH để kéo về đồng bộ — `GET /api/partner/v1/lk-thay-the` (nhóm thay thế + thành viên,
  `?ma=`), `/v1/lk-combo` (`?ma=`, `?chi_bat=1`, kèm thành phần + giá NY tham khảo), `/v1/lk-tu-khoa` (từ khóa riêng + nhóm đồng nghĩa,
  `phien_ban` = `data_versions md_lk_tu_khoa`), `/v1/cong-no-ktv` (`?ma_ktv=&khu_vuc=&chi_tiet=1`, chi tiết tối đa 20 KTV). Mỗi API trả
  `phien_ban` (thay thế/combo = MAX(ngay_cap_nhat)#COUNT — đủ phát hiện xoá). Công nợ dùng CHUNG `docCongNoTongHop()` (`lib/congNoKtv.ts`,
  tách từ `ktvTonKho.ts GET /` — màn Công nợ + API cùng 1 truy vấn, sửa công thức 1 chỗ). Tài liệu: `docs/HUONG_DAN_API_DOI_TAC_LINH_KIEN_APP.md` §4.7–4.10.
  v1.359 (rà soát API, người dùng chọn bổ sung mảng thiếu hàng): `GET /v1/thieu-hang` (ticket Thiếu hàng đặt mua, mặc định còn mở; lọc mã/KTV/
  khu vực, `cap_nhat_tu` = log mới nhất sau mốc, con trỏ `after_id`; `kho_du_hang` = `donChoHangDuTonKho`) + `GET /v1/ton-kho-kha-dung?ma=`
  (theo mã × khu vực có kho công ty: tồn gốc − đơn đang giữ = CÙNG công thức `computeTonKhoChot` ở `lib/tonKhoCongTy.ts` nhưng 1 truy vấn cho
  nhiều mã — đổi quy tắc giữ hàng phải sửa cả 2). §4.11–4.12. Mảng CHƯA có API (người dùng chưa chọn): danh sách đơn/PXK theo KTV/thời gian,
  danh mục tham chiếu (loại đề xuất, lý do chậm, loại chiết khấu, danh bạ KTV kéo về), tài chính (quỹ, khoản chuyển tiền, Công nợ 0 đồng).
- **Đa ngôn ngữ VI/EN/ID** (2026-10-07, `frontend/src/i18n/`): kiểu gettext — khóa = CHÍNH câu tiếng Việt, `t("Đơn hàng")`, biến `t("{n} dòng", {n})`; câu chưa có bản dịch hiện tiếng Việt (dịch dần từng màn). Từ điển `en.ts`/`id.ts` (tải lười), chọn ngôn ngữ lưu localStorage `ngon-ngu` theo máy; nút `ChonNgonNgu` ở TopBar/Sidebar mobile/màn đăng nhập; đổi ngôn ngữ → `NgonNguGate` (main.tsx) remount App, không tải lại trang. Component dùng chung (Modal/Drawer/Tabs/KvRow/StatCard/Btn/Badge/cột bảng/Toast…) tự `tn()` chuỗi truyền vào. Hằng số `navConfig.ts` + `datMuaLinhKien/constants.ts` dịch lúc hiển thị (`trangThaiLabel`, `describeApiError`). CHỈ dịch nhãn giao diện cố định; KHÔNG dịch dữ liệu nghiệp vụ (tên LK, loại đề xuất, lý do chậm, khu vực, ghi chú) và file Excel/MISA. Câu mới → chạy `node frontend/scripts/kiem-tra-dich.mjs` (`--json` = danh sách thiếu) rồi thêm vào CẢ 2 từ điển. Đợt 1 (v1.296): shell + component dùng chung + đăng nhập; đợt 2 (v1.298–1.300): Trang chủ, Tạo đơn, Đơn hàng; đợt 3 (v1.301): Phiếu xuất (danh sách, chi tiết, bằng chứng/quỹ, xem ảnh, kho xuất/khu vực); đợt 4 (v1.302): Quỹ & chuyển tiền, Thiếu hàng, biểu đồ; đợt 5 (v1.303): Hàng trả, chuông thông báo, chi tiết case, ô kiểm tra Mã YCSC/Lada (nội dung thông báo do server ghi sẵn tiếng Việt — giữ nguyên) — các màn còn lại dịch tiếp theo đợt. KHÔNG gọi `t()` trong hằng số cấp module (chỉ chạy 1 lần, không đổi khi đổi ngôn ngữ) — đánh dấu `dichSau("…")` (trả nguyên câu, script kiểm tra tự thu khóa) rồi dịch lúc hiển thị `t(HANG[k])` (file hằng số cũ dùng `FILE_HANG_SO`); cùng chữ khác nghĩa dùng khóa ngữ cảnh `t("Từ||ngày")`; KHÔNG `t()` chuỗi gửi server (ghi chú, lý do gợi ý) hay khóa/tiêu đề cột file Excel.
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
`baoCaoScope()` với `/bao-cao-tong-the` (sửa scope 1 chỗ là đổi cả 2 — cố ý, để biểu đồ khớp bảng). **Giảm màu — nền trắng** (chốt 2026-10-15, `DESIGN_GUIDELINES.md` §10, THẮNG các chốt màu 2026-09-28): nền trang + Sidebar + KPI trắng, không tô nền hàng bảng (ưu tiên = vạch cam trái), tiền/tên người/Loại/loại chiết khấu chữ trung tính, trạng thái phụ dùng `Badge variant="dot"`/`StatusBadge phu`; màn Đơn hàng (thí điểm) bỏ dải "Cần làm". Font: `tokens.css` khai báo
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
- **Trang chủ — số trên thẻ phải khớp danh sách khi bấm** (2026-10-01): thẻ đếm việc CỦA CHÍNH người xem (GS/KTV: PXK
  Chờ tiền/Chờ KTV nhận theo `pxk.nguoi_nhan_hang = mình` — `countCuaToi`/`s_cho_tien`/`s_xac_nhan_nhan`) mang `nguoiNhanHang`
  = email mình để danh sách lọc đúng (trước đó GS thấy 2 nhưng mở ra cả khu vực 28). "Đơn bị từ chối" = sentinel
  `__TU_CHOI_CHUA_XEM__` (đơn mình tạo bị từ chối, `thong_bao_ktv` chưa đọc) + `loaiDon:"all"`.
- Tab **"Trang chủ"** (`TrangChuTab.tsx`) là view mặc định cho MỌI vai trò khi mở module (thay cho
  logic rẽ nhánh `defaultView` theo `canKho`/`canKeToan`/`canQC` cũ) — gộp cả nội dung "Báo cáo" cũ
  vào bên trong nó (tab "Báo cáo" riêng đã bỏ).
- QC (không phải Admin) bị **chặn xem báo cáo pivot toàn hệ thống** (`GET /bao-cao-tong-the` trả 403
  cho QC thuần) — đây là khắc phục trực tiếp 1 phát hiện trong `Ma_tran_kiem_soat_he_thong.xlsx`
  (sheet "5. Vấn đề phát hiện"), màn "báo cáo" thật của QC là tab Trả hàng ở bước "Cho QC xác nhận".

Khi sửa UI trong module này, đối chiếu lại `concept-1-structured-neutral.html` (nghiệp vụ/nhãn) và
`DESIGN_GUIDELINES.md` (màu/kiểu hiển thị) trước khi tự quyết định layout/nhãn/màu — tránh code lệch hướng đã chọn rồi phải sửa lại lần 2.

### Auth & vai trò

**Kế toán làm thay Tác nghiệp** (chốt 2026-10-15, v1.334 — "sau này sẽ cắt bỏ vai trò của TN trong việc duyệt phiếu => các chức
năng của TN đều cho phép KT thao tác thay được"): `keToanLamThayTn()` ở `middleware/loadUser.ts` cấp `la_tac_nghiep = true` cho
user Kế toán TRONG BỘ NHỚ request (cả "xem thử") → mọi `canTacNghiep`/`user.la_tac_nghiep` backend + frontend (qua `/auth/me`) tự
cho KT. Cột DB `users.la_tac_nghiep` KHÔNG đổi: thông báo việc theo vai trò (`emailsForRoleOrQC`, báo TN miền mới) vẫn chỉ gửi TN
thật; danh sách Users vẫn tách TN/KT; nhãn vai trò ở TopBar không thêm "TN". Chỗ phân nhánh KT/TN đã xét `canKeToan` TRƯỚC (đẩy
lại chuyển tiền, lọc mặc định PXK/Trả hàng, Danh sách KTV mode). SQL đọc vai trò người ghi log (đẩy lại đơn TN hủy) tính cả
`la_ke_toan`. Thêm kiểm tra quyền TN mới: dùng `canTacNghiep`/`user.la_tac_nghiep` như cũ là tự áp dụng cho KT.

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
`user_khu_vuc`). **Chốt 2026-10-15 (v1.329)**: gán Khu vực → xem TẤT CẢ các khu vực được gán, khớp theo email KTV HOẶC khu vực hiệu lực của chính đơn/PXK (`COALESCE(khu_vuc_chon, khu_vuc_ma)`); KHÔNG gán khu vực nào → xem TẤT CẢ (trước đó không thấy gì). Điều kiện chung `viewDonScopeSql`/`viewPxkScopeSql`/`VIEW_CHUA_GAN_KHU_VUC_SQL` (`scopeDatMua.ts`) — dùng ở scope đơn/PXK, 3 nhánh Thiếu LK, Công nợ (`ktvTonKho.ts`), Quỹ (`phamViXem`), báo cáo tốc độ xử lý. `App.tsx`
tự cấp module `dat-mua-lk`/`thieu-lk`/`tra-hang` cho `la_view` giống các cờ nghiệp vụ khác. **View xem full các menu** (chốt 2026-10-14, v1.326): View vào MỌI màn như Mua hàng — Đơn hàng (danh sách Mua/Công nợ + menu Tổng/Chờ…, Hàng trả: `canXemDonMuaCongNo`/`canTraHangView` ở `DatMuaLinhKienModule.tsx` — thiếu thì danh sách rơi về lọc loại "mua", tìm đơn CÔNG NỢ theo Mã YCSC ra rỗng), Phiếu xuất (`canXemPxkTab`), Quỹ & chuyển tiền (`phamViXem()` ở `quyKtv.ts` = KTV thuộc Khu vực được gán; không có tab KH lẻ), Bảng giá — CHỈ ĐỌC (`requireDatMuaLkArea` chặn ghi), dữ liệu đơn/PXK/quỹ VẪN theo Khu vực được gán.

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
đơn/PXK/trả hàng + lọc cột Excel đọc thẳng cột này. Báo cáo tốc độ xử lý vẫn theo email KTV. Badge (`getDatMuaLkBadge`) cache theo version — đổi `user_khu_vuc` không làm mới ngay.

**Đơn "TRỪ CÔNG NỢ"** (chốt 2026-09-28): không đối chiếu công nợ (không cộng công nợ phát sinh) và không đối
chiếu/giữ tồn kho công ty — đối chiếu **tồn kho của chính KTV nhận hàng** (`lib/tonKhoKtv.ts`: cuối kỳ file MISA −
SL các đơn TRỪ CÔNG NỢ tạo sau mốc import, chưa từ chối/hủy; trừ ngay từ lúc tạo đơn). Đủ tồn → tự duyệt, thiếu →
giữ "Chờ TN duyệt". Chính sách mặc định "Trong CSBH" (2026-10-08, `chinhSachMacDinh()` backend + bản sao FE `helpers.ts`; tạo tay + import Excel, vẫn sửa được). TN có Hủy/Từ chối/Chờ hàng cho mọi đơn chưa vào PXK ("Chờ TN duyệt" và "TN đã duyệt").
Chốt 2026-09-29: file MISA Bán hàng/Xuất kho của dòng TRỪ CÔNG NỢ trừ **kho của KTV** (mã kho = mã MISA KTV, `misaExport.ts`)
thay vì kho công ty theo miền (chốt 2026-09-30: dòng TRỪ CÔNG NỢ gợi ý mẫu **Bán hàng** theo `settings_loai_de_xuat.loai_file_xuat_misa`, KHÔNG theo quy tắc "PXK công nợ → Chuyển kho" — `resolveTemplate(..., loaiDeXuat)`; ép "MISA Chuyển kho" thì BỎ dòng TRỪ CÔNG NỢ khỏi file + cảnh báo `boQuaTruCongNo`, vì Chuyển kho sẽ chuyển ngược hàng KTV về kho công ty. Nghiệp vụ: KTV chuyển tiền mua LK đang giữ công nợ → Kế toán duyệt → giảm công nợ KTV đúng LK đó — Kế toán chỉ dùng file
Bán hàng; trên app: **Công nợ chốt = thực tế + phát sinh − đã trừ**, "đã trừ" = `gia_tri_cong_no` × SL của đơn TRỪ CÔNG NỢ tạo
sau mốc import mà PXK đã `trang_thai_chuyen_tien='TN da duyet'`, phiếu không hủy — `computeCongNoDaTru()`/`CONG_NO_DA_TRU_*_SQL`
ở `lib/congNoKtv.ts`, dùng chung cho `computeCongNoChot` (đánh giá công nợ lúc tạo đơn) + màn Công nợ `ktvTonKho.ts GET /`); PXK mà MỌI dòng đều TRỪ CÔNG NỢ → Kế toán "Đã chốt xong đơn xuất" xong hệ thống TỰ chuyển
"Hang tru kho" (không đẩy khovan, không báo việc cho Kho — `hangTruKhoTuDong` ở `POST /phieu-xuat-kho/:id/log`); phiếu lẫn dòng
khác đi như cũ. Kế toán cũng tự chọn được **"📦 Hàng trừ kho"** ngay ở bước "Chờ mã MISA" (2026-10-12, v1.319, `keToanTruKho` ở `POST /phieu-xuat-kho/:id/log` `trang_thai='Hang tru kho'` từ "Cho ke toan"): cùng điều kiện như "Đã chốt xong đơn xuất" (Kế toán/Admin, có Mã MISA, không áp trả hàng), ghi 2 log 'Da chot xong don xuat' + 'Hang tru kho' rồi kết thúc phiếu — không đẩy khovan, không báo việc Kho, báo KTV. Đơn **có "Yêu cầu hóa đơn"** (khác trống/"Không", TRỪ "HĐ - Xuất cho trạm" = `Yêu cầu hóa đơn (xuất cho Trạm)` vẫn chiết khấu bình thường — `coYeuCauHoaDon()` ở `pxkRecalculate.ts`, bản sao FE `LoaiChietKhau.tsx`) tính GIÁ NIÊM YẾT,
nhãn `KHONG_CK`, không Đình tủ/bậc thang/giá KTV/dự phòng (vẫn cộng vào tổng ngày; giá chốt tay vẫn thắng). Loại đề xuất chứa
"HỖ TRỢ" bắt buộc Mã YCSC (`maYcscRequired()` — backend + bản sao FE).

**TN đẩy lại đơn đã hủy / từ chối trong 24h** (chốt 2026-10-05, `POST /dat-mua-lk/don-hang/:id/day-lai` {ghi_chu?}): TN/Admin đưa
đơn "Da huy"/"TN tu choi" DO TN HỦY/TỪ CHỐI (log cuối của người có `la_tac_nghiep`/Admin, "Da huy" phải từ bước của TN — loại đơn
người tạo/KTV tự hủy, Trạm/TBP từ chối; else `KHONG_PHAI_TN_HUY_TU_CHOI`; KHÔNG áp dụng trả hàng) về **"Cho TN duyet"** khi chưa quá 24h kể từ log hủy/từ chối (`dayLaiHanSql()` →
cột `day_lai_han` ở danh sách + chi tiết đơn; FE `dayLaiDuoc()` ở `helpers.ts`). Log "Cho TN duyet" mới reset hạn lý do chậm. Không
khôi phục hậu quả cũ: ticket thiếu LK đã đóng giữ nguyên, tiền đã trả đã về quỹ; đơn `bat_buoc_chuyen_tien` gom LẠI vào phiếu đang tạo
(`bundleAutoApprovedIntoPxk`), đơn còn `ma_xuat_kho` của phiếu "Ke toan huy" bỏ liên kết, còn trong phiếu khác → `DON_CON_TRONG_PHIEU`;
gọi `taiTinhPxkMoCuaKtv`. Người nhận bị tắt → `NGUOI_NHAN_HANG_DA_TAT`. Thông báo người tạo loại `mo_lai`. UI: nút "↩" trên dòng danh
sách + "↩ Đẩy lại chờ duyệt" (kèm ghi chú) ở footer chi tiết đơn. **Mở rộng 2026-10-16 (v1.353)**: đẩy lại được MỌI đơn bị NGƯỜI KHÁC hủy/từ chối (Kho từ chối ticket thiếu hàng → đơn tự hủy, TBP/GS/Trạm từ chối, TN/Kế toán/Admin hủy) — `dayLaiHanSql` chỉ loại đơn do chính người tạo / người nhận hàng tự hủy (trừ khi họ là TN/Kế toán/Admin); vẫn 24h, vẫn về "Cho TN duyet". Nút "↩ Đẩy lại đơn gốc" cũng có trong Drawer ticket thiếu hàng (v1.354, `ThieuLkTab.tsx`) — `GET /thieu-lk/:id` trả `ddh_trang_thai`/`ddh_day_lai_han` (cùng `dayLaiHanSql`), gọi chung `POST /don-hang/:id/day-lai`. **Đẩy lại TICKET** (chốt 2026-10-16, v1.355, `lib/dayLaiThieuLk.ts` — "đẩy ticket lại trạng thái trước khi bị từ chối => đơn gốc cũng đẩy ngược lại theo ticket"): `POST /thieu-lk/:id/day-lai` (TN/Kế toán/Kho/Admin) — ticket "Da huy bo" (ticket MỚI NHẤT của đơn) ghi thêm log = trạng thái MỞ cuối cùng trước đó, đơn gốc "Da huy" (bị hủy ngay sau "Cho hang", không do chính người tạo/nhận tự hủy) về "Cho hang" + rút lại từ quỹ đúng số trigger đã hoàn lúc hủy (giao dịch `hoan_phieu` "Hoàn tiền đã thanh toán của đơn <id> (…", tối đa số dư) vào `tien_da_tra`; 24h kể từ lúc ticket đóng (`hanDayLaiTicketSql`). `POST /don-hang/:id/day-lai` TỰ chuyển sang phục hồi theo ticket khi `ticketDayLaiCuaDon()` có (đơn về Chờ hàng, không về Chờ TN duyệt). Drawer ticket: nút "↩ Đẩy lại ticket" (ưu tiên) / "↩ Đẩy lại đơn gốc". Không báo sang khovan.
**GS khu vực hủy hộ đơn cho KTV** (chốt 2026-10-23, v1.399 — "cho phép giám sát khu vực hủy hộ đơn cho ktv khu vực mình"): `applyDonHangLog` `gsHuyHo` = người thao tác `vai_tro='Giam sat'` VÀ là `email_gs` của đơn (GS khu vực hiện tại của KTV nhận) → hủy được NHƯ chính người tạo (mọi bước người tạo hủy được + tự hủy đơn tự duyệt trong phiếu chưa thao tác, `pxkDuocTuHuy`); bắt buộc lý do, log "GS hủy hộ KTV: …", thông báo người tạo như thường. Bản sao FE `actionsFor` (`helpers.ts`, ctx `laGs`). **v1.400** ("cho phép hủy hộ đơn hàng do KTV thuộc khu vực của giám sát đặt hàng"): GS cũng hủy hộ được đơn do KTV thuộc khu vực mình TẠO (`users.giam_sat_quan_ly` của `nguoi_tao` — cột `gs_nguoi_tao` ở danh sách + chi tiết đơn), kể cả khi người nhận ở khu vực khác. Chưa mở cho GS theo "Khu vực xem thêm".
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
**Người tạo hộ / GS xác nhận chuyển tiền thay KTV** (chốt 2026-10-21, v1.379 — "cho phép người tạo hộ đơn (hoặc giám sát) up ảnh bằng chứng chuyển tiền và xác nhận chuyển tiền thay cho KTV đặt hàng"): `POST /phieu-xuat-kho/:id/bang-chung-chuyen-tien` + `PATCH /:id/chuyen-tien` "KTV da chuyen" dùng `duocXacNhanChuyenTienHo()` (`phieuXuatKho.ts`) = người nhận hàng / Admin / TN / Kế toán (như cũ) + NGƯỜI TẠO 1 đơn trong phiếu hoặc GS của đơn (`dat_don_hang.email_gs`) — trước đó họ thấy form nhưng bấm "Đã chuyển" bị `FORBIDDEN_ROLE`.
**Rút lại xác nhận để sửa / hủy ảnh bằng chứng up nhầm** (chốt 2026-10-21, v1.381 — "thêm nút hủy ảnh bằng chứng khi ktv up ảnh xong nhưng bị up nhầm (trước khi kế toán duyệt)"): `PATCH /phieu-xuat-kho/:id/chuyen-tien` {trang_thai:"Cho KTV chuyen", `rut_lai`: true} — chỉ từ "KTV da chuyen" (Kế toán chưa duyệt), phiếu chưa hủy, cùng quyền `duocXacNhanChuyenTienHo`; GIỮ ảnh + ghi chú, không ghi `khoan_chuyen_tien`, không bắt lý do, log 'Da yeu cau KTV chuyen tien' "Rút lại xác nhận…", CAS `lenhKhoaTrangThaiChuyenTien`. Form bằng chứng hiện lại → ✕ bỏ ảnh sai, thêm ảnh đúng, "Đã chuyển" lại. Nút "↩ Sửa / hủy ảnh bằng chứng" (`RutLaiBangChungButton`, `BangChungChuyenTien.tsx`) ở chi tiết PXK (người nhận / người tạo hộ / GS của đơn — Kế toán, TN dùng nút từ chối/đẩy lại riêng) + khối PXK trong chi tiết đơn của KTV.
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
mới phải gọi); tab Khoản chuyển tiền gắn nhãn phiếu đã hủy THEO TIỀN THỰC TẾ (sửa 2026-10-23, v1.398 — PMH-001137 trước ghi "tiền về quỹ" nhưng tiền đã đi theo đơn sang PMH-001168): `GET /quy-ktv/khoan-chuyen` trả `huy_tien_ve_quy` (tổng `hoan_phieu` của phiếu), `huy_don_giu_tien` (đơn còn `tien_da_tra_pxk` = phiếu), `huy_sang_phieu` (phiếu có log 'Da them don vao phieu' "… ở phiếu <id> →" do `lenhNhanTienDaTraDon` ghi — đổi câu log đó phải sửa điều kiện LIKE) → `TienPhieuHuy` ở `QuyChuyenTienModule.tsx`. Phạm vi `phamViXem()`: Admin/Kế toán/TN xem tất cả, KTV xem
của mình, Vệ tinh xem quỹ của Trạm — khớp điều kiện cấp menu ở `App.tsx`. **Giám sát xem Quỹ** (chốt 2026-10-21, v1.380 — "ngoài vai trò kế toán, danh sách quỹ sẽ chỉ hiện quỹ theo tài khoản do giám sát đó quản lý"): menu "Quỹ & chuyển tiền" thêm vào `ROLE_MODULES["Giam sat"]` (`navConfig.ts`); `phamViXem()` nhánh `vai_tro='Giam sat'` = tài khoản có `users.giam_sat_quan_ly` = GS + KTV thuộc Khu vực xem thêm (`user_khu_vuc`) + chính GS; FE `xemNhieuNguoi` (tab Số dư quỹ, lọc người), không có tab KH lẻ, chỉ xem.
**Tiền ngoài vào quỹ** (chốt 2026-10-22, v1.382, migration `0095` — "cho phép kế toán tự thêm khoản tiền chuyển ngoài cho KTV (tạo thủ công hoặc import hàng loạt - import sẽ theo mã misa hoặc ID KTV làm chuẩn ...) ví dụ đầu tháng ... KTV bị trừ lương ... tạo thành quỹ"): bảng `khoan_tien_ngoai` (chủ quỹ email — Vệ tinh → quỹ Trạm, mã KTV, mã trong file, số tiền > 0, nội dung, ngày chứng từ, nguồn thu_cong/import, tên file, `lo_id`, Da ghi/Da huy) + cột `quy_ktv_giao_dich.khoan_tien_ngoai_id` (sổ quỹ ghi loại `dieu_chinh` — không rebuild CHECK; FE nhãn "Tiền ngoài vào quỹ"/"Hủy tiền ngoài"). Routes `quyKtv.ts` (Kế toán/Admin = `coTheDieuChinh`): GET `/tien-ngoai/ktv` (danh bạ KTV + `quy_email` + số dư — ĐỐI CHIẾU LÀM Ở TRÌNH DUYỆT), GET `/tien-ngoai` (lọc q/từ-đến/trạng thái/nguồn, theo `phamViXem`), POST `/tien-ngoai` {lo_id, nguon, ten_file, items ≤ 50} = cả lô 1 batch (CAS `quy_cas_guard` theo `lo_id` → `LO_DA_GHI` chống gửi 2 lần; INSERT khoản ngay trước lệnh ghi sổ để `lenhGhiQuy(..., khoanTienNgoaiSql: "last_insert_rowid()")`) rồi `phanBoQuy` từng email, POST `/tien-ngoai/:id/huy` {ly_do} (trừ lại khỏi quỹ, thiếu → `QUY_KHONG_DU`). FE `modules/quyChuyenTien/TienNgoai.tsx` (tab "Tiền ngoài vào quỹ"): thêm thủ công, file mẫu, import Excel/CSV (CSV đọc dạng chuỗi UTF-8) → màn "Kiểm tra trước khi import": khớp Mã MISA trước rồi Mã KTV (cột Mã MISA / Mã KTV / Mã chung; nhiều mã cùng MISA ưu tiên mã đang bật có Gmail, còn mơ hồ → bắt chọn tay), chọn lại KTV từng dòng, sửa số tiền, nội dung chung cho dòng trống, lọc Sẵn sàng / Cần kiểm tra / Lỗi / Đã bỏ chọn + tìm + khu vực, cảnh báo (trùng KTV trong file, tên trong file khác, chọn tay, Vệ tinh → Trạm, tài khoản tắt), lỗi chặn (chưa khớp, chưa có Gmail/quỹ, số tiền, thiếu nội dung); gửi theo lô 50, lỗi giữa chừng thì dòng đã ghi được đánh dấu không gửi lại.
**Phiếu hoàn tiền quỹ** (chốt 2026-10-19, v1.364, migration `0090`, `lib/phieuHoanTien.ts`, FE `modules/quyChuyenTien/PhieuHoanTien.tsx`) — "KT tạo phiếu hoàn tiền => tiền tạm giữ khỏi quỹ => KTV xác nhận => tiền bị trừ khỏi quỹ. KTV từ chối => đẩy về KT xác nhận...": Kế toán/Admin tạo phiếu `HT-…` (`POST /quy-ktv/phieu-hoan-tien`, quỹ phải đủ — `QUY_KHONG_DU`) → TẠM GIỮ = trừ `quy_ktv.so_du` NGAY trong cùng batch (giao dịch `hoan_tien_ktv` có cột mới `quy_ktv_giao_dich.phieu_hoan_tien_id`; CHECK so_du ≥ 0 rollback cả batch) nên tiền tạm giữ không bị `phanBoQuy()` trả phiếu xuất. Trạng thái: "Cho KTV xac nhan" → chủ quỹ (người nhận hàng; Vệ tinh = Trạm — CHỈ chính chủ, Admin không làm thay) "Đã nhận tiền" = "Da hoan tien" (không ghi thêm giao dịch) | "Từ chối" = "Cho KT xac nhan" → Kế toán "Xác nhận hủy" = "Da huy" (trả lại tiền: `dieu_chinh` + rồi `phanBoQuy`) | "Từ chối, đẩy lại KTV" = về "Cho KTV xac nhan"; Kế toán "Hủy phiếu" khi còn chờ KTV (tạo nhầm). Mọi bước ghi chú TUỲ CHỌN, log `phieu_hoan_tien_log`; CAS trạng thái (`quy_cas_guard`) chống bấm 2 lần → 409 `TRANG_THAI_DA_DOI`. `POST /:id/xu-ly {hanh_dong}`; nút theo `hanh_dong` backend trả (`hanhDongDuoc`). Thông báo: chuông loại/link_type `phieu_hoan_tien` + push `/?hoan_tien=<id>` (KT thao tác → báo KTV; KTV thao tác → người tạo + mọi Kế toán) → App.tsx mở Quỹ › tab "Hoàn tiền" + chi tiết (prop `moPhieuHoanTien`). Badge mục "Quỹ & chuyển tiền" = `hoanTienCanXuLy` ở `/notifications/count` (`demHoanTienCanXuLy`). "Hoàn tiền cho KTV" trừ thẳng qua `/dieu-chinh` CHỈ còn cho KH lẻ (không có tài khoản xác nhận; KTV → 409 `DUNG_PHIEU_HOAN_TIEN`), modal Điều chỉnh của KTV tạo phiếu thay. Số dư quỹ: cột "Tạm giữ hoàn tiền" + nút "Hoàn tiền"; Sổ quỹ hiện nhãn Tạm giữ / Hoàn tiền cho KTV / Trả lại tiền tạm giữ theo trạng thái phiếu.
**Bỏ đơn khỏi phiếu đã có tiền — tiền theo đơn** (2026-09-30, migration `0056`): `DELETE /phieu-xuat-kho/:id/dong/:donHangId`
CHẶN khi phiếu đã có `ma_misa` (`DA_CO_MA_MISA`). Phiếu `da_thanh_toan > 0` → FE (`PxkDongDonHangTable`) hỏi TN: "Đơn chưa
thanh toán" (như cũ: tổng giảm, trả thừa hoàn quỹ) / "Đơn đã thanh toán" (`?giu_tien=1`): tiền của dòng (`tienUocTinhTheoDong`,
tối đa phiếu đã trả) RÚT khỏi `da_thanh_toan` của phiếu, nằm ở `dat_don_hang.tien_da_tra` (+ `_email` chủ quỹ, `_pxk`), đơn về
"Chờ tạo phiếu" (cột chuyển tiền theo đơn = Đã thanh toán). Đơn vào phiếu mới (tạo tay, thêm dòng, tự gom) → `lenhNhanTienDaTraDon()`
cộng vào `da_thanh_toan` phiếu mới trong CÙNG batch với INSERT dòng — thêm đường đưa đơn vào phiếu mới phải gọi nó. Đơn mang tiền bị
từ chối/hủy, đổi người nhận hoặc sang Trả hàng → TRIGGER `trg_ddh_hoan_tien_da_tra` hoàn về quỹ (mọi đường ghi).
**Chuyển tiền TRƯỚC khi duyệt** (chốt 2026-09-30, migration `0057`): đơn Mua / TRỪ CÔNG NỢ TẠO MỚI có giá bán × SL > 0 vào phiếu
NGAY lúc tạo dù chưa tự duyệt (`bundleAutoApprovedIntoPxk`), cột `dat_don_hang.bat_buoc_chuyen_tien = 1` (đơn cũ = 0, giữ quy
tắc cũ). Không gộp vào phiếu Kế toán đã duyệt tiền ('TN da duyet') hay đã có mã MISA → tạo phiếu mới. **Lịch sử phiếu ghi LÝ DO gom** (2026-10-23, v1.395 — "lịch sử xử lý của phiếu chưa rõ ràng lý do phiếu được tạo"): `bundleAutoApprovedIntoPxk` (`lib/pxkAutoBundle.ts`) ghi log tạo phiếu "Hệ thống tự tạo phiếu để gom đơn: …" (hoặc log 'Da them don vao phieu' "Hệ thống tự gom vào phiếu đang tạo: …" khi gộp vào phiếu có sẵn), mỗi đơn 1 dòng = mã đơn (mã LK · tên xSL) + trạng thái (đã duyệt / chờ chuyển tiền / chờ duyệt cần chuyển tiền trước / QC đồng ý trả hàng) + dòng đầu ghi chú log đơn MỚI NHẤT (lý do tự động: đủ hàng, hàng về, đổi khu vực…) — `moTaDonVaoPhieu()`. Thêm luồng tự động mới: ghi lý do vào `dat_don_hang_log` TRƯỚC khi gom là log phiếu tự có. "Gửi kế toán" chặn
`DON_CHUA_DUYET` khi phiếu còn đơn khác 'TN da duyet' — TN tự bỏ ra (chọn "Đơn đã thanh toán" để giữ tiền), đơn giữ trạng thái
thật. Đơn chưa duyệt trong phiếu bị hủy/từ chối (TN/KTV/Trạm/TBP) → tự rời phiếu (`pxkChuaDonChuaDuyet` + `goDonKhoiPxk`); chuyển
"Chờ hàng" → rời phiếu MANG THEO tiền (`goDonKhoiPxk(..., giuTien)`/`lenhMangTienDon`). Đơn cờ này CHỈ "Chờ hàng" được khi đã
chuyển tiền = `THANH_TOAN_DON_SQL` 'da_thanh_toan' (Kế toán xác nhận tiền phiếu chứa đơn, hoặc đơn mang tiền) — else
`CHUA_CHUYEN_TIEN_KHONG_CHO_HANG` (`chuaChuyenTienChoHang`). PATCH đổi `loai_don` khi đơn trong phiếu "Dang tao phieu" → gỡ khỏi phiếu.
Phiếu Kế toán ĐÃ duyệt tiền mà tổng mới ≤ `da_thanh_toan` (đơn rời phiếu) → GIỮ "Kế toán đã duyệt", thừa hoàn quỹ (`taiTinhPxk`
`giuDaDuyet` — Kế toán xác nhận = xác nhận bằng chứng khớp số tiền, tiền thật không đổi). Cùng quy tắc cho phiếu "KTV da chuyen" (2026-10-23, v1.397, PMH-001168 "sao tiền lại cứ tự động sửa giá tiền"): thêm đơn MANG SẴN tiền (tổng + đã trả cùng tăng) mà vẫn đủ → GIỮ "KTV da chuyen" chờ Kế toán (`giuChoKeToan`), log 1 dòng "phiếu đã thanh toán …, đủ tiền" thay vì cặp "đặt lại Chờ KTV chuyển" + "Trừ quỹ dư" mỗi lần thêm đơn. TN/Admin **"Trả bằng quỹ dư"** cho đơn
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
KHÔNG dạng canvas (canvas chậm ~1s/lần). Số đã lưu ở DB chỉ hiện TẠM — máy nào mở cũng tự đọc lại, số mới thắng (trừ khi đọc lại ra null); quyết định cuối ở `quyetDinhSoTien()` (thuần, test được trên node với tesseract.js + sharp). Nhãn tiền tìm tối đa 3 dòng phía trên; nhóm số không được nối tiếp chữ số ("30 9 2026" từng thành 9.202đ); lần 1 không ra số mà có dòng chữ số TO → cắt dòng đó đọc 2 lần, khớp mới nhận (VCB "VND" nhỏ dính vào số). UI chung `datMuaLinhKien/DocTienAnh.tsx` (`useDocTienAnh`/`TienDocTuAnh`).
**Xem ảnh nhanh** (2026-09-30, `datMuaLinhKien/XemAnhNhanh.tsx`): trình xem dùng chung — ảnh trái, thông tin phải (OCR, mã HĐ, mã PXK,
người chuyển, ngày, trạng thái xác nhận, tiền), ‹ › / ← → / vuốt, Esc. `BangChungAnhList` prop `onXem`; danh sách (Quỹ › Khoản chuyển
tiền, cột Bằng chứng PXK) dựng MỌI ảnh của trang đang xem (chuyển xuyên dòng); chi tiết PXK/đơn dùng `BangChungAnhPxk`
(`anhXemCuaPxk`). `GET /phieu-xuat-kho` trả thêm `bang_chung_tien_doc`/ghi chú/lý do từ chối/`ngay_ktv_chuyen` (bỏ khỏi file tải về).
Khung phải = 3 khối **Đối soát tiền** (OCR ảnh này, tổng OCR ảnh của lần chuyển — bỏ ảnh đã ghi nhận trước, so với "Kế toán xác nhận"
hoặc "Còn phải chuyển" → Khớp/Lệch + nhắc nhở; đọc lại trên máy qua `useDocTienAnh`, không gọi server) / Chứng từ / Ghi chú.
**Kết quả OCR dùng chung mọi máy** (migration `0058`, bảng `ocr_anh_tien` theo URL ảnh + `phien_ban`): `useDocTienAnh` hỏi `GET /api/quy-ktv/ocr-anh` trước (1 request/lô), ảnh chưa có thì đọc trên máy rồi `POST` gộp lô (lỗi mạng/CORS không ghi; phiên bản cũ không ghi đè). **Sửa bộ đọc/chọn số → TĂNG `PHIEN_BAN_OCR`** (`lib/docTienAnh.ts`) để kết quả cũ bị bỏ qua, máy đầu tiên đọc lại + ghi đè. Số kèm PXK/khoản (`bang_chung_tien_doc`/`tien_doc_anh`) chỉ hiện tạm. `lib/docTienAnh.ts` nhận đơn vị TRƯỚC số ("VND 310,000" Techcombank)
+ nhãn "chuyển thành công".
**TN đẩy lại chuyển tiền** (2026-09-30): `PATCH /phieu-xuat-kho/:id/chuyen-tien` `trang_thai:"Cho KTV chuyen"` mở cho TN khi "KTV da
chuyen" (KTV xác nhận nhầm/thiếu) — KHÔNG ghi `khoan_chuyen_tien` (sổ của Kế toán), log 'Da yeu cau KTV chuyen tien', lý do lưu tiền tố
"(TN)" (FE hiện "Tác nghiệp trả lại"). **Mã đơn hàng phiếu đã hủy**: `ma_xuat_kho` UNIQUE → `giaiPhongMaPhieuHuy()` (tạo phiếu có mã,
PATCH `/:id/ma-xuat-kho`) trả mã của phiếu "Ke toan huy" về ID của nó (+ log) để phiếu mới dùng lại; phiếu còn hiệu lực vẫn chặn.
**Ticket thiếu hàng ra đơn gốc**: `GET /don-hang` trả `tlk_ngay_du_kien/tlk_ngay_hang_ve/tlk_tiep_nhan_luc/tlk_nguoi_tiep_nhan`
(`THIEU_LK_DON_COT`, ticket MỚI NHẤT) → cột "Dự kiến có hàng" sau "Ngày đề xuất"; chi tiết đơn hiện Kho tiếp nhận/Dự kiến/Hàng về.
**Lịch sử xử lý** 4 màn (đơn/PXK/thiếu hàng/trả hàng) dùng `LogTieuDe` + `useTenNguoiLog` (`SharedUi.tsx`): "NGƯỜI thao tác + hành động
+ [trạng thái kết quả]" (dòng cuối = tạo). **Đổi chiết khấu nhiều đơn**: `PxkDongDonHangTable` ô chọn + "Chọn tất cả"/"chọn cùng loại"
→ `DoiLoaiChietKhauNhieuDon`; popup 1 đơn có "Áp dụng cho cả N đơn khác" (`dongKhac`) — cùng `doiLoaiChietKhauCacDon()` (gọi tuần tự
endpoint 1 đơn; "Có" = giá theo công thức `giaGoiY`).

**Phân loại linh kiện + kho "Máy"** (chốt 2026-09-30, migration `0059`): "Phân loại" = cột `linh_kien.don_vi` (listdown tự do).
BẮT BUỘC khi tạo (`POST /settings/linh-kien`, `/lk-settings/danh-muc`, import mã mới → `ma_moi_thieu_phan_loai`), khi xác nhận mã
(`/xac-nhan` nhận `phan_loai`, LK chưa có → `THIEU_PHAN_LOAI`), PATCH không xoá được. LK gia88 đồng bộ về chưa có phân loại →
Bảng giá hiện cảnh báo + bộ lọc "Chưa phân loại"; bấm ô "Phân loại" trong bảng = chọn nhanh/gõ phân loại mới, lưu ngay (`danhMucLinhKien/PhanLoaiNhanh.tsx`, người có quyền sửa LK). Phân loại **"Đình tủ"** (chiết khấu 15%) so qua `laDinhTu()` (`pxkRecalculate.ts`, không dấu/hoa-thường); migration `0062` gộp "Đỉnh tủ" gõ nhầm + trigger `trg_linh_kien_dinh_tu_i/u` quy mọi biến thể về "Đình tủ". File MISA: dòng LK phân loại "Máy" (`laPhanLoaiMay`) dùng kho ký gửi KRF theo
miền (`app_settings.misa_ma_kho_may_mien_*`, Cài đặt › Mã kho mặc định) thay kho công ty — ở cột "Mã kho" (Bán hàng/Xuất kho)
và "Nhập tại kho" (Chuyển kho); dòng TRỪ CÔNG NỢ vẫn trừ kho KTV. Chốt 2026-10-01: cột ĐVT để TRỐNG ở mọi mẫu; dòng TRẢ HÀNG (`laDongTraHang`: PXK
`loai_don='tra_hang'` hoặc loại đề xuất chứa "TRẢ HÀNG", so không dấu) → "Xuất tại kho"/Mã kho = `NTMN`/`NTMB` theo miền, Diễn giải
"6803 NTMN -Nhận lại linh kiện ký gửi của <Tên MISA>" (MB: "6804-MB NTMB -…") — `KHO_NHAN_TRA`; "TRẢ HÀNG CÔNG NỢ" mọi cột tiền = 0. Dòng LK "Máy" có loại đề xuất chứa "CÔNG NỢ"/"HỖ TRỢ" (trừ trả hàng + TRỪ CÔNG NỢ — `laXuatMayDoiBaoHanh()`) → Diễn giải mọi mẫu = "Kho <Tên MISA KTV nhận> xuất máy mới đổi bảo hành cho khách hàng <tt_khach_hang> <tt_mail_duyet>".

**Nút tải MISA** (2026-10-05): mẫu `xuat_kho` hiển thị là **"MISA CN, hỗ trợ"** (`MISA_TEMPLATE_LABELS` ở
`frontend/src/lib/misaExportTemplates.ts` — nhãn nút, tên sheet trong file, ô chọn ở Cài đặt › Loại đề xuất; mã nội bộ vẫn
`xuat_kho`). Chi tiết PXK chỉ hiện nút mẫu ĐỀ XUẤT (`misaTemplateDeXuat` = `resolveMisaTemplateDeXuat`), nút mũi tên ▸ mở 2 mẫu còn
lại (`moMauMisaKhac` theo id phiếu); không có mẫu đề xuất thì hiện cả 3. Nút tải gộp ở danh sách PXK vẫn hiện đủ 3.

**Mẫu đề xuất + diễn giải MISA theo file "Diễn giải hệ thống misa.xlsx"** (chốt 2026-10-05, `lib/misaExport.ts`, migration `0068`):
`resolveTemplate` BỎ quy tắc "phiếu công nợ luôn Chuyển kho" — theo `settings_loai_de_xuat.loai_file_xuat_misa` (CÔNG NỢ / HỖ TRỢ * /
TG12 = `xuat_kho` "CN, hỗ trợ"; chưa cài: công nợ → Chuyển kho, mua → Bán hàng; trả hàng LUÔN Chuyển kho; TRỪ CÔNG NỢ chỉ Bán hàng /
CN, hỗ trợ). Diễn giải 2 mẫu Bán hàng / CN, hỗ trợ: MUA DỰ TRỮ "<kho> bán hàng <Tên MISA> MDT" (mua khác không có MDT); TRỪ CÔNG NỢ
"<mã MISA KTV> xuất trừ kho kí gửi cho KTV <Tên MISA>"; ĐƠN CÔNG NỢ (loại đề xuất bắt đầu "CÔNG NỢ") "<kho> xuất ký gửi <Tên MISA>
theo MYC <mã>"; HỖ TRỢ 0 ĐỒNG "<kho> xuất hỗ trợ <trong/ngoài BH theo `chinh_sach`> <Tên MISA> theo MYC <mã> <TT KH> - <TT+Mail
duyệt>" (KÊNH MT: "xuất hỗ trợ KINH DOANH KRF") + cột Người nhận hàng = "<Tên MISA> (<TT KH>)"; MYC = Mã YCSC, không có thì Mã Lada.
Giữ nguyên: HỖ TRỢ CÔNG NỢ, TG12 (gộp dòng), trả hàng, xuất máy (`dienGiaiCoDinh` thắng mọi công thức trên), Chuyển kho.

**KTV chưa có Mã MISA không đặt hàng được** (chốt 2026-10-08, v1.306): người nhận hàng CUỐI (sau Vệ tinh → Trạm) là KTV (cờ KTV
DVBH/Vệ tinh hoặc Gmail gắn mã KTV đang hoạt động) mà không mã đang hoạt động nào của Gmail đó có `ma_misa` → `POST /phieu-dat` trả
409 `KTV_CHUA_CO_MA_MISA`, import Excel báo lỗi dòng (`nguoiNhanChuaCoMaMisa()` ở `datMuaLinhKien.ts`; mọi loại đơn, cả KTV tự đặt
lẫn TN/GS đặt hộ). FE hỏi `GET /dat-mua-lk/kiem-tra-ma-misa?nguoi_nhan_hang=` → cảnh báo + khoá nút "Tạo đơn" (`useTaoDonForm`
`chuaCoMaMisa`). Người nhận không phải KTV (GS/TN tự nhận) không bị chặn; đẩy lại đơn đã hủy (`/day-lai`) không kiểm tra.

**Mã / Tên MISA chỉ 1 nguồn = mã KTV** (chốt 2026-10-19, v1.365 — "2 cái này bản chất là 1"): migration `0011`/`0012` từng thêm `ma_misa`/`ten_misa` vào CẢ `ktv_lien_he` lẫn `users` (khi đó văn phòng/GS chưa có mã KTV). Nay mọi người đặt hàng đều có mã KTV ("Mã nhận hàng" v1.323, GS v1.346) nên `ktv_lien_he.ma_misa/ten_misa` là nguồn DUY NHẤT: form sửa tài khoản (`UsersModule.tsx`) chỉ HIỆN Mã/Tên MISA của mã KTV chính gắn Gmail (`GET /users` trả `ktv_ma_misa`/`ktv_ten_misa` qua `ktvChinhCuaEmailSql`), `PATCH /users/:email` bỏ qua `ma_misa`/`ten_misa`; file MISA (`misaExport.ts`) và kiểm tra `coMaMisa` (`tuDongDuyet.ts`) không đọc `users.ma_misa` nữa (KH lẻ = Mã MISA của mã KTV nhóm qua `khach_le.nhom_ma`). Cột `users.ma_misa/ten_misa` GIỮ dữ liệu cũ (7 tài khoản, đều trùng mã KTV lúc chuyển), `users.ten_misa` vẫn là bậc dự phòng của tên hiển thị (`tenNguoi.ts`); `lib/khachLe.ts` vẫn tự ghi `users.ma_misa` cho KH lẻ.

**1 Gmail = 1 mã KTV** (chốt 2026-10-01, migration `0061`): đã đóng 9 mã thừa của 6 Gmail dùng chung (gỡ Gmail + `ngung_hoat_dong`,
ghi chú lý do trong `ghi_chu`); chỉ mục DUY NHẤT `LOWER(TRIM(email_dang_nhap))`; API báo `EMAIL_DA_GAN_MA_KHAC` trước khi chạm DB
(`maKtvDangDungEmail()` ở `lib/ktvChinh.ts` — PATCH `/:ma/dat-mua-lk`, bulk-import status `email_da_gan_ma_khac:<mã>`; đường ETX đã
tự bỏ qua Gmail có mã). Thêm đường gán `email_dang_nhap` mới → gọi `maKtvDangDungEmail`. Ghi chú lịch sử:
**Nhiều mã KTV dùng chung 1 Gmail** (dữ liệu thật, 2026-10-01): KHÔNG `JOIN ktv_lien_he k ON k.email_dang_nhap = <email>` khi
cần thông tin KTV theo email (nhân dòng theo số mã — file MISA từng lặp ×5) → `k.ma_ktv = ${ktvChinhCuaEmailSql(email)}`
(`lib/ktvChinh.ts`: mã có Mã MISA → đang bật → ma_ktv), hoặc `EXISTS` khi chỉ lọc. Truy vấn lọc theo 1 `k.ma_ktv = ?` không bị.

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
`khopTim()` — cùng quy tắc với backend (bản sao `khopTim` trong `timTheoTen.ts`, đổi 1 bên đổi cả 2): ký tự KHÔNG dấu trong từ khóa khớp mọi biến thể có dấu, ký tự CÓ dấu phải khớp đúng dấu (2026-09-30: gõ "lẻ" trước đây ra cả "Telesale"/"Lê"). Đơn/Thiếu LK/Trả hàng tìm được theo ID phiếu / Mã đơn hàng / Mã PXK MISA / mã vận đơn của phiếu chứa đơn (`orPxkCuaDon()`, 2026-10-03). Bấm mục Sidebar "Đơn hàng"/"Phiếu xuất" = mở "Tổng"/"Tổng phiếu" (`sidebarClick` nonce App.tsx → effect ở `DatMuaLinhKienModule`; điều hướng nội bộ không đổi); đang ở "Còn tồn" (`__OPEN__`) mà gõ từ khóa thì tìm trên MỌI trạng thái (`trangThaiGui` ở DonCuaToiTab/PhieuXuatKhoTab). Mã yêu cầu sự cố (chính + BỔ SUNG trong `dat_don_case`): `orMaYcsc()`
(đơn/Thiếu LK/Trả hàng/Ctrl+K), `orDonTrongPxk()` (PXK — theo mã đơn/mã YCSC của dòng trong phiếu). File tải về 4 danh
sách đổi cột người (`nguoi_*`) sang tên: `doiNguoiThanhTen()` (`lib/personDisplay.ts`).

**Tìm TÊN linh kiện không phân biệt hoa/thường ở danh sách** (2026-10-21, v1.377 — "hỗ trợ tìm cả chữ hoa và chữ thường khi tìm tên linh kiện ở
các mục đơn hàng hoặc phiếu"): LIKE của SQLite chỉ bỏ qua hoa/thường với chữ ASCII ("LÕI LỌC" không ra "Lõi lọc"). `tenLkKhopSql(col, q)` (`lib/timTheoTen.ts`):
tách từ (≤ 6), mỗi từ khớp 1 trong các dạng gốc / thường / HOA / Hoa chữ đầu, các từ AND nhau (không cần liền nhau) — CẢ bộ đi trong 1 bind JSON (`json_each`)
nên số tham số không đổi (`/status-counts` PXK lặp WHERE 5 lần, D1 ≤ 100 tham số). Dùng ở ô tìm Đơn hàng, Thiếu hàng, Hàng trả và Phiếu xuất (`orDonTrongPxk`
— trước đây tìm phiếu theo tên/mã LK của dòng không ra gì). Không bỏ dấu (gõ có dấu phải đúng dấu).

**Tìm linh kiện trên máy người dùng** (2026-10-04, migration `0067`): Bảng giá (ô tìm `danhMucLinhKien/TimLkBox.tsx` + gợi ý xổ
xuống), `LinhKienPicker` (tạo đơn) và ô gộp mã ở `XetDuyetMaLk` dùng CHUNG bộ tìm `frontend/src/lib/timLinhKien.ts` (`taoBoTimLk`/
`timLk`/`sapTheoDiem`/`doanToDam`) — tìm rời từ khóa, bỏ dấu, bỏ gạch/dấu chấm trong mã, chấp nhận sai 1 ký tự (từ ≥4 chữ),
"Có phải bạn muốn tìm…", từ đồng nghĩa + từ khóa phụ, tô đậm phần khớp (`components/ui/ToDam.tsx`). Gõ tìm KHÔNG gọi server.
Từ khóa phụ theo LK (`lk_tu_khoa`) + nhóm đồng nghĩa (`lk_dong_nghia`) là bảng RIÊNG (sửa không chạm `linh_kien.ngay_cap_nhat` →
không đẩy DVBH, không làm tải lại danh mục), `GET/PUT /lk-settings/tu-khoa`, `/lk-settings/dong-nghia` (ghi: quyền như Combo), cache
trên máy theo domain `md_lk_tu_khoa` (TINH_QUERY `lk-tu-khoa`). "Hay đặt" = lịch sử chọn LK + từ khóa đã tìm lưu **localStorage**
theo tài khoản (`useLichSuLk` ở `lib/useTimLinhKien.ts`, không gửi server) + hạng đặt 30 ngày toàn hệ thống (`diemHayDat`); picker
ô trống hiện "Chọn gần đây" / "Hay đặt" / còn lại; `ComboTab` truyền `ghiLichSu={false}` (soạn combo không tính là đặt).

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
`ThieuLkActionForm`. Drawer nhận `initialRow` từ danh sách để hiện ngay (chỉ lịch sử tải thêm). Xử lý xong trong Drawer chi tiết GIỮ NGUYÊN ticket vừa thao tác (bỏ "duyệt và tiếp theo" 2026-10-02 — Kho tưởng chưa bấm được), toast "Đã cập nhật <ID> → <trạng thái>".

**Thiếu LK ↔ đơn gốc đồng bộ 2 chiều** (chốt 2026-09-29, `applyThieuLkLog`/`applyDonHangLog` trong
`datMuaLinhKien.ts`): Kho "xác nhận hàng đã về" / "từ chối (sai TT)" / Hủy bỏ → đơn gốc "Cho hang" về **"Cho TN
duyet"** (KHÔNG còn tự duyệt), log đơn ghi tóm tắt toàn bộ quá trình xử lý ticket (`tomTatThieuLk()`). "Da ket thuc"
hiển thị là **"TN đã duyệt"**, chỉ đi được từ `THIEU_LK_CHO_TN` (hàng về / Kho từ chối — hàng đợi TN, cùng tập với
badge + `__VIEC__`): TN duyệt trên ticket = duyệt luôn đơn gốc (đơn cần lý do chậm → `DUYET_TREN_DON_GOC`); TN duyệt
đơn gốc từ "Cho TN duyet" → ticket mở tự "Da ket thuc"; TN từ chối/hủy đơn → ticket tự "Da huy bo" kèm lý do; TN
chuyển lại "Chờ hàng" → đóng ticket cũ, mở ticket mới (`dongThieuLkMoCuaDon()`). Hạn 24h của TN tính từ mốc MUỘN
hơn giữa giải trình và lúc vào "Cho TN duyet" (`mocTinhHanTn()` trong `lib/hanLyDoCham.ts`).
**KTV báo nhận thiếu / không nhận được hàng + tự xác nhận đã nhận sau 10 ngày** (chốt 2026-10-12, v1.318, migration `0075`,
`routes/nhanThieu.ts` tại `/api/nhan-thieu`, FE `datMuaLinhKien/NhanThieu.tsx`). Ticket RIÊNG `nhan_thieu` (mã `NTH-…`) +
`nhan_thieu_dong` + `nhan_thieu_log` — KHÔNG dùng `thieu_lk` (bảng đó gắn chặt đơn "Cho hang"). KTV nhận hàng (hoặc TN báo hộ) bấm
"⚠ Báo nhận thiếu" ở PXK "Dang gui KTV" (không áp trả hàng): SL thực nhận từng dòng + lý do (`thieu_sl`/`khong_nhan`/`sai_hong`/`khac`)
+ ảnh (≤5, `POST /nhan-thieu/anh/:pxkId`) + mô tả → "Cho kho kiem tra" (PXK giữ "Dang gui KTV", "KTV đã nhận" bị chặn
`DANG_BAO_NHAN_THIEU`, cron không tự đóng; người báo rút lại được). Kho: **Từ chối** (bắt buộc ghi chú) → ticket đóng, PXK chờ KTV
xác nhận lại, `han_tu_nhan` +10 ngày | **Xác nhận thiếu** (chỉnh SL nếu cần) + chọn `gui_bu` / `hoan_tien` → PXK "KTV da nhan",
"Cho ke toan". Kế toán (đã cân đối phiếu trên MISA) bấm xác nhận: `so_luong_thuc_xuat` đơn gốc = SL thực nhận (KHÔNG đổi `updated_at` —
công nợ phát sinh lọc theo nó), đơn công nợ giảm `so_tien_cong_no` theo tỉ lệ; tiền phần thiếu = đơn giá THỰC TRẢ (`tinhToanPxk` quy theo
`so_tien_can_chuyen` thật) × SL thiếu, trần `min(da_thanh_toan, so_tien_can_chuyen)`. `hoan_tien`: tổng phiếu giảm → `canBangPxk` hoàn
về quỹ người nhận (Kế toán sửa được số) → "Da hoan tien" (không có dòng tiền → "Da can doi"). `gui_bu`: rút tiền khỏi phiếu gốc (tổng + đã
trả), tạo đơn gửi bù (clone đơn gốc, SL thiếu, `gia_chot` = đơn giá thực trả, `tien_da_tra`, log 'TN da duyet' tu_dong,
`dat_don_hang.gui_bu_nhan_thieu_id` — KHÔNG tính vào tổng ngày chiết khấu) + phiếu gửi bù "Dang tao phieu" (cùng `mien_xuat`/`khu_vuc_chon`)
→ đủ tiền thì đặt luôn "Kế toán đã duyệt" tiền; TN xử lý tiếp như phiếu thường. **Tự xác nhận**: `phieu_xuat_kho.han_tu_nhan` (TRIGGER
`trg_pxk_han_tu_nhan` = +10 ngày mỗi lần vào "Dang gui KTV"; phiếu cũ lúc triển khai: lần gửi + 10 ngày nhưng không sớm hơn +3 ngày).
Cron 8h VN (`tuXacNhanVaNhacPxk`, index.ts `getUTCHours()===1`): quá hạn + không có ticket mở → "KTV da nhan" (log "Hệ thống tự xác
nhận…", `nguoi_xu_ly` = người nhận) + 1 thông báo/KTV/ngày liệt kê phiếu chờ + hạn. UI: khối "Nhận hàng" trong chi tiết PXK
(`NhanThieuCard` — hạn, ticket, thao tác Kho/Kế toán); menu Thiếu hàng có 2 mục "Thiếu hàng đặt mua" | "KTV báo nhận thiếu"
(`ThieuHangTabs`/`NhanThieuList`); số việc (Kho: chờ kiểm tra, Kế toán: chờ cân đối) cộng vào badge `thieuLkCanXuLy`
(`nhanThieuCanXuLy`). Chưa đẩy ticket sang khovan (Kho thao tác trong app). Chỉ báo được khi phiếu còn "Dang gui KTV".

**Nút "Đã có hàng"** (chốt 2026-10-16, v1.344): ở bước "Cho kho xu ly" Kho bấm 1 lần = ghi 'Kho da tiep nhan' + 'Kho xac nhan hang da
ve', lý do "Kho đã có hàng" — `applyThieuLkLog` nhận `trang_thai = "Da co hang"` (chỉ Kho/Admin, chỉ từ "Cho kho xu ly", có cả hàng loạt)
rồi đi đúng luồng hàng về (đơn gốc tự duyệt + vào phiếu, ticket "Da ket thuc"). FE: hành động "Da co hang" ở `nextStatesForThieuLk`
(`ThieuLkTab.tsx`). **TN bấm "Đã có hàng" thay Kho** (2026-10-19, v1.370 — hàng về trong ngày): TN (gồm Kế toán làm thay) cũng bấm được khi
ticket còn "Cho kho xu ly"; ghi chú mặc định "TN xác nhận thay Kho: đã có hàng". **TN thao tác hộ MỌI bước của Kho** (2026-10-20, v1.372 — "Các nút thao tác ở mục chờ hàng của kho cũng hiện cho Tác nghiệp hỗ trợ xác nhận hộ"): Tiếp nhận / Cập nhật / Hàng đã về / Từ chối (sai TT) / Chuyển Mua hàng — `applyThieuLkLog` cho `canKho || canTacNghiep`, TN không phải Kho → ghi chú log thêm tiền tố "TN thao tác thay Kho"; FE `nextStatesForThieuLk` (`kho = canKho || canTacNghiep`). Hủy bỏ ticket giữ quy tắc cũ; nhóm "Cần xử lý" của TN không đổi (ticket chờ Kho vẫn nằm ở "Đang chờ").

**Kho từ chối (sai TT) LUÔN bắt buộc lý do** (chốt 2026-10-20, v1.376 — "bắt buộc lý do từ chối khi kho từ chối đơn thiếu hàng"): `applyThieuLkLog` chặn `MISSING_LY_DO_TU_CHOI` ngay đầu (trước tiền tố "TN thao tác thay Kho"), kể cả hàng loạt và ticket mà đơn gốc đã rời "Cho hang" (trước chỉ bắt khi đơn gốc còn "Cho hang"); xử lý hàng loạt hỏi 1 lý do chung (`window.prompt`) gửi kèm `ghi_chu` của `/thieu-lk/bulk-log`.

**Đổi sang LK tương đương rồi xác nhận có hàng** (chốt 2026-10-20, v1.375 — "cho phép kho có quyền sửa lại linh kiện chờ hàng sang linh kiện tương đương rồi xác nhận đã có hàng"): Drawer ticket có nút "Đổi LK tương đương…" (chỉ khi người xem bấm được "Đã có hàng" / "Hàng đã về" — Kho, TN làm hộ; không thêm vào nút ở danh sách) → chọn mã CÙNG nhóm thay thế (`GET /lk-settings/thay-the/:ma`) → gửi `POST /thieu-lk/:id/log` {trang_thai "Da co hang" | "Kho xac nhan hang da ve", `ma_lk_tuong_duong`}. `applyThieuLkLog` (tham số `maLkTuongDuong`): chỉ kèm 2 bước có hàng + đơn gốc "Cho hang" (`DOI_MA_CHI_KHI_CO_HANG`), mã quy về mã chuẩn, phải có trong danh mục (`MA_LK_NOT_FOUND`) và cùng `lk_nhom_thay_the_ct` với mã đang đặt (`KHONG_PHAI_LK_TUONG_DUONG`); đổi `ma_lk`/`ten_lk_snapshot`/`gia_de_xuat` (giá bán mã mới) trong CÙNG batch với log ticket, CAS theo mã cũ + "Cho hang" (`STATE_CHANGED`); log ticket ghi "Đổi sang LK tương đương A → B" (vào cả tóm tắt trên đơn gốc); rồi đơn tự duyệt + vào phiếu như thường + `taiTinhPxkMoCuaKtv` (tổng ngày đổi). Giá chốt tay (nếu có) vẫn thắng.

**Thiếu hàng — Chuyển Mua hàng** (chốt 2026-10-19, v1.370, migration `0093` rebuild `thieu_lk_log` CHECK + `thieu_lk.ma_eo_mua`): Kho đánh giá
ticket → Tiếp nhận chờ hàng về (mã đang có hàng/EO về) HOẶC **"Chuyển Mua hàng"** (từ Cho kho xu ly / Kho da tiep nhan / Kho da cap nhat) →
"Cho mua hang" (báo mọi Mua hàng). Mua hàng (`laMuaHangXuLy` = `la_mua_hang`/Admin; `requireDatMuaLkArea` mở riêng POST `/thieu-lk/:id/log` +
`/bulk-log` cho Mua hàng chỉ đọc): **"Đã đặt hàng"** (bắt buộc mã EO `THIEU_MA_EO` + ngày dự kiến `THIEU_NGAY_DU_KIEN`) → "Mua hang da dat"
(ghi `ma_eo_mua`/`ngay_du_kien_co_hang`, báo người tạo đơn; đơn gốc vẫn khoá như Kho đã tiếp nhận; Kho cập nhật / "Hàng đã về" như thường) |
**"Không mua được"** (bắt buộc ghi chú) → "Mua hang tu choi" rồi ticket tự "Da huy bo" + đơn gốc tự hủy (tiền về quỹ, báo người tạo). Khung
"Thông tin để Kho đánh giá" (`DanhGiaThieuLk.tsx`, `GET /thieu-lk/:id/danh-gia`): tồn kho còn đặt được (`computeTonKhoChot`), ticket cùng mã
đang mở (dự kiến/EO), hàng về gần nhất, đơn đang chờ mã, gợi ý `co_ton`/`dang_ve`/`dang_cho_mua`/`can_dat`. EO thật từ app muahang
(`muahang.dichvu3t.workers.dev`, bảng `eo_item`/`amis_receipt`) CHƯA kết nối (`eo.ket_noi=false`) — chờ bên đó có API "hàng đang về theo mã LK".
Thêm trạng thái: sửa `THIEU_LK_*` (datMuaLinhKien.ts), `dayLaiThieuLk.ts`, `notifications.ts`, `partnerTimeline.ts`, FE `constants.ts`/`ThieuLkStatusRail.tsx`.

**Thiếu hàng — trạng thái MÃ LK của đơn chờ hàng** (chốt 2026-10-16, v1.347): GET `/thieu-lk` (+ `/:id`) trả `lk_trang_thai_ma`
(`LK_TRANG_THAI_MA_SQL` = `linh_kien.trang_thai_ma` của `ddh.ma_lk`, không có → 'Da xac nhan'); lọc `ma_lk_tt=cho|da` trong
`thieuLkListWhere` (dùng chung danh sách / số đếm / tải Excel); `/thieu-lk-status-counts` trả thêm `ma_lk {cho, da}` (cùng bộ lọc, kể cả
trạng thái ticket, trừ chính bộ lọc mã). FE `ThieuLkTab`: cột "Mã LK" (`MaLkXacNhanBadge`), chip lọc nhanh "Tất cả mã LK / Mã chờ xác nhận /
Mã đã xác nhận", Drawer ticket mã chờ → khối `XetDuyetMaSection` (dùng chung Bảng giá). **Kho xác nhận / gộp / từ chối mã LK**
(`xetDuyetMaRoles` ở `settingsDatMua.ts` = Mua hàng + Admin + Kho); "Giá tạm" vẫn chỉ Mua hàng/Admin (`choPhepGiaTam`). Bảng giá: Kho chỉ có
khối xét duyệt mã (`canXetDuyetMa`), không có quyền sửa LK.

**Nhóm LK Karofi / B2B + Kho xử lý theo nhóm** (chốt 2026-10-16, v1.356, migration `0088`, `lib/nhomLk.ts` backend + bản sao FE
`frontend/src/lib/nhomLk.ts`): trường MỚI `linh_kien.nhom_lk` = `karofi` | `b2b` (TÁCH khỏi "Phân loại" `don_vi`), BẮT BUỘC ở form tạo/sửa LK
(`THIEU_NHOM_LK`, PATCH không xoá được), import Excel cột "Nhóm LK" ("Linh kiện Karofi"/"Linh kiện B2B", sai → `nhom_lk_khong_hop_le`; trống:
mã cũ giữ nguyên, mã mới tự đoán). Tự đoán (chốt người dùng, "sau này tôi sẽ import bổ sung nếu bị sai") = mã đúng 10 chữ số HOẶC tên chứa
Karofi/KRF/LVT/Livotec/KRH/Korihome → Karofi, còn lại B2B — `doanNhomLk()` (BE + FE) + TRIGGER `trg_linh_kien_nhom_lk_i/u` (mọi đường INSERT không mang
nhóm: gia88, import, `/lk-settings/danh-muc`; ghi rỗng/giá trị lạ → tự đoán lại) — đổi quy tắc phải đổi cả 3. Lúc triển khai: 4.421 Karofi / 1.913 B2B.
Đổi mã A→B chép nhóm (`COT_CHEP`). Bảng giá: cột "Nhóm LK" bấm đổi nhanh (`danhMucLinhKien/NhomLk.tsx` `NhomLkNhanh`), lọc "Nhóm LK", drawer,
Excel. **Kho xử lý theo nhóm**: `users.kho_nhom_lk` (NULL = cả 2) — Admin chọn ở Quản lý người dùng › sửa tài khoản Kho ("Xử lý thiếu hàng cho
nhóm LK", cột "Kho xử lý nhóm LK" ở thẻ Nhân viên văn phòng). CHỈ Kho thuần (`laKhoThuan` — kiêm TN/Kế toán/Admin thì không lọc) — `khoNhomLkLoc(user)`
+ `locNhomLkSql(alias, nhom)` (LK không có trong danh mục vẫn hiện): danh sách/số đếm/Excel Thiếu hàng (`thieuLkListWhere`), chi tiết ticket
(`/thieu-lk/:id`), Ctrl+K, `/luong-quy-trinh` + `/home-summary` (CTE thieu LK), badge `choKhoThieuLk`/`thieuLkCanXuLy` (`notifications.ts`, cache key
có `kho_nhom_lk`), thông báo ticket mới cho Kho (`locEmailKhoTheoNhomLk` ở `moTicketChoHangTuDong` + `applyDonHangLog` cat1 la_kho). KHÔNG áp: tab
"KTV báo nhận thiếu", thao tác (Kho vẫn xử lý được ticket nhóm khác nếu mở bằng link — chỉ ẩn khỏi danh sách). `GET /thieu-lk` trả `lk_nhom_lk` →
cột "Nhóm LK" + nhãn "Đang xử lý: …" (Kho đã gán nhóm) ở `ThieuLkTab.tsx`.

**Xác nhận khu vực KTV khi bổ sung Mã MISA** (chốt 2026-10-16, v1.356, migration `0087`): `ktv_lien_he.khu_vuc_xac_nhan_luc/_boi` (NULL = khu vực
CHƯA từng được người chọn tay — trống hoặc hệ thống tự gán: tạo từ ETX đoán theo quản lý trực tiếp, migration rà soát). Dữ liệu cũ có khu vực coi
như đã xác nhận, TRỪ mã tạo tự động từ ETX (ma_ktv = Mã NV) + 11 mã migration `0084` gán MB2 theo phỏng đoán. Bổ sung Mã MISA (trước trống) cho KTV
chưa xác nhận → `kiemTraXacNhanKhuVuc()` (`settingsKtv.ts`) trả 409 `CAN_XAC_NHAN_KHU_VUC` trừ khi gửi kèm `xac_nhan_khu_vuc` (+ `khu_vuc_ma`) —
ở PATCH `/:ma/cong-no-misa` (Kế toán/TN) lẫn `/:ma/dat-mua-lk` (Admin; đổi sang khu vực khác = coi như xác nhận); import công nợ/MISA theo Mã KTV +
import KTV không có cột khu vực → lỗi dòng `can_xac_nhan_khu_vuc`. Ghi xác nhận: Admin chọn/đổi khu vực, import có cột khu vực (cả mã mới), tạo
"Mã nhận hàng" văn phòng. FE `KtvTab` (`UsersModule.tsx`): cột Khu vực "· chưa xác nhận", form sửa hiện khối cảnh báo + chọn khu vực + ô "Tôi xác nhận…"
(khoá Lưu tới khi tick). Đổi khu vực qua cong-no-misa → `resyncKhuVucDerivedFieldsForEmail`.

**Thiếu hàng — "Đã có đủ hàng tồn trong kho"** (chốt 2026-10-16, v1.350): `donChoHangDuTonKho()` (`lib/tonKhoCongTy.ts`) tính LÚC ĐỌC
(theo file tồn kho mới nhất, không lưu): mỗi (mã LK, khu vực của đơn) — tồn khả dụng = tồn gốc kho công ty − SL đơn KHÁC "Cho hang" giữ hàng
sau mốc import (cùng điều kiện `computeTonKhoPhatSinh`); đơn "Cho hang" (Mua/Công nợ, không TRỪ CÔNG NỢ) xếp CŨ NHẤT trước, lũy kế SL ≤ tồn khả
dụng = đủ. GET `/thieu-lk` (+ `/:id`) trả `kho_du_hang` (ticket còn mở); lọc `du_hang=1` trong `thieuLkListWhere`; `/thieu-lk-status-counts`
trả `du_hang`. FE: cột "Kho công ty" + chip "Kho đã có đủ hàng (n)" + badge ở thẻ mobile/Drawer (`KhoDuHangBadge`, `ThieuLkTab.tsx`). Khi có
nguồn tồn kho mới (đồng bộ hệ khác) chỉ cần ghi vào `kho_cong_ty_ton_kho` + mốc `ktv_ton_kho_import_meta` là tự đúng.

**Hỏi đáp KTV ↔ Mua hàng** (chốt 2026-10-17, v1.361, migration `0089`, `routes/hoiDap.ts` tại `/api/hoi-dap`, FE `components/hoiDap/HoiDapWidget.tsx` mount ở `App.tsx`): icon chat góc dưới phải (mobile: trên BottomTabBar, khung toàn màn hình). Mỗi câu hỏi = 1 ticket `hoi_dap` (`HD-…`, loại `hoi_gia`/`hoi_ngay_ve`/`khac`, mã LK + mã đơn tuỳ chọn) + tin `hoi_dap_tin` (`phia` hoi/xu_ly/he_thong). Trạng thái: "Cho tiep nhan" → "Dang xu ly" (Mua hàng bấm Tiếp nhận hoặc trả lời tin đầu) → "Da xu ly"; "Tu choi" (Mua hàng, bắt buộc lý do) / "Huy bo" (người hỏi) — 3 trạng thái đóng không nhắn thêm ("Hỏi tiếp" = ticket mới). Người hỏi = mọi tài khoản đã duyệt, chỉ thấy của mình; người xử lý = `la_mua_hang` + Admin, thấy tất cả — router KHÔNG dùng `requireDatMuaLkArea` (middleware đó chặn ghi của Mua hàng). Chưa đọc = so `tin_cuoi_luc/tin_cuoi_tu` với `doc_hoi_luc`/`doc_xu_ly_luc` (mốc đọc CHUNG phía Mua hàng); `GET /hoi-dap/dem` cho số đỏ trên icon. Thông báo: `thong_bao_ktv` loại/link_type `hoi_dap` + Web Push (ticket mới → mọi Mua hàng; tin người hỏi → người đã tiếp nhận, chưa có thì mọi Mua hàng; trả lời/đổi trạng thái → người hỏi); chuông bấm → sự kiện window `mo-hoi-dap` mở đúng ticket. **Menu Sidebar "Hỏi đáp"** (v1.362, key `hoi-dap`, `modules/HoiDapModule.tsx`): Mua hàng (`App.tsx` allowedModules) + Admin — bảng quản lý ticket (lọc trạng thái kèm số đếm, tìm; tải `GET /hoi-dap?gioi_han=500` rồi lọc trên máy), bấm dòng = phát sự kiện `mo-hoi-dap` mở khung chat; số trên mục = chờ tiếp nhận + tin mới (`countKey` `hoiDap`, Sidebar dùng chung query `hoi-dap-dem` với icon). Icon chat đặt `bottom-28` (desktop) / `9rem` trên đáy (mobile) — cao hơn để không che thao tác cuối trang. **Cảnh báo yêu cầu mới cho Mua hàng** (v1.363, "khi có yêu cầu chat mới đẩy thông báo về cho nhân viên mua hàng"): phía xử lý hỏi `/hoi-dap/dem` 20s/lần kể cả khi tab ẩn; `/dem` trả `moi_nhat` (ticket chờ tiếp nhận / có tin người hỏi chưa đọc mới nhất) → `useCanhBaoYeuCauMoi` so mốc `luc` giữa 2 lần: mới hơn = popup nổi cạnh icon ("Mở trả lời") + âm báo WebAudio + làm mới chuông; tab ẩn và thiết bị CHƯA đăng ký push → thêm `Notification` của trình duyệt (có push thì backend đã hiện). Lần tải đầu còn ticket chờ → popup nhắc không âm. Push ticket mới tiêu đề "💬 Câu hỏi mới từ KTV", URL `/?hoi_dap=<id>` (widget đọc tham số lúc tải → mở đúng ticket). Push CHỈ tới thiết bị đã bật (`push_subscriptions`) — khối `BatPushHoiDap` nhắc bật ở khung chat + menu Hỏi đáp khi thiết bị này chưa bật.

**Đơn "Cho hang" mở/khóa theo ticket** (chốt 2026-09-30): Kho CHƯA tiếp nhận ticket ("Cho kho xu ly") hoặc ticket đã đóng →
đơn thao tác như "Cho TN duyet" (TN duyệt/từ chối/chờ hàng lại/hủy, người tạo/Admin hủy), ticket đang chờ TỰ HỦY
(`laChoHangMoKhoa` trong `applyDonHangLog`; duyệt thẳng → ticket "Da huy bo"); Kho ĐÃ tiếp nhận ("Kho da tiep nhan"/"Kho da cap
nhat") → khóa `THIEU_LK_KHO_DANG_XU_LY` + ghi chú chờ Kho. Điều kiện chung `khoDangXuLyThieuLkSql()` → cột `kho_dang_xu_ly_thieu_lk`
(danh sách + chi tiết đơn, FE `laChoHangMoKhoa`/`laChoHangBiKhoa` ở `helpers.ts`), gắn luôn vào CAS UPDATE (Kho tiếp nhận không
đổi version đơn). Đóng ticket từ app KHÔNG báo sang khovan (như mọi đường đóng ticket khác).

**Import tồn kho MISA** (sửa 2026-10-03, treo "Đang xử lý... 0/0 dòng"): file MISA khai báo vùng `!ref` tới dòng 1.048.576/cột
XFD → `sheet_to_json` tạo mảng hàng triệu dòng = treo tab. `lib/tonKhoImport.ts` thu gọn vùng theo ô có giá trị
(`thuGonVungDuLieu`) + tắt cellText/cellNF/cellStyles…; đọc trong **Web Worker** (`tonKhoImport.worker.ts`, gọi qua
`tonKhoImportNen.ts` — tách file để worker không tự bundle chính nó; `vite.config.ts` `worker.format: "es"`), quá 180 giây báo lỗi,
nút Huỷ dừng thật. Client gửi TỪNG LÔ 200 dòng (`rows` = lô + `total`; tab cũ gửi cả file vẫn chạy) thay vì gửi lại cả file mỗi
request. `POST /settings/ktv-ton-kho/import` ghi vào BẢNG TẠM `ktv_ton_kho_tam`/`kho_cong_ty_ton_kho_tam` (migration `0065`), lô
cuối thay bảng thật + meta trong 1 batch → dừng giữa chừng không mất dữ liệu cũ. Cùng kiểu "chỉ gửi lô + `total`" (2026-10-03) cho
`settingsKtv.ts` bulk-import + bulk-import-cong-no-misa, `settingsDatMua.ts` bulk-import-anh, `lkSettings.ts` bom/import (thiếu `total` =
kiểu cũ, server tự cắt) — import mới theo lô: client gửi ĐÚNG lô, đừng gửi lại cả file.

**Kế toán ở "Danh sách KTV"** (`KtvTab mode="ke-toan"`): sửa tay Trần công nợ/Hạn mức dự phòng (+ hiện tại)/Mã MISA/Tên
MISA (`PATCH /:ma/cong-no-misa`) + import hàng loạt KHỚP THEO MÃ MISA (`POST /settings/ktv-lien-he/bulk-import-cong-no-misa`,
`modules/ImportCongNoMisaModal.tsx` — không tạo KTV, ô trống giữ cũ, mã trùng nhiều KTV thì bỏ qua + báo lỗi).
2026-09-30: đọc file xong có bước **chọn cột** import (chỉ cột có dữ liệu; bỏ chọn = không gửi = giữ cũ); cột tuỳ chọn
**Mã KTV** → dòng đó khớp theo Mã KTV và GÁN/ĐỔI Mã MISA (mã đang thuộc KTV khác → lỗi `ma_misa_cua_ktv_khac`, gán xong
`relinkTonKhoForMaMisa`). **TN** (`KtvTab mode="tn"`) sửa được Mã/Tên MISA qua cùng PATCH — backend bỏ qua công nợ/hạn
mức nếu không phải Kế toán/Admin; TN không có Import. `GET /ktv-ton-kho/ma-kho-chua-khop` mở thêm cho TN.
**Tab "Hạn mức dự trữ" — nguồn DUY NHẤT của hạn mức dự phòng** (chốt 2026-10-26, v1.402, migration `0098` — "bổ sung thêm 1 tab 'Hạn mức dữ trữ'
trong danh sách KTV cho phép kế toán import, chỉnh sửa, tắt/bật ... 2 cột này sẽ không cho chỉnh sửa mà sẽ kéo về từ tab"): bảng `han_muc_du_tru`
(khoá `ma_misa` NOCASE, `han_muc_du_phong`, `han_muc_du_phong_hien_tai`, `bat_tat`, ghi chú). TRIGGER đổ sang `ktv_lien_he.han_muc_du_phong/_hien_tai/
_cap_nhat_luc` của MỌI mã KTV cùng Mã MISA (dòng tắt / không có dòng = NULL), KTV mới / đổi Mã MISA tự nhận, và ép lại nếu đường ghi cũ sửa thẳng
2 cột → `duPhongKtv.ts`, danh sách KTV, `/cong-no-du-kien` đọc như cũ. Các đường cũ (PATCH `/:ma/dat-mua-lk`, `/:ma/cong-no-misa`, bulk-import, import
công nợ/MISA) BỎ QUA 2 trường này; form Sửa KTV hiện chỉ đọc. Routes `settingsKtv.ts`: GET `/han-muc-du-tru` (mọi người xem được Danh sách KTV),
POST `/han-muc-du-tru` {rows ≤ 200} (thêm/sửa/import — trường không gửi = giữ cũ; Mã MISA lưu theo cách viết của KTV; trả `chua_khop_ktv`), PATCH
`/:ma/bat-tat`, DELETE `/:ma` — ghi CHỈ Kế toán/Admin; sửa "hiện tại" → `setMocTinhDuPhong`. FE `modules/HanMucDuTruTab.tsx` (tab trong
`DanhSachKtvModule.tsx`): lọc Bật/Tắt/Chưa khớp KTV, Thêm/Sửa/Xoá, công tắc, Import Excel/CSV (cột "ID Misa" + "… hiện tại" / "Hạn mức dự phòng" /
"Trạng thái"; ô số trống = giữ cũ), file mẫu, tải danh sách.

**Tự tạo KTV + duyệt tài khoản từ ETX nhân sự** (chốt 2026-09-29, `lib/etxTuDongKtv.ts`, migration `0044`): chạy CUỐI mỗi
lần đồng bộ ETX (cron 0h thứ Hai VN + nút "Đồng bộ ngay"; riêng bước này: `POST /api/etx-nhan-su/tu-dong-ktv/run`). Nhân
sự `on` + chức danh chứa CTV/KTV/Kỹ thuật viên (không dấu) + Gmail hợp lệ, CHƯA có trong danh bạ KTV → TẠO SẴN
`ktv_lien_he` (ma_ktv = Mã NV, tên "(Mã NV) Chức danh - Họ tên", vai trò KTV nếu có KTV/Kỹ thuật viên còn lại CTV, chưa
khu vực) + `users` "Da duyet"/`la_ktv_dvbh=1` (tài khoản "Cho duyet" có sẵn cũng được duyệt) + liên kết
`etx_nhan_su.ma_ktv` (nghỉ việc → tự khoá). Bỏ qua: Gmail đã là email đăng nhập KTV, Mã NV trùng ma_ktv, Gmail đã có tài
khoản Da duyet/Tu choi (không biến nhân viên văn phòng thành KTV). Chạy lặp lại an toàn (lần 2 tạo 0). **Khu vực mặc định theo QUẢN LÝ TRỰC TIẾP** (chốt 2026-10-15,
v1.343, `taoBoDoanKhuVucTheoQuanLy()`): `etx_nhan_su.quan_ly_truc_tiep` (JSON [{maNhanSu, gmail}]) → lần lượt từng quản lý: khu vực của CHÍNH
quản lý (mã KTV qua `etx.ma_ktv` hoặc Gmail = email đăng nhập KTV) → khu vực PHỔ BIẾN NHẤT của nhân sự cùng quản lý → quản lý là GS của
ĐÚNG 1 khu vực → không đoán được thì để trống. Áp khi tạo KTV tự động + nút "Tạo tài khoản" (KTV có sẵn chưa có khu vực cũng được gán),
xong gọi `resyncKhuVucDerivedFieldsForAll`/`ForEmail` (GS phụ trách). **Cột "Tài khoản đặt hàng" + nút "Tạo tài khoản"** (2026-10-01, tab ETX nhân sự): trạng thái `tk_trang_thai`
(`TK_TRANG_THAI_SQL` ở `routes/etxNhanSuSync.ts`, lọc `?tai_khoan=`); nút gọi `POST /api/etx-nhan-su/:ma/tao-tai-khoan` →
`taoTaiKhoanTuEtx()` — cùng kết quả bước tự động nhưng KHÔNG đòi chức danh CTV/KTV, duyệt cả tài khoản "Tu choi", tạo được cả nhân sự "Đã nghỉ" (2026-10-15, v1.336 — tài khoản mở; đồng bộ ETX chỉ khoá/mở khi trạng thái làm việc ĐỔI) (Admin tự quyết).

**Mã nhân sự (NS-xxxx)** (chốt 2026-10-22, v1.383, migration `0096`, `lib/maNhanSu.ts` — "tất cả các danh người dùng ktv, văn phòng đều có thêm cột mã nhân sự … khi tự động tạo tài khoản, mã nhân sự cũng sẽ tự được điền"): cột `users.ma_nhan_su` (theo TÀI KHOẢN, chung KTV + văn phòng; index thường, KHÔNG UNIQUE — kiểm tra trùng ở API). Tự điền `dienMaNhanSuTuEtx(db, email?)` = khớp `etx_nhan_su.gmail` (LOWER/TRIM, đúng 1 dòng) trước, không có thì qua `etx_nhan_su.ma_ktv` → `ktv_lien_he.email_dang_nhap`; CHỈ ô còn trống + mã chưa thuộc tài khoản khác (không ghi đè sửa tay). Gọi ở: cuối `tuDongTaoKtvTuEtx` (mỗi lần đồng bộ ETX — điền cho mọi tài khoản còn trống), `taoTaiKhoanTuEtx`, mỗi lần đăng nhập (`auth.ts`); migration điền 1 lần cho tài khoản cũ. Sửa tay: `PATCH /users/:email/ma-nhan-su` {ma_nhan_su} (Admin, chuẩn hoá HOA, sai dạng → `INVALID_MA_NHAN_SU`, trùng → 409 `MA_NHAN_SU_DA_DUNG` kèm email). UI `UsersModule.tsx`: cột "Mã nhân sự" ở Người dùng (chờ duyệt/đã duyệt), Nhân viên văn phòng, KTV hiện trường (`GET /settings/ktv-lien-he` trả `u.ma_nhan_su` theo Email đăng nhập); ô `MaNhanSuField` (nút "Lưu mã" riêng) trong form sửa tài khoản + form sửa KTV (Admin, cần Email đăng nhập); tìm được theo mã nhân sự ở 2 danh sách. **Tab ETX nhân sự có "⬇ Tải danh sách"** (v1.383): tải mọi dòng theo bộ lọc đang chọn (lần lượt trang 200) ra Excel.

**Đổi mã / tên KTV** (chốt 2026-10-08, v1.307): mã tự tạo từ ETX (= Mã NV) cần đổi sang mã đúng. Admin bấm "Đổi mã / tên" cạnh ô Mã KTV
(form Sửa KTV, `DoiMaKtvModal` ở `UsersModule.tsx`) → `POST /settings/ktv-lien-he/:ma/doi-ma` {ma_moi, ten_hien_thi?, xac_nhan_gop?}. Mã mới
chưa có = đổi tên mã (`PRAGMA defer_foreign_keys` vì `ktv_cap1_phu_trach` FK); mã mới ĐÃ có (so không phân biệt hoa/thường) → 409
`CAN_XAC_NHAN_GOP` rồi gộp: mã mới nhận Gmail + bật/tắt của mã cũ, cột khác giữ của mã mới, trống thì lấy mã cũ; mã mới gắn Gmail khác →
`MA_MOI_DA_GAN_GMAIL_KHAC`. Mã cũ XOÁ HẲN (chốt người dùng — đồng bộ DVBH/khovan/vipham chỉ upsert nên bên đó còn dòng mã cũ). Chuyển
theo: `ktv_cap1_phu_trach`, `ktv_ton_kho(_tam)`, `etx_nhan_su.ma_ktv`, `cong_no_0d_ktv` — bảng mới có cột mã KTV phải thêm vào route này.
Đơn/PXK lưu theo email nên không đổi; ghi chú KTV ghi "Đổi mã từ … / Gộp từ mã …".

**Gmail đăng nhập phụ** (chốt 2026-10-19, v1.367, migration `0091`, `lib/gmailPhu.ts`) — KTV có 2 Gmail hay đăng nhập nhầm: bảng
`users_gmail_phu (email_phu PK chữ thường → email_chinh)`. OAuth callback (`routes/auth.ts`) gặp Gmail phụ → ký phiên bằng EMAIL CHÍNH, bỏ qua
upsert users, `login_log` ghi email chính + "[Gmail phu: …]" ở user_agent — phần còn lại của hệ thống không biết Gmail phụ. Admin thêm/gỡ ở
form Sửa KTV (`GmailPhuSection`, `POST|DELETE /settings/ktv-lien-he/:ma/gmail-phu`, email chính = `email_dang_nhap` của mã). Chặn
(`kiemTraGmailPhu`): trùng email chính, đã là Gmail phụ, là email chính có Gmail phụ khác, là Email đăng nhập của mã KTV ĐANG BẬT, đã có
đơn/PXK/quỹ (chưa hỗ trợ gộp dữ liệu). Thêm xong: mã KTV đã tắt còn giữ Gmail đó bị gỡ Email đăng nhập + thu hồi phiên của Gmail phụ. Dòng
`users` cũ của Gmail phụ ẩn khỏi danh sách Users; ETX tự tạo KTV / "Tạo tài khoản" bỏ qua Gmail phụ (`LA_GMAIL_PHU`); gán Gmail phụ làm
`email_dang_nhap` (PATCH, bulk-import, tạo mã văn phòng) bị chặn `LA_GMAIL_PHU`.

**Bật/tắt tài khoản KTV** (2026-10-01): cột "Tài khoản" + công tắc ở Quản lý người dùng › KTV hiện trường (Admin) →
`PATCH /api/settings/ktv-lien-he/:ma/bat-tat` = `users.bi_khoa` của email đăng nhập (cùng cờ ETX nghỉ việc dùng). Tắt = không đăng
nhập (`loadUser` DISABLED), không tạo đơn; `resolveNguoiNhanHang()` + import Excel chặn `NGUOI_NHAN_HANG_DA_TAT` (cả Trạm nhận thay
bị tắt); `/nguoi-nhan-hang-kha-dung` VẪN trả người bị tắt (kèm `bi_khoa`, để tra tên đơn cũ) — ô chọn ở `useTaoDonForm` tự lọc bỏ.
**Tắt THEO MÃ** (migration `0060`, sửa cùng ngày): nhiều mã KTV có thể dùng CHUNG 1 Gmail (vd sonnmh.dvbh-hcm + sonnmh.ptdv-hcm)
→ công tắc ghi `ktv_lien_he.ngung_hoat_dong` của MÃ đó; `users.bi_khoa` chỉ = 1 khi MỌI mã cùng Gmail đều tắt (bật 1 mã = mở khoá
Gmail). `bi_khoa` trả ở `/nguoi-nhan-hang-kha-dung` + import theo mã = `MAX(users.bi_khoa, ngung_hoat_dong)` (theo dòng mã). Đơn ghi
người nhận theo EMAIL nên mã còn bật vẫn đặt/nhận hàng như cùng 1 người. Danh sách trả `ma_cung_gmail` (cảnh báo khi tắt).
**"Gắn mã KTV"** (2026-10-01, `GanMaKtvModal` ở `UsersModule.tsx`): cờ KTV DVBH/Vệ tinh chỉ là QUYỀN — tài khoản thuộc thẻ "KTV hiện
trường" khi có mã trong `ktv_lien_he` có `email_dang_nhap` = Gmail. "Chuyển sang văn phòng" gỡ liên kết; "Chuyển KTV" giờ mở NGAY modal chọn
mã có sẵn để gắn (gợi ý tìm theo tên sau dấu "-" cuối của Tên MISA/tên), dòng "Chưa thuộc thẻ nào" ở Người dùng đã duyệt có nút
"Gắn mã KTV". Gắn = `PATCH /settings/ktv-lien-he/:ma/dat-mua-lk {email_dang_nhap}` (cấp users + đồng bộ GS/Trạm/email_gs đơn cũ). Người nhận hàng khi TN/GS đặt hộ hợp lệ = cờ KTV DVBH/Vệ tinh HOẶC Gmail gắn 1 mã KTV đang hoạt động (`nguoiNhanHangHopLe()` ở `datMuaLinhKien.ts`, 2026-10-03 — mã gắn Gmail của tài khoản QC không bật cờ từng bị `NGUOI_NHAN_HANG_KHONG_HOP_LE`). **"Mã nhận hàng" cho tài khoản văn phòng** (2026-10-14, v1.323): GS/văn phòng KHÔNG có mã KTV → TN đặt hộ báo `NGUOI_NHAN_HANG_KHONG_HOP_LE` (ô chọn người nhận vẫn liệt kê mọi GS). Thẻ "Nhân viên văn phòng" có cột + nút "Mã nhận hàng" (`MaNhanHangVanPhongModal`): tạo mã mới qua `POST /settings/ktv-lien-he/tao-cho-van-phong` {email, ma_ktv, khu_vuc_ma, ma_misa (bắt buộc), ten_hien_thi?, ten_misa?} — kiểm tra hết TRƯỚC khi ghi (mã trùng không phân biệt hoa/thường, Gmail đã gắn mã, Mã MISA đã thuộc KTV khác), KHÔNG bật cờ KTV nên tài khoản ở lại thẻ văn phòng, vai trò giữ nguyên; hoặc "Chọn mã có sẵn" (`GanMaKtvModal vanPhong`); "Gỡ mã" = PATCH `email_dang_nhap` null. `GET /users` trả `ma_ktv_gan`. Đơn người đó nhận theo Khu vực của mã. **Tồn kho / công nợ của GS** (chốt 2026-10-16, v1.346, migration `0085` — "giám sát cũng đặt hàng"): tồn kho/công nợ/TRỪ CÔNG NỢ
gắn theo MÃ KTV, import MISA chỉ khớp `ktv_lien_he.ma_misa` → GS chỉ có `users.ma_misa` thì tồn nằm ở "mã kho chưa khớp". `0085` tạo
"Mã nhận hàng" cho 5 GS có Mã MISA (ma_ktv = Mã MISA, khu vực = khu vực đặt hàng/khu vực GS phụ trách — đơn cũ không đổi khu vực, ghi chú
"(migration 0085)") + nối tồn kho đã import. GS mới: thẻ Nhân viên văn phòng cột "Mã nhận hàng" cảnh báo "⚠ Chưa có — tồn kho chưa quản lý"
khi có Mã MISA mà chưa có mã; modal gợi ý mã = Mã MISA. **Không xét trần cho GS** (chốt người dùng): người nhận `vai_tro='Giam sat'` →
`nguCanhNhan().laGs` → `danhGiaPhieu` không đối chiếu công nợ (`danh_gia_cong_no` NULL, không "Chờ GS duyệt", TBP không đòi mã EO);
`/cong-no-du-kien` trả `khong_xet_tran` → form tạo đơn ẩn cảnh báo vượt trần. Trước sửa, GS (kể cả chưa có mã) bị tính trần = 0 → đơn công nợ
GS tự nhận vào "Chờ GS duyệt".

**Loại đề xuất không phân biệt hoa/thường** (sửa 2026-10-15, v1.338): `deriveLoaiDon()` (backend `tuDongDuyet.ts` + bản sao FE `helpers.ts`)
so trên `toUpperCase()` — file import từng ghi "Trả hàng công nợ"/"Trừ công nợ" chữ thường → đơn trả hàng lọt chặn import, đi luồng mua
(tự duyệt). Import Excel quy loại đề xuất về ĐÚNG tên trong `settings_loai_de_xuat` (bỏ hoa/thường/khoảng trắng thừa); không có trong danh
mục → báo lỗi dòng. Đơn cũ đã lưu tên chữ thường giữ nguyên (TN sửa loại đề xuất trên đơn = đổi luồng nếu cần).

**Đơn KH trả góp** (chốt 2026-10-02, migration `0063`): loại đề xuất chứa "HỖ TRỢ NGOÀI BẢO HÀNH TG12" (-NSKX / -NPP, `laKhTraGop()`
ở `pxkRecalculate.ts`, bản sao FE `helpers.ts`) KHÔNG tính công nợ: `so_tien_cong_no` = 0, `danh_gia_cong_no` NULL (tạo tay, import,
cảnh báo tạm tính FE bỏ qua), "Giá đề xuất"/"Tổng tiền đề xuất" = 0 (`donGiaSauChietKhau`/`tienSauChietKhau`), loại chiết khấu `KH_TRA_GOP` "Chiết khấu đơn KH trả góp" (`tinhToanPxk` + `maTheoLoaiDon`). TRIGGER
`trg_ddh_kh_tra_gop_i/u` ép lại lúc tạo/đổi loại đề xuất (mọi đường ghi); TN vẫn sửa tay được sau đó. File MISA (mọi mẫu): dòng trả góp cùng phiếu + KTV + mã LK + loại đề xuất GỘP 1 dòng (SL cộng, Mã YCSC nối bằng dấu cách " " — 2026-10-08, TT mail duyệt / TT KH nối ", ") — `gopDongKhTraGop()` ở `misaExport.ts`.

**Đơn "HỖ TRỢ 0 ĐỒNG"** (+ "(KÊNH MT)", chốt 2026-10-15, v1.342, migration `0082`): KHÔNG tính giá trị công nợ, mặc định bỏ qua bước
vượt trần — `laHoTro0Dong()`/`khongTinhCongNo()` (`pxkRecalculate.ts`, bản sao FE `helpers.ts`; `khongTinhCongNo` = trả góp TG12 + 0 đồng)
thay `laKhTraGop` ở `canDoiChieuCongNo`, `danhGiaPhieu` (soTienCongNo), import, `canNhapMaEo`, cảnh báo công nợ tạm tính form tạo đơn.
TRIGGER `trg_ddh_ho_tro_0d_i/u` ép `so_tien_cong_no = 0`, `danh_gia_cong_no = NULL` (mọi đường ghi). Giá/chiết khấu giữ nguyên (khác trả
góp). Đơn CŨ giữ `so_tien_cong_no` đã lưu (~80 đơn, chưa chốt backfill).

**Combo linh kiện** (chốt 2026-10-04, migration `0066`, `lib/lkCombo.ts`): bảng `lk_combo` (mã combo, tên, bật/tắt) +
`lk_combo_ct` (LK thành phần + SL/bộ), quản lý ở Bảng giá › tab "Combo" (`danhMucLinhKien/ComboTab.tsx`, `/api/lk-settings/combo`,
ghi = Quản lý danh mục LK / Mua hàng / Admin; mã combo không đổi được, không trùng LK đang bật, ";" → ","). Combo KHÔNG phải LK: ô chọn
LK lúc tạo đơn thêm combo như 1 mục (`comboThanhLkRow()` ở `helpers.ts` — chỉ combo đang bật có MỌI thành phần đang chọn được, giá =
tổng thành phần), form giữ 1 dòng; server `tachComboDong()` tách thành từng đơn thành phần (SL = SL combo × SL/bộ) ở ĐẦU POST
`/phieu-dat` và import Excel (combo tạo đủ bộ hoặc không tạo) — mỗi đơn tính giá/chiết khấu/công nợ/tồn kho/MISA như đơn thường,
`dat_don_hang.combo_ma` chỉ là nhãn 🧩. `chuyenMaLk()` cập nhật thành phần combo. 10 dòng "combo" cũ trong `linh_kien` (mã = danh
sách mã nối dấu phẩy, đã tắt) + 4 đơn cũ dùng chúng giữ nguyên (chốt người dùng) — combo cùng mã thắng vì tách trước khi tra `linh_kien`.

**Nhóm linh kiện thay thế — quản lý trên app** (chốt 2026-10-19, v1.369, migration `0092` — "chuyển hẳn sang app, xây dựng chức năng thêm, bớt chỉnh sửa đầy đủ cho người dùng trên app (cho người có quyền chỉnh sửa linh kiện)"): trước đây tab "Linh kiện thay thế" (Bảng giá) + gợi ý lúc tạo đơn (`ThayTheGoiYTuSheet`, đã bỏ) đọc Google Sheet công khai trên trình duyệt, bảng `lk_nhom_thay_the` RỖNG → API đối tác `/v1/lk-thay-the` trả `[]`. Nay bảng là nguồn DUY NHẤT (tab Bảng giá `danhMucLinhKien/ThayTheTab.tsx`, gợi ý `ThayTheGoiY` ở form tạo đơn — chung queryKey `lk-nhom-thay-the`, drawer "Liên quan" `linhKienLienQuan.ts`, API đối tác). `0092` dựng lại `lk_nhom_thay_the_ct` (BỎ khoá ngoại `ma_lk` → `linh_kien`; thêm `ten_lk` tên lúc thêm, `ghi_chu` THEO TỪNG MÃ, `stt`) + nhập 1 lần 50 nhóm / 161 mã từ Sheet (bỏ dòng trùng; nhóm Sheet đặt tên = mã gốc → "Thay thế cho <mã> · <tên>"; 43 mã chưa có trong danh mục GIỮ LẠI, hiện "Chưa có trong danh mục"). `routes/lkSettings.ts`: GET `/nhom-thay-the` (thành viên + tên/giá/trạng thái danh mục, `co_trong_danh_muc`), POST/PATCH (`thanh_vien` [{ma_lk, ghi_chu}] = danh sách ĐẦY ĐỦ, 1 batch; kiểu cũ `ma_lk_list` giữ ghi chú), DELETE — ghi = `suaThayThe` (Quản lý danh mục LK / Mua hàng / Admin + **Kho / Kế toán / Giám sát** từ v1.390 — chốt 2026-10-22 "xây dựng công cụ để kho, hoặc kế toán, giám sát cho phép tạo, sửa, thay đổi các danh sách linh kiện tương đương"; bản sao FE `coQuyenSuaThayThe()` ở `frontend/src/lib/quyenThayThe.ts` dùng cho tab Bảng giá + ô "+ Thêm vào nhóm thay thế" lúc tạo đơn — đổi 1 bên đổi cả 2; Kho được cấp menu Bảng giá (`App.tsx`) để vào tab, phần còn lại Bảng giá vẫn chỉ đọc). Quy tắc `chuanThanhVien()`: ≥ 2 mã (`IT_NHAT_2_MA`), ≤ 100, mã MỚI phải có trong danh mục (`MA_KHONG_CO_TRONG_DANH_MUC` kèm `ma`), mã "Da doi ma" quy về mã chuẩn, mã chưa có trong danh mục đã nằm trong nhóm được giữ; tên nhóm không trùng (so ở JS, `TEN_NHOM_DA_CO`). Đổi mã A→B (`chuyenMaLk`) vẫn chuyển thành viên. API đối tác thêm `co_trong_danh_muc` + `ghi_chu` mỗi mã (tài liệu 1.4).

**Ảnh minh hoạ LK tối đa 10 ảnh** (chốt 2026-10-13, v1.321, migration `0077`): `linh_kien.anh_ds` = JSON array URL (≤ 10, ảnh đầu = ảnh
chính); `anh_demo` GIỮ = ảnh đầu (đồng bộ DVBH/Sửa chữa, ảnh thu nhỏ bảng/ô chọn LK đọc cột này). `anh_ds` NULL = chỉ có `anh_demo` (LK cũ)
→ đọc qua `dsAnhLk()`/`cotAnhLk()` (`backend/src/lib/anhLinhKien.ts`) / `anhCuaLk()` (FE `lib/anhLinhKien.ts`). `POST /settings/linh-kien/:ma/anh?them=1`
thêm cuối (đủ 10 → `QUA_SO_ANH_LK` TRƯỚC khi tải lên, CAS theo anh_demo+anh_ds); không `?them` (tab cũ, import ảnh hàng loạt, mọi đường chỉ ghi
`anh_demo`) = thay ảnh chính — TRIGGER `trg_linh_kien_anh_ds` thay phần tử đầu, giữ ảnh phụ; `anh_demo` NULL = xoá hết. `PUT .../anh-ds` sắp
xếp/xoá (chỉ URL đang có, else `DANH_SACH_ANH_DA_DOI`). UI: drawer chi tiết có dải ảnh nhỏ + phóng to ‹ ›; form thêm/sửa chọn nhiều ảnh 1 lần,
✕ xoá, "★ Chính". Đổi mã A→B chép `anh_ds` (`COT_CHEP`).

**Công nợ 0 đồng** (chốt 2026-10-05, migration `0069`): tab "Công nợ 0 đồng" ở menu Công nợ (`modules/CongNo0dTab.tsx`, CHỈ
Admin/Kế toán — `adminOrKeToan`, `/api/settings/ktv-ton-kho/cong-no-0d`): chương trình = danh sách mã LK + SL hỗ trợ (cho MỖI KTV) +
từ/đến ngày (ngày VN, gồm 2 đầu) + KTV áp dụng (chọn lẻ / lọc theo Khu vực / "Toàn bộ KTV" = cờ `tat_ca_ktv`, gồm cả KTV thêm sau) +
bật/tắt. Hôm nay nằm trong khoảng → `MIN(tồn cuối kỳ, tổng SL hỗ trợ các chương trình đang bật)` chiếc tính công nợ 0đ, phần vượt tính
bình thường — `SL_HO_TRO_0D_SQL()` ở `lib/congNoKtv.ts` dùng CHUNG cho `computeCongNoThucTe` (đánh giá công nợ lúc tạo đơn) + bảng
Công nợ KTV (`ktvTonKho.ts GET /`, cột `sl_ho_tro_0d` "SL hỗ trợ 0 đồng") + chi tiết từng mã. Tính lúc đọc, không lưu → bật/tắt/sửa
là công nợ thực tế đổi ngay. Không ảnh hưởng "phát sinh"/"đã trừ". `chuyenMaLk()` chuyển luôn `cong_no_0d_lk`. **Chọn LK hàng loạt theo từ khóa** (2026-10-14, v1.324, migration `0079`): chương trình có thêm `cong_no_0d_tu_khoa` (từ khóa ≥ 3 ký tự + SL/KTV + `khop_ten` = khớp cả tên); LK có MÃ (hoặc tên) chứa từ khóa (không phân biệt hoa/thường ASCII, trừ dòng 'Da doi ma') được GHI SẴN vào `cong_no_0d_lk` (`tu_khoa_id` = từ khóa sinh ra dòng, `bat_tat` = 0 khi người dùng tắt mã khớp sai) — `SL_HO_TRO_0D_SQL` chỉ thêm `l0.bat_tat = 1`. LK mới / đổi mã / đổi tên khớp → TRIGGER `trg_cong_no_0d_tu_khoa_lk_i/u` tự thêm (INSERT OR IGNORE: dòng nhập tay hoặc mã đã tắt giữ nguyên). Điều kiện khớp `LK_KHOP_TU_KHOA_SQL` (`ktvTonKho.ts`) = CÙNG công thức 2 trigger — đổi 1 chỗ đổi cả 2. Lưu chương trình gửi `tu_khoa` + `tat_ma` (mã đã tắt); dòng nhập tay thắng dòng từ khóa cùng mã. `GET /cong-no-0d/khop?tu_khoa=&khop_ten=` xem trước, `PATCH /cong-no-0d/:id/lk/:ma {bat_tat}` bật/tắt nhanh. UI: khối "Chọn hàng loạt theo từ khóa" trong form (`TuKhoaDong`, danh sách khớp + công tắc từng mã). **Chọn KTV áp dụng từ file** (2026-10-22, v1.384 — "thêm chức năng import KTV mã ID KTV hoặc mã misa từ file excel => tự động sẽ chọn các KTV có trong danh sách đó"): nút "⬆ Chọn KTV từ file" trong khung KTV áp dụng (`chonKtvTuFile` ở `CongNo0dTab.tsx`, đọc trên trình duyệt — Excel/CSV): mọi ô của sheet đầu trùng Mã KTV hoặc Mã MISA (không phân biệt hoa/thường; 1 Mã MISA nhiều mã KTV → lấy mã đang hoạt động) được CHỌN THÊM vào danh sách, bật lọc "Chỉ KTV đã chọn" để kiểm tra, báo mã không tìm thấy (chỉ ở cột có ít nhất 1 ô khớp, bỏ dòng tiêu đề). `GET /cong-no-0d/ktv-options` trả thêm `ma_misa` (ô tìm KTV cũng tìm theo Mã MISA). **Nhập linh kiện hàng loạt từ file** (2026-10-22, v1.385 — "trong mục thêm chương trình hỗ trợ 0 đồng, thêm chức năng import hàng loạt"): nút "⬆ Nhập linh kiện từ file" + "Tải file mẫu" dưới danh sách LK của form (`nhapLkTuFile` ở `CongNo0dTab.tsx`, đọc trên trình duyệt — Excel/CSV, sheet đầu): cột mã = tiêu đề chứa "Mã" (Mã LK / Mã linh kiện / Mã hàng), cột SL = tiêu đề "SL"/"Số lượng" (không có dòng tiêu đề → cột 1 mã, cột 2 SL; SL trống = 1); mã khớp danh mục (không phân biệt hoa/thường), mã lặp trong file cộng SL; GỘP vào danh sách đang soạn (mã đã có → lấy SL theo file, mã mới → thêm dòng), báo mã không có trong danh mục + dòng SL sai; chỉ lưu khi bấm "Lưu" (không đổi API). **Import CHƯƠNG TRÌNH hàng loạt** (2026-10-22, v1.386 — "file import này cần có ID KTV hoặc Mã misa + mã linh kiện hỗ trợ/ hoặc từ khóa tìm kiếm (1 trong 2) + số lượng + từ ngày + đến ngày + tên chương trình"): nút "⬆ Import chương trình" ở tab (`congNo0d/ImportChuongTrinhModal.tsx` + logic thuần `congNo0d/importChuongTrinh.ts` `docFileChuongTrinh`, test được bằng `node --experimental-strip-types`). Mỗi dòng = 1 KTV (Mã KTV / Mã MISA — MISA nhiều mã ưu tiên mã đang bật; trống cả 2 hoặc "TẤT CẢ" = toàn bộ KTV) × 1 mục (Mã LK HOẶC Từ khóa, + "Khớp cả tên") × SL, Từ/Đến ngày (serial Excel / dd/mm/yyyy / yyyy-mm-dd; CSV đọc `raw` để không đảo ngày-tháng), Tên chương trình, Bật (Tắt = tạo tắt). Tiêu đề nhận theo chữ bỏ dấu (`nhanCot` — "SL…" kiểm tra TRƯỚC "ktv" vì "SL hỗ trợ / KTV"). Cùng Tên + Từ + Đến = 1 chương trình; KTV có bộ mục/SL khác nhau TÁCH thành "Tên (1)", "Tên (2)"… (1 chương trình = mọi KTV cùng SL). Màn kiểm tra: chương trình sẽ tạo, dòng lỗi (chặn tạo tới khi sửa file), cảnh báo (trùng dòng cùng SL bỏ qua, KTV ngừng, đã có chương trình cùng tên+thời gian → tạo THÊM). Tạo lần lượt qua `POST /cong-no-0d` sẵn có (không API mới); lỗi giữa chừng dừng + báo số đã tạo. File mẫu "Tải file mẫu".

**KH lẻ theo từng khách** (chốt 2026-10-09, v1.314, migration `0074`, `lib/khachLe.ts` + `routes/khachLe.ts` tại `/api/khach-le`):
trước đây mọi KH lẻ dùng chung tài khoản KH_LE_MB/KH_LE_MN nên tiền KH chuyển không gắn được KH nào. Giờ MỖI KH = 1 NGƯỜI NHẬN RIÊNG:
users NỘI BỘ `<ma>@khle.local` (Da duyet, `khu_vuc_dat_hang` = khu vực nhóm, `ma_misa` = của nhóm, `ten` "KH lẻ MN - <SĐT|mã>" — KHÔNG
ghi `ten_misa`) + dòng `khach_le` (ma, nhom_ma, sdt). Nhóm = `khach_le_nhom` (mã KTV tài khoản chung). KH lẻ KHÔNG nằm trong
`ktv_lien_he` (danh bạ đồng bộ DVBH/khovan/vipham, công nợ, ETX) — bị loại khỏi danh sách Users/xem thử. Đặt đơn cho người nhận là
tài khoản nhóm → ô "SĐT khách hàng lẻ" (`KhachLeSdt.tsx`, `useTaoDonForm` `kh_le_sdt`; SĐT chuẩn hoá `chuanHoaSdt`, 84→0, sai →
`SDT_KHONG_HOP_LE`; trống → mã tự động `KL<MB|MN>-A000001`, có SĐT → `KL<MB|MN>-<SĐT>`, 1 SĐT = 1 KH trong nhóm) → POST `/phieu-dat`
ghi `nguoi_nhan_hang` = email KH (tạo hồ sơ SAU mọi kiểm tra). Nhờ vậy quỹ dư, PXK, chuyển tiền, tiền theo đơn khi "Chờ hàng", hoàn
quỹ khi hủy, Điều chỉnh/Hoàn tiền (`/quy-ktv/dieu-chinh`) chạy Y HỆT KTV. Giá: KH lẻ (cả KH lẫn tài khoản nhóm, `laNguoiNhanKhLe`) =
GIÁ NIÊM YẾT, nhãn `KHONG_CK`, không Đình tủ/bậc thang (`tinhToanPxk`; giá chốt vẫn thắng) — 6 đơn cũ đã trả theo giá chiết khấu được
migration ghi `gia_chot` = tiền đã trả ÷ SL (chốt người dùng: giữ giá KH đã trả). File MISA: mã/tên MISA lấy của nhóm (`misaExport.ts`
JOIN `khach_le`). Đơn CŨ của tài khoản nhóm: TN/Admin "Gán KH lẻ" ở chi tiết đơn (`POST /khach-le/gan-don`, `GanKhachLe`) — chỉ đơn chưa
từ chối/hủy và KHÔNG trong PXK còn hiệu lực (`DON_CON_TRONG_PHIEU` — bỏ khỏi phiếu trước, chọn "Đơn đã thanh toán" để giữ tiền); tiền đã
trả đi THEO ĐƠN: trigger `trg_ddh_hoan_tien_da_tra` có ngoại lệ khi cùng UPDATE đặt `tien_da_tra_email` = người nhận mới. Import Excel
đơn cho tài khoản nhóm vẫn ghi cho nhóm (dùng Gán). Tab "KH lẻ" ở Quỹ & chuyển tiền (`KhachLeTab`, `GET /khach-le`: quỹ dư, tiền trên
đơn, đơn mở/chờ hàng; mặc định ẩn KH đã xong). Tên KH hiện qua `useKtvDisplayMap` (bổ sung email `@khle.local` từ danh bạ người dùng);
tìm đơn theo SĐT/mã KH qua `users.ten`. Đổi mã KTV nhóm (`/doi-ma`) chuyển theo `khach_le_nhom`/`khach_le.nhom_ma`.

**LK "Cấm bán" chỉ CẢNH BÁO, không chặn** (chốt 2026-10-10, v1.315 — v1.309/1.310 từng ẩn + chặn với MUA HÀNG / MUA HÀNG CÓ ID / MUA DỰ
TRỮ): LK `cam_ban` hiện + chọn + đặt được với MỌI loại đề xuất (tạo tay, import Excel, sửa đơn — backend không còn `LK_CAM_BAN`).
`LinhKienPicker` hiện nhãn "Cấm bán" trong danh sách + chọn xong hiện cảnh báo "⚠ Linh kiện thuộc dạng không bán, hãy chắc chắn mình
đặt đúng linh kiện" (cả form sửa đơn). Combo có thành phần cấm bán = combo cấm bán (cũng chỉ cảnh báo).

**TỰ ĐỘNG DUYỆT 100% — bỏ Tác nghiệp khỏi khâu duyệt đơn** (chốt 2026-10-14, v1.325, migration `0080`, `backend/src/lib/tuDongDuyet.ts`).
1 bộ quyết định `danhGiaPhieu()` dùng CHUNG cho tạo tay (POST `/phieu-dat`), Import Excel, kiểm tra trước trên form (POST
`/phieu-dat/kiem-tra` — cùng body, không ghi gì, bỏ qua ô chưa điền; thay GET `/du-doan-duyet` đã bỏ) và các bước sau
(`trangThaiSauDuyet` khi Trạm/TBP/GS duyệt). Sửa quy tắc ở file này, KHÔNG ở từng route. Quy tắc: **CHẶN tạo** (báo lý do từng
dòng) — đơn có tiền (Mua / TRỪ CÔNG NỢ) giá bán 0/trống trừ LK bật "Cho phép giá 0đ" ở Bảng giá (`linh_kien.cho_phep_gia_0`,
`PATCH /settings/linh-kien/:ma/gia-0`, không chạm `ngay_cap_nhat`); đơn công nợ khi người nhận chưa có Mã MISA (KTV hoặc
`users.ma_misa` — không có thì chỉ đặt Mua); TRỪ CÔNG NỢ thiếu tồn KTV / người nhận không phải KTV. Vệ tinh KHÔNG tạo đơn
(`VE_TINH_KHONG_TAO_DON`, FE `canTaoDon`). Đặc thù (trừ loại bỏ qua TBP) → "Cho TBP xac nhan" (TBP duyệt đơn vượt trần phải
nhập mã EO); công nợ thật (không TRỪ CÔNG NỢ/TG12) vượt trần → **"Cho GS duyet"** (CHỈ `email_gs` = GS khu vực của KTV, hoặc
Admin; duyệt bắt buộc `ma_eo` tự nhập không kiểm tra → `dat_don_hang.ma_eo`; từ chối = "Da huy"; khu vực chưa có GS thì đơn nằm
chờ). Còn lại kiểm tra **tồn kho công ty theo KHU VỰC CỦA ĐƠN** (`computeTonKhoChot(..., truocDon)` — trừ dần theo `ngay_tao,id`:
đơn trước đủ, đơn sau thiếu; dòng bị chặn không giữ tồn): đủ → "TN da duyet" `tu_dong=1` + vào phiếu; thiếu + có tiền →
**"Cho thanh toan"** (vào phiếu, KTV chuyển tiền; Kế toán xác nhận tiền phiếu xong → `xuLyDonChoThanhToan()` kiểm tra lại FIFO:
đủ → tự duyệt, vẫn thiếu → rời phiếu MANG THEO tiền sang "Cho hang" + mở ticket — hook ở `PATCH /phieu-xuat-kho/:id/chuyen-tien`
và sửa khoản `/quy-ktv/khoan-chuyen/:id/sua`); thiếu + không tiền → "Cho hang" + ticket tự mở (`moTicketChoHangTuDong`, lý do
"Kho hết hàng"). **Đơn "Cho hang" do KHO quyết định**: Kho "Hàng đã về" → đơn tự duyệt + vào phiếu (`duyetDonKhiHangVe`, ticket
đóng "Da ket thuc"); Kho "Từ chối (sai TT)" (bắt buộc lý do) / hủy ticket → đơn tự hủy, tiền về quỹ (`huyDonChoHangTuDong`);
TN KHÔNG duyệt được đơn "Cho hang" (`CHO_HANG_KHO_QUYET_DINH`), chỉ Từ chối/Hủy. Trả hàng: QC đồng ý → "TN da duyet" + tự gom
phiếu PTL (bỏ bước "Cho TN duyet tong" cho đơn mới). TN duyệt tay đơn "Cho TN duyet" cũ/đẩy lại → cũng tự vào phiếu. Form tạo đơn:
gợi ý kết quả từng dòng (`DuDoanDuyetHint`), dòng bị chặn khoá nút, dòng sẽ chờ hàng/chờ thanh toán/chờ GS → hộp "Đặt tiếp / Quay
lại" (`XacNhanTaoDonModal`). Badge GS `choGsDuyet`. `dat_don_hang_log` CHECK thêm 'Cho GS duyet','Cho thanh toan'.

**Cho phép thanh toán sau** (chốt 2026-10-20, v1.374, migration `0094` — "cho phép kế toán hoặc tác nghiệp xác nhận cho phép thanh toán sau với các đơn chờ chuyển tiền"): TN (gồm Kế toán làm thay) / Admin bấm "⏭ Cho phép thanh toán sau" ở chi tiết đơn "Cho thanh toan" → `POST /dat-mua-lk/don-hang/:id/thanh-toan-sau` {ghi_chu?} = `choPhepThanhToanSau()` (`tuDongDuyet.ts`): đủ tồn → "TN da duyet" (vào phiếu), thiếu → "Cho hang" + ticket (`tacDongSauDinhTuyen`), ghi `dat_don_hang.thanh_toan_sau_luc/_boi` (hiện ở chi tiết đơn; `chuaChuyenTienChoHang` bỏ qua đơn đã cho phép). Tiền vẫn thu như đơn thường ở phiếu xuất (sửa/bổ sung tiền bình thường) — "Gửi kế toán" vẫn chặn `MISSING_CHUYEN_TIEN_APPROVED` tới khi Kế toán duyệt đủ tiền (không cần code mới).

**Đưa đơn "Cho thanh toan" vào lại phiếu** (2026-10-20, v1.371 — "DDH-002838 tôi muốn add nó lại vào phiếu để chờ thanh toán thì lại không có
chức năng để add"): đơn "Cho thanh toan" rời phiếu (TN bỏ đơn, đổi khu vực…) trước đây không có đường vào lại (chỉ tự gom lúc tạo đơn). Nay: (1) nút
"Đưa vào phiếu chờ thanh toán" ở chi tiết đơn (TN/Kế toán/Admin, đơn Mua/Công nợ không trong phiếu còn hiệu lực) → `POST /dat-mua-lk/don-hang/:id/vao-phieu`
= CÙNG `bundleAutoApprovedIntoPxk` (phiếu đang tạo của người nhận, không có thì tạo mới; liên kết phiếu "Ke toan huy" tự gỡ trước); (2) tạo phiếu tay /
`POST /:id/dong` / danh sách `don-hang-kha-dung` (+ counts) nhận đơn Mua/Công nợ "TN da duyet" HOẶC "Cho thanh toan" (`DON_VAO_PHIEU_DUOC` ở
`phieuXuatKho.ts`; trả `trang_thai_hien_tai`, modal tạo phiếu gắn nhãn "Chờ thanh toán"). "Gửi kế toán" vẫn chặn `DON_CHUA_DUYET` tới khi Kế toán xác nhận
tiền (`xuLyDonChoThanhToan`).

**Sửa đơn "Cho thanh toan" → đánh giá lại tồn kho** (sửa 2026-10-16, v1.351): PATCH sửa đơn đổi mã LK / SL → `danhGiaLaiDonChoThanhToan()`
(`tuDongDuyet.ts`): đủ tồn kho công ty (FIFO `donDuTonKhoCongTy`) → "TN da duyet" tự động + báo người tạo; vẫn thiếu → giữ nguyên (Kế toán
xác nhận tiền xong xét lại). Trước đó DDH-002638 đổi sang mã còn hàng vẫn kẹt "kho còn 0" (migration `0086` gỡ riêng đơn này). **Hết tiền phải chuyển → không còn "Cho thanh toan"** (sửa 2026-10-20, v1.373 — bug DDH-002733 "đơn được sửa tiền = 0 nhưng vẫn ở trạng thái chờ chuyển tiền"): phiếu 0đ không bao giờ có bước Kế toán xác nhận tiền nên `xuLyDonChoThanhToan` không chạy → đơn kẹt. `danhGiaLaiDonChoThanhToan` giờ: đủ tồn → tự duyệt; vẫn thiếu MÀ không còn tiền (`laDonPhatSinhTien` + `COALESCE(gia_chot, gia_de_xuat) × SL` = 0) → "Cho hang" + ticket (`tacDongSauDinhTuyen`, rời phiếu mang tiền đã trả). Gọi khi PATCH đổi mã LK / SL / giá chốt / SL thực xuất / loại đề xuất và ở đầu `POST /don-hang/:id/vao-phieu` (trả `trang_thai` khi đã xét lại thay vì vào phiếu). FE (`DonHangDetailModal`, "nếu giá trị đơn hàng bị chuyển về = 0 sẽ hiện cảnh báo nhắc nhở…"): đơn Mua/TRỪ CÔNG NỢ chưa đóng mà giá trị từ > 0 về 0 → hộp "Giá trị đơn hàng về 0đ" (Xác nhận lưu / Không, sửa lại) trước khi gửi PATCH.

**Minh bạch lý do cho người đặt hàng** (chốt 2026-10-15, v1.327): MỌI quyết định tự động ghi lý do vào `dat_don_hang_log.ghi_chu` (`ghiChuKhoiTao` lúc tạo — cả "TN da duyet"/"Cho TBP xac nhan"; log định tuyến sau Trạm/TBP/GS; `xuLyDonChoThanhToan`), lý do tồn kho ghi rõ KHU VỰC kho đã kiểm (`moTaThieuTon(ton, sl, khuVuc)`). Lý do = SỰ VIỆC ngắn; câu "tiếp theo ai xử lý" nằm ở FE `datMuaLinhKien/LyDoTrangThai.tsx` (`giaiThichTrangThai` — 1 bộ dùng chung cho khung "lý do" trong chi tiết đơn `LyDoTrangThaiDon`, ⓘ cột Trạng thái danh sách `tomTatLyDo`, hộp `KetQuaTaoDonModal` sau khi tạo) — đổi luồng ở `tuDongDuyet.ts` thì sửa câu ở đây. POST `/phieu-dat` trả `dong` [{id, ten, trang_thai, ly_do}] → form mở "Kết quả đặt hàng" khi có dòng chưa duyệt (đóng hộp = đóng form). Hộp xác nhận trước khi gửi gồm cả "Cho TBP xac nhan". Thông báo người tạo (`thongBaoChoNguoiTao`) kèm lý do + thêm Chờ thanh toán / Chờ GS / Chờ TBP (loại `cho_thanh_toan`/`cho_duyet`); Kho tiếp nhận / cập nhật dự kiến ticket chờ hàng cũng báo người tạo.

**Báo cáo tổng thể — "Tổng thực tế đã mua"** (sửa 2026-10-15, v1.331): trước chỉ cộng đơn có CẢ `gia_chot` lẫn `so_luong_thuc_xuat` → từ khi giá tự tính gần như luôn 0. Giờ = đơn "TN da duyet" nhóm Mua + TRỪ CÔNG NỢ (không đơn gửi bù): đơn trong PXK còn hiệu lực = "Tiền cần chuyển" THẬT của phiếu chia theo tỉ lệ giá × SL (CTE `ddh_tt`, window `SUM() OVER (PARTITION BY pxk)`), chưa vào phiếu = giá (giá chốt nếu có) × SL. Công nợ ký gửi không tính. Cache key `bao-cao-tong-the-v2`.

**Bỏ bước TBP** cho LK đặc thù khi loại đề xuất chứa MUA / HỖ TRỢ / **TRỪ CÔNG NỢ** (`boQuaTbpChoDacThu()` backend,
bản sao `boQuaTbpDacThu()` FE cho cảnh báo ở `LinhKienPicker`).

**Đặc thù theo đơn + bật/tắt nhanh** (chốt 2026-10-02, migration `0064`): đặc thù HIỆU LỰC của đơn = `DAC_THU_DON_SQL` =
`COALESCE(ddh.dac_thu_thu_cong, lk.dac_thu, 0)` (danh sách/chi tiết đơn trả `dac_thu` = hiệu lực + `lk_dac_thu`; `applyDonHangLog`
cũng đọc nó) — đọc đặc thù của đơn ở chỗ mới thì dùng hằng này, KHÔNG `lk.dac_thu`. TN/Admin bật/tắt trên chi tiết đơn (`PATCH
/dat-mua-lk/don-hang/:id/dac-thu`): tắt khi "Cho TBP xac nhan" → "Cho TN duyet"; bật khi "Cho TN duyet" (loại đề xuất không bỏ qua
TBP) → "Cho TBP xac nhan" + báo TBP; chỉ ghi log khi trạng thái ĐỔI (log cùng trạng thái reset hạn 24h). Bảng giá: công tắc cột
"Đặc thù" (`PATCH /settings/linh-kien/:ma/dac-thu`) cho TN/Kế toán/người sửa LK (TN/Kế toán được cấp menu Bảng giá). **"Chờ hàng"
chỉ bắt buộc đã thanh toán với đơn ĐẶC THÙ** (`chuaChuyenTienChoHang` = `bat_buoc_chuyen_tien` + đặc thù hiệu lực + chưa thanh toán).

**GS — "Khu vực xem thêm"** (chốt 2026-10-02): Admin chọn thêm Khu vực cho tài khoản GS ở Quản lý người dùng › Nhân viên văn
phòng (CÙNG bảng `user_khu_vuc`; GS trước chỉ thấy khu vực mình phụ trách, read-only). Scope GS = điều kiện cũ **OR** cột
`khu_vuc_ma` của đơn/PXK/KTV nằm trong `user_khu_vuc` (`gsKhuVucXemThemSql()` ở `scopeDatMua.ts`) — áp ở `scopeDatMuaNguoiTao`,
`scopePxkNguoiNhanHang`, `baoCaoScope`, 3 nhánh GS Thiếu LK, `ktvTonKho` scope; bộ lọc khu vực mặc định (`khuVucCuaToiSet`,
`/khu-vuc-cua-toi`) gộp luôn. Thêm nhánh scope GS mới → nối điều kiện này. Chỉ mở rộng XEM, không đổi GS/`email_gs`. Danh sách
Nhân viên văn phòng có cột "Khu vực được xem" (`khu_vuc_gan`).

**GS đặt hộ cho MỌI KTV** (chốt 2026-09-28): `/nguoi-nhan-hang-kha-dung` trả toàn bộ KTV cho GS, bỏ chặn
`NGUOI_NHAN_HANG_NGOAI_PHAM_VI`/`NGOAI_PHAM_VI_GS` (tạo đơn, import, cảnh báo công nợ/dự phòng/dự đoán duyệt).
Scope xem của GS = `ddh.email_gs = GS` **HOẶC `ddh.nguoi_tao = GS`** (để thấy lại đơn mình đặt ngoài khu vực);
báo cáo tổng thể/PXK của GS vẫn theo khu vực.

Quản lý tài khoản tách 2 thẻ ở `UsersModule.tsx`: **"KTV hiện trường"** (chuyển từ
`SettingsModule.tsx`/"Danh sách KTV" sang đây — CRUD/tìm kiếm/lọc cấp 1-2/khu vực/bulk-import/công
nợ) và **"Nhân viên văn phòng"** (lọc `nhom=van-phong`, gán nhiều Khu vực cho TN/Kho/Kế toán qua
`user_khu_vuc`). `SettingsModule.tsx` chỉ còn tab "Khu vực" cho phần Khu vực (CRUD + gán GS).

## Bảo vệ hệ thống (chốt 2026-10-08, v1.312, migration `0073`)

App chạy trên `*.workers.dev` → KHÔNG có WAF/Rate Limiting rule của Cloudflare (cần tên miền riêng) — mọi lớp bảo vệ nằm
trong Worker, KHÔNG chặn được DDoS phân tán nhiều IP. `lib/baoVe.ts` gắn cho `/api/*` TRƯỚC mọi router: (1) giới hạn tần suất
bằng binding `ratelimits` (`wrangler.jsonc`): 600/phút theo tài khoản (phiên hợp lệ), 300/phút theo IP khi chưa đăng nhập,
600/phút theo khóa API đối tác → 429 `QUA_NHIEU_YEU_CAU`; (2) request GHI từ trình duyệt phải cùng origin (`Sec-Fetch-Site`,
fallback `Origin`) → 403 `YEU_CAU_TU_SITE_KHAC` — app anh em `*.dichvu3t.workers.dev` là "cùng site" nên SameSite=Lax không đủ;
`/api/partner*`, `/api/khovan-partner*` bỏ qua; (3) header nosniff/DENY/no-store cho API. Trang tĩnh: `frontend/public/_headers`
(CSP — thêm domain ngoài mà frontend `fetch()` thì thêm vào `connect-src`; `frame-ancestors 'self'` vì App.tsx tự nhúng iframe
xem trước Mobile; `'wasm-unsafe-eval'` + `blob:` cho tesseract OCR). **Ảnh** (`lib/anhUpload.ts`): mọi đường tải ảnh lên Drive đi
qua `nhanAnhTaiLen()` (body request) / `taiAnhTuUrl()` (import Excel có link ảnh) — JPG/PNG/WEBP/GIF/HEIC (không SVG), ≤ 10MB, ≤ **20
ảnh/ngày/tài khoản**, Kế toán / Tác nghiệp / Giám sát ≤ **100** (v1.313, `hanMucAnhNgay()`; bảng `anh_upload_ngay`, ngày VN, Admin
không giới hạn; cron 0h xoá số đếm > 30 ngày). Upload thành công trả `han_muc_anh` {da_dung, han_muc} → FE `canhBaoHanMucAnh()`
cảnh báo khi vừa dùng hết; hết lượt → 429 `QUA_SO_ANH_NGAY` kèm `han_muc` → `baoLoiTaiAnh()`/`loiHetHanMucAnh()`
(`frontend/src/lib/hanMucAnh.ts`, đọc `ApiError.body`); import ảnh hàng loạt trả `het_han_muc_anh` (Bảng giá dừng import ảnh + cảnh
báo). Thêm chỗ tải ảnh mới → gọi 2 helper này. **KTV / Vệ tinh ≤ 50 ảnh/ngày** (2026-10-22, v1.393, `ANH_NGAY_KTV` — đơn trả hàng cần 1–3 ảnh MỖI dòng; tài khoản khác không phải văn phòng vẫn 20). **Form tạo đơn lưu nháp trên máy** (v1.393, `useTaoDonForm.ts` `docNhapTaoDon`/`luuNhapTaoDon`, localStorage `tao-don-nhap:<email>`, giữ 3 ngày): mở camera chụp ảnh trả hàng trên điện thoại có thể làm trình duyệt TẢI LẠI trang → trước đây mất cả đơn đang soạn lẫn link ảnh ĐÃ tải lên Drive (KTV chụp lại, hết hạn mức mà chưa tạo được đơn — KTV Nguyễn Vũ Trí, migration `0097` đặt lại bộ đếm ngày cho tài khoản này). Ghi mỗi lần đổi (người nhận, SĐT KH lẻ, mọi dòng kể cả `anh`, dòng đang mở), mở lại form → khôi phục + `NhapKhoiPhucBanner` ("Soạn mới" = bỏ nháp); tạo đơn xong form về rỗng → tự xoá. FE `anhVuaGioiHan()` tự nén ảnh > 10MB trước khi gửi. URL ảnh client gửi lên: bằng chứng chuyển tiền + ảnh trả hàng lúc tạo đơn CHỈ nhận link Drive
(`laUrlAnhDrive`), ảnh đóng gói/ảnh minh hoạ LK chỉ http(s) (`laUrlHttp`); FE đưa link vào `href` qua `linkAnToan()`
(`lib/linhAnToan.ts` — React không chặn `javascript:`). **Thu hồi phiên**: JWT mang `pv` = `users.phien_ban_phien`; `loadUser` so
với tài khoản THẬT → 401 `PHIEN_DA_THU_HOI`. "Đăng xuất mọi thiết bị": tự mình (menu tài khoản, `POST /auth/dang-xuat-moi-thiet-bi`)
hoặc Admin (sửa tài khoản, `POST /users/:email/dang-xuat-moi-thiet-bi`). Khác: khóa khovan so bằng `khoaKhop()` (băm + XOR),
endpoint Web Push chỉ nhận host dịch vụ push thật, unsubscribe chỉ xoá của chính mình, `page`/`pageSize` không ra NaN,
POST `/phieu-dat` tối đa 300 dòng. Chưa làm (cần người dùng quyết): ảnh Drive đang công khai theo link, KTV xem được email danh
bạ/giá KTV qua API, 1 khóa đối tác dùng chung; `xlsx` 0.18.5 còn cảnh báo bảo mật (npm không có bản vá — chỉ đọc file người dùng tự chọn).

## Điểm nối hệ DVBH gốc (quan trọng)

Hệ này gọi **đúng một** endpoint bên hệ gốc: `GET /api/partner/case-lookup?id=<case_id>`
(`backend/src/routes/partnerApi.ts` của hệ gốc), xác thực bằng header `X-API-Key` (cùng cơ chế
`partnerApiAuth.ts` sẵn có của hệ gốc — hash SHA-256 trong `partner_api_keys`). Trả về một tập nhỏ đã
chọn lọc, KHÔNG có dữ liệu tài chính/nhạy cảm: `ky_thuat_vien, khach_hang, seri_san_pham, khu_vuc,
tinh, quan_huyen, hang, san_pham_bao_hanh, tien_do_hoan_thanh`.

`lib/caseLookupClient.ts` (`lookupCase`/`lookupCases`) gọi endpoint này qua
`env.CASE_LOOKUP_BASE_URL` + `env.CASE_LOOKUP_API_KEY`, dùng ở 3 chỗ trong
`routes/datMuaLinhKien.ts`: kiểm tra mã yêu cầu sự cố lúc tạo đơn, hiển thị thông tin case ở màn chi
tiết đơn, và kiểm tra tồn tại case lúc gắn thêm case vào đơn. Ô "Mã YCSC" chỉ gửi tra cứu khi mã đúng dạng
`isLikelyCaseId()` (> 5 ký tự: toàn số / `T`+số / `SC`+số — có bản sao FE ở `MaYeuCauSuCoCheck.tsx`, đổi 1 bên đổi cả 2;
thiếu `SC` từng làm mã "SC261003300" không phản hồi gì, 2026-10-07); `fetchCaseLookupRaw()` quy `t…`/`sc…` về chữ HOA vì DVBH
lưu + khớp đúng chữ hoa. **ID Lada hiện thẻ tra cứu** (2026-10-20, v1.375 — "ID lada đang không hiện UI thông tin case"): KTV hay gõ CÙNG 1 ID Lada (vd B1430288) vào CẢ ô Mã YCSC lẫn Mã Lada → ô Mã YCSC gặp mã dạng Lada (không phải mã case) thì hiện thẻ `MaLadaCheck` (bỏ qua khi trùng ô Mã Lada cùng dòng — prop `maLada`); chi tiết đơn hiện thẻ đơn Lada dưới dòng "Mã Lada" (hoặc theo Mã YCSC dạng Lada) — `maLadaTraCuu()` ở `DonCuaToiTab.tsx`. **App KTV — khối "Chuyển tiền" lên đầu chi tiết PXK** (v1.375): người xem không phải TN/Kho/Kế toán/Admin → `veKhoiChuyenTien()` vẽ ngay dưới mini pipeline (`uuTienTien`), văn phòng giữ vị trí cũ.

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
