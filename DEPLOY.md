# DEPLOY.md — Checklist triển khai lần đầu

Repo này có đầy đủ mã nguồn sẵn sàng deploy, nhưng CHƯA có tài nguyên Cloudflare/Google thật (đúng
phạm vi đã thống nhất khi tách hệ thống — xem `CLAUDE.md` mục "Nguồn gốc tách hệ thống"). Làm theo
đúng thứ tự dưới đây. **Xác nhận với người yêu cầu trước khi chạy bất kỳ lệnh nào ở đây** nếu bạn là
một phiên AI mới không chắc đã được uỷ quyền — đây đều là hành động tạo/sửa tài nguyên thật.

## 1. Tạo Google Cloud OAuth Client mới

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo project mới (hoặc dùng project
   riêng cho hệ này, KHÔNG dùng chung project của hệ DVBH gốc).
2. APIs & Services → OAuth consent screen → cấu hình cơ bản (tên app "Đặt mua linh kiện", email hỗ
   trợ).
3. APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.
   - Authorized redirect URI: `https://linhkien.dichvu3t.workers.dev/api/auth/callback` (domain đã
     chốt sẵn trong `wrangler.jsonc` — có thể thêm tạm `http://localhost:8788/api/auth/callback` nữa
     để test local trước).
4. Lưu lại `Client ID` + `Client Secret` — dùng ở bước 4.
5. Bật thêm Google Drive API cho project này (APIs & Services → Library → Google Drive API →
   Enable). Không cần tạo thêm credential — dùng chung OAuth Client ở trên với scope `drive.file` (đã
   khai trong `settingsDatMua.ts`). Kết nối qua `GoogleDriveTab` (Settings) này dùng cho **mọi** ảnh
   trong hệ: ảnh minh hoạ linh kiện (Danh mục linh kiện), ảnh trả hàng (Đặt mua linh kiện › Trả hàng),
   và ảnh biên bản/bằng chứng chuyển tiền của PXK (2026-08-25: đã bỏ hẳn Service Account, dùng chung
   1 cơ chế OAuth duy nhất vì hệ chỉ có tài khoản Gmail cá nhân, không có Google Workspace) - nếu chưa
   kết nối, mọi thao tác upload ảnh (tạo/từ chối đơn trả hàng, ảnh PXK) sẽ báo lỗi "Chưa kết nối tài
   khoản Google Drive".

## 2. Tạo Worker + D1 database thật

```bash
# Chay tu thu muc goc cua repo NAY (repo doc lap, khong nam trong "cloudflare smarttrade base" nua).
npx wrangler d1 create dat-mua-linh-kien-db
```

Lệnh trên in ra `database_id` — dán vào `wrangler.jsonc` (`d1_databases[0].database_id`), thay cho
placeholder `REPLACE_AFTER_WRANGLER_D1_CREATE`.

Domain Worker đã CHỐT SẴN: `name: "linhkien"` trong `wrangler.jsonc` → deploy ra
`https://linhkien.dichvu3t.workers.dev` (đúng account subdomain `dichvu3t` đang dùng cho hệ DVBH gốc —
`GOOGLE_REDIRECT_URI`/`FRONTEND_URL` trong `wrangler.jsonc` đã điền sẵn domain này, không cần sửa lại
trừ khi đổi tên Worker). Chỉ cần xác nhận domain `linhkien.dichvu3t.workers.dev` chưa bị Worker nào
khác trong tài khoản chiếm trước khi chạy `wrangler deploy` lần đầu (bước 4).

