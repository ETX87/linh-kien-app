# Hướng dẫn tích hợp API — Hệ thống Mua hàng linh kiện (dành cho đối tác DVBH)

Phiên bản tài liệu: 1.0 — 2026-10-13 · Phiên bản API: **v1**

Tài liệu này mô tả các API **chỉ đọc** mà hệ thống Mua hàng linh kiện mở cho đối tác tra cứu:
lịch sử đơn hàng theo mã ca, tồn kho, và lịch sử đặt hàng của từng mã linh kiện.

---

## 1. Thông tin chung

| Mục | Giá trị |
|---|---|
| Địa chỉ gốc (Base URL) | `https://linhkien.dichvu3t.workers.dev/api/partner` |
| Giao thức | HTTPS (bắt buộc) |
| Phương thức | Chỉ `GET` |
| Định dạng trả về | JSON, UTF-8 |
| Múi giờ | Giờ Việt Nam (UTC+07:00) |
| Giới hạn tần suất | 600 yêu cầu / phút / khóa API |

API được thiết kế để gọi **từ máy chủ tới máy chủ** (server-to-server). Không gọi trực tiếp từ trình
duyệt hay ứng dụng di động của người dùng cuối — làm vậy sẽ lộ khóa API.

### Cam kết phiên bản

Đường dẫn có `/v1/` là hợp đồng ổn định:
- Có thể **thêm** trường mới vào kết quả bất cứ lúc nào — hệ thống của đối tác cần **bỏ qua trường không biết**,
  không được báo lỗi.
- Không đổi tên, xoá hay đổi kiểu dữ liệu của trường đã có trong `v1`. Nếu cần thay đổi không tương thích,
  chúng tôi mở `/v2/` và thông báo trước.

---

## 2. Xác thực

Mỗi yêu cầu phải gửi khóa API trong header:

```
X-API-Key: <khóa API được cấp>
```

- Khóa là chuỗi 64 ký tự, do quản trị viên hệ thống Mua hàng cấp **một lần** qua kênh riêng (không gửi qua
  email thường / nhóm chat chung). Hệ thống chỉ lưu bản băm, nên **không thể xem lại khóa** — nếu mất, yêu cầu
  cấp khóa mới.
- Lưu khóa trong biến môi trường / kho bí mật của máy chủ, **không** đưa vào mã nguồn hay kho Git.
- Khi nghi ngờ lộ khóa: báo ngay cho quản trị viên để tắt khóa cũ và cấp khóa mới.
- Mỗi khóa ghi nhận thời điểm dùng gần nhất; khóa lâu không dùng có thể bị thu hồi.

Ví dụ:

```bash
curl -s "https://linhkien.dichvu3t.workers.dev/api/partner/v1/ton-kho/meta" \
  -H "X-API-Key: $LINHKIEN_API_KEY"
```

---

## 3. Mã lỗi

Lỗi trả về dạng `{"error": "<MÃ_LỖI>"}`.

| HTTP | `error` | Ý nghĩa | Cách xử lý |
|---|---|---|---|
| 400 | `MISSING_ID` | Thiếu tham số `id` (case-timeline) | Sửa yêu cầu |
| 400 | `MISSING_MA` | Thiếu tham số `ma` (lich-su linh kiện) | Sửa yêu cầu |
| 400 | `INVALID_NGUON` | `nguon` khác `kho` / `ktv` | Sửa yêu cầu |
| 401 | `MISSING_API_KEY` | Không gửi header `X-API-Key` | Thêm header |
| 401 | `INVALID_API_KEY` | Khóa sai hoặc đã bị tắt | Liên hệ quản trị viên — **không thử lại liên tục** |
| 429 | `QUA_NHIEU_YEU_CAU` | Vượt 600 yêu cầu/phút | Chờ theo header `Retry-After` (giây) rồi thử lại |
| 5xx | — | Lỗi tạm thời phía máy chủ | Thử lại sau, giãn cách tăng dần (vd 2s, 4s, 8s…) |

