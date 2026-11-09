# Báo cáo rà soát bảo mật — App Đặt mua linh kiện (v1.458, 2026-11-09)

Phạm vi: mã nguồn backend (Worker Hono + D1), frontend, cấu hình `wrangler.jsonc`, `_headers`, thư viện. Phương pháp: đọc
code các lớp xác thực, phân quyền, API đối tác, SQL, tải ảnh, header, cùng `npm audit`. **Chưa** thử tấn công thật trên
production và **không** đọc được dữ liệu production. Mức độ đánh giá theo bối cảnh: ~vài trăm người dùng nội bộ + CTV/KTV
bên ngoài, có tiền và công nợ chạy qua hệ thống.

## 1. Những gì đang làm tốt (giữ nguyên)

- Đăng nhập Google OAuth có `state` chống giả mạo, kiểm tra `email_verified`, phiên JWT ký HMAC-SHA256 trong cookie
  `httpOnly + Secure + SameSite=Lax`; thu hồi phiên ("Đăng xuất mọi thiết bị") bằng `phien_ban_phien`.
- Tài khoản mới mặc định "Chờ duyệt"; khoá / từ chối chặn ở mọi request (`loadUser`).
- Chống CSRF 2 lớp (SameSite + kiểm tra `Sec-Fetch-Site`/`Origin` cho mọi request ghi).
- Giới hạn tần suất theo tài khoản / IP / khoá đối tác.
- SQL dùng tham số; cột sắp xếp / lọc lấy từ danh sách trắng (`locCot.ts`) — không thấy chỗ ghép chuỗi người dùng vào SQL.
- Khoá API đối tác lưu dạng băm; khoá khovan/suachua so sánh thời gian cố định (`khoaKhop`).
- Refresh token Google Drive mã hoá AES-GCM trong D1.
- CSP chặt (`script-src 'self'`), HSTS, `nosniff`, `frame-ancestors 'self'`; không có `dangerouslySetInnerHTML`.
- Ảnh tải lên: giới hạn loại/kích thước/số lượng mỗi ngày; URL ảnh client gửi chỉ nhận link Drive.
- Tiền/quỹ: sổ quỹ chỉ ghi thêm, CAS chống bấm 2 lần, `CHECK so_du >= 0`.
- Bí mật không nằm trong git (`.dev.vars` không được commit, `backups/` không được theo dõi).

## 2. Các vấn đề phát hiện

| # | Vấn đề | Mức độ |
|---|--------|--------|
| 1 | Mọi tài khoản đã duyệt (kể cả KTV/CTV) đọc được TOÀN BỘ danh bạ KTV và bảng giá nội bộ | **Cao** |
| 2 | Ảnh bằng chứng chuyển khoản / nộp quỹ công khai trên Drive ("ai có link đều xem") | **Cao** |
| 3 | Kiểm soát nội bộ tiền: 1 Kế toán tự làm trọn vòng cộng/trừ quỹ, không người thứ 2 | **Trung bình – Cao** |
| 4 | Không có nhật ký thay đổi quyền tài khoản | **Trung bình** |
| 5 | Quyền Admin rộng, chỉ dựa vào mật khẩu Gmail | **Trung bình** |
| 6 | API đối tác: 1 khoá đọc mọi dữ liệu; khoá khovan/suachua dùng chung, tĩnh, có quyền GHI | **Trung bình** |
| 7 | Phiên 72h trượt; "Đăng xuất" chỉ xoá cookie trên máy | **Trung bình – Thấp** |
| 8 | Chạy trên `*.workers.dev`: không WAF, không chặn được tấn công nhiều IP | **Trung bình – Thấp** |
| 9 | Thư viện `xlsx` 0.18.5 có lỗ hổng (prototype pollution, ReDoS), npm không có bản vá | **Thấp** |
| 10 | Chi tiết lỗi kỹ thuật trả về cho người dùng (import đơn từ v1.457) | **Thấp** |
| 11 | Ảnh tải lên chỉ kiểm tra `Content-Type`, không kiểm tra nội dung file | **Thấp** |
| 12 | Sao lưu chỉ dựa vào Time Travel 30 ngày của D1, không có bản sao ngoài | **Thấp (vận hành)** |

