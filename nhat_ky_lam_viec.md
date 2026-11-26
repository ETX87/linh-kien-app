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

## 2026-11-19 — Cột "Công nợ hiện tại" ở Danh sách KTV (v1.532)

**Yêu cầu (nguyên văn):** "Danh sách KTV không thấy hiện cột công nợ hiện tại, chỉ thấy cột trần công nợ".

**Đã làm:** `GET /settings/ktv-lien-he?cong_no=1` kèm `cong_no_hien_tai` / `cong_no_danh_gia` tính bằng CHÍNH `docCongNoTongHop()` của menu Công nợ (chỉ khi người xem không phải KTV thuần — KTV không xem được công nợ người khác). Cột "Công nợ hiện tại" ngay sau "Trần công nợ": đỏ khi vượt trần, cam khi cảnh báo, "—" khi KTV không có tồn kho trong file MISA gần nhất.

**Câu hỏi kèm theo (nguyên văn):** "tại sao logic vượt trần này hiện thị số lại lệch thế? công nợ bên dưới ghi 6tr bên trên lại ghi 9tr" (đơn DDH-007559). Dòng "Lý do" là log lúc tạo đơn 14/11 12:18 (công nợ chốt khi đó 9.395.900đ); dòng "công nợ hiện tại" tính lúc xem (6.091.300đ) — Kế toán import file tồn kho MISA mới lúc 19/11 09:02 nên công nợ thực tế đổi. Không sửa code phần này.

**Kiểm thử:** typecheck backend + frontend 0 lỗi. Chưa xem cột mới bằng mắt trên giao diện.

## 2026-11-19 — Tự xét lại đơn "Chờ GS duyệt" khi công nợ giảm (v1.533)

**Yêu cầu (nguyên văn):** "Có, làm luôn" — trả lời câu hỏi "Có cho hệ thống tự xét lại đơn "Chờ GS duyệt" khi công nợ giảm không?" (đơn DDH-007559: lúc tạo 9.395.900 + 1.221.000 > trần 10tr; sau import MISA 19/11 công nợ còn 6.091.300 nhưng đơn vẫn chờ GS).

**Đã làm:** `xetLaiDonChoGsDuyet()` ở `lib/tuDongDuyet.ts` (quy tắc ở CLAUDE.md). Gọi sau lô cuối import tồn kho MISA và mỗi giờ (cron).

**Kiểm thử:** typecheck backend 0 lỗi. D1 local (route thử tạm, đã gỡ): đơn hết vượt trần → "TN da duyet" + log tự động đủ số liệu; đơn vẫn vượt giữ "Cho GS duyet"; gọi lần 2 không làm gì. Xem trước trên D1 thật (chỉ đọc): 3 đơn chờ GS vì vượt trần — chỉ DDH-007559 qua (2 đơn còn lại: KTV chưa đặt trần; công nợ 15,7tr > trần 6,8tr). Cron đầu giờ sau deploy sẽ chuyển đơn này.

## 2026-11-20 — Thông báo chuông tự xoá sau 10 ngày (v1.534)

**Yêu cầu (nguyên văn):** "1. khi ktv vào app, hiện tại có hiện 1 popup nhắc nhở các đơn tồn cần xử lý không? ví dụ 2 phiếu đang chờ bạn chuyển tiền => click vào để xem... 2. thêm nguyên tắc các thông báo sau 10 ngày tự clear để giảm tải áp lực cho hệ thống lưu trữ"

**Trả lời (1):** chưa có — KTV chỉ có popup "Chuyển tiền bị từ chối" và số "Cần làm" ở Trang chủ / menu; không có popup tổng hợp việc tồn khi mở app. Chưa làm, chờ chủ hệ thống chốt.

**Đã làm (2):** cron 0h VN xoá hẳn thông báo chuông (`thong_bao_ktv`) quá 10 ngày (`lib/donThongBao.ts` `xoaThongBaoCu`, lô 5.000 dòng), thay quy tắc cũ "chưa đọc quá 30 ngày → đánh dấu đã đọc". D1 thật lúc làm: 149.555 dòng, 117.411 dòng quá 10 ngày (sẽ xoá ở lần chạy 0h đầu tiên); 82.544 dòng chưa đọc. Ảnh hưởng: thẻ "Đơn bị từ chối" chỉ còn đếm đơn bị từ chối trong 10 ngày.

**Kiểm thử:** typecheck backend 0 lỗi. Chưa chạy lần xoá thật (cron 0h VN).

## 2026-11-20 — Popup "Việc bạn cần xử lý" khi KTV mở app (v1.535)

**Yêu cầu (nguyên văn):** "Có, làm luôn" — trả lời câu hỏi làm popup "việc bạn cần xử lý" cho KTV khi mở app (yêu cầu gốc: "khi ktv vào app, hiện tại có hiện 1 popup nhắc nhở các đơn tồn cần xử lý không? ví dụ 2 phiếu đang chờ bạn chuyển tiền => click vào để xem...").

**Đã làm:** `frontend/src/modules/datMuaLinhKien/NhacViecPopup.tsx` gắn ở `App.tsx`. Nguồn số = chung với ô "Cần làm" ở Trang chủ + số menu (`/notifications/count`, `danhSachViecCanLam`), thêm "Đơn của bạn bị từ chối", bỏ "Đơn của tôi đang chờ duyệt"; lời riêng KTV ("Phiếu chờ bạn chuyển tiền", "Phiếu chờ bạn xác nhận đã nhận hàng"). Chỉ KTV / Vệ tinh / NV sửa chữa thuần. Bấm 1 mục → mở đúng danh sách (prop mới `externalJump` của `DatMuaLinhKienModule`). "Để sau" ẩn tới lần mở app sau hoặc khi 1 việc tăng số. Bổ sung bản dịch EN / ID cho câu mới của popup này và popup nhắc giải trình (v1.529).

**Kiểm thử:** typecheck frontend 0 lỗi, build sạch. Worker local + phiên ký tay KTV có 2 phiếu chờ chuyển tiền: popup hiện "2 · Phiếu chờ bạn chuyển tiền"; bấm → mở Phiếu xuất › Chờ chuyển tiền lọc theo KTV, đủ 2 phiếu. Chưa thử trên điện thoại.

## 2026-11-20 — Cột "Tiền cần chuyển" ở danh sách Phiếu xuất ghi rõ đã đủ / còn thiếu (v1.536)
- **Yêu cầu:** "ktv báo thiếu hàng, kho xác nhận sẽ gửi bù, kế toán vào xác nhận nhưng đơn lại bị đẩy lại chờ tạo xuất là sao nhỉ" → sau khi giải thích: "Có, sửa luôn".
- **Kiểm tra (D1 production, chỉ đọc):** NTH-000004 "Da gui bu" đúng luồng — Kế toán xác nhận tạo phiếu gửi bù PMH-002814 ("Dang tao phieu"), 3 đơn gửi bù DDH-008219/8220/8221 mang 818.100đ từ PMH-002263; phiếu mới tổng 818.100 / đã trả 818.100, chuyển tiền "Kế toán đã duyệt". Không phải lỗi; cột "Tiền cần chuyển" hiện TỔNG phiếu nên dễ hiểu nhầm là KTV còn phải chuyển.
- **Đã làm:** `PhieuXuatKhoTab.tsx` cột "Tiền cần chuyển" thêm nhãn "✓ đã đủ" (đã trả ≥ tổng) / "còn X" (đã trả một phần), tooltip tổng · đã trả · còn phải chuyển; i18n en/id. Không đổi backend.
- **Kiểm thử:** typecheck frontend 0 lỗi. Chưa xem bằng mắt trên giao diện.

## 2026-11-20 — Kế toán chọn "Kho gửi bù ngoài hệ thống" khi cân đối nhận thiếu + hủy phiếu gửi bù PMH-002814 (v1.537, migration `0131`)
- **Yêu cầu:** "chỗ này thêm 1 lựa chọn cho kế toán là có tạo đơn xuất bù không. vì ở đơn này kế toán không cần phải tạo xuất lại, kho tự triển khai xuất ko cần tạo lại đơn. => thêm chức năng rồi hủy 3 đơn vừa tạo (vì thực tế không cần tạo đơn xuất bù - kho gửi ngoài)".
- **Đã làm:** `POST /nhan-thieu/:id/ke-toan` nhận `gui_bu_ngoai: true` (chỉ phương án gửi bù): không tạo đơn / phiếu gửi bù, không đổi SL thực xuất đơn gốc, tiền giữ ở phiếu gốc, ticket "Da gui bu" `pxk_gui_bu_id` NULL, log phiếu gốc + báo KTV. UI `NhanThieu.tsx` khung Kế toán có 2 lựa chọn (tạo phiếu gửi bù / Kho gửi ngoài hệ thống); ticket đã đóng kiểu này hiện "Kho gửi bù ngoài hệ thống".
- **Sửa dữ liệu (migration 0131):** NTH-000004 — hủy phiếu PMH-002814 ("Ke toan huy") + 3 đơn DDH-008219/8220/8221 ("Da huy"), trả 818.100đ về PMH-002263 (tổng + đã trả), SL thực xuất DDH-006772/006773/006774 về như cũ, `pxk_gui_bu_id` NULL. Không có giao dịch quỹ / khoản chuyển tiền nào của PMH-002814 (đã kiểm production trước khi chạy). Mọi lệnh có điều kiện bảo vệ.
- **Kiểm thử:** typecheck backend + frontend 0 lỗi; migration chạy local (không có dữ liệu thật → không đổi gì); điều kiện kiểm trên production trước khi chạy đều khớp. Chưa bấm thử lựa chọn mới trên giao diện.

