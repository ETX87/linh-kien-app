# Nhật ký làm việc — hệ "Đặt mua linh kiện" (độc lập)

## Phiên 1 (2026-08-19) — Tách hệ thống khỏi DVBH gốc

**Yêu cầu**: tách toàn bộ module "Đặt mua linh kiện" (+ Phiếu xuất kho, Trả hàng, Thiếu linh kiện,
Báo cáo, Danh mục linh kiện, các settings liên quan) khỏi hệ DVBH gốc thành 1 hệ Cloudflare
Workers + D1 hoàn toàn độc lập — tự có domain/Worker/database/OAuth/users riêng. Điểm kết nối DUY
NHẤT với hệ cũ: gọi API lấy thông tin 1 case sự cố theo ID (tra cứu, không ghi). Yêu cầu gốc (tiếng
Việt, nguyên văn ý chính): sau khi xong, mở phiên AI mới và triển khai sẽ có đúng giao diện/tính năng
như hệ gốc, không tự suy đoán nếu có điểm chưa rõ.

**Quyết định đã chốt qua hỏi đáp với người yêu cầu** (xem lịch sử hội thoại phiên này để tra lại
nguyên văn nếu cần):
- Auth độc lập hoàn toàn (Google OAuth app riêng, `users` riêng).
- KHÔNG di chuyển dữ liệu lịch sử — hệ mới bắt đầu rỗng.
- Số phận hệ hiện tại: CHƯA QUYẾT, để bàn sau — không đụng code/deploy hệ gốc trong đợt này, ngoại
  trừ 1 endpoint API mới bổ sung thuần tuý.
- Danh bạ KTV: copy 1 lần lúc triển khai, sau đó không đồng bộ tiếp — áp dụng luôn cho các bảng
  tham chiếu khác (`linh_kien`, settings) theo cùng logic.
- Phạm vi API kéo về: CHỈ dữ liệu case sự cố theo ID.

**Kết quả phiên này**: toàn bộ mã nguồn (backend + frontend + migration + scaffold + tài liệu) đã
viết xong trong thư mục này, sẵn sàng deploy — CHƯA provision tài nguyên Cloudflare/Google thật (xem
`DEPLOY.md`), CHƯA chạy `npm run typecheck`/dev server để xác minh biên dịch sạch (việc còn lại cho
phiên tiếp theo hoặc trước khi deploy thật).

**Vài quyết định lệch khỏi bản kế hoạch ban đầu** (đã cân nhắc, ưu tiên giảm rủi ro port hơn là khớp
100% văn bản kế hoạch):
- Giữ nguyên bảng `phieu_dat` (header vestigial của hệ gốc, không còn ý nghĩa nghiệp vụ thật) thay vì
  loại bỏ hẳn như kế hoạch — vì `dat_don_hang.id` vẫn sinh qua `id_counters` với key lịch sử
  `"phieu_dat"`, loại bỏ bảng sẽ phải viết lại logic sinh ID ở nhiều điểm trong
  `routes/datMuaLinhKien.ts`, rủi ro cao hơn lợi ích.
- Giữ nguyên schema đầy đủ `ktv_lien_he` (gồm cả `sdt`/`ghi_chu` vốn là dữ liệu đặc thù CSKH của hệ
  gốc) thay vì cắt gọn — không tốn kém gì để giữ, giảm rủi ro port.
- Sửa 1 CHECK constraint lỗi thời phát hiện được lúc port: `dat_don_hang_log.trang_thai` ở hệ gốc
  thiếu giá trị `'Cho TBP xac nhan'` dù code đã dùng từ 2026-08-17 (migration 0082 hệ gốc) — thêm
  đúng ngay từ đầu trong `migrations/0001_init.sql` của hệ mới.

**Việc còn lại trước khi hệ này có thể dùng thật** — xem checklist đầy đủ trong `DEPLOY.md`: tạo
Google OAuth Client thật (Drive dùng chung, không cần Service Account riêng — xem CLAUDE.md), `wrangler d1 create`, đặt secrets, deploy route
`/api/partner/case-lookup` bên hệ gốc (đã viết code, CHƯA deploy), tạo API key đối tác, copy dữ liệu
tham chiếu 1 lần, deploy Worker lần đầu, đăng nhập bằng `BOOTSTRAP_ADMIN_EMAIL` và khai báo vai trò
cho người dùng thật.

## 2026-11-11 — API `POST /api/partner/v1/don-loi-loc` (v1.469)