### Chi tiết

**#1 — Lộ danh bạ và giá nội bộ (Cao).**
- `GET /api/settings/ktv-lien-he` (`routes/settingsKtv.ts`) chỉ yêu cầu đăng nhập: trả `k.*` = SĐT, Gmail, Gmail phụ, mã
  nhân sự, Mã/Tên MISA, công nợ, hạn mức dự phòng của mọi KTV.
- `GET /api/settings/linh-kien` (`routes/settingsDatMua.ts`) trả `SELECT * FROM linh_kien` = giá KTV, giá dự phòng, giá trị
  công nợ, giá EU… cho cả KTV/CTV (giao diện chỉ ẩn, API vẫn trả).
- Kịch bản: 1 CTV nghỉ việc / bị mua chuộc mở DevTools hoặc gọi API, tải nguyên danh bạ + bảng giá nội bộ trong vài giây
  (vi phạm dữ liệu cá nhân theo Nghị định 13/2023, lộ chính sách giá cho đối thủ).

**#2 — Ảnh chứng từ công khai (Cao).** `uploadPublicImage()` đặt quyền `anyone/reader` cho MỌI ảnh, gồm ảnh chuyển khoản
(họ tên, số tài khoản, số tiền, nội dung). Link không đoán được, nhưng lan ra qua file Excel "Tải danh sách chi tiết" (có cột
link ảnh), tin nhắn chuyển tiếp, lịch sử trình duyệt — ai có link xem mãi mãi, không thu hồi được theo người.

**#3 — Kiểm soát nội bộ tiền (Trung bình – Cao).** 1 tài khoản Kế toán làm một mình được: ghi "Tiền ngoài vào quỹ" (kể cả
import hàng loạt), "Điều chỉnh" +/−, sửa "thực nhận" của khoản đã duyệt, duyệt nộp tiền quỹ, duyệt chuyển tiền phiếu. Tiền
cộng vào quỹ tự trả phiếu chờ → hàng xuất đi. Sổ quỹ có ghi người/lý do (truy được SAU), nhưng không có bước người thứ 2
duyệt, không có cảnh báo bất thường. Rủi ro gian lận nội bộ hoặc nhầm lẫn số lớn.

**#4 — Không nhật ký phân quyền (Trung bình).** `PATCH /api/users/:email` ghi đè cờ vai trò, khoá, Admin… không lưu lịch
sử. Không trả lời được "ai cấp quyền Kế toán cho X, lúc nào".

**#5 — Admin (Trung bình).** Admin xem được mọi dữ liệu, "xem như" bất kỳ ai, tạo khoá API đối tác, sửa quyền. Bảo vệ duy
nhất là tài khoản Gmail (`BOOTSTRAP_ADMIN_EMAIL` + các Admin khác). Mất 1 Gmail Admin = mất toàn hệ thống.

**#6 — API đối tác (Trung bình).**
- `partner_api_keys`: khoá nào cũng đọc được TẤT CẢ endpoint `/api/partner/v1/*` (công nợ KTV, tồn kho, lịch sử đơn…).
- `KHOVAN_PARTNER_API_KEY` đổi được trạng thái phiếu xuất; `SUACHUA_SYNC_API_KEY` tạo/hủy ticket, sửa phân loại LK. Khoá
  tĩnh, không hạn, không giới hạn nguồn gọi; lộ ở 1 hệ đối tác = ghi được vào hệ này.
- Giới hạn tần suất đối tác tính theo băm của khoá gửi lên → kẻ tấn công đổi khoá ngẫu nhiên mỗi lần là né được giới hạn
  (mỗi lần tốn 1 truy vấn D1).

