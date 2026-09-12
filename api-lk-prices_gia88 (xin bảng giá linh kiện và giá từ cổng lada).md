# API Bảng giá linh kiện — Tài liệu tích hợp cho đối tác

Tài liệu mô tả cách gọi API để **tải bảng giá linh kiện dưới dạng file Excel (.xlsx)**.

---

## 1. Thông tin chung

| Mục | Giá trị |
|---|---|
| Phương thức | `GET` |
| Endpoint | `https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPricesExcel` |
| Xác thực | API key (do bên cung cấp cấp riêng) |
| Kết quả | File Excel `.xlsx` (tải về trực tiếp) |
| Định dạng lỗi | JSON: `{ "error": "..." }` |

> **Lưu ý:** URL chính xác được xác nhận khi hệ thống deploy. Nếu khác, bên cung cấp sẽ thông báo endpoint đúng.

---

## 2. Tham số

| Tham số | Bắt buộc | Vị trí | Mô tả |
|---|---|---|---|
| `brand` | Có | query | Thương hiệu bảng giá. Giá trị hợp lệ: `3t` hoặc `dmkp`. |
| `key` | Có* | query **hoặc** header | API key. Đặt ở query `?key=...` **hoặc** header `x-api-key: ...`. |

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
  "https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPricesExcel?brand=3t" \
  -o BangGiaLinhKien.xlsx
```

### cURL — key trên query
```bash
curl -L "https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPricesExcel?brand=3t&key=<API_KEY>" \
  -o BangGiaLinhKien.xlsx
```

### Python (requests)
```python
import requests

URL = "https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPricesExcel"
resp = requests.get(URL, params={"brand": "3t"}, headers={"x-api-key": "<API_KEY>"}, timeout=60)
resp.raise_for_status()  # 401/400/500 sẽ ném lỗi
with open("BangGiaLinhKien.xlsx", "wb") as f:
    f.write(resp.content)
print("Đã lưu BangGiaLinhKien.xlsx")
```

### C# (.NET, HttpClient)
```csharp
using var http = new HttpClient();
http.DefaultRequestHeaders.Add("x-api-key", "<API_KEY>");
var url = "https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPricesExcel?brand=3t";
var bytes = await http.GetByteArrayAsync(url);
await File.WriteAllBytesAsync("BangGiaLinhKien.xlsx", bytes);
```

### JavaScript (Node.js 18+)
```javascript
import { writeFile } from "node:fs/promises";

const url = "https://asia-southeast1-b2b-quanlyphidv.cloudfunctions.net/lkPricesExcel?brand=3t";
const res = await fetch(url, { headers: { "x-api-key": "<API_KEY>" } });
if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
await writeFile("BangGiaLinhKien.xlsx", Buffer.from(await res.arrayBuffer()));
```

---

## 5. Kết quả trả về

### Thành công — HTTP 200
- Thân phản hồi là **file Excel `.xlsx`**.
- Header:
  - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `Content-Disposition: attachment; filename="BangGiaLinhKien_<brand>_<YYYY-MM-DD>.xlsx"`

### Cấu trúc file Excel
Sheet `Bảng giá linh kiện`, dòng 1 là tiêu đề. Mỗi dòng dữ liệu ứng với **một (Mã linh kiện + Nhãn hàng)**, lấy bản giá **mới nhất**; các mã đã ẩn không xuất hiện.

| Cột | Ý nghĩa | Kiểu |
|---|---|---|
| Mã linh kiện | Mã định danh linh kiện | Chuỗi |
| Nhãn hàng | Nhãn hàng/đối tác (`Chung` nếu giá chung) | Chuỗi |
| Thiết bị | Thiết bị áp dụng | Chuỗi |
| Tên linh kiện | Tên đầy đủ | Chuỗi |
| Đơn vị nhập | Đơn vị nhập | Chuỗi |
| Đơn vị tính | Đơn vị tính | Chuỗi |
| Giá NY (gồm VAT) | Giá niêm yết | Số |
| Giá KTV (gồm VAT) | Giá kỹ thuật viên | Số |
| Giá dự phòng (gồm VAT) | Giá dự phòng | Số |
| Giá EU (gồm VAT) | Giá EU | Số |
| Ghi chú đặc biệt | Ghi chú (nếu có) | Chuỗi |
| Cấm bán | `Có` / `Không` | Chuỗi |

> **Giá đều ĐÃ GỒM VAT.** API **không** trả giá nhập/giá vốn và lợi nhuận.

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
- Đặt timeout hợp lý (khuyến nghị ≥ 60 giây) vì file có thể chứa vài nghìn dòng.
- Luôn kiểm tra HTTP status trước khi ghi file (tránh lưu nhầm nội dung JSON lỗi thành `.xlsx`).
- Bảo mật API key; nếu nghi lộ, báo bên cung cấp để cấp lại key mới.

---

*Phiên bản tài liệu: 1.0*
