# Hướng dẫn tích hợp API — Hệ thống Mua hàng linh kiện (dành cho đối tác DVBH)

Phiên bản tài liệu: 1.7 — 2026-11-11 · Phiên bản API: **v1**

Tài liệu này mô tả các API **chỉ đọc** mà hệ thống Mua hàng linh kiện mở cho đối tác tra cứu:
lịch sử đơn hàng theo mã ca, tồn kho, lịch sử đặt hàng của từng mã linh kiện, và danh mục linh kiện chi
tiết (kèm **hình ảnh minh họa**, linh kiện thay thế, combo, từ khóa, công nợ, tồn kho).

Thay đổi 1.1: bổ sung mục 4.5 `linh-kien/chi-tiet` và mục 4.6 hướng dẫn dùng hình ảnh minh họa.
Thay đổi 1.2: bổ sung 4 API danh sách — 4.7 nhóm thay thế, 4.8 combo, 4.9 từ khóa riêng + nhóm đồng nghĩa, 4.10 công nợ KTV.
Thay đổi 1.3: bổ sung 4.11 thiếu hàng (ticket chờ hàng) và 4.12 tồn kho khả dụng theo khu vực.
Thay đổi 1.4: 4.7 nhóm thay thế đã CÓ DỮ LIỆU (trước 2026-10-19 trả `rows: []` vì dữ liệu nằm ngoài hệ thống); mỗi mã thêm `co_trong_danh_muc` + `ghi_chu`.
Thay đổi 1.5: bổ sung **ID Lada** (`ma_lada`) — trước đây API chỉ trả mã ca / mã YCSC (ID CRM) nên đối tác không nhận được ID Lada. Thêm trường
`ma_lada` + `ma_yeu_cau_su_co` cho đơn ở 4.1 `case-timeline`, 4.4 `linh-kien/lich-su`, 4.11 `thieu-hang`; thêm mục 4.15 giải thích 2 loại mã.
Thay đổi 1.7: mục 4.17 thêm trường `email_nguoi_dat` (đặt thay đúng người dùng — chỉ khóa được quản trị viên bật "đặt thay đúng người bấm").
Thay đổi 1.6: bổ sung mục 4.17 **đặt linh kiện qua API** (`POST /v1/dat-hang`, `POST /v1/dat-hang/kiem-tra`, `GET /v1/dat-hang`,
`GET /v1/loai-de-xuat`) — API GHI đầu tiên; chỉ dùng được với khóa đã được quản trị viên gán "Tài khoản đặt hàng".
Bổ sung trường (không đổi gì sẵn có), tương thích ngược.

---

## 1. Thông tin chung

| Mục | Giá trị |
|---|---|
| Địa chỉ gốc (Base URL) | `https://linhkien.dichvu3t.workers.dev/api/partner` |
| Giao thức | HTTPS (bắt buộc) |
| Phương thức | `GET` (tra cứu); `POST` cho 4.16 và 4.17 (đặt hàng) |
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
| 400 | `MISSING_MA` | Thiếu tham số `ma` (lich-su linh kiện, ton-kho-kha-dung) | Sửa yêu cầu |
| 400 | `INVALID_TRANG_THAI` | `trang_thai` khác `mo` / `dong` / `tat_ca` (thieu-hang) | Sửa yêu cầu |
| 400 | `INVALID_NGUON` | `nguon` khác `kho` / `ktv` | Sửa yêu cầu |
| 400 | `QUA_NHIEU_MA` | `ma=` quá 200 mã (linh-kien/chi-tiet) | Chia thành nhiều yêu cầu |
| 400 | `CHI_TIET_CAN_MA_KTV` | `cong-no-ktv?chi_tiet=1` thiếu `ma_ktv` hoặc quá 20 KTV | Thêm / bớt `ma_ktv` |
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
      "ma_yeu_cau_su_co": "SC261003300",
      "ma_lada": "B1430288",
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
| `ma_yeu_cau_su_co` | string \| null | **Mã ca / mã YCSC** của đơn — đúng giá trị dùng để gọi `/v1/case-timeline` (xem mục 4.15) |
| `ma_lada` | string \| null | **ID Lada** của đơn (xem mục 4.15); `null` = đơn không nhập ID Lada |
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
      "ma_hang": "3004030490", "ten_hang": "Bo mạch điều khiển", "dvt": "Cái",
      "dau_ky": 10, "nhap_kho": 5, "xuat_kho": 3, "cuoi_ky": 12 }
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
| `dau_ky`, `nhap_kho`, `xuat_kho` | Số lượng đầu kỳ / nhập / xuất trong kỳ của file MISA (kỳ = `ky_tu_ngay`..`ky_den_ngay` ở `/v1/ton-kho/meta`; có thể `null`) |
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
      "ma_yeu_cau_su_co": "SC261003300", "ma_lada": "B1430288",
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
| `orders[].ma_yeu_cau_su_co` | Mã ca / mã YCSC khai báo trên đơn (ID CRM) — xem mục 4.15 |
| `orders[].ma_lada` | **ID Lada** của đơn, `null` = không nhập. Xem mục 4.15 |
| `orders[].ma_xuat_kho` | Mã phiếu xuất kho (null = chưa xuất) |
| `thieu_lk[]` | Tối đa 100 phiếu thiếu hàng gần nhất của mã; `trang_thai` = trạng thái mới nhất |