**#7 — Phiên (Trung bình – Thấp).** Cookie phiên sống 72h, tự gia hạn. "Đăng xuất" chỉ xoá cookie ở máy đó; nếu cookie đã bị
lấy (máy dùng chung, tiện ích trình duyệt độc) thì vẫn dùng được tới khi Admin bấm "Đăng xuất mọi thiết bị".

**#8 — Hạ tầng (Trung bình – Thấp).** `*.workers.dev` không gắn được WAF / Rate Limiting rule / Bot Fight của Cloudflare.
Tấn công từ nhiều IP chỉ tốn tiền Worker + D1 (giới hạn đọc ngày), không chặn được ở biên.

**#9 — `xlsx` (Thấp).** Chỉ chạy trên trình duyệt với file người dùng tự chọn. Rủi ro khi Kế toán/TN mở file Excel độc do
người ngoài gửi (treo tab, prototype pollution trong trang có phiên đăng nhập).

**#10 — Lộ lỗi kỹ thuật (Thấp).** Import đơn (v1.457) trả `e.message` (có thể chứa câu SQL / tên bảng) cho người dùng đã đăng
nhập để họ biết KTV nào lỗi. Các route khác chỉ trả `INTERNAL_ERROR` + `requestId`.

**#11 — Ảnh (Thấp).** Chỉ tin header `Content-Type`; file không phải ảnh vẫn lên Drive công khai dưới đuôi ảnh.

**#12 — Sao lưu (Thấp).** D1 Time Travel giữ 30 ngày; xoá/ghi đè sai phát hiện muộn hơn 30 ngày, hoặc mất tài khoản
Cloudflare, là mất dữ liệu.

## 3. Đề xuất ban đầu

1. Lọc dữ liệu theo vai trò ở SERVER: danh bạ KTV — KTV/CTV chỉ nhận cột tên/mã/khu vực (hoặc chỉ của chính mình); văn phòng
   giữ như cũ. Bảng giá — KTV/Vệ tinh chỉ nhận cột Giá NY + Giá KTV + thông tin hiển thị.
2. Ảnh chứng từ tiền chuyển sang thư mục Drive RIÊNG, không công khai; xem qua endpoint của Worker có kiểm tra quyền (đọc ảnh
   bằng token Drive rồi trả lại). Ảnh minh hoạ linh kiện giữ công khai.
3. Kiểm soát 2 người cho tiền: khoản "Tiền ngoài vào quỹ" / "Điều chỉnh +" vượt ngưỡng (vd 5 triệu/khoản hoặc 20 triệu/ngày/người)
   cần Admin (hoặc Kế toán khác) duyệt; báo cáo hằng ngày các khoản cộng quỹ không có ảnh ngân hàng.
4. Bảng `users_quyen_log`: mọi thay đổi cờ vai trò / khoá / Admin / Gmail phụ / gán mã KTV ghi người làm, trước → sau.
5. Bật Xác minh 2 bước bắt buộc cho Gmail Admin, Kế toán; giữ ≤ 2–3 Admin.
6. Khoá đối tác theo phạm vi (danh sách endpoint được phép cho từng khoá); xoay khoá khovan/suachua 6 tháng/lần; chuyển
   khovan sang Service Binding như suachua nếu cùng tài khoản Cloudflare. Giới hạn tần suất đối tác theo IP khi khoá sai.
7. Phiên: giảm còn 24h hoặc thêm hạn tuyệt đối 7 ngày; "Đăng xuất" tăng `phien_ban_phien` khi người dùng chọn "đăng xuất khỏi
   máy này và máy khác".
8. Gắn tên miền riêng → bật WAF managed rules + Rate Limiting rule + Bot Fight Mode.
9. Thay `xlsx` npm bằng bản SheetJS 0.20.x từ `cdn.sheetjs.com` (đã vá) hoặc `exceljs`.
10. Import đơn: chỉ trả mã lỗi gọn + `requestId`, chi tiết ghi log server.
11. Kiểm tra "magic bytes" (JPG/PNG/WEBP/GIF/HEIC) trước khi đẩy Drive.
12. Sao lưu tuần: `wrangler d1 export` tự động (GitHub Action) lưu file mã hoá ra ngoài Cloudflare.