## 2026-11-20 — Đẩy lại ticket TLK-001268 bị Kho từ chối nhầm (migration `0132`)
- **Yêu cầu:** "TLK-001268 bị kho hủy nhầm, đẩy lại cho tôi".
- **Hiện trạng (D1 production):** Kho từ chối (sai TT) 18/11 16:25 → ticket "Đã hủy bỏ", đơn DDH-007592 (2009010118 x2, MUA HÀNG, KTV giangtv.st-mn) tự hủy, 264.200đ hoàn về quỹ KTV. Đã quá 24h nên nút "↩ Đẩy lại ticket" không còn hiện. Quỹ còn đúng 264.200đ, không giao dịch nào sau đó; KTV không có phiếu mở.
- **Đã làm:** migration làm đúng các bước của `dayLaiThieuLk()`: ticket về "Chờ kho xử lý", đơn về "Chờ hàng", rút 264.200đ từ quỹ gắn lại vào đơn (`tien_da_tra`), ghi log đơn + ticket + sổ quỹ. Có điều kiện bảo vệ (log mới nhất của ticket + version đơn). Không gửi thông báo cho KTV.

## 2026-11-20 — Chọn tách / gộp phiếu đã đủ tiền khi tạo đơn + ô KH chuyển khoản khi sửa đơn + hủy phiếu trống (v1.538)
- **Yêu cầu:** "khi nhân viên đặt đơn, hiện tại đang tự động tác phiếu xuất nếu đơn có tiền với đơn chưa chuyển tiền đang bị tách đơn (check logic này) => nếu đang có logic tự tách như vậy => thêm lựa chọn cho người tạo (có muốn tách thành phiếu chờ chuyển/ phiếu đã có đủ tiền không - vì có ktv muốn được chuyển về trong cùng 1 lần)"; "2. khi tôi sửa đơn, thiếu nút tích kH đã thanh toán => fix lại"; "3. Đơn trống nhưng không có nút hủy bỏ vẫn hiện đơn trống".
- **Kiểm tra logic:** `bundleAutoApprovedIntoPxk` không bao giờ gộp đơn mới vào phiếu "Dang tao phieu" Kế toán đã duyệt tiền → luôn tạo phiếu mới chờ chuyển tiền (đúng như người dùng mô tả).
- **Đã làm:**
  - `POST /phieu-dat/kiem-tra` trả `phieu_da_du_tien` (phiếu đang tạo Kế toán đã duyệt tiền, cùng nhóm phiếu với dòng sẽ vào phiếu có tiền); `POST /phieu-dat` nhận `gop_phieu_da_du_tien` → `bundleAutoApprovedIntoPxk` opts `gopPhieuDaDuTien` (ưu tiên phiếu đã duyệt tiền, log "Người đặt chọn GỘP…", phiếu về "Chờ KTV chuyển" thì báo KTV). FE `GopPhieuDaDuTien.tsx` (desktop cột phải dưới "Tổng đơn", mobile trên thanh tạo đơn) — mặc định Tách; form kiểm tra gửi thêm hình thức hóa đơn + KH chuyển khoản.
  - PATCH `/don-hang/:id` nhận `kh_chuyen_khoan`: chặn `KH_CHUYEN_KHOAN_KHONG_DOI_DUOC` khi đơn giữ tiền / phiếu đã có tiền / đã gửi Kế toán; phiếu "Dang tao phieu" chưa tiền → gỡ đơn trước khi ghi rồi gom lại. Form sửa đơn (`DonCuaToiTab.tsx`) có ô `KhChuyenKhoanCheck` dưới "Yêu cầu hóa đơn".
  - Phiếu trống: nút "🗑 Hủy phiếu trống" trong chi tiết phiếu (văn phòng / người nhận / người tạo; `/huy-neu-trong` mở thêm Kho + người nhận + người tạo); cron mỗi giờ `huyMoiPhieuTrongCu` hủy phiếu trống im lặng ≥ 30 phút; danh sách "tất cả" ẩn phiếu đã hủy không còn đơn. Phiếu PMH-002819 trong ảnh thực ra ĐÃ tự hủy (10:52, đổi hình thức hóa đơn đơn cuối) — chỉ là vẫn hiện trong danh sách.
- **Kiểm thử (Worker + D1 local, bản sao dữ liệu demo):** kiểm tra trả PMH-000030; tạo đơn mặc định → phiếu mới PMH-000039; chọn gộp → vào PMH-000030, phiếu về "Chờ KTV chuyển" còn thiếu 450.000đ + log đúng; Admin bỏ tích KH đơn trong phiếu chưa tiền → sang phiếu quỹ KTV, phiếu cũ tự hủy và ẩn khỏi danh sách tất cả (lọc hủy vẫn thấy); đơn trong phiếu có tiền → 409 đúng mã; KTV hủy phiếu trống của mình → OK. Typecheck 2 phía 0 lỗi. Giao diện (ô chọn trên form, ô KH trong form sửa, nút hủy phiếu trống) CHƯA xem bằng mắt.


## 2026-11-20 — API linh kiện đã đặt theo mã case cho app Bảo hành đổi trả (v1.539)

- Yêu cầu (phía app Bảo hành đổi trả): "khi họ chọn 1 mã ID => ưu tiên hiện top danh sách các mã họ đã đặt hàng bên linh kiện app liên quan
  đến mã ID đó - chỉ tính mã chưa bị hủy hoặc từ chối".
- Đã làm: `GET /api/suachua-partner/lk-theo-case?case_id=` (X-Sync-Key) — khớp `dat_don_hang.ma_yeu_cau_su_co` (index sẵn) + `dat_don_case`,
  nhận SC / Sc / sc; bỏ `loai_don='tra_hang'` và 'TN tu choi' / 'Tu choi' / 'Da huy'; gom theo mã LK (SL thực xuất hoặc đề xuất), ≤50 dòng.
  Chỉ đọc, không có migration.
- Kiểm thử: typecheck sạch; câu truy vấn chạy trên D1 production (chỉ đọc): SC261012203 ra 6 linh kiện, 26 dòng đọc.

## 2026-11-20 — Ô "KH đã chuyển khoản" khi sửa đơn: đổi được cả khi phiếu đã có tiền (v1.539)
- **Yêu cầu:** "không tích được" (ảnh chi tiết DDH-008239: ô bị khoá "đơn / phiếu đã có tiền thanh toán — bỏ đơn khỏi phiếu trước").
- **Kiểm tra (D1 production, chỉ đọc):** lúc kiểm DDH-008239 đã không còn trong phiếu nào, không giữ tiền — v1.538 khoá khi phiếu chứa đơn đã có tiền nên phải bỏ đơn khỏi phiếu bằng tay.
- **Đã làm:** PATCH `/don-hang/:id` cho đổi cờ khi phiếu còn "Dang tao phieu" / "Cho ke toan" kể cả đã có tiền: gỡ đơn như đơn CHƯA thanh toán (`goDonKhoiPxk` không mang tiền → tổng giảm, thừa hoàn về quỹ cũ, phiếu hết đơn tự hủy + báo hoàn quỹ) rồi gom vào phiếu đúng quỹ. Chỉ chặn khi phiếu đã qua Kế toán chốt hoặc đơn mang tiền riêng (`tien_da_tra`). Form sửa đơn hiện cảnh báo "đổi quỹ tiền" khi đơn đang trong phiếu; i18n bổ sung cả 4 câu "Hủy phiếu trống" còn thiếu của v1.538.
- **Kiểm thử (Worker + D1 local):** bỏ tích KH đơn duy nhất của phiếu đã đủ 450.000đ → phiếu tự hủy, 450.000đ về Quỹ KH chuyển khoản, đơn sang phiếu quỹ KTV "Chờ KTV chuyển". Typecheck 2 phía 0 lỗi. Giao diện chưa xem bằng mắt.


## 2026-11-20 — Ô tìm Ctrl+K tìm ticket thiếu hàng bảo hành + đơn theo mã đơn BH (v1.540)

- **Yêu cầu (nguyên văn):** "các đơn đặt trên hệ thống app đổi trả đã tự động đẩy sang hệ thống app đặt linh kiện chưa? ví dụ như đơn này: SC2611120758" → rồi "công cụ tìm kiếm không tìm thấy".
- **Kiểm tra (D1 production, chỉ đọc):** case SC2611120758 / DH-006691-1 KHÔNG có đơn đặt hàng nào — bên app đổi trả mới "Báo thiếu hàng" (ticket THB-000181, Kho đã xác nhận hàng về), chưa tạo đề xuất linh kiện. Luồng đẩy đơn vẫn chạy (8 đơn `nguon_tao='doitra'`). Ctrl+K không ra vì `/dat-mua-lk/search` chưa tìm bảng `thieu_hang_bh`.
- **Đã làm:** `GET /dat-mua-lk/search` thêm ticket THB theo tiền tố mã ticket / `case_id` / `nguon_id` (cùng quyền xem với `routes/thieuHangBh.ts`) + đơn theo tiền tố `bh_don_vi_id`. FE: loại kết quả `thieu_hang_bh` (nhóm "Thiếu hàng bảo hành") → `XemThieuHangBh` (ThieuHangBh.tsx) mở chi tiết ticket ngay tại màn đang dùng.
- **Kiểm thử:** typecheck backend + frontend 0 lỗi; câu SQL chạy trên D1 production (chỉ đọc) ra THB-000181 với "SC2611120758" và "DH-006691". Chưa bấm thử trên giao diện.