- Hệ DVBH (menu "QL NSKX") gửi danh sách mã ca NSKX (+ cặp ID Lada) sang, nhận lại đơn loại "HỖ TRỢ NGOÀI BẢO HÀNH TG12…" còn hiệu lực
  (bỏ đơn huỷ/từ chối) để biết ca nào đã đặt lõi lọc. 3 nhánh khớp đều qua index (dat_don_case, ma_yeu_cau_su_co, ma_lada). Tài liệu §4.16.

## 2026-11-11 — API đặt hàng: đặt thay đúng người bấm (v1.473, migration 0115)

- Hệ DVBH (QL NSKX) đặt lõi lọc "HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX" qua `POST /v1/dat-hang`; chủ hệ thống chốt người đặt = tài khoản người bấm bên DVBH.
- Thêm `partner_api_keys.dat_thay_nguoi_dung` + trường body `email_nguoi_dat` (cả `/kiem-tra`); Admin bật ở popup "Tài khoản đặt hàng" (Cài đặt › API đối tác).
  Key chưa bật mà gửi → 403 `KEY_KHONG_DUOC_DAT_THAY_NGUOI_DUNG`. Quyền vẫn do `taoPhieuDat()` kiểm (GS/TN/Admin đặt hộ được).
- Thử local (DVBH → linh-kien-app): 1 ca 2 dòng + 20 ca 40 dòng (2 phiếu 30 + 10) đúng người tạo / người nhận / mã YCSC / partner_key_id;
  gửi lại cùng `ma_yeu_cau` → `trung_lap`; key tắt cờ → 403; email không có → 403.
- **Việc của Admin sau deploy**: bật "đặt thay đúng người bấm" cho khóa API mà DVBH đang dùng.


## 2026-11-17 — Rà soát "đổi tên trạm/KTV làm tách dòng báo cáo" (không sửa code)

Bối cảnh: chủ hệ thống đổi tên trạm hàng loạt bên Odoo; app DVBH bị tách dòng báo cáo KTV và đã sửa ở v1.621 (gom theo `(ma)`).
Rà soát app này: mọi báo cáo/gom/lọc KTV dùng `ma_ktv` (`ktv_lien_he`, khoá chính) hoặc email người nhận (`dat_don_hang.nguoi_nhan_hang`,
`congNoKtv`/`duPhongKtv` GROUP BY `ma_ktv`); tên hiển thị lấy từ `ktv_lien_he.ten_hien_thi` (1 dòng/mã). Chuỗi `ky_thuat_vien` của DVBH chỉ
dùng để hiện trên từng ca (tra cứu trực tiếp, luôn là tên mới nhất) và để khớp KTV khi kiểm tra mã YCSC — đã trích `(ma)` qua `lib/ktvCode.ts
extractMaKtv`. → Không bị ảnh hưởng, không cần sửa.
Dữ liệu thật (SELECT D1 remote): 1.211 mã KTV, 0 mã trùng theo hoa/thường. 2 dòng có `ten_hien_thi` lệch mã (`huytp.ctv-kdtt` mang tên
"(huytp.kdtt)…", và 1 dòng `ma_ktv` dính cả hàng dữ liệu dán có tab "NS-487…") — lỗi nhập liệu danh bạ, chưa sửa (cần người quyết).


## 2026-11-17 — SLA từng bước, quá hạn, giải trình, gắn thẻ vi phạm + API đối tác (v1.517, migration 0125)

**Yêu cầu (quản lý, nguyên văn)**: "A. App đặt linh kiện 1. Trả key API cũ 2. API: Bổ sung: Trả hàng - Các ca quá hạn - giải trình liên quan /
Đặt linh kiện - Các ca quá hạn / Các ca bị gắn thẻ vi phạm 3. Cải tiến Trả hàng … thiếu giải trình gắn thẻ → Đổ về App Tổng hợp vi phạm / Đặt
hàng: … 4. Cải tiến đặt hàng: Trạng thái ghi rõ thuộc bước nào, Đặt SLA từng bước, Các ca quá hạn xử lý 5. Có tình huống nào xử lý loằng
ngoằng ko? Chuyển kho thì ntn?". Chốt thêm: "app vi phạm là 1 app bên ngoài … chỉ cần các thông tin ghi nhận vi phạm trên app linh kiện" →
"triển khai theo hướng mở để đối tác tự kéo, chúng ta cung cấp api là đc".