---

## 4. Danh sách API

### 4.1. Lịch sử đơn hàng theo mã ca — `GET /v1/case-timeline`

Trả mọi đơn đặt linh kiện gắn với 1 mã ca (mã yêu cầu sự cố), kèm **dòng thời gian xử lý** đã chuẩn hoá
(duyệt đơn, thiếu hàng, phiếu xuất kho, chuyển tiền, trả hàng).

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `id` | Có | Mã ca, vd `SC261003300` |

```bash
curl -s "https://linhkien.dichvu3t.workers.dev/api/partner/v1/case-timeline?id=SC261003300" \
  -H "X-API-Key: $LINHKIEN_API_KEY"
```

Không có đơn nào gắn với mã ca → vẫn trả **200** với `orders: []` (không phải 404).

Ví dụ kết quả (dữ liệu minh hoạ):

```json
{
  "case_id": "SC261003300",
  "orders": [
    {
      "order_id": "DDH-000585",
      "ma_lk": "3004030490",
      "ten_lk": "Bo mạch điều khiển",
      "loai_don": "mua",
      "loai_de_xuat": "MUA HÀNG CÓ ID",
      "trang_thai_hien_tai": "TN da duyet",
      "so_luong_de_xuat": 1,
      "so_luong_thuc_xuat": null,
      "ly_do_cham": null,
      "nguoi_tao": "ktv.a@gmail.com",
      "nguoi_tao_ten": "Nguyễn Văn A",
      "nguoi_nhan_hang": "ktv.a@gmail.com",
      "nguoi_nhan_hang_ten": "Nguyễn Văn A",
      "ngay_tao": "2026-10-08T09:12:30+07:00",
      "phieu_xuat_kho": [{ "id": "PMH-000120", "ma_xuat_kho": "XK-2026-0456" }],
      "thieu_lk": [],
      "timeline": [
        { "at": "2026-10-08T09:12:30+07:00", "event": "cho_tn_duyet", "actor": "ktv.a@gmail.com", "actor_name": "Nguyễn Văn A", "note": null, "source": "mua_hang" },
        { "at": "2026-10-08T10:05:00+07:00", "event": "tn_da_duyet", "actor": "tn.b@gmail.com", "actor_name": "Trần Thị B", "note": null, "source": "mua_hang" },
        { "at": "2026-10-09T08:30:00+07:00", "event": "pxk_dang_gui_ktv", "actor": "kho@gmail.com", "actor_name": "Kho MB", "note": "Mã vận đơn: GHN123", "source": "phieu_xuat_kho" }
      ]
    }
  ]
}
```

**Các trường của đơn (`orders[]`)**

| Trường | Kiểu | Mô tả |
|---|---|---|
| `order_id` | string | Mã đơn trong hệ thống Mua hàng |
| `ma_lk`, `ten_lk` | string | Mã / tên linh kiện (tên lúc đặt đơn) |
| `loai_don` | string | `mua` (mua hàng), `cong_no` (công nợ), `tra_hang` (trả hàng) |
| `loai_de_xuat` | string \| null | Loại đề xuất chi tiết, vd "MUA DỰ TRỮ", "CÔNG NỢ…", "HỖ TRỢ…" |
| `trang_thai_hien_tai` | string \| null | Trạng thái nội bộ hiện tại (chỉ để hiển thị — **dùng `timeline[].event` để xử lý logic**) |
| `so_luong_de_xuat` | number | Số lượng đặt |
| `so_luong_thuc_xuat` | number \| null | Số lượng thực xuất (null = bằng số lượng đặt) |
| `ly_do_cham` | string \| null | Lý do chậm xử lý (nếu có) |
| `nguoi_tao`, `nguoi_nhan_hang` | string | Email người tạo đơn / người nhận hàng |
| `nguoi_tao_ten`, `nguoi_nhan_hang_ten` | string \| null | Tên hiển thị tương ứng |
| `ngay_tao` | string | Thời điểm tạo đơn (ISO 8601, +07:00) |
| `phieu_xuat_kho[]` | array | Phiếu xuất kho chứa đơn: `id`, `ma_xuat_kho` |
| `thieu_lk[]` | array | Phiếu thiếu hàng của đơn: `id`, `ly_do`, `ngay_tao`, `ngay_du_kien_co_hang`, `ngay_hang_ve_thuc_te` |
| `timeline[]` | array | Sự kiện xử lý, **đã sắp xếp theo thời gian tăng dần** |