## 2026-11-20 — Admin đẩy lại đơn / ticket không giới hạn 24h (v1.541)
- **Yêu cầu:** "thêm chức năng cho phép admin đẩy lại không giới hạn 24h" (sau vụ TLK-001268 phải đẩy lại bằng migration vì đã quá 24h).
- **Đã làm:** backend — `POST /dat-mua-lk/don-hang/:id/day-lai` và `POST /dat-mua-lk/thieu-lk/:id/day-lai` bỏ qua hạn 24h khi người bấm là Admin (`ticketDayLaiCuaDon(…, boQuaHan)`, `dayLaiTicketThieuLk(… opts.boQuaHan)`); mọi điều kiện khác giữ nguyên (đơn không do chính người tạo / nhận tự hủy, không còn trong phiếu khác, người nhận không bị tắt). Log đơn / ticket ghi thêm "(Admin đẩy lại khi đã quá 24h)". Frontend — `dayLaiDuoc(d, canTn, laAdmin)`: nút "↩ Đẩy lại" hiện cho Admin cả khi quá hạn (chi tiết đơn, danh sách đơn, Drawer ticket), dòng hạn đổi thành "Đã quá 24h — Admin vẫn đẩy lại được". TN / Kế toán / Kho vẫn 24h.
- **Kiểm thử:** typecheck backend + frontend 0 lỗi, build qua. Chưa bấm thử trên giao diện.

## 2026-11-20 — Giải trình vi phạm: mô tả lỗi + link tra cứu ticket thiếu hàng (v1.542)
- **Yêu cầu:** "có 1 việc liên quan đến giải trình vi phạm thiếu mô tả lỗi vi phạm là gì + thiếu tích hợp link dẫn đến vi phạm ví dụ đơn TLK nhưng lại không có nút click vào để tra cứu đơn thiếu LK".
- **Đã làm (chỉ frontend):** `modules/viPham/ViPhamUi.tsx` thêm `moTaLoi()` + khối `KhoiLoiViPham` ("Lỗi vi phạm": việc bộ phận phải làm ở bước — bảng `VIEC_BUOC` theo mã bước, khớp `BUOC_VI_PHAM` backend — + diễn biến: vào bước lúc nào, hạn SLA, xử lý lúc nào / bởi ai hoặc chưa xử lý, trễ bao lâu + dòng "Tra cứu" mã đơn / phiếu / ticket + LK) ở đầu hộp giải trình và chi tiết ca; cột "Lỗi vi phạm" ở danh sách (rê chuột xem đủ câu). `MaLienKet.tsx` thêm `MaTicketLink` (mở Drawer chi tiết ticket thiếu hàng tại chỗ) — mã TLK trong `MaDoiTuong` (bảng, popup nhắc giải trình, thanh cảnh báo) giờ bấm được. Bản dịch EN / ID.
- **Kiểm thử:** typecheck + build sạch. Worker + D1 local, ca mẫu `kho_thieu` ticket TLK-T9 (đã xoá sau khi thử): popup nhắc khi mở app hiện link TLK-T9; hộp giải trình hiện khối "Lỗi vi phạm" đúng câu; bấm TLK-T9 mở đúng chi tiết ticket; bảng "Quá hạn & vi phạm" có cột mới.

## 2026-11-20 — Kết quả Mua hàng (EO) theo ID case / ID đơn ở chi tiết đơn + ticket thiếu hàng (v1.543)
- **Yêu cầu:** "việc dở liên quan đến việc dựa vào ID case và ID đơn hàng để trả kết quả về bên app linh kiện".
- **Đã làm:** backend `lib/muaHangClient.ts` (`layKetQuaMuaHang` gọi app EO Mua hàng v0.108 `GET /api/partner/theo-id` qua Service Binding `MUAHANG_SERVICE`,
  secret `MUAHANG_DOC_API_KEY`; lỗi / chưa cấu hình → null) + `GET /api/dat-mua-lk/mua-hang-eo?don=|ticket=` (phạm vi xem như chi tiết đơn; gửi mã đơn,
  ticket của đơn, case của đơn, cặp `3TDO~mã LK` từ `thieu_lk.ma_eo_mua`). FE `KetQuaMuaHang.tsx`: trong "Thông tin để Kho đánh giá" của ticket thay ô
  "Chưa kết nối app EO mua hàng" bằng danh sách PO khớp; chi tiết đơn thêm khung "Mua hàng (EO)" (`MuaHangZone`). Bản dịch EN / ID.
- **Dữ liệu thật:** bên Mua hàng 852 dòng có ID đặt hàng (`DDH-…`, `TLK-00…` và mã cũ `TLK-<hex>` không còn bên app này), 882 dòng có ID CRM; 321 ticket bên này đã ghi mã EO.
- **Kiểm thử:** typecheck + build sạch; API Mua hàng thật trả đúng PO cho `DDH-008172`, `TLK-001254`, case `B1466610`, `T21306` (401 khi thiếu khoá).
  Chưa mở được giao diện app này với tài khoản thật để xem khung mới (cần đăng nhập).

## 2026-11-20 — Dữ liệu: chuyển ticket còn mở sang "Mua hàng đã đặt" theo PO bên app EO Mua hàng (không đổi code, không deploy)
- **Yêu cầu:** "chạy lại 1 lượt các đơn đặt hàng có mã LK-xxxx xem đơn nào trên app lk vẫn chưa chuyển trạng thái thì bắn sang".
- **Đối chiếu (D1 thật 2 app):** bên Mua hàng 423 dòng EO ghi mã `TLK-…` / `DDH-…` (268 dòng hiệu lực) ↔ 345 ticket bên này. 9 ticket còn mở
  (8 "Kho đã tiếp nhận", 1 "Kho đã cập nhật") dù Mua hàng đã có PO hiệu lực cùng mã LK, chưa ghi mã EO: TLK-000080, 000081 (3TDO-000742), 000122 (3TDO-000764),
  000186, 000227 (3TDO-000770), 000252, 000257, 000292 (3TDO-000780), 001222 (3TDO-000847). Không có ticket mở mà dòng EO đã hủy; 2 mã `DDH-…` bên Mua hàng không có bên này.
- **Đã làm:** theo đúng luồng ticket → ghi log "Chờ mua hàng" rồi "Mua hàng đã đặt" (ghi chú "EO 3TDO-… · Đồng bộ từ app EO Mua hàng … · Dự kiến có hàng …",
  người thực hiện = tài khoản quản trị bootstrap), ghi `ma_eo_mua` + ngày dự kiến của Mua hàng (2 ticket Mua hàng chưa có ngày dự kiến → giữ ngày Kho đã nhập),
  tăng version `dat_mua_lk`. Mỗi câu có điều kiện trạng thái mới nhất (chạy lại không ghi trùng). Đơn gốc giữ "Chờ hàng"; không gửi thông báo cho người tạo đơn.
- **Kiểm thử:** sau khi chạy, 9 ticket = "Mua hàng đã đặt" có mã EO, mỗi ticket 2 dòng log; đối chiếu lại toàn bộ còn 0 ticket mở có PO hiệu lực.


## 21/11/2026 — v1.544: API tra mã Lada cho app Bảo hành đổi trả

- Yêu cầu (phía app đổi trả): tạo đơn gửi bảo hành theo mã Lada, chung ô "Mã yêu cầu"; *"thông tin logic có thể xin bên app linh kiện - bên đó có truy vấn theo ID lada"*.
- Đã làm: `GET /api/suachua-partner/lada?id=` (X-Sync-Key) dùng lại `lookupLada` + `ladaPreview` + cache 10 phút như `/dat-mua-lk/kiem-tra-ma-lada`; trả `{found, preview, warning}`. `lk-theo-case` khớp thêm `dat_don_hang.ma_lada` (có index) để linh kiện đặt theo mã Lada cũng được ưu tiên bên app đổi trả.
- Kiểm thử: typecheck sạch; luồng đầu cuối thử phía app đổi trả bằng Worker giả (chưa gọi hệ Lada thật trước deploy).

## 2026-11-21 — Ngày dự kiến có hàng 01/01/1900: cho bỏ trống + chặn ngày vô lý + dọn dữ liệu (v1.545, migration `0133`)
- **Yêu cầu:** "fix lỗi 01/01/1900" (ảnh ticket TLK-001237 "Dự kiến có hàng 01/01/1900"). Chốt qua câu hỏi: ô ngày dự kiến khi Mua hàng "Đã đặt hàng" → **cho bỏ trống**; dữ liệu cũ: "mặc định giá trị 01/01/1900 thì để trống".
- **Nguyên nhân (D1 thật, chỉ đọc):** ô bắt buộc nhưng Mua hàng thường chưa biết ngày hàng về → điền 01/01/1900 cho qua; backend chỉ kiểm dạng YYYY-MM-DD. 136 ticket thiếu hàng + 20 ticket thiếu hàng bảo hành đang lưu 1900-01-01.
- **Đã làm:** `backend/src/lib/ngayDuKien.ts` (`chuanNgayDuKien` — 1900-xx-xx = trống; `loiNgayDuKien` — ngày thật, từ hôm nay giờ VN tới tối đa 365 ngày) gắn vào `applyThieuLkLog` (mọi bước có ngày: Kho tiếp nhận / cập nhật / Mua hàng đã đặt) và `routes/thieuHangBh.ts`; bỏ bắt buộc ngày ở "Mua hàng đã đặt" (cả 2 loại ticket), mã EO vẫn bắt buộc. FE `frontend/src/lib/ngayDuKien.ts` (bản sao): ô ngày có min/max, câu báo đỏ + khoá nút khi ngày sai, nhãn "Ngày dự kiến có hàng (bỏ trống nếu chưa rõ)"; câu lỗi mới ở `constants.ts` + `ThieuHangBh.tsx`; i18n EN/ID. `KetQuaMuaHang` hiện "—" nếu EO trả 1900.
- **Dữ liệu (migration 0133):** ngày 1900 → trống ở `thieu_lk` + `thieu_hang_bh` (đổi `ngay_cap_nhat` để app Sửa chữa bảo hành kéo lại); bỏ đoạn "Dự kiến có hàng 01/01/1900" trong ghi chú lịch sử ticket, log đơn gốc, thông báo chuông.
- **Kiểm thử:** typecheck 2 phía sạch; hàm kiểm tra ngày thử 8 trường hợp (trống, 1900, 30/02, quá khứ, hôm nay, +1 năm, quá 1 năm, sai dạng) đúng; migration chạy D1 local. Chưa bấm thử form trên giao diện.
- **Lưu ý:** phiên khác đang sửa dở `suachuaPartner.ts` (v1.544 tra mã Lada) — không nằm trong commit này; deploy từ worktree sạch của commit.