## 4. Tự phản biện

- **#1 lọc danh bạ:** màn "Danh sách KTV" đang cho MỌI người xem (chốt trước đây, vd tab Hạn mức dự trữ), ô chọn người nhận khi
  đặt hộ cần danh bạ. Chặn trắng sẽ vỡ tính năng → phải lọc theo CỘT và theo vai trò, không chặn cả route. KTV có cần thấy
  SĐT đồng nghiệp không? Nếu nghiệp vụ cần gọi nhau thì giữ SĐT, bỏ công nợ/hạn mức/Gmail. → Cần chủ hệ thống chốt danh sách cột.
- **#2 ảnh riêng tư:** proxy ảnh qua Worker tốn CPU/băng thông và hạn mức Drive API; OCR đọc tiền trên trình duyệt đang lấy
  ảnh trực tiếp từ `lh3.googleusercontent.com` → phải sửa cả OCR; ảnh cũ (hàng nghìn) vẫn công khai trừ khi chạy đổi quyền
  hàng loạt. Rủi ro thực tế: link khó đoán, chỉ lộ khi có người chuyển tiếp. → Làm cho ảnh MỚI trước, ảnh cũ đổi quyền dần;
  hoặc chấp nhận rủi ro nếu ưu tiên tốc độ.
- **#3 hai người duyệt:** làm chậm Kế toán ở thời điểm đầu tháng (import trừ lương hàng loạt). Ngưỡng theo khoản + báo cáo
  bất thường cho Admin xem cuối ngày ít cản trở hơn duyệt từng khoản. → Chọn "ngưỡng + báo cáo", không duyệt mọi khoản.
- **#5 2FA:** không làm được bằng code (Google cá nhân không ép được) — là việc của chủ hệ thống.
- **#6:** đổi khoá đối tác cần phối hợp 2 repo khác (khovan, suachua) — phải làm cùng đợt, có thời gian song song 2 khoá.
- **#7:** rút phiên còn 24h làm KTV phải đăng nhập lại hằng ngày (trước đây đã từng bị phàn nàn khi phiên 8h) → giữ 72h trượt,
  chỉ thêm hạn tuyệt đối 30 ngày.
- **#8:** tên miền riêng tốn phí + đổi OAuth redirect, push, link trong thông báo cũ; lợi ích lớn nhất chỉ khi bị tấn công thật.
  → Để đợt sau, khi có tên miền công ty.
- **#9:** đổi thư viện đọc Excel chạm mọi màn import (≥ 10 màn) → rủi ro hồi quy cao hơn lỗ hổng (chỉ đọc file tự chọn). → Đợt sau.

## 5. Phương án chốt (đề xuất thực hiện)

**Đợt 1 — làm ngay, rủi ro thấp, không đổi thói quen người dùng:**
1. (#1) Lọc cột danh bạ KTV và bảng giá theo vai trò ở server (sau khi chủ hệ thống chốt cột KTV/CTV được thấy).
2. (#4) Nhật ký thay đổi quyền tài khoản + màn xem lịch sử ở Quản lý người dùng.
3. (#10) Gọn thông điệp lỗi import; (#11) kiểm tra magic bytes ảnh.
4. (#5) Chủ hệ thống: bật Xác minh 2 bước cho mọi Gmail Admin / Kế toán, rà danh sách Admin.

**Đợt 2 — cần chốt nghiệp vụ:**
5. (#3) Ngưỡng tiền cần Admin duyệt + báo cáo bất thường hằng ngày.
6. (#2) Ảnh chứng từ tiền MỚI để riêng tư + xem qua Worker; ảnh cũ chuyển dần.
7. (#6) Khoá đối tác theo phạm vi + kế hoạch xoay khoá cùng khovan/suachua; (#7) hạn phiên tuyệt đối 30 ngày.

**Đợt 3 — hạ tầng:**
8. (#8) Tên miền riêng + WAF; (#12) sao lưu tuần ra ngoài; (#9) thay thư viện Excel.