**Đã làm**: `migrations/0125_vi_pham_sla.sql` (`sla_buoc`, `vi_pham`, `vi_pham_quet`); `lib/viPham.ts` (12 bước, tính hạn, quét theo mốc id
log, giải trình tự động từ lý do chậm, gắn thẻ); `routes/viPham.ts` `/api/vi-pham` (danh sách + lọc cột kiểu Excel, đếm, giải trình, gỡ thẻ,
cấu hình SLA, quét ngay); cron mỗi giờ; `GET /api/partner/v1/vi-pham` + `/v1/vi-pham/buoc` (tài liệu API 1.8 §4.18); badge
`viPhamCanGiaiTrinh`; FE `modules/ViPhamModule.tsx` (menu "Quá hạn & vi phạm", tab theo trạng thái, chi tiết luồng ngang + "Xem chi tiết",
hộp giải trình / gỡ thẻ, Cấu hình SLA); dịch EN/ID.

**Kiểm thử (local, D1 dev)**: quét lần đầu ghi 65 ca đang quá hạn, lần 2 không trùng; đơn trả hàng rời bước kèm lý do chậm → tự "Đã giải
trình" + ghi người / lúc rời bước; hạn giải trình qua → "Gắn thẻ"; giải trình lần 2 → 409, giải trình sau gắn thẻ → `DA_GAN_THE`; gỡ thẻ OK;
API đối tác: con trỏ trang 2 nối đúng, lọc trạng thái/loại, bước sai 400, thiếu key 401; giao diện: giải trình qua form lưu đúng tiếng Việt,
chi tiết hiện 4 mốc, lưu cấu hình SLA. Typecheck 2 phía sạch.

**Còn dở / cần quản lý chốt**: số giờ SLA thật (đang mặc định 24h, Mua hàng 48h, giải trình 24h); bước của KTV chưa tính; "Trả key API cũ"
(key chỉ lưu băm — cần nói rõ cấp lại hay thu hồi); chuyển kho nội bộ chưa có luồng thật; lý do chậm bắt buộc của trả hàng vẫn cố định 24h
(đổi SLA trả hàng ở cấu hình không đổi chỗ bắt buộc đó). Chưa cập nhật nội dung tĩnh "Luồng & logic hệ thống".

## 2026-11-17 — Giải trình quá hạn: người phụ trách cụ thể, thông báo, báo không đúng, tổng hợp + tài liệu HTML (v1.518, migration 0126)

**Yêu cầu (nguyên văn)**: "1. tôi cần phân rõ được tồn theo vai trò nào, ai là người cần giải trình, và nếu họ cần giải trình thì họ làm sao biết
được cần giải trình ở đâu, giải trình như thế nào, xác định được đơn chưa giải trình, đã giải trình, gặp về đề, cần theo dõi như thế nào?
2. Rà soát lại toàn bộ các bước quy trình giải trình tồn theo từng vai trò 3. Xây đựng tài liệu html chi tiết theo từng bước giải trình có hình
ảnh hướng dẫn theo từng vai trò".

**Rà soát v1.517 thấy hở**: "Cần tôi" theo cả bộ phận (Kho MB thấy ca MN, GS thấy ca GS khác); không có thông báo; mở đơn không thấy quá hạn;
giải trình chữ tự do, không có đường báo ghi nhận sai; không có màn theo dõi tồn theo bộ phận / người.

**Đã làm**: migration `0126` (dựng lại `vi_pham`: `nguoi_phu_trach`, `ly_do`, `bao_luc`, `nhac_luc`, `khieu_nai*`, trạng thái `Cho xem xet`);
`lib/viPham.ts` (`nguoiPhuTrach`, thông báo gộp theo người, nhắc 6h); `routes/viPham.ts` (tab của tôi / chờ xem xét, giải trình có lý do, báo
không đúng, Admin xử lý, theo đối tượng, tổng hợp); badge theo người phụ trách; FE `modules/viPham/ViPhamUi.tsx` + banner trong 4 màn chi
tiết + chuông / push mở đúng tab; dịch EN/ID; tài liệu `docs/Huong_dan_giai_trinh_qua_han_theo_vai_tro.html` (16 ảnh); API đối tác 1.9.

**Kiểm thử (local)**: quét gán đúng người (Kho MB2 chỉ nhận ca MB2, Kho không gán khu vực nhận phần còn lại, GS 2 ca, TN không có ai →
Kế toán); thông báo gộp 1 dòng / người, quét lại không gửi trùng, đổi người phụ trách → báo người mới; nhắc khi còn ≤ 6h; giải trình thiếu
lý do → 400; báo không đúng → chặn giải trình khi đang chờ xem xét (409); Admin chấp nhận → Đã gỡ thẻ, từ chối → Chờ giải trình hạn mới +24h;
tổng hợp khớp; giao diện 4 vai trò (Kho, GS, Kế toán, Admin) + điện thoại + banner trong chi tiết đơn / phiếu; typecheck 2 phía sạch.