Lưu ý: thời gian trong API này dạng `YYYY-MM-DD HH:MM:SS` (giờ VN, **không kèm** `+07:00`), khác với
`case-timeline` (ISO 8601). Giá trị `loai_don` giống mục 4.1. Giá trị `trang_thai_hien_tai` / `trang_thai`
là mã trạng thái nội bộ — chỉ dùng để hiển thị, có thể được bổ sung giá trị mới.

### 4.5. Danh mục linh kiện chi tiết (kèm hình ảnh minh họa) — `GET /v1/linh-kien/chi-tiet`

Trả thông tin đầy đủ của từng linh kiện: giá, phân loại, **hình ảnh minh họa**, nhóm linh kiện thay thế,
combo chứa linh kiện, từ khóa tìm kiếm, công nợ theo KTV và tồn kho. Có 2 cách gọi:

| Cách gọi | Tham số | Mô tả |
|---|---|---|
| Lấy toàn bộ danh mục (phân trang) | `after_ma` | Mã cuối của trang trước; bỏ trống ở trang đầu |
| | `limit` | Số linh kiện / trang, mặc định 100, tối đa 200 |
| Tra theo danh sách mã | `ma` | Các mã cách nhau bằng dấu phẩy, tối đa 200 mã, vd `ma=3004030490,2013140023`. Có `ma` thì bỏ qua `after_ma`/`limit` |

Mã không tồn tại sẽ không có trong `rows` (không báo lỗi).

```bash
# Trang đầu
curl -s "https://linhkien.dichvu3t.workers.dev/api/partner/v1/linh-kien/chi-tiet?limit=200" \
  -H "X-API-Key: $LINHKIEN_API_KEY"
# Trang tiếp theo: after_ma = next_after_ma của trang trước
curl -s "https://linhkien.dichvu3t.workers.dev/api/partner/v1/linh-kien/chi-tiet?limit=200&after_ma=2013140023" \
  -H "X-API-Key: $LINHKIEN_API_KEY"
# Tra vài mã cụ thể
curl -s "https://linhkien.dichvu3t.workers.dev/api/partner/v1/linh-kien/chi-tiet?ma=3004030490,2013140023" \
  -H "X-API-Key: $LINHKIEN_API_KEY"
```

```json
{
  "phien_ban_ton_kho": "2026-10-14 17:30:00",
  "next_after_ma": "3004030490",
  "rows": [
    {
      "ma_linh_kien": "3004030490",
      "ten_linh_kien": "Bo mạch điều khiển máy lọc nước",
      "phan_loai": "Bo mạch",
      "gia_niem_yet": 450000,
      "gia_tri_cong_no": 380000,
      "gia_du_phong": null,
      "gia_eu": null,
      "bat_tat": 1, "dac_thu": 0, "chi_sua_chua": 0, "cam_ban": 0, "bo_ma": 0,
      "trang_thai_ma": "Da xac nhan",
      "ma_chuan": null,
      "ghi_chu": null,
      "ngay_cap_nhat": "2026-10-13 09:41:05",
      "anh": [
        "https://drive.google.com/thumbnail?id=1AbC...xyz&sz=w1000",
        "https://drive.google.com/thumbnail?id=1DeF...uvw&sz=w1000"
      ],
      "thay_the": [
        { "nhom_id": 12, "ten_nhom": "Bo mạch dòng KG",
          "linh_kien": [ { "ma_linh_kien": "3004030491", "ten_linh_kien": "Bo mạch điều khiển (bản mới)", "bat_tat": 1 } ] }
      ],
      "combo": [
        { "ma_combo": "CB-LOC-01", "ten_combo": "Bộ lõi lọc 1-2-3", "bat_tat": 1, "so_luong_trong_combo": 1,
          "thanh_phan": [ { "ma_linh_kien": "3004030490", "so_luong": 1 }, { "ma_linh_kien": "3004030500", "so_luong": 2 } ] }
      ],
      "tu_khoa": ["mạch", "board"],
      "cong_no": {
        "gia_tri_cong_no": 380000,
        "tong_cong_no": 760000,
        "chi_tiet": [
          { "ma_ktv": "KTV001", "ten_ktv": "Nguyễn Văn A", "khu_vuc_ma": "MB1", "sl_ton": 3, "sl_ho_tro_0d": 1, "cong_no": 760000 }
        ]
      },
      "ton_kho": {
        "tong_kho_cong_ty": 25,
        "tong_kho_ktv": 3,
        "kho_cong_ty": [ { "ma_kho": "KHO-MB", "ten_kho": "Kho Miền Bắc", "sl_ton": 25 } ],
        "kho_ktv": [ { "ma_kho": "KTV001", "ma_ktv": "KTV001", "ten_ktv": "Nguyễn Văn A", "khu_vuc_ma": "MB1", "sl_ton": 3 } ]
      }
    }
  ]
}
```

*(Giá trị trong ví dụ là minh họa, không phải dữ liệu thật.)*