## 2026-11-21 — v1.546: Kế toán được bấm "⏳ Chuyển chờ hàng"
- **Yêu cầu:** "tại sao vai trò kế toán không có nút bấm chuyển sang thiếu hàng "Chờ hàng về" như admin?" → "Có, mở cho Kế toán".
- **Nguyên nhân:** nút Admin thấy là "⏳ Chuyển chờ hàng" của Mua hàng (chỉ Mua hàng + Admin). Nút "Chờ hàng" của Tác nghiệp (Kế toán làm thay) bị ẩn khi Kế toán đã duyệt tiền phiếu (`TN_DOI_TRONG_PXK_SQL`) — ví dụ đơn trong PMH-002831.
- **Đã làm:** `POST /dat-mua-lk/don-hang/:id/cho-hang` nhận thêm `la_ke_toan`; log ghi "Kế toán chuyển chờ hàng: …" (Mua hàng / Admin giữ "Mua hàng …"). FE `DonCuaToiTab.tsx` hiện nút cho Kế toán. Điều kiện đơn giữ nguyên (`MUA_HANG_CHO_HANG_DUOC_SQL`), tiền đã trả đi theo đơn, ticket mở ở "Chờ mua hàng".
- **Kiểm thử:** typecheck 2 phía sạch. Chưa bấm thử trên giao diện.

## 2026-11-21 — v1.547: Cho chọn lại loại đề xuất cấp LK sửa chữa + cảnh báo "Khác loại gợi ý" (migration `0134`, + app đổi trả v1.152)

- Yêu cầu nguyên văn: "sẽ cho ktv chọn lại, nhưng trên app đổi trả và app linh kiện, sẽ hiện cảnh báo rất rõ ràng cho các đơn vị, bộ phận liên
  quan biết linh kiện này đang được chọn loại đề xuất khác với đề xuất thực tế phải chọn. (vì trong thực tế, sp hết bảo hành nhưng lk bên trong
  sp có thể vẫn còn bảo hành)".
- Đã làm: `chuanBiPhieuDat` không còn ghi đè loại đề xuất theo đơn bảo hành; loại khác gợi ý → lưu `dat_don_hang.loai_goi_y` + `loai_goi_y_ly_do`,
  ghi thêm dòng cảnh báo vào log tạo đơn. FE: chip đỏ "⚠ Khác loại gợi ý" (danh sách đơn, header chi tiết đơn, dòng đơn trong phiếu), khối đỏ giải
  thích trong chi tiết đơn; cảnh báo ở form tạo đơn đổi câu ("hệ thống gợi ý … bạn đang chọn …", vẫn được giữ loại). `/suachua-partner/don-sc`
  trả 2 cột mới → app đổi trả hiện cảnh báo ở màn Cấp linh kiện, Linh kiện của tôi, chi tiết đơn BH, hộp xác nhận tiêu hao.
- Kiểm thử: typecheck backend + frontend 2 app 0 lỗi, khoá dịch đủ. Chưa bấm thử trên giao diện.


## 2026-11-21 — v1.548: Giải trình quá hạn thêm "Lỗi thuộc về" + ảnh bằng chứng (migration `0135`)

- Yêu cầu nguyên văn: "khi giải trình sẽ thêm lựa chọn: 1. Sau khi giải trình bắt lỗi: lỗi nội bộ, lỗi đối tác, lỗi của tôi, khác
  2. Bằng chứng của việc giải trình nếu không phải lỗi của bản thân".
- Đã làm: cột `vi_pham.phan_loai_loi` (`noi_bo` / `doi_tac` / `cua_toi` / `khac`) + `vi_pham.bang_chung` (JSON link ảnh Drive). `POST /vi-pham/:id/giai-trinh`
  bắt buộc `phan_loai_loi` (`THIEU_PHAN_LOAI_LOI`); khác "Lỗi của tôi" bắt buộc 1–5 ảnh bằng chứng (`THIEU_BANG_CHUNG`, chỉ nhận link Drive). Route tải ảnh
  `POST /vi-pham/:id/anh` (cùng quyền giải trình, hạn mức ảnh/ngày như mọi chỗ tải ảnh). Hộp giải trình (`ViPhamUi.tsx`): 1. Lý do chậm → 2. Lỗi thuộc về
  (4 nút) → 3. Ảnh bằng chứng (chỉ hiện khi không phải lỗi của mình) → nội dung; footer ghi còn thiếu gì. Chi tiết ca hiện nhãn lỗi + ảnh; danh sách thêm cột
  "Lỗi thuộc về" (lọc được, "📎N" = số ảnh). API đối tác `/v1/vi-pham` trả thêm `phan_loai_loi`, `ten_phan_loai_loi`, `bang_chung` (tài liệu 2.4).
  Ca đã giải trình trước đây / giải trình tự động: 2 cột để trống.
- Kiểm thử local (Worker + D1 local, tài khoản Kế toán thử): thiếu phân loại → 400, lỗi đối tác không ảnh / ảnh không phải link Drive → 400, có ảnh Drive → ghi
  đúng; giao diện: chọn "Lỗi đối tác" hiện mục ảnh bắt buộc, "Lỗi của tôi" ẩn mục ảnh, cột "Lỗi đối tác · 📎1" ở tab Đã giải trình. Chưa thử tải ảnh thật lên Drive.

## 2026-11-21 — v1.548: Hướng xử lý "Dịch vụ tính phí" → MUA HÀNG SỬA CHỮA (+ app đổi trả v1.154)

- Yêu cầu nguyên văn: "khi admin bh duyệt sẽ chọn loại hình thức tính phí => từ đó suy ra loại đề xuất luôn (song song với hạn bảo hành - ưu
  tiên cái này trước)".
- Đã làm: `loaiDeXuatTheoDonBh` (backend `pxkRecalculate.ts` + bản sao FE `helpers.ts`) đọc thêm `huong_xu_ly` từ API gợi ý app đổi trả
  (`donBhClient.ts`): "dich_vu_tinh_phi" → MUA HÀNG SỬA CHỮA trước khi xét trong / ngoài bảo hành. Ô chọn đơn BH hiện "Dịch vụ tính phí", cảnh báo
  khác loại + căn cứ gợi ý ghi rõ lý do, TT+Mail duyệt tự điền "Mua hàng sửa chữa (dịch vụ tính phí) …". Đơn đã tạo không đổi.
- Kiểm thử: typecheck 0 lỗi. Chưa bấm thử trên giao diện.

## 2026-11-21 — v1.549: Ô "Luôn có hàng" trong form Thêm / Sửa linh kiện

- Yêu cầu nguyên văn: "khi tạo lk thiếu lựa chọn này" (ảnh cột "Kiểm tra tồn kho — Luôn có hàng" ở Bảng giá).
- Đã làm: form Thêm / Sửa LK (`DanhMucLinhKienModule.tsx`) thêm ô "Luôn có hàng (không kiểm tra tồn kho)". Thêm mới → `POST /settings/linh-kien`
  nhận `khong_kiem_ton` (ghi kèm người + giờ bật). Sửa → đổi ô thì gọi chính `PATCH /linh-kien/:ma/khong-kiem-ton` (bật thì xét lại đơn Chờ hàng /
  Chờ thanh toán của mã như công tắc ở bảng).
- Kiểm thử: typecheck 0 lỗi; câu INSERT mới chạy đúng trên D1 local (dòng thử đã xoá). Chưa bấm thử form trên giao diện.

## 2026-11-21 — v1.550: Hàng trả — thêm bộ lọc ngày + lọc cột kiểu Excel

- Yêu cầu nguyên văn: "ở mục trả hàng thêm các bộ lọc và table thêm các filter dạng excel".
- Đã làm: backend `traHang.ts` tách `traHangListWhere()`, thêm lọc Từ/Đến ngày tạo, người nhận hàng, lọc + sắp xếp theo cột (`cf`/`cs`/`cd`, 10 cột) và API
  `GET /tra-hang/gia-tri-loc`. Frontend `TraHangTab.tsx`: nút phễu ở tiêu đề 9 cột bảng (chọn nhiều, loại trừ, tìm không dấu, sắp xếp A→Z / Z→A), ô Tháng / Từ
  ngày / Đến ngày, cụm "Lọc theo cột (như Excel)" trong bảng Bộ lọc (thêm cột "Phiếu xuất kho"), chip cột đang lọc + xoá nhanh. File "Tải danh sách chi tiết"
  theo đúng mọi bộ lọc.
- Kiểm thử: typecheck + build 0 lỗi. Worker local (D1 local, đăng nhập dev): 10 cột trả danh sách giá trị đúng; lọc chọn / loại trừ, sắp xếp SL, khoảng ngày,
  danh sách giá trị theo bộ lọc khác, file tải về, cột sai → 400 đều đúng. Đã xem giao diện: nút phễu ở tiêu đề, hộp lọc, bảng Bộ lọc.