**Còn dở / cần chốt**: số giờ SLA thật; bước KTV; bước "TN gửi kế toán" và "Kho đã tiếp nhận — chờ hàng về" chưa tính; lý do chậm trả hàng cố
định 24h; chỉ Admin gỡ thẻ / xem xét; nhân sự chưa gán khu vực dễ bị dồn ca.

## 2026-11-18 — Bỏ bước Admin xem xét / gỡ thẻ; ghi nhận sai = giải trình; chỉ BO giải trình (v1.519)

**Yêu cầu (nguyên văn)**: "việc giải trình không đúng cũng chỉ tính là giải trình thôi, không cần phải thêm vai trò của admin. admin không thực
hiện công việc xác nhận bỏ thẻ trên hệ thống này" + "2. KTV không cần giải trình, BO tham gia việc giải trình là được".

**Đã làm**: bỏ route báo không đúng / Admin xử lý / gỡ thẻ, tab "Chờ Admin xem xét" + "Đã gỡ thẻ", các nút + hộp tương ứng, cột khiếu nại / gỡ
thẻ ở API; thêm lý do "Ghi nhận không đúng / không thuộc trách nhiệm" đầu danh sách + dòng gợi ý trong hộp giải trình; thông báo không còn nhắc
"Báo không đúng"; tài liệu HTML viết lại mục 1, 6, 8, 9, 11, 12 + chụp lại 13 ảnh; API đối tác 2.0. KTV vốn không có bước nào → không đổi code,
ghi rõ trong tài liệu. Không migration (cột / giá trị CHECK cũ để nguyên, không dùng).

**Kiểm thử (local)**: giải trình với lý do "Ghi nhận không đúng" → "Đã giải trình"; 3 route cũ → 404; `/dem` không còn số chờ xem xét / đã gỡ;
giao diện Kho / GS / Kế toán / Admin / điện thoại chụp lại; typecheck 2 phía sạch. Production lúc làm không có ca nào ở trạng thái 'Cho xem
xet' / 'Da go the'.

## 2026-11-18 — QC chỉ thấy phiếu xuất của chính mình (v1.520)

- **Yêu cầu (nguyên văn):** "fix lại tài khoản QC đang nhìn thấy phiếu chờ nhận hàng và các phiếu khác của tất cả KTV"
- **Nguyên nhân:** `scopePxkNguoiNhanHang()` (`lib/scopeDatMua.ts`) xếp `vai_tro='QC'` vào nhóm không giới hạn (như TN/Kho/Kế toán) từ trước khi QC được đặt hàng như KTV (v1.451) → menu Phiếu xuất (Tổng phiếu, Chờ KTV nhận 99+…) hiện phiếu của mọi KTV.
- **Đã sửa:** bỏ QC khỏi nhóm không giới hạn → QC thuần chỉ thấy phiếu có người nhận hàng = chính mình (danh sách, số đếm menu, Ctrl+K, nhận thiếu). Chi tiết phiếu vẫn mở được khi phiếu chứa đơn QC xem được (quy tắc v1.443). Tài khoản QC kiêm TN/Kho/Kế toán/Mua hàng/Admin giữ quyền theo vai trò kia. Phạm vi ĐƠN của QC (đơn trả hàng chờ QC xác nhận) không đổi.
- **Kiểm thử:** typecheck backend 0 lỗi. Chưa xem bằng mắt trên giao diện.

## 2026-11-18 — "KH đã chuyển khoản về công ty" không cần xuất hóa đơn, tính giá niêm yết (v1.521)

- **Yêu cầu (nguyên văn):** "đặt hàng cần chuyển tiền, cho phép tích chọn KH chuyển tiền kể cả không xuất hóa đơn => kiểm tra các rủi ro có thể => phân tích"; sau phân tích chốt giá: "Giá niêm yết".
- **Đã làm:**
  - Bỏ điều kiện phải chọn hình thức hóa đơn: form (`duocTichKhChuyenKhoan`), tạo đơn (`KH_CHUYEN_KHOAN_CAN_HOA_DON`), sửa đơn (không còn chặn bỏ hóa đơn). Vẫn chỉ đơn mua / TRỪ CÔNG NỢ không đối tác.
  - Giá: đơn tích ô này tính giá niêm yết, nhãn `KHONG_CK`, lý do `kh_chuyen_khoan` (`tinhToanPxk`), không dùng giá dự phòng; form tạo đơn (`giaUocTinhDong`), chip "KH chuyển khoản · giá niêm yết" và giải thích ở `CoSoChietKhau.tsx` theo cùng quy tắc. Áp cả "HĐ - Xuất cho trạm" (trước được chiết khấu).
  - Đổi tên hiển thị quỹ "Quỹ xuất hóa đơn do KH chuyển" / tab "Quỹ KH chuyển (HĐ)" → "Quỹ KH chuyển khoản" (khoá `khhd:` giữ nguyên); thêm bản dịch EN/ID.