| Trường | Mô tả |
|---|---|
| `next_after_ma` | Mã để gọi trang tiếp theo; `null` = đã hết danh mục (luôn `null` khi tra theo `ma`) |
| `phien_ban_ton_kho` | Phiên bản file tồn kho đang dùng — giống `phien_ban` ở mục 4.2 / 4.3 |
| `phan_loai` | Phân loại linh kiện (vd "Bo mạch", "Máy", "Đình tủ"), có thể null |
| `gia_niem_yet` | Giá bán niêm yết (VNĐ) |
| `gia_tri_cong_no` | Giá KTV (VNĐ) — cũng là đơn giá tính công nợ |
| `gia_du_phong`, `gia_eu` | Giá dự phòng / giá EU (VNĐ), có thể null |
| `bat_tat` | `1` = đang dùng, `0` = đã tắt |
| `dac_thu` | `1` = linh kiện đặc thù (cần trưởng bộ phận xác nhận khi đặt) |
| `chi_sua_chua` | `1` = chỉ dùng cho sửa chữa |
| `cam_ban` | `1` = linh kiện thuộc dạng không bán |
| `bo_ma` | `1` = linh kiện đã bỏ mã (theo bảng giá đối tác — vẫn còn tồn ở KTV, không nên đặt mới) |
| `trang_thai_ma` | `Da xac nhan` / `Tu dong duyet` = mã chuẩn; `Cho xet duyet` = mã mới chờ duyệt; `Da doi ma` = mã cũ đã đổi sang `ma_chuan`; `Tu choi` = mã bị từ chối. Có thể bổ sung giá trị mới |
| `ma_chuan` | Chỉ có khi `trang_thai_ma = "Da doi ma"`: mã mới thay thế — hãy quy mã cũ về mã này |
| `ngay_cap_nhat` | Lần sửa gần nhất thông tin linh kiện **hoặc hình ảnh** (`YYYY-MM-DD HH:MM:SS`, giờ VN) |
| `anh[]` | Danh sách URL hình ảnh minh họa — xem mục 4.6 |
| `thay_the[]` | Các nhóm linh kiện thay thế chứa mã này; `linh_kien[]` = các mã KHÁC trong nhóm (không gồm chính nó) |
| `combo[]` | Các combo có chứa mã này; `so_luong_trong_combo` = số lượng của mã này trong 1 bộ, `thanh_phan[]` = toàn bộ thành phần combo |
| `tu_khoa[]` | Từ khóa tìm kiếm phụ (tên gọi khác) của linh kiện |
| `cong_no.tong_cong_no` | Tổng công nợ của mã trên mọi KTV = Σ (`sl_ton` − `sl_ho_tro_0d`) × `gia_tri_cong_no` |
| `cong_no.chi_tiet[]` | Từng KTV đang giữ hàng; `sl_ho_tro_0d` = số chiếc được tính công nợ 0 đồng theo chương trình hỗ trợ đang chạy |
| `ton_kho.kho_cong_ty[]` | Tồn từng kho công ty theo file MISA import gần nhất |
| `ton_kho.kho_ktv[]` | Tồn từng kho KTV; `ma_ktv` null = mã kho chưa khớp KTV nào (không tính vào `cong_no`) |

Lưu ý:
- Danh mục có hơn 6.000 mã — lấy toàn bộ cần khoảng 30–35 lần gọi với `limit=200`. Gọi tuần tự từng trang,
  không gọi song song nhiều trang.
- Kết quả có cả mã đã tắt và mã `Da doi ma` — tự lọc theo `bat_tat` / `trang_thai_ma` nếu chỉ cần mã đang dùng.
- `ngay_cap_nhat` **không** đổi khi chỉ sửa nhóm thay thế / combo / từ khóa, và không đổi khi tồn kho/công nợ
  thay đổi. Nếu cần các phần này mới nhất, hãy quét lại toàn bộ định kỳ (vd mỗi đêm) hoặc tra lại theo `ma` khi
  hiển thị.
- Tồn kho trong API này **chưa trừ** các đơn "trừ công nợ" phát sinh sau lần import file MISA gần nhất.

### 4.6. Hình ảnh minh họa linh kiện

Mỗi linh kiện có **tối đa 10 ảnh**, trả trong trường `anh` của mục 4.5:

| Quy ước | Mô tả |
|---|---|
| Thứ tự | `anh[0]` là **ảnh chính** (ảnh đại diện, dùng làm ảnh thu nhỏ trong danh sách); các ảnh sau là ảnh phụ theo thứ tự quản trị viên sắp xếp |
| Không có ảnh | `anh` = `[]` (mảng rỗng, không bao giờ null) |
| Định dạng URL | Ảnh lưu trên Google Drive, dạng `https://drive.google.com/thumbnail?id=<ID_ẢNH>&sz=w1000` (rộng tối đa 1000px). Một số ảnh cũ có thể là link `https://` khác — hãy coi URL là chuỗi bất kỳ, không tự tách `id` |
| Quyền xem | Ảnh **công khai theo link** — không cần khóa API hay đăng nhập Google để tải |

Cách hiển thị:

```html
<!-- Ảnh chính trong danh sách -->
<img src="{{ anh[0] }}" alt="{{ ma_linh_kien }}" loading="lazy" referrerpolicy="no-referrer">
```

- Ảnh thu nhỏ nhỏ hơn: với URL dạng `drive.google.com/thumbnail`, đổi tham số `sz=w1000` thành `sz=w300`
  (hoặc `sz=w600`…) để tải nhanh hơn. URL không có `sz=` thì dùng nguyên.
- Link `drive.google.com/thumbnail` trả về **chuyển hướng (HTTP 302)** sang máy chủ ảnh của Google và không có
  header CORS: hiển thị bằng thẻ `<img>` thì không sao; nếu máy chủ của đối tác tải ảnh về, hãy bật **theo chuyển
  hướng** (vd `curl -L`). Không tải ảnh bằng `fetch()` từ trình duyệt.