## 2026-11-21 — v1.551: Báo cáo "Tốc độ xử lý" tính theo giờ làm việc

- Yêu cầu nguyên văn: "các tốc độ xử trong các báo cáo đã tính lại theo mốc 8h làm việc chưa?" → trả lời chưa → "Đổi sang giờ làm việc".
- Đã làm: `lib/slaMetrics.ts` `hoursBetween` dùng `gioLamViecGiua` (cùng khung giờ với SLA / vi phạm: T2–T6 8–12h + 13–17h, T7 8–12h, CN nghỉ) thay
  giờ lịch 24/7; đổi khoá cache báo cáo `tong-hop-v2` để mọi kỳ (cả kỳ cũ) tính lại; câu mô tả trên màn báo cáo ghi rõ "tính theo giờ làm việc".
- Kiểm thử: typecheck 0 lỗi; thử hàm với mốc thật: 16h T7 → 9h T2 = 1,0 giờ; 9h–15h30 = 5,5 giờ; 17h30 T6 → 8h30 T7 = 0,5 giờ. Chưa mở báo cáo trên production.

## 2026-11-21 — v1.552: Báo cáo Tốc độ xử lý thêm cột TB ngày làm việc

- Yêu cầu nguyên văn: "thêm cột TB ngày làm việc bên cạnh cột \"TB giờ\"".
- Đã làm: `BaoCaoTocDoXuLyModule.tsx` thêm cột "TB ngày làm việc" (= TB giờ làm việc ÷ 8, 1 chữ số thập phân) ngay sau "TB giờ xử lý" và "TB giờ (toàn hệ thống)"; file Excel thêm 2 cột tương ứng. Không đổi API.
- Kiểm thử: typecheck frontend 0 lỗi, build qua. Chưa xem bằng mắt trên production.

## 2026-11-21 — v1.553: Giải trình — lỗi "không xác định (THIEU_PHAN_LOAI_LOI)" + bỏ "Lỗi của tôi" / "Khác"

- Báo lỗi: ảnh hộp "Giải trình quá hạn — TLK-000781" báo "không xác định (mã: THIEU_PHAN_LOAI_LOI)". Nguyên nhân: tab mở từ trước v1.548 (hộp cũ không có ô "Lỗi thuộc về") gửi giải trình thiếu trường mới, server từ chối, giao diện cũ không biết mã lỗi.
- Yêu cầu thêm nguyên văn: "bỏ lựa chọn \"lỗi của tôi\" và \"khác\"".
- Đã làm: server trả kèm câu "đã có phiên bản mới, tải lại trang" (giao diện cũ hiện được); thanh nhắc "Ứng dụng đã có phiên bản mới — Tải lại" (`BanMoiBanner.tsx`, so file index.html mỗi 5 phút / khi quay lại tab); "Lỗi thuộc về" chỉ còn Lỗi nội bộ / Lỗi đối tác, ảnh bằng chứng tùy chọn — yêu cầu thêm "ảnh là tùy chọn, ko bắt buộc" (ca cũ giữ nhãn). Tài liệu API 2.5.
- Kiểm thử: typecheck backend + frontend, build. Chưa xem bằng mắt trên production.

## 2026-11-23 — v1.554: Đẩy ca quá hạn chờ giải trình lên App Nhiệm vụ eOffice

**Yêu cầu (nguyên văn):** "kiểm tra logic cửa app nhiệm vụ: đây các nhiệm vụ cần giải trình quá hạn chờ giải trình." → sau khi báo kết quả kiểm tra: "Làm luôn".

**Kiểm tra trước khi làm:** logic trong app đúng (ca hết hạn giải trình tự chuyển Tồn CEO; lúc kiểm có 3 ca "Chờ giải trình", 61 ca Tồn CEO, không ca nào thiếu người
phụ trách). Nhưng app CHƯA nối App Nhiệm vụ: không có code gọi cổng, Worker chưa có khoá, cổng giữ 0 người / 0 việc cho mã app `dat-linh-kien`.

**Đã làm:**
- `backend/src/lib/congNhiemVu.ts`: gom ca "Chờ giải trình" theo từng người phụ trách (Mã NS, chưa có thì email), gửi ảnh chụp đủ `toanBo` lên cổng
  `taskFeedNhan`; lưu kết quả lần gửi ở `app_settings` `cong_nhiem_vu_state` (bỏ qua khi danh sách không đổi).
- Gọi: cron mỗi giờ sau `quetViPham`, sau `POST /vi-pham/:id/giai-trinh`, sau "Quét ngay"; route Admin `GET /vi-pham/nhiem-vu`, `POST /vi-pham/nhiem-vu/day`.
- FE: khối "App Nhiệm vụ eOffice" ở tab Cấu hình SLA (trạng thái lần đẩy cuối + nút "Đẩy lên App Nhiệm vụ"); bản dịch EN/ID.
- Nạp secret `TASK_FEED_KEY` cho Worker (khoá app `dat-linh-kien` đã được cấp sẵn).

**Kiểm thử:** typecheck backend + frontend 0 lỗi; xem trước dữ liệu thật (chỉ đọc): 3 ca, 9 người (2 người chưa có Mã NS → gửi theo email). Kết quả gửi thật ghi
ở phần báo cáo phiên.

**Còn dở:** chưa đẩy các việc khác (đơn chờ duyệt, phiếu chờ Kế toán…) lên App Nhiệm vụ — chỉ ca giải trình theo yêu cầu.

## 2026-11-23 — v1.555: Tìm mã phiếu đã tự hủy (trống) ra được trong danh sách Phiếu xuất

**Yêu cầu (nguyên văn):** "phiếu này sao không tìm thấy" (ảnh chi tiết PMH-001702: Đã huỷ, Kế toán đã duyệt 940.100đ, không còn đơn).

**Tra dữ liệu thật (chỉ đọc):** PMH-001702 tự hủy 02/11 vì đơn duy nhất DDH-004773 kho MB2 hết hàng → đơn sang Chờ hàng, MANG THEO 940.100đ. 21/11 Mua hàng
hủy ticket TLK-000837 ("krf đã hủy đặt hàng") → đơn tự hủy, 940.100đ về quỹ KTV thanhhai78tk (`hoan_phieu`), cùng ngày 14:29 quỹ tự trả phiếu PMH-002891. Tiền
không mất. Phiếu không tìm thấy vì v1.538 ẩn phiếu "Ke toan huy" không còn đơn khỏi danh sách xem tất cả — kể cả khi gõ đúng mã.

**Đã sửa:** `pxkListWhere` (`phieuXuatKho.ts`) chỉ ẩn phiếu hủy trống khi KHÔNG gõ từ khóa tìm.

**Kiểm thử:** typecheck backend 0 lỗi. Chưa thử trên giao diện.


## 2026-11-24 — v1.556: Cửa sổ thông tin eOffice (popup Giám đốc) trên mọi app hệ DVBH

**Yêu cầu (nguyên văn):** "phân tích yêu cầu tạo popup trên tất cả các app người dùng của hệ thống dvbh của hệ thống máy chủ công ty gửi sang" → "làm luôn cho toàn bộ hệ thống app dvbh: đặt lk, đổi trả, ông thợ, vi phạm, tiếp nhận..." → "thêm cả muahang" → "cả ccdc". Tài liệu nguồn: "API Cửa sổ thông tin — dành cho app ngoài (ETX87)".

**Đã làm (app này là bản mẫu, chép y hệt sang các app khác):**
- `backend/src/lib/cuaSoThongTin.ts` + `GET /api/cua-so` (không cần đăng nhập): Worker gọi `csApi` eOffice bằng secret `CUA_SO_KHOA`, đệm 60 giây trong isolate (`kiemLaiSauGiay`), tải kèm tranh SVG (≤ 200KB, 1,5 giây). Lỗi / chậm / chưa đặt khoá → "không có cửa sổ".
- `frontend/src/components/CuaSoThongTin.tsx` (gắn ở `main.tsx`, ngoài App → hiện cả màn đăng nhập, phủ trên mọi popup khác): 4 bố cục kiểu Apple (`apTrang`, `dem`, `mauPhang`, `theSP`) + bố cục cũ (thẻ trắng); tranh đổi màu nét theo bố cục, hiện qua `data:` URL trong `<img>` (không chèn SVG vào DOM). Nút khoá `khoaNutGiay` giây, đếm "(3)…(1)"; Esc / nút Back chỉ đóng sau khi hết khoá. Hiện mỗi lần mở app và khi quay lại app sau khi ẩn ≥ 10 phút (không phải mỗi lần đổi tab — tránh làm phiền nhân viên văn phòng).

**Kiểm thử:** typecheck 2 phía 0 lỗi; chạy Worker local với khoá thật: `/api/cua-so` trả cửa sổ đang bật ("Nghỉ lễ vui vẻ.", `mauPhang`), popup hiện đúng trên máy tính + điện thoại (375px), nút đếm ngược rồi mở khoá, Esc đóng được sau khi hết khoá. Mới xem bằng mắt bố cục `mauPhang` (cửa sổ đang bật); 3 bố cục còn lại + bố cục cũ chưa có dữ liệu thật để xem.

**Còn dở:** mỗi app đang dùng CHUNG 1 mã khoá — nên xin Giám đốc tạo mã riêng từng app (eOffice › Quản trị › Cửa sổ thông tin › Kết nối app ngoài) rồi `wrangler secret put CUA_SO_KHOA` lại, để thu hồi được từng app.

## 2026-11-24 — Tách CLAUDE.md thành bản rút gọn + CLAUDE-full.md (không đổi code)