**Trường của sự kiện (`timeline[]`)**: `at` (ISO 8601 +07:00), `event` (mã sự kiện — bảng dưới),
`actor` (email người thao tác), `actor_name` (tên hiển thị, có thể null → hiển thị email), `note` (ghi chú,
có thể null), `source` (`mua_hang` | `thieu_lk` | `phieu_xuat_kho` | `tra_hang`).

**Mã sự kiện (`event`)**

| Nhóm | `event` | Ý nghĩa |
|---|---|---|
| Đơn mua hàng | `cho_tram_duyet` | Chờ Trạm duyệt |
| | `cho_tbp_xac_nhan` | Chờ Trưởng bộ phận xác nhận |
| | `cho_tn_duyet` | Chờ Tác nghiệp duyệt |
| | `tn_da_duyet` | Tác nghiệp đã duyệt |
| | `tn_tu_choi` | Tác nghiệp từ chối |
| | `cho_hang` | Chờ hàng (đã mở phiếu thiếu hàng) |
| | `da_huy` | Đơn đã hủy |
| Thiếu hàng | `thieu_lk_cho_kho_xu_ly` | Chờ Kho xử lý |
| | `thieu_lk_kho_da_tiep_nhan` | Kho đã tiếp nhận |
| | `thieu_lk_kho_da_cap_nhat` | Kho cập nhật tiến độ / ngày dự kiến |
| | `thieu_lk_kho_xac_nhan_hang_ve` | Kho xác nhận hàng đã về |
| | `thieu_lk_kho_tu_choi` | Kho từ chối (sai thông tin) |
| | `thieu_lk_huy_bo` | Phiếu thiếu hàng bị hủy |
| | `thieu_lk_ket_thuc` | Đã kết thúc |
| Phiếu xuất kho | `pxk_dang_tao_phieu` | Đang tạo phiếu |
| | `pxk_chuyen_tien_yeu_cau` | Yêu cầu KTV chuyển tiền |
| | `pxk_chuyen_tien_da_dinh_bang_chung` | KTV đã đính bằng chứng chuyển tiền |
| | `pxk_chuyen_tien_ke_toan_duyet` | Kế toán đã duyệt chuyển tiền |
| | `pxk_cho_ke_toan` | Chờ Kế toán (mã MISA) |
| | `pxk_da_chot_don_xuat` | Đã chốt đơn xuất |
| | `pxk_dang_gui_ktv` | Đang gửi hàng cho KTV |
| | `pxk_ktv_da_nhan` | KTV đã nhận hàng |
| | `pxk_hang_tru_kho` | Hàng trừ kho (không giao vật lý) |
| | `pxk_kho_da_ket_thuc` | Kho đã kết thúc phiếu |
| | `pxk_kho_da_nhan_hang_tra` | Kho đã nhận hàng trả |
| | `pxk_ke_toan_huy` | Phiếu bị hủy |
| Trả hàng | `tra_hang_cho_ke_toan_duyet_mem` | Chờ Kế toán duyệt |
| | `tra_hang_cho_kho_xac_nhan` | Chờ Kho xác nhận |
| | `tra_hang_cho_qc_xac_nhan` | Chờ QC xác nhận |
| | `tra_hang_cho_tn_duyet_tong` | Chờ Tác nghiệp duyệt tổng |
| | `tra_hang_tn_da_duyet` | Tác nghiệp đã duyệt |
| | `tra_hang_tu_choi` | Từ chối |
| | `tra_hang_da_huy` | Đã hủy |