Đồng bộ ảnh về hệ thống đối tác (khuyến nghị):
- Lưu danh sách `anh` theo `ma_linh_kien`. Thêm / xoá / đổi thứ tự / thay ảnh đều làm `ngay_cap_nhat` của linh kiện
  thay đổi → so `ngay_cap_nhat` với bản đã lưu để biết cần cập nhật lại ảnh.
- Nếu tự lưu bản sao ảnh, dùng chính URL làm khóa: ảnh thay mới luôn có URL mới, URL cũ không đổi nội dung.
- Ảnh bị xoá khỏi danh sách thì hệ thống đối tác cũng nên ngừng hiển thị ảnh đó (link cũ có thể vẫn mở được
  nhưng không còn là ảnh minh họa của linh kiện).

### 4.7. Nhóm linh kiện thay thế — `GET /v1/lk-thay-the`

Các mã trong cùng 1 nhóm có thể dùng thay nhau. Trả **toàn bộ** nhóm (danh sách nhỏ, không phân trang).

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `ma` | Không | Các mã LK cách nhau dấu phẩy (tối đa 200) — chỉ trả nhóm có chứa 1 trong các mã đó |

```json
{
  "phien_ban": "2026-10-17 09:00:00#12#40",
  "rows": [
    { "id": 4, "ten_nhom": "Bo mạch dòng KG", "ghi_chu": null, "ngay_cap_nhat": "2026-10-17 09:00:00",
      "linh_kien": [
        { "ma_linh_kien": "3004030490", "ten_linh_kien": "Bo mạch điều khiển", "bat_tat": 1 },
        { "ma_linh_kien": "3004030491", "ten_linh_kien": "Bo mạch điều khiển (bản mới)", "bat_tat": 1 }
      ] }
  ]
}
```

`linh_kien[]` = mọi mã trong nhóm theo thứ tự hiển thị (kể cả mã đang tắt `bat_tat = 0` — tự lọc nếu chỉ cần mã đang dùng). Từ 1.4 mỗi mã có thêm:

| Trường | Mô tả |
|---|---|
| `co_trong_danh_muc` | `1` = mã có trong danh mục linh kiện; `0` = mã chỉ có trong nhóm thay thế (chưa có trong danh mục — `bat_tat` = `null`, `ten_linh_kien` = tên lúc thêm vào nhóm) |
| `ghi_chu` | Ghi chú riêng của mã này trong nhóm (vd "Cần đi kèm 1 cút nối vuông"), có thể `null` |

Dữ liệu nhóm do người dùng quản lý trực tiếp trên app (Bảng giá › Linh kiện thay thế) — `phien_ban` đổi mỗi khi thêm/sửa/xoá nhóm hoặc thành viên.

### 4.8. Combo linh kiện — `GET /v1/lk-combo`

Combo = bộ nhiều linh kiện đặt cùng lúc; đặt 1 combo = đặt từng thành phần theo số lượng/bộ.

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `ma` | Không | Các mã LK (tối đa 200) — chỉ trả combo có chứa 1 trong các mã đó |
| `chi_bat` | Không | `1` = chỉ combo đang bật |

```json
{
  "phien_ban": "2026-10-04 13:10:15#10#25#31",
  "rows": [
    { "ma_combo": "CB-LOC-01", "ten_combo": "Bộ lõi lọc 1-2-3", "bat_tat": 1, "ghi_chu": null,
      "ngay_cap_nhat": "2026-10-04 13:10:15", "gia_niem_yet": 650000,
      "thanh_phan": [
        { "ma_linh_kien": "2004010025", "ten_linh_kien": "Lõi PP 10 inch", "so_luong": 1, "gia_niem_yet": 150000 },
        { "ma_linh_kien": "2005010032", "ten_linh_kien": "Lõi UDF", "so_luong": 2, "gia_niem_yet": 250000 }
      ] }
  ]
}
```

`gia_niem_yet` của combo = Σ giá niêm yết thành phần × số lượng/bộ — chỉ để tham khảo (giá thật tính theo từng thành phần lúc đặt).

### 4.9. Từ khóa riêng + nhóm đồng nghĩa — `GET /v1/lk-tu-khoa`

Dùng để tìm linh kiện giống trên app: mỗi LK có thể có **từ khóa riêng** (tên gọi khác), và các **nhóm đồng nghĩa** dùng
chung (gõ 1 từ trong nhóm = tìm cả các từ còn lại). Không có tham số, trả toàn bộ 2 danh sách.

```json
{
  "phien_ban": "20",
  "tu_khoa": [
    { "ma_linh_kien": "3004030490", "tu_khoa": ["board", "mạch điều khiển"], "ngay_cap_nhat": "2026-10-17 09:00:00" }
  ],
  "dong_nghia": [
    { "id": 1, "tu": ["bộ mạch", "mạch", "board", "mainboard", "main", "pcb"], "ngay_cap_nhat": "2026-10-04 18:16:15" },
    { "id": 2, "tu": ["bơm", "pump"], "ngay_cap_nhat": "2026-10-04 18:16:15" }
  ]
}
```

`phien_ban` tăng mỗi lần thêm / sửa / xoá từ khóa hoặc nhóm đồng nghĩa (kể cả xoá).

### 4.10. Công nợ KTV — `GET /v1/cong-no-ktv`