- **Rủi ro đã xem:** tách quỹ / phiếu / trigger không phụ thuộc hóa đơn; tổng ngày chiết khấu không đổi; MISA vẫn ghi khách là KTV (Kế toán nhận biết qua nhãn "KH chuyển khoản" trên phiếu); quỹ KH dư thì Kế toán "Hoàn tiền cho KH".
- **Kiểm thử:** typecheck backend + frontend 0 lỗi. D1 production (chỉ đọc): 8 đơn đang tích ô này, 0 đơn "HĐ - Xuất cho trạm" → không đơn cũ nào đổi giá. Chưa bấm thử trên giao diện.

## 2026-11-18 — Form tạo đơn sửa chữa: ẩn ô "KH chuyển khoản", ưu tiên 3 loại sửa chữa (v1.522)

- **Yêu cầu (nguyên văn):** "1. KTV sủa chữa không hiện tích 2. Ưu tiên hiện 3 lựa chọn phân loại đơn sửa chữa cho nv sửa chữa"
- **Đã làm:**
  - Ô "Khách hàng đã chuyển khoản về công ty" ẩn hẳn với đơn sửa chữa (CÔNG NỢ SỬA CHỮA / HỖ TRỢ SỬA CHỮA 0 ĐỒNG / MUA HÀNG SỬA CHỮA) — `KhChuyenKhoan.tsx`; server cũng chặn cờ này với đơn sửa chữa (`KH_CHUYEN_KHOAN_CHI_DON_MUA`).
  - Người nhận là NV sửa chữa: hàng nút chọn nhanh loại đề xuất đưa cả 3 loại sửa chữa lên đầu (`ldeNhanh` ở `helpers.ts`), trước chỉ có CÔNG NỢ SỬA CHỮA, 2 loại kia nằm trong "Loại khác".
- **Kiểm thử:** typecheck backend + frontend 0 lỗi. Chưa bấm thử trên giao diện.

## 2026-11-18 — Sửa lại v1.522: không ẩn ô "KH chuyển khoản" với đơn sửa chữa (v1.523)

- **Yêu cầu (nguyên văn):** "sai ý tôi rồi, ý tôi là sao nó không hiện" — người dùng hỏi vì sao ô không tích được, không phải muốn ẩn.
- **Giải thích:** ô chỉ dành cho đơn cần chuyển tiền; ảnh đang chọn HỖ TRỢ SỬA CHỮA 0 ĐỒNG (0đ) nên ô mờ. MUA HÀNG SỬA CHỮA vẫn tích được.
- **Đã làm:** gỡ phần ẩn ô + chặn server của v1.522 (giữ ưu tiên 3 loại sửa chữa). Câu dưới ô khi bị mờ ghi rõ "Loại đề xuất đang chọn không cần chuyển tiền nên không tích được — chỉ áp dụng cho đơn cần chuyển tiền (Mua hàng, Mua hàng sửa chữa, Trừ công nợ)" (+ EN/ID).
- **Kiểm thử:** typecheck backend + frontend 0 lỗi. Chưa bấm thử trên giao diện.

## 2026-11-18 — Hàng trả tự hủy chờ Kho 10 ngày, "Tồn CEO", API danh sách Tồn CEO (v1.524, migration 0127)

**Yêu cầu (nguyên văn):** "1. bước chờ kho (trả hàng) => đơn quá hạn 10 ngày cho vào danh sách hủy bỏ (do KTV không gửi hàng). không đếm
trong danh sách cần xử lý nữa. vẫn có thể vào danh sách đơn tự hủy để tìm nếu sau này hàng về muộn. (chia tab đơn đang chờ, đơn tự hủy)
2. Đơn sau mốc hạn giải trình mà không giải trình sẽ chuyển sang trạng thái tồn CEO sau khi hết Hạn giải trình (giờ)) 3. Danh sách các đơn
bị lỗi tồn CEO sẽ bắn API sang cho đối tác. tương tự như cách app DVBH đang bắn đơn tồn CEO sang app vi phạm của đối tác (bên ngoài)"

