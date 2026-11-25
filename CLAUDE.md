# CLAUDE.md — linh-kien-app (Đặt mua linh kiện, bản RÚT GỌN)

> File này chỉ giữ luật chính + chỉ đường (giữ **dưới 10 KB** — app chủ trên đám mây đọc mọi kho).
> **Chi tiết đầy đủ** (từng tính năng, quyết định đã chốt, lịch sử): [`CLAUDE-full.md`](CLAUDE-full.md) —
> mở khi cần đụng tới mảng tương ứng (tìm theo từ khóa: tên route, tên bảng, mã lỗi, phiên bản `v1.xxx`).
> **Quy ước ghi**: tính năng / quyết định mới → ghi chi tiết vào `CLAUDE-full.md`; ở đây chỉ thêm 1 dòng khi đó là LUẬT CHUNG mới.

## Hệ thống là gì

Hệ Cloudflare Workers (Hono) + D1 độc lập, tách từ module "Đặt mua linh kiện" của hệ DVBH gốc (2026-08-19).
Luồng: đặt đơn linh kiện → tự duyệt / chờ hàng / chờ thanh toán → phiếu xuất kho (PXK) → chuyển tiền / quỹ KTV →
Kế toán chốt MISA → Kho xuất → KTV nhận. Kèm: Thiếu hàng, Hàng trả, Công nợ, Bảng giá, Quỹ & chuyển tiền, Vi phạm/SLA.
Điểm nối hệ khác: `CLAUDE-full.md` + `docs/HUONG_DAN_API_DOI_TAC_LINH_KIEN_APP.md`.

## Lệnh

```bash
npm run dev:worker          # wrangler dev, port 8788
npm run dev:frontend        # vite, port 5174
npm run build               # tsc -b + vite build
npm run typecheck --workspace backend
npm run typecheck --workspace frontend
npm run db:migrate:local    # migration vào D1 local
npm run db:migrate:remote   # migration vào D1 THẬT
npm run deploy              # build + wrangler deploy (Worker THẬT)
```
Không có test suite — kiểm bằng typecheck + chạy local.

## Luật bắt buộc

1. **Bump `APP_VERSION`** (`frontend/src/version.ts`, +0.001, sửa tay chuỗi) trước mỗi lần deploy.
2. **Commit trước, deploy sau.** `git add` đúng file đã sửa; commit xong `git push origin` + `git push etx87` (không force-push;
   `etx87` có commit tự động → `git fetch etx87` + `git merge`, không rebase).
3. Mỗi lần đổi code: cập nhật `nhat_ky_lam_viec.md` (mục mới ghi CUỐI file) + `TONG_HOP_LOGIC.md` (+ `Yeu_cau_tong_hop_du_an.md` nếu yêu cầu đổi)
   + mục tương ứng ở `CLAUDE-full.md` — trong CÙNG commit.
4. **Không đẩy bí mật / báo cáo bảo mật lên repo** (repo ETX87 có thể công khai): `docs/BAO_CAO_BAO_MAT_*`, `docs/audit/` nằm trong `.gitignore`.
   Không ghi tài khoản, mật khẩu, khoá, mô tả lỗ hổng vào tài liệu.
5. **Giờ Việt Nam (+7)** cho mọi cột/hiển thị thời gian — dùng lại helper sẵn có.
6. `assets.run_worker_first: ["/api/*"]` trong `wrangler.jsonc` là load-bearing — đừng xoá.
7. Thứ tự mount router có nghĩa: `/api/settings/ktv-lien-he` PHẢI mount trước `/api/settings`.
8. D1 giới hạn 100 tham số/truy vấn → danh sách dài truyền **1 bind JSON** `IN (SELECT value FROM json_each(?))`, không 1 `?` mỗi phần tử.
9. `lib/idCounter.ts` không tự seed — bảng mới dùng `nextSequentialId` phải seed dòng `id_counters` trong migration.
10. Thêm trạng thái vào bảng log có CHECK (`thieu_lk_log`, `dat_don_hang_log`…) = phải rebuild bảng trong migration.
11. Đơn đồng bộ từ app Sửa chữa (`nguon_ngoai`) bị khoá bằng trigger — UPDATE hàng loạt sẽ âm thầm bỏ qua chúng.
12. Không tự tạo tài nguyên Cloudflare/Google mới khi chưa hỏi người dùng.

## Nguồn sự thật duy nhất (sửa 1 chỗ là đổi cả hệ)