Công nợ theo từng KTV — **cùng công thức, cùng danh sách** với màn "Công nợ" trên app (chỉ KTV đang có tồn kho trong file MISA
import gần nhất).

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `ma_ktv` | Không | Các mã KTV cách nhau dấu phẩy (không phân biệt hoa/thường, tối đa 200) |
| `khu_vuc` | Không | Các mã khu vực, vd `MB1,MB2` |
| `chi_tiet` | Không | `1` = kèm từng mã linh kiện KTV đang giữ — **bắt buộc** có `ma_ktv` (tối đa 20 KTV), nếu không trả 400 `CHI_TIET_CAN_MA_KTV` |

```json
{
  "phien_ban_ton_kho": "2026-10-16 17:30:00",
  "rows": [
    { "ma_ktv": "KTV001", "ten_ktv": "Nguyễn Văn A", "ma_misa": "NVA01", "ten_misa": "Nguyễn Văn A", "khu_vuc_ma": "MB1",
      "tran_cong_no": 5000000, "so_ma_hang": 12, "tong_sl_ton": 30, "sl_ho_tro_0d": 2,
      "cong_no_thuc_te": 3200000, "cong_no_phat_sinh": 450000, "cong_no_da_tru": 120000,
      "cong_no_chot": 3530000, "danh_gia_cong_no": "Binh thuong",
      "chi_tiet": [
        { "ma_linh_kien": "3004030490", "ten_linh_kien": "Bo mạch điều khiển", "sl_ton": 3, "sl_ho_tro_0d": 1, "gia_ktv": 380000, "cong_no": 760000 }
      ] }
  ]
}
```

*(Giá trị minh họa. `chi_tiet` chỉ có khi gọi `chi_tiet=1`.)*

| Trường | Mô tả |
|---|---|
| `tran_cong_no` | Trần công nợ được cấp (VNĐ); null = chưa đặt (coi như 0) |
| `cong_no_thuc_te` | Σ (SL tồn − SL hỗ trợ 0 đồng) × Giá KTV, theo file MISA import gần nhất |
| `cong_no_phat_sinh` | Đơn công nợ đã duyệt SAU lần import gần nhất (chưa có trong file MISA) |
| `cong_no_da_tru` | Đơn "TRỪ CÔNG NỢ" đã thanh toán sau lần import gần nhất |
| `cong_no_chot` | = thực tế + phát sinh − đã trừ — số dùng để xét trần khi đặt đơn công nợ |
| `danh_gia_cong_no` | `Vuot tran` (chốt > trần) / `Canh bao` (> 70% trần) / `Binh thuong` |
| `sl_ho_tro_0d` | Số chiếc được tính công nợ 0 đồng theo chương trình hỗ trợ đang chạy |
| `phien_ban_ton_kho` | Như mục 4.2 — đổi khi có file tồn kho mới; phát sinh/đã trừ vẫn đổi liên tục trong ngày |

Lưu ý: dữ liệu công nợ là thông tin tài chính của KTV — chỉ dùng cho nghiệp vụ, không hiển thị công khai.

**Đồng bộ 4.7 – 4.9**: gọi định kỳ (vd mỗi giờ), so `phien_ban` với lần trước — giống thì bỏ qua, khác thì thay toàn bộ danh sách
đã lưu. Công nợ (4.10) thay đổi liên tục, nên gọi khi cần hiển thị hoặc cache tối đa vài phút.

### 4.11. Thiếu hàng (ticket chờ hàng) — `GET /v1/thieu-hang`

Danh sách ticket "Thiếu hàng đặt mua": đơn linh kiện kho chưa có hàng, Kho đang tìm nguồn / báo ngày dự kiến / xác nhận hàng về.

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `trang_thai` | Không | `mo` (mặc định — ticket còn mở) / `dong` / `tat_ca` |
| `ma` | Không | Các mã LK (tối đa 200) |
| `ma_ktv` | Không | Mã KTV nhận hàng (tối đa 200) |
| `khu_vuc` | Không | Mã khu vực của đơn, vd `MB1,MN2` |
| `cap_nhat_tu` | Không | Chỉ ticket có thao tác mới nhất SAU thời điểm này (`YYYY-MM-DD HH:MM:SS`, giờ VN) — dùng kéo bù thay đổi |
| `after_id`, `limit` | Không | Phân trang con trỏ theo `id` (`limit` mặc định 200, tối đa 500); gọi tiếp với `after_id = next_after_id` tới khi `null` |

```json
{
  "rows": [
    { "id": "TLK-000317", "dat_don_hang_id": "DDH-002653", "ma_linh_kien": "3004030490", "ten_linh_kien": "Bo mạch điều khiển",
      "so_luong": 2, "loai_don": "mua", "loai_de_xuat": "MUA HÀNG", "khu_vuc_ma": "MB1", "trang_thai_don": "Cho hang",
      "nguoi_nhan_ma_ktv": "KTV001", "nguoi_nhan_ten": "Nguyễn Văn A", "case_ids": "SC261003300",
      "ma_yeu_cau_su_co": "SC261003300", "ma_lada": "B1430288",
      "ly_do": "Kho hết hàng", "trang_thai": "Kho da tiep nhan",
      "ngay_tao": "2026-10-16 09:12:30", "ngay_du_kien_co_hang": "2026-10-20", "ngay_hang_ve_thuc_te": null,
      "cap_nhat_luc": "2026-10-16 14:00:00", "kho_du_hang": false }
  ],
  "next_after_id": null
}
```