## 3. Đặt secrets (KHÔNG đặt trong `wrangler.jsonc` — dùng `wrangler secret put`)

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET          # chuoi ngau nhien dai, vd: openssl rand -hex 32
npx wrangler secret put CASE_LOOKUP_API_KEY     # xem buoc 5 - lay tu he DVBH goc
```

Google Drive (mọi loại ảnh trong hệ) không cần secret riêng — dùng chung `GOOGLE_CLIENT_ID`/
`GOOGLE_CLIENT_SECRET` ở trên qua cơ chế OAuth, xem bước 7.3 (kết nối tài khoản Google Drive thật
trong Settings sau khi deploy).

## 4. Chạy migration + deploy lần đầu

```bash
npm install
npm run db:migrate:remote
npm run deploy
```

## 5. Tạo API key phía hệ DVBH gốc cho `CASE_LOOKUP_API_KEY`

Endpoint `GET /api/partner/case-lookup` đã có sẵn trong hệ gốc (repo `cloudflare smarttrade base`
riêng biệt, file `backend/src/routes/partnerApi.ts`, thêm 2026-08-19 — xem `CLAUDE.md` của repo đó
mục "Điểm nối hệ DVBH gốc") nhưng **route này chưa được deploy** tính đến thời điểm viết tài liệu
này. Trước khi hệ mới có thể tra cứu case:

1. Xác nhận với người phụ trách hệ gốc rằng route `/api/partner/case-lookup` đã deploy lên
   `smarttrade` (xem `CLAUDE.md` của repo `cloudflare smarttrade base` — deploy qua
   `npm run deploy:smarttrade`, KHÔNG tự ý chạy nếu chưa được yêu cầu).
2. Đăng nhập hệ gốc bằng tài khoản Admin → Settings → tab "API đối tác" → tạo API key mới, đặt tên
   "Hệ thống đặt mua linh kiện" (hoặc tên tương tự dễ nhận diện) → copy giá trị key.
3. `npx wrangler secret put CASE_LOOKUP_API_KEY` ở hệ MỚI, dán giá trị key vừa tạo.
4. `CASE_LOOKUP_BASE_URL` (đã có sẵn trong `wrangler.jsonc vars`, mặc định trỏ
   `https://dvbh.dichvu3t.workers.dev`) — chỉ cần sửa nếu domain hệ gốc đổi.
5. **`services` binding `CASE_LOOKUP_SERVICE` trong `wrangler.jsonc` (đã cấu hình sẵn, trỏ tới script
   `dvbh`) là BẮT BUỘC — không được xoá.** Phát hiện 2026-08-26: gọi thẳng `fetch()` tới URL
   `*.workers.dev` của 1 Worker khác bị Cloudflare chặn với `error code: 1042` (chống SSRF) khi bên
   gọi CŨNG là 1 Worker (curl/server thường không dính, nên dễ gây nhầm lẫn lúc test tay bằng curl mà
   vẫn ra OK trong khi app thật bị chặn). Điều kiện áp dụng: `linhkien` và `dvbh` phải nằm CHUNG 1 tài
   khoản Cloudflare — nếu tách tài khoản, phải bỏ binding này và đổi hệ gốc sang custom domain thật
   (không phải `*.workers.dev`) rồi trỏ `CASE_LOOKUP_BASE_URL` vào domain đó.

## 6. Copy dữ liệu tham chiếu 1 lần từ hệ gốc (KHÔNG đồng bộ tiếp sau đó)

Theo quyết định đã chốt lúc tách hệ thống: KHÔNG di chuyển dữ liệu giao dịch (đơn hàng/PXK/trả hàng —
hệ mới bắt đầu rỗng), CHỈ copy 1 lần các bảng tham chiếu/master data sau, rồi 2 hệ **không đồng bộ
tiếp**:

- `ktv_lien_he` (danh bạ KTV/CTV/Trạm/Vệ tinh)
- `linh_kien` (danh mục linh kiện — hệ mới có bản sao ĐỘC LẬP, không dùng chung schema với "giải
  trình" như hệ gốc)
- `settings_ly_do_cham`
- `settings_loai_de_xuat_nhom` + `settings_loai_de_xuat`

Cách thực hiện (chọn 1 trong 2 cách tuỳ công cụ có sẵn lúc triển khai):

**Cách A — qua `wrangler d1 export`/`import`** (đơn giản nhất nếu 2 DB cùng schema các bảng này —
kiểm tra lại vì `ktv_lien_he`/`linh_kien` hệ mới có thể khác cột nhẹ so với hệ gốc, xem
`migrations/0001_init.sql` đối chiếu với schema hệ gốc trước khi export):

```bash
# Chay tu thu muc goc cua repo "cloudflare smarttrade base" (he GOC, KHAC repo voi he nay)
npx wrangler d1 export dvbh-db-smarttrade --remote --config wrangler.smarttrade.jsonc \
  --output ktv_linhkien_export.sql \
  --table ktv_lien_he --table linh_kien --table settings_ly_do_cham \
  --table settings_loai_de_xuat_nhom --table settings_loai_de_xuat
```

Sau đó copy file `.sql` vừa xuất sang thư mục repo này, rà lại (bỏ cột không tồn tại ở hệ mới nếu có
sai khác), rồi:

```bash
# Chay tu thu muc goc cua repo NAY (he MOI)
npx wrangler d1 execute DB --remote --config wrangler.jsonc --file ktv_linhkien_export.sql
```

**Cách B — viết script Node một lần** đọc qua `wrangler d1 execute --json` từ hệ gốc rồi
`INSERT`/`wrangler d1 execute --file` vào hệ mới, nếu cách A không khớp schema.

Sau khi copy xong, gọi `POST /api/settings/ktv-lien-he/backfill-users` (Admin, hệ mới) một lần để tạo
các dòng `users` placeholder cho các KTV đã có `email_dang_nhap` — cần thiết vì `nguoi_nhan_hang` là
FK thật tới `users(email)` (xem `CLAUDE.md`).

## 7. Đăng nhập lần đầu + khai báo vai trò

1. Mở `FRONTEND_URL` (domain Worker thật) → đăng nhập Google bằng đúng email đặt trong
   `BOOTSTRAP_ADMIN_EMAIL` (mặc định `smarttrade.vp@gmail.com`, xem `wrangler.jsonc vars` — đổi nếu
   cần) → tự động lên Admin.
2. Vào trang "Users" → duyệt/gán vai trò + cờ nghiệp vụ cho từng người dùng thật.
3. Vào trang "Settings" → tab "Google Drive" → kết nối tài khoản Google Drive thật → xác nhận trạng
   thái "Đã kết nối" (bắt buộc để ảnh minh hoạ linh kiện VÀ ảnh trả hàng hoạt động - không kết nối thì
   không tạo/từ chối được đơn trả hàng vì luồng đó bắt buộc phải có ảnh).
4. Tạo thử 1 đơn hàng ở "Đặt mua linh kiện" → xác nhận ô "Mã yêu cầu sự cố" gọi được
   `case-lookup` (nhập 1 mã case thật đang tồn tại ở hệ gốc, xác nhận preview hiện ra đúng thông
   tin) — nếu lỗi 401/403, kiểm tra lại `CASE_LOOKUP_API_KEY`/bước 5.

## Kiểm thử local trước khi deploy thật (khuyến nghị)

```bash
cp .dev.vars.example .dev.vars     # dien gia tri that hoac de placeholder cho GOOGLE_CLIENT_ID/SECRET
npm run db:migrate:local
npm run dev:worker      # port 8788
npm run dev:frontend    # port 5174, proxy /api sang 8788
```

Mở `http://localhost:5174` → nút "🔧 Đăng nhập DEV" (chỉ hiện khi `vite dev` + `LOCAL_DEV_BYPASS_AUTH=true`
trong `.dev.vars`) để vào thẳng vai trò Admin, không cần Google OAuth thật. Lưu ý: `CASE_LOOKUP_*` vẫn
cần trỏ tới hệ gốc thật (hoặc hệ gốc đang chạy local ở port 8787) để test tra cứu case — dùng key thật
từ bước 5 nếu muốn test đầy đủ, hoặc chấp nhận ô "Mã yêu cầu sự cố" báo "không tìm thấy" khi test
local mà chưa có key.
