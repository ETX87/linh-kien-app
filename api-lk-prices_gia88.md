# API Bảng giá linh kiện — Tài liệu tích hợp cho đối tác

Tài liệu mô tả cách gọi API để lấy **bảng giá linh kiện dưới dạng JSON**.

---

## 1. Thông tin chung

| Mục | Giá trị |
|---|---|
| Phương thức | `GET` |
| Endpoint | `https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPrices` |
| Xác thực | API key (do bên cung cấp cấp riêng) |
| Kết quả | **JSON** (mặc định). Tuỳ chọn `?format=xlsx` để tải file Excel. |
| Định dạng lỗi | JSON: `{ "error": "..." }` |

> **Lưu ý:** URL chính xác được xác nhận khi hệ thống deploy. Nếu khác, bên cung cấp sẽ thông báo endpoint đúng.

---

## 2. Tham số

| Tham số | Bắt buộc | Vị trí | Mô tả |
|---|---|---|---|
| `brand` | Có | query | Thương hiệu bảng giá. Giá trị hợp lệ: `3t` hoặc `dmkp`. |
| `key` | Có* | query **hoặc** header | API key. Đặt ở query `?key=...` **hoặc** header `x-api-key: ...`. |
| `format` | Không | query | `json` (mặc định) hoặc `xlsx` (tải file Excel). |

*Bắt buộc gửi key ở một trong hai vị trí. **Khuyến nghị dùng header** `x-api-key` để key không xuất hiện trên URL/log.

---

## 3. Xác thực (API key)

- Bên cung cấp sẽ gửi cho đối tác **một API key bí mật** qua kênh an toàn (không nằm trong tài liệu này).
- Mỗi request phải kèm key. Sai/thiếu key → trả về **HTTP 401**.
- Vui lòng **không công khai** key (không đưa lên frontend, không commit vào mã nguồn công khai).

---

## 4. Ví dụ gọi

### cURL — key trên header (khuyến nghị)
```bash
curl -L \
  -H "x-api-key: <API_KEY>" \
  "https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPrices?brand=3t"
```

### Python (requests)
```python
import requests

URL = "https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPrices"
resp = requests.get(URL, params={"brand": "3t"}, headers={"x-api-key": "<API_KEY>"}, timeout=60)
resp.raise_for_status()          # 401/400/500 sẽ ném lỗi
data = resp.json()
print("Số mã:", data["count"])
for it in data["items"]:
    print(it["ma"], it["nhanHang"], it["tenLinhKien"], it["giaEU"])
```

### C# (.NET, HttpClient)
```csharp
using var http = new HttpClient();
http.DefaultRequestHeaders.Add("x-api-key", "<API_KEY>");
var url = "https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPrices?brand=3t";
var json = await http.GetStringAsync(url);
// Parse bằng System.Text.Json / Newtonsoft.Json tuỳ dự án
```

### JavaScript (Node.js 18+)
```javascript
const url = "https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPrices?brand=3t";
const res = await fetch(url, { headers: { "x-api-key": "<API_KEY>" } });
if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
const data = await res.json();
console.log(data.count, data.items[0]);
```

### Lấy file Excel (nếu cần)
```bash
curl -L -H "x-api-key: <API_KEY>" \
  "https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPrices?brand=3t&format=xlsx" \
  -o BangGiaLinhKien.xlsx
```

---

## 5. Kết quả trả về (JSON)

HTTP 200, `Content-Type: application/json`. Cấu trúc:

```json
{
  "brand": "3t",
  "count": 2682,
  "generatedAt": "2026-09-12T03:20:00.000Z",
  "currency": "VND",
  "note": "Giá đã gồm VAT. Không bao gồm giá nhập/lợi nhuận.",
  "items": [
    {
      "ma": "2002010001",
      "nhanHang": "A059",
      "thietBi": "Lọc nước",
      "tenLinhKien": "Thân vỏ màng 1812 trắng",
      "donViNhap": "PC",
      "donViTinh": "PC",
      "giaNY": 35700,
      "giaKTV": 23400,
      "giaDuPhong": 18000,
      "giaEU": 35700,
      "ghiChuDacBiet": "",
      "camBan": false
    }
  ]
}
```

### Trường trong mỗi phần tử `items[]`

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `ma` | string | Mã linh kiện |
| `nhanHang` | string | Nhãn hàng/đối tác (`Chung` nếu giá chung) |
| `thietBi` | string | Thiết bị áp dụng |
| `tenLinhKien` | string | Tên đầy đủ |
| `donViNhap` | string | Đơn vị nhập |
| `donViTinh` | string | Đơn vị tính |
| `giaNY` | number \| null | Giá niêm yết (gồm VAT) |
| `giaKTV` | number \| null | Giá kỹ thuật viên (gồm VAT) |
| `giaDuPhong` | number \| null | Giá dự phòng (gồm VAT) |
| `giaEU` | number \| null | Giá EU (gồm VAT) |
| `ghiChuDacBiet` | string | Ghi chú (nếu có) |
| `camBan` | boolean | `true` = cấm bán |

- Mỗi phần tử ứng với **một (Mã linh kiện + Nhãn hàng)**, lấy bản giá **mới nhất**; các mã đã ẩn không xuất hiện.
- **Giá đều ĐÃ GỒM VAT**, đơn vị **VND**. Giá thiếu dữ liệu trả `null`.
- API **không** trả giá nhập/giá vốn và lợi nhuận.

---

## 6. Mã lỗi

| HTTP | Thân phản hồi | Nguyên nhân | Cách xử lý |
|---|---|---|---|
| 401 | `{ "error": "unauthorized (thiếu/sai API key)" }` | Thiếu hoặc sai `key` | Kiểm tra lại API key / vị trí gửi key |
| 400 | `{ "error": "invalid brand — dùng ?brand=3t hoặc ?brand=dmkp" }` | Thiếu/sai `brand` | Truyền `brand=3t` hoặc `brand=dmkp` |
| 500 | `{ "error": "..." }` | Lỗi hệ thống tạm thời | Thử lại sau; nếu lặp lại, liên hệ bên cung cấp |

---

## 7. Khuyến nghị sử dụng

- Dữ liệu bảng giá cập nhật theo thời gian thực; đối tác nên **tải định kỳ** (ví dụ mỗi ngày/mỗi ca) thay vì gọi liên tục.
- Đặt timeout hợp lý (khuyến nghị ≥ 60 giây) vì danh sách có thể vài nghìn dòng.
- Luôn kiểm tra HTTP status trước khi parse JSON.
- Bảo mật API key; nếu nghi lộ, báo bên cung cấp để cấp lại key mới.

---

*Phiên bản tài liệu: 2.0 (JSON)*