| Trường | Mô tả |
|---|---|
| `trang_thai` | Trạng thái ticket: `Cho kho xu ly` (Kho chưa nhận) · `Kho da tiep nhan` · `Kho da cap nhat` (đã báo tiến độ) · `Kho xac nhan hang da ve` · `Kho tu choi sai TT` · đóng: `Da ket thuc` / `Da huy bo`. Có thể bổ sung giá trị mới |
| `trang_thai_don` | Trạng thái hiện tại của đơn gốc (vd `Cho hang`, `TN da duyet`, `Da huy`) |
| `ngay_du_kien_co_hang` | Ngày Kho dự kiến có hàng (`YYYY-MM-DD`), null = chưa báo |
| `ngay_hang_ve_thuc_te` | Ngày hàng về thật (`YYYY-MM-DD`) |
| `cap_nhat_luc` | Thời điểm thao tác gần nhất trên ticket |
| `kho_du_hang` | `true` = ticket còn mở và tồn kho công ty (file MISA mới nhất) đã đủ cho đơn này — xét đơn chờ lâu nhất trước |
| `nguoi_nhan_ma_ktv` | null khi người nhận không phải KTV (GS, nhân viên văn phòng, KH lẻ) |
| `ma_yeu_cau_su_co` | Mã ca / mã YCSC khai báo trên đơn gốc (ID CRM) — xem mục 4.15 |
| `ma_lada` | **ID Lada** của đơn gốc, `null` = không nhập. Xem mục 4.15 |

### 4.12. Tồn kho khả dụng — `GET /v1/ton-kho-kha-dung`

Số lượng **còn đặt được** ở kho công ty theo từng khu vực — đúng con số hệ thống dùng để tự duyệt đơn (khác mục 4.3 là tồn
nguyên bản trong file MISA).

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `ma` | **Có** | Các mã LK, tối đa 200 (thiếu → 400 `MISSING_MA`) |
| `khu_vuc` | Không | Các mã khu vực; mặc định mọi khu vực có kho công ty đang hoạt động |

```json
{
  "phien_ban_ton_kho": "2026-10-16 17:30:00",
  "rows": [
    { "ma_linh_kien": "3004030490", "khu_vuc_ma": "MB1", "khu_vuc_ten": "Miền Bắc 1",
      "ton_goc": 25, "dang_giu": 7, "cho_hang": 2, "kha_dung": 18 }
  ]
}
```

| Trường | Mô tả |
|---|---|
| `ton_goc` | Tổng tồn cuối kỳ của mọi kho công ty phục vụ khu vực (file MISA import gần nhất) |
| `dang_giu` | SL các đơn Mua / Công nợ cùng mã + cùng khu vực tạo SAU lần import, chưa từ chối/hủy (kể cả đơn đang chờ duyệt / chờ hàng) |
| `cho_hang` | Phần trong `dang_giu` thuộc đơn đang "Chờ hàng" |
| `kha_dung` | = `ton_goc − dang_giu`; **có thể âm** khi đã đặt vượt tồn ghi nhận. Đơn mới đủ hàng khi `kha_dung ≥ số lượng đặt` |

Mỗi mã trả đủ 1 dòng cho mỗi khu vực (khu vực không có tồn → các số = 0). Đơn "TRỪ CÔNG NỢ" lấy hàng từ tồn của chính KTV
nên không tính vào đây.

---

### 4.13. Danh mục linh kiện rút gọn — `GET /v1/linh-kien/danh-sach`

Mỗi linh kiện 1 dòng, không kèm ảnh / tồn kho (nhẹ hơn mục 4.5) — dùng để kéo cả danh mục về hằng ngày.

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `after_ma` | Không | Con trỏ phân trang (mã cuối trang trước), mặc định trống |
| `limit` | Không | Mặc định 2000, tối đa 5000 |

```json
{
  "rows": [
    { "ma_linh_kien": "3004030490", "ten_linh_kien": "Bo mạch điều khiển", "nhom_lk": "karofi", "phan_loai": "Bo mạch",
      "phan_loai_dac_thu": null, "gia_niem_yet": 350000, "gia_du_phong": 300000, "bat_tat": 1,
      "trang_thai_ma": "Da xac nhan", "ma_chuan": null, "ngay_cap_nhat": "2026-10-20 09:12:00" }
  ],
  "next_after_ma": "3004030490"
}
```

`next_after_ma = null` = đã hết dữ liệu.

---

### 4.14. Danh bạ kho / KTV — `GET /v1/danh-ba-kho`

Không tham số. Trả toàn bộ kho công ty và mọi mã KTV.

```json
{
  "kho_cong_ty": [ { "ma": "6803", "ten": "Kho 6803 - Q2 HCM", "bat_tat": 1 } ],
  "ktv": [
    { "ma_ktv": "toannv.mb", "ma_misa": "CTV0015", "ten": "Nguyễn Văn Toàn", "vai_tro_ktv": "KTV",
      "khu_vuc_ma": "MB3", "khu_vuc_ten": "Miền Bắc 3", "dang_lam": 1 }
  ]
}
```

| Trường | Mô tả |
|---|---|
| `ma_misa` | Mã MISA của KTV = mã kho của KTV trong `/v1/ton-kho?nguon=ktv` (`null` = chưa có mã) |
| `dang_lam` | `1` = mã đang hoạt động và tài khoản không bị khoá; `0` = mã đã tắt hoặc tài khoản bị khoá (nghỉ việc) |