**Đã làm:**
- `traHangTuHuySql()` (`lib/hanLyDoCham.ts`): đơn trả hàng "Cho kho xac nhan" quá 10 ngày từ lúc vào bước = tự hủy, TÍNH LÚC ĐỌC (không đổi trạng thái → hàng
  về muộn Kho xác nhận bình thường). Loại khỏi: lọc "Cho kho xac nhan", `__CHO_XAC_NHAN__`, `__OPEN__`/còn tồn (`donConTonSql`), số đếm menu, badge
  `choKhoTraHang`, Trang chủ (đang tồn / toàn hệ thống), `/loai-don-counts`. Sentinel mới `__TU_HUY_KHO__` + cột `tu_huy_qua_han`. FE: Hàng trả › Chờ Kho có 2 tab
  "Đơn đang chờ" / "Đơn tự hủy (quá 10 ngày)", badge "Tự hủy — quá 10 ngày".
- Vi phạm: `Gan the` → `Ton CEO` (migration 0127 dựng lại bảng `vi_pham`, đổi dữ liệu cũ), nhãn / thông báo "Tồn CEO". API `/v1/vi-pham` vẫn nhận lọc `Gan the`,
  thêm `ton_ceo`, `ton_ceo_luc`.
- `GET /api/partner/v1/danh-sach-ton?loai=ton-ceo` cùng hình dạng API `danh-sach-ton?loai=canh-bao-ceo` của DVBH (DVBH cũng để đối tác KÉO, không đẩy) — tài liệu §4.19.

**Kiểm thử (Worker + D1 local):** đơn chờ Kho 11 ngày → chỉ ở `__TU_HUY_KHO__`, đơn 3 ngày ở "Chờ kho" (counts 1/1, `choKhoTraHang` = 1); quét vi phạm →
ca hết hạn giải trình thành `Ton CEO`, API danh sách Tồn CEO trả đúng, `trang_thai=Gan the` vẫn ra; giao diện 2 tab xem bằng mắt.

**Còn lại:** app vi phạm phía đối tác cần thêm bước kéo API mới. Ca vi phạm bước "Kho xác nhận (trả hàng)" của đơn tự hủy vẫn giữ như cũ.

## 2026-11-18 — Con trỏ cho API danh sách Tồn CEO (v1.525)

**Yêu cầu (nguyên văn):** "để tránh việc ca vi phạm cấp CEO bị đối tác kéo đi kéo lại mỗi ngày, có giải pháp nào để trách 1 ca bị kéo lại liên tục khoonng?" → chọn "Thêm con trỏ".

**Đã làm:** `GET /api/partner/v1/danh-sach-ton?loai=ton-ceo` nhận `cap_nhat_tu` (+ `after_id`, `limit` ≤ 500): chỉ trả ca có `cap_nhat_luc` sau mốc, thứ tự `cap_nhat_luc, id`, luôn trả
`next` (không có ca mới → giữ con trỏ cũ). Không gửi con trỏ = như cũ (theo ngày). Tài liệu đối tác §4.19 bản 2.2.

**Kiểm thử (Worker + D1 local, 3 ca Tồn CEO):** trang 2 ca + `con_nua` → trang sau ra ca còn lại; gọi lại với `next` cuối → rỗng, con trỏ giữ nguyên; giả lập đơn rời bước → chỉ ca đó tới lại 1 lần (`con_ton: false`);
con trỏ sai dạng → `INVALID_CAP_NHAT_TU`; không con trỏ → như cũ.

## 2026-11-18 — Không tính Tồn CEO cho Kho với đơn trả hàng tự hủy (v1.526)

**Yêu cầu:** sau khi báo 41 ca Tồn CEO ở bước "Kho xác nhận (trả hàng)" phần lớn do KTV chưa gửi hàng, chủ hệ thống chọn "Có, loại trừ".

**Đã làm:** `quetViPham` (`lib/viPham.ts`), trước bước chuyển Tồn CEO: ca `th_kho` còn đang chờ của đơn tự hủy (`traHangTuHuySql`, chờ Kho > 10 ngày) → "Da giai trinh",
tự động, lý do `LY_DO_TU_HUY_TRA_HANG`, bỏ `gan_the_luc`; cả ca đã Tồn CEO. `ket_thuc_luc` giữ NULL — hàng về muộn Kho xác nhận thì vẫn ghi lúc rời bước. Tài liệu API 2.3.

**Kiểm thử (Worker + D1 local):** đơn chờ Kho 11 ngày — 2 ca (1 Tồn CEO, 1 chờ giải trình) → "Đã giải trình" kèm lý do, rời danh sách Tồn CEO API; đơn 3 ngày giữ nguyên; quét lại không đổi.

**Lưu ý:** từ khoảng ngày 2 (hết SLA 24h + giải trình 24h) tới ngày 10 ca vẫn là Tồn CEO, tới ngày 10 tự gỡ. 41 ca hiện tại trên production chưa ca nào quá 10 ngày.


## 2026-11-19 — SLA tính theo giờ làm việc (v1.527, migration 0128)

