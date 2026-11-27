# CLAUDE-full.md — linh-kien-app (bản CHI TIẾT ĐẦY ĐỦ)

> Bản rút gọn (luật chính, < 10 KB, app chủ trên đám mây đọc) nằm ở [`CLAUDE.md`](CLAUDE.md). File này KHÔNG tự nạp vào phiên —
> mở khi cần chi tiết. Mọi tính năng / quyết định mới ghi chi tiết TẠI ĐÂY (đúng mục), CLAUDE.md chỉ giữ luật chung.
> Tách ngày 2026-11-24 (yêu cầu Trợ lý Mây: CLAUDE.md 340 KB làm đầy bộ nhớ phiên đám mây).

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
  **QC xác nhận SL đạt → tách phần còn lại** (chốt 2026-11-10, v1.465 — "gửi 6 LK, QC xác nhận 5, 1 LK sẽ được tách riêng đơn chờ QC xác nhận tiếp"):
  `POST /tra-hang/:id/log` duyệt ở "Cho QC xac nhan" kèm `so_luong_dat` (1..SL đang nhận = `COALESCE(so_luong_thuc_xuat, so_luong_de_xuat)`; bước khác →
  `SL_DAT_CHI_O_BUOC_QC`). Nhỏ hơn SL đang nhận → 1 batch CAS theo `version`: INSERT đơn MỚI (chép mọi cột trừ id/SL/công nợ/phiếu/trạng thái/version/
  `ma_thung_tra` — UNIQUE, mã thùng ghi vào log) SL còn lại "Cho QC xac nhan" + UPDATE đơn gốc SL = SL đạt (`so_luong_thuc_xuat` NULL, công nợ chia theo SL)
  → "TN da duyet" + tự gom phiếu PTL như thường; chép `tra_hang_log`, `tra_hang_anh`, Mã YCSC bổ sung sang đơn mới, báo QC. API trả `don_tach`. UI: ô "SL QC xác
  nhận đạt" ở chi tiết đơn trả hàng (`TraHangTab.tsx`, dùng chung state ô SL của Kho).
  **Đẩy lùi đơn QC đã duyệt + popup xác nhận đạt + bằng chứng từ chối** (chốt 2026-11-10, v1.466, migration `0113` — DDH-002554 "bị xác nhận nhầm …
  không cho đẩy lùi sau khi QC xác nhận nhầm"; "khi QC từ chối sẽ nhập lý do từ chối + ghi chú + up ảnh bằng chứng + video bằng chứng (tối đa 100mb)"):
  `POST /tra-hang/:id/log-lui` nhận đơn "TN da duyet" (QC / Kế toán / Kho / Admin) khi `DAY_LUI_QC_DUOC_SQL` (phiếu PTL chứa đơn chưa qua "Cho ke toan")
  → `goDonKhoiPxk` (phiếu hết đơn tự hủy) + về "Cho QC xac nhan"; chi tiết trả `day_lui_qc_duoc`. QC duyệt (chi tiết + ✓ danh sách) mở `QcXacNhanDatModal`.
  `QcTuChoiModal`: lý do (bắt buộc, gợi ý `LY_DO_QC_GOI_Y`) + ghi chú → gộp 1 `ghi_chu` "Lý do: … — Ghi chú: …", ảnh 1–30, video ≤ 100MB ≤ 30/đơn (v1.492, trước 3 ảnh / 2 video; QC 100 ảnh/ngày; hộp đọc lại ảnh/video đã lưu trên server — đóng/mở lại không mất): trình duyệt
  PUT THẲNG lên Drive qua phiên resumable (`POST /:id/video/bat-dau` → `batDauTaiVideo` kèm header Origin cho CORS; `POST /:id/video/xong` → `hoanTatVideo`
  kiểm tra thư mục app / dung lượng / video/* rồi công khai, bảng `tra_hang_video`); CSP `connect-src` có `https://www.googleapis.com`.
  **Đếm việc đúng vai trò + chặn số vô lý** (2026-11-10, v1.467): số mục "Hàng trả" + mục con chỉ đếm bước của chính người xem (`buocTraHangCuaToi` ở
  `layout/navConfig.ts` — Kế toán / Kho / QC; không xử lý bước nào = người theo dõi, thấy cả 3); "Thiếu hàng bảo hành" — "Cần tôi xử lý" + badge chỉ Kho THẬT /
  Admin đếm "Cho kho xu ly" (`viecKho`, TN chỉ thao tác hộ), Mua hàng "Cho mua hang". Báo cáo tổng thể "Tiền đang đặt mua" / "Tiền chờ duyệt" = giá chốt (nếu
  có) × SL thực xuất (nếu có), cache `bao-cao-tong-the-v4`. Giới hạn `loiGioiHan` (`datMuaLinhKien.ts`): SL ≤ 10.000/dòng (tạo, kiểm tra, import, sửa, SL thực
  xuất), giá chốt ≤ 1 tỷ, tiền công nợ ≤ 10 tỷ → `SO_LUONG_QUA_LON` / `GIA_QUA_LON` (Σ Tổng cộng từng ra 11.111.111…đ do 1 đơn gõ nhầm).
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
  theo tổng thực tế; Đình tủ luôn ×85%). Màn tạo đơn: "Giá ước tính" từng dòng + tổng dưới chân = giá SAU chiết khấu (`giaUocTinhDong()` ở `useTaoDonForm.ts`, v1.320 — bản sao FE của quy tắc `tinhToanPxk`; tổng ngày ≥ 500k mà LK chưa có Giá KTV → dòng giữ giá niêm yết + cảnh báo `CanhBaoChuaCoGiaKtv` ở `TongNgayKtv.tsx`, v1.425: KH lẻ/có yêu cầu hóa đơn = niêm yết, Đình tủ ×85%, mốc theo tổng ngày đã tạo + dòng đang soạn; không tính giá dự phòng; dòng công nợ/trả hàng giữ niêm yết) kèm nhãn mức + giá niêm yết gạch ngang — đổi quy tắc giá ở backend phải sửa cả đây. Hiển thị tổng ngày + "Ước tính chuyển": `GET /api/dat-mua-lk/tong-ngay-ktv`
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
- **Lọc cột kiểu Excel ở Hàng trả** (2026-11-21, v1.550 — "ở mục trả hàng thêm các bộ lọc và table thêm các filter dạng excel"): `GET /tra-hang` tách điều kiện
  ra `traHangListWhere()` (`traHang.ts`, dùng chung với `GET /tra-hang/gia-tri-loc?cot=` — đặt TRƯỚC `/:donHangId`), nhận thêm `tu_ngay`/`den_ngay`/
  `nguoi_nhan_hang` + `cf`/`cs`/`cd` theo `TRA_HANG_COT_LOC` (mã LK, người nhận, ngày đề xuất, SL, loại đề xuất, HĐ, trạng thái, phiếu xuất kho, khu vực, người
  tạo). FE `TraHangTab.tsx`: nút phễu ở tiêu đề cột (cùng `LocCot.tsx`), `LocNgayTao` + mọi cột lọc trong bảng "Bộ lọc", chip cột đang lọc; danh sách / "Tải
  danh sách chi tiết" / ô lọc dùng chung `thamSoLoc`. Sắp xếp cột = sắp dòng trong từng nhóm người tạo.
- **Side "Người nhận hàng" ở danh sách Đơn hàng + Phiếu xuất** (2026-11-04, v1.435; Phiếu xuất + kéo rộng/hẹp v1.436, `datMuaLinhKien/NguoiNhanSide.tsx`, desktop ≥ lg): cột bên trái
  liệt kê người nhận + "(x số đơn)" = CÙNG `gia-tri-loc?cot=nguoi_nhan_hang` của lọc cột (khớp bộ lọc đang xem); bấm tên = đặt lọc cột
  "Người nhận hàng" (Ctrl + bấm = chọn thêm, bấm lại = bỏ); ẩn/hiện lưu localStorage `dmlk-side-nguoi-nhan` / `pxk-side-nguoi-nhan` (`useHienSideNguoiNhan`), độ rộng kéo mép phải 180–520px
  lưu `<khoa>-rong` (bấm đúp = 260px); tên người nhận 1 dòng + "…". **Thanh công cụ Phiếu xuất 1 hàng** (v1.438, "thiết kế lại … gọn hàng và sạch sẽ"): nhóm phân đoạn loại đơn | ô tìm | Bộ lọc (số) | Đơn chờ xử lý | ✕ xoá lọc |
  bên phải ⊞ xổ dòng (icon) + "⬇ Tải xuống ▾" (`datMuaLinhKien/MenuTai.tsx`, gộp Tải chi tiết phiếu / đơn + 3 mẫu MISA) + "+ Tạo phiếu xuất kho" (primary duy nhất);
  "Tùy chỉnh cột" nằm trong bảng Bộ lọc. Tab này không còn dùng `FilterSearchBar`. Cùng đợt: popup lọc cột rộng
  380px + ô `Select` có tìm kiếm rộng ≥ 320px, nhãn dài tự xuống dòng thay vì cắt "…" (tên người dài bị mất chữ).
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
  như hệ gốc), Google Drive OAuth (uỷ quyền tài khoản thật để upload ảnh minh hoạ linh kiện; refresh token mã hoá AES-GCM bằng khoá dẫn xuất từ
  `SESSION_SECRET` — `lib/secretBox.ts`. **Đổi `SESSION_SECRET` = token cũ hỏng** (v1.574): `getUserAccessToken` bắt lỗi giải mã → ném `GOOGLE_DRIVE_NOT_CONNECTED`
  (người tải ảnh thấy "vào Cài đặt để kết nối" thay vì lỗi AES-GCM); `/google-drive/status` trả `can_ket_noi_lai` → tab Google Drive hiện "Cần kết nối lại"),
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
  **Ghép phiếu 1 đơn** (2026-11-07, v1.453 — "ghép 2 đơn này làm 1 phiếu"): phiếu "Dang tao phieu" CHỈ 1 đơn cũng mở hộp này nhưng chỉ còn
  "Ghép vào 1 phiếu có sẵn" (+ "Chỉ bỏ khỏi phiếu"); `/chuyen` chặn `dich:"moi"` khi phiếu nguồn 1 đơn (`PHIEU_CHI_1_DON`), chuyển xong phiếu nguồn
  trống → `huyPxkNeuTrong` ngay (log "đơn duy nhất … đã chuyển sang phiếu …", hoàn quỹ nếu còn tiền), trả `nguon_da_huy`.
  **Phiếu đích đã có Mã MISA** (2026-11-07, v1.454 — "cho phép ghép vào phiếu đã có mã misa (nhưng note cảnh báo …)"): `PHIEU_NHAN_DUOC_SQL` = cùng người
  nhận/loại/đối tác + "Dang tao phieu" HOẶC "Cho ke toan" (bỏ điều kiện chưa Mã MISA / Kế toán chưa duyệt tiền — như thêm đơn tay `POST /:id/dong`); phiếu
  "Cho ke toan" chỉ nhận đơn "TN da duyet" (`DON_CHUA_DUYET_PHIEU_KE_TOAN`). Tiền đích qua `taiTinhPxk` (thiếu → phiếu về Chờ mã HĐ). Hộp chọn gắn badge
  "⚠ Đã có Mã MISA" + khối cảnh báo Kế toán phải sửa chứng từ; log phiếu đích ghi kèm Mã MISA.
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
  nhiều mã — đổi quy tắc giữ hàng phải sửa cả 2). §4.11–4.12. 2026-10-29 (app "Phân tích tồn kho 3T" — repo `phan-tich-ton-kho-3t` kéo về hằng giờ / hằng đêm): `/v1/ton-kho` trả thêm `dau_ky`/`nhap_kho`/`xuat_kho` (kỳ = `ky_tu_ngay`..`ky_den_ngay` của meta — app đó dùng `xuat_kho` của KTV cho báo cáo thu hồi); `GET /v1/linh-kien/danh-sach` (danh mục gọn, con trỏ `after_ma`) + `GET /v1/danh-ba-kho` (kho công ty + mã KTV, `ma_misa` = mã kho KTV, `dang_lam`) — §4.13–4.14. Mảng CHƯA có API (người dùng chưa chọn): danh sách đơn/PXK theo KTV/thời gian,
  danh mục tham chiếu (loại đề xuất, lý do chậm, loại chiết khấu, danh bạ KTV kéo về), tài chính (quỹ, khoản chuyển tiền, Công nợ 0 đồng).
  **Trả thêm ID Lada** (2026-11-09, tài liệu 1.5 — đối tác báo "chỉ nhận được ID CRM"): `/v1/case-timeline` (`OrderTimeline.ma_yeu_cau_su_co`/
  `ma_lada`, `lib/partnerTimeline.ts`), `/v1/linh-kien/lich-su`, `/v1/thieu-hang` trả `ma_lada` (cột `dat_don_hang.ma_lada`, migration `0054`) +
  `ma_yeu_cau_su_co` bên cạnh `case_ids` (nhiều ca gắn đơn). 2 mã ĐỘC LẬP: loại đề xuất công nợ/HỖ TRỢ chỉ cần 1 trong 2 → đối tác phải đọc cả hai,
  không suy mã này từ mã kia. Tài liệu §4.15 giải thích 2 loại mã.
  **`POST /v1/don-loi-loc`** (2026-11-11, v1.469, §4.16) — hệ DVBH menu "QL NSKX" gửi ≤1000 mã ca (+ cặp `[ma_lada, case_id]`), nhận đơn loại "HỖ TRỢ NGOÀI BẢO HÀNH TG12…" còn hiệu lực (bỏ `TN tu choi`/`Tu choi`/`Da huy`) của từng ca; khớp qua `dat_don_case` / `ma_yeu_cau_su_co` / `ma_lada` (đều có index). Đổi quy tắc "đơn còn hiệu lực" thì báo bên DVBH.
  **`POST /v1/don-gan-nhat-theo-ca`** (2026-11-12, v1.475) — hệ DVBH "Quản lý tồn" > Danh sách chi tiết, cột "ID đặt hàng gần nhất": gửi ≤1000 cặp
  `[case_id, ma_lk_thieu]` (+ `lada` `[ma_lada, case_id]`, + `ma_don` `[DDH-xxxxxx, case_id]` đọc từ ô "Mã xuất hàng liên quan" của giải trình), nhận 1 đơn/ca:
  bỏ đơn trả hàng/`TN tu choi`/`Tu choi`/`Da huy`, ưu tiên đơn đúng mã LK thiếu (kể cả mã cùng nhóm thay thế), rồi đơn tạo mới nhất. Kèm `ngay_duyet`
  (lần đầu "TN da duyet"), `ngay_xuat` (lần đầu PXK "Dang gui KTV"), `ngay_ktv_nhan`, `trang_thai_pxk` (mã `TRANG_THAI_PXK_DON_SQL`), `ket_thuc`
  (PXK KTV đã nhận/trừ kho/kho kết thúc). DVBH lưu vào bảng riêng, hỏi lại mỗi giờ 8h–18h — đổi tên trạng thái/quy tắc chọn đơn thì báo bên DVBH.
- **Đặt linh kiện qua API đối tác** (chốt 2026-11-11, v1.470, migration `0114`, `routes/partnerDatHang.ts` — "tạo 1 api cho phép hệ thống đối tác đặt linh kiện thông qua api"):
  `POST /api/partner/v1/dat-hang` (+ `/kiem-tra`, `GET /v1/dat-hang`, `GET /v1/loai-de-xuat`). Mỗi API key gắn `partner_api_keys.email_dat_hang` (Admin chọn ở Cài đặt ›
  API đối tác; NULL = key chỉ tra cứu → 403 `KEY_CHUA_DUOC_CAP_QUYEN_DAT_HANG`). Route nạp tài khoản đó vào `c.set("user")` (`taiAppUserTheoEmail` ở `loadUser.ts`) rồi gọi
  CHÍNH `taoPhieuDat()` / `kiemTraPhieuDat()` (export từ `datMuaLinhKien.ts`, thân của POST `/phieu-dat` + `/kiem-tra`) — quyền theo tài khoản (KTV chỉ cho mình, TN/GS/Admin
  đặt hộ), không có bản logic thứ 2. Người nhận: `email_nhan_hang` | `ma_ktv` | `ma_misa`; loại đề xuất quy về tên danh mục đang bật; KHÔNG trả hàng (cần ảnh Drive);
  ≤ 100 dòng. `ma_yeu_cau` bắt buộc → `client_request_id = "api<keyId>:<ma>"` (unique) chống trùng; `phieu_dat.partner_key_id` → GET chỉ trả phiếu của chính key.
  Tài liệu `docs/HUONG_DAN_API_DOI_TAC_LINH_KIEN_APP.md` §4.17. Sửa POST `/phieu-dat` là đổi luôn API này.
  **Đặt thay đúng người bấm** (v1.473, migration `0115`, cho DVBH "QL NSKX" đặt lõi lọc TG12-NSKX — chủ hệ thống: "người đặt sẽ dựa vào tài khoản người ấn xác nhận
  đặt hàng"): key bật `partner_api_keys.dat_thay_nguoi_dung` được gửi `email_nguoi_dat` trong body → đơn ghi là do CHÍNH tài khoản đó đặt (nạp bằng `taiAppUserTheoEmail`,
  quyền của tài khoản đó; tài khoản phải có trên app + đã duyệt + không khoá). Key KHÔNG bật mà gửi `email_nguoi_dat` → 403 `KEY_KHONG_DUOC_DAT_THAY_NGUOI_DUNG` (không
  âm thầm dùng `email_dat_hang`). Admin bật ở Cài đặt › API đối tác (popup "Tài khoản đặt hàng"). Chỉ bật cho hệ nội bộ đã tự xác thực người dùng (DVBH: Google login).
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

- **Form tạo đơn desktop kiểu "giỏ hàng" + Sao chép dòng + Tạo đơn giống** (v1.491; bố cục làm lại v1.494, chốt 2026-11-14 — "giao diện chiếm 95% diện tích màn làm việc … nhóm các vấn đề"; "quá nhiều vùng bị trống … trong 3-5s phải biết nhập cái gì, nhập ở đâu, các cảnh báo rõ ràng, đầy đủ"; "nút copy nội dung đơn này bên cạnh +Thêm dòng … bỏ trống linh kiện"; "Thêm nút này ở các đơn đang có sẵn … nếu đơn đó chưa có trong ds thì điền luôn linh kiện - nếu có trong ds đang tạo thì bỏ trống"):
  - `TaoDonTab.tsx` (desktop) = Modal 95vw × 95vh (`Modal` prop `bodyClassName`, mỗi cột cuộn riêng). Trên: thanh cấp phiếu 1 hàng (TN/GS: người nhận, SĐT KH lẻ, Import Excel). TRÁI: khung soạn 1 dòng, mỗi nhóm 1 HÀNG NGANG nhãn + số thứ tự bên trái (`Hang`), ô trên lưới 12 cột — 1 Linh kiện (mã | SL | giá + gợi ý tồn / thay thế / ảnh trả hàng), 2 Phân loại đơn (loại đề xuất, đối tác, chính sách, hóa đơn), 3 Mã liên quan & phê duyệt (YCSC | Lada | TT+Mail duyệt), 4 Thông tin thêm (TT KH | Ghi chú); ngay dưới là BẢNG "Đơn đang tạo" (mỗi dòng: LK, loại, SL, mã, giá, "Kết quả dự kiến" `ketQuaDong` từ `/phieu-dat/kiem-tra` hoặc "Thiếu: …", ⧉/✕). PHẢI (360px): "Dòng N — cần nhập" (checklist ô bắt buộc `yeuCauDong()` — CÙNG điều kiện `isLineComplete` ở `useTaoDonForm.ts`, đổi 1 bên đổi cả 2; bấm = nhảy + focus ô theo id `tdo-*`), "Cảnh báo (N)" gom 1 chỗ xếp đỏ → cam → xanh (MISA, lỗi phiếu, từng dòng bị chặn / sẽ chờ — câu `moTaKetQua`, chưa có Giá KTV, vượt trần, dự phòng; bấm = mở dòng), "Tổng đơn" + tổng ngày, nút "Tạo đơn" cố định + lý do khi bị khoá. Ô bắt buộc còn trống viền đỏ. Dưới `lg` các khối xếp dọc. Mobile (`TaoDonMobileScreen`) giữ nguyên, chỉ thêm chip "⧉ Sao chép".
  - `saoChepDong()` (`useTaoDonForm`) = thêm dòng cuối chép y nguyên dòng đang soạn, bỏ trống Mã LK + ảnh trả hàng.
  - "⧉ Tạo đơn giống" ở header chi tiết đơn (`DonHangDetailModal`, người được tạo đơn, không áp đơn đồng bộ sửa chữa): `taoDonGiong.ts` hàng chờ + sự kiện window `tao-don-giong`; form đang mở tự thêm dòng (Mã LK đã có trong danh sách → để trống, cả khi "mở lại" nháp cũ), chưa mở → `TaoDonGiongHost` (App.tsx) mở form. TN/GS tạo từ form trống → lấy luôn người nhận hàng của đơn gốc. Không chép ảnh.
- **Luồng quy trình trong chi tiết đơn + tên trạng thái theo bước** (chốt 2026-11-14, v1.494 — "khi KTV click xem 1 đơn hàng họ có thể nhanh chóng hình dung ra đơn của mình đang ở đâu"; "Thay đổi tên trạng thái … ví dụ TN duyệt => giờ hầu như không còn vai trò tác nghiệp nữa => thay thế vào đó là trạng thái hiện tại của đơn trong phiếu"):
  - `datMuaLinhKien/LuongDon.tsx`: `viTriDon()` = NGUỒN DUY NHẤT suy bước hiện tại từ `trang_thai_hien_tai` + mã `trang_thai_pxk` / `thanh_toan` (`lib/trangThaiDonPxk.ts`). Luồng Mua/Công nợ: Đặt đơn → Duyệt & kiểm kho → Chuyển tiền (bỏ qua khi `thanh_toan` khong_can / cong_no_doi_tac; đã trả trước → xong) → Kế toán chốt → Kho xuất hàng → Giao KTV → KTV đã nhận (Hàng trừ kho bỏ qua Kho/Giao); Trả hàng: Đặt đơn → Kế toán duyệt → Kho xác nhận → QC kiểm tra → Kế toán chốt → Kho nhận hàng trả; hủy / từ chối = mốc đỏ cuối. Đơn đồng bộ sửa chữa không vẽ.
  - `LuongDon` (đầu chi tiết đơn): dòng "Đơn đang ở <bước> · Đang chờ <ai>", luồng ngang kiểu `PxkMiniPipeline` (mốc qua xanh + giờ + "+khoảng cách", mốc đang xử lý tô cam/tím nổi, bỏ qua viền đứt), "▾ Xem chi tiết" xổ danh sách dọc. Giờ mốc: log đơn + `pxk.moc_log` (JSON lần gần nhất phiếu vào từng trạng thái / Kế toán duyệt tiền — GET `/dat-mua-lk/don-hang/:id` thêm `moc_log`, `trang_thai_pxk`, `thanh_toan`).
  - `TrangThaiDonBadge` / `nhanTrangThaiDon()` thay badge trạng thái ở danh sách đơn, thẻ mobile, chi tiết đơn: đơn "TN da duyet" hiện BƯỚC CỦA PHIẾU (Chờ KTV chuyển tiền / Chờ Kế toán xác nhận tiền / Đã đủ tiền — chờ gửi Kế toán / Kế toán đang chốt phiếu / Kho đang xuất hàng / Đang giao — chờ KTV xác nhận / KTV đã nhận hàng / Đã trừ kho…), "Cho thanh toan" = "Kho thiếu — chờ chuyển tiền trước", "Cho hang" = "Chờ hàng về kho". Nhãn gốc (bộ lọc, lịch sử): "Chờ TN duyệt" → "Chờ duyệt đơn", "TN đã duyệt" → "Đã duyệt", "TN từ chối" → "Bị từ chối", menu "Chờ tác nghiệp" → "Chờ duyệt đơn", cột PXK "Chờ TN gửi kế toán" → "Chờ gửi kế toán", ticket "Da ket thuc" → "Đã duyệt đơn gốc". Giá trị DB không đổi. Đổi luồng ở backend → sửa bảng trong `viTriDon()`.
- **Mục "Luồng & logic hệ thống"** (2026-11-11, v1.472 — "Thêm mục logic thể hiện toàn bộ luồng chức năng, logic chạy app 1 cách đẹp đẽ đầy đủ"):
  menu Sidebar key `luong-he-thong` (nhóm "Hệ thống", icon `flow`) = `modules/LuongHeThongModule.tsx`. Quyền: mọi nhân viên văn phòng + Admin
  (`App.tsx`, cùng điều kiện "Báo cáo tốc độ xử lý" — KTV / Vệ tinh CHƯA mở). Nội dung TĨNH ở `modules/luongHeThong/noiDung.ts` (không API):
  tab Tổng quan / Đặt hàng & tự duyệt / Thiếu hàng / Phiếu xuất & tiền / Hàng trả / Giá, công nợ & đặc biệt / Vai trò & quyền / Kết nối hệ khác;
  mỗi luồng = luồng ngang `LuongNgang.tsx` (màu theo loại mốc: bắt đầu / tự động / chờ người / hoàn tất / hủy), bấm mốc xem ai xử lý, điều kiện,
  bước kế tiếp, hệ thống tự làm; "▾ Xem chi tiết" mở mọi bước; ô tìm trên máy nhảy tới đúng mốc. **Đổi luồng / trạng thái / quy tắc ở backend
  thì sửa câu tương ứng trong `noiDung.ts`** (không tự khớp).

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
- **Trang chủ — "Đơn hàng đang tồn theo KTV"** (2026-10-26, v1.405, `TonDongTheoKtvReport` ở `TrangChuTab.tsx`): ô "Tìm KTV" lọc nhóm theo tên /
  email / khu vực (`khopTim`, trên máy); bấm mã đơn trong bảng con = mở `DonHangDetailModal` ngay tại Trang chủ (tải lười) thay vì nhảy sang danh sách.
- **Trang chủ — số trên thẻ phải khớp danh sách khi bấm** (2026-10-01): thẻ đếm việc CỦA CHÍNH người xem (GS/KTV: PXK
  Chờ tiền/Chờ KTV nhận theo `pxk.nguoi_nhan_hang = mình` — `countCuaToi`/`s_cho_tien`/`s_xac_nhan_nhan`) mang `nguoiNhanHang`
  = email mình để danh sách lọc đúng (trước đó GS thấy 2 nhưng mở ra cả khu vực 28). "Đơn bị từ chối" = sentinel
  `__TU_CHOI_CHUA_XEM__` (đơn mình tạo bị từ chối, `thong_bao_ktv` chưa đọc) + `loaiDon:"all"`.
- **Trang chủ rà soát lại** (chốt 2026-11-07, v1.450 — "làm cả 3 đợt" sau rà soát Trang chủ):
  - **"Cần làm" = 1 nguồn** `GET /notifications/count` (`computeDatMuaLkBreakdown`) cho Trang chủ, nút "Cần làm (N)" đầu module và badge menu —
    FE dựng ở `datMuaLinhKien/viecCanLam.ts` (`danhSachViecCanLam` + `moViec`). Thêm việc mới: thêm trường ở breakdown + 1 dòng ở file này.
    Breakdown thêm `choTnTaoPxk` (phiếu "Dang tao phieu" hết tiền treo — `choTnPxk` = nó, KHÔNG còn đếm phiếu chờ tiền / "Dang gui KTV"),
    `choKeToanTien` (PXK `trang_thai_chuyen_tien='KTV da chuyen'`, lọc PXK sentinel `CHO_KT_TIEN`), `choTienCuaToi` / `choNhanHangCuaToi`
    (phiếu của chính người nhận) — cộng vào `total` + số mục "Phiếu xuất" (`navCount`). Mua hàng thuần có badge (`capDung`). Đọc
    `trang_thai_hien_tai` thay subquery log mới nhất. Việc ở Quỹ (nộp tiền, hoàn tiền) phát sự kiện `mo-nop-tien` / `mo-phieu-hoan-tien`
    (detail rỗng = chỉ mở tab).
  - **Popup "Việc bạn cần xử lý" khi KTV mở app** (2026-11-20, v1.535 — "khi ktv vào app … popup nhắc nhở các đơn tồn cần xử lý … ví dụ 2 phiếu đang chờ bạn
    chuyển tiền => click vào để xem"): `datMuaLinhKien/NhacViecPopup.tsx` (mount ở `App.tsx`) — CÙNG `/notifications/count` + `danhSachViecCanLam()` với "Cần làm"
    (bỏ "Đơn của tôi đang chờ duyệt", thêm "Đơn bị từ chối" `choDonBiTuChoi`, lời riêng KTV `NHAN_KTV`). Chỉ KTV / Vệ tinh / NV sửa chữa thuần (`la_ktv_dvbh` /
    `la_ve_tinh`, không Admin). Bấm mục → App `setActive(mucChoView)` + prop `externalJump` của `DatMuaLinhKienModule` (`jumpTo`, chặn hiệu ứng section /
    sidebarClick khi có); việc ở Quỹ phát sự kiện như "Cần làm". "Để sau" = sessionStorage theo số từng việc — mở app lại hoặc 1 việc tăng số thì hiện lại.
  - **Bỏ `/luong-quy-trinh` khỏi FE** (dải PipelineFlow đầu module + nguồn "Cần làm" máy tính — đếm bước Trạm/TBP/TN luôn 0 từ khi tự động
    duyệt). Đầu module mọi màn chỉ còn "Cần làm (N)" + "＋ Tạo đơn". Route backend còn nhưng không ai gọi.
  - **"Tồn đọng toàn hệ thống" tải lười**: `/home-summary` chỉ trả `coToanHeThong`; số liệu ở `GET /home-summary/toan-he-thong` (3 GROUP BY,
    gồm Chờ thanh toán / GS / KT xác nhận tiền / Chờ mua hàng) khi bấm mở.
  - **Đếm số menu 1 lần quét**: `/don-hang-status-counts` (GROUP BY + SUM CASE, đo thật 38k → 21k dòng/lần) và `/phieu-xuat-kho/status-counts`.
  - **"Đơn hàng đang tồn theo KTV"** theo phạm vi xem (`scopeDatMuaNguoiTao`, cache key theo người khi có scope) + lọc khu vực theo khu vực
    CỦA ĐƠN (`COALESCE(khu_vuc_chon, khu_vuc_ma)`).
  - Báo cáo tổng thể: "Đơn đang chờ" / "Tiền chờ duyệt" tính thêm "Cho GS duyet" + "Cho thanh toan" (`DANG_CHO_DUYET_STATES`, cache v3); bỏ
    biểu đồ "Top 5 KTV tồn đọng"; "Phạm vi dữ liệu" gộp vào hàng tiêu đề "Đang tồn".
  - Cron 0h VN: ~~thông báo chưa đọc quá 30 ngày → `da_doc = 1`~~ → từ v1.534 (2026-11-20, "các thông báo sau 10 ngày tự clear để giảm tải áp lực cho hệ thống lưu trữ") XOÁ HẲN mọi thông báo chuông (`thong_bao_ktv`) quá 10 ngày, đã đọc lẫn chưa đọc — `xoaThongBaoCu()` (`lib/donThongBao.ts`, lô 5.000 dòng). Lúc làm: 149.555 dòng, 117.411 quá 10 ngày. Thẻ "Đơn bị từ chối" (`__TU_CHOI_CHUA_XEM__`) vì vậy chỉ còn đếm đơn bị từ chối trong 10 ngày.
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
sách + "↩ Đẩy lại chờ duyệt" (kèm ghi chú) ở footer chi tiết đơn. **Mở rộng 2026-10-16 (v1.353)**: đẩy lại được MỌI đơn bị NGƯỜI KHÁC hủy/từ chối (Kho từ chối ticket thiếu hàng → đơn tự hủy, TBP/GS/Trạm từ chối, TN/Kế toán/Admin hủy) — `dayLaiHanSql` chỉ loại đơn do chính người tạo / người nhận hàng tự hủy (trừ khi họ là TN/Kế toán/Admin); vẫn 24h, vẫn về "Cho TN duyet". Nút "↩ Đẩy lại đơn gốc" cũng có trong Drawer ticket thiếu hàng (v1.354, `ThieuLkTab.tsx`) — `GET /thieu-lk/:id` trả `ddh_trang_thai`/`ddh_day_lai_han` (cùng `dayLaiHanSql`), gọi chung `POST /don-hang/:id/day-lai`. **Đẩy lại TICKET** (chốt 2026-10-16, v1.355, `lib/dayLaiThieuLk.ts` — "đẩy ticket lại trạng thái trước khi bị từ chối => đơn gốc cũng đẩy ngược lại theo ticket"): `POST /thieu-lk/:id/day-lai` (TN/Kế toán/Kho/Admin) — ticket "Da huy bo" (ticket MỚI NHẤT của đơn) ghi thêm log = trạng thái MỞ cuối cùng trước đó, đơn gốc "Da huy" (bị hủy ngay sau "Cho hang", không do chính người tạo/nhận tự hủy) về "Cho hang" + rút lại từ quỹ đúng số trigger đã hoàn lúc hủy (giao dịch `hoan_phieu` "Hoàn tiền đã thanh toán của đơn <id> (…", tối đa số dư) vào `tien_da_tra`; 24h kể từ lúc ticket đóng (`hanDayLaiTicketSql`). `POST /don-hang/:id/day-lai` TỰ chuyển sang phục hồi theo ticket khi `ticketDayLaiCuaDon()` có (đơn về Chờ hàng, không về Chờ TN duyệt). Drawer ticket: nút "↩ Đẩy lại ticket" (ưu tiên) / "↩ Đẩy lại đơn gốc". Không báo sang khovan. **Admin không giới hạn 24h** (2026-11-20, v1.541 — "thêm chức năng cho phép admin đẩy lại không giới hạn 24h"): `vai_tro='Admin'` đẩy lại đơn (`/don-hang/:id/day-lai`) và ticket (`/thieu-lk/:id/day-lai`, `dayLaiTicketThieuLk` opts `boQuaHan`, `ticketDayLaiCuaDon(…, boQuaHan)`) cả khi quá hạn — các điều kiện khác giữ nguyên, log ghi "(Admin đẩy lại khi đã quá 24h)"; FE `dayLaiDuoc(d, canTn, laAdmin)`. TN / Kế toán / Kho vẫn 24h. Tiền lấy lại tối đa số dư quỹ hiện có (quá lâu quỹ có thể đã trả phiếu khác).
**GS khu vực hủy hộ đơn cho KTV** (chốt 2026-10-23, v1.399 — "cho phép giám sát khu vực hủy hộ đơn cho ktv khu vực mình"): `applyDonHangLog` `gsHuyHo` = người thao tác `vai_tro='Giam sat'` VÀ là `email_gs` của đơn (GS khu vực hiện tại của KTV nhận) → hủy được NHƯ chính người tạo (mọi bước người tạo hủy được + tự hủy đơn tự duyệt trong phiếu chưa thao tác, `pxkDuocTuHuy`); bắt buộc lý do, log "GS hủy hộ KTV: …", thông báo người tạo như thường. Bản sao FE `actionsFor` (`helpers.ts`, ctx `laGs`). **v1.400** ("cho phép hủy hộ đơn hàng do KTV thuộc khu vực của giám sát đặt hàng"): GS cũng hủy hộ được đơn do KTV thuộc khu vực mình TẠO (`users.giam_sat_quan_ly` của `nguoi_tao` — cột `gs_nguoi_tao` ở danh sách + chi tiết đơn), kể cả khi người nhận ở khu vực khác. ~~Chưa mở cho GS theo "Khu vực xem thêm".~~ Đã mở cho GS phụ (v1.432, xem mục "GS phụ" ngay dưới). Nút Hủy ở footer chi tiết đơn là "✕ Hủy đơn" cỡ thường, kiểu
`danger` (v1.407 — "nút hủy nhỏ và khó nhìn quá"); danh sách vẫn KHÔNG có nút Hủy (chỉ trong chi tiết, tránh bấm nhầm).
**Yêu cầu hủy đơn cần bộ phận đồng ý** (chốt 2026-11-07, v1.455, migration `0109`, cuối `routes/datMuaLinhKien.ts` + FE `datMuaLinhKien/YeuCauHuy.tsx` — "Cho phép KTV, GS hủy bỏ đơn chưa xuất tuy nhiên sẽ cần sự đồng ý từ bộ phận đang xử lý đơn đó (KHO nếu kho đã xác nhận chờ hàng, mua hàng nếu mua hàng đã xác nhận đặt hàng, kế toán nếu kế toán đã lên mã đơn hàng hoặc misa), nếu kế toán duyệt tiền thì KTV vẫn hủy được, tiền trả về quỹ").
- `phanLoaiHuyDon()` = nguồn DUY NHẤT quyết định giai đoạn: không hủy được (trả hàng — luồng Hàng trả; đơn đã đóng; phiếu đã qua "Cho ke toan" = Kế toán chốt xuất) | hủy NGAY (chưa vào phiếu, trừ Chờ hàng đã nhận; trong phiếu "Dang tao phieu" chưa `ma_xuat_kho_xac_nhan` / Mã MISA — KỂ CẢ Kế toán đã duyệt tiền) | cần đồng ý: `kho` (ticket "Kho da tiep nhan"/"Kho da cap nhat"), `mua_hang` ("Cho mua hang"/"Mua hang da dat"), `ke_toan` (phiếu "Cho ke toan" hoặc có Mã đơn hàng xác nhận / Mã MISA).
- Người yêu cầu (`duocYeuCauHuy`): người tạo / người nhận / GS (email_gs, GS của KTV tạo, GS phụ) / Admin. Người duyệt (`laNguoiDuyetHuy`): `la_kho` / `la_mua_hang` / `la_ke_toan` theo bộ phận + Admin (Mua hàng chỉ đọc được mở riêng route xu-ly ở `requireDatMuaLkArea`).
- API: `GET /dat-mua-lk/don-hang/:id/huy-don`, `POST /don-hang/:id/yeu-cau-huy` {ly_do} (hủy ngay → `da_huy`; còn lại ghi `yeu_cau_huy_don` "Cho dong y" — tối đa 1 mở/đơn, báo bộ phận chuông + push loại `yeu_cau_huy`), `POST /yeu-cau-huy/:id/xu-ly` {dong_y | tu_choi (bắt buộc ghi chú) | rut}. Đồng ý = phân loại LẠI (đơn đã chốt → tự đóng yêu cầu "Tu choi"; bộ phận đổi → chỉ người có quyền bộ phận mới) rồi `thucHienHuyDon()`: ticket đang khóa → `applyThieuLkLog` "Da huy bo" (đơn tự hủy, tiền về quỹ); còn lại `goDonKhoiPxk` (tiền thừa về quỹ qua `taiTinhPxk`/`canBangPxk`; phiếu 1 đơn tự hủy — `goDonKhoiPxk` hủy được cả phiếu "Cho ke toan") rồi `applyDonHangLog` "huy" `opts.boQuaQuyenHuy`.
- Hiển thị: cột `yeu_cau_huy_bo_phan` ở danh sách/chi tiết đơn + dòng đơn trong PXK, `ddh_yeu_cau_huy` ở Thiếu hàng, `co_yeu_cau_huy` ở danh sách PXK → `YeuCauHuyChip` "⏳ Chờ X đồng ý hủy"; khối `HuyDonKhoi` ở chi tiết đơn (gửi yêu cầu khi chưa có nút Hủy thường; bộ phận Đồng ý / Từ chối; người gửi Rút). Số việc `yeuCauHuyCanXuLy` (`notifications.ts`, cộng vào total) + "Cần làm" → lọc sentinel `__YEU_CAU_HUY__` (cùng tập). Luật nút "✕ Hủy đơn" cũ (`actionsFor`/`applyDonHangLog`) KHÔNG đổi.
- **Đồng ý hủy ngay trên ticket thiếu hàng** (2026-11-12, v1.479 — "đơn hàng chờ kho hủy, thêm chức năng hủy ở ticket chờ hàng cho kho, xác nhận ở đây hoặc ở đơn gốc đều được, đều hủy đơn và ticket"): Drawer ticket (`ThieuLkTab.tsx`) hiện CÙNG khối `HuyDonKhoi` khi đơn gốc có yêu cầu hủy mở (`ddh_yeu_cau_huy`) → Kho / Mua hàng "✓ Đồng ý hủy" / Từ chối ngay ở ticket. Kho hủy thẳng (nút "Hủy bỏ…" ticket hoặc "✕ Hủy đơn" ở đơn gốc) mà đơn còn yêu cầu hủy treo → `applyThieuLkLog` tự đóng yêu cầu "Da dong y" + báo người gửi.
- **Tab "Chờ duyệt hủy" ở Thiếu hàng** (2026-11-12, v1.480 — "đẩy riêng ra 1 tab quản lý riêng là đơn chờ duyệt hủy (cho cả kho và mua hàng cùng có thể xem được) => nếu có đơn chờ hủy thì sẽ làm nổi bật"): sentinel trạng thái `__CHO_HUY__` (`THIEU_LK_CHO_HUY_SQL` trong `thieuLkListWhere` — ticket còn mở + đơn gốc có `yeu_cau_huy_don` "Cho dong y" bộ phận kho/mua_hang), `/thieu-lk-status-counts` trả `counts.__CHO_HUY__`. FE: dòng riêng đầu cột trạng thái (`Nhom.nguyHiem` ở `ThieuLkStatusRail.tsx`, đỏ khi > 0; Kho / Mua hàng / TN / Admin) + chấm đỏ "N chờ hủy" trên tab "Thiếu hàng đặt mua" (`ThieuHangTabs`).
- Kiểm thử local (Worker + D1 local, phiên ký tay): hủy ngay phiếu 1 đơn KT đã duyệt tiền (phiếu tự hủy, 120k về quỹ → tự trả phiếu chờ tiền), người lạ 403, gửi trùng 409, Kế toán đồng ý (phiếu "Chờ mã MISA" còn lại giữ "Kế toán đã duyệt", thừa về quỹ), Mua hàng đồng ý (ticket hủy → đơn hủy), Kho từ chối, Kho duyệt yêu cầu của Kế toán 403. Giao diện CHƯA xem bằng mắt.
**Cảnh báo thiếu hàng khi đơn đi Chờ GS / Chờ TBP** (v1.455 — "tài khoản gs đặt hàng không thấy hiện cảnh báo linh kiện thiếu hàng giống bên admin"): `DuDoanDuyetHint` trước chỉ hiện câu "Vượt trần — chờ GS duyệt" (hay gặp khi GS đặt hộ KTV) che mất việc kho thiếu → thêm dòng "⚠ Kho khu vực X thiếu hàng" (`thieuHangPhu`) + ghi khu vực kho đã kiểm (`khuVuc` = `kiemTra.khu_vuc`); `goiYThayTheThieuHang` gợi ý LK tương đương cả cho 2 trạng thái này khi thiếu. Nguyên nhân thật CHƯA xác minh trên dữ liệu thật (không có quyền đọc D1 production).
**GS phụ — khu vực phụ trách của tài khoản Giám sát** (chốt 2026-11-01, v1.432). Người dùng chỉ ra màn sửa tài khoản GS hiện "Khu vực đang phụ trách — (chưa có khu vực nào) — Sửa ở Cài đặt › Khu vực" là *"sai logic rồi, giám sát ở đây là giám sát KTV"*, rồi chốt: *"1 tài khoản GS phụ mới, tôi sẽ chọn khu vực họ có thể quản lý hoặc đặt hàng hộ như giám sát chính (nếu khu vực đó đã có GS chính) => GS chọn khu vực => phụ trách tất cả KTV thuộc khu vực đó"*, áp cho cả 2 app (Đặt mua linh kiện + Sửa chữa bảo hành).
- Không thêm bảng: khu vực Admin tích cho tài khoản GS (`user_khu_vuc`, trước gọi "Khu vực xem thêm") nay = khu vực **GS phụ** trách, quyền như GS chính (`khu_vuc.gs_email`, vẫn 1 người/khu vực).
  - Phần xem (đơn / PXK / thiếu LK / công nợ / quỹ) đã tính `gsKhuVucXemThemSql` từ trước.
  - Bổ sung các chỗ trước chỉ GS chính làm được (helper `laGsCuaKhuVuc` / `gsPhuCuaKhuVuc` trong `scopeDatMua.ts`, khớp khu vực hiệu lực `COALESCE(khu_vuc_chon, khu_vuc_ma)`):
    - duyệt / từ chối đơn "Cho GS duyet" (vượt trần, mã EO);
    - hủy hộ đơn (`gsHuyHo`);
    - xác nhận chuyển tiền hộ (`duocXacNhanChuyenTienHo`, `phieuXuatKho.ts`);
    - số đếm `choGsDuyet` (`notifications.ts`);
    - thông báo "chờ bạn duyệt" (`baoGsChoDuyet` báo cả GS chính + GS phụ).
  - FE: `actionsFor` nhận `gsKhuVuc` (hook `useGsKhuVucSet` dùng chung cache `/dat-mua-lk/khu-vuc-cua-toi`).
  - Chưa đổi: `users.giam_sat_quan_ly`, `dat_don_hang.email_gs` (vẫn GS chính).
- `UsersModule`: với GS, gộp 2 khối thành 1 danh sách "Khu vực phụ trách (Giám sát KTV)".
  - Khu vực người đó là GS chính: tích sẵn, khoá, nhãn "GS chính".
  - Khu vực tích thêm: nhãn "GS phụ", kèm dòng "GS chính: …" nếu khu vực đã có GS chính.
- `GET /api/suachua-partner/user-khu-vuc` trả thêm `la_gs` → app sửa chữa đưa vào danh sách GS của khu vực (cron mỗi giờ).
- Kiểm thử local (D1 riêng, phiên ký tay):
  - GS phụ MB1 qua cổng duyệt như GS chính (chỉ còn báo thiếu mã EO), từ chối và hủy hộ được;
  - GS khu vực khác: `KHONG_PHAI_GS_KHU_VUC` / `FORBIDDEN_ROLE`;
  - `choGsDuyet` = 1 / 1 / 0;
  - màn tài khoản hiện đúng nhãn, tích thêm MB2 lưu đúng.
**QC đặt hàng như 1 KTV** (chốt 2026-11-07, v1.451 — "vai trò QC cấp quyền bổ sung như 1 KTV, có thể đặt hàng, theo dõi và xác nhận hàng về"):
tài khoản `vai_tro='QC'` tạo đơn CHO CHÍNH MÌNH (`canCreatePhieuDat` backend + `canTaoDon` FE; KHÔNG đặt hộ — `canQuanLyDonHo` không gồm QC →
`FORBIDDEN_ROLE`), BẮT BUỘC có "Mã nhận hàng" kèm Mã MISA (`nguoiNhanChuaCoMaMisa` tính cả QC → `KTV_CHUA_CO_MA_MISA`; Admin tạo ở Quản lý
người dùng › Nhân viên văn phòng › Mã nhận hàng). Menu thêm Phiếu xuất + Quỹ & chuyển tiền (`ROLE_MODULES.QC`, `canXemPxkTab`); quỹ = của chính
mình (`phamViXem`), nộp tiền vào quỹ (`duocNopTien` + `coTheNopTien` / `NutNopQuyNoi`), thẻ "Đặt hàng hôm nay" ở Trang chủ. Chuyển tiền / xác
nhận đã nhận / báo nhận thiếu vốn theo "người nhận hàng = mình" nên không phải sửa. QC vẫn xem toàn bộ ĐƠN như trước (scope null); PHIẾU XUẤT chỉ thấy phiếu mình là người nhận (v1.520 — `scopePxkNguoiNhanHang` bỏ QC khỏi nhóm không giới hạn). v1.452: `canXemPxkTab` (dùng CHUNG cho `tabs[]`/`isValidView` và mục Sidebar) + `canXemDonMuaCongNo` gồm QC — trước đó `tabs[]` có điều kiện PXK riêng không gồm QC nên bấm "Phiếu xuất"/"Chờ KTV nhận" bị đẩy về Hàng trả.
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
**Đổi loại đề xuất (KTV / GS / KT / Kho)** (chốt 2026-10-30, v1.424, `lib/doiLoaiDeXuat.ts` — "nếu đơn hàng chưa được xử lý chuyển tiền, kế toán duyệt,
kho tiếp nhận chờ hàng => cho KTV, GS, KT, KHO đổi loại đề xuất … nếu loại đề xuất khác phiếu đang giữ thì tự đẩy ra add vào phiếu phù hợp hoặc tạo phiếu mới"):
`POST /dat-mua-lk/don-hang/:id/doi-loai-de-xuat` {loai_de_xuat, chinh_sach?, ma_yeu_cau_su_co?, ma_lada?, ghi_chu?} — quyền `duocDoiLoaiDeXuat` (người tạo /
người nhận, GS theo `doiKhuVucDonSql`, Kế toán + TN, Kho, Admin); điều kiện `DOI_LDE_DUOC_SQL` (cờ `duoc_doi_loai_de_xuat` ở chi tiết đơn → nút "Đổi" cạnh
"Loại đề xuất", `DoiLoaiDeXuat.tsx`): Mua/Công nợ (không trả hàng, gửi bù, đối tác), đơn còn mở, `tien_da_tra = 0`, phiếu chứa đơn còn "Dang tao phieu" + chưa
Mã MISA + `da_thanh_toan = 0` + chưa "KTV da chuyen" + Kế toán chưa duyệt tiền, đơn "Cho hang" mà ticket Kho/Mua hàng chưa tiếp nhận. Đánh giá lại bằng CHUNG
`danhGiaPhieu` (chặn giá 0 / chưa Mã MISA sang công nợ / TRỪ CÔNG NỢ thiếu tồn KTV) + xét lại trần (trừ phần công nợ của chính đơn đang tính) → định tuyến:
Chờ Trạm / Chờ TN giữ nguyên; LK đặc thù sang loại cần TBP → Chờ TBP; vượt trần chưa mã EO → Chờ GS; còn lại tồn kho công ty FIFO (đủ → duyệt, thiếu → Chờ thanh
toán / Chờ hàng; đang Chờ hàng vẫn thiếu → giữ). Khác `loai_don` / nhóm loại đề xuất của phiếu (hoặc rời trạng thái vào phiếu) → `goDonKhoiPxk` rồi tự gom
(`bundleAutoApprovedIntoPxk`); cùng nhóm → `taiTinhPxk`. Đổi qua lại TRẢ HÀNG vẫn chỉ ở form Sửa của TN (PATCH `/don-hang/:id`).
**Kế toán từ chối bằng chứng** (2026-09-29, migration `0046`): nút "↩ Từ chối, đẩy lại" cạnh "Duyệt bằng chứng" →
`PATCH /:id/chuyen-tien` `{trang_thai:"Cho KTV chuyen", ly_do_tu_choi}` (chỉ Kế toán/Admin, từ "KTV da chuyen", phiếu chưa
hủy, bắt buộc lý do) → lưu `ly_do_tu_choi_chuyen_tien`/`tu_choi_chuyen_tien_luc`, log 'Ke toan tu choi bang chung chuyen
tien', báo việc mới cho KTV nhận hàng + TN; GIỮ ảnh/ghi chú. Lý do hiện ở form KTV tới khi KTV "Đã chuyển" lại (xoá lý do).
**Quỹ tiền dư KTV** (chốt 2026-09-29, `lib/quyKtv.ts`, migration `0047`): MỌI tiền chuyển đi qua quỹ của NGƯỜI NHẬN HÀNG
(Vệ tinh → Trạm). Kế toán duyệt = nhập **số thực nhận** (`PATCH /:id/chuyen-tien` `so_tien_thuc_nhan`, `duyetKhoanChuyen()`):
quỹ +T (`nop_tien`) → `canBangPxk()` trừ quỹ trả phiếu (`tra_phieu`, tối đa số còn thiếu) → đủ thì "TN da duyet", thiếu thì
về "Cho KTV chuyen" số còn thiếu; dư nằm lại quỹ và `phanBoQuy()` tự trừ cho phiếu "Cho KTV chuyen" CŨ NHẤT của cùng người. **Sửa v1.560** (2026-11-25, bug PMH-003000
"kế toán báo lỗi quỹ dư nhưng không tự trừ tiền, kế toán duyệt phiếu chuyển về = 0 thì không duyệt được" — KTV chuyển 1 lần 25tr cho 2 phiếu):
`canBangPxk` / `phanBoQuy` trừ quỹ cả phiếu "KTV da chuyen" (đủ → giữ "KTV da chuyen", Kế toán xác nhận 0đ); Kế toán TỪ CHỐI mà quỹ đã trả đủ
→ `khiTraDu: "ke-toan"` đóng "TN da duyet" (trước kẹt "Cho KTV chuyen" cần chuyển 0đ, nút duyệt chỉ nhận "KTV da chuyen"); TN đẩy lại vẫn "giu".
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
**Mã phiếu ở Quỹ bấm được** (2026-10-29, v1.422): cột Mã HĐ/PXK (Khoản chuyển tiền) + cột Phiếu (Sổ quỹ) = `MaPhieuLink` (`QuyChuyenTienModule.tsx`) mở
`PxkDetailModal` tại chỗ (tải lười). **Cảnh báo tiền đã chuyển bị bớt** (v1.422, `lib/tienBiBot.ts`): log 'Da xoa don khoi phieu' / 'Hoan tien ve quy' SAU lần
đầu tiền vào phiếu (log 'Da dinh bang chung chuyen tien' / 'Tru quy du' / khoản 'Da duyet') → `tien_bi_bot` ở `GET /phieu-xuat-kho/:id` + khối PXK của
`GET /dat-mua-lk/don-hang/:id` → `TienBiBotCanhBao` (`BangChungChuyenTien.tsx`, mã DDH trong ghi chú bấm được). **Cảnh báo khoản trùng** (v1.422): form Kế
toán duyệt (`DuyetChuyenTienForm` `useKhoanTrung`) hỏi `GET /phieu-xuat-kho/:id/khoan-gan-day` (khoản 'Da duyet' 30 ngày của cùng người chuyển, phiếu khác)
→ trùng số thực nhận đang nhập / số đọc từ ảnh → cảnh báo, không chặn.
**KTV tự nộp tiền vào quỹ** (chốt 2026-10-30, v1.423, migration `0104`, `lib/nopTienQuy.ts`, FE `modules/quyChuyenTien/NopTienQuy.tsx` — phương án A cho
"giờ muốn cho họ up tiền ngoài vào quỹ thì nên làm thế nào cho dễ thao tác, KTV thực hiện chủ yếu trên điện thoại"): KTV / Vệ tinh (quỹ Trạm) / GS
(`duocNopTien`, Kế toán/Admin → `DUNG_TIEN_NGOAI`) bấm "＋ Nộp tiền vào quỹ" (đầu màn Quỹ + tab "Nộp tiền vào quỹ"): ảnh chuyển khoản bắt buộc (≤ 5,
`POST /quy-ktv/nop-tien/anh` → Drive, hạn mức ảnh/ngày) → số tiền tự điền từ OCR (sửa được) → `POST /quy-ktv/nop-tien` = `nop_tien_quy` "Cho ke toan"
(tiền CHƯA vào quỹ), báo mọi Kế toán (chuông/push loại `nop_tien_quy`, link `/?nop_tien=<id>` → App.tsx `moNopTien`). Kế toán `POST /:id/xu-ly`
{hanh_dong: duyet, so_tien_thuc_nhan} = 1 batch CAS: `khoan_tien_ngoai` (nguon `ktv`, `ma_trong_file` = NTQ-id, `lo_id` ntq-id) + sổ quỹ 'dieu_chinh'
→ `phanBoQuy` tự trả phiếu chờ tiền; `tu_choi` (bắt buộc lý do); người gửi `huy` khi còn chờ. Hủy khoản đã duyệt = hủy ở tab "Tiền ngoài vào quỹ"
(cột `khoan_trang_thai`). `GET /nop-tien` trả `trung` (khoản chuyển tiền / yêu cầu khác cùng quỹ, cùng số, 30 ngày). Badge: `nopTienCanXuLy`
(`/notifications/count`) cộng vào mục "Quỹ & chuyển tiền". **Nút tròn nổi "Nạp quỹ"** (v1.426, `quyChuyenTien/NutNopQuyNoi.tsx`, mount ở `App.tsx` cạnh `HoiDapWidget`) — bên trái nút chat, CÙNG điều kiện `coTheNopTien`/`duocNopTien`, bấm mở thẳng `NopTienForm` (tải lười). Form: ngày chuyển mặc định HÔM NAY (giờ VN, `max` = hôm nay), số tiền tự điền từ OCR ảnh kèm nhãn "tự đọc từ ảnh" / "Đang đọc…" / "Không đọc được" (v1.427). **Icon nổi cho Kế toán** (v1.427, `quyChuyenTien/NutNopTienKeToan.tsx`, cùng chỗ nút Nạp quỹ — 2 nhóm không giao nhau): Kế toán luôn thấy, Admin chỉ khi có yêu cầu; số đỏ = yêu cầu "Cho ke toan" (`GET /quy-ktv/nop-tien?trang_thai=Cho ke toan`, hỏi 30s/lần kể cả tab ẩn), bấm = popup danh sách → dòng mở `NopTienChiTiet` tại chỗ; yêu cầu MỚI (id lớn hơn lần hỏi trước) → popup nhắc + âm báo (`lib/amBao.ts`, dùng chung với Hỏi đáp). Sự kiện `mo-nop-tien` detail rỗng = chỉ mở tab. **Ảnh nộp tiền dùng trình xem chung** (v1.429): `anhXemNopTien()` (`NopTienQuy.tsx`) dựng mục `XemAnhNhanh` (khối "Đối soát tiền" OCR, so với số Kế toán xác nhận / số khai / số đang nhập) — dùng ở danh sách tab (chuyển ảnh xuyên trang), hộp xác nhận của Kế toán, form KTV gửi; hộp xác nhận TỰ ĐIỀN "Số tiền thực nhận" = tổng OCR khi đọc đủ mọi ảnh (chưa đủ → số KTV khai; gõ tay thì giữ). **Popup xử lý nộp tiền 2 cột + đối soát nghi trùng** (chốt 2026-11-12, v1.482 — "tab bên cạnh hiện các hóa đơn đã xác nhận của cùng KTV nhận quỹ. nếu có phiếu nào có số tiền tương đương với 1 trong các ảnh hóa đơn (cùng màu, gần giống - nghi ngờ là cùng 1 ảnh) thì đẩy lên trên cùng và hiện cảnh báo"): `NopTienChiTiet` rộng `max-w-6xl` — hàng thẻ Số tiền khai / Đọc từ ảnh (khớp xanh, lệch đỏ) / Ngày chuyển hoặc KT xác nhận / Số dư quỹ, cảnh báo tổng trên cùng, cột trái người nộp + ảnh lớn kèm số OCR từng ảnh + ô thực nhận cỡ lớn, cột phải tab "Nghi trùng" / "Đã xác nhận của quỹ". Nguồn `GET /quy-ktv/nop-tien/:id/doi-soat` (180 ngày, ≤ 150: khoản chuyển tiền PXK 'Da duyet' không lịch sử, NTQ khác đã duyệt/đang chờ, tiền ngoài trừ nguồn ktv). So trên máy (`quyChuyenTien/NopTienDoiSoat.tsx`): OCR từng ảnh == OCR 1 ảnh / số của khoản cũ (OCR khoản cũ lấy từ `ocr_anh_tien` + `tien_doc_anh`, không đọc lại), "vân ảnh" = dHash 16×16 + màu trung bình (`=w256`) → % giống. ĐỎ = cùng file ảnh hoặc cùng số + giống ≥ 85%; CAM = cùng số / số khai hoặc giống ≥ 93%. Đo thật: ảnh chụp màn hình KHÁC nhau cùng giao diện ~70–79%, cùng ảnh khác kích thước ~83% — đổi ngưỡng ở `GAN_GIONG`/`RAT_GIONG`. Chỉ cảnh báo, không chặn.
**Đối soát ảnh bằng chứng của phiếu xuất** (chốt 2026-11-13, v1.487 — "click hình ảnh trong phiếu, mở giao diện kèm chức năng đối chiếu ảnh để hỗ trợ kế toán rà soát"): chi tiết PXK (`PhieuXuatKhoTab.tsx`, Kế toán / TN / Admin — prop `doiSoat` của `BangChungAnhPxk`) bấm ảnh bằng chứng (hoặc link "🔍 Đối soát ảnh với các khoản khác") mở `datMuaLinhKien/DoiSoatAnhPxk.tsx` (tải lười) — CÙNG bố cục + CÙNG bộ so với popup nộp tiền: `useDoiSoatAnh(duongDan, …)` + `DanhSachDoiSoat` (`NopTienDoiSoat.tsx`, `useDoiSoatNopTien` chỉ còn là vỏ). Nguồn `GET /quy-ktv/pxk/:id/doi-soat` → `docKhoanDoiSoat()` (`quyKtv.ts`, dùng chung với `/nop-tien/:id/doi-soat`): khoản 'Da duyet' 180 ngày của người nhận hàng TRỪ khoản của chính phiếu, NTQ, tiền ngoài + phiếu KHÁC đang "KTV da chuyen" có ảnh (id âm = `-rowid`, trạng thái "Cho ke toan"). Thẻ "Đọc từ ảnh" chỉ cộng ảnh của lần chuyển này (bỏ `anh_da_ghi_nhan`) so với "Còn phải chuyển" / "Kế toán xác nhận". Không so số tiền khai (`soKhai` = 0). Chỉ cảnh báo, không chặn.
**"Khách hàng đã chuyển khoản về công ty" + Quỹ KH chuyển khoản (trước: Quỹ xuất hóa đơn do KH chuyển)** (chốt 2026-11-09, v1.461, migration `0111`, `lib/quyKhoa.ts` — "tiền do kế toán xác nhận sẽ không tính vào quỹ của KTV mà tính vào 'Quỹ xuất hóa đơn do KH chuyển' … quỹ kh này vẫn gắn theo KTV"):
- Cờ đơn `dat_don_hang.kh_chuyen_khoan` (tích ở form tạo đơn dưới "Yêu cầu hóa đơn", `KhChuyenKhoan.tsx`) — đơn mua / TRỪ CÔNG NỢ không đối tác (`KH_CHUYEN_KHOAN_CHI_DON_MUA`), CÓ HOẶC KHÔNG xuất hóa đơn (v1.521, 2026-11-18 — "đặt hàng cần chuyển tiền, cho phép tích chọn KH chuyển tiền kể cả không xuất hóa đơn" + chốt "Giá niêm yết": trước đó bắt chọn 1 hình thức HĐ, lỗi `KH_CHUYEN_KHOAN_CAN_HOA_DON` đã bỏ). Đơn tích ô này tính GIÁ NIÊM YẾT, nhãn `KHONG_CK`, lý do `kh_chuyen_khoan` (`tinhToanPxk`, bản sao FE `giaUocTinhDong`, chip `HoaDonGiaNiemYet`) — kể cả "HĐ - Xuất cho trạm". Quỹ đổi tên hiển thị "Quỹ KH chuyển khoản" (khoá `khhd:` giữ nguyên). Câu giới thiệu tab Quỹ KH chuyển khoản (`QuyChuyenTienModule.tsx`) sửa theo luật này ở v1.564 (trước còn ghi "cho đơn có yêu cầu xuất hóa đơn"). Chưa hỗ trợ import Excel. Trigger `trg_ddh_kh_chuyen_khoan_khoa` chặn đổi cờ khi đơn giữ tiền / trong phiếu.
- Quỹ KH = khoá quỹ `khhd:<email người nhận>` trong CHÍNH `quy_ktv`/`quy_ktv_giao_dich` (cùng CHECK ≥ 0, CAS, sổ chỉ ghi thêm) → 2 số dư tách hẳn. Phiếu mang `phieu_xuat_kho.quy_kh`, chỉ chứa đơn cùng cờ (trigger `trg_pxk_dong_quy_kh`). MỌI hàm tiền lấy khoá qua `khoaQuy(email, quy_kh)` / `khoaQuyPxkSql` / `khoaQuyDonSql`: `canBangPxk`, `phanBoQuy(khoá)` (chỉ trả phiếu cùng quỹ), `duyetKhoanChuyen` (thực nhận vào quỹ của phiếu; `khoan_chuyen_tien.email_nguoi_chuyen` vẫn = người), sửa/hủy khoản (`docKhoan.quy_email`), `lenhMangTienDon`, tách đơn, gửi bù nhận thiếu, đẩy lại ticket, "Trả bằng quỹ dư". `tien_da_tra_email` lưu KHOÁ quỹ → trigger hoàn tiền khi hủy/từ chối tự về đúng quỹ. `lenhNhanTienDaTraDon` CAS chặn tiền đơn khác quỹ phiếu. Sau thao tác không rõ quỹ → `phanBoQuyNguoi` (cả 2). Thêm đường tiền mới: dùng các helper này, KHÔNG dùng thẳng `nguoi_nhan_hang`.
- Quỹ & chuyển tiền: `/tong-quan` 1 dòng / quỹ (`nguoi`, `quy_kh`), `/giao-dich` phạm vi gồm cả 2 khoá, `/dieu-chinh` nhận khoá `khhd:` (hoàn tiền cho KH trừ thẳng, không phiếu hoàn tiền KTV xác nhận). FE `ten()` hiện "<KTV> · Quỹ xuất hóa đơn do KH chuyển". **Tab riêng "Quỹ KH chuyển (HĐ)"** (v1.462, `QuyKhTab` cuối `QuyChuyenTienModule.tsx`): thẻ tổng + 3 mục Số dư theo KTV / Sổ quỹ KH / Khoản chuyển tiền KH — tái dùng `SoDuTab`/`SoQuyTab`/`KhoanChuyenTab` với prop `quy`; server lọc `?quy=kh|ktv` ở `/tong-quan`, `/giao-dich`, `/khoan-chuyen` (`/khoan-chuyen?email=khhd:…` tự quy về người + quỹ KH). Các tab / thẻ tổng chính CHỈ quỹ KTV. Hoàn tiền trong quỹ KH = "Hoàn tiền cho KH" (trừ thẳng qua Điều chỉnh). Nộp tiền quỹ / tiền ngoài / phiếu hoàn tiền chỉ quỹ KTV. Gán KH lẻ chặn đơn KH đang giữ tiền.
**Tách phiếu theo hình thức hóa đơn** (cùng đợt): "nhóm phiếu" = nhóm loại đề xuất | `nhomHoaDon` | cờ KH (`nhomPhieu`/`nhomPhieuSql`/`phieuCungNhomSql` ở `lib/nhomLoaiDeXuat.ts`, thay `phieuCungNhomLdeSql`) — tự gom, tạo tay (`NHIEU_HINH_THUC_HOA_DON_TRONG_1_PXK`), thêm dòng / chuyển đơn (`DON_KHAC_HINH_THUC_HOA_DON_PHIEU`), đổi loại đề xuất. Sửa HĐ trên đơn trong phiếu "Dang tao phieu" → gỡ (mang tiền) + gom lại; phiếu đã gửi Kế toán → `DON_TRONG_PHIEU_KHONG_DOI_HOA_DON`. Danh sách/chi tiết PXK trả `yeu_cau_hd` + `quy_kh` → nền tím nhạt `nenHoaDon` (token `--color-hoa-don-bg`), badge `HoaDonPhieuBadge`, khối ghi chú Kế toán `HoaDonPhieuGhiChu`. Phiếu cũ lẫn hình thức giữ nguyên.
**Phiếu CHỜ HÀNG tách riêng + tách nhanh + popup từ chối chuyển tiền + kết quả tạo đơn** (chốt 2026-11-10, v1.464, migration `0112`):
- `phieu_xuat_kho.cho_hang` = 1: phiếu chứa đơn "Cho thanh toan" (kho thiếu) tách khỏi phiếu đơn có hàng — `bundleAutoApprovedIntoPxk` tách nhóm thêm cờ này (chỉ gộp vào phiếu cùng cờ). Chỉ là nhãn để gom + cảnh báo, tiền không đổi.
- `POST /phieu-xuat-kho/:id/tach-cho-hang`: mọi đơn "Cho thanh toan" của phiếu "Dang tao phieu" sang phiếu chờ hàng đang mở (cùng người nhận/nhóm/khu vực chọn/quỹ) hoặc phiếu chờ hàng mới — quyền `duocChuyenDonPxk` HOẶC người nhận / người tạo đơn khi tiền chưa "KTV da chuyen"/"TN da duyet" (`tachChoHangDuoc`, cờ `duoc_tach_cho_hang` ở chi tiết). `POST /:id/tach-nhieu` {don_ids, giu_tien}: nhiều đơn sang 1 phiếu MỚI (hộp "Bỏ N đơn" có "Tách thành 1 phiếu mới" / "Chỉ bỏ khỏi phiếu"). Cả 2 lặp `chuyenDonPxk()` (thân route `/dong/:donHangId/chuyen`, tách hàm).
- Chi tiết phiếu trả `phieu_cho_hang_lien_quan` (phiếu mở cùng người nhận + nhóm, khác cờ) → `PhieuChoHangCanhBao` (`TachChoHang.tsx`); danh sách có badge "Phiếu chờ hàng".
- Từ chối / TN trả lại bằng chứng: thông báo tiêu đề "⚠ Chuyển tiền bị … từ chối"; `GET /phieu-xuat-kho/tu-choi-chuyen-tien-cua-toi` + `POST /:id/da-doc-tu-choi` (`tu_choi_da_doc_luc`, tự NULL khi từ chối lần mới) → popup lớn `TuChoiChuyenTienPopup` (App.tsx, hỏi 60s/lần; "Đã đọc" / "Đến phiếu"; ✕ chỉ ẩn tạm).
- POST `/phieu-dat` trả thêm `dong[].pxk`, `phieu` (trạng thái tiền, `tra_tu_quy`, `cho_hang`), `quy_du` → `KetQuaTaoDon.tsx` LUÔN mở sau khi tạo (trừ bấm trùng).
**Bỏ đơn ĐÃ THANH TOÁN khỏi phiếu → tự vào phiếu riêng** (2026-10-29, v1.422 — DDH-003687 / PMH-001393 nằm "Chờ tạo phiếu" giữ tiền mà không ai thấy):
`DELETE /phieu-xuat-kho/:id/dong/:donHangId?giu_tien=1` xong, đơn còn 'TN da duyet' (không trả hàng) → `bundleAutoApprovedIntoPxk(..., { boQuaPxk: id })` (không
gộp lại chính phiếu vừa bỏ). "Còn tồn" (`donConTonSql`) gồm cả đơn 'TN da duyet' chưa vào phiếu. Log bỏ đơn ghi mã đơn DDH-… (+ mã LK); `LogTieuDe` prop
`onMoDon` biến mã DDH trong ghi chú log thành link mở chi tiết đơn (chi tiết PXK).
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
 **Nhãn mạnh / nhãn yếu** (2026-11-12, v1.483, `PHIEN_BAN_OCR = 4` — "fix OCR ảnh đang đọc nhầm tiền", ảnh MBBank dạng hội thoại đọc ra 181.000 của bong bóng cũ thay vì 327.000 dưới "Chuyển tiền thành công"): nhãn ở dòng trên chứa "thành công"/"số tiền"/"amount"/"tổng tiền"/"đã chuyển" (`NHAN_MANH`) +3, nhãn chung chung "chuyen tien"/"thanh toan" chỉ +1 (dòng mô tả "<TÊN> chuyen tien" của bong bóng trước từng được tính là nhãn của số sau).
 **Đối chiếu bằng bộ tiếng Anh** (2026-11-13, v1.490, `PHIEN_BAN_OCR = 5`, `doiChieuEng` — "fix orc" ảnh BIDV "3,142,000 VND" chữ vàng nền xanh đậm đọc ra 5.142.000): font số BIDV (số 3 đầu phẳng) bộ tiếng Việt đọc 3→5 ở mọi cỡ / đảo màu / ngưỡng, bộ tiếng Anh đọc đúng. Dòng số TO sau khi đọc lại bằng tiếng Việt được đọc thêm 1 lần tiếng Anh (psm 7, 32px): khớp → nhận, LỆCH → null ("không đọc được — xem bằng mắt"), tiếng Anh không ra số → giữ số cũ. Không thay hẳn bằng tiếng Anh vì nó từng đọc lệch 5→3 / 9→3 ở ảnh khác. Script thử trên node (tesseract.js + sharp, `quyetDinhSoTien` với `docLai(bbox, cao, lang)`): BIDV → null, MBBank 327.000 → giữ đúng.
**Xem ảnh nhanh** (2026-09-30, `datMuaLinhKien/XemAnhNhanh.tsx`): trình xem dùng chung — ảnh trái, thông tin phải (OCR, mã HĐ, mã PXK,
người chuyển, ngày, trạng thái xác nhận, tiền), ‹ › / ← → / vuốt, Esc. `BangChungAnhList` prop `onXem`; danh sách (Quỹ › Khoản chuyển
tiền, cột Bằng chứng PXK) dựng MỌI ảnh của trang đang xem (chuyển xuyên dòng); chi tiết PXK/đơn dùng `BangChungAnhPxk`
(`anhXemCuaPxk`). `GET /phieu-xuat-kho` trả thêm `bang_chung_tien_doc`/ghi chú/lý do từ chối/`ngay_ktv_chuyen` (bỏ khỏi file tải về).
Khung phải = 3 khối **Đối soát tiền** (OCR ảnh này, tổng OCR ảnh của lần chuyển — bỏ ảnh đã ghi nhận trước, so với "Kế toán xác nhận"
hoặc "Còn phải chuyển" → Khớp/Lệch + nhắc nhở; đọc lại trên máy qua `useDocTienAnh`, không gọi server) / Chứng từ / Ghi chú.
**Kết quả OCR dùng chung mọi máy** (migration `0058`, bảng `ocr_anh_tien` theo URL ảnh + `phien_ban`): `useDocTienAnh` hỏi `GET /api/quy-ktv/ocr-anh` trước (1 request/lô), ảnh chưa có thì đọc trên máy rồi `POST` gộp lô (lỗi mạng/CORS không ghi; phiên bản cũ không ghi đè). **Sửa bộ đọc/chọn số → TĂNG `PHIEN_BAN_OCR`** (`lib/docTienAnh.ts`) để kết quả cũ bị bỏ qua, máy đầu tiên đọc lại + ghi đè. Số kèm PXK/khoản (`bang_chung_tien_doc`/`tien_doc_anh`) chỉ hiện tạm. `lib/docTienAnh.ts` nhận đơn vị TRƯỚC số ("VND 310,000" Techcombank)
+ nhãn "chuyển thành công".
**Đọc tiền nhiều lượt** (2026-10-30, v1.422, `PHIEN_BAN_OCR = 3`, `CAC_LUOT` ở `lib/docTienAnh.ts`): tiếng Việt chế độ 6 như cũ → CHỈ KHI không ra số mới thử
tiếng Anh (`@tesseract.js-data/eng`, `ocrAssets()` chép thêm `eng.traineddata.gz`) chế độ 6 → chế độ 11 → ảnh "đen trắng" (min R,G,B — nền màu app ngân
hàng). Dòng cắt đọc lại dùng chế độ 7. Bộ 75 ảnh thật: 48 → 68 đúng. KHÔNG đặt tiếng Anh lên trước (đọc lệch 5→3, 9→3 ở ảnh tiếng Việt đã đúng). Chuẩn
hoá thêm: bỏ ngày/giờ, "o" dính sau chữ số = 0, "đ" bị đọc thành "4", số thiếu 1 dấu phân cách chỉ nhận khi có đơn vị, bỏ năm 1900–2100 không đơn vị.
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

**Giới hạn 255 ký tự / ô + cột "Mã bổ sung"** (chốt 2026-11-11, v1.471, `lib/misaExport.ts` — "file tải mẫu in MISA bị lỗi giới hạn ký tự 1 ô chỉ 255 ký tự"; "cột mã bổ sung 1/2 chỉ được dùng cho danh sách mã CRM hoặc mã Lada"):
- "Trường mở rộng 1" (= Mã bổ sung 1 trên MISA) = danh sách mã CRM (Mã YCSC + Mã YCSC bổ sung `dat_don_case`), "Trường mở rộng 2" = danh sách Mã Lada — CHỈ mã, nối 1 dấu cách, bỏ trùng (`dsMa`). TRƯỚC đây cột 2 = TT+Mail duyệt (sai). Chuyển kho (1 cột "Trường mở rộng") = mã CRM rồi mã Lada. **Tiêu đề cột** (2026-11-12, v1.486 — "đổi tiêu đề xuất file misa"): mẫu Bán hàng / CN, hỗ trợ ghi "Mã sự vụ" (thay "Trường mở rộng 1") và "Mã PD EO" (thay "Trường mở rộng 2") — `DON_DAT_HANG_HEADER` ở `frontend/src/lib/misaExportTemplates.ts` + nhãn cảnh báo `NHAN_COT`; Chuyển kho giữ "Trường mở rộng". TT+Mail duyệt vẫn nằm trong Diễn giải đơn HỖ TRỢ 0 ĐỒNG.
- `MISA_MAX_KY_TU = 255` (sửa 2026-11-12, v1.474 — "bỏ logic tách phiếu khi text dài quá 255 ký tự"): gộp dòng cùng mã (`khoaGop`/`gopLine`) LUÔN gộp hết, KHÔNG còn tách dòng khi ô > 255. Đơn TG12: v1.474 từng dùng câu ngắn theo ID phiếu — BỎ ở v1.485 (2026-11-12, chủ hệ thống "tôi cần sửa lại theo mẫu cũ"): Diễn giải TG12 về công thức chung "<kho> xuất <loại đề xuất> cho <Tên MISA> theo MYC <Mã YCSC gộp>" (LK "Máy" vẫn câu xuất máy) → phiếu gộp nhiều mã sẽ bị cắt "…" ở 255 + cảnh báo; cột mã vẫn gộp ĐỦ mọi mã sự cố của các đơn gộp. Ô chữ > 255 → cắt "…"; ô mã > 255 → GIỮ NGUYÊN, chỉ cảnh báo (`catNgan` `giu_nguyen: true`) → toast riêng ở `toastKetQuaMisa` (`PhieuXuatKhoTab.tsx`) — phiếu TG12 lớn (PCN-002197: 103 mã = 1.033 ký tự) MISA có thể từ chối. Dòng file dựng bằng 1 hàm `taoDong()` (closure trong `buildMisaExportSheets`) — thêm cột text mới thì thêm nhãn vào `NHAN_COT`.
- Kiểm thử local (D1 riêng): phiếu 31 đơn HỖ TRỢ 0 ĐỒNG cùng mã + 26 đơn MUA HÀNG, cả 3 mẫu — mọi ô ≤ 255, SL 31/31, 26/26, cột mã chỉ chứa mã.

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

**Ô tìm chung Ctrl+K tìm linh kiện** (sửa 2026-10-29, v1.420 — "muốn tìm mã linh kiện không tìm được, khi đã chọn bảng giá cũng không tìm
được"): `CommandPalette.tsx` trước chỉ tìm đơn/phiếu/ticket/Mã YCSC/tên KTV. Giờ tìm LK TRÊN MÁY (cùng `timLk`, danh mục `settings-linh-kien`
cache; mã đã đổi A→B hiện B; KTV/Vệ tinh ẩn LK tắt/chờ duyệt theo `laKtvXemBangGia()` ở `lib/quyenBangGia.ts`) → bấm = `XemLinhKienDrawer` tại
chỗ; "Tìm … trong Bảng giá" = mở Bảng giá điền sẵn từ khóa + bỏ mọi bộ lọc (`DanhMucLinhKienModule` prop `timBanDau`). Backend `/search` thêm đơn
theo mã LK (tiền tố). Bảng giá: lọc tự động "Chờ xét duyệt" (Mua hàng/Admin) tự bỏ khi bắt đầu gõ tìm; gõ mã cũ đã đổi ra mã chuẩn; có dòng
"N kết quả khác bị bộ lọc ẩn — Tìm trong tất cả".
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
→ đủ tiền thì đặt luôn "Kế toán đã duyệt" tiền; TN xử lý tiếp như phiếu thường. **Kho gửi bù ngoài hệ thống** (v1.537): Kế toán chọn "Không tạo đơn xuất bù" (`POST /nhan-thieu/:id/ke-toan` `gui_bu_ngoai: true`, chỉ phương án `gui_bu`) → không tạo đơn/phiếu gửi bù, không đổi SL thực xuất đơn gốc, tiền giữ ở phiếu gốc, ticket "Da gui bu" `pxk_gui_bu_id` NULL. **Tự xác nhận**: `phieu_xuat_kho.han_tu_nhan` (TRIGGER
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

**Đổi sang LK tương đương rồi xác nhận có hàng** (chốt 2026-10-20, v1.375 — "cho phép kho có quyền sửa lại linh kiện chờ hàng sang linh kiện tương đương rồi xác nhận đã có hàng"): Drawer ticket có nút "Đổi LK tương đương…" (chỉ khi người xem bấm được "Đã có hàng" / "Hàng đã về" — Kho, TN làm hộ; không thêm vào nút ở danh sách) → chọn mã CÙNG nhóm thay thế (`GET /lk-settings/thay-the/:ma`) → gửi `POST /thieu-lk/:id/log` {trang_thai "Da co hang" | "Kho xac nhan hang da ve", `ma_lk_tuong_duong`}. `applyThieuLkLog` (tham số `maLkTuongDuong`): chỉ kèm 2 bước có hàng + đơn gốc "Cho hang" (`DOI_MA_CHI_KHI_CO_HANG`), mã quy về mã chuẩn, phải có trong danh mục (`MA_LK_NOT_FOUND`) và cùng `lk_nhom_thay_the_ct` với mã đang đặt (`KHONG_PHAI_LK_TUONG_DUONG`); đổi `ma_lk`/`ten_lk_snapshot`/`gia_de_xuat` (giá bán mã mới) trong CÙNG batch với log ticket, CAS theo mã cũ + "Cho hang" (`STATE_CHANGED`); log ticket ghi "Đổi sang LK tương đương A → B" (vào cả tóm tắt trên đơn gốc); rồi đơn tự duyệt + vào phiếu như thường + `taiTinhPxkMoCuaKtv` (tổng ngày đổi). Giá chốt tay của mã cũ bị BỎ (`gia_chot = NULL`, v1.528 — DDH-007748 từng giữ giá chốt 425.000 của mã cũ, thấp hơn giá dự phòng mã mới 515.000); dòng đơn trong phiếu có nhãn "Giá chốt tay" khi đang áp.

**Gợi ý LK tương đương lúc tạo đơn thiếu hàng** (chốt 2026-11-01, v1.430 — "linh kiện họ đặt thiếu hàng và có mã tương đương đủ hàng, hiện 1 nhắc nhở … đưa ra các đề xuất cho người dùng chọn … click vào mã được đề xuất để chuyển linh kiện đang đặt thành linh kiện tương đương ngay"): `POST /phieu-dat/kiem-tra` trả thêm `thay_the` mỗi dòng (`goiYThayTheThieuHang()` ở `datMuaLinhKien.ts`) — CHỈ dòng tồn kho công ty thiếu ("Cho hang"/"Cho thanh toan", không combo, không lỗi): mã cùng nhóm `lk_nhom_thay_the_ct`, đang bật (không 'Da doi ma', không Only sửa chữa), tồn `computeTonKhoChot` CÙNG khu vực của đơn trừ SL các dòng khác trong phiếu đặt chính mã đó, chỉ mã còn tồn > 0 (≤ 5). FE `datMuaLinhKien/GoiYThayTheThieuHang.tsx` (desktop + mobile, dưới `DuDoanDuyetHint`): chip mã tương đương (bấm = đổi mã dòng, giữ SL) + phương án `dungPhuongAn()` (A còn a + B bù phần thiếu; thay toàn bộ bằng 1 mã đủ; gộp nhiều mã; vẫn thiếu → thêm dòng A chờ hàng hoặc bỏ phần thiếu) → `apDungThayThe()` (`useTaoDonForm`) tách dòng thành nhiều dòng giữ mọi ô khác; "Bỏ qua" ẩn tới khi đổi mã/SL. Chip "Có thể thay thế bằng" (`ThayTheGoiY`) cũng bấm được để đổi mã. v1.431 ("khi hiện đề xuất hiện luôn là còn hàng hay không (x123)"): `GET /lk-settings/thay-the/:ma?khu_vuc=` kèm `ton` (`computeTonKhoChot`, khu vực = `kiemTra.khu_vuc` của form, KHÔNG trừ dòng đang soạn) → chip hiện "x123" / "hết hàng" (`TonChip`).

**Tồn kho miền còn lại khi đặt hộ thiếu hàng** (chốt 2026-11-13, v1.488 — "khi GS, TN, tạo đơn hộ KTV nếu khu vực của KTV không có hàng, check luôn tồn kho tại khu vực miền còn lại và hiện cảnh báo đồng thời. nếu kv khác còn hàng thì hiện đề xuất khu vực còn hàng (có thể đổi lại khu vực sau khi xin đề xuất đặt hàng trái miền)"): `POST /phieu-dat/kiem-tra` trả thêm `ton_mien_khac` mỗi dòng (`tonKhoMienKhac()` ở `datMuaLinhKien.ts`, CHỈ khi người đặt `canQuanLyDonHo` = TN gồm Kế toán / GS / Admin; null = không kiểm, [] = miền kia cũng hết) — dòng lấy tồn kho công ty đang thiếu (Chờ hàng / Chờ thanh toán / Chờ GS / Chờ TBP mà tồn < SL, không combo). "Miền còn lại" = khu vực đang bật có bộ kho công ty đang bật KHÔNG chung kho nào với khu vực của đơn (không dựa tên mã); tồn mỗi khu vực = CÙNG công thức `computeTonKhoChot` (1 truy vấn cho mọi dòng) → khớp số `xetLaiTonKhiDoiKhuVuc` dùng khi đổi "Khu vực xử lý". FE `datMuaLinhKien/TonMienKhac.tsx` (`TonMienKhacHint` dưới `DuDoanDuyetHint`, desktop + mobile): đỏ "miền còn lại cũng hết", hoặc cam + chip khu vực còn hàng ("còn N", tối đa 5) + hướng dẫn đặt trái miền = tạo đơn rồi đổi "Khu vực xử lý" ở chi tiết đơn (form tạo đơn CHƯA cho chọn khu vực).
**LK "Không kiểm tra tồn kho"** (chốt 2026-11-13, v1.489, migration `0118` — "1 số link kiện thuộc dạng không cần kiểm tra tồn kho, ví dụ như phí dịch vụ. mặc định đặt là có hàng"): cờ `linh_kien.khong_kiem_ton` (+ `_nguoi`/`_luc`, cột nội bộ không chạm `ngay_cap_nhat`; đổi mã chép theo `COT_CHEP`). `computeTonKhoChot` (`lib/tonKhoCongTy.ts`) trả `TON_KHONG_KIEM` (1 tỷ) cho mã có cờ → mọi đường tạo đơn / đổi loại đề xuất / xét lại (Chờ thanh toán, đổi khu vực, gợi ý thay thế) tự coi là đủ hàng; 2 truy vấn SQL `donChoHangDuTonKho` + `donHangVeTheoUuTien` dùng `KHONG_KIEM_TON_SQL` cho cùng kết quả. Lý do log: `moTaThieuTon` ghi "linh kiện không cần kiểm tra tồn kho (mặc định có hàng)"; FE đổi số 1 tỷ qua `frontend/src/lib/tonKhongKiem.ts` (`laTonKhongKiem` — gợi ý tạo đơn, chip thay thế, khung đánh giá ticket). Bật/tắt: `PATCH /settings/linh-kien/:ma/khong-kiem-ton` (cùng quyền "Cho phép giá 0đ"), cột "Kiểm tra tồn kho" ở Bảng giá + badge ở drawer + ô "Luôn có hàng (không kiểm tra tồn kho)" ngay trong form Thêm / Sửa LK (v1.549, 2026-11-21 — "khi tạo lk thiếu lựa chọn này": POST `/settings/linh-kien` nhận `khong_kiem_ton`; form Sửa đổi ô thì gọi chính PATCH `/khong-kiem-ton`); bật → chạy nền xét lại đơn "Cho thanh toan" của mã (`danhGiaLaiDonChoThanhToan`) + `tuDongXacNhanHangVe` (đơn "Cho hang" tự duyệt). Trừ công nợ (tồn KTV) KHÔNG áp. Chưa kiểm thử end-to-end trên giao diện.

**Thiếu hàng BẢO HÀNH — ticket từ app Sửa chữa bảo hành** (chốt 2026-11-04, v1.437, migration `0106`; yêu cầu bên suachua: "Thêm luồng gửi đơn Thiếu linh kiện từ App bảo hành sang app đặt linh kiện dựa theo lý do chậm: 'Không có linh kiện', 'Hết hàng tồn kho' => đơn đẩy sang app linh kiện, tạo ticket thiếu hàng để kho và nhân viên mua hàng xử lý. Khi ticket được duyệt hoặc thay đổi sẽ phản hồi về đơn bảo hành gốc để admin bh nắm được thông tin hàng đã về"). Bảng RIÊNG `thieu_hang_bh` + `thieu_hang_bh_log` (mã `THB-…`) — KHÔNG dùng `thieu_lk` (gắn cứng `dat_don_hang_id NOT NULL`). `nguon_id` = mã đơn vị bảo hành bên suachua; người báo / KTV là email bên suachua (không FK `users`). suachua tạo qua `POST /api/suachua-partner/thieu-hang-bh` {items} (trùng `nguon_id`+`ma_lk` đang mở → trả ticket cũ), kéo lại `GET …/thieu-hang-bh?since=&after_id=` (con trỏ `ngay_cap_nhat`,`id`) hoặc `?ids=`, rút lại `POST …/thieu-hang-bh/:id/huy` (→ "Da huy"); xác thực X-Sync-Key như các route suachua-partner. Router phiên RIÊNG `routes/thieuHangBh.ts` `/api/thieu-hang-bh` (không qua `requireDatMuaLkArea` để Mua hàng ghi được): Kho / TN / Admin — "Kho da tiep nhan" (ngày dự kiến tuỳ chọn, cập nhật lại được) | "Cho mua hang" | "Kho xac nhan hang da ve" (cả khi đang chờ Mua hàng) | "Kho tu choi" (bắt buộc lý do); Mua hàng / Admin — "Mua hang da dat" (bắt buộc mã EO + ngày dự kiến) | "Mua hang tu choi" (bắt buộc ghi chú). CAS theo trạng thái cũ (`STATE_CHANGED`), luồng sai → `INVALID_TRANSITION` (`thbChuyenHopLe`). Mỗi bước đẩy ngay bản tin sang suachua `POST /api/partner/sync/thieu-hang` qua `SUACHUA_SYNC_SERVICE` (waitUntil, lỗi thì suachua tự kéo lại mỗi 15 phút). FE: mục thứ 3 "Thiếu hàng bảo hành" trong `ThieuHangTabs` (`datMuaLinhKien/ThieuHangBh.tsx`, chỉ hiện cho Kho/TN/Kế toán/Mua hàng/View/Admin) — cột trạng thái bên trái (v1.455, `TrangThaiRail` dùng chung với Thiếu hàng đặt mua ở `ThieuLkStatusRail.tsx`): Cần tôi xử lý / Chờ Kho (tiếp nhận, đã tiếp nhận) / Chờ Mua hàng (chờ đặt, đã đặt) / Hàng đã về / Đã đóng / Tất cả (backend nhận `trang_thai` = danh sách nối ","), cột "Việc tiếp theo" + "Đã chờ" (cam > 3 ngày), vạch cam dòng chờ chính mình, thẻ trên mobile; miền, tìm; drawer chi tiết + nút theo vai trò + lịch sử. Số việc `thieuHangBhCanXuLy` (Kho/TN: "Cho kho xu ly"; Mua hàng: "Cho mua hang") cộng vào `thieuLkCanXuLy`. Chưa có: tồn kho gợi ý trong drawer (ticket mang miền MB/MN, tồn kho tính theo khu vực), push thông báo cho Kho. **v1.565 (25/11/2026) — GỘP vào danh sách Thiếu hàng** (nguyên văn: "gộp thiếu hàng lk dặt mua với đổi trả vào cùng 1 tab để tiện quản lý và phản hồi kết quả, bổ sung thêm 1 cột nguồn tiếp nhận"): `GET /dat-mua-lk/thieu-lk` + `/thieu-lk-status-counts` trộn ticket THB (`thbGopWhere` / `thbSangDongTlk` trong `routes/datMuaLinhKien.ts`; lấy offset+pageSize dòng mỗi bên, trộn theo `ngay_tao` giảm dần rồi cắt trang; tải Excel trả hết) — chỉ người xem được THB (Kho/TN/Mua hàng/Kế toán/View/Admin); bỏ THB khi lọc `dat_don_hang_id` / `ma_lk_tt` / `du_hang` / "Chờ duyệt hủy". Trạng thái THB quy về nhóm TLK để lọc / đếm (`THB_TT_GOP_SQL`: hàng đã về → "Da ket thuc", Kho từ chối / Mua hàng từ chối / app rút lại → "Da huy bo"), dòng giữ `thb_trang_thai` hiện nhãn gốc; "Cần xử lý" THB theo `thbViec` (khớp badge Sidebar). Khu vực (MB1…) → miền THB (MB/MN, ticket chưa có miền vẫn hiện); người nhận hàng → `ktv_email`; tìm theo mã THB / đơn BH / case / LK / KTV / EO. Cột + tham số `nguon` (chọn nhiều): `NGUON_TLK_SQL` app_lk | doitra_cap (`ddh.nguon_tao=doitra` hoặc `nguon_ngoai=suachua`) | api (`phieu_dat.partner_key_id`) | bh — bản sao nhãn FE `NGUON_TIEP_NHAN` (`ThieuLkTab.tsx`). FE: `ThieuHangTabs` bỏ tab "Thiếu hàng bảo hành", tab đầu đổi tên "Thiếu hàng (đặt mua + bảo hành)" + chip "BH n" (số THB chờ mình); dòng THB → `XemThieuHangBh`; `KhuVucChipFilter` thêm prop `tieuDe` để dùng cho bộ lọc nguồn. `ThieuHangBhList` không còn được dùng (giữ file cho popup / Ctrl+K). Kiểm thử local (D1 demo + 3 ticket THB mẫu, admin): danh sách gộp đúng thứ tự, ghép các trang = danh sách đầy đủ (26/26), lọc nguồn / từ khoá / nhóm trạng thái, số đếm cộng THB, popup THB "Chuyển Mua hàng" → dòng cập nhật ngay; giao diện máy tính + điện thoại đã xem. Kiểm thử: 2 Worker local nối service binding, e2e 24/24 + kéo lại khi lỡ push + lý do chậm độc lập; giao diện mục mới CHƯA xem bằng mắt (trình duyệt kiểm thử không mở được cổng local).

**Gợi ý THB trong Danh sách Đơn hàng** (2026-11-26, v1.566): báo lỗi nguyên văn "mã "SC2611090581" này đã tạo đơn linh kiện, nhưng bên app linh kiện lại không tìm thấy =>> check bug" — tra D1 thật: ca chỉ có 4 ticket THB (THB-000144 → 147, đúng mã case), không có DDH, nên danh sách Đơn hàng ra trống. Không phải lỗi dữ liệu. Đã thêm `GoiYThbTheoMa` (`frontend/src/modules/datMuaLinhKien/ThieuHangBh.tsx`, gắn ở `DonCuaToiTab.tsx` trên `DonHangGroupedList`): tổng = 0 + từ khoá ≥ 3 ký tự → gọi `/dat-mua-lk/search`, lọc `type = thieu_hang_bh` (giới hạn 5, hiện "5+"), hiện gợi ý + chip mở `XemThieuHangBh`. Quyền theo `/search` (Kho / TN / Mua hàng / Kế toán / View / Admin; + Giám sát từ v1.569); KTV không thấy gợi ý. **v1.569** (2026-11-26, "vẫn không thấy, cả fix cho cả tài khoản thamnth1508@gmail.com" — ảnh Ctrl+K "Đang xem như" phamgiang3104): 2 tài khoản là Giám sát thuần nên bị loại khỏi quyền xem THB. Gom quyền xem về `xemThbDuoc()` (`lib/thieuHangBh.ts`, nguồn duy nhất cho `routes/thieuHangBh.ts` danh sách / chi tiết, `/dat-mua-lk/search`, `xemThbGop` danh sách Thiếu hàng gộp) và thêm `vai_tro = 'Giam sat'` — CHỈ XEM (nút xử lý vẫn theo `vai.kho` / `vai.mua_hang`). Giám sát thấy MỌI ticket THB (ticket không có khu vực), badge việc không đổi. Lưu ý trả lời người dùng: ticket THB "Hàng đã về" KHÔNG tự tạo đề xuất / đơn cấp LK sửa chữa — chỉ báo trạng thái về đơn BH gốc.

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
**Mua hàng thấy TẤT CẢ ticket "Chờ mua hàng"** (2026-10-29, v1.422): tài khoản Mua hàng kiêm Kho/TN đi nhánh phạm vi Kho (GS phụ trách / nhóm LK) →
`thieuLkListWhere` + `GET /thieu-lk/:id` nối `OR trạng thái = 'Cho mua hang'` khi `laMuaHangXuLy`; badge đếm "Cho mua hang" riêng không phạm vi
(`notifications.ts`); `ThieuLkTab` không áp khu vực mặc định cho Mua hàng.

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

**ĐÃ XOÁ HẲN TÍNH NĂNG HỎI ĐÁP** (chốt 2026-11-17, v1.516 — chủ hệ thống: "App đặt link kiện: tắt hết phần hỏi đáp" rồi "xóa bỏ luôn tính năng hỏi đáp"):
xoá mã nguồn 2 phía — FE `components/hoiDap/*` (widget chat, Hỏi nhanh, Hướng dẫn, LK tự động, nạp gói), `modules/HoiDapModule.tsx`, `lib/huongDan.ts`,
`public/huong-dan-goi/*`, menu "Hỏi đáp" + số đếm Sidebar (`countKey` `hoiDap`), khoá cache `huong-dan` (`TINH_QUERY`), nhánh mở ticket ở chuông thông báo
(thông báo `hoi_dap` cũ vẫn hiện nhãn, bấm chỉ đánh dấu đã đọc); BE `routes/hoiDap.ts`, `routes/huongDan.ts`, `lib/huongDan.ts` + 2 mount `/api/hoi-dap`,
`/api/huong-dan` ở `index.ts`. 2 nút nổi "Nạp quỹ" (`NutNopQuyNoi`, `NutNopTienKeToan`) dời vào đúng chỗ nút chat cũ (`right-5 bottom-28`, mobile `right-3`).
Bảng D1 `hoi_dap` (22 dòng), `hoi_dap_tin` (93), `huong_dan` (85) + trigger `trg_md_huong_dan_*`, domain `md_huong_dan`, bộ đếm `id_counters` 'hoi_dap'
ĐÃ XOÁ bằng migration `0124_xoa_hoi_dap.sql` (chủ hệ thống: "Xoá 3 bảng"); mốc khôi phục Time Travel ghi trong file migration (giữ 30 ngày).
**Báo cáo bảo mật / audit không đẩy lên repo** (cùng ngày — "xóa vấn đề bảo mật khỏi repo và sau này không đẩy file đó lên"; repo ETX87 công khai):
`docs/BAO_CAO_BAO_MAT_*` + `docs/audit/` đã gỡ khỏi repo (giữ bản trên máy) và nằm trong `.gitignore`. Báo cáo bảo mật mới đặt vào đó, không commit.
Mọi mô tả Hỏi đáp bên dưới chỉ còn là lịch sử.

**ĐÃ TẮT CHAT NGƯỜI THẬT** (chốt 2026-11-07, v1.449 — "tắt việc chat với người thât, chỉ để lại tính năng tự động phản hồi hướng dẫn theo các vấn đề có sẵn"): khung icon chat (`HoiDapWidget.tsx`) chỉ còn "Hỏi nhanh" + "Hướng dẫn" cho MỌI người, khung ghi chú `GhiChuTuDong` (`HoiNhanh.tsx`) "tài liệu hướng dẫn tự động … trao đổi trên ứng dụng "Hỏi đáp linh kiện"", bỏ mọi nút "Hỏi Mua hàng" (prop `onHoiMuaHang` không truyền). Backend `hoiDap.ts` hằng `CHAT_NGUOI_THAT = false`: POST `/` + `/:id/tin` → 410 `CHAT_DA_TAT`, `/dem` trả 0, `gui_tin`/`tiep_nhan` false; ticket cũ vẫn xem được, Mua hàng/Admin vẫn đóng được. Bật lại = đổi hằng số + khôi phục widget. Mô tả cũ bên dưới là lịch sử.
**Hỏi đáp KTV ↔ Mua hàng** (chốt 2026-10-17, v1.361, migration `0089`, `routes/hoiDap.ts` tại `/api/hoi-dap`, FE `components/hoiDap/HoiDapWidget.tsx` mount ở `App.tsx`): icon chat góc dưới phải (mobile: trên BottomTabBar, khung toàn màn hình). Mỗi câu hỏi = 1 ticket `hoi_dap` (`HD-…`, loại `hoi_gia`/`hoi_ngay_ve`/`khac`, mã LK + mã đơn tuỳ chọn) + tin `hoi_dap_tin` (`phia` hoi/xu_ly/he_thong). Trạng thái: "Cho tiep nhan" → "Dang xu ly" (Mua hàng bấm Tiếp nhận hoặc trả lời tin đầu) → "Da xu ly"; "Tu choi" (Mua hàng, bắt buộc lý do) / "Huy bo" (người hỏi) — 3 trạng thái đóng không nhắn thêm ("Hỏi tiếp" = ticket mới). Người hỏi = mọi tài khoản đã duyệt, chỉ thấy của mình; người xử lý = `la_mua_hang` + Admin, thấy tất cả — router KHÔNG dùng `requireDatMuaLkArea` (middleware đó chặn ghi của Mua hàng). Chưa đọc = so `tin_cuoi_luc/tin_cuoi_tu` với `doc_hoi_luc`/`doc_xu_ly_luc` (mốc đọc CHUNG phía Mua hàng); `GET /hoi-dap/dem` cho số đỏ trên icon. Thông báo: `thong_bao_ktv` loại/link_type `hoi_dap` + Web Push (ticket mới → mọi Mua hàng; tin người hỏi → người đã tiếp nhận, chưa có thì mọi Mua hàng; trả lời/đổi trạng thái → người hỏi); chuông bấm → sự kiện window `mo-hoi-dap` mở đúng ticket. **Menu Sidebar "Hỏi đáp"** (v1.362, key `hoi-dap`, `modules/HoiDapModule.tsx`): Mua hàng (`App.tsx` allowedModules) + Admin — bảng quản lý ticket (lọc trạng thái kèm số đếm, tìm; tải `GET /hoi-dap?gioi_han=500` rồi lọc trên máy), bấm dòng = phát sự kiện `mo-hoi-dap` mở khung chat; số trên mục = chờ tiếp nhận + tin mới (`countKey` `hoiDap`, Sidebar dùng chung query `hoi-dap-dem` với icon). Icon chat đặt `bottom-28` (desktop) / `9rem` trên đáy (mobile) — cao hơn để không che thao tác cuối trang. **Cảnh báo yêu cầu mới cho Mua hàng** (v1.363, "khi có yêu cầu chat mới đẩy thông báo về cho nhân viên mua hàng"): phía xử lý hỏi `/hoi-dap/dem` 20s/lần kể cả khi tab ẩn; `/dem` trả `moi_nhat` (ticket chờ tiếp nhận / có tin người hỏi chưa đọc mới nhất) → `useCanhBaoYeuCauMoi` so mốc `luc` giữa 2 lần: mới hơn = popup nổi cạnh icon ("Mở trả lời") + âm báo WebAudio + làm mới chuông; tab ẩn và thiết bị CHƯA đăng ký push → thêm `Notification` của trình duyệt (có push thì backend đã hiện). Lần tải đầu còn ticket chờ → popup nhắc không âm. Push ticket mới tiêu đề "💬 Câu hỏi mới từ KTV", URL `/?hoi_dap=<id>` (widget đọc tham số lúc tải → mở đúng ticket). Push CHỈ tới thiết bị đã bật (`push_subscriptions`) — khối `BatPushHoiDap` nhắc bật ở khung chat + menu Hỏi đáp khi thiết bị này chưa bật. **Hỏi đáp tự động** (chốt 2026-10-28, v1.414, migration `0102` — "khi KTV click vào mục hỏi sẽ hiện các hướng dẫn, hình ảnh tự động đẩy lên drive và hiện ra trong câu trả lời"): kho `huong_dan` (tiêu đề, nội dung, ảnh Drive ≤ 10, từ khóa, nhóm, bật/tắt, lượt xem / "đã giải đáp") — `routes/huongDan.ts` tại `/api/huong-dan` (xem: mọi tài khoản; soạn/ảnh `POST /anh`: Mua hàng + Admin). Bộ chấm điểm `lib/huongDan.ts` (bản sao FE `frontend/src/lib/huongDan.ts` — đổi 1 bên đổi cả 2): người hỏi mở khung chat → tab "📘 Hướng dẫn" trước; gõ câu hỏi → `GoiYKhiGo`; `POST /hoi-dap` tự chèn tin `he_thong` kèm `hoi_dap_tin.huong_dan_ids` (≤ 3 khớp nhất), KTV bấm "Đã giải đáp, đóng câu hỏi" = Hủy bỏ. Tin nhắn 2 phía kèm ảnh (`hoi_dap_tin.anh`, ≤ 5, `POST /hoi-dap/anh` → Drive); Mua hàng "📘 Gửi hướng dẫn" (`huong_dan_ids` ở `POST /:id/tin`, chỉ phía xử lý, hướng dẫn đang bật) + "Lưu thành hướng dẫn" (điền sẵn từ phiên). UI `components/hoiDap/HuongDan.tsx`; quản lý ở menu Hỏi đáp › tab "Hướng dẫn tự động". **Trả lời tự động theo mã LK** (chốt 2026-10-28, v1.415 — "KTV hỏi hàng còn tồn kho không?, tự động xác định trong câu hỏi có thông tin liên quan đến mã linh kiện bất kỳ ... khi click vào sẽ hiện thông tin UI linh kiện đó như tồn kho, đơn đang đặt của ktv"): `components/hoiDap/LkTuDong.tsx` — nhận diện TRÊN MÁY (danh mục LK cache `useLkAndLdeCache`, không ghi DB, áp cả tin cũ, 2 phía đều thấy): cụm có chữ số ≥ 3 ký tự khớp đúng mã (không phân biệt hoa/thường), rồi khớp sau khi bỏ `-` `.` `/` (chỉ khi duy nhất); mã LK chọn ở ticket tính vào tin đầu; ≤ 5 mã/tin, mỗi mã chỉ hiện ở lần nhắc đầu. Sau tin người hỏi hiện bong bóng 🤖 mỗi LK 1 thẻ: tồn kho công ty (file MISA, từng kho), tồn KTV, đơn đang chờ hàng / đặt 30 ngày — CÙNG `GET /settings/linh-kien/:ma/lien-quan` (`useLienQuanLk`, phạm vi theo người xem: KTV chỉ thấy tồn + đơn của mình); bấm thẻ = `XemLinhKienDrawer` (drawer Bảng giá, tab Tồn kho / Đặt hàng). **"💬 Hỏi nhanh"** (chốt 2026-10-28, v1.416 — "nó sẽ hiện dạng lựa chọn như 1 cuộc hội thoại … mỗi lựa chọn phân nhánh tối đa 5 lựa chọn … chia nhỏ đến từng vấn đề"; cây đã duyệt ở `docs/Phan_luong_hoi_dap_tu_dong.md`): tab MẶC ĐỊNH của người hỏi khi mở khung chat (`HoiNhanh.tsx`; có tin trả lời chưa đọc thì mở tab "Đã hỏi"; phía Mua hàng không đổi). **Hướng dẫn lưu D1, máy KTV đọc từ CACHE** (v1.418, migration `0103` — "database vẫn lưu để KTV hỏi, nhưng sẽ lưu về cache của máy họ, khi họ hỏi hoặc xem hướng dẫn thì sẽ không tốn lượt đọc D1 nữa"): mỗi vấn đề = 1 dòng `huong_dan` (nút **"📥 Nạp bộ hướng dẫn (n)"** ở tab Hướng dẫn tự động — `NapGoiHuongDan.tsx`: tải ảnh gói `/huong-dan-goi/*.jpg` lên Drive bằng tài khoản người bấm, mã `#<ma>` đã có (cả đang tắt) bỏ qua, hết lượt ảnh ngày thì dừng + bấm lại nạp tiếp); Mua hàng sửa trong app. Câu trả lời tìm hướng dẫn theo MÃ `#<ma>` ở `tu_khoa` (`maTuTuKhoa`); kho chưa có hướng dẫn nào mang mã → nội dung gói `cayHoiNhanh.ts`; đã nạp mà thiếu/tắt 1 mã → "Chưa có hướng dẫn, hỏi Mua hàng". Query `["huong-dan"]` (người hỏi) nằm trong `TINH_QUERY` (`lib/tinhCache.ts`) → IndexedDB, chỉ tải lại khi domain `md_huong_dan` tăng: TRIGGER `trg_md_huong_dan_i/u/d` — UPDATE CHỈ theo cột nội dung (tieu_de, noi_dung, anh, tu_khoa, nhom, stt, bat_tat), KHÔNG theo `luot_xem`/`luot_huu_ich` (nếu không mỗi lượt xem làm mọi máy tải lại). Màn quản lý (tatCa) dùng khoá riêng `["huong-dan-ql"]` không cache; sửa xong gọi `lamMoiHuongDan(qc)` (invalidate cả 2). `useHuongDan` KHÔNG đặt staleTime (ghi đè Infinity của TINH_QUERY). Hỏi nhanh KHÔNG ghi gì (không đếm lượt xem); hội thoại đang dở lưu localStorage `hoi-nhanh:<email>` (7 ngày). Tự trả lời khi GỬI câu hỏi (`POST /hoi-dap`) vẫn đọc kho ở server — chỉ khi gửi. Cấp 1 Linh kiện / Hướng dẫn dùng app / Đơn & phiếu của tôi / Vấn đề khác, mỗi cấp ≤ 5 lựa chọn. Linh kiện: Giá (danh mục cache: `gia_ban` + `gia_tri_cong_no`) / Còn hàng (`TheLk`) / Bao giờ có hàng + Thay thế (`useLienQuanLk`) / Không tìm thấy. Hướng dẫn: Nhóm → Chủ đề → Vấn đề (5 nhóm, 21 chủ đề, 84 vấn đề), mỗi vấn đề ≤ 4 bước + ≤ 1 ảnh + "Xem thêm" ≤ 2. Đơn & phiếu: GET `/dat-mua-lk/don-hang` (`__OPEN__` + Cho hang / TN tu choi + Da huy) và `/phieu-xuat-kho` (`CHO_TIEN` / Dang gui KTV, `nguoi_nhan_hang` = mình), ≤ 5 dòng, bấm mở `DonHangDetailModal`/`PxkDetailModal`. Câu trả lời luôn có ✓ Đã rõ / ↩ Hỏi việc khác / 💬 Vẫn cần hỏi Mua hàng (mở form điền sẵn loại + mã LK + nội dung — `Man.moi.noiDung`). Kho `huong_dan` (tab "📘 Hướng dẫn", tự trả lời khi gửi câu hỏi) vẫn là kho RIÊNG do Mua hàng soạn.

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
**Trả hàng dự trữ trả lại hạn mức** (chốt 2026-10-26, v1.408): "Mốc dự phòng hiện tại" = hạn mức − hiện tại − phát sinh MUA DỰ TRỮ
**+ TRẢ HÀNG DỮ TRỮ đã chốt** — dòng `loai_don='tra_hang'`, `loai_de_xuat='TRẢ HÀNG DỮ TRỮ'` trong PXK trả hàng Kế toán đã chốt
("Da chot xong don xuat" / "Kho da nhan hang tra"; không cần Kho), giá trị = `COALESCE(so_luong_thuc_xuat, so_luong_de_xuat)` ×
`linh_kien.gia_du_phong`, CHỈ phiếu chốt SAU mốc tính dự phòng (log "Da chot xong don xuat" > mốc — giống quy tắc "phát sinh").
1 SQL dùng chung `duPhongKtv.ts TRA_HANG_DU_TRU_SUBQUERY` (hàm 1 KTV `computeDuPhongTraHang` + bảng Danh sách KTV cột "Trả hàng dự trữ
đã chốt" `han_muc_du_phong_tra_hang`).

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
`taoTaiKhoanTuEtx()` — cùng kết quả bước tự động nhưng KHÔNG đòi chức danh CTV/KTV, duyệt cả tài khoản "Tu choi", tạo được cả nhân sự "Đã nghỉ" (2026-10-15, v1.336 — tài khoản mở; đồng bộ ETX chỉ khoá/mở khi trạng thái làm việc ĐỔI) (Admin tự quyết). **Chặn tạo từ ETX khi đã khai báo vai trò** (2026-11-25, v1.557 — "thêm chặn nếu tk đã có khai báo gs hoặc ktv không cho tạo từ etx nữa", `lib/vaiTroVanPhong.ts`): Gmail có tài khoản mang vai trò văn phòng (`vai_tro` Admin/QC/Giam sat hoặc cờ Kho/Kế toán/TN/TP DVBH/View/Mua hàng, mọi trạng thái duyệt) → `DA_CO_VAI_TRO_VAN_PHONG`; tài khoản "Da duyet" đã là KTV/Vệ tinh → `DA_LA_KTV`. Bước tự động `tuDongTaoKtvTuEtx` cũng bỏ qua Gmail có vai trò văn phòng (kể cả "Cho duyet"). GET `/etx-nhan-su` trả `tk_vai_tro_vp` → FE ẩn nút, nhãn "TK văn phòng: Giám sát". **Thẻ "KTV hiện trường" hiện vai trò văn phòng** (cùng đợt): GET `/settings/ktv-lien-he` trả `vp_email`/`vp_vai_tro` = vai trò văn phòng của tài khoản theo Email đăng nhập, mã chưa có thì theo `ktv_lien_he.gmail` → cột "Vai trò" thêm nhãn "VP: Giám sát" (vd mã còn sót sau khi người đó chuyển sang Giám sát — chuyển nhóm chỉ gỡ Gmail, danh bạ giữ lại). Nhãn FE: `frontend/src/lib/vaiTroVanPhong.ts` (bản sao bộ mã BE). **Tự tắt mã KTV khi chuyển sang văn phòng** (v1.558): `POST /users/:email/chuyen-nhom-vai-tro {to:"van_phong"}` gỡ Gmail + đặt `ngung_hoat_dong = 1` cho mọi mã đang trỏ tới Gmail đó (danh bạ giữ lại cho tồn kho / lịch sử) + tính lại hash danh bạ. `PATCH /settings/ktv-lien-he/:ma/bat-tat` nay chạy cả với mã CHƯA gắn tài khoản (chỉ đổi `ngung_hoat_dong`, trả `chua_co_tai_khoan: true`) — trước đây báo `CHUA_CO_TAI_KHOAN`. Gắn Gmail cho mã đang trống (`PATCH /:ma/dat-mua-lk` hoặc "Tạo tài khoản" ETX qua mã có sẵn) → tự bật lại mã. Cột "Tài khoản" thẻ KTV: mã chưa gắn tài khoản có công tắc + nhãn "Mã đã tắt". Dữ liệu 25/11: tắt 6 mã sót cùng kiểu (NS-848, NS-3683, NS-044, NS-1330, tuannv.gsmb, thienpt.bh). **Sửa v1.559 — giữ liên kết mã khi chuyển văn phòng** (bug "đơn tạo của nhất tâm lại không ra thông tin mã misa"): Mã MISA của đơn KHÔNG lưu trên đơn mà tra `nguoi_nhan_hang` → mã KTV đang gắn Gmail (`ktvChinhCuaEmailSql`), nên gỡ Gmail làm mọi đơn cũ mất Mã MISA. Nay `chuyen-nhom-vai-tro` van_phong CHỈ gỡ + tắt mã KHÔNG có Mã MISA VÀ Gmail chưa có đơn nào (người nhận hàng); mã còn lại GIỮ liên kết, đang bật (giống GS có mã đặt hàng, thẻ KTV hiện nhãn "VP: …"), API trả `ma_giu_lien_ket`. Dữ liệu: gắn lại NS-848 (TBP04) → nhattam8688, NS-044 (NV0000015) → huonggiang20124, bật lại 2 mã.

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

**Cột "Công nợ hiện tại" ở Danh sách KTV** (2026-11-19, v1.532 — "Danh sách KTV không thấy hiện cột công nợ hiện tại, chỉ thấy cột trần công nợ"): `GET /settings/ktv-lien-he?cong_no=1` (người xem không phải KTV thuần) kèm `cong_no_hien_tai` + `cong_no_danh_gia` = CHÍNH `docCongNoTongHop()` của menu Công nợ (thực tế file MISA + phát sinh − đã trừ) cho các mã đang hiện (1 truy vấn); KTV không có tồn kho trong file MISA gần nhất → "—". Cột ngay sau "Trần công nợ" (`UsersModule.tsx` KtvTab), đỏ = vượt trần, cam = cảnh báo. Lưu ý: dòng "Lý do" của đơn "Chờ GS duyệt" là số LÚC TẠO ĐƠN (ghi log), còn "công nợ hiện tại" trong chi tiết đơn tính lúc xem — import file MISA mới đổi số thực tế nên 2 số có thể khác nhau.

**Tự xét lại đơn "Chờ GS duyệt" khi công nợ giảm** (2026-11-19, v1.533 — DDH-007559 nằm chờ GS dù công nợ đã giảm dưới trần; chủ hệ thống "Có, làm luôn"):
`xetLaiDonChoGsDuyet()` (`lib/tuDongDuyet.ts`) — đơn "Cho GS duyet" `danh_gia_cong_no='Khong du'`, chưa mã EO, công nợ thật (`canDoiChieuCongNo`, KHÔNG áp
MUA HÀNG CÔNG NỢ ĐỐI TÁC). Mỗi người nhận: công nợ chốt HIỆN TẠI (`computeCongNoChot`), xét đơn cũ nhất trước, CỘNG DỒN tiền công nợ các đơn đã qua, gặp đơn
vẫn vượt thì dừng. Qua → `danh_gia_cong_no='Du'` + định tuyến như GS vừa duyệt (`trangThaiSauDuyet "gs"`, tồn kho → duyệt / chờ thanh toán / chờ hàng) + log
`tu_dong` + báo người tạo. Chạy sau lô cuối import tồn kho (`ktvTonKho.ts`, sau `tuDongXacNhanHangVe`) + cron mỗi giờ (`index.ts`; log ghi theo người tạo đơn).

**KTV "Không có trần công nợ"** (chốt 2026-11-12, v1.484, migration `0117` — "1 số KTV không có trần công nợ, cho phép KT, TN set up trong mục ds KTV mục trần công nợ thêm dạng KTV không có trần công nợ => khi đặt hàng sẽ không phải chờ TBP duyệt trần nữa"): cờ `ktv_lien_he.khong_tran_cong_no` (+ `_luc`/`_boi`), bật/tắt qua `PATCH /settings/ktv-lien-he/:ma/khong-tran-cong-no` {khong_tran} (Kế toán / TN / Admin) — ô tích dưới "Trần công nợ" ở form sửa KTV (`UsersModule.tsx` KtvTab, mọi mode trừ readonly), cột Trần công nợ hiện "Không có trần". `nguCanhNhan().khongTran` (lấy theo mã KTV chính của Gmail như `cong_no`) → `danhGiaPhieu` bỏ đối chiếu trần y như người nhận là GS (không "Cho GS duyet", TBP không đòi mã EO, log khởi tạo "KTV không có trần công nợ — bỏ qua duyệt trần"); `/cong-no-du-kien` trả `khong_xet_tran` (form tạo đơn ẩn cảnh báo); màn Công nợ (`docCongNoTongHop`) đánh giá "Binh thuong". Gộp mã KTV giữ cờ (MAX). Chưa có cột import Excel cho cờ này.

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

**MUA HÀNG CÔNG NỢ ĐỐI TÁC** (chốt 2026-10-26, v1.403, migration `0099`, `lib/congNoDoiTac.ts` + `routes/doiTacCongNo.ts` tại `/api/doi-tac-cong-no`) —
"thêm 1 lựa chọn khi đặt hàng 'MUA HÀNG CÔNG NỢ ĐỐI TÁC' … chọn đối tác từ danh sách … cảnh báo số tiền còn khả dụng … như đơn mua bình thường, chỉ là cho phép
thanh toán sau và thêm 1 mốc cảnh báo nếu vượt". Loại đề xuất mới (2 nhóm KTV + TN/GS) = đơn `loai_don='mua'` + `dat_don_hang.doi_tac_ma` (Mã MISA đối tác).
Tên chứa "CÔNG NỢ" nên MỌI chỗ nhận diện công nợ bằng chuỗi phải loại trừ `laMuaCongNoDoiTac()` (`pxkRecalculate.ts`, bản sao FE `helpers.ts`): `deriveLoaiDon`
(→ mua), `canNoRequired`, `laXuatMayDoiBaoHanh` (MISA). Chốt người dùng: người nhận như đơn thường, **giá niêm yết** (`tinhToanPxk` = `gia_chot ?? gia_de_xuat`,
nhãn KHONG_CK, không vào tổng ngày `DON_TINH_TONG_NGAY_SQL`), **phiếu RIÊNG** theo đối tác (`phieu_xuat_kho.doi_tac_ma`, `bundleAutoApprovedIntoPxk` tách nhóm,
tạo tay/thêm dòng/chuyển đơn kiểm tra + TRIGGER `trg_pxk_dong_doi_tac` chặn trộn ở mọi đường) **không cần chuyển tiền** (`taiTinhPxk` → `so_tien_can_chuyen`
NULL, đơn không `bat_buoc_chuyen_tien`, không bao giờ "Cho thanh toan"; cột chuyển tiền theo đơn = `cong_no_doi_tac`), **sổ công nợ đối tác riêng** (không đụng
quỹ KTV). Bảng `doi_tac_cong_no` (ma_misa NOCASE, tên, `cong_no_ban_dau`, `cong_no_toi_da`, bật/tắt) + `doi_tac_thanh_toan` (Kế toán ghi khoản đối tác trả, hủy
= 'Da huy'). Tính lúc đọc `docCongNoDoiTac()`: Hiện tại = ban đầu + tiền mọi đơn đối tác còn hiệu lực (Đã ghi nợ = trong phiếu Kế toán đã chốt —
`DON_DA_GHI_NO_SQL`; còn lại = Đang chờ) − đã thanh toán; Khả dụng = tối đa − hiện tại. `danhGiaPhieu()` cộng dồn các dòng cùng đối tác: vượt tối đa →
`danh_gia_cong_no='Khong du'` → "Cho GS duyet" (nhập mã EO như vượt trần, `trangThaiSauDuyet` + log lý do `ghiChuDoiTac`), còn lại như đơn mua (tồn kho → tự
duyệt / Chờ hàng). Kế toán chốt phiếu đối tác → log phiếu "Ghi nợ công nợ đối tác …", đẩy lùi về Chờ mã MISA → "Bỏ ghi nợ". File MISA: khách hàng = Mã/Tên MISA
đối tác. **Quyền đặt** (chốt người dùng): TN (gồm Kế toán) / GS / Admin chọn mọi đối tác đang bật; KTV CHỈ đặt cho chính mình khi Mã MISA của mình có trong danh
sách (đối tác tự điền, `chuanBiPhieuDat` → `KHONG_DUOC_DAT_CONG_NO_DOI_TAC`); còn lại ẩn lựa chọn (`GET /chon` rỗng → FE lọc khỏi loại đề xuất). Không đổi loại
đề xuất qua lại với loại khác (`DOI_LOAI_CONG_NO_DOI_TAC`), chưa hỗ trợ import Excel. UI: tab "Công nợ đối tác" ở Danh sách KTV (`modules/DoiTacCongNoTab.tsx`
— TN/Kế toán/Admin thêm/sửa/bật-tắt, Kế toán/Admin ghi/hủy thanh toán, chi tiết đơn + khoản trả), ô chọn đối tác + cảnh báo khả dụng ở form tạo đơn
(`datMuaLinhKien/DoiTacCongNoChon.tsx`), dòng "Đối tác công nợ" ở chi tiết đơn, khối "Chuyển tiền" của phiếu đối tác hiện ghi nợ thay yêu cầu chuyển.
**Ghi thanh toán đối tác ở Quỹ & chuyển tiền** (chốt 2026-10-26, v1.404 — "mục thanh toán 'Công nợ đối tác' hiện chung trong menu Quỹ và chuyển tiền … kế toán
chỉ cần vào, add hoặc import số tiền đối tác đã thanh toán"): tab "Công nợ đối tác" (`modules/quyChuyenTien/ThanhToanDoiTac.tsx`, nhân viên văn phòng xem —
`xemDoiTac` khớp `xemToanBo`) = tóm tắt công nợ từng đối tác (bấm mã = lọc) + danh sách MỌI khoản (`GET /doi-tac-cong-no/thanh-toan?trang_thai=&tu=&den=`, ≤ 1000)
+ "Ghi thanh toán" (POST `/:ma/thanh-toan` sẵn có) + Import Excel/CSV (cột Mã MISA đối tác / Số tiền / Ngày chứng từ / Nội dung, "Nội dung chung cho dòng trống",
màn kiểm tra chặn tới khi hết dòng lỗi) → `POST /thanh-toan/import` {items ≤ 200} kiểm tra HẾT trước khi ghi (dòng lỗi → 400 `CO_DONG_LOI` + `loi`, không ghi
dòng nào), FE gửi lô 200. Ghi/hủy CHỈ Kế toán/Admin. Quản lý đối tác (thêm, sửa mốc, bật/tắt) vẫn ở Danh sách KTV.
**Đối tác mặc định = người nhận hàng** (chốt 2026-10-26, v1.406 — "KTV đặt công nợ đối tác thì không cần chọn đối tác, mặc định sẽ chính là ktv đó. chỉ có GS, TN,
KT mới có quyền chọn lại đối tác"): `GET /doi-tac-cong-no/chon` trả thêm `emails` (Gmail mã KTV đang bật cùng Mã MISA đối tác); `useTaoDonForm` tự điền
`doi_tac_ma` cho dòng đối tác = đối tác của người nhận hàng (KTV tự đặt = của chính mình, ô chỉ hiện không chọn; nhiều mã của mình mới hiện ô chọn trong số đó),
GS/TN/KT/Admin vẫn chọn lại được. Dòng chọn tay (`doi_tac_tu_dong=false`, chỉ ở FE) không bị ghi đè khi đổi người nhận; dòng tự điền đổi theo người nhận.
**KTV nhận hàng KHÔNG bị tính tiền / công nợ** (chốt 2026-10-26, v1.409 — "gán nợ cho đối tác, KTV nhận hàng sẽ không bị tính công nợ hay tiền cần mua"): ngoài các
chỗ đã có (loai_don 'mua' → không vào công nợ phát sinh KTV; phiếu riêng `so_tien_can_chuyen` NULL; không vào tổng ngày; MISA khách hàng = đối tác), thêm: "Trả bằng
quỹ dư" chặn đơn đối tác (`thongTinTraBangQuy` → `DON_KHONG_CAN_CHUYEN_TIEN`), báo cáo tổng thể "Tổng thực tế đã mua" bỏ đơn đối tác (`w_tien`), FE: tổng tiền nhóm
KTV + tổng tiền đã chọn ở danh sách bỏ đơn đối tác, chi tiết đơn đổi nhãn "Tổng tiền đề xuất" → "Ghi nợ đối tác", form tạo đơn tách "Ghi nợ đối tác" khỏi tổng
giá tham khảo (`tongGhiNoDoiTac`).

**Đợt 13 yêu cầu v1.410** (chốt 2026-10-27): (1+5) **Mua hàng "⏳ Chuyển chờ hàng"** — `POST /dat-mua-lk/don-hang/:id/cho-hang` {ghi_chu bắt buộc}
(Mua hàng + Admin + Kế toán từ v1.546 — nút "Chờ hàng" của TN bị khoá khi Kế toán đã duyệt tiền phiếu; `requireDatMuaLkArea` mở riêng route này + `/don-hang/:id/log` cho Mua hàng): đơn Mua/Công nợ (không TRỪ CÔNG NỢ, không gửi bù) "Cho TN duyet"
/ "Cho thanh toan" / "TN da duyet" CHƯA trong phiếu đã gửi Kế toán (`MUA_HANG_CHO_HANG_DUOC_SQL` ở `lib/pxkTuHuy.ts`, cột `mua_hang_cho_hang_duoc`) → "Cho hang",
rời phiếu "Dang tao phieu" MANG THEO tiền, ticket mở thẳng ở "Cho mua hang" (`moTicketChoHangTuDong` opts `choMuaHang`, không báo Kho). (2) **LK B2B bỏ duyệt
trần công nợ**: `danhGiaPhieu` đọc `linh_kien.nhom_lk`, dòng B2B không cộng vào tổng/không "Khong du"; log khởi tạo thêm "Linh kiện B2B — bỏ qua duyệt trần công nợ"
(`KetQuaDong.boQuaTranB2b`); FE cảnh báo công nợ tạm tính bỏ LK B2B (cache LK thêm `nhom_lk`, SCHEMA_VERSION 5). (3) **Đơn vượt trần đã duyệt** (có `ma_eo`):
`VUOT_TRAN_GHI_CHU_SQL` (`tuDongDuyet.ts`, đọc log khởi tạo) → chi tiết đơn khối `DuyetVuotTranKhoi` + dòng đơn trong chi tiết PXK badge `DuyetVuotTranBadge`
("✓ Duyệt vượt trần +X", tooltip mã EO/người duyệt/công nợ + đơn > trần) — `datMuaLinhKien/DuyetVuotTran.tsx`. (4) **Ô tìm kiếm nổi bật**: class `.o-tim`
(`tokens.css` — nền trắng, viền primary + vòng sáng, icon kính lúp) gắn vào ô tìm chính mọi màn (FilterSearchBar, Bảng giá `TimLkBox`, Đơn hàng, Phiếu xuất,
Quỹ, Users, Công nợ…) — ô tìm mới cũng gắn class này. (6) **GS hủy hộ đơn "TN da duyet" trong phiếu**: phiếu "Dang tao phieu" + Kế toán chưa chốt tiền, hoặc phiếu
KHÔNG cần chuyển tiền đang "Cho ke toan" chưa có Mã MISA (`GS_HUY_TRONG_PXK_SQL`/`pxkGsHuyDuoc`, cột `gs_huy_trong_pxk`). (7+10) **Tiền cần chuyển = 0 không cần
Kế toán duyệt**: `canBangPxk` mặc định ("cho-ke-toan") đủ tiền bằng quỹ / tiền đơn mang theo mà KTV CHƯA báo chuyển (`ngay_ktv_chuyen` NULL, không ảnh bằng chứng
mới) → thẳng "TN da duyet" (cả phiếu hệ thống từng đặt "KTV da chuyen"); phiếu còn đơn "Cho thanh toan" → gọi `xuLyDonChoThanhToan` (cần env —
`lib/envToanCuc.ts`, gán ở `index.ts` mỗi request/cron). Bug PMH-001400 (đơn mang tiền sang phiếu mới vẫn bắt Kế toán xác nhận 0đ). Migration `0100` áp 1 lần cho
phiếu cũ. (8) **Menu "Chờ thanh toán"** = sentinel `__CHO_TT__` (`CHO_THANH_TOAN_GOP_SQL`): "Cho thanh toan" + đơn "TN da duyet" có cột Chuyển tiền
cho_thanh_toan/cho_xac_nhan (+ counts). (9) **Đơn "Cho hang" Kho/Mua hàng đã xác nhận xử lý**: KTV/người tạo KHÔNG hủy được (đơn lẫn ticket); Kho / Mua hàng /
Admin hủy = hủy ticket → đơn tự hủy (`applyDonHangLog` gọi `applyThieuLkLog` "Da huy bo", bắt buộc lý do); FE `actionsFor` ctx `laKhoMuaHang`. Nút "Hủy bỏ…" ở Drawer ticket thiếu hàng mở khung "Lý do hủy *" (`CAN_NHAP_LIEU` có "Da huy bo", sửa v1.428 — trước gửi thẳng → `THIEU_LY_DO_HUY`); hủy hàng loạt hỏi 1 lý do chung. (11) **Ảnh bằng
chứng chưa bấm "Đã chuyển"**: đóng Drawer/Modal → popup "Bạn chưa xác nhận chuyển tiền" (Ở lại / Đóng, không xác nhận / Xác nhận đã chuyển) — cơ chế chung
`components/ui/chanDong.tsx` (`useDongCoHoi` trong Drawer/Modal, form gọi `useChanDong`). (12) **Nháp tạo đơn**: không tự khôi phục nữa — mở form có nháp →
popup "Mở lại đơn tạo dở?"; đóng form còn nội dung → "Lưu lại cho lần sau / Không lưu / Tiếp tục soạn" (`NhapTaoDonHoi.tsx`); app tắt bất ngờ vẫn tự lưu.
**Sửa v1.413** (2026-10-28): tạo đơn xong `useTaoDonForm` reset form về 1 dòng NHƯNG giữ `activeIdx` cũ → màn tạo đơn MOBILE (`TaoDonMobileScreen`
đọc `drafts[activeIdx]`) trắng lỗi "reading 'loai_de_xuat'" sau "Đặt tiếp" khi đang ở dòng ≥ 2; giờ reset `activeIdx = 0` + fallback `drafts[0]`.
(13) **File MISA gộp dòng cùng mã LK** trong 1 phiếu cho MỌI loại (`gopDongCungMa`, trước chỉ trả góp): khóa = mẫu + phiếu + KTV + mã LK + loại đề xuất (+ chính
sách với HỖ TRỢ 0 ĐỒNG, + đơn giá với Chuyển kho); SL cộng, tiền Bán hàng cộng, Mã YCSC/Lada nối.

**Đợt v1.434** (chốt 2026-11-03, migration `0105`):
- **Chiết khấu cộng phiếu đang mở** ("nếu hiện tại KTV có phiếu chờ chuyển tiền hoặc đơn đã chuyển tiền nhưng kế toán chưa chuyển sang trạng thái tạo xong đơn => cho phép tính tổng tiền cả phiếu đó vào … cần giải thích rõ lý do").
  - Mốc 200k/500k của 1 dòng = tổng ngày + giá bán × SL các đơn KHÁC ngày nằm trong phiếu của KTV mà Kế toán CHƯA chốt xong đơn xuất lúc dòng được tạo.
  - Mốc chốt = `phieu_xuat_kho.chot_ke_toan_luc`: TRIGGER ghi lần đầu phiếu rời "Dang tao phieu"/"Cho ke toan" (trừ hủy); phiếu cũ backfill từ log.
  - Hàm `donTrongPhieuMo()` trong `tinhToanPxk` (`pxkRecalculate.ts`) — bỏ qua phiếu hủy / trả hàng / đối tác.
  - Dòng trong phiếu đã khóa tiền (`khoa_ck` = Kế toán đã duyệt tiền hoặc phiếu qua "Dang tao phieu") dùng mốc đã lưu `dat_don_hang.ck_co_so` (JSON {ma, ly_do, moc, ngay, tong_ngay, phieu}), không đổi giá theo đơn phát sinh sau; chưa từng lưu thì theo quy tắc cũ (chỉ tổng ngày).
  - `ck_co_so` ghi ở `taiTinhPxk` + `ganLoaiChietKhauDonChuaPxk`.
  - `GET /tong-ngay-ktv` trả `phieu_mo` + `tong_tinh_ck` → form tạo đơn (`useTaoDonForm` `tongNgaySau`) + `TongNgayKtvLine`.
  - Giải thích: `datMuaLinhKien/CoSoChietKhau.tsx` (khối ở chi tiết đơn, nút ⓘ ở dòng đơn trong phiếu); đổi quy tắc giá thì sửa câu ở đây.
- **Gộp log tự động liên tiếp**: `timelineLogGop()` (`SharedUi.tsx`) gộp các log liên tiếp cùng người (hoặc hệ thống / `tu_dong`) cách nhau ≤ 20 giây thành 1 mục, các bước sau hiện "↳" — dùng ở lịch sử đơn / phiếu / thiếu hàng / hàng trả.
  - `GhiChuLog`: mã `DDH-` và `PMH-`/`PCN-`/`PTL-` trong ghi chú log luôn bấm được (`MaDonLink`/`MaPhieuLink` ở `datMuaLinhKien/MaLienKet.tsx` — Quỹ cũng dùng `MaPhieuLink` này).
  - Bỏ đơn đã thanh toán khỏi phiếu → log thêm ở phiếu cũ "Đơn … đã vào phiếu …, mang theo …đ"; log thêm dòng ghi mã đơn.
- **Tách đơn chờ hàng** ("đặt 2, nhưng về có 1 … kho, kế toán, TN khả năng tách đơn … có tiền sẽ chia tiền"): `POST /dat-mua-lk/don-hang/:id/tach-don` {so_luong, duyet?, ghi_chu?} (Kho / TN gồm Kế toán / Admin) → `lib/tachDon.ts`.
  - Chép đơn "Cho hang" (mọi cột qua `PRAGMA table_info`, giữ `ngay_tao`) thành đơn mới SL k; đơn gốc còn n − k và giữ ticket.
  - `tien_da_tra` + `so_tien_cong_no` chia theo SL; chép lịch sử + Mã YCSC bổ sung; ghi vết vào log đơn + ticket.
  - `duyet` (mặc định) → đơn mới `duyetDonKhiHangVe` (vào phiếu, mang tiền); không thì mở ticket riêng. Batch CAS: đơn đổi giữa chừng → `STATE_CHANGED`.
  - FE `datMuaLinhKien/TachDon.tsx` (Drawer ticket thiếu hàng + nút "✂ Tách đơn" ở chi tiết đơn).
- **Tự duyệt hàng về DỪNG ở đơn chỉ đủ một phần**: `donHangVeTheoUuTien` — gặp đơn ưu tiên mà tồn còn > 0 nhưng < SL → `choPhuongAn` + khóa (mã, khu vực), đơn xếp sau không tự duyệt.
  - `GET /thieu-lk` (+ `/:id`) trả `kho_mot_phan` (`donHangVeMotPhan`) → badge "Kho có x/y" + khối hướng dẫn tách đơn.
  - "Rà soát hàng về" trả `cho_phuong_an`.

**Tách đơn ngay trong phiếu xuất** (chốt 2026-11-05, v1.440 — "tách đơn cho phép KT thực hiện ngay ở phiếu kế toán (trước khi kế toán xác nhận phiếu misa) => ví dụ KTV đặt 10 lk, đã chuyển khoản, nhưng kế toán xác định chỉ cho xuất trước 5 linh kiện, 5 linh kiện còn lại tách ra phiếu khác để xuất sau"):
- `POST /phieu-xuat-kho/:id/dong/:donHangId/tach` {so_luong, ghi_chu?} (Kế toán / TN / Admin) → `tachDonTrongPhieu()` (`lib/tachDon.ts`). Phiếu "Dang tao phieu" / "Cho ke toan", chưa Mã MISA, không trả hàng; đơn "TN da duyet", SL ≥ 2, chưa sửa SL thực xuất.
- Đơn mới = bản sao (giữ `ngay_tao` + `updated_at`) SL k RA KHỎI phiếu, mang theo phần tiền đã trả (tiền dòng × k/n, theo tỉ lệ phiếu đã trả; CAS `lenhKhoaDaThanhToan`) rồi tự gom (`bundleAutoApprovedIntoPxk`, bỏ qua phiếu nguồn); đơn gốc còn n − k. Công nợ chia theo SL.
- Phiếu nguồn "Dang tao phieu" → `taiTinhPxk`; "Cho ke toan" → trừ thẳng `so_tien_can_chuyen` (taiTinhPxk không sửa tiền ở bước này). Log phiếu nguồn ghi tách + phiếu đích.
- FE: nút "✂ Tách" trên dòng đơn (`PxkDongDonHangTable`, cả Drawer lẫn dòng xổ) → `TachDonPhieuModal` (`TachDon.tsx`).

**Thêm / bớt đơn tới khi Kế toán chốt** (chốt 2026-11-05, v1.442 — "nếu kế toán chưa xác nhận chốt xong phiếu (gửi sang kho) thì vẫn có thể thêm bớt linh kiện như ở bước trước khi nhập mã misa"): thêm đơn (`POST /:id/dong`), bỏ đơn (`DELETE /:id/dong/:donHangId`, cả bỏ nhiều), chuyển đơn (`/:id/dong/:donHangId/chuyen`) và tách đơn trong phiếu mở cho phiếu "Dang tao phieu" HOẶC "Cho ke toan" (`MO_SUA_DONG` ở `phieuXuatKho.ts`), BỎ chặn `DA_CO_MA_MISA`. Phiếu "Cho ke toan" chỉ nhận đơn "TN da duyet" và phải còn ≥ 1 đơn (`PHIEU_CHO_KE_TOAN_CON_1_DON` — bỏ hết = Hủy phiếu). Tiền: `taiTinhPxk` tính lại cả phiếu "Cho ke toan" — đủ tiền giữ "Kế toán đã duyệt" + ở lại bước (thừa hoàn quỹ, `canBangPxk`); tổng tăng mà sau khi trừ quỹ dư vẫn chưa "TN da duyet" → phiếu TỰ về "Dang tao phieu" (Chờ mã HĐ, giữ Mã đơn hàng / Mã MISA, log lý do), KTV chuyển bổ sung rồi gửi kế toán lại. Tách đơn "Cho ke toan" cũng dùng `taiTinhPxk` (bỏ trừ tay). Sửa SL thực xuất / giá / tiền công nợ vẫn chỉ ở "Dang tao phieu".

**Chi tiết phiếu xem được khi xem được 1 đơn trong phiếu** (sửa 2026-11-05, v1.443 — "tài khoản giám sát khi xem 1 đơn hàng, click vào mã phiếu xuất … không hiện UI phiếu mà đẩy ra màn hình đơn hàng"): phạm vi xem ĐƠN của GS/KTV (`scopeDatMuaNguoiTao` — đơn tự đặt hộ, `email_gs`, khu vực xem thêm) rộng hơn phạm vi PXK (`scopePxkNguoiNhanHang`, theo người nhận) → `GET /phieu-xuat-kho/:id` trả 404. Giờ chi tiết phiếu = phạm vi PXK **OR** phiếu chứa ≥ 1 đơn trong phạm vi xem đơn; danh sách phiếu / số đếm / thao tác giữ phạm vi cũ.

**Kế toán duyệt nhanh phiếu xuất** (chốt 2026-11-05, v1.441 — "thêm nút duyệt 'Kế toán duyệt nhanh': Mã đơn hàng = ID phiếu, mã PXK = PXK-'ID phiếu'" + chọn nhiều / tất cả phiếu → "KT duyệt nhanh", "KT duyệt trừ kho nhanh", "KT duyệt xong phiếu nhanh", "Trừ kho", "Đã chốt xong đơn xuất"):
- KHÔNG có API riêng — `datMuaLinhKien/DuyetNhanhPxk.tsx` gọi LẦN LƯỢT đúng các API bấm tay (giữ mọi kiểm tra + tác dụng phụ): `PATCH /:id/ma-xuat-kho` (mã đang gõ sẵn, không có thì = ID phiếu) → `POST /:id/log` "Cho ke toan" (gửi kế toán) → `PATCH /:id/ma-misa` "PXK-<ID>" → `POST /:id/log` "Hang tru kho" | "Da chot xong don xuat". Bước nào lỗi thì dừng phiếu đó, báo lý do, chạy tiếp phiếu sau.
- "Trừ kho" / "Đã chốt xong đơn xuất" chỉ nhận phiếu "Cho ke toan" đã có đủ Mã đơn hàng + Mã PXK. Trả hàng không trừ kho.
- UI: nút "⚡ Kế toán duyệt nhanh" ở chi tiết phiếu (Kế toán, phiếu "Dang tao phieu" hoặc "Cho ke toan" chưa Mã MISA); danh sách Phiếu xuất có ô chọn ở cột ID (tiêu đề = chọn cả trang) + thanh `ThanhDuyetNhanhPxk` ("Chọn tất cả N phiếu theo bộ lọc" tải mọi phiếu qua `taiPhieuTheoBoLoc`). Đổi bộ lọc = bỏ chọn. Chưa có ô chọn trên thẻ mobile.

**Chọn gộp / tách đơn thiếu hàng khi tạo đơn** (2026-11-27, v1.578 — "khi tạo đơn, hiện nhắc nhở và cho ktv hoặc người đặt lựa chọn gộp chung 1 phiếu
hay tách phiếu chứ không tự quyết"): `POST /phieu-dat/kiem-tra` trả `tach_cho_hang` (`tachChoHangCoTheGop` trong `routes/datMuaLinhKien.ts`: nhóm
[loai_don, nhomPhieu] có dòng "Cho thanh toan" + dòng vào phiếu khác (tự duyệt / bắt buộc chuyển tiền) HOẶC phiếu "Dang tao phieu" thường của người nhận
chưa Kế toán duyệt tiền, `cho_hang` 0, cùng nhóm). Body POST `tach_phieu_cho_hang: false` → `bundleAutoApprovedIntoPxk` opts `gopDonThieuHang` (cờ `ch`
= false → đơn thiếu vào chung nhóm; log phiếu ghi "Người đặt chọn GỘP…"). Không gửi = tách như cũ (giữ API đối tác). FE `GopPhieuDaDuTien.tsx` (2 hộp
`HopChon`), state `gopDonThieuHang` / `gopPhieuDaDuTien` kiểu `boolean | null` — null + hộp đang hiện = `chuaChonPhieu` chặn `canSubmit` (hộp phiếu đủ
tiền cũng thành bắt buộc chọn, bỏ mặc định "tách"). Tách sau vẫn được: nút "✂ Tách đơn chờ hàng" ở chi tiết phiếu. Thử local (DB demo): gộp → 2 đơn
cùng PMH-000033; không gửi → đơn thiếu sang phiếu chờ hàng PMH-000032.

**Chọn tách / gộp phiếu đã đủ tiền khi tạo đơn** (chốt 2026-11-20, v1.538 — "thêm lựa chọn cho người tạo (có muốn tách thành phiếu chờ chuyển/ phiếu đã có
đủ tiền không - vì có ktv muốn được chuyển về trong cùng 1 lần)"): mặc định `gomMotNhom` KHÔNG gộp đơn mới vào phiếu "Dang tao phieu" Kế toán đã duyệt tiền.
`POST /phieu-dat/kiem-tra` trả `phieu_da_du_tien` (`phieuDaDuTienCoTheGop` — cùng điều kiện nhóm phiếu, `khu_vuc_chon` NULL, không chờ hàng / đối tác); form
(`GopPhieuDaDuTien.tsx`) cho chọn, gửi `gop_phieu_da_du_tien` → `bundleAutoApprovedIntoPxk` opts `gopPhieuDaDuTien` (bỏ lọc trạng thái tiền, ưu tiên phiếu đã
duyệt) → `taiTinhPxk` đưa phiếu về "Cho KTV chuyen" phần thiếu + báo KTV. Cùng đợt: PATCH đơn nhận `kh_chuyen_khoan` (gỡ khỏi phiếu chưa tiền trước khi ghi
vì trigger `trg_ddh_kh_chuyen_khoan_khoa`), nút "Hủy phiếu trống", cron `huyMoiPhieuTrongCu` (phiếu trống ≥ 30 phút), danh sách PXK "tất cả" ẩn phiếu
đã hủy không còn đơn (v1.555: có gõ từ khóa tìm thì không ẩn — tìm mã phiếu phải ra).

**Đợt v1.411** (chốt 2026-10-28): (1) **Đơn đã thanh toán ưu tiên phiếu riêng**: `bundleAutoApprovedIntoPxk` tách nhóm đơn có `tien_da_tra > 0`
(không đối tác, không trả hàng) — CHỈ gộp vào phiếu "Dang tao phieu" Kế toán ĐÃ duyệt tiền (`trang_thai_chuyen_tien='TN da duyet'`, có tiền), không thì tạo
phiếu MỚI (tự "Kế toán đã duyệt" khi đủ tiền nhờ quy tắc tiền cần chuyển = 0); không bao giờ gộp vào phiếu đang chờ chuyển tiền. (2) **Ca khiếu nại**
(migration `0101`, `dat_don_hang.khieu_nai/_luc/_boi/_ghi_chu`): `PATCH /dat-mua-lk/don-hang/:id/khieu-nai` {khieu_nai, ghi_chu?} — GS / Kho / TN (gồm KT) / Admin;
không ghi `dat_don_hang_log` (tránh reset hạn 24h). UI `datMuaLinhKien/KhieuNai.tsx` (`KhieuNaiBox` ở chi tiết đơn) + nền đỏ nhạt `nenKhieuNai()` (`helpers.ts`,
token `--color-khieu-nai-bg`) ở danh sách đơn (desktop + thẻ mobile), dòng đơn trong phiếu, danh sách phiếu (`co_khieu_nai`), Thiếu hàng (`ddh_khieu_nai`),
Hàng trả. (3) **Tự xác nhận hàng về theo ưu tiên** (`lib/tuDongHangVe.ts`): đơn "Cho hang" (Mua/Công nợ, không TRỪ CÔNG NỢ) xếp ca khiếu nại > ngày tạo cũ >
cùng ngày đơn ưu tiên ⭐ (VIP = `uu_tien`) > giờ tạo; cấp phát lần lượt trên tồn khả dụng từng (mã LK, khu vực) — CÙNG công thức `donChoHangDuTonKho` —
đủ thì `duyetDonKhiHangVe` + ticket "Kho xac nhan hang da ve" → "Da ket thuc" + báo người tạo. Tự chạy sau lô cuối import tồn kho (`ktvTonKho.ts POST /import`,
`waitUntil`) + nút "📦 Rà soát hàng về" ở Thiếu hàng (`POST /dat-mua-lk/thieu-lk/tu-dong-hang-ve`, Kho/TN/KT/Admin). Nguồn tồn kho mới (đồng bộ hệ khác)
→ ghi bảng + mốc rồi gọi `tuDongXacNhanHangVe`. (4) **Danh sách Phiếu xuất**: bấm CẢ dòng = mở chi tiết phiếu; xổ/thu dòng đơn bằng nút ▼/▲ (`NutXoDongDon`).

**Tách phiếu xuất kho theo LOẠI ĐỀ XUẤT** (chốt 2026-10-28, v1.419 — "nếu khác loại đề xuất thì tách riêng phiếu ngoại trừ đơn MUA HÀNG + MUA HÀNG CÓ ID thì
gộp chung 1 phiếu được"; trước đó phiếu chỉ tách theo người nhận + `loai_don` nên CÔNG NỢ + HỖ TRỢ 0 ĐỒNG từng chung PCN-001432): 1 phiếu chỉ chứa đơn CÙNG nhóm loại
đề xuất — `lib/nhomLoaiDeXuat.ts`: `nhomLoaiDeXuat()` (JS) / `nhomLdeSql()` (SQL) = TRIM + viết HOA chữ ASCII (đúng như `UPPER()` của SQLite — 2 bản phải cho cùng kết
quả), riêng "MUA HÀNG CÓ ID" quy về "MUA HÀNG"; `phieuCungNhomLdeSql(pxk, nhom)` = phiếu không có dòng khác nhóm (phiếu trống hợp lệ). Phiếu KHÔNG lưu loại đề
xuất — suy từ dòng. Áp ở: tự gom `bundleAutoApprovedIntoPxk` (thêm nhóm vào khóa tách + chỉ gộp vào phiếu đang tạo cùng nhóm), tạo phiếu tay (`NHIEU_LOAI_DE_XUAT_TRONG_1_PXK`),
thêm dòng `POST /:id/dong` (`DON_KHAC_LOAI_DE_XUAT_PHIEU`), chuyển đơn sang phiếu có sẵn (`/:id/dong/:donHangId/chuyen` + `GET /:id/phieu-nhan-duoc?don=` chỉ liệt kê phiếu
cùng nhóm). Phiếu cũ đã lẫn loại giữ nguyên (thêm dòng vào phiếu lẫn loại sẽ bị chặn — tách bằng "Bỏ đơn" → "Tách thành phiếu mới").

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
`isLikelyCaseId()` (> 5 ký tự: toàn số / `T`+số / `SC`+số / `TSC`+số — có bản sao FE ở `MaYeuCauSuCoCheck.tsx`, đổi 1 bên đổi cả 2;
thiếu `SC` từng làm mã "SC261003300" không phản hồi gì, 2026-10-07; thiếu `TSC` làm mã sự cố 3T "TSCxxxxxxxxxx" không tự bắt case, v1.573); `fetchCaseLookupRaw()` quy `t…`/`sc…`/`tsc…` về chữ HOA vì DVBH
lưu + khớp đúng chữ hoa. **ID Lada hiện thẻ tra cứu** (2026-10-20, v1.375 — "ID lada đang không hiện UI thông tin case"): KTV hay gõ CÙNG 1 ID Lada (vd B1430288) vào CẢ ô Mã YCSC lẫn Mã Lada → ô Mã YCSC gặp mã dạng Lada (không phải mã case) thì hiện thẻ `MaLadaCheck` (bỏ qua khi trùng ô Mã Lada cùng dòng — prop `maLada`); chi tiết đơn hiện thẻ đơn Lada dưới dòng "Mã Lada" (hoặc theo Mã YCSC dạng Lada) — `maLadaTraCuu()` ở `DonCuaToiTab.tsx`. **App KTV — khối "Chuyển tiền" lên đầu chi tiết PXK** (v1.375): người xem không phải TN/Kho/Kế toán/Admin → `veKhoiChuyenTien()` vẽ ngay dưới mini pipeline (`uuTienTien`), văn phòng giữ vị trí cũ.

**Link mở thẳng 1 đơn `/DDH-xxxxxx`** (2026-11-06, v1.444 — DVBH CaseDetail tab "Mua hàng"/"Thiếu hàng" gắn link mở đơn): thêm `DDH` vào `DEEP_LINK_ID_RE` (`lib/pxkDeepLink.ts`), `App.tsx` mở như bấm 1 kết quả tìm kiếm loại `don_hang` (cùng quyền xem đơn, giữ link qua vòng đăng nhập Google bằng sessionStorage như `PMH-…`).

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

## CÔNG NỢ SỬA CHỮA — NV sửa chữa văn phòng đặt linh kiện ký gửi (chốt 2026-11-15/16, giai đoạn 1 = v1.495, migration `0119`)

Nguyên văn yêu cầu: *"NV sửa chữa sẽ lên app linh kiện đặt "công nợ sửa chữa" … linh kiện cần để sửa chữa cho sản phẩm, linh kiện tại kho … Các luồng sẽ hoạt động như bình thường, có hàng thiếu hàng... => kế toán duyệt xuất => kho xuất và giao hàng cho nv sửa chữa … NV sửa chữa tiến hành sửa chữa => thay thế linh kiện đó => sau đó báo cáo về cho admin BH là đã thay thế hay tiêu hao linh kiện công nợ đó => admin bh sẽ lên app đổi trả và xác nhận linh kiện đó đã tiêu hao hoặc xác trả về đối tác thành công => hệ thống tự tạo đơn trừ công nợ trên app linh kiện và đẩy sang phiếu cho kế toán … (không mất tiền cho nv sửa chữa)"* + *"hạn chế sự tham gia quá nhiều của con người mà hệ thống vẫn tự động hoạt động chính xác"*.

**Hiện trạng lúc phân tích:** chưa có loại đề xuất "sửa chữa" nào trong danh mục — loại ẩn duy nhất là "SỬA CHỮA TẠI KHO" (chỉ xem, đồng bộ từ luồng "Đề xuất / Cấp linh kiện" của app Bảo hành đổi trả, mục dưới). 2 NV sửa chữa (`fotohuongthanh@gmail.com` mã `vietnv.ktvscvp` / MISA KTV00254; `nvk.joseph86@gmail.com` mã `khuongnv.ttbh` / MISA KTV0327) đều có mã KTV + Mã MISA → dùng được cơ chế kho ký gửi theo KTV.

**4 quyết định người dùng chốt (2026-11-15):** (1) NV đặt TRÊN APP NÀY, mỗi dòng bắt buộc chọn / nhập đơn bảo hành; luồng cấp linh kiện bên app đổi trả ngừng dùng (giai đoạn sau). (2) Mốc trừ công nợ THEO LOẠI XỬ LÝ XÁC: xác "Trả đối tác" → trừ khi thùng trả xác được Kế toán duyệt; "Lưu kho / Tiêu huỷ" hoặc không có xác → trừ khi Admin BH xác nhận tiêu hao. (3) Linh kiện nhận mà không dùng hết → BẮT BUỘC trả kho (đơn TRẢ HÀNG CÔNG NỢ). (4) 97 đơn "SỬA CHỮA TẠI KHO" cũ coi như đã xử lý ngoài.

**Giai đoạn 1 (đã làm, v1.495):**
- Cờ `users.la_nv_sua_chua` ("NV sửa chữa", Quản lý người dùng — `ROLE_FLAGS`; `/auth/me`; token loại đề xuất `la_nv_sua_chua` ở `getOptionsForUser` + `VAI_TRO_TOKENS`); migration bật cho 2 NV trên. Nhóm loại đề xuất mới "NV sửa chữa" = **"CÔNG NỢ SỬA CHỮA"** (mẫu MISA `xuat_kho`).
- `laCongNoSuaChua()` / `chuanMaDonBh()` (`lib/pxkRecalculate.ts`, bản sao FE `helpers.ts`). Đơn `loai_don='cong_no'`; cột `dat_don_hang.bh_don_vi_id` (mã đơn bảo hành `DH-000123` hoặc đơn vị `DH-000123-1`, lưu chữ HOA) BẮT BUỘC (`THIEU_MA_DON_BH` / `MA_DON_BH_KHONG_HOP_LE`); người nhận phải có cờ (`NGUOI_NHAN_KHONG_PHAI_NV_SUA_CHUA`); KHÔNG bắt Chính sách + Mã YCSC (`canNoRequired` loại trừ), Chính sách mặc định "Trong CSBH"; KHÔNG xét trần công nợ (`canDoiChieuCongNo` loại trừ, log "Công nợ sửa chữa — không xét trần công nợ") nhưng `so_tien_cong_no` vẫn ghi (công nợ ký gửi của NV); tồn kho / Chờ hàng / phiếu (nhóm loại đề xuất riêng) / Kế toán / Kho như đơn công nợ thường. Không đổi loại đề xuất qua lại (`DOI_LOAI_CONG_NO_SUA_CHUA`), chưa hỗ trợ Import Excel. File MISA: MYC = Mã YCSC → Lada → mã đơn BH.
- FE: ô `MaDonBhInput` (`datMuaLinhKien/CongNoSuaChua.tsx`) ngay dưới loại đề xuất (desktop + mobile), checklist "Cần nhập", dòng "Đơn bảo hành" ở chi tiết đơn; "Tạo đơn giống" chép mã.
- **Ô mã đơn BH lấy thẳng từ app đổi trả + vẫn cho nhập tay** (chốt 2026-11-16, v1.496, migration `0120` — "chọn ô bảo hành lấy thẳng từ app đổi trả nhưng vẫn cho nhập tay nếu không có (vì có thể đặt cho đơn không thuộc app đổi trả)"): `GET /dat-mua-lk/don-bh-goi-y?nguoi_nhan_hang=&q=` (người tạo đơn; email người khác chỉ khi được đặt hộ) → `lib/donBhClient.ts` gọi suachua `GET /api/partner/sync/don-vi-sua-chua` qua Service Binding `SUACHUA_SYNC_SERVICE` + `X-Sync-Key` (`email` = đơn vị NV đang sửa `cho_chan_doan`; `q` ≥ 2 ký tự = tìm mã đơn / mã case mọi trạng thái; `ma` = tra 1 mã). Trả `{rows, ket_noi}` — lỗi mạng / suachua chưa có API → `ket_noi:false`, ô vẫn gõ tay, KHÔNG chặn đặt hàng. `chuanMaDonBh` nới: mã bất kỳ ≤ 40 ký tự (dạng app `DH-xxxxxx[-n]` thì viết HOA — `laMaDonBhApp`), `MA_DON_BH_KHONG_HOP_LE` chỉ còn nghĩa quá dài. Lúc tạo đơn server tra lại mã dạng app (`traDonBh`) → cột `dat_don_hang.bh_lien_ket` = 1 khi có trên app đổi trả (giai đoạn sau chỉ tự đối trừ đơn liên kết; nhập tay = Admin BH xử lý tay). FE `MaDonBhInput` = ô gõ + danh sách xổ (đơn đang sửa / kết quả tìm) + dòng gợi ý (✓ trên app / mã dạng app — kiểm tra khi tạo / nhập tay ngoài app / không kết nối); chi tiết đơn ghi "trên app Bảo hành đổi trả" / "nhập tay". Kiểm thử 2 Worker local + giao diện: gợi ý, tìm theo mã case, chọn → ✓, gõ tay → nhãn nhập tay; tạo đơn mã app → `bh_lien_ket=1`, mã lạ / nhập tay → 0, 41 ký tự → 400.
- **Cấp linh kiện từ CẢ 2 app, xử lý duy nhất ở app này** (chốt 2026-11-16, v1.498, migration `0121` + app đổi trả v1.133 — "đóng luồng hoạt động trên app đổi trả, chuyển hoàn toàn sang app đặt lk - nhưng vẫn cho tạo đơn trực tiếp trên app đổi trả, sửa 1 số thông tin cơ bản khi tạo linh kiện (nếu như kế toán chưa xử lý)"; "Cấp lk tạo được từ cả 2 bên … kế toán duyệt trên app lk"; "Nếu tạo trên hệ thống nào thì khóa chỉ cho chỉnh sửa thông tin từ hệ thống đó"; "Tạo từ 2 bên thì loại đề xuất đều giống nhau đề là CÔNG NỢ SỬA CHỮA"):
  - API cho app đổi trả `routes/suachuaDonSc.ts` (gắn vào `/api/suachua-partner`, X-Sync-Key) — mọi thao tác chạy bằng TÀI KHOẢN NV sửa chữa (`taiAppUserTheoEmail`) và gọi CHÍNH `taoPhieuDat` / `yeuCauHuyDon` / `phanLoaiHuyDon` / `thucHienHuyDon` (export từ `datMuaLinhKien.ts`): `POST /don-sc` (1 đề xuất DX = 1 đơn, `client_request_id` "sc:<DX>:<lần>" chống trùng, ghi chú có tiền tố "[App Bảo hành đổi trả DX-…]"), `POST /don-sc/:id/sua` (chỉ đơn `nguon_tao='doitra'`, chỉ khi `phanLoaiHuyDon` hủy ngay được = Kế toán chưa xử lý → `KE_TOAN_DA_XU_LY`; chỉ ghi chú = sửa tại chỗ; đổi mã LK / SL = HỦY đơn cũ + TẠO đơn mới để đánh giá lại tồn kho / phiếu từ đầu, trả `thay_bang`), `POST /don-sc/:id/huy` (lý do bắt buộc; cùng luật yêu cầu hủy — Kho / Mua hàng / Kế toán đang xử lý thì chờ bộ phận đồng ý), `GET /don-sc?bh=|?ids=` (mặc định 120 ngày; nhãn trạng thái `nhanDonSc()` = bản rút gọn `nhanTrangThaiDon` FE — đổi luồng thì sửa cả 2; `sua_duoc` / `giai_doan`).
  - `dat_don_hang.nguon_tao` = `'doitra'` + `nguon_tao_id` = mã DX. PATCH `/don-hang/:id` chặn đổi mã LK / SL / loại / ghi chú của đơn này (`DON_TAO_TU_APP_DOI_TRA`); Kế toán / Kho xử lý bình thường. Chi tiết đơn: dòng "Tạo từ: App Bảo hành đổi trả · DX-…", ẩn "✎ Sửa".
  - **Chọn đơn bảo hành → tự điền** (v1.499 — "khi chọn mã sửa chữa liên quan, tự động điền các cột thông tin. cho phép tìm theo mã SCxxxxx … Mã sự cố: SCxxxxxx / TT duyệt mail: Xuất công nợ sửa chữa cho nv … / TT khách hàng: Tên KH / Ghi chú: (thông tin mã sửa chữa từ hệ thống app) => các thông tin này mặc định điền"): chọn 1 dòng trong `MaDonBhInput` → `tuDienTheoDon()` (`CongNoSuaChua.tsx`) điền Mã YCSC = case, TT+Mail duyệt = "Xuất công nợ sửa chữa cho NV <tên người nhận>" (`tenNguoiNhan` ở `useTaoDonForm`), TT khách hàng, Ghi chú = "Đơn sửa chữa <mã> · case · sản phẩm (· LK gửi)". Chỉ ghi đè ô trống hoặc ô còn đúng giá trị tự điền lần trước (`d.bh_tu_dien`, chỉ ở form); ô người dùng tự gõ giữ nguyên. Gõ mã SC = tìm theo case trên app đổi trả (q ≥ 2 ký tự).
  - **v1.504 (sửa khi làm tài liệu hướng dẫn NV sửa chữa):** nhãn vai trò TopBar hiện "NV sửa chữa" (không "KTV DVBH") cho tài khoản `nv_sua_chua_thuan`; form tạo đơn bỏ dòng CÔNG NỢ SỬA CHỮA khỏi `tongCongNoTamTinh` (trước báo sai "Vượt trần công nợ dự kiến"); đơn tạo từ app đổi trả (`suachuaDonSc.ts` `taoDonTuDeXuat`) tự điền Mã YCSC = case, TT khách hàng, TT+Mail duyệt "Xuất công nợ sửa chữa cho NV <tên>" (lấy qua `traDonBh`, lỗi kết nối thì bỏ trống). Tài liệu: `docs/Huong_dan_NV_sua_chua.html` (ảnh chụp từ 2 app chạy local với dữ liệu demo).
  - **Ô Mã YCSC không chặn "case không thuộc về bạn" với NV sửa chữa** (v1.503): `GET /kiem-tra-ma-yeu-cau` bỏ so khớp KTV của case khi người nhận hàng có `la_nv_sua_chua` (case luôn do KTV hiện trường xử lý) — trả `khopKtv: null` + thẻ thông tin case như thường.
  - **Danh sách chọn chỉ đơn NV đang sửa** (v1.502 — "Danh sách ID lựa chọn cho nv sửa chữa chỉ hiện theo đúng case họ đang nhận trên app đổi trả. case này không có thì không hiện" + "case nào đã sửa xong, đã đóng cũng không hiện, chỉ hiện các case đang sửa dưới tên KTV phụ trách"): `MaDonBhInput` chỉ tải danh sách theo người nhận (`email` → đơn vị `nguoi_sua_chua` = NV, `cho_chan_doan`); gõ chữ = LỌC trong danh sách đó (mã đơn / đơn cha / mã SC), bỏ tìm rộng mọi đơn (`q`). Mã ngoài danh sách vẫn gõ tay được (đơn ngoài app đổi trả).
  - **NV sửa chữa "thuần" như 1 KTV nhận hàng** (v1.501 — tài khoản Vũ Việt chỉ có cờ "NV sửa chữa" bị đẩy ra màn "chưa được phê duyệt", cả khi Admin "Xem như người dùng"): `nvSuaChuaNhuKtv()` ở `middleware/loadUser.ts` (cùng chỗ `keToanLamThayTn`, gộp trong `quyenHieuLuc()` — mọi request, xem thử / xem như, tài khoản đối tác) cấp `la_ktv_dvbh = true` TRONG BỘ NHỚ cho tài khoản có `la_nv_sua_chua` mà không vai trò / cờ nghiệp vụ nào khác → vào module, phạm vi dữ liệu KTV (chỉ đơn / phiếu / quỹ / tồn của chính mình), xác nhận đã nhận hàng. DB không đổi. Kèm `nv_sua_chua_thuan` → FE `getOptionsForUser` KHÔNG cấp nhóm loại đề xuất của KTV (chỉ "CÔNG NỢ SỬA CHỮA").
  - `canCreatePhieuDat` mở cho `la_nv_sua_chua` (NV không có cờ KTV vẫn đặt cho mình). Form tạo đơn: danh sách loại đề xuất theo NGƯỜI NHẬN — người nhận là NV sửa chữa (`la_nv_sua_chua` ở `/nguoi-nhan-hang-kha-dung`) thì luôn có "CÔNG NỢ SỬA CHỮA" (cả khi TN / GS đặt hộ); cả 3 loại sửa chữa đứng ĐẦU hàng nút chọn nhanh (`ldeNhanh()` ở `helpers.ts`, v1.522); ô "KH đã chuyển khoản về công ty" chỉ tích được với MUA HÀNG SỬA CHỮA (2 loại kia 0đ / ký gửi không chuyển tiền — câu dưới ô ghi rõ lý do, v1.523); người nhận khác thì ẩn.
  - Kiểm thử 2 Worker local: tạo (kho thiếu → Chờ hàng + ticket), gửi lại cùng DX → cùng đơn, sửa ghi chú tại chỗ, đổi LK/SL → hủy + tạo đơn mới, sửa đơn đặt trên app LK / đơn đã hủy → chặn, mã LK sai / NV chưa có tài khoản → lỗi rõ, hủy chưa xử lý → hủy ngay, hủy khi phiếu "Chờ Kế toán" → yêu cầu Kế toán đồng ý; giao diện 2 app đã xem.
- Kiểm thử local: thiếu mã → 400, sai dạng → 400, `dh-000123-1` → tạo đơn tự duyệt vào phiếu riêng (`bh_don_vi_id` HOA, Trong CSBH, `danh_gia_cong_no` NULL); bỏ cờ → 403; form hiện đúng ô + checklist.

**Giai đoạn 2 — TRỪ CÔNG NỢ SỬA CHỮA (ĐÃ LÀM 2026-11-16, v1.506 + app Bảo hành đổi trả v1.139, migration bên đó 0040):** chốt của người dùng: *"1. Thất lạc có trừ hay không sẽ cho admin BH lựa chọn 2. Có ("Đã trả ngoài hệ thống" = trả thành công) 3. trừ luôn cho nv sửa chữa, xác sẽ tiếp tục theo dõi đến khi trả xác thành công cho đối tác (hoặc hủy xác theo quy trình) 4. Admin BH xác nhận 5. App đổi trả dừng các luồng thao tác của KT, KT hoàn toàn làm bên linh kiện app => các thông tin sẽ đồng bộ từ app linh kiện để theo dõi 6. Diễn giải MISA tương tự đơn phân loại: trừ công nợ"* (ghi đè quyết định (2) cũ "trả đối tác → trừ khi thùng xác được KT duyệt": nay trừ NGAY khi Admin BH xác nhận tiêu hao).
- 2 loại đề xuất MỚI, chỉ tạo qua API (taoPhieuDat `opts.tuSuaChua`, tạo từ form → 403 `LOAI_CHI_TAO_TU_APP_DOI_TRA`; không có trong `settings_loai_de_xuat`): **"TRỪ CÔNG NỢ - SỬA CHỮA"** (`LDX_TRU_CONG_NO_SUA_CHUA`, `laTruCongNoSuaChua`) và **"TRẢ HÀNG CÔNG NỢ - SỬA CHỮA"** (`LDX_TRA_HANG_SUA_CHUA`, `laTraHangSuaChua`) ở `lib/pxkRecalculate.ts`. Tên có dấu "-" để KHÔNG trùng chuỗi "CÔNG NỢ SỬA CHỮA"; `laCongNoSuaChua` loại trừ thêm "TRỪ CÔNG NỢ" / "TRẢ HÀNG".
- Đơn trừ: chứa "TRỪ CÔNG NỢ" nên dùng lại toàn bộ cơ chế TRỪ CÔNG NỢ (MISA Bán hàng trừ kho KTV + diễn giải như TRỪ CÔNG NỢ, phiếu toàn dòng trừ công nợ → Kế toán chốt tự "Hàng trừ kho", cộng vào "đã trừ" công nợ). Khác: KHÔNG phát sinh tiền (`laDonPhatSinhTien` false, `pxkRecalculate` tiền dòng = 0 → không chờ chuyển tiền); KHÔNG đối chiếu tồn KTV theo file MISA (`tuDongDuyet`: tự duyệt — linh kiện vừa xuất chưa có trong file), SL kiểm ở API theo lần cấp gốc; "đã trừ" (`CONG_NO_DA_TRU_WHERE_SQL`) tính từ lúc phiếu được Kế toán CHỐT (`Da chot xong don xuat` trở đi) thay vì lúc duyệt tiền.
- Đơn trả hàng: luồng TRẢ HÀNG bình thường (KT duyệt mềm → Kho nhận → QC → TN → PXK trả hàng), không bắt ảnh.
- API `routes/suachuaDonSc.ts`: `POST /suachua-partner/tru-cong-no {ddh_goc, loai: tru|tra, so_luong, nguoi_thao_tac, ghi_chu?, lan?}` — đơn gốc phải là CÔNG NỢ SỬA CHỮA NV ĐÃ NHẬN (`buoc` xong, không thì `NV_CHUA_NHAN_HANG`); tổng SL trừ + trả (đơn chưa huỷ) ≤ SL nhận (`VUOT_SL_NHAN` kèm `con_lai`); chống trùng `client_request_id` "tc:<loai>:<gốc>:<lan>"; chạy bằng tài khoản NV, `nguon_tao='doitra'`, `nguon_tao_id='<loai>:<DDH gốc>'`, `bh_don_vi_id` = đơn BH gốc; ghi chú "[App Bảo hành đổi trả — <Admin> xác nhận] …". `GET /suachua-partner/tru-cong-no?ids=` trả nhãn / bước (cùng `nhanDonSc`, thêm nhãn các bước trả hàng + `cho_kho_nhan_hang_tra` / `kho_da_nhan_hang_tra`). `docDonSc(…, chiCsc)`.
- **v1.507 (2026-11-16)** — nguyên văn: *"Tất cả bước trừ tự động tạo phiếu đẩy kế toán, không qua bước TN vì vai trò Tác nghiệp không xử lý bước này (trả hàng sửa chữa) cũng đi thẳng qua kế toán không cần đi theo luồng trả hàng công nợ"* + *"YC phải xác nhận đã nhận mới cho đóng đơn sửa chữa"*. `routes/suachuaDonSc.ts`: sau khi tạo đơn ở `POST /tru-cong-no`, `dayPhieuSuaChuaSangKeToan` chuyển phiếu (tự gom "Dang tao phieu") thẳng "Cho ke toan" (`ma_xuat_kho_xac_nhan = 1`, log "Tự động từ app Bảo hành đổi trả … gửi thẳng Kế toán, không qua Tác nghiệp") — chỉ khi phiếu CHỈ gồm đơn TRỪ / TRẢ HÀNG - SỬA CHỮA. Đơn trả hàng sửa chữa: "Cho ke toan duyet mem" → "TN da duyet" ngay (`tra_hang_log`), `bundleAutoApprovedIntoPxk(..., "tra_hang")` → phiếu PTL → "Cho ke toan". `routes/phieuXuatKho.ts`: Kế toán chốt phiếu trả hàng mà mọi dòng là TRẢ HÀNG - SỬA CHỮA → tự "Kho da nhan hang tra" (không qua Kho / khovan). API mới `POST /suachua-partner/don-sc/:id/da-nhan {nguoi_thao_tac, tu_dong?}`: phiếu "Dang gui KTV" → "KTV da nhan" (CAS + log, chặn khi đang báo nhận thiếu `DANG_BAO_NHAN_THIEU`; chưa gửi → `CHUA_GUI_HANG`; đã qua → `da_nhan_truoc`). Kiểm thử 2 Worker local 13/13 + Kế toán chốt 2 phiếu tự kết thúc — xem CLAUDE.md app đổi trả mục v1.140.
- Kiểm thử 2 Worker local nối service binding (D1 tạm, đã xoá): cấp 3 → NV nhận → Admin xác nhận dùng 2 / xác trả đối tác → DDH trừ 2 (TN da duyet, 0đ, phiếu PCN không tiền, `bat_buoc_chuyen_tien`=0) + DDH trả hàng 1 ("Cho ke toan duyet mem"); phiếu "Hang tru kho" → "đã trừ" = 2 × gia_tri_cong_no; xác thất lạc không trừ → không tạo đơn, Admin đổi sang trừ → tạo đơn.

**Giai đoạn 3 — Hãng / Đối tác quyết định loại cấp linh kiện + sửa / hủy đơn trừ xác (16/11/2026, v1.508, migration `0122` + app đổi trả v1.142, migration bên đó 0041).** Nguyên văn: *"1. Đơn bh cần thêm cột Hãng, Đối tác (lấy từ CRM). (admin BH có thể sửa lại nếu chưa chính xác khi duyệt đơn) => khi đẩy 1 đơn sang nv sửa chữa, bắt buộc phải chọn đủ Hãng, Đối tác, còn bảo hành/hết bảo hành. (để xác định có phát sinh chi phí hay không => liên quan đến việc đặt đơn. Đơn của đối tác Karofi => mặc định xuất sang đơn "HỖ TRỢ SỬA CHỮA 0 ĐỒNG" (nếu còn bảo hành), các đối tác khác sẽ xuất "CÔNG NỢ SỬA CHỮA". Trường hợp hết bảo hành => đề xuất dạng "MUA HÀNG SỬA CHỮA". => Chỉ có đơn "CÔNG NỢ SỬA CHỮA" mới cần lên đơn trừ công nợ. 2. Khi linh kiện sửa chữa xong, Admin bh xác nhận xác nhận các linh kiện sửa chữa từ nv sửa chữa theo ds đã đặt hàng trong đơn bh (CÔNG NỢ SỬA CHỮA) 2. Sau khi admin bh xác nhận trừ xác => tạo tự động đơn trừ xác trên app linh kiện (có thể thay đổi trạng thái, hủy bỏ, chỉnh sửa trước khi kế toán duyệt chốt trừ công nợ) 4. thêm vai trò "Trả xác", vai trò này nhìn thấy menu trả xác và có quyền xác nhận trả xác cho các đối tác được quyền xử lý."*

Chốt qua AskUserQuestion (16/11/2026, cả 4 theo phương án đề xuất): (a) Đối tác = **danh mục** trong app đổi trả (tự nạp từ CRM, Admin thêm / sửa, đánh dấu Karofi), Hãng = chữ CRM sửa tự do; (b) MUA HÀNG SỬA CHỮA = **như MUA HÀNG thường** (giá chiết khấu, NV chuyển tiền vào phiếu, Kế toán xác nhận); (c) sửa / hủy đơn trừ xác do **Admin BH làm ở app đổi trả**, đơn bên app LK hủy / tạo lại theo, chỉ khi Kế toán chưa chốt; (d) vai trò Trả xác = **gom thùng + ghi kết quả xác + gửi Kế toán** với xác của đối tác được gán, Kế toán vẫn duyệt thùng.
- 2 loại đề xuất mới nhóm "NV sửa chữa": **HỖ TRỢ SỬA CHỮA 0 ĐỒNG** (`loai_don` cong_no, `khongTinhCongNo` + TRIGGER `trg_ddh_ho_tro_sc_0d_i/u` ép công nợ 0, không chuyển tiền, MISA "CN, hỗ trợ" diễn giải như HỖ TRỢ 0 ĐỒNG — `loaiHoTro0Dong`) và **MUA HÀNG SỬA CHỮA** (`loai_don` mua như MUA HÀNG, chính sách mặc định "Ngoài CSBH", MISA Bán hàng). `laHoTroSuaChua0d` / `laMuaHangSuaChua` / `laDonSuaChua` (3 loại) ở `lib/pxkRecalculate.ts` + bản sao FE `helpers.ts`. Mọi kiểm tra "đơn sửa chữa" (bắt mã đơn BH, người nhận là NV sửa chữa, không Mã YCSC, không import, không đổi loại qua lại — PATCH + `doiLoaiDeXuat`, `/don-sc` GET / hủy / đã nhận) dùng `laDonSuaChua`; riêng không xét trần + `/tru-cong-no` (đơn gốc) vẫn CHỈ CÔNG NỢ SỬA CHỮA.
- Hệ thống chọn loại: `loaiDeXuatTheoDonBh()` (v1.548, 2026-11-21 — "khi admin bh duyệt sẽ chọn loại hình thức tính phí => từ đó suy ra loại đề xuất luôn (song song với hạn bảo hành - ưu tiên cái này trước)": hướng xử lý `huong_xu_ly = dich_vu_tinh_phi` → MUA HÀNG SC, xét TRƯỚC bảo hành; hết BH → MUA HÀNG SC; còn BH + Karofi → HỖ TRỢ SC 0 ĐỒNG; còn lại CÔNG NỢ SC; thiếu thông tin → null giữ loại người đặt) — dữ liệu `hang / doi_tac / doi_tac_karofi / loai_bao_hanh` từ API gợi ý app đổi trả (`lib/donBhClient.ts`). ~~`chuanBiPhieuDat` ghi đè loại của dòng có mã đơn BH dạng app~~ → từ v1.547 (2026-11-21, migration `0134` — "sẽ cho ktv chọn lại, nhưng trên app đổi trả và app linh kiện, sẽ hiện cảnh báo rất rõ ràng … vì trong thực tế, sp hết bảo hành nhưng lk bên trong sp có thể vẫn còn bảo hành") KHÔNG ghi đè: giữ loại người đặt, loại khác gợi ý → `dat_don_hang.loai_goi_y` + `loai_goi_y_ly_do` (Hãng / Đối tác / còn-hết BH lúc tạo) + dòng log "⚠ Chọn loại … KHÁC loại hệ thống gợi ý …"; FE `LoaiGoiYBadge` / `LoaiGoiYKhoi` (`CongNoSuaChua.tsx`) ở danh sách đơn, chi tiết đơn, dòng đơn trong phiếu; `/suachua-partner/don-sc` trả 2 cột → app đổi trả v1.152 lưu `lk_loai_goi_y` (migration bên đó 0045) và hiện cảnh báo; `taoDonTuDeXuat` (`suachuaDonSc.ts`) chọn loại + câu TT+Mail duyệt theo loại. FE `MaDonBhInput` chọn đơn → tự đổi loại + chính sách, dòng báo "Hãng · Đối tác · Còn/Hết BH — hệ thống sẽ đặt loại …"; người nhận là NV sửa chữa có đủ 3 loại trong danh sách.
- `POST /suachua-partner/tru-cong-no/:id/huy` {nguoi_thao_tac, ly_do} | {kiem_tra: true}: CHỈ đơn TRỪ / TRẢ HÀNG CÔNG NỢ - SỬA CHỮA nguồn `doitra`, khi chưa vào phiếu hoặc phiếu còn "Dang tao phieu" / "Cho ke toan" (else 409 `KE_TOAN_DA_CHOT`) → `goDonKhoiPxk` (phiếu 1 đơn tự hủy) + CAS "Da huy" + log (`tra_hang_log` với đơn trả). App đổi trả gọi khi Admin BH sửa / hủy xác nhận tiêu hao (sửa = hủy + tạo lần gửi mới).
- Kiểm thử: xem CLAUDE.md app đổi trả mục v1.142 (2 Worker local, 31/32 đạt + giao diện).
- Deploy (16/11/2026): migration 0122 lên D1 production + `npm run deploy` (Version ID `93f60dd3`), sau đó app đổi trả v1.142 (`9f3e011d`).
- **v1.509 (16/11/2026, rà soát + app đổi trả v1.143)** — *"1. rà soát lại logic và luồng quy trình toàn diện 1 lần xem còn vấn đề gì không. => mua sửa chữa cần chuyển tiền về như luồng bt, công nợ sửa chữa thì cần xác nhận xác và trừ công nợ cho nv sửa chữa, hỗ trợ 0 đồng thì không cần trừ công nợ nhưng vẫn cần xác nhận luồng cho xác. 2. Tạo file hướng dẫn html chi tiết luồng quy trình và hướng dẫn nghiệp vụ cho vai trò nv sửa chữa, kế toán, admin bh theo nghiệp vụ mới cấp linh kiện, duyệt xác, trả xác, trừ công nợ. (yêu cầu chi tiết và có hình ảnh minh họa)"*
  - Tổng đặt ngày (`DON_TINH_TONG_NGAY_SQL`, `pxkRecalculate.ts` — dùng cho mốc chiết khấu 200k/500k + `donTrongPhieuMo`) và báo cáo "Tổng thực tế đã mua" (`w_tien`, cache `bao-cao-tong-the-v5`) BỎ đơn "TRỪ CÔNG NỢ - SỬA CHỮA" (0đ, chứng từ trừ xác). Trước đó cộng theo giá bán → đơn MUA HÀNG SỬA CHỮA cùng ngày bị hạ giá KTV sai (demo 95.000đ → 80.000đ). Production chưa có đơn MUA HÀNG SỬA CHỮA nên không cần sửa dữ liệu; nếu nghi lệch, Admin bấm Cài đặt › Loại chiết khấu › "Tính lại tiền phiếu đang tạo".
  - `POST /suachua-partner/don-sc` nhận `loai_de_xuat` (app đổi trả tự tính theo Hãng / Đối tác / bảo hành) — ưu tiên hơn tra ngược `traDonBh` (tra ngược lỗi / chậm thì đơn từng rơi về CÔNG NỢ SỬA CHỮA). `/don-sc/:id/sua` tạo lại giữ loại đơn cũ.
  - HỖ TRỢ SỬA CHỮA 0 ĐỒNG: app đổi trả nay vẫn bắt Admin BH xác nhận xác (không tạo đơn trừ / trả); MUA HÀNG SỬA CHỮA chuyển tiền như đơn mua thường, không xác nhận xác.
  - Tài liệu `docs/Huong_dan_cap_LK_sua_chua_tra_xac.html` (NV sửa chữa / Admin BH / Kế toán / Trả xác, ảnh minh họa). Cập nhật 25/11/2026 theo v1.562: tóm tắt 5W1H, loại đơn = gợi ý + chọn lại kèm "⚠ Khác loại gợi ý" (v1.547, mục 1.1 + ảnh), "Dịch vụ tính phí" (v1.548), cảnh báo ở form (v1.510), mục Lịch sử cập nhật tài liệu — đổi luồng cấp LK sửa chữa / xác thì sửa cả file này.
  - Deploy (16/11/2026): `npm run deploy` (Version ID `17ef188c`, không migration), sau đó app đổi trả v1.143 (`2d6bc7df`).
- **v1.510 (17/11/2026) — cảnh báo chọn sai loại đề xuất theo case** — *"khi tạo đơn trên app đổi trả thì sẽ tự động tạo đúng loại đề xuất, nhưng khi tạo đơn trên app linh kiện, nv sửa chữa có thể chọn nhầm loại đề xuất => dựa vào thông tin case nv chọn => nếu sai loại đề xuất => hiện cảnh báo nhắc nhở, ví dụ: đây là case bảo hành của đối tác KRF, loại đề xuất nên là "Hỗ trợ sửa chữa 0 đồng", hoặc đây là case của đối tác ngoài KRF, đề xuất chọn loại Công nợ sửa chữa..."*
  - `canhBaoLoaiDonBh()` + `donBhKhop()` (`datMuaLinhKien/CongNoSuaChua.tsx`): mã đơn BH khớp danh sách gợi ý (đơn NV đang sửa) mà loại đang chọn khác `loaiDeXuatTheoDonBh` → khối cam dưới ô "Mã đơn bảo hành" (desktop + mobile: lý do theo case — Karofi còn BH / đối tác ngoài Karofi còn BH / hết BH, ý nghĩa loại đúng, nút "Đổi sang …" = `tuDienTheoDon`) + 1 mục "Cảnh báo" cột phải form desktop (`TaoDonTab.tsx`, hook `useGoiYDonBh` gọi TRƯỚC `return` mobile). Chỉ nhắc, không chặn (v1.547: server không còn tự áp loại — đơn khác gợi ý bị gắn cảnh báo). Mã gõ tay không có trong danh sách thì không nhắc.
  - Kiểm thử 2 Worker local (dữ liệu demo): chọn case Karofi → tự HỖ TRỢ 0đ; bấm lại CÔNG NỢ SỬA CHỮA → hiện cảnh báo ở ô + cột phải; bấm "Đổi sang" → về HỖ TRỢ 0đ, hết cảnh báo.
  - Deploy (17/11/2026): `npm run deploy` (Version ID `387089ea`, không migration).

## Đơn "SỬA CHỮA TẠI KHO" đồng bộ từ app Sửa chữa bảo hành (2026-11-12, v1.478, migration `0116`)

Nguyên văn yêu cầu (chủ hệ thống): *"luồng "Cấp lk" ... khi đơn cấp Lk đến bước kế toán xác nhận xong / kho in, kho xuất... => sẽ bắn API sang linh-kien-app để tạo 1 lịch sử đơn đặt (mỗi thay đổi sẽ lưu log theo api (kiểm soát tránh trùng log) ... loại đề xuất "SỬA CHỮA TẠI KHO" (đơn này không hiện trong danh sách lựa chọn trên hệ thống - chỉ đồng bộ API về) ... các đơn này sẽ hoạt động như 1 đơn hàng bình thường nhưng sẽ khóa không cho chỉnh sửa hoặc thay đổi vì chỉ là đơn view log lịch sử"*.

- `POST /api/suachua-partner/cap-lk {items[]}` (X-Sync-Key = `SUACHUA_SYNC_API_KEY`, ≤100) → `lib/donSuaChuaKho.ts apDungCapLk`. 1 DX bên suachua = 1 `phieu_dat` `SK-…` (`nguon_ngoai='suachua'`) + 1 `dat_don_hang` (`nguon_ngoai`, `nguon_ngoai_id`, `ngoai_rev`, `ngoai_cap_nhat`, `ngoai_info` JSON).
- Đơn: `loai_de_xuat` "SỬA CHỮA TẠI KHO" (không có trong `settings_loai_de_xuat`; `deriveLoaiDon` → `cong_no`), `loai_don='cong_no'`, giá NULL, khu vực NULL (không trừ tồn kho công ty), `ma_misa` = mã PXK MISA bên suachua, `ma_yeu_cau_su_co` + `dat_don_case` = case. Người tạo = người nhận = NV sửa chữa (chưa có → `users` "Cho duyet" tối thiểu). Mã LK chưa có → tự thêm `chi_sua_chua=1`.
- Trạng thái riêng `SC cho kho in` → `SC kho da in` → `SC kho da xuat` (+ `Da huy`), nằm trong `DON_HANG_TRANG_THAI_DONG` → không bị gom PXK, không đếm việc TN, không vào báo cáo tiền. FE: tone + nhãn "Sửa chữa · …" ở `constants.ts` (+ i18n en/id).
- **Khoá cứng bằng trigger** (migration 0116): UPDATE/DELETE `dat_don_hang` / `phieu_dat` nguồn ngoài bị `RAISE(IGNORE)` trừ khi `ngoai_rev` tăng (chỉ API đồng bộ làm); INSERT `phieu_xuat_kho_dong` / `thieu_lk` / `yeu_cau_huy_don` → `RAISE(ABORT,'DON_SUA_CHUA_KHOA')`; INSERT `dat_don_hang_log` / `dat_don_hang_giai_trinh` → bỏ qua. Lưu ý khi viết code mới: lệnh UPDATE hàng loạt sẽ âm thầm bỏ qua các đơn này (meta.changes nhỏ hơn số dòng khớp).
- Nhật ký: bảng `dat_don_ngoai_log` (`UNIQUE(dat_don_hang_id, su_kien)` chống trùng); `GET /dat-mua-lk/don-hang/:id` gộp vào "Lịch sử xử lý". Bản tin `cap_nhat_luc` ≤ `ngoai_cap_nhat` → bỏ qua (không ghi gì).
- Chi tiết đơn (`DonCuaToiTab.tsx`): banner "🔒 Đơn đồng bộ từ app Sửa chữa bảo hành — chỉ xem" (DX, đơn BH, KTV, NV, mã ĐH), ẩn footer thao tác + nút "✎ Sửa".
- Kiểm thử: 2 Worker local nối service binding — tạo / cập nhật từng bước / chống trùng / bản tin cũ / khoá trigger / API chi tiết đều đạt (xem CLAUDE.md repo `gui-bao-hanh-linh-kien`, mục cùng ngày).

## Sổ quỹ: cột "Thực chi mua hàng" + 4 ô tổng kết (17/11/2026) — v1.511

**(a) Nguyên văn yêu cầu:** *"trong mục "sổ quỹ", khoản nào thực tế đã được sử dụng thật để mua hàng rất kho phân biệt. với vai trò kiểm soát dòng tiền, làm sao để cho 1 người không có nghiệp vụ kế toán, nhìn nhanh là hiểu được trong các dòng xuất nhập lịch sử này biết được thực tế bao nhiêu tiền đã được tính là mua thành công (ví dụ thêm 1 cột thực tiền đã chi)"* → chốt mốc "mua thành công" = **"Kế toán đã duyệt"** (`trang_thai_chuyen_tien = 'TN da duyet'`, phiếu chưa `Ke toan huy`).

**(b) Đã làm:**
- `GET /api/quy-ktv/giao-dich/tong-ket?email=&quy=` (cùng phạm vi xem với Sổ quỹ, bỏ qua lọc loại): Đã nộp, Đã mua thành công (+ số phiếu), Đang tạm giữ (phiếu chưa KT duyệt + tiền đơn chờ hàng đang giữ `tien_da_tra`), Số dư, hoàn tiền KTV / điều chỉnh, **chênh lệch** (= vào quỹ − đã mua − tạm giữ − số dư: tiền phiếu trả thẳng không qua quỹ).
- **Tính theo nơi tiền đang nằm thật, KHÔNG cộng theo dòng sổ quỹ**: phiếu tự huỷ (kho hết hàng) thì tiền không hoàn về quỹ mà đi theo đơn (`dat_don_hang.tien_da_tra`) rồi sang phiếu mới mà KHÔNG ghi dòng sổ nào — ví dụ thật PMH-001595 (337.500đ, tự huỷ) → DDH-004410 → PMH-002528. Đã mua = `SUM(phieu_xuat_kho.da_thanh_toan)` của phiếu chủ quỹ (`quy_kh` → khoá `khhd:`) đã KT duyệt.
- `GET /giao-dich` trả thêm `pxk_tt_tien`, `pxk_tt`, `pxk_da_tt`, `thuc_chi_phieu` (tiền quỹ ròng của người + phiếu), `tra_cuoi_id`.
- Sổ quỹ (`QuyChuyenTienModule.tsx`): dải 4 ô (Đã nộp / ✅ Đã mua thành công / ⏳ Đang tạm giữ / Số dư) + dòng cân đối; cột **"Thực chi mua hàng"** ở dòng "Trả phiếu" CUỐI của mỗi phiếu: số tiền phiếu đang giữ + nhãn Đã mua / Đang tạm giữ; phiếu huỷ đã hoàn hết → "Đã hoàn hết" (gạch số); phiếu huỷ mà tiền đi theo đơn → "Đi theo đơn"; dòng trả phiếu trước → "gộp ở dòng sau", dòng hoàn → "hoàn cho phiếu". Excel thêm 2 cột. Không có migration.

**(c) Ghi nhận:** toàn hệ thống lúc làm có chênh lệch ~14,5 triệu (phiếu trả trước khi có quỹ / chuyển ngoài) — hiện thành dòng riêng. Phiếu nhận tiền qua đơn không có dòng sổ quỹ nên chỉ thấy ở ô tổng, không có dòng trong bảng.

**(d) Kiểm thử:** typecheck backend + frontend 0 lỗi. Chạy câu tổng kết trên D1 production (chỉ đọc) với KTV toannv.mb: nộp 4.334.800 = đã mua 4.056.800 (PMH-000168/000978/001299/002528) + tạm giữ 278.000 (PMH-002117) + số dư 0 — khớp. Chưa xem bằng mắt trên giao diện.

## Hạn mức dự trữ: mốc tính theo từng Mã MISA + tách "Đã mua dự trữ" / "Còn được mua" (17/11/2026) — v1.512

**(a) Nguyên văn yêu cầu:** *"kiểm tra logic tăng quỹ mua dữ trữ. hình như mức tiền quỹ dự trữ của KTV không tăng dù họ đặt mua dữ trữ (phân biệt giữa tiền quỹ dữ trữ đã mua và hạn mức quỹ dữ trữ)"* → sau khi báo nguyên nhân + phương án: *"Làm theo đề xuất"*.

**(b) Lỗi tìm được (dữ liệu production):** "phát sinh" MUA DỰ TRỮ dùng 1 mốc CHUNG (`app_settings du_phong_ktv_import_meta`) + lọc `dat_don_hang.updated_at > mốc`. Kế toán nhập "hiện tại" cho BẤT KỲ KTV nào là mốc của mọi KTV nhảy theo → đơn đã mua nhưng MISA chưa ghi bị bỏ mất: NS-3871 mua 8.810.000đ (19 đơn 10–13/11, KT chốt 14/11), mốc nhảy 16/11 09:59 → phát sinh 0, hiện tại 0 → còn được mua đủ 10tr. Ngược lại đơn cũ đã có trong MISA chỉ đổi trạng thái sau mốc thì bị cộng lại (NS-3895 135.000đ).

**(c) Đã sửa:**
- `migrations/0123_han_muc_du_tru_moc_rieng.sql`: cột `han_muc_du_tru.hien_tai_luc` = lúc Kế toán nhập "Hạn mức dự phòng hiện tại" (số MISA) cho chính Mã MISA đó; dữ liệu cũ lấy `cap_nhat_luc` của dòng có "hiện tại".
- `lib/duPhongKtv.ts`: `HAN_MUC_MOC_JOIN`, `PHAT_SINH_DU_TRU_SUBQUERY` (dùng chung hàm 1 KTV + bảng Danh sách KTV): phát sinh = đơn MUA DỰ TRỮ (trừ Từ chối / Đã huỷ) **chưa được Kế toán chốt xuất ("Da chot xong don xuat") trước mốc của KTV**; chưa nhập "hiện tại" → tính mọi đơn. `TRA_HANG_DU_TRU_SUBQUERY` cũng theo mốc riêng (không còn bind). `computeDuPhongPhatSinh(db, ma, loaiTru)` / `computeDuPhongTraHang(db, ma)` bỏ tham số mốc.
- `POST /settings/ktv-lien-he/han-muc-du-tru`: nhập / import "hiện tại" ghi `hien_tai_luc` cho đúng dòng đó. `setMocTinhDuPhong` (mốc chung) vẫn ghi nhưng không còn dùng để tính dự trữ.
- Danh sách KTV đổi tên cột: "Hạn mức dự trữ (trần)", "Đã mua theo MISA" (tooltip lúc Kế toán nhập = mốc), "Mua sau mốc MISA", "Trả hàng dự trữ đã chốt", **"Đã mua dự trữ"** (mới = MISA + mua sau mốc − trả), **"Còn được mua"** (trước "Mốc dự phòng hiện tại", âm tô đỏ). Câu nhắc khi tạo đơn: "Dự trữ còn được mua: … / hạn mức …".

**(d) Ghi nhận / kiểm thử:** Deploy 17/11/2026 (migration 0123 + Version ID `6ab3cd17`). typecheck 0 lỗi. Chạy công thức trên D1 production (chỉ đọc): NS-3871 phát sinh 0 → 8.810.000đ, NS-3895 135.000 → 7.625.000đ, thanhnd.ptdv-hcm hiện tại 13.868.000 + 1.760.000. Sau khi sửa, nhiều KTV bị giảm "còn được mua" ngay và có thể bị chặn đặt thêm dự trữ — đúng số thật. Mốc dữ liệu cũ = lần sửa gần nhất của dòng (có thể muộn hơn lúc nhập "hiện tại" thật nếu sau đó chỉ bật/tắt) — Kế toán nhập lại "hiện tại" là có mốc chuẩn. Mục công nợ vẫn dùng mốc chung kiểu cũ (`congNoKtv.ts`), chưa đổi.

## Tải file MISA gộp theo đúng bộ lọc đang xem (17/11/2026) — v1.513

**(a) Nguyên văn:** *"khi kế toán lọc filter, nhưng tải file mẫu misa vẫn ra hết => fix lại, danh sách tải ra chỉ bao gồm danh sách phù hợp đã lọc"* (ảnh: lọc cột "Loại phiếu (trừ 1)" còn 7 dòng).

**(b) Nguyên nhân + đã sửa:** nút tải MISA gộp (`misaExportBulkMutation`, `PhieuXuatKhoTab.tsx`) gọi `GET /phieu-xuat-kho/misa-export` KHÔNG kèm bộ lọc theo cột (`locCot.queryParams` — Loại phiếu, In phiếu, Người tạo, Người nhận…) và dùng `filterTrangThai` thay vì `trangThaiGui` như danh sách. Backend đã dùng chung `pxkListWhere()` với danh sách (v1.438) nên chỉ sửa frontend: gửi đúng cùng bộ tham số với danh sách.

**(d) Kiểm thử:** typecheck 0 lỗi. Chưa bấm thử trên giao diện. Deploy 17/11/2026.

## Nút đổi qua lại 2 giao diện tạo đơn trên web (17/11/2026) — v1.514

**(a) Nguyên văn:** *"trên giao diện tạo đơn đặt linh kiện web, thêm 1 nút đổi qua lại giữa 2 giao diện tạo đơn để người dùng lựa chọn, (lưu cache theo máy khi họ đổi)"*

**(b) Đã làm** (`TaoDonTab.tsx`, `TaoDonMobileScreen.tsx`): trên máy tính, tiêu đề Modal tạo đơn có nút "📱 Giao diện gọn" → hiện màn nhập từng dòng (`TaoDonMobileScreen`) trong khung 560px giữa màn hình (bọc `transform` để `fixed inset-0` của màn gọn chỉ phủ khung); màn gọn có nút "🖥 Giao diện đầy đủ" để quay lại. Lựa chọn nhớ trên máy (`localStorage` `dmlk-taodon-giao-dien-web`, mặc định "đầy đủ"). Hai giao diện dùng chung `useTaoDonForm` nên đổi qua lại KHÔNG mất dữ liệu đang nhập (bỏ hỏi xác nhận khi đổi trên web). Điện thoại giữ nguyên cách cũ (`dmlk-taodon-prefer-old-ui`).

**(d) Kiểm thử:** typecheck 0 lỗi. Chưa bấm thử trên giao diện. Deploy 17/11/2026.

**v1.515 (17/11/2026)** — nguyên văn: *"giao diện gọn đang bị thu nhỏ trên web"*. Khung giao diện gọn trên web đổi từ rộng 560px sang 95% × 95% màn hình, căn giữa, bo góc (như Modal đầy đủ); bỏ chiều cao cứng `100dvh` của màn gọn khi đặt trong khung web (để thanh nút dưới không bị cắt). Typecheck 0 lỗi, chưa bấm thử giao diện.

## SLA từng bước, quá hạn, giải trình, gắn thẻ vi phạm (17/11/2026) — v1.517, migration `0125`

**(a) Nguyên văn:** quản lý yêu cầu *"API: Bổ sung: Trả hàng - Các ca quá hạn - giải trình liên quan / Đặt linh kiện - Các ca quá hạn / Các ca bị gắn thẻ vi phạm"*, *"Đặt SLA từng bước / Các ca quá hạn xử lý"*; chốt *"app vi phạm là 1 app bên ngoài … triển khai theo hướng mở để đối tác tự kéo, chúng ta cung cấp api là đc"*.

**(b) Thiết kế:**
- Định nghĩa bước (trạng thái, bảng log, bộ phận) ở CODE `BUOC_VI_PHAM` (`lib/viPham.ts`); bảng `sla_buoc` chỉ giữ phần Admin sửa (số giờ, giờ giải trình, tính cuối tuần, bật/tắt). Thêm bước = thêm dòng code + seed migration.
- `quetViPham()` (cron mỗi giờ + `POST /api/vi-pham/quet` Admin): mỗi nguồn (`dat_don_hang_log`, `tra_hang_log`, `thieu_lk_log`, `phieu_xuat_kho_log`, `khoan_chuyen_tien`) đọc thực thể ĐANG ở bước theo dõi + thực thể có log id > mốc (`vi_pham_quet`), gộp log thành khoảng (bỏ log cùng trạng thái + trạng thái chỉ-audit của phiếu — `TRANG_THAI_THAT`; thêm trạng thái thật mới ở log phải thêm vào đây), khoảng quá hạn → UPSERT `vi_pham` (khoá `buoc, doi_tuong_id, moc_vao`; chỉ cập nhật khi rời bước). Lần đầu: mốc = id hiện tại, KHÔNG quét ngược lịch sử. **v1.563**: thực thể bị kéo vào vì có log mới (đơn bị hủy, ticket hủy bỏ…) vẫn đọc toàn bộ log nhưng chỉ xét khoảng còn mở hoặc kết thúc bằng log id > mốc cũ (`Khoang.idKetThuc`, `mocXet` trong `quetNguonLog`) — trước đó mọi khoảng cũ (kể cả trước khi bật module 17/11) bị sinh ca "Chờ giải trình" mới (DDH-001568: 2 ca tháng 10 sinh lúc 25/11 15:00 sau khi đơn tự hủy). Hạn giải trình tính từ max(hạn, lúc ghi nhận).
- Giải trình tự động: trả hàng — log rời bước có ghi chú "Chậm quá hạn…" (`traHang.ts` bắt chọn lý do chậm); `tn_duyet` — `dat_don_hang_giai_trinh` trong khoảng. Đổi câu "Chậm quá hạn" ở `traHang.ts` phải sửa điều kiện `startsWith` ở `lenhGiaiTrinhTuDong`.
- Kế toán duyệt tiền: khoảng = `khoan_chuyen_tien.ktv_bao_chuyen_luc` → `duyet_luc`; đang chờ = phiếu `trang_thai_chuyen_tien='KTV da chuyen'` (`ngay_ktv_chuyen`); TN trả lại / KTV rút lại → đóng ca ở lúc quét.
- Quyền: xem = nhân viên văn phòng + Admin (cùng tập Báo cáo tốc độ); giải trình = `boPhanCua()` (cờ vai trò, Kế toán có `tn` qua `keToanLamThayTn`) + Admin; gỡ thẻ / cấu hình / quét = Admin. Badge `viPhamCanGiaiTrinh` (`/notifications/count`).
- API đối tác `GET /api/partner/v1/vi-pham` (con trỏ `cap_nhat_tu` + `after_id` theo `cap_nhat_luc, id`; lọc loai/trang_thai/buoc/bo_phan/khu_vuc/don) + `/v1/vi-pham/buoc`; cột chung `VI_PHAM_COT_SQL` / `boSungViPham` ở `routes/viPham.ts` (màn nội bộ + API cùng 1 bộ). Tài liệu §4.18.
- FE `modules/ViPhamModule.tsx` (key `vi-pham`, nhóm "Hệ thống").

**(c) Chưa làm / mặc định chờ chốt:** ~~SLA 24h (Mua hàng 48h), giải trình 24h~~ → từ v1.527 tính theo GIỜ LÀM VIỆC (mục "SLA giờ làm việc" bên dưới); bước KTV chưa tính; lý do chậm bắt buộc của trả hàng cố định (`GIO_SLA_LY_DO_CHAM`) — không theo cấu hình; chưa cập nhật `luongHeThong/noiDung.ts`.

**(d) Kiểm thử:** local D1 dev + giao diện — xem `nhat_ky_lam_viec.md` cùng ngày.

**v1.518 (17/11/2026, migration `0126`)** — *"phân rõ được tồn theo vai trò nào, ai là người cần giải trình, và nếu họ cần giải trình thì họ làm sao biết được cần giải trình ở đâu, giải trình như thế nào, xác định được đơn chưa giải trình, đã giải trình, gặp về đề, cần theo dõi như thế nào?"* + *"Rà soát lại toàn bộ các bước quy trình giải trình tồn theo từng vai trò"* + *"Xây đựng tài liệu html chi tiết theo từng bước giải trình có hình ảnh hướng dẫn theo từng vai trò"*:
- `vi_pham.nguoi_phu_trach` (JSON email) = `nguoiPhuTrach()` (`lib/viPham.ts`, danh bạ `docDanhBaPhuTrach`): GS = `email_gs` của đơn + GS chính/phụ khu vực; bộ phận khác = người gán khu vực của đơn (`user_khu_vuc`) → người không gán khu vực → cả bộ phận; Kho lọc `kho_nhom_lk`. **TN không còn tham gia** (v1.531, migration `0130` sửa ca đang mở — "các ca này đang bị đẩy sang cho vai trò tác nghiệp xử lý, nhưng hiện tại TN không còn tham gia nữa"): bộ phận `tn` (2 bước Chờ TN duyệt / duyệt tổng trả hàng) = Kế toán; người có `la_tac_nghiep` mà không `la_ke_toan` bị loại khỏi các bộ phận khác (cờ Kho của TN chỉ để thao tác hộ), loại xong rỗng thì giữ danh sách cũ. Tính lại mỗi lần quét khi còn "Cho giai trinh" (đổi người → `bao_luc` NULL → báo người mới). "Cần tôi giải trình", badge `viPhamCanGiaiTrinh` theo cột này; quyền giải trình = có tên HOẶC cùng bộ phận + Admin.
- Thông báo (`guiThongBaoQuet`): gộp theo người mỗi lần quét — ca chưa báo (`bao_luc`), còn ≤ `GIO_NHAC`=6 giờ (`nhac_luc`), vừa gắn thẻ; chuông `link_type` `vi_pham` (link_id = tab) + push `/?vi_pham=<tab>` → App.tsx sự kiện `mo-vi-pham`. `thongBaoViPham()` cho báo không đúng / Admin xử lý.
- Giải trình bắt buộc `ly_do` (`GET /vi-pham/ly-do` = `settings_ly_do_cham` "Mua hàng" + "Khác"). "Báo không đúng" `POST /:id/bao-khong-dung` → `Cho xem xet` (lưu `khieu_nai_truoc`), Admin `POST /:id/xu-ly-bao` chap_nhan → `Da go the` / tu_choi → trạng thái trước (Cho giai trinh gia hạn `gio_giai_trinh`).
- `GET /vi-pham/theo-doi-tuong?ids=` → `ViPhamBanner` (`modules/viPham/ViPhamUi.tsx`, dùng chung hộp/chi tiết với màn chính) trong chi tiết đơn, PXK, ticket thiếu hàng, đơn trả hàng (chỉ văn phòng). `GET /vi-pham/tong-hop` → tab "Tổng hợp theo dõi". Tab mới "Của tôi", "Chờ Admin xem xét".
- **App Nhiệm vụ eOffice** (v1.554, `lib/congNhiemVu.ts`, mã app `dat-linh-kien`, secret `TASK_FEED_KEY`): ảnh chụp đủ (`toanBo`) ca "Chờ giải trình" theo
  từng người trong `nguoi_phu_trach` (Mã NS → email), id `VP-<id>`, khẩn khi còn ≤ `GIO_NHAC` giờ làm việc, link `/?vi_pham=can_toi`. Gửi sau `quetViPham` (cron),
  sau giải trình, "Quét ngay", nút Admin "Đẩy lên App Nhiệm vụ" (`POST /vi-pham/nhiem-vu/day`); danh sách không đổi (hash) thì không gọi cổng. TUYỆT ĐỐI
  không gửi `toanBo` với danh sách thiếu (người vắng mặt = cổng xoá hết việc của họ).
- Popup nhắc khi MỞ APP (v1.529, `modules/viPham/NhacGiaiTrinhPopup.tsx`, mount ở `App.tsx`): còn ca "Cho giai trinh" có tên mình (`GET /vi-pham?tab=can_toi`) → popup số ca + ca sắp hết hạn (đã nhắc `nhac_luc` hoặc còn ≤ 6 giờ); ngưỡng nhắc backend `GIO_NHAC` = 6 giờ làm việc (v1.530) + nút Giải trình / Mở danh sách; "Để sau" ẩn theo sessionStorage (khoá = tập id + ca sắp hết), có ca mới thì hiện lại.
- Tài liệu KTV `docs/Huong_dan_KTV_dat_hang_linh_kien.html` (25/11/2026, app v1.563, 39 ảnh base64) thay bản Word/PDF v1.462 — đổi luồng đặt / chuyển tiền / nhận / hủy / trả hàng của KTV thì sửa cả file này.
- Tài liệu người dùng `docs/Huong_dan_giai_trinh_qua_han_theo_vai_tro.html` (16 ảnh chụp local, base64) — kèm mục "Rà soát quy trình & điểm cần chốt".

**v1.519 (18/11/2026)** — *"việc giải trình không đúng cũng chỉ tính là giải trình thôi, không cần phải thêm vai trò của admin. admin không thực hiện công việc xác nhận bỏ thẻ trên hệ thống này"* + *"KTV không cần giải trình, BO tham gia việc giải trình là được"*:
- BỎ hẳn "Báo không đúng" / Admin xem xét / gỡ thẻ (route `/:id/bao-khong-dung`, `/:id/xu-ly-bao`, `/:id/go-the`, `thongBaoViPham`, tab "Chờ Admin xem xét", "Đã gỡ thẻ", cột `khieu_nai*`/`go_the*` ở API). Cột + giá trị CHECK 'Cho xem xet'/'Da go the' còn trong DB (migration 0126) nhưng không dùng — đừng dựng lại luồng Admin.
- Ca ghi nhận sai = giải trình với ly do `LY_DO_KHONG_DUNG` ("Ghi nhận không đúng / không thuộc trách nhiệm", đầu danh sách `GET /vi-pham/ly-do`, trả kèm `khong_dung`) → "Da giai trinh". Gắn thẻ là kết quả cuối.
- Chỉ BO giải trình; KTV không (không bước nào giao KTV, route chặn KTV/Vệ tinh). Tài liệu HTML cập nhật (14 ảnh), API đối tác 2.0.

**v1.548 (21/11/2026, migration `0135`)** — *"khi giải trình sẽ thêm lựa chọn: 1. … lỗi nội bộ, lỗi đối tác, lỗi của tôi, khác 2. Bằng chứng của việc giải trình nếu không phải lỗi của bản thân"*: `vi_pham.phan_loai_loi` (`PHAN_LOAI_LOI` ở `routes/viPham.ts` + bản sao FE `ViPhamUi.tsx`) bắt buộc khi giải trình tay; khác `cua_toi` → `vi_pham.bang_chung` 1–5 link ảnh Drive (`POST /vi-pham/:id/anh`, `nhanAnhTaiLen`). Cột "Lỗi thuộc về" ở danh sách, API đối tác trả kèm (tài liệu 2.4). Ca cũ / giải trình tự động để NULL.
  **v1.553** ("bỏ lựa chọn \"lỗi của tôi\" và \"khác\""): chỉ còn Lỗi nội bộ / Lỗi đối tác (`PHAN_LOAI_LOI_CHON` BE + FE), ảnh bằng chứng TÙY CHỌN 0–5 ảnh ("ảnh là tùy chọn, ko bắt buộc"); nhãn cua_toi / khac giữ cho ca cũ. Cùng đợt: tab mở từ trước deploy gửi giải trình thiếu `phan_loai_loi` → server trả `message` "đã có phiên bản mới, tải lại trang" (client cũ hiện body.message thay "không xác định"); `components/ui/BanMoiBanner.tsx` (main.tsx) mỗi 5 phút + khi quay lại tab tải `/` (file tĩnh, không qua Worker) so `/assets/index-*.js` → khác thì hiện thanh "Ứng dụng đã có phiên bản mới — Tải lại".

**v1.524 (18/11/2026, migration `0127`)** — *"bước chờ kho (trả hàng) => đơn quá hạn 10 ngày cho vào danh sách hủy bỏ … vẫn có thể vào danh sách đơn tự hủy để tìm nếu sau này hàng về muộn"* + *"Đơn sau mốc hạn giải trình mà không giải trình sẽ chuyển sang trạng thái tồn CEO"* + *"Danh sách các đơn bị lỗi tồn CEO sẽ bắn API sang cho đối tác. tương tự như cách app DVBH …"*:
- Hàng trả "Đơn tự hủy": `traHangTuHuySql()` (`lib/hanLyDoCham.ts`) = "Cho kho xac nhan" quá 10 ngày từ lúc vào bước, TÍNH LÚC ĐỌC (không đổi trạng thái — hàng về muộn Kho xác nhận như thường). Mọi chỗ đếm / lọc "Cho kho xac nhan", `__CHO_XAC_NHAN__`, còn tồn (`donConTonSql`), badge `choKhoTraHang`, Trang chủ, `/loai-don-counts` loại nó ra; sentinel `__TU_HUY_KHO__` (counts + danh sách), cột `tu_huy_qua_han`. Thêm chỗ đếm việc Kho trả hàng mới → nối `AND NOT traHangTuHuySql(...)`. FE: Chờ Kho có 2 tab "Đơn đang chờ" / "Đơn tự hủy (quá 10 ngày)" (`TraHangTab.tsx`).
- Vi phạm: trạng thái `Gan the` đổi thành **`Ton CEO`** (bảng dựng lại, cột `gan_the_luc` giữ tên = lúc chuyển); nhãn "Tồn CEO". API `/v1/vi-pham` vẫn nhận lọc `Gan the`, thêm `ton_ceo`/`ton_ceo_luc`.
- `GET /api/partner/v1/danh-sach-ton?loai=ton-ceo` — cùng hình dạng `danh-sach-ton?loai=canh-bao-ceo` của DVBH (DVBH cũng để đối tác KÉO). Tài liệu §4.19 (2.2). App vi phạm phía đối tác chưa kéo.
- v1.525 ("tránh 1 ca bị kéo lại liên tục"): API danh sách Tồn CEO nhận con trỏ `cap_nhat_tu` + `after_id` (thứ tự `cap_nhat_luc, id`, limit ≤ 500) → trả `next`; ca Tồn CEO chỉ đổi `cap_nhat_luc` khi đơn / phiếu rời bước nên mỗi ca tới đối tác tối đa 2 lần.
- v1.526 (chốt "loại trừ" — Tồn CEO bước Kho xác nhận trả hàng phần lớn do KTV chưa gửi hàng): mỗi lần quét, ca `th_kho` còn đang chờ (`ket_thuc_luc` NULL) của đơn TỰ HỦY (`traHangTuHuySql`) → tự "Da giai trinh", `giai_trinh_tu_dong=1`, `ly_do` = `LY_DO_TU_HUY_TRA_HANG` ("Đơn tự hủy — KTV không gửi hàng"), bỏ `gan_the_luc` — kể cả ca đã Tồn CEO (đối tác nhận lại 1 lần với trạng thái mới). Chạy TRƯỚC bước chuyển Tồn CEO trong `quetViPham`. Ca từ ngày 2 tới ngày 10 vẫn có thể là Tồn CEO, tới ngày 10 tự gỡ.

## SLA theo GIỜ LÀM VIỆC (19/11/2026) — v1.527, migration `0128`

Nguyên văn: *"các logic quá hạn SLA trên toàn bộ hệ thống từ 24h =>8h, 48h => 16h làm việc (loại trừ 8h chủ nhật và 4h chiều thứ 7)"*.
- `backend/src/lib/gioLamViec.ts` = nguồn DUY NHẤT của giờ làm việc (`CA_LAM_VIEC`: T2–T6 08:00–12:00 + 13:00–17:00, T7 08:00–12:00, CN nghỉ; chưa trừ ngày lễ):
  `congGioLamViec` (hạn = mốc + N giờ làm việc; mốc ngoài giờ → đếm từ đầu ca kế tiếp; hết đúng cuối ca → hạn = cuối ca), `gioLamViecGiua`. Đổi khung giờ chỉ sửa ở đây.
- `tinhHanLyDoCham` (`hanLyDoCham.ts`) = mốc + `GIO_SLA_LY_DO_CHAM` = 8 giờ làm việc → áp cho hạn "Lý do chậm" của TN (đơn, PXK gửi kế toán) và hạn 4 giai đoạn trả
  hàng (ghi chú log "Chậm quá hạn 8 giờ làm việc …" — giữ tiền tố "Chậm quá hạn" vì `viPham.ts` nhận diện giải trình tự động bằng nó).
- Vi phạm (`viPham.ts tinhHan`): `tinh_cuoi_tuan` = 0 nay nghĩa là giờ làm việc, = 1 = giờ lịch 24/7 (UI "Giờ lịch 24/7"). Migration `0128` đổi `sla_buoc` 24 → 8, 48 → 16
  (cả hạn giải trình), bước Admin đã đặt số khác giữ nguyên. `so_gio_tre` tính theo giờ làm việc; nhắc sắp hết hạn giải trình khi còn ≤ 2 giờ làm việc (`GIO_NHAC`).
  Ca đã ghi nhận trước giữ hạn cũ; đơn / phiếu đang nằm ở bước sẽ bị đánh giá lại theo hạn mới ở lần quét kế tiếp.
- Báo cáo "Tốc độ xử lý" (v1.551, 2026-11-21 — "các tốc độ xử trong các báo cáo đã tính lại theo mốc 8h làm việc chưa?" → "Đổi sang giờ làm việc"): giờ chờ mỗi
  lượt (`hoursBetween` ở `lib/slaMetrics.ts`) = `gioLamViecGiua` thay giờ lịch → TB giờ xử lý, kỳ trước, chậm / nhanh nhất, tab chờ KTV đều theo giờ làm việc;
  cache báo cáo đổi khoá `bao-cao-toc-do/tong-hop-v2` (kỳ cũ tính lại theo cách mới).
  v1.552 ("thêm cột TB ngày làm việc bên cạnh cột \"TB giờ\""): thêm cột "TB ngày làm việc" = TB giờ làm việc ÷ 8 (1 ngày làm việc = 8 giờ) cạnh
  "TB giờ xử lý" và "TB giờ (toàn hệ thống)" + file Excel — chỉ hiển thị, không đổi API.
- KHÔNG đổi (không phải SLA): đẩy lại đơn / ticket trong 24h, trả hàng tự hủy 10 ngày, tự xác nhận nhận hàng 10 ngày.

## Phí dịch vụ — KTV nhập số tiền thực tế (25/11/2026) — v1.561
- Nguyên văn: "với mã linh kiện phí dịch vụ (đang để 150.000) cho phép ktv sửa lại số tiền thực tế. (khi ktv chọn mã phí dịch vụ, hiện cảnh báo là phí có thể thay đổi và hiện số tiền để ktv nhập hoặc giữ nguyên)".
- Nhận diện: `laPhiDichVu(ten_linh_kien)` — tên chứa "phi dich vu" sau khi bỏ dấu (BE `lib/pxkRecalculate.ts`, FE `datMuaLinhKien/helpers.ts`, đổi 1 bên đổi cả 2).
  Chọn theo tên để bắt cả 2 mã đang dùng (`10002`, `1002`) mà không thêm cột danh mục.
- FE: `DonHangDraft.gia_dv` (chuỗi số; undefined = giữ giá danh mục, đổi Mã LK / sao chép / tách thay thế → xoá). `useTaoDonForm.giaDvDraft(d)` →
  `{ laPdv, gia, hopLe }`; `isLineComplete` chặn ô trống / 0; `giaUocTinhDong` trả gia nhập × SL (nhãn "Phí dịch vụ thực tế"); gửi `gia_ktv_nhap`
  ở cả `/phieu-dat` lẫn `/phieu-dat/kiem-tra`. UI `PhiDichVu.tsx` (`PhiDichVuInput`) đặt dưới ô Mã LK ở `TaoDonTab` + `TaoDonMobileScreen`.
- BE `chuanBiPhieuDat`: `gia_ktv_nhap` chỉ giữ khi mã là phí dịch vụ; kiểm > 0 và ≤ `GIA_TOI_DA` (lỗi `GIA_PHI_DICH_VU_KHONG_HOP_LE`); trùng `gia_ban` → bỏ.
  `DongDanhGia.gia_ban` = giá nhập. `taoPhieuDat` INSERT thêm `gia_chot` (= giá nhập), `gia_de_xuat` giữ ảnh chụp giá danh mục; log khởi tạo thêm dòng 💲.
  Tiền phiếu: `tinhToanPxk` đã ưu tiên `gia_chot` cho mọi nhánh có tiền → không đổi công thức.
- Không áp: đơn công nợ / hỗ trợ (tiền = `so_tien_cong_no`), Import Excel, API đối tác, form sửa đơn của người tạo.

## BC KPIs — báo cáo mua hàng tháng (25/11/2026) — v1.562
- Nguyên văn: "xây dựng trên app mục BC KPIs cho phép tải về (bc này không cần chạy liên tục, chỉ cần thêm nút load bc, thì mới load số liệu khi cần)" —
  dựng lại 3 chỉ số của file Excel "BC mua hang 2610.xlsx" (sheet 1. KPIs KHO, 2. Ms Hằng, DON, PHIEU, THIEU LK).
- BE `routes/baoCaoKpi.ts` mount `/api/bao-cao-kpi` (cạnh `/api/bao-cao-toc-do`); 2 truy vấn (đơn tháng + phiếu tháng, log qua `json_each` 1 bind), gom trong JS.
  Hằng `MUC_TIEU_THIEU` {MB 0.015, MN 0.02}, `MUC_TIEU_TOC_DO_GIO` 24, `MUC_TIEU_TOC_DO_GIO_LV` 8. `tuanExcel()` = WEEKNUM kiểu 1, đệm 2 số ("w04").
  Không cache (khác báo cáo tốc độ) — người dùng chủ động bấm, tháng 10 ~0,3 giây trên local.
- FE `modules/BcKpisModule.tsx`, key menu `bc-kpis` (navConfig nhóm Hệ thống, App.tsx mở cùng tập nhân viên văn phòng với `bao-cao-toc-do`).
  Excel tạo phía trình duyệt từ kết quả đã tải (xlsx import động), không gọi API lần 2.
- Khác file Excel cũ (cố ý): tốc độ Kho tính đúng chiều (Kho xuất − chốt; file cũ trừ ngược nên ~99% "đạt"); mặc định bỏ đơn hủy (ô tick để tính như cũ);
  đơn thiếu lấy ticket MỚI NHẤT; "Đã về hàng" gồm cả ticket "Kho xac nhan hang da ve" / có `ngay_hang_ve_thuc_te`.

## Nhận việc từ Trợ lý Mây (tự sửa)
- Issue gắn nhãn `may:phan-tich` là ĐỀ XUẤT CẢI TIẾN cần phân tích trước: workflow `may-phan-tich` chỉ ĐỌC mã để soạn BRD cho Giám đốc duyệt — không sửa mã ở bước này. Khi duyệt, BRD nằm ở đầu issue; làm đúng BRD và lưu nó vào `docs/yeu-cau/MAY-xxxxx.md`.
- Issue gắn nhãn `may:tu-sua` là việc do Trợ lý Mây chuyển sang, mã `MAY-xxxxx` ở tiêu đề. Sửa ĐÚNG phạm vi mô tả.
- Kiểm tra bắt buộc trước khi mở PR: `npm run build` (eslint chạy trước; đỏ = dừng). Flutter: `flutter analyze && flutter build web`.
- Nhánh `may/may-xxxxx`, PR vào `main`, tiêu đề bắt đầu bằng mã, mô tả tiếng Việt (nguyên nhân · cách sửa · cách thử), ghi `Closes #<issue>`.
- KHÔNG BAO GIỜ: sửa `firestore.rules`/`storage.rules`/hàm `hrLink`/secrets; chạy `firebase deploy` trần; đổi tính năng ngoài issue; xoá dữ liệu.
- Không chắc / cần người quyết: bình luận `MÂY: CẦN NGƯỜI` + lý do rồi dừng.
- Deploy do workflow `may-deploy` làm sau khi được duyệt — KHÔNG tự deploy trong lúc sửa.
- Khi làm việc TRONG PHIÊN NÀY (không phải workflow) mà bản sửa giải quyết một issue Mây đang mở (`gh issue list --label may:cho-duyet,may:tu-sua`): ghi mã `MAY-xxxxx` vào dòng đầu commit → Trợ lý Mây tự báo hoàn thành, không cần Giám đốc bấm tay.

## Kết quả Mua hàng (EO) theo ID case / ID đơn (2026-11-20, v1.543)
- Đọc từ app EO Mua hàng (Worker `muahang`, repo `../EO MUA HANG/eomua` v0.108): `lib/muaHangClient.ts` → Service Binding `MUAHANG_SERVICE`
  `GET /api/partner/theo-id?ids=&po_lk=`, header `X-API-Key` = secret `MUAHANG_DOC_API_KEY` (cùng giá trị `DOC_API_KEY` bên muahang). Chưa đặt / lỗi → `ket_noi=false`.
- Route `GET /api/dat-mua-lk/mua-hang-eo?don=|ticket=` (phạm vi `scopeDatMuaNguoiTao`): ids = mã đơn + mọi `thieu_lk.id` của đơn + `dat_don_case.case_id`;
  po_lk = `thieu_lk.ma_eo_mua` ~ `ddh.ma_lk`. FE `modules/datMuaLinhKien/KetQuaMuaHang.tsx` (`KetQuaMuaHang`, `MuaHangZone`) dùng ở `DanhGiaThieuLk` và chi tiết đơn (`DonCuaToiTab`).

## Đồng bộ ngày dự kiến EO → ticket thiếu hàng THB / TLK (2026-11-26, v1.568, migration `0136`)
- Báo lỗi: LK 3004022213 — Mua hàng nhập ngày dự kiến 07/12 trên EO (PO 3TDO-000847, dòng ghi ID CRM `THB-000147`) ngày 20/11, ticket THB-000147 bên này
  trống ngày tới 26/11 (phải gõ tay lại). Trước v1.568 ngày trên ticket CHỈ nhập tay; kết nối v1.543 chỉ hiện khung xem. Lúc tra: 3 THB + 39 TLK đang mở trống / lệch.
  Chốt nguyên văn: "Có, EO ghi đè luôn".
- `lib/dongBoNgayEo.ts` `dongBoNgayEo(env, chayThu?)`, gọi trong `scheduled()` mỗi giờ. Ticket mở: THB trạng thái thuộc `THB_MO`; TLK trạng thái log mới nhất KHÔNG thuộc
  Đã hủy / Đã kết thúc / Hàng đã về / Kho từ chối sai TT / Mua hàng từ chối. 1 lần `POST muahang /api/partner/theo-id` (EO v0.126, ≤1000 ids / ≤1000 cặp):
  ids = mã ticket + mã đơn DDH của TLK; po_lk = mọi `3TDO-\d+` trong `ma_eo_mua` ~ mã LK. Khớp khi `khop_theo` chứa 1 khoá của ticket; lọc `trang_thai_eo = ISSUED`,
  `!ket_thuc`, có `ngay_du_kien`; lấy ngày sớm nhất. Khác 10 ký tự đầu → UPDATE ngày + `ma_eo_mua` (đổi sang PO chỉ khi ô chưa chứa PO đó).
- THB: cập nhật `ngay_cap_nhat` (để suachua kéo `since=` thấy) + 1 dòng `thieu_hang_bh_log` cùng trạng thái, người "Hệ thống (đồng bộ EO Mua hàng)", rồi `pushThieuHangBhToSuachua`.
  TLK: KHÔNG chèn `thieu_lk_log` — trạng thái = log mới nhất và SLA (`viPham.ts`, `dayLaiThieuLk.ts`) tính theo giờ log → chèn sẽ reset đồng hồ.
- Mọi lần ghi đè → `dong_bo_ngay_eo_log` (ticket, loại, ngày cũ / mới, mã EO cũ / mới, eo_item_id, khop_theo, lúc). Log cron: `[dongBoNgayEo] {ticket, khop, sua}`.
- Hệ quả đã chấp nhận: Kho / Mua hàng sửa tay ngày trên ticket mà EO có ngày khác → giờ sau bị EO ghi đè lại. Muốn đổi ngày → sửa trên EO.

## Cảnh báo "EO báo đã về" cho Kho (2026-11-26, v1.572, migration `0137`)
- Yêu cầu: "Có, thêm cảnh báo" (đề xuất: cảnh báo Kho khi EO báo hàng đã về đủ mà ticket chưa xác nhận). Lúc tra: 5 ticket (TLK-000658/659, THB-000093/095/098)
  đã về đủ trên EO 20–23/11 nhưng còn "Mua hàng đã đặt" — THB không có cơ chế tự xác nhận; TLK tự xác nhận theo tồn kho công ty đúng khu vực (`tuDongHangVe.ts`) nên
  không bắt được khi tồn khu vực = 0.
- Cột mới `thieu_lk.eo_ve_du`, `thieu_hang_bh.eo_ve_du` (JSON {po, sl_ve, sl_dat, ngay_ve}). `dongBoNgayEo` → `tinhVeDu(dòng khớp)`: bỏ dòng `trang_thai = "Đơn trên EO bị hủy"`,
  cần còn ≥1 dòng ISSUED, tất cả `ket_thuc`, tổng `sl_ve > 0`; ghi / xoá (NULL) khi giá trị đổi. Log cron thêm `eo_ve_du`.
- API `GET /thieu-lk?eo_ve_du=1` (TLK: cột khác NULL + trạng thái chưa đóng `EO_VE_DU_TT_DONG`; THB: khác NULL + `THB_MO`), `thieu-lk-status-counts` trả `eo_ve_du` (TLK + THB,
  cùng bộ lọc, trừ chính bộ lọc này — `thieuLkListWhere(..., boQuaEoVeDu)`, `thbGopWhere(c, boQuaTrangThai, boQuaEoVeDu)`).
- FE `modules/datMuaLinhKien/EoVeDu.tsx` (`docEoVeDu`, `EoVeDuBadge`, `EoVeDuBanner`): cột "Kho công ty" + thẻ mobile + đầu chi tiết TLK (nhãn + khung), chi tiết THB (`ThieuHangBh.tsx`, khung);
  chip `filterEoVeDu` cạnh "Kho đã có đủ hàng". Không tự đổi trạng thái (kéo theo duyệt đơn / vào phiếu / tiền).

<!-- may-ba-lan -->
## Ba làn xử lý của Trợ lý Mây (Giám đốc chốt 18/11/2026 — áp dụng VĨNH VIỄN cho app này)
Mỗi việc Mây giao thuộc MỘT trong ba làn. Khi viết ý tưởng / BRD, dòng đầu ghi `**Làn:** nhanh | thường | đầy đủ — <lý do 1 câu>`.
Mây xếp sai thì app ghi đúng làn: app ghi **nhanh** → Mây chuyển ngay sang làn nhanh (không đợi duyệt).
- **Làn nhanh** — xử lý trọn, KHÔNG qua duyệt, vài phút là xong (như Giám đốc chat trực tiếp với phiên này):
  lệnh của Giám đốc · cấp / sửa / thu hồi quyền cho người cụ thể · dữ liệu sai / trùng / kẹt (huỷ mềm, mở lại, đẩy lại, sửa trường có bằng chứng) ·
  thêm / sửa danh mục, cấu hình · lỗi rõ ràng sửa nhỏ không đổi luật · hỏi cách dùng (app đã làm được → hướng dẫn Cách 1 / Cách 2) · lấy số liệu.
  Cách làm: tra dữ liệu thật → ghi dữ liệu qua khối `may-thao-tac` (Mây tự ghi, lưu trước/sau) → sửa luôn nguyên nhân nếu là lỗi mã →
  kiểm → `## BÁO CÁO KẾT QUẢ` (Đã làm · Vì sao bị · Đã sửa · Không đụng tới). Cấp quyền: khai `cap_quyen` { nguoi, vai, vai_cao }.
- **Làn thường** — cải tiến nhỏ (thêm cột / bộ lọc / nút, đổi hiển thị, sắp xếp): ý tưởng + cách làm MỘT bản cụ thể, Giám đốc duyệt 1 lần là làm luôn.
- **Làn đầy đủ** — đổi luật / cách tính, tính năng lớn, đụng tiền / lương / thưởng / công nợ, phân quyền cả nhóm / chức danh, xoá thật,
  hồ sơ nhân sự, Upload Lada: đủ các bước ý tưởng → BRD → thẩm định → Giám đốc duyệt.
Phân vân giữa hai làn → chọn làn CAO hơn (an toàn hơn).

<!-- may-loi-du-lieu -->
## Máy chạy sai luật đã chốt = LỖI, sửa luôn (Giám đốc chốt 22/11/2026 — áp dụng VĨNH VIỄN)
- Dữ liệu / kết quả máy tạo ra sai so với luật Giám đốc đã chốt (đếm sai, chia sai người, lọc sai nhóm…) là **lỗi** → **làn nhanh**:
  sửa cho đúng luật đã chốt, chạy lại hoặc đếm số bản ghi bị sai, báo NGẮN (lỗi gì · vì sao · đã sửa · bao nhiêu bản ghi). Không đụng dữ liệu
  đã đẩy sang hệ thống ngoài (Lada…) — chỉ liệt kê để người điều phối xử lý.
- KHÔNG biến lỗi thành đề xuất đổi luật, KHÔNG hỏi lại Giám đốc điều luật đã chốt, KHÔNG viết dài theo khuôn làn đầy đủ.
- Người báo hỏi thêm việc khác trong cùng báo cáo → ghi 1 dòng "Tách việc riêng: …", không gộp vào bản sửa lỗi.
- **`/v1/case-timeline?ma_don=` (2026-11-26, v1.567)**: tham số tuỳ chọn `ma_don=DDH-..,DDH-..` (≤20, chỉ nhận dạng `DDH-<số>`) — `buildCaseTimeline(db, caseId, maDon)` UNION thêm các đơn có `id` trong danh sách. DVBH gửi các mã DDH người dùng ghi ở ô "Mã xuất hàng liên quan" của giải trình để đơn trạm đặt không chọn mã ca vẫn hiện ở chi tiết ca DVBH (cùng nguồn khớp thứ 3 của `/v1/don-gan-nhat-theo-ca`).
- **`trang_thai_pxk` trong API đối tác (2026-11-26, v1.568)**: `/v1/case-timeline` (`OrderTimeline.trang_thai_pxk`) và `/v1/linh-kien/lich-su` trả thêm mã trạng thái phiếu chứa đơn — cùng biểu thức `TRANG_THAI_PXK_DON_SQL` (lib/trangThaiDonPxk.ts) với danh sách đơn hàng. DVBH dùng để hiện trạng thái mới nhất (đơn đã duyệt → theo phiếu).

**Kế toán sửa tiền cần chuyển 1 dòng PXK** (2026-11-26, v1.570 — "đơn này bị sai tiền, tiền chưa được kế toán duyệt thì cho phép sửa tiền", ảnh PMH-003012):
`PATCH /api/phieu-xuat-kho/:id/dong/:donId/tien` { tien: number | null, ly_do } (Kế toán / TN / Admin). Điều kiện: phiếu "Dang tao phieu" VÀ
`trang_thai_chuyen_tien <> 'TN da duyet'` (khác → 409 `KE_TOAN_DA_DUYET_TIEN`), phiếu không phải trả hàng, đơn thuộc phiếu. Ghi `dat_don_hang.gia_chot` = tien ÷ SL tính tiền
(không chia hết → `TIEN_KHONG_CHIA_HET_SL`; tien null = bỏ giá chốt), kiểm lại bằng `tinhToanPxk` — dòng không tính theo giá (công nợ, đơn đồng bộ bị trigger khoá)
→ trả giá cũ, 409 `DONG_KHONG_SUA_TIEN_DUOC`. Log phiếu 'Da sua tong tien can chuyen' + log đơn (trạng thái hiện tại) ghi tiền cũ → mới + lý do, rồi `taiTinhPxk`
(tự đặt lại chuyển tiền / `canBangPxk` hoàn-trừ quỹ). FE `PxkDongDonHangTable.tsx` `SuaTienCanChuyenDongModal`: Kế toán (không phải TN) bấm số tiền dòng; TN vẫn mở
`SuaTienDongModal`; cả hai chỉ bấm được khi chưa "Kế toán đã duyệt"; dòng có giá chốt hiện dấu ✎. Bối cảnh PMH-003012: DDH-004676 tạo 30/10 khi danh mục ghi giá 224đ
(`gia_de_xuat` 224) nên phiếu cũ PMH-001638 chỉ thu 190đ; giá sau sửa 224.000đ → phiếu mới tính 190.400đ (Đinh tủ −15%), còn thiếu 190.210đ.

**Cột "Hóa đơn" ở Danh sách Đơn hàng** (2026-11-26, v1.571 — "Danh sách đơn hàng, bổ sung thêm cột hóa đơn, có thể filter, tôi cần filter rồi tải về lấy ds các đơn xuất
hóa đơn cho khách hàng để làm báo cáo"): cột `yeu_cau_hoa_don` vốn có (lọc `DON_HANG_COT_LOC.yeu_cau_hoa_don` phía server) nhưng bị ẩn mặc định từ đợt gọn bảng 15/10 →
đưa vào `COT_CHINH` (`DonCuaToiTab.tsx`, hiện cả với người đã tuỳ chỉnh cột — `useColumnConfig` chèn cột mặc định mới), tiêu đề "Hóa đơn", nhãn
`YEU_CAU_HOA_DON_SHORT_LABELS` (rê chuột xem chuỗi đầy đủ), bộ lọc hiện nhãn ngắn + "— (chưa chọn)" cho đơn NULL. Nút "Tải danh sách chi tiết" đã gửi `locCot.queryParams`
nên file = đúng các đơn đang lọc. Số liệu D1 26/11: Không 8.180 · NULL 833 · HĐ không thu phí 81 · HĐ có thu phí 48 · HĐ xuất cho Trạm 17.

**Giá linh kiện B2B** (chốt 2026-11-27, v1.575 — "sửa lại logic, với linh kiện B2B không áp dụng chính sác 200-500k, chỉ có giá KTV hoặc giá niêm yết" → hỏi lại chốt:
"Linh kiện B2B ngoại trừ xuất hóa đơn, còn lại đều theo giá KTV, nếu chưa có giá KTV sẽ theo giá niêm yết"; tiền B2B "Vẫn cộng (giữ như cũ)" vào tổng ngày):
`tinhToanPxk` (`lib/pxkRecalculate.ts`) đọc `lk.nhom_lk`; thứ tự xét dòng: giá chốt > KH lẻ / đối tác > yêu cầu hóa đơn (trừ "xuất cho Trạm") > KH chuyển khoản >
**B2B** (`gia_tri_cong_no` > 0 → `GIA_KTV`, không thì `KHONG_CK` giá bán; `ck_co_so.ly_do = "b2b"`) > Đình tủ > dự phòng > bậc thang. Dòng B2B không vào nhóm giá dự phòng
(`duTru`). Bản sao FE: `useTaoDonForm.ts` `giaUocTinhDong` (nhãn "Giá KTV (B2B)", chưa có giá KTV → cảnh báo `chuaCoGiaKtv`), `CoSoChietKhau.tsx` câu giải thích "b2b",
`luongHeThong/noiDung.ts`. Phiếu đã Kế toán duyệt tiền giữ nguyên; phiếu đang mở đổi khi tính lại (lúc deploy chỉ PMH-003092 có dòng B2B). D1 27/11: 2.198 LK B2B, 398 có Giá KTV.

**Phiếu đủ tiền nhờ quỹ ở nhánh Kế toán từ chối → xét lại đơn "Chờ thanh toán"** (2026-11-27, v1.576 — người dùng gửi ảnh PMH-002984 + "check bug"): lỗi `DON_CHUA_DUYET`
"Phiếu còn 8 đơn chưa được TN duyệt". D1: phiếu `trang_thai_chuyen_tien = 'TN da duyet'` (log 'Tru quy du' "Đã thanh toán đủ từ trước — phiếu đã thanh toán đủ" sau
'Ke toan tu choi bang chung chuyen tien' 26/11 17:03) nhưng 8 đơn `Cho thanh toan`. Nguyên nhân: `canBangPxk` chỉ đặt `xuLyChoThanhToanSau` khi `tuDuyet`, nhánh
`khiTraDu "ke-toan"` (từ chối có quỹ đủ – v1.560; sửa thực nhận tăng) bỏ sót. Sửa: điều kiện `(tuDuyet || khiTraDu === "ke-toan")` (đường duyệt khoản gọi lại
`xuLyDonChoThanhToan` lần 2 = no-op); cổng "Cho ke toan" trong `phieuXuatKho.ts` gọi `xuLyDonChoThanhToan` trước khi kiểm (phiếu đã "TN da duyet") rồi đọc lại
tiền phiếu — tự gỡ phiếu đã kẹt, không cần sửa tay D1. D1 27/11: chỉ PMH-002984 có đơn "Chờ thanh toán" trong phiếu "TN da duyet".

## Tạm dừng đẩy sang Kho vận (v1.577, 2026-11-27)

- Yêu cầu: "Tắt đẩy Kho vận" — sau lỗi đồng bộ `ktv->khovan` 401 (khoá `KHOVAN_SYNC_API_KEY` đổi 27/11, khovan đang tạm dừng nên không nhận khoá mới).
- Cơ chế: var `KHOVAN_TAM_DUNG="1"` (`wrangler.jsonc`) → `khovanTamDung(env)` (`lib/khovanPushClient.ts`): `pushPxkToKhovan`, `pushThieuLkToKhovan`,
  `updateKhovanBoxStatus` (qc_rejected/received/handed_over) không gọi mạng; `pushTraHangToKhovan` trả `{ ok: true }` (Kế toán duyệt trả hàng không bị chặn);
  `dvbhSyncClient.ts` `dichDangBat()` bỏ dịch "khovan" khỏi chạy đồng bộ, số "đang chờ" và "lần đồng bộ gần nhất".
- Bật lại: xoá var (hoặc khác "1") + đồng bộ khoá `KHOVAN_SYNC_API_KEY` với khovan + deploy. Con trỏ `dvbh_sync_state` (ktv, khovan) giữ nguyên → bật lại sẽ gửi bù.
- Code nằm ở commit ec0cc4e (nhãn commit ghi nhầm "v1.575" do trùng lúc phiên khác cũng ra v1.575/v1.576) + commit tài liệu v1.577.