**Yêu cầu** (Trợ lý Mây nhắn theo lời Giám đốc): CLAUDE.md ~340 KB làm phiên Claude đám mây gần đầy bộ nhớ ngay khi mở → rút gọn dưới ~10 KB,
chi tiết chuyển sang tệp riêng. Anh Thái: *"tạo riêng 1 file claude.md rút gọn cho đối tác, 1 file claude-full.md để dành cho việc lưu chi tiết các công việc sau này.
sau này file claude.md lưu ngắn gọn còn file claude-full.md để lưu dữ liệu chi tiết rõ ràng"*.

**Đã làm**: `git mv CLAUDE.md CLAUDE-full.md` (giữ nguyên toàn bộ nội dung, thêm đầu đề giải thích); viết `CLAUDE.md` mới ~8,7 KB: hệ thống là gì, lệnh,
12 luật bắt buộc, bảng "nguồn sự thật duy nhất", vai trò, giao diện, danh mục tài liệu, mục nhận việc Trợ lý Mây (ba làn, lỗi máy chạy sai luật).
**Quy ước từ nay**: tính năng / quyết định mới ghi chi tiết vào `CLAUDE-full.md`; `CLAUDE.md` chỉ thêm khi là luật chung, giữ dưới 10 KB.

**Kiểm thử**: `wc -c` CLAUDE.md = 8.702 byte. Không đổi mã nguồn, không deploy.

## 2026-11-25 — v1.557: Chặn tạo tài khoản từ ETX khi đã khai báo vai trò + hiện vai trò văn phòng ở thẻ KTV

**Yêu cầu (nguyên văn):** "tài khoản này tôi chuyển sang giám sát mà bên ktv vẫn bị tồn lại là lỗi gì" → "1. thêm chặn nếu tk đã có khai báo gs hoặc ktv không cho tạo từ etx nữa
2. tài khoản đã có vai trò văn phòng thì hiện thị vai rõ vai trò nếu hiện trong đs ktv".

**Nguyên nhân:** thẻ "KTV hiện trường" liệt kê theo danh bạ mã KTV, không theo tài khoản. Chuyển sang văn phòng / Giám sát chỉ gỡ Gmail khỏi mã, danh bạ giữ
lại (mã NS-848 còn 4 dòng tồn kho MISA) → mã vẫn hiện như KTV. Nút "Tạo tài khoản" ở tab ETX nhân sự không kiểm vai trò → bấm sẽ gắn lại Gmail + bật cờ KTV.

**Đã làm:**
- `backend/src/lib/vaiTroVanPhong.ts` (mới): bộ mã vai trò văn phòng (vai_tro + 6 cờ văn phòng) — biểu thức SQL + hàm JS dùng chung.
- `taoTaiKhoanTuEtx`: chặn `DA_CO_VAI_TRO_VAN_PHONG` / `DA_LA_KTV`; `tuDongTaoKtvTuEtx` bỏ qua Gmail có vai trò văn phòng.
- GET `/etx-nhan-su` trả `tk_vai_tro_vp` → ẩn nút "Tạo tài khoản", nhãn "TK văn phòng: Giám sát".
- GET `/settings/ktv-lien-he` trả `vp_email` / `vp_vai_tro` (theo Email đăng nhập, chưa có thì theo Gmail danh bạ) → cột "Vai trò" thẻ KTV thêm nhãn "VP: Giám sát".

**Kiểm thử:** typecheck 2 phía 0 lỗi. Chạy biểu thức SQL trên D1 thật (chỉ đọc): 15 mã KTV ra vai trò văn phòng, gồm NS-848 → Giám sát, NS-3683 → Giám sát · View.
Chưa xem giao diện bằng trình duyệt (cần đăng nhập Google Admin).

**Còn dở:** mã NS-848 vẫn nằm trong danh bạ (giữ để không mất 4 dòng tồn kho MISA) — chưa làm tự tắt mã khi chuyển sang văn phòng.

## 2026-11-25 — v1.558: Chuyển sang văn phòng thì tự tắt mã KTV cũ

**Yêu cầu:** "Làm luôn" (việc còn dở của v1.557: chuyển tài khoản sang văn phòng / Giám sát thì tự tắt mã KTV cũ).

**Đã làm:**
- `POST /users/:email/chuyen-nhom-vai-tro` (van_phong): gỡ Gmail + `ngung_hoat_dong = 1` cho mã cũ, tính lại hash danh bạ.
- `PATCH /settings/ktv-lien-he/:ma/bat-tat`: bật/tắt được cả mã chưa gắn tài khoản (trước báo `CHUA_CO_TAI_KHOAN`).
- Gắn Gmail cho mã đang trống (form KTV / "Gắn mã KTV" / "Tạo tài khoản" ETX qua mã có sẵn) → mã tự bật lại.
- Thẻ KTV, cột "Tài khoản": mã chưa gắn tài khoản có công tắc + nhãn "Mã đã tắt".
- Dữ liệu: tắt 6 mã sót cùng kiểu (Gmail đã gỡ, người đó nay là tài khoản văn phòng): NS-848, NS-3683, NS-044, NS-1330, tuannv.gsmb, thienpt.bh
  (trước: cả 6 đang bật; bật lại được bằng công tắc).

**Kiểm thử:** typecheck 2 phía 0 lỗi, build xanh. Chưa xem giao diện bằng trình duyệt (cần đăng nhập Google Admin).

## 2026-11-25 — v1.559: Sửa lỗi đơn mất Mã MISA sau khi chuyển tài khoản sang văn phòng

**Yêu cầu (nguyên văn):** "kiểm tra đơn tạo của nhất tâm lại không ra thông tin mã misa => check bug".

**Nguyên nhân:** Mã MISA của đơn không lưu trên đơn mà tra theo người nhận hàng → mã KTV đang gắn Gmail đó. Sáng 25/11 tài khoản được
"Chuyển sang văn phòng" → Gmail bị gỡ khỏi mã NS-848 (Mã MISA TBP04) → 5 đơn của anh Nhất Tâm (3 đơn đang mở) mất Mã MISA. Cùng lỗi: NS-044
(NV0000015, 1 đơn đang mở).

**Đã sửa:** `POST /users/:email/chuyen-nhom-vai-tro` (van_phong) giữ liên kết mã có Mã MISA hoặc Gmail đã có đơn; chỉ gỡ + tắt mã chưa dùng.
Toast + hộp xác nhận ở thẻ KTV nói rõ. Dữ liệu: gắn lại NS-848 → nhattam8688@…, NS-044 → huonggiang20124@…, bật lại 2 mã (trước: chưa gắn, đã tắt).
4 mã còn lại tắt ở v1.558 không có Mã MISA / đơn → giữ nguyên.

**Kiểm thử:** typecheck 2 phía 0 lỗi; câu điều kiện chạy thử trên D1 thật (GS01 có Mã MISA → giữ liên kết).

## 2026-11-25 — v1.560: Quỹ dư không tự trừ phiếu đang chờ Kế toán (PMH-003000)

**Yêu cầu (nguyên văn):** "PMH-003000 đơn này kế toán báo lỗi quỹ dư nhưng không tự trừ tiền, kế toán duyệt phiếu chuyển về = 0 thì không duyệt được".

**Nguyên nhân:** KTV chuyển 1 lần 25tr, đính cùng sao kê cho PMH-002999 và PMH-003000. Kế toán duyệt PMH-002999 thực nhận 25tr → dư 17,6tr vào quỹ,
nhưng quỹ chỉ tự trừ phiếu "Chờ KTV chuyển" → PMH-003000 (đang "KTV đã chuyển") không được trừ. Kế toán từ chối ("trùng sao kê") → quỹ trừ đủ nhưng
phiếu bị giữ "Chờ KTV chuyển" cần chuyển 0đ → nút duyệt (chỉ nhận "KTV đã chuyển") không dùng được. Kế toán phải tự đính ghi chú rồi duyệt 0đ.

**Đã sửa:** `lib/quyKtv.ts` — `canBangPxk` + `phanBoQuy` trừ quỹ cả phiếu "KTV đã chuyển"; `routes/phieuXuatKho.ts` — Kế toán từ chối mà quỹ đã trả đủ
→ phiếu đóng "Kế toán đã duyệt" (TN đẩy lại giữ như cũ).

**Dữ liệu:** PMH-003000 đã xong (Kế toán đã duyệt, đủ 13.824.000đ, quỹ còn 3.788.650đ, khớp sổ). Quét toàn bộ: không còn phiếu nào kẹt "Chờ KTV chuyển"
đã đủ tiền, cũng không còn phiếu "KTV đã chuyển" thiếu tiền mà quỹ người nhận còn dư.

**Kiểm thử:** typecheck backend 0 lỗi, build xanh. Chưa thử lại thao tác duyệt trên giao diện.

## 2026-11-25 — v1.561: KTV sửa số tiền thực tế cho mã Phí dịch vụ

**Yêu cầu (nguyên văn):** "với mã linh kiện phí dịch vụ (đang để 150.000) cho phép ktv sửa lại số tiền thực tế. (khi ktv chọn mã phí dịch vụ, hiện cảnh báo là phí có thể thay đổi và hiện số tiền để ktv nhập hoặc giữ nguyên)".

**Đã làm:**
- Nhận diện "mã phí dịch vụ" theo TÊN linh kiện có chữ "phí dịch vụ" (không phân biệt dấu / hoa thường) → bắt cả mã `10002` "Phí dịch vụ" lẫn `1002`
  "phí dịch vụ" (đều 150.000đ), không cần migration / cột mới. Hàm `laPhiDichVu` (BE `lib/pxkRecalculate.ts`, bản sao FE `helpers.ts`).