---

### 4.15. Hai loại mã tham chiếu trên đơn: mã ca (ID CRM) và ID Lada

Mỗi đơn đặt linh kiện có thể mang **2 mã tham chiếu độc lập**, cùng được trả ra ở mục 4.1, 4.4, 4.11:

| Trường | Tên nghiệp vụ | Mô tả |
|---|---|---|
| `ma_yeu_cau_su_co` | Mã ca / mã YCSC (ID CRM) | Mã ca sự cố bên hệ DVBH — chính là giá trị truyền vào `id=` của `/v1/case-timeline`. Đơn có thể gắn nhiều ca; danh sách đầy đủ nằm ở `case_ids` (nối bằng dấu phẩy) |
| `ma_lada` | ID Lada | Mã tra cứu trên hệ Lada do người đặt nhập tay khi tạo đơn (chữ in hoa); `null` = đơn không có ID Lada |

Lưu ý khi dùng:

- **Hai trường không thay thế nhau** — một đơn có thể chỉ có mã ca, chỉ có ID Lada, hoặc cả hai. Không suy mã này ra từ mã kia.
- Với một số loại đề xuất (công nợ, "HỖ TRỢ…"), hệ thống bắt buộc phải có **ít nhất 1 trong 2** mã — nên khi cần tra cứu chắc chắn có kết quả,
  hãy đọc cả hai trường thay vì chỉ `ma_yeu_cau_su_co` / `case_ids`.
- `case_ids` (mục 4.1, 4.4) là **các mã ca gắn với đơn** (gồm ca chính + ca bổ sung), có thể chứa nhiều giá trị; `ma_yeu_cau_su_co` là mã ca
  khai báo gốc trên đơn. Nếu cần tra 1 ca, dùng `/v1/case-timeline` (tự gộp cả 2 nguồn liên kết ca).
- `ma_lada` viết dạng chữ HOA; so sánh không phân biệt hoa/thường khi đối chiếu với hệ thống của bạn.

---

### 4.16. Đơn lõi lọc KH trả góp theo ca — `POST /v1/don-loi-loc`

Dùng cho hệ DVBH (menu "QL NSKX", đồng bộ thủ công). Body JSON:

```json
{ "case_ids": ["SC261003476", "SC261003410"], "lada": [["LD12345", "SC261003410"]] }
```

- `case_ids` (bắt buộc, ≤ 1000) — mã ca cần kiểm tra. `lada` (tuỳ chọn) — các cặp `[ID Lada, mã ca]` để khớp cả đơn chỉ khai ID Lada.
- Trả `{ rows: [{ case_id, don: [{ don_id, ma_lk, ten_lk, loai_de_xuat, so_luong_de_xuat, trang_thai_hien_tai, ngay_tao }] }] }` — mọi
  mã ca gửi lên đều có 1 dòng (`don: []` = chưa có đơn).
- Chỉ tính đơn loại đề xuất chứa "HỖ TRỢ NGOÀI BẢO HÀNH TG12" (TG12-NSKX / TG12-NPP), **bỏ đơn `TN tu choi` / `Tu choi` / `Da huy`**.
  Ca khớp qua `dat_don_case`, `ma_yeu_cau_su_co` hoặc `ma_lada`.

### 4.17. Đặt linh kiện qua API — `POST /v1/dat-hang`

**Điều kiện:** khóa API phải được quản trị viên gán **"Tài khoản đặt hàng"** (Cài đặt › API đối tác). Đơn tạo qua API được ghi là
do tài khoản đó đặt và đi **đúng quy trình như khi tài khoản đó bấm "Tạo đơn" trên app**: giá niêm yết / chiết khấu, kiểm tra tồn kho
công ty theo khu vực, trần công nợ, tự duyệt, tự gom phiếu xuất kho, thông báo. Quyền theo tài khoản: tài khoản **KTV** chỉ đặt cho
chính mình; tài khoản **Tác nghiệp / Giám sát / Admin** đặt hộ được mọi KTV. Khóa chưa gán → 403 `KEY_CHUA_DUOC_CAP_QUYEN_DAT_HANG`.

Body JSON (UTF-8):