Danh sách mã sự kiện có thể được **bổ sung** về sau (khi có bước mới). Gặp mã chưa biết, hãy hiển thị
nguyên mã hoặc xếp vào nhóm "Khác" theo `source`, **không** báo lỗi.

---

### 4.2. Phiên bản dữ liệu tồn kho — `GET /v1/ton-kho/meta`

Dữ liệu tồn kho chỉ đổi khi Kế toán nhập file tồn kho mới (thường vài lần/tuần). Gọi API rẻ này trước để biết
có cần tải lại toàn bộ tồn kho hay không.

```json
{ "phien_ban": "2026-10-12 17:40:05", "ky_tu_ngay": "2026-10-01", "ky_den_ngay": "2026-10-12", "so_dong": 18342 }
```

| Trường | Mô tả |
|---|---|
| `phien_ban` | Thời điểm nhập file gần nhất (giờ VN, `YYYY-MM-DD HH:MM:SS`). **So sánh bằng — không cần phân tích ngày.** `null` = chưa từng nhập |
| `ky_tu_ngay`, `ky_den_ngay` | Kỳ số liệu của file |
| `so_dong` | Số dòng của file |

---

### 4.3. Tồn kho — `GET /v1/ton-kho`

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `nguon` | Có | `kho` = tồn kho công ty · `ktv` = tồn kho đang giữ tại từng KTV |
| `after_id` | Không | Con trỏ phân trang, mặc định `0` (trang đầu) |
| `limit` | Không | Số dòng/trang, mặc định 2000, tối đa 5000 |

```json
{
  "phien_ban": "2026-10-12 17:40:05",
  "rows": [
    { "id": 101, "ma_kho": "KHO-MB", "ten_kho": "Kho công ty MB", "ma_ktv": null, "ten_ktv": null, "khu_vuc_ma": null,
      "ma_hang": "3004030490", "ten_hang": "Bo mạch điều khiển", "dvt": "Cái", "cuoi_ky": 12 }
  ],
  "next_after_id": 2101
}
```

| Trường | Mô tả |
|---|---|
| `rows[].id` | Khoá dòng (dùng cho phân trang) |
| `ma_kho`, `ten_kho` | Mã / tên kho |
| `ma_ktv`, `ten_ktv`, `khu_vuc_ma` | Chỉ với `nguon=ktv`: KTV giữ kho và khu vực. `ma_ktv = null` = mã kho chưa khớp KTV nào |
| `ma_hang`, `ten_hang`, `dvt` | Mã / tên linh kiện, đơn vị tính |
| `cuoi_ky` | Số lượng tồn cuối kỳ |
| `next_after_id` | Truyền vào `after_id` để lấy trang kế. `null` = đã hết dữ liệu |

**Quy trình đồng bộ khuyến nghị**

1. Gọi `/v1/ton-kho/meta`. Nếu `phien_ban` trùng bản đã lưu → dừng, không cần tải.
2. Lặp `GET /v1/ton-kho?nguon=kho&after_id=0`, rồi `after_id=<next_after_id>` tới khi `next_after_id = null`.
   Lặp lại với `nguon=ktv`.
3. Mỗi trang đều có `phien_ban`. Nếu giá trị này **đổi giữa chừng** (Kế toán vừa nhập file mới) → bỏ toàn bộ
   lần tải này và tải lại từ đầu, tránh trộn 2 phiên bản.
4. Tải xong, thay toàn bộ dữ liệu cũ bằng dữ liệu mới (không cộng dồn), lưu `phien_ban`.