- Form tạo đơn (web + điện thoại): chọn mã phí dịch vụ → khung vàng cảnh báo "Phí dịch vụ có thể thay đổi theo thực tế…" + ô **Số tiền thực tế (đ)**
  điền sẵn giá danh mục; KTV gõ số khác hoặc bấm "↺ Giữ nguyên". Ô trống / 0 → dòng chưa đủ thông tin, không tạo được. Giá ước tính, tổng đơn,
  tiền đối tác trên form theo số đã nhập; ẩn cảnh báo "chưa có Giá KTV" với mã này. Component `PhiDichVu.tsx`.
- Server `POST /phieu-dat` (+ `/phieu-dat/kiem-tra`) nhận `gia_ktv_nhap` (chỉ khi mã là phí dịch vụ; > 0, ≤ 1 tỷ, sai → `GIA_PHI_DICH_VU_KHONG_HOP_LE`).
  Số khác giá danh mục → ghi `dat_don_hang.gia_chot` (giá chốt luôn thắng chiết khấu → PXK, MISA, quỹ đều theo số này) + dòng log
  "💲 Phí dịch vụ: người đặt nhập đơn giá thực tế …". Bộ quyết định tự duyệt (chuyển tiền / giá 0 / công nợ đối tác) dùng số đã nhập.
- Bản dịch EN / ID cho các câu mới.

**Giới hạn:** chỉ tác động đơn có tiền (mua / trừ công nợ / công nợ đối tác); đơn loại công nợ / hỗ trợ vẫn tính theo giá trị công nợ như cũ.
Import Excel, API đối tác và sửa đơn sau khi tạo không có ô này (Kế toán vẫn sửa giá chốt như trước).

**Kiểm thử:** typecheck 2 phía 0 lỗi, build xanh, bản dịch không thiếu câu mới. Chạy local (DB demo, thêm mã 10002): API kiểm tra trước nhận 250.000 → tự duyệt,
-5 → báo lỗi; tạo đơn trên giao diện web nhập 250.000 → DDH-000185 `gia_chot` 250.000, log đúng, phiếu PMH-000033 dòng phí dịch vụ 250.000đ
(các dòng khác vẫn chiết khấu theo giá KTV). Chưa chụp màn điện thoại (dùng chung component).


## 2026-11-25 — v1.562: mục "BC KPIs" (tỷ lệ thiếu hàng, tốc độ Kho, đơn có mã sự cố) + tải Excel

**Yêu cầu (nguyên văn):** "đây là báo cáo mua hàng tháng 10 của tôi. hãy phân tích các chỉ số => liệt kê các số liệu cần thiết => báo cáo các số liệu có trên hệ thống => đề xuất phương án triển khai => xây dựng trên app mục BC KPIs cho phép tải về (bc này không cần chạy liên tục, chỉ cần thêm nút load bc, thì mới load số liệu khi cần)".

**Phân tích file "BC mua hang 2610.xlsx":** 3 chỉ số — (1) tỷ lệ thiếu hàng theo Miền × Tuần (SL xuất; B2B không tính; mục tiêu MB 1,5% / MN 2%);
(2) tỷ lệ phiếu Kho xử lý ≤ 24h sau khi Kế toán chốt; (3) sheet "Ms Hằng": đơn có Mã yêu cầu sự cố / Mã Lada + tổng thời gian xử lý.
Mọi cột nguồn đều có trong D1. Hai điểm lệch của file cũ: công thức tốc độ Kho trừ ngược (chốt − kho → số âm → gần như phiếu nào cũng "đạt",
99,6% / 99,4%); tỷ lệ thiếu cộng cả đơn hủy / từ chối vào mẫu số (có 1 đơn hủy SL ~3.000 ở MB tuần 42).

**Số thật tháng 10 (bỏ đơn hủy, chạy 25/11):** thiếu hàng MB 0,65% · MN 0,49% (đạt mục tiêu); Kho xuất ≤ 24h MB 81,7% (411/503) · MN 69,1% (504/729);
2.009 đơn có mã sự cố / Lada (chưa lọc giá trị rác), TB ~10 ngày từ tạo đơn đến KTV nhận / hoàn tất.

**Đã làm:**
- API `GET /api/bao-cao-kpi?thang=YYYY-MM[&gom_huy=1]` (`routes/baoCaoKpi.ts`) — tính tại chỗ, không cache, không cron; chặn KTV / Vệ tinh.
- Màn **Hệ thống › BC KPIs** (`modules/BcKpisModule.tsx`): chọn tháng, ô "Tính cả đơn hủy / từ chối", nút **Tải số liệu** (chỉ lúc bấm mới gọi API),
  ô KPI + 2 bảng Miền × Tuần có dòng Tổng, nút **Tải Excel** (6 sheet: Ghi chú, Tỷ lệ thiếu hàng, Tốc độ Kho, Mã sự cố - Lada, DON, PHIEU).
- Mã sự cố / Lada kiểu "Ko", "k", "0", "-" coi như không có mã.

**Kiểm thử:** typecheck 2 phía 0 lỗi, build xanh. Chạy local trên bản sao 8 bảng của D1 thật: API tháng 10 trả 4.143 đơn / 1.534 phiếu trong ~0,3 giây,
tổng khớp truy vấn đối chiếu; màn hình hiển thị đúng. Chưa bấm thử nút Tải Excel trong trình duyệt (không tải file về máy khi kiểm thử).

## 2026-11-25 — Cập nhật tài liệu hướng dẫn cấp LK sửa chữa / xác / trả xác / trừ công nợ (chỉ tài liệu, app vẫn v1.562)

- Yêu cầu nguyên văn: "rà soát lại luồng trả trả xác linh kiện, kiểm tra xem đã có tài liệu hướng dẫn, mô tả html chưa?" → "Cập nhật tài liệu".
- Rà soát: luồng trong `routes/suachuaDonSc.ts` (`/tru-cong-no`, `/tru-cong-no/:id/huy`, `/don-sc/:id/da-nhan`, `dayPhieuSuaChuaSangKeToan`) + Kế toán chốt
  phiếu trả tự "Kho đã nhận hàng trả" vẫn đúng luật đã chốt. Hai điểm biên rủi ro thấp (chưa sửa): 2 lần xác nhận khác `lan` gửi cùng lúc có thể cùng lọt
  kiểm tra `VUOT_SL_NHAN`; phiếu trả gom chung đơn trả hàng thường thì không tự đẩy thẳng Kế toán.
- Đã làm: `docs/Huong_dan_cap_LK_sua_chua_tra_xac.html` (bản v1.509) cập nhật theo v1.562: thêm Tóm tắt 5W1H; loại đơn là GỢI Ý, người đặt được chọn lại
  kèm cảnh báo "⚠ Khác loại gợi ý" (v1.547) — mục 1.1 mới + ảnh chụp chi tiết đơn; cảnh báo chọn sai loại ở form (v1.510); "Dịch vụ tính phí" → MUA HÀNG
  SỬA CHỮA, xét trước bảo hành (v1.548) ở bảng loại đơn, thứ tự xét, Admin BH phân loại, Kế toán, Tình huống; thêm mục Lịch sử cập nhật tài liệu.
- Kiểm thử: ảnh chụp từ Worker local dữ liệu demo (gắn tạm `loai_goi_y` cho 1 đơn demo, đã gỡ) — khối đỏ + chip "Khác loại gợi ý" ở chi tiết đơn hiển thị
  đúng (lần đầu xem thử giao diện v1.547); mở file HTML bằng Chrome, bố cục đúng. Chưa chụp khối cam cảnh báo ở form tạo đơn (cần chạy kèm app đổi trả).

## 2026-11-25 — v1.563: đơn cũ bị hủy không còn sinh lại ca "Chờ giải trình" quá hạn của tháng trước

- Yêu cầu nguyên văn: "đơn này hủy lâu rồi sao vẫn còn đẩy lại yêu cầu giải trình?" (ảnh DDH-001568 — Nguồn 24V 1.5A KAROFI, 2 thanh quá hạn
  "Kho tiếp nhận thiếu hàng" + "Duyệt đơn (Kế toán thay TN)").
- Nguyên nhân: 25/11 14:52 ticket TLK-000200 bị hủy bỏ → đơn tự hủy → có log mới → lần quét vi phạm 15:00 đọc lại TOÀN BỘ log của đơn / ticket và
  sinh ca cho các khoảng đã đóng từ tháng 10 (chờ duyệt 09/10→12/10, chờ Kho 12/10→17/10), trái luật đã chốt "không quét ngược lịch sử".
- Đã sửa (`lib/viPham.ts`): chỉ xét khoảng còn mở hoặc kết thúc bằng log sau mốc quét trước. Dữ liệu: ca DDH-001568 bước Duyệt đơn còn "Chờ giải trình"
  → tự "Đã giải trình" (ghi nhận không đúng — sinh sai do quét lại lịch sử). Rà toàn bảng: 93 ca có khoảng kết thúc trước khi bật module (17/11);
  90 đã giải trình, 2 Tồn CEO (đối tác đã kéo — không đụng, chỉ liệt kê), 1 ca trên.
- Kiểm thử: typecheck backend 0 lỗi, build xanh; truy vấn D1 thật đối chiếu.

## 2026-11-25 — Tài liệu HTML hướng dẫn vai trò KTV (chỉ tài liệu, app v1.563)