**Yêu cầu (nguyên văn):** "các logic quá hạn SLA trên toàn bộ hệ thống từ 24h =>8h, 48h => 16h làm việc (loại trừ 8h chủ nhật và 4h chiều thứ 7)."

**Đã làm:**
- `backend/src/lib/gioLamViec.ts`: giờ làm việc T2–T6 08:00–12:00 + 13:00–17:00, T7 08:00–12:00, CN nghỉ (44h/tuần); hàm cộng giờ làm việc + đếm giờ làm việc giữa 2 mốc.
- Hạn "Lý do chậm" của TN (đơn + chặn gửi kế toán) và hạn 4 giai đoạn trả hàng: 24h lịch (dời qua T7/CN) → 8 giờ làm việc.
- Quá hạn & vi phạm: hạn SLA + hạn giải trình theo giờ làm việc; migration 0128 đổi `sla_buoc` 24 → 8, 48 → 16; "trễ X giờ" theo giờ làm việc; nhắc sắp hết hạn giải trình khi còn ≤ 2 giờ làm việc; cột cấu hình "Tính cuối tuần" đổi thành "Giờ lịch 24/7".
- Nhãn giao diện "quá hạn 24h" → "quá hạn 8h làm việc" (+ bản dịch EN/ID), mục Luồng & logic hệ thống, tài liệu API đối tác, TONG_HOP_LOGIC, Yêu cầu tổng hợp.

**Kiểm thử:** typecheck backend + frontend 0 lỗi; chạy hàm trên node: T2 09:00 + 8h → T3 09:00; T6 14:00 + 8h → T2 09:00; T7 10:00 + 8h → T2 15:00; CN 10:00 + 8h → T2 17:00; T6 09:00 + 16h → T2 14:00; T2 12:30 + 8h → T3 12:00; giờ làm việc T6 17:00 → T2 09:00 = 5h. Chưa xem giao diện.

**Lưu ý / còn dở:** chưa trừ ngày lễ; giờ nghỉ trưa chọn 12:00–13:00 (đổi ở `CA_LAM_VIEC`). Hạn ngắn hơn ~3 lần → lần quét đầu sau khi deploy sẽ ghi nhận thêm nhiều ca quá hạn + gửi thông báo giải trình cho bộ phận.
- Bổ sung cùng ngày (migration 0129, chủ hệ thống chốt "Đổi sang 40h"): bước "Kho xác nhận trả hàng" trên production đang đặt 120 giờ → 40 giờ làm việc (sau 0128 số 120 bị hiểu là 120 giờ làm việc ~2,7 tuần). Production sau 0128: hạn giải trình 48 → 16, "Mua hàng đặt hàng" 24 → 8, "QC trả hàng" → 16.

## 2026-11-19 — Đổi sang LK tương đương bỏ giá chốt của mã cũ (v1.528)

**Yêu cầu (nguyên văn):** "check giúp tôi logic này tại sao đơn này mua dữ trữ mà đến kế toán giá lại không đúng" → đồng ý hướng sửa ("ok").

**Nguyên nhân:** DDH-007748 (MUA DỰ TRỮ, phiếu PMH-002733) đặt mã 2003030346, TN nhập tay giá chốt 425.000 (= giá dự phòng mã cũ).
Kho đổi sang mã tương đương 2003030291 (giá dự phòng 515.000) — lệnh đổi mã chỉ sửa mã / tên / giá bán, giữ `gia_chot` → phiếu tính
425.000 × 2 = 850.000 thay vì 1.030.000 (thiếu 180.000). Nhãn "Giá dự phòng (trong hạn mức)" che mất việc đang dùng giá chốt tay.

**Đã làm:**
- `applyThieuLkLog` (`datMuaLinhKien.ts`): đổi LK tương đương → `gia_chot = NULL` trong cùng lệnh đổi mã, log ticket ghi "bỏ giá chốt …đ của mã cũ".
- `PxkDongDonHangTable.tsx`: cột Loại chiết khấu có nhãn chấm "Giá chốt tay" (rê chuột xem số) khi dòng đang áp giá chốt.

**Chưa làm:** dữ liệu PMH-002733 giữ nguyên (phiếu đã "Đã chốt xong đơn xuất", có mã MISA) — muốn thu đủ thì Kế toán đẩy lùi phiếu rồi sửa giá.
Dòng DDH-007749 cùng phiếu có giá chốt tay 320.000 < giá dự phòng 390.000 — do người nhập, không phải lỗi hệ thống.

**Kiểm thử:** typecheck backend + frontend 0 lỗi. Chưa chạy thử thao tác đổi mã trên giao diện.

## 2026-11-19 — Popup nhắc giải trình khi mở app (v1.529)

