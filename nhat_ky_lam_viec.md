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