```json
{
  "ma_yeu_cau": "DH-2026-000123",
  "ma_ktv": "and.mn2",
  "ghi_chu": "Đơn từ hệ thống X",
  "don_hang": [
    { "ma_lk": "LK-DEMO-001", "loai_de_xuat": "MUA HÀNG", "so_luong": 2, "ghi_chu": "…" },
    { "ma_lk": "3003020204", "loai_de_xuat": "CÔNG NỢ", "so_luong": 1, "chinh_sach": "Trong CSBH", "ma_yeu_cau_su_co": "SC261003476" }
  ]
}
```

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `email_nguoi_dat` | Không | Chỉ khóa được bật **"đặt thay đúng người bấm"**: đơn ghi là do chính tài khoản này đặt (theo quyền của tài khoản; phải có trên app, đã duyệt, không khoá). Bỏ trống = tài khoản đặt hàng gán cố định. Khóa chưa bật mà gửi → 403 `KEY_KHONG_DUOC_DAT_THAY_NGUOI_DUNG`; tài khoản không hợp lệ → 403 `TAI_KHOAN_DAT_HANG_KHONG_TON_TAI` / `_BI_KHOA` / `_CHUA_DUYET`. Áp dụng cả `/kiem-tra`. |
| `ma_yeu_cau` | Có (≤ 48 ký tự) | Mã đơn phía đối tác, **chống tạo trùng**: gửi lại cùng mã → trả phiếu đã tạo (`200`, `trung_lap: true`), không tạo thêm. Gặp lỗi mạng cứ gửi lại cùng mã. |
| `email_nhan_hang` / `ma_ktv` / `ma_misa` | Không | Người nhận hàng (ưu tiên theo thứ tự). Bỏ trống cả 3 = tài khoản đặt hàng tự nhận. Không tìm thấy → 400 `KHONG_TIM_THAY_NGUOI_NHAN`. |
| `kh_le_sdt` | Không | Chỉ khi người nhận là tài khoản nhóm KH lẻ — SĐT khách. |
| `don_hang[]` | Có (1–100 dòng) | Mỗi dòng 1 đơn. Mã combo được tách thành từng linh kiện thành phần như trên app. |
| `don_hang[].ma_lk` | Có | Mã linh kiện (mã đã đổi tự quy về mã chuẩn). |
| `don_hang[].loai_de_xuat` | Có | Đúng tên trong `GET /v1/loai-de-xuat` (không phân biệt hoa/thường). **Không hỗ trợ loại TRẢ HÀNG** (`TRA_HANG_KHONG_HO_TRO_QUA_API`). |
| `don_hang[].so_luong` | Có | Số nguyên ≥ 1 (≤ 10.000). |
| `chinh_sach`, `ma_yeu_cau_su_co`, `ma_lada` | Theo loại | Loại CÔNG NỢ bắt buộc chính sách + mã YCSC hoặc ID Lada; loại "HỖ TRỢ" bắt buộc mã YCSC / ID Lada. |
| `ghi_chu`, `yeu_cau_hoa_don`, `tt_mail_duyet`, `tt_khach_hang`, `uu_tien` (bool), `doi_tac_ma` | Không | Như các ô cùng tên trên form tạo đơn. |

Kết quả `201`:

```json
{
  "id": "TN-000157",
  "ket_qua": { "Cho thanh toan": 1 },
  "dong": [{ "id": "DDH-000174", "ten": "\"Board … (x2)\"", "trang_thai": "Cho thanh toan",
             "ly_do": "Tự động: kho công ty khu vực MN3 còn 0, đặt 2 — thiếu hàng, cần chuyển tiền trước", "pxk": "PMH-000033" }],
  "phieu": [{ "id": "PMH-000033", "trang_thai": "Dang tao phieu", "trang_thai_chuyen_tien": "Cho KTV chuyen", "so_tien_can_chuyen": 1700000, "…": "…" }],
  "quy_du": { "ktv": 0, "kh": null },
  "nguoi_nhan_hang": "ktv@…"
}
```

`trang_thai` từng đơn: `TN da duyet` (tự duyệt, đã vào phiếu xuất), `Cho thanh toan` (kho thiếu, KTV chuyển tiền trước), `Cho hang`
(chờ hàng — Kho xử lý), `Cho GS duyet` (vượt trần công nợ), `Cho TBP xac nhan` (linh kiện đặc thù). Lỗi (không tạo gì): 400 / 403 / 409
kèm `error` — vd `MA_LK_NOT_FOUND` (+`ma_lk`), `LOAI_DE_XUAT_KHONG_HOP_LE` (+`dong`), `KTV_CHUA_CO_MA_MISA`, `NGUOI_NHAN_HANG_DA_TAT`,
`FORBIDDEN_ROLE` (tài khoản đặt hàng không được đặt hộ), 409 có `loi[]` khi dòng bị chặn (giá 0, chưa có mã MISA cho đơn công nợ…).

**Kiểm tra trước — `POST /v1/dat-hang/kiem-tra`:** cùng body (không cần `ma_yeu_cau`), **không ghi gì**. Trả `loi_phieu` (lỗi cấp phiếu,
`null` = ổn) + `dong[]` mỗi dòng `trang_thai` dự kiến, `loi`/`thong_diep`, `ton` (tồn kho), `thay_the` (gợi ý linh kiện tương đương còn hàng).

**Tra cứu — `GET /v1/dat-hang`:** `?id=<mã phiếu>` hoặc `?ma_yeu_cau=<mã>` hoặc `?tu_ngay=YYYY-MM-DD&den_ngay=YYYY-MM-DD` (≤ 31 ngày,
≤ 500 phiếu). Chỉ trả phiếu do **chính khóa này** tạo. Mỗi phiếu: `id, ma_yeu_cau, ngay_tao, nguoi_nhan_hang, ghi_chu, don[]`; mỗi đơn:
`id, ma_lk, ten_lk, loai_de_xuat, so_luong_de_xuat, so_luong_thuc_xuat, gia_de_xuat, gia_chot, trang_thai, ma_yeu_cau_su_co, ma_lada,
pxk_id, pxk_trang_thai, pxk_trang_thai_chuyen_tien, pxk_so_tien_can_chuyen, ma_van_don, thieu_hang_trang_thai, ngay_du_kien_co_hang`.
Lịch sử xử lý chi tiết theo mã ca: mục 4.1.

**Danh mục loại đề xuất — `GET /v1/loai-de-xuat`:** `rows: [{ ten, nhom, loai_don, dat_qua_api }]`.

Hủy đơn / chuyển tiền chưa có API — thao tác trên app.

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