**Yêu cầu (nguyên văn):** "Hệ thống tự quét mỗi giờ. Ca quá hạn sẽ báo đích danh người phải giải trình, và nhắc lại khi còn 6 giờ là hết hạn giải trình. đẩy qua thông báo, khi mở sẽ hiện popup nhắc nhở."

**Đã làm:** quét mỗi giờ + báo đích danh + nhắc sắp hết hạn + đẩy chuông/push đã có từ v1.518 (ngưỡng nhắc đang là 2 giờ làm việc từ v1.527, tương đương 6 giờ lịch cũ — không đổi). Thêm `frontend/src/modules/viPham/NhacGiaiTrinhPopup.tsx` gắn ở `App.tsx`: nhân viên văn phòng mở app mà còn ca "Chờ giải trình" có tên mình (`GET /vi-pham?tab=can_toi`, hỏi lại 5 phút / khi quay lại tab) → popup: tổng số ca, số ca sắp hết hạn (khung đỏ), tối đa 20 ca kèm hạn + nút "Giải trình" (mở hộp giải trình có sẵn), nút "Mở danh sách cần giải trình". "Để sau" / ✕ = ẩn trong phiên (sessionStorage) — mở app lại, có ca mới hoặc ca chuyển sang sắp hết hạn thì hiện lại. Không đổi backend.

**Kiểm thử:** typecheck frontend 0 lỗi, build sạch. Worker local + phiên ký tay tài khoản Kho test (46 ca chờ): popup hiện đúng số ca / 20 ca sắp hết hạn; "Để sau" rồi tải lại trang không hiện lại; xoá phiên → hiện lại; "Mở danh sách" mở menu "Quá hạn & vi phạm" tab "Cần tôi giải trình". Chưa thử trên điện thoại.

## 2026-11-19 — Ngưỡng nhắc sắp hết hạn giải trình: 6 giờ làm việc (v1.530)

**Yêu cầu (nguyên văn):** "Đổi sang 6 giờ"

**Đã làm:** `GIO_NHAC` (`backend/src/lib/viPham.ts`) 2 → 6 giờ làm việc: ca còn ≤ 6 giờ làm việc là hết hạn giải trình được nhắc 1 lần (chuông + đẩy). Hạn giải trình mặc định 8 giờ làm việc nên lời nhắc tới khoảng 2 giờ làm việc sau khi ghi nhận ca. Popup khi mở app coi ca là "sắp hết hạn" khi đã được nhắc (`nhac_luc`) hoặc còn ≤ 6 giờ lịch.

**Kiểm thử:** typecheck backend + frontend 0 lỗi. Ca đã được nhắc trước đây không nhắc lại (mỗi ca nhắc 1 lần).

## 2026-11-19 — Quá hạn & vi phạm: Tác nghiệp không còn là người phải giải trình (v1.531, migration 0130)

**Yêu cầu (nguyên văn):** "các ca này đang bị đẩy sang cho vai trò tác nghiệp xử lý, nhưng hiện tại TN không còn tham gia nữa => kiểm tra lại logic" (ảnh màn "Cần tôi giải trình": 7 ca Kho + 1 ca "Duyệt đơn (Tác nghiệp)").

**Nguyên nhân:** (1) 1 tài khoản Tác nghiệp có bật thêm cờ Kho (để thao tác hộ) nên được tính là người của bộ phận Kho → nhận mọi ca Kho miền Nam (56 ca Chờ giải trình / Tồn CEO). (2) Bước "Chờ TN duyệt" / "Chờ TN duyệt tổng" (trả hàng) vẫn giao người có cờ Tác nghiệp, chỉ chuyển Kế toán khi không còn TN nào.

**Đã sửa:** `nguoiPhuTrach()` (`lib/viPham.ts`): bộ phận `tn` → Kế toán; người có cờ Tác nghiệp mà không phải Kế toán bị loại khỏi Kho / Mua hàng / QC / TBP / GS (loại xong không còn ai thì giữ danh sách cũ). Tên bước / bộ phận: "Duyệt đơn (Kế toán thay TN)", "Duyệt tổng trả hàng (Kế toán thay TN)", "Kế toán (thay Tác nghiệp)". Migration `0130` sửa 1 lần các ca đang mở. Tài liệu hướng dẫn HTML sửa 2 dòng bảng bước.

**Kiểm thử:** typecheck 0 lỗi; migration chạy trên D1 local (ca TN → Kế toán test); xem trước trên D1 thật bằng SELECT chỉ đọc: 56 ca Kho bỏ đúng tài khoản Tác nghiệp, các bộ phận khác giữ nguyên.