Tần suất gợi ý: kiểm tra `meta` mỗi 30–60 phút trong giờ làm việc là đủ.

---

### 4.4. Lịch sử đặt hàng của 1 mã linh kiện — `GET /v1/linh-kien/lich-su`

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `ma` | Có | Mã linh kiện, vd `3004030490` (khớp chính xác) |
| `limit` | Không | Số đơn gần nhất, mặc định 50, tối đa 200 |

```json
{
  "orders": [
    { "id": "DDH-000585", "loai_don": "mua", "loai_de_xuat": "MUA HÀNG CÓ ID", "trang_thai_hien_tai": "TN da duyet",
      "so_luong_de_xuat": 1, "so_luong_thuc_xuat": null,
      "ngay_tao": "2026-10-08 09:12:30", "updated_at": "2026-10-08 10:05:00",
      "khu_vuc_ma": "MB1", "ma_xuat_kho": "XK-2026-0456",
      "nguoi_nhan_hang": "ktv.a@gmail.com", "nguoi_nhan_hang_ten": "Nguyễn Văn A",
      "case_ids": "SC261003300,SC261003301" }
  ],
  "thieu_lk": [
    { "id": "TLK-000045", "dat_don_hang_id": "DDH-000580", "ly_do": "Hết hàng NCC",
      "ngay_tao": "2026-10-05 14:00:00", "ngay_du_kien_co_hang": "2026-10-15", "ngay_hang_ve_thuc_te": null,
      "trang_thai": "Kho da tiep nhan", "ngay_cap_nhat": "2026-10-06 08:20:00" }
  ]
}
```

| Trường | Mô tả |
|---|---|
| `orders[]` | Đơn gần nhất của mã, mới nhất trước |
| `orders[].case_ids` | Các mã ca gắn với đơn, **nối bằng dấu phẩy** (tách bằng `,`), có thể null |
| `orders[].ma_xuat_kho` | Mã phiếu xuất kho (null = chưa xuất) |
| `thieu_lk[]` | Tối đa 100 phiếu thiếu hàng gần nhất của mã; `trang_thai` = trạng thái mới nhất |

Lưu ý: thời gian trong API này dạng `YYYY-MM-DD HH:MM:SS` (giờ VN, **không kèm** `+07:00`), khác với
`case-timeline` (ISO 8601). Giá trị `loai_don` giống mục 4.1. Giá trị `trang_thai_hien_tai` / `trang_thai`
là mã trạng thái nội bộ — chỉ dùng để hiển thị, có thể được bổ sung giá trị mới.

---

## 5. Bảo mật & sử dụng dữ liệu

- Kết quả có **email và tên** KTV / nhân viên xử lý. Chỉ dùng cho nghiệp vụ dịch vụ bảo hành, không chia sẻ cho
  bên thứ ba, không công khai.
- Không ghi khóa API vào log. Nếu log yêu cầu HTTP, hãy che header `X-API-Key`.
- Bộ nhớ đệm: dữ liệu `case-timeline` / `lich-su` thay đổi liên tục trong ngày — nếu cache, giữ tối đa vài phút.
  Dữ liệu tồn kho theo `phien_ban` như mục 4.3.
- Gặp 401 `INVALID_API_KEY` đột ngột: khóa có thể đã bị thu hồi — dừng gọi và liên hệ quản trị viên.

## 6. Liên hệ

- Cấp / thu hồi khóa, báo sự cố: quản trị viên hệ thống Mua hàng linh kiện.
- Khi báo lỗi, gửi kèm: thời điểm gọi (giờ VN), đường dẫn + tham số, mã HTTP và nội dung `error` nhận được
  (**không gửi khóa API**).

---

*Phụ lục cho quản trị viên (không gửi kèm cho đối tác nếu không cần):* khóa API được tạo / tắt tại
Cài đặt › **API đối tác** trong ứng dụng. Khóa chỉ hiện 1 lần lúc tạo.