- Yêu cầu nguyên văn: "rà soát lại tài liệu hướng dẫn cho vai trò KTV => tạo lại tài liệu hướng dẫn html cho vai trò KTV đầy đủ quy trình, ảnh minh họa, hướng dẫn chi tiết".
- Rà soát: bản cũ `docs/Huong_dan_su_dung_App_Dat_hang_linh_kien.docx/.pdf` dừng ở v1.462 (09/11, không nằm trong git) — thiếu ~20 thay đổi với KTV
  (popup Việc cần xử lý, form tạo đơn giỏ hàng + luồng ngang chi tiết đơn, phiếu chờ hàng tách riêng, tách / gộp phiếu đã đủ tiền, Phí dịch vụ nhập tay,
  KH chuyển khoản không cần hóa đơn, sổ quỹ 4 ô, quỹ dư trừ cả phiếu "KTV đã chuyển", trả hàng tự hủy 10 ngày, tự xét lại Chờ GS duyệt, thông báo tự xoá 10 ngày),
  và còn mô tả khung chat Hỏi đáp đã gỡ (v1.516).
- Đã làm: `docs/Huong_dan_KTV_dat_hang_linh_kien.html` — 18 mục (5W1H, luồng ngang đơn mua / công nợ + nhánh rẽ, đăng nhập / Trang chủ / menu, tạo đơn,
  loại đề xuất & giá, theo dõi đơn, phiếu xuất, chuyển tiền, quỹ, nhận hàng / báo nhận thiếu, hủy / yêu cầu hủy, thiếu hàng, trả hàng, công nợ, bảng giá,
  thông báo, tình huống, có gì mới so với v1.462), 39 ảnh (36 chụp mới trên điện thoại + máy tính, 3 ảnh trạng thái đã tải ảnh chuyển khoản lấy từ bản v1.462).
- Cách chụp: Worker local + bản sao dữ liệu demo riêng (tài khoản KTV Demo), cấu hình tạm KHÔNG có service binding `remote` (bản thường gọi Worker thật
  và làm `wrangler dev` sập khi trang huỷ request); Chrome headless qua CDP. Đã tạo thêm 3 đơn demo khi chụp (chỉ trên DB tạm).
- Phát hiện (chưa sửa): câu mô tả tab "Quỹ KH chuyển khoản" (`QuyChuyenTienModule.tsx`) vẫn ghi "cho đơn có yêu cầu xuất hóa đơn" — lệch với v1.521.

## 2026-11-25 — v1.564: Sửa câu giới thiệu tab "Quỹ KH chuyển khoản"

- Yêu cầu nguyên văn: "Sửa luôn" — trả lời câu hỏi sửa câu mô tả tab Quỹ KH chuyển khoản cho khớp v1.521 (phát hiện khi làm tài liệu KTV).
- Đã làm: `QuyChuyenTienModule.tsx` — câu "Tiền khách hàng chuyển khoản về công ty cho đơn có yêu cầu xuất hóa đơn…" đổi thành "Tiền khách hàng tự chuyển
  khoản về công ty cho đơn tích "Khách hàng đã chuyển khoản về công ty" (có hay không xuất hóa đơn đều được)…" (từ v1.521 không còn bắt chọn hóa đơn);
  bản dịch EN / ID sửa theo. Không đổi logic.
- Kiểm thử: typecheck frontend 0 lỗi, build xanh; `kiem-tra-dich` câu mới đủ EN / ID (34 câu thiếu dịch có sẵn từ trước, không đổi).

## 2026-11-25 — v1.565: Gộp "Thiếu hàng bảo hành" vào danh sách Thiếu hàng + cột "Nguồn tiếp nhận"

- Yêu cầu nguyên văn: "gộp thiếu hàng lk dặt mua với đổi trả vào cùng 1 tab để tiện quản lý và phản hồi kết quả, bổ sung thêm 1 cột nguồn tiếp nhận" (kèm ảnh 3 tab Thiếu hàng đặt mua / KTV báo nhận thiếu / Thiếu hàng bảo hành).
- Đã làm: backend `GET /dat-mua-lk/thieu-lk` + `/thieu-lk-status-counts` trả chung ticket TLK (đặt mua) và THB (thiếu hàng bảo hành từ app Bảo hành đổi trả), phân trang / lọc / đếm phía server;
  tham số + cột **Nguồn tiếp nhận** (chọn nhiều): App đặt LK · Đổi trả — cấp LK · API đối tác · Đổi trả — thiếu hàng BH. Giao diện: menu Thiếu hàng còn 2 tab — "Thiếu hàng (đặt mua + bảo hành)" (chip "BH n" = THB chờ mình) và "KTV báo nhận thiếu";
  dòng THB bấm mở popup xử lý THB như cũ (mỗi bước vẫn báo về đơn bảo hành gốc). KTV không thấy THB (như trước).
- Kiểm thử: typecheck 2 phía 0 lỗi, build xanh, bản dịch EN / ID đủ câu mới. Local (D1 demo + 3 THB mẫu, tài khoản Admin): thứ tự trộn theo ngày báo, ghép các trang khớp danh sách đầy đủ 26/26, lọc nguồn / từ khoá / nhóm trạng thái, số đếm có THB, bấm "Chuyển Mua hàng" trong popup THB → dòng đổi "Chờ Mua hàng" ngay; xem giao diện máy tính + điện thoại.
- Lưu ý: THB "Hàng đã về" đếm vào nhóm "Đã duyệt đơn gốc", THB từ chối / không mua được đếm vào "Đã huỷ bỏ" (dòng vẫn ghi nhãn gốc). Chưa thử với tài khoản Kho / Mua hàng thật trên production.

## 2026-11-26 — v1.566: Danh sách Đơn hàng tìm ra 0 đơn → gợi ý ticket Thiếu hàng bảo hành khớp mã

- Yêu cầu nguyên văn (người dùng báo từ app Bảo hành đổi trả, ảnh đơn DH-006253-1): "mã "SC2611090581" này đã tạo đơn linh kiện, nhưng bên app linh kiện lại không tìm thấy =>> check bug"; tìm ở "Danh sách Đơn hàng".
- Đã tra D1 thật (chỉ đọc): ca này KHÔNG có đơn đặt (DDH) nào — chỉ có 4 ticket THB-000144 → 147 (mã case đúng `SC2611090581`, "Mua hàng đã đặt" EO 14.11). Dữ liệu 2 bên khớp; Ctrl+K và tab Thiếu hàng đều tìm ra. Danh sách Đơn hàng chỉ chứa đơn đặt nên ra trống → người dùng tưởng mất đơn.
- Đã làm: danh sách Đơn hàng tìm ra 0 đơn với từ khoá ≥ 3 ký tự → gọi lại `/dat-mua-lk/search` (cùng quyền xem THB với Ctrl+K: Kho / TN / Mua hàng / Kế toán / View / Admin) và hiện dòng gợi ý "Không có đơn đặt linh kiện nào khớp …, nhưng mã này có n phiếu thiếu hàng bảo hành" + chip bấm mở chi tiết ticket THB (popup `XemThieuHangBh` có sẵn). Không thêm API backend.
- Kiểm thử: build frontend (tsc -b + vite) xanh; bản dịch EN / ID đủ câu mới. Chưa thử trên giao diện thật bằng tài khoản Kho / Mua hàng.


## 2026-11-26 — v1.567: API `case-timeline` nhận thêm mã đơn DDH (đơn không gắn mã ca vẫn hiện ở chi tiết ca DVBH)

- Yêu cầu (từ hệ DVBH, ca SC261020228): "ca giải trình này gs đã điền mã DDH-xxxx sao vẫn không liên kết với bên linh kiện?" → chủ hệ thống chọn "Sửa cả 2 app".
- Vì sao: đã tra D1 thật (chỉ đọc) — đơn DDH-004676 do trạm tạo 30/10 KHÔNG chọn mã ca (`ma_yeu_cau_su_co` trống, không có dòng `dat_don_case`);
  `/v1/case-timeline` chỉ khớp theo mã ca nên DVBH không thấy đơn dù giám sát đã ghi mã DDH trong giải trình.
- Đã làm: `GET /api/partner/v1/case-timeline` thêm tham số tuỳ chọn `ma_don` (≤20 mã dạng `DDH-<số>`), `buildCaseTimeline` gộp thêm các đơn đó.
  Không đổi cấu trúc kết quả, không ghi dữ liệu (không tự gắn mã ca vào đơn). Tài liệu API lên 2.6.
- Kiểm thử: typecheck backend; gọi thật API sau deploy với ca SC261020228.

## 2026-11-26 — v1.568: Ngày dự kiến trên EO Mua hàng tự ghi đè lên ticket thiếu hàng THB / TLK (mỗi giờ)

- Báo lỗi (nguyên văn): "Nhân viên báo bug: 3004022213 linh kiện này nhân viên đã cập nhật trên EO Mua hàng ngày dự kiến hàng về rồi. Nhưng trên app đặt hàng
  vẫn chưa có thông tin => kiểm tra các app liên kết xem logic nhận thông tin ngày dự kiến có bị bug không". Chốt: "Có, EO ghi đè luôn".
- Vì sao: tra D1 thật 3 app (chỉ đọc) — EO dòng 9154 (3TDO-000847, ID CRM THB-000147) có ngày 07/12 từ 20/11; ticket THB-000147 bên này + app Sửa chữa bảo hành chỉ có
  ngày từ 26/11 14:04 do Mua hàng gõ tay. App không có đường nhận ngày từ EO. Lúc tra: 3 THB + 29 TLK đang mở trống ngày, 10 TLK khác ngày EO.
- Đã làm: `lib/dongBoNgayEo.ts` + cron mỗi giờ + migration 0136 (`dong_bo_ngay_eo_log`); EO v0.126 thêm `POST /api/partner/theo-id`.
- Kiểm thử: typecheck backend; sau deploy kiểm tra lượt cron đầu qua `dong_bo_ngay_eo_log` trên D1 thật.