| Việc | Nơi |
|---|---|
| Quyết định tự duyệt / chờ hàng / chờ GS / chặn tạo đơn | `backend/src/lib/tuDongDuyet.ts` (`danhGiaPhieu`) |
| Giá, chiết khấu, tiền PXK, nhận diện loại đề xuất | `backend/src/lib/pxkRecalculate.ts` (`tinhToanPxk`) — bản sao FE ở `frontend/.../datMuaLinhKien/helpers.ts`, `useTaoDonForm.ts` |
| Quỹ KTV / cân bằng tiền phiếu | `backend/src/lib/quyKtv.ts` (`canBangPxk`, `phanBoQuy`), khoá quỹ `lib/quyKhoa.ts` |
| Phạm vi xem theo vai trò / khu vực | `backend/src/lib/scopeDatMua.ts` |
| Tồn kho công ty | `backend/src/lib/tonKhoCongTy.ts` (`computeTonKhoChot`) |
| Công nợ KTV | `backend/src/lib/congNoKtv.ts` (`docCongNoTongHop`) |
| Nhóm phiếu (tách theo loại đề xuất / HĐ / quỹ KH) | `backend/src/lib/nhomLoaiDeXuat.ts` |
| Giờ làm việc / SLA | `backend/src/lib/gioLamViec.ts`, `lib/viPham.ts` |
| Hủy đơn cần bộ phận đồng ý | `phanLoaiHuyDon()` cuối `routes/datMuaLinhKien.ts` |
| Bước hiện tại của đơn (FE) | `frontend/.../datMuaLinhKien/LuongDon.tsx` (`viTriDon`) |
| Việc cần làm / badge | `routes/notifications.ts` (`computeDatMuaLkBreakdown`) + FE `datMuaLinhKien/viecCanLam.ts` |
| Nội dung màn "Luồng & logic hệ thống" | `frontend/src/modules/luongHeThong/noiDung.ts` (tĩnh — đổi luồng thì sửa câu) |

Nhiều hằng / hàm có **bản sao FE ↔ BE** (ghi rõ trong `CLAUDE-full.md`): đổi 1 bên phải đổi bên kia.

## Vai trò

`vai_tro` ∈ Admin | QC | Giam sat + cờ `la_*` (KTV, Vệ tinh, Kho, Kế toán, TN, TBP, View, Mua hàng, NV sửa chữa). Kế toán làm thay TN
(`middleware/loadUser.ts`). Chi tiết: `CLAUDE-full.md` mục "Auth & vai trò".

## Giao diện

- Mọi UI theo `DESIGN_GUIDELINES.md` (thắng `DESIGN_SYSTEM.md` về màu): không hard-code hex (thêm token ở `frontend/src/styles/tokens.css`),
  tối đa 1 nút primary/vùng, nền trắng, bảng 1 dòng không xuống dòng.
- Bảng dữ liệu kiểu Excel (lọc + sắp xếp trên tiêu đề, lọc phía server) — `lib/locCot.ts` + `components/ui/LocCot.tsx`.
- Bộ lọc mặc định chọn nhiều (checkbox). Màn chi tiết: luồng quy trình ngang + "▾ Xem chi tiết".
- Đa ngôn ngữ: `t("câu tiếng Việt")`, chạy `node frontend/scripts/kiem-tra-dich.mjs`.

## Tài liệu

| File | Nội dung |
|---|---|
| `CLAUDE-full.md` | Toàn bộ chi tiết kỹ thuật + quyết định đã chốt theo từng tính năng |
| `TONG_HOP_LOGIC.md` | Logic nghiệp vụ đang chạy thật |
| `nhat_ky_lam_viec.md` | Nhật ký từng đợt (mới nhất ở cuối) |
| `Yeu_cau_tong_hop_du_an.md` | Đặc tả yêu cầu (vai trò SRS) |
| `DEPLOY.md`, `DESIGN_GUIDELINES.md` | Deploy, giao diện |
| `docs/HUONG_DAN_API_DOI_TAC_LINH_KIEN_APP.md` | API cho đối tác |

## Nhận việc từ Trợ lý Mây

- Nhãn `may:phan-tich` = chỉ ĐỌC mã soạn BRD, không sửa. Nhãn `may:tu-sua` = sửa ĐÚNG phạm vi issue `MAY-xxxxx`
  (BRD đã duyệt lưu vào `docs/yeu-cau/MAY-xxxxx.md`).
- Trước PR: `npm run build` phải xanh. Nhánh `may/may-xxxxx`, PR vào `main`, tiêu đề bắt đầu bằng mã, mô tả tiếng Việt
  (nguyên nhân · cách sửa · cách thử), ghi `Closes #<issue>`.
- KHÔNG: sửa secrets / luật bảo mật, deploy trần, đổi tính năng ngoài issue, xoá dữ liệu. Không chắc → bình luận `MÂY: CẦN NGƯỜI` rồi dừng.
  Deploy do workflow `may-deploy` làm sau khi duyệt.
- Làm trong phiên thường mà giải quyết issue Mây đang mở → ghi mã `MAY-xxxxx` ở dòng đầu commit.
- Ba làn xử lý và luật "máy chạy sai luật = lỗi": xem 2 mục cuối file (workflow Mây tự đồng bộ, không sửa tay).

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
